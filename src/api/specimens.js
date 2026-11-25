// Recolectas: guardar (y, desde el elemento 15, cargar para editar).
// Igual que el resto de src/api/: las páginas no llaman a Supabase directamente.
import { supabase } from '../supabase.js';

// Guarda el formulario completo con save_specimen (05_save_specimen.sql),
// que escribe todas las tablas en una sola transacción.
// code = null → recolecta nueva; 'CITTED-0077' → edita esa.
// Devuelve el código asignado. Si la base rechaza un dato, el error trae
// code '22023' y un mensaje en español listo para mostrar.
export async function saveSpecimen(code, data) {
    const { data: savedCode, error } = await supabase.rpc('save_specimen', {
        p_code: code,
        p_data: data,
    });
    if (error) throw error;
    return savedCode;
}