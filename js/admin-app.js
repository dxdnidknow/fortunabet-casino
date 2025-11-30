// Archivo: js/admin-app.js

import { API_BASE_URL } from './config.js';
import { fetchWithAuth } from './auth.js';
import { showToast } from './ui.js';

// --- GESTIÓN DE VISTAS ---
function showLogin() {
    document.body.classList.add('login-mode'); // AÑADIR ESTA LÍNEA
    const loginView = document.getElementById('login-view');
    const dashboardView = document.getElementById('dashboard-view');
    if(loginView) loginView.style.display = 'flex';
    if(dashboardView) dashboardView.style.display = 'none';
}

function showDashboard(user) {
     document.body.classList.remove('login-mode');
    document.getElementById('login-view').style.display = 'none';
    document.getElementById('dashboard-view').style.display = 'grid';
    
    // --- CAMBIO: YA NO MOSTRAMOS EL NOMBRE ESPECÍFICO ---
    // El HTML ya tiene "Administrador" fijo.
    
    refreshAllData();
}

function refreshAllData() {
    loadStats();
    loadRevenueChart();
    loadDeposits();
    loadWithdrawals();
    loadUsers();
}

// --- 1. ESTADÍSTICAS ---
async function loadStats() {
    try {
        const stats = await fetchWithAuth(`${API_BASE_URL}/admin/stats`);
        document.getElementById('stat-users').textContent = stats.totalUsers || 0;
        document.getElementById('stat-balance').textContent = `Bs. ${(stats.totalBalance || 0).toFixed(2)}`;
        
        const totalPending = (stats.pendingDepositsCount || 0) + (stats.pendingWithdrawalsCount || 0);
        document.getElementById('stat-pending').textContent = totalPending;

        const badgeDep = document.getElementById('badge-deposits');
        const badgeWit = document.getElementById('badge-withdrawals');
        if(badgeDep) {
            badgeDep.textContent = stats.pendingDepositsCount;
            badgeDep.style.display = stats.pendingDepositsCount > 0 ? 'inline-block' : 'none';
        }
        if(badgeWit) {
            badgeWit.textContent = stats.pendingWithdrawalsCount;
            badgeWit.style.display = stats.pendingWithdrawalsCount > 0 ? 'inline-block' : 'none';
        }
    } catch (error) { console.error('Error stats:', error); }
}

// --- 2. GRÁFICA PRO (CON DEGRADADO) ---
async function loadRevenueChart() {
    const ctx = document.getElementById('revenueChart');
    const yearSelect = document.getElementById('revenue-year-filter');
    if(!ctx) return;
    
    const year = yearSelect ? yearSelect.value : new Date().getFullYear();

    try {
        const data = await fetchWithAuth(`${API_BASE_URL}/admin/analytics/revenue?year=${year}`);
        
        const monthNames = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
        const labels = data.map(item => monthNames[item.month - 1]);
        const values = data.map(item => item.total); 

        if(window.myRevenueChart) window.myRevenueChart.destroy();

        // CREAR DEGRADADO VERDE
        const canvasContext = ctx.getContext('2d');
        const gradient = canvasContext.createLinearGradient(0, 0, 0, 400);
        gradient.addColorStop(0, 'rgba(46, 204, 113, 0.8)'); // Verde fuerte arriba
        gradient.addColorStop(1, 'rgba(46, 204, 113, 0.1)'); // Verde transparente abajo

        window.myRevenueChart = new Chart(ctx, {
            type: 'bar', // Barras se ven mejor para comparar meses
            data: {
                labels: monthNames, // Usamos la lista fija de nombres para que el eje X siempre sea Ene-Dic
        datasets: [{
                    label: 'Ingresos Netos',
                    data: values,
                    backgroundColor: gradient, // Usamos el degradado
                    borderRadius: 6, // Bordes redondeados en las barras
                    borderWidth: 0,
                    barPercentage: 0.6 // Ancho de las barras
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }, // Sin leyenda fea
                    tooltip: {
                        backgroundColor: '#1A1F29',
                        titleColor: '#fff',
                        bodyColor: '#2ECC71',
                        padding: 10,
                        displayColors: false,
                        callbacks: {
                            label: (context) => `Total: Bs. ${context.raw.toFixed(2)}`
                        }
                    }
                },
                scales: {
                    y: { 
                        beginAtZero: true, 
                        grid: { color: '#2D3748', borderDash: [5, 5] },
                        ticks: { color: '#9CA3AF', font: { size: 11 } },
                        border: { display: false }
                    },
x: { 
    grid: { display: false },
    ticks: { 
        color: '#9ca3af',
        font: { size: 11 },
        maxRotation: 0, // Evita que se pongan verticales
        minRotation: 0,
        autoSkip: false, // Intenta mostrar todos
        // Truco: Si es móvil, mostramos solo la primera letra
        callback: function(value, index, values) {
            const label = this.getLabelForValue(value);
            return window.innerWidth < 500 ? label.charAt(0) : label;
        }
    }
}
                }
            }
        });
    } catch (e) { console.error('Error chart:', e); }
}

