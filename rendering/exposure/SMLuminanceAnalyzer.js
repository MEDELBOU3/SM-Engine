(function (global) {
    'use strict';

    const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

    class SMLuminanceAnalyzer {
        constructor(renderer, options = {}) {
            this.renderer = renderer || global.renderer || null;
            this.width = Math.max(8, options.width || 32);
            this.height = Math.max(8, options.height || 18);
            this.interval = Math.max(0.05, options.interval || 0.1);
            this.centerWeight = clamp(options.centerWeight ?? 0.78, 0, 1);
            this.elapsed = this.interval;
            this.target = null;
            this.pixels = null;
            this.last = {
                luminance: 0.18,
                centerLuminance: 0.18,
                lowPercentile: 0.02,
                highPercentile: 0.8,
                samples: 0,
                measuredAt: 0
            };
            this.stats = { captures: 0, failures: 0, lastCaptureMs: 0 };
        }

        _ensureTarget() {
            if (this.target || !global.THREE) return;
            this.target = new THREE.WebGLRenderTarget(this.width, this.height, {
                minFilter: THREE.LinearFilter,
                magFilter: THREE.LinearFilter,
                format: THREE.RGBAFormat,
                type: THREE.UnsignedByteType,
                depthBuffer: true,
                stencilBuffer: false
            });
            this.target.texture.name = 'SM_Exposure_Meter';
            if ('colorSpace' in this.target.texture && THREE.SRGBColorSpace !== undefined) {
                this.target.texture.colorSpace = THREE.SRGBColorSpace;
            }
            this.pixels = new Uint8Array(this.width * this.height * 4);
        }

        setOptions(options = {}) {
            if (Number.isFinite(options.interval)) {
                this.interval = clamp(options.interval, 0.05, 1);
            }
            if (Number.isFinite(options.centerWeight)) {
                this.centerWeight = clamp(options.centerWeight, 0, 1);
            }
            return this;
        }

        tick(delta) {
            this.elapsed += Math.max(0, Number(delta) || 0);
        }

        shouldCapture() {
            return this.elapsed >= this.interval;
        }

        capture(scene, camera) {
            const renderer = this.renderer;
            if (!renderer || !scene || !camera || !this.shouldCapture()) return this.last;
            this._ensureTarget();
            if (!this.target || !this.pixels) return this.last;

            this.elapsed = 0;
            const started = performance.now();
            const oldTarget = renderer.getRenderTarget?.() || null;
            const oldViewport = renderer.getViewport?.(new THREE.Vector4());
            const oldScissor = renderer.getScissor?.(new THREE.Vector4());
            const oldScissorTest = renderer.getScissorTest?.() || false;
            const oldToneMapping = renderer.toneMapping;
            const oldExposure = renderer.toneMappingExposure;
            const oldAutoClear = renderer.autoClear;
            const oldXr = renderer.xr?.enabled;
            const oldShadowAutoUpdate = renderer.shadowMap?.autoUpdate;

            try {
                // A display-referred, exposure-neutral miniature of the active
                // view is stable on WebGL1/2 and avoids a full-size GPU readback.
                if (renderer.xr) renderer.xr.enabled = false;
                if (renderer.shadowMap) renderer.shadowMap.autoUpdate = false;
                renderer.toneMapping = THREE.ACESFilmicToneMapping ?? oldToneMapping;
                renderer.toneMappingExposure = 1;
                renderer.autoClear = true;
                renderer.setRenderTarget(this.target);
                renderer.setViewport(0, 0, this.width, this.height);
                renderer.setScissorTest(false);
                renderer.clear(true, true, true);
                renderer.render(scene, camera);
                renderer.readRenderTargetPixels(
                    this.target,
                    0,
                    0,
                    this.width,
                    this.height,
                    this.pixels
                );
                this.last = this._analyzePixels(this.pixels);
                this.stats.captures++;
            } catch (error) {
                this.stats.failures++;
                if (this.stats.failures <= 2) {
                    console.warn('[SMExposure] Luminance capture failed:', error);
                }
            } finally {
                renderer.setRenderTarget(oldTarget);
                if (oldViewport) renderer.setViewport(oldViewport);
                if (oldScissor) renderer.setScissor(oldScissor);
                renderer.setScissorTest(oldScissorTest);
                renderer.toneMapping = oldToneMapping;
                renderer.toneMappingExposure = oldExposure;
                renderer.autoClear = oldAutoClear;
                if (renderer.xr) renderer.xr.enabled = oldXr;
                if (renderer.shadowMap) renderer.shadowMap.autoUpdate = oldShadowAutoUpdate;
            }

            this.stats.lastCaptureMs = performance.now() - started;
            return this.last;
        }

        _srgbToLinear(value) {
            return value <= 0.04045
                ? value / 12.92
                : Math.pow((value + 0.055) / 1.055, 2.4);
        }

        _analyzePixels(pixels) {
            const nativeStats = global.SculptWASM?.analyzeLuminance?.(
                pixels,
                this.width,
                this.height,
                this.centerWeight
            );
            if (nativeStats) return nativeStats;

            const samples = [];
            let weightedLog = 0;
            let centerLog = 0;
            let totalWeight = 0;
            let centerTotal = 0;
            const edgeFloor = 1 - this.centerWeight;

            for (let y = 0; y < this.height; y++) {
                const ny = ((y + 0.5) / this.height - 0.5) * 2;
                for (let x = 0; x < this.width; x++) {
                    const index = (y * this.width + x) * 4;
                    if (pixels[index + 3] < 8) continue;
                    const r = this._srgbToLinear(pixels[index] / 255);
                    const g = this._srgbToLinear(pixels[index + 1] / 255);
                    const b = this._srgbToLinear(pixels[index + 2] / 255);
                    const luminance = clamp(0.2126 * r + 0.7152 * g + 0.0722 * b, 0.0001, 1);
                    const nx = ((x + 0.5) / this.width - 0.5) * 2;
                    const radial = Math.exp(-2.6 * (nx * nx + ny * ny));
                    const weight = edgeFloor + this.centerWeight * radial;
                    const logLum = Math.log(luminance);
                    weightedLog += logLum * weight;
                    totalWeight += weight;
                    if (nx * nx + ny * ny < 0.36) {
                        centerLog += logLum;
                        centerTotal++;
                    }
                    samples.push(luminance);
                }
            }

            samples.sort((a, b) => a - b);
            const percentile = p => samples.length
                ? samples[Math.min(samples.length - 1, Math.floor((samples.length - 1) * p))]
                : 0.18;

            return {
                luminance: totalWeight > 0 ? Math.exp(weightedLog / totalWeight) : 0.18,
                centerLuminance: centerTotal > 0 ? Math.exp(centerLog / centerTotal) : 0.18,
                lowPercentile: percentile(0.08),
                highPercentile: percentile(0.92),
                samples: samples.length,
                measuredAt: performance.now()
            };
        }

        dispose() {
            this.target?.dispose?.();
            this.target = null;
            this.pixels = null;
        }
    }

    global.SMLuminanceAnalyzer = SMLuminanceAnalyzer;
})(window);
