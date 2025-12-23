// Archivo: js/auth.js (VERSIÓN SEGURA: LOGOUT SOLO EN 401)

import { showToast } from './ui.js';
import { API_BASE_URL } from './config.js';
import { openModal, closeModal } from './modal.js';

// --- Constantes y Estado ---
const RESEND_COOLDOWN_SECONDS = 60;
let isResendCoolingDown = false;

// --- Funciones de Sesión ---
function getUser() {
    const userString = localStorage.getItem('fortunaUser');
    if (!userString) return null;
    try {
        return JSON.parse(userString);
    } catch (error) {
        localStorage.removeItem('fortunaUser');
        localStorage.removeItem('fortunaToken');
        return null;
    }
}

function validatePasswordStrength(password) {
    const regex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/;
    if (regex.test(password)) {
        return { isValid: true, message: '' };
    } else {
        return { isValid: false, message: 'La contraseña debe tener al menos 8 caracteres, e incluir una mayúscula, una minúscula, un número y un carácter especial.' };
    }
}

// En js/auth.js

function updateLoginState(user) {
    if (!user || !user.username) return;
    document.body.classList.add('user-logged-in');
    
    // Admin check
    if (user.role === 'admin') {
        document.body.classList.add('role-admin');
        
        // Inyectar enlace de Admin en el menú móvil (Hamburguesa)
        const mobileMenuLinks = document.querySelector('.mobile-menu-links');
        if (mobileMenuLinks && !document.getElementById('mobile-admin-link')) {
            const li = document.createElement('li');
            li.id = 'mobile-admin-link';
            li.innerHTML = `<a href="/admin/index.html"><i class="fa-solid fa-user-shield" style="color: var(--color-primary);"></i> Panel de Admin</a>`;
            // Insertar al principio de la lista
            mobileMenuLinks.insertBefore(li, mobileMenuLinks.firstChild);
        }
    } else {
        document.body.classList.remove('role-admin');
        const mobileAdminLink = document.getElementById('mobile-admin-link');
        if (mobileAdminLink) mobileAdminLink.remove();
    }

    // Desktop Header
    const authButtons = document.querySelector('.auth-wrapper .auth-buttons');
    const userInfo = document.querySelector('.auth-wrapper .user-info');
    if (authButtons) authButtons.classList.add('hidden');
    if (userInfo) {
        userInfo.classList.remove('hidden');
        const welcomeMsg = userInfo.querySelector('.welcome-message');
        if (welcomeMsg) welcomeMsg.textContent = `Hola, ${user.username}`;
    }

    // --- CORRECCIÓN PARA MENÚ MÓVIL ---
    // Buscamos dentro del contenedor fijo del menú móvil
    const mobileAuthContainer = document.querySelector('.mobile-menu-auth-fixed.logged-in-only');
    if (mobileAuthContainer) {
        const mobileWelcomeMsg = mobileAuthContainer.querySelector('.welcome-message');
        if (mobileWelcomeMsg) {
            // Actualizamos el texto
            mobileWelcomeMsg.textContent = `Hola, ${user.username}`;
            // Color verde para resaltar
            mobileWelcomeMsg.style.color = 'var(--color-primary)'; 
        }
    }
}

// ... (Las funciones de registro, OTP, etc. se mantienen igual) ...
// Voy a resumir las funciones que no cambian para no hacer el código gigante
// Asegúrate de mantener handleRegisterSubmit, handleOtpSubmit, handleResendOtp, handleLoginSubmit, etc.
// Solo cambiaré fetchWithAuth y exportaré todo completo al final.

