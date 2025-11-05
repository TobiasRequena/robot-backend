import express from 'express';
import { obtenerDatos, insertarDatos, actualizarDatos } from '../database.js';
import { verificarToken } from '../auth/user.js';

const router = express.Router();

/**
 * POST /api/sos/configurar-telefono
 * Configurar número de teléfono SOS
 */
router.post('/configurar-telefono', verificarToken, async (req, res) => {
    const { telefono_sos } = req.body;

    if (!telefono_sos) {
        return res.status(400).json({ error: 'Número de teléfono requerido' });
    }

    // Validar formato de teléfono (debe incluir código de país)
    const telefonoRegex = /^\+\d{10,15}$/;
    if (!telefonoRegex.test(telefono_sos)) {
        return res.status(400).json({ 
            error: 'Formato inválido. Use formato internacional: +5493512345678' 
        });
    }

    try {
        const result = await actualizarDatos('usuarios', 
            { telefono_sos },
            { id: req.user.id }
        );

        if (!result.success) {
            return res.status(500).json({ error: result.error });
        }

        res.json({
            mensaje: '✅ Teléfono SOS configurado correctamente',
            telefono_sos
        });
    } catch (err) {
        console.error('❌ Error al configurar teléfono SOS:', err);
        res.status(500).json({ error: 'Error al configurar teléfono' });
    }
});

/**
 * GET /api/sos/configuracion
 * Obtener configuración SOS del usuario
 */
router.get('/configuracion', verificarToken, async (req, res) => {
    try {
        const userResult = await obtenerDatos('usuarios', { id: req.user.id });
        const configResult = await obtenerDatos('configuracion_usuario', { user_id: req.user.id });

        if (!userResult.success) {
            return res.status(500).json({ error: userResult.error });
        }

        const usuario = userResult.data[0];
        const config = configResult.data?.[0] || {};

        res.json({
            telefono_sos: usuario.telefono_sos || null,
            sos_activado: config.sos_activado !== false,
            sos_auto_enviar: config.sos_auto_enviar || false,
            sos_umbrales: config.sos_umbrales || {
                temperatura_max: 40,
                co_max: 50,
                bateria_min: 10
            }
        });
    } catch (err) {
        console.error('❌ Error al obtener configuración SOS:', err);
        res.status(500).json({ error: 'Error al obtener configuración' });
    }
});

/**
 * POST /api/sos/enviar
 * Enviar mensaje SOS manual
 */
router.post('/enviar', verificarToken, async (req, res) => {
    const { mensaje, tipo_emergencia, dispositivo_id, ubicacion } = req.body;

    try {
        // Obtener teléfono SOS del usuario
        const userResult = await obtenerDatos('usuarios', { id: req.user.id });
        if (!userResult.success || userResult.data.length === 0) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        const telefono_sos = userResult.data[0].telefono_sos;
        if (!telefono_sos) {
            return res.status(400).json({ 
                error: 'No tienes un teléfono SOS configurado. Configúralo primero.' 
            });
        }

        // Mensaje por defecto si no se proporciona
        const mensajeFinal = mensaje || ` ALERTA SOS - Usuario ${req.user.email} activó emergencia. Revisar dispositivo inmediatamente.`;

        // Guardar en BD
        const result = await insertarDatos('mensajes_sos', {
            user_id: req.user.id,
            dispositivo_id: dispositivo_id || null,
            telefono_destino: telefono_sos,
            mensaje: mensajeFinal,
            tipo_emergencia: tipo_emergencia || 'manual',
            estado: 'enviado',
            ubicacion_lat: ubicacion?.lat || null,
            ubicacion_lon: ubicacion?.lon || null,
            metadata: { manual: true }
        });

        if (!result.success) {
            return res.status(500).json({ error: result.error });
        }

        // Aquí integrarías con API de WhatsApp (Twilio, WhatsApp Business API, etc)
        // Por ahora solo lo guardamos en BD
        console.log(`📱 SOS enviado a ${telefono_sos}: ${mensajeFinal}`);

        // Crear alerta en el sistema
        await insertarDatos('alertas', {
            user_id: req.user.id,
            dispositivo_id: dispositivo_id || 1,
            tipo_alerta: 'sos_activado',
            descripcion: `Mensaje SOS enviado a ${telefono_sos}`,
            severidad: 'critica',
            leida: false
        });

        res.json({
            mensaje: '✅ Mensaje SOS enviado correctamente',
            telefono_destino: telefono_sos,
            id_mensaje: result.data[0].id,
            enviado_at: result.data[0].enviado_at
        });
    } catch (err) {
        console.error('❌ Error al enviar SOS:', err);
        res.status(500).json({ error: 'Error al enviar mensaje SOS' });
    }
});

/**
 * POST /api/sos/enviar-automatico
 * Envío automático por detección de emergencia
 */
