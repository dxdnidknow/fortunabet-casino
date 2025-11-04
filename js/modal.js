// --- ARCHIVO COMPLETO Y CORREGIDO: js/modal.js ---

let activeModal = null;
let lastActiveElement = null;

function closeMobileMenu() {
    const mobileMenu = document.getElementById('mobile-menu');
    const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
    if (mobileMenu && mobileMenu.classList.contains('is-open')) {
        mobileMenu.classList.remove('is-open');
        document.body.classList.remove('panel-open');
        if (mobileMenuToggle) {
            mobileMenuToggle.classList.remove('is-active');
            mobileMenuToggle.setAttribute('aria-expanded', 'false');
        }
    }
}

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

    if (e.shiftKey) {
        if (document.activeElement === firstFocusableEl) {
            lastFocusableEl.focus();
            e.preventDefault();
        }
    } else {
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
export function openModal(modal) { // <-- EXPORTADO
    if (!modal) return;
    
    closeMobileMenu();

    lastActiveElement = document.activeElement;
    document.body.classList.add('modal-open');
    modal.classList.add('active');
    activeModal = modal;
    
    const firstFocusable = modal.querySelector('input, button');
    if (firstFocusable) {
        firstFocusable.focus();
    }
    
    document.addEventListener('keydown', focusTrap);
}

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
export function closeModal(modal) { // <-- EXPORTADO
    if (!modal) return;
    
    document.body.classList.remove('modal-open');

    modal.classList.remove('active');
    activeModal = null;
        if (modal.id === 'game-modal') {
        const gameIframe = modal.querySelector('#game-iframe');
        if (gameIframe) {
            gameIframe.src = '';
        }
    }
    resetModalForms(modal);
    document.removeEventListener('keydown', focusTrap);
    
    if (lastActiveElement) {
        lastActiveElement.focus();
    }
}

/**
 * Inicializa todos los listeners de eventos para los modales.
 */
export function initModals() {
    document.body.addEventListener('click', (event) => {
        const trigger = event.target.closest('[data-modal-trigger]');
        if (trigger) {
            const modal = document.getElementById(trigger.dataset.modalTrigger);
            openModal(modal);
            return;
        }

        const closeBtn = event.target.closest('.close-modal');
        if (closeBtn) {
            closeModal(closeBtn.closest('.modal-overlay'));
            return;
        }

        const switcher = event.target.closest('[data-modal-switch]');
        if (switcher) {
            event.preventDefault();
            const currentModal = switcher.closest('.modal-overlay');
            const nextModal = document.getElementById(switcher.dataset.modalSwitch);
            
            if (currentModal) closeModal(currentModal);
            if (nextModal) openModal(nextModal);
            return;
        }

        if (event.target.classList.contains('modal-overlay')) {
            closeModal(event.target);
        }
    });

    window.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && activeModal) {
            closeModal(activeModal);
        }
    });
}