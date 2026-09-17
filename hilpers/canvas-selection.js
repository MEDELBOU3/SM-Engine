// Global variables for selection functionality
let selectionEnabled = false;
let isSelecting = false;
let selectionStartX = 0;
let selectionStartY = 0;
let selectionCanvas = document.getElementById('selectionCanvas');
let selectionContext = selectionCanvas.getContext('2d');
let selectedObjectsFromBox = [];

function isTerrainWorkspaceObject(object) {
    const activeMode = String(
        window.workspaceManager?.currentMode ||
        localStorage.getItem('sm_workspace_mode') ||
        'FILM'
    ).toUpperCase();
    if (activeMode === 'TERRAIN') return false;
    let current = object;
    while (current) {
        const data = current.userData || {};
        const name = String(current.name || '').trim();
        if (
            current === window.terrain ||
            data.isTerrain === true ||
            data.isTerrainMesh === true ||
            data.isTerrainComponent === true ||
            data.workspaceOnly === 'TERRAIN' ||
            name === 'Terrain' ||
            name === 'Terrain_Mesh' ||
            name.startsWith('Terrain_')
        ) {
            return true;
        }
        current = current.parent;
    }
    return false;
}

// Setup the event listeners for box selection
function setupSelectionEvents() {
    const rendererContainer = document.getElementById('renderer-container');

    rendererContainer.addEventListener('mousedown', (event) => {
        if (!selectionEnabled || event.button !== 0) return; // Only left mouse button

        // Prevent orbit controls from interfering with selection
        if (controls && selectionEnabled) {
            controls.enabled = false;
        }

        isSelecting = true;

        // Get the position relative to the renderer container
        const rect = rendererContainer.getBoundingClientRect();
        selectionStartX = event.clientX - rect.left;
        selectionStartY = event.clientY - rect.top;

        // Clear any previous selection box
        selectionContext.clearRect(0, 0, selectionCanvas.width, selectionCanvas.height);
    });

    document.addEventListener('mousemove', (event) => {
        if (!isSelecting) return;

        const rect = rendererContainer.getBoundingClientRect();
        const currentX = event.clientX - rect.left;
        const currentY = event.clientY - rect.top;

        // Clear the canvas and draw the new selection box
        selectionContext.clearRect(0, 0, selectionCanvas.width, selectionCanvas.height);

        // Draw selection rectangle
        selectionContext.strokeStyle = '#4285F4'; // Google blue
        selectionContext.lineWidth = 2;
        selectionContext.strokeRect(
            selectionStartX,
            selectionStartY,
            currentX - selectionStartX,
            currentY - selectionStartY
        );

        // Semi-transparent fill
        selectionContext.fillStyle = 'rgba(66, 133, 244, 0.1)'; // Translucent blue
        selectionContext.fillRect(
            selectionStartX,
            selectionStartY,
            currentX - selectionStartX,
            currentY - selectionStartY
        );
    });

    document.addEventListener('mouseup', (event) => {
        if (!isSelecting) return;

        isSelecting = false;

        // Re-enable orbit controls
        if (controls) {
            controls.enabled = true;
        }

        if (typeof isModelingMode !== 'undefined' && isModelingMode) {
            isSelecting = false;
            if(selectionContext) selectionContext.clearRect(0, 0, selectionCanvas.width, selectionCanvas.height);
            return; 
        }
        // Get the end position
        const rect = rendererContainer.getBoundingClientRect();
        const endX = event.clientX - rect.left;
        const endY = event.clientY - rect.top;

        // Perform the actual selection of objects
        performBoxSelection(
            selectionStartX,
            selectionStartY,
            endX,
            endY
        );

        // Clear the selection box
        setTimeout(() => {
            selectionContext.clearRect(0, 0, selectionCanvas.width, selectionCanvas.height);
        }, 100); // Small delay to give visual feedback
    });
}

