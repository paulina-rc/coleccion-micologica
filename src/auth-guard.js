// Protección de las páginas de app/.
//
// Importante: esto NO es la seguridad del sistema. Alguien podría saltarse
// este archivo desde la consola del navegador, pero sin una cuenta activa
// las políticas RLS no le devuelven ni le dejan cambiar ningún dato.
// Este archivo solo evita que una persona vea una página que no le
// corresponde o que siga sin cambiar su contraseña temporal.
import { supabase } from './supabase.js';
import { PAGES, go, currentAppPage } from './paths.js';

// Lee el perfil de la persona conectada.
// Devuelve null si no hay sesión válida o si la cuenta está desactivada.
export async function loadProfile() {
  // getUser() confirma la sesión con el servidor de Supabase.
  // getSession() solo lee el navegador y aceptaría una sesión vencida o revocada.
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;

  // RLS solo deja leer profiles a cuentas activas (is_staff()):
  // una cuenta desactivada recibe 0 filas, sin error.
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, role, is_active, must_change_password')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile || !profile.is_active) return null;
  return { user, profile };
}

// Se llama al inicio de cada página de app/.
// options.passwordPage = true solo en cambiar-contrasena.html.
export async function requireSession(options = {}) {
  const session = await loadProfile();

  if (!session) {
    // Si había una sesión pero la cuenta ya no está activa, se cierra.
    await supabase.auth.signOut({ scope: 'local' });
    go(PAGES.login, { next: currentAppPage() });
    return new Promise(() => {}); // Detiene la página mientras redirige.
  }

  if (session.profile.must_change_password && !options.passwordPage) {
    go(PAGES.changePassword);
    return new Promise(() => {});
  }

  document.body.classList.remove('is-loading');
  return session;
}

// Para mostrar u ocultar botones según el rol. Los permisos reales
// los decide la base de datos (is_admin()).
export function isAdmin(profile) {
  return profile.role === 'admin';
}

export async function signOut() {
  await supabase.auth.signOut();
  go(PAGES.login);
}
