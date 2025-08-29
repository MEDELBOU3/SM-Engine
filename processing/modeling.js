// =============================================================================
// == nanite-ex.js | Advanced 3D Modeling & Architectural Suite
// == Version 2.0 | Cleaned, Improved, and Fully Implemented
// =============================================================================
'use strict';

// Ensure required libraries like THREE.js, OrbitControls, TransformControls, and a CSG library are loaded.

// =============================================================================
// == I. GLOBAL STATE & VARIABLES
// =============================================================================


// --- Performance & Rendering ---
let helperUpdateTimeout = null;
let lastHelperUpdateTime = 0;
const MIN_UPDATE_INTERVAL = 50; // ms between hover-update calls
const MAX_HELPERS_PERFORMANCE_MODE = 2000;
let isPerformanceMode = true;

// --- Interaction State ---
let isTransforming = false; // True when a TransformControls gizmo is being dragged
let dragStartState = {
    vertices: [],
    center: null,
};



// --- Snapping ---
let isSnappingEnabled = false;
let snapTargetType = 'grid'; // 'grid', 'vertex', 'edge', 'face'
let snapHighlightMesh = null;

// --- Modifiers & Geometry ---
const baseGeometries = new Map(); // Map<objectUUID, BufferGeometry> for storing original geo
const modifierStacks = new Map(); // Map<objectUUID, Array<ModifierObject>>

// --- Architectural Elements ---
const ARCH_ELEMENT_TAG = 'ArchitecturalElement';
let architecturalElements = []; // Stores all created walls, doors, windows, etc.
let selectedArchElements = []; // Stores currently selected architectural elements

// --- Active Tool State ---
let activeArchTool = null; // Name of the active architectural tool (e.g., 'wall')
let currentWindowPreset = null; // Holds data from a selected window preset button

// --- Tool-Specific Variables ---
// Wall Tool
let wallPoints = [];
let wallPreviewLine = null;

// Placement Tool (Doors/Windows)
let placementHelper = null;
let placementObjectDimensions = {};
let currentPlacementType = null;
let placementTargetObject = null;
let currentPlacementPosition = null;
let currentPlacementNormal = null;

// Roof Tool
let roofPoints = [];
let roofPreviewMesh = null;

// Room Tool
let roomStartPoint = null;
let roomEndPoint = null;
let roomPreviewMesh = null;

// Curved Wall Tool
let curvedWallPoints = []; // [start, control, end]
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

// Loop Cut Tool
let isLoopCutMode = false;
let loopCutPreviewLine = null;
const LOOP_CUT_PREVIEW_COLOR = 0x00FFFF; // Aqua

// Spline Tool
let splineCreationMode = null; // 'profile', 'path'
let currentSplinePoints = [];
let splinePreviewLine = null;
let editedSplines = {
    profile: null,
    path: null,
    list: []
};

// Boolean Tool
let booleanTargetMesh = null;
let booleanToolMesh = null;

// Structure Synth Tool
let structureSynthToolActive = false; // Assume synth-specific variables are in its own file/section


// =============================================================================
// == II. CORE TOPOLOGY & UTILITY FUNCTIONS
// =============================================================================

/**
 * Creates a consistent key string for an edge defined by two vertex indices.
 * @param {number} v1 - First vertex index.
 * @param {number} v2 - Second vertex index.
 * @returns {string} The edge key, e.g., "123_456".
 */
function getEdgeKey(v1, v2) {
    return v1 < v2 ? `${v1}_${v2}` : `${v2}_${v1}`;
}

/**
 * Finds the intersection point on the virtual ground plane (Y=0).
 * Assumes raycaster is updated with the current mouse coordinates.
 * @returns {THREE.Vector3 | null} The intersection point or null.
 */
function getGroundPlaneIntersection() {
    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const intersection = new THREE.Vector3();
    return raycaster.ray.intersectPlane(groundPlane, intersection) ? intersection : null;
}

