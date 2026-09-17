/**
 * game-ui/GameUI.js
 * Public bootstrap API for SM Engine Game UI.
 */
(function () {
    'use strict';

    const GameUI = {
        initialized: false,

        init() {
            if (this.initialized) return this;

            window.gameUIManager?.init?.({
                editor: window.gameUIEditorManager,
                runtime: window.gameUIRuntime,
                widgetLibrary: window.uiWidgetLibrary,
                serializer: window.gameUISerializer
            });

            window.GameUIMode?.init?.();

            this.initialized = true;
            window.dispatchEvent(new CustomEvent('gameui:ready', {
                detail: { api: this }
            }));
            return this;
        },

        openEditor() {
            this.init();
            return window.GameUIMode?.enter?.() ?? false;
        },

        closeEditor() {
            return window.GameUIMode?.exit?.() ?? false;
        },

        save() {
            return window.GameUIMode?.save?.() ?? false;
        },

        build(options = {}) {
            const doc = window.gameUIManager?.activeDocument;
            if (!doc) throw new Error('No active Game UI document.');
            return window.gameUIBuildPipeline?.build?.(doc, {
                target: 'game',
                pretty: true,
                stripMetadata: true,
                download: true,
                ...options
            });
        },

        startGame(options = {}) {
            this.init();
            return window.gameUIEngineBridge?.start?.(options);
        },

        stopGame() {
            return window.gameUIEngineBridge?.stop?.();
        },

        registerSource(name, source) {
            window.uiBindingContext?.set?.(name, source);
            return this;
        },

        get document() {
            return window.gameUIManager?.activeDocument || null;
        },

        get runtime() {
            return window.gameUIRuntime || null;
        }
    };

    window.GameUI = GameUI;
    window.gameUI = GameUI;

    const boot = () => GameUI.init();
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot, { once: true });
    } else {
        boot();
    }
})();