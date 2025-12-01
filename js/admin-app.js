// Archivo: js/admin-app.js (VERSIÓN FINAL ESTABLE)

import { API_BASE_URL } from './config.js';
import { fetchWithAuth } from './auth.js';
import { showToast } from './ui.js';

// --- CONTROL DE VISTAS ---
function showLogin() {
    document.body.classList.add('login-mode');
    const loginView = document.getElementById('login-view');
    const dashboardView = document.getElementById('dashboard-view');
    if(loginView) loginView.style.display = 'flex';
    if(dashboardView) dashboardView.style.display = 'none';
}

function showDashboard(user) {
    document.body.classList.remove('login-mode');
    document.getElementById('login-view').style.display = 'none';
    document.getElementById('dashboard-view').style.display = 'grid';
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
        
        const usersEl = document.getElementById('stat-users');
        if(usersEl) usersEl.textContent = stats.totalUsers || 0;
        
        const balanceEl = document.getElementById('stat-balance');
        if(balanceEl) balanceEl.textContent = `Bs. ${(stats.totalBalance || 0).toFixed(2)}`;
        
        const totalPending = (stats.pendingDepositsCount || 0) + (stats.pendingWithdrawalsCount || 0);
        const pendingEl = document.getElementById('stat-pending');
        if(pendingEl) pendingEl.textContent = totalPending;

        const badgeDep = document.getElementById('badge-deposits');
        const badgeWit = document.getElementById('badge-withdrawals');
        
        if(badgeDep) {
            badgeDep.textContent = stats.pendingDepositsCount;
            badgeDep.classList.toggle('hidden', stats.pendingDepositsCount === 0);
        }
        if(badgeWit) {
            badgeWit.textContent = stats.pendingWithdrawalsCount;
            badgeWit.classList.toggle('hidden', stats.pendingWithdrawalsCount === 0);
        }
    } catch (error) { 
        console.error('Error stats:', error);
        if(error.message.includes('401') || error.message.includes('403')) {
            localStorage.removeItem('fortunaToken'); // Token vencido
            showLogin();
        }
    }
}

// --- 2. GRÁFICA ---
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

        const canvasContext = ctx.getContext('2d');
        const gradient = canvasContext.createLinearGradient(0, 0, 0, 400);
        gradient.addColorStop(0, 'rgba(16, 185, 129, 0.8)');
        gradient.addColorStop(1, 'rgba(16, 185, 129, 0.1)');

        window.myRevenueChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Ingresos Netos',
                    data: values,
                    backgroundColor: gradient,
                    borderRadius: 6,
                    borderWidth: 0,
                    barPercentage: 0.6,
                    hoverBackgroundColor: '#27ae60'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, grid: { color: '#2D3748', borderDash: [5, 5] }, ticks: { color: '#9CA3AF', font: { size: 11 } }, border: { display: false } },
                    x: { 
                        grid: { display: false }, 
                        ticks: { 
                            color: '#9CA3AF', 
                            font: { size: 11 },
                            maxRotation: 0, minRotation: 0, autoSkip: false,
                            callback: function(value) {
                                const label = this.getLabelForValue(value);
                                return window.innerWidth < 500 ? label.charAt(0) : label;
                            }
                        },
                        border: { display: false } 
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
                <td><div style="font-weight:600; color:#F3F4F6;">${tx.username}</div><div style="font-size:0.8rem; color:#9CA3AF;">${tx.fullName || ''}</div></td>
                <td style="color:#10B981; font-weight:700;">Bs. ${tx.amount.toFixed(2)}</td>
                <td><div style="font-size:0.9rem;">${tx.method}</div><div style="font-size:0.8rem; color:#9CA3AF;">Ref: ${tx.reference}</div></td>
                <td>${new Date(tx.createdAt).toLocaleDateString()}</td>
                <td>
                    <div style="display:flex; gap:8px;">
                        <button class="btn btn-primary btn-sm" onclick="window.processDeposit('${tx._id}', 'approve')" title="Aprobar"><i class="fa-solid fa-check"></i></button>
                        <button class="btn btn-danger btn-sm" onclick="window.processDeposit('${tx._id}', 'reject')" title="Rechazar"><i class="fa-solid fa-xmark"></i></button>
                    </div>
                </td>
            </tr>`).join('');
    } catch (e) { console.error(e); tbody.innerHTML = '<tr><td colspan="5">Error de carga</td></tr>'; }
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
                <td><div style="font-size:0.9rem;">${req.methodType.toUpperCase()}</div><div style="font-size:0.75rem; color:#9CA3AF; max-width:150px; overflow:hidden; text-overflow:ellipsis;">${details}</div></td>
                <td>${new Date(req.requestedAt).toLocaleDateString()}</td>
                <td>
                    <div style="display:flex; gap:8px;">
                        <button class="btn btn-primary btn-sm" onclick="window.processWithdrawal('${req._id}', 'approve')"><i class="fa-solid fa-check"></i></button>
                        <button class="btn btn-danger btn-sm" onclick="window.processWithdrawal('${req._id}', 'reject')"><i class="fa-solid fa-xmark"></i></button>
                    </div>
                </td>
            </tr>`;
        }).join('');
    } catch (e) { console.error(e); tbody.innerHTML = '<tr><td colspan="5">Error de carga</td></tr>'; }
}

