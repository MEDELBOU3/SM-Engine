let helperUpdateTimeout = null;
let lastHelperUpdateTime = 0;
const MIN_UPDATE_INTERVAL = 200; // ms between updates
const MAX_HELPERS = 2000; // Maximum number of helpers to display
let isPerformanceMode = true; // Default to performance mode for high-poly models


let isTransforming = false;
 function setupTransformControls() {
    if (transformControls && controls) {
        // This event fires when starting/ending a transform operation
        transformControls.addEventListener('dragging-changed', function(event) {
            isTransforming = event.value;
            
            // Only disable controls if we're not in locked mode already
            if (!isLocked) {
                controls.enabled = !isTransforming;
            }
            
            console.log("Transform dragging:", isTransforming, "Controls enabled:", controls.enabled);
        });
        
        // Additional event listener to ensure controls get re-enabled
        transformControls.addEventListener('mouseUp', function() {
            if (!isLocked && isTransforming) {
                isTransforming = false;
                controls.enabled = true;
                console.log("Transform mouseUp - Controls re-enabled");
            }
        });
    }
}


// Initialize the transform controls
function initTransformControls() {
    transformControls.setSize(0.75);
    transformControls.setSpace('local');
    transformControls.setMode('translate');

    transformControls.addEventListener('objectChange', () => {
        if (activeObject && transformControls.object) {
            updateMeshGeometry();
        }
    });

    transformControls.addEventListener('dragging-changed', (event) => {
        if (controls) {
            controls.enabled = !event.value;
        }
    });

    window.addEventListener('keydown', (event) => {
        if (!isModelingMode) return;
        switch (event.key) {
            case 't': transformControls.setMode('translate'); break;
            case 'r': transformControls.setMode('rotate'); break;
            case 's': transformControls.setMode('scale'); break;
        }
    });
}

// Toggle modeling mode
function toggleModelingMode() {
    isModelingMode = !isModelingMode;
    const modelingButtons = ['select-vertex', 'select-edge', 'select-face'];
    modelingButtons.forEach(id => {
        document.getElementById(id).disabled = !isModelingMode;
    });

    if (isModelingMode && activeObject) {
        showMeshStructure(activeObject);
    } else {
        clearMeshStructure();
        transformControls.detach();
    }
}


function setSelectionMode(mode) {
    if (!isModelingMode) return;
    selectionMode = mode;
    clearSelection();
    if (activeObject) {
        showMeshStructure(activeObject);
    }
}

function clearMeshStructure() {
    vertexHelpers.clear();
    edgeHelpers.clear();
    faceHelpers.clear();
}


function onModelingMouseMove(event) {
    if (!isModelingMode || !activeObject) return;

    const now = Date.now();
    if (now - lastHelperUpdateTime < 50) return;

    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);

    resetHighlights();

    switch (selectionMode) {
        case 'vertex': highlightVertices(); break;
        case 'edge': highlightEdges(); break;
        case 'face': highlightFaces(); break;
    }
}

function onModelingClick(event) {
    if (!isModelingMode || !activeObject) return;

    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);

    switch (selectionMode) {
        case 'vertex':
            const vertexIntersects = raycaster.intersectObjects(vertexHelpers.children, true);
            if (vertexIntersects.length > 0) selectVertex(vertexIntersects[0]);
            break;
        case 'edge':
            const edgeIntersects = raycaster.intersectObjects(edgeHelpers.children, true);
            if (edgeIntersects.length > 0) selectEdge(edgeIntersects[0]);
            break;
        case 'face':
            const faceIntersects = raycaster.intersectObjects(faceHelpers.children, true);
            if (faceIntersects.length > 0) selectFace(faceIntersects[0]);
            break;
    }
}
        
// Highlight vertices on hover
function highlightVertices() {
    resetHighlights();
    const intersects = raycaster.intersectObjects(vertexHelpers.children, true);

    if (intersects.length > 0) {
        const hitObject = intersects[0].object;

        if (hitObject.userData.type === 'vertex-instanced') {
            const instanceId = intersects[0].instanceId;
            if (instanceId !== undefined) {
                const tempMaterial = new THREE.MeshBasicMaterial({ color: 0xFF0000 });
                const tempGeom = new THREE.SphereGeometry(
                    parseFloat(document.getElementById('vertexSizeSlider').value) * 0.12
                );

                const vertexIndex = hitObject.userData.vertexIndices[instanceId];
                const vertex = new THREE.Vector3().fromBufferAttribute(
                    activeObject.geometry.attributes.position, vertexIndex
                ).applyMatrix4(activeObject.matrixWorld);

                const highlightSphere = new THREE.Mesh(tempGeom, tempMaterial);
                highlightSphere.position.copy(vertex);
                highlightSphere.userData = { isHighlight: true };

                vertexHelpers.children.forEach(child => {
                    if (child.userData.isHighlight) {
                        vertexHelpers.remove(child);
                    }
                });

                vertexHelpers.add(highlightSphere);
            }
        }
    }
}

