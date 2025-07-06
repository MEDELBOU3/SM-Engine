// =================================================================
// === GLOBAL VARIABLES & APPLICATION STATE
// =================================================================

let activeObject = null; // The mesh currently being edited in modeling mode

// --- Multi-Selection & Transformation ---
let selectionGroupProxy = new THREE.Object3D(); // A single, shared proxy for the transform gizmo
selectionGroupProxy.name = "SelectionGroupProxy";
let isTransforming = false;
let dragStartState = {
    vertices: new Map(), // Map<vertexIndex, initialWorldPosition>
    center: null // The initial world position of the selectionGroupProxy
};

// --- Visual Helpers & Performance ---
let vertexHelpers, edgeHelpers, faceHelpers; // Helper groups
let helperUpdateTimeout = null;
let lastHelperUpdateTime = 0;
const MIN_UPDATE_INTERVAL = 50; // ms between helper updates
const MAX_HELPERS = 3000; // Max helpers to show in performance mode
let isPerformanceMode = true;

// --- Snapping ---
let isSnappingEnabled = false;
let snapTargetType = 'grid'; // 'grid', 'vertex', 'edge', 'face'
let snapHighlightMesh = null; // Visual aid for the snap point

// --- Architectural Elements & Tools ---
let architecturalElements = []; // Stores all created walls, doors, windows, etc.
let selectedArchElements = []; // Stores currently selected architectural elements
const ARCH_ELEMENT_TAG = 'ArchitecturalElement';
let activeArchTool = null; // 'wall', 'door', 'window', 'roof', etc.

// Wall Tool
let wallPoints = [];
let wallPreviewLine = null;
let fullWallPath = null;
let isWallToolActive = false;
let wallHeight = 2.5;
let wallThickness = 0.2;

// Placement Tool (Doors/Windows)
let placementHelper = null;
let placementObjectDimensions = { width: 1, height: 1, depth: 1 };
let currentPlacementType = null;
let placementTargetObject = null;
let currentPlacementPosition = null;
let currentPlacementNormal = null;
let currentWindowPreset = null; // To hold data from a selected preset

// Boolean Tool
let booleanTargetMesh = null;
let booleanToolMesh = null;

// Roof Tool
let roofPoints = [];
let roofPreviewMesh = null;

// Room Tool
let roomStartPoint = null;
let roomEndPoint = null;
let roomPreviewMesh = null;

// Curved Wall Tool
let curvedWallPoints = [];
let curvedWallPreviewLine = null;

// Terrain Tool
let terrainPreviewMesh = null;

// Measure Tool
let measurePoints = [];
let measureLine = null;
let measureDisplayElement = null;

// Stairs Tool
let stairClickCount = 0;
let stairStartPoint = null;
let stairEndPoint = null;
let stairPreviewObject = null;
let stairWidth = 1.0;
let stairTotalHeight = 2.5;
let stairStepHeight = 0.18;
let stairStepDepth = 0.25;

// --- Loop Cut Tool ---
let isLoopCutMode = false;
let loopCutPreviewLine = null;
const LOOP_CUT_PREVIEW_COLOR = 0x00FFFF;

// --- Spline & Modifier System ---
let splineCreationMode = null;
let currentSplinePoints = [];
let splinePreviewLine = null;
let editedSplines = { profile: null, path: null, list: [] };
let baseGeometries = new Map(); // Map<object.uuid, baseBufferGeometry> for modifiers
let modifierStacks = new Map(); // Map<object.uuid, modifierStackArray>


// =================================================================
// === CORE HELPER & TOPOLOGY FUNCTIONS
// =================================================================

/**
 * Creates a consistent key for an edge to avoid duplicates (e.g., 1_2 vs 2_1).
 * @param {number} v1 - Index of the first vertex.
 * @param {number} v2 - Index of the second vertex.
 * @returns {string} The edge key.
 */
function getEdgeKey(v1, v2) {
    return v1 < v2 ? `${v1}_${v2}` : `${v2}_${v1}`;
}

/**
 * Finds the intersection point on the ground plane (Y=0).
 * Assumes the global 'raycaster' is updated.
 * @returns {THREE.Vector3 | null} The intersection point or null.
 */
function getGroundPlaneIntersection() {
    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const intersection = new THREE.Vector3();
    return raycaster.ray.intersectPlane(groundPlane, intersection) ? intersection : null;
}

/**
 * Builds a map of edges to the faces they belong to. Essential for topology operations.
 * @param {THREE.BufferGeometry} geometry - The indexed buffer geometry.
 * @returns {Map<string, number[]> | null} The edge-to-faces map.
 */
function buildEdgeFaceMap(geometry) {
    if (!geometry?.index) {
        console.error("buildEdgeFaceMap requires indexed geometry.");
        return null;
    }
    const index = geometry.index.array;
    const edgeFaceMap = new Map();

    for (let i = 0; i < index.length; i += 3) {
        const faceIndex = i / 3;
        const v = [index[i], index[i + 1], index[i + 2]];
        const edges = [[v[0], v[1]], [v[1], v[2]], [v[2], v[0]]];

        for (const edge of edges) {
            if (edge[0] === edge[1]) continue;
            const edgeKey = getEdgeKey(edge[0], edge[1]);
            if (!edgeFaceMap.has(edgeKey)) {
                edgeFaceMap.set(edgeKey, []);
            }
            edgeFaceMap.get(edgeKey).push(faceIndex);
        }
    }
    return edgeFaceMap;
}

/**
 * Builds a map of vertices to the edges connected to them.
 * @param {THREE.BufferGeometry} geometry - The indexed buffer geometry.
 * @returns {Map<number, Set<string>> | null} The vertex-to-edges map.
 */
function buildVertexEdgeMap(geometry) {
    if (!geometry?.index) {
        console.error("buildVertexEdgeMap requires indexed geometry.");
        return null;
    }
    const index = geometry.index.array;
    const vertexEdgeMap = new Map();

    for (let i = 0; i < index.length; i += 3) {
        const v = [index[i], index[i + 1], index[i + 2]];
        for (let j = 0; j < 3; j++) {
            const v_current = v[j];
            const v_next = v[(j + 1) % 3];
            const v_prev = v[(j + 2) % 3];

            if (!vertexEdgeMap.has(v_current)) {
                vertexEdgeMap.set(v_current, new Set());
            }
            const edgeSet = vertexEdgeMap.get(v_current);
            if (v_current !== v_next) edgeSet.add(getEdgeKey(v_current, v_next));
            if (v_current !== v_prev) edgeSet.add(getEdgeKey(v_current, v_prev));
        }
    }
    return vertexEdgeMap;
}

/**
 * Builds a map of vertices to the faces they belong to.
 * @param {THREE.BufferGeometry} geometry - The indexed buffer geometry.
 * @returns {Map<number, number[]> | null} The vertex-to-faces map.
 */
function buildVertexFaceMap(geometry) {
    if (!geometry?.index) {
        console.error("buildVertexFaceMap requires indexed geometry.");
        return null;
    }
    const index = geometry.index.array;
    const vertexFaceMap = new Map();

    for (let i = 0; i < index.length; i += 3) {
        const faceIndex = i / 3;
        for (let j = 0; j < 3; j++) {
            const vertIndex = index[i + j];
            if (!vertexFaceMap.has(vertIndex)) {
                vertexFaceMap.set(vertIndex, []);
            }
            const faceList = vertexFaceMap.get(vertIndex);
            if (!faceList.includes(faceIndex)) {
                faceList.push(faceIndex);
            }
        }
    }
    return vertexFaceMap;
}


// =================================================================
// === MODELING MODE & MULTI-SELECTION CORE
// =================================================================

/**
 * Toggles the main modeling mode on or off.
 */
function toggleModelingMode() {
    isModelingMode = !isModelingMode;
    console.log("Modeling Mode:", isModelingMode);

    // Enable/disable UI panels and buttons
    const modelingControls = ['modeling-tools-panel', 'modifiers-panel', 'snapping-controls'];
    modelingControls.forEach(id => {
        const panel = document.getElementById(id);
        if (panel) panel.style.display = isModelingMode ? 'block' : 'none';
    });

    if (isModelingMode) {
        deselectAllArchElements(); // Clear architectural selections for clarity
        if (activeObject) {
            setSelectionMode(selectionMode); // Re-apply to show helpers
        }
        if (controls) controls.enabled = true;
    } else {
        // Cleanup when exiting modeling mode
        clearSelection();
        clearMeshStructure();
        transformControls.detach();
        deactivateCurrentArchTool();
        cancelLoopCut();
        finishSplineDrawing();
    }
    updateModifierPanelVisibility();
    updateSnappingUI();
}

/**
 * Sets the current sub-element selection mode (vertex, edge, or face).
 * @param {string} mode - The mode to set.
 */
function setSelectionMode(mode) {
    if (!isModelingMode) return;
    console.log("Selection Mode:", mode);

    if (selectionMode !== mode) {
        selectionMode = mode;
        clearSelection(); // Clear previous selection type
    }

    ['select-vertex', 'select-edge', 'select-face'].forEach(id => {
        const button = document.getElementById(id);
        if (button) button.classList.toggle('active-tool', id === `select-${mode}`);
    });

    if (activeObject) {
        showMeshStructure(activeObject); // Update helpers for the new mode
    }
}

/**
 * Handles the logic for selecting or deselecting a modeling element.
 * Manages the `selectedElements` array based on user input (e.g., Shift key).
 * @param {THREE.Intersection} intersection - The intersection object from the raycast.
 * @param {boolean} isAdditive - True if the Shift key is held down.
 */
