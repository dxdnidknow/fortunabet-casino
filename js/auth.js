// --- ARCHIVO COMPLETO Y MEJORADO: js/auth.js ---

import { showToast } from './ui.js';
import { API_BASE_URL } from './config.js';
/**
 * Actualiza el estado visual de la interfaz de usuario para reflejar que el usuario ha iniciado sesión.
 * @param {string} username - El nombre de usuario a mostrar.
 */
function updateLoginState(username) {
    document.body.classList.add('user-logged-in'); // <-- AÑADE ESTA LÍNEA
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

    if (passwordInput.value !== confirmPasswordInput.value) {
        errorMessageEl.textContent = 'Las contraseñas no coinciden.';
        return;
    }
    if (passwordInput.value.length < 8) {
        errorMessageEl.textContent = 'La contraseña debe tener al menos 8 caracteres.';
        return;
    }

    // --- INICIO DE LA LÓGICA REAL ---
    try {
        const response = await fetch(`${API_BASE_URL}/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                username: usernameInput.value,
                email: emailInput.value,
                password: passwordInput.value
            })
        });

        const data = await response.json();

        if (!response.ok) {
            // Si el servidor responde con un error (ej: 409 - Conflicto), lo mostramos
            throw new Error(data.message || 'Ocurrió un error.');
        }

        // Si todo fue bien (código 201), mostramos el mensaje de éxito
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
    const emailInput = form.querySelector('#login-email');
    const passwordInput = form.querySelector('#login-password');
    const errorMessageEl = form.querySelector('#login-error-message');

    errorMessageEl.textContent = '';

    try {
        const response = await fetch(`${API_BASE_URL}/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                email: emailInput.value,
                password: passwordInput.value
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'Error al iniciar sesión.');
        }

        // Si el inicio de sesión fue exitoso, el servidor nos devuelve el username
        const username = data.username;

        // Cerramos el modal de login
        const loginModal = document.getElementById('login-modal');
        if (loginModal) {
            loginModal.classList.remove('active');
            document.body.classList.remove('modal-open');
        }

        // Actualizamos la UI para reflejar el inicio de sesión
        updateLoginState(username);
        showToast(`¡Hola de nuevo, ${username}!`);

    } catch (error) {
        errorMessageEl.textContent = error.message;
    }
}

/**
 * Maneja el cierre de sesión del usuario.
 */
function handleLogout() {
    localStorage.removeItem('fortunaUser');
    document.body.classList.remove('user-logged-in'); // <-- AÑADE ESTA LÍNEA
    document.querySelectorAll('.auth-buttons').forEach(el => el.classList.remove('hidden'));
    document.querySelectorAll('.user-info').forEach(el => el.classList.add('hidden'));
    showToast('Has cerrado sesión.');

    // Si estamos en "Mi Cuenta", redirige al inicio para resetear todo
    if (window.location.pathname.includes('mi-cuenta.html')) {
        window.location.href = 'index.html';
    }
}

/**
 * Función principal que inicializa toda la lógica de autenticación.
 */
export function initAuth() {
    // 1. Comprueba si ya existe una sesión al cargar la página
    const loggedInUser = localStorage.getItem('fortunaUser');
    if (loggedInUser) {
        updateLoginState(loggedInUser);
    }

    // 2. Usa delegación de eventos para manejar los envíos de formularios de forma eficiente
    document.body.addEventListener('submit', (event) => {
        if (event.target.id === 'register-form') {
            handleRegisterSubmit(event);
        }
        if (event.target.id === 'login-form') {
            handleLoginSubmit(event);
        }
    });

    // 3. Usa delegación de eventos para manejar clics en botones de logout y toggles de contraseña
    document.body.addEventListener('click', (event) => {
        
        // Lógica para cerrar sesión (funciona para botones de escritorio y móvil)
        if (event.target.id === 'logout-btn' || event.target.id === 'logout-btn-mobile') {
            handleLogout();
        }

        // Lógica robusta para mostrar/ocultar la contraseña
        const toggleIcon = event.target.closest('.toggle-password');
        if (toggleIcon) {
            const passwordGroup = toggleIcon.closest('.password-group');
            if (passwordGroup) {
                const input = passwordGroup.querySelector('input');
                if (input) {
                    // Cambia el tipo del input entre 'password' y 'text'
                    input.type = input.type === 'password' ? 'text' : 'password';
                    
                    // Cambia el ícono entre ojo abierto y ojo cerrado
                    toggleIcon.classList.toggle('fa-eye');
                    toggleIcon.classList.toggle('fa-eye-slash');
                }
            }
        }
    });
}