import dotenv from 'dotenv';
dotenv.config();
console.log('OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? '✅ cargada' : '❌ no cargada');
console.log('WEATHER_API_KEY:', process.env.WEATHER_API_KEY ? '✅ cargada' : '❌ no cargada');

import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';

import { verificarConexion } from './src/database.js';
import { initializeDatabase, verificarTablas } from './src/initDatabase.js';

// Rutas
import authRoutes from './src/auth/user.js';
import sensorRoutes from './src/sensor/sensorRoutes.js';
import robotRoutes from './src/robot/controller.js';
import alertasRoutes from './src/alertas/alertasRoutes.js';
import iaRoutes from './src/ia/iaRoutes.js';
import sosRoutes from './src/sos/sosRoutes.js';
import requestToAI from './src/aiModel/aiModelRoute.js';
import climaRoute from './src/apiClima/climaRoute.js';
import { loggerMiddleware } from './src/utils/logger.js';
import { start } from 'repl';
// import { loggerMiddleware } from './src/utils/logger.js';
// import { loggerMiddleware } from './src/utils/logger.js';
// import { start } from 'repl';


const app = express();
const PORT = process.env.PORT || 3000;

// ==================
// MIDDLEWARES
// ==================
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use('/clima', climaRoute);
app.use('/respuestaAI', iaRoutes);

// Permitir lista de orígenes desde env (coma-separado) o localhost por defecto
/* const allowedOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map(s => s.trim())
    : ['http://localhost:5173', 'http://localhost:3000']; */
    
// CORS
const allowedOrigins =
    process.env.CORS_ORIGIN?.split(',').map(s => s.trim()) || '*';

app.use(
    cors({
        origin: (origin, callback) => {
            // Permitir solicitudes sin origin (herramientas tipo Postman)
            if (!origin) return callback(null, true);
            
            if (allowedOrigins.includes('*')) {
                return callback(null, true);
            }
            
            if (allowedOrigins.includes(origin)) {
                return callback(null, true);
            }
            
            return callback(new Error('Not allowed by CORS'));
        },
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization']
    })
);

// app.use(loggerMiddleware);

// ==================
// RUTAS
// ==================
app.get('/health', (_req, res) => {
    res.json({
        status: 'OK',
        message: 'Servidor funcionando correctamente',
        timestamp: new Date(),
        version: '1.0.0',
    });
});

app.get('/api/docs', (_req, res) => {
    res.json({
        version: '1.0.0',
        proyecto: 'Domus - Robot Autónomo con Sensores',
        endpoints: {
            autenticacion: {
                registro: 'POST /api/auth/registro',
                login: 'POST /api/auth/login',
                perfil: 'GET /api/auth/perfil',
                usuarios: 'GET /api/auth/usuarios (admin)',
            },
            sensores: {
                obtener: 'GET /api/sensors',
                crear: 'POST /api/sensors',
                batch: 'POST /api/sensors/batch',
                estadisticas: 'GET /api/sensors/stats/:dispositivo_id',
                publicas: 'GET /api/sensors/estadisticas-publicas',
            },
            robot: {
                mover: 'POST /api/robot/mover',
                rotar: 'POST /api/robot/rotar',
                buscar: 'POST /api/robot/buscar',
                parar: 'POST /api/robot/parar',
                posicion: 'GET /api/robot/posicion',
                detecciones: 'GET /api/robot/detecciones',
                estado: 'GET /api/robot/estado',
            },
            alertas: {
                crear: 'POST /api/alertas',
                obtener: 'GET /api/alertas',
                noLeidas: 'GET /api/alertas/no-leidas',
                marcarLeida: 'PUT /api/alertas/:id/leer',
                historial: 'GET /api/alertas/historial',
            },
            ia: {
                analizar: 'POST /api/ia/analizar',
                chat: 'POST /api/ia/chat',
                historial: 'GET /api/ia/historial',
                stats: 'GET /api/ia/stats',
            },
        },
        websocket: 'ws (mismo puerto que HTTP)',
        mqtt_broker: process.env.MQTT_BROKER || 'mqtt://localhost:1883',
    });
});

// Rutas protegidas
app.use('/api/auth', authRoutes);
app.use('/api/sensors', sensorRoutes);
app.use('/api/robot', robotRoutes);
app.use('/api/alertas', alertasRoutes);
app.use('/api/ia', iaRoutes);
app.use('/api/sos', sosRoutes);

// Extra: endpoint AI
app.use('/requestToAI', requestToAI);

// Ruta raíz
app.get('/', (req, res) => {
    res.json({
        message: '🤖 Domus Backend API',
        version: '1.0.0',
        docs: '/api/docs',
        health: '/health',
    });
});

// 404
app.use((req, res) => {
    res.status(404).json({
        error: 'Ruta no encontrada',
        ruta: req.path,
        metodo: req.method,
    });
});

// Errores generales
app.use((err, _req, res, _next) => {
    console.error('❌ Error:', err.message);
    res.status(err.status || 500).json({
        error: err.message || 'Error interno del servidor',
        timestamp: new Date(),
    });
});

// ==================
// INICIAR SERVIDOR
// ==================
const server = app.listen(PORT, async () => {
    console.log('\n' + '='.repeat(60));
    console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
    console.log(`📊 Health:       http://localhost:${PORT}/health`);
    console.log(`📚 Docs:         http://localhost:${PORT}/api/docs`);
    console.log('='.repeat(60) + '\n');

    // Verificar conexión y DB
    console.log('🔍 Verificando conexión a Supabase...');
    const conexionOK = await verificarConexion();
    if (!conexionOK) {
        console.error('\n❌ No se pudo conectar a Supabase. Abortando...\n');
        process.exit(1);
    }

    console.log('📊 Inicializando base de datos...');
    const bdOK = await initializeDatabase();
    if (!bdOK) {
        console.error('\n❌ No se pudieron inicializar las tablas. Abortando...\n');
        process.exit(1);
    }

    console.log('✅ Verificando tablas...');
    const tablasOK = await verificarTablas();
    if (!tablasOK) {
        console.error('\n❌ Faltan tablas requeridas. Abortando...\n');
        console.log('💡 Ejecutá el SQL en Supabase SQL Editor');
        process.exit(1);
    }

    console.log('✅ ✅ ✅  SISTEMA COMPLETAMENTE LISTO PARA USAR  ✅ ✅ ✅\n');
});

// ==================
// WEBSOCKETS
// ==================
/* const wss = new WebSocketServer({ server });
wss.on('connection', (ws) => {
    console.log('✅ Cliente WebSocket conectado');
    ws.on('close', () => console.log('❌ Cliente WebSocket desconectado'));
}); */


const wss = new WebSocketServer({ server });
const clients = new Set();
const SECRET = process.env.JWT_SECRET || 'change_me_super_secret';

// Utilidad segura para stringify
function safeJSON(obj) {
  try { return JSON.stringify(obj); } catch { return '{"type":"invalid"}'; }
}

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.user_id = null; // se setea tras 'auth'
  clients.add(ws);
  console.log(`✅ WS conectado. Total: ${clients.size}`);

  // Heartbeat
  ws.on('pong', () => { ws.isAlive = true; });

  // Mensajes del cliente
  ws.on('message', (raw) => {
    try {
      const data = JSON.parse(raw.toString());

      // AUTENTICACIÓN: { type:'auth', token }
      if (data?.type === 'auth' && data?.token) {
        try {
          const payload = jwt.verify(data.token, SECRET);
          // soporta payload.id | payload.user.id | payload.sub
          const uid = (payload?.user?.id ?? payload?.id ?? payload?.sub);
          if (!uid) throw new Error('payload_sin_id');

          ws.user_id = Number(uid);
          console.log(`🔐 WS autenticado: user_id=${ws.user_id}`);
          ws.send(safeJSON({ type: 'auth_ok', user_id: ws.user_id }));
        } catch (e) {
          console.error('❌ Token inválido en WS:', e.message);
          ws.send(safeJSON({ type: 'error', error: 'token_invalido' }));
          ws.close(4001, 'Token inválido');
        }
        return;
      }

      // Ping/pong a nivel app (opcional)
      if (data?.type === 'ping') {
        ws.send(safeJSON({ type: 'pong', timestamp: new Date().toISOString() }));
        return;
      }
    } catch {
      // ignorar mensajes no JSON
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
    console.log(`❌ WS cerrado. Total: ${clients.size}`);
  });

  ws.on('error', (err) => {
    console.error('❌ WS error:', err);
    clients.delete(ws);
    try { ws.close(1011, 'Unexpected error'); } catch {}
  });
});

