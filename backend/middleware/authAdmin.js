// Archivo: backend/middleware/authAdmin.js
// Middleware de autorización para rutas administrativas

const jwt = require('jsonwebtoken');
const { ObjectId } = require('mongodb');
const { getDb } = require('../db');

function authAdmin(req, res, next) {
    // 1. Obtener y validar header de autorización
    const authHeader = req.headers['authorization'] || req.headers['Authorization'];
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Acceso no autorizado.' });
    }
    
    const token = authHeader.substring(7);
    
    if (!token || token.trim() === '') {
        return res.status(401).json({ message: 'Token no proporcionado.' });
    }

    // 2. Verificar configuración
    if (!process.env.JWT_SECRET) {
        console.error("[CRITICAL] JWT_SECRET no configurado");
        return res.status(500).json({ message: 'Error de configuración del servidor.' });
    }

    // 3. Verificar token con opciones de seguridad
    jwt.verify(token, process.env.JWT_SECRET, { 
        algorithms: ['HS256'],
        maxAge: '1d'
    }, async (err, payload) => {
        if (err) {
            const message = err.name === 'TokenExpiredError' 
                ? 'Sesión expirada. Inicia sesión nuevamente.'
                : 'Token no válido.';
            return res.status(403).json({ message });
        }

        try {
            // 4. Validar estructura del payload
            if (!payload.id || !ObjectId.isValid(payload.id)) {
                return res.status(403).json({ message: 'Token inválido.' });
            }

            const userId = payload.id;
            const db = getDb();
            
            // 5. Buscar usuario en BD (solo campos necesarios por seguridad)
            const user = await db.collection('users').findOne(
                { _id: new ObjectId(userId) },
                { projection: { password: 0, otp: 0, otpExpires: 0 } }
            );

            if (!user) {
                return res.status(404).json({ message: 'Usuario no encontrado.' });
            }

            // 6. Verificar que la cuenta esté verificada
            if (!user.isVerified) {
                return res.status(403).json({ message: 'Cuenta no verificada.' });
            }

            // 7. Verificar rol de administrador
            if (user.role !== 'admin') {
                // Log de intento de acceso no autorizado
                console.warn(`[SECURITY] Intento de acceso admin no autorizado: ${user.username} (${user.email})`);
                return res.status(403).json({ message: 'Acceso denegado. Se requiere ser administrador.' });
            }

            // 8. Usuario autorizado como admin
            req.user = user;
            next();

        } catch (error) {
            console.error('[ERROR] en authAdmin:', error);
            res.status(500).json({ message: 'Error interno al verificar privilegios.' });
        }
    });
}

module.exports = authAdmin;