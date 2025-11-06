// Archivo: backend/db.js
const { MongoClient, ServerApiVersion } = require('mongodb');
require('dotenv').config();

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
    console.error("❌ Error: La variable de entorno DATABASE_URL no se ha cargado.");
    process.exit(1);
}

const client = new MongoClient(dbUrl, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

let _db;

async function connectDB() {
    try {
        await client.connect();
        _db = client.db("fortunabet_db"); // El nombre de tu base de datos
        console.log("✅ Conectado exitosamente a MongoDB Atlas!");
    } catch (error) {
        console.error("❌ Error al conectar a MongoDB:", error);
        process.exit(1);
    }
}

function getDb() {
    if (!_db) {
        throw new Error("No se ha establecido la conexión con la base de datos.");
    }
    return _db;
}

module.exports = { connectDB, getDb, client };