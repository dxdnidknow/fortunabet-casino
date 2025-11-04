// Archivo: backend/routes/admin.js (CORREGIDO)
const express = require('express');
const { getDb } = require('../db');
const { ObjectId } = require('mongodb');
const rateLimit = require('express-rate-limit');

// =======================================================================
//  IMPORTACIÓN DE MIDDLEWARE (RUTA CORREGIDA)
// =======================================================================
const authAdmin = require('../middleware/authAdmin'); // ¡Middleware de ADMIN!
// =======================================================================


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

        await db.collection('transactions').updateOne(
            { _id: transaction._id },
            { $set: { 
                status: 'approved', 
                processedBy: req.user.username,
                processedAt: new Date() 
            }}
        );

        await db.collection('users').updateOne(
            { _id: new ObjectId(transaction.userId) },
            { $inc: { balance: transaction.amount } }
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
    const { reason } = req.body;

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
        // Usamos la nueva colección 'withdrawalRequests'
        const pendingWithdrawals = await db.collection('withdrawalRequests').find({
            status: 'pending'
        }).toArray();
        
        res.status(200).json(pendingWithdrawals);
    } catch (e) {
        console.error(e);
        res.status(500).json({ message: 'Error al obtener retiros.' });
    }
});

// 2. APROBAR un retiro (TÚ haces la transferencia manual PRIMERO!)
router.post('/withdrawals/approve/:reqId', async (req, res) => {
    const { reqId } = req.params; // ID de la solicitud de retiro
    
    try {
        const db = getDb();
        // Marcar la solicitud como completada
        const result = await db.collection('withdrawalRequests').updateOne(
            { _id: new ObjectId(reqId), status: 'pending' },
            { $set: { 
                status: 'completed',
                processedBy: req.user.username,
                processedAt: new Date()
            }}
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ message: 'Solicitud no encontrada o ya procesada.' });
        }
        
        // (El saldo del usuario YA SE RESTÓ cuando solicitó el retiro)
        res.status(200).json({ message: 'Retiro marcado como completado.' });
    } catch (e) {
        console.error('[ERROR] Aprobando retiro:', e);
        res.status(500).json({ message: 'Error interno al aprobar retiro.' });
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
            { userId: new ObjectId(request.userId), type: 'withdrawal', status: 'pending', amount: -request.amount },
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