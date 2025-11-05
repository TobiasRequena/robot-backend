import express from 'express';
import mqtt from 'mqtt';
import cors from 'cors';
import {insertarDatos} from '../database.js';

const router = express.Router();

// --- CONFIGURACIÓN MQTT ---
const brokerUrl = 'mqtts://569064c9fb5a44a9bf239081608ad7f2.s1.eu.hivemq.cloud:8883';
const options = {
    username: 'Domus',
    password: 'Domus1234+',
    protocol: 'mqtts',
};

const mqttClient = mqtt.connect(brokerUrl, options);

// --- VARIABLES ---
let mediciones = []; // Guarda las últimas 12 lecturas (1 min)
let ultimoDatoRobot = null;

// --- CONEXIÓN MQTT ---
mqttClient.on('connect', () => {
    console.log('🖥 Conectado al broker MQTT');
    mqttClient.subscribe(['robot/sensores'], (err) => {
        if (!err) console.log('✅ Suscripto a robot/sensores');
        else console.error('❌ Error al suscribirse:', err);
    });
});

// --- MANEJO DE MENSAJES MQTT ---
mqttClient.on('message', async (topic, message) => {
    try {
        const data = JSON.parse(message.toString());
        console.log('📥 Recibido:', data);

        if (topic === 'robot/sensores') {
            ultimoDatoRobot = data;
            const { temperatura, humedad, gas } = data;

            // Guardamos solo temp y hum
            mediciones.push({ temperatura, humedad, gas });

            // Si ya hay 12 mediciones (1 minuto)
            if (mediciones.length >= 12) {
                // Calcular promedio
                const promedioTemp = Math.round(
                (mediciones.reduce((acc, d) => acc + d.temperatura, 0) / mediciones.length) * 100
                ) / 100;

                const promedioHum = Math.round(
                (mediciones.reduce((acc, d) => acc + d.humedad, 0) / mediciones.length) * 100
                ) / 100;

                const promedioGas = Math.round(
                (mediciones.reduce((acc, d) => acc + d.gas, 0) / mediciones.length) * 100
                ) / 100;

                // console.log(`📊 Promedio 1 min → Temp: ${promedioTemp.toFixed(2)}°C | Hum: ${promedioHum.toFixed(2)}% `);

                // Guardar en Supabase
                const result = await insertarDatos(
                    'sensores_Data',{
                    temperatura: promedioTemp,
                    humedad: promedioHum,
                    gas: promedioGas
                    }
                );

                if (result.error) console.error('❌ Error al guardar en Supabase:', result.error);
                else console.log('✅ Promedio guardado en Supabase');

                // Limpiar mediciones
                mediciones = [];
            }
        }
    } catch (err) {
        console.error('❌ Error al parsear mensaje MQTT:', err);
    }
});

// --- ENDPOINTS HTTP ---

// Último dato recibido
router.get('/api/sensores', (req, res) => {

    const { temperatura, humedad, gas } = ultimoDatoRobot || {};

    if (ultimoDatoRobot) res.json({ temperatura, humedad, gas });
    else res.status(404).json({ msg: 'Aún no hay datos del robot' });
});

// Últimos promedios guardados
router.get('/api/promedios', async (req, res) => {
    const { data, error } = await supabase
        .from('promedios')
        .select('*')
        .order('id', { ascending: false })
        .limit(10);

    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

export default router;