// --- 5. USUARIOS ---
async function loadUsers() {
    const tbody = document.getElementById('users-body');
    if(!tbody) return;
    try {
        const users = await fetchWithAuth(`${API_BASE_URL}/admin/users`);
        tbody.innerHTML = users.map(u => `
            <tr>
                <td><div style="font-weight:600;">${u.username}</div><div style="font-size:0.75rem; color:#9CA3AF;">${u.role}</div></td>
                <td>${u.email}</td>
                <td>${u.personalInfo?.cedula || '-'} / ${u.personalInfo?.phone || '-'}</td>
                <td style="font-weight:600;">Bs. ${u.balance.toFixed(2)}</td>
                <td><span class="nav-badge" style="background:${u.isVerified ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)'}; color:${u.isVerified ? '#10B981' : '#F59E0B'}; padding:4px 8px; border-radius:10px; font-size:0.75rem;">${u.isVerified ? 'VERIFICADO' : 'PENDIENTE'}</span></td>
            </tr>`).join('');
    } catch (e) { console.error(e); }
}

// --- MODAL PERSONALIZADO ---
function askUser(title, message, needsInput = false) {
    return new Promise((resolve) => {
        const modal = document.getElementById('custom-confirm-modal');
        if(!modal) return resolve(confirm(message)); // Fallback

        const titleEl = document.getElementById('confirm-title');
        const msgEl = document.getElementById('confirm-message');
        const inputEl = document.getElementById('confirm-input');
        const btnConfirm = document.getElementById('btn-confirm-action');
        const btnCancel = document.getElementById('btn-cancel-action');

        titleEl.textContent = title;
        msgEl.textContent = message;
        inputEl.value = '';
        
        if (needsInput) {
            inputEl.classList.remove('hidden');
            inputEl.style.display = 'block';
            setTimeout(() => inputEl.focus(), 100);
        } else {
            inputEl.classList.add('hidden');
            inputEl.style.display = 'none';
        }
        
        modal.style.display = 'flex';
        modal.classList.add('active');

        const newConfirm = btnConfirm.cloneNode(true);
        const newCancel = btnCancel.cloneNode(true);
        btnConfirm.parentNode.replaceChild(newConfirm, btnConfirm);
        btnCancel.parentNode.replaceChild(newCancel, btnCancel);

        newConfirm.addEventListener('click', () => {
            if (needsInput) {
                const reason = inputEl.value.trim();
                if (!reason) { showToast('Debes escribir un motivo', 'error'); return; }
                closeModalAndResolve(reason);
            } else {
                closeModalAndResolve(true);
            }
        });

        newCancel.addEventListener('click', () => closeModalAndResolve(false));

        function closeModalAndResolve(value) {
            modal.classList.remove('active');
            modal.style.display = 'none';
            resolve(value);
        }
    });
}

// --- ACCIONES GLOBALES ---
window.processDeposit = async (id, action) => {
    const endpoint = action === 'approve' ? 'approve' : 'reject';
    let body = {};

    if(action === 'reject') {
        const reason = await askUser("Rechazar Depósito", "Indica el motivo del rechazo:", true);
        if(!reason) return; 
        body = { reason };
    } else {
        const confirm = await askUser("Aprobar Depósito", "El saldo se acreditará inmediatamente al usuario.");
        if(!confirm) return;
    }

    try {
        await fetchWithAuth(`${API_BASE_URL}/admin/deposits/${endpoint}/${id}`, { method: 'POST', body: JSON.stringify(body) });
        showToast(action === 'approve' ? 'Depósito Aprobado' : 'Depósito Rechazado', action === 'approve' ? 'success' : 'warning');
        refreshAllData();
    } catch (e) { showToast(e.message, 'error'); }
};

