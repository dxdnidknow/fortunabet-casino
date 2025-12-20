// Archivo: backend/middleware/authMiddleware.js
// Middleware de autenticación JWT con validaciones de seguridad

const jwt = require('jsonwebtoken');

function authenticateToken(req, res, next) {
    // 1. Obtener el header de autorización
    const authHeader = req.headers['authorization'] || req.headers['Authorization'];
    
    // 2. Validar formato del header
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Acceso no autorizado. Token no proporcionado.' });
    }
    
    const token = authHeader.substring(7); // Remover "Bearer "
    
    // 3. Validar que el token no esté vacío
    if (!token || token.trim() === '') {
        return res.status(401).json({ message: 'Acceso no autorizado. Token vacío.' });
    }

    // 4. Verificar configuración del servidor
    if (!process.env.JWT_SECRET) {
        console.error("[CRITICAL] JWT_SECRET no configurado en variables de entorno");
        return res.status(500).json({ message: 'Error de configuración del servidor.' });
    }

    // 5. Verificar y decodificar el token
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET, {
            algorithms: ['HS256'], // Solo permitir algoritmo seguro
            maxAge: '1d' // Máximo 1 día de validez
        });
        
        // 6. Validar estructura del payload
        if (!decoded.id || !decoded.username) {
            return res.status(403).json({ message: 'Token inválido. Estructura incorrecta.' });
        }
        
        // 7. Guardar datos del usuario en la petición
        req.user = decoded;
        next();
        
    } catch (err) {
        // Manejar diferentes tipos de errores JWT
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ message: 'Tu sesión ha expirado. Inicia sesión nuevamente.' });
        }
        if (err.name === 'JsonWebTokenError') {
            return res.status(403).json({ message: 'Token no válido.' });
        }
        if (err.name === 'NotBeforeError') {
            return res.status(403).json({ message: 'Token aún no válido.' });
        }
        
        console.error("[Auth] Error verificando token:", err.message);
        return res.status(403).json({ message: 'Error de autenticación.' });
    }
}

module.exports = authenticateToken;