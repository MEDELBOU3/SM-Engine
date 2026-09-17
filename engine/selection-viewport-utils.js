// ============================================================
// engine/selection-viewport-utils.js
//
// SM Engine — Stable Viewport / Selection Utilities
//
// Responsibilities:
//   - Active viewport camera/controls bindings
//   - Renderer-container resize synchronization
//   - Click-to-select raycasting
//   - Selection outline + FXAA synchronization
//   - Transform gizmo binding/rendering
//   - Axis navigation gizmo
//   - Viewport grid orientation bridge
//   - Editor counters
//   - Small compatibility/UI helpers
//
// IMPORTANT OWNERSHIP RULES
// ------------------------------------------------------------
// This file DOES NOT own:
//   - Renderer quality / pixel ratio policy
//   - Tone mapping
//   - Exposure
//   - Shadow configuration
//   - Camera creation
//   - Camera lifecycle
//   - Global lighting
//
// Those responsibilities belong to their dedicated systems.
//
// This file only synchronizes viewport-facing state.
// ============================================================


// ============================================================
// Safe engine accessors
// ============================================================

function getSMRenderer() {
    if (window.renderer) return window.renderer;

    try {
        if (typeof renderer !== 'undefined' && renderer) {
            return renderer;
        }
    } catch (_) {}

    return null;
}


function getSMScene() {
    if (window.scene) return window.scene;

    try {
        if (typeof scene !== 'undefined' && scene) {
            return scene;
        }
    } catch (_) {}

    return null;
}


function getSMComposer() {
    if (window.composer) return window.composer;

    try {
        if (typeof composer !== 'undefined' && composer) {
            return composer;
        }
    } catch (_) {}

    return null;
}


function getSMResizeRAF() {
    return window.__smViewportResizeRAF || 0;
}


function setSMResizeRAF(value) {
    window.__smViewportResizeRAF = value || 0;
}


function getActiveViewportCamera() {
    const cameraSystem = window.cameraSystem;

    if (cameraSystem?.activeCamera) {
        return cameraSystem.activeCamera;
    }

    if (window.activeCamera) {
        return window.activeCamera;
    }

    if (window.camera) {
        return window.camera;
    }

    try {
        if (typeof camera !== 'undefined' && camera) {
            return camera;
        }
    } catch (_) {}

    return null;
}


function getActiveViewportControls() {
    const cameraSystem = window.cameraSystem;

    if (cameraSystem?.controls) {
        return cameraSystem.controls;
    }

    if (window.orbitControls) {
        return window.orbitControls;
    }

    if (window.controls) {
        return window.controls;
    }

    try {
        if (typeof controls !== 'undefined' && controls) {
            return controls;
        }
    } catch (_) {}

    return null;
}


function getActiveViewportScene() {
    return getSMScene();
}


// ============================================================
// Viewport dimensions
// ============================================================

function getRendererViewportSize() {
    const container = document.getElementById('renderer-container');

    if (!container) {
        return {
            width: Math.max(1, Math.floor(window.innerWidth || 1)),
            height: Math.max(1, Math.floor(window.innerHeight || 1))
        };
    }

    const rect = container.getBoundingClientRect?.();

    const width = Math.max(
        1,
        Math.floor(
            rect?.width ||
            container.clientWidth ||
            window.innerWidth ||
            1
        )
    );

    const height = Math.max(
        1,
        Math.floor(
            rect?.height ||
            container.clientHeight ||
            window.innerHeight ||
            1
        )
    );

    return {
        width,
        height
    };
}


// ============================================================
// Post-processing synchronization
// ============================================================

function syncPostProcessingViewport(width, height) {
    const renderer = getSMRenderer();
    const composer = getSMComposer();
    const activeCam = getActiveViewportCamera();

    const safeWidth = Math.max(1, Math.floor(Number(width) || 1));
    const safeHeight = Math.max(1, Math.floor(Number(height) || 1));

    // Composer
    if (composer?.setSize) {
        try {
            composer.setSize(safeWidth, safeHeight);
        } catch (error) {
            console.warn(
                '[SM Viewport] Composer resize failed:',
                error
            );
        }
    }

    // Outline
    const outlinePass = window.outlinePass;

    if (outlinePass) {
        try {
            if (activeCam) {
                outlinePass.renderCamera = activeCam;
            }

            outlinePass.resolution?.set?.(
                safeWidth,
                safeHeight
            );

            outlinePass.setSize?.(
                safeWidth,
                safeHeight
            );
        } catch (error) {
            console.warn(
                '[SM Viewport] Outline resize failed:',
                error
            );
        }
    }

    // FXAA
    const fxaaPass = window.__smFXAAPass;

    if (
        renderer &&
        fxaaPass?.uniforms?.resolution?.value
    ) {
        const pixelRatio =
            Number(renderer.getPixelRatio?.()) || 1;

        const invWidth =
            1 /
            Math.max(
                1,
                safeWidth * pixelRatio
            );

        const invHeight =
            1 /
            Math.max(
                1,
                safeHeight * pixelRatio
            );

        try {
            fxaaPass.uniforms.resolution.value.set(
                invWidth,
                invHeight
            );
        } catch (_) {}
    }
}


// ============================================================
// Camera / controls synchronization
// ============================================================

function syncActiveViewportCameraBindings() {
    const activeCam = getActiveViewportCamera();
    const activeControls = getActiveViewportControls();

    if (!activeCam) {
        return null;
    }

    // CameraSystem remains authoritative.
    // We only synchronize dependent systems.

    if (
        activeControls &&
        activeControls.object !== activeCam
    ) {
        try {
            activeControls.object = activeCam;
            activeControls.update?.();
        } catch (error) {
            console.warn(
                '[SM Viewport] Controls camera sync failed:',
                error
            );
        }
    }

    const gizmo =
        window.transformControls ||
        (() => {
            try {
                return typeof transformControls !== 'undefined'
                    ? transformControls
                    : null;
            } catch (_) {
                return null;
            }
        })();

    if (gizmo) {
        try {
            gizmo.camera = activeCam;
        } catch (_) {}
    }

    if (window.outlinePass) {
        try {
            window.outlinePass.renderCamera = activeCam;
        } catch (_) {}
    }

    return activeCam;
}


// ============================================================
// Grid synchronization
// ============================================================

function updateViewportGridForAxis(axis) {
    const normAxis = String(axis || '')
        .trim()
        .toLowerCase();

    // Preferred grid owner.
    if (
        typeof window.applyGridOrientationForView ===
        'function'
    ) {
        try {
            window.applyGridOrientationForView(normAxis);
            return;
        } catch (error) {
            console.warn(
                '[SM Viewport] Grid orientation bridge failed:',
                error
            );
        }
    }

    const scene = getSMScene();

    const candidates = [
        window.advancedGrid,
        window.gridHelper,
        scene?.getObjectByName?.('advancedGrid'),
        scene?.getObjectByName?.('gridHelper'),
        scene?.getObjectByName?.('GridHelper')
    ].filter(Boolean);

    const unique = [...new Set(candidates)];

    unique.forEach(grid => {
        if (!grid?.rotation) return;

        try {
            switch (normAxis) {
                case 'x':
                case '-x':
                    grid.rotation.set(
                        0,
                        0,
                        -Math.PI / 2
                    );
                    break;

                case 'z':
                case '-z':
                    grid.rotation.set(
                        Math.PI / 2,
                        0,
                        0
                    );
                    break;

                case 'y':
                case '-y':
                case 'perspective':
                default:
                    grid.rotation.set(
                        0,
                        0,
                        0
                    );
                    break;
            }

            grid.updateMatrixWorld?.(true);
        } catch (error) {
            console.warn(
                '[SM Viewport] Grid update failed:',
                error
            );
        }
    });

    if (
        window.isModelingMode &&
        typeof window.applyModelingGridState === 'function'
    ) {
        try {
            window.applyModelingGridState();
        } catch (_) {}
    }
}