// Highlight edges on hover
function highlightEdges() {
    resetHighlights();
    const intersects = raycaster.intersectObjects(edgeHelpers.children, true);
    if (intersects.length > 0) {
        intersects[0].object.material.color.set(0xFF0000);
    }
}

function highlightFaces() {
    resetHighlights();
    const intersects = raycaster.intersectObjects(faceHelpers.children, true);
    if (intersects.length > 0) {
        intersects[0].object.material.color.set(0xFF0000);
    }
}

function resetHighlights() {
    vertexHelpers.children.forEach(child => {
        if (selectedElements.length === 0 || !selectedElements.includes(child)) {
            child.material.color.set(0x2222FF);
        }
    });

    edgeHelpers.children.forEach(child => {
        if (selectedElements.length === 0 || !selectedElements.some(elem => elem.userData.edge === child)) {
            child.material.color.set(0xE67E22);
        }
    });

    faceHelpers.children.forEach(child => {
        if (selectedElements.length === 0 || !selectedElements.some(elem => elem.userData.face === child)) {
            child.material.color.set(0x44DD88);
        }
    });
}

function selectVertex(intersection) {
    clearSelection();
    const hitObject = intersection.object;

    if (hitObject.userData.type === 'vertex-instanced') {
        const instanceId = intersection.instanceId;
        if (instanceId !== undefined) {
            const vertexIndex = hitObject.userData.vertexIndices[instanceId];
            const vertex = new THREE.Vector3().fromBufferAttribute(
                activeObject.geometry.attributes.position, vertexIndex
            ).applyMatrix4(activeObject.matrixWorld);

            const vertexProxy = new THREE.Object3D();
            vertexProxy.position.copy(vertex);
            vertexProxy.userData = { type: 'vertex', vertexIndex, instancedMesh: hitObject, instanceId };
            scene.add(vertexProxy);

            selectedElements = [vertexProxy];
            transformControls.attach(vertexProxy);
            console.log("Selected vertex index:", vertexIndex);
        }
    }
}

function selectEdge(intersection) {
    clearSelection();
    const edge = intersection.object;
    const indices = edge.userData.indices;

    const vertices = indices.map(index =>
        new THREE.Vector3().fromBufferAttribute(activeObject.geometry.attributes.position, index).applyMatrix4(activeObject.matrixWorld)
    );
    const center = vertices[0].clone().add(vertices[1]).multiplyScalar(0.5);

    const edgeCenter = new THREE.Object3D();
    edgeCenter.position.copy(center);
    edgeCenter.userData = {
        type: 'edge',
        edge,
        indices,
        originalVertices: vertices.map(v => v.clone()),
        originalCenter: center.clone()
    };
    scene.add(edgeCenter);

    selectedElements = [edgeCenter];
    edge.material.color.set(0xFF0000);
    transformControls.attach(edgeCenter);
    console.log("Selected edge between vertices:", indices);
}

function selectFace(intersection) {
    clearSelection();
    const face = intersection.object;
    const indices = face.userData.indices;

    const vertices = indices.map(index =>
        new THREE.Vector3().fromBufferAttribute(activeObject.geometry.attributes.position, index).applyMatrix4(activeObject.matrixWorld)
    );
    const center = new THREE.Vector3().addVectors(vertices[0], vertices[1]).add(vertices[2]).divideScalar(3);

    const faceCenter = new THREE.Object3D();
    faceCenter.position.copy(center);
    faceCenter.userData = {
        type: 'face',
        face,
        indices,
        originalVertices: vertices.map(v => v.clone()),
        originalCenter: center.clone()
    };
    scene.add(faceCenter);

    selectedElements = [faceCenter];
    face.material.color.set(0xFF0000);
    transformControls.attach(faceCenter);
    console.log("Selected face with vertices:", indices);
}

