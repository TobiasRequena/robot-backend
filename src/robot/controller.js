import express from 'express';
import { enviarComandoRobot } from '../mqtt/robotClient.js';
import { verificarToken } from '../auth/user.js';
import { obtenerDatos, insertarDatos } from '../database.js';

const router = express.Router();

/**
 * POST /api/robot/mover
 * Mover el robot en una dirección
 */
router.post('/mover', verificarToken, (req, res) => {
    const { velocidad, direccion } = req.body;

    if (velocidad === undefined || !direccion) {
        return res.status(400).json({ error: 'Faltan velocidad y dirección' });
    }

    const direccionesValidas = ['adelante', 'atras', 'izquierda', 'derecha'];
    if (!direccionesValidas.includes(direccion)) {
        return res.status(400).json({ error: 'Dirección no válida: adelante, atras, izquierda, derecha' });
    }

    if (velocidad < 0 || velocidad > 255) {
        return res.status(400).json({ error: 'Velocidad debe estar entre 0 y 255' });
    }

    const ok = enviarComandoRobot({
        accion: 'mover',
        datos: { velocidad, direccion }
    });

    res.json({
        exito: ok,
        mensaje: ok ? '✅ Comando enviado' : '❌ Error enviando comando',
        comando: { velocidad, direccion }
    });
});

/**
 * POST /api/robot/rotar
 * Rotar el robot
 */
router.post('/rotar', verificarToken, (req, res) => {
    const { angulo } = req.body;

    if (angulo === undefined) {
        return res.status(400).json({ error: 'Ángulo requerido' });
    }

    if (angulo < -360 || angulo > 360) {
        return res.status(400).json({ error: 'Ángulo debe estar entre -360 y 360' });
    }

    const ok = enviarComandoRobot({
        accion: 'rotar',
        datos: { angulo }
    });

    res.json({
        exito: ok,
        mensaje: ok ? '✅ Comando enviado' : '❌ Error enviando comando',
        comando: { angulo }
    });
});

/**
 * POST /api/robot/buscar
 * Buscar un objeto específico
 */
router.post('/buscar', verificarToken, (req, res) => {
    const { objeto, distancia_max } = req.body;

    if (!objeto) {
        return res.status(400).json({ error: 'Objeto a buscar requerido' });
    }

    const ok = enviarComandoRobot({
        accion: 'buscar',
        datos: { objeto, distancia_max: distancia_max || 500 }
    });

    res.json({
        exito: ok,
        mensaje: ok ? '✅ Búsqueda iniciada' : '❌ Error iniciando búsqueda',
        comando: { objeto, distancia_max: distancia_max || 500 }
    });
});

/**
 * POST /api/robot/parar
 * Detener el robot
 */
router.post('/parar', verificarToken, (req, res) => {
    const ok = enviarComandoRobot({ accion: 'parar' });

    res.json({
        exito: ok,
        mensaje: ok ? '✅ Robot detenido' : '❌ Error deteniendo robot'
    });
});

/**
 * POST /api/robot/volver_inicio
 * Devolver robot al punto inicial
 */
router.post('/volver_inicio', verificarToken, (req, res) => {
    const ok = enviarComandoRobot({ accion: 'inicio' });

    res.json({
        exito: ok,
        mensaje: ok ? '✅ Robot retornando al inicio' : '❌ Error en comando'
    });
});

/**
 * POST /api/robot/calibrar
 * Calibrar sensores del robot
 */
router.post('/calibrar', verificarToken, (req, res) => {
    const ok = enviarComandoRobot({ accion: 'calibrar' });

    res.json({
        exito: ok,
        mensaje: ok ? '✅ Calibración iniciada' : '❌ Error en calibración'
    });
});

/**
 * GET /api/robot/posicion
 * Obtener última posición del robot
 */
router.get('/posicion', verificarToken, async (req, res) => {
    try {
        const { limit = 1 } = req.query;
        const result = await obtenerDatos('posicion_robot', { dispositivo_id: 1 });

        if (!result.success) {
            return res.status(500).json({ error: result.error });
        }

        if (result.data.length === 0) {
            return res.json({ 
                mensaje: 'No hay datos de posición disponibles',
                posicion: null 
            });
        }

        const posiciones = result.data
            .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
            .slice(0, parseInt(limit));

        res.json({
            total: posiciones.length,
            data: posiciones
        });
    } catch (err) {
        console.error('❌ Error al obtener posición:', err);
        res.status(500).json({ error: 'Error al obtener posición' });
    }
});