window.updateViewportGridForAxis =
    updateViewportGridForAxis;


// ============================================================
// Bone visibility
// ============================================================

function toggleBoneVisibility(show) {
    const scene = getSMScene();

    if (!scene) return;

    const visible = !!show;

    scene.traverse(node => {
        if (!node) return;

        if (node.isBone) {
            node.visible = visible;
        }

        if (
            node.isSkeletonHelper ||
            node.type === 'SkeletonHelper'
        ) {
            node.visible = visible;
        }
    });
}


// ============================================================
// Editor counters
// ============================================================

function updateEditorStatusCounters(naniteStats) {
    const scene = getSMScene();

    if (!scene) return;

    const now = performance.now();

    const previousFpsTime =
        Number(window.smLastFpsUpdate) || now;

    const previousFrameCount =
        Number(window.smFramesSinceFpsUpdate) || 0;

    if (
        now - previousFpsTime >= 500
    ) {
        const fps = Math.round(
            (
                previousFrameCount * 1000
            ) /
            Math.max(
                1,
                now - previousFpsTime
            )
        );

        const fpsEl =
            document.getElementById('fps');

        if (fpsEl) {
            fpsEl.textContent =
                `FPS: ${fps}`;
        }

        window.smFramesSinceFpsUpdate = 0;
        window.smLastFpsUpdate = now;
    }

    let objectCount = 0;
    let triangleCount = 0;

    scene.traverse(obj => {
        if (!obj) return;

        const data = obj.userData || {};

        if (
            data.ignoreInHierarchy ||
            data.isSystemObject
        ) {
            return;
        }

        objectCount++;

        if (
            obj.isMesh &&
            obj.geometry
        ) {
            const indexCount =
                obj.geometry.index?.count || 0;

            const positionCount =
                obj.geometry.attributes?.position?.count ||
                0;

            triangleCount += indexCount
                ? indexCount / 3
                : positionCount / 3;
        }
    });

    const objectsEl =
        document.getElementById('objects');

    const trianglesEl =
        document.getElementById('triangles');

    if (objectsEl) {
        objectsEl.textContent =
            `Objects: ${objectCount}`;
    }

    if (trianglesEl) {
        trianglesEl.textContent =
            `Triangles: ${Math.round(triangleCount)}`;
    }

    // Keep compatibility with future Nanite/stat systems.
    if (naniteStats) {
        window.__smLastNaniteStats = naniteStats;
    }
}


// ============================================================
// Resize handling
// ============================================================

function onWindowResize() {
    const renderer = getSMRenderer();

    if (!renderer) {
        return;
    }

    const previousRAF =
        getSMResizeRAF();

    if (previousRAF) {
        cancelAnimationFrame(previousRAF);
    }

    const raf = requestAnimationFrame(() => {
        setSMResizeRAF(0);

        const {
            width,
            height
        } = getRendererViewportSize();

        // ----------------------------------------------------
        // CAMERA
        // ----------------------------------------------------
        // CameraSystem owns camera projection updates.
        // We notify it but do NOT modify camera state here.
        try {
            window.cameraSystem?.onResize?.(
                width,
                height
            );
        } catch (error) {
            console.warn(
                '[SM Viewport] Camera resize warning:',
                error
            );
        }

        // ----------------------------------------------------
        // RENDERER
        // ----------------------------------------------------
        // IMPORTANT:
        // Pixel ratio is intentionally NOT changed here.
        //
        // DynamicResolutionManager / renderer-quality system
        // owns pixel ratio.
        //
        // This utility only synchronizes physical viewport size.
        try {
            renderer.setSize(
                width,
                height,
                false
            );
        } catch (error) {
            console.warn(
                '[SM Viewport] Renderer setSize failed:',
                error
            );
        }

        try {
            renderer.setViewport(
                0,
                0,
                width,
                height
            );
        } catch (_) {}

        // Let renderer/scissor owner decide scissor policy.
        // Only disable it when no explicit viewport system owns it.
        if (
            !window.SMViewportSystem &&
            typeof renderer.setScissorTest === 'function'
        ) {
            try {
                renderer.setScissorTest(false);
            } catch (_) {}
        }

        // ----------------------------------------------------
        // DEPENDENTS
        // ----------------------------------------------------

        syncActiveViewportCameraBindings();

        syncPostProcessingViewport(
            width,
            height
        );

        // Renderer facade can receive notification,
        // but it remains the owner of its internal state.
        try {
            window.SMEngineRenderer?.resize?.(
                width,
                height
            );
        } catch (error) {
            console.warn(
                '[SM Viewport] SMEngineRenderer resize warning:',
                error
            );
        }

        syncDynamicLayoutVars();

        window.dispatchEvent(
            new CustomEvent(
                'sm:viewport-resized',
                {
                    detail: {
                        width,
                        height
                    }
                }
            )
        );
    });

    setSMResizeRAF(raf);
}


// ============================================================
// Resize observer
// ============================================================

function installRendererContainerResizeObserver() {
    const container =
        document.getElementById(
            'renderer-container'
        );

    if (
        !container ||
        container.__smResizeObserverInstalled
    ) {
        return;
    }

    container.__smResizeObserverInstalled = true;

    if (
        typeof ResizeObserver !== 'undefined'
    ) {
        window.__smRendererResizeObserver
            ?.disconnect?.();

        window.__smRendererResizeObserver =
            new ResizeObserver(entries => {
                const entry =
                    entries?.[0];

                if (!entry) return;

                const width =
                    Number(entry.contentRect?.width) || 0;

                const height =
                    Number(entry.contentRect?.height) || 0;

                if (
                    width > 0 &&
                    height > 0
                ) {
                    onWindowResize();
                }
            });

        window.__smRendererResizeObserver.observe(
            container
        );
    }

    if (
        !window.__smViewportResizeWindowBound
    ) {
        window.addEventListener(
            'sm:layout-resized',
            onWindowResize
        );

        window.addEventListener(
            'resize',
            onWindowResize,
            { passive: true }
        );

        window.__smViewportResizeWindowBound =
            true;
    }

    onWindowResize();
}


// ============================================================
// Auto installation
// ============================================================

if (
    document.readyState === 'loading'
) {
    document.addEventListener(
        'DOMContentLoaded',
        installRendererContainerResizeObserver,
        {
            once: true
        }
    );
} else {
    installRendererContainerResizeObserver();
}


// ============================================================
// UI compatibility
// ============================================================

