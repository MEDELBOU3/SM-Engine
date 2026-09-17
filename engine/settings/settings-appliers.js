// ============================================================
// engine/settings/settings-appliers.js
//
// Feature logic for every editor preference. Each setting is
// "defined" (id -> type/group/default matching the settings UI)
// and wired to an Applier function that mutates real engine
// objects (window.renderer, window.camera, window.controls,
// window.transformControls, window.skyLightingSystem, ...).
//
// This is the engine-side half of the old panels/settingsPanel.js
// `_applySetting` switch - the panel now owns only the DOM.
// ============================================================

(function () {
    const store = window.EngineSettingsStore;
    if (!store) {
        console.warn('[SettingsAppliers] EngineSettingsStore not found - engine/settings/settings-store.js must load first.');
        return;
    }

    const helpers = {
        renderer() {
            return window.renderer || null;
        },
        scene() {
            return window.scene || null;
        },
        camera() {
            return window.camera || null;
        },
        controls() {
            return window.controls || null;
        },
        gizmos() {
            return window.transformControls || null;
        },
        sunLight() {
            return (
                window.smSunController?.light ||
                window.smHDRSkySystem?.sunLight ||
                window.skyLightingSystem?.sunLight ||
                window.sunLight ||
                null
            );
        },
        workspaceMode() {
            return String(
                window.workspaceManager?.currentMode ||
                localStorage.getItem('sm_workspace_mode') ||
                'FILM',
            ).toUpperCase();
        },
        workspaceLights() {
            const scene = this.scene();
            if (!scene) return [];
            const mode = this.workspaceMode();
            const lights = [];
            const add = (light) => {
                if (light?.isLight && !lights.includes(light)) lights.push(light);
            };
            if (mode === 'FILM') {
                ['StudioKeyLight', 'StudioFillLight', 'StudioRimLight', 'StudioAmbient']
                    .forEach(name => add(scene.getObjectByName(name)));
            } else if (mode === 'GAMEPLAY_SAMPLE') {
                scene.traverse(object => {
                    if (object?.userData?.isGameplaySample) add(object);
                });
            } else if (mode === 'GAME_DEV') {
                add(window.smSunController?.light);
                add(window.smHDRSkySystem?.sunLight);
                add(window.smHDRSkySystem?.hemiLight);

                // Legacy fallback only.
                add(window.skyLightingSystem?.sunLight);
                add(window.skyLightingSystem?.hemiLight);
                add(window.skyLightingSystem?.ambientLight);

                ['GameSunLight', 'GameHemiLight', 'GameFillLight']
                    .forEach(name => add(scene.getObjectByName(name)));
            } else if (mode === 'TERRAIN') {
                add(window.smSunController?.light);
                add(window.smHDRSkySystem?.sunLight);
                add(window.smHDRSkySystem?.hemiLight);

                // Legacy fallback only.
                add(window.skyLightingSystem?.sunLight);
                add(window.skyLightingSystem?.hemiLight);
                add(window.skyLightingSystem?.ambientLight);

                ['TerrainSunLight', 'TerrainHemiLight']
                    .forEach(name => add(scene.getObjectByName(name)));
            }
            return lights;
        },
        gridObjects() {
            const scene = this.scene();
            const found = [];
            if (!scene) return found;
            ['blenderGrid', 'advancedGrid', 'gameModeGrid2D'].forEach(name => {
                const obj = scene.getObjectByName(name);
                if (obj) found.push(obj);
            });
            if (window.infiniteGrid) found.push(window.infiniteGrid);
            return found;
        },
        materials() {
            const scene = this.scene();
            const out = [];
            if (scene) {
                scene.traverse(obj => {
                    if (obj.material) {
                        if (Array.isArray(obj.material)) out.push(...obj.material);
                        else out.push(obj.material);
                    }
                });
            }
            return out;
        },
        hud() {
            return window.smSettingsHud || null;
        }
    };

    const setSceneBackground = (hex) => {
        const renderer = helpers.renderer();
        const scene = helpers.scene();
        if (renderer) renderer.setClearColor(hex);
        if (scene) scene.background = new THREE.Color(hex);
    };

    const reapplyActiveHDRI = () => {
        const scene = helpers.scene();
        const hdrSky = window.smHDRSkySystem;
        const active = window.smActiveHDRI;

        if (!scene) return false;

        const intensity = Number(
            store.get('setting-hdri-intensity')
        );

        const safeIntensity = Number.isFinite(intensity)
            ? intensity
            : 0.48;

        if (hdrSky) {
            hdrSky.setEnvironmentIntensity?.(safeIntensity);

            if (hdrSky.hdrTexture) {
                scene.background = hdrSky.hdrTexture;
            }

            if (
                window.smHDRIEnvironmentEnabled !== false &&
                window.smGlobalIBLAllowed !== false
            ) {
                scene.environment =
                    hdrSky.environmentTexture ||
                    hdrSky.hdrTexture ||
                    scene.environment;

                if ('environmentIntensity' in scene) {
                    scene.environmentIntensity = safeIntensity;
                }
            }

            return true;
        }

        // Legacy/imported HDRI fallback.
        if (!active?.texture) return false;

        active.intensity = safeIntensity;
        active.texture.mapping =
            THREE.EquirectangularReflectionMapping;

        if (window.smGlobalIBLAllowed !== false) {
            scene.environment = active.texture;
            scene.environmentIntensity = safeIntensity;
        }
        scene.background = active.texture;

        return true;
    };

    const isConfigured = (id) =>
        typeof store.isConfigured === 'function' ? store.isConfigured(id) : true;

    /*
     * HDR-ONLY LIGHTING MIGRATION
     * ---------------------------
     * Older projects could persist very high directional-light values
     * (for example 4.25) under sm-engine-preferences. Those values were
     * designed for the previous procedural sky and must not silently win
     * over the new HDR-only Sun Rig defaults.
     */
    const HDR_LIGHTING_MIGRATION_KEY =
        'sm-hdr-only-lighting-settings-v3';

    const migrateLegacyHDRLightingOnce = () => {
        if (
            !window.smHDRSkySystem ||
            localStorage.getItem(
                HDR_LIGHTING_MIGRATION_KEY
            ) === '1'
        ) {
            return;
        }

        try {
            const storageKey =
                'sm-engine-preferences';

            const raw =
                localStorage.getItem(
                    storageKey
                );

            const prefs =
                raw
                    ? JSON.parse(raw) || {}
                    : {};

            const defaultSun =
                Number(
                    window.smHDRSkySystem
                        ?.config
                        ?.sun
                        ?.intensity
                );

            const safeSun =
                Number.isFinite(defaultSun)
                    ? defaultSun
                    : 1.8;

            const storedDirectional =
                Number(
                    prefs[
                        'setting-directional-intensity'
                    ]
                );

            /*
             * Values above 2.5 are treated as legacy procedural-sky
             * values. A modern HDRI + real sun normally needs much less.
             */
            // 0.82 was the old procedural-sky default. It is too dim once
            // the HDRI is physically graded, while values above 2.5 were
            // legacy over-bright values. Migrate both old defaults to the
            // calibrated Sun Rig value; explicit values outside that range
            // remain user-owned settings.
            const isLegacyDefault =
                Number.isFinite(storedDirectional) &&
                Math.abs(storedDirectional - 0.82) < 0.001;

            if (
                Number.isFinite(
                    storedDirectional
                ) &&
                (storedDirectional > 2.5 || isLegacyDefault)
            ) {
                prefs[
                    'setting-directional-intensity'
                ] = safeSun;

                localStorage.setItem(
                    storageKey,
                    JSON.stringify(prefs)
                );

                store.setRaw?.(
                    'setting-directional-intensity',
                    safeSun
                );

                console.info(
                    `[SettingsAppliers] Migrated legacy Sun intensity ${storedDirectional} -> ${safeSun}.`
                );
            }

            localStorage.setItem(
                HDR_LIGHTING_MIGRATION_KEY,
                '1'
            );
        } catch (error) {
            console.warn(
                '[SettingsAppliers] HDR lighting migration failed:',
                error
            );
        }
    };

    // ----------------------------------------------------------
    // Performance HUD - a tiny engine-side overlay updated via the
    // shared engineFrameCallbacks hook (see engine/animate-loop.js).
    // ----------------------------------------------------------
    const buildSettingsHud = () => {
        if (window.smSettingsHud) return window.smSettingsHud;

        const hud = document.createElement('div');
        hud.id = 'sm-settings-hud';
        hud.style.cssText = [
            'position:absolute',
            'left:12px',
            'bottom:12px',
            'z-index:9999',
            'background:rgba(10,12,16,0.72)',
            'color:#d7e3f4',
            'font:11px/1.5 Consolas,monospace',
            'padding:6px 10px',
            'border-radius:6px',
            'pointer-events:none',
            'display:none'
        ].join(';');
        document.body.appendChild(hud);
        window.smSettingsHud = hud;

        if (typeof window.engineFrameCallbacks === 'undefined') window.engineFrameCallbacks = [];

        if (!window.__smHudFrameHook) {
            window.__smHudFrameCount = 0;
            window.__smHudLastSample = performance.now();
            window.__smHudFrameHook = () => {
                if (hud.style.display === 'none') return;
                window.__smHudFrameCount++;
                const now = performance.now();
                if (now - window.__smHudLastSample < 500) return;

                const fps = Math.round((window.__smHudFrameCount * 1000) / (now - window.__smHudLastSample));
                window.__smHudFrameCount = 0;
                window.__smHudLastSample = now;

                const renderer = helpers.renderer();
                const info = renderer ? renderer.info || {} : {};
                const calls = info.render ? info.render.calls : 0;
                const tris = info.render ? info.render.triangles : 0;

                hud.textContent =
                    'FPS ' + fps +
                    '  |  Calls ' + calls +
                    '  |  Tris ' + Number(tris).toLocaleString();
            };
            window.engineFrameCallbacks.push(window.__smHudFrameHook);
        }
        return hud;
    };

    const togglePerformanceHud = (enabled) => {
        const hud = buildSettingsHud();
        hud.style.display = enabled ? 'block' : 'none';
    };

    // ----------------------------------------------------------
    // Registration helper
    // ----------------------------------------------------------
    const def = (id, type, group, defValue) => store.define(id, { type, group, default: defValue });

    // ==========================================================
    // INTERFACE (Display / Editors / Status bar / Language)
    // ==========================================================
    def('setting-resolution-scale', 'number', 'interface', 1);
    store.registerApplier('setting-resolution-scale', (value) => {
        const renderer = helpers.renderer();
        if (!renderer) return;
        const dpr = window.devicePixelRatio || 1;
        renderer.setPixelRatio(Math.min(dpr * Number(value), 2));
    });

    def('setting-line-width', 'string', 'interface', 'default');
    def('setting-splash-screen', 'boolean', 'interface', true);
    def('setting-developer-extras', 'boolean', 'interface', false);
    def('setting-user-tooltips', 'boolean', 'interface', true);
    def('setting-region-overlap', 'boolean', 'interface', true);
    def('setting-navigation-controls', 'boolean', 'interface', true);
    def('setting-header-position', 'string', 'interface', 'keep-existing');
    def('setting-scene-statistics', 'boolean', 'interface', false);
    def('setting-system-memory', 'boolean', 'interface', false);
    def('setting-video-memory', 'boolean', 'interface', false);
    def('setting-version-info', 'boolean', 'interface', true);
    def('setting-language', 'string', 'interface', 'en');

    // ==========================================================
    // VIEWPORT
    // ==========================================================
    def('setting-grid-visible', 'boolean', 'viewport', true);
    store.registerApplier('setting-grid-visible', (value) => {
        const workspaceMode = String(
            window.workspaceManager?.currentMode ||
            localStorage.getItem('sm_workspace_mode') ||
            'FILM'
        ).toUpperCase();
        const visible = !!value && workspaceMode === 'FILM';
        const grids = helpers.gridObjects();
        grids.forEach(grid => {
            grid.visible = visible;
            grid.traverse?.((child) => { child.visible = visible; });
        });
        const scene = helpers.scene();
        if (scene) {
            const gridHelper = scene.getObjectByName('advancedGrid');
            if (gridHelper) {
                gridHelper.visible = visible;
                gridHelper.traverse?.((child) => { child.visible = visible; });
            }
        }
    });

    def('setting-gizmos-visible', 'boolean', 'viewport', true);
    store.registerApplier('setting-gizmos-visible', (value) => {
        const gizmos = helpers.gizmos();
        if (gizmos) gizmos.visible = !!value;
    });

    def('setting-pixel-ratio', 'number', 'viewport', 1);
    store.registerApplier('setting-pixel-ratio', (value) => {
        const renderer = helpers.renderer();
        if (renderer) renderer.setPixelRatio(Math.min(Number(value), 2));
    });

    def('setting-shadows', 'boolean', 'viewport', true);
    store.registerApplier('setting-shadows', (value) => {
        const renderer = helpers.renderer();
        if (renderer && renderer.shadowMap) renderer.shadowMap.enabled = !!value;
        const sun = helpers.sunLight();
        if (sun && sun.castShadow !== undefined) {
            sun.castShadow = !!value;
            if (sun.shadow) sun.shadow.needsUpdate = true;
        }
    });

    def('setting-shadow-map-size', 'number', 'viewport', 2048);
    store.registerApplier('setting-shadow-map-size', (value) => {
        const sun = helpers.sunLight();
        if (!sun || !sun.shadow) return;
        const size = Math.max(1024, Math.min(4096, Number(value) || 2048));
        sun.shadow.map?.dispose?.();
        sun.shadow.map = null;
        sun.shadow.mapSize.set(size, size);
        sun.shadow.needsUpdate = true;
        if (window.renderer?.shadowMap) {
            window.renderer.shadowMap.enabled = true;
            window.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
            window.renderer.shadowMap.needsUpdate = true;
        }
    });

    def('setting-antialiasing', 'string', 'viewport', 'msaa');
    def('setting-wireframe', 'boolean', 'viewport', false);
    store.registerApplier('setting-wireframe', (value) => {
        helpers.materials().forEach(m => { m.wireframe = !!value; });
    });

    def('setting-backface-culling', 'boolean', 'viewport', true);
    store.registerApplier('setting-backface-culling', (value) => {
        const side = value ? THREE.FrontSide : THREE.DoubleSide;
        helpers.materials().forEach(m => {
            if (m.side !== undefined) m.side = side;
        });
    });

    def('setting-background-color', 'string', 'viewport', '#333538');
    store.registerApplier('setting-background-color', (value) => {
        setSceneBackground(value);
    });

    def('setting-stats-overlay', 'boolean', 'viewport', false);
    store.registerApplier('setting-stats-overlay', (value) => {
        togglePerformanceHud(!!value);
    });

    // ------------------------- Camera -------------------------
    def('setting-camera-fov', 'number', 'viewport', 50);
    store.registerApplier('setting-camera-fov', (value) => {
        const camera = helpers.camera();
        if (!camera) return;
        camera.fov = Number(value);
        camera.updateProjectionMatrix();
    });

    def('setting-camera-near', 'number', 'viewport', 0.1);
    store.registerApplier('setting-camera-near', (value) => {
        const camera = helpers.camera();
        if (!camera) return;
        camera.near = Number(value);
        camera.updateProjectionMatrix();
    });

    def('setting-camera-far', 'number', 'viewport', 1000);
    store.registerApplier('setting-camera-far', (value) => {
        const camera = helpers.camera();
        if (!camera) return;
        camera.far = Number(value);
        camera.updateProjectionMatrix();
    });

    def('setting-fog-enabled', 'boolean', 'viewport', false);
    store.registerApplier('setting-fog-enabled', (value) => {
        const scene = helpers.scene();
        if (!scene) return;
        if (value) {
            const bg = scene.background;
            const color = (bg && bg.isColor) ? bg.getHex() : 0x333538;
            scene.fog = new THREE.Fog(color, 10, 500);
        } else {
            scene.fog = null;
        }
    });

    // ==========================================================
    // LIGHTING
    // ==========================================================
    def('setting-ambient-intensity', 'number', 'lighting', 0.07);
    store.registerApplier('setting-ambient-intensity', (value) => {
        if (!isConfigured('setting-ambient-intensity')) return;
        const amount = Number(value);
        const lights = helpers.workspaceLights();
        lights.forEach((light) => {
            if (light.isAmbientLight) light.intensity = amount;
        });
        if (lights.length === 0 && window.ambientLight) {
            window.ambientLight.intensity = amount;
        }
    });

    def('setting-directional-intensity', 'number', 'lighting', 1.8);
    store.registerApplier('setting-directional-intensity', (value) => {
        migrateLegacyHDRLightingOnce();

        if (
            !isConfigured(
                'setting-directional-intensity'
            )
        ) {
            return;
        }

        const configuredValue =
            Number(
                store.get(
                    'setting-directional-intensity'
                )
            );

        const amount =
            Number.isFinite(
                configuredValue
            )
                ? Math.max(
                    0,
                    configuredValue
                )
                : 0.82;

        /*
         * IMPORTANT:
         * Update the Sun Rig source-of-truth, not only light.intensity.
         * Otherwise the next gizmo/time-of-day update would restore the
         * controller's old intensity.
         */
        if (
            window.smSunController
                ?.setIntensity
        ) {
            window.smSunController
                .setIntensity(
                    amount
                );

            return;
        }

        if (
            window.smHDRSkySystem
                ?.setSun
        ) {
            window.smHDRSkySystem
                .setSun({
                    intensity:
                        amount
                });

            return;
        }

        const lights =
            helpers.workspaceLights();

        lights.forEach(
            light => {
                if (
                    light
                        .isDirectionalLight
                ) {
                    light.intensity =
                        amount;
                }
            }
        );

        if (
            lights.length === 0 &&
            helpers.sunLight()
        ) {
            helpers.sunLight()
                .intensity =
                amount;
        }
    });

    def('setting-tone-mapping', 'string', 'lighting', 'aces-filmic');
    store.registerApplier('setting-tone-mapping', (value) => {
        const renderer = helpers.renderer();
        if (!renderer || typeof THREE === 'undefined') return;
        const map = {
            'none': THREE.NoToneMapping,
            'linear': THREE.LinearToneMapping,
            'reinhard': THREE.ReinhardToneMapping,
            'cineon': THREE.CineonToneMapping,
            'aces-filmic': THREE.ACESFilmicToneMapping
        };
        renderer.toneMapping = map[value] || THREE.ACESFilmicToneMapping;
        window.smExposureSystem?.setSettings?.({
            aces: value === 'aces-filmic'
        }, true);
    });

    def('setting-exposure', 'number', 'lighting', 0.72);
    store.registerApplier('setting-exposure', (value) => {
        if (!isConfigured('setting-exposure')) return;

        const exposure =
            Math.max(
                0.05,
                Number(value) || 0.72
            );

        window.smExposureSystem?.setSettings?.({
            manualExposure: exposure
        }, true);

        if (window.smExposureSystem?.settings?.autoExposure) return;

        if (
            window.smHDRSkySystem
                ?.setExposure
        ) {
            window.smHDRSkySystem
                .setExposure(
                    exposure
                );

            return;
        }

        const renderer =
            helpers.renderer();

        if (renderer) {
            renderer.toneMappingExposure =
                exposure;
        }
    });

    const setExposureSettings = values => {
        window.smExposureSystem?.setSettings?.(values, true);
    };

    def('setting-auto-exposure', 'boolean', 'lighting', true);
    store.registerApplier('setting-auto-exposure', value => {
        setExposureSettings({ autoExposure: !!value });
    });

    def('setting-exposure-compensation', 'number', 'lighting', 0);
    store.registerApplier('setting-exposure-compensation', value => {
        setExposureSettings({ compensation: Number(value) || 0 });
    });

    def('setting-exposure-min', 'number', 'lighting', 0.32);
    store.registerApplier('setting-exposure-min', value => {
        setExposureSettings({ minExposure: Math.max(0.05, Number(value) || 0.32) });
    });

    def('setting-exposure-max', 'number', 'lighting', 3.2);
    store.registerApplier('setting-exposure-max', value => {
        setExposureSettings({ maxExposure: Math.max(0.5, Number(value) || 3.2) });
    });

    def('setting-exposure-speed-bright', 'number', 'lighting', 3.5);
    store.registerApplier('setting-exposure-speed-bright', value => {
        setExposureSettings({ speedDarkToLight: Math.max(0.1, Number(value) || 3.5) });
    });

    def('setting-exposure-speed-dark', 'number', 'lighting', 1.15);
    store.registerApplier('setting-exposure-speed-dark', value => {
        setExposureSettings({ speedLightToDark: Math.max(0.1, Number(value) || 1.15) });
    });

    def('setting-exposure-center-weight', 'number', 'lighting', 0.78);
    store.registerApplier('setting-exposure-center-weight', value => {
        setExposureSettings({ centerWeight: THREE.MathUtils.clamp(Number(value), 0, 1) });
    });

    def('setting-local-exposure', 'number', 'lighting', 0.1);
    store.registerApplier('setting-local-exposure', value => {
        setExposureSettings({ localExposure: THREE.MathUtils.clamp(Number(value), 0, 0.5) });
    });

    def('setting-exposure-debug', 'boolean', 'lighting', false);
    store.registerApplier('setting-exposure-debug', value => {
        window.initSMRenderDebugger?.({
            renderer: helpers.renderer(),
            scene: helpers.scene(),
            smRenderer: window.smRenderer
        })?.setEnabled?.(!!value);
        setExposureSettings({ debug: !!value });
    });

    def('setting-environment-map', 'boolean', 'lighting', true);
    store.registerApplier('setting-environment-map', (value) => {
        window.smHDRIEnvironmentEnabled = !!value;
        const scene = helpers.scene();
        if (!scene) return;
        if (value) {
            reapplyActiveHDRI();
            return;
        }
        // Keep the imported HDRI as the visible skybox, but stop using it
        // for material image-based lighting until the user enables IBL.
        scene.environment = null;
        const sky = window.skyLightingSystem;
        if (sky?._externalEnvTexture) {
            sky._externalEnv = false;
            sky._externalEnvHideSkyVisuals = false;
            sky.update?.(0);
        }
    });

    def('setting-hdri-intensity', 'number', 'lighting', 0.48);
    store.registerApplier('setting-hdri-intensity', (value) => {
        const amount =
            Math.max(
                0,
                Number(value) || 0
            );

        if (
            window.smHDRSkySystem
                ?.setEnvironmentIntensity
        ) {
            window.smHDRSkySystem
                .setEnvironmentIntensity(
                    amount
                );
        }

        if (
            window.smActiveHDRI
        ) {
            window.smActiveHDRI
                .intensity =
                amount;
        }

        if (
            window.smHDRIEnvironmentEnabled ===
            false
        ) {
            return;
        }

        reapplyActiveHDRI();
    });

    // ------------------------- HDR Sky / Sun Rig -------------------------
    // The engine now uses a local .hdr file as visible sky/background.
    // No procedural sky/cloud/weather shader is assumed here.

    def('setting-sky-visible', 'boolean', 'lighting', true);
    store.registerApplier('setting-sky-visible', (value) => {
        if (!isConfigured('setting-sky-visible')) return;

        const scene = helpers.scene();
        const hdr = window.smHDRSkySystem;

        if (!scene || !hdr) return;

        scene.background =
            value
                ? hdr.hdrTexture
                : null;
    });

    def('setting-time-of-day', 'number', 'lighting', 14);
    store.registerApplier('setting-time-of-day', (value) => {
        window.smSunTimeOfDay
            ?.setTime?.(
                Number(value)
            );
    });

    // Kept for Settings UI backwards compatibility.
    // A fixed HDR image has baked weather/atmosphere.
    def('setting-weather', 'string', 'lighting', 'hdr-baked');
    def('setting-weather-intensity', 'number', 'lighting', 1);

    def('setting-sun-elevation', 'number', 'lighting', 38);
    store.registerApplier('setting-sun-elevation', (value) => {
        window.smSunController
            ?.setElevation?.(
                Number(value)
            );
    });

    def('setting-sun-distance', 'number', 'lighting', 110);
    store.registerApplier('setting-sun-distance', (value) => {
        window.smSunController
            ?.setDistance?.(
                Number(value)
            );
    });

    const HDR_SHADOW_PRESETS = {
        low: {
            mapSize: 1024,
            area: 36,
            near: 0.5,
            far: 180,
            bias: -0.00008,
            normalBias: 0.002,
            radius: 0.8
        },
        high: {
            mapSize: 2048,
            area: 48,
            near: 0.5,
            far: 260,
            bias: -0.00005,
            normalBias: 0.0015,
            radius: 1.0
        },
        ultra: {
            mapSize: 4096,
            area: 58,
            near: 0.5,
            far: 300,
            bias: -0.00004,
            normalBias: 0.00125,
            radius: 1.0
        },
        cinematic: {
            mapSize: 4096,
            area: 64,
            near: 0.5,
            far: 320,
            bias: -0.000035,
            normalBias: 0.001,
            radius: 1.0
        }
    };

    def('setting-shadow-preset', 'string', 'lighting', 'high');
    store.registerApplier('setting-shadow-preset', (value) => {
        const preset =
            HDR_SHADOW_PRESETS[value] ||
            HDR_SHADOW_PRESETS.high;

        window.smSunController
            ?.configureShadows?.(
                preset
            );
    });

    def('setting-sky-auto-cycle', 'boolean', 'lighting', false);
    store.registerApplier('setting-sky-auto-cycle', (value) => {
        if (value) {
            window.smSunTimeOfDay
                ?.play?.();
        } else {
            window.smSunTimeOfDay
                ?.pause?.();
        }
    });

    // Legacy numeric control retained as cycle-speed compatibility.
    def('setting-sky-day-speed', 'number', 'lighting', 0.003);
    store.registerApplier('setting-sky-day-speed', (value) => {
        const speed =
            Math.max(
                0.0001,
                Number(value) || 0.003
            );

        /*
         * Old value 0.003 maps to roughly a four-minute full day.
         */
        const duration =
            THREE.MathUtils.clamp(
                0.72 / speed,
                20,
                3600
            );

        window.smSunTimeOfDay
            ?.setCycleDuration?.(
                duration
            );
    });

    // Legacy procedural-atmosphere controls: safe compatibility IDs.
    def('setting-atmosphere-turbidity', 'number', 'lighting', 2.8);
    def('setting-atmosphere-rayleigh', 'number', 'lighting', 1.05);
    def('setting-atmosphere-mie-coefficient', 'number', 'lighting', 0.005);
    def('setting-atmosphere-mie-directional-g', 'number', 'lighting', 0.83);

    def('setting-sky-exposure', 'number', 'lighting', 0.72);
    store.registerApplier('setting-sky-exposure', (value) => {
        window.smHDRSkySystem
            ?.setExposure?.(
                Number(value)
            );
    });

    def('setting-sky-shadow-debug', 'boolean', 'lighting', false);

    def('setting-sky-refresh-shadows', 'boolean', 'lighting', false);
    store.registerApplier('setting-sky-refresh-shadows', (value) => {
        if (!value) return;

        const sun =
            helpers.sunLight();

        if (sun?.shadow) {
            sun.shadow.needsUpdate =
                true;
        }

        if (
            helpers.renderer()
                ?.shadowMap
        ) {
            helpers.renderer()
                .shadowMap
                .needsUpdate =
                true;
        }

        store.set(
            'setting-sky-refresh-shadows',
            false
        );
    });

    def('setting-sky-sun-max', 'number', 'lighting', 0.82);
    store.registerApplier('setting-sky-sun-max', (value) => {
        if (!isConfigured('setting-sky-sun-max')) return;

        window.smSunController
            ?.setIntensity?.(
                Number(value)
            );
    });

    def('setting-sky-hemi-day', 'number', 'lighting', 0.07);
    store.registerApplier('setting-sky-hemi-day', (value) => {
        if (!isConfigured('setting-sky-hemi-day')) return;

        const hdr =
            window.smHDRSkySystem;

        if (!hdr?.hemiLight) return;

        const amount =
            Math.max(
                0,
                Number(value) || 0
            );

        hdr.hemiLight.intensity =
            amount;

        if (hdr.config?.hemisphere) {
            hdr.config.hemisphere.intensity =
                amount;
        }
    });

    // No separate ambient or moon light in HDR-only mode.
    def('setting-sky-ambient', 'number', 'lighting', 0);
    def('setting-sky-moon-max', 'number', 'lighting', 0);

    // Cloud/weather controls remain registered so the old Settings UI does
    // not break, but a local HDR has baked clouds/weather.
    def('setting-cloud-coverage', 'number', 'lighting', 0);
    def('setting-cloud-opacity', 'number', 'lighting', 1);
    def('setting-cloud-speed', 'number', 'lighting', 0);
    def('setting-cloud-height', 'number', 'lighting', 0);
    def('setting-weather-storm', 'number', 'lighting', 0);
    def('setting-weather-rain', 'number', 'lighting', 0);
    def('setting-weather-wind', 'number', 'lighting', 0);

    const HDR_SCENE_PRESETS = {
        'clear-noon': 'midday',
        'golden-hour': 'goldenHour',
        'sunrise': 'dawn',
        'overcast-rain': 'afternoon',
        'thunderstorm': 'blueHour',
        'moonlit-night': 'night',
        'cinematic-dusk': 'sunset'
    };

    def('setting-sky-scene-preset', 'string', 'lighting', 'none');
    store.registerApplier('setting-sky-scene-preset', (value) => {
        if (!value || value === 'none') return;

        const preset =
            HDR_SCENE_PRESETS[value];

        if (preset) {
            window.SMSunPresets
                ?.apply?.(
                    preset
                );
        }

        store.set(
            'setting-sky-scene-preset',
            'none'
        );
    });

    // ------------------------- Lumen GI -------------------------
    const getLumen = () => window.lumenSystem || null;
    const resizeLumenTargets = (lumen) => {
        if (!lumen || !window.renderer) return;
        const size = new THREE.Vector2();
        window.renderer.getDrawingBufferSize(size);
        lumen.resize?.(size.x, size.y);
    };
    const rebuildLumenProbes = (lumen) => {
        if (!lumen) return;
        lumen.probeGrid?.create?.();
        lumen.probeAtlas?.create?.();
        lumen.radianceCache?.invalidateAll?.();
    };
    const rebuildLumenVoxelScene = (lumen) => {
        if (!lumen?.voxelScene) return;
        lumen.voxelScene.createTexture?.();
        lumen.voxelScene.markAllDirty?.();
    };
    def('setting-lumen-enabled', 'boolean', 'lighting', true);
    store.registerApplier('setting-lumen-enabled', (value) => {
        const lumen = getLumen();
        if (!lumen) return;
        lumen.setEnabled?.(!!value);
    });
    def('setting-lumen-gbuffer-enabled', 'boolean', 'lighting', true);
    store.registerApplier('setting-lumen-gbuffer-enabled', (value) => {
        const lumen = getLumen();
        if (lumen?.gBuffer) lumen.gBuffer.enabled = !!value;
    });
    def('setting-lumen-ssgi-enabled', 'boolean', 'lighting', true);
    store.registerApplier('setting-lumen-ssgi-enabled', (value) => {
        const lumen = getLumen();
        if (lumen?.screenGI) lumen.screenGI.enabled = !!value;
    });
    def('setting-lumen-gi-intensity', 'number', 'lighting', 1);
    store.registerApplier('setting-lumen-gi-intensity', (value) => {
        const lumen = getLumen();
        if (lumen?.config) lumen.config.giIntensity = Math.max(0, Number(value));
    });
    def('setting-lumen-gi-resolution-scale', 'number', 'lighting', 0.25);
    store.registerApplier('setting-lumen-gi-resolution-scale', (value) => {
        const lumen = getLumen();
        if (!lumen?.config) return;
        lumen.config.giResolutionScale = THREE.MathUtils.clamp(Number(value), 0.1, 1);
        resizeLumenTargets(lumen);
    });
    def('setting-lumen-gi-rays', 'number', 'lighting', 1);
    store.registerApplier('setting-lumen-gi-rays', (value) => {
        const lumen = getLumen();
        if (lumen?.config) lumen.config.giRayCount = THREE.MathUtils.clamp(Math.round(Number(value)), 1, 16);
    });
    def('setting-lumen-gi-max-steps', 'number', 'lighting', 12);
    store.registerApplier('setting-lumen-gi-max-steps', (value) => {
        const lumen = getLumen();
        if (lumen?.config) lumen.config.giMaxSteps = THREE.MathUtils.clamp(Math.round(Number(value)), 4, 96);
    });
    def('setting-lumen-gi-thickness', 'number', 'lighting', 0.2);
    store.registerApplier('setting-lumen-gi-thickness', (value) => {
        const lumen = getLumen();
        if (lumen?.config) lumen.config.giThickness = THREE.MathUtils.clamp(Number(value), 0.01, 2);
    });
    def('setting-lumen-emissive-boost', 'number', 'lighting', 1.5);
    store.registerApplier('setting-lumen-emissive-boost', (value) => {
        const lumen = getLumen();
        if (!lumen?.config) return;
        lumen.config.emissiveBoost = Math.max(0, Number(value));
        lumen.emissiveInjection?.scan?.();
        lumen.radianceCache?.invalidateAll?.();
    });
    def('setting-lumen-probe-grid-size', 'number', 'lighting', 12);
    store.registerApplier('setting-lumen-probe-grid-size', (value) => {
        const lumen = getLumen();
        if (!lumen?.config?.probeGrid) return;
        const size = THREE.MathUtils.clamp(Math.round(Number(value)), 4, 24);
        lumen.config.probeGrid.set(size, Math.max(2, Math.ceil(size * 0.5)), size);
        rebuildLumenProbes(lumen);
    });
    def('setting-lumen-probe-spacing', 'number', 'lighting', 3);
    store.registerApplier('setting-lumen-probe-spacing', (value) => {
        const lumen = getLumen();
        if (!lumen?.config) return;
        lumen.config.probeSpacing = THREE.MathUtils.clamp(Number(value), 0.5, 20);
        rebuildLumenProbes(lumen);
    });
    def('setting-lumen-probe-update-budget', 'number', 'lighting', 2);
    store.registerApplier('setting-lumen-probe-update-budget', (value) => {
        const lumen = getLumen();
        if (lumen?.config) lumen.config.probeUpdateBudget = THREE.MathUtils.clamp(Math.round(Number(value)), 0, 64);
    });
    def('setting-lumen-probe-follow-camera', 'boolean', 'lighting', true);
    store.registerApplier('setting-lumen-probe-follow-camera', (value) => {
        const lumen = getLumen();
        if (lumen?.config) lumen.config.probeFollowCamera = !!value;
    });
    def('setting-lumen-probe-fallback', 'boolean', 'lighting', true);
    store.registerApplier('setting-lumen-probe-fallback', (value) => {
        const lumen = getLumen();
        if (lumen?.probeTrace) lumen.probeTrace.enabled = !!value;
    });
    def('setting-lumen-indirect-diffuse', 'boolean', 'lighting', true);
    store.registerApplier('setting-lumen-indirect-diffuse', (value) => {
        const lumen = getLumen();
        if (lumen?.indirectDiffuse) lumen.indirectDiffuse.enabled = !!value;
    });
    def('setting-lumen-surface-cache', 'boolean', 'lighting', true);
    store.registerApplier('setting-lumen-surface-cache', (value) => {
        const lumen = getLumen();
        if (!lumen?.config) return;
        lumen.config.surfaceCacheEnabled = !!value;
        if (lumen.surfaceCache) lumen.surfaceCache.enabled = !!value;
    });
    def('setting-lumen-surface-card-budget', 'number', 'lighting', 1);
    store.registerApplier('setting-lumen-surface-card-budget', (value) => {
        const lumen = getLumen();
        if (lumen?.config) lumen.config.surfaceCardBudget = THREE.MathUtils.clamp(Math.round(Number(value)), 0, 32);
    });
    def('setting-lumen-voxel-enabled', 'boolean', 'lighting', false);
    store.registerApplier('setting-lumen-voxel-enabled', (value) => {
        const lumen = getLumen();
        if (!lumen?.config) return;
        lumen.config.voxelEnabled = !!value;
        if (lumen.voxelScene) lumen.voxelScene.enabled = !!value;
    });
    def('setting-lumen-voxel-resolution', 'number', 'lighting', 32);
    store.registerApplier('setting-lumen-voxel-resolution', (value) => {
        const lumen = getLumen();
        if (!lumen?.config) return;
        const allowed = [16, 32, 64, 96, 128];
        const numeric = Math.round(Number(value));
        lumen.config.voxelResolution = allowed.reduce((best, current) => Math.abs(current - numeric) < Math.abs(best - numeric) ? current : best, allowed[0]);
        rebuildLumenVoxelScene(lumen);
    });
    def('setting-lumen-voxel-world-size', 'number', 'lighting', 96);
    store.registerApplier('setting-lumen-voxel-world-size', (value) => {
        const lumen = getLumen();
        if (!lumen?.config) return;
        lumen.config.voxelWorldSize = THREE.MathUtils.clamp(Number(value), 16, 512);
        if (lumen.voxelScene) {
            lumen.voxelScene.worldSize = lumen.config.voxelWorldSize;
            lumen.voxelScene.recenter?.(true);
        }
    });
    def('setting-lumen-voxel-update-budget', 'number', 'lighting', 1);
    store.registerApplier('setting-lumen-voxel-update-budget', (value) => {
        const lumen = getLumen();
        if (lumen?.config) lumen.config.voxelUpdateBudget = THREE.MathUtils.clamp(Math.round(Number(value)), 0, 32);
    });
    def('setting-lumen-rebuild-cache', 'boolean', 'lighting', false);
    store.registerApplier('setting-lumen-rebuild-cache', (value) => {
        if (!value) return;
        const lumen = getLumen();
        if (lumen) {
            lumen.objectRegistry?.initialScan?.();
            lumen.emissiveInjection?.scan?.();
            rebuildLumenProbes(lumen);
            lumen.surfaceCache?.initialScan?.();
            lumen.voxelScene?.markAllDirty?.();
        }
        store.set('setting-lumen-rebuild-cache', false);
    });

    // ==========================================================
    // EDITING
    // ==========================================================
    def('setting-transform-space', 'string', 'editing', 'world');
    store.registerApplier('setting-transform-space', (value) => {
        const gizmos = helpers.gizmos();
        if (gizmos && gizmos.setSpace) gizmos.setSpace(value);
    });

    def('setting-gizmo-size', 'number', 'editing', 1);
    store.registerApplier('setting-gizmo-size', (value) => {
        const gizmos = helpers.gizmos();
        if (gizmos && gizmos.setSize) gizmos.setSize(Number(value));
    });

    def('setting-snap-enabled', 'boolean', 'editing', false);
    store.registerApplier('setting-snap-enabled', (value) => {
        const gizmos = helpers.gizmos();
        if (!gizmos) return;
        if (!value) {
            gizmos.setTranslationSnap(null);
            gizmos.setRotationSnap(null);
            gizmos.setScaleSnap(null);
            return;
        }
        const t = Number(store.get('setting-snap-translate'));
        const r = Number(store.get('setting-snap-rotate'));
        const s = Number(store.get('setting-snap-scale'));
        gizmos.setTranslationSnap(t);
        gizmos.setRotationSnap(THREE.MathUtils.degToRad(r));
        gizmos.setScaleSnap(s);
    });

    def('setting-snap-translate', 'number', 'editing', 0.5);
    store.registerApplier('setting-snap-translate', (value) => {
        if (store.get('setting-snap-enabled')) {
            const gizmos = helpers.gizmos();
            if (gizmos) gizmos.setTranslationSnap(Number(value));
        }
    });

    def('setting-snap-rotate', 'number', 'editing', 15);
    store.registerApplier('setting-snap-rotate', (value) => {
        if (store.get('setting-snap-enabled')) {
            const gizmos = helpers.gizmos();
            if (gizmos) gizmos.setRotationSnap(THREE.MathUtils.degToRad(Number(value)));
        }
    });

    def('setting-snap-scale', 'number', 'editing', 0.1);
    store.registerApplier('setting-snap-scale', (value) => {
        if (store.get('setting-snap-enabled')) {
            const gizmos = helpers.gizmos();
            if (gizmos) gizmos.setScaleSnap(Number(value));
        }
    });

    def('setting-undo-steps', 'number', 'editing', 100);
    def('setting-double-click-focus', 'boolean', 'editing', true);

    // ==========================================================
    // ANIMATION
    // ==========================================================
    def('setting-playback-fps', 'number', 'animation', 30);
    def('setting-loop-mode', 'string', 'animation', 'loop');
    store.registerApplier('setting-loop-mode', (value) => {
        if (window.SMTimeline) {
            window.loopEnabled = value !== 'once';
            if (value === 'ping-pong' && window.SMTimeline.setPlaybackMode) {
                window.SMTimeline.setPlaybackMode('ping-pong');
            }
        }
    });

    def('setting-interpolation', 'string', 'animation', 'smooth');
    def('setting-onion-skinning', 'boolean', 'animation', false);
    def('setting-root-motion', 'boolean', 'animation', true);
    def('setting-mm-trajectory-points', 'number', 'animation', 4);
    def('setting-mm-search-interval', 'number', 'animation', 100);
    def('setting-mm-inertialization', 'boolean', 'animation', true);
    def('setting-mm-debug-overlay', 'boolean', 'animation', false);

    // ==========================================================
    // THEMES
    // ==========================================================
    def('setting-theme', 'string', 'themes', 'dark');
    store.registerApplier('setting-theme', (value) => {
        document.documentElement.dataset.editorTheme = value;
    });

    def('setting-accent-color', 'string', 'themes', '#4e78b6');
    store.registerApplier('setting-accent-color', (value) => {
        document.documentElement.style.setProperty('--settings-accent', value);
    });

    // ==========================================================
    // INPUT
    // ==========================================================
    def('setting-mouse-sensitivity', 'number', 'input', 1);
    store.registerApplier('setting-mouse-sensitivity', (value) => {
        const controls = helpers.controls();
        if (controls) controls.rotateSpeed = 0.35 * Number(value);
    });

    def('setting-invert-y', 'boolean', 'input', false);
    def('setting-invert-x', 'boolean', 'input', false);
    def('setting-pan-speed', 'number', 'input', 1);
    store.registerApplier('setting-pan-speed', (value) => {
        const controls = helpers.controls();
        if (controls) controls.panSpeed = 0.75 * Number(value);
    });

    def('setting-zoom-speed', 'number', 'input', 1);
    store.registerApplier('setting-zoom-speed', (value) => {
        const controls = helpers.controls();
        if (controls) controls.zoomSpeed = 0.75 * Number(value);
    });

    def('setting-scroll-zoom', 'boolean', 'input', true);
    store.registerApplier('setting-scroll-zoom', (value) => {
        const controls = helpers.controls();
        if (controls) controls.enableZoom = !!value;
    });

    // ==========================================================
    // NAVIGATION
    // ==========================================================
    def('setting-nav-mode', 'string', 'navigation', 'orbit');
    store.registerApplier('setting-nav-mode', (value) => {
        const controls = helpers.controls();
        if (controls) controls.enabled = value === 'orbit';
    });

    def('setting-fly-speed', 'number', 'navigation', 5);
    def('setting-walk-speed', 'number', 'navigation', 3);
    def('setting-camera-collision', 'boolean', 'navigation', false);
    def('setting-orbit-auto-rotate', 'boolean', 'navigation', false);
    store.registerApplier('setting-orbit-auto-rotate', (value) => {
        const controls = helpers.controls();
        if (controls) controls.autoRotate = !!value;
    });

    // ==========================================================
    // SYSTEM
    // ==========================================================
    def('setting-dynamic-resolution', 'boolean', 'system', true);
    store.registerApplier('setting-dynamic-resolution', (value) => {
        if (window.dynamicResolutionManager && typeof window.dynamicResolutionManager.setEnabled === 'function') {
            window.dynamicResolutionManager.setEnabled(!!value);
        }
        if (window.performanceManager) {
            window.performanceManager.options.targetFPS = window.performanceManager.options.targetFPS || 58;
        }
    });

    // window.performanceManager (engine/optimization/PerformanceManager.js)
    // reads these every frame when adjusting currentResolutionScale.
    def('setting-dynamic-res-min-scale', 'number', 'system', 0.7);
    store.registerApplier('setting-dynamic-res-min-scale', (value) => {
        if (window.performanceManager) {
            window.performanceManager.options.minResolutionScale = Number(value);
        }
    });

    def('setting-dynamic-res-max-scale', 'number', 'system', 1);
    store.registerApplier('setting-dynamic-res-max-scale', (value) => {
        if (window.performanceManager) {
            window.performanceManager.options.maxResolutionScale = Number(value);
        }
    });

    def('setting-fps-limit', 'number', 'system', 60);
    store.registerApplier('setting-fps-limit', (value) => {
        window.smFpsLimit = Number(value);
        if (window.performanceManager) {
            window.performanceManager.options.targetFPS = window.smFpsLimit > 0 ? window.smFpsLimit : 58;
        }
    });

    def('setting-performance-hud', 'boolean', 'system', false);
    store.registerApplier('setting-performance-hud', (value) => {
        togglePerformanceHud(!!value);
    });

    def('setting-vsync', 'boolean', 'system', true);

    def('setting-texture-quality', 'string', 'system', 'high');
    store.registerApplier('setting-texture-quality', (value) => {
        if (window.smRender && typeof window.smRender.applyQualityPreset === 'function') {
            window.smRender.applyQualityPreset(value);
        }
        if (window.SMViewportShading && typeof window.SMViewportShading.preview === 'function') {
            window.SMViewportShading.preview();
        }
    });

    def('setting-anisotropic-filtering', 'number', 'system', 8);
    store.registerApplier('setting-anisotropic-filtering', (value) => {
        const max = helpers.renderer() && helpers.renderer().capabilities
            ? helpers.renderer().capabilities.getMaxAnisotropy()
            : 16;
        const aniso = Math.min(Number(value), max || 16);
        helpers.materials().forEach(m => {
            if (m.map) m.map.anisotropy = aniso;
        });
    });

    def('setting-lod-bias', 'number', 'system', 0);
    def('setting-worker-threads', 'number', 'system', 4);
    def('setting-async-asset-loading', 'boolean', 'system', true);

    // ==========================================================
    // SAVE & LOAD
    // ==========================================================
    def('setting-auto-save', 'boolean', 'save-load', true);
    def('setting-auto-save-interval', 'number', 'save-load', 5);
    store.registerApplier('setting-auto-save-interval', (value) => {
        if (window.persistenceManager) {
            window.persistenceManager.autoSaveInterval = Number(value) * 60000;
        }
    });

    // Placeholder sections (Add-ons / Keymap / File Paths) are
    // intentionally not registered: they have no controls yet.
})();
