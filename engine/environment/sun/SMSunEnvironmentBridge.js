// engine/environment/sun/SMSunEnvironmentBridge.js
// Synchronizes Sun Rig with HDR-only sky/environment lighting.
(function () {
    'use strict';

    const DEFAULTS = {
        enabled: true,

        /*
         * Fixed HDRIs are baked images, so rotating the sun does not physically
         * alter the clouds/light inside the image. Keep rotation sync optional.
         */
        syncHDRIRotation: false,

        // Environment balance by sun height.
        dayEnvironment: 0.82,
        horizonEnvironment: 0.66,
        nightEnvironment: 0.34,

        dayExposure: 0.84,
        horizonExposure: 0.78,
        nightExposure: 0.62,

        dayHemisphere: 0.18,
        horizonHemisphere: 0.12,
        nightHemisphere: 0.05,

        backgroundDay: 1.0,
        backgroundNight: 0.62,

        automaticSunIntensity: false
    };

    function clamp01(value) {
        return Math.min(
            1,
            Math.max(
                0,
                Number(value) || 0
            )
        );
    }

    class SMSunEnvironmentBridge {
        constructor(options = {}) {
            this.options = {
                ...DEFAULTS,
                ...options
            };

            this.initialized = false;
            this._boundSunChanged =
                event =>
                    this.onSunChanged(
                        event
                    );

            this._boundTimeChanged =
                event =>
                    this.onTimeChanged(
                        event
                    );
        }

        get sky() {
            return (
                window.smHDRSkySystem ||
                window.skyLightingSystem ||
                null
            );
        }

        get controller() {
            return (
                window.smSunController ||
                null
            );
        }

        init() {
            if (this.initialized) {
                return true;
            }

            window.addEventListener(
                'sm:sun-changed',
                this._boundSunChanged
            );

            window.addEventListener(
                'sm:time-of-day-changed',
                this._boundTimeChanged
            );

            this.initialized = true;

            this.applyFromElevation(
                this.controller
                    ?.elevation ??
                30
            );

            return true;
        }

        computeBlend(
            elevation
        ) {
            const el =
                Number(elevation) || 0;

            const day =
                clamp01(
                    (el + 2) /
                    28
                );

            const horizon =
                clamp01(
                    1 -
                    Math.abs(el) /
                    12
                );

            const night =
                clamp01(
                    (-el + 2) /
                    16
                );

            return {
                day,
                horizon,
                night
            };
        }

        applyFromElevation(
            elevation
        ) {
            if (
                !this.options.enabled
            ) {
                return false;
            }

            const sky =
                this.sky;

            if (!sky) {
                return false;
            }

            const blend =
                this.computeBlend(
                    elevation
                );

            const daylight =
                blend.day;

            const environment =
                THREE.MathUtils.lerp(
                    this.options
                        .nightEnvironment,
                    this.options
                        .dayEnvironment,
                    daylight
                );

            const exposure =
                THREE.MathUtils.lerp(
                    this.options
                        .nightExposure,
                    this.options
                        .dayExposure,
                    daylight
                );

            const hemisphere =
                THREE.MathUtils.lerp(
                    this.options
                        .nightHemisphere,
                    this.options
                        .dayHemisphere,
                    daylight
                );

            const background =
                THREE.MathUtils.lerp(
                    this.options
                        .backgroundNight,
                    this.options
                        .backgroundDay,
                    daylight
                );

            sky.setEnvironmentIntensity?.(
                environment
            );

            sky.setExposure?.(
                exposure
            );

            sky.setBackgroundIntensity?.(
                background
            );

            if (
                sky.hemiLight
            ) {
                sky.hemiLight.intensity =
                    hemisphere;

                if (
                    sky.config
                        ?.hemisphere
                ) {
                    sky.config
                        .hemisphere
                        .intensity =
                        hemisphere;
                }
            }

            if (
                this.options
                    .automaticSunIntensity &&
                this.controller
            ) {
                const sunIntensity =
                    THREE.MathUtils.lerp(
                        0.05,
                        1.75,
                        daylight
                    );

                this.controller
                    .setIntensity(
                        sunIntensity
                    );
            }

            if (
                this.options
                    .syncHDRIRotation
            ) {
                this.syncHDRIRotation();
            }

            window.dispatchEvent(
                new CustomEvent(
                    'sm:sun-environment-updated',
                    {
                        detail: {
                            elevation,
                            daylight,
                            environment,
                            exposure,
                            hemisphere,
                            background
                        }
                    }
                )
            );

            return true;
        }

        syncHDRIRotation() {
            const scene =
                window.scene;

            const controller =
                this.controller;

            if (
                !scene ||
                !controller
            ) {
                return false;
            }

            const radians =
                -controller.azimuth *
                Math.PI /
                180;

            /*
             * Three.js r163+ exposes backgroundRotation/environmentRotation.
             * Use them only when available.
             */
            if (
                scene.backgroundRotation
                    ?.set
            ) {
                scene.backgroundRotation
                    .set(
                        0,
                        radians,
                        0
                    );
            }

            if (
                scene.environmentRotation
                    ?.set
            ) {
                scene.environmentRotation
                    .set(
                        0,
                        radians,
                        0
                    );
            }

            return true;
        }

        applyPreset(
            preset
        ) {
            const sky =
                this.sky;

            if (
                !sky ||
                !preset
            ) {
                return false;
            }

            if (
                preset
                    .environmentIntensity !==
                undefined
            ) {
                sky
                    .setEnvironmentIntensity?.(
                        preset
                            .environmentIntensity
                    );
            }

            if (
                preset.exposure !==
                undefined
            ) {
                sky.setExposure?.(
                    preset.exposure
                );
            }

            if (
                preset
                    .backgroundIntensity !==
                undefined
            ) {
                sky
                    .setBackgroundIntensity?.(
                        preset
                            .backgroundIntensity
                    );
            }

            if (
                preset.hemisphere !==
                undefined &&
                sky.hemiLight
            ) {
                sky.hemiLight.intensity =
                    preset.hemisphere;
            }

            return true;
        }

        onSunChanged(event) {
            const elevation =
                event.detail
                    ?.elevation;

            if (
                elevation ===
                undefined
            ) {
                return;
            }

            this.applyFromElevation(
                elevation
            );
        }

        onTimeChanged(event) {
            const elevation =
                event.detail
                    ?.elevation;

            if (
                elevation ===
                undefined
            ) {
                return;
            }

            this.applyFromElevation(
                elevation
            );
        }

        setHDRIRotationSync(
            enabled
        ) {
            this.options
                .syncHDRIRotation =
                !!enabled;

            if (enabled) {
                this.syncHDRIRotation();
            }

            return this.options
                .syncHDRIRotation;
        }
    }

    window.SMSunEnvironmentBridge =
        SMSunEnvironmentBridge;

    window.smSunEnvironmentBridge =
        window.smSunEnvironmentBridge ||
        new SMSunEnvironmentBridge();
})();