function updateMeshGeometry() {
    if (!activeObject || selectedElements.length === 0) return;

    const selectedElement = selectedElements[0];
    const geometry = activeObject.geometry;
    const positions = geometry.attributes.position;
    const mode = transformControls.getMode();

    activeObject.updateMatrixWorld();
    const matrixWorld = activeObject.matrixWorld.clone();
    const inverseMatrix = new THREE.Matrix4().copy(matrixWorld).invert();

    if (selectedElement.userData.type === 'vertex') {
        // Vertex transformation - this is working correctly
        const vertexIndex = selectedElement.userData.vertexIndex;
        const worldPos = selectedElement.position.clone();
        const localPos = worldPos.applyMatrix4(inverseMatrix);

        positions.setXYZ(vertexIndex, localPos.x, localPos.y, localPos.z);

        if (selectedElement.userData.instancedMesh) {
            const instancedMesh = selectedElement.userData.instancedMesh;
            const instanceId = selectedElement.userData.instanceId;
            if (instanceId !== undefined) {
                const dummy = new THREE.Object3D();
                dummy.position.copy(worldPos);
                dummy.updateMatrix();
                instancedMesh.setMatrixAt(instanceId, dummy.matrix);
                instancedMesh.instanceMatrix.needsUpdate = true;
            }
        }
    } else if (selectedElement.userData.type === 'edge' || selectedElement.userData.type === 'face') {
        const indices = selectedElement.userData.indices;
        const originalCenter = selectedElement.userData.originalCenter;
        const newCenter = selectedElement.position.clone();
        
        // Get transformation information
        const translation = newCenter.clone().sub(originalCenter);
        const rotation = selectedElement.quaternion.clone();
        const scale = selectedElement.scale.clone();
        
        // Create transformation matrix
        const transformMatrix = new THREE.Matrix4();
        
        if (mode === 'translate') {
            // For translation, only apply the translation
            transformMatrix.makeTranslation(translation.x, translation.y, translation.z);
        } else if (mode === 'rotate') {
            // For rotation, apply rotation around the original center
            transformMatrix.makeTranslation(originalCenter.x, originalCenter.y, originalCenter.z);
            transformMatrix.multiply(new THREE.Matrix4().makeRotationFromQuaternion(rotation));
            transformMatrix.multiply(new THREE.Matrix4().makeTranslation(-originalCenter.x, -originalCenter.y, -originalCenter.z));
        } else if (mode === 'scale') {
            // Clamp scale values
            scale.x = THREE.MathUtils.clamp(scale.x, 0.1, 10);
            scale.y = THREE.MathUtils.clamp(scale.y, 0.1, 10);
            scale.z = THREE.MathUtils.clamp(scale.z, 0.1, 10);
            
            // For scaling, apply scale around the original center
            transformMatrix.makeTranslation(originalCenter.x, originalCenter.y, originalCenter.z);
            transformMatrix.multiply(new THREE.Matrix4().makeScale(scale.x, scale.y, scale.z));
            transformMatrix.multiply(new THREE.Matrix4().makeTranslation(-originalCenter.x, -originalCenter.y, -originalCenter.z));
        }
        
        // Apply transformation to each vertex
        indices.forEach((index, i) => {
            const originalVertex = selectedElement.userData.originalVertices[i].clone();
            
            // Apply the transformation
            const newVertex = originalVertex.clone().applyMatrix4(transformMatrix);
            
            // Convert to local space and update position
            const localPos = newVertex.clone().applyMatrix4(inverseMatrix);
            positions.setXYZ(index, localPos.x, localPos.y, localPos.z);
        });
    }

    positions.needsUpdate = true;
    geometry.computeBoundingSphere();
    geometry.computeBoundingBox();
    geometry.computeVertexNormals();

    if (helperUpdateTimeout) clearTimeout(helperUpdateTimeout);
    helperUpdateTimeout = setTimeout(() => {
        showMeshStructure(activeObject);
    }, 100);
}

function validateTransformation(newPositions) {
    // Check for extreme movements
    for (const {position} of newPositions) {
        if (position.length() > 1000 || isNaN(position.length())) {
            return false;
        }
    }

    // Check for face flipping (for triangles)
    if (newPositions.length === 3) {
        const v1 = newPositions[1].position.clone().sub(newPositions[0].position);
        const v2 = newPositions[2].position.clone().sub(newPositions[0].position);
        const normal = v1.cross(v2);
        if (normal.length() < 0.00001) {  // Check for degenerate triangles
            return false;
        }
    }

    return true;
}