async function handleRegisterSubmit(event) { /* ... (código original) ... */ 
    event.preventDefault();
    const form = event.target;
    const usernameInput = form.querySelector('#username');
    const emailInput = form.querySelector('#email');
    const passwordInput = form.querySelector('#register-password');
    const confirmPasswordInput = form.querySelector('#register-confirm-password');
    const errorMessageEl = form.querySelector('#error-message');
    const submitButton = form.querySelector('button[type="submit"]');

    errorMessageEl.textContent = '';
    const passwordValidation = validatePasswordStrength(passwordInput.value);
    if (!passwordValidation.isValid) {
        errorMessageEl.textContent = passwordValidation.message;
        return;
    }
    if (passwordInput.value !== confirmPasswordInput.value) {
        errorMessageEl.textContent = 'Las contraseñas no coinciden.';
        return;
    }

    submitButton.disabled = true;
    submitButton.innerHTML = '<span class="spinner-sm"></span>';

    try {
        const response = await fetch(`${API_BASE_URL}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: usernameInput.value,
                email: emailInput.value,
                password: passwordInput.value
            })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Ocurrió un error.');

        sessionStorage.setItem('emailForVerification', emailInput.value);

        const registerModal = document.getElementById('register-modal');
        const otpModal = document.getElementById('email-verification-modal');
        if (registerModal) closeModal(registerModal);
        if (otpModal) {
            otpModal.querySelector('#email-display').textContent = emailInput.value;
            openModal(otpModal);
        }
    } catch (error) {
        errorMessageEl.textContent = error.message;
    } finally {
        submitButton.disabled = false;
        submitButton.innerHTML = 'Crear Cuenta';
    }
}

async function handleOtpSubmit(event) { /* ... (código original) ... */ 
    event.preventDefault();
    const form = event.target;
    const email = sessionStorage.getItem('emailForVerification');
    const otp = form.querySelector('#email-otp-input').value;
    const errorMessageEl = form.querySelector('#email-verification-error');
    const submitButton = form.querySelector('button[type="submit"]');

    if (!email) {
        errorMessageEl.textContent = 'No se pudo identificar el correo. Por favor, intenta registrarte de nuevo.';
        return;
    }
    
    errorMessageEl.textContent = '';
    submitButton.disabled = true;
    submitButton.innerHTML = '<span class="spinner-sm"></span>';

    try {
        const response = await fetch(`${API_BASE_URL}/verify-email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, otp })
        });
        
        const data = await response.json();
        
        if (data.success === false) {
            throw new Error(data.message || 'Error al verificar.');
        }

        if (!data.token || !data.user) {
            throw new Error('La respuesta del servidor no incluyó los datos de sesión.');
        }

        localStorage.setItem('fortunaToken', data.token);
        localStorage.setItem('fortunaUser', JSON.stringify(data.user));
        sessionStorage.removeItem('emailForVerification');

        const otpModal = document.getElementById('email-verification-modal');
        if (otpModal) closeModal(otpModal);

        window.location.reload();
        
    } catch (error) {
        errorMessageEl.textContent = error.message;
    } finally {
        submitButton.disabled = false;
        submitButton.innerHTML = 'Confirmar y Activar Cuenta';
    }
}

