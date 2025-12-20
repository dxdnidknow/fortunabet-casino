// Archivo: js/ui.js - Utilidades de UI

/**
 * Muestra una notificación temporal (toast) en la pantalla.
 * @param {string} message - El mensaje a mostrar.
 * @param {string} type - 'success' (verde), 'error' (rojo), 'warning' (amarillo), 'info' (azul)
 */
export function showToast(message, type = 'info') {
    // Evita toasts duplicados del mismo mensaje
    const existingToast = document.querySelector('.toast-notification');
    if (existingToast && existingToast.textContent === message) return;

    // Si hay otro toast, lo removemos primero
    if (existingToast) existingToast.remove();

    const toast = document.createElement('div');
    toast.className = `toast-notification toast-${type}`;
    
    // Iconos según tipo
    const icons = {
        success: '<i class="fa-solid fa-circle-check"></i>',
        error: '<i class="fa-solid fa-circle-xmark"></i>',
        warning: '<i class="fa-solid fa-triangle-exclamation"></i>',
        info: '<i class="fa-solid fa-circle-info"></i>'
    };
    
    toast.innerHTML = `${icons[type] || icons.info} <span>${message}</span>`;
    document.body.appendChild(toast);

    // Activa la animación de entrada
    requestAnimationFrame(() => {
        toast.classList.add('show');
    });

    // Oculta y elimina el toast después de 3.5 segundos
    setTimeout(() => {
        toast.classList.remove('show');
        toast.addEventListener('transitionend', () => toast.remove(), { once: true });
    }, 3500);
}

/**
 * Formatea un número como moneda (Bs.)
 * @param {number} amount - Monto a formatear
 * @returns {string} Monto formateado
 */
export function formatCurrency(amount) {
    return `Bs. ${Number(amount || 0).toFixed(2)}`;
}

/**
 * Debounce - Retrasa la ejecución de una función
 * @param {Function} func - Función a ejecutar
 * @param {number} wait - Milisegundos de espera
 * @returns {Function}
 */
export function debounce(func, wait = 300) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}