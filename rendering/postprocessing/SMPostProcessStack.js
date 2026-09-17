(function (global) {
    'use strict';

    const QUALITY_PRESETS = Object.freeze({
        low: Object.freeze({
            ao: false,
            aoRadius: 6,
            bloom: false,
            bloomStrength: 0,
            bloomRadius: 0.2,
            bloomThreshold: 1.1,
            antiAliasing: true,
            samples: 0,
            grain: 0,
            vignette: 0.03
        }),
        medium: Object.freeze({
            ao: false,
            aoRadius: 8,
            bloom: true,
            bloomStrength: 0.18,
            bloomRadius: 0.25,
            bloomThreshold: 1,
            antiAliasing: true,
            samples: 0,
            grain: 0.002,
            vignette: 0.06
        }),
        high: Object.freeze({
            ao: true,
            aoRadius: 10,
            bloom: true,
            bloomStrength: 0.26,
            bloomRadius: 0.32,
            bloomThreshold: 0.96,
            antiAliasing: true,
            samples: 0,
            grain: 0.004,
            vignette: 0.08
        }),
        ultra: Object.freeze({
            ao: true,
            aoRadius: 14,
            bloom: true,
            bloomStrength: 0.3,
            bloomRadius: 0.38,
            bloomThreshold: 0.94,
            antiAliasing: true,
            samples: 4,
            grain: 0.004,
            vignette: 0.08
        })
    });

    class SMPostProcessStack {
        constructor(options = {}) {
            this.renderer =
                options.renderer ||
                global.renderer ||
                null;

            this.scene =
                options.scene ||
                global.scene ||
                null;

            this.camera =
                options.camera ||
                global.camera ||
                null;

            this.composer = null;
            this.renderPass = null;

            this.ao =
                new global.SMAmbientOcclusion({
                    scene: this.scene,
                    camera: this.camera,
                    ...(options.ao || {})
                });

            this.bloom =
                new global.SMBloom(
                    options.bloom || {}
                );

            this.aa =
                new global.SMAntiAliasing(
                    options.antiAliasing || {}
                );

            this.colorGrading =
                new global.SMColorGrading(
                    options.colorGrading || {}
                );

            this.toneMapping =
                new global.SMToneMapping(
                    this.renderer
                );

            this.enabled =
                options.enabled !== false;

            this.quality =
                options.quality ||
                'high';

            this.targetType =
                THREE.UnsignedByteType;

            this.initialized = false;

            this.width = 1;
            this.height = 1;
        }

        initialize(
            width,
            height
        ) {
            if (
                this.initialized
            ) {
                return this;
            }

            if (
                !this.renderer ||
                !this.scene ||
                !this.camera
            ) {
                throw new Error(
                    '[SMPostProcessStack] renderer, scene and camera are required.'
                );
            }

            if (
                typeof THREE.EffectComposer ===
                'undefined' ||
                typeof THREE.RenderPass ===
                'undefined'
            ) {
                throw new Error(
                    '[SMPostProcessStack] EffectComposer/RenderPass are unavailable.'
                );
            }

            const canvas =
                this.renderer.domElement;

            this.width =
                Math.max(
                    1,
                    width ||
                    canvas?.clientWidth ||
                    canvas?.width ||
                    1
                );

            this.height =
                Math.max(
                    1,
                    height ||
                    canvas?.clientHeight ||
                    canvas?.height ||
                    1
                );

            const supportsHDRTarget =
                this.renderer.capabilities?.isWebGL2 === true ||
                this.renderer.extensions?.has?.('EXT_color_buffer_half_float') === true ||
                this.renderer.extensions?.has?.('EXT_color_buffer_float') === true;

            this.targetType =
                supportsHDRTarget && THREE.HalfFloatType !== undefined
                    ? THREE.HalfFloatType
                    : THREE.UnsignedByteType;

            const target =
                new THREE.WebGLRenderTarget(
                    this.width,
                    this.height,
                    {
                        minFilter:
                            THREE.LinearFilter,

                        magFilter:
                            THREE.LinearFilter,

                        format:
                            THREE.RGBAFormat,

                        type:
                            this.targetType,

                        depthBuffer: true,
                        stencilBuffer: false
                    }
                );

            target.texture.name =
                'SM_PostProcess_HDR';

            if (
                'colorSpace' in target.texture &&
                THREE.NoColorSpace !== undefined
            ) {
                target.texture.colorSpace =
                    THREE.NoColorSpace;
            }

            this.composer =
                new THREE.EffectComposer(
                    this.renderer,
                    target
                );

            this.renderPass =
                new THREE.RenderPass(
                    this.scene,
                    this.camera
                );

            this.composer.addPass(
                this.renderPass
            );

            const aoPass =
                this.ao.create(
                    this.width,
                    this.height
                );

            if (aoPass) {
                this.composer.addPass(
                    aoPass
                );
            }

            const bloomPass =
                this.bloom.create(
                    this.width,
                    this.height
                );

            if (bloomPass) {
                this.composer.addPass(
                    bloomPass
                );
            }

            const colorPass =
                this.colorGrading.create();

            if (colorPass) {
                this.composer.addPass(
                    colorPass
                );
            }

            const aaPass =
                this.aa.create(
                    this.width,
                    this.height,
                    this.renderer
                        .getPixelRatio?.() ||
                    1
                );

            if (aaPass) {
                this.composer.addPass(
                    aaPass
                );
            }

            this.toneMapping.apply({
                mode: 'aces',
                exposure: 1.0
            });

            this.setQualityPreset(
                this.quality
            );

            this.initialized = true;

            return this;
        }

        setCamera(camera) {
            if (!camera) return this;

            this.camera = camera;

            if (this.renderPass) {
                this.renderPass.camera =
                    camera;
            }

            this.ao.setCamera(
                camera
            );

            return this;
        }

        setSize(
            width,
            height
        ) {
            this.width =
                Math.max(
                    1,
                    width | 0
                );

            this.height =
                Math.max(
                    1,
                    height | 0
                );

            this.composer?.setSize?.(
                this.width,
                this.height
            );

            this.ao.setSize(
                this.width,
                this.height
            );

            this.bloom.setSize(
                this.width,
                this.height
            );

            this.aa.setSize(
                this.width,
                this.height,
                this.renderer
                    ?.getPixelRatio?.() ||
                1
            );

            this.colorGrading.setSize(
                this.width,
                this.height
            );
        }

        setQualityPreset(name) {
            const preset =
                QUALITY_PRESETS[name] ||
                QUALITY_PRESETS.high;

            this.quality =
                QUALITY_PRESETS[name]
                    ? name
                    : 'high';

            this.ao.apply({
                enabled: preset.ao,
                kernelRadius: preset.aoRadius
            });

            this.bloom.apply({
                enabled: preset.bloom,
                strength: preset.bloomStrength,
                radius: preset.bloomRadius,
                threshold: preset.bloomThreshold
            });

            this.aa.setEnabled(
                preset.antiAliasing
            );

            this.colorGrading.apply({
                grain: preset.grain,
                vignette: preset.vignette
            });

            const maximumSamples =
                this.renderer?.capabilities?.maxSamples ||
                0;

            const samples =
                this.targetType === THREE.HalfFloatType &&
                this.renderer?.capabilities?.isWebGL2
                    ? Math.max(0, Math.min(preset.samples, maximumSamples))
                    : 0;

            for (const target of [
                this.composer?.renderTarget1,
                this.composer?.renderTarget2
            ]) {
                if (target && 'samples' in target) {
                    target.samples = samples;
                }
            }

            return this;
        }

        applySettings(settings = {}) {
            if (settings.ao) {
                this.ao.apply(
                    settings.ao
                );
            }

            if (settings.bloom) {
                this.bloom.apply(
                    settings.bloom
                );
            }

            if (
                settings.colorGrading
            ) {
                this.colorGrading.apply(
                    settings.colorGrading
                );
            }

            if (
                settings.toneMapping
            ) {
                this.toneMapping.apply(
                    settings.toneMapping
                );
            }

            if (
                settings.enabled !==
                undefined
            ) {
                this.enabled =
                    !!settings.enabled;
            }

            if (settings.quality) {
                this.setQualityPreset(
                    settings.quality
                );
            }

            return this;
        }

        render(
            delta = 0
        ) {
            if (
                !this.initialized
            ) {
                this.initialize();
            }

            if (
                !this.enabled ||
                !this.composer
            ) {
                this.renderer.render(
                    this.scene,
                    this.camera
                );

                return false;
            }

            this.colorGrading.update(
                delta
            );

            const exposureSettings = global.smExposureSystem?.activeSettings;
            if (exposureSettings) {
                this.colorGrading.apply({
                    localExposure: exposureSettings.localExposure ?? 0.1
                });
            }

            this.renderer.setRenderTarget?.(
                null
            );

            this.composer.render(
                delta
            );

            return true;
        }

        diagnostics() {
            const report = {
                initialized:
                    this.initialized,

                enabled:
                    this.enabled,

                quality:
                    this.quality,

                targetType:
                    this.targetType,

                size: {
                    width:
                        this.width,

                    height:
                        this.height
                },

                passes: {
                    ao:
                        !!this.ao.pass,

                    bloom:
                        !!this.bloom.pass,

                    colorGrading:
                        !!this.colorGrading.pass,

                    antiAliasing:
                        this.aa.diagnostics()
                }
            };

            console.log(
                '[SMPostProcessStack][Diagnostics]',
                report
            );

            return report;
        }

        dispose() {
            this.ao.dispose();
            this.bloom.dispose();
            this.aa.dispose();
            this.colorGrading.dispose();

            this.composer?.dispose?.();

            this.composer = null;
            this.renderPass = null;

            this.initialized = false;
        }
    }

    function initSMPostProcessStack(
        options = {}
    ) {
        if (
            global.smPostProcessStack instanceof
            SMPostProcessStack
        ) {
            return global.smPostProcessStack;
        }

        global.smPostProcessStack =
            new SMPostProcessStack({
                renderer:
                    options.renderer ||
                    global.renderer,

                scene:
                    options.scene ||
                    global.scene,

                camera:
                    options.camera ||
                    global.camera,

                ao:
                    options.ao,

                bloom:
                    options.bloom,

                antiAliasing:
                    options.antiAliasing,

                colorGrading:
                    options.colorGrading,

                quality:
                    options.quality
            });

        return global
            .smPostProcessStack;
    }

    global.SMPostProcessStack =
        SMPostProcessStack;

    global.initSMPostProcessStack =
        initSMPostProcessStack;
})(window);
