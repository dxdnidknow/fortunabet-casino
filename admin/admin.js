// Archivo: admin/admin.js (COMPLETO Y MODIFICADO)
document.addEventListener('DOMContentLoaded', () => {

    // ==========================================================
    //  CONFIGURACIÓN
    // ==========================================================
    
    const API_URL = 'https://fortunabet-api.onrender.com/api'; 
    // const API_URL = 'http://localhost:3001/api'; 

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
        
        const options = { method, headers, mode: 'cors' };
        
        if (method === 'POST' || method === 'PUT') {
            headers.append('Content-Type', 'application/json');
            if(body) options.body = JSON.stringify(body);
        }

        try {
            const response = await fetch(`${API_URL}${endpoint}`, options);
            
            if (response.status === 401 || response.status === 403) {
                logout();
                throw new Error('Sesión inválida o permisos insuficientes.');
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
        showError('');

        try {
            const response = await fetch(`${API_URL}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                mode: 'cors',
                body: JSON.stringify({ identifier: email, password })
            });

            const data = await response.json();
            
            if (!response.ok) {
                 throw new Error(data.message || 'Credenciales inválidas.');
            }

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
        refreshBtn.innerHTML = '<i class="fa-solid fa-rotate fa-spin"></i>';
        
        try {
            const [deposits, withdrawals] = await Promise.all([
                apiFetch('/admin/deposits/pending'),
                apiFetch('/admin/withdrawals/pending')
            ]);
            
            renderDeposits(deposits);
            renderWithdrawals(withdrawals);

        } catch (error) {
            // El error ya se maneja en apiFetch
        } finally {
            refreshBtn.disabled = false;
            refreshBtn.innerHTML = '<i class="fa-solid fa-rotate"></i> Recargar';
        }
    }
    
    // --- Renderizado de Tablas ---
    
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
            depositsEmpty.style.display = 'block';
            return;
        }
        depositsEmpty.style.display = 'none';
        
        deposits.forEach(tx => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>
                    <strong>${tx.fullName || tx.username}</strong>
                    <div class="user-info">${tx.cedula || 'Cédula no registrada'}</div>
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
            withdrawalsEmpty.style.display = 'block';
            return;
        }
        withdrawalsEmpty.style.display = 'none';
        
        withdrawals.forEach(tx => {
            const row = document.createElement('tr');
            let info = 'Detalles no disponibles';
            if (tx.methodDetails) {
                info = Object.entries(tx.methodDetails)
                             .map(([key, value]) => `<strong>${key}:</strong> ${value}`)
                             .join('<br>');
            }

            row.innerHTML = `
                <td>
                    <strong>${tx.fullName || tx.username}</strong>
                    <div class="user-info">${tx.cedula || 'Cédula no registrada'}</div>
                </td>
                <td class="amount withdrawal">${tx.amount.toFixed(2)}</td>
                <td><small>${tx.methodType.replace('_', ' ')}<br>${info}</small></td>
                <td class="date-cell">${formatTxDate(tx.requestedAt)}</td>
                <td class="actions">
                    <button class="btn btn-primary btn-sm btn-approve-withdrawal" data-id="${tx._id}" title="Marcar como Pagado"><i class="fa-solid fa-check"></i></button>
                    <button class="btn btn-danger btn-sm btn-reject-withdrawal" data-id="${tx._id}" title="Rechazar y devolver fondos"><i class="fa-solid fa-xmark"></i></button>
                </td>
            `;
            withdrawalsBody.appendChild(row);
        });
    }

    // --- Acciones de Admin ---
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
            const reason = prompt('Motivo del rechazo (opcional, se guardará en la base de datos):');
            if (reason === null) return;
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
            return;
        }

        if (confirmMessage && !confirm(confirmMessage)) return;

        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-sm"></span>';

        try {
            await apiFetch(endpoint, 'POST', body);
            loadPendingData();
        } catch (error) {
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
        if (errorMessage) {
            errorMessage.textContent = msg;
            errorMessage.style.display = 'block';
        }
    }

    if (loginForm) {
        loginForm.addEventListener('submit', e => {
            e.preventDefault();
            showError('');
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
    
    if (dashboardView) {
        dashboardView.addEventListener('click', handleAdminAction);
    }

    if (authToken && adminUser) {
        initDashboard();
    } else {
        loginView.style.display = 'block';
        dashboardView.style.display = 'none';
    }
});