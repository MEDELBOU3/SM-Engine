
let structureSynthToolActive = false;
let synthOperation = 'idle'; // 'idle', 'drawProfile', 'selectFaceForExtrude', 'extruding'
let synthProfilePoints = []; // Array of THREE.Vector3 for world coordinates
let synthActivePlane = null; // THREE.Plane for drawing
let synthPreviewLine = null; // THREE.Line for profile preview
let synthSelectedFaceInfo = null; // { mesh, faceIndex, worldNormal, worldCentroid, vertices (world) }
let synthExtrudePreviewMesh = null;
let synthCurrentProfileMesh = null; // The temporary flat mesh created from the profile
let synthDragStartPoint = null; // For extrusion drag


// =====================================================
// === NEW: Structure Synth Tool Implementation (Phase 1) ===
// =====================================================

function initStructureSynthTool() {
    deactivateCurrentArchTool(); // Deactivate any other standard arch tool
    if (typeof cancelLoopCut === 'function') cancelLoopCut();
    if (typeof finishSplineDrawing === 'function') finishSplineDrawing();
    clearSelection(); // Clear V/E/F selections
    deselectAllArchElements();

    structureSynthToolActive = true;
    synthOperation = 'idle';
    synthProfilePoints = [];
    synthActivePlane = null; // Will be set on first click for profile
    synthSelectedFaceInfo = null;
    synthDragStartPoint = null;

    console.log("Structure Synth Tool Activated. Mode: Idle.");

    renderer.domElement.addEventListener('mousedown', handleSynthMouseDown);
    renderer.domElement.addEventListener('mouseup', handleSynthMouseUp);


    if (!synthPreviewLine) {
        synthPreviewLine = new THREE.Line(
            new THREE.BufferGeometry(),
            new THREE.LineDashedMaterial({ color: 0xff8800, dashSize: 0.1, gapSize: 0.05, depthTest: false })
        );
        synthPreviewLine.renderOrder = 998;
        scene.add(synthPreviewLine);
    }
    synthPreviewLine.visible = false;

    if (!synthExtrudePreviewMesh) {
        synthExtrudePreviewMesh = new THREE.Mesh(
            new THREE.BoxGeometry(1,1,1), // Placeholder
            new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.4, wireframe: true, depthTest:false })
        );
        synthExtrudePreviewMesh.renderOrder = 997;
        scene.add(synthExtrudePreviewMesh);
    }
    synthExtrudePreviewMesh.visible = false;

    if (synthCurrentProfileMesh) { // Clean up from previous use if any
        scene.remove(synthCurrentProfileMesh);
        if(synthCurrentProfileMesh.geometry) synthCurrentProfileMesh.geometry.dispose();
        if(synthCurrentProfileMesh.material) synthCurrentProfileMesh.material.dispose();
        synthCurrentProfileMesh = null;
    }


    if (controls) controls.enabled = false;
    transformControls.detach();
    renderer.domElement.style.cursor = 'crosshair';

    // De-highlight other tool buttons
    document.querySelectorAll('.arch-tool.active-tool').forEach(btn => btn.classList.remove('active-tool'));
    const synthButton = document.getElementById('tool-structure-synth');
    if (synthButton) synthButton.classList.add('active-tool');
    document.querySelectorAll('.tool-options').forEach(el => el.style.display = 'none'); // Hide other options
}

function cleanupStructureSynthTool() {
    if (!structureSynthToolActive) return;
    structureSynthToolActive = false;
    synthOperation = 'idle';
    synthProfilePoints = [];
    synthSelectedFaceInfo = null;
    synthDragStartPoint = null;

    renderer.domElement.removeEventListener('mousedown', handleSynthMouseDown);
    renderer.domElement.removeEventListener('mouseup', handleSynthMouseUp);

    if (synthPreviewLine) synthPreviewLine.visible = false;
    if (synthExtrudePreviewMesh) synthExtrudePreviewMesh.visible = false;

    if (synthCurrentProfileMesh) { // Remove the profile mesh if it wasn't turned into a final object
        const indexInArch = architecturalElements.indexOf(synthCurrentProfileMesh);
        if(indexInArch > -1) architecturalElements.splice(indexInArch, 1);
        scene.remove(synthCurrentProfileMesh);
        if(synthCurrentProfileMesh.geometry) synthCurrentProfileMesh.geometry.dispose();
        if(synthCurrentProfileMesh.material) synthCurrentProfileMesh.material.dispose();
        synthCurrentProfileMesh = null;
    }

    const synthButton = document.getElementById('tool-structure-synth');
    if (synthButton) synthButton.classList.remove('active-tool');

    if (renderer.domElement) renderer.domElement.style.cursor = 'default';
    if (isModelingMode && !isLocked && !isTransforming && !activeArchTool && !isLoopCutMode && !splineCreationMode) {
        if (controls) controls.enabled = true;
    }
    console.log("Structure Synth Tool Deactivated.");
}

