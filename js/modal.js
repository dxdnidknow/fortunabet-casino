// Archivo: js/modal.js (COMPLETO Y CORREGIDO)

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
        activeModal.querySelectorAll('a[href]:not([disabled]), button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])')
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

export function openModal(modal) {
    if (!modal) return;
    closeMobileMenu();
    lastActiveElement = document.activeElement;
    document.body.classList.add('modal-open');
    modal.classList.add('active');
    activeModal = modal;
    const firstFocusable = modal.querySelector('input, button');
    if (firstFocusable) firstFocusable.focus();
    document.addEventListener('keydown', focusTrap);
}

function resetModalForms(modal) {
    const forms = modal.querySelectorAll('form');
    forms.forEach(form => form.reset());

    const errorMessages = modal.querySelectorAll('.error-message');
    errorMessages.forEach(msg => msg.textContent = '');
    
    if (modal.id === 'register-modal') {
        modal.querySelector('#register-form-container')?.classList.remove('hidden');
        modal.querySelector('#success-message')?.classList.add('hidden');
    }
    if (modal.id === 'forgot-password-modal') {
        modal.querySelector('#forgot-form-container')?.classList.remove('hidden');
        modal.querySelector('#forgot-success-message')?.classList.add('hidden');
    }
    if (modal.id === 'reset-password-modal') {
        modal.querySelector('#reset-form-container')?.classList.remove('hidden');
        modal.querySelector('#reset-success-message')?.classList.add('hidden');
    }
}

export function closeModal(modal) {
    if (!modal) return;
    document.body.classList.remove('modal-open');
    modal.classList.remove('active');
    activeModal = null;
    if (modal.id === 'game-modal') {
        const gameIframe = modal.querySelector('#game-iframe');
        if (gameIframe) gameIframe.src = '';
    }
    
    // --- CORRECCIÓN ---
    // Se elimina la condición que evitaba que el modal de verificación se reseteara.
    // Ahora TODOS los modales se resetean al cerrarse.
    resetModalForms(modal);

    document.removeEventListener('keydown', focusTrap);
    if (lastActiveElement) lastActiveElement.focus();
}

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
            if (event.target.dataset.persistent === "true") {
                return; 
            }
            closeModal(event.target);
        }
    });

    window.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && activeModal) {
            if (activeModal.dataset.persistent === "true") {
                return;
            }
            closeModal(activeModal);
        }
    });
}