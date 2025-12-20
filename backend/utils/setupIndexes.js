// Archivo: backend/utils/setupIndexes.js
// Script para crear índices de MongoDB optimizados para el casino

const { getDb } = require('../db');

/**
 * Crea índices optimizados para todas las colecciones
 * Ejecutar una vez al configurar la base de datos o después de migraciones
 */
/**
 * Crea un índice de forma segura, ignorando errores si ya existe
 */
async function safeCreateIndex(collection, indexSpec, options = {}) {
    try {
        await collection.createIndex(indexSpec, options);
        return true;
    } catch (error) {
        // Ignorar si el índice ya existe (código 85 o 86)
        if (error.code === 85 || error.code === 86 || error.codeName === 'IndexOptionsConflict') {
            console.log(`   ⚠️ Índice ${options.name || JSON.stringify(indexSpec)} ya existe, omitiendo...`);
            return false;
        }
        throw error;
    }
}

async function createIndexes() {
    const db = getDb();
    
    console.log('🔧 Creando índices de MongoDB...\n');

    try {
        // ==========================================
        //  COLECCIÓN: users
        // ==========================================
        const usersCol = db.collection('users');
        await safeCreateIndex(usersCol, { email: 1 }, { unique: true, name: 'idx_users_email' });
        await safeCreateIndex(usersCol, { username: 1 }, { unique: true, name: 'idx_users_username' });
        await safeCreateIndex(usersCol, { role: 1 }, { name: 'idx_users_role' });
        await safeCreateIndex(usersCol, { isVerified: 1 }, { name: 'idx_users_verified' });
        await safeCreateIndex(usersCol, { 'personalInfo.phone': 1 }, { sparse: true, name: 'idx_users_phone' });
        console.log('✅ Índices de users procesados');

        // ==========================================
        //  COLECCIÓN: transactions
        // ==========================================
        const txCol = db.collection('transactions');
        await safeCreateIndex(txCol, { userId: 1, createdAt: -1 }, { name: 'idx_tx_user_date' });
        await safeCreateIndex(txCol, { type: 1, status: 1 }, { name: 'idx_tx_type_status' });
        await safeCreateIndex(txCol, { type: 1, status: 1, createdAt: 1 }, { name: 'idx_tx_analytics' });
        console.log('✅ Índices de transactions procesados');

        // ==========================================
        //  COLECCIÓN: bets
        // ==========================================
        const betsCol = db.collection('bets');
        await safeCreateIndex(betsCol, { userId: 1, createdAt: -1 }, { name: 'idx_bets_user_date' });
        await safeCreateIndex(betsCol, { status: 1 }, { name: 'idx_bets_status' });
        console.log('✅ Índices de bets procesados');

        // ==========================================
        //  COLECCIÓN: withdrawalRequests
        // ==========================================
        const withdrawCol = db.collection('withdrawalRequests');
        await safeCreateIndex(withdrawCol, { status: 1, requestedAt: 1 }, { name: 'idx_withdraw_status_date' });
        await safeCreateIndex(withdrawCol, { userId: 1 }, { name: 'idx_withdraw_user' });
        await safeCreateIndex(withdrawCol, { transactionId: 1 }, { name: 'idx_withdraw_tx' });
        console.log('✅ Índices de withdrawalRequests procesados');

        // ==========================================
        //  COLECCIÓN: payoutMethods
        // ==========================================
        const payoutCol = db.collection('payoutMethods');
        await safeCreateIndex(payoutCol, { userId: 1, isPrimary: -1 }, { name: 'idx_payout_user_primary' });
        console.log('✅ Índices de payoutMethods procesados');

        console.log('\n🎉 ¡Todos los índices han sido creados exitosamente!');

    } catch (error) {
        console.error('❌ Error creando índices:', error);
        throw error;
    }
}

/**
 * Lista todos los índices existentes
 */
async function listIndexes() {
    const db = getDb();
    const collections = ['users', 'transactions', 'bets', 'withdrawalRequests', 'payoutMethods'];
    
    console.log('\n📋 Índices existentes:\n');
    
    for (const collName of collections) {
        try {
            const indexes = await db.collection(collName).indexes();
            console.log(`\n📁 ${collName}:`);
            indexes.forEach(idx => {
                console.log(`   - ${idx.name}: ${JSON.stringify(idx.key)}`);
            });
        } catch (e) {
            console.log(`   ⚠️ Colección ${collName} no existe aún`);
        }
    }
}

module.exports = { createIndexes, listIndexes };

// Si se ejecuta directamente: node utils/setupIndexes.js
if (require.main === module) {
    require('dotenv').config({ path: '../.env' });
    const { connectDB } = require('../db');
    
    connectDB()
        .then(() => createIndexes())
        .then(() => listIndexes())
        .then(() => process.exit(0))
        .catch(err => {
            console.error(err);
            process.exit(1);
        });
}
