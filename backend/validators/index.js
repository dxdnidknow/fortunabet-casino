// Archivo: backend/validators/index.js
// Validadores centralizados usando Joi para prevenir datos maliciosos

const Joi = require('joi');

// ==========================================
//  ESQUEMAS DE VALIDACIÓN
// ==========================================

// Regex para contraseña segura
const passwordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/;

// Regex para username (solo letras, 4-20 caracteres)
const usernamePattern = /^[a-zA-Z]{4,20}$/;

// Esquemas
const schemas = {
    // Registro de usuario
    register: Joi.object({
        username: Joi.string().pattern(usernamePattern).required()
            .messages({
                'string.pattern.base': 'El usuario debe tener entre 4 y 20 letras, sin números ni espacios.',
                'any.required': 'El nombre de usuario es obligatorio.'
            }),
        email: Joi.string().email().lowercase().required()
            .messages({
                'string.email': 'El correo electrónico no es válido.',
                'any.required': 'El correo electrónico es obligatorio.'
            }),
        password: Joi.string().pattern(passwordPattern).required()
            .messages({
                'string.pattern.base': 'La contraseña debe tener al menos 8 caracteres, una mayúscula, una minúscula, un número y un carácter especial.',
                'any.required': 'La contraseña es obligatoria.'
            })
    }),

    // Login
    login: Joi.object({
        identifier: Joi.string().required()
            .messages({ 'any.required': 'El identificador es obligatorio.' }),
        password: Joi.string().required()
            .messages({ 'any.required': 'La contraseña es obligatoria.' })
    }),

    // Verificación de email
    verifyEmail: Joi.object({
        email: Joi.string().email().lowercase().required(),
        otp: Joi.string().length(6).pattern(/^[0-9]+$/).required()
            .messages({ 'string.pattern.base': 'El código debe ser numérico de 6 dígitos.' })
    }),

    // Reenviar OTP
    resendOtp: Joi.object({
        email: Joi.string().email().lowercase().required()
    }),

    // Olvidó contraseña
    forgotPassword: Joi.object({
        email: Joi.string().email().lowercase().required()
    }),

    // Reset de contraseña
    resetPassword: Joi.object({
        id: Joi.string().hex().length(24).required()
            .messages({ 'string.hex': 'ID de usuario no válido.' }),
        token: Joi.string().required(),
        password: Joi.string().pattern(passwordPattern).required()
    }),

    // Cambio de contraseña
    changePassword: Joi.object({
        currentPassword: Joi.string().required(),
        newPassword: Joi.string().pattern(passwordPattern).required()
    }),

    // Datos personales del usuario
    userData: Joi.object({
        fullName: Joi.string().max(100).allow('').optional(),
        cedula: Joi.string().max(20).allow('').optional(),
        birthDate: Joi.string().allow('').optional(),
        phone: Joi.string().pattern(/^\+58[0-9]{10,11}$/).allow('').optional()
            .messages({ 'string.pattern.base': 'Número de teléfono venezolano no válido (+58...)' })
    }),

    // Solicitud de depósito
    requestDeposit: Joi.object({
        amount: Joi.number().positive().max(100000).required()
            .messages({ 
                'number.positive': 'El monto debe ser positivo.',
                'number.max': 'El monto máximo es 100,000.'
            }),
        method: Joi.string().valid('pago_movil', 'zelle', 'binance', 'usdt').required(),
        reference: Joi.string().max(100).required()
    }),

    // Solicitud de retiro
    withdraw: Joi.object({
        amount: Joi.number().min(10).max(50000).required()
            .messages({ 
                'number.min': 'El retiro mínimo es de Bs. 10.',
                'number.max': 'El retiro máximo es de Bs. 50,000.'
            }),
        methodId: Joi.string().hex().length(24).required()
    }),

    // Realizar apuesta
    placeBet: Joi.object({
        bets: Joi.array().min(1).max(20).items(
            Joi.object({
                team: Joi.string().max(200).required(),
                odds: Joi.number().greater(1).max(10000).required(),
                id: Joi.alternatives().try(Joi.string(), Joi.number()).required()
            })
        ).required(),
        stake: Joi.number().positive().max(100000).required()
    }),

    // Método de pago
    payoutMethod: Joi.object({
        methodType: Joi.string().valid('pago_movil', 'zelle').required(),
        isPrimary: Joi.boolean().default(false),
        details: Joi.object().required()
    }),

    // Verificación de teléfono
    verifyPhoneCode: Joi.object({
        code: Joi.string().length(6).pattern(/^[0-9]+$/).required()
    }),

    // ObjectId genérico
    objectId: Joi.object({
        id: Joi.string().hex().length(24).required()
    })
};

// ==========================================
//  MIDDLEWARE DE VALIDACIÓN
// ==========================================

/**
 * Middleware factory para validar el body de una petición
 * @param {string} schemaName - Nombre del esquema a usar
 * @returns {Function} Middleware de Express
 */
function validate(schemaName) {
    return (req, res, next) => {
        const schema = schemas[schemaName];
        
        if (!schema) {
            console.error(`[Validator] Esquema "${schemaName}" no encontrado`);
            return res.status(500).json({ message: 'Error de configuración del servidor.' });
        }

        const { error, value } = schema.validate(req.body, {
            abortEarly: false, // Mostrar todos los errores, no solo el primero
            stripUnknown: true // Eliminar campos no definidos en el esquema
        });

        if (error) {
            const messages = error.details.map(detail => detail.message);
            return res.status(400).json({ 
                message: messages[0], // Primer error para mostrar al usuario
                errors: messages // Todos los errores para debugging
            });
        }

        // Reemplazar body con valores validados y sanitizados
        req.body = value;
        next();
    };
}

/**
 * Middleware para validar parámetros de URL (ObjectId)
 */
function validateParamId(paramName = 'id') {
    return (req, res, next) => {
        const id = req.params[paramName];
        
        if (!id || !/^[0-9a-fA-F]{24}$/.test(id)) {
            return res.status(400).json({ message: 'ID no válido.' });
        }
        
        next();
    };
}

module.exports = {
    validate,
    validateParamId,
    schemas
};