function bindCoreUiOnce() {
    if (window.__smCoreUiBound) {
        return;
    }

    window.__smCoreUiBound = true;

    console.log(
        'SM Engine: Binding core UI elements...'
    );

    // --------------------------------------------------------
    // Transform mode delegation
    // --------------------------------------------------------

    if (
        !window.__smTransformModeDelegated
    ) {
        document.addEventListener(
            'click',
            event => {
                const button =
                    event.target?.closest?.(
                        '[data-transform-mode], ' +
                        '#translate, ' +
                        '#rotate, ' +
                        '#scale, ' +
                        '#translate-btn, ' +
                        '#rotate-btn, ' +
                        '#scale-btn'
                    );

                if (!button) return;

                const legacyMode =
                    button.id
                        ?.replace(
                            '-btn',
                            ''
                        );

                const mode =
                    button.dataset.transformMode ||
                    legacyMode;

                if (
                    ![
                        'translate',
                        'rotate',
                        'scale'
                    ].includes(mode)
                ) {
                    return;
                }

                event.preventDefault();

                window.setTransformMode?.(
                    mode
                );
            }
        );

        window.__smTransformModeDelegated =
            true;
    }

    // --------------------------------------------------------
    // Delete
    // --------------------------------------------------------

    const deleteBtn =
        document.getElementById(
            'delete-btn'
        );

    if (deleteBtn) {
        deleteBtn.onclick = () => {
            const selected =
                window.selectedObject;

            if (
                selected &&
                typeof window.removeObjectFromScene ===
                'function'
            ) {
                window.removeObjectFromScene(
                    selected
                );
            } else {
                try {
                    if (
                        typeof removeObjectFromScene ===
                        'function'
                    ) {
                        removeObjectFromScene(
                            selected
                        );
                    }
                } catch (_) {}
            }
        };
    }

    // --------------------------------------------------------
    // Undo
    // --------------------------------------------------------

    const undoBtn =
        document.getElementById(
            'undo-btn'
        );

    if (
        undoBtn &&
        window.historyManager
    ) {
        undoBtn.onclick = () => {
            try {
                window.historyManager.undo?.();
            } catch (error) {
                console.warn(
                    '[SM Viewport] Undo failed:',
                    error
                );
            }
        };
    }
}


// ============================================================
// Assets panel
// ============================================================

function initAssetsPanelWhenReady() {
    const panel =
        window.AssetsPanel;

    if (
        panel &&
        typeof panel.init === 'function'
    ) {
        try {
            panel.init(
                getSMScene(),
                getSMRenderer(),
                getActiveViewportCamera(),
                window.raycaster || null
            );
        } catch (error) {
            console.warn(
                '[SM Viewport] AssetsPanel init failed:',
                error
            );
        }
    }
}


// ============================================================
// Hierarchy
// ============================================================

function updateHierarchy() {
    try {
        window.hierarchyManager
            ?.renderAll?.();
    } catch (error) {
        console.warn(
            '[SM Viewport] Hierarchy update failed:',
            error
        );
    }
}


// ============================================================
// Selection system
// ============================================================

function initSelectionSystem() {
    const renderer =
        getSMRenderer();

    const scene =
        getSMScene();

    if (
        !renderer?.domElement ||
        !scene ||
        typeof THREE === 'undefined'
    ) {
        return;
    }

    if (
        renderer.domElement
            .__smSelectionSystemInstalled
    ) {
        return;
    }

    renderer.domElement
        .__smSelectionSystemInstalled = true;

    console.log(
        'SM Engine: Initializing Selection System...'
    );

    const raycasterLocal =
        new THREE.Raycaster();

    const mouseLocal =
        new THREE.Vector2();

    const pointerState = {
        active: false,
        x: 0,
        y: 0,
        id: null
    };


    // --------------------------------------------------------
    // Editor-only filtering
    // --------------------------------------------------------

    const isEditorOnlyObject = object => {
        const activeScene =
            getSMScene();

        if (!object) {
            return true;
        }

        let current = object;

        while (
            current &&
            current !== activeScene
        ) {
            const data =
                current.userData || {};

            const activeMode =
                String(
                    window.workspaceManager
                        ?.currentMode ||
                    localStorage.getItem(
                        'sm_workspace_mode'
                    ) ||
                    'FILM'
                ).toUpperCase();

            const name =
                String(
                    current.name || ''
                ).trim();

            const isTerrainObject =
                current === window.terrain ||
                data.isTerrain === true ||
                data.isTerrainMesh === true ||
                data.isTerrainComponent === true ||
                data.workspaceOnly === 'TERRAIN' ||
                name === 'Terrain' ||
                name === 'Terrain_Mesh' ||
                name.startsWith('Terrain_');

            if (
                isTerrainObject &&
                activeMode !== 'TERRAIN'
            ) {
                return true;
            }

            if (
                data.isSystemObject ||
                data.ignoreInHierarchy ||
                data.selectable === false ||
                data.isTransformControlsChild ||
                data.isViewportGrid ||
                current.isTransformControls
            ) {
                return true;
            }

            current =
                current.parent;
        }

        return false;
    };


    // --------------------------------------------------------
    // Selection
    // --------------------------------------------------------

    const applySelection = event => {
        const scene =
            getSMScene();

        if (!scene) return;

        if (
            window.isModelingMode ||
            window.transformControls?.dragging
        ) {
            return;
        }

        const activeCam =
            getActiveViewportCamera();

        if (!activeCam) {
            return;
        }

        const rect =
            renderer.domElement
                .getBoundingClientRect();

        if (
            !rect.width ||
            !rect.height
        ) {
            return;
        }

        mouseLocal.x =
            (
                (event.clientX - rect.left) /
                rect.width
            ) * 2 - 1;

        mouseLocal.y =
            -(
                (event.clientY - rect.top) /
                rect.height
            ) * 2 + 1;

        raycasterLocal.setFromCamera(
            mouseLocal,
            activeCam
        );

        const explicitRoots =
            Array.isArray(
                window.selectableObjects
            )
                ? window.selectableObjects
                    .filter(
                        object =>
                            object?.isObject3D &&
                            object.visible !== false
                    )
                : [];

        // IMPORTANT:
        // If selectableObjects exists but is incomplete,
        // don't silently make the rest of the scene
        // unselectable.
        //
        // We therefore use explicit roots only when the
        // selection system explicitly declares them authoritative.
        const useExplicitRoots =
            window.__smSelectableObjectsAuthoritative === true;

        const raycastRoots =
            useExplicitRoots &&
            explicitRoots.length
                ? explicitRoots
                : scene.children;

        let intersects = [];

        try {
            intersects =
                raycasterLocal
                    .intersectObjects(
                        raycastRoots,
                        true
                    )
                    .filter(
                        hit =>
                            !isEditorOnlyObject(
                                hit.object
                            )
                    );
        } catch (error) {
            console.warn(
                '[SM Selection] Raycast failed:',
                error
            );

            return;
        }

        let target = null;

        if (intersects.length > 0) {
            target =
                intersects[0].object;

            if (
                target.userData?.targetBone
            ) {
                target =
                    target.userData.targetBone;
            }

            if (!target.isBone) {
                while (
                    target.parent &&
                    target.parent !== scene &&
                    !target.userData
                        ?.isSelectableRoot &&
                    !target.isBone
                ) {
                    target =
                        target.parent;
                }
            }
        }

        // ----------------------------------------------------
        // Selection state
        // ----------------------------------------------------

        window.selectedObject =
            target;

        try {
            if (
                typeof selectedObject !==
                'undefined'
            ) {
                selectedObject =
                    target;
            }
        } catch (_) {}

        window.selectedBone =
            target?.isBone
                ? target
                : null;

        // ----------------------------------------------------
        // Transform controls
        // ----------------------------------------------------

        const transformControls =
            window.transformControls;

        if (transformControls) {
            try {
                if (target) {
                    transformControls.attach(
                        target
                    );

                    transformControls.visible =
                        true;
                } else {
                    transformControls.detach();

                    transformControls.visible =
                        false;
                }
            } catch (error) {
                console.warn(
                    '[SM Selection] Transform controls attach failed:',
                    error
                );
            }
        }

        // ----------------------------------------------------
        // Outline
        // ----------------------------------------------------

        if (window.outlinePass) {
            try {
                window.outlinePass.selectedObjects =
                    target
                        ? [target]
                        : [];
            } catch (_) {}
        }

        // ----------------------------------------------------
        // Physics
        // ----------------------------------------------------

        const activePhysics =
            window.physicsSystem;

        try {
            activePhysics
                ?.setSelectedObject?.(
                    target
                );
        } catch (_) {}

        // ----------------------------------------------------
        // UI
        // ----------------------------------------------------

        updateHierarchy();

        try {
            if (
                typeof updateInspector ===
                'function'
            ) {
                updateInspector();
            }
        } catch (_) {}

        try {
            window.hierarchyManager
                ?.updateSelectionStyle?.();
        } catch (_) {}

        window.dispatchEvent(
            new CustomEvent(
                'sm:selection-changed',
                {
                    detail: {
                        object: target,
                        bone:
                            target?.isBone
                                ? target
                                : null
                    }
                }
            )
        );
    };


    // --------------------------------------------------------
    // Pointer down
    // --------------------------------------------------------

    renderer.domElement.addEventListener(
        'pointerdown',
        event => {
            if (
                event.button !== 0 ||
                window.isModelingMode ||
                window.transformControls?.dragging
            ) {
                return;
            }

            pointerState.active =
                true;

            pointerState.x =
                event.clientX;

            pointerState.y =
                event.clientY;

            pointerState.id =
                event.pointerId;

            try {
                renderer.domElement
                    .setPointerCapture?.(
                        event.pointerId
                    );
            } catch (_) {}
        }
    );


    // --------------------------------------------------------
    // Pointer cancel
    // --------------------------------------------------------

    renderer.domElement.addEventListener(
        'pointercancel',
        event => {
            pointerState.active =
                false;

            pointerState.id =
                null;

            try {
                renderer.domElement
                    .releasePointerCapture?.(
                        event.pointerId
                    );
            } catch (_) {}
        }
    );


    // --------------------------------------------------------
    // Pointer up
    // --------------------------------------------------------

    renderer.domElement.addEventListener(
        'pointerup',
        event => {
            if (
                !pointerState.active ||
                event.button !== 0
            ) {
                return;
            }

            if (
                pointerState.id !== null &&
                event.pointerId !==
                    pointerState.id
            ) {
                return;
            }

            const dx =
                event.clientX -
                pointerState.x;

            const dy =
                event.clientY -
                pointerState.y;

            pointerState.active =
                false;

            pointerState.id =
                null;

            try {
                renderer.domElement
                    .releasePointerCapture?.(
                        event.pointerId
                    );
            } catch (_) {}

            // Drag threshold.
            if (
                dx * dx +
                dy * dy >
                16
            ) {
                return;
            }

            applySelection(event);
        }
    );
}


