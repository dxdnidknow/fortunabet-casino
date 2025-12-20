// Archivo: js/responsible-gaming.js
// Maneja Bonos y Juego Responsable

import { API_BASE_URL } from './config.js';
import { fetchWithAuth } from './auth.js';
import { showToast } from './ui.js';

// =======================================================================
//  BONOS
// =======================================================================

export async function initBonusSection() {
    const claimForm = document.getElementById('claim-bonus-form');
    if (claimForm) {
        claimForm.addEventListener('submit', handleClaimBonus);
    }
    await loadUserBonuses();
}

async function handleClaimBonus(e) {
    e.preventDefault();
    const codeInput = document.getElementById('bonus-code-input');
    const code = codeInput?.value.trim();
    
    if (!code) {
        showToast('Ingresa un código de bono', 'error');
        return;
    }

    try {
        const result = await fetchWithAuth(`${API_BASE_URL}/user/bonuses/claim`, {
            method: 'POST',
            body: JSON.stringify({ bonusCode: code })
        });
        
        showToast(result.message, 'success');
        codeInput.value = '';
        await loadUserBonuses();
    } catch (error) {
        showToast(error.message || 'Error al canjear bono', 'error');
    }
}

async function loadUserBonuses() {
    try {
        const data = await fetchWithAuth(`${API_BASE_URL}/user/bonuses`);
        renderActiveBonuses(data.userBonuses || []);
    } catch (error) {
        // Silenciar error si la ruta no existe
        console.log('Bonos API no disponible:', error.message);
    }
}

function renderActiveBonuses(bonuses) {
    const container = document.getElementById('active-bonuses');
    if (!container) return;

    const activeBonuses = bonuses.filter(b => b.status === 'active');
    
    if (activeBonuses.length === 0) {
        container.innerHTML = '<p class="empty-message">No tienes bonos activos.</p>';
        return;
    }

    container.innerHTML = activeBonuses.map(bonus => `
        <div class="bonus-card active-bonus">
            <div class="bonus-badge">${bonus.type?.toUpperCase() || 'BONO'}</div>
            <h4>${bonus.name}</h4>
            <p class="bonus-value">${bonus.percentage ? `${bonus.percentage}%` : `Bs. ${bonus.amount?.toFixed(2)}`}</p>
            <div class="bonus-progress">
                <span>Rollover: ${bonus.wageringProgress || 0}x / ${bonus.wageringRequirement}x</span>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${Math.min(100, (bonus.wageringProgress / bonus.wageringRequirement) * 100)}%"></div>
                </div>
            </div>
            <p class="bonus-expiry">Expira: ${new Date(bonus.expiresAt).toLocaleDateString('es-VE')}</p>
        </div>
    `).join('');
}

// =======================================================================
//  JUEGO RESPONSABLE
// =======================================================================

export async function initResponsibleGaming() {
    await loadResponsibleGamingConfig();
    setupResponsibleGamingForms();
    setupSelfExclusionButtons();
    setupRealityCheckToggle();
}

async function loadResponsibleGamingConfig() {
    try {
        const config = await fetchWithAuth(`${API_BASE_URL}/user/responsible-gaming`);
        
        // Límites de depósito
        if (config.depositLimit) {
            document.getElementById('deposit-daily')?.setAttribute('value', config.depositLimit.daily || '');
            document.getElementById('deposit-weekly')?.setAttribute('value', config.depositLimit.weekly || '');
            document.getElementById('deposit-monthly')?.setAttribute('value', config.depositLimit.monthly || '');
        }
        
        // Límites de pérdida
        if (config.lossLimit) {
            document.getElementById('loss-daily')?.setAttribute('value', config.lossLimit.daily || '');
            document.getElementById('loss-weekly')?.setAttribute('value', config.lossLimit.weekly || '');
            document.getElementById('loss-monthly')?.setAttribute('value', config.lossLimit.monthly || '');
        }
        
        // Límite de sesión
        if (config.sessionLimit) {
            const select = document.getElementById('session-limit-select');
            if (select) select.value = config.sessionLimit;
        }
        
        // Reality Check
        if (config.realityCheck) {
            const toggle = document.getElementById('reality-check-toggle');
            const intervalRow = document.getElementById('reality-interval-row');
            const intervalSelect = document.getElementById('reality-check-interval');
            
            if (toggle) toggle.checked = config.realityCheck.enabled;
            if (intervalRow) intervalRow.style.display = config.realityCheck.enabled ? 'flex' : 'none';
            if (intervalSelect) intervalSelect.value = config.realityCheck.intervalMinutes || 60;
        }
        
        // Self-Exclusion status
        if (config.selfExclusion?.isActive) {
            showExclusionStatus(config.selfExclusion);
        }
        
    } catch (error) {
        // Silenciar error si la ruta no existe
        console.log('Juego responsable API no disponible:', error.message);
    }
}

