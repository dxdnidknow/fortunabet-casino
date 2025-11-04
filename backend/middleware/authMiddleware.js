// Archivo: backend/middleware/authMiddleware.js
const jwt = require('jsonwebtoken');

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Formato: "Bearer TOKEN"

    if (token == null) {
        return res.status(401).json({ message: 'Acceso no autorizado.' });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ message: 'Token no válido o expirado.' });
        }
        req.user = user; // Guardamos los datos del usuario del token
        next(); // Pasamos al siguiente middleware o a la ruta
    });
}

module.exports = authenticateToken;