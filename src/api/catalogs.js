// Catálogos que usan los formularios: giras y sitios.
// Todas las llamadas a Supabase de estos temas viven aquí, no en las
// páginas. Si al migrar se cambia Supabase por otro backend, solo se
// reescribe esta carpeta (src/api/), no cada página.
import { supabase } from '../supabase.js';

// Giras, de la más reciente a la más antigua: en campo casi siempre
// se registra la gira que se acaba de hacer.
export async function listTrips() {
    const { data, error } = await supabase
        .from('trips')
        .select('id, name, started_on, ended_on')
        .order('started_on', { ascending: false });
    if (error) throw error;
    return data;
}

// Sitios en orden alfabético. Solo id y nombre: los propietarios
// están en otra tabla (site_owners) que solo ve la administración.
export async function listSites() {
    const { data, error } = await supabase
        .from('sites')
        .select('id, name')
        .order('name');
    if (error) throw error;
    return data;
}