import express from 'express';
import { obtenerDatos, insertarDatos } from '../database.js';
import { verificarToken } from '../auth/user.js';
import { supabase } from '../database.js';

const router = express.Router();

/**
 * GET /api/sensors
 * Obtener datos de sensores con filtros
 */
router.get('/', verificarToken, async (req, res) => {
    try {
        const { limite = 100, tipo_sensor, dispositivo_id } = req.query;

        let filters = {};
        if (req.user.rol !== 'admin') {
            filters.user_id = req.user.id;
        }
        if (tipo_sensor) filters.tipo_sensor = tipo_sensor;
        if (dispositivo_id) filters.dispositivo_id = parseInt(dispositivo_id);

        const result = await obtenerDatos('sensor_data', filters);
        if (!result.success) {
            return res.status(500).json({ error: result.error });
        }

        const datos = result.data
            .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
            .slice(0, parseInt(limite));

        res.json({
            total: datos.length,
            limite: parseInt(limite),
            data: datos
        });
    } catch (err) {
        console.error('❌ Error al obtener sensores:', err);
        res.status(500).json({ error: 'Error al obtener sensores' });
    }
});

/**
 * POST /api/sensors
 * Guardar un dato de sensor
 */
router.post('/', verificarToken, async (req, res) => {
    const { dispositivo_id, tipo_sensor, valor, unidad, metadata } = req.body;

    if (!dispositivo_id || !tipo_sensor || valor === undefined || !unidad) {
        return res.status(400).json({
            error: 'Faltan datos obligatorios (dispositivo_id, tipo_sensor, valor, unidad)'
        });
    }

    if (typeof valor !== 'number') {
        return res.status(400).json({ error: 'El valor debe ser numérico' });
    }

    try {
        const result = await insertarDatos('sensor_data', {
            user_id: req.user.id,
            dispositivo_id: parseInt(dispositivo_id),
            tipo_sensor,
            valor,
            unidad,
            metadata: metadata || {},
            fecha: new Date().toISOString()
        });

        if (!result.success) {
            return res.status(500).json({ error: result.error });
        }

        res.status(201).json({
            mensaje: '✅ Datos de sensor guardados correctamente',
            dato: result.data[0]
        });
    } catch (err) {
        console.error('❌ Error al guardar datos de sensor:', err);
        res.status(500).json({ error: 'Error al guardar datos de sensor' });
    }
});

/**
 * POST /api/sensors/batch
 * Guardar múltiples datos de sensores en una sola petición
 */
router.post('/batch', verificarToken, async (req, res) => {
    const { dispositivo_id, datos } = req.body;

    if (!dispositivo_id || !Array.isArray(datos) || datos.length === 0) {
        return res.status(400).json({
            error: 'Faltan datos obligatorios (dispositivo_id, datos como array)'
        });
    }

    try {
        const datosFormateados = datos.map(d => ({
            user_id: req.user.id,
            dispositivo_id: parseInt(dispositivo_id),
            tipo_sensor: d.tipo_sensor,
            valor: d.valor,
            unidad: d.unidad,
            metadata: d.metadata || {},
            fecha: new Date().toISOString()
        }));

        // Validar todos los registros
        for (const dato of datosFormateados) {
            if (!dato.tipo_sensor || dato.valor === undefined || !dato.unidad) {
                return res.status(400).json({
                    error: 'Cada dato debe tener: tipo_sensor, valor y unidad'
                });
            }
            if (typeof dato.valor !== 'number') {
                return res.status(400).json({ error: 'Los valores deben ser numéricos' });
            }
        }

        const { data, error } = await supabase
            .from('sensor_data')
            .insert(datosFormateados)
            .select();

        if (error) throw error;

        res.status(201).json({
            mensaje: `✅ ${data.length} registros de sensores guardados correctamente`,
            cantidad: data.length,
            datos: data
        });
    } catch (err) {
        console.error('❌ Error al guardar datos en batch:', err);
        res.status(500).json({ error: 'Error al guardar datos de sensores' });
    }
});

/**
 * GET /api/sensors/stats/:dispositivo_id
 * Obtener estadísticas de un dispositivo
 */
router.get('/stats/:dispositivo_id', verificarToken, async (req, res) => {
    try {
        const { dispositivo_id } = req.params;
        const { tipo_sensor } = req.query;

        let filters = { dispositivo_id: parseInt(dispositivo_id) };
        if (req.user.rol !== 'admin') {
            filters.user_id = req.user.id;
        }
        if (tipo_sensor) filters.tipo_sensor = tipo_sensor;

        const result = await obtenerDatos('sensor_data', filters);
        if (!result.success) {
            return res.status(500).json({ error: result.error });
        }

        if (result.data.length === 0) {
            return res.json({ mensaje: 'No hay datos disponibles', stats: {} });
        }

        const valores = result.data.map(d => d.valor);
        const stats = {
            cantidad: valores.length,
            promedio: (valores.reduce((a, b) => a + b, 0) / valores.length).toFixed(2),
            maximo: Math.max(...valores),
            minimo: Math.min(...valores),
            ultimoRegistro: result.data[0].fecha
        };

        res.json(stats);
    } catch (err) {
        console.error('❌ Error al obtener estadísticas:', err);
        res.status(500).json({ error: 'Error al obtener estadísticas' });
    }
});

/**
 * GET /api/sensors/tipo/:tipo_sensor
 * Obtener datos por tipo de sensor
 */
router.get('/tipo/:tipo_sensor', verificarToken, async (req, res) => {
    try {
        const { tipo_sensor } = req.params;
        const { limite = 50 } = req.query;

        let filters = { tipo_sensor };
        if (req.user.rol !== 'admin') {
            filters.user_id = req.user.id;
        }

        const result = await obtenerDatos('sensor_data', filters);
        if (!result.success) {
            return res.status(500).json({ error: result.error });
        }

        const datos = result.data
            .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
            .slice(0, parseInt(limite));

        res.json({
            tipo_sensor,
            total: datos.length,
            data: datos
        });
    } catch (err) {
        console.error('❌ Error al obtener datos por tipo:', err);
        res.status(500).json({ error: 'Error al obtener datos' });
    }
});

/**
 * GET /api/sensors/estadisticas-publicas
 * Obtener estadísticas públicas (sin autenticación)
 */
router.get('/estadisticas-publicas', async (req, res) => {
    try {
        const result = await obtenerDatos('sensor_data');
        if (!result.success) {
            return res.status(500).json({ error: result.error });
        }

        const tipos = {};
        result.data.forEach(d => {
            if (!tipos[d.tipo_sensor]) {
                tipos[d.tipo_sensor] = [];
            }
            tipos[d.tipo_sensor].push(d.valor);
        });

        const stats = {};
        for (const [tipo, valores] of Object.entries(tipos)) {
            stats[tipo] = {
                cantidad: valores.length,
                promedio: (valores.reduce((a, b) => a + b, 0) / valores.length).toFixed(2),
                maximo: Math.max(...valores),
                minimo: Math.min(...valores)
            };
        }

        res.json(stats);
    } catch (err) {
        console.error('❌ Error al obtener estadísticas públicas:', err);
        res.status(500).json({ error: 'Error al obtener estadísticas' });
    }
});

export default router;