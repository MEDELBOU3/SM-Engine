// engine/environment/sun/SMSunPresets.js
// SM Engine — calibrated HDRI + Sun Rig lighting presets.
(function () {
    'use strict';

    /*
     * These presets are intentionally balanced for the engine's HDRI-first
     * lighting pipeline:
     *   - the directional Sun provides shape + shadows,
     *   - HDRI/environment provides broad indirect light/reflections,
     *   - HemisphereLight is only a restrained visibility fill,
     *   - exposure stays in a narrow range to avoid a different "renderer look"
     *     every time the preset changes.
     *
     * Values are artistic/engine-calibrated rather than physical lux values.
     */
    const PRESETS = {
        dawn: {
            label: 'Dawn',
            description: 'Soft warm sunrise with cool ambient fill.',
            time: 5.95,
            temperature: 3500,
            sunIntensity: 0.72,
            exposure: 0.84,
            environmentIntensity: 0.56,
            backgroundIntensity: 0.88,
            hemisphere: 0.10
        },

        morning: {
            label: 'Morning',
            description: 'Clean warm daylight with readable shadows.',
            time: 8.25,
            temperature: 4550,
            sunIntensity: 1.32,
            exposure: 0.84,
            environmentIntensity: 0.74,
            backgroundIntensity: 0.97,
            hemisphere: 0.15
        },

        midday: {
            label: 'Midday',
            description: 'Bright neutral noon with strong directional definition.',
            time: 12.35,
            temperature: 5850,
            sunIntensity: 1.82,
            exposure: 0.82,
            environmentIntensity: 0.82,
            backgroundIntensity: 1.00,
            hemisphere: 0.18
        },

        afternoon: {
            label: 'Afternoon',
            description: 'Slightly warm late-day light with balanced fill.',
            time: 15.45,
            temperature: 5050,
            sunIntensity: 1.52,
            exposure: 0.82,
            environmentIntensity: 0.76,
            backgroundIntensity: 0.98,
            hemisphere: 0.16
        },

        goldenHour: {
            label: 'Golden Hour',
            description: 'Warm cinematic sunlight without crushing the shadows.',
            time: 17.55,
            temperature: 3150,
            sunIntensity: 1.08,
            exposure: 0.81,
            environmentIntensity: 0.66,
            backgroundIntensity: 0.94,
            hemisphere: 0.125
        },

        sunset: {
            label: 'Sunset',
            description: 'Low warm sun with controlled environment brightness.',
            time: 18.25,
            temperature: 2550,
            sunIntensity: 0.68,
            exposure: 0.79,
            environmentIntensity: 0.54,
            backgroundIntensity: 0.86,
            hemisphere: 0.095
        },

        blueHour: {
            label: 'Blue Hour',
            description: 'Cool post-sunset ambience with a faint directional source.',
            time: 19.45,
            temperature: 8200,
            sunIntensity: 0.12,
            exposure: 0.74,
            environmentIntensity: 0.38,
            backgroundIntensity: 0.70,
            hemisphere: 0.065
        },

        night: {
            label: 'Night',
            description: 'Dark night while preserving enough IBL for material readability.',
            time: 23.0,
            temperature: 9500,
            sunIntensity: 0.018,
            exposure: 0.64,
            environmentIntensity: 0.24,
            backgroundIntensity: 0.46,
            hemisphere: 0.035
        }
    };

    /*
     * Compatibility with the IDs already used by the Settings > Scene Presets
     * dropdown. These aliases affect LIGHTING only; weather remains owned by
     * the engine weather/sky system.
     */
    const ALIASES = Object.freeze({
        'clear-noon': 'midday',
        'golden-hour': 'goldenHour',
        sunrise: 'dawn',
        'overcast-rain': 'afternoon',
        thunderstorm: 'blueHour',
        'moonlit-night': 'night',
        'cinematic-dusk': 'sunset'
    });

    function resolveName(name) {
        const raw = String(name || '').trim();
        return ALIASES[raw] || raw;
    }

    function get(name) {
        const resolved = resolveName(name);
        return PRESETS[resolved] || null;
    }

    function list() {
        return Object.entries(PRESETS).map(
            ([id, preset]) => ({
                id,
                ...preset
            })
        );
    }

    function listAliases() {
        return { ...ALIASES };
    }

    function applyFallbackEnvironment(preset) {
        const sky =
            window.smHDRSkySystem ||
            window.skyLightingSystem ||
            null;

        if (sky) {
            if (preset.environmentIntensity !== undefined) {
                sky.setEnvironmentIntensity?.(
                    preset.environmentIntensity
                );
            }

            if (preset.exposure !== undefined) {
                sky.setExposure?.(
                    preset.exposure
                );
            }

            if (preset.backgroundIntensity !== undefined) {
                sky.setBackgroundIntensity?.(
                    preset.backgroundIntensity
                );
            }

            if (
                preset.hemisphere !== undefined &&
                sky.hemiLight
            ) {
                sky.hemiLight.intensity =
                    preset.hemisphere;

                if (sky.config?.hemisphere) {
                    sky.config.hemisphere.intensity =
                        preset.hemisphere;
                }
            }

            return true;
        }

        /*
         * Last-resort fallback for partial boot states.
         * Do not create new lights; only update existing renderer/scene values.
         */
        if (
            window.renderer &&
            Number.isFinite(Number(preset.exposure))
        ) {
            window.renderer.toneMappingExposure =
                Number(preset.exposure);
        }

        if (window.scene) {
            if (
                'environmentIntensity' in window.scene &&
                Number.isFinite(Number(preset.environmentIntensity))
            ) {
                window.scene.environmentIntensity =
                    Math.max(
                        0,
                        Number(preset.environmentIntensity)
                    );
            }

            if (
                'backgroundIntensity' in window.scene &&
                Number.isFinite(Number(preset.backgroundIntensity))
            ) {
                window.scene.backgroundIntensity =
                    Math.max(
                        0,
                        Number(preset.backgroundIntensity)
                    );
            }

            if (
                Number.isFinite(Number(preset.hemisphere))
            ) {
                const hemi =
                    window.scene.getObjectByName?.('SkyHemiLight') ||
                    window.scene.getObjectByName?.('HemisphereLight') ||
                    null;

                if (hemi?.isHemisphereLight) {
                    hemi.intensity =
                        Math.max(
                            0,
                            Number(preset.hemisphere)
                        );
                }
            }
        }

        return true;
    }

    async function apply(
        name,
        {
            controller =
                window.smSunController,
            timeSystem =
                window.smSunTimeOfDay,
            environmentBridge =
                window.smSunEnvironmentBridge
        } = {}
    ) {
        const resolvedName =
            resolveName(name);

        const preset =
            PRESETS[resolvedName] ||
            null;

        if (!preset) {
            console.warn(
                `[SMSunPresets] Unknown preset: ${name}`
            );
            return false;
        }

        /*
         * 1) Time first: positions the sun using SMSunTimeOfDay's smooth arc.
         * 2) Temperature/intensity: final artistic directional-light calibration.
         * 3) Environment last: it wins over the automatic elevation blend and
         *    leaves the exact preset exposure/IBL/fill values in the scene.
         */
        timeSystem
            ?.setTime?.(
                preset.time
            );

        controller
            ?.setTemperature?.(
                preset.temperature
            );

        controller
            ?.setIntensity?.(
                preset.sunIntensity
            );

        if (
            environmentBridge &&
            typeof environmentBridge.applyPreset === 'function'
        ) {
            environmentBridge.applyPreset(
                preset
            );
        } else {
            applyFallbackEnvironment(
                preset
            );
        }

        if (
            window.renderer?.shadowMap
        ) {
            window.renderer.shadowMap.needsUpdate =
                true;
        }

        window.dispatchEvent(
            new CustomEvent(
                'sm:sun-preset-applied',
                {
                    detail: {
                        id: resolvedName,
                        requestedId: name,
                        preset
                    }
                }
            )
        );

        return true;
    }

    window.SMSunPresets = {
        presets: PRESETS,
        aliases: ALIASES,
        resolveName,
        get,
        list,
        listAliases,
        apply
    };
})();