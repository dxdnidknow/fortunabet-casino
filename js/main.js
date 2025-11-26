// Archivo: js/main.js

import { API_BASE_URL } from './config.js';
import { addBet, initBetSlip, subscribe, getBets } from './bet.js';
import { initModals, openModal } from './modal.js';
import { initSharedComponents } from './loader.js';
import { fetchLiveEvents, fetchEventDetails } from './api.js';
import { initAuth } from './auth.js';
import { initAccountDashboard } from './account.js';
import { sportTranslations } from './translations.js';
import { initPaymentModals } from './payments.js'; 
import { initHelpWidget } from './help-widget.js';

let favorites = JSON.parse(localStorage.getItem('fortunaFavorites')) || [];

function updateFavoritesUI() {
    document.querySelectorAll('.favorite-btn').forEach(btn => {
        const eventId = btn.dataset.eventId;
        const isFavorited = favorites.includes(eventId);
        btn.classList.toggle('favorited', isFavorited);
        const icon = btn.querySelector('i');
        if (icon) {
            icon.classList.toggle('fa-solid', isFavorited);
            icon.classList.toggle('fa-regular', !isFavorited);
        }
    });
}

function updateSelectedOddsUI() {
    const currentBets = getBets();
    const betIds = currentBets.map(bet => bet.id);
    document.querySelectorAll('.odds-button').forEach(button => {
        const betId = `${button.dataset.team}-${button.dataset.odds}`;
        const isSelected = betIds.includes(betId);
        button.classList.toggle('selected', isSelected);
    });
}

function renderEventCard(event, index) {
    const teamName = event.teams || 'Evento';
    let oddsHtml = '';
    let headerActionsHtml = event.is_live ? `<span class="live-indicator">EN VIVO</span>` : `<span class="event-card__time">${event.time || ''}</span>`;

    if (event.type === 'match') {
        const drawButton = event.odds.draw > 0 ? `<button class="odds-button" data-team="${teamName} - X" data-odds="${event.odds.draw}">X <span>${event.odds.draw.toFixed(2)}</span></button>` : '';
        oddsHtml = `
            <div class="market-group">
                <button class="odds-button" data-team="${teamName} - 1" data-odds="${event.odds.home || 0}">1 <span>${(event.odds.home || 0).toFixed(2)}</span></button>
                ${drawButton}
                <button class="odds-button" data-team="${teamName} - 2" data-odds="${event.odds.away || 0}">2 <span>${(event.odds.away || 0).toFixed(2)}</span></button>
            </div>`;
    } else if (event.type === 'outright') {
        oddsHtml = `
            <button class="odds-button" data-team="${teamName} - Ganador" data-odds="${event.odds.winner || 0}">
                <span>${(event.odds.winner || 0).toFixed(2)}</span>
            </button>`;
    }

    return `
    <div class="event-card" style="--i: ${index};">
        <div class="event-card__header">
            <div class="event-card__teams-container">
                <a href="#" class="event-detail-link" data-event-id="${event.id}" data-sport-key="${event.sport_key}">
                    <strong class="event-card__teams">${teamName}</strong>
                </a>
            </div>
            <div class="event-card__actions">${headerActionsHtml}</div>
        </div>
        <div class="event-card__odds">${oddsHtml}</div>
    </div>`;
}

