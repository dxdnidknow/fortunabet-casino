// Archivo: backend/server.js (CORREGIDO)
// =======================================================================
//  CONFIGURACIÓN INICIAL Y DEPENDENCIAS
// =======================================================================
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const NodeCache = require('node-cache');
const { connectDB, getDb, client } = require('./db'); // Asegúrate de exportar 'client' desde db.js para las transacciones
const { ObjectId } = require('mongodb'); // Importa ObjectId

// =======================================================================
//  IMPORTACIÓN DE MIDDLEWARE (RUTA CORREGIDA)
// =======================================================================
const authenticateToken = require('./middleware/authMiddleware');
// =======================================================================

// Importamos nuestras rutas modulares
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const adminRoutes = require('./routes/admin');

const app = express();
const port = process.env.PORT || 3001; // Usar el puerto de Render o 3001

// =======================================================================
//  MIDDLEWARES GENERALES
// =======================================================================
app.use(cors());
app.use(express.json());

// Middleware para hacer 'db' accesible en todas las peticiones
app.use((req, res, next) => {
    req.db = getDb();
    next();
});

// =======================================================================
//  CONFIGURACIÓN DE API DE DEPORTES
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

// --- Rutas Públicas de Deportes ---
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
//  RUTAS DE MÉTODOS DE PAGO (payoutMethods)
// =======================================================================
// (Estas rutas usan 'authenticateToken' importado arriba)

// 1. OBTENER todos los métodos de retiro del usuario
app.get('/api/payout-methods', authenticateToken, async (req, res) => {
    try {
        const userId = new ObjectId(req.user.id);
        const db = getDb(); // Obtener db de la conexión
        const payoutMethods = await db.collection('payoutMethods').find({ userId }).toArray();
        res.status(200).json(payoutMethods);
    } catch (error) {
        console.error('[ERROR] al obtener métodos de pago:', error);
        res.status(500).json({ message: 'Error interno al cargar los métodos de pago.' });
    }
});

// 2. AÑADIR un nuevo método de retiro
app.post('/api/payout-methods', authenticateToken, async (req, res) => {
    try {
        const userId = new ObjectId(req.user.id);
        const { methodType, isPrimary, details } = req.body;
        const db = getDb();

        if (!methodType || !details) {
            return res.status(400).json({ message: 'Faltan datos requeridos para el método de pago.' });
        }
        const newMethod = { userId, methodType, details, isPrimary: !!isPrimary, createdAt: new Date() };

        if (newMethod.isPrimary) {
            await db.collection('payoutMethods').updateMany(
                { userId, isPrimary: true },
                { $set: { isPrimary: false } }
            );
        }
        const result = await db.collection('payoutMethods').insertOne(newMethod);
        res.status(201).json({ message: 'Método de retiro añadido con éxito.', _id: result.insertedId });
    } catch (error) {
        console.error('[ERROR] al añadir método de pago:', error);
        res.status(500).json({ message: 'Error interno al añadir el método de pago.' });
    }
});

// 3. ESTABLECER un método como principal
app.post('/api/payout-methods/:id/primary', authenticateToken, async (req, res) => {
    try {
        const userId = new ObjectId(req.user.id);
        const methodId = new ObjectId(req.params.id);
        const db = getDb();

        await db.collection('payoutMethods').updateMany(
            { userId, isPrimary: true },
            { $set: { isPrimary: false } }
        );
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

// 4. ELIMINAR un método de retiro
app.delete('/api/payout-methods/:id', authenticateToken, async (req, res) => {
    try {
        const userId = new ObjectId(req.user.id);
        const methodId = new ObjectId(req.params.id);
        const db = getDb();

        const result = await db.collection('payoutMethods').deleteOne({ _id: methodId, userId: userId });
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
//  RUTA DE RETIRO (WITHDRAW)
// =======================================================================
app.post('/api/withdraw', authenticateToken, async (req, res) => {
    const session = client.startSession(); // Asumiendo que 'client' se exporta desde db.js
    
    try {
        session.startTransaction();
        const userId = new ObjectId(req.user.id);
        const { amount, methodId } = req.body;
        const db = getDb();

        const withdrawalAmount = parseFloat(amount);
        if (isNaN(withdrawalAmount) || withdrawalAmount <= 0) {
            await session.abortTransaction();
            return res.status(400).json({ message: 'Monto de retiro inválido.' });
        }
        if (withdrawalAmount < 10) { 
            await session.abortTransaction();
            return res.status(400).json({ message: 'El retiro mínimo es de Bs. 10.00' });
        }

        const user = await db.collection('users').findOne({ _id: userId }, { session });
        if (!user || user.balance < withdrawalAmount) {
            await session.abortTransaction();
            return res.status(400).json({ message: 'Fondos insuficientes para realizar el retiro.' });
        }
        
        const method = await db.collection('payoutMethods').findOne({ _id: new ObjectId(methodId), userId }, { session });
        if (!method) {
            await session.abortTransaction();
            return res.status(404).json({ message: 'Método de retiro no encontrado o no pertenece a tu cuenta.' });
        }

        await db.collection('users').updateOne(
            { _id: userId },
            { $inc: { balance: -withdrawalAmount } },
            { session }
        );

        const transactionRecord = { userId, type: 'withdrawal', amount: -withdrawalAmount, status: 'pending', method: method.methodType, date: new Date() };
        await db.collection('transactions').insertOne(transactionRecord, { session });
        
        const withdrawalRequest = { userId, username: user.username, amount: withdrawalAmount, methodDetails: method.details, methodType: method.methodType, status: 'pending', requestedAt: new Date() };
        await db.collection('withdrawalRequests').insertOne(withdrawalRequest, { session });

        await session.commitTransaction();
        res.status(200).json({ message: 'Solicitud de retiro enviada. Se procesará en breve.' });
    } catch (error) {
        if (session.inTransaction()) {
            await session.abortTransaction();
        }
        console.error('[ERROR] en /api/withdraw:', error);
        res.status(500).json({ message: 'Error interno al procesar el retiro. Intenta de nuevo.' });
    } finally {
        await session.endSession();
    }
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
//  INICIO DEL SERVIDOR
// =======================================================================
connectDB().then(() => {
    app.listen(port, '0.0.0.0', () => { // Escuchar en 0.0.0.0 para compatibilidad con Render
        console.log('-------------------------------------------');
        console.log(`🚀 Servidor backend de FortunaBet (Refactorizado)`);
        console.log(`   Escuchando en el puerto: ${port}`);
        console.log('-------------------------------------------');
    });
});