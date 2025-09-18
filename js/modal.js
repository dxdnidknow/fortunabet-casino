// --- ARCHIVO FINAL COMPLETO Y CORREGIDO: js/modal.js ---

let activeModal = null;
let lastActiveElement = null;

/**
 * Cierra el menú móvil si está abierto. Se usa para evitar que el menú
 * y un modal estén abiertos al mismo tiempo.
 */
function closeMobileMenu() {
    const mobileMenu = document.getElementById('mobile-menu');
    const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
    if (mobileMenu && mobileMenu.classList.contains('is-open')) {
        mobileMenu.classList.remove('is-open');
        document.body.classList.remove('panel-open'); // Usa la clase genérica
        if (mobileMenuToggle) {
            mobileMenuToggle.classList.remove('is-active');
            mobileMenuToggle.setAttribute('aria-expanded', 'false');
        }
    }
}

/**
 * Atrapa el foco del teclado dentro del modal activo, mejorando la accesibilidad.
 * @param {KeyboardEvent} e - El evento de teclado.
 */
const focusTrap = (e) => {
    if (!activeModal || e.key !== 'Tab') return;

    const focusableElements = Array.from(
        activeModal.querySelectorAll(
            'a[href]:not([disabled]), button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
    );
    if (focusableElements.length === 0) return;

    const firstFocusableEl = focusableElements[0];
    const lastFocusableEl = focusableElements[focusableElements.length - 1];

    if (e.shiftKey) { // Si se presiona Shift + Tab
        if (document.activeElement === firstFocusableEl) {
            lastFocusableEl.focus();
            e.preventDefault();
        }
    } else { // Si se presiona solo Tab
        if (document.activeElement === lastFocusableEl) {
            firstFocusableEl.focus();
            e.preventDefault();
        }
    }
};

/**
 * Abre un modal específico.
 * @param {HTMLElement} modal - El elemento del modal a abrir.
 */
function openModal(modal) {
    if (!modal) return;
    
    closeMobileMenu();

    lastActiveElement = document.activeElement;
    document.body.classList.add('modal-open'); // Clase para blur y scroll
    modal.classList.add('active');
    activeModal = modal;
    
    // Enfoca el primer elemento interactivo del modal
    const firstFocusable = modal.querySelector('input, button');
    if (firstFocusable) {
        firstFocusable.focus();
    }
    
    document.addEventListener('keydown', focusTrap);
}

/**
 * Reinicia los formularios dentro de un modal a su estado inicial.
 * @param {HTMLElement} modal - El modal que contiene los formularios.
 */
function resetModalForms(modal) {
    if (modal.id === 'register-modal') {
        const formContainer = modal.querySelector('#register-form-container');
        const successMessage = modal.querySelector('#success-message');
        const form = modal.querySelector('#register-form');
        const errorMessage = modal.querySelector('#error-message');

        if (formContainer) formContainer.classList.remove('hidden');
        if (successMessage) successMessage.classList.add('hidden');
        if (form) form.reset();
        if (errorMessage) errorMessage.textContent = '';
    }
    // Puedes añadir lógica para reiniciar el formulario de login aquí si es necesario
    const loginForm = modal.querySelector('#login-form');
    if (loginForm) {
        loginForm.reset();
        const loginError = loginForm.querySelector('#login-error-message');
        if (loginError) loginError.textContent = '';
    }
}

/**
 * Cierra un modal específico.
 * @param {HTMLElement} modal - El elemento del modal a cerrar.
 */
function closeModal(modal) {
    if (!modal) return;
    
    document.body.classList.remove('modal-open'); // Asegura que el blur se quite

    modal.classList.remove('active');
    activeModal = null;
        if (modal.id === 'game-modal') {
        const gameIframe = modal.querySelector('#game-iframe');
        if (gameIframe) {
            gameIframe.src = ''; // Limpiar el src detiene la ejecución del iframe
        }
    }
    resetModalForms(modal);
    document.removeEventListener('keydown', focusTrap);
    
    // Devuelve el foco al elemento que estaba activo antes de abrir el modal
    if (lastActiveElement) {
        lastActiveElement.focus();
    }
}

/**
 * Inicializa todos los listeners de eventos para los modales.
 */
export function initModals() {
    // Listener de clic delegado al body para máxima eficiencia
    document.body.addEventListener('click', (event) => {
        // Abrir modal
        const trigger = event.target.closest('[data-modal-trigger]');
        if (trigger) {
            const modal = document.getElementById(trigger.dataset.modalTrigger);
            openModal(modal);
            return;
        }

        // Cerrar con el botón 'X'
        const closeBtn = event.target.closest('.close-modal');
        if (closeBtn) {
            closeModal(closeBtn.closest('.modal-overlay'));
            return;
        }

        // Cambiar entre modales (ej: de registro a login)
        const switcher = event.target.closest('[data-modal-switch]');
        if (switcher) {
            event.preventDefault();
            const currentModal = switcher.closest('.modal-overlay');
            const nextModal = document.getElementById(switcher.dataset.modalSwitch);
            
            if (currentModal) closeModal(currentModal);
            if (nextModal) openModal(nextModal);
            return;
        }

        // Cerrar al hacer clic en el fondo del overlay
        if (event.target.classList.contains('modal-overlay')) {
            closeModal(event.target);
        }
    });

    // Listener de teclado para cerrar con la tecla 'Escape'
    window.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && activeModal) {
            closeModal(activeModal);
        }
    });
}