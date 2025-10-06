// Add this near the top of your script, after defining global variables
let modelingContextMenu = null; 
//Global variables
let helperUpdateTimeout = null;
let lastHelperUpdateTime = 0;
const MIN_UPDATE_INTERVAL = 50; // ms between updates (Reduced for hover responsiveness)
const MAX_HELPERS = 2000;
let isPerformanceMode = true;

let isTransforming = false;
// ++ Store drag start state ++
let dragStartState = {
    vertices: [],
    center: null
};

let bevelToolState = {
    isActive: false,
    originalGeometryClone: null, // Store clone when tool starts
    selectedEdgeProxies: [] // Store selected proxies for repeated updates
};

// Snapping (ensure these are global if not already)
let isSnappingEnabled = false;
let snapTargetType = 'grid'; // default
let snapHighlightMesh = null; // Will be created later

let architecturalElements = []; // Store all created walls, doors, windows
let selectedArchElements = []; // Store currently selected architectural elements
const ARCH_ELEMENT_TAG = 'ArchitecturalElement'; 


let wallPoints = [];
let wallPreviewLine = null;
let fullWallPath = null; // Added for complete path visualization
let isWallToolActive = false;

let placementTargetObject = null; // The object (e.g., wall segment) the door/window is being placed on
let currentPlacementPosition = null; // Vector3 for the current valid placement point for helper
let currentPlacementNormal = null; // Vector3 for the normal of the surface at placement

let activeArchTool = null;
let booleanTargetMesh = null; // NEW: Stores the first selected mesh for boolean
let booleanToolMesh = null;   // NEW: Stores the second selected mesh

//
let roofPoints = [];
let roofPreviewMesh = null; // For visualizing the roof shape during creation

let roomStartPoint = null;
let roomEndPoint = null;
let roomPreviewMesh = null;

let curvedWallPoints = []; // For 3-point curve (start, control, end)
let curvedWallPreviewLine = null;

let terrainPreviewMesh = null;

let isLoopCutMode = false;
let loopCutPreviewLine = null; // A THREE.Line for preview
const LOOP_CUT_PREVIEW_COLOR = 0x00FFFF;

// NEW: State management for the multi-stage loop cut tool
let loopCutState = null; // null, 'preview', 'sliding'
let loopCutSlideData = {
    startX: 0,              // Initial mouse X position for sliding
    newVertexMap: null,     // Map<new_vert_index, { originalEdge: [u, v] }>
    slideFactor: 0.5,       // The slide position, from 0.0 to 1.0
};

// NEW: State management for the Spin tool
let spinPreviewMesh = null;
let spinAxisLine = null;
let spinPivotPoint = new THREE.Vector3(0, 0, 0);


// NEW: Poly Pen Tool State
let polyPenToolActive = false;
let polyPenCurrentMesh = null;      // The mesh being actively built or added to
let polyPenCurrentChain = [];       // An ordered list of vertex indices for the current face being built
let polyPenPreviewLine = null;      // Visual feedback line from last vertex to cursor
let polyPenPreviewFace = null;      // Visual feedback for the potential face
let polyPenFloatingVertices = null; // A group to hold temporary, unconnected vertices

// NEW: State management for the Spin tool
let spinGizmo = null; 
let spinAxis = new THREE.Vector3(0, 1, 0); // Default rotation axis
let spinPivot = new THREE.Vector3(); // Center point of rotation
let isSpinning = false;
let startRaycastPoint = new THREE.Vector3(); // For drag calculation
let spinAngle = 0; // Current interactive angle
const spinParams = {
    angle: 90, // Default degrees
    steps: 12,
    axis: 'Y' // Default axis ('X', 'Y', or 'Z')
};


function getEdgeKey(v1, v2) {
    // Ensure consistent order for the key (smaller index first)
    return v1 < v2 ? `${v1}_${v2}` : `${v2}_${v1}`;
}

function enterModelingMode() {
    isModelingMode = true;
    setHoverObject(null);             // Clear hover visuals
    canvas.style.cursor = 'default';  // Reset cursor
    transformControls.detach();       // Optionally detach transform controls
}

function isWindingCorrect(a, b, c) {
    const ab = b.clone().sub(a);
    const ac = c.clone().sub(a);
    const normal = new THREE.Vector3().crossVectors(ab, ac);
    return normal.z >= 0; // You can tweak based on view direction or camera
}

// --- CRITICAL: Topology Helper Functions (BASIC IMPLEMENTATIONS - Need Robustness) ---

function buildEdgeFaceMap(geometry) {
    if (!geometry || !geometry.index) {
        console.error("buildEdgeFaceMap requires indexed geometry.");
        return null;
    }
    const index = geometry.index.array;
    const edgeFaceMap = new Map();

    for (let i = 0; i < index.length; i += 3) {
        const faceIndex = i / 3;
        const v0 = index[i];
        const v1 = index[i + 1];
        const v2 = index[i + 2];
        const edges = [[v0, v1], [v1, v2], [v2, v0]];

        for (const edge of edges) {
            if (edge[0] === edge[1]) continue; // Skip degenerate edges
            const edgeKey = getEdgeKey(edge[0], edge[1]);
            let faceList = edgeFaceMap.get(edgeKey);
            if (!faceList) {
                faceList = [];
                edgeFaceMap.set(edgeKey, faceList);
            }
            faceList.push(faceIndex);
        }
    }
    return edgeFaceMap;
}



/**
 * Builds a map where keys are vertex indices and values are Sets
 * containing the edge keys (e.g., "v1_v2") connected to that vertex.
 * Requires indexed geometry.
 * @param {THREE.BufferGeometry} geometry - The indexed buffer geometry.
 * @returns {Map<number, Set<string>> | null} The vertex-to-edges map or null on error.
 */
function buildVertexEdgeMap(geometry) {
    if (!geometry || !geometry.index) {
        console.error("buildVertexEdgeMap requires indexed geometry.");
        return null;
    }
    const index = geometry.index.array;
    const vertexEdgeMap = new Map(); // Map<vertIndex, Set<edgeKeyString>>

    for (let i = 0; i < index.length; i += 3) {
        const v0 = index[i];
        const v1 = index[i + 1];
        const v2 = index[i + 2];
        const vertices = [v0, v1, v2];
        const edges = [[v0, v1], [v1, v2], [v2, v0]];

        for (let j = 0; j < 3; j++) {
            const vert = vertices[j];
            const edge1Indices = edges[j];        // Edge following the vertex in face order
            const edge2Indices = edges[(j + 2) % 3]; // Edge preceding the vertex in face order

            // Ensure the map has an entry for the vertex
            if (!vertexEdgeMap.has(vert)) {
                vertexEdgeMap.set(vert, new Set());
            }
            const edgeSet = vertexEdgeMap.get(vert);

            // Add the keys for both adjacent edges, avoiding degenerate edges
            if (edge1Indices[0] !== edge1Indices[1]) {
                edgeSet.add(getEdgeKey(edge1Indices[0], edge1Indices[1]));
            }
             if (edge2Indices[0] !== edge2Indices[1]) {
                edgeSet.add(getEdgeKey(edge2Indices[0], edge2Indices[1]));
             }
        }
    }
    return vertexEdgeMap;
}
/**
 * Builds a map where keys are vertex indices and values are arrays
 * of face indices that use that vertex. Requires indexed geometry.
 * @param {THREE.BufferGeometry} geometry - The indexed buffer geometry.
 * @returns {Map<number, number[]> | null} The vertex-to-faces map or null on error.
 */
function buildVertexFaceMap(geometry) {
    if (!geometry || !geometry.index) {
        console.error("buildVertexFaceMap requires indexed geometry.");
        return null;
    }
    const index = geometry.index.array;
    const vertexFaceMap = new Map(); // Map<vertIndex, number[]>

    for (let i = 0; i < index.length; i += 3) {
        const faceIndex = i / 3;
        for (let j = 0; j < 3; j++) {
            const vertIndex = index[i + j];
            let faceList = vertexFaceMap.get(vertIndex);
            if (!faceList) {
                faceList = [];
                vertexFaceMap.set(vertIndex, faceList);
            }
            // Only add if not already present (robustness for potential odd geometry)
            if (!faceList.includes(faceIndex)) {
                faceList.push(faceIndex);
            }
        }
    }
    return vertexFaceMap;
}


// ** Placeholder: findEdgeLoop still needs proper graph traversal implementation **
function findEdgeLoop(geometry, startEdgeIndices, edgeFaceMap, vertexEdgeMap, vertexFaceMap) {
    if (!geometry || !geometry.index || !startEdgeIndices || !edgeFaceMap || !vertexEdgeMap || !vertexFaceMap) {
        console.warn("findEdgeLoop: Missing required parameters.");
        return startEdgeIndices ? [startEdgeIndices] : [];
    }

    const positions = geometry.attributes.position;
    const indices = geometry.index.array;
    const loop = [];
    const visitedEdges = new Set();

    const getOtherVerticesInFace = (faceIndex, edgeV1, edgeV2) => {
        const faceVerts = [indices[faceIndex * 3], indices[faceIndex * 3 + 1], indices[faceIndex * 3 + 2]];
        return faceVerts.filter(v => v !== edgeV1 && v !== edgeV2);
    };

    // Function to find the next edge in the loop from a given vertex, exiting an edge
    const findNextEdgeInLoop = (currentV, prevVOfEdge, currentEdgeKey) => {
        const facesOnCurrentEdge = edgeFaceMap.get(currentEdgeKey);
        if (!facesOnCurrentEdge || facesOnCurrentEdge.length === 0) return null; // Boundary or error

        let bestNextEdge = null;

        // Iterate through faces adjacent to the current edge
        for (const faceIndex of facesOnCurrentEdge) {
            const otherVertsInFace = getOtherVerticesInFace(faceIndex, currentV, prevVOfEdge);
            if (otherVertsInFace.length !== 1) continue; // Should be a triangle if edge is (currentV, prevVOfEdge)
            const oppositeV = otherVertsInFace[0];

            // We are looking for an edge connected to 'currentV' that is NOT currentEdgeKey
            // and ideally forms a quad-like flow with (prevVOfEdge, oppositeV)
            // This means the "next" edge should share a face with (currentV, oppositeV)

            const edgesFromCurrentV = vertexEdgeMap.get(currentV);
            if (!edgesFromCurrentV) continue;

            for (const candidateEdgeKey of edgesFromCurrentV) {
                if (candidateEdgeKey === currentEdgeKey || visitedEdges.has(candidateEdgeKey)) continue;

                const [vC1, vC2] = candidateEdgeKey.split('_').map(Number);
                const nextVInLoop = (vC1 === currentV) ? vC2 : vC1;

                // Check if candidateEdgeKey and edge (currentV, oppositeV) share a face
                // (excluding the current faceIndex we are analyzing)
                const facesOnCandidateEdge = edgeFaceMap.get(candidateEdgeKey);
                const facesOnOppositeConnectingEdge = edgeFaceMap.get(getEdgeKey(currentV, oppositeV));

                if (!facesOnCandidateEdge || !facesOnOppositeConnectingEdge) continue;

                for (const f1 of facesOnCandidateEdge) {
                    if (f1 !== faceIndex && facesOnOppositeConnectingEdge.includes(f1)) {
                        // This candidate edge shares a face with the "opposite connecting edge"
                        // This is a good sign of quad flow.
                        bestNextEdge = [currentV, nextVInLoop]; // Edge is (currentV, nextVInLoop)
                        return bestNextEdge; // Take the first promising one
                    }
                }
            }
        }
        // Fallback: If no clear quad flow, try a simpler "turn" (less robust)
        // This part needs more advanced heuristics for non-quads.
        // For now, we'll stick to the quad-flow-like search.
        return null;
    };


    // --- Traversal ---
    loop.push(startEdgeIndices);
    visitedEdges.add(getEdgeKey(startEdgeIndices[0], startEdgeIndices[1]));

    // Traverse one direction
    let currentEdgeArr = startEdgeIndices;
    for (let i = 0; i < positions.count; i++) { // Safety break
        const nextEdge = findNextEdgeInLoop(currentEdgeArr[1], currentEdgeArr[0], getEdgeKey(currentEdgeArr[0], currentEdgeArr[1]));
        if (nextEdge && !visitedEdges.has(getEdgeKey(nextEdge[0], nextEdge[1]))) {
            if (nextEdge[1] === startEdgeIndices[0]) { // Closed loop
                loop.push(nextEdge);
                visitedEdges.add(getEdgeKey(nextEdge[0], nextEdge[1]));
                console.log("Loop closed forward.");
                return loop;
            }
            loop.push(nextEdge);
            visitedEdges.add(getEdgeKey(nextEdge[0], nextEdge[1]));
            currentEdgeArr = nextEdge;
        } else {
            break;
        }
    }

    // Traverse other direction from start
    currentEdgeArr = [startEdgeIndices[1], startEdgeIndices[0]]; // Reversed start edge
    for (let i = 0; i < positions.count; i++) { // Safety break
        const nextEdge = findNextEdgeInLoop(currentEdgeArr[1], currentEdgeArr[0], getEdgeKey(currentEdgeArr[0], currentEdgeArr[1]));
        if (nextEdge && !visitedEdges.has(getEdgeKey(nextEdge[0], nextEdge[1]))) {
            if (nextEdge[1] === loop[loop.length - 1][1]) { // Met the end of the forward path
                loop.unshift(nextEdge); // Add to beginning
                visitedEdges.add(getEdgeKey(nextEdge[0], nextEdge[1]));
                console.log("Loop closed by meeting forward path.");
                return loop;
            }
            loop.unshift(nextEdge);
            visitedEdges.add(getEdgeKey(nextEdge[0], nextEdge[1]));
            currentEdgeArr = nextEdge;
        } else {
            break;
        }
    }

    console.log("Found loop segments:", loop.length, loop);
    if (loop.length <= 1 && startEdgeIndices) {
         // console.warn("findEdgeLoop did not find a loop path beyond the start edge.");
    }
    return loop; // Might be an open loop if it hits a boundary or complex pole
}



function selectArchElement(element, additive = false) {
    if (!element.userData.isArchitectural) return;

    if (!additive) {
        deselectAllArchElements();
    }

    if (!selectedArchElements.includes(element)) {
        selectedArchElements.push(element);
        element.material.color.set(0xffaa00); // Highlight color (e.g., orange)
        element.material.emissive = new THREE.Color(0x332200); // Slight emissive for highlight
        element.material.needsUpdate = true;
        console.log(`Selected Arch Element: ${element.name || element.uuid} (Type: ${element.userData.archType})`);
    }
    // Update UI or enable delete button if needed
    document.getElementById('delete-selected-arch').disabled = selectedArchElements.length === 0;
}

function deselectArchElement(element) {
    if (!element.userData.isArchitectural) return;

    const index = selectedArchElements.indexOf(element);
    if (index > -1) {
        selectedArchElements.splice(index, 1);
        element.material.color.copy(element.userData.originalColor);
        if (element.material.emissive) element.material.emissive.setHex(0x000000); // Reset emissive
        element.material.needsUpdate = true;
    }
    document.getElementById('delete-selected-arch').disabled = selectedArchElements.length === 0;
}

function deselectAllArchElements() {
    selectedArchElements.forEach(el => {
        el.material.color.copy(el.userData.originalColor);
        if (el.material.emissive) el.material.emissive.setHex(0x000000);
        el.material.needsUpdate = true;
    });
    selectedArchElements = [];
    document.getElementById('delete-selected-arch').disabled = true;
}

function deleteSelectedArchElements() {
    if (selectedArchElements.length === 0) return;

    if (!confirm(`Delete ${selectedArchElements.length} selected architectural element(s)?`)) {
        return;
    }

    selectedArchElements.forEach(element => {
        scene.remove(element);
        if (element.geometry) element.geometry.dispose();
        if (element.material) {
            if (Array.isArray(element.material)) {
                element.material.forEach(m => m.dispose());
            } else {
                element.material.dispose();
            }
        }
        const mainIndex = architecturalElements.indexOf(element);
        if (mainIndex > -1) {
            architecturalElements.splice(mainIndex, 1);
        }
        console.log(`Deleted Arch Element: ${element.name || element.uuid}`);
    });
    selectedArchElements = []; // Clear selection
    document.getElementById('delete-selected-arch').disabled = true;
}

function selectAllArchElementsByType(type) { // type can be 'wall', 'door', 'window', or 'all'
    deselectAllArchElements(); // Start fresh
    architecturalElements.forEach(element => {
        if (type === 'all' || element.userData.archType === type) {
            selectArchElement(element, true); // Additive select
        }
    });
    console.log(`Selected all ${type} elements.`);
}

/**
 * Analyzes an indexed geometry to find pairs of triangles that share an edge
 * and are co-planar, likely forming a quadrilateral.
 * @param {THREE.BufferGeometry} geometry The indexed buffer geometry.
 * @returns {Map<number, number[]>} A map where the key is the face index of the
 *   first triangle in a quad, and the value is an array of the 4 vertex indices
 *   of that quad in order.
 */
function buildQuadMap(geometry) {
    if (!geometry.index) return new Map();

    const edgeFaceMap = buildEdgeFaceMap(geometry);
    const positions = geometry.attributes.position;
    const indices = geometry.index.array;
    const quadMap = new Map();
    const processedFaces = new Set(); // To avoid processing a face twice

    const vA = new THREE.Vector3(), vB = new THREE.Vector3(), vC = new THREE.Vector3();
    const normal1 = new THREE.Vector3(), normal2 = new THREE.Vector3();

    for (let faceIndex1 = 0; faceIndex1 < indices.length / 3; faceIndex1++) {
        if (processedFaces.has(faceIndex1)) continue;

        const tri1_v0 = indices[faceIndex1 * 3 + 0];
        const tri1_v1 = indices[faceIndex1 * 3 + 1];
        const tri1_v2 = indices[faceIndex1 * 3 + 2];
        const tri1_edges = [getEdgeKey(tri1_v0, tri1_v1), getEdgeKey(tri1_v1, tri1_v2), getEdgeKey(tri1_v2, tri1_v0)];

        let foundQuad = false;
        for (const edgeKey of tri1_edges) {
            const adjacentFaces = edgeFaceMap.get(edgeKey);
            if (!adjacentFaces || adjacentFaces.length !== 2) continue; // Must be a shared, non-boundary edge

            const faceIndex2 = adjacentFaces.find(f => f !== faceIndex1);
            if (faceIndex2 === undefined || processedFaces.has(faceIndex2)) continue;

            // Check if they are co-planar
            vA.fromBufferAttribute(positions, tri1_v0);
            vB.fromBufferAttribute(positions, tri1_v1);
            vC.fromBufferAttribute(positions, tri1_v2);
            normal1.crossVectors(vB.clone().sub(vA), vC.clone().sub(vA)).normalize();

            const tri2_v0 = indices[faceIndex2 * 3 + 0];
            const tri2_v1 = indices[faceIndex2 * 3 + 1];
            const tri2_v2 = indices[faceIndex2 * 3 + 2];
            vA.fromBufferAttribute(positions, tri2_v0);
            vB.fromBufferAttribute(positions, tri2_v1);
            vC.fromBufferAttribute(positions, tri2_v2);
            normal2.crossVectors(vB.clone().sub(vA), vC.clone().sub(vA)).normalize();
            
            // If normals are very close (dot product near 1), they are co-planar.
            if (normal1.dot(normal2) > 0.999) {
                // Found a quad! Now find the 4 unique vertices.
                const all_indices = [tri1_v0, tri1_v1, tri1_v2, tri2_v0, tri2_v1, tri2_v2];
                const quad_indices = [...new Set(all_indices)];
                
                if (quad_indices.length === 4) {
                    // Identify the two vertices on the shared edge
                    const [shared_v1, shared_v2] = edgeKey.split('_').map(Number);
                    // Find the two vertices NOT on the shared edge
                    const outer_v1 = [tri1_v0, tri1_v1, tri1_v2].find(v => v !== shared_v1 && v !== shared_v2);
                    const outer_v2 = [tri2_v0, tri2_v1, tri2_v2].find(v => v !== shared_v1 && v !== shared_v2);

                    // Store the quad vertices in a predictable order 
                    // This order is typically important for consistent rendering or further operations.
                    // A common order is to follow the perimeter.
                    // For simply drawing edges, the exact order doesn't matter as much, 
                    // but storing all 4 is important.
                    // Example order: Start at outer_v1, go to shared_v1, then outer_v2, then shared_v2
                    // More robust calculation: trace around the perimeter.
                    // For now, storing them ensures all are present:
                    quadMap.set(faceIndex1, [outer_v1, shared_v1, outer_v2, shared_v2]);
                    
                    processedFaces.add(faceIndex1);
                    processedFaces.add(faceIndex2);
                    foundQuad = true;
                    break; // Move to the next face
                }
            }
        }
        
        if (!foundQuad) {
            // This triangle is not part of a quad, treat it as a standalone tri-face.
            quadMap.set(faceIndex1, [tri1_v0, tri1_v1, tri1_v2]);
            processedFaces.add(faceIndex1);
        }
    }
    return quadMap;
}
// ============================================
// === Central Event Handlers & Tool Routing ===
// ============================================
/*
function handleCanvasClick(event) {
    if (isTransforming) return;

    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);

    // --- TOOL PRIORITY ROUTER ---
    // The order of these checks is critical. Interactive tools come first.

    // 1. Check for the most interactive, multi-stage tools
    if (polyPenToolActive) {
        handlePolyPenClick(event);
        return;
    }
    if (activeArchTool === 'stairs') {
        handleStairPlacement(event);
        return;
    }
    if (structureSynthToolActive) {
        handleSynthClick(event, getGroundPlaneIntersection(), null );
        return;
    }
    if (isLoopCutMode) {
        // The loop cut tool has its own internal click handler, so we don't need code here.
        // This check just prevents other logic from running during loop cut.
        return;
    }

    // 2. Check for other architectural tools that perform an action on click
    if (activeArchTool) {
        switch (activeArchTool) {
            case 'wall':    handleWallCreationPoint(event); break;
            case 'door':
            case 'window':  handlePlaceObjectConfirm(event); break;
            case 'measure': handleMeasurePoint(event); break;
            case 'roof':    handleRoofPlacementPoint(event); break;
            case 'room':    handleRoomPlacementPoint(event); break;
            case 'curved-wall': handleCurvedWallPlacementPoint(event); break;
            case 'terrain': handleTerrainPlacement(event); break;
            case 'boolean-subtract': 
                handleBooleanSelectionClick(event);
                break;
        }
        return; // An active tool handled the click
    }

    // 3. If no tool is active, perform object selection
    if (isModelingMode) {
        if (splineCreationMode) {
            // handleSplineDrawClick(event);
        } else {
            onModelingClick(event); // For selecting vertices, edges, faces
        }
    } else {
        // Architectural element selection (when not in modeling mode)
        const intersects = raycaster.intersectObjects(architecturalElements, true);
        if (intersects.length > 0) {
            let clickedElement = intersects[0].object;
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
                return;
            }
        } else if (!event.shiftKey) {
            deselectAllArchElements();
        }
    }
}

function handleCanvasMouseMove(event) {
    // Determine if any interactive tool is active that needs mouse move updates
    const needsUpdate = activeArchTool || polyPenToolActive || structureSynthToolActive || isLoopCutMode || (isModelingMode && !isTransforming);
    if (!needsUpdate) return;

    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);

    // --- MOUSE MOVE ROUTER (order is important) ---
    if (activeArchTool === 'stairs') {
        handleStairsMouseMove(event);
        return;
    }
    if (polyPenToolActive) {
        handlePolyPenMouseMove(event);
        return;
    }
    if (isLoopCutMode) {
        handleLoopCutPreviewInternal(event);
        return;
    }
    if (structureSynthToolActive) {
        handleSynthMouseMove(event, getGroundPlaneIntersection(), null);
        return;
    }

    // Previews for other arch tools
    if (activeArchTool) {
        switch (activeArchTool) {
            case 'wall': handleWallPreview(event); break;
            case 'door': case 'window': handlePlaceObjectPreview(event); break;
            case 'measure': handleMeasurePreview(event); break;
            case 'roof': handleRoofPreview(event); break;
            case 'room': handleRoomPreview(event); break;
            case 'curved-wall': handleCurvedWallPreview(event); break;
            case 'terrain': handleTerrainPreview(event); break;
        }
        return;
    }
    
    // Fallback to general modeling hover effects
    if (isModelingMode) {
        onModelingMouseMove(event);
    }
}*/


// ============================================
// === Central Event Handlers & Tool Routing ===
// ============================================

function handleCanvasClick(event) {
    if (isTransforming) return;

    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);

    // --- TOOL PRIORITY ROUTER ---

    // 1. Check for the most interactive, multi-stage tools
    if (polyPenToolActive) {
        handlePolyPenClick(event);
        return;
    }
    if (activeArchTool === 'stairs') {
        handleStairPlacement(event);
        return;
    }
    if (structureSynthToolActive) {
        handleSynthClick(event, getGroundPlaneIntersection(), null /* Simplified */);
        return;
    }
    if (isLoopCutMode) {
        // Loop cut handles its own internal listener
        return;
    }

    // 2. Check for other architectural tools that perform an action on click
    if (activeArchTool) {
        switch (activeArchTool) {
            case 'wall':    handleWallCreationPoint(event); break;
            case 'door':
            case 'window':  handlePlaceObjectConfirm(event); break;
            case 'measure': handleMeasurePoint(event); break;
            case 'roof':    handleRoofPlacementPoint(event); break;
            case 'room':    handleRoomPlacementPoint(event); break;
            case 'curved-wall': handleCurvedWallPlacementPoint(event); break;
            case 'terrain': handleTerrainPlacement(event); break;
            case 'boolean-subtract': 
                handleBooleanSelectionClick(event);
                break;
        }
        return; // An active tool handled the click
    }

    // 3. If no tool is active, perform object selection
    if (isModelingMode) {
        if (splineCreationMode) {
            // handleSplineDrawClick(event);
        } else {
            onModelingClick(event); // For selecting vertices, edges, faces
        }
    } else {
        // Architectural element selection (when not in modeling mode)
        const intersects = raycaster.intersectObjects(architecturalElements, true);
        if (intersects.length > 0) {
            let clickedElement = intersects[0].object;
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
                return;
            }
        } else if (!event.shiftKey) {
            deselectAllArchElements();
        }
    }
}

function handleCanvasMouseMove(event) {
    // Determine if any interactive tool is active that needs mouse move updates
    const needsUpdate = activeArchTool || polyPenToolActive || structureSynthToolActive || isLoopCutMode || (isModelingMode && !isTransforming) || isSpinning;
    if (!needsUpdate) return;

    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);

    // --- MOUSE MOVE ROUTER (order is important) ---
    
    // 0. Spin Tool Interaction (highest priority during drag)
    if (isSpinning) { 
        onSpinMove(event);
        return;
    }

    // 1. Interactive Tool Moves
    if (activeArchTool === 'stairs') {
        handleStairsMouseMove(event);
        return;
    }
    if (polyPenToolActive) {
        handlePolyPenMouseMove(event);
        return;
    }
    if (isLoopCutMode) {
        handleLoopCutPreviewInternal(event);
        return;
    }
    if (structureSynthToolActive) {
        handleSynthMouseMove(event, getGroundPlaneIntersection(), null);
        return;
    }

    // 2. Previews for other arch tools
    if (activeArchTool) {
        switch (activeArchTool) {
            case 'wall': handleWallPreview(event); break;
            case 'door': case 'window': handlePlaceObjectPreview(event); break;
            case 'measure': handleMeasurePreview(event); break;
            case 'roof': handleRoofPreview(event); break;
            case 'room': handleRoomPreview(event); break;
            case 'curved-wall': handleCurvedWallPreview(event); break;
            case 'terrain': handleTerrainPreview(event); break;
        }
        return;
    }
    
    // 3. Fallback to general modeling hover effects
    if (isModelingMode) {
        onModelingMouseMove(event);
    }
}


function handleBooleanSelectionClick(event) {
    const intersects = raycaster.intersectObjects(scene.children, true);
    if (intersects.length > 0) {
        let clickedMesh = intersects[0].object;
        while(clickedMesh && !clickedMesh.isMesh && clickedMesh.parent !== scene) {
            clickedMesh = clickedMesh.parent;
        }

        if (clickedMesh && clickedMesh.isMesh) {
            if (!booleanTargetMesh) {
                booleanTargetMesh = clickedMesh;
                deselectAllArchElements();
                selectArchElement(booleanTargetMesh);
                alert("Boolean Subtract: Target selected. Now click the tool mesh.");
            } else if (clickedMesh !== booleanTargetMesh) {
                booleanToolMesh = clickedMesh;
                selectArchElement(booleanToolMesh, true);
                applyBooleanSubtract(booleanTargetMesh, booleanToolMesh);
                deactivateCurrentArchTool();
            }
        }
    }
}

/*function handleCanvasMouseMove(event) {
    if (!isModelingMode && !activeArchTool && !isLoopCutMode && !splineCreationMode) return; // Only update if a tool or mode is active

    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera); // Update raycaster centrally here

    if (activeArchTool) {
        switch (activeArchTool) {
            case 'wall':    handleWallPreview(event); break;
            case 'door':    // Fall-through
            case 'window':  handlePlaceObjectPreview(event); break;
            case 'measure': handleMeasurePreview(event); break;
            case 'stairs':  handleStairsPreview(event); break;
        }
    } else if (isLoopCutMode) {
        handleLoopCutPreviewInternal(event); // Uses its own raycast logic from mouse
    } else if (splineCreationMode) {
        handleSplineDrawMove(event); // Uses its own raycast logic from mouse
    } else if (isModelingMode) { // Only call modeling mouse move if no other tool is active
        onModelingMouseMove(event); // This is the debounced one for V/E/F highlights
    }
}*/

/* 20.08
function handleCanvasRightClick(event) {
    event.preventDefault();

    if (polyPenToolActive) { // ADD THIS BLOCK AT THE TOP
        polyPenCurrentChain = []; // Cancel the current chain
        if(polyPenPreviewLine) polyPenPreviewLine.visible = false;
        if(polyPenPreviewFace) polyPenPreviewFace.visible = false;
        console.log("Poly Pen: Canceled current face chain.");
        return;
    }

     // --- NEW: Delegate to Structure Synth Tool if active ---
    if (structureSynthToolActive) {
        handleSynthRightClick(event);
        return; // Synth tool handles right click
    }

    if (activeArchTool) {
        if (activeArchTool === 'wall' && wallPoints.length > 0) {
            finishWall();
        } else if (activeArchTool === 'roof' && roofPoints.length > 0) { // NEW
            createRoof(); // Finish roof creation
        } else if (activeArchTool === 'curved-wall' && curvedWallPoints.length > 0) { // NEW
            if (curvedWallPoints.length < 3) { // Not enough points, so cancel
                deactivateCurrentArchTool();
            } else {
                createCurvedWall(); // Finish curved wall if 3 points are set
            }
        }
        // For room and terrain, right-click usually cancels the current operation
        // If room points are 0 or 1, or terrain not placed, just deactivate.
        else {
            deactivateCurrentArchTool();
        }
    } else if (isLoopCutMode) {
        cancelLoopCut();
    } else if (splineCreationMode) {
        finishSplineDrawing();
    } else {
        if (isModelingMode && selectedElements.length > 0) {
            clearSelection();
        }
        if (selectedArchElements.length > 0) {
            deselectAllArchElements();
        }
        if (!isModelingMode && selectedArchElements.length === 0 && selectedElements.length === 0){
            // If nothing is selected and not in modeling mode, perhaps a context menu could open here in the future.
            console.log("Right-click: No active tool, no selections.");
        }
    }
}*/ 

/**
 * Handles all right-click events on the canvas within the nanite-ex.js scope.
 * It follows a strict priority order:
 * 1. Cancel any active, multi-stage tool.
 * 2. If no tool is active, show the modeling context menu.
 * 3. As a final fallback, clear any existing selections.
 * @param {MouseEvent} event The contextmenu event.
 *
function handleCanvasRightClick(event) {
    event.preventDefault();

    // --- PRIORITY 1: Cancel any active multi-stage tool ---
    if (polyPenToolActive) {
        polyPenCurrentChain = [];
        if (polyPenPreviewLine) polyPenPreviewLine.visible = false;
        if (polyPenPreviewFace) polyPenPreviewFace.visible = false;
        console.log("Poly Pen: Canceled current face chain.");
        return;
    }
    if (structureSynthToolActive) {
        handleSynthRightClick(event);
        return;
    }

    if (activeArchTool) {
        switch (activeArchTool) {
            // --- PARAMETRIC ARCHITECTURAL TOOLS (New) ---
            case 'parametricWall':
                if (parametricWallToolState.currentPathPoints.length > 0) finishParametricWall();
                else cancelParametricWall();
                break;
            case 'parametricDoor':
            case 'parametricWindow':
                cancelParametricDoorWindowTool();
                break;
            case 'parametricStairs':
                // Finish if enough definition, otherwise cancel
                if (parametricStairsToolState.isActive && parametricStairsToolState.startPoint && parametricStairsToolState.endPoint && parametricStairsToolState.totalHeight >= 0.1) {
                    finishParametricStairs();
                } else {
                    cancelParametricStairs();
                }
                break;
            case 'parametricRoof':
                if (parametricRoofToolState.currentFootprintPoints.length >= 3) finishParametricRoof(); // Finish if enough points
                else cancelParametricRoof(); // Else just cancel
                break;

            // --- Your Existing Basic Architectural Tools (Keep if still used) ---
            case 'wall':    if (wallPoints.length > 0) finishWall(); else deactivateCurrentArchTool(); break;
            case 'door':
            case 'window':  deactivateCurrentArchTool(); break; // Basic Door/Window
            case 'stairs':  cleanupStairsTool(); break; // Basic Stairs
            case 'roof':    if (roofPoints.length > 0) createRoof(); else cleanupRoofTool(); break; // Basic Roof

            // --- Your Other Existing Tools ---
            case 'measure': deactivateCurrentArchTool(); break;
            case 'room':    deactivateCurrentArchTool(); break;
            case 'curved-wall': (curvedWallPoints.length < 3) ? deactivateCurrentArchTool() : createCurvedWall(); break;
            case 'terrain': deactivateCurrentArchTool(); break;
            case 'boolean-subtract': cleanupBooleanToolState(); break;
            // Add other tool cleanups here
        }
        return; // Event handled.
    }

    // --- PRIORITY 2: If no tool was active, show the modeling context menu ---
    if (isModelingMode && !isTransforming) {
        const globalMenu = document.getElementById('context-menu');
        if (globalMenu) globalMenu.style.display = 'none';
        
        showModelingContextMenu(event.clientX, event.clientY);
        return;
    }
    
    // --- PRIORITY 3: As a fallback, clear any existing selections ---
    if (selectedElements.length > 0) {
        clearSelection();
    }
    if (selectedArchElements.length > 0) {
        deselectAllArchElements();
    }
}*/

function handleCanvasRightClick(event) {
    event.preventDefault();

    // --- PRIORITY 1: Cancel any active multi-stage tool ---
    if (polyPenToolActive) {
        polyPenCurrentChain = [];
        if (polyPenPreviewLine) polyPenPreviewLine.visible = false;
        if (polyPenPreviewFace) polyPenPreviewFace.visible = false;
        console.log("Poly Pen: Canceled current face chain.");
        return;
    }
    if (structureSynthToolActive) {
        handleSynthRightClick(event);
        return;
    }
    if (activeArchTool) {
        // If a tool is active, right-click usually means finalize or cancel
        switch (activeArchTool) {
            case 'spin': cleanupSpinTool(); break; // NEW
            case 'wall':    if (wallPoints.length > 0) finishWall(); else deactivateCurrentArchTool(); break;
            case 'door':
            case 'window':  deactivateCurrentArchTool(); break;
            case 'stairs':  cleanupStairsTool(); break; // Cancel stairs
            case 'roof':    if (roofPoints.length > 0) createRoof(); else cleanupRoofTool(); break; 
            case 'room':    deactivateCurrentArchTool(); break;
            case 'curved-wall': (curvedWallPoints.length < 3) ? deactivateCurrentArchTool() : createCurvedWall(); break;
            case 'terrain': deactivateCurrentArchTool(); break;
            case 'boolean-subtract': cleanupBooleanToolState(); break;
        }
        return; // Event handled.
    }
    if (isLoopCutMode) {
        cancelLoopCut();
        return;
    }
    if (splineCreationMode) {
        finishSplineDrawing();
        return;
    }

    // --- PRIORITY 2 & 3: Context Menu or Clear Selection ---
    if (isModelingMode && !isTransforming) {
        const globalMenu = document.getElementById('context-menu');
        if (globalMenu) globalMenu.style.display = 'none';
        
        showModelingContextMenu(event.clientX, event.clientY);
        return;
    }
    
    if (selectedElements.length > 0) {
        clearSelection();
    }
    if (selectedArchElements.length > 0) {
        deselectAllArchElements();
    }
}



// ===========================================
// === Tool Activation / State Management ===
// ===========================================

/** Activates or deactivates an Architecture tool */
function toggleArchTool(toolName) {
    cleanupStructureSynthTool(); // Deactivate synth tool if an arch tool is chosen

    const toolOptionsElement = document.getElementById(`${toolName}-options`);
    const toolButton = document.getElementById(`tool-${toolName}`);

    if (activeArchTool === toolName) {
        deactivateCurrentArchTool(); // This will also call cleanupBooleanToolState()
    } else {
        deactivateCurrentArchTool(); // Deactivate any previous tool
        activeArchTool = toolName;
        console.log(`Activated Arch tool: ${activeArchTool}`);

        document.querySelectorAll('.arch-tool.active-tool').forEach(btn => btn.classList.remove('active-tool'));
        if (toolButton) toolButton.classList.add('active-tool');

        document.querySelectorAll('.tool-options').forEach(el => el.style.display = 'none');
        if (toolOptionsElement) toolOptionsElement.style.display = 'block';

        switch (toolName) {
            case 'wall':    initWallTool(); break;
            case 'door':    initPlacementTool('door'); break;
            case 'window':  initPlacementTool('window'); break; // Window tool will check for currentWindowPreset
            case 'measure': initMeasureTool(); break;
            case 'stairs':  initStairsTool(); break;
            case 'roof':    initRoofTool(); break; // NEW
            case 'room':    initRoomTool(); break; // NEW
            case 'curved-wall': initCurvedWallTool(); break; // NEW
            case 'terrain': initTerrainTool(); break;
            case 'boolean-subtract': initBooleanSubtractTool(); break; // NEW
            case 'poly-pen': initPolyPenTool(); break; 
            case 'spin': initSpinTool(); break;
        }

        if (controls && toolName !== 'boolean-subtract') controls.enabled = false; // Boolean tool needs orbit controls for selection
        else if (controls && toolName === 'boolean-subtract') controls.enabled = true; // Keep controls for selection

        transformControls.detach();
        // For boolean, we don't want to clear existing architectural selections immediately
        if (toolName !== 'boolean-subtract') {
            clearSelection(); // Clear modeling V/E/F selection
            deselectAllArchElements(); // Clear architectural element selection
        } else {
            // For boolean, we might want to keep the current selection as a potential first object
            if (selectedArchElements.length === 1) {
                booleanTargetMesh = selectedArchElements[0];
                alert("Boolean Subtract: Target mesh selected. Now click the tool mesh (the shape to subtract).");
                // Highlight booleanTargetMesh differently if desired
            } else {
                deselectAllArchElements(); // Clear if more or less than 1 is selected
                booleanTargetMesh = null;
                alert("Boolean Subtract: Click the target mesh (the object to be hollowed).");
            }
        }
    }
}


/** Deactivates the currently active Architecture tool */
function deactivateCurrentArchTool() {
    if (!activeArchTool) return;
    console.log(`Deactivating Arch tool: ${activeArchTool}`);

    const toolButton = document.getElementById(`tool-${activeArchTool}`);
    if (toolButton) toolButton.classList.remove('active-tool');

    // Cleanup for the specific tool
    switch (activeArchTool) {
        case 'wall':    cleanupWallTool(); break;
        case 'door':    // Fall-through
        case 'window':  cleanupPlacementTool(); break;
        case 'measure': cleanupMeasureTool(); break;
        case 'stairs':  cleanupStairsTool(); break;
        case 'roof':    cleanupRoofTool(); break; // NEW
        case 'room':    cleanupRoomTool(); break; // NEW
        case 'curved-wall': cleanupCurvedWallTool(); break; // NEW
        case 'terrain': cleanupTerrainTool(); break; // NEW
        case 'boolean-subtract': cleanupBooleanToolState(); break; 
        case 'spin': cleanupSpinTool(); break; // <-- ADD THIS LINE
    }

     if (activeArchTool) {
        // ...
        activeArchTool = null;
        // ...
    }

    // Hide all tool options panels and specific UI elements
    document.querySelectorAll('.tool-options').forEach(el => el.style.display = 'none');
    if (measureDisplayElement) measureDisplayElement.style.display = 'none'; // Specific to measure tool
    // Ensure window presets panel is also hidden if user switches tool (optional)
    // const presetsPanel = document.getElementById('window-presets-panel');
    // if (presetsPanel) presetsPanel.style.display = 'none';


    if (renderer.domElement) renderer.domElement.style.cursor = 'default';
    activeArchTool = null;

    // Re-enable orbit controls if no other interaction mode is active
    if (isModelingMode && !isLocked && !isTransforming && !isLoopCutMode && !splineCreationMode) {
        if (controls) controls.enabled = true;
    }
}

// Helper function to calculate points along a quadratic Bézier curve
function getQuadraticBezierPoints(start, control, end, segments = 20) {
    const points = [];
    for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const x = (1 - t) * (1 - t) * start.x + 2 * (1 - t) * t * control.x + t * t * end.x;
        const y = (1 - t) * (1 - t) * start.y + 2 * (1 - t) * t * control.y + t * t * end.y;
        const z = (1 - t) * (1 - t) * start.z + 2 * (1 - t) * t * control.z + t * t * end.z;
        points.push(new THREE.Vector3(x, y, z));
    }
    return points;
}

// Helper function to calculate points along a cubic Bézier curve
function getCubicBezierPoints(p0, p1, p2, p3, segments = 30) {
    const curve = new THREE.CubicBezierCurve3(p0, p1, p2, p3);
    return curve.getPoints(segments);
}

let curveControlPoints = [];
let isCurveMode = false;
let curveType = 'quadratic'; // 'quadratic' or 'cubic'

function toggleCurveMode() {
    isCurveMode = !isCurveMode;
    console.log(`Curve mode ${isCurveMode ? 'enabled' : 'disabled'}`);
    // You can add visual feedback here (change cursor, UI indicator, etc.)
}

/*function initWallTool() {
    wallPoints = [];
    if (!wallPreviewLine) {
        wallPreviewLine = new THREE.LineSegments( // Use LineSegments for a dashed look if desired
            new THREE.BufferGeometry(),
            new THREE.LineDashedMaterial({
                color: 0x00ff00, linewidth: 1, scale: 1, dashSize: 0.2, gapSize: 0.1, depthTest: false
            })
        );
        wallPreviewLine.renderOrder = 990;
        scene.add(wallPreviewLine);
    }
    wallPreviewLine.geometry.setFromPoints([]); // Clear old points
    wallPreviewLine.visible = true; // Start visible, may hide in preview if no points
    console.log("Wall tool initialized. Click to place first point.");
    if(controls) controls.enabled = false;
    renderer.domElement.style.cursor = 'crosshair';
}*/

function initWallTool() {
    wallPoints = [];
    isWallToolActive = true;
    
    // Create preview line (dashed for current segment)
    if (!wallPreviewLine) {
        wallPreviewLine = new THREE.Line(
            new THREE.BufferGeometry(),
            new THREE.LineDashedMaterial({
                color: 0x00ff00,
                dashSize: 0.2,
                gapSize: 0.1,
                linewidth: 2
            })
        );
        wallPreviewLine.renderOrder = 990;
        scene.add(wallPreviewLine);
    }
    
    // Create complete path line (solid)
    if (!fullWallPath) {
        fullWallPath = new THREE.Line(
            new THREE.BufferGeometry(),
            new THREE.LineBasicMaterial({
                color: 0x00ff00,
                linewidth: 2
            })
        );
        fullWallPath.renderOrder = 991;
        scene.add(fullWallPath);
    }
    
    wallPreviewLine.visible = false;
    fullWallPath.visible = false;
    
    if (controls) controls.enabled = false;
    renderer.domElement.style.cursor = 'crosshair';
}

/*
function handleWallPreview(event) {
    if (!isWallToolActive) return;
    
    const intersection = getGroundPlaneIntersection();
    
    // Show preview from first point (if exists) to mouse position
    if (wallPoints.length > 0 && intersection) {
        const points = [...wallPoints, intersection];
        
        wallPreviewLine.geometry.dispose();
        wallPreviewLine.geometry = new THREE.BufferGeometry().setFromPoints(points);
        wallPreviewLine.computeLineDistances();
        wallPreviewLine.visible = true;
    } 
    // Special case: show small segment for first point
    else if (wallPoints.length === 1) {
        const point = wallPoints[0];
        wallPreviewLine.geometry.dispose();
        wallPreviewLine.geometry = new THREE.BufferGeometry().setFromPoints([
            point,
            point.clone().add(new THREE.Vector3(0.01, 0, 0.01))
        ]);
        wallPreviewLine.computeLineDistances();
        wallPreviewLine.visible = true;
    }
    else {
        wallPreviewLine.visible = false;
    }
}

function handleWallPreview(event) {
    if (!isWallToolActive || wallPoints.length === 0) return;
    
    const intersection = getGroundPlaneIntersection();
    if (intersection) {
        // Update current segment preview (from last point to mouse)
        const segmentPoints = [
            wallPoints[wallPoints.length - 1].clone(),
            intersection.clone()
        ];
        
        wallPreviewLine.geometry.dispose();
        wallPreviewLine.geometry = new THREE.BufferGeometry().setFromPoints(segmentPoints);
        wallPreviewLine.computeLineDistances();
        wallPreviewLine.visible = true;
        
        // Update complete path (all points + current mouse position)
        if (wallPoints.length > 1) {
            const allPoints = [...wallPoints, intersection];
            fullWallPath.geometry.dispose();
            fullWallPath.geometry = new THREE.BufferGeometry().setFromPoints(allPoints);
            fullWallPath.visible = true;
        }
    } else {
        wallPreviewLine.visible = false;
        // Show only confirmed points when not intersecting ground
        if (wallPoints.length > 1) {
            fullWallPath.geometry.dispose();
            fullWallPath.geometry = new THREE.BufferGeometry().setFromPoints(wallPoints);
            fullWallPath.visible = true;
        }
    }
}*/ 

function handleWallPreview(event) {
    if (!isWallToolActive || wallPoints.length === 0) return;
    
    const intersection = getGroundPlaneIntersection();
    if (intersection) {
        // Update current segment preview (from last point to mouse)
        const segmentPoints = [
            wallPoints[wallPoints.length - 1].clone(),
            intersection.clone()
        ];
        
        wallPreviewLine.geometry.dispose();
        wallPreviewLine.geometry = new THREE.BufferGeometry().setFromPoints(segmentPoints);
        wallPreviewLine.computeLineDistances();
        wallPreviewLine.visible = true;
        
        // Update complete path (confirmed points only)
        if (wallPoints.length > 1) {
            fullWallPath.geometry.dispose();
            fullWallPath.geometry = new THREE.BufferGeometry().setFromPoints(wallPoints);
            fullWallPath.visible = true;
        }
    } else {
        wallPreviewLine.visible = false;
        // Show only confirmed path if intersection is lost
        if (wallPoints.length > 1 && fullWallPath) {
            fullWallPath.visible = true; 
        }
    }
}
/*
function handleWallCreationPoint(event) {
    if (!isWallToolActive) return;
    
    const intersection = getGroundPlaneIntersection();
    if (intersection) {
        wallPoints.push(intersection.clone());
        
        // Immediately update preview to include new point
        if (wallPoints.length > 1) {
            wallPreviewLine.geometry.dispose();
            wallPreviewLine.geometry = new THREE.BufferGeometry().setFromPoints(wallPoints);
            wallPreviewLine.computeLineDistances();
            wallPreviewLine.visible = true;
        }
    }
}*/ 

/** Utility to find the intersection point on the ground plane (Y=0). */
function getGroundPlaneIntersection() {
    // Ensure raycaster is updated based on current mouse position
    // This should happen right before this function is called in the event handlers
    
    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const intersection = new THREE.Vector3();

    if (raycaster.ray.intersectPlane(groundPlane, intersection)) {
        return intersection;
    } else {
        return null; // Indicate no intersection found
    }
}

function handleWallCreationPoint(event) {
    if (!isWallToolActive) return;
    
    const intersection = getGroundPlaneIntersection();
    if (intersection) {
        wallPoints.push(intersection.clone());
        
        // If first point, ensure the preview is visible (will show small segment via mousemove)
        if (wallPoints.length === 1) {
            // No need to set single dot geometry, handleWallPreview will show the segment
            wallPreviewLine.visible = true; 
        }
    }
}

function updateWallPreview() {
    if (wallPreviewLine && wallPoints.length > 0) {
        // If mouse is also tracked for the next point:
        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);
        const nextPotentialPoint = getGroundPlaneIntersection();
        if (nextPotentialPoint) {
            wallPreviewLine.geometry.setFromPoints([...wallPoints, nextPotentialPoint]);
        } else {
            wallPreviewLine.geometry.setFromPoints(wallPoints);
        }
        wallPreviewLine.geometry.setFromPoints(wallPoints); // Simpler: just show placed points
    }
}

function createWallSegment(p1, p2) {
    wallHeight = parseFloat(document.getElementById('wallHeightInput')?.value) || wallHeight;
    wallThickness = parseFloat(document.getElementById('wallThicknessInput')?.value) || wallThickness;

    const wallLength = p1.distanceTo(p2);
    if (wallLength < 0.01) return;

    const wallGeometry = new THREE.BoxGeometry(wallLength, wallHeight, wallThickness); // X is length, Y is height, Z is thickness
    const wallMaterial = new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.8, metalness: 0.2 });
    const wallMesh = new THREE.Mesh(wallGeometry, wallMaterial);

    const midPoint = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
    wallMesh.position.set(midPoint.x, wallHeight / 2, midPoint.z);

    const direction = new THREE.Vector3().subVectors(p2, p1); // No normalize for atan2 if using x,z
    const angle = Math.atan2(direction.x, direction.z);
    wallMesh.rotation.y = angle;

    wallMesh.name = "WallSegment";
    scene.add(wallMesh);
    console.log("Created Wall Segment");
}

function finishWall() {
    if (wallPoints.length < 2) {
        console.log("Not enough points to create a wall.");
        cleanupWallTool();
        return;
    }

    // Update dimensions from UI if available
    wallHeight = parseFloat(document.getElementById('wallHeightInput')?.value) || wallHeight;
    wallThickness = parseFloat(document.getElementById('wallThicknessInput')?.value) || wallThickness;

    const wallGroup = new THREE.Group();
    wallGroup.name = "Wall_" + architecturalElements.length; // Unique name

    for (let i = 0; i < wallPoints.length - 1; i++) {
        const p1 = wallPoints[i];
        const p2 = wallPoints[i + 1];
        const length = p1.distanceTo(p2);

        if (length < 0.01) continue; // Skip tiny segments

        const wallSegmentGeom = new THREE.BoxGeometry(wallThickness, wallHeight, length); // X=thickness, Y=height, Z=length
        const wallSegmentMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.7, metalness: 0.1 });
        const wallSegmentMesh = new THREE.Mesh(wallSegmentGeom, wallSegmentMat);

        // Position at midpoint, adjust height, and orient
        wallSegmentMesh.position.copy(p1).lerp(p2, 0.5);
        wallSegmentMesh.position.y = wallHeight / 2;

        const direction = new THREE.Vector3().subVectors(p2, p1).normalize();
        wallSegmentMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1), direction); // Align Z-axis (length) with direction

        wallGroup.add(wallSegmentMesh);
    }

    if (wallGroup.children.length > 0) {
        addObjectToScene(wallGroup, 'wall');
        registerArchitecturalElement(wallGroup, 'wall');
        console.log("Wall created and added to scene:", wallGroup.name);
    } else {
        console.log("No wall segments were valid for creation.");
    }
    cleanupWallTool();
}

/*
function cleanupWallTool() {
    wallPoints = [];
    if (wallPreviewLine) {
        wallPreviewLine.visible = false;
        wallPreviewLine.geometry.dispose();
        wallPreviewLine.geometry = new THREE.BufferGeometry(); // Reset geometry
    }
    // Restore controls if appropriate
    if (!activeArchTool && !isTransforming && !isLoopCutMode && !splineCreationMode) { // Check other states
        if (controls) controls.enabled = true;
    }
    if (renderer.domElement) renderer.domElement.style.cursor = 'default';
}

function cleanupWallTool() {
    isWallToolActive = false;
    wallPoints = [];
    
    if (wallPreviewLine) {
        wallPreviewLine.visible = false;
        wallPreviewLine.geometry.dispose();
    }
    
    if (fullWallPath) {
        fullWallPath.visible = false;
        fullWallPath.geometry.dispose();
    }
    
    if (controls) controls.enabled = true;
    renderer.domElement.style.cursor = 'default';
}*/

function cleanupWallTool() {
    isWallToolActive = false;
    wallPoints = [];
    
    if (wallPreviewLine) {
        wallPreviewLine.visible = false;
        wallPreviewLine.geometry.dispose();
    }
    
    if (controls) controls.enabled = true;
    renderer.domElement.style.cursor = 'default';
}

function activateSplineDrawing(mode) {
    if (!isModelingMode) return;
    deactivateCurrentArchTool(); // Ensure other modes are off
    cancelLoopCut();             // Ensure loop cut is off
    finishSplineDrawing();        // Clear any previous spline points/mode
    cleanupStructureSynthTool(); 

    splineCreationMode = mode;
    currentSplinePoints = [];
    // TODO: Setup splinePreviewLine
    console.log(`Activated Spline Drawing: ${mode}`);
    if (renderer.domElement) renderer.domElement.style.cursor = 'crosshair';
    if(controls) controls.enabled = false;
    transformControls.detach();
    clearSelection();
}

function finishSplineDrawing() {
    // Only create if points exist and mode was active
    if (splineCreationMode) {
        console.log("Finishing Spline Drawing...");
        if (splineCreationMode === 'profile' && currentSplinePoints.length >= 2) { // Allow lines for profiles? Or >= 3 for shape?
            const shape = new THREE.Shape(currentSplinePoints.map(p => new THREE.Vector2(p.x, p.y))); // Assuming drawn on XY
            const name = `Profile_${editedSplines.list.length + 1}`;
            editedSplines.list.push({ name: name, type: 'profile', splineObject: shape });
            editedSplines.profile = shape; // Set as last created?
             console.log(`Created ${name}`);
            // TODO: Update Profile select UI
        } else if (splineCreationMode === 'path' && currentSplinePoints.length >= 2) {
             const curve = new THREE.CatmullRomCurve3(currentSplinePoints);
             const name = `Path_${editedSplines.list.length + 1}`;
             editedSplines.list.push({ name: name, type: 'path', splineObject: curve });
             editedSplines.path = curve; // Set as last created?
            console.log(`Created ${name}`);
            // TODO: Update Path select UI
        }
    }

    splineCreationMode = null;
    currentSplinePoints = [];
    if (renderer && renderer.domElement) renderer.domElement.style.cursor = 'default';
    if (splinePreviewLine) splinePreviewLine.visible = false;

     // Restore standard controls only if appropriate
     if (isModelingMode && !isLocked && !isTransforming && !isLoopCutMode && !activeArchTool) {
        if (controls) controls.enabled = true;
    }
}

let currentPlacementType = null; // 'door' or 'window'
let placementTargetWall = null; // The wall the object is being placed on
let placementPosition = null; // The calculated position on the wall

/**
 * Initializes the placement tool for doors or windows.
 * Creates or updates the placement helper mesh.
 */

function getValidDimension(inputId, defaultValue) {
    const input = document.getElementById(inputId);
    if (!input) {
        // console.warn(`Input element ${inputId} not found. Using default: ${defaultValue}`);
        return defaultValue;
    }
    const value = parseFloat(input.value);
    if (isNaN(value) || value <= 0) {
        // console.warn(`Invalid value for ${inputId}: ${input.value}. Using default: ${defaultValue}`);
        return defaultValue;
    }
    return value;
}


/*function initPlacementTool(type) {
    currentPlacementType = type;
    activeArchTool = type;
    console.log(`Initializing ${type} placement tool.`);

    if (type === 'door') {
        placementObjectDimensions = {
            width: getValidDimension('doorWidthInput', 0.9),
            height: getValidDimension('doorHeightInput', 2.1),
            depth: getValidDimension('doorDepthInput', 0.15)
        };
    } else if (type === 'window') {
        placementObjectDimensions = {
            width: getValidDimension('windowWidthInput', 1.2),
            height: getValidDimension('windowHeightInput', 1.0),
            depth: getValidDimension('windowDepthInput', 0.15)
        };
    }
    // console.log(`${type} dimensions: W ${placementObjectDimensions.width}, H ${placementObjectDimensions.height}, D ${placementObjectDimensions.depth}`);

    if (!placementHelper) {
        const helperGeo = new THREE.BoxGeometry(1, 1, 1); // Initial dummy
        const helperMat = new THREE.MeshBasicMaterial({
            transparent: true,
            opacity: 0.6,
            depthTest: false
        });
        placementHelper = new THREE.Mesh(helperGeo, helperMat);
        placementHelper.renderOrder = 991;
        scene.add(placementHelper); // Add ONCE
        console.log("Placement helper created and added to scene.");
    }

    // Always update existing helper's geometry & material
    placementHelper.geometry.dispose();
    placementHelper.geometry = new THREE.BoxGeometry(
        placementObjectDimensions.width,
        placementObjectDimensions.height,
        placementObjectDimensions.depth
    );
    placementHelper.material.color.set(type === 'door' ? 0x33aa33 : 0x3333aa);
    placementHelper.visible = false; // FIX: Start hidden

    placementTargetObject = null;
    currentPlacementPosition = null;
    currentPlacementNormal = null;

    if (controls) controls.enabled = false;
    if (renderer && renderer.domElement) renderer.domElement.style.cursor = 'crosshair';
    console.log(`${type.charAt(0).toUpperCase() + type.slice(1)} Tool: Hover over a wall to place.`);
}*/

function initPlacementTool(type) {
    currentPlacementType = type;
    activeArchTool = type; // Keep this to ensure tool deactivation works
    console.log(`Initializing ${type} placement tool.`);

    if (type === 'door') {
        placementObjectDimensions = {
            width: getValidDimension('doorWidthInput', 0.9),
            height: getValidDimension('doorHeightInput', 2.1),
            depth: getValidDimension('doorDepthInput', 0.15) // Often wall thickness
        };
    } else if (type === 'window') {
        // Check if a preset is active
        if (currentWindowPreset) {
            console.log("Using window preset:", currentWindowPreset);
            placementObjectDimensions = {
                width: currentWindowPreset.width,
                height: currentWindowPreset.height,
                depth: currentWindowPreset.depth // Often wall thickness
            };
            // Optionally update input fields if they exist for window
            const windowWidthInput = document.getElementById('windowWidthInput');
            const windowHeightInput = document.getElementById('windowHeightInput');
            const windowDepthInput = document.getElementById('windowDepthInput');
            const windowSillHeightInput = document.getElementById('windowSillHeightInput'); // Crucial
            if(windowWidthInput) windowWidthInput.value = currentWindowPreset.width;
            if(windowHeightInput) windowHeightInput.value = currentWindowPreset.height;
            if(windowDepthInput) windowDepthInput.value = currentWindowPreset.depth;
            if(windowSillHeightInput) windowSillHeightInput.value = currentWindowPreset.sill;

            currentWindowPreset = null; // Consume the preset
        } else {
            placementObjectDimensions = {
                width: getValidDimension('windowWidthInput', 1.2),
                height: getValidDimension('windowHeightInput', 1.0),
                depth: getValidDimension('windowDepthInput', 0.15) // Often wall thickness
            };
        }
    }
    // ... (rest of the initPlacementTool function remains the same)
    if (!placementHelper) {
        const helperGeo = new THREE.BoxGeometry(1, 1, 1);
        const helperMat = new THREE.MeshBasicMaterial({
            color: 0x00ff00, transparent: true, opacity: 0.5, depthTest: false
        });
        placementHelper = new THREE.Mesh(helperGeo, helperMat);
        placementHelper.renderOrder = 999; // Ensure it's drawn on top
        scene.add(placementHelper);
    }
    // Update helper geometry and material
    placementHelper.geometry.dispose();
    placementHelper.geometry = new THREE.BoxGeometry(
        placementObjectDimensions.width,
        placementObjectDimensions.height,
        placementObjectDimensions.depth
    );
    placementHelper.material.color.set(type === 'door' ? 0x33aa33 : 0x3333aa); // Green for door, Blue for window
    placementHelper.visible = false;

    placementTargetObject = null;
    currentPlacementPosition = null;
    currentPlacementNormal = null;

    if (controls) controls.enabled = false;
    if (renderer && renderer.domElement) renderer.domElement.style.cursor = 'crosshair';
    console.log(`${type.charAt(0).toUpperCase() + type.slice(1)} Tool: Hover over a wall to place.`);
}

/**
 * Handles the preview of doors or windows on mouse move.
 * Shows a helper mesh on valid wall surfaces.
 *
 * ASSUMES: raycaster has been updated with current mouse coordinates from camera
 *          before this function is called (typically in handleCanvasMouseMove).
 */
function handlePlaceObjectPreview(event) {
    // console.log('MOUSE AT (preview):', mouse.x.toFixed(2), mouse.y.toFixed(2)); // For debugging
    // console.log('ACTIVE TOOL (preview):', activeArchTool);

    if (!activeArchTool || (activeArchTool !== 'door' && activeArchTool !== 'window') || !placementHelper) {
        if (placementHelper) placementHelper.visible = false;
        return;
    }
    // Raycaster should already be updated in handleCanvasMouseMove

    const wallMeshesToIntersect = [];
    architecturalElements.forEach(el => {
        if (el.userData.archType === 'wall') {
            if (el.isGroup) {
                el.children.forEach(childMesh => {
                    if (childMesh.isMesh) wallMeshesToIntersect.push(childMesh);
                });
            } else if (el.isMesh) {
                wallMeshesToIntersect.push(el);
            }
        }
    });
    // console.log('COLLECTED WALL MESHES FOR INTERSECTION:', wallMeshesToIntersect.map(m => m.name || m.uuid));

    if (wallMeshesToIntersect.length === 0) {
        // console.warn("Preview: No wall meshes found to intersect.");
        placementHelper.visible = false; // FIX: Hide if no walls
        placementTargetObject = null;
        currentPlacementPosition = null;
        currentPlacementNormal = null;
        return;
    }

    // console.log('Raycasting against', wallMeshesToIntersect.length, 'wall meshes...');
    const intersects = raycaster.intersectObjects(wallMeshesToIntersect, false);
    // console.log('INTERSECTION RESULTS (preview):', intersects.length, 'hits');

    if (intersects.length > 0) {
        const intersect = intersects[0];
        placementTargetObject = intersect.object;
        currentPlacementPosition = intersect.point.clone();
        currentPlacementNormal = intersect.face.normal.clone().transformDirection(placementTargetObject.matrixWorld).normalize();

        placementHelper.position.copy(currentPlacementPosition);
        const helperLocalFront = new THREE.Vector3(0, 0, 1);
        placementHelper.quaternion.setFromUnitVectors(helperLocalFront, currentPlacementNormal);

        let wallSegmentActualHeight = placementTargetObject.geometry?.parameters?.height || wallHeight;
        const wallBaseY = placementTargetObject.position.y - (wallSegmentActualHeight / 2);

        if (currentPlacementType === 'door') {
            placementHelper.position.y = wallBaseY + (placementObjectDimensions.height / 2);
        } else { // 'window'
            let windowSillHeight = getValidDimension('windowSillHeightInput', 0.9); // Ensure you have this input or a default
            placementHelper.position.y = wallBaseY + windowSillHeight + (placementObjectDimensions.height / 2);
        }
        placementHelper.position.addScaledVector(currentPlacementNormal.clone().negate(), placementObjectDimensions.depth / 2);
        placementHelper.visible = true;
        // console.log("Placement helper visible at:", placementHelper.position.toArray().map(n=>n.toFixed(2)));
    } else {
        placementHelper.visible = false; // FIX: Hide if no intersection
        placementTargetObject = null;
        currentPlacementPosition = null;
        currentPlacementNormal = null;
        // console.log('No hit on wall segments during preview.');
    }
}

/**
 * Confirms the placement of a door or window on mouse click.
 * Creates and adds the actual door/window mesh to the scene.
 */
function handlePlaceObjectConfirm(event) {
    if (!activeArchTool || (activeArchTool !== 'door' && activeArchTool !== 'window') ||
        !placementHelper || !placementHelper.visible || // CRUCIAL: Helper must be visible and valid
        !placementTargetObject || !currentPlacementPosition || !currentPlacementNormal) {
        console.warn("Placement confirm: Invalid state or no valid target for", currentPlacementType,
                     ". Helper visible:", placementHelper ? placementHelper.visible : 'N/A',
                     "Target object:", placementTargetObject ? placementTargetObject.name : 'N/A');
        return; // Exit if placement is not valid
    }

    console.log(`Placing ${currentPlacementType} using helper at (world): P: ${placementHelper.position.toArray().map(n=>n.toFixed(2))}, Q: ${placementHelper.quaternion.toArray().map(n=>n.toFixed(2))}`);

    // 1. Create the final geometry and material
    const finalGeom = new THREE.BoxGeometry(
        placementObjectDimensions.width,
        placementObjectDimensions.height,
        placementObjectDimensions.depth
    );
    const finalMat = new THREE.MeshStandardMaterial({
        color: currentPlacementType === 'door' ? 0x964B00 : 0xADD8E6, // Brown for door, light blue for window
        roughness: 0.7,
        metalness: 0.1
    });
    const finalMesh = new THREE.Mesh(finalGeom, finalMat);

    // 2. Set position and orientation from the placementHelper
    // The helper's state is considered the correct final placement state.
    finalMesh.position.copy(placementHelper.position);
    finalMesh.quaternion.copy(placementHelper.quaternion);

    finalMesh.name = `${currentPlacementType}_${Date.now()}`; // Unique name

    // 3. Add to scene and register it
    scene.add(finalMesh);
    registerArchitecturalElement(finalMesh, currentPlacementType); // Ensure this function correctly adds to `architecturalElements`
    console.log(`${currentPlacementType} "${finalMesh.name}" CREATED and ADDED to scene.`);

    // Optional: Hole Cutting (Requires CSG library and complex logic)
    // if (document.getElementById('cutHolesCheckbox')?.checked) {
    //     console.log("Attempting to cut hole in wall:", placementTargetObject.name, "for", finalMesh.name);
    //     // cutHoleInWall(placementTargetObject, finalMesh);
    // }

    // Deactivate the tool after successful placement
    // To place multiple, you would comment this out and potentially just hide the helper or reset some part of its state.
    deactivateCurrentArchTool();
}

/**
 * Cleans up the placement tool state.
 */
function cleanupPlacementTool() {
    if (placementHelper) {
        placementHelper.visible = false;
        // Optional: Remove helper from scene if not reused often or if it's cheap to recreate
        // scene.remove(placementHelper);
        // placementHelper.geometry.dispose();
        // placementHelper.material.dispose();
        // placementHelper = null;
        console.log("Placement helper visibility set to false.");
    }
    currentPlacementType = null;
    placementTargetObject = null;
    currentPlacementPosition = null;
    currentPlacementNormal = null;

    if (!activeArchTool && !isTransforming && !isLoopCutMode && !splineCreationMode) { // Check other states
        if (controls) controls.enabled = true;
    }
    if (renderer.domElement) renderer.domElement.style.cursor = 'default';
    console.log("Placement tool cleaned up.");
}



// --- Measure Tool ---
function initMeasureTool() {
    console.log("Initializing Measure Tool");
    measurePoints = [];
    if (!measureLine) {
        const lineMaterial = new THREE.LineDashedMaterial({
            color: 0xffaa00, linewidth: 2, scale: 1, dashSize: 0.1, gapSize: 0.05, depthTest: false
        });
        measureLine = new THREE.Line(new THREE.BufferGeometry(), lineMaterial);
        measureLine.renderOrder = 998;
        scene.add(measureLine);
    }
    measureLine.visible = false;

    if (!measureDisplayElement) {
        measureDisplayElement = document.createElement('div');
        measureDisplayElement.id = "measureDisplay";
        Object.assign(measureDisplayElement.style, {
            position: 'absolute', bottom: '20px', left: '20px', padding: '5px 10px',
            backgroundColor: 'rgba(0,0,0,0.7)', color: 'white', borderRadius: '3px',
            fontFamily: 'sans-serif', zIndex: '1000', display: 'none'
        });
        document.body.appendChild(measureDisplayElement);
    }
    measureDisplayElement.style.display = 'block';
    measureDisplayElement.textContent = "Click first point...";
    if (renderer.domElement) renderer.domElement.style.cursor = 'crosshair';
}

function handleMeasurePreview(event) {
    if (measurePoints.length !== 1) {
        if(measureLine) measureLine.visible = false;
        if(measureDisplayElement && measurePoints.length === 0) measureDisplayElement.textContent = "Click first point...";
        return;
    }
    // raycaster updated by handleCanvasMouseMove
    let intersectionPoint = null;
    const targetObjects = scene.children.filter(obj => obj.isMesh && !obj.name.includes("Helper") && obj !== measureLine);
    const intersects = raycaster.intersectObjects(targetObjects, true);

    if (intersects.length > 0) intersectionPoint = intersects[0].point;
    else intersectionPoint = getGroundPlaneIntersection();

    if (intersectionPoint) {
        const points = [measurePoints[0].clone(), intersectionPoint];
        measureLine.geometry.setFromPoints(points);
        measureLine.geometry.computeLineDistances();
        measureLine.geometry.computeBoundingSphere();
        measureLine.visible = true;
        const distance = measurePoints[0].distanceTo(intersectionPoint);
        measureDisplayElement.textContent = `Distance: ${distance.toFixed(3)} m`;
    } else {
        measureLine.visible = false;
        measureDisplayElement.textContent = "Measuring...";
    }
}

function handleMeasurePoint(event) {
    // raycaster updated by handleCanvasClick
    let intersectionPoint = null;
    const targetObjects = scene.children.filter(obj => obj.isMesh && !obj.name.includes("Helper") && obj !== measureLine);
    const intersects = raycaster.intersectObjects(targetObjects, true);

    if (intersects.length > 0) intersectionPoint = intersects[0].point;
    else intersectionPoint = getGroundPlaneIntersection();

    if (!intersectionPoint) return;
    measurePoints.push(intersectionPoint.clone());

    if (measurePoints.length === 1) {
        measureDisplayElement.textContent = "Click second point...";
        measureLine.geometry.setFromPoints([measurePoints[0], measurePoints[0]]); // Anchor preview
        measureLine.visible = true;
    } else if (measurePoints.length === 2) {
        const p1 = measurePoints[0], p2 = measurePoints[1];
        const distance = p1.distanceTo(p2);
        measureLine.geometry.setFromPoints([p1, p2]);
        measureLine.geometry.computeLineDistances();
        measureLine.geometry.computeBoundingSphere();
        measureLine.visible = true;
        measureDisplayElement.textContent = `Final Distance: ${distance.toFixed(3)} m (Click to start new measurement)`;
        console.log(`Measured distance: ${distance}`);
        measurePoints = []; // Reset for next measurement
    }
}

function cleanupMeasureTool() {
    console.log("Cleaning up Measure Tool");
    measurePoints = [];
    if (measureLine) measureLine.visible = false;
    if (measureDisplayElement) measureDisplayElement.style.display = 'none';
    if (renderer.domElement) renderer.domElement.style.cursor = 'default';
}

/*function initStairsTool() {
    stairClickCount = 0;
    stairStartPoint = null;
    stairEndPoint = null;

    if (!stairPreviewObject) {
        const previewMat = new THREE.LineBasicMaterial({ color: 0xff00ff, depthTest: false, depthWrite: false });
        stairPreviewObject = new THREE.Line(new THREE.BufferGeometry(), previewMat);
        stairPreviewObject.renderOrder = 998;
        scene.add(stairPreviewObject);
    }
    stairPreviewObject.geometry.dispose();
    stairPreviewObject.geometry = new THREE.BufferGeometry(); // Clear old points
    stairPreviewObject.visible = false;

    // Update UI input fields with current default values
    const stairWidthInput = document.getElementById('stairWidthInput');
    const stairTotalHeightInput = document.getElementById('stairTotalHeightInput');
    const stairStepHeightInput = document.getElementById('stairStepHeightInput');
    const stairStepDepthInput = document.getElementById('stairStepDepthInput');
    if(stairWidthInput) stairWidthInput.value = stairWidth;
    if(stairTotalHeightInput) stairTotalHeightInput.value = stairTotalHeight;
    if(stairStepHeightInput) stairStepHeightInput.value = stairStepHeight;
    if(stairStepDepthInput) stairStepDepthInput.value = stairStepDepth;


    if(controls) controls.enabled = false;
    renderer.domElement.style.cursor = 'crosshair';
    alert("Stairs Tool: Click to set start point on ground.");
}


function handleStairsPreview(event) { // Called on mouse move
    if (stairClickCount !== 1 || !stairStartPoint || !(stairPreviewObject instanceof THREE.Line)) return;
    // raycaster updated by handleCanvasMouseMove
    const intersection = getGroundPlaneIntersection();
    if (intersection) {
        stairPreviewObject.geometry.dispose();
        stairPreviewObject.geometry = new THREE.BufferGeometry().setFromPoints([stairStartPoint, intersection]);
        stairPreviewObject.visible = true;
    } else {
        stairPreviewObject.visible = false;
    }
}

function handleStairPlacement(event) { // Called on click
    // raycaster updated by handleCanvasClick
    const intersection = getGroundPlaneIntersection();
    if (!intersection) return;

    stairClickCount++;

    if (stairClickCount === 1) {
        stairStartPoint = intersection.clone();
        console.log("Stair start point set:", stairStartPoint.toArray());
        if (stairPreviewObject instanceof THREE.Line) {
            stairPreviewObject.geometry.dispose();
            stairPreviewObject.geometry = new THREE.BufferGeometry().setFromPoints([stairStartPoint, stairStartPoint.clone().add(new THREE.Vector3(0.01,0,0))]); // Tiny segment to show point
            stairPreviewObject.visible = true;
        }
        alert("Stairs Tool: Click to set end point (defines length and direction).");
    } else if (stairClickCount === 2) {
        stairEndPoint = intersection.clone();
        console.log("Stair end point set:", stairEndPoint.toArray());
        createStairs(stairStartPoint, stairEndPoint);
        // Deactivate tool after creation
        deactivateCurrentArchTool(); // This will call cleanupStairsTool
    }
}*/

let stairCurrentIntersection = null;

// ==========================================================
// == NEW ADVANCED 3DS MAX-STYLE STAIRS TOOL (REPLACEMENT) ==
// ==========================================================

function initStairsTool() {
    stairCreationStage = 1; // Start the process
    stairStartPoint = null;
    stairEndPoint = null;
    stairWidth = 1.0;
    stairHeight = 0;

    if (!stairPreviewGroup) {
        stairPreviewGroup = new THREE.Group();
        stairPreviewGroup.name = "StairPreviewGroup";
        scene.add(stairPreviewGroup);
    }
    
    // Wire up UI events
    document.getElementById('stairType').onchange = () => { if (stairCreationStage > 0) createStairPreview(); };
    document.getElementById('stairStepHeightInput').oninput = createStairPreview;
    document.getElementById('stairTreadThicknessInput').oninput = createStairPreview;
    document.getElementById('stairHasRisers').onchange = createStairPreview;
    document.getElementById('stairStepAngleInput').oninput = createStairPreview;
    document.getElementById('stairHasCentralPole').onchange = createStairPreview;
    document.getElementById('stairCentralPoleRadiusInput').oninput = createStairPreview;
    document.getElementById('cancel-stairs-btn').onclick = cleanupStairsTool;
    document.getElementById('finish-stairs-btn').onclick = finishStairsCreation;
    
    if (controls) controls.enabled = false;
    renderer.domElement.style.cursor = 'crosshair';
    updateStairInstructions("Click and drag on the ground to set the stair's length and rotation.");
    console.log("Stairs tool initialized. Stage 1: Define Length/Rotation.");
}


function updateStairPreview() {
    if (stairPreviewActive) {
        createStairPreview();
    }
}



function handleStairsMouseMove(event) {
    if (activeArchTool !== 'stairs' || stairCreationStage === 0) return;

    const intersection = getGroundPlaneIntersection();
    if (!intersection && stairCreationStage < 3) return; // Need ground for first steps

    switch (stairCreationStage) {
        case 1: // Dragging to define Length and Rotation
            if (stairStartPoint) {
                stairEndPoint = intersection.clone();
                createStairPreview();
            }
            break;
        case 2: // Moving mouse to define Width
            if (stairStartPoint && stairEndPoint) {
                const runDirection = new THREE.Vector3().subVectors(stairEndPoint, stairStartPoint);
                const rightDirection = new THREE.Vector3(runDirection.z, 0, -runDirection.x).normalize();
                const mouseOffset = new THREE.Vector3().subVectors(intersection, stairEndPoint);
                stairWidth = Math.abs(mouseOffset.dot(rightDirection) * 2); // Get absolute width
                createStairPreview();
            }
            break;
        case 3: // Moving mouse to define Height
            if (stairStartPoint) {
                const rect = renderer.domElement.getBoundingClientRect();
                const deltaY = (window.innerHeight * 0.75) - event.clientY; // Y mouse movement from lower quarter of screen
                stairHeight = Math.max(0, deltaY * 0.03); // Adjust multiplier for sensitivity
                createStairPreview();
            }
            break;
    }
}

function handleStairPlacement(event) {
    if (activeArchTool !== 'stairs' || stairCreationStage === 0) return;

    const intersection = getGroundPlaneIntersection();
    if (!intersection && stairCreationStage < 3) return;

    switch (stairCreationStage) {
        case 1: // Click to set START or END of length/rotation
            if (!stairStartPoint) { // First click of the drag
                stairStartPoint = intersection.clone();
            } else { // Second click (release) of the drag
                stairEndPoint = intersection.clone();
                if (stairStartPoint.distanceTo(stairEndPoint) < 0.1) { // If it's just a click, not a drag
                    stairStartPoint = null; // Reset
                    return;
                }
                stairCreationStage = 2;
                updateStairInstructions("Move mouse left/right to set width, then click to confirm.");
            }
            break;
        case 2: // Click to confirm Width
            stairCreationStage = 3;
            updateStairInstructions("Move mouse up/down to set height. Click or press Enter to finish.");
            document.getElementById('finish-stairs-btn').style.display = 'inline-block';
            break;
        case 3: // Click to confirm Height and Finish
            finishStairsCreation();
            break;
    }
}

function createStairPreview() {
    // Clear previous preview meshes
    while(stairPreviewGroup.children.length > 0) {
        stairPreviewGroup.remove(stairPreviewGroup.children[0]);
    }
    
    if (!stairStartPoint || !stairEndPoint || stairStartPoint.distanceTo(stairEndPoint) < 0.1) return;

    // --- Get All Parameters from UI ---
    const type = document.getElementById('stairType').value;
    const stepHeight = parseFloat(document.getElementById('stairStepHeightInput').value) || 0.18;
    const treadThickness = parseFloat(document.getElementById('stairTreadThicknessInput').value) || 0.04;
    const hasRisers = document.getElementById('stairHasRisers').checked;
    
    // --- Calculations ---
    const runLength = stairStartPoint.distanceTo(stairEndPoint);
    stairRotation = Math.atan2(stairEndPoint.z - stairStartPoint.z, stairEndPoint.x - stairStartPoint.x);
    if (stepHeight <= 0) return;
    const numSteps = stairHeight > 0 ? Math.max(1, Math.round(stairHeight / stepHeight)) : 0;
    if (numSteps === 0) return;
    
    const actualStepHeight = stairHeight / numSteps;
    const stepDepth = runLength / numSteps;

    // --- Material for Preview ---
    const previewMaterial = new THREE.MeshStandardMaterial({ color: 0x88aaff, transparent: true, opacity: 0.8 });

    // --- Build Geometry based on Type ---
    if (type === 'straight') {
        for (let i = 0; i < numSteps; i++) {
            const tread = new THREE.Mesh(new THREE.BoxGeometry(stairWidth, treadThickness, stepDepth), previewMaterial);
            tread.position.set( (i * stepDepth) + (stepDepth / 2), (i * actualStepHeight) + actualStepHeight - (treadThickness / 2), 0 );
            stairPreviewGroup.add(tread);

            if (hasRisers) {
                const riser = new THREE.Mesh(new THREE.BoxGeometry(stairWidth, actualStepHeight, 0.02), previewMaterial);
                riser.position.set( (i * stepDepth), (i * actualStepHeight) + (actualStepHeight / 2), (stepDepth / 2) - 0.01 );
                stairPreviewGroup.add(riser);
            }
        }
    } else if (type === 'spiral') {
        const stepAngle = THREE.MathUtils.degToRad(parseFloat(document.getElementById('stairStepAngleInput').value) || 25);
        const hasPole = document.getElementById('stairHasCentralPole').checked;
        const poleRadius = parseFloat(document.getElementById('stairCentralPoleRadiusInput').value) || 0.1;
        const innerRadius = hasPole ? poleRadius : 0.01;
        
        for (let i = 0; i < numSteps; i++) {
            const angle = i * stepAngle;
            
            // Create a wedge-shaped step
            const shape = new THREE.Shape();
            shape.moveTo(innerRadius, 0);
            shape.absarc(0, 0, innerRadius, 0, stepAngle, false);
            shape.absarc(0, 0, innerRadius + stairWidth, stepAngle, 0, true);
            shape.closePath();

            const step = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, {depth: treadThickness, bevelEnabled: false}), previewMaterial);
            step.rotation.x = -Math.PI / 2;
            step.position.y = (i + 1) * actualStepHeight - treadThickness;
            step.rotation.z = angle;
            stairPreviewGroup.add(step);
        }
        if (hasPole) {
            const pole = new THREE.Mesh(new THREE.CylinderGeometry(poleRadius, poleRadius, stairHeight, 24), previewMaterial);
            pole.position.y = stairHeight / 2;
            stairPreviewGroup.add(pole);
        }
    }

    // --- Position and Rotate the entire group ---
    stairPreviewGroup.position.copy(stairStartPoint);
    stairPreviewGroup.rotation.y = stairRotation;
}

function finishStairsCreation() {
    if (stairPreviewGroup.children.length === 0) {
        console.warn("Cannot create stairs, preview is empty.");
        cleanupStairsTool();
        return;
    }

    const finalStairs = new THREE.Group();
    const finalMaterial = new THREE.MeshStandardMaterial({ color: 0xD2B48C, roughness: 0.8 });

    stairPreviewGroup.children.forEach(child => {
        const finalPart = new THREE.Mesh(child.geometry.clone(), finalMaterial); // Use one material for simplicity
        finalPart.position.copy(child.position);
        finalPart.quaternion.copy(child.quaternion);
        finalStairs.add(finalPart);
    });

    finalStairs.position.copy(stairPreviewGroup.position);
    finalStairs.rotation.copy(stairPreviewGroup.rotation);
    finalStairs.name = "Stairs_" + Date.now();
    
    scene.add(finalStairs);
    addObjectToScene(finalStairs, finalStairs.name)
    registerArchitecturalElement(finalStairs, 'stairs');

    console.log("Stairs created successfully.");
    cleanupStairsTool();
}

function cleanupStairsTool() {
    stairCreationStage = 0;
    stairStartPoint = null;
    stairEndPoint = null;
    
    if (stairPreviewGroup) {
        while(stairPreviewGroup.children.length > 0) {
            stairPreviewGroup.remove(stairPreviewGroup.children[0]);
        }
    }
    
    // Deactivate tool and clean up UI
    document.getElementById('stairs-options').style.display = 'none';
    document.getElementById('finish-stairs-btn').style.display = 'none';
    const instructions = document.getElementById('stair-instructions');
    if (instructions) instructions.textContent = "";

    if (activeArchTool === 'stairs') activeArchTool = null;
    document.getElementById('tool-stairs').classList.remove('active-tool');
    
    if (renderer.domElement) renderer.domElement.style.cursor = 'default';
    if (controls) controls.enabled = true;
}

// Helper function for user instructions
function updateStairInstructions(message) {
    const el = document.getElementById('stair-instructions');
    if (el) el.textContent = message;
}




/*function createStairs(start, end) {
    // Get values from UI or use defaults
    stairWidth = parseFloat(document.getElementById('stairWidthInput')?.value) || stairWidth;
    stairTotalHeight = parseFloat(document.getElementById('stairTotalHeightInput')?.value) || stairTotalHeight;
    stairStepHeight = parseFloat(document.getElementById('stairStepHeightInput')?.value) || stairStepHeight;
    stairStepDepth = parseFloat(document.getElementById('stairStepDepthInput')?.value) || stairStepDepth;

    if (stairStepHeight <= 0.01 || stairStepDepth <= 0.01 || stairWidth <= 0.01) {
        alert("Stair dimensions (width, step height, step depth) must be positive and greater than a small threshold.");
        return;
    }

    const runLength = start.distanceTo(end);
    if (runLength < stairStepDepth) {
        alert("Stairs run length is too short for even one step.");
        return;
    }

    const numStepsByHeight = Math.floor(stairTotalHeight / stairStepHeight);
    const numStepsByLength = Math.floor(runLength / stairStepDepth);
    const numSteps = Math.min(numStepsByHeight, numStepsByLength);

    if (numSteps < 1) {
        alert("Calculated number of steps is less than 1. Adjust dimensions.");
        return;
    }

    const actualTotalRise = numSteps * stairStepHeight;
    const actualTotalRun = numSteps * stairStepDepth;
    console.log(`Creating ${numSteps} steps. Total Rise: ${actualTotalRise.toFixed(2)}, Total Run: ${actualTotalRun.toFixed(2)}`);

    const stairsGroup = new THREE.Group();
    stairsGroup.name = "Stairs_" + architecturalElements.length;
    const stepMaterial = new THREE.MeshStandardMaterial({ color: 0xA0A0A0, roughness: 0.8, metalness: 0.1 });

    const direction = new THREE.Vector3().subVectors(end, start).normalize();
    const right = new THREE.Vector3().crossVectors(direction, new THREE.Vector3(0,1,0)).normalize().multiplyScalar(stairWidth / 2);


    for (let i = 0; i < numSteps; i++) {
        const stepHeightPos = (i * stairStepHeight) + (stairStepHeight / 2);
        const stepDepthPos = (i * stairStepDepth) + (stairStepDepth / 2);

        const stepCenter = new THREE.Vector3()
            .copy(start)
            .addScaledVector(direction, stepDepthPos)
            .setY(stepHeightPos);

        const stepGeometry = new THREE.BoxGeometry(stairWidth, stairStepHeight, stairStepDepth);
        const stepMesh = new THREE.Mesh(stepGeometry, stepMaterial);
        stepMesh.position.copy(stepCenter);
        stepMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1), direction); // Align step depth with stair direction

        stairsGroup.add(stepMesh);

    }

    if (stairsGroup.children.length > 0) {
        scene.add(stairsGroup); // <<< ADD TO SCENE
        addObjectToScene(stairsGroup, 'Stairs');
        registerArchitecturalElement(stairsGroup, 'stairs');
        console.log("Stairs created and added to scene:", stairsGroup.name);
    }
}*/


/*
function cleanupStairsTool() {
    stairClickCount = 0;
    stairStartPoint = null;
    stairEndPoint = null;
    if (stairPreviewObject) {
        stairPreviewObject.visible = false;
        stairPreviewObject.geometry.dispose();
        stairPreviewObject.geometry = new THREE.BufferGeometry();
    }
    if (!activeArchTool && !isTransforming && !isLoopCutMode && !splineCreationMode) {
        if (controls) controls.enabled = true;
    }
    if (renderer.domElement) renderer.domElement.style.cursor = 'default';
}*/





// =============================
// === IMPLEMENTATIONS (Poly) ===
// =============================
/** Face Extrude Implementation */
function extrudeSelection() {
    console.log("Executing Extrude Selection...");
    if (!activeObject) { console.warn("Extrude: No active object."); return; }

    if (selectedElements.length === 0) { console.warn("Extrude: Nothing selected."); return; }
    if (selectionMode !== 'face') { alert("Extrude currently only supports Face selection."); return; }
    if (!activeObject.geometry?.index || !activeObject.geometry?.attributes.position) {
        console.error("Extrude requires indexed geometry with positions."); return;
    }

    const geometry = activeObject.geometry;
    const positions = geometry.attributes.position;
    const normals = geometry.attributes.normal; // Get normals if they exist
    const uvs = geometry.attributes.uv;       // Get UVs if they exist
    const indices = geometry.index.array;
    const originalVertexCount = positions.count;

    // --- Parameters ---
    const extrudeDistance = 0.3; // Make this interactive later

    // --- Gather Selected Data ---
    const selectedFaceIndices = selectedElements.map(proxy => proxy.userData.faceIndex);
    const facesToRebuild = new Set(selectedFaceIndices);
    const selectedOriginalVertexIndices = new Set(); // All vertices involved in selected faces
    const verticesToDuplicate = new Map(); // Map<originalIndex, { newIndex: number, normalSum: Vector3, uvSum: Vector2, count: number }>

    selectedFaceIndices.forEach(faceIndex => {
        for (let i = 0; i < 3; i++) {
            const vertIndex = indices[faceIndex * 3 + i];
            selectedOriginalVertexIndices.add(vertIndex);
             if (!verticesToDuplicate.has(vertIndex)) {
                  verticesToDuplicate.set(vertIndex, {
                      newIndex: -1, // To be assigned later
                      normalSum: new THREE.Vector3(),
                       uvSum: uvs ? new THREE.Vector2() : null,
                      count: 0
                  });
             }
             // Accumulate normal and UV data for averaging later
             const data = verticesToDuplicate.get(vertIndex);
              if (normals) data.normalSum.fromBufferAttribute(normals, vertIndex); // Just copy for now, averaging could distort sharp edges
              if (uvs && data.uvSum) data.uvSum.fromBufferAttribute(uvs, vertIndex); // Copy original UV
             data.count++; // Count will be 1 unless shared between selected faces
        }
    });

    console.log(`Extruding ${selectedFaceIndices.length} faces involving ${selectedOriginalVertexIndices.size} unique vertices.`);

    // --- Assign New Indices & Finalize Averaged Data (optional) ---
    let nextNewIndex = originalVertexCount;
    verticesToDuplicate.forEach(data => {
        data.newIndex = nextNewIndex++;
         // Simple approach: Don't average normals for extrude, use original vertex normal
         // data.normalSum.divideScalar(data.count).normalize(); // Optional averaging
         // data.uvSum?.divideScalar(data.count); // Optional averaging
     });


    // --- Create New Attribute Buffers ---
    const numNewVerts = verticesToDuplicate.size;
    const finalVertexCount = originalVertexCount + numNewVerts;
    const newPositions = new Float32Array(finalVertexCount * 3);
    const newNormals = normals ? new Float32Array(finalVertexCount * 3) : null;
    const newUVs = uvs ? new Float32Array(finalVertexCount * 2) : null;

    // Copy original data
    newPositions.set(positions.array);
    if (newNormals) newNormals.set(normals.array);
    if (newUVs) newUVs.set(uvs.array);

    // Add new extruded vertices
    const tempPos = new THREE.Vector3();
    const tempNorm = new THREE.Vector3();
    verticesToDuplicate.forEach((data, originalIndex) => {
        const newIndex = data.newIndex;

        // Position: Extrude along original vertex normal
        tempPos.fromBufferAttribute(positions, originalIndex);
        tempNorm.fromBufferAttribute(normals, originalIndex); // Use original normal for direction
        const extrudedPos = tempPos.clone().addScaledVector(tempNorm, extrudeDistance);
        newPositions.set(extrudedPos.toArray(), newIndex * 3);

        // Normal: Keep the original normal for the new vertex
        if (newNormals) {
             newNormals.set(tempNorm.toArray(), newIndex * 3);
        }

        // UV: Keep the original UV
        if (newUVs && uvs) { // Check both exist
             newUVs.set([uvs.getX(originalIndex), uvs.getY(originalIndex)], newIndex * 2);
         }
    });


    // --- Rebuild Index Buffer ---
    const newIndices = [];
    const edgeFaceMap = buildEdgeFaceMap(geometry); // Essential for boundary detection
    if (!edgeFaceMap) { console.error("Failed to build topology map for extrude."); return; }
    const boundaryEdges = new Map(); // Map<edgeKey, {vOrig1, vOrig2, vNew1, vNew2}>

    // Copy unselected faces' indices
    const originalFaceCount = indices.length / 3;
    for (let i = 0; i < originalFaceCount; i++) {
        if (!facesToRebuild.has(i)) {
            newIndices.push(indices[i * 3], indices[i * 3 + 1], indices[i * 3 + 2]);
        }
    }

    // Create new cap faces and find boundary edges
    selectedFaceIndices.forEach(faceIndex => {
        const i0_orig = indices[faceIndex * 3 + 0];
        const i1_orig = indices[faceIndex * 3 + 1];
        const i2_orig = indices[faceIndex * 3 + 2];

        const i0_new = verticesToDuplicate.get(i0_orig).newIndex;
        const i1_new = verticesToDuplicate.get(i1_orig).newIndex;
        const i2_new = verticesToDuplicate.get(i2_orig).newIndex;

        // Add new cap face (same winding as original face)
        newIndices.push(i0_new, i1_new, i2_new);

        // Check edges for boundary status
        const edges = [[i0_orig, i1_orig], [i1_orig, i2_orig], [i2_orig, i0_orig]];
        edges.forEach(edge => {
            const edgeKey = getEdgeKey(edge[0], edge[1]);
            const adjacentFaces = edgeFaceMap.get(edgeKey) || []; // Get faces sharing this edge

            // Edge is on boundary IF NOT ALL adjacent faces are selected for extrusion
            let isBoundary = true;
            if (adjacentFaces.length > 1) { // Need at least 2 faces for an internal edge
                 isBoundary = adjacentFaces.some(adjFaceIdx => !facesToRebuild.has(adjFaceIdx));
             }
            // Also consider open edges (only 1 adjacent face) as boundary
             // isBoundary = isBoundary || adjacentFaces.length === 1;


            if (isBoundary && !boundaryEdges.has(edgeKey)) {
                 // Only add if not already processed
                 boundaryEdges.set(edgeKey, {
                     vOrig1: edge[0],
                     vOrig2: edge[1],
                     vNew1: verticesToDuplicate.get(edge[0]).newIndex,
                     vNew2: verticesToDuplicate.get(edge[1]).newIndex
                 });
            }
        });
    });

    // Create connecting side faces from boundary edges
    boundaryEdges.forEach(edgeData => {
        // Create quad: vOrig1, vOrig2, vNew2, vNew1 (Check winding - might need swap)
         newIndices.push(edgeData.vOrig1, edgeData.vOrig2, edgeData.vNew2); // Triangle 1
         newIndices.push(edgeData.vNew2, edgeData.vNew1, edgeData.vOrig1); // Triangle 2
    });


    // --- Apply New Geometry & Finalize ---
    const newGeometry = new THREE.BufferGeometry();
    newGeometry.setAttribute('position', new THREE.BufferAttribute(newPositions, 3));
    if (newNormals) newGeometry.setAttribute('normal', new THREE.BufferAttribute(newNormals, 3));
    if (newUVs) newGeometry.setAttribute('uv', new THREE.BufferAttribute(newUVs, 2));
    newGeometry.setIndex(newIndices);

    try {
         newGeometry.computeVertexNormals(); // Recalculate normals for potentially better shading on sides
     } catch(e) {
          console.error("Error computing normals after extrude:", e);
     }

    const oldGeometry = geometry;
    activeObject.geometry = newGeometry;
    oldGeometry.dispose(); // Dispose old geometry

    // Update base geometry map if needed
    if (baseGeometries.has(activeObject.uuid)) {
        console.log("Extrude performed on mesh with stored base. Updating base (EXPERIMENTAL).");
        baseGeometries.set(activeObject.uuid, newGeometry.clone());
         document.getElementById('subdivisionLevelsSlider').value = 0; // Reset subdiv slider
    }

    clearSelection(); // Deselect old face proxies
    showMeshStructure(activeObject); // Update helpers
    console.log("Extrude operation successful.");

    // TODO: Optionally select the newly created cap faces
}



// Add others as needed...
/*function setupTransformControls() {
    if (transformControls && controls) {
        // This event fires when starting/ending a transform operation (gizmo drag)
        transformControls.addEventListener('dragging-changed', function(event) {
            isTransforming = event.value;
            if (!isLocked) {
                controls.enabled = !isTransforming;
            }

            if (isTransforming) {
                // ++ Drag started: Capture current state if element selected ++
                if (selectedElements.length > 0 && selectedElements[0].userData.indices) {
                    const selectedElement = selectedElements[0];
                    const geometry = activeObject.geometry;
                    const positions = geometry.attributes.position;
                    const matrixWorld = activeObject.matrixWorld;

                    dragStartState.vertices = selectedElement.userData.indices.map(index =>
                        new THREE.Vector3().fromBufferAttribute(positions, index).applyMatrix4(matrixWorld)
                    );
                    // Use current proxy position as drag start center
                    dragStartState.center = selectedElement.position.clone();
                    console.log("Drag Start State Captured");
                } else {
                     dragStartState.center = null; // Reset if no valid element selected
                     dragStartState.vertices = [];
                }
            } else {
                // Drag ended: Update helpers immediately for accuracy
                if (activeObject) {
                    // Update the 'original' state to reflect the completed transform
                    // This makes subsequent transforms start from the new position
                    if (selectedElements.length > 0 && (selectedElements[0].userData.type === 'edge' || selectedElements[0].userData.type === 'face') ) {
                       captureOriginalState(selectedElements[0]);
                    }
                    showMeshStructure(activeObject); // Update helpers NOW
                }
                dragStartState.center = null; // Reset drag start state
                dragStartState.vertices = [];
                console.log("Drag End. Helpers Updated.");
            }

            console.log("Transform dragging:", isTransforming, "Controls enabled:", controls.enabled);
        });

        // Additional event listener to ensure controls get re-enabled (Good fallback)
        transformControls.addEventListener('mouseUp', function() {
            if (!isLocked && isTransforming) { // Check if it was transforming
                // This block might run after dragging-changed(false), ensure idempotency
                isTransforming = false;
                controls.enabled = true;
                // No need to update helpers here again if dragging-changed handled it.
                console.log("Transform mouseUp - Controls re-enabled");
            } else if (!isLocked) {
                // Ensure controls are enabled if just clicking without dragging
                 controls.enabled = true;
            }
        });
    }

    transformControls.addEventListener('objectChange', handleTransformObjectChange); // Use debounce if needed

    // Setup snap highlight helper
    if (!snapHighlightMesh) {
         snapHighlightMesh = new THREE.Mesh(
            new THREE.SphereGeometry(0.05), // Small sphere or other indicator
             new THREE.MeshBasicMaterial({ color: 0xffff00, depthTest: false, depthWrite: false, transparent: true, opacity: 0.8 })
        );
         snapHighlightMesh.renderOrder = 1000; // Draw on top
         snapHighlightMesh.visible = false;
         scene.add(snapHighlightMesh);
    }
}*/

function setupTransformControls() {
    if (transformControls && controls) {
        transformControls.addEventListener('dragging-changed', function(event) {
            isTransforming = event.value;
            if (!isLocked) {
                controls.enabled = !isTransforming;
            }

            if (isTransforming) {
                // ++ Drag started: Capture current state ++
                dragStartState.allOriginalVerticesMap = new Map(); // Map<vertexIndex, THREE.Vector3 worldPos>
                dragStartState.pivotStartMatrixWorld = new THREE.Matrix4();
                
                const currentObjectBeingTransformed = transformControls.object;
                if (!currentObjectBeingTransformed || selectedElements.length === 0) {
                     console.warn("TransformControls attached without selection or object.");
                     return;
                }

                // Capture the pivot's (or single proxy's) starting transformation
                dragStartState.pivotStartMatrixWorld.copy(currentObjectBeingTransformed.matrixWorld);

                // Collect ALL unique original vertex world positions for all selected elements
                const uniqueAffectedVertexIndices = new Set();
                selectedElements.forEach(proxy => {
                    if (proxy.userData.type === 'vertex') {
                        uniqueAffectedVertexIndices.add(proxy.userData.vertexIndex);
                    } else if (proxy.userData.type === 'edge' || proxy.userData.type === 'face') {
                        proxy.userData.indices.forEach(idx => uniqueAffectedVertexIndices.add(idx));
                    }
                });

                uniqueAffectedVertexIndices.forEach(vertIndex => {
                    const worldPos = new THREE.Vector3().fromBufferAttribute(
                        activeObject.geometry.attributes.position, vertIndex
                    ).applyMatrix4(activeObject.matrixWorld);
                    dragStartState.allOriginalVerticesMap.set(vertIndex, worldPos);
                });

                console.log(`Drag Start State Captured for ${selectedElements.length} elements, affecting ${dragStartState.allOriginalVerticesMap.size} unique vertices.`);
            } else {
                // Drag ended: Update helpers immediately for accuracy
                if (activeObject) {
                    // This will refresh all helpers based on the new geometry state.
                    showMeshStructure(activeObject); 
                }
                // Clear drag start state
                dragStartState.allOriginalVerticesMap.clear();
                dragStartState.pivotStartMatrixWorld.identity();
                console.log("Drag End. Helpers Updated.");
            }

            console.log("Transform dragging:", isTransforming, "Controls enabled:", controls.enabled);
        });

        transformControls.addEventListener('mouseUp', function() {
            if (!isLocked && isTransforming) {
                isTransforming = false;
                controls.enabled = true;
                console.log("Transform mouseUp - Controls re-enabled");
            } else if (!isLocked) {
                controls.enabled = true;
            }
        });
    }

    // The 'objectChange' event for TransformControls
    // This is fired very frequently during dragging, so `updateMeshGeometry` should handle performance.
    transformControls.addEventListener('objectChange', handleTransformObjectChange);

    // Setup snap highlight helper
    if (!snapHighlightMesh) {
         snapHighlightMesh = new THREE.Mesh(
            new THREE.SphereGeometry(0.05),
             new THREE.MeshBasicMaterial({ color: 0xffff00, depthTest: false, depthWrite: false, transparent: true, opacity: 0.8 })
        );
         snapHighlightMesh.renderOrder = 1000;
         snapHighlightMesh.visible = false;
         scene.add(snapHighlightMesh);
    }
}

const handleTransformObjectChange = () => {
    // Only update geometry if actively dragging a selection.
    // Snapping logic can run even when not dragging if `controls.dragging` is false
    // but the `transformControls.object` might still be moving (e.g. from snapping calculation).
    if (transformControls.object && transformControls.dragging) {
        updateMeshGeometry(); // This function will handle single/multi-selection
        if (isSnappingEnabled) {
            applySnapping(transformControls); // Apply snapping after base geometry update
        }
    } else {
        snapHighlightMesh.visible = false;
    }
};
function applySnapping(controls) {
    if (!controls.object) return;

    const obj = controls.object; // The proxy object or the object being transformed
     const mode = controls.getMode(); // 'translate', 'rotate', 'scale'

    // 1. Get the 'Control Point' (e.g., center for translate/scale, maybe a specific point for rotation)
    // For simplicity, we'll snap the object's origin (proxy's position) during translation
     const controlPointWorld = new THREE.Vector3();
     // Get world position directly from the transform control's internal representation or proxy object
     controls.object.getWorldPosition(controlPointWorld);


     // 2. Find potential Snap Target Point based on raycasting from mouse or control point
     let snapToPoint = null;
     snapHighlightMesh.visible = false;

    // Potential targets (exclude self and helpers)
     const targetObjects = scene.children.filter(o => o !== obj && o !== snapHighlightMesh && !o.name.includes("Helper") && o.geometry);

     // Raycast from mouse to find surface/vertex/edge under cursor (more intuitive)
     raycaster.setFromCamera(mouse, camera);
     const intersects = raycaster.intersectObjects(targetObjects, true); // Intersect descendants

    if (intersects.length > 0) {
        const closestIntersect = intersects[0];

        if (snapTargetType === 'vertex') {
             const geometry = closestIntersect.object.geometry;
             const positions = geometry.attributes.position;
             let closestVertexDist = Infinity;
             let closestVertexIndex = -1;

            // Find closest vertex on the intersected face (or whole mesh?)
            if (closestIntersect.face) {
                 const faceIndices = [closestIntersect.face.a, closestIntersect.face.b, closestIntersect.face.c];
                 faceIndices.forEach(index => {
                      const vertexPos = new THREE.Vector3().fromBufferAttribute(positions, index).applyMatrix4(closestIntersect.object.matrixWorld);
                     const dist = closestIntersect.point.distanceToSquared(vertexPos); // Snap point to vertex dist
                     if (dist < closestVertexDist) {
                         closestVertexDist = dist;
                         snapToPoint = vertexPos;
                     }
                 });
            }
            // Fallback: check *all* vertices if no face? Might be slow.

            // Snap Highlight
             if (snapToPoint) {
                 snapHighlightMesh.geometry = snapHighlightMesh.geometry.type !== 'SphereGeometry' ? new THREE.SphereGeometry(0.05) : snapHighlightMesh.geometry;
                 snapHighlightMesh.position.copy(snapToPoint);
                 snapHighlightMesh.visible = true;
            }

        } else if (snapTargetType === 'edge') {
            // Find closest point on the nearest edge of the intersected face
             // Complex calculation - involves projecting point onto line segments
             // Placeholder: Snap to the intersection point on the face for now
              snapToPoint = closestIntersect.point;
              if (snapToPoint) {
                 // Use a different shape for edge snap maybe? Line?
                  snapHighlightMesh.geometry = snapHighlightMesh.geometry.type !== 'BoxGeometry' ? new THREE.BoxGeometry(0.02, 0.02, 0.2) : snapHighlightMesh.geometry; // Thin box for edge
                 snapHighlightMesh.position.copy(snapToPoint);
                 snapHighlightMesh.visible = true;
                 // TODO: Rotate highlight to match edge orientation
             }
        } else if (snapTargetType === 'face') {
             // Snap to the intersection point on the face
             snapToPoint = closestIntersect.point;
             if (snapToPoint) {
                  // Use a plane/quad helper maybe?
                  snapHighlightMesh.geometry = snapHighlightMesh.geometry.type !== 'PlaneGeometry' ? new THREE.PlaneGeometry(0.1, 0.1) : snapHighlightMesh.geometry;
                  snapHighlightMesh.position.copy(snapToPoint);
                 // Rotate helper to match face normal
                 const worldNormal = closestIntersect.face.normal.clone().applyMatrix3(new THREE.Matrix3().getNormalMatrix(closestIntersect.object.matrixWorld)).normalize();
                 snapHighlightMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1), worldNormal);
                  snapHighlightMesh.visible = true;
             }
        }
    }

     // 3. Grid Snapping (always available if 'grid' is selected, or as fallback?)
     if (snapTargetType === 'grid' && mode === 'translate') {
          const gridSize = 0.5; // Make configurable
          // Use the intersection point if available, else use projected control point
          const pointToSnap = snapToPoint ? snapToPoint.clone() : controlPointWorld.clone();
          snapToPoint = pointToSnap.clone().divideScalar(gridSize).round().multiplyScalar(gridSize);

          // Snap highlight (just a point on the grid)
           snapHighlightMesh.geometry = snapHighlightMesh.geometry.type !== 'SphereGeometry' ? new THREE.SphereGeometry(0.03) : snapHighlightMesh.geometry;
           snapHighlightMesh.position.copy(snapToPoint);
           snapHighlightMesh.visible = true;
     }


    // 4. Apply Snap if target found
    if (snapToPoint) {
        if (mode === 'translate') {
            // Calculate delta needed to move controlPointWorld to snapToPoint
            const delta = new THREE.Vector3().subVectors(snapToPoint, controlPointWorld);
             // Apply delta to the *current* object position
             obj.position.add(delta); // Directly modify the proxy object's position
        }
        // TODO: Implement snapping for rotate (snap angles?) and scale (snap increments?)
    }

     // 5. Trigger necessary updates if proxy position changed
      obj.updateMatrixWorld(); // Ensure matrix is up-to-date after manual position change
      // If transforming v/e/f directly, need to update geometry here: updateMeshGeometry();

}

//Bevel 
/**
 * Initiates the interactive bevel tool. Shows UI and prepares for preview.
 */
function initBevelTool() {
    if (!activeObject || selectedElements.length === 0 || selectionMode !== 'edge') {
        alert("Bevel: Please select edges first in Edge Mode.");
        return;
    }

    if (!activeObject.geometry?.index || !activeObject.geometry?.attributes.position || !activeObject.geometry?.attributes.normal || !activeObject.geometry?.attributes.uv) {
        alert("Bevel requires indexed geometry with position, normal, and uv attributes.");
        return;
    }

    bevelToolState.selectedEdgeProxies = selectedElements.filter(elem => elem.userData.type === 'edge');
    if (bevelToolState.selectedEdgeProxies.length === 0) {
        alert("Bevel: No valid edges selected.");
        return;
    }
    
    // Store original geometry for undo and to apply changes on
    bevelToolState.originalGeometryClone = activeObject.geometry.clone();
    // Also save base geometry if this is the first modifier-like action on it
    if (!baseGeometries.has(activeObject.uuid)) {
        baseGeometries.set(activeObject.uuid, activeObject.geometry.clone());
    }

    // Show the bevel options panel
    const bevelPanel = document.getElementById('bevel-options-panel');
    if (bevelPanel) {
        bevelPanel.style.display = 'block';
        // Initialize inputs with default/previous values
        document.getElementById('bevelOffsetInput').value = '0.1';
        document.getElementById('bevelSegmentsInput').value = '1';

        // Add event listeners for inputs to trigger preview
        document.getElementById('bevelOffsetInput').oninput = updateBevelPreview;
        document.getElementById('bevelSegmentsInput').oninput = updateBevelPreview;
        //document.getElementById('bevelConfirmButton').onclick = confirmBevelOperation;
        //document.getElementById('bevelCancelButton').onclick = cancelBevelOperation;
    }

    bevelToolState.isActive = true;
    // Perform initial preview
    updateBevelPreview();
    console.log("Bevel Tool Activated. Adjust offset and segments.");

    // Optionally disable controls during interactive tool use
    if (controls) controls.enabled = false;
}

/**
 * Updates the bevel preview on the active object.
 * This is called on input changes in the bevel options panel.
 */
function updateBevelPreview() {
    if (!bevelToolState.isActive || !bevelToolState.originalGeometryClone || bevelToolState.selectedEdgeProxies.length === 0) {
        return;
    }

    const currentGeometryCopy = bevelToolState.originalGeometryClone.clone(); // Start from the clean original geometry clone
    
    const bevelOffset = parseFloat(document.getElementById('bevelOffsetInput').value);
    const bevelSegments = parseInt(document.getElementById('bevelSegmentsInput').value);

    // Basic validation
    if (isNaN(bevelOffset) || bevelOffset <= 0) return;
    if (isNaN(bevelSegments) || bevelSegments < 1) return;

    // --- The actual bevel geometry generation logic (simplified) ---
    // This is where the core (complex) logic from your original `bevelSelection` goes.
    // It will operate on `currentGeometryCopy` instead of `activeObject.geometry`.
    
    // We need to pass necessary data like `bevelToolState.selectedEdgeProxies`
    const newBeveledGeometry = generateBevelGeometry(currentGeometryCopy, bevelToolState.selectedEdgeProxies, bevelOffset, bevelSegments);
    
    // Replace active object's geometry with the preview
    if (newBeveledGeometry) {
        activeObject.geometry.dispose(); // Dispose current preview geometry
        activeObject.geometry = newBeveledGeometry;
        activeObject.geometry.computeVertexNormals();
        activeObject.geometry.computeBoundingBox();
        activeObject.geometry.computeBoundingSphere();
        showMeshStructure(activeObject); // Refresh helpers for the preview
    } else {
        // If generation failed, revert to original (or previous valid preview)
        activeObject.geometry.dispose();
        activeObject.geometry = bevelToolState.originalGeometryClone.clone(); // Revert to start state
        activeObject.geometry.computeVertexNormals();
        showMeshStructure(activeObject);
    }
    currentGeometryCopy.dispose(); // Dispose the intermediate clone
}


/**
 * Finalizes the bevel operation.
 */
function confirmBevelOperation() {
    if (!bevelToolState.isActive || !bevelToolState.originalGeometryClone) return;

    // The activeObject.geometry should already be the final preview geometry.
    // Just cleanup state.
    console.log("Bevel operation confirmed.");
    if (window.historyManager) {
        window.historyManager.recordGeometryChange(activeObject, bevelToolState.originalGeometryClone);
    }
    cleanupBevelTool();
}

/**
 * Cancels the bevel operation, reverting the object to its state before the tool was activated.
 */
function cancelBevelOperation() {
    if (!bevelToolState.isActive || !bevelToolState.originalGeometryClone) return;

    console.log("Bevel operation cancelled. Reverting geometry.");
    // Revert the geometry to the state when the tool was activated
    activeObject.geometry.dispose();
    activeObject.geometry = bevelToolState.originalGeometryClone.clone();
    activeObject.geometry.computeVertexNormals();
    activeObject.geometry.computeBoundingBox();
    activeObject.geometry.computeBoundingSphere();
    showMeshStructure(activeObject); // Refresh helpers for the reverted state

    cleanupBevelTool();
}

/**
 * Cleans up the bevel tool's state and UI.
 */
function cleanupBevelTool() {
    bevelToolState.isActive = false;
    if (bevelToolState.originalGeometryClone) {
        bevelToolState.originalGeometryClone.dispose(); // Dispose stored original geometry
        bevelToolState.originalGeometryClone = null;
    }
    bevelToolState.selectedEdgeProxies = [];

    const bevelPanel = document.getElementById('bevel-options-panel');
    if (bevelPanel) {
        bevelPanel.style.display = 'none';
        // Remove event listeners to prevent memory leaks or unintended calls
        document.getElementById('bevelOffsetInput').oninput = null;
        document.getElementById('bevelSegmentsInput').oninput = null;
        document.getElementById('bevelConfirmButton').onclick = null;
        document.getElementById('bevelCancelButton').onclick = null;
    }
    clearSelection(); // Clear selected proxies
    if (controls) controls.enabled = true; // Re-enable controls
    if (renderer.domElement) renderer.domElement.style.cursor = 'default';
    console.log("Bevel Tool Cleaned Up.");
}


/**
 * Core function to generate bevel geometry. (Adapted from your original bevelSelection)
 * This function should return a NEW BufferGeometry.
 *
 * @param {THREE.BufferGeometry} sourceGeometry - The geometry to apply bevel to (a clone of original).
 * @param {Array<THREE.Object3D>} selectedEdgeProxies - Array of selected edge proxy objects.
 * @param {number} bevelOffset - The distance to offset the bevel.
 * @param {number} bevelSegments - The number of segments for the bevel.
 * @returns {THREE.BufferGeometry | null} The new beveled geometry, or null if an error occurs.
 */
function generateBevelGeometry(sourceGeometry, selectedEdgeProxies, bevelOffset, bevelSegments) {
    // --- START OF ADAPTED BEVEL LOGIC ---
    const geometry = sourceGeometry; // Use sourceGeometry for all operations
    
    // Ensure geometry has all required attributes
    if (!geometry?.index || !geometry?.attributes.position || !geometry?.attributes.normal || !geometry?.attributes.uv) {
        console.error("Bevel requires indexed geometry with position, normal, and uv attributes.");
        return null;
    }

    const selectedEdges = selectedEdgeProxies.map(p => p.userData.indices); // Array of [u, v]
    const selectedEdgeKeys = new Set(selectedEdges.map(edge => getEdgeKey(edge[0], edge[1])));

    const edgeFaceMap = buildEdgeFaceMap(geometry); // Ensure these helper functions are accessible
    // const vertexEdgeMap = buildVertexEdgeMap(geometry); // Not directly used in this specific bevel approach here
    if (!edgeFaceMap) {
        console.error("Failed to build topology maps for Bevel.");
        return null;
    }

    const originalPositions = geometry.attributes.position.array;
    const originalNormals = geometry.attributes.normal.array;
    const originalUVs = geometry.attributes.uv.array;
    const originalIndices = geometry.index.array;
    const originalVertexCount = geometry.attributes.position.count;

    const tempV1 = new THREE.Vector3();
    const tempV2 = new THREE.Vector3();

    // --- Calculate New Vertex Positions & Data ---
    // Map<originalVertexIndex, Map<edgeKey, {newIndex: number, position: Vector3, normal: Vector3, uv: Vector2}>>
    // This structure helps map new bevel vertices uniquely per (original_vertex, edge_it_came_from)
    const newBevelVerticesMap = new Map(); 
    let nextNewVertexIndex = originalVertexCount;

    // 1. Create new vertices offset along each selected edge from its endpoints
    // This creates two new vertices for each end of a beveled edge, per edge.
    // E.g., for edge (A, B), it creates A' (near A) and B' (near B).
    selectedEdges.forEach(edge => {
        const [vA_idx, vB_idx] = edge;
        const edgeKey = getEdgeKey(vA_idx, vB_idx);

        const vA_pos = tempV1.fromBufferAttribute(geometry.attributes.position, vA_idx);
        const vB_pos = tempV2.fromBufferAttribute(geometry.attributes.position, vB_idx);
        const edgeDir = tempV2.clone().sub(vA_pos).normalize(); // Direction A -> B

        // Calculate offset position from A towards B
        const newPos_A_to_B = vA_pos.clone().addScaledVector(edgeDir, bevelOffset);
        // Calculate offset position from B towards A
        const newPos_B_to_A = vB_pos.clone().addScaledVector(edgeDir, -bevelOffset);

        // Store new vertex data for vertex A associated with edge (A,B)
        if (!newBevelVerticesMap.has(vA_idx)) newBevelVerticesMap.set(vA_idx, new Map());
        newBevelVerticesMap.get(vA_idx).set(edgeKey, { 
            newIndex: nextNewVertexIndex++, 
            position: newPos_A_to_B,
            // Simple initial normal/UV: copy from original
            normal: new THREE.Vector3().fromBufferAttribute(geometry.attributes.normal, vA_idx),
            uv: new THREE.Vector2().fromBufferAttribute(geometry.attributes.uv, vA_idx)
        });

        // Store new vertex data for vertex B associated with edge (A,B)
        if (!newBevelVerticesMap.has(vB_idx)) newBevelVerticesMap.set(vB_idx, new Map());
        newBevelVerticesMap.get(vB_idx).set(edgeKey, { 
            newIndex: nextNewVertexIndex++, 
            position: newPos_B_to_A,
            // Simple initial normal/UV: copy from original
            normal: new THREE.Vector3().fromBufferAttribute(geometry.attributes.normal, vB_idx),
            uv: new THREE.Vector2().fromBufferAttribute(geometry.attributes.uv, vB_idx)
        });
    });

    // --- Prepare New Attribute Buffers ---
    const finalVertexCount = nextNewVertexIndex;
    const newPositions = new Float32Array(finalVertexCount * 3);
    const newNormals = new Float32Array(finalVertexCount * 3);
    const newUVs = new Float32Array(finalVertexCount * 2);

    // Copy original data
    newPositions.set(originalPositions);
    newNormals.set(originalNormals);
    newUVs.set(originalUVs);

    // Populate new vertex data
    newBevelVerticesMap.forEach(edgeMap => {
        edgeMap.forEach(data => {
            newPositions.set(data.position.toArray(), data.newIndex * 3);
            newNormals.set(data.normal.toArray(), data.newIndex * 3);
            newUVs.set(data.uv.toArray(), data.newIndex * 2);
        });
    });

    // --- Rebuild Index Buffer ---
    const newIndices = [];
    const originalFaceCount = originalIndices.length / 3;

    // Helper to get the correct (original or newly created bevel) vertex index
    const getBevelVertIndex = (originalVertIndex, adjacentEdgeKey) => {
        const edgeMap = newBevelVerticesMap.get(originalVertIndex);
        return (edgeMap && edgeMap.has(adjacentEdgeKey)) ? edgeMap.get(adjacentEdgeKey).newIndex : originalVertIndex;
    };

    // Helper to add two triangles for a quad (v0, v1, v2, v3)
    const addQuad = (idx0, idx1, idx2, idx3) => {
        newIndices.push(idx0, idx1, idx2);
        newIndices.push(idx0, idx2, idx3);
    };

    // Iterate over original faces to modify/replace them
    for (let i = 0; i < originalFaceCount; i++) {
        const v0_orig = originalIndices[i * 3];
        const v1_orig = originalIndices[i * 3 + 1];
        const v2_orig = originalIndices[i * 3 + 2];
        
        // Edges of the current face
        const e01_key = getEdgeKey(v0_orig, v1_orig);
        const e12_key = getEdgeKey(v1_orig, v2_orig);
        const e20_key = getEdgeKey(v2_orig, v0_orig);

        // Check which edges are selected for bevel
        const e01_selected = selectedEdgeKeys.has(e01_key);
        const e12_selected = selectedEdgeKeys.has(e12_key);
        const e20_selected = selectedEdgeKeys.has(e20_key);

        const numSelectedEdges = (e01_selected ? 1 : 0) + (e12_selected ? 1 : 0) + (e20_selected ? 1 : 0);

        if (numSelectedEdges === 0) {
            // Face untouched: keep original triangle
            newIndices.push(v0_orig, v1_orig, v2_orig);
        } else {
            // Face affected by bevel: rebuild its triangles
            // Get the new bevel vertices for each corner (or original if not beveled)
            // vA_eBA: new vertex near A on edge (B,A) (i.e. 'A' side of edge AB)
            // We need to be very careful with vertex indices here.
            // Simplified approach for illustration (might need complex corner triangulation)

            // Original vertices of the face
            const ov0 = v0_orig;
            const ov1 = v1_orig;
            const ov2 = v2_orig;

            // New vertices along edges (if selected)
            // From v0 towards v1 (e01)
            const nv0_e01 = e01_selected ? getBevelVertIndex(ov0, e01_key) : ov0;
            const nv1_e01 = e01_selected ? getBevelVertIndex(ov1, e01_key) : ov1;
            // From v1 towards v2 (e12)
            const nv1_e12 = e12_selected ? getBevelVertIndex(ov1, e12_key) : ov1;
            const nv2_e12 = e12_selected ? getBevelVertIndex(ov2, e12_key) : ov2;
            // From v2 towards v0 (e20)
            const nv2_e20 = e20_selected ? getBevelVertIndex(ov2, e20_key) : ov2;
            const nv0_e20 = e20_selected ? getBevelVertIndex(ov0, e20_key) : ov0;

            // Handle based on how many edges of this face are selected for bevel
            if (bevelSegments === 1) { // Simple single segment bevel (chamfer)
                // This is a common pattern for single-segment bevels
                // A B C are original vertices of the face
                // a' b' are new bevel vertices on edge AB
                // b'' c'' are new bevel vertices on edge BC
                // c''' a''' are new bevel vertices on edge CA
                // The middle of the face becomes a smaller triangle (A'B'C') and corners become quads.

                // This logic is simplified and likely needs more robustness
                // based on vertex winding and actual geometric checks.
                // For 'segments=1', it often replaces the original face with an "inset" face
                // and a set of quads around the perimeter.

                // Example: If e01 is selected, v0-v1 is replaced by nv0_e01--nv1_e01
                // and v0,nv0_e01,nv1_e01,v1 forms a quad
                // The triangle (v0, v1, v2) can be replaced by:
                // 1. (v2, nv0_e20, nv1_e12) - if corners untouched
                // 2. (nv0_e01, nv1_e01, nv2_e12) - central triangle (if all edges beveled)

                // Simplified index generation for preview - might not be watertight
                // or topologically correct for all cases, especially complex intersections.
                // A full implementation often requires a topological data structure (half-edge mesh)
                // and a robust polygon triangulation library after creating the new boundary loops.

                // This code attempts to create a central face and surrounding quads/triangles,
                // but might leave gaps or overlapping faces for complex inputs.
                
                // For a single segment (chamfer), you effectively create an "inset" triangle/quad
                // and then connect it to the original vertices via new quads.
                
                if (numSelectedEdges === 1) {
                    if (e01_selected) {
                        addQuad(ov0, nv0_e01, nv1_e01, ov1); // Bevel along 0-1
                        newIndices.push(ov0, nv1_e01, ov2); // Remap face 0-1-2
                    } else if (e12_selected) {
                        addQuad(ov1, nv1_e12, nv2_e12, ov2); // Bevel along 1-2
                        newIndices.push(ov1, nv2_e12, ov0); // Remap face 1-2-0
                    } else if (e20_selected) {
                        addQuad(ov2, nv2_e20, nv0_e20, ov0); // Bevel along 2-0
                        newIndices.push(ov2, nv0_e20, ov1); // Remap face 2-0-1
                    }
                } else if (numSelectedEdges === 2) {
                    // Corner bevel: 2 edges selected
                    if (!e01_selected) { // Corner at ov0 (e12, e20 selected)
                         // Central triangle for the corner
                        newIndices.push(nv1_e12, ov0, nv0_e20);
                        // Bevel quads
                        addQuad(ov1, nv1_e12, nv2_e12, ov2); // Edge 1-2 bevel
                        addQuad(ov2, nv2_e20, nv0_e20, ov0); // Edge 2-0 bevel
                    } else if (!e12_selected) { // Corner at ov1 (e01, e20 selected)
                        newIndices.push(nv0_e01, ov1, nv2_e20);
                        addQuad(ov0, nv0_e01, nv1_e01, ov1); // Edge 0-1 bevel
                        addQuad(ov2, nv2_e20, nv0_e20, ov0); // Edge 2-0 bevel
                    } else if (!e20_selected) { // Corner at ov2 (e01, e12 selected)
                        newIndices.push(nv0_e01, nv1_e12, ov2);
                        addQuad(ov0, nv0_e01, nv1_e01, ov1); // Edge 0-1 bevel
                        addQuad(ov1, nv1_e12, nv2_e12, ov2); // Edge 1-2 bevel
                    }
                } else if (numSelectedEdges === 3) {
                    // All three edges beveled: forms central triangle and three quads
                    // This creates an "inset" triangle
                    newIndices.push(nv0_e01, nv1_e12, nv2_e20); 

                    // And connecting quads
                    addQuad(ov0, nv0_e01, nv2_e20, ov2); // Quad 0-01-20-2
                    addQuad(ov1, nv1_e12, nv0_e01, ov0); // Quad 1-12-01-0
                    addQuad(ov2, nv2_e20, nv1_e12, ov1); // Quad 2-20-12-1
                }

            } else { // Multiple segments (bevelSegments > 1)
                // This would require generating more complex mesh data for the curved/rounded bevel surface.
                // The current bevel logic is for a chamfer (straight-line bevel).
                // For multiple segments, a simple chamfer is just repeated.
                // To do proper rounded bevels, you need to calculate new vertex positions along curves
                // and create the corresponding strip of faces. This is much more involved.

                // For now, we will simply alert and fallback to single segment logic (or similar).
                console.warn("Multi-segment bevel (bevelSegments > 1) is not fully implemented beyond basic triangulation. Preview might be basic.");
                
                // Fallback: For multiple segments, just use the single segment logic or simplify.
                // This will effectively just apply a chamfer. To get rounded, you need more complex vertex generation.
                // For demo purposes, we can just apply the 1-segment logic, or even revert.
                // Let's fallback to the basic one-segment (chamfer) logic, but with the requested segment number
                // This means the 'bevelSegments' value won't create a rounded shape, but merely affects
                // the complexity of the triangulation if it's interpreted as steps.
                
                // This block is left as a placeholder for a true multi-segment curved bevel
                // and may require a more advanced mesh library or custom algorithms.
                
                // For now, let's just push the original face indices (i.e. effectively revert)
                // if segments > 1 and we don't have the robust implementation.
                 newIndices.push(ov0, ov1, ov2);
                 console.warn("Multi-segment bevel not implemented, showing original face.");
            }
        }
    }
    // --- END OF ADAPTED BEVEL LOGIC ---


    // --- Create the NEW bevel faces (quads along the original edges) ---
    // These are the actual chamfered surfaces themselves.
     selectedEdges.forEach(edge => {
         const u = edge[0];
         const v = edge[1];
         const edgeKey = getEdgeKey(u, v);

         // Get the new vertices created for this edge (u_new_idx is near u, v_new_idx is near v)
         const u_new_idx = getBevelVertIndex(u, edgeKey);
         const v_new_idx = getBevelVertIndex(v, edgeKey);

         // Ensure valid new indices (should be from newBevelVerticesMap)
         if (u_new_idx !== u && v_new_idx !== v) { // Only if they are actually new vertices
             // Create quad: u (original), v (original), v_new_idx, u_new_idx
             // This creates the 'side' face of the bevel. Check winding order.
             // Original:    u -- v
             // New (bevel): u'-- v'
             // Quad: u, v, v_new_idx (v'), u_new_idx (u')
             addQuad(u, v, v_new_idx, u_new_idx);
         }
     });


    if (newIndices.length === 0) {
        console.error("Bevel index calculation failed, no indices generated.");
        return null;
    }

    // --- Apply New Geometry ---
    const newGeometry = new THREE.BufferGeometry();
    newGeometry.setAttribute('position', new THREE.BufferAttribute(newPositions, 3));
    newGeometry.setAttribute('normal', new THREE.BufferAttribute(newNormals, 3));
    newGeometry.setAttribute('uv', new THREE.BufferAttribute(newUVs, 2));
    newGeometry.setIndex(newIndices);

    try {
        newGeometry.computeVertexNormals(); // Essential after bevel
    } catch (e) {
        console.error("Error computing normals after bevel:", e);
    }
    
    return newGeometry; // Return the new geometry for preview/confirmation
}

/**
 * Extrudes selected edges, creating new faces along the extrusion direction.
 * This is a destructive operation that rebuilds the geometry.
 * Currently extrudes along the average normal of the faces adjacent to the edge.
 */
function extrudeEdge() {
    if (!activeObject || selectedElements.length === 0 || selectionMode !== 'edge') {
        alert("Please select one or more edges to extrude.");
        return;
    }
    const selectedEdgeProxies = selectedElements.filter(elem => elem.userData.type === 'edge');
    if (selectedEdgeProxies.length === 0) {
        alert("No valid edges selected for extrusion.");
        return;
    }

    const geometry = activeObject.geometry;
    if (!geometry?.index || !geometry?.attributes.position || !geometry?.attributes.normal || !geometry?.attributes.uv) {
        alert("Edge extrusion requires indexed geometry with position, normal, and UV attributes.");
        return;
    }

    const oldGeometry = geometry.clone(); // For undo history

    const extrudeDistance = parseFloat(prompt("Enter Extrusion Distance:", "0.5")) || 0.5;
    if (extrudeDistance === 0) { // Allow positive or negative extrude
        console.log("Extrude distance is 0, cancelling operation.");
        return;
    }

    const positions = geometry.attributes.position;
    const normals = geometry.attributes.normal;
    const uvs = geometry.attributes.uv;
    const originalIndices = geometry.index.array;
    const originalVertexCount = positions.count;

    const edgeFaceMap = buildEdgeFaceMap(geometry);
    if (!edgeFaceMap) {
        console.error("Failed to build edge-face map for edge extrusion.");
        return;
    }

    // Map to store new extruded vertices: Key is original vertex index, Value is new vertex index
    const extrudedVerticesMap = new Map(); // Map<original_vertex_idx, { newIndex: number, worldPos: Vector3, normal: Vector3, uv: Vector2 }>
    let nextNewVertexIndex = originalVertexCount;

    // Map to keep track of the extrusion direction for each edge
    const edgeExtrusionNormal = new Map(); // Map<edgeKey, Vector3 averageNormal>

    // 1. Calculate extrusion normal for each selected edge
    selectedEdgeProxies.forEach(proxy => {
        const [v1_idx, v2_idx] = proxy.userData.indices;
        const edgeKey = getEdgeKey(v1_idx, v2_idx);

        const facesOnEdge = edgeFaceMap.get(edgeKey);
        if (!facesOnEdge || facesOnEdge.length === 0) {
            // Boundary edge: Extrude along one of the adjacent face's normal (or average normal if no faces)
            console.warn(`Extruding boundary edge ${edgeKey}. Direction will be based on single adjacent face or an arbitrary normal.`);
            if (facesOnEdge && facesOnEdge.length > 0) {
                const faceIndex = facesOnEdge[0];
                const fv0 = originalIndices[faceIndex * 3 + 0];
                const fv1 = originalIndices[faceIndex * 3 + 1];
                const fv2 = originalIndices[faceIndex * 3 + 2];
                const faceNormal = new THREE.Triangle(
                    new THREE.Vector3().fromBufferAttribute(positions, fv0),
                    new THREE.Vector3().fromBufferAttribute(positions, fv1),
                    new THREE.Vector3().fromBufferAttribute(positions, fv2)
                ).getNormal(new THREE.Vector3());
                edgeExtrusionNormal.set(edgeKey, faceNormal);
            } else {
                // Completely free edge, pick an arbitrary normal (e.g., Z-axis)
                edgeExtrusionNormal.set(edgeKey, new THREE.Vector3(0, 0, 1)); // Arbitrary for now
            }
        } else {
            // Internal edge: Extrude along the average normal of adjacent faces
            const avgNormal = new THREE.Vector3();
            facesOnEdge.forEach(faceIndex => {
                const fv0 = originalIndices[faceIndex * 3 + 0];
                const fv1 = originalIndices[faceIndex * 3 + 1];
                const fv2 = originalIndices[faceIndex * 3 + 2];
                const faceNormal = new THREE.Triangle(
                    new THREE.Vector3().fromBufferAttribute(positions, fv0),
                    new THREE.Vector3().fromBufferAttribute(positions, fv1),
                    new THREE.Vector3().fromBufferAttribute(positions, fv2)
                ).getNormal(new THREE.Vector3());
                avgNormal.add(faceNormal);
            });
            avgNormal.normalize();
            edgeExtrusionNormal.set(edgeKey, avgNormal);
        }
    });

    // 2. Create new vertices (extruded copies) for the endpoints of selected edges
    selectedEdgeProxies.forEach(proxy => {
        const [v1_idx, v2_idx] = proxy.userData.indices;
        const edgeKey = getEdgeKey(v1_idx, v2_idx);
        const extrusionNormal = edgeExtrusionNormal.get(edgeKey).clone().multiplyScalar(extrudeDistance);

        [v1_idx, v2_idx].forEach(origVertIdx => {
            // Only create an extruded copy if one doesn't exist for this original vertex
            // This handles shared vertices between multiple selected edges
            if (!extrudedVerticesMap.has(origVertIdx)) {
                const origPos = new THREE.Vector3().fromBufferAttribute(positions, origVertIdx);
                const origNorm = new THREE.Vector3().fromBufferAttribute(normals, origVertIdx);
                const origUV = new THREE.Vector2().fromBufferAttribute(uvs, origVertIdx);

                extrudedVerticesMap.set(origVertIdx, {
                    newIndex: nextNewVertexIndex++,
                    position: origPos.clone().add(extrusionNormal),
                    normal: origNorm.clone(), // Initial normal is copied
                    uv: origUV.clone() // Initial UV is copied
                });
            }
        });
    });

    // --- Prepare new attribute buffers ---
    const finalVertexCount = originalVertexCount + extrudedVerticesMap.size;
    const newPositions = new Float32Array(finalVertexCount * 3);
    const newNormals = new Float32Array(finalVertexCount * 3);
    const newUVs = new Float32Array(finalVertexCount * 2);

    newPositions.set(positions.array);
    newNormals.set(normals.array);
    newUVs.set(uvs.array);

    extrudedVerticesMap.forEach(data => {
        newPositions.set(data.position.toArray(), data.newIndex * 3);
        newNormals.set(data.normal.toArray(), data.newIndex * 3);
        newUVs.set(data.uv.toArray(), data.newIndex * 2);
    });

    // --- Rebuild index buffer ---
    const finalNewIndices = [];
    const facesToExclude = new Set(); // Faces that will be completely replaced or are adjacent to boundary edges

    // Copy original faces, excluding those that will form the "cap" of the extrusion (i.e. faces adjacent to selected edges)
    // The "cap" faces are the original faces themselves that are connected to the selected edges.
    // If a selected edge is an internal edge, we need to split the adjacent faces.
    // If it's a boundary edge, we keep the adjacent face but add a side face.

    // This is a simplified approach: remove all faces adjacent to selected edges, then build new side faces.
    // This is simpler to implement but might remove more faces than desired if selection is complex.

    // A more robust approach would be to iterate faces:
    //  - If a face contains 0 selected edges, copy it.
    //  - If a face contains 1 selected edge, split it into new faces (1 quad, 1 tri)
    //  - If a face contains 2 selected edges, split it into new faces (2 quads, 1 tri)
    // For simplicity with edge extrusion, we'll recreate the "side" faces.
    
    // First, add all *unaffected* faces.
    // Then, for each SELECTED edge (u,v) with new extruded vertices (u',v'):
    //    Create a quad (u, v, v', u')
    //    For boundary edges, this is straightforward.
    //    For internal edges, you are 'tearing' the mesh. This is complex.

    // Simplified for boundary edges, if selected edges are INTERNAL, it requires splitting existing faces.
    // This example will primarily work well for *boundary* edges (edges with only one adjacent face).
    // If extruding an internal edge, it will create "holes" and non-manifold geometry,
    // which then need to be patched, or the tool needs to be designed to split faces cleanly.

    const tempV1 = new THREE.Vector3(), tempV2 = new THREE.Vector3(), tempV3 = new THREE.Vector3(); // For triangle normal
    
    // Collect all faces that are adjacent to the selected edges (these will be modified or removed)
    const affectedFaces = new Set();
    selectedEdgeProxies.forEach(proxy => {
        const edgeKey = getEdgeKey(proxy.userData.indices[0], proxy.userData.indices[1]);
        const faces = edgeFaceMap.get(edgeKey);
        if (faces) {
            faces.forEach(fIdx => affectedFaces.add(fIdx));
        }
    });

    // Copy unaffected faces
    for (let i = 0; i < originalFaceCount; i++) {
        if (!affectedFaces.has(i)) {
            finalNewIndices.push(originalIndices[i * 3], originalIndices[i * 3 + 1], originalIndices[i * 3 + 2]);
        }
    }

    // Create new side faces for the extrusion
    selectedEdgeProxies.forEach(proxy => {
        const [u_orig, v_orig] = proxy.userData.indices;
        
        const u_extruded = extrudedVerticesMap.get(u_orig).newIndex;
        const v_extruded = extrudedVerticesMap.get(v_orig).newIndex;

        // Create the two triangles for the side quad (u, v, v_extruded, u_extruded)
        // Ensure consistent winding for new faces (e.g., based on average normal for the edge)
        // For simplicity, assuming default order:
        finalNewIndices.push(u_orig, v_orig, v_extruded); // First triangle
        finalNewIndices.push(u_orig, v_extruded, u_extruded); // Second triangle
    });

    // --- Apply new geometry ---
    const newGeometry = new THREE.BufferGeometry();
    newGeometry.setAttribute('position', new THREE.Float32BufferAttribute(newPositions, 3));
    newGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(newNormals, 3));
    newGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(newUVs, 2));
    newGeometry.setIndex(finalNewIndices);

    // Recompute normals for new faces and merged areas
    newGeometry.computeVertexNormals();
    newGeometry.computeBoundingBox();
    newGeometry.computeBoundingSphere();

    // Replace old geometry
    activeObject.geometry.dispose();
    activeObject.geometry = newGeometry;

    // Record action for undo
    if (window.historyManager) {
        window.historyManager.recordGeometryChange(activeObject, oldGeometry);
    }

    // Cleanup and refresh helpers
    clearSelection();
    // Rebuild topology maps
    edgeFaceMap = buildEdgeFaceMap(newGeometry);
    vertexEdgeMap = buildVertexEdgeMap(newGeometry);
    vertexFaceMap = buildVertexFaceMap(newGeometry);
    showMeshStructure(activeObject);

    console.log(`Successfully extruded ${selectedEdgeProxies.length} edges.`);
}

// Spline Tools
let splineCreationMode = null; // 'profile', 'path'
let currentSplinePoints = []; // Holds Vector2 or Vector3
let splinePreviewLine = null; // Re-use wallPreviewLine? Or dedicated?
let editedSplines = { profile: null, path: null, list: [] }; 


// --- Tool Activation/Drawing Logic ---
// Similar to wall tool: Use handleCanvasClick, handleCanvasMouseMove, right-click to finish.
// - Profile mode: Intersects a drawing plane (e.g., XY or based on selected face). Stores Vector2 points. Creates THREE.Shape when finished.
// - Path mode: Intersects world space (or snaps). Stores Vector3 points. Creates THREE.CatmullRomCurve3 or THREE.Path when finished.
// Need visual feedback (line preview).


function extrudeSelectedSplines() {
    const profileShape = editedSplines.profile; // Get from selection UI
    const pathCurve = editedSplines.path;       // Get from selection UI

    if (!profileShape || !pathCurve) {
        alert("Please create or select both a 2D Profile Shape and a 3D Path Curve first.");
        return;
    }

    const extrudeSettings = {
        steps: 100, // Increase for smoother curve
        bevelEnabled: false,
        extrudePath: pathCurve
    };

    const geometry = new THREE.ExtrudeGeometry(profileShape, extrudeSettings);
    const material = new THREE.MeshStandardMaterial({ color: 0x00ff00, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = "SplineExtrusion";
    scene.add(mesh);
    console.log("Created extrusion.");
}

// --- Key binding ('I' key maybe in handleModelingKeyDown) ---
// Need selectionMode == 'face'
function insetSelectedFaces() {
    // ... (Initial checks for activeObject, face mode, selectedElements, indexed geom as before) ...
    if (!activeObject || selectionMode !== 'face' || selectedElements.length === 0) return;
    if (!activeObject.geometry || !activeObject.geometry.index) { console.error("Inset requires indexed geometry."); return; }

    const geometry = activeObject.geometry;
    const positions = geometry.attributes.position;
    const normals = geometry.attributes.normal;
    const uvs = geometry.attributes.uv;
    const indices = geometry.index.array;
    const originalVertexCount = positions.count;

    // --- Parameters ---
    const insetAmountRatio = 0.2; // Ratio towards center (0 to 1)
    const insetDepth = 0.0;

    const selectedFaceIndices = selectedElements.map(p => p.userData.faceIndex);
    console.log(`Insetting ${selectedFaceIndices.length} faces...`);

    // --- Data Structures ---
    const newVertexData = new Map(); // Map<origIndex, { newIndex, pos, normal, uv }> - Shared new vertex data for shared original vertices
    const faceData = new Map();      // Map<faceIndex, { center, normal, origVerts: [v0,v1,v2], newVerts: [n0,n1,n2] }>
    const boundaryEdges = new Map(); // Map<edgeKey, { faces: [fA, fB(optional)] }> -> detect boundaries later
    let nextNewVertexIndex = originalVertexCount;

    const edgeFaceMap = buildEdgeFaceMap(geometry);
    if (!edgeFaceMap) return; // Needed for boundary check

     const tempV0 = new THREE.Vector3();
     const tempV1 = new THREE.Vector3();
     const tempV2 = new THREE.Vector3();


    // --- Pass 1: Calculate new vertex positions and face centers/normals ---
    for (const faceIndex of selectedFaceIndices) {
        const v0Idx = indices[faceIndex * 3 + 0];
        const v1Idx = indices[faceIndex * 3 + 1];
        const v2Idx = indices[faceIndex * 3 + 2];

        const v0 = tempV0.fromBufferAttribute(positions, v0Idx);
        const v1 = tempV1.fromBufferAttribute(positions, v1Idx);
        const v2 = tempV2.fromBufferAttribute(positions, v2Idx);

        const faceCenter = new THREE.Vector3().addVectors(v0, v1).add(v2).divideScalar(3);
        const faceNormal = new THREE.Vector3().crossVectors(v1.clone().sub(v0), v2.clone().sub(v0)).normalize();

         faceData.set(faceIndex, { center: faceCenter, normal: faceNormal, origVerts: [v0Idx, v1Idx, v2Idx], newVerts: [] });

        // Calculate potential new positions
         for (const origIndex of [v0Idx, v1Idx, v2Idx]) {
             if (!newVertexData.has(origIndex)) {
                 // Create data for shared new vertex if it doesn't exist
                  const origPos = new THREE.Vector3().fromBufferAttribute(positions, origIndex);
                 const insetPos = origPos.clone().lerp(faceCenter, insetAmountRatio); // Simple Lerp - Needs Improvement
                 if (insetDepth !== 0) {
                    insetPos.addScaledVector(faceNormal, insetDepth);
                 }
                 // Calculate normal/uv later or use original?
                 const origNorm = normals ? new THREE.Vector3().fromBufferAttribute(normals, origIndex) : faceNormal.clone();
                 const origUV = uvs ? new THREE.Vector2().fromBufferAttribute(uvs, origIndex) : new THREE.Vector2(0,0);

                newVertexData.set(origIndex, {
                     newIndex: nextNewVertexIndex++,
                     pos: insetPos,
                     normal: origNorm, // Use original normal initially
                    uv: origUV        // Use original uv initially
                 });
            }
             // Note: This simple method creates ONE new vertex per original vertex participating.
             // A more advanced inset offsets edges and creates verts at intersections.
             // We store the mapping for the index buffer rebuild.
             faceData.get(faceIndex).newVerts.push(newVertexData.get(origIndex).newIndex);

             // Populate boundaryEdges map (simplified - checks if edge is shared ONLY by selected faces)
              // Add edges of this face to check later
               const edges = [[v0Idx, v1Idx], [v1Idx, v2Idx], [v2Idx, v0Idx]];
              edges.forEach(edge => {
                  const key = getEdgeKey(edge[0], edge[1]);
                  if(!boundaryEdges.has(key)) boundaryEdges.set(key, { faces: []});
                   if(!boundaryEdges.get(key).faces.includes(faceIndex)) boundaryEdges.get(key).faces.push(faceIndex);
              });

        }
    }


    // --- Prepare New Buffers ---
    const finalVertexCount = nextNewVertexIndex;
    const newPositions = new Float32Array(finalVertexCount * 3);
    const newNormals = normals ? new Float32Array(finalVertexCount * 3) : null;
    const newUVs = uvs ? new Float32Array(finalVertexCount * 2) : null;

    // Copy existing data
    newPositions.set(positions.array);
    if (newNormals) newNormals.set(normals.array);
    if (newUVs) newUVs.set(uvs.array);

     // Add new vertex data
     newVertexData.forEach((data) => {
         newPositions.set(data.pos.toArray(), data.newIndex * 3);
        if (newNormals) newNormals.set(data.normal.toArray(), data.newIndex * 3);
        if (newUVs) newUVs.set(data.uv.toArray(), data.newIndex * 2);
     });


     // --- Rebuild Index Buffer ---
     const newIndices = [];
     const processedFaces = new Set();

     // Copy non-selected faces
     const originalFaceCount = indices.length / 3;
     for (let i = 0; i < originalFaceCount; i++) {
         if (!faceData.has(i)) { // If it's not a selected face
             newIndices.push(indices[i * 3], indices[i * 3 + 1], indices[i * 3 + 2]);
             processedFaces.add(i);
         }
     }


     // Add new inset faces and connecting side faces
      faceData.forEach((fData, faceIndex) => {
          if(processedFaces.has(faceIndex)) return; // Should not happen, but safety check
           processedFaces.add(faceIndex);

          const [v0Orig, v1Orig, v2Orig] = fData.origVerts;
          const [v0New, v1New, v2New] = fData.newVerts; // Get the mapped new indices

          // Add the new center inset face
          newIndices.push(v0New, v1New, v2New); // Assuming same winding

          // Add the connecting side faces (quads)
          // Quad 1: v0Orig, v1Orig, v1New, v0New
          newIndices.push(v0Orig, v1Orig, v1New);
          newIndices.push(v1New, v0New, v0Orig);
          // Quad 2: v1Orig, v2Orig, v2New, v1New
          newIndices.push(v1Orig, v2Orig, v2New);
          newIndices.push(v2New, v1New, v1Orig);
          // Quad 3: v2Orig, v0Orig, v0New, v2New
          newIndices.push(v2Orig, v0Orig, v0New);
          newIndices.push(v0New, v2New, v2Orig);
     });

      // --- Apply New Geometry & Finalize ---
      const newGeometry = new THREE.BufferGeometry();
      newGeometry.setAttribute('position', new THREE.BufferAttribute(newPositions, 3));
      if (newNormals) newGeometry.setAttribute('normal', new THREE.BufferAttribute(newNormals, 3));
      if (newUVs) newGeometry.setAttribute('uv', new THREE.BufferAttribute(newUVs, 2));
      newGeometry.setIndex(newIndices);

     try {
         newGeometry.computeVertexNormals(); // Recalculate normals
      } catch(e) { console.error("Error computing normals after inset:", e); }

     const oldGeometry = geometry;
      activeObject.geometry = newGeometry;
     oldGeometry.dispose();

      if (baseGeometries.has(activeObject.uuid)) {
           console.log("Inset performed on base mesh. Updating base (EXPERIMENTAL).");
            baseGeometries.set(activeObject.uuid, newGeometry.clone());
             document.getElementById('subdivisionLevelsSlider').value = 0;
        }

       clearSelection();
      showMeshStructure(activeObject);
      console.log(`Inset operation completed.`);
}



function bridgeEdgeLoops() {
    console.log("Attempting to Bridge Edge Loops...");
    if (!activeObject || selectionMode !== 'edge' || selectedElements.length < 2) {
        // Bridge usually operates on two selected edge loops
        alert("Bridge tool requires selecting two edge loops (Edge Mode).");
        return;
    }
    // --- TODO: Implement Bridge Logic ---
    // 1. Identify the two separate selected edge loops.
    // 2. Ensure they have the same number of vertices/edges (or handle mismatches).
    // 3. Create new faces (quads ideally) connecting corresponding vertices between the two loops.
    // 4. Update index buffer, apply geometry, cleanup, etc.
    alert("Bridge Edge Loops logic not implemented.");
}


function initTransformControls() {
    transformControls.setSize(0.75);
    transformControls.setSpace('local');
    transformControls.setMode('translate');

    transformControls.addEventListener('objectChange', () => {
        // Update geometry ONLY while dragging
        if (activeObject && transformControls.object && isTransforming) {
            updateMeshGeometry();
        }
    });

    // Remove the dragging-changed listener here if added in setupTransformControls
    // transformControls.addEventListener('dragging-changed', ...); // Already handled

    window.addEventListener('keydown', (event) => {
        if (!isModelingMode) return;
        // ++ Prevent transform mode change WHILE dragging ++
        if (isTransforming) return;
        switch (event.key) {
            case 't': transformControls.setMode('translate'); break;
            case 'r': transformControls.setMode('rotate'); break;
            case 's': transformControls.setMode('scale'); break;
        }
    });
}

function clearSelection() {
    // Iterate backwards to safely remove elements while iterating
    for (let i = selectedElements.length - 1; i >= 0; i--) {
        const elem = selectedElements[i];
        switch (elem.userData.type) {
            case 'vertex': deselectVertex(elem); break;
            case 'edge': deselectEdge(elem); break;
            case 'face': deselectFace(elem); break;
            default:
                // Fallback for unexpected types, remove from scene and dispose
                if (elem.parent) elem.parent.remove(elem);
                if (elem.geometry) elem.geometry.dispose();
                // selectedElements.splice(i, 1); // Not needed if deselect functions handle removal
        }
    }
    selectedElements = []; // Ensure the array is empty after loop

    transformControls.detach();
    // After clearing selection, the selection pivot should also be hidden/detached
    if (selectionPivot && selectionPivot.parent) {
        // selectionPivot.visible = false; // Hide it for next use
        scene.remove(selectionPivot); // Remove to re-add fresh later or hide
    }
    
    resetHighlights(); // Ensures highlights are fully cleared or reset after selection is empty
    if (activeObject && isModelingMode) showMeshStructure(activeObject); // Refresh helpers if in modeling mode

    selectedObjects = [];
    selectedObject = null;
    console.log("Cleared modeling selection.");
}


function toggleModelingMode() {
    isModelingMode = !isModelingMode;
    console.log("Modeling Mode:", isModelingMode);

    // --- UI Button and Panel Disabling/Enabling ---
    // (This part of the code remains as you provided it,
    // as it correctly manages UI elements based on modeling mode)
    const modelingButtons = ['select-vertex', 'select-edge', 'select-face',
                             'tool-extrude', 'tool-bevel', 'tool-loopcut',  'tool-inset', 'tool-bridge', 'tool-spin', 'edges-to-profile'];
    const archToolButtons = ['tool-wall', 'tool-place-door', 'tool-place-window', 'tool-stairs', 'tool-measure', 'tool-roof', 'tool-room', 'tool-curved-wall', 'tool-terrain', 'tool-boolean-subtract', 'tool-poly-pen', 'tool-window-presets', 'tool-structure-synth'];
    const splineToolButtons = ['spline-draw-profile', 'spline-draw-path', 'spline-extrude'];
    const archSelectionButtons = ['select-all-walls', 'select-all-doors', 'select-all-windows', 'select-all-arch', 'delete-selected-arch'];

    // Disable most tools when modeling mode is off, enable when on.
    [...modelingButtons, ...archToolButtons, ...splineToolButtons].forEach(id => {
       const button = document.getElementById(id);
       if (button) button.disabled = !isModelingMode;
    });
    // Arch selection buttons might have different rules, as per your original code's comment.

    document.getElementById('performance-mode').disabled = !isModelingMode;
    document.getElementById('vertexSizeSlider').disabled = !isModelingMode;
    document.getElementById('edgeThicknessSlider').disabled = !isModelingMode;
    document.getElementById('faceOpacitySlider').disabled = !isModelingMode;
    document.getElementById('subdivisionLevelsSlider').disabled = !isModelingMode;
    
    // Panels visibility
    document.getElementById('modifiers-panel').style.display = (isModelingMode && activeObject) ? 'block' : 'none';
    document.getElementById('snapping-controls').style.display = isModelingMode ? 'block' : 'none';
    // Ensure window presets panel is also hidden if user switches mode
    const windowPresetsPanel = document.getElementById('window-presets-panel');
    if (windowPresetsPanel) windowPresetsPanel.style.display = 'none';


    if (isModelingMode) { // --- ENTERING MODELING MODE ---
        deselectAllArchElements(); // Clear arch selection when entering modeling mode for clarity
        
        // Ensure helper groups exist and are added to the scene
        // They are initialized once, but removed/added based on this mode.
        // `clearMeshStructure()` below handles disposing children, not the groups themselves.
        if(!scene.children.includes(vertexHelpers)) scene.add(vertexHelpers);
        if(!scene.children.includes(edgeHelpers)) scene.add(edgeHelpers);
        if(!scene.children.includes(faceHelpers)) scene.add(faceHelpers);

        // Clear existing helpers and regenerate for the current active object (if any)
        clearMeshStructure(); 
        if (!selectionMode) setSelectionMode('vertex'); // Set a default mode if none
        else setSelectionMode(selectionMode); // Re-apply to show helpers for current mode

        if (activeObject) {
            showMeshStructure(activeObject); // Display/update helpers for the active object
        } else {
             // If no object is active, just ensure helpers are clear
             clearMeshStructure();
        }
        
        if(controls) controls.enabled = true; // Orbit controls ON

    } else { // --- EXITING MODELING MODE ---
        clearSelection(); // Clear modeling V/E/F selection (removes proxy objects)
        clearMeshStructure(); // Dispose and remove all children from helper groups

        // Explicitly remove the helper groups from the scene when exiting modeling mode
        if(scene.children.includes(vertexHelpers)) scene.remove(vertexHelpers);
        if(scene.children.includes(edgeHelpers)) scene.remove(edgeHelpers);
        if(scene.children.includes(faceHelpers)) scene.remove(faceHelpers);

        transformControls.detach(); // Detach transform controls from any selected element
        deactivateCurrentArchTool(); // Also deactivate any active arch tool
        cancelLoopCut(); // Ensure loop cut is cleaned up
        finishSplineDrawing(); // Ensure spline drawing is cleaned up
        
        // Architectural elements remain selectable/visible
        if(controls) controls.enabled = true; // Re-enable orbit controls
    }
    
    // Update UI panels that depend on modeling mode or active object
    updateModifierPanelVisibility();
    updateSnappingUI();
}

function setSelectionMode(mode) {
    if (!isModelingMode) { // Only allow setting selection mode if in modeling mode
        console.warn("Cannot set selection mode: Not in Modeling Mode.");
        return;
    }
    console.log("Selection Mode:", mode);
    const oldSelectionMode = selectionMode;
    selectionMode = mode;

    ['select-vertex', 'select-edge', 'select-face'].forEach(id => {
        const button = document.getElementById(id);
        if(button) button.classList.toggle('active-tool', id === `select-${mode}`);
    });

    if (oldSelectionMode !== selectionMode) { // Only clear if mode actually changed
        clearSelection(); // Clear previous V/E/F selection proxies
    }

    if (activeObject) {
        showMeshStructure(activeObject); // Display/update helpers for the new mode
    } else {
        clearMeshStructure(); // No active object, clear any existing helpers
    }
}

/**
 * Disposes of all geometry/material and removes all children from the
 * vertex, edge, and face helper groups. It does NOT remove the groups
 * from the scene, as that is handled by the toggleModelingMode function.
 */
function clearMeshStructure() {
    [vertexHelpers, edgeHelpers, faceHelpers].forEach(group => {
        for (let i = group.children.length - 1; i >= 0; i--) {
            const child = group.children[i];
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
    });
    console.log("Cleared all modeling helpers.");
}

// Add Debounce for Mouse Move Raycasting
let hoverUpdateTimeout;
function onModelingMouseMove(event) {
     clearTimeout(hoverUpdateTimeout);
     hoverUpdateTimeout = setTimeout(() => {
          processModelingMouseMove(event);
     }, 50); // Debounce time for hover check
}

function processModelingMouseMove(event) { // Renamed original function
    if (isLoopCutMode) return;
    if (!isModelingMode || !activeObject || isTransforming) return; // Don't highlight while transforming

    // Ensure mouse coordinates are relative to the canvas
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    // ++ Set Line Precision ++
    raycaster.params.Line.threshold = 0.1; // Adjust as needed

    resetHighlights(); // Reset previous hover highlights

    let intersected = false;
    switch (selectionMode) {
        case 'vertex': intersected = highlightVertices(); break;
        case 'edge':   intersected = highlightEdges();   break;
        case 'face':   intersected = highlightFaces();   break;
    }
     renderer.domElement.style.cursor = intersected ? 'pointer' : 'default'; // Change cursor on hover
}

/*
function onModelingClick(event) {
    if (!isModelingMode || !activeObject || isTransforming) return;

    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    raycaster.params.Line.threshold = 0.1;

    const isAdditive = event.shiftKey;
    if (!isAdditive) {
        clearSelection();
    }
    
    resetHighlights();
    let selectionChanged = false;
    let targetIntersection = null;

    switch (selectionMode) {
        case 'vertex':
            const v_intersects = raycaster.intersectObjects(vertexHelpers.children, true);
            targetIntersection = findClosestIntersection(v_intersects, 'vertex-instanced');
            if (targetIntersection) {
                selectVertex(targetIntersection, isAdditive);
                selectionChanged = true;
            }
            break;
        case 'edge':
            const e_intersects = raycaster.intersectObjects(edgeHelpers.children, true);
            targetIntersection = findClosestIntersection(e_intersects, 'edge');
            if (targetIntersection) {
                selectEdge(targetIntersection, isAdditive);
                selectionChanged = true;
            }
            break;
        case 'face':
            const f_intersects = raycaster.intersectObjects(faceHelpers.children, true);
            targetIntersection = findClosestIntersection(f_intersects, 'face');
            if (targetIntersection) {
                selectFace(targetIntersection, isAdditive);
                selectionChanged = true;
            }
            break;
    }

    if (!selectionChanged && !isAdditive) {
        clearSelection();
    }
    
    // This call is crucial to show the gizmo correctly after any selection change.
    updateTransformControlsAttachment();
}*/

function onModelingClick(event) {
    if (!isModelingMode || !activeObject || isTransforming) return;

    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    raycaster.params.Line.threshold = 0.1; // Ensure this is appropriate for click detection

    const isAdditive = event.shiftKey;
    let targetIntersection = null;

    // 1. Find the clicked element (if any)
    switch (selectionMode) {
        case 'vertex':
            const v_intersects = raycaster.intersectObjects(vertexHelpers.children, true);
            targetIntersection = findClosestIntersection(v_intersects, 'vertex-instanced');
            break;
        case 'edge':
            const e_intersects = raycaster.intersectObjects(edgeHelpers.children, true);
            targetIntersection = findClosestIntersection(e_intersects, 'edge');
            break;
        case 'face':
            const f_intersects = raycaster.intersectObjects(faceHelpers.children, true);
            targetIntersection = findClosestIntersection(f_intersects, 'face');
            break;
    }

    if (targetIntersection) {
        // An element was clicked
        const clickedProxyData = extractProxyDataFromIntersection(targetIntersection);
        if (!clickedProxyData) { // Should not happen with findClosestIntersection, but for safety
            console.warn("Could not extract proxy data from intersection.");
            return;
        }

        // Find if this specific element is already in the selection
        const existingProxy = selectedElements.find(p => areProxiesEqual(p.userData, clickedProxyData));

        if (existingProxy) {
            // Element is already selected
            if (isAdditive) {
                // Shift-click on already selected: Deselect it
                switch (selectionMode) {
                    case 'vertex': deselectVertex(existingProxy); break;
                    case 'edge': deselectEdge(existingProxy); break;
                    case 'face': deselectFace(existingProxy); break;
                }
            } else {
                // Non-additive click on already selected: Keep only this one selected
                // This means clearing *all other* selected elements, but not this one.
                if (selectedElements.length > 1) { // Only if more than one is selected
                    // Create a temporary list of proxies to deselect
                    const toDeselect = selectedElements.filter(p => p !== existingProxy);
                    toDeselect.forEach(p => {
                        switch (p.userData.type) {
                            case 'vertex': deselectVertex(p); break;
                            case 'edge': deselectEdge(p); break;
                            case 'face': deselectFace(p); break;
                        }
                    });
                    // existingProxy remains in selectedElements
                }
                // If only one was selected and clicked non-additively, no change.
            }
        } else {
            // Element is NOT selected
            if (!isAdditive) {
                clearSelection(); // Clear previous selection if not additive
            }
            // Select the new element
            switch (selectionMode) {
                case 'vertex': selectVertex(targetIntersection); break; // No isAdditive param here now, clear is handled above
                case 'edge': selectEdge(targetIntersection); break;
                case 'face': selectFace(targetIntersection); break;
            }
        }
    } else {
        // No modeling element was clicked (clicked empty space)
        if (!isAdditive) {
            clearSelection(); // Clear all selection if not additive
        }
    }

    // Always update gizmo and highlights after any selection change
    updateTransformControlsAttachment();
    resetHighlights(); // Ensure highlights are updated correctly (selected remain highlighted)
}

// --- Helper function for onModelingClick ---
// Extracts identifying data from an intersection to compare with existing proxies
function extractProxyDataFromIntersection(intersection) {
    const obj = intersection.object;
    if (obj.userData.type === 'vertex-instanced') {
        const instanceId = intersection.instanceId;
        const vertexIndex = obj.userData.vertexIndices[instanceId];
        return { type: 'vertex', vertexIndex: vertexIndex };
    } else if (obj.userData.type === 'edge') {
        return { type: 'edge', indices: obj.userData.indices }; // Use edge indices for comparison
    } else if (obj.userData.type === 'face') {
        return { type: 'face', faceIndex: obj.userData.faceIndex }; // Use faceIndex for comparison
    }
    return null;
}

// Helper to compare if two proxy data objects refer to the same element
function areProxiesEqual(proxyData1, proxyData2) {
    if (!proxyData1 || !proxyData2 || proxyData1.type !== proxyData2.type) return false;

    if (proxyData1.type === 'vertex') {
        return proxyData1.vertexIndex === proxyData2.vertexIndex;
    } else if (proxyData1.type === 'edge') {
        // Compare edge indices (order-agnostic)
        const [u1, v1] = proxyData1.indices;
        const [u2, v2] = proxyData2.indices;
        return (u1 === u2 && v1 === v2) || (u1 === v2 && v1 === u2);
    } else if (proxyData1.type === 'face') {
        return proxyData1.faceIndex === proxyData2.faceIndex;
    }
    return false;
}

// Helper to find the closest valid intersection from potentially multiple hits
function findClosestIntersection(intersects, targetType) {
    for (let i = 0; i < intersects.length; i++) {
        const obj = intersects[i].object;
        if (obj.userData.type === targetType || (targetType === 'vertex-instanced' && obj.userData.type === 'vertex-instanced')) {
            return intersects[i]; // Return the first valid one (closest)
        }
        // Check parent if direct hit is on sub-component (less common with current setup)
        if (obj.parent && obj.parent.userData.type === targetType) {
             // Need to adjust intersection data if using parent
             // For now, rely on direct hits on helpers
        }
    }
    return null; // No valid intersection found
}


// Highlight vertices on hover
function highlightVertices() {
    // No need to reset here, resetHighlights() is called before this in mousemove
    const intersects = raycaster.intersectObjects(vertexHelpers.children, true);
    const closest = findClosestIntersection(intersects, 'vertex-instanced');

    if (closest) {
        const hitObject = closest.object; // InstancedMesh
        const instanceId = closest.instanceId;

        if (instanceId !== undefined) {
            // Apply temporary color change to the instance
            hitObject.setColorAt(instanceId, new THREE.Color(0xFF0000)); // Red hover
            hitObject.instanceColor.needsUpdate = true;
             return true; // Indicate something was highlighted
        }
    }
     return false;
}


// Highlight edges on hover
function highlightEdges() {
    const intersects = raycaster.intersectObjects(edgeHelpers.children, true);
     const closest = findClosestIntersection(intersects, 'edge');
    if (closest) {
        closest.object.material.color.set(0xFF0000); // Red hover
         return true;
    }
     return false;
}


function highlightFaces() {
    const intersects = raycaster.intersectObjects(faceHelpers.children, true);
     const closest = findClosestIntersection(intersects, 'face');

    if (closest) {
        // Temporarily increase opacity or change color for hover effect
        closest.object.material.color.set(0xFF8C00); // Dark Orange hover
        closest.object.material.opacity = Math.min(1, parseFloat(document.getElementById('faceOpacitySlider').value) + 0.4);
         return true;
    }
     return false;
}

/*
function resetHighlights() {
     // Reset vertex instance colors
    vertexHelpers.children.forEach(child => {
        if (child.isInstancedMesh && child.userData.type === 'vertex-instanced' && child.instanceColor) {
             const baseColor = new THREE.Color(0x2222FF); // Blue default
             for (let i = 0; i < child.count; i++) {
                   // Only reset if not currently selected
                   // Need a way to track selected instances - simplified for now
                   // Assume ALL are reset unless selection logic below overrides
                   child.setColorAt(i, baseColor);
             }
             child.instanceColor.needsUpdate = true;
        }
          // Remove temporary highlight spheres if any were added (shouldn't be needed now)
        if (child.userData && child.userData.isHighlight) {
              vertexHelpers.remove(child);
         }
    });


    edgeHelpers.children.forEach(child => {
         if (child.isLine && child.userData.type === 'edge') {
               // Set back to default orange, unless it's the selected one
                const isSelected = selectedElements.some(elem => elem.userData.type === 'edge' && elem.userData.edge === child);
                child.material.color.set(isSelected ? 0xFF0000 : 0xE67E22); // Red if selected, Orange otherwise
           }
    });

     const baseFaceOpacity = parseFloat(document.getElementById('faceOpacitySlider').value);
    faceHelpers.children.forEach(child => {
        if (child.isMesh && child.userData.type === 'face') {
              const isSelected = selectedElements.some(elem => elem.userData.type === 'face' && elem.userData.face === child);
               child.material.color.set(isSelected ? 0xFF0000 : 0x44DD88); // Red if selected, Green otherwise
              child.material.opacity = isSelected ? Math.min(1, baseFaceOpacity + 0.4) : baseFaceOpacity; // Slightly more opaque if selected
         }
    });
     renderer.domElement.style.cursor = 'default'; // Reset cursor
}*/

function resetHighlights() {
    // Collect all currently selected instance IDs and their meshes
    const selectedVertexInstances = new Map(); // Map<instancedMesh, Set<instanceId>>
    const selectedEdgeHelpers = new Set();    // Set<edgeHelperObject>
    const selectedFaceHelpers = new Set();    // Set<faceHelperObject>

    selectedElements.forEach(elem => {
        if (elem.userData.type === 'vertex') {
            const mesh = elem.userData.instancedMesh;
            const id = elem.userData.instanceId;
            if (mesh && id !== undefined) {
                if (!selectedVertexInstances.has(mesh)) {
                    selectedVertexInstances.set(mesh, new Set());
                }
                selectedVertexInstances.get(mesh).add(id);
            }
        } else if (elem.userData.type === 'edge') {
            if (elem.userData.edge) {
                selectedEdgeHelpers.add(elem.userData.edge);
            }
        } else if (elem.userData.type === 'face') {
            if (elem.userData.face) {
                selectedFaceHelpers.add(elem.userData.face);
            }
        }
    });

    // Reset vertex instance colors
    vertexHelpers.children.forEach(child => {
        if (child.isInstancedMesh && child.userData.type === 'vertex-instanced' && child.instanceColor) {
            const baseColor = new THREE.Color(0x2222FF); // Blue default
            const selectedColor = new THREE.Color(0xFF0000); // Red selection color
            const instanceIds = child.userData.vertexIndices;

            for (let i = 0; i < child.count; i++) {
                const originalIndex = instanceIds[i]; // The original vertex index this instance represents
                const isSelected = selectedVertexInstances.has(child) && selectedVertexInstances.get(child).has(i);
                child.setColorAt(i, isSelected ? selectedColor : baseColor);
            }
            child.instanceColor.needsUpdate = true;
        }
    });

    // Reset edge colors
    edgeHelpers.children.forEach(child => {
         if (child.isLine && child.userData.type === 'edge') {
               const isSelected = selectedEdgeHelpers.has(child);
                child.material.color.set(isSelected ? 0x00FFFF : 0xE67E22); // Aqua if selected, Orange otherwise
           }
    });

    // Reset face colors and opacity
    const baseFaceOpacity = parseFloat(document.getElementById('faceOpacitySlider').value);
    faceHelpers.children.forEach(child => {
        if (child.isMesh && child.userData.type === 'face') {
              const isSelected = selectedFaceHelpers.has(child);
               child.material.color.set(isSelected ? 0xFF0000 : 0x44DD88); // Red if selected, Green otherwise
              child.material.opacity = isSelected ? Math.min(1, baseFaceOpacity + 0.4) : baseFaceOpacity; // Slightly more opaque if selected
         }
    });
     renderer.domElement.style.cursor = 'default'; // Reset cursor
}


// ++ Helper function to capture the state used as the 'original' reference ++
function captureOriginalState(proxyObject) {
     if (!activeObject || !proxyObject || !proxyObject.userData.indices) return;

     const userData = proxyObject.userData;
     const geometry = activeObject.geometry;
     const positions = geometry.attributes.position;
     const matrixWorld = activeObject.matrixWorld;

     userData.originalVertices = userData.indices.map(index =>
         new THREE.Vector3().fromBufferAttribute(positions, index).applyMatrix4(matrixWorld)
     );

      // Calculate center based on *current* vertex positions
     if (userData.type === 'edge' && userData.originalVertices.length === 2) {
         userData.originalCenter = userData.originalVertices[0].clone().add(userData.originalVertices[1]).multiplyScalar(0.5);
     } else if (userData.type === 'face' && userData.originalVertices.length >= 3) {
           // Use average of vertices for face center (more robust for n-gons if supported later)
            userData.originalCenter = new THREE.Vector3();
            userData.originalVertices.forEach(v => userData.originalCenter.add(v));
            userData.originalCenter.divideScalar(userData.originalVertices.length);
     } else {
          userData.originalCenter = proxyObject.position.clone(); // Fallback for vertex?
     }
      console.log(`Original state updated for ${userData.type}`);
}


/**
 * The user-facing function that applies subdivision to the selected object
 * and correctly integrates with the history and UI systems.
 * @param {number} [level=1] The number of subdivision iterations to perform.
 * (Assumes `activeObject`, `baseGeometries`, `window.historyManager`, `document`, `THREE` are global)
 */
function applySubdivision(level = 1) {
    if (!activeObject || !activeObject.geometry) {
        alert("No active object selected.");
        return;
    }
    
    // 1. Clone the geometry BEFORE the loop starts to save its "undo" state.
    const oldGeometry = activeObject.geometry.clone();

    // 2. Perform the subdivision operation iteratively.
    let currentGeometry = activeObject.geometry;
    for (let i = 0; i < level; i++) {
        let subdivided = subdivideGeometry(currentGeometry);
        // Dispose of intermediate geometries to save memory
        if (currentGeometry !== activeObject.geometry) {
             currentGeometry.dispose();
        }
        currentGeometry = subdivided;
    }

    // 3. Dispose the original geometry and assign the final result.
    activeObject.geometry.dispose();
    activeObject.geometry = currentGeometry;
    
    // 4. Record the final result against the original state in the history manager.
    if (window.historyManager) { // Assumes window.historyManager is available
        window.historyManager.recordGeometryChange(activeObject, oldGeometry);
    }

    // 5. Update the editor's internal state and visual helpers.
    // (Assumes buildEdgeFaceMap, buildVertexEdgeMap, buildVertexFaceMap are available)
    edgeFaceMap = buildEdgeFaceMap(currentGeometry);
    // vertexEdgeMap = buildVertexEdgeMap(currentGeometry); // Not directly used by edge/face helpers
    // vertexFaceMap = buildVertexFaceMap(currentGeometry); // Not directly used by edge/face helpers
    updateEdgeFaceHelpers(); // Refresh visual helpers
    
    alert("Subdivision applied successfully!");
}

/**
 * Merges vertices in a BufferGeometry that are in the same position,
 * and correctly remaps all other BufferAttributes (normals, UVs, colors, etc.).
 *
 * @param {THREE.BufferGeometry} geometry The geometry to process.
 * @param {number} [tolerance=1e-5] A tolerance for comparing vertex positions.
 * @returns {THREE.BufferGeometry} A new, optimized BufferGeometry with merged vertices
 *                                  and remapped attributes.
 */
function mergeVerticesByPosition(geometry, tolerance = 1e-5) {
    if (!geometry || !geometry.attributes.position) {
        console.error("mergeVerticesByPosition requires valid geometry with a position attribute.");
        return geometry;
    }

    const positions = geometry.attributes.position.array;
    const originalVertexCount = geometry.attributes.position.count;
    const indexAttr = geometry.index ? geometry.index.array : null;

    const newPositions = [];
    const vertexMap = new Map(); // Key: rounded position string -> Value: new unique vertex index
    const indexRemap = new Array(originalVertexCount); // Old vertex index -> New vertex index
    const newIndexToOldIndexMap = new Array(originalVertexCount); // New unique vertex index -> First old index that mapped to it

    // --- Pass 1: Identify unique vertices and build initial mappings ---
    for (let i = 0; i < originalVertexCount; i++) {
        const x = positions[i * 3];
        const y = positions[i * 3 + 1];
        const z = positions[i * 3 + 2];
        const key = `${x.toFixed(5)}_${y.toFixed(5)}_${z.toFixed(5)}`; // Use fixed precision for tolerance

        if (vertexMap.has(key)) {
            // This position already exists, remap the old index to the existing new index
            indexRemap[i] = vertexMap.get(key);
        } else {
            // This is a new unique position, add it and create a new mapping
            const newUniqueIndex = newPositions.length / 3;
            newPositions.push(x, y, z);
            vertexMap.set(key, newUniqueIndex);
            indexRemap[i] = newUniqueIndex;
            newIndexToOldIndexMap[newUniqueIndex] = i; // Store the original index
        }
    }

    const newUniqueVertexCount = newPositions.length / 3;

    // --- Pass 2: Remap all other BufferAttributes ---
    const remappedAttributes = {};
    for (const attributeName in geometry.attributes) {
        if (attributeName === 'position' || !geometry.attributes.hasOwnProperty(attributeName)) continue;

        const originalAttribute = geometry.attributes[attributeName];
        if (!originalAttribute.isBufferAttribute) {
             console.warn(`Skipping non-BufferAttribute '${attributeName}'.`);
             continue;
        }

        const itemSize = originalAttribute.itemSize;
        const ArrayType = originalAttribute.array.constructor;
        const newAttributeArray = new ArrayType(newUniqueVertexCount * itemSize);

        for (let newUniqueIndex = 0; newUniqueIndex < newUniqueVertexCount; newUniqueIndex++) {
            const sourceOldIndex = newIndexToOldIndexMap[newUniqueIndex];
            const originalOffset = sourceOldIndex * itemSize;
            const newOffset = newUniqueIndex * itemSize;

            for (let k = 0; k < itemSize; k++) {
                newAttributeArray[newOffset + k] = originalAttribute.array[originalOffset + k];
            }
        }
        remappedAttributes[attributeName] = new THREE.BufferAttribute(newAttributeArray, itemSize, originalAttribute.normalized);
    }

    // --- Pass 3: Build the new index array ---
    let newIndexArray = [];
    if (indexAttr) {
        // For indexed geometry
        for (let i = 0; i < indexAttr.length; i++) {
            newIndexArray[i] = indexRemap[indexAttr[i]];
        }
    } else {
        // For non-indexed geometry (this case is usually implicitly handled by BufferGeometry generation)
        // This part needs careful consideration if geometry is truly non-indexed and relies on sequential attributes.
        // For indexed geometry, it's straightforward.
        for (let i = 0; i < originalVertexCount; i++) {
            newIndexArray[i] = indexRemap[i];
        }
    }

    // Filter out degenerate triangles (where two or more vertices are the same after remapping)
    const filteredIndex = [];
    for (let i = 0; i < newIndexArray.length; i += 3) {
        const a = newIndexArray[i];
        const b = newIndexArray[i + 1];
        const c = newIndexArray[i + 2];
        if (a !== b && b !== c && c !== a) {
            filteredIndex.push(a, b, c);
        }
    }

    // --- Pass 4: Create and return the final, clean geometry ---
    const newGeo = new THREE.BufferGeometry();
    newGeo.setAttribute('position', new THREE.Float32BufferAttribute(newPositions, 3));
    newGeo.setIndex(filteredIndex);

    // Set all remapped attributes
    for (const attributeName in remappedAttributes) {
        newGeo.setAttribute(attributeName, remappedAttributes[attributeName]);
    }

    // Recompute vertex normals. This is crucial as merging vertices can change face connectivity
    // and thus the smoothing appearance. This will overwrite any 'normal' attribute that was copied,
    // but ensures geometrically correct normals for the new mesh structure.
    try {
        newGeo.computeVertexNormals();
    } catch (e) {
        console.error("Error computing normals after merge:", e);
    }
    
    newGeo.computeBoundingBox();
    newGeo.computeBoundingSphere();

    return newGeo;
}


/**
 * The user-facing function that applies the merge operation to the selected object
 * and correctly integrates with the history and UI systems.
 *
 * (Assumes `activeObject`, `window.historyManager`, `edgeFaceMap`, `vertexEdgeMap`, `vertexFaceMap`,
 * `buildEdgeFaceMap`, `buildVertexEdgeMap`, `buildVertexFaceMap`, `updateEdgeFaceHelpers` are global)
 */
function mergeActiveGeometry() {
    if (!activeObject || !activeObject.geometry) {
        alert("No active mesh selected.");
        return;
    }

    // 1. Clone the geometry BEFORE making changes to save its "undo" state.
    // The material is NOT part of the geometry, so it is untouched.
    const oldGeometry = activeObject.geometry.clone();

    // 2. Perform the core merge operation.
    const mergedGeometry = mergeVerticesByPosition(activeObject.geometry);
    
    // 3. Clean up the old geometry and assign the new one.
    activeObject.geometry.dispose(); // Dispose of the old geometry to prevent memory leaks
    activeObject.geometry = mergedGeometry; // Assign the new, merged geometry

    // 4. Record the action in the history manager for undo/redo functionality.
    if (window.historyManager) {
        window.historyManager.recordGeometryChange(activeObject, oldGeometry);
    }
 

    // 5. Update the editor's internal state and visual helpers.
    // These maps need to be rebuilt to reflect the new vertex and face structure.
    edgeFaceMap = buildEdgeFaceMap(mergedGeometry);
    vertexEdgeMap = buildVertexEdgeMap(mergedGeometry);
    vertexFaceMap = buildVertexFaceMap(mergedGeometry);
    updateEdgeFaceHelpers(); // Refresh visual helpers (vertices, edges, faces)

    alert("Vertices merged successfully!");
    console.log("Geometry after merge:", mergedGeometry);
}


/**
 * Subdivides an indexed BufferGeometry by splitting each triangle into four smaller ones.
 * @param {THREE.BufferGeometry} geometry The indexed geometry to subdivide.
 * @returns {THREE.BufferGeometry} A new, subdivided BufferGeometry.
 */
function subdivideGeometry(geometry) {
    if (!geometry || !geometry.index || !geometry.attributes.position) {
        console.warn("Geometry is not valid or not indexed. Cannot subdivide.");
        return geometry;
    }

    const positions = geometry.attributes.position.array;
    const indexArray = geometry.index.array;

    const oldVertices = [];
    for (let i = 0; i < positions.length; i += 3) {
        oldVertices.push(new THREE.Vector3(positions[i], positions[i + 1], positions[i + 2]));
    }

    const newVertices = [...oldVertices];
    const midpointCache = new Map(); // Caches new vertices on edges to prevent seams

    const newIndices = [];

    // Helper to find or create a midpoint vertex between two existing vertices
    const getMidpoint = (i1, i2) => {
        const key = i1 < i2 ? `${i1}_${i2}` : `${i2}_${i1}`; // Consistent key for shared edges
        if (midpointCache.has(key)) {
            return midpointCache.get(key); // Reuse existing midpoint
        }

        const v1 = newVertices[i1];
        const v2 = newVertices[i2];
        const mid = new THREE.Vector3().addVectors(v1, v2).multiplyScalar(0.5);
        const newIndex = newVertices.length;
        newVertices.push(mid);
        midpointCache.set(key, newIndex);
        return newIndex;
    };

    // Iterate over each triangle in the original geometry
    for (let i = 0; i < indexArray.length; i += 3) {
        const a = indexArray[i];
        const b = indexArray[i + 1];
        const c = indexArray[i + 2];

        // Get the indices of the new midpoint vertices
        const ab = getMidpoint(a, b);
        const bc = getMidpoint(b, c);
        const ca = getMidpoint(c, a);

        // Create the 4 new triangles that replace the original one
        newIndices.push(a, ab, ca);
        newIndices.push(ab, b, bc);
        newIndices.push(ca, bc, c);
        newIndices.push(ab, bc, ca); // The central triangle
    }

    // Flatten the vertex array for the new BufferAttribute
    const flatPositions = [];
    for (const v of newVertices) {
        flatPositions.push(v.x, v.y, v.z);
    }

    // Create and return the final, subdivided geometry
    const newGeometry = new THREE.BufferGeometry();
    newGeometry.setAttribute("position", new THREE.Float32BufferAttribute(flatPositions, 3));
    newGeometry.setIndex(newIndices);
    newGeometry.computeVertexNormals();
    newGeometry.computeBoundingBox();
    newGeometry.computeBoundingSphere();

    return newGeometry;
}

/*function convertSelectedEdgesToProfile() {
    // 1. --- VALIDATION ---
    if (!isModelingMode || !activeObject) {
        alert("Please enter modeling mode and select an object first.");
        return;
    }
    if (selectionMode !== 'edge' || selectedElements.length === 0) {
        alert("Please select a continuous chain of edges to convert to a profile.");
        return;
    }

    console.log(`Attempting to convert ${selectedElements.length} selected edges to a profile...`);

    // 2. --- BUILD TOPOLOGY FROM SELECTION ---
    // We need to order the vertices correctly. We'll build a map to trace the path.
    const vertexConnections = new Map(); // Map<vertexIndex, [connectedVertexIndex, ...]>
    const allVertexIndicesInSelection = new Set();

    for (const edgeProxy of selectedElements) {
        const [v1, v2] = edgeProxy.userData.indices;
        
        // Add forward connection
        if (!vertexConnections.has(v1)) vertexConnections.set(v1, []);
        vertexConnections.get(v1).push(v2);

        // Add backward connection
        if (!vertexConnections.has(v2)) vertexConnections.set(v2, []);
        vertexConnections.get(v2).push(v1);
        
        allVertexIndicesInSelection.add(v1);
        allVertexIndicesInSelection.add(v2);
    }

    // 3. --- FIND THE START AND END OF THE CHAIN ---
    // An open chain will have exactly two vertices with only one connection.
    const endPoints = [];
    for (const [vertex, connections] of vertexConnections.entries()) {
        if (connections.length === 1) {
            endPoints.push(vertex);
        }
        // If a vertex has more than 2 connections, it's a branch, which is invalid for a simple profile.
        if (connections.length > 2) {
             alert("Error: The selected edges form a branch (a vertex connects to more than two other selected edges). Please select a single, unbranched chain.");
             console.error("Profile creation failed: Branched selection detected.", vertexConnections);
             return;
        }
    }

    if (endPoints.length !== 2) {
        alert(`Error: The selected edges must form a single, open chain. Found ${endPoints.length} endpoints, but expected 2. (If you selected a closed loop, this tool currently requires an open profile).`);
        console.error("Profile creation failed: Not an open chain.", endPoints);
        return;
    }

    // 4. --- TRACE THE PATH TO GET ORDERED VERTICES ---
    const orderedVertexIndices = [];
    let currentVertex = endPoints[0];
    let previousVertex = -1; // No previous vertex at the start

    while (orderedVertexIndices.length < allVertexIndicesInSelection.size) {
        orderedVertexIndices.push(currentVertex);
        const connections = vertexConnections.get(currentVertex);
        const nextVertex = connections.find(v => v !== previousVertex);

        if (nextVertex === undefined) {
            // This should not happen in a valid chain
            break;
        }

        previousVertex = currentVertex;
        currentVertex = nextVertex;
    }
    
    if (orderedVertexIndices.length !== allVertexIndicesInSelection.size) {
        alert("Error: Could not trace the selected edges into a single path. Please ensure they are all connected.");
        console.error("Profile creation failed: Path tracing did not visit all vertices.");
        return;
    }

    // 5. --- CONVERT 3D VERTICES TO 2D PROFILE POINTS ---
    // We will project the 3D points onto the object's local XY plane.
    const positions = activeObject.geometry.attributes.position;
    const profilePoints2D = orderedVertexIndices.map(index => {
        const x = positions.getX(index);
        const y = positions.getY(index);
        // Note: We are ignoring the Z component to create a 2D shape.
        return new THREE.Vector2(x, y);
    });

    // 6. --- CREATE AND STORE THE SPLINE PROFILE ---
    const profileShape = new THREE.Shape(profilePoints2D);
    
    // Store it in your global spline management object
    editedSplines.profile = profileShape;
    
    // Optional: Add to a list for UI dropdowns
    const name = `Profile_From_Edges_${Date.now()}`;
    editedSplines.list.push({ name: name, type: 'profile', splineObject: profileShape });

    alert(`Successfully created a 2D profile from ${selectedElements.length} edges! You can now use the Spin tool.`);
    console.log("Created Profile:", editedSplines.profile);
    
    // Deselect the edges, as the operation is complete.
    clearSelection();
}*/ 


function convertSelectedEdgesToProfile() {
    // 1. --- VALIDATION ---
    if (!isModelingMode || !activeObject) {
        alert("Please enter modeling mode and select an object first.");
        return;
    }
    if (selectionMode !== 'edge' || selectedElements.length === 0) {
        alert("Please select a continuous chain of edges to convert to a profile.");
        return;
    }

    // 2. --- TRACE EDGES TO GET AN ORDERED 3D PATH ---
    const vertexConnections = new Map();
    const allVertexIndicesInSelection = new Set();

    for (const edgeProxy of selectedElements) {
        const [v1, v2] = edgeProxy.userData.indices;
        if (!vertexConnections.has(v1)) vertexConnections.set(v1, []);
        vertexConnections.get(v1).push(v2);
        if (!vertexConnections.has(v2)) vertexConnections.set(v2, []);
        vertexConnections.get(v2).push(v1);
        allVertexIndicesInSelection.add(v1);
        allVertexIndicesInSelection.add(v2);
    }

    const endPoints = Array.from(allVertexIndicesInSelection).filter(v => vertexConnections.get(v)?.length === 1);
    const branchPoints = Array.from(allVertexIndicesInSelection).filter(v => vertexConnections.get(v)?.length > 2);

    if (branchPoints.length > 0) {
        alert("Error: The selected edges form a branch. Please select a single, unbranched chain.");
        return;
    }
    if (endPoints.length !== 2) {
        alert(`Error: The selected edges must form a single, open chain (not a closed loop). Found ${endPoints.length} endpoints, but expected 2.`);
        return;
    }

    const orderedVertexIndices = [];
    let currentVertex = endPoints[0];
    let previousVertex = -1;
    while (orderedVertexIndices.length < allVertexIndicesInSelection.size) {
        orderedVertexIndices.push(currentVertex);
        const nextVertex = vertexConnections.get(currentVertex).find(v => v !== previousVertex);
        if (nextVertex === undefined) break;
        previousVertex = currentVertex;
        currentVertex = nextVertex;
    }

    // 3. --- CONVERT ORDERED INDICES TO 3D WORLD-SPACE POINTS ---
    const positions = activeObject.geometry.attributes.position;
    const orderedPoints3D = orderedVertexIndices.map(index => 
        new THREE.Vector3().fromBufferAttribute(positions, index).applyMatrix4(activeObject.matrixWorld)
    );

    // 4. --- INTELLIGENT 2D PROJECTION ---
    // Create a 2D coordinate system based on the camera's view
    const centerPoint3D = orderedPoints3D.reduce((acc, p) => acc.add(p), new THREE.Vector3()).divideScalar(orderedPoints3D.length);
    const cameraDirection = new THREE.Vector3();
    camera.getWorldDirection(cameraDirection);
    
    // The 2D plane's axes
    const axisY = camera.up.clone();
    const axisX = new THREE.Vector3().crossVectors(cameraDirection, axisY).normalize();

    // Project the 3D points onto this new 2D system
    const profilePoints2D = orderedPoints3D.map(point3D => {
        const relativePoint = point3D.clone().sub(centerPoint3D);
        return new THREE.Vector2(
            relativePoint.dot(axisX),
            relativePoint.dot(axisY)
        );
    });

    // 5. --- CREATE AND STORE THE PROFILE AND PIVOT ---
    const profileShape = new THREE.Shape(profilePoints2D);
    
    editedSplines.profile = profileShape;
    // CRUCIAL: Store the 3D center point. This will be the pivot for the spin.
    editedSplines.profile.userData = { pivot3D: centerPoint3D };
    
    alert(`Successfully created a 2D profile from ${selectedElements.length} edges! You can now use the Spin tool.`);
    console.log("Created Profile:", editedSplines.profile);
    
    clearSelection();
}

/*function selectVertex(intersection) {
    clearSelection();
    const hitObject = intersection.object; // InstancedMesh

    if (hitObject.userData.type === 'vertex-instanced') {
        const instanceId = intersection.instanceId;
        if (instanceId !== undefined) {
            const vertexIndex = hitObject.userData.vertexIndices[instanceId];
             // Get vertex position in WORLD space
            const vertexWorldPos = new THREE.Vector3().fromBufferAttribute(
                activeObject.geometry.attributes.position, vertexIndex
            ).applyMatrix4(activeObject.matrixWorld);

            const vertexProxy = new THREE.Object3D();
             vertexProxy.position.copy(vertexWorldPos); // Proxy starts at vertex world pos
            vertexProxy.userData = {
                type: 'vertex',
                vertexIndex: vertexIndex,
                // Store reference to helper mesh + instance ID if needed for visual feedback
                instancedMesh: hitObject,
                instanceId: instanceId
             };
             // No 'originalVertices' needed for single vertex selection

            scene.add(vertexProxy); // Add proxy to scene for transform controls
            selectedElements = [vertexProxy];
            transformControls.attach(vertexProxy);

             // Highlight selected instance
            hitObject.setColorAt(instanceId, new THREE.Color(0xFF0000)); // Red selection color
            hitObject.instanceColor.needsUpdate = true;
             console.log("Selected vertex index:", vertexIndex);
        }
    }
}


function selectEdge(intersection) {
    clearSelection();
    const edgeHelper = intersection.object; // The THREE.Line helper
    const indices = edgeHelper.userData.indices;

    // Create proxy object at the center
    const edgeProxy = new THREE.Object3D();
    edgeProxy.userData = {
        type: 'edge',
        edge: edgeHelper, // Reference to the visual helper
        indices: indices,
        originalVertices: [], // To be populated by captureOriginalState
        originalCenter: new THREE.Vector3() // To be populated by captureOriginalState
    };

    captureOriginalState(edgeProxy); // Populate originals based on *current* geometry state
    edgeProxy.position.copy(edgeProxy.userData.originalCenter); // Position proxy

    scene.add(edgeProxy);
    selectedElements = [edgeProxy];
    transformControls.attach(edgeProxy);

     // Highlight selected helper
     edgeHelper.material.color.set(0x00FFFF); // aqua
    console.log("Selected edge between vertices:", indices);
}

function selectFace(intersection) {
    clearSelection();
    const faceHelper = intersection.object; // The THREE.Mesh helper
    const indices = faceHelper.userData.indices;

    const faceProxy = new THREE.Object3D();
     faceProxy.userData = {
        type: 'face',
        face: faceHelper, // Reference to the visual helper
        indices: indices,
        originalVertices: [], // To be populated by captureOriginalState
        originalCenter: new THREE.Vector3() // To be populated by captureOriginalState
    };

     captureOriginalState(faceProxy); // Populate originals based on *current* geometry state
     faceProxy.position.copy(faceProxy.userData.originalCenter); // Position proxy


    scene.add(faceProxy);
    selectedElements = [faceProxy];
    transformControls.attach(faceProxy);

    // Highlight selected helper
     faceHelper.material.color.set(0xFF0000);
     faceHelper.material.opacity = Math.min(1, parseFloat(document.getElementById('faceOpacitySlider').value) + 0.4);
    console.log("Selected face with vertices:", indices);
}*/ 

// --- DEPENDENCIES (Assumed global) ---
// activeObject, scene, transformControls, selectedElements, captureOriginalState, resetHighlights,
// vertexHelpers, edgeHelpers, faceHelpers, document

/**
 * Adds an edge to the selection.
 * @param {object} intersection - The raycaster intersection object.
 */
function selectEdge(intersection) { // Removed isAdditive, handled by onModelingClick
    const edgeHelper = intersection.object; // The THREE.Line helper
    const indices = edgeHelper.userData.indices;
    const edgeKey = getEdgeKey(indices[0], indices[1]);

    // This check is mostly redundant if onModelingClick is doing its job, but good for safety
    if (selectedElements.some(p => areProxiesEqual(p.userData, {type: 'edge', indices: indices}))) {
        return;
    }

    const edgeProxy = new THREE.Object3D();
    edgeProxy.userData = {
        type: 'edge',
        edge: edgeHelper, // Reference to the visual helper
        indices: indices,
        // Crucial for multi-selection: Stores initial world positions of constituent vertices
        originalVerticesWorld: indices.map(idx =>
            new THREE.Vector3().fromBufferAttribute(activeObject.geometry.attributes.position, idx).applyMatrix4(activeObject.matrixWorld)
        ),
        // This 'originalCenter' is for the *individual proxy's* initial position if it were a single selection.
        // For multi-selection, the pivot handles the center.
        originalCenter: new THREE.Vector3() 
    };
    edgeProxy.userData.originalCenter.addVectors(edgeProxy.userData.originalVerticesWorld[0], edgeProxy.userData.originalVerticesWorld[1]).multiplyScalar(0.5);

    edgeProxy.position.copy(edgeProxy.userData.originalCenter); // Position proxy for TransformControls
    scene.add(edgeProxy);
    selectedElements.push(edgeProxy);

    // Highlight selected helper
    edgeHelper.material.color.set(0x00FFFF); // Aqua
    console.log("Selected edge between vertices:", indices);
}

/**
 * Adds a face to the selection.
 * @param {object} intersection - The raycaster intersection object.
 */
function selectFace(intersection) { // Removed isAdditive, handled by onModelingClick
    const faceHelper = intersection.object; // The THREE.Mesh helper
    const indices = faceHelper.userData.indices; // The original vertex indices of the face
    const faceIndex = faceHelper.userData.faceIndex;

    // This check is mostly redundant if onModelingClick is doing its job, but good for safety
    if (selectedElements.some(p => areProxiesEqual(p.userData, {type: 'face', faceIndex: faceIndex}))) {
        return;
    }

    const faceProxy = new THREE.Object3D();
    faceProxy.userData = {
        type: 'face',
        face: faceHelper, // Reference to the visual helper
        indices: indices,
        // Crucial for multi-selection: Stores initial world positions of constituent vertices
        originalVerticesWorld: indices.map(idx =>
            new THREE.Vector3().fromBufferAttribute(activeObject.geometry.attributes.position, idx).applyMatrix4(activeObject.matrixWorld)
        ),
        // This 'originalCenter' is for the *individual proxy's* initial position if it were a single selection.
        // For multi-selection, the pivot handles the center.
        originalCenter: new THREE.Vector3()
    };
    faceProxy.userData.originalVerticesWorld.forEach(v => faceProxy.userData.originalCenter.add(v));
    faceProxy.userData.originalCenter.divideScalar(faceProxy.userData.originalVerticesWorld.length);

    faceProxy.position.copy(faceProxy.userData.originalCenter); // Position proxy for TransformControls
    scene.add(faceProxy);
    selectedElements.push(faceProxy);

    // Highlight selected helper
    faceHelper.material.color.set(0xFF0000); // Red
    faceHelper.material.opacity = Math.min(1, parseFloat(document.getElementById('faceOpacitySlider').value) + 0.4);
    console.log("Selected face with vertices:", indices);
}

// And slightly update selectVertex to match the originalWorldPos pattern for consistency
function selectVertex(intersection) { // Removed isAdditive, handled by onModelingClick
    const hitObject = intersection.object; // InstancedMesh
    if (hitObject.userData.type === 'vertex-instanced') {
        const instanceId = intersection.instanceId;
        if (instanceId !== undefined) {
            const vertexIndex = hitObject.userData.vertexIndices[instanceId];
            
            // Check if already selected (should be handled by onModelingClick, but good safeguard)
            if (selectedElements.some(p => p.userData.type === 'vertex' && p.userData.vertexIndex === vertexIndex)) {
                return; 
            }

            // Get vertex position in WORLD space
            const vertexWorldPos = new THREE.Vector3().fromBufferAttribute(
                activeObject.geometry.attributes.position, vertexIndex
            ).applyMatrix4(activeObject.matrixWorld);

            const vertexProxy = new THREE.Object3D();
            vertexProxy.position.copy(vertexWorldPos);
            vertexProxy.userData = {
                type: 'vertex',
                vertexIndex: vertexIndex,
                instancedMesh: hitObject,
                instanceId: instanceId,
                originalWorldPos: vertexWorldPos.clone() // Store initial world position
            };

            scene.add(vertexProxy);
            selectedElements.push(vertexProxy);

            // Highlight selected instance immediately
            hitObject.setColorAt(instanceId, new THREE.Color(0xFF0000)); // Red selection color
            hitObject.instanceColor.needsUpdate = true;
            console.log("Selected vertex index:", vertexIndex);
        }
    }
}


/**
 * Removes a vertex proxy from the selection and cleans up its visuals.
 * @param {THREE.Object3D} vertexProxy - The proxy object representing the selected vertex.
 */
function deselectVertex(vertexProxy) {
    const index = selectedElements.indexOf(vertexProxy);
    if (index > -1) {
        selectedElements.splice(index, 1);
        scene.remove(vertexProxy); // Remove proxy object

        // Revert highlight on the instanced mesh
        const instancedMesh = vertexProxy.userData.instancedMesh;
        const instanceId = vertexProxy.userData.instanceId;
        if (instancedMesh && instanceId !== undefined) {
            instancedMesh.setColorAt(instanceId, new THREE.Color(0x2222FF)); // Revert to blue
            instancedMesh.instanceColor.needsUpdate = true;
        }
        if (vertexProxy.geometry) vertexProxy.geometry.dispose();
        console.log("Deselected vertex index:", vertexProxy.userData.vertexIndex);
    }
}

/**
 * Removes an edge proxy from the selection and cleans up its visuals.
 * @param {THREE.Object3D} edgeProxy - The proxy object representing the selected edge.
 */
function deselectEdge(edgeProxy) {
    const index = selectedElements.indexOf(edgeProxy);
    if (index > -1) {
        selectedElements.splice(index, 1);
        scene.remove(edgeProxy); // Remove proxy object

        // Revert highlight on the edge helper
        const edgeHelper = edgeProxy.userData.edge;
        if (edgeHelper && edgeHelper.material) {
            edgeHelper.material.color.set(0xE67E22); // Revert to orange
        }
        if (edgeProxy.geometry) edgeProxy.geometry.dispose();
        console.log("Deselected edge between vertices:", edgeProxy.userData.indices);
    }
}

/**
 * Removes a face proxy from the selection and cleans up its visuals.
 * @param {THREE.Object3D} faceProxy - The proxy object representing the selected face.
 */
function deselectFace(faceProxy) {
    const index = selectedElements.indexOf(faceProxy);
    if (index > -1) {
        selectedElements.splice(index, 1);
        scene.remove(faceProxy); // Remove proxy object

        // Revert highlight on the face helper
        const faceHelper = faceProxy.userData.face;
        if (faceHelper && faceHelper.material) {
            faceHelper.material.color.set(0x44DD88); // Revert to green
            faceHelper.material.opacity = parseFloat(document.getElementById('faceOpacitySlider').value) || 0.5;
        }
        if (faceProxy.geometry) faceProxy.geometry.dispose();
        console.log("Deselected face with vertices:", faceProxy.userData.indices);
    }
}


// ============================================
// === ADVANCED SPIN TOOL IMPLEMENTATION (BLENDER STYLE) ===
// ============================================

/**
 * Creates the visible components of the spin gizmo (Axis and Rotation Ring).
 * @param {THREE.Vector3} axis - The determined axis of rotation.
 * @param {number} radius - The radius of the gizmo ring.
 */
function createSpinGizmoVisuals(axis, radius) {
    if (spinGizmo) {
        spinGizmo.clear();
    }

    const normalizedAxis = axis.clone().normalize();
    
    // 1. Rotation Ring Handle (The large, clickable blue ring)
    const ringGeometry = new THREE.TorusGeometry(radius, 0.5, 8, 64);
    const ringMaterial = new THREE.MeshBasicMaterial({ 
        color: 0x3a86ff, 
        transparent: true, 
        opacity: 0.6, 
        side: THREE.DoubleSide,
        depthTest: false 
    });
    
    const rotationRing = new THREE.Mesh(ringGeometry, ringMaterial);
    rotationRing.userData.type = 'spin-handle'; 
    rotationRing.userData.axis = axis; 
    
    // Rotate the ring to be perpendicular to the rotation axis (default torus is on XY plane)
    const axisY = new THREE.Vector3(0, 1, 0); 
    const quaternion = new THREE.Quaternion().setFromUnitVectors(axisY, normalizedAxis);
    rotationRing.setRotationFromQuaternion(quaternion);
    
    spinGizmo.add(rotationRing);

    // 2. Pivot Center Marker (Blender's orange/yellow target)
    const centerGeo = new THREE.SphereGeometry(0.5, 8, 8);
    const centerMat = new THREE.MeshBasicMaterial({ color: 0xffb703, depthTest: false });
    const pivotCenter = new THREE.Mesh(centerGeo, centerMat);
    spinGizmo.add(pivotCenter);

    // 3. Axis Line (Colored lines: X=Red, Y=Green, Z=Blue)
    const axisColor = (Math.abs(axis.x) > 0) ? 0xFF0000 : (Math.abs(axis.y) > 0) ? 0x00FF00 : 0x0000FF;
    const axisMaterial = new THREE.LineBasicMaterial({ color: axisColor, linewidth: 4, depthTest: false });
    const axisPoints = [
        normalizedAxis.clone().multiplyScalar(radius * 1.5),
        normalizedAxis.clone().multiplyScalar(-radius * 0.5)
    ];
    // Create the line geometry relative to the pivot (which is the gizmo's origin)
    const lineGeometry = new THREE.BufferGeometry().setFromPoints(axisPoints); 
    const axisLine = new THREE.Line(lineGeometry, axisMaterial);
    spinGizmo.add(axisLine);
}

function initSpinTool() {
    if (!editedSplines.profile || !editedSplines.profile.userData.pivot3D) {
        deactivateCurrentArchTool();
        return;
    }
    
    activeArchTool = 'spin';
    
    // 1. Calculate Pivot and Axis
    spinPivot.copy(editedSplines.profile.userData.pivot3D);
    
    // Set Axis based on UI dropdown (Default Y/Up)
    const axisSelect = document.getElementById('spinAxisSelect');
    spinParams.axis = axisSelect ? axisSelect.value : 'Y';
    if (spinParams.axis === 'X') spinAxis.set(1, 0, 0);
    else if (spinParams.axis === 'Z') spinAxis.set(0, 0, 1);
    else spinAxis.set(0, 1, 0); 
    
    // 2. Determine appropriate Gizmo Radius
    const bbox = new THREE.Box3().setFromObject(activeObject || scene);
    const objectSize = bbox.getSize(new THREE.Vector3()).length();
    const gizmoRadius = Math.max(5, objectSize * 0.2); 

    // 3. Create Gizmo
    if (!spinGizmo) {
        spinGizmo = new THREE.Object3D();
        spinGizmo.name = "SpinGizmo";
        scene.add(spinGizmo);
    }
    spinGizmo.position.copy(spinPivot);
    createSpinGizmoVisuals(spinAxis, gizmoRadius);
    
    // 4. Setup Preview Mesh
    if (!spinPreviewMesh) {
        const material = new THREE.MeshStandardMaterial({ color: 0x00ffff, transparent: true, opacity: 0.7, side: THREE.DoubleSide });
        spinPreviewMesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
        spinPreviewMesh.name = "SpinPreview";
        scene.add(spinPreviewMesh);
    }
    
    // 5. Setup Listeners (Using pointer events)
    renderer.domElement.addEventListener('pointerdown', onSpinStart, false);
    document.addEventListener('pointermove', onSpinMove, false);
    document.addEventListener('pointerup', onSpinEnd, false);
    
    const spinOptions = document.getElementById('spin-options');
    if(spinOptions) spinOptions.style.display = 'block';

    if (controls) controls.enabled = false;
    spinAngle = 0;
    updateSpinPreview(); 
}

function cleanupSpinTool() {
    console.log("Cleaning up Spin Tool.");
    if (spinGizmo) scene.remove(spinGizmo);
    if (spinPreviewMesh) spinPreviewMesh.visible = false;
    
    renderer.domElement.removeEventListener('pointerdown', onSpinStart, false);
    document.removeEventListener('pointermove', onSpinMove, false);
    document.removeEventListener('pointerup', onSpinEnd, false);
    
    const spinOptions = document.getElementById('spin-options');
    if(spinOptions) spinOptions.style.display = 'none';

    if (controls) controls.enabled = true;
    activeArchTool = null;
    isSpinning = false;
}

// --- INTERACTION HANDLERS ---

function onSpinStart(event) {
    if (activeArchTool !== 'spin') return;

    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);

    const intersects = raycaster.intersectObject(spinGizmo, true);
    const hitHandle = intersects.find(i => i.object.userData.type === 'spin-handle');

    if (hitHandle) {
        isSpinning = true;
        if (controls) controls.enabled = false; 
        
        startRaycastPoint.copy(hitHandle.point);
        spinAngle = 0;
        
        event.stopPropagation();
        event.stopImmediatePropagation();
    }
}

function onSpinMove(event) {
    if (activeArchTool !== 'spin' || !isSpinning) return;
    
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);

    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(spinAxis, spinPivot);
    const currentRaycastPoint = new THREE.Vector3();

    if (raycaster.ray.intersectPlane(plane, currentRaycastPoint)) {
        
        const startVector = startRaycastPoint.clone().sub(spinPivot).normalize();
        const currentVector = currentRaycastPoint.clone().sub(spinPivot).normalize();
        
        let angle = startVector.angleTo(currentVector);

        const cross = new THREE.Vector3().crossVectors(startVector, currentVector);
        if (cross.dot(spinAxis) < 0) {
            angle = -angle;
        }

        spinAngle += angle;
        startRaycastPoint.copy(currentRaycastPoint);
        
        updateSpinPreview(spinAngle); 
    }
}



function onSpinEnd(event) {
    if (activeArchTool !== 'spin' || !isSpinning) return;

    isSpinning = false;
    if (orbitControls) orbitControls.enabled = true; 

    // Finalize the operation if a significant angle was dragged
    if (Math.abs(spinAngle) > THREE.MathUtils.degToRad(1)) {
        createSpinGeometry(); // Finalizes the geometry using the current preview state
    } else {
        // If it was just a click, reset the preview based on UI parameters
        spinAngle = 0;
        updateSpinPreview();
    }
}

function onSpinEnd(event) {
    if (activeArchTool !== 'spin' || !isSpinning) return;

    isSpinning = false;
    if (controls) controls.enabled = true; 

    if (Math.abs(spinAngle) > THREE.MathUtils.degToRad(1)) {
        createSpinGeometry(); 
    } else {
        spinAngle = 0;
        updateSpinPreview();
    }
}


function updateSpinPreview(dragAngleRad = 0) {
    if (!spinPreviewMesh || !editedSplines.profile || !editedSplines.profile.userData.pivot3D) return;

    const angleInput = parseFloat(document.getElementById('spinAngleInput')?.value) || 360;
    const segments = parseInt(document.getElementById('spinSegmentsInput')?.value) || 32;

    const finalAngleRad = dragAngleRad !== 0 ? dragAngleRad : THREE.MathUtils.degToRad(angleInput);
    
    const profilePoints2D = editedSplines.profile.points;

    if (profilePoints2D.length < 2) return;

    const newGeometry = new THREE.LatheGeometry(profilePoints2D, segments, 0, finalAngleRad);
    
    spinPreviewMesh.geometry.dispose();
    spinPreviewMesh.geometry = newGeometry;

    spinPreviewMesh.position.copy(editedSplines.profile.userData.pivot3D);
    
    const rotationToSpinAxis = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), spinAxis);
    spinPreviewMesh.quaternion.copy(rotationToSpinAxis);

    spinPreviewMesh.visible = true;
}

function createSpinGeometry() {
    if (!spinPreviewMesh || !spinPreviewMesh.visible) {
        alert("Cannot create spin geometry, preview is not valid.");
        return;
    }
    
    const finalGeometry = spinPreviewMesh.geometry.clone();
    const finalMaterial = new THREE.MeshStandardMaterial({ color: 0xcccccc, side: THREE.DoubleSide });
    const finalMesh = new THREE.Mesh(finalGeometry, finalMaterial);
    
    finalMesh.position.copy(spinPreviewMesh.position);
    finalMesh.quaternion.copy(spinPreviewMesh.quaternion);
    finalMesh.name = "SpinObject_" + Date.now();
    
    addObjectToScene(finalMesh, "spin-result");
    registerArchitecturalElement(finalMesh, 'spin-result'); 
    
    console.log("Spin geometry created:", finalMesh.name);
    
    deactivateCurrentArchTool();
}

function arraysEqual(a, b) {
    return a.length === b.length && a.every((val, index) => val === b[index]);
}



/**
 * Cleans up the spin tool environment.
 */
function deactivateSpinTool() {
    if (currentTool === 'spin') {
        currentTool = 'none';
        scene.remove(spinGizmo);
        spinGizmo = null;
        
        renderer.domElement.removeEventListener('mousedown', onSpinStart, false);
        document.removeEventListener('mousemove', onSpinMove, false);
        document.removeEventListener('mouseup', onSpinEnd, false);
        
        if (controls) controls.enabled = true;
    }
}


/*function updateMeshGeometry() {
    // Guard clauses
    if (!activeObject || selectedElements.length === 0 || !isTransforming) return;
    // Check if drag state is valid (relevant for edge/face)
     if (selectedElements[0].userData.type !== 'vertex' && !dragStartState.center) {
         console.warn("Dragging edge/face without valid drag start state.");
         return;
     }

    const selectedElement = selectedElements[0];
    const geometry = activeObject.geometry;
    const positions = geometry.attributes.position;
    const mode = transformControls.getMode();

    activeObject.updateMatrixWorld(); // Ensure matrix is up-to-date
    const matrixWorld = activeObject.matrixWorld;
    const inverseMatrix = new THREE.Matrix4().copy(matrixWorld).invert(); // Matrix to convert world->local


    if (selectedElement.userData.type === 'vertex') {
        // Vertex transformation logic seems okay, applying directly
        const vertexIndex = selectedElement.userData.vertexIndex;
        const worldPos = selectedElement.position.clone(); // Get proxy's current world position
        const localPos = worldPos.applyMatrix4(inverseMatrix); // Convert to local space

        positions.setXYZ(vertexIndex, localPos.x, localPos.y, localPos.z);
        positions.needsUpdate = true;

        // Update visual helper instance immediately
        if (selectedElement.userData.instancedMesh && selectedElement.userData.instanceId !== undefined) {
            const instancedMesh = selectedElement.userData.instancedMesh;
            const instanceId = selectedElement.userData.instanceId;
            const dummy = new THREE.Object3D();
            dummy.position.copy(selectedElement.position); // Use proxy world position for helper
            dummy.updateMatrix();
            instancedMesh.setMatrixAt(instanceId, dummy.matrix);
            instancedMesh.instanceMatrix.needsUpdate = true;
            // Also keep color red during transform
             instancedMesh.setColorAt(instanceId, new THREE.Color(0xFF0000));
            instancedMesh.instanceColor.needsUpdate = true;
        }

    } else if (selectedElement.userData.type === 'edge' || selectedElement.userData.type === 'face') {
        const indices = selectedElement.userData.indices;
        // ++ USE DRAG START STATE as the reference point ++
        const startCenter = dragStartState.center;
        const startVertices = dragStartState.vertices;

        // Current state of the proxy object (gizmo)
        const currentCenter = selectedElement.position.clone(); // Gizmo's current world position
        const currentRotation = selectedElement.quaternion.clone(); // Gizmo's current world rotation
        const currentScale = selectedElement.scale.clone(); // Gizmo's current world scale (relative to attachment)

        // Calculate the delta transformation from drag start to now
        const deltaTransformMatrix = new THREE.Matrix4();
        const invStartMatrix = new THREE.Matrix4().compose(startCenter, new THREE.Quaternion(), new THREE.Vector3(1,1,1)).invert();
        const currentMatrix = new THREE.Matrix4().compose(currentCenter, currentRotation, currentScale);
        deltaTransformMatrix.multiplyMatrices(currentMatrix, invStartMatrix); // Transform = Current * Start^-1


        // Apply this delta transformation to each vertex's drag-start position
        indices.forEach((vertexIndex, i) => {
            if (i < startVertices.length) { // Ensure index is valid
                const startVertexWorld = startVertices[i].clone(); // World position at drag start

                // Apply the calculated delta transformation
                 // Note: This delta matrix already includes translation relative to startCenter, rotation, and scale
                 // However, scaling/rotation should ideally happen *around* the center.
                 // Let's refine the delta matrix calculation depending on the mode.


                let finalVertexWorld = new THREE.Vector3();

                 if (mode === 'translate') {
                     const deltaTranslation = currentCenter.clone().sub(startCenter);
                     finalVertexWorld = startVertexWorld.clone().add(deltaTranslation);
                 } else {
                      // More complex: Need to apply rotation/scale relative to the center

                      // Calculate delta rotation and scale relative to the start state (identity)
                      const deltaRotation = currentRotation; // Since proxy starts with identity quat relative to start
                      const deltaScale = currentScale; // Since proxy starts with identity scale

                      // 1. Translate vertex to be relative to start center
                       const vertRelToStartCenter = startVertexWorld.clone().sub(startCenter);

                       // 2. Apply scale
                       vertRelToStartCenter.multiply(deltaScale);

                       // 3. Apply rotation
                       vertRelToStartCenter.applyQuaternion(deltaRotation);

                      // 4. Translate back to world space
                       finalVertexWorld = vertRelToStartCenter.add(startCenter);

                       // 5. Add overall translation delta (necessary if pivot moved)
                       const translationDelta = currentCenter.clone().sub(startCenter);
                        // If only rotating/scaling, translationDelta should be near zero, but apply just in case.
                        // This part might need adjustment depending on TransformControls behavior with pivots.
                        // If we assume the gizmo center *is* the center of transform:
                        // The translation is already implicitly handled by steps 1-4 transforming around the moving center.
                        // Let's test without adding explicit translationDelta first for rotate/scale.

                        // If combining translate/rotate/scale: apply the full matrix
                         // finalVertexWorld = startVertexWorld.clone().applyMatrix4(deltaTransformMatrix);

                 }


                // Convert the final world position back to the object's local space
                const localPos = finalVertexWorld.applyMatrix4(inverseMatrix);
                positions.setXYZ(vertexIndex, localPos.x, localPos.y, localPos.z);
            }
        });
         positions.needsUpdate = true;
    }

    // Update geometry bounds and normals (necessary after vertex modification)
    geometry.computeBoundingSphere();
    geometry.computeBoundingBox();
    geometry.computeVertexNormals(); // Crucial for lighting


    // No need for setTimeout here, helpers update on drag end / selection change
    /*if (helperUpdateTimeout) clearTimeout(helperUpdateTimeout);
    helperUpdateTimeout = setTimeout(() => {
        showMeshStructure(activeObject); // This updates helpers based on final state
    }, 100); // Keep a small delay IF immediate update causes performance hit
}*/

function updateMeshGeometry() {
    if (!activeObject || selectedElements.length === 0 || !isTransforming || !dragStartState.allOriginalVerticesMap || dragStartState.allOriginalVerticesMap.size === 0) {
        return; // Guard clause
    }
    
    const geometry = activeObject.geometry;
    const positions = geometry.attributes.position;
    
    activeObject.updateMatrixWorld(true); // Ensure activeObject's matrix is up-to-date
    const inverseActiveObjectMatrix = new THREE.Matrix4().copy(activeObject.matrixWorld).invert();

    const currentTransformObject = transformControls.object;
    if (!currentTransformObject) return;

    // Calculate the transformation matrix from the pivot's start to current state.
    const pivotStartMatrixWorld = dragStartState.pivotStartMatrixWorld;
    const currentPivotMatrixWorld = currentTransformObject.matrixWorld;

    if (pivotStartMatrixWorld.equals(new THREE.Matrix4())) {
        console.warn("Drag start state not captured correctly for pivot, skipping geometry update.");
        return;
    }

    const inversePivotStartMatrixWorld = new THREE.Matrix4().copy(pivotStartMatrixWorld).invert();
    const deltaTransformMatrix = new THREE.Matrix4().multiplyMatrices(currentPivotMatrixWorld, inversePivotStartMatrixWorld);

    // Temp arrays/objects for updates
    const tempMatrix = new THREE.Matrix4();
    const dummy = new THREE.Object3D(); // For instance matrix updates
    const newWorldPositionsMap = new Map(); // Store new world positions for helper updates

    // Apply this delta transformation to ALL affected vertices across ALL selected elements
    dragStartState.allOriginalVerticesMap.forEach((originalWorldPos, vertexIndex) => {
        const newVertexWorldPos = originalWorldPos.clone().applyMatrix4(deltaTransformMatrix);
        newWorldPositionsMap.set(vertexIndex, newVertexWorldPos.clone()); // Store for helper updates

        const newVertexLocalPos = newVertexWorldPos.applyMatrix4(inverseActiveObjectMatrix);
        
        positions.setXYZ(vertexIndex, newVertexLocalPos.x, newVertexLocalPos.y, newVertexLocalPos.z);
    });

    positions.needsUpdate = true; // Mark positions as updated
    
    // --- Update Visual Helpers (Edges, Faces, Vertices) ---
    // This is to make the helpers follow the geometry update in real-time during drag.
    
    // Update Edge Helpers
    edgeHelpers.children.forEach(child => {
        if (child.userData.type === 'edge' && child.userData.indices) {
            const tempPoints = [];
            let needsUpdate = false;
            if (newWorldPositionsMap.has(child.userData.indices[0]) || newWorldPositionsMap.has(child.userData.indices[1])) {
                 // Check if at least one vertex of this edge was affected
                const v1_idx = child.userData.indices[0];
                const v2_idx = child.userData.indices[1];
                
                // Get the updated world positions (from newWorldPositionsMap, or current from geometry if not in map)
                const p1_world = newWorldPositionsMap.has(v1_idx) ? newWorldPositionsMap.get(v1_idx) : new THREE.Vector3().fromBufferAttribute(positions, v1_idx).applyMatrix4(activeObject.matrixWorld);
                const p2_world = newWorldPositionsMap.has(v2_idx) ? newWorldPositionsMap.get(v2_idx) : new THREE.Vector3().fromBufferAttribute(positions, v2_idx).applyMatrix4(activeObject.matrixWorld);

                tempPoints.push(p1_world, p2_world);
                child.geometry.setFromPoints(tempPoints);
                child.geometry.computeBoundingSphere();
            }
        }
    });

    // Update Face Helpers
    faceHelpers.children.forEach(child => {
        if (child.userData.type === 'face' && child.userData.indices) {
            const tempPoints = [];
            let affectedByTransform = false;
            for (const vertIdx of child.userData.indices) {
                if (newWorldPositionsMap.has(vertIdx)) {
                    affectedByTransform = true;
                    break;
                }
            }

            if (affectedByTransform) {
                for (const vertIdx of child.userData.indices) {
                     // Get the updated world positions
                    const p_world = newWorldPositionsMap.has(vertIdx) ? newWorldPositionsMap.get(vertIdx) : new THREE.Vector3().fromBufferAttribute(positions, vertIdx).applyMatrix4(activeObject.matrixWorld);
                    tempPoints.push(p_world);
                }
                child.geometry.setFromPoints(tempPoints);
                child.geometry.attributes.position.needsUpdate = true;
                child.geometry.computeBoundingSphere();
                child.geometry.computeVertexNormals(); // Faces need their normals updated for correct orientation/lighting
            }
        }
    });

    // Update Vertex Helpers (InstancedMesh)
    vertexHelpers.children.forEach(child => {
        if (child.isInstancedMesh && child.userData.type === 'vertex-instanced' && child.instanceMatrix) {
            let instanceMatrixNeedsUpdate = false;
            for (let i = 0; i < child.count; i++) {
                const vertexIndex = child.userData.vertexIndices[i];
                if (newWorldPositionsMap.has(vertexIndex)) {
                    dummy.position.copy(newWorldPositionsMap.get(vertexIndex));
                    dummy.updateMatrix();
                    child.setMatrixAt(i, dummy.matrix);
                    instanceMatrixNeedsUpdate = true;
                }
            }
            if (instanceMatrixNeedsUpdate) {
                child.instanceMatrix.needsUpdate = true;
            }
        }
    });

    // Update geometry bounds and normals (necessary after vertex modification)
    // These calls are essential once all vertex positions are updated.
    geometry.computeBoundingSphere();
    geometry.computeBoundingBox();
    geometry.computeVertexNormals(); // Crucial for lighting after any vertex move
}


function updateVertexHelperPositions() {
    if (!activeObject || !isModelingMode || selectionMode !== 'vertex') return;

    const positions = activeObject.geometry.attributes.position;
    const matrixWorld = activeObject.matrixWorld;

    // Find the instanced mesh helper in the scene
    const instancedMesh = vertexHelpers.children.find(c => c.isInstancedMesh);
    if (!instancedMesh) return;

    const dummy = new THREE.Object3D();
    const indicesToShow = instancedMesh.userData.vertexIndices; // The original indices this helper represents

    // Loop through the instances of the helper and update their matrices
    for (let i = 0; i < indicesToShow.length; i++) {
        const vertexIndex = indicesToShow[i];
        
        // Get the NEW, updated position from the geometry buffer
        dummy.position.fromBufferAttribute(positions, vertexIndex).applyMatrix4(matrixWorld);
        dummy.updateMatrix();
        
        instancedMesh.setMatrixAt(i, dummy.matrix);
    }

    // Tell Three.js to apply the matrix updates
    instancedMesh.instanceMatrix.needsUpdate = true;
}

// Function validateTransformation removed - calculations should prevent extremes. Clamping is in place.
// Function fixFaceOrientation removed - Generally not needed unless dealing with complex topology generation.

// --- updateEdgeFaceHelpers remains largely the same ---
// ... Ensure it reads the *updated* positions correctly ...

/*
function updateEdgeFaceHelpers() {
    // Clear existing helpers correctly
    edgeHelpers.children.forEach(child => { if (child.geometry) child.geometry.dispose(); if (child.material) { if (Array.isArray(child.material)) child.material.forEach(m => m.dispose()); else child.material.dispose(); } });
    edgeHelpers.clear();
    faceHelpers.children.forEach(child => { if (child.geometry) child.geometry.dispose(); if (child.material) { if (Array.isArray(child.material)) child.material.forEach(m => m.dispose()); else child.material.dispose(); } });
    faceHelpers.clear();

    if (!activeObject || !activeObject.geometry || !activeObject.geometry.attributes.position) return;

    const geometry = activeObject.geometry;
    const positions = geometry.attributes.position;
    const matrix = activeObject.matrixWorld;
    const edgeThickness = parseFloat(document.getElementById('edgeThicknessSlider').value) || 1; // Default thickness
    const faceOpacity = parseFloat(document.getElementById('faceOpacitySlider').value) || 0.5;

    // Use buildQuadMap to get a list of "logical" faces (quads or triangles)
    const quadMap = buildQuadMap(geometry); // This returns Map<originalFaceIndex, Array<vertexIndices>>
    const vTemp1 = new THREE.Vector3(), vTemp2 = new THREE.Vector3(); // Reusable vectors

    // --- EDGE HELPERS (FIXED to display quad boundaries) ---
    if (selectionMode === 'edge' || selectionMode === 'all') {
        const drawnEdgeKeys = new Set(); // To avoid drawing duplicate edges (e.g., if multiple faces share an edge)
        let currentEdgeCount = 0;
        const MAX_HELPERS_EDGE_FACE = MAX_HELPERS; // Use global cap (Assumes MAX_HELPERS is defined)

        quadMap.forEach((faceVertexIndices, originalFaceId) => {
            if (currentEdgeCount >= MAX_HELPERS_EDGE_FACE) return; // Performance cap

            const edgesToConsider = [];
            if (faceVertexIndices.length === 3) {
                // Triangle: All three edges are boundary edges of the "logical" face
                edgesToConsider.push([faceVertexIndices[0], faceVertexIndices[1]]);
                edgesToConsider.push([faceVertexIndices[1], faceVertexIndices[2]]);
                edgesToConsider.push([faceVertexIndices[2], faceVertexIndices[0]]);
            } else if (faceVertexIndices.length === 4) {
                // Quad: All four edges are boundary edges of the "logical" face
                edgesToConsider.push([faceVertexIndices[0], faceVertexIndices[1]]);
                edgesToConsider.push([faceVertexIndices[1], faceVertexIndices[2]]);
                edgesToConsider.push([faceVertexIndices[2], faceVertexIndices[3]]);
                edgesToConsider.push([faceVertexIndices[3], faceVertexIndices[0]]);
            } else {
                console.warn(`Face at index ${originalFaceId} has ${faceVertexIndices.length} vertices, which is not a triangle or quad. Skipping edge helpers for this face.`);
                return;
            }

            for (const edge of edgesToConsider) {
                const startIdx = edge[0];
                const endIdx = edge[1];
                const edgeKey = getEdgeKey(startIdx, endIdx);

                if (!drawnEdgeKeys.has(edgeKey)) { // Only draw each unique edge once
                    drawnEdgeKeys.add(edgeKey);

                    vTemp1.fromBufferAttribute(positions, startIdx).applyMatrix4(matrix);
                    vTemp2.fromBufferAttribute(positions, endIdx).applyMatrix4(matrix);

                    const edgeGeom = new THREE.BufferGeometry().setFromPoints([vTemp1.clone(), vTemp2.clone()]);
                    // NOTE: linewidth is not consistently supported across all platforms/browsers,
                    // often clamped to 1px. For true "diameter" (3D thickness), consider THREE.MeshLine
                    // or extruding thin BoxGeometry objects for edges.
                    const edgeMat = new THREE.LineBasicMaterial({
                        color: 0xE67E22, // Default Orange
                        linewidth: edgeThickness // This value may only affect desktop OpenGL, not WebGL
                    });

                    const edgeLine = new THREE.Line(edgeGeom, edgeMat);
                    edgeLine.userData = { type: 'edge', indices: [startIdx, endIdx] };
                    edgeHelpers.add(edgeLine);
                    currentEdgeCount++;
                }
            }
        });
        console.log(`Generated ${currentEdgeCount} edge helpers.`);
    }

    // --- FACE HELPERS (already uses buildQuadMap and is correct) ---
    if (selectionMode === 'face' || selectionMode === 'all') {
        let currentFaceCount = 0;
        const MAX_HELPERS_FACE_ONLY = MAX_HELPERS; // Cap face count

        quadMap.forEach((faceVertexIndices, originalFaceId) => {
            if (currentFaceCount >= MAX_HELPERS_FACE_ONLY) return;

            const tempVerts = [];
            faceVertexIndices.forEach(index => {
                tempVerts.push(new THREE.Vector3().fromBufferAttribute(positions, index).applyMatrix4(matrix));
            });

            const faceGeom = new THREE.BufferGeometry().setFromPoints(tempVerts);
            
            // Create index for the helper mesh (tri or quad)
            if (faceVertexIndices.length === 3) {
                faceGeom.setIndex([0, 1, 2]);
            } else if (faceVertexIndices.length === 4) {
                // Create two triangles for the quad
                faceGeom.setIndex([0, 1, 2, 2, 3, 0]); // Assuming a convex quad, simple triangulation
            } else {
                 console.warn(`Face at index ${originalFaceId} has ${faceVertexIndices.length} vertices, which is not a triangle or quad. Skipping face helper.`);
                 return;
            }

            const faceMat = new THREE.MeshBasicMaterial({
                color: 0x44DD88, // Default Green
                transparent: true,
                opacity: faceOpacity,
                side: THREE.DoubleSide
            });

            const faceMesh = new THREE.Mesh(faceGeom, faceMat);
            faceMesh.userData = {
                type: 'face',
                indices: faceVertexIndices, // Store all vertices of the face/quad
                faceIndex: originalFaceId // Store the original face index (from buildQuadMap)
            };
            faceHelpers.add(faceMesh);
            currentFaceCount++;
        });
        console.log(`Generated ${currentFaceCount} face helpers.`);
    }

    // Check if any element is currently selected and re-apply its selection highlight
    // (Assumes resetHighlights is defined globally)
    if (typeof resetHighlights === 'function') {
        resetHighlights();
    }
}*/ 

function updateEdgeFaceHelpers() {
    // Clear existing helpers correctly
    edgeHelpers.children.forEach(child => { if (child.geometry) child.geometry.dispose(); if (child.material) { if (Array.isArray(child.material)) child.material.forEach(m => m.dispose()); else child.material.dispose(); } });
    edgeHelpers.clear();
    faceHelpers.children.forEach(child => { if (child.geometry) child.geometry.dispose(); if (child.material) { if (Array.isArray(child.material)) child.material.forEach(m => m.dispose()); else child.material.dispose(); } });
    faceHelpers.clear();

    if (!activeObject || !activeObject.geometry.attributes.position) return;

    const geometry = activeObject.geometry;
    const positions = geometry.attributes.position;
    const matrix = activeObject.matrixWorld;
    const edgeThickness = parseFloat(document.getElementById('edgeThicknessSlider').value) || 1;
    const faceOpacity = parseFloat(document.getElementById('faceOpacitySlider').value) || 0.5;

    // CRUCIAL: Use buildQuadMap to get the logical structure (quads or remaining tris)
    const quadMap = buildQuadMap(geometry);
    const vTemp1 = new THREE.Vector3(), vTemp2 = new THREE.Vector3(); // Reusable vectors

    // --- EDGE HELPERS (Draws boundaries of the logical quad/tri structure) ---
    if (selectionMode === 'edge' || selectionMode === 'all') {
        const drawnEdgeKeys = new Set();
        let currentEdgeCount = 0;
        const MAX_HELPERS_EDGE_FACE = MAX_HELPERS;

        quadMap.forEach((faceVertexIndices, originalFaceId) => {
            if (currentEdgeCount >= MAX_HELPERS_EDGE_FACE) return;

            const numVerts = faceVertexIndices.length;
            if (numVerts < 3) return;

            const edgesToConsider = [];
            for(let i = 0; i < numVerts; i++) {
                // Edge from current vertex to the next one in the logical face
                edgesToConsider.push([faceVertexIndices[i], faceVertexIndices[(i + 1) % numVerts]]);
            }

            for (const edge of edgesToConsider) {
                const startIdx = edge[0];
                const endIdx = edge[1];
                const edgeKey = getEdgeKey(startIdx, endIdx);

                if (!drawnEdgeKeys.has(edgeKey)) { // Only draw each unique edge once
                    drawnEdgeKeys.add(edgeKey);

                    vTemp1.fromBufferAttribute(positions, startIdx).applyMatrix4(matrix);
                    vTemp2.fromBufferAttribute(positions, endIdx).applyMatrix4(matrix);

                    const edgeGeom = new THREE.BufferGeometry().setFromPoints([vTemp1.clone(), vTemp2.clone()]);
                    const edgeMat = new THREE.LineBasicMaterial({
                        color: 0xE67E22, // Default Orange
                        linewidth: edgeThickness
                    });

                    const edgeLine = new THREE.Line(edgeGeom, edgeMat);
                    edgeLine.userData = { type: 'edge', indices: [startIdx, endIdx] };
                    edgeHelpers.add(edgeLine);
                    currentEdgeCount++;
                }
            }
        });
        console.log(`Generated ${currentEdgeCount} edge helpers (Quad-aware).`);
    }

    // --- FACE HELPERS (Draws the logical quad/tri faces) ---
    if (selectionMode === 'face' || selectionMode === 'all') {
        let currentFaceCount = 0;
        const MAX_HELPERS_FACE_ONLY = MAX_HELPERS;

        quadMap.forEach((faceVertexIndices, originalFaceId) => {
            if (currentFaceCount >= MAX_HELPERS_FACE_ONLY) return;

            const tempVerts = [];
            faceVertexIndices.forEach(index => {
                tempVerts.push(new THREE.Vector3().fromBufferAttribute(positions, index).applyMatrix4(matrix));
            });

            const faceGeom = new THREE.BufferGeometry().setFromPoints(tempVerts);
            
            // Create index for the helper mesh (tri or quad)
            if (faceVertexIndices.length === 3) {
                faceGeom.setIndex([0, 1, 2]);
            } else if (faceVertexIndices.length === 4) {
                // Create two triangles for the quad (0-1-2, 2-3-0)
                faceGeom.setIndex([0, 1, 2, 2, 3, 0]); 
            } else {
                 console.warn(`Face at index ${originalFaceId} has ${faceVertexIndices.length} vertices. Skipping face helper.`);
                 return;
            }

            const faceMat = new THREE.MeshBasicMaterial({
                color: 0x44DD88, // Default Green
                transparent: true,
                opacity: faceOpacity,
                side: THREE.DoubleSide
            });

            const faceMesh = new THREE.Mesh(faceGeom, faceMat);
            faceMesh.userData = {
                type: 'face',
                indices: faceVertexIndices, // Store all vertices of the face/quad
                faceIndex: originalFaceId // Store the original face index (from buildQuadMap)
            };
            faceHelpers.add(faceMesh);
            currentFaceCount++;
        });
        console.log(`Generated ${currentFaceCount} face helpers (Quad-aware).`);
    }

    if (typeof resetHighlights === 'function') {
        resetHighlights();
    }
}


/**
 * Sets up all event listeners related to the modeling UI and interactions.
 * Should be called once during initialization (e.g., within initModeling).
 * FIXES: Removed redundant listeners, connects all tool buttons.
 **
function setupModelingEventListeners() {
    // Debounced mouse move listener
    renderer.domElement.removeEventListener('click', handleCanvasClick, false); // Remove if previously added
    renderer.domElement.addEventListener('click', handleCanvasClick, false);
    renderer.domElement.removeEventListener('mousemove', handleCanvasMouseMove, false); // Remove if previously added
    renderer.domElement.addEventListener('mousemove', handleCanvasMouseMove, false);
    renderer.domElement.removeEventListener('contextmenu', handleCanvasRightClick, false); // Remove if previously added
    renderer.domElement.addEventListener('contextmenu', handleCanvasRightClick, false);
    
    document.getElementById('toggle-2d-view').addEventListener('click', toggle2DView);
    
    // Global Keydown handler
    window.removeEventListener('keydown', handleModelingKeyDown); // Prevent duplicates
    window.addEventListener('keydown', handleModelingKeyDown);
 
    //document.getElementById('select-vertex').addEventListener('click', () => setSelectionMode('vertex'));
    //document.getElementById('select-edge').addEventListener('click', () => setSelectionMode('edge'));
    //document.getElementById('select-face').addEventListener('click', () => setSelectionMode('face'));
    
     
    document.getElementById('toggle-modeling').addEventListener('click', () => {
        toggleModelingMode();
        updateTransformControlsAttachment(); // Crucial call here
    });
    document.getElementById('select-vertex').addEventListener('click', () => { setSelectionMode('vertex'); updateTransformControlsAttachment(); });
    document.getElementById('select-edge').addEventListener('click', () => { setSelectionMode('edge'); updateTransformControlsAttachment(); });
    document.getElementById('select-face').addEventListener('click', () => { setSelectionMode('face'); updateTransformControlsAttachment(); });
    
    // Check if performance button already exists, create if not
     let perfButton = document.getElementById('performance-mode');
     if (!perfButton) {
          perfButton = document.createElement('button');
          perfButton.id = 'performance-mode';
          perfButton.className = 'panel-button'; // Use appropriate class
          perfButton.addEventListener('click', togglePerformanceMode);
           // Insert after the modeling toggle button
          const toggleBtn = document.getElementById('toggle-modeling');
           if (toggleBtn && toggleBtn.parentNode) {
                toggleBtn.parentNode.insertBefore(perfButton, toggleBtn.nextSibling);
            } else {
                // Fallback: append somewhere reasonable, e.g., settings panel
                // document.getElementById('some-panel-id').appendChild(perfButton);
                 console.warn("Could not find placement for performance mode button.");
           }
     }
     perfButton.textContent = isPerformanceMode ? "Perf Mode: ON" : "Qual Mode: ON";
     perfButton.disabled = !isModelingMode; // Disable initially if modeling mode is off
    
    
    // Slider listeners - update helpers immediately on change
    const updateHelpersOnChange = () => { if (isModelingMode && activeObject) showMeshStructure(activeObject); };
    document.getElementById('vertexSizeSlider').addEventListener('input', updateHelpersOnChange);
    document.getElementById('edgeThicknessSlider').addEventListener('input', updateHelpersOnChange);
    document.getElementById('faceOpacitySlider').addEventListener('input', updateHelpersOnChange);
    
    // Subdivision needs TransformControls detachment
    document.getElementById('subdivisionLevelsSlider').addEventListener('input', () => {
        // Add debounce? Subdiv can be expensive
        updateSubdivision();
    });

    // --- listeners for new tool buttons ---

    document.getElementById('tool-extrude').addEventListener('click', () => {
        if (!isModelingMode || !activeObject) return; 
        extrudeSelection(); 
        updateTransformControlsAttachment();
    });

    document.getElementById('tool-bevel').addEventListener('click', () => {
        if (!isModelingMode || !activeObject) return;
        //initBevelTool(); 
        bevelSelection();
    });
    document.getElementById('tool-loopcut').addEventListener('click', () => {
        if (!isModelingMode || !activeObject) return;
        initiateLoopCut(); // Loop cut needs an interaction step
    });
    
    document.getElementById('tool-spin').addEventListener('click', initiateSpinTool);

    document.getElementById('edges-to-profile').addEventListener('click', convertSelectedEdgesToProfile);

    document.getElementById('tool-inset')?.addEventListener('click', () => {
        if (!isModelingMode || !activeObject) return;
        insetSelectedFaces();
    });
    document.getElementById('tool-bridge')?.addEventListener('click', () => {
        if (!isModelingMode || !activeObject) return;
        bridgeEdgeLoops();
    });
    
     // --- Enable/Disable tool buttons along with selection buttons ---
    const modelingToolButtons = ['tool-extrude', 'tool-bevel', 'tool-loopcut', 'tool-inset', 'tool-bridge' ];
  
    
    // Optional: Keyboard shortcuts (add this listener once, maybe in initModeling)
    //window.addEventListener('keydown', handleModelingKeyDown);

    // --- Architecture Tool Buttons ---
    document.getElementById('tool-wall')?.addEventListener('click', () => toggleArchTool('wall'));
    document.getElementById('tool-place-door')?.addEventListener('click', () => toggleArchTool('door'));
    document.getElementById('tool-place-window')?.addEventListener('click', () => toggleArchTool('window'));
    //document.getElementById('tool-stairs')?.addEventListener('click', () => toggleArchTool('stairs'));
    document.getElementById('tool-stairs')?.addEventListener('click', () => toggleArchTool('stairs'));
    document.getElementById('tool-measure')?.addEventListener('click', () => toggleArchTool('measure'));

    document.getElementById('tool-roof')?.addEventListener('click', () => toggleArchTool('roof'));
    document.getElementById('tool-room')?.addEventListener('click', () => toggleArchTool('room'));
    document.getElementById('tool-curved-wall')?.addEventListener('click', () => toggleArchTool('curved-wall'));
    document.getElementById('tool-terrain')?.addEventListener('click', () => toggleArchTool('terrain'));
    document.getElementById('tool-window-presets')?.addEventListener('click', () => {
        // This button doesn't activate a "tool" in the same way,
        // it just shows/hides a UI panel for preset selection.
        // Deactivate any other active modeling/arch tool first.
        deactivateCurrentArchTool();
        clearSelection(); // Clear V/E/F selection
        if (controls) controls.enabled = true; // Ensure orbit controls are enabled

        const panel = document.getElementById('window-presets-panel');
        if (panel) {
            panel.style.display = (panel.style.display === 'none' || panel.style.display === '') ? 'block' : 'none';
        }
        console.log("Toggled Window Presets Panel");
    });

    document.getElementById('tool-structure-synth')?.addEventListener('click', () => {
        if (structureSynthToolActive) {
            cleanupStructureSynthTool();
        } else {
            initStructureSynthTool();
        }
    });

    document.getElementById('confirm-stairs')?.addEventListener('click', confirmStairs);
    document.getElementById('cancel-stairs')?.addEventListener('click', () => {
        cleanupStairsTool();
        deactivateCurrentArchTool();
    });

    // Shell Tool
    document.getElementById('tool-shell')?.addEventListener('click', () => {
        if (!isModelingMode || !activeObject) return;
        if (selectionMode !== 'face' || selectedElements.length === 0) {
            alert("Please select one or more faces to define the opening(s) for the shell operation.");
            return;
        }
        applyShellOperation();
    });

    //Boolean Operations
    document.getElementById('tool-boolean-subtract')?.addEventListener('click', () => toggleArchTool('boolean-subtract'));

    // Architectural Element Selection Buttons
    document.getElementById('select-all-walls')?.addEventListener('click', () => selectAllArchElementsByType('wall'));
    document.getElementById('select-all-doors')?.addEventListener('click', () => selectAllArchElementsByType('door'));
    document.getElementById('select-all-windows')?.addEventListener('click', () => selectAllArchElementsByType('window'));
    document.getElementById('select-all-arch')?.addEventListener('click', () => selectAllArchElementsByType('all'));
    document.getElementById('delete-selected-arch')?.addEventListener('click', deleteSelectedArchElements);

     // Initial state for the delete button
    const deleteArchButton = document.getElementById('delete-selected-arch');
    if (deleteArchButton) deleteArchButton.disabled = true;

    console.log("Modeling Event Listeners Setup Complete (including Arch selection).");
    // --- Spline Tool Buttons ---
    document.getElementById('spline-draw-profile')?.addEventListener('click', () => activateSplineDrawing('profile'));
    document.getElementById('spline-draw-path')?.addEventListener('click', () => activateSplineDrawing('path'));
    document.getElementById('spline-extrude')?.addEventListener('click', extrudeSelectedSplines);
  
    document.getElementById('tool-poly-pen')?.addEventListener('click', () => {
        if (!isModelingMode) return;
        activatePolyPenTool(); // <-- you define this function
    });

     // --- Modifier UI Listeners ---
     document.getElementById('add-modifier-button')?.addEventListener('click', handleAddModifier);
     document.getElementById('apply-modifiers-button')?.addEventListener('click', handleApplyModifiers);
     // Use event delegation for controls inside the list
     const modifierListContainer = document.getElementById('modifier-list-container');
     if (modifierListContainer) {
         modifierListContainer.addEventListener('click', handleModifierListClick); // For buttons, expand
         modifierListContainer.addEventListener('change', handleModifierListChange); // For checkboxes, inputs
     } else {
         console.warn("Modifier list container not found!");
     }

    const deleteObjectButton = document.getElementById('delete-active-object'); // Assuming you add this button
    if (deleteObjectButton) {
        deleteObjectButton.addEventListener('click', deleteSelectedObject);
    }

 

 
     // --- Initial UI State Setup ---
     // Set initial state based on default variable values
     updateModifierPanelVisibility(); // Depends on activeObject and isModelingMode
     updateSnappingUI(); // Depends on isModelingMode and isSnappingEnabled
 
      updateTransformControlsAttachment();
     console.log("Modeling Event Listeners Setup Complete.");
}*/

function setupModelingEventListeners() {
    // Debounced mouse move listener
    renderer.domElement.removeEventListener('click', handleCanvasClick, false); // Remove if previously added
    renderer.domElement.addEventListener('click', handleCanvasClick, false);
    renderer.domElement.removeEventListener('mousemove', handleCanvasMouseMove, false); // Remove if previously added
    renderer.domElement.addEventListener('mousemove', handleCanvasMouseMove, false);
    renderer.domElement.removeEventListener('contextmenu', handleCanvasRightClick, false); // Remove if previously added
    renderer.domElement.addEventListener('contextmenu', handleCanvasRightClick, false);
    
    document.getElementById('toggle-2d-view').addEventListener('click', toggle2DView);
    
    // Global Keydown handler
    window.removeEventListener('keydown', handleModelingKeyDown); // Prevent duplicates
    window.addEventListener('keydown', handleModelingKeyDown);
    
    document.getElementById('toggle-modeling').addEventListener('click', toggleModelingMode);
    document.getElementById('select-vertex').addEventListener('click', () => setSelectionMode('vertex'));
    document.getElementById('select-edge').addEventListener('click', () => setSelectionMode('edge'));
    document.getElementById('select-face').addEventListener('click', () => setSelectionMode('face'));
    
    // Check if performance button already exists, create if not
     let perfButton = document.getElementById('performance-mode');
     if (!perfButton) {
          perfButton = document.createElement('button');
          perfButton.id = 'performance-mode';
          perfButton.className = 'panel-button'; // Use appropriate class
          perfButton.addEventListener('click', togglePerformanceMode);
           // Insert after the modeling toggle button
          const toggleBtn = document.getElementById('toggle-modeling');
           if (toggleBtn && toggleBtn.parentNode) {
                toggleBtn.parentNode.insertBefore(perfButton, toggleBtn.nextSibling);
            } else {
                // Fallback: append somewhere reasonable, e.g., settings panel
                // document.getElementById('some-panel-id').appendChild(perfButton);
                 console.warn("Could not find placement for performance mode button.");
           }
     }
     perfButton.textContent = isPerformanceMode ? "Perf Mode: ON" : "Qual Mode: ON";
     perfButton.disabled = !isModelingMode; // Disable initially if modeling mode is off
    
    
    // Slider listeners - update helpers immediately on change
    const updateHelpersOnChange = () => { if (isModelingMode && activeObject) showMeshStructure(activeObject); };
    document.getElementById('vertexSizeSlider').addEventListener('input', updateHelpersOnChange);
    document.getElementById('edgeThicknessSlider').addEventListener('input', updateHelpersOnChange);
    document.getElementById('faceOpacitySlider').addEventListener('input', updateHelpersOnChange);
    
    // Subdivision needs TransformControls detachment
    document.getElementById('subdivisionLevelsSlider').addEventListener('input', () => {
        // Add debounce? Subdiv can be expensive
        updateSubdivision();
    });

    // --- listeners for new tool buttons ---
    document.getElementById('tool-extrude').addEventListener('click', () => {
        if (!isModelingMode || !activeObject) return;
        extrudeSelection();
    });
    document.getElementById('tool-bevel').addEventListener('click', () => {
        if (!isModelingMode || !activeObject) return;
        bevelSelection();
    });
    document.getElementById('tool-loopcut').addEventListener('click', () => {
        if (!isModelingMode || !activeObject) return;
        initiateLoopCut(); // Loop cut needs an interaction step
    });
    
    document.getElementById('tool-spin').addEventListener('click', initiateSpinTool);

    document.getElementById('edges-to-profile').addEventListener('click', convertSelectedEdgesToProfile);

    document.getElementById('tool-inset')?.addEventListener('click', () => {
        if (!isModelingMode || !activeObject) return;
        insetSelectedFaces();
    });
    document.getElementById('tool-bridge')?.addEventListener('click', () => {
        if (!isModelingMode || !activeObject) return;
        bridgeEdgeLoops();
    });
    

     // --- Enable/Disable tool buttons along with selection buttons ---
     const modelingToolButtons = ['tool-extrude', 'tool-bevel', 'tool-loopcut', 'tool-inset', 'tool-bridge' ];
     document.getElementById('toggle-modeling').addEventListener('click', () => {
         // ... existing toggle logic ...
          const enable = isModelingMode; // Should be true if mode is ON after toggle
           modelingToolButtons.forEach(id => {
              const button = document.getElementById(id);
              if (button) button.disabled = !enable;
          });
     });
    
    // Optional: Keyboard shortcuts (add this listener once, maybe in initModeling)
    //window.addEventListener('keydown', handleModelingKeyDown);

    // --- Architecture Tool Buttons ---
    document.getElementById('tool-wall')?.addEventListener('click', () => toggleArchTool('wall'));
    document.getElementById('tool-place-door')?.addEventListener('click', () => toggleArchTool('door'));
    document.getElementById('tool-place-window')?.addEventListener('click', () => toggleArchTool('window'));
    //document.getElementById('tool-stairs')?.addEventListener('click', () => toggleArchTool('stairs'));
    document.getElementById('tool-stairs')?.addEventListener('click', () => toggleArchTool('stairs'));
    document.getElementById('tool-measure')?.addEventListener('click', () => toggleArchTool('measure'));

    document.getElementById('tool-roof')?.addEventListener('click', () => toggleArchTool('roof'));
    document.getElementById('tool-room')?.addEventListener('click', () => toggleArchTool('room'));
    document.getElementById('tool-curved-wall')?.addEventListener('click', () => toggleArchTool('curved-wall'));
    document.getElementById('tool-terrain')?.addEventListener('click', () => toggleArchTool('terrain'));
    document.getElementById('tool-window-presets')?.addEventListener('click', () => {
        // This button doesn't activate a "tool" in the same way,
        // it just shows/hides a UI panel for preset selection.
        // Deactivate any other active modeling/arch tool first.
        deactivateCurrentArchTool();
        clearSelection(); // Clear V/E/F selection
        if (controls) controls.enabled = true; // Ensure orbit controls are enabled

        const panel = document.getElementById('window-presets-panel');
        if (panel) {
            panel.style.display = (panel.style.display === 'none' || panel.style.display === '') ? 'block' : 'none';
        }
        console.log("Toggled Window Presets Panel");
    });

    document.getElementById('tool-structure-synth')?.addEventListener('click', () => {
        if (structureSynthToolActive) {
            cleanupStructureSynthTool();
        } else {
            initStructureSynthTool();
        }
    });

    document.getElementById('confirm-stairs')?.addEventListener('click', confirmStairs);
    document.getElementById('cancel-stairs')?.addEventListener('click', () => {
        cleanupStairsTool();
        deactivateCurrentArchTool();
    });

    // Shell Tool
    document.getElementById('tool-shell')?.addEventListener('click', () => {
        if (!isModelingMode || !activeObject) return;
        if (selectionMode !== 'face' || selectedElements.length === 0) {
            alert("Please select one or more faces to define the opening(s) for the shell operation.");
            return;
        }
        applyShellOperation();
    });

    //Boolean Operations
    document.getElementById('tool-boolean-subtract')?.addEventListener('click', () => toggleArchTool('boolean-subtract'));

    // Architectural Element Selection Buttons
    document.getElementById('select-all-walls')?.addEventListener('click', () => selectAllArchElementsByType('wall'));
    document.getElementById('select-all-doors')?.addEventListener('click', () => selectAllArchElementsByType('door'));
    document.getElementById('select-all-windows')?.addEventListener('click', () => selectAllArchElementsByType('window'));
    document.getElementById('select-all-arch')?.addEventListener('click', () => selectAllArchElementsByType('all'));
    document.getElementById('delete-selected-arch')?.addEventListener('click', deleteSelectedArchElements);

     // Initial state for the delete button
    const deleteArchButton = document.getElementById('delete-selected-arch');
    if (deleteArchButton) deleteArchButton.disabled = true;

    console.log("Modeling Event Listeners Setup Complete (including Arch selection).");
    // --- Spline Tool Buttons ---
    document.getElementById('spline-draw-profile')?.addEventListener('click', () => activateSplineDrawing('profile'));
    document.getElementById('spline-draw-path')?.addEventListener('click', () => activateSplineDrawing('path'));
    document.getElementById('spline-extrude')?.addEventListener('click', extrudeSelectedSplines);
  
    document.getElementById('tool-poly-pen')?.addEventListener('click', () => {
        if (!isModelingMode) return;
        activatePolyPenTool(); // <-- you define this function
    });

     // --- Modifier UI Listeners ---
     document.getElementById('add-modifier-button')?.addEventListener('click', handleAddModifier);
     document.getElementById('apply-modifiers-button')?.addEventListener('click', handleApplyModifiers);
     // Use event delegation for controls inside the list
     const modifierListContainer = document.getElementById('modifier-list-container');
     if (modifierListContainer) {
         modifierListContainer.addEventListener('click', handleModifierListClick); // For buttons, expand
         modifierListContainer.addEventListener('change', handleModifierListChange); // For checkboxes, inputs
     } else {
         console.warn("Modifier list container not found!");
     }
 
     // --- Initial UI State Setup ---
     // Set initial state based on default variable values
     updateModifierPanelVisibility(); // Depends on activeObject and isModelingMode
     updateSnappingUI(); // Depends on isModelingMode and isSnappingEnabled
 
     console.log("Modeling Event Listeners Setup Complete.");
}

    
// Function to show/hide modifier panel based on activeObject
function updateModifierPanelVisibility() {
    const panel = document.getElementById('modifiers-panel');
     if (panel) {
          panel.style.display = (activeObject && isModelingMode) ? 'block' : 'none';
         if (activeObject && isModelingMode) {
              updateModifierPanelUI(activeObject); // Populate with selected object's modifiers
         }
      }
}

function updateSnappingUI() {
    const snapButton = document.getElementById('toggle-snapping');
    const snapSelect = document.getElementById('snap-type-select');
    const gridInput = document.getElementById('grid-snap-size');

    if (snapButton) snapButton.textContent = isSnappingEnabled ? 'Snap ON' : 'Snap OFF';
    if (snapSelect) snapSelect.disabled = !isSnappingEnabled || !isModelingMode;
    if (gridInput) gridInput.disabled = !isSnappingEnabled || !isModelingMode;

    console.log("Snapping state:", isSnappingEnabled);
}

// Event handler for clicks within the dynamic modifier list
function handleModifierListClick(event) {
    if (!activeObject) return;
    const target = event.target;
     const modEntry = target.closest('.modifier-entry');
    if (!modEntry) return;
    const index = parseInt(modEntry.dataset.modifierIndex);
    const stack = modifierStacks.get(activeObject.uuid) || [];
    const modifier = stack[index];
    if (!modifier) return;

    if (target.classList.contains('mod-remove')) {
        // Remove modifier
         stack.splice(index, 1);
         modifierStacks.set(activeObject.uuid, stack); // Update map
         updateObjectModifiers(activeObject); // Re-apply stack
        updateModifierPanelUI(activeObject); // Refresh UI list
        console.log(`Removed modifier at index ${index}`);
    } else if (target.classList.contains('mod-expand')) {
         // Toggle settings visibility
        const settingsDiv = modEntry.querySelector('.mod-settings');
        if (settingsDiv) {
            const isVisible = settingsDiv.style.display !== 'none';
            settingsDiv.style.display = isVisible ? 'none' : 'block';
            target.textContent = isVisible ? '▼' : '▲';
        }
    }
}

// Event handler for CHANGES (checkbox, inputs) within the dynamic modifier list
function handleModifierListChange(event) {
    if (!activeObject) return;
    const target = event.target;
    const modEntry = target.closest('.modifier-entry');
    if (!modEntry) return;
     const index = parseInt(modEntry.dataset.modifierIndex);
    const stack = modifierStacks.get(activeObject.uuid) || [];
     const modifier = stack[index];
    if (!modifier) return;

     let needsUpdate = false;

    if (target.classList.contains('mod-active') && target.type === 'checkbox') {
         modifier.active = target.checked;
         console.log(`Modifier ${index} active state: ${modifier.active}`);
         needsUpdate = true;
    } else if (target.classList.contains('mod-param')) {
         const paramName = target.dataset.param;
        let value = target.type === 'number' ? parseFloat(target.value) : target.value;
        // Add validation? NaN check?
         modifier[paramName] = value;
        console.log(`Modifier ${index} param ${paramName} changed to: ${value}`);
        needsUpdate = true;
     } else if (target.classList.contains('mod-param-vec')) {
          const paramName = target.dataset.param;
          const vecIndex = parseInt(target.dataset.index);
          let value = parseFloat(target.value);
          if (!modifier[paramName] || !Array.isArray(modifier[paramName])) {
               modifier[paramName] = [0, 0, 0]; // Initialize if needed
           }
          if(!isNaN(value) && vecIndex >= 0 && vecIndex < 3) {
              modifier[paramName][vecIndex] = value;
               console.log(`Modifier ${index} param ${paramName}[${vecIndex}] changed to: ${value}`);
               needsUpdate = true;
          }
     }


    if (needsUpdate) {
         modifierStacks.set(activeObject.uuid, stack); // Update stack in map
         updateObjectModifiers(activeObject); // Re-apply modifiers
    }
}

// Function to add a new modifier from the dropdown
function handleAddModifier() {
    if (!activeObject) { alert("Select an object first!"); return; }

    const select = document.getElementById('add-modifier-select');
    const type = select.value;
    if (!type) return; // No selection

    const stack = modifierStacks.get(activeObject.uuid) || [];

    // Add default modifier object
    const newModifier = { type: type, active: true };
    // Add default params based on type
     switch (type) {
        case 'solidify': newModifier.thickness = 0.1; break;
        case 'array': newModifier.count = 2; newModifier.offsetType='relative'; newModifier.offsetVector=[1,0,0]; break;
        case 'bevel': newModifier.amount = 0.1; newModifier.segments = 1; break;
        case 'subdivision': newModifier.level = 1; break;
         // Add other defaults...
     }


    stack.push(newModifier);
    modifierStacks.set(activeObject.uuid, stack); // Store updated stack

    updateObjectModifiers(activeObject); // Apply changes
    updateModifierPanelUI(activeObject); // Refresh list UI

    select.value = ""; // Reset dropdown
     console.log(`Added ${type} modifier.`);
}

function handleApplyModifiers() {
    if (!activeObject) { alert("Select an object first!"); return; }
    const objectUUID = activeObject.uuid;

    if (!modifierStacks.has(objectUUID) || modifierStacks.get(objectUUID).length === 0) {
        alert("No modifiers to apply.");
        return;
    }

   if (!confirm("This will permanently apply all active modifiers to the base mesh and remove the modifier stack. Are you sure?")) {
        return;
    }

    console.log(`Applying modifiers permanently to ${activeObject.name || objectUUID}`);
    // The current geometry *is* the result of the stack (assuming updateObjectModifiers ran correctly)
    const finalGeometry = activeObject.geometry.clone(); // Clone the current state

    // Clean up modifier state for this object
    baseGeometries.set(objectUUID, finalGeometry); // The baked result becomes the new base
     modifierStacks.delete(objectUUID); // Remove the stack

    // Object already has the final geometry, but update base ref in case edits continue
     activeObject.geometry = finalGeometry;

     updateModifierPanelUI(activeObject); // Should now show empty list
     alert("Modifiers applied to base mesh.");
}

// --- New Function for Keyboard Shortcuts ---
/*function handleModelingKeyDown(event) {
    if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA' || event.target.tagName === 'SELECT') return;

    // Architectural Element Deletion (works whether modeling mode is on or off, if elements are selected)
    if ((event.key === 'Delete' || event.key === 'Backspace' || event.key.toLowerCase() === 'x') && selectedArchElements.length > 0) {
        if (!isTransforming) { // Don't delete if a modeling gizmo is active. Arch elements don't use gizmo (yet)
            event.preventDefault();
            deleteSelectedArchElements();
            return; // Deletion handled
        }
    }

    if (!isModelingMode) return; // Rest of the shortcuts are for modeling mode

    if (isTransforming || (transformControls && transformControls.dragging)) return;


    const key = event.key.toUpperCase();
    const ctrl = event.ctrlKey || event.metaKey;
    const shift = event.shiftKey;
    const alt = event.altKey;

    // Tool Shortcuts
    if (!ctrl && !shift && !alt) {
        switch (key) {
            case 'E': extrudeSelection(); event.preventDefault(); break;
            case 'G': if (selectedElements.length > 0) transformControls.setMode('translate'); event.preventDefault(); break;
            case 'R': if (selectedElements.length > 0) transformControls.setMode('rotate'); event.preventDefault(); break;
            case 'S': if (selectedElements.length > 0) transformControls.setMode('scale'); event.preventDefault(); break;
            case '1': setSelectionMode('vertex'); event.preventDefault(); break;
            case '2': setSelectionMode('edge'); event.preventDefault(); break;
            case '3': setSelectionMode('face'); event.preventDefault(); break;
            case 'I': insetSelectedFaces(); event.preventDefault(); break;
        }
    } else if (ctrl && !shift && !alt) {
        switch (key) {
            case 'B': bevelSelection(); event.preventDefault(); break;
            case 'R': initiateLoopCut(); event.preventDefault(); break;
        }
    }

     if (activeArchTool === 'stairs' && stairCreationStage === 3 && event.key === 'Enter') {
        event.preventDefault();
        finishStairsCreation();
    }

    if (event.key === 'Escape') {
        if (isLoopCutMode) { cancelLoopCut(); event.preventDefault(); }
        else if (activeArchTool) { deactivateCurrentArchTool(); event.preventDefault(); }
        else if (splineCreationMode) { finishSplineDrawing(); event.preventDefault(); }
        else if (selectedElements.length > 0) { clearSelection(); event.preventDefault(); }
        else if (selectedArchElements.length > 0) { deselectAllArchElements(); event.preventDefault(); }
    }
}*/


function handleModelingKeyDown(event) {
    if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA' || event.target.tagName === 'SELECT') return;

    // Architectural Element Deletion (works whether modeling mode is on or off, if elements are selected)
    if ((event.key === 'Delete' || event.key === 'Backspace' || event.key.toLowerCase() === 'x') && selectedArchElements.length > 0) {
        if (!isTransforming) {
            event.preventDefault();
            deleteSelectedArchElements();
            return;
        }
    }

    // Object deletion (for the active modeling object)
    if ((event.key === 'Delete' || event.key.toLowerCase() === 'x') && activeObject && selectedElements.length === 0) {
        // Only delete the active object if no sub-elements are selected
        // This avoids accidental object deletion when trying to delete faces/vertices
        if (!isTransforming) {
            event.preventDefault();
            deleteSelectedObject(); // Call the new function
            return;
        }
    }
    
    if (!isModelingMode) return; // Rest of the shortcuts are for modeling mode

    // Prevent tool activation/mode changes WHILE an active gizmo transformation is happening
    if (isTransforming || (transformControls && transformControls.dragging)) return;


    const key = event.key.toUpperCase();
    const ctrl = event.ctrlKey || event.metaKey;
    const shift = event.shiftKey;
    const alt = event.altKey;

    // Tool Shortcuts
    if (!ctrl && !shift && !alt) {
        switch (key) {
            case 'E': extrudeSelection(); event.preventDefault(); break;
            case 'G': if (selectedElements.length > 0) transformControls.setMode('translate'); event.preventDefault(); break;
            case 'R': if (selectedElements.length > 0) transformControls.setMode('rotate'); event.preventDefault(); break;
            case 'S': if (selectedElements.length > 0) transformControls.setMode('scale'); event.preventDefault(); break;
            case '1': setSelectionMode('vertex'); event.preventDefault(); break;
            case '2': setSelectionMode('edge'); event.preventDefault(); break;
            case '3': setSelectionMode('face'); event.preventDefault(); break;
            case 'I': insetSelectedFaces(); event.preventDefault(); break;
            // Case for deleting selected modeling elements (vertices, edges, faces)
            case 'X': // Blender-like 'X' key for delete
                if (selectedElements.length > 0) {
                    event.preventDefault();
                    if (selectionMode === 'vertex') deleteSelectedVertex(); // New function
                    // Implement deleteSelectedEdge() / deleteSelectedFace() here when ready
                    // For now, if no specific delete function, fall through to clear selection
                    else {
                         alert(`Delete operation for ${selectionMode} not implemented. Clearing selection.`);
                         clearSelection();
                    }
                }
                break;
        }
    } else if (ctrl && !shift && !alt) {
        switch (key) {
            case 'B': initBevelTool(); event.preventDefault(); break; // Call the new initBevelTool
            case 'R': initiateLoopCut(); event.preventDefault(); break;
        }
    } else if (shift && !ctrl && !alt) { // Shift + E for Edge Extrude
        switch (key) {
            case 'E': extrudeEdge(); event.preventDefault(); break; // Call the new extrudeEdge function
        }
    }

     if (activeArchTool === 'stairs' && stairCreationStage === 3 && event.key === 'Enter') {
        event.preventDefault();
        finishStairsCreation();
    }

    if (event.key === 'Escape') {
        // If an interactive tool (like bevel) is active, cancel it first
        if (bevelToolState.isActive) { // New condition
            cancelBevelOperation();
            event.preventDefault();
        } else if (isLoopCutMode) { cancelLoopCut(); event.preventDefault(); }
        else if (activeArchTool) { deactivateCurrentArchTool(); event.preventDefault(); }
        else if (splineCreationMode) { finishSplineDrawing(); event.preventDefault(); }
        else if (selectedElements.length > 0) { clearSelection(); event.preventDefault(); }
        else if (selectedArchElements.length > 0) { deselectAllArchElements(); event.preventDefault(); }
    }
}

async function bevelSelection() { // Mark async for potential future enhancements
    console.log("Executing Bevel Selection (Chamfer)...");
    if (!activeObject || selectedElements.length === 0 || selectionMode !== 'edge') {
        console.warn("Bevel: Select edges first."); return;
    }
    const geometry = activeObject.geometry;
    if (!geometry?.index || !geometry?.attributes.position || !geometry?.attributes.normal || !geometry?.attributes.uv) {
        console.error("Bevel requires indexed geometry with position, normal, and uv attributes."); return;
    }

    // --- Parameters ---
    const bevelOffset = parseFloat(prompt("Enter Bevel Offset:", "0.1")) || 0.1; // Simple parameter input
    if (bevelOffset <= 0) return;

    // --- Gather Data & Build Topology ---
    const selectedEdgeProxies = selectedElements.filter(elem => elem.userData.type === 'edge');
    const selectedEdges = selectedEdgeProxies.map(p => p.userData.indices); // Array of [u, v]
    const selectedEdgeKeys = new Set(selectedEdges.map(edge => getEdgeKey(edge[0], edge[1])));
    console.log(`Beveling ${selectedEdges.length} edge(s) with offset ${bevelOffset}`);

    const edgeFaceMap = buildEdgeFaceMap(geometry);
    const vertexEdgeMap = buildVertexEdgeMap(geometry); // Need Set version from previous steps
    if (!edgeFaceMap || !vertexEdgeMap) {
        console.error("Failed to build topology maps for Bevel."); return;
    }

    const originalPositions = geometry.attributes.position.array;
    const originalNormals = geometry.attributes.normal.array;
    const originalUVs = geometry.attributes.uv.array;
    const originalIndices = geometry.index.array;
    const originalVertexCount = geometry.attributes.position.count;

    const tempV1 = new THREE.Vector3();
    const tempV2 = new THREE.Vector3();

    // --- Calculate New Vertex Positions & Data ---
    // Map<originalVertexIndex, Map<edgeKey, {newIndex: number, position: Vector3}>>
    const newBevelVerticesData = new Map(); // Stores new vertex data associated with an original vert+edge combo
    let nextNewVertexIndex = originalVertexCount;
    const originalVertexNormals = new Map(); // Store original normals Map<vertIndex, Vector3>

    // Pre-calculate original vertex normals
    if(normals) {
        for(let i=0; i < originalVertexCount; i++) {
            originalVertexNormals.set(i, new THREE.Vector3().fromBufferAttribute(geometry.attributes.normal, i));
        }
    }

    // 1. Create new vertices offset along each selected edge from its endpoints
    selectedEdges.forEach(edge => {
        const [vA_idx, vB_idx] = edge;
        const edgeKey = getEdgeKey(vA_idx, vB_idx);

        const vA_pos = tempV1.fromBufferAttribute(geometry.attributes.position, vA_idx);
        const vB_pos = tempV2.fromBufferAttribute(geometry.attributes.position, vB_idx);
        const edgeDir = tempV2.clone().sub(vA_pos).normalize(); // Direction A -> B

        // Calculate offset position from A towards B
        const newPos_A = vA_pos.clone().addScaledVector(edgeDir, bevelOffset);
        // Calculate offset position from B towards A
        const newPos_B = vB_pos.clone().addScaledVector(edgeDir, -bevelOffset);

        // Store new vertex data, mapping it to the original vertex index AND the edge key
        if (!newBevelVerticesData.has(vA_idx)) newBevelVerticesData.set(vA_idx, new Map());
        newBevelVerticesData.get(vA_idx).set(edgeKey, { newIndex: nextNewVertexIndex++, position: newPos_A });

        if (!newBevelVerticesData.has(vB_idx)) newBevelVerticesData.set(vB_idx, new Map());
        newBevelVerticesData.get(vB_idx).set(edgeKey, { newIndex: nextNewVertexIndex++, position: newPos_B });
    });

    // --- Prepare New Attribute Buffers ---
    const finalVertexCount = nextNewVertexIndex;
    const newPositions = new Float32Array(finalVertexCount * 3);
    const newNormals = normals ? new Float32Array(finalVertexCount * 3) : null;
    const newUVs = uvs ? new Float32Array(finalVertexCount * 2) : null;

    newPositions.set(originalPositions);
    if (newNormals) newNormals.set(originalNormals);
    if (newUVs) newUVs.set(originalUVs);

    // Populate new vertex data
    newBevelVerticesData.forEach((edgeMap, origVertIdx) => {
        edgeMap.forEach(data => {
            newPositions.set(data.position.toArray(), data.newIndex * 3);
             // Initial Normal/UV guess: copy from original vertex
             if(newNormals && originalNormals) {
                 newNormals.set([originalNormals[origVertIdx * 3], originalNormals[origVertIdx * 3 + 1], originalNormals[origVertIdx * 3 + 2]], data.newIndex * 3);
            }
            if (newUVs && originalUVs) {
                newUVs.set([originalUVs[origVertIdx * 2], originalUVs[origVertIdx * 2 + 1]], data.newIndex * 2);
            }
        });
    });

    // --- Rebuild Index Buffer ---
    const newIndices = [];
    const facesProcessed = new Set();
    const originalFaceCount = originalIndices.length / 3;

    const getNewVertIndex = (vertex, edgeKey) => {
         const edgeMap = newBevelVerticesData.get(vertex);
         return edgeMap ? edgeMap.get(edgeKey)?.newIndex : undefined; // Add safety ?.
    };

    // Iterate over original faces
    for (let i = 0; i < originalFaceCount; i++) {
         if (facesProcessed.has(i)) continue;

         const v0_orig = originalIndices[i * 3];
         const v1_orig = originalIndices[i * 3 + 1];
         const v2_orig = originalIndices[i * 3 + 2];
         const faceVertsOrig = [v0_orig, v1_orig, v2_orig];
         const edgesInFaceKeys = [getEdgeKey(v0_orig, v1_orig), getEdgeKey(v1_orig, v2_orig), getEdgeKey(v2_orig, v0_orig)];
         const selectedMask = edgesInFaceKeys.map(key => selectedEdgeKeys.has(key));
         const selectedCount = selectedMask.filter(Boolean).length;

         if (selectedCount === 0) { // Face untouched
             newIndices.push(v0_orig, v1_orig, v2_orig);
         } else {
             facesProcessed.add(i); // Mark original face as replaced

             // Get potentially new indices for the corners of this face
             const i0_new_e20 = selectedMask[2] ? getNewVertIndex(v0_orig, edgesInFaceKeys[2]) : v0_orig;
             const i0_new_e01 = selectedMask[0] ? getNewVertIndex(v0_orig, edgesInFaceKeys[0]) : v0_orig;
             const i1_new_e01 = selectedMask[0] ? getNewVertIndex(v1_orig, edgesInFaceKeys[0]) : v1_orig;
             const i1_new_e12 = selectedMask[1] ? getNewVertIndex(v1_orig, edgesInFaceKeys[1]) : v1_orig;
             const i2_new_e12 = selectedMask[1] ? getNewVertIndex(v2_orig, edgesInFaceKeys[1]) : v2_orig;
             const i2_new_e20 = selectedMask[2] ? getNewVertIndex(v2_orig, edgesInFaceKeys[2]) : v2_orig;

            // Re-triangulate the original face area using new corner vertices
            if (selectedCount === 1) { // One edge beveled
                if (selectedMask[0]) { // Edge v0-v1 beveled
                     newIndices.push(i0_new_e01, i1_new_e01, v2_orig);
                    newIndices.push(v2_orig, i0_new_e20, i0_new_e01); // Connects to v0_orig implicitly via i0_new_e20 if mask[2] is false
                 } else if (selectedMask[1]) { // Edge v1-v2 beveled
                     newIndices.push(i1_new_e12, i2_new_e12, v0_orig);
                     newIndices.push(v0_orig, i1_new_e01, i1_new_e12);
                 } else { // Edge v2-v0 beveled
                     newIndices.push(i2_new_e20, i0_new_e20, v1_orig);
                     newIndices.push(v1_orig, i2_new_e12, i2_new_e20);
                 }
             } else if (selectedCount === 2) { // Two edges beveled (a corner)
                if (!selectedMask[0]) { // Corner at v2 (edges v1-v2, v2-v0 beveled)
                    newIndices.push(i1_new_e12, i2_new_e12, i2_new_e20); // Corner triangle
                     newIndices.push(i2_new_e20, i0_new_e20, i1_new_e12); // Quad split
                     newIndices.push(i1_new_e12, i0_new_e20, v1_orig);     // Remaining part
                } else if (!selectedMask[1]) { // Corner at v0 (edges v2-v0, v0-v1 beveled)
                     newIndices.push(i2_new_e20, i0_new_e20, i0_new_e01);
                     newIndices.push(i0_new_e01, i1_new_e01, i2_new_e20);
                     newIndices.push(i2_new_e20, i1_new_e01, v2_orig);
                } else { // Corner at v1 (edges v0-v1, v1-v2 beveled)
                    newIndices.push(i0_new_e01, i1_new_e01, i1_new_e12);
                     newIndices.push(i1_new_e12, i2_new_e12, i0_new_e01);
                     newIndices.push(i0_new_e01, i2_new_e12, v0_orig);
                 }
             } else { // Three edges beveled (inset face)
                 // Create the center triangle and three corner quads
                  newIndices.push(i0_new_e01, i1_new_e01, i2_new_e20); // Center-ish tri (adjust indices for better shape)
                  // Corner Quads
                 newIndices.push(i2_new_e12, i1_new_e12, i1_new_e01, i2_new_e20); // At v1 - WIP, might need 2 triangles
                  newIndices.push(i0_new_e20, i2_new_e20, i2_new_e12, i0_new_e01); // At v2 - WIP
                 newIndices.push(i1_new_e01, i0_new_e01, i0_new_e20, i1_new_e12); // At v0 - WIP
                  // This simple split is likely wrong, needs proper polygon triangulation/ear clipping
                   console.warn("Beveling faces (3 selected edges) index creation is basic.");
                  // Fallback for now, create the center inset triangle
                 newIndices.push(i0_new_e01, i1_new_e01, i2_new_e20);
             }
        }
    }

    // --- Create the NEW bevel faces (quads along the original edges) ---
     selectedEdges.forEach(edge => {
         const u = edge[0];
         const v = edge[1];
         const edgeKey = getEdgeKey(u, v);

         const u_new_idx = getNewVertIndex(u, edgeKey);
         const v_new_idx = getNewVertIndex(v, edgeKey);

         if (u_new_idx !== undefined && v_new_idx !== undefined) {
              // Create quad: u, v, v_new_idx, u_new_idx (Check winding order)
              newIndices.push(u, v, v_new_idx);
              newIndices.push(v_new_idx, u_new_idx, u);
         }
     });

    if (newIndices.length === 0) {
        console.error("Bevel index calculation failed, no indices generated.");
        return;
    }

    // --- Apply New Geometry ---
    const newGeometry = new THREE.BufferGeometry();
    newGeometry.setAttribute('position', new THREE.BufferAttribute(newPositions, 3));
    if (newNormals) newGeometry.setAttribute('normal', new THREE.BufferAttribute(newNormals, 3));
    if (newUVs) newGeometry.setAttribute('uv', new THREE.BufferAttribute(newUVs, 2));
    newGeometry.setIndex(newIndices);

    try {
        console.log("Computing normals for beveled geometry...");
        newGeometry.computeVertexNormals(); // Essential after bevel
    } catch (e) {
        console.error("Error computing normals after bevel:", e);
    }

    // --- Update Object & Finalize ---
    const oldGeometry = activeObject.geometry;
    activeObject.geometry = newGeometry;
    oldGeometry.dispose();

    if (baseGeometries.has(activeObject.uuid)) {
         console.log("Bevel performed on mesh with stored base geometry. Updating base (EXPERIMENTAL).");
         baseGeometries.set(activeObject.uuid, newGeometry.clone());
         document.getElementById('subdivisionLevelsSlider').value = 0;
     }

    console.log("Bevel operation completed.");
    clearSelection();
    showMeshStructure(activeObject);
}
// Function updateSubdivision needs adjustment for non-indexed geom
// Using SubdivisionModifier directly on non-indexed might be complex.
// Consider converting to indexed first if needed, or using a different subdiv approach.
let baseGeometries = new Map();
let modifierStacks = new Map();

// Architecture Tools
//let activeArchTool = null; // 'wall', 'door', 'window', 'stairs', 'measure'
// --- START OF MODIFIED/ADDED nanite-ex.js SECTIONS ---

// ... (Keep existing global variables like helperUpdateTimeout, lastHelperUpdateTime, etc.) ...

// --- Architecture Tool Specific State ---
let measurePoints = [];
let measureDisplayElement = null;
let placementHelper = null;

let wallHeight = 2.5; // Default wall height
let wallThickness = 0.2; // Default wall thickness

// let measurePoints = []; // Already global
// let measureDisplayElement = null; // Already global
let measureLine = null; // For visual feedback

// let placementHelper = null; // Already global
let placementObjectType = null; // 'door' or 'window'
let placementObjectDimensions = { width: 0.9, height: 2.1, depth: 0.1 }; // Default for door

let stairClickCount = 0;
let stairStartPoint = null;

let stairCreationStage = 0; // 0: inactive, 1: defining length, 2: defining width, 3: defining height
let stairHeight = 2.5; // Will be set interactively
let stairRotation = 0;

let stairEndPoint = null;
let stairPreviewObject = null; // Can be Line or Group for preview
let stairWidth = 1.0;
let stairTotalHeight = 2.5;
let stairStepHeight = 0.18;
let stairStepDepth = 0.25;
const stairDirectionVector = new THREE.Vector3(); // For stair orientation
let stairPreviewActive = false;
let stairPreviewGroup = null;

/*function initiateLoopCut() {
    cleanupStructureSynthTool(); // If you have the synth tool
    deactivateCurrentArchTool(); // Deactivate other arch tools

    console.log("Initiating Loop Cut Mode...");
    if (!activeObject || !activeObject.geometry || !activeObject.geometry.index) {
         console.error("Loop cut requires an indexed geometry on the active object.");
         return;
    }
     if (isTransforming) { return; }

    if (selectionMode !== 'edge' && selectionMode !== 'all') {
          setSelectionMode('edge');
          console.log("Switched to Edge selection mode for Loop Cut.");
    } else if (activeObject) {
          showMeshStructure(activeObject);
    }

    isLoopCutMode = true;
    if (controls) controls.enabled = false;
    transformControls.detach();
    clearSelection();

    renderer.domElement.style.cursor = 'crosshair';

    if (!loopCutPreviewLine) {
        loopCutPreviewLine = new THREE.Line(
            new THREE.BufferGeometry(),
            new THREE.LineBasicMaterial({
                color: LOOP_CUT_PREVIEW_COLOR,
                linewidth: 3,
                depthTest: false,
                depthWrite: false,
                transparent: true,
                opacity: 0.9
            })
        );
        loopCutPreviewLine.renderOrder = 999;
        scene.add(loopCutPreviewLine);
    }
    loopCutPreviewLine.visible = false;
    loopCutPreviewLine.userData = {};

    renderer.domElement.removeEventListener('mousemove', handleLoopCutPreviewInternal);
    renderer.domElement.addEventListener('mousemove', handleLoopCutPreviewInternal, false);
    renderer.domElement.removeEventListener('click', handleLoopCutConfirmInternal);
    renderer.domElement.addEventListener('click', handleLoopCutConfirmInternal, false);

    alert("Loop Cut: Hover over an edge to preview the loop. Click to cut.");
}*/ 

function initiateLoopCut() {
    if (!activeObject || !activeObject.geometry.index) {
        alert("Loop Cut requires an active object with indexed geometry.");
        return;
    }
    deactivateCurrentArchTool(); // Deactivate other tools first

    isLoopCutMode = true;
    loopCutState = 'preview'; // Set initial state
    console.log("Loop Cut Mode Activated: Previewing");

    if (selectionMode !== 'edge') setSelectionMode('edge');
    else showMeshStructure(activeObject);

    if (controls) controls.enabled = false;
    transformControls.detach();
    clearSelection();
    renderer.domElement.style.cursor = 'crosshair';

    if (!loopCutPreviewLine) {
        loopCutPreviewLine = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({
            color: LOOP_CUT_PREVIEW_COLOR,
            linewidth: 3,
            depthTest: false,
            depthWrite: false,
            transparent: true
        }));
        loopCutPreviewLine.renderOrder = 999;
        scene.add(loopCutPreviewLine);
    }
    loopCutPreviewLine.visible = false;
    loopCutPreviewLine.userData = {};

    alert("Loop Cut: Hover over an edge to preview. Click once to place the loop, then slide and click again to confirm.");
}

// This function is also fine as is.
/*function handleLoopCutPreviewInternal(event) {
    if (!isLoopCutMode || !activeObject || !edgeHelpers || edgeHelpers.children.length === 0) {
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
        const intersectedEdgeHelper = closestEdgeIntersect.object;
        const startEdgeIndices = intersectedEdgeHelper.userData.indices;

        const geometry = activeObject.geometry;
        activeObject.updateMatrixWorld(true);
        const currentMatrixWorld = activeObject.matrixWorld.clone();

        const edgeFaceMap = buildEdgeFaceMap(geometry);
        const vertexEdgeMap = buildVertexEdgeMap(geometry);
        const vertexFaceMap = buildVertexFaceMap(geometry);

        if (!edgeFaceMap || !vertexEdgeMap || !vertexFaceMap) {
            loopCutPreviewLine.visible = false;
            return;
        }

        const loopEdgeSegments = findEdgeLoop(geometry, startEdgeIndices, edgeFaceMap, vertexEdgeMap, vertexFaceMap);

        if (loopEdgeSegments && loopEdgeSegments.length > 0) {
            const previewWorldPoints = [];
            const vA_local = new THREE.Vector3(), vB_local = new THREE.Vector3(), midPoint_local = new THREE.Vector3();

            loopEdgeSegments.forEach(segment => {
                vA_local.fromBufferAttribute(geometry.attributes.position, segment[0]);
                vB_local.fromBufferAttribute(geometry.attributes.position, segment[1]);
                midPoint_local.lerpVectors(vA_local, vB_local, 0.5);
                previewWorldPoints.push(midPoint_local.clone().applyMatrix4(currentMatrixWorld));
            });
            
            if (loopEdgeSegments.length > 1 && loopEdgeSegments[0][0] === loopEdgeSegments[loopEdgeSegments.length - 1][1]) {
                previewWorldPoints.push(previewWorldPoints[0].clone());
            }

            if (previewWorldPoints.length >= 2) {
                loopCutPreviewLine.geometry.dispose();
                loopCutPreviewLine.geometry = new THREE.BufferGeometry().setFromPoints(previewWorldPoints);
                loopCutPreviewLine.material.color.setHex(LOOP_CUT_PREVIEW_COLOR);
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

function handleLoopCutConfirmInternal(event) {
    if (!isLoopCutMode || !activeObject || !loopCutPreviewLine.visible || !loopCutPreviewLine.userData.loopEdgeSegmentsToCut?.length) {
        return;
    }

    const loopEdgesToCut = loopCutPreviewLine.userData.loopEdgeSegmentsToCut;
    console.log(`%cConfirming Loop Cut for ${loopEdgesToCut.length} edge segments...`, "color: orange; font-weight:bold;");

    const currentGeometry = activeObject.geometry;
    if (!currentGeometry?.index || !currentGeometry.attributes.position || !currentGeometry.attributes.normal || !currentGeometry.attributes.uv) {
        console.error("Loop cut requires indexed geometry with position, normal, and uv attributes.");
        cancelLoopCut();
        return;
    }

    // --- Part 1: Create new vertices at the midpoint of each cut edge. (This part of your code was good) ---
    const positions = currentGeometry.attributes.position;
    const normals = currentGeometry.attributes.normal;
    const uvs = currentGeometry.attributes.uv;
    const originalIndicesArray = currentGeometry.index.array;
    const originalVertexCount = positions.count;

    const newMidpointVerticesData = new Map();
    let nextNewVertexIndex = originalVertexCount;
    const posA = new THREE.Vector3(), posB = new THREE.Vector3();
    const normA = new THREE.Vector3(), normB = new THREE.Vector3();
    const uvA = new THREE.Vector2(), uvB = new THREE.Vector2();

    for (const edgeSegment of loopEdgesToCut) {
        const [u, v] = edgeSegment;
        const edgeKey = getEdgeKey(u, v);
        if (newMidpointVerticesData.has(edgeKey)) continue;

        posA.fromBufferAttribute(positions, u); posB.fromBufferAttribute(positions, v);
        normA.fromBufferAttribute(normals, u); normB.fromBufferAttribute(normals, v);
        uvA.fromBufferAttribute(uvs, u); uvB.fromBufferAttribute(uvs, v);

        newMidpointVerticesData.set(edgeKey, {
            newIndex: nextNewVertexIndex++,
            position: new THREE.Vector3().lerpVectors(posA, posB, 0.5),
            normal: new THREE.Vector3().lerpVectors(normA, normB, 0.5).normalize(),
            uv: new THREE.Vector2().lerpVectors(uvA, uvB, 0.5)
        });
    }

    // --- Part 2: Prepare new attribute buffers. (This part was also good) ---
    const finalVertexCount = originalVertexCount + newMidpointVerticesData.size;
    const newPositionsArray = new Float32Array(finalVertexCount * 3);
    const newNormalsArray = new Float32Array(finalVertexCount * 3);
    const newUVsArray = new Float32Array(finalVertexCount * 2);

    newPositionsArray.set(positions.array);
    newNormalsArray.set(normals.array);
    newUVsArray.set(uvs.array);
    
    newMidpointVerticesData.forEach(data => {
        newPositionsArray.set(data.position.toArray(), data.newIndex * 3);
        newNormalsArray.set(data.normal.toArray(), data.newIndex * 3);
        newUVsArray.set(data.uv.toArray(), data.newIndex * 2);
    });

    // --- Part 3: Rebuild the index buffer. (This is the critical fix) ---
    const finalNewIndices = [];
    const originalFaceCount = originalIndicesArray.length / 3;

    // We iterate through every single face of the original mesh.
    for (let i = 0; i < originalFaceCount; i++) {
        const v0 = originalIndicesArray[i * 3 + 0];
        const v1 = originalIndicesArray[i * 3 + 1];
        const v2 = originalIndicesArray[i * 3 + 2];

        // Check which of the 3 edges of this face are being cut.
        const mid01_data = newMidpointVerticesData.get(getEdgeKey(v0, v1));
        const mid12_data = newMidpointVerticesData.get(getEdgeKey(v1, v2));
        const mid20_data = newMidpointVerticesData.get(getEdgeKey(v2, v0));

        // Use a simple bitmask for clarity: 4 for edge 0-1, 2 for 1-2, 1 for 2-0
        const cutMask = (mid01_data ? 4 : 0) | (mid12_data ? 2 : 0) | (mid20_data ? 1 : 0);

        // Based on how many edges are cut, we replace the single original face
        // with the correct new triangles. This is exhaustive and robust.
        switch (cutMask) {
            case 0: // 000: No edges cut. Keep original face.
                finalNewIndices.push(v0, v1, v2);
                break;
            
            case 4: // 100: Edge v0-v1 is cut. Split into a quad.
                { const m01 = mid01_data.newIndex; finalNewIndices.push(v0, m01, v2, m01, v1, v2); }
                break;
            case 2: // 010: Edge v1-v2 is cut.
                { const m12 = mid12_data.newIndex; finalNewIndices.push(v1, m12, v0, m12, v2, v0); }
                break;
            case 1: // 001: Edge v2-v0 is cut.
                { const m20 = mid20_data.newIndex; finalNewIndices.push(v2, m20, v1, m20, v0, v1); }
                break;

            case 6: // 110: Corner at v1 is cut. Create 3 new faces.
                { const m01 = mid01_data.newIndex; const m12 = mid12_data.newIndex; finalNewIndices.push(v0, m01, v2, m01, m12, v2, m01, v1, m12); }
                break;
            case 3: // 011: Corner at v2 is cut.
                { const m12 = mid12_data.newIndex; const m20 = mid20_data.newIndex; finalNewIndices.push(v1, m12, v0, m12, m20, v0, m12, v2, m20); }
                break;
            case 5: // 101: Corner at v0 is cut.
                { const m20 = mid20_data.newIndex; const m01 = mid01_data.newIndex; finalNewIndices.push(v2, m20, v1, m20, m01, v1, m20, v0, m01); }
                break;

            case 7: // 111: All 3 edges are cut. Create 4 new faces.
                { const m01 = mid01_data.newIndex; const m12 = mid12_data.newIndex; const m20 = mid20_data.newIndex; finalNewIndices.push(v0, m01, m20, v1, m12, m01, v2, m20, m12, m01, m12, m20); }
                break;
        }
    }

    // --- Part 4: Apply the new geometry. (This part was also good) ---
    const newGeometry = new THREE.BufferGeometry();
    newGeometry.setAttribute('position', new THREE.BufferAttribute(newPositionsArray, 3));
    if (normals) newGeometry.setAttribute('normal', new THREE.BufferAttribute(newNormalsArray, 3));
    if (uvs) newGeometry.setAttribute('uv', new THREE.BufferAttribute(newUVsArray, 2));
    newGeometry.setIndex(finalNewIndices);
    newGeometry.computeVertexNormals();

    const oldGeometry = activeObject.geometry;
    activeObject.geometry = newGeometry;
    oldGeometry.dispose();

    if (baseGeometries.has(activeObject.uuid)) {
        baseGeometries.set(activeObject.uuid, newGeometry.clone());
    }

    console.log("Loop Cut applied successfully.");
    cleanupLoopCutMode();
    showMeshStructure(activeObject);
}*/ 


function handleLoopCutPreviewInternal(event) {
    if (!isLoopCutMode || !activeObject) return;

    // Update mouse and raycaster
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    raycaster.params.Line.threshold = 0.05;

    // --- STATE 1: PREVIEWING where the loop will be ---
    if (loopCutState === 'preview') {
        const edgeIntersects = raycaster.intersectObjects(edgeHelpers.children, false);
        const closestEdge = findClosestIntersection(edgeIntersects, 'edge');

        if (closestEdge) {
            const startEdge = closestEdge.object.userData.indices;
            const loopSegments = findEdgeLoop(activeObject.geometry, startEdge, edgeFaceMap, vertexEdgeMap, vertexFaceMap);

            if (loopSegments && loopSegments.length > 0) {
                updateLoopCutPreviewLine(loopSegments, 0.5); // Preview at 50%
                loopCutPreviewLine.userData.loopEdgeSegmentsToCut = loopSegments;
            } else {
                loopCutPreviewLine.visible = false;
            }
        } else {
            loopCutPreviewLine.visible = false;
        }
    }
    // --- STATE 2: SLIDING the confirmed loop ---
    else if (loopCutState === 'sliding') {
        const totalWidth = 200; // Screen width in pixels to represent the full slide range
        const deltaX = event.clientX - loopCutSlideData.startX;
        let slideFactor = 0.5 + (deltaX / totalWidth);
        loopCutSlideData.slideFactor = Math.max(0.01, Math.min(0.99, slideFactor)); // Clamp between 1% and 99%

        // Update the visual preview line with the new slide factor
        updateLoopCutPreviewLine(loopCutPreviewLine.userData.loopEdgeSegmentsToCut, loopCutSlideData.slideFactor);
    }
}

function handleLoopCutConfirmInternal(event) {
    if (!isLoopCutMode || !activeObject || !loopCutPreviewLine.visible) return;

    // --- On FIRST click, we transition from 'preview' to 'sliding' ---
    if (loopCutState === 'preview') {
        loopCutState = 'sliding';
        loopCutSlideData.startX = event.clientX;
        loopCutSlideData.slideFactor = 0.5;
        loopCutPreviewLine.material.color.set(0xffff00); // Change color to yellow to indicate sliding phase
        console.log("Loop Cut: Loop placed, now sliding.");
        return; // Wait for the second click
    }

    // --- On SECOND click, we finalize the cut ---
    if (loopCutState === 'sliding') {
        const loopEdgesToCut = loopCutPreviewLine.userData.loopEdgeSegmentsToCut;
        if (!loopEdgesToCut || loopEdgesToCut.length === 0) {
            console.error("Cannot confirm loop cut, no loop data found.");
            cancelLoopCut();
            return;
        }

        console.log(`Confirming Loop Cut at slide factor: ${loopCutSlideData.slideFactor.toFixed(3)}`);
        
        const oldGeometry = activeObject.geometry.clone(); // For undo history
        
        // The core logic for creating the new geometry
        const newGeometry = createLoopCutGeometry(activeObject.geometry, loopEdgesToCut, loopCutSlideData.slideFactor);

        if (newGeometry) {
            activeObject.geometry.dispose();
            activeObject.geometry = newGeometry;
            
            if (window.historyManager) {
                window.historyManager.recordGeometryChange(activeObject, oldGeometry);
            }

            console.log("Loop Cut applied successfully.");
        } else {
            console.error("Loop cut operation failed to generate new geometry.");
        }

        cancelLoopCut(); // Cleanup and exit the tool
    }
}

function updateLoopCutPreviewLine(loopSegments, slideFactor) {
    const previewWorldPoints = [];
    const positions = activeObject.geometry.attributes.position;
    activeObject.updateMatrixWorld(true);
    const matrix = activeObject.matrixWorld;
    const vA = new THREE.Vector3(), vB = new THREE.Vector3(), lerpPoint = new THREE.Vector3();

    loopSegments.forEach(segment => {
        vA.fromBufferAttribute(positions, segment[0]);
        vB.fromBufferAttribute(positions, segment[1]);
        lerpPoint.lerpVectors(vA, vB, slideFactor); // LERP with the slide factor
        previewWorldPoints.push(lerpPoint.clone().applyMatrix4(matrix));
    });
    
    // Close the loop visually if it's a closed loop
    if (loopSegments.length > 1 && loopSegments[0][0] === loopSegments[loopSegments.length - 1][1]) {
        previewWorldPoints.push(previewWorldPoints[0].clone());
    }

    if (previewWorldPoints.length >= 2) {
        loopCutPreviewLine.geometry.dispose();
        loopCutPreviewLine.geometry = new THREE.BufferGeometry().setFromPoints(previewWorldPoints);
        loopCutPreviewLine.visible = true;
    } else {
        loopCutPreviewLine.visible = false;
    }
}

// NEW core logic function for creating the final geometry
function createLoopCutGeometry(geometry, loopEdges, slideFactor) {
    const positions = geometry.attributes.position;
    const normals = geometry.attributes.normal;
    const uvs = geometry.attributes.uv;
    const originalIndices = geometry.index.array;
    const originalVertexCount = positions.count;

    const newVertexData = new Map();
    let nextNewVertexIndex = originalVertexCount;
    
    // 1. Create new vertex data based on the final slide factor
    for (const edge of loopEdges) {
        const [u, v] = edge;
        const key = getEdgeKey(u, v);
        if (newVertexData.has(key)) continue;

        const posA = new THREE.Vector3().fromBufferAttribute(positions, u);
        const posB = new THREE.Vector3().fromBufferAttribute(positions, v);
        const normA = new THREE.Vector3().fromBufferAttribute(normals, u);
        const normB = new THREE.Vector3().fromBufferAttribute(normals, v);
        const uvA = new THREE.Vector2().fromBufferAttribute(uvs, u);
        const uvB = new THREE.Vector2().fromBufferAttribute(uvs, v);

        newVertexData.set(key, {
            newIndex: nextNewVertexIndex++,
            position: new THREE.Vector3().lerpVectors(posA, posB, slideFactor),
            normal: new THREE.Vector3().lerpVectors(normA, normB, slideFactor).normalize(),
            uv: new THREE.Vector2().lerpVectors(uvA, uvB, slideFactor),
        });
    }

    // 2. Prepare new attribute buffers
    const finalVertexCount = originalVertexCount + newVertexData.size;
    const newPositions = new Float32Array(finalVertexCount * 3);
    const newNormals = new Float32Array(finalVertexCount * 3);
    const newUVs = new Float32Array(finalVertexCount * 2);

    newPositions.set(positions.array);
    newNormals.set(normals.array);
    newUVs.set(uvs.array);
    
    newVertexData.forEach(data => {
        data.position.toArray(newPositions, data.newIndex * 3);
        data.normal.toArray(newNormals, data.newIndex * 3);
        data.uv.toArray(newUVs, data.newIndex * 2);
    });

    // 3. Rebuild index buffer (using the robust mask method)
    const finalIndices = [];
    for (let i = 0; i < originalIndices.length; i += 3) {
        const v0 = originalIndices[i], v1 = originalIndices[i+1], v2 = originalIndices[i+2];
        const mid01 = newVertexData.get(getEdgeKey(v0, v1));
        const mid12 = newVertexData.get(getEdgeKey(v1, v2));
        const mid20 = newVertexData.get(getEdgeKey(v2, v0));
        const cutMask = (mid01 ? 4 : 0) | (mid12 ? 2 : 0) | (mid20 ? 1 : 0);

        switch (cutMask) {
            case 0: finalIndices.push(v0, v1, v2); break;
            case 1: { const m = mid20.newIndex; finalIndices.push(v2, m, v1, m, v0, v1); } break;
            case 2: { const m = mid12.newIndex; finalIndices.push(v1, m, v0, m, v2, v0); } break;
            case 3: { const m1 = mid12.newIndex, m2 = mid20.newIndex; finalIndices.push(v1, m1, v0, m1, m2, v0, m1, v2, m2); } break;
            case 4: { const m = mid01.newIndex; finalIndices.push(v0, m, v2, m, v1, v2); } break;
            case 5: { const m1 = mid20.newIndex, m2 = mid01.newIndex; finalIndices.push(v2, m1, v1, m1, m2, v1, m1, v0, m2); } break;
            case 6: { const m1 = mid01.newIndex, m2 = mid12.newIndex; finalIndices.push(v0, m1, v2, m1, m2, v2, m1, v1, m2); } break;
            case 7: { const m1=mid01.newIndex, m2=mid12.newIndex, m3=mid20.newIndex; finalIndices.push(v0,m1,m3, v1,m2,m1, v2,m3,m2, m1,m2,m3); } break;
        }
    }

    // 4. Create and return the final geometry
    const newGeometry = new THREE.BufferGeometry();
    newGeometry.setAttribute('position', new THREE.BufferAttribute(newPositions, 3));
    newGeometry.setAttribute('normal', new THREE.BufferAttribute(newNormals, 3));
    newGeometry.setAttribute('uv', new THREE.BufferAttribute(newUVs, 2));
    newGeometry.setIndex(finalIndices);
    newGeometry.computeBoundingSphere(); // Bounds are important

    return newGeometry;
}


/*function cancelLoopCut() {
    if (!isLoopCutMode) return;
    console.log("Cancelling Loop Cut.");
    cleanupLoopCutMode();
}

function cleanupLoopCutMode() {
    isLoopCutMode = false;
    renderer.domElement.removeEventListener('mousemove', handleLoopCutPreviewInternal, false);
    renderer.domElement.removeEventListener('click', handleLoopCutConfirmInternal, false);
    
    if (loopCutPreviewLine) {
        loopCutPreviewLine.visible = false;
        loopCutPreviewLine.userData = {};
    }
    
    if (renderer.domElement) {
        renderer.domElement.style.cursor = 'default';
    }
    
    if (controls && !isTransforming && !activeArchTool) {
        controls.enabled = true;
    }
}*/


function cancelLoopCut() {
    if (!isLoopCutMode) return;
    console.log("Cancelling Loop Cut.");
    cleanupLoopCutMode();
}

function cleanupLoopCutMode() {
    isLoopCutMode = false;
    loopCutState = null;
    if (loopCutPreviewLine) {
        loopCutPreviewLine.visible = false;
        loopCutPreviewLine.material.color.set(LOOP_CUT_PREVIEW_COLOR); // Reset color
    }
    renderer.domElement.style.cursor = 'default';
    if (controls && !isTransforming) {
        controls.enabled = true;
    }
}

async function updateSubdivision() { // Make async if subdivision library is async
    if (!activeObject || !activeObject.geometry) return;
    if (isTransforming) return; // Don't subdivide while dragging

    // Check if this object is suitable (BufferGeometry needed)
    if (!activeObject.geometry.isBufferGeometry) {
        console.warn("Object's geometry is not BufferGeometry. Cannot subdivide.");
        return;
    }

    const subdivisionLevel = parseInt(document.getElementById('subdivisionLevelsSlider').value);
    const objectUUID = activeObject.uuid;

    console.log(`Updating Subdivision to Level: ${subdivisionLevel} for ${objectUUID}`);

    // --- Get or Store Base Geometry ---
    let baseGeometry = baseGeometries.get(objectUUID);
    if (!baseGeometry) {
        // First time subdividing this object, store its current geometry as base
        // IMPORTANT: Clone it so modifications don't affect the original source
        baseGeometry = activeObject.geometry.clone();
        baseGeometries.set(objectUUID, baseGeometry);
        console.log("Stored base geometry for", objectUUID);
    }

    // --- Apply Subdivision ---
    clearSelection();       // Deselect before modifying geometry drastically
    transformControls.detach(); // Detach controls

    let newGeometry = null;

    try {
        if (subdivisionLevel === 0) {
            // Restore base geometry
            newGeometry = baseGeometry.clone(); // Clone again to prevent base modification
            console.log("Restored base geometry.");
        } else {
            console.log("Applying Catmull-Clark Subdivision...");
            // --- Placeholder for the actual subdivision ---
            // This function needs to exist and work with BufferGeometry
            // It should take the BASE geometry and the target LEVEL
            newGeometry = applyCatmullClarkSubdivision(baseGeometry, subdivisionLevel); // Assuming this returns a NEW geometry
            // --- End Placeholder ---

            if (!newGeometry || !newGeometry.isBufferGeometry) {
                throw new Error("Subdivision function did not return a valid BufferGeometry.");
            }
            console.log(`Subdivision successful. Target Level: ${subdivisionLevel}`);
        }

        // --- Replace Geometry ---
        const oldGeometry = activeObject.geometry;
        activeObject.geometry = newGeometry; // Assign new geometry
        oldGeometry.dispose();               // Dispose of the old one IMPORTANT!

        activeObject.geometry.computeVertexNormals(); // Recalculate normals

        showMeshStructure(activeObject); // Update helpers for the new structure

    } catch (error) {
        console.error("Error during subdivision:", error);
        // Optionally try restoring the last known good geometry or base geometry
        if (activeObject.geometry !== baseGeometry) { // Check if base wasn't already active
            activeObject.geometry.dispose();
            activeObject.geometry = baseGeometry.clone();
            activeObject.geometry.computeVertexNormals();
            showMeshStructure(activeObject);
        }
        // Reset slider maybe?
         document.getElementById('subdivisionLevelsSlider').value = 0;
    }
}

// --- Placeholder: Replace with actual implementation ---
// This needs to handle BufferGeometry attributes (position, normal, uv, index) correctly
// and implement the Catmull-Clark algorithm. It's non-trivial.
function applyCatmullClarkSubdivision(sourceGeometry, level) {
    console.warn(`applyCatmullClarkSubdivision is a placeholder. Level ${level} requested.`);
    // --- Actual Implementation Needed Here ---
    // Example Structure:
    // 1. Check if geometry is suitable (e.g., has positions, maybe index).
    // 2. Create temporary data structures if needed (e.g., half-edge).
    // 3. Loop 'level' times:
    //    a. Calculate face points.
    //    b. Calculate edge points.
    //    c. Update original vertex positions.
    //    d. Create new index buffer connecting points according to Catmull-Clark rules.
    //    e. Update UVs (interpolation is complex).
    // 4. Create and return a NEW BufferGeometry with the results.

    // For now, just return a clone to avoid breaking the flow entirely
     if (level > 0) {
          console.warn("Returning simple clone as subdivision placeholder.")
         let tempGeo = sourceGeometry.clone();
         // Maybe do *something* simple like average vertices? (Still doesn't subdivide)
         return tempGeo;
     } else {
        return sourceGeometry.clone(); // level 0 should return base
     }
}

function togglePerformanceMode() {
    isPerformanceMode = !isPerformanceMode;
     const perfButton = document.getElementById('performance-mode');
     if(perfButton){
          perfButton.textContent = isPerformanceMode ? "Perf Mode: ON" : "Qual Mode: ON";
     }

    if (activeObject && isModelingMode) {
        // Refresh helpers with the new mode setting
        showMeshStructure(activeObject);
    }
}


// --- showMeshStructure modifications ---
function showMeshStructure(object) {
    // Clear any pending update timer
    if (helperUpdateTimeout) clearTimeout(helperUpdateTimeout);

    // Simple rate limiting based on time - prevent spamming helper updates
    const now = Date.now();
    if (now - lastHelperUpdateTime < MIN_UPDATE_INTERVAL && !isTransforming /*Allow faster updates if not dragging*/ ) {
        // Reschedule if too soon and not critical (like after transform)
         helperUpdateTimeout = setTimeout(() => showMeshStructure(object), MIN_UPDATE_INTERVAL);
        return;
    }
    lastHelperUpdateTime = now;

    // console.time("showMeshStructure"); // Performance measurement

    // --- Re-Add helpers to scene ---
    clearMeshStructure(); // Clear and prepare helper groups
     // Scene add/remove is handled by clearMeshStructure now

     if (!isModelingMode || !object || !object.geometry || !object.geometry.attributes.position) {
        // If not in modeling mode, or no valid object, clearMeshStructure has already done its job.
        return;
    }
    activeObject = object; // Ensure activeObject is set

    const geometry = object.geometry;
    const positions = geometry.attributes.position;
    const matrix = object.matrixWorld.clone(); // Use object's current world matrix
    const vertexSizeValue = parseFloat(document.getElementById('vertexSizeSlider').value);
    const vertexSize = (parseFloat(document.getElementById('vertexSizeSlider').value) || 0.5) * 0.1;
    const edgeThicknessValue = parseFloat(document.getElementById('edgeThicknessSlider').value);
    const edgeThickness = isNaN(edgeThicknessValue) ? 1 : edgeThicknessValue;
    const faceOpacityValue = parseFloat(document.getElementById('faceOpacitySlider').value);
    const faceOpacity = isNaN(faceOpacityValue) ? 0.5 : faceOpacityValue;

    const totalVertices = positions.count;
    const showFullHelpers = !isPerformanceMode || totalVertices <= MAX_HELPERS;
 if (showFullHelpers) {
        if ((selectionMode === 'vertex' || selectionMode === 'all') && totalVertices > 0) { // "all" mode is conceptual
            const instanceCount = totalVertices;
            const sphereGeom = new THREE.SphereGeometry(vertexSize, 8, 8);
            const sphereMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
            const instancedMesh = new THREE.InstancedMesh(sphereGeom, sphereMat, instanceCount);
            instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            instancedMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(instanceCount * 3), 3);
            instancedMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
            instancedMesh.userData.vertexIndices = [];
            const dummy = new THREE.Object3D();
            const baseColor = new THREE.Color(0x2222FF);

            for (let i = 0; i < instanceCount; i++) {
                dummy.position.fromBufferAttribute(positions, i).applyMatrix4(matrix);
                dummy.updateMatrix();
                instancedMesh.setMatrixAt(i, dummy.matrix);
                instancedMesh.setColorAt(i, baseColor);
                instancedMesh.userData.vertexIndices.push(i);
            }
            instancedMesh.userData.type = 'vertex-instanced';
            instancedMesh.instanceMatrix.needsUpdate = true;
            instancedMesh.instanceColor.needsUpdate = true;
            vertexHelpers.add(instancedMesh);
        }
        updateEdgeFaceHelpers(); // Generates edges/faces based on selectionMode
    } else {
        createReducedMeshHelpers(positions, matrix, null, vertexSize,
                                 parseFloat(document.getElementById('edgeThicknessSlider').value) || 1,
                                 parseFloat(document.getElementById('faceOpacitySlider').value) || 0.5);
    }
    resetHighlights();
     // console.timeEnd("showMeshStructure");
}


function updateObjectModifiers(object) {
    if (!object || !object.uuid) return;

    const objectUUID = object.uuid;
    let currentGeometry = null;

    // 1. Get the Base Geometry
    let baseGeometry = baseGeometries.get(objectUUID);
    if (!baseGeometry) {
        // If no base is stored, the current geometry *is* the base (first time applying mods)
        baseGeometry = object.geometry.clone();
        baseGeometries.set(objectUUID, baseGeometry);
        console.log(`Stored base geometry for ${object.name || objectUUID}`);
    } else {
        // Always start modification from a fresh clone of the base
        baseGeometry = baseGeometry.clone();
    }

    currentGeometry = baseGeometry; // Start with the base clone

    // 2. Get the Modifier Stack
    const stack = modifierStacks.get(objectUUID) || [];

    // 3. Apply Active Modifiers Sequentially
    for (const modifier of stack) {
        if (!modifier.active) continue;

        console.log(`Applying modifier: ${modifier.type}`);
        let modifiedGeometry = null;
        try {
            switch (modifier.type) {
                case 'solidify':
                    modifiedGeometry = applySolidifyModifier(currentGeometry, modifier.thickness || 0.1);
                    break;
                case 'array':
                     modifiedGeometry = applyArrayModifier(currentGeometry, modifier.count || 2, modifier.offsetType || 'relative', modifier.offsetVector || [1,0,0]);
                    break;
                // case 'mirror':
                //     modifiedGeometry = applyMirrorModifier(currentGeometry, modifier.axis || 'x', modifier.useObjectCenter);
                //     break;
                // case 'subdivision': // If you have the lib
                //      modifiedGeometry = applyCatmullClarkSubdivision(currentGeometry, modifier.level || 1);
                //      break;
                 case 'bevel': // Needs advanced bevel lib/implementation
                      console.warn("Advanced Bevel Modifier not implemented yet.");
                     modifiedGeometry = currentGeometry; // Pass through
                     break;
                 case 'boolean': // Needs CSG lib & target object
                     console.warn("Boolean Modifier not implemented yet.");
                      modifiedGeometry = currentGeometry; // Pass through
                      break;
                default:
                     console.warn(`Unsupported modifier type: ${modifier.type}`);
                     modifiedGeometry = currentGeometry; // Pass geometry through
            }
        } catch (error) {
             console.error(`Error applying modifier ${modifier.type}:`, error);
              // Optionally stop modifier application, revert to base, show error UI
              // For now, just stop processing this stack and keep the last good geometry
             object.geometry.dispose(); // Dispose potentially bad geometry
              object.geometry = currentGeometry; // Revert to geometry before the failing modifier
              object.geometry.computeVertexNormals(); // Ensure normals ok
             showMeshStructure(object); // Update helpers
              return; // Stop update process for this object
        }


        // If modification was successful, dispose previous and continue
         if (modifiedGeometry && modifiedGeometry !== currentGeometry) {
              currentGeometry.dispose(); // Dispose the intermediate geometry
              currentGeometry = modifiedGeometry;
         } else if (!modifiedGeometry){
            // Modifier failed silently, keep current geometry
             console.warn(`Modifier ${modifier.type} did not return a valid geometry.`);
              modifiedGeometry = currentGeometry;
        }
    }

    // 4. Apply the final resulting geometry to the object
    if (object.geometry !== currentGeometry) { // Check if geometry actually changed
        const oldGeo = object.geometry;
        object.geometry = currentGeometry;
        oldGeo.dispose(); // Dispose the object's previous geometry
         console.log(`Updated geometry for ${object.name || objectUUID} after modifiers.`);
    } else {
         // Geometry didn't change (e.g., only base existed, or modifier failed silently)
         // Ensure base clone is disposed if it wasn't used
          if (currentGeometry === baseGeometry && !stack.some(m => m.active)) {
             currentGeometry.dispose(); // Dispose the clone, object keeps original
          }
    }

    // 5. Update Visuals and Bounds
    object.geometry.computeVertexNormals(); // Always good practice
    object.geometry.computeBoundingBox();
    object.geometry.computeBoundingSphere();
    showMeshStructure(object); // Update helpers if in modeling mode
}

// Placeholder Implementations for Modifiers (Replace with actual geometry logic)
function applySolidifyModifier(geometry, thickness) {
    console.log(`Placeholder: Solidify with thickness ${thickness}`);
    // Requires calculating offset vertices along normals and creating connecting faces. Complex.
    // Libraries might exist, or need manual implementation.
     alert("Solidify Modifier logic not implemented.");
     return geometry.clone(); // Return clone for now to avoid errors
}

function applyArrayModifier(geometry, count, offsetType, offsetVector) {
   console.log(`Applying Array: Count=${count}, Type=${offsetType}, Offset=`, offsetVector);
   if (count <= 1) return geometry.clone();

   const basePositions = geometry.attributes.position;
   const baseNormals = geometry.attributes.normal;
   const baseUVs = geometry.attributes.uv;
   const baseIndices = geometry.index ? geometry.index.array : null;
   const baseVertexCount = basePositions.count;

   const finalVertexCount = baseVertexCount * count;
   const finalIndexCount = baseIndices ? baseIndices.length * count : 0;

   const finalPositions = new Float32Array(finalVertexCount * 3);
   const finalNormals = new Float32Array(finalVertexCount * 3);
   const finalUVs = new Float32Array(finalVertexCount * 2);
   const finalIndices = baseIndices ? new Uint32Array(finalIndexCount) : null; // Use Uint32 for potentially many vertices

   const offset = new THREE.Vector3().fromArray(offsetVector);
   let currentOffset = new THREE.Vector3(); // Cumulative offset

   for (let i = 0; i < count; i++) {
       const vertOffset = i * baseVertexCount; // Vertex index offset for this copy
       const posAttributeOffset = vertOffset * 3;
       const uvAttributeOffset = vertOffset * 2;

       // Calculate offset for this instance
       if (offsetType === 'relative') {
           // TODO: Calculate relative offset based on bounding box size? This needs geom bounds.
           // Simple interpretation: offsetVector IS the offset between instances
            currentOffset.copy(offset).multiplyScalar(i);
       } else if (offsetType === 'constant') {
            currentOffset.copy(offset).multiplyScalar(i); // Same as relative if vector is world units
       } else { // 'object' offset needs another target object's transform - more complex
            console.warn("Object offset type not implemented for Array modifier.");
             currentOffset.set(0,0,0);
       }

       // Copy and offset attributes
       for (let j = 0; j < baseVertexCount; j++) {
           const baseIdx3 = j * 3;
           const finalIdx3 = posAttributeOffset + baseIdx3;
            finalPositions[finalIdx3] = basePositions.getX(j) + currentOffset.x;
            finalPositions[finalIdx3 + 1] = basePositions.getY(j) + currentOffset.y;
            finalPositions[finalIdx3 + 2] = basePositions.getZ(j) + currentOffset.z;

           if (baseNormals) {
                finalNormals[finalIdx3] = baseNormals.getX(j);
                finalNormals[finalIdx3 + 1] = baseNormals.getY(j);
                finalNormals[finalIdx3 + 2] = baseNormals.getZ(j);
            }

           if (baseUVs) {
                const baseIdx2 = j * 2;
                const finalIdx2 = uvAttributeOffset + baseIdx2;
                finalUVs[finalIdx2] = baseUVs.getX(j);
                finalUVs[finalIdx2 + 1] = baseUVs.getY(j);
           }
       }

       // Copy and offset indices
       if (finalIndices) {
           const indexOffset = i * baseIndices.length;
           for (let k = 0; k < baseIndices.length; k++) {
               finalIndices[indexOffset + k] = baseIndices[k] + vertOffset;
           }
       }
   }

   // Create new geometry
   const newGeometry = new THREE.BufferGeometry();
   newGeometry.setAttribute('position', new THREE.BufferAttribute(finalPositions, 3));
   if (baseNormals) newGeometry.setAttribute('normal', new THREE.BufferAttribute(finalNormals, 3));
   if (baseUVs) newGeometry.setAttribute('uv', new THREE.BufferAttribute(finalUVs, 2));
   if (finalIndices) newGeometry.setIndex(new THREE.BufferAttribute(finalIndices, 1));

    if (!baseNormals) newGeometry.computeVertexNormals(); // Compute if original didn't have them

   return newGeometry;
}


// --- createReducedMeshHelpers and its dependencies (Optimized versions) ---
// Consider simplifying this if full mode is generally performant enough with InstancedMesh.
// The logic here might still cause selection issues if not perfectly synced.
// If performance issues persist, revisit this optimization carefully.
// Ensure that createOptimizedEdgeHelpers/createOptimizedFaceHelpers use the *same* vertex logic.


function createReducedMeshHelpers(positions, matrix, frustum, vertexSize, edgeThickness, faceOpacity) {
     console.time("createReducedMeshHelpers");
    const camPos = camera.position;
    const vertexDistances = [];
    const tempVertex = new THREE.Vector3(); // Reuse vector

    for (let i = 0; i < positions.count; i++) {
         tempVertex.fromBufferAttribute(positions, i).applyMatrix4(matrix);
         // Basic distance culling for now
        vertexDistances.push({ index: i, distance: tempVertex.distanceToSquared(camPos), position: tempVertex.clone() }); // Use distance squared for speed
    }

     // Sort by distance (closer first)
    vertexDistances.sort((a, b) => a.distance - b.distance);

     // Take a fraction based on MAX_HELPERS, ensuring some minimum maybe
     const targetVertexCount = Math.max(10, Math.min(Math.floor(positions.count * 0.1), MAX_HELPERS)); // Show 10% or MAX_HELPERS, min 10
    const visibleVertices = vertexDistances.slice(0, targetVertexCount);
     console.log(`Reduced to ${visibleVertices.length} closest vertex helpers.`);


    if ((selectionMode === 'vertex' || selectionMode === 'all') && visibleVertices.length > 0) {
         const instanceCount = visibleVertices.length;
          const sphereGeom = new THREE.SphereGeometry(vertexSize, 6, 6); // Even simpler sphere for perf mode
          const sphereMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 });
           sphereMat.vertexColors = false;


          const instancedMesh = new THREE.InstancedMesh(sphereGeom, sphereMat, instanceCount);
          instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
          instancedMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(instanceCount * 3), 3);
           instancedMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);

          instancedMesh.userData.vertexIndices = [];
          const dummy = new THREE.Object3D();
           const baseColor = new THREE.Color(0x2222FF); // Blue

          for (let i = 0; i < instanceCount; i++) {
               const vertexInfo = visibleVertices[i];
               dummy.position.copy(vertexInfo.position); // Already in world space
               dummy.updateMatrix();
               instancedMesh.setMatrixAt(i, dummy.matrix);
                instancedMesh.setColorAt(i, baseColor);
               instancedMesh.userData.vertexIndices.push(vertexInfo.index); // Store original index
          }

          instancedMesh.userData.type = 'vertex-instanced';
          instancedMesh.instanceMatrix.needsUpdate = true;
           instancedMesh.instanceColor.needsUpdate = true;
          vertexHelpers.add(instancedMesh);
    }

    // Only generate Edge/Face helpers if the mode is active AND geometry is indexed
     if (activeObject.geometry.index && (selectionMode === 'edge' || selectionMode === 'face' || selectionMode === 'all') ){
         createOptimizedEdgeHelpers(visibleVertices, positions, matrix, edgeThickness);
         createOptimizedFaceHelpers(visibleVertices, positions, matrix, faceOpacity);
     }
     console.timeEnd("createReducedMeshHelpers");
}
/*
function createOptimizedEdgeHelpers(visibleVertices, positions, matrix, edgeThickness) {
    if (selectionMode !== 'edge' && selectionMode !== 'all') return;
    console.time("OptimizedEdgeHelpers");

    const visibleVertexIndices = new Set(visibleVertices.map(v => v.index));
    if (visibleVertexIndices.size === 0) {
         console.timeEnd("OptimizedEdgeHelpers");
         return;
    }

    const quadMap = buildQuadMap(activeObject.geometry);
    const drawnEdgeKeys = new Set();
    let currentEdgeCount = 0;
    const MAX_OPT_EDGES = MAX_HELPERS; // Cap edge count

    const vTemp1 = new THREE.Vector3(), vTemp2 = new THREE.Vector3(); // Reusable vectors

    // Iterate through logical faces (quads/triangles) identified by buildQuadMap
    quadMap.forEach((faceVertexIndices, originalFaceId) => {
        if(currentEdgeCount >= MAX_OPT_EDGES) return; // Performance cap

        // Check if this logical face has any visible vertices.
        // We only draw edges for faces that are at least partially "in view" based on vertex visibility.
        let faceHasVisibleVertex = false;
        for (const vertIdx of faceVertexIndices) {
            if (visibleVertexIndices.has(vertIdx)) {
                faceHasVisibleVertex = true;
                break;
            }
        }

        if(faceHasVisibleVertex) {
            const edgesToConsider = [];
            if (faceVertexIndices.length === 3) {
                edgesToConsider.push([faceVertexIndices[0], faceVertexIndices[1]]);
                edgesToConsider.push([faceVertexIndices[1], faceVertexIndices[2]]);
                edgesToConsider.push([faceVertexIndices[2], faceVertexIndices[0]]);
            } else if (faceVertexIndices.length === 4) {
                edgesToConsider.push([faceVertexIndices[0], faceVertexIndices[1]]);
                edgesToConsider.push([faceVertexIndices[1], faceVertexIndices[2]]);
                edgesToConsider.push([faceVertexIndices[2], faceVertexIndices[3]]);
                edgesToConsider.push([faceVertexIndices[3], faceVertexIndices[0]]);
            } else {
                return; // Should be handled by buildQuadMap, but as a safeguard
            }

            for (const edge of edgesToConsider) {
                const startIdx = edge[0];
                const endIdx = edge[1];
                const edgeKey = getEdgeKey(startIdx, endIdx);

                if (!drawnEdgeKeys.has(edgeKey)) { // Only draw each unique edge once
                    drawnEdgeKeys.add(edgeKey);

                    vTemp1.fromBufferAttribute(positions, startIdx).applyMatrix4(matrix);
                    vTemp2.fromBufferAttribute(positions, endIdx).applyMatrix4(matrix);

                    const edgeGeom = new THREE.BufferGeometry().setFromPoints([vTemp1.clone(), vTemp2.clone()]);
                    const edgeMat = new THREE.LineBasicMaterial({ color: 0xE67E22, linewidth: edgeThickness });
                    const edgeLine = new THREE.Line(edgeGeom, edgeMat);
                    edgeLine.userData = { type: 'edge', indices: [startIdx, endIdx] };
                    edgeHelpers.add(edgeLine);
                    currentEdgeCount++;
                }
            }
        }
    });
    console.log(`Generated ${currentEdgeCount} optimized edge helpers.`);
    console.timeEnd("OptimizedEdgeHelpers");
}
    
function createOptimizedFaceHelpers(visibleVertices, positions, matrix, faceOpacity) {
    if (selectionMode !== 'face' && selectionMode !== 'all') return;
     console.time("OptimizedFaceHelpers");

    const visibleVertexIndices = new Set(visibleVertices.map(v => v.index));
     if (visibleVertexIndices.size === 0) {
          console.timeEnd("OptimizedFaceHelpers");
          return;
     }

    const indices = activeObject.geometry.index.array;
    const visibleFacesData = []; // Store { indices: [a,b,c], faceIndex: k }
     const posCount = positions.count;
     const MAX_OPT_FACES = MAX_HELPERS;


    // Iterate through faces and check if any vertex is visible
    for (let i = 0; i < indices.length; i += 3) {
         if (visibleFacesData.length > MAX_OPT_FACES) break;

        const a = indices[i];
        const b = indices[i + 1];
        const c = indices[i + 2];
        if(a >= posCount || b >= posCount || c >= posCount) continue; // Bounds check

        if (visibleVertexIndices.has(a) || visibleVertexIndices.has(b) || visibleVertexIndices.has(c)) {
            visibleFacesData.push({ indices: [a, b, c], faceIndex: i / 3 });
        }
    }


    // Create Mesh objects for the collected faces
     const vA = new THREE.Vector3();
     const vB = new THREE.Vector3();
     const vC = new THREE.Vector3();
    visibleFacesData.forEach(faceData => {
         vA.fromBufferAttribute(positions, faceData.indices[0]).applyMatrix4(matrix);
         vB.fromBufferAttribute(positions, faceData.indices[1]).applyMatrix4(matrix);
         vC.fromBufferAttribute(positions, faceData.indices[2]).applyMatrix4(matrix);

        const faceGeom = new THREE.BufferGeometry().setFromPoints([vA.clone(), vB.clone(), vC.clone()]);
         faceGeom.setIndex([0,1,2]);
        const faceMat = new THREE.MeshBasicMaterial({ color: 0x44DD88, transparent: true, opacity: faceOpacity, side: THREE.DoubleSide });
        const faceMesh = new THREE.Mesh(faceGeom, faceMat);
        faceMesh.userData = { type: 'face', indices: faceData.indices, faceIndex: faceData.faceIndex };
        faceHelpers.add(faceMesh);
    });
     console.log(`Generated ${visibleFacesData.length} optimized face helpers.`);
      console.timeEnd("OptimizedFaceHelpers");

}*/

function createOptimizedEdgeHelpers(visibleVertices, positions, matrix, edgeThickness) {
    if (selectionMode !== 'edge' && selectionMode !== 'all') return;
    console.time("OptimizedEdgeHelpers");

    const visibleVertexIndices = new Set(visibleVertices.map(v => v.index));
    if (visibleVertexIndices.size === 0) {
         console.timeEnd("OptimizedEdgeHelpers");
         return;
    }

    // Use buildQuadMap to ensure we are looking at the logical faces
    const quadMap = buildQuadMap(activeObject.geometry); 
    const drawnEdgeKeys = new Set();
    let currentEdgeCount = 0;
    const MAX_OPT_EDGES = MAX_HELPERS; 

    const vTemp1 = new THREE.Vector3(), vTemp2 = new THREE.Vector3();

    // Iterate through logical faces (quads/triangles)
    quadMap.forEach((faceVertexIndices, originalFaceId) => {
        if(currentEdgeCount >= MAX_OPT_EDGES) return; 

        // Check if this logical face has any visible vertices.
        let faceHasVisibleVertex = faceVertexIndices.some(vertIdx => visibleVertexIndices.has(vertIdx));

        if(faceHasVisibleVertex) {
            const numVerts = faceVertexIndices.length;
            const edgesToConsider = [];
            for(let i = 0; i < numVerts; i++) {
                // Edge from current vertex to the next one in the logical face
                edgesToConsider.push([faceVertexIndices[i], faceVertexIndices[(i + 1) % numVerts]]);
            }

            for (const edge of edgesToConsider) {
                const startIdx = edge[0];
                const endIdx = edge[1];
                const edgeKey = getEdgeKey(startIdx, endIdx);

                if (!drawnEdgeKeys.has(edgeKey)) {
                    drawnEdgeKeys.add(edgeKey);

                    vTemp1.fromBufferAttribute(positions, startIdx).applyMatrix4(matrix);
                    vTemp2.fromBufferAttribute(positions, endIdx).applyMatrix4(matrix);

                    const edgeGeom = new THREE.BufferGeometry().setFromPoints([vTemp1.clone(), vTemp2.clone()]);
                    const edgeMat = new THREE.LineBasicMaterial({ color: 0xE67E22, linewidth: edgeThickness });
                    const edgeLine = new THREE.Line(edgeGeom, edgeMat);
                    edgeLine.userData = { type: 'edge', indices: [startIdx, endIdx] };
                    edgeHelpers.add(edgeLine);
                    currentEdgeCount++;
                }
            }
        }
    });
    console.log(`Generated ${currentEdgeCount} optimized edge helpers (Quad-aware).`);
    console.timeEnd("OptimizedEdgeHelpers");
}

function createOptimizedFaceHelpers(visibleVertices, positions, matrix, faceOpacity) {
    if (selectionMode !== 'face' && selectionMode !== 'all') return;
    console.time("OptimizedFaceHelpers");

    const visibleVertexIndices = new Set(visibleVertices.map(v => v.index));
    if (visibleVertexIndices.size === 0) {
        console.timeEnd("OptimizedFaceHelpers");
        return;
    }

    const quadMap = buildQuadMap(activeObject.geometry); // Use quad map
    const MAX_OPT_FACES = MAX_HELPERS;
    let currentFaceCount = 0;

    quadMap.forEach((faceVertexIndices, originalFaceId) => {
        if (currentFaceCount >= MAX_OPT_FACES) return;
        
        // Check if this logical face has any visible vertices.
        let faceHasVisibleVertex = faceVertexIndices.some(vertIdx => visibleVertexIndices.has(vertIdx));

        if (faceHasVisibleVertex) {
            const tempVerts = [];
            faceVertexIndices.forEach(index => {
                tempVerts.push(new THREE.Vector3().fromBufferAttribute(positions, index).applyMatrix4(matrix));
            });

            const faceGeom = new THREE.BufferGeometry().setFromPoints(tempVerts);
            
            // Create index for the helper mesh (tri or quad)
            if (faceVertexIndices.length === 3) {
                faceGeom.setIndex([0, 1, 2]);
            } else if (faceVertexIndices.length === 4) {
                // Quad triangulation
                faceGeom.setIndex([0, 1, 2, 2, 3, 0]); 
            } else {
                 return;
            }

            const faceMat = new THREE.MeshBasicMaterial({ color: 0x44DD88, transparent: true, opacity: faceOpacity, side: THREE.DoubleSide });
            const faceMesh = new THREE.Mesh(faceGeom, faceMat);
            faceMesh.userData = { type: 'face', indices: faceVertexIndices, faceIndex: originalFaceId };
            faceHelpers.add(faceMesh);
            currentFaceCount++;
        }
    });
    console.log(`Generated ${currentFaceCount} optimized face helpers (Quad-aware).`);
    console.timeEnd("OptimizedFaceHelpers");
}

//-------------------------------//
//----ADVACED NEW TOOLS----------//
//-------------------------------//

function applyWindowPreset(preset) {
    currentWindowPreset = preset;
    console.log("Window preset selected:", preset);
    // You might want to visually indicate the active preset
    // And potentially update the window tool's input fields if they are visible
    const doorWidthInput = document.getElementById('windowWidthInput');
    const doorHeightInput = document.getElementById('windowHeightInput');
    const doorDepthInput = document.getElementById('windowDepthInput');
    const sillHeightInput = document.getElementById('windowSillHeightInput');

    if (doorWidthInput) doorWidthInput.value = preset.width;
    if (doorHeightInput) doorHeightInput.value = preset.height;
    if (doorDepthInput) doorDepthInput.value = preset.depth;
    if (sillHeightInput) sillHeightInput.value = preset.sill;

    alert(`Preset selected: ${preset.width}x${preset.height}. Activate Window tool to place.`);
    document.getElementById('window-presets-panel').style.display='none';
}

// ============================================
// === NEW: Roof Tool Implementation ===
// ============================================
function initRoofTool() {
    roofPoints = [];
    if (!roofPreviewMesh) {
        // For flat roof preview, a simple line loop
        const material = new THREE.LineDashedMaterial({ color: 0x00ffff, dashSize: 0.2, gapSize: 0.1 });
        roofPreviewMesh = new THREE.LineLoop(new THREE.BufferGeometry(), material);
        roofPreviewMesh.renderOrder = 990; // Below other helpers
        scene.add(roofPreviewMesh);
    }
    roofPreviewMesh.geometry.setFromPoints([]);
    roofPreviewMesh.visible = true;
    if (controls) controls.enabled = false;
    renderer.domElement.style.cursor = 'crosshair';
    console.log("Roof tool initialized. Click to define footprint points on ground. Right-click to finish.");
}

function handleRoofPreview(event) {
    if (roofPoints.length === 0) {
        roofPreviewMesh.visible = false;
        return;
    }
    const intersection = getGroundPlaneIntersection();
    if (intersection) {
        const currentPoints = [...roofPoints, intersection.clone()];
        roofPreviewMesh.geometry.dispose();
        roofPreviewMesh.geometry = new THREE.BufferGeometry().setFromPoints(currentPoints);
        if (roofPreviewMesh.isLine) roofPreviewMesh.computeLineDistances(); // For dashed lines
        roofPreviewMesh.visible = true;
    } else {
        roofPreviewMesh.visible = false;
    }
}

function handleRoofPlacementPoint(event) {
    const intersection = getGroundPlaneIntersection();
    if (intersection) {
        roofPoints.push(intersection.clone());
        console.log(`Roof point ${roofPoints.length} added.`);
        // Update preview to show confirmed points as a fixed line
        if (roofPoints.length >= 2) {
            const tempLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(roofPoints), new THREE.LineBasicMaterial({color: 0x00dddd}));
            scene.add(tempLine); // You might add these to a temporary group
        }
    }
}

/*function createRoof() {
    if (roofPoints.length < 3) {
        alert("Please define at least 3 points for the roof footprint.");
        cleanupRoofTool();
        return;
    }

    const roofType = document.getElementById('roofTypeSelect').value;
    const roofHeight = parseFloat(document.getElementById('roofHeightInput').value) || 2.5;
    const roofOverhang = parseFloat(document.getElementById('roofOverhangInput').value) || 0.3;
    const roofPitch = parseFloat(document.getElementById('roofPitchInput').value) || 30; // Degrees

    // Create footprint shape (ensure Y is 0 for ground plane)
    const footprintShape = new THREE.Shape(roofPoints.map(p => new THREE.Vector2(p.x, p.z)));

    // Apply overhang (optional, complex for arbitrary polygons, simpler for convex)
    // For simplicity, we'll skip complex overhang calculation for now.
    // A true overhang would involve offsetting the polygon edges outwards.

    let roofGeometry;
    const roofMaterial = new THREE.MeshStandardMaterial({ color: 0x8B4513, side: THREE.DoubleSide, roughness: 0.8, metalness: 0.1 });

    if (roofType === 'flat') {
        const extrudeSettings = { depth: 0.2, bevelEnabled: false }; // Small thickness for flat roof
        roofGeometry = new THREE.ExtrudeGeometry(footprintShape, extrudeSettings);
        roofGeometry.rotateX(-Math.PI / 2); // Orient flat on XZ plane
        roofGeometry.translate(0, roofHeight, 0); // Move to roof height
    } else if (roofType === 'gable') {
        // Simple Gable: Extrude footprint to eave height, then add triangular prisms
        // This is a simplified gable creation. A more robust one would identify longest axis for ridge.
        const eaveHeight = roofHeight;
        const ridgeHeight = eaveHeight + (footprintShape.getBoundingBox().getSize(new THREE.Vector2()).x / 2) * Math.tan(THREE.MathUtils.degToRad(roofPitch)); // Approx ridge height

        // For a very basic gable, we'll create a custom geometry.
        // This will be a very simplified representation.
        // 1. Extrude base to eave height (like a box) - or just use walls as base.
        // 2. Create two sloped planes.
        // For now, let's make a "tent-like" structure over the footprint.
        const vertices = [];
        const indices = [];
        const footprintVerts2D = footprintShape.getPoints(); // Get Vector2 points

        // Base vertices at eave height
        footprintVerts2D.forEach(p => vertices.push(p.x, eaveHeight, p.y));

        // Ridge points - assuming a simple rectangular footprint for this basic gable.
        // Find approximate center and extent for ridge line (parallel to Z axis for simplicity)
        const bb = footprintShape.getBoundingBox();
        const centerX = bb.min.x + (bb.max.x - bb.min.x) / 2;
        vertices.push(centerX, ridgeHeight, bb.min.y); // Ridge point 1
        vertices.push(centerX, ridgeHeight, bb.max.y); // Ridge point 2

        // This is becoming too complex for a quick implementation.
        // A simpler gable approach: Extrude a triangular profile along the footprint's "length".
        // Fallback to flat roof if gable is too complex for initial setup:
        console.warn("Simple Gable roof is complex to generate dynamically for arbitrary footprints. Creating a Flat roof instead for now.");
        const extrudeSettings = { depth: 0.2, bevelEnabled: false };
        roofGeometry = new THREE.ExtrudeGeometry(footprintShape, extrudeSettings);
        roofGeometry.rotateX(-Math.PI / 2);
        roofGeometry.translate(0, roofHeight, 0);
    }
    // else if (roofType === 'hip') { ... more complex ... }

    if (roofGeometry) {
        const roofMesh = new THREE.Mesh(roofGeometry, roofMaterial);
        roofMesh.name = "Roof_" + Date.now();
        addObjectToScene(roofMesh, 'roof'); // Assuming addObjectToScene handles hierarchy
        registerArchitecturalElement(roofMesh, 'roof');
        console.log("Roof created:", roofMesh.name);
    }

    cleanupRoofTool();
}*/

function createRoof() {
    if (roofPoints.length < 3) {
        alert("Please define at least 3 points for the roof footprint.");
        cleanupRoofTool();
        return;
    }

    const roofType = document.getElementById('roofTypeSelect').value;
    const roofEaveHeight = parseFloat(document.getElementById('roofHeightInput').value) || 2.5;
    const roofPitch = parseFloat(document.getElementById('roofPitchInput').value) || 30;

    const worldFootprintPoints = roofPoints.map(p => p.clone());
    const localOrigin = worldFootprintPoints[0].clone();

    let footprintPointsLocal2D = worldFootprintPoints.map(p_world =>
        new THREE.Vector2(p_world.x - localOrigin.x, p_world.z - localOrigin.z)
    );

    // Check and fix winding order
    let area = 0;
    for (let i = 0; i < footprintPointsLocal2D.length; i++) {
        const p1 = footprintPointsLocal2D[i];
        const p2 = footprintPointsLocal2D[(i + 1) % footprintPointsLocal2D.length];
        area += (p1.x * p2.y - p1.y * p2.x);
    }
    area /= 2;

    if (area < 0) {
        console.log("Roof footprint was clockwise, reversing for CCW.");
        footprintPointsLocal2D.reverse();
    }

    const footprintShapeLocal = new THREE.Shape(footprintPointsLocal2D);

    let roofGeometry;
    const roofMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x8B4513, 
        side: THREE.DoubleSide, 
        roughness: 0.8, 
        metalness: 0.1 
    });

    if (roofType === 'flat') {
        const extrudeSettings = { depth: 0.2, bevelEnabled: false };
        roofGeometry = new THREE.ExtrudeGeometry(footprintShapeLocal, extrudeSettings);
        roofGeometry.rotateX(-Math.PI / 2);
        // Translate to correct position and height
        roofGeometry.translate(localOrigin.x, localOrigin.y + roofEaveHeight, localOrigin.z);
    } else if (roofType === 'gable') {
        console.warn("Simple Gable roof is complex. Creating a Flat roof instead for now.");
        const extrudeSettings = { depth: 0.2, bevelEnabled: false };
        roofGeometry = new THREE.ExtrudeGeometry(footprintShapeLocal, extrudeSettings);
        roofGeometry.rotateX(-Math.PI / 2);
        roofGeometry.translate(localOrigin.x, localOrigin.y + roofEaveHeight, localOrigin.z);
    }

    if (roofGeometry) {
        const roofMesh = new THREE.Mesh(roofGeometry, roofMaterial);
        roofMesh.name = "Roof_" + Date.now();
        // Position at world origin since geometry is already translated
        roofMesh.position.set(0, 0, 0);
        
        addObjectToScene(roofMesh, 'roof');
        registerArchitecturalElement(roofMesh, 'roof');
        console.log("Roof created:", roofMesh.name, "at", localOrigin);
    }
    cleanupRoofTool();
}

function cleanupRoofTool() {
    roofPoints = [];
    if (roofPreviewMesh) {
        roofPreviewMesh.visible = false;
        roofPreviewMesh.geometry.dispose(); // Clear geometry
    }
    // Restore controls if appropriate
    if (!activeArchTool && !isTransforming && !isLoopCutMode && !splineCreationMode) {
        if (controls) controls.enabled = true;
    }
    if (renderer.domElement) renderer.domElement.style.cursor = 'default';
}


// ============================================
// === NEW: Room Tool Implementation ===
// ============================================
function initRoomTool() {
    roomStartPoint = null;
    roomEndPoint = null;
    if (!roomPreviewMesh) {
        const geometry = new THREE.BoxGeometry(1, 1, 1); // Dummy
        const material = new THREE.MeshBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0.4, wireframe: true });
        roomPreviewMesh = new THREE.Mesh(geometry, material);
        roomPreviewMesh.renderOrder = 990;
        scene.add(roomPreviewMesh);
    }
    roomPreviewMesh.visible = false;
    if (controls) controls.enabled = false;
    renderer.domElement.style.cursor = 'crosshair';
    console.log("Room tool initialized. Click first corner, then second corner.");
}

function handleRoomPreview(event) {
    if (!roomStartPoint) {
        roomPreviewMesh.visible = false;
        return;
    }
    const intersection = getGroundPlaneIntersection();
    if (intersection) {
        roomEndPoint = intersection.clone();
        const roomHeight = parseFloat(document.getElementById('roomHeightInput')?.value) || 2.5;

        const minX = Math.min(roomStartPoint.x, roomEndPoint.x);
        const maxX = Math.max(roomStartPoint.x, roomEndPoint.x);
        const minZ = Math.min(roomStartPoint.z, roomEndPoint.z);
        const maxZ = Math.max(roomStartPoint.z, roomEndPoint.z);

        const width = maxX - minX;
        const depth = maxZ - minZ;

        if (width > 0.01 && depth > 0.01) {
            roomPreviewMesh.geometry.dispose();
            roomPreviewMesh.geometry = new THREE.BoxGeometry(width, roomHeight, depth);
            roomPreviewMesh.position.set(minX + width / 2, roomHeight / 2, minZ + depth / 2);
            roomPreviewMesh.visible = true;
        } else {
            roomPreviewMesh.visible = false;
        }
    } else {
        roomPreviewMesh.visible = false;
    }
}

function handleRoomPlacementPoint(event) {
    const intersection = getGroundPlaneIntersection();
    if (!intersection) return;

    if (!roomStartPoint) {
        roomStartPoint = intersection.clone();
        console.log("Room start point set.");
        roomPreviewMesh.visible = true; // Show preview from now on
    } else {
        roomEndPoint = intersection.clone(); // Second click confirms
        console.log("Room end point set.");
        createRoom();
        // Deactivate tool after creation or reset for new room
        // For now, deactivate:
        deactivateCurrentArchTool();
    }
}

function createRoom() {
    if (!roomStartPoint || !roomEndPoint) {
        console.warn("Room points not defined.");
        cleanupRoomTool();
        return;
    }

    const wallHeight = parseFloat(document.getElementById('roomHeightInput')?.value) || 2.5;
    const wallThickness = parseFloat(document.getElementById('roomWallThicknessInput')?.value) || 0.2;
    const addFloor = document.getElementById('roomAddFloorCheckbox')?.checked;
    const addCeiling = document.getElementById('roomAddCeilingCheckbox')?.checked;

    const minX = Math.min(roomStartPoint.x, roomEndPoint.x);
    const maxX = Math.max(roomStartPoint.x, roomEndPoint.x);
    const minZ = Math.min(roomStartPoint.z, roomEndPoint.z);
    const maxZ = Math.max(roomStartPoint.z, roomEndPoint.z);

    const roomWidth = maxX - minX; // Along X
    const roomDepth = maxZ - minZ; // Along Z

    if (roomWidth < 0.1 || roomDepth < 0.1) {
        alert("Room dimensions are too small.");
        cleanupRoomTool();
        return;
    }

    const roomGroup = new THREE.Group();
    roomGroup.name = "Room_" + Date.now();
    const wallMaterial = new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.8, metalness: 0.2 });

    // Create 4 walls
    const wallData = [
        { x: minX + roomWidth / 2, z: minZ, w: roomWidth, d: wallThickness, rotY: 0 },            // Front wall
        { x: minX + roomWidth / 2, z: maxZ, w: roomWidth, d: wallThickness, rotY: 0 },            // Back wall
        { x: minX, z: minZ + roomDepth / 2, w: wallThickness, d: roomDepth, rotY: Math.PI / 2 }, // Left wall (width is thickness, depth is length)
        { x: maxX, z: minZ + roomDepth / 2, w: wallThickness, d: roomDepth, rotY: Math.PI / 2 }  // Right wall
    ];

    wallData.forEach(data => {
        // Adjust for wall thickness: for parallel walls, one needs to be inset/outset
        // For simplicity, we'll center them, creating slight overlap or gap at corners.
        // A proper solution involves adjusting positions and lengths based on thickness.

        // For this simple version, assuming BoxGeometry is (width, height, depth)
        // For walls along X, width is roomWidth, depth is wallThickness
        // For walls along Z, width is wallThickness, depth is roomDepth
        let geom;
        if (data.rotY === 0) { // Front/Back
             geom = new THREE.BoxGeometry(data.w, wallHeight, data.d);
        } else { // Left/Right
             geom = new THREE.BoxGeometry(data.d, wallHeight, data.w); // Swap w and d for geometry if aligning Box's X to world Z
             // Better: BoxGeometry(wallThickness, wallHeight, roomDepth) and then rotate correctly.
             // Let's stick to Box(X_len, Y_len, Z_len) and apply rotation.
             // So for side walls, X_len is roomDepth, Z_len is wallThickness for the geom.
             geom = new THREE.BoxGeometry(roomDepth + wallThickness, wallHeight, wallThickness); // Extend length to meet corners
             // This needs careful corner handling.
             // The current wallData assumes wallThickness is aligned with Z for front/back, and with X for left/right.
             // Let's use the createWallSegment logic if available for better control.
             // For now, a simpler Box:
             if (data.rotY === 0) geom = new THREE.BoxGeometry(roomWidth, wallHeight, wallThickness);
             else geom = new THREE.BoxGeometry(roomDepth, wallHeight, wallThickness); // If rotating, width is length
        }

        const wall = new THREE.Mesh(geom, wallMaterial.clone());
        wall.position.set(data.x, wallHeight / 2, data.z);
        wall.rotation.y = data.rotY;
        roomGroup.add(wall);
    });


    // Floor
    if (addFloor) {
        const floorGeom = new THREE.BoxGeometry(roomWidth, 0.1, roomDepth);
        const floorMat = new THREE.MeshStandardMaterial({ color: 0x999999 });
        const floorMesh = new THREE.Mesh(floorGeom, floorMat);
        floorMesh.position.set(minX + roomWidth / 2, -0.05, minZ + roomDepth / 2); // Slightly below origin
        roomGroup.add(floorMesh);
    }

    // Ceiling
    if (addCeiling) {
        const ceilGeom = new THREE.BoxGeometry(roomWidth, 0.1, roomDepth);
        const ceilMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee });
        const ceilMesh = new THREE.Mesh(ceilGeom, ceilMat);
        ceilMesh.position.set(minX + roomWidth / 2, wallHeight + 0.05, minZ + roomDepth / 2); // Slightly above walls
        roomGroup.add(ceilMesh);
    }

    addObjectToScene(roomGroup, 'room');
    registerArchitecturalElement(roomGroup, 'room');
    console.log("Room created:", roomGroup.name);
    cleanupRoomTool();
}

function cleanupRoomTool() {
    roomStartPoint = null;
    roomEndPoint = null;
    if (roomPreviewMesh) {
        roomPreviewMesh.visible = false;
        roomPreviewMesh.geometry.dispose();
    }
    if (!activeArchTool && !isTransforming && !isLoopCutMode && !splineCreationMode) {
        if (controls) controls.enabled = true;
    }
    if (renderer.domElement) renderer.domElement.style.cursor = 'default';
}

// ============================================
// === NEW: Curved Wall Tool Implementation ===
// ============================================
function initCurvedWallTool() {
    curvedWallPoints = [];
    if (!curvedWallPreviewLine) {
        const material = new THREE.LineDashedMaterial({ color: 0xff00ff, dashSize: 0.15, gapSize: 0.08 });
        curvedWallPreviewLine = new THREE.Line(new THREE.BufferGeometry(), material);
        curvedWallPreviewLine.renderOrder = 990;
        scene.add(curvedWallPreviewLine);
    }
    curvedWallPreviewLine.geometry.setFromPoints([]);
    curvedWallPreviewLine.visible = false;
    if (controls) controls.enabled = false;
    renderer.domElement.style.cursor = 'crosshair';
    console.log("Curved Wall tool: Click 3 points for quadratic curve (start, control, end).");
}

function handleCurvedWallPreview(event) {
    if (curvedWallPoints.length === 0 || curvedWallPoints.length >= 3) {
        curvedWallPreviewLine.visible = false;
        return;
    }
    const intersection = getGroundPlaneIntersection();
    if (intersection) {
        let previewCurvePoints = [];
        if (curvedWallPoints.length === 1) { // Drawing line from start to control point
            previewCurvePoints = [curvedWallPoints[0], intersection];
        } else if (curvedWallPoints.length === 2) { // Drawing quadratic from start, control, to mouse (end)
            const segments = parseInt(document.getElementById('curveSegmentsInput')?.value) || 20;
            previewCurvePoints = getQuadraticBezierPoints(curvedWallPoints[0], curvedWallPoints[1], intersection, segments);
        }

        if (previewCurvePoints.length > 0) {
            curvedWallPreviewLine.geometry.dispose();
            curvedWallPreviewLine.geometry = new THREE.BufferGeometry().setFromPoints(previewCurvePoints);
            curvedWallPreviewLine.computeLineDistances();
            curvedWallPreviewLine.visible = true;
        }
    } else {
        curvedWallPreviewLine.visible = false;
    }
}

function handleCurvedWallPlacementPoint(event) {
    if (curvedWallPoints.length >= 3) return; // Max 3 points for quadratic

    const intersection = getGroundPlaneIntersection();
    if (intersection) {
        curvedWallPoints.push(intersection.clone());
        console.log(`Curved wall point ${curvedWallPoints.length} added.`);

        if (curvedWallPoints.length === 1) {
            curvedWallPreviewLine.visible = true; // Start showing preview
            // Show a small dot or line for the first point
            curvedWallPreviewLine.geometry.dispose();
            curvedWallPreviewLine.geometry = new THREE.BufferGeometry().setFromPoints([curvedWallPoints[0], curvedWallPoints[0].clone().add(new THREE.Vector3(0.01,0,0.01))]);
            curvedWallPreviewLine.computeLineDistances();
        } else if (curvedWallPoints.length === 3) {
            createCurvedWall();
            // Deactivate after creation for this simple tool
            // deactivateCurrentArchTool(); // createCurvedWall will call cleanup
        }
    }
}

function createCurvedWall() {
    if (curvedWallPoints.length !== 3) {
        alert("Please define 3 points for the curved wall.");
        cleanupCurvedWallTool();
        return;
    }

    const wallHeight = parseFloat(document.getElementById('curvedWallHeightInput')?.value) || 2.5;
    const wallThickness = parseFloat(document.getElementById('curvedWallThicknessInput')?.value) || 0.2;
    const segments = parseInt(document.getElementById('curveSegmentsInput')?.value) || 20;

    const [p0, p1, p2] = curvedWallPoints; // These are Vector3, need Vector2 for Shape

    // Create 2D points for the curve path (on XZ plane)
    const curve = new THREE.QuadraticBezierCurve3(p0, p1, p2);
    const pathPoints2D = curve.getPoints(segments).map(p => new THREE.Vector2(p.x, p.z));

    // Create a shape from these 2D points for extrusion
    // For a wall, we need two parallel curves for thickness.
    // This is non-trivial for arbitrary curves.
    // Simplification: Extrude the single curve path and give it thickness later, or use a Line geometry.
    // Better: Use THREE.Shape and extrude it with some depth.
    // For a simple single-surface curved wall (like a ribbon):
    const shape = new THREE.Shape(pathPoints2D);

    const extrudeSettings = {
        steps: 2, // Minimal steps for a "flat" extrusion
        depth: wallHeight, // Extrude upwards
        bevelEnabled: false
    };
    const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    geometry.rotateX(-Math.PI / 2); // Orient extrusion to be vertical from XZ plane
    // The thickness is not yet handled by this simple extrusion.
    // To add thickness, you would typically offset the 2D path and create a shape with a hole, or use CSG.

    // For a simpler "thick line" approach:
    // This will create a flat, vertical curved surface. Thickness is visual, not geometric.
    // const curvePath = new THREE.Path(pathPoints2D);
    // const geometry = new THREE.ExtrudeGeometry(curvePath.getShapes()[0], extrudeSettings);

    // A mesh with actual thickness would be more involved.
    // For now, this creates a single surface.
    const material = new THREE.MeshStandardMaterial({ color: 0xb0b0b0, side: THREE.DoubleSide, roughness:0.7 });
    const curvedWallMesh = new THREE.Mesh(geometry, material);
    curvedWallMesh.name = "CurvedWall_" + Date.now();

    // To give it apparent thickness, one might duplicate and offset, or use a custom shader.
    // For now, it's a single extruded surface.
    // The position of the geometry will be based on the points' original Y values (should be 0).

    addObjectToScene(curvedWallMesh, 'curved-wall');
    registerArchitecturalElement(curvedWallMesh, 'curved-wall');
    console.log("Curved Wall created:", curvedWallMesh.name);
    cleanupCurvedWallTool();
}

/*function createCurvedWall() {
    if (curvedWallPoints.length !== 3) {
        alert("Please define 3 points for the curved wall.");
        cleanupCurvedWallTool();
        return;
    }

    const wallHeight = parseFloat(document.getElementById('curvedWallHeightInput')?.value) || 2.5;
    const segments = parseInt(document.getElementById('curveSegmentsInput')?.value) || 20;

    const [p0_world, p1_world, p2_world] = curvedWallPoints;

    // Calculate the center/origin point for positioning
    const center = new THREE.Vector3();
    center.addVectors(p0_world, p2_world).multiplyScalar(0.5); // Midpoint between start and end

    // Create curve points relative to center
    const p0_local = p0_world.clone().sub(center);
    const p1_local = p1_world.clone().sub(center);
    const p2_local = p2_world.clone().sub(center);

    // Create the curve in local space
    const curve_local = new THREE.QuadraticBezierCurve3(p0_local, p1_local, p2_local);
    
    // Get points and convert to 2D for shape creation
    const pathPoints3D = curve_local.getPoints(segments);
    const pathPoints2D = pathPoints3D.map(p => new THREE.Vector2(p.x, p.z));
    
    const shape = new THREE.Shape(pathPoints2D);

    const extrudeSettings = {
        steps: 1,
        depth: wallHeight,
        bevelEnabled: false
    };
    
    const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    
    // Rotate to stand vertically
    geometry.rotateX(-Math.PI / 2);

    const material = new THREE.MeshStandardMaterial({ 
        color: 0xb0b0b0, 
        side: THREE.DoubleSide, 
        roughness: 0.7 
    });
    
    const curvedWallMesh = new THREE.Mesh(geometry, material);
    curvedWallMesh.name = "CurvedWall_" + Date.now();
    
    // Position the mesh at the calculated center point
    curvedWallMesh.position.copy(center);
    curvedWallMesh.position.y = 0; // Ensure it's on the ground
    
    addObjectToScene(curvedWallMesh, 'curved-wall');
    registerArchitecturalElement(curvedWallMesh, 'curved-wall');
    console.log("Curved Wall created:", curvedWallMesh.name, "at", curvedWallMesh.position);
    cleanupCurvedWallTool();
}*/

function cleanupCurvedWallTool() {
    curvedWallPoints = [];
    if (curvedWallPreviewLine) {
        curvedWallPreviewLine.visible = false;
        curvedWallPreviewLine.geometry.dispose();
    }
    if (!activeArchTool && !isTransforming && !isLoopCutMode && !splineCreationMode) {
        if (controls) controls.enabled = true;
    }
    if (renderer.domElement) renderer.domElement.style.cursor = 'default';
}

// ============================================
// === NEW: Terrain Tool Implementation (Simple Plane) ===
// ============================================
function initTerrainTool() {
    if (!terrainPreviewMesh) {
        const geometry = new THREE.PlaneGeometry(1, 1, 1, 1); // Dummy
        const material = new THREE.MeshBasicMaterial({ color: 0x228B22, transparent: true, opacity: 0.5, wireframe: true });
        terrainPreviewMesh = new THREE.Mesh(geometry, material);
        terrainPreviewMesh.renderOrder = 990;
        terrainPreviewMesh.rotation.x = -Math.PI / 2; // Lay flat
        scene.add(terrainPreviewMesh);
    }
    terrainPreviewMesh.visible = false;
    if (controls) controls.enabled = false;
    renderer.domElement.style.cursor = 'crosshair';
    console.log("Terrain tool initialized. Click to place center of terrain plane.");
}

function handleTerrainPreview(event) {
    const intersection = getGroundPlaneIntersection();
    if (intersection) {
        const width = parseFloat(document.getElementById('terrainWidthInput')?.value) || 20;
        const depth = parseFloat(document.getElementById('terrainDepthInput')?.value) || 20;
        const wSeg = parseInt(document.getElementById('terrainWidthSegmentsInput')?.value) || 10;
        const dSeg = parseInt(document.getElementById('terrainDepthSegmentsInput')?.value) || 10;

        terrainPreviewMesh.geometry.dispose();
        terrainPreviewMesh.geometry = new THREE.PlaneGeometry(width, depth, wSeg, dSeg);
        terrainPreviewMesh.position.copy(intersection);
        terrainPreviewMesh.position.y += 0.01; // Slight offset to avoid z-fighting with grid
        terrainPreviewMesh.visible = true;
    } else {
        terrainPreviewMesh.visible = false;
    }
}

function handleTerrainPlacement(event) {
    const intersection = getGroundPlaneIntersection();
    if (intersection && terrainPreviewMesh && terrainPreviewMesh.visible) {
        createTerrainMode(intersection); // Pass center point
        // Deactivate after placement
        deactivateCurrentArchTool();
    }
}

function createTerrainMode(centerPoint) {
    const width = parseFloat(document.getElementById('terrainWidthInput')?.value) || 20;
    const depth = parseFloat(document.getElementById('terrainDepthInput')?.value) || 20;
    const wSeg = parseInt(document.getElementById('terrainWidthSegmentsInput')?.value) || 10;
    const dSeg = parseInt(document.getElementById('terrainDepthSegmentsInput')?.value) || 10;

    const terrainGeometry = new THREE.PlaneGeometry(width, depth, wSeg, dSeg);
    // For actual terrain, you'd now modify the Y values of terrainGeometry.attributes.position
    // e.g., using a noise function or sculpting tools.
    // For this basic version, it's a flat plane.

    const terrainMaterial = new THREE.MeshStandardMaterial({ color: 0x556B2F, roughness: 0.9, metalness: 0.05 }); // Dark Olive Green
    const terrainMesh = new THREE.Mesh(terrainGeometry, terrainMaterial);
    terrainMesh.name = "Terrain_" + Date.now();
    terrainMesh.rotation.x = -Math.PI / 2; // Lay flat
    terrainMesh.position.copy(centerPoint);
    terrainMesh.position.y += 0.005; // Ensure slightly above grid

    addObjectToScene(terrainMesh, 'terrain');
    registerArchitecturalElement(terrainMesh, 'terrain');
    console.log("Terrain plane created:", terrainMesh.name);
    cleanupTerrainTool();
}

function cleanupTerrainTool() {
    if (terrainPreviewMesh) {
        terrainPreviewMesh.visible = false;
        terrainPreviewMesh.geometry.dispose();
    }
    if (!activeArchTool && !isTransforming && !isLoopCutMode && !splineCreationMode) {
        if (controls) controls.enabled = true;
    }
    if (renderer.domElement) renderer.domElement.style.cursor = 'default';
}




// Ensure this function is within the scope where THREE, scene, CSG,
function initBooleanSubtractTool() {
    booleanTargetMesh = null;
    booleanToolMesh = null;
    // If one architectural element is already selected, consider it the target
    if (selectedArchElements.length === 1 && selectedArchElements[0].isMesh) {
        booleanTargetMesh = selectedArchElements[0];
        // Visually indicate it's the target (e.g., different highlight)
        // For simplicity, we rely on the standard selection highlight for now.
        alert("Boolean Subtract: Target mesh selected (" + (booleanTargetMesh.name || "Unnamed Mesh") + ").\nNow click the second mesh (the one to subtract).");
        console.log("Boolean Subtract: Target pre-selected:", booleanTargetMesh.name || booleanTargetMesh.uuid);
    } else {
        deselectAllArchElements(); // Clear any other selection
        alert("Boolean Subtract: Click the first mesh (the object to be hollowed/target).");
        console.log("Boolean Subtract: Awaiting target mesh selection.");
    }
    renderer.domElement.style.cursor = 'pointer'; // Indicate object selection
    if (controls) controls.enabled = true; // Ensure orbit controls are ON for selection
}

function cleanupBooleanToolState() {
    booleanTargetMesh = null;
    booleanToolMesh = null;
    // If you had special highlighting for boolean target/tool, reset it here.
    console.log("Boolean Subtract tool state cleaned up.");
    // The main 'deselectAllArchElements()' called by deactivateCurrentArchTool or
    // a new selection will handle visual deselection.
}

function applyBooleanSubtract(targetMesh, toolMesh) {
    if (!targetMesh || !toolMesh) {
        console.error("Boolean subtract: Target or tool mesh is missing.");
        alert("Boolean subtract: Target or tool mesh is missing. Please select two meshes.");
        return;
    }

    if (typeof CSG === 'undefined') {
        alert("CSG library is not loaded. Boolean operations unavailable. Ensure 'js/libs/three-csg-bundle.js' (or similar) is included correctly.");
        console.error("Global CSG object is not defined. Boolean operations cannot proceed.");
        return;
    }

    if (!targetMesh.isMesh || !toolMesh.isMesh) {
        alert("Boolean subtract: Both selections must be valid Three.js meshes.");
        console.error("Boolean subtract: One or both selections are not THREE.Mesh instances.");
        return;
    }

    if (!targetMesh.geometry || !toolMesh.geometry) {
        alert("Boolean subtract: One or both selected meshes lack geometry.");
        console.error("Boolean subtract: Geometry missing from one or both meshes.");
        return;
    }

    console.log(`Applying Boolean Subtract:`);
    console.log(`  Target: '${targetMesh.name || targetMesh.uuid}' (Geometry: ${targetMesh.geometry.type})`);
    console.log(`  Tool:   '${toolMesh.name || toolMesh.uuid}' (Geometry: ${toolMesh.geometry.type})`);

    // It's crucial that the geometries are BufferGeometry and ideally triangulated.
    // three-csg-ts generally handles this, but pre-triangulation can sometimes help with complex inputs.

    // Store original materials and visibility for potential restoration on error
    const originalTargetMaterial = targetMesh.material;
    const originalToolMaterial = toolMesh.material; // Though tool mesh is usually consumed
    const originalTargetVisibility = targetMesh.visible;
    const originalToolVisibility = toolMesh.visible;

    // Temporarily hide original meshes during operation to avoid visual artifacts
    targetMesh.visible = false;
    toolMesh.visible = false;

    // It's good practice to ensure matrices are up-to-date
    targetMesh.updateMatrixWorld(true); // true to update children if it's a group
    toolMesh.updateMatrixWorld(true);

    try {
        // Convert THREE.Mesh to CSG objects.
        // The library should internally handle the mesh's world matrix.
        const targetCSG = CSG.fromMesh(targetMesh);
        const toolCSG = CSG.fromMesh(toolMesh);

        // Perform the subtraction operation (target - tool)
        console.log("Performing CSG subtraction...");
        const resultCSG = targetCSG.subtract(toolCSG);
        console.log("CSG subtraction completed.");

        // Convert the CSG result back to a THREE.Mesh
        // The resulting mesh's geometry will be in world space if fromMesh handled matrices.
        // We then apply the targetMesh's original world matrix to place it correctly.
        // OR, if fromMesh puts geometry in local space, we use targetMesh.matrix.
        // The documentation/behavior of CSG.fromMesh regarding matrices is key.
        // Let's assume toMesh should place it in world coordinates relative to the target's original transform.
        const resultMesh = CSG.toMesh(resultCSG, targetMesh.matrixWorld.clone());

        // Apply material from the original target object.
        // It's good to clone the material if you might modify it,
        // or if the original targetMesh might still exist in some undo state.
        if (originalTargetMaterial) {
            resultMesh.material = Array.isArray(originalTargetMaterial) ? originalTargetMaterial.map(m => m.clone()) : originalTargetMaterial.clone();
        } else {
            resultMesh.material = new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.7 }); // Fallback material
        }
        resultMesh.castShadow = targetMesh.castShadow;
        resultMesh.receiveShadow = targetMesh.receiveShadow;

        resultMesh.name = `${targetMesh.name || 'Object'}_HollowedBy_${toolMesh.name || 'Tool'}`;
        console.log(`Result mesh created: ${resultMesh.name}`);

        // --- Scene Management ---

        // 1. Remove original meshes from the main 'scene'
        scene.remove(targetMesh);
        scene.remove(toolMesh); // The tool mesh is consumed in this operation

        // 2. Remove from your architecturalElements array
        const targetArchIndex = architecturalElements.indexOf(targetMesh);
        if (targetArchIndex > -1) {
            architecturalElements.splice(targetArchIndex, 1);
        }
        const toolArchIndex = architecturalElements.indexOf(toolMesh);
        if (toolArchIndex > -1) {
            architecturalElements.splice(toolArchIndex, 1);
        }

        // 3. Dispose of old geometries and materials to free up GPU memory
        if (targetMesh.geometry) targetMesh.geometry.dispose();
        if (Array.isArray(originalTargetMaterial)) {
            originalTargetMaterial.forEach(m => m.dispose());
        } else if (originalTargetMaterial) {
            originalTargetMaterial.dispose();
        }

        if (toolMesh.geometry) toolMesh.geometry.dispose();
        if (Array.isArray(originalToolMaterial)) {
            originalToolMaterial.forEach(m => m.dispose());
        } else if (originalToolMaterial) {
            originalToolMaterial.dispose();
        }
        console.log("Original meshes disposed.");

        // 4. Add the new resulting mesh to the scene and your tracking arrays
        addObjectToScene(resultMesh, 'boolean-result'); // Your helper function
        registerArchitecturalElement(resultMesh, 'boolean-result'); // Your helper function
        console.log(`'${resultMesh.name}' added to scene and registered.`);

        // 5. Update selection and active object states
        const wasActiveObjectTarget = (activeObject === targetMesh);
        deselectAllArchElements(); // Clear current selections

        if (wasActiveObjectTarget) {
            activeObject = resultMesh; // Make the new mesh the active object
            if (typeof selectObject === 'function') { // If you have a global selectObject
                selectObject(resultMesh);
            }
        }
        selectArchElement(resultMesh); // Select the new mesh in your architectural selection

        // 6. Update modeling helpers if applicable
        if (isModelingMode && activeObject === resultMesh) {
            console.log("Updating mesh structure for new boolean result...");
            showMeshStructure(activeObject);
        }

        alert("Boolean subtraction successful!");

    } catch (error) {
        console.error("Error during Boolean subtraction operation:", error);
        alert("Boolean operation failed. Check the browser console for detailed errors. \n\nCommon issues include non-manifold (not watertight) input meshes or very high complexity.");

        // Restore visibility of original meshes on error if they weren't removed yet.
        // This is a simple error recovery. A proper undo system would be better.
        targetMesh.visible = originalTargetVisibility;
        toolMesh.visible = originalToolVisibility;
        // Re-add to scene if they were removed by a partial success before error
        if (!scene.children.includes(targetMesh)) scene.add(targetMesh);
        if (!scene.children.includes(toolMesh)) scene.add(toolMesh);

        console.log("Attempted to restore original meshes visibility due to error.");
    } finally {
        // Ensure orbit controls are re-enabled if they were disabled by a tool
        // (This might be handled by your general tool deactivation logic)
        if (controls && !isTransforming && !activeArchTool && !isLoopCutMode && !splineCreationMode && !structureSynthToolActive) {
             // controls.enabled = true; // Be careful not to enable if another tool *should* be active
        }
    }
}

/*
function initiateSpinTool() {
    // This check is now more of a guide for the user
    if (!editedSplines.profile) {
        alert("Spin Tool Error: No profile found.\n\nTo use this tool:\n1. Select a continuous chain of edges.\n2. Click 'Edges to Profile'.\n3. Click the Spin tool again.");
        return;
    }
    // If a profile exists, activate the tool
    toggleArchTool('spin');
}*

function initiateSpinTool() {
    // This check is now more of a guide for the user
    if (!editedSplines.profile) {
        alert("Spin Tool Error: No profile found.\n\nTo use this tool:\n1. Select a continuous chain of edges.\n2. Click 'Edges to Profile'.\n3. Click the Spin tool again.");
        return;
    }
    // If a profile exists, activate the tool
    toggleArchTool('spin');
}*/ 

// Located around line 3010 in the previous combined file output
function initiateSpinTool() {
    // 1. Check if the active object is compatible (Modeling mode, object selected)
    if (!isModelingMode || !activeObject) {
         alert("Please enter Modeling Mode and select an object before using the Spin tool.");
         return;
    }

    // 2. Check for the existence of the required 2D profile
    if (!editedSplines.profile || !editedSplines.profile.userData || !editedSplines.profile.userData.pivot3D) {
        
        // --- CUSTOMIZED ERROR MESSAGE ---
        let errorMsg = "Spin Tool Error: Please select a profile of connected vertices or edges first.\n\n";
        
        if (selectionMode === 'edge' && selectedElements.length > 0) {
            errorMsg += "Action needed: Click the 'Edges to Profile' button to convert your selection into a usable profile.";
        } else {
             errorMsg += "User Flow:\n1. Switch to Edge Selection Mode (2 key).\n2. Select a single, continuous chain of edges on your object.\n3. Click the 'Edges to Profile' button.\n4. Click the 'Spin' button again.";
        }
        
        alert(errorMsg);
        return;
    }
    
    // If a profile exists, activate the architectural tool dispatcher
    toggleArchTool('spin');
}


function cleanupSpinTool() {
    if (spinPreviewMesh) spinPreviewMesh.visible = false;
    if (spinAxisLine) spinAxisLine.visible = false;
    // No specific cleanup needed unless you add more interactive elements
}


function updateSpinPreview() {
    if (!spinPreviewMesh || !editedSplines.profile || !editedSplines.profile.userData.pivot3D) return;

    const segments = parseInt(document.getElementById('spinSegmentsInput').value) || 32;
    const phiLength = THREE.MathUtils.degToRad(parseFloat(document.getElementById('spinAngleInput').value) || 360);
    
    // LatheGeometry revolves points around the Y-axis. The 2D profile points are already
    // in a camera-aligned plane, ready to be used.
    const profilePoints2D = editedSplines.profile.points;

    if (profilePoints2D.length < 2) {
        spinPreviewMesh.visible = false;
        return;
    }

    const newGeometry = new THREE.LatheGeometry(profilePoints2D, segments, 0, phiLength);
    
    spinPreviewMesh.geometry.dispose();
    spinPreviewMesh.geometry = newGeometry;

    // *** THE FIX ***
    // The final mesh needs to be positioned and rotated back into the original 3D orientation.
    // We position it at the 3D pivot and align it with the camera view from when the profile was created.
    spinPreviewMesh.position.copy(editedSplines.profile.userData.pivot3D);
    
    const cameraDirection = new THREE.Vector3();
    camera.getWorldDirection(cameraDirection);
    const targetQuaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), cameraDirection);
    spinPreviewMesh.quaternion.copy(targetQuaternion);

    spinPreviewMesh.visible = true;
}

function createSpinGeometry() {
    if (!spinPreviewMesh || !spinPreviewMesh.visible) {
        alert("Cannot create spin geometry, preview is not valid.");
        return;
    }
    
    const finalGeometry = spinPreviewMesh.geometry.clone();
    const finalMaterial = new THREE.MeshStandardMaterial({ color: 0xcccccc, side: THREE.DoubleSide });
    const finalMesh = new THREE.Mesh(finalGeometry, finalMaterial);
    
    // Apply the final position and rotation from the preview
    finalMesh.position.copy(spinPreviewMesh.position);
    finalMesh.quaternion.copy(spinPreviewMesh.quaternion);
    finalMesh.name = "SpinObject_" + Date.now();
    
    const oldGeometry = new THREE.BufferGeometry();
    addObjectToScene(finalMesh, "spin-result");
    
    if (window.historyManager) {
        // A proper history system should have an 'addObject' action
        // For now, we log it. A geometry change on a dummy object could also work.
        console.log("Spin geometry created. Consider adding an 'addObject' action to your HistoryManager for full undo.");
    }

    console.log("Spin geometry created:", finalMesh.name);
    deactivateCurrentArchTool();
}

// ==========================================================
// == NEW: ADVANCED POLY PEN / CREATE FACE TOOL =============
// ==========================================================

function initPolyPenTool() {
    polyPenToolActive = true;
    polyPenCurrentMesh = null;
    polyPenCurrentChain = [];

    // Initialize Preview Objects
    if (!polyPenPreviewLine) {
        polyPenPreviewLine = new THREE.Line(
            new THREE.BufferGeometry(),
            new THREE.LineDashedMaterial({ color: 0xffff00, dashSize: 0.1, gapSize: 0.05, depthTest: false })
        );
        polyPenPreviewLine.renderOrder = 999;
        scene.add(polyPenPreviewLine);
    }
    if (!polyPenPreviewFace) {
        polyPenPreviewFace = new THREE.Mesh(
            new THREE.BufferGeometry(),
            new THREE.MeshBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthTest: false })
        );
        polyPenPreviewFace.renderOrder = 998;
        scene.add(polyPenPreviewFace);
    }
    if (!polyPenFloatingVertices) {
        polyPenFloatingVertices = new THREE.Group();
        polyPenFloatingVertices.name = "PolyPen_FloatingVerts";
        scene.add(polyPenFloatingVertices);
    }

    polyPenPreviewLine.visible = false;
    polyPenPreviewFace.visible = false;

    // UI and Controls
    if (controls) controls.enabled = false;
    renderer.domElement.style.cursor = 'crosshair';
    document.getElementById('polyPenFinishObject').onclick = finishPolyPenObject;
    alert("Poly Pen Active: Click to place vertices. Forms a face with 3 or 4 points. Right-click to cancel a chain.");
}

function cleanupPolyPenTool() {
    finishPolyPenObject(); // Finalize any mesh being worked on
    polyPenToolActive = false;
    if (polyPenPreviewLine) polyPenPreviewLine.visible = false;
    if (polyPenPreviewFace) polyPenPreviewFace.visible = false;
    
    // Clean up any leftover floating vertices
    for (let i = polyPenFloatingVertices.children.length - 1; i >= 0; i--) {
        polyPenFloatingVertices.remove(polyPenFloatingVertices.children[i]);
    }

    if (renderer.domElement) renderer.domElement.style.cursor = 'default';
    if (controls && !isTransforming) controls.enabled = true;
}

// This function is called by the main handleCanvasMouseMove
function handlePolyPenMouseMove(event) {
    if (!polyPenToolActive || polyPenCurrentChain.length === 0) {
        if (polyPenPreviewLine) polyPenPreviewLine.visible = false;
        if (polyPenPreviewFace) polyPenPreviewFace.visible = false;
        return;
    }

    const snapTarget = getPolyPenSnapPoint();
    if (!snapTarget) return;

    const lastVertexPos = getVertexPositionByIndex(polyPenCurrentChain[polyPenCurrentChain.length - 1]);
    
    // Update preview line
    polyPenPreviewLine.geometry.dispose();
    polyPenPreviewLine.geometry = new THREE.BufferGeometry().setFromPoints([lastVertexPos, snapTarget]);
    polyPenPreviewLine.computeLineDistances();
    polyPenPreviewLine.visible = true;

    // Update preview face
    if (polyPenCurrentChain.length === 2) { // Triangle preview
        const p0 = getVertexPositionByIndex(polyPenCurrentChain[0]);
        const p1 = lastVertexPos;
        const p2 = snapTarget;
        polyPenPreviewFace.geometry.dispose();
        polyPenPreviewFace.geometry = new THREE.BufferGeometry().setFromPoints([p0, p1, p2]);
        polyPenPreviewFace.geometry.setIndex([0, 1, 2]);
        polyPenPreviewFace.visible = true;
    } else if (polyPenCurrentChain.length === 3) { // Quad preview
        const p0 = getVertexPositionByIndex(polyPenCurrentChain[0]);
        const p1 = getVertexPositionByIndex(polyPenCurrentChain[1]);
        const p2 = lastVertexPos;
        const p3 = snapTarget;
        polyPenPreviewFace.geometry.dispose();
        polyPenPreviewFace.geometry = new THREE.BufferGeometry().setFromPoints([p0, p1, p2, p3]);
        polyPenPreviewFace.geometry.setIndex([0, 1, 2, 2, 3, 0]);
        polyPenPreviewFace.visible = true;
    } else {
        polyPenPreviewFace.visible = false;
    }
}

// This function is called by the main handleCanvasClick
function handlePolyPenClick(event) {
    if (!polyPenToolActive) return;

    const snapTargetPoint = getPolyPenSnapPoint();
    if (!snapTargetPoint) return;

    // Find or create the mesh we are editing
    findOrCreatePolyPenMesh();

    let newVertexIndex;
    // If snapping to an existing vertex, use its index. Otherwise, create a new one.
    if (snapTargetPoint.userData.isSnappedVertex) {
        newVertexIndex = snapTargetPoint.userData.vertexIndex;
    } else {
        // Add a new vertex to our mesh's geometry
        const positions = polyPenCurrentMesh.geometry.attributes.position.array;
        const newPositions = new Float32Array(positions.length + 3);
        newPositions.set(positions);
        snapTargetPoint.toArray(newPositions, positions.length);
        
        newVertexIndex = positions.length / 3;
        polyPenCurrentMesh.geometry.setAttribute('position', new THREE.Float32BufferAttribute(newPositions, 3));
    }

    polyPenCurrentChain.push(newVertexIndex);

    // If we've completed a face, add it to the geometry
    if (polyPenCurrentChain.length === 3) { // Create a triangle
        addFaceToPolyPenMesh([polyPenCurrentChain[0], polyPenCurrentChain[1], polyPenCurrentChain[2]]);
        // Continue the chain from the last two vertices
        polyPenCurrentChain = [polyPenCurrentChain[0], polyPenCurrentChain[2]]; 
    } else if (polyPenCurrentChain.length === 4) { // Create a quad
        addFaceToPolyPenMesh([polyPenCurrentChain[0], polyPenCurrentChain[1], polyPenCurrentChain[2]]);
        addFaceToPolyPenMesh([polyPenCurrentChain[0], polyPenCurrentChain[2], polyPenCurrentChain[3]]);
        // Start a new chain
        polyPenCurrentChain = [];
    }
}

// Helper to get a vertex's world position from the active poly mesh
function getVertexPositionByIndex(index) {
    if (!polyPenCurrentMesh) return new THREE.Vector3();
    return new THREE.Vector3().fromBufferAttribute(polyPenCurrentMesh.geometry.attributes.position, index)
                               .applyMatrix4(polyPenCurrentMesh.matrixWorld);
}

// Helper to determine where the user is trying to click/snap
function getPolyPenSnapPoint() {
    raycaster.setFromCamera(mouse, camera);
    const snapToVerts = document.getElementById('polyPenSnapToVerts').checked;
    
    // Priority 1: Snap to existing vertices of the mesh being built
    if (snapToVerts && polyPenCurrentMesh) {
        const positions = polyPenCurrentMesh.geometry.attributes.position;
        for (let i = 0; i < positions.count; i++) {
            const vertPos = new THREE.Vector3().fromBufferAttribute(positions, i).applyMatrix4(polyPenCurrentMesh.matrixWorld);
            const distToMouseRay = raycaster.ray.distanceToPoint(vertPos);
            if (distToMouseRay < 0.1) { // Snap radius
                vertPos.userData = { isSnappedVertex: true, vertexIndex: i };
                return vertPos;
            }
        }
    }

    // Priority 2: Intersect with the ground plane
    return getGroundPlaneIntersection(); // Use your existing helper function
}

// Helper to either find the active mesh or create a new one
function findOrCreatePolyPenMesh() {
    if (polyPenCurrentMesh === null) {
        console.log("Creating new mesh for Poly Pen tool.");
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(0), 3));
        const material = new THREE.MeshStandardMaterial({ color: 0x8888ff, side: THREE.DoubleSide, roughness: 0.6 });
        
        polyPenCurrentMesh = new THREE.Mesh(geometry, material);
        polyPenCurrentMesh.name = "PolyPen_Object_" + Date.now();
        scene.add(polyPenCurrentMesh);
    }
}

// Adds a new face to the currently active poly mesh
function addFaceToPolyPenMesh(indices) {
    if (!polyPenCurrentMesh) return;
    
    const geometry = polyPenCurrentMesh.geometry;
    const oldIndex = geometry.index ? geometry.index.array : [];
    const newIndex = new Uint32Array(oldIndex.length + 3);
    newIndex.set(oldIndex);
    newIndex.set(indices, oldIndex.length);
    
    geometry.setIndex(new THREE.BufferAttribute(newIndex, 1));
    geometry.computeVertexNormals();
    geometry.attributes.position.needsUpdate = true; // Not always needed but safe
    geometry.index.needsUpdate = true;
}

function finishPolyPenObject() {
    if (polyPenCurrentMesh) {
        console.log(`Finished creating ${polyPenCurrentMesh.name}.`);
        // Here you would register it with your other systems
        // registerArchitecturalElement(polyPenCurrentMesh, 'custom-mesh');
        
        // This makes it the main active object for other tools
        activeObject = polyPenCurrentMesh;
        if(typeof selectObject === 'function') selectObject(activeObject);
        showMeshStructure(activeObject);
    }
    polyPenCurrentMesh = null;
    polyPenCurrentChain = [];
}




// ==========================================================
// == NEW: MODELING CONTEXT MENU ============================
// ==========================================================

/**
 * Shows the modeling context menu at the given screen coordinates.
 * The menu content changes based on the current selectionMode.
 * @param {number} x Screen X coordinate.
 * @param {number} y Screen Y coordinate.
 */
function showModelingContextMenu(x, y) {
    if (!modelingContextMenu) {
        modelingContextMenu = document.getElementById('modeling-context-menu');
        // Add a global click listener to hide the menu when clicking elsewhere
        window.addEventListener('click', hideModelingContextMenu);
    }

    modelingContextMenu.innerHTML = ''; // Clear previous items

    // --- Always include basic selection modes ---
    modelingContextMenu.appendChild(createContextMenuItem("Select Vertex (1)", () => setSelectionMode('vertex')));
    modelingContextMenu.appendChild(createContextMenuItem("Select Edge (2)", () => setSelectionMode('edge')));
    modelingContextMenu.appendChild(createContextMenuItem("Select Face (3)", () => setSelectionMode('face')));
    modelingContextMenu.appendChild(createContextMenuItem("---", null, true)); // Separator

    // --- Dynamic Quick Controls based on Selection Mode & Selected State ---
    if (activeObject) { // Only show these if an object is active
        modelingContextMenu.appendChild(createContextMenuItem("Quick Controls:", null, true));
        
        switch (selectionMode) {
            case 'vertex':
                if (selectedElements.length === 1) {
                    modelingContextMenu.appendChild(createContextMenuItem("Translate (G)", () => { transformControls.setMode('translate'); transformControls.attach(selectedElements[0]); }));
                    modelingContextMenu.appendChild(createContextMenuItem("Delete Vertex (X)", () => deleteSelectedVertex())); // You'd need to implement deleteSelectedVertex
                } else if (selectedElements.length > 1) {
                    modelingContextMenu.appendChild(createContextMenuItem("Translate Selection", () => { /* Logic for multi-vertex transform */ }));
                }
                break;
            case 'edge':
                if (selectedElements.length === 1) {
                    modelingContextMenu.appendChild(createContextMenuItem("Translate (G)", () => { transformControls.setMode('translate'); transformControls.attach(selectedElements[0]); }));
                    modelingContextMenu.appendChild(createContextMenuItem("Rotate (R)", () => { transformControls.setMode('rotate'); transformControls.attach(selectedElements[0]); }));
                    modelingContextMenu.appendChild(createContextMenuItem("Scale (S)", () => { transformControls.setMode('scale'); transformControls.attach(selectedElements[0]); }));
                    modelingContextMenu.appendChild(createContextMenuItem("Bevel (Ctrl+B)", bevelSelection));
                    modelingContextMenu.appendChild(createContextMenuItem("Extrude Edge", () => extrudeEdge())); // Need to implement extrudeEdge
                    modelingContextMenu.appendChild(createContextMenuItem("Convert to Profile", convertSelectedEdgesToProfile));
                } else if (selectedElements.length === 2 && areEdgesConnectedAndParallel(selectedElements[0], selectedElements[1])) {
                    modelingContextMenu.appendChild(createContextMenuItem("Bridge Edges", bridgeEdgeLoops));
                } else if (selectedElements.length > 0) {
                     modelingContextMenu.appendChild(createContextMenuItem("Bevel (Multi)", bevelSelection));
                }
                break;
            case 'face':
                if (selectedElements.length === 1) {
                    modelingContextMenu.appendChild(createContextMenuItem("Translate (G)", () => { transformControls.setMode('translate'); transformControls.attach(selectedElements[0]); }));
                    modelingContextMenu.appendChild(createContextMenuItem("Extrude (E)", extrudeSelection));
                    modelingContextMenu.appendChild(createContextMenuItem("Inset (I)", insetSelectedFaces));
                } else if (selectedElements.length > 0) {
                    modelingContextMenu.appendChild(createContextMenuItem("Extrude Faces", extrudeSelection));
                    modelingContextMenu.appendChild(createContextMenuItem("Inset Faces", insetSelectedFaces));
                }
                break;
        }
        
        // --- Common Operations (Active Object Context) ---
        modelingContextMenu.appendChild(createContextMenuItem("---", null, true));
        modelingContextMenu.appendChild(createContextMenuItem("Common Actions:", null, true));
        modelingContextMenu.appendChild(createContextMenuItem("Subdivide Geometry", () => applySubdivision(1)));
        modelingContextMenu.appendChild(createContextMenuItem("Merge Vertices", mergeActiveGeometry));
        modelingContextMenu.appendChild(createContextMenuItem("Loop Cut (Ctrl+R)", initiateLoopCut));
        modelingContextMenu.appendChild(createContextMenuItem("Delete Object (Del)", () => { deleteSelectedObject(); /* Need deleteSelectedObject */ }));

    } else { // No object active / general scene context
        modelingContextMenu.appendChild(createContextMenuItem("Scene Actions:", null, true));
        modelingContextMenu.appendChild(createContextMenuItem("Add Cube", () => {/* Add cube function */}));
        modelingContextMenu.appendChild(createContextMenuItem("Add Sphere", () => {/* Add sphere function */}));
        // You can add more general scene actions here
    }

    // Position the menu
    modelingContextMenu.style.left = `${x}px`;
    modelingContextMenu.style.top = `${y}px`;
    modelingContextMenu.style.display = 'block'; // Show it
}

/** Hides the modeling context menu. */
function hideModelingContextMenu() {
    if (modelingContextMenu) {
        modelingContextMenu.style.display = 'none';
    }
}

/** Helper function to create a menu item. */
function createContextMenuItem(text, onClick, isSeparator = false) {
    const item = document.createElement('div');
    if (isSeparator) {
        item.style.borderTop = '1px solid #444';
        item.style.marginTop = '3px';
        item.style.paddingTop = '3px';
        item.style.color = '#888';
        item.textContent = text;
        item.style.cursor = 'default';
        item.style.pointerEvents = 'none'; // Make it non-clickable
    } else {
        item.textContent = text;
        item.style.padding = '4px 8px';
        item.style.cursor = 'pointer';
        item.onmouseover = () => item.style.backgroundColor = '#555';
        item.onmouseout = () => item.style.backgroundColor = 'transparent';
        if (onClick) {
            item.onclick = (e) => {
                e.stopPropagation(); // Prevent this click from immediately re-hiding the menu
                hideModelingContextMenu(); // Hide the menu before executing action
                onClick(); // Execute the action
            };
        }
    }
    return item;
}



// --- Helper for Bridge menu item (you need to define this somewhere) ---
function areEdgesConnectedAndParallel(edge1Proxy, edge2Proxy) {
    // This is a placeholder for actual geometric check
    // You'd need to check if the edges are part of a shared face
    // and if they are parallel enough for a clean bridge.
    // This function can be complex based on desired robustness.
    return false; // Return false for now unless you implement actual logic
}

// Ensure init is called on load
window.addEventListener('load', init);