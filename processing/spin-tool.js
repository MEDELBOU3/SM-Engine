// --- Spin Tool State ---
let isSpinMode = false;
let spinState = null; // 'defining_center', 'defining_axis', 'spinning'
let spinData = {
    orderedProfile: [],
    originalPositions: [],
    center: new THREE.Vector3(),
    axis: new THREE.Vector3(0, 1, 0),
    steps: 12,
    angle: 360,
};
let spinPreviewGroup = null; // For the simple axis definition gizmo
let spinGizmoGroup = null;   // For the advanced interactive gizmo
let spinResultMesh = null;   // The temporary mesh showing the spin result

// Texture for gizmo handles, prevents needing an external file
const handleTextureURI = "data:image/svg+xml,%3Csvg width='64' height='64' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M28 0v28H0v8h28v28h8V36h28v-8H36V0h-8z' fill='white'/%3E%3C/svg%3E";

// =================================================================
// === ADVANCED SPIN TOOL (Corrected & Complete)
// =================================================================

/**
 * Initiates the Spin tool. This is called when the 'tool-spin' button is clicked.
 */
function initiateSpinTool() {
    if (isSpinMode) {
        cancelSpinTool();
        return;
    }
    if (!activeObject || selectedElements.length < 2) {
        alert("Spin Tool Error: Please select a profile of connected vertices or edges first.");
        return;
    }

    const orderedVertices = orderSelectedVerticesForSpin();
    if (!orderedVertices) {
        alert("Spin Tool Error: The selection does not form a single, continuous path.");
        return;
    }

    // Deactivate any other active tool to prevent conflicts.
    if (isLoopCutMode) cancelLoopCut();
    deactivateCurrentArchTool();
    if (controls) controls.enabled = false;
    transformControls.detach();

    // Set up the initial state for the Spin tool
    isSpinMode = true;
    spinState = 'defining_center';
    spinData.orderedProfile = orderedVertices;
    spinData.originalPositions = orderedVertices.map(index =>
        new THREE.Vector3().fromBufferAttribute(activeObject.geometry.attributes.position, index)
    );

    // Show the dedicated UI panel for the spin tool
    document.querySelectorAll('.tool-options').forEach(el => el.style.display = 'none');
    document.getElementById('spin-options').style.display = 'block';
    updateSpinInstructions("Click in the scene to place the spin center/pivot point.");

    // Hook up UI buttons for this session. They will be unhooked on cleanup.
    document.getElementById('spinStepsSlider').addEventListener('input', handleSpinUIChange);
    document.getElementById('spinAngleSlider').addEventListener('input', handleSpinUIChange);
    document.getElementById('spin-apply-button').addEventListener('click', finalizeSpinTool);
    document.getElementById('spin-cancel-button').addEventListener('click', cancelSpinTool);
}

/**
 * Central interaction handler, called by global event handlers when isSpinMode is true.
 */
function handleSpinToolInteraction(event) {
    // We only need the intersection point if we're in a state that uses it.
    let intersectionPoint = null;
    if (spinState === 'defining_center' || spinState === 'defining_axis') {
        const intersects = raycaster.intersectObject(activeObject, true);
        intersectionPoint = intersects.length > 0 ? intersects[0].point : getGroundPlaneIntersection();
        if (!intersectionPoint) return; // Can't proceed without a point
    }

    if (event.type === 'click') {
        if (spinState === 'defining_center') {
            spinData.center.copy(intersectionPoint);
            createSpinPreview(); // Create the simple axis-definition preview
            spinState = 'defining_axis';
            updateSpinInstructions("Click to define the spin axis direction from the center.");
        } else if (spinState === 'defining_axis') {
            spinData.axis.subVectors(intersectionPoint, spinData.center).normalize();
            if (spinData.axis.length() < 0.1) spinData.axis.set(0, 1, 0); // Default to Y-axis if axis is zero
            spinState = 'spinning';
            
            // Transition from the simple preview to the advanced gizmo
            if (spinPreviewGroup) scene.remove(spinPreviewGroup);
            spinPreviewGroup = null;
            createSpinGizmo();

            activeObject.visible = false;
            updateSpinInstructions("Adjust sliders, then click Apply.");
            updateSpinGeometry(); // Create the initial spun mesh and update gizmo
        }
    } else if (event.type === 'mousemove') {
        if (spinState === 'defining_axis') {
            updateSpinPreview(intersectionPoint);
        }
    }
}

/**
 * Updates the instruction text in the spin tool's UI panel.
 */
function updateSpinInstructions(text) {
    const el = document.getElementById('spin-instructions');
    if (el) el.textContent = text;
}

/**
 * Creates the simple visual helper (center point, axis line) used for the 'defining_axis' state.
 */
