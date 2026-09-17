/**
 * Blender-style viewport shading controller.
 *
 * This controller never uses Scene.overrideMaterial for Solid or Wireframe.
 * A scene-wide override also affects TransformControls and editor helpers,
 * and was the reason Solid could leave the viewport without correct shadows
 * or a clean transition back to textured materials.
 */
(function registerViewportShadingController() {
    'use strict';

    const presets = window.SMViewportShadingPresets;
    if (!presets) {
        console.error('[Viewport Shading] Presets must load before the controller.');
        return;
    }

    const { MODES, validModes, getWorkspaceMode, isEditorObject, getNeutralWorldColor } = presets;
    let mode = MODES.SOLID;
    let eventsBound = false;
    let solidMaterial = null;
    let wireframeMaterial = null;
    let shadowCatcher = null;
    let activeMaterialOverrides = new Map();
    let hiddenLightStates = new Map();
    let lightingWorkspace = null;
    let worldBackup = null;

    function getScene() {
        return window.scene || null;
    }

    function getRenderer() {
        return window.renderer || null;
    }

    function getSolidMaterial() {
        if (solidMaterial) return solidMaterial;

        solidMaterial = new THREE.MeshStandardMaterial({
            color: 0xc7cbd1,
            roughness: 0.72,
            metalness: 0,
            envMapIntensity: 0,
            // A small, neutral lift prevents the unlit side of a modeled mesh
            // from collapsing to black while preserving directional form.
            emissive: 0x30343c,
            emissiveIntensity: 0.3,
            // Blender Solid keeps two-sided viewport visibility by default.
            // This also prevents imported planes with flipped normals from
            // reading as nearly black or disappearing.
            side: THREE.DoubleSide,
            flatShading: false,
            fog: true,
            toneMapped: true
        });
        solidMaterial.name = 'SM_BlenderSolidMaterial';
        solidMaterial.userData = {
            isSystemObject: true,
            isViewportSolidMaterial: true
        };
        return solidMaterial;
    }

    function getWireframeMaterial() {
        if (wireframeMaterial) return wireframeMaterial;

        wireframeMaterial = new THREE.MeshBasicMaterial({
            wireframe: true,
            color: 0x9da4ad,
            toneMapped: false,
            fog: false
        });
        wireframeMaterial.name = 'SM_ViewportWireframeMaterial';
        wireframeMaterial.userData = {
            isSystemObject: true,
            isViewportWireframeMaterial: true
        };
        return wireframeMaterial;
    }

    function clearLegacyOverride(scene) {
        const override = scene?.overrideMaterial;
        if (
            override?.userData?.isViewportSolidMaterial ||
            override?.userData?.isViewportWireframeMaterial ||
            override?.name === 'SM_FilmSolidViewportMaterial' ||
            override?.name === 'SM_BlenderSolidMaterial' ||
            override?.name === 'SM_ViewportWireframeMaterial'
        ) {
            scene.overrideMaterial = null;
        }
    }

    function isSceneMesh(object) {
        if (!object?.isMesh || !object.material) return false;
        if (object === shadowCatcher) return false;
        if (isEditorObject(object)) return false;

        const data = object.userData || {};
        return !(
            data.isNaniteLOD ||
            data.isNaniteDebug ||
            data.excludeFromViewportShading
        );
    }

    function restoreOriginalMaterials() {
        activeMaterialOverrides.forEach((originalMaterial, mesh) => {
            if (mesh) mesh.material = originalMaterial;
        });
        activeMaterialOverrides.clear();
    }

    function applyViewportMaterial(material) {
        const scene = getScene();
        if (!scene) return;

        restoreOriginalMaterials();
        scene.traverse((object) => {
            if (!isSceneMesh(object)) return;
            activeMaterialOverrides.set(object, object.material);
            object.material = material;
        });
    }

    function ensureShadowRendering() {
        const renderer = getRenderer();
        if (!renderer?.shadowMap) return;

        renderer.shadowMap.enabled = true;
        renderer.shadowMap.autoUpdate = true;
        if (THREE.PCFSoftShadowMap !== undefined) {
            renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        }
        renderer.shadowMap.needsUpdate = true;
    }

    function prepareSceneGeometryForShadows(scene) {
        scene?.traverse((object) => {
            if (!isSceneMesh(object)) return;

            const materials = Array.isArray(object.material)
                ? object.material
                : [object.material];
            const canCast = materials.some((material) => (
                material && (!material.transparent || material.alphaTest > 0)
            ));

            // Imported assets commonly arrive with both flags disabled. These
            // are viewport defaults, so authored meshes immediately behave as
            // expected in Solid, Material Preview and Rendered modes.
            object.castShadow = canCast;
            object.receiveShadow = true;
        });
    }

    function isStudioLight(light) {
        return Boolean(
            light?.userData?.ws_studioLight ||
            light?.userData?.isViewportSolidLight
        );
    }

    function configureStudioShadow(light) {
        if (!light?.isDirectionalLight || !isStudioLight(light)) return;

        const isKey = light.name === 'StudioKeyLight';
        light.castShadow = isKey;
        if (!isKey || !light.shadow) return;

        light.userData = light.userData || {};
        Object.assign(light.userData, {
            shadowRequested: true,
            forceShadow: true,
            allowShadowBudgetDisable: false,
            minShadowMapSize: 2048,
            shadowPriority: 100
        });

        const shadowMapSize = 2048;
        const allocatedMapIsWrong = light.shadow.map && (
            light.shadow.map.width !== shadowMapSize ||
            light.shadow.map.height !== shadowMapSize
        );
        if (allocatedMapIsWrong) {
            light.shadow.map.dispose?.();
            light.shadow.map = null;
        }
        light.shadow.mapSize.set(shadowMapSize, shadowMapSize);
        light.shadow.bias = -0.00005;
        light.shadow.normalBias = 0.0015;
        light.shadow.radius = 1.0;
        light.shadow.camera.near = 0.1;
        light.shadow.camera.far = 120;
        light.shadow.camera.left = -30;
        light.shadow.camera.right = 30;
        light.shadow.camera.top = 30;
        light.shadow.camera.bottom = -30;
        light.shadow.camera.updateProjectionMatrix();
        light.shadow.needsUpdate = true;
    }

    function configureStudioLight(light) {
        if (!isStudioLight(light)) return;

        const studioIntensity = {
            StudioKeyLight: 1.8,
            StudioFillLight: 1.25,
            StudioRimLight: 0.25,
            StudioHemiLight: 1.05,
            StudioAmbientLight: 0.26
        }[light.name];
        if (Number.isFinite(studioIntensity)) {
            light.intensity = studioIntensity;
        }
        configureStudioShadow(light);
    }

    function enterSolidLighting() {
        const scene = getScene();
        if (!scene) return;

        const workspace = getWorkspaceMode();
        if (lightingWorkspace && lightingWorkspace !== workspace) {
            hiddenLightStates.clear();
        }
        lightingWorkspace = workspace;

        scene.traverse((object) => {
            if (!object?.isLight) return;
            if (isStudioLight(object)) {
                object.visible = true;
                configureStudioLight(object);
                return;
            }
            if (!hiddenLightStates.has(object)) {
                hiddenLightStates.set(object, object.visible);
            }
            object.visible = false;
        });
    }

    function leaveSolidLighting() {
        const workspace = getWorkspaceMode();
        if (lightingWorkspace && lightingWorkspace === workspace) {
            hiddenLightStates.forEach((visible, light) => {
                if (light) light.visible = visible;
            });
        }
        hiddenLightStates.clear();
        lightingWorkspace = null;
    }

    function rememberWorld(scene, renderer) {
        const workspace = getWorkspaceMode();
        if (
            worldBackup &&
            (worldBackup.scene !== scene || worldBackup.workspace !== workspace)
        ) {
            worldBackup = null;
        }
        if (worldBackup) return;

        const clearColor = new THREE.Color();
        renderer?.getClearColor?.(clearColor);
        worldBackup = {
            scene,
            workspace,
            background: scene.background,
            environment: scene.environment,
            backgroundIntensity: scene.backgroundIntensity,
            environmentIntensity: scene.environmentIntensity,
            clearColor,
            clearAlpha: renderer?.getClearAlpha?.() ?? 1
        };
    }

    function applyNeutralStudioWorld(scene, renderer) {
        rememberWorld(scene, renderer);
        const color = getNeutralWorldColor();
        scene.background = new THREE.Color(color);
        scene.environment = null;
        if ('backgroundIntensity' in scene) scene.backgroundIntensity = 1;
        if ('environmentIntensity' in scene) scene.environmentIntensity = 1;
        renderer?.setClearColor?.(color, 1);
    }

    function restoreFilmHDRI() {
        const scene = getScene();
        if (!scene || getWorkspaceMode() !== 'FILM') return false;

        const active = window.smActiveHDRI;
        if (!active?.texture) return false;

        const backgroundTexture = active.texture;
        const environmentTexture = active.environmentTexture || active.texture;
        backgroundTexture.mapping = THREE.EquirectangularReflectionMapping;
        backgroundTexture.needsUpdate = true;
        scene.background = backgroundTexture;
        if ('backgroundIntensity' in scene) scene.backgroundIntensity = 1;

        if (window.smHDRIEnvironmentEnabled !== false) {
            scene.environment = environmentTexture;
            const intensity = Number(active.intensity ?? 0.65);
            if ('environmentIntensity' in scene && Number.isFinite(intensity)) {
                scene.environmentIntensity = Math.max(0, intensity);
            }
        }
        return true;
    }

    function restoreShadedWorld(scene, renderer) {
        const workspace = getWorkspaceMode();
        const restoredHDRI = workspace === 'FILM' && restoreFilmHDRI();
        const backup = worldBackup;

        if (!restoredHDRI && backup?.scene === scene && backup.workspace === workspace) {
            scene.background = backup.background;
            scene.environment = backup.environment;
            if ('backgroundIntensity' in scene) {
                scene.backgroundIntensity = backup.backgroundIntensity ?? 1;
            }
            if ('environmentIntensity' in scene) {
                scene.environmentIntensity = backup.environmentIntensity ?? 1;
            }
            renderer?.setClearColor?.(backup.clearColor, backup.clearAlpha);
        }
        worldBackup = null;
        return Boolean(restoredHDRI || backup);
    }

    function ensureShadowCatcher(scene) {
        if (shadowCatcher?.parent) return shadowCatcher;

        const geometry = new THREE.PlaneGeometry(200, 200);
        // A ShadowMaterial has no visible base surface. It preserves the
        // viewport grid and only draws the soft contact shadow, unlike the
        // opaque dark square used by the first Solid implementation.
        const material = new THREE.ShadowMaterial({
            color: 0x000000,
            transparent: true,
            opacity: 0.16,
            depthWrite: false,
            fog: false
        });
        shadowCatcher = new THREE.Mesh(geometry, material);
        shadowCatcher.name = 'SMViewportSolidShadowCatcher';
        shadowCatcher.rotation.x = -Math.PI / 2;
        shadowCatcher.position.y = -0.015;
        shadowCatcher.receiveShadow = true;
        shadowCatcher.castShadow = false;
        shadowCatcher.renderOrder = -1;
        shadowCatcher.visible = false;
        shadowCatcher.userData = {
            isSystemObject: true,
            isViewportSolidShadowCatcher: true,
            ignoreInHierarchy: true,
            ignoreInTimeline: true,
            excludeFromNanite: true,
            excludeFromStaticMerge: true,
            excludeFromViewportShading: true
        };
        scene.add(shadowCatcher);
        return shadowCatcher;
    }

    function setShadowCatcherVisible(visible) {
        const scene = getScene();
        if (!scene) return;
        if (!visible && !shadowCatcher) return;
        const catcher = shadowCatcher || ensureShadowCatcher(scene);
        catcher.visible = Boolean(visible && getWorkspaceMode() === 'FILM');
    }

    function updateButtons() {
        document.querySelectorAll('.shading-mode-btn').forEach((button) => {
            const active = button.dataset.mode === mode;
            button.classList.toggle('active', active);
            button.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
    }

    function applySolid(scene, renderer) {
        clearLegacyOverride(scene);
        restoreOriginalMaterials();
        prepareSceneGeometryForShadows(scene);
        applyViewportMaterial(getSolidMaterial());
        ensureShadowRendering();
        applyNeutralStudioWorld(scene, renderer);
        enterSolidLighting();
        setShadowCatcherVisible(true);
        if (window.smRender) window.smRender.active = false;
    }

    function applyWireframe(scene, renderer) {
        clearLegacyOverride(scene);
        leaveSolidLighting();
        applyViewportMaterial(getWireframeMaterial());
        applyNeutralStudioWorld(scene, renderer);
        setShadowCatcherVisible(false);
        if (window.smRender) window.smRender.active = false;
    }

    function applyMaterialPreview(scene, renderer) {
        clearLegacyOverride(scene);
        restoreOriginalMaterials();
        leaveSolidLighting();
        prepareSceneGeometryForShadows(scene);
        ensureShadowRendering();
        restoreShadedWorld(scene, renderer);
        setShadowCatcherVisible(false);
        if (window.smRender) window.smRender.active = false;
    }

    function applyRendered(scene, renderer) {
        applyMaterialPreview(scene, renderer);
        if (window.smRender) {
            window.smRender.active = true;
            window.smRender.applySettings?.(window.SMEngineRenderer?.settings || {});
        }
    }

    function preview() {
        const scene = getScene();
        const renderer = getRenderer();
        if (!scene || !renderer || typeof THREE === 'undefined') return false;

        if (mode === MODES.WIREFRAME) {
            applyWireframe(scene, renderer);
        } else if (mode === MODES.SOLID) {
            applySolid(scene, renderer);
        } else if (mode === MODES.MATERIAL_PREVIEW) {
            applyMaterialPreview(scene, renderer);
        } else if (mode === MODES.RENDERED) {
            applyRendered(scene, renderer);
        } else {
            return false;
        }
        updateButtons();
        return true;
    }

    function setMode(nextMode) {
        const next = String(nextMode || '').toLowerCase();
        if (!validModes.has(next)) return false;

        const previous = mode;
        mode = next;
        preview();
        window.dispatchEvent(new CustomEvent('sm:viewport-shading-changed', {
            detail: { mode, previous, workspace: getWorkspaceMode() }
        }));
        return true;
    }

    function getMode() {
        return mode;
    }

    function refresh() {
        return preview();
    }

    function init() {
        if (eventsBound) return;
        eventsBound = true;

        document.addEventListener('click', (event) => {
            const button = event.target.closest('.shading-mode-btn');
            if (button?.dataset?.mode) setMode(button.dataset.mode);
        });
        window.addEventListener('sm:workspace-changed', preview);
        window.addEventListener('sm:workspace-mode-changed', preview);
        window.addEventListener('sm:hdri-environment-changed', () => {
            if (mode === MODES.MATERIAL_PREVIEW || mode === MODES.RENDERED) {
                preview();
            }
        });
        updateButtons();
    }

    window.SMViewportShading = {
        __smViewportShadingVersion: 6,
        MODES,
        setMode,
        getMode,
        preview,
        refresh,
        init,
        getSolidMaterial,
        restoreFilmHDRI
    };
})();
