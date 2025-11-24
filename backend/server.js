// Archivo: backend/server.js (CON RUTA DE RESULTADOS /api/scores)

require('dotenv').config();

const express = require('express');
const cors = require('cors');
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

// Middlewares
const corsOptions = {
    origin: '*', 
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    allowedHeaders: 'Content-Type, Authorization',
};
app.use(cors(corsOptions));
app.use(express.json());
app.set('trust proxy', 1);

app.use((req, res, next) => {
    req.db = getDb();
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

// API KEY
const API_KEY = process.env.ODDS_API_KEY;
if (!API_KEY) { console.error('❌ Error: Falta ODDS_API_KEY.'); process.exit(1); }
const eventsCache = new NodeCache({ stdTTL: 600 });

// Rutas de Salud (UptimeRobot)
app.get('/', (req, res) => { res.status(200).send('Backend de FortunaBet está en línea 🟢'); });
app.get('/health', (req, res) => { res.status(200).json({ status: 'ok', timestamp: new Date() }); });

// --- RUTAS ---
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