// Function to perform the actual selection of objects
function performBoxSelection(startX, startY, endX, endY) {
    // Convert to normalized device coordinates (-1 to +1)
    const rendererContainer = document.getElementById('renderer-container');
    const rect = rendererContainer.getBoundingClientRect();

    // Selection box corners in normalized coordinates
    const x1 = ((startX) / rect.width) * 2 - 1;
    const y1 = -((startY) / rect.height) * 2 + 1; // Flip Y
    const x2 = ((endX) / rect.width) * 2 - 1;
    const y2 = -((endY) / rect.height) * 2 + 1; // Flip Y

    // Ensure proper ordering of corners (min/max)
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);

    // Clear previous selection
    selectedObjectsFromBox = [];

    // Find all objects that are selectable
    const selectableObjects = [];
    scene.traverse((object) => {
        // Skip non-mesh objects, grid, helpers, etc.
        if (!object.isMesh || 
            object.name === 'advancedGrid' || 
            object.name.includes('Helper') ||
            object.parent?.name?.includes('Helper') ||
            isTerrainWorkspaceObject(object)) {
            return;
        }
        
        selectableObjects.push(object);
    });

    

    // Check each object if it's within the selection box
    selectableObjects.forEach((object) => {
        // Project the object's position to screen space
        const objectWorldPos = new THREE.Vector3();
        object.getWorldPosition(objectWorldPos);

        // Convert to screen coordinates
        const objectScreenPos = objectWorldPos.clone().project(camera);

        // Check if object is within the selection box
        if (objectScreenPos.x >= minX && objectScreenPos.x <= maxX &&
            objectScreenPos.y >= minY && objectScreenPos.y <= maxY) {
            selectedObjectsFromBox.push(object);
        }
    });

    // If no objects selected, deselect current selection
    if (selectedObjectsFromBox.length === 0) {
        if (selectedObject) {
            selectObject(null);
        }
        return;
    }

    // ✅ FIX: If in modeling mode, use modeling selection system instead of object selection
    if (typeof isModelingMode !== 'undefined' && isModelingMode) {
        console.log("Box selection in modeling mode - routing to modeling selection system");
        return;
    }

    // If only one object selected, use the regular selection
    if (selectedObjectsFromBox.length === 1) {
        selectObject(selectedObjectsFromBox[0]);
        return;
    }

    // Multiple objects selected
    console.log(`Selected ${selectedObjectsFromBox.length} objects`);

    // Apply visual highlight to all selected objects
    /*selectedObjectsFromBox.forEach(obj => {
        applySelectionHighlight(obj, COLORS.SELECTED, 0.6);
    });*/

    // Select the first object as the "active" object for transform controls
    selectObject(selectedObjectsFromBox[0]);
}



// Integration Helpers for Selection Feature
function setupSelectionKeyboardShortcuts() {
    document.addEventListener('keydown', (event) => {
        // 'B' key toggles box selection mode (common in 3D editors)
        if (event.key === 'b' && !event.ctrlKey && !event.metaKey) {
            toggleSelectionMode();
        }

        // Escape key to cancel current selection
        if (event.key === 'Escape' && isSelecting) {
            isSelecting = false;
            selectionContext.clearRect(0, 0, selectionCanvas.width, selectionCanvas.height);

            // Re-enable orbit controls
            if (controls) {
                controls.enabled = true;
            }
        }

        // Shift+A or Ctrl+A to select all visible objects
        if ((event.key === 'a' && (event.ctrlKey || event.shiftKey)) && !event.altKey) {
            event.preventDefault(); // Prevent browser's select all
            selectAllObjects();
        }

        // Delete or Backspace to delete selected objects
        if ((event.key === 'Delete' || event.key === 'Backspace') &&
            selectedObjectsFromBox &&
            selectedObjectsFromBox.length > 0) {
            event.preventDefault();
            deleteSelectedObjects();
        }
    });
}

// Function to select all visible and selectable objects
function selectAllObjects() {
    selectedObjectsFromBox = [];

    scene.traverse((object) => {
        // Skip non-mesh objects, grid, helpers, etc.
        if (!object.isMesh ||
            object.name === 'advancedGrid' ||
            object.name.includes('Helper') ||
            object.parent?.name?.includes('Helper') ||
            isTerrainWorkspaceObject(object) ||
            !object.visible) {
            return;
        }

        selectedObjectsFromBox.push(object);
    });

    if (selectedObjectsFromBox.length > 0) {
        console.log(`Selected all objects: ${selectedObjectsFromBox.length} items`);

        // Apply visual highlight to all selected objects
        /*selectedObjectsFromBox.forEach(obj => {
            applySelectionHighlight(obj, COLORS.SELECTED, 0.6);
        });*/

        // Select the first object as the "active" object for transform controls
        selectObject(selectedObjectsFromBox[0]);
    }
}




