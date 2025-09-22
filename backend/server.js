// =======================================================================
//  CONFIGURACIÓN INICIAL Y DEPENDENCIAS
// =======================================================================
require('dotenv').config();

const express = require('express');
const axios = require('axios');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');
const NodeCache = require('node-cache');
const nodemailer = require('nodemailer');
const jwt = require('jsonwebtoken');

const app = express();
const port = 3001;

app.use(cors());
app.use(express.json());

// =======================================================================
//  CONSTANTES DE VALIDACIÓN
// =======================================================================
const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/;
const usernameRegex = /^[a-zA-Z]{4,20}$/;

// =======================================================================
//  CONEXIÓN A LA BASE DE DATOS (MONGODB ATLAS)
// =======================================================================
const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
    console.error("❌ Error: La variable de entorno DATABASE_URL no se ha cargado. Revisa tu archivo .env");
    process.exit(1);
}

const client = new MongoClient(dbUrl, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

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
if (!API_KEY) {
    console.error('❌ Error: La variable de entorno ODDS_API_KEY no está definida.');
    process.exit(1);
}

const eventsCache = new NodeCache({ stdTTL: 600 });

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

// =======================================================================
//  MIDDLEWARES DE SEGURIDAD
// =======================================================================
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { message: 'Demasiadas peticiones desde esta IP, por favor intenta de nuevo en 15 minutos.' }
});

// =======================================================================
//  ENDPOINTS DE LA API
// =======================================================================

// --- ENDPOINTS DE DEPORTES ---
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
        if (cachedSports) {
            return res.json(cachedSports);
        }
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
        if (event) {
            return res.json(event);
        }
    }
    res.status(404).json({ message: 'Evento no encontrado o caché expirado.' });
});