// ============================================================
// Outline / FXAA composer
// ============================================================

function sanitizeOutlineSelection(
    objs
) {
    if (!objs) {
        return [];
    }

    const list =
        Array.isArray(objs)
            ? objs
            : [objs];

    const safe = [];

    const seen =
        new Set();

    list.forEach(obj => {
        if (
            !obj ||
            !obj.isObject3D
        ) {
            return;
        }

        if (
            obj.isBone ||
            obj.isSkeletonHelper ||
            obj.isSkinnedMesh
        ) {
            return;
        }

        let hasSkinnedMesh =
            false;

        obj.traverse(child => {
            if (
                child.isSkinnedMesh ||
                child.isBone ||
                child.isSkeletonHelper
            ) {
                hasSkinnedMesh =
                    true;
            }
        });

        if (!hasSkinnedMesh) {
            if (!seen.has(obj)) {
                seen.add(obj);
                safe.push(obj);
            }

            return;
        }

        obj.traverse(child => {
            if (
                child.isMesh &&
                !child.isSkinnedMesh &&
                !child.isBone
            ) {
                if (!seen.has(child)) {
                    seen.add(child);
                    safe.push(child);
                }
            }
        });
    });

    return safe;
}


function initSelectionComposer() {
    const composer =
        getSMComposer();

    const scene =
        getSMScene();

    if (
        !composer ||
        !scene ||
        typeof THREE === 'undefined'
    ) {
        return;
    }

    // --------------------------------------------------------
    // Already initialized
    // --------------------------------------------------------

    if (
        window.outlinePass &&
        window.__smSelectionComposer ===
            composer
    ) {
        syncActiveViewportCameraBindings();

        const size =
            getRendererViewportSize();

        syncPostProcessingViewport(
            size.width,
            size.height
        );

        return;
    }

    console.log(
        'SM Engine: Setting up Selection Outline...'
    );

    try {
        const {
            width,
            height
        } = getRendererViewportSize();

        const activeCam =
            getActiveViewportCamera();

        if (!activeCam) {
            return;
        }

        // ----------------------------------------------------
        // Outline
        // ----------------------------------------------------

        const outlinePass =
            new THREE.OutlinePass(
                new THREE.Vector2(
                    width,
                    height
                ),
                scene,
                activeCam
            );

        outlinePass.edgeStrength =
            3.0;

        outlinePass.edgeGlow =
            0.5;

        outlinePass.edgeThickness =
            1.0;

        outlinePass.pulsePeriod =
            0;

        outlinePass.visibleEdgeColor
            ?.set?.('#ffffff');

        outlinePass.hiddenEdgeColor
            ?.set?.('#190a05');

        let internalSelectedObjects =
            [];

        Object.defineProperty(
            outlinePass,
            'selectedObjects',
            {
                get() {
                    return internalSelectedObjects;
                },

                set(value) {
                    internalSelectedObjects =
                        sanitizeOutlineSelection(
                            value
                        );
                },

                configurable: true,
                enumerable: true
            }
        );

        composer.addPass(
            outlinePass
        );

        window.outlinePass =
            outlinePass;

        // ----------------------------------------------------
        // FXAA
        // ----------------------------------------------------

        let fxaaPass = null;

        if (
            THREE.ShaderPass &&
            THREE.FXAAShader
        ) {
            fxaaPass =
                new THREE.ShaderPass(
                    THREE.FXAAShader
                );

            composer.addPass(
                fxaaPass
            );

            window.__smFXAAPass =
                fxaaPass;
        }

        window.__smSelectionComposer =
            composer;

        // ----------------------------------------------------
        // Initial synchronization
        // ----------------------------------------------------

        syncActiveViewportCameraBindings();

        syncPostProcessingViewport(
            width,
            height
        );

        // ----------------------------------------------------
        // Camera change event
        // ----------------------------------------------------

        if (
            !window.__smOutlineCameraSyncBound
        ) {
            window.addEventListener(
                'sm:camera-view-changed',
                () => {
                    syncActiveViewportCameraBindings();

                    const size =
                        getRendererViewportSize();

                    syncPostProcessingViewport(
                        size.width,
                        size.height
                    );
                }
            );

            window.__smOutlineCameraSyncBound =
                true;
        }

        // ----------------------------------------------------
        // Viewport resize
        // ----------------------------------------------------

        if (
            !window.__smOutlineResizeSyncBound
        ) {
            window.addEventListener(
                'sm:viewport-resized',
                event => {
                    const width =
                        Number(
                            event.detail?.width
                        ) || 1;

                    const height =
                        Number(
                            event.detail?.height
                        ) || 1;

                    syncPostProcessingViewport(
                        width,
                        height
                    );
                }
            );

            window.__smOutlineResizeSyncBound =
                true;
        }

    } catch (error) {
        console.error(
            'Failed to init selection composer:',
            error
        );
    }
}


// ============================================================
// Renderer context recovery
// ============================================================

