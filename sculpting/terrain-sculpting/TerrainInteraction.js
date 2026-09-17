// ============================================================================
// TerrainInteraction.js
// Terrain sculpt input + guaranteed brush preview
// ============================================================================

(() => {
    'use strict';

    const NS = window.TerrainSculpting = window.TerrainSculpting || {};
    const state = NS.state = NS.state || {};

    const THREE = window.THREE;
    if (!THREE) {
        console.error('[TerrainInteraction] THREE is not available.');
        return;
    }

    const TOOLS = NS.TOOLS = NS.TOOLS || {
        RAISE_LOWER: 'raise',
        SMOOTH: 'smooth',
        FLATTEN: 'flatten',
        TERRACE: 'terrace',
        PINCH: 'pinch',
        CLAY: 'clay',
        SCRAPE: 'scrape',
        NOISE: 'noise',
        PERLIN: 'perlin',
        EROSION: 'erosion',
        THERMAL_EROSION: 'thermal',
        MATERIAL_PAINT: 'material',
        GRAB: 'grab',
        INFLATE: 'inflate',
        DEFLATE: 'deflate',
        RIDGE: 'ridge',
        VALLEY: 'valley',
        CLIFF: 'cliff',
        PLATEAU: 'plateau',
        CRATER: 'crater',
        CANYON: 'canyon',
        DUNE: 'dune',
        FILL: 'fill',
        RELAX: 'relax',
        SHARPEN: 'sharpen',
        BLUR: 'blur',
        HYDRAULIC: 'hydraulic',
        DEPOSITION: 'deposition'
    };

    const MODES = NS.MODES = NS.MODES || {
        SCULPT: 'SCULPT'
    };

    state.mode ??= MODES.SCULPT;
    state.brushSize ??= 10;
    state.brushStrength ??= 0.5;
    state.brushFalloff ??= 0.5;
    state.brushSpacing ??= 0.12;
    state.isBrushActive ??= false;
    state.isPointerDown ??= false;
    state.isShiftPressed ??= false;
    state.selectedTool ??= TOOLS.RAISE_LOWER;
    state.lastSculptTool ??= TOOLS.RAISE_LOWER;

    const TOOL_ALIASES = Object.freeze({
        raise: TOOLS.RAISE_LOWER,
        raise_lower: TOOLS.RAISE_LOWER,
        lower: TOOLS.RAISE_LOWER,
        smooth: TOOLS.SMOOTH,
        flatten: TOOLS.FLATTEN,
        level: TOOLS.FLATTEN,
        terrace: TOOLS.TERRACE,
        pinch: TOOLS.PINCH,
        clay: TOOLS.CLAY,
        scrape: TOOLS.SCRAPE,
        noise: TOOLS.NOISE,
        perlin: TOOLS.PERLIN,
        erosion: TOOLS.EROSION,
        hydraulic: TOOLS.HYDRAULIC,
        thermal: TOOLS.THERMAL_EROSION,
        thermal_erosion: TOOLS.THERMAL_EROSION,
        material: TOOLS.MATERIAL_PAINT,
        material_paint: TOOLS.MATERIAL_PAINT,

        grab: TOOLS.GRAB,
        inflate: TOOLS.INFLATE,
        deflate: TOOLS.DEFLATE,
        ridge: TOOLS.RIDGE,
        valley: TOOLS.VALLEY,
        cliff: TOOLS.CLIFF,
        plateau: TOOLS.PLATEAU,
        crater: TOOLS.CRATER,
        canyon: TOOLS.CANYON,
        dune: TOOLS.DUNE,
        fill: TOOLS.FILL,
        relax: TOOLS.RELAX,
        sharpen: TOOLS.SHARPEN,
        blur: TOOLS.BLUR,
        deposition: TOOLS.DEPOSITION
    });

    function canonicalTool(id) {
        return TOOL_ALIASES[id] || id;
    }

    // ------------------------------------------------------------------------
    // Landscape access
    // ------------------------------------------------------------------------

    function getLandscape() {
        return NS.getLandscape?.()
            || NS.landscape
            || state.landscape
            || null;
    }

    function getRenderer() {
        return NS.getRenderer?.() || window.renderer || null;
    }

    function getCamera() {
        return NS.getCamera?.() || window.camera || null;
    }

    function getScene() {
        return NS.getScene?.() || window.scene || null;
    }

    // ------------------------------------------------------------------------
    // Terrain raycast
    // ------------------------------------------------------------------------

    function collectTerrainMeshes(root, output = []) {
        if (!root) return output;

        if (root.isMesh || root.isInstancedMesh) {
            output.push(root);
            return output;
        }

        root.traverse?.(child => {
            if (child.isMesh || child.isInstancedMesh) output.push(child);
        });

        return output;
    }

    function raycastLandscape(event) {
        const renderer = getRenderer();
        const camera = getCamera();
        const landscape = getLandscape();

        if (!renderer?.domElement || !camera || !landscape) return null;

        const rect = renderer.domElement.getBoundingClientRect();

        const x = ((event.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
        const y = -((event.clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1;

        const raycaster = NS._terrainInteractionRaycaster ||
            (NS._terrainInteractionRaycaster = new THREE.Raycaster());

        raycaster.setFromCamera(new THREE.Vector2(x, y), camera);

        const meshes = collectTerrainMeshes(landscape, []);

        if (!meshes.length) return null;

        const hits = raycaster.intersectObjects(meshes, true);

        if (!hits.length) return null;

        // Prefer actual terrain geometry if other nested meshes exist.
        const terrainHit = hits.find(hit =>
            hit.object?.userData?.isTerrain ||
            hit.object?.userData?.terrainComponent ||
            hit.object?.parent?.userData?.isTerrain ||
            hit.object?.parent?.userData?.terrainComponent
        );

        return terrainHit || hits[0];
    }

    function getTerrainHitPoint(event) {
        const hit = raycastLandscape(event);
        if (!hit) return null;

        const normal = hit.face?.normal
            ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize()
            : new THREE.Vector3(0, 1, 0);

        let component = hit.object?.userData?.terrainComponent || null;

        if (!component && hit.object?.parent?.userData?.terrainComponent) {
            component = hit.object.parent.userData.terrainComponent;
        }

        return {
            point: hit.point.clone(),
            normal,
            faceIndex: hit.faceIndex,
            distance: hit.distance,
            object: hit.object,
            component
        };
    }

    // ------------------------------------------------------------------------
    // Brush preview
    //
    // This implementation is intentionally self-contained. If another preview
    // system already exists, its public API is preserved and reused.
    // ------------------------------------------------------------------------

    function createBrushPreviewSystem() {
        const existing = NS.preview || {};

        // If the dedicated TerrainBrushPreview.js already initialized its
        // unified preview API, reuse it instead of creating a second preview.
        // This makes script load order safe and prevents NS.preview conflicts.
        if (
            existing.__terrainBrushPreviewUnified &&
            typeof existing.updateBrushPreview === 'function' &&
            typeof existing.ensure === 'function'
        ) {
            return existing;
        }

        let previewRoot = null;
        let outerRing = null;
        let innerRing = null;
        let centerMarker = null;
        let lastPoint = null;
        let initializedScene = null;

        const raycaster = new THREE.Raycaster();

        function ensurePreviewRoot() {
            const scene = getScene();
            if (!scene) return false;

            if (initializedScene !== scene || !previewRoot) {
                if (previewRoot && previewRoot.parent) {
                    previewRoot.parent.remove(previewRoot);
                }

                previewRoot = new THREE.Group();
                previewRoot.name = 'TerrainBrushPreview';
                previewRoot.renderOrder = 999999;

                scene.add(previewRoot);
                initializedScene = scene;

                state.brushPreview = previewRoot;
            }

            return true;
        }

        function makeRing(radius, segments = 96) {
            const points = [];

            for (let i = 0; i <= segments; i++) {
                const a = (i / segments) * Math.PI * 2;
                points.push(new THREE.Vector3(
                    Math.cos(a) * radius,
                    0,
                    Math.sin(a) * radius
                ));
            }

            const geometry = new THREE.BufferGeometry().setFromPoints(points);

            const material = new THREE.LineBasicMaterial({
                transparent: true,
                opacity: 0.95,
                depthTest: false,
                depthWrite: false,
                toneMapped: false
            });

            const line = new THREE.Line(geometry, material);
            line.frustumCulled = false;
            line.renderOrder = 1000000;

            return line;
        }

        function makeCenterMarker() {
            const geometry = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(-0.35, 0, 0),
                new THREE.Vector3(0.35, 0, 0),
                new THREE.Vector3(0, 0, -0.35),
                new THREE.Vector3(0, 0, 0.35)
            ]);

            const material = new THREE.LineBasicMaterial({
                transparent: true,
                opacity: 0.75,
                depthTest: false,
                depthWrite: false,
                toneMapped: false
            });

            const marker = new THREE.LineSegments(geometry, material);
            marker.frustumCulled = false;
            marker.renderOrder = 1000001;
            return marker;
        }

        function ensureGeometry() {
            if (!ensurePreviewRoot()) return false;

            if (!outerRing) {
                outerRing = makeRing(1);
                outerRing.name = 'BrushOuterRing';
                previewRoot.add(outerRing);
            }

            if (!innerRing) {
                innerRing = makeRing(0.72);
                innerRing.name = 'BrushFalloffRing';
                previewRoot.add(innerRing);
            }

            if (!centerMarker) {
                centerMarker = makeCenterMarker();
                centerMarker.name = 'BrushCenter';
                previewRoot.add(centerMarker);
            }

            state.brushPreviewMesh = outerRing;
            return true;
        }

        function setMaterialAppearance() {
            if (!outerRing || !innerRing || !centerMarker) return;

            const strength = THREE.MathUtils.clamp(
                Number(state.brushStrength) || 0.5,
                0,
                2
            );

            const falloff = THREE.MathUtils.clamp(
                Number(state.brushFalloff) || 0.5,
                0.01,
                1
            );

            const tool = canonicalTool(state.selectedTool);

            // Use tool-independent colors so preview remains readable.
            // Raise = warm, lower = cool, neutral tools = light.
            let outerColor = 0x66ccff;

            if (state.isShiftPressed || tool === TOOLS.DEFLATE || tool === TOOLS.VALLEY) {
                outerColor = 0xff6677;
            } else if (
                tool === TOOLS.EROSION ||
                tool === TOOLS.HYDRAULIC ||
                tool === TOOLS.THERMAL_EROSION
            ) {
                outerColor = 0xffc857;
            }

            outerRing.material.color.setHex(outerColor);
            innerRing.material.color.setHex(outerColor);
            centerMarker.material.color.setHex(outerColor);

            outerRing.material.opacity = 0.95;
            innerRing.material.opacity = 0.20 + falloff * 0.35;
            centerMarker.material.opacity = 0.45 + Math.min(0.45, strength * 0.25);
        }

        function setVisible(visible) {
            if (!previewRoot) return;
            previewRoot.visible = !!visible;
        }

        function hideBrushPreviews() {
            if (previewRoot) previewRoot.visible = false;
            lastPoint = null;
            state.lastBrushPreviewPoint = null;
        }

        function showAt(point, normal) {
            if (!point || !ensureGeometry()) return;

            const radius = Math.max(
                0.05,
                Number(state.brushSize) || 10
            );

            previewRoot.position.copy(point);

            // Lift the preview enough to prevent z-fighting.
            previewRoot.position.addScaledVector(
                normal || new THREE.Vector3(0, 1, 0),
                0.035
            );

            // Brush is drawn in world units. Do not use brushSize as scale on
            // the root because that would double the radius.
            outerRing.scale.setScalar(radius);
            innerRing.scale.setScalar(radius);
            centerMarker.scale.setScalar(Math.max(0.25, radius * 0.10));

            // Keep the circle horizontal. This is stable on steep terrain and
            // avoids sudden roll changes while moving across components.
            previewRoot.quaternion.identity();

            setMaterialAppearance();
            setVisible(true);

            lastPoint = point.clone();
            state.lastBrushPreviewPoint = point.clone();
        }

        function updateBrushPreview(event) {
            if (state.mode !== MODES.SCULPT) {
                hideBrushPreviews();
                return null;
            }

            if (!state.isBrushActive || !getLandscape()) {
                hideBrushPreviews();
                return null;
            }

            const hit = getTerrainHitPoint(event);

            if (!hit) {
                hideBrushPreviews();
                return null;
            }

            showAt(hit.point, hit.normal);
            return hit;
        }

        function updateSize() {
            if (!previewRoot) return;

            const radius = Math.max(
                0.05,
                Number(state.brushSize) || 10
            );

            outerRing?.scale.setScalar(radius);
            innerRing?.scale.setScalar(radius);
            centerMarker?.scale.setScalar(Math.max(0.25, radius * 0.10));

            setMaterialAppearance();
        }

        function updateAppearance() {
            setMaterialAppearance();
        }

        return Object.assign(existing, {
            raycastLandscape: existing.raycastLandscape || raycastLandscape,
            updateBrushPreview,
            hideBrushPreviews,
            showAt,
            updateSize,
            updateAppearance,
            ensure: ensureGeometry,
            getLastPoint: () => lastPoint
        });
    }

    NS.preview = createBrushPreviewSystem();

    // ------------------------------------------------------------------------
    // Sculpt operation
    // ------------------------------------------------------------------------

    function performSculptingOperation(event) {
        if (
            state.mode !== MODES.SCULPT ||
            !getLandscape() ||
            !state.selectedTool ||
            !NS.brushes
        ) {
            return null;
        }

        const hit = getTerrainHitPoint(event);
        if (!hit) return null;

        const oldSubtract = !!state.isShiftPressed;

        state.isShiftPressed =
            oldSubtract ||
            !!event.shiftKey ||
            !!event.ctrlKey ||
            !!event.metaKey;

        const B = NS.brushes;
        const tool = canonicalTool(state.selectedTool);

        // TerrainBrushes exposes a central applyTool API. Prefer it so the exact
        // landscape hit by the raycast is the one whose heightfield is edited.
        // The legacy switch below remains as a compatibility fallback.
        if (typeof B.applyTool === 'function') {
            const applied = B.applyTool({
                terrain: getLandscape(),
                point: hit.point,
                normal: hit.normal,
                tool,
                pressure: event.pointerType === 'pen' && event.pressure > 0
                    ? event.pressure
                    : 1
            });

            if (!applied) {
                console.warn('[TerrainInteraction] Brush did not apply:', {
                    tool,
                    hasTerrainData: !!getLandscape()?.userData?.terrainData,
                    hasHeights: !!getLandscape()?.userData?.terrainData?.heights?.length
                });
            }

            state.lastHitPoint = hit.point.clone();
            state.strokeLastPoint = hit.point.clone();
            state.isShiftPressed = oldSubtract;
            return hit;
        }

        try {
            switch (tool) {
                case TOOLS.RAISE_LOWER:
                    B.applyRaiseLowerBrush?.(hit.point, hit.normal);
                    break;

                case TOOLS.SMOOTH:
                    B.applySmoothBrush?.(hit.point, hit.normal);
                    break;

                case TOOLS.FLATTEN:
                    B.applyFlattenBrush?.(hit.point, hit.normal);
                    break;

                case TOOLS.TERRACE:
                    B.applyTerraceBrush?.(hit.point, hit.normal);
                    break;

                case TOOLS.PINCH:
                    B.applyPinchBrush?.(hit.point, hit.normal);
                    break;

                case TOOLS.CLAY:
                    B.applyClayBrush?.(hit.point, hit.normal);
                    break;

                case TOOLS.SCRAPE:
                    B.applyScrapeBrush?.(hit.point, hit.normal);
                    break;

                case TOOLS.NOISE:
                    B.applyNoiseBrush?.(hit.point, hit.normal);
                    break;

                case TOOLS.PERLIN:
                    B.applyPerlinBrush?.(hit.point, hit.normal);
                    break;

                case TOOLS.EROSION:
                case TOOLS.HYDRAULIC:
                    (
                        B.applyHydraulicErosionBrush ||
                        B.applyErosionBrush
                    )?.(hit.point, hit.normal);
                    break;

                case TOOLS.THERMAL_EROSION:
                    B.applyThermalErosionBrush?.(hit.point, hit.normal);
                    break;

                case TOOLS.MATERIAL_PAINT:
                    B.applyMaterialPaintBrush?.(hit.point, hit.normal);
                    break;

                case TOOLS.GRAB:
                    B.applyGrabBrush?.(hit.point, hit.normal);
                    break;

                case TOOLS.INFLATE:
                    B.applyInflateBrush?.(hit.point, hit.normal);
                    break;

                case TOOLS.DEFLATE:
                    B.applyDeflateBrush?.(hit.point, hit.normal);
                    break;

                case TOOLS.RIDGE:
                    B.applyRidgeBrush?.(hit.point, hit.normal);
                    break;

                case TOOLS.VALLEY:
                    B.applyValleyBrush?.(hit.point, hit.normal);
                    break;

                case TOOLS.CLIFF:
                    B.applyCliffBrush?.(hit.point, hit.normal);
                    break;

                case TOOLS.PLATEAU:
                    B.applyPlateauBrush?.(hit.point, hit.normal);
                    break;

                case TOOLS.CRATER:
                    B.applyCraterBrush?.(hit.point, hit.normal);
                    break;

                case TOOLS.CANYON:
                    B.applyCanyonBrush?.(hit.point, hit.normal);
                    break;

                case TOOLS.DUNE:
                    B.applyDuneBrush?.(hit.point, hit.normal);
                    break;

                case TOOLS.FILL:
                    B.applyFillBrush?.(hit.point, hit.normal);
                    break;

                case TOOLS.RELAX:
                    B.applyRelaxBrush?.(hit.point, hit.normal);
                    break;

                case TOOLS.SHARPEN:
                    B.applySharpenBrush?.(hit.point, hit.normal);
                    break;

                case TOOLS.BLUR:
                    B.applyBlurBrush?.(hit.point, hit.normal);
                    break;

                case TOOLS.DEPOSITION:
                    B.applyDepositionBrush?.(hit.point, hit.normal);
                    break;

                default:
                    console.warn('[TerrainInteraction] Unknown brush:', tool);
                    break;
            }
        } finally {
            state.isShiftPressed = oldSubtract;
        }

        state.lastHitPoint = hit.point.clone();
        state.strokeLastPoint = hit.point.clone();

        return hit;
    }

    // ------------------------------------------------------------------------
    // Tool state
    // ------------------------------------------------------------------------

    function setActiveTool(toolId) {
        const canonical = canonicalTool(toolId || null);

        if (canonical) {
            state.lastSculptTool = canonical;
        }

        state.selectedTool = canonical;

        state.isBrushActive =
            !!canonical &&
            state.mode === MODES.SCULPT &&
            !!getLandscape();

        document
            .querySelectorAll(
                '.sw-tool, [data-terrain-tool], .panel-button-tool'
            )
            .forEach(button => {
                const buttonTool = canonicalTool(
                    button.dataset.terrainTool || button.id
                );

                button.classList.toggle(
                    'active',
                    buttonTool === canonical
                );
            });

        if (state.isBrushActive) {
            NS.preview?.ensure?.();
        } else {
            NS.preview?.hideBrushPreviews?.();
        }

        return state.selectedTool;
    }

    function toggleBrush(forceEnabled = null) {
        const shouldEnable =
            forceEnabled === null
                ? !state.isBrushActive
                : !!forceEnabled;

        if (!shouldEnable) {
            setActiveTool(null);
            return false;
        }

        setActiveTool(
            state.lastSculptTool || TOOLS.RAISE_LOWER
        );

        return !!state.isBrushActive;
    }

    function captureFlattenReference(event) {
        if (
            canonicalTool(state.selectedTool) !== TOOLS.FLATTEN
        ) {
            return;
        }

        const hit = getTerrainHitPoint(event);
        const landscape = getLandscape();
        const data = landscape?.userData?.terrainData;

        if (!hit || !landscape || !data) return;

        const local = landscape.worldToLocal(hit.point.clone());

        state.flattenTargetHeight =
            local.y /
            Math.max(
                0.0001,
                data.heightScale || 1
            );
    }

    function stopSculpt() {
        state.isPointerDown = false;
        state.lastHitPoint = null;
        state.strokeLastPoint = null;
        state.flattenTargetHeight = null;

        if (window.controls) {
            window.controls.enabled = true;
        }
    }

    // ------------------------------------------------------------------------
    // Input
    // ------------------------------------------------------------------------

    function initializeTerrainSculptingEventListeners() {
        const renderer = getRenderer();

        if (!renderer?.domElement) {
            console.warn(
                '[TerrainInteraction] Renderer DOM element is not ready.'
            );
            return false;
        }

        const canvas = renderer.domElement;

        if (
            state.eventsBound &&
            state.eventCanvas === canvas
        ) {
            NS.preview?.ensure?.();
            return true;
        }

        // Avoid browser gestures interfering with sculpting.
        canvas.style.touchAction = 'none';

        canvas.addEventListener(
            'pointermove',
            event => {
                if (
                    state.mode !== MODES.SCULPT ||
                    !getLandscape()
                ) {
                    NS.preview?.hideBrushPreviews?.();
                    return;
                }

                // Preview must update even when the mouse button is NOT down.
                NS.preview?.updateBrushPreview?.(event);

                if (
                    !state.isPointerDown ||
                    !state.isBrushActive
                ) {
                    return;
                }

                const hit = getTerrainHitPoint(event);

                const spacing =
                    Math.max(
                        0.025,
                        Number(state.brushSize || 1) *
                        Math.max(
                            0.01,
                            Number(state.brushSpacing || 0.12)
                        )
                    );

                if (
                    hit &&
                    state.strokeLastPoint &&
                    hit.point.distanceTo(
                        state.strokeLastPoint
                    ) < spacing
                ) {
                    return;
                }

                performSculptingOperation(event);
            },
            { passive: true }
        );

        canvas.addEventListener(
            'pointerdown',
            event => {
                if (
                    event.button !== 0 ||
                    state.mode !== MODES.SCULPT ||
                    !state.isBrushActive ||
                    !getLandscape()
                ) {
                    return;
                }

                const hit = getTerrainHitPoint(event);
                if (!hit) return;

                event.preventDefault();
                event.stopPropagation();

                state.isPointerDown = true;
                state.strokeLastPoint = null;

                // Keep pointer events coming even if the cursor leaves the
                // renderer during a stroke.
                try {
                    canvas.setPointerCapture?.(event.pointerId);
                } catch (_) {}

                NS.history?.capture?.('Sculpt Stroke');

                captureFlattenReference(event);

                if (window.controls) {
                    window.controls.enabled = false;
                }

                performSculptingOperation(event);
            },
            { passive: false }
        );

        window.addEventListener(
            'pointerup',
            event => {
                try {
                    canvas.releasePointerCapture?.(event.pointerId);
                } catch (_) {}

                stopSculpt();
            }
        );

        window.addEventListener(
            'pointercancel',
            stopSculpt
        );

        canvas.addEventListener(
            'pointerleave',
            () => {
                // Do NOT stop the stroke here if pointer capture is active.
                if (!state.isPointerDown) {
                    NS.preview?.hideBrushPreviews?.();
                }
            }
        );

        document.addEventListener(
            'keydown',
            event => {
                if (event.key === 'Shift') {
                    state.isShiftPressed = true;
                    NS.preview?.updateAppearance?.();
                }
            }
        );

        document.addEventListener(
            'keyup',
            event => {
                if (event.key === 'Shift') {
                    state.isShiftPressed = false;
                    NS.preview?.updateAppearance?.();
                }
            }
        );

        state.eventsBound = true;
        state.eventCanvas = canvas;

        NS.preview?.ensure?.();

        return true;
    }

    // ------------------------------------------------------------------------
    // Public API
    // ------------------------------------------------------------------------

    NS.interaction = {
        getTerrainHitPoint,
        raycastLandscape,
        performSculptingOperation,
        setActiveTool,
        toggleBrush,
        stopSculpt,
        initializeTerrainSculptingEventListeners
    };

    // Keep compatibility with the existing SculptingPanel.
    window.setActiveTerrainTool = setActiveTool;
    window.setTerrainSculptTool = setActiveTool;
    window.toggleTerrainBrush = toggleBrush;

    // Keep preview radius synchronized when the panel changes brushSize.
    state._terrainPreviewUpdateSize = () => {
        NS.preview?.updateSize?.();
    };

    // If the renderer/scene already exists, initialize immediately.
    if (getRenderer()?.domElement && getScene()) {
        initializeTerrainSculptingEventListeners();
    }

    console.log('[TerrainInteraction] Terrain sculpt interaction + brush preview ready.');
})();