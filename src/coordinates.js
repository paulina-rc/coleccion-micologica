// Reglas de coordenadas y altitud del formulario de recolecta.
// Son funciones puras (reciben texto, devuelven números o mensajes, no
// tocan la página): así se pueden probar solas más adelante con Vitest.
// La base repite las reglas básicas al guardar (save_specimen).

// Caja que contiene a Costa Rica, incluida la Isla del Coco.
// No es el borde exacto del país: sirve para atrapar errores comunes
// (signo olvidado, latitud y longitud al revés).
const COSTA_RICA = { latMin: 5.0, latMax: 11.3, lngMin: -87.2, lngMax: -82.5 };

// Cerro Chirripó: 3820 m. Se deja margen por si el GPS sube un poco.
const ALTITUDE_MAX = 4000;

// "10,4512" o "10.4512" → 10.4512 · "" → null · "10.4x" → NaN
// Se acepta la coma porque en Costa Rica se escribe así el decimal.
export function parseDecimal(text) {
  const clean = text.trim().replace(',', '.');
  if (clean === '') return null;
  if (!/^-?\d+(\.\d+)?$/.test(clean)) return NaN;
  return Number(clean);
}

// "1700" → 1700 · "" → null · "1.700" o "1700 m" → NaN
export function parseAltitude(text) {
  const clean = text.trim();
  if (clean === '') return null;
  if (!/^\d+$/.test(clean)) return NaN;
  return Number(clean);
}

// Devuelve el mensaje de error de cada campo ('' = sin error).
export function coordinateErrors(lat, lng) {
  const errors = { latitude: '', longitude: '' };

  if (Number.isNaN(lat)) errors.latitude = 'Escriba solo el número, por ejemplo 10.4512.';
  if (Number.isNaN(lng)) errors.longitude = 'Escriba solo el número, por ejemplo -84.4321.';
  if (errors.latitude || errors.longitude) return errors;

  if (lat === null && lng === null) return errors; // las dos vacías: es válido
  if (lat === null) {
    errors.latitude = 'Falta la latitud.';
    return errors;
  }
  if (lng === null) {
    errors.longitude = 'Falta la longitud.';
    return errors;
  }

  const inside = (value, min, max) => value >= min && value <= max;

  // Latitud y longitud escritas al revés
  if (
    inside(lat, COSTA_RICA.lngMin, COSTA_RICA.lngMax) &&
    inside(lng, COSTA_RICA.latMin, COSTA_RICA.latMax)
  ) {
    errors.latitude = 'Parece que la latitud y la longitud están al revés.';
    return errors;
  }
  if (!inside(lat, COSTA_RICA.latMin, COSTA_RICA.latMax)) {
    errors.latitude = 'Queda fuera de Costa Rica (la latitud va de 5 a 11.3).';
  }
  if (inside(-lng, COSTA_RICA.lngMin, COSTA_RICA.lngMax)) {
    errors.longitude = `En Costa Rica la longitud es negativa: -${lng}.`;
  } else if (!inside(lng, COSTA_RICA.lngMin, COSTA_RICA.lngMax)) {
    errors.longitude = 'Queda fuera de Costa Rica (la longitud va de -87.2 a -82.5).';
  }
  return errors;
}

export function altitudeErrors(min, max) {
  const errors = { altitude_min: '', altitude_max: '' };
  const outOfRange = (value) => value !== null && (value < 0 || value > ALTITUDE_MAX);

  if (Number.isNaN(min)) errors.altitude_min = 'Solo números enteros, sin puntos (ej. 1700).';
  else if (outOfRange(min)) errors.altitude_min = `Debe estar entre 0 y ${ALTITUDE_MAX} m.`;

  if (Number.isNaN(max)) errors.altitude_max = 'Solo números enteros, sin puntos (ej. 1800).';
  else if (outOfRange(max)) errors.altitude_max = `Debe estar entre 0 y ${ALTITUDE_MAX} m.`;
  else if (min !== null && !Number.isNaN(min) && max !== null && max < min) {
    errors.altitude_max = 'No puede ser menor que la altitud mínima.';
  }
  return errors;
}