function bindMainRendererContextRecoveryHandlers() {
    const renderer =
        getSMRenderer();

    if (
        !renderer?.domElement
    ) {
        return;
    }

    if (
        renderer.domElement
            .__smContextRecoveryBound
    ) {
        return;
    }

    renderer.domElement
        .__smContextRecoveryBound = true;

    renderer.domElement.addEventListener(
        'webglcontextlost',
        event => {
            event.preventDefault();

            console.warn(
                'WebGL Context Lost. Waiting for renderer recovery...'
            );

            window.dispatchEvent(
                new CustomEvent(
                    'sm:webgl-context-lost'
                )
            );
        },
        false
    );

    renderer.domElement.addEventListener(
        'webglcontextrestored',
        () => {
            console.log(
                'WebGL Context Restored.'
            );

            window.__smSelectionComposer =
                null;

            window.outlinePass =
                null;

            window.__smFXAAPass =
                null;

            window.dispatchEvent(
                new CustomEvent(
                    'sm:webgl-context-restored'
                )
            );
        },
        false
    );
}


// ============================================================
// Transform Controls
// ============================================================

function markTransformControlsChildren(
    group
) {
    if (!group) return;

    group.traverse(child => {
        child.userData =
            child.userData || {};

        child.userData.isSystemObject =
            true;

        child.userData.ignoreInHierarchy =
            true;

        child.userData.selectable =
            false;

        child.userData.isTransformControlsChild =
            true;
    });
}


// ------------------------------------------------------------
// Gizmo material state cache
// ------------------------------------------------------------

const SM_GIZMO_MATERIAL_STATE =
    new WeakMap();


function fixTransformControlsGizmoRendering(
    controls
) {
    if (!controls) {
        return;
    }

    try {
        controls.setSize?.(1.15);

        controls.showX = true;
        controls.showY = true;
        controls.showZ = true;

        controls.traverse(obj => {
            if (!obj) return;

            obj.frustumCulled =
                false;

            if (!obj.material) {
                obj.renderOrder =
                    999;

                return;
            }

            const materials =
                Array.isArray(
                    obj.material
                )
                    ? obj.material
                    : [obj.material];

            materials.forEach(material => {
                if (
                    !SM_GIZMO_MATERIAL_STATE.has(
                        material
                    )
                ) {
                    SM_GIZMO_MATERIAL_STATE.set(
                        material,
                        {
                            depthTest:
                                material.depthTest,
                            depthWrite:
                                material.depthWrite,
                            transparent:
                                material.transparent
                        }
                    );
                }

                // Gizmo must stay visible above scene.
                material.depthTest =
                    false;

                material.depthWrite =
                    false;

                material.transparent =
                    true;

                material.needsUpdate =
                    true;
            });

            obj.renderOrder =
                999;
        });
    } catch (error) {
        console.warn(
            '[SM Gizmo] Rendering setup failed:',
            error
        );
    }
}


function restoreTransformControlsGizmoRendering(
    controls
) {
    if (!controls) {
        return;
    }

    try {
        controls.traverse(obj => {
            if (!obj?.material) {
                return;
            }

            const materials =
                Array.isArray(
                    obj.material
                )
                    ? obj.material
                    : [obj.material];

            materials.forEach(material => {
                const state =
                    SM_GIZMO_MATERIAL_STATE.get(
                        material
                    );

                if (!state) {
                    return;
                }

                material.depthTest =
                    state.depthTest;

                material.depthWrite =
                    state.depthWrite;

                material.transparent =
                    state.transparent;

                material.needsUpdate =
                    true;
            });
        });
    } catch (_) {}
}


function updateTransformControlsForActiveView() {
    const gizmo =
        window.transformControls;

    if (!gizmo) {
        return;
    }

    const activeCam =
        syncActiveViewportCameraBindings();

    if (activeCam) {
        try {
            gizmo.camera =
                activeCam;
        } catch (_) {}
    }
}


function primeTransformControlsInteraction() {
    const gizmo =
        window.transformControls;

    if (!gizmo) {
        return;
    }

    markTransformControlsChildren(
        gizmo
    );

    fixTransformControlsGizmoRendering(
        gizmo
    );

    updateTransformControlsForActiveView();
}


// ============================================================
// Scene setup
// ============================================================

function setupSceneElements() {
    window.updateAxisGizmo?.();

    syncDynamicLayoutVars();
}


// ============================================================
// Modeling
// ============================================================

function initModeling() {
    try {
        if (
            typeof initModelingSystem ===
            'function'
        ) {
            initModelingSystem();
        }
    } catch (error) {
        console.warn(
            '[SM Viewport] Modeling init failed:',
            error
        );
    }
}


// ============================================================
// Physics brush
// ============================================================

function initPhysicsBrushCursor() {
    const activePhysics =
        window.physicsSystem;

    try {
        activePhysics
            ?.initBrushCursor?.();
    } catch (error) {
        console.warn(
            '[SM Viewport] Physics brush init failed:',
            error
        );
    }
}


// ============================================================
// Dynamic CSS viewport variables
// ============================================================

function syncDynamicLayoutVars() {
    const container =
        document.getElementById(
            'renderer-container'
        );

    if (!container) {
        return;
    }

    const rect =
        container.getBoundingClientRect?.();

    if (!rect) {
        return;
    }

    const root =
        document.documentElement;

    root.style.setProperty(
        '--sm-viewport-width',
        `${Math.max(
            0,
            Math.round(rect.width)
        )}px`
    );

    root.style.setProperty(
        '--sm-viewport-height',
        `${Math.max(
            0,
            Math.round(rect.height)
        )}px`
    );
}


// ============================================================
// Viewport resize observer compatibility
// ============================================================

function initViewportResizeObserver() {
    installRendererContainerResizeObserver();
}


// ============================================================
// Global transform mode
// ============================================================

window.setTransformMode =
    function setTransformMode(mode) {
        const normalized =
            mode === 'move'
                ? 'translate'
                : mode;

        if (
            ![
                'translate',
                'rotate',
                'scale'
            ].includes(normalized)
        ) {
            return false;
        }

        const gizmo =
            window.transformControls;

        if (
            gizmo &&
            typeof gizmo.setMode ===
            'function'
        ) {
            try {
                gizmo.showX = true;
                gizmo.showY = true;
                gizmo.showZ = true;

                gizmo.setSize?.(
                    1.15
                );

                gizmo.setMode(
                    normalized
                );

                if (
                    window.UnifiedModelingSystem
                        ?.isEditMode
                ) {
                    window.UnifiedModelingSystem
                        .currentTransformMode =
                        normalized;
                }

                if (gizmo.object) {
                    gizmo.visible =
                        true;
                }
            } catch (error) {
                console.warn(
                    '[SM Viewport] Transform mode failed:',
                    error
                );
            }
        }

        document
            .querySelectorAll(
                '[data-transform-mode], ' +
                '#translate, ' +
                '#rotate, ' +
                '#scale, ' +
                '#translate-btn, ' +
                '#rotate-btn, ' +
                '#scale-btn'
            )
            .forEach(button => {
                const buttonMode =
                    button.dataset
                        .transformMode ||
                    button.id
                        ?.replace(
                            '-btn',
                            ''
                        );

                button.classList.toggle(
                    'active',
                    buttonMode ===
                        normalized
                );
            });

        window.dispatchEvent(
            new CustomEvent(
                'sm:transform-mode-changed',
                {
                    detail: {
                        mode:
                            normalized
                    }
                }
            )
        );

        return true;
    };


// ============================================================
// Camera axis view
// ============================================================

