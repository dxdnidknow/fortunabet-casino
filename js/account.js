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
        const userData = await response.json();
        
        // Actualizar el UI del dashboard
        document.getElementById('user-display-name').textContent = userData.username;
        document.getElementById('user-display-balance').textContent = `Bs. ${userData.balance.toFixed(2)}`;
        const dashboardBalance = document.getElementById('dashboard-balance');
        if(dashboardBalance) dashboardBalance.textContent = `Bs. ${userData.balance.toFixed(2)}`;
        
        // Llenar el formulario de datos personales
        const form = document.getElementById('user-data-form');
        if (form) {
            document.getElementById('full-name').value = userData.fullName || '';
            document.getElementById('cedula').value = userData.cedula || '';
            document.getElementById('birth-date').value = userData.birthDate ? userData.birthDate.substring(0, 10) : '';
            document.getElementById('email').value = userData.email || '';
            const phoneInput = document.getElementById('phone');
            if (phoneInput) phoneInput.value = userData.phone ? userData.phone.replace('+58', '').replace(/\D/g, '').substring(0, 10) : '';

            // Mostrar estado de verificación
            const statusContainer = document.getElementById('phone-verification-status');
            const verifyBtn = document.getElementById('verify-phone-btn');
            if (statusContainer && verifyBtn) {
                if (userData.isPhoneVerified) {
                    statusContainer.innerHTML = `<p class="status-icon verified"><i class="fa-solid fa-circle-check"></i> Teléfono Verificado</p>`;
                    verifyBtn.textContent = 'Modificar';
                } else {
                    statusContainer.innerHTML = `<p class="status-icon unverified"><i class="fa-solid fa-triangle-exclamation"></i> Pendiente de Verificación</p>`;
                    verifyBtn.textContent = 'Verificar';
                }
            }
        }
    } catch (error) {
        showToast('Error al cargar datos de usuario. Intenta recargar.', 'error');
    }
}

// =======================================================================
//  2. MÉTODOS DE RETIRO (NUEVO)
// =======================================================================

/** Renderiza un método de retiro en la lista */
function renderPayoutMethod(method) {
    let detailsHtml = '';
    const details = method.details || {};

    if (method.methodType === 'pago_movil') {
        detailsHtml = `
            Banco: ${details.bank || 'N/A'} / 
            Cédula: ${details.cedula || 'N/A'} / 
            Teléfono: ${details.phone || 'N/A'}
        `;
    } else if (method.methodType === 'zelle') {
        detailsHtml = `
            Email: ${details.email || 'N/A'} / 
            Nombre: ${details.name || 'N/A'}
        `;
    } else if (method.methodType === 'usdt') {
        detailsHtml = `
            Red: ${details.network || 'N/A'} / 
            Dirección: <code>${(details.address || 'N/A').substring(0, 10)}...</code>
        `;
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

/** Carga y renderiza los métodos de retiro guardados por el usuario. */
export async function loadPayoutMethods() {
    const listContainer = document.getElementById('payout-methods-list');
    const withdrawSelect = document.getElementById('withdraw-method');
    if (!listContainer) return;
    
    try {
        // Llama a la nueva ruta en tu backend (debes crearla)
        const response = await fetchWithAuth(`${API_BASE_URL}/payout-methods`); 
        const methods = await response.json();

        listContainer.innerHTML = ''; // Limpiar lista
        const emptyMessage = document.querySelector('.empty-message-payout');
        
        // Limpiar el select del modal de retiro
        if (withdrawSelect) {
            withdrawSelect.innerHTML = '';
        }

        if (methods.length === 0) {
            if (emptyMessage) emptyMessage.style.display = 'block';
             if (withdrawSelect) {
                withdrawSelect.innerHTML = '<option value="">Añade un método en Mi Cuenta</option>';
            }
            return;
        }

        if (emptyMessage) emptyMessage.style.display = 'none';
        
        const ul = document.createElement('ul');
        ul.classList.add('payout-list');

        methods.forEach(method => {
            // Renderizar en Mi Cuenta
            ul.appendChild(renderPayoutMethod(method));

            // Llenar el selector del modal de retiro
            if (withdrawSelect) {
                const option = document.createElement('option');
                const details = method.details;
                let text = '';
                if (method.methodType === 'pago_movil') {
                    text = `Pago Móvil (${details.bank} - C.I. ${details.cedula.substring(details.cedula.length - 4)})`;
                } else if (method.methodType === 'zelle') {
                    text = `Zelle (${details.email})`;
                } else if (method.methodType === 'usdt') {
                    text = `USDT ${details.network.toUpperCase()} (Dir: ${details.address.substring(0, 6)}...)`;
                }

                option.value = method._id;
                option.textContent = text + (method.isPrimary ? ' (Principal)' : '');
                withdrawSelect.appendChild(option);
            }
        });
        
        listContainer.appendChild(ul);

    } catch (error) {
        showToast(`Error al cargar métodos: ${error.message || 'Error de conexión'}`, 'error');
    }
}

// =======================================================================
//  3. LISTENERS Y MANEJADORES DE EVENTOS
// =======================================================================

function handlePayoutMethodChange() {
    const methodTypeSelect = document.getElementById('method-type');
    if (!methodTypeSelect) return;

    // Listener para mostrar/ocultar campos dinámicos
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

    // Listener para enviar el nuevo método
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

            // Llenar los detalles basados en el tipo de método
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
            methodTypeSelect.dispatchEvent(new Event('change')); // Ocultar campos
            loadPayoutMethods(); // Recargar la lista

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

        if (!isOver18(birthDate)) {
            ageWarning.classList.remove('hidden');
            submitButton.disabled = false;
            return;
        } else {
            ageWarning.classList.add('hidden');
        }

        try {
            const formData = new FormData(userDataForm);
            const data = {
                fullName: formData.get('full-name'),
                cedula: formData.get('cedula'),
                birthDate: birthDate,
                phone: '+58' + formData.get('phone').replace(/\D/g, '')
            };

            const response = await fetchWithAuth(`${API_BASE_URL}/user-data`, {
                method: 'PUT',
                body: JSON.stringify(data)
            });
            const result = await response.json();

            if (!response.ok) throw new Error(result.message);

            showToast(result.message || 'Datos actualizados con éxito.', 'success');
            loadUserData(); // Recargar los datos después de guardar

        } catch (error) {
            showToast(error.message || 'Error al guardar los datos.', 'error');
        } finally {
            submitButton.disabled = false;
        }
    });
    
    // Listener para formatear el teléfono
    document.getElementById('phone')?.addEventListener('input', formatPhoneNumber);
}