// --- ENDPOINTS DE AUTENTICACIÓN Y USUARIO ---
app.post('/api/register', authLimiter, async (req, res) => {
    try {
        const { username, email, password } = req.body;
        if (!username || !email || !password) return res.status(400).json({ message: 'Todos los campos son obligatorios.' });
        
        if (!usernameRegex.test(username)) {
            return res.status(400).json({ message: 'El usuario debe tener entre 4 y 20 letras, sin números ni espacios.' });
        }
        if (!passwordRegex.test(password)) {
            return res.status(400).json({ message: 'La contraseña no cumple con los requisitos de seguridad.' });
        }

        const usersCollection = db.collection('users');
        const existingUser = await usersCollection.findOne({ $or: [{ email: email.toLowerCase() }, { username }] });
        if (existingUser) return res.status(409).json({ message: 'El correo electrónico o el nombre de usuario ya están en uso.' });

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        
        const newUser = { username, email: email.toLowerCase(), password: hashedPassword, createdAt: new Date(), balance: 0, personalInfo: {}, payoutMethods: [] };
        await usersCollection.insertOne(newUser);
        
        res.status(201).json({ message: '¡Usuario registrado con éxito!' });
    } catch (error) {
        console.error('[ERROR] en el registro de usuario:', error);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
});

app.post('/api/login', authLimiter, async (req, res) => {
    try {
        const { identifier, password } = req.body;
        if (!identifier || !password) return res.status(400).json({ message: 'El identificador y la contraseña son obligatorios.' });

        const usersCollection = db.collection('users');
        const user = await usersCollection.findOne({ $or: [{ email: identifier.toLowerCase() }, { username: identifier }] });
        if (!user) return res.status(401).json({ message: 'Credenciales inválidas.' });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(401).json({ message: 'Credenciales inválidas.' });
        
        res.status(200).json({ message: 'Inicio de sesión exitoso.', username: user.username, email: user.email });
    } catch (error) {
        console.error('[ERROR] en el inicio de sesión:', error);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
});

app.post('/api/change-username', authLimiter, async (req, res) => {
    try {
        const { email, newUsername } = req.body;

        if (!usernameRegex.test(newUsername)) {
            return res.status(400).json({ message: 'El usuario debe tener entre 4 y 20 letras, sin números ni espacios.' });
        }

        const usersCollection = db.collection('users');
        const existingUser = await usersCollection.findOne({ username: newUsername });
        if (existingUser) {
            return res.status(409).json({ message: 'Ese nombre de usuario ya está en uso. Por favor, elige otro.' });
        }
        
        const currentUser = await usersCollection.findOne({ email: email.toLowerCase() });
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

app.post('/api/update-personal-info', authLimiter, async (req, res) => {
    try {
        const { email, firstName, lastName, birthDate, state, phone } = req.body;
        if (!email) {
            return res.status(400).json({ message: 'El email del usuario es requerido.' });
        }
        if ((firstName && firstName.length > 25) || (lastName && lastName.length > 25)) {
            return res.status(400).json({ message: 'El nombre y el apellido no pueden tener más de 25 caracteres.' });
        }
        if (birthDate && !isOver18(birthDate)) {
             return res.status(400).json({ message: 'Debes ser mayor de 18 años.' });
        }

        const usersCollection = db.collection('users');
        const result = await usersCollection.updateOne(
            { email: email.toLowerCase() },
            { 
                $set: {
                    'personalInfo.firstName': firstName,
                    'personalInfo.lastName': lastName,
                    'personalInfo.birthDate': birthDate,
                    'personalInfo.state': state,
                    'personalInfo.phone': phone,
                }
            }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ message: 'Usuario no encontrado.' });
        }
        
        res.status(200).json({ message: 'Información personal actualizada con éxito.' });

    } catch (error) {
        console.error('[ERROR] en update-personal-info:', error);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
});

app.get('/api/user-data', async (req, res) => {
    try {
        const { email } = req.query;
        if (!email) {
            return res.status(400).json({ message: 'El email es requerido.' });
        }

        const usersCollection = db.collection('users');
        const user = await usersCollection.findOne(
            { email: email.toLowerCase() },
            { 
                projection: { 
                    username: 1, 
                    lastUsernameChange: 1, 
                    personalInfo: 1,
                    _id: 0 
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

app.post('/api/validate-current-password', authLimiter, async (req, res) => {
    try {
        const { email, currentPassword } = req.body;
        if (!email || !currentPassword) {
            return res.status(400).json({ message: 'Email y contraseña actual son requeridos.' });
        }

        const user = await db.collection('users').findOne({ email: email.toLowerCase() });
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

app.post('/api/request-password-change-code', authLimiter, async (req, res) => {
    try {
        const { email } = req.body;
        const user = await db.collection('users').findOne({ email: email.toLowerCase() });
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

app.post('/api/change-password', authLimiter, async (req, res) => {
    try {
        const { email, currentPassword, newPassword, code } = req.body;
        if (!email || !currentPassword || !newPassword || !code) return res.status(400).json({ message: 'Todos los campos son obligatorios.' });
        
        if (!passwordRegex.test(newPassword)) {
            return res.status(400).json({ message: 'La nueva contraseña no cumple con los requisitos de seguridad.' });
        }

        const usersCollection = db.collection('users');
        const user = await usersCollection.findOne({ email: email.toLowerCase() });
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

app.post('/api/forgot-password', authLimiter, async (req, res) => {
    const { email } = req.body;
    try {
        const user = await db.collection('users').findOne({ email: email.toLowerCase() });
        if (!user) {
            return res.status(200).json({ message: 'Si tu correo está registrado, recibirás un enlace para restablecer tu contraseña.' });
        }

        const secret = process.env.JWT_SECRET + user.password;
        const token = jwt.sign({ email: user.email, id: user._id.toString() }, secret, { expiresIn: '15m' });
        
        const resetLink = `https://earnest-alfajores-9754f3.netlify.app/index.html?action=reset&id=${user._id}&token=${token}`;

        await transporter.sendMail({
            from: `"FortunaBet Soporte" <${process.env.EMAIL_USER}>`,
            to: user.email,
            subject: 'Restablece tu contraseña de FortunaBet',
            html: `<p>Hola ${user.username},</p><p>Haz clic en el siguiente enlace para restablecer tu contraseña. El enlace es válido por 15 minutos:</p><a href="${resetLink}" style="padding:10px 20px; background-color:#2ECC71; color:#000; text-decoration:none; border-radius:5px;">Restablecer Contraseña</a>`,
        });

        res.status(200).json({ message: 'Si tu correo está registrado, recibirás un enlace para restablecer tu contraseña.' });
    } catch (error) {
        console.error('[ERROR] en forgot-password:', error);
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

        const secret = process.env.JWT_SECRET + user.password;
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