window.setCameraView =
    function setCameraView(axis) {
        if (
            typeof THREE ===
            'undefined'
        ) {
            return false;
        }

        const system =
            window.cameraSystem;

        const controls =
            getActiveViewportControls();

        const previousCam =
            getActiveViewportCamera();

        if (
            !controls ||
            !previousCam
        ) {
            return false;
        }

        const aliases = {
            right: 'x',
            left: '-x',
            top: 'y',
            bottom: '-y',
            front: 'z',
            back: '-z',
            '+x': 'x',
            '+y': 'y',
            '+z': 'z'
        };

        const raw =
            String(axis || '')
                .trim()
                .toLowerCase();

        const normAxis =
            aliases[raw] || raw;

        if (
            ![
                'x',
                '-x',
                'y',
                '-y',
                'z',
                '-z'
            ].includes(normAxis)
        ) {
            return false;
        }

        const target =
            controls.target?.clone?.() ||
            new THREE.Vector3();

        const distance =
            Math.max(
                1,
                previousCam.position
                    .distanceTo(
                        target
                    ) || 15
            );

        // ----------------------------------------------------
        // Preferred CameraSystem path
        // ----------------------------------------------------

        if (
            typeof system?.setAxisView ===
            'function'
        ) {
            try {
                system.setAxisView(
                    normAxis,
                    {
                        orthographic:
                            true,
                        distance,
                        target,
                        animate:
                            false
                    }
                );
            } catch (error) {
                console.warn(
                    '[SM Camera] setAxisView failed:',
                    error
                );

                return false;
            }
        }

        // ----------------------------------------------------
        // Legacy fallback only
        // ----------------------------------------------------

        else {
            let cam =
                previousCam;

            if (
                !cam.isOrthographicCamera &&
                typeof window.switchToOrthographic ===
                    'function'
            ) {
                try {
                    window.switchToOrthographic(
                        {
                            preserveView:
                                true
                        }
                    );
                } catch (_) {}

                cam =
                    getActiveViewportCamera() ||
                    cam;
            }

            const offsets = {
                x:
                    new THREE.Vector3(
                        distance,
                        0,
                        0
                    ),

                '-x':
                    new THREE.Vector3(
                        -distance,
                        0,
                        0
                    ),

                y:
                    new THREE.Vector3(
                        0,
                        distance,
                        0
                    ),

                '-y':
                    new THREE.Vector3(
                        0,
                        -distance,
                        0
                    ),

                z:
                    new THREE.Vector3(
                        0,
                        0,
                        distance
                    ),

                '-z':
                    new THREE.Vector3(
                        0,
                        0,
                        -distance
                    )
            };

            const ups = {
                x:
                    new THREE.Vector3(
                        0,
                        1,
                        0
                    ),

                '-x':
                    new THREE.Vector3(
                        0,
                        1,
                        0
                    ),

                z:
                    new THREE.Vector3(
                        0,
                        1,
                        0
                    ),

                '-z':
                    new THREE.Vector3(
                        0,
                        1,
                        0
                    ),

                y:
                    new THREE.Vector3(
                        0,
                        0,
                        -1
                    ),

                '-y':
                    new THREE.Vector3(
                        0,
                        0,
                        1
                    )
            };

            cam.position.copy(
                target
            );

            cam.position.add(
                offsets[normAxis]
            );

            cam.up.copy(
                ups[normAxis]
            );

            cam.lookAt(
                target
            );

            cam.updateProjectionMatrix?.();

            cam.updateMatrixWorld?.(
                true
            );

            controls.object =
                cam;

            controls.target.copy(
                target
            );

            controls.enabled =
                true;

            controls.enableRotate =
                false;

            controls.update?.();

            window.currentCameraAxis =
                normAxis;

            window.cameraAxisLocked =
                true;
        }

        // ----------------------------------------------------
        // Viewport system synchronization
        // ----------------------------------------------------

        try {
            window.SMViewportSystem
                ?.syncPrimaryCameraMode?.(
                    'orthographic',
                    {
                        render:
                            false,
                        preserveAxisGizmo:
                            true
                    }
                );
        } catch (_) {}

        updateViewportGridForAxis(
            normAxis
        );

        syncActiveViewportCameraBindings();

        updateTransformControlsForActiveView();

        const activeCam =
            getActiveViewportCamera();

        if (activeCam) {
            // Compatibility only.
            // CameraSystem remains owner.
            window.activeCamera =
                activeCam;

            if (
                !window.cameraSystem
            ) {
                window.camera =
                    activeCam;
            }

            if (
                window.outlinePass
            ) {
                window.outlinePass
                    .renderCamera =
                    activeCam;
            }
        }

        window.currentCameraAxis =
            system?.currentAxisView ||
            normAxis;

        window.cameraAxisLocked =
            system?.axisViewLocked !==
            false;

        window.dispatchEvent(
            new CustomEvent(
                'sm:axis-view-changed',
                {
                    detail: {
                        axis:
                            normAxis,
                        mode:
                            'orthographic',
                        camera:
                            activeCam,
                        target:
                            target.clone()
                    }
                }
            )
        );

        window.updateAxisGizmo?.();

        return true;
    };


// ============================================================
// Exit axis view
// ============================================================

window.exitAxisView =
    function exitAxisView() {
        const system =
            window.cameraSystem;

        try {
            if (
                typeof system
                    ?.unlockAxisView ===
                'function'
            ) {
                system.unlockAxisView(
                    {
                        switchToPerspective:
                            true,
                        preserveView:
                            true
                    }
                );
            } else if (
                typeof system
                    ?.switchToPerspective ===
                'function'
            ) {
                system.switchToPerspective(
                    {
                        preserveView:
                            true
                    }
                );

                if (
                    window.controls
                ) {
                    window.controls
                        .enableRotate =
                        true;
                }
            } else {
                window.switchToPerspective
                    ?.({
                        preserveView:
                            true
                    });
            }
        } catch (error) {
            console.warn(
                '[SM Camera] Exit axis view failed:',
                error
            );

            return false;
        }

        window.currentCameraAxis =
            null;

        window.cameraAxisLocked =
            false;

        try {
            window.SMViewportSystem
                ?.syncPrimaryCameraMode?.(
                    'perspective',
                    {
                        render:
                            false,
                        preserveAxisGizmo:
                            true
                    }
                );
        } catch (_) {}

        updateViewportGridForAxis(
            'perspective'
        );

        syncActiveViewportCameraBindings();

        updateTransformControlsForActiveView();

        window.updateAxisGizmo?.();

        window.dispatchEvent(
            new CustomEvent(
                'sm:axis-view-changed',
                {
                    detail: {
                        axis:
                            'perspective',
                        mode:
                            'perspective',
                        camera:
                            getActiveViewportCamera()
                    }
                }
            )
        );

        return true;
    };


// ============================================================
// Axis navigation gizmo
// ============================================================