function handleSynthClick(event, groundIntersectionPoint, intersectedInfo) {
    if (event.button !== 0) return; // Only left click
    const intersectedObject = intersectedInfo ? intersectedInfo.object : null;

    switch (synthOperation) {
        case 'idle':
            if (groundIntersectionPoint) { // Start drawing profile on ground
                synthOperation = 'drawProfile';
                synthActivePlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -groundIntersectionPoint.y);
                synthProfilePoints = [groundIntersectionPoint.clone()];
                synthPreviewLine.geometry.setFromPoints([groundIntersectionPoint.clone(), groundIntersectionPoint.clone()]);
                synthPreviewLine.visible = true;
                console.log("Synth: Start drawing profile.");
            }
            break;

        case 'drawProfile':
            if (groundIntersectionPoint) {
                synthProfilePoints.push(groundIntersectionPoint.clone());
                console.log(`Synth: Added profile point ${synthProfilePoints.length}.`);
                if (synthProfilePoints.length > 2 && groundIntersectionPoint.distanceTo(synthProfilePoints[0]) < 0.2) { // Close loop
                    synthProfilePoints.pop(); // Remove last point (it's the closing one)
                    finalizeSynthProfile();
                } else { // Update preview line with fixed segments
                    synthPreviewLine.geometry.dispose();
                    synthPreviewLine.geometry = new THREE.BufferGeometry().setFromPoints(synthProfilePoints);
                    synthPreviewLine.computeLineDistances(); // For dashed material if used
                }
            }
            break;

        case 'selectFaceForExtrude':
            if (intersectedInfo && intersectedInfo.face &&
                (intersectedObject === synthCurrentProfileMesh || (intersectedObject.userData.isArchitectural && (intersectedObject.userData.archType === 'wall' || intersectedObject.userData.archType === 'room' || intersectedObject.userData.archType === 'extruded-form')))) {
                
                synthSelectedFaceInfo = {
                    mesh: intersectedObject,
                    faceIndex: intersectedInfo.faceIndex,
                    worldNormal: intersectedInfo.face.normal.clone().transformDirection(intersectedObject.matrixWorld).normalize(),
                    worldCentroid: intersectedInfo.point.clone(), // Intersection point on face
                    localNormal: intersectedInfo.face.normal.clone()
                };
                console.log("Synth: Face selected for extrusion on", intersectedObject.name);
                
                // This click INITIATES the drag for extrusion
                synthOperation = 'extruding';
                synthDragStartPoint = intersectedInfo.point.clone(); // Start drag from point on face
                                
                // Alternative if groundIntersectionPoint is more reliable for establishing extrusion plane
                // const extrusionPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(synthSelectedFaceInfo.worldNormal, intersectedInfo.point);
                // raycaster.ray.intersectPlane(extrusionPlane, synthDragStartPoint = new THREE.Vector3());


                if(synthDragStartPoint) {
                    console.log("Synth: Extrusion drag ready to start from:", synthDragStartPoint);
                    renderer.domElement.style.cursor = 'grabbing';
                    if(controls) controls.enabled = false;
                } else {
                    console.warn("Synth: Could not determine drag start point for extrusion.");
                    synthOperation = 'selectFaceForExtrude'; // Revert
                }
            }
            break;

        case 'extruding_dragStart': // This state might be merged with 'extruding' logic if using mouseup/mousedown for drag
            // This click *confirms* the extrusion if it was a click-drag-click,
            // or it might be the start of a new operation if it was just a click.
            // For simplicity now, we assume a drag started on mousedown for 'extruding'.
            // This case might not be hit if extrusion is purely drag based.
            break;
    }
}

let isSynthDragging = false;

function handleSynthMouseMove(event, groundIntersectionPoint, intersectedInfo) {
    const intersectedObject = intersectedInfo ? intersectedInfo.object : null;

    switch (synthOperation) {
        case 'idle':
             renderer.domElement.style.cursor = 'crosshair';
             if (synthPreviewLine) synthPreviewLine.visible = false;
             if (synthExtrudePreviewMesh) synthExtrudePreviewMesh.visible = false;
            break;
        case 'drawProfile':
            if (synthProfilePoints.length > 0 && groundIntersectionPoint) {
                const currentPreviewPoints = [...synthProfilePoints, groundIntersectionPoint.clone()];
                synthPreviewLine.geometry.dispose();
                synthPreviewLine.geometry = new THREE.BufferGeometry().setFromPoints(currentPreviewPoints);
                synthPreviewLine.computeLineDistances();
                synthPreviewLine.visible = true;
            }
            renderer.domElement.style.cursor = 'crosshair';
            break;

        case 'selectFaceForExtrude':
            renderer.domElement.style.cursor = 'pointer'; // Indicate face selection
            // Basic hover highlight for faces (could be more advanced)
            if (intersectedObject && (intersectedObject === synthCurrentProfileMesh || intersectedObject.userData.isArchitectural)) {
                // Simple highlight: make extrusion preview follow cursor on face
                if (intersectedInfo && intersectedInfo.face && synthExtrudePreviewMesh) {
                    synthExtrudePreviewMesh.visible = true;
                    synthExtrudePreviewMesh.position.copy(intersectedInfo.point);
                    const faceNormal = intersectedInfo.face.normal.clone().transformDirection(intersectedObject.matrixWorld);
                    synthExtrudePreviewMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), faceNormal); // Align with normal
                    synthExtrudePreviewMesh.scale.set(0.5, 0.1, 0.5); // Small preview
                }
            } else {
                if (synthExtrudePreviewMesh) synthExtrudePreviewMesh.visible = false;
            }
            break;

        case 'extruding': // This is active during the drag
            if (synthSelectedFaceInfo && synthDragStartPoint && groundIntersectionPoint) {
                const dragVector = groundIntersectionPoint.clone().sub(synthDragStartPoint);
                let extrudeDistance = dragVector.dot(synthSelectedFaceInfo.worldNormal);
                
                // Update synthExtrudePreviewMesh
                synthExtrudePreviewMesh.visible = true;
                synthExtrudePreviewMesh.geometry.dispose();
                // For simplicity, make it a box based on the face and distance
                // A real preview would show the actual extruded shape
                const previewSize = 0.5; // Placeholder for face size
                synthExtrudePreviewMesh.geometry = new THREE.BoxGeometry(previewSize, Math.abs(extrudeDistance) || 0.01, previewSize);
                
                // Position preview
                const previewPosition = synthSelectedFaceInfo.worldCentroid.clone().addScaledVector(synthSelectedFaceInfo.worldNormal, extrudeDistance / 2);
                synthExtrudePreviewMesh.position.copy(previewPosition);
                synthExtrudePreviewMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), synthSelectedFaceInfo.worldNormal);
            }
            break;
    }
}

