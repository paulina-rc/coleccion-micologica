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
const message = document.querySelector('#list-message');

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

// Tarjetas grises mientras responde Supabase. Tienen la misma forma que
// las reales, así la página no salta cuando llegan los datos.
function skeletonCard() {
  const body = el('div', 'specimen-card__body');
  body.append(
    el('span', 'skeleton-line skeleton-line--title'),
    el('span', 'skeleton-line'),
    el('span', 'skeleton-line skeleton-line--short')
  );
  const card = el('div', 'specimen-card specimen-card--skeleton');
  card.append(el('div', 'specimen-card__media'), body);
  const item = el('li');
  item.append(card);
  return item;
}

function showMessage(...children) {
  message.replaceChildren(...children);
  message.hidden = false;
}

async function loadList() {
  message.hidden = true;
  count.textContent = '';
  list.hidden = false;
  list.replaceChildren(...Array.from({ length: 8 }, skeletonCard));
  // aria-busy: el lector de pantalla espera a que termine antes de leer la lista.
  list.setAttribute('aria-busy', 'true');

  try {
    const specimens = await listSpecimens();

    // replaceChildren cambia toda la lista de una vez: el navegador dibuja
    // una sola vez en lugar de una por tarjeta.
    list.replaceChildren(...specimens.map(createSpecimenCard));
    count.textContent = specimens.length;

    if (!specimens.length) {
      list.hidden = true;
      const link = el('a', 'btn btn--yellow', '+ Registrar la primera');
      link.href = url(PAGES.specimenEdit);
      const linkRow = el('p');
      linkRow.append(link);
      showMessage(el('p', '', 'Todavía no hay recolectas registradas.'), linkRow);
    }
  } catch (error) {
    // El detalle técnico queda en la consola (F12) para revisarlo;
    // la persona ve un mensaje claro y puede reintentar.
    console.error('No se pudo cargar el listado de recolectas', error);
    list.hidden = true;
    list.replaceChildren();
    const retry = el('button', 'btn btn--outline', 'Reintentar');
    retry.type = 'button';
    retry.addEventListener('click', loadList);
    const retryRow = el('p');
    retryRow.append(retry);
    showMessage(el('p', '', 'No se pudo cargar el listado. Revise su conexión.'), retryRow);
  } finally {
    list.removeAttribute('aria-busy');
  }
}

loadList();