// Helper function to fix face orientation
function fixFaceOrientation(geometry, indices) {
    const positions = geometry.attributes.position;
    const v0 = new THREE.Vector3().fromBufferAttribute(positions, indices[0]);
    const v1 = new THREE.Vector3().fromBufferAttribute(positions, indices[1]);
    const v2 = new THREE.Vector3().fromBufferAttribute(positions, indices[2]);
    
    const normal = new THREE.Vector3()
        .crossVectors(
            v1.clone().sub(v0),
            v2.clone().sub(v0)
        ).normalize();

    // If normal is pointing inward, flip the face
    if (normal.dot(v0.normalize()) < 0) {
        // Swap two vertices to flip face orientation
        const temp = indices[1];
        indices[1] = indices[2];
        indices[2] = temp;
    }
}

function updateEdgeFaceHelpers() {
    edgeHelpers.clear();
    faceHelpers.clear();

    if (!activeObject || !activeObject.geometry) return;

    const geometry = activeObject.geometry;
    const positions = geometry.attributes.position;
    const matrix = activeObject.matrixWorld;
    const edgeThickness = parseFloat(document.getElementById('edgeThicknessSlider').value);
    const faceOpacity = parseFloat(document.getElementById('faceOpacitySlider').value);

    if (selectionMode === 'edge' || selectionMode === 'all') {
        if (geometry.index) {
            const edgeSet = new Set();
            const indices = geometry.index.array;

            for (let i = 0; i < indices.length; i += 3) {
                for (let j = 0; j < 3; j++) {
                    const start = indices[i + j];
                    const end = indices[i + (j + 1) % 3];

                    const edgeKey = start < end ? `${start}_${end}` : `${end}_${start}`;

                    if (!edgeSet.has(edgeKey)) {
                        edgeSet.add(edgeKey);

                        const startVert = new THREE.Vector3().fromBufferAttribute(positions, start).applyMatrix4(matrix);
                        const endVert = new THREE.Vector3().fromBufferAttribute(positions, end).applyMatrix4(matrix);

                        const edgeGeom = new THREE.BufferGeometry().setFromPoints([startVert, endVert]);
                        const edgeMat = new THREE.LineBasicMaterial({
                            color: 0xE67E22,
                            linewidth: edgeThickness
                        });

                        const edge = new THREE.Line(edgeGeom, edgeMat);
                        edge.userData = { type: 'edge', indices: [start, end] };
                        edgeHelpers.add(edge);
                    }
                }
            }
        }
    }

    if (selectionMode === 'face' || selectionMode === 'all') {
        if (geometry.index) {
            const indices = geometry.index.array;

            for (let i = 0; i < indices.length; i += 3) {
                const vA = new THREE.Vector3().fromBufferAttribute(positions, indices[i]).applyMatrix4(matrix);
                const vB = new THREE.Vector3().fromBufferAttribute(positions, indices[i + 1]).applyMatrix4(matrix);
                const vC = new THREE.Vector3().fromBufferAttribute(positions, indices[i + 2]).applyMatrix4(matrix);

                const faceGeom = new THREE.BufferGeometry().setFromPoints([vA, vB, vC]);
                const faceMat = new THREE.MeshBasicMaterial({
                    color: 0x44DD88,
                    transparent: true,
                    opacity: faceOpacity,
                    side: THREE.DoubleSide
                });

                const faceMesh = new THREE.Mesh(faceGeom, faceMat);
                faceMesh.userData = {
                    type: 'face',
                    indices: [indices[i], indices[i + 1], indices[i + 2]],
                    faceIndex: i / 3
                };
                faceHelpers.add(faceMesh);
            }
        }
    }
}

function setupModelingEventListeners() {
    window.addEventListener('mousemove', onModelingMouseMove);
    window.addEventListener('click', onModelingClick);

    document.getElementById('toggle-modeling').addEventListener('click', toggleModelingMode);
    document.getElementById('select-vertex').addEventListener('click', () => setSelectionMode('vertex'));
    document.getElementById('select-edge').addEventListener('click', () => setSelectionMode('edge'));
    document.getElementById('select-face').addEventListener('click', () => setSelectionMode('face'));

    const modeButton = document.createElement('button');
    modeButton.id = 'performance-mode';
    modeButton.className = 'panel-button';
    modeButton.textContent = 'Performance Mode: ON';
    modeButton.addEventListener('click', togglePerformanceMode);
    document.getElementById('toggle-modeling').parentNode.insertBefore(modeButton, document.getElementById('toggle-modeling').nextSibling);

    document.getElementById('vertexSizeSlider').addEventListener('input', () => {
        if (activeObject) showMeshStructure(activeObject);
    });
    document.getElementById('edgeThicknessSlider').addEventListener('input', () => {
        if (activeObject) showMeshStructure(activeObject);
    });
    document.getElementById('faceOpacitySlider').addEventListener('input', () => {
        if (activeObject) showMeshStructure(activeObject);
    });
    document.getElementById('subdivisionLevelsSlider').addEventListener('input', updateSubdivision);
}


