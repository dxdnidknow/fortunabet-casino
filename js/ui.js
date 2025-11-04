// --- ARCHIVO NUEVO: js/ui.js ---

/**
 * Muestra una notificación temporal (toast) en la pantalla.
 * La lógica de estilo ahora está 100% en CSS.
 * @param {string} message - El mensaje a mostrar.
 * @param {string} type - 'success' (default) o 'error'.
 */
export function showToast(message) {
    // Evita toasts duplicados
    if (document.querySelector('.toast-notification')) return;

    const toast = document.createElement('div');
    toast.className = 'toast-notification';
    toast.textContent = message;
    document.body.appendChild(toast);

    // Activa la animación de entrada
    setTimeout(() => {
        toast.classList.add('show');
    }, 10); 

    // Oculta y elimina el toast después de 3 segundos
    setTimeout(() => {
        toast.classList.remove('show');
        // Espera a que la transición de salida termine para eliminar el elemento
        toast.addEventListener('transitionend', () => toast.remove());
    }, 3000);
}