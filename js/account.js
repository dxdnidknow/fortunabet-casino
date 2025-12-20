// Archivo: js/account.js (VERSIÓN FINAL PRODUCTION READY)

import { showToast } from './ui.js';
import { API_BASE_URL } from './config.js';
import { openModal, closeModal } from './modal.js';
import { fetchWithAuth } from './auth.js';
import { initBonusSection, initResponsibleGaming, init2FASection } from './responsible-gaming.js';

// =======================================================================
//  0. UTILIDADES Y VALIDACIONES
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
    // Limitamos a 13 caracteres (ej: 584141234567)
    input.value = value.substring(0, 13);
}

// =======================================================================
//  1. SISTEMA DE PESTAÑAS (TABS) - CORREGIDO PARA RESPUESTA INMEDIATA
// =======================================================================

function initTabs() {
    const menuLinks = document.querySelectorAll('.account-menu-link');
    
    menuLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            const targetId = e.currentTarget.dataset.target;
            
            // Si el botón no es de navegación interna (ej: Logout o Admin externo), salimos
            if (!targetId) return;

            e.preventDefault();

            // 1. Visual: Cambiar clase 'active' en el menú
            document.querySelectorAll('.account-menu-link').forEach(l => l.classList.remove('active'));
            e.currentTarget.classList.add('active');

            // 2. Lógica: Ocultar todas las secciones y mostrar la seleccionada
            document.querySelectorAll('.account-section').forEach(s => s.classList.remove('active'));
            
            const targetSection = document.getElementById(targetId);
            if (targetSection) {
                targetSection.classList.add('active');
                
                // Pequeña animación de entrada (UX)
                targetSection.style.opacity = 0;
                targetSection.style.transform = "translateY(5px)";
                requestAnimationFrame(() => {
                    targetSection.style.transition = "all 0.3s ease";
                    targetSection.style.opacity = 1;
                    targetSection.style.transform = "translateY(0)";
                });
            }
            
            // Actualizar URL hash sin recargar
            history.pushState(null, null, `#${targetId}`);
        });
    });

    // Abrir pestaña si viene en el hash de la URL (ej: mi-cuenta.html#seguridad)
    if (window.location.hash) {
        const hash = window.location.hash.substring(1);
        const link = document.querySelector(`.account-menu-link[data-target="${hash}"]`);
        if (link) link.click();
    }
}

// =======================================================================
//  2. CARGA DE DATOS DEL USUARIO
// =======================================================================