function updateSubdivision() {
    if (!activeObject) return;

    const subdivisionLevel = parseInt(document.getElementById('subdivisionLevelsSlider').value);

    if (activeObject && activeObject.geometry) {
        transformControls.detach();

        const modifier = new THREE.SubdivisionModifier(subdivisionLevel);
        const newGeometry = modifier.modify(activeObject.geometry);

        activeObject.geometry.dispose();
        activeObject.geometry = newGeometry;

        showMeshStructure(activeObject);
    }
}


function togglePerformanceMode() {
    isPerformanceMode = !isPerformanceMode;
    document.getElementById('performance-mode').textContent =
        isPerformanceMode ? "Performance Mode: ON" : "Quality Mode: ON";

    if (activeObject) {
        showMeshStructure(activeObject);
    }
}

// Modified showMeshStructure with performance optimizations
function showMeshStructure(object) {
    if (helperUpdateTimeout) clearTimeout(helperUpdateTimeout);

    const now = Date.now();
    if (now - lastHelperUpdateTime < MIN_UPDATE_INTERVAL) {
        helperUpdateTimeout = setTimeout(() => showMeshStructure(object), MIN_UPDATE_INTERVAL);
        return;
    }

    lastHelperUpdateTime = now;
    clearMeshStructure();

    if (!object || !object.geometry) return;
    activeObject = object;

    const geometry = object.geometry;
    const positions = geometry.attributes.position;
    const matrix = object.matrixWorld;
    const vertexSize = parseFloat(document.getElementById('vertexSizeSlider').value) * 0.1;
    const edgeThickness = parseFloat(document.getElementById('edgeThicknessSlider').value);
    const faceOpacity = parseFloat(document.getElementById('faceOpacitySlider').value);

    if (!isPerformanceMode || positions.count <= MAX_HELPERS) {
        if (selectionMode === 'vertex' || selectionMode === 'all') {
            const instanceCount = Math.min(positions.count, MAX_HELPERS);
            const sphereGeom = new THREE.SphereGeometry(vertexSize);
            const sphereMat = new THREE.MeshBasicMaterial({ color: 0x2222FF, transparent: true, opacity: 0.8 });
            const instancedMesh = new THREE.InstancedMesh(sphereGeom, sphereMat, instanceCount);

            instancedMesh.userData.vertexIndices = [];
            const dummy = new THREE.Object3D();

            for (let i = 0; i < instanceCount; i++) {
                const vertex = new THREE.Vector3().fromBufferAttribute(positions, i).applyMatrix4(matrix);
                dummy.position.copy(vertex);
                dummy.updateMatrix();
                instancedMesh.setMatrixAt(i, dummy.matrix);
                instancedMesh.userData.vertexIndices.push(i);
            }

            instancedMesh.userData.type = 'vertex-instanced';
            instancedMesh.instanceMatrix.needsUpdate = true;
            vertexHelpers.add(instancedMesh);
        }

        updateEdgeFaceHelpers();
    } else {
        createReducedMeshHelpers(positions, matrix, null, vertexSize, edgeThickness, faceOpacity);
    }
}

