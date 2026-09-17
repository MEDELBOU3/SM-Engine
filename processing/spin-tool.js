let isSpinMode = false;
let spinUiBound = false;
let spinTransformBound = false;
let spinKeyBound = false;
let spinGizmoGroup = null;
let spinGuideGroup = null;

let spinResultMesh = null;
let spinHandleTexture = null;
let spinSession = null;

const SPIN_MOUSE = new THREE.Vector2();
const SPIN_DEFAULT_AXIS = {
    x: new THREE.Vector3(1, 0, 0),
    y: new THREE.Vector3(0, 1, 0),
    z: new THREE.Vector3(0, 0, 1),
};
const SPIN_TMP_VEC_A = new THREE.Vector3();
const SPIN_TMP_VEC_B = new THREE.Vector3();
const SPIN_TMP_VEC_C = new THREE.Vector3();
const SPIN_TMP_VEC_D = new THREE.Vector3();
const SPIN_TMP_MAT = new THREE.Matrix4();
const SPIN_TMP_BOX = new THREE.Box3();

function getSpinSystem() {
    const sys = window.UnifiedModelingSystem || null;
    if (!sys?.isEditMode || !sys.activeMesh || !sys.editableMesh) return null;
    return sys;
}

function getSpinTargetObject() {
    return spinSession?.mesh || getSpinSystem()?.activeMesh || null;
}

function getSpinUiElement(id) {
    return document.getElementById(id);
}

function refreshSpinToolUIState() {
    window.ModelingToolkitController?.refreshUI?.();
}

function updateSpinInstructions(text) {
    const el = getSpinUiElement("spin-instructions");
    if (el) el.textContent = text;
    refreshSpinToolUIState();
}

function setSpinPanelVisible(isVisible) {
    const panel = getSpinUiElement("spin-options");
    if (panel) panel.style.display = isVisible ? "block" : "none";
}

function setSpinCursor(cursor) {
    if (!renderer?.domElement) return;
    renderer.domElement.style.cursor = cursor || "";
}

function cloneEditableMeshData(source) {
    const clone = Object.create(Object.getPrototypeOf(source));
    clone.vertices = source.vertices.map((vertex) => ({
        position: vertex.position.clone(),
    }));
    clone.faces = source.faces.map((face) => ({
        verts: face.verts.slice(),
    }));
    clone.edges = [];
    clone.edgeMap = new Map();
    clone.vertexFaces = [];
    clone.smoothAngle = source.smoothAngle;
    clone.selectedVertices = new Set(source.selectedVertices);
    clone.selectedEdges = new Set(source.selectedEdges);
    clone.selectedFaces = new Set(source.selectedFaces);
    clone.rebuildTopology();
    return clone;
}

function getSpinHandleTexture() {
    if (!spinHandleTexture) {
        spinHandleTexture = new THREE.TextureLoader().load(
            "data:image/svg+xml,%3Csvg width='64' height='64' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='32' cy='32' r='24' fill='white' fill-opacity='0.9'/%3E%3Cpath d='M32 12v40M12 32h40' stroke='%23000' stroke-width='4' stroke-linecap='round'/%3E%3C/svg%3E"
        );
    }
    return spinHandleTexture;
}

function disposeSpinMaterial(material) {
    if (!material) return;
    if (Array.isArray(material)) {
        material.forEach(disposeSpinMaterial);
        return;
    }
    if (material.map && material.map !== spinHandleTexture) {
        material.map.dispose();
    }
    material.dispose?.();
}

function disposeSpinObject(object) {
    if (!object) return;
    object.traverse((child) => {
        child.geometry?.dispose?.();
        disposeSpinMaterial(child.material);
    });
}

function removeSpinResultMesh() {
    if (!spinResultMesh) return;
    spinResultMesh.parent?.remove(spinResultMesh);
    spinResultMesh.geometry?.dispose?.();
    spinResultMesh = null;
}

function removeSpinGuideGroup() {
    if (!spinGuideGroup) return;
    spinGuideGroup.parent?.remove(spinGuideGroup);
    disposeSpinObject(spinGuideGroup);
    spinGuideGroup = null;
}

function removeSpinGizmoGroup() {
    if (!spinGizmoGroup) return;
    spinGizmoGroup.parent?.remove(spinGizmoGroup);
    disposeSpinObject(spinGizmoGroup);
    spinGizmoGroup = null;
}

function removeSpinControlPivot(session = spinSession) {
    if (!session?.controlPivot) return;
    session.controlPivot.parent?.remove(session.controlPivot);
    session.controlPivot = null;
}

function setSpinRayFromEvent(event) {
    if (!renderer?.domElement || !camera || !raycaster) return false;
    const rect = renderer.domElement.getBoundingClientRect();
    SPIN_MOUSE.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    SPIN_MOUSE.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
    raycaster.layers.set(0);
    raycaster.setFromCamera(SPIN_MOUSE, camera);
    return true;
}

function getSpinPlaneIntersection(event, plane) {
    if (!plane || !setSpinRayFromEvent(event)) return null;
    const hitPoint = new THREE.Vector3();
    return raycaster.ray.intersectPlane(plane, hitPoint) ? hitPoint : null;
}

