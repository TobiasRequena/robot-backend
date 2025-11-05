import express from 'express';
import { obtenerDatos, insertarDatos, actualizarDatos } from '../database.js';
import { verificarToken } from '../auth/user.js';

const router = express.Router();

/**
 * POST /api/alertas
 * Crear una nueva alerta
 */
router.post('/', verificarToken, async (req, res) => {
    const { dispositivo_id, tipo_alerta, descripcion, valor_actual, umbral, severidad } = req.body;

    if (!dispositivo_id || !tipo_alerta) {
        return res.status(400).json({
            error: 'Faltan datos obligatorios (dispositivo_id, tipo_alerta)'
        });
    }

    try {
        const result = await insertarDatos('alertas', {
            user_id: req.user.id,
            dispositivo_id: parseInt(dispositivo_id),
            tipo_alerta,
            descripcion: descripcion || '',
            valor_actual: valor_actual || null,
            umbral: umbral || null,
            severidad: severidad || 'media',
            leida: false
        });

        if (!result.success) {
            return res.status(500).json({ error: result.error });
        }

        res.status(201).json({
            mensaje: '✅ Alerta creada correctamente',
            alerta: result.data[0]
        });
    } catch (err) {
        console.error('❌ Error al crear alerta:', err);
        res.status(500).json({ error: 'Error al crear alerta' });
    }
});

/**
 * GET /api/alertas
 * Obtener alertas del usuario
 */
router.get('/', verificarToken, async (req, res) => {
    try {
        const { leida, severidad, limite = 50 } = req.query;

        let filters = {};
        if (req.user.rol !== 'admin') {
            filters.user_id = req.user.id;
        }

        const result = await obtenerDatos('alertas', filters);
        if (!result.success) {
            return res.status(500).json({ error: result.error });
        }

        let datos = result.data;

        if (leida !== undefined) {
            datos = datos.filter(a => a.leida === (leida === 'true'));
        }

        if (severidad) {
            datos = datos.filter(a => a.severidad === severidad);
        }

        datos = datos
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
            .slice(0, parseInt(limite));

        res.json({
            total: datos.length,
            data: datos
        });
    } catch (err) {
        console.error('❌ Error al obtener alertas:', err);
        res.status(500).json({ error: 'Error al obtener alertas' });
    }
});

/**
 * GET /api/alertas/no-leidas
 * Obtener alertas no leídas
 */
router.get('/no-leidas', verificarToken, async (req, res) => {
    try {
        const result = await obtenerDatos('alertas', { leida: false });
        if (!result.success) {
            return res.status(500).json({ error: result.error });
        }

        let datos = result.data;
        if (req.user.rol !== 'admin') {
            datos = datos.filter(a => a.user_id === req.user.id);
        }

        datos = datos.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        res.json({
            total: datos.length,
            data: datos
        });
    } catch (err) {
        console.error('❌ Error al obtener alertas no leídas:', err);
        res.status(500).json({ error: 'Error al obtener alertas' });
    }
});

/**
 * PUT /api/alertas/:id/leer
 * Marcar alerta como leída
 */
router.put('/:id/leer', verificarToken, async (req, res) => {
    try {
        const { id } = req.params;

        const result = await actualizarDatos('alertas', { leida: true }, { id: parseInt(id) });
        if (!result.success) {
            return res.status(500).json({ error: result.error });
        }

        res.json({
            mensaje: '✅ Alerta marcada como leída',
            alerta: result.data[0]
        });
    } catch (err) {
        console.error('❌ Error al marcar alerta como leída:', err);
        res.status(500).json({ error: 'Error al marcar alerta' });
    }
});

/**
 * DELETE /api/alertas/:id
 * Eliminar una alerta
 */
router.delete('/:id', verificarToken, async (req, res) => {
    try {
        const { id } = req.params;
        
        // Verificar que la alerta pertenezca al usuario
        const result = await obtenerDatos('alertas', { id: parseInt(id) });
        if (!result.success || result.data.length === 0) {
            return res.status(404).json({ error: 'Alerta no encontrada' });
        }

        if (req.user.rol !== 'admin' && result.data[0].user_id !== req.user.id) {
            return res.status(403).json({ error: 'No tienes permiso para eliminar esta alerta' });
        }

        // Marcar como leída en lugar de eliminar (mejor para auditoría)
        const updateResult = await actualizarDatos('alertas', { leida: true }, { id: parseInt(id) });
        if (!updateResult.success) {
            return res.status(500).json({ error: updateResult.error });
        }

        res.json({ mensaje: '✅ Alerta eliminada correctamente' });
    } catch (err) {
        console.error('❌ Error al eliminar alerta:', err);
        res.status(500).json({ error: 'Error al eliminar alerta' });
    }
});

/**
 * GET /api/alertas/historial
 * Obtener historial de alertas
 */
router.get('/historial', verificarToken, async (req, res) => {
    try {
        const { limite = 100, dispositivo_id } = req.query;

        let filters = {};
        if (req.user.rol !== 'admin') {
            filters.user_id = req.user.id;
        }
        if (dispositivo_id) {
            filters.dispositivo_id = parseInt(dispositivo_id);
        }

        const result = await obtenerDatos('alertas', filters);
        if (!result.success) {
            return res.status(500).json({ error: result.error });
        }

        const datos = result.data
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
            .slice(0, parseInt(limite));

        res.json({
            total: datos.length,
            data: datos
        });
    } catch (err) {
        console.error('❌ Error al obtener historial:', err);
        res.status(500).json({ error: 'Error al obtener historial' });
    }
});

export default router;