// Archivo: backend/routes/admin.js (VERSIÓN FINAL)

const express = require('express');
const { getDb, client } = require('../db'); // Asegúrate de exportar 'client' en db.js
const { ObjectId } = require('mongodb');
const rateLimit = require('express-rate-limit');
const authAdmin = require('../middleware/authAdmin');

const router = express.Router();
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }); // Aumentado un poco para el admin

router.use(authLimiter);
router.use(authAdmin);

// =======================================================================
//  1. RUTAS DE ESTADÍSTICAS (¡CRÍTICAS PARA EL DASHBOARD!)
// =======================================================================

// GET /api/admin/stats
router.get('/stats', async (req, res) => {
    try {
        const db = getDb();
        
        const totalUsers = await db.collection('users').countDocuments({});
        const pendingDepositsCount = await db.collection('transactions').countDocuments({ type: 'deposit', status: 'pending' });
        const pendingWithdrawalsCount = await db.collection('withdrawalRequests').countDocuments({ status: 'pending' });
        
        // Calcular balance total en juego (suma de todos los saldos de usuarios)
        const balanceAggr = await db.collection('users').aggregate([
            { $group: { _id: null, total: { $sum: "$balance" } } }
        ]).toArray();
        const totalBalance = balanceAggr.length > 0 ? balanceAggr[0].total : 0;

        res.status(200).json({
            totalUsers,
            totalBalance,
            pendingDepositsCount,
            pendingWithdrawalsCount
        });
    } catch (e) {
        console.error(e);
        res.status(500).json({ message: 'Error obteniendo estadísticas.' });
    }
});

// GET /api/admin/analytics/revenue (Gráfica)
router.get('/analytics/revenue', async (req, res) => {
    try {
        const db = getDb();
        // Agrupar depósitos aprobados por fecha (últimos 30 días)
        const revenueData = await db.collection('transactions').aggregate([
            { $match: { type: 'deposit', status: 'approved' } },
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                    total: { $sum: "$amount" }
                }
            },
            { $sort: { _id: 1 } },
            { $limit: 30 }
        ]).toArray();

        res.status(200).json(revenueData);
    } catch (e) {
        res.status(500).json({ message: 'Error calculando ingresos.' });
    }
});

// GET /api/admin/users
router.get('/users', async (req, res) => {
    try {
        const db = getDb();
        const users = await db.collection('users')
            .find({}, { projection: { password: 0, otp: 0, otpExpires: 0 } })
            .sort({ createdAt: -1 })
            .limit(50)
            .toArray();
        res.status(200).json(users);
    } catch (e) {
        res.status(500).json({ message: 'Error obteniendo usuarios.' });
    }
});

// =======================================================================
//  2. GESTIÓN DE DEPÓSITOS
// =======================================================================

router.get('/deposits/pending', async (req, res) => {
    try {
        const db = getDb();
        // Usamos aggregate para unir con la colección de usuarios y traer nombres
        const pendingDeposits = await db.collection('transactions').aggregate([
            { $match: { type: 'deposit', status: 'pending' } },
            { $lookup: { from: 'users', localField: 'userId', foreignField: '_id', as: 'userDetails' } },
            { $unwind: '$userDetails' },
            { $project: {
                _id: 1, amount: 1, method: 1, reference: 1, createdAt: 1,
                userEmail: '$userDetails.email', username: '$userDetails.username',
                fullName: '$userDetails.personalInfo.fullName'
            }}
        ]).sort({ createdAt: 1 }).toArray();
        res.status(200).json(pendingDeposits);
    } catch (e) {
        res.status(500).json({ message: 'Error al obtener depósitos.' });
    }
});

router.post('/deposits/approve/:txId', async (req, res) => {
    const { txId } = req.params;
    const session = client.startSession(); // Transacción ACID
    try {
        await session.startTransaction();
        const db = getDb();
        
        const transaction = await db.collection('transactions').findOne({ _id: new ObjectId(txId) }, { session });

        if (!transaction || transaction.status !== 'pending') {
            await session.abortTransaction();
            return res.status(404).json({ message: 'Transacción no válida o ya procesada.' });
        }

        // 1. Marcar transacción como aprobada
        await db.collection('transactions').updateOne(
            { _id: transaction._id },
            { $set: { status: 'approved', processedBy: req.user.username, processedAt: new Date() }},
            { session }
        );

        // 2. Sumar saldo al usuario
        await db.collection('users').updateOne(
            { _id: new ObjectId(transaction.userId) },
            { $inc: { balance: transaction.amount } },
            { session }
        );

        await session.commitTransaction();
        res.status(200).json({ message: 'Depósito aprobado y saldo acreditado.' });
    } catch (e) {
        if (session.inTransaction()) await session.abortTransaction();
        console.error(e);
        res.status(500).json({ message: 'Error interno al aprobar.' });
    } finally {
        await session.endSession();
    }
});

