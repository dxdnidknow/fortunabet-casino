// =======================================================================
//  CONFIGURACIÓN INICIAL Y DEPENDENCIAS
// =======================================================================
require('dotenv').config(); // Debe ser la primera línea

const express = require('express');
const axios = require('axios');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');
const NodeCache = require('node-cache');
const nodemailer = require('nodemailer');
const jwt = require('jsonwebtoken');
const twilio = require('twilio');   
const sgMail = require('@sendgrid/mail');

const app = express();
const port = 3001;

app.use(cors());
app.use(express.json());

// =======================================================================
//  CONSTANTES DE VALIDACIÓN Y SECRETOS
// =======================================================================
const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/;
const usernameRegex = /^[a-zA-Z]{4,20}$/;

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    console.error("❌ Error: La variable de entorno JWT_SECRET no está definida. Es crucial para la seguridad.");
    process.exit(1);
}

// =======================================================================
//  CONEXIÓN A LA BASE DE DATOS (MONGODB ATLAS)
// =======================================================================
const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
    console.error("❌ Error: La variable de entorno DATABASE_URL no se ha cargado. Revisa tu archivo .env");
    process.exit(1);
}
const client = new MongoClient(dbUrl, { serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true }});
let db;
async function connectDB() {
  try {
    await client.connect();
    db = client.db("fortunabet_db");
    console.log("✅ Conectado exitosamente a MongoDB Atlas!");
  } catch (error) {
    console.error("❌ Error al conectar a MongoDB:", error);
    process.exit(1);
  }
}

// =======================================================================
//  FUNCIONES DE AYUDA
// =======================================================================
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

// =======================================================================
//  CONFIGURACIÓN DE SERVICIOS EXTERNOS (API DEPORTES Y EMAIL)
// =======================================================================
const API_KEY = process.env.ODDS_API_KEY;
if (!API_KEY) { console.error('❌ Error: La variable de entorno ODDS_API_KEY no está definida.'); process.exit(1); }
const eventsCache = new NodeCache({ stdTTL: 600 });

sgMail.setApiKey(process.env.SENDGRID_API_KEY);
if (!process.env.SENDGRID_API_KEY || !process.env.VERIFIED_SENDER_EMAIL) {
    console.error("❌ Error: Faltan las variables de entorno de SendGrid (SENDGRID_API_KEY o VERIFIED_SENDER_EMAIL).");
    process.exit(1);
}

const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const verifyServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID;

// =======================================================================
//  MIDDLEWARES DE SEGURIDAD
// =======================================================================
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { message: 'Demasiadas peticiones desde esta IP, por favor intenta de nuevo en 15 minutos.' }
});

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token == null) return res.status(401).json({ message: 'Acceso no autorizado.' });
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ message: 'Token no válido o expirado.' });
        req.user = user;
        next();
    });
}

// =======================================================================
//  ENDPOINTS DE LA API
// =======================================================================

// --- ENDPOINTS PÚBLICOS DE DEPORTES ---
app.get('/api/events/:sportKey', async (req, res) => {
    try {
        const { sportKey } = req.params;
        const cachedEvents = eventsCache.get(sportKey);
        if (cachedEvents) { return res.json(cachedEvents); }
        const response = await axios.get(`https://api.the-odds-api.com/v4/sports/${sportKey}/odds`, {
            params: { apiKey: API_KEY, regions: 'us,eu,uk', markets: 'h2h,totals', oddsFormat: 'decimal' }
        });
        eventsCache.set(sportKey, response.data);
        res.json(response.data);
    } catch (error) { handleApiError(error, res); }
});

app.get('/api/sports', async (req, res) => {
    try {
        const cachedSports = eventsCache.get('sportsList');
        if (cachedSports) { return res.json(cachedSports); }
        const response = await axios.get('https://api.the-odds-api.com/v4/sports', { params: { apiKey: API_KEY } });
        eventsCache.set('sportsList', response.data, 3600);
        res.json(response.data);
    } catch (error) { handleApiError(error, res); }
});

app.get('/api/event/:sportKey/:eventId', (req, res) => {
    const { sportKey, eventId } = req.params;
    const sportEventsList = eventsCache.get(sportKey);
    if (sportEventsList) {
        const event = sportEventsList.find(e => e.id === eventId);
        if (event) { return res.json(event); }
    }
    res.status(404).json({ message: 'Evento no encontrado o caché expirado.' });
});


