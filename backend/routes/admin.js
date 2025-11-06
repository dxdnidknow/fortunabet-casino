// Archivo: backend/routes/admin.js (COMPLETO Y CORREGIDO)

const express = require('express');
const { getDb, client } = require('../db'); // <-- ¡CORRECCIÓN! Importa el client
const { ObjectId } = require('mongodb');
const rateLimit = require('express-rate-limit');
const authAdmin = require('../middleware/authAdmin'); // ¡Middleware de ADMIN!

const router = express.Router();
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 50 }); // Más intentos para admin

// Usamos el middleware 'authAdmin' para TODAS las rutas en este archivo
router.use(authLimiter);
router.use(authAdmin); // Asegura que solo los admins puedan acceder

// ===========================================
//  GESTIÓN DE DEPÓSITOS (Verificar Pagos)
// ===========================================

// 1. Obtener todos los depósitos PENDIENTES
router.get('/deposits/pending', async (req, res) => {
    try {
        const db = getDb();
        const pendingDeposits = await db.collection('transactions').aggregate([
            { $match: { type: 'deposit', status: 'pending' } },
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
                method: 1,
                reference: 1,
                createdAt: 1,
                userEmail: '$userDetails.email',
                username: '$userDetails.username'
            }}
        ]).sort({ createdAt: 1 }).toArray(); // Ordena los más antiguos primero
        
        res.status(200).json(pendingDeposits);
    } catch (e) {
        console.error(e);
        res.status(500).json({ message: 'Error al obtener depósitos.' });
    }
});

// 2. APROBAR un depósito (USA TRANSACCIÓN)
router.post('/deposits/approve/:txId', async (req, res) => {
    const { txId } = req.params;
    const session = client.startSession(); // Inicia sesión para transacción

    try {
        await session.startTransaction();
        const db = getDb();
        const transaction = await db.collection('transactions').findOne({ 
            _id: new ObjectId(txId) 
        }, { session });

        if (!transaction || transaction.status !== 'pending') {
            await session.abortTransaction();
            return res.status(404).json({ message: 'Transacción no encontrada o ya procesada.' });
        }

        // 1. Actualiza la transacción
        await db.collection('transactions').updateOne(
            { _id: transaction._id },
            { $set: { 
                status: 'approved', 
                processedBy: req.user.username,
                processedAt: new Date() 
            }},
            { session }
        );

        // 2. Aumenta el saldo del usuario
        await db.collection('users').updateOne(
            { _id: new ObjectId(transaction.userId) },
            { $inc: { balance: transaction.amount } },
            { session }
        );

        await session.commitTransaction();
        res.status(200).json({ message: 'Depósito aprobado y saldo actualizado.' });
    } catch (e) {
        if (session.inTransaction()) {
            await session.abortTransaction();
        }
        console.error('[ERROR] Aprobando depósito:', e);
        res.status(500).json({ message: 'Error interno al aprobar.' });
    } finally {
        await session.endSession();
    }
});

// 3. RECHAZAR un depósito
router.post('/deposits/reject/:txId', async (req, res) => {
    const { txId } = req.params;
    const { reason } = req.body;

    try {
        const db = getDb();
        const result = await db.collection('transactions').updateOne(
            { _id: new ObjectId(txId), status: 'pending' },
            { $set: { 
                status: 'rejected',
                processedBy: req.user.username,
                processedAt: new Date(),
                rejectionReason: reason || 'Sin especificar'
            }}
        );
        
        if (result.matchedCount === 0) {
            return res.status(404).json({ message: 'Transacción no encontrada o ya procesada.' });
        }
        res.status(200).json({ message: 'Depósito rechazado.' });
    } catch (e) {
        console.error('[ERROR] Rechazando depósito:', e);
        res.status(500).json({ message: 'Error interno al rechazar.' });
    }
});

// ===========================================
//  GESTIÓN DE RETIROS (Liberar Pagos)
// ===========================================

// 1. Obtener todos los retiros PENDIENTES
router.get('/withdrawals/pending', async (req, res) => {
    try {
        const db = getDb();
        // Usamos la colección 'withdrawalRequests'
        const pendingWithdrawals = await db.collection('withdrawalRequests').find({
            status: 'pending'
        }).sort({ requestedAt: 1 }).toArray();
        
        res.status(200).json(pendingWithdrawals);
    } catch (e) {
        console.error(e);
        res.status(500).json({ message: 'Error al obtener retiros.' });
    }
});

// 2. APROBAR un retiro (Marcar como pagado)
router.post('/withdrawals/approve/:reqId', async (req, res) => {
    const { reqId } = req.params; // ID de la solicitud de retiro
    const session = client.startSession();

    try {
        await session.startTransaction();
        const db = getDb();
        
        const request = await db.collection('withdrawalRequests').findOne({ 
            _id: new ObjectId(reqId), 
            status: 'pending' 
        }, { session });

        if (!request) {
            await session.abortTransaction();
            return res.status(404).json({ message: 'Solicitud no encontrada o ya procesada.' });
        }

        // 1. Marcar la solicitud como completada
        await db.collection('withdrawalRequests').updateOne(
            { _id: request._id },
            { $set: { 
                status: 'completed',
                processedBy: req.user.username,
                processedAt: new Date()
            }},
            { session }
        );
        
        // 2. Actualizar la transacción original en el historial
        await db.collection('transactions').updateOne(
            { _id: request.transactionId }, // Asumiendo que guardaste el ID de la transacción
            { $set: { status: 'approved' } },
            { session }
        );

        await session.commitTransaction();
        res.status(200).json({ message: 'Retiro marcado como completado.' });
    } catch (e) {
        if (session.inTransaction()) {
            await session.abortTransaction();
        }
        console.error('[ERROR] Aprobando retiro:', e);
        res.status(500).json({ message: 'Error interno al aprobar retiro.' });
    } finally {
        await session.endSession();
    }
});

// 3. RECHAZAR un retiro (y devolver el dinero al saldo del usuario)
router.post('/withdrawals/reject/:reqId', async (req, res) => {
    const { reqId } = req.params;
    const { reason } = req.body;
    const session = client.startSession(); // Usar transacción para seguridad

    try {
        await session.startTransaction();
        const db = getDb();

        const request = await db.collection('withdrawalRequests').findOne({ 
            _id: new ObjectId(reqId), 
            status: 'pending' 
        }, { session });

        if (!request) {
            await session.abortTransaction();
            return res.status(404).json({ message: 'Solicitud no encontrada o ya procesada.' });
        }

        // 1. Marcar como rechazado
        await db.collection('withdrawalRequests').updateOne(
            { _id: request._id },
            { $set: { 
                status: 'rejected',
                processedBy: req.user.username,
                processedAt: new Date(),
                rejectionReason: reason || 'Sin especificar'
            }},
            { session }
        );

        // 2. DEVOLVER el dinero al saldo del usuario
        await db.collection('users').updateOne(
            { _id: new ObjectId(request.userId) },
            { $inc: { balance: request.amount } } // Sumamos de vuelta
            , { session }
        );
        
        // 3. Actualizar la transacción original
        await db.collection('transactions').updateOne(
            { _id: request.transactionId },
            { $set: { status: 'rejected' } },
            { session }
        );

        await session.commitTransaction();
        res.status(200).json({ message: 'Retiro rechazado y fondos devueltos al usuario.' });
    } catch (e) {
        if (session.inTransaction()) {
            await session.abortTransaction();
        }
        console.error('[ERROR] Rechazando retiro:', e);
        res.status(500).json({ message: 'Error interno al rechazar retiro.' });
    } finally {
        await session.endSession();
    }
});

module.exports = router;