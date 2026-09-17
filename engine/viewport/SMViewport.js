// ============================================================================
// engine/viewport/SMViewport.js
// SM Engine — Clean viewport authority.
//
// Owns the composition of:
//   - frame scheduling
//   - active render camera routing
//   - renderer layout / DPR
//   - canvas input routing
//   - viewport overlays
//   - workspace / PIE event bridge
//
// It does NOT replace SMRenderer. Final rendered frames still delegate to
// window.smRenderer.renderFrame() so post-processing, water-aware rendering and
// the established render pipeline remain authoritative.
// ============================================================================
(function (root) {
    'use strict';

    if (root.SMViewportClass) return;

    class SMViewport {
        constructor(options = {}) {
            this.scene = options.scene || root.scene || null;
            this.renderer = options.renderer || root.renderer || root.SMEngineRenderer?.renderer || null;
            this.host = options.host || null;
            this.initialized = false;
            this.renderEnabled = options.renderEnabled !== false;
            this.renderDelegate = null;
            this._updateSubscription = null;
            this._renderSubscription = null;

            const FrameLoop = root.SMViewportFrameLoopClass;
            const CameraRouter = root.SMViewportCameraRouterClass;
            const Layout = root.SMViewportLayoutClass;
            const Input = root.SMViewportInputClass;
            const Overlay = root.SMViewportOverlayClass;
            const ModeBridge = root.SMViewportModeBridgeClass;

            if (!FrameLoop || !CameraRouter || !Layout || !Input || !Overlay || !ModeBridge) {
                throw new Error(
                    'SMViewport dependencies are missing. Load SMViewportFrameLoop, ' +
                    'SMViewportCameraRouter, SMViewportLayout, SMViewportInput, ' +
                    'SMViewportOverlay and SMViewportModeBridge before SMViewport.js.'
                );
            }

            // The legacy animate() function remains the RAF owner during the
            // migration. The clean loop still owns ordering, timing and
            // subscriptions, but must not execute the compatibility callback
            // registry a second time.
            this.frameLoop = new FrameLoop({
                // Match the established simulation clamp while the legacy
                // engine frame remains the compatibility renderer.
                maxDelta: options.maxDelta ?? 0.033,
                runLegacyCallbacks: false
            });
            this.cameraRouter = new CameraRouter({ viewport: this });
            this.layout = new Layout({
                viewport: this,
                renderer: this.renderer,
                host: this.host,
                qualityPreset: options.qualityPreset || 'HIGH',
                renderScale: options.renderScale
            });
            this.input = new Input({ viewport: this });
            this.overlay = new Overlay({ viewport: this, host: options.overlayHost || null });
            this.modeBridge = new ModeBridge({ viewport: this });
        }

        init(options = {}) {
            if (options.scene) this.scene = options.scene;
            if (options.renderer) this.renderer = options.renderer;
            if (options.host) this.host = options.host;

            this.scene = this.scene || root.scene || null;
            this.renderer = this.renderer || root.renderer || root.SMEngineRenderer?.renderer || null;

            if (!this.scene || !this.renderer) {
                console.warn('[SMViewport] scene or renderer is not ready.');
                return false;
            }

            this.layout.setRenderer(this.renderer);
            if (this.host) this.layout.setHost(this.host);
            this.layout.start();

            this.cameraRouter.refreshEditorCamera({
                reason: 'viewport-init'
            });
            this.cameraRouter.setActiveRole('editor', {
                reason: 'viewport-init'
            });
            this.cameraRouter.syncEditorControls?.();

            this.input.attach(this.renderer.domElement);
            this.overlay.init(options.overlayHost || null);
            this.modeBridge.start();

            if (!this._updateSubscription) {
                this._updateSubscription = this.frameLoop.subscribe(
                    context => {
                        if (typeof root.smRenderFrame !== 'function') return;
                        // Compatibility-first migration: the existing engine
                        // frame owns both simulation and the established
                        // multi-panel render path. The clean viewport owns
                        // when that frame runs, so there is still one RAF and
                        // one complete engine frame without splitting hidden
                        // PIE/player/transform-control side effects.
                        root.smRenderFrame(context, {
                            fromViewportLoop: true
                        });
                    },
                    {
                        id: 'sm-viewport-engine-update',
                        priority: 100000,
                        phase: 'update'
                    }
                );
            }

            this.initialized = true;
            root.smViewport = this;
            root.SMViewport = this;

            root.dispatchEvent?.(new CustomEvent('sm:viewport-ready', {
                detail: { viewport: this }
            }));

            if (options.autoStart === true) {
                this.start();
            }

            return true;
        }

        start() {
            if (!this.initialized && !this.init()) return false;
            return this.frameLoop.start();
        }

        stop() {
            return this.frameLoop.stop();
        }

        setRenderEnabled(enabled) {
            this.renderEnabled = Boolean(enabled);
            return this.renderEnabled;
        }

        setRenderDelegate(callback = null) {
            this.renderDelegate = typeof callback === 'function' ? callback : null;
            return this.renderDelegate;
        }

        setQualityPreset(preset, options = {}) {
            return this.layout.setQualityPreset(preset, options);
        }

        getActiveCamera() {
            return this.cameraRouter.getActiveCamera();
        }

        _getWorkspaceMode() {
            return String(
                root.workspaceManager?.currentMode ||
                root.currentWorkspaceMode ||
                localStorage.getItem('sm_workspace_mode') ||
                'FILM'
            ).toUpperCase();
        }

        _getShadingMode() {
            return String(
                root.SMViewportShading?.getMode?.() ||
                root.SMViewportSystem?.getActivePanel?.()?.shadingMode ||
                'solid'
            ).toLowerCase();
        }

        _renderSelectionComposer(camera) {
            if (!root.__smSelectionComposer?.render) return false;

            try {
                root.syncViewportComposerCamera?.(camera);

                if (root.selectionRenderPass) {
                    root.selectionRenderPass.camera = camera;
                }

                if (root.outlinePass) {
                    root.outlinePass.renderCamera = camera;
                }

                root.__smSelectionComposer.render();
                return true;
            } catch (error) {
                console.warn('[SMViewport] Selection composer failed; falling back to SMRenderer.', error);
                return false;
            }
        }

        _renderWaterFallback(camera) {
            const water = root.waterSystem;
            if (!water?.render || !water?.isCameraUnderwater?.(camera)) return false;

            try {
                return water.render(this.scene, camera) !== false;
            } catch (error) {
                console.warn('[SMViewport] Water-aware fallback render failed.', error);
                return false;
            }
        }

        _renderWithAuthority(camera, context = {}) {
            const shadingMode = this._getShadingMode();
            const gameplay = this.cameraRouter.activeRole === 'gameplay';
            const renderedMode = gameplay || shadingMode === 'rendered';

            // Offline/video renderer owns its frames when active.
            if (root.SMEngineRenderer?._isRenderingVideo || root.isOfflineRendering) {
                return true;
            }

            // Non-rendered editor modes keep the existing selection composer until
            // outlines are migrated into the central post stack.
            if (!gameplay && !renderedMode && this._renderSelectionComposer(camera)) {
                return true;
            }

            const viewport = this.layout.getViewportRect();
            const renderMode = renderedMode ? 'rendered' : 'raw';

            if (typeof this.renderDelegate === 'function') {
                return this.renderDelegate({
                    scene: this.scene,
                    camera,
                    viewport,
                    renderMode,
                    workspaceMode: this._getWorkspaceMode(),
                    ...context
                }) !== false;
            }

            // Keep the established render authority (including viewport-aware
            // selection, water and post-processing fallbacks) in one place.
            // This is the bridge that lets the new viewport own lifecycle
            // without creating a second renderer implementation.
            if (typeof root.smRenderViewportWithAuthority === 'function') {
                try {
                    return root.smRenderViewportWithAuthority(
                        this.scene,
                        camera,
                        {
                            viewport,
                            scissor: null,
                            gameView: gameplay,
                            allowPostProcess: renderedMode,
                            allowSelectionComposer: true,
                            delta: context.delta ?? 0,
                            time: context.time ?? performance.now() * 0.001,
                            workspaceMode: this._getWorkspaceMode()
                        }
                    ) !== false;
                } catch (error) {
                    console.warn('[SMViewport] Central render bridge failed; using direct fallback.', error);
                }
            }

            // Compatibility path while SMRenderer migration is incomplete.
            if (renderedMode && root.smRender?.render) {
                try {
                    return root.smRender.render(camera, context.delta ?? 0) !== false;
                } catch (_) {}
            }

            if (this._renderWaterFallback(camera)) {
                return true;
            }

            this.renderer.setRenderTarget?.(null);
            this.renderer.setScissorTest?.(false);
            this.renderer.autoClear = true;
            this.renderer.render(this.scene, camera);
            return true;
        }

        renderFrame(context = {}) {
            if (!this.renderEnabled || !this.initialized) return false;

            const camera = this.cameraRouter.getActiveCamera();
            if (!camera || !this.scene || !this.renderer) return false;

            // Cheap no-op if dimensions did not change; guarantees a CSS layout
            // transition can never leave the camera aspect stale.
            this.layout.sync(false, 'frame-guard');
            this.layout.syncCamera(camera);

            if (typeof root.updateAdaptiveClipPlanes === 'function') {
                try {
                    root.updateAdaptiveClipPlanes(camera, context.time ?? 0);
                } catch (_) {}
            }

            return this._renderWithAuthority(camera, context);
        }

        renderOnce(options = {}) {
            const context = {
                frame: this.frameLoop.frame,
                time: options.time ?? performance.now() * 0.001,
                delta: options.delta ?? 0,
                rawDelta: options.delta ?? 0,
                viewport: this
            };
            return this.renderFrame(context);
        }

        stepFromLegacyFrame(nowMs = performance.now()) {
            // Migration helper: animate() drives this loop externally, so the
            // engine has exactly one requestAnimationFrame owner.
            return this.frameLoop.stepExternally(nowMs);
        }

        getDebugState() {
            return {
                initialized: this.initialized,
                renderEnabled: this.renderEnabled,
                scene: this.scene?.name || this.scene?.type || null,
                renderer: this.renderer?.constructor?.name || null,
                camera: this.cameraRouter.getDebugState(),
                layout: this.layout.getDebugState(),
                input: this.input.getDebugState(),
                overlay: this.overlay.getDebugState(),
                mode: this.modeBridge.getDebugState(),
                frameLoop: this.frameLoop.getDebugState()
            };
        }

        dispose() {
            this.stop();
            this._updateSubscription?.();
            this._updateSubscription = null;
            this._renderSubscription?.();
            this._renderSubscription = null;
            this.modeBridge.dispose();
            this.input.dispose();
            this.overlay.dispose();
            this.layout.dispose();
            this.cameraRouter.cameras.clear();
            this.frameLoop.dispose();
            this.initialized = false;

            if (root.smViewport === this) root.smViewport = null;
            if (root.SMViewport === this) root.SMViewport = null;
        }
    }

    root.SMViewportClass = SMViewport;

    root.initSMViewport = function initSMViewport(options = {}) {
        const viewport = root.smViewport instanceof SMViewport
            ? root.smViewport
            : new SMViewport(options);

        try {
            viewport.init(options);
            return viewport;
        } catch (error) {
            // Leave no half-mounted observers/input handlers behind. index.js
            // can then continue through the proven legacy renderer fallback.
            try { viewport.dispose(); } catch (_) {}
            throw error;
        }
    };
})(window);
