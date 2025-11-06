import mqtt from 'mqtt';
import { insertarDatos, supabase } from '../database.js';

const MQTT_BROKER = process.env.MQTT_BROKER || 'mqtt://localhost:1883';
const ROBOT_ID = parseInt(process.env.ROBOT_ID) || 1;
const USER_ID = parseInt(process.env.DEFAULT_USER_ID) || 1;

let mqttClient;
let sensorDataBuffer = {};
let wssInstance = null;

/**
 * Inicializa el cliente MQTT
 */
export function initMQTT(wss) {
    wssInstance = wss;
    mqttClient = mqtt.connect(MQTT_BROKER);

    mqttClient.on('connect', () => {
        console.log('✅ Conectado a broker MQTT');

        mqttClient.subscribe('robot/sensores/#');
        mqttClient.subscribe('robot/posicion/#');
        mqttClient.subscribe('robot/lidar/#');
        mqttClient.subscribe('robot/navegacion/#');
        mqttClient.subscribe('robot/detecciones/#');
    });

    mqttClient.on('message', async (topic, message) => {
        const value = message.toString();
        console.log(`📡 MQTT: ${topic} = ${value}`);

        const tipoSensorMap = {
            'robot/sensores/temperatura': { tipo: 'temperatura', unidad: '°C' },
            'robot/sensores/humedad': { tipo: 'humedad', unidad: '%' },
            'robot/sensores/co2': { tipo: 'co2', unidad: 'ppm' },
            'robot/sensores/pm25': { tipo: 'pm25', unidad: 'µg/m³' },
            'robot/sensores/co': { tipo: 'co', unidad: 'ppm' },
            'robot/sensores/luz': { tipo: 'luz', unidad: 'lux' },
            'robot/sensores/ruido': { tipo: 'ruido', unidad: 'dB' },
            'robot/posicion/x': { tipo: 'posicion_x', unidad: 'cm' },
            'robot/posicion/y': { tipo: 'posicion_y', unidad: 'cm' },
            'robot/posicion/angulo': { tipo: 'angulo', unidad: '°' },
            'robot/navegacion/bateria': { tipo: 'bateria', unidad: '%' },
            'robot/lidar/distancia': { tipo: 'lidar_distancia', unidad: 'cm' }
        };

        const config = tipoSensorMap[topic];
        if (config) {
            const numValue = parseFloat(value);
            sensorDataBuffer[topic] = {
                tipo_sensor: config.tipo,
                valor: isNaN(numValue) ? 0 : numValue,
                unidad: config.unidad,
                timestamp: new Date().toISOString()
            };
        }

        // Broadcast WebSocket
        if (wssInstance) {
            wssInstance.clients.forEach(client => {
                if (client.readyState === 1) {
                    client.send(JSON.stringify({
                        tipo: 'sensor_update',
                        topic,
                        value,
                        timestamp: new Date().toISOString()
                    }));
                }
            });
        }

        // Detectar objetos
        if (topic === 'robot/detecciones/objeto') {
            try {
                const deteccion = JSON.parse(value);
                await insertarDatos('detecciones_objeto', {
                    user_id: USER_ID,
                    dispositivo_id: ROBOT_ID,
                    objeto_detectado: deteccion.objeto,
                    confianza: deteccion.confianza,
                    posicion_x: deteccion.x,
                    posicion_y: deteccion.y,
                    distancia: deteccion.distancia,
                    metadata: deteccion
                });
            } catch (err) {
                console.error('Error procesando detección:', err);
            }
        }

        // Guardar posición
        if (topic.includes('robot/posicion/')) {
            try {
                const posX = parseFloat(sensorDataBuffer['robot/posicion/x']?.valor || 0);
                const posY = parseFloat(sensorDataBuffer['robot/posicion/y']?.valor || 0);

                if (posX !== 0 || posY !== 0) {
                    await insertarDatos('posicion_robot', {
                        user_id: USER_ID,
                        dispositivo_id: ROBOT_ID,
                        x: posX,
                        y: posY,
                        angulo: parseFloat(sensorDataBuffer['robot/posicion/angulo']?.valor || 0),
                        bateria: parseFloat(sensorDataBuffer['robot/navegacion/bateria']?.valor || 100),
                        estado: sensorDataBuffer['robot/navegacion/estado'] || 'activo'
                    });
                }
            } catch (err) {
                console.error('Error guardando posición:', err);
            }
        }
    });

    mqttClient.on('error', (err) => {
        console.error('❌ Error MQTT:', err);
    });

    return mqttClient;
}

/**
 * Enviar comando al robot
 */
export function enviarComandoRobot(comando) {
    if (!mqttClient || !mqttClient.connected) {
        console.error('❌ Cliente MQTT no conectado');
        return false;
    }

    const { accion, datos } = comando;
    const topicos = {
        'mover': { topic: 'robot/cmd/movimiento', payload: datos },
        'rotar': { topic: 'robot/cmd/rotacion', payload: datos },
        'parar': { topic: 'robot/cmd/parar', payload: true },
        'buscar': { topic: 'robot/cmd/buscar_objeto', payload: datos },
        'inicio': { topic: 'robot/cmd/volver_inicio', payload: true },
        'calibrar': { topic: 'robot/cmd/calibrar_sensores', payload: true }
    };

    const config = topicos[accion];
    if (config) {
        const payload = typeof config.payload === 'string'
            ? config.payload
            : JSON.stringify(config.payload);

        mqttClient.publish(config.topic, payload);
        console.log(`📤 Comando enviado: ${accion}`);
        return true;
    }

    return false;
}

/**
 * Guardar datos en batch cada 30 segundos
 */
export async function guardarDatosBuffer() {
    if (Object.keys(sensorDataBuffer).length === 0) return;

    try {
        const datos = Object.values(sensorDataBuffer).map(d => ({
            user_id: USER_ID,
            dispositivo_id: ROBOT_ID,
            tipo_sensor: d.tipo_sensor,
            valor: d.valor,
            unidad: d.unidad,
            metadata: { mqtt_topic: d.timestamp }
        }));

        const { error } = await supabase
            .from('sensor_data')
            .insert(datos);

        if (!error) {
            console.log(`✅ ${datos.length} sensores guardados`);
            sensorDataBuffer = {};
        } else {
            console.error('Error guardando datos:', error);
        }
    } catch (err) {
        console.error('❌ Error guardando datos:', err);
    }
}

export function getMQTTClient() {
    return mqttClient;
}