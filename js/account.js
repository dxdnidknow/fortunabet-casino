// --- ARCHIVO COMPLETO Y FINAL: js/account.js ---

import { showToast } from './ui.js';
import { API_BASE_URL } from './config.js';

function isOver18(dateString) {
    if (!dateString) return false;
    const today = new Date();
    const birthDate = new Date(dateString);
    if (isNaN(birthDate.getTime())) return false;
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDifference = today.getMonth() - birthDate.getMonth();
    if (monthDifference < 0 || (monthDifference === 0 && today.getDate() < birthDate.getDate())) {
        age--;
    }
    return age >= 18;
}

function formatPhoneNumber(event) {
    const input = event.target;
    let value = input.value.replace(/\D/g, '');
    value = value.substring(0, 10);
    let formattedValue = '';
    if (value.length > 7) {
        formattedValue = `${value.substring(0, 3)}-${value.substring(3, 6)}-${value.substring(6, 8)}-${value.substring(8, 10)}`;
    } else if (value.length > 6) {
        formattedValue = `${value.substring(0, 3)}-${value.substring(3, 6)}-${value.substring(6)}`;
    } else if (value.length > 3) {
        formattedValue = `${value.substring(0, 3)}-${value.substring(3)}`;
    } else {
        formattedValue = value;
    }
    input.value = formattedValue;
}

async function fetchUserData() {
    const userEmail = localStorage.getItem('fortunaUserEmail');
    if (!userEmail) {
        throw new Error('No se pudo encontrar el email del usuario. Por favor, inicie sesión de nuevo.');
    }
    const response = await fetch(`${API_BASE_URL}/user-data?email=${encodeURIComponent(userEmail)}`);
    const data = await response.json();
    if (!response.ok) {
        throw new Error(data.message || 'Error al obtener los datos del usuario.');
    }
    return data;
}

async function handleUsernameChange(event) {
    event.preventDefault();
    const form = event.target;
    const newUsernameInput = form.querySelector('#new-username');
    const submitButton = form.querySelector('button[type="submit"]');
    submitButton.disabled = true;

    try {
        const userEmail = localStorage.getItem('fortunaUserEmail');
        const response = await fetch(`${API_BASE_URL}/change-username`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: userEmail, newUsername: newUsernameInput.value })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message);
        
        showToast(data.message, 'success');
        localStorage.setItem('fortunaUser', data.newUsername);
        document.querySelectorAll('.welcome-message').forEach(el => el.textContent = `Hola, ${data.newUsername}`);
    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        await renderUsernameChangeUI();
    }
}

async function renderUsernameChangeUI() {
    const container = document.getElementById('username-change-container');
    if (!container) return;
    container.innerHTML = `<div class="loader-container" style="padding: 0;"><div class="spinner"></div></div>`;

    try {
        const userData = await fetchUserData();
        let canChange = true;
        let tooltipMessage = "El nombre de usuario debe tener entre 4 y 20 letras, sin números ni espacios.";
        let nextAvailableDate = null;

        if (userData.lastUsernameChange) {
            const lastChange = new Date(userData.lastUsernameChange);
            const fourteenDaysInMs = 14 * 24 * 60 * 60 * 1000;
            const nextChangeDate = new Date(lastChange.getTime() + fourteenDaysInMs);
            if (new Date() < nextChangeDate) {
                canChange = false;
                nextAvailableDate = nextChangeDate.toLocaleDateString('es-ES');
                tooltipMessage = `Solo puedes cambiar tu nombre una vez cada 14 días. Próximo cambio disponible el ${nextAvailableDate}.`;
            }
        }

        let formHtml = `
            <h3>Cambiar Nombre de Usuario</h3>
            <div class="form-group">
                <div class="input-wrapper">
                    <input type="text" id="new-username" placeholder="Elige tu nuevo nombre" required minlength="4" maxlength="20" pattern="[a-zA-Z]+" title="Solo letras, sin espacios ni números." ${!canChange ? 'disabled' : ''}>
                    <span class="tooltip-trigger" data-tooltip="${tooltipMessage}">
                        <i class="fa-solid fa-circle-info"></i>
                    </span>
                </div>
            </div>
            <button type="submit" class="btn btn-secondary" style="width: auto;" ${!canChange ? 'disabled' : ''}>Cambiar Nombre</button>
        `;

        container.innerHTML = `
            <p class="card-subtitle" style="margin-top:0;">Tu nombre de usuario actual es: <strong>${userData.username}</strong></p>
            <form id="username-change-form" class="auth-form">${formHtml}</form>
        `;
        
        if (canChange) {
            const usernameForm = container.querySelector('#username-change-form');
            if (usernameForm) {
                usernameForm.addEventListener('submit', handleUsernameChange);
            }
        }
    } catch (error) {
        container.innerHTML = `<p class="error-message">${error.message}</p>`;
    }
}