function handleSynthRightClick(event) {
    if (synthOperation === 'drawProfile' && synthProfilePoints.length > 0) {
        if (synthProfilePoints.length >= 3) { // Need at least 3 points for a shape
            finalizeSynthProfile();
        } else {
            console.log("Synth: Profile drawing cancelled (not enough points).");
            synthOperation = 'idle';
            synthProfilePoints = [];
            if (synthPreviewLine) synthPreviewLine.visible = false;
        }
    } else if (synthOperation === 'selectFaceForExtrude' || synthOperation === 'extruding' || synthOperation === 'extruding_dragStart') {
        console.log("Synth: Extrusion cancelled.");
        synthOperation = synthCurrentProfileMesh ? 'selectFaceForExtrude' : 'idle'; // Go back to face selection or idle
        if (synthExtrudePreviewMesh) synthExtrudePreviewMesh.visible = false;
        synthSelectedFaceInfo = null;
        synthDragStartPoint = null;
        renderer.domElement.style.cursor = synthCurrentProfileMesh ? 'pointer' : 'crosshair';
    } else if (synthOperation === 'idle') {
        cleanupStructureSynthTool(); // Fully deactivate tool on right click if idle
    }
}

function handleSynthMouseDown(event) {
    if (!structureSynthToolActive || event.button !== 0) return;
    isSynthDragging = true; // General drag flag for synth tool

    if (synthOperation === 'selectFaceForExtrude' && synthSelectedFaceInfo) { // synthSelectedFaceInfo would be set on hover-click
        // This assumes synthSelectedFaceInfo is already set by a PREVIOUS click to select the face.
        // The current handleSynthClick needs to be changed to set this.
        // Let's re-think:
        // 1. idle -> click ground -> drawProfile
        // 2. drawProfile -> points -> right_click -> finalizeSynthProfile -> selectFaceForExtrude
        // 3. selectFaceForExtrude -> MOUSE_DOWN on a valid face -> synthOperation = 'extruding', store synthDragStartPoint
        // 4. extruding (isSynthDragging=true) -> MOUSE_MOVE -> update preview
        // 5. extruding -> MOUSE_UP -> performSynthExtrusion, synthOperation = 'selectFaceForExtrude'

        // So, handleSynthClick will set synthSelectedFaceInfo if in 'selectFaceForExtrude' mode
        // AND THEN, this mousedown (if on that face) will start the drag.
        // This needs intersectedInfo from raycaster at mousedown.
        raycaster.setFromCamera(mouse, camera); // Ensure raycaster is current
        const allIntersects = raycaster.intersectObjects(scene.children, true);
        let firstValidIntersect = null;
        if (allIntersects.length > 0) {
             for (let i = 0; i < allIntersects.length; i++) {
                const obj = allIntersects[i].object;
                if (obj.isMesh && obj.visible && !obj.name.includes("Helper") &&
                    (obj === synthCurrentProfileMesh || (obj.userData.isArchitectural && (obj.userData.archType === 'wall' || obj.userData.archType === 'room' || obj.userData.archType === 'extruded-form'))) &&
                    allIntersects[i].face) {
                    firstValidIntersect = allIntersects[i];
                    break;
                }
            }
        }

        if (synthOperation === 'selectFaceForExtrude' && firstValidIntersect) {
             synthSelectedFaceInfo = {
                mesh: firstValidIntersect.object,
                faceIndex: firstValidIntersect.faceIndex,
                worldNormal: firstValidIntersect.face.normal.clone().transformDirection(firstValidIntersect.object.matrixWorld).normalize(),
                worldCentroid: firstValidIntersect.point.clone(),
                localNormal: firstValidIntersect.face.normal.clone()
            };
            synthOperation = 'extruding';
            synthDragStartPoint = firstValidIntersect.point.clone(); // Point on the face
            console.log("Synth: Extrusion drag started on face.");
            renderer.domElement.style.cursor = 'grabbing';
            if(controls) controls.enabled = false;
        }
    }
}