// --- ENDPOINTS PÚBLICOS DE AUTENTICACIÓN ---

app.post('/api/register', authLimiter, async (req, res) => {
    try {
        const { username, email, password } = req.body;
        if (!username || !email || !password) return res.status(400).json({ message: 'Todos los campos son obligatorios.' });
        if (!usernameRegex.test(username)) return res.status(400).json({ message: 'El usuario debe tener entre 4 y 20 letras, sin números ni espacios.' });
        if (!passwordRegex.test(password)) return res.status(400).json({ message: 'La contraseña no cumple con los requisitos de seguridad.' });

        const usersCollection = db.collection('users');
        const existingVerifiedUser = await usersCollection.findOne({ email: email.toLowerCase() });
        if (existingVerifiedUser) {
            return res.status(409).json({ message: 'Este correo electrónico ya está registrado y verificado.' });
        }

        const unverifiedUsersCollection = db.collection('unverified_users');
        const existingUnverifiedUser = await unverifiedUsersCollection.findOne({ email: email.toLowerCase() });
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const otpExpires = new Date(Date.now() + 15 * 60 * 1000);
        const mailOptions = {
            to: email,
            from: process.env.VERIFIED_SENDER_EMAIL,
            subject: 'Tu código de verificación para FortunaBet',
            html: `<p>Hola ${username},</p><p>Tu código de verificación es:</p><h2 style="text-align:center; letter-spacing: 5px; font-size: 36px;">${otp}</h2><p>Este código expirará en 15 minutos.</p>`,
        };

        if (existingUnverifiedUser) {
            await unverifiedUsersCollection.updateOne({ email: email.toLowerCase() }, { $set: { otp, otpExpires } });
            await sgMail.send(mailOptions);
            return res.status(200).json({ message: 'Ya tienes un registro pendiente. Te hemos enviado un nuevo código.' });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        await unverifiedUsersCollection.insertOne({ username, email: email.toLowerCase(), password: hashedPassword, otp, otpExpires, createdAt: new Date() });
        await sgMail.send(mailOptions);
        res.status(200).json({ message: 'Se ha enviado un código de verificación a tu correo.' });
    } catch (error) {
        console.error('[ERROR] en el registro de usuario:', error);
        if (error.response) console.error(error.response.body); // Log de SendGrid
        res.status(500).json({ message: 'Error interno del servidor al registrar.' });
    }
});

// EN server.js, REEMPLAZA el endpoint /api/verify-email completo

// EN server.js, REEMPLAZA el endpoint /api/verify-email completo con esta versión mejorada

app.post('/api/verify-email', authLimiter, async (req, res) => {
    try {
        const { email, otp } = req.body;
        if (!otp) return res.status(400).json({ message: 'El código de verificación es obligatorio.' });
        if (!email) return res.status(400).json({ message: 'No se pudo identificar el correo. Por favor, intenta registrarte de nuevo.' });

        const unverifiedUsersCollection = db.collection('unverified_users');
        const unverifiedUser = await unverifiedUsersCollection.findOne({ email: email.toLowerCase() });

        if (!unverifiedUser) return res.status(404).json({ message: 'No se encontró una solicitud de registro para este correo.' });
        if (unverifiedUser.otp !== otp) return res.status(400).json({ message: 'El código de verificación es incorrecto.' });
        if (new Date() > unverifiedUser.otpExpires) return res.status(400).json({ message: 'El código de verificación ha expirado. Por favor, regístrate de nuevo.' });

        const usersCollection = db.collection('users');

        // --- INICIO DE LA LÓGICA DE PREVENCIÓN DE DUPLICADOS ---
        const existingUser = await usersCollection.findOne({
            $or: [
                { email: unverifiedUser.email },
                { username: unverifiedUser.username }
            ]
        });

        if (existingUser) {
            // Si el usuario ya existe, limpiamos el registro no verificado y devolvemos un error
            await unverifiedUsersCollection.deleteOne({ email: email.toLowerCase() });
            return res.status(409).json({ message: 'El nombre de usuario o el correo ya existen en una cuenta verificada.' });
        }
        // --- FIN DE LA LÓGICA DE PREVENCIÓN DE DUPLICADOS ---

        // Si no existe, procedemos a crearlo
        const newUserResult = await usersCollection.insertOne({
            username: unverifiedUser.username,
            email: unverifiedUser.email,
            password: unverifiedUser.password,
            createdAt: new Date(),
            isVerified: true,
            balance: 0,
            personalInfo: {},
            payoutMethods: []
        });

        await unverifiedUsersCollection.deleteOne({ email: email.toLowerCase() });

        const payload = {
            id: newUserResult.insertedId,
            username: unverifiedUser.username,
            email: unverifiedUser.email
        };
        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '1d' });

        res.status(201).json({ 
            message: '¡Cuenta verificada y creada con éxito!',
            token: token,
            user: {
                username: unverifiedUser.username,
                email: unverifiedUser.email
            }
        });

    } catch (error) {
        console.error('[ERROR] en la verificación de email:', error);
        res.status(500).json({ message: 'Error interno del servidor durante la verificación.' });
    }
});

