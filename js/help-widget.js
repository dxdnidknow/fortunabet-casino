// Archivo: js/help-widget.js (VERSIÓN RECONSTRUIDA)

function handleFaqAccordion(event) {
    const question = event.target.closest('.faq-question');
    if (!question) return;

    const answer = question.nextElementSibling;
    const isActive = question.classList.contains('active');

    // Cierra todos los demás
    document.querySelectorAll('.faq-question.active').forEach(q => {
        if (q !== question) {
            q.classList.remove('active');
            const ans = q.nextElementSibling;
            if (ans) {
                ans.style.maxHeight = null;
            }
        }
    });

    // Abre o cierra el actual
    if (!isActive) {
        question.classList.add('active');
        if (answer) {
            answer.style.maxHeight = answer.scrollHeight + 'px';
        }
    } else {
        question.classList.remove('active');
        if (answer) {
            answer.style.maxHeight = null;
        }
    }
}

function handleFaqSearch(event) {
    const searchTerm = event.target.value.toLowerCase().trim();
    const faqItems = document.querySelectorAll('#faq-list .faq-item');

    faqItems.forEach(item => {
        const questionText = item.querySelector('.faq-question span').textContent.toLowerCase();
        const answerText = item.querySelector('.faq-answer p').textContent.toLowerCase();

        if (questionText.includes(searchTerm) || answerText.includes(searchTerm)) {
            item.style.display = 'block';
        } else {
            item.style.display = 'none';
        }
    });
}

export function initHelpWidget() {
    // Esperar a que el DOM esté listo
    const init = () => {
        const trigger = document.querySelector('.help-trigger-btn');
        const widget = document.getElementById('help-widget');
        const closeBtn = document.querySelector('.close-widget-btn');
        const faqList = document.getElementById('faq-list');
        const searchInput = document.getElementById('faq-search');

        if (!trigger || !widget) {
            setTimeout(init, 100);
            return;
        }

        // Estado inicial
        widget.classList.remove('is-open');
        trigger.setAttribute('aria-expanded', 'false');

        const openWidget = () => {
            widget.classList.add('is-open');
            trigger.setAttribute('aria-expanded', 'true');
        };

        const closeWidget = () => {
            widget.classList.remove('is-open');
            trigger.setAttribute('aria-expanded', 'false');
        };

        // Event listeners
        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            widget.classList.contains('is-open') ? closeWidget() : openWidget();
        });

        if (closeBtn) {
            closeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                closeWidget();
            });
        }

        if (faqList) {
            faqList.addEventListener('click', (e) => {
                e.stopPropagation();
                handleFaqAccordion(e);
            });
        }
        
        if (searchInput) {
            searchInput.addEventListener('input', handleFaqSearch);
        }

        // Cerrar al hacer clic fuera
        document.addEventListener('click', (e) => {
            if (widget.classList.contains('is-open') && 
                !widget.contains(e.target) && 
                !trigger.contains(e.target)) {
                closeWidget();
            }
        });

        // Cerrar con Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && widget.classList.contains('is-open')) {
                closeWidget();
            }
        });
    };

    init();
}