window.processWithdrawal = async (id, action) => {
    const endpoint = action === 'approve' ? 'approve' : 'reject';
    let body = {};

    if(action === 'reject') {
        const reason = await askUser("Rechazar Retiro", "Motivo (se devolverá el saldo):", true);
        if(!reason) return;
        body = { reason };
    } else {
        const confirm = await askUser("Confirmar Pago", "¿Confirmas el pago al usuario?");
        if(!confirm) return;
    }

    try {
        await fetchWithAuth(`${API_BASE_URL}/admin/withdrawals/${endpoint}/${id}`, { method: 'POST', body: JSON.stringify(body) });
        showToast('Procesado correctamente', 'success');
        refreshAllData();
    } catch (e) { showToast(e.message, 'error'); }
};

// --- NAVEGACIÓN ---
window.switchTab = (tabId) => {
    document.querySelectorAll('.content-section').forEach(el => el.classList.remove('active'));
    document.getElementById(`section-${tabId}`).classList.add('active');

    document.querySelectorAll('.nav-link').forEach(el => el.classList.remove('active'));
    if(event && event.currentTarget) event.currentTarget.classList.add('active');

    // RECARGA DE DATOS AL CAMBIAR (Corrección Clave)
    if(tabId === 'overview') { loadStats(); loadRevenueChart(); }
    if(tabId === 'deposits') loadDeposits();
    if(tabId === 'withdrawals') loadWithdrawals();
    if(tabId === 'users') loadUsers();

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

    const yearSelect = document.getElementById('revenue-year-filter');
    if(yearSelect) yearSelect.addEventListener('change', loadRevenueChart);

    const toggleBtn = document.getElementById('admin-mobile-toggle');
    const sidebar = document.querySelector('.sidebar');
    
    let overlay = document.querySelector('.admin-overlay');
    if (!overlay) {
        // Buscar el del modal si no hay uno específico
        overlay = document.getElementById('custom-confirm-modal');
    }
    // Si aun asi no hay, creamos uno exclusivo para menu
    if(!overlay || overlay.id === 'custom-confirm-modal') {
        overlay = document.createElement('div');
        overlay.className = 'admin-overlay menu-overlay';
        document.body.appendChild(overlay);
    }

    if (toggleBtn) {
        toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            sidebar.classList.toggle('open');
            overlay.classList.toggle('active');
            overlay.style.display = 'block'; // Asegurar visibilidad
        });
    }
    
    overlay.addEventListener('click', () => {
        sidebar.classList.remove('open');
        overlay.classList.remove('active');
        if(overlay.classList.contains('menu-overlay')) overlay.style.display = 'none';
    });

    document.getElementById('login-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const btn = e.target.querySelector('button');
        const err = document.getElementById('error-message');

        btn.disabled = true; btn.innerHTML = '<div class="spinner-sm"></div> Verificando...';
        err.style.display = 'none';

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
            err.textContent = e.message;
            err.style.display = 'block';
        } finally {
            btn.disabled = false; btn.textContent = 'ENTRAR AL SISTEMA';
        }
    });

    document.getElementById('logout-btn')?.addEventListener('click', async () => {
        if(await askUser("Cerrar Sesión", "¿Seguro que deseas salir?")) {
            localStorage.removeItem('fortunaToken');
            localStorage.removeItem('fortunaUser');
            window.location.reload();
        }
    });

    document.querySelectorAll('.btn-refresh').forEach(btn => {
        btn.addEventListener('click', () => {
            const icon = btn.querySelector('i');
            if(icon) icon.classList.add('fa-spin');
            refreshAllData();
            setTimeout(() => { if(icon) icon.classList.remove('fa-spin'); showToast('Actualizado', 'success'); }, 800);
        });
    });
        const webLink = document.querySelector('.external-link');
    if (webLink) {
        webLink.addEventListener('click', async (e) => {
            e.preventDefault();
            if(confirm('¿Cerrar sesión de administrador e ir a la web pública?')) {
                localStorage.removeItem('fortunaToken');
                localStorage.removeItem('fortunaUser');
                window.location.href = '/index.html';
            }
        });
    }
});