/**
 * game-ui/editor/GameUIBuildIntegration.js
 * Compatibility shim.
 * Save/Build buttons are now owned directly by GameUIToolbar.js.
 */
(function () {
    'use strict';
    window.GameUIBuildIntegration = {
        initialized: true,
        init() { return this; },
        refresh() { return true; },
        save() {
            const doc = window.gameUIManager?.activeDocument;
            if (!doc) return false;
            window.GameUIMode?.save?.();
            return window.gameUIBuildPipeline?.saveEditorDocument?.(doc) || false;
        },
        build() {
            const doc = window.gameUIManager?.activeDocument;
            if (!doc) return false;
            window.GameUIMode?.save?.();
            return window.gameUIBuildPipeline?.build?.(doc, {
                target: 'game',
                pretty: true,
                stripMetadata: true,
                download: true
            }) || false;
        }
    };
})();