function populatePersonalInfoForm(personalInfo = {}) {
    document.getElementById('first-name').value = personalInfo.firstName || '';
    document.getElementById('last-name').value = personalInfo.lastName || '';
    document.getElementById('birth-date').value = personalInfo.birthDate || '';
    document.getElementById('state').value = personalInfo.state || '';
    const fullPhone = personalInfo.phone || '';
    const phoneInput = document.getElementById('phone-number');
    if (phoneInput) {
        phoneInput.value = fullPhone.replace(/^\+58\s*/, '');
    }
}

function handlePayoutMethodChange() {
    const selector = document.getElementById('payout-method');
    if (!selector) return;
    selector.addEventListener('change', () => {
        const selectedMethod = selector.value;
        document.querySelectorAll('.payout-fields').forEach(fieldSet => {
            fieldSet.classList.toggle('active', fieldSet.dataset.method === selectedMethod);
        });
    });
    selector.dispatchEvent(new Event('change'));
}

function handle2FASetup() {
    const enableBtn = document.getElementById('enable-2fa-btn');
    const disableBtn = document.getElementById('disable-2fa-btn');
    const verifyForm = document.getElementById('verify-2fa-form');
    const viewDisabled = document.getElementById('2fa-disabled');
    const viewSetup = document.getElementById('2fa-setup');
    const viewEnabled = document.getElementById('2fa-enabled');
    
    if(!enableBtn || !disableBtn || !verifyForm) return;

    enableBtn.addEventListener('click', () => {
        viewDisabled.classList.add('hidden');
        viewSetup.classList.remove('hidden');
    });

    verifyForm.addEventListener('submit', (e) => {
        e.preventDefault();
        viewSetup.classList.add('hidden');
        viewEnabled.classList.remove('hidden');
        showToast('¡2FA activado con éxito!');
    });

    disableBtn.addEventListener('click', () => {
        viewEnabled.classList.add('hidden');
        viewDisabled.classList.remove('hidden');
        showToast('2FA desactivado.');
    });
}

export function renderBetHistory() { // <--- CORRECCIÓN AQUÍ
    const historyLists = document.querySelectorAll('.history-list');
    if (historyLists.length === 0) return;

    const currentUser = localStorage.getItem('fortunaUser');
    if (!currentUser) return;

    const allHistories = JSON.parse(localStorage.getItem('fortunaAllHistories')) || {};
    const betHistory = allHistories[currentUser] || [];
    
    historyLists.forEach(list => {
        list.innerHTML = '';
        if (betHistory.length === 0) {
            list.innerHTML = '<li>Aún no has realizado ninguna apuesta.</li>';
            return;
        }

        const historyToShow = list.classList.contains('full-history') ? betHistory : betHistory.slice(-5);
        historyToShow.slice().reverse().forEach(record => {
            const betDescription = record.bets.map(b => b.team.split(' vs ')[0]).join(', ');
            const statusClass = record.status.toLowerCase();
            const winnings = record.stake * record.bets.reduce((acc, bet) => acc * bet.odds, 1);
            const listItem = document.createElement('li');
            listItem.innerHTML = `
                <span>Apuesta en: ${betDescription} (Bs. ${record.stake.toFixed(2)})</span>
                <div style="text-align: right;">
                    <span class="${statusClass}">${record.status}</span>
                    ${record.status === 'Ganada' ? `<span style="display: block; font-size: 0.8rem; color: var(--color-success);">+ Bs. ${winnings.toFixed(2)}</span>` : ''}
                </div>
            `;
            list.appendChild(listItem);
        });
    });
}

