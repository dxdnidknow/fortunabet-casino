// Archivo: backend/routes/user.js (COMPLETO, CORREGIDO Y REFACTORIZADO)

const express = require('express');
const { ObjectId } = require('mongodb');
const authenticateToken = require('../middleware/authMiddleware');
const rateLimit = require('express-rate-limit');
const { client } = require('../db'); // <-- ¡IMPORTANTE! Para Transacciones

const router = express.Router();

// --- Constantes y Middlewares ---
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });
router.use(authenticateToken); // ¡IMPORTANTE! Todas las rutas en este archivo requieren autenticación.

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

        const updateData = {
            'personalInfo.fullName': fullName,
            'personalInfo.cedula': cedula,
            'personalInfo.birthDate': birthDate,
        };
        
        if (phone) {
             updateData['personalInfo.phone'] = phone;
             // Si el número de teléfono cambia, debemos marcarlo como no verificado
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
//  RUTAS DE VERIFICACIÓN TELEFÓNICA (MOVIDAS DESDE SERVER.JS)
// =======================================================================

// POST /api/request-phone-verification
router.post('/request-phone-verification', authLimiter, async (req, res) => {
    const userId = new ObjectId(req.user.id);
    const db = req.db;

    try {
        const user = await db.collection('users').findOne({ _id: userId });
        const phone = user?.personalInfo?.phone;
        
        if (!phone || !phone.startsWith('+58')) {
            return res.status(400).json({ message: "Añade un número de teléfono válido (+58) en 'Mis Datos' primero." });
        }
        
        // (Aquí iría tu código de Twilio)
        // Por ahora, simularemos el envío y guardaremos un código falso
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 min
        
        await db.collection('users').updateOne(
            { _id: userId },
            { $set: { 'personalInfo.phoneOtp': otp, 'personalInfo.phoneOtpExpires': otpExpires } }
        );
        
        console.log(`[SIMULACIÓN] Código SMS para ${phone} es: ${otp}`);
        
        res.status(200).json({ message: `Se ha enviado un código de verificación a ${phone}.` });
    } catch (error) {
        console.error("Error al enviar código de teléfono:", error);
        res.status(500).json({ message: "No se pudo enviar el código. Verifica que el número sea válido." });
    }
});

// POST /api/verify-phone-code
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
//  RUTAS DE TRANSACCIONES (DEPÓSITO, RETIRO, APUESTA)
// =======================================================================

// POST /api/request-deposit (Llamada por payments.js)
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

// POST /api/withdraw (¡CORREGIDO CON TRANSACCIÓN!)
router.post('/withdraw', authLimiter, async (req, res) => {
    const session = client.startSession();
    
    try {
        await session.startTransaction();
        
        const userId = new ObjectId(req.user.id);
        const { amount, methodId } = req.body;
        const db = req.db;

        const withdrawalAmount = parseFloat(amount);
        if (isNaN(withdrawalAmount) || withdrawalAmount < 10) { // Límite mínimo de retiro
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

        // --- INICIA OPERACIÓN ATÓMICA ---

        // 1. Restar el saldo al usuario
        await db.collection('users').updateOne(
            { _id: userId },
            { $inc: { balance: -withdrawalAmount } },
            { session }
        );

        // 2. Registrar la transacción en el historial
        const transactionRecord = { 
            userId, 
            type: 'withdrawal', 
            amount: -withdrawalAmount, // Se guarda como negativo
            status: 'pending', 
            method: method.methodType, 
            createdAt: new Date() 
        };
        const insertTx = await db.collection('transactions').insertOne(transactionRecord, { session });

        // 3. Crear la solicitud para el admin
        const withdrawalRequest = { 
            userId, 
            username: user.username, 
            amount: withdrawalAmount, // Se guarda en positivo para el admin
            methodDetails: method.details, 
            methodType: method.methodType, 
            status: 'pending', 
            requestedAt: new Date(),
            transactionId: insertTx.insertedId // Vincula la solicitud a la transacción
        };
        await db.collection('withdrawalRequests').insertOne(withdrawalRequest, { session });

        // --- FIN OPERACIÓN ATÓMICA ---

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


// POST /api/place-bet (¡CORREGIDO CON TRANSACCIÓN!)
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

        // --- INICIA OPERACIÓN ATÓMICA ---

        // 1. Restar el saldo al usuario
        await db.collection('users').updateOne(
            { _id: userId },
            { $inc: { balance: -numericStake } },
            { session }
        );

        // 2. Calcular cuota total (Parley)
        const totalOdds = bets.reduce((acc, bet) => acc * parseFloat(bet.odds), 1);
        const potentialWinnings = numericStake * totalOdds;

        // 3. Guardar la apuesta en la base de datos
        await db.collection('bets').insertOne({
            userId: userId,
            selections: bets,
            stake: numericStake,
            totalOdds: totalOdds,
            potentialWinnings: potentialWinnings,
            status: 'pending', // 'pending', 'won', 'lost', 'void'
            createdAt: new Date()
        }, { session });

        // --- FIN OPERACIÓN ATÓMICA ---

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
//  RUTAS DE HISTORIAL (¡NUEVAS!)
// =======================================================================

// GET /api/get-bets (Llamada por account.js en renderBetHistory)
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

// GET /api/transactions (Llamada por account.js en renderTransactionHistory)
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