export async function loadUserData() {
    try {
        const userData = await fetchWithAuth(`${API_BASE_URL}/user/user-data`);
        
        // Actualizar textos en la interfaz (Sidebar y Header)
        document.querySelectorAll('.data-username').forEach(element => {
            element.textContent = userData.username;
        });

        const formattedBalance = `Bs. ${userData.balance.toFixed(2)}`;
        document.querySelectorAll('.data-balance').forEach(element => {
            element.textContent = formattedBalance;
        });

        // Actualizar balance del Dashboard principal
        const dashboardBalance = document.getElementById('dashboard-balance');
        if(dashboardBalance) dashboardBalance.textContent = formattedBalance;
        
        // Rellenar formulario "Mis Datos"
        if (userData.personalInfo) {
            const form = document.getElementById('user-data-form');
            if (form) {
                document.getElementById('full-name').value = userData.personalInfo.fullName || '';
                document.getElementById('cedula').value = userData.personalInfo.cedula || '';
                document.getElementById('birth-date').value = userData.personalInfo.birthDate || '';
                document.getElementById('email').value = userData.email || '';
                
                const phoneInput = document.getElementById('phone');
                if (phoneInput) {
                    // Limpiamos el +58 para mostrarlo en el input si se desea, o lo dejamos completo
                    phoneInput.value = userData.personalInfo.phone ? userData.personalInfo.phone.replace('+58', '') : '';
                }
            }
            // Estado de verificación del teléfono
            renderPhoneVerificationStatus(userData.personalInfo.isPhoneVerified, userData.personalInfo.phone);
        }

        // --- LÓGICA DE ADMIN (MOSTRAR BOTÓN EN PC CON MODAL BONITO) ---
        if (userData.role === 'admin') {
            const desktopAdminLink = document.querySelector('#admin-panel-link');
            if (desktopAdminLink) {
                desktopAdminLink.style.display = 'block';
                
                // Interceptar click para mostrar modal de confirmación
                const link = desktopAdminLink.querySelector('a');
                if(link) {
                    link.onclick = (e) => {
                        e.preventDefault();
                        const modal = document.getElementById('admin-confirm-modal');
                        if(modal) {
                            modal.style.display = 'flex';
                            document.body.style.overflow = 'hidden';
                        }
                    };
                }
            }
            
            // Configurar botones del modal
            const modalCancel = document.getElementById('admin-modal-cancel');
            const modalConfirm = document.getElementById('admin-modal-confirm');
            const modal = document.getElementById('admin-confirm-modal');
            
            if(modalCancel && modal) {
                modalCancel.onclick = () => {
                    modal.style.display = 'none';
                    document.body.style.overflow = '';
                };
            }
            
            if(modalConfirm) {
                modalConfirm.onclick = () => {
                    localStorage.removeItem('fortunaToken');
                    localStorage.removeItem('fortunaUser');
                    window.location.href = '/admin/index.html';
                };
            }
            
            // Cerrar al hacer clic fuera
            if(modal) {
                modal.onclick = (e) => {
                    if(e.target === modal) {
                        modal.style.display = 'none';
                        document.body.style.overflow = '';
                    }
                };
            }
        }
        
        // Control de botones de depósito/retiro según verificación
        const depositBtn = document.getElementById('deposit-btn-sidebar');
        const withdrawBtn = document.getElementById('withdraw-btn-sidebar');
        const isVerified = userData.personalInfo?.isPhoneVerified;
        const hasData = userData.personalInfo?.fullName && userData.personalInfo?.cedula;

        if (isVerified && hasData) {
            if(depositBtn) depositBtn.disabled = false;
            if(withdrawBtn) withdrawBtn.disabled = false;
        } 
        
    } catch (error) {
        console.error("Error cargando datos de usuario:", error);
        // showToast('Error de conexión al cargar datos.', 'error'); 
    }
}

function renderPhoneVerificationStatus(isVerified, phone) {
    const container = document.getElementById('phone-verification-status');
    const verifyBtn = document.getElementById('verify-phone-btn');
    if (!container || !verifyBtn) return;

    const hasPhone = phone && phone.length > 5;

    if (!hasPhone) {
        container.innerHTML = `<small style="color:var(--color-text-secondary);">Guarda un número para verificar.</small>`;
        verifyBtn.style.display = 'none';
        return;
    }

    if (isVerified) {
        container.innerHTML = `<span style="color:var(--color-success); font-size:0.9rem; font-weight:600;"><i class="fa-solid fa-circle-check"></i> Verificado</span>`;
        verifyBtn.style.display = 'none';
    } else {
        container.innerHTML = `<span style="color:var(--color-pending); font-size:0.9rem;"><i class="fa-solid fa-circle-exclamation"></i> No verificado</span>`;
        verifyBtn.style.display = 'inline-block';
        verifyBtn.textContent = 'Verificar Ahora';
        verifyBtn.disabled = false;
    }
}

// =======================================================================
//  3. MÉTODOS DE PAGO
// =======================================================================

function renderPayoutMethod(method) {
    let detailsHtml = '';
    const details = method.details || {};
    
    if (method.methodType === 'pago_movil') {
        detailsHtml = `${details.bank || 'Banco'} - ${details.phone || 'Tlf'} - ${details.cedula || 'CI'}`;
    } else if (method.methodType === 'zelle') {
        detailsHtml = `${details.email || 'Email'} (${details.name || 'Nombre'})`;
    }
    
    const div = document.createElement('div');
    div.className = 'info-card'; // Reusamos estilo de tarjeta
    div.style.marginBottom = '15px';
    div.style.display = 'flex';
    div.style.justifyContent = 'space-between';
    div.style.alignItems = 'center';
    if(method.isPrimary) div.style.borderLeft = '4px solid var(--color-primary)';

    div.innerHTML = `
        <div class="item-info">
            <h4 style="margin:0 0 5px 0; color:var(--color-text-primary); font-size:1rem;">
                <i class="fa-solid fa-money-bill-transfer"></i> ${method.methodType.toUpperCase().replace('_', ' ')}
                ${method.isPrimary ? '<span class="bet-status-badge won" style="margin-left:8px; font-size:0.7rem;">PRINCIPAL</span>' : ''}
            </h4>
            <p style="margin:0; color:var(--color-text-secondary); font-size:0.9rem;">${detailsHtml}</p>
        </div>
        <div class="item-action" style="display:flex; gap:10px;">
            ${!method.isPrimary ? `<button class="btn btn-secondary btn-sm set-primary-btn" data-id="${method._id}" title="Hacer Principal"><i class="fa-solid fa-star"></i></button>` : ''}
            <button class="btn btn-danger btn-sm delete-method-btn" data-id="${method._id}" title="Eliminar"><i class="fa-solid fa-trash"></i></button>
        </div>
    `;
    return div;
}

