// Archivo: js/bet.js (VERSIÓN FINAL COMPLETA - HISTORIAL POR USUARIO)

import { showToast } from './ui.js';

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
    const existingBetIndex = bets.findIndex(bet => bet.id === betInfo.id);
    
    if (existingBetIndex === -1) {
        const newBet = { ...betInfo, id: Date.now() }; 
        bets.push(newBet);
        showToast('Apuesta añadida al cupón');
    } else {
        bets.splice(existingBetIndex, 1);
        showToast('Apuesta eliminada del cupón');
    }
    
    saveBetsToLocalStorage(); 
    renderBetSlip();
    notify();
}

function removeBetById(betIdToRemove) {
    bets = bets.filter(bet => bet.id !== parseInt(betIdToRemove));
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

    document.getElementById('place-bet-btn')?.addEventListener('click', () => {
        const stakeInput = document.querySelector('.stake-input');
        const stake = parseFloat(stakeInput.value) || 0;

        if (bets.length === 0) {
            showToast('Añade al menos una selección al cupón.');
            return;
        }
        if (stake <= 0) {
            showToast('Ingresa un monto válido para apostar.');
            return;
        }

        const currentUser = localStorage.getItem('fortunaUser');
        if (!currentUser) {
            showToast('Debes iniciar sesión para realizar una apuesta.');
            return;
        }

        const allHistories = JSON.parse(localStorage.getItem('fortunaAllHistories')) || {};
        
        if (!allHistories[currentUser]) {
            allHistories[currentUser] = [];
        }

        const newBetRecord = {
            id: Date.now(),
            bets: [...bets],
            stake: stake,
            status: ['Ganada', 'Perdida', 'Pendiente'][Math.floor(Math.random() * 3)]
        };

        allHistories[currentUser].push(newBetRecord);

        localStorage.setItem('fortunaAllHistories', JSON.stringify(allHistories));
        
        showToast('¡Apuesta realizada con éxito!');

        bets = [];
        saveBetsToLocalStorage();
        renderBetSlip();
        notify();
    });
}