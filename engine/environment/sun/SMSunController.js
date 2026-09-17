// engine/environment/sun/SMSunController.js
// SM Engine — Advanced Sun Rig Controller
//
// Adopts the existing Sun Light from smHDRSkySystem.
// It never creates a second sun unless the HDR sky system is unavailable.
//
// Source of truth:
// azimuth + elevation + target + distance
//          ↓
// DirectionalLight transform + shadow state
(function () {
    'use strict';

    const DEG2RAD = Math.PI / 180;
    const RAD2DEG = 180 / Math.PI;
    const LIGHTING_PROFILE_VERSION = 3;

    const DEFAULTS = {
        azimuth: 135,
        elevation: 38,
        distance: 110,

        intensity: 1.8,
        temperature: 5600,

        target: [0, 0, 0],

        shadow: {
            enabled: true,
            mapSize: 2048,
            area: 48,
            near: 0.5,
            far: 260,
            bias: -0.00005,
            normalBias: 0.0015,
            radius: 1.0,
        },

        persist: true,

        effects: {
            enabled: true,
            glareStrength: 1.0,
            lensFlareStrength: 0.72,
            occlusionEnabled: true
        }
    };

    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    function normalizeAzimuth(value) {
        let result = Number(value) || 0;
        result %= 360;
        if (result < 0) result += 360;
        return result;
    }

    function kelvinToColor(kelvin) {
        // Fast editor-safe approximation for 1000K–40000K.
        const temperature = clamp(Number(kelvin) || 6500, 1000, 40000) / 100;
        let red;
        let green;
        let blue;

        if (temperature <= 66) {
            red = 255;
            green = 99.4708025861 * Math.log(temperature) - 161.1195681661;

            if (temperature <= 19) {
                blue = 0;
            } else {
                blue =
                    138.5177312231 *
                    Math.log(temperature - 10) -
                    305.0447927307;
            }
        } else {
            red =
                329.698727446 *
                Math.pow(temperature - 60, -0.1332047592);

            green =
                288.1221695283 *
                Math.pow(temperature - 60, -0.0755148492);

            blue = 255;
        }

        const r = clamp(red, 0, 255) / 255;
        const g = clamp(green, 0, 255) / 255;
        const b = clamp(blue, 0, 255) / 255;

        return new THREE.Color(r, g, b);
    }

    class SMSunController {
        constructor(options = {}) {
            this.options = {
                ...DEFAULTS,
                ...options,
                shadow: {
                    ...DEFAULTS.shadow,
                    ...(options.shadow || {})
                },
                effects: {
                    ...DEFAULTS.effects,
                    ...(options.effects || {})
                }
            };

            this.light = null;
            this.targetObject = null;
            this.rigProxy = null;

            this.azimuth = this.options.azimuth;
            this.elevation = this.options.elevation;
            this.distance = this.options.distance;

            this.intensity = this.options.intensity;
            this.temperature = this.options.temperature;

            this.target = new THREE.Vector3(
                ...this.options.target
            );

            this.initialized = false;
            this._applying = false;
            this._lastStateSignature = '';
        }

        get hdrSky() {
            return (
                window.smHDRSkySystem ||
                window.skyLightingSystem ||
                null
            );
        }

        waitForHDRSky(timeout = 12000) {
            return new Promise(resolve => {
                const started = performance.now();

                const tick = () => {
                    const sky = this.hdrSky;

                    if (
                        sky?.sunLight &&
                        sky?.sunTarget
                    ) {
                        resolve(true);
                        return;
                    }

                    if (
                        performance.now() - started >
                        timeout
                    ) {
                        resolve(false);
                        return;
                    }

                    setTimeout(tick, 80);
                };

                tick();
            });
        }

        async init() {
            if (this.initialized) {
                this.apply();
                return true;
            }

            const ready =
                await this.waitForHDRSky();

            if (!ready) {
                console.error(
                    '[SMSunController] HDR sky sun was not found.'
                );
                return false;
            }

            this.light =
                this.hdrSky.sunLight;

            this.targetObject =
                this.hdrSky.sunTarget;

            this._loadPersistedState();
            this._createHierarchyProxy();
            this._configureExistingLight();
            this.apply(true);

            window.smSunEffectsBridge
                ?.setEnabled?.(
                    this.options.effects
                        .enabled !== false
                );

            window.smSunEffectsBridge
                ?.setGlareStrength?.(
                    this.options.effects
                        .glareStrength
                );

            window.smSunEffectsBridge
                ?.setLensFlareStrength?.(
                    this.options.effects
                        .lensFlareStrength
                );

            window.smSunEffectsBridge
                ?.setOcclusionEnabled?.(
                    this.options.effects
                        .occlusionEnabled !== false
                );

            this.initialized = true;

            window.dispatchEvent(
                new CustomEvent(
                    'sm:sun-controller-ready',
                    {
                        detail: {
                            controller: this,
                            light: this.light
                        }
                    }
                )
            );

            console.log(
                '✅ SMSunController ready'
            );

            return true;
        }

        _createHierarchyProxy() {
            const root =
                this.hdrSky?.root ||
                window.scene
                    ?.getObjectByName?.(
                        'Environment'
                    );

            if (!root) return;

            let proxy =
                root.children.find(
                    child =>
                        child.userData
                            ?.isSMSunRigProxy ===
                        true
                );

            if (!proxy) {
                proxy =
                    new THREE.Object3D();

                proxy.name =
                    'Sun Rig';

                proxy.userData = {
                    ...(proxy.userData || {}),
                    isSMSunRigProxy: true,
                    isSystemObject: false,
                    ignoreInHierarchy: false,
                    ignoreInTimeline: true,
                    selectable: true,
                    editorOnly: true,
                    excludeFromNanite: true,
                    excludeFromStaticMerge: true
                };

                root.add(proxy);
            }

            proxy.userData.sunLightUuid =
                this.light?.uuid ||
                null;

            this.rigProxy = proxy;
        }

        _configureExistingLight() {
            if (!this.light) return;

            this.light.name =
                'Sun Light';

            this.light.userData ||= {};

            Object.assign(
                this.light.userData,
                {
                    isSMSunLight: true,
                    isHDRSkyLight: true,
                    isSystemObject: false,
                    ignoreInHierarchy: false,
                    ignoreInTimeline: true,
                    shadowRequested:
                        this.options.shadow.enabled !==
                        false
                }
            );

            if (this.targetObject) {
                this.targetObject.userData ||= {};

                Object.assign(
                    this.targetObject.userData,
                    {
                        isSMSunTarget: true,
                        isSystemObject: true,
                        ignoreInHierarchy: true,
                        ignoreInTimeline: true
                    }
                );
            }

            this.configureShadows(
                this.options.shadow
            );
        }

        directionFromAngles(
            azimuth = this.azimuth,
            elevation = this.elevation
        ) {
            const az =
                normalizeAzimuth(azimuth) *
                DEG2RAD;

            const el =
                clamp(
                    Number(elevation) || 0,
                    -89.5,
                    89.5
                ) *
                DEG2RAD;

            const cosEl =
                Math.cos(el);

            return new THREE.Vector3(
                Math.sin(az) * cosEl,
                Math.sin(el),
                Math.cos(az) * cosEl
            ).normalize();
        }

        /**
         * Returns the world direction FROM the scene/camera TOWARD the sun.
         * This is the canonical direction for camera-facing effects.
         */
        getSunDirection(
            target =
                new THREE.Vector3()
        ) {
            return target.copy(
                this.directionFromAngles(
                    this.azimuth,
                    this.elevation
                )
            );
        }

        /**
         * Directional lights are conceptually infinitely far away.
         * Camera effects therefore use a virtual sun position relative
         * to the ACTIVE camera instead of the finite editor light position.
         */
        getVirtualSunPosition(
            camera,
            distance = 2200,
            target =
                new THREE.Vector3()
        ) {
            if (!camera) {
                return target.set(
                    0,
                    0,
                    0
                );
            }

            return target
                .copy(
                    camera.position
                )
                .addScaledVector(
                    this.getSunDirection(
                        new THREE.Vector3()
                    ),
                    Math.max(
                        10,
                        Number(distance) ||
                        2200
                    )
                );
        }

        setEffectsEnabled(enabled) {
            this.options.effects.enabled =
                !!enabled;

            window.smSunEffectsBridge
                ?.setEnabled?.(
                    enabled
                );

            this._persistState();

            return this.options
                .effects.enabled;
        }

        setGlareStrength(value) {
            const amount =
                Math.max(
                    0,
                    Number(value) || 0
                );

            this.options.effects.glareStrength =
                amount;

            window.smSunEffectsBridge
                ?.setGlareStrength?.(
                    amount
                );

            this._persistState();

            return amount;
        }

        setLensFlareStrength(value) {
            const amount =
                Math.max(
                    0,
                    Number(value) || 0
                );

            this.options.effects.lensFlareStrength =
                amount;

            window.smSunEffectsBridge
                ?.setLensFlareStrength?.(
                    amount
                );

            this._persistState();

            return amount;
        }

        anglesFromDirection(direction) {
            const dir =
                direction.clone().normalize();

            return {
                azimuth:
                    normalizeAzimuth(
                        Math.atan2(
                            dir.x,
                            dir.z
                        ) * RAD2DEG
                    ),

                elevation:
                    Math.asin(
                        clamp(
                            dir.y,
                            -1,
                            1
                        )
                    ) * RAD2DEG
            };
        }

        apply(force = false) {
            if (
                !this.light ||
                !this.targetObject ||
                this._applying
            ) {
                return false;
            }

            const signature =
                [
                    this.azimuth.toFixed(4),
                    this.elevation.toFixed(4),
                    this.distance.toFixed(3),
                    this.target.x.toFixed(3),
                    this.target.y.toFixed(3),
                    this.target.z.toFixed(3),
                    this.intensity.toFixed(3),
                    this.temperature.toFixed(1)
                ].join('|');

            if (
                !force &&
                signature ===
                this._lastStateSignature
            ) {
                return false;
            }

            this._applying = true;

            try {
                const direction =
                    this.directionFromAngles();

                this.targetObject
                    .position
                    .copy(
                        this.target
                    );

                this.light
                    .position
                    .copy(
                        this.target
                    )
                    .addScaledVector(
                        direction,
                        this.distance
                    );

                this.light.intensity =
                    Math.max(
                        0,
                        this.intensity
                    );

                this.light.color
                    .copy(
                        kelvinToColor(
                            this.temperature
                        )
                    );

                this.targetObject
                    .updateMatrixWorld?.(
                        true
                    );

                this.light
                    .updateMatrixWorld?.(
                        true
                    );

                if (this.light.shadow) {
                    this.light.shadow.needsUpdate =
                        true;
                }

                if (
                    window.renderer
                        ?.shadowMap
                ) {
                    window.renderer
                        .shadowMap
                        .needsUpdate =
                        true;
                }

                if (this.hdrSky?.config?.sun) {
                    const cfg =
                        this.hdrSky.config.sun;

                    cfg.intensity =
                        this.intensity;

                    cfg.color =
                        this.light.color
                            .getHex();

                    cfg.position =
                        this.light.position
                            .toArray();

                    cfg.target =
                        this.target
                            .toArray();
                }

                this._lastStateSignature =
                    signature;

                this._persistState();

                const detail = {
                    controller: this,
                    azimuth: this.azimuth,
                    elevation: this.elevation,
                    distance: this.distance,
                    intensity: this.intensity,
                    temperature: this.temperature,
                    target: this.target.clone(),
                    direction
                };

                window.dispatchEvent(
                    new CustomEvent(
                        'sm:sun-changed',
                        {
                            detail
                        }
                    )
                );

                return true;
            } finally {
                this._applying = false;
            }
        }

        setAngles(
            azimuth,
            elevation,
            {
                apply = true
            } = {}
        ) {
            this.azimuth =
                normalizeAzimuth(
                    azimuth
                );

            this.elevation =
                clamp(
                    Number(elevation) || 0,
                    -15,
                    89
                );

            if (apply) {
                this.apply();
            }

            return {
                azimuth: this.azimuth,
                elevation: this.elevation
            };
        }

        setAzimuth(value) {
            return this.setAngles(
                value,
                this.elevation
            );
        }

        setElevation(value) {
            return this.setAngles(
                this.azimuth,
                value
            );
        }

        setDirection(direction) {
            if (!direction) return false;

            const angles =
                this.anglesFromDirection(
                    direction
                );

            this.setAngles(
                angles.azimuth,
                angles.elevation
            );

            return true;
        }

        setTarget(
            x,
            y,
            z
        ) {
            if (
                x?.isVector3
            ) {
                this.target.copy(x);
            } else if (
                Array.isArray(x)
            ) {
                this.target.set(
                    Number(x[0]) || 0,
                    Number(x[1]) || 0,
                    Number(x[2]) || 0
                );
            } else {
                this.target.set(
                    Number(x) || 0,
                    Number(y) || 0,
                    Number(z) || 0
                );
            }

            this.apply();

            return this.target;
        }

        setDistance(value) {
            this.distance =
                Math.max(
                    5,
                    Number(value) || 65
                );

            this.apply();

            return this.distance;
        }

        setIntensity(value) {
            this.intensity =
                Math.max(
                    0,
                    Number(value) || 0
                );

            this.apply();

            return this.intensity;
        }

        setTemperature(value) {
            this.temperature =
                clamp(
                    Number(value) || 5200,
                    1000,
                    20000
                );

            this.apply();

            return this.temperature;
        }

        configureShadows(options = {}) {
            if (
                !this.light?.shadow
            ) {
                return false;
            }

            const shadowCfg = {
                ...this.options.shadow,
                ...options
            };

            this.options.shadow =
                shadowCfg;

            this.light.castShadow =
                shadowCfg.enabled !==
                false;

            const shadow =
                this.light.shadow;

            const mapSize = Math.max(
                1024,
                Math.min(4096, Number(shadowCfg.mapSize) || 2048)
            );

            if (shadow.map) {
                shadow.map.dispose?.();
                shadow.map = null;
            }

            shadow.mapSize.set(
                mapSize,
                mapSize
            );

            const area = Math.max(
                16,
                Math.min(120, Number(shadowCfg.area) || 48)
            );

            shadow.camera.left =
                -area;

            shadow.camera.right =
                area;

            shadow.camera.top =
                area;

            shadow.camera.bottom =
                -area;

            shadow.camera.near = Math.max(
                0.05,
                Number(shadowCfg.near) || 0.5
            );

            shadow.camera.far = Math.max(
                shadow.camera.near + 10,
                Math.min(1200, Number(shadowCfg.far) || 260)
            );

            const bias = Number(shadowCfg.bias);
            shadow.bias = Number.isFinite(bias)
                ? Math.max(-0.002, Math.min(0, bias))
                : -0.00005;
            const normalBias = Number(shadowCfg.normalBias);
            shadow.normalBias = Number.isFinite(normalBias)
                ? Math.max(0, Math.min(0.006, normalBias))
                : 0.0015;
            const radius = Number(shadowCfg.radius);
            shadow.radius = Number.isFinite(radius)
                ? Math.max(0, Math.min(2, radius))
                : 1.0;

            shadow.camera
                .updateProjectionMatrix?.();

            shadow.needsUpdate =
                true;

            if (typeof window.smRender?.setShadows === 'function') {
                window.smRender.setShadows(shadowCfg.enabled !== false, THREE.PCFSoftShadowMap);
            } else if (this.hdrSky?.refreshShadows) {
                this.hdrSky.refreshShadows();
            } else if (window.renderer?.shadowMap) {
                window.renderer.shadowMap.enabled = shadowCfg.enabled !== false;
                window.renderer.shadowMap.needsUpdate = true;
            }

            return true;
        }

        getState() {
            return {
                profileVersion: LIGHTING_PROFILE_VERSION,
                azimuth: this.azimuth,
                elevation: this.elevation,
                distance: this.distance,
                intensity: this.intensity,
                temperature: this.temperature,
                target: this.target.toArray(),
                shadow: {
                    ...this.options.shadow
                },

                effects: {
                    ...this.options.effects
                }
            };
        }

        setState(
            state = {},
            {
                apply = true
            } = {}
        ) {
            if (
                state.azimuth !==
                undefined
            ) {
                this.azimuth =
                    normalizeAzimuth(
                        state.azimuth
                    );
            }

            if (
                state.elevation !==
                undefined
            ) {
                this.elevation =
                    clamp(
                        Number(
                            state.elevation
                        ) || 0,
                        -15,
                        89
                    );
            }

            if (
                state.distance !==
                undefined
            ) {
                this.distance =
                    Math.max(
                        5,
                        Number(
                            state.distance
                        ) || 65
                    );
            }

            if (
                state.intensity !==
                undefined
            ) {
                this.intensity =
                    Math.max(
                        0,
                        Number(
                            state.intensity
                        ) || 0
                    );
            }

            if (
                state.temperature !==
                undefined
            ) {
                this.temperature =
                    clamp(
                        Number(
                            state.temperature
                        ) || 5200,
                        1000,
                        20000
                    );
            }

            if (
                Array.isArray(
                    state.target
                )
            ) {
                this.target.fromArray(
                    state.target
                );
            }

            if (state.shadow) {
                this.configureShadows(
                    state.shadow
                );
            }

            if (state.effects) {
                this.options.effects = {
                    ...this.options.effects,
                    ...state.effects
                };
            }

            window.smSunEffectsBridge
                ?.setEnabled?.(
                    this.options.effects
                        .enabled !== false
                );

            window.smSunEffectsBridge
                ?.setGlareStrength?.(
                    this.options.effects
                        .glareStrength
                );

            window.smSunEffectsBridge
                ?.setLensFlareStrength?.(
                    this.options.effects
                        .lensFlareStrength
                );

            window.smSunEffectsBridge
                ?.setOcclusionEnabled?.(
                    this.options.effects
                        .occlusionEnabled !== false
                );

            if (apply) {
                this.apply(true);
            }

            return this.getState();
        }

        _persistState() {
            if (
                this.options.persist ===
                false
            ) {
                return;
            }

            try {
                localStorage.setItem(
                    'sm_sun_rig_state',
                    JSON.stringify(this.getState())
                );
            } catch (_) {}
        }

        _loadPersistedState() {
            if (
                this.options.persist ===
                false
            ) {
                return;
            }

            try {
                const raw =
                    localStorage.getItem(
                        'sm_sun_rig_state'
                    );

                if (!raw) return;

                const parsed = JSON.parse(raw);
                // Discard state from the pre-calibrated rig. Its broad shadow
                // frustum and bias values are what caused the startup waves.
                if (Number(parsed?.profileVersion) !== LIGHTING_PROFILE_VERSION) {
                    localStorage.removeItem('sm_sun_rig_state');
                    return;
                }

                this.setState(
                    parsed,
                    {
                        apply: false
                    }
                );
            } catch (_) {}
        }

        reset() {
            localStorage.removeItem(
                'sm_sun_rig_state'
            );

            this.setState(
                {
                    azimuth:
                        DEFAULTS.azimuth,
                    elevation:
                        DEFAULTS.elevation,
                    distance:
                        DEFAULTS.distance,
                    intensity:
                        DEFAULTS.intensity,
                    temperature:
                        DEFAULTS.temperature,
                    target:
                        DEFAULTS.target,
                    shadow:
                        DEFAULTS.shadow
                }
            );
        }

        debug() {
            console.table({
                Azimuth: this.azimuth.toFixed(2),
                Elevation: this.elevation.toFixed(2),
                Distance: this.distance.toFixed(2),
                Intensity: this.intensity.toFixed(2),
                Temperature: `${this.temperature.toFixed(0)} K`,
                Target: this.target.toArray().map(v => v.toFixed(2)).join(', '),
                Shadow: this.light?.castShadow === true
            });
        }
    }

    window.SMSunController =
        SMSunController;

    window.smSunController =
        window.smSunController ||
        new SMSunController();
})();
