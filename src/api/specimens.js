// Recolectas: guardar y cargar para editar.
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

// Columnas de specimens que usa el formulario. Se nombran una por una
// (no "*") para no traer lo que el formulario no necesita, como qr_token.
const SPECIMEN_COLUMNS = `
  code, trip_id, site_id, locality, collected_on, time_start, time_end,
  environmental_conditions, latitude, longitude, coordinate_precision,
  altitude_min, altitude_max, substrate, uses, identification_text,
  identification_status, identified_on, cabinet, shelf, box, observations,
  publication_status`;

// Las tablas relacionadas vienen en la misma consulta: Supabase las une
// por sus llaves foráneas. field_descriptions y lab_descriptions tienen
// specimen_id como llave primaria, así que llegan como un objeto (o null),
// no como lista.
const SELECT = `${SPECIMEN_COLUMNS},
  taxa ( taxon_order, family, genus, species, authority ),
  field_descriptions ( body_shape, color_fresh, color_handled, odor_fresh, odor_collected,
    forest_location, fruiting_body_count, growth_habit, spore_print, humidity ),
  lab_descriptions ( pileus, hymenophore, stipe, associated_structures, organoleptic, described_on ),
  person_specimen ( role, position, people ( credit_name ) )`;

// Carga una recolecta con la MISMA forma que arma readForm() para
// guardarla (la que espera save_specimen). Así llenar el formulario es
// el camino inverso de guardarlo, sin una lista de campos aparte.
// Devuelve null si no existe (o si la cuenta no puede verla).
export async function getSpecimen(code) {
    const { data, error } = await supabase
        .from('specimens')
        .select(SELECT)
        .eq('code', code)
        .maybeSingle();
    if (error) throw error;
    if (!data) return null;

    const { taxa, field_descriptions, lab_descriptions, person_specimen, ...specimen } = data;

    // Créditos agrupados por rol y en su orden: { collector: ['S. Valerio', …] }
    const people = {};
    for (const credit of [...person_specimen].sort((a, b) => a.position - b.position)) {
        (people[credit.role] ??= []).push(credit.people.credit_name);
    }

    return {
        ...specimen,
        // La base devuelve las horas como "08:30:00"; el formulario usa "08:30".
        time_start: specimen.time_start?.slice(0, 5) ?? null,
        time_end: specimen.time_end?.slice(0, 5) ?? null,
        // En la base la columna es taxon_order ("order" es palabra reservada
        // de SQL); en el formulario es taxon.order.
        taxon: taxa
            ? {
                order: taxa.taxon_order,
                family: taxa.family,
                genus: taxa.genus,
                species: taxa.species,
                authority: taxa.authority,
            }
            : {},
        field: field_descriptions ?? {},
        lab: lab_descriptions ?? {},
        people,
    };
}