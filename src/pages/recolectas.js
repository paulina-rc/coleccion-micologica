// app/recolectas.html
// Listado de recolectas en tarjetas, con buscador. Los filtros llegan
// en los elementos 7 a 9 del paso 6.
import { requireSession } from '../auth-guard.js';
import { renderHeader } from '../layout.js';
import { PAGES, url } from '../paths.js';
import { listSpecimens } from '../api/specimens.js';
import { createSpecimenCard } from '../specimen-card.js';
import { searchText, matchesSearch } from '../specimen-filters.js';

const { profile } = await requireSession();
renderHeader(profile, 'recolectas');

// Misma forma de armar rutas que el resto del sitio: si al migrar cambia
// la carpeta base, el enlace sigue funcionando.
document.querySelector('#new-specimen').href = url(PAGES.specimenEdit);

const list = document.querySelector('#specimen-list');
const count = document.querySelector('#specimen-count');
const message = document.querySelector('#list-message');
const search = document.querySelector('#specimen-search');
const summary = document.querySelector('#list-summary');

// Cada recolecta con su tarjeta y su texto de búsqueda, calculados una
// sola vez al cargar. Al escribir solo se decide cuáles se muestran:
// no se vuelven a crear tarjetas ni a descargar miniaturas.
let entries = [];

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

function buttonRow(button) {
  const row = el('p');
  row.append(button);
  return row;
}

// Muestra solo las tarjetas que coinciden con la búsqueda.
function render() {
  const query = search.value;
  const visible = entries.filter((entry) => matchesSearch(entry.text, query));

  // replaceChildren cambia toda la lista de una vez: el navegador dibuja
  // una sola vez en lugar de una por tarjeta.
  list.replaceChildren(...visible.map((entry) => entry.card));
  list.hidden = !visible.length;
  message.hidden = true;

  summary.textContent = query.trim() ? `${visible.length} de ${entries.length} recolectas` : '';

  if (!entries.length) {
    const link = el('a', 'btn btn--yellow', '+ Registrar la primera');
    link.href = url(PAGES.specimenEdit);
    showMessage(el('p', '', 'Todavía no hay recolectas registradas.'), buttonRow(link));
  } else if (!visible.length) {
    const clear = el('button', 'btn btn--outline', 'Limpiar búsqueda');
    clear.type = 'button';
    clear.addEventListener('click', () => {
      search.value = '';
      render();
      search.focus();
    });
    showMessage(el('p', '', 'Ninguna recolecta coincide con la búsqueda.'), buttonRow(clear));
  }
}

async function loadList() {
  message.hidden = true;
  count.textContent = '';
  search.disabled = true;
  list.hidden = false;
  list.replaceChildren(...Array.from({ length: 8 }, skeletonCard));
  // aria-busy: el lector de pantalla espera a que termine antes de leer la lista.
  list.setAttribute('aria-busy', 'true');

  try {
    const specimens = await listSpecimens();
    entries = specimens.map((specimen) => ({
      card: createSpecimenCard(specimen),
      text: searchText(specimen),
    }));
    count.textContent = specimens.length;
    search.disabled = false;
    render();
  } catch (error) {
    // El detalle técnico queda en la consola (F12) para revisarlo;
    // la persona ve un mensaje claro y puede reintentar.
    console.error('No se pudo cargar el listado de recolectas', error);
    list.hidden = true;
    list.replaceChildren();
    const retry = el('button', 'btn btn--outline', 'Reintentar');
    retry.type = 'button';
    retry.addEventListener('click', loadList);
    showMessage(el('p', '', 'No se pudo cargar el listado. Revise su conexión.'), buttonRow(retry));
  } finally {
    list.removeAttribute('aria-busy');
  }
}

// "input" salta con cada letra, al borrar y al tocar la X del buscador.
search.addEventListener('input', render);

loadList();
