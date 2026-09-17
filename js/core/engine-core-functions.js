/**
 * js\core\engine-core-functions.js
 * SM Engine: Core UI & Scene Helper Functions
 * This file contains the global functions that coordinate between the 3D scene,
 * the Inspector, the Hierarchy, and various engine subsystems.
 */

// --- SELECTION & INSPECTOR ---

function selectObject(object) {
    // If SelectionCore is already managing selection, delegate to it safely
    if (window._selectionState && typeof window.selectObject === 'function' && window.selectObject !== selectObject) {
        return window.selectObject(object);
    }

    if (!object) {
        window.selectedObject = null;
        if (window.transformControls) window.transformControls.detach();
        if (window.outlinePass) window.outlinePass.selectedObjects = [];
    } else {
        // Prevent selecting TransformControls gizmo itself
        if (object.isTransformControls || object.userData?.isTransformControlsChild) return;
        const activeWorkspaceMode = String(
            window.workspaceManager?.currentMode ||
            localStorage.getItem('sm_workspace_mode') ||
            'FILM'
        ).toUpperCase();
        if (activeWorkspaceMode !== 'TERRAIN') {
            let terrainNode = object;
            while (terrainNode) {
                const data = terrainNode.userData || {};
                const name = String(terrainNode.name || '').trim();
                if (
                    terrainNode === window.terrain ||
                    data.isTerrain === true ||
                    data.isTerrainMesh === true ||
                    data.isTerrainComponent === true ||
                    data.workspaceOnly === 'TERRAIN' ||
                    name === 'Terrain' ||
                    name === 'Terrain_Mesh' ||
                    name.startsWith('Terrain_')
                ) {
                    return;
                }
                terrainNode = terrainNode.parent;
            }
        }

        window.selectedObject = object;

        if (window.transformControls) {
            // Ensure TransformControls is present in the scene hierarchy
            if (window.scene && window.transformControls.parent !== window.scene) {
                window.scene.add(window.transformControls);
            }
            window.transformControls.enabled = true;
            window.transformControls.visible = true;
            window.transformControls.attach(object);
        }

        if (window.outlinePass) window.outlinePass.selectedObjects = [object];
    }

    // Keep modifier tooling in sync with the editor's canonical selection.
    window.SMModifiers?.modifierManager?.setSelectedObject?.(window.selectedObject || null);
    window.ModelingModifiersPanel?.syncSelection?.();
    window.dispatchEvent(new CustomEvent('sm:selection-changed', {
        detail: { object: window.selectedObject || null }
    }));
    
    if (typeof updateHierarchy === 'function') updateHierarchy();
    if (typeof updateInspector === 'function') updateInspector();

    window.dispatchEvent(new CustomEvent('sm:object-selected', {
        detail: {
            object: window.selectedObject || null,
            selectedObject: window.selectedObject || null
        }
    }));
}

