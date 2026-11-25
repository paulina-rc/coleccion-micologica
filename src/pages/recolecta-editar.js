// app/recolecta-editar.html
// Crear una recolecta nueva (sin ?c) o editar una existente (?c=CITTED-0077).
// Cada sección del formulario se agrega en su propio elemento del paso 4.
import { requireSession } from '../auth-guard.js';
import { renderHeader } from '../layout.js';
import { PAGES, url, go, SPECIMEN_CODE } from '../paths.js';
import { listTrips, listSites } from '../api/catalogs.js';
import { showMessage, hideMessage, setFieldError } from '../messages.js';
import { datePicker, timePicker } from '../pickers.js';
import { createLocationMap } from '../location-map.js';
import { parseDecimal, parseAltitude, coordinateErrors, altitudeErrors } from '../coordinates.js';
import { listPeople } from '../api/people.js';
import { createPeoplePicker } from '../people-picker.js';
import { saveSpecimen, getSpecimen } from '../api/specimens.js';

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

// Código con el que se guarda: null mientras la recolecta es nueva.
// Cambia después del primer guardado (ver "Guardar").
let currentCode = code;

// Título, etiqueta del código y pestaña en modo edición. Es una función
// porque se usa al abrir ?c= y también después de guardar una nueva.
function showEditMode(specimenCode) {
  const title = document.querySelector('#page-title');
  title.replaceChildren(
    'Editar ',
    Object.assign(document.createElement('i'), { textContent: 'recolecta' })
  );
  const tag = document.querySelector('#code-tag');
  tag.textContent = specimenCode;
  tag.classList.remove('code-tag--pending');
  document.title = `Editar ${specimenCode} · Colección Micológica`;
}

if (isEdit) showEditMode(code);

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
// Las dos devuelven true si no hay error, como las demás check…().
function checkCollectedOn() {
  const value = collectedOn.value;
  const error =
    value && value > todayLocal() ? 'La fecha de colecta no puede ser posterior a hoy.' : '';
  setFieldError(datePickerInstance.altInput, error);
  return !error;
}

function checkTimes() {
  const start = timeStart.value;
  const end = timeEnd.value;
  const error =
    start && end && end < start ? 'La hora de fin no puede ser anterior a la de inicio.' : '';
  setFieldError(timeEndPicker.altInput, error);
  return !error;
}

const dateFormat = new Intl.DateTimeFormat('es-CR', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

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

// ---- Créditos: selector de personas por rol ----
// Una sola lista para los cuatro selectores (ver people-picker.js).
// Los selectores se crean antes de cargar la lista: si la carga falla,
// igual se pueden escribir nombres.
const people = [];
const peoplePickers = {};
for (const field of document.querySelectorAll('[data-people-role]')) {
  peoplePickers[field.dataset.peopleRole] = createPeoplePicker(field, { people });
}

// Créditos con la forma que espera save_specimen:
// { "collector": ["S. Valerio"], "identifier": ["M. Mata"], ... }
// Se mandan los cuatro roles aunque estén vacíos: un rol vacío borra los
// créditos que tenía (al editar). El fotógrafo no se manda (paso 5).
function readCredits() {
  return Object.fromEntries(
    Object.entries(peoplePickers).map(([role, picker]) => [role, picker.getNames()])
  );
}

// Un nombre escrito sin agregar se perdería al guardar.
// Devuelve true si no hay nada pendiente.
function checkCredits() {
  return Object.values(peoplePickers).every((picker) => !picker.hasPendingText());
}

// Si las listas no cargan, no se deja editar: el formulario guardaría la
// gira y el sitio vacíos aunque la recolecta los tenga.
let catalogsLoaded = false;

try {
  const [trips, sites, persons] = await Promise.all([listTrips(), listSites(), listPeople()]);
  people.push(...persons);

  for (const trip of trips) {
    const date = formatDate(trip.started_on);
    addOption(tripSelect, trip.id, trip.name ? `${trip.name} · ${date}` : `Gira del ${date}`);
    tripDates.set(String(trip.id), trip.started_on);
  }
  for (const site of sites) addOption(siteSelect, site.id, site.name);
  catalogsLoaded = true;

  if (!sites.length) {
    showMessage(
      message,
      'Todavía no hay sitios registrados. La persona administradora los agrega o llegan con la importación del Excel.',
      'info'
    );
  }
} catch (error) {
  console.error(error);
  showMessage(
    message,
    'No se pudieron cargar las giras, los sitios y las personas. Revise su conexión y recargue la página.'
  );
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
// Devuelve true si no hay errores.
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
      gpsStatus.textContent =
        margin > 100
          ? `Ubicación tomada con un margen de ± ${margin} m. Es un margen alto: si puede, espere un momento y vuelva a intentar.`
          : `Ubicación tomada con un margen de ± ${margin} m.`;
      gpsButton.disabled = false;
    },
    (error) => {
      gpsStatus.textContent = GPS_ERRORS[error.code] ?? GPS_ERRORS[2];
      gpsButton.disabled = false;
    },
    { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
  );
});
// ---- Publicación ----
// El texto dice el estado actual, no la acción: así se lee igual con o
// sin lector de pantalla ("En investigación" / "Publicada").
const publicationSwitch = document.querySelector('#publication-switch');
const publicationLabel = document.querySelector('#publication-label');