window.updateAxisGizmo =
    function updateAxisGizmo() {
        setupBlenderHandPanButton();

        const root =
            document.getElementById(
                'axis-controls'
            );

        const camera =
            getActiveViewportCamera();

        if (
            !root ||
            !camera ||
            typeof THREE ===
                'undefined'
        ) {
            return;
        }

        root.style.display =
            'block';

        root.style.pointerEvents =
            'auto';

        const width =
            root.clientWidth ||
            96;

        const height =
            root.clientHeight ||
            width;

        const cx =
            width * 0.5;

        const cy =
            height * 0.5;

        const radius =
            Math.max(
                25,
                Math.min(
                    width,
                    height
                ) * 0.34
            );

        const invQ =
            camera.quaternion
                .clone()
                .invert();

        const controls =
            getActiveViewportControls();

        const target =
            controls?.target ||
            new THREE.Vector3();

        // ----------------------------------------------------
        // Detect snapped axis
        // ----------------------------------------------------

        let snappedAxis =
            window.cameraSystem
                ?.axisViewLocked
                ? window.cameraSystem
                    .currentAxisView
                : (
                    window.cameraAxisLocked
                        ? window.currentCameraAxis
                        : null
                );

        if (
            !snappedAxis &&
            camera.isOrthographicCamera
        ) {
            const view =
                camera.position
                    .clone()
                    .sub(target);

            if (
                view.lengthSq() >
                1e-8
            ) {
                view.normalize();

                const candidates = [
                    [
                        'x',
                        new THREE.Vector3(
                            1,
                            0,
                            0
                        )
                    ],

                    [
                        '-x',
                        new THREE.Vector3(
                            -1,
                            0,
                            0
                        )
                    ],

                    [
                        'y',
                        new THREE.Vector3(
                            0,
                            1,
                            0
                        )
                    ],

                    [
                        '-y',
                        new THREE.Vector3(
                            0,
                            -1,
                            0
                        )
                    ],

                    [
                        'z',
                        new THREE.Vector3(
                            0,
                            0,
                            1
                        )
                    ],

                    [
                        '-z',
                        new THREE.Vector3(
                            0,
                            0,
                            -1
                        )
                    ]
                ];

                let best =
                    -Infinity;

                for (
                    const [
                        name,
                        dir
                    ]
                    of candidates
                ) {
                    const dot =
                        view.dot(dir);

                    if (
                        dot >
                        best
                    ) {
                        best =
                            dot;

                        snappedAxis =
                            name;
                    }
                }

                if (
                    best <
                    0.9995
                ) {
                    snappedAxis =
                        null;
                }
            }
        }

        root.dataset.viewAxis =
            camera.isOrthographicCamera
                ? (
                    snappedAxis ||
                    'user-ortho'
                )
                : 'perspective';

        const axes = [
            {
                id:
                    'axis-x',

                neg:
                    'axis-x-neg',

                view:
                    'x',

                color:
                    '#ff4d5a',

                dir:
                    new THREE.Vector3(
                        1,
                        0,
                        0
                    )
            },

            {
                id:
                    'axis-y',

                neg:
                    'axis-y-neg',

                view:
                    'y',

                color:
                    '#72d572',

                dir:
                    new THREE.Vector3(
                        0,
                        1,
                        0
                    )
            },

            {
                id:
                    'axis-z',

                neg:
                    'axis-z-neg',

                view:
                    'z',

                color:
                    '#4aa3ff',

                dir:
                    new THREE.Vector3(
                        0,
                        0,
                        1
                    )
            }
        ];

        const svg =
            document.getElementById(
                'axis-lines'
            );

        if (svg) {
            svg.innerHTML =
                '';

            svg.setAttribute(
                'viewBox',
                `0 0 ${width} ${height}`
            );
        }

        const place =
            (
                element,
                x,
                y,
                depth,
                active
            ) => {
                if (!element) {
                    return;
                }

                element.style.left =
                    `${x}px`;

                element.style.top =
                    `${y}px`;

                element.style.transform =
                    'translate(-50%, -50%)';

                element.style.zIndex =
                    depth >= 0
                        ? '14'
                        : '5';

                element.classList.toggle(
                    'active',
                    !!active
                );

                element.setAttribute(
                    'aria-pressed',
                    active
                        ? 'true'
                        : 'false'
                );
            };

        for (
            const axis of axes
        ) {
            const p =
                axis.dir
                    .clone()
                    .applyQuaternion(
                        invQ
                    );

            const px =
                cx +
                p.x *
                    radius;

            const py =
                cy -
                p.y *
                    radius;

            const nx =
                cx -
                p.x *
                    radius;

            const ny =
                cy +
                p.y *
                    radius;

            const positiveFront =
                p.z >= 0;

            if (svg) {
                const line =
                    document.createElementNS(
                        'http://www.w3.org/2000/svg',
                        'line'
                    );

                line.setAttribute(
                    'x1',
                    nx
                );

                line.setAttribute(
                    'y1',
                    ny
                );

                line.setAttribute(
                    'x2',
                    px
                );

                line.setAttribute(
                    'y2',
                    py
                );

                line.setAttribute(
                    'stroke',
                    axis.color
                );

                line.setAttribute(
                    'stroke-width',
                    '1.25'
                );

                line.setAttribute(
                    'opacity',
                    '0.68'
                );

                svg.appendChild(
                    line
                );
            }

            const pos =
                document.getElementById(
                    axis.id
                );

            const neg =
                document.getElementById(
                    axis.neg
                );

            if (pos) {
                pos.dataset.viewAxis =
                    axis.view;

                pos.style.opacity =
                    positiveFront
                        ? '1'
                        : '0.38';

                place(
                    pos,
                    px,
                    py,
                    p.z,
                    snappedAxis ===
                        axis.view
                );
            }

            if (neg) {
                neg.dataset.viewAxis =
                    `-${axis.view}`;

                neg.style.background =
                    axis.color;

                neg.style.opacity =
                    positiveFront
                        ? '0.30'
                        : '0.78';

                place(
                    neg,
                    nx,
                    ny,
                    -p.z,
                    snappedAxis ===
                        `-${axis.view}`
                );
            }
        }

        // ----------------------------------------------------
        // Center perspective button
        // ----------------------------------------------------

        const centerPivot =
            root.querySelector(
                '.center-pivot'
            );

        if (centerPivot) {
            centerPivot.dataset.viewAxis =
                'perspective';

            centerPivot.classList.toggle(
                'active',
                camera.isPerspectiveCamera
            );

            centerPivot.setAttribute(
                'aria-pressed',
                camera.isPerspectiveCamera
                    ? 'true'
                    : 'false'
            );
        }

        // ----------------------------------------------------
        // Axis button listeners
        // ----------------------------------------------------

        root
            .querySelectorAll(
                '.axis-button, ' +
                '.axis-button-neg, ' +
                '.center-pivot'
            )
            .forEach(button => {
                if (
                    button.__smAxisClickBound
                ) {
                    return;
                }

                button.__smAxisClickBound =
                    true;

                const activate =
                    event => {
                        event.preventDefault();
                        event.stopPropagation();

                        const axis =
                            button.dataset
                                .viewAxis;

                        if (
                            axis ===
                            'perspective'
                        ) {
                            window.exitAxisView();
                        } else if (
                            axis
                        ) {
                            window.setCameraView(
                                axis
                            );
                        }
                    };

                button.addEventListener(
                    'click',
                    activate
                );

                button.addEventListener(
                    'keydown',
                    event => {
                        if (
                            event.key ===
                                'Enter' ||
                            event.key ===
                                ' '
                        ) {
                            activate(
                                event
                            );
                        }
                    }
                );
            });
    };


// ============================================================
// Transform shortcuts
// ============================================================

if (
    !window.__smTransformShortcutsBound
) {
    document.addEventListener(
        'keydown',
        event => {
            const tag =
                event.target
                    ?.tagName
                    ?.toLowerCase();

            if (
                tag === 'input' ||
                tag === 'textarea' ||
                event.target
                    ?.isContentEditable
            ) {
                return;
            }

            if (
                event.ctrlKey ||
                event.altKey ||
                event.metaKey
            ) {
                return;
            }

            const key =
                event.key.toLowerCase();

            if (
                key === 'w'
            ) {
                window.setTransformMode(
                    'translate'
                );
            }

            if (
                key === 'e'
            ) {
                window.setTransformMode(
                    'rotate'
                );
            }

            if (
                key === 'r'
            ) {
                window.setTransformMode(
                    'scale'
                );
            }
        }
    );

    window.__smTransformShortcutsBound =
        true;
}


// ============================================================
// Blender-style hand-pan button
// ============================================================

