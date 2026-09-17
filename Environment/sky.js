// ============================================================================
// Environment/sky.js
// SM Engine — UE5-Grade HDRI & Physical Lighting System
// ============================================================================

(function () {
    'use strict';

    // Global outdoor HDR IBL is OFF by default until local reflection probes
    // are authoritative. The HDR texture can still be used as scene.background.
    if (typeof window.smGlobalIBLAllowed !== 'boolean') {
        window.smGlobalIBLAllowed = false;
    }

    const LIGHTING_PROFILE_VERSION = 3;

    const DEFAULT_CONFIG = {
        hdrPath: 'assets/environment/hdri/qwantani_dusk_2_puresky_4k.hdr',

        // UE5 Luminance & Exposure Tuning
        backgroundIntensity: 1.0,
        // Background sky is visual only while the editor has no local
        // reflection probes.  A small value is retained for probe-ready scenes.
        environmentIntensity: 0.0,
        exposure: 1.0,

        // UE5 Physical Directional Sun Light
        sun: {
            enabled: true,
            color: 0xfff3e0,        // Warm solar tint
            intensity: 2.7,
            position: [78, 96, 78],
            target: [0, 0, 0],

            // High-precision UE5-style PCSS shadows
            castShadow: true,
            shadowMapSize: 2048,
            shadowArea: 42,
            shadowNear: 0.5,
            shadowFar: 260,

            // Precision bias tuning to eliminate acne/peter-panning
            bias: -0.00005,
            normalBias: 0.0015,
            radius: 1.0
        },

        // Sky Fill / Ambient Light Ground Reflection
        hemisphere: {
            enabled: true,
            skyColor: 0x9bb9dc,
            groundColor: 0x474b52,
            intensity: 0.05
        }
    };

    class SMHDRSkySystem {
        constructor(scene = null, renderer = null, config = {}) {
            this.scene = scene || window.scene || null;
            this.renderer = renderer || window.renderer || null;

            this.config = {
                ...DEFAULT_CONFIG,
                ...config,
                sun: {
                    ...DEFAULT_CONFIG.sun,
                    ...(config.sun || {})
                },
                hemisphere: {
                    ...DEFAULT_CONFIG.hemisphere,
                    ...(config.hemisphere || {})
                }
            };

            // Compatibility aliases for the HDRI profile/settings bridge.
            // The active implementation uses `config`, while older bridge
            // code still reads `cfg` and `_intensity`.
            this.cfg = this.config;
            this._intensity = {};

            this.hdrTexture = null;
            this.environmentTexture = null;
            this.backgroundTexture = null;
            this.pmremGenerator = null;

            this.root = null;
            this.hdriProxy = null;
            this.sunLight = null;
            this.sunTarget = null;
            this.hemiLight = null;

            this.loaded = false;
            this.loadingPromise = null;
            this.disposed = false;
        }

        async init() {
            if (this.disposed) return false;

            this.scene = this.scene || window.scene || null;
            this.renderer = this.renderer || window.renderer || null;

            if (!this.scene || !this.renderer || !window.THREE) {
                return false;
            }

            this._createHierarchyRoot();
            this._createLights();
            this._configureRenderer();
            this._prepareSceneShadowMaterials();

            await this.loadHDR(this.config.hdrPath);

            return true;
        }

        _configureRenderer() {
            if (!this.renderer) return;

            // UE5 Color Grading & Tone Mapping Pipeline
            // Prefers AgX (UE5 style highlight handling) -> Fallback to ACESFilmic
            if (THREE.AgXToneMapping !== undefined) {
                this.renderer.toneMapping = THREE.AgXToneMapping;
            } else if (THREE.ACESFilmicToneMapping !== undefined) {
                this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
            }

            if (THREE.SRGBColorSpace !== undefined) {
                this.renderer.outputColorSpace = THREE.SRGBColorSpace;
            } else if (THREE.sRGBEncoding !== undefined) {
                // Three r147/r148 still uses outputEncoding. Leaving this
                // unset makes the HDRI and shadowed materials look darker and
                // less stable than the same scene in the modern pipeline.
                this.renderer.outputEncoding = THREE.sRGBEncoding;
            }

            // Physical lighting units toggle (Three.js r155+)
            if ('useLegacyLights' in this.renderer) {
                this.renderer.useLegacyLights = false;
            }

            if (typeof window.smRender?.setExposure === 'function') {
                window.smRender.setExposure(this.config.exposure);
            } else {
                this.renderer.toneMappingExposure = this.config.exposure;
            }

            // Clean high-precision PCF shadow mapping
            if (this.renderer.shadowMap) {
                this.renderer.shadowMap.enabled = true;
                if (THREE.PCFShadowMap !== undefined) {
                    this.renderer.shadowMap.type = THREE.PCFShadowMap;
                }
                this.renderer.shadowMap.autoUpdate = true;
                this.renderer.shadowMap.needsUpdate = true;
            }
        }

        _createHierarchyRoot() {
            if (!this.scene) return;

            const existing = this.scene.getObjectByName?.('Environment');

            if (existing?.userData?.isHDRSkyRoot) {
                this.root = existing;
            } else {
                this.root = new THREE.Group();
                this.root.name = 'Environment';
                this.root.userData = {
                    isHDRSkyRoot: true,
                    isSystemObject: false,
                    ignoreInHierarchy: false,
                    ignoreInTimeline: true,
                    editorOnly: false,
                    excludeFromNanite: true,
                    excludeFromStaticMerge: true
                };
                this.scene.add(this.root);
            }

            if (!this.hdriProxy) {
                this.hdriProxy = new THREE.Object3D();
                this.hdriProxy.name = 'HDRI Sky';
                this.hdriProxy.userData = {
                    isHDRSkyProxy: true,
                    isSystemObject: false,
                    ignoreInHierarchy: false,
                    ignoreInTimeline: true,
                    selectable: true,
                    editorOnly: true,
                    excludeFromNanite: true,
                    excludeFromStaticMerge: true
                };
                this.root.add(this.hdriProxy);
            }
        }

        _createLights() {
            if (!this.root) return;

            const sunCfg = this.config.sun;

            if (sunCfg.enabled && !this.sunLight) {
                this.sunLight = new THREE.DirectionalLight(
                    sunCfg.color,
                    sunCfg.intensity
                );

                this.sunLight.name = 'Sun Light';
                this.sunLight.position.set(...sunCfg.position);
                this.sunLight.castShadow = !!sunCfg.castShadow;
                this.sunLight.userData = {
                    isHDRSkyLight: true,
                    isSystemObject: false,
                    ignoreInHierarchy: false,
                    ignoreInTimeline: true,
                    shadowRequested: !!sunCfg.castShadow,
                    forceShadow: true,
                    allowShadowBudgetDisable: false,
                    minShadowMapSize: 2048,
                    shadowPriority: 100
                };

                this.sunTarget = new THREE.Object3D();
                this.sunTarget.name = 'Sun Target';
                this.sunTarget.position.set(...sunCfg.target);
                this.sunTarget.userData = {
                    isHDRSkyTarget: true,
                    isSystemObject: true,
                    ignoreInHierarchy: true,
                    ignoreInTimeline: true
                };

                this.root.add(this.sunTarget);
                this.root.add(this.sunLight);
                this.sunLight.target = this.sunTarget;

                if (this.sunLight.shadow) {
                    const shadow = this.sunLight.shadow;
                    const area = Math.max(16, Math.min(120, Number(sunCfg.shadowArea) || 48));
                    const mapSize = Math.max(1024, Math.min(4096, Number(sunCfg.shadowMapSize) || 2048));

                    shadow.mapSize.set(mapSize, mapSize);

                    shadow.camera.left = -area;
                    shadow.camera.right = area;
                    shadow.camera.top = area;
                    shadow.camera.bottom = -area;
                    shadow.camera.near = Math.max(0.05, Number(sunCfg.shadowNear) || 0.5);
                    shadow.camera.far = Math.max(shadow.camera.near + 10, Number(sunCfg.shadowFar) || 260);
                    shadow.bias = Number.isFinite(Number(sunCfg.bias)) ? Number(sunCfg.bias) : -0.00005;
                    shadow.normalBias = Number.isFinite(Number(sunCfg.normalBias))
                        ? Math.max(0, Math.min(0.006, Number(sunCfg.normalBias)))
                        : 0.0015;
                    shadow.radius = Number.isFinite(Number(sunCfg.radius))
                        ? Math.max(0, Math.min(2, Number(sunCfg.radius)))
                        : 1.0;
                    shadow.camera.updateProjectionMatrix?.();
                    shadow.needsUpdate = true;
                }
            }

            const hemiCfg = this.config.hemisphere;

            if (hemiCfg.enabled && !this.hemiLight) {
                this.hemiLight = new THREE.HemisphereLight(
                    hemiCfg.skyColor,
                    hemiCfg.groundColor,
                    hemiCfg.intensity
                );

                this.hemiLight.name = 'HDRI Fill Light';
                this.hemiLight.userData = {
                    isHDRSkyLight: true,
                    isSystemObject: false,
                    ignoreInHierarchy: false,
                    ignoreInTimeline: true
                };

                this.root.add(this.hemiLight);
            }

            this._disableSecondarySystemShadowCasters();
        }

        /**
         * The HDR/Sun rig is the only engine-created directional shadow
         * caster. Old workspace helpers can be left in a scene after a mode
         * switch; allowing all of them to cast produces overlapping shadow
         * maps, black seams and moire-like waves on flat meshes.
         */
        _disableSecondarySystemShadowCasters() {
            if (!this.scene || !this.sunLight) return 0;

            let disabled = 0;
            this.scene.traverse((light) => {
                if (!light?.isLight || light === this.sunLight || !light.castShadow) return;
                const data = light.userData || {};
                const name = String(light.name || '');
                const isEngineLight =
                    data.isSystemObject === true ||
                    data.isHDRSkyLight === true ||
                    data.isSMSunLight === true ||
                    data.ws_gameLight === true ||
                    data.ws_terrainLight === true ||
                    data.ws_runtimeLight === true ||
                    /^(Runtime|Game|Terrain|Workspace|Sky|Sun)/i.test(name);

                if (!isEngineLight) return;
                light.castShadow = false;
                if (light.shadow) light.shadow.needsUpdate = true;
                disabled += 1;
            });
            return disabled;
        }

        _prepareSceneShadowMaterials() {
            if (!this.scene) return 0;

            let prepared = 0;
            this.scene.traverse((object) => {
                if (!object?.isMesh) return;
                const data = object.userData || {};
                const helper = data.isHelper === true || data.isEditorHelper === true ||
                    data.noCastShadow === true || /Helper|Gizmo|TransformControls/i.test(object.name || '');
                const materials = Array.isArray(object.material) ? object.material : [object.material];
                const canCast = materials.some((material) => (
                    material && (!material.transparent || material.alphaTest > 0)
                ));

                object.castShadow = !helper && canCast;
                object.receiveShadow = true;
                prepared += 1;
            });
            return prepared;
        }

        _getHDRLoader() {
            if (THREE.RGBELoader) {
                return new THREE.RGBELoader();
            }
            if (window.RGBELoader) {
                return new window.RGBELoader();
            }
            throw new Error('[SM HDR Sky] RGBELoader not found.');
        }

        async loadHDR(path = this.config.hdrPath) {
            if (!path || this.disposed) return false;

            if (this.loadingPromise) {
                return this.loadingPromise;
            }

            this.loadingPromise = new Promise((resolve, reject) => {
                let loader;
                try {
                    loader = this._getHDRLoader();
                } catch (error) {
                    this.loadingPromise = null;
                    console.error(error);
                    reject(error);
                    return;
                }

                loader.load(
                    path,
                    texture => {
                        try {
                            this._applyHDRTexture(texture, path);
                            resolve(true);
                        } catch (error) {
                            reject(error);
                        } finally {
                            this.loadingPromise = null;
                        }
                    },
                    undefined,
                    error => {
                        this.loadingPromise = null;
                        console.error(`[SM HDR Sky] Load Failed: ${path}`, error);
                        reject(error);
                    }
                );
            });

            return this.loadingPromise;
        }

        _applyHDRTexture(texture, sourcePath) {
            if (!texture || !this.scene || !this.renderer) return false;

            this._disposeEnvironmentTextures();

            texture.mapping = THREE.EquirectangularReflectionMapping;
            texture.needsUpdate = true;

            this.hdrTexture = texture;
            this.backgroundTexture = texture;
            this.scene.background = texture;

            if ('backgroundIntensity' in this.scene) {
                this.scene.backgroundIntensity = this.config.backgroundIntensity;
            }

            // Generate Pre-filtered Mipmapped Radiance Environment Map (PMREM)
            if (THREE.PMREMGenerator) {
                this.pmremGenerator = this.pmremGenerator || new THREE.PMREMGenerator(this.renderer);
                this.pmremGenerator.compileEquirectangularShader?.();

                const pmrem = this.pmremGenerator.fromEquirectangular(texture);
                this.environmentTexture = pmrem.texture;
            } else {
                this.environmentTexture = texture;
            }

            // IMPORTANT: outdoor HDRI is visual background by default.
            // Global IBL is opt-in because scene.environment is not spatially
            // aware and otherwise reflects the outdoor sky inside closed rooms.
            const allowGlobalIBL =
                window.smGlobalIBLAllowed === true ||
                window.smReflectionProbeSystem?.isAuthoritative === true;

            this.scene.environment = allowGlobalIBL
                ? this.environmentTexture
                : null;

            if ('environmentIntensity' in this.scene) {
                this.scene.environmentIntensity = allowGlobalIBL
                    ? this.config.environmentIntensity
                    : 0;
            }

            this.loaded = true;
            this.config.hdrPath = sourcePath;

            // Materials loaded before the HDR finished still need the same
            // shadow flags as the startup environment.
            this._disableSecondarySystemShadowCasters();
            this._prepareSceneShadowMaterials();

            if (this.hdriProxy) {
                const fileName = String(sourcePath).split('/').pop();
                this.hdriProxy.name = `HDRI Sky • ${fileName}`;
                this.hdriProxy.userData.source = sourcePath;
                this.hdriProxy.userData.environmentIntensity = this.config.environmentIntensity;
            }

            window.smActiveHDRI = {
                texture: this.hdrTexture,
                environmentTexture: this.environmentTexture,
                backgroundTexture: this.backgroundTexture,
                source: sourcePath,
                name: String(sourcePath).split('/').pop(),
                intensity: this.config.environmentIntensity,
                type: 'hdr'
            };

            // Keep the legacy HDRI bridges informed without changing the
            // built-in sky into an "external" asset.
            this._externalEnv = false;
            this._externalEnvTexture = null;
            this._externalEnvSource = sourcePath;
            this._externalEnvAssetId = null;

            window.smHDRIEnvironmentEnabled = true;

            if (this.renderer.shadowMap) {
                this.renderer.shadowMap.needsUpdate = true;
            }

            window.hierarchyManager?.renderAll?.();
            window.updateHierarchy?.();

            window.dispatchEvent(
                new CustomEvent('sm:hdr-sky-loaded', {
                    detail: {
                        path: sourcePath,
                        texture: this.hdrTexture,
                        environmentTexture: this.environmentTexture
                    }
                })
            );

            console.log('[SM HDR Sky] Physically Processed:', sourcePath);
            return true;
        }

        setEnvironmentIntensity(value) {
            const intensity = Math.max(0, Number(value) || 0);
            this.config.environmentIntensity = intensity;
            if (this.scene && 'environmentIntensity' in this.scene) {
                this.scene.environmentIntensity = intensity;
            }
            if (window.smActiveHDRI) {
                window.smActiveHDRI.intensity = intensity;
            }
            return intensity;
        }

        setBackgroundIntensity(value) {
            const intensity = Math.max(0, Number(value) || 0);
            this.config.backgroundIntensity = intensity;
            if (this.scene && 'backgroundIntensity' in this.scene) {
                this.scene.backgroundIntensity = intensity;
            }
            return intensity;
        }

        setExposure(value) {
            const exposure = Math.max(0.05, Number(value) || 1);
            this.config.exposure = exposure;
            if (typeof window.smRender?.setExposure === 'function') {
                window.smRender.setExposure(exposure);
            } else if (this.renderer) {
                this.renderer.toneMappingExposure = exposure;
            }
            return exposure;
        }

        /**
         * Attach the HDR hierarchy to the active scene again after a scene
         * import or a workspace transition.  The method is intentionally
         * idempotent because several editor bridges may call it in one tick.
         */
        ensureRigAttached(scene = window.scene) {
            if (!scene || !this.root) return false;
            if (this.root.parent !== scene) {
                scene.add(this.root);
            }
            return true;
        }

        /** Refresh shadow matrices without rebuilding the lighting rig. */
        refreshShadows() {
            if (this.sunLight?.shadow) {
                const cfg = this.config.sun || {};
                const shadow = this.sunLight.shadow;
                const mapSize = Math.max(1024, Math.min(4096, Number(cfg.shadowMapSize) || 2048));
                const area = Math.max(16, Math.min(120, Number(cfg.shadowArea) || 48));
                if (shadow.map) {
                    shadow.map.dispose?.();
                    shadow.map = null;
                }
                shadow.mapSize.set(mapSize, mapSize);
                shadow.camera.left = -area;
                shadow.camera.right = area;
                shadow.camera.top = area;
                shadow.camera.bottom = -area;
                shadow.camera.near = Math.max(0.05, Number(cfg.shadowNear) || 0.5);
                shadow.camera.far = Math.max(shadow.camera.near + 10, Number(cfg.shadowFar) || 260);
                shadow.bias = Number.isFinite(Number(cfg.bias)) ? Number(cfg.bias) : -0.00005;
                shadow.normalBias = Number.isFinite(Number(cfg.normalBias))
                    ? Math.max(0, Math.min(0.006, Number(cfg.normalBias)))
                    : 0.0015;
                shadow.radius = Number.isFinite(Number(cfg.radius))
                    ? Math.max(0, Math.min(2, Number(cfg.radius)))
                    : 1.0;
                this.sunLight.castShadow = cfg.castShadow !== false;
                shadow.needsUpdate = true;
                shadow.camera.updateProjectionMatrix?.();
            }
            if (this.renderer?.shadowMap) {
                this.renderer.shadowMap.enabled = true;
                this.renderer.shadowMap.type = THREE.PCFShadowMap;
                this.renderer.shadowMap.autoUpdate = true;
                this.renderer.shadowMap.needsUpdate = true;
            }
            this._disableSecondarySystemShadowCasters();
            this._prepareSceneShadowMaterials();
            return true;
        }

        /**
         * Compatibility entry point used by older workspace and settings
         * code.  Keeping it here prevents a Film transition from leaving the
         * HDR hierarchy hidden when Terrain becomes active.
         */
        setWorkspaceMode(mode = 'FILM') {
            const activeMode = String(mode || 'FILM').toUpperCase();
            this.currentWorkspaceMode = activeMode;
            this.ensureRigAttached();

            const editorSkyVisible =
                activeMode === 'GAME_DEV' ||
                activeMode === 'TERRAIN';

            this.setVisible(editorSkyVisible);
            if (editorSkyVisible) {
                this.applyWorkspaceProfile(
                    activeMode === 'TERRAIN' ? 'terrain' : 'ue5-editor'
                );
            } else {
                this.refreshShadows();
            }

            return true;
        }

        /** Legacy hooks used by HDRI/workspace bridges. */
        _applyExternalEnvironmentVisualState() {
            if (!this.scene || !this.hdrTexture) return false;
            this.scene.background = this.backgroundTexture || this.hdrTexture;
            const allowGlobalIBL =
                window.smGlobalIBLAllowed === true ||
                window.smReflectionProbeSystem?.isAuthoritative === true;

            this.scene.environment =
                window.smHDRIEnvironmentEnabled !== false &&
                allowGlobalIBL &&
                this.environmentTexture
                    ? this.environmentTexture
                    : null;

            if ('environmentIntensity' in this.scene && !allowGlobalIBL) {
                this.scene.environmentIntensity = 0;
            }
            return true;
        }

        _pushSkyUniforms() {
            return true;
        }

        /**
         * Keep the HDR sky compatible with the engine's workspace and frame
         * bridges. Film hides the authored Environment root; GAME_DEV and
         * TERRAIN must explicitly show it again when they become active.
         */
        setVisible(visible) {
            const enabled = !!visible;

            if (this.root) {
                this.root.visible = enabled;
            }

            [
                this.sunLight,
                this.sunTarget,
                this.hemiLight,
                this.hdriProxy
            ].forEach(object => {
                if (object) object.visible = enabled;
            });

            return enabled;
        }

        /**
         * The render loop calls update for both the legacy and HDR-only sky
         * implementations. Keep the operation cheap and deterministic: the
         * Sun target must have a current world matrix before shadow/effects
         * systems consume it, while no per-frame scene rebuild is performed.
         */
        update() {
            if (!this.loaded) return false;

            this.sunTarget?.updateMatrixWorld?.(true);
            this.sunLight?.updateMatrixWorld?.(true);
            return true;
        }

        /**
         * Workspace compatibility profile used when the adapter/controller is
         * not available yet. It also makes a direct call from older tools safe.
         */
        applyWorkspaceProfile(profile = 'ue5-editor') {
            const key = String(profile || 'ue5-editor').toLowerCase();
            const terrain = key === 'terrain' || key === 'landscape';
            const allowGlobalIBL =
                window.smGlobalIBLAllowed === true ||
                window.smReflectionProbeSystem?.isAuthoritative === true;

            this.setVisible(true);
            this.setExposure(terrain ? 1.0 : 1.0);

            // Keep HDR visible as the sky, but do not flood every material with
            // outdoor reflections until local probes exist.
            this.setEnvironmentIntensity(
                allowGlobalIBL ? (terrain ? 0.18 : 0.12) : 0
            );
            this.setBackgroundIntensity(1.0);

            if (this.scene) {
                this.scene.environment = allowGlobalIBL
                    ? this.environmentTexture
                    : null;
                if ('environmentIntensity' in this.scene && !allowGlobalIBL) {
                    this.scene.environmentIntensity = 0;
                }
            }

            if (this.sunLight) {
                this.sunLight.visible = true;
                this.sunLight.intensity = terrain ? 2.7 : 2.4;
                this.config.sun.intensity = this.sunLight.intensity;
                this.sunLight.castShadow = true;
            }

            // Three.js has no bounced indirect light in this editor baseline.
            // This controlled fill prevents closed rooms and character backs
            // from collapsing to black while preserving the sun's direction.
            if (this.hemiLight) {
                this.hemiLight.visible = true;
                this.hemiLight.intensity = terrain ? 0.28 : 0.22;
                this.config.hemisphere.intensity = this.hemiLight.intensity;
            }

            this.refreshShadows();
            this.update();
            return true;
        }

        /**
         * Apply an HDR/EXR texture supplied by an asset or workspace bridge.
         * The texture remains the visible background while its PMREM texture
         * (when supplied) drives physically based material reflections.
         */
        applyExternalEnvironmentTexture(texture, options = {}) {
            if (!texture || !this.scene) return false;

            const previousHDR = this.hdrTexture;
            const previousEnvironment = this.environmentTexture;
            const previousBackground = this.backgroundTexture;
            if (previousHDR && previousHDR !== texture) {
                previousHDR.dispose?.();
            }
            if (
                previousEnvironment &&
                previousEnvironment !== previousHDR &&
                previousEnvironment !== texture
            ) {
                previousEnvironment.dispose?.();
            }

            texture.mapping = THREE.EquirectangularReflectionMapping;
            texture.needsUpdate = true;
            const backgroundTexture = options.backgroundTexture || texture;
            backgroundTexture.mapping = THREE.EquirectangularReflectionMapping;
            backgroundTexture.needsUpdate = true;
            if (
                previousBackground &&
                previousBackground !== previousHDR &&
                previousBackground !== previousEnvironment &&
                previousBackground !== texture &&
                previousBackground !== backgroundTexture
            ) {
                previousBackground.dispose?.();
            }
            this.hdrTexture = texture;
            this.backgroundTexture = backgroundTexture;
            this._externalEnvTexture = texture;
            this._externalEnv = true;
            this._externalEnvSource = options.source || null;
            this._externalEnvAssetId = options.assetId || null;
            this._externalEnvIntensity = Math.max(
                0,
                Number(options.intensity ?? this.config.environmentIntensity) || 0
            );
            this._externalEnvHideSkyVisuals = options.hideProceduralSky !== false;
            this.environmentTexture =
                options.environmentTexture ||
                (previousHDR === texture ? previousEnvironment : null) ||
                null;

            // Build a filtered reflection environment for external EXR/HDR
            // files when the caller did not already provide one. The raw
            // equirectangular texture remains the visible background.
            if (!this.environmentTexture && THREE.PMREMGenerator && this.renderer) {
                this.pmremGenerator = this.pmremGenerator || new THREE.PMREMGenerator(this.renderer);
                this.pmremGenerator.compileEquirectangularShader?.();
                this.environmentTexture = this.pmremGenerator.fromEquirectangular(texture).texture;
            }
            this.environmentTexture = this.environmentTexture || texture;

            if (options.asBackground !== false) {
                this.scene.background = backgroundTexture;
            }
            const allowGlobalIBL =
                window.smGlobalIBLAllowed === true ||
                window.smReflectionProbeSystem?.isAuthoritative === true;

            this.scene.environment =
                options.asEnvironment !== false &&
                window.smHDRIEnvironmentEnabled !== false &&
                allowGlobalIBL
                    ? this.environmentTexture
                    : null;

            if ('backgroundIntensity' in this.scene) {
                this.scene.backgroundIntensity = Math.max(
                    0,
                    Number(options.backgroundIntensity ?? this.config.backgroundIntensity) || 0
                );
            }
            if ('environmentIntensity' in this.scene) {
                this.scene.environmentIntensity = allowGlobalIBL
                    ? Math.max(
                        0,
                        Number(options.intensity ?? this.config.environmentIntensity) || 0
                    )
                    : 0;
            }

            this.config.environmentIntensity = Math.max(
                0,
                Number(options.intensity ?? this.config.environmentIntensity) || 0
            );
            this.config.backgroundIntensity = Math.max(
                0,
                Number(options.backgroundIntensity ?? this.config.backgroundIntensity) || 0
            );
            this.loaded = true;
            this.config.hdrPath = options.source || this.config.hdrPath;
            window.smActiveHDRI = {
                ...(window.smActiveHDRI || {}),
                texture,
                environmentTexture: this.environmentTexture,
                backgroundTexture,
                source: options.source || window.smActiveHDRI?.source || null,
                assetId: options.assetId || window.smActiveHDRI?.assetId || null,
                intensity: this.config.environmentIntensity,
                type: options.type || window.smActiveHDRI?.type || 'hdr'
            };
            window.smHDRIEnvironmentEnabled = true;
            this.setVisible(true);
            this.update();
            window.renderer?.shadowMap && (window.renderer.shadowMap.needsUpdate = true);
            window.dispatchEvent?.(
                new CustomEvent('sm:hdr-sky-loaded', {
                    detail: {
                        path: options.source || null,
                        texture,
                        environmentTexture: this.environmentTexture,
                        external: true
                    }
                })
            );
            return true;
        }

        async loadEnvironment(path, options = {}) {
            if (!path || this.disposed) return false;

            const loader = this._getHDRLoader();
            return new Promise((resolve, reject) => {
                loader.load(
                    path,
                    texture => {
                        try {
                            this.applyExternalEnvironmentTexture(texture, {
                                ...options,
                                source: options.source || path
                            });
                            resolve(true);
                        } catch (error) {
                            reject(error);
                        }
                    },
                    undefined,
                    reject
                );
            });
        }

        setSun({ intensity, color, position, target } = {}) {
            if (!this.sunLight) return false;

            if (intensity !== undefined) {
                this.sunLight.intensity = Math.max(0, Number(intensity) || 0);
                this.config.sun.intensity = this.sunLight.intensity;
            }

            if (color !== undefined) {
                this.sunLight.color.set(color);
                this.config.sun.color = color;
            }

            if (Array.isArray(position) && position.length >= 3) {
                this.sunLight.position.set(position[0], position[1], position[2]);
                this.config.sun.position = [...position];
            }

            if (Array.isArray(target) && target.length >= 3 && this.sunTarget) {
                this.sunTarget.position.set(target[0], target[1], target[2]);
                this.config.sun.target = [...target];
            }

            this.sunTarget?.updateMatrixWorld?.(true);
            if (this.sunLight.shadow) {
                this.sunLight.shadow.needsUpdate = true;
            }

            return true;
        }

        async setHDR(path) {
            return this.loadHDR(path);
        }

        _disposeEnvironmentTextures() {
            if (this.environmentTexture && this.environmentTexture !== this.hdrTexture) {
                this.environmentTexture.dispose?.();
            }
            if (
                this.backgroundTexture &&
                this.backgroundTexture !== this.hdrTexture &&
                this.backgroundTexture !== this.environmentTexture
            ) {
                this.backgroundTexture.dispose?.();
            }
            if (this.hdrTexture) {
                this.hdrTexture.dispose?.();
            }
            this.environmentTexture = null;
            this.backgroundTexture = null;
            this.hdrTexture = null;
        }

        dispose() {
            this.disposed = true;

            if (this.scene) {
                if (
                    this.scene.background === this.hdrTexture ||
                    this.scene.background === this.backgroundTexture
                ) {
                    this.scene.background = null;
                }
                if (
                    this.scene.environment === this.environmentTexture ||
                    this.scene.environment === this.hdrTexture
                ) {
                    this.scene.environment = null;
                }
            }

            this._disposeEnvironmentTextures();
            this.pmremGenerator?.dispose?.();
            this.pmremGenerator = null;

            this.root?.parent?.remove?.(this.root);
            this.root = null;
            this.sunLight = null;
            this.sunTarget = null;
            this.hemiLight = null;
            this.hdriProxy = null;
        }

        debug() {
            console.table({
                'HDR path': this.config.hdrPath,
                'HDR loaded': this.loaded,
                'Tone Mapper': this.renderer?.toneMapping === THREE.AgXToneMapping ? 'AgX' : 'ACESFilmic',
                'Environment intensity': this.config.environmentIntensity,
                'Background intensity': this.config.backgroundIntensity,
                'Exposure': this.renderer?.toneMappingExposure,
                'Sun intensity': this.sunLight?.intensity,
                'Shadow Resolution': `${this.config.sun.shadowMapSize}px`
            });
        }
    }

    window.SMHDRSkySystem = SMHDRSkySystem;

    async function bootHDRSky() {
        if (window.smHDRSkySystem?.loaded) return;

        const scene = window.scene;
        const renderer = window.renderer;

        if (!scene || !renderer || !window.THREE) {
            setTimeout(bootHDRSky, 100);
            return;
        }

        const system = new SMHDRSkySystem(scene, renderer, {
            hdrPath: window.SM_DEFAULT_HDR_PATH || DEFAULT_CONFIG.hdrPath
        });

        window.smHDRSkySystem = system;
        window.skyLightingSystem = system;

        try {
            await system.init();

            // HDR loading is asynchronous. Re-apply the active workspace
            // profile only after the texture, PMREM and shadow rig are ready;
            // otherwise the early startup pass is silently lost.
            const activeMode = String(
                window.workspaceManager?.currentMode ||
                localStorage.getItem('sm_workspace_mode') ||
                'FILM'
            ).toUpperCase();
            window.smWorkspaceEnvironmentAdapter?.apply?.(activeMode, scene);
        } catch (error) {
            console.error('[SM HDR Sky] Boot failed:', error);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bootHDRSky, { once: true });
    } else {
        bootHDRSky();
    }
})();