// Bind input events ONCE when DOM is ready
function bindInspectorInputsOnce() {
    if (window.__smInspectorInputsBound) return;
    window.__smInspectorInputsBound = true;

    console.log("SM Engine: Binding Inspector inputs...");

    const getSelectedObject = () => {
        return (
            window.selectedObject ||
            window.transformControls?.object ||
            null
        );
    };

    const refreshTransformInputs = (obj = getSelectedObject()) => {
        const position = obj?.position;
        const rotation = obj?.rotation;
        const scale = obj?.scale;

        const posX = document.getElementById("transformPosX");
        const posY = document.getElementById("transformPosY");
        const posZ = document.getElementById("transformPosZ");

        const rotX = document.getElementById("transformRotX");
        const rotY = document.getElementById("transformRotY");
        const rotZ = document.getElementById("transformRotZ");

        const scaleX = document.getElementById("transformScaleX");
        const scaleY = document.getElementById("transformScaleY");
        const scaleZ = document.getElementById("transformScaleZ");

        const summary = document.getElementById(
            "sm-world-transform-summary"
        );

        if (!obj || !position || !rotation || !scale) {
            if (posX) posX.value = "";
            if (posY) posY.value = "";
            if (posZ) posZ.value = "";

            if (rotX) rotX.value = "";
            if (rotY) rotY.value = "";
            if (rotZ) rotZ.value = "";

            if (scaleX) scaleX.value = "";
            if (scaleY) scaleY.value = "";
            if (scaleZ) scaleZ.value = "";

            if (summary) {
                summary.textContent = "World (No Selection)";
            }

            return;
        }

        // Never overwrite the field currently being edited.
        const active = document.activeElement;
        const isEditingTransform =
            active?.classList?.contains("sm-transform-input");

        if (!isEditingTransform) {
            if (posX) posX.value = Number(position.x).toFixed(2);
            if (posY) posY.value = Number(position.y).toFixed(2);
            if (posZ) posZ.value = Number(position.z).toFixed(2);

            if (rotX) {
                rotX.value =
                    THREE.MathUtils.radToDeg(rotation.x).toFixed(1);
            }

            if (rotY) {
                rotY.value =
                    THREE.MathUtils.radToDeg(rotation.y).toFixed(1);
            }

            if (rotZ) {
                rotZ.value =
                    THREE.MathUtils.radToDeg(rotation.z).toFixed(1);
            }

            if (scaleX) scaleX.value = Number(scale.x).toFixed(2);
            if (scaleY) scaleY.value = Number(scale.y).toFixed(2);
            if (scaleZ) scaleZ.value = Number(scale.z).toFixed(2);
        }

        if (summary) {
            summary.textContent =
                `World (${Number(position.x).toFixed(2)}, ` +
                `${Number(position.y).toFixed(2)}, ` +
                `${Number(position.z).toFixed(2)})`;
        }
    };

    const applyTransform = () => {
        const obj = getSelectedObject();
        if (!obj) return;

        const readNumber = (id, fallback) => {
            const input = document.getElementById(id);
            if (!input) return fallback;

            const value = Number.parseFloat(input.value);
            return Number.isFinite(value) ? value : fallback;
        };

        // Position
        obj.position.set(
            readNumber("transformPosX", obj.position.x),
            readNumber("transformPosY", obj.position.y),
            readNumber("transformPosZ", obj.position.z)
        );

        // Rotation: Inspector degrees -> Three.js radians
        obj.rotation.set(
            THREE.MathUtils.degToRad(
                readNumber(
                    "transformRotX",
                    THREE.MathUtils.radToDeg(obj.rotation.x)
                )
            ),
            THREE.MathUtils.degToRad(
                readNumber(
                    "transformRotY",
                    THREE.MathUtils.radToDeg(obj.rotation.y)
                )
            ),
            THREE.MathUtils.degToRad(
                readNumber(
                    "transformRotZ",
                    THREE.MathUtils.radToDeg(obj.rotation.z)
                )
            )
        );

        // Scale
        obj.scale.set(
            readNumber("transformScaleX", obj.scale.x),
            readNumber("transformScaleY", obj.scale.y),
            readNumber("transformScaleZ", obj.scale.z)
        );

        obj.updateMatrix?.();
        obj.updateMatrixWorld?.(true);

        window.transformControls?.update?.();

        window.updateHierarchy?.();

        const summary = document.getElementById(
            "sm-world-transform-summary"
        );

        if (summary) {
            summary.textContent =
                `World (${Number(obj.position.x).toFixed(2)}, ` +
                `${Number(obj.position.y).toFixed(2)}, ` +
                `${Number(obj.position.z).toFixed(2)})`;
        }
    };

    const transformIds = [
        "transformPosX",
        "transformPosY",
        "transformPosZ",
        "transformRotX",
        "transformRotY",
        "transformRotZ",
        "transformScaleX",
        "transformScaleY",
        "transformScaleZ"
    ];

    const bindTransformInputs = () => {
        transformIds.forEach((id) => {
            const input = document.getElementById(id);
            if (!input) return;

            if (input.dataset.smTransformInputBound === "true") {
                return;
            }

            input.dataset.smTransformInputBound = "true";

            input.addEventListener("input", () => {
                applyTransform();
            });

            input.addEventListener("change", () => {
                applyTransform();
                refreshTransformInputs();
            });
        });
    };

    const bindEntityInputs = () => {
        const nameInput =
            document.getElementById("objectNameInput");

        if (
            nameInput &&
            nameInput.dataset.smEntityInputBound !== "true"
        ) {
            nameInput.dataset.smEntityInputBound = "true";

            nameInput.addEventListener("change", (event) => {
                const obj = getSelectedObject();
                if (!obj) return;

                const name =
                    String(event.target.value || "").trim();

                if (!name) return;

                if (window.smSceneManager?.renameEntity) {
                    window.smSceneManager.renameEntity(
                        obj,
                        name
                    );
                } else {
                    obj.name = name;
                }

                window.updateHierarchy?.();
            });
        }

        const activeCheck =
            document.getElementById("objectActiveCheck");

        if (
            activeCheck &&
            activeCheck.dataset.smEntityInputBound !== "true"
        ) {
            activeCheck.dataset.smEntityInputBound = "true";

            activeCheck.addEventListener("change", (event) => {
                const obj = getSelectedObject();
                if (!obj) return;

                if (window.smSceneManager?.setActive) {
                    window.smSceneManager.setActive(
                        obj,
                        event.target.checked
                    );
                } else {
                    obj.userData = obj.userData || {};
                    obj.userData.active =
                        event.target.checked;
                }
            });
        }

        const staticCheck =
            document.getElementById("objectStaticCheck");

        if (
            staticCheck &&
            staticCheck.dataset.smEntityInputBound !== "true"
        ) {
            staticCheck.dataset.smEntityInputBound = "true";

            staticCheck.addEventListener("change", (event) => {
                const obj = getSelectedObject();
                if (!obj) return;

                obj.userData = obj.userData || {};
                obj.userData.static =
                    event.target.checked;
            });
        }
    };

    const bindMaterialInputs = () => {
        const colorInput =
            document.getElementById("matColorInput");

        if (
            colorInput &&
            colorInput.dataset.smMaterialInputBound !== "true"
        ) {
            colorInput.dataset.smMaterialInputBound = "true";

            colorInput.addEventListener("input", (event) => {
                const obj = getSelectedObject();
                if (!obj?.material?.color) return;

                obj.material.color.set(event.target.value);

                const hex =
                    document.getElementById("matColorHexDisplay");

                if (hex) {
                    hex.textContent =
                        event.target.value.toUpperCase();
                }
            });
        }

        const roughnessInput =
            document.getElementById("matRoughnessInput");

        if (
            roughnessInput &&
            roughnessInput.dataset.smMaterialInputBound !== "true"
        ) {
            roughnessInput.dataset.smMaterialInputBound = "true";

            roughnessInput.addEventListener("input", (event) => {
                const obj = getSelectedObject();
                if (!obj?.material) return;

                const value =
                    Number.parseFloat(event.target.value);

                if (Number.isFinite(value)) {
                    obj.material.roughness = value;
                }

                const display =
                    document.getElementById("matRoughnessVal");

                if (display) {
                    display.textContent =
                        Number(value).toFixed(2);
                }
            });
        }

        const metallicInput =
            document.getElementById("matMetallicInput");

        if (
            metallicInput &&
            metallicInput.dataset.smMaterialInputBound !== "true"
        ) {
            metallicInput.dataset.smMaterialInputBound = "true";

            metallicInput.addEventListener("input", (event) => {
                const obj = getSelectedObject();
                if (!obj?.material) return;

                const value =
                    Number.parseFloat(event.target.value);

                if (Number.isFinite(value)) {
                    obj.material.metalness = value;
                }

                const display =
                    document.getElementById("matMetallicVal");

                if (display) {
                    display.textContent =
                        Number(value).toFixed(2);
                }
            });
        }
    };

    const bindCurrentInspector = () => {
        bindTransformInputs();
        bindEntityInputs();
        bindMaterialInputs();
    };

    // Initial binding.
    bindCurrentInspector();

    // InspectorPanel rebuilds its DOM when the selection/workspace changes.
    // Rebind dynamically created Transform inputs after every selection.
    [
        "sm:selection-changed",
        "sm:object-selected",
        "sm:transform-selection-changed"
    ].forEach((eventName) => {
        window.addEventListener(eventName, (event) => {
            const object =
                event.detail?.object ||
                event.detail?.selectedObject ||
                getSelectedObject();

            requestAnimationFrame(() => {
                bindCurrentInspector();
                refreshTransformInputs(object);
            });
        });
    });

    // Inspector DOM can be rebuilt independently of selection.
    window.addEventListener("sm:inspector-rendered", () => {
        requestAnimationFrame(() => {
            bindCurrentInspector();
            refreshTransformInputs();
        });
    });

    // Public helper used by InspectorPanel when it rebuilds the Transform UI.
    window.refreshSMTransformInspector = refreshTransformInputs;
}