function renderEvents(allEvents) {
    const liveContainer = document.getElementById('live-events-container');
    const upcomingContainer = document.getElementById('upcoming-events-container');
    
    if (!liveContainer || !upcomingContainer) return;

    const liveEvents = allEvents.filter(event => event.is_live);
    const upcomingEvents = allEvents.filter(event => !event.is_live);

    const buildHtmlFor = (eventList) => {
        if (!eventList || eventList.length === 0) return '';
        
        const groupedByLeague = eventList.reduce((acc, event) => {
            if (!acc[event.sport_key]) acc[event.sport_key] = [];
            acc[event.sport_key].push(event);
            return acc;
        }, {});

        let finalHtml = '';
        for (const sportKey in groupedByLeague) {
            const eventsInLeague = groupedByLeague[sportKey];
            const meta = eventsInLeague[0];
            const translatedTitle = sportTranslations[meta.sport_title] || meta.sport_title;
            const leagueLogoHtml = meta.logoUrl ? `<img src="${meta.logoUrl}" alt="" class="league-logo">` : '<i class="fa-solid fa-trophy"></i>';
            const headerHtml = `<div class="league-header"><h4>${leagueLogoHtml} ${translatedTitle}</h4></div>`;
            const cardsHtml = eventsInLeague.map(renderEventCard).join('');
            finalHtml += `<div class="league-group">${headerHtml}<div class="league-events">${cardsHtml}</div></div>`;
        }
        return finalHtml;
    };

    const liveHtml = buildHtmlFor(liveEvents);
    liveContainer.innerHTML = liveHtml || `<div class="initial-message" style="padding: 40px 20px;"><i class="fa-solid fa-face-frown"></i><h2>Sin Eventos En Vivo</h2></div>`;
    
    const upcomingHtml = buildHtmlFor(upcomingEvents);
    upcomingContainer.innerHTML = upcomingHtml || `<div class="initial-message" style="padding: 40px 20px;"><i class="fa-solid fa-face-frown"></i><h2>Sin Eventos Próximos</h2></div>`;

    const tabLive = document.querySelector('.tab-link[data-tab="live"]');
    const tabUpcoming = document.querySelector('.tab-link[data-tab="upcoming"]');
    const contentLive = document.getElementById('live');
    const contentUpcoming = document.getElementById('upcoming');

    // Lógica para activar la pestaña correcta si una está vacía
    if (liveEvents.length > 0) {
        if(tabLive) tabLive.classList.add('active');
        if(contentLive) contentLive.classList.add('active');
        if(tabUpcoming) tabUpcoming.classList.remove('active');
        if(contentUpcoming) contentUpcoming.classList.remove('active');
    } else if (upcomingEvents.length > 0) {
        if(tabLive) tabLive.classList.remove('active');
        if(contentLive) contentLive.classList.remove('active');
        if(tabUpcoming) tabUpcoming.classList.add('active');
        if(contentUpcoming) contentUpcoming.classList.add('active');
    } else {
        if(tabLive) tabLive.classList.add('active');
        if(contentLive) contentLive.classList.add('active');
    }
    
    updateFavoritesUI();
    updateSelectedOddsUI();
}

function renderEventDetail(eventData) {
    const detailView = document.getElementById('event-detail-view');
    if (!detailView) return;

    let marketsHtml = '';
    const bookmaker = eventData.bookmakers.find(b => b.key === 'betmgm') || eventData.bookmakers[0];

    if (bookmaker && bookmaker.markets) {
        const marketIcons = { 'h2h': 'fa-users', 'totals': 'fa-plus-minus', 'spreads': 'fa-right-left' };
        marketsHtml = bookmaker.markets.map(market => {
            const icon = marketIcons[market.key] || 'fa-circle-question';
            const outcomesHtml = market.outcomes.map(outcome =>
                `<button class="odds-button" data-team="${eventData.home_team} vs ${eventData.away_team} - ${outcome.name} ${outcome.point || ''}" data-odds="${outcome.price}">
                    ${outcome.name} ${outcome.point || ''}
                    <span>${outcome.price.toFixed(2)}</span>
                </button>`
            ).join('');
            return `<div class="event-card" style="flex-direction: column; align-items: flex-start; margin-bottom: 10px;">
                        <h4 style="margin-bottom: 10px; color: var(--color-primary);"><i class="fa-solid ${icon}"></i> ${market.key.replace(/_/g, ' ')}</h4>
                        <div style="display: flex; flex-wrap: wrap; gap: 10px; width: 100%;">${outcomesHtml}</div>
                    </div>`;
        }).join('');
    } else {
        marketsHtml = '<p class="empty-message">No hay mercados disponibles para este evento.</p>';
    }

    detailView.innerHTML = `
        <div class="event-detail-header">
            <button id="back-to-list-btn" class="btn btn-secondary" style="margin-bottom: 20px;">&lt; Volver a la lista</button>
            <h2 class="page-title" style="font-size: 1.8rem; margin-bottom: 10px;">${eventData.home_team} vs ${eventData.away_team}</h2>
            <p style="color: var(--color-text-secondary); margin-bottom: 20px;">${new Date(eventData.commence_time).toLocaleString('es-ES', { dateStyle: 'long', timeStyle: 'short' })}</p>
        </div>
        <div class="event-detail-markets">${marketsHtml}</div>`;
    
    updateSelectedOddsUI();
}