function createSpinPreview() {
    if (spinPreviewGroup) scene.remove(spinPreviewGroup);
    spinPreviewGroup = new THREE.Group();
    spinPreviewGroup.name = "SpinAxisPreviewHelper";

    const centerMesh = new THREE.Mesh(new THREE.SphereGeometry(0.05), new THREE.MeshBasicMaterial({ color: 0xffff00, depthTest: false }));
    const axisLine = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xffff00, depthTest: false }));
    
    spinPreviewGroup.add(centerMesh, axisLine);
    spinPreviewGroup.position.copy(spinData.center);
    spinPreviewGroup.renderOrder = 999;
    scene.add(spinPreviewGroup);
}

/**
 * Updates the simple axis-definition preview.
 */
function updateSpinPreview(mousePoint) {
    if (!spinPreviewGroup) return;
    const axisVector = new THREE.Vector3().subVectors(mousePoint, spinData.center);
    const axisLine = spinPreviewGroup.children[1];
    axisLine.geometry.dispose();
    axisLine.geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), axisVector]);
}

/**
 * Creates the complete, Blender-style interactive spin gizmo.
 */
function createSpinGizmo() {
    if (spinGizmoGroup) scene.remove(spinGizmoGroup);
    spinGizmoGroup = new THREE.Group();
    spinGizmoGroup.name = "SpinGizmo";

    let totalRadius = 0;
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(spinData.axis, spinData.center);
    for (const pos of spinData.originalPositions) {
        totalRadius += plane.distanceToPoint(pos);
    }
    const radius = Math.max(0.1, totalRadius / spinData.originalPositions.length);

    const circleGeom = new THREE.BufferGeometry().setFromPoints(new THREE.Path().absarc(0, 0, radius, 0, Math.PI * 2, true).getPoints(64));
    const mainCircle = new THREE.Line(circleGeom, new THREE.LineBasicMaterial({ color: 0xAAAAAA, transparent: true, opacity: 0.5 }));
    mainCircle.name = "MainCircle";
    spinGizmoGroup.add(mainCircle);

    const angleArc = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x55aaff, linewidth: 2 }));
    angleArc.name = "AngleArc";
    spinGizmoGroup.add(angleArc);

    const handleTexture = new THREE.TextureLoader().load(handleTextureURI);
    const handleMaterial = new THREE.SpriteMaterial({ map: handleTexture, color: 0x55aaff, sizeAttenuation: false, depthTest: false });
    const createHandle = (x, y) => {
        const handle = new THREE.Sprite(handleMaterial.clone());
        handle.position.set(x, y, 0);
        handle.scale.set(0.025, 0.025, 1);
        return handle;
    };
    spinGizmoGroup.add(createHandle(radius, 0), createHandle(-radius, 0), createHandle(0, radius), createHandle(0, -radius));
    
    spinGizmoGroup.position.copy(spinData.center);
    spinGizmoGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), spinData.axis);
    spinGizmoGroup.renderOrder = 998;
    scene.add(spinGizmoGroup);
}

/**
 * Updates the dynamic parts of the gizmo (the blue arc).
 */
function updateSpinGizmo() {
    if (!spinGizmoGroup) return;
    const angleArc = spinGizmoGroup.getObjectByName("AngleArc");
    const mainCircle = spinGizmoGroup.getObjectByName("MainCircle");
    if (!angleArc || !mainCircle) return;

    const radius = mainCircle.geometry.boundingSphere.radius;
    const angleRad = THREE.MathUtils.degToRad(spinData.angle);
    const arcPoints = new THREE.Path().absarc(0, 0, radius, 0, angleRad, false).getPoints(Math.max(2, Math.ceil(spinData.steps * (spinData.angle / 360))));
    
    angleArc.geometry.dispose();
    angleArc.geometry = new THREE.BufferGeometry().setFromPoints(arcPoints);
}

/**
 * Handles input changes from the UI sliders.
 */
function handleSpinUIChange() {
    spinData.steps = parseInt(document.getElementById('spinStepsSlider').value);
    spinData.angle = parseInt(document.getElementById('spinAngleSlider').value);
    document.getElementById('spinStepsValue').textContent = spinData.steps;
    document.getElementById('spinAngleValue').textContent = spinData.angle;
    if (spinState === 'spinning') {
        updateSpinGeometry();
    }
}

/**
 * The core geometry generation function.
 */
