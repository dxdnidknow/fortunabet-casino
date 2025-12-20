# 🎰 FortunaBet Casino

Plataforma de apuestas deportivas y casino en línea desarrollada con Node.js, Express, MongoDB y vanilla JavaScript.

## 📋 Tabla de Contenidos

- [Características](#características)
- [Tecnologías](#tecnologías)
- [Requisitos Previos](#requisitos-previos)
- [Instalación](#instalación)
- [Configuración](#configuración)
- [Estructura del Proyecto](#estructura-del-proyecto)
- [API Endpoints](#api-endpoints)
- [Despliegue](#despliegue)
- [Seguridad](#seguridad)

## ✨ Características

### Usuario
- 🔐 Registro con verificación de email (SendGrid)
- 📱 Verificación de teléfono (Twilio)
- 🏆 Apuestas deportivas en tiempo real (The Odds API)
- 💰 Sistema de depósitos y retiros
- 📊 Historial de apuestas y transacciones
- 🎮 Casino en vivo (integración iframe)

### Administrador
- 📈 Dashboard con estadísticas
- ✅ Gestión de depósitos pendientes
- 💸 Procesamiento de retiros
- 👥 Administración de usuarios
- 📊 Gráficas de ingresos mensuales

## 🛠 Tecnologías

### Backend
- **Node.js** + **Express.js**
- **MongoDB** (Atlas)
- **JWT** para autenticación
- **bcrypt** para encriptación
- **Helmet** para seguridad HTTP
- **Joi** para validación de datos

### Frontend
- **HTML5** + **CSS3** (Variables CSS)
- **JavaScript ES6+** (Módulos)
- **Font Awesome** (Iconos)
- **Chart.js** (Gráficas admin)

### Servicios Externos
- **SendGrid** - Emails transaccionales
- **Twilio** - SMS de verificación
- **The Odds API** - Datos deportivos en vivo
- **Netlify** - Hosting frontend
- **Render** - Hosting backend

## 📦 Requisitos Previos

- Node.js v18+ 
- npm v9+
- MongoDB Atlas (cuenta gratuita)
- Cuentas en: SendGrid, Twilio, The Odds API

## 🚀 Instalación

### 1. Clonar el repositorio
```bash
git clone https://github.com/tu-usuario/fortunabet-casino.git
cd fortunabet-casino
```

### 2. Instalar dependencias del backend
```bash
cd backend
npm install
```

### 3. Configurar variables de entorno
```bash
cp .env.example .env
# Editar .env con tus credenciales
```

### 4. Crear índices de MongoDB (opcional pero recomendado)
```bash
node utils/setupIndexes.js
```

### 5. Iniciar el servidor
```bash
# Desarrollo
npm run dev

# Producción
npm start
```

## ⚙️ Configuración

Crea un archivo `.env` en `/backend` con las siguientes variables:

```env
# Base de Datos
DATABASE_URL=mongodb+srv://...

# Servidor
PORT=3001
NODE_ENV=development

# JWT (genera una clave segura)
JWT_SECRET=tu_clave_secreta_32_caracteres_minimo

# Frontend URL
FRONTEND_URL=https://tu-dominio.netlify.app

# SendGrid
SENDGRID_API_KEY=SG.xxx
VERIFIED_SENDER_EMAIL=noreply@tudominio.com

# Twilio
TWILIO_ACCOUNT_SID=ACxxx
TWILIO_AUTH_TOKEN=xxx
TWILIO_PHONE_NUMBER=+1xxx

# API Deportes
ODDS_API_KEY=xxx
```

## 📁 Estructura del Proyecto

```
fortunabet-casino/
├── backend/
│   ├── middleware/
│   │   ├── authMiddleware.js   # Autenticación JWT
│   │   └── authAdmin.js        # Verificación de admin
│   ├── routes/
│   │   ├── auth.js             # Login, registro, OTP
│   │   ├── user.js             # Perfil, apuestas, retiros
│   │   └── admin.js            # Panel administrativo
│   ├── utils/
│   │   ├── helpers.js          # Funciones utilitarias
│   │   └── setupIndexes.js     # Índices MongoDB
│   ├── validators/
│   │   └── index.js            # Validación Joi
│   ├── db.js                   # Conexión MongoDB
│   ├── server.js               # Servidor Express
│   └── package.json
├── js/
│   ├── main.js                 # Punto de entrada frontend
│   ├── auth.js                 # Autenticación cliente
│   ├── account.js              # Dashboard usuario
│   ├── admin-app.js            # Panel admin
│   ├── api.js                  # Llamadas a API deportes
│   ├── bet.js                  # Lógica del cupón
│   ├── payments.js             # Depósitos/retiros
│   ├── modal.js                # Sistema de modales
│   ├── ui.js                   # Utilidades UI (toast)
│   ├── config.js               # URL del API
│   └── loader.js               # Carga de componentes
├── components/
│   ├── header.html
│   ├── footer.html
│   ├── modals.html
│   └── ...
├── css/
│   └── style.css               # Estilos globales
├── admin/
│   ├── index.html              # Panel admin
│   └── admin.css
├── index.html                  # Página principal
├── deportes.html               # Apuestas deportivas
├── casino.html                 # Juegos de casino
├── mi-cuenta.html              # Dashboard usuario
└── README.md
```

## 🔌 API Endpoints

### Autenticación (`/api`)
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/register` | Registro de usuario |
| POST | `/verify-email` | Verificar OTP de email |
| POST | `/resend-otp` | Reenviar código |
| POST | `/login` | Iniciar sesión |
| POST | `/forgot-password` | Solicitar reset |
| POST | `/reset-password` | Cambiar contraseña |

### Usuario (`/api/user`) - Requiere Auth
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/user-data` | Obtener datos del usuario |
| PUT | `/user-data` | Actualizar datos personales |
| POST | `/change-password` | Cambiar contraseña |
| POST | `/request-phone-verification` | Solicitar SMS |
| POST | `/verify-phone-code` | Verificar código SMS |
| GET | `/payout-methods` | Listar métodos de retiro |
| POST | `/payout-methods` | Agregar método |
| DELETE | `/payout-methods/:id` | Eliminar método |
| POST | `/request-deposit` | Reportar depósito |
| POST | `/withdraw` | Solicitar retiro |
| POST | `/place-bet` | Realizar apuesta |
| GET | `/get-bets` | Historial de apuestas |
| GET | `/transactions` | Historial transacciones |

### Admin (`/api/admin`) - Requiere Auth + Rol Admin
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/stats` | Estadísticas generales |
| GET | `/analytics/revenue` | Ingresos por mes |
| GET | `/users` | Lista de usuarios |
| GET | `/deposits/pending` | Depósitos pendientes |
| POST | `/deposits/approve/:id` | Aprobar depósito |
| POST | `/deposits/reject/:id` | Rechazar depósito |
| GET | `/withdrawals/pending` | Retiros pendientes |
| POST | `/withdrawals/approve/:id` | Aprobar retiro |
| POST | `/withdrawals/reject/:id` | Rechazar retiro |

## 🌐 Despliegue

### Frontend (Netlify)
1. Conectar repositorio a Netlify
2. Build command: (vacío - es HTML estático)
3. Publish directory: `/`

### Backend (Render)
1. Crear nuevo Web Service
2. Build command: `cd backend && npm install`
3. Start command: `cd backend && npm start`
4. Agregar variables de entorno en dashboard

## 🔒 Seguridad

El proyecto implementa múltiples capas de seguridad:

- ✅ **Helmet.js** - Headers HTTP seguros
- ✅ **CORS** - Whitelist de orígenes permitidos
- ✅ **Rate Limiting** - Prevención de ataques de fuerza bruta
- ✅ **express-mongo-sanitize** - Prevención NoSQL injection
- ✅ **Joi Validation** - Validación estricta de entrada
- ✅ **bcrypt** - Hash de contraseñas (12 rounds)
- ✅ **JWT** - Tokens con expiración de 24h
- ✅ **Transacciones MongoDB** - Integridad de datos financieros

### Recomendaciones para producción:
1. Usar HTTPS obligatorio
2. Configurar CSP (Content Security Policy)
3. Implementar logs de auditoría
4. Rotar secretos periódicamente
5. Habilitar 2FA real (TOTP)

## 📄 Licencia

Este proyecto es privado y de uso exclusivo.

---

**Desarrollado con ❤️ para FortunaBet**