function showPublicationStatus() {
  publicationLabel.textContent = publicationSwitch.checked ? 'Publicada' : 'En investigación';
}
publicationSwitch.addEventListener('change', showPublicationStatus);

// ---- Taxonomía ----
const identifiedOn = document.querySelector('#identified-on');
const identifiedOnPicker = datePicker(identifiedOn, { onChange: () => checkIdentifiedOn() });
const genusInput = document.querySelector('#taxon-genus');
const speciesInput = document.querySelector('#taxon-species');

// Devuelve true si no hay error.
function checkIdentifiedOn() {
  const value = identifiedOn.value;
  const error =
    value && value > todayLocal() ? 'La fecha de identificación no puede ser posterior a hoy.' : '';
  setFieldError(identifiedOnPicker.altInput, error);
  return !error;
}

// Un epíteto sin género no es un nombre científico. Es la misma regla que
// revisa save_specimen en el servidor; aquí solo se avisa antes.
// Las mayúsculas no se corrigen aquí: la base guarda "Xylaria polymorpha"
// aunque se escriba "xylaria Polymorpha".
function checkTaxon() {
  const error =
    speciesInput.value.trim() && !genusInput.value.trim()
      ? 'Para escribir la especie hay que indicar el género.'
      : '';
  setFieldError(speciesInput, error);
  return !error;
}

genusInput.addEventListener('change', checkTaxon);
speciesInput.addEventListener('change', checkTaxon);

// ---- Laboratorio ----
// La descripción se hace días después de la gira, por eso tiene su
// propia fecha. Misma regla que la fecha de colecta: no puede ser futura.
const describedOn = document.querySelector('#described-on');
const describedOnPicker = datePicker(describedOn, { onChange: () => checkDescribedOn() });

// Devuelve true si no hay error.
function checkDescribedOn() {
  const value = describedOn.value;
  const error =
    value && value > todayLocal() ? 'La fecha de descripción no puede ser posterior a hoy.' : '';
  setFieldError(describedOnPicker.altInput, error);
  return !error;
}

// ---- Índice de secciones ----
// Marca en el índice la sección que se está viendo. IntersectionObserver
// avisa cuando una tarjeta entra en la franja superior de la pantalla,
// sin calcular posiciones en cada scroll.
const links = new Map(
  [...document.querySelectorAll('.steps__link')].map((link) => [link.hash.slice(1), link])
);

function markCurrent(id) {
  for (const [sectionId, link] of links) {
    link.classList.toggle('is-current', sectionId === id);
    if (sectionId === id) link.setAttribute('aria-current', 'step');
    else link.removeAttribute('aria-current');
  }
}

const observer = new IntersectionObserver(
  (entries) => {
    const visible = entries.filter((entry) => entry.isIntersecting);
    if (visible.length) markCurrent(visible[0].target.id);
  },
  { rootMargin: '0px 0px -70% 0px' }
); // solo cuenta el 30 % superior de la pantalla

for (const id of links.keys()) {
  const section = document.getElementById(id);
  if (section) observer.observe(section);
}
markCurrent('encabezado');

// ---- Guardar ----
const saveButton = document.querySelector('#save-button');

// Campos que la base guarda como número o fecha: un texto vacío ("")
// no se puede convertir en la base, así que se manda null.
// Las coordenadas y la altitud pasan por las mismas funciones que las
// revisan, para aceptar también la coma decimal ("10,45").
const NUMBER_FIELDS = {
  latitude: parseDecimal,
  longitude: parseDecimal,
  altitude_min: parseAltitude,
  altitude_max: parseAltitude,
  trip_id: Number,
  site_id: Number,
};

// Arma el objeto que espera save_specimen a partir del formulario.
// La regla de nombres del HTML hace el trabajo: "field.body_shape" va a
// data.field.body_shape, "substrate" va a data.substrate. Un campo nuevo
// en el HTML se guarda sin tocar esta función (si save_specimen lo conoce).
function readForm() {
  const data = { field: {}, lab: {}, taxon: {} };

  for (const [name, rawValue] of new FormData(form)) {
    const text = rawValue.trim();
    let value = text === '' ? null : text;
    if (value !== null && NUMBER_FIELDS[name]) value = NUMBER_FIELDS[name](value);

    const [group, key] = name.split('.');
    if (key) data[group][key] = value;
    else data[name] = value;
  }

  // Un checkbox sin marcar no aparece en FormData: se escribe aparte.
  data.publication_status = publicationSwitch.checked ? 'published' : 'in_research';
  data.people = readCredits();
  return data;
}

