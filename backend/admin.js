// Archivo: backend/routes/admin.js
const express = require('express');
const { getDb } = require('../db');
const { ObjectId } = require('mongodb');
const authAdmin = require('../middleware/authAdmin'); // ¡Middleware de ADMIN!
const rateLimit = require('express-rate-limit');

const router = express.Router();
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });

// Usamos el middleware 'authAdmin' para TODAS las rutas en este archivo
router.use(authLimiter);
router.use(authAdmin);

// ===========================================
//  GESTIÓN DE DEPÓSITOS (Verificar Pagos)
// ===========================================

// 1. Obtener todos los depósitos PENDIENTES
router.get('/deposits/pending', async (req, res) => {
    try {
        const db = getDb();
        // Hacemos un 'join' (lookup) para obtener el email del usuario junto con la transacción
        const pendingDeposits = await db.collection('transactions').aggregate([
            { $match: { type: 'deposit', status: 'pending' } },
            { $lookup: {
                from: 'users',
                localField: 'userId',
                foreignField: '_id',
                as: 'userDetails'
            }},
            { $unwind: '$userDetails' }, // Deshace el array de 'userDetails'
            { $project: { // Seleccionamos los campos que queremos
                _id: 1,
                amount: 1,
                method: 1,
                reference: 1,
                createdAt: 1,
                userEmail: '$userDetails.email',
                username: '$userDetails.username'
            }}
        ]).toArray();
        
        res.status(200).json(pendingDeposits);
    } catch (e) {
        console.error(e);
        res.status(500).json({ message: 'Error al obtener depósitos.' });
    }
});

// 2. APROBAR un depósito
router.post('/deposits/approve/:txId', async (req, res) => {
    const { txId } = req.params;
    
    try {
        const db = getDb();
        const transaction = await db.collection('transactions').findOne({ _id: new ObjectId(txId) });

        if (!transaction || transaction.status !== 'pending') {
            return res.status(404).json({ message: 'Transacción no encontrada o ya procesada.' });
        }

        // 1. Marcar la transacción como aprobada
        await db.collection('transactions').updateOne(
            { _id: transaction._id },
            { $set: { 
                status: 'approved', 
                processedBy: req.user.username, // Guardamos qué admin la aprobó
                processedAt: new Date() 
            }}
        );

        // 2. Aumentar el saldo del usuario
        await db.collection('users').updateOne(
            { _id: new ObjectId(transaction.userId) },
            { $inc: { balance: transaction.amount } } // $inc incrementa el saldo
        );

        res.status(200).json({ message: 'Depósito aprobado y saldo actualizado.' });
    } catch (e) {
        console.error('[ERROR] Aprobando depósito:', e);
        res.status(500).json({ message: 'Error interno al aprobar.' });
    }
});

// 3. RECHAZAR un depósito
router.post('/deposits/reject/:txId', async (req, res) => {
    const { txId } = req.params;
    const { reason } = req.body; // Opcional: una razón para el rechazo

    try {
        const db = getDb();
        await db.collection('transactions').updateOne(
            { _id: new ObjectId(txId), status: 'pending' },
            { $set: { 
                status: 'rejected',
                processedBy: req.user.username,
                processedAt: new Date(),
                rejectionReason: reason || 'Sin especificar'
            }}
        );
        // Nota: No devolvemos el dinero porque nunca se añadió
        res.status(200).json({ message: 'Depósito rechazado.' });
    } catch (e) {
        console.error('[ERROR] Rechazando depósito:', e);
        res.status(500).json({ message: 'Error interno al rechazar.' });
    }
});

// ===========================================
//  GESTIÓN DE RETIROS (Liberar Pagos)
// ===========================================

// (La lógica es muy similar, la añado para que la tengas completa)

// 1. Obtener todos los retiros PENDIENTES
router.get('/withdrawals/pending', async (req, res) => {
    try {
        const db = getDb();
        const pendingWithdrawals = await db.collection('transactions').aggregate([
            { $match: { type: 'withdrawal', status: 'pending' } },
            { $lookup: {
                from: 'users',
                localField: 'userId',
                foreignField: '_id',
                as: 'userDetails'
            }},
            { $unwind: '$userDetails' },
            { $project: {
                _id: 1,
                amount: 1,
                payoutInfo: 1, // La info de la cuenta de retiro
                createdAt: 1,
                userEmail: '$userDetails.email',
                username: '$userDetails.username',
                userBalance: '$userDetails.balance' // Incluimos el saldo para verificar
            }}
        ]).toArray();
        
        res.status(200).json(pendingWithdrawals);
    } catch (e) {
        console.error(e);
        res.status(500).json({ message: 'Error al obtener retiros.' });
    }
});

// 2. APROBAR un retiro (¡TÚ haces la transferencia manual PRIMERO!)
router.post('/withdrawals/approve/:txId', async (req, res) => {
    const { txId } = req.params;
    
    // Este endpoint asume que TÚ ya hiciste el Pago Móvil o la transferencia
    // y solo estás marcando la transacción como completada.
    try {
        const db = getDb();
        await db.collection('transactions').updateOne(
            { _id: new ObjectId(txId), status: 'pending' },
            { $set: { 
                status: 'approved', // O 'completed'
                processedBy: req.user.username,
                processedAt: new Date()
            }}
        );
        // El saldo del usuario YA SE RESTÓ cuando solicitó el retiro (ver frontend)
        res.status(200).json({ message: 'Retiro marcado como completado.' });
    } catch (e) {
        console.error('[ERROR] Aprobando retiro:', e);
        res.status(500).json({ message: 'Error interno al aprobar retiro.' });
    }
});

// 3. RECHAZAR un retiro (y devolver el dinero al saldo del usuario)
router.post('/withdrawals/reject/:txId', async (req, res) => {
    const { txId } = req.params;
    const { reason } = req.body;

    try {
        const db = getDb();
        const transaction = await db.collection('transactions').findOne({ _id: new ObjectId(txId) });

        if (!transaction || transaction.status !== 'pending') {
            return res.status(404).json({ message: 'Transacción no encontrada o ya procesada.' });
        }

        // 1. Marcar como rechazado
        await db.collection('transactions').updateOne(
            { _id: transaction._id },
            { $set: { 
                status: 'rejected',
                processedBy: req.user.username,
                processedAt: new Date(),
                rejectionReason: reason || 'Sin especificar'
            }}
        );

        // 2. DEVOLVER el dinero al saldo del usuario
        await db.collection('users').updateOne(
            { _id: new ObjectId(transaction.userId) },
            { $inc: { balance: transaction.amount } } // Sumamos de vuelta
        );

        res.status(200).json({ message: 'Retiro rechazado y fondos devueltos al usuario.' });
    } catch (e) {
        console.error('[ERROR] Rechazando retiro:', e);
        res.status(500).json({ message: 'Error interno al rechazar retiro.' });
    }
});


module.exports = router;