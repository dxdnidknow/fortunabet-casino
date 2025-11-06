// Archivo: js/account.js (COMPLETO Y MODIFICADO)

import { showToast } from './ui.js';
import { API_BASE_URL } from './config.js';
import { openModal, closeModal } from './modal.js';
import { fetchWithAuth } from './auth.js';

// =======================================================================
//  FUNCIONES DE AYUDA Y VALIDACIÓN
// =======================================================================

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
        formattedValue = `${value.substring(0, 3)}-${value.substring(3, 6)}-${value.substring(6, 10)}`;
    } else if (value.length > 3) {
        formattedValue = `${value.substring(0, 3)}-${value.substring(3, 10)}`;
    } else {
        formattedValue = value;
    }
    input.value = formattedValue;
}

// =======================================================================
//  1. CARGA DE DATOS DEL USUARIO
// =======================================================================

export async function loadUserData() {
    try {
        const response = await fetchWithAuth(`${API_BASE_URL}/user-data`);
        if (!response.ok) throw new Error('No se pudieron cargar los datos del usuario.');
        const userData = await response.json();
        
        document.getElementById('user-display-name').textContent = userData.username;
        document.getElementById('user-display-balance').textContent = `Bs. ${userData.balance.toFixed(2)}`;
        const dashboardBalance = document.getElementById('dashboard-balance');
        if(dashboardBalance) dashboardBalance.textContent = `Bs. ${userData.balance.toFixed(2)}`;
        
        const form = document.getElementById('user-data-form');
        if (form && userData.personalInfo) {
            document.getElementById('full-name').value = userData.personalInfo.fullName || '';
            document.getElementById('cedula').value = userData.personalInfo.cedula || '';
            document.getElementById('birth-date').value = userData.personalInfo.birthDate ? userData.personalInfo.birthDate.substring(0, 10) : '';
            document.getElementById('email').value = userData.email || '';
            
            const phoneInput = document.getElementById('phone');
            if (phoneInput) {
                phoneInput.value = userData.personalInfo.phone ? userData.personalInfo.phone.replace('+58', '').replace(/\D/g, '').substring(0, 10) : '';
                formatPhoneNumber({ target: phoneInput });
            }
            renderPhoneVerificationStatus(userData.personalInfo.isPhoneVerified, userData.personalInfo.phone);
        }
        
        if (userData.role === 'admin') {
            const adminLink = document.getElementById('admin-panel-link');
            if (adminLink) adminLink.style.display = 'flex';
        }

    } catch (error) {
        console.error(error);
        showToast('Error al cargar datos de usuario. Intenta recargar.', 'error');
    }
}

// =======================================================================
//  2. MÉTODOS DE RETIRO
// =======================================================================

function renderPayoutMethod(method) {
    let detailsHtml = '';
    const details = method.details || {};
    if (method.methodType === 'pago_movil') {
        detailsHtml = `Banco: ${details.bank || 'N/A'} / Cédula: ${details.cedula || 'N/A'} / Teléfono: ${details.phone || 'N/A'}`;
    } else if (method.methodType === 'zelle') {
        detailsHtml = `Email: ${details.email || 'N/A'} / Nombre: ${details.name || 'N/A'}`;
    } else if (method.methodType === 'usdt') {
        detailsHtml = `Red: ${details.network || 'N/A'} / Dirección: <code>${(details.address || 'N/A').substring(0, 10)}...</code>`;
    }
    
    const li = document.createElement('li');
    li.classList.add('data-list-item', method.isPrimary ? 'primary-method' : '');
    li.dataset.id = method._id;
    li.innerHTML = `
        <div class="item-info">
            <h4><i class="fa-solid fa-money-bill-transfer"></i> ${method.methodType.toUpperCase().replace('_', ' ')}</h4>
            <p>${detailsHtml}</p>
        </div>
        <div class="item-action">
            <button class="btn btn-secondary btn-sm delete-method-btn" data-id="${method._id}">Eliminar</button>
            ${method.isPrimary ? '<span class="tag tag-primary">Principal</span>' : `<button class="btn btn-secondary btn-sm set-primary-btn" data-id="${method._id}">Establecer Principal</button>`}
        </div>
    `;
    return li;
}

