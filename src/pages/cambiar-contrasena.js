// app/cambiar-contrasena.html
// Se usa en dos casos:
//  1. Primer ingreso: la cuenta tiene must_change_password = true
//     (la contraseña temporal la puso la persona administradora).
//  2. Cambio voluntario, desde el menú de la cuenta.
import { supabase } from '../supabase.js';
import { requireSession, signOut } from '../auth-guard.js';
import { PAGES, go, url } from '../paths.js';
import { showMessage, hideMessage } from '../messages.js';

// Debe coincidir con Authentication → Sign In / Providers → Email →
// "Minimum password length" en Supabase. Esa es la validación real
// (en el servidor); esta solo avisa antes de enviar.
const MIN_LENGTH = 10;

const { user, profile } = await requireSession({ passwordPage: true });
const firstLogin = profile.must_change_password;

const form = document.querySelector('#password-form');
const message = document.querySelector('#form-message');
const button = form.querySelector('button[type="submit"]');
const secondary = document.querySelector('#secondary-link');

form.email.value = user.email;
document.querySelector('#password-hint').textContent =
  `Mínimo ${MIN_LENGTH} caracteres, con letras y números.`;

if (firstLogin) {
  document.querySelector('#intro').textContent =
    'Es su primer ingreso. Cambie la contraseña temporal por una que solo usted conozca.';
  // Si no la quiere cambiar ahora, la única salida es cerrar sesión.
  secondary.textContent = 'Cerrar sesión';
  secondary.addEventListener('click', (event) => {
    event.preventDefault();
    signOut();
  });
} else {
  document.querySelector('#intro').textContent = 'Escriba su nueva contraseña.';
  secondary.textContent = 'Volver';
  secondary.href = url(PAGES.home);
}

function validate(password, confirm) {
  if (password.length < MIN_LENGTH)
    return `La contraseña debe tener al menos ${MIN_LENGTH} caracteres.`;
  if (!/[a-zA-Z]/.test(password) || !/\d/.test(password))
    return 'La contraseña debe tener letras y números.';
  if (password !== confirm) return 'Las dos contraseñas no coinciden.';
  return null;
}

function errorText(error) {
  if (error.code === 'same_password')
    return 'La contraseña nueva debe ser distinta de la anterior.';
  if (error.code === 'weak_password')
    return 'La contraseña es muy débil. Use una más larga, con letras y números.';
  if (error.code === 'reauthentication_needed')
    return 'Por seguridad, cierre sesión, vuelva a entrar y cambie la contraseña.';
  if (error.name === 'AuthRetryableFetchError')
    return 'No hay conexión con el servidor. Revise su internet.';
  return 'No se pudo cambiar la contraseña. Inténtelo de nuevo.';
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  hideMessage(message);

  const password = form.password.value;
  const problem = validate(password, form.confirm.value);
  if (problem) {
    showMessage(message, problem);
    return;
  }

  button.disabled = true;
  button.textContent = 'Guardando…';

  // 1. Supabase Auth guarda la contraseña nueva (con hash; nunca la vemos).
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    showMessage(message, errorText(error));
    button.disabled = false;
    button.textContent = 'Guardar contraseña';
    return;
  }

  // 2. Se marca el perfil para no volver a pedir el cambio.
  //    Va después del paso 1: si este falla, lo peor que pasa es que
  //    se le vuelva a pedir el cambio, nunca que quede sin cambiarla.
  if (firstLogin) {
    const { error: rpcError } = await supabase.rpc('mark_password_changed');
    if (rpcError) {
      showMessage(
        message,
        'La contraseña se cambió, pero no se pudo actualizar su perfil. Recargue la página.'
      );
      button.disabled = false;
      button.textContent = 'Guardar contraseña';
      return;
    }
  }

  go(PAGES.home);
});