export async function loadPayoutMethods() {
    const listContainer = document.getElementById('payout-methods-list');
    const withdrawSelect = document.getElementById('withdraw-method');
    if (!listContainer) return;
    
    try {
        const methods = await fetchWithAuth(`${API_BASE_URL}/user/payout-methods`); 

        listContainer.innerHTML = ''; 
        if (withdrawSelect) withdrawSelect.innerHTML = '<option value="">Selecciona un método</option>';

        if (methods.length === 0) {
            listContainer.innerHTML = '<p class="empty-message" style="display:block;">Aún no tienes métodos de retiro. Añade uno abajo.</p>';
            return;
        }

        methods.forEach(method => {
            // Renderizar en lista de configuración
            listContainer.appendChild(renderPayoutMethod(method));
            
            // Renderizar en Select del Modal de Retiro
            if (withdrawSelect) {
                const option = document.createElement('option');
                const details = method.details;
                let text = '';
                if (method.methodType === 'pago_movil') text = `Pago Móvil (${details.bank} - ...${details.phone.slice(-4)})`;
                else if (method.methodType === 'zelle') text = `Zelle (${details.email})`;
                
                option.value = method._id;
                option.textContent = text + (method.isPrimary ? ' (Principal)' : '');
                if (method.isPrimary) option.selected = true;
                
                withdrawSelect.appendChild(option);
            }
        });
    } catch (error) {
        console.error("Error métodos pago:", error);
    }
}

// =======================================================================
//  4. HISTORIAL DE APUESTAS Y TRANSACCIONES
// =======================================================================

export async function renderBetHistory() {
    const historyLists = document.querySelectorAll('.history-list.recent-bets, .history-list.full-history');
    if (historyLists.length === 0) return;

    // Elementos de mensaje vacío
    const emptyMsgRecent = document.querySelector('.recent-history .empty-message-history');
    const emptyMsgFull = document.querySelector('#historial-apuestas .empty-message-bets');

    try {
        const betHistory = await fetchWithAuth(`${API_BASE_URL}/user/get-bets`);

        // Manejo visual si está vacío
        if (betHistory.length === 0) {
            if (emptyMsgRecent) emptyMsgRecent.style.display = 'block';
            if (emptyMsgFull) emptyMsgFull.style.display = 'block';
            return;
        }
        
        if (emptyMsgRecent) emptyMsgRecent.style.display = 'none';
        if (emptyMsgFull) emptyMsgFull.style.display = 'none';

        historyLists.forEach(list => {
            list.innerHTML = '';
            // Si es la lista del dashboard ("recent-bets"), mostramos solo 3 o 5
            const isDashboard = list.classList.contains('recent-bets');
            const historyToShow = isDashboard ? betHistory.slice(0, 3) : betHistory; 

            historyToShow.forEach(record => {
                // LÓGICA DE DISEÑO DE TARJETA
                const statusClass = record.status.toLowerCase(); // 'pending', 'won', 'lost'
                const winnings = record.potentialWinnings;
                
                let iconHtml = '<i class="fa-solid fa-hourglass-half"></i>';
                if (statusClass === 'won') iconHtml = '<i class="fa-solid fa-trophy"></i>';
                if (statusClass === 'lost') iconHtml = '<i class="fa-solid fa-xmark"></i>';

                // Renderizar selecciones
                const selectionsHtml = record.selections.map(sel => 
                    `<div class="bet-selection-row">
                        <span>${sel.team}</span>
                        <span class="selection-odds">${parseFloat(sel.odds).toFixed(2)}</span>
                    </div>`
                ).join('');

                const listItem = document.createElement('li');
                listItem.className = `history-card-item ${statusClass}`;
                
                listItem.innerHTML = `
                    <div class="bet-card-header">
                        <span class="bet-date">${new Date(record.createdAt).toLocaleDateString()}</span>
                        <span class="bet-status-badge ${statusClass}">${iconHtml} ${record.status.toUpperCase()}</span>
                    </div>
                    <div class="bet-card-body">
                        ${selectionsHtml}
                    </div>
                    <div class="bet-card-footer">
                        <span>Apostado: <strong>Bs. ${record.stake.toFixed(2)}</strong></span>
                        <span class="bet-return" style="color:${statusClass === 'won' ? 'var(--color-success)' : 'inherit'}">
                            ${statusClass === 'won' ? 'Ganancia: ' : 'Retorno: '} 
                            <strong>Bs. ${winnings.toFixed(2)}</strong>
                        </span>
                    </div>
                `;
                list.appendChild(listItem);
            });
        });

    } catch (error) {
        console.error(error);
    }
}

