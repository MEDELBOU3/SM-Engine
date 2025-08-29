// =========================================================================
// 1. GLOBAL STATE VARIABLES
// Place these at the top of your 3D editor script.
// =========================================================================
let currentEditorMode = '3D_SCENE';
let panZoomControls; // Will be created when first needed
let activeSpriteTarget = null; // The THREE.Mesh sprite we are currently editing


// =========================================================================
// 2. CORE MODE-SWITCHING LOGIC
// This is the main function that swaps the entire editor's context.
// =========================================================================

/**
 * Switches the editor UI and viewport between 3D scene editing
 * and focused 2D sprite editing.
 * @param {'3D_SCENE' | '2D_SPRITE_EDIT'} mode The mode to switch to.
 * @param {THREE.Mesh} [targetSprite] - The sprite mesh to focus on when entering 2D mode.
 */
function setEditorMode(mode, targetSprite = null) {
    if (mode === currentEditorMode) return;

    const body = document.body;
    currentEditorMode = mode;

    if (mode === '2D_SPRITE_EDIT') {
        if (!targetSprite || !targetSprite.material.map?.isCanvasTexture) {
            console.error("Cannot enter 2D Edit Mode: Invalid target sprite.", targetSprite);
            return;
        }
        activeSpriteTarget = targetSprite;
        body.classList.add('mode-2d-sprite-edit');

        // --- Switch Camera & Controls ---
        controls.enabled = false; // Disable 3D OrbitControls
        if (!panZoomControls) { // Lazily create the 2D controls
            // IMPORTANT: Make sure you have imported MapControls
            // import { MapControls } from 'three/addons/controls/MapControls.js';
            panZoomControls = new THREE.MapControls(orthographicCamera, renderer.domElement);
            panZoomControls.enableRotate = false; // We only want to pan and zoom
            panZoomControls.screenSpacePanning = true;
        }
        panZoomControls.target.copy(targetSprite.position); // Center on the sprite
        panZoomControls.enabled = true;

        // --- Focus Orthographic Camera ---
        const spriteSize = new THREE.Box3().setFromObject(targetSprite).getSize(new THREE.Vector3());
        // Position the camera slightly in front of the sprite on its local Z axis
        const cameraOffset = new THREE.Vector3(0, 0, 10);
        orthographicCamera.position.copy(targetSprite.position).add(cameraOffset);
        orthographicCamera.lookAt(targetSprite.position);

        // Adjust camera frustum (zoom) to fit the sprite perfectly in view
        const aspect = renderer.domElement.clientWidth / renderer.domElement.clientHeight;
        const largerDim = Math.max(spriteSize.x, spriteSize.y);
        const frustumHeight = largerDim / aspect;
        orthographicCamera.left = -largerDim / 2;
        orthographicCamera.right = largerDim / 2;
        orthographicCamera.top = frustumHeight / 2;
        orthographicCamera.bottom = -frustumHeight / 2;
        orthographicCamera.updateProjectionMatrix();

        // --- Hide other objects for a clean editing environment ---
        scene.traverse(child => {
            // We hide everything that isn't the sprite or a helper (like lights/camera icons)
            if (child !== activeSpriteTarget && !child.isLight && !child.isCameraHelper && !child.isGridHelper) {
                if (child.visible) { // Only store visibility if it was actually visible
                    child.userData.wasVisible = true;
                    child.visible = false;
                }
            }
        });
        
        // --- Initialize and show the 2D Editor's UI ---
        // This function MUST be defined by your 2D script (see Part 2)
        if (window.init2DEditor) {
            window.init2DEditor(activeSpriteTarget.material.map.image, activeSpriteTarget);
        } else {
            console.error("2D Editor script not found. Make sure `init2DEditor` is globally available.");
        }

    } else { // Switching back to '3D_SCENE'
        
        activeSpriteTarget = null;
        body.classList.remove('mode-2d-sprite-edit');

        // --- Switch Camera & Controls back ---
        if (panZoomControls) panZoomControls.enabled = false;
        controls.enabled = true; // Re-enable 3D OrbitControls

        // --- Restore visibility of all 3D scene elements ---
        scene.traverse(child => {
            if (child.userData.wasVisible) {
                child.visible = true;
                delete child.userData.wasVisible;
            }
        });
        
        // Destroy the 2D editor UI if your init function creates it dynamically
        if (window.destroy2DEditor) {
            window.destroy2DEditor();
        }
    }

    // --- Update shared components to use the correct camera ---
    transformControls.camera = (mode === '2D_SPRITE_EDIT') ? orthographicCamera : camera;
    updateHybridModeButtonState(); // Update the button's enabled state
}