function signedAngleAroundAxis(from, to, axis) {
    const cross = SPIN_TMP_VEC_A.crossVectors(from, to);
    const sin = cross.dot(axis);
    const cos = THREE.MathUtils.clamp(from.dot(to), -1, 1);
    return Math.atan2(sin, cos);
}

function buildCirclePoints(radius, angleRad = Math.PI * 2, segments = 96) {
    const points = [];
    const clampedSegments = Math.max(4, segments);
    for (let i = 0; i <= clampedSegments; i++) {
        const t = i / clampedSegments;
        const angle = angleRad * t;
        points.push(new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, 0));
    }
    return points;
}

function getSpinAverageScale(session = spinSession) {
    if (!session?.sys?.getAverageScale) return 0.08;
    return Math.max(session.sys.getAverageScale(), 0.05);
}

function syncSpinUiFromState() {
    if (!spinSession) return;

    const stepsSlider = getSpinUiElement("spinStepsSlider");
    const angleSlider = getSpinUiElement("spinAngleSlider");
    const stepsValue = getSpinUiElement("spinStepsValue");
    const angleValue = getSpinUiElement("spinAngleValue");

    if (stepsSlider) stepsSlider.value = String(spinSession.steps);
    if (angleSlider) angleSlider.value = String(spinSession.angle);
    if (stepsValue) stepsValue.textContent = String(spinSession.steps);
    if (angleValue) angleValue.textContent = `${spinSession.angle}\u00b0`;

    document.querySelectorAll("#spin-axis-presets [data-spin-axis]").forEach((button) => {
        button.classList.toggle(
            "btn-primary",
            button.getAttribute("data-spin-axis") === spinSession.axisName
        );
    });
}

function inferEdgeIndicesFromVertices(editableMesh, vertexIndices) {
    const vertexSet = new Set(vertexIndices);
    const inferred = [];
    editableMesh.edges.forEach((edge, edgeIndex) => {
        if (vertexSet.has(edge.a) && vertexSet.has(edge.b)) {
            inferred.push(edgeIndex);
        }
    });
    return inferred;
}

function orderVerticesNearest(editableMesh, vertexIndices) {
    if (vertexIndices.length <= 2) return vertexIndices.slice();

    const remaining = vertexIndices.slice();
    const ordered = [remaining.shift()];

    while (remaining.length) {
        const lastIndex = ordered[ordered.length - 1];
        const lastPos = editableMesh.vertices[lastIndex].position;
        let bestIdx = 0;
        let bestDistance = Infinity;

        for (let i = 0; i < remaining.length; i++) {
            const nextPos = editableMesh.vertices[remaining[i]].position;
            const distance = lastPos.distanceToSquared(nextPos);
            if (distance < bestDistance) {
                bestDistance = distance;
                bestIdx = i;
            }
        }

        ordered.push(remaining.splice(bestIdx, 1)[0]);
    }

    return ordered;
}

function collectSpinSelection(sys) {
    const editableMesh = sys.editableMesh;
    const selectedFaces = [...editableMesh.selectedFaces];
    const selectedEdges = [...editableMesh.selectedEdges];
    const selectedVertices = [...sys.getSelectedVertexIndices()];

    if (!selectedVertices.length) return null;

    const bridgeEdges = [];

    if (selectedFaces.length) {
        const boundaryMap = new Map();
        selectedFaces.forEach((faceIndex) => {
            const face = editableMesh.faces[faceIndex];
            if (!face) return;
            for (let i = 0; i < face.verts.length; i++) {
                const a = face.verts[i];
                const b = face.verts[(i + 1) % face.verts.length];
                const key = a < b ? `${a}_${b}` : `${b}_${a}`;
                if (!boundaryMap.has(key)) {
                    boundaryMap.set(key, { count: 0, oriented: [a, b] });
                }
                boundaryMap.get(key).count += 1;
            }
        });

        boundaryMap.forEach((value) => {
            if (value.count === 1) {
                bridgeEdges.push(value.oriented.slice());
            }
        });
    } else {
        const effectiveEdgeIndices = selectedEdges.length
            ? selectedEdges.slice()
            : inferEdgeIndicesFromVertices(editableMesh, selectedVertices);

        if (effectiveEdgeIndices.length) {
            effectiveEdgeIndices.forEach((edgeIndex) => {
                const edge = editableMesh.edges[edgeIndex];
                if (edge) bridgeEdges.push([edge.a, edge.b]);
            });
        } else if (selectedVertices.length > 1) {
            const ordered = orderVerticesNearest(editableMesh, selectedVertices);
            for (let i = 0; i < ordered.length - 1; i++) {
                bridgeEdges.push([ordered[i], ordered[i + 1]]);
            }
        }
    }

    return {
        vertexIndices: selectedVertices.slice(),
        faceIndices: selectedFaces.slice(),
        edgeIndices: selectedEdges.slice(),
        bridgeEdges,
        canCreateSurface: selectedFaces.length > 0 || bridgeEdges.length > 0,
    };
}

function getSelectionCenterLocal(sys, selection) {
    const center = new THREE.Vector3();
    selection.vertexIndices.forEach((vertexIndex) => {
        const vertex = sys.editableMesh.vertices[vertexIndex];
        if (vertex) center.add(vertex.position);
    });
    return selection.vertexIndices.length
        ? center.divideScalar(selection.vertexIndices.length)
        : new THREE.Vector3();
}

