// Archivo: backend/server.js (VERSIÓN CORREGIDA)

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const axios = require('axios');
const NodeCache = require('node-cache');
const { connectDB, getDb } = require('./db');
const rateLimit = require('express-rate-limit');

// Importación de Rutas
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const adminRoutes = require('./routes/admin');

const app = express();
const port = process.env.PORT || 3001; 

// ==========================================
//  MIDDLEWARES DE SEGURIDAD
// ==========================================

// Helmet - Headers de seguridad HTTP
app.use(helmet({
    contentSecurityPolicy: false, // Deshabilitado para permitir iframes de juegos
    crossOriginEmbedderPolicy: false
}));

// CORS - Configuración segura para producción
const allowedOrigins = [
    process.env.FRONTEND_URL,           // URL definida en variables de entorno de Render
    'https://fortunabetve.netlify.app', // TU NUEVA URL (Agregada)
    'http://localhost:5500',
    'http://127.0.0.1:5500',
    'http://localhost:5501',
    'http://127.0.0.1:5501',
    'http://localhost:5502',
    'http://127.0.0.1:5502',
    'http://localhost:3000'             // Común si usas React/Vue local
].filter(Boolean);

const corsOptions = {
    origin: function (origin, callback) {
        // Permitir requests sin origin (como apps móviles o Postman)
        // O si el origen está en nuestra lista blanca
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            console.error(`[CORS] Bloqueado: El origen ${origin} no está autorizado.`);
            callback(new Error('No permitido por CORS'));
        }
    },
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    optionsSuccessStatus: 200
};

app.use(cors(corsOptions));

// Parser JSON con límite de tamaño
app.use(express.json({ limit: '10kb' }));

// Sanitización contra NoSQL Injection
app.use(mongoSanitize());

// Trust proxy para rate limiting correcto en Render
app.set('trust proxy', 1);

// Inicializar Caché
const eventsCache = new NodeCache({ stdTTL: 600 });

// API KEY
const API_KEY = process.env.ODDS_API_KEY;
if (!API_KEY) { 
    console.error('❌ Error: Falta ODDS_API_KEY en las variables de entorno.'); 
    process.exit(1); 
}

// Middleware Global: Inyectar DB y Caché en cada petición
app.use((req, res, next) => {
    req.db = getDb();
    req.eventsCache = eventsCache;
    next();
});

// Rate Limiter
const sportsApiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Demasiadas peticiones a la API de deportes.' }
});

// Rutas de Salud
app.get('/', (req, res) => { res.status(200).send('Backend de FortunaBet está en línea 🟢'); });
app.get('/health', (req, res) => { res.status(200).json({ status: 'ok', timestamp: new Date() }); });

// --- RUTAS PÚBLICAS (API DEPORTIVA) ---

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

        let markets = 'h2h,totals';
        if (sportKey.includes('winner') || sportKey.includes('championship') || sportKey.includes('outright')) {
            markets = 'outrights';
        }

        const response = await axios.get(`https://api.the-odds-api.com/v4/sports/${sportKey}/odds`, {
            params: { 
                apiKey: API_KEY, 
                regions: 'us,eu,uk', 
                markets: markets,
                oddsFormat: 'decimal' 
            }
        });

        eventsCache.set(sportKey, response.data);
        res.json(response.data);
    } catch (error) { 
        handleApiError(error, res); 
    }
}); 

app.get('/api/event/:sportKey/:eventId', sportsApiLimiter, async (req, res) => {
    try {
        const { sportKey, eventId } = req.params;
        let sportEventsList = eventsCache.get(sportKey);

        if (!sportEventsList) {
            const response = await axios.get(`https://api.the-odds-api.com/v4/sports/${sportKey}/odds`, {
                params: { apiKey: API_KEY, regions: 'us,eu,uk', markets: 'h2h,totals', oddsFormat: 'decimal' }
            });
            sportEventsList = response.data;
            eventsCache.set(sportKey, sportEventsList);
        }

        if (sportEventsList) {
            const event = sportEventsList.find(e => e.id === eventId);
            if (event) { return res.json(event); }
        }

        res.status(404).json({ message: 'Evento no encontrado.' });
    } catch (error) {
        handleApiError(error, res);
    }
});

// --- OTRAS RUTAS ---
app.use('/api', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/admin', adminRoutes);

function handleApiError(error, res) {
    if (error.response) {
        console.error(`[ERROR API]: ${error.response.status}`, error.response.data);
        res.status(error.response.status).json(error.response.data);
    } else {
        console.error(`[ERROR SERVER]: ${error.message}`);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
}

connectDB().then(() => {
    app.listen(port, '0.0.0.0', () => {
        console.log(`🚀 Servidor FortunaBet corriendo en puerto: ${port}`);
    });
});