// Archivo: backend/routes/auth.js (VERSIÓN ACTUALIZADA CON DISEÑO VERDE)

const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const sgMail = require('@sendgrid/mail');
const rateLimit = require('express-rate-limit');
const { ObjectId } = require('mongodb');
const { validate, validateParamId } = require('../validators');
const { generateOtp, getOtpExpiration, log } = require('../utils/helpers');

const router = express.Router();

// --- Constantes ---
const JWT_SECRET = process.env.JWT_SECRET;
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// Limiter general de autenticación
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { message: 'Demasiadas peticiones desde esta IP, por favor intenta de nuevo en 15 minutos.' }
});

// Limiter específico para REENVIAR CÓDIGO (1 minuto de cooldown)
const resendOtpLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 1,
    message: { message: 'Debes esperar 60 segundos antes de volver a solicitar el código.' },
    keyGenerator: (req, res) => req.body.email || req.ip
});

// --- Funciones de Utilidad de Email ---

async function sendVerificationEmail(email, otp) {
    const msg = {
        to: email,
        from: process.env.VERIFIED_SENDER_EMAIL, // DEBE coincidir con el verificado en SendGrid
        subject: `${otp} es tu código de verificación FortunaBet`,
        html: `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <style>
                body { font-family: sans-serif; background-color: #0b0e11; margin: 0; padding: 0; color: #ffffff; }
                .container { max-width: 500px; margin: 40px auto; background-color: #161a1e; border-radius: 12px; overflow: hidden; border: 1px solid #2d3339; text-align: center; }
                .header { background-color: #053d2d; padding: 25px; border-bottom: 4px solid #00ff88; }
                .header h1 { color: #00ff88; margin: 0; text-transform: uppercase; letter-spacing: 2px; font-size: 24px; }
                .content { padding: 40px 30px; }
                .otp-container { background-color: #0b0e11; border: 2px dashed #00ff88; border-radius: 8px; margin: 30px 0; padding: 20px; }
                .otp-code { font-size: 42px; font-weight: bold; color: #00ff88; letter-spacing: 8px; margin: 0; }
                .instruction { color: #707a8a; font-size: 14px; line-height: 1.5; }
                .footer { background-color: #0b0e11; padding: 20px; font-size: 11px; color: #4f5966; }
                .expire-notice { color: #ff4d4d; font-weight: bold; font-size: 12px; margin-top: 10px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header"><h1>FORTUNA<span style="color: #ffffff;">BET</span></h1></div>
                <div class="content">
                    <h2 style="margin-top: 0; color: #ffffff;">Verifica tu cuenta</h2>
                    <p class="instruction">Usa el siguiente código de seguridad para completar tu acceso.</p>
                    <div class="otp-container"><p class="otp-code">${otp}</p></div>
                    <p class="expire-notice">Este código expirará en 10 minutos.</p>
                </div>
                <div class="footer">
                    <p>&copy; 2025 FortunaBet - Seguridad Garantizada.</p>
                </div>
            </div>
        </body>
        </html>
        `,
    };
    try {
        await sgMail.send(msg);
    } catch (error) {
        console.error("Error enviando email OTP:", error.response?.body || error.message);
    }
}