function updateSessionAxis(session, axisName) {
    const worldAxis = (SPIN_DEFAULT_AXIS[axisName] || SPIN_DEFAULT_AXIS.y).clone();
    const localAxisTip = session.mesh.worldToLocal(
        session.pivotWorld.clone().add(worldAxis)
    );

    session.axisName = axisName;
    session.axisWorld.copy(worldAxis.normalize());
    session.axisLocal.copy(localAxisTip.sub(session.pivotLocal).normalize());
}

function getSelectionReferenceVectorWorld(session) {
    for (const vertexIndex of session.selection.vertexIndices) {
        const worldPos = session.originalEditableMesh.vertices[vertexIndex].position
            .clone()
            .applyMatrix4(session.mesh.matrixWorld);
        const radial = worldPos.clone().sub(session.pivotWorld);
        radial.addScaledVector(session.axisWorld, -radial.dot(session.axisWorld));
        if (radial.lengthSq() > 1e-8) return radial.normalize();
    }

    const fallback = Math.abs(session.axisWorld.y) < 0.95
        ? new THREE.Vector3(0, 1, 0)
        : new THREE.Vector3(1, 0, 0);
    return SPIN_TMP_VEC_A.crossVectors(session.axisWorld, fallback).normalize();
}

function getSpinGizmoRadius(session) {
    let radius = 0;

    session.selection.vertexIndices.forEach((vertexIndex) => {
        const worldPos = session.originalEditableMesh.vertices[vertexIndex].position
            .clone()
            .applyMatrix4(session.mesh.matrixWorld);
        const radial = worldPos.clone().sub(session.pivotWorld);
        radial.addScaledVector(session.axisWorld, -radial.dot(session.axisWorld));
        radius = Math.max(radius, radial.length());
    });

    if (radius < 1e-4) {
        SPIN_TMP_BOX.setFromObject(session.mesh);
        radius = Math.max(radius, SPIN_TMP_BOX.getSize(SPIN_TMP_VEC_A).length() * 0.2);
    }

    return Math.max(radius * 1.15, getSpinAverageScale(session) * 2.5);
}

function orientSpinBridgeFace(previewEditableMesh, vertexIndices, pivotLocal, axisLocal) {
    if (vertexIndices.length < 3) return vertexIndices;

    const a = previewEditableMesh.vertices[vertexIndices[0]]?.position;
    const b = previewEditableMesh.vertices[vertexIndices[1]]?.position;
    const c = previewEditableMesh.vertices[vertexIndices[2]]?.position;
    if (!a || !b || !c) return vertexIndices;

    const normal = new THREE.Vector3()
        .subVectors(c, b)
        .cross(new THREE.Vector3().subVectors(a, b))
        .normalize();

    const center = vertexIndices.reduce((sum, vertexIndex) => {
        const vertex = previewEditableMesh.vertices[vertexIndex];
        return vertex ? sum.add(vertex.position) : sum;
    }, new THREE.Vector3()).divideScalar(vertexIndices.length);

    const radial = center
        .clone()
        .sub(pivotLocal)
        .addScaledVector(axisLocal, -center.clone().sub(pivotLocal).dot(axisLocal));

    if (radial.lengthSq() > 1e-8 && normal.dot(radial) < 0) {
        return vertexIndices.slice().reverse();
    }

    return vertexIndices;
}

function buildSpinPreviewEditableMesh(session) {
    const previewEditableMesh = cloneEditableMeshData(session.originalEditableMesh);
    const { selection } = session;
    const segments = Math.max(1, Math.round(session.steps));
    const isClosed = Math.abs(Math.abs(session.angle) - 360) < 0.01;
    const angleRad = THREE.MathUtils.degToRad(session.angle);
    const ringCount = isClosed ? segments : segments + 1;
    const ringMaps = [];

    ringMaps.push(new Map(selection.vertexIndices.map((vertexIndex) => [vertexIndex, vertexIndex])));

    for (let ring = 1; ring < ringCount; ring++) {
        const t = ring / segments;
        const currentAngle = angleRad * t;
        const rotation = new THREE.Quaternion().setFromAxisAngle(session.axisLocal, currentAngle);
        const ringMap = new Map();

        selection.vertexIndices.forEach((vertexIndex) => {
            const source = session.originalEditableMesh.vertices[vertexIndex];
            if (!source) return;
            const rotatedPosition = source.position
                .clone()
                .sub(session.pivotLocal)
                .applyQuaternion(rotation)
                .add(session.pivotLocal);
            const nextIndex = previewEditableMesh.vertices.length;
            previewEditableMesh.vertices.push({ position: rotatedPosition });
            ringMap.set(vertexIndex, nextIndex);
        });

        ringMaps.push(ringMap);
    }

    const nextFaces = previewEditableMesh.faces.map((face) => ({
        verts: face.verts.slice(),
    }));

    if (selection.faceIndices.length) {
        for (let ring = 1; ring < ringCount; ring++) {
            selection.faceIndices.forEach((faceIndex) => {
                const face = session.originalEditableMesh.faces[faceIndex];
                if (!face) return;
                nextFaces.push({
                    verts: face.verts.map((vertexIndex) => ringMaps[ring].get(vertexIndex)),
                });
            });
        }
    }

    if (selection.bridgeEdges.length) {
        for (let segment = 0; segment < segments; segment++) {
            const currentRing = ringMaps[segment];
            const nextRing = isClosed ? ringMaps[(segment + 1) % ringCount] : ringMaps[segment + 1];
            if (!currentRing || !nextRing) continue;

            selection.bridgeEdges.forEach(([a, b]) => {
                const faceVerts = [
                    currentRing.get(a),
                    currentRing.get(b),
                    nextRing.get(b),
                    nextRing.get(a),
                ];
                if (faceVerts.some((index) => !Number.isInteger(index))) return;
                nextFaces.push({
                    verts: orientSpinBridgeFace(
                        previewEditableMesh,
                        faceVerts,
                        session.pivotLocal,
                        session.axisLocal
                    ),
                });
            });
        }
    }

    previewEditableMesh.faces = nextFaces.filter((face) => new Set(face.verts).size >= 3);
    previewEditableMesh.clearSelection();
    previewEditableMesh.rebuildTopology();
    return previewEditableMesh;
}