async function handleResendOtp(event) { /* ... (código original) ... */ 
    event.preventDefault();
    const link = event.target.closest('#resend-otp-link');
    const email = sessionStorage.getItem('emailForVerification');
    
    if (!email || isResendCoolingDown || !link) {
        return;
    }

    isResendCoolingDown = true;
    link.classList.add('disabled');
    
    let timer = RESEND_COOLDOWN_SECONDS;
    const initialText = link.textContent;
    link.textContent = `Reenviar en ${timer}s`;

    const interval = setInterval(() => {
        timer--;
        link.textContent = `Reenviar en ${timer}s`;
        if (timer <= 0) {
            clearInterval(interval);
            link.textContent = initialText;
            link.classList.remove('disabled');
            isResendCoolingDown = false;
        }
    }, 1000);

    try {
        const response = await fetch(`${API_BASE_URL}/resend-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            clearInterval(interval);
            link.textContent = initialText;
            link.classList.remove('disabled');
            isResendCoolingDown = false;
            throw new Error(data.message);
        }
        
        showToast(data.message, 'success');

    } catch (error) {
        clearInterval(interval);
        link.textContent = initialText;
        link.classList.remove('disabled');
        isResendCoolingDown = false;
        showToast(error.message, 'error');
    }
}

async function handleLoginSubmit(event) { /* ... (código original) ... */ 
    event.preventDefault();
    const form = event.target;
    const identifierInput = form.querySelector('#login-identifier');
    const passwordInput = form.querySelector('#login-password');
    const errorMessageEl = form.querySelector('#login-error-message');
    const submitButton = form.querySelector('button[type="submit"]');
    
    errorMessageEl.textContent = '';
    const originalButtonText = submitButton.innerHTML;
    submitButton.innerHTML = '<span class="spinner-sm"></span>';
    submitButton.disabled = true;

    try {
        const response = await fetch(`${API_BASE_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                identifier: identifierInput.value,
                password: passwordInput.value
            })
        });

        const data = await response.json();
        if (!response.ok) {
            if (data.needsVerification) {
                sessionStorage.setItem('emailForVerification', data.email);
                const otpModal = document.getElementById('email-verification-modal');
                if (otpModal) {
                    otpModal.querySelector('#email-display').textContent = data.email;
                    closeModal(document.getElementById('login-modal'));
                    openModal(otpModal);
                }
                throw new Error(data.message);
            }
            throw new Error(data.message || 'Error en el inicio de sesión.');
        }
        if (!data.token || !data.user) throw new Error('Respuesta del servidor incompleta. Inténtalo de nuevo.');

        localStorage.setItem('fortunaToken', data.token);
        localStorage.setItem('fortunaUser', JSON.stringify(data.user));

        const loginModal = document.getElementById('login-modal');
        if (loginModal) closeModal(loginModal);

        window.location.reload();

    } catch (error) {
        errorMessageEl.textContent = error.message;
    } finally {
        submitButton.innerHTML = originalButtonText;
        submitButton.disabled = false;
    }
}

async function handleForgotPasswordSubmit(event) { /* ... (código original) ... */ 
    event.preventDefault();
    const form = event.target;
    const emailInput = form.querySelector('#forgot-email');
    const errorMessageEl = form.querySelector('#forgot-error-message');
    const formContainer = document.getElementById('forgot-form-container');
    const successMessage = document.getElementById('forgot-success-message');
    const submitButton = form.querySelector('button[type="submit"]');

    errorMessageEl.textContent = '';
    submitButton.disabled = true;

    try {
        const response = await fetch(`${API_BASE_URL}/forgot-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: emailInput.value })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Ocurrió un error.');
        formContainer.classList.add('hidden');
        successMessage.classList.remove('hidden');
    } catch (error) {
        errorMessageEl.textContent = error.message;
        submitButton.disabled = false;
    }
}

async function handleResetPasswordSubmit(event) { /* ... (código original) ... */ 
    event.preventDefault();
    const form = event.target;
    const passwordInput = form.querySelector('#reset-password');
    const confirmPasswordInput = form.querySelector('#reset-confirm-password');
    const errorMessageEl = form.querySelector('#reset-error-message');
    const modal = form.closest('#reset-password-modal');
    const submitButton = form.querySelector('button[type="submit"]');

    errorMessageEl.textContent = '';
    const passwordValidation = validatePasswordStrength(passwordInput.value);
    if (!passwordValidation.isValid) {
        errorMessageEl.textContent = passwordValidation.message;
        return;
    }
    if (passwordInput.value !== confirmPasswordInput.value) {
        errorMessageEl.textContent = 'Las contraseñas no coinciden.';
        return;
    }

    const { id, token } = modal.dataset;
    submitButton.disabled = true;

    try {
        const response = await fetch(`${API_BASE_URL}/reset-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, token, password: passwordInput.value })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Error al actualizar la contraseña.');
        document.getElementById('reset-form-container').classList.add('hidden');
        document.getElementById('reset-success-message').classList.remove('hidden');
    } catch (error) {
        errorMessageEl.textContent = error.message;
        submitButton.disabled = false;
    }
}