// Fast Value-Only Update (No DOM Wiping)

function updateInspector() {
    bindInspectorInputsOnce();

    const obj =
        window.selectedObject ||
        window.transformControls?.object ||
        null;

    const nameInput =
        document.getElementById("objectNameInput");

    const activeCheck =
        document.getElementById("objectActiveCheck");

    const staticCheck =
        document.getElementById("objectStaticCheck");

    if (!obj) {
        if (nameInput) nameInput.value = "No Selection";
        if (activeCheck) activeCheck.checked = false;
        if (staticCheck) staticCheck.checked = false;

        window.refreshSMTransformInspector?.(null);
        return;
    }

    const active = document.activeElement;

    if (
        active?.classList?.contains("sm-transform-input") ||
        active?.id === "objectNameInput"
    ) {
        return;
    }

    if (nameInput) {
        nameInput.value =
            obj.name || "Unnamed Object";
    }

    if (activeCheck) {
        activeCheck.checked =
            obj.userData?.smEntity?.active !== false;
    }

    if (staticCheck) {
        staticCheck.checked =
            !!obj.userData?.static;
    }

    // NEW isolated Transform.
    window.refreshSMTransformInspector?.(obj);

    // Material Values
    if (obj.isMesh && obj.material) {

        const trisDisplay =
            document.getElementById(
                "meshTrianglesDisplay"
            );

        if (trisDisplay && obj.geometry) {
            const tris = Math.round(
                (
                    obj.geometry.index?.count ||
                    obj.geometry.attributes?.position?.count ||
                    0
                ) / 3
            );

            trisDisplay.textContent =
                `${tris} Tris`;
        }

        const matColor =
            document.getElementById("matColorInput");

        if (matColor && obj.material.color) {
            matColor.value =
                "#" + obj.material.color.getHexString();

            const hex =
                document.getElementById(
                    "matColorHexDisplay"
                );

            if (hex) {
                hex.textContent =
                    matColor.value.toUpperCase();
            }
        }

        const roughness =
            document.getElementById(
                "matRoughnessInput"
            );

        if (
            roughness &&
            obj.material.roughness !== undefined
        ) {
            roughness.value =
                obj.material.roughness;
        }

        const roughnessVal =
            document.getElementById(
                "matRoughnessVal"
            );

        if (
            roughnessVal &&
            obj.material.roughness !== undefined
        ) {
            roughnessVal.textContent =
                Number(obj.material.roughness).toFixed(2);
        }

        const metallic =
            document.getElementById(
                "matMetallicInput"
            );

        if (
            metallic &&
            obj.material.metalness !== undefined
        ) {
            metallic.value =
                obj.material.metalness;
        }

        const metallicVal =
            document.getElementById(
                "matMetallicVal"
            );

        if (
            metallicVal &&
            obj.material.metalness !== undefined
        ) {
            metallicVal.textContent =
                Number(obj.material.metalness).toFixed(2);
        }
    }
}