function handleElementSelection(intersection, isAdditive) {
    const selectedHelper = intersection.object;
    let selectionIdentifier; // A unique key for the selected element
    let elementData = {}; // Object to store in selectedElements

    // Create a unique identifier and data payload for the clicked element
    if (selectedHelper.userData.type === 'vertex-instanced') {
        const instanceId = intersection.instanceId;
        const vertexIndex = selectedHelper.userData.vertexIndices[instanceId];
        selectionIdentifier = `v_${vertexIndex}`;
        elementData = {
            type: 'vertex',
            helper: selectedHelper,
            instanceId: instanceId,
            indices: [vertexIndex],
            getCenter: (matrixWorld) => new THREE.Vector3().fromBufferAttribute(activeObject.geometry.attributes.position, vertexIndex).applyMatrix4(matrixWorld)
        };
    } else { // Edge or Face
        selectionIdentifier = selectedHelper.uuid;
        elementData = {
            type: selectedHelper.userData.type,
            helper: selectedHelper,
            indices: selectedHelper.userData.indices,
            getCenter: (matrixWorld) => {
                const center = new THREE.Vector3();
                const tempPos = new THREE.Vector3();
                selectedHelper.userData.indices.forEach(index => {
                    center.add(tempPos.fromBufferAttribute(activeObject.geometry.attributes.position, index));
                });
                return center.divideScalar(selectedHelper.userData.indices.length).applyMatrix4(matrixWorld);
            }
        };
    }

    // Manage the selection array
    const existingIndex = selectedElements.findIndex(el => el.identifier === selectionIdentifier);

    if (isAdditive) {
        if (existingIndex > -1) {
            selectedElements.splice(existingIndex, 1); // Deselect if already selected
        } else {
            elementData.identifier = selectionIdentifier;
            selectedElements.push(elementData); // Add to selection
        }
    } else {
        if (selectedElements.length === 1 && existingIndex === 0) {
            clearSelection(); // Deselect if clicking the only selected item
            return;
        } else {
            clearSelection();
            elementData.identifier = selectionIdentifier;
            selectedElements.push(elementData); // Select just this one
        }
    }
    updateSelectionState();
}

/**
 * Updates the scene state (gizmo, visuals) based on the current `selectedElements` array.
 */
function updateSelectionState() {
    resetHighlights(); // Re-color all helpers to reflect the new selection

    if (selectedElements.length > 0) {
        const center = new THREE.Vector3();
        const matrixWorld = activeObject.matrixWorld;

        // Calculate the average center of all selected elements to position the gizmo
        selectedElements.forEach(elem => {
            center.add(elem.getCenter(matrixWorld));
        });
        center.divideScalar(selectedElements.length);

        // Position the shared proxy gizmo and attach controls
        if (!selectionGroupProxy.parent) scene.add(selectionGroupProxy);
        selectionGroupProxy.position.copy(center);
        selectionGroupProxy.rotation.set(0, 0, 0);
        selectionGroupProxy.scale.set(1, 1, 1);
        transformControls.attach(selectionGroupProxy);
    } else {
        transformControls.detach();
        if (selectionGroupProxy.parent) scene.remove(selectionGroupProxy);
    }
}

/**
 * Clears the modeling selection, detaches the gizmo, and resets visuals.
 */
function clearSelection() {
    selectedElements = [];
    updateSelectionState();
}


/**
 * Clears and disposes all geometry/materials from the helper groups.
 */
function clearMeshStructure() {
    [vertexHelpers, edgeHelpers, faceHelpers].forEach(group => {
        if (group) {
            // Properly dispose of all children
            while (group.children.length > 0) {
                const child = group.children[0];
                group.remove(child);
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(m => m.dispose());
                    } else {
                        child.material.dispose();
                    }
                }
            }
        }
    });

    // Re-create the groups. They will be added to the scene in showMeshStructure if needed.
    vertexHelpers = new THREE.Group();
    vertexHelpers.name = "VertexHelpers";
    edgeHelpers = new THREE.Group();
    edgeHelpers.name = "EdgeHelpers";
    faceHelpers = new THREE.Group();
    faceHelpers.name = "FaceHelpers";
}


// =================================================================
// === VISUAL FEEDBACK & HELPERS
// =================================================================

/**
 * Main function to generate and display all modeling helpers (vertices, edges, faces).
 * This function is rate-limited and has a performance mode.
 * @param {THREE.Mesh} object - The object to display helpers for.
 */
function showMeshStructure(object) {
    if (helperUpdateTimeout) clearTimeout(helperUpdateTimeout);

    const now = Date.now();
    if (now - lastHelperUpdateTime < MIN_UPDATE_INTERVAL && !isTransforming) {
        helperUpdateTimeout = setTimeout(() => showMeshStructure(object), MIN_UPDATE_INTERVAL);
        return;
    }
    lastHelperUpdateTime = now;

    // Ensure helper groups are ready and added to the scene if not already
    clearMeshStructure();
    if (!vertexHelpers.parent) scene.add(vertexHelpers);
    if (!edgeHelpers.parent) scene.add(edgeHelpers);
    if (!faceHelpers.parent) scene.add(faceHelpers);


    if (!isModelingMode || !object?.geometry?.attributes.position) {
        return;
    }
    activeObject = object; // Ensure activeObject is set

    const geometry = object.geometry;
    const positions = geometry.attributes.position;
    const matrix = object.matrixWorld.clone();
    const vertexSize = (parseFloat(document.getElementById('vertexSizeSlider').value) || 0.5) * 0.1;
    const totalVertices = positions.count;

    // In performance mode, only show a subset of helpers if the vertex count is high
    const showFullHelpers = !isPerformanceMode || totalVertices <= MAX_HELPERS;

    if (showFullHelpers) {
        if ((selectionMode === 'vertex' || selectionMode === 'all') && totalVertices > 0) {
            const instanceCount = totalVertices;
            const sphereGeom = new THREE.SphereGeometry(vertexSize, 8, 8);
            const sphereMat = new THREE.MeshBasicMaterial({
                color: 0xffffff
            }); // Color will be set by instanced attributes
            const instancedMesh = new THREE.InstancedMesh(sphereGeom, sphereMat, instanceCount);
            instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            instancedMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(instanceCount * 3), 3);
            instancedMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
            instancedMesh.userData.vertexIndices = [];

            const dummy = new THREE.Object3D();
            const baseColor = new THREE.Color(0x2222FF); // Default blue

            for (let i = 0; i < instanceCount; i++) {
                dummy.position.fromBufferAttribute(positions, i).applyMatrix4(matrix);
                dummy.updateMatrix();
                instancedMesh.setMatrixAt(i, dummy.matrix);
                instancedMesh.setColorAt(i, baseColor); // Set default color initially
                instancedMesh.userData.vertexIndices.push(i);
            }
            instancedMesh.userData.type = 'vertex-instanced';
            instancedMesh.instanceMatrix.needsUpdate = true;
            instancedMesh.instanceColor.needsUpdate = true;
            vertexHelpers.add(instancedMesh);
        }
        updateEdgeFaceHelpers();
    } else {
        createReducedMeshHelpers(positions, matrix, null, vertexSize,
            parseFloat(document.getElementById('edgeThicknessSlider').value) || 1,
            parseFloat(document.getElementById('faceOpacitySlider').value) || 0.5);
    }
    resetHighlights();
}

/**
 * Updates only the edge and face helpers. Called by showMeshStructure.
 */
function updateEdgeFaceHelpers() {
    if (!activeObject?.geometry?.attributes.position) return;

    const geometry = activeObject.geometry;
    const positions = geometry.attributes.position;
    const matrix = activeObject.matrixWorld;
    const edgeThickness = parseFloat(document.getElementById('edgeThicknessSlider').value) || 1;
    const faceOpacity = parseFloat(document.getElementById('faceOpacitySlider').value) || 0.5;

    const showEdges = (selectionMode === 'edge' || selectionMode === 'all');
    const showFaces = (selectionMode === 'face' || selectionMode === 'all');

    if (!showEdges && !showFaces) return;

    const isIndexed = !!geometry.index;
    const indices = isIndexed ? geometry.index.array : null;
    const posCount = positions.count;

    const tempV = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];

    if (showEdges && isIndexed) {
        const edgeSet = new Set();
        for (let i = 0; i < indices.length; i += 3) {
            const v_indices = [indices[i], indices[i + 1], indices[i + 2]];
            for (let j = 0; j < 3; j++) {
                const startIdx = v_indices[j];
                const endIdx = v_indices[(j + 1) % 3];
                const edgeKey = getEdgeKey(startIdx, endIdx);
                if (!edgeSet.has(edgeKey)) {
                    edgeSet.add(edgeKey);
                    tempV[0].fromBufferAttribute(positions, startIdx).applyMatrix4(matrix);
                    tempV[1].fromBufferAttribute(positions, endIdx).applyMatrix4(matrix);
                    const edgeGeom = new THREE.BufferGeometry().setFromPoints([tempV[0], tempV[1]]);
                    const edgeMat = new THREE.LineBasicMaterial({ color: 0xE67E22, linewidth: edgeThickness });
                    const edge = new THREE.Line(edgeGeom, edgeMat);
                    edge.userData = { type: 'edge', indices: [startIdx, endIdx] };
                    edgeHelpers.add(edge);
                }
            }
        }
    }

    if (showFaces && isIndexed) {
        for (let i = 0; i < indices.length; i += 3) {
            const v_indices = [indices[i], indices[i + 1], indices[i + 2]];
            tempV[0].fromBufferAttribute(positions, v_indices[0]).applyMatrix4(matrix);
            tempV[1].fromBufferAttribute(positions, v_indices[1]).applyMatrix4(matrix);
            tempV[2].fromBufferAttribute(positions, v_indices[2]).applyMatrix4(matrix);
            const faceGeom = new THREE.BufferGeometry().setFromPoints(tempV);
            faceGeom.setIndex([0, 1, 2]);
            const faceMat = new THREE.MeshBasicMaterial({ color: 0x44DD88, transparent: true, opacity: faceOpacity, side: THREE.DoubleSide });
            const faceMesh = new THREE.Mesh(faceGeom, faceMat);
            faceMesh.userData = { type: 'face', indices: v_indices, faceIndex: i / 3 };
            faceHelpers.add(faceMesh);
        }
    }
}


/**
 * Resets all helper highlights and applies the correct default or selected color.
 */
