// Archivo: js/payments.js (VERSIÓN FINAL COMPLETA)

import { showToast } from './ui.js';

let currentMethod = null;

function showStep(stepNumber) {
    document.querySelectorAll('.deposit-step').forEach(step => step.classList.remove('active'));
    const nextStep = document.querySelector(`#deposit-step-${stepNumber}`);
    if (nextStep) {
        nextStep.classList.add('active');
    }
}

function showInstructions(method) {
    currentMethod = method;
    document.querySelectorAll('.payment-instructions').forEach(inst => inst.classList.remove('active'));
    const instructions = document.querySelector(`#instructions-${method}`);
    if (instructions) {
        instructions.classList.add('active');
    }
    showStep(2);
}

export function initPaymentModals() {
    const depositModal = document.getElementById('deposit-modal');
    
    if (!depositModal) return;

    document.body.addEventListener('click', (e) => {
        const target = e.target;
        
        if (target.matches('.btn.btn-primary') && target.textContent === 'Depositar') {
            document.getElementById('deposit-modal')?.classList.add('active');
            document.body.classList.add('modal-open');
        }
        if (target.matches('.btn.btn-secondary') && target.textContent === 'Retirar') {
            document.getElementById('withdraw-modal')?.classList.add('active');
            document.body.classList.add('modal-open');
        }

        const editMethodLink = target.closest('.edit-method-link');
        if (editMethodLink) {
            e.preventDefault();
            
            document.getElementById('withdraw-modal')?.classList.remove('active');
            document.body.classList.remove('modal-open');

            if (window.location.pathname.includes('mi-cuenta.html')) {
                document.querySelector('.account-menu-link[data-target="mis-datos"]')?.click();
            } else {
                window.location.href = 'mi-cuenta.html#mis-datos';
            }
        }
    });

    depositModal.addEventListener('click', (e) => {
        const paymentBtn = e.target.closest('.payment-method-btn');
        if (paymentBtn) {
            showInstructions(paymentBtn.dataset.method);
        }

        if (e.target.closest('.back-to-methods')) {
            showStep(1);
        }

        const copyBtn = e.target.closest('.copy-btn');
        if (copyBtn) {
            const address = copyBtn.previousElementSibling.textContent;
            navigator.clipboard.writeText(address).then(() => {
                showToast('¡Dirección copiada!');
            });
        }
    });

    const reportForm = document.getElementById('report-payment-form');
    reportForm?.addEventListener('submit', (e) => {
        e.preventDefault();
        showToast('Pago reportado. Se acreditará en breve.');
        
        depositModal.classList.remove('active');
        document.body.classList.remove('modal-open');
        reportForm.reset();
        showStep(1);
    });

    const withdrawForm = document.getElementById('withdraw-form');
    const withdrawModal = document.getElementById('withdraw-modal');
    withdrawForm?.addEventListener('submit', (e) => {
        e.preventDefault();
        showToast('Solicitud de retiro enviada.');

        if(withdrawModal){
            withdrawModal.classList.remove('active');
            document.body.classList.remove('modal-open');
        }
        withdrawForm.reset();
    });
}