function buildSpinGuideGroup(session) {
    removeSpinGuideGroup();

    const guideGroup = new THREE.Group();
    guideGroup.name = "SpinGuideGroup";

    const axisLength = session.gizmoRadius * 1.4;
    const axisColors = {
        x: 0xff5a5a,
        y: 0x7ed957,
        z: 0x5aa8ff,
    };

    const axisLine = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
            session.pivotWorld.clone().addScaledVector(session.axisWorld, -axisLength),
            session.pivotWorld.clone().addScaledVector(session.axisWorld, axisLength),
        ]),
        new THREE.LineBasicMaterial({
            color: axisColors[session.axisName] || 0xffffff,
            depthTest: false,
            transparent: true,
            opacity: 0.95,
        })
    );
    axisLine.renderOrder = 998;
    guideGroup.add(axisLine);

    const guideCount = Math.min(session.selection.vertexIndices.length, 8);
    for (let i = 0; i < guideCount; i++) {
        const vertexIndex = session.selection.vertexIndices[i];
        const sourceVertex = session.originalEditableMesh.vertices[vertexIndex];
        if (!sourceVertex) continue;

        const worldPos = sourceVertex.position.clone().applyMatrix4(session.mesh.matrixWorld);
        const radial = worldPos.clone().sub(session.pivotWorld);
        radial.addScaledVector(session.axisWorld, -radial.dot(session.axisWorld));
        if (radial.lengthSq() < 1e-8) continue;

        const points = [];
        const segments = Math.max(12, Math.ceil(Math.abs(session.angle) / 8));
        for (let step = 0; step <= segments; step++) {
            const t = step / segments;
            const angle = THREE.MathUtils.degToRad(session.angle) * t;
            const point = sourceVertex.position
                .clone()
                .sub(session.pivotLocal)
                .applyQuaternion(new THREE.Quaternion().setFromAxisAngle(session.axisLocal, angle))
                .add(session.pivotLocal)
                .applyMatrix4(session.mesh.matrixWorld);
            points.push(point);
        }

        const trace = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints(points),
            new THREE.LineBasicMaterial({
                color: 0xffffff,
                depthTest: false,
                transparent: true,
                opacity: 0.65,
            })
        );
        trace.renderOrder = 997;
        guideGroup.add(trace);
    }

    const pivotMarker = new THREE.Mesh(
        new THREE.SphereGeometry(getSpinAverageScale(session) * 0.55, 12, 12),
        new THREE.MeshBasicMaterial({
            color: 0xffd166,
            depthTest: false,
        })
    );
    pivotMarker.position.copy(session.pivotWorld);
    pivotMarker.renderOrder = 1000;
    guideGroup.add(pivotMarker);

    spinGuideGroup = guideGroup;
    scene.add(spinGuideGroup);
}

