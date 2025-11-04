// Archivo: admin/admin.js
document.addEventListener('DOMContentLoaded', () => {

    // === CONSTANTES Y ELEMENTOS DEL DOM ===
    const API_URL = 'http://localhost:3001/api'; // La URL de tu backend
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

    async function apiFetch(endpoint, method = 'GET', body = null) {
        const headers = new Headers();
        headers.append('Authorization', `Bearer ${authToken}`);
        
        const options = { method, headers };
        
        if (method === 'POST' || method === 'PUT') {
            headers.append('Content-Type', 'application/json');
            if(body) options.body = JSON.stringify(body);
        }

        try {
            const response = await fetch(`${API_URL}${endpoint}`, options);
            
            if (response.status === 401 || response.status === 403) {
                logout(); // Token inválido o expirado
            }
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.message || 'Error en la petición');
            }
            if (response.status === 204) return null;
            return await response.json();
        } catch (error) {
            console.error(`Error en fetch a ${endpoint}:`, error);
            showError(error.message);
            throw error;
        }
    }

    // --- Autenticación ---
    async function login(email, password) {
        const submitButton = loginForm.querySelector('button[type="submit"]');
        submitButton.disabled = true;
        submitButton.innerHTML = '<span class="spinner-sm"></span> Entrando...';

        try {
            // Usamos /api/login (la ruta de auth.js), no /api/admin/login
            const data = await fetch(`${API_URL}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ identifier: email, password })
            }).then(res => res.json());
            
            if (!data.token) {
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
        refreshBtn.disabled = true;
        refreshBtn.innerHTML = '<i class="fa-solid fa-rotate-right fa-spin"></i>';
        
        try {
            // Cargar depósitos
            const deposits = await apiFetch('/admin/deposits/pending');
            renderDeposits(deposits);

            // Cargar retiros
            const withdrawals = await apiFetch('/admin/withdrawals/pending');
            renderWithdrawals(withdrawals);

        } catch (error) {
            showError('No se pudieron cargar los datos pendientes.');
        } finally {
            refreshBtn.disabled = false;
            refreshBtn.innerHTML = '<i class="fa-solid fa-rotate-right"></i> Recargar';
        }
    }
    
    // --- Renderizado de Tablas ---
    function renderDeposits(deposits) {
        depositsBody.innerHTML = '';
        if (deposits.length === 0) {
            depositsEmpty.style.display = 'block';
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
                <td>${tx.reference || 'N/A'} (${tx.method})</td>
                <td class="actions">
                    <button class="btn btn-primary btn-sm btn-approve-deposit" data-id="${tx._id}">Aprobar</button>
                    <button class="btn btn-danger btn-sm btn-reject-deposit" data-id="${tx._id}">Rechazar</button>
                </td>
            `;
            depositsBody.appendChild(row);
        });
    }

    function renderWithdrawals(withdrawals) {
        withdrawalsBody.innerHTML = '';
        if (withdrawals.length === 0) {
            withdrawalsEmpty.style.display = 'block';
            return;
        }
        withdrawalsEmpty.style.display = 'none';
        withdrawals.forEach(tx => {
            const row = document.createElement('tr');
            let info = JSON.stringify(tx.payoutInfo); 
            row.innerHTML = `
                <td>
                    ${tx.username}
                    <div class="user-info">${tx.userEmail} (Saldo: ${tx.userBalance.toFixed(2)})</div>
                </td>
                <td class="amount withdrawal">${tx.amount.toFixed(2)}</td>
                <td><small>${info.replace(/["{}]/g, ' ').replace(/,/g, '<br>')}</small></td>
                <td class="actions">
                    <button class="btn btn-primary btn-sm btn-approve-withdrawal" data-id="${tx._id}">Hecho</button>
                    <button class="btn btn-danger btn-sm btn-reject-withdrawal" data-id="${tx._id}">Rechazar</button>
                </td>
            `;
            withdrawalsBody.appendChild(row);
        });
    }

    // --- Acciones de Admin (Con Estados de Carga) ---
    async function handleAdminAction(e) {
        const btn = e.target.closest('button');
        if (!btn || !btn.dataset.id) return;

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
            const reason = prompt('Motivo del rechazo (opcional):');
            if (reason === null) return;
            body = { reason };
        } else if (btn.classList.contains('btn-approve-withdrawal')) {
            endpoint = `/admin/withdrawals/approve/${id}`;
            confirmMessage = '¿Seguro que ya realizaste la transferencia manual y quieres marcar este retiro como HECHO?';
        } else if (btn.classList.contains('btn-reject-withdrawal')) {
            endpoint = `/admin/withdrawals/reject/${id}`;
            const reason = prompt('Motivo del rechazo (fondos serán devueltos al usuario):');
            if (reason === null) return;
            body = { reason };
        } else {
            return;
        }

        if (confirmMessage && !confirm(confirmMessage)) return;

        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-sm"></span>';

        try {
            await apiFetch(endpoint, 'POST', body);
            loadPendingData(); // Recargar todo
        } catch (error) {
            showError(error.message);
            btn.disabled = false;
            btn.innerHTML = originalHtml;
        }
    }

    // === INICIALIZACIÓN Y EVENT LISTENERS ===
    function initDashboard() {
        loginView.style.display = 'none';
        dashboardView.style.display = 'block';
        adminEmailSpan.textContent = `(${adminUser.email})`;
        loadPendingData();
    }

    function showError(msg) {
        errorMessage.textContent = msg;
        errorMessage.style.display = 'block';
    }

    loginForm.addEventListener('submit', e => {
        e.preventDefault();
        showError(''); // Limpiar errores
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        login(email, password);
    });

    logoutBtn.addEventListener('click', logout);
    refreshBtn.addEventListener('click', loadPendingData);
    
    // Event delegation para los botones de las tablas
    dashboardView.addEventListener('click', handleAdminAction);

    // Chequeo inicial al cargar
    if (authToken && adminUser) {
        initDashboard();
    }
});