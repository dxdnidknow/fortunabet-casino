// Archivo: js/main.js (VERSIÓN FINAL COMPLETA)

import { addBet, initBetSlip, subscribe, getBets } from './bet.js';
import { initModals } from './modal.js';
import { initSharedComponents } from './loader.js';
import { fetchLiveEvents, fetchEventDetails } from './api.js';
import { initAuth } from './auth.js';
import { initAccountDashboard, renderBetHistory } from './account.js';
import { sportTranslations } from './translations.js';
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

    if (liveEvents.length > 0) {
        tabLive.classList.add('active');
        contentLive.classList.add('active');
        tabUpcoming.classList.remove('active');
        contentUpcoming.classList.remove('active');
    } else if (upcomingEvents.length > 0) {
        tabLive.classList.remove('active');
        contentLive.classList.remove('active');
        tabUpcoming.classList.add('active');
        contentUpcoming.classList.add('active');
    } else {
        tabLive.classList.add('active');
        contentLive.classList.add('active');
        tabUpcoming.classList.remove('active');
        contentUpcoming.classList.remove('active');
    }
    
    updateFavoritesUI();
    updateSelectedOddsUI();
}
// Nueva función para el homepage
async function loadFeaturedEvents() {
    const container = document.getElementById('featured-events-container');
    const loader = document.getElementById('loader-featured');
    if (!container || !loader) return;

    try {
        // Pedimos eventos de una liga popular, por ejemplo, la Premier League de Inglaterra
        const events = await fetchLiveEvents('soccer_epl');
        
        if (events && events.length > 0) {
            // Mostramos solo los primeros 6 partidos
            const featured = events.slice(0, 6); 
            container.innerHTML = featured.map(renderEventCard).join('');
            // Importante: Llama a esto para que los botones de cuotas funcionen
            updateSelectedOddsUI(); 
        } else {
            container.innerHTML = '<p class="empty-message">No hay partidos destacados disponibles en este momento.</p>';
        }
    } catch (error) {
        container.innerHTML = '<p class="error-message">No se pudieron cargar los partidos.</p>';
    } finally {
        loader.style.display = 'none'; // Ocultamos el loader
    }
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
            return `<div class="market-container">
                        <h3 class="market-title"><i class="fa-solid ${icon}"></i> ${market.key.replace(/_/g, ' ')}</h3>
                        <div class="market-odds-grid">${outcomesHtml}</div>
                    </div>`;
        }).join('');
    } else {
        marketsHtml = '<p class="empty-message">No hay mercados disponibles para este evento.</p>';
    }

    detailView.innerHTML = `
        <div class="event-detail-header">
            <button id="back-to-list-btn" class="btn btn-secondary">&lt; Volver a la lista</button>
            <h2>${eventData.home_team} vs ${eventData.away_team}</h2>
            <p>${new Date(eventData.commence_time).toLocaleString('es-ES', { dateStyle: 'long', timeStyle: 'short' })}</p>
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
    if (liveContainer) {
        liveContainer.innerHTML = `<div class="initial-message"><i class="fa-solid fa-arrow-left"></i><h2>Bienvenido a FortunaBet</h2><p>Selecciona un deporte o una liga del menú para ver los partidos disponibles.</p></div>`;
    }
    if (upcomingContainer) upcomingContainer.innerHTML = '';
    document.getElementById('loader-live')?.style.setProperty('display', 'none');
    document.getElementById('loader-upcoming')?.style.setProperty('display', 'none');
}

function handleSearch(searchTerm) {
    const term = searchTerm.toLowerCase().trim();
    const navContainers = document.querySelectorAll('.sports-nav .nav-container, .sports-panel__nav .nav-container');

    navContainers.forEach(container => {
        let firstResultCategory = null;

        const categories = container.querySelectorAll('.nav-category');

        categories.forEach(category => {
            const links = category.querySelectorAll('.sport-link');
            const accordionHeader = category.querySelector('.accordion');
            const submenu = category.querySelector('.submenu');
            let categoryHasVisibleLinks = false;

            links.forEach(link => {
                const linkText = link.textContent.toLowerCase();
                const listItem = link.closest('li');
                const matches = linkText.includes(term);
                
                listItem.style.display = matches ? '' : 'none';
                
                if (matches) {
                    categoryHasVisibleLinks = true;
                }
            });

            if (term.length === 0 || categoryHasVisibleLinks) {
                category.style.display = '';
                if (categoryHasVisibleLinks && !firstResultCategory) {
                    firstResultCategory = category;
                }
            } else {
                category.style.display = 'none';
            }

            if (term.length > 0 && categoryHasVisibleLinks) {
                accordionHeader.classList.add('active');
                submenu.style.maxHeight = submenu.scrollHeight + 'px';
            } else {
                accordionHeader.classList.remove('active');
                submenu.style.maxHeight = null;
            }
        });

        if (firstResultCategory) {
            const scrollTop = firstResultCategory.offsetTop - container.offsetTop;
            container.scrollTo({ top: scrollTop, behavior: 'smooth' });
        }

        let noResultsMessage = container.querySelector('.no-results-message');
        const resultsFound = firstResultCategory !== null;

        if (!resultsFound && term.length > 0) {
            if (!noResultsMessage) {
                noResultsMessage = document.createElement('p');
                noResultsMessage.className = 'no-results-message empty-message';
                noResultsMessage.textContent = 'No se encontraron ligas.';
                container.appendChild(noResultsMessage);
            }
        } else if (noResultsMessage) {
            noResultsMessage.remove();
        }
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

    const dotsContainer = sliderContainer.querySelector('.slider-dots');
    dotsContainer.innerHTML = slides.map((_, i) => `<div class="dot ${i === 0 ? 'active' : ''}" data-index="${i}"></div>`).join('');
    const dots = dotsContainer.querySelectorAll('.dot');
    
    let currentIndex = 0;
    let autoPlayInterval;

    function goToSlide(index) {
        currentIndex = (index + slides.length) % slides.length;
        sliderWrapper.style.transform = `translateX(-${currentIndex * 100}%)`;
        dots.forEach((dot, i) => dot.classList.toggle('active', i === currentIndex));
    }

    function startAutoPlay() {
        clearInterval(autoPlayInterval);
        autoPlayInterval = setInterval(() => goToSlide(currentIndex + 1), 5000);
    }

    sliderContainer.addEventListener('click', (e) => {
        if (e.target.closest('.next-btn')) goToSlide(currentIndex + 1);
        if (e.target.closest('.prev-btn')) goToSlide(currentIndex - 1);
        if (e.target.matches('.dot')) goToSlide(parseInt(e.target.dataset.index));
        if (e.target.closest('.slider-btn, .dot')) startAutoPlay();
    });

    startAutoPlay();
}

function setupEventListeners() {
    document.body.addEventListener('click', async (event) => {
        const target = event.target;

        if (target.closest('#mobile-menu-toggle, .close-menu-btn')) {
            const mobileMenu = document.getElementById('mobile-menu');
            const toggleBtn = document.getElementById('mobile-menu-toggle');
            if (!mobileMenu || !toggleBtn) return;
            const isOpen = mobileMenu.classList.toggle('is-open');
            toggleBtn.classList.toggle('is-active', isOpen);
            toggleBtn.setAttribute('aria-expanded', String(isOpen));
            const icon = toggleBtn.querySelector('i');
            if (icon) {
                icon.classList.toggle('fa-bars', !isOpen);
                icon.classList.toggle('fa-times', isOpen);
            }
            document.body.classList.toggle('panel-open', isOpen);
            return;
        }

        if (target.closest('#mobile-sports-panel-trigger, #close-sports-panel-btn')) {
            event.preventDefault();
            const sportsPanel = document.getElementById('sports-panel');
            if (!sportsPanel) return;
            const isOpen = sportsPanel.classList.toggle('is-open');
            document.body.classList.toggle('panel-open', isOpen);
            return;
        }

        const sportLink = target.closest('.sport-link');
        if (sportLink) {
            event.preventDefault();
            document.getElementById('sports-panel')?.classList.remove('is-open');
            document.body.classList.remove('panel-open');

            if (!window.location.pathname.includes('deportes.html')) {
                window.location.href = `deportes.html?sport=${sportLink.dataset.sportKey}`;
                return;
            }
            
            const sportKey = sportLink.dataset.sportKey;
            
            document.getElementById('live-events-container').innerHTML = '';
            document.getElementById('upcoming-events-container').innerHTML = '';
            document.querySelectorAll('#loader-live, #loader-upcoming').forEach(l => l?.style.setProperty('display', 'flex'));
            
            const events = await fetchLiveEvents(sportKey);
            
            document.querySelectorAll('#loader-live, #loader-upcoming').forEach(l => l?.style.setProperty('display', 'none'));
            renderEvents(events);
            document.querySelectorAll('.sport-link.active').forEach(link => link.classList.remove('active'));
            sportLink.classList.add('active');
            return;
        }

        const tabLink = target.closest('.tab-link');
        if (tabLink) {
            if (tabLink.classList.contains('active')) return;
            document.querySelector('.tab-link.active')?.classList.remove('active');
            document.querySelector('.tab-content.active')?.classList.remove('active');
            tabLink.classList.add('active');
            document.getElementById(tabLink.dataset.tab)?.classList.add('active');
            return;
        }
        
        const oddsButton = target.closest('.odds-button');
        if (oddsButton) {
            addBet({ team: oddsButton.dataset.team, odds: parseFloat(oddsButton.dataset.odds), id: `${oddsButton.dataset.team}-${oddsButton.dataset.odds}` });
            return;
        }

        const accordion = target.closest('.accordion');
        if (accordion) {
            const parentNav = accordion.closest('.sports-nav, .sports-panel__nav');
            const submenu = accordion.nextElementSibling;
            const isActive = accordion.classList.contains('active');

            if (parentNav) {
                parentNav.querySelectorAll('.accordion.active').forEach(activeAccordion => {
                    if (activeAccordion !== accordion) {
                        activeAccordion.classList.remove('active');
                        activeAccordion.nextElementSibling.style.maxHeight = null;
                    }
                });
            }

            if (!isActive && submenu) {
                accordion.classList.add('active');
                submenu.style.maxHeight = submenu.scrollHeight + 'px';
            } else if (submenu) {
                accordion.classList.remove('active');
                submenu.style.maxHeight = null;
            }
            return;
        }

        const detailLink = target.closest('.event-detail-link');
        if (detailLink) {
            event.preventDefault();
            const { eventId, sportKey } = detailLink.dataset;
            document.getElementById('loader-live')?.style.setProperty('display', 'flex');
            try {
                const eventData = await fetchEventDetails(sportKey, eventId);
                renderEventDetail(eventData);
                switchView('#event-detail-view');
            } catch (error) { console.error("Error al obtener detalles:", error); } 
            finally { document.getElementById('loader-live')?.style.setProperty('display', 'none'); }
            return;
        }

        const backButton = target.closest('#back-to-list-btn');
        if (backButton) {
            event.preventDefault();
            const activeSportKey = document.querySelector('.sport-link.active')?.dataset.sportKey;
            if (activeSportKey) {
                const loader = document.getElementById('loader-live');
                if (loader) loader.style.display = 'flex';
                const events = await fetchLiveEvents(activeSportKey);
                if (loader) loader.style.display = 'none';
                renderEvents(events);
            }
            document.querySelector('.event-tabs').classList.remove('hidden');
            document.querySelector('#event-detail-view').classList.add('hidden');
            return;
        }
        
        const gameCard = target.closest('.game-card');
        if (gameCard) {
            event.preventDefault();
            const currentUser = localStorage.getItem('fortunaUser');
            
            if (!currentUser) {
                // Si no hay usuario, abrimos el modal de login (reutilizamos la lógica)
                const loginModal = document.getElementById('login-modal');
                if (loginModal) {
                    loginModal.classList.add('active');
                    document.body.classList.add('modal-open');
                }
            } else {
                // Si hay usuario, abrimos el juego
                const gameUrl = gameCard.dataset.gameUrl;
                if (gameUrl) {
                    const gameModal = document.getElementById('game-modal');
                    const gameIframe = document.getElementById('game-iframe');
                    
                    gameIframe.src = gameUrl; // Cargamos la URL del juego en el iframe
                    gameModal.classList.add('active');
                    document.body.classList.add('modal-open');
                }
            }
            return;
        }
    });

    document.body.addEventListener('input', (event) => {
        const searchInput = event.target.closest('.sport-search-input');
        if (searchInput) {
            handleSearch(searchInput.value);
        }
    });
}

async function main() {
    await initSharedComponents();
    
    initModals();
    initAuth();
    handleActiveNav();
    initGameSlider();
    initBetSlip();
    initHelpWidget();
    
    await initSportsNav();
    setupEventListeners();
    subscribe(updateSelectedOddsUI);

    if (window.location.pathname.includes('deportes.html')) {
        showInitialMessage();
    }
    
    if (window.location.pathname.includes('mi-cuenta.html')) {
        const loggedInUser = localStorage.getItem('fortunaUser');
        
        if (!loggedInUser) {
            const dashboard = document.querySelector('.account-dashboard-grid');
            if (dashboard) dashboard.style.display = 'none';
            document.querySelector('h1.page-title').style.display = 'none';
            
            setTimeout(() => {
                const registerModal = document.getElementById('register-modal');
                if (registerModal) {
                    registerModal.classList.add('active');
                    document.body.classList.add('modal-open');
                }
            }, 100);

        } else {
            initAccountDashboard();
            renderBetHistory();
        }
    }
    if (document.getElementById('featured-events-container')) {
        loadFeaturedEvents();
    }
}

document.addEventListener('DOMContentLoaded', main);