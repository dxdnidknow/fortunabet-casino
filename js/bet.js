// Archivo: js/bet.js

import { showToast } from './ui.js';
import { fetchWithAuth } from './auth.js';
import { API_BASE_URL } from './config.js';
import { openModal } from './modal.js';

let bets = JSON.parse(localStorage.getItem('fortunaBetCoupon')) || [];
const subscribers = [];

// Permite a otros módulos saber cuando cambian las apuestas (ej. para pintar los botones de cuotas)
export function subscribe(callback) {
    if (typeof callback === 'function') {
        subscribers.push(callback);
    }
}

function notify() {
    subscribers.forEach(callback => callback());
}

export function getBets() {
    return [...bets];
}

// --- NUEVO: Controla la barra flotante en móvil ---
function updateMobileUI() {
    const mobileBar = document.getElementById('mobile-bet-notification');
    const countSpan = document.getElementById('mobile-bet-count');
    
    if (mobileBar && countSpan) {
        countSpan.textContent = bets.length;
        
        // LÓGICA CRÍTICA: Solo mostrar si hay más de 0 apuestas
        if (bets.length > 0) {
            mobileBar.classList.add('active');
        } else {
            mobileBar.classList.remove('active');
            
            // Si vaciamos el cupón, también cerramos la ventana del cupón si está abierta
            const betSlip = document.querySelector('.bet-slip');
            if (betSlip && betSlip.classList.contains('active')) {
                betSlip.classList.remove('active');
                document.body.classList.remove('modal-open');
            }
        }
    }
}

function renderBetSlip() {
    const betListEl = document.getElementById('bet-list');
    const emptyMessageEl = document.querySelector('.bet-slip .empty-message');
    
    // Si no estamos en una página con cupón, salimos, pero intentamos actualizar la UI móvil por si acaso
    if (!betListEl || !emptyMessageEl) {
        updateMobileUI();
        return;
    }

    betListEl.innerHTML = '';
    
    if (bets.length === 0) {
        emptyMessageEl.style.display = 'block';
    } else {
        emptyMessageEl.style.display = 'none';
        bets.forEach(bet => {
            const betItem = document.createElement('li');
            betItem.className = 'bet-item';
            betItem.innerHTML = `
                <div class="bet-item-info">
                    <span style="display:block; font-weight:500; margin-bottom:4px;">${bet.team}</span>
                    <span class="bet-item-odds">Cuota: ${bet.odds.toFixed(2)}</span>
                </div>
                <button class="remove-bet-btn" data-id="${bet.id}" aria-label="Eliminar apuesta">
                    <i class="fa-solid fa-times"></i>
                </button>
            `;
            betListEl.appendChild(betItem);
        });
    }
    
    calculateWinnings();
    updateMobileUI(); // Actualizamos la barra móvil cada vez que se renderiza el cupón
}

function calculateWinnings() {
    const stakeInputEl = document.querySelector('.stake-input');
    const winningsEl = document.getElementById('potential-winnings');
    
    if (!winningsEl || !stakeInputEl) return;

    if (bets.length === 0) {
        winningsEl.textContent = 'Bs. 0.00';
        // Opcional: limpiar input al vaciar cupón
        // stakeInputEl.value = ''; 
        return;
    }

    const stake = parseFloat(stakeInputEl.value) || 0;
    
    // Calculamos cuota total (multiplicando todas las cuotas)
    const totalOdds = bets.reduce((acc, bet) => acc * bet.odds, 1);
    const potentialWinnings = stake * totalOdds;
    
    winningsEl.textContent = `Bs. ${potentialWinnings.toFixed(2)}`;
    
    // Efecto visual de actualización
    winningsEl.classList.remove('highlight'); 
    void winningsEl.offsetWidth; // Trigger reflow
    winningsEl.classList.add('highlight');
}

function saveBetsToLocalStorage() {
    localStorage.setItem('fortunaBetCoupon', JSON.stringify(bets));
}

