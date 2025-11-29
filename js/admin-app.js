// Archivo: js/admin-app.js

import { API_BASE_URL } from './config.js';
import { fetchWithAuth } from './auth.js';
import { showToast } from './ui.js';

// --- CONTROL DE VISTAS ---
function showLogin() {
    const loginView = document.getElementById('login-view');
    const dashboardView = document.getElementById('dashboard-view');
    if(loginView) loginView.style.display = 'flex';
    if(dashboardView) dashboardView.style.display = 'none';
}

function showDashboard(user) {
    document.getElementById('login-view').style.display = 'none';
    document.getElementById('dashboard-view').style.display = 'grid';
    
    const adminDisplay = document.getElementById('admin-username-display');
    if(adminDisplay) adminDisplay.textContent = user.username;

    // Cargar todos los datos
    loadStats();
    loadRevenueChart(); // <--- GRÁFICA
    loadDeposits();
    loadWithdrawals();
    loadUsers();
}

// --- 1. CARGAR ESTADÍSTICAS (DASHBOARD) ---
async function loadStats() {
    try {
        const stats = await fetchWithAuth(`${API_BASE_URL}/admin/stats`);
        
        document.getElementById('stat-users').textContent = stats.totalUsers || 0;
        document.getElementById('stat-balance').textContent = `Bs. ${(stats.totalBalance || 0).toFixed(2)}`;
        
        // Sumar pendientes para el badge general
        const totalPending = (stats.pendingDepositsCount || 0) + (stats.pendingWithdrawalsCount || 0);
        document.getElementById('stat-pending').textContent = totalPending;

        // Actualizar badges del menú lateral
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
        console.error('Error cargando stats:', error);
    }
}

// --- 2. CARGAR GRÁFICA DE INGRESOS ---
async function loadRevenueChart() {
    const ctx = document.getElementById('revenueChart');
    if(!ctx) return;

    try {
        const data = await fetchWithAuth(`${API_BASE_URL}/admin/analytics/revenue`);
        
        // Preparar datos para Chart.js
        const labels = data.map(item => item._id); // Fechas (YYYY-MM-DD)
        const values = data.map(item => item.total); // Montos

        // Destruir gráfica previa si existe para evitar solapamiento
        if(window.myRevenueChart) window.myRevenueChart.destroy();

        window.myRevenueChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Ingresos (Depósitos Aprobados)',
                    data: values,
                    borderColor: '#2ECC71',
                    backgroundColor: 'rgba(46, 204, 113, 0.2)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4,
                    pointBackgroundColor: '#2ECC71'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
plugins: {
    legend: { 
        labels: { 
            color: '#ecf0f1',
            usePointStyle: true,  // <--- ESTO CONVIERTE EL CUADRADO EN CÍRCULO
            pointStyle: 'circle', // O 'rectRounded' si prefieres cuadrado redondeado
            boxWidth: 8,          // Tamaño del círculo
            padding: 20           // Espacio extra
        } 
    }
},
                scales: {
                    y: { 
                        beginAtZero: true, 
                        grid: { color: '#2d3748' },
                        ticks: { color: '#9ca3af', callback: (val) => 'Bs. ' + val }
                    },
                    x: { 
                        grid: { display: false },
                        ticks: { color: '#9ca3af' }
                    }
                }
            }
        });

    } catch (e) { console.error('Error cargando gráfica:', e); }
}

