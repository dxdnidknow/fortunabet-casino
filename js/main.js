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
import { showToast } from './ui.js';

// --- UTILIDADES GLOBALES ---
const select = (selector, scope = document) => scope.querySelector(selector);
const selectAll = (selector, scope = document) => scope.querySelectorAll(selector);
const setHTML = (el, html) => {
    if (el) el.innerHTML = html;
};
const toggleBodyState = (state, shouldEnable) => {
    document.body.classList.toggle(state, shouldEnable);
};
const showErrorToast = (message, error, shouldToast = true) => {
    console.error(message, error);
    if (shouldToast) showToast(message, 'error');
};
const isOnPage = (name) => window.location.pathname.includes(name);
const isUserLoggedIn = () => Boolean(localStorage.getItem('fortunaUser'));

const CACHE_TTL_MS = 60 * 1000;
const FAVORITES_STORAGE_KEY = 'fortunaFavorites';

const LOADERS = {
    spinner: '<div class="loader-container"><div class="spinner"></div></div>',
    empty: (message) => `
        <div class="initial-message">
            <i class="fa-solid fa-circle-info"></i>
            <p>${message}</p>
        </div>
    `
};

const state = {
    eventsCache: new Map(),
    currentSportKey: null,
    isFetchingEvents: false,
    isFetchingDetails: false
};

const safeJsonFetch = async (url, options = {}) => {
    const response = await fetch(url, options);
    if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(errorText || `Error ${response.status}`);
    }
    return response.json();
};

const setLoader = (container, message = null) => {
    if (!container) return;
    container.innerHTML = message ? LOADERS.empty(message) : LOADERS.spinner;
};

// --- ESTADO GLOBAL Y UTILIDADES ---
let favorites = JSON.parse(localStorage.getItem(FAVORITES_STORAGE_KEY)) || [];

function updateFavoritesUI() {
    document.querySelectorAll('.favorite-btn').forEach(btn => {
        const eventId = btn.dataset.eventId;
        const isFavorited = favorites.includes(eventId);
        btn.classList.toggle('favorited', isFavorited);
        btn.setAttribute('aria-pressed', String(isFavorited));
        const icon = btn.querySelector('i');
        if (icon) {
            icon.classList.toggle('fa-solid', isFavorited);
            icon.classList.toggle('fa-regular', !isFavorited);
        }
    });
}

const persistFavorites = () => {
    localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favorites));
};

const toggleFavorite = (eventId) => {
    if (!eventId) return;
    const alreadyExists = favorites.includes(eventId);
    favorites = alreadyExists ? favorites.filter(id => id !== eventId) : [...favorites, eventId];
    persistFavorites();
    updateFavoritesUI();
    showToast(
        alreadyExists ? 'Evento eliminado de favoritos' : 'Evento agregado a favoritos',
        alreadyExists ? 'info' : 'success'
    );
};

const initFavorites = () => {
    updateFavoritesUI();
    window.addEventListener('storage', (event) => {
        if (event.key === FAVORITES_STORAGE_KEY) {
            favorites = JSON.parse(event.newValue) || [];
            updateFavoritesUI();
        }
    });
};

function updateSelectedOddsUI() {
    const currentBets = getBets();
    const betIds = currentBets.map(bet => bet.id);
    document.querySelectorAll('.odds-button').forEach(button => {
        const betId = `${button.dataset.team}-${button.dataset.odds}`;
        const isSelected = betIds.includes(betId);
        if (isSelected) {
            button.classList.add('selected');
        } else {
            button.classList.remove('selected');
        }
    });
}