function createSpinGizmo(session) {
    removeSpinGizmoGroup();

    const radius = session.gizmoRadius;
    const axisWorld = session.axisWorld.clone().normalize();
    const refWorld = getSelectionReferenceVectorWorld(session);
    const tangentWorld = SPIN_TMP_VEC_A.crossVectors(axisWorld, refWorld).normalize();
    const handleScale = getSpinAverageScale(session) * 2.8;

    SPIN_TMP_MAT.makeBasis(refWorld, tangentWorld, axisWorld);

    spinGizmoGroup = new THREE.Group();
    spinGizmoGroup.name = "SpinGizmo";
    spinGizmoGroup.position.copy(session.pivotWorld);
    spinGizmoGroup.quaternion.setFromRotationMatrix(SPIN_TMP_MAT);
    spinGizmoGroup.renderOrder = 999;

    const ringLine = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(buildCirclePoints(radius, Math.PI * 2, 128)),
        new THREE.LineBasicMaterial({
            color: 0xffffff,
            depthTest: false,
            transparent: true,
            opacity: 0.9,
        })
    );
    ringLine.name = "SpinRingLine";
    ringLine.renderOrder = 999;

    const dragRing = new THREE.Mesh(
        new THREE.TorusGeometry(radius, Math.max(handleScale * 0.08, radius * 0.028), 10, 120),
        new THREE.MeshBasicMaterial({
            color: 0xbfd8ff,
            depthTest: false,
            transparent: true,
            opacity: 0.18,
            side: THREE.DoubleSide,
        })
    );
    dragRing.name = "SpinDragRing";
    dragRing.userData.spinRole = "angle-ring";
    dragRing.renderOrder = 998;

    const angleArc = new THREE.Line(
        new THREE.BufferGeometry(),
        new THREE.LineBasicMaterial({
            color: 0x7ed957,
            depthTest: false,
            transparent: true,
            opacity: 0.95,
        })
    );
    angleArc.name = "SpinAngleArc";
    angleArc.renderOrder = 1000;

    const startSpoke = new THREE.Line(
        new THREE.BufferGeometry(),
        new THREE.LineBasicMaterial({
            color: 0xffffff,
            depthTest: false,
            transparent: true,
            opacity: 0.8,
        })
    );
    startSpoke.name = "SpinStartSpoke";
    startSpoke.renderOrder = 1000;

    const endSpoke = new THREE.Line(
        new THREE.BufferGeometry(),
        new THREE.LineBasicMaterial({
            color: 0xffffff,
            depthTest: false,
            transparent: true,
            opacity: 0.95,
        })
    );
    endSpoke.name = "SpinEndSpoke";
    endSpoke.renderOrder = 1000;

    const pivotHandle = new THREE.Mesh(
        new THREE.SphereGeometry(getSpinAverageScale(session) * 0.48, 16, 16),
        new THREE.MeshBasicMaterial({
            color: 0xffd166,
            depthTest: false,
        })
    );
    pivotHandle.name = "SpinPivotHandle";
    pivotHandle.userData.spinRole = "pivot";
    pivotHandle.renderOrder = 1001;

    const angleHandle = new THREE.Sprite(
        new THREE.SpriteMaterial({
            map: getSpinHandleTexture(),
            color: 0x7ed957,
            sizeAttenuation: true,
            depthTest: false,
            transparent: true,
            opacity: 0.95,
        })
    );
    angleHandle.name = "SpinAngleHandle";
    angleHandle.scale.set(handleScale, handleScale, 1);
    angleHandle.renderOrder = 1001;

    spinGizmoGroup.add(
        dragRing,
        ringLine,
        angleArc,
        startSpoke,
        endSpoke,
        pivotHandle,
        angleHandle
    );

    scene.add(spinGizmoGroup);
    updateSpinGizmo();
}

function updateSpinGizmo() {
    if (!spinSession || !spinGizmoGroup) return;

    spinGizmoGroup.position.copy(spinSession.pivotWorld);

    const axisWorld = spinSession.axisWorld.clone().normalize();
    const refWorld = getSelectionReferenceVectorWorld(spinSession);
    const tangentWorld = SPIN_TMP_VEC_A.crossVectors(axisWorld, refWorld).normalize();
    SPIN_TMP_MAT.makeBasis(refWorld, tangentWorld, axisWorld);
    spinGizmoGroup.quaternion.setFromRotationMatrix(SPIN_TMP_MAT);

    const radius = spinSession.gizmoRadius;
    const angleRad = THREE.MathUtils.degToRad(spinSession.angle);
    const arcSegments = Math.max(12, Math.ceil(Math.abs(spinSession.angle) / 5));
    const endPoint = new THREE.Vector3(Math.cos(angleRad) * radius, Math.sin(angleRad) * radius, 0);

    const angleArc = spinGizmoGroup.getObjectByName("SpinAngleArc");
    const startSpoke = spinGizmoGroup.getObjectByName("SpinStartSpoke");
    const endSpoke = spinGizmoGroup.getObjectByName("SpinEndSpoke");
    const angleHandle = spinGizmoGroup.getObjectByName("SpinAngleHandle");

    if (angleArc) {
        angleArc.geometry?.dispose?.();
        angleArc.geometry = new THREE.BufferGeometry().setFromPoints(
            buildCirclePoints(radius, angleRad, arcSegments)
        );
    }

    if (startSpoke) {
        startSpoke.geometry?.dispose?.();
        startSpoke.geometry = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(radius, 0, 0),
        ]);
    }

    if (endSpoke) {
        endSpoke.geometry?.dispose?.();
        endSpoke.geometry = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(0, 0, 0),
            endPoint,
        ]);
    }

    if (angleHandle) {
        angleHandle.position.copy(endPoint);
    }
}

function syncSpinControlPivotTransform(session) {
    if (!session?.controlPivot) return;
    session.controlPivot.position.copy(session.pivotWorld);
    session.controlPivot.quaternion.setFromAxisAngle(
        session.axisWorld,
        THREE.MathUtils.degToRad(session.angle)
    );
    session.controlPivot.scale.set(1, 1, 1);
    session.controlPivot.updateMatrixWorld(true);
}

function syncSpinTransformAxisVisibility(session) {
    if (!transformControls) return;
    if (typeof transformControls.showX !== "boolean") return;

    if (session.controlMode === "translate") {
        transformControls.showX = true;
        transformControls.showY = true;
        transformControls.showZ = true;
        return;
    }

    transformControls.showX = session.axisName === "x";
    transformControls.showY = session.axisName === "y";
    transformControls.showZ = session.axisName === "z";
}