/**
 * Deletes the currently active object from the scene.
 * This function handles cleanup for modeling mode, architectural elements,
 * and associated helper data.
 */


function deleteSelectedObjects() {
    if (!selectedObjectsFromBox || selectedObjectsFromBox.length === 0) return;

    // Confirm deletion if there are multiple objects
    if (selectedObjectsFromBox.length > 1) {
        if (!confirm(`Delete ${selectedObjectsFromBox.length} selected objects?`)) {
            return;
        }
    }


    // Store objects to delete to avoid modifying while iterating
    const objectsToDelete = [...selectedObjectsFromBox];

    // Remove objects from scene
    objectsToDelete.forEach(obj => {
        scene.remove(obj);

        // If the object has a dispose method (materials, geometries), call it
        if (obj.geometry && obj.geometry.dispose) {
            obj.geometry.dispose();
        }

        if (obj.material) {
            if (Array.isArray(obj.material)) {
                obj.material.forEach(material => {
                    if (material.dispose) material.dispose();
                });
            } else if (obj.material.dispose) {
                obj.material.dispose();
            }
        }
    });

    // Clear selection
    transformControls.detach();
    selectedObject = null;
    selectedObjectsFromBox = [];

    // Update UI
    updateInspector();
    updateHierarchySelection();

    console.log(`Deleted ${objectsToDelete.length} objects`);
}

/**
 * Deletes selected vertices from the active object's geometry.
 * This is a destructive operation that rebuilds the geometry.
 * All faces connected to a deleted vertex will be removed.
 */
function deleteSelectedVertex() {
    if (!activeObject || selectedElements.length === 0 || selectionMode !== 'vertex') {
        alert("Please select one or more vertices to delete.");
        return;
    }

    if (!confirm(`Are you sure you want to delete ${selectedElements.length} selected vertex/vertices? This will also remove connected faces.`)) {
        return;
    }

    const geometry = activeObject.geometry;
    if (!geometry.index || !geometry.attributes.position || !geometry.attributes.normal || !geometry.attributes.uv) {
        alert("Deletion requires indexed geometry with position, normal, and UV attributes.");
        return;
    }

    const oldGeometry = geometry.clone(); // For undo history

    const positions = geometry.attributes.position;
    const normals = geometry.attributes.normal;
    const uvs = geometry.attributes.uv;
    const originalIndices = geometry.index.array;
    const originalVertexCount = positions.count;

    const verticesToDelete = new Set(selectedElements.map(p => p.userData.vertexIndex));
    console.log(`Deleting ${verticesToDelete.size} vertices...`);

    // --- Create new attribute arrays ---
    const newPositions = [];
    const newNormals = [];
    const newUVs = [];
    const oldToNewIndexMap = new Array(originalVertexCount).fill(-1); // Maps old index to new index
    let newIndexCounter = 0;

    for (let i = 0; i < originalVertexCount; i++) {
        if (!verticesToDelete.has(i)) {
            // Keep this vertex
            oldToNewIndexMap[i] = newIndexCounter;

            positions.setXYZ(i, positions.getX(i), positions.getY(i), positions.getZ(i));
            newPositions.push(positions.getX(i), positions.getY(i), positions.getZ(i));

            if (normals) {
                normals.setXYZ(i, normals.getX(i), normals.getY(i), normals.getZ(i));
                newNormals.push(normals.getX(i), normals.getY(i), normals.getZ(i));
            }
            if (uvs) {
                uvs.setXY(i, uvs.getX(i), uvs.getY(i));
                newUVs.push(uvs.getX(i), uvs.getY(i));
            }
            newIndexCounter++;
        }
    }

    // --- Rebuild index buffer ---
    const newIndices = [];
    const originalFaceCount = originalIndices.length / 3;

    for (let i = 0; i < originalFaceCount; i++) {
        const v0_orig = originalIndices[i * 3 + 0];
        const v1_orig = originalIndices[i * 3 + 1];
        const v2_orig = originalIndices[i * 3 + 2];

        // Check if any vertex of this face is marked for deletion
        const isFaceDeleted = verticesToDelete.has(v0_orig) ||
            verticesToDelete.has(v1_orig) ||
            verticesToDelete.has(v2_orig);

        if (!isFaceDeleted) {
            // If no vertex of the face is deleted, remap its indices
            const v0_new = oldToNewIndexMap[v0_orig];
            const v1_new = oldToNewIndexMap[v1_orig];
            const v2_new = oldToNewIndexMap[v2_orig];

            // Ensure the remapped indices are valid (should be if not deleted)
            if (v0_new !== -1 && v1_new !== -1 && v2_new !== -1) {
                newIndices.push(v0_new, v1_new, v2_new);
            }
        }
    }

    // --- Apply new geometry ---
    const newGeometry = new THREE.BufferGeometry();
    newGeometry.setAttribute('position', new THREE.Float32BufferAttribute(newPositions, 3));
    if (normals) newGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(newNormals, 3));
    if (uvs) newGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(newUVs, 2));
    newGeometry.setIndex(newIndices);

    // Replace old geometry
    activeObject.geometry.dispose();
    activeObject.geometry = newGeometry;

    // Post-processing
    activeObject.geometry.computeVertexNormals();
    activeObject.geometry.computeBoundingBox();
    activeObject.geometry.computeBoundingSphere();

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
    //showMeshStructure(activeObject);
    UnifiedModelingSystem.rebuildAllHelpers();

    console.log(`Successfully deleted ${verticesToDelete.size} vertices and their connected faces.`);
}

