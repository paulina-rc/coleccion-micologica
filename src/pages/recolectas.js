// app/recolectas.html
// Paso 3: solo protege la página y dibuja el encabezado.
// El listado, los filtros y la búsqueda llegan en el paso 6.
import { requireSession } from '../auth-guard.js';
import { renderHeader } from '../layout.js';

const { profile } = await requireSession();
renderHeader(profile, 'recolectas');

document.querySelector('#welcome').textContent =
  `Sesión iniciada como ${profile.full_name}. El listado de recolectas se construye en el paso 6.`;
