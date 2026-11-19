-- =====================================================================
-- 03_public_functions.sql · Colección Micológica UNED (CITTED)
-- Lo único que puede usar un visitante sin cuenta:
--   public_specimen  → ficha del QR        (/h/?c=CITTED-0001-k7f3q9)
--   public_selection → selección de clase  (/s/?k=xxxxxxxxxx)
--   ping             → mantiene activo el proyecto (keep-alive.yml)
--
-- Las dos primeras usan una LISTA BLANCA: devuelven solo los campos
-- escritos aquí. Nunca coordenadas, propietarios, localidad exacta,
-- ubicación en la colección ni observaciones internas.
-- Se puede volver a correr.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Ficha pública de una recolecta
-- Devuelve null si el formato no es válido, si la clave no coincide o
-- si la recolecta no está publicada. La página muestra lo mismo en los
-- tres casos ("Ficha no disponible"), así no revela si el código existe.
-- ---------------------------------------------------------------------
create or replace function public.public_specimen(p_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_code   text := substring(trim(p_key) from '^(CITTED-[0-9]{4})-[a-z0-9]+$');
  v_token  text := substring(trim(p_key) from '^CITTED-[0-9]{4}-([a-z0-9]+)$');
  v_result jsonb;
begin
  if v_code is null or v_token is null then
    return null;
  end if;

  select jsonb_build_object(
    'code',                  s.code,
    -- Si hay taxón confirmado se muestra el nombre científico;
    -- si no, el texto original del equipo ("¿Xylaria?").
    'name',                  case when s.identification_status in ('genus', 'species') and t.id is not null
                                  then t.scientific_name else s.identification_text end,
    'identification_status', s.identification_status,
    'taxon',                 case when t.id is not null then jsonb_build_object(
                               'order', t.taxon_order, 'family', t.family,
                               'genus', t.genus,       'species', t.species) end,
    'collected_on',          s.collected_on,
    'identified_on',         s.identified_on,
    'province',              si.province,
    'canton',                si.canton,
    'site',                  case when si.allows_public_credit then si.name end,
    'altitude_min',          s.altitude_min,
    'altitude_max',          s.altitude_max,
    'substrate',             s.substrate,
    'environmental_conditions', s.environmental_conditions,
    'uses',                  s.uses,
    'field', (
      select jsonb_build_object(
        'body_shape', fd.body_shape,   'color_fresh', fd.color_fresh,
        'color_handled', fd.color_handled, 'odor_fresh', fd.odor_fresh,
        'odor_collected', fd.odor_collected, 'forest_location', fd.forest_location,
        'fruiting_body_count', fd.fruiting_body_count, 'growth_habit', fd.growth_habit,
        'spore_print', fd.spore_print)
      from public.field_descriptions fd where fd.specimen_id = s.id),
    'lab', (
      select jsonb_build_object(
        'pileus', ld.pileus, 'hymenophore', ld.hymenophore, 'stipe', ld.stipe,
        'associated_structures', ld.associated_structures, 'organoleptic', ld.organoleptic)
      from public.lab_descriptions ld where ld.specimen_id = s.id),
    'people', coalesce((
      select jsonb_agg(jsonb_build_object('name', p.credit_name, 'role', ps.role)
                       order by ps.role, ps.position)
      from public.person_specimen ps
      join public.people p on p.id = ps.person_id
      where ps.specimen_id = s.id), '[]'::jsonb),
    'photos', coalesce((
      select jsonb_agg(jsonb_build_object('path', ph.storage_path, 'kind', ph.kind,
                                          'author', pa.credit_name, 'caption', ph.caption)
                       order by ph.kind, ph.position)
      from public.photos ph
      left join public.people pa on pa.id = ph.author_person_id
      where ph.specimen_id = s.id), '[]'::jsonb)
  )
  into v_result
  from public.specimens s
  left join public.taxa  t  on t.id  = s.taxon_id
  left join public.sites si on si.id = s.site_id
  where s.code = v_code
    and s.qr_token = v_token
    and s.publication_status = 'published';

  return v_result;
end;
$$;


-- ---------------------------------------------------------------------
-- 2. Selección para estudiantes
-- Solo incluye recolectas publicadas. Si la selección venció o la
-- clave no existe, devuelve null. El buscador de la página filtra
-- sobre esta lista (por eso trae orden, familia, género y sustrato).
-- ---------------------------------------------------------------------
create or replace function public.public_selection(p_key text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'name',        se.name,
    'description', se.description,
    'specimens', coalesce((
      select jsonb_agg(jsonb_build_object(
               'key',          s.code || '-' || s.qr_token,   -- para enlazar a /h/
               'code',         s.code,
               'name',         case when s.identification_status in ('genus', 'species') and t.id is not null
                                    then t.scientific_name else s.identification_text end,
               'order',        t.taxon_order,
               'family',       t.family,
               'genus',        t.genus,
               'substrate',    s.substrate,
               'collected_on', s.collected_on,
               'canton',       si.canton,
               'photo',        (select ph.storage_path from public.photos ph
                                where ph.specimen_id = s.id
                                order by ph.kind, ph.position limit 1))
             order by ss.position, s.code)
      from public.selection_specimen ss
      join public.specimens s  on s.id  = ss.specimen_id
      left join public.taxa  t  on t.id  = s.taxon_id
      left join public.sites si on si.id = s.site_id
      where ss.selection_id = se.id
        and s.publication_status = 'published'), '[]'::jsonb)
  )
  from public.selections se
  where se.access_key = trim(p_key)
    and (se.expires_on is null or se.expires_on >= current_date);
$$;


-- ---------------------------------------------------------------------
-- 3. Keep-alive: la GitHub Action la llama una vez al día para que
-- Supabase no pause el proyecto por inactividad (plan gratuito).
-- ---------------------------------------------------------------------
create or replace function public.ping()
returns text
language sql
stable
set search_path = ''
as $$
  select 'ok'::text;
$$;


-- ---------------------------------------------------------------------
-- 4. Quién puede ejecutar cada función
-- Supabase deja todas las funciones abiertas por defecto. Aquí se
-- cierran todas y se abren solo las necesarias.
-- ---------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon, authenticated;

-- Visitantes sin cuenta (y también usuarios con sesión)
grant execute on function public.public_specimen(text)  to anon, authenticated;
grant execute on function public.public_selection(text) to anon, authenticated;
grant execute on function public.ping()                 to anon, authenticated;

-- Usuarios con sesión: las políticas RLS y los valores por defecto
-- de las columnas llaman a estas funciones.
grant execute on function public.is_staff()            to authenticated;
grant execute on function public.is_admin()            to authenticated;
grant execute on function public.generate_token(int)   to authenticated;
grant execute on function public.mark_password_changed() to authenticated;