app.post('/api/resend-otp', authLimiter, async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ message: 'El correo es obligatorio.' });

        const unverifiedUsersCollection = db.collection('unverified_users');
        const unverifiedUser = await unverifiedUsersCollection.findOne({ email: email.toLowerCase() });
        if (!unverifiedUser) return res.status(404).json({ message: 'No se encontró solicitud de registro.' });
        
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const otpExpires = new Date(Date.now() + 15 * 60 * 1000);

        await unverifiedUsersCollection.updateOne({ email: email.toLowerCase() }, { $set: { otp, otpExpires } });

        const msg = {
            to: email,
            from: process.env.VERIFIED_SENDER_EMAIL,
            subject: 'Tu nuevo código de verificación para FortunaBet',
            html: `<p>Hola de nuevo,</p><p>Tu nuevo código de verificación es:</p><h2 style="text-align:center;">${otp}</h2><p>Este código expirará en 15 minutos.</p>`,
        };
        await sgMail.send(msg);
        res.status(200).json({ message: 'Se ha reenviado un nuevo código a tu correo.' });
    } catch (error) {
        console.error('[ERROR] al reenviar OTP:', error);
        if (error.response) console.error(error.response.body); // Log de SendGrid
        res.status(500).json({ message: 'Error interno del servidor al reenviar.' });
    }
});

app.post('/api/login', authLimiter, async (req, res) => {
    try {
        const { identifier, password } = req.body;
        if (!identifier || !password) return res.status(400).json({ message: 'El identificador y la contraseña son obligatorios.' });

        const usersCollection = db.collection('users');
        const user = await usersCollection.findOne({ 
            $or: [{ email: identifier.toLowerCase() }, { username: { $regex: new RegExp(`^${identifier}$`, 'i') } }] 
        });
        if (!user) return res.status(401).json({ message: 'Credenciales inválidas.' });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(401).json({ message: 'Credenciales inválidas.' });
        
        const payload = {
            id: user._id,
            username: user.username,
            email: user.email
        };

        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '1d' });
        
        console.log('JWT_SECRET está definido:', !!JWT_SECRET);
        console.log('Token generado:', token); 
        console.log('Usuario a enviar:', { username: user.username, email: user.email });

        res.status(200).json({ 
            message: 'Inicio de sesión exitoso.',
            token: token,
            user: {
                username: user.username,
                email: user.email
            }
        });
    } catch (error) {
        console.error('[ERROR] en el inicio de sesión:', error);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
});


// --- ENDPOINTS PROTEGIDOS DE USUARIO (Requieren Token) ---