// =========================================================================
// 3. ASSET CREATION & UI BINDING
// Functions for creating sprites and managing the UI button.
// =========================================================================

/**
 * Creates a new 2D sprite asset (a textured plane) and adds it to the scene.
 */
function createNewSpriteAsset() {
    // 1. Create the canvas that will be the "drawing paper"
    const canvas = document.createElement('canvas');
    canvas.width = 512; // Default texture resolution
    canvas.height = 512;
    const context = canvas.getContext('2d');
    context.fillStyle = 'rgba(255, 255, 255, 0.1)'; // A slightly visible transparent background
    context.fillRect(0, 0, 512, 512);

    // 2. Create a live Three.js texture from this canvas
    const canvasTexture = new THREE.CanvasTexture(canvas);

    // 3. Create the 3D plane mesh
    const geometry = new THREE.PlaneGeometry(5, 5); // 5x5 world units
    const material = new THREE.MeshBasicMaterial({
        map: canvasTexture,
        transparent: true,
        side: THREE.DoubleSide,
        name: 'SpriteMaterial' // Helpful for debugging
    });
    const spriteMesh = new THREE.Mesh(geometry, material);
    spriteMesh.name = "Sprite";

    // 4. IMPORTANT: Add a flag to identify this object as an editable sprite
    spriteMesh.userData.isSprite = true;

    // 5. Add to the scene and update hierarchy
    scene.add(spriteMesh);
    if (typeof window.updateHierarchy === 'function') {
        window.updateHierarchy();
    }
    
    // Select the newly created sprite
    transformControls.attach(spriteMesh);
    selectedObject = spriteMesh;
    updateHybridModeButtonState();

    return spriteMesh;
}


/**
 * Enables or disables the "Edit Sprite" button based on the current selection.
 */
function updateHybridModeButtonState() {
    const btn = document.getElementById('toggle-hybrid-mode-btn');
    if (!btn) return;

    const isSpriteSelected = selectedObject && selectedObject.userData.isSprite;
    
    // Enable the button ONLY if a sprite is selected and we are in 3D mode.
    btn.disabled = !isSpriteSelected || currentEditorMode !== '3D_SCENE';
    
    if (isSpriteSelected) {
        btn.style.opacity = "1";
        btn.style.cursor = "pointer";
    } else {
        btn.style.opacity = "0.5";
        btn.style.cursor = "not-allowed";
    }
}


/**
 * Sets up the event listeners for selection and the mode-switch button.
 * Call this function once in your main `init()` function.
 */
function setupHybridEditorControls() {
    // Listener for the main mode-switch button
    document.getElementById('toggle-hybrid-mode-btn').addEventListener('click', () => {
        if (currentEditorMode === '3D_SCENE' && selectedObject && selectedObject.userData.isSprite) {
            setEditorMode('2D_SPRITE_EDIT', selectedObject);
        }
    });

    // Hook into object selection to update the button state
    transformControls.addEventListener('objectChange', () => {
        selectedObject = transformControls.object;
        updateHybridModeButtonState();
    });

    // Hook into deselection (clicking on the background)
    renderer.domElement.addEventListener('pointerdown', (event) => {
        // Check if the click is on the gizmo
        if (transformControls.dragging) return;

        // Perform a raycast. If it doesn't hit anything, deselect.
        const mouse = new THREE.Vector2(
            (event.clientX / renderer.domElement.clientWidth) * 2 - 1,
            -(event.clientY / renderer.domElement.clientHeight) * 2 + 1
        );
        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(scene.children, true);

        if (intersects.length === 0) {
            selectedObject = null;
            transformControls.detach();
            updateHybridModeButtonState();
        }
    }, false);
    
    // Also add a button in your UI to create sprites, e.g., in the "Shapes" menu
    // document.getElementById('add-sprite-button').addEventListener('click', createNewSpriteAsset);
}

