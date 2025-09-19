import { showToast } from './ui.js';
import { API_BASE_URL } from './config.js';
import { openModal, closeModal } from './modal.js'; // Importamos las funciones de modal.js

/**
 * Actualiza el estado visual de la interfaz de usuario para reflejar que el usuario ha iniciado sesión.
 * @param {string} username - El nombre de usuario a mostrar.
 */
function updateLoginState(username) {
    document.body.classList.add('user-logged-in');
    document.querySelectorAll('.auth-buttons').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.user-info').forEach(el => el.classList.remove('hidden'));
    document.querySelectorAll('.welcome-message').forEach(el => el.textContent = `Hola, ${username}`);
    localStorage.setItem('fortunaUser', username);
}

/**
 * Maneja el envío del formulario de registro.
 * @param {Event} event - El objeto de evento del formulario.
 */
async function handleRegisterSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const usernameInput = form.querySelector('#username');
    const emailInput = form.querySelector('#email');
    const passwordInput = form.querySelector('#password');
    const confirmPasswordInput = form.querySelector('#confirm-password');
    const errorMessageEl = form.querySelector('#error-message');

    errorMessageEl.textContent = '';
    
const usernameRegex = /^[a-zA-Z]{4,}$/;
if (!usernameRegex.test(usernameInput.value)) {
    errorMessageEl.textContent = 'El usuario debe tener al menos 4 letras y no contener números ni espacios.';
    return;
}
    if (passwordInput.value !== confirmPasswordInput.value) {
        errorMessageEl.textContent = 'Las contraseñas no coinciden.';
        return;
    }
    if (passwordInput.value.length < 8) {
        errorMessageEl.textContent = 'La contraseña debe tener al menos 8 caracteres.';
        return;
    }

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
        if (!response.ok) {
            throw new Error(data.message || 'Ocurrió un error.');
        }

        const formContainer = document.getElementById('register-form-container');
        const successMessage = document.getElementById('success-message');
        if (formContainer) formContainer.classList.add('hidden');
        if (successMessage) successMessage.classList.remove('hidden');

    } catch (error) {
        errorMessageEl.textContent = error.message;
    }
}

/**
 * Maneja el envío del formulario de inicio de sesión.
 * @param {Event} event - El objeto de evento del formulario.
 */
async function handleLoginSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const identifierInput = form.querySelector('#login-identifier');
    const passwordInput = form.querySelector('#login-password');
    const errorMessageEl = form.querySelector('#login-error-message');
    
    errorMessageEl.textContent = '';

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
            throw new Error(data.message || 'Error al iniciar sesión.');
        }

        const loginModal = document.getElementById('login-modal');
        if (loginModal) {
            closeModal(loginModal);
        }

        updateLoginState(data.username);
        localStorage.setItem('fortunaUserEmail', data.email);
        showToast(`¡Hola de nuevo, ${data.username}!`);

    } catch (error) {
        errorMessageEl.textContent = error.message;
    }
}

/**
 * Maneja el envío del formulario de "olvidé mi contraseña".
 * @param {Event} event - El objeto de evento del formulario.
 */
async function handleForgotPasswordSubmit(event) {
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
        if (!response.ok) {
            throw new Error(data.message || 'Ocurrió un error.');
        }

        formContainer.classList.add('hidden');
        successMessage.classList.remove('hidden');

    } catch (error) {
        errorMessageEl.textContent = error.message;
        submitButton.disabled = false;
    }
}

/**
 * Maneja el envío del formulario para restablecer la contraseña.
 * @param {Event} event - El objeto de evento del formulario.
 */
async function handleResetPasswordSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const passwordInput = form.querySelector('#reset-password');
    const confirmPasswordInput = form.querySelector('#reset-confirm-password');
    const errorMessageEl = form.querySelector('#reset-error-message');
    const modal = form.closest('#reset-password-modal');
    const submitButton = form.querySelector('button[type="submit"]');

    errorMessageEl.textContent = '';

    if (passwordInput.value !== confirmPasswordInput.value) {
        errorMessageEl.textContent = 'Las contraseñas no coinciden.';
        return;
    }
    if (passwordInput.value.length < 8) {
        errorMessageEl.textContent = 'La contraseña debe tener al menos 8 caracteres.';
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
        if (!response.ok) {
            throw new Error(data.message || 'Error al actualizar la contraseña.');
        }

        document.getElementById('reset-form-container').classList.add('hidden');
        document.getElementById('reset-success-message').classList.remove('hidden');

    } catch (error) {
        errorMessageEl.textContent = error.message;
        submitButton.disabled = false;
    }
}

/**
 * Maneja el cierre de sesión del usuario.
 */
function handleLogout() {
    localStorage.removeItem('fortunaUser');
    localStorage.removeItem('fortunaUserEmail');
    document.body.classList.remove('user-logged-in');
    document.querySelectorAll('.auth-buttons').forEach(el => el.classList.remove('hidden'));
    document.querySelectorAll('.user-info').forEach(el => el.classList.add('hidden'));
    showToast('Has cerrado sesión.');

    if (window.location.pathname.includes('mi-cuenta.html')) {
        window.location.href = 'index.html';
    }
}

/**
 * Función principal que inicializa toda la lógica de autenticación.
 */
export function initAuth() {
    const loggedInUser = localStorage.getItem('fortunaUser');
    if (loggedInUser) {
        updateLoginState(loggedInUser);
    }

    document.body.addEventListener('submit', (event) => {
        if (event.target.id === 'register-form') handleRegisterSubmit(event);
        if (event.target.id === 'login-form') handleLoginSubmit(event);
        if (event.target.id === 'forgot-password-form') handleForgotPasswordSubmit(event);
        if (event.target.id === 'reset-password-form') handleResetPasswordSubmit(event);
    });

    document.body.addEventListener('click', (event) => {
        const forgotPasswordLink = event.target.closest('.forgot-password');
        if (forgotPasswordLink) {
            event.preventDefault();
            const loginModal = document.getElementById('login-modal');
            const forgotModal = document.getElementById('forgot-password-modal');
            
            if (loginModal) closeModal(loginModal); 
            if (forgotModal) openModal(forgotModal);
        }

        if (event.target.id === 'logout-btn' || event.target.id === 'logout-btn-mobile') {
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
    });
}