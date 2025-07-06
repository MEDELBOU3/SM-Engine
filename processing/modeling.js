







//Global variables
let helperUpdateTimeout = null;
let lastHelperUpdateTime = 0;
const MIN_UPDATE_INTERVAL = 50; // ms between updates (Reduced for hover responsiveness)
const MAX_HELPERS = 2000;
let isPerformanceMode = true;

let isTransforming = false;
// ++ Store drag start state ++
/*
let dragStartState = {
    vertices: new Map(), // Map<vertexIndex, initialWorldPosition>
    center: null
};
*/

let dragStartState = {
    vertices: [],
    center: null
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


// Add others as needed...
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

/**
 * Builds a map where keys are edge strings ("v1_v2") and values are arrays
 * of face indices adjacent to that edge. Requires indexed geometry.
 * @param {THREE.BufferGeometry} geometry - The indexed buffer geometry.
 * @returns {Map<string, number[]> | null} The edge-to-faces map or null on error.
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
        const v0 = index[i];
        const v1 = index[i + 1];
        const v2 = index[i + 2];
        const edges = [[v0, v1], [v1, v2], [v2, v0]];

        for (const edge of edges) {
            // Skip degenerate edges where vertices are the same
            if (edge[0] === edge[1]) continue;
            const edgeKey = getEdgeKey(edge[0], edge[1]);
            let faceList = edgeFaceMap.get(edgeKey);
            if (!faceList) {
                faceList = [];
                edgeFaceMap.set(edgeKey, faceList);
            }
            faceList.push(faceIndex);
        }
    }
     // Optional: Check for non-manifold edges (more than 2 faces per edge)
     edgeFaceMap.forEach((faces, key) => {
         if (faces.length > 2) {
              console.warn(`Non-manifold edge detected (edge ${key} belongs to ${faces.length} faces). Tools might produce unexpected results.`);
          }
     });
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

/** Utility to find the intersection point on the ground plane (Y=0). */
function getGroundPlaneIntersection() {
    // Ensure raycaster is updated based on current mouse position
    // This should ideally happen right before this function is called
    // Example: raycaster.setFromCamera(mouse, camera);

    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const intersection = new THREE.Vector3();

    if (raycaster.ray.intersectPlane(groundPlane, intersection)) {
        return intersection;
    } else {
        console.warn("Raycaster did not intersect ground plane.");
        return null; // Indicate no intersection found
    }
}

function registerArchitecturalElement(mesh, type) {
    mesh.userData.isArchitectural = true;
    mesh.userData.archType = type;
    if (mesh.material && mesh.material.color) {
        mesh.userData.originalColor = mesh.material.color.clone();
    } else if (mesh.isGroup && mesh.children.length > 0 && mesh.children[0].material && mesh.children[0].material.color) {
        mesh.userData.originalColor = mesh.children[0].material.color.clone();
    } else {
        console.warn(`Arch element "${mesh.name}" has no standard material/color. Type: ${type}`);
        mesh.userData.originalColor = new THREE.Color(0xffffff);
    }
    architecturalElements.push(mesh);

    // FIX: Use 'mesh' argument
    if (typeof updateHierarchy === 'function') {
        updateHierarchy(mesh); // Pass the mesh being registered
    }
    if (typeof selectObject === 'function') {
        selectObject(mesh); // Pass the mesh being registered
    }

    console.log(`Registered ${type}: ${mesh.name || mesh.uuid}. Total arch elements: ${architecturalElements.length}`);
}
// Modified makeObjectSelectable or a new function for arch elements


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



// ============================================
// === Central Event Handlers & Tool Routing ===
// ============================================

/*function handleCanvasClick(event) {
    if (isTransforming) return; // Don't select if gizmo is active

    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);

    // Priority: Architectural tools
    if (activeArchTool) {
        switch (activeArchTool) {
            case 'wall':    handleWallCreationPoint(event); break;
            case 'door':
            case 'window':  handlePlaceObjectConfirm(event); break;
            case 'measure': handleMeasurePoint(event); break;
            case 'stairs':  handleStairPlacement(event); break; // Assuming this exists
            default: console.warn("Unhandled Arch Tool click:", activeArchTool);
        }
        return; // Arch tool click takes precedence
    }

    // If not in modeling mode, or if an arch tool is NOT active, allow arch element selection
    if (!isModelingMode || (isModelingMode && !activeArchTool && !isLoopCutMode && !splineCreationMode)) {
        const intersects = raycaster.intersectObjects(architecturalElements, false); // Intersect only our architectural elements
        if (intersects.length > 0) {
            const clickedElement = intersects[0].object;
            if (clickedElement.userData.isArchitectural) {
                const isAdditive = event.shiftKey; // Hold shift for multi-select
                if (selectedArchElements.includes(clickedElement) && isAdditive) {
                    deselectArchElement(clickedElement);
                } else {
                    selectArchElement(clickedElement, isAdditive);
                }
                // Prevent modeling selection if an arch element was clicked
                return;
            }
        } else {
            // If nothing architectural was clicked, and not adding, clear arch selection
            if (!event.shiftKey) {
                 deselectAllArchElements();
            }
        }
    }


    // Fallback to modeling mode selection if applicable
    if (isModelingMode) {
        if (isLoopCutMode) {
            // Loop cut click is handled by its own internal listener
        } else if (splineCreationMode) {
            handleSplineDrawClick(event);
        } else if (!isTransforming) { // Ensure not transforming modeling elements
            onModelingClick(event); // Original modeling selection
        }
    }
}*/

function handleCanvasClick(event) {
    if (isTransforming) return;
    updateRaycaster(event);

    if (isSpinMode) {
        handleSpinToolInteraction(event);
        return;
    }

    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);

    // --- NEW: Delegate to Structure Synth Tool if active ---
    if (structureSynthToolActive) {
        const intersection = getGroundPlaneIntersection(); // Or more complex intersection logic
        let firstIntersectedObject = null;
        const allIntersects = raycaster.intersectObjects(scene.children, true); // Check all scene objects
        if (allIntersects.length > 0) {
             // Find the first visible, non-helper mesh
            for (let i = 0; i < allIntersects.length; i++) {
                if (allIntersects[i].object.isMesh && allIntersects[i].object.visible &&
                    !allIntersects[i].object.name.includes("Helper") && // Exclude your helper objects
                    allIntersects[i].object !== synthPreviewLine &&
                    allIntersects[i].object !== synthExtrudePreviewMesh) {
                    firstIntersectedObject = allIntersects[i]; // Store the full intersection object
                    break;
                }
            }
        }
        handleSynthClick(event, intersection, firstIntersectedObject);
        return; // Synth tool handles the click
    }
    // --- END NEW ---

      if (activeArchTool === 'boolean-subtract') { // Handle boolean tool clicks specifically
        const intersects = raycaster.intersectObjects(architecturalElements, false); // Intersect only arch elements
        if (intersects.length > 0) {
            let clickedMesh = null;
            // Find the root architectural mesh if clicking a child of a Group
            for (let i = 0; i < intersects.length; i++) {
                let obj = intersects[i].object;
                while (obj && !obj.userData.isArchitectural && obj.parent !== scene) {
                    obj = obj.parent;
                }
                if (obj && obj.userData.isArchitectural && obj.isMesh) { // Ensure it's a mesh
                    clickedMesh = obj;
                    break;
                }
            }

            if (clickedMesh) {
                if (!booleanTargetMesh) {
                    booleanTargetMesh = clickedMesh;
                    deselectAllArchElements(); // Clear previous
                    selectArchElement(booleanTargetMesh); // Highlight it
                    alert("Boolean Subtract: Target mesh selected (" + (booleanTargetMesh.name || "Unnamed Mesh") + ").\nNow click the second mesh (the one to subtract).");
                    console.log("Boolean Subtract: Target selected:", booleanTargetMesh.name || booleanTargetMesh.uuid);
                } else if (!booleanToolMesh && clickedMesh !== booleanTargetMesh) {
                    booleanToolMesh = clickedMesh;
                    // No need to deselect target, keep it highlighted. Highlight tool additively.
                    selectArchElement(booleanToolMesh, true); // Additive select for visual cue
                    alert("Boolean Subtract: Tool mesh selected (" + (booleanToolMesh.name || "Unnamed Mesh") + "). Performing operation...");
                    console.log("Boolean Subtract: Tool selected:", booleanToolMesh.name || booleanToolMesh.uuid);
                    applyBooleanSubtract(booleanTargetMesh, booleanToolMesh); // Execute the operation
                    deactivateCurrentArchTool(); // Deactivate after operation
                } else if (clickedMesh === booleanTargetMesh) {
                    alert("This mesh is already selected as the target. Click a DIFFERENT mesh as the tool.");
                }
            }
        }
        return; // Boolean tool click handled
    }

    if (activeArchTool) {
        switch (activeArchTool) {
            case 'wall':    handleWallCreationPoint(event); break;
            case 'door':
            case 'window':  handlePlaceObjectConfirm(event); break;
            case 'measure': handleMeasurePoint(event); break;
            case 'stairs':  handleStairPlacement(event); break;
            case 'roof':    handleRoofPlacementPoint(event); break; // NEW
            case 'room':    handleRoomPlacementPoint(event); break; // NEW
            case 'curved-wall': handleCurvedWallPlacementPoint(event); break; // NEW
            case 'terrain': handleTerrainPlacement(event); break; // NEW
            default: console.warn("Unhandled Arch Tool click:", activeArchTool);
        }
        return;
    }
    if (!isModelingMode || (isModelingMode && !activeArchTool && !isLoopCutMode && !splineCreationMode)) {
        const intersects = raycaster.intersectObjects(architecturalElements, false);
        if (intersects.length > 0) {
            let clickedElement = null; // Logic to find the root architectural element
             for (let i = 0; i < intersects.length; i++) {
                let obj = intersects[i].object;
                while(obj && !obj.userData.isArchitectural && obj.parent !== scene) {
                    obj = obj.parent;
                }
                if (obj && obj.userData.isArchitectural) {
                    clickedElement = obj;
                    break;
                }
            }

            if (clickedElement) {
                const isAdditive = event.shiftKey;
                if (selectedArchElements.includes(clickedElement) && isAdditive) {
                    deselectArchElement(clickedElement);
                } else {
                    selectArchElement(clickedElement, isAdditive);
                }
                return;
            }
        } else {
            if (!event.shiftKey) {
                 deselectAllArchElements();
            }
        }
    }


    // Fallback to modeling mode selection if applicable
    if (isModelingMode) {
        if (isLoopCutMode) {
            // Loop cut click is handled by its own internal listener
        } else if (splineCreationMode) {
            handleSplineDrawClick(event);
        } else if (!isTransforming) { // Ensure not transforming modeling elements
            onModelingClick(event); // Original modeling selection
        }
    }
}

