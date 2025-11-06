// Archivo: js/bet.js (MODIFICADO Y COMPLETO)

import { showToast } from './ui.js';
import { fetchWithAuth } from './auth.js';
import { API_BASE_URL } from './config.js';
import { openModal } from './modal.js';

let bets = JSON.parse(localStorage.getItem('fortunaBetCoupon')) || [];

const subscribers = [];

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

function renderBetSlip() {
    const betListEl = document.getElementById('bet-list');
    const emptyMessageEl = document.querySelector('.bet-slip .empty-message');
    
    if (!betListEl || !emptyMessageEl) return;

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
                    <span>${bet.team}</span>
                    <span class="bet-item-odds">@ ${bet.odds.toFixed(2)}</span>
                </div>
                <button class="remove-bet-btn" data-id="${bet.id}" aria-label="Eliminar apuesta de ${bet.team}">×</button>
            `;
            betListEl.appendChild(betItem);
        });
    }
    
    calculateWinnings();
}

function calculateWinnings() {
    const stakeInputEl = document.querySelector('.stake-input');
    const winningsEl = document.getElementById('potential-winnings');
    if (!winningsEl || !stakeInputEl) return;

    if (bets.length === 0) {
        winningsEl.textContent = 'Bs. 0.00';
        stakeInputEl.value = '';
        return;
    }
    const stake = parseFloat(stakeInputEl.value) || 0;
    
    const totalOdds = bets.reduce((acc, bet) => acc * bet.odds, 1);
    const potentialWinnings = stake * totalOdds;
    
    winningsEl.textContent = `Bs. ${potentialWinnings.toFixed(2)}`;
    
    winningsEl.classList.remove('highlight'); 
    void winningsEl.offsetWidth; 
    winningsEl.classList.add('highlight');
}

function saveBetsToLocalStorage() {
    localStorage.setItem('fortunaBetCoupon', JSON.stringify(bets));
}

export function addBet(betInfo) {
    const existingBetIndex = bets.findIndex(bet => bet.team.split(' - ')[0] === betInfo.team.split(' - ')[0]);
    
    if (existingBetIndex !== -1) {
        if (bets[existingBetIndex].id === betInfo.id) {
            bets.splice(existingBetIndex, 1);
            showToast('Selección eliminada del cupón');
        } else {
            bets[existingBetIndex] = { ...betInfo, id: betInfo.id || Date.now() };
            showToast('Selección actualizada en el cupón');
        }
    } else {
        bets.push({ ...betInfo, id: betInfo.id || Date.now() });
        showToast('Selección añadida al cupón');
    }
    
    saveBetsToLocalStorage(); 
    renderBetSlip();
    notify();
}

function removeBetById(betIdToRemove) {
    bets = bets.filter(bet => bet.id.toString() !== betIdToRemove.toString());
    saveBetsToLocalStorage();
    showToast('Apuesta eliminada del cupón');
    renderBetSlip();
    notify();
}

export function initBetSlip() {
    const betSlip = document.querySelector('.bet-slip');
    if (!betSlip) return;

    renderBetSlip(); 

    betSlip.querySelector('.stake-input')?.addEventListener('input', calculateWinnings);
    
    betSlip.querySelector('#bet-list')?.addEventListener('click', (event) => {
        if (event.target.classList.contains('remove-bet-btn')) {
            const id = event.target.dataset.id;
            removeBetById(id);
        }
    });

    document.getElementById('place-bet-btn')?.addEventListener('click', async () => {
        const stakeInput = document.querySelector('.stake-input');
        const stake = parseFloat(stakeInput.value) || 0;
        const placeBetBtn = document.getElementById('place-bet-btn');

        if (bets.length === 0) {
            showToast('Añade al menos una selección al cupón.', 'error');
            return;
        }
        if (stake <= 0) {
            showToast('Ingresa un monto válido para apostar.', 'error');
            return;
        }

        const currentUser = localStorage.getItem('fortunaUser');
        if (!currentUser) {
            showToast('Debes iniciar sesión para realizar una apuesta.', 'info');
            openModal(document.getElementById('login-modal'));
            return;
        }

        const originalBtnText = placeBetBtn.innerHTML;
        placeBetBtn.disabled = true;
        placeBetBtn.innerHTML = '<span class="spinner-sm"></span> Apostando...';

        try {
            const response = await fetchWithAuth(`${API_BASE_URL}/user/place-bet`, {
                method: 'POST',
                body: JSON.stringify({
                    bets: bets,
                    stake: stake
                })
            });
            
            const data = await response.json();
            if (!response.ok) throw new Error(data.message);

            showToast(data.message, 'success');

            bets = [];
            saveBetsToLocalStorage();
            renderBetSlip();
            notify();

        } catch (error) {
            showToast(error.message, 'error');
        } finally {
            placeBetBtn.disabled = false;
            placeBetBtn.innerHTML = originalBtnText;
        }
    });
}