// Fotos de una recolecta: el archivo vive en Supabase Storage (bucket
// "photos") y la tabla photos guarda su ruta, tipo y número.
//
// Nombres (estructura-y-nomenclatura.md, 4.5):
//   CITTED-0077-k7f3q9/CITTED-0077_field_01.webp        foto grande
//   CITTED-0077-k7f3q9/CITTED-0077_field_01_thumb.webp  miniatura
// La carpeta lleva la clave del QR: el bucket es público, pero sin la
// clave no se puede adivinar la dirección de una foto solo con el código.
// La ruta de la miniatura no se guarda en la base: sale de la regla.
import { supabase } from '../supabase.js';

const BUCKET = 'photos';

// Nombres de los tipos (enum photo_kind) en la interfaz.
export const PHOTO_KINDS = { field: 'Campo', lab: 'Laboratorio', detail: 'Detalle' };

// "…/CITTED-0077_field_01.webp" → "…/CITTED-0077_field_01_thumb.webp"
export function thumbPath(storagePath) {
  return storagePath.replace(/(\.\w+)$/, '_thumb$1');
}

// Dirección pública de la foto grande y de la miniatura.
// ?v=<id>: si se borra la última foto de un tipo, la próxima vuelve a usar
// su número y su nombre. El caché del navegador o del CDN podría mostrar
// la foto vieja; el id de la fila es nuevo, así que la dirección también.
export function photoUrls(photo) {
  const publicUrl = (path) => supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  return {
    full: `${publicUrl(photo.storage_path)}?v=${photo.id}`,
    thumb: `${publicUrl(thumbPath(photo.storage_path))}?v=${photo.id}`,
  };
}

// Fotos de una recolecta, más lo necesario para subir otras: el id de la
// recolecta (para la tabla) y la carpeta (código + clave del QR).
// Devuelve null si la recolecta no existe o la cuenta no puede verla.
export async function listPhotos(code) {
  const { data, error } = await supabase
    .from('specimens')
    .select('id, qr_token, photos ( id, kind, position, storage_path )')
    .eq('code', code)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  // Orden fijo: por tipo (campo, laboratorio, detalle) y por número.
  const kinds = Object.keys(PHOTO_KINDS);
  const photos = [...data.photos].sort(
    (a, b) => kinds.indexOf(a.kind) - kinds.indexOf(b.kind) || a.position - b.position
  );

  return { code, specimenId: data.id, folder: `${code}-${data.qr_token}`, photos };
}

// Siguiente número libre de ese tipo. Se pregunta a la base justo antes
// de subir (y no a la lista de la página) por si otra persona subió una
// foto a la misma recolecta mientras tanto.
async function nextPosition(specimenId, kind) {
  const { data, error } = await supabase
    .from('photos')
    .select('position')
    .eq('specimen_id', specimenId)
    .eq('kind', kind)
    .order('position', { ascending: false })
    .limit(1);
  if (error) throw error;
  return (data[0]?.position ?? 0) + 1;
}

async function uploadFile(path, blob) {
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: blob.type,
    // Un año: la dirección cambia con ?v= (ver photoUrls), así que el
    // caché nunca muestra una foto equivocada.
    cacheControl: '31536000',
    // Nunca reemplaza un archivo que ya existe: si dos personas suben a la
    // vez una foto del mismo tipo, la segunda falla en vez de borrar la
    // foto de la primera.
    upsert: false,
  });
  if (error) throw error;
}

// Sube una foto ya comprimida (src/photos.js) y la registra en la tabla.
// specimen: lo que devuelve listPhotos(). Devuelve la fila creada.
export async function uploadPhoto(specimen, kind, { full, thumb, extension }) {
  const position = await nextPosition(specimen.specimenId, kind);
  const name = `${specimen.code}_${kind}_${String(position).padStart(2, '0')}`;
  const path = `${specimen.folder}/${name}.${extension}`;

  // Solo se limpian los archivos que subió esta llamada (ver el catch).
  const uploaded = [];
  try {
    await uploadFile(path, full);
    uploaded.push(path);
    await uploadFile(thumbPath(path), thumb);
    uploaded.push(thumbPath(path));

    const { data, error } = await supabase
      .from('photos')
      .insert({ specimen_id: specimen.specimenId, kind, position, storage_path: path })
      .select('id, kind, position, storage_path')
      .single();
    if (error) throw error;
    return data;
  } catch (error) {
    // Si algo falló, no se dejan archivos sin fila: ocuparían espacio y
    // nadie los vería. Si la limpieza también falla, no tapa el error real.
    if (uploaded.length) {
      await supabase.storage
        .from(BUCKET)
        .remove(uploaded)
        .catch(() => {});
    }
    throw error;
  }
}

// Borra una foto. Primero la fila y después los archivos: si se cortara
// la conexión en medio, queda un archivo suelto (solo ocupa espacio) y no
// una fila que apunta a una foto que ya no existe (se vería rota).
export async function deletePhoto(photo) {
  const { error } = await supabase.from('photos').delete().eq('id', photo.id);
  if (error) throw error;

  const { error: storageError } = await supabase.storage
    .from(BUCKET)
    .remove([photo.storage_path, thumbPath(photo.storage_path)]);
  if (storageError)
    console.error('La foto se quitó, pero sus archivos no se borraron', storageError);
}