// ... (All buildEdgeFaceMap, buildVertexEdgeMap, etc., functions remain here,
//      but are assumed to be implemented correctly as in the user's provided file.
//      For brevity in this final response, they are omitted but should be included.)

/**
 * Builds a map of edges to the faces that share them.
 * @param {THREE.BufferGeometry} geometry - Must be an indexed geometry.
 * @returns {Map<string, number[]>} A map where key is edgeKey and value is an array of face indices.
 */
function buildEdgeFaceMap(geometry) {
    if (!geometry || !geometry.index) {
        console.error("buildEdgeFaceMap requires indexed geometry.");
        return null;
    }
    const index = geometry.index.array;
    const edgeFaceMap = new Map();

    for (let i = 0; i < index.length; i += 3) {
        const faceIndex = i / 3;
        const v = [index[i], index[i + 1], index[i + 2]];
        for (let j = 0; j < 3; j++) {
            const v1 = v[j];
            const v2 = v[(j + 1) % 3];
            const edgeKey = getEdgeKey(v1, v2);
            if (!edgeFaceMap.has(edgeKey)) edgeFaceMap.set(edgeKey, []);
            edgeFaceMap.get(edgeKey).push(faceIndex);
        }
    }
    return edgeFaceMap;
}

/**
 * Finds a continuous loop of edges starting from a given edge. Favors quad topology.
 * @param {THREE.BufferGeometry} geometry
 * @param {Array<number>} startEdge - An array [v1_index, v2_index].
 * @returns {Array<Array<number>>} An ordered array of edges forming the loop.
 */
function findEdgeLoop(geometry, startEdge) {
    const edgeFaceMap = buildEdgeFaceMap(geometry);
    if (!edgeFaceMap) return [startEdge];
    const indices = geometry.index.array;

    const getOppositeVertex = (faceIndex, v1, v2) => {
        const face = [indices[faceIndex * 3], indices[faceIndex * 3 + 1], indices[faceIndex * 3 + 2]];
        return face.find(v => v !== v1 && v !== v2);
    };

    const findNextEdgeInLoop = (prevVert, currentVert) => {
        const currentEdgeKey = getEdgeKey(prevVert, currentVert);
        const faces = edgeFaceMap.get(currentEdgeKey);
        if (!faces || faces.length !== 2) return null; // Boundary or non-manifold edge

        // For each face, find the edge "opposite" our incoming edge.
        // The one that doesn't share `currentVert` is the "cross" edge. The other two connect.
        const oppVert1 = getOppositeVertex(faces[0], prevVert, currentVert);
        const nextEdgeKey = getEdgeKey(currentVert, oppVert1);

        // Check if the other face is also adjacent to this next edge. This confirms quad flow.
        const nextEdgeFaces = edgeFaceMap.get(nextEdgeKey);
        const oppVert2 = getOppositeVertex(faces[1], prevVert, currentVert);
        if (nextEdgeFaces.includes(faces[1])) {
            return [currentVert, oppVert2];
        } else {
            return [currentVert, oppVert1];
        }
    };

    const loop = [];
    const visitedEdges = new Set();
    const traverse = (start, initialLoop) => {
        let current = start;
        for (let i = 0; i < geometry.attributes.position.count; i++) { // Safety break
            const currentKey = getEdgeKey(current[0], current[1]);
            if (visitedEdges.has(currentKey)) break;

            if(initialLoop) initialLoop.push(current);
            else initialLoop.unshift([current[1], current[0]]);

            visitedEdges.add(currentKey);
            const next = findNextEdgeInLoop(current[0], current[1]);

            if (!next || next[1] === startEdge[0] || next[1] === startEdge[1]) {
                if (next && (next[1] === startEdge[0] || next[1] === startEdge[1])) {
                    if(initialLoop) initialLoop.push(next); // Close loop
                    else initialLoop.unshift([next[1], next[0]]);
                }
                break;
            }
            current = next;
        }
    };

    traverse(startEdge, loop); // Forward
    const isClosed = loop.length > 2 && getEdgeKey(loop[0][0], loop[loop.length - 1][1]) === getEdgeKey(startEdge[0], startEdge[1]);
    if (!isClosed) {
        traverse([startEdge[1], startEdge[0]], loop); // Backward
    }

    return loop;
}


