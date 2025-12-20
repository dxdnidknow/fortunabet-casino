// Archivo: backend/utils/helpers.js
// Funciones de utilidad compartidas

/**
 * Genera un código OTP de 6 dígitos
 * @returns {string} Código OTP
 */
function generateOtp() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Calcula la fecha de expiración para un OTP
 * @param {number} minutes - Minutos de validez (default: 10)
 * @returns {Date} Fecha de expiración
 */
function getOtpExpiration(minutes = 10) {
    return new Date(Date.now() + minutes * 60 * 1000);
}

/**
 * Verifica si un usuario tiene 18 años o más
 * @param {string} dateString - Fecha de nacimiento
 * @returns {boolean}
 */
function isOver18(dateString) {
    if (!dateString) return false;
    const today = new Date();
    const birthDate = new Date(dateString);
    if (isNaN(birthDate.getTime())) return false;
    
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
    }
    
    return age >= 18;
}

/**
 * Sanitiza un string para prevenir XSS básico
 * @param {string} str - String a sanitizar
 * @returns {string} String sanitizado
 */
function sanitizeString(str) {
    if (typeof str !== 'string') return str;
    return str
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;');
}

/**
 * Formatea un número como moneda venezolana
 * @param {number} amount - Monto a formatear
 * @returns {string} Monto formateado
 */
function formatCurrency(amount) {
    return `Bs. ${Number(amount).toFixed(2)}`;
}

/**
 * Maneja errores de API externa de forma consistente
 * @param {Error} error - Error capturado
 * @param {Response} res - Objeto response de Express
 */
function handleApiError(error, res) {
    if (error.response) {
        console.error(`[ERROR API]: ${error.response.status}`, error.response.data);
        res.status(error.response.status).json(error.response.data);
    } else {
        console.error(`[ERROR SERVER]: ${error.message}`);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
}

/**
 * Logger consistente para el backend
 * @param {string} level - Nivel de log (info, warn, error)
 * @param {string} context - Contexto/módulo
 * @param {string} message - Mensaje
 * @param {object} data - Datos adicionales (opcional)
 */
function log(level, context, message, data = null) {
    const timestamp = new Date().toISOString();
    const prefix = {
        info: '✅',
        warn: '⚠️',
        error: '❌'
    }[level] || 'ℹ️';
    
    const logMessage = `${prefix} [${timestamp}] [${context}] ${message}`;
    
    if (level === 'error') {
        console.error(logMessage, data || '');
    } else if (level === 'warn') {
        console.warn(logMessage, data || '');
    } else {
        console.log(logMessage, data || '');
    }
}

module.exports = {
    generateOtp,
    getOtpExpiration,
    isOver18,
    sanitizeString,
    formatCurrency,
    handleApiError,
    log
};
