// Archivo: backend/routes/user.js (CON TWILIO IMPLEMENTADO)

const express = require('express');
const { ObjectId } = require('mongodb');
const authenticateToken = require('../middleware/authMiddleware');
const rateLimit = require('express-rate-limit');
const { client } = require('../db');
const twilio = require('twilio'); // <-- 1. IMPORTAR TWILIO

const router = express.Router();

// --- Constantes y Middlewares ---
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });
router.use(authenticateToken);

// --- Inicializar Cliente de Twilio ---
// Las variables deben estar en el .env y en Render
const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;

// =======================================================================
//  RUTAS DE DATOS DE USUARIO (MI CUENTA)
// =======================================================================

router.get('/user-data', async (req, res) => {
    try {
        const userId = req.user.id;
        const db = req.db;
        const user = await db.collection('users').findOne(
            { _id: new ObjectId(userId) },
            { projection: { password: 0, otp: 0, otpExpires: 0 } }
        );
        if (!user) return res.status(404).json({ message: 'Usuario no encontrado.' });
        res.status(200).json(user);
    } catch (error) {
        console.error('[ERROR] en user-data:', error);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
});

router.put('/user-data', authLimiter, async (req, res) => {
    try {
        const userId = req.user.id;
        const { fullName, cedula, birthDate, phone } = req.body;
        const db = req.db;

        const updateData = {
            'personalInfo.fullName': fullName,
            'personalInfo.cedula': cedula,
            'personalInfo.birthDate': birthDate,
        };
        
        if (phone) {
             updateData['personalInfo.phone'] = phone;
             const user = await db.collection('users').findOne({ _id: new ObjectId(userId) });
             if (user.personalInfo.phone !== phone) {
                 updateData['personalInfo.isPhoneVerified'] = false;
             }
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

// =======================================================================
//  RUTAS DE VERIFICACIÓN TELEFÓNICA (¡YA NO ES SIMULADO!)
// =======================================================================

router.post('/request-phone-verification', authLimiter, async (req, res) => {
    const userId = new ObjectId(req.user.id);
    const db = req.db;

    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !twilioPhoneNumber) {
        console.error("❌ Error: Faltan las variables de entorno de Twilio.");
        return res.status(500).json({ message: "El servicio de verificación no está configurado." });
    }

    try {
        const user = await db.collection('users').findOne({ _id: userId });
        const phone = user?.personalInfo?.phone;
        
        if (!phone || !phone.startsWith('+58')) {
            return res.status(400).json({ message: "Añade un número de teléfono válido (+58) en 'Mis Datos' primero." });
        }
        
        // --- LÓGICA REAL DE TWILIO ---
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 min
        
        // 1. Guardar el código en la BD
        await db.collection('users').updateOne(
            { _id: userId },
            { $set: { 'personalInfo.phoneOtp': otp, 'personalInfo.phoneOtpExpires': otpExpires } }
        );
        
        // 2. Enviar el SMS
        await twilioClient.messages.create({
            body: `Tu código de verificación para FortunaBet es: ${otp}`,
            from: twilioPhoneNumber,
            to: phone // El número del usuario (ej: +58414...)
        });
        
        res.status(200).json({ message: `Se ha enviado un código de verificación a tu teléfono.` });

    } catch (error) {
        console.error("Error al enviar código con Twilio:", error);
        // Twilio devuelve errores útiles si el número no es válido
        if (error.code === 21211) {
             return res.status(400).json({ message: "El número de teléfono proporcionado no es válido." });
        }
        res.status(500).json({ message: "No se pudo enviar el código. Intenta de nuevo más tarde." });
    }
});

router.post('/verify-phone-code', authLimiter, async (req, res) => {
    const userId = new ObjectId(req.user.id);
    const { code } = req.body;
    const db = req.db;

    try {
        const user = await db.collection('users').findOne({ _id: userId });
        const phoneInfo = user?.personalInfo;

        if (!phoneInfo || !phoneInfo.phoneOtp) {
            return res.status(400).json({ message: "No hay una verificación de teléfono pendiente." });
        }
        if (phoneInfo.phoneOtp !== code) {
            return res.status(400).json({ message: "El código de verificación es incorrecto." });
        }
        if (new Date() > phoneInfo.phoneOtpExpires) {
            return res.status(400).json({ message: "El código de verificación ha expirado." });
        }

        await db.collection('users').updateOne(
            { _id: userId },
            { 
                $set: { 'personalInfo.isPhoneVerified': true },
                $unset: { 'personalInfo.phoneOtp': "", 'personalInfo.phoneOtpExpires': "" } 
            }
        );
        
        res.status(200).json({ message: "¡Teléfono verificado con éxito!" });
    } catch (error) {
        console.error("Error al verificar código de teléfono:", error);
        res.status(500).json({ message: "Error al verificar el código." });
    }
});

// =======================================================================
//  RUTAS DE MÉTODOS DE PAGO
// =======================================================================

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

router.post('/payout-methods', authLimiter, async (req, res) => {
    try {
        const userId = new ObjectId(req.user.id);
        const { methodType, isPrimary, details } = req.body;
        const db = req.db;

        if (!methodType || !details) {
            return res.status(400).json({ message: 'Faltan datos requeridos para el método de pago.' });
        }
        const newMethod = { userId, methodType, details, isPrimary: !!isPrimary, createdAt: new Date() };

        if (newMethod.isPrimary) {
            await db.collection('payoutMethods').updateMany(
                { userId, isPrimary: true },
                { $set: { isPrimary: false } }
            );
        }
        const result = await db.collection('payoutMethods').insertOne(newMethod);
        res.status(201).json({ message: 'Método de retiro añadido con éxito.', _id: result.insertedId });
    } catch (error) {
        console.error('[ERROR] al añadir método de pago:', error);
        res.status(500).json({ message: 'Error interno al añadir el método de pago.' });
    }
});

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

router.delete('/payout-methods/:id', authLimiter, async (req, res) => {
    try {
        const userId = new ObjectId(req.user.id);
        const methodId = new ObjectId(req.params.id);
        const db = req.db;

        const result = await db.collection('payoutMethods').deleteOne({ _id: methodId, userId: userId });
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
//  RUTAS DE TRANSACCIONES
// =======================================================================

router.post('/request-deposit', authLimiter, async (req, res) => {
    const { amount, method, reference } = req.body;
    const userId = req.user.id;

    if (!amount || !method || !reference) return res.status(400).json({ message: 'Faltan datos (monto, método o referencia).' });
    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) return res.status(400).json({ message: 'El monto no es válido.' });

    try {
        await req.db.collection('transactions').insertOne({
            userId: new ObjectId(userId),
            type: 'deposit',
            status: 'pending',
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

router.post('/withdraw', authLimiter, async (req, res) => {
    const session = client.startSession();
    
    try {
        await session.startTransaction();
        
        const userId = new ObjectId(req.user.id);
        const { amount, methodId } = req.body;
        const db = req.db;

        const withdrawalAmount = parseFloat(amount);
        if (isNaN(withdrawalAmount) || withdrawalAmount < 10) {
            await session.abortTransaction();
            return res.status(400).json({ message: 'El retiro mínimo es de Bs. 10.00' });
        }

        const user = await db.collection('users').findOne({ _id: userId }, { session });
        if (!user || user.balance < withdrawalAmount) {
            await session.abortTransaction();
            return res.status(400).json({ message: 'Fondos insuficientes para realizar el retiro.' });
        }
        
        const method = await db.collection('payoutMethods').findOne({ _id: new ObjectId(methodId), userId }, { session });
        if (!method) {
            await session.abortTransaction();
            return res.status(404).json({ message: 'Método de retiro no encontrado.' });
        }

        await db.collection('users').updateOne(
            { _id: userId },
            { $inc: { balance: -withdrawalAmount } },
            { session }
        );

        const transactionRecord = { 
            userId, 
            type: 'withdrawal', 
            amount: -withdrawalAmount,
            status: 'pending', 
            method: method.methodType, 
            createdAt: new Date() 
        };
        const insertTx = await db.collection('transactions').insertOne(transactionRecord, { session });

        const withdrawalRequest = { 
            userId, 
            username: user.username, 
            amount: withdrawalAmount,
            methodDetails: method.details, 
            methodType: method.methodType, 
            status: 'pending', 
            requestedAt: new Date(),
            transactionId: insertTx.insertedId
        };
        await db.collection('withdrawalRequests').insertOne(withdrawalRequest, { session });

        await session.commitTransaction();
        res.status(200).json({ message: 'Solicitud de retiro enviada. Se procesará en breve.' });
    } catch (error) {
        if (session.inTransaction()) {
            await session.abortTransaction();
        }
        console.error('[ERROR] en /api/withdraw:', error);
        res.status(500).json({ message: 'Error interno al procesar el retiro. Intenta de nuevo.' });
    } finally {
        await session.endSession();
    }
});

router.post('/place-bet', authLimiter, async (req, res) => {
    const { bets, stake } = req.body;
    const userId = new ObjectId(req.user.id);
    const db = req.db;
    const session = client.startSession();

    const numericStake = parseFloat(stake);
    if (!bets || bets.length === 0 || !numericStake || numericStake <= 0) {
        return res.status(400).json({ message: 'Datos de la apuesta inválidos.' });
    }

    try {
        await session.startTransaction();

        const user = await db.collection('users').findOne({ _id: userId }, { session });

        if (user.balance < numericStake) {
            await session.abortTransaction();
            return res.status(400).json({ message: 'Fondos insuficientes para esta apuesta.' });
        }

        await db.collection('users').updateOne(
            { _id: userId },
            { $inc: { balance: -numericStake } },
            { session }
        );

        const totalOdds = bets.reduce((acc, bet) => acc * parseFloat(bet.odds), 1);
        const potentialWinnings = numericStake * totalOdds;

        await db.collection('bets').insertOne({
            userId: userId,
            selections: bets,
            stake: numericStake,
            totalOdds: totalOdds,
            potentialWinnings: potentialWinnings,
            status: 'pending',
            createdAt: new Date()
        }, { session });

        await session.commitTransaction();
        res.status(201).json({ message: '¡Apuesta realizada con éxito!' });
    } catch (error) {
        if (session.inTransaction()) {
            await session.abortTransaction();
        }
        console.error('[ERROR] Realizando apuesta:', error);
        res.status(500).json({ message: 'Error interno al realizar la apuesta.' });
    } finally {
        await session.endSession();
    }
});

// =======================================================================
//  RUTAS DE HISTORIAL
// =======================================================================

router.get('/get-bets', async (req, res) => {
    const userId = new ObjectId(req.user.id);
    const db = req.db;

    try {
        const betHistory = await db.collection('bets')
            .find({ userId: userId })
            .sort({ createdAt: -1 })
            .limit(50)
            .toArray();
            
        res.status(200).json(betHistory);

    } catch (error) {
        console.error('[ERROR] Obteniendo historial de apuestas:', error);
        res.status(500).json({ message: 'Error interno al obtener el historial.' });
    }
});

router.get('/transactions', async (req, res) => {
    const userId = new ObjectId(req.user.id);
    const db = req.db;

    try {
        const transactions = await db.collection('transactions')
            .find({ userId: userId })
            .sort({ createdAt: -1 })
            .limit(50) 
            .toArray();
            
        res.status(200).json(transactions);

    } catch (error) {
        console.error('[ERROR] Obteniendo historial de transacciones:', error);
        res.status(500).json({ message: 'Error interno al obtener transacciones.' });
    }
});


module.exports = router;