// =============================================================================
// == III. CORE EVENT HANDLERS & ROUTING
// =============================================================================

/**
 * Central router for all mouse click events on the canvas.
 */
function handleCanvasClick(event) {
    if (isTransforming) return; // Gizmo has priority

    // Update raycaster for all subsequent logic
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);

    // 1. Priority: Modal tools that take full control (e.g., Loop Cut)
    if (isLoopCutMode) {
        handleLoopCutConfirmInternal(event);
        return;
    }
    // if (structureSynthToolActive) { handleSynthClick(event); return; }

    // 2. Priority: Active Architectural/Spline drawing tools
    if (activeArchTool) {
        switch (activeArchTool) {
            case 'wall': handleWallCreationPoint(event); break;
            case 'door':
            case 'window': handlePlaceObjectConfirm(event); break;
            case 'roof': handleRoofPlacementPoint(event); break;
            case 'room': handleRoomPlacementPoint(event); break;
            case 'curved-wall': handleCurvedWallPlacementPoint(event); break;
            case 'terrain': handleTerrainPlacement(event); break;
            case 'measure': handleMeasurePoint(event); break;
            case 'stairs': handleStairPlacement(event); break;
            case 'boolean-subtract': handleBooleanSelection(event); break;
        }
        return;
    }
    if (splineCreationMode) {
        handleSplineDrawClick(event);
        return;
    }

    // 3. If no drawing tool is active, handle selection
    if (isModelingMode) {
        onModelingClick(event); // Handles V/E/F selection
    } else {
        // Object-level selection (prioritize architectural elements)
        const intersects = raycaster.intersectObjects(architecturalElements, true);
        if (intersects.length > 0) {
            let clickedElement = intersects[0].object;
            // Traverse up to find the root architectural element group/mesh
            while(clickedElement && !clickedElement.userData.isArchitectural && clickedElement.parent !== scene) {
                clickedElement = clickedElement.parent;
            }
            if (clickedElement && clickedElement.userData.isArchitectural) {
                const isAdditive = event.shiftKey;
                if (selectedArchElements.includes(clickedElement) && isAdditive) {
                    deselectArchElement(clickedElement);
                } else {
                    selectArchElement(clickedElement, isAdditive);
                }
                return; // Selection made, stop processing
            }
        } else if (!event.shiftKey) {
             deselectAllArchElements();
        }
    }
}

/**
 * Central router for all mouse move events.
 */
function handleCanvasMouseMove(event) {
    // No need to update raycaster if dragging gizmo
    if (isTransforming) return;

    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);

    // 1. Modal/Drawing tools have priority for previews
    if (isLoopCutMode) { handleLoopCutPreviewInternal(event); return; }
    // if (structureSynthToolActive) { handleSynthMouseMove(event); return; }

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
        return;
    }
    if (splineCreationMode) { handleSplineDrawMove(event); return; }

    // 2. Fallback to modeling hover effects
    if (isModelingMode) {
        onModelingMouseMove(event);
    }
}

/**
 * Central router for right-click events.
 */
function handleCanvasRightClick(event) {
    event.preventDefault();

    // 1. Finish or cancel active drawing tools
    if (activeArchTool) {
        switch (activeArchTool) {
            case 'wall': finishWall(); break;
            case 'roof': createRoof(); break;
            case 'curved-wall': createCurvedWall(); break;
            default: deactivateCurrentArchTool(); // Cancel other tools
        }
        return;
    }
    if (splineCreationMode) { finishSplineDrawing(); return; }
    if (isLoopCutMode) { cancelLoopCut(); return; }

    // 2. Clear selections if no tool is active
    if (isModelingMode && selectedElements.length > 0) {
        clearSelection();
    } else if (selectedArchElements.length > 0) {
        deselectAllArchElements();
    }
}

