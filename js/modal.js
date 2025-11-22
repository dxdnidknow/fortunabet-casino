// Archivo: js/modal.js (COMPLETO Y MEJORADO)

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
    resetModalForms(modal);
    document.removeEventListener('keydown', focusTrap);
    if (lastActiveElement) lastActiveElement.focus();
}

export function initModals() {
    document.body.addEventListener('click', (event) => {
        // 1. Abrir modal
        const trigger = event.target.closest('[data-modal-trigger]');
        if (trigger) {
            const modal = document.getElementById(trigger.dataset.modalTrigger);
            openModal(modal);
            return;
        }

        // 2. Cerrar con botón X (Esto SIEMPRE funciona)
        const closeBtn = event.target.closest('.close-modal');
        if (closeBtn) {
            closeModal(closeBtn.closest('.modal-overlay'));
            return;
        }

        // 3. Cambiar de modal
        const switcher = event.target.closest('[data-modal-switch]');
        if (switcher) {
            event.preventDefault();
            const currentModal = switcher.closest('.modal-overlay');
            const nextModal = document.getElementById(switcher.dataset.modalSwitch);
            if (currentModal) closeModal(currentModal);
            if (nextModal) openModal(nextModal);
            return;
        }

        // 4. Cerrar al hacer clic afuera (Solo si NO es persistente)
        if (event.target.classList.contains('modal-overlay')) {
            // Si tiene data-persistent="true", NO hacemos nada (no cerramos)
            if (event.target.dataset.persistent === "true") {
                // Opcional: Hacer un pequeño efecto de vibración o parpadeo
                const container = event.target.querySelector('.auth-container');
                if(container) {
                    container.style.transform = 'scale(1.02)';
                    setTimeout(() => container.style.transform = 'scale(1)', 100);
                }
                return; 
            }
            closeModal(event.target);
        }
    });

    // 5. Cerrar con tecla Escape (Solo si NO es persistente)
    window.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && activeModal) {
            if (activeModal.dataset.persistent === "true") {
                return; // No cerrar si es persistente
            }
            closeModal(activeModal);
        }
    });
}