app.post('/api/change-username', authLimiter, authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id; 
        const { newUsername } = req.body;

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
                    message: `Solo puedes cambiar tu nombre de usuario una vez cada 14 días. Próximo cambio disponible el ${nextAvailableDate.toLocaleDateString('es-ES')}.`
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


app.post('/api/update-personal-info', authLimiter, authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { firstName, lastName, birthDate, state, phone } = req.body;

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
        if (phone && currentUser.personalInfo.phone !== phone) {
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


app.get('/api/user-data', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;

        const usersCollection = db.collection('users');
        const user = await usersCollection.findOne(
            { _id: new ObjectId(userId) },
            { 
                projection: { 
                    password: 0,
                    payoutMethods: 0,
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

app.post('/api/request-phone-verification', authLimiter, authenticateToken, async (req, res) => {
    const userId = req.user.id;
    try {
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

app.post('/api/verify-phone-code', authLimiter, authenticateToken, async (req, res) => {
    const userId = req.user.id;
    const { code } = req.body;
    try {
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

app.post('/api/validate-current-password', authLimiter, authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { currentPassword } = req.body;
        if (!currentPassword) {
            return res.status(400).json({ message: 'La contraseña actual es requerida.' });
        }

        const user = await db.collection('users').findOne({ _id: new ObjectId(userId) });
        if (!user) {
            return res.status(401).json({ message: 'La contraseña actual es incorrecta.' });
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

app.post('/api/request-password-change-code', authLimiter, authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const user = await db.collection('users').findOne({ _id: new ObjectId(userId) });
        if (!user) return res.status(404).json({ message: 'Usuario no encontrado.' });
        
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        const expiration = new Date(Date.now() + 10 * 60 * 1000); 

        await db.collection('users').updateOne({ _id: user._id }, { $set: { passwordChangeCode: code, passwordChangeCodeExpires: expiration } });

        await transporter.sendMail({
            from: `"FortunaBet Soporte" <${process.env.EMAIL_USER}>`,
            to: user.email,
            subject: 'Tu código de confirmación para cambiar la contraseña',
            html: `<p>Hola ${user.username},</p><p>Tu código de confirmación es: <strong>${code}</strong></p><p>Este código expirará en 10 minutos.</p>`,
        });

        res.status(200).json({ message: 'Se ha enviado un código de confirmación a tu correo.' });
    } catch (error) {
        console.error('[ERROR] en request-password-change-code:', error);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
});

app.post('/api/change-password', authLimiter, authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { currentPassword, newPassword, code } = req.body;
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

// --- ENDPOINTS PÚBLICOS PARA RECUPERACIÓN DE CUENTA ---

app.post('/api/forgot-password', authLimiter, async (req, res) => {
    try {
        const { email } = req.body;
        const user = await db.collection('users').findOne({ email: email.toLowerCase() });
        if (!user) {
            return res.status(200).json({ message: 'Si tu correo está registrado, recibirás un enlace.' });
        }
        const secret = JWT_SECRET + user.password;
        const token = jwt.sign({ email: user.email, id: user._id.toString() }, secret, { expiresIn: '15m' });
        const resetLink = `${process.env.FRONTEND_URL}/index.html?action=reset&id=${user._id}&token=${token}`;

        const msg = {
            to: user.email,
            from: process.env.VERIFIED_SENDER_EMAIL,
            subject: 'Restablece tu contraseña de FortunaBet',
            html: `<p>Hola ${user.username},</p><p>Haz clic en el siguiente enlace para restablecer tu contraseña. El enlace es válido por 15 minutos:</p><a href="${resetLink}" style="padding:10px 20px; background-color:#2ECC71; color:#000; text-decoration:none; border-radius:5px;">Restablecer Contraseña</a>`,
        };
        await sgMail.send(msg);
        res.status(200).json({ message: 'Si tu correo está registrado, recibirás un enlace.' });
    } catch (error) {
        console.error('[ERROR] en forgot-password:', error);
        if (error.response) console.error(error.response.body); // Log de SendGrid
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
});

app.post('/api/reset-password', authLimiter, async (req, res) => {
    const { id, token, password } = req.body;
    try {
        if (!ObjectId.isValid(id)) return res.status(400).json({ message: 'ID de usuario no válido.' });
        
        if (!passwordRegex.test(password)) {
            return res.status(400).json({ message: 'La nueva contraseña no cumple con los requisitos de seguridad.' });
        }

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

// =======================================================================
//  FUNCIÓN AUXILIAR PARA MANEJO DE ERRORES
// =======================================================================
function handleApiError(error, res) {
    if (error.response) {
        console.error(`[ERROR] API Externa: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
        res.status(error.response.status).json(error.response.data);
    } else {
        console.error(`[ERROR] Servidor Interno: ${error.message}`);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
}

// =======================================================================
//  INICIO DEL SERVIDOR
// =======================================================================
connectDB().then(() => {
    app.listen(port, () => {
        console.log('-------------------------------------------');
        console.log(`🚀 Servidor backend de FortunaBet corriendo`);
        console.log(`   URL Local: http://localhost:${port}`);
        console.log('-------------------------------------------');
    });
});