// --- 3. CARGAR DEPÓSITOS ---
async function loadDeposits() {
    const tbody = document.getElementById('deposits-body');
    if(!tbody) return;
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px;"><div class="spinner-sm"></div> Cargando...</td></tr>';

    try {
        const list = await fetchWithAuth(`${API_BASE_URL}/admin/deposits/pending`);
        
        if (list.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#777;">No hay depósitos pendientes.</td></tr>';
            return;
        }

        tbody.innerHTML = list.map(tx => `
            <tr>
                <td>
                    <div style="font-weight:bold; color:var(--text);">${tx.username}</div>
                    <div style="font-size:0.8rem; color:var(--text-muted);">${tx.fullName || 'Sin nombre'}</div>
                </td>
                <td style="color:var(--primary); font-weight:bold;">Bs. ${tx.amount.toFixed(2)}</td>
                <td>
                    <div>${tx.method}</div>
                    <div style="font-size:0.8rem; color:var(--text-muted);">Ref: ${tx.reference}</div>
                </td>
                <td>${new Date(tx.createdAt).toLocaleDateString()}</td>
                <td>
                    <button class="btn btn-primary btn-sm" onclick="window.processDeposit('${tx._id}', 'approve')" title="Aprobar"><i class="fa-solid fa-check"></i></button>
                    <button class="btn btn-danger btn-sm" onclick="window.processDeposit('${tx._id}', 'reject')" title="Rechazar"><i class="fa-solid fa-xmark"></i></button>
                </td>
            </tr>
        `).join('');
    } catch (e) { tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Error al cargar datos.</td></tr>'; }
}

// --- 4. CARGAR RETIROS ---
async function loadWithdrawals() {
    const tbody = document.getElementById('withdrawals-body');
    if(!tbody) return;
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px;"><div class="spinner-sm"></div> Cargando...</td></tr>';

    try {
        const list = await fetchWithAuth(`${API_BASE_URL}/admin/withdrawals/pending`);
        
        if (list.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#777;">No hay retiros pendientes.</td></tr>';
            return;
        }

        tbody.innerHTML = list.map(req => {
            let details = req.methodType === 'pago_movil' 
                ? `${req.methodDetails.bank} - ${req.methodDetails.phone}` 
                : req.methodDetails.email;
                
            return `
            <tr>
                <td><strong>${req.username}</strong></td>
                <td style="color:var(--danger); font-weight:bold;">Bs. ${req.amount.toFixed(2)}</td>
                <td>
                    <div>${req.methodType.toUpperCase()}</div>
                    <div style="font-size:0.8rem; color:var(--text-muted);">${details}</div>
                </td>
                <td>${new Date(req.requestedAt).toLocaleDateString()}</td>
                <td>
                    <button class="btn btn-primary btn-sm" onclick="window.processWithdrawal('${req._id}', 'approve')" title="Aprobar"><i class="fa-solid fa-check"></i></button>
                    <button class="btn btn-danger btn-sm" onclick="window.processWithdrawal('${req._id}', 'reject')" title="Rechazar"><i class="fa-solid fa-xmark"></i></button>
                </td>
            </tr>`;
        }).join('');
    } catch (e) { tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Error al cargar datos.</td></tr>'; }
}

// --- 5. CARGAR USUARIOS ---
async function loadUsers() {
    const tbody = document.getElementById('users-body');
    if(!tbody) return;
    
    try {
        const users = await fetchWithAuth(`${API_BASE_URL}/admin/users`);
        tbody.innerHTML = users.map(u => `
            <tr>
                <td>
                    <div style="font-weight:bold;">${u.username}</div>
                    <div style="font-size:0.8rem; color:var(--text-muted);">${u.role}</div>
                </td>
                <td>${u.email}</td>
                <td>${u.personalInfo?.cedula || '-'}</td>
                <td>${u.personalInfo?.phone || '-'}</td>
                <td>Bs. ${u.balance.toFixed(2)}</td>
                <td><span class="nav-badge" style="background:${u.isVerified ? 'var(--primary)' : 'var(--danger)'};">${u.isVerified ? 'Activo' : 'Pendiente'}</span></td>
            </tr>`).join('');
    } catch (e) { console.error(e); }
}

// --- ACCIONES GLOBALES (Window) ---
window.processDeposit = async (id, action) => {
    const endpoint = action === 'approve' ? 'approve' : 'reject';
    let body = {};
    
    if(action === 'reject') {
        const reason = prompt("Razón del rechazo:");
        if(!reason) return;
        body = { reason };
    } else {
        if(!confirm("¿Aprobar depósito y cargar saldo al usuario?")) return;
    }

    try {
        const res = await fetchWithAuth(`${API_BASE_URL}/admin/deposits/${endpoint}/${id}`, {
            method: 'POST',
            body: JSON.stringify(body)
        });
        showToast(res.message, 'success');
        loadDeposits(); loadStats(); loadRevenueChart();
    } catch (e) { showToast(e.message, 'error'); }
};

window.processWithdrawal = async (id, action) => {
    const endpoint = action === 'approve' ? 'approve' : 'reject';
    let body = {};

    if(action === 'reject') {
        const reason = prompt("Razón del rechazo (se devolverá el saldo al usuario):");
        if(!reason) return;
        body = { reason };
    } else {
        if(!confirm("¿Confirmar que ya realizaste el pago al usuario?")) return;
    }

    try {
        const res = await fetchWithAuth(`${API_BASE_URL}/admin/withdrawals/${endpoint}/${id}`, {
            method: 'POST',
            body: JSON.stringify(body)
        });
        showToast(res.message, 'success');
        loadWithdrawals(); loadStats();
    } catch (e) { showToast(e.message, 'error'); }
};

// --- NAVEGACIÓN ENTRE PESTAÑAS ---
window.switchTab = (tabId) => {
    // 1. Ocultar todas las secciones
    document.querySelectorAll('.content-section').forEach(el => el.classList.remove('active'));
    // 2. Mostrar la seleccionada
    const target = document.getElementById(`section-${tabId}`);
    if(target) target.classList.add('active');
    
    // 3. Actualizar botones del menú (Estilo activo)
    document.querySelectorAll('.nav-link').forEach(el => el.classList.remove('active'));
    
    // Buscar el botón clickeado. Usamos un selector flexible porque puede ser click en icono o texto
    // Nota: event.currentTarget funciona porque esta función se llama desde onclick en el HTML
    if(event && event.currentTarget) {
        event.currentTarget.classList.add('active');
    }

    // 4. Si estamos en móvil, cerrar el menú automáticamente al hacer clic
    if (window.innerWidth <= 768) {
        const sidebar = document.querySelector('.sidebar');
        const overlay = document.querySelector('.admin-overlay');
        if(sidebar) sidebar.classList.remove('open');
        if(overlay) overlay.classList.remove('active');
    }
};

// --- LOGIN DEL ADMIN ---
document.getElementById('login-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const errorMsg = document.getElementById('error-message');
    const submitBtn = e.target.querySelector('button');

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<div class="spinner-sm"></div> Verificando...';

    try {
        const res = await fetch(`${API_BASE_URL}/login`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ identifier: email, password })
        });
        const data = await res.json();
        
        if(!res.ok) throw new Error(data.message);
        
        if(data.user.role !== 'admin') {
            throw new Error('Acceso denegado: No tienes permisos de administrador.');
        }

        localStorage.setItem('fortunaToken', data.token);
        localStorage.setItem('fortunaUser', JSON.stringify(data.user));
        
        showDashboard(data.user);

    } catch (err) {
        errorMsg.textContent = err.message;
        errorMsg.style.display = 'block';
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Acceder al Sistema';
    }
});