function updateSpinGeometry() {
    if (spinResultMesh) {
        scene.remove(spinResultMesh);
        spinResultMesh.geometry.dispose();
    }

    const newVertices = [];
    const angleRad = THREE.MathUtils.degToRad(spinData.angle);
    const isWeld = Math.abs(spinData.angle - 360) < 0.01;
    const segments = spinData.steps;

    for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const currentAngle = t * angleRad;
        const quaternion = new THREE.Quaternion().setFromAxisAngle(spinData.axis, currentAngle);
        for (const p_orig of spinData.originalPositions) {
            const p_final = p_orig.clone().sub(spinData.center).applyQuaternion(quaternion).add(spinData.center);
            newVertices.push(p_final.x, p_final.y, p_final.z);
        }
    }
    
    const newIndices = [];
    const profileSize = spinData.orderedProfile.length;
    for (let i = 0; i < segments; i++) {
        for (let j = 0; j < profileSize - 1; j++) {
            const i0 = i * profileSize + j;
            const i1 = i * profileSize + j + 1;
            const i2 = (isWeld && i === segments - 1) ? (j + 1) : ((i + 1) * profileSize + j + 1);
            const i3 = (isWeld && i === segments - 1) ? j : ((i + 1) * profileSize + j);
            newIndices.push(i0, i1, i3, i1, i2, i3);
        }
    }
    
    const newGeometry = new THREE.BufferGeometry();
    newGeometry.setAttribute('position', new THREE.Float32BufferAttribute(newVertices, 3));
    newGeometry.setIndex(newIndices);
    newGeometry.computeVertexNormals();

    spinResultMesh = new THREE.Mesh(newGeometry, activeObject.material);
    scene.add(spinResultMesh);
    updateSpinGizmo(); // Also update the visual gizmo
}

/**
 * Finalizes the spin operation, replacing the original object's geometry.
 */
function finalizeSpinTool() {
    if (!spinResultMesh) { cancelSpinTool(); return; }
    
    const oldGeometry = activeObject.geometry;
    activeObject.geometry = spinResultMesh.geometry.clone();
    oldGeometry.dispose();

    if (baseGeometries.has(activeObject.uuid)) {
        baseGeometries.set(activeObject.uuid, activeObject.geometry.clone());
    }

    cleanupSpinTool();
    showMeshStructure(activeObject);
}

/**
 * Cancels the spin operation and restores the original state.
 */
function cancelSpinTool() {
    cleanupSpinTool();
}

/**
 * Cleans up all resources and state related to the spin tool.
 */
function cleanupSpinTool() {
    if (!isSpinMode) return;
    isSpinMode = false;
    spinState = null;
    
    if (spinPreviewGroup) scene.remove(spinPreviewGroup);
    if (spinGizmoGroup) scene.remove(spinGizmoGroup);
    if (spinResultMesh) scene.remove(spinResultMesh);
    spinPreviewGroup = spinGizmoGroup = spinResultMesh = null;
    
    activeObject.visible = true;
    
    document.getElementById('spin-options').style.display = 'none';
    
    // Unhook UI listeners to prevent memory leaks and conflicts
    document.getElementById('spinStepsSlider').removeEventListener('input', handleSpinUIChange);
    document.getElementById('spinAngleSlider').removeEventListener('input', handleSpinUIChange);
    document.getElementById('spin-apply-button').removeEventListener('click', finalizeSpinTool);
    document.getElementById('spin-cancel-button').removeEventListener('click', cancelSpinTool);
    
    if (controls) controls.enabled = true;
    showMeshStructure(activeObject);
}

/**
 * Orders selected vertices into a continuous line for the spin profile.
 */
function orderSelectedVerticesForSpin() {
    const vertices = new Set();
    const edges = new Map();

    if (selectedElements.length === 0) return null;

    for (const elem of selectedElements) {
        if (elem.type === 'vertex') {
            vertices.add(elem.indices[0]);
        } else if (elem.type === 'edge') {
            const [u, v] = elem.indices;
            vertices.add(u); vertices.add(v);
            if (!edges.has(u)) edges.set(u, new Set());
            if (!edges.has(v)) edges.set(v, new Set());
            edges.get(u).add(v);
            edges.get(v).add(u);
        }
    }

    if (edges.size === 0 && vertices.size > 1) {
        const allEdges = buildEdgeFaceMap(activeObject.geometry);
        if (!allEdges) return null;
        allEdges.forEach((faces, edgeKey) => {
            const [u, v] = edgeKey.split('_').map(Number);
            if (vertices.has(u) && vertices.has(v)) {
                if (!edges.has(u)) edges.set(u, new Set());
                if (!edges.has(v)) edges.set(v, new Set());
                edges.get(u).add(v);
                edges.get(v).add(u);
            }
        });
    }

    const endpoints = [];
    for (const vertex of vertices) {
        const connectionCount = edges.get(vertex)?.size || 0;
        if (connectionCount === 1) endpoints.push(vertex);
        else if (connectionCount > 2 || (connectionCount === 0 && vertices.size > 1)) return null;
    }

    if (endpoints.length !== 2) return null;
    
    const path = [];
    const visited = new Set();
    let currentNode = endpoints[0];
    
    while (currentNode !== undefined && !visited.has(currentNode)) {
        path.push(currentNode);
        visited.add(currentNode);
        const neighbors = edges.get(currentNode) || new Set();
        let nextNode = undefined;
        for(const neighbor of neighbors) {
            if(!visited.has(neighbor)) {
                nextNode = neighbor;
                break;
            }
        }
        currentNode = nextNode;
    }
    
    return visited.size === vertices.size ? path : null;
}