router.post('/deposits/reject/:txId', async (req, res) => {
    const { txId } = req.params;
    const { reason } = req.body;
    try {
        const db = getDb();
        await db.collection('transactions').updateOne(
            { _id: new ObjectId(txId), status: 'pending' },
            { $set: { status: 'rejected', processedBy: req.user.username, processedAt: new Date(), rejectionReason: reason || 'N/A' }}
        );
        res.status(200).json({ message: 'Depósito rechazado.' });
    } catch (e) {
        res.status(500).json({ message: 'Error interno.' });
    }
});

// =======================================================================
//  3. GESTIÓN DE RETIROS
// =======================================================================

router.get('/withdrawals/pending', async (req, res) => {
    try {
        const db = getDb();
        const pendingWithdrawals = await db.collection('withdrawalRequests').aggregate([
            { $match: { status: 'pending' } },
            { $lookup: { from: 'users', localField: 'userId', foreignField: '_id', as: 'userDetails' } },
            { $unwind: '$userDetails' },
            { $project: {
                _id: 1, amount: 1, methodDetails: 1, methodType: 1, requestedAt: 1,
                username: 1, userId: 1, transactionId: 1,
                fullName: '$userDetails.personalInfo.fullName', cedula: '$userDetails.personalInfo.cedula'
            }}
        ]).sort({ requestedAt: 1 }).toArray();
        res.status(200).json(pendingWithdrawals);
    } catch (e) {
        res.status(500).json({ message: 'Error al obtener retiros.' });
    }
});

router.post('/withdrawals/approve/:reqId', async (req, res) => {
    const { reqId } = req.params;
    const session = client.startSession();
    try {
        await session.startTransaction();
        const db = getDb();
        
        const request = await db.collection('withdrawalRequests').findOne({ _id: new ObjectId(reqId), status: 'pending' }, { session });

        if (!request) {
            await session.abortTransaction();
            return res.status(404).json({ message: 'Solicitud no encontrada.' });
        }

        // 1. Marcar solicitud como completada
        await db.collection('withdrawalRequests').updateOne(
            { _id: request._id },
            { $set: { status: 'completed', processedBy: req.user.username, processedAt: new Date() }},
            { session }
        );
        
        // 2. Marcar la transacción asociada como aprobada (ya se descontó el saldo al pedirlo)
        await db.collection('transactions').updateOne(
            { _id: request.transactionId },
            { $set: { status: 'approved' } },
            { session }
        );

        await session.commitTransaction();
        res.status(200).json({ message: 'Retiro marcado como completado.' });
    } catch (e) {
        if (session.inTransaction()) await session.abortTransaction();
        res.status(500).json({ message: 'Error interno.' });
    } finally {
        await session.endSession();
    }
});

router.post('/withdrawals/reject/:reqId', async (req, res) => {
    const { reqId } = req.params;
    const { reason } = req.body;
    const session = client.startSession();
    try {
        await session.startTransaction();
        const db = getDb();
        
        const request = await db.collection('withdrawalRequests').findOne({ _id: new ObjectId(reqId), status: 'pending' }, { session });

        if (!request) {
            await session.abortTransaction();
            return res.status(404).json({ message: 'Solicitud no encontrada.' });
        }

        // 1. Marcar solicitud como rechazada
        await db.collection('withdrawalRequests').updateOne(
            { _id: request._id },
            { $set: { status: 'rejected', processedBy: req.user.username, processedAt: new Date(), rejectionReason: reason || 'N/A' }},
            { session }
        );

        // 2. DEVOLVER EL DINERO AL USUARIO
        await db.collection('users').updateOne(
            { _id: new ObjectId(request.userId) },
            { $inc: { balance: request.amount } }, 
            { session }
        );
        
        // 3. Marcar transacción como rechazada
        await db.collection('transactions').updateOne(
            { _id: request.transactionId },
            { $set: { status: 'rejected' } },
            { session }
        );

        await session.commitTransaction();
        res.status(200).json({ message: 'Retiro rechazado y saldo devuelto.' });
    } catch (e) {
        if (session.inTransaction()) await session.abortTransaction();
        res.status(500).json({ message: 'Error interno.' });
    } finally {
        await session.endSession();
    }
});

module.exports = router;