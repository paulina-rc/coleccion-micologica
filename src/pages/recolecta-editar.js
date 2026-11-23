// app/recolecta-editar.html
// Crear una recolecta nueva (sin ?c) o editar una existente (?c=CITTED-0077).
// Cada sección del formulario se agrega en su propio elemento del paso 4.
import { requireSession } from '../auth-guard.js';
import { renderHeader } from '../layout.js';
import { PAGES, url, go, SPECIMEN_CODE } from '../paths.js';
import { listTrips, listSites } from '../api/catalogs.js';
import { showMessage } from '../messages.js';

const { profile } = await requireSession();
renderHeader(profile, 'recolectas');

// ---- Modo: nueva o edición ----
// Se usa el código (no el id interno) en la URL, igual que en el resto del sistema.
const params = new URLSearchParams(window.location.search);
const code = params.get('c');

if (code !== null && !SPECIMEN_CODE.test(code)) {
  // Un ?c= mal escrito no abre un formulario vacío que parezca "nueva":
  // vuelve al listado.
  go(PAGES.home);
}

const isEdit = code !== null;

if (isEdit) {
  const title = document.querySelector('#page-title');
  title.replaceChildren('Editar ', Object.assign(document.createElement('i'), { textContent: 'recolecta' }));
  const tag = document.querySelector('#code-tag');
  tag.textContent = code;
  tag.classList.remove('code-tag--pending');
  document.title = `Editar ${code} · Colección Micológica`;
}

document.querySelector('#cancel-link').href = url(PAGES.home);

// ---- Encabezado: giras y sitios ----
const form = document.querySelector('#specimen-form');
const message = document.querySelector('#form-message');
const tripSelect = document.querySelector('#trip-select');
const siteSelect = document.querySelector('#site-select');
const collectedOn = document.querySelector('#collected-on');

// Fecha local de hoy en formato AAAA-MM-DD. toISOString() daría la fecha
// en UTC: en Costa Rica, después de las 6 p. m. ya sería "mañana".
function todayLocal() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 10);
}
collectedOn.max = todayLocal(); // la base también lo valida (save_specimen)

const dateFormat = new Intl.DateTimeFormat('es-CR', { day: 'numeric', month: 'short', year: 'numeric' });

// "2026-10-19" → "19 oct 2026". Se agrega la hora para que el navegador
// no la lea como medianoche UTC (sería el día anterior en Costa Rica).
function formatDate(isoDate) {
  return dateFormat.format(new Date(`${isoDate}T12:00:00`));
}

// Las opciones se crean con textContent: un nombre escrito con "<" no
// se interpreta como HTML.
function addOption(select, value, label) {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = label;
  select.append(option);
}

// Guarda la fecha de cada gira para proponerla como fecha de colecta.
const tripDates = new Map();

try {
  const [trips, sites] = await Promise.all([listTrips(), listSites()]);

  for (const trip of trips) {
    const date = formatDate(trip.started_on);
    addOption(tripSelect, trip.id, trip.name ? `${trip.name} · ${date}` : `Gira del ${date}`);
    tripDates.set(String(trip.id), trip.started_on);
  }
  for (const site of sites) addOption(siteSelect, site.id, site.name);

  if (!sites.length) {
    showMessage(message, 'Todavía no hay sitios registrados. La persona administradora los agrega o llegan con la importación del Excel.', 'info');
  }
} catch (error) {
  console.error(error);
  showMessage(message, 'No se pudieron cargar las giras y los sitios. Revise su conexión y recargue la página.');
}

// Al elegir una gira, se propone su fecha si la fecha está vacía.
// No se sobrescribe una fecha ya escrita: una gira puede durar varios días.
tripSelect.addEventListener('change', () => {
  const date = tripDates.get(tripSelect.value);
  if (date && !collectedOn.value) collectedOn.value = date;
});

// ---- Índice de secciones ----
// Marca en el índice la sección que se está viendo. IntersectionObserver
// avisa cuando una tarjeta entra en la franja superior de la pantalla,
// sin calcular posiciones en cada scroll.
const links = new Map(
  [...document.querySelectorAll('.steps__link')].map((link) => [link.hash.slice(1), link]),
);

function markCurrent(id) {
  for (const [sectionId, link] of links) {
    link.classList.toggle('is-current', sectionId === id);
    if (sectionId === id) link.setAttribute('aria-current', 'step');
    else link.removeAttribute('aria-current');
  }
}

const observer = new IntersectionObserver((entries) => {
  const visible = entries.filter((entry) => entry.isIntersecting);
  if (visible.length) markCurrent(visible[0].target.id);
}, { rootMargin: '0px 0px -70% 0px' }); // solo cuenta el 30 % superior de la pantalla

for (const id of links.keys()) {
  const section = document.getElementById(id);
  if (section) observer.observe(section);
}
markCurrent('encabezado');

// ---- Guardar ----
// Por ahora solo evita que el formulario recargue la página.
// El guardado real con save_specimen llega en el elemento 14.
document.querySelector('#specimen-form').addEventListener('submit', (event) => {
  event.preventDefault();
});
