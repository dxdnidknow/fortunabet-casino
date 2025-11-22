// Archivo: admin/admin.js (PROFESIONAL 3.0)

document.addEventListener('DOMContentLoaded', () => {

    const API_URL = 'https://fortunabet-api.onrender.com/api'; 
    // const API_URL = 'http://localhost:3001/api'; 

    let authToken = localStorage.getItem('adminToken');
    let adminUser = JSON.parse(localStorage.getItem('adminUser'));
    let revenueChart = null; // Variable para la gráfica

    // Estado local para datos (para búsqueda y paginación)
    let state = {
        users: [],
        deposits: [],
        withdrawals: []
    };

    // --- HELPERS ---
    async function apiFetch(endpoint, method = 'GET', body = null) {
        const headers = new Headers({ 'Authorization': `Bearer ${authToken}` });
        const options = { method, headers };
        if (method !== 'GET') {
            headers.append('Content-Type', 'application/json');
            if(body) options.body = JSON.stringify(body);
        }
        const res = await fetch(`${API_URL}${endpoint}`, options);
        if (res.status === 401) { logout(); throw new Error('Expirado'); }
        if (!res.ok) throw new Error('Error API');
        return await res.json();
    }

    function formatCurrency(amount) {
        return new Intl.NumberFormat('es-VE', { style: 'currency', currency: 'VES' }).format(amount).replace('VES', 'Bs.');
    }

    // --- LOGIN ---
    document.getElementById('login-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            const data = await apiFetch('/login', 'POST', { identifier: email, password }); // Usamos fetch normal aquí en realidad
            // Nota: Login usa una ruta pública, así que lo hacemos manual para no usar el token que no tenemos
            
            // (Replicamos la llamada manual porque apiFetch pide token)
            const res = await fetch(`${API_URL}/login`, {
                method: 'POST',
                headers: {'Content-Type':'application/json'},
                body: JSON.stringify({ identifier: email, password })
            });
            const loginData = await res.json();
            if(!res.ok) throw new Error(loginData.message);
            if(loginData.user.role !== 'admin') throw new Error('Acceso denegado');

            localStorage.setItem('adminToken', loginData.token);
            localStorage.setItem('adminUser', JSON.stringify(loginData.user));
            location.reload();
        } catch (err) {
            const errP = document.getElementById('error-message');
            errP.textContent = err.message;
            errP.style.display = 'block';
        }
    });

    function logout() {
        localStorage.clear();
        location.reload();
    }
    document.getElementById('logout-btn')?.addEventListener('click', logout);

    // --- NAVIGATION ---
    document.querySelectorAll('.nav-link').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.nav-link').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
            
            btn.classList.add('active');
            document.getElementById(btn.dataset.target).classList.add('active');
        });
    });

    // --- DATA LOADING & RENDERING ---
    async function loadDashboard() {
        try {
            const [stats, users, deposits, withdrawals, revenue] = await Promise.all([
                apiFetch('/admin/stats'),
                apiFetch('/admin/users'),
                apiFetch('/admin/deposits/pending'),
                apiFetch('/admin/withdrawals/pending'),
                apiFetch('/admin/analytics/revenue') // Nueva ruta para gráfica
            ]);

            // Guardar en estado para filtrar después
            state.users = users;
            state.deposits = deposits;
            state.withdrawals = withdrawals;

            // Stats Cards
            document.getElementById('stat-users').textContent = stats.totalUsers;
            document.getElementById('stat-balance').textContent = formatCurrency(stats.totalBalance);
            document.getElementById('stat-pending').textContent = stats.pendingDepositsCount + stats.pendingWithdrawalsCount;

            // Badges en Sidebar
            updateBadge('badge-deposits', stats.pendingDepositsCount);
            updateBadge('badge-withdrawals', stats.pendingWithdrawalsCount);

            // Renderizar tablas iniciales
            renderUsersTable(state.users);
            renderDepositsTable(state.deposits);
            renderWithdrawalsTable(state.withdrawals);

            // Renderizar Gráfica
            renderRevenueChart(revenue);

        } catch (error) {
            console.error(error);
        }
    }

    function updateBadge(id, count) {
        const el = document.getElementById(id);
        el.textContent = count;
        el.classList.toggle('hidden', count === 0);
    }

    // --- TABLE RENDERERS (Con Paginación Simple) ---
    function renderTable(id, data, columnsFn, page = 1, perPage = 10) {
        const tbody = document.getElementById(id);
        const paginationDiv = document.getElementById(id.replace('body', 'pagination')); // users-body -> users-pagination
        
        if(data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 20px;">Sin datos encontrados</td></tr>';
            paginationDiv.innerHTML = '';
            return;
        }

        const start = (page - 1) * perPage;
        const pagedData = data.slice(start, start + perPage);
        
        tbody.innerHTML = pagedData.map(columnsFn).join('');

        // Controles de Paginación
        const totalPages = Math.ceil(data.length / perPage);
        if (totalPages > 1) {
            let html = '';
            for(let i=1; i<=totalPages; i++) {
                html += `<button class="page-btn ${i===page?'active':''}" onclick="changePage('${id}', ${i})">${i}</button>`;
            }
            paginationDiv.innerHTML = html;
        } else {
            paginationDiv.innerHTML = '';
        }
    }

    // Funciones específicas para cada tabla
    const renderUsersTable = (data) => renderTable('users-body', data, u => `
        <tr>
            <td><div style="font-weight:bold">${u.username}</div></td>
            <td>${u.email}</td>
            <td>${u.personalInfo?.cedula || '-'}</td>
            <td>${u.personalInfo?.phone || '-'}</td>
            <td style="color: var(--primary)">${formatCurrency(u.balance)}</td>
            <td><span class="badge">${u.isVerified ? 'Verificado' : 'Pendiente'}</span></td>
        </tr>
    `);

    const renderDepositsTable = (data) => renderTable('deposits-body', data, tx => `
        <tr>
            <td>${tx.fullName || tx.username}</td>
            <td style="color:var(--primary); font-weight:bold">${formatCurrency(tx.amount)}</td>
            <td>${tx.reference}</td>
            <td>${new Date(tx.createdAt).toLocaleDateString()}</td>
            <td>
                <button class="btn-sm btn-primary" onclick="processTx('deposits', 'approve', '${tx._id}')"><i class="fa-solid fa-check"></i></button>
                <button class="btn-sm btn-danger" onclick="processTx('deposits', 'reject', '${tx._id}')"><i class="fa-solid fa-xmark"></i></button>
            </td>
        </tr>
    `);

    const renderWithdrawalsTable = (data) => renderTable('withdrawals-body', data, tx => `
        <tr>
            <td>${tx.fullName || tx.username}</td>
            <td style="color:var(--danger); font-weight:bold">${formatCurrency(tx.amount)}</td>
            <td>${tx.methodType}</td>
            <td>${new Date(tx.requestedAt).toLocaleDateString()}</td>
            <td>
                <button class="btn-sm btn-primary" onclick="processTx('withdrawals', 'approve', '${tx._id}')"><i class="fa-solid fa-check"></i></button>
                <button class="btn-sm btn-danger" onclick="processTx('withdrawals', 'reject', '${tx._id}')"><i class="fa-solid fa-xmark"></i></button>
            </td>
        </tr>
    `);

    // --- SEARCH FUNCTIONALITY ---
    function setupSearch(inputId, dataKey, renderFn, filterFn) {
        document.getElementById(inputId)?.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            const filtered = state[dataKey].filter(item => filterFn(item, term));
            renderFn(filtered);
        });
    }

    setupSearch('search-users', 'users', renderUsersTable, (item, term) => 
        item.username.toLowerCase().includes(term) || item.email.toLowerCase().includes(term)
    );
    setupSearch('search-deposits', 'deposits', renderDepositsTable, (item, term) => 
        (item.username||'').toLowerCase().includes(term) || item.reference.toLowerCase().includes(term)
    );
    setupSearch('search-withdrawals', 'withdrawals', renderWithdrawalsTable, (item, term) => 
        (item.username||'').toLowerCase().includes(term)
    );

    // --- CHART.JS RENDERER ---
    function renderRevenueChart(data) {
        const ctx = document.getElementById('revenueChart');
        if(!ctx) return;
        
        if (revenueChart) revenueChart.destroy();

        revenueChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: data.map(d => d._id), // Fechas
                datasets: [{
                    label: 'Ingresos (Bs.)',
                    data: data.map(d => d.total),
                    borderColor: '#2ECC71',
                    backgroundColor: 'rgba(46, 204, 113, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { grid: { color: '#2d3748' }, ticks: { color: '#9ca3af' } },
                    x: { grid: { display: false }, ticks: { color: '#9ca3af' } }
                }
            }
        });
    }

    // --- ACTIONS GLOBAL ---
    window.processTx = async (type, action, id) => {
        if(!confirm('¿Confirmar acción?')) return;
        try {
            await apiFetch(`/admin/${type}/${action}/${id}`, 'POST', action==='reject'?{reason:'Admin'}:null);
            loadDashboard();
        } catch (e) { alert(e.message); }
    };

    document.getElementById('refresh-btn')?.addEventListener('click', loadDashboard);

    // --- INIT ---
    if (authToken) {
        document.getElementById('login-view').style.display = 'none';
        document.getElementById('dashboard-view').style.display = 'grid';
        document.getElementById('admin-email-display').textContent = adminUser.email.split('@')[0];
        loadDashboard();
    }
});