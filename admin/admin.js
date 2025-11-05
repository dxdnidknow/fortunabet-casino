// Archivo: admin/admin.js (COMPLETO Y MODIFICADO)
document.addEventListener('DOMContentLoaded', () => {

    // ==========================================================
    //  CONFIGURACIÓN
    // ==========================================================
    
    // APUNTAMOS A TU API EN PRODUCCIÓN (RENDER)
    const API_URL = 'https://fortunabet-api.onrender.com/api'; 
    // const API_URL = 'http://localhost:3001/api'; // (Descomenta esta línea si trabajas en local)

    // === CONSTANTES Y ELEMENTOS DEL DOM ===
    const loginView = document.getElementById('login-view');
    const dashboardView = document.getElementById('dashboard-view');
    const loginForm = document.getElementById('login-form');
    const errorMessage = document.getElementById('error-message');
    const adminEmailSpan = document.getElementById('admin-email');
    const logoutBtn = document.getElementById('logout-btn');
    const refreshBtn = document.getElementById('refresh-btn');

    const depositsBody = document.getElementById('deposits-body');
    const depositsEmpty = document.getElementById('deposits-empty');
    const withdrawalsBody = document.getElementById('withdrawals-body');
    const withdrawalsEmpty = document.getElementById('withdrawals-empty');

    let authToken = localStorage.getItem('adminToken');
    let adminUser = JSON.parse(localStorage.getItem('adminUser'));

    // === FUNCIONES DE API ===

    /**
     * Realiza una petición fetch autenticada a la API.
     */
    async function apiFetch(endpoint, method = 'GET', body = null) {
        const headers = new Headers();
        headers.append('Authorization', `Bearer ${authToken}`);
        
        const options = { method, headers, mode: 'cors' }; // Habilitar CORS
        
        if (method === 'POST' || method === 'PUT') {
            headers.append('Content-Type', 'application/json');
            if(body) options.body = JSON.stringify(body);
        }

        try {
            const response = await fetch(`${API_URL}${endpoint}`, options);
            
            if (response.status === 401 || response.status === 403) {
                // Si el token es inválido o no es admin
                logout();
                throw new Error('Sesión inválida o permisos insuficientes.');
            }
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.message || 'Error en la petición');
            }
            if (response.status === 204) return null; // No content
            return await response.json();
        } catch (error) {
            console.error(`Error en fetch a ${endpoint}:`, error);
            showError(error.message);
            throw error; // Propagar el error para que sea manejado por quien llamó
        }
    }

    // --- Autenticación ---
    async function login(email, password) {
        const submitButton = loginForm.querySelector('button[type="submit"]');
        submitButton.disabled = true;
        submitButton.innerHTML = '<span class="spinner-sm"></span> Entrando...';
        showError(''); // Limpiar errores

        try {
            // Usamos /api/login (la ruta de auth.js), que es pública
            const response = await fetch(`${API_URL}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                mode: 'cors', // Habilitar CORS
                body: JSON.stringify({ identifier: email, password })
            });

            const data = await response.json();
            
            if (!response.ok) {
                 throw new Error(data.message || 'Credenciales inválidas.');
            }

            // ¡Clave! Verificamos que sea un admin
            if (data.user.role !== 'admin') {
                throw new Error('No tienes permisos de administrador.');
            }

            authToken = data.token;
            adminUser = data.user;
            localStorage.setItem('adminToken', authToken);
            localStorage.setItem('adminUser', JSON.stringify(adminUser));
            
            initDashboard();
        } catch (error) {
            showError(error.message);
            submitButton.disabled = false;
            submitButton.innerHTML = 'Entrar';
        }
    }

    function logout() {
        localStorage.removeItem('adminToken');
        localStorage.removeItem('adminUser');
        authToken = null;
        adminUser = null;
        loginView.style.display = 'block';
        dashboardView.style.display = 'none';
    }

    // --- Cargar Datos ---
    async function loadPendingData() {
        if (!refreshBtn) return;
        refreshBtn.disabled = true;
        refreshBtn.innerHTML = '<i class="fa-solid fa-rotate fa-spin"></i>'; // Icono de spin
        
        try {
            // Cargar depósitos y retiros en paralelo
            const [deposits, withdrawals] = await Promise.all([
                apiFetch('/admin/deposits/pending'),
                apiFetch('/admin/withdrawals/pending')
            ]);
            
            renderDeposits(deposits);
            renderWithdrawals(withdrawals);

        } catch (error) {
            // El error ya se muestra en apiFetch
        } finally {
            refreshBtn.disabled = false;
            refreshBtn.innerHTML = '<i class="fa-solid fa-rotate"></i> Recargar';
        }
    }
    
    // --- Renderizado de Tablas ---
    
    /**
     * Formatea una fecha ISO (ej. 2025-11-04T...) a un formato legible (ej. 04/11 8:30 PM)
     */
    function formatTxDate(isoDate) {
        if (!isoDate) return 'N/A';
        const date = new Date(isoDate);
        return date.toLocaleString('es-VE', { 
            day: '2-digit', 
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true 
        });
    }

    function renderDeposits(deposits) {
        depositsBody.innerHTML = '';
        if (!deposits || deposits.length === 0) {
            depositsEmpty.style.display = 'table-row'; // Mostrar mensaje de vacío
            return;
        }
        depositsEmpty.style.display = 'none';
        
        deposits.forEach(tx => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>
                    ${tx.username}
                    <div class="user-info">${tx.userEmail}</div>
                </td>
                <td class="amount">${tx.amount.toFixed(2)}</td>
                <td>
                    <small>${tx.method}</small>
                    <strong>${tx.reference || 'N/A'}</strong>
                </td>
                <td class="date-cell">${formatTxDate(tx.createdAt)}</td>
                <td class="actions">
                    <button class="btn btn-primary btn-sm btn-approve-deposit" data-id="${tx._id}" title="Aprobar"><i class="fa-solid fa-check"></i></button>
                    <button class="btn btn-danger btn-sm btn-reject-deposit" data-id="${tx._id}" title="Rechazar"><i class="fa-solid fa-xmark"></i></button>
                </td>
            `;
            depositsBody.appendChild(row);
        });
    }

    function renderWithdrawals(withdrawals) {
        withdrawalsBody.innerHTML = '';
        if (!withdrawals || withdrawals.length === 0) {
            withdrawalsEmpty.style.display = 'table-row'; // Mostrar mensaje de vacío
            return;
        }
        withdrawalsEmpty.style.display = 'none';
        
        withdrawals.forEach(tx => {
            const row = document.createElement('tr');
            let info = 'Detalles no disponibles';
            if (tx.methodDetails) {
                info = Object.entries(tx.methodDetails).map(([key, value]) => `${key}: ${value}`).join('<br>');
            }

            row.innerHTML = `
                <td>
                    ${tx.username}
                    <div class="user-info">ID: ${tx.userId}</div>
                </td>
                <td class="amount withdrawal">${tx.amount.toFixed(2)}</td>
                <td><small>${info}</small></td>
                <td class="date-cell">${formatTxDate(tx.requestedAt)}</td>
                <td class="actions">
                    <button class="btn btn-primary btn-sm btn-approve-withdrawal" data-id="${tx._id}" title="Marcar como Pagado"><i class="fa-solid fa-check"></i></button>
                    <button class="btn btn-danger btn-sm btn-reject-withdrawal" data-id="${tx._id}" title="Rechazar y devolver fondos"><i class="fa-solid fa-xmark"></i></button>
                </td>
            `;
            withdrawalsBody.appendChild(row);
        });
    }

    // --- Acciones de Admin (Con Estados de Carga) ---
    async function handleAdminAction(e) {
        const btn = e.target.closest('button');
        if (!btn || !btn.dataset.id) return; // No es un botón de acción

        const id = btn.dataset.id;
        const originalHtml = btn.innerHTML;
        let endpoint = '';
        let body = null;
        let confirmMessage = '';

        if (btn.classList.contains('btn-approve-deposit')) {
            endpoint = `/admin/deposits/approve/${id}`;
            confirmMessage = '¿Seguro que quieres APROBAR este depósito? El saldo del usuario se incrementará.';
        } else if (btn.classList.contains('btn-reject-deposit')) {
            endpoint = `/admin/deposits/reject/${id}`;
            const reason = prompt('Motivo del rechazo (opcional, se guardará en la base de datos):');
            if (reason === null) return; // Si presiona "Cancelar"
            body = { reason: reason || 'Rechazado por admin' };
        } else if (btn.classList.contains('btn-approve-withdrawal')) {
            endpoint = `/admin/withdrawals/approve/${id}`;
            confirmMessage = '¡IMPORTANTE! ¿Seguro que ya realizaste la transferencia manual y quieres marcar este retiro como PAGADO?';
        } else if (btn.classList.contains('btn-reject-withdrawal')) {
            endpoint = `/admin/withdrawals/reject/${id}`;
            const reason = prompt('Motivo del rechazo (Los fondos serán DEVUELTOS al saldo del usuario):');
            if (reason === null) return;
            body = { reason: reason || 'Rechazado por admin' };
        } else {
            return; // No es un botón de acción de tabla
        }

        if (confirmMessage && !confirm(confirmMessage)) return;

        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-sm"></span>';

        try {
            await apiFetch(endpoint, 'POST', body);
            loadPendingData(); // Recargar ambas tablas
        } catch (error) {
            // El error ya se muestra en apiFetch, solo restauramos el botón
            btn.disabled = false;
            btn.innerHTML = originalHtml;
        }
        // No restauramos el botón aquí, porque la tabla se va a recargar
    }

    // === INICIALIZACIÓN Y EVENT LISTENERS ===
    function initDashboard() {
        loginView.style.display = 'none';
        dashboardView.style.display = 'block';
        adminEmailSpan.textContent = `(${adminUser.email})`;
        loadPendingData();
    }

    function showError(msg) {
        if (errorMessage) {
            errorMessage.textContent = msg;
            errorMessage.style.display = 'block';
        }
    }

    // --- Listeners ---
    if (loginForm) {
        loginForm.addEventListener('submit', e => {
            e.preventDefault();
            showError(''); // Limpiar errores
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            login(email, password);
        });
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', logout);
    }
    
    if (refreshBtn) {
        refreshBtn.addEventListener('click', loadPendingData);
    }
    
    // Event delegation para los botones de las tablas
    if (dashboardView) {
        dashboardView.addEventListener('click', handleAdminAction);
    }

    // Chequeo inicial al cargar
    if (authToken && adminUser) {
        // Intenta cargar el dashboard. Si el token es inválido, apiFetch llamará a logout().
        initDashboard();
    } else {
        loginView.style.display = 'block';
        dashboardView.style.display = 'none';
    }
});