function handleSynthMouseUp(event) {
    if (!structureSynthToolActive || event.button !== 0) return;
    isSynthDragging = false;

    if (synthOperation === 'extruding') {
        performSynthExtrusion();
        // synthOperation will be set to 'selectFaceForExtrude' in performSynthExtrusion
        renderer.domElement.style.cursor = 'pointer';
        if (controls && !activeArchTool && !isTransforming) controls.enabled = true; // Simplified condition
    }
}


function finalizeSynthProfile() {
    if (synthProfilePoints.length < 3) {
        console.warn("Synth: Not enough points to create a profile shape.");
        synthOperation = 'idle';
        synthProfilePoints = [];
        if(synthPreviewLine) synthPreviewLine.visible = false;
        return;
    }

    console.log("Synth: Finalizing profile...");

    // Assume points are on ground plane (Y is same for all, from synthActivePlane)
    const localOrigin = synthProfilePoints[0].clone();
    const profilePoints2D = synthProfilePoints.map(p_world =>
        new THREE.Vector2(p_world.x - localOrigin.x, p_world.z - localOrigin.z)
    );

    // Ensure CCW winding for the shape
    let area = 0;
    for (let i = 0; i < profilePoints2D.length; i++) {
        const p1 = profilePoints2D[i];
        const p2 = profilePoints2D[(i + 1) % profilePoints2D.length];
        area += (p1.x * p2.y - p1.y * p2.x);
    }
    if (area < 0) { profilePoints2D.reverse(); } // Shoelace formula area check

    const shape = new THREE.Shape(profilePoints2D);
    const extrudeSettings = { depth: 0.02, bevelEnabled: false }; // Very thin initial extrusion
    const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    geometry.rotateX(-Math.PI / 2); // Align with ground plane

    if (synthCurrentProfileMesh) { // Clean up old one
        scene.remove(synthCurrentProfileMesh);
        if(synthCurrentProfileMesh.geometry) synthCurrentProfileMesh.geometry.dispose();
        if(synthCurrentProfileMesh.material) synthCurrentProfileMesh.material.dispose();
    }

    synthCurrentProfileMesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0x7777cc, side: THREE.DoubleSide, roughness: 0.6 }));
    synthCurrentProfileMesh.name = "SynthProfileBase_" + Date.now();
    synthCurrentProfileMesh.position.copy(localOrigin); // Position the mesh
    synthCurrentProfileMesh.position.y = localOrigin.y; // Ensure correct height

    addObjectToScene(synthCurrentProfileMesh, 'profile-base'); // Add to scene
    registerArchitecturalElement(synthCurrentProfileMesh, 'profile-base'); // So it can be selected

    console.log("Synth: Profile mesh created. Select face to extrude.");
    synthOperation = 'selectFaceForExtrude';
    synthProfilePoints = [];
    if (synthPreviewLine) synthPreviewLine.visible = false;
    renderer.domElement.style.cursor = 'pointer';
}

