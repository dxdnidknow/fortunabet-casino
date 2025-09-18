// Archivo: backend/server.js (VERSIÓN CORREGIDA Y LIMPIA)

// =======================================================================
//  CONFIGURACIÓN INICIAL Y DEPENDENCIAS
// =======================================================================

require('dotenv').config(); 

const express = require('express');
const axios = require('axios');
const cors = require('cors');
const { MongoClient, ServerApiVersion } = require('mongodb');
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit'); // <-- NUEVO: Para seguridad
const NodeCache = require('node-cache');
// --- LÍNEA DE MAILER ELIMINADA ---

const app = express();
const port = 3001;

app.use(cors());
app.use(express.json());

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
//  CONFIGURACIÓN DE LA API DE DEPORTES
// =======================================================================

const API_KEY = process.env.ODDS_API_KEY;
if (!API_KEY) {
    console.error('[FATAL ERROR] La variable de entorno ODDS_API_KEY no está definida.');
    process.exit(1);
}

let eventsCache = {};

// =======================================================================
//  ENDPOINTS DE LA API
// =======================================================================

// --- ENDPOINTS DE DEPORTES ---

app.get('/api/events/:sportKey', async (req, res) => {
    try {
        const { sportKey } = req.params;
        let marketsToRequest = 'h2h,totals';
        if (sportKey.includes('winner') || sportKey.includes('outright')) {
            marketsToRequest = 'outrights';
        }
        const response = await axios.get(`https://api.the-odds-api.com/v4/sports/${sportKey}/odds`, {
            params: { apiKey: API_KEY, regions: 'us,eu,uk', markets: marketsToRequest, oddsFormat: 'decimal' }
        });
        const eventsById = response.data.reduce((acc, event) => { acc[event.id] = event; return acc; }, {});
        eventsCache[sportKey] = eventsById;
        res.json(response.data);
    } catch (error) { handleApiError(error, res); }
});

app.get('/api/sports', async (req, res) => {
    try {
        const response = await axios.get('https://api.the-odds-api.com/v4/sports', { params: { apiKey: API_KEY } });
        res.json(response.data);
    } catch (error) { handleApiError(error, res); }
});

app.get('/api/event/:sportKey/:eventId', (req, res) => {
    const { sportKey, eventId } = req.params;
    const sportEvents = eventsCache[sportKey];
    if (sportEvents && sportEvents[eventId]) {
        res.json(sportEvents[eventId]);
    } else {
        res.status(404).json({ message: 'Evento no encontrado.' });
    }
});

// --- ENDPOINTS DE AUTENTICACIÓN ---

app.post('/api/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        if (!username || !email || !password) return res.status(400).json({ message: 'Todos los campos son obligatorios.' });
        
        const usersCollection = db.collection('users');
        const existingUser = await usersCollection.findOne({ $or: [{ email }, { username }] });
        if (existingUser) return res.status(409).json({ message: 'El correo electrónico o el nombre de usuario ya están en uso.' });

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        
        const newUser = { username, email, password: hashedPassword, createdAt: new Date(), balance: 0, personalInfo: {}, payoutMethods: [] };
        await usersCollection.insertOne(newUser);
        
        console.log(`[SUCCESS] Nuevo usuario registrado: ${username}`);
        res.status(201).json({ message: '¡Usuario registrado con éxito!' });
    } catch (error) {
        console.error('[ERROR] en el registro de usuario:', error);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ message: 'Correo y contraseña son obligatorios.' });

        const usersCollection = db.collection('users');
        const user = await usersCollection.findOne({ email });
        if (!user) return res.status(401).json({ message: 'Credenciales inválidas.' });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(401).json({ message: 'Credenciales inválidas.' });
        
        console.log(`[SUCCESS] Usuario ha iniciado sesión: ${user.username}`);
        res.status(200).json({ message: 'Inicio de sesión exitoso.', username: user.username });
    } catch (error) {
        console.error('[ERROR] en el inicio de sesión:', error);
        res.status(500).json({ message: 'Error interno del servidor.' });
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