// Heartbeat: detectar clientes caídos
const HEARTBEAT_MS = 30000;
setInterval(() => {
  for (const ws of clients) {
    if (ws.isAlive === false) {
      try { ws.terminate(); } catch {}
      clients.delete(ws);
      continue;
    }
    ws.isAlive = false;
    try { ws.ping(); } catch {}
  }
}, HEARTBEAT_MS);

// ===== Broadcast filtrado por usuario =====
async function broadcastSensorData() {
  try {
    const { supabase } = await import('./src/database.js');

    for (const ws of clients) {
      if (ws.readyState !== 1) continue;   // WebSocket.OPEN
      if (!ws.user_id) continue;           // aún no autenticado

      const uid = ws.user_id;

      const [temp, hum, co] = await Promise.all([
        supabase.from('sensor_data')
          .select('valor')
          .eq('user_id', uid)
          .eq('tipo_sensor', 'temperatura')
          .order('fecha', { ascending: false })
          .limit(1),

        supabase.from('sensor_data')
          .select('valor')
          .eq('user_id', uid)
          .eq('tipo_sensor', 'humedad')
          .order('fecha', { ascending: false })
          .limit(1),

        supabase.from('sensor_data')
          .select('valor')
          .eq('user_id', uid)
          .eq('tipo_sensor', 'co')
          .order('fecha', { ascending: false })
          .limit(1),
      ]);

      if (temp.error || hum.error || co.error) {
        console.error('❌ Supabase error (user):', uid, {
          temp: temp.error, hum: hum.error, co: co.error
        });
        continue;
      }

      const payload = safeJSON({
        type: 'sensor_data',
        timestamp: new Date().toISOString(),
        data: {
          temperature: parseFloat(temp.data?.[0]?.valor ?? 0),
          humidity:    parseFloat(hum.data?.[0]?.valor ?? 0),
          co:          parseFloat(co.data?.[0]?.valor ?? 0),
        }
      });

      try { ws.send(payload); } catch {}
    }
  } catch (e) {
    console.error('❌ broadcastSensorData error:', e);
  }
}

// Enviar cada 5s
setInterval(broadcastSensorData, 5000);
console.log('📡 WS listo: broadcast por usuario cada 5s y heartbeat cada 30s');


// ==================
// MANEJO DE SEÑALES
// ==================
process.on('unhandledRejection', (reason) => {
    console.error('\n⚠️ Promise rechazada sin manejar:', reason);
    process.exit(1);
});

process.on('uncaughtException', (error) => {
    console.error('\n⚠️ Excepción no capturada:', error);
    process.exit(1);
});

process.on('SIGINT', () => {
    console.log('\n\n👋 Servidor apagándose gracefully...');
    wss.close();
    server.close(() => {
        console.log('✅ Servidor cerrado correctamente');
        process.exit(0);
    });
});
