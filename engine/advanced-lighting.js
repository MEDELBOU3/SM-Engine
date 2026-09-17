// ============================================================
// engine/advanced-lighting.js
// SM Engine — Legacy Lighting Compatibility Bridge
//
// IMPORTANT:
// - SMHDRSkySystem owns the real environment + sun.
// - SMSunController owns sun transform/shadow state.
// - This file MUST NOT create a second lighting rig.
// - Weather / time-of-day helpers only modify the authoritative
//   Sky system.
// ============================================================

(function () {
    'use strict';

    const lighting = {
        ambientLight: null,
        hemiLight: null,
        sunLight: null,
        rectLight1: null,
        rectLight2: null,
        spotLight: null,
        directionalLight: null,
        fillLight: null,
        advancedEnabled: false
    };

    // ------------------------------------------------------------
    // Runtime metadata helper
    // ------------------------------------------------------------

    const markRuntimeLight = (light, name) => {
        if (!light) return;

        if (name) {
            light.name = name;
        }

        light.userData ||= {};

        light.userData.isSystemObject = true;
        light.userData.ignoreInTimeline = true;
        light.userData.isLegacyLightingBridge = true;
    };

    // ------------------------------------------------------------
    // Resolve authoritative lighting system
    // ------------------------------------------------------------

    function getLightingSystem() {
        return (
            window.smHDRSkySystem ||
            window.skyLightingSystem ||
            null
        );
    }

    function getScene() {
        return window.scene || null;
    }

    // ------------------------------------------------------------
    // Time of day
    // ------------------------------------------------------------

    function applyTimeOfDayEffect(timeOfDay) {
        const system = getLightingSystem();

        if (!system) return false;

        let effectName;

        if (timeOfDay >= 5 && timeOfDay < 7) {
            effectName = 'dawn';
        } else if (timeOfDay >= 7 && timeOfDay < 11) {
            effectName = 'morning';
        } else if (timeOfDay >= 11 && timeOfDay < 14) {
            effectName = 'noon';
        } else if (timeOfDay >= 14 && timeOfDay < 17) {
            effectName = 'afternoon';
        } else if (timeOfDay >= 17 && timeOfDay < 19) {
            effectName = 'sunset';
        } else if (timeOfDay >= 19 && timeOfDay < 21) {
            effectName = 'dusk';
        } else {
            effectName = 'night';
        }

        const effect =
            typeof timeOfDayEffects !== 'undefined'
                ? timeOfDayEffects?.[effectName]
                : null;

        if (!effect) return false;

        if (system.skyParams) {
            if (effect.skyTurbidity !== undefined) {
                system.skyParams.turbidity = effect.skyTurbidity;
            }
        }

        const sun = system.sunLight;

        if (sun && effect.sunIntensity !== undefined) {
            sun.intensity = Math.max(
                0,
                Number(effect.sunIntensity) || 0
            );

            sun.shadow?.needsUpdate = true;
        }

        const ambient = system.ambientLight;

        if (ambient && effect.ambientIntensity !== undefined) {
            ambient.intensity = Math.max(
                0,
                Number(effect.ambientIntensity) || 0
            );
        }

        const scene = system.scene || getScene();

        if (scene?.fog && effect.fogColor !== undefined) {
            scene.fog.color.setHex(effect.fogColor);
        }

        return true;
    }

    // ------------------------------------------------------------
    // Weather integration
    // ------------------------------------------------------------

    function setupEnvironmentInteraction() {
        const system = getLightingSystem();

        if (!system || system.__smAdvancedLightingWeatherHook) {
            return false;
        }

        system.__smAdvancedLightingWeatherHook = true;

        const originalSetWeather = system.setWeather;

        if (typeof originalSetWeather === 'function') {
            system.setWeather = function (type, intensity) {
                originalSetWeather.call(this, type, intensity);

                const amount = Math.max(
                    0,
                    Math.min(1, Number(intensity) || 0)
                );

                if (type === 'rainIntensity') {
                    if (this.fogParams) {
                        this.fogParams.density =
                            0.00025 + amount * 0.002;
                    }

                    if (this.ambientLight) {
                        this.ambientLight.intensity =
                            Math.max(
                                0.05,
                                0.3 - amount * 0.2
                            );
                    }

                    window.audioSystem?.setRainIntensity?.(amount);
                }

                if (type === 'stormIntensity' && amount > 0.5) {
                    this.addLightningEffect?.();
                }
            };
        }

        // --------------------------------------------------------
        // Lightning flash
        //
        // Temporary light only.
        // It does NOT become a persistent lighting authority.
        // --------------------------------------------------------

        if (!system.addLightningEffect) {
            system.addLightningEffect = function () {
                const scene = this.scene || getScene();

                if (!scene || typeof THREE === 'undefined') {
                    return;
                }

                const lightning = new THREE.DirectionalLight(
                    0xffffff,
                    5
                );

                lightning.name = 'Weather Lightning Flash';

                lightning.position.set(
                    (Math.random() - 0.5) * 200,
                    100,
                    (Math.random() - 0.5) * 200
                );

                lightning.userData = {
                    isSystemObject: true,
                    isWeatherEffect: true,
                    ignoreInHierarchy: true,
                    ignoreInTimeline: true,
                    castShadow: false
                };

                // IMPORTANT:
                // Never allow weather flash to create another shadow map.
                lightning.castShadow = false;

                scene.add(lightning);

                setTimeout(() => {
                    if (lightning.parent) {
                        lightning.parent.remove(lightning);
                    }

                    lightning.dispose?.();
                }, 100);
            };
        }

        return true;
    }

    // ------------------------------------------------------------
    // Console commands
    // ------------------------------------------------------------

    function setupConsoleCommands() {
        window.setSkyTime =
            typeof setTimeOfDay !== 'undefined'
                ? setTimeOfDay
                : undefined;

        window.setSkyWeather =
            typeof setWeatherPreset !== 'undefined'
                ? setWeatherPreset
                : undefined;

        window.toggleSkyAutoTime =
            typeof toggleAutoTime !== 'undefined'
                ? toggleAutoTime
                : undefined;

        window.setSkyQuality =
            typeof setLightingQuality !== 'undefined'
                ? setLightingQuality
                : undefined;
    }

    // ------------------------------------------------------------
    // Remove legacy runtime lights
    // ------------------------------------------------------------

    function removeLegacyRuntimeLights() {
        const scene = getScene();

        if (!scene) return 0;

        let removed = 0;

        scene.traverse((object) => {
            if (!object?.isLight) return;

            const data = object.userData || {};

            if (!data.isLegacyLightingBridge) {
                return;
            }

            if (object.parent) {
                object.parent.remove(object);
                removed++;
            }
        });

        return removed;
    }

    // ------------------------------------------------------------
    // Advanced lighting
    //
    // LEGACY API COMPATIBILITY ONLY.
    //
    // We intentionally DO NOT create:
    // - AmbientLight
    // - HemisphereLight
    // - DirectionalLight
    // - SpotLight
    // - RectAreaLight
    // - FillLight
    //
    // The authoritative Sky/Sun system owns those.
    // ------------------------------------------------------------

    function setupAdvancedLighting() {
        const system = getLightingSystem();

        // Always remove anything previously created by this legacy bridge.
        removeLegacyRuntimeLights();

        if (!system) {
            console.warn(
                '[AdvancedLighting] No authoritative SkyLightingSystem found.'
            );

            lighting.advancedEnabled = false;

            return false;
        }

        lighting.ambientLight =
            system.ambientLight || null;

        lighting.hemiLight =
            system.hemiLight || null;

        lighting.sunLight =
            system.sunLight || null;

        lighting.advancedEnabled = true;

        console.info(
            '[AdvancedLighting] Using authoritative Sky lighting rig.',
            {
                sun: lighting.sunLight?.name || null,
                hemisphere: lighting.hemiLight?.name || null,
                ambient: lighting.ambientLight?.name || null
            }
        );

        return true;
    }

    // ------------------------------------------------------------
    // Toggle
    //
    // Kept for old UI/buttons.
    // It no longer creates/removes actual lighting.
    // ------------------------------------------------------------

    function toggleAdvancedLighting() {
        const button =
            document.getElementById('toggle-lighting');

        const system = getLightingSystem();

        if (!system) {
            console.warn(
                '[AdvancedLighting] Cannot toggle: Sky system unavailable.'
            );

            return false;
        }

        lighting.advancedEnabled =
            !lighting.advancedEnabled;

        if (button) {
            button.textContent =
                lighting.advancedEnabled
                    ? 'Disable Advanced Lighting'
                    : 'Enable Advanced Lighting';
        }

        // The real lighting rig stays alive.
        // We only expose compatibility state.
        console.info(
            `[AdvancedLighting] Compatibility mode: ${
                lighting.advancedEnabled
                    ? 'ON'
                    : 'OFF'
            }`
        );

        return lighting.advancedEnabled;
    }

    // ------------------------------------------------------------
    // Public API
    // ------------------------------------------------------------

    window.toggleAdvancedLighting =
        toggleAdvancedLighting;

    window.setupAdvancedLighting =
        setupAdvancedLighting;

    window.applyTimeOfDayEffect =
        applyTimeOfDayEffect;

    window.setupEnvironmentInteraction =
        setupEnvironmentInteraction;

    window.setupAdvancedLightingCompatibility =
        () => {
            setupConsoleCommands();
            setupEnvironmentInteraction();
            setupAdvancedLighting();
        };

    // ------------------------------------------------------------
    // Startup
    // ------------------------------------------------------------

    if (document.readyState === 'loading') {
        document.addEventListener(
            'DOMContentLoaded',
            () => {
                setupConsoleCommands();
                setupEnvironmentInteraction();
            },
            { once: true }
        );
    } else {
        setupConsoleCommands();
        setupEnvironmentInteraction();
    }

})();