import express from 'express';
import axios from 'axios';
import { obtenerDatos, insertarDatos } from '../database.js';
import { verificarToken } from '../auth/user.js';
import { analisisIA } from './iaInteractions.js';

const router = express.Router();

router.get('/analizar', /*verificarToken,*/ analisisIA);

/**
 * POST /api/ia/chat
 * Chat general con IA
 */
// router.post('/chat', verificarToken, async (req, res) => {
//     const { mensaje } = req.body;

//     if (!mensaje) {
//         return res.status(400).json({ error: 'Mensaje requerido' });
//     }

//     if (!OPENAI_API_KEY) {
//         return res.status(500).json({ error: 'OpenAI API Key no configurada' });
//     }

//     try {
//         const response = await axios.post(
//             OPENAI_API_URL,
//             {
//                 model: 'gpt-3.5-turbo',
//                 messages: [
//                     { role: 'system', content: 'Eres un asistente amable y útil para el proyecto Domus de robótica.' },
//                     { role: 'user', content: mensaje }
//                 ],
//                 max_tokens: 500,
//                 temperature: 0.7
//             },
//             {
//                 headers: {
//                     'Authorization': `Bearer ${OPENAI_API_KEY}`,
//                     'Content-Type': 'application/json'
//                 }
//             }
//         );

//         const respuestaIA = response.data.choices[0].message.content;
//         const tokensUsados = response.data.usage.total_tokens;

//         // Guardar conversación
//         await insertarDatos('ai_interactions', {
//             user_id: req.user.id,
//             prompt: mensaje,
//             response: respuestaIA,
//             model: 'gpt-3.5-turbo',
//             tokens_used: tokensUsados,
//             metadata: { tipo: 'chat' }
//         });

//         res.json({
//             respuesta: respuestaIA,
//             tokens: tokensUsados
//         });
//     } catch (err) {
//         console.error('❌ Error en chat IA:', err.message);
//         res.status(500).json({ error: 'Error al procesar chat con IA' });
//     }
// });

/**
 * GET /api/ia/historial
 * Obtener historial de interacciones
 */
router.get('/historial', verificarToken, async (req, res) => {
    try {
        const { limite = 50 } = req.query;

        let filters = {};
        if (req.user.rol !== 'admin') {
            filters.user_id = req.user.id;
        }

        const result = await obtenerDatos('ai_interactions', filters);
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

/**
 * GET /api/ia/stats
 * Obtener estadísticas de uso de IA
 */
router.get('/stats', verificarToken, async (req, res) => {
    try {
        let filters = {};
        if (req.user.rol !== 'admin') {
            filters.user_id = req.user.id;
        }

        const result = await obtenerDatos('ai_interactions', filters);
        if (!result.success) {
            return res.status(500).json({ error: result.error });
        }

        const datos = result.data;
        const totalTokens = datos.reduce((sum, d) => sum + (d.tokens_used || 0), 0);
        const totalCosto = datos.reduce((sum, d) => sum + (d.costo || 0), 0);

        res.json({
            totalInteracciones: datos.length,
            totalTokens,
            totalCosto: totalCosto.toFixed(4),
            promedioTokensPorInteraccion: (totalTokens / datos.length).toFixed(0),
            modelos: [...new Set(datos.map(d => d.model))]
        });
    } catch (err) {
        console.error('❌ Error al obtener estadísticas:', err);
        res.status(500).json({ error: 'Error al obtener estadísticas' });
    }
});

export default router;