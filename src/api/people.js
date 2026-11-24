// Personas que aparecen en los créditos de las recolectas (colector,
// asistentes, identifica, describe, fotografía).
// Igual que catalogs.js: las páginas no llaman a Supabase directamente.
import { supabase } from '../supabase.js';

// Nombre de crédito ("S. Valerio") y nombre completo, si se conoce.
// No se crean personas desde aquí: save_specimen crea las nuevas al
// guardar la recolecta, dentro de la misma transacción.
export async function listPeople() {
    const { data, error } = await supabase
        .from('people')
        .select('id, credit_name, full_name')
        .order('credit_name');
    if (error) throw error;
    return data;
}