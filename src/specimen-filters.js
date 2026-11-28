// Búsqueda y filtros del listado de recolectas.
// Funciones puras (no tocan la página ni Supabase): reciben datos y
// devuelven un resultado. Así se pueden probar con Vitest más adelante
// y el listado de selecciones (paso 10) las puede volver a usar.

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
