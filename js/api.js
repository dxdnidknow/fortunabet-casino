import { leagueLogos } from './assets.js';
import { API_BASE_URL } from './config.js'; // <-- PASO 1: AÑADE ESTA IMPORTACIÓN

// La línea "const BASE_URL = ..." debe estar eliminada, como ya hiciste.

export async function fetchLiveEvents(sportKey) {
    try {
        //                                         V-- PASO 2: USA LA NUEVA VARIABLE AQUÍ
        const response = await fetch(`${API_BASE_URL}/events/${sportKey}`);
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'La respuesta del servidor no fue OK');
        }
        
        const rawEvents = await response.json();
        if (!rawEvents || rawEvents.length === 0) return [];

        const now = new Date();

        const formattedEvents = rawEvents.map(event => {
            const bookmaker = event.bookmakers.find(b => b.key === 'betmgm') || event.bookmakers[0];
            if (!bookmaker) return null;

            if (event.home_team && event.away_team) {
                const h2hMarket = bookmaker.markets.find(m => m.key === 'h2h');
                const totalsMarket = bookmaker.markets.find(m => m.key === 'totals');
                
                const eventDate = new Date(event.commence_time);

                return {
                    id: event.id,
                    type: 'match',
                    sport_key: event.sport_key,
                    sport_title: event.sport_title,
                    home_team: event.home_team,
                    away_team: event.away_team,
                    teams: `${event.home_team} vs ${event.away_team}`,
                    homeLogo: `https://logo.clearbit.com/${event.home_team.replace(/\s+/g, '').toLowerCase()}.com?size=60`,
                    awayLogo: `https://logo.clearbit.com/${event.away_team.replace(/\s+/g, '').toLowerCase()}.com?size=60`,
                    commence_time: event.commence_time,
                    time: eventDate.toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }),
                    is_live: eventDate < now,
                    odds: {
                        home: h2hMarket?.outcomes.find(o => o.name === event.home_team)?.price || 0,
                        away: h2hMarket?.outcomes.find(o => o.name === event.away_team)?.price || 0,
                        draw: h2hMarket?.outcomes.find(o => o.name === 'Draw')?.price || 0
                    },
                    totals: {
                        point: totalsMarket?.outcomes[0]?.point || 0,
                        over: totalsMarket?.outcomes.find(o => o.name === 'Over')?.price || 0,
                        under: totalsMarket?.outcomes.find(o => o.name === 'Under')?.price || 0,
                    },
                    logoUrl: leagueLogos[event.sport_key] || null
                };
            }
            
            const outrightMarket = bookmaker.markets.find(m => m.key === 'outrights');
            if (outrightMarket) {
                return outrightMarket.outcomes.map(outcome => ({
                    id: `${event.id}-${outcome.name}`, type: 'outright', sport_key: event.sport_key, sport_title: event.sport_title, teams: outcome.name,
                    commence_time: event.commence_time, time: 'A futuro', is_live: false, odds: { winner: outcome.price }, totals: null,
                    logoUrl: leagueLogos[event.sport_key] || null
                }));
            }

            return null;
        }).flat().filter(Boolean);
const validEvents = formattedEvents.filter(event => {
            return event.type === 'outright' || (event.odds && event.odds.home > 1 && event.odds.away > 1);
        });

        return validEvents;
        
    } catch (error) {
        console.error("Error al obtener eventos:", error);
        
        // Si el error es de cuota, podrías retornar un array vacío para que la app no falle
        if (error.message.includes('Usage quota') || error.message.includes('401')) {
            console.warn("⚠️ La cuota de la API de deportes se ha agotado.");
            // Opcional: Podrías retornar datos de prueba (mock data) aquí si quisieras
        }
        return [];
    }
}

export async function fetchEventDetails(sportKey, eventId) {
    try {
        //                                         V-- PASO 2: Y ÚSALA AQUÍ TAMBIÉN
        const response = await fetch(`${API_BASE_URL}/event/${sportKey}/${eventId}`);
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'No se pudieron obtener los detalles del evento');
        }
        return await response.json();
    } catch (error) {
        console.error("Error al obtener detalles del evento desde el backend:", error);
        return null; 
    }
}

export async function fetchSportsNews(sport) {
    try {
        const response = await fetch(`${API_BASE_URL}/sports-news/${sport}`);
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'No se pudieron obtener las noticias deportivas');
        }
        return await response.json();
    } catch (error) {
        console.error("Error al obtener noticias deportivas desde el backend:", error);
        return [];
    }
}