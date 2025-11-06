import express from 'express';
import { obtenerDatos, insertarDatos, actualizarDatos } from '../database.js';
import { verificarToken } from '../auth/user.js';

const router = express.Router();

/**
 * POST /api/sos/configurar-contactos
 * Configurar teléfono y/o Telegram ID para SOS
 */
router.post('/configurar-contactos', verificarToken, async (req, res) => {
    const { telefono_sos, telegram_id } = req.body;

    if (!telefono_sos && !telegram_id) {
        return res.status(400).json({ 
            error: 'Debes proporcionar al menos un método de contacto (teléfono o Telegram)' 
        });
    }

    const updates = {};

    // Validar teléfono si se proporciona
    if (telefono_sos) {
        const telefonoRegex = /^\+\d{10,15}$/;
        if (!telefonoRegex.test(telefono_sos)) {
            return res.status(400).json({ 
                error: 'Formato de teléfono inválido. Use formato internacional: +5493512345678' 
            });
        }
        updates.telefono_sos = telefono_sos;
    }

    // Validar Telegram ID si se proporciona
    if (telegram_id) {
        // Telegram IDs son números enteros positivos
        if (!/^\d{8,12}$/.test(telegram_id)) {
            return res.status(400).json({ 
                error: 'Telegram ID inválido. Debe ser un número de 8-12 dígitos' 
            });
        }
        updates.telegram_id = telegram_id;
    }

    try {
        const result = await actualizarDatos('usuarios', updates, { id: req.user.id });

        if (!result.success) {
            return res.status(500).json({ error: result.error });
        }

        res.json({
            mensaje: '✅ Contactos SOS configurados correctamente',
            telefono_sos: updates.telefono_sos || null,
            telegram_id: updates.telegram_id || null
        });
    } catch (err) {
        console.error('❌ Error al configurar contactos SOS:', err);
        res.status(500).json({ error: 'Error al configurar contactos' });
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
            telegram_id: usuario.telegram_id || null,
            sos_activado: config.sos_activado !== false,
            sos_auto_enviar: config.sos_auto_enviar || false,
            enviar_por_whatsapp: config.enviar_por_whatsapp !== false,
            enviar_por_telegram: config.enviar_por_telegram !== false,
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
 * Enviar mensaje SOS manual por WhatsApp y/o Telegram
 */
router.post('/enviar', verificarToken, async (req, res) => {
    const { mensaje, tipo_emergencia, dispositivo_id, ubicacion } = req.body;

    try {
        // Obtener datos del usuario
        const userResult = await obtenerDatos('usuarios', { id: req.user.id });
        if (!userResult.success || userResult.data.length === 0) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        const usuario = userResult.data[0];
        const { telefono_sos, telegram_id } = usuario;

        if (!telefono_sos && !telegram_id) {
            return res.status(400).json({ 
                error: 'No tienes contactos SOS configurados. Configúralos primero.' 
            });
        }

        // Obtener configuración
        const configResult = await obtenerDatos('configuracion_usuario', { user_id: req.user.id });
        const config = configResult.data?.[0] || {};

        const mensajeFinal = mensaje || `🚨 ALERTA SOS - Usuario ${req.user.email} activó emergencia. Revisar dispositivo inmediatamente.`;
        const mensajesEnviados = [];

        // Enviar por WhatsApp si está configurado y habilitado
        if (telefono_sos && config.enviar_por_whatsapp !== false) {
            const resultWhatsApp = await insertarDatos('mensajes_sos', {
                user_id: req.user.id,
                dispositivo_id: dispositivo_id || null,
                telefono_destino: telefono_sos,
                telegram_id: null,
                canal: 'whatsapp',
                mensaje: mensajeFinal,
                tipo_emergencia: tipo_emergencia || 'manual',
                estado: 'enviado',
                ubicacion_lat: ubicacion?.lat || null,
                ubicacion_lon: ubicacion?.lon || null,
                metadata: { manual: true }
            });

            if (resultWhatsApp.success) {
                mensajesEnviados.push({
                    canal: 'whatsapp',
                    destino: telefono_sos,
                    id: resultWhatsApp.data[0].id
                });
                console.log(`📱 WhatsApp SOS enviado a ${telefono_sos}`);
            }
        }

        // Enviar por Telegram si está configurado y habilitado
        if (telegram_id && config.enviar_por_telegram !== false) {
            const resultTelegram = await insertarDatos('mensajes_sos', {
                user_id: req.user.id,
                dispositivo_id: dispositivo_id || null,
                telefono_destino: null,
                telegram_id: telegram_id,
                canal: 'telegram',
                mensaje: mensajeFinal,
                tipo_emergencia: tipo_emergencia || 'manual',
                estado: 'enviado',
                ubicacion_lat: ubicacion?.lat || null,
                ubicacion_lon: ubicacion?.lon || null,
                metadata: { manual: true }
            });

            if (resultTelegram.success) {
                mensajesEnviados.push({
                    canal: 'telegram',
                    destino: telegram_id,
                    id: resultTelegram.data[0].id
                });
                console.log(`💬 Telegram SOS enviado a ${telegram_id}`);
                
                // Aquí integrarías con Telegram Bot API
                await enviarMensajeTelegram(telegram_id, mensajeFinal, ubicacion);
            }
        }

        if (mensajesEnviados.length === 0) {
            return res.status(500).json({ error: 'No se pudo enviar ningún mensaje SOS' });
        }

        // Crear alerta en el sistema
        await insertarDatos('alertas', {
            user_id: req.user.id,
            dispositivo_id: dispositivo_id || 1,
            tipo_alerta: 'sos_activado',
            descripcion: `Mensaje SOS enviado por ${mensajesEnviados.map(m => m.canal).join(' y ')}`,
            severidad: 'critica',
            leida: false
        });

        res.json({
            mensaje: '✅ Mensaje SOS enviado correctamente',
            canales_enviados: mensajesEnviados,
            total_enviados: mensajesEnviados.length
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

        // Obtener datos del usuario
        const userResult = await obtenerDatos('usuarios', { id: req.user.id });
        const usuario = userResult.data[0];
        const { telefono_sos, telegram_id } = usuario;

        if (!telefono_sos && !telegram_id) {
            return res.status(400).json({ 
                error: 'No hay contactos SOS configurados' 
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

        const mensajesEnviados = [];

        // Enviar por WhatsApp si está configurado y habilitado
        if (telefono_sos && config.enviar_por_whatsapp !== false) {
            const resultWhatsApp = await insertarDatos('mensajes_sos', {
                user_id: req.user.id,
                dispositivo_id: dispositivo_id || null,
                telefono_destino: telefono_sos,
                telegram_id: null,
                canal: 'whatsapp',
                mensaje,
                tipo_emergencia,
                estado: 'enviado',
                metadata: { automatico: true, valor_actual, ...metadata }
            });

            if (resultWhatsApp.success) {
                mensajesEnviados.push('whatsapp');
                console.log(`📱 WhatsApp SOS AUTOMÁTICO a ${telefono_sos}`);
            }
        }

        // Enviar por Telegram si está configurado y habilitado
        if (telegram_id && config.enviar_por_telegram !== false) {
            const resultTelegram = await insertarDatos('mensajes_sos', {
                user_id: req.user.id,
                dispositivo_id: dispositivo_id || null,
                telefono_destino: null,
                telegram_id: telegram_id,
                canal: 'telegram',
                mensaje,
                tipo_emergencia,
                estado: 'enviado',
                metadata: { automatico: true, valor_actual, ...metadata }
            });

            if (resultTelegram.success) {
                mensajesEnviados.push('telegram');
                console.log(`💬 Telegram SOS AUTOMÁTICO a ${telegram_id}`);
                
                await enviarMensajeTelegram(telegram_id, mensaje);
            }
        }

        // Crear alerta crítica
        await insertarDatos('alertas', {
            user_id: req.user.id,
            dispositivo_id: dispositivo_id || 1,
            tipo_alerta: tipo_emergencia,
            descripcion: `${mensaje} - SOS enviado automáticamente por ${mensajesEnviados.join(' y ')}`,
            valor_actual,
            severidad: 'critica',
            leida: false
        });

        res.json({
            mensaje: '✅ SOS automático enviado',
            canales_enviados: mensajesEnviados,
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
        const { limite = 50, canal } = req.query;

        const filtros = { user_id: req.user.id };
        if (canal && ['whatsapp', 'telegram'].includes(canal)) {
            filtros.canal = canal;
        }

        const result = await obtenerDatos('mensajes_sos', filtros);
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
 * Configurar umbrales y canales para envío automático
 */
router.put('/configurar-umbrales', verificarToken, async (req, res) => {
    const { 
        temperatura_max, 
        co_max, 
        bateria_min, 
        sos_auto_enviar,
        enviar_por_whatsapp,
        enviar_por_telegram
    } = req.body;

    try {
        const configResult = await obtenerDatos('configuracion_usuario', { user_id: req.user.id });

        const umbrales = {
            temperatura_max: temperatura_max || 40,
            co_max: co_max || 50,
            bateria_min: bateria_min || 10
        };

        const updates = {
            sos_umbrales: umbrales
        };

        if (sos_auto_enviar !== undefined) updates.sos_auto_enviar = sos_auto_enviar;
        if (enviar_por_whatsapp !== undefined) updates.enviar_por_whatsapp = enviar_por_whatsapp;
        if (enviar_por_telegram !== undefined) updates.enviar_por_telegram = enviar_por_telegram;

        let result;
        if (configResult.data.length > 0) {
            result = await actualizarDatos('configuracion_usuario', updates, { user_id: req.user.id });
        } else {
            result = await insertarDatos('configuracion_usuario', {
                user_id: req.user.id,
                ...updates
            });
        }

        if (!result.success) {
            return res.status(500).json({ error: result.error });
        }

        res.json({
            mensaje: '✅ Configuración actualizada correctamente',
            umbrales,
            sos_auto_enviar: updates.sos_auto_enviar,
            enviar_por_whatsapp: updates.enviar_por_whatsapp,
            enviar_por_telegram: updates.enviar_por_telegram
        });
    } catch (err) {
        console.error('❌ Error al configurar umbrales:', err);
        res.status(500).json({ error: 'Error al configurar umbrales' });
    }
});

/**
 * DELETE /api/sos/eliminar-contacto
 * Eliminar teléfono SOS o Telegram ID
 */
router.delete('/eliminar-contacto', verificarToken, async (req, res) => {
    const { tipo } = req.query; // 'telefono' o 'telegram'

    if (!tipo || !['telefono', 'telegram'].includes(tipo)) {
        return res.status(400).json({ 
            error: 'Tipo de contacto inválido. Use "telefono" o "telegram"' 
        });
    }

    try {
        const updates = tipo === 'telefono' 
            ? { telefono_sos: null }
            : { telegram_id: null };

        const result = await actualizarDatos('usuarios', updates, { id: req.user.id });

        if (!result.success) {
            return res.status(500).json({ error: result.error });
        }

        res.json({ 
            mensaje: `✅ ${tipo === 'telefono' ? 'Teléfono' : 'Telegram ID'} SOS eliminado` 
        });
    } catch (err) {
        console.error('❌ Error al eliminar contacto:', err);
        res.status(500).json({ error: 'Error al eliminar contacto' });
    }
});

/**
 * POST /api/sos/test-telegram
 * Probar envío de mensaje por Telegram
 */
router.post('/test-telegram', verificarToken, async (req, res) => {
    try {
        const userResult = await obtenerDatos('usuarios', { id: req.user.id });
        const telegram_id = userResult.data[0]?.telegram_id;

        if (!telegram_id) {
            return res.status(400).json({ 
                error: 'No tienes Telegram ID configurado' 
            });
        }

        const mensajeTest = '✅ Prueba de conexión SOS - Tu bot de Telegram está configurado correctamente!';
        
        // Enviar mensaje de prueba
        const enviado = await enviarMensajeTelegram(telegram_id, mensajeTest);

        if (enviado) {
            res.json({ 
                mensaje: '✅ Mensaje de prueba enviado por Telegram',
                telegram_id 
            });
        } else {
            res.status(500).json({ 
                error: 'No se pudo enviar el mensaje de prueba' 
            });
        }
    } catch (err) {
        console.error('❌ Error en prueba Telegram:', err);
        res.status(500).json({ error: 'Error al probar Telegram' });
    }
});

/**
 * Función auxiliar para enviar mensajes por Telegram
 * Debes configurar tu bot token en las variables de entorno
 */
async function enviarMensajeTelegram(chatId, mensaje, ubicacion = null) {
    const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    
    if (!TELEGRAM_BOT_TOKEN) {
        console.error('❌ TELEGRAM_BOT_TOKEN no configurado');
        return false;
    }

    try {
        const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
        
        const body = {
            chat_id: chatId,
            text: mensaje,
            parse_mode: 'HTML'
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        const data = await response.json();

        if (!data.ok) {
            console.error('❌ Error Telegram API:', data);
            return false;
        }

        // Si hay ubicación, enviarla también
        if (ubicacion?.lat && ubicacion?.lon) {
            await enviarUbicacionTelegram(chatId, ubicacion.lat, ubicacion.lon);
        }

        return true;
    } catch (error) {
        console.error('❌ Error al enviar mensaje Telegram:', error);
        return false;
    }
}

/**
 * Función auxiliar para enviar ubicación por Telegram
 */
async function enviarUbicacionTelegram(chatId, lat, lon) {
    const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    
    try {
        const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendLocation`;
        
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                latitude: lat,
                longitude: lon
            })
        });

        return await response.json();
    } catch (error) {
        console.error('❌ Error al enviar ubicación Telegram:', error);
        return null;
    }
}

export default router;