function bindInspectorInputs() {
    bindInspectorInputsOnce();
    window.refreshSMTransformInspector?.(
        window.selectedObject ||
        window.transformControls?.object ||
        null
    );
}

// --- SCENE MANAGEMENT ---
function addObjectToScene(object, name = 'New Object') {
    if (!object || !object.isObject3D) {
        console.warn('[addObjectToScene] Invalid object:', object);
        return null;
    }

    // ---- Identity ----
    if (name) object.name = name;
    if (!object.name) object.name = `Object_${Date.now().toString(36).slice(-6)}`;

    object.userData = object.userData || {};
    object.userData.workspaceGlobal = true;
    object.userData.userCreated = true;
    object.userData.createdAt = object.userData.createdAt || Date.now();

    // ---- Terrain visibility ----
    const currentMode = String(window.workspaceManager?.currentMode || '').toUpperCase();
    if (currentMode === 'TERRAIN') {
        object.visible = true;
        delete object.userData.__smTerrainIsolated;
        delete object._hiddenByTerrainMode;
    }

    // ---- Add to scene ----
    if (!window.scene) {
        console.warn('[addObjectToScene] No scene');
        return null;
    }
    if (!object.parent) {
        window.scene.add(object);
    }

    // ---- Register with scene manager ----
    let registeredInManager = false;
    if (window.smSceneManager?.registerObject) {
        try {
            window.smSceneManager.registerObject(object, {
                recursive: true,
                source: 'addObjectToScene',
            });
            registeredInManager = true;
        } catch (err) {
            console.warn('[addObjectToScene] smSceneManager.registerObject failed:', err);
        }
    }

    // ---- LEGACY: window.objects array ----
    // Many systems (hierarchy, outline, physics) still read from this.
    // We MUST keep it in sync, otherwise they don't see new objects.
    if (Array.isArray(window.objects) && !window.objects.includes(object)) {
        window.objects.push(object);
    }

    // ---- Timeline ----
    if (typeof window.addObjectToTimeline === 'function') {
        try { window.addObjectToTimeline(object); }
        catch (err) { console.warn('[addObjectToScene] Timeline failed:', err); }
    }

    // ---- Hierarchy refresh (WITH RETRY) ----
    const refreshHierarchy = () => {
        try {
            window.hierarchyManager?.renderAll?.();
        } catch (err) {
            console.warn('[addObjectToScene] renderAll failed:', err);
        }
        try {
            if (typeof window.updateHierarchy === 'function') {
                window.updateHierarchy();
            }
        } catch (err) {
            console.warn('[addObjectToScene] updateHierarchy failed:', err);
        }
    };

    // Immediate + delayed (in case UI hasn't mounted yet)
    refreshHierarchy();
    requestAnimationFrame(refreshHierarchy);
    setTimeout(refreshHierarchy, 50);

    // ---- Selection ----
    if (typeof window.selectObject === 'function') {
        try { window.selectObject(object); }
        catch (err) { console.warn('[addObjectToScene] selectObject failed:', err); }
    } else {
        window.selectedObject = object;
        window.transformControls?.attach?.(object);
        if (window.outlinePass) window.outlinePass.selectedObjects = [object];
    }

    // ---- Undo registration ----
    const history = window.historyManager || window.SMHistoryManager;
    if (history?.recordAction) {
        try {
            history.recordAction({
                name: `Add ${object.name}`,
                undo: () => {
                    object.parent?.remove(object);
                    window.smSceneManager?.unregisterObject?.(object, { recursive: true });
                    if (Array.isArray(window.objects)) {
                        const idx = window.objects.indexOf(object);
                        if (idx >= 0) window.objects.splice(idx, 1);
                    }
                    window.removeObjectFromTimeline?.(object);
                    if (window.selectedObject === object) {
                        window.selectedObject = null;
                        window.transformControls?.detach?.();
                        if (window.outlinePass) window.outlinePass.selectedObjects = [];
                    }
                    refreshHierarchy();
                },
                redo: () => addObjectToScene(object, object.name),
            });
        } catch (err) {
            console.warn('[addObjectToScene] Undo registration failed:', err);
        }
    }

    // ---- Events ----
    window.dispatchEvent(new CustomEvent('sm:object-added', {
        detail: { object, name: object.name, source: 'addObjectToScene', mode: currentMode },
    }));

    return object;
}

