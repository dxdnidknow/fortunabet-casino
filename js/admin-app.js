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
let allUsers = []; // Cache para búsqueda

async function loadUsers() {
    const tbody = document.getElementById('users-body');
    if(!tbody) return;
    try {
        allUsers = await fetchWithAuth(`${API_BASE_URL}/admin/users`);
        renderUsers(allUsers);
    } catch (e) { console.error(e); }
}

function renderUsers(users) {
    const tbody = document.getElementById('users-body');
    if(!tbody) return;
    
    if(users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px; color:#9CA3AF;">No se encontraron usuarios.</td></tr>';
        return;
    }
    
    tbody.innerHTML = users.map(u => `
        <tr>
            <td><div style="font-weight:600;">${u.username}</div><div style="font-size:0.75rem; color:#9CA3AF;">${u.role}</div></td>
            <td>${u.email}</td>
            <td>${u.personalInfo?.cedula || '-'} / ${u.personalInfo?.phone || '-'}</td>
            <td style="font-weight:600;">Bs. ${u.balance.toFixed(2)}</td>
            <td><span class="nav-badge" style="background:${u.isVerified ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)'}; color:${u.isVerified ? '#10B981' : '#F59E0B'}; padding:4px 8px; border-radius:10px; font-size:0.75rem;">${u.isVerified ? 'VERIFICADO' : 'PENDIENTE'}</span></td>
            <td>
                <button class="btn btn-primary btn-sm" onclick="window.viewUserHistory('${u._id}')" title="Ver Historial">
                    <i class="fa-solid fa-clock-rotate-left"></i>
                </button>
            </td>
        </tr>`).join('');
}

// --- 6. HISTORIAL DE USUARIO ---
async function loadUserHistory(userId) {
    try {
        const data = await fetchWithAuth(`${API_BASE_URL}/admin/users/${userId}/history`);
        
        // Actualizar info del usuario
        document.getElementById('history-username').textContent = data.user.username;
        document.getElementById('history-balance').textContent = `Bs. ${data.user.balance.toFixed(2)}`;
        document.getElementById('history-created').textContent = data.user.createdAt 
            ? new Date(data.user.createdAt).toLocaleDateString('es-VE') 
            : 'N/A';
        
        // Renderizar transacciones
        const txBody = document.getElementById('history-transactions-body');
        if(data.transactions.length === 0) {
            txBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color:#9CA3AF;">Sin transacciones</td></tr>';
        } else {
            txBody.innerHTML = data.transactions.map(tx => {
                const statusColor = tx.status === 'approved' ? '#10B981' : tx.status === 'pending' ? '#F59E0B' : '#EF4444';
                const typeIcon = tx.type === 'deposit' ? 'fa-arrow-down' : 'fa-arrow-up';
                const typeColor = tx.type === 'deposit' ? '#10B981' : '#EF4444';
                return `
                <tr>
                    <td><i class="fa-solid ${typeIcon}" style="color:${typeColor}; margin-right:8px;"></i>${tx.type === 'deposit' ? 'Depósito' : 'Retiro'}</td>
                    <td style="font-weight:600; color:${typeColor};">Bs. ${tx.amount.toFixed(2)}</td>
                    <td><span style="background:${statusColor}20; color:${statusColor}; padding:4px 10px; border-radius:20px; font-size:0.75rem; font-weight:600;">${tx.status.toUpperCase()}</span></td>
                    <td>${tx.method || '-'}</td>
                    <td>${new Date(tx.createdAt).toLocaleString('es-VE')}</td>
                </tr>`;
            }).join('');
        }
        
        // Renderizar apuestas
        const betsBody = document.getElementById('history-bets-body');
        if(data.bets.length === 0) {
            betsBody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px; color:#9CA3AF;">Sin apuestas</td></tr>';
        } else {
            betsBody.innerHTML = data.bets.map(bet => {
                const statusColor = bet.status === 'won' ? '#10B981' : bet.status === 'pending' ? '#F59E0B' : '#EF4444';
                let eventDisplay = '';
    let selectionDisplay = '';
    
    if (bet.selections && bet.selections.length > 1) {
        eventDisplay = `<span style="color:#A0AEC0">Parley (${bet.selections.length})</span>`;
        selectionDisplay = 'Múltiple';
    } else if (bet.selections && bet.selections.length === 1) {
        // Apuesta simple
        const sel = bet.selections[0];
        // Intentamos limpiar el nombre (ej: "Real Madrid vs Barca - 1")
        const parts = sel.team.split(' - ');
        eventDisplay = parts[0] || sel.team;
        selectionDisplay = parts[1] || 'Ganador';
    } else {
        eventDisplay = 'Desconocido';
    }
                    return `
    <tr>
        <td style="max-width:140px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
            ${eventDisplay}
        </td>
        <td>${selectionDisplay}</td>
        <td style="color:#10B981; font-weight:600;">${bet.totalOdds?.toFixed(2) || '-'}</td>
        <td style="font-weight:600;">Bs. ${bet.stake?.toFixed(2) || '0.00'}</td>
        <td><span style="background:${statusColor}20; color:${statusColor}; padding:4px 8px; border-radius:20px; font-size:0.7rem; font-weight:700;">${(bet.status || 'pending').toUpperCase()}</span></td>
        <td style="font-size:0.75rem; color:#9CA3AF;">${new Date(bet.createdAt).toLocaleDateString()}</td>
    </tr>`;
            }).join('');
        }
        
        // Mostrar sección
        window.switchTab('user-history');
        
    } catch (e) {
        console.error('Error cargando historial:', e);
        showToast('Error al cargar historial', 'error');
    }
}