function switchView(viewToShow) {
    document.querySelectorAll('#live, #upcoming, #event-detail-view').forEach(view => {
        if (view) view.classList.add('hidden');
    });
    document.querySelector('.event-tabs')?.classList.toggle('hidden', viewToShow === '#event-detail-view');

    const viewElementToShow = document.querySelector(viewToShow);
    if (viewElementToShow) viewElementToShow.classList.remove('hidden');
}

function handleActiveNav() {
    const navLinks = document.querySelectorAll('.main-nav ul a, #mobile-menu a');
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    navLinks.forEach(link => {
        if (link.getAttribute('href')?.endsWith(currentPage)) {
            link.classList.add('active');
        }
    });
}

async function initSportsNav() {
    const sportsNavDesktop = document.querySelector('.main-container .sports-nav');
    const sportsPanelNav = document.querySelector('.sports-panel__nav');
    
    // Si no existen (ej: login), no hacemos nada
    if (!sportsNavDesktop && !sportsPanelNav) return;

    try {
        const response = await fetch(`${API_BASE_URL}/sports`);
        if (!response.ok) throw new Error('Network response was not ok');
        const sports = await response.json();
        const sportsGrouped = sports.reduce((acc, sport) => {
            if (!acc[sport.group]) acc[sport.group] = [];
            acc[sport.group].push(sport);
            return acc;
        }, {});

        const icons = { 'Soccer': 'fa-futbol', 'Basketball': 'fa-basketball', 'Tennis': 'fa-tennis-ball' };
        let navHtml = Object.entries(sportsGrouped).map(([groupName, leagues]) => {
            const translatedGroupName = sportTranslations[groupName] || groupName;
            const iconClass = icons[groupName] || 'fa-trophy';
            const leaguesHtml = leagues.map(sport => {
                const translatedTitle = sportTranslations[sport.title] || sport.title;
                return `<li><a href="#" class="sport-link" data-sport-key="${sport.key}">${translatedTitle}</a></li>`;
            }).join('');
            return `<div class="nav-category">
                        <h4 class="category-title accordion"><i class="fa-solid ${iconClass}"></i> ${translatedGroupName}</h4>
                        <ul class="submenu">${leaguesHtml}</ul>
                    </div>`;
        }).join('');

        if (sportsNavDesktop) {
            const searchBarHtml = `<div class="search-container"><i class="fa-solid fa-search"></i><input type="text" class="sport-search-input" placeholder="Buscar liga..."></div>`;
            sportsNavDesktop.innerHTML = searchBarHtml + `<div class="nav-container">${navHtml}</div>`; 
        }
        if (sportsPanelNav) {
            sportsPanelNav.innerHTML = `<div class="nav-container">${navHtml}</div>`;
        }

    } catch (error) {
        console.error("Error al inicializar la navegación de deportes:", error);
        const errorMessage = `<p class="error-message" style="padding: 1rem;">No se pudo cargar el menú.</p>`;
        if (sportsNavDesktop) sportsNavDesktop.innerHTML = errorMessage;
        if (sportsPanelNav) sportsPanelNav.innerHTML = errorMessage;
    }
}