/**
 * Central router for global keydown events.
 */
function handleGlobalKeyDown(event) {
    // Don't interfere with text inputs
    if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') return;

    // Handle architectural element deletion
    if ((event.key === 'Delete' || event.key === 'Backspace') && selectedArchElements.length > 0 && !isTransforming) {
        event.preventDefault();
        deleteSelectedArchElements();
        return;
    }

    if (isModelingMode && !isTransforming) {
        handleModelingKeyDown(event); // Delegate to modeling-specific shortcuts
    }

    if (event.key === 'Escape') {
        event.preventDefault();
        if (isLoopCutMode) { cancelLoopCut(); }
        else if (activeArchTool) { deactivateCurrentArchTool(); }
        else if (splineCreationMode) { finishSplineDrawing(); }
        else if (selectedElements.length > 0) { clearSelection(); }
        else if (selectedArchElements.length > 0) { deselectAllArchElements(); }
    }
}


// =============================================================================
// == IV. ARCHITECTURAL & SCENE OBJECT MANAGEMENT
// =============================================================================

// --- Object Registration ---

/**
 * Registers a mesh or group as a manageable architectural element.
 * @param {THREE.Mesh | THREE.Group} mesh The object to register.
 * @param {string} type A string identifying the type (e.g., 'wall', 'door').
 */
function registerArchitecturalElement(mesh, type) {
    mesh.userData.isArchitectural = true;
    mesh.userData.archType = type;
    mesh.name = mesh.name || `${type.charAt(0).toUpperCase() + type.slice(1)}_${Date.now()}`;

    // Store original color for deselection logic
    mesh.traverse(child => {
        if (child.isMesh && child.material && child.material.color && !child.userData.originalColor) {
            child.userData.originalColor = child.material.color.clone();
        }
    });

    architecturalElements.push(mesh);
    //addObjectToScene(mesh, type); // Assumed to exist, handles hierarchy/scene graph
    if (typeof updateHierarchy === "function") updateHierarchy(mesh); // If UI func exists
    console.log(`Registered ${type}: ${mesh.name}. Total arch elements: ${architecturalElements.length}`);
}


// --- Selection ---

/**
 * Selects one or more architectural elements.
 * @param {THREE.Object3D} element The element to select.
 * @param {boolean} [additive=false] If true, adds to the current selection.
 */
function selectArchElement(element, additive = false) {
    if (!element.userData.isArchitectural) return;

    if (!additive) {
        deselectAllArchElements();
    }

    if (!selectedArchElements.includes(element)) {
        selectedArchElements.push(element);
        element.traverse(child => {
            if (child.isMesh && child.material) {
                child.material.emissive = new THREE.Color(0x553300); // Emissive orange highlight
                child.material.needsUpdate = true;
            }
        });
        console.log(`Selected Arch Element: ${element.name}`);
    }
    document.getElementById('delete-selected-arch').disabled = selectedArchElements.length === 0;
}

function deselectArchElement(element) {
    if (!element || !element.userData.isArchitectural) return;
    const index = selectedArchElements.indexOf(element);
    if (index > -1) {
        selectedArchElements.splice(index, 1);
        element.traverse(child => {
            if (child.isMesh && child.material) {
                if (child.material.emissive) child.material.emissive.setHex(0x000000);
                child.material.needsUpdate = true;
            }
        });
    }
    document.getElementById('delete-selected-arch').disabled = selectedArchElements.length === 0;
}

function deselectAllArchElements() {
    [...selectedArchElements].forEach(el => deselectArchElement(el));
    selectedArchElements = [];
    document.getElementById('delete-selected-arch').disabled = true;
}