async function sendResetPasswordEmail(email, username, resetLink) {
    const msg = {
        to: email,
        from: process.env.VERIFIED_SENDER_EMAIL,
        subject: 'Restablece tu contraseña de FortunaBet',
        html: `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: sans-serif; background-color: #0b0e11; color: #ffffff; margin: 0; padding: 0; }
                .container { max-width: 500px; margin: 40px auto; background-color: #161a1e; border-radius: 12px; border: 1px solid #2d3339; overflow: hidden; text-align: center; }
                .header { background-color: #053d2d; padding: 25px; border-bottom: 4px solid #00ff88; }
                .content { padding: 40px 30px; }
                .button { display: inline-block; padding: 14px 30px; background-color: #00ff88; color: #053d2d !important; text-decoration: none; border-radius: 8px; font-weight: bold; text-transform: uppercase; }
                .footer { padding: 20px; font-size: 11px; color: #4f5966; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header"><h1 style="color:#00ff88; margin:0;">FORTUNA<span style="color:#fff;">BET</span></h1></div>
                <div class="content">
                    <h2 style="color:#00ff88;">Hola ${username}</h2>
                    <p style="color:#707a8a;">Haz clic en el botón de abajo para restablecer tu contraseña. El enlace es válido por 15 minutos.</p>
                    <div style="margin: 30px 0;">
                        <a href="${resetLink}" class="button">Restablecer Contraseña</a>
                    </div>
                </div>
                <div class="footer"><p>&copy; 2025 FortunaBet</p></div>
            </div>
        </body>
        </html>
        `,
    };
    try {
        await sgMail.send(msg);
    } catch (error) {
        console.error("Error enviando email Password Reset:", error.response?.body || error.message);
    }
}

// =======================================================================
//  RUTAS DE AUTENTICACIÓN
// =======================================================================

// POST /api/register
router.post('/register', authLimiter, validate('register'), async (req, res) => {
    try {
        const { username, email, password } = req.body;
        const db = req.db;

        const usersCollection = db.collection('users');
        const existingUser = await usersCollection.findOne({ 
            $or: [{ email: email }, { username: username }] 
        });
        
        if (existingUser) {
            return res.status(409).json({ message: 'Este correo electrónico o nombre de usuario ya está registrado.' });
        }
        
        const salt = await bcrypt.genSalt(12);
        const hashedPassword = await bcrypt.hash(password, salt);
        const otp = generateOtp();
        const otpExpires = getOtpExpiration(10);

        await usersCollection.insertOne({
            username,
            email: email,
            password: hashedPassword,
            balance: 0,
            role: "user",
            isVerified: false, 
            otp: otp,
            otpExpires: otpExpires,
            createdAt: new Date(),
            personalInfo: {}, 
        });

        await sendVerificationEmail(email, otp);
        log('info', 'AUTH', `Nuevo registro: ${username}`);
        res.status(200).json({ message: 'Registro exitoso. Se ha enviado un código de verificación a tu correo.' });

    } catch (error) {
        log('error', 'AUTH', 'Error en registro', error.message);
        res.status(500).json({ message: 'Error interno del servidor al registrar.' });
    }
});

// POST /api/verify-email
router.post('/verify-email', authLimiter, async (req, res) => {
    try {
        const { email, otp } = req.body;
        const db = req.db;
        
        if (!email || !otp) {
            return res.status(400).json({ message: 'Email y OTP son requeridos.' });
        }

        const user = await db.collection('users').findOne({ email: email.toLowerCase() });

        if (!user) {
            return res.status(200).json({ success: false, message: 'El código es incorrecto o ha expirado.' });
        }
        
        if (user.isVerified) {
             return res.status(200).json({ success: true, message: 'Tu cuenta ya está verificada.' });
        }

        if (user.otp !== otp || (user.otpExpires && user.otpExpires < new Date())) {
            return res.status(200).json({ 
                success: false, 
                message: 'El código es incorrecto o ha expirado. Por favor, inténtalo de nuevo.' 
            });
        }

        await db.collection('users').updateOne(
            { _id: user._id },
            { $set: { isVerified: true }, $unset: { otp: "", otpExpires: "" } } 
        );

        const payload = { id: user._id.toString(), username: user.username, email: user.email, role: user.role };
        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '1d' });

        res.status(201).json({
            success: true,
            message: '¡Cuenta verificada y creada con éxito!',
            token: token,
            user: { username: user.username, email: user.email }
        });
    } catch (error) {
        console.error('[ERROR] en /api/verify-email:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor durante la verificación.' });
    }
});