function showInitialMessage() {
    const liveContainer = document.getElementById('live-events-container');
    const upcomingContainer = document.getElementById('upcoming-events-container');
    
    const emptyStateHtml = `
        <div class="initial-message" style="text-align: center; padding: 60px 20px;">
            <i class="fa-solid fa-trophy" style="font-size: 4rem; color: var(--color-primary); margin-bottom: 20px; opacity: 0.8;"></i>
            <h2 style="font-size: 1.8rem; margin-bottom: 10px;">¡Bienvenido a la Zona de Deportes!</h2>
            <p style="color: var(--color-text-secondary); max-width: 400px; margin: 0 auto 20px;">
                Selecciona una liga del menú de la izquierda para ver los partidos en vivo y las mejores cuotas del mercado.
            </p>
        </div>
    `;

    if (liveContainer) liveContainer.innerHTML = emptyStateHtml;
    if (upcomingContainer) upcomingContainer.innerHTML = '';
}

function handleSearch(searchTerm) {
    const term = searchTerm.toLowerCase().trim();
    const navContainers = document.querySelectorAll('.sports-nav .nav-container, .sports-panel__nav .nav-container');

    navContainers.forEach(container => {
        const categories = container.querySelectorAll('.nav-category');
        categories.forEach(category => {
            const links = category.querySelectorAll('.sport-link');
            const accordionHeader = category.querySelector('.accordion');
            const submenu = category.querySelector('.submenu');
            let hasVisible = false;

            links.forEach(link => {
                const matches = link.textContent.toLowerCase().includes(term);
                link.closest('li').style.display = matches ? '' : 'none';
                if (matches) hasVisible = true;
            });

            if (term.length === 0 || hasVisible) {
                category.style.display = '';
            } else {
                category.style.display = 'none';
            }

            if (term.length > 0 && hasVisible) {
                accordionHeader.classList.add('active');
                submenu.style.maxHeight = submenu.scrollHeight + 'px';
            } else {
                accordionHeader.classList.remove('active');
                submenu.style.maxHeight = null;
            }
        });
    });
}

function initGameSlider() {
    const sliderContainer = document.querySelector('.game-slider-container');
    if (!sliderContainer) return;
    const sliderWrapper = sliderContainer.querySelector('.slider-wrapper');
    const slides = Array.from(sliderWrapper.children);
    if (slides.length < 2) return;

    slides.forEach(slide => {
        if (slide.dataset.background) slide.style.backgroundImage = `url('${slide.dataset.background}')`;
    });

    const dotsContainer = document.createElement('div');
    dotsContainer.className = 'slider-dots';
    dotsContainer.style.cssText = 'position:absolute; bottom:20px; left:50%; transform:translateX(-50%); display:flex; gap:10px; z-index:5;';
    sliderContainer.appendChild(dotsContainer);
    
    // Crear dots
    dotsContainer.innerHTML = slides.map((_, i) => `<div class="dot ${i === 0 ? 'active' : ''}" data-index="${i}" style="width:10px; height:10px; background:${i===0?'#2ECC71':'rgba(255,255,255,0.5)'}; border-radius:50%; cursor:pointer;"></div>`).join('');
    
    let currentIndex = 0;

    function goToSlide(index) {
        currentIndex = (index + slides.length) % slides.length;
        sliderWrapper.style.transform = `translateX(-${currentIndex * 100}%)`;
        Array.from(dotsContainer.children).forEach((dot, i) => {
            dot.classList.toggle('active', i === currentIndex);
            dot.style.background = i === currentIndex ? '#2ECC71' : 'rgba(255,255,255,0.5)';
        });
    }

    setInterval(() => goToSlide(currentIndex + 1), 5000);
    
    dotsContainer.addEventListener('click', (e) => {
        if(e.target.dataset.index) goToSlide(parseInt(e.target.dataset.index));
    });
}