// Logout
document.getElementById('logout-btn')?.addEventListener('click', () => {
    if(confirm("¿Cerrar sesión del panel?")) {
        localStorage.removeItem('fortunaToken');
        localStorage.removeItem('fortunaUser');
        window.location.reload();
    }
});

// Botones de refrescar
document.querySelectorAll('.btn-refresh').forEach(btn => {
    btn.addEventListener('click', () => {
        btn.classList.add('fa-spin'); // Efecto visual
        loadStats(); loadRevenueChart(); loadDeposits(); loadWithdrawals(); loadUsers();
        setTimeout(() => { 
            btn.classList.remove('fa-spin');
            showToast('Datos actualizados'); 
        }, 800);
    });
});

// --- INICIO ---
document.addEventListener('DOMContentLoaded', () => {
    const user = JSON.parse(localStorage.getItem('fortunaUser'));
    
    // Verificar sesión y rol
    if (user && user.role === 'admin') {
        showDashboard(user);
    } else {
        showLogin();
    }

    // --- LÓGICA MENÚ MÓVIL (HAMBURGUESA) ---
    const toggleBtn = document.getElementById('admin-mobile-toggle');
    const sidebar = document.querySelector('.sidebar');
    
    // Crear overlay dinámico si no existe
    let overlay = document.querySelector('.admin-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'admin-overlay';
        document.body.appendChild(overlay);
    }

    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            sidebar.classList.toggle('open');
            overlay.classList.toggle('active');
        });
    }

    // Cerrar al hacer clic en el fondo oscuro
    overlay.addEventListener('click', () => {
        sidebar.classList.remove('open');
        overlay.classList.remove('active');
    });
});
// ... (resto del código anterior) ...

// --- FUNCIÓN SWITCH TAB MEJORADA (Cierra menú en móvil) ---
window.switchTab = (tabId) => {
    document.querySelectorAll('.content-section').forEach(el => el.classList.remove('active'));
    document.getElementById(`section-${tabId}`).classList.add('active');
    
    document.querySelectorAll('.nav-link').forEach(el => el.classList.remove('active'));
    if(event && event.currentTarget) event.currentTarget.classList.add('active');

    // CERRAR MENÚ AUTOMÁTICAMENTE EN MÓVIL
    const sidebar = document.querySelector('.sidebar');
    if (window.innerWidth <= 768 && sidebar.classList.contains('open')) {
        sidebar.classList.remove('open');
    }
};

// --- AL FINAL DEL DOMContentLoaded ---
document.addEventListener('DOMContentLoaded', () => {
    // ... (lógica de login existente) ...

    // LÓGICA BOTÓN HAMBURGUESA
    const toggleBtn = document.getElementById('admin-mobile-toggle');
    const sidebar = document.querySelector('.sidebar');

    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            sidebar.classList.toggle('open');
        });
    }

    // Cerrar al tocar fuera (opcional pero recomendado)
    document.addEventListener('click', (e) => {
        if (window.innerWidth <= 768 && 
            sidebar.classList.contains('open') && 
            !sidebar.contains(e.target) && 
            !toggleBtn.contains(e.target)) {
            sidebar.classList.remove('open');
        }
    });
});