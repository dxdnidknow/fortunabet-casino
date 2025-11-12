// Archivo: backend/server.js (CORRECCIÓN FINAL DE CORS Y PUERTO)
// =======================================================================
//   CONFIGURACIÓN INICIAL Y DEPENDENCIAS
// =======================================================================
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const NodeCache = require('node-cache');
const { connectDB, getDb } = require('./db');
const rateLimit = require('express-rate-limit');

// =======================================================================
//   IMPORTACIÓN DE RUTAS MODULARES
// =======================================================================
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const adminRoutes = require('./routes/admin');

const app = express();
// =======================================================================
// CORRECCIÓN CLAVE: PUERTO PARA RENDER
// =======================================================================
// Render inyecta el puerto en process.env.PORT.
// Es CRUCIAL que el servidor escuche en este puerto para ser accesible.
// Para desarrollo local, si process.env.PORT no existe, usará 3001.
const port = process.env.PORT || 3001; 

// =======================================================================
//   MIDDLEWARES GENERALES
// =======================================================================

// --- INICIO DE LA CORRECCIÓN DE CORS ---
const corsOptions = {
    origin: '*', // Permite todas las origenes. Para producción podrías poner: process.env.FRONTEND_URL
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE', // Permite todos los métodos HTTP comunes
    allowedHeaders: 'Content-Type, Authorization', // Permite las cabeceras que usamos
};
app.use(cors(corsOptions));
// --- FIN DE LA CORRECCIÓN DE CORS ---

app.use(express.json());
app.set('trust proxy', 1);

app.use((req, res, next) => {
    req.db = getDb();
    next();
});

// =======================================================================
//   CONFIGURACIÓN DE SEGURIDAD: RATE LIMITER
// =======================================================================
const sportsApiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Demasiadas peticiones a la API de deportes. Intente de nuevo en 15 minutos.' }
});

// =======================================================================
//   CONFIGURACIÓN DE API DE DEPORTES
// =======================================================================
const API_KEY = process.env.ODDS_API_KEY;
if (!API_KEY) { console.error('❌ Error: La variable de entorno ODDS_API_KEY no está definida.'); process.exit(1); }
const eventsCache = new NodeCache({ stdTTL: 600 });

// =======================================================================
//   RUTAS DE LA APLICACIÓN
// =======================================================================

// --- Rutas Públicas (Autenticación y Deportes) ---
app.use('/api', authRoutes);

app.get('/api/sports', sportsApiLimiter, async (req, res) => {
    try {
        const cachedSports = eventsCache.get('sportsList');
        if (cachedSports) { return res.json(cachedSports); }
        const response = await axios.get('https://api.the-odds-api.com/v4/sports', { params: { apiKey: API_KEY } });
        eventsCache.set('sportsList', response.data, 3600);
        res.json(response.data);
    } catch (error) { handleApiError(error, res); }
});

app.get('/api/events/:sportKey', sportsApiLimiter, async (req, res) => {
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

app.get('/api/event/:sportKey/:eventId', sportsApiLimiter, (req, res) => {
    const { sportKey, eventId } = req.params;
    const sportEventsList = eventsCache.get(sportKey);
    if (sportEventsList) {
        const event = sportEventsList.find(e => e.id === eventId);
        if (event) { return res.json(event); }
    }
    res.status(404).json({ message: 'Evento no encontrado o caché expirado.' });
});

// --- Rutas Protegidas de Usuario ---
app.use('/api/user', userRoutes);

// --- Rutas Protegidas de Administrador ---
app.use('/api/admin', adminRoutes);

// =======================================================================
//   FUNCIÓN DE MANEJO DE ERRORES
// =======================================================================
function handleApiError(error, res) {
    if (error.response) {
        console.error(`[ERROR] API Externa: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
        // Usamos el status original de la API externa
        res.status(error.response.status).json(error.response.data);
    } else {
        console.error(`[ERROR] Servidor Interno: ${error.message}`);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
}

// =======================================================================
//   INICIO DEL SERVIDOR
// =======================================================================
connectDB().then(() => {
    // La dirección '0.0.0.0' es correcta para Render,
    // y aquí nos aseguramos de usar la variable 'port' definida arriba.
    app.listen(port, '0.0.0.0', () => {
        console.log('-------------------------------------------');
        console.log(`🚀 Servidor backend de FortunaBet`);
        console.log(`   Escuchando en el puerto: ${port}`); // Aseguramos que se loguea el valor de la variable 'port'
        console.log('-------------------------------------------');
    });
});