function setupResponsibleGamingForms() {
    // Límites de depósito
    const depositForm = document.getElementById('deposit-limits-form');
    if (depositForm) {
        depositForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const daily = document.getElementById('deposit-daily')?.value || null;
            const weekly = document.getElementById('deposit-weekly')?.value || null;
            const monthly = document.getElementById('deposit-monthly')?.value || null;
            
            try {
                await fetchWithAuth(`${API_BASE_URL}/user/responsible-gaming/deposit-limits`, {
                    method: 'POST',
                    body: JSON.stringify({ daily: daily ? Number(daily) : null, weekly: weekly ? Number(weekly) : null, monthly: monthly ? Number(monthly) : null })
                });
                showToast('Límites de depósito actualizados', 'success');
            } catch (error) {
                showToast(error.message || 'Error al guardar', 'error');
            }
        });
    }
    
    // Límites de pérdida
    const lossForm = document.getElementById('loss-limits-form');
    if (lossForm) {
        lossForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const daily = document.getElementById('loss-daily')?.value || null;
            const weekly = document.getElementById('loss-weekly')?.value || null;
            const monthly = document.getElementById('loss-monthly')?.value || null;
            
            try {
                await fetchWithAuth(`${API_BASE_URL}/user/responsible-gaming/loss-limits`, {
                    method: 'POST',
                    body: JSON.stringify({ daily: daily ? Number(daily) : null, weekly: weekly ? Number(weekly) : null, monthly: monthly ? Number(monthly) : null })
                });
                showToast('Límites de pérdida actualizados', 'success');
            } catch (error) {
                showToast(error.message || 'Error al guardar', 'error');
            }
        });
    }
    
    // Límite de sesión
    const sessionForm = document.getElementById('session-limit-form');
    if (sessionForm) {
        sessionForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const minutes = document.getElementById('session-limit-select')?.value || null;
            
            try {
                await fetchWithAuth(`${API_BASE_URL}/user/responsible-gaming/session-limit`, {
                    method: 'POST',
                    body: JSON.stringify({ minutes: minutes ? Number(minutes) : null })
                });
                showToast('Límite de sesión configurado', 'success');
            } catch (error) {
                showToast(error.message || 'Error al guardar', 'error');
            }
        });
    }
    
    // Reality Check
    const realityForm = document.getElementById('reality-check-form');
    if (realityForm) {
        realityForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const enabled = document.getElementById('reality-check-toggle')?.checked || false;
            const intervalMinutes = Number(document.getElementById('reality-check-interval')?.value) || 60;
            
            try {
                await fetchWithAuth(`${API_BASE_URL}/user/responsible-gaming/reality-check`, {
                    method: 'POST',
                    body: JSON.stringify({ enabled, intervalMinutes })
                });
                showToast('Configuración de Reality Check guardada', 'success');
            } catch (error) {
                showToast(error.message || 'Error al guardar', 'error');
            }
        });
    }
}

function setupSelfExclusionButtons() {
    const buttons = document.querySelectorAll('.exclusion-options button');
    buttons.forEach(btn => {
        btn.addEventListener('click', async () => {
            const duration = btn.dataset.duration;
            const isPermanent = duration === 'permanent';
            
            const confirmMsg = isPermanent 
                ? '⚠️ ATENCIÓN: La autoexclusión permanente solo puede ser revertida contactando a soporte. ¿Estás seguro?'
                : `¿Estás seguro de que deseas excluirte por ${btn.textContent}?`;
            
            if (!confirm(confirmMsg)) return;
            if (isPermanent && !confirm('Esta acción es MUY SERIA. ¿Confirmas la autoexclusión PERMANENTE?')) return;
            
            try {
                const result = await fetchWithAuth(`${API_BASE_URL}/user/responsible-gaming/self-exclusion`, {
                    method: 'POST',
                    body: JSON.stringify({ 
                        duration: isPermanent ? 'permanent' : Number(duration),
                        reason: 'Solicitud del usuario'
                    })
                });
                
                showToast(result.message, 'success');
                
                // Cerrar sesión después de autoexclusión
                setTimeout(() => {
                    localStorage.removeItem('fortunaToken');
                    localStorage.removeItem('fortunaUser');
                    window.location.href = '/';
                }, 2000);
                
            } catch (error) {
                showToast(error.message || 'Error al procesar', 'error');
            }
        });
    });
}

