// Cliente de Supabase. Se crea una sola vez y todas las páginas importan
// este mismo objeto: así hay una sola sesión y un solo lugar que cambiar
// si un día se cambia de proveedor.
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    // La sesión se guarda en el navegador y se renueva sola,
    // para no pedir la contraseña en cada página.
    persistSession: true,
    autoRefreshToken: true,
    // No usamos enlaces mágicos ni recuperación por correo (por ahora).
    detectSessionInUrl: false,
  },
});
