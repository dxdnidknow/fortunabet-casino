const express = require('express');
const axios = require('axios');
const router = express.Router();

// Endpoint para obtener datos de deportes (ej: noticias o competiciones)
router.get('/news', async (req, res) => {
    try {
        const apiKey = process.env.SPORTRADAR_API_KEY;
        if (!apiKey) {
            console.error('La API Key de Sportradar no está configurada en las variables de entorno.');
            return res.status(500).json({ message: 'Error de configuración del servidor.' });
        }

        // Ejemplo de URL para la API de prueba de Fútbol de Sportradar (listar competiciones)
        // Asegúrate de que tu suscripción en Sportradar coincida con este endpoint.
        const apiUrl = `https://api.sportradar.com/soccer/trial/v4/en/competitions.json?api_key=${apiKey}`;

        const response = await axios.get(apiUrl);
        
        // Devolvemos los datos obtenidos de la API de Sportradar
        res.json(response.data);

    } catch (error) {
        console.error('Error al contactar la API de Sportradar:', error.response ? error.response.data : error.message);
        res.status(500).json({ message: 'Error al obtener los datos de deportes.' });
    }
});

module.exports = router;
