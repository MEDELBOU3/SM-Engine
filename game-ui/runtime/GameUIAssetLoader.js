/**
 * game-ui/runtime/GameUIAssetLoader.js
 * Stable runtime asset loader.
 */
(function () {
    'use strict';

    class GameUIAssetLoader {
        constructor(options = {}) {
            this.manager = options.manager || window.gameUIManager || null;
            this.serializer = options.serializer || window.gameUISerializer || null;
            this.runtime = options.runtime || window.gameUIRuntime || null;
            this.widgetLibrary = options.widgetLibrary || window.uiWidgetLibrary || null;
            this.loadedAssets = new Map();
        }

        async load(url, options = {}) {
            if (!url) throw new TypeError('GameUIAssetLoader.load(): url is required.');
            const response = await fetch(url, { cache: options.cache || 'no-cache' });
            if (!response.ok) {
                throw new Error(`Failed to load Game UI asset: ${url} (${response.status})`);
            }
            const payload = await response.json();
            const uiDocument = this.fromObject(payload, options);
            this.loadedAssets.set(url, { url, payload, document: uiDocument });
            return uiDocument;
        }

        fromObject(payload, options = {}) {
            if (!payload || typeof payload !== 'object') {
                throw new TypeError('GameUIAssetLoader.fromObject(): invalid payload.');
            }

            const source =
                payload.format === 'SM-GAME-UI-RUNTIME'
                    ? payload.document
                    : payload;

            if (!source) throw new Error('Game UI asset does not contain a document.');
            if (!this.serializer?.deserialize) {
                throw new Error('GameUISerializer is required to hydrate runtime UI.');
            }

            const uiDocument = this.serializer.deserialize(source, {
                widgetLibrary: options.widgetLibrary || this.widgetLibrary || window.uiWidgetLibrary
            });

            if (options.register !== false) {
                this.manager?.registerDocument?.(uiDocument);
                this.manager?.setActiveDocument?.(uiDocument);
            }

            return uiDocument;
        }

        bindSources(sources = {}) {
            const context = window.uiBindingContext;
            if (!context) return this;
            for (const [name, source] of Object.entries(sources)) {
                context.set?.(name, source);
            }
            return this;
        }

        async loadAndStart(url, options = {}) {
            const uiDocument = await this.load(url, options);
            this.bindSources(options.sources || {});
            const runtime = options.runtime || this.runtime || window.gameUIRuntime;
            if (!runtime) throw new Error('GameUIRuntime is unavailable.');

            runtime.setDocument?.(uiDocument);
            const started = runtime.start?.({
                document: uiDocument,
                container:
                    options.container ||
                    document.getElementById('editor-scene') ||
                    document.body,
                externalLoop: options.externalLoop === true,
                autoFocus: options.autoFocus
            });

            if (!started) throw new Error('GameUIRuntime failed to start.');
            return uiDocument;
        }

        unload(url) {
            return this.loadedAssets.delete(url);
        }
    }

    window.GameUIAssetLoader = GameUIAssetLoader;
    window.gameUIAssetLoader = window.gameUIAssetLoader || new GameUIAssetLoader();
})();