function removeObjectFromScene(object, silent = false) {
    if (!object) return;
    
    if (!silent && !confirm(`Are you sure you want to delete ${object.name || 'this object'}?`)) {
        return;
    }

    if (window.smSceneManager?.getEntity?.(object)) {
        return window.smSceneManager.destroyEntity(object, {
            dispose: true,
            reason: 'editor-delete'
        });
    }

    if (window.scene) window.scene.remove(object);
    
    if (window.objects) {
        const index = window.objects.indexOf(object);
        if (index > -1) window.objects.splice(index, 1);
    }

    object.traverse(child => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
            if (Array.isArray(child.material)) {
                child.material.forEach(m => m.dispose());
            } else {
                child.material.dispose();
            }
        }
    });

    if (window.selectedObject === object) {
        selectObject(null);
    }
    
    if (typeof updateHierarchy === 'function') updateHierarchy();
}

// --- ENVIRONMENT & LIGHTING ---

function setTimeOfDay(hours) {
    if (window.skyLightingSystem) {
        window.skyLightingSystem.timeOfDay = hours;
        if (typeof window.skyLightingSystem.update === 'function') {
            window.skyLightingSystem.update(0);
        }
    }
}

function setWeatherPreset(preset) {
    console.log("Setting weather preset:", preset);
}

