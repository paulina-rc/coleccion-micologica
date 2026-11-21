-- =====================================================================
-- 04_specimen_code.sql · Colección Micológica UNED (CITTED)
-- Código consecutivo de las recolectas nuevas (CITTED-0077, CITTED-0078…).
--
-- Se corre después de 03_public_functions.sql. Se puede volver a correr:
-- si la secuencia ya existe, no la reinicia.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Secuencia del código
-- La base asigna el número, no el navegador. Si dos personas guardan
-- al mismo tiempo, cada una recibe un número distinto; calcular
-- "el último + 1" en JavaScript daría el mismo código a las dos.
--
-- maxvalue 9999: el formato tiene 4 dígitos. Si algún día se llega al
-- límite, la base da un error en vez de crear un código inválido.
--
-- Empieza en 77 porque el Excel del equipo ya usa CITTED-0001 a
-- CITTED-0076 y esas recolectas se importan en el paso 9. Así una
-- recolecta registrada antes de la importación no choca con ellas.
-- Un número que se usó y después se borró no se vuelve a dar: su
-- etiqueta pudo haberse impreso.
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'specimen_code_seq'
  ) then
    create sequence public.specimen_code_seq
      as int minvalue 1 maxvalue 9999 start with 77 no cycle;
  end if;
end;
$$;

-- El código se arma solo al insertar sin código.
-- La importación (paso 9) sí manda su propio código y no usa la secuencia.
alter table public.specimens
  alter column code set default
    'CITTED-' || lpad(nextval('public.specimen_code_seq')::text, 4, '0');

-- Quien guarda una recolecta ejecuta nextval(): necesita este permiso.
-- 02_security.sql solo dio permiso sobre las secuencias que ya existían.
grant usage, select on sequence public.specimen_code_seq to authenticated;
revoke all on sequence public.specimen_code_seq from anon;