function handlePhoneVerification() {
    const verifyBtn = document.getElementById('verify-phone-btn');
    if (!verifyBtn) return;

    // Aquí iría la lógica para enviar el OTP y verificarlo
    verifyBtn.addEventListener('click', () => {
        showToast('La función de verificación de teléfono aún no está implementada completamente en el backend.', 'info');
        // Implementación futura: enviar OTP, abrir modal para el código
    });
}


function handlePasswordChange() {
    const passwordChangeForm = document.getElementById('password-change-form');
    if (!passwordChangeForm) return;

    let isCodeStep = false;
    const confirmationGroup = document.getElementById('confirmation-code-group');
    const submitButton = document.getElementById('change-password-btn');

    passwordChangeForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const currentPassword = document.getElementById('current-password').value;
        const newPassword = document.getElementById('new-password').value;
        const confirmNewPassword = document.getElementById('confirm-new-password').value;

        if (newPassword !== confirmNewPassword) {
            showToast('La nueva contraseña y su confirmación no coinciden.', 'error');
            return;
        }

        submitButton.disabled = true;

        if (!isCodeStep) {
            try {
                // Paso 1: Solicitar código de confirmación por email
                const response = await fetchWithAuth(`${API_BASE_URL}/request-password-change-code`, {
                    method: 'POST'
                });
                const data = await response.json();
                if (!response.ok) throw new Error(data.message);

                showToast(data.message, 'info');
                confirmationGroup.classList.remove('hidden');
                submitButton.textContent = 'Confirmar Cambio';
                isCodeStep = true;
            } catch (error) {
                showToast(error.message, 'error');
            } finally {
                submitButton.disabled = false;
            }
        } else {
            const code = document.getElementById('confirmation-code').value;
            try {
                // Paso 2: Enviar la nueva contraseña y el código
                const response = await fetchWithAuth(`${API_BASE_URL}/change-password`, {
                    method: 'POST',
                    body: JSON.stringify({ currentPassword, newPassword, code })
                });
                const data = await response.json();
                if (!response.ok) throw new Error(data.message);

                showToast(data.message, 'success');
                passwordChangeForm.reset();
                confirmationGroup.classList.add('hidden');
                submitButton.textContent = 'Cambiar Contraseña';
                isCodeStep = false;
            } catch (error) {
                showToast(error.message, 'error');
            } finally {
                submitButton.disabled = false;
            }
        }
    });
}

