// Terrain material paint panel compatibility bridge.
// The universal material painter owns the visible panel; terrain owns the
// world-space weight field through TerrainMaterialPainting.js.

(() => {
    'use strict';

    const api = {
        mount() { return false; },
        refresh() { return window.SMMaterialPaintPanel?.refresh?.() ?? false; },
        open() { return window.SMMaterialPaintPanel?.open?.() ?? false; },
        close() { return window.SMMaterialPaintPanel?.close?.() ?? false; },
        installRenderHook() { return true; },
        get mounted() {
            return !!window.SMMaterialPaintPanel?.panel?.isConnected;
        }
    };

    window.SMTerrainMaterialPaintPanel = api;
    if (window.TerrainSculpting) {
        window.TerrainSculpting.materialPaintPanel = api;
    }
})();