function resetHighlights() {
    const SELECTED_COLOR = new THREE.Color(0xffa500); // Orange for selected
    const VERTEX_DEFAULT_COLOR = new THREE.Color(0x2222FF);
    const EDGE_DEFAULT_COLOR = new THREE.Color(0xE67E22);
    const FACE_DEFAULT_COLOR = new THREE.Color(0x44DD88);
    const baseFaceOpacity = parseFloat(document.getElementById('faceOpacitySlider').value);

    // Create Sets of selected element identifiers for fast lookup
    const selectedVertexIndices = new Set();
    const selectedHelperUUIDs = new Set();
    selectedElements.forEach(elem => {
        if (elem.type === 'vertex') {
            elem.indices.forEach(idx => selectedVertexIndices.add(idx));
        } else {
            selectedHelperUUIDs.add(elem.helper.uuid);
        }
    });

    // Reset vertex instance colors
    vertexHelpers.children.forEach(child => {
        if (child.isInstancedMesh && child.userData.type === 'vertex-instanced') {
            const vertexIndices = child.userData.vertexIndices;
            for (let i = 0; i < child.count; i++) {
                child.setColorAt(i, selectedVertexIndices.has(vertexIndices[i]) ? SELECTED_COLOR : VERTEX_DEFAULT_COLOR);
            }
            child.instanceColor.needsUpdate = true;
        }
    });

    // Reset edge colors
    edgeHelpers.children.forEach(child => {
        if (child.isLine) child.material.color.set(selectedHelperUUIDs.has(child.uuid) ? SELECTED_COLOR : EDGE_DEFAULT_COLOR);
    });

    // Reset face colors and opacity
    faceHelpers.children.forEach(child => {
        if (child.isMesh) {
            const isSelected = selectedHelperUUIDs.has(child.uuid);
            child.material.color.set(isSelected ? SELECTED_COLOR : FACE_DEFAULT_COLOR);
            child.material.opacity = isSelected ? Math.min(1, baseFaceOpacity + 0.3) : baseFaceOpacity;
        }
    });

    renderer.domElement.style.cursor = 'default';
}

/**
 * Applies a temporary red hover color to a vertex helper.
 */
function highlightVertices() {
    // Note: resetHighlights() is called just before this in the mouse move handler,
    // so we only need to apply the hover color.
    const intersects = raycaster.intersectObjects(vertexHelpers.children, true);
    const closest = findClosestIntersection(intersects, 'vertex-instanced');
    if (closest) {
        closest.object.setColorAt(closest.instanceId, new THREE.Color(0xFF0000)); // Red hover
        closest.object.instanceColor.needsUpdate = true;
        return true;
    }
    return false;
}

/**
 * Applies a temporary red hover color to an edge helper.
 */
function highlightEdges() {
    const intersects = raycaster.intersectObjects(edgeHelpers.children, true);
    const closest = findClosestIntersection(intersects, 'edge');
    if (closest) {
        closest.object.material.color.set(0xFF0000); // Red hover
        return true;
    }
    return false;
}

/**
 * Applies a temporary red hover color to a face helper.
 */
function highlightFaces() {
    const intersects = raycaster.intersectObjects(faceHelpers.children, true);
    const closest = findClosestIntersection(intersects, 'face');
    if (closest) {
        closest.object.material.color.set(0xFF0000); // Red hover
        closest.object.material.opacity = Math.min(1, parseFloat(document.getElementById('faceOpacitySlider').value) + 0.5);
        return true;
    }
    return false;
}


// =================================================================
// === TRANSFORMATION CORE
// =================================================================

/**
 * Sets up all event listeners for the transform controls, including handling
 * the start and end of a drag operation for multi-selection transforms.
 */
function setupTransformControls() {
    if (transformControls && controls) {
        transformControls.addEventListener('dragging-changed', function(event) {
            isTransforming = event.value;
            if (!isLocked) controls.enabled = !isTransforming;

            if (isTransforming) {
                // DRAG STARTED: Capture the initial state of the selection
                if (selectedElements.length > 0) {
                    const matrixWorld = activeObject.matrixWorld;
                    const positions = activeObject.geometry.attributes.position;
                    dragStartState.center = selectionGroupProxy.position.clone();
                    dragStartState.vertices.clear();
                    selectedElements.forEach(elem => {
                        elem.indices.forEach(vertexIndex => {
                            if (!dragStartState.vertices.has(vertexIndex)) {
                                const worldPos = new THREE.Vector3().fromBufferAttribute(positions, vertexIndex).applyMatrix4(matrixWorld);
                                dragStartState.vertices.set(vertexIndex, worldPos);
                            }
                        });
                    });
                    console.log(`Drag Start: Captured ${dragStartState.vertices.size} unique vertices.`);
                }
            } else {
                // DRAG ENDED: Finalize the geometry and update visuals
                if (activeObject) {
                    activeObject.geometry.computeVertexNormals();
                    showMeshStructure(activeObject);
                }
                dragStartState.center = null;
                dragStartState.vertices.clear();
                console.log("Drag End. Helpers Updated.");
            }
        });

        transformControls.addEventListener('mouseUp', function() {
            if (!isLocked) {
                isTransforming = false;
                controls.enabled = true;
            }
        });

        // 'objectChange' fires continuously during a transform. This is our main update loop.
        transformControls.addEventListener('objectChange', handleTransformObjectChange);

        // Initialize the snapping helper mesh
        if (!snapHighlightMesh) {
            snapHighlightMesh = new THREE.Mesh(
                new THREE.SphereGeometry(0.05),
                new THREE.MeshBasicMaterial({ color: 0xffff00, depthTest: false, transparent: true, opacity: 0.8 })
            );
            snapHighlightMesh.renderOrder = 1000;
            snapHighlightMesh.visible = false;
            scene.add(snapHighlightMesh);
        }
    }
}

/**
 * This function is the core of the multi-transform system. It's called continuously
 * during a drag operation. It calculates the gizmo's transformation delta and
 * applies it to all selected vertices relative to the shared pivot.
 */
function updateMeshGeometry() {
    if (!activeObject || selectedElements.length === 0 || !isTransforming || !dragStartState.center) {
        return;
    }

    const geometry = activeObject.geometry;
    const positions = geometry.attributes.position;
    const mode = transformControls.getMode();

    activeObject.updateMatrixWorld();
    const inverseMatrix = new THREE.Matrix4().copy(activeObject.matrixWorld).invert();

    const currentProxyPosition = selectionGroupProxy.position.clone();
    const currentProxyRotation = selectionGroupProxy.quaternion.clone();
    const currentProxyScale = selectionGroupProxy.scale.clone();
    const startProxyPosition = dragStartState.center;

    dragStartState.vertices.forEach((initialWorldPos, vertexIndex) => {
        let finalWorldPos = new THREE.Vector3();

        if (mode === 'translate') {
            const deltaTranslation = new THREE.Vector3().subVectors(currentProxyPosition, startProxyPosition);
            finalWorldPos.copy(initialWorldPos).add(deltaTranslation);
        } else { // Handle Rotate and Scale relative to the pivot
            const relativePos = new THREE.Vector3().subVectors(initialWorldPos, startProxyPosition);
            relativePos.multiply(currentProxyScale);
            relativePos.applyQuaternion(currentProxyRotation);
            finalWorldPos.copy(currentProxyPosition).add(relativePos);
        }

        const finalLocalPos = finalWorldPos.applyMatrix4(inverseMatrix);
        positions.setXYZ(vertexIndex, finalLocalPos.x, finalLocalPos.y, finalLocalPos.z);
    });

    positions.needsUpdate = true;
    geometry.computeBoundingSphere();
    // PERF: Normals and helpers are updated only on drag end.
}

/**
 * Handles snapping and calls the main geometry update function during a transform.
 */
const handleTransformObjectChange = () => {
    if (isSnappingEnabled && transformControls.object && transformControls.dragging) {
        applySnapping(transformControls);
    } else if (snapHighlightMesh) {
        snapHighlightMesh.visible = false;
    }
    // This is the call that updates the mesh in real-time.
    updateMeshGeometry();
};


// =================================================================
// === MODELING TOOL IMPLEMENTATIONS
// =================================================================

/**
 * Extrudes the currently selected faces.
 */
