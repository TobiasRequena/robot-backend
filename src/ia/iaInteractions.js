import express from 'express';
import { getOpenAIClient } from '../aiModel/aiModel.js';
import { obtenerDatos, insertarDatos } from '../database.js';
import { verificarToken } from '../auth/user.js';
import { guardarClima } from '../apiClima/clima.js';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

async function ejecutarAnalisisIA() {
    if (!OPENAI_API_KEY) {
        return res.status(500).json({ error: 'OpenAI API Key no configurada' });
    }

    try {
        const dispositivos = [
            { id: 2, nombre: 'Sensor de temperatura' },
            { id: 3, nombre: 'Sensor de humedad' }
        ];
        const datosClimaCiudad = await guardarClima();
        const climaJSON = JSON.stringify(datosClimaCiudad, null, 2);

        let contexto = 'Datos más recientes de los sensores:\n\n';

        for (const dispositivo of dispositivos) {
            const result = await obtenerDatos('sensor_data', { dispositivo_id: dispositivo.id });
            if (result.success && result.data.length > 0) {
                const ultimo = result.data[result.data.length - 1];
                contexto += `${dispositivo.nombre}:\n${JSON.stringify(ultimo, null, 2)}\n\n`;
            } else {
                contexto += `${dispositivo.nombre}: sin datos disponibles.\n\n`;
            }
        }

        const openai = getOpenAIClient();
        const prompt = `
            Eres un asistente experto en análisis de datos ambientales y robótica.
            Compara los datos de los sensores interiores del hogar con los datos del clima de la ciudad y dar una recomendación razonada.
            Proporciona una respuesta JSON que siga estrictamente el formato definido.

            La recomendación debe comparar explícitamente los valores interiores y exteriores. 
            Ejemplo de recomendación:
            "La diferencia entre la temperatura interior (22°C) y exterior (18°C) es leve. Mantén ventilación adecuada."

            Datos del clima de la ciudad (exterior):
            ${climaJSON}

            Datos del hogar (interior):
            ${contexto}

            Proporciona los valores en el campo "datos_relevantes" para "interior" (sensores dentro del hogar) y "exterior" (datos del clima de la ciudad).
            En la respuesta no incluyas texto adicional, solo los datos JSON según el schema.
            `;

        const response = await openai.responses.create({
            model: "gpt-4o-mini",
            input: prompt,
            text: {
                format: {
                    name: "analisis_ambiental",
                    type: "json_schema",
                    schema: {
                        type: "object",
                        properties: {
                            calidad_aire: { type: "string", enum: ["Muy mala", "Mala", "Buena", "Muy buena", "Excelente"] },
                            nivel_riesgo: { type: "string", enum: ["Muy bajo", "Bajo", "Medio", "Alto", "Muy alto"] },
                            recomendacion: { type: "string" },
                            datos_relevantes: {
                                type: "object",
                                properties: {
                                    interior: {
                                        type: "object",
                                        properties: {
                                            temperatura: { type: "number", nullable: true },
                                            humedad: { type: "number", nullable: true }
                                        },
                                        required: ["temperatura", "humedad"],
                                        additionalProperties: false
                                    },
                                    exterior: {
                                        type: "object",
                                        properties: {
                                            ciudad: { type: "string", nullable: true },
                                            temperatura: { type: "number", nullable: true },
                                            humedad: { type: "number", nullable: true },
                                            condicion: { type: "string", nullable: true },
                                            viento_kph: { type: "number", nullable: true }
                                        },
                                        required: ["ciudad", "temperatura", "humedad", "condicion", "viento_kph"],
                                        additionalProperties: false
                                    }
                                },
                                required: ["interior", "exterior"],
                                additionalProperties: false,
                            }
                        },
                        required: ["calidad_aire", "nivel_riesgo", "recomendacion", "datos_relevantes"],
                        additionalProperties: false
                    }
                }
            }
        });

        const contenido = response.output[0]?.content?.[0];
        const textoIA = contenido?.parsed || contenido?.text || null;

        if (!textoIA) {
            throw new Error('La IA no devolvio una respuesta valida');
        }

        await insertarDatos('ai_interactions', {
            user_id: 1,
            prompt: prompt,
            response: JSON.stringify(textoIA),
            model: 'gpt-4o-mini',
            metadata: { tipo_analisis: 'general' }
        });

        console.log('✅ Análisis IA ejecutado correctamente');
        return textoIA;
    } catch (error) {
        console.error('❌ Error al construir contexto de sensores:', error.message);
        throw error;
    }
}

export const analisisIA = async (req, res) => {
    try {
        const textoAI = await ejecutarAnalisisIA();
        res.status(200).json({
            message: textoAI,
            model: 'gpt-4o-mini'
        })
    } catch (err) {
        console.error('❌ Error en análisis IA:', err.message);
        res.status(500).json({ error: 'Error al procesar análisis con IA' });
    }
};