export async function initAccountDashboard() {
    const menuLinks = document.querySelectorAll('.account-menu-link');
    const sections = document.querySelectorAll('.account-section');
    const addMethodBtn = document.getElementById('add-payout-method-btn');
    const payoutForm = document.getElementById('payout-method-form');
    const personalInfoForm = document.getElementById('personal-info-form');
    const passwordChangeForm = document.getElementById('password-change-form');
    const phoneInput = document.getElementById('phone-number');

    if (phoneInput) {
        phoneInput.addEventListener('input', formatPhoneNumber);
    }

    try {
        const userData = await fetchUserData();
        if (userData.personalInfo) {
            populatePersonalInfoForm(userData.personalInfo);
        }
    } catch (error) {
        console.error("No se pudo cargar la información del usuario:", error);
        showToast("No se pudo cargar tu información.", "error");
    }

    if (menuLinks.length === 0) return;

    menuLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            menuLinks.forEach(l => l.classList.remove('active'));
            sections.forEach(s => s.classList.remove('active'));
            
            const targetId = link.dataset.target;
            const targetSection = document.getElementById(targetId);

            link.classList.add('active');
            if (targetSection) {
                targetSection.classList.add('active');
            }
        });
    });

    if (addMethodBtn && payoutForm) {
        addMethodBtn.addEventListener('click', () => {
            payoutForm.classList.toggle('hidden');
        });
    }

    if (personalInfoForm) {
        personalInfoForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const submitButton = personalInfoForm.querySelector('button[type="submit"]');
            submitButton.disabled = true;

            const birthDateValue = document.getElementById('birth-date').value;
            if (birthDateValue && !isOver18(birthDateValue)) {
                showToast('Debes ser mayor de 18 años.', 'error');
                submitButton.disabled = false;
                return;
            }

            const phoneNumberRaw = document.getElementById('phone-number').value.replace(/\D/g, '');
            const formData = {
                email: localStorage.getItem('fortunaUserEmail'),
                firstName: document.getElementById('first-name').value,
                lastName: document.getElementById('last-name').value,
                birthDate: birthDateValue,
                state: document.getElementById('state').value,
                phone: `+58 ${phoneNumberRaw}`,
            };

            try {
                const response = await fetch(`${API_BASE_URL}/update-personal-info`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(formData)
                });
                const data = await response.json();
                if (!response.ok) throw new Error(data.message);
                showToast(data.message, 'success');
            } catch (error) {
                showToast(error.message, 'error');
            } finally {
                submitButton.disabled = false;
            }
        });
    }

    if (passwordChangeForm) {
        let isCodeStep = false;
        const submitButton = passwordChangeForm.querySelector('button[type="submit"]');
        const confirmationGroup = document.getElementById('confirmation-code-group');

        passwordChangeForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            submitButton.disabled = true;

            const userEmail = localStorage.getItem('fortunaUserEmail');
            if (!userEmail) {
                showToast('Error de sesión. Por favor, vuelve a iniciar sesión.', 'error');
                submitButton.disabled = false;
                return;
            }

            const currentPassword = document.getElementById('current-password').value;
            const newPassword = document.getElementById('new-password').value;
            const confirmNewPassword = document.getElementById('confirm-new-password').value;

            if (!isCodeStep) {
                if (newPassword !== confirmNewPassword) {
                    showToast('Las nuevas contraseñas no coinciden.', 'error');
                    submitButton.disabled = false;
                    return;
                }
                 if (currentPassword === newPassword) {
                    showToast('La nueva contraseña no puede ser la misma que la actual.', 'error');
                    submitButton.disabled = false;
                    return;
                }
                if (newPassword.length < 8) {
                    showToast('La nueva contraseña debe tener al menos 8 caracteres.', 'error');
                    submitButton.disabled = false;
                    return;
                }

                try {
                    const validationResponse = await fetch(`${API_BASE_URL}/validate-current-password`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email: userEmail, currentPassword: currentPassword })
                    });
                    const validationData = await validationResponse.json();
                    if (!validationResponse.ok) throw new Error(validationData.message);

                    const codeResponse = await fetch(`${API_BASE_URL}/request-password-change-code`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email: userEmail })
                    });
                    const codeData = await codeResponse.json();
                    if (!codeResponse.ok) throw new Error(codeData.message);

                    showToast(codeData.message, 'success');
                    confirmationGroup.classList.remove('hidden');
                    isCodeStep = true;

                } catch (error) {
                    showToast(error.message, 'error');
                } finally {
                    submitButton.disabled = false;
                }

            } else {
                const code = document.getElementById('confirmation-code').value;
                
                try {
                    const response = await fetch(`${API_BASE_URL}/change-password`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            email: userEmail,
                            currentPassword,
                            newPassword,
                            code
                        })
                    });
                    const data = await response.json();
                    if (!response.ok) throw new Error(data.message);

                    showToast(data.message, 'success');
                    passwordChangeForm.reset();
                    confirmationGroup.classList.add('hidden');
                    isCodeStep = false;
                } catch (error) {
                    showToast(error.message, 'error');
                } finally {
                    submitButton.disabled = false;
                }
            }
        });
    }

    renderUsernameChangeUI();
    handlePayoutMethodChange();
    handle2FASetup();

    if (window.location.hash) {
        const targetId = window.location.hash.substring(1);
        const targetLink = document.querySelector(`.account-menu-link[data-target="${targetId}"]`);
        if (targetLink) {
            targetLink.click();
        }
    }
}