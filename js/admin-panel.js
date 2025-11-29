// Archivo: js/admin-panel.js

import { API_BASE_URL } from './config.js';
import { fetchWithAuth } from './auth.js';
import { showToast } from './ui.js';

// --- 1. CARGAR ESTADÍSTICAS (DASHBOARD) ---
async function loadStats() {
    try {
        const stats = await fetchWithAuth(`${API_BASE_URL}/admin/stats`);
        
        // Actualizamos los números en el HTML
        document.getElementById('stat-users').textContent = stats.totalUsers || 0;
        document.getElementById('stat-balance').textContent = `Bs. ${(stats.totalBalance || 0).toFixed(2)}`;
        document.getElementById('stat-pending').textContent = 
            (stats.pendingDepositsCount || 0) + (stats.pendingWithdrawalsCount || 0);

    } catch (error) {
        console.error('Error cargando stats:', error);
    }
}

// --- 2. CARGAR DEPÓSITOS ---
async function loadDeposits() {
    const tbody = document.getElementById('deposits-body');
    if(!tbody) return;
    tbody.innerHTML = '<tr><td colspan="5">Cargando...</td></tr>';

    try {
        const deposits = await fetchWithAuth(`${API_BASE_URL}/admin/deposits/pending`);
        
        if (deposits.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5">No hay depósitos pendientes.</td></tr>';
            return;
        }

        tbody.innerHTML = deposits.map(tx => `
            <tr>
                <td><strong>${tx.username}</strong></td>
                <td style="color: var(--color-success);">Bs. ${tx.amount.toFixed(2)}</td>
                <td>Ref: ${tx.reference}</td>
                <td>${new Date(tx.createdAt).toLocaleDateString()}</td>
                <td>
                    <button class="btn btn-primary btn-sm" onclick="window.processDeposit('${tx._id}', 'approve')"><i class="fa-solid fa-check"></i></button>
                    <button class="btn btn-danger btn-sm" onclick="window.processDeposit('${tx._id}', 'reject')"><i class="fa-solid fa-xmark"></i></button>
                </td>
            </tr>
        `).join('');
    } catch (e) { tbody.innerHTML = '<tr><td colspan="5">Error al cargar.</td></tr>'; }
}

// --- 3. CARGAR RETIROS ---
async function loadWithdrawals() {
    const tbody = document.getElementById('withdrawals-body');
    if(!tbody) return;
    tbody.innerHTML = '<tr><td colspan="5">Cargando...</td></tr>';

    try {
        const withdrawals = await fetchWithAuth(`${API_BASE_URL}/admin/withdrawals/pending`);
        
        if (withdrawals.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5">No hay retiros pendientes.</td></tr>';
            return;
        }

        tbody.innerHTML = withdrawals.map(req => `
            <tr>
                <td><strong>${req.username}</strong></td>
                <td style="color: var(--color-loss);">Bs. ${req.amount.toFixed(2)}</td>
                <td>${req.methodType.toUpperCase()}</td>
                <td>${new Date(req.requestedAt).toLocaleDateString()}</td>
                <td>
                    <button class="btn btn-primary btn-sm" onclick="window.processWithdrawal('${req._id}', 'approve')"><i class="fa-solid fa-check"></i></button>
                    <button class="btn btn-danger btn-sm" onclick="window.processWithdrawal('${req._id}', 'reject')"><i class="fa-solid fa-xmark"></i></button>
                </td>
            </tr>
        `).join('');
    } catch (e) { tbody.innerHTML = '<tr><td colspan="5">Error al cargar.</td></tr>'; }
}

// --- 4. CARGAR USUARIOS ---
async function loadUsers() {
    const tbody = document.getElementById('users-body');
    if(!tbody) return;
    
    try {
        const users = await fetchWithAuth(`${API_BASE_URL}/admin/users`);
        tbody.innerHTML = users.map(u => `
            <tr>
                <td>${u.username}</td>
                <td>${u.email}</td>
                <td>${u.personalInfo?.cedula || 'N/A'}</td>
                <td>${u.personalInfo?.phone || 'N/A'}</td>
                <td>Bs. ${u.balance.toFixed(2)}</td>
                <td>${u.isVerified ? 'Verificado' : 'Pendiente'}</td>
            </tr>
        `).join('');
    } catch (e) { console.error(e); }
}