function setupBlenderHandPanButton() {
    let container =
        document.getElementById(
            'viewport-nav-gizmo-bar'
        );

    if (!container) {
        const root =
            document.getElementById(
                'renderer-container'
            ) ||
            document.body;

        container =
            document.createElement(
                'div'
            );

        container.id =
            'viewport-nav-gizmo-bar';

        container.style.cssText =
            [
                'position:absolute',
                'bottom:24px',
                'right:16px',
                'display:flex',
                'flex-direction:column',
                'gap:6px',
                'z-index:150',
                'user-select:none'
            ].join(';');

        root.appendChild(
            container
        );
    }

    let panBtn =
        document.getElementById(
            'nav-btn-hand'
        );

    if (!panBtn) {
        panBtn =
            document.createElement(
                'button'
            );

        panBtn.id =
            'nav-btn-hand';

        panBtn.type =
            'button';

        panBtn.title =
            'Move View (Click and drag to pan camera)';

        panBtn.setAttribute(
            'aria-label',
            'Move View'
        );

        panBtn.style.cssText =
            [
                'width:36px',
                'height:32px',
                'border-radius:50%',
                'background:rgba(30,32,38,0.85)',
                'border:1px solid rgba(255,255,255,0.18)',
                'color:#d1d5db',
                'display:flex',
                'align-items:center',
                'justify-content:center',
                'cursor:grab',
                'backdrop-filter:blur(4px)',
                'box-shadow:0 2px 6px rgba(0,0,0,0.3)',
                'transition:background 0.15s,border-color 0.15s,color 0.15s'
            ].join(';');

        panBtn.innerHTML =
            `
            <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
            >
                <path d="M18 11V6a2 2 0 0 0-4 0v5"/>
                <path d="M14 10V4a2 2 0 0 0-4 0v6"/>
                <path d="M10 10.5V2a2 2 0 0 0-4 0v9"/>
                <path d="M18 11a2 2 0 0 1 4 0v5a7 7 0 0 1-7 7h-2a7 7 0 0 1-7-7v-3.5a2 2 0 0 1 4 0"/>
            </svg>
            `;

        container.appendChild(
            panBtn
        );
    }

    if (
        panBtn.__smHandPanBound
    ) {
        return;
    }

    panBtn.__smHandPanBound =
        true;

    let isPanning =
        false;

    let startX =
        0;

    let startY =
        0;


    // --------------------------------------------------------
    // Pointer down
    // --------------------------------------------------------

    panBtn.addEventListener(
        'pointerdown',
        event => {
            event.preventDefault();
            event.stopPropagation();

            const camera =
                getActiveViewportCamera();

            const controls =
                getActiveViewportControls();

            if (
                !camera ||
                !controls
            ) {
                return;
            }

            isPanning =
                true;

            startX =
                event.clientX;

            startY =
                event.clientY;

            panBtn.style.cursor =
                'grabbing';

            panBtn.style.background =
                'rgba(0,122,204,0.95)';

            panBtn.style.color =
                '#ffffff';

            try {
                panBtn.setPointerCapture?.(
                    event.pointerId
                );
            } catch (_) {}
        }
    );


    // --------------------------------------------------------
    // Pointer move
    // --------------------------------------------------------

    panBtn.addEventListener(
        'pointermove',
        event => {
            if (!isPanning) {
                return;
            }

            const activeCam =
                getActiveViewportCamera();

            const activeControls =
                getActiveViewportControls();

            const renderer =
                getSMRenderer();

            if (
                !activeCam ||
                !activeControls ||
                !renderer
            ) {
                return;
            }

            const deltaX =
                event.clientX -
                startX;

            const deltaY =
                event.clientY -
                startY;

            startX =
                event.clientX;

            startY =
                event.clientY;

            const target =
                activeControls.target ||
                new THREE.Vector3();

            const dist =
                activeCam.position
                    .distanceTo(
                        target
                    ) || 12;

            const clientHeight =
                renderer.domElement
                    ?.clientHeight ||
                1;

            let factor;

            if (
                activeCam.isOrthographicCamera
            ) {
                factor =
                    Math.max(
                        0.001,
                        (
                            activeCam.top -
                            activeCam.bottom
                        ) /
                        clientHeight
                    );
            } else {
                factor =
                    dist *
                    0.0016;
            }

            const vRight =
                new THREE.Vector3();

            const vUp =
                new THREE.Vector3();

            activeCam.matrixWorld
                .extractBasis(
                    vRight,
                    vUp,
                    new THREE.Vector3()
                );

            const offset =
                new THREE.Vector3()
                    .addScaledVector(
                        vRight,
                        -deltaX *
                            factor
                    )
                    .addScaledVector(
                        vUp,
                        deltaY *
                            factor
                    );

            // Camera movement is intentionally done through
            // the active camera/controls because this is a
            // direct user viewport interaction.
            activeCam.position.add(
                offset
            );

            target.add(
                offset
            );

            activeControls.target
                ?.copy?.(
                    target
                );

            activeControls.update?.();

            activeCam.updateMatrixWorld?.(
                true
            );

            window.updateAxisGizmo?.();
        }
    );


    // --------------------------------------------------------
    // Stop
    // --------------------------------------------------------

    const stopPan =
        event => {
            if (!isPanning) {
                return;
            }

            isPanning =
                false;

            panBtn.style.cursor =
                'grab';

            panBtn.style.background =
                'rgba(30, 32, 38, 0.85)';

            panBtn.style.color =
                '#d1d5db';

            try {
                panBtn.releasePointerCapture?.(
                    event.pointerId
                );
            } catch (_) {}
        };

    panBtn.addEventListener(
        'pointerup',
        stopPan
    );

    panBtn.addEventListener(
        'pointercancel',
        stopPan
    );

    panBtn.addEventListener(
        'lostpointercapture',
        () => {
            if (!isPanning) {
                return;
            }

            isPanning =
                false;

            panBtn.style.cursor =
                'grab';

            panBtn.style.background =
                'rgba(30, 32, 38, 0.85)';

            panBtn.style.color =
                '#d1d5db';
        }
    );
}


// ============================================================
// Public compatibility aliases
// ============================================================

window.SMSelectionViewportUtils = {
    getActiveViewportCamera,
    getActiveViewportControls,
    getRendererViewportSize,
    syncPostProcessingViewport,
    syncActiveViewportCameraBindings,
    updateViewportGridForAxis,
    toggleBoneVisibility,
    updateEditorStatusCounters,
    onWindowResize,
    installRendererContainerResizeObserver,
    bindCoreUiOnce,
    initAssetsPanelWhenReady,
    updateHierarchy,
    initSelectionSystem,
    sanitizeOutlineSelection,
    initSelectionComposer,
    bindMainRendererContextRecoveryHandlers,
    markTransformControlsChildren,
    fixTransformControlsGizmoRendering,
    restoreTransformControlsGizmoRendering,
    updateTransformControlsForActiveView,
    primeTransformControlsInteraction,
    setupSceneElements,
    initModeling,
    initPhysicsBrushCursor,
    syncDynamicLayoutVars,
    initViewportResizeObserver,
    setupBlenderHandPanButton
};


// ============================================================
// Optional late initialization hooks
// ============================================================

if (
    !window.__smViewportUtilsLateInitBound
) {
    window.__smViewportUtilsLateInitBound =
        true;

    window.addEventListener(
        'sm:renderer-ready',
        () => {
            installRendererContainerResizeObserver();

            syncActiveViewportCameraBindings();

            const size =
                getRendererViewportSize();

            syncPostProcessingViewport(
                size.width,
                size.height
            );

            window.updateAxisGizmo?.();
        }
    );

    window.addEventListener(
        'sm:camera-ready',
        () => {
            syncActiveViewportCameraBindings();

            window.updateAxisGizmo?.();
        }
    );

    window.addEventListener(
        'sm:camera-view-changed',
        () => {
            syncActiveViewportCameraBindings();

            window.updateAxisGizmo?.();
        }
    );
}


// ============================================================
// End of engine/selection-viewport-utils.js
// ============================================================