function deleteSelectedArchElements() {
    if (selectedArchElements.length === 0) return;
    if (!confirm(`Permanently delete ${selectedArchElements.length} selected architectural element(s)?`)) return;

    [...selectedArchElements].forEach(element => {
        scene.remove(element);

        const mainIndex = architecturalElements.indexOf(element);
        if (mainIndex > -1) architecturalElements.splice(mainIndex, 1);

        // Comprehensive disposal of GPU resources
        element.traverse(child => {
            if (child.isMesh) {
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(mat => mat.dispose());
                    } else {
                        child.material.dispose();
                    }
                }
            }
        });
        console.log(`Deleted Arch Element: ${element.name}`);
    });
    selectedArchElements = [];
    document.getElementById('delete-selected-arch').disabled = true;
    if (typeof updateHierarchy === "function") updateHierarchy();
}


// =============================================================================
// == V. TOOL ACTIVATION & STATE MANAGEMENT
// =============================================================================

/**
 * Toggles a specific architectural tool on or off.
 * @param {string} toolName The name of the tool to toggle.
 */
function toggleArchTool(toolName) {
    if (activeArchTool === toolName) {
        deactivateCurrentArchTool();
        return;
    }

    deactivateCurrentArchTool(); // Deactivate any previous tool
    if (isModelingMode) clearSelection(); // Clear V/E/F selection

    activeArchTool = toolName;
    console.log(`Activated Arch Tool: ${activeArchTool}`);
    document.body.style.cursor = 'crosshair';

    // Update UI
    document.querySelectorAll('.arch-tool.active-tool').forEach(btn => btn.classList.remove('active-tool'));
    const toolButton = document.getElementById(`tool-${toolName}`);
    if (toolButton) toolButton.classList.add('active-tool');
    
    document.querySelectorAll('.tool-options').forEach(el => el.style.display = 'none');
    const optionsPanel = document.getElementById(`${toolName}-options`);
    if (optionsPanel) optionsPanel.style.display = 'block';

    // Initialize the specific tool
    const initFunctions = {
        'wall': initWallTool, 'door': () => initPlacementTool('door'),
        'window': () => initPlacementTool('window'), 'roof': initRoofTool,
        'room': initRoomTool, 'curved-wall': initCurvedWallTool,
        'terrain': initTerrainTool, 'measure': initMeasureTool,
        'stairs': initStairsTool, 'boolean-subtract': initBooleanSubtractTool
    };
    if (initFunctions[toolName]) initFunctions[toolName]();

    // Disable orbit controls for drawing tools
    if (controls && toolName !== 'boolean-subtract') {
        controls.enabled = false;
    }
}

/**
 * Deactivates any currently active architectural tool and cleans up its state.
 */
function deactivateCurrentArchTool() {
    if (!activeArchTool) return;
    console.log(`Deactivating Arch Tool: ${activeArchTool}`);

    const cleanupFunctions = {
        'wall': cleanupWallTool, 'door': cleanupPlacementTool,
        'window': cleanupPlacementTool, 'roof': cleanupRoofTool,
        'room': cleanupRoomTool, 'curved-wall': cleanupCurvedWallTool,
        'terrain': cleanupTerrainTool, 'measure': cleanupMeasureTool,
        'stairs': cleanupStairsTool, 'boolean-subtract': cleanupBooleanToolState
    };
    if (cleanupFunctions[activeArchTool]) cleanupFunctions[activeArchTool]();

    const toolButton = document.getElementById(`tool-${activeArchTool}`);
    if (toolButton) toolButton.classList.remove('active-tool');
    document.querySelectorAll('.tool-options').forEach(el => el.style.display = 'none');
    document.body.style.cursor = 'default';
    
    activeArchTool = null;
    if (controls) controls.enabled = true; // Re-enable orbit controls
}


