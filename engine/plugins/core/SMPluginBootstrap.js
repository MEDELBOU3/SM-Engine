(function () {
    'use strict';

    const CATALOG_URL = 'engine/plugins/PluginCatalog.json';
    let started = false;

    async function boot() {
        if (started) return;
        const manager = window.SMPluginManager;
        const loader = window.SMPluginLoader;
        if (!manager || !loader || !window.SMPluginRegistry) return;
        if (!window.initCompleted && !(window.scene && window.renderer)) {
            window.setTimeout(boot, 150);
            return;
        }
        started = true;
        try {
            await loader.loadCatalog(CATALOG_URL);
        } catch (error) {
            console.warn('[SMPluginBootstrap] Built-in plugin catalog was not loaded.', error);
        }
        await manager.start();
        console.info(`[SMPlugins] Ready with ${manager.list().length} discovered plugin(s).`);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
    else boot();

    window.SMPluginBootstrap = { boot, catalogUrl: CATALOG_URL };
})();
