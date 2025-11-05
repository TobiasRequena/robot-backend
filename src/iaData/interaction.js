import express from 'express';
import { obtenerDatos, insertarDatos, actualizarDatos } from '../database.js';
import { verificarToken } from '../auth/user.js';

const router = express.Router();

/**
 * GET /api/data/interacciones_ia
 * Obtener todas las interacciones IA (protegido)
 */
router.get('/interacciones_ia', verificarToken, async (req, res) => {
    try {
        const { limit = 50, offset = 0 } = req.query;

        // Si no es admin, solo ver sus propias interacciones
        const filters = req.user.rol === 'admin' ? {} : { user_id: req.user.id };

        const result = await obtenerDatos('ai_interactions', filters);
        if (!result.success) {
            return res.status(500).json({ error: result.error });
        }

        // Paginar resultados
        const data = result.data.slice(offset, offset + limit);
        res.json({ 
            total: result.data.length, 
            limit: parseInt(limit), 
            offset: parseInt(offset),
            data 
        });
    } catch (err) {
        console.error('❌ Error al obtener interacciones IA:', err);
        res.status(500).json({ error: 'Error al obtener interacciones IA' });
    }
});

/**
 * POST /api/data/interacciones_ia
 * Crear nueva interacción IA
 */
router.post('/interacciones_ia', verificarToken, async (req, res) => {
    const { prompt, response, model, tokens_used, metadata } = req.body;
    const user_id = req.user.id; // Del token JWT

    // Validar datos obligatorios
    if (!prompt || !response || !model) {
        return res.status(400).json({ 
            error: 'Faltan datos obligatorios (prompt, response, model)' 
        });
    }

    try {
        const result = await insertarDatos('ai_interactions', {
            user_id,
            prompt,
            response,
            model,
            tokens_used: tokens_used || 0,
            metadata: metadata || {},
        });

        if (!result.success) {
            return res.status(500).json({ error: result.error });
        }

        res.status(201).json({ 
            mensaje: '✅ Interacción guardada correctamente',
            interaccion: result.data[0]
        });
    } catch (err) {
        console.error('❌ Error al guardar interacción:', err);
        res.status(500).json({ error: 'Error al guardar interacción' });
    }
});

/**
 * GET /api/data/sensores
 * Obtener datos de sensores (últimos registros)
 */
router.get('/sensores', verificarToken, async (req, res) => {
    try {
        const { tipo, limite = 100 } = req.query;
        
        // Si no es admin, solo ver datos de sus propios dispositivos
        const filters = req.user.rol === 'admin' ? {} : { user_id: req.user.id };
        if (tipo) filters.tipo_sensor = tipo;

        const result = await obtenerDatos('sensor_data', filters);
        if (!result.success) {
            return res.status(500).json({ error: result.error });
        }

        // Ordenar por fecha descendente y limitar
        const data = result.data
            .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
            .slice(0, parseInt(limite));

        res.json({ 
            total: data.length,
            data 
        });
    } catch (err) {
        console.error('❌ Error al obtener datos de sensores:', err);
        res.status(500).json({ error: 'Error al obtener datos de sensores' });
    }
});

/**
 * POST /api/data/sensores
 * Guardar datos de sensores
 */
router.post('/sensores', verificarToken, async (req, res) => {
    const { dispositivo_id, tipo_sensor, valor, unidad, metadata } = req.body;
    const user_id = req.user.id;

    // Validar datos obligatorios
    if (!dispositivo_id || !tipo_sensor || valor === undefined || !unidad) {
        return res.status(400).json({ 
            error: 'Faltan datos obligatorios (dispositivo_id, tipo_sensor, valor, unidad)' 
        });
    }

    // Validar que el valor sea numérico
    if (typeof valor !== 'number') {
        return res.status(400).json({ error: 'El valor debe ser numérico' });
    }

    try {
        const result = await insertarDatos('sensor_data', {
            user_id,
            dispositivo_id,
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
 * POST /api/data/sensores/batch
 * Guardar múltiples datos de sensores en una sola petición (útil para IoT)
 */
router.post('/sensores/batch', verificarToken, async (req, res) => {
    const { dispositivo_id, datos } = req.body;
    const user_id = req.user.id;

    if (!dispositivo_id || !Array.isArray(datos) || datos.length === 0) {
        return res.status(400).json({ 
            error: 'Faltan datos obligatorios (dispositivo_id, datos como array)' 
        });
    }

    try {
        const datosFormateados = datos.map(d => ({
            user_id,
            dispositivo_id,
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

        // Insertar todo de una vez (más eficiente)
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
        console.error('❌ Error al guardar datos de sensores en batch:', err);
        res.status(500).json({ error: 'Error al guardar datos de sensores' });
    }
});

/**
 * GET /api/data/sensores/stats/:dispositivo_id
 * Obtener estadísticas de un dispositivo (promedio, máximo, mínimo)
 */
router.get('/sensores/stats/:dispositivo_id', verificarToken, async (req, res) => {
    try {
        const { dispositivo_id } = req.params;
        const { tipo_sensor } = req.query;

        const filters = { dispositivo_id };
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

export default router;