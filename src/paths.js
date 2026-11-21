// Rutas internas del sitio.
//
// El sitio vive en /coleccion-micologica/ en GitHub Pages y en otra ruta
// cuando se migre. BASE_URL lo pone Vite según BASE_PATH, así que ninguna
// redirección tiene la ruta escrita a mano.
const BASE = import.meta.env.BASE_URL;

export const PAGES = {
  login: 'app/ingresar.html',
  changePassword: 'app/cambiar-contrasena.html',
  home: 'app/recolectas.html',
  specimenEdit: 'app/recolecta-editar.html',
};

// Formato del código de recolecta. Es el mismo que revisa la base
// (check de specimens.code); si el formato cambia, se cambia en los dos.
export const SPECIMEN_CODE = /^CITTED-[0-9]{4}$/;

export function url(page, params) {
  const query = params ? `?${new URLSearchParams(params)}` : '';
  return `${BASE}${page}${query}`;
}

export function go(page, params) {
  // replace: la página que redirige no queda en el historial,
  // así el botón "Atrás" no devuelve a una página protegida.
  window.location.replace(url(page, params));
}

// Página actual dentro de app/, con su query (p. ej. "recolecta.html?c=CITTED-0001").
// Se usa para volver a ella después de iniciar sesión.
export function currentAppPage() {
  const name = window.location.pathname.split('/').pop();
  return name + window.location.search;
}

// Solo se acepta volver a una página de app/. Si "next" viniera de un
// enlace malicioso (p. ej. https://otro-sitio.com), se ignora.
export function safeNext(value) {
  if (value && /^[a-z0-9-]+\.html(\?[\w=&%.-]*)?$/.test(value)) {
    return `app/${value}`;
  }
  return PAGES.home;
}
