// Archivo: backend/server.js
// =======================================================================
//  CONFIGURACIÓN INICIAL Y DEPENDENCIAS
// =======================================================================
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const axios = require('axios'); // Para la API de deportes
const NodeCache = require('node-cache'); // Para la API de deportes
const { connectDB, getDb } = require('./db'); // Importamos nuestro conector de BD

// Importamos nuestras rutas modulares
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const adminRoutes = require('./routes/admin');

const app = express();
const port = 3001;

// =======================================================================
//  MIDDLEWARES GENERALES
// =======================================================================
app.use(cors());
app.use(express.json());

// =======================================================================
//  CONFIGURACIÓN DE API DE DEPORTES (Caché y Claves)
// =======================================================================
const API_KEY = process.env.ODDS_API_KEY;
if (!API_KEY) { console.error('❌ Error: La variable de entorno ODDS_API_KEY no está definida.'); process.exit(1); }
const eventsCache = new NodeCache({ stdTTL: 600 });

// =======================================================================
//  RUTAS DE LA APLICACIÓN
// =======================================================================

// --- Rutas Públicas de Autenticación ---
app.use('/api', authRoutes); // Usa todas las rutas de /routes/auth.js

// --- Rutas Protegidas de Usuario ---
app.use('/api', userRoutes); // Usa todas las rutas de /routes/user.js

// --- Rutas Protegidas de Administrador ---
app.use('/api/admin', adminRoutes); // Usa todas las rutas de /routes/admin.js

// --- Rutas Públicas de Deportes (Las dejamos aquí por simplicidad) ---
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

// =======================================================================
//  FUNCIÓN DE MANEJO DE ERRORES
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
//  RUTAS DE MÉTODOS DE PAGO (payoutMethods)
// =======================================================================

// 1. OBTENER todos los métodos de retiro del usuario (GET /payout-methods)
// Usado por account.js -> loadPayoutMethods()
app.get('/api/payout-methods', authenticateToken, async (req, res) => {
    try {
        const userId = new ObjectId(req.user.id);
        const payoutMethods = await db.collection('payoutMethods').find({ userId }).toArray();
        
        res.status(200).json(payoutMethods);
    } catch (error) {
        console.error('[ERROR] al obtener métodos de pago:', error);
        res.status(500).json({ message: 'Error interno al cargar los métodos de pago.' });
    }
});

// 2. AÑADIR un nuevo método de retiro (POST /payout-methods)
// Usado por account.js -> handlePayoutMethodChange()
app.post('/api/payout-methods', authenticateToken, async (req, res) => {
    try {
        const userId = new ObjectId(req.user.id);
        const { methodType, isPrimary, details } = req.body;

        // Validación básica de campos requeridos
        if (!methodType || !details) {
            return res.status(400).json({ message: 'Faltan datos requeridos para el método de pago.' });
        }

        const newMethod = {
            userId,
            methodType,
            details,
            isPrimary: !!isPrimary, // Convertir a booleano
            createdAt: new Date(),
        };

        // Si se establece como primario, desactivar el primario anterior
        if (newMethod.isPrimary) {
            await db.collection('payoutMethods').updateMany(
                { userId, isPrimary: true },
                { $set: { isPrimary: false } }
            );
        }

        const result = await db.collection('payoutMethods').insertOne(newMethod);
        
        res.status(201).json({ 
            message: 'Método de retiro añadido con éxito.', 
            _id: result.insertedId 
        });

    } catch (error) {
        console.error('[ERROR] al añadir método de pago:', error);
        // Manejar duplicados si aplica (ej. si agregas un índice único de detalles)
        res.status(500).json({ message: 'Error interno al añadir el método de pago.' });
    }
});

// 3. ESTABLECER un método como principal (POST /payout-methods/:id/primary)
// Usado por account.js (listener del botón 'Establecer Principal')
app.post('/api/payout-methods/:id/primary', authenticateToken, async (req, res) => {
    try {
        const userId = new ObjectId(req.user.id);
        const methodId = new ObjectId(req.params.id);

        // 1. Desactivar el primario anterior para este usuario
        await db.collection('payoutMethods').updateMany(
            { userId, isPrimary: true },
            { $set: { isPrimary: false } }
        );

        // 2. Establecer el nuevo método como primario
        const result = await db.collection('payoutMethods').updateOne(
            { _id: methodId, userId },
            { $set: { isPrimary: true } }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ message: 'Método no encontrado o no pertenece al usuario.' });
        }

        res.status(200).json({ message: 'Método establecido como principal.' });
    } catch (error) {
        console.error('[ERROR] al establecer primario:', error);
        res.status(500).json({ message: 'Error interno al establecer el método principal.' });
    }
});


// 4. ELIMINAR un método de retiro (DELETE /payout-methods/:id)
// Usado por account.js (listener del botón 'Eliminar')
app.delete('/api/payout-methods/:id', authenticateToken, async (req, res) => {
    try {
        const userId = new ObjectId(req.user.id);
        const methodId = new ObjectId(req.params.id);

        const result = await db.collection('payoutMethods').deleteOne({
            _id: methodId,
            userId: userId,
        });

        if (result.deletedCount === 0) {
            return res.status(404).json({ message: 'Método no encontrado o no pertenece al usuario.' });
        }

        res.status(200).json({ message: 'Método de retiro eliminado con éxito.' });
    } catch (error) {
        console.error('[ERROR] al eliminar método de pago:', error);
        res.status(500).json({ message: 'Error interno al eliminar el método de pago.' });
    }
});

// =======================================================================
//  FIN DE RUTAS DE MÉTODOS DE PAGO
// =======================================================================
// =======================================================================
//  INICIO DEL SERVIDOR
// =======================================================================
connectDB().then(() => {
    app.listen(port, () => {
        console.log('-------------------------------------------');
        console.log(`🚀 Servidor backend de FortunaBet (Refactorizado)`);
        console.log(`   URL Local: http://localhost:${port}`);
        console.log(`   Rutas de Admin: http://localhost:${port}/api/admin`);
        console.log('-------------------------------------------');
    });
});