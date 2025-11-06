import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import path from "path";

// Cargar variables desde el .env en la raíz del proyecto
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

// Obtener variables
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Validar variables
if (!supabaseUrl || !supabaseKey) {
    console.error("❌ No se encontraron las variables SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
}

// Crear cliente de Supabase
export const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Verifica la conexión a Supabase
 * @returns {Promise<boolean>} true si la conexión es exitosa
 */
export async function verificarConexion() {
    try {
        const { error } = await supabase.from("usuarios").select("id").limit(1);
        if (error) throw error;
        console.log("✅ Conexión a Supabase establecida correctamente.");
        return true;
    } catch (err) {
        console.error("❌ Error al conectar con Supabase:", err.message);
        return false;
    }
}

/**
 * Obtiene datos de una tabla con filtros opcionales
 * @param {string} table - Nombre de la tabla
 * @param {object} filters - Filtros a aplicar (ej: { email: 'user@example.com' })
 * @returns {Promise<object>} Datos obtenidos o error
 */
export async function obtenerDatos(table, filters = {}) {
    try {
        let query = supabase.from(table).select("*");

        // Aplicar filtros
        Object.entries(filters).forEach(([key, value]) => {
            query = query.eq(key, value);
        });

        const { data, error } = await query;
        if (error) throw error;
        return { success: true, data };
    } catch (err) {
        console.error(`❌ Error al obtener datos de ${table}:`, err.message);
        return { success: false, error: err.message };
    }
}

/**
 * Inserta datos en una tabla
 * @param {string} table - Nombre de la tabla
 * @param {object} datos - Datos a insertar
 * @returns {Promise<object>} Datos insertados o error
 */
export async function insertarDatos(table, datos) {
    try {
        const { data, error } = await supabase.from(table).insert([datos]).select();
        if (error) throw error;
        console.log(`✅ Datos insertados en ${table}`);
        return { success: true, data };
    } catch (err) {
        console.error(`❌ Error al insertar datos en ${table}:`, err.message);
        return { success: false, error: err.message };
    }
}

/**
 * Actualiza datos en una tabla
 * @param {string} table - Nombre de la tabla
 * @param {object} datos - Datos a actualizar
 * @param {object} filters - Filtros para identificar qué registros actualizar
 * @returns {Promise<object>} Datos actualizados o error
 */
export async function actualizarDatos(table, datos, filters) {
    try {
        let query = supabase.from(table).update(datos);

        // Aplicar filtros
        Object.entries(filters).forEach(([key, value]) => {
            query = query.eq(key, value);
        });

        const { data, error } = await query.select();
        if (error) throw error;
        console.log(`✅ Datos actualizados en ${table}`);
        return { success: true, data };
    } catch (err) {
        console.error(`❌ Error al actualizar datos en ${table}:`, err.message);
        return { success: false, error: err.message };
    }
}

/**
 * Elimina datos de una tabla
 * @param {string} table - Nombre de la tabla
 * @param {object} filters - Filtros para identificar qué registros eliminar
 * @returns {Promise<object>} Confirmación o error
 */
export async function eliminarDatos(table, filters) {
    try {
        let query = supabase.from(table).delete();

        // Aplicar filtros
        Object.entries(filters).forEach(([key, value]) => {
            query = query.eq(key, value);
        });

        const { error } = await query;
        if (error) throw error;
        console.log(`✅ Datos eliminados de ${table}`);
        return { success: true };
    } catch (err) {
        console.error(`❌ Error al eliminar datos de ${table}:`, err.message);
        return { success: false, error: err.message };
    }
}