function handleCanvasMouseMove(event) {
    if (!isModelingMode && !activeArchTool && !isLoopCutMode && !splineCreationMode) return; // Adjusted condition

     updateRaycaster(event);
    
    if (isSpinMode) {
        handleSpinToolInteraction(event);
        return;
    }
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);

      // --- NEW: Delegate to Structure Synth Tool if active ---
    if (structureSynthToolActive) {
        const intersection = getGroundPlaneIntersection(); // Or more complex intersection logic
        let firstIntersectedObject = null;
        const allIntersects = raycaster.intersectObjects(scene.children, true);
        if (allIntersects.length > 0) {
             for (let i = 0; i < allIntersects.length; i++) {
                if (allIntersects[i].object.isMesh && allIntersects[i].object.visible &&
                    !allIntersects[i].object.name.includes("Helper") &&
                    allIntersects[i].object !== synthPreviewLine &&
                    allIntersects[i].object !== synthExtrudePreviewMesh) {
                    firstIntersectedObject = allIntersects[i];
                    break;
                }
            }
        }
        handleSynthMouseMove(event, intersection, firstIntersectedObject);
        return; // Synth tool handles mouse move
    }
    // --- END NEW ---

    if (activeArchTool) {
        switch (activeArchTool) {
            case 'wall':    handleWallPreview(event); break;
            case 'door':
            case 'window':  handlePlaceObjectPreview(event); break;
            case 'measure': handleMeasurePreview(event); break;
            case 'stairs':  handleStairsPreview(event); break;
            case 'roof':    handleRoofPreview(event); break; // NEW
            case 'room':    handleRoomPreview(event); break; // NEW
            case 'curved-wall': handleCurvedWallPreview(event); break; // NEW
            case 'terrain': handleTerrainPreview(event); break; // NEW
        }
    } else if (isLoopCutMode) {
        handleLoopCutPreviewInternal(event);
    } else if (splineCreationMode) {
        handleSplineDrawMove(event);
    } else if (isModelingMode) {
        onModelingMouseMove(event);
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

function handleCanvasRightClick(event) {
    event.preventDefault();

    event.preventDefault();
    
    if (isSpinMode) {
        cancelSpinTool();
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
}

/*function handleCanvasRightClick(event) {
    event.preventDefault();

    if (activeArchTool) {
        if (activeArchTool === 'wall' && wallPoints.length > 0) {
             finishWall();
        } else {
             deactivateCurrentArchTool();
        }
    } else if (isLoopCutMode) {
        cancelLoopCut();
    } else if (splineCreationMode) {
        finishSplineDrawing();
    } else {
        if (isModelingMode && selectedElements.length > 0) {
            clearSelection(); // Clear modeling selection
        }
        if (selectedArchElements.length > 0) {
            deselectAllArchElements(); // Clear architectural selection
        }
        if (!isModelingMode && selectedArchElements.length === 0 && selectedElements.length === 0){
            // If nothing is selected and not in modeling mode, perhaps a context menu could open here in the future.
            console.log("Right-click: No active tool, no selections.");
        }
    }
}*/


// ===========================================
// === Tool Activation / State Management ===
// ===========================================

/** Activates or deactivates an Architecture tool */
/*
function toggleArchTool(toolName) {
    cleanupStructureSynthTool();
    if (!isModelingMode) return; // Or remove this if arch tools can be used outside modeling mode

    const toolOptionsElement = document.getElementById(`${toolName}-options`);
    const toolButton = document.getElementById(`tool-${toolName}`);

    if (activeArchTool === toolName) {
        deactivateCurrentArchTool();
    } else {
        deactivateCurrentArchTool(); // Deactivate any previous tool
        activeArchTool = toolName;
        console.log(`Activated Arch tool: ${activeArchTool}`);

        // Highlight active button
        document.querySelectorAll('.arch-tool.active-tool').forEach(btn => btn.classList.remove('active-tool'));
        if (toolButton) toolButton.classList.add('active-tool');

        // Show/hide options panels
        document.querySelectorAll('.tool-options').forEach(el => el.style.display = 'none');
        if (toolOptionsElement) toolOptionsElement.style.display = 'block';

        // Initialize the specific tool
        switch (toolName) {
            case 'wall':    initWallTool(); break;
            case 'door':    initPlacementTool('door'); break;
            case 'window':  initPlacementTool('window'); break; // Window tool will check for currentWindowPreset
            case 'measure': initMeasureTool(); break;
            case 'stairs':  initStairsTool(); break;
            case 'roof':    initRoofTool(); break; // NEW
            case 'room':    initRoomTool(); break; // NEW
            case 'curved-wall': initCurvedWallTool(); break; // NEW
            case 'terrain': initTerrainTool(); break; // NEW
            // 'window-presets' is handled directly in its event listener, not via toggleArchTool
        }

        if (controls) controls.enabled = false; // Disable orbit controls when a tool is active
        transformControls.detach();
        clearSelection(); // Clear modeling V/E/F selection
        deselectAllArchElements(); // Clear architectural element selection
    }
}*/

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
/*function deactivateCurrentArchTool() {
    if (!activeArchTool) return;
    console.log(`Deactivating Arch tool: ${activeArchTool}`);

    const toolButton = document.getElementById(`tool-${activeArchTool}`);
    if (toolButton) toolButton.classList.remove('active-tool');

    switch (activeArchTool) {
        case 'wall':    cleanupWallTool(); break;
        case 'door':
        case 'window':  cleanupPlacementTool(); break;
        case 'measure': cleanupMeasureTool(); break;
        case 'stairs':  cleanupStairsTool(); break; // Added cleanup
    }

    document.querySelectorAll('.tool-options').forEach(el => el.style.display = 'none');
    if(measureDisplayElement) measureDisplayElement.style.display = 'none';
    if (renderer.domElement) renderer.domElement.style.cursor = 'default';

    activeArchTool = null;

    if (isModelingMode && !isLocked && !isTransforming && !isLoopCutMode && !splineCreationMode) {
        if (controls) controls.enabled = true;
    }
}*/

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



/*
function handleWallPreview(event) { // Called on mouse move when wall tool is active
    if (wallPoints.length === 0) {
        if (wallPreviewLine) wallPreviewLine.visible = false;
        return;
    }
    // raycaster is updated in handleCanvasMouseMove
    const intersection = getGroundPlaneIntersection(); // Assumes walls are drawn on Y=0 plane
    if (intersection) {
        const currentSegmentPoints = [wallPoints[wallPoints.length - 1].clone(), intersection.clone()];
        wallPreviewLine.geometry.dispose(); // Dispose old geometry before setting new
        wallPreviewLine.geometry = new THREE.BufferGeometry().setFromPoints(currentSegmentPoints);
        wallPreviewLine.computeLineDistances(); // For dashed material
        wallPreviewLine.visible = true;
    } else {
        if (wallPreviewLine) wallPreviewLine.visible = false;
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
}


/*function handleWallCreationPoint(event) { // Called on click when wall tool is active
    // raycaster updated in handleCanvasClick
    const intersection = getGroundPlaneIntersection();
    if (intersection) {
        wallPoints.push(intersection.clone());
        console.log(`Wall point ${wallPoints.length} added:`, intersection.toArray());

        if (wallPoints.length >= 2) {
            // If you want to show the full path being drawn:
            
            wallPreviewLine.geometry.dispose();
            wallPreviewLine.geometry = new THREE.BufferGeometry().setFromPoints(wallPoints);
            wallPreviewLine.computeLineDistances();
            

            //For now, preview only shows the current segment being drawn (handled by handleWallPreview)
        }
        if (wallPoints.length === 1 && wallPreviewLine) { // Show a single dot or hide preview
             wallPreviewLine.geometry.dispose();
             wallPreviewLine.geometry = new THREE.BufferGeometry().setFromPoints([wallPoints[0], wallPoints[0].clone().add(new THREE.Vector3(0.01,0,0.01))]); // Tiny segment
             wallPreviewLine.computeLineDistances();
             wallPreviewLine.visible = true;
        }
    }
}

function handleWallCreationPoint(event) {
    if (!isWallToolActive) return;
    
    const intersection = getGroundPlaneIntersection();
    if (intersection) {
        wallPoints.push(intersection.clone());
        
        // Update complete path with confirmed points
        if (wallPoints.length > 1) {
            fullWallPath.geometry.dispose();
            fullWallPath.geometry = new THREE.BufferGeometry().setFromPoints(wallPoints);
            fullWallPath.visible = true;
        }
        
        // For single point, show small preview
        if (wallPoints.length === 1) {
            wallPreviewLine.geometry.dispose();
            wallPreviewLine.geometry = new THREE.BufferGeometry().setFromPoints([
                wallPoints[0],
                wallPoints[0].clone().add(new THREE.Vector3(0.01, 0, 0.01))
            ]);
            wallPreviewLine.computeLineDistances();
            wallPreviewLine.visible = true;
        }
    }
}*/

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

function initStairsTool() {
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
}

function createStairs(start, end) {
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
}

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
}


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

function setupTransformControls() {
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
}

const handleTransformObjectChange = () => { // Debounce this if performance is an issue
    if (isSnappingEnabled && transformControls.object && transformControls.dragging) {
        applySnapping(transformControls);
    } else {
        snapHighlightMesh.visible = false; // Hide when not snapping/dragging
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

// Spline Tools
let splineCreationMode = null; // 'profile', 'path'
let currentSplinePoints = []; // Holds Vector2 or Vector3
let splinePreviewLine = null; // Re-use wallPreviewLine? Or dedicated?
let editedSplines = { profile: null, path: null, list: [] }; 


// --- UI Needed ---
// - Button to Enter "Draw Profile (2D)" mode
// - Button to Enter "Draw Path (3D)" mode
// - A panel to select the Active Profile and Active Path
// - Button "Extrude Profile along Path"

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


function clearSelection() { // This is for modeling elements
    selectedElements.forEach(elem => {
        if(elem.parent) elem.parent.remove(elem); // Proxy objects
        if(elem.geometry) elem.geometry.dispose();
    });
    selectedElements = [];
    transformControls.detach();
    resetHighlights(); // Resets modeling highlights
    if(activeObject && isModelingMode) showMeshStructure(activeObject);

    // If a modeling selection is cleared, also clear architectural selection
    // unless the user is actively trying to add to architectural selection (which is not standard here)
    // deselectAllArchElements(); // This might be too aggressive if user wants to keep arch elements selected while modeling
}


function toggleModelingMode() {
    isModelingMode = !isModelingMode;
    console.log("Modeling Mode:", isModelingMode);
    // ... (button disabling logic as before) ...
    const modelingButtons = ['select-vertex', 'select-edge', 'select-face',
                             'tool-extrude', 'tool-bevel', 'tool-loopcut',  'tool-inset', 'tool-bridge'];
    const archToolButtons = ['tool-wall', 'tool-place-door', 'tool-place-window', 'tool-stairs', 'tool-measure', 'tool-spin'];
    const splineToolButtons = ['spline-draw-profile', 'spline-draw-path', 'spline-extrude'];
    // Architectural selection buttons might be enabled/disabled based on isModelingMode or always available
    const archSelectionButtons = ['select-all-walls', 'select-all-doors', 'select-all-windows', 'select-all-arch', 'delete-selected-arch'];


    [...modelingButtons, ...archToolButtons, ...splineToolButtons].forEach(id => {
       const button = document.getElementById(id);
       if (button) button.disabled = !isModelingMode; // Most tools tied to modeling mode for now
    });
    // Arch selection can be independent of modeling mode
    archSelectionButtons.forEach(id => {
        const button = document.getElementById(id);
        // if (button && id !== 'delete-selected-arch') button.disabled = false; // Keep select buttons always enabled
    });


    document.getElementById('performance-mode').disabled = !isModelingMode;
    document.getElementById('vertexSizeSlider').disabled = !isModelingMode;
    document.getElementById('edgeThicknessSlider').disabled = !isModelingMode;
    document.getElementById('faceOpacitySlider').disabled = !isModelingMode;
    document.getElementById('subdivisionLevelsSlider').disabled = !isModelingMode;
    document.getElementById('modifiers-panel').style.display = (isModelingMode && activeObject) ? 'block' : 'none';
    document.getElementById('snapping-controls').style.display = isModelingMode ? 'block' : 'none';


    if (isModelingMode) {
        deselectAllArchElements(); // Clear arch selection when entering modeling mode for clarity
        if (!selectionMode) setSelectionMode('vertex');
        else setSelectionMode(selectionMode); // Re-apply to show helpers

        if(!scene.children.includes(vertexHelpers)) scene.add(vertexHelpers);
        if(!scene.children.includes(edgeHelpers)) scene.add(edgeHelpers);
        if(!scene.children.includes(faceHelpers)) scene.add(faceHelpers);
        if (activeObject) showMeshStructure(activeObject);
        if(controls) controls.enabled = true; // Orbit controls ON

    } else { // Exiting modeling mode
        clearSelection(); // Clear modeling V/E/F selection
        clearMeshStructure();
        scene.remove(vertexHelpers); scene.remove(edgeHelpers); scene.remove(faceHelpers);
        transformControls.detach();
        deactivateCurrentArchTool(); // Also deactivate any active arch tool
        cancelLoopCut();
        finishSplineDrawing();
        // Architectural elements remain selectable
        if(controls) controls.enabled = true;
    }
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

function clearMeshStructure() {
    // Dispose and clear helper groups
    [vertexHelpers, edgeHelpers, faceHelpers].forEach(group => {
        if (group.parent) group.parent.remove(group);
        group.children.forEach(child => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
                else child.material.dispose();
            }
        });
        group.clear();
    });

    // Re-create groups
    vertexHelpers = new THREE.Group(); vertexHelpers.name = "VertexHelpers";
    edgeHelpers = new THREE.Group(); edgeHelpers.name = "EdgeHelpers";
    faceHelpers = new THREE.Group(); faceHelpers.name = "FaceHelpers";

    if (isModelingMode){ // Add them back to scene ONLY if still in modeling mode
       scene.add(vertexHelpers);
       scene.add(edgeHelpers);
       scene.add(faceHelpers);
    }
}


function onModelingClick(event) {
    // Prevent clicks triggering selection while transforming
    if (!isModelingMode || !activeObject || isTransforming) return;

    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    // ++ Set Line Precision ++
    raycaster.params.Line.threshold = 0.1;

    // Clear previous highlight effects definitively before selecting
     resetHighlights();

    let selectionMade = false;
    switch (selectionMode) {
        case 'vertex': {
            const vertexIntersects = raycaster.intersectObjects(vertexHelpers.children, true);
            // Find the closest *valid* vertex helper intersection
             const closestVertex = findClosestIntersection(vertexIntersects, 'vertex-instanced');
            if (closestVertex) {
                 selectVertex(closestVertex);
                 selectionMade = true;
            }
            break;
        }
        case 'edge': {
            const edgeIntersects = raycaster.intersectObjects(edgeHelpers.children, true);
            // Find the closest *valid* edge helper intersection
             const closestEdge = findClosestIntersection(edgeIntersects, 'edge');
             if (closestEdge) {
                 selectEdge(closestEdge);
                 selectionMade = true;
             }
            break;
        }
        case 'face': {
            const faceIntersects = raycaster.intersectObjects(faceHelpers.children, true);
             // Find the closest *valid* face helper intersection
             const closestFace = findClosestIntersection(faceIntersects, 'face');
             if (closestFace) {
                selectFace(closestFace);
                selectionMade = true;
            }
            break;
        }
    }
     // If no selection was made, clear any existing selection
     if (!selectionMade) {
         clearSelection();
     }
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


function mergeVerticesByPosition(geometry, tolerance = 1e-5) {
    const positions = geometry.attributes.position.array;
    const indexAttr = geometry.index ? geometry.index.array : null;
    const vertCount = geometry.attributes.position.count;

    const newVertices = [];
    const vertexMap = new Map(); // key: rounded position -> new index
    const indexRemap = new Array(vertCount); // old index -> new index

    for (let i = 0; i < vertCount; i++) {
        const x = positions[i * 3];
        const y = positions[i * 3 + 1];
        const z = positions[i * 3 + 2];
        const key = `${x.toFixed(5)}_${y.toFixed(5)}_${z.toFixed(5)}`; // rounding for tolerance

        if (vertexMap.has(key)) {
            indexRemap[i] = vertexMap.get(key);
        } else {
            const newIndex = newVertices.length / 3;
            newVertices.push(x, y, z);
            vertexMap.set(key, newIndex);
            indexRemap[i] = newIndex;
        }
    }

    // Build new index array
    let newIndexArray = [];
    if (indexAttr) {
        for (let i = 0; i < indexAttr.length; i++) {
            newIndexArray[i] = indexRemap[indexAttr[i]];
        }
    } else {
        for (let i = 0; i < vertCount; i++) {
            newIndexArray[i] = indexRemap[i];
        }
    }

    // Remove degenerate triangles
    const filteredIndex = [];
    for (let i = 0; i < newIndexArray.length; i += 3) {
        const a = newIndexArray[i];
        const b = newIndexArray[i + 1];
        const c = newIndexArray[i + 2];
        if (a !== b && b !== c && c !== a) {
            filteredIndex.push(a, b, c);
        }
    }

    // Build new geometry
    const newGeo = new THREE.BufferGeometry();
    const posAttr = new THREE.Float32BufferAttribute(newVertices, 3);
    newGeo.setAttribute('position', posAttr);
    newGeo.setIndex(filteredIndex);
    newGeo.computeVertexNormals();
    newGeo.computeBoundingBox();
    newGeo.computeBoundingSphere();

    return newGeo;
}

function mergeActiveGeometry() {
    if (!activeObject || !activeObject.geometry) {
        alert("No active mesh selected.");
        return;
    }

    const mergedGeometry = mergeVerticesByPosition(activeObject.geometry);
    activeObject.geometry.dispose();
    activeObject.geometry = mergedGeometry;

    // إعادة بناء الخرائط بعد الدمج
    edgeFaceMap = buildEdgeFaceMap(mergedGeometry);
    vertexEdgeMap = buildVertexEdgeMap(mergedGeometry);
    vertexFaceMap = buildVertexFaceMap(mergedGeometry);

    updateEdgeFaceHelpers(); // إعادة توليد المساعدات البصرية

    alert("Vertices merged successfully!");
    console.log("Geometry after merge:", mergedGeometry);
}



//=== GEOMETRY SUBDIVISION ===//
// This function subdivides the geometry by splitting each triangle into 4 smaller triangles
function subdivideGeometry(geometry) {
    if (!geometry || !geometry.index || !geometry.attributes.position) {
        console.warn("Geometry is not valid or not indexed.");
        return geometry;
    }

    const positions = geometry.attributes.position.array;
    const indexArray = geometry.index.array;

    const oldVertices = [];
    for (let i = 0; i < positions.length; i += 3) {
        oldVertices.push(new THREE.Vector3(positions[i], positions[i + 1], positions[i + 2]));
    }

    const newVertices = [...oldVertices];
    const midpointCache = new Map(); // key: edgeKey, value: new vertex index

    const newIndices = [];

    const getMidpoint = (i1, i2) => {
        const key = i1 < i2 ? `${i1}_${i2}` : `${i2}_${i1}`;
        if (midpointCache.has(key)) return midpointCache.get(key);

        const v1 = newVertices[i1];
        const v2 = newVertices[i2];
        const mid = new THREE.Vector3().addVectors(v1, v2).multiplyScalar(0.5);
        const newIndex = newVertices.length;
        newVertices.push(mid);
        midpointCache.set(key, newIndex);
        return newIndex;
    };

    for (let i = 0; i < indexArray.length; i += 3) {
        const a = indexArray[i];
        const b = indexArray[i + 1];
        const c = indexArray[i + 2];

        const ab = getMidpoint(a, b);
        const bc = getMidpoint(b, c);
        const ca = getMidpoint(c, a);

        // Create 4 new triangles from original triangle
        newIndices.push(a, ab, ca);
        newIndices.push(ab, b, bc);
        newIndices.push(ca, bc, c);
        newIndices.push(ab, bc, ca);
    }

    const flatPositions = [];
    for (const v of newVertices) {
        flatPositions.push(v.x, v.y, v.z);
    }

    const newGeometry = new THREE.BufferGeometry();
    newGeometry.setAttribute("position", new THREE.Float32BufferAttribute(flatPositions, 3));
    newGeometry.setIndex(newIndices);
    newGeometry.computeVertexNormals();
    newGeometry.computeBoundingBox();
    newGeometry.computeBoundingSphere();

    return newGeometry;
}

function applySubdivision(level = 1) {
    if (!activeObject || !activeObject.geometry) {
        alert("No active object selected.");
        return;
    }

    let currentGeometry = activeObject.geometry;
    for (let i = 0; i < level; i++) {
        currentGeometry = subdivideGeometry(currentGeometry);
    }

    activeObject.geometry.dispose();
    activeObject.geometry = currentGeometry;

    edgeFaceMap = buildEdgeFaceMap(currentGeometry);
    vertexEdgeMap = buildVertexEdgeMap(currentGeometry);
    vertexFaceMap = buildVertexFaceMap(currentGeometry);

    updateEdgeFaceHelpers();
}


function selectVertex(intersection) {
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
}

function arraysEqual(a, b) {
    return a.length === b.length && a.every((val, index) => val === b[index]);
}

function updateMeshGeometry() {
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
    // if (helperUpdateTimeout) clearTimeout(helperUpdateTimeout);
    // helperUpdateTimeout = setTimeout(() => {
    //     showMeshStructure(activeObject); // This updates helpers based on final state
    // }, 100); // Keep a small delay IF immediate update causes performance hit
}

// Function validateTransformation removed - calculations should prevent extremes. Clamping is in place.
// Function fixFaceOrientation removed - Generally not needed unless dealing with complex topology generation.

// --- updateEdgeFaceHelpers remains largely the same ---
// ... Ensure it reads the *updated* positions correctly ...

function updateEdgeFaceHelpers() {
    // Clear existing helpers correctly
     edgeHelpers.children.forEach(child => { if(child.geometry) child.geometry.dispose(); if(child.material) child.material.dispose(); });
     edgeHelpers.clear();
     faceHelpers.children.forEach(child => { if(child.geometry) child.geometry.dispose(); if(child.material) child.material.dispose(); });
     faceHelpers.clear();

    if (!activeObject || !activeObject.geometry || !activeObject.geometry.attributes.position) return;

    const geometry = activeObject.geometry;
    // !! Get potentially UPDATED positions !!
    const positions = geometry.attributes.position;
    const matrix = activeObject.matrixWorld; // Use current world matrix
    const edgeThickness = parseFloat(document.getElementById('edgeThicknessSlider').value) || 1; // Default thickness
     const faceOpacityValue = parseFloat(document.getElementById('faceOpacitySlider').value); // Already parsed
     const faceOpacity = isNaN(faceOpacityValue) ? 0.5 : faceOpacityValue; // Default opacity

    const edgeCount = (selectionMode === 'edge' || selectionMode === 'all');
    const faceCount = (selectionMode === 'face' || selectionMode === 'all');

     // Optimization: Don't generate if not needed
     if (!edgeCount && !faceCount) return;


    const MAX_HELPERS_EDGE_FACE = 5000; // Separate limit for these? Or use global MAX_HELPERS?

     const isIndexed = geometry.index;
     const indices = isIndexed ? geometry.index.array : null;
     const posCount = positions.count;

     // Temporary vectors for calculations
     const vStart = new THREE.Vector3();
     const vEnd = new THREE.Vector3();
     const vA = new THREE.Vector3();
     const vB = new THREE.Vector3();
     const vC = new THREE.Vector3();

     if (edgeCount) {
         const edgeSet = new Set();
         let currentEdgeCount = 0;

         if (isIndexed) {
            for (let i = 0; i < indices.length; i += 3) {
                 if (currentEdgeCount > MAX_HELPERS_EDGE_FACE) break; // Performance cap

                for (let j = 0; j < 3; j++) {
                     const startIdx = indices[i + j];
                     const endIdx = indices[i + (j + 1) % 3];

                     // Ensure indices are valid
                     if(startIdx >= posCount || endIdx >= posCount) continue;

                     const edgeKey = startIdx < endIdx ? `${startIdx}_${endIdx}` : `${endIdx}_${startIdx}`;

                    if (!edgeSet.has(edgeKey)) {
                        edgeSet.add(edgeKey);

                        // Get world positions for the edge endpoints
                        vStart.fromBufferAttribute(positions, startIdx).applyMatrix4(matrix);
                        vEnd.fromBufferAttribute(positions, endIdx).applyMatrix4(matrix);

                        const edgeGeom = new THREE.BufferGeometry().setFromPoints([vStart.clone(), vEnd.clone()]);
                        const edgeMat = new THREE.LineBasicMaterial({
                            color: 0xE67E22, // Default Orange
                            linewidth: edgeThickness // Note: linewidth might not work on all platforms/drivers
                        });

                         const edge = new THREE.Line(edgeGeom, edgeMat);
                         edge.userData = { type: 'edge', indices: [startIdx, endIdx] };
                         edgeHelpers.add(edge);
                         currentEdgeCount++;
                    }
                }
            }
         } else {
            // Non-indexed geometry (triangles are p0,p1,p2, p3,p4,p5...)
            for(let i = 0; i < posCount; i+=3) {
                 if (currentEdgeCount > MAX_HELPERS_EDGE_FACE) break;
                 const indices = [i, i+1, i+2];
                 for(let j=0; j<3; j++) {
                     const startIdx = indices[j];
                      const endIdx = indices[(j+1)%3];
                       if (startIdx >= posCount || endIdx >= posCount) continue; // Check bounds

                       const edgeKey = startIdx < endIdx ? `${startIdx}_${endIdx}` : `${endIdx}_${startIdx}`;
                       if (!edgeSet.has(edgeKey)) {
                           edgeSet.add(edgeKey);
                           vStart.fromBufferAttribute(positions, startIdx).applyMatrix4(matrix);
                           vEnd.fromBufferAttribute(positions, endIdx).applyMatrix4(matrix);
                             const edgeGeom = new THREE.BufferGeometry().setFromPoints([vStart.clone(), vEnd.clone()]);
                           const edgeMat = new THREE.LineBasicMaterial({ color: 0xE67E22, linewidth: edgeThickness });
                           const edge = new THREE.Line(edgeGeom, edgeMat);
                            edge.userData = { type: 'edge', indices: [startIdx, endIdx] };
                            edgeHelpers.add(edge);
                            currentEdgeCount++;
                       }
                 }
            }
        }
        console.log(`Generated ${currentEdgeCount} edge helpers.`);
    }

    if (faceCount) {
         let currentFaceCount = 0;
         if (isIndexed) {
            for (let i = 0; i < indices.length; i += 3) {
                 if (currentFaceCount > MAX_HELPERS_EDGE_FACE) break;
                 const idxA = indices[i];
                 const idxB = indices[i + 1];
                 const idxC = indices[i + 2];

                  // Ensure indices are valid
                  if(idxA >= posCount || idxB >= posCount || idxC >= posCount) continue;

                 vA.fromBufferAttribute(positions, idxA).applyMatrix4(matrix);
                 vB.fromBufferAttribute(positions, idxB).applyMatrix4(matrix);
                 vC.fromBufferAttribute(positions, idxC).applyMatrix4(matrix);

                 const faceGeom = new THREE.BufferGeometry().setFromPoints([vA.clone(), vB.clone(), vC.clone()]);
                  faceGeom.setIndex([0, 1, 2]); // Define face for mesh

                 const faceMat = new THREE.MeshBasicMaterial({
                    color: 0x44DD88, // Default Green
                    transparent: true,
                    opacity: faceOpacity,
                    side: THREE.DoubleSide // Show faces from both sides
                 });

                 const faceMesh = new THREE.Mesh(faceGeom, faceMat);
                 faceMesh.userData = {
                    type: 'face',
                    indices: [idxA, idxB, idxC],
                    faceIndex: i / 3
                 };
                 faceHelpers.add(faceMesh);
                  currentFaceCount++;
            }
         } else {
            // Non-indexed geometry
             for (let i = 0; i < posCount; i += 3) {
                   if (currentFaceCount > MAX_HELPERS_EDGE_FACE) break;
                   const idxA = i;
                   const idxB = i + 1;
                   const idxC = i + 2;

                    if (idxA >= posCount || idxB >= posCount || idxC >= posCount) continue;

                   vA.fromBufferAttribute(positions, idxA).applyMatrix4(matrix);
                   vB.fromBufferAttribute(positions, idxB).applyMatrix4(matrix);
                   vC.fromBufferAttribute(positions, idxC).applyMatrix4(matrix);

                   const faceGeom = new THREE.BufferGeometry().setFromPoints([vA.clone(), vB.clone(), vC.clone()]);
                    faceGeom.setIndex([0, 1, 2]);
                   const faceMat = new THREE.MeshBasicMaterial({
                        color: 0x44DD88,
                        transparent: true,
                        opacity: faceOpacity,
                        side: THREE.DoubleSide
                    });
                   const faceMesh = new THREE.Mesh(faceGeom, faceMat);
                   faceMesh.userData = { type: 'face', indices: [idxA, idxB, idxC], faceIndex: i / 3 };
                   faceHelpers.add(faceMesh);
                   currentFaceCount++;
             }
         }
         console.log(`Generated ${currentFaceCount} face helpers.`);
    }

     // Check if any element is currently selected and re-apply its selection highlight
     resetHighlights(); // Call this to re-apply selection colors if needed
}


// Call this after selection updates
// Example: in your select/deselect or draw functions

/**
 * Sets up all event listeners related to the modeling UI and interactions.
 * Should be called once during initialization (e.g., within initModeling).
 * FIXES: Removed redundant listeners, connects all tool buttons.
 */
function setupModelingEventListeners() {
    // Debounced mouse move listener
    renderer.domElement.removeEventListener('click', handleCanvasClick, false); // Remove if previously added
    renderer.domElement.addEventListener('click', handleCanvasClick, false);
    renderer.domElement.removeEventListener('mousemove', handleCanvasMouseMove, false); // Remove if previously added
    renderer.domElement.addEventListener('mousemove', handleCanvasMouseMove, false);
    renderer.domElement.removeEventListener('contextmenu', handleCanvasRightClick, false); // Remove if previously added
    renderer.domElement.addEventListener('contextmenu', handleCanvasRightClick, false);
    
    
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
    
    document.getElementById('tool-spin').addEventListener('click', () => {
       if (!isModelingMode || !activeObject) return;
       initiateSpinTool();
    });

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
     // Add listeners for spline selection dropdowns if/when implemented:
    // document.getElementById('active-profile-select')?.addEventListener('change', handleProfileSelection);
    // document.getElementById('active-path-select')?.addEventListener('change', handlePathSelection);

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
function handleModelingKeyDown(event) {
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

    if (event.key === 'Escape') {
        if (isLoopCutMode) { cancelLoopCut(); event.preventDefault(); }
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
let stairEndPoint = null;
let stairPreviewObject = null; // Can be Line or Group for preview
let stairWidth = 1.0;
let stairTotalHeight = 2.5;
let stairStepHeight = 0.18;
let stairStepDepth = 0.25;
const stairDirectionVector = new THREE.Vector3(); // For stair orientation



/*function initiateLoopCut() {
    cleanupStructureSynthTool(); // If you have the synth tool
    deactivateCurrentArchTool(); // Deactivate other arch tools
    // ... (rest of existing checks: activeObject, indexed geometry, not transforming)

    console.log("Initiating Loop Cut Mode...");
    if (!activeObject || !activeObject.geometry || !activeObject.geometry.index) {
         console.error("Loop cut requires an indexed geometry on the active object.");
         return;
    }
     if (isTransforming) {  return; }
     // if (activeArchTool || splineCreationMode) {  return; } // Already handled by deactivate

    if (selectionMode !== 'edge' && selectionMode !== 'all') { // 'all' for showing all helpers
          setSelectionMode('edge');
          console.log("Switched to Edge selection mode for Loop Cut.");
          // showMeshStructure might be async or have a delay, ensure helpers are ready
          // This is a potential race condition. A callback or promise from showMeshStructure would be better.
          // For now, assume showMeshStructure updates relatively quickly.
    } else if (activeObject) {
          showMeshStructure(activeObject); // Refresh edge helpers if already in edge mode
    }


    isLoopCutMode = true;
    if (controls) controls.enabled = false;
    transformControls.detach();
    clearSelection(); // Clear V/E/F modeling selections
    // updateTransformControlsAttachment(); // Likely not needed if detaching

    renderer.domElement.style.cursor = 'crosshair';

    if (!loopCutPreviewLine) {
        loopCutPreviewLine = new THREE.Line(
            new THREE.BufferGeometry(),
            new THREE.LineBasicMaterial({
                color: LOOP_CUT_PREVIEW_COLOR, // Aqua color
                linewidth: 3, // Note: linewidth > 1 has limitations in WebGL
                depthTest: false,
                depthWrite: false,
                transparent: true, // Optional, if you want it to blend
                opacity: 0.9       // Optional
            })
        );
        loopCutPreviewLine.renderOrder = 999; // Draw on top
        scene.add(loopCutPreviewLine);
    }
    loopCutPreviewLine.visible = false;
    loopCutPreviewLine.userData = {}; // Clear previous data

    // Add temporary listeners specific to loop cut
    // Ensure these are not duplicated if initiateLoopCut is called multiple times
    renderer.domElement.removeEventListener('mousemove', handleLoopCutPreviewInternal); // Remove first
    renderer.domElement.addEventListener('mousemove', handleLoopCutPreviewInternal, false);
    renderer.domElement.removeEventListener('click', handleLoopCutConfirmInternal); // Remove first
    renderer.domElement.addEventListener('click', handleLoopCutConfirmInternal, false);

    alert("Loop Cut: Hover over an edge to preview the loop. Click to cut.");
}*/

function initiateLoopCut() {
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
}


// Internal handler, not to be confused with the global one
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
    raycaster.params.Line.threshold = 0.05; // Adjust for edge helper sensitivity

    // Intersect with edge helpers
    const edgeIntersects = raycaster.intersectObjects(edgeHelpers.children, false);
    const closestEdgeIntersect = findClosestIntersection(edgeIntersects, 'edge');

     if (closestEdgeIntersect) {
        const intersectedEdgeHelper = closestEdgeIntersect.object;
        const startEdgeIndices = intersectedEdgeHelper.userData.indices;

        const geometry = activeObject.geometry; // Geometry in local space
        const positions = geometry.attributes.position; // Local positions

        // --- CRITICAL: Ensure matrixWorld is up-to-date for THIS FRAME ---
        activeObject.updateMatrixWorld(true);
        const currentMatrixWorld = activeObject.matrixWorld.clone(); // Use a clone for this frame's calculations

        const edgeFaceMap = buildEdgeFaceMap(geometry);
        const vertexEdgeMap = buildVertexEdgeMap(geometry);
        const vertexFaceMap = buildVertexFaceMap(geometry);

        if (!edgeFaceMap || !vertexEdgeMap || !vertexFaceMap) {
            loopCutPreviewLine.visible = false;
            loopCutPreviewLine.userData = {};
            return;
        }

        const loopEdgeSegments = findEdgeLoop(geometry, startEdgeIndices, edgeFaceMap, vertexEdgeMap, vertexFaceMap);

        if (loopEdgeSegments && loopEdgeSegments.length > 0) {
            const previewWorldPoints = [];
            const vA_local = new THREE.Vector3();
            const vB_local = new THREE.Vector3();
            const midPoint_local = new THREE.Vector3();

            loopEdgeSegments.forEach(segment => {
                vA_local.fromBufferAttribute(positions, segment[0]);
                vB_local.fromBufferAttribute(positions, segment[1]);
                midPoint_local.lerpVectors(vA_local, vB_local, 0.5); // Midpoint in LOCAL space
                previewWorldPoints.push(midPoint_local.clone().applyMatrix4(currentMatrixWorld)); // Transform to WORLD for preview line
            });

            if (loopEdgeSegments.length > 1) {
                 const firstOriginalVertOfLoop = loopEdgeSegments[0][0];
                 const lastOriginalVertOfLoop = loopEdgeSegments[loopEdgeSegments.length-1][1];
                 if (firstOriginalVertOfLoop === lastOriginalVertOfLoop && previewWorldPoints.length > 1) {
                     previewWorldPoints.push(previewWorldPoints[0].clone());
                 }
            }

            if (previewWorldPoints.length >= 2) {
                loopCutPreviewLine.geometry.dispose();
                loopCutPreviewLine.geometry = new THREE.BufferGeometry().setFromPoints(previewWorldPoints);
                loopCutPreviewLine.material.color.setHex(LOOP_CUT_PREVIEW_COLOR);
                loopCutPreviewLine.visible = true;
                loopCutPreviewLine.userData.hoveredEdgeOriginalIndices = startEdgeIndices;
                loopCutPreviewLine.userData.loopEdgeSegmentsToCut = loopEdgeSegments; // These are pairs of LOCAL indices
            } else {
                loopCutPreviewLine.visible = false;
                loopCutPreviewLine.userData = {};
            }
        } else {
            loopCutPreviewLine.visible = false;
            loopCutPreviewLine.userData = {};
        }
    } else {
        loopCutPreviewLine.visible = false;
        loopCutPreviewLine.userData = {};
    }
}*/



// This function is also fine as is.
function handleLoopCutPreviewInternal(event) {
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

// handleLoopCutConfirmInternal needs to use loopCutPreviewLine.userData.loopEdgeSegmentsToCut
/*async function handleLoopCutConfirmInternal(event) { // Keep async if any sub-function is async
    if (!isLoopCutMode || !activeObject || !loopCutPreviewLine.visible ||
        !loopCutPreviewLine.userData.loopEdgeSegmentsToCut || loopCutPreviewLine.userData.loopEdgeSegmentsToCut.length === 0) {
        // console.log("Loop cut confirm: Invalid state or no preview loop data.");
        return; // Don't cancel mode, just don't cut
    }

    const loopEdgesToCut = loopCutPreviewLine.userData.loopEdgeSegmentsToCut;
    console.log(`%cConfirming Loop Cut for ${loopEdgesToCut.length} edge segments...`, "color: orange; font-weight:bold;");

    // ... (rest of your existing handleLoopCutConfirmInternal logic)
    // Ensure it uses `loopEdgesToCut` which contains arrays like [v1, v2] for each edge in the loop.
    // The rest of the cutting logic (creating new vertices, rebuilding indices) should work with this.
    const currentGeometry = activeObject.geometry;
    if (!currentGeometry || !currentGeometry.index || !currentGeometry.attributes.position || !currentGeometry.attributes.normal || !currentGeometry.attributes.uv) {
        console.error("Loop cut requires indexed geometry with position, normal, and uv attributes.");
        cancelLoopCut();
        return;
    }

    const edgeFaceMap = buildEdgeFaceMap(currentGeometry); // Rebuild or ensure it's fresh
    if (!edgeFaceMap) {
        console.error("Loop Cut: Failed to build edgeFaceMap for confirm.");
        cancelLoopCut();
        return;
    }

    const positions = currentGeometry.attributes.position;
    const normals = currentGeometry.attributes.normal;
    const uvs = currentGeometry.attributes.uv;
    const originalIndicesArray = currentGeometry.index.array.slice(); // Clone for reference
    const originalVertexCount = positions.count;

    const newMidpointVerticesData = new Map(); // Map<edgeKey, {newIndex, position, normal, uv}>
    let nextNewVertexIndex = originalVertexCount;
    const posA = new THREE.Vector3(), posB = new THREE.Vector3();
    const normA = new THREE.Vector3(), normB = new THREE.Vector3();
    const uvA = new THREE.Vector2(), uvB = new THREE.Vector2();

    for (const edgeSegment of loopEdgesToCut) { // edgeSegment is [v_idx1, v_idx2]
        const u = edgeSegment[0];
        const v = edgeSegment[1];
        const edgeKey = getEdgeKey(u, v);

        if (newMidpointVerticesData.has(edgeKey)) continue; // Already processed this edge

        posA.fromBufferAttribute(positions, u); posB.fromBufferAttribute(positions, v);
        normA.fromBufferAttribute(normals, u); normB.fromBufferAttribute(normals, v);
        uvA.fromBufferAttribute(uvs, u); uvB.fromBufferAttribute(uvs, v);

        const newPos = new THREE.Vector3().lerpVectors(posA, posB, 0.5); // Midpoint in local space
        const newNorm = new THREE.Vector3().lerpVectors(normA, normB, 0.5).normalize();
        const newUV = new THREE.Vector2().lerpVectors(uvA, uvB, 0.5);
        const newIndex = nextNewVertexIndex++;

        const newPos_local = new THREE.Vector3().lerpVectors(posA, posB, 0.5);
        const newPos_world_for_debug = newPos_local.clone().applyMatrix4(activeObject.matrixWorld);
        console.log(`LoopCut Confirm: Edge ${edgeKey}, Local Mid:`, newPos_local.toArray(), `Est. World Mid:`, newPos_world_for_debug.toArray());


        newMidpointVerticesData.set(edgeKey, { newIndex, position: newPos, normal: newNorm, uv: newUV });
    }

    const numNewVertices = newMidpointVerticesData.size;
    if (numNewVertices === 0) {
        console.warn("Loop cut confirm: No new vertices were generated (empty or invalid loop?).");
        cancelLoopCut(); return;
    }
    const finalVertexCount = originalVertexCount + numNewVertices;

    // Create new attribute arrays
    const newPositionsArray = new Float32Array(finalVertexCount * 3);
    const newNormalsArray = normals ? new Float32Array(finalVertexCount * 3) : null; // Check if normals exist
    const newUVsArray = uvs ? new Float32Array(finalVertexCount * 2) : null;       // Check if uvs exist

    newPositionsArray.set(positions.array);
    if (normals) newNormalsArray.set(normals.array);
    if (uvs) newUVsArray.set(uvs.array);

    newMidpointVerticesData.forEach(data => {
        newPositionsArray.set(data.position.toArray(), data.newIndex * 3);
        if (newNormalsArray) newNormalsArray.set(data.normal.toArray(), data.newIndex * 3);
        if (newUVsArray) newUVsArray.set(data.uv.toArray(), data.newIndex * 2);
    });

    // Rebuild index buffer
    const finalNewIndices = [];
    const facesAlreadySplit = new Set();

    for (const edgeSegment of loopEdgesToCut) {
        const u_orig = edgeSegment[0];
        const v_orig = edgeSegment[1];
        const edgeKey = getEdgeKey(u_orig, v_orig);
        const midpointData = newMidpointVerticesData.get(edgeKey);

        if (!midpointData) {
            console.error(`Loop Cut Internal Error: Midpoint data missing for edge ${edgeKey} during confirm.`);
            continue;
        }
        const m_new_idx = midpointData.newIndex;

        const adjacentFaceIndices = edgeFaceMap.get(edgeKey) || [];

        for (const faceIndex of adjacentFaceIndices) {
            if (facesAlreadySplit.has(faceIndex)) continue;

            const faceV = [originalIndicesArray[faceIndex*3], originalIndicesArray[faceIndex*3+1], originalIndicesArray[faceIndex*3+2]];
            let p_orig = -1; // The third vertex of the original triangle
            for(const v_idx of faceV) {
                if (v_idx !== u_orig && v_idx !== v_orig) {
                    p_orig = v_idx;
                    break;
                }
            }
            if (p_orig === -1) {
                 console.warn(`Loop Cut: Could not find third vertex for face ${faceIndex} on edge ${edgeKey}. Skipping split for this face.`);
                 continue;
            }

            // Check if the other two edges of this face are also being cut
            const edge_vp_key = getEdgeKey(v_orig, p_orig);
            const edge_pu_key = getEdgeKey(p_orig, u_orig);

            const m_vp_data = newMidpointVerticesData.get(edge_vp_key);
            const m_pu_data = newMidpointVerticesData.get(edge_pu_key);

            // Re-triangulate the face (u_orig, v_orig, p_orig)
            // This logic assumes triangles. For quads, it's more complex.
            if (m_vp_data && m_pu_data) { // All 3 edges of the triangle are cut
                const m_vp_idx = m_vp_data.newIndex;
                const m_pu_idx = m_pu_data.newIndex;
                // Original triangle split into 4 new triangles
                finalNewIndices.push(u_orig, m_new_idx, m_pu_idx);
                finalNewIndices.push(m_new_idx, v_orig, m_vp_idx);
                finalNewIndices.push(m_pu_idx, m_vp_idx, p_orig);
                finalNewIndices.push(m_new_idx, m_vp_idx, m_pu_idx); // Center one
            } else if (m_vp_data) { // Edges (u,v) and (v,p) are cut
                const m_vp_idx = m_vp_data.newIndex;
                // Original triangle split into 3
                finalNewIndices.push(u_orig, m_new_idx, p_orig);
                finalNewIndices.push(m_new_idx, m_vp_idx, p_orig); // Check winding
                finalNewIndices.push(m_new_idx, v_orig, m_vp_idx);
            } else if (m_pu_data) { // Edges (u,v) and (p,u) are cut
                const m_pu_idx = m_pu_data.newIndex;
                // Original triangle split into 3
                finalNewIndices.push(m_new_idx, v_orig, p_orig);
                finalNewIndices.push(m_pu_idx, m_new_idx, p_orig); // Check winding
                finalNewIndices.push(u_orig, m_pu_idx, m_new_idx);
            } else { // Only edge (u,v) is cut
                // Original triangle split into 2 new triangles
                // Ensure correct winding based on original face: (u,v,p) -> (u,m,p) and (m,v,p)
                // Find original order
                let u_idx_in_face = -1, v_idx_in_face = -1;
                for(let k=0; k<3; ++k) {
                    if(faceV[k] === u_orig) u_idx_in_face = k;
                    if(faceV[k] === v_orig) v_idx_in_face = k;
                }

                if (u_idx_in_face !== -1 && v_idx_in_face !== -1) {
                    if ((u_idx_in_face + 1) % 3 === v_idx_in_face) { // u, v, p order
                        finalNewIndices.push(u_orig, m_new_idx, p_orig);
                        finalNewIndices.push(m_new_idx, v_orig, p_orig);
                    } else { // u, p, v order (or v, u, p)
                        finalNewIndices.push(u_orig, p_orig, m_new_idx); // Winding might need more checks
                        finalNewIndices.push(m_new_idx, p_orig, v_orig);
                    }
                } else {
                     console.warn("Loop cut: Could not determine winding for face split", faceIndex);
                     // Fallback, less reliable winding
                     finalNewIndices.push(u_orig, m_new_idx, p_orig);
                     finalNewIndices.push(m_new_idx, v_orig, p_orig);
                }
            }
            facesAlreadySplit.add(faceIndex);
        }
    }

    // Copy original faces that were NOT split by any cut edge
    const originalFaceCount = originalIndicesArray.length / 3;
    for (let i = 0; i < originalFaceCount; i++) {
        if (!facesAlreadySplit.has(i)) {
            finalNewIndices.push(originalIndicesArray[i * 3], originalIndicesArray[i * 3 + 1], originalIndicesArray[i * 3 + 2]);
        }
    }


    // Apply New Geometry
    const newGeometry = new THREE.BufferGeometry();
    newGeometry.setAttribute('position', new THREE.BufferAttribute(newPositionsArray, 3));
    if (newNormalsArray) newGeometry.setAttribute('normal', new THREE.BufferAttribute(newNormalsArray, 3));
    if (newUVsArray) newGeometry.setAttribute('uv', new THREE.BufferAttribute(newUVsArray, 2));

    if (finalNewIndices.length > 0) {
        newGeometry.setIndex(finalNewIndices);
    } else {
        console.warn("Loop Cut: Resulted in zero indices. This should not happen if cuts were made.");
        // Potentially revert or show error
        cancelLoopCut();
        return;
    }

    try {
        newGeometry.computeVertexNormals();
    } catch (e) {
        console.error("Loop Cut: Error computing normals for new geometry", e);
    }
    newGeometry.computeBoundingBox();
    newGeometry.computeBoundingSphere();

    const oldGeometry = activeObject.geometry;
    activeObject.geometry = newGeometry;
    if (oldGeometry && oldGeometry !== newGeometry) { // Ensure it's a different object before disposing
         oldGeometry.dispose();
    }
    console.log("Loop Cut: New geometry assigned.");

    if (baseGeometries.has(activeObject.uuid)) {
        console.log("Loop Cut: Updating base geometry.");
        const oldBase = baseGeometries.get(activeObject.uuid);
        if (oldBase) oldBase.dispose();
        baseGeometries.set(activeObject.uuid, newGeometry.clone());
        if (document.getElementById('subdivisionLevelsSlider')) {
            document.getElementById('subdivisionLevelsSlider').value = 0;
        }
    }

    console.log("Loop Cut applied successfully.");
    cleanupLoopCutMode();
    showMeshStructure(activeObject); // Update helpers to reflect the new geometry
}*/

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
}



// ... (Keep existing global variables like helperUpdateTimeout, lastHelperUpdateTime, etc.) ...

/*function cancelLoopCut() {
    console.log("Cancelling Loop Cut.");
    cleanupLoopCutMode();
}*/

function cancelLoopCut() {
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
        loopCutPreviewLine.userData = {}; // Clear data
    }
    if (controls && !isLocked && !activeArchTool && !splineCreationMode) { // Check other tool states
         controls.enabled = true; 
    }

    if (renderer && renderer.domElement) {
         renderer.domElement.style.cursor = 'default'; 
     } else {
        document.body.style.cursor = 'default'; 
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
            const baseColor = new THREE.Color(0x000000);

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

function createOptimizedEdgeHelpers(visibleVertices, positions, matrix, edgeThickness) {
    if (selectionMode !== 'edge' && selectionMode !== 'all') return;
    console.time("OptimizedEdgeHelpers");

    const visibleVertexIndices = new Set(visibleVertices.map(v => v.index));
    if (visibleVertexIndices.size === 0) { // Skip if no vertices are visible
         console.timeEnd("OptimizedEdgeHelpers");
         return;
    }

    const indices = activeObject.geometry.index.array;
    const edgeMap = new Map();
     const posCount = positions.count;
     const MAX_OPT_EDGES = MAX_HELPERS; // Cap edge count

    // Iterate through faces to find edges involving visible vertices
    for (let i = 0; i < indices.length; i += 3) {
        if(edgeMap.size > MAX_OPT_EDGES) break;

        let faceHasVisibleVertex = false;
        const faceIndices = [indices[i], indices[i + 1], indices[i + 2]];
        if (faceIndices[0] >= posCount || faceIndices[1] >= posCount || faceIndices[2] >= posCount) continue; // Bounds check

        if(visibleVertexIndices.has(faceIndices[0]) || visibleVertexIndices.has(faceIndices[1]) || visibleVertexIndices.has(faceIndices[2])){
           faceHasVisibleVertex = true;
        }

        if(faceHasVisibleVertex) {
             for (let j = 0; j < 3; j++) {
                const startIdx = faceIndices[j];
                const endIdx = faceIndices[(j + 1) % 3];

                const edgeKey = startIdx < endIdx ? `${startIdx}_${endIdx}` : `${endIdx}_${startIdx}`;
                if (!edgeMap.has(edgeKey)) {
                     edgeMap.set(edgeKey, { indices: [startIdx, endIdx] });
                 }
            }
        }
    }

    // Create Line objects for the collected edges
     const vStart = new THREE.Vector3();
     const vEnd = new THREE.Vector3();
    edgeMap.forEach((data) => {
         vStart.fromBufferAttribute(positions, data.indices[0]).applyMatrix4(matrix);
         vEnd.fromBufferAttribute(positions, data.indices[1]).applyMatrix4(matrix);

        const edgeGeom = new THREE.BufferGeometry().setFromPoints([vStart.clone(), vEnd.clone()]);
        const edgeMat = new THREE.LineBasicMaterial({ color: 0xE67E22, linewidth: edgeThickness });
        const edge = new THREE.Line(edgeGeom, edgeMat);
        edge.userData = { type: 'edge', indices: data.indices };
        edgeHelpers.add(edge);
    });
     console.log(`Generated ${edgeMap.size} optimized edge helpers.`);
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

// Ensure init is called on load
window.addEventListener('load', init);