function toggleAutoTime() {
    if (window.skyLightingSystem) {
        window.skyLightingSystem.autoTimeProgress = !window.skyLightingSystem.autoTimeProgress;
    }
}

function setLightingQuality(quality) {
    const renderer = window.renderer;
    if (!renderer) return;

    const mode = String(quality || 'high').toLowerCase();

    /*
     * Prefer central ShadowManager.
     */
    if (window.smShadowManager?.setQuality) {
        window.smShadowManager.setQuality(mode);
        return;
    }

    /*
     * Compatibility fallback only.
     */
    if (!renderer.shadowMap) return;

    switch (mode) {
        case 'low':
            renderer.shadowMap.enabled = false;
            break;

        case 'medium':
            renderer.shadowMap.enabled = true;
            renderer.shadowMap.type =
                THREE.PCFShadowMap;
            break;

        case 'high':
        case 'ultra':
        case 'cinematic':
        default:
            renderer.shadowMap.enabled = true;
            renderer.shadowMap.type =
                THREE.PCFSoftShadowMap;
            break;
    }

    renderer.shadowMap.autoUpdate = true;
    renderer.shadowMap.needsUpdate = true;
}

function updateEnvironmentAndBackground(hdriPath) {
    if (!window.scene || !window.renderer) return;

    /*
     * Central HDRI authority.
     */
    if (window.smHDRSkySystem?.loadHDRI) {
        return window.smHDRSkySystem.loadHDRI(hdriPath);
    }

    /*
     * Legacy fallback.
     */
    if (typeof THREE === 'undefined' ||
        typeof THREE.RGBELoader === 'undefined') {
        return;
    }

    const rgbeLoader = new THREE.RGBELoader();

    rgbeLoader.load(hdriPath, (texture) => {
        texture.mapping =
            THREE.EquirectangularReflectionMapping;

        /*
         * Visible background is allowed.
         * Material IBL is controlled separately.
         */
        window.scene.background = texture;

        if (
            window.smGlobalIBLAllowed !== false &&
            window.smHDRIEnvironmentEnabled !== false
        ) {
            window.scene.environment = texture;

            if ('environmentIntensity' in window.scene) {
                window.scene.environmentIntensity =
                    Number(
                        window.smActiveHDRI?.intensity
                    ) || 0.48;
            }
        }

        window.dispatchEvent?.(
            new CustomEvent('sm:hdri-loaded', {
                detail: {
                    path: hdriPath,
                    texture
                }
            })
        );
    });
}

// --- UI & TOOLS ---

function toggleLock() {
    if (window.selectedObject) {
        window.selectedObject.userData.isLocked = !window.selectedObject.userData.isLocked;
        console.log(window.selectedObject.name + " is now " + (window.selectedObject.userData.isLocked ? "Locked" : "Unlocked"));
    }
}

function setupEventListeners() {
    console.log("SM Engine: Setting up general event listeners...");
    document.querySelectorAll('.workspace-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.workspace-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
        });
    });
}

function setupSnowControls() {
    const snowToggle = document.getElementById('toggle-snow');
    if (snowToggle) {
        snowToggle.onclick = () => {
            window.isSnowing = !window.isSnowing;
            snowToggle.classList.toggle('active', window.isSnowing);
        };
    }
}

function setupSubToolbarControls() {
    console.log("SM Engine: Setting up sub-toolbar...");
}

function addGUI(scene, renderer, camera) {
    return { gui: null };
}

function syncDynamicLayoutVars() {
    const root = document.documentElement;
    const hierarchy = document.getElementById('hierarchy-panel');
    const inspector = document.getElementById('inspector-panel');
    const timeline = document.getElementById('timelineBody');
    
    if (hierarchy) root.style.setProperty('--hierarchy-width', hierarchy.offsetWidth + 'px');
    if (inspector) root.style.setProperty('--inspector-width', inspector.offsetWidth + 'px');
    if (timeline) root.style.setProperty('--timeline-height', timeline.offsetHeight + 'px');
}


// Classic scripts normally expose declarations on window, but that guarantee
// disappears when this file is evaluated by a module-aware loader. AssetsPanel
// and hierarchy bridges intentionally consume these stable editor entrypoints.
window.selectObject = window.selectObject || selectObject;
window.addObjectToScene = window.addObjectToScene || addObjectToScene;
window.removeObjectFromScene =
    window.removeObjectFromScene || removeObjectFromScene;