// Configuración pública de Supabase.
//
// Estos dos valores SON públicos por diseño: cualquier persona los puede
// ver en el navegador. La protección real de los datos son las políticas
// RLS de supabase/02_security.sql.
//
// Nunca poner aquí la service_role key ni la contraseña de la base.
//
// Son los mismos valores de los secretos SUPABASE_URL y SUPABASE_ANON_KEY
// de GitHub. La URL va sin "/" ni "/rest/v1" al final.

export const SUPABASE_URL = 'https://TU-ID-DE-PROYECTO.supabase.co';
export const SUPABASE_ANON_KEY = 'PEGAR-AQUI-LA-CLAVE-ANONIMA';