function initCasinoFilters() {
    const filterContainer = document.querySelector('.game-filters');
    const gameGrid = document.querySelector('.game-grid');
    if (!filterContainer || !gameGrid) return; 

    filterContainer.addEventListener('click', (e) => {
        const filterBtn = e.target.closest('.filter-btn');
        if (!filterBtn) return;

        filterContainer.querySelector('.filter-btn.active')?.classList.remove('active');
        filterBtn.classList.add('active');

        const filterValue = filterBtn.dataset.filter;
        gameGrid.querySelectorAll('.game-card').forEach(card => {
            const categories = card.dataset.category.split(' '); 
            card.style.display = (filterValue === 'all' || categories.includes(filterValue)) ? 'block' : 'none';
        });
    });
}

// --- CONFIGURACIÓN DE EVENT LISTENERS PRINCIPALES ---
function setupEventListeners() {
    document.body.addEventListener('click', async (event) => {
        const target = event.target;

        // 1. ABRIR/CERRAR MENÚ MÓVIL
        if (target.closest('#mobile-menu-toggle, .close-menu-btn')) {
            const mobileMenu = document.getElementById('mobile-menu');
            const toggleBtn = document.getElementById('mobile-menu-toggle');
            if (!mobileMenu) return;
            
            const isOpen = mobileMenu.classList.toggle('is-open');
            if(toggleBtn) toggleBtn.classList.toggle('is-active', isOpen);
            document.body.classList.toggle('panel-open', isOpen);
            return;
        }

        // 2. CLICK EN ENLACE DENTRO DEL MENÚ MÓVIL (Navegación)
        if (target.closest('#mobile-menu a')) {
            document.getElementById('mobile-menu').classList.remove('is-open');
            document.body.classList.remove('panel-open');
        }

        // 3. ABRIR PANEL DEPORTES (MÓVIL)
        if (target.closest('#mobile-sports-panel-trigger, #close-sports-panel-btn')) {
            event.preventDefault();
            const sportsPanel = document.getElementById('sports-panel');
            const isOpen = sportsPanel?.classList.toggle('is-open');
            document.body.classList.toggle('panel-open', isOpen);
            return;
        }

        // 4. CLICK EN LIGA/DEPORTE
        const sportLink = target.closest('.sport-link');
        if (sportLink) {
            event.preventDefault();
            document.getElementById('sports-panel')?.classList.remove('is-open');
            document.body.classList.remove('panel-open');

            const sportKey = sportLink.dataset.sportKey;

            if (!window.location.pathname.includes('deportes.html')) {
                window.location.href = `/deportes.html?sport=${sportKey}`;
                return;
            }
            
            const liveContainer = document.getElementById('live-events-container');
            const upcomingContainer = document.getElementById('upcoming-events-container');
            const spinnerHtml = `<div class="loader-container"><div class="spinner"></div></div>`;
            if (liveContainer) liveContainer.innerHTML = spinnerHtml;
            if (upcomingContainer) upcomingContainer.innerHTML = spinnerHtml;

            const events = await fetchLiveEvents(sportKey);
            renderEvents(events);
            return;
        }

        // 5. CLICK EN CUOTA (AÑADIR APUESTA)
        const oddsButton = target.closest('.odds-button');
        if (oddsButton) {
            const isLoggedIn = localStorage.getItem('fortunaUser');
            if (!isLoggedIn) {
                const loginModal = document.getElementById('login-modal');
                if(loginModal) openModal(loginModal);
                return;
            }
            addBet({ 
                team: oddsButton.dataset.team, 
                odds: parseFloat(oddsButton.dataset.odds), 
                id: `${oddsButton.dataset.team}-${oddsButton.dataset.odds}` 
            });
            return;
        }

        // 6. ACORDEÓN DE DEPORTES
        const accordion = target.closest('.accordion');
        if (accordion) {
            const submenu = accordion.nextElementSibling;
            accordion.classList.toggle('active');
            submenu.style.maxHeight = accordion.classList.contains('active') ? submenu.scrollHeight + 'px' : null;
            return;
        }

        // 7. DETALLE DEL EVENTO
        const detailLink = target.closest('.event-detail-link');
        if (detailLink) {
            event.preventDefault();
            const { eventId, sportKey } = detailLink.dataset;
            document.getElementById('live-events-container').innerHTML = '<div class="loader-container"><div class="spinner"></div></div>';
            
            try {
                const eventData = await fetchEventDetails(sportKey, eventId);
                renderEventDetail(eventData);
                switchView('#event-detail-view');
            } catch (error) { 
                console.error(error); 
            }
            return;
        }

        // 8. VOLVER A LISTA
        if (target.closest('#back-to-list-btn')) {
            event.preventDefault();
            document.querySelector('#event-detail-view').classList.add('hidden');
            document.querySelector('.event-tabs').classList.remove('hidden');
            document.querySelector('.tab-content.active')?.classList.remove('hidden');
            switchView('#live');
            return;
        }
        
        // 9. ABRIR JUEGO (CASINO)
        const gameCard = target.closest('.game-card[data-game-url]');
        if (gameCard) {
            event.preventDefault();
            if (!localStorage.getItem('fortunaUser')) {
                openModal(document.getElementById('login-modal'));
            } else {
                const gameUrl = gameCard.dataset.gameUrl;
                const gameModal = document.getElementById('game-modal');
                const gameIframe = document.getElementById('game-iframe');
                if(gameIframe) gameIframe.src = gameUrl;
                if(gameModal) openModal(gameModal);
            }
            return;
        }

        // 10. PESTAÑAS (TABS)
        const tabLink = target.closest('.tab-link');
        if (tabLink) {
            if (tabLink.classList.contains('active')) return;
            document.querySelectorAll('.tab-link').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            
            tabLink.classList.add('active');
            document.getElementById(tabLink.dataset.tab).classList.add('active');
            return;
        }

        // 11. CLICK EN LA BARRA DE NOTIFICACIÓN MÓVIL
        if (target.closest('#open-mobile-slip') || target.closest('#mobile-bet-notification')) {
            const betSlip = document.querySelector('.bet-slip');
            if (betSlip) {
                betSlip.classList.add('active'); // Usamos clase CSS en vez de style inline
                document.body.classList.add('modal-open'); // Bloquear scroll de fondo
            }
            return;
        }
        if (target.closest('#close-mobile-slip')) {
            const betSlip = document.querySelector('.bet-slip');
            if (betSlip) {
                betSlip.classList.remove('active');
                document.body.classList.remove('modal-open');
            }
            return;
        }
    });

    document.body.addEventListener('input', (event) => {
        if (event.target.classList.contains('sport-search-input')) {
            handleSearch(event.target.value);
        }
    });
}