function handleLogout() {
    localStorage.removeItem('fortunaToken');
    localStorage.removeItem('fortunaUser');
    showToast('Has cerrado sesión.');
    window.location.href = '/index.html'; 
}

// =======================================================================
//  AQUÍ ESTÁ EL CAMBIO IMPORTANTE PARA EL PROBLEMA DE RETIRO
// =======================================================================
export async function fetchWithAuth(url, options = {}) {
    const authToken = localStorage.getItem('fortunaToken');

    if (!options.headers) {
        options.headers = {};
    }

    if (options.body && !options.headers['Content-Type']) {
        options.headers['Content-Type'] = 'application/json';
    }

    if (authToken) {
        options.headers['Authorization'] = `Bearer ${authToken}`;
    }

    try {
        const response = await fetch(url, options);
        if (response.status === 401) {
            handleLogout();
            throw new Error('Tu sesión ha expirado. Por favor, inicia sesión de nuevo.');
        }
        const contentType = response.headers.get("content-type");
        let responseData;
if (contentType && contentType.indexOf("application/json") !== -1) {
            responseData = await response.json();
        } else {    
         const text = await response.text();
            responseData = { message: text || `Error ${response.status}` };
        }
        // ----------------------------------------------------

        if (!response.ok) {
            throw new Error(responseData.message || `Error: ${response.status}`);
        }
        return responseData; 
        } catch (error) {

        console.error('Error en fetchWithAuth:', error);
        // Si el error es de parseo JSON (404 HTML), mostrar mensaje más claro
        if (error.message.includes('Unexpected token')) {
            throw new Error('La API no está disponible o la ruta no existe');
        }
        throw error;
    }
}

export function initAuth() {
    const currentUser = getUser();
    if (currentUser) {
        updateLoginState(currentUser);
    } else {
        document.body.classList.remove('user-logged-in');
    }
    
    const emailOtpInput = document.getElementById('email-otp-input');
    if (emailOtpInput) {
        emailOtpInput.addEventListener('input', () => {
            emailOtpInput.value = emailOtpInput.value.replace(/[^0-9]/g, '');
        });
    }
    
    const phoneOtpInput = document.getElementById('phone-otp-input');
    if (phoneOtpInput) {
        phoneOtpInput.addEventListener('input', () => {
            phoneOtpInput.value = phoneOtpInput.value.replace(/[^0-9]/g, '');
        });
    }

    document.body.addEventListener('submit', (event) => {
        if (event.target.id === 'register-form') handleRegisterSubmit(event);
        if (event.target.id === 'login-form') handleLoginSubmit(event);
        if (event.target.id === 'forgot-password-form') handleForgotPasswordSubmit(event);
        if (event.target.id === 'reset-password-form') handleResetPasswordSubmit(event);
        if (event.target.id === 'email-verification-form') handleOtpSubmit(event);
    });

    document.body.addEventListener('click', (event) => {
        if (event.target.closest('.forgot-password')) {
            event.preventDefault();
            const loginModal = document.getElementById('login-modal');
            const forgotModal = document.getElementById('forgot-password-modal');
            if (loginModal) closeModal(loginModal); 
            if (forgotModal) openModal(forgotModal);
        }
        if (event.target.id === 'logout-btn' || event.target.id === 'logout-btn-mobile' || event.target.closest('#logout-btn')) {
            handleLogout();
        }
        const toggleIcon = event.target.closest('.toggle-password');
        if (toggleIcon) {
            const wrapper = toggleIcon.closest('.input-wrapper');
            if (wrapper) {
                const input = wrapper.querySelector('input');
                const icon = toggleIcon.querySelector('i');
                if (input && icon) {
                    input.type = input.type === 'password' ? 'text' : 'password';
                    icon.classList.toggle('fa-eye');
                    icon.classList.toggle('fa-eye-slash');
                }
            }
        }
        if (event.target.closest('#resend-otp-link')) {
            handleResendOtp(event);
        }
    });
}