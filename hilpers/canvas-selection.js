// Global variables for selection functionality
let selectionEnabled = false;
let isSelecting = false;
let selectionStartX = 0;
let selectionStartY = 0;
let selectionCanvas = document.getElementById('selectionCanvas');
let selectionContext = selectionCanvas.getContext('2d');
let selectedObjectsFromBox = [];

// Initialize the selection canvas to match window size
function initSelectionCanvas() {
    selectionCanvas.width = window.innerWidth;
    selectionCanvas.height = window.innerHeight;
    
    // Make sure the canvas is properly sized on window resize
    window.addEventListener('resize', () => {
        selectionCanvas.width = window.innerWidth;
        selectionCanvas.height = window.innerHeight;
    });
}

// Toggle selection mode on/off
function toggleSelectionMode() {
    selectionEnabled = !selectionEnabled;
    
    // Update the toggle button visual state
    const toggleButton = document.getElementById('toggle-selection');
    if (toggleButton) {
        toggleButton.classList.toggle('active', selectionEnabled);
    }
    
    // Display message to user
    if (selectionEnabled) {
        console.log("Box selection mode enabled");
    } else {
        console.log("Box selection mode disabled");
    }
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
    selectedObjectsFromBox.forEach(obj => {
        applySelectionHighlight(obj, COLORS.SELECTED, 0.6);
    });
    
    // Select the first object as the "active" object for transform controls
    selectObject(selectedObjectsFromBox[0]);
}

// Utility to apply selection highlight to an object
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

// Initialize the selection feature
function initCanvasSelection() {
    initSelectionCanvas();
    setupSelectionEvents();
    
    // Add event listener to the toggle button
    const toggleButton = document.getElementById('toggle-selection');
    if (toggleButton) {
        toggleButton.addEventListener('click', toggleSelectionMode);
    }
}


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
        selectedObjectsFromBox.forEach(obj => {
            applySelectionHighlight(obj, COLORS.SELECTED, 0.6);
        });
        
        // Select the first object as the "active" object for transform controls
        selectObject(selectedObjectsFromBox[0]);
    }
}

// Function to delete all selected objects
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
