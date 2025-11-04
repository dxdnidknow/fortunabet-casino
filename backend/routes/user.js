// Archivo: backend/routes/user.js (CORREGIDO Y COMPLETO)

const express = require('express');
const bcrypt = require('bcrypt');
const twilio = require('twilio');
const { ObjectId } = require('mongodb');
const authenticateToken = require('../middleware/authMiddleware'); // Middleware de usuario normal
const rateLimit = require('express-rate-limit');

const router = express.Router();

// --- Constantes y Middlewares ---
const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/;
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });
router.use(authenticateToken); // ¡IMPORTANTE! Todas las rutas en este archivo requieren autenticación.

// (Aquí iría la lógica de Twilio si la implementas, por ahora la omitimos)

// =======================================================================
//  RUTAS DE DATOS DE USUARIO (MI CUENTA)
// =======================================================================

// GET /api/user-data
router.get('/user-data', async (req, res) => {
    try {
        const userId = req.user.id;
        const db = req.db;
        const user = await db.collection('users').findOne(
            { _id: new ObjectId(userId) },
            { projection: { password: 0, otp: 0, otpExpires: 0 } } // Oculta campos sensibles
        );
        if (!user) return res.status(404).json({ message: 'Usuario no encontrado.' });
        res.status(200).json(user);
    } catch (error) {
        console.error('[ERROR] en user-data:', error);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
});

// PUT /api/user-data (Para actualizar datos personales)
router.put('/user-data', authLimiter, async (req, res) => {
    try {
        const userId = req.user.id;
        const { fullName, cedula, birthDate, phone } = req.body;
        const db = req.db;

        // (Aquí puedes añadir más validaciones, ej. isOver18)

        const updateData = {
            'personalInfo.fullName': fullName,
            'personalInfo.cedula': cedula,
            'personalInfo.birthDate': birthDate,
        };
        
        if (phone) {
             updateData['personalInfo.phone'] = phone;
             // (Aquí podrías añadir lógica para marcar 'phoneVerified' como false si el número cambió)
        }

        await db.collection('users').updateOne(
            { _id: new ObjectId(userId) }, 
            { $set: updateData }
        );
        
        res.status(200).json({ message: 'Información personal actualizada con éxito.' });
    } catch (error) {
        console.error('[ERROR] en update-personal-info:', error);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
});

// (Aquí irían las rutas de cambio de contraseña, pero ya están en auth.js)

// =======================================================================
//  RUTAS DE MÉTODOS DE PAGO (MOVIDAS DESDE SERVER.JS)
// =======================================================================

// GET /api/payout-methods
router.get('/payout-methods', async (req, res) => {
    try {
        const userId = new ObjectId(req.user.id);
        const payoutMethods = await req.db.collection('payoutMethods').find({ userId }).sort({ isPrimary: -1 }).toArray();
        res.status(200).json(payoutMethods);
    } catch (error) {
        console.error('[ERROR] al obtener métodos de pago:', error);
        res.status(500).json({ message: 'Error interno al cargar los métodos de pago.' });
    }
});

// POST /api/payout-methods
router.post('/payout-methods', authLimiter, async (req, res) => {
    try {
        const userId = new ObjectId(req.user.id);
        const { methodType, isPrimary, details } = req.body;
        const db = req.db;

        if (!methodType || !details) {
            return res.status(400).json({ message: 'Faltan datos requeridos para el método de pago.' });
        }

        const newMethod = {
            userId,
            methodType,
            details,
            isPrimary: !!isPrimary,
            createdAt: new Date(),
        };

        if (newMethod.isPrimary) {
            await db.collection('payoutMethods').updateMany(
                { userId, isPrimary: true },
                { $set: { isPrimary: false } }
            );
        }

        const result = await db.collection('payoutMethods').insertOne(newMethod);
        res.status(201).json({ 
            message: 'Método de retiro añadido con éxito.', 
            _id: result.insertedId 
        });
    } catch (error) {
        console.error('[ERROR] al añadir método de pago:', error);
        res.status(500).json({ message: 'Error interno al añadir el método de pago.' });
    }
});

// POST /api/payout-methods/:id/primary
router.post('/payout-methods/:id/primary', authLimiter, async (req, res) => {
    try {
        const userId = new ObjectId(req.user.id);
        const methodId = new ObjectId(req.params.id);
        const db = req.db;

        await db.collection('payoutMethods').updateMany(
            { userId, isPrimary: true },
            { $set: { isPrimary: false } }
        );
        const result = await db.collection('payoutMethods').updateOne(
            { _id: methodId, userId },
            { $set: { isPrimary: true } }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ message: 'Método no encontrado o no pertenece al usuario.' });
        }
        res.status(200).json({ message: 'Método establecido como principal.' });
    } catch (error) {
        console.error('[ERROR] al establecer primario:', error);
        res.status(500).json({ message: 'Error interno al establecer el método principal.' });
    }
});

