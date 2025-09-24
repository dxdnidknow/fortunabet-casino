// Archivo: backend/authMiddleware.js
const jwt = require('jsonwebtoken');

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Formato: "Bearer TOKEN"

    if (token == null) {
        return res.sendStatus(401); // No hay token, no autorizado
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) {
            return res.sendStatus(403); // Token no válido o expirado
        }
        req.user = user; // Guardamos los datos del usuario del token en el objeto `req`
        next(); // Pasamos al siguiente middleware o a la ruta
    });
}

module.exports = authenticateToken;