function extrudeSelection() {
    console.log("Executing Extrude Selection...");
    if (!activeObject) { console.warn("Extrude: No active object."); return; }
    if (selectionMode !== 'face') { alert("Extrude currently only supports Face selection."); return; }

    // MODIFIED: Get selected face indices from the new multi-selection structure
    const selectedFaceIndices = selectedElements
        .filter(elem => elem.type === 'face')
        .map(elem => elem.helper.userData.faceIndex);

    if (selectedFaceIndices.length === 0) { console.warn("Extrude: No faces selected."); return; }
    if (!activeObject.geometry?.index || !activeObject.geometry?.attributes.position) {
        console.error("Extrude requires indexed geometry with positions."); return;
    }

    const geometry = activeObject.geometry;
    const positions = geometry.attributes.position;
    const normals = geometry.attributes.normal;
    const uvs = geometry.attributes.uv;
    const indices = geometry.index.array;
    const originalVertexCount = positions.count;

    const extrudeDistance = 0.3;

    const facesToRebuild = new Set(selectedFaceIndices);
    const verticesToDuplicate = new Map(); // Map<originalIndex, { newIndex: number, ... }>

    selectedFaceIndices.forEach(faceIndex => {
        for (let i = 0; i < 3; i++) {
            const vertIndex = indices[faceIndex * 3 + i];
            if (!verticesToDuplicate.has(vertIndex)) {
                verticesToDuplicate.set(vertIndex, { newIndex: -1 });
            }
        }
    });

    let nextNewIndex = originalVertexCount;
    verticesToDuplicate.forEach(data => data.newIndex = nextNewIndex++);

    const numNewVerts = verticesToDuplicate.size;
    const finalVertexCount = originalVertexCount + numNewVerts;
    const newPositions = new Float32Array(finalVertexCount * 3);
    const newNormals = normals ? new Float32Array(finalVertexCount * 3) : null;
    const newUVs = uvs ? new Float32Array(finalVertexCount * 2) : null;

    newPositions.set(positions.array);
    if (newNormals) newNormals.set(normals.array);
    if (newUVs) newUVs.set(uvs.array);

    const tempPos = new THREE.Vector3();
    const tempNorm = new THREE.Vector3();

    verticesToDuplicate.forEach((data, originalIndex) => {
        const newIndex = data.newIndex;
        tempPos.fromBufferAttribute(positions, originalIndex);
        tempNorm.fromBufferAttribute(normals, originalIndex);
        const extrudedPos = tempPos.clone().addScaledVector(tempNorm, extrudeDistance);
        newPositions.set(extrudedPos.toArray(), newIndex * 3);
        if (newNormals) newNormals.set(tempNorm.toArray(), newIndex * 3);
        if (newUVs && uvs) newUVs.set([uvs.getX(originalIndex), uvs.getY(originalIndex)], newIndex * 2);
    });

    const newIndices = [];
    const edgeFaceMap = buildEdgeFaceMap(geometry);
    if (!edgeFaceMap) { console.error("Failed to build topology map for extrude."); return; }
    const boundaryEdges = new Map();

    const originalFaceCount = indices.length / 3;
    for (let i = 0; i < originalFaceCount; i++) {
        if (!facesToRebuild.has(i)) {
            newIndices.push(indices[i * 3], indices[i * 3 + 1], indices[i * 3 + 2]);
        }
    }

    selectedFaceIndices.forEach(faceIndex => {
        const [i0_orig, i1_orig, i2_orig] = [indices[faceIndex * 3], indices[faceIndex * 3 + 1], indices[faceIndex * 3 + 2]];
        const [i0_new, i1_new, i2_new] = [verticesToDuplicate.get(i0_orig).newIndex, verticesToDuplicate.get(i1_orig).newIndex, verticesToDuplicate.get(i2_orig).newIndex];
        newIndices.push(i0_new, i1_new, i2_new); // New cap face

        const edges = [[i0_orig, i1_orig], [i1_orig, i2_orig], [i2_orig, i0_orig]];
        edges.forEach(edge => {
            const edgeKey = getEdgeKey(edge[0], edge[1]);
            const adjacentFaces = edgeFaceMap.get(edgeKey) || [];
            const isBoundary = adjacentFaces.some(adjFaceIdx => !facesToRebuild.has(adjFaceIdx));
            if (isBoundary && !boundaryEdges.has(edgeKey)) {
                boundaryEdges.set(edgeKey, {
                    vOrig1: edge[0], vOrig2: edge[1],
                    vNew1: verticesToDuplicate.get(edge[0]).newIndex, vNew2: verticesToDuplicate.get(edge[1]).newIndex
                });
            }
        });
    });

    boundaryEdges.forEach(edgeData => {
        newIndices.push(edgeData.vOrig1, edgeData.vOrig2, edgeData.vNew2);
        newIndices.push(edgeData.vNew2, edgeData.vNew1, edgeData.vOrig1);
    });

    const newGeometry = new THREE.BufferGeometry();
    newGeometry.setAttribute('position', new THREE.BufferAttribute(newPositions, 3));
    if (newNormals) newGeometry.setAttribute('normal', new THREE.BufferAttribute(newNormals, 3));
    if (newUVs) newGeometry.setAttribute('uv', new THREE.BufferAttribute(newUVs, 2));
    newGeometry.setIndex(newIndices);
    newGeometry.computeVertexNormals();

    const oldGeometry = geometry;
    activeObject.geometry = newGeometry;
    oldGeometry.dispose();

    if (baseGeometries.has(activeObject.uuid)) {
        baseGeometries.set(activeObject.uuid, newGeometry.clone());
    }

    clearSelection();
    showMeshStructure(activeObject);
    console.log("Extrude operation successful.");
}

// ... Placeholder for bevelSelection, insetSelectedFaces, etc.
// They would follow the same pattern of getting their data from `selectedElements`.


// =================================================================
// === LOOP CUT TOOL
// =================================================================

// findEdgeLoop function (as you provided it) should be here...
function findEdgeLoop(geometry, startEdgeIndices, edgeFaceMap, vertexEdgeMap, vertexFaceMap) {
    if (!geometry?.index || !startEdgeIndices || !edgeFaceMap || !vertexEdgeMap || !vertexFaceMap) {
        return startEdgeIndices ? [startEdgeIndices] : [];
    }

    const indices = geometry.index.array;
    const loop = [];
    const visitedEdges = new Set();

    const getOtherVertexInFace = (faceIndex, edgeV1, edgeV2) => {
        const faceVerts = [indices[faceIndex * 3], indices[faceIndex * 3 + 1], indices[faceIndex * 3 + 2]];
        return faceVerts.find(v => v !== edgeV1 && v !== edgeV2);
    };

    const findNextEdgeInLoop = (currentV, prevVOfEdge) => {
        const currentEdgeKey = getEdgeKey(currentV, prevVOfEdge);
        const facesOnCurrentEdge = edgeFaceMap.get(currentEdgeKey);
        if (!facesOnCurrentEdge || facesOnCurrentEdge.length !== 2) return null; // Boundary or non-manifold

        for (const faceIndex of facesOnCurrentEdge) {
            const oppositeV = getOtherVertexInFace(faceIndex, currentV, prevVOfEdge);
            if (oppositeV === undefined) continue;

            const edgesFromCurrentV = vertexEdgeMap.get(currentV);
            if (!edgesFromCurrentV) continue;

            for (const candidateEdgeKey of edgesFromCurrentV) {
                if (candidateEdgeKey === currentEdgeKey || visitedEdges.has(candidateEdgeKey)) continue;

                const facesOnCandidateEdge = edgeFaceMap.get(candidateEdgeKey);
                if (!facesOnCandidateEdge) continue;

                const otherFaceIndex = facesOnCurrentEdge.find(f => f !== faceIndex);
                if (otherFaceIndex === undefined) continue;

                if (facesOnCandidateEdge.includes(otherFaceIndex)) {
                     const [vC1, vC2] = candidateEdgeKey.split('_').map(Number);
                     const nextVInLoop = (vC1 === currentV) ? vC2 : vC1;
                     return [currentV, nextVInLoop];
                }
            }
        }
        return null;
    };

    loop.push(startEdgeIndices);
    visitedEdges.add(getEdgeKey(startEdgeIndices[0], startEdgeIndices[1]));

    // Traverse one direction
    let currentEdgeArr = startEdgeIndices;
    for (let i = 0; i < indices.length; i++) {
        const nextEdge = findNextEdgeInLoop(currentEdgeArr[1], currentEdgeArr[0]);
        if (nextEdge && !visitedEdges.has(getEdgeKey(nextEdge[0], nextEdge[1]))) {
            if (nextEdge[1] === startEdgeIndices[0]) { // Closed loop
                loop.push(nextEdge);
                return loop;
            }
            loop.push(nextEdge);
            visitedEdges.add(getEdgeKey(nextEdge[0], nextEdge[1]));
            currentEdgeArr = nextEdge;
        } else {
            break;
        }
    }

    // Traverse other direction
    currentEdgeArr = [startEdgeIndices[1], startEdgeIndices[0]]; // Reversed
    for (let i = 0; i < indices.length; i++) {
         const nextEdge = findNextEdgeInLoop(currentEdgeArr[1], currentEdgeArr[0]);
        if (nextEdge && !visitedEdges.has(getEdgeKey(nextEdge[0], nextEdge[1]))) {
            loop.unshift(nextEdge);
            visitedEdges.add(getEdgeKey(nextEdge[0], nextEdge[1]));
            currentEdgeArr = nextEdge;
        } else {
            break;
        }
    }
    return loop;
}

function initiateLoopCut() {
    console.log("Initiating Loop Cut Mode...");
    if (!activeObject?.geometry?.index || isTransforming) {
        console.error("Loop cut requires a selected, indexed mesh and cannot be used while transforming.");
        return;
    }
    deactivateCurrentArchTool();
    if (selectionMode !== 'edge') setSelectionMode('edge');
    else if (activeObject) showMeshStructure(activeObject);

    isLoopCutMode = true;
    if (controls) controls.enabled = false;
    transformControls.detach();
    clearSelection();
    renderer.domElement.style.cursor = 'crosshair';

    if (!loopCutPreviewLine) {
        loopCutPreviewLine = new THREE.Line(
            new THREE.BufferGeometry(),
            new THREE.LineBasicMaterial({ color: LOOP_CUT_PREVIEW_COLOR, linewidth: 3, depthTest: false })
        );
        loopCutPreviewLine.renderOrder = 999;
        scene.add(loopCutPreviewLine);
    }
    loopCutPreviewLine.visible = false;
    loopCutPreviewLine.userData = {};
    alert("Loop Cut: Hover over an edge to preview the loop. Click to cut.");
}

// ... (Previous 2000 lines of code end here) ...
// Loop cut functions like handleLoopCutPreviewInternal, handleLoopCutConfirmInternal,
// cancelLoopCut, and cleanupLoopCutMode would be here. Let's add them for completeness.

/**
 * Internal handler for showing the loop cut preview line on mouse move.
 * @param {MouseEvent} event
 */
