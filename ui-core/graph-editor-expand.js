(function () {
    const bind = () => {
        const btn = document.getElementById('graph-editor-expand');
        if (!btn) return;
        btn.addEventListener('click', () => {
            document.body.classList.toggle('graph-editor-expanded');
            const isExpanded = document.body.classList.contains('graph-editor-expanded');
            btn.innerHTML = isExpanded
                ? '<i class="fas fa-compress" style="color: var(--accent-color);"></i> Collapse'
                : '<i class="fas fa-expand" style="color: var(--accent-danger);"></i> Expand';
            if (typeof window.onWindowResize === 'function') window.onWindowResize();
            if (typeof window.resizeGraphCanvas === 'function') window.resizeGraphCanvas();
        });
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bind);
    } else {
        bind();
    }
})();