export function addBet(betInfo) {
    // Lógica para evitar duplicados o cambiar apuesta del mismo partido
    // Asumimos que el ID o el nombre del equipo contiene info única del evento
    // Nota: Para producción, idealmente betInfo debería traer un eventId separado.
    
    const existingBetIndex = bets.findIndex(bet => bet.team === betInfo.team);
    
    // Si ya existe exactamente la misma apuesta, la quitamos (toggle)
    if (existingBetIndex !== -1) {
        bets.splice(existingBetIndex, 1);
        showToast('Selección eliminada del cupón');
    } else {
        // Buscamos si hay otra apuesta del MISMO partido (para reemplazarla)
        // Esto asume que el nombre viene como "Equipo A vs Equipo B - Gana A"
        // Una lógica más robusta requeriría IDs de evento.
        // Por ahora, simplemente agregamos.
        
        bets.push({ ...betInfo, id: betInfo.id || Date.now() });
        showToast('Selección añadida al cupón', 'success');
    }
    
    saveBetsToLocalStorage(); 
    renderBetSlip();
    notify();
}

function removeBetById(betIdToRemove) {
    bets = bets.filter(bet => bet.id.toString() !== betIdToRemove.toString());
    saveBetsToLocalStorage();
    showToast('Apuesta eliminada');
    renderBetSlip();
    notify();
}

export function initBetSlip() {
    const betSlip = document.querySelector('.bet-slip');
    
    // Render inicial (importante para recuperar apuestas de localStorage al recargar)
    renderBetSlip(); 

    // Listener para el input de monto
    betSlip?.querySelector('.stake-input')?.addEventListener('input', calculateWinnings);
    
    // Listener delegado para borrar apuestas
    betSlip?.querySelector('#bet-list')?.addEventListener('click', (event) => {
        const btn = event.target.closest('.remove-bet-btn');
        if (btn) {
            const id = btn.dataset.id;
            removeBetById(id);
        }
    });

    // Listener para el botón "Realizar Apuesta"
    document.getElementById('place-bet-btn')?.addEventListener('click', async () => {
        const stakeInput = document.querySelector('.stake-input');
        const stake = parseFloat(stakeInput.value) || 0;
        const placeBetBtn = document.getElementById('place-bet-btn');

        if (bets.length === 0) {
            showToast('El cupón está vacío.', 'error');
            return;
        }
        if (stake <= 0) {
            showToast('Ingresa un monto válido para apostar.', 'error');
            return;
        }

        const currentUser = localStorage.getItem('fortunaUser');
        if (!currentUser) {
            showToast('Debes iniciar sesión para apostar.', 'info');
            const loginModal = document.getElementById('login-modal');
            if(loginModal) openModal(loginModal);
            return;
        }

        const originalBtnText = placeBetBtn.innerHTML;
        placeBetBtn.disabled = true;
        placeBetBtn.innerHTML = '<div class="spinner-sm"></div>';

        try {
            // Enviamos al backend
            const data = await fetchWithAuth(`${API_BASE_URL}/user/place-bet`, {
                method: 'POST',
                body: JSON.stringify({
                    bets: bets,
                    stake: stake
                })
            });
            
            showToast(data.message || '¡Apuesta realizada con éxito!', 'success');

            // Limpiamos cupón
            bets = [];
            if(stakeInput) stakeInput.value = '';
            saveBetsToLocalStorage();
            renderBetSlip();
            notify();

        } catch (error) {
            showToast(error.message || 'Error al procesar la apuesta', 'error');
        } finally {
            if(placeBetBtn) {
                placeBetBtn.disabled = false;
                placeBetBtn.innerHTML = originalBtnText;
            }
        }
    });

    // --- NUEVO: Listener para el botón flotante en móvil ---
    const mobileBar = document.getElementById('mobile-bet-notification');
    if (mobileBar) {
        mobileBar.addEventListener('click', (e) => {
            // Solo si se hace clic en el botón o en la barra
            if (e.target.closest('#open-mobile-slip') || e.target.closest('.bet-info')) {
                const betSlipEl = document.querySelector('.bet-slip');
                if (betSlipEl) {
                    // En CSS móvil, .bet-slip suele estar oculto (display:none).
                    // Lo forzamos a mostrarse o hacemos scroll hacia él si está abajo.
                    // Dependiendo de tu CSS, aquí podrías abrir un modal con el cupón,
                    // o hacer scroll. Asumiendo la estructura actual:
                    
                    betSlipEl.style.display = 'flex'; // Forzamos mostrarlo en móvil
                    betSlipEl.scrollIntoView({ behavior: 'smooth' });
                }
            }
        });
    }
}