export async function loadPayoutMethods() {
    const listContainer = document.getElementById('payout-methods-list');
    const withdrawSelect = document.getElementById('withdraw-method');
    if (!listContainer) return;
    
    try {
        const response = await fetchWithAuth(`${API_BASE_URL}/payout-methods`); 
        if (!response.ok) throw new Error('No se pudieron cargar los métodos de pago.');
        const methods = await response.json();

        listContainer.innerHTML = ''; 
        const emptyMessage = document.querySelector('.empty-message-payout');
        if (withdrawSelect) withdrawSelect.innerHTML = '';

        if (methods.length === 0) {
            if (emptyMessage) emptyMessage.style.display = 'block';
             if (withdrawSelect) withdrawSelect.innerHTML = '<option value="">Añade un método en Mi Cuenta</option>';
            return;
        }

        if (emptyMessage) emptyMessage.style.display = 'none';
        const ul = document.createElement('ul');
        ul.classList.add('payout-list');

        methods.forEach(method => {
            ul.appendChild(renderPayoutMethod(method));
            if (withdrawSelect) {
                const option = document.createElement('option');
                const details = method.details;
                let text = '';
                if (method.methodType === 'pago_movil') text = `Pago Móvil (${details.bank} - ...${details.phone.slice(-4)})`;
                else if (method.methodType === 'zelle') text = `Zelle (${details.email})`;
                else if (method.methodType === 'usdt') text = `USDT ${details.network.toUpperCase()} (...${details.address.slice(-6)})`;
                
                option.value = method._id;
                option.textContent = text + (method.isPrimary ? ' (Principal)' : '');
                if (method.isPrimary) {
                    option.selected = true;
                }
                withdrawSelect.appendChild(option);
            }
        });
        listContainer.appendChild(ul);
    } catch (error) {
        showToast(`Error al cargar métodos: ${error.message || 'Error de conexión'}`, 'error');
    }
}

// =======================================================================
//  3. HISTORIAL DE APUESTAS
// =======================================================================

export async function renderBetHistory() {
    const historyLists = document.querySelectorAll('.history-list.recent-bets, .history-list.full-history');
    if (historyLists.length === 0) return;

    const emptyMsgRecent = document.querySelector('.recent-history .empty-message-history');
    const emptyMsgFull = document.querySelector('#historial-apuestas .empty-message-bets');

    try {
        const response = await fetchWithAuth(`${API_BASE_URL}/get-bets`);
        if (!response.ok) throw new Error('No se pudo cargar el historial de apuestas.');
        
        const betHistory = await response.json(); 

        if (betHistory.length === 0) {
            if (emptyMsgRecent) emptyMsgRecent.style.display = 'block';
            if (emptyMsgFull) emptyMsgFull.style.display = 'block';
            return;
        }
        
        if (emptyMsgRecent) emptyMsgRecent.style.display = 'none';
        if (emptyMsgFull) emptyMsgFull.style.display = 'none';

        historyLists.forEach(list => {
            list.innerHTML = '';
            
            const isFullHistory = list.classList.contains('full-history');
            const historyToShow = isFullHistory ? betHistory : betHistory.slice(0, 5); 

            historyToShow.forEach(record => {
                const betDescription = record.selections.map(b => b.team).join(', ');
                const statusClass = record.status.toLowerCase();
                const winnings = record.potentialWinnings;

                const listItem = document.createElement('li');
                listItem.innerHTML = `
                    <span>Apuesta en: ${betDescription} (Bs. ${record.stake.toFixed(2)})</span>
                    <div style="text-align: right;">
                        <span class="status-tag ${statusClass}">${record.status.charAt(0).toUpperCase() + record.status.slice(1)}</span>
                        ${record.status === 'won' ? `<span style="display: block; font-size: 0.8rem; color: var(--color-success);">+ Bs. ${winnings.toFixed(2)}</span>` : ''}
                    </div>
                `;
                list.appendChild(listItem);
            });
        });

    } catch (error) {
        console.error(error);
        showToast(error.message, 'error');
        if (emptyMsgRecent) emptyMsgRecent.textContent = 'Error al cargar apuestas.';
        if (emptyMsgFull) emptyMsgFull.textContent = 'Error al cargar historial.';
    }
}

// =======================================================================
//  4. HISTORIAL DE TRANSACCIONES
// =======================================================================

