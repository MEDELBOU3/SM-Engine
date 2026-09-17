// ============================================================================
// engine/viewport/SMViewportLayout.js
// SM Engine — Single owner of renderer size, DPR and active-camera aspect.
// ============================================================================
(function (root) {
    'use strict';

    if (root.SMViewportLayoutClass) return;

    const PRESETS = {
        LOW: { dprCap: 1.0, renderScale: 0.85 },
        MEDIUM: { dprCap: 1.25, renderScale: 1.0 },
        HIGH: { dprCap: 1.75, renderScale: 1.0 },
        ULTRA: { dprCap: 2.0, renderScale: 1.0 }
    };

    class SMViewportLayout {
        constructor(options = {}) {
            this.viewport = options.viewport || null;
            this.renderer = options.renderer || null;
            this.host = options.host || null;
            this.qualityPreset = String(options.qualityPreset || 'HIGH').toUpperCase();
            this.renderScale = Number.isFinite(options.renderScale)
                ? options.renderScale
                : null;
            this.pixelRatioOverride = null;

            this.width = 0;
            this.height = 0;
            this.pixelRatio = 1;
            this.started = false;
            this._resizeObserver = null;
            this._pendingMicrotask = false;
            this._windowResize = () => this.invalidate('window-resize');
        }

        setRenderer(renderer) {
            this.renderer = renderer || null;
            if (!this.host) this.host = this.resolveHost();
            this.invalidate('renderer-changed');
            return this.renderer;
        }

        setHost(host) {
            this.host = host || null;
            if (this.started) this._bindResizeObserver();
            this.invalidate('host-changed');
            return this.host;
        }

        resolveHost() {
            return (
                this.host ||
                document.getElementById('renderer-container') ||
                this.renderer?.domElement?.parentElement ||
                document.getElementById('editor-scene') ||
                document.querySelector('.editor-scene') ||
                null
            );
        }

        start() {
            if (this.started) return true;
            this.started = true;
            this.host = this.resolveHost();
            this._bindResizeObserver();
            root.addEventListener('resize', this._windowResize);
            this.sync(true, 'start');
            return true;
        }

        stop() {
            this.started = false;
            this._resizeObserver?.disconnect?.();
            this._resizeObserver = null;
            root.removeEventListener('resize', this._windowResize);
        }

        _bindResizeObserver() {
            this._resizeObserver?.disconnect?.();
            this._resizeObserver = null;

            const host = this.resolveHost();
            if (!host || typeof ResizeObserver === 'undefined') return;

            this._resizeObserver = new ResizeObserver(() => {
                this.invalidate('resize-observer');
            });
            this._resizeObserver.observe(host);
        }

        setQualityPreset(preset, options = {}) {
            const normalized = String(preset || 'HIGH').toUpperCase();
            this.qualityPreset = PRESETS[normalized] ? normalized : 'HIGH';

            if (Number.isFinite(options.renderScale)) {
                this.renderScale = Math.min(1.25, Math.max(0.5, options.renderScale));
            }

            this.invalidate('quality-preset');
            return this.getQualityConfig();
        }

        setRenderScale(value) {
            const number = Number(value);
            if (!Number.isFinite(number)) return this.renderScale;
            this.renderScale = Math.min(1.25, Math.max(0.5, number));
            this.invalidate('render-scale');
            return this.renderScale;
        }

        setPixelRatioOverride(value = null) {
            if (value == null) {
                this.pixelRatioOverride = null;
            } else {
                const number = Number(value);
                if (Number.isFinite(number)) {
                    this.pixelRatioOverride = Math.min(4, Math.max(0.25, number));
                }
            }
            this.invalidate('pixel-ratio-override');
        }

        getQualityConfig() {
            const base = PRESETS[this.qualityPreset] || PRESETS.HIGH;
            const scale = Number.isFinite(this.renderScale)
                ? this.renderScale
                : base.renderScale;

            return {
                preset: this.qualityPreset,
                dprCap: base.dprCap,
                renderScale: scale
            };
        }

        getTargetPixelRatio() {
            if (Number.isFinite(this.pixelRatioOverride)) {
                return this.pixelRatioOverride;
            }

            const quality = this.getQualityConfig();
            const device = Math.max(1, Number(root.devicePixelRatio) || 1);
            return Math.max(0.5, Math.min(quality.dprCap, device) * quality.renderScale);
        }

        measure() {
            const host = this.resolveHost();
            if (!host) return { width: 0, height: 0 };

            const rect = host.getBoundingClientRect?.();
            const width = Math.max(1, Math.round(rect?.width || host.clientWidth || 1));
            const height = Math.max(1, Math.round(rect?.height || host.clientHeight || 1));
            return { width, height };
        }

        invalidate(reason = 'unknown') {
            this._lastInvalidateReason = reason;
            if (this._pendingMicrotask) return;
            this._pendingMicrotask = true;

            queueMicrotask(() => {
                this._pendingMicrotask = false;
                this.sync(false, this._lastInvalidateReason || reason);
            });
        }

        sync(force = false, reason = 'sync') {
            const renderer = this.renderer || root.renderer || root.SMEngineRenderer?.renderer || null;
            if (!renderer) return false;
            this.renderer = renderer;

            const { width, height } = this.measure();
            if (width < 1 || height < 1) return false;

            const targetPixelRatio = this.getTargetPixelRatio();
            const sizeChanged = force || width !== this.width || height !== this.height;
            const dprChanged = force || Math.abs(targetPixelRatio - this.pixelRatio) > 0.001;

            try {
                if (dprChanged && renderer.setPixelRatio) {
                    renderer.setPixelRatio(targetPixelRatio);
                }

                if (sizeChanged || dprChanged) {
                    renderer.setSize?.(width, height, false);
                    renderer.setViewport?.(0, 0, width, height);
                    renderer.setScissorTest?.(false);

                    // These calls are deliberately centralized here. Workspaces,
                    // PIE and scripting must only call layout.invalidate().
                    root.smPostProcessStack?.setSize?.(width, height);
                    root.__smSelectionComposer?.setSize?.(width, height);

                    if (
                        root.SMEngineRenderer?.resize &&
                        root.SMEngineRenderer.renderer !== renderer
                    ) {
                        root.SMEngineRenderer.resize(width, height);
                    }
                }
            } catch (error) {
                console.warn('[SMViewportLayout] Renderer resize failed:', error);
                return false;
            }

            this.width = width;
            this.height = height;
            this.pixelRatio = targetPixelRatio;

            this.syncCamera(this.viewport?.cameraRouter?.getActiveCamera?.(), width, height);

            // A frame guard runs every frame. Do not broadcast a resize event
            // when nothing actually changed; otherwise every resize listener in
            // the editor is forced into a needless feedback cycle.
            if (!sizeChanged && !dprChanged) return false;

            root.dispatchEvent?.(new CustomEvent('sm:viewport-resized', {
                detail: {
                    width,
                    height,
                    pixelRatio: targetPixelRatio,
                    reason
                }
            }));

            return true;
        }

        syncCamera(camera, width = this.width, height = this.height) {
            if (!camera?.isCamera || width < 1 || height < 1) return false;

            if (camera.isPerspectiveCamera) {
                const aspect = width / Math.max(1, height);
                if (Math.abs((camera.aspect || 1) - aspect) > 0.0001) {
                    camera.aspect = aspect;
                    camera.updateProjectionMatrix?.();
                }
            } else if (camera.isOrthographicCamera) {
                // Keep authored zoom/frustum untouched; only refresh projection.
                camera.updateProjectionMatrix?.();
            }

            camera.updateMatrixWorld?.(true);
            return true;
        }

        getViewportRect() {
            return {
                x: 0,
                y: 0,
                width: Math.max(1, this.width || this.renderer?.domElement?.clientWidth || 1),
                height: Math.max(1, this.height || this.renderer?.domElement?.clientHeight || 1)
            };
        }

        getDebugState() {
            return {
                started: this.started,
                host: this.resolveHost()?.id || this.resolveHost()?.className || null,
                width: this.width,
                height: this.height,
                pixelRatio: this.pixelRatio,
                quality: this.getQualityConfig()
            };
        }

        dispose() {
            this.stop();
            this.renderer = null;
            this.host = null;
        }
    }

    root.SMViewportLayoutClass = SMViewportLayout;
})(window);
