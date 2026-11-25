// app/ingresar.html
import { supabase } from '../supabase.js';
import { loadProfile } from '../auth-guard.js';
import { PAGES, go, safeNext } from '../paths.js';
import { showMessage, hideMessage } from '../messages.js';

const form = document.querySelector('#login-form');
const message = document.querySelector('#form-message');
const button = form.querySelector('button[type="submit"]');
const params = new URLSearchParams(window.location.search);

// Después de entrar se vuelve a la página que se quería abrir
// (p. ej. un enlace a una recolecta), si es una página de app/.
const next = safeNext(params.get('next'));

function goAfterLogin(profile) {
  go(profile.must_change_password ? PAGES.changePassword : next);
}

// Mensajes de Supabase traducidos. Se compara por código, no por texto,
// porque el texto en inglés puede cambiar entre versiones.
function errorText(error) {
  if (error.code === 'invalid_credentials') return 'El correo o la contraseña no son correctos.';
  if (error.code === 'over_request_rate_limit' || error.status === 429) {
    return 'Demasiados intentos seguidos. Espere unos minutos y vuelva a intentarlo.';
  }
  if (error.code === 'user_banned')
    return 'Esta cuenta está bloqueada. Consulte con la persona administradora.';
  if (error.name === 'AuthRetryableFetchError')
    return 'No hay conexión con el servidor. Revise su internet.';
  return 'No se pudo iniciar sesión. Inténtelo de nuevo.';
}

// Mensaje cuando auth-guard.js trajo a la persona aquí.
if (params.get('next')) {
  showMessage(message, 'Inicie sesión para continuar.', 'info');
}

// Si ya tiene una sesión abierta y válida, no se le pide entrar otra vez.
const current = await loadProfile();
if (current) goAfterLogin(current.profile);

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  hideMessage(message);

  const email = form.email.value.trim();
  const password = form.password.value;
  if (!email || !password) {
    showMessage(message, 'Escriba su correo y su contraseña.');
    return;
  }

  button.disabled = true;
  button.textContent = 'Entrando…';

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    showMessage(message, errorText(error));
    button.disabled = false;
    button.textContent = 'Iniciar sesión';
    form.password.value = '';
    form.password.focus();
    return;
  }

  // La contraseña es correcta, pero la cuenta puede estar desactivada.
  const session = await loadProfile();
  if (!session) {
    await supabase.auth.signOut({ scope: 'local' });
    showMessage(message, 'Esta cuenta no está activa. Consulte con la persona administradora.');
    button.disabled = false;
    button.textContent = 'Iniciar sesión';
    return;
  }

  goAfterLogin(session.profile);
});