function attachSpinTransformControls(mode = "rotate") {
    if (!spinSession?.controlPivot || !transformControls) return;

    spinSession.controlMode = mode;
    syncSpinControlPivotTransform(spinSession);

    if (typeof transformControls.setSpace === "function") {
        transformControls.setSpace("world");
    }

    transformControls.detach();
    transformControls.setMode(mode);
    syncSpinTransformAxisVisibility(spinSession);
    transformControls.attach(spinSession.controlPivot);
    transformControls.enabled = true;
    spinSession.lastControlQuaternion.copy(spinSession.controlPivot.quaternion);
}

function buildSpinInstructionText() {
    if (!spinSession) return "";

    if (spinSession.controlMode === "translate") {
        return "Move the pivot with transform controls, then click Rotate Mode or press Enter to continue spinning.";
    }

    if (!spinSession.selection.canCreateSurface) {
        return "Rotate with transform controls to preview the spin path. A single loose vertex cannot create faces on Apply.";
    }

    return `Rotate with transform controls around ${spinSession.axisName.toUpperCase()}. Press X, Y, or Z to change axis.`;
}

function getTwistAngleAroundAxis(deltaQuaternion, axis) {
    const axisNorm = axis.clone().normalize();
    const vector = new THREE.Vector3(deltaQuaternion.x, deltaQuaternion.y, deltaQuaternion.z);
    const projected = axisNorm.clone().multiplyScalar(vector.dot(axisNorm));
    const twist = new THREE.Quaternion(projected.x, projected.y, projected.z, deltaQuaternion.w).normalize();
    const twistVector = new THREE.Vector3(twist.x, twist.y, twist.z);
    let angle = 2 * Math.atan2(twistVector.length(), twist.w);

    if (projected.dot(axisNorm) < 0) angle *= -1;
    if (angle > Math.PI) angle -= Math.PI * 2;
    if (angle < -Math.PI) angle += Math.PI * 2;

    return angle;
}

function updateSpinPreview() {
    if (!spinSession) return;

    spinSession.previewEditableMesh = buildSpinPreviewEditableMesh(spinSession);
    spinSession.gizmoRadius = getSpinGizmoRadius(spinSession);

    if (!spinResultMesh) {
        spinResultMesh = new THREE.Mesh(
            spinSession.previewEditableMesh.toBufferGeometry(),
            spinSession.mesh.material
        );
        spinResultMesh.name = "SpinPreviewMesh";
        spinResultMesh.userData.ignoreInHierarchy = true;
        spinResultMesh.position.copy(spinSession.mesh.position);
        spinResultMesh.quaternion.copy(spinSession.mesh.quaternion);
        spinResultMesh.scale.copy(spinSession.mesh.scale);
        spinResultMesh.castShadow = spinSession.mesh.castShadow;
        spinResultMesh.receiveShadow = spinSession.mesh.receiveShadow;
        (spinSession.mesh.parent || scene).add(spinResultMesh);
    } else {
        spinResultMesh.geometry?.dispose?.();
        spinResultMesh.geometry = spinSession.previewEditableMesh.toBufferGeometry();
    }

    spinSession.mesh.visible = false;
    buildSpinGuideGroup(spinSession);
    if (!spinGizmoGroup) createSpinGizmo(spinSession);
    updateSpinGizmo();
    syncSpinControlPivotTransform(spinSession);
    syncSpinUiFromState();
}

function beginSpinSession(sys, selection) {
    const mesh = sys.activeMesh;
    mesh.updateMatrixWorld(true);

    const pivotLocal = getSelectionCenterLocal(sys, selection);
    const pivotWorld = pivotLocal.clone().applyMatrix4(mesh.matrixWorld);

    spinSession = {
        sys,
        mesh,
        selection,
        originalEditableMesh: cloneEditableMeshData(sys.editableMesh),
        previewEditableMesh: null,
        pivotLocal,
        pivotWorld,
        axisLocal: new THREE.Vector3(0, 1, 0),
        axisWorld: new THREE.Vector3(0, 1, 0),
        axisName: "y",
        steps: Math.max(3, parseInt(getSpinUiElement("spinStepsSlider")?.value || "16", 10)),
        angle: parseInt(getSpinUiElement("spinAngleSlider")?.value || "360", 10),
        gizmoRadius: 1,
        controlPivot: null,
        controlMode: "rotate",
        lastControlQuaternion: new THREE.Quaternion(),
        controlsWereEnabled: !!controls?.enabled,
        previousTransformMode: typeof transformControls?.getMode === "function"
            ? (transformControls.getMode() || "translate")
            : "translate",
        helpersWereVisible: {
            vertex: !!window.vertexHelpers?.visible,
            edge: !!window.edgeHelpers?.visible,
            face: !!window.faceHelpers?.visible,
        },
    };

    updateSessionAxis(spinSession, "y");

    spinSession.controlPivot = new THREE.Object3D();
    spinSession.controlPivot.name = "SpinTransformPivot";
    spinSession.controlPivot.userData.isSystemObject = true;
    spinSession.controlPivot.userData.selectable = false;
    spinSession.controlPivot.userData.ignoreInHierarchy = true;
    spinSession.controlPivot.userData.selectionProxy = mesh;
    scene.add(spinSession.controlPivot);

    syncSpinControlPivotTransform(spinSession);

    if (controls) controls.enabled = spinSession.controlsWereEnabled;
    transformControls?.detach?.();
    window.vertexHelpers && (window.vertexHelpers.visible = false);
    window.edgeHelpers && (window.edgeHelpers.visible = false);
    window.faceHelpers && (window.faceHelpers.visible = false);

    isSpinMode = true;
    setSpinPanelVisible(true);
    attachSpinTransformControls("rotate");
    updateSpinPreview();
    updateSpinInstructions(buildSpinInstructionText());
    refreshSpinToolUIState();
}

