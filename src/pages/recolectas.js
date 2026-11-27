// app/recolectas.html
// Listado de recolectas en tarjetas. La búsqueda y los filtros llegan
// en los elementos 6 a 9 del paso 6.
import { requireSession } from '../auth-guard.js';
import { renderHeader } from '../layout.js';
import { PAGES, url } from '../paths.js';
import { listSpecimens } from '../api/specimens.js';
import { createSpecimenCard } from '../specimen-card.js';

const { profile } = await requireSession();
renderHeader(profile, 'recolectas');

// Misma forma de armar rutas que el resto del sitio: si al migrar cambia
// la carpeta base, el enlace sigue funcionando.
document.querySelector('#new-specimen').href = url(PAGES.specimenEdit);

const list = document.querySelector('#specimen-list');
const count = document.querySelector('#specimen-count');

const specimens = await listSpecimens();

// replaceChildren cambia toda la lista de una vez: el navegador dibuja
// una sola vez en lugar de una por tarjeta.
list.replaceChildren(...specimens.map(createSpecimenCard));
count.textContent = specimens.length;
