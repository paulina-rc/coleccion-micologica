// Compresión de fotos en el navegador, antes de subirlas.
//
// Por qué en el navegador y no en el servidor: el sistema no tiene
// servidor propio, y las transformaciones de imagen de Supabase son de
// los planes pagos. Además, en campo se sube con datos móviles: mandar
// 400 KB en vez de 6 MB es la diferencia entre que suba o no.
//
// Volver a dibujar la imagen en un <canvas> crea un archivo nuevo sin los
// metadatos EXIF de la cámara. Eso importa: el EXIF de un celular trae
// las coordenadas GPS exactas, y en fincas privadas no se publican.
//
// Este módulo no llama a Supabase: recibe un File y devuelve los archivos
// listos para subir (ver src/api/photos.js).

// Reglas de compresión (arquitectura, sección 6; plan de mejoras, 5.3).
const FULL_SIDE = 1600; // lado más largo de la foto grande, en px
const THUMB_SIDE = 480; // miniatura para la galería y el listado
const QUALITIES = [0.8, 0.7, 0.6]; // se baja solo si la foto pasa de MAX_BYTES
const MAX_BYTES = 2 * 1024 * 1024; // límite del bucket "photos" (02_security.sql)

// Una foto original más grande que esto probablemente no es una foto de
// celular o cámara, y abrirla puede dejar sin memoria a un celular viejo.
const MAX_INPUT_BYTES = 30 * 1024 * 1024;

// Error con un mensaje en español listo para mostrar a la persona.
export class PhotoError extends Error {}

// Dibuja la imagen en un canvas con el lado más largo = maxSide (nunca la
// agranda) y la convierte en archivo. Fondo blanco: un PNG con partes
// transparentes quedaría negro al pasarlo a JPEG.
function drawScaled(bitmap, maxSide) {
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext('2d');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function toBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

// Codifica en WebP; si el navegador no sabe crear WebP (algunos Safari
// viejos devuelven PNG en silencio), usa JPEG, que el bucket también acepta.
// Prueba calidades más bajas hasta quedar bajo el límite.
async function encode(canvas, preferredType) {
  for (const quality of QUALITIES) {
    let blob = await toBlob(canvas, preferredType, quality);
    if (!blob || blob.type !== preferredType) {
      preferredType = 'image/jpeg';
      blob = await toBlob(canvas, preferredType, quality);
    }
    if (blob && blob.size <= MAX_BYTES) return blob;
  }
  throw new PhotoError('La foto sigue pesando más de 2 MB después de comprimirla.');
}

const EXTENSIONS = { 'image/webp': 'webp', 'image/jpeg': 'jpg' };

// Recibe la foto elegida y devuelve { full, thumb, extension }.
// La miniatura se hace en el mismo formato que la foto grande, para que
// las dos tengan la misma extensión y el nombre de una salga del de la otra.
export async function compressPhoto(file) {
  if (!file.type.startsWith('image/')) {
    throw new PhotoError('El archivo no es una imagen.');
  }
  if (file.size > MAX_INPUT_BYTES) {
    throw new PhotoError('La imagen pesa más de 30 MB. Use una foto de cámara o celular.');
  }

  let bitmap;
  try {
    // from-image: respeta la orientación que guardó la cámara. Sin esto,
    // las fotos tomadas con el celular vertical pueden quedar acostadas.
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    // Pasa, por ejemplo, con fotos HEIC de iPhone abiertas en Windows.
    throw new PhotoError('No se pudo leer la imagen. Use una foto en JPG, PNG o WebP.');
  }

  try {
    const full = await encode(drawScaled(bitmap, FULL_SIDE), 'image/webp');
    const thumb = await encode(drawScaled(bitmap, THUMB_SIDE), full.type);
    return { full, thumb, extension: EXTENSIONS[full.type] };
  } finally {
    bitmap.close(); // libera la memoria de la imagen original
  }
}
