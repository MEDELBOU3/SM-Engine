/**
 * GAME-UI/runtime/GameUIScreenRenderer.js
 * ------------------------------------------------------------
 * DOM-based screen renderer for Game UI.
 *
 * Responsibilities:
 * - Create runtime overlay root
 * - Mount/unmount widget tree
 * - Refresh widget DOM
 * - Resize with game viewport
 * - Keep UI isolated from editor panels
 */
(function () {
    'use strict';

    class GameUIScreenRenderer {
        constructor(options = {}) {
            this.container = options.container || null;
            this.rootElement = null;
            this.document = options.document || null;

            this.enabled = options.enabled ?? true;
            this.visible = options.visible ?? true;

            this.className =
                options.className ||
                'game-ui-runtime-root';

            this._mounted = false;
        }

        init(container = this.container) {
            if (container) {
                this.container = container;
            }

            if (!this.container) {
                this.container =
                    document.getElementById('editor-scene') ||
                    document.body;
            }

            const ownerDocument = this.container?.ownerDocument || document;

            if (!this.rootElement) {
                this.rootElement = ownerDocument.createElement('div');
                this.rootElement.className = this.className;

                Object.assign(this.rootElement.style, {
                    position: 'absolute',
                    inset: '0',
                    width: '100%',
                    height: '100%',
                    overflow: 'hidden',
                    pointerEvents: 'none',
                    zIndex: '50',
                    transformOrigin: 'top left'
                });
            }

            const view = this.container?.ownerDocument?.defaultView || window;
            const computed = view.getComputedStyle(this.container);

            if (computed.position === 'static') {
                this.container.style.position = 'relative';
            }

            if (this.rootElement.parentElement !== this.container) {
                this.container.appendChild(this.rootElement);
            }

            this._mounted = true;
            this.setVisible(this.visible);
            this.setEnabled(this.enabled);

            return this;
        }

        setContainer(container) {
            if (!container || this.container === container) return this;

            this.container = container;

            if (this.rootElement) {
                const ownerDocument = container.ownerDocument || document;
                if (this.rootElement.ownerDocument !== ownerDocument) {
                    const adopted = ownerDocument.adoptNode?.(this.rootElement);
                    if (adopted) this.rootElement = adopted;
                }
                if (this.rootElement.parentElement !== container) {
                    container.appendChild(this.rootElement);
                }
            }

            return this;
        }

        setDocument(document) {
            if (this.document === document) return this;

            this.unmountWidgets();
            this.document = document || null;

            return this;
        }

        setEnabled(state) {
            this.enabled = Boolean(state);

            if (this.rootElement) {
                // Never let the full-screen HUD root steal empty-space clicks.
                // Individual interactable widgets opt into pointer events.
                this.rootElement.style.pointerEvents = 'none';
                this.rootElement.style.transform = 'none';
                this.rootElement.classList.toggle('is-disabled', !this.enabled);
            }

            this._refreshPointerPolicy();
            return this;
        }

        setVisible(state) {
            this.visible = Boolean(state);

            if (this.rootElement) {
                this.rootElement.style.display =
                    this.visible ? 'block' : 'none';
            }

            return this;
        }

        mountDocument(document = this.document) {
            if (!document) return false;

            this.setDocument(document);
            this.init();

            this.unmountWidgets();

            for (const widget of document.rootWidgets || []) {
                this.mountWidget(widget, this.rootElement);
            }

            return true;
        }

        mountWidget(widget, parentElement) {
            if (!widget || !parentElement) return null;

            let element = null;

            if (typeof widget.mount === 'function') {
                element = widget.mount(parentElement);
            } else {
                element = this._mountFallback(widget, parentElement);
            }

            if (!element) return null;

            element.dataset.widgetId = widget.id;
            element.dataset.widgetType = widget.type || 'widget';

            // Runtime DOM is separate from the editor DOM. Keep a dedicated
            // reference so stopping PIE never destroys the editor's _element.
            widget._runtimeElement = element;

            this._applyWidgetPointerPolicy(widget);
            for (const child of widget.children || []) {
                this._applyWidgetPointerTree(child);
            }

            return element;
        }

        refreshWidget(widget) {
            if (!widget) return false;

            const element = widget._runtimeElement || widget._element;
            if (
                element &&
                typeof widget.applyElementState === 'function'
            ) {
                widget.applyElementState(element);
                this._applyWidgetPointerPolicy(widget);
                return true;
            }

            return false;
        }

        refreshDocument(document = this.document) {
            if (!document || !this.rootElement) return false;

            document.traverse?.((widget) => {
                this.refreshWidget(widget);
            });

            return true;
        }

        unmountWidgets() {
            if (!this.rootElement) return;

            if (this.document?.traverse) {
                this.document.traverse((widget) => {
                    // Do not clear widget._element here. The editor canvas owns
                    // that reference and may still be visible after PIE stops.
                    widget._runtimeElement = null;
                });
            }

            this.rootElement.replaceChildren();
        }

        resize(width = null, height = null) {
            if (!this.rootElement) return null;

            const rect = this.container?.getBoundingClientRect?.();

            const finalWidth =
                Number(width) ||
                rect?.width ||
                this.container?.clientWidth ||
                window.innerWidth;

            const finalHeight =
                Number(height) ||
                rect?.height ||
                this.container?.clientHeight ||
                window.innerHeight;

            this.rootElement.style.width = `${finalWidth}px`;
            this.rootElement.style.height = `${finalHeight}px`;

            return {
                width: finalWidth,
                height: finalHeight
            };
        }

        getViewportSize() {
            if (!this.container) {
                return {
                    width: window.innerWidth,
                    height: window.innerHeight
                };
            }

            const rect = this.container.getBoundingClientRect();

            return {
                width: Math.max(1, rect.width || this.container.clientWidth || 1),
                height: Math.max(1, rect.height || this.container.clientHeight || 1)
            };
        }

        destroy() {
            this.unmountWidgets();

            this.rootElement?.remove();
            this.rootElement = null;

            this._mounted = false;
        }


        _applyWidgetPointerPolicy(widget) {
            const element = widget?._runtimeElement || widget?._element;
            if (!element) return;
            const interactive =
                this.enabled &&
                widget.enabled !== false &&
                widget.visible !== false &&
                widget.interactable === true;
            element.style.pointerEvents = interactive ? 'auto' : 'none';
        }

        _applyWidgetPointerTree(widget) {
            if (!widget) return;
            this._applyWidgetPointerPolicy(widget);
            for (const child of widget.children || []) {
                this._applyWidgetPointerTree(child);
            }
        }

        _refreshPointerPolicy() {
            if (!this.document?.traverse) return;
            this.document.traverse(widget => this._applyWidgetPointerPolicy(widget));
        }

        _mountFallback(widget, parentElement) {
            const ownerDocument = parentElement.ownerDocument || document;
            const element = ownerDocument.createElement('div');

            element.className = 'game-ui-widget';
            element.dataset.widgetId = widget.id;
            element.dataset.widgetType = widget.type || 'widget';

            Object.assign(element.style, {
                position: 'absolute',
                left: `${Number(widget.x ?? 0)}px`,
                top: `${Number(widget.y ?? 0)}px`,
                width: `${Number(widget.width ?? 100)}px`,
                height: `${Number(widget.height ?? 40)}px`,
                opacity: `${Number(widget.opacity ?? 1)}`,
                display: widget.visible === false ? 'none' : 'block'
            });

            parentElement.appendChild(element);
            widget._runtimeElement = element;

            for (const child of widget.children || []) {
                this.mountWidget(child, element);
            }

            return element;
        }
    }

    window.GameUIScreenRenderer = GameUIScreenRenderer;

    if (!window.gameUIScreenRenderer) {
        window.gameUIScreenRenderer =
            new GameUIScreenRenderer();
    }
})();