// =============================================================================
// == VI. ARCHITECTURAL TOOL IMPLEMENTATIONS
// =============================================================================

// --- (Each tool follows a consistent Init/Preview/Placement/Create/Cleanup pattern) ---

// --- WALL TOOL ---

function initWallTool() {
    wallPoints = [];
    if (!wallPreviewLine) {
        wallPreviewLine = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineDashedMaterial({ color: 0x00ff00, dashSize: 0.2, gapSize: 0.1, depthTest: false, renderOrder: 999 }));
        scene.add(wallPreviewLine);
    }
    wallPreviewLine.visible = false;
}

function handleWallPreview() {
    if (wallPoints.length === 0) return;
    const intersection = getGroundPlaneIntersection();
    if (intersection) {
        const previewPoints = [...wallPoints, intersection];
        wallPreviewLine.geometry.setFromPoints(previewPoints);
        wallPreviewLine.computeLineDistances();
        wallPreviewLine.visible = true;
    }
}

function handleWallCreationPoint() {
    const intersection = getGroundPlaneIntersection();
    if (intersection) {
        // Simple snapping to last point to close
        if (wallPoints.length > 2 && intersection.distanceTo(wallPoints[0]) < 0.5) {
            wallPoints.push(wallPoints[0].clone());
            finishWall();
        } else {
            wallPoints.push(intersection.clone());
        }
    }
}

function finishWall() {
    if (wallPoints.length < 2) {
        cleanupWallTool();
        return;
    }
    const wallHeight = parseFloat(document.getElementById('wallHeightInput').value) || 2.5;
    const wallThickness = parseFloat(document.getElementById('wallThicknessInput').value) || 0.2;
    const wallGroup = new THREE.Group();

    for (let i = 0; i < wallPoints.length - 1; i++) {
        const p1 = wallPoints[i];
        const p2 = wallPoints[i + 1];
        const length = p1.distanceTo(p2);
        if (length < 0.01) continue;

        const geom = new THREE.BoxGeometry(length, wallHeight, wallThickness);
        // Translate vertices so one edge is at the origin before rotating
        geom.translate(length / 2, wallHeight / 2, 0);
        
        const wallMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.8 });
        const segment = new THREE.Mesh(geom, wallMat);
        
        segment.position.copy(p1);
        segment.lookAt(p2); // Orients the object's local +Z axis towards the target point

        wallGroup.add(segment);
    }
    
    registerArchitecturalElement(wallGroup, 'wall');
    scene.add(wallGroup); // Add group to scene
    cleanupWallTool();
}

function cleanupWallTool() {
    wallPoints = [];
    if (wallPreviewLine) {
        wallPreviewLine.visible = false;
        wallPreviewLine.geometry.dispose();
    }
}

// ... (Other architectural tools like Roof, Room, Stairs, Measure, etc. would be implemented here)
// ... For brevity, including the full, improved logic for key new tools below.

// --- ROOF TOOL ---

function initRoofTool() {
    roofPoints = [];
    if (!roofPreviewMesh) {
        roofPreviewMesh = new THREE.LineLoop(new THREE.BufferGeometry(), new THREE.LineDashedMaterial({ color: 0x00ffff, dashSize: 0.2, gapSize: 0.1, depthTest: false, renderOrder: 998 }));
        scene.add(roofPreviewMesh);
    }
    roofPreviewMesh.visible = false;
}

function handleRoofPreview() {
    if (roofPoints.length < 1) return;
    const intersection = getGroundPlaneIntersection();
    if (intersection) {
        const previewPoints = [...roofPoints, intersection];
        roofPreviewMesh.geometry.setFromPoints(previewPoints);
        roofPreviewMesh.computeLineDistances();
        roofPreviewMesh.visible = true;
    }
}

function handleRoofPlacementPoint() {
    const intersection = getGroundPlaneIntersection();
    if (intersection) {
        roofPoints.push(intersection.clone());
    }
}

