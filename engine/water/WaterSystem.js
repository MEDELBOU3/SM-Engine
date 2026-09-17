(function () {
    class SMUnderwaterController {
        constructor(scene, renderer, system) {
            this.scene = scene;
            this.renderer = renderer;
            this.system = system;
            this.activeBody = null;
            this._tmpPos = new THREE.Vector3();

            this._savedEnvironment = null;
            this._volumeFog = null;
            this._volumeBackground = new THREE.Color();
        }

        _captureEnvironment() {
            if (this._savedEnvironment) return;

            this._savedEnvironment = {
                fog: this.scene.fog || null,
                background: this.scene.background || null,
                toneMappingExposure:
                    Number.isFinite(
                        this.renderer?.toneMappingExposure
                    )
                        ? this.renderer.toneMappingExposure
                        : null
            };
        }

        _applyVolumeEnvironment(
            body,
            camera
        ) {
            if (!body || !camera) {
                return;
            }

            this._captureEnvironment();

            camera.getWorldPosition?.(
                this._tmpPos
            );

            const config = {
                ...(this.system?.settings || {}),
                ...(body.config || {}),
                ...(body.material?.userData?.smWaterOptions || {})
            };

            const depthFraction =
                body.volume
                    ?.getDepthFraction?.(
                        this._tmpPos,
                        this.system.time
                    ) ??
                0;

            const fogColor =
                new THREE.Color(
                    config.underwaterFogColor ||
                    config.underwaterScatteringColor ||
                    config.deepColor ||
                    '#07526b'
                );

            const baseDensity =
                Math.max(
                    0.008,
                    Number(
                        config.underwaterFogDensity ??
                        0.045
                    )
                );

            const volumeDensity =
                THREE.MathUtils.clamp(
                    Number(
                        config.underwaterVolumeDensity ??
                        1.0
                    ),
                    0.35,
                    2.5
                );

            const density =
                THREE.MathUtils.clamp(
                    baseDensity *
                    volumeDensity *
                    (
                        0.85 +
                        depthFraction *
                        0.85
                    ),
                    0.008,
                    0.18
                );

            if (!this._volumeFog) {
                this._volumeFog =
                    new THREE.FogExp2(
                        fogColor,
                        density
                    );
            }

            this._volumeFog
                .color
                .copy(
                    fogColor
                );

            this._volumeFog.density =
                density;

            this.scene.fog =
                this._volumeFog;

            if (
                config.underwaterBackground !==
                false
            ) {
                this._volumeBackground.set(
                    config.underwaterBackgroundColor ||
                    config.underwaterDeepColor ||
                    config.deepColor ||
                    '#042a40'
                );

                this.scene.background =
                    this._volumeBackground;
            }

            if (
                this._savedEnvironment
                    ?.toneMappingExposure != null &&
                Number.isFinite(
                    this.renderer?.toneMappingExposure
                )
            ) {
                const exposureFactor =
                    THREE.MathUtils.clamp(
                        Number(
                            config.underwaterExposure ??
                            0.72
                        ),
                        0.25,
                        1.25
                    );

                this.renderer.toneMappingExposure =
                    this._savedEnvironment
                        .toneMappingExposure *
                    exposureFactor;
            }
        }

        _restoreEnvironment() {
            if (!this._savedEnvironment) {
                return;
            }

            this.scene.fog =
                this._savedEnvironment.fog;

            this.scene.background =
                this._savedEnvironment.background;

            if (
                this._savedEnvironment
                    .toneMappingExposure != null &&
                Number.isFinite(
                    this.renderer?.toneMappingExposure
                )
            ) {
                this.renderer.toneMappingExposure =
                    this._savedEnvironment
                        .toneMappingExposure;
            }

            this._savedEnvironment =
                null;
        }

        _findBody(camera) {
            if (!camera || !this.system?.bodies?.size) return null;

            if (camera.getWorldPosition) {
                camera.getWorldPosition(this._tmpPos);
            } else {
                this._tmpPos.copy(camera.position);
            }

            const p = this._tmpPos;

            let best = null;
            let smallestDepth = Infinity;

            for (const body of this.system.bodies.values()) {
                let insideVolume = false;

                if (body?.volume?.containsPoint) {
                    insideVolume =
                        body.volume.containsPoint(
                            p,
                            this.system.time
                        );
                } else {
                    if (!body?.containsXZ?.(p.x, p.z, 0.05)) {
                        continue;
                    }

                    const surfaceY =
                        body.surfaceYAt(
                            p.x,
                            p.z,
                            true,
                            this.system.time
                        );

                    const depth =
                        Math.max(
                            0.02,
                            Number(
                                body.depthAt?.(
                                    p.x,
                                    p.z
                                ) ??
                                body.config?.volumeDepth ??
                                body.config?.bedDepth ??
                                4
                            )
                        );

                    const bottomY =
                        surfaceY -
                        depth;

                    insideVolume =
                        p.y <=
                            surfaceY +
                            0.025 &&
                        p.y >=
                            bottomY -
                            0.025;
                }

                if (!insideVolume) {
                    continue;
                }

                const surfaceY =
                    body.surfaceYAt(
                        p.x,
                        p.z,
                        true,
                        this.system.time
                    );

                const underwaterDepth =
                    surfaceY -
                    p.y;

                if (
                    underwaterDepth <
                    smallestDepth
                ) {
                    smallestDepth =
                        underwaterDepth;

                    best =
                        body;
                }
            }

            return best;
        }

        update(camera) {
            const next = this._findBody(camera);

            if (next !== this.activeBody) {
                const previous = this.activeBody;
                this.activeBody = next;

                if (!previous && next) {
                    window.dispatchEvent?.(
                        new CustomEvent('sm:water-enter', {
                            detail: { body: next }
                        })
                    );

                    this.system.emit?.('underwaterchange', {
                        underwater: true,
                        body: next
                    });
                } else if (previous && !next) {
                    window.dispatchEvent?.(
                        new CustomEvent('sm:water-exit', {
                            detail: { body: previous }
                        })
                    );

                    this.system.emit?.('underwaterchange', {
                        underwater: false,
                        body: previous
                    });
                } else if (previous && next && previous !== next) {
                    this.system.emit?.('underwaterchange', {
                        underwater: true,
                        body: next,
                        previousBody: previous
                    });
                }
            }

            if (this.activeBody) {
                this._applyVolumeEnvironment(
                    this.activeBody,
                    camera
                );
            } else {
                this._restoreEnvironment();
            }

            return this.activeBody;
        }

        leave() {
            const previous = this.activeBody;
            this.activeBody = null;

            this._restoreEnvironment();

            if (previous) {
                window.dispatchEvent?.(
                    new CustomEvent('sm:water-exit', {
                        detail: { body: previous }
                    })
                );
            }
        }

        destroy() {
            this.leave();
        }
    }

    class SMWaterSystem {
        constructor(scene, camera, renderer, options = {}) {
            if (!scene || !renderer) throw new Error('SMWaterSystem requires scene and renderer');
            if (!window.SMWaterBody || !window.SMWaterEditor) throw new Error('Load WaterMaterial.js, WaterBody.js and WaterEditor.js before WaterSystem.js');
            this.scene = scene;
            this.camera = camera || window.camera || null;
            this.renderer = renderer;
            this.controls = options.controls || window.controls || null;
            this.terrain = options.terrain || window.terrain || null;
            this.bodies = new Map();
            this.activeBodyId = null;
            this.time = 0;
            this.listeners = new Map();
            this.interactors = new Map();
            this.physicsWaterStates = new Map();
            this.sceneWaterObstacles = new Set();
            this._lastWaterObstacleScanAt = -Infinity;
            this._lastWaterObstacleRootCount = -1;
            this._autoPlayerObject = null;
            this._terrainRefreshQueued = false;
            this.fftSpectra = new Map();
            this._fftWarningShown = false;
            this._tmpPhysicsPosition = new THREE.Vector3();
            this._tmpPhysicsVelocity = new THREE.Vector3();
            this._tmpWaterFlow = new THREE.Vector3();
            this._tmpImpactPosition = new THREE.Vector3();
            this._tmpPhysicsScale = new THREE.Vector3();
            this.terrainAdapter = window.SMWaterTerrainAdapter ? new window.SMWaterTerrainAdapter(this.terrain) : null;
            this.nodeGraph = window.SMWaterNodeGraph ? new window.SMWaterNodeGraph(this) : null;
            this.settings = {
                type: 'river', width: 4, levelOffset: 0.08, oceanSize: 800, quality: 1.15,
                terrainCarve: true, bedDepth: 3, shoreWidth: 1.5, shoreDepth: 0.08, renderOrder: 50,
                shallowColor: '#45b9d7', deepColor: '#052e4f', foamColor: '#eefcff', opacity: 0.96,
                waveHeight: 0.18, waveLength: 8.0, waveSpeed: 1.10, choppiness: 0.46,
                microWaveStrength: 0.38, microWaveScale: 1.15,
                smallWaveStrength: 0.38, normalStrength: 0.30,
                waveScale: 1.0, waveSteepness: 0.42, waveChoppiness: 0.46,
                waveSpread: 0.72, windSpeed: 1.0, windDirection: { x: 1, y: 0 },
                detailDistance: 420, waterDebugMode: 0,
                animationSpeed: 1.25,
                flowSpeed: 1.05, flowDirection: { x: 1, y: 0 }, flowCoherence: 0.88, flowReverse: false,
                currentStrength: 1.5, currentBankDrag: 0.55, flowStreakStrength: 0.14, foamStrength: 0.30,
                shoreFoamDepth: 0.48, crestFoamThreshold: 0.84,

                // GEOMETRIC / PHYSICAL RIVERBANK FOAM
                riverbankFoamEnabled: true,
                riverbankFoamWidth: 0.62,
                riverbankFoamThickness: 0.045,
                riverbankFoamCrownWidth: 0.48,
                riverbankFoamIntensity: 0.58,
                riverbankFoamDepth: 0.42,
                riverbankFoamFlow: 1.0,
                riverbankFoamNoiseScale: 1.25,
                riverbankFoamBreakup: 0.58,
                riverbankFoamEdgeSoftness: 0.18,
                riverbankFoamTextureScale: 1.0,
                riverbankFoamSpacing: 0.42,
                riverbankFoamContactInset: 0.06,
                riverbankFoamFlecks: true,
                riverbankFoamFleckRate: 4,
                riverbankFoamFleckLife: 1.8,
                reflectionStrength: 0.92, refractionStrength: 0.18, fresnelPower: 4.5,
                roughness: 0.10, sunIntensity: 1, skyIntensity: 0.85, volumeDepth: 4,
                absorptionStrength: 0.82,

                // PHYSICAL 3D WATER VOLUME
                waterVolumeVisible: true,
                waterVolumeColor: '#0b607a',
                waterVolumeDeepColor: '#032f43',
                // A visible volume is what makes the bank read as water in
                // profile. Keep it below the surface alpha so it adds depth
                // without turning the lake/river into a solid wall.
                waterVolumeOpacity: 0.12,
                waterVolumeNoiseStrength: 0.08,
                waterVolumeNoiseScale: 0.12,

                underwaterSurfaceColor: '#7fdcf3', underwaterFogColor: '#07526b',
                underwaterBackgroundColor: '#042a40', underwaterFogDensity: 0.045,
                underwaterExposure: 0.50, underwaterBackground: true,
                underwaterSurfaceOpacity: 0.985, underwaterScatterStrength: 1.05,
                underwaterDistortionStrength: 0.10,
                underwaterViewDensity: 1.45, underwaterMinAlpha: 0.985,

                // FULLSCREEN VOLUMETRIC UNDERWATER PASS
                underwaterPostProcess: true,
                underwaterScatteringColor: '#0b6f89',
                underwaterDeepColor: '#032b3b',
                underwaterAbsorptionR: 0.090,
                underwaterAbsorptionG: 0.040,
                underwaterAbsorptionB: 0.018,
                underwaterVolumeDensity: 1.08,
                underwaterOpticalDensity: 1.22,
                underwaterVisibility: 26.0,
                underwaterPostDistortion: 0.0022,
                underwaterCausticsStrength: 0.035,
                underwaterSurfaceGlow: 0.10,
                underwaterGodRayStrength: 0.82,
                underwaterGodRayQuality: 0.75,
                underwaterGodRayDepthFalloff: 0.18,
                underwaterGodRayNoiseScale: 0.085,
                underwaterGodRayNoiseSpeed: 0.14,
                underwaterLocalLightStrength: 0.90,
                underwaterLocalLightLimit: 4,
                underwaterVignette: 0.08,
                underwaterBrightness: 0.96,
                underwaterContrast: 1.02,

                ...options.settings
            };
            const normalizedType =
                window.SMWaterWaveSpectrum?.normalizeType?.(
                    options.settings?.type ||
                    options.settings?.waterType ||
                    this.settings.type ||
                    this.settings.waterType
                ) ||
                String(options.settings?.type || options.settings?.waterType || this.settings.type || this.settings.waterType || 'river').toLowerCase();
            this.settings.type = normalizedType;
            this.settings.waterType = normalizedType;
            this.presets = {
                'calm-river': {
                    type: 'river', width: 4, bedDepth: 2.4, shoreWidth: 1.5, shoreDepth: 0.07,
                    shallowColor: '#48b6cc', deepColor: '#073b5c', opacity: 0.88,
                    waveHeight: 0.075, waveLength: 10.5, waveSpeed: 0.72, choppiness: 0.24,
                    microWaveStrength: 0.34, microWaveScale: 1.28, animationSpeed: 1.15, flowSpeed: 1.05, flowCoherence: 0.90, flowReverse: false, currentStrength: 1.35, currentBankDrag: 0.58, flowStreakStrength: 0.24,
                    foamStrength: 0.12, shoreFoamDepth: 0.30,
                    riverbankFoamIntensity: 0.30, riverbankFoamWidth: 0.48, riverbankFoamThickness: 0.028,
                    riverbankFoamFlow: 0.75, riverbankFoamBreakup: 0.64, riverbankFoamFleckRate: 1.5,
                    reflectionStrength: 0.86,
                    refractionStrength: 0.20, fresnelPower: 4.8, roughness: 0.12, volumeDepth: 2.4,
                    underwaterFogDensity: 0.035,
                    waterType: 'river'
                },
                'mountain-stream': {
                    type: 'river', width: 2.8, bedDepth: 1.6, shoreWidth: 0.85, shoreDepth: 0.04,
                    shallowColor: '#65d1dd', deepColor: '#0a4a65', opacity: 0.90,
                    waveHeight: 0.19, waveLength: 4.2, waveSpeed: 1.55, choppiness: 0.78,
                    microWaveStrength: 0.52, microWaveScale: 1.85, animationSpeed: 1.30, flowSpeed: 1.85, flowCoherence: 0.78, flowReverse: false, currentStrength: 2.8, currentBankDrag: 0.48, flowStreakStrength: 0.38,
                    foamStrength: 0.62, shoreFoamDepth: 0.42, crestFoamThreshold: 0.72,
                    riverbankFoamIntensity: 0.92, riverbankFoamWidth: 0.78, riverbankFoamThickness: 0.075,
                    riverbankFoamFlow: 1.65, riverbankFoamBreakup: 0.50, riverbankFoamFleckRate: 8,
                    reflectionStrength: 0.76, refractionStrength: 0.18, fresnelPower: 3.9,
                    roughness: 0.18, volumeDepth: 1.6, underwaterFogDensity: 0.065,
                    waterType: 'river'
                },
                'clear-lake': {
                    type: 'lake', bedDepth: 5.5, shoreWidth: 2.5, shoreDepth: 0.06,
                    shallowColor: '#58c3cc', deepColor: '#062f4a', opacity: 0.87,
                    waveHeight: 0.065, waveLength: 12.5, waveSpeed: 0.62, choppiness: 0.16,
                    microWaveStrength: 0.26, microWaveScale: 1.0, animationSpeed: 1.10, flowSpeed: 0.10, flowCoherence: 0.24, flowStreakStrength: 0.01,
                    foamStrength: 0.08, shoreFoamDepth: 0.36, reflectionStrength: 1.02,
                    refractionStrength: 0.25, fresnelPower: 5.2, roughness: 0.075, volumeDepth: 5.5,
                    underwaterFogDensity: 0.028, waterType: 'lake'
                },
                'open-ocean': {
                    type: 'ocean', oceanSize: 1000, terrainCarve: false, bedDepth: 18, volumeDepth: 22,
                    shallowColor: '#258faa', deepColor: '#032847', opacity: 0.92,
                    waveHeight: 0.38, waveLength: 15, waveSpeed: 1.02, choppiness: 0.74,
                    microWaveStrength: 0.40, microWaveScale: 1.15, animationSpeed: 1.20, flowSpeed: 0.30, flowCoherence: 0.46, flowStreakStrength: 0.05,
                    foamStrength: 0.34, shoreFoamDepth: 0.50, crestFoamThreshold: 0.82,
                    reflectionStrength: 1.08, refractionStrength: 0.15, fresnelPower: 4.2,
                    roughness: 0.09, quality: 1.15, underwaterFogDensity: 0.04,
                    waterType: 'ocean'
                },
                'storm-ocean': {
                    type: 'ocean', oceanSize: 1200, terrainCarve: false, bedDepth: 24, volumeDepth: 30,
                    shallowColor: '#355f69', deepColor: '#061b29', foamColor: '#f2f6f7', opacity: 0.95,
                    waveHeight: 0.92, waveLength: 8.4, waveSpeed: 1.72, choppiness: 1.0,
                    microWaveStrength: 0.62, microWaveScale: 1.65, flowSpeed: 0.62, flowCoherence: 0.32, flowStreakStrength: 0.08,
                    foamStrength: 0.82, shoreFoamDepth: 0.7, crestFoamThreshold: 0.65,
                    reflectionStrength: 0.88, refractionStrength: 0.08, fresnelPower: 3.2,
                    roughness: 0.25, quality: 1.3, underwaterFogDensity: 0.075,
                    underwaterExposure: 0.62, waterType: 'ocean'
                },
                'calm-ocean': {
                    type: 'ocean', waterType: 'ocean', oceanSize: 1000, terrainCarve: false,
                    bedDepth: 20, volumeDepth: 24, waveHeight: 0.24, waveLength: 22,
                    waveSpeed: 0.72, choppiness: 0.46, waveSteepness: 0.30,
                    microWaveStrength: 0.32, smallWaveStrength: 0.32,
                    reflectionStrength: 1.12, roughness: 0.07, foamStrength: 0.16,
                    crestFoamThreshold: 0.90
                },
                'windy-lake': {
                    type: 'lake', waterType: 'lake', waveHeight: 0.12, waveLength: 9.5,
                    waveSpeed: 1.15, choppiness: 0.30, waveSteepness: 0.34,
                    windSpeed: 1.25, windDirection: { x: 0.8, y: 0.6 },
                    microWaveStrength: 0.42, smallWaveStrength: 0.42,
                    reflectionStrength: 1.02, roughness: 0.10
                },
                pool: {
                    type: 'pool', waterType: 'pool', waveHeight: 0.025, waveLength: 3.5,
                    waveSpeed: 0.55, choppiness: 0.12, waveSteepness: 0.16,
                    microWaveStrength: 0.18, smallWaveStrength: 0.18,
                    reflectionStrength: 1.18, roughness: 0.035, foamStrength: 0.02,
                    waterVolumeOpacity: 0.08, volumeDepth: 2.0, bedDepth: 2.0
                }
            };
            this._terrainKeys = new Set(['type', 'width', 'levelOffset', 'oceanSize', 'quality', 'terrainCarve', 'bedDepth', 'shoreWidth', 'shoreDepth', 'volumeDepth']);
            this.editor = new SMWaterEditor(scene, this.camera, renderer, { controls: this.controls, terrain: this.terrain });
            this.editor.onChange = points => this.emit('pathchange', { points });
            this.editor.onStatus = text => this.emit('status', { text });
            this.underwater = new SMUnderwaterController(scene, renderer, this);

            this.underwaterRenderer =
                window.SMWaterUnderwaterRenderer
                    ? new window.SMWaterUnderwaterRenderer(
                        renderer,
                        this.settings
                    )
                    : null;

            // One pooled emitter serves every river. It is intentionally
            // optional so the water system still runs on older project builds
            // where the interaction FX module is not present.
            this.interactionFX =
                window.SMWaterInteractionFX
                    ? new window.SMWaterInteractionFX(
                        scene
                    )
                    : null;

            // Dedicated geometric shoreline foam. It reads the actual river
            // spline, terrain height, depth profile and flow instead of placing
            // static cards along the bank.
            this.shoreFoam =
                window.SMWaterShoreFoamSystem
                    ? new window.SMWaterShoreFoamSystem(
                        scene,
                        {
                            terrainAdapter:
                                this.terrainAdapter,
                            interactionFX:
                                this.interactionFX
                        }
                    )
                    : null;

            if (!this.shoreFoam) {
                console.warn(
                    '[SMWaterSystem] Riverbank foam modules are not loaded. ' +
                    'Load WaterShorelineSampler.js, WaterShoreFoamMaterial.js ' +
                    'and WaterShoreFoamSystem.js before WaterSystem.js.'
                );
            }

            this._terrainSculptHandler =
                () =>
                    this.queueTerrainRefresh();

            window.addEventListener?.(
                'sm:terrain-changed',
                this._terrainSculptHandler
            );
            window.addEventListener?.(
                'sm:terrain-deformed',
                this._terrainSculptHandler
            );

            if (!this.underwaterRenderer) {
                console.warn(
                    '[SMWaterSystem] Volumetric underwater renderer is not loaded. ' +
                    'Load WaterUnderwaterMaterial.js and WaterUnderwaterRenderer.js before WaterSystem.js.'
                );
            }

            this.emit('status', { text: 'Water System ready.' });
        }

        on(event, callback) {
            if (typeof callback !== 'function') return () => {};
            if (!this.listeners.has(event)) this.listeners.set(event, new Set());
            this.listeners.get(event).add(callback);
            return () => this.listeners.get(event)?.delete(callback);
        }

        emit(event, data = {}) {
            for (const callback of this.listeners.get(event) || []) {
                try { callback(data); } catch (error) { console.error('[SMWaterSystem listener]', error); }
            }
        }

        setCamera(camera) {
            if (!camera) return;
            this.camera = camera;
            this.editor.setCamera(camera);
        }

        setTerrain(terrain) {
            this.terrain = terrain || null;
            this.editor.setTerrain(this.terrain);
            this.terrainAdapter?.setTerrain(this.terrain);
            this.refreshTerrain();
            this.emit('terrainchange', { terrain: this.terrain });
        }

        refreshTerrain() {
            const liveTerrain = this.terrain || window.terrain || null;
            if (liveTerrain && liveTerrain !== this._boundTerrain) {
                this._boundTerrain = liveTerrain;
                this.terrain = liveTerrain;
                this.editor.setTerrain(liveTerrain);
                this.terrainAdapter?.setTerrain(liveTerrain);
            }
            const changed = this.terrainAdapter?.applyBodies(this.bodies.values()) || 0;
            this.bodies.forEach(body => {
                body.group.visible = true;
                if (body.mesh) {
                    body.mesh.visible = true;
                    body.mesh.material.visible = true;
                    body.mesh.frustumCulled = false;
                }
                body.updateDepthProfile?.();
            });

            // Re-sample after carving. This makes the foam follow the final bank
            // shape instead of the pre-carve spline assumption.
            this.shoreFoam?.setTerrainAdapter?.(
                this.terrainAdapter
            );
            this.shoreFoam?.rebuildAll?.(
                this.bodies.values()
            );

            window.dispatchEvent?.(new CustomEvent('sm:water-terrain-refreshed', { detail: { changed, system: this } }));
            return changed;
        }

        queueTerrainRefresh() {
            if (this._terrainRefreshQueued) return;
            this._terrainRefreshQueued = true;
            requestAnimationFrame(() => {
                this._terrainRefreshQueued = false;
                this.refreshTerrain();
            });
        }

        get activeBody() { return this.activeBodyId ? this.bodies.get(this.activeBodyId) || null : null; }
        get bodyCount() { return this.bodies.size; }
        get underwaterBody() { return this.underwater?.activeBody || null; }
        get isUnderwater() { return !!this.underwaterBody; }

        // Rendering can be driven by any viewport.  Update detection using that
        // viewport's camera before deciding whether the underwater compositor
        // must take over the frame.
        isCameraUnderwater(camera = null) {
            const activeCamera =
                camera ||
                window.SMViewportSystem?.getActivePanel?.()?.camera ||
                window.cameraSystem?.activeCamera ||
                window.camera ||
                this.camera;

            if (!activeCamera || !this.underwater) return false;
            return !!this.underwater.update(activeCamera);
        }

        _applyTypeMotionDefaults(type, { preserveQuality = true } = {}) {
            const next =
                String(
                    type ||
                    'river'
                ).toLowerCase();

            const currentQuality =
                this.settings.quality;

            const profiles = {
                river: {
                    type: 'river',
                    waterType: 'river',
                    waveHeight: 0.18,
                    waveLength: 8.0,
                    waveSpeed: 1.10,
                    choppiness: 0.46,
                    waveScale: 1.0,
                    waveSteepness: 0.42,
                    waveChoppiness: 0.46,
                    waveSpread: 0.72,
                    windSpeed: 1.0,
                    microWaveStrength: 0.38,
                    microWaveScale: 1.15,
                    smallWaveStrength: 0.38,
                    normalStrength: 0.30,
                    animationSpeed: 1.25,
                    flowSpeed: 1.05,
                    flowCoherence: 0.88
                },

                lake: {
                    type: 'lake',
                    waterType: 'lake',
                    waveHeight: 0.065,
                    waveLength: 12.5,
                    waveSpeed: 0.62,
                    choppiness: 0.16,
                    waveScale: 1.0,
                    waveSteepness: 0.26,
                    waveChoppiness: 0.16,
                    waveSpread: 0.90,
                    windSpeed: 1.0,
                    microWaveStrength: 0.26,
                    microWaveScale: 1.0,
                    smallWaveStrength: 0.26,
                    normalStrength: 0.25,
                    animationSpeed: 1.10,
                    flowSpeed: 0.10,
                    flowCoherence: 0.24
                },

                ocean: {
                    type: 'ocean',
                    waterType: 'ocean',
                    waveHeight: 0.38,
                    waveLength: 15.0,
                    waveSpeed: 1.02,
                    choppiness: 0.74,
                    waveScale: 1.0,
                    waveSteepness: 0.52,
                    waveChoppiness: 0.74,
                    waveSpread: 0.72,
                    windSpeed: 1.0,
                    microWaveStrength: 0.40,
                    microWaveScale: 1.15,
                    smallWaveStrength: 0.40,
                    normalStrength: 0.32,
                    animationSpeed: 1.20,
                    flowSpeed: 0.30,
                    flowCoherence: 0.46
                },

                pool: {
                    type: 'pool',
                    waterType: 'pool',
                    waveHeight: 0.025,
                    waveLength: 3.5,
                    waveSpeed: 0.55,
                    choppiness: 0.12,
                    waveScale: 1.0,
                    waveSteepness: 0.16,
                    waveChoppiness: 0.12,
                    waveSpread: 1.0,
                    windSpeed: 0.55,
                    microWaveStrength: 0.18,
                    microWaveScale: 0.80,
                    smallWaveStrength: 0.18,
                    normalStrength: 0.18,
                    animationSpeed: 0.85,
                    flowSpeed: 0.02,
                    flowCoherence: 0.05
                }
            };

            Object.assign(
                this.settings,
                profiles[next] ||
                profiles.river
            );

            if (preserveQuality) {
                this.settings.quality =
                    Math.max(
                        1.0,
                        Number(currentQuality) ||
                        1.15
                    );

            // Each water body owns a bounded spectral tile. Sharing one tile
            // between rivers, lakes and oceans would make editing one body's
            // wind unexpectedly change every other body in the scene.
            }

            return this.settings;
        }

        startDraw(type = this.settings.type) {
            const nextType =
                String(
                    type ||
                    'river'
                ).toLowerCase();

            const typeChanged =
                nextType !==
                this.settings.type;

            this.settings.type = nextType;
            this.settings.waterType = nextType;

            if (typeChanged) {
                this._applyTypeMotionDefaults(
                    nextType
                );
            }

            this.editor.setTerrain(this.terrain || window.terrain || null);
            this.editor.start(this.settings.type);
            this.emit('settingschange', { settings: { ...this.settings } });
        }

        editActive() {
            const body = this.activeBody;
            if (!body) {
                this.emit('status', { text: 'Select or create a water body first.' });
                return false;
            }
            this.settings.type = body.type;
            this.settings.waterType = body.type;
            this.editor.edit(body.points, body.type);
            return true;
        }

        finishDraw() {
            const mode = this.editor.mode;
            if (mode === 'idle') {
                if (this.editor.points.length) return this.activeBody ? this.updateActiveFromEditor() : this.createFromEditor();
                this.emit('status', { text: 'No active water path to finish.' });
                return null;
            }
            if (mode === 'edit' && this.activeBody) return this.updateActiveFromEditor();
            return this.createFromEditor();
        }

        cancelDraw() { this.editor.cancel(false); }
        clearPath() { this.editor.clear(); }
        undoPoint() { this.editor.undo(); }

        _validatePoints(type, points) {
            if (type === 'river' && points.length < 2) return 'River needs at least 2 spline points.';
            if ((type === 'lake' || type === 'pool') && points.length < 3) return `${type[0].toUpperCase() + type.slice(1)} needs at least 3 boundary points.`;
            return null;
        }

        createFromEditor() {
            const type = String(this.settings.type || 'river').toLowerCase();
            let points = this.editor.points.map(point => point.clone());
            if (type === 'ocean' && !points.length) points = [this.controls?.target?.clone?.() || window.controls?.target?.clone?.() || new THREE.Vector3()];
            const error = this._validatePoints(type, points);
            if (error) { this.emit('status', { text: error }); return null; }
            const body = new SMWaterBody(this.scene, { ...this.settings, type, points });
            if (!body.mesh) {
                this.emit('status', { text: 'Water geometry could not be created. Add more path points.' });
                body.dispose();
                return null;
            }
            this.bodies.set(body.id, body);
            this._ensureFFTSpectrum(body);
            this.activeBodyId = body.id;
            this.editor.finish();
            this.editor.clearVisuals();
            this.refreshTerrain();
            this.emit('bodycreated', { body });
            this.emit('selectionchange', { body });
            this.emit('status', { text: `${type[0].toUpperCase() + type.slice(1)} water created.` });
            return body;
        }

        updateActiveFromEditor() {
            const body = this.activeBody;
            if (!body) { this.emit('status', { text: 'No active water body to update.' }); return false; }
            const points = this.editor.points.map(point => point.clone());
            const error = this._validatePoints(body.type, points);
            if (error) { this.emit('status', { text: error }); return false; }
            const requestedType = String(this.settings.type || body.type).toLowerCase();
            if (requestedType !== body.type) {
                const typeError = this._validatePoints(requestedType, points);
                if (typeError) { this.emit('status', { text: typeError }); return false; }
                if (body.setType(requestedType) === false) {
                    this.emit('status', { text: 'Water type could not be changed for the current boundary.' });
                    return false;
                }
            }
            if (points.length) body.setPoints(points);
            body.setConfig(this.settings);
            this.editor.finish();
            this.editor.clearVisuals();
            this.refreshTerrain();
            this.emit('bodyupdated', { body });
            this.emit('status', { text: 'Water body updated.' });
            return body;
        }

        selectBody(id) {
            const body = this.bodies.get(id) || null;
            this.activeBodyId = body?.id || null;
            if (body) {
                this.settings = { ...this.settings, ...body.config, type: body.type };
                Object.assign(this.settings, body.material?.userData?.smWaterOptions || {});
                if (this.settings.flowDirection?.isVector2) this.settings.flowDirection = { x: this.settings.flowDirection.x, y: this.settings.flowDirection.y };
            }
            this.emit('selectionchange', { body });
            this.emit('settingschange', { settings: { ...this.settings } });
            return body;
        }

        setType(type) {
            const next =
                String(
                    type ||
                    'river'
                ).toLowerCase();

            if (!['river', 'lake', 'ocean', 'pool'].includes(next)) {
                return;
            }

            const changed =
                next !==
                this.settings.type;

            this.settings.type = next;
            this.settings.waterType = next;

            if (changed) {
                this._applyTypeMotionDefaults(
                    next
                );
            }

            this.emit(
                'settingschange',
                {
                    settings: {
                        ...this.settings
                    }
                }
            );
        }

        setParameter(key, value, { applyToActive = true } = {}) {
            this.settings[key] = key === 'flowDirection' && value?.isVector2 ? { x: value.x, y: value.y } : value;
            if (key === 'type' || key === 'waterType') {
                const nextType = String(value || 'river').toLowerCase();
                this.settings.type = nextType;
                this.settings.waterType = nextType;
            }

            if (String(key).startsWith('underwater') || key === 'deepColor') {
                this.underwaterRenderer?.setOptions?.({ [key]: value });
            }
            const body = this.activeBody;
            if (applyToActive && body) {
                if (key === 'type') body.setType(value);
                else body.setConfig({ [key]: value });

                if (this._terrainKeys.has(key)) {
                    this.refreshTerrain();
                } else {
                    this.shoreFoam?.applyConfig?.(
                        body,
                        { [key]: value }
                    );
                }

                this.emit('bodyupdated', { body });
            }
            this.emit('settingschange', { settings: { ...this.settings }, key, value });
        }

        setParameters(patch = {}, options = {}) {
            Object.assign(this.settings, patch);
            if (patch.type !== undefined || patch.waterType !== undefined) {
                const nextType = String(patch.type || patch.waterType || this.settings.type || 'river').toLowerCase();
                this.settings.type = nextType;
                this.settings.waterType = nextType;
            }

            this.underwaterRenderer?.setOptions?.(patch);
            const body = this.activeBody;
            if (options.applyToActive !== false && body) {
                const requestedType = patch.type || patch.waterType;
                if (requestedType && String(requestedType).toLowerCase() !== body.type) {
                    const typeError = this._validatePoints(String(requestedType).toLowerCase(), body.points || []);
                    if (typeError) {
                        this.emit('status', { text: typeError });
                        return false;
                    }
                    if (body.setType(requestedType) === false) {
                        this.emit('status', { text: 'Water type could not be changed for the current boundary.' });
                        return false;
                    }
                }
                body.setConfig(patch);

                if (
                    Object.keys(patch)
                        .some(key => this._terrainKeys.has(key))
                ) {
                    this.refreshTerrain();
                } else {
                    this.shoreFoam?.applyConfig?.(
                        body,
                        patch
                    );
                }

                this.emit('bodyupdated', { body });
            }
            this.emit('settingschange', { settings: { ...this.settings } });
        }

        applyPreset(name) {
            const preset = this.presets[name];
            if (!preset) return false;
            this.setParameters({ ...preset }, { applyToActive: true });
            this.emit('preset', { name, preset });
            this.emit('status', { text: `Preset applied: ${name.replace(/-/g, ' ')}` });
            return true;
        }

        createNodeGraph() {
            if (!this.nodeGraph && window.SMWaterNodeGraph) this.nodeGraph = new window.SMWaterNodeGraph(this);
            return this.nodeGraph;
        }

        applyNodeGraph(bodyOrId = null) {
            return this.createNodeGraph()?.apply(bodyOrId) || false;
        }

        removeActive() {
            const body = this.activeBody;
            if (!body) return false;
            const id = body.id;
            this.shoreFoam?.remove?.(id);
            this._disposeFFTSpectrum(body);
            body.dispose();
            this.bodies.delete(id);
            this.activeBodyId = null;
            this.editor.clear();
            this.refreshTerrain();
            this.emit('bodyremoved', { id });
            this.emit('selectionchange', { body: null });
            this.emit('status', { text: 'Water body removed.' });
            return true;
        }

        clearAll() {
            this.underwater?.leave();
            for (const body of this.bodies.values()) {
                this.shoreFoam?.remove?.(body.id);
                this._disposeFFTSpectrum(body);
                body.dispose();
            }
            this.bodies.clear();
            this.activeBodyId = null;
            this.editor.clear();
            this.terrainAdapter?.restoreAll();
            this.emit('selectionchange', { body: null });
            this.emit('status', { text: 'All water bodies removed.' });
        }

        getBodyAt(x, z, padding = 0) {
            for (const body of this.bodies.values()) {
                if (body.containsXZ(x, z, padding)) return body;
            }
            return null;
        }

        _ensureFFTSpectrum(body) {
            if (!body?.material || !window.SMWaterFFTSpectrum) return null;
            const existing = this.fftSpectra.get(body.id);
            if (existing) {
                existing.attach(body.material);
                return existing;
            }

            try {
                const spectrum = new window.SMWaterFFTSpectrum(this.renderer, {
                    resolution: 128,
                    tileSize: Math.max(64, Number(body.config?.waveLength || 14) * 13.5)
                });
                spectrum.attach(body.material);
                this.fftSpectra.set(body.id, spectrum);
                return spectrum;
            } catch (error) {
                if (!this._fftWarningShown) {
                    this._fftWarningShown = true;
                    console.warn('[SMWaterSystem] FFT water field unavailable; using procedural spectrum fallback.', error);
                }
                return null;
            }
        }

        _disposeFFTSpectrum(body) {
            const spectrum = body?.id ? this.fftSpectra.get(body.id) : null;
            spectrum?.dispose?.();
            if (body?.id) this.fftSpectra.delete(body.id);
        }

        sampleWaterHeight(worldX, worldZ, time = this.time, bodyOrId = null) {
            const body =
                typeof bodyOrId === 'string'
                    ? this.bodies.get(bodyOrId)
                    : bodyOrId || this.getBodyAt(worldX, worldZ);
            if (!body || !body.containsXZ(worldX, worldZ, 0)) return null;
            return body.surfaceYAt(worldX, worldZ, true, time);
        }

        sampleWaterNormal(worldX, worldZ, time = this.time, bodyOrId = null) {
            const body =
                typeof bodyOrId === 'string'
                    ? this.bodies.get(bodyOrId)
                    : bodyOrId || this.getBodyAt(worldX, worldZ);
            if (!body || !body.containsXZ(worldX, worldZ, 0)) return null;
            return body.surfaceNormalAt(worldX, worldZ, time);
        }

        sampleWater(worldX, worldZ, time = this.time, bodyOrId = null) {
            const body =
                typeof bodyOrId === 'string'
                    ? this.bodies.get(bodyOrId)
                    : bodyOrId || this.getBodyAt(worldX, worldZ);
            if (!body || !body.containsXZ(worldX, worldZ, 0)) {
                return { found: false, surfaceY: null, normal: null, current: null, waterDepth: 0 };
            }
            return body.sampleWaterAt(worldX, worldZ, time);
        }

        getVolumeAt(position) {
            if (!position) {
                return null;
            }

            for (const body of this.bodies.values()) {
                if (
                    body.volume?.containsPoint?.(
                        position,
                        this.time
                    )
                ) {
                    return body.volume;
                }
            }

            return null;
        }

        getCurrentAt(position, target = new THREE.Vector3()) {
            target.set(0, 0, 0);
            if (!position) return target;
            for (const body of this.bodies.values()) {
                if (body.type !== 'river' || !body.containsXZ(position.x, position.z, 0)) continue;
                return body.currentAt(position.x, position.z, target);
            }
            return target;
        }

        addRipple(position, options = {}) {
            if (!position) return 0;
            let count = 0;
            for (const body of this.bodies.values()) {
                if (body.containsXZ(position.x, position.z, options.padding ?? 0.5)) {
                    body.addRipple(position, { ...options, time: this.time });
                    count++;
                }
            }
            if (count === 0 && this.activeBody) {
                this.activeBody.addRipple(position, { ...options, time: this.time });
                count = 1;
            }
            return count;
        }

        registerInteractor(object, options = {}) {
            if (!object?.isObject3D) return false;
            this.interactors.set(object, {
                strength: 0.12, radius: 5.5, speed: 2.8, frequency: 12, decay: 1.6,
                cooldown: 0.12, verticalTolerance: 1.35, minSpeed: 0.12,
                lastTime: -Infinity, lastPosition: null, ...options
            });
            return true;
        }

        unregisterInteractor(object) { return this.interactors.delete(object); }

        _getObjectPhysicsRadius(object) {
            const fromPhysics =
                Number(
                    object?.userData
                        ?.physics
                        ?.boundingRadius
                );

            if (
                Number.isFinite(fromPhysics) &&
                fromPhysics > 0
            ) {
                return THREE.MathUtils.clamp(
                    fromPhysics,
                    0.08,
                    30
                );
            }

            const geometry =
                object?.geometry;

            if (!geometry) {
                return 0.75;
            }

            geometry.computeBoundingSphere?.();

            const radius =
                Number(
                    geometry.boundingSphere?.radius
                ) ||
                0.75;

            object.getWorldScale?.(
                this._tmpPhysicsScale
            );

            const scale =
                Math.max(
                    Math.abs(
                        this._tmpPhysicsScale.x
                    ) || 1,
                    Math.abs(
                        this._tmpPhysicsScale.y
                    ) || 1,
                    Math.abs(
                        this._tmpPhysicsScale.z
                    ) || 1
                );

            return THREE.MathUtils.clamp(
                radius * scale,
                0.08,
                30
            );
        }

        _isWaterPhysicsCandidate(
            object,
            rigidBody = null
        ) {
            if (!object?.isObject3D) {
                return false;
            }

            const data =
                object.userData || {};

            if (
                data.isWater === true ||
                data.isTerrain === true ||
                data.isTerrainMesh === true ||
                data.isTerrainComponent === true ||
                data.isHelper === true ||
                data.isBrushHelper === true
            ) {
                return false;
            }

            const physics =
                data.physics || {};

            const dynamic =
                Number(physics.mass) > 0 ||
                physics.isKinematic === true;

            if (dynamic) {
                return true;
            }

            const label =
                [
                    object.name,
                    data.assetType,
                    data.category,
                    data.tags
                ]
                    .flatMap(value =>
                        Array.isArray(value)
                            ? value
                            : [value]
                    )
                    .filter(Boolean)
                    .join(' ')
                    .toLowerCase();

            return /rock|stone|boulder|pebble|debris|log|wood/.test(
                label
            );
        }

        _isSceneWaterObstacleCandidate(object) {
            if (
                !object?.isMesh ||
                !object.geometry
            ) {
                return false;
            }

            let cursor = object;
            let workspaceObject = false;
            let hasObstacleMarker = false;

            while (
                cursor &&
                cursor !== this.scene
            ) {
                const data =
                    cursor.userData || {};

                if (
                    data.isWater === true ||
                    data.isTerrain === true ||
                    data.isTerrainMesh === true ||
                    data.isTerrainComponent === true ||
                    data.isHelper === true ||
                    data.isBrushHelper === true ||
                    data.isSystemObject === true
                ) {
                    return false;
                }

                workspaceObject =
                    workspaceObject ||
                    data.workspaceGlobal === true;
                hasObstacleMarker =
                    hasObstacleMarker ||
                    data.isObstacle === true ||
                    data.waterObstacle === true ||
                    data.collisionSurface === true ||
                    data.collisionEnabled === true;

                const label =
                    [
                        cursor.name,
                        data.assetType,
                        data.category,
                        data.tags
                    ]
                        .flatMap(value =>
                            Array.isArray(value)
                                ? value
                                : [value]
                        )
                        .filter(Boolean)
                        .join(' ')
                        .toLowerCase();

                if (
                    /obstacle|rock|stone|boulder|pebble|debris|log|wood/.test(
                        label
                    )
                ) {
                    hasObstacleMarker = true;
                }

                cursor = cursor.parent;
            }

            if (hasObstacleMarker) {
                return true;
            }

            // New user-created objects are globally visible roots.  Treat a
            // reasonably sized one as a resting water obstacle even when it
            // has no rigid body or special tag yet.
            return workspaceObject &&
                this._getObjectPhysicsRadius(
                    object
                ) <= 18;
        }

        _scanSceneWaterObstacles() {
            const now = this.time;
            const roots =
                this.scene?.children || [];

            // Do not traverse the whole game scene every frame.  Direct
            // workspace objects are roots; groups are traversed only when the
            // group itself is marked as an obstacle/workspace object.
            if (
                now -
                this._lastWaterObstacleScanAt <
                1.0 &&
                roots.length ===
                this._lastWaterObstacleRootCount
            ) {
                return;
            }

            this.sceneWaterObstacles.clear();

            const inspect = object => {
                if (
                    this._isSceneWaterObstacleCandidate(
                        object
                    )
                ) {
                    this.sceneWaterObstacles.add(
                        object
                    );
                }
            };

            for (const root of roots) {
                inspect(root);

                const rootData =
                    root?.userData || {};
                const rootLabel =
                    [
                        root?.name,
                        rootData.assetType,
                        rootData.category,
                        rootData.tags
                    ]
                        .flatMap(value =>
                            Array.isArray(value)
                                ? value
                                : [value]
                        )
                        .filter(Boolean)
                        .join(' ')
                        .toLowerCase();
                const inspectChildren =
                    rootData.workspaceGlobal === true ||
                    rootData.isObstacle === true ||
                    rootData.waterObstacle === true ||
                    /obstacle|rock|stone|boulder|pebble|debris|log|wood/.test(
                        rootLabel
                    );

                if (
                    inspectChildren &&
                    root?.children?.length
                ) {
                    root.traverse?.(child => {
                        if (child !== root) {
                            inspect(child);
                        }
                    });
                }
            }

            this._lastWaterObstacleScanAt = now;
            this._lastWaterObstacleRootCount =
                roots.length;
        }

        _readPhysicsVelocity(
            rigidBody,
            state,
            position,
            delta
        ) {
            const velocity =
                this._tmpPhysicsVelocity
                    .set(0, 0, 0);

            const bodyVelocity =
                rigidBody?.getLinearVelocity?.();

            if (bodyVelocity) {
                const x =
                    typeof bodyVelocity.x ===
                    'function'
                        ? bodyVelocity.x()
                        : bodyVelocity.x;
                const y =
                    typeof bodyVelocity.y ===
                    'function'
                        ? bodyVelocity.y()
                        : bodyVelocity.y;
                const z =
                    typeof bodyVelocity.z ===
                    'function'
                        ? bodyVelocity.z()
                        : bodyVelocity.z;

                velocity.set(
                    Number(x) || 0,
                    Number(y) || 0,
                    Number(z) || 0
                );
            }

            if (
                velocity.lengthSq() < 1e-6 &&
                state.lastPosition &&
                delta > 1e-5
            ) {
                velocity.copy(
                    position
                ).sub(
                    state.lastPosition
                ).multiplyScalar(
                    1 / delta
                );
            }

            return velocity;
        }

        _emitWaterImpact(
            body,
            position,
            {
                speed = 0,
                radius = 0.75,
                strength = 0.16,
                splash = false
            } = {}
        ) {
            if (!body || !position) {
                return false;
            }

            const surfaceY =
                Number(
                    body.surfaceYAt?.(
                        position.x,
                        position.z,
                        true,
                        this.time
                    )
                );

            if (!Number.isFinite(surfaceY)) {
                return false;
            }

            const impactStrength =
                THREE.MathUtils.clamp(
                    Number(strength) +
                    Math.max(
                        0,
                        Number(speed) || 0
                    ) *
                    0.028,
                    0.08,
                    0.9
                );

            const rippleRadius =
                THREE.MathUtils.clamp(
                    Math.max(
                        1.1,
                        Number(radius) *
                        2.6
                    ) +
                    impactStrength * 3.2,
                    1.1,
                    13
                );

            body.addRipple(
                position,
                {
                    time: this.time,
                    strength: impactStrength,
                    radius: rippleRadius,
                    speed: 2.0 +
                        impactStrength * 4.2,
                    frequency: 7.5 +
                        impactStrength * 7.0,
                    decay: 1.1 +
                        impactStrength * 1.4
                }
            );

            if (
                splash &&
                this.interactionFX
            ) {
                this._tmpImpactPosition.set(
                    position.x,
                    surfaceY,
                    position.z
                );

                body.currentAt?.(
                    position.x,
                    position.z,
                    this._tmpWaterFlow
                );

                this.interactionFX.emitSplash(
                    this._tmpImpactPosition,
                    {
                        strength: impactStrength,
                        radius: THREE.MathUtils.clamp(
                            Number(radius) || 0.75,
                            0.2,
                            4.5
                        ),
                        flowDirection:
                            this._tmpWaterFlow,
                        surfaceY
                    }
                );
            }

            return true;
        }

        _clearFlowObstacles() {
            for (
                const body of
                this.bodies.values()
            ) {
                SMWaterMaterialFactory
                    .setFlowObstacles?.(
                        body.material,
                        []
                    );
            }
        }

        _updatePhysicsWaterInteractions(
            delta
        ) {
            const physics =
                window.physicsSystem ||
                window.smPhysicsSystem ||
                null;

            const entries =
                physics?.meshToBodyMap;

            const waterBodies =
                Array.from(
                    this.bodies.values()
                );

            if (waterBodies.length === 0) {
                this._clearFlowObstacles();
                this.physicsWaterStates.clear();
                return;
            }

            this._scanSceneWaterObstacles();

            const candidates = new Map();

            if (entries?.entries) {
                for (
                    const [object, rigidBody] of
                    entries.entries()
                ) {
                    if (
                        object?.parent &&
                        this._isWaterPhysicsCandidate(
                            object,
                            rigidBody
                        )
                    ) {
                        candidates.set(
                            object,
                            rigidBody
                        );
                    }
                }
            }

            for (
                const object of
                this.sceneWaterObstacles
            ) {
                if (
                    object?.parent &&
                    !candidates.has(object)
                ) {
                    candidates.set(object, null);
                }
            }

            if (candidates.size === 0) {
                this._clearFlowObstacles();
                this.physicsWaterStates.clear();
                return;
            }

            const obstacleLists =
                new Map(
                    waterBodies.map(
                        body =>
                            [
                                body,
                                []
                            ]
                    )
                );
            const seen =
                new Set();
            const now =
                this.time;

            for (
                const [
                    object,
                    rigidBody
                ] of candidates) {
                if (!object?.parent) continue;

                seen.add(object);
                object.getWorldPosition?.(
                    this._tmpPhysicsPosition
                );

                const position =
                    this._tmpPhysicsPosition;
                const radius =
                    this._getObjectPhysicsRadius(
                        object
                    );

                let state =
                    this.physicsWaterStates.get(
                        object
                    );

                if (!state) {
                    state = {
                        initialized: false,
                        lastPosition:
                            position.clone(),
                        insideBodies:
                            new Map(),
                        lastImpact:
                            new Map()
                    };

                    this.physicsWaterStates.set(
                        object,
                        state
                    );
                }

                const velocity =
                    this._readPhysicsVelocity(
                        rigidBody,
                        state,
                        position,
                        delta
                    );
                const speed =
                    velocity.length();
                const physicsProps =
                    object.userData?.physics ||
                    {};
                const dynamic =
                    Number(physicsProps.mass) > 0 ||
                    physicsProps.isKinematic === true ||
                    speed > 0.12;

                for (
                    const body of
                    waterBodies
                ) {
                    if (
                        !body.containsXZ(
                            position.x,
                            position.z,
                            radius * 0.65
                        )
                    ) {
                        state.insideBodies.set(
                            body.id,
                            false
                        );
                        continue;
                    }

                    const surfaceY =
                        Number(
                            body.surfaceYAt(
                                position.x,
                                position.z,
                                true,
                                now
                            )
                        );
                    const depth =
                        Math.max(
                            0.2,
                            Number(
                                body.depthAt?.(
                                    position.x,
                                    position.z
                                )
                            ) ||
                            1
                        );
                    const intersectsWater =
                        Number.isFinite(surfaceY) &&
                        position.y -
                        radius <=
                        surfaceY +
                        0.14 &&
                        position.y +
                        radius >=
                        surfaceY -
                        depth;
                    const wasInside =
                        state.insideBodies.get(
                            body.id
                        ) === true;

                    state.insideBodies.set(
                        body.id,
                        intersectsWater
                    );

                    if (!intersectsWater) {
                        continue;
                    }

                    const obstacleStrength =
                        THREE.MathUtils.clamp(
                            radius * 0.26 +
                            speed * 0.035,
                            0.22,
                            0.95
                        );

                    obstacleLists
                        .get(body)
                        .push({
                            x: position.x,
                            z: position.z,
                            radius,
                            strength:
                                obstacleStrength
                        });

                    const lastImpact =
                        Number(
                            state.lastImpact.get(
                                body.id
                            )
                        ) ||
                        -Infinity;
                    const enteredSurface =
                        state.initialized &&
                        !wasInside;
                    const movingAtSurface =
                        dynamic &&
                        speed > 0.62 &&
                        Math.abs(
                            position.y -
                            surfaceY
                        ) <=
                        radius +
                        0.3;
                    const cooldown =
                        movingAtSurface
                            ? 0.16
                            : 0.28;

                    if (
                        (
                            enteredSurface ||
                            movingAtSurface
                        ) &&
                        now -
                        lastImpact >=
                        cooldown
                    ) {
                        this._emitWaterImpact(
                            body,
                            position,
                            {
                                speed,
                                radius,
                                strength:
                                    obstacleStrength,
                                splash:
                                    enteredSurface ||
                                    speed > 1.05
                            }
                        );

                        state.lastImpact.set(
                            body.id,
                            now
                        );
                    }
                }

                state.lastPosition.copy(
                    position
                );
                state.initialized = true;
            }

            for (
                const [object] of
                this.physicsWaterStates) {
                if (!seen.has(object)) {
                    this.physicsWaterStates.delete(
                        object
                    );
                }
            }

            for (
                const body of
                waterBodies
            ) {
                const obstacles =
                    obstacleLists
                        .get(body)
                        .sort(
                            (a, b) =>
                                b.strength -
                                a.strength
                        )
                        .slice(0, 12);

                SMWaterMaterialFactory
                    .setFlowObstacles?.(
                        body.material,
                        obstacles
                    );
            }
        }

        _autoRegisterPlayer() {
            if (this._autoPlayerObject?.parent) return;
            const player = window.playerSystem?.character?.model || window.playerSystem?.model || window.playerSystem?.character?.root || null;
            if (player?.isObject3D) {
                this._autoPlayerObject = player;
                if (!this.interactors.has(player)) this.registerInteractor(player, { strength: 0.10, radius: 4.5, cooldown: 0.10, verticalTolerance: 1.45, minSpeed: 0.18 });
            }
        }

        _updateInteractors(delta) {
            if (this.bodies.size === 0 || delta <= 0) return;
            this._autoRegisterPlayer();
            const now = this.time;
            const worldPosition = new THREE.Vector3();
            for (const [object, state] of this.interactors) {
                if (!object?.parent) continue;
                object.getWorldPosition(worldPosition);
                const position = worldPosition.clone();
                if (!state.lastPosition) { state.lastPosition = position; continue; }
                const speed = position.distanceTo(state.lastPosition) / Math.max(delta, 1e-4);
                state.lastPosition.copy(position);
                if (speed < state.minSpeed || now - state.lastTime < state.cooldown) continue;
                for (const body of this.bodies.values()) {
                    if (!body.containsXZ(position.x, position.z, 0.35)) continue;
                    const surfaceY = body.surfaceYAt(position.x, position.z, true, now);
                    if (Math.abs(position.y - surfaceY) > state.verticalTolerance) continue;
                    const strength = THREE.MathUtils.clamp(state.strength + speed * 0.012, state.strength, 0.30);
                    this._emitWaterImpact(
                        body,
                        position,
                        {
                            speed,
                            radius:
                                Math.max(
                                    0.25,
                                    Number(state.radius) *
                                    0.22
                                ),
                            strength,
                            splash:
                                speed > 1.15
                        }
                    );
                    state.lastTime = now;
                    break;
                }
            }
        }

        update(delta = 0) {
            // ------------------------------------------------------------
            // WATER FRAME CLOCK
            // ------------------------------------------------------------
            // The visual water clock must never depend on optional systems
            // (underwater, shoreline foam, physics interactions, etc.).
            // If one of those systems fails, waves/flow still keep moving.
            const rawDt = Number(delta);
            const nowMs = performance.now();

            if (!Number.isFinite(this._lastAnimationFrameMs)) {
                this._lastAnimationFrameMs = nowMs;
            }

            const fallbackDt = THREE.MathUtils.clamp(
                (nowMs - this._lastAnimationFrameMs) / 1000,
                0,
                0.05
            );

            this._lastAnimationFrameMs = nowMs;

            const dt = THREE.MathUtils.clamp(
                Number.isFinite(rawDt) && rawDt > 0
                    ? rawDt
                    : fallbackDt,
                0,
                0.05
            );

            this.time += dt;

            // ------------------------------------------------------------
            // TERRAIN / CAMERA REFERENCES
            // ------------------------------------------------------------
            try {
                if (
                    window.terrain &&
                    window.terrain !== this.terrain
                ) {
                    this.setTerrain(window.terrain);
                }
            } catch (error) {
                if (!this._terrainFrameWarningShown) {
                    this._terrainFrameWarningShown = true;
                    console.warn(
                        '[SMWaterSystem] Terrain sync warning; water animation continues.',
                        error
                    );
                }
            }

            const activeCam =
                window.SMViewportSystem?.getActivePanel?.()?.camera ||
                window.cameraSystem?.activeCamera ||
                window.cameraSystem?.camera ||
                window.__smWaterActiveCamera ||
                window.camera ||
                this.camera;

            try {
                if (
                    activeCam &&
                    activeCam !== this.camera
                ) {
                    this.setCamera(activeCam);
                }
            } catch (error) {
                if (!this._cameraFrameWarningShown) {
                    this._cameraFrameWarningShown = true;
                    console.warn(
                        '[SMWaterSystem] Camera sync warning; water animation continues.',
                        error
                    );
                }
            }

            // ------------------------------------------------------------
            // 1. BASE WATER ANIMATION FIRST
            // ------------------------------------------------------------
            // Update uTime before any optional subsystem can throw.
            for (const body of this.bodies.values()) {
                if (!body) continue;

                try {
                    const fftSpectrum = this._ensureFFTSpectrum(body);
                    fftSpectrum?.update?.(this.time, {
                        ...body.config,
                        type: body.type,
                        waterType: body.type
                    });
                    body.update(
                        dt,
                        this.time,
                        { camera: activeCam, cameraUnderwater: false }
                    );

                    if (body.group) {
                        body.group.visible = true;
                    }

                    if (body.mesh) {
                        body.mesh.visible = true;

                        if (body.mesh.material) {
                            body.mesh.material.visible = true;
                        }
                    }

                    if (body.volume?.mesh) {
                        body.volume.mesh.visible =
                            body.config?.waterVolumeVisible !== false;
                    }
                } catch (error) {
                    if (!body.__smAnimationWarningShown) {
                        body.__smAnimationWarningShown = true;
                        console.error(
                            `[SMWaterSystem] Water body animation failed for ${body.id || 'unknown body'}.`,
                            error
                        );
                    }
                }
            }

            // ------------------------------------------------------------
            // 2. UNDERWATER DETECTION (OPTIONAL)
            // ------------------------------------------------------------
            let underwaterBody = null;

            try {
                underwaterBody =
                    this.underwater?.update?.(activeCam) ||
                    null;
            } catch (error) {
                if (!this._underwaterFrameWarningShown) {
                    this._underwaterFrameWarningShown = true;
                    console.warn(
                        '[SMWaterSystem] Underwater update failed; surface animation remains active.',
                        error
                    );
                }
            }

            // Apply only the camera-underwater state after detection.
            // Do not advance time a second time.
            for (const body of this.bodies.values()) {
                try {
                    window.SMWaterMaterialFactory?.setCameraUnderwater?.(
                        body.material,
                        body === underwaterBody
                    );
                } catch (error) {
                    // Camera-underwater state is visual enhancement only.
                }
            }

            // ------------------------------------------------------------
            // 3. INTERACTION / PHYSICS (OPTIONAL)
            // ------------------------------------------------------------
            try {
                this._updateInteractors?.(dt);
            } catch (error) {
                if (!this._interactionFrameWarningShown) {
                    this._interactionFrameWarningShown = true;
                    console.warn(
                        '[SMWaterSystem] Water interactor update warning.',
                        error
                    );
                }
            }

            try {
                this._updatePhysicsWaterInteractions?.(dt);
            } catch (error) {
                if (!this._physicsWaterFrameWarningShown) {
                    this._physicsWaterFrameWarningShown = true;
                    console.warn(
                        '[SMWaterSystem] Physics-water interaction warning.',
                        error
                    );
                }
            }

            // ------------------------------------------------------------
            // 4. RIVERBANK FOAM (OPTIONAL)
            // ------------------------------------------------------------
            try {
                this.shoreFoam?.update?.(
                    dt,
                    this.time
                );
            } catch (error) {
                if (!this._shoreFoamFrameWarningShown) {
                    this._shoreFoamFrameWarningShown = true;
                    console.warn(
                        '[SMWaterSystem] Shore foam update warning; base water animation continues.',
                        error
                    );
                }
            }

            try {
                this.interactionFX?.update?.(dt);
            } catch (error) {
                if (!this._waterFXFrameWarningShown) {
                    this._waterFXFrameWarningShown = true;
                    console.warn(
                        '[SMWaterSystem] Water FX update warning.',
                        error
                    );
                }
            }
        }

        debugAnimation() {
            const rows = [];

            for (const body of this.bodies.values()) {
                rows.push({
                    id: body.id,
                    type: body.type,
                    systemTime: this.time,
                    bodyTime: body.time,
                    uniformTime:
                        body.material?.uniforms?.uTime?.value ??
                        null,
                    waveHeight:
                        body.material?.uniforms?.uWaveHeight?.value ??
                        body.config?.waveHeight ??
                        null,
                    waveSpeed:
                        body.material?.uniforms?.uWaveSpeed?.value ??
                        body.config?.waveSpeed ??
                        null,
                    flowSpeed:
                        body.material?.uniforms?.uFlowSpeed?.value ??
                        body.config?.flowSpeed ??
                        null,
                    visible: body.mesh?.visible !== false,
                    materialVisible:
                        body.mesh?.material?.visible !== false
                });
            }

            console.table(rows);

            console.log(
                '[SMWaterSystem animation debug]',
                {
                    time: this.time,
                    bodyCount: this.bodies.size,
                    shoreFoamEntries:
                        this.shoreFoam?.entries?.size ??
                        0,
                    activeCamera:
                        (window.__smWaterActiveCamera || this.camera)?.name || (window.__smWaterActiveCamera || this.camera)?.type || null
                }
            );

            return rows;
        }

        render(scene = this.scene, camera = null) {
            const activeCamera =
                camera ||
                window.SMViewportSystem?.getActivePanel?.()?.camera ||
                window.cameraSystem?.activeCamera ||
                window.camera ||
                this.camera;

            if (!scene || !activeCamera) return false;

            // Do this for the camera actually being rendered.  An editor can
            // draw multiple viewports in one frame, and a material state set
            // for another viewport would otherwise leave the underwater
            // surface transparent in this one.
            const body =
                this.underwater
                    ? this.underwater.update(
                        activeCamera
                    )
                    : null;

            for (const candidate of this.bodies.values()) {
                SMWaterMaterialFactory.setCameraUnderwater(
                    candidate.material,
                    candidate === body
                );
            }

            if (
                body &&
                this.settings.underwaterPostProcess !== false &&
                this.underwaterRenderer
            ) {
                return this.underwaterRenderer.render(
                    scene,
                    activeCamera,
                    body,
                    this.time
                );
            }

            this.renderer.render(scene, activeCamera);
            return true;
        }

        destroy() {
            if (this._terrainSculptHandler) {
                window.removeEventListener?.(
                    'sm:terrain-changed',
                    this._terrainSculptHandler
                );
                window.removeEventListener?.(
                    'sm:terrain-deformed',
                    this._terrainSculptHandler
                );
                this._terrainSculptHandler = null;
            }

            this.underwaterRenderer?.dispose?.();
            this.underwaterRenderer = null;
            this.underwater?.destroy();
            this.clearAll();
            this.editor.dispose();
            this.terrainAdapter?.clear();
            this.interactors.clear();
            this.physicsWaterStates.clear();
            for (const spectrum of this.fftSpectra.values()) spectrum.dispose?.();
            this.fftSpectra.clear();
            this.shoreFoam?.dispose?.();
            this.shoreFoam = null;
            this.interactionFX?.dispose?.();
            this.interactionFX = null;
            this.listeners.clear();
        }
    }

    window.SMWaterSystem = SMWaterSystem;
    window.initWaterSystem = function (scene, camera, renderer, options = {}) {
        if (window.waterSystem?.destroy) window.waterSystem.destroy();
        const system = new SMWaterSystem(scene, camera, renderer, { controls: window.controls, terrain: window.terrain, ...options });
        window.waterSystem = system;
        window.advancedWaterSystem = system;
        if (window.SMWaterPanel) {
            window.waterPanel?.destroy?.();
            window.waterPanel = new SMWaterPanel(system);
            window.waterPanel.mount();
        }
        window.SMWaterNodePanel?.attach?.(system);
        window.waterNodeGraph = system.nodeGraph;
        return system;
    };
    window.openWaterSystem = function () { window.waterPanel?.open?.(); };
    window.closeWaterSystem = function () { window.waterPanel?.close?.(); };
    window.startDrawingWaterPath = function () { window.waterSystem?.startDraw?.(window.waterSystem.settings.type); };
    window.editWaterPath = function () { window.waterSystem?.editActive?.(); };
    window.finishWaterPath = function () { return window.waterSystem?.finishDraw?.(); };
    window.cancelWaterPath = function () { window.waterSystem?.cancelDraw?.(); };
    window.undoWaterPoint = function () { window.waterSystem?.undoPoint?.(); };
    window.createWater = function () { return window.waterSystem?.createFromEditor?.(); };
    window.clearWaterPath = function () { window.waterSystem?.clearPath?.(); };
    window.removeWaterSystem = function () { return window.waterSystem?.removeActive?.(); };
    window.addWaterRipple = function (position, options = {}) { return window.waterSystem?.addRipple?.(position, options) || 0; };
    window.getWaterCurrentAt = function (position, target) { return window.waterSystem?.getCurrentAt?.(position, target) || (target?.set?.(0, 0, 0) ?? new THREE.Vector3()); };
    window.getWaterHeightAt = function (x, z, time, bodyOrId) { return window.waterSystem?.sampleWaterHeight?.(x, z, time, bodyOrId) ?? null; };
    window.getWaterNormalAt = function (x, z, time, bodyOrId) { return window.waterSystem?.sampleWaterNormal?.(x, z, time, bodyOrId) ?? null; };
    window.getWaterSampleAt = function (x, z, time, bodyOrId) { return window.waterSystem?.sampleWater?.(x, z, time, bodyOrId) || { found: false, surfaceY: null, normal: null, current: null, waterDepth: 0 }; };
    window.bindWaterTerrain = function (terrain) { window.waterSystem?.setTerrain?.(terrain); return window.waterSystem?.terrainAdapter || null; };
    window.createWaterNodeGraph = function () { const graph = window.waterSystem?.createNodeGraph?.(); window.waterNodeGraph = graph; return graph; };
    window.applyWaterNodeGraph = function (bodyOrId) { return window.waterSystem?.applyNodeGraph?.(bodyOrId) || false; };

    // Use this from the engine render loop instead of renderer.render(scene, camera).
    window.renderWaterAwareFrame = function (sceneArg = window.scene, cameraArg = null) {
        if (window.waterSystem?.render) {
            return window.waterSystem.render(
                sceneArg,
                cameraArg ||
                window.SMViewportSystem?.getActivePanel?.()?.camera ||
                window.cameraSystem?.activeCamera ||
                window.camera
            );
        }

        const activeRenderer = window.renderer;
        const activeCamera =
            cameraArg ||
            window.SMViewportSystem?.getActivePanel?.()?.camera ||
            window.cameraSystem?.activeCamera ||
            window.camera;

        if (activeRenderer && sceneArg && activeCamera) {
            activeRenderer.render(sceneArg, activeCamera);
            return true;
        }

        return false;
    };
})();
