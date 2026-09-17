(function (global) {
    'use strict';

    const PRESETS = Object.freeze({
        low: Object.freeze({
            shadowMapSize: 512,
            shadows: false,
            ao: false,
            bloom: false,
            antiAliasing: true,
            resolutionScale: 0.72,
            maxPixelRatio: 1,
            reflectionProbeResolution: 128,
            anisotropy: 2
        }),
        medium: Object.freeze({
            shadowMapSize: 1024,
            shadows: true,
            ao: false,
            bloom: true,
            antiAliasing: true,
            resolutionScale: 0.86,
            maxPixelRatio: 1.25,
            reflectionProbeResolution: 128,
            anisotropy: 4
        }),
        high: Object.freeze({
            shadowMapSize: 2048,
            shadows: true,
            ao: true,
            bloom: true,
            antiAliasing: true,
            resolutionScale: 1,
            maxPixelRatio: 1.5,
            reflectionProbeResolution: 256,
            anisotropy: 8
        }),
        ultra: Object.freeze({
            shadowMapSize: 4096,
            shadows: true,
            ao: true,
            bloom: true,
            antiAliasing: true,
            resolutionScale: 1,
            maxPixelRatio: 2,
            reflectionProbeResolution: 512,
            anisotropy: 16
        })
    });

    class SMGraphicsQuality {
        constructor(options = {}) {
            this.renderer = options.renderer || global.renderer || null;
            this.preset = options.preset || 'high';
            this.settings = { ...PRESETS.high };
        }

        applyPreset(name, options = {}) {
            const preset = PRESETS[name];
            if (!preset) {
                console.warn(`[SMGraphicsQuality] Unknown preset: ${name}`);
                return false;
            }

            this.preset = name;
            this.settings = { ...preset };

            const renderer = this.renderer || global.renderer;
            if (renderer) {
                if (renderer.shadowMap) {
                    renderer.shadowMap.enabled = preset.shadows;
                    renderer.shadowMap.autoUpdate = preset.shadows;
                    if (preset.shadows && THREE.PCFSoftShadowMap !== undefined) {
                        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
                    }
                    renderer.shadowMap.needsUpdate = true;
                }

                if (options.keepResolution !== true) {
                    renderer.setPixelRatio?.(
                        Math.min(global.devicePixelRatio || 1, preset.maxPixelRatio) *
                        preset.resolutionScale
                    );
                }
            }

            global.smShadowManager?.applyQuality?.(name);
            global.smPostProcessStack?.setQualityPreset?.(name);
            global.smPostProcessStack?.applySettings?.({
                ao: { enabled: preset.ao },
                bloom: { enabled: preset.bloom }
            });
            global.smRealisticRendering?.applyQuality?.(name);

            global.dispatchEvent?.(new CustomEvent('sm:graphics-quality-changed', {
                detail: {
                    preset: name,
                    settings: { ...this.settings }
                }
            }));

            return true;
        }

        getPreset() {
            return this.preset;
        }

        getSettings() {
            return { ...this.settings };
        }
    }

    function initSMGraphicsQuality(options = {}) {
        if (global.smGraphicsQuality instanceof SMGraphicsQuality) {
            return global.smGraphicsQuality;
        }

        global.smGraphicsQuality = new SMGraphicsQuality({
            renderer: options.renderer || global.renderer,
            preset: options.preset || 'high'
        });
        global.smGraphicsQuality.applyPreset(global.smGraphicsQuality.preset);
        return global.smGraphicsQuality;
    }

    global.SMGraphicsQualityPresets = PRESETS;
    global.SMGraphicsQuality = SMGraphicsQuality;
    global.initSMGraphicsQuality = initSMGraphicsQuality;
})(window);