function handleLoopCutPreviewInternal(event) {
    if (!isLoopCutMode || !activeObject || !edgeHelpers) {
        if (loopCutPreviewLine) loopCutPreviewLine.visible = false;
        loopCutPreviewLine.userData = {};
        return;
    }

    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    raycaster.params.Line.threshold = 0.05;

    const edgeIntersects = raycaster.intersectObjects(edgeHelpers.children, false);
    const closestEdgeIntersect = findClosestIntersection(edgeIntersects, 'edge');

    if (closestEdgeIntersect) {
        const startEdgeIndices = closestEdgeIntersect.object.userData.indices;
        const geometry = activeObject.geometry;
        activeObject.updateMatrixWorld(true);
        const matrixWorld = activeObject.matrixWorld;

        const loopEdgeSegments = findEdgeLoop(geometry, startEdgeIndices, buildEdgeFaceMap(geometry), buildVertexEdgeMap(geometry), buildVertexFaceMap(geometry));

        if (loopEdgeSegments?.length > 0) {
            const previewWorldPoints = [];
            const tempA = new THREE.Vector3(), tempB = new THREE.Vector3(), mid = new THREE.Vector3();
            loopEdgeSegments.forEach(segment => {
                tempA.fromBufferAttribute(geometry.attributes.position, segment[0]);
                tempB.fromBufferAttribute(geometry.attributes.position, segment[1]);
                mid.lerpVectors(tempA, tempB, 0.5).applyMatrix4(matrixWorld);
                previewWorldPoints.push(mid.clone());
            });

            // Close the loop visually if it's a closed path
            if (loopEdgeSegments[0][0] === loopEdgeSegments[loopEdgeSegments.length - 1][1] && previewWorldPoints.length > 1) {
                previewWorldPoints.push(previewWorldPoints[0].clone());
            }

            if (previewWorldPoints.length >= 2) {
                loopCutPreviewLine.geometry.dispose();
                loopCutPreviewLine.geometry = new THREE.BufferGeometry().setFromPoints(previewWorldPoints);
                loopCutPreviewLine.visible = true;
                loopCutPreviewLine.userData.loopEdgeSegmentsToCut = loopEdgeSegments;
            } else {
                loopCutPreviewLine.visible = false;
            }
        } else {
            loopCutPreviewLine.visible = false;
        }
    } else {
        loopCutPreviewLine.visible = false;
    }
}

/**
 * Internal handler to confirm and execute the loop cut on click.
 * @param {MouseEvent} event
 */
function handleLoopCutConfirmInternal(event) {
    if (!isLoopCutMode || !loopCutPreviewLine.visible || !loopCutPreviewLine.userData.loopEdgeSegmentsToCut) {
        return;
    }
    const loopEdgesToCut = loopCutPreviewLine.userData.loopEdgeSegmentsToCut;
    console.log(`Confirming Loop Cut for ${loopEdgesToCut.length} edge segments...`);

    const geometry = activeObject.geometry;
    const edgeFaceMap = buildEdgeFaceMap(geometry);
    if (!edgeFaceMap) {
        console.error("Loop Cut: Failed to build edgeFaceMap for confirm.");
        cleanupLoopCutMode();
        return;
    }

    const positions = geometry.attributes.position;
    const normals = geometry.attributes.normal;
    const uvs = geometry.attributes.uv;
    const originalIndices = geometry.index.array.slice();
    const originalVertexCount = positions.count;

    const newMidpointVerticesData = new Map();
    let nextNewVertexIndex = originalVertexCount;
    const temp = {
        posA: new THREE.Vector3(), posB: new THREE.Vector3(),
        normA: new THREE.Vector3(), normB: new THREE.Vector3(),
        uvA: new THREE.Vector2(), uvB: new THREE.Vector2()
    };

    loopEdgesToCut.forEach(edgeSegment => {
        const [u, v] = edgeSegment;
        const edgeKey = getEdgeKey(u, v);
        if (newMidpointVerticesData.has(edgeKey)) return;
        
        temp.posA.fromBufferAttribute(positions, u); temp.posB.fromBufferAttribute(positions, v);
        temp.normA.fromBufferAttribute(normals, u); temp.normB.fromBufferAttribute(normals, v);
        temp.uvA.fromBufferAttribute(uvs, u); temp.uvB.fromBufferAttribute(uvs, v);

        newMidpointVerticesData.set(edgeKey, {
            newIndex: nextNewVertexIndex++,
            position: new THREE.Vector3().lerpVectors(temp.posA, temp.posB, 0.5),
            normal: new THREE.Vector3().lerpVectors(temp.normA, temp.normB, 0.5).normalize(),
            uv: new THREE.Vector2().lerpVectors(temp.uvA, temp.uvB, 0.5)
        });
    });

    const numNewVertices = newMidpointVerticesData.size;
    if (numNewVertices === 0) {
        cleanupLoopCutMode(); return;
    }
    const finalVertexCount = originalVertexCount + numNewVertices;
    const newPositions = new Float32Array(finalVertexCount * 3);
    const newNormals = new Float32Array(finalVertexCount * 3);
    const newUVs = new Float32Array(finalVertexCount * 2);
    newPositions.set(positions.array); newNormals.set(normals.array); newUVs.set(uvs.array);
    newMidpointVerticesData.forEach(data => {
        newPositions.set(data.position.toArray(), data.newIndex * 3);
        newNormals.set(data.normal.toArray(), data.newIndex * 3);
        newUVs.set(data.uv.toArray(), data.newIndex * 2);
    });

    const finalNewIndices = [];
    const facesAlreadySplit = new Set();
    
    loopEdgesToCut.forEach(edgeSegment => {
        const [u_orig, v_orig] = edgeSegment;
        const edgeKey = getEdgeKey(u_orig, v_orig);
        const m_new_idx = newMidpointVerticesData.get(edgeKey).newIndex;
        const adjacentFaceIndices = edgeFaceMap.get(edgeKey) || [];

        adjacentFaceIndices.forEach(faceIndex => {
            if (facesAlreadySplit.has(faceIndex)) return;
            const faceVerts = [originalIndices[faceIndex * 3], originalIndices[faceIndex * 3 + 1], originalIndices[faceIndex * 3 + 2]];
            const p_orig = faceVerts.find(v => v !== u_orig && v !== v_orig);
            if (p_orig === undefined) return;
            
            const m_vp_idx = newMidpointVerticesData.get(getEdgeKey(v_orig, p_orig))?.newIndex;
            const m_pu_idx = newMidpointVerticesData.get(getEdgeKey(p_orig, u_orig))?.newIndex;

            if (m_vp_idx && m_pu_idx) { // All 3 edges cut
                finalNewIndices.push(u_orig, m_new_idx, m_pu_idx, m_new_idx, v_orig, m_vp_idx, m_pu_idx, m_vp_idx, p_orig, m_new_idx, m_vp_idx, m_pu_idx);
            } else if (m_vp_idx) { // Edges (u,v) and (v,p) cut
                finalNewIndices.push(u_orig, m_new_idx, p_orig, m_new_idx, m_vp_idx, p_orig, m_new_idx, v_orig, m_vp_idx);
            } else if (m_pu_idx) { // Edges (u,v) and (p,u) cut
                finalNewIndices.push(m_new_idx, v_orig, p_orig, m_pu_idx, m_new_idx, p_orig, u_orig, m_pu_idx, m_new_idx);
            } else { // Only edge (u,v) cut
                finalNewIndices.push(u_orig, m_new_idx, p_orig, m_new_idx, v_orig, p_orig);
            }
            facesAlreadySplit.add(faceIndex);
        });
    });

    const originalFaceCount = originalIndices.length / 3;
    for (let i = 0; i < originalFaceCount; i++) {
        if (!facesAlreadySplit.has(i)) {
            finalNewIndices.push(originalIndices[i * 3], originalIndices[i * 3 + 1], originalIndices[i * 3 + 2]);
        }
    }

    const newGeometry = new THREE.BufferGeometry();
    newGeometry.setAttribute('position', new THREE.BufferAttribute(newPositions, 3));
    newGeometry.setAttribute('normal', new THREE.BufferAttribute(newNormals, 3));
    newGeometry.setAttribute('uv', new THREE.BufferAttribute(newUVs, 2));
    newGeometry.setIndex(finalNewIndices);
    newGeometry.computeVertexNormals();

    const oldGeometry = geometry;
    activeObject.geometry = newGeometry;
    oldGeometry.dispose();
    if (baseGeometries.has(activeObject.uuid)) {
        baseGeometries.set(activeObject.uuid, newGeometry.clone());
    }
    
    cleanupLoopCutMode();
    showMeshStructure(activeObject);
}

/**
 * Cancels the loop cut operation and cleans up.
 */
function cancelLoopCut() {
    if (!isLoopCutMode) return;
    console.log("Cancelling Loop Cut.");
    cleanupLoopCutMode();
}

/**
 * Resets all state related to the loop cut tool.
 */
function cleanupLoopCutMode() {
    isLoopCutMode = false;
    if (loopCutPreviewLine) loopCutPreviewLine.visible = false;
    if (renderer.domElement) renderer.domElement.style.cursor = 'default';
    if (controls && !isTransforming && !activeArchTool) controls.enabled = true;
}

// =================================================================
// === ARCHITECTURAL ELEMENT MANAGEMENT & SELECTION
// =================================================================

/**
 * Registers a mesh as an architectural element for selection and management.
 * @param {THREE.Mesh | THREE.Group} mesh The element to register.
 * @param {string} type The type of element (e.g., 'wall', 'door').
 */
function registerArchitecturalElement(mesh, type) {
    mesh.userData.isArchitectural = true;
    mesh.userData.archType = type;
    mesh.userData.originalColor = new THREE.Color(0xcccccc); // Default color

    // Attempt to get the original color from the material
    const mat = mesh.isGroup ? mesh.children[0]?.material : mesh.material;
    if (mat && mat.color) {
        mesh.userData.originalColor.copy(mat.color);
    }
    
    architecturalElements.push(mesh);
    if (typeof updateHierarchy === 'function') updateHierarchy(mesh);
    console.log(`Registered ${type}: ${mesh.name || mesh.uuid}. Total: ${architecturalElements.length}`);
}

/**
 * Selects an architectural element, handling single and multi-selection.
 * @param {THREE.Object3D} element The element to select.
 * @param {boolean} additive If true, adds to the current selection.
 */
function selectArchElement(element, additive = false) {
    if (!element?.userData.isArchitectural) return;

    if (!additive) {
        deselectAllArchElements();
    }

    if (!selectedArchElements.includes(element)) {
        selectedArchElements.push(element);
    }
    updateArchSelectionVisuals();
}

/**
 * Deselects a specific architectural element.
 * @param {THREE.Object3D} element The element to deselect.
 */
