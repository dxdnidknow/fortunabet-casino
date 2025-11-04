// Archivo: backend/routes/user.js
const express = require('express');
const bcrypt = require('bcrypt');
const twilio = require('twilio');
const sgMail = require('@sendgrid/mail'); // Importamos SendGrid
const { getDb } = require('../db');
const { ObjectId } = require('mongodb');
const authenticateToken = require('../middleware/authMiddleware'); // Middleware de usuario normal
const rateLimit = require('express-rate-limit');

const router = express.Router();

// --- Constantes y Middlewares ---
const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/;
const usernameRegex = /^[a-zA-Z]{4,20}$/;
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });

// Configuración de servicios externos
const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const verifyServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID;
sgMail.setApiKey(process.env.SENDGRID_API_KEY); // Configuramos SendGrid

// Función de ayuda
function isOver18(dateString) {
    if (!dateString) return false;
    const today = new Date();
    const birthDate = new Date(dateString);
    if (isNaN(birthDate.getTime())) return false;
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
        age--;
    }
    return age >= 18;
}

// --- Rutas de Usuario (Protegidas) ---
// Todas estas rutas usan 'authenticateToken'
// 'req.user.id' viene del payload del token

router.post('/change-username', authLimiter, authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { newUsername } = req.body;
        const db = getDb();

        if (!usernameRegex.test(newUsername)) {
            return res.status(400).json({ message: 'El usuario debe tener entre 4 y 20 letras, sin números ni espacios.' });
        }

        const usersCollection = db.collection('users');
        const existingUser = await usersCollection.findOne({ username: { $regex: new RegExp(`^${newUsername}$`, 'i') } });
        if (existingUser) {
            return res.status(409).json({ message: 'El nombre de usuario ya está en uso.' });
        }
        
        const currentUser = await usersCollection.findOne({ _id: new ObjectId(userId) });
        if (!currentUser) {
            return res.status(404).json({ message: 'Usuario no encontrado.' });
        }

        if (currentUser.lastUsernameChange) {
            const lastChangeDate = new Date(currentUser.lastUsernameChange);
            const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
            if (lastChangeDate > fourteenDaysAgo) {
                const nextAvailableDate = new Date(lastChangeDate.getTime() + 14 * 24 * 60 * 60 * 1000);
                return res.status(429).json({ 
                    message: `Solo puedes cambiar tu nombre de usuario una vez cada 14 días. Próximo cambio disponible el ${nextAvailableDate.toLocaleDateDateString('es-ES')}.`
                });
            }
        }

        await usersCollection.updateOne(
            { _id: currentUser._id },
            { $set: { username: newUsername, lastUsernameChange: new Date() } }
        );

        res.status(200).json({ message: 'Nombre de usuario actualizado con éxito.', newUsername: newUsername });

    } catch (error) {
        console.error('[ERROR] en change-username:', error);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
});

router.post('/update-personal-info', authLimiter, authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { firstName, lastName, birthDate, state, phone } = req.body;
        const db = getDb();

        if ((firstName && firstName.length > 25) || (lastName && lastName.length > 25)) {
            return res.status(400).json({ message: 'El nombre y el apellido no pueden tener más de 25 caracteres.' });
        }
        if (birthDate && !isOver18(birthDate)) {
             return res.status(400).json({ message: 'Debes ser mayor de 18 años.' });
        }

        const usersCollection = db.collection('users');
        const currentUser = await usersCollection.findOne({ _id: new ObjectId(userId) });

        if (!currentUser) {
            return res.status(404).json({ message: 'Usuario no encontrado.' });
        }

        let updateData = {
            'personalInfo.firstName': firstName,
            'personalInfo.lastName': lastName,
            'personalInfo.birthDate': birthDate,
            'personalInfo.state': state,
        };
        if (phone && (!currentUser.personalInfo || currentUser.personalInfo.phone !== phone)) {
            updateData['personalInfo.phone'] = phone;
            updateData['personalInfo.phoneVerified'] = false;
        }

        await usersCollection.updateOne({ _id: currentUser._id }, { $set: updateData });
        
        res.status(200).json({ message: 'Información personal actualizada con éxito.' });

    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({ message: 'Este número de teléfono ya está en uso por otra cuenta.' });
        }
        console.error('[ERROR] en update-personal-info:', error);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
});

router.get('/user-data', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const db = getDb();

        const usersCollection = db.collection('users');
        const user = await usersCollection.findOne(
            { _id: new ObjectId(userId) },
            { 
                projection: { 
                    password: 0,
                    passwordChangeCode: 0,
                    passwordChangeCodeExpires: 0
                } 
            }
        );

        if (!user) {
            return res.status(404).json({ message: 'Usuario no encontrado.' });
        }

        res.status(200).json(user);

    } catch (error) {
        console.error('[ERROR] en user-data:', error);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
});