/**
 * GET /api/robot/detecciones
 * Obtener objetos detectados por el robot
 */
router.get('/detecciones', verificarToken, async (req, res) => {
    try {
        const { limite = 50, objeto } = req.query;
        let filters = { dispositivo_id: 1 };
        if (objeto) filters.objeto_detectado = objeto;

        const result = await obtenerDatos('detecciones_objeto', filters);
        if (!result.success) {
            return res.status(500).json({ error: result.error });
        }

        const detecciones = result.data
            .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
            .slice(0, parseInt(limite));

        res.json({
            total: detecciones.length,
            data: detecciones
        });
    } catch (err) {
        console.error('❌ Error al obtener detecciones:', err);
        res.status(500).json({ error: 'Error al obtener detecciones' });
    }
});

/**
 * GET /api/robot/detecciones/:objeto
 * Obtener detecciones de un objeto específico
 */
router.get('/detecciones/:objeto', verificarToken, async (req, res) => {
    try {
        const { objeto } = req.params;
        const { limite = 50 } = req.query;

        const result = await obtenerDatos('detecciones_objeto', { 
            dispositivo_id: 1,
            objeto_detectado: objeto 
        });

        if (!result.success) {
            return res.status(500).json({ error: result.error });
        }

        const detecciones = result.data
            .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
            .slice(0, parseInt(limite));

        res.json({
            objeto,
            total: detecciones.length,
            data: detecciones
        });
    } catch (err) {
        console.error('❌ Error al obtener detecciones:', err);
        res.status(500).json({ error: 'Error al obtener detecciones' });
    }
});

/**
 * GET /api/robot/estado
 * Obtener estado general del robot
 */
router.get('/estado', verificarToken, async (req, res) => {
    try {
        const posResult = await obtenerDatos('posicion_robot', { dispositivo_id: 1 });
        const dispResult = await obtenerDatos('dispositivos', { id: 1 });

        if (!posResult.success || !dispResult.success) {
            return res.status(500).json({ error: 'Error obteniendo estado' });
        }

        const ultimaPosicion = posResult.data?.[0];
        const dispositivo = dispResult.data?.[0];

        res.json({
            dispositivo: dispositivo?.nombre || 'Robot 1',
            estado: dispositivo?.estado || 'desconocido',
            bateria: ultimaPosicion?.bateria || 0,
            posicion: {
                x: ultimaPosicion?.x || 0,
                y: ultimaPosicion?.y || 0,
                angulo: ultimaPosicion?.angulo || 0
            },
            timestamp: ultimaPosicion?.fecha || new Date()
        });
    } catch (err) {
        console.error('❌ Error al obtener estado:', err);
        res.status(500).json({ error: 'Error al obtener estado' });
    }
});

/**
 * GET /api/robot/historial-movimientos
 * Obtener historial de movimientos del robot
 */
router.get('/historial-movimientos', verificarToken, async (req, res) => {
    try {
        const { limite = 100 } = req.query;

        const result = await obtenerDatos('posicion_robot', { dispositivo_id: 1 });
        if (!result.success) {
            return res.status(500).json({ error: result.error });
        }

        const movimientos = result.data
            .sort((a, b) => new Date(a.fecha) - new Date(b.fecha))
            .slice(0, parseInt(limite));

        res.json({
            total: movimientos.length,
            data: movimientos
        });
    } catch (err) {
        console.error('❌ Error al obtener historial:', err);
        res.status(500).json({ error: 'Error al obtener historial' });
    }
});

/**
 * GET /api/robot/resumen
 * Obtener resumen de actividad del robot
 */
router.get('/resumen', verificarToken, async (req, res) => {
    try {
        const posResult = await obtenerDatos('posicion_robot', { dispositivo_id: 1 });
        const detResult = await obtenerDatos('detecciones_objeto', { dispositivo_id: 1 });

        const totalMovimientos = posResult.data?.length || 0;
        const totalDetecciones = detResult.data?.length || 0;

        const objetosUnicos = new Set(detResult.data?.map(d => d.objeto_detectado) || []);

        res.json({
            totalMovimientos,
            totalDetecciones,
            objetosDetectados: Array.from(objetosUnicos),
            ultimaActividad: posResult.data?.[0]?.fecha || null
        });
    } catch (err) {
        console.error('❌ Error al obtener resumen:', err);
        res.status(500).json({ error: 'Error al obtener resumen' });
    }
});

export default router;