function deselectArchElement(element) {
    const index = selectedArchElements.indexOf(element);
    if (index > -1) {
        selectedArchElements.splice(index, 1);
        updateArchSelectionVisuals();
    }
}

/**
 * Deselects all currently selected architectural elements.
 */
function deselectAllArchElements() {
    if (selectedArchElements.length === 0) return;
    selectedArchElements = [];
    updateArchSelectionVisuals();
}

/**
 * Updates the color of all architectural elements based on the current selection.
 */
function updateArchSelectionVisuals() {
    const HIGHLIGHT_COLOR = new THREE.Color(0xffaa00);
    architecturalElements.forEach(el => {
        const isSelected = selectedArchElements.includes(el);
        const targetColor = isSelected ? HIGHLIGHT_COLOR : el.userData.originalColor;
        
        // This function needs to handle both Groups and Meshes
        const applyColor = (obj) => {
            if (obj.material && obj.material.color) {
                obj.material.color.copy(targetColor);
                obj.material.emissive = isSelected ? new THREE.Color(0x332200) : new THREE.Color(0x000000);
            }
        };

        if (el.isGroup) {
            el.traverse(child => { if (child.isMesh) applyColor(child); });
        } else if (el.isMesh) {
            applyColor(el);
        }
    });
    document.getElementById('delete-selected-arch').disabled = selectedArchElements.length === 0;
}


/**
 * Deletes all currently selected architectural elements from the scene.
 */
function deleteSelectedArchElements() {
    if (selectedArchElements.length === 0) return;
    if (!confirm(`Delete ${selectedArchElements.length} selected element(s)?`)) return;

    selectedArchElements.forEach(element => {
        scene.remove(element);
        // Deep dispose of geometry and material
        element.traverse(child => {
            if (child.isMesh) {
                if(child.geometry) child.geometry.dispose();
                if(child.material) {
                     if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
                     else child.material.dispose();
                }
            }
        });

        const mainIndex = architecturalElements.indexOf(element);
        if (mainIndex > -1) architecturalElements.splice(mainIndex, 1);
    });

    selectedArchElements = [];
    document.getElementById('delete-selected-arch').disabled = true;
    if (typeof updateHierarchy === 'function') updateHierarchy();
}

/**
 * Selects all architectural elements of a given type.
 * @param {string} type The type to select ('wall', 'door', 'all', etc.)
 */
function selectAllArchElementsByType(type) {
    deselectAllArchElements();
    const elementsToSelect = architecturalElements.filter(el => type === 'all' || el.userData.archType === type);
    elementsToSelect.forEach(el => selectArchElement(el, true)); // Add all to selection
    console.log(`Selected all ${type} elements.`);
}


// =================================================================
// === ARCHITECTURAL TOOL ACTIVATION & STATE MANAGEMENT
// =================================================================

/**
 * Toggles a specific architectural tool on or off.
 * @param {string} toolName The name of the tool to toggle.
 */
function toggleArchTool(toolName) {
    const toolButton = document.getElementById(`tool-${toolName}`);
    if (activeArchTool === toolName) {
        deactivateCurrentArchTool();
        return;
    }
    
    deactivateCurrentArchTool(); // Deactivate any previous tool
    activeArchTool = toolName;
    console.log(`Activated Arch tool: ${activeArchTool}`);
    
    document.querySelectorAll('.arch-tool.active-tool').forEach(btn => btn.classList.remove('active-tool'));
    if (toolButton) toolButton.classList.add('active-tool');
    
    // Show tool-specific options panel
    document.querySelectorAll('.tool-options').forEach(el => el.style.display = 'none');
    const toolOptionsElement = document.getElementById(`${toolName}-options`);
    if (toolOptionsElement) toolOptionsElement.style.display = 'block';

    // Initialize the specific tool
    switch (toolName) {
        case 'wall': initWallTool(); break;
        case 'door': initPlacementTool('door'); break;
        case 'window': initPlacementTool('window'); break;
        case 'roof': initRoofTool(); break;
        case 'room': initRoomTool(); break;
        case 'curved-wall': initCurvedWallTool(); break;
        case 'terrain': initTerrainTool(); break;
        case 'measure': initMeasureTool(); break;
        case 'stairs': initStairsTool(); break;
        case 'boolean-subtract': initBooleanSubtractTool(); break;
    }

    if (controls && toolName !== 'boolean-subtract') controls.enabled = false;
    transformControls.detach();
    clearSelection();
    if (toolName !== 'boolean-subtract') deselectAllArchElements();
}

/**
 * Deactivates the currently active architectural tool and cleans up its state.
 */
function deactivateCurrentArchTool() {
    if (!activeArchTool) return;
    console.log(`Deactivating Arch tool: ${activeArchTool}`);

    const toolButton = document.getElementById(`tool-${activeArchTool}`);
    if (toolButton) toolButton.classList.remove('active-tool');
    document.querySelectorAll('.tool-options').forEach(el => el.style.display = 'none');

    switch (activeArchTool) {
        case 'wall': cleanupWallTool(); break;
        case 'door': case 'window': cleanupPlacementTool(); break;
        case 'roof': cleanupRoofTool(); break;
        case 'room': cleanupRoomTool(); break;
        case 'curved-wall': cleanupCurvedWallTool(); break;
        case 'terrain': cleanupTerrainTool(); break;
        case 'measure': cleanupMeasureTool(); break;
        case 'stairs': cleanupStairsTool(); break;
        case 'boolean-subtract': cleanupBooleanToolState(); break;
    }
    
    activeArchTool = null;
    if (renderer.domElement) renderer.domElement.style.cursor = 'default';
    if (controls && !isTransforming && !isLoopCutMode) controls.enabled = true;
}


// =================================================================
// === ARCHITECTURAL TOOL IMPLEMENTATIONS (WALL, DOOR, WINDOW, etc.)
// =================================================================

// --- Wall Tool ---
function initWallTool() {
    wallPoints = [];
    isWallToolActive = true;
    if (!wallPreviewLine) {
        wallPreviewLine = new THREE.Line(
            new THREE.BufferGeometry(),
            new THREE.LineDashedMaterial({ color: 0x00ff00, dashSize: 0.2, gapSize: 0.1, linewidth: 2 })
        );
        wallPreviewLine.renderOrder = 990;
        scene.add(wallPreviewLine);
    }
    wallPreviewLine.visible = false;
    renderer.domElement.style.cursor = 'crosshair';
}

function handleWallPreview(event) {
    if (!isWallToolActive || wallPoints.length === 0) return;
    const intersection = getGroundPlaneIntersection();
    if (intersection) {
        const segmentPoints = [wallPoints[wallPoints.length - 1], intersection];
        wallPreviewLine.geometry.dispose();
        wallPreviewLine.geometry = new THREE.BufferGeometry().setFromPoints(segmentPoints);
        wallPreviewLine.computeLineDistances();
        wallPreviewLine.visible = true;
    }
}

function handleWallCreationPoint(event) {
    if (!isWallToolActive) return;
    const intersection = getGroundPlaneIntersection();
    if (intersection) {
        wallPoints.push(intersection.clone());
        // You could create a permanent line segment here for better visual feedback
    }
}

function finishWall() {
    if (wallPoints.length < 2) {
        cleanupWallTool();
        return;
    }
    const wallHeight = parseFloat(document.getElementById('wallHeightInput')?.value) || 2.5;
    const wallThickness = parseFloat(document.getElementById('wallThicknessInput')?.value) || 0.2;
    const wallGroup = new THREE.Group();
    wallGroup.name = "Wall_" + Date.now();

    for (let i = 0; i < wallPoints.length - 1; i++) {
        const p1 = wallPoints[i];
        const p2 = wallPoints[i + 1];
        const length = p1.distanceTo(p2);
        if (length < 0.01) continue;

        const wallSegmentGeom = new THREE.BoxGeometry(length, wallHeight, wallThickness);
        const wallSegmentMesh = new THREE.Mesh(wallSegmentGeom, new THREE.MeshStandardMaterial({ color: 0xcccccc }));
        
        wallSegmentMesh.position.copy(p1).lerp(p2, 0.5);
        wallSegmentMesh.position.y = wallHeight / 2;
        wallSegmentMesh.lookAt(p2);

        wallGroup.add(wallSegmentMesh);
    }
    
    if (wallGroup.children.length > 0) {
        registerArchitecturalElement(wallGroup, 'wall');
        scene.add(wallGroup);
    }
    cleanupWallTool();
}

function cleanupWallTool() {
    isWallToolActive = false;
    wallPoints = [];
    if (wallPreviewLine) wallPreviewLine.visible = false;
}

// --- Placement Tool (Door/Window) ---
function initPlacementTool(type) {
    currentPlacementType = type;
    const optionsId = type === 'door' ? 'door' : 'window';
    placementObjectDimensions = {
        width: parseFloat(document.getElementById(`${optionsId}WidthInput`)?.value) || 1,
        height: parseFloat(document.getElementById(`${optionsId}HeightInput`)?.value) || 2.1,
        depth: parseFloat(document.getElementById(`${optionsId}DepthInput`)?.value) || 0.15,
    };

    if (!placementHelper) {
        placementHelper = new THREE.Mesh(
            new THREE.BoxGeometry(1, 1, 1),
            new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.6, depthTest: false })
        );
        placementHelper.renderOrder = 991;
        scene.add(placementHelper);
    }
    placementHelper.geometry.dispose();
    placementHelper.geometry = new THREE.BoxGeometry(placementObjectDimensions.width, placementObjectDimensions.height, placementObjectDimensions.depth);
    placementHelper.material.color.set(type === 'door' ? 0x33aa33 : 0x3333aa);
    placementHelper.visible = false;
    renderer.domElement.style.cursor = 'crosshair';
}

