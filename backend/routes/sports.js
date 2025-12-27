const express = require('express');
const axios = require('axios');
const router = express.Router();

// Endpoint para obtener datos de deportes (ej: noticias o competiciones)
// Ruta dinámica que acepta un deporte, ej: /api/sports-news/soccer
router.get('/:sport', async (req, res) => {
    try {
        const { sport } = req.params;
        if (!sport) {
            return res.status(400).json({ message: 'No se especificó un deporte.' });
        }

        const apiKey = process.env.SPORTRADAR_API_KEY;
        // Construimos dinámicamente el nombre de la variable de entorno para la URL
        const urlVarName = `SPORTRADAR_URL_${sport.toUpperCase()}`;
        const apiUrlBase = process.env[urlVarName];

        if (!apiKey || !apiUrlBase) {
            console.error(`Variable de entorno ${urlVarName} o SPORTRADAR_API_KEY no configurada.`);
            return res.status(500).json({ message: `Error de configuración del servidor para el deporte: ${sport}.` });
        }

        const apiUrl = `${apiUrlBase.trim()}?api_key=${apiKey.trim()}`;

        const response = await axios.get(apiUrl);
        
        res.json(response.data);

    } catch (error) {
        if (error.response && error.response.headers['content-type']?.includes('text/html')) {
            const specificError = 'Authentication with Sportradar failed. The API returned an HTML page, which usually indicates a wrong API key or an incorrect API endpoint for your plan. Please verify your key and subscription.';
            console.error(specificError);
            return res.status(500).json({ message: 'Error de autenticación con el proveedor de datos deportivos.' });
        }
        console.error('Error al contactar la API de Sportradar:', error.response ? error.response.data : error.message);
        res.status(500).json({ message: 'Error al obtener los datos de deportes.' });
    }
});

module.exports = router;
