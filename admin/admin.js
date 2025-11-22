// Archivo: admin/admin.js (COMPLETO Y FUNCIONAL)

document.addEventListener('DOMContentLoaded', () => {

    // CONFIGURACIÓN API
    const API_URL = 'https://fortunabet-api.onrender.com/api'; 
    // Para pruebas locales descomenta la siguiente línea:
    // const API_URL = 'http://localhost:3001/api'; 

    // ELEMENTOS DOM
    const loginView = document.getElementById('login-view');
    const dashboardView = document.getElementById('dashboard-view');
    const loginForm = document.getElementById('login-form');
    const errorMessage = document.getElementById('error-message');
    const logoutBtn = document.getElementById('logout-btn');
    const refreshBtn = document.getElementById('refresh-btn');

    // ESTADO
    let authToken = localStorage.getItem('adminToken');
    let adminUser = JSON.parse(localStorage.getItem('adminUser'));

    // --- HELPERS ---

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
                logout();
                throw new Error('Sesión expirada o sin permisos.');
            }
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.message || 'Error en la API');
            }
            return await response.json();
        } catch (error) {
            console.error(error);
            throw error; // Propagar error para manejarlo en la llamada
        }
    }

    function formatCurrency(amount) {
        return `Bs. ${parseFloat(amount).toFixed(2)}`;
    }

    // --- AUTHENTICATION ---

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = loginForm.querySelector('button');
            const errorP = document.getElementById('error-message');
            
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner-sm"></span> Cargando...';
            errorP.style.display = 'none';

            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;

            try {
                const response = await fetch(`${API_URL}/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ identifier: email, password })
                });

                const data = await response.json();

                if (!response.ok) throw new Error(data.message);
                if (data.user.role !== 'admin') throw new Error('Acceso denegado: No eres administrador.');

                authToken = data.token;
                adminUser = data.user;
                localStorage.setItem('adminToken', authToken);
                localStorage.setItem('adminUser', JSON.stringify(adminUser));
                
                initDashboard();

            } catch (error) {
                errorP.textContent = error.message;
                errorP.style.display = 'block';
                btn.disabled = false;
                btn.textContent = 'Entrar al Panel';
            }
        });
    }

    function logout() {
        localStorage.removeItem('adminToken');
        localStorage.removeItem('adminUser');
        authToken = null;
        location.reload();
    }

    if (logoutBtn) logoutBtn.addEventListener('click', logout);

    // --- DASHBOARD LOGIC ---

    async function loadData() {
        if(!authToken) return;
        
        refreshBtn.disabled = true;
        refreshBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Cargando...';

        try {
            // Cargar todo en paralelo
            const [stats, pendingDeposits, pendingWithdrawals, users] = await Promise.all([
                apiFetch('/admin/stats'),
                apiFetch('/admin/deposits/pending'),
                apiFetch('/admin/withdrawals/pending'),
                apiFetch('/admin/users')
            ]);

            // 1. Render Stats
            document.getElementById('stat-users').textContent = stats.totalUsers;
            document.getElementById('stat-balance').textContent = formatCurrency(stats.totalBalance);
            document.getElementById('stat-deposits').textContent = stats.pendingDepositsCount;
            document.getElementById('stat-withdrawals').textContent = stats.pendingWithdrawalsCount;

            // 2. Render Users Table
            const usersBody = document.getElementById('users-body');
            usersBody.innerHTML = users.map(u => `
                <tr>
                    <td>
                        <strong>${u.username}</strong>
                        <small>${u.email}</small>
                    </td>
                    <td style="color: var(--primary); font-weight: bold;">
                        ${formatCurrency(u.balance)}
                    </td>
                </tr>
            `).join('');

            // 3. Render Deposits Table
            renderTable('deposits', pendingDeposits, (tx) => `
                <td>
                    <strong>${tx.fullName || tx.username}</strong>
                    <small>CI: ${tx.cedula || 'N/A'}</small>
                </td>
                <td>
                    <strong style="color: var(--primary)">${formatCurrency(tx.amount)}</strong>
                    <small>Ref: ${tx.reference}</small><br>
                    <small>Método: ${tx.method}</small>
                </td>
                <td>
                    <button class="btn btn-primary btn-sm" onclick="processTx('deposits', 'approve', '${tx._id}')" title="Aprobar"><i class="fa-solid fa-check"></i></button>
                    <button class="btn btn-danger btn-sm" onclick="processTx('deposits', 'reject', '${tx._id}')" title="Rechazar"><i class="fa-solid fa-xmark"></i></button>
                </td>
            `);

            // 4. Render Withdrawals Table
            renderTable('withdrawals', pendingWithdrawals, (tx) => {
                // Formatear detalles del método de pago
                let details = 'N/A';
                if(tx.methodDetails) {
                    if(tx.methodType === 'pago_movil') {
                        details = `Pago Móvil: ${tx.methodDetails.bank} - ${tx.methodDetails.phone}`;
                    } else {
                        details = `Zelle: ${tx.methodDetails.email}`;
                    }
                }

                return `
                <td>
                    <strong>${tx.fullName || tx.username}</strong>
                    <small>CI: ${tx.cedula || 'N/A'}</small>
                </td>
                <td>
                    <strong style="color: var(--danger)">${formatCurrency(tx.amount)}</strong>
                    <small>${details}</small>
                </td>
                <td>
                    <button class="btn btn-primary btn-sm" onclick="processTx('withdrawals', 'approve', '${tx._id}')" title="Marcar Pagado"><i class="fa-solid fa-check"></i></button>
                    <button class="btn btn-danger btn-sm" onclick="processTx('withdrawals', 'reject', '${tx._id}')" title="Rechazar"><i class="fa-solid fa-xmark"></i></button>
                </td>
            `});

        } catch (error) {
            console.error("Error cargando datos:", error);
            alert("Error cargando datos del panel. Revisa la consola.");
        } finally {
            refreshBtn.disabled = false;
            refreshBtn.innerHTML = '<i class="fa-solid fa-rotate"></i> Recargar Datos';
        }
    }

    function renderTable(type, data, rowHtmlGenerator) {
        const body = document.getElementById(`${type}-body`);
        const emptyMsg = document.getElementById(`${type}-empty`);
        
        body.innerHTML = '';
        
        if (data.length === 0) {
            emptyMsg.style.display = 'block';
        } else {
            emptyMsg.style.display = 'none';
            data.forEach(item => {
                const tr = document.createElement('tr');
                tr.innerHTML = rowHtmlGenerator(item);
                body.appendChild(tr);
            });
        }
    }

    // --- GLOBAL ACTION HANDLER ---
    // La hacemos global para que funcione con el onclick="" del HTML generado
    window.processTx = async (type, action, id) => {
        let confirmMsg = action === 'approve' ? "¿Aprobar esta transacción?" : "¿Rechazar esta transacción?";
        if (!confirm(confirmMsg)) return;

        let body = null;
        if (action === 'reject') {
            const reason = prompt("Motivo del rechazo (opcional):");
            if (reason === null) return; // Cancelar
            body = { reason: reason || "Rechazado por admin" };
        }

        try {
            await apiFetch(`/admin/${type}/${action}/${id}`, 'POST', body);
            loadData(); // Recargar datos
        } catch (error) {
            alert(error.message);
        }
    };

    if (refreshBtn) refreshBtn.addEventListener('click', loadData);

    // --- INIT ---
    function initDashboard() {
        loginView.style.display = 'none';
        dashboardView.style.display = 'block';
        document.getElementById('admin-email').textContent = adminUser.email;
        loadData();
    }

    if (authToken && adminUser) {
        initDashboard();
    } else {
        loginView.style.display = 'flex';
    }
});