// --- 3. DEPÓSITOS ---
async function loadDeposits() {
    const tbody = document.getElementById('deposits-body');
    if(!tbody) return;
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color:#9CA3AF;">Cargando...</td></tr>';

    try {
        const list = await fetchWithAuth(`${API_BASE_URL}/admin/deposits/pending`);
        if (list.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color:#9CA3AF;">No hay depósitos pendientes.</td></tr>';
            return;
        }
        tbody.innerHTML = list.map(tx => `
            <tr>
                <td>
                    <div style="font-weight:600; color:#F3F4F6;">${tx.username}</div>
                    <div style="font-size:0.8rem; color:#9CA3AF;">${tx.fullName || ''}</div>
                </td>
                <td style="color:#10B981; font-weight:700;">Bs. ${tx.amount.toFixed(2)}</td>
                <td>
                    <div style="font-size:0.9rem;">${tx.method}</div>
                    <div style="font-size:0.8rem; color:#9CA3AF;">Ref: ${tx.reference}</div>
                </td>
                <td>${new Date(tx.createdAt).toLocaleDateString()}</td>
                <td>
                    <div style="display:flex; gap:8px;">
                        <button class="btn btn-primary btn-sm" onclick="window.processDeposit('${tx._id}', 'approve')" title="Aprobar"><i class="fa-solid fa-check"></i></button>
                        <button class="btn btn-danger btn-sm" onclick="window.processDeposit('${tx._id}', 'reject')" title="Rechazar"><i class="fa-solid fa-xmark"></i></button>
                    </div>
                </td>
            </tr>`).join('');
    } catch (e) { console.error(e); }
}

// --- 4. RETIROS ---
async function loadWithdrawals() {
    const tbody = document.getElementById('withdrawals-body');
    if(!tbody) return;
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color:#9CA3AF;">Cargando...</td></tr>';

    try {
        const list = await fetchWithAuth(`${API_BASE_URL}/admin/withdrawals/pending`);
        if (list.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color:#9CA3AF;">No hay retiros pendientes.</td></tr>';
            return;
        }
        tbody.innerHTML = list.map(req => {
            let details = req.methodType === 'pago_movil' ? `${req.methodDetails.bank} - ${req.methodDetails.phone}` : req.methodDetails.email;
            return `
            <tr>
                <td><strong style="color:#F3F4F6;">${req.username}</strong></td>
                <td style="color:#EF4444; font-weight:700;">Bs. ${req.amount.toFixed(2)}</td>
                <td>
                    <div style="font-size:0.9rem;">${req.methodType.toUpperCase()}</div>
                    <div style="font-size:0.75rem; color:#9CA3AF; max-width:150px; overflow:hidden; text-overflow:ellipsis;">${details}</div>
                </td>
                <td>${new Date(req.requestedAt).toLocaleDateString()}</td>
                <td>
                    <div style="display:flex; gap:8px;">
                        <button class="btn btn-primary btn-sm" onclick="window.processWithdrawal('${req._id}', 'approve')"><i class="fa-solid fa-check"></i></button>
                        <button class="btn btn-danger btn-sm" onclick="window.processWithdrawal('${req._id}', 'reject')"><i class="fa-solid fa-xmark"></i></button>
                    </div>
                </td>
            </tr>`;
        }).join('');
    } catch (e) { console.error(e); }
}

// --- 5. USUARIOS ---
async function loadUsers() {
    const tbody = document.getElementById('users-body');
    if(!tbody) return;
    try {
        const users = await fetchWithAuth(`${API_BASE_URL}/admin/users`);
        tbody.innerHTML = users.map(u => `
            <tr>
                <td>
                    <div style="font-weight:600;">${u.username}</div>
                    <div style="font-size:0.75rem; color:#9CA3AF;">${u.role}</div>
                </td>
                <td>${u.email}</td>
                <td style="font-weight:600;">Bs. ${u.balance.toFixed(2)}</td>
                <td>
                    <span class="nav-badge" style="background:${u.isVerified ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)'}; color:${u.isVerified ? '#10B981' : '#F59E0B'}; padding:4px 8px; border-radius:10px; font-size:0.75rem;">
                        ${u.isVerified ? 'VERIFICADO' : 'PENDIENTE'}
                    </span>
                </td>
            </tr>`).join('');
    } catch (e) { console.error(e); }
}

