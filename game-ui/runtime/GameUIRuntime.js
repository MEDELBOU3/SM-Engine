/**
 * GAME-UI/runtime/GameUIRuntime.js
 * ------------------------------------------------------------
 * Main runtime controller for Game UI.
 *
 * Bridges:
 * - GameUIScreenRenderer
 * - UILayoutEngine
 * - UIDataBindingSystem
 * - UIEventSystem
 * - UIFocusManager
 * - UINavigationSystem
 * - UIAnimationSystem
 * - GameUIVisibilitySystem
 */
(function () {
    'use strict';

    class GameUIRuntime {
        constructor(options = {}) {
            this.document = options.document || null;

            this.renderer =
                options.renderer ||
                window.gameUIScreenRenderer ||
                null;

            this.layoutEngine =
                options.layoutEngine ||
                window.uiLayoutEngine ||
                null;

            this.dataBindingSystem =
                options.dataBindingSystem ||
                window.uiDataBindingSystem ||
                null;

            this.eventSystem =
                options.eventSystem ||
                window.uiEventSystem ||
                null;

            this.focusManager =
                options.focusManager ||
                window.uiFocusManager ||
                null;

            this.navigationSystem =
                options.navigationSystem ||
                window.uiNavigationSystem ||
                null;

            this.animationSystem =
                options.animationSystem ||
                window.uiAnimationSystem ||
                null;

            this.visibilitySystem =
                options.visibilitySystem ||
                window.gameUIVisibilitySystem ||
                null;

            this.bindingContext =
                options.bindingContext ||
                window.uiBindingContext ||
                null;

            this.container = options.container || null;

            this.running = false;
            this.enabled = options.enabled ?? true;
            this.visible = options.visible ?? true;

            this._raf = 0;
            this.externalLoop = false;
            this._lastDocumentRevision = null;
            this._lastWidth = 0;
            this._lastHeight = 0;
            this._resizeObserver = null;

            this._loop = this._loop.bind(this);
        }

        init(options = {}) {
            this.container =
                options.container ||
                this.container ||
                document.getElementById('editor-scene') ||
                document.body;

            if (!this.renderer && typeof window.GameUIScreenRenderer === 'function') {
                this.renderer =
                    new window.GameUIScreenRenderer({
                        container: this.container
                    });
            }

            this.renderer?.init?.(this.container);

            this._setupSystems();
            this._setupResizeObserver();

            return this;
        }

        setDocument(document) {
            if (this.document === document) return this;

            if (this.running) {
                this.unmount();
            }

            this.document = document || null;

            this.renderer?.setDocument?.(document);
            this.dataBindingSystem?.setDocument?.(document);
            this.focusManager?.setDocument?.(document);
            this.navigationSystem?.setDocument?.(document);
            this.animationSystem?.setDocument?.(document);
            this.visibilitySystem?.setDocument?.(document);

            return this;
        }

        setEnabled(state) {
            this.enabled = Boolean(state);

            this.renderer?.setEnabled?.(this.enabled);
            this.eventSystem?.setEnabled?.(this.enabled);
            this.navigationSystem?.setEnabled?.(this.enabled);
            this.dataBindingSystem?.setEnabled?.(this.enabled);

            return this;
        }

        setVisible(state) {
            this.visible = Boolean(state);
            this.renderer?.setVisible?.(this.visible);

            return this;
        }

        start(options = {}) {
            if (this.running) return true;

            if (!this.document) {
                this.document =
                    options.document ||
                    window.gameUIManager?.activeDocument ||
                    null;
            }

            if (!this.document) {
                console.warn('[GameUIRuntime] No Game UI document is active.');
                return false;
            }

            this.init(options);
            this.setDocument(this.document);

            this.externalLoop = options.externalLoop === true;
            this.mount();

            this.running = true;
            this.setEnabled(this.enabled);

            if (options.autoFocus !== false) {
                this.focusManager?.focusFirst?.({
                    source: 'runtime-start'
                });
            }

            if (!this.externalLoop) {
                this._raf = requestAnimationFrame(this._loop);
            }

            window.dispatchEvent(
                new CustomEvent('gameui:runtime-started', {
                    detail: {
                        runtime: this,
                        document: this.document
                    }
                })
            );

            return true;
        }

        stop() {
            if (!this.running) return true;

            this.running = false;

            if (this._raf) {
                cancelAnimationFrame(this._raf);
                this._raf = 0;
            }

            this.animationSystem?.stopAll?.();
            this.navigationSystem?.setEnabled?.(false);
            this.navigationSystem?.destroy?.();
            this.eventSystem?.setEnabled?.(false);
            this.eventSystem?.setRootElement?.(null);
            this.focusManager?.blur?.({
                reason: 'runtime-stop'
            });

            this.unmount();

            window.dispatchEvent(
                new CustomEvent('gameui:runtime-stopped', {
                    detail: {
                        runtime: this,
                        document: this.document
                    }
                })
            );

            return true;
        }

        mount() {
            if (!this.document) return false;

            this.renderer?.mountDocument?.(this.document);

            const rootElement =
                this.renderer?.rootElement ||
                null;

            if (rootElement) {
                this.eventSystem?.setRootElement?.(rootElement);
                this.eventSystem?.setDocument?.(this.document);
                this.eventSystem?.setEnabled?.(this.enabled);
                this.eventSystem?.init?.(rootElement);
            }

            this.navigationSystem?.setDocument?.(this.document);
            this.navigationSystem?.setEnabled?.(this.enabled);
            this.navigationSystem?.init?.();

            this.refreshLayout(true);
            this.dataBindingSystem?.update?.();

            return true;
        }

        unmount() {
            this.renderer?.unmountWidgets?.();
            return this;
        }

        update(time = performance?.now?.() ?? Date.now()) {
            if (!this.running || !this.enabled) return;

            this.refreshLayout(false);

            this.dataBindingSystem?.update?.(time);

            this.renderer?.refreshDocument?.(
                this.document
            );
        }

        refreshLayout(force = false) {
            if (
                !this.document ||
                !this.layoutEngine ||
                !this.renderer
            ) {
                return null;
            }

            const viewport =
                this.renderer.getViewportSize?.();

            if (!viewport) return null;

            const width =
                Math.max(1, viewport.width);

            const height =
                Math.max(1, viewport.height);

            let dirty = false;
            this.document.traverse?.((widget) => {
                if (widget?._dirty) dirty = true;
            });

            const revision = this.document.metadata?.updatedAt || null;

            if (
                !force &&
                !dirty &&
                revision === this._lastDocumentRevision &&
                width === this._lastWidth &&
                height === this._lastHeight
            ) {
                return null;
            }

            this._lastDocumentRevision = revision;

            this._lastWidth = width;
            this._lastHeight = height;

            this.renderer.resize?.(
                width,
                height
            );

            const result = this.layoutEngine.layoutDocument(
                this.document,
                width,
                height
            );

            this.document.traverse?.((widget) => widget?.clearDirty?.());
            return result;
        }

        playTransition(name, widgetOrId, options = {}) {
            const widget =
                typeof widgetOrId === 'string'
                    ? this.document?.getWidget?.(widgetOrId)
                    : widgetOrId;

            if (!widget) return null;

            return window.uiTransitionLibrary?.play?.(
                name,
                widget,
                {
                    animationSystem:
                        this.animationSystem,
                    ...options
                }
            ) || null;
        }

        showWidget(widgetOrId, transition = null, options = {}) {
            const widget =
                typeof widgetOrId === 'string'
                    ? this.document?.getWidget?.(widgetOrId)
                    : widgetOrId;

            if (!widget) return false;

            this.visibilitySystem?.show?.(widget);

            if (transition) {
                this.playTransition(
                    transition,
                    widget,
                    options
                );
            }

            return true;
        }

        hideWidget(widgetOrId, transition = null, options = {}) {
            const widget =
                typeof widgetOrId === 'string'
                    ? this.document?.getWidget?.(widgetOrId)
                    : widgetOrId;

            if (!widget) return false;

            if (!transition) {
                this.visibilitySystem?.hide?.(widget);
                return true;
            }

            const originalComplete =
                options.onComplete;

            const animationId =
                this.playTransition(
                    transition,
                    widget,
                    {
                        ...options,
                        onComplete: (payload) => {
                            this.visibilitySystem?.hide?.(widget);
                            originalComplete?.(payload);
                        }
                    }
                );

            if (!animationId) {
                this.visibilitySystem?.hide?.(widget);
            }

            return true;
        }

        registerBindingSource(name, source) {
            this.bindingContext?.set?.(
                name,
                source
            );

            return this;
        }

        registerBindingProvider(name, provider) {
            this.bindingContext?.setProvider?.(
                name,
                provider
            );

            return this;
        }

        findWidget(id) {
            return this.document?.getWidget?.(id) || null;
        }

        destroy() {
            this.stop();

            this._resizeObserver?.disconnect?.();
            this._resizeObserver = null;

            this.eventSystem?.destroy?.();
            this.navigationSystem?.destroy?.();
            this.renderer?.destroy?.();

            return this;
        }

        _setupSystems() {
            this.renderer =
                this.renderer ||
                window.gameUIScreenRenderer;

            this.layoutEngine =
                this.layoutEngine ||
                window.uiLayoutEngine;

            this.dataBindingSystem =
                this.dataBindingSystem ||
                window.uiDataBindingSystem;

            this.eventSystem =
                this.eventSystem ||
                window.uiEventSystem;

            this.focusManager =
                this.focusManager ||
                window.uiFocusManager;

            this.navigationSystem =
                this.navigationSystem ||
                window.uiNavigationSystem;

            this.animationSystem =
                this.animationSystem ||
                window.uiAnimationSystem;

            this.visibilitySystem =
                this.visibilitySystem ||
                window.gameUIVisibilitySystem;

            this.bindingContext =
                this.bindingContext ||
                window.uiBindingContext;

            if (this.eventSystem) {
                this.eventSystem.focusManager =
                    this.focusManager;
            }

            if (this.navigationSystem) {
                this.navigationSystem.focusManager =
                    this.focusManager;

                this.navigationSystem.eventSystem =
                    this.eventSystem;
            }

            return this;
        }

        _setupResizeObserver() {
            if (
                !this.container ||
                typeof ResizeObserver !== 'function'
            ) {
                return;
            }

            this._resizeObserver?.disconnect?.();

            this._resizeObserver =
                new ResizeObserver(() => {
                    this.refreshLayout(true);
                });

            this._resizeObserver.observe(
                this.container
            );
        }

        _loop(time) {
            if (!this.running) return;

            this.update(time);

            if (!this.externalLoop) {
                this._raf = requestAnimationFrame(this._loop);
            }
        }
    }

    window.GameUIRuntime = GameUIRuntime;

    if (!window.gameUIRuntime) {
        window.gameUIRuntime =
            new GameUIRuntime();
    }
})();