    // Archivo: js/auth.js (COMPLETO Y CORREGIDO PARA ROL DE ADMIN)

    import { showToast } from './ui.js';
    import { API_BASE_URL } from './config.js';
    import { openModal, closeModal } from './modal.js';

    // --- Constantes y Estado ---
    const RESEND_COOLDOWN_SECONDS = 60;
    let isResendCoolingDown = false;

    // --- Funciones de Sesión ---
    function getToken() {
        return localStorage.getItem('fortunaToken');
    }

    function getUser() {
        const userString = localStorage.getItem('fortunaUser');
        if (!userString) return null;
        try {
            return JSON.parse(userString);
        } catch (error) {
            console.error("Error al leer datos del usuario. Limpiando localStorage corrupto:", error);
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

    function updateLoginState(user) {
        if (!user || !user.username) {
            console.error("Intento de actualizar el estado de login sin un usuario válido.");
            return;
        }
        document.body.classList.add('user-logged-in');
        
        // --- INICIO DE LA CORRECCIÓN PARA EL ROL DE ADMIN ---
        if (user.role === 'admin') {
            document.body.classList.add('role-admin');
        } else {
            document.body.classList.remove('role-admin');
        }
        // --- FIN DE LA CORRECCIÓN ---

        const authButtons = document.querySelector('.auth-wrapper .auth-buttons');
        const userInfo = document.querySelector('.auth-wrapper .user-info');
        if (authButtons) authButtons.classList.add('hidden');
        if (userInfo) {
            userInfo.classList.remove('hidden');
            const welcomeMsg = userInfo.querySelector('.welcome-message');
            if (welcomeMsg) welcomeMsg.textContent = `Hola, ${user.username}`;
        }

        const mobileAuthButtons = document.querySelector('.mobile-menu-auth .auth-buttons');
        const mobileUserInfo = document.querySelector('.mobile-menu-auth .user-info');
        if (mobileAuthButtons) mobileAuthButtons.style.display = 'none';
        if (mobileUserInfo) {
            mobileUserInfo.style.display = 'block';
            const mobileWelcomeMsg = mobileUserInfo.querySelector('.welcome-message');
            if (mobileWelcomeMsg) mobileWelcomeMsg.textContent = `Hola, ${user.username}`;
        }
    }

    async function handleRegisterSubmit(event) {
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

    async function handleOtpSubmit(event) {
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

    async function handleResendOtp(event) {
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

    async function handleLoginSubmit(event) {
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
            if (!response.ok) throw new Error(data.message || 'Ocurrió un error.');
            formContainer.classList.add('hidden');
            successMessage.classList.remove('hidden');
        } catch (error) {
            errorMessageEl.textContent = error.message;
            submitButton.disabled = false;
        }
    }

    async function handleResetPasswordSubmit(event) {
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

async function fetchWithAuth(url, options = {}) {
    const authToken = localStorage.getItem('authToken');

    if (authToken) {
        options.headers = {
            ...options.headers,
            'Authorization': `Bearer ${authToken}`
        };
    }

    try {
        const response = await fetch(url, options);

        // SOLO CERRAR SESIÓN EN CASO DE 401 O 403 (ERRORES DE AUTENTICACIÓN)
        if (response.status === 401 || response.status === 403) {
            const loginModal = document.getElementById('login-modal');
            if (loginModal) openModal(loginModal); // Mostrar modal si existe
            handleLogout(); // <--- Ahora SOLO se llamará aquí para 401/403
            throw new Error('Sesión inválida o expirada.');
        }

        if (!response.ok) {
            // Para otros errores (400, 404, 500, etc.), simplemente lanzamos el error
            // para que la función que llamó a fetchWithAuth lo maneje (ej. en account.js)
            const errorData = await response.json();
            throw new Error(errorData.message || `Error en la solicitud: ${response.status}`);
        }

        return await response.json();
        } catch (error) {
        console.error('Error en fetchWithAuth:', error);
        throw error; // Propagar el error para que la lógica de la llamada original lo maneje
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