function handleSpinUIChange() {
    if (!spinSession) return;

    const steps = parseInt(getSpinUiElement("spinStepsSlider")?.value || `${spinSession.steps}`, 10);
    const angle = parseInt(getSpinUiElement("spinAngleSlider")?.value || `${spinSession.angle}`, 10);

    spinSession.steps = THREE.MathUtils.clamp(Number.isFinite(steps) ? steps : 16, 1, 128);
    spinSession.angle = THREE.MathUtils.clamp(Number.isFinite(angle) ? angle : 360, -360, 360);
    syncSpinControlPivotTransform(spinSession);
    updateSpinPreview();
    updateSpinInstructions(buildSpinInstructionText());
}

function handleSpinPanelClick(event) {
    if (!spinSession) return;

    const button = event.target.closest("button[id], button[data-spin-axis]");
    if (!button) return;

    if (button.hasAttribute("data-spin-axis")) {
        updateSessionAxis(spinSession, button.getAttribute("data-spin-axis"));
        attachSpinTransformControls("rotate");
        updateSpinPreview();
        updateSpinInstructions(buildSpinInstructionText());
        return;
    }

    if (button.id === "spin-pick-center-button") {
        spinSession.pivotLocal.copy(getSelectionCenterLocal(spinSession.sys, spinSession.selection));
        spinSession.pivotWorld.copy(spinSession.pivotLocal.clone().applyMatrix4(spinSession.mesh.matrixWorld));
        updateSessionAxis(spinSession, spinSession.axisName);
        attachSpinTransformControls("translate");
        updateSpinPreview();
        updateSpinInstructions(buildSpinInstructionText());
        return;
    }

    if (button.id === "spin-pick-axis-button") {
        attachSpinTransformControls("rotate");
        updateSpinInstructions(buildSpinInstructionText());
        return;
    }

    if (button.id === "spin-axis-flip-button") {
        spinSession.angle *= -1;
        const slider = getSpinUiElement("spinAngleSlider");
        if (slider) slider.value = String(spinSession.angle);
        syncSpinControlPivotTransform(spinSession);
        updateSpinPreview();
        updateSpinInstructions(buildSpinInstructionText());
    }
}

function bindSpinUi() {
    if (spinUiBound) return;

    getSpinUiElement("spin-options")?.addEventListener("click", handleSpinPanelClick);
    getSpinUiElement("spinStepsSlider")?.addEventListener("input", handleSpinUIChange);
    getSpinUiElement("spinAngleSlider")?.addEventListener("input", handleSpinUIChange);
    getSpinUiElement("spin-apply-button")?.addEventListener("click", finalizeSpinTool);
    getSpinUiElement("spin-cancel-button")?.addEventListener("click", cancelSpinTool);

    spinUiBound = true;
}

function unbindSpinUi() {
    if (!spinUiBound) return;

    getSpinUiElement("spin-options")?.removeEventListener("click", handleSpinPanelClick);
    getSpinUiElement("spinStepsSlider")?.removeEventListener("input", handleSpinUIChange);
    getSpinUiElement("spinAngleSlider")?.removeEventListener("input", handleSpinUIChange);
    getSpinUiElement("spin-apply-button")?.removeEventListener("click", finalizeSpinTool);
    getSpinUiElement("spin-cancel-button")?.removeEventListener("click", cancelSpinTool);

    spinUiBound = false;
}

function handleSpinTransformMouseDown() {
    if (!spinSession || !transformControls || transformControls.object !== spinSession.controlPivot) return;
    spinSession.lastControlQuaternion.copy(spinSession.controlPivot.quaternion);
}

function handleSpinTransformObjectChange() {
    if (!spinSession || !transformControls || transformControls.object !== spinSession.controlPivot) return;

    if (spinSession.controlMode === "translate") {
        spinSession.pivotWorld.copy(spinSession.controlPivot.position);
        spinSession.pivotLocal.copy(spinSession.mesh.worldToLocal(spinSession.pivotWorld.clone()));
        updateSessionAxis(spinSession, spinSession.axisName);
        updateSpinPreview();
        updateSpinInstructions(buildSpinInstructionText());
        return;
    }

    const currentQuaternion = spinSession.controlPivot.quaternion.clone();
    const deltaQuaternion = spinSession.lastControlQuaternion.clone().invert().multiply(currentQuaternion);
    const deltaAngle = getTwistAngleAroundAxis(deltaQuaternion, spinSession.axisWorld);

    if (Math.abs(deltaAngle) < 1e-6) return;

    spinSession.angle = THREE.MathUtils.clamp(
        Math.round(spinSession.angle + THREE.MathUtils.radToDeg(deltaAngle)),
        -360,
        360
    );

    spinSession.lastControlQuaternion.copy(currentQuaternion);
    syncSpinControlPivotTransform(spinSession);
    updateSpinPreview();
    updateSpinInstructions(buildSpinInstructionText());
}

function handleSpinTransformMouseUp() {
    if (!spinSession || !transformControls || transformControls.object !== spinSession.controlPivot) return;
    spinSession.lastControlQuaternion.copy(spinSession.controlPivot.quaternion);
}

