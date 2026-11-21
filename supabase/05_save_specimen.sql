-- =====================================================================
-- 05_save_specimen.sql · Colección Micológica UNED (CITTED)
-- save_specimen(): guarda el formulario de recolecta completo
-- (app/recolecta-editar.html) en una sola transacción.
--
-- Se corre después de 04_specimen_code.sql. Se puede volver a correr.
-- =====================================================================
--
-- Por qué una función y no varios insert desde JavaScript:
-- el formulario escribe en 6 tablas (specimens, field_descriptions,
-- lab_descriptions, person_specimen, people y taxa). Si el navegador
-- las guardara una por una y se cayera el internet a la mitad, quedaría
-- una recolecta a medias. Dentro de una función, o se guarda todo o no
-- se guarda nada.
--
-- La función es "security invoker" (la opción por defecto): corre con
-- los permisos de quien la llama, así que las políticas RLS se siguen
-- aplicando igual que si escribiera en las tablas directamente. Los
-- triggers de 02 (historial, notificaciones, protect_specimen) también.
--
-- Errores de validación: se lanzan con el código 22023 y un mensaje en
-- español. El formulario muestra ese mensaje tal cual; cualquier otro
-- error se muestra como un error general.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Texto limpio: quita espacios y convierte "" en null.
-- Así un campo que se borró en el formulario queda vacío en la base,
-- no con un texto en blanco.
-- ---------------------------------------------------------------------
create or replace function public.clean_text(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(btrim(p_value), '');
$$;


-- ---------------------------------------------------------------------
-- 2. Guardar la recolecta
-- p_code = null → recolecta nueva (la base le da el código).
-- p_code = 'CITTED-0077' → edita esa recolecta.
-- Devuelve el código, para que la página redirija al detalle.
--
-- Forma de p_data (lo arma src/pages/recolecta-editar.js):
-- {
--   "trip_id": 3, "site_id": 5, "field_code": "M12", "locality": "...",
--   "collected_on": "2026-10-19", "time_start": "08:30", "time_end": "09:10",
--   "environmental_conditions": "...", "latitude": 10.45, "longitude": -84.43,
--   "coordinate_precision": "point", "altitude_min": 1700, "altitude_max": 1800,
--   "substrate": "...", "uses": "...",
--   "identification_text": "¿Xylaria?", "identification_status": "to_verify",
--   "identified_on": null,
--   "taxon": { "order": null, "family": null, "genus": "Xylaria", "species": null, "authority": null },
--   "cabinet": "...", "shelf": "...", "box": "...", "observations": "...",
--   "publication_status": "in_research",
--   "field":  { "body_shape": "...", ... },
--   "lab":    { "pileus": "...", ... },
--   "people": { "collector": ["S. Valerio", "M. Mata"], "identifier": ["M. Mata"], ... }
-- }
-- ---------------------------------------------------------------------
create or replace function public.save_specimen(p_code text, p_data jsonb)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_id        bigint;
  v_code      text;
  v_taxon_id  bigint;
  -- Género con mayúscula inicial y epíteto en minúscula, como se
  -- escriben los nombres científicos ("Xylaria polymorpha").
  v_genus     text := initcap(public.clean_text(p_data #>> '{taxon,genus}'));
  v_species   text := lower(public.clean_text(p_data #>> '{taxon,species}'));
  v_lat       numeric := (p_data ->> 'latitude')::numeric;
  v_lon       numeric := (p_data ->> 'longitude')::numeric;
  v_alt_min   int := (p_data ->> 'altitude_min')::int;
  v_alt_max   int := (p_data ->> 'altitude_max')::int;
  v_start     time := (p_data ->> 'time_start')::time;
  v_end       time := (p_data ->> 'time_end')::time;
  v_role      text;
  v_names     jsonb;
  v_name      text;
  v_person_id bigint;
  v_position  smallint;
  v_keep      bigint[];
  v_field     jsonb := coalesce(p_data -> 'field', '{}'::jsonb);
  v_lab       jsonb := coalesce(p_data -> 'lab', '{}'::jsonb);
begin
  -- RLS ya lo impediría, pero así el mensaje es claro.
  if not public.is_staff() then
    raise exception 'Su cuenta no tiene permiso para guardar recolectas.' using errcode = '42501';
  end if;

  -- ---- Validaciones (las mismas reglas que revisa el formulario) ----
  -- El formulario también valida, pero la regla real vive aquí:
  -- alguien podría llamar a esta función desde la consola.
  if (v_lat is null) <> (v_lon is null) then
    raise exception 'Escriba la latitud y la longitud, o deje las dos vacías.' using errcode = '22023';
  end if;
  if v_lat is not null and (v_lat not between -90 and 90 or v_lon not between -180 and 180) then
    raise exception 'Las coordenadas no son válidas. Use grados decimales, por ejemplo 10.4512 y -84.4321.' using errcode = '22023';
  end if;
  if v_alt_min is not null and v_alt_max is not null and v_alt_max < v_alt_min then
    raise exception 'La altitud máxima no puede ser menor que la mínima.' using errcode = '22023';
  end if;
  if v_start is not null and v_end is not null and v_end < v_start then
    raise exception 'La hora de fin no puede ser anterior a la hora de inicio.' using errcode = '22023';
  end if;
  if (p_data ->> 'collected_on')::date > current_date then
    raise exception 'La fecha de colecta no puede ser posterior a hoy.' using errcode = '22023';
  end if;
  if v_species is not null and v_genus is null then
    raise exception 'Para escribir la especie hay que indicar el género.' using errcode = '22023';
  end if;

  -- ---- Taxón ----
  -- Se busca por género + especie sin importar mayúsculas (igual que el
  -- índice único de taxa). Si no existe, se crea sin revisar
  -- (reviewed = false) para que la especialista lo confirme.
  -- Si ya existe, solo se completan orden, familia o autoridad que
  -- estén vacíos: un formulario no sobrescribe un taxón que comparten
  -- otras recolectas.
  if v_genus is not null then
    select t.id into v_taxon_id
    from public.taxa t
    where lower(t.genus) = lower(v_genus)
      and lower(coalesce(t.species, '')) = lower(coalesce(v_species, ''));

    if v_taxon_id is null then
      insert into public.taxa (taxon_order, family, genus, species, authority)
      values (public.clean_text(p_data #>> '{taxon,order}'),
              public.clean_text(p_data #>> '{taxon,family}'),
              v_genus, v_species,
              public.clean_text(p_data #>> '{taxon,authority}'))
      returning id into v_taxon_id;
    else
      update public.taxa t set
        taxon_order = coalesce(t.taxon_order, public.clean_text(p_data #>> '{taxon,order}')),
        family      = coalesce(t.family,      public.clean_text(p_data #>> '{taxon,family}')),
        authority   = coalesce(t.authority,   public.clean_text(p_data #>> '{taxon,authority}'))
      where t.id = v_taxon_id
        and (t.taxon_order is null or t.family is null or t.authority is null);
    end if;
  end if;

  -- ---- Recolecta ----
  if p_code is null then
    insert into public.specimens (
      trip_id, site_id, field_code, locality, collected_on, time_start, time_end,
      environmental_conditions, latitude, longitude, coordinate_precision,
      altitude_min, altitude_max, substrate, uses,
      identification_text, taxon_id, identification_status, identified_on,
      cabinet, shelf, box, observations, publication_status)
    values (
      (p_data ->> 'trip_id')::bigint, (p_data ->> 'site_id')::bigint,
      public.clean_text(p_data ->> 'field_code'), public.clean_text(p_data ->> 'locality'),
      (p_data ->> 'collected_on')::date, v_start, v_end,
      public.clean_text(p_data ->> 'environmental_conditions'), v_lat, v_lon,
      case when v_lat is not null
           then coalesce((p_data ->> 'coordinate_precision')::public.coordinate_precision, 'point') end,
      v_alt_min, v_alt_max,
      public.clean_text(p_data ->> 'substrate'), public.clean_text(p_data ->> 'uses'),
      public.clean_text(p_data ->> 'identification_text'), v_taxon_id,
      coalesce((p_data ->> 'identification_status')::public.identification_status, 'unidentified'),
      (p_data ->> 'identified_on')::date,
      public.clean_text(p_data ->> 'cabinet'), public.clean_text(p_data ->> 'shelf'),
      public.clean_text(p_data ->> 'box'), public.clean_text(p_data ->> 'observations'),
      coalesce((p_data ->> 'publication_status')::public.publication_status, 'in_research'))
    returning id, code into v_id, v_code;
  else
    -- code y qr_token no se tocan: protect_specimen() no lo permitiría.
    update public.specimens s set
      trip_id                  = (p_data ->> 'trip_id')::bigint,
      site_id                  = (p_data ->> 'site_id')::bigint,
      field_code               = public.clean_text(p_data ->> 'field_code'),
      locality                 = public.clean_text(p_data ->> 'locality'),
      collected_on             = (p_data ->> 'collected_on')::date,
      time_start               = v_start,
      time_end                 = v_end,
      environmental_conditions = public.clean_text(p_data ->> 'environmental_conditions'),
      latitude                 = v_lat,
      longitude                = v_lon,
      coordinate_precision     = case when v_lat is not null
                                      then coalesce((p_data ->> 'coordinate_precision')::public.coordinate_precision, 'point') end,
      altitude_min             = v_alt_min,
      altitude_max             = v_alt_max,
      substrate                = public.clean_text(p_data ->> 'substrate'),
      uses                     = public.clean_text(p_data ->> 'uses'),
      identification_text      = public.clean_text(p_data ->> 'identification_text'),
      taxon_id                 = v_taxon_id,
      identification_status    = coalesce((p_data ->> 'identification_status')::public.identification_status, 'unidentified'),
      identified_on            = (p_data ->> 'identified_on')::date,
      cabinet                  = public.clean_text(p_data ->> 'cabinet'),
      shelf                    = public.clean_text(p_data ->> 'shelf'),
      box                      = public.clean_text(p_data ->> 'box'),
      observations             = public.clean_text(p_data ->> 'observations'),
      publication_status       = coalesce((p_data ->> 'publication_status')::public.publication_status, 'in_research')
    where s.code = p_code
    returning id, code into v_id, v_code;

    if v_id is null then
      raise exception 'No existe la recolecta %.', p_code using errcode = '22023';
    end if;
  end if;

  -- ---- Registro de campo y observación de laboratorio ----
  -- Si la sección viene vacía y todavía no existe, no se crea una fila
  -- vacía (evita una entrada inútil en el historial).
  if exists (select 1 from jsonb_each_text(v_field) where public.clean_text(value) is not null)
     or exists (select 1 from public.field_descriptions where specimen_id = v_id) then
    insert into public.field_descriptions as fd (
      specimen_id, body_shape, color_fresh, color_handled, odor_fresh, odor_collected,
      forest_location, fruiting_body_count, growth_habit, spore_print, humidity)
    values (
      v_id,
      public.clean_text(v_field ->> 'body_shape'),     public.clean_text(v_field ->> 'color_fresh'),
      public.clean_text(v_field ->> 'color_handled'),  public.clean_text(v_field ->> 'odor_fresh'),
      public.clean_text(v_field ->> 'odor_collected'), public.clean_text(v_field ->> 'forest_location'),
      public.clean_text(v_field ->> 'fruiting_body_count'), public.clean_text(v_field ->> 'growth_habit'),
      public.clean_text(v_field ->> 'spore_print'),    public.clean_text(v_field ->> 'humidity'))
    on conflict (specimen_id) do update set
      body_shape          = excluded.body_shape,
      color_fresh         = excluded.color_fresh,
      color_handled       = excluded.color_handled,
      odor_fresh          = excluded.odor_fresh,
      odor_collected      = excluded.odor_collected,
      forest_location     = excluded.forest_location,
      fruiting_body_count = excluded.fruiting_body_count,
      growth_habit        = excluded.growth_habit,
      spore_print         = excluded.spore_print,
      humidity            = excluded.humidity;
  end if;

  if exists (select 1 from jsonb_each_text(v_lab) where public.clean_text(value) is not null)
     or exists (select 1 from public.lab_descriptions where specimen_id = v_id) then
    insert into public.lab_descriptions as ld (
      specimen_id, pileus, hymenophore, stipe, associated_structures, organoleptic, described_on)
    values (
      v_id,
      public.clean_text(v_lab ->> 'pileus'), public.clean_text(v_lab ->> 'hymenophore'),
      public.clean_text(v_lab ->> 'stipe'),  public.clean_text(v_lab ->> 'associated_structures'),
      public.clean_text(v_lab ->> 'organoleptic'), (v_lab ->> 'described_on')::date)
    on conflict (specimen_id) do update set
      pileus                = excluded.pileus,
      hymenophore           = excluded.hymenophore,
      stipe                 = excluded.stipe,
      associated_structures = excluded.associated_structures,
      organoleptic          = excluded.organoleptic,
      described_on          = excluded.described_on;
  end if;

  -- ---- Créditos ----
  -- Solo se tocan los roles que manda el formulario. El fotógrafo se
  -- maneja en el paso 5 (fotos) y no se borra al guardar este formulario.
  -- Un nombre nuevo se crea en people tal como se escribió ("S. Valerio").
  -- En vez de borrar todo y volver a insertar, solo se quita lo que
  -- salió de la lista: así el historial muestra solo los cambios reales.
  for v_role, v_names in select key, value from jsonb_each(coalesce(p_data -> 'people', '{}'::jsonb)) loop
    v_keep := '{}';
    v_position := 0;

    for v_name in select public.clean_text(n) from jsonb_array_elements_text(v_names) as n loop
      continue when v_name is null;

      insert into public.people (credit_name) values (v_name)
      on conflict (credit_name) do nothing;
      select p.id into v_person_id from public.people p where p.credit_name = v_name;

      continue when v_person_id = any (v_keep);  -- el mismo nombre dos veces en un rol
      v_position := v_position + 1;
      v_keep := v_keep || v_person_id;

      insert into public.person_specimen (person_id, specimen_id, role, position)
      values (v_person_id, v_id, v_role::public.person_role, v_position)
      on conflict (person_id, specimen_id, role) do update
        set position = excluded.position
        where public.person_specimen.position is distinct from excluded.position;
    end loop;

    delete from public.person_specimen ps
    where ps.specimen_id = v_id
      and ps.role = v_role::public.person_role
      and not (ps.person_id = any (v_keep));
  end loop;

  return v_code;
end;
$$;


-- ---------------------------------------------------------------------
-- 3. Quién puede ejecutarlas
-- Una función nueva queda abierta a todos por defecto (PUBLIC).
-- 03_public_functions.sql cerró las que existían cuando se corrió,
-- no las nuevas: por eso se cierran aquí otra vez.
-- ---------------------------------------------------------------------
revoke execute on function public.clean_text(text)           from public, anon;
revoke execute on function public.save_specimen(text, jsonb) from public, anon;
grant  execute on function public.clean_text(text)           to authenticated;
grant  execute on function public.save_specimen(text, jsonb) to authenticated;