function performSynthExtrusion() {
    if (!synthSelectedFaceInfo || !synthCurrentProfileMesh) { // Changed synthTargetObject to synthCurrentProfileMesh
        console.warn("Synth: No face selected or base profile mesh missing for extrusion.");
        return;
    }

    // This uses the synthDragStartPoint and current mouse to determine distance
    const currentMouseGround = getGroundPlaneIntersection(); // Re-evaluate current mouse for distance
    if (!synthDragStartPoint || !currentMouseGround) {
        console.warn("Synth: Could not determine extrusion distance.");
        return;
    }

    const dragVector = currentMouseGround.clone().sub(synthDragStartPoint);
    let extrudeDistance = dragVector.dot(synthSelectedFaceInfo.worldNormal);
    
    // Prevent zero or near-zero extrusion, or inverted extrusion for first phase
    if (Math.abs(extrudeDistance) < 0.05) {
        extrudeDistance = extrudeDistance > 0 ? 0.05 : -0.05;
         // For simplicity, force positive extrusion if it's the first on the profile base
        if (synthSelectedFaceInfo.mesh === synthCurrentProfileMesh && synthCurrentProfileMesh.userData.archType === 'profile-base') {
            extrudeDistance = Math.abs(extrudeDistance);
        }
    }
    if (extrudeDistance === 0) {
        console.log("Synth: Extrusion distance is zero.");
        synthOperation = 'selectFaceForExtrude';
        if(synthExtrudePreviewMesh) synthExtrudePreviewMesh.visible = false;
        return;
    }

    console.log(`Synth: Performing extrusion on ${synthSelectedFaceInfo.mesh.name}, face ${synthSelectedFaceInfo.faceIndex}, distance ${extrudeDistance.toFixed(3)}`);

    // --- Actual Extrusion Logic ---
    // This is where the complex geometry modification happens.
    // For Phase 1, if we're extruding the initial 'profile-base', we can simply
    // re-create its geometry with the new depth.
    if (synthSelectedFaceInfo.mesh === synthCurrentProfileMesh && synthSelectedFaceInfo.mesh.userData.archType === 'profile-base') {
        const originalShape = synthCurrentProfileMesh.userData.originalShape; // We need to store this
        if (!originalShape) {
            console.error("Synth: Original shape for profile base not found!");
            // As a fallback, try to get it from current geometry (less ideal)
            // This path requires more robust shape storage/retrieval.
            // For now, let's assume the initial flat extrusion depth was small, and we're making it taller.
            // We can try to scale the existing geometry along its extrusion axis.

            // Simplest first extrusion: change depth of the Box (if shape was simple) or re-extrude.
            // If synthCurrentProfileMesh.geometry was an ExtrudeGeometry from a Shape:
            const profileShape = synthCurrentProfileMesh.userData.sourceShape; // Store this when creating profile mesh
            if (profileShape) {
                synthCurrentProfileMesh.geometry.dispose();
                const newExtrudeSettings = { depth: Math.abs(extrudeDistance), bevelEnabled: false };
                const newGeom = new THREE.ExtrudeGeometry(profileShape, newExtrudeSettings);
                newGeom.rotateX(-Math.PI / 2);
                // The mesh's position is already set by localOrigin of the profile.
                // If extruding "up", we might need to shift geometry if depth was negative before.
                if (extrudeDistance < 0) { // Extruding "down"
                    newGeom.translate(0, -Math.abs(extrudeDistance), 0);
                }
                synthCurrentProfileMesh.geometry = newGeom;
                synthCurrentProfileMesh.userData.archType = 'extruded-form'; // Update its type
                console.log("Synth: Profile base re-extruded to new height.");
            } else {
                 console.warn("Synth: Cannot re-extrude profile base without original shape data.");
                 // Fallback: try to scale (less accurate for complex shapes)
                 const scaleVec = new THREE.Vector3(1,1,1);
                 // Determine extrusion axis relative to mesh (tricky without knowing face orientation)
                 // For a flat profile extruded, it's usually its local Y after rotation.
                 // This scaling is very basic and likely incorrect for general extrusion.
                 const currentDepth = synthCurrentProfileMesh.geometry.parameters.options.depth || 0.02;
                 scaleVec.y = Math.abs(extrudeDistance) / currentDepth;
                 synthCurrentProfileMesh.scale.y = scaleVec.y; // This scales the whole object, not just one face
                 synthCurrentProfileMesh.updateMatrixWorld();
                 // BETTER: Use the `extrudeSelection` logic from your poly modeling tools.
                 console.warn("Synth: Using basic scale for extrusion. Implement proper face extrusion.");
            }

        }
    } else {
        // TODO: Implement proper face extrusion on existing 3D forms
        // This would involve:
        // 1. Getting vertices of synthSelectedFaceInfo.faceIndex from synthSelectedFaceInfo.mesh.geometry.
        // 2. Duplicating these vertices.
        // 3. Moving duplicated vertices along synthSelectedFaceInfo.worldNormal by extrudeDistance.
        // 4. Rebuilding the index to create new side faces and the new extruded cap face.
        // (This is the core of your `extrudeSelection` function, adapted here)
        alert("Synth: Extruding existing 3D faces not fully implemented in Phase 1. See `extrudeSelection` for logic.");
    }

    if (synthSelectedFaceInfo.mesh.geometry.attributes.position) { // Check if geometry still valid
        synthSelectedFaceInfo.mesh.geometry.attributes.position.needsUpdate = true;
        synthSelectedFaceInfo.mesh.geometry.computeVertexNormals();
        synthSelectedFaceInfo.mesh.geometry.computeBoundingBox();
        synthSelectedFaceInfo.mesh.geometry.computeBoundingSphere();
        if (typeof showMeshStructure === 'function' && activeObject === synthSelectedFaceInfo.mesh) {
            showMeshStructure(synthSelectedFaceInfo.mesh);
        }
    }


    synthOperation = 'selectFaceForExtrude'; // Ready for another extrusion on this or other mesh
    if (synthExtrudePreviewMesh) synthExtrudePreviewMesh.visible = false;
    synthSelectedFaceInfo = null;
    synthDragStartPoint = null;
    renderer.domElement.style.cursor = 'pointer';
}


// Add listeners for mousedown and mouseup on the canvas for extrusion drag
// These should be added in initStructureSynthTool and removed in cleanup