router.post('/enviar-automatico', verificarToken, async (req, res) => {
    const { tipo_emergencia, valor_actual, dispositivo_id, metadata } = req.body;

    if (!tipo_emergencia || !valor_actual) {
        return res.status(400).json({ 
            error: 'tipo_emergencia y valor_actual son requeridos' 
        });
    }

    try {
        // Verificar configuración
        const configResult = await obtenerDatos('configuracion_usuario', { user_id: req.user.id });
        const config = configResult.data?.[0];

        if (!config?.sos_activado) {
            return res.status(400).json({ 
                error: 'Sistema SOS no está activado' 
            });
        }

        if (!config?.sos_auto_enviar) {
            return res.status(400).json({ 
                error: 'Envío automático no está activado' 
            });
        }

        // Obtener teléfono SOS
        const userResult = await obtenerDatos('usuarios', { id: req.user.id });
        const telefono_sos = userResult.data[0]?.telefono_sos;

        if (!telefono_sos) {
            return res.status(400).json({ 
                error: 'No hay teléfono SOS configurado' 
            });
        }

        // Construir mensaje automático
        const mensajes = {
            temperatura_critica: `🔥 EMERGENCIA: Temperatura crítica de ${valor_actual}°C detectada`,
            gas_detectado: `💨 EMERGENCIA: Nivel de gas peligroso detectado: ${valor_actual}ppm`,
            co_detectado: `☠️ EMERGENCIA: Monóxido de carbono detectado: ${valor_actual}ppm`,
            bateria_baja: `🔋 ALERTA: Batería crítica del robot: ${valor_actual}%`,
            obstaculo: `⚠️ ALERTA: Robot detenido por obstáculo`,
            conexion_perdida: `📡 ALERTA: Conexión perdida con dispositivo`
        };

        const mensaje = mensajes[tipo_emergencia] || 
            `🚨 EMERGENCIA detectada: ${tipo_emergencia}`;

        // Guardar en BD
        const result = await insertarDatos('mensajes_sos', {
            user_id: req.user.id,
            dispositivo_id: dispositivo_id || null,
            telefono_destino: telefono_sos,
            mensaje,
            tipo_emergencia,
            estado: 'enviado',
            metadata: { automatico: true, valor_actual, ...metadata }
        });

        if (!result.success) {
            return res.status(500).json({ error: result.error });
        }

        console.log(`📱 SOS AUTOMÁTICO enviado a ${telefono_sos}: ${mensaje}`);

        // Crear alerta crítica
        await insertarDatos('alertas', {
            user_id: req.user.id,
            dispositivo_id: dispositivo_id || 1,
            tipo_alerta: tipo_emergencia,
            descripcion: `${mensaje} - SOS enviado automáticamente`,
            valor_actual,
            severidad: 'critica',
            leida: false
        });

        res.json({
            mensaje: '✅ SOS automático enviado',
            telefono_destino: telefono_sos,
            tipo_emergencia
        });
    } catch (err) {
        console.error('❌ Error en SOS automático:', err);
        res.status(500).json({ error: 'Error al enviar SOS automático' });
    }
});

/**
 * GET /api/sos/historial
 * Obtener historial de mensajes SOS enviados
 */
router.get('/historial', verificarToken, async (req, res) => {
    try {
        const { limite = 50 } = req.query;

        const result = await obtenerDatos('mensajes_sos', { user_id: req.user.id });
        if (!result.success) {
            return res.status(500).json({ error: result.error });
        }

        const mensajes = result.data
            .sort((a, b) => new Date(b.enviado_at) - new Date(a.enviado_at))
            .slice(0, parseInt(limite));

        res.json({
            total: mensajes.length,
            data: mensajes
        });
    } catch (err) {
        console.error('❌ Error al obtener historial SOS:', err);
        res.status(500).json({ error: 'Error al obtener historial' });
    }
});

/**
 * PUT /api/sos/configurar-umbrales
 * Configurar umbrales para envío automático
 */
router.put('/configurar-umbrales', verificarToken, async (req, res) => {
    const { temperatura_max, co_max, bateria_min, sos_auto_enviar } = req.body;

    try {
        // Verificar si existe configuración
        const configResult = await obtenerDatos('configuracion_usuario', { user_id: req.user.id });

        const umbrales = {
            temperatura_max: temperatura_max || 40,
            co_max: co_max || 50,
            bateria_min: bateria_min || 10
        };

        let result;
        if (configResult.data.length > 0) {
            // Actualizar existente
            result = await actualizarDatos('configuracion_usuario',
                { 
                    sos_umbrales: umbrales,
                    sos_auto_enviar: sos_auto_enviar !== undefined ? sos_auto_enviar : configResult.data[0].sos_auto_enviar
                },
                { user_id: req.user.id }
            );
        } else {
            // Crear nuevo
            result = await insertarDatos('configuracion_usuario', {
                user_id: req.user.id,
                sos_umbrales: umbrales,
                sos_auto_enviar: sos_auto_enviar || false
            });
        }

        if (!result.success) {
            return res.status(500).json({ error: result.error });
        }

        res.json({
            mensaje: '✅ Umbrales configurados correctamente',
            umbrales,
            sos_auto_enviar
        });
    } catch (err) {
        console.error('❌ Error al configurar umbrales:', err);
        res.status(500).json({ error: 'Error al configurar umbrales' });
    }
});

/**
 * DELETE /api/sos/eliminar-telefono
 * Eliminar teléfono SOS
 */
router.delete('/eliminar-telefono', verificarToken, async (req, res) => {
    try {
        const result = await actualizarDatos('usuarios',
            { telefono_sos: null },
            { id: req.user.id }
        );

        if (!result.success) {
            return res.status(500).json({ error: result.error });
        }

        res.json({ mensaje: '✅ Teléfono SOS eliminado' });
    } catch (err) {
        console.error('❌ Error al eliminar teléfono:', err);
        res.status(500).json({ error: 'Error al eliminar teléfono' });
    }
});

export default router;