// --- ARCHIVO COMPLETO Y CORREGIDO: js/loader.js ---

/**
 * Carga componentes HTML reutilizables en elementos específicos del DOM.
 * @param {string} url - La ruta al archivo del componente HTML.
 * @param {string} elementId - El ID del elemento donde se inyectará el HTML.
 */
async function loadComponent(url, elementId) {
    const element = document.getElementById(elementId);
    if (!element) {
        // No imprimimos un error si el placeholder no existe, 
        // ya que no todas las páginas necesitan todos los componentes.
        // console.warn(`Placeholder '${elementId}' no encontrado en esta página.`);
        return; 
    }
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`No se pudo cargar el componente: ${url} (Estado: ${response.status})`);
        }
        const text = await response.text();
        element.innerHTML = text;
    } catch (error) {
        console.error('Error cargando componente:', error);
        element.innerHTML = `<p style="color: #e74c3c; text-align: center;">Error al cargar contenido.</p>`;
    }
}

// Esta función carga todos los componentes compartidos
export async function initSharedComponents() {
    await Promise.all([
        loadComponent('components/header.html', 'header-placeholder'),
        loadComponent('components/modals.html', 'modals-placeholder'),
        loadComponent('components/footer.html', 'footer-placeholder'),
        loadComponent('components/mobile-menu.html', 'mobile-menu-placeholder'),
        loadComponent('components/sports-panel.html', 'sports-panel-placeholder'),
        loadComponent('components/help-widget.html', 'help-widget-placeholder') // AÑADE ESTA LÍNEA
    ]);
}