function synthMouseDownHandler(event) {
    if (!structureSynthToolActive || event.button !== 0) return; // Only left click

    if (synthOperation === 'extruding_dragStart' && synthSelectedFaceInfo) {
        synthOperation = 'extruding';
        // For extrusion, worldIntersectionPoint might not be on the face,
        // so we use groundIntersection or a raycast against a plane parallel to the face
        synthDragStartPoint = getGroundPlaneIntersection(); // Or a point on the face's plane
        if (!synthDragStartPoint && synthSelectedFaceInfo.worldCentroid) {
            // Fallback if ground not hit: project mouse onto face's plane
            const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(synthSelectedFaceInfo.worldNormal, synthSelectedFaceInfo.worldCentroid);
            raycaster.ray.intersectPlane(plane, synthDragStartPoint = new THREE.Vector3());
        }

        if(synthDragStartPoint) {
            console.log("Synth: Extrusion drag started from:", synthDragStartPoint);
            renderer.domElement.style.cursor = 'grabbing';
            if(controls) controls.enabled = false; // Ensure orbit controls off during drag
        } else {
            console.warn("Synth: Could not determine drag start point for extrusion.");
            synthOperation = 'selectFaceForExtrude'; // Revert
        }
    }
}

function synthMouseUpHandler(event) {
    if (!structureSynthToolActive || event.button !== 0) return;

    if (synthOperation === 'extruding') {
        performSynthExtrusion(); // Finalizes the extrusion
        // synthOperation is reset inside performSynthExtrusion or right click
        renderer.domElement.style.cursor = 'pointer'; // Back to face selection cursor
        if (controls && !activeArchTool && !isTransforming /*...etc.*/) controls.enabled = true;
    }
}


