import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { obtenerDatos, insertarDatos, actualizarDatos } from '../database.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'tu-clave-secreta-super-segura';

/**
 * Middleware para verificar token JWT
 */
export const verificarToken = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ error: 'Token no proporcionado' });
    }
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(403).json({ error: 'Token inválido o expirado' });
    }
};

/**
 * GET /api/auth/usuarios
 * Obtiene todos los usuarios (solo para admin, protegido por token)
 */
router.get('/usuarios', verificarToken, async (req, res) => {
    try {
        // Validar que sea admin
        if (req.user.rol !== 'admin') {
            return res.status(403).json({ error: 'No tienes permisos para ver usuarios' });
        }

        const result = await obtenerDatos('usuarios');
        if (!result.success) {
            return res.status(500).json({ error: result.error });
        }

        // No enviar contraseñas al cliente
        const usuariosSinPassword = result.data.map(({ password_hash, ...resto }) => resto);
        res.json(usuariosSinPassword);
    } catch (err) {
        console.error('❌ Error al obtener usuarios:', err);
        res.status(500).json({ error: 'Error al obtener usuarios' });
    }
});

/**
 * POST /api/auth/registro
 * Crear nuevo usuario
 */
router.post('/registro', async (req, res) => {
    const { username, email, password } = req.body;

    // Validar datos obligatorios
    if (!username || !email || !password) {
        return res.status(400).json({ 
            error: 'Faltan datos obligatorios (username, email, password)' 
        });
    }

    // Validar formato de email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return res.status(400).json({ error: 'Email inválido' });
    }

    // Validar longitud de contraseña
    if (password.length < 8) {
        return res.status(400).json({ 
            error: 'La contraseña debe tener al menos 8 caracteres' 
        });
    }

    try {
        // Verificar si el usuario ya existe
        const { data: usuarioExistente } = await obtenerDatos('usuarios', { email });
        if (usuarioExistente && usuarioExistente.length > 0) {
            return res.status(409).json({ error: 'El email ya está registrado' });
        }

        // Hash de la contraseña
        const password_hash = await bcrypt.hash(password, 10);

        // Insertar usuario
        const result = await insertarDatos('usuarios', {
            username,
            email,
            password_hash,
            rol: 'user', // Por defecto, rol de usuario normal
            /* creado_en: new Date().toISOString() */
        });

        if (!result.success) {
            return res.status(500).json({ error: result.error });
        }

        // No enviar contraseña en la respuesta
        const { password_hash: _, ...usuarioSeguro } = result.data[0];
        
        res.status(201).json({ 
            mensaje: '✅ Usuario creado correctamente',
            usuario: usuarioSeguro
        });
    } catch (err) {
        console.error('❌ Error al crear usuario:', err);
        res.status(500).json({ error: 'Error al crear usuario' });
    }
});

/**
 * POST /api/auth/login
 * Login de usuario
 */
router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ 
            error: 'Email y contraseña son requeridos' 
        });
    }

    try {
        // Buscar usuario por email
        const result = await obtenerDatos('usuarios', { email });
        if (!result.success || result.data.length === 0) {
            return res.status(401).json({ error: 'Credenciales inválidas' });
        }

        const usuario = result.data[0];

        // Verificar contraseña
        const passwordValida = await bcrypt.compare(password, usuario.password_hash);
        if (!passwordValida) {
            return res.status(401).json({ error: 'Credenciales inválidas' });
        }

        // Generar JWT
        const token = jwt.sign(
            { 
                id: usuario.id, 
                email: usuario.email, 
                rol: usuario.rol 
            },
            JWT_SECRET,
            { expiresIn: '7d' } // Token válido por 7 días
        );

        // Actualizar último login
        await actualizarDatos('usuarios', 
            { ultimo_login: new Date().toISOString() },
            { id: usuario.id }
        );

        res.json({ 
            mensaje: '✅ Login exitoso',
            token,
            usuario: {
                id: usuario.id,
                username: usuario.username,
                email: usuario.email,
                rol: usuario.rol,
                telefono_sos: usuario.telefono_sos || null
            }
        });
    } catch (err) {
        console.error('❌ Error en login:', err);
        res.status(500).json({ error: 'Error en el proceso de login' });
    }
});

/**
 * POST /api/auth/refresh
 * Refrescar token JWT
 */
router.post('/refresh', async (req, res) => {
    try {
        // Verificar si hay un token válido en el header
        const token = req.headers.authorization?.split(' ')[1];
        
        if (!token) {
            return res.status(401).json({ error: 'Token no proporcionado' });
        }

        // Verificar y decodificar el token
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            
            // Buscar al usuario para asegurarnos de que existe
            const result = await obtenerDatos('usuarios', { id: decoded.id });
            if (!result.success || result.data.length === 0) {
                return res.status(404).json({ error: 'Usuario no encontrado' });
            }

            const usuario = result.data[0];

            // Generar nuevo token
            const newToken = jwt.sign(
                { 
                    id: usuario.id, 
                    email: usuario.email, 
                    rol: usuario.rol 
                },
                JWT_SECRET,
                { expiresIn: '7d' }
            );

            res.json({ 
                accessToken: newToken,
                usuario: {
                    id: usuario.id,
                    username: usuario.username,
                    email: usuario.email,
                    rol: usuario.rol,
                    telefono_sos: usuario.telefono_sos || null
                }
            });
        } catch (jwtError) {
            return res.status(403).json({ error: 'Token inválido o expirado' });
        }
    } catch (err) {
        console.error('❌ Error en refresh:', err);
        res.status(500).json({ error: 'Error al refrescar token' });
    }
});

/**
 * POST /api/auth/logout
 * Logout de usuario (simplemente devuelve OK)
 */
router.post('/logout', (req, res) => {
    res.json({ mensaje: '✅ Logout exitoso' });
});

/**
 * GET /api/auth/perfil
 * Obtener perfil del usuario autenticado
 */
router.get('/perfil', verificarToken, async (req, res) => {
    try {
        const result = await obtenerDatos('usuarios', { id: req.user.id });
        if (!result.success || result.data.length === 0) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        const { password_hash, ...usuarioSeguro } = result.data[0];
        
        res.json(usuarioSeguro);
    } catch (err) {
        console.error('❌ Error al obtener perfil:', err);
        res.status(500).json({ error: 'Error al obtener perfil' });
    }
});

export default router;

//funcional