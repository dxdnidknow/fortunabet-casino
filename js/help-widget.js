// Archivo: js/help-widget.js (NUEVO)

function handleFaqAccordion(event) {
    const question = event.target.closest('.faq-question');
    if (!question) return;

    const faqItem = question.parentElement;
    const answer = question.nextElementSibling;
    const isActive = question.classList.contains('active');

    // Cierra todos los demás para que solo uno esté abierto a la vez
    document.querySelectorAll('.faq-question.active').forEach(q => {
        if (q !== question) {
            q.classList.remove('active');
            q.nextElementSibling.style.maxHeight = null;
        }
    });

    // Abre o cierra el actual
    if (!isActive) {
        question.classList.add('active');
        answer.style.maxHeight = answer.scrollHeight + 'px';
    } else {
        question.classList.remove('active');
        answer.style.maxHeight = null;
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
    const trigger = document.querySelector('.help-trigger-btn');
    const widget = document.getElementById('help-widget');
    const closeBtn = document.querySelector('.close-widget-btn');
    const faqList = document.getElementById('faq-list');
    const searchInput = document.getElementById('faq-search');

    if (!trigger || !widget) return;

    trigger.addEventListener('click', () => {
        widget.classList.toggle('is-open');
    });

    closeBtn.addEventListener('click', () => {
        widget.classList.remove('is-open');
    });

    if (faqList) {
        faqList.addEventListener('click', handleFaqAccordion);
    }
    
    if (searchInput) {
        searchInput.addEventListener('input', handleFaqSearch);
    }
}