export async function renderTransactionHistory() {
    const listContainer = document.querySelector('#historial-transacciones .history-list');
    if (!listContainer) return;

    const emptyMsg = document.querySelector('.empty-message-transactions');

    try {
        const response = await fetchWithAuth(`${API_BASE_URL}/transactions`); 
        if (!response.ok) throw new Error('No se pudo cargar el historial de transacciones.');
        
        const transactions = await response.json();

        if (emptyMsg) emptyMsg.style.display = 'none';

        if (transactions.length === 0) {
            if (emptyMsg) emptyMsg.style.display = 'block';
            return;
        }

        listContainer.innerHTML = '';

        transactions.forEach(tx => {
            const isDeposit = tx.type === 'deposit';
            const amount = tx.amount; 
            const statusClass = tx.status.toLowerCase();
            const icon = isDeposit ? 'fa-arrow-down' : 'fa-arrow-up';
            const color = isDeposit ? 'var(--color-success)' : 'var(--color-loss)';
            const date = tx.createdAt || tx.date;

            const listItem = document.createElement('li');
            listItem.innerHTML = `
                <div style="display: flex; align-items: center; gap: 15px;">
                    <i class="fa-solid ${icon}" style="color: ${color};"></i>
                    <div>
                        <span>${isDeposit ? 'Depósito' : 'Retiro'} (${tx.method || 'N/A'})</span>
                        <small style="display: block; color: var(--color-text-secondary);">${new Date(date).toLocaleString('es-ES')}</small>
                    </div>
                </div>
                <div style="text-align: right;">
                    <span style="color: ${color}; font-weight: 600;">Bs. ${Math.abs(amount).toFixed(2)}</span>
                    <span class="status-tag ${statusClass}" style="display: block; margin-top: 5px;">${tx.status}</span>
                </div>
            `;
            listContainer.appendChild(listItem);
        });

    } catch (error) {
        console.error(error);
        showToast(error.message, 'error');
        if (emptyMsg) emptyMsg.textContent = 'Error al cargar transacciones.';
    }
}


// =======================================================================
//  5. LISTENERS Y MANEJADORES DE EVENTOS
// =======================================================================

function handlePayoutMethodChange() {
    const methodTypeSelect = document.getElementById('method-type');
    if (!methodTypeSelect) return;

    methodTypeSelect.addEventListener('change', (e) => {
        document.querySelectorAll('.form-dynamic-fields').forEach(field => {
            field.classList.add('hidden');
            field.querySelectorAll('input, select').forEach(input => input.required = false);
        });
        const selectedMethod = e.target.value;
        const targetFields = document.getElementById(`${selectedMethod}-fields`);
        if (targetFields) {
            targetFields.classList.remove('hidden');
            targetFields.querySelectorAll('input, select').forEach(input => input.required = true);
        }
    });

    const payoutMethodForm = document.getElementById('payout-method-form');
    payoutMethodForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitButton = document.getElementById('add-method-btn');
        submitButton.disabled = true;
        
        try {
            const formData = new FormData(payoutMethodForm);
            const data = {
                methodType: formData.get('method-type'),
                isPrimary: formData.get('is-primary') === 'on',
                details: {}
            };

            const methodType = data.methodType;
            if (methodType === 'pago_movil') {
                data.details.bank = formData.get('bank');
                data.details.cedula = formData.get('cedula');
                data.details.phone = formData.get('phone').replace(/\D/g, '');
            } else if (methodType === 'zelle') {
                data.details.email = formData.get('email');
                data.details.name = formData.get('name');
            } else if (methodType === 'usdt') {
                data.details.network = formData.get('network');
                data.details.address = formData.get('address');
            }

            const response = await fetchWithAuth(`${API_BASE_URL}/payout-methods`, {
                method: 'POST',
                body: JSON.stringify(data)
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.message);

            showToast('Método de retiro añadido con éxito.', 'success');
            payoutMethodForm.reset();
            methodTypeSelect.dispatchEvent(new Event('change'));
            loadPayoutMethods();
        } catch (error) {
            showToast(error.message || 'Error al añadir método de retiro.', 'error');
        } finally {
            submitButton.disabled = false;
        }
    });
}

function handleUserDataSubmit() {
    const userDataForm = document.getElementById('user-data-form');
    if (!userDataForm) return;

    userDataForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitButton = document.getElementById('save-data-btn');
        submitButton.disabled = true;

        const birthDate = document.getElementById('birth-date').value;
        const ageWarning = document.getElementById('age-warning');

        if (birthDate && !isOver18(birthDate)) {
            ageWarning.classList.remove('hidden');
            submitButton.disabled = false;
            return;
        } else {
            ageWarning.classList.add('hidden');
        }

        try {
            const formData = new FormData(userDataForm);
            const phoneValue = formData.get('phone').replace(/\D/g, '');
            const data = {
                fullName: formData.get('full-name'),
                cedula: formData.get('cedula'),
                birthDate: birthDate,
                phone: phoneValue ? `+58${phoneValue}` : ''
            };

            const response = await fetchWithAuth(`${API_BASE_URL}/user-data`, {
                method: 'PUT',
                body: JSON.stringify(data)
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.message);

            showToast(result.message || 'Datos actualizados con éxito.', 'success');
            await loadUserData();
        } catch (error) {
            showToast(error.message || 'Error al guardar los datos.', 'error');
        } finally {
            submitButton.disabled = false;
        }
    });
    
    document.getElementById('phone')?.addEventListener('input', formatPhoneNumber);
}