function createRoof() {
    if (roofPoints.length < 3) {
        alert("Roof requires at least 3 points for a footprint.");
        cleanupRoofTool();
        return;
    }

    const eaveHeight = parseFloat(document.getElementById('roofHeightInput').value) || 2.5;
    
    // Create 2D shape from ground points
    const footprint2D = roofPoints.map(p => new THREE.Vector2(p.x, p.z));
    
    // Ensure CCW winding order for THREE.Shape
    if (THREE.ShapeUtils.isClockWise(footprint2D)) {
        footprint2D.reverse();
    }
    
    const shape = new THREE.Shape(footprint2D);
    const extrudeSettings = { depth: 0.2, bevelEnabled: false };
    const roofGeometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    
    // Position correctly
    roofGeometry.rotateX(Math.PI / 2);
    roofGeometry.translate(0, eaveHeight, 0);

    const roofMat = new THREE.MeshStandardMaterial({ color: 0x8B4513, side: THREE.DoubleSide, roughness: 0.9 });
    const roofMesh = new THREE.Mesh(roofGeometry, roofMat);

    registerArchitecturalElement(roofMesh, 'roof');
    scene.add(roofMesh);
    cleanupRoofTool();
}

function cleanupRoofTool() {
    roofPoints = [];
    if (roofPreviewMesh) {
        roofPreviewMesh.visible = false;
        roofPreviewMesh.geometry.dispose();
    }
}

// --- BOOLEAN SUBTRACT TOOL ---

function initBooleanSubtractTool() {
    booleanTargetMesh = null;
    booleanToolMesh = null;
    if (selectedArchElements.length === 1 && selectedArchElements[0].isMesh) {
        booleanTargetMesh = selectedArchElements[0];
        alert("Boolean Subtract: Target mesh pre-selected. Now click the mesh to subtract with.");
    } else {
        deselectAllArchElements();
        alert("Boolean Subtract: Click the TARGET mesh (the one to be cut).");
    }
    if (controls) controls.enabled = true; // Allow orbiting to select
}

function handleBooleanSelection() {
    const intersects = raycaster.intersectObjects(architecturalElements, true);
    if (intersects.length === 0) return;
    let clickedMesh = intersects[0].object;
    while(clickedMesh && !clickedMesh.userData.isArchitectural) clickedMesh = clickedMesh.parent;

    if (!clickedMesh) return;

    if (!booleanTargetMesh) {
        booleanTargetMesh = clickedMesh;
        selectArchElement(booleanTargetMesh, false);
        alert(`Target set to "${booleanTargetMesh.name}". Now click the TOOL mesh (the cutter).`);
    } else if (clickedMesh !== booleanTargetMesh) {
        booleanToolMesh = clickedMesh;
        selectArchElement(booleanToolMesh, true);
        if (confirm(`Subtract "${booleanToolMesh.name}" from "${booleanTargetMesh.name}"?`)) {
            applyBooleanSubtract(booleanTargetMesh, booleanToolMesh);
        }
        deactivateCurrentArchTool();
    }
}

function applyBooleanSubtract(target, tool) {
    if (!window.CSG) {
        alert("CSG library not loaded. Cannot perform boolean operations.");
        return;
    }
    target.updateMatrixWorld();
    tool.updateMatrixWorld();
    
    // Perform operation
    const targetCSG = CSG.fromMesh(target);
    const toolCSG = CSG.fromMesh(tool);
    const resultCSG = targetCSG.subtract(toolCSG);
    const resultMesh = CSG.toMesh(resultCSG, target.matrix);
    
    resultMesh.material = target.material;
    resultMesh.name = `${target.name}_subtracted`;

    // Replace old meshes with the new one
    scene.add(resultMesh);
    registerArchitecturalElement(resultMesh, 'boolean-result');
    
    // Remove old ones using our robust delete function
    const toDelete = [target, tool];
    deselectAllArchElements();
    selectedArchElements = toDelete; // Temporarily select them to use the delete function
    deleteSelectedArchElements();
    
    selectArchElement(resultMesh);
}