// Se corren todas (no se detiene en la primera) para marcar todos los
// errores de una vez, no uno por intento.
function checkForm() {
  const results = [
    checkCollectedOn(),
    checkTimes(),
    checkCoordinates(),
    checkAltitude(),
    checkCredits(),
    checkTaxon(),
    checkIdentifiedOn(),
    checkDescribedOn(),
  ];
  return results.every(Boolean);
}

function setSaving(saving) {
  saveButton.disabled = saving;
  saveButton.textContent = saving ? 'Guardando…' : 'Guardar';
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  hideMessage(message);

  if (!checkForm()) {
    showMessage(message, 'Revise los campos marcados en rojo.');
    // El foco en el primer error lo lleva a la vista, también en celular.
    form.querySelector('[aria-invalid="true"]')?.focus();
    return;
  }

  // El botón desactivado evita guardar dos veces con un doble toque.
  setSaving(true);
  try {
    const savedCode = await saveSpecimen(currentCode, readForm());

    if (currentCode === null) {
      // Recolecta nueva: desde ahora la página edita la que se acaba de
      // crear. Así, si se vuelve a guardar, no se crea otra recolecta.
      // replaceState cambia la URL sin recargar (los datos siguen ahí).
      currentCode = savedCode;
      history.replaceState(null, '', url(PAGES.specimenEdit, { c: savedCode }));
      showEditMode(savedCode);
      showMessage(message, `Recolecta guardada con el código ${savedCode}.`, 'success');
    } else {
      showMessage(message, 'Cambios guardados.', 'success');
    }
  } catch (error) {
    // 22023: la base rechazó un dato y su mensaje ya está en español.
    if (error.code === '22023') {
      showMessage(message, error.message);
    } else {
      console.error(error);
      showMessage(
        message,
        'No se pudo guardar la recolecta. Revise su conexión e intente de nuevo: los datos siguen en el formulario.'
      );
    }
  } finally {
    setSaving(false);
  }
  message.scrollIntoView({ behavior: 'smooth', block: 'center' });
});

// ---- Cargar una recolecta para editar (?c=CITTED-0077) ----
// Va al final del archivo porque necesita que ya existan todos los
// campos, los calendarios y los selectores de personas.

// Camino inverso de readForm(): la misma regla de nombres dice de dónde
// sale cada valor ("field.body_shape" ← data.field.body_shape).
// form.elements incluye el interruptor de publicación, que está fuera
// del <form> pero unido con form="specimen-form".
function fillForm(data) {
  for (const element of form.elements) {
    if (!element.name) continue;
    const [group, key] = element.name.split('.');
    const value = (key ? data[group]?.[key] : data[element.name]) ?? '';

    if (element.type === 'radio' || element.type === 'checkbox') {
      element.checked = element.value === value;
    } else if (element._flatpickr) {
      // Los campos con calendario se llenan por flatpickr para que
      // también se actualice lo que ve la persona ("19 oct 2026").
      // false: no dispara onChange (no es un cambio hecho a mano).
      if (value) element._flatpickr.setDate(value, false);
      else element._flatpickr.clear(false);
    } else {
      element.value = String(value);
      // Un <select> sin la opción pedida (p. ej. precisión vacía porque no
      // hay coordenadas) queda en blanco: se vuelve a su primera opción.
      if (element.tagName === 'SELECT' && element.selectedIndex === -1) element.selectedIndex = 0;
    }
  }

  for (const [role, picker] of Object.entries(peoplePickers)) {
    picker.setNames(data.people[role] ?? []);
  }

  // Una fecha guardada cuenta como elegida a mano: cambiar la gira no la
  // reemplaza por la fecha de la gira.
  dateSetByHand = Boolean(data.collected_on);
  showPublicationStatus();
  checkCoordinates(); // coloca el marcador en el mapa
}

if (isEdit) {
  // El botón queda desactivado hasta que el formulario esté lleno:
  // guardar un formulario vacío o a medias borraría datos.
  saveButton.disabled = true;

  if (catalogsLoaded) {
    try {
      const specimen = await getSpecimen(code);
      if (specimen) {
        fillForm(specimen);
        saveButton.disabled = false;
      } else {
        showMessage(message, `No se encontró la recolecta ${code}.`);
      }
    } catch (error) {
      console.error(error);
      showMessage(
        message,
        'No se pudo cargar la recolecta. Revise su conexión y recargue la página.'
      );
    }
  }
}