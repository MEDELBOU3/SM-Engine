// Global variables for selection functionality
let selectionEnabled = false;
let isSelecting = false;
let selectionStartX = 0;
let selectionStartY = 0;
let selectionCanvas = document.getElementById('selectionCanvas');
let selectionContext = selectionCanvas.getContext('2d');
let selectedObjectsFromBox = [];

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
            object.parent?.name?.includes('Helper')) {
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

/**
 * // Utility to apply selection highlight to an object
function applySelectionHighlight(object, color, opacity) {
    // Skip if the object doesn't exist
    if (!object) return;
    
    // Store original material if not already stored
    if (!object.userData.originalMaterial) {
        if (Array.isArray(object.material)) {
            object.userData.originalMaterial = object.material.map(m => m.clone());
        } else if (object.material) {
            object.userData.originalMaterial = object.material.clone();
        }
    }
    
    // Apply emissive color to indicate selection
    if (Array.isArray(object.material)) {
        object.material.forEach(mat => {
            if (mat.emissive) {
                mat.emissive.set(color);
                mat.emissiveIntensity = opacity;
            }
        });
    } else if (object.material && object.material.emissive) {
        object.material.emissive.set(color);
        object.material.emissiveIntensity = opacity;
    }
}
 */



// Integration Helpers for Selection Feature

// Add these keyboard shortcuts to your existing keydown event listeners
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

// Function to delete all selected objects
/*
function deleteSelectedObject() {
    if (!activeObject) {
        alert("No object selected to delete.");
        return;
    }

    if (!confirm(`Are you sure you want to delete "${activeObject.name || activeObject.uuid}"?`)) {
        return;
    }

    console.log(`Deleting active object: ${activeObject.name || activeObject.uuid}`);

    const objectToDelete = activeObject;
    const objectUUID = objectToDelete.uuid;

    // --- NEW: Handle Parametric Object Deletion ---
    if (objectToDelete.userData.isParametric && (objectToDelete.userData.parametricType === 'parametricDoor' || objectToDelete.userData.parametricType === 'parametricWindow')) {
        const params = parametricObjects.get(objectUUID)?.params;
        if (params && params.parentWallUUID) {
            const parentWall = scene.getObjectByProperty('uuid', params.parentWallUUID);
            if (parentWall && parentWall.userData.isParametric && parentWall.userData.parametricType === 'parametricWall') {
                const wallParams = parametricObjects.get(parentWall.uuid)?.params;
                if (wallParams && wallParams.openings) {
                    // Remove this opening from the wall's list
                    wallParams.openings = wallParams.openings.filter(op => op.id !== objectUUID);
                    // Trigger regeneration of the parent wall
                    regenerateParametricObject(parentWall);
                    console.log(`Removed opening from parent wall ${parentWall.name || parentWall.uuid}`);
                }
            }
        }
    }
    // --- END NEW ---

    // Record deletion action *before* the object is removed
    if (window.historyManager) {
        window.historyManager.recordObjectDeleted(objectToDelete, objectToDelete.parent);
    }

    // 1. Clear modeling selection and detach transform controls
    clearSelection();
    transformControls.detach();

    // 2. Remove from scene
    scene.remove(objectToDelete);

    // 3. Dispose of geometry and material (HistoryManager now handles this if recorded)
    // If not recorded, dispose manually:
    if (!window.historyManager) { // Only dispose manually if no history is tracking it
        objectToDelete.traverse(child => {
            if (child.isMesh) {
                child.geometry?.dispose();
                if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
                else child.material?.dispose();
            }
        });
    }


    // 4. Clean up modeling-specific data maps
    if (baseGeometries.has(objectUUID)) { baseGeometries.delete(objectUUID); }
    if (modifierStacks.has(objectUUID)) { modifierStacks.delete(objectUUID); }
    if (parametricObjects.has(objectUUID)) { parametricObjects.delete(objectUUID); } // NEW: Remove from parametricObjects map

    // 5. Clean up architectural element data if it was one
    const archIndex = architecturalElements.indexOf(objectToDelete);
    if (archIndex > -1) {
        architecturalElements.splice(archIndex, 1);
        deselectAllArchElements();
    }

    // 6. Reset activeObject and clear modeling helpers
    activeObject = null;
    clearMeshStructure();

    // 7. Update UI elements
    if (window.updateModifierPanelVisibility) { updateModifierPanelVisibility(); }
    if (window.updateMaterialEditorUI) { window.updateMaterialEditorUI(); } // NEW: Refresh material editor
    if (window.updateHierarchy) { window.updateHierarchy(); } // NEW: Refresh scene graph UI

    console.log(`Object "${objectToDelete.name || objectToDelete.uuid}" deleted successfully.`);
}
*/



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
    showMeshStructure(activeObject);

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

/**
 * Updates the TransformControls gizmo to attach to the correct target
 * based on the number of selected elements.
 *
function updateTransformControlsAttachment() {
    transformControls.detach();
    if (multiSelectionProxy.parent) scene.remove(multiSelectionProxy);

    selectedElements.forEach(proxy => {
        if (proxy.parent) proxy.parent.remove(proxy);
    });

    if (selectedElements.length === 1) {
        isMultiSelecting = false;
        const singleProxy = selectedElements[0];
        scene.add(singleProxy);
        transformControls.attach(singleProxy);
        console.log("Gizmo attached to single proxy.");
    } else if (selectedElements.length > 1) {
        isMultiSelecting = true;
        
        const center = new THREE.Vector3();
        selectedElements.forEach(proxy => center.add(proxy.position));
        center.divideScalar(selectedElements.length);

        multiSelectionProxy.position.copy(center);
        multiSelectionProxy.rotation.set(0, 0, 0);
        multiSelectionProxy.scale.set(1, 1, 1);
        scene.add(multiSelectionProxy);
        transformControls.attach(multiSelectionProxy);
        console.log("Gizmo attached to multi-selection proxy.");
    } else {
        isMultiSelecting = false;
        console.log("No selection, gizmo detached.");
    }
}*/ 

/**
 * Attaches TransformControls to the appropriate object based on current selection:
 * - If no elements selected, detaches controls.
 * - If one element selected, attaches controls to that element's proxy.
 * - If multiple elements selected, attaches controls to the shared `selectionPivot`.
 */
function updateTransformControlsAttachment() {
    if (!transformControls) return;

    if (!selectionPivot) { // Ensure selectionPivot exists globally and is in scene
        selectionPivot = new THREE.Object3D();
        selectionPivot.name = "SelectionPivot";
        scene.add(selectionPivot);
    }
    selectionPivot.visible = false; // Always hide by default, show if attached

    if (selectedElements.length === 0) {
        transformControls.detach();
    } else if (selectedElements.length === 1) {
        const soleProxy = selectedElements[0];
        transformControls.attach(soleProxy);
    } else { // Multiple elements selected
        // Calculate the center of the selected elements
        const center = new THREE.Vector3();
        let count = 0;
        const tempWorldPos = new THREE.Vector3();
        selectedElements.forEach(proxy => {
            // Get current world position of the proxy (which itself follows underlying geometry)
            // Or, more accurately, the average of the *current* world positions of its vertices.
            // For simplicity, let's just average the proxy positions.
            proxy.getWorldPosition(tempWorldPos);
            center.add(tempWorldPos);
            count++;
        });
        if (count > 0) center.divideScalar(count);

        selectionPivot.position.copy(center);
        selectionPivot.rotation.set(0, 0, 0); // Reset rotation/scale for the pivot itself
        selectionPivot.scale.set(1, 1, 1);
        selectionPivot.updateMatrixWorld(true); // Ensure pivot's matrix is up to date for gizmo

        transformControls.attach(selectionPivot);
        selectionPivot.visible = true; // Make pivot visible as gizmo target
    }
    // Update transform controls gizmo size etc.
    transformControls.updateMatrixWorld(); // Ensure the gizmo's world matrix is up to date
}