function handle2FASetup() {
    const statusContainer = document.getElementById('2fa-status-container');
    if (!statusContainer) return;

    // Lógica para simular si el 2FA está activo
    const is2FAActive = localStorage.getItem('is2FAActive') === 'true';

    function render2FAState() {
        if (is2FAActive) {
            statusContainer.innerHTML = `
                <p class="status-icon verified"><i class="fa-solid fa-circle-check"></i> 2FA Activo</p>
                <p>Tu cuenta está protegida.</p>
                <button class="btn btn-secondary mt-10" id="disable-2fa-btn">Desactivar 2FA</button>
            `;
        } else {
            statusContainer.innerHTML = `
                <p class="status-icon unverified"><i class="fa-solid fa-triangle-exclamation"></i> 2FA Desactivado</p>
                <p>Añade 2FA para una mayor seguridad.</p>
                <button class="btn btn-primary mt-10" id="enable-2fa-btn">Activar 2FA</button>
            `;
        }
    }

    render2FAState();
    
    // Listener para simular la activación/desactivación
    statusContainer.addEventListener('click', (e) => {
        if (e.target.id === 'enable-2fa-btn') {
            // Simular el proceso de escaneo de QR y confirmación
            showToast('Simulando activación de 2FA. ¡Tu cuenta ahora está más segura!', 'success');
            localStorage.setItem('is2FAActive', 'true');
            handle2FASetup(); // Recargar estado
        } else if (e.target.id === 'disable-2fa-btn') {
            showToast('2FA desactivado. ¡Protege tu cuenta!', 'warning');
            localStorage.setItem('is2FAActive', 'false');
            handle2FASetup(); // Recargar estado
        }
    });
}

/** Inicializa el panel de cuenta y todos sus manejadores */
export async function initAccountDashboard() {
    
    // Configuración del menú de navegación del dashboard
    document.querySelectorAll('.account-menu-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = e.currentTarget.dataset.target;
            
            // Ocultar todas las secciones
            document.querySelectorAll('.account-section').forEach(section => {
                section.classList.remove('active');
            });
            // Mostrar la sección objetivo
            const targetSection = document.getElementById(targetId);
            if (targetSection) targetSection.classList.add('active');

            // Actualizar la clase activa del menú
            document.querySelectorAll('.account-menu-link').forEach(l => l.classList.remove('active'));
            e.currentTarget.classList.add('active');
            
            // Actualizar el hash de la URL para guardar la posición
            window.location.hash = targetId;
        });
    });

    // Cargar la vista basada en el hash de la URL si existe
    if (window.location.hash) {
        const targetId = window.location.hash.substring(1);
        const targetLink = document.querySelector(`.account-menu-link[data-target="${targetId}"]`);
        if (targetLink) targetLink.click();
    }


    await loadUserData();
    await loadPayoutMethods(); // <--- LLAMADA CLAVE AÑADIDA AQUÍ

    handleUserDataSubmit();
    handlePhoneVerification();
    handlePasswordChange();
    handlePayoutMethodChange();
    handle2FASetup();

    // Redirigir el enlace de "Administrar métodos" del modal de retiro
    const editMethodLink = document.querySelector('.edit-method-link');
    if (editMethodLink) {
        editMethodLink.addEventListener('click', (e) => {
            e.preventDefault();
            const withdrawModal = document.getElementById('withdraw-modal');
            if (withdrawModal) closeModal(withdrawModal);
            
            const targetLink = document.querySelector(`.account-menu-link[data-target="mis-datos"]`);
            if (targetLink) {
                 setTimeout(() => {
                    targetLink.click();
                 }, 50); 
            }
        });
    }

    // Agregar listeners para eliminar/establecer como principal
    document.getElementById('payout-methods-list')?.addEventListener('click', async (e) => {
        const deleteBtn = e.target.closest('.delete-method-btn');
        const setPrimaryBtn = e.target.closest('.set-primary-btn');

        if (deleteBtn) {
            const methodId = deleteBtn.dataset.id;
             if (!confirm('¿Estás seguro de que quieres eliminar este método de retiro?')) return;
            try {
                // Llama a la nueva ruta en tu backend (debes crearla)
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
                // Llama a la nueva ruta en tu backend (debes crearla)
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