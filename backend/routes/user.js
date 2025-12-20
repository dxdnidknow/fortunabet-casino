// Archivo: backend/routes/user.js (VERSIÓN SEGURA CON VALIDACIÓN)

const express = require('express');
const { ObjectId } = require('mongodb');
const bcrypt = require('bcrypt');
const authenticateToken = require('../middleware/authMiddleware');
const rateLimit = require('express-rate-limit');
const { client } = require('../db');
const twilio = require('twilio');
const { validate, validateParamId } = require('../validators');
const { generateOtp, getOtpExpiration, log } = require('../utils/helpers');

const router = express.Router();

// Rate limiter para acciones sensibles (15 mins, 20 intentos)
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });

// Middleware de autenticación global para este router
router.use(authenticateToken);

// Configuración de Twilio (Manejo de errores si no hay keys)
const twilioClient = (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) 
    ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN) 
    : null;
const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;

// Regex para contraseña segura
const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/;

// =======================================================================
//  1. DATOS DE USUARIO
// =======================================================================

router.get('/user-data', async (req, res) => {
    try {
        // req.user viene del middleware. Si el token es viejo, el ID podría no existir en la BD.
        const userId = req.user.id;
        
        if (!ObjectId.isValid(userId)) {
            return res.status(400).json({ message: 'ID de usuario inválido.' });
        }

        const db = req.db;
        const user = await db.collection('users').findOne(
            { _id: new ObjectId(userId) },
            { projection: { password: 0, otp: 0, otpExpires: 0 } }
        );

        if (!user) {
            // Si el token es válido pero el usuario no está en la BD (ej: BD borrada)
            return res.status(404).json({ message: 'Usuario no encontrado en la base de datos.' });
        }

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

        // VALIDACIÓN DE DUPLICADOS: Si envían un teléfono, verificar que nadie más lo tenga
        if (phone) {
            const existingUserWithPhone = await db.collection('users').findOne({
                'personalInfo.phone': phone,
                _id: { $ne: new ObjectId(userId) } // Excluir al usuario actual
            });

            if (existingUserWithPhone) {
                return res.status(400).json({ message: 'Este número de teléfono ya está registrado en otra cuenta.' });
            }
        }

        const updateData = {
            'personalInfo.fullName': fullName,
            'personalInfo.cedula': cedula,
            'personalInfo.birthDate': birthDate,
        };
        
        if (phone) {
             updateData['personalInfo.phone'] = phone;
             
             // Buscamos al usuario actual para ver si cambió el número
             const user = await db.collection('users').findOne({ _id: new ObjectId(userId) });
             
             if (user) {
                 const currentPhone = (user.personalInfo) ? user.personalInfo.phone : null;
                 // Si el número es diferente, reseteamos la verificación
                 if (currentPhone !== phone) {
                     updateData['personalInfo.isPhoneVerified'] = false;
                     updateData['personalInfo.phoneOtp'] = "";
                 }
             }
        }

        await db.collection('users').updateOne(
            { _id: new ObjectId(userId) }, 
            { $set: updateData }
        );
        
        res.status(200).json({ message: 'Información personal actualizada con éxito.' });
    } catch (error) {
        console.error('[ERROR] en update-personal-info:', error);
        res.status(500).json({ message: 'Error interno del servidor: ' + error.message });
    }
});

// =======================================================================
//  2. CAMBIO DE CONTRASEÑA
// =======================================================================

router.post('/change-password', authLimiter, async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    const userId = new ObjectId(req.user.id);
    const db = req.db;

    if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: 'Todos los campos son obligatorios.' });
    }
    if (!passwordRegex.test(newPassword)) {
        return res.status(400).json({ message: 'La nueva contraseña no cumple los requisitos de seguridad.' });
    }

    try {
        const user = await db.collection('users').findOne({ _id: userId });
        if (!user) return res.status(404).json({ message: 'Usuario no encontrado.' });

        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) return res.status(401).json({ message: 'La contraseña actual es incorrecta.' });

        const salt = await bcrypt.genSalt(10);
        const hashedNewPassword = await bcrypt.hash(newPassword, salt);

        await db.collection('users').updateOne(
            { _id: userId },
            { $set: { password: hashedNewPassword } }
        );

        res.status(200).json({ message: 'Contraseña actualizada con éxito.' });

    } catch (error) {
        console.error('[ERROR] en /change-password:', error);
        res.status(500).json({ message: 'Error interno al cambiar la contraseña.' });
    }
});

