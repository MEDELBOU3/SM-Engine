// ============================================================================
// engine/viewport/SMViewportInput.js
// SM Engine — Centralized viewport DOM input and drop routing.
// ============================================================================
(function (root) {
    'use strict';

    if (root.SMViewportInputClass) return;

    class SMViewportInput {
        constructor(options = {}) {
            this.viewport = options.viewport || null;
            this.element = null;
            this.dropHandlers = new Map();
            this.pointerHandlers = new Map();
            this._nextId = 1;
            this._bound = new Map();
        }

        attach(element) {
            const next = element || this.viewport?.renderer?.domElement || root.renderer?.domElement || null;
            if (!next) return false;
            if (this.element === next) return true;

            this.detach();
            this.element = next;

            this._adoptDOM0Handlers();

            this._bind('dragenter', event => this._handleDragEnter(event));
            this._bind('dragover', event => this._handleDragOver(event));
            this._bind('drop', event => this._handleDrop(event));
            this._bind('pointerdown', event => this._handlePointer('pointerdown', event));
            this._bind('pointermove', event => this._handlePointer('pointermove', event));
            this._bind('pointerup', event => this._handlePointer('pointerup', event));
            this._bind('pointercancel', event => this._handlePointer('pointercancel', event));
            this._bind('wheel', event => this._handlePointer('wheel', event), { passive: false });
            this._bind('contextmenu', event => this._handlePointer('contextmenu', event));

            return true;
        }

        _bind(type, handler, options) {
            this.element.addEventListener(type, handler, options);
            this._bound.set(type, { handler, options });
        }

        detach() {
            if (!this.element) return;

            for (const [type, entry] of this._bound) {
                this.element.removeEventListener(type, entry.handler, entry.options);
            }

            this._bound.clear();
            this.element = null;
        }

        _adoptDOM0Handlers() {
            const element = this.element;
            if (!element) return;

            const oldDrop = element.ondrop;
            const oldDragOver = element.ondragover;

            if (typeof oldDrop === 'function' || typeof oldDragOver === 'function') {
                this.registerDropHandler('legacy-dom0', {
                    priority: -10000,
                    canHandle: () => true,
                    onDragOver: oldDragOver
                        ? event => {
                            oldDragOver.call(element, event);
                            return true;
                        }
                        : null,
                    onDrop: oldDrop
                        ? event => {
                            oldDrop.call(element, event);
                            return true;
                        }
                        : null
                });

                element.ondrop = null;
                element.ondragover = null;
            }
        }

        registerDropHandler(id, config = {}) {
            const key = id || `sm_vp_drop_${this._nextId++}`;
            this.dropHandlers.set(key, {
                id: key,
                priority: Number.isFinite(config.priority) ? config.priority : 0,
                canHandle: typeof config.canHandle === 'function'
                    ? config.canHandle
                    : () => true,
                onDragOver: typeof config.onDragOver === 'function' ? config.onDragOver : null,
                onDrop: typeof config.onDrop === 'function' ? config.onDrop : null,
                enabled: config.enabled !== false
            });

            return () => this.unregisterDropHandler(key);
        }

        unregisterDropHandler(id) {
            return this.dropHandlers.delete(id);
        }

        registerPointerHandler(id, config = {}) {
            const key = id || `sm_vp_pointer_${this._nextId++}`;
            this.pointerHandlers.set(key, {
                id: key,
                priority: Number.isFinite(config.priority) ? config.priority : 0,
                events: new Set(config.events || ['pointerdown', 'pointermove', 'pointerup']),
                handle: typeof config.handle === 'function' ? config.handle : null,
                enabled: config.enabled !== false
            });

            return () => this.unregisterPointerHandler(key);
        }

        unregisterPointerHandler(id) {
            return this.pointerHandlers.delete(id);
        }

        _sorted(map) {
            return Array.from(map.values()).sort((a, b) => b.priority - a.priority);
        }

        _findDropHandlers(event) {
            const handlers = [];
            for (const entry of this._sorted(this.dropHandlers)) {
                if (!entry.enabled) continue;
                try {
                    if (entry.canHandle(event, this.viewport) !== false) {
                        handlers.push(entry);
                    }
                } catch (error) {
                    console.warn(`[SMViewportInput] canHandle failed for '${entry.id}'.`, error);
                }
            }
            return handlers;
        }

        _handleDragEnter(event) {
            if (this._findDropHandlers(event).length) {
                event.preventDefault();
            }
        }

        _handleDragOver(event) {
            const handlers = this._findDropHandlers(event);
            if (!handlers.length) return;

            event.preventDefault();

            for (const entry of handlers) {
                if (!entry.onDragOver) continue;
                try {
                    const handled = entry.onDragOver(event, this.viewport);
                    if (handled === true || handled?.handled === true) break;
                } catch (error) {
                    console.warn(`[SMViewportInput] dragover failed for '${entry.id}'.`, error);
                }
            }
        }

        async _handleDrop(event) {
            const handlers = this._findDropHandlers(event);
            if (!handlers.length) return;

            event.preventDefault();
            event.stopPropagation();

            for (const entry of handlers) {
                if (!entry.onDrop) continue;
                try {
                    const result = await entry.onDrop(event, this.viewport);
                    if (result === true || result?.handled === true) {
                        root.dispatchEvent?.(new CustomEvent('sm:viewport-drop-handled', {
                            detail: { id: entry.id, event }
                        }));
                        return;
                    }
                } catch (error) {
                    console.error(`[SMViewportInput] drop failed for '${entry.id}'.`, error);
                }
            }
        }

        _handlePointer(type, event) {
            for (const entry of this._sorted(this.pointerHandlers)) {
                if (!entry.enabled || !entry.events.has(type) || !entry.handle) continue;

                try {
                    const result = entry.handle(type, event, this.viewport);
                    if (result === true || result?.handled === true) {
                        if (result?.preventDefault !== false) event.preventDefault?.();
                        if (result?.stopPropagation === true) event.stopPropagation?.();
                        break;
                    }
                } catch (error) {
                    console.warn(`[SMViewportInput] pointer handler '${entry.id}' failed.`, error);
                }
            }
        }

        getNormalizedPointer(event) {
            const rect = this.element?.getBoundingClientRect?.();
            if (!rect || rect.width < 1 || rect.height < 1) return null;

            return {
                x: ((event.clientX - rect.left) / rect.width) * 2 - 1,
                y: -((event.clientY - rect.top) / rect.height) * 2 + 1,
                cssX: event.clientX - rect.left,
                cssY: event.clientY - rect.top,
                width: rect.width,
                height: rect.height
            };
        }

        getDebugState() {
            return {
                attached: Boolean(this.element),
                element: this.element?.id || this.element?.tagName || null,
                dropHandlers: this._sorted(this.dropHandlers).map(entry => ({
                    id: entry.id,
                    priority: entry.priority,
                    enabled: entry.enabled
                })),
                pointerHandlers: this._sorted(this.pointerHandlers).map(entry => ({
                    id: entry.id,
                    priority: entry.priority,
                    enabled: entry.enabled,
                    events: Array.from(entry.events)
                }))
            };
        }

        dispose() {
            this.detach();
            this.dropHandlers.clear();
            this.pointerHandlers.clear();
        }
    }

    root.SMViewportInputClass = SMViewportInput;
})(window);