// Function to add to your init or setupEventListeners functions
function setupMultiSelectionHandling() {
    // Make transform controls affect all selected objects
    transformControls.addEventListener('objectChange', () => {
        if (selectedObjectsFromBox && selectedObjectsFromBox.length > 1 && selectedObject) {
            // Get the delta transformation from the active object
            const activeMatrix = selectedObject.matrix.clone();
            const activePrevMatrix = selectedObject.userData.prevMatrix
                ? selectedObject.userData.prevMatrix.clone()
                : new THREE.Matrix4();

            // Calculate the transformation delta
            const deltaMatrix = new THREE.Matrix4().copy(activeMatrix).multiply(
                new THREE.Matrix4().copy(activePrevMatrix).invert()
            );

            // Apply the same transformation to all other selected objects
            selectedObjectsFromBox.forEach(obj => {
                if (obj !== selectedObject) {
                    // Apply the delta transformation
                    obj.applyMatrix4(deltaMatrix);
                    obj.updateMatrix();
                }
            });

            // Store current matrix for next delta calculation
            selectedObjectsFromBox.forEach(obj => {
                obj.userData.prevMatrix = obj.matrix.clone();
            });
        }
    });

    // Update previous matrix when transform starts
    transformControls.addEventListener('mouseDown', () => {
        if (selectedObjectsFromBox && selectedObjectsFromBox.length > 0) {
            selectedObjectsFromBox.forEach(obj => {
                obj.userData.prevMatrix = obj.matrix.clone();
            });
        }
    });

    // Add selection keyboard shortcuts
    setupSelectionKeyboardShortcuts();
}

let multiSelectionProxy = new THREE.Object3D();
multiSelectionProxy.name = "MultiSelectionProxy";
let isMultiSelecting = false;


let transformPivot = null; // Keep a reference globally

function getSelectionPosition(sel) {
    if (!sel || !sel.userData || !activeObject) return null;

    const geom = activeObject.geometry;
    const posAttr = geom.attributes.position;
    const matrix = activeObject.matrixWorld;

    if (sel.userData.type === "vertex") {
        return new THREE.Vector3()
            .fromBufferAttribute(posAttr, sel.userData.vertexIndex)
            .applyMatrix4(matrix);
    }

    if (sel.userData.type === "edge") {
        const [a, b] = sel.userData.indices;
        const vA = new THREE.Vector3().fromBufferAttribute(posAttr, a);
        const vB = new THREE.Vector3().fromBufferAttribute(posAttr, b);
        return vA.add(vB).multiplyScalar(0.5).applyMatrix4(matrix);
    }

    if (sel.userData.type === "face") {
        const indices = sel.userData.indices;
        const center = new THREE.Vector3();
        indices.forEach(idx => {
            const v = new THREE.Vector3().fromBufferAttribute(posAttr, idx);
            center.add(v);
        });
        return center.divideScalar(indices.length).applyMatrix4(matrix);
    }

    return null;
}


