// Archivo: js/payments.js (VERSIÓN FINAL COMPLETA Y MODIFICADA)

import { showToast } from './ui.js';
import { fetchWithAuth } from './auth.js'; // <-- AÑADIDO
import { API_BASE_URL } from './config.js'; // <-- AÑADIDO

let currentMethod = null;

function showStep(stepNumber) {
    document.querySelectorAll('.deposit-step').forEach(step => step.classList.remove('active'));
    const nextStep = document.querySelector(`#deposit-step-${stepNumber}`);
    if (nextStep) {
        nextStep.classList.add('active');
    }
}

function showInstructions(method) {
    currentMethod = method; // Guardamos el método actual (ej: 'pago-movil')
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

    // (El resto de tus listeners de botones de modal están perfectos)
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

    // ==========================================================
    //  INICIO DE LA MODIFICACIÓN: Reportar Depósito
    // ==========================================================
    const reportForm = document.getElementById('report-payment-form');
    reportForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const amountInput = reportForm.querySelector('input[name="deposit-amount"]');
        const referenceInput = reportForm.querySelector('input[name="deposit-reference"]');
        const submitButton = reportForm.querySelector('button[type="submit"]');

        if (!currentMethod) {
            showToast('Error: No se seleccionó un método.', 'error');
            return;
        }

        const amount = parseFloat(amountInput.value);
        const reference = referenceInput.value;

        if (!amount || amount <= 0 || !reference) {
            showToast('Por favor, completa el monto y la referencia.', 'error');
            return;
        }

        const originalBtnText = submitButton.innerHTML;
        submitButton.disabled = true;
        submitButton.innerHTML = '<span class="spinner-sm"></span> Reportando...';

        try {
            const response = await fetchWithAuth(`${API_BASE_URL}/request-deposit`, {
                method: 'POST',
                body: JSON.stringify({
                    amount: amount,
                    method: currentMethod,
                    reference: reference
                })
            });
            
            const data = await response.json();
            if (!response.ok) throw new Error(data.message);

            showToast(data.message, 'success');
            
            depositModal.classList.remove('active');
            document.body.classList.remove('modal-open');
            reportForm.reset();
            showStep(1);

        } catch (error) {
            showToast(error.message, 'error');
        } finally {
            submitButton.disabled = false;
            submitButton.innerHTML = originalBtnText;
        }
    });
    // ==========================================================
    //  FIN DE LA MODIFICACIÓN
    // ==========================================================

    // ==========================================================
    //  INICIO DE LA MODIFICACIÓN: Solicitar Retiro
    // ==========================================================
    const withdrawForm = document.getElementById('withdraw-form');
    const withdrawModal = document.getElementById('withdraw-modal');
    withdrawForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const amountInput = withdrawForm.querySelector('input[name="withdraw-amount"]');
        // const methodSelect = withdrawForm.querySelector('select[name="withdraw-method"]'); // (Deberás añadir esto a tu HTML)
        const submitButton = withdrawForm.querySelector('button[type="submit"]');
        
        const amount = parseFloat(amountInput.value);
        // const methodId = methodSelect.value; // (El ID del método de pago guardado)

        if (!amount || amount <= 0) {
            showToast('Ingresa un monto válido.', 'error');
            return;
        }
        
        // (Deberás añadir una validación para 'methodId' aquí)

        const originalBtnText = submitButton.innerHTML;
        submitButton.disabled = true;
        submitButton.innerHTML = '<span class="spinner-sm"></span> Procesando...';

        try {
            const response = await fetchWithAuth(`${API_BASE_URL}/request-withdrawal`, {
                method: 'POST',
                body: JSON.stringify({
                    amount: amount,
                    methodId: "pago-movil-id-ejemplo" // <-- Reemplaza esto con el valor real
                })
            });
            
            const data = await response.json();
            if (!response.ok) throw new Error(data.message);
            
            showToast(data.message, 'success');

            if(withdrawModal){
                withdrawModal.classList.remove('active');
                document.body.classList.remove('modal-open');
            }
            withdrawForm.reset();

        } catch (error) {
            showToast(error.message, 'error');
        } finally {
            submitButton.disabled = false;
            submitButton.innerHTML = originalBtnText;
        }
    });
    // ==========================================================
    //  FIN DE LA MODIFICACIÓN
    // ==========================================================
}