// New function to create reduced set of helpers
function createReducedMeshHelpers(positions, matrix, frustum, vertexSize, edgeThickness, faceOpacity) {
    const camPos = camera.position;
    const vertexDistances = [];

    for (let i = 0; i < positions.count; i++) {
        const vertex = new THREE.Vector3().fromBufferAttribute(positions, i).applyMatrix4(matrix);
        vertexDistances.push({ index: i, distance: vertex.distanceTo(camPos), position: vertex });
    }

    vertexDistances.sort((a, b) => a.distance - b.distance);
    const visibleVertices = vertexDistances.slice(0, Math.min(vertexDistances.length, MAX_HELPERS / 3));

    if (selectionMode === 'vertex' || selectionMode === 'all') {
        const instanceCount = visibleVertices.length;
        if (instanceCount > 0) {
            const sphereGeom = new THREE.SphereGeometry(vertexSize);
            const sphereMat = new THREE.MeshBasicMaterial({ color: 0x2222FF, transparent: true, opacity: 0.8 });
            const instancedMesh = new THREE.InstancedMesh(sphereGeom, sphereMat, instanceCount);

            instancedMesh.userData.vertexIndices = [];
            const dummy = new THREE.Object3D();

            for (let i = 0; i < instanceCount; i++) {
                const vertexInfo = visibleVertices[i];
                dummy.position.copy(vertexInfo.position);
                dummy.updateMatrix();
                instancedMesh.setMatrixAt(i, dummy.matrix);
                instancedMesh.userData.vertexIndices.push(vertexInfo.index);
            }

            instancedMesh.userData.type = 'vertex-instanced';
            instancedMesh.instanceMatrix.needsUpdate = true;
            vertexHelpers.add(instancedMesh);
        }
    }

    if (activeObject.geometry.index) {
        createOptimizedEdgeHelpers(visibleVertices, positions, matrix, edgeThickness);
        createOptimizedFaceHelpers(visibleVertices, positions, matrix, faceOpacity);
    }
}

// Create optimized edge helpers
function createOptimizedEdgeHelpers(visibleVertices, positions, matrix, edgeThickness) {
    if (selectionMode !== 'edge' && selectionMode !== 'all') return;

    const visibleVertexIndices = new Set(visibleVertices.map(v => v.index));
    const indices = activeObject.geometry.index.array;
    const edgeMap = new Map();

    for (let i = 0; i < indices.length; i += 3) {
        for (let j = 0; j < 3; j++) {
            const start = indices[i + j];
            const end = indices[i + (j + 1) % 3];
            if (visibleVertexIndices.has(start) || visibleVertexIndices.has(end)) {
                const edgeKey = start < end ? `${start}_${end}` : `${end}_${start}`;
                if (!edgeMap.has(edgeKey)) {
                    edgeMap.set(edgeKey, { indices: [start, end] });
                }
            }
        }
    }

    edgeMap.forEach((data) => {
        const startVert = new THREE.Vector3().fromBufferAttribute(positions, data.indices[0]).applyMatrix4(matrix);
        const endVert = new THREE.Vector3().fromBufferAttribute(positions, data.indices[1]).applyMatrix4(matrix);

        const edgeGeom = new THREE.BufferGeometry().setFromPoints([startVert, endVert]);
        const edgeMat = new THREE.LineBasicMaterial({ color: 0xE67E22, linewidth: edgeThickness });
        const edge = new THREE.Line(edgeGeom, edgeMat);
        edge.userData = { type: 'edge', indices: data.indices };
        edgeHelpers.add(edge);
    });
}

function createOptimizedFaceHelpers(visibleVertices, positions, matrix, faceOpacity) {
    if (selectionMode !== 'face' && selectionMode !== 'all') return;

    const visibleVertexIndices = new Set(visibleVertices.map(v => v.index));
    const indices = activeObject.geometry.index.array;
    const visibleFaces = [];

    for (let i = 0; i < indices.length; i += 3) {
        const a = indices[i];
        const b = indices[i + 1];
        const c = indices[i + 2];
        if (visibleVertexIndices.has(a) || visibleVertexIndices.has(b) || visibleVertexIndices.has(c)) {
            visibleFaces.push({ indices: [a, b, c], faceIndex: i / 3 });
        }
    }

    visibleFaces.forEach(face => {
        const vA = new THREE.Vector3().fromBufferAttribute(positions, face.indices[0]).applyMatrix4(matrix);
        const vB = new THREE.Vector3().fromBufferAttribute(positions, face.indices[1]).applyMatrix4(matrix);
        const vC = new THREE.Vector3().fromBufferAttribute(positions, face.indices[2]).applyMatrix4(matrix);

        const faceGeom = new THREE.BufferGeometry().setFromPoints([vA, vB, vC]);
        const faceMat = new THREE.MeshBasicMaterial({ color: 0x44DD88, transparent: true, opacity: faceOpacity, side: THREE.DoubleSide });
        const faceMesh = new THREE.Mesh(faceGeom, faceMat);
        faceMesh.userData = { type: 'face', indices: face.indices, faceIndex: face.faceIndex };
        faceHelpers.add(faceMesh);
    });
}

window.addEventListener('load', init);