// POST /api/resend-otp (CON COOLDOWN)
router.post('/resend-otp', resendOtpLimiter, async (req, res) => {
    try {
        const { email } = req.body;
        const db = req.db;
        
        if (!email) {
            return res.status(400).json({ message: 'El correo es obligatorio.' });
        }

        const user = await db.collection('users').findOne({ email: email.toLowerCase() });
        
        if (!user || user.isVerified) {
            return res.status(200).json({ message: 'Se ha reenviado un nuevo código a tu correo.' });
        }
        
        const newOtp = generateOtp();
        const otpExpires = new Date(Date.now() + 10 * 60 * 1000);

        await db.collection('users').updateOne(
            { _id: user._id },
            { $set: { otp: newOtp, otpExpires: otpExpires } }
        );
        
        await sendVerificationEmail(email.toLowerCase(), newOtp);
        res.status(200).json({ message: 'Se ha reenviado un nuevo código a tu correo.' });
    } catch (error) {
        console.error('[ERROR] al reenviar OTP:', error);
        res.status(500).json({ message: 'Error interno del servidor al reenviar.' });
    }
});

// POST /api/login
router.post('/login', authLimiter, validate('login'), async (req, res) => {
    try {
        const { identifier, password } = req.body;
        const db = req.db;

        const user = await db.collection('users').findOne({
            $or: [{ email: identifier.toLowerCase() }, { username: identifier }]
        });
        
        if (!user) return res.status(401).json({ message: 'Credenciales inválidas.' });

        if (!user.isVerified) {
            const newOtp = generateOtp();
            const otpExpires = getOtpExpiration(10);
            await db.collection('users').updateOne({ _id: user._id }, { $set: { otp: newOtp, otpExpires: otpExpires } });
            await sendVerificationEmail(user.email, newOtp);
            
            return res.status(403).json({ 
                message: 'Tu cuenta no está verificada. Te hemos enviado un nuevo código.',
                needsVerification: true,
                email: user.email 
            });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(401).json({ message: 'Credenciales inválidas.' });
        
        const payload = { id: user._id.toString(), username: user.username, email: user.email, role: user.role };
        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '1d' });
        
        log('info', 'AUTH', `Login exitoso: ${user.username}`);
        res.status(200).json({
            message: 'Inicio de sesión exitoso.',
            token: token,
            user: { username: user.username, email: user.email, role: user.role }
        });
    } catch (error) {
        log('error', 'AUTH', 'Error en login', error.message);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
});

// POST /api/forgot-password
router.post('/forgot-password', authLimiter, async (req, res) => {
    try {
        const { email } = req.body;
        const db = req.db;
        const user = await db.collection('users').findOne({ email: email.toLowerCase() });
        
        if (!user) {
            return res.status(200).json({ message: 'Si tu correo está registrado, recibirás un enlace.' });
        }

        const secret = JWT_SECRET + user.password;
        const token = jwt.sign({ email: user.email, id: user._id.toString() }, secret, { expiresIn: '15m' });
        const resetLink = `${process.env.FRONTEND_URL}/index.html?action=reset&id=${user._id}&token=${token}`;

        await sendResetPasswordEmail(user.email, user.username, resetLink);
        res.status(200).json({ message: 'Si tu correo está registrado, recibirás un enlace.' });
    } catch (error) {
        console.error('[ERROR] en forgot-password:', error);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
});

// POST /api/reset-password
router.post('/reset-password', authLimiter, async (req, res) => {
    const { id, token, password } = req.body;
    const db = req.db;
    try {
        if (!ObjectId.isValid(id)) return res.status(400).json({ message: 'ID de usuario no válido.' });
        
        const user = await db.collection('users').findOne({ _id: new ObjectId(id) });
        if (!user) return res.status(400).json({ message: 'Usuario no válido.' });

        const secret = JWT_SECRET + user.password; 
        jwt.verify(token, secret); 

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        
        await db.collection('users').updateOne({ _id: user._id }, { $set: { password: hashedPassword } });

        res.status(200).json({ message: 'Contraseña actualizada con éxito.' });
    } catch (error) {
        console.error('[ERROR] en reset-password:', error);
        res.status(400).json({ message: 'El enlace no es válido o ha expirado.' });
    }
});

module.exports = router;