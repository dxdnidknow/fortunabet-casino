// Archivo: backend/routes/auth.js (CORREGIDO Y COMPLETO)

const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const sgMail = require('@sendgrid/mail');
const rateLimit = require('express-rate-limit');
const { ObjectId } = require('mongodb');

const router = express.Router();

// --- Constantes y Middlewares ---
const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/;
const usernameRegex = /^[a-zA-Z]{4,20}$/;
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
    windowMs: 60 * 1000, // 1 minuto
    max: 1, // 1 intento por minuto
    message: { message: 'Debes esperar 60 segundos antes de volver a solicitar el código.' },
    keyGenerator: (req, res) => req.body.email || req.ip // rastrea por email
});

// --- Funciones de Utilidad ---
function generateOtp() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sendVerificationEmail(email, otp) {
    const msg = {
        to: email,
        from: process.env.VERIFIED_SENDER_EMAIL, // Asegúrate que esta variable esté en tu .env
        subject: 'Tu código de verificación para FortunaBet',
        html: `<p>Tu código de verificación es: <strong>${otp}</strong></p><p>Expira en 10 minutos.</p>`,
    };
    try {
        await sgMail.send(msg);
    } catch (error) {
        console.error("Error enviando email con SendGrid:", error);
    }
}

// =======================================================================
//  RUTAS DE AUTENTICACIÓN
// =======================================================================

// POST /api/register
router.post('/register', authLimiter, async (req, res) => {
    try {
        const { username, email, password } = req.body;
        const db = req.db; // Obtenemos la BD desde el middleware en server.js

        if (!username || !email || !password) return res.status(400).json({ message: 'Todos los campos son obligatorios.' });
        if (!usernameRegex.test(username)) return res.status(400).json({ message: 'El usuario debe tener entre 4 y 20 letras, sin números ni espacios.' });
        if (!passwordRegex.test(password)) return res.status(400).json({ message: 'La contraseña no cumple con los requisitos de seguridad.' });

        const usersCollection = db.collection('users');
        const existingUser = await usersCollection.findOne({ $or: [{ email: email.toLowerCase() }, { username: username }] });
        if (existingUser) {
            return res.status(409).json({ message: 'Este correo electrónico o nombre de usuario ya está registrado.' });
        }
        
        // (Tu lógica de 'unverified_users' fue reemplazada por esta que es más simple)
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        const otp = generateOtp();
        const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutos

        await usersCollection.insertOne({
            username,
            email: email.toLowerCase(),
            password: hashedPassword,
            balance: 0,
            role: "user",
            isVerified: false, // Inicia como NO verificado
            otp: otp,
            otpExpires: otpExpires,
            createdAt: new Date(),
            personalInfo: {},
            payoutMethods: []
        });

        await sendVerificationEmail(email.toLowerCase(), otp);
        res.status(200).json({ message: 'Registro exitoso. Se ha enviado un código de verificación a tu correo.' });

    } catch (error) {
        console.error('[ERROR] en /api/register:', error);
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
            // No revelamos si el usuario existe o no
            return res.status(200).json({ success: false, message: 'El código es incorrecto o ha expirado.' });
        }
        
        if (user.isVerified) {
             return res.status(200).json({ success: true, message: 'Tu cuenta ya está verificada.' });
        }

        // LÓGICA DE CÓDIGO INCORRECTO O EXPIRADO
        if (user.otp !== otp || (user.otpExpires && user.otpExpires < new Date())) {
            // Devuelve 200 OK con success: false (como lo pide auth.js)
            return res.status(200).json({ 
                success: false, 
                message: 'El código es incorrecto o ha expirado. Por favor, inténtalo de nuevo.' 
            });
        }

        // --- ÉXITO ---
        await db.collection('users').updateOne(
            { _id: user._id },
            { $set: { isVerified: true }, $unset: { otp: "", otpExpires: "" } } // Limpia el OTP
        );

        const payload = { id: user._id, username: user.username, email: user.email, role: user.role };
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
            // No revelamos información, solo decimos que se envió
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
router.post('/login', authLimiter, async (req, res) => {
    try {
        const { identifier, password } = req.body;
        const db = req.db;
        if (!identifier || !password) return res.status(400).json({ message: 'El identificador y la contraseña son obligatorios.' });

        const user = await db.collection('users').findOne({
            $or: [{ email: identifier.toLowerCase() }, { username: identifier }]
        });
        
        if (!user) return res.status(401).json({ message: 'Credenciales inválidas.' });

        // IMPORTANTE: Verificar si la cuenta está activada
        if (!user.isVerified) {
            // Si no está verificada, reenviamos el código y pedimos que verifique
            const newOtp = generateOtp();
            const otpExpires = new Date(Date.now() + 10 * 60 * 1000);
            await db.collection('users').updateOne({ _id: user._id }, { $set: { otp: newOtp, otpExpires: otpExpires } });
            await sendVerificationEmail(user.email, newOtp);
            
            return res.status(403).json({ 
                message: 'Tu cuenta no está verificada. Te hemos enviado un nuevo código.',
                needsVerification: true, // Una bandera para que el frontend abra el modal de OTP
                email: user.email 
            });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(401).json({ message: 'Credenciales inválidas.' });
        
        const payload = { id: user._id, username: user.username, email: user.email, role: user.role };
        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '1d' });
        
        res.status(200).json({
            message: 'Inicio de sesión exitoso.',
            token: token,
            user: { username: user.username, email: user.email, role: user.role }
        });
    } catch (error) {
        console.error('[ERROR] en el inicio de sesión:', error);
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
            // No revelar si el usuario existe
            return res.status(200).json({ message: 'Si tu correo está registrado, recibirás un enlace.' });
        }

        // Crea un token de reseteo especial que depende de la contraseña actual
        const secret = JWT_SECRET + user.password;
        const token = jwt.sign({ email: user.email, id: user._id.toString() }, secret, { expiresIn: '15m' });
        
        // Asegúrate que FRONTEND_URL esté en tu .env
        const resetLink = `${process.env.FRONTEND_URL}/index.html?action=reset&id=${user._id}&token=${token}`;

        const msg = {
            to: user.email,
            from: process.env.VERIFIED_SENDER_EMAIL,
            subject: 'Restablece tu contraseña de FortunaBet',
            html: `<p>Hola ${user.username},</p><p>Haz clic en el siguiente enlace para restablecer tu contraseña. El enlace es válido por 15 minutos:</p><a href="${resetLink}">Restablecer Contraseña</a>`,
        };
        await sgMail.send(msg);
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
        if (!passwordRegex.test(password)) {
            return res.status(400).json({ message: 'La nueva contraseña no cumple con los requisitos de seguridad.' });
        }

        const user = await db.collection('users').findOne({ _id: new ObjectId(id) });
        if (!user) return res.status(400).json({ message: 'Usuario no válido.' });

        const secret = JWT_SECRET + user.password; // El secreto debe coincidir
        jwt.verify(token, secret); // Si esto falla, lanza un error

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