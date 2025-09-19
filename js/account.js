import { showToast } from './ui.js';
import { API_BASE_URL } from './config.js';

function handlePayoutMethodChange() {
    const selector = document.getElementById('payout-method');
    if (!selector) return;

    selector.addEventListener('change', () => {
        const selectedMethod = selector.value;
        document.querySelectorAll('.payout-fields').forEach(fieldSet => {
            fieldSet.classList.toggle('active', fieldSet.dataset.method === selectedMethod);
        });
    });
    selector.dispatchEvent(new Event('change')); 
}

function handle2FASetup() {
    const enableBtn = document.getElementById('enable-2fa-btn');
    const disableBtn = document.getElementById('disable-2fa-btn');
    const verifyForm = document.getElementById('verify-2fa-form');

    const viewDisabled = document.getElementById('2fa-disabled');
    const viewSetup = document.getElementById('2fa-setup');
    const viewEnabled = document.getElementById('2fa-enabled');
    
    if(!enableBtn || !disableBtn || !verifyForm) return;

    enableBtn.addEventListener('click', () => {
        viewDisabled.classList.add('hidden');
        viewSetup.classList.remove('hidden');
    });

    verifyForm.addEventListener('submit', (e) => {
        e.preventDefault();
        viewSetup.classList.add('hidden');
        viewEnabled.classList.remove('hidden');
        showToast('¡2FA activado con éxito!');
    });

    disableBtn.addEventListener('click', () => {
        viewEnabled.classList.add('hidden');
        viewDisabled.classList.remove('hidden');
        showToast('2FA desactivado.');
    });
}

export function renderBetHistory() {
    const historyLists = document.querySelectorAll('.history-list');
    if (historyLists.length === 0) return;

    const currentUser = localStorage.getItem('fortunaUser');
    if (!currentUser) return;

    const allHistories = JSON.parse(localStorage.getItem('fortunaAllHistories')) || {};
    
    const betHistory = allHistories[currentUser] || [];
    
    historyLists.forEach(list => {
        list.innerHTML = '';
        if (betHistory.length === 0) {
            list.innerHTML = '<li>Aún no has realizado ninguna apuesta.</li>';
            return;
        }

        const historyToShow = list.classList.contains('full-history') ? betHistory : betHistory.slice(-5);

        historyToShow.slice().reverse().forEach(record => {
            const betDescription = record.bets.map(b => b.team.split(' vs ')[0]).join(', ');
            const statusClass = record.status.toLowerCase();
            const winnings = record.stake * record.bets.reduce((acc, bet) => acc * bet.odds, 1);

            const listItem = document.createElement('li');
            listItem.innerHTML = `
                <span>Apuesta en: ${betDescription} (Bs. ${record.stake.toFixed(2)})</span>
                <div style="text-align: right;">
                    <span class="${statusClass}">${record.status}</span>
                    ${record.status === 'Ganada' ? `<span style="display: block; font-size: 0.8rem; color: var(--color-success);">+ Bs. ${winnings.toFixed(2)}</span>` : ''}
                </div>
            `;
            list.appendChild(listItem);
        });
    });
}

export function initAccountDashboard() {
    const menuLinks = document.querySelectorAll('.account-menu-link');
    const sections = document.querySelectorAll('.account-section');
    const addMethodBtn = document.getElementById('add-payout-method-btn');
    const payoutForm = document.getElementById('payout-method-form');

    if (menuLinks.length === 0) return;

    menuLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            menuLinks.forEach(l => l.classList.remove('active'));
            sections.forEach(s => s.classList.remove('active'));
            
            const targetId = link.dataset.target;
            const targetSection = document.getElementById(targetId);

            link.classList.add('active');
            if (targetSection) {
                targetSection.classList.add('active');
            }
        });
    });

    if (addMethodBtn && payoutForm) {
        addMethodBtn.addEventListener('click', () => {
            payoutForm.classList.toggle('hidden');
        });
    }

    const passwordChangeForm = document.getElementById('password-change-form');
    if (passwordChangeForm) {
        let isCodeStep = false; 
        const submitButton = passwordChangeForm.querySelector('button[type="submit"]');
        const confirmationGroup = document.getElementById('confirmation-code-group');

        passwordChangeForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            submitButton.disabled = true;

            const userEmail = localStorage.getItem('fortunaUserEmail');
            if (!userEmail) {
                showToast('Error de sesión. Por favor, vuelve a iniciar sesión.', 'error');
                submitButton.disabled = false;
                return;
            }

            if (!isCodeStep) {
                try {
                    const response = await fetch(`${API_BASE_URL}/request-password-change-code`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email: userEmail })
                    });
                    const data = await response.json();
                    if (!response.ok) throw new Error(data.message);

                    showToast(data.message, 'success');
                    confirmationGroup.classList.remove('hidden');
                    isCodeStep = true;
                } catch (error) {
                    showToast(error.message, 'error');
                } finally {
                    submitButton.disabled = false;
                }

            } else {
                const currentPassword = document.getElementById('current-password').value;
                const newPassword = document.getElementById('new-password').value;
                const confirmNewPassword = document.getElementById('confirm-new-password').value;
                const code = document.getElementById('confirmation-code').value;

                if (newPassword !== confirmNewPassword) {
                    showToast('Las nuevas contraseñas no coinciden.', 'error');
                    submitButton.disabled = false;
                    return;
                }
                
                try {
                    const response = await fetch(`${API_BASE_URL}/change-password`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            email: userEmail,
                            currentPassword,
                            newPassword,
                            code
                        })
                    });
                    const data = await response.json();
                    if (!response.ok) throw new Error(data.message);

                    showToast(data.message, 'success');
                    passwordChangeForm.reset();
                    confirmationGroup.classList.add('hidden');
                    isCodeStep = false;
                } catch (error) {
                    showToast(error.message, 'error');
                } finally {
                    submitButton.disabled = false;
                }
            }
        });
    }

    handlePayoutMethodChange();
    handle2FASetup();

    if (window.location.hash) {
        const targetId = window.location.hash.substring(1);
        const targetLink = document.querySelector(`.account-menu-link[data-target="${targetId}"]`);
        if (targetLink) {
            targetLink.click();
        }
    }
}