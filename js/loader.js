// --- ARCHIVO: js/loader.js (CORREGIDO RUTAS ABSOLUTAS) ---

/**
 * Carga componentes HTML reutilizables en elementos específicos del DOM.
 * @param {string} url - La ruta al archivo del componente HTML.
 * @param {string} elementId - El ID del elemento donde se inyectará el HTML.
 */
async function loadComponent(url, elementId) {
    const element = document.getElementById(elementId);
    if (!element) {
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
        // Opcional: Mostrar mensaje discreto o nada en producción
        // element.innerHTML = `<p style="color: #e74c3c; text-align: center; font-size: 0.8rem;">Error de carga.</p>`;
    }
}

// Esta función carga todos los componentes compartidos
export async function initSharedComponents() {
    // NOTA: Todas las rutas ahora empiezan con "/" para evitar errores 404 en subpáginas
    await Promise.all([
        loadComponent('/components/header.html', 'header-placeholder'),
        loadComponent('/components/modals.html', 'modals-placeholder'),
        loadComponent('/components/footer.html', 'footer-placeholder'),
        loadComponent('/components/mobile-menu.html', 'mobile-menu-placeholder'),
        loadComponent('/components/sports-panel.html', 'sports-panel-placeholder'),
        loadComponent('/components/help-widget.html', 'help-widget-placeholder')
    ]);
}