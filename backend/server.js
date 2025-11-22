// Archivo: backend/server.js (COMPLETO CON HEALTH CHECK PARA UPTIMEROBOT)

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
//   PUERTO DEL SERVIDOR
// =======================================================================
// Render inyecta el puerto en process.env.PORT.
const port = process.env.PORT || 3001; 

// =======================================================================
//   MIDDLEWARES GENERALES
// =======================================================================

const corsOptions = {
    origin: '*', // Permite todas las origenes.
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    allowedHeaders: 'Content-Type, Authorization',
};
app.use(cors(corsOptions));

app.use(express.json());
app.set('trust proxy', 1);

// Middleware para inyectar la conexión a la BD en cada petición
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
//   RUTAS DE SALUD (HEALTH CHECK) - ¡NUEVO PARA UPTIMEROBOT!
// =======================================================================
// Esta es la ruta que debes poner en UptimeRobot: https://fortunabet-api.onrender.com/
app.get('/', (req, res) => {
    res.status(200).send('Backend de FortunaBet está en línea 🟢');
});

app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date() });
});


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
// --- RUTA NUEVA: RESULTADOS REALES ---
app.get('/api/scores', sportsApiLimiter, async (req, res) => {
    try {
        // Intentamos obtener del caché primero (dura 30 minutos)
        const cachedScores = eventsCache.get('allScores');
        if (cachedScores) { return res.json(cachedScores); }

        // Pedimos resultados de fútbol (puedes agregar más deportes separados por comas)
        // daysFrom: 3 (Resultados de los últimos 3 días)
        const response = await axios.get('https://api.the-odds-api.com/v4/sports/soccer_epl/scores', { // Ejemplo: Premier League
            params: { 
                apiKey: API_KEY, 
                daysFrom: 3,
                dateFormat: 'iso'
            }
        });

        // Guardamos en caché
        eventsCache.set('allScores', response.data, 1800); // 1800 segundos = 30 min
        res.json(response.data);
    } catch (error) {
        handleApiError(error, res);
    }
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
    app.listen(port, '0.0.0.0', () => {
        console.log('-------------------------------------------');
        console.log(`🚀 Servidor backend de FortunaBet`);
        console.log(`   Escuchando en el puerto: ${port}`);
        console.log('-------------------------------------------');
    });
});