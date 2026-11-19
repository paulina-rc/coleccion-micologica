-- =====================================================================
-- 02_security.sql · Colección Micológica UNED (CITTED)
-- Quién puede leer y escribir qué (RLS), cuentas, historial,
-- notificaciones y permisos del bucket de fotos.
--
-- Se corre después de 01_schema.sql. Se puede volver a correr:
-- borra las políticas anteriores y las crea de nuevo.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. ¿Quién es quien está conectado?
-- security definer: leen profiles saltándose RLS, así una política
-- de profiles puede usarlas sin entrar en un ciclo infinito.
-- Una cuenta desactivada (is_active = false) deja de ser "staff"
-- aunque tenga la sesión abierta.
-- ---------------------------------------------------------------------
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and is_active
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and is_active and role = 'admin'
  );
$$;


-- ---------------------------------------------------------------------
-- 2. Cuentas
-- El administrador crea la cuenta en el panel de Supabase
-- (Authentication → Users → Add user). Este trigger crea su perfil
-- como Profesor y con cambio de contraseña obligatorio.
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.email));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- La página cambiar-contrasena.html la llama después de cambiar la
-- contraseña con Supabase Auth. Solo toca el perfil propio.
create or replace function public.mark_password_changed()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.profiles
  set must_change_password = false
  where id = auth.uid();
$$;


-- ---------------------------------------------------------------------
-- 3. Reglas fijas de la recolecta
-- code y qr_token forman la URL impresa en el QR: si cambian, la
-- etiqueta deja de funcionar. Por eso no se pueden modificar.
-- También fija quién creó el registro y la fecha de publicación.
-- ---------------------------------------------------------------------
create or replace function public.protect_specimen()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(auth.uid(), new.created_by);
    new.updated_by := new.created_by;
  else
    if new.code is distinct from old.code or new.qr_token is distinct from old.qr_token then
      raise exception 'El código y la clave del QR de una recolecta no se pueden cambiar.';
    end if;
    new.created_by := old.created_by;
    new.updated_by := coalesce(auth.uid(), new.updated_by);
  end if;

  if new.publication_status = 'published' then
    if tg_op = 'INSERT' or old.publication_status <> 'published' then
      new.published_at := now();
    else
      new.published_at := old.published_at;
    end if;
  else
    new.published_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists protect_specimen on public.specimens;
create trigger protect_specimen
  before insert or update on public.specimens
  for each row execute function public.protect_specimen();


-- ---------------------------------------------------------------------
-- 4. Historial de cambios y notificaciones
-- Cada cambio en una recolecta (o en sus descripciones, créditos y
-- fotos) queda en change_logs: quién, qué, cuándo, antes y después.
-- Si quien cambia no es quien registró la recolecta, se le avisa.
-- ---------------------------------------------------------------------
create or replace function public.log_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old         jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_new         jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  v_row         jsonb := coalesce(v_new, v_old);
  v_specimen_id bigint;
  v_code        text;
  v_owner       uuid;
  v_action      public.change_action;
  v_log_id      bigint;
  v_editor      text;
  v_section     text;