window.viewUserHistory = (userId) => {
    loadUserHistory(userId);
};

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
    // Ocultar todas las secciones
    document.querySelectorAll('.content-section').forEach(el => {
        el.classList.remove('active');
        el.style.display = 'none';
    });
    
    // Mostrar sección seleccionada
    const section = document.getElementById(`section-${tabId}`);
    if(section) {
        section.classList.add('active');
        section.style.display = 'block';
    }

    // Actualizar navegación activa
    document.querySelectorAll('.nav-link').forEach(el => el.classList.remove('active'));
    if(event && event.currentTarget) event.currentTarget.classList.add('active');

    // RECARGA DE DATOS AL CAMBIAR
    if(tabId === 'overview') { loadStats(); loadRevenueChart(); }
    if(tabId === 'deposits') loadDeposits();
    if(tabId === 'withdrawals') loadWithdrawals();
    if(tabId === 'users') loadUsers();

    // CERRAR SIDEBAR Y OVERLAY EN MÓVIL
    if (window.innerWidth <= 768) {
        const sidebar = document.querySelector('.sidebar');
        const overlay = document.querySelector('.menu-overlay') || document.querySelector('.admin-overlay');
        
        if(sidebar) sidebar.classList.remove('open');
        if(overlay) {
            overlay.classList.remove('active');
            overlay.style.display = 'none';
        }
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

    if (toggleBtn && sidebar && overlay) {
        toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = sidebar.classList.contains('open');
            
            if(isOpen) {
                sidebar.classList.remove('open');
                overlay.classList.remove('active');
                overlay.style.display = 'none';
            } else {
                sidebar.classList.add('open');
                overlay.classList.add('active');
                overlay.style.display = 'block';
            }
        });
        
        overlay.addEventListener('click', () => {
            sidebar.classList.remove('open');
            overlay.classList.remove('active');
            overlay.style.display = 'none';
        });
        
        // Cerrar sidebar al hacer click en un nav-link
        document.querySelectorAll('.sidebar .nav-link').forEach(link => {
            link.addEventListener('click', () => {
                if(window.innerWidth <= 768) {
                    sidebar.classList.remove('open');
                    overlay.classList.remove('active');
                    overlay.style.display = 'none';
                }
            });
        });
    }

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

    // Búsqueda de usuarios
    const userSearchInput = document.getElementById('user-search-input');
    if(userSearchInput) {
        userSearchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase().trim();
            if(!query) {
                renderUsers(allUsers);
                return;
            }
            const filtered = allUsers.filter(u => 
                u.username.toLowerCase().includes(query) ||
                u.email.toLowerCase().includes(query) ||
                (u.personalInfo?.cedula || '').toLowerCase().includes(query) ||
                (u.personalInfo?.phone || '').toLowerCase().includes(query)
            );
            renderUsers(filtered);
        });
    }

    // Tabs del historial
    document.querySelectorAll('.history-tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const tab = e.currentTarget.dataset.tab;
            
            // Actualizar botones
            document.querySelectorAll('.history-tab-btn').forEach(b => {
                b.classList.remove('active', 'btn-primary');
                b.classList.add('btn-secondary');
            });
            e.currentTarget.classList.add('active', 'btn-primary');
            e.currentTarget.classList.remove('btn-secondary');
            
            // Mostrar panel correcto
            document.querySelectorAll('.history-panel').forEach(p => p.style.display = 'none');
            document.getElementById(`history-${tab}`).style.display = 'block';
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