// En js/account.js

export async function renderTransactionHistory() {
    const listContainer = document.querySelector('#historial-transacciones .history-list');
    if (!listContainer) return;

    const emptyMsg = document.querySelector('.empty-message-transactions');

    try {
        const transactions = await fetchWithAuth(`${API_BASE_URL}/user/transactions`); 

        if (transactions.length === 0) {
            if (emptyMsg) emptyMsg.style.display = 'block';
            return;
        }
        if (emptyMsg) emptyMsg.style.display = 'none';

        listContainer.innerHTML = '';

        transactions.forEach(tx => {
            const isDeposit = tx.type === 'deposit';
            const amount = tx.amount; 
            let statusClass = 'pending';
            if (tx.status === 'approved') statusClass = 'won';
            if (tx.status === 'rejected') statusClass = 'lost';

            const icon = isDeposit ? 'fa-arrow-down' : 'fa-arrow-up';
            const color = isDeposit ? 'var(--color-success)' : 'var(--color-loss)';
            const date = tx.createdAt || tx.date;

            // LÓGICA DEL MOTIVO (Nuevo diseño)
            let reasonHtml = '';
            if (tx.status === 'rejected' && tx.rejectionReason) {
                reasonHtml = `
                    <div style="margin-top: 12px; padding: 10px; background: rgba(239, 68, 68, 0.1); border-left: 3px solid #ef4444; border-radius: 4px; font-size: 0.9rem; color: #ff8a80;">
                        <i class="fa-solid fa-circle-exclamation" style="margin-right: 5px;"></i>
                        <strong>Motivo:</strong> ${tx.rejectionReason}
                    </div>
                `;
            }

            const listItem = document.createElement('li');
            listItem.className = 'history-card-item'; 
            listItem.style.borderLeft = `4px solid ${color}`;
            // Añadimos padding extra si hay motivo
            listItem.style.paddingBottom = reasonHtml ? '15px' : '12px';

            listItem.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div style="display: flex; align-items: center; gap: 15px;">
                        <div style="background:rgba(255,255,255,0.05); width:40px; height:40px; border-radius:50%; display:flex; align-items:center; justify-content:center;">
                            <i class="fa-solid ${icon}" style="color: ${color}; font-size:1.2rem;"></i>
                        </div>
                        <div>
                            <strong style="display: block; font-size:1rem;">${isDeposit ? 'Depósito' : 'Retiro'} (${tx.method || 'N/A'})</strong>
                            <small style="display: block; color: var(--color-text-secondary);">${new Date(date).toLocaleString('es-ES')}</small>
                        </div>
                    </div>
                    <div style="text-align: right;">
                        <span style="color: ${color}; font-weight: 700; font-size:1.1rem;">
                            ${isDeposit ? '+' : '-'} Bs. ${Math.abs(amount).toFixed(2)}
                        </span>
                        <span class="bet-status-badge ${statusClass}" style="display: inline-block; margin-top: 5px;">${tx.status.toUpperCase()}</span>
                    </div>
                </div>
                ${reasonHtml} <!-- AQUÍ SE MUESTRA EL MOTIVO -->
            `;
            listContainer.appendChild(listItem);
        });

    } catch (error) {
        console.error(error);
    }
}

// =======================================================================
//  5. LISTENERS DE FORMULARIOS Y ACCIONES
// =======================================================================

function handlePayoutMethodChange() {
    const methodTypeSelect = document.getElementById('method-type');
    const form = document.getElementById('payout-method-form');
    
    if (!methodTypeSelect || !form) return;

    // Cambiar campos dinámicos
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

    // Submit del formulario
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitButton = document.getElementById('add-method-btn');
        submitButton.disabled = true;
        submitButton.innerHTML = '<div class="spinner-sm"></div> Añadiendo...';
        
        try {
            const formData = new FormData(form);
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
            }

            await fetchWithAuth(`${API_BASE_URL}/user/payout-methods`, {
                method: 'POST',
                body: JSON.stringify(data)
            });

            showToast('Método de retiro añadido con éxito.', 'success');
            form.reset();
            methodTypeSelect.dispatchEvent(new Event('change')); // Resetear campos dinámicos
            loadPayoutMethods(); // Recargar lista
        } catch (error) {
            showToast(error.message || 'Error al añadir método.', 'error');
        } finally {
            submitButton.disabled = false;
            submitButton.textContent = 'Añadir Método';
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
        submitButton.innerHTML = '<div class="spinner-sm"></div> Guardando...';

        const birthDate = document.getElementById('birth-date').value;
        const ageWarning = document.getElementById('age-warning');

        if (birthDate && !isOver18(birthDate)) {
            ageWarning.classList.remove('hidden');
            submitButton.disabled = false;
            submitButton.textContent = 'Guardar Cambios';
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

            const result = await fetchWithAuth(`${API_BASE_URL}/user/user-data`, {
                method: 'PUT',
                body: JSON.stringify(data)
            });
            
            showToast(result.message || 'Datos actualizados.', 'success');
            await loadUserData();
        } catch (error) {
            showToast(error.message || 'Error al guardar.', 'error');
        } finally {
            submitButton.disabled = false;
            submitButton.textContent = 'Guardar Cambios';
        }
    });
    
    document.getElementById('phone')?.addEventListener('input', formatPhoneNumber);
}

async function handlePhoneVerification() {
    const verifyBtn = document.getElementById('verify-phone-btn');
    if (!verifyBtn) return;

    verifyBtn.addEventListener('click', async () => {
        if (verifyBtn.disabled) return;
        
        verifyBtn.disabled = true;
        verifyBtn.textContent = 'Enviando...';
        showToast('Solicitando código...');
        
        try {
            const data = await fetchWithAuth(`${API_BASE_URL}/user/request-phone-verification`, { method: 'POST' });
            showToast(data.message, 'success');
            openModal(document.getElementById('phone-verification-modal'));
        } catch (error) {
            showToast(error.message, 'error');
        } finally {
            verifyBtn.disabled = false;
            verifyBtn.textContent = 'Verificar Ahora';
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
            const data = await fetchWithAuth(`${API_BASE_URL}/user/verify-phone-code`, {
                method: 'POST',
                body: JSON.stringify({ code: codeInput.value })
            });

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
    const form = document.getElementById('password-change-form');
    if (!form) return;

    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const current = document.getElementById('current-password').value;
        const newer = document.getElementById('new-password').value;
        const confirm = document.getElementById('confirm-new-password').value;
        const btn = document.getElementById('change-password-btn');
        
        if (!current || !newer || !confirm) {
            showToast('Completa todos los campos.', 'error');
            return;
        }
        if (newer !== confirm) {
            showToast('Las contraseñas no coinciden.', 'error');
            return;
        }
        if (!passwordRegex.test(newer)) {
            showToast('La contraseña debe ser segura (Mayúscula, número, símbolo).', 'error');
            return;
        }

        btn.disabled = true;
        btn.innerHTML = '<div class="spinner-sm"></div> Procesando...';

        try {
            const data = await fetchWithAuth(`${API_BASE_URL}/user/change-password`, {
                method: 'POST',
                body: JSON.stringify({ currentPassword: current, newPassword: newer })
            });
            showToast(data.message, 'success');
            form.reset();
        } catch (error) {
            showToast(error.message, 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Cambiar Contraseña';
        }
    });
}

function handle2FASetup() {
    const statusContainer = document.getElementById('2fa-status-container');
    if (!statusContainer) return;

    let is2FAActive = localStorage.getItem('is2FAActive_simulated') === 'true';
    function render2FAState() {
        if (is2FAActive) {
            statusContainer.innerHTML = `
                <div style="display:flex; align-items:center; gap:10px; margin-bottom:10px;">
                    <i class="fa-solid fa-shield-halved" style="font-size:2rem; color:var(--color-success);"></i>
                    <div>
                        <h4 style="margin:0; color:var(--color-success);">2FA Activado</h4>
                        <small>Tu cuenta está protegida.</small>
                    </div>
                </div>
                <button class="btn btn-secondary btn-sm" id="disable-2fa-btn">Desactivar</button>
            `;
        } else {
            statusContainer.innerHTML = `
                <div style="display:flex; align-items:center; gap:10px; margin-bottom:10px;">
                    <i class="fa-solid fa-unlock" style="font-size:2rem; color:var(--color-text-secondary);"></i>
                    <div>
                        <h4 style="margin:0;">2FA Desactivado</h4>
                        <small>Añade una capa extra de seguridad.</small>
                    </div>
                </div>
                <button class="btn btn-primary btn-sm" id="enable-2fa-btn">Activar</button>
            `;
        }
    }
    
    render2FAState();
    
    statusContainer.addEventListener('click', (e) => {
        if (e.target.id === 'enable-2fa-btn') {
            showToast('2FA Activado (Simulación).', 'success');
            localStorage.setItem('is2FAActive_simulated', 'true');
            is2FAActive = true;
            render2FAState();
        } else if (e.target.id === 'disable-2fa-btn') {
            showToast('2FA Desactivado.', 'warning');
            localStorage.setItem('is2FAActive_simulated', 'false');
            is2FAActive = false;
            render2FAState();
        }
    });
}

// =======================================================================
//  6. INICIALIZADOR PRINCIPAL (EXPORTADO)
// =======================================================================

export async function initAccountDashboard() {
    
    // 1. Iniciamos la lógica visual (Pestañas) PRIMERO
    initTabs();

    // 2. Iniciamos la carga de datos (Asíncrona)
    loadUserData();
    loadPayoutMethods();
    renderBetHistory();
    renderTransactionHistory();

    // 3. Inicializamos los Listeners de formularios
    handleUserDataSubmit();
    handlePhoneVerification();
    handlePasswordChange();
    handlePayoutMethodChange();
    handle2FASetup();
    
    // 4. Inicializar secciones de Bonos y Juego Responsable
    initBonusSection();
    initResponsibleGaming();
    init2FASection();

    // 4. Delegación de eventos para la lista de métodos
    document.getElementById('payout-methods-list')?.addEventListener('click', async (e) => {
        const deleteBtn = e.target.closest('.delete-method-btn');
        const setPrimaryBtn = e.target.closest('.set-primary-btn');

        if (deleteBtn) {
            const methodId = deleteBtn.dataset.id;
             if (!confirm('¿Estás seguro de que quieres eliminar este método de retiro?')) return;
            try {
                await fetchWithAuth(`${API_BASE_URL}/user/payout-methods/${methodId}`, { method: 'DELETE' }); 
                showToast('Método eliminado con éxito.', 'success');
                loadPayoutMethods();
            } catch (error) {
                showToast(error.message, 'error');
            }
        } else if (setPrimaryBtn) {
            const methodId = setPrimaryBtn.dataset.id;
            try {
                await fetchWithAuth(`${API_BASE_URL}/user/payout-methods/${methodId}/primary`, { method: 'POST' }); 
                showToast('Método establecido como principal.', 'success');
                loadPayoutMethods();
            } catch (error) {
                showToast(error.message, 'error');
            }
        }
    });

    // 5. Link especial para abrir modal de retiro desde "Mis Datos"
    document.body.addEventListener('click', (e) => {
        if (e.target.classList.contains('edit-method-link')) {
            e.preventDefault();
            const withdrawModal = document.getElementById('withdraw-modal');
            if (withdrawModal) closeModal(withdrawModal);
            
            const targetLink = document.querySelector(`.account-menu-link[data-target="mis-datos"]`);
            if (targetLink) targetLink.click();
        }
    });
}