begin
  -- Un UPDATE que no cambió nada real (solo updated_at) no se registra
  if tg_op = 'UPDATE'
     and (v_old - array['updated_at', 'updated_by']) = (v_new - array['updated_at', 'updated_by']) then
    return null;
  end if;

  v_specimen_id := case when tg_table_name = 'specimens'
                        then (v_row ->> 'id')::bigint
                        else (v_row ->> 'specimen_id')::bigint end;

  v_action := case tg_op when 'INSERT' then 'created' when 'UPDATE' then 'updated' else 'deleted' end;
  if tg_table_name = 'specimens' and tg_op = 'INSERT' and v_new ->> 'import_id' is not null then
    v_action := 'imported';
  end if;

  select s.code, s.created_by into v_code, v_owner
  from public.specimens s where s.id = v_specimen_id;
  v_code := coalesce(v_code, v_row ->> 'code');

  insert into public.change_logs (table_name, specimen_id, specimen_code, action, changed_by, old_data, new_data)
  values (tg_table_name, v_specimen_id, v_code, v_action, auth.uid(), v_old, v_new)
  returning id into v_log_id;

  if tg_op <> 'DELETE' and v_owner is not null and auth.uid() is not null and v_owner <> auth.uid() then
    select coalesce(full_name, 'Otra persona') into v_editor
    from public.profiles where id = auth.uid();

    v_section := case tg_table_name
      when 'specimens'          then 'los datos generales'
      when 'field_descriptions' then 'el registro de campo'
      when 'lab_descriptions'   then 'la observación de laboratorio'
      when 'person_specimen'    then 'los créditos'
      when 'photos'             then 'las fotografías'
    end;

    insert into public.notifications (recipient_id, specimen_id, change_log_id, message)
    values (v_owner, v_specimen_id, v_log_id,
            format('%s modificó %s de la recolecta %s.', v_editor, v_section, v_code));
  end if;

  return null;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['specimens', 'field_descriptions', 'lab_descriptions', 'person_specimen', 'photos'] loop
    execute format('drop trigger if exists log_change on public.%I', t);
    execute format(
      'create trigger log_change after insert or update or delete on public.%I
         for each row execute function public.log_change()', t);
  end loop;
end;
$$;


-- ---------------------------------------------------------------------
-- 5. Permisos sobre las tablas
-- Los visitantes sin cuenta (anon) no tocan ninguna tabla: solo pueden
-- llamar a las funciones de 03_public_functions.sql.
-- ---------------------------------------------------------------------
-- Los usuarios con sesión reciben acceso explícito a las tablas.
-- No se depende de la opción "Grant API access to new tables
-- automatically" del proyecto: RLS decide qué filas puede tocar cada uno.
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;
alter default privileges in schema public revoke all on tables    from anon;
alter default privileges in schema public revoke all on sequences from anon;

-- El historial solo lo escriben los triggers
revoke insert, update, delete on public.change_logs from authenticated;

-- De una notificación, el usuario solo puede marcarla como leída
revoke insert, update, delete on public.notifications from authenticated;
grant update (is_read) on public.notifications to authenticated;


-- ---------------------------------------------------------------------
-- 6. Políticas RLS
-- Primero se borran todas las existentes, para poder volver a correr
-- este archivo sin errores ni políticas repetidas.
-- ---------------------------------------------------------------------
do $$
declare
  p record;
begin
  for p in select policyname, tablename from pg_policies where schemaname = 'public' loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end;
$$;

-- Patrón general: el personal activo lee, crea y edita; solo el
-- administrador borra los registros principales.
do $$
declare
  t text;
begin
  foreach t in array array['people', 'taxa', 'trips', 'specimens',
                           'field_descriptions', 'lab_descriptions', 'imports'] loop
    execute format('create policy staff_select on public.%I for select to authenticated using ((select public.is_staff()))', t);
    execute format('create policy staff_insert on public.%I for insert to authenticated with check ((select public.is_staff()))', t);
    execute format('create policy staff_update on public.%I for update to authenticated using ((select public.is_staff())) with check ((select public.is_staff()))', t);
    execute format('create policy admin_delete on public.%I for delete to authenticated using ((select public.is_admin()))', t);
  end loop;

  -- Tablas de relación y fotos: el personal también borra
  -- (quitar un colector de la lista, eliminar una foto mala).
  foreach t in array array['person_specimen', 'person_trip', 'photos', 'selection_specimen'] loop
    execute format('create policy staff_all on public.%I for all to authenticated using ((select public.is_staff())) with check ((select public.is_staff()))', t);
  end loop;
end;
$$;

-- Sitios: el personal los ve; solo el administrador los administra
create policy staff_select on public.sites for select to authenticated
  using ((select public.is_staff()));
create policy admin_all on public.sites for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- Propietarios: solo el administrador (datos personales, Ley 8968)
create policy admin_all on public.site_owners for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- Perfiles: el personal ve los nombres (para el historial);
-- solo el administrador cambia roles o desactiva cuentas.
create policy staff_select on public.profiles for select to authenticated
  using ((select public.is_staff()));
create policy admin_update on public.profiles for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy admin_delete on public.profiles for delete to authenticated
  using ((select public.is_admin()));

-- Selecciones: quien la creó la puede borrar; el administrador, todas
create policy staff_select on public.selections for select to authenticated
  using ((select public.is_staff()));
create policy staff_insert on public.selections for insert to authenticated
  with check ((select public.is_staff()));
create policy staff_update on public.selections for update to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()));
create policy owner_or_admin_delete on public.selections for delete to authenticated
  using ((select public.is_admin()) or (created_by = (select auth.uid()) and (select public.is_staff())));

-- Historial: solo lectura para el personal
create policy staff_select on public.change_logs for select to authenticated
  using ((select public.is_staff()));

-- Notificaciones: cada quien ve y marca solo las suyas
create policy own_select on public.notifications for select to authenticated
  using (recipient_id = (select auth.uid()) and (select public.is_staff()));
create policy own_update on public.notifications for update to authenticated
  using (recipient_id = (select auth.uid()) and (select public.is_staff()))
  with check (recipient_id = (select auth.uid()));


-- ---------------------------------------------------------------------
-- 7. Fotos (Supabase Storage)
-- Bucket público: la foto se ve con su URL, pero la carpeta lleva la
-- clave del QR, así que no se encuentra solo con el código.
-- Máximo 2 MB y solo WebP o JPEG. Solo el personal sube o borra.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', true, 2097152, array['image/webp', 'image/jpeg'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists photos_staff_select on storage.objects;
drop policy if exists photos_staff_insert on storage.objects;
drop policy if exists photos_staff_update on storage.objects;
drop policy if exists photos_staff_delete on storage.objects;

create policy photos_staff_select on storage.objects for select to authenticated
  using (bucket_id = 'photos' and (select public.is_staff()));
create policy photos_staff_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (select public.is_staff()));
create policy photos_staff_update on storage.objects for update to authenticated
  using (bucket_id = 'photos' and (select public.is_staff()));
create policy photos_staff_delete on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and (select public.is_staff()));
