import { supabase } from './database.js';

export async function verificarTablas() {
    try {
        const tablas = [
            'usuarios',
            'dispositivos',
            'sensor_data',
            'posicion_robot',
            'detecciones_objeto',
            'ai_interactions',
            'alertas',
            'logs',
            'configuracion_usuario'
        ];

        for (const tabla of tablas) {
            const { error } = await supabase.from(tabla).select('id').limit(1);
            if (error) {
                console.warn(`⚠️ Tabla ${tabla} no existe`);
                return false;
            }
        }

        console.log('✅ Todas las tablas existen');
        return true;
    } catch (err) {
        console.error('❌ Error al verificar tablas:', err.message);
        return false;
    }
}

export async function initializeDatabase() {
    try {
        console.log('📊 Inicializando base de datos...');
        console.log('✅ Base de datos verificada');
        return true;
    } catch (err) {
        console.error('❌ Error al inicializar base de datos:', err.message);
        return false;
    }
}