// =========================================================================
// UNIFIED 2D EDITOR SCRIPT
// This entire block of code should be in its own file (e.g., editor2D.js)
// and loaded by your main HTML file.
// =========================================================================

// This function will be called by the 3D editor to start the 2D mode.
function init2DEditor(targetCanvas, targetMesh) {

    // --- 1. Dynamically create the 2D UI ---
    // This injects your 2D editor's HTML into the hidden panels.
    document.getElementById('panel-2d-toolbar').innerHTML = `
        <button class="tool-button" id="return-to-3d-mode-btn" style="width: 100%; margin-bottom: 10px; background-color: #28a745; color: white;">
            ✓ Accept & Return
        </button>
        <div class="tool active" data-tool="brush" title="Brush (B)">🖌️</div>
        <div class="tool" data-tool="eraser" title="Eraser (E)">🩹</div>
        <div class="tool" data-tool="fill" title="Fill (G)">🪣</div>
        <div class="tool" data-tool="picker" title="Color Picker (I)">🎯</div>
        <!-- ... Paste the rest of your 2D toolbar HTML here ... -->
    `;

    document.getElementById('panel-2d-right').innerHTML = `
        <!-- ... Paste your 2D right-side panels (Layers, Lighting, Palette) HTML here ... -->
    `;
    
    document.getElementById('panel-2d-timeline').innerHTML = `
        <!-- ... Paste your 2D timeline panel HTML here ... -->
    `;

    // --- 2. Your original 2D script logic starts here ---
    
    const view = targetCanvas;
    const vctx = view.getContext('2d');
    const W = view.width;
    const H = view.height;

    const $ = s => document.querySelector(s);
    const $$ = s => Array.from(document.querySelectorAll(s));

    // This function connects the "Return" button to the master `setEditorMode` function
    $('#return-to-3d-mode-btn').addEventListener('click', () => {
        window.setEditorMode('3D_SCENE'); // Assumes setEditorMode is globally available
    });

    // --- PASTE YOUR 2D EDITOR'S JAVASCRIPT LOGIC HERE ---
    // (Everything from your original `(function(){ ... })();` block,
    // except for the wrapper and the initial `const view = ...` lines)
    // ...
    let project = { /* ... */ };
    function newFrame() { /* ... */ }
    // ... all of your functions: buildLayers, drawStroke, etc.
    
    // IMPORTANT: Modify your 2D render() function
    function render() {
        vctx.clearRect(0, 0, W, H);
        // ... (all of your original drawing and compositing logic) ...

        // CRITICAL: This final line tells Three.js that the texture has been updated
        // and needs to be re-uploaded to the GPU.
        if (targetMesh && targetMesh.material.map) {
            targetMesh.material.map.needsUpdate = true;
        }
    }
    
    // ... (rest of your 2D script, including the initial buildAll() and render() calls)
    // buildAll();
    // render();
}

// This function can be called to clean up the UI when returning to 3D mode
function destroy2DEditor() {
    document.getElementById('panel-2d-toolbar').innerHTML = '';
    document.getElementById('panel-2d-right').innerHTML = '';
    document.getElementById('panel-2d-timeline').innerHTML = '';
    // You can also remove any global event listeners your 2D editor might have added.
}

// Make the functions globally accessible
window.init2DEditor = init2DEditor;
window.destroy2DEditor = destroy2DEditor;

