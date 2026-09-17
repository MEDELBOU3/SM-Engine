// ============================================================================
// SM ENGINE — init() QUALITY-FIRST / RENDER-FOUNDATION VERSION
// Drop-in replacement for the old init().
// Goal:
//   - ONE renderer owner
//   - ONE directional-light/shadow authority
//   - no bootstrap global fill that leaks into interiors
//   - no auto exposure while the base renderer is still being validated
//   - no dynamic-resolution blur during quality debugging
//   - imported meshes automatically cast/receive shadows
//   - architectural single-sided meshes become interior-safe
//   - no duplicate RAF startup
//   - legacy/experimental lighting managers stay disabled until explicitly enabled
// ============================================================================

async function init() {
    if (initCompleted || initStarted) {
        console.warn('[init] Duplicate init() call ignored.');
        return;
    }

    initStarted = true;

    if (typeof THREE === 'undefined') {
        console.error('[init] THREE.js is not loaded.');
        initStarted = false;
        return;
    }

    // ------------------------------------------------------------------------
    // QUALITY-FIRST POLICY
    // ------------------------------------------------------------------------
    // Keep this true while fixing the renderer. Later you can expose it as a
    // real graphics preset. In this mode we prefer correct/clean rendering over
    // aggressive performance tricks.
    const QUALITY_FIRST = true;

    // Do NOT enable experimental/global systems that can fight the core lighting
    // pipeline unless explicitly opted in.
    const ENABLE_EXPERIMENTAL_LUMEN =
        localStorage.getItem('sm_enable_experimental_lumen') === '1';

    const ENABLE_AUTO_EXPOSURE =
        localStorage.getItem('sm_enable_auto_exposure') === '1';

    let _animateAlreadyCalled = false;

    const _safeStartAnimate = () => {
        if (_animateAlreadyCalled) return;
        if (typeof animate !== 'function') {
            console.warn('[init] animate() is unavailable.');
            return;
        }
        _animateAlreadyCalled = true;
        console.log('[init] Starting the single engine render loop.');
        animate();
    };

    const getStartupWorkspaceMode = () =>
        String(
            window.workspaceManager?.currentMode ||
            localStorage.getItem('sm_workspace_mode') ||
            'FILM'
        ).toUpperCase();

    const getActiveViewportCamera = () =>
        window.SMViewportSystem?.getActivePanel?.()?.camera ||
        window._viewedCamera ||
        window.camera ||
        camera ||
        null;

    const isArchitecturalMesh = (object) => {
        if (!object?.isMesh) return false;

        const ud = object.userData || {};
        if (
            ud.isBuilding === true ||
            ud.isBuildingPart === true ||
            ud.isArchitecture === true ||
            ud.isArchitectural === true ||
            ud.isCityObject === true ||
            ud.isCityRoot === true ||
            ud.isProceduralCity === true ||
            ud.interiorVisible === true ||
            ud.doubleSided === true
        ) {
            return true;
        }

        const name = String(object.name || '').toLowerCase();
        const parentName = String(object.parent?.name || '').toLowerCase();

        return (
            /wall|building|house|room|roof|ceiling|floor|door|window|warehouse|tower|corridor|hall|interior|exterior|architecture|city|apartment|garage|shop|office|facade|pillar|column/.test(name) ||
            /building|house|room|warehouse|tower|architecture|city|interior|garage/.test(parentName)
        );
    };

    const makeMaterialInteriorSafe = (material) => {
        if (!material) return;
        if (material.isShaderMaterial) return;

        material.side = THREE.DoubleSide;

        if ('shadowSide' in material) {
            material.shadowSide = THREE.DoubleSide;
        }

        material.needsUpdate = true;
    };

    const applyHighQualityMaterialDefaults = (material) => {
        if (!material || material.isShaderMaterial) return;

        material.userData = material.userData || {};

        // PBR stability / banding reduction.
        material.dithering = true;

        // Keep imported source textures sharp at grazing angles. This does not
        // change texture resolution; it only uses the GPU's anisotropic sampler.
        const maxAnisotropy = Math.max(
            1,
            Math.min(
                8,
                Number(renderer?.capabilities?.getMaxAnisotropy?.() || 1)
            )
        );

        const textureSlots = [
            'map',
            'normalMap',
            'roughnessMap',
            'metalnessMap',
            'aoMap',
            'emissiveMap',
            'alphaMap',
            'bumpMap',
            'displacementMap',
            'lightMap'
        ];

        for (const slot of textureSlots) {
            const texture = material[slot];
            if (!texture?.isTexture) continue;

            if ((texture.anisotropy || 1) < maxAnisotropy) {
                texture.anisotropy = maxAnisotropy;
                texture.needsUpdate = true;
            }
        }

        material.needsUpdate = true;
    };

    const prepareRenderableTree = (root, options = {}) => {
        if (!root?.traverse) return root;

        const forceArchitectureDoubleSide =
            options.forceArchitectureDoubleSide !== false;

        root.traverse((obj) => {
            obj.userData = obj.userData || {};

            if (!obj.isMesh) return;

            // Editor/system helpers must never enter authored shadow maps.
            const isHelper =
                obj.userData.isSystemObject === true ||
                obj.userData.isEditorHelper === true ||
                obj.userData.excludeFromShadows === true ||
                obj.name === 'axesHelper' ||
                /helper|gizmo|grid|transformcontrols/i.test(String(obj.name || ''));

            if (isHelper) {
                obj.castShadow = false;
                obj.receiveShadow = false;
                return;
            }

            // Every authored render mesh participates in the shadow solution
            // unless explicitly disabled.
            if (obj.userData.noCastShadow !== true) {
                obj.castShadow = true;
            }

            if (obj.userData.noReceiveShadow !== true) {
                obj.receiveShadow = true;
            }

            const materials = Array.isArray(obj.material)
                ? obj.material
                : [obj.material];

            materials.forEach(applyHighQualityMaterialDefaults);

            if (forceArchitectureDoubleSide && isArchitecturalMesh(obj)) {
                materials.forEach(makeMaterialInteriorSafe);
                obj.userData.smInteriorSafe = true;
            }

            // Avoid stale frustum data after imports/rig operations.
            obj.updateMatrixWorld?.(true);
        });

        if (renderer?.shadowMap) {
            renderer.shadowMap.needsUpdate = true;
        }

        return root;
    };

    const configureMainRenderer = (rendererRef) => {
        if (!rendererRef) return;

        rendererRef.sortObjects = true;
        rendererRef.autoClear = true;

        // Shadow foundation.
        rendererRef.shadowMap.enabled = true;
        rendererRef.shadowMap.type = THREE.PCFSoftShadowMap;
        rendererRef.shadowMap.autoUpdate = true;
        rendererRef.shadowMap.needsUpdate = true;

        // Modern physically based lighting semantics.
        rendererRef.physicallyCorrectLights = true;
        if ('useLegacyLights' in rendererRef) {
            rendererRef.useLegacyLights = false;
        }

        // Correct output transform.
        if (THREE.SRGBColorSpace !== undefined) {
            rendererRef.outputColorSpace = THREE.SRGBColorSpace;
        } else if (THREE.sRGBEncoding !== undefined) {
            rendererRef.outputEncoding = THREE.sRGBEncoding;
        }

        // Stable fixed exposure while validating lighting.
        rendererRef.toneMapping = THREE.ACESFilmicToneMapping;
        rendererRef.toneMappingExposure = 1.0;

        // Stable full-quality pixel density. PerformanceManager must not fight
        // this while QUALITY_FIRST is enabled.
        const maxPixelRatio = QUALITY_FIRST ? 2 : 1.75;
        rendererRef.setPixelRatio(
            Math.min(window.devicePixelRatio || 1, maxPixelRatio)
        );

        rendererRef.setClearColor(0x393939, 1);
    };

    const configureSunShadows = (light) => {
        if (!light?.isDirectionalLight || !light.shadow) return false;

        light.castShadow = true;
        light.userData = light.userData || {};
        light.userData.shadowRequested = true;
        light.userData.forceShadow = true;
        light.userData.allowShadowBudgetDisable = false;

        const maxTextureSize =
            renderer?.capabilities?.maxTextureSize ||
            renderer?.capabilities?.getMaxAnisotropy?.() ||
            4096;

        const mapSize = Math.min(4096, Number(maxTextureSize) || 4096);
        light.shadow.mapSize.set(mapSize, mapSize);

        // A sensible editor/open-world starter volume.
        // A future CSM system should replace this for very large worlds.
        const shadowCamera = light.shadow.camera;
        if (shadowCamera?.isOrthographicCamera) {
            const area = 65;
            shadowCamera.left = -area;
            shadowCamera.right = area;
            shadowCamera.top = area;
            shadowCamera.bottom = -area;
            shadowCamera.near = 0.5;
            shadowCamera.far = 350;
            shadowCamera.updateProjectionMatrix?.();
        }

        light.shadow.bias = -0.0002;
        light.shadow.normalBias = 0.018;
        if ('radius' in light.shadow) light.shadow.radius = 2;

        light.shadow.needsUpdate = true;
        renderer.shadowMap.needsUpdate = true;

        return true;
    };

    const disableCompetingLightingManagers = () => {
        // During this migration SkyLightingSystem is the only live direct-light
        // and shadow authority. New managers may exist for future migration, but
        // they must not mutate the live renderer/light state.
        if (window.smLightingManager) {
            window.smLightingManager.enabled = false;
        }

        if (window.smShadowManager) {
            window.smShadowManager.enabled = false;
        }

        if (!ENABLE_EXPERIMENTAL_LUMEN && window.lumenSystem) {
            try {
                window.lumenSystem.setEnabled?.(false);
                window.lumenSystem.enabled = false;
            } catch { }
        }
    };

    const applyWorkspaceWorldPolicy = (mode = getStartupWorkspaceMode()) => {
        const normalized = String(mode || 'FILM').toUpperCase();

        // Do not use fog to hide broken lighting/materials during renderer
        // validation. Workspace systems may opt in later.
        if (QUALITY_FIRST) {
            scene.fog = null;
        }

        // Keep a deterministic fallback background.
        if (
            normalized !== 'GAMEPLAY_SAMPLE' &&
            !scene.background
        ) {
            scene.background = new THREE.Color(0x393939);
        }

        // PBR/IBL POLICY:
        // Never blank scene.environment merely because local reflection probes
        // are not ready. Doing so removes the diffuse/specular image-based light
        // that MeshStandardMaterial/MeshPhysicalMaterial need and makes imported
        // Blender/glTF assets look flat, dark and unrelated to their DCC result.
        //
        // Until local probes become authoritative we accept one global PMREM as
        // the physically useful fallback. Interior leakage is a separate probe/GI
        // problem and must not be "fixed" by deleting IBL globally.
        const skySystem = window.skyLightingSystem || null;
        const fallbackEnvironment =
            skySystem?._externalEnvRT?.texture ||
            skySystem?._envRT?.texture ||
            null;

        if (!scene.environment && fallbackEnvironment) {
            scene.environment = fallbackEnvironment;
        }

        if ('environmentIntensity' in scene) {
            const requestedEnvironmentIntensity = Number(
                skySystem?._externalEnvIntensity ??
                skySystem?.cfg?.externalEnvIntensity ??
                skySystem?.cfg?.envIntensity ??
                1.0
            );

            scene.environmentIntensity = Number.isFinite(requestedEnvironmentIntensity)
                ? Math.max(0.35, requestedEnvironmentIntensity)
                : 1.0;
        }

        // Three r147 reads envMapIntensity from each PBR material rather than
        // scene.environmentIntensity. Keep authored values, but repair accidental
        // zero/near-zero values on imported PBR materials when an environment is
        // active so reflections and rough diffuse IBL remain visible.
        if (scene.environment) {
            scene.traverse((object) => {
                if (!object?.isMesh || !object.material) return;

                const materials = Array.isArray(object.material)
                    ? object.material
                    : [object.material];

                for (const material of materials) {
                    if (!material) continue;
                    if (!material.isMeshStandardMaterial && !material.isMeshPhysicalMaterial) continue;
                    if (material.envMapIntensity === undefined) continue;

                    material.userData = material.userData || {};

                    if (!Number.isFinite(material.userData.__smAuthoredEnvMapIntensity)) {
                        material.userData.__smAuthoredEnvMapIntensity =
                            Number.isFinite(material.envMapIntensity)
                                ? material.envMapIntensity
                                : 1.0;
                    }

                    // Do not overwrite deliberate strong values; only prevent a
                    // dead/black PBR response caused by legacy environment logic.
                    if (!Number.isFinite(material.envMapIntensity) || material.envMapIntensity < 0.2) {
                        material.envMapIntensity = Math.max(
                            0.65,
                            Number(material.userData.__smAuthoredEnvMapIntensity) || 1.0
                        );
                        material.needsUpdate = true;
                    }
                }
            });
        }
    };

    const installSceneMutationHooks = () => {
        if (!scene || scene.__smMutationHooksInstalled) return;

        scene.__smMutationHooksInstalled = true;

        const originalAdd = scene.add;
        const originalRemove = scene.remove;

        scene.add = function (...objectsToAdd) {
            const result = originalAdd.apply(this, objectsToAdd);

            for (const object of objectsToAdd) {
                if (!object?.isObject3D) continue;

                prepareRenderableTree(object);

                if (
                    object.isHemisphereLight &&
                    typeof window.dedupeHemisphereLights === 'function'
                ) {
                    queueMicrotask(() => {
                        window.dedupeHemisphereLights({
                            preserveCustomLights: false
                        });
                    });
                }

                if (
                    !object.userData?.ignoreInTimeline &&
                    typeof addObjectToTimeline === 'function'
                ) {
                    addObjectToTimeline(object);
                }

                let isDynamicOrSkinned = false;

                object.traverse?.((child) => {
                    child.userData = child.userData || {};

                    if (
                        child.isSkinnedMesh ||
                        child.isBone ||
                        child.userData.hasSkeleton ||
                        child.userData.hasRig
                    ) {
                        isDynamicOrSkinned = true;
                        child.userData.isDynamicMesh = true;
                    }
                });

                object.userData = object.userData || {};
                if (isDynamicOrSkinned) {
                    object.userData.isDynamicMesh = true;
                }

                const excludedFromNanite =
                    object.userData.isNaniteOriginal ||
                    object.userData.isNaniteLOD ||
                    object.userData.isTerrain ||
                    object.userData.isDynamicMesh ||
                    object.userData.excludeFromNanite ||
                    object.userData.workspaceOnly === 'GAME_DEV' ||
                    object.userData.workspaceOnly === 'GAMEPLAY_SAMPLE' ||
                    object.userData.isGameplaySample ||
                    object.userData.isGameDevelopmentEnvironment ||
                    [
                        'NaniteDebugGroup',
                        'advancedGrid',
                        'UnrealEngineFloor',
                        'DistanceMarkers',
                        'SMGameplaySampleFloor',
                        'SMGameplaySampleEnvironment',
                        'SMGameplaySampleObstacles'
                    ].includes(object.name);

                if (
                    naniteSystem &&
                    object.isMesh &&
                    object.geometry &&
                    !excludedFromNanite
                ) {
                    const triangleCount =
                        object.geometry.index?.count
                            ? object.geometry.index.count / 3
                            : object.geometry.attributes.position?.count / 3;

                    if ((triangleCount || 0) > 100) {
                        try {
                            naniteSystem.addMesh(object, {
                                autoGenerateLODs: true,
                                isStatic: false,
                                preserveMaterials: true
                            });
                        } catch (error) {
                            console.warn('[Nanite] addMesh failed:', object.name, error);
                        }
                    }
                }

                const skipAutoRig =
                    object.userData?.isPlayer ||
                    object.userData?.isPlayerRoot ||
                    object.userData?.isPlayerVisual ||
                    object.userData?.isRuntimeCharacter ||
                    object.userData?.skipAutoRig;

                if (
                    window.rigManager?.setupRigForObject &&
                    !object.userData?.isSystemObject &&
                    !skipAutoRig
                ) {
                    let containsBones = false;

                    object.traverse?.((child) => {
                        child.userData = child.userData || {};

                        if (child.isBone) {
                            containsBones = true;
                            child.userData.ignoreInHierarchy = false;
                            child.userData.isSystemObject = false;
                            child.userData.selectable = true;
                            child.userData.expanded = true;
                            child.visible = true;
                        }

                        if (child.isSkinnedMesh && child.skeleton) {
                            child.frustumCulled = false;
                            child.skeleton.update?.();
                        }
                    });

                    if (containsBones && !object.userData.hasRig) {
                        object.userData.expanded = true;
                        object.userData.ignoreInHierarchy = false;

                        queueMicrotask(() => {
                            try {
                                window.rigManager.setupRigForObject(object);
                                window.rigManager.showRigForObject?.(object);
                                window.hierarchyManager?.renderAll?.();
                                updateHierarchy?.();
                            } catch (error) {
                                console.warn('[Rig] Automatic setup failed:', error);
                            }
                        });
                    }
                }

                if (window.performanceManager?.registerObjectTree) {
                    queueMicrotask(() => {
                        if (!object?.parent && object !== scene) return;
                        window.performanceManager?.registerObjectTree?.(object);
                    });
                }

                const activeShadingMode =
                    window.SMViewportShading?.getMode?.();

                if (
                    !object.userData?.isSystemObject &&
                    (activeShadingMode === 'solid' ||
                     activeShadingMode === 'wireframe')
                ) {
                    queueMicrotask(() => {
                        if (!object.parent) return;
                        window.SMViewportShading?.refresh?.();
                    });
                }

                if (window.smMaterialSystem?.registerMesh) {
                    queueMicrotask(() => {
                        if (!object?.parent && object !== scene) return;

                        object.traverse?.((child) => {
                            if (child?.isMesh) {
                                window.smMaterialSystem.registerMesh(child);
                            }
                        });
                    });
                }

                window.smSceneManager?.registerObject?.(object, {
                    recursive: true,
                    source: 'scene.add'
                });

                if (
                    window.persistenceManager?.hasLoadedData &&
                    !object.userData.isSystemObject
                ) {
                    window.persistenceManager.autoSave();
                }
            }

            renderer?.shadowMap &&
                (renderer.shadowMap.needsUpdate = true);

            return result;
        };

        scene.remove = function (...objectsToRemove) {
            const result = originalRemove.apply(this, objectsToRemove);

            for (const object of objectsToRemove) {
                if (!object?.isObject3D) continue;

                window.smSceneManager?.unregisterObject?.(object, {
                    recursive: true,
                    source: 'scene.remove'
                });

                window.performanceManager?.unregisterObjectTree?.(
                    object,
                    true
                );

                if (
                    window.persistenceManager?.hasLoadedData &&
                    !object.userData?.isSystemObject
                ) {
                    window.persistenceManager.autoSave();
                }
            }

            renderer?.shadowMap &&
                (renderer.shadowMap.needsUpdate = true);

            return result;
        };
    };

    const installRenderDiagnostics = () => {
        window.SMRenderFoundationDebug = () => {
            const activeCamera = getActiveViewportCamera();

            const lights = [];
            const meshes = [];

            scene?.traverse?.((obj) => {
                if (obj.isLight) {
                    lights.push({
                        name: obj.name,
                        type: obj.type,
                        visible: obj.visible,
                        intensity: obj.intensity,
                        castShadow: obj.castShadow
                    });
                }

                if (obj.isMesh) {
                    meshes.push(obj);
                }
            });

            const authoredMeshes = meshes.filter(
                (m) => !m.userData?.isSystemObject
            );

            return {
                renderer: {
                    outputColorSpace: renderer?.outputColorSpace,
                    outputEncoding: renderer?.outputEncoding,
                    toneMapping: renderer?.toneMapping,
                    exposure: renderer?.toneMappingExposure,
                    shadowEnabled: renderer?.shadowMap?.enabled,
                    shadowType: renderer?.shadowMap?.type,
                    pixelRatio: renderer?.getPixelRatio?.()
                },

                camera: activeCamera
                    ? {
                        name: activeCamera.name,
                        type: activeCamera.type,
                        near: activeCamera.near,
                        far: activeCamera.far,
                        fov: activeCamera.fov
                    }
                    : null,

                scene: {
                    fog: scene?.fog?.type || null,
                    background: !!scene?.background,
                    environment: !!scene?.environment,
                    environmentIntensity:
                        scene?.environmentIntensity ?? null,
                    meshes: meshes.length,
                    authoredMeshes: authoredMeshes.length,
                    castShadowMeshes:
                        authoredMeshes.filter((m) => m.castShadow).length,
                    receiveShadowMeshes:
                        authoredMeshes.filter((m) => m.receiveShadow).length
                },

                lighting: {
                    skyLightingSystem: !!window.skyLightingSystem,
                    lumenEnabled:
                        !!window.lumenSystem?.enabled,
                    smLightingManagerEnabled:
                        !!window.smLightingManager?.enabled,
                    smShadowManagerEnabled:
                        !!window.smShadowManager?.enabled,
                    lights
                },

                performance: {
                    dynamicResolutionMin:
                        window.performanceManager?.dynamicResolution
                            ?.options?.minScale ??
                        window.performanceManager?.options
                            ?.dynamicResolution?.minScale ??
                        null,
                    dynamicResolutionMax:
                        window.performanceManager?.dynamicResolution
                            ?.options?.maxScale ??
                        window.performanceManager?.options
                            ?.dynamicResolution?.maxScale ??
                        null
                },

                qualityFirst: QUALITY_FIRST,
                autoExposureEnabled: ENABLE_AUTO_EXPOSURE
            };
        };

        window.SMRenderFoundationRepairScene = () => {
            prepareRenderableTree(scene);

            window.dedupeHemisphereLights?.({
                preserveCustomLights: false
            });

            window.skyLightingSystem?.ensureRigAttached?.();
            window.skyLightingSystem?.enforceGlobalLighting?.({
                refreshShadows: true
            });

            configureSunShadows(
                window.skyLightingSystem?.sunLight ||
                window.sunLight
            );

            disableCompetingLightingManagers();
            applyWorkspaceWorldPolicy();

            renderer.shadowMap.needsUpdate = true;
            window.updateHierarchy?.();

            return window.SMRenderFoundationDebug();
        };
    };

    console.log('[init] Starting SM Engine — quality-first rendering foundation.');

    window.__smInitErrorHandler = (event) => {
        console.error('[init] Uncaught initialization error:', event);
        console.error('[init] Error stack:', event?.error?.stack || event?.stack);
    };

    window.addEventListener(
        'error',
        window.__smInitErrorHandler
    );

    try {
        // =====================================================================
        // 1. SCENE
        // =====================================================================
        if (typeof THREE.BufferGeometryUtils === 'undefined') {
            console.warn('[init] THREE.BufferGeometryUtils is not loaded.');
        }

        if (typeof THREE.SimplifyModifier === 'undefined') {
            console.warn(
                '[init] THREE.SimplifyModifier is not loaded. Nanite simplification may be unavailable.'
            );
        }

        scene = new THREE.Scene();
        window.scene = scene;

        scene.background = new THREE.Color(0x393939);

        // Start from a clean lighting diagnostic state.
        // Fog can be reintroduced after direct lighting/materials are correct.
        scene.fog = null;

        // NO bootstrap HemisphereLight here.
        // A global hemi/ambient fill leaks through closed architecture because it
        // has no occlusion knowledge. SkyLightingSystem will own world lighting.
        installHemisphereLightDedupe?.(scene);

        // =====================================================================
        // 2. MAIN RENDERER CONTAINER
        // =====================================================================
        mainRendererContainer =
            document.getElementById('renderer-container');

        if (!mainRendererContainer) {
            throw new Error(
                'Critical: renderer-container was not found.'
            );
        }

        // =====================================================================
        // 3. CAMERA
        // =====================================================================
        window.cameraSystem = new CameraSystem(
            scene,
            mainRendererContainer,
            {
                fov: 50,
                near: 0.1,
                far: 2000,
                orthoFrustumSize: 20
            }
        );

        cameraSystem.createPerspectiveCamera();
        cameraSystem.createOrthographicCamera();

        camera = cameraSystem.camera;
        orthographicCamera = cameraSystem.orthographicCamera;

        window.camera = camera;

        currentViewMode = cameraSystem.currentViewMode;

        window.addEventListener(
            'sm:camera-view-changed',
            (event) => {
                currentViewMode = event.detail.mode;
            }
        );

        window.switchToPerspectiveFromOrtho = () =>
            window.cameraSystem?.switchToPerspective?.();

        // =====================================================================
        // 4. ONE MAIN WEBGL RENDERER
        // =====================================================================
        renderer = new THREE.WebGLRenderer({
            antialias: true,
            powerPreference: 'high-performance',
            stencil: true,
            depth: true,
            precision: 'highp',

            // The editor viewport does not require a transparent framebuffer.
            alpha: false

            // Intentionally NO logarithmicDepthBuffer here.
            // The 0.1 -> 2000 camera range does not justify the extra shader/
            // depth complexity during renderer stabilization.
        });

        window.renderer = renderer;

        mainRendererContainer.appendChild(
            renderer.domElement
        );

        const initialRendererWidth = Math.max(
            1,
            mainRendererContainer.clientWidth
        );

        const initialRendererHeight = Math.max(
            1,
            mainRendererContainer.clientHeight
        );

        renderer.setSize(
            initialRendererWidth,
            initialRendererHeight,
            false
        );

        renderer.domElement.style.width = '100%';
        renderer.domElement.style.height = '100%';
        renderer.domElement.style.display = 'block';

        configureMainRenderer(renderer);

        bindMainRendererContextRecoveryHandlers?.();
        initSelectionComposer?.();

        window.__smSelectionComposer =
            window.__smSelectionComposer ||
            window.composer ||
            null;

        clock = new THREE.Clock();

        // =====================================================================
        // 5. HIERARCHY + CAMERA CONTROLS
        // =====================================================================
        if (
            typeof HierarchyManager !== 'undefined' &&
            !window.hierarchyManager
        ) {
            window.hierarchyManager =
                new HierarchyManager(scene);

            console.log(
                '[init] HierarchyManager initialized.'
            );
        }

        cameraSystem.setupOrbitControls(renderer);

        controls = cameraSystem.controls;

        if (controls) {
            controls.mouseButtons = {
                LEFT: THREE.MOUSE.ROTATE,
                MIDDLE: THREE.MOUSE.DOLLY,
                RIGHT: THREE.MOUSE.NONE
            };
        }

        renderer.domElement.addEventListener(
            'contextmenu',
            (event) => event.preventDefault()
        );

        if (window.SMViewportSystem) {
            try {
                window.SMViewportSystem.init(
                    document.getElementById('sm-viewport-root')
                );
            } catch (viewportError) {
                // A hidden 2D/auxiliary panel may publish a zero-size resize
                // during bootstrap. Keep the main editor lifecycle alive; the
                // panel will receive its real size on the next layout pass.
                console.warn('[init] Legacy viewport panel bootstrap deferred:', viewportError);
            }
        }

        // Clean viewport authority: it owns frame ordering, camera/layout
        // synchronization and the single update -> render lifecycle. Keep
        // autoStart off because animate() is the one RAF owner during the
        // migration; it drives SMViewport.stepFromLegacyFrame().
        if (typeof window.initSMViewport === 'function') {
            try {
                const cleanViewport = window.initSMViewport({
                    scene,
                    renderer,
                    host: mainRendererContainer,
                    overlayHost: mainRendererContainer,
                    qualityPreset: QUALITY_FIRST ? 'HIGH' : 'MEDIUM',
                    autoStart: false
                });

                if (!cleanViewport?.initialized) {
                    console.warn('[init] Clean viewport was not initialized.');
                }
            } catch (viewportError) {
                // The clean viewport is being introduced behind a fail-open
                // boundary. A layout/browser race must never prevent Player,
                // AssetsPanel, TransformControls or the legacy frame fallback
                // from completing initialization.
                window.smViewport = null;
                window.SMViewport = null;
                console.error(
                    '[init] Clean viewport unavailable; using legacy fallback:',
                    viewportError
                );
            }
        }

        // =====================================================================
        // 6. TRANSFORM CONTROLS
        // =====================================================================
        transformControls?.dispose?.();

        transformControls =
            new THREE.TransformControls(
                camera,
                renderer.domElement
            );

        window.transformControls = transformControls;

        markTransformControlsChildren?.(transformControls);
        fixTransformControlsGizmoRendering?.(transformControls);

        scene.add(transformControls);

        transformControls.detach();
        transformControls.visible = false;

        updateTransformControlsForActiveView?.();
        primeTransformControlsInteraction?.();
        window.smViewport?.cameraRouter?.syncEditorControls?.();

        transformControls.addEventListener(
            'dragging-changed',
            (event) => {
                if (controls) {
                    controls.enabled = !event.value;
                }
            }
        );

        const tcHelper =
            transformControls.getHelper?.() ||
            transformControls;

        tcHelper?.traverse?.((child) => {
            child.castShadow = false;
            child.receiveShadow = false;
            child.userData = child.userData || {};
            child.userData.isSystemObject = true;
            child.userData.isEditorHelper = true;
            child.userData.isTransformControlsChild = true;
            child.userData.excludeFromShadows = true;
            child.userData.ignoreInTimeline = true;
        });

        // =====================================================================
        // 7. SCENE ARCHITECTURE
        // =====================================================================
        if (window.SMSceneManager) {
            window.smSceneManager =
                new window.SMSceneManager(scene).initialize();

            window.sceneManager =
                window.smSceneManager;

            window.smSceneInspectorBridge =
                new window.SMSceneInspectorBridge(
                    window.smSceneManager
                ).initialize();

            window.getSceneArchitectureStats = () =>
                window.smSceneManager?.getStats?.() || null;
        } else {
            console.warn(
                '[SM Scene] Scene architecture modules are unavailable.'
            );
        }

        installSceneMutationHooks();

        // =====================================================================
        // 8. NANITE + PERFORMANCE
        // =====================================================================
        naniteSystem =
            new NaniteSystem(
                scene,
                camera,
                renderer
            );

        performanceManager =
            new PerformanceManager(
                scene,
                camera,
                renderer,
                {
                    targetFPS: 60,
                    autoRegisterScene: true,
                    autoOptimize: true,

                    autoClusterHeavyMeshes: false,
                    autoBuildInstances: false,

                    visibility: {
                        autoRegister: false
                    },

                    // IMPORTANT:
                    // Lock resolution to full scale while fixing visual quality.
                    dynamicResolution: QUALITY_FIRST
                        ? {
                            minScale: 1.0,
                            maxScale: 1.0,
                            lowerFPSThreshold: 30,
                            upperFPSThreshold: 60
                        }
                        : {
                            minScale: 0.75,
                            maxScale: 1.0,
                            lowerFPSThreshold: 50,
                            upperFPSThreshold: 60
                        }
                }
            );

        window.performanceManager = performanceManager;

        dynamicResolutionManager =
            performanceManager.dynamicResolution;

        window.dynamicResolutionManager =
            dynamicResolutionManager;

        // =====================================================================
        // 9. CURVE / DRAWING SYSTEMS
        // =====================================================================
        const curveTangent = new AdvancedCurveTangent();
        const curveDrawer = new TwoDProfileDrawer();
        const curveExtrusion = new ProfileExtrusion();

        window.curveTangent = curveTangent;
        window.curveDrawer = curveDrawer;
        window.curveExtrusion = curveExtrusion;

        // =====================================================================
        // 10. WATER
        // =====================================================================
        if (typeof window.initWaterSystem === 'function') {
            window.initWaterSystem(
                scene,
                getActiveViewportCamera(),
                renderer,
                {
                    controls: window.controls || controls,
                    terrain: window.terrain || null
                }
            );

            console.log('[init] SM Water System initialized.');
        }

        // =====================================================================
        // 11. EXPERIMENTAL LUMEN
        // =====================================================================
        // Never let an experimental lighting system silently compete with the
        // sky/sun system. It must be explicit.
        window.lumenSystem = null;

        if (
            ENABLE_EXPERIMENTAL_LUMEN &&
            typeof LumenLightingSystem === 'function'
        ) {
            try {
                window.lumenSystem =
                    new LumenLightingSystem(
                        scene,
                        renderer,
                        camera
                    );

                window.lumenSystem.enabled = true;

                console.warn(
                    '[init] Experimental LumenLightingSystem ENABLED by user opt-in.'
                );
            } catch (error) {
                console.warn(
                    '[init] LumenLightingSystem failed to initialize:',
                    error
                );
            }
        }

        // =====================================================================
        // 12. TERRAIN NODE EDITOR
        // =====================================================================
        nodeEditor =
            window.ensureTerrainNodeEditor?.();

        window.terrainNodeEditor =
            nodeEditor;

        // =====================================================================
        // 13. GAME DEVELOPMENT ENVIRONMENT
        // =====================================================================
        const gameEnvironment =
            typeof ensureGameDevelopmentEnvironment === 'function'
                ? ensureGameDevelopmentEnvironment(scene)
                : null;

        ground =
            gameEnvironment?.ground ||
            gameEnvironment?.floor ||
            null;

        if (
            !ground &&
            typeof createUnrealFloor === 'function'
        ) {
            ground = createUnrealFloor(scene);
        }

        const physicsWorldResult =
            gameEnvironment ||
            (
                ground &&
                typeof setupPhysicsWorld === 'function'
                    ? setupPhysicsWorld(scene, ground)
                    : {
                        collidableMeshes: [],
                        obstaclesGroup: null
                    }
            );

        collidableMeshes =
            physicsWorldResult?.collidableMeshes || [];

        obstaclesGroup =
            physicsWorldResult?.obstaclesGroup || null;

        const tagGameDevelopmentObject = (object) => {
            if (!object) return;

            object.userData = object.userData || {};
            object.userData.isSystemObject = true;
            object.userData.workspaceOnly = 'GAME_DEV';
            object.userData.isGameDevelopmentEnvironment = true;
            object.userData.excludeFromStaticMerge = true;
            object.userData.excludeFromNanite = true;
        };

        tagGameDevelopmentObject(ground);
        tagGameDevelopmentObject(obstaclesGroup);

        obstaclesGroup?.traverse?.(
            tagGameDevelopmentObject
        );

        prepareRenderableTree(ground);
        prepareRenderableTree(obstaclesGroup);

        window.gameDevGround = ground || null;
        window.gameDevObstaclesGroup =
            obstaclesGroup || null;
        window.gameDevCollidableMeshes =
            collidableMeshes;

        window.ground = ground || null;
        window.obstaclesGroup =
            obstaclesGroup || null;
        window.collidableMeshes =
            collidableMeshes;

        distanceMarkers =
            typeof createDistanceMarkers === 'function'
                ? createDistanceMarkers({
                    gridSize: 2000,
                    majorStep: 100,
                    yOffset: 0.01
                })
                : null;

        if (distanceMarkers) {
            distanceMarkers.userData =
                distanceMarkers.userData || {};

            distanceMarkers.userData.isSystemObject = true;
            distanceMarkers.userData.workspaceOnly = 'GAME_DEV';
            distanceMarkers.userData.isGameDevelopmentEnvironment = true;
            distanceMarkers.userData.excludeFromStaticMerge = true;
            distanceMarkers.userData.excludeFromNanite = true;
            distanceMarkers.visible = false;

            scene.add(distanceMarkers);
        }

        const startupWorkspace =
            getStartupWorkspaceMode();

        const gameDevVisibleAtStartup =
            startupWorkspace === 'GAME_DEV';

        if (ground) {
            ground.visible = gameDevVisibleAtStartup;
        }

        if (obstaclesGroup) {
            obstaclesGroup.visible =
                gameDevVisibleAtStartup;

            obstaclesGroup.traverse?.((child) => {
                child.visible =
                    gameDevVisibleAtStartup;
            });
        }

        if (distanceMarkers) {
            distanceMarkers.visible = false;
        }

        window.SMUE5Environment?.syncVisibility?.(
            startupWorkspace
        );

        // =====================================================================
        // 14. INSPECTOR
        // =====================================================================
        window.InspectorPanel?.init?.();

        // =====================================================================
        // 15. PHYSICS
        // =====================================================================
        try {
            const physicsPanel =
                document.getElementById(
                    'physics-controls'
                );

            if (!physicsPanel) {
                throw new Error(
                    'Physics container missing.'
                );
            }

            physicsSystem =
                new PhysicsSystem(scene);

            window.physicsSystem =
                physicsSystem;

            await physicsSystem.init(
                'physics-controls'
            );

            physicsSystem.setSelectedObject?.(
                window.selectedObject || null
            );

            physicsSystem.ui?.refreshWorkbench?.();

            window.__smGameDevPhysicsBodies =
                window.__smGameDevPhysicsBodies ||
                new Map();

            const registerGameDevPhysicsBody =
                (mesh, options) => {
                    if (
                        !mesh ||
                        window.__smGameDevPhysicsBodies.has(
                            mesh.uuid
                        )
                    ) {
                        return;
                    }

                    try {
                        physicsSystem.addBody(
                            mesh,
                            options
                        );

                        window.__smGameDevPhysicsBodies.set(
                            mesh.uuid,
                            mesh
                        );
                    } catch (error) {
                        console.warn(
                            '[Physics] Could not register GAME_DEV body:',
                            mesh.name || mesh.uuid,
                            error
                        );
                    }
                };

            const groundBody =
                window.gameDevGround ||
                scene.getObjectByName(
                    'UnrealEngineFloor'
                );

            if (groundBody) {
                registerGameDevPhysicsBody(
                    groundBody,
                    {
                        mass: 0,
                        shapeType: 'trimesh',
                        friction: 0.8,
                        restitution: 0.05
                    }
                );
            }

            obstaclesGroup?.children?.forEach(
                (obstacle) => {
                    if (!obstacle?.isMesh) return;

                    obstacle.updateMatrixWorld(true);

                    const shape =
                        obstacle.userData?.physicsShape ||
                        (
                            obstacle.geometry?.type
                                ?.includes('Cylinder')
                                ? 'cylinder'
                                : 'box'
                        );

                    const options = {
                        mass: 0,
                        shapeType: shape,
                        friction:
                            obstacle.userData?.friction ??
                            0.7,
                        restitution:
                            obstacle.userData?.restitution ??
                            0.04,
                        pos:
                            obstacle.getWorldPosition(
                                new THREE.Vector3()
                            ),
                        quat:
                            obstacle.getWorldQuaternion(
                                new THREE.Quaternion()
                            )
                    };

                    if (
                        shape === 'box' &&
                        Array.isArray(
                            obstacle.userData?.physicsSize
                        )
                    ) {
                        options.size =
                            obstacle.userData.physicsSize.slice();
                    }

                    registerGameDevPhysicsBody(
                        obstacle,
                        options
                    );
                }
            );

            window.setGameDevelopmentPhysicsEnabled =
                (enabled) => {
                    if (!physicsSystem) return false;

                    const state = !!enabled;

                    if (
                        typeof physicsSystem.setBodyEnabled ===
                        'function'
                    ) {
                        window.__smGameDevPhysicsBodies.forEach(
                            (mesh) => {
                                try {
                                    physicsSystem.setBodyEnabled(
                                        mesh,
                                        state
                                    );
                                } catch { }
                            }
                        );

                        return true;
                    }

                    return false;
                };

            window.setGameDevelopmentPhysicsEnabled(
                startupWorkspace === 'GAME_DEV'
            );

            physicsSystem.toggleSimulation?.(true);

        } catch (error) {
            console.error(
                '[init] Physics setup failed:',
                error
            );
        }

        // =====================================================================
        // 16. PLAYER
        // =====================================================================
        if (typeof SMPlayerSystem !== 'undefined') {
            try {
                window.playerSystem =
                    new SMPlayerSystem({
                        scene,
                        camera,
                        renderer,
                        physicsSystem
                    });

                await window.playerSystem.init();

                window.playerSystem.setWorkspaceMode(
                    startupWorkspace
                );

                console.log(
                    '[Player] Initialized:',
                    startupWorkspace
                );

            } catch (error) {
                console.error(
                    '[Player] Initialization failed:',
                    error
                );
            }
        } else {
            console.warn(
                '[Player] SMPlayerSystem class is not loaded.'
            );
        }

        // =====================================================================
        // 17. RIGGING
        // =====================================================================
        window.rigManager =
            new RigManager(
                scene,
                camera,
                renderer,
                transformControls
            );

        if (
            typeof SMAdvancedControlRigSystem !==
            'undefined'
        ) {
            window.advancedControlRig =
                new SMAdvancedControlRigSystem(
                    window.rigManager
                );

            window.advancedControlRig
                .activateFromSceneSelection();
        }

        document.getElementById(
            'add-bone-btn'
        )?.addEventListener(
            'click',
            () => {
                if (window.selectedObject) {
                    window.rigManager
                        .startAddingMode();
                } else {
                    alert(
                        'Select a mesh in the hierarchy first!'
                    );
                }
            }
        );

        document.getElementById(
            'deselect-bone-btn'
        )?.addEventListener(
            'click',
            () => {
                window.rigManager
                    ?.clearActiveBoneSelection?.();
            }
        );

        // =====================================================================
        // 18. MODELING UI
        // =====================================================================
        const modelingButton =
            document.getElementById(
                'modelingControls'
            );

        const modelingTools =
            document.getElementById(
                'modelingTools'
            );

        if (
            modelingButton &&
            modelingTools
        ) {
            modelingButton.addEventListener(
                'click',
                () => {
                    modelingTools.style.display =
                        modelingTools.style.display ===
                        'block'
                            ? 'none'
                            : 'block';
                }
            );
        }

        const toggleModelingBtn =
            document.getElementById(
                'toggle-modeling'
            );

        if (
            toggleModelingBtn &&
            !toggleModelingBtn.dataset
                .selectionSyncBound
        ) {
            toggleModelingBtn.dataset
                .selectionSyncBound = '1';

            toggleModelingBtn.addEventListener(
                'click',
                () => {
                    setTimeout(
                        () => {
                            if (!window.isModelingMode) {
                                return;
                            }

                            const sys =
                                window.UnifiedModelingSystem;

                            if (sys?.activeMesh) {
                                activeObject =
                                    sys.activeMesh;
                            } else if (selectedObject) {
                                let target =
                                    selectedObject;

                                if (
                                    !target.isMesh &&
                                    target.getObjectByProperty
                                ) {
                                    target =
                                        target.getObjectByProperty(
                                            'isMesh',
                                            true
                                        ) ||
                                        target;
                                }

                                activeObject =
                                    target?.isMesh
                                        ? target
                                        : null;
                            }
                        },
                        50
                    );
                }
            );
        }

        // =====================================================================
        // 19. EDITOR HELPERS
        // =====================================================================
        const axesHelper =
            new THREE.AxesHelper(5);

        axesHelper.name = 'axesHelper';
        axesHelper.visible = false;
        axesHelper.userData.isSystemObject = true;
        axesHelper.userData.ignoreInTimeline = true;
        axesHelper.userData.excludeFromShadows = true;

        scene.add(axesHelper);

        raycaster = new THREE.Raycaster();
        mouse = new THREE.Vector2();

        window.raycaster = raycaster;
        window.mouse = mouse;

        // =====================================================================
        // 20. ASSETS PANEL
        // =====================================================================
        if (
            typeof AssetsPanel !== 'undefined' &&
            typeof AssetsPanel.init === 'function'
        ) {
            AssetsPanel.init(
                scene,
                renderer,
                camera,
                raycaster
            );
        }

        // =====================================================================
        // 21. TRANSFORM EVENTS
        // =====================================================================
        transformControls.addEventListener(
            'mouseDown',
            () => {
                transformControlsActive = true;

                if (controls && !isLocked) {
                    controls.enabled = false;
                }

                const transformTarget =
                    transformControls.object;

                if (
                    !(
                        window.isModelingMode &&
                        transformTarget?.userData
                            ?.isSystemObject
                    )
                ) {
                    selectedObject =
                        transformTarget;

                    window.selectedObject =
                        transformTarget || null;

                    if (!transformTarget?.isBone) {
                        window.selectedBone = null;
                    }
                }

                updateLayersUI?.();
            }
        );

        transformControls.addEventListener(
            'mouseUp',
            () => {
                transformControlsActive = false;

                if (controls && !isLocked) {
                    controls.enabled = true;
                }
            }
        );

        transformControls.addEventListener(
            'objectChange',
            () => {
                const currentObject =
                    transformControls.object;

                if (
                    currentObject?.userData
                        ?.isGuideHandle
                ) {
                    const handle =
                        currentObject;

                    const guide =
                        handle.userData.guide;

                    const pointIndex =
                        handle.userData.pointIndex;

                    guide.controlPoints[
                        pointIndex
                    ].copy(handle.position);

                    guide.update();
                }

                const isModelingSystemTarget =
                    window.isModelingMode &&
                    currentObject?.userData
                        ?.isSystemObject;

                if (
                    currentObject &&
                    !isModelingSystemTarget
                ) {
                    selectedObject =
                        currentObject;

                    window.selectedObject =
                        currentObject;

                    window.selectedBone =
                        currentObject.isBone
                            ? currentObject
                            : null;

                    updateLayersUI?.();
                    updateKeyframesUI?.();

                    naniteSystem
                        ?.markForUpdate?.(
                            currentObject
                        );

                    // Any transformed object may move relative to the shadow
                    // camera. Force one shadow refresh.
                    renderer.shadowMap.needsUpdate = true;

                } else if (!currentObject) {
                    selectedObject = null;
                    window.selectedObject = null;
                    window.selectedBone = null;

                    updateLayersUI?.();
                    updateKeyframesUI?.();
                }

                physicsSystem?.setSelectedObject(
                    isModelingSystemTarget
                        ? window.selectedObject
                        : currentObject
                );

                if (
                    typeof codeEditorManager !==
                    'undefined'
                ) {
                    codeEditorManager
                        .loadScriptForObject(
                            currentObject
                        );
                }

                window.hierarchyManager
                    ?.updateSelectionStyle?.();
            }
        );

        renderer.domElement.addEventListener(
            'click',
            () => {
                if (!transformControls.object) {
                    physicsSystem
                        ?.setSelectedObject(null);
                }
            }
        );

        isDragging = false;

        renderer.domElement.addEventListener(
            'pointerdown',
            (event) => {
                if (event.button === 0) {
                    isDragging = true;
                }
            }
        );

        renderer.domElement.addEventListener(
            'pointerup',
            (event) => {
                if (event.button === 0) {
                    isDragging = false;
                }
            }
        );

        controls?.addEventListener?.(
            'change',
            () => {
                if (window.isModelingMode) {
                    window.applyModelingGridState?.();
                }

                updateTransformControlsForActiveView?.();
                updateAxisGizmo?.();
            }
        );

        // =====================================================================
        // 22. 2D / UV / HISTORY / SCULPT
        // =====================================================================
        window.uvInspector =
            new UVInspector(
                'uv-panel-canvas'
            );

        window.v2dManager =
            new Viewport2DManager(
                camera,
                controls,
                scene
            );

        window.addEventListener(
            'objectSelected',
            () => {
                if (window.v2dManager?.is2D) {
                    window.uvInspector?.draw?.();
                }
            }
        );

        window.addEventListener(
            'resize',
            () => {
                if (window.v2dManager?.is2D) {
                    window.uvInspector?.draw?.();
                }
            }
        );

        updateAxisGizmo?.();

        window.historyManager =
            new HistoryManager(
                scene,
                transformControls,
                controls
            );

        initSculptingSystem(
            scene,
            camera,
            renderer,
            window.historyManager
        );

        if (vertexHelpers) scene.add(vertexHelpers);
        if (edgeHelpers) scene.add(edgeHelpers);
        if (faceHelpers) scene.add(faceHelpers);

        // =====================================================================
        // 23. SKY / SUN — SINGLE LIVE DIRECT-LIGHT AUTHORITY
        // =====================================================================
        if (typeof SkyLightingSystem === 'function') {
            skyLightingSystem =
                new SkyLightingSystem(
                    scene,
                    renderer,
                    camera,
                    {
                        globalLightTarget: {
                            x: 0,
                            y: 0,
                            z: 0
                        },
                        shadowPreset: 'ultra'
                    }
                );

            window.skyLightingSystem =
                skyLightingSystem;

            skyLightingSystem.registerTransformControls?.(
                transformControls
            );

            skyLightingSystem.ensureRigAttached?.();

            const skyStartupMode =
                getStartupWorkspaceMode();

            if (
                typeof skyLightingSystem
                    .setWorkspaceMode ===
                'function'
            ) {
                skyLightingSystem.setWorkspaceMode(
                    skyStartupMode
                );
            } else {
                const showSky =
                    skyStartupMode === 'GAME_DEV' ||
                    skyStartupMode === 'TERRAIN';

                skyLightingSystem.setVisible?.(
                    showSky
                );

                if (showSky) {
                    skyLightingSystem
                        .refreshShadows?.('ultra');

                    skyLightingSystem
                        .update?.(0);
                }
            }

            skyLightingSystem.enforceGlobalLighting?.({
                refreshShadows:
                    skyStartupMode === 'GAME_DEV' ||
                    skyStartupMode === 'TERRAIN'
            });

            window.sunLight =
                skyLightingSystem.sunLight ||
                window.sunLight ||
                null;

            configureSunShadows(
                window.sunLight
            );

            // Re-enforce our renderer shadow policy AFTER sky init.
            renderer.shadowMap.enabled = true;
            renderer.shadowMap.type =
                THREE.PCFSoftShadowMap;
            renderer.shadowMap.autoUpdate = true;
            renderer.shadowMap.needsUpdate = true;

        } else {
            console.warn(
                '[init] SkyLightingSystem is not available.'
            );
        }

        installHemisphereLightDedupe?.(scene);

        window.dedupeHemisphereLights?.({
            preserveCustomLights: false
        });

        window.skyLightingSystem
            ?.ensureRigAttached?.();

        window.skyLightingSystem
            ?.enforceGlobalLighting?.({
                refreshShadows: true
            });

        configureSunShadows(
            window.skyLightingSystem?.sunLight ||
            window.sunLight
        );

        applyWorkspaceWorldPolicy(
            getStartupWorkspaceMode()
        );

        document.getElementById(
            'toggle-lighting'
        )?.addEventListener(
            'click',
            toggleAdvancedLighting
        );

        // =====================================================================
        // 24. CENTRAL RENDER FOUNDATION
        // =====================================================================
        try {
            window.initSMMaterialSystem?.({
                renderer,
                scene
            });

            window.initSMEnvironmentRenderer?.({
                renderer,
                scene
            });

            // Create but KEEP DISABLED while SkyLightingSystem owns direct light.
            if (
                !window.smLightingManager &&
                typeof window.SMLightingManager ===
                    'function'
            ) {
                window.smLightingManager =
                    new window.SMLightingManager({
                        scene,
                        renderer
                    });
            }

            if (window.smLightingManager) {
                window.smLightingManager.enabled = false;
            }

            if (
                !window.smShadowManager &&
                typeof window.SMShadowManager ===
                    'function'
            ) {
                window.smShadowManager =
                    new window.SMShadowManager({
                        scene,
                        renderer,
                        quality: 'high'
                    });
            }

            if (window.smShadowManager) {
                window.smShadowManager.enabled = false;
            }

            const smPostStack =
                window.initSMPostProcessStack?.({
                    renderer,
                    scene,
                    camera
                });

            if (
                smPostStack &&
                !smPostStack.initialized
            ) {
                smPostStack.initialize(
                    Math.max(
                        1,
                        mainRendererContainer.clientWidth
                    ),
                    Math.max(
                        1,
                        mainRendererContainer.clientHeight
                    )
                );
            }

            if (
                !window.smGraphicsCapabilities &&
                typeof window.SMGraphicsCapabilities ===
                    'function'
            ) {
                window.smGraphicsCapabilities =
                    new window.SMGraphicsCapabilities(
                        renderer
                    );

                window.smGraphicsCapabilitiesReport =
                    window.smGraphicsCapabilities
                        .detect();
            }

            if (
                !window.smGraphicsQuality &&
                typeof window.SMGraphicsQuality ===
                    'function'
            ) {
                window.smGraphicsQuality =
                    new window.SMGraphicsQuality({
                        renderer,
                        preset: 'high'
                    });
            }

            window.initSMRealisticRendering?.({
                renderer,
                scene,
                quality: 'high'
            });

            // RealisticRendering or graphics presets may touch renderer state.
            // Re-assert the canonical renderer state immediately afterward.
            configureMainRenderer(renderer);

            // Auto exposure is intentionally OFF by default until:
            // shadows + architecture + IBL/probes are visually correct.
            if (ENABLE_AUTO_EXPOSURE) {
                window.initSMExposureSystem?.({
                    renderer,
                    scene
                });

                console.warn(
                    '[SM Rendering] Auto exposure enabled by explicit user opt-in.'
                );
            } else {
                renderer.toneMappingExposure = 1.0;
            }

            window.initSMRenderer?.({
                renderer,
                scene,
                camera
            });

            window.SMViewportShading
                ?.init?.();

            window.initSMViewportShadingBridge?.();

            window.initSMOfflineRenderer?.({
                renderer,
                scene,
                smRenderer: window.smRenderer
            });

            window.initSMRenderDebugger?.({
                renderer,
                scene,
                smRenderer: window.smRenderer
            });

            if (
                !window.__smRenderingResizeBound
            ) {
                const resizeCentralRendering = () => {
                    const width = Math.max(
                        1,
                        mainRendererContainer
                            ?.clientWidth ||
                        renderer.domElement
                            ?.clientWidth ||
                        1
                    );

                    const height = Math.max(
                        1,
                        mainRendererContainer
                            ?.clientHeight ||
                        renderer.domElement
                            ?.clientHeight ||
                        1
                    );

                    renderer.setSize(
                        width,
                        height,
                        false
                    );

                    window.smPostProcessStack
                        ?.setSize?.(
                            width,
                            height
                        );

                    configureMainRenderer(
                        renderer
                    );
                };

                window.addEventListener(
                    'resize',
                    resizeCentralRendering
                );

                window.addEventListener(
                    'sm:layout-resized',
                    resizeCentralRendering
                );

                window.__smRenderingResizeBound =
                    true;
            }

            disableCompetingLightingManagers();
            applyWorkspaceWorldPolicy();

            console.log(
                '[SM Rendering] Quality-first central rendering foundation initialized.'
            );

        } catch (renderInitError) {
            console.error(
                '[SM Rendering] Foundation initialization failed; base renderer remains available:',
                renderInitError
            );

            // Restore canonical state even after a subsystem failure.
            configureMainRenderer(renderer);
        }

        // =====================================================================
        // 25. PREVIEW LINE
        // =====================================================================
        const lineMaterial =
            new THREE.LineBasicMaterial({
                color: 0xffff00,
                linewidth: 2
            });

        previewLine =
            new THREE.Line(
                new THREE.BufferGeometry(),
                lineMaterial
            );

        previewLine.userData.isSystemObject = true;
        previewLine.userData.ignoreInTimeline = true;
        previewLine.userData.excludeFromShadows = true;

        scene.add(previewLine);

        // =====================================================================
        // 26. STARTUP NANITE SCAN
        // =====================================================================
        const meshesToProcessForNanite = [];

        scene.traverse((obj) => {
            if (
                !obj.isMesh ||
                !obj.geometry?.attributes?.position
            ) {
                return;
            }

            const excludeList = [
                'axesHelper',
                'NaniteDebugGroup',
                'advancedGrid',
                'UnrealEngineFloor',
                'DistanceMarkers',
                'Player',
                'SMGameplaySampleFloor'
            ];

            let isDynamicOrSkinned = false;

            obj.traverseAncestors?.((parent) => {
                if (
                    parent.userData?.isDynamicMesh ||
                    parent.userData?.workspaceOnly ===
                        'GAME_DEV' ||
                    parent.userData?.workspaceOnly ===
                        'GAMEPLAY_SAMPLE'
                ) {
                    isDynamicOrSkinned = true;
                }
            });

            if (
                obj.isSkinnedMesh ||
                obj.isBone ||
                obj.userData?.isDynamicMesh ||
                obj.userData?.hasSkeleton
            ) {
                isDynamicOrSkinned = true;
            }

            if (
                obj === axesHelper ||
                excludeList.includes(obj.name) ||
                obj.userData?.isNaniteOriginal ||
                obj.userData?.isNaniteLOD ||
                obj.userData?.excludeFromNanite ||
                obj.userData?.workspaceOnly ===
                    'GAME_DEV' ||
                obj.userData?.workspaceOnly ===
                    'GAMEPLAY_SAMPLE' ||
                obj.userData?.isGameplaySample ||
                obj.userData
                    ?.isGameDevelopmentEnvironment ||
                isDynamicOrSkinned
            ) {
                return;
            }

            const triangleCount =
                obj.geometry.index?.count
                    ? obj.geometry.index.count / 3
                    : obj.geometry.attributes
                        .position.count / 3;

            if (triangleCount > 100) {
                meshesToProcessForNanite.push(obj);
            }
        });

        meshesToProcessForNanite.forEach(
            (mesh) => {
                try {
                    naniteSystem.addMesh(
                        mesh,
                        {
                            autoGenerateLODs: true,
                            isStatic:
                                mesh.userData
                                    ?.static ||
                                false,
                            preserveMaterials: true,
                            maxLODLevels: 4
                        }
                    );
                } catch (error) {
                    console.warn(
                        '[Nanite] Startup scan failed for:',
                        mesh.name,
                        error
                    );
                }
            }
        );

        // =====================================================================
        // 27. GUI
        // =====================================================================
        const settings =
            addGUI(
                scene,
                renderer,
                camera
            );

        if (settings?.gui) {
            const naniteFolder =
                settings.gui.addFolder(
                    'Nanite System'
                );

            naniteFolder
                .add(
                    naniteSystem,
                    'enabled'
                )
                .name(
                    'Enable Nanite'
                );

            naniteFolder
                .add(
                    naniteSystem,
                    'debugMode'
                )
                .name(
                    'Debug LODs'
                )
                .onChange(
                    (value) =>
                        naniteSystem
                            .toggleDebug(value)
                );

            naniteFolder
                .add(
                    naniteSystem,
                    'baseLODDistance',
                    1,
                    1000
                )
                .name(
                    'Base LOD Distance (m)'
                )
                .onChange(
                    () =>
                        naniteSystem.update()
                );

            naniteFolder
                .add(
                    naniteSystem,
                    'lodDistanceMultiplier',
                    1.1,
                    5
                )
                .name(
                    'LOD Multiplier'
                )
                .onChange(
                    () =>
                        naniteSystem.update()
                );

            naniteFolder
                .add(
                    naniteSystem,
                    'frustumCullLODs'
                )
                .name(
                    'Frustum Cull LODs'
                );
        }

        // Do NOT let GUI restore old fog/exposure renderer state while debugging.
        if (QUALITY_FIRST) {
            scene.fog = null;
            renderer.toneMappingExposure = 1.0;
        }

        // =====================================================================
        // 28. NAVIGATION / EXPLOSION / PATH / VFX
        // =====================================================================
        window.navigatorSystem =
            new Navigator();

        window.navigatorSystem
            .initializeExpandButtons();

        try {
            explosionManager =
                new ExplosionManager(
                    scene,
                    camera,
                    clock
                );

            explosionManager.init();

            window.createExplosion =
                (x, y, z) => {
                    explosionManager
                        ?.triggerExplosion?.(
                            x,
                            y,
                            z
                        );

                    window.cameraSystem
                        ?.shake?.(
                            0.35,
                            0.4
                        );
                };

        } catch (error) {
            console.error(
                '[init] Failed to initialize Explosion System:',
                error
            );
        }

        setupViewModeSelector?.();

        window.scene = scene;
        window.camera = camera;
        window.renderer = renderer;

        initializePathAnimationSystem?.(
            scene,
            camera,
            renderer
        );

        try {
            initNodeVFXEditor?.();
        } catch (error) {
            console.error(
                '[init] initNodeVFXEditor failed:',
                error
            );
        }

        try {
            if (
                typeof VFXStudio !==
                'undefined'
            ) {
                window.vfxStudio =
                    new VFXStudio();
            }
        } catch (error) {
            console.error(
                '[init] VFXStudio init failed:',
                error
            );
        }

        // =====================================================================
        // 29. CORE EDITOR SETUP
        // =====================================================================
        setupEventListeners?.();
        initShortcutsPanel?.();
        setupSceneElements?.();
        initModeling?.();

        window.debugModeling = () => {
            const sys =
                window.UnifiedModelingSystem;

            console.log(
                '=== MODELING SYSTEM DEBUG ==='
            );

            console.log(
                'System initialized:',
                !!sys
            );

            console.log(
                'Edit Mode active:',
                sys?.isEditMode
            );

            console.log(
                'Active Mesh:',
                sys?.activeMesh?.name ||
                'None'
            );

            console.log(
                'Editable Mesh:',
                !!sys?.editableMesh
            );

            console.log(
                'selectedObject:',
                selectedObject?.name ||
                'None'
            );

            console.log(
                'activeObject:',
                activeObject?.name ||
                'None'
            );
        };

        setupSnowControls?.();

        // =====================================================================
        // 30. EXPORT
        // =====================================================================
        const myProjectSettings = {
            gameName: document.title,
            includePhysics:
                typeof physicsSystem !==
                'undefined',
            platform: 'web'
        };

        window.gameExportSystem =
            new GameExportSystem({
                scene,
                camera,
                renderer,
                config: myProjectSettings
            });

        EditorAccess.init(
            scene,
            camera,
            transformControls
        );

        setupUniversalEditorSystem?.();
        bindInspectorInputs?.();

        // =====================================================================
        // 31. ADVANCED MODELER
        // =====================================================================
        const initAdvancedModeler = () => {
            const start = () => {
                if (
                    typeof AdvancedModeler ===
                    'undefined'
                ) {
                    setTimeout(
                        start,
                        100
                    );

                    return;
                }

                if (!window.advancedModeler) {
                    window.advancedModeler =
                        new AdvancedModeler(
                            scene,
                            camera,
                            renderer
                        );
                }

                const button =
                    document.getElementById(
                        'openAdvancedModeler'
                    );

                if (!button) return;

                button.onclick =
                    (event) => {
                        event.preventDefault();

                        if (!window.advancedModeler) {
                            window.advancedModeler =
                                new AdvancedModeler(
                                    scene,
                                    camera,
                                    renderer
                                );
                        }

                        if (
                            window.advancedModeler
                                .isActive
                        ) {
                            window.advancedModeler.close();
                        } else {
                            window.advancedModeler.open();
                        }
                    };
            };

            start();
        };

        if (
            document.readyState ===
            'complete'
        ) {
            initAdvancedModeler();
        } else {
            window.addEventListener(
                'load',
                initAdvancedModeler,
                { once: true }
            );
        }

        // =====================================================================
        // 32. PERSISTENCE
        // =====================================================================
        window.persistenceManager =
            new ScenePersistenceManager(
                scene,
                objects
            );

        window.persistenceManager
            .load()
            .then((loaded) => {
                window.persistenceManager
                    .hasLoadedData =
                    loaded;

                if (
                    window.__pendingVegetationData &&
                    !window.vegetationSystem &&
                    window.VegetationSystem
                ) {
                    window.vegetationSystem =
                        new window.VegetationSystem(
                            scene,
                            camera,
                            renderer.domElement
                        );

                    window.vegetationSystem
                        .setTerrainMeshes(
                            window.terrain || []
                        );

                    window.VegetationPanel
                        ?.syncTerrainReference?.();

                    window.vegetationSystem
                        .deserialize(
                            window.__pendingVegetationData
                        );

                    delete window.__pendingVegetationData;
                }

                if (loaded) {
                    console.log(
                        '[init] Saved scene restored.'
                    );

                    // Repair imported/restored authored objects immediately.
                    prepareRenderableTree(scene);

                    window.dedupeHemisphereLights?.({
                        preserveCustomLights: false
                    });

                    updateHierarchy?.();

                    window.performanceManager
                        ?.registerScene?.();

                    window.performanceManager
                        ?.geometryBudget
                        ?.update?.(true);
                }

                const modeAfterPersistence =
                    String(
                        window.workspaceManager?.currentMode ||
                        getStartupWorkspaceMode()
                    ).toUpperCase();

                try {
                    syncGameEnvironmentVisibility?.(
                        scene,
                        modeAfterPersistence
                    );

                    window.SMUE5Environment
                        ?.syncVisibility?.(
                            modeAfterPersistence
                        );

                    window.setGameDevelopmentPhysicsEnabled?.(
                        modeAfterPersistence ===
                        'GAME_DEV'
                    );

                    if (
                        modeAfterPersistence !==
                        'GAMEPLAY_SAMPLE'
                    ) {
                        window.gameplaySampleEnvironment
                            ?.deactivate?.();
                    }

                    window.skyLightingSystem
                        ?.setWorkspaceMode?.(
                            modeAfterPersistence
                        );

                    window.skyLightingSystem
                        ?.ensureRigAttached?.();

                    window.skyLightingSystem
                        ?.enforceGlobalLighting?.({
                            refreshShadows: true
                        });

                    configureSunShadows(
                        window.skyLightingSystem
                            ?.sunLight ||
                        window.sunLight
                    );

                    disableCompetingLightingManagers();

                    applyWorkspaceWorldPolicy(
                        modeAfterPersistence
                    );

                    if (
                        window.workspaceManager
                            ?.currentMode
                    ) {
                        window.workspaceManager.setMode(
                            window.workspaceManager
                                .currentMode
                        );
                    }

                } catch (error) {
                    console.warn(
                        '[init] Workspace sync after persistence failed:',
                        error
                    );
                }
            })
            .catch((error) => {
                console.error(
                    '[init] Persistence load failed:',
                    error
                );
            });

        transformControls.addEventListener(
            'objectChange',
            () => {
                if (
                    window.persistenceManager
                        ?.hasLoadedData
                ) {
                    window.persistenceManager
                        .autoSave();
                }

                const target =
                    transformControls.object;

                if (!target) return;

                window.smSceneManager
                    ?.notifyEntityChanged?.(
                        target,
                        'transformChanged',
                        {
                            source:
                                'transform-controls'
                        }
                    );

                if (window.v2dManager?.is2D) {
                    const snappingEnabled =
                        document.getElementById(
                            'grid-snap-checkbox'
                        )?.checked ??
                        true;

                    if (snappingEnabled) {
                        window.v2dManager
                            .apply2DSnap(
                                target.position
                            );
                    }
                }

                updateInspector?.();
            }
        );

        if (!window.__smAutoSaveInterval) {
            window.__smAutoSaveInterval =
                setInterval(
                    () => {
                        if (
                            window.persistenceManager
                                ?.hasLoadedData
                        ) {
                            window.persistenceManager
                                .autoSave();
                        }
                    },
                    60000
                );
        }

        window.saveStatus = () =>
            window.persistenceManager
                ?.getStatus?.();

        // =====================================================================
        // 33. ENGINE SENTINEL
        // =====================================================================
        if (
            typeof EngineSentinel ===
                'function' &&
            window.performanceManager
        ) {
            window.engineSentinel
                ?.destroy?.();

            window.engineSentinel =
                new EngineSentinel(
                    window.performanceManager,
                    {
                        targetMenuId: 'statsMenu',
                        analysisIntervalMs: 1200,
                        showUI: true
                    }
                );
        } else {
            console.warn(
                '[EngineSentinel] PerformanceManager or EngineSentinel unavailable.'
            );
        }

        window.__smWorkspaceStaticMergeBlocked =
            true;

        // =====================================================================
        // 34. FINAL UI / RESIZE / TERRAIN / CURVES
        // =====================================================================
        bindCoreUiOnce?.();
        syncDynamicLayoutVars?.();
        initViewportResizeObserver?.();

        if (!window.__smViewportResizeBound) {
            window.addEventListener(
                'resize',
                onWindowResize
            );

            window.addEventListener(
                'sm:layout-resized',
                onWindowResize
            );

            window.__smViewportResizeBound =
                true;
        }

        setupSubToolbarControls?.(
            scene,
            camera,
            transformControls,
            controls
        );

        initializeTerrainSculptingEventListeners?.();
        setupTerrainControls?.();
        setupUIEventListeners?.();
        setupBrushControls?.();
        activatePanelButtonTool?.();

        initCurveModifier?.(
            scene,
            camera,
            renderer
        );

        initPhysicsBrushCursor?.();

        if (
            typeof boostObstacleSaturation ===
            'function'
        ) {
            boostObstacleSaturation(scene);
        }

        // =====================================================================
        // 35. FINAL RENDER-FOUNDATION REPAIR PASS
        // =====================================================================
        prepareRenderableTree(scene);

        window.dedupeHemisphereLights?.({
            preserveCustomLights: false
        });

        window.skyLightingSystem
            ?.ensureRigAttached?.();

        window.skyLightingSystem
            ?.enforceGlobalLighting?.({
                refreshShadows: true
            });

        configureSunShadows(
            window.skyLightingSystem?.sunLight ||
            window.sunLight
        );

        disableCompetingLightingManagers();

        configureMainRenderer(renderer);

        applyWorkspaceWorldPolicy(
            getStartupWorkspaceMode()
        );

        installRenderDiagnostics();

        // =====================================================================
        // 36. START EXACTLY ONE MAIN LOOP
        // =====================================================================
        _safeStartAnimate();

        // Safe startup optimization scan only.
        try {
            window.performanceManager
                ?.registerScene?.();

            window.performanceManager
                ?.geometryBudget
                ?.update?.(true);

        } catch (optimizationStartupError) {
            console.warn(
                '[SM Optimization] Startup scan warning:',
                optimizationStartupError
            );
        }

        initCharacterSculpting?.();

        initCompleted = true;

        // =====================================================================
        // 37. FINAL WORKSPACE SYNC
        // =====================================================================
        const finalWorkspaceMode =
            String(
                window.workspaceManager?.currentMode ||
                getStartupWorkspaceMode()
            ).toUpperCase();

        try {
            syncGameEnvironmentVisibility?.(
                scene,
                finalWorkspaceMode
            );

            window.SMUE5Environment
                ?.syncVisibility?.(
                    finalWorkspaceMode
                );

            window.setGameDevelopmentPhysicsEnabled?.(
                finalWorkspaceMode ===
                'GAME_DEV'
            );

            window.skyLightingSystem
                ?.setWorkspaceMode?.(
                    finalWorkspaceMode
                );

            window.skyLightingSystem
                ?.ensureRigAttached?.();

            window.skyLightingSystem
                ?.enforceGlobalLighting?.({
                    refreshShadows: true
                });

            configureSunShadows(
                window.skyLightingSystem
                    ?.sunLight ||
                window.sunLight
            );

            if (
                finalWorkspaceMode !==
                'GAMEPLAY_SAMPLE'
            ) {
                window.gameplaySampleEnvironment
                    ?.deactivate?.();
            }

            disableCompetingLightingManagers();

            configureMainRenderer(renderer);

            applyWorkspaceWorldPolicy(
                finalWorkspaceMode
            );

            if (
                window.workspaceManager
                    ?.currentMode
            ) {
                window.workspaceManager.setMode(
                    window.workspaceManager
                        .currentMode
                );
            }

        } catch (workspaceError) {
            console.warn(
                '[init] Final workspace synchronization failed:',
                workspaceError
            );
        }

        renderer.shadowMap.needsUpdate = true;

        console.log(
            '[init] SM Engine initialized with quality-first rendering foundation.'
        );

        console.log(
            '[init] Run SMRenderFoundationDebug() in the console for diagnostics.'
        );

    } catch (error) {
        console.error(
            '[init] Fatal initialization error:',
            error
        );

        initStarted = false;

        try {
            bindCoreUiOnce?.();
        } catch { }

        // Start the legacy main loop only if enough of the engine initialized to
        // keep the editor responsive.
        _safeStartAnimate();

    } finally {
        // Selection initialization should not be able to abort the full engine
        // bootstrap if its dependencies are temporarily unavailable.
        try {
            initSelectionSystem?.();
        } catch (selectionError) {
            console.warn(
                '[init] Selection system initialization warning:',
                selectionError
            );
        }
    }
}
init().catch((err) => {
    console.error(
        'CRITICAL: Engine failed to start:',
        err
    );
});
async function initSMCapture() {
    if (!window.initCaptureSystem) {
        console.warn(
            '[SM Capture] Capture files are not loaded.'
        );
        return null;
    }

    try {
        await window.initCaptureSystem({
            autoRefreshDevices: true
        });

        if (window.initSMUSBPhoneBridge) {
            await window.initSMUSBPhoneBridge({
                captureSystem:
                    window.captureSystem,
                camera:
                    window.camera ||
                    camera ||
                    null
            });
        }

        console.log(
            '[SM Capture] Ready',
            {
                captureSystem:
                    window.captureSystem,
                usbPhoneBridge:
                    window.smUSBPhoneBridge
            }
        );

        return window.captureSystem;
    } catch (error) {
        console.error(
            '[SM Capture] Initialization failed:',
            error
        );

        return null;
    }
}

window.smCaptureInitPromise = initSMCapture();