// =======================================================================
//  3. VERIFICACIÓN TELEFÓNICA (TWILIO)
// =======================================================================

router.post('/request-phone-verification', authLimiter, async (req, res) => {
    const userId = new ObjectId(req.user.id);
    const db = req.db;

    if (!twilioClient || !twilioPhoneNumber) {
        console.error("❌ Error: Twilio no está configurado en .env");
        return res.status(500).json({ message: "El servicio de verificación no está disponible." });
    }

    try {
        const user = await db.collection('users').findOne({ _id: userId });
        const phone = user?.personalInfo?.phone;
        
        if (!phone || !phone.startsWith('+58')) {
            return res.status(400).json({ message: "Añade un número de teléfono válido (+58) en 'Mis Datos' primero." });
        }
        
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const otpExpires = new Date(Date.now() + 10 * 60 * 1000);
        
        await db.collection('users').updateOne(
            { _id: userId },
            { $set: { 'personalInfo.phoneOtp': otp, 'personalInfo.phoneOtpExpires': otpExpires } }
        );
        
        await twilioClient.messages.create({
            body: `Tu código de verificación para FortunaBet es: ${otp}`,
            from: twilioPhoneNumber,
            to: phone
        });
        
        res.status(200).json({ message: `Se ha enviado un código de verificación a tu teléfono.` });

    } catch (error) {
        console.error("Error al enviar código con Twilio:", error);
        if (error.code === 21211) return res.status(400).json({ message: "El número de teléfono proporcionado no es válido." });
        if (error.code === 21608) return res.status(400).json({ message: "Este número no está verificado en la cuenta de prueba de Twilio." });
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
//  4. MÉTODOS DE PAGO
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
//  5. TRANSACCIONES (DEPÓSITOS Y RETIROS)
// =======================================================================

router.post('/request-deposit', authLimiter, validate('requestDeposit'), async (req, res) => {
    const userId = new ObjectId(req.user.id);
    const db = req.db;

    try {
        const user = await db.collection('users').findOne({ _id: userId });
        const isVerified = user?.personalInfo?.isPhoneVerified;
        const hasData = user?.personalInfo?.fullName && user?.personalInfo?.cedula;

        if (!isVerified || !hasData) {
            return res.status(403).json({ message: "Debes completar tus datos personales y verificar tu teléfono en 'Mi Cuenta' para poder depositar." });
        }

        const { amount, method, reference } = req.body;

        await db.collection('transactions').insertOne({
            userId: userId,
            type: 'deposit',
            status: 'pending',
            amount: amount,
            method: method,
            reference: reference,
            createdAt: new Date()
        });
        
        log('info', 'USER', `Depósito reportado: ${user.username} - Bs.${amount}`);
        res.status(201).json({ message: 'Depósito reportado. Se verificará en breve.' });
    } catch (error) {
        log('error', 'USER', 'Error reportando depósito', error.message);
        res.status(500).json({ message: 'Error interno al reportar el depósito.' });
    }
});

router.post('/withdraw', authLimiter, validate('withdraw'), async (req, res) => {
    const userId = new ObjectId(req.user.id);
    const db = req.db;
    const session = client.startSession();
    
    try {
        await session.startTransaction();
        
        const user = await db.collection('users').findOne({ _id: userId }, { session });
        const isVerified = user?.personalInfo?.isPhoneVerified;
        const hasData = user?.personalInfo?.fullName && user?.personalInfo?.cedula;

        if (!isVerified || !hasData) {
            await session.abortTransaction();
            return res.status(403).json({ message: "Debes completar tus datos personales y verificar tu teléfono para poder retirar." });
        }
        
        const { amount, methodId } = req.body;

        if (!user || user.balance < amount) {
            await session.abortTransaction();
            return res.status(400).json({ message: 'Fondos insuficientes para realizar el retiro.' });
        }
        
        const method = await db.collection('payoutMethods').findOne({ _id: new ObjectId(methodId), userId }, { session });
        if (!method) {
            await session.abortTransaction();
            return res.status(404).json({ message: 'Método de retiro no encontrado.' });
        }

        // Descontar saldo
        await db.collection('users').updateOne(
            { _id: userId },
            { $inc: { balance: -amount } },
            { session }
        );

        // Registro de transacción
        const insertTx = await db.collection('transactions').insertOne({ 
            userId, 
            type: 'withdrawal', 
            amount: -amount,
            status: 'pending', 
            method: method.methodType, 
            createdAt: new Date() 
        }, { session });

        // Solicitud de retiro para admin
        await db.collection('withdrawalRequests').insertOne({ 
            userId, 
            username: user.username, 
            amount: amount,
            methodDetails: method.details, 
            methodType: method.methodType, 
            status: 'pending', 
            requestedAt: new Date(),
            transactionId: insertTx.insertedId
        }, { session });
        
        log('info', 'USER', `Retiro solicitado: ${user.username} - Bs.${amount}`);

        await session.commitTransaction();
        res.status(200).json({ message: 'Solicitud de retiro enviada. Se procesará en breve.' });
    } catch (error) {
        if (session.inTransaction()) await session.abortTransaction();
        console.error('[ERROR] en /api/withdraw:', error);
        res.status(500).json({ message: 'Error interno al procesar el retiro.' });
    } finally {
        await session.endSession();
    }
});

// =======================================================================
//  6. APUESTAS
// =======================================================================

router.post('/place-bet', authLimiter, validate('placeBet'), async (req, res) => {
    const { bets, stake } = req.body;
    const userId = new ObjectId(req.user.id);
    const db = req.db;
    const session = client.startSession();

    try {
        await session.startTransaction();

        // 1. Verificar saldo
        const user = await db.collection('users').findOne({ _id: userId }, { session });
        if (!user) {
            await session.abortTransaction();
            return res.status(404).json({ message: 'Usuario no encontrado.' });
        }
        if (user.balance < stake) {
            await session.abortTransaction();
            return res.status(400).json({ message: 'Fondos insuficientes para esta apuesta.' });
        }

        // 2. Calcular cuotas totales
        let totalOdds = 1;
        for (const bet of bets) {
            totalOdds *= bet.odds;
        }

        // 3. Descontar saldo
        await db.collection('users').updateOne(
            { _id: userId },
            { $inc: { balance: -stake } },
            { session }
        );

        const potentialWinnings = stake * totalOdds;

        // 4. Guardar apuesta
        await db.collection('bets').insertOne({
            userId: userId,
            selections: bets,
            stake: stake,
            totalOdds: totalOdds,
            potentialWinnings: potentialWinnings,
            status: 'pending',
            createdAt: new Date()
        }, { session });

        await session.commitTransaction();
        log('info', 'USER', `Apuesta realizada: ${user.username} - Bs.${stake} (${bets.length} selecciones)`);
        res.status(201).json({ message: '¡Apuesta realizada con éxito!' });

    } catch (error) {
        if (session.inTransaction()) await session.abortTransaction();
        log('error', 'USER', 'Error realizando apuesta', error.message);
        res.status(500).json({ message: 'Error interno al realizar la apuesta.' });
    } finally {
        await session.endSession();
    }
});

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

// =======================================================================
//  7. AUTENTICACIÓN DE DOS FACTORES (2FA)
// =======================================================================

// Activar/Desactivar 2FA
router.post('/2fa/toggle', authLimiter, async (req, res) => {
    const userId = new ObjectId(req.user.id);
    const { enable } = req.body;
    const db = req.db;

    try {
        const user = await db.collection('users').findOne({ _id: userId });
        
        if (enable && !user.personalInfo?.isPhoneVerified) {
            return res.status(400).json({ 
                message: 'Debes verificar tu número de teléfono antes de activar 2FA.' 
            });
        }

        await db.collection('users').updateOne(
            { _id: userId },
            { $set: { 'security.twoFactorEnabled': enable } }
        );

        res.status(200).json({ 
            message: enable ? '2FA activado correctamente.' : '2FA desactivado.',
            twoFactorEnabled: enable
        });
    } catch (error) {
        console.error('[ERROR] Toggle 2FA:', error);
        res.status(500).json({ message: 'Error al configurar 2FA.' });
    }
});

// Enviar código 2FA al login
router.post('/2fa/send-code', authLimiter, async (req, res) => {
    const { email } = req.body;
    const db = req.db;

    try {
        const user = await db.collection('users').findOne({ email: email.toLowerCase() });
        if (!user) return res.status(404).json({ message: 'Usuario no encontrado.' });

        const phone = user.personalInfo?.phone;
        if (!phone) {
            return res.status(400).json({ message: 'No hay teléfono registrado para 2FA.' });
        }

        const otp = generateOtp();
        const otpExpires = getOtpExpiration(5); // 5 minutos

        await db.collection('users').updateOne(
            { _id: user._id },
            { $set: { 'security.loginOtp': otp, 'security.loginOtpExpires': otpExpires } }
        );

        // Enviar por SMS si Twilio está configurado
        if (twilioClient && twilioPhoneNumber) {
            await twilioClient.messages.create({
                body: `Tu código de acceso FortunaBet es: ${otp}. Válido por 5 minutos.`,
                from: twilioPhoneNumber,
                to: phone
            });
        }

        res.status(200).json({ message: 'Código enviado a tu teléfono.' });
    } catch (error) {
        console.error('[ERROR] Enviar código 2FA:', error);
        res.status(500).json({ message: 'Error al enviar código.' });
    }
});

// Verificar código 2FA
router.post('/2fa/verify', authLimiter, async (req, res) => {
    const { email, code } = req.body;
    const db = req.db;

    try {
        const user = await db.collection('users').findOne({ email: email.toLowerCase() });
        if (!user) return res.status(404).json({ message: 'Usuario no encontrado.' });

        const security = user.security || {};
        
        if (!security.loginOtp) {
            return res.status(400).json({ message: 'No hay código pendiente.' });
        }
        if (security.loginOtp !== code) {
            return res.status(400).json({ message: 'Código incorrecto.' });
        }
        if (new Date() > new Date(security.loginOtpExpires)) {
            return res.status(400).json({ message: 'Código expirado.' });
        }

        // Limpiar OTP usado
        await db.collection('users').updateOne(
            { _id: user._id },
            { $unset: { 'security.loginOtp': '', 'security.loginOtpExpires': '' } }
        );

        res.status(200).json({ success: true, message: 'Verificación exitosa.' });
    } catch (error) {
        console.error('[ERROR] Verificar 2FA:', error);
        res.status(500).json({ message: 'Error al verificar código.' });
    }
});

// =======================================================================
//  8. SISTEMA DE BONOS
// =======================================================================

// Obtener bonos del usuario
router.get('/bonuses', async (req, res) => {
    const userId = new ObjectId(req.user.id);
    const db = req.db;

    try {
        const bonuses = await db.collection('bonuses')
            .find({ userId })
            .sort({ createdAt: -1 })
            .toArray();

        // Obtener bonos disponibles globales
        const availableBonuses = await db.collection('bonusTemplates')
            .find({ isActive: true })
            .toArray();

        res.status(200).json({ userBonuses: bonuses, availableBonuses });
    } catch (error) {
        console.error('[ERROR] Obtener bonos:', error);
        res.status(500).json({ message: 'Error al obtener bonos.' });
    }
});

// Reclamar bono
router.post('/bonuses/claim', authLimiter, async (req, res) => {
    const userId = new ObjectId(req.user.id);
    const { bonusCode } = req.body;
    const db = req.db;

    try {
        const user = await db.collection('users').findOne({ _id: userId });
        
        // Buscar plantilla de bono
        const bonusTemplate = await db.collection('bonusTemplates').findOne({ 
            code: bonusCode.toUpperCase(),
            isActive: true
        });

        if (!bonusTemplate) {
            return res.status(404).json({ message: 'Código de bono inválido o expirado.' });
        }

        // Verificar si ya reclamó este bono
        const existingBonus = await db.collection('bonuses').findOne({
            userId,
            templateId: bonusTemplate._id
        });

        if (existingBonus) {
            return res.status(400).json({ message: 'Ya has reclamado este bono.' });
        }

        // Verificar requisitos
        if (bonusTemplate.type === 'welcome' && user.bonuses?.welcomeClaimed) {
            return res.status(400).json({ message: 'Ya reclamaste el bono de bienvenida.' });
        }

        // Crear bono para el usuario
        const newBonus = {
            userId,
            templateId: bonusTemplate._id,
            code: bonusTemplate.code,
            name: bonusTemplate.name,
            type: bonusTemplate.type,
            amount: bonusTemplate.amount,
            percentage: bonusTemplate.percentage || null,
            maxBonus: bonusTemplate.maxBonus || null,
            wageringRequirement: bonusTemplate.wageringRequirement || 1,
            wageringProgress: 0,
            status: 'active',
            expiresAt: new Date(Date.now() + (bonusTemplate.validDays || 30) * 24 * 60 * 60 * 1000),
            createdAt: new Date()
        };

        await db.collection('bonuses').insertOne(newBonus);

        // Si es bono de dinero directo, agregar al balance
        if (bonusTemplate.type === 'fixed') {
            await db.collection('users').updateOne(
                { _id: userId },
                { 
                    $inc: { 'bonusBalance': bonusTemplate.amount },
                    $set: { 'bonuses.welcomeClaimed': bonusTemplate.type === 'welcome' }
                }
            );
        }

        res.status(200).json({ 
            message: `¡Bono "${bonusTemplate.name}" reclamado con éxito!`,
            bonus: newBonus
        });
    } catch (error) {
        console.error('[ERROR] Reclamar bono:', error);
        res.status(500).json({ message: 'Error al reclamar bono.' });
    }
});

// =======================================================================
//  9. JUEGO RESPONSABLE
// =======================================================================

// Obtener configuración de juego responsable
router.get('/responsible-gaming', async (req, res) => {
    const userId = new ObjectId(req.user.id);
    const db = req.db;

    try {
        const user = await db.collection('users').findOne(
            { _id: userId },
            { projection: { responsibleGaming: 1 } }
        );

        res.status(200).json(user?.responsibleGaming || {
            depositLimit: { daily: null, weekly: null, monthly: null },
            lossLimit: { daily: null, weekly: null, monthly: null },
            sessionLimit: null,
            selfExclusion: { isActive: false, until: null },
            realityCheck: { enabled: false, intervalMinutes: 60 }
        });
    } catch (error) {
        console.error('[ERROR] Obtener config juego responsable:', error);
        res.status(500).json({ message: 'Error al obtener configuración.' });
    }
});

// Configurar límites de depósito
router.post('/responsible-gaming/deposit-limits', authLimiter, async (req, res) => {
    const userId = new ObjectId(req.user.id);
    const { daily, weekly, monthly } = req.body;
    const db = req.db;

    try {
        await db.collection('users').updateOne(
            { _id: userId },
            { 
                $set: { 
                    'responsibleGaming.depositLimit.daily': daily || null,
                    'responsibleGaming.depositLimit.weekly': weekly || null,
                    'responsibleGaming.depositLimit.monthly': monthly || null,
                    'responsibleGaming.depositLimit.updatedAt': new Date()
                } 
            }
        );

        res.status(200).json({ message: 'Límites de depósito actualizados.' });
    } catch (error) {
        console.error('[ERROR] Config límites depósito:', error);
        res.status(500).json({ message: 'Error al configurar límites.' });
    }
});

// Configurar límites de pérdida
router.post('/responsible-gaming/loss-limits', authLimiter, async (req, res) => {
    const userId = new ObjectId(req.user.id);
    const { daily, weekly, monthly } = req.body;
    const db = req.db;

    try {
        await db.collection('users').updateOne(
            { _id: userId },
            { 
                $set: { 
                    'responsibleGaming.lossLimit.daily': daily || null,
                    'responsibleGaming.lossLimit.weekly': weekly || null,
                    'responsibleGaming.lossLimit.monthly': monthly || null,
                    'responsibleGaming.lossLimit.updatedAt': new Date()
                } 
            }
        );

        res.status(200).json({ message: 'Límites de pérdida actualizados.' });
    } catch (error) {
        console.error('[ERROR] Config límites pérdida:', error);
        res.status(500).json({ message: 'Error al configurar límites.' });
    }
});

// Configurar límite de sesión
router.post('/responsible-gaming/session-limit', authLimiter, async (req, res) => {
    const userId = new ObjectId(req.user.id);
    const { minutes } = req.body;
    const db = req.db;

    try {
        await db.collection('users').updateOne(
            { _id: userId },
            { $set: { 'responsibleGaming.sessionLimit': minutes || null } }
        );

        res.status(200).json({ message: 'Límite de sesión configurado.' });
    } catch (error) {
        console.error('[ERROR] Config límite sesión:', error);
        res.status(500).json({ message: 'Error al configurar límite.' });
    }
});

// Autoexclusión
router.post('/responsible-gaming/self-exclusion', authLimiter, async (req, res) => {
    const userId = new ObjectId(req.user.id);
    const { duration, reason } = req.body; // duration en días: 1, 7, 30, 90, 180, 365, 'permanent'
    const db = req.db;

    try {
        let untilDate = null;
        if (duration !== 'permanent') {
            untilDate = new Date(Date.now() + duration * 24 * 60 * 60 * 1000);
        }

        await db.collection('users').updateOne(
            { _id: userId },
            { 
                $set: { 
                    'responsibleGaming.selfExclusion': {
                        isActive: true,
                        startedAt: new Date(),
                        until: untilDate,
                        reason: reason || 'No especificado',
                        isPermanent: duration === 'permanent'
                    }
                } 
            }
        );

        // Log de auditoría
        await db.collection('auditLogs').insertOne({
            userId,
            action: 'self_exclusion',
            duration,
            reason,
            createdAt: new Date()
        });

        res.status(200).json({ 
            message: duration === 'permanent' 
                ? 'Autoexclusión permanente activada. Contacta soporte para revertir.' 
                : `Autoexclusión activada hasta ${untilDate.toLocaleDateString('es-VE')}.`
        });
    } catch (error) {
        console.error('[ERROR] Autoexclusión:', error);
        res.status(500).json({ message: 'Error al procesar autoexclusión.' });
    }
});

// Reality Check (recordatorio de tiempo jugando)
router.post('/responsible-gaming/reality-check', authLimiter, async (req, res) => {
    const userId = new ObjectId(req.user.id);
    const { enabled, intervalMinutes } = req.body;
    const db = req.db;

    try {
        await db.collection('users').updateOne(
            { _id: userId },
            { 
                $set: { 
                    'responsibleGaming.realityCheck': {
                        enabled: enabled,
                        intervalMinutes: intervalMinutes || 60
                    }
                } 
            }
        );

        res.status(200).json({ message: 'Configuración de Reality Check guardada.' });
    } catch (error) {
        console.error('[ERROR] Reality Check:', error);
        res.status(500).json({ message: 'Error al configurar Reality Check.' });
    }
});

module.exports = router;