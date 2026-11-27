// Tarjeta de una recolecta: foto, código, nombre, gira y sitio, estados.
// Está aparte de la página porque el detalle la vuelve a usar para
// "Otras recolectas del mismo taxón" (paso 6, elemento 18).
//
// Todo se arma con textContent: un nombre o una localidad escritos con
// "<" nunca se interpretan como HTML.
import './css/specimens.css';
import { photoUrls } from './api/photos.js';
import { PUBLICATION_STATUS, IDENTIFICATION_STATUS, formatDate } from './labels.js';
import { PAGES, url } from './paths.js';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

// Nombre que se muestra, en este orden:
// 1. Taxón: género (y especie) en cursiva; "sp." va sin cursiva, como se
//    escribe en biología ("Mycena sp.").
// 2. Lo que anotó el equipo en campo ("¿Xylaria?"), tal cual.
// 3. "Sin identificar".
function nameNode(specimen) {
  const { taxon, identification_text } = specimen;

  if (taxon) {
    const name = el('h2', 'specimen-card__name specimen-card__name--scientific');
    if (taxon.species) {
      name.append(el('i', '', `${taxon.genus} ${taxon.species}`));
    } else {
      name.append(el('i', '', taxon.genus), ' sp.');
    }
    return name;
  }

  return el('h2', 'specimen-card__name', identification_text || IDENTIFICATION_STATUS.unidentified);
}

// "Gira Caño Negro · Finca X". Si la gira no tiene nombre se usa su fecha;
// si la recolecta no tiene gira, la fecha de la colecta.
function metaText({ trip, site, collected_on }) {
  const tripText = trip ? trip.name || `Gira del ${formatDate(trip.started_on)}` : '';
  const parts = [tripText || formatDate(collected_on), site?.name].filter(Boolean);
  return parts.join(' · ');
}

function mediaNode(specimen, name) {
  const media = el('div', 'specimen-card__media');

  if (specimen.cover) {
    const img = el('img', 'specimen-card__img');
    img.src = photoUrls(specimen.cover).thumb;
    img.alt = `Foto de ${name}`;
    // El espacio ya lo reserva .specimen-card__media (aspect-ratio).
    // Solo se descargan las fotos que están cerca de la pantalla.
    img.loading = 'lazy';
    img.decoding = 'async';
    media.append(img);
  } else {
    media.append(el('span', 'specimen-card__no-photo', 'Sin foto'));
  }

  media.append(
    el('span', 'specimen-card__code', specimen.code),
    el(
      'span',
      `status status--${specimen.publication_status} specimen-card__status`,
      PUBLICATION_STATUS[specimen.publication_status]
    )
  );
  return media;
}

// Devuelve un <li> listo para meter en la cuadrícula (<ul class="specimen-grid">).
export function createSpecimenCard(specimen) {
  const name = nameNode(specimen);

  const body = el('div', 'specimen-card__body');
  body.append(name);
  const meta = metaText(specimen);
  if (meta) body.append(el('p', 'specimen-card__meta', meta));
  body.append(
    el(
      'span',
      `ident ident--${specimen.identification_status} specimen-card__ident`,
      IDENTIFICATION_STATUS[specimen.identification_status]
    )
  );

  // Mientras no exista la página de detalle (elemento 12), la tarjeta
  // abre el formulario de esa recolecta.
  const link = el('a', 'specimen-card');
  link.href = url(PAGES.specimenEdit, { c: specimen.code });
  link.append(mediaNode(specimen, name.textContent), body);

  const item = el('li');
  item.append(link);
  return item;
}