function handlePlaceObjectPreview(event) {
    if (!currentPlacementType || !placementHelper) return;
    
    // Raycast against walls only
    const wallMeshes = architecturalElements.filter(el => el.userData.archType === 'wall').flatMap(el => el.isGroup ? el.children : el);
    const intersects = raycaster.intersectObjects(wallMeshes, false);

    if (intersects.length > 0) {
        const intersect = intersects[0];
        placementTargetObject = intersect.object;
        currentPlacementPosition = intersect.point;
        currentPlacementNormal = intersect.face.normal.clone().transformDirection(placementTargetObject.matrixWorld).normalize();

        placementHelper.position.copy(currentPlacementPosition);
        placementHelper.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), currentPlacementNormal);

        const wallBaseY = placementTargetObject.position.y - (placementTargetObject.geometry.parameters.height / 2);
        if (currentPlacementType === 'door') {
            placementHelper.position.y = wallBaseY + (placementObjectDimensions.height / 2);
        } else { // Window
            const sillHeight = parseFloat(document.getElementById('windowSillHeightInput')?.value) || 0.9;
            placementHelper.position.y = wallBaseY + sillHeight + (placementObjectDimensions.height / 2);
        }
        placementHelper.visible = true;
    } else {
        placementHelper.visible = false;
    }
}

function handlePlaceObjectConfirm(event) {
    if (!placementHelper?.visible || !placementTargetObject) return;
    
    const finalGeom = placementHelper.geometry.clone();
    const finalMat = new THREE.MeshStandardMaterial({ color: currentPlacementType === 'door' ? 0x964B00 : 0xADD8E6 });
    const finalMesh = new THREE.Mesh(finalGeom, finalMat);
    finalMesh.position.copy(placementHelper.position);
    finalMesh.quaternion.copy(placementHelper.quaternion);
    finalMesh.name = `${currentPlacementType}_${Date.now()}`;
    
    registerArchitecturalElement(finalMesh, currentPlacementType);
    scene.add(finalMesh);
    
    // Optional: CSG hole cutting would happen here
    if (typeof CSG !== 'undefined' && document.getElementById('cutHolesCheckbox')?.checked) {
        // Find the root wall object to perform the boolean operation on
        let rootWall = placementTargetObject;
        while(rootWall.parent && rootWall.parent.isGroup && rootWall.parent.userData.isArchitectural) {
            rootWall = rootWall.parent;
        }
        // applyBooleanSubtract(rootWall, finalMesh); // This needs careful implementation
    }

    deactivateCurrentArchTool();
}

function cleanupPlacementTool() {
    if (placementHelper) placementHelper.visible = false;
    currentPlacementType = null;
    placementTargetObject = null;
}


// ... (The rest of the architectural tools like Roof, Room, Stairs, Boolean, etc. would follow here)
// ... For brevity, I'll add the main event handlers now, as they are critical.


// =================================================================
// === CENTRAL EVENT HANDLERS & TOOL ROUTING
// =================================================================

/**
 * Main click handler for the canvas. Routes the click to the active tool or selection mode.
 * @param {MouseEvent} event
 */
function handleCanvasClick(event) {
    if (isTransforming) return;

    // Update raycaster with current mouse position
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);

    // 1. Priority: Active Architectural Tool
    if (activeArchTool) {
        switch (activeArchTool) {
            case 'wall': handleWallCreationPoint(event); break;
            case 'door': case 'window': handlePlaceObjectConfirm(event); break;
            case 'roof': handleRoofPlacementPoint(event); break;
            case 'room': handleRoomPlacementPoint(event); break;
            case 'curved-wall': handleCurvedWallPlacementPoint(event); break;
            case 'terrain': handleTerrainPlacement(event); break;
            case 'measure': handleMeasurePoint(event); break;
            case 'stairs': handleStairPlacement(event); break;
            case 'boolean-subtract': handleBooleanClick(event); break;
        }
        return; // Tool handled the click
    }

    // 2. Priority: Modeling Mode Element Selection
    if (isModelingMode) {
        if (isLoopCutMode) {
            handleLoopCutConfirmInternal(event);
        } else {
            onModelingClick(event); // The new multi-selection click handler
        }
        return; // Modeling mode handled the click
    }

    // 3. Fallback: Architectural Element Selection (if not in modeling mode)
    const intersects = raycaster.intersectObjects(architecturalElements, true);
    if (intersects.length > 0) {
        let clickedElement = intersects[0].object;
        // Traverse up to find the root architectural element if it's a group
        while(clickedElement.parent && !clickedElement.userData.isArchitectural) {
            clickedElement = clickedElement.parent;
        }
        if (clickedElement.userData.isArchitectural) {
             const isAdditive = event.shiftKey;
             if (selectedArchElements.includes(clickedElement) && isAdditive) {
                 deselectArchElement(clickedElement);
             } else {
                 selectArchElement(clickedElement, isAdditive);
             }
        }
    } else if (!event.shiftKey) {
        deselectAllArchElements();
    }
}

// ... (The code from Part 2 ends here, around the handleCanvasClick function)

/**
 * Main mouse move handler for the canvas. Routes movement to the active tool for previews.
 * @param {MouseEvent} event
 */
function handleCanvasMouseMove(event) {
    // Only process if a tool is active or in modeling mode for hover effects
    if (!isModelingMode && !activeArchTool && !isLoopCutMode) return;

    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);

    if (activeArchTool) {
        switch (activeArchTool) {
            case 'wall': handleWallPreview(event); break;
            case 'door': case 'window': handlePlaceObjectPreview(event); break;
            case 'roof': handleRoofPreview(event); break;
            case 'room': handleRoomPreview(event); break;
            case 'curved-wall': handleCurvedWallPreview(event); break;
            case 'terrain': handleTerrainPreview(event); break;
            case 'measure': handleMeasurePreview(event); break;
            case 'stairs': handleStairsPreview(event); break;
        }
    } else if (isLoopCutMode) {
        handleLoopCutPreviewInternal(event);
    } else if (splineCreationMode) {
        // handleSplineDrawMove(event); // Add this if you implement spline drawing
    } else if (isModelingMode) {
        onModelingMouseMove(event); // For V/E/F hover highlights
    }
}

// Debounced mouse move for modeling hover highlights to improve performance
function onModelingMouseMove(event) {
    clearTimeout(hoverUpdateTimeout);
    hoverUpdateTimeout = setTimeout(() => {
        if (isTransforming) return;
        resetHighlights(); // Reset previous hover highlights first
        let intersected = false;
        switch (selectionMode) {
            case 'vertex': intersected = highlightVertices(); break;
            case 'edge':   intersected = highlightEdges();   break;
            case 'face':   intersected = highlightFaces();   break;
        }
        renderer.domElement.style.cursor = intersected ? 'pointer' : 'default';
    }, 30); // 30ms debounce time
}


/**
 * Main right-click handler. Typically used to cancel or finish operations.
 * @param {MouseEvent} event
 */
function handleCanvasRightClick(event) {
    event.preventDefault();

    if (activeArchTool) {
        if (activeArchTool === 'wall' && wallPoints.length > 0) finishWall();
        else if (activeArchTool === 'roof' && roofPoints.length > 0) createRoof();
        else if (activeArchTool === 'curved-wall' && curvedWallPoints.length > 0) createCurvedWall();
        else deactivateCurrentArchTool(); // Cancel other tools
    } else if (isLoopCutMode) {
        cancelLoopCut();
    } else if (splineCreationMode) {
        finishSplineDrawing();
    } else if (selectedElements.length > 0) {
        clearSelection();
    } else if (selectedArchElements.length > 0) {
        deselectAllArchElements();
    }
}

/**
 * Main keydown handler for hotkeys.
 * @param {KeyboardEvent} event
 */
function handleModelingKeyDown(event) {
    // Ignore key presses if typing in an input field
    if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') return;

    // Architectural element deletion (works outside modeling mode)
    if ((event.key === 'Delete' || event.key === 'Backspace' || event.key.toLowerCase() === 'x') && selectedArchElements.length > 0) {
        if (!isTransforming) {
            event.preventDefault();
            deleteSelectedArchElements();
            return;
        }
    }
    
    // The rest of the shortcuts are for modeling mode
    if (!isModelingMode || isTransforming) return;
    
    const key = event.key.toUpperCase();
    const ctrl = event.ctrlKey || event.metaKey;
    
    // Tool shortcuts
    switch (key) {
        case 'G': transformControls.setMode('translate'); break;
        case 'R': transformControls.setMode('rotate'); break;
        case 'S': transformControls.setMode('scale'); break;
        case '1': setSelectionMode('vertex'); break;
        case '2': setSelectionMode('edge'); break;
        case '3': setSelectionMode('face'); break;
        case 'E': extrudeSelection(); break;
        case 'I': insetSelectedFaces(); break;
    }
    
    if (ctrl && key === 'B') {
        bevelSelection();
        event.preventDefault();
    }
    
    if (event.key === 'Escape') {
        if (isLoopCutMode) cancelLoopCut();
        else if (activeArchTool) deactivateCurrentArchTool();
        else if (selectedElements.length > 0) clearSelection();
        else if (selectedArchElements.length > 0) deselectAllArchElements();
    }
}


// --- Roof Tool ---
function initRoofTool() {
    roofPoints = [];
    if (!roofPreviewMesh) {
        roofPreviewMesh = new THREE.LineLoop(new THREE.BufferGeometry(), new THREE.LineDashedMaterial({ color: 0x00ffff, dashSize: 0.2, gapSize: 0.1 }));
        roofPreviewMesh.renderOrder = 990;
        scene.add(roofPreviewMesh);
    }
    roofPreviewMesh.visible = false;
    renderer.domElement.style.cursor = 'crosshair';
}
function handleRoofPreview(event) {
    if (roofPoints.length === 0) return;
    const intersection = getGroundPlaneIntersection();
    if (intersection) {
        const currentPoints = [...roofPoints, intersection];
        roofPreviewMesh.geometry.dispose();
        roofPreviewMesh.geometry = new THREE.BufferGeometry().setFromPoints(currentPoints);
        roofPreviewMesh.computeLineDistances();
        roofPreviewMesh.visible = true;
    }
}
function handleRoofPlacementPoint(event) {
    const intersection = getGroundPlaneIntersection();
    if (intersection) roofPoints.push(intersection.clone());
}
function createRoof() {
    if (roofPoints.length < 3) { cleanupRoofTool(); return; }
    
    const roofHeight = parseFloat(document.getElementById('roofHeightInput')?.value) || 2.5;
    const footprintShape = new THREE.Shape(roofPoints.map(p => new THREE.Vector2(p.x, p.z)));
    
    const extrudeSettings = { depth: 0.2, bevelEnabled: false };
    const roofGeometry = new THREE.ExtrudeGeometry(footprintShape, extrudeSettings);
    roofGeometry.rotateX(-Math.PI / 2);
    roofGeometry.translate(0, roofHeight, 0);
    
    const roofMesh = new THREE.Mesh(roofGeometry, new THREE.MeshStandardMaterial({ color: 0x8B4513, side: THREE.DoubleSide }));
    roofMesh.name = "Roof_" + Date.now();
    registerArchitecturalElement(roofMesh, 'roof');
    scene.add(roofMesh);
    cleanupRoofTool();
}
function cleanupRoofTool() {
    roofPoints = [];
    if (roofPreviewMesh) roofPreviewMesh.visible = false;
}

