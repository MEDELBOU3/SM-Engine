(function (global) {
    'use strict';

    class SMRenderer {
        constructor(options = {}) {
            this.renderer = options.renderer || global.renderer || null;
            this.scene = options.scene || global.scene || null;
            this.camera = options.camera || global.camera || null;
            this.context = new global.SMRenderContext({
                renderer: this.renderer,
                scene: this.scene,
                camera: this.camera
            });
            this.graph = new global.SMRenderGraph();
            this.targets = new global.SMRenderTargetPool(this.renderer);
            this.initialized = false;
            this.enabled = true;
            this.stats = {
                frames: 0,
                lastFrameMs: 0,
                lastCamera: null,
                lastMode: 'editor',
                lastPath: 'none',
                recoveredFrames: 0
            };
        }

        initialize() {
            if (this.initialized) return this;
            if (!this.renderer || !this.scene) {
                throw new Error('[SMRenderer] renderer and scene are required.');
            }
            this._installDefaultPasses();
            this._configureDefaults();
            this.initialized = true;
            return this;
        }

        _configureDefaults() {
            const renderer = this.renderer;

            if (global.smRealisticRendering?.configureRenderer) {
                global.smRealisticRendering.configureRenderer();
                return;
            }

            if (renderer.shadowMap) {
                renderer.shadowMap.enabled = true;
                renderer.shadowMap.autoUpdate = true;
                if (THREE.PCFSoftShadowMap !== undefined) {
                    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
                }
            }
            if ('physicallyCorrectLights' in renderer) renderer.physicallyCorrectLights = true;
            if ('useLegacyLights' in renderer) renderer.useLegacyLights = false;
            if ('outputColorSpace' in renderer && THREE.SRGBColorSpace !== undefined) {
                renderer.outputColorSpace = THREE.SRGBColorSpace;
            } else if ('outputEncoding' in renderer && THREE.sRGBEncoding !== undefined) {
                renderer.outputEncoding = THREE.sRGBEncoding;
            }
            if (THREE.ACESFilmicToneMapping !== undefined) {
                renderer.toneMapping = THREE.ACESFilmicToneMapping;
            }
        }

        _installDefaultPasses() {
            [
                global.SMDepthPrePass,
                global.SMNormalPass,
                global.SMSkyPass,
                global.SMOpaquePass,
                global.SMTransparentPass,
                global.SMScenePass,
                global.SMFinalCompositePass
            ].forEach(PassClass => {
                if (PassClass) this.graph.addPass(new PassClass());
            });

            [
                'DepthPrePass',
                'NormalPass',
                'SkyPass',
                'OpaquePass',
                'TransparentPass'
            ].forEach(name => this.graph.setPassEnabled(name, false));
            this.graph.setPassEnabled('ScenePass', true);
            this.graph.setPassEnabled('FinalCompositePass', true);
        }

        setScene(value) {
            this.scene = value;
            this.context.scene = value;
            return this;
        }

        setCamera(value) {
            this.camera = value;
            this.context.camera = value;
            return this;
        }

        setRenderer(value) {
            this.renderer = value;
            this.context.renderer = value;
            this.targets.renderer = value;
            return this;
        }

        registerPass(pass) {
            return this.graph.addPass(pass);
        }

        getPass(name) {
            return this.graph.getPass(name);
        }

        setPassEnabled(name, enabled) {
            return this.graph.setPassEnabled(name, enabled);
        }

        setSize(width, height) {
            this.graph.resize?.(
                Math.max(1, width | 0),
                Math.max(1, height | 0),
                this.context
            );
            global.smPostProcessStack?.setSize?.(width, height);
            return this;
        }

        renderFrame(options = {}) {
            if (!this.enabled) return false;
            if (!this.initialized) this.initialize();

            const camera =
                options.camera ||
                global.getSMActiveRenderCamera?.() ||
                global.SMViewportSystem?.getActivePanel?.()?.camera ||
                this.camera ||
                global.camera;
            if (!camera) return false;

            const startedAt = performance.now();
            this.context.clearTransientResources();
            this.context.renderer = this.renderer || global.renderer;
            this.context.scene = this.scene || global.scene;
            this.context.beginFrame({ ...options, camera });

            // Eye adaptation owns ACES exposure for the active viewport camera.
            // It updates before drawing; metering happens after the frame and is
            // consumed on the next frame, avoiding a second render loop.
            global.smExposureSystem?.update?.(
                this.context.delta,
                camera
            );

            try {
                this.targets.beginFrame();
                this.context.applyOutputTarget();
                this.context.applyViewport();
                this.graph.execute(this.context);
                if (this.context.outputTarget == null) {
                    global.smExposureSystem?.capture?.(
                        this.context.scene,
                        camera
                    );
                }
                this.targets.trim();
            } catch (error) {
                // Keep the editor visible if one optional pass fails on a GPU.
                console.warn('[SMRenderer] Advanced frame failed; recovered with direct rendering:', error);
                this.context.renderer?.setRenderTarget?.(this.context.outputTarget ?? null);
                this.context.applyViewport();
                this.context.renderer?.render?.(this.context.scene, camera);
                this.context.flags.renderPath = 'recovery-direct';
                this.context.flags.sceneRendered = true;
                this.stats.recoveredFrames++;
            }

            this.stats.frames++;
            this.stats.lastFrameMs = performance.now() - startedAt;
            this.stats.lastCamera = camera.name || camera.type || 'Camera';
            this.stats.lastMode = this.context.renderMode;
            this.stats.lastPath = this.context.flags.renderPath || 'unknown';
            return true;
        }

        diagnostics() {
            const report = {
                initialized: this.initialized,
                enabled: this.enabled,
                renderer: !!this.renderer,
                scene: !!this.scene,
                camera: !!this.camera,
                passes: [...this.graph.passes.values()].map(pass => ({
                    name: pass.name,
                    enabled: pass.enabled,
                    order: pass.order
                })),
                postProcess: global.smPostProcessStack?.diagnostics?.(),
                exposure: global.smExposureSystem?.diagnostics?.(false),
                realistic: global.smRealisticRendering?.diagnostics?.(),
                stats: { ...this.stats }
            };
            console.log('[SMRenderer][Diagnostics]', report);
            return report;
        }

        dispose() {
            this.graph.dispose();
            this.targets.dispose();
            this.context.clearTransientResources();
            this.initialized = false;
        }
    }

    function initSMRenderer(options = {}) {
        if (global.smRenderer instanceof SMRenderer) return global.smRenderer;
        global.smRenderer = new SMRenderer({
            renderer: options.renderer || global.renderer,
            scene: options.scene || global.scene,
            camera: options.camera || global.camera
        });
        return global.smRenderer.initialize();
    }

    global.SMRenderer = SMRenderer;
    global.initSMRenderer = initSMRenderer;
})(window);