// --- RENDERIZADO DE EVENTOS ---
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
                <a href="#" class="event-detail-link" data-event-id="${event.id}" data-sport-key="${event.sport_key}" style="text-decoration:none; color:inherit;">
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

    if (!allEvents || allEvents.length === 0) {
        const noDataHtml = `<div class="initial-message" style="padding: 40px; text-align: center;"><i class="fa-solid fa-calendar-xmark" style="font-size: 2rem; color: #555; margin-bottom:10px;"></i><p>No hay eventos disponibles en este momento para esta categoría.</p></div>`;
        liveContainer.innerHTML = noDataHtml;
        upcomingContainer.innerHTML = noDataHtml;
        return;
    }

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
            const leagueLogoHtml = meta.logoUrl ? `<img src="${meta.logoUrl}" alt="" class="league-logo">` : '<i class="fa-solid fa-trophy" style="color:var(--color-primary);"></i>';
            const headerHtml = `<div class="league-header"><h4>${leagueLogoHtml} ${translatedTitle}</h4></div>`;
            const cardsHtml = eventsInLeague.map(renderEventCard).join('');
            finalHtml += `<div class="league-group">${headerHtml}<div class="league-events">${cardsHtml}</div></div>`;
        }
        return finalHtml;
    };

    const liveHtml = buildHtmlFor(liveEvents);
    liveContainer.innerHTML = liveHtml || `<div class="initial-message" style="padding: 40px; text-align: center; color: #777;">No hay eventos en vivo ahora mismo.</div>`;
    
    const upcomingHtml = buildHtmlFor(upcomingEvents);
    upcomingContainer.innerHTML = upcomingHtml || `<div class="initial-message" style="padding: 40px; text-align: center; color: #777;">No hay eventos próximos programados.</div>`;

    if (liveEvents.length === 0 && upcomingEvents.length > 0) {
        document.querySelector('.tab-link[data-tab="upcoming"]')?.click();
    } else {
        document.querySelector('.tab-link[data-tab="live"]')?.click();
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
                        <h4 style="margin-bottom: 10px; color: var(--color-primary); display:flex; align-items:center; gap:10px;"><i class="fa-solid ${icon}"></i> ${market.key.replace(/_/g, ' ').toUpperCase()}</h4>
                        <div style="display: flex; flex-wrap: wrap; gap: 10px; width: 100%;">${outcomesHtml}</div>
                    </div>`;
        }).join('');
    } else {
        marketsHtml = '<p class="empty-message">No hay mercados disponibles para este evento.</p>';
    }

    detailView.innerHTML = `
        <div class="event-detail-header" style="margin-bottom: 20px;">
            <button id="back-to-list-btn" class="btn btn-secondary" style="margin-bottom: 15px;">&lt; Volver a la lista</button>
            <h2 style="font-size: 1.5rem; margin-bottom:5px;">${eventData.home_team} vs ${eventData.away_team}</h2>
            <p style="color: var(--color-text-secondary);"><i class="fa-regular fa-clock"></i> ${new Date(eventData.commence_time).toLocaleString('es-ES', { dateStyle: 'long', timeStyle: 'short' })}</p>
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

// --- NAVEGACIÓN Y MENÚS ---
function handleActiveNav() {
    const navLinks = document.querySelectorAll('.main-nav ul a, #mobile-menu a');
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    
    navLinks.forEach(link => {
        const href = link.getAttribute('href');
        
        // Solo marcar como activo si el href coincide exactamente con la página actual
        // Excluir enlaces externos, de admin, y otros especiales
        if (href && 
            href.endsWith(currentPage) && 
            !href.includes('admin') && 
            !href.includes('#') &&
            !href.includes('http') &&
            href !== '#' &&
            currentPage !== 'index.html' || (currentPage === 'index.html' && href === './index.html' || href === '/index.html' || href === 'index.html')) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });
}

// En js/main.js

async function initSportsNav() {
    const sportsNavDesktop = document.querySelector('.main-container .sports-nav');
    const sportsPanelNav = document.querySelector('.sports-panel__nav');
    
    if (!sportsNavDesktop && !sportsPanelNav) return;

    try {
        const response = await fetch(`${API_BASE_URL}/sports`);
        if (!response.ok) throw new Error('Error de red');
        const sports = await response.json();
        
        // 1. MAPA DE ICONOS POR DEPORTE (Categorías)
        const categoryIcons = {
            'Soccer': 'fa-futbol',
            'Basketball': 'fa-basketball',
            'Baseball': 'fa-baseball-bat-ball',
            'American Football': 'fa-football',
            'Tennis': 'fa-table-tennis-paddle-ball',
            'Boxing': 'fa-mitten',
            'MMA': 'fa-hand-fist',
            'Ice Hockey': 'fa-hockey-puck',
            'Cricket': 'fa-bowling-ball',
            'Rugby': 'fa-rugby-ball',
            'Golf': 'fa-golf-ball-tee'
        };

        // 2. MAPA DE LOGOS ESPECÍFICOS POR LIGA (Aquí agregas tus imágenes)
        // La 'key' debe ser parte del nombre de la liga en inglés que viene de la API
        const leagueLogos = {
            'NBA': '/images/logos/nba.png',
            'MLB': '/images/logos/mlb.png',
            'NFL': '/images/logos/nfl.png',
            'La Liga': '/images/logos/laliga.png',
            'EPL': '/images/logos/premier.png', // Premier League
            'UEFA Champions': '/images/logos/ucl.png',
            'Serie A': '/images/logos/seriea.png',
            'Bundesliga': '/images/logos/bundesliga.png'
        };

        // Agrupar deportes
        const sportsGrouped = sports.reduce((acc, sport) => {
            if (!acc[sport.group]) acc[sport.group] = [];
            acc[sport.group].push(sport);
            return acc;
        }, {});
        
        let navHtml = Object.entries(sportsGrouped).map(([groupName, leagues]) => {
            const translatedGroupName = sportTranslations[groupName] || groupName;
            
            // Icono de la categoría
            let catIconClass = 'fa-trophy';
            for (const key in categoryIcons) {
                if (groupName.includes(key)) {
                    catIconClass = categoryIcons[key];
                    break;
                }
            }
            
            const leaguesHtml = leagues.map(sport => {
                const translatedTitle = sportTranslations[sport.title] || sport.title;
                
                // Buscamos si hay un logo específico para esta liga
                let leagueIconHtml = ''; // Por defecto nada
                let foundLogo = false;

                // Intentar encontrar imagen
                for (const [key, path] of Object.entries(leagueLogos)) {
                    if (sport.title.includes(key)) {
                        // Si existe la imagen, la ponemos
                        leagueIconHtml = `<img src="${path}" class="league-mini-icon" alt="${key}" onerror="this.style.display='none'">`;
                        foundLogo = true;
                        break;
                    }
                }

                // Si no hay imagen, ponemos un puntito de color o icono genérico pequeño
                if (!foundLogo) {
                    leagueIconHtml = `<i class="fa-solid fa-angle-right" style="font-size:0.8rem; opacity:0.5;"></i>`;
                }

                return `
                <li>
                    <a href="#" class="sport-link" data-sport-key="${sport.key}">
                        <span style="display:flex; align-items:center; gap:10px;">
                            ${leagueIconHtml} ${translatedTitle}
                        </span>
                    </a>
                </li>`;
            }).join('');

            return `
            <div class="nav-category">
                <div class="category-title accordion">
                    <div style="display:flex; align-items:center; gap:10px;">
                        <i class="fa-solid ${catIconClass}" style="width:20px; text-align:center; color:var(--color-primary);"></i> 
                        ${translatedGroupName}
                    </div>
                    <i class="fa-solid fa-chevron-down" style="font-size:0.8rem;"></i>
                </div>
                <ul class="submenu">${leaguesHtml}</ul>
            </div>`;
        }).join('');

        const content = `<div class="nav-container">${navHtml}</div>`;
        
        // Inyectar en el DOM
        if (sportsNavDesktop) {
            const searchHtml = `<div class="search-container"><i class="fa-solid fa-search"></i><input type="text" class="sport-search-input" placeholder="Buscar liga..."></div>`;
            sportsNavDesktop.innerHTML = searchHtml + content; 
        }
        if (sportsPanelNav) {
            sportsPanelNav.innerHTML = content;
        }
    } catch (error) { 
        console.error(error); 
    }
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

            category.style.display = (term.length === 0 || hasVisible) ? '' : 'none';

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

// --- SLIDER ---
function initGameSlider() {
    const sliderContainer = document.querySelector('.game-slider-container');
    if (!sliderContainer) return;
    
    const sliderWrapper = sliderContainer.querySelector('.slider-wrapper');
    const slides = Array.from(sliderWrapper.children);
    if (slides.length < 2) return;

    const dotsContainer = document.createElement('div');
    dotsContainer.className = 'slider-dots';
    sliderContainer.appendChild(dotsContainer);
    
    dotsContainer.innerHTML = slides.map((_, i) => `<div class="dot ${i === 0 ? 'active' : ''}" data-index="${i}"></div>`).join('');
    
    let currentIndex = 0;
    let autoPlayInterval;

    function goToSlide(index) {
        currentIndex = (index + slides.length) % slides.length;
        sliderWrapper.style.transform = `translateX(-${currentIndex * 100}%)`;
        Array.from(dotsContainer.children).forEach((dot, i) => {
            dot.classList.toggle('active', i === currentIndex);
        });
    }

    function resetAutoPlay() {
        clearInterval(autoPlayInterval);
        autoPlayInterval = setInterval(() => goToSlide(currentIndex + 1), 5000);
    }

    sliderContainer.addEventListener('click', (e) => {
        const nextBtn = e.target.closest('.next-btn');
        const prevBtn = e.target.closest('.prev-btn');
        const dot = e.target.closest('.dot');

        if (nextBtn) {
            goToSlide(currentIndex + 1);
            resetAutoPlay();
        } else if (prevBtn) {
            goToSlide(currentIndex - 1);
            resetAutoPlay();
        } else if (dot) {
            goToSlide(parseInt(dot.dataset.index));
            resetAutoPlay();
        }
    });

    slides.forEach(slide => {
        if(slide.dataset.background) slide.style.backgroundImage = `url('${slide.dataset.background}')`;
    });
    
    resetAutoPlay();
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
            card.style.display = (filterValue === 'all' || categories.includes(filterValue)) ? 'flex' : 'none';
        });
    });
}