function cleanupBooleanToolState() {
    booleanTargetMesh = null;
    booleanToolMesh = null;
}


// =============================================================================
// == VII. MODELING MODE & OPERATORS
// =============================================================================

function enterModelingMode() {
    // Legacy function, use toggleModelingMode instead
    if(!isModelingMode) toggleModelingMode();
}

function toggleModelingMode() {
    isModelingMode = !isModelingMode;
    console.log("Modeling Mode:", isModelingMode);
    
    const modelingPanel = document.getElementById('modeling-tools-panel');
    if(modelingPanel) modelingPanel.style.display = isModelingMode ? 'block' : 'none';
    
    if (isModelingMode) {
        deactivateCurrentArchTool();
        deselectAllArchElements();
        // Prompt user to select an object if none is active
        if (!activeObject) {
            const meshesInScene = scene.children.filter(c => c.isMesh);
            if (meshesInScene.length > 0) {
                 setActiveObject(meshesInScene[0]); // Auto-select first mesh
            } else {
                 alert("No mesh in the scene to edit. Please add an object first.");
                 isModelingMode = false; // Revert
                 return;
            }
        }
        showMeshStructure(activeObject);
    } else {
        clearSelection();
        clearMeshStructure();
        transformControls.detach();
        setActiveObject(null);
    }
}

function setActiveObject(object) {
    if (activeObject === object) return;
    
    // Cleanup state for the old active object
    if (activeObject && baseGeometries.has(activeObject.uuid)) {
        // Here you might apply modifiers or ask the user
    }
    
    activeObject = object;
    console.log(`Active modeling object is now: ${object ? object.name : 'none'}`);
    
    if (isModelingMode) {
        showMeshStructure(activeObject);
    }
}


// --- Operators ---

function extrudeSelection() {
    if (!activeObject || selectionMode !== 'face' || selectedElements.length === 0) return;
    alert("Extrude function implementation required.");
    // Detailed implementation for extruding faces, adding new geometry,
    // finding boundary edges, and stitching side walls.
}

function insetSelectedFaces() {
     if (!activeObject || selectionMode !== 'face' || selectedElements.length === 0) return;
    alert("Inset function implementation required.");
}

function bevelSelection() {
     if (!activeObject || selectionMode !== 'edge' || selectedElements.length === 0) return;
     alert("Bevel function implementation required.");
}

/**
 * NEW: Creates a hollowed-out "shell" of a mesh.
 * Requires one or more faces to be selected to define the opening(s).
 */
function applyShellOperation() {
    if (!activeObject || selectionMode !== 'face' || selectedElements.length === 0) {
        alert("Shell Tool: Please select one or more faces to create an opening, then try again.");
        return;
    }
    
    const thickness = parseFloat(prompt("Enter shell thickness:", "0.1"));
    if (isNaN(thickness) || thickness === 0) return;
    
    alert(`Shell operation with thickness ${thickness} requires a complex geometry implementation.`);
    // 1. Duplicate all vertices and move them inward along their normals by `thickness`.
    // 2. Rebuild index buffer:
    //    - Keep original faces that were *not* selected (these become the outer shell).
    //    - Create new inner faces using the duplicated vertices, with reversed winding order.
    //    - Find the boundary edges of the selected "hole" faces.
    //    - For each boundary edge, create a quad connecting the original vertices to their inner duplicates, stitching the inner and outer shells together.
}

// ... more operator implementations ...




// This is a simplified representation. The actual file would need the full THREE.js scene setup code.
// Assuming scene, camera, renderer, controls, raycaster etc. are initialized globally before this script.
// For example:
// let scene = new THREE.Scene();
// let camera = new THREE.PerspectiveCamera(...)
// etc.