function handleSpinKeyDown(event) {
    if (!spinSession) return;

    const key = (event.key || "").toLowerCase();

    if (key === "escape") {
        event.preventDefault();
        event.stopPropagation();
        cancelSpinTool();
        return;
    }

    if (key === "enter") {
        event.preventDefault();
        event.stopPropagation();
        if (spinSession.controlMode === "translate") {
            attachSpinTransformControls("rotate");
            updateSpinInstructions(buildSpinInstructionText());
        } else {
            finalizeSpinTool();
        }
        return;
    }

    if (key === "x" || key === "y" || key === "z") {
        event.preventDefault();
        event.stopPropagation();
        updateSessionAxis(spinSession, key);
        attachSpinTransformControls("rotate");
        updateSpinPreview();
        updateSpinInstructions(buildSpinInstructionText());
    }
}

function bindSpinTransformListeners() {
    if (spinTransformBound || !transformControls) return;

    transformControls.addEventListener("mouseDown", handleSpinTransformMouseDown);
    transformControls.addEventListener("objectChange", handleSpinTransformObjectChange);
    transformControls.addEventListener("mouseUp", handleSpinTransformMouseUp);
    spinTransformBound = true;
}

function unbindSpinTransformListeners() {
    if (!spinTransformBound || !transformControls) return;

    transformControls.removeEventListener("mouseDown", handleSpinTransformMouseDown);
    transformControls.removeEventListener("objectChange", handleSpinTransformObjectChange);
    transformControls.removeEventListener("mouseUp", handleSpinTransformMouseUp);
    spinTransformBound = false;
}

function bindSpinKeys() {
    if (spinKeyBound) return;
    window.addEventListener("keydown", handleSpinKeyDown, true);
    spinKeyBound = true;
}

function unbindSpinKeys() {
    if (!spinKeyBound) return;
    window.removeEventListener("keydown", handleSpinKeyDown, true);
    spinKeyBound = false;
}

function cleanupSpinTool(commitResult = false) {
    if (!spinSession) return;

    const session = spinSession;
    const sys = session.sys;
    const mesh = session.mesh;
    const resultEditableMesh = commitResult ? session.previewEditableMesh : null;

    removeSpinResultMesh();
    removeSpinGuideGroup();
    removeSpinGizmoGroup();
    removeSpinControlPivot(session);
    setSpinPanelVisible(false);
    unbindSpinUi();
    unbindSpinTransformListeners();
    unbindSpinKeys();

    transformControls?.detach?.();
    if (transformControls?.setMode) {
        transformControls.setMode(session.previousTransformMode || "translate");
    }
    if (typeof transformControls?.showX === "boolean") {
        transformControls.showX = true;
        transformControls.showY = true;
        transformControls.showZ = true;
    }

    if (mesh) mesh.visible = true;

    if (commitResult && resultEditableMesh) {
        sys.editableMesh = resultEditableMesh;
        sys.architectureMessage = `Spin complete: ${session.steps} steps around ${session.axisName.toUpperCase()}.`;
        sys.commitEditableMesh(true, true);
    } else {
        sys.architectureMessage = "Spin cancelled.";
        sys.rebuildAllHelpers();
        sys.updateSubObjectTransformGizmo?.();
    }

    if (window.vertexHelpers) window.vertexHelpers.visible = session.helpersWereVisible.vertex;
    if (window.edgeHelpers) window.edgeHelpers.visible = session.helpersWereVisible.edge;
    if (window.faceHelpers) window.faceHelpers.visible = session.helpersWereVisible.face;

    if (controls) controls.enabled = session.controlsWereEnabled;

    spinSession = null;
    isSpinMode = false;
    refreshSpinToolUIState();
}

function finalizeSpinTool() {
    if (!spinSession) return;

    if (!spinSession.selection.canCreateSurface) {
        alert("Spin Tool Error: A single loose vertex can preview the gizmo, but this modeling backend needs an edge or face profile to create polygon geometry.");
        return;
    }

    cleanupSpinTool(true);
}

function cancelSpinTool() {
    cleanupSpinTool(false);
}

function initiateSpinTool() {
    if (isSpinMode) {
        cancelSpinTool();
        return;
    }

    const sys = getSpinSystem();
    if (!sys) {
        alert("Spin Tool Error: Enter Modeling Mode and select a mesh first.");
        return;
    }

    if (!transformControls) {
        alert("Spin Tool Error: Transform controls are required for the Spin tool.");
        return;
    }

    if (sys.activeArchitectureTool) {
        sys.setArchitectureTool(null);
    }
    if (sys.activePolygonTool) {
        sys.setPolygonTool(null);
    }

    const selection = collectSpinSelection(sys);
    if (!selection) {
        alert("Spin Tool Error: Select at least one face, edge, or vertex first.");
        return;
    }

    bindSpinUi();
    bindSpinTransformListeners();
    bindSpinKeys();
    beginSpinSession(sys, selection);
}

window.initiateSpinTool = initiateSpinTool;
window.cancelSpinTool = cancelSpinTool;
window.isSpinModeActive = () => isSpinMode;
window.getSpinToolInstructions = () => getSpinUiElement("spin-instructions")?.textContent || "";
// --- Spin Tool State ---
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