// --- Room Tool ---
function initRoomTool() {
    roomStartPoint = null;
    roomEndPoint = null;
    if (!roomPreviewMesh) {
        roomPreviewMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0.4, wireframe: true }));
        roomPreviewMesh.renderOrder = 990;
        scene.add(roomPreviewMesh);
    }
    roomPreviewMesh.visible = false;
    renderer.domElement.style.cursor = 'crosshair';
}
function handleRoomPreview(event) {
    if (!roomStartPoint) return;
    const intersection = getGroundPlaneIntersection();
    if (intersection) {
        roomEndPoint = intersection;
        const roomHeight = parseFloat(document.getElementById('roomHeightInput')?.value) || 2.5;
        const min = new THREE.Vector3(Math.min(roomStartPoint.x, roomEndPoint.x), 0, Math.min(roomStartPoint.z, roomEndPoint.z));
        const max = new THREE.Vector3(Math.max(roomStartPoint.x, roomEndPoint.x), roomHeight, Math.max(roomStartPoint.z, roomEndPoint.z));
        const size = new THREE.Vector3().subVectors(max, min);
        
        if (size.x > 0.01 && size.z > 0.01) {
            roomPreviewMesh.geometry.dispose();
            roomPreviewMesh.geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
            roomPreviewMesh.position.set(min.x + size.x / 2, size.y / 2, min.z + size.z / 2);
            roomPreviewMesh.visible = true;
        }
    }
}
function handleRoomPlacementPoint(event) {
    const intersection = getGroundPlaneIntersection();
    if (!intersection) return;
    if (!roomStartPoint) {
        roomStartPoint = intersection.clone();
    } else {
        roomEndPoint = intersection.clone();
        createRoom();
        deactivateCurrentArchTool();
    }
}
function createRoom() {
    if (!roomStartPoint || !roomEndPoint) { cleanupRoomTool(); return; }

    const wallHeight = parseFloat(document.getElementById('roomHeightInput')?.value) || 2.5;
    const wallThickness = parseFloat(document.getElementById('roomWallThicknessInput')?.value) || 0.2;
    const addFloor = document.getElementById('roomAddFloorCheckbox')?.checked;
    const addCeiling = document.getElementById('roomAddCeilingCheckbox')?.checked;

    const min = { x: Math.min(roomStartPoint.x, roomEndPoint.x), z: Math.min(roomStartPoint.z, roomEndPoint.z) };
    const max = { x: Math.max(roomStartPoint.x, roomEndPoint.x), z: Math.max(roomStartPoint.z, roomEndPoint.z) };
    const width = max.x - min.x;
    const depth = max.z - min.z;
    
    if (width < 0.1 || depth < 0.1) { cleanupRoomTool(); return; }

    const roomGroup = new THREE.Group();
    roomGroup.name = "Room_" + Date.now();
    const wallMaterial = new THREE.MeshStandardMaterial({ color: 0xcccccc });

    // Create 4 walls
    const wallsData = [
        { w: width, h: wallHeight, d: wallThickness, x: min.x + width / 2, y: wallHeight / 2, z: min.z - wallThickness / 2 },
        { w: width, h: wallHeight, d: wallThickness, x: min.x + width / 2, y: wallHeight / 2, z: max.z + wallThickness / 2 },
        { w: wallThickness, h: wallHeight, d: depth + wallThickness*2, x: min.x - wallThickness / 2, y: wallHeight / 2, z: min.z + depth / 2 },
        { w: wallThickness, h: wallHeight, d: depth + wallThickness*2, x: max.x + wallThickness / 2, y: wallHeight / 2, z: min.z + depth / 2 }
    ];
    wallsData.forEach(data => roomGroup.add(new THREE.Mesh(new THREE.BoxGeometry(data.w, data.h, data.d), wallMaterial.clone()).position.set(data.x, data.y, data.z)));
    
    if (addFloor) {
        const floor = new THREE.Mesh(new THREE.BoxGeometry(width, wallThickness, depth), new THREE.MeshStandardMaterial({ color: 0x888888 }));
        floor.position.set(min.x + width / 2, -wallThickness / 2, min.z + depth / 2);
        roomGroup.add(floor);
    }
    if (addCeiling) {
        const ceiling = new THREE.Mesh(new THREE.BoxGeometry(width, wallThickness, depth), new THREE.MeshStandardMaterial({ color: 0xeeeeee }));
        ceiling.position.set(min.x + width / 2, wallHeight + wallThickness / 2, min.z + depth / 2);
        roomGroup.add(ceiling);
    }
    
    registerArchitecturalElement(roomGroup, 'room');
    scene.add(roomGroup);
}
function cleanupRoomTool() {
    roomStartPoint = roomEndPoint = null;
    if (roomPreviewMesh) roomPreviewMesh.visible = false;
}

// ... Add other architectural tool implementations (CurvedWall, Terrain, Measure, Stairs) here ...

// --- Boolean Tool (CSG) ---
function initBooleanSubtractTool() {
    booleanTargetMesh = null;
    booleanToolMesh = null;
    if (selectedArchElements.length === 1 && selectedArchElements[0].isMesh) {
        booleanTargetMesh = selectedArchElements[0];
        alert("Target mesh selected. Click the second mesh to subtract.");
    } else {
        deselectAllArchElements();
        alert("Click the first mesh (the object to be hollowed).");
    }
    if (controls) controls.enabled = true; // Make sure user can navigate to select
}
function handleBooleanClick(event) {
    const intersects = raycaster.intersectObjects(architecturalElements, true);
    if (intersects.length > 0) {
        let clickedMesh = intersects[0].object;
        while(clickedMesh.parent && !clickedMesh.userData.isArchitectural) {
            clickedMesh = clickedMesh.parent;
        }
        if (clickedMesh.isMesh && clickedMesh.userData.isArchitectural) {
            if (!booleanTargetMesh) {
                booleanTargetMesh = clickedMesh;
                selectArchElement(booleanTargetMesh);
                alert("Target selected. Now click the tool mesh.");
            } else if (!booleanToolMesh && clickedMesh !== booleanTargetMesh) {
                booleanToolMesh = clickedMesh;
                selectArchElement(booleanToolMesh, true);
                applyBooleanSubtract(booleanTargetMesh, booleanToolMesh);
                deactivateCurrentArchTool();
            }
        }
    }
}
function applyBooleanSubtract(targetMesh, toolMesh) {
    if (!targetMesh || !toolMesh) { return; }
    if (typeof CSG === 'undefined') {
        alert("CSG library not loaded. Boolean operations unavailable.");
        return;
    }
    
    targetMesh.updateMatrixWorld(true);
    toolMesh.updateMatrixWorld(true);
    
    const targetCSG = CSG.fromMesh(targetMesh);
    const toolCSG = CSG.fromMesh(toolMesh);
    const resultCSG = targetCSG.subtract(toolCSG);
    const resultMesh = CSG.toMesh(resultCSG, targetMesh.matrix);
    
    resultMesh.material = targetMesh.material;
    resultMesh.name = `${targetMesh.name}_Subtracted`;
    
    // Remove original meshes and add the new one
    scene.remove(targetMesh);
    scene.remove(toolMesh);
    const targetIdx = architecturalElements.indexOf(targetMesh);
    if (targetIdx > -1) architecturalElements.splice(targetIdx, 1);
    const toolIdx = architecturalElements.indexOf(toolMesh);
    if (toolIdx > -1) architecturalElements.splice(toolIdx, 1);
    
    registerArchitecturalElement(resultMesh, 'boolean-result');
    scene.add(resultMesh);
    selectArchElement(resultMesh);
}
function cleanupBooleanToolState() {
    booleanTargetMesh = null;
    booleanToolMesh = null;
}


// --- Inset, Bevel, Bridge (Placeholders/Implementations) ---
function insetSelectedFaces() {
    // MODIFIED: Get selected face indices from the new multi-selection structure
    const selectedFaceIndices = selectedElements
        .filter(elem => elem.type === 'face')
        .map(elem => elem.helper.userData.faceIndex);

    if (selectedFaceIndices.length === 0) { console.warn("Inset: No faces selected."); return; }
    //... The rest of your implementation ...
    alert("Inset Faces tool not fully implemented.");
}
function bevelSelection() {
    // MODIFIED: Get selected edges from the new multi-selection structure
    const selectedEdges = selectedElements
        .filter(elem => elem.type === 'edge')
        .map(elem => elem.helper.userData.indices);
    if (selectedEdges.length === 0) { console.warn("Bevel: No edges selected."); return; }
    //... The rest of your implementation ...
    alert("Bevel tool not fully implemented.");
}
function bridgeEdgeLoops() {
    alert("Bridge Edge Loops tool not implemented.");
}

// --- Modifier System (Placeholders) ---
function updateModifierPanelVisibility() {
    const panel = document.getElementById('modifiers-panel');
    if (panel) panel.style.display = (activeObject && isModelingMode) ? 'block' : 'none';
}
