// Archivo: js/payments.js (MODIFICADO Y COMPLETO)

import { showToast } from './ui.js';
import { fetchWithAuth } from './auth.js'; 
import { API_BASE_URL } from './config.js'; 
import { closeModal, openModal } from './modal.js';
import { loadPayoutMethods } from './account.js';

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
            const textToCopy = copyBtn.closest('.wallet-address').querySelector('span');
            if (textToCopy) {
                navigator.clipboard.writeText(textToCopy.textContent).then(() => {
                    showToast('¡Dirección copiada!');
                });
            }
        }
    });

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
            
            closeModal(depositModal);
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
    //  LÓGICA DE RETIRO
    // ==========================================================
    const withdrawForm = document.getElementById('withdraw-form');
    const withdrawModal = document.getElementById('withdraw-modal');

    // Listener para abrir el modal de retiro
    document.body.addEventListener('click', (e) => {
        if (e.target.closest('[data-modal-target="withdraw-modal"]')) {
            e.preventDefault();
            const modal = document.getElementById('withdraw-modal');
            if(modal) {
                openModal(modal);
                // IMPORTANTE: Recargamos los métodos de pago cada vez que se abre el modal
                loadPayoutMethods(); 
            }
        }
    });
    
    withdrawForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const amountInput = withdrawForm.querySelector('input[name="withdraw-amount"]');
        const methodSelect = withdrawForm.querySelector('select[name="withdraw-method"]');
        const submitButton = withdrawForm.querySelector('button[type="submit"]');
        
        const amount = parseFloat(amountInput.value);
        const methodId = methodSelect ? methodSelect.value : null;

        if (!amount || amount <= 0) {
            showToast('Ingresa un monto válido.', 'error');
            return;
        }
        
        if (!methodId) {
            showToast('Por favor, selecciona un método de retiro. Si no tienes uno, añádelo en "Mi Cuenta".', 'error');
            return;
        }

        const originalBtnText = submitButton.innerHTML;
        submitButton.disabled = true;
        submitButton.innerHTML = '<span class="spinner-sm"></span> Procesando...';

        try {
            // ==========================================================
            //  CORREGIDO: La ruta ahora es /withdraw
            // ==========================================================
            const response = await fetchWithAuth(`${API_BASE_URL}/withdraw`, { 
                method: 'POST',
                body: JSON.stringify({
                    amount: amount,
                    methodId: methodId
                })
            });
            
            const data = await response.json();
            if (!response.ok) throw new Error(data.message);
            
            showToast(data.message, 'success');

            if(withdrawModal){
                closeModal(withdrawModal);
            }
            withdrawForm.reset();

        } catch (error) {
            showToast(error.message, 'error');
        } finally {
            submitButton.disabled = false;
            submitButton.innerHTML = originalBtnText;
        }
    });
}