function renderPhoneVerificationStatus(isVerified, phone) {
    const statusContainer = document.getElementById('phone-verification-status');
    const verifyBtn = document.getElementById('verify-phone-btn');
    if (!statusContainer || !verifyBtn) return;

    const hasPhone = phone && phone.replace('+58', '').trim().length > 0;

    if (!hasPhone) {
        statusContainer.innerHTML = `<p class="status-icon unverified">Añade un número para verificar</p>`;
        verifyBtn.style.display = 'none';
        return;
    }

    verifyBtn.style.display = 'inline-block';

    if (isVerified) {
        statusContainer.innerHTML = `<p class="status-icon verified"><i class="fa-solid fa-circle-check"></i> Teléfono Verificado</p>`;
        verifyBtn.textContent = 'Verificado';
        verifyBtn.disabled = true;
    } else {
        statusContainer.innerHTML = `<p class="status-icon unverified"><i class="fa-solid fa-triangle-exclamation"></i> Pendiente de Verificación</p>`;
        verifyBtn.textContent = 'Verificar Ahora';
        verifyBtn.disabled = false;
    }
}

async function handlePhoneVerification() {
    const verifyBtn = document.getElementById('verify-phone-btn');
    if (!verifyBtn) return;

    verifyBtn.addEventListener('click', async () => {
        if (verifyBtn.disabled) return;
        
        verifyBtn.disabled = true;
        showToast('Solicitando código de verificación...');
        
        try {
            const response = await fetchWithAuth(`${API_BASE_URL}/request-phone-verification`, { method: 'POST' });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message);
            
            showToast(data.message, 'success');
            openModal(document.getElementById('phone-verification-modal'));
            
        } catch (error) {
            showToast(error.message, 'error');
            verifyBtn.disabled = false;
        }
    });

    const phoneVerificationForm = document.getElementById('phone-verification-form');
    phoneVerificationForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = phoneVerificationForm.querySelector('button[type="submit"]');
        const errorEl = phoneVerificationForm.querySelector('#phone-verification-error');
        const codeInput = phoneVerificationForm.querySelector('#phone-otp-input');
        
        submitBtn.disabled = true;
        errorEl.textContent = '';

        try {
            const response = await fetchWithAuth(`${API_BASE_URL}/verify-phone-code`, {
                method: 'POST',
                body: JSON.stringify({ code: codeInput.value })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message);

            showToast(data.message, 'success');
            closeModal(document.getElementById('phone-verification-modal'));
            codeInput.value = '';
            await loadUserData();

        } catch (error) {
            errorEl.textContent = error.message;
        } finally {
            submitBtn.disabled = false;
        }
    });
}

function handlePasswordChange() {
    const passwordChangeForm = document.getElementById('password-change-form');
    if (!passwordChangeForm) return;

    // ===================================================================
    // ADVERTENCIA: La lógica de esta función está SIMULADA.
    // Requiere la creación de nuevas rutas en el backend para funcionar:
    // 1. Una ruta para verificar la contraseña actual.
    // 2. Una ruta para enviar un código de confirmación al email.
    // 3. Una ruta para verificar el código y cambiar la contraseña.
    // Sin estas rutas, esta funcionalidad NO ES REAL.
    // ===================================================================

    let isCodeStep = false;
    const confirmationGroup = document.getElementById('confirmation-code-group');
    const submitButton = document.getElementById('change-password-btn');

    passwordChangeForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const newPassword = document.getElementById('new-password').value;
        const confirmNewPassword = document.getElementById('confirm-new-password').value;

        if (newPassword !== confirmNewPassword) {
            showToast('La nueva contraseña y su confirmación no coinciden.', 'error');
            return;
        }

        submitButton.disabled = true;

        if (!isCodeStep) {
            showToast('Funcionalidad en desarrollo (Simulado).', 'info');
            confirmationGroup.classList.remove('hidden');
            submitButton.textContent = 'Confirmar Cambio';
            isCodeStep = true;
            submitButton.disabled = false;
        } else {
            showToast('Contraseña cambiada con éxito (Simulado).', 'success');
            passwordChangeForm.reset();
            confirmationGroup.classList.add('hidden');
            submitButton.textContent = 'Cambiar Contraseña';
            isCodeStep = false;
            submitButton.disabled = false;
        }
    });
}

