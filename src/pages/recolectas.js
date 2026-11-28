// app/recolectas.html
// Listado de recolectas en tarjetas, con buscador, filtros por estado y
// filtros por orden, familia, gira y sitio. Todo se combina (Y).
// Lo elegido queda en la dirección (?q=…&familia=…): al volver desde una
// recolecta con "Atrás", o al compartir el enlace, el listado se abre
// con los mismos filtros.
import { requireSession } from '../auth-guard.js';
import { renderHeader } from '../layout.js';
import { PAGES, url } from '../paths.js';
import { listSpecimens } from '../api/specimens.js';
import { createSpecimenCard } from '../specimen-card.js';
import {
  searchText,
  matchesSearch,
  STATUS_FILTERS,
  FIELD_FILTERS,
  filterOptions,
  matchesFields,
} from '../specimen-filters.js';

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
const statusGroup = document.querySelector('#status-filters');
const fieldGroup = document.querySelector('#field-filters');

// Filtro de estado elegido (una clave de STATUS_FILTERS).
let status = 'all';
// Una lista desplegable por filtro de FIELD_FILTERS: { order: <select>, ... }
const selects = {};

// Nombre de cada filtro en la dirección. En español porque la dirección
// la ve la persona: ?familia=Mycenaceae se entiende solo.
const URL_PARAMS = { order: 'orden', family: 'familia', trip: 'gira', site: 'sitio' };

// Cada recolecta con sus datos, su tarjeta y su texto de búsqueda, calculados una
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

// Un botón por filtro de estado. aria-pressed dice cuál está elegido:
// el lector de pantalla lo anuncia como "presionado".
const statusButtons = Object.entries(STATUS_FILTERS).map(([key, { label }]) => {
  const button = el('button', 'chip');
  button.type = 'button';
  button.dataset.status = key;
  button.append(el('span', '', label), el('span', 'chip__count'));
  button.addEventListener('click', () => {
    status = key;
    render();
  });
  return button;
});
statusGroup.append(...statusButtons);

// Las listas se crean vacías; sus opciones salen de las recolectas
// cargadas (fillSelects). Mismo marcado que los campos del formulario.
for (const [key, { label }] of Object.entries(FIELD_FILTERS)) {
  const field = el('div', 'field');
  const fieldLabel = el('label', '', label);
  const select = el('select');
  select.id = `filter-${key}`;
  fieldLabel.htmlFor = select.id;
  select.addEventListener('change', render);
  field.append(fieldLabel, select);
  fieldGroup.append(field);
  selects[key] = select;
}

function fillSelects() {
  const specimens = entries.map((entry) => entry.specimen);
  for (const [key, select] of Object.entries(selects)) {
    const all = el('option', '', FIELD_FILTERS[key].all);
    all.value = '';
    const options = filterOptions(specimens, key).map(({ value, text }) => {
      const option = el('option', '', text);
      option.value = value;
      return option;
    });
    select.replaceChildren(all, ...options);
  }
}

// { order: 'Agaricales', family: '', ... } con lo elegido en cada lista
function selectedFields() {
  return Object.fromEntries(Object.entries(selects).map(([key, select]) => [key, select.value]));
}

// Pone en la página los filtros que trae la dirección. Un valor que ya no
// existe (una gira borrada, una dirección escrita a mano) se ignora.
function readUrl() {
  const params = new URLSearchParams(window.location.search);
  search.value = params.get('q') ?? '';
  const urlStatus = params.get('estado');
  status = Object.hasOwn(STATUS_FILTERS, urlStatus) ? urlStatus : 'all';
  for (const [key, select] of Object.entries(selects)) {
    const value = params.get(URL_PARAMS[key]) ?? '';
    const exists = [...select.options].some((option) => option.value === value);
    select.value = exists ? value : '';
  }
}

// Escribe en la dirección lo elegido, solo lo que tiene valor.
// replaceState y no pushState: cada letra del buscador no debe crear una
// entrada en el historial; "Atrás" sale del listado de una vez.
function writeUrl(query, fields) {
  const params = new URLSearchParams();
  if (query.trim()) params.set('q', query.trim());
  if (status !== 'all') params.set('estado', status);
  for (const [key, value] of Object.entries(fields)) {
    if (value) params.set(URL_PARAMS[key], value);
  }
  const text = params.toString();
  window.history.replaceState(null, '', text ? `?${text}` : window.location.pathname);
}

function clearFilters() {
  search.value = '';
  status = 'all';
  Object.values(selects).forEach((select) => (select.value = ''));
  render();
  search.focus();
}

function setControlsDisabled(disabled) {
  search.disabled = disabled;
  statusButtons.forEach((button) => (button.disabled = disabled));
  Object.values(selects).forEach((select) => (select.disabled = disabled));
}

// Muestra solo las tarjetas que pasan la búsqueda y todos los filtros.
function render() {
  const query = search.value;
  const fields = selectedFields();
  // Los contadores de los botones de estado se cuentan sobre lo que dejan
  // la búsqueda y las listas: con "mycena" escrito, "Publicadas 2" son
  // 2 Mycena publicadas.
  const searched = entries.filter(
    (entry) => matchesSearch(entry.text, query) && matchesFields(entry.specimen, fields)
  );
  const visible = searched.filter((entry) => STATUS_FILTERS[status].test(entry.specimen));

  for (const button of statusButtons) {
    const { test } = STATUS_FILTERS[button.dataset.status];
    button.setAttribute('aria-pressed', String(button.dataset.status === status));
    button.lastChild.textContent = searched.filter((entry) => test(entry.specimen)).length;
  }

  // replaceChildren cambia toda la lista de una vez: el navegador dibuja
  // una sola vez en lugar de una por tarjeta.
  list.replaceChildren(...visible.map((entry) => entry.card));
  list.hidden = !visible.length;
  message.hidden = true;

  for (const select of Object.values(selects)) {
    select.classList.toggle('is-set', select.value !== '');
  }

  writeUrl(query, fields);

  const filtering = query.trim() || status !== 'all' || Object.values(fields).some(Boolean);
  summary.replaceChildren();
  if (filtering) {
    const clear = el('button', 'link-button', 'Quitar búsqueda y filtros');
    clear.type = 'button';
    clear.addEventListener('click', clearFilters);
    summary.append(el('span', '', `${visible.length} de ${entries.length} recolectas`), clear);
  }

  if (!entries.length) {
    const link = el('a', 'btn btn--yellow', '+ Registrar la primera');
    link.href = url(PAGES.specimenEdit);
    showMessage(el('p', '', 'Todavía no hay recolectas registradas.'), buttonRow(link));
  } else if (!visible.length) {
    const clear = el('button', 'btn btn--outline', 'Quitar búsqueda y filtros');
    clear.type = 'button';
    clear.addEventListener('click', clearFilters);
    showMessage(el('p', '', 'No hay recolectas que coincidan.'), buttonRow(clear));
  }
}

async function loadList() {
  message.hidden = true;
  count.textContent = '';
  setControlsDisabled(true);
  list.hidden = false;
  list.replaceChildren(...Array.from({ length: 8 }, skeletonCard));
  // aria-busy: el lector de pantalla espera a que termine antes de leer la lista.
  list.setAttribute('aria-busy', 'true');

  try {
    const specimens = await listSpecimens();
    entries = specimens.map((specimen) => ({
      specimen,
      card: createSpecimenCard(specimen),
      text: searchText(specimen),
    }));
    count.textContent = specimens.length;
    fillSelects();
    readUrl();
    setControlsDisabled(false);
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