function applyShellOperation() {
    if (!activeObject || !activeObject.geometry || !activeObject.geometry.index ||
        selectionMode !== 'face' || selectedElements.length === 0) {
        console.warn("Shell operation: Invalid conditions.");
        return;
    }

    const thickness = parseFloat(prompt("Enter shell thickness:", "0.1"));
    if (isNaN(thickness) || thickness <= 0) {
        alert("Invalid thickness value.");
        return;
    }

    console.log(`Applying Shell operation with thickness: ${thickness}`);

    const geometry = activeObject.geometry;
    const positions = geometry.attributes.position;
    const normals = geometry.attributes.normal; // We need normals
    const uvs = geometry.attributes.uv;
    const indices = geometry.index.array;
    const originalVertexCount = positions.count;

    const selectedFaceProxies = selectedElements.filter(elem => elem.userData.type === 'face');
    const removedFaceIndices = new Set(selectedFaceProxies.map(proxy => proxy.userData.faceIndex));

    console.log("Faces to remove (openings):", Array.from(removedFaceIndices));

    // --- Data Structures ---
    const newVertices = []; // Will store { position: Vector3, normal: Vector3, uv: Vector2 }
    const newIndicesArray = [];

    // Map from original vertex index to its new inner shell duplicate index
    const originalToInnerVertexMap = new Map();
    let nextNewVertexIndex = originalVertexCount; // Start new indices after original ones

    // Temporary vectors
    const v = new THREE.Vector3();
    const n = new THREE.Vector3();
    const tempUV = new THREE.Vector2();

    // --- Step 1: Duplicate original vertices for the outer shell (if needed, or just use existing) ---
    // For this approach, we'll create ALL new vertices for inner, sides, and rims.
    // The original geometry's unselected faces will be the "outer" part of the shell.

    // --- Step 2: Create Inner Vertices and Inner Faces ---
    // For each original vertex, if it's part of a face that ISN'T removed,
    // create an inner counterpart. This is a simplification; ideally, inner vertices
    // are averaged from offsets of connected non-removed faces.

    const innerVertexData = new Map(); // Map<originalVertexIndex, { newIndex, newPosition, newNormal, newUV }>

    // Pass 1: Identify vertices that need inner duplicates and calculate their positions
    for (let i = 0; i < originalVertexCount; i++) {
        // Determine if this vertex is part of any face that is *not* removed.
        // And also if it's part of any face that *is* removed (for rim generation later).
        // This requires a vertex-to-face map.
        const vertexFaceMap = buildVertexFaceMap(geometry); // You have this helper
        if (!vertexFaceMap) {
            console.error("Shell: Could not build vertex-face map.");
            return;
        }

        const facesUsingVertex = vertexFaceMap.get(i) || [];
        let isBoundaryVertexOfOpening = false; // Is this vertex on the edge of an opening?
        let hasNonRemovedFaces = false;
        let normalAccumulator = new THREE.Vector3();
        let normalCount = 0;

        facesUsingVertex.forEach(faceIdx => {
            if (!removedFaceIndices.has(faceIdx)) {
                hasNonRemovedFaces = true;
                // Accumulate normals of adjacent non-removed faces for a smoother offset
                const fN = new THREE.Vector3(); // Face normal
                const i0 = indices[faceIdx * 3 + 0];
                const i1 = indices[faceIdx * 3 + 1];
                const i2 = indices[faceIdx * 3 + 2];
                const p0 = new THREE.Vector3().fromBufferAttribute(positions, i0);
                const p1 = new THREE.Vector3().fromBufferAttribute(positions, i1);
                const p2 = new THREE.Vector3().fromBufferAttribute(positions, i2);
                const cb = new THREE.Vector3().subVectors(p2, p1);
                const ab = new THREE.Vector3().subVectors(p0, p1);
                fN.crossVectors(cb, ab).normalize();
                normalAccumulator.add(fN);
                normalCount++;
            } else {
                isBoundaryVertexOfOpening = true; // If it touches a removed face, it's on a boundary
            }
        });

        if (hasNonRemovedFaces) { // Only create inner vertex if it's part of the shell wall
            v.fromBufferAttribute(positions, i);
            const originalNormal = normals ? n.fromBufferAttribute(normals, i).clone() : (normalCount > 0 ? normalAccumulator.divideScalar(normalCount).normalize() : new THREE.Vector3(0,1,0)); // Use vertex normal or averaged face normal
            const uv = uvs ? tempUV.fromBufferAttribute(uvs, i).clone() : new THREE.Vector2(0,0);

            const innerPosition = v.clone().sub(originalNormal.clone().multiplyScalar(thickness));
            const newInnerIdx = nextNewVertexIndex++;

            innerVertexData.set(i, {
                originalIndex: i,
                innerIndex: newInnerIdx,
                position: innerPosition,
                normal: originalNormal.clone().negate(), // Inner normal points inwards
                uv: uv.clone(),
                isBoundary: isBoundaryVertexOfOpening && hasNonRemovedFaces // Part of shell AND touches an opening
            });
        }
    }

    // --- Step 3: Rebuild Faces ---
    const finalPositionsArray = new Float32Array(nextNewVertexIndex * 3);
    const finalNormalsArray = normals ? new Float32Array(nextNewVertexIndex * 3) : null;
    const finalUVsArray = uvs ? new Float32Array(nextNewVertexIndex * 2) : null;

    // Copy original vertex data
    finalPositionsArray.set(positions.array.slice(0, originalVertexCount * 3));
    if (normals) finalNormalsArray.set(normals.array.slice(0, originalVertexCount * 3));
    if (uvs) finalUVsArray.set(uvs.array.slice(0, originalVertexCount * 2));

    // Add new inner vertex data to arrays
    innerVertexData.forEach(data => {
        finalPositionsArray.set(data.position.toArray(), data.innerIndex * 3);
        if (finalNormalsArray) finalNormalsArray.set(data.normal.toArray(), data.innerIndex * 3);
        if (finalUVsArray) finalUVsArray.set(data.uv.toArray(), data.innerIndex * 2);
    });


    // Iterate over original faces
    for (let i = 0; i < indices.length; i += 3) {
        const faceIndex = i / 3;
        const v0Orig = indices[i + 0];
        const v1Orig = indices[i + 1];
        const v2Orig = indices[i + 2];

        if (!removedFaceIndices.has(faceIndex)) {
            // This is an outer face, keep it
            newIndicesArray.push(v0Orig, v1Orig, v2Orig);

            // Create corresponding inner face (if all its vertices have inner counterparts)
            const v0InnerData = innerVertexData.get(v0Orig);
            const v1InnerData = innerVertexData.get(v1Orig);
            const v2InnerData = innerVertexData.get(v2Orig);

            if (v0InnerData && v1InnerData && v2InnerData) {
                const v0Inner = v0InnerData.innerIndex;
                const v1Inner = v1InnerData.innerIndex;
                const v2Inner = v2InnerData.innerIndex;
                newIndicesArray.push(v0Inner, v2Inner, v1Inner); // Reversed winding for inner face

                // Create side walls connecting outer face to inner face
                // Edge v0-v1
                newIndicesArray.push(v0Orig, v0Inner, v1Inner);
                newIndicesArray.push(v0Orig, v1Inner, v1Orig);
                // Edge v1-v2
                newIndicesArray.push(v1Orig, v1Inner, v2Inner);
                newIndicesArray.push(v1Orig, v2Inner, v2Orig);
                // Edge v2-v0
                newIndicesArray.push(v2Orig, v2Inner, v0Inner);
                newIndicesArray.push(v2Orig, v0Inner, v0Orig);
            } else {
                console.warn(`Shell: Missing inner vertex data for outer face ${faceIndex}. Side walls might be incomplete.`);
            }
        }
    }

    // --- Step 4: Create Rim Faces for Openings (Simplified) ---
    // This is the most complex part for a robust solution.
    // We need to find edges that were shared between a removed face and a non-removed face.
    // These edges form the "rim" of the opening.
    const edgeFaceMap = buildEdgeFaceMap(geometry);
    if (!edgeFaceMap) { console.error("Shell: Could not build edge-face map for rim."); return; }

    edgeFaceMap.forEach((faces, edgeKey) => {
        const [uOrig, vOrig] = edgeKey.split('_').map(Number);
        let isRimEdge = false;
        let removedFaceOnEdge = false;
        let keptFaceOnEdge = false;

        faces.forEach(faceIdx => {
            if (removedFaceIndices.has(faceIdx)) removedFaceOnEdge = true;
            else keptFaceOnEdge = true;
        });

        isRimEdge = removedFaceOnEdge && keptFaceOnEdge;

        if (isRimEdge) {
            const uInnerData = innerVertexData.get(uOrig);
            const vInnerData = innerVertexData.get(vOrig);

            if (uInnerData && vInnerData) {
                const uInner = uInnerData.innerIndex;
                const vInner = vInnerData.innerIndex;
                // Create quad for the rim: uOrig, vOrig, vInner, uInner
                // Winding order matters here for correct normals.
                // Assume we need to connect them such that the new face points "sideways"
                newIndicesArray.push(uOrig, vOrig, vInner);
                newIndicesArray.push(uOrig, vInner, uInner);
            } else {
                 console.warn(`Shell: Rim edge ${edgeKey} missing inner vertex data. Rim incomplete.`);
            }
        }
    });


    // --- Apply New Geometry ---
    const newGeometry = new THREE.BufferGeometry();
    newGeometry.setAttribute('position', new THREE.BufferAttribute(finalPositionsArray, 3));
    if (finalNormalsArray) newGeometry.setAttribute('normal', new THREE.BufferAttribute(finalNormalsArray, 3));
    if (finalUVsArray) newGeometry.setAttribute('uv', new THREE.BufferAttribute(finalUVsArray, 2));
    newGeometry.setIndex(newIndicesArray);

    try {
        newGeometry.computeVertexNormals(); // Crucial for lighting
    } catch (e) {
        console.error("Error computing normals after shell:", e);
    }

    const oldGeo = activeObject.geometry;
    activeObject.geometry = newGeometry;
    oldGeo.dispose();

    if (baseGeometries.has(activeObject.uuid)) {
        baseGeometries.set(activeObject.uuid, newGeometry.clone());
        document.getElementById('subdivisionLevelsSlider').value = 0;
    }

    clearSelection();
    showMeshStructure(activeObject);
    console.log("Shell operation attempted.");
}