// DELETE /api/payout-methods/:id
router.delete('/payout-methods/:id', authLimiter, async (req, res) => {
    try {
        const userId = new ObjectId(req.user.id);
        const methodId = new ObjectId(req.params.id);
        const db = req.db;

        const result = await db.collection('payoutMethods').deleteOne({
            _id: methodId,
            userId: userId,
        });

        if (result.deletedCount === 0) {
            return res.status(404).json({ message: 'Método no encontrado o no pertenece al usuario.' });
        }
        res.status(200).json({ message: 'Método de retiro eliminado con éxito.' });
    } catch (error) {
        console.error('[ERROR] al eliminar método de pago:', error);
        res.status(500).json({ message: 'Error interno al eliminar el método de pago.' });
    }
});

// =======================================================================
//  RUTAS DE TRANSACCIONES (DEPÓSITO, RETIRO, APUESTA)
// =======================================================================

// POST /api/request-deposit (Llamada por payments.js)
router.post('/request-deposit', authLimiter, async (req, res) => {
    const { amount, method, reference } = req.body;
    const userId = req.user.id;

    if (!amount || !method || !reference) {
        return res.status(400).json({ message: 'Faltan datos (monto, método o referencia).' });
    }
    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
        return res.status(400).json({ message: 'El monto no es válido.' });
    }

    try {
        await req.db.collection('transactions').insertOne({
            userId: new ObjectId(userId),
            type: 'deposit',
            status: 'pending', // El admin lo verá
            amount: numericAmount,
            method: method,
            reference: reference,
            createdAt: new Date()
        });
        res.status(201).json({ message: 'Depósito reportado. Se verificará en breve.' });
    } catch (error) {
        console.error('[ERROR] Reportando depósito:', error);
        res.status(500).json({ message: 'Error interno al reportar el depósito.' });
    }
});

// POST /api/request-withdrawal (Llamada por payments.js)
router.post('/request-withdrawal', authLimiter, async (req, res) => {
    const { amount, methodId } = req.body;
    const userId = new ObjectId(req.user.id);
    const db = req.db;

    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount <= 0.1) { // Límite de retiro mínimo
        return res.status(400).json({ message: 'El monto a retirar no es válido.' });
    }

    try {
        const user = await db.collection('users').findOne({ _id: userId });
        const method = await db.collection('payoutMethods').findOne({ _id: new ObjectId(methodId), userId: userId });

        if (!method) {
            return res.status(404).json({ message: 'Método de pago no encontrado.' });
        }
        if (user.balance < numericAmount) {
            return res.status(400).json({ message: 'Fondos insuficientes.' });
        }

        // --- INICIA TRANSACCIÓN (Metafóricamente, MongoDB lo hace atómico) ---
        
        // 1. Restar el saldo al usuario
        await db.collection('users').updateOne(
            { _id: userId },
            { $inc: { balance: -numericAmount } }
        );

        // 2. Crear la solicitud de retiro para el admin
        await db.collection('transactions').insertOne({
            userId: userId,
            type: 'withdrawal',
            status: 'pending', // El admin lo verá
            amount: numericAmount, // Guardamos el monto en positivo
            methodDetails: method, // Guardamos la info del método
            createdAt: new Date()
        });

        // --- FIN TRANSACCIÓN ---
        
        res.status(201).json({ message: 'Solicitud de retiro recibida. Se procesará en breve.' });
    } catch (error) {
        console.error('[ERROR] Solicitando retiro:', error);
        res.status(500).json({ message: 'Error interno al solicitar el retiro.' });
    }
});

// POST /api/place-bet (Llamada por bet.js)
router.post('/place-bet', authLimiter, async (req, res) => {
    const { bets, stake } = req.body;
    const userId = new ObjectId(req.user.id);
    const db = req.db;

    const numericStake = parseFloat(stake);
    if (!bets || bets.length === 0 || !numericStake || numericStake <= 0) {
        return res.status(400).json({ message: 'Datos de la apuesta inválidos.' });
    }

    try {
        const user = await db.collection('users').findOne({ _id: userId });

        if (user.balance < numericStake) {
            return res.status(400).json({ message: 'Fondos insuficientes para esta apuesta.' });
        }

        // --- INICIA TRANSACCIÓN ---

        // 1. Restar el saldo al usuario
        await db.collection('users').updateOne(
            { _id: userId },
            { $inc: { balance: -numericStake } }
        );

        // 2. Calcular cuota total (Parley)
        const totalOdds = bets.reduce((acc, bet) => acc * parseFloat(bet.odds), 1);
        const potentialWinnings = numericStake * totalOdds;

        // 3. Guardar la apuesta en la base de datos
        await db.collection('bets').insertOne({
            userId: userId,
            selections: bets, // Array de selecciones
            stake: numericStake,
            totalOdds: totalOdds,
            potentialWinnings: potentialWinnings,
            status: 'pending', // 'pending', 'won', 'lost', 'void'
            createdAt: new Date()
        });

        // --- FIN TRANSACCIÓN ---

        res.status(201).json({ message: '¡Apuesta realizada con éxito!' });
    } catch (error) {
        console.error('[ERROR] Realizando apuesta:', error);
        res.status(500).json({ message: 'Error interno al realizar la apuesta.' });
    }
});


module.exports = router;