router.post('/request-phone-verification', authLimiter, authenticateToken, async (req, res) => {
    const userId = req.user.id;
    try {
        const db = getDb();
        const user = await db.collection('users').findOne({ _id: new ObjectId(userId) });
        const phone = user?.personalInfo?.phone;
        if (!phone) return res.status(400).json({ message: "Añade un número de teléfono en 'Mis Datos' primero." });
        
        await twilioClient.verify.v2.services(verifyServiceSid).verifications.create({ to: phone, channel: 'sms' });
        res.status(200).json({ message: `Se ha enviado un código de verificación a ${phone}.` });
    } catch (error) {
        console.error("Twilio send error:", error);
        res.status(500).json({ message: "No se pudo enviar el código. Verifica que el número sea válido." });
    }
});

router.post('/verify-phone-code', authLimiter, authenticateToken, async (req, res) => {
    const userId = req.user.id;
    const { code } = req.body;
    try {
        const db = getDb();
        const user = await db.collection('users').findOne({ _id: new ObjectId(userId) });
        const phone = user?.personalInfo?.phone;
        if (!phone || !code) return res.status(400).json({ message: "Falta información para verificar." });

        const verification_check = await twilioClient.verify.v2.services(verifyServiceSid).verificationChecks.create({ to: phone, code: code });
        if (verification_check.status === 'approved') {
            await db.collection('users').updateOne({ _id: user._id }, { $set: { 'personalInfo.phoneVerified': true } });
            res.status(200).json({ message: "¡Teléfono verificado con éxito!" });
        } else {
            res.status(400).json({ message: "El código de verificación es incorrecto." });
        }
    } catch (error) {
        console.error("Twilio check error:", error);
        res.status(500).json({ message: "Error al verificar el código." });
    }
});

// ==========================================================
//  INICIO DE LAS RUTAS AÑADIDAS (Estaban omitidas)
// ==========================================================

router.post('/validate-current-password', authLimiter, authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { currentPassword } = req.body;
        const db = getDb();
        
        if (!currentPassword) {
            return res.status(400).json({ message: 'La contraseña actual es requerida.' });
        }

        const user = await db.collection('users').findOne({ _id: new ObjectId(userId) });
        if (!user) {
            return res.status(401).json({ message: 'La contraseña actual es incorrecta.' }); // User not found
        }

        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            return res.status(401).json({ message: 'La contraseña actual es incorrecta.' });
        }

        res.status(200).json({ message: 'Validación exitosa.' });

    } catch (error) {
        console.error('[ERROR] en validate-current-password:', error);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
});

router.post('/request-password-change-code', authLimiter, authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const db = getDb();
        const user = await db.collection('users').findOne({ _id: new ObjectId(userId) });
        if (!user) return res.status(404).json({ message: 'Usuario no encontrado.' });
        
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        const expiration = new Date(Date.now() + 10 * 60 * 1000); // 10 minutos

        await db.collection('users').updateOne({ _id: user._id }, { $set: { passwordChangeCode: code, passwordChangeCodeExpires: expiration } });

        // ** CORRECCIÓN: Usando sgMail en lugar de 'transporter' **
        const msg = {
            to: user.email,
            from: process.env.VERIFIED_SENDER_EMAIL, // Tu email verificado de SendGrid
            subject: 'Tu código de confirmación para cambiar la contraseña',
            html: `<p>Hola ${user.username},</p><p>Tu código de confirmación es: <strong>${code}</strong></p><p>Este código expirará en 10 minutos.</p>`,
        };
        await sgMail.send(msg);

        res.status(200).json({ message: 'Se ha enviado un código de confirmación a tu correo.' });
    } catch (error) {
        console.error('[ERROR] en request-password-change-code:', error);
        if (error.response) console.error(error.response.body); // Log de SendGrid
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
});

router.post('/change-password', authLimiter, authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { currentPassword, newPassword, code } = req.body;
        const db = getDb();
        
        if (!currentPassword || !newPassword || !code) return res.status(400).json({ message: 'Todos los campos son obligatorios.' });
        
        if (!passwordRegex.test(newPassword)) {
            return res.status(400).json({ message: 'La nueva contraseña no cumple con los requisitos de seguridad.' });
        }

        const usersCollection = db.collection('users');
        const user = await usersCollection.findOne({ _id: new ObjectId(userId) });
        if (!user) return res.status(404).json({ message: 'Usuario no encontrado.' });

        if (user.passwordChangeCode !== code || new Date() > user.passwordChangeCodeExpires) {
            await usersCollection.updateOne({ _id: user._id }, { $unset: { passwordChangeCode: "", passwordChangeCodeExpires: "" } });
            return res.status(400).json({ message: 'El código es incorrecto o ha expirado.' });
        }

        const isCurrentPasswordMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isCurrentPasswordMatch) return res.status(401).json({ message: 'La contraseña actual es incorrecta.' });

        const isNewPasswordSameAsOld = await bcrypt.compare(newPassword, user.password);
        if (isNewPasswordSameAsOld) return res.status(400).json({ message: 'La nueva contraseña no puede ser la misma que la actual.' });
        
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);

        await usersCollection.updateOne(
            { _id: user._id },
            { $set: { password: hashedPassword }, $unset: { passwordChangeCode: "", passwordChangeCodeExpires: "" } }
        );
        
        res.status(200).json({ message: 'Contraseña actualizada con éxito.' });
    } catch (error) {
        console.error('[ERROR] en change-password:', error);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
});


module.exports = router;