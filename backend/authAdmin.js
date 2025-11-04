// Archivo: backend/middleware/authAdmin.js
const jwt = require('jsonwebtoken');
const { ObjectId } = require('mongodb');
const { getDb } = require('../db');

function authAdmin(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token == null) {
        return res.status(401).json({ message: 'Acceso no autorizado.' });
    }

    jwt.verify(token, process.env.JWT_SECRET, async (err, payload) => {
        if (err) {
            return res.status(403).json({ message: 'Token no válido.' });
        }

        try {
            // El payload de tu token tiene 'id'
            const userId = payload.id;
            const db = getDb();
            const user = await db.collection('users').findOne({ _id: new ObjectId(userId) });

            if (!user) {
                return res.status(404).json({ message: 'Usuario no encontrado.' });
            }

            // ¡LA LÍNEA MÁGICA!
            if (user.role !== 'admin') {
                return res.status(403).json({ message: 'Acceso denegado. Se requiere ser administrador.' });
            }

            // Si es admin, guardamos el usuario completo en req y continuamos
            req.user = user;
            next();

        } catch (error) {
            console.error('[ERROR] en authAdmin:', error);
            res.status(500).json({ message: 'Error interno al verificar privilegios de admin.' });
        }
    });
}

module.exports = authAdmin;