// --- ACCIONES GLOBALES (Para que funcionen los botones onclick) ---
window.processDeposit = async (id, action) => {
    const endpoint = action === 'approve' ? 'approve' : 'reject';
    let body = {};
    
    if(action === 'reject') {
        const reason = prompt("Razón del rechazo:");
        if(!reason) return;
        body = { reason };
    } else {
        if(!confirm("¿Aprobar depósito y cargar saldo?")) return;
    }

    try {
        const res = await fetchWithAuth(`${API_BASE_URL}/admin/deposits/${endpoint}/${id}`, {
            method: 'POST',
            body: JSON.stringify(body)
        });
        showToast(res.message, 'success');
        loadDeposits(); loadStats(); // Recargar datos
    } catch (e) { showToast(e.message, 'error'); }
};

window.processWithdrawal = async (id, action) => {
    const endpoint = action === 'approve' ? 'approve' : 'reject';
    let body = {};

    if(action === 'reject') {
        const reason = prompt("Razón del rechazo (se devolverá el saldo):");
        if(!reason) return;
        body = { reason };
    } else {
        if(!confirm("¿Confirmar que ya pagaste al usuario?")) return;
    }

    try {
        const res = await fetchWithAuth(`${API_BASE_URL}/admin/withdrawals/${endpoint}/${id}`, {
            method: 'POST',
            body: JSON.stringify(body)
        });
        showToast(res.message, 'success');
        loadWithdrawals(); loadStats(); // Recargar datos
    } catch (e) { showToast(e.message, 'error'); }
};

// --- NAVEGACIÓN ENTRE PESTAÑAS ---
window.switchTab = (tabId) => {
    // Ocultar todas las secciones
    document.querySelectorAll('.content-section').forEach(el => el.classList.remove('active'));
    // Mostrar la seleccionada
    const target = document.getElementById(`section-${tabId}`);
    if(target) target.classList.add('active');
    
    // Actualizar botones del menú
    document.querySelectorAll('.nav-link').forEach(el => el.classList.remove('active'));
    // Buscar el botón que fue clickeado (event.currentTarget no siempre funciona bien en funciones globales)
    const activeBtn = document.querySelector(`button[onclick="switchTab('${tabId}')"]`);
    if(activeBtn) activeBtn.classList.add('active');
};

// --- LOGIN DEL ADMIN ---
document.getElementById('login-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const errorMsg = document.getElementById('error-message');

    try {
        // Usamos la ruta de login normal
        const res = await fetch(`${API_BASE_URL}/login`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ identifier: email, password })
        });
        const data = await res.json();
        
        if(!res.ok) throw new Error(data.message);
        
        // Verificar rol
        if(data.user.role !== 'admin') {
            throw new Error('No tienes permisos de administrador.');
        }

        // Guardar sesión
        localStorage.setItem('fortunaToken', data.token);
        localStorage.setItem('fortunaUser', JSON.stringify(data.user));
        
        // Mostrar dashboard
        initAdminPanel(data.user);

    } catch (err) {
        errorMsg.textContent = err.message;
        errorMsg.style.display = 'block';
    }
});

// Logout
document.getElementById('logout-btn')?.addEventListener('click', () => {
    localStorage.removeItem('fortunaToken');
    localStorage.removeItem('fortunaUser');
    window.location.reload();
});

// Función de inicio
function initAdminPanel(user) {
    document.getElementById('login-view').style.display = 'none';
    document.getElementById('dashboard-view').style.display = 'grid';
    document.getElementById('admin-email-display').textContent = user.username || 'Admin';
    
    // Cargar datos iniciales
    loadStats();
    loadDeposits();
    loadWithdrawals();
    loadUsers();
}

// Chequeo de sesión al cargar
document.addEventListener('DOMContentLoaded', () => {
    const user = JSON.parse(localStorage.getItem('fortunaUser'));
    if (user && user.role === 'admin') {
        initAdminPanel(user);
    } else {
        document.getElementById('login-view').style.display = 'flex';
        document.getElementById('dashboard-view').style.display = 'none';
    }
    
    // Botones de recargar
    document.querySelectorAll('.btn-refresh').forEach(btn => {
        btn.addEventListener('click', () => {
            loadStats(); loadDeposits(); loadWithdrawals(); loadUsers();
            showToast('Datos actualizados');
        });
    });
});