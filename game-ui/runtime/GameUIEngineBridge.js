/**
 * game-ui/runtime/GameUIEngineBridge.js
 * Connects built/runtime UI to SM Engine play mode and shared frame callbacks.
 */
(function () {
    'use strict';

    class GameUIEngineBridge {
        constructor(options = {}) {
            this.runtime = options.runtime || window.gameUIRuntime || null;
            this.assetLoader = options.assetLoader || window.gameUIAssetLoader || null;
            this.document = null;
            this._frameCallback = null;
            this._frameRegistryType = null;
        }

        registerSources(sources = {}) {
            const context = window.uiBindingContext;
            if (!context) return this;
            for (const [name, source] of Object.entries(sources)) {
                context.set?.(name, source);
            }
            return this;
        }

        registerDefaultSources(overrides = {}) {
            return this.registerSources({
                player: overrides.player ?? window.player ?? window.playerSystem ?? null,
                weapon: overrides.weapon ?? window.weaponSystem ?? null,
                game: overrides.game ?? window.gameManager ?? window.PlayOrchestrator ?? null,
                ...overrides
            });
        }

        async start(options = {}) {
            this.stop();

            const runtime = this.runtime || window.gameUIRuntime;
            if (!runtime) throw new Error('GameUIRuntime is unavailable.');

            let uiDocument = options.document || null;

            if (!uiDocument && options.assetUrl) {
                uiDocument = await (this.assetLoader || window.gameUIAssetLoader).load(
                    options.assetUrl,
                    { register: options.register !== false }
                );
            }

            uiDocument =
                uiDocument ||
                window.gameUIManager?.activeDocument ||
                null;

            if (!uiDocument) {
                throw new Error('No Game UI document or compiled asset was provided.');
            }

            this.document = uiDocument;
            this.registerDefaultSources(options.sources || {});

            const useSharedLoop =
                options.useEngineLoop !== false &&
                this._hasEngineFrameRegistry();

            runtime.setDocument?.(uiDocument);
            const started = runtime.start?.({
                document: uiDocument,
                container:
                    options.container ||
                    document.getElementById('editor-scene') ||
                    document.body,
                externalLoop: useSharedLoop,
                autoFocus: options.autoFocus
            });

            if (!started) throw new Error('GameUIRuntime failed to start.');

            if (useSharedLoop) this._installFrameUpdate();
            return uiDocument;
        }

        stop() {
            this._removeFrameUpdate();
            this.runtime?.stop?.();
            return this;
        }

        update() {
            this.runtime?.update?.(performance.now());
        }

        show(widgetOrId, transition = null, options = {}) {
            return this.runtime?.showWidget?.(widgetOrId, transition, options) ?? false;
        }

        hide(widgetOrId, transition = null, options = {}) {
            return this.runtime?.hideWidget?.(widgetOrId, transition, options) ?? false;
        }

        _hasEngineFrameRegistry() {
            const registry = window.engineFrameCallbacks;
            return Boolean(
                Array.isArray(registry) ||
                (registry?.add && typeof registry.add === 'function')
            );
        }

        _installFrameUpdate() {
            if (this._frameCallback) return true;
            const registry = window.engineFrameCallbacks;
            const callback = () => this.update();

            if (registry?.add && typeof registry.add === 'function') {
                registry.add(callback);
                this._frameRegistryType = 'set';
            } else if (Array.isArray(registry)) {
                if (!registry.includes(callback)) registry.push(callback);
                this._frameRegistryType = 'array';
            } else {
                return false;
            }

            this._frameCallback = callback;
            return true;
        }

        _removeFrameUpdate() {
            if (!this._frameCallback) return;
            const registry = window.engineFrameCallbacks;
            if (this._frameRegistryType === 'set') {
                registry?.delete?.(this._frameCallback);
            } else if (this._frameRegistryType === 'array' && Array.isArray(registry)) {
                const index = registry.indexOf(this._frameCallback);
                if (index >= 0) registry.splice(index, 1);
            }
            this._frameCallback = null;
            this._frameRegistryType = null;
        }
    }

    window.GameUIEngineBridge = GameUIEngineBridge;
    window.gameUIEngineBridge = window.gameUIEngineBridge || new GameUIEngineBridge();
})();