// --- FUNCIÓN DE INICIO ---
async function main() {
    document.body.classList.remove('modal-open', 'panel-open');
    
    await initSharedComponents();
    
    initModals();
    initAuth();
    handleActiveNav();
    initGameSlider();
    initCasinoFilters();
    initBetSlip();
    initHelpWidget();
    initPaymentModals();    
    
    await initSportsNav();
    setupEventListeners();
    subscribe(updateSelectedOddsUI);

    if (window.location.pathname.includes('deportes.html')) {
        const urlParams = new URLSearchParams(window.location.search);
        const sportKeyFromUrl = urlParams.get('sport');
        if (sportKeyFromUrl) {
            const events = await fetchLiveEvents(sportKeyFromUrl);
            renderEvents(events);
        } else {
            showInitialMessage();
        }
    } else if (window.location.pathname.includes('mi-cuenta.html')) {
        if (!localStorage.getItem('fortunaToken')) {
            window.location.href = '/index.html';
        } else {
            await initAccountDashboard(); 
        }
    }
    
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('action') === 'reset' && urlParams.get('token')) {
        const resetModal = document.getElementById('reset-password-modal');
        if (resetModal) {
            resetModal.dataset.id = urlParams.get('id');
            resetModal.dataset.token = urlParams.get('token');
            openModal(resetModal);
        }
    }
}

document.addEventListener('DOMContentLoaded', main);