// --- GESTOR DE EVENTOS GLOBAL ---
function setupEventListeners() {
    document.body.addEventListener('click', async (event) => {
        const target = event.target;

        // 1. Menú Móvil
        if (target.closest('#mobile-menu-toggle, .close-menu-btn')) {
            const mobileMenu = document.getElementById('mobile-menu');
            if (mobileMenu) {
                const isOpen = mobileMenu.classList.toggle('is-open');
                const toggleBtn = document.getElementById('mobile-menu-toggle');
                if(toggleBtn) toggleBtn.classList.toggle('is-active', isOpen);
                document.body.classList.toggle('panel-open', isOpen);
            }
            return;
        }

        // 2. Navegación Móvil
        if (target.closest('#mobile-menu a')) {
            document.getElementById('mobile-menu').classList.remove('is-open');
            document.body.classList.remove('panel-open');
        }

        // 3. ACORDEÓN DEPORTES
        const accordion = target.closest('.accordion');
        if (accordion) {
            const submenu = accordion.nextElementSibling;
            const parentNav = accordion.closest('.sports-nav') || accordion.closest('.sports-panel__nav');
            
            // Cerrar otros acordeones
            if (parentNav) {
                parentNav.querySelectorAll('.accordion.active').forEach(activeAcc => {
                    if (activeAcc !== accordion) {
                        activeAcc.classList.remove('active');
                        if (activeAcc.nextElementSibling) {
                            activeAcc.nextElementSibling.style.maxHeight = null;
                        }
                    }
                });
            }

            const isActive = accordion.classList.contains('active');
            if (isActive) {
                accordion.classList.remove('active');
                if(submenu) submenu.style.maxHeight = null;
            } else {
                accordion.classList.add('active');
                if(submenu) submenu.style.maxHeight = submenu.scrollHeight + 'px';
            }
            return;
        }

        // 4. Panel Deportes Móvil
        if (target.closest('#mobile-sports-panel-trigger, #close-sports-panel-btn')) {
            event.preventDefault();
            const sportsPanel = document.getElementById('sports-panel');
            const isOpen = sportsPanel?.classList.toggle('is-open');
            document.body.classList.toggle('panel-open', isOpen);
            return;
        }

        // 5. Cargar Liga
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
            
            const liveCont = document.getElementById('live-events-container');
            const upCont = document.getElementById('upcoming-events-container');
            const spinner = '<div class="loader-container"><div class="spinner"></div></div>';
            
            if(liveCont) liveCont.innerHTML = spinner;
            if(upCont) upCont.innerHTML = spinner;

            try {
                const events = await fetchLiveEvents(sportKey);
                renderEvents(events);
            } catch (error) {
                console.error(error);
                if(liveCont) liveCont.innerHTML = '<div class="initial-message"><p class="error-message">Error cargando datos. Intenta de nuevo.</p></div>';
                if(upCont) upCont.innerHTML = '';
            }
            return;
        }

        // 6. Apostar
        const oddsButton = target.closest('.odds-button');
        if (oddsButton) {
            const isLoggedIn = localStorage.getItem('fortunaUser');
            if (!isLoggedIn) {
                openModal(document.getElementById('login-modal'));
                return;
            }
            addBet({ 
                team: oddsButton.dataset.team, 
                odds: parseFloat(oddsButton.dataset.odds), 
                id: `${oddsButton.dataset.team}-${oddsButton.dataset.odds}` 
            });
            return;
        }

        // 7. Cupón Móvil (Abrir)
        if (target.closest('#open-mobile-slip') || target.closest('#mobile-bet-notification')) {
            const betSlip = document.querySelector('.bet-slip');
            if (betSlip) {
                betSlip.classList.add('active'); 
                document.body.classList.add('panel-open'); 
            }
            return;
        }

        // 8. Cupón Móvil (Cerrar)
        if (target.closest('#close-mobile-slip')) {
            const betSlip = document.querySelector('.bet-slip');
            if (betSlip) {
                betSlip.classList.remove('active');
                document.body.classList.remove('panel-open'); 
            }
            return;
        }

        // 9. Detalle Evento
        const detailLink = target.closest('.event-detail-link');
        if (detailLink) {
            event.preventDefault();
            const { eventId, sportKey } = detailLink.dataset;
            document.getElementById('live-events-container').innerHTML = '<div class="loader-container"><div class="spinner"></div></div>';
            
            try {
                const eventData = await fetchEventDetails(sportKey, eventId);
                renderEventDetail(eventData);
                switchView('#event-detail-view');
            } catch (error) { console.error(error); }
            return;
        }

        // 10. Volver a lista
        if (target.closest('#back-to-list-btn')) {
            event.preventDefault();
            document.querySelector('#event-detail-view').classList.add('hidden');
            document.querySelector('.event-tabs').classList.remove('hidden');
            document.querySelector('.tab-content.active')?.classList.remove('hidden');
            switchView('#live');
            return;
        }
        
        // 11. Casino Link
        const gameCard = target.closest('.game-card[data-game-url]');
        if (gameCard) {
            event.preventDefault();
            if (!localStorage.getItem('fortunaUser')) {
                openModal(document.getElementById('login-modal'));
            } else {
                const gameUrl = gameCard.dataset.gameUrl;
                const gameModal = document.getElementById('game-modal');
                const iframe = document.getElementById('game-iframe');
                if(iframe) iframe.src = gameUrl;
                if(gameModal) openModal(gameModal);
            }
            return;
        }

        // 12. Tabs
        const tabLink = target.closest('.tab-link');
        if (tabLink) {
            if (tabLink.classList.contains('active')) return;
            document.querySelectorAll('.tab-link').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            
            tabLink.classList.add('active');
            document.getElementById(tabLink.dataset.tab).classList.add('active');
            return;
        }
    });

    // BÚSQUEDA
    document.body.addEventListener('input', (event) => {
        if (event.target.classList.contains('sport-search-input')) {
            handleSearch(event.target.value);
        }
    });
}

