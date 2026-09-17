(function (global) {
    'use strict';

    class SMRenderDebugger {
        constructor(options = {}) {
            this.renderer = options.renderer || global.renderer || null;
            this.scene = options.scene || global.scene || null;
            this.smRenderer = options.smRenderer || global.smRenderer || null;

            this.enabled = false;
            this.panel = null;
            this.stats = new global.SMRenderStats({
                renderer: this.renderer
            });

            this.mode = 'stats';
            this._raf = null;
        }

        initialize() {
            if (this.panel) return this;

            const panel = document.createElement('div');

            panel.id = 'sm-render-debugger';

            panel.style.cssText = `
                position:fixed;
                top:48px;
                right:10px;
                z-index:999999;
                min-width:230px;
                padding:10px 12px;
                background:rgba(12,12,14,.92);
                color:#ddd;
                border:1px solid rgba(255,255,255,.12);
                font:11px/1.5 monospace;
                white-space:pre;
                pointer-events:none;
                display:none;
            `;

            document.body.appendChild(panel);

            this.panel = panel;

            return this;
        }

        setEnabled(enabled) {
            this.enabled = !!enabled;

            if (!this.panel) {
                this.initialize();
            }

            this.panel.style.display =
                this.enabled
                    ? 'block'
                    : 'none';

            if (this.enabled) {
                this._start();
            } else {
                this._stop();
            }

            return this.enabled;
        }

        toggle() {
            return this.setEnabled(
                !this.enabled
            );
        }

        _start() {
            if (this._raf) return;

            const loop = () => {
                if (!this.enabled) {
                    this._raf = null;
                    return;
                }

                this.refresh();
                this._raf = requestAnimationFrame(loop);
            };

            this._raf = requestAnimationFrame(loop);
        }

        _stop() {
            if (this._raf) {
                cancelAnimationFrame(this._raf);
                this._raf = null;
            }
        }

        refresh() {
            if (!this.panel) return;

            const delta =
                global.clock?.getDelta
                    ? 0
                    : 0;

            const snapshot =
                this.stats.snapshot();

            const activeCamera =
                global.SMViewportSystem?.getActivePanel?.()?.camera ||
                global.camera;

            const smRendererStats =
                this.smRenderer?.stats ||
                global.smRenderer?.stats ||
                {};

            const shadingMode =
                global.SMViewportShading?.getMode?.() ||
                'unknown';

            const lines = [
                'SM RENDER DEBUGGER',
                '------------------------',
                `FPS: ${snapshot.fps.toFixed?.(1) || 0}`,
                `Frame: ${snapshot.frameTimeMs.toFixed?.(2) || 0} ms`,
                `Draw Calls: ${snapshot.render.calls}`,
                `Triangles: ${snapshot.render.triangles}`,
                `Textures: ${snapshot.memory.textures}`,
                `Geometries: ${snapshot.memory.geometries}`,
                `Programs: ${snapshot.programs}`,
                `Camera: ${activeCamera?.name || activeCamera?.type || 'none'}`,
                `Shading: ${shadingMode}`,
                `SMRenderer: ${global.smRenderer?.initialized ? 'ready' : 'off'}`,
                `Last Render: ${smRendererStats.lastFrameMs?.toFixed?.(2) || 0} ms`,
                `Luminance: ${(global.smExposureSystem?.analyzer?.last?.luminance ?? 0).toFixed(4)}`,
                `Exposure: ${(global.smExposureSystem?.eye?.current ?? global.renderer?.toneMappingExposure ?? 1).toFixed(3)}`,
                `Target Exp: ${(global.smExposureSystem?.targetExposure ?? 1).toFixed(3)}`
            ];

            this.panel.textContent =
                lines.join('\n');
        }

        dumpSceneRendering() {
            const report = {
                renderer: {
                    exists: !!global.renderer,
                    outputColorSpace: global.renderer?.outputColorSpace,
                    toneMapping: global.renderer?.toneMapping,
                    toneMappingExposure: global.renderer?.toneMappingExposure,
                    shadowEnabled: global.renderer?.shadowMap?.enabled,
                    shadowType: global.renderer?.shadowMap?.type
                },

                systems: {
                    smRenderer: !!global.smRenderer,
                    smPostProcessStack: !!global.smPostProcessStack,
                    smLightingManager: !!global.smLightingManager,
                    smShadowManager: !!global.smShadowManager,
                    smEnvironmentRenderer: !!global.smEnvironmentRenderer,
                    smMaterialSystem: !!global.smMaterialSystem,
                    smExposureSystem: !!global.smExposureSystem
                },

                scene: {
                    background: global.scene?.background?.type || typeof global.scene?.background,
                    environment: !!global.scene?.environment,
                    fog: global.scene?.fog?.type || null
                }
            };

            console.log('[SMRenderDebugger][Scene]', report);
            return report;
        }

        dispose() {
            this._stop();
            this.panel?.remove?.();
            this.panel = null;
        }
    }

    function initSMRenderDebugger(options = {}) {
        if (global.smRenderDebugger instanceof SMRenderDebugger) {
            return global.smRenderDebugger;
        }

        global.smRenderDebugger = new SMRenderDebugger({
            renderer: options.renderer || global.renderer,
            scene: options.scene || global.scene,
            smRenderer: options.smRenderer || global.smRenderer
        });

        return global.smRenderDebugger.initialize();
    }

    global.SMRenderDebugger = SMRenderDebugger;
    global.initSMRenderDebugger = initSMRenderDebugger;
})(window);
