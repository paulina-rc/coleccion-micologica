-- =====================================================================
-- 01_schema.sql · Colección Micológica UNED (CITTED)
-- Tablas, tipos, índices y reglas de integridad.
--
-- Se corre UNA sola vez, en un proyecto de Supabase nuevo
-- (SQL Editor → New query → pegar → Run). Después: 02 y 03.
-- Al terminar, RLS queda activado en todas las tablas SIN políticas:
-- nadie puede leer ni escribir nada hasta correr 02_security.sql.
-- =====================================================================

-- pgcrypto genera bytes aleatorios seguros para las claves de los QR.
-- En Supabase ya viene instalada en el esquema "extensions".
create extension if not exists pgcrypto with schema extensions;


-- ---------------------------------------------------------------------
-- 1. Tipos fijos (enum)
-- Un enum impide guardar valores escritos a mano con errores
-- ("publicado", "Publicada"...). Valores en inglés; la interfaz los traduce.
-- ---------------------------------------------------------------------
create type public.user_role             as enum ('admin', 'professor');
create type public.publication_status    as enum ('in_research', 'published');
create type public.identification_status as enum ('unidentified', 'to_verify', 'genus', 'species');
create type public.coordinate_precision  as enum ('point', 'site');
create type public.person_role           as enum ('collector', 'co_investigator', 'identifier', 'describer', 'photographer');
create type public.photo_kind            as enum ('field', 'lab', 'detail');
create type public.change_action         as enum ('created', 'updated', 'deleted', 'imported');


-- ---------------------------------------------------------------------
-- 2. Funciones de apoyo
-- ---------------------------------------------------------------------

-- Clave aleatoria para el QR (ej. "k7f3q9"). El alfabeto quita 0/o, 1/l/i
-- para que nadie se confunda si tiene que escribir la clave a mano.
create or replace function public.generate_token(p_length int default 6)
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := '23456789abcdefghjkmnpqrstuvwxyz';
  bytes  bytea := extensions.gen_random_bytes(p_length);
  result text  := '';
begin
  for i in 0 .. p_length - 1 loop
    result := result || substr(alphabet, (get_byte(bytes, i) % length(alphabet)) + 1, 1);
  end loop;
  return result;
end;
$$;

-- Actualiza updated_at en cada UPDATE (se asigna a las tablas al final).
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;


-- ---------------------------------------------------------------------
-- 3. Usuarios del sistema
-- Supabase Auth guarda correo y contraseña (con hash) en auth.users.
-- Aquí solo va lo propio del sistema: rol y estado.
-- El perfil se crea solo al crear la cuenta (trigger en 02_security.sql).
-- ---------------------------------------------------------------------
create table public.profiles (
  id                   uuid primary key references auth.users (id) on delete cascade,
  full_name            text,
  role                 public.user_role not null default 'professor',
  is_active            boolean not null default true,
  must_change_password boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);


-- ---------------------------------------------------------------------
-- 4. Personas (crédito científico)
-- credit_name se guarda EXACTAMENTE como lo escribe el equipo
-- ("S. Valerio", "M. Mata"): es el crédito de quien encontró el hongo.
-- Una persona no necesita cuenta en el sistema.
-- ---------------------------------------------------------------------
create table public.people (
  id          bigint generated always as identity primary key,
  credit_name text not null unique,
  full_name   text,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);


