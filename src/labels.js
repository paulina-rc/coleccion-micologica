// Textos que se muestran en la interfaz para los valores de la base.
// La base guarda valores en inglés (enums de 01_schema.sql); la persona ve
// estos nombres. Están en un solo archivo para que el listado, el detalle
// y el formulario digan siempre lo mismo.

// enum publication_status
export const PUBLICATION_STATUS = {
  in_research: 'En investigación',
  published: 'Publicada',
};

// enum identification_status (mismos textos que el formulario)
export const IDENTIFICATION_STATUS = {
  unidentified: 'Sin identificar',
  to_verify: 'Por verificar',
  genus: 'Hasta género',
  species: 'Hasta especie',
};

// enum person_role, en el orden en que se muestran los créditos
// (el mismo de la ficha oficial y del formulario).
export const PERSON_ROLES = {
  collector: 'Colector',
  co_investigator: 'Asistentes',
  identifier: 'Identifica',
  describer: 'Describe',
  photographer: 'Fotografía',
};

const dateFormat = new Intl.DateTimeFormat('es-CR', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

// "2026-10-19" → "19 oct 2026". Vacío → "".
// Se agrega el mediodía porque new Date('2026-10-19') se lee como
// medianoche UTC, que en Costa Rica (UTC-6) es el día anterior.
export function formatDate(isoDate) {
  if (!isoDate) return '';
  return dateFormat.format(new Date(`${isoDate}T12:00:00`));
}

// "08:30:00" o "08:30" → "8:30 AM", como el selector de hora del formulario.
export function formatTime(time) {
  if (!time) return '';
  const [hours, minutes] = time.split(':').map(Number);
  const suffix = hours < 12 ? 'AM' : 'PM';
  const hours12 = hours % 12 || 12;
  return `${hours12}:${String(minutes).padStart(2, '0')} ${suffix}`;
}