function setupRealityCheckToggle() {
    const toggle = document.getElementById('reality-check-toggle');
    const intervalRow = document.getElementById('reality-interval-row');
    
    if (toggle && intervalRow) {
        toggle.addEventListener('change', () => {
            intervalRow.style.display = toggle.checked ? 'flex' : 'none';
        });
    }
}

function showExclusionStatus(exclusion) {
    const container = document.querySelector('#juego-responsable .danger-card');
    if (!container) return;
    
    const untilDate = exclusion.until ? new Date(exclusion.until).toLocaleDateString('es-VE') : 'Permanente';
    
    container.innerHTML = `
        <h3><i class="fa-solid fa-ban"></i> Autoexclusión Activa</h3>
        <div class="exclusion-active-status">
            <p><strong>Estado:</strong> Excluido</p>
            <p><strong>Hasta:</strong> ${untilDate}</p>
            <p><strong>Razón:</strong> ${exclusion.reason || 'No especificada'}</p>
        </div>
        <p class="exclusion-warning"><i class="fa-solid fa-info-circle"></i> Tu cuenta está actualmente excluida. No podrás realizar apuestas ni depósitos hasta que expire el período.</p>
    `;
}

// =======================================================================
//  2FA TOGGLE
// =======================================================================

export async function init2FASection() {
    const container = document.getElementById('2fa-status-container');
    if (!container) return;
    
    try {
        const userData = await fetchWithAuth(`${API_BASE_URL}/user/user-data`);
        const is2FAEnabled = userData.security?.twoFactorEnabled || false;
        const isPhoneVerified = userData.personalInfo?.isPhoneVerified || false;
        
        container.innerHTML = `
            <div class="twofa-status">
                <div class="status-header">
                    <i class="fa-solid fa-shield-halved ${is2FAEnabled ? 'active' : ''}"></i>
                    <div>
                        <h4>Estado: ${is2FAEnabled ? '<span class="text-success">Activado</span>' : '<span class="text-muted">Desactivado</span>'}</h4>
                        <p>Añade una capa extra de seguridad a tu cuenta</p>
                    </div>
                </div>
                ${!isPhoneVerified ? `
                    <p class="warning-msg"><i class="fa-solid fa-exclamation-triangle"></i> Debes verificar tu teléfono antes de activar 2FA</p>
                ` : `
                    <button id="toggle-2fa-btn" class="btn ${is2FAEnabled ? 'btn-secondary' : 'btn-primary'}">
                        ${is2FAEnabled ? 'Desactivar 2FA' : 'Activar 2FA'}
                    </button>
                `}
            </div>
        `;
        
        const toggleBtn = document.getElementById('toggle-2fa-btn');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', async () => {
                try {
                    const result = await fetchWithAuth(`${API_BASE_URL}/user/2fa/toggle`, {
                        method: 'POST',
                        body: JSON.stringify({ enable: !is2FAEnabled })
                    });
                    showToast(result.message, 'success');
                    init2FASection(); // Refresh
                } catch (error) {
                    showToast(error.message || 'Error al cambiar 2FA', 'error');
                }
            });
        }
        
    } catch (error) {
        // Silenciar - mostrar estado por defecto
        container.innerHTML = `
            <div class="twofa-status">
                <div class="status-header">
                    <i class="fa-solid fa-shield-halved"></i>
                    <div>
                        <h4>Estado: <span class="text-muted">Desactivado</span></h4>
                        <p>Añade una capa extra de seguridad a tu cuenta</p>
                    </div>
                </div>
                <p class="warning-msg"><i class="fa-solid fa-exclamation-triangle"></i> Debes verificar tu teléfono antes de activar 2FA</p>
            </div>
        `;
    }
}