// --- FORMULARIO DE CONTACTO (NUEVO) ---
function initContactForm() {
    const contactForm = document.getElementById('contact-form');
    if (!contactForm) return;

    contactForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const submitBtn = contactForm.querySelector('button[type="submit"]');
        if(submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = "Enviando...";
        }
        
        // Simulación de envío
        setTimeout(() => {
            showToast('¡Mensaje enviado! Te contactaremos pronto.', 'success');
            contactForm.reset();
            if(submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = "Enviar Mensaje";
            }
        }, 1500);
    });
}
// --- FUNCIÓN PARA LA HOME: ACCIÓN DEL DÍA ---
// En js/main.js

async function loadHomeFeaturedEvents() {
    const container = document.getElementById('featured-events-container');
    const loader = document.getElementById('loader-featured');
    
    if (!container) return;

    try {
        // Pedimos una liga popular
        const events = await fetchLiveEvents('soccer_uefa_champs_league'); // O 'soccer_spain_la_liga'
        
        if (loader) loader.style.display = 'none';

        if (!events || events.length === 0) {
            container.innerHTML = '<p style="text-align:center; color:#777; width:100%;">No hay eventos destacados en este momento.</p>';
            return;
        }

        // Función para obtener iniciales (Ej: "Real Madrid" -> "RM")
        const getInitials = (name) => {
            return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
        };

        // Generar colores aleatorios fijos para avatares (opcional)
        const colors = ['#e74c3c', '#3498db', '#9b59b6', '#f1c40f', '#2ecc71', '#e67e22'];
        
        const featured = events.slice(0, 3); // Solo 3 tarjetas

        container.innerHTML = featured.map((event, index) => {
            const teamNames = event.teams.split(' vs ');
            const home = teamNames[0];
            const away = teamNames[1] || '';
            const date = new Date(event.commence_time).toLocaleDateString('es-ES', {weekday:'short', day:'numeric', hour:'2-digit', minute:'2-digit'});
            
            // Color aleatorio basado en el nombre
            const color1 = colors[home.length % colors.length];
            const color2 = colors[away.length % colors.length];

            return `
            <div class="match-card">
                <div class="match-header">
                    <span><i class="fa-solid fa-futbol"></i> Champions League</span>
                    ${event.is_live ? '<span class="live-badge">● EN VIVO</span>' : `<span>${date}</span>`}
                </div>

                <div class="match-teams">
                    <div class="team">
                        <div class="team-avatar" style="background: linear-gradient(135deg, ${color1}, #222);">${getInitials(home)}</div>
                        <span class="team-name">${home}</span>
                    </div>
                    <div class="vs-badge">VS</div>
                    <div class="team">
                        <div class="team-avatar" style="background: linear-gradient(135deg, ${color2}, #222);">${getInitials(away)}</div>
                        <span class="team-name">${away}</span>
                    </div>
                </div>

                <div class="match-odds">
                    <div class="odd-btn odds-button" data-team="${home}" data-odds="${event.odds.home}">
                        <span class="odd-label">1</span>
                        <span class="odd-value">${event.odds.home}</span>
                    </div>
                    <div class="odd-btn odds-button" data-team="Empate" data-odds="${event.odds.draw}">
                        <span class="odd-label">X</span>
                        <span class="odd-value">${event.odds.draw}</span>
                    </div>
                    <div class="odd-btn odds-button" data-team="${away}" data-odds="${event.odds.away}">
                        <span class="odd-label">2</span>
                        <span class="odd-value">${event.odds.away}</span>
                    </div>
                </div>
            </div>
            `;
        }).join('');

    } catch (error) {
        console.error("Error home events:", error);
        if(loader) loader.style.display = 'none';
    }
}
// --- MAIN ---
async function main() {
    document.body.classList.remove('modal-open', 'panel-open');
    
    await initSharedComponents();
    handleActiveNav();
    // Asegura que ningún modal quede abierto por defecto al cargar componentes
    document.querySelectorAll('.modal-overlay')?.forEach(m => m.classList.remove('active'));
    document.body.classList.remove('modal-open');
    
    // Asegurar específicamente que el modal de ayuda esté oculto
    const helpModal = document.getElementById('help-modal');
    if (helpModal) {
        helpModal.classList.remove('active');
        helpModal.style.display = 'none';
    }
    
    initModals();
    initAuth();
    initGameSlider();
    initCasinoFilters();
    initBetSlip();
    initHelpWidget();
    initPaymentModals();    
    initContactForm(); // <-- AHORA SÍ ESTÁ DEFINIDA
    loadHomeFeaturedEvents(); 
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
            const container = document.getElementById('live-events-container');
            if(container) {
                container.innerHTML = `
                    <div class="initial-message" style="text-align: center; padding: 60px 20px;">
                        <i class="fa-solid fa-trophy" style="font-size: 4rem; color: var(--color-primary); margin-bottom: 20px; opacity: 0.8;"></i>
                        <h2 style="font-size: 1.8rem; margin-bottom: 10px;">¡Bienvenido a la Zona de Deportes!</h2>
                        <p style="color: var(--color-text-secondary); max-width: 400px; margin: 0 auto 20px;">
                            Selecciona una liga del menú de la izquierda para ver los partidos.
                        </p>
                    </div>`;
            }
            document.getElementById('upcoming-events-container').innerHTML = '';
        }
    } else if (window.location.pathname.includes('mi-cuenta')) {
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