// --- ACCIONES ---
window.processDeposit = async (id, action) => {
    if(action === 'reject' && !confirm("¿Rechazar este depósito?")) return;
    if(action === 'approve' && !confirm("¿Aprobar y acreditar saldo?")) return;
    const endpoint = action === 'approve' ? 'approve' : 'reject';
    let body = {};
    if(action === 'reject') {
        const reason = prompt("Motivo:");
        if(!reason) return;
        body = { reason };
    }
    try {
        await fetchWithAuth(`${API_BASE_URL}/admin/deposits/${endpoint}/${id}`, { method: 'POST', body: JSON.stringify(body) });
        showToast(action === 'approve' ? 'Aprobado' : 'Rechazado', 'success');
        refreshAllData();
    } catch (e) { showToast(e.message, 'error'); }
};

window.processWithdrawal = async (id, action) => {
    if(action === 'reject' && !confirm("¿Rechazar?")) return;
    if(action === 'approve' && !confirm("¿Confirmar pago?")) return;
    const endpoint = action === 'approve' ? 'approve' : 'reject';
    let body = {};
    if(action === 'reject') {
        const reason = prompt("Motivo:");
        if(!reason) return;
        body = { reason };
    }
    try {
        await fetchWithAuth(`${API_BASE_URL}/admin/withdrawals/${endpoint}/${id}`, { method: 'POST', body: JSON.stringify(body) });
        showToast('Procesado', 'success');
        refreshAllData();
    } catch (e) { showToast(e.message, 'error'); }
};

window.switchTab = (tabId) => {
    document.querySelectorAll('.content-section').forEach(el => el.classList.remove('active'));
    document.getElementById(`section-${tabId}`).classList.add('active');
    document.querySelectorAll('.nav-link').forEach(el => el.classList.remove('active'));
    if(event && event.currentTarget) event.currentTarget.classList.add('active');
    
    if (window.innerWidth <= 768) {
        document.querySelector('.sidebar')?.classList.remove('open');
        document.querySelector('.admin-overlay')?.classList.remove('active');
    }
};

// --- INIT ---
document.addEventListener('DOMContentLoaded', () => {
    let user = null;
    try { user = JSON.parse(localStorage.getItem('fortunaUser')); } catch (e) {}

    if (user && user.role === 'admin') {
        showDashboard(user);
    } else {
        showLogin();
    }

    // Listener filtro año
    const yearSelect = document.getElementById('revenue-year-filter');
    if(yearSelect) yearSelect.addEventListener('change', loadRevenueChart);

    // Menú Móvil
    const toggleBtn = document.getElementById('admin-mobile-toggle');
    const sidebar = document.querySelector('.sidebar');
    let overlay = document.querySelector('.admin-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'admin-overlay';
        document.body.appendChild(overlay);
    }

    if (toggleBtn) {
        toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            sidebar.classList.toggle('open');
            overlay.classList.toggle('active');
        });
    }
    if(overlay) {
        overlay.addEventListener('click', () => {
            sidebar.classList.remove('open');
            overlay.classList.remove('active');
        });
    }

    // Login
    document.getElementById('login-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        try {
            const res = await fetch(`${API_BASE_URL}/login`, {
                method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ identifier: email, password })
            });
            const data = await res.json();
            if(!res.ok) throw new Error(data.message);
            if(data.user.role !== 'admin') throw new Error('Acceso denegado');
            localStorage.setItem('fortunaToken', data.token);
            localStorage.setItem('fortunaUser', JSON.stringify(data.user));
            showDashboard(data.user);
        } catch (e) {
            const err = document.getElementById('error-message');
            err.textContent = e.message; err.style.display = 'block';
        }
    });

    // Logout
    document.getElementById('logout-btn')?.addEventListener('click', () => {
        if(confirm('¿Cerrar sesión?')) {
            localStorage.removeItem('fortunaToken');
            localStorage.removeItem('fortunaUser');
            window.location.reload();
        }
    });

    // Refresh
    document.querySelectorAll('.btn-refresh').forEach(btn => {
        btn.addEventListener('click', () => {
            const icon = btn.querySelector('i');
            if(icon) icon.classList.add('fa-spin');
            refreshAllData();
            setTimeout(() => { if(icon) icon.classList.remove('fa-spin'); showToast('Actualizado', 'success'); }, 800);
        });
    });
});