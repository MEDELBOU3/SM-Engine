/**
 * VideoEffectsWorkspaceBridge.js
 * Top FX tab -> Effects Inspector + Effects Studio dock.
 */
(function (global) {
    'use strict';
    class VideoEffectsWorkspaceBridge {
        constructor() { this.bound = false; this._click = this._click.bind(this); this.bind() }
        bind() { if (this.bound) return; this.bound = true; document.addEventListener('click', this._click, true) }
        _click(event) {
            const button = event.target.closest?.('#video-mode-tabs [data-mode]'); if (!button) return;
            const mode = String(button.dataset.mode || '').toLowerCase();
            if (mode !== 'fx' && mode !== 'effects') return;
            event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
            global.videoInspectorSidebar?.openPanel?.('effects', { force: true });
            global.ensureVideoEffectsDockManager?.()?.open?.({ tab: global.videoProject?.workspace?.perWorkspace?.edit?.effectsDockTab || 'effects' });
        }
    }
    global.VideoEffectsWorkspaceBridge = VideoEffectsWorkspaceBridge;
    if (!global.videoEffectsWorkspaceBridge) global.videoEffectsWorkspaceBridge = new VideoEffectsWorkspaceBridge();
    global.openVideoEffectsStudio = function (tab = 'effects') { global.videoInspectorSidebar?.openPanel?.('effects', { force: true }); return global.ensureVideoEffectsDockManager?.()?.open?.({ tab }) };
    global.closeVideoEffectsStudio = function () { return global.videoEffectsDockManager?.close?.() };
})(window);