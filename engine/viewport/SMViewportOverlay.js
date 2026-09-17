// ============================================================================
// engine/viewport/SMViewportOverlay.js
// SM Engine — Managed overlay layers above the single renderer canvas.
// ============================================================================
(function (root) {
    'use strict';

    if (root.SMViewportOverlayClass) return;

    const DEFAULT_LAYERS = [
        ['helpers', 100],
        ['hud', 300],
        ['loading', 500],
        ['preview', 700],
        ['modal', 900]
    ];

    class SMViewportOverlay {
        constructor(options = {}) {
            this.viewport = options.viewport || null;
            this.host = options.host || null;
            this.root = null;
            this.layers = new Map();
            this.mounts = new Map();
            this._hostPreviousInlinePosition = null;
        }

        resolveHost() {
            return (
                this.host ||
                document.getElementById('editor-scene') ||
                document.querySelector('.editor-scene') ||
                document.getElementById('renderer-container') ||
                this.viewport?.renderer?.domElement?.parentElement ||
                null
            );
        }

        init(host = null) {
            if (host) this.host = host;
            const resolved = this.resolveHost();
            if (!resolved) return false;
            this.host = resolved;

            if (this.root?.isConnected && this.root.parentElement === resolved) {
                return true;
            }

            this.disposeRootOnly();

            const computed = getComputedStyle(resolved);
            this._hostPreviousInlinePosition = resolved.style.position || '';
            if (computed.position === 'static') {
                resolved.style.position = 'relative';
            }

            const overlayRoot = document.createElement('div');
            overlayRoot.id = 'sm-viewport-overlay-root';
            Object.assign(overlayRoot.style, {
                position: 'absolute',
                inset: '0',
                overflow: 'hidden',
                pointerEvents: 'none',
                zIndex: '800'
            });

            resolved.appendChild(overlayRoot);
            this.root = overlayRoot;

            for (const [name, zIndex] of DEFAULT_LAYERS) {
                this.ensureLayer(name, zIndex);
            }

            return true;
        }

        ensureLayer(name, zIndex = 100) {
            if (!this.root) this.init();
            if (!this.root) return null;

            const key = String(name || 'helpers');
            if (this.layers.has(key)) return this.layers.get(key);

            const layer = document.createElement('div');
            layer.className = 'sm-viewport-overlay-layer';
            layer.dataset.smViewportLayer = key;
            Object.assign(layer.style, {
                position: 'absolute',
                inset: '0',
                overflow: 'hidden',
                pointerEvents: 'none',
                zIndex: String(zIndex)
            });

            this.root.appendChild(layer);
            this.layers.set(key, layer);
            return layer;
        }

        mount(id, node, options = {}) {
            if (!id) throw new Error('SMViewportOverlay.mount() requires an id.');
            if (!node?.nodeType) throw new TypeError('SMViewportOverlay.mount() requires a DOM node.');

            this.unmount(id);

            const layerName = options.layer || 'hud';
            const layer = this.ensureLayer(layerName, options.zIndex || 300);
            if (!layer) return null;

            if (options.pointerEvents !== false) {
                node.style.pointerEvents = options.pointerEvents || 'auto';
            }

            if (Number.isFinite(options.zIndex)) {
                node.style.zIndex = String(options.zIndex);
            }

            layer.appendChild(node);
            this.mounts.set(id, {
                id,
                node,
                layer: layerName
            });

            root.dispatchEvent?.(new CustomEvent('sm:viewport-overlay-mounted', {
                detail: { id, layer: layerName, node }
            }));

            return node;
        }

        unmount(id, options = {}) {
            const record = this.mounts.get(id);
            if (!record) return false;

            if (record.node?.parentElement) {
                record.node.parentElement.removeChild(record.node);
            }

            if (options.destroy && typeof record.node?.remove === 'function') {
                record.node.remove();
            }

            this.mounts.delete(id);
            root.dispatchEvent?.(new CustomEvent('sm:viewport-overlay-unmounted', {
                detail: { id, layer: record.layer }
            }));
            return true;
        }

        get(id) {
            return this.mounts.get(id)?.node || null;
        }

        show(id, visible = true) {
            const node = this.get(id);
            if (!node) return false;
            node.style.display = visible ? '' : 'none';
            return true;
        }

        clearLayer(name) {
            const layer = this.layers.get(name);
            if (!layer) return false;

            for (const [id, record] of Array.from(this.mounts)) {
                if (record.layer === name) this.unmount(id);
            }
            return true;
        }

        disposeRootOnly() {
            this.mounts.clear();
            this.layers.clear();
            this.root?.remove?.();
            this.root = null;
        }

        getDebugState() {
            return {
                initialized: Boolean(this.root?.isConnected),
                host: this.host?.id || this.host?.className || null,
                layers: Array.from(this.layers.keys()),
                mounts: Array.from(this.mounts.values()).map(record => ({
                    id: record.id,
                    layer: record.layer,
                    node: record.node?.id || record.node?.className || record.node?.tagName || null
                }))
            };
        }

        dispose() {
            const host = this.host;
            this.disposeRootOnly();

            if (host && this._hostPreviousInlinePosition !== null) {
                host.style.position = this._hostPreviousInlinePosition;
            }

            this.host = null;
            this._hostPreviousInlinePosition = null;
        }
    }

    root.SMViewportOverlayClass = SMViewportOverlay;
})(window);