-- ---------------------------------------------------------------------
-- 5. Sitios y propietarios
-- Los propietarios van en una tabla aparte para que RLS los cierre
-- por completo (solo administrador), sin tocar los datos del sitio.
-- ---------------------------------------------------------------------
create table public.sites (
  id                   bigint generated always as identity primary key,
  name                 text not null unique,
  province             text,
  canton               text,
  district             text,
  latitude             numeric(10,7) check (latitude  between -90  and 90),
  longitude            numeric(10,7) check (longitude between -180 and 180),
  allows_public_credit boolean not null default false,  -- ¿la finca acepta aparecer en la ficha pública?
  notes                text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create table public.site_owners (
  id            bigint generated always as identity primary key,
  site_id       bigint not null references public.sites (id) on delete cascade,
  owner_name    text not null,
  owner_contact text,
  consent_notes text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);


-- ---------------------------------------------------------------------
-- 6. Giras
-- Una gira puede visitar varios sitios: el sitio va en cada recolecta.
-- ---------------------------------------------------------------------
create table public.trips (
  id           bigint generated always as identity primary key,
  name         text,
  started_on   date not null,
  ended_on     date,
  sinac_permit text,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (ended_on is null or ended_on >= started_on)
);

-- Equipo de campo de la gira ("Step", "Mila", "Soro"...), en su orden.
create table public.person_trip (
  person_id bigint not null references public.people (id) on delete cascade,
  trip_id   bigint not null references public.trips (id) on delete cascade,
  position  smallint not null default 1,
  primary key (person_id, trip_id)
);


-- ---------------------------------------------------------------------
-- 7. Taxones
-- Un taxón tiene muchas recolectas. species guarda solo el epíteto
-- ("ostreatus"); el nombre completo se arma solo.
-- reviewed = false hasta que la especialista lo revise.
-- ---------------------------------------------------------------------
create table public.taxa (
  id              bigint generated always as identity primary key,
  taxon_order     text,
  family          text,
  genus           text not null,
  species         text,
  authority       text,
  scientific_name text generated always as (genus || coalesce(' ' || species, ' sp.')) stored,
  reviewed        boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Evita "Pleurotus ostreatus" y "pleurotus Ostreatus" como taxones distintos.
create unique index taxa_genus_species_key
  on public.taxa (lower(genus), lower(coalesce(species, '')));


-- ---------------------------------------------------------------------
-- 8. Importaciones de Excel (para saber de dónde salió cada registro)
-- ---------------------------------------------------------------------
create table public.imports (
  id          bigint generated always as identity primary key,
  file_name   text not null,
  row_count   int,
  notes       text,
  imported_by uuid references public.profiles (id) on delete set null default auth.uid(),
  imported_at timestamptz not null default now()
);


-- ---------------------------------------------------------------------
-- 9. Recolectas: el registro central
-- Una fila = un hallazgo en una gira (no una especie). Dos recolectas
-- pueden tener el mismo taxón; lo único irrepetible es el código.
-- ---------------------------------------------------------------------
create table public.specimens (
  id                       bigint generated always as identity primary key,

  -- Identidad y QR. code y qr_token no cambian nunca (trigger en 02):
  -- forman la URL impresa en la etiqueta.
  code                     text not null unique check (code ~ '^CITTED-[0-9]{4}$'),
  field_code               text unique,                 -- código de campo "M##", si existe
  qr_token                 text not null unique default public.generate_token(6),

  -- Contexto de la colecta
  trip_id                  bigint references public.trips (id) on delete set null,  -- vacío = colecta fuera de gira
  site_id                  bigint references public.sites (id) on delete restrict,
  locality                 text,                        -- sendero, sector ("perezosos", "recintos")
  collected_on             date,
  time_start               time,
  time_end                 time,
  environmental_conditions text,
  latitude                 numeric(10,7) check (latitude  between -90  and 90),
  longitude                numeric(10,7) check (longitude between -180 and 180),
  coordinate_precision     public.coordinate_precision,
  altitude_min             int,
  altitude_max             int,
  substrate                text,
  uses                     text,

  -- Identificación: el texto original del equipo se guarda siempre tal cual
  identification_text      text,                        -- "?", "¿Xylaria?", "Mycena sp."...
  taxon_id                 bigint references public.taxa (id) on delete set null,
  identification_status    public.identification_status not null default 'unidentified',
  identified_on            date,

  -- Ubicación física en la colección del CITTED
  cabinet                  text,
  shelf                    text,
  box                      text,

  observations             text,
  transcriber              text,                        -- "Tabulador" del Excel, tal cual
  import_id                bigint references public.imports (id) on delete set null,

  publication_status       public.publication_status not null default 'in_research',
  published_at             timestamptz,

  created_by               uuid references public.profiles (id) on delete set null,
  updated_by               uuid references public.profiles (id) on delete set null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),

  check (altitude_max is null or altitude_min is null or altitude_max >= altitude_min),
  check (time_end is null or time_start is null or time_end >= time_start)
);

create index specimens_taxon_idx     on public.specimens (taxon_id);
create index specimens_trip_idx      on public.specimens (trip_id);
create index specimens_site_idx      on public.specimens (site_id);
create index specimens_collected_idx on public.specimens (collected_on);


-- Registro de campo (una fila por recolecta, campos de la ficha oficial)
create table public.field_descriptions (
  specimen_id         bigint primary key references public.specimens (id) on delete cascade,
  body_shape          text,   -- forma general del cuerpo fructífero
  color_fresh         text,
  color_handled       text,
  odor_fresh          text,
  odor_collected      text,
  forest_location     text,   -- ubicación en el bosque o sitio
  fruiting_body_count text,   -- texto: el equipo escribe "+100"
  growth_habit        text,
  spore_print         text,   -- mapa espórico
  humidity            text,
  updated_at          timestamptz not null default now()
);

-- Observación en laboratorio (TEXT: el píleo llega a 500+ caracteres)
create table public.lab_descriptions (
  specimen_id           bigint primary key references public.specimens (id) on delete cascade,
  pileus                text,
  hymenophore           text,
  stipe                 text,
  associated_structures text,
  organoleptic          text,
  described_on          date,
  updated_at            timestamptz not null default now()
);

-- Créditos: quién colectó, coinvestigó, identificó, describió, fotografió
create table public.person_specimen (
  person_id   bigint not null references public.people (id) on delete restrict,
  specimen_id bigint not null references public.specimens (id) on delete cascade,
  role        public.person_role not null,
  position    smallint not null default 1,   -- conserva el orden en que el equipo escribe los nombres
  primary key (person_id, specimen_id, role)
);
create index person_specimen_specimen_idx on public.person_specimen (specimen_id);

-- Fotos: el archivo vive en Storage; aquí solo la ruta y sus datos.
-- Ruta: CITTED-0001-k7f3q9/CITTED-0001_field_01.webp
create table public.photos (
  id               bigint generated always as identity primary key,
  specimen_id      bigint not null references public.specimens (id) on delete cascade,
  kind             public.photo_kind not null,
  position         smallint not null default 1,
  storage_path     text not null unique,
  author_person_id bigint references public.people (id) on delete set null,
  caption          text,
  created_by       uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at       timestamptz not null default now(),
  unique (specimen_id, kind, position)
);


-- ---------------------------------------------------------------------
-- 10. Selecciones para estudiantes (grupo de recolectas con su propio QR)
-- ---------------------------------------------------------------------
create table public.selections (
  id          bigint generated always as identity primary key,
  name        text not null,
  description text,
  access_key  text not null unique default public.generate_token(10),
  expires_on  date,
  created_by  uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.selection_specimen (
  selection_id bigint not null references public.selections (id) on delete cascade,
  specimen_id  bigint not null references public.specimens (id) on delete cascade,
  position     smallint not null default 1,
  primary key (selection_id, specimen_id)
);


-- ---------------------------------------------------------------------
-- 11. Historial y notificaciones (los llenan triggers de 02_security.sql)
-- specimen_id no lleva llave foránea a propósito: el historial tiene
-- que sobrevivir aunque la recolecta se borre.
-- ---------------------------------------------------------------------
create table public.change_logs (
  id            bigint generated always as identity primary key,
  table_name    text not null,
  specimen_id   bigint,
  specimen_code text,
  action        public.change_action not null,
  changed_by    uuid references public.profiles (id) on delete set null,
  changed_at    timestamptz not null default now(),
  old_data      jsonb,
  new_data      jsonb
);
create index change_logs_specimen_idx on public.change_logs (specimen_id, changed_at desc);

create table public.notifications (
  id            bigint generated always as identity primary key,
  recipient_id  uuid not null references public.profiles (id) on delete cascade,
  specimen_id   bigint references public.specimens (id) on delete set null,
  change_log_id bigint references public.change_logs (id) on delete cascade,
  message       text not null,
  is_read       boolean not null default false,
  created_at    timestamptz not null default now()
);
create index notifications_recipient_idx on public.notifications (recipient_id, is_read);


-- ---------------------------------------------------------------------
-- 12. updated_at automático y RLS activado en todas las tablas
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  for t in
    select c.table_name
    from information_schema.columns c
    join information_schema.tables tb
      on tb.table_schema = c.table_schema and tb.table_name = c.table_name
    where c.table_schema = 'public'
      and c.column_name = 'updated_at'
      and tb.table_type = 'BASE TABLE'
  loop
    execute format(
      'create trigger set_updated_at before update on public.%I
         for each row execute function public.set_updated_at()', t);
  end loop;

  -- Sin políticas, RLS bloquea todo: es el punto de partida seguro.
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end;
$$;
