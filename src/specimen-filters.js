// Búsqueda y filtros del listado de recolectas.
// Funciones puras (no tocan la página ni Supabase): reciben datos y
// devuelven un resultado. Así se pueden probar con Vitest más adelante
// y el listado de selecciones (paso 10) las puede volver a usar.

import { formatDate } from './labels.js';

// "Caño Negro" → "cano negro". Quita tildes y diéresis y pasa a minúscula,
// para que "cano" encuentre "Caño" y "XYLARIA" encuentre "Xylaria".
// NFD separa cada letra de su tilde ("ñ" → "n" + "~") y la expresión
// borra esas marcas.
export function normalize(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

// Todo el texto en el que se busca, ya normalizado y en una sola cadena.
// Se calcula una vez por recolecta (no en cada tecla).
export function searchText(specimen) {
  const { code, identification_text, locality, taxon, trip, site } = specimen;
  return normalize(
    [
      code,
      identification_text,
      locality,
      taxon?.taxon_order,
      taxon?.family,
      taxon?.genus,
      taxon?.species,
      trip?.name,
      site?.name,
    ]
      .filter(Boolean)
      .join(' ')
  );
}

// true si todas las palabras de la búsqueda aparecen, en cualquier orden:
// "mycena caño" encuentra las Mycena de la gira a Caño Negro.
// Una búsqueda vacía encuentra todo.
export function matchesSearch(text, query) {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  return words.every((word) => text.includes(word));
}

// Filtros rápidos por estado (botones arriba del listado). Cada uno
// responde si una recolecta entra o no. Son excluyentes: se elige uno.
// El orden de este objeto es el orden de los botones.
export const STATUS_FILTERS = {
  all: { label: 'Todas', test: () => true },
  published: {
    label: 'Publicadas',
    test: (specimen) => specimen.publication_status === 'published',
  },
  in_research: {
    label: 'En investigación',
    test: (specimen) => specimen.publication_status === 'in_research',
  },
  unidentified: {
    label: 'Sin identificar',
    test: (specimen) => specimen.identification_status === 'unidentified',
  },
};

// Filtros de lista desplegable (orden, familia, gira y sitio).
// value: lo que se compara, siempre como texto porque <select> entrega
// texto; text: lo que ve la persona en la lista. Si la recolecta no
// tiene ese dato, value devuelve '' y no entra cuando el filtro está puesto.
export const FIELD_FILTERS = {
  order: {
    label: 'Orden',
    all: 'Todos los órdenes',
    value: (specimen) => specimen.taxon?.taxon_order ?? '',
    text: (specimen) => specimen.taxon?.taxon_order,
  },
  family: {
    label: 'Familia',
    all: 'Todas las familias',
    value: (specimen) => specimen.taxon?.family ?? '',
    text: (specimen) => specimen.taxon?.family,
  },
  trip: {
    label: 'Gira',
    all: 'Todas las giras',
    // Por id: dos giras pueden llamarse igual en años distintos.
    value: (specimen) => (specimen.trip ? String(specimen.trip.id) : ''),
    // Mismo texto que la tarjeta cuando la gira no tiene nombre.
    text: (specimen) => specimen.trip?.name || `Gira del ${formatDate(specimen.trip?.started_on)}`,
  },
  site: {
    label: 'Sitio',
    all: 'Todos los sitios',
    value: (specimen) => (specimen.site ? String(specimen.site.id) : ''),
    text: (specimen) => specimen.site?.name,
  },
};

// Opciones de un filtro: solo los valores que aparecen en las recolectas,
// sin repetir y en orden alfabético. Así la lista nunca ofrece una
// familia que no daría resultados.
export function filterOptions(specimens, key) {
  const { value, text } = FIELD_FILTERS[key];
  const options = new Map();
  for (const specimen of specimens) {
    const optionValue = value(specimen);
    if (optionValue && !options.has(optionValue)) {
      options.set(optionValue, String(text(specimen)));
    }
  }
  return [...options]
    .map(([optionValue, optionText]) => ({ value: optionValue, text: optionText }))
    .sort((a, b) => a.text.localeCompare(b.text, 'es'));
}

// true si la recolecta cumple todos los filtros puestos.
// selected: { order: 'Agaricales', trip: '3', ... }; '' = sin filtro.
export function matchesFields(specimen, selected) {
  return Object.entries(selected).every(
    ([key, chosen]) => !chosen || FIELD_FILTERS[key].value(specimen) === chosen
  );
}
