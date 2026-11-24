// app/recolecta-editar.html
// Crear una recolecta nueva (sin ?c) o editar una existente (?c=CITTED-0077).
// Cada sección del formulario se agrega en su propio elemento del paso 4.
import { requireSession } from '../auth-guard.js';
import { renderHeader } from '../layout.js';
import { PAGES, url, go, SPECIMEN_CODE } from '../paths.js';
import { listTrips, listSites } from '../api/catalogs.js';
import { showMessage, setFieldError } from '../messages.js';
import { datePicker, timePicker } from '../pickers.js';
import { createLocationMap } from '../location-map.js';
import { parseDecimal, parseAltitude, coordinateErrors, altitudeErrors } from '../coordinates.js';

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

// ---- Fecha y horas ----
// La fecha futura no se bloquea en el calendario: se puede elegir, pero
// sale el error. Un día bloqueado sin explicación confunde más.
// La base vuelve a revisar las dos reglas al guardar (save_specimen).
const timeStart = document.querySelector('#time-start');
const timeEnd = document.querySelector('#time-end');
let dateSetByHand = false; // true cuando la persona eligió la fecha ella misma

const datePickerInstance = datePicker(collectedOn, {
  onChange: (_dates, value) => {
    dateSetByHand = Boolean(value);
    checkCollectedOn();
  },
});
const timeEndPicker = timePicker(timeEnd, { onChange: () => checkTimes() });
timePicker(timeStart, { onChange: () => checkTimes() });

// Los valores son texto "AAAA-MM-DD" y "HH:MM": compararlos como texto
// da el mismo orden que compararlos como fechas u horas.
function checkCollectedOn() {
  const value = collectedOn.value;
  setFieldError(datePickerInstance.altInput,
    value && value > todayLocal() ? 'La fecha de colecta no puede ser posterior a hoy.' : '');
}

function checkTimes() {
  const start = timeStart.value;
  const end = timeEnd.value;
  setFieldError(timeEndPicker.altInput,
    start && end && end < start ? 'La hora de fin no puede ser anterior a la de inicio.' : '');
}

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

// Al elegir una gira, se propone su fecha. Si la persona ya eligió una
// fecha a mano, se respeta: una gira puede durar varios días.
tripSelect.addEventListener('change', () => {
  const date = tripDates.get(tripSelect.value);
  if (date && !dateSetByHand) {
    datePickerInstance.setDate(date, false); // false: no cuenta como elegida a mano
    checkCollectedOn();
  }
});

// ---- Ubicación: coordenadas, mapa, GPS y altitud ----
const latInput = document.querySelector('#latitude');
const lngInput = document.querySelector('#longitude');
const precisionSelect = document.querySelector('#coordinate-precision');
const gpsButton = document.querySelector('#gps-button');
const gpsStatus = document.querySelector('#gps-status');
const altMinInput = document.querySelector('#altitude-min');
const altMaxInput = document.querySelector('#altitude-max');

// 6 decimales ≈ 10 cm: más que suficiente y no llena el campo de cifras.
function writeCoordinates(lat, lng) {
  latInput.value = lat.toFixed(6);
  lngInput.value = lng.toFixed(6);
  checkCoordinates();
}

const locationMap = createLocationMap(document.querySelector('#location-map'), {
  onPick: (lat, lng) => {
    writeCoordinates(lat, lng);
    gpsStatus.textContent = '';
  },
});

// Revisa las dos coordenadas y, si están bien, mueve el marcador.
// Devuelve true si no hay errores (lo usará el guardado, elemento 14).
function checkCoordinates() {
  const lat = parseDecimal(latInput.value);
  const lng = parseDecimal(lngInput.value);
  const errors = coordinateErrors(lat, lng);
  setFieldError(latInput, errors.latitude);
  setFieldError(lngInput, errors.longitude);

  const valid = !errors.latitude && !errors.longitude;
  if (valid && lat !== null) locationMap.setPoint(lat, lng);
  if (lat === null && lng === null) locationMap.clear();
  return valid;
}

function checkAltitude() {
  const errors = altitudeErrors(parseAltitude(altMinInput.value), parseAltitude(altMaxInput.value));
  setFieldError(altMinInput, errors.altitude_min);
  setFieldError(altMaxInput, errors.altitude_max);
  return !errors.altitude_min && !errors.altitude_max;
}

// "change" y no "input": revisa al salir del campo, no a cada tecla
// (escribir "-8" todavía no es un error).
latInput.addEventListener('change', checkCoordinates);
lngInput.addEventListener('change', checkCoordinates);
altMinInput.addEventListener('change', checkAltitude);
altMaxInput.addEventListener('change', checkAltitude);

// GPS del celular. El navegador pide permiso la primera vez; solo funciona
// con HTTPS o en localhost (GitHub Pages ya es HTTPS).
const GPS_ERRORS = {
  1: 'No se dio permiso para usar la ubicación. Actívelo en el navegador o marque el punto en el mapa.',
  2: 'No se pudo obtener la ubicación. Marque el punto en el mapa.',
  3: 'El GPS tardó demasiado. Intente de nuevo al aire libre o marque el punto en el mapa.',
};

if (!('geolocation' in navigator)) {
  gpsButton.hidden = true;
}

gpsButton.addEventListener('click', () => {
  gpsButton.disabled = true;
  gpsStatus.textContent = 'Buscando ubicación…';

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const { latitude, longitude, accuracy } = position.coords;
      writeCoordinates(latitude, longitude);
      precisionSelect.value = 'point';
      // El margen ayuda a decidir si confiar en el punto: bajo árboles
      // el GPS del celular puede fallar por decenas de metros.
      const margin = Math.round(accuracy);
      gpsStatus.textContent = margin > 100
        ? `Ubicación tomada con un margen de ± ${margin} m. Es un margen alto: si puede, espere un momento y vuelva a intentar.`
        : `Ubicación tomada con un margen de ± ${margin} m.`;
      gpsButton.disabled = false;
    },
    (error) => {
      gpsStatus.textContent = GPS_ERRORS[error.code] ?? GPS_ERRORS[2];
      gpsButton.disabled = false;
    },
    { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
  );
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
form.addEventListener('submit', (event) => {
  event.preventDefault();
});