/*function applyBooleanSubtract(targetMesh, toolMesh) {
    if (!targetMesh || !toolMesh) {
        console.error("Boolean subtract: Target or tool mesh is missing.");
        return;
    }
    if (typeof CSG === 'undefined') {
        alert("CSG library (three-csg-ts) is not loaded. Boolean operations unavailable.");
        console.error("three-csg-ts (CSG) is not defined. Please ensure it's correctly included.");
        return;
    }

    console.log(`Applying Boolean Subtract: Target='${targetMesh.name || targetMesh.uuid}', Tool='${toolMesh.name || toolMesh.uuid}'`);

    // IMPORTANT: three-csg-ts works best if meshes are at the world origin with no rotation/scale,
    // or if their matrices are applied to their geometries beforehand.
    // It converts meshes to its own BSP tree representation.
    // For simplicity, let's try with current matrices, but be aware this can be a source of issues.
    // A more robust way is to bake transformations into geometry vertices.

    try {
        // Update matrices just in case
        targetMesh.updateMatrixWorld();
        toolMesh.updateMatrixWorld();

        // Convert THREE.Mesh to CSG objects
        // The library handles the matrix transformation internally.
        const targetCSG = CSG.fromMesh(targetMesh);
        const toolCSG = CSG.fromMesh(toolMesh);

        // Perform the subtraction (target - tool)
        const resultCSG = targetCSG.subtract(toolCSG);

        // Convert the result back to a THREE.Mesh
        // The resulting mesh will have the material of the FIRST mesh (targetCSG)
        const resultMesh = CSG.toMesh(resultCSG, targetMesh.matrix); // Apply target's original world matrix
        resultMesh.material = targetMesh.material; // Re-apply original material, or a new one

        resultMesh.name = `${targetMesh.name || 'BooleanResult'}_hollowed`;

        // --- Replace the original targetMesh ---
        // 1. Remove original meshes from scene and architecturalElements
        scene.remove(targetMesh);
        scene.remove(toolMesh); // Tool mesh is consumed

        const targetIndex = architecturalElements.indexOf(targetMesh);
        if (targetIndex > -1) architecturalElements.splice(targetIndex, 1);
        const toolIndex = architecturalElements.indexOf(toolMesh);
        if (toolIndex > -1) architecturalElements.splice(toolIndex, 1);

        if (targetMesh.geometry) targetMesh.geometry.dispose();
        if (targetMesh.material) {}
        if (toolMesh.geometry) toolMesh.geometry.dispose();
        if (toolMesh.material) { }

        // 2. Add the new result mesh
        addObjectToScene(resultMesh, 'boolean-result'); // Use your existing function
        registerArchitecturalElement(resultMesh, 'boolean-result'); // Register it

        // 3. Update activeObject and selection if targetMesh was active/selected
        if (activeObject === targetMesh) {
            activeObject = resultMesh;
        }
        deselectAllArchElements(); // Clear old selections
        selectArchElement(resultMesh); // Select the new resulting mesh

        console.log("Boolean subtraction successful. New mesh:", resultMesh.name);
        if (isModelingMode && activeObject === resultMesh) {
            showMeshStructure(activeObject); // Update V/E/F helpers if in modeling mode
        }

    } catch (error) {
        console.error("Error during Boolean subtraction:", error);
        alert("Boolean operation failed. Check console for errors. Ensure meshes are manifold (watertight) and not overly complex.");
        // It's good practice to restore the scene to pre-operation state if possible,
        // but that requires more complex state management (undo system).
    }
}*/




