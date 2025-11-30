// Archivo: backend/middleware/authMiddleware.js
const jwt = require('jsonwebtoken');

function authenticateToken(req, res, next) {
    // 1. Obtener el header (Maneja mayúsculas/minúsculas por si acaso)
    const authHeader = req.headers['authorization'] || req.headers['Authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Formato: "Bearer TOKEN"

    if (token == null) {
        console.log("[Auth] No se recibió token");
        return res.status(401).json({ message: 'Acceso no autorizado. Falta token.' });
    }

    if (!process.env.JWT_SECRET) {
        console.error("[Auth] ERROR CRÍTICO: No hay JWT_SECRET en .env");
        return res.status(500).json({ message: 'Error de configuración del servidor.' });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) {
            console.log("[Auth] Token inválido o expirado:", err.message);
            return res.status(403).json({ message: 'Tu sesión ha expirado. Por favor inicia sesión de nuevo.' });
        }
        
        // El token es válido, guardamos los datos del usuario en la petición
        req.user = user; 
        next();
    });
}

module.exports = authenticateToken;