function handle2FASetup() {
    const statusContainer = document.getElementById('2fa-status-container');
    if (!statusContainer) return;

    // ===================================================================
    // ADVERTENCIA: Esta funcionalidad de 2FA es 100% SIMULADA.
    // Usa localStorage, lo cual NO PROVEE NINGUNA SEGURIDAD REAL.
    // Para una implementación real se necesita un backend que maneje
    // la generación de secretos (QR), y la validación de códigos TOTP.
    // ===================================================================

    let is2FAActive = localStorage.getItem('is2FAActive_simulated') === 'true';
    function render2FAState() {
        if (is2FAActive) {
            statusContainer.innerHTML = `<p class="status-icon verified"><i class="fa-solid fa-circle-check"></i> 2FA Activo (Simulado)</p><p>Tu cuenta está protegida.</p><button class="btn btn-secondary mt-10" id="disable-2fa-btn">Desactivar 2FA</button>`;
        } else {
            statusContainer.innerHTML = `<p class="status-icon unverified"><i class="fa-solid fa-triangle-exclamation"></i> 2FA Desactivado</p><p>Añade 2FA para una mayor seguridad.</p><button class="btn btn-primary mt-10" id="enable-2fa-btn">Activar 2FA</button>`;
        }
    }
    render2FAState();
    statusContainer.addEventListener('click', (e) => {
        if (e.target.id === 'enable-2fa-btn') {
            showToast('Simulando activación de 2FA...', 'success');
            localStorage.setItem('is2FAActive_simulated', 'true');
            is2FAActive = true;
            render2FAState();
        } else if (e.target.id === 'disable-2fa-btn') {
            showToast('2FA desactivado (Simulado).', 'warning');
            localStorage.setItem('is2FAActive_simulated', 'false');
            is2FAActive = false;
            render2FAState();
        }
    });
}

export async function initAccountDashboard() {
    
    document.querySelectorAll('.account-menu-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = e.currentTarget.dataset.target;
            
            document.querySelectorAll('.account-section').forEach(section => section.classList.remove('active'));
            const targetSection = document.getElementById(targetId);
            if (targetSection) targetSection.classList.add('active');

            document.querySelectorAll('.account-menu-link').forEach(l => l.classList.remove('active'));
            e.currentTarget.classList.add('active');
            
            window.location.hash = targetId;
        });
    });

    if (window.location.hash) {
        const targetId = window.location.hash.substring(1);
        const targetLink = document.querySelector(`.account-menu-link[data-target="${targetId}"]`);
        if (targetLink) targetLink.click();
    }

    await loadUserData();
    await loadPayoutMethods();
    await renderBetHistory();
    await renderTransactionHistory();

    handleUserDataSubmit();
    handlePhoneVerification();
    handlePasswordChange();
    handlePayoutMethodChange();
    handle2FASetup();

    document.body.addEventListener('click', (e) => {
        if (e.target.classList.contains('edit-method-link')) {
            e.preventDefault();
            const withdrawModal = document.getElementById('withdraw-modal');
            if (withdrawModal) closeModal(withdrawModal);
            
            const targetLink = document.querySelector(`.account-menu-link[data-target="mis-datos"]`);
            if (targetLink) {
                 setTimeout(() => targetLink.click(), 50); 
            }
        }
    });


    document.getElementById('payout-methods-list')?.addEventListener('click', async (e) => {
        const deleteBtn = e.target.closest('.delete-method-btn');
        const setPrimaryBtn = e.target.closest('.set-primary-btn');

        if (deleteBtn) {
            const methodId = deleteBtn.dataset.id;
             if (!confirm('¿Estás seguro de que quieres eliminar este método de retiro?')) return;
            try {
                const response = await fetchWithAuth(`${API_BASE_URL}/payout-methods/${methodId}`, { method: 'DELETE' }); 
                if (!response.ok) throw new Error((await response.json()).message || 'Error al eliminar');
                showToast('Método eliminado con éxito.', 'success');
                loadPayoutMethods();
            } catch (error) {
                showToast(error.message, 'error');
            }
        } else if (setPrimaryBtn) {
            const methodId = setPrimaryBtn.dataset.id;
            try {
                const response = await fetchWithAuth(`${API_BASE_URL}/payout-methods/${methodId}/primary`, { method: 'POST' }); 
                if (!response.ok) throw new Error((await response.json()).message || 'Error al establecer principal');
                showToast('Método establecido como principal.', 'success');
                loadPayoutMethods();
            } catch (error) {
                showToast(error.message, 'error');
            }
        }
    });
}