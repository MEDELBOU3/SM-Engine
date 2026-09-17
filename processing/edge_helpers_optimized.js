// ─────────────────────────────────────────────────────────────────────────────
// OPTIMIZED EDGE HELPERS
// Replaces buildEdgeHelpers() in UnifiedModelingSystem.
//
// Before: 1 THREE.Line  + 1 cylinder Mesh  PER EDGE  → O(n) draw calls
// After:  1 LineSegments (all edges)
//       + 1 InstancedMesh (all hit proxies)
//       = 2 draw calls total, regardless of subdivision depth
// ─────────────────────────────────────────────────────────────────────────────

(function patchEdgeHelpers() {

    // ── Shared geometry / material singletons ─────────────────────────────────
    // One unit cylinder along Y, shared across all instances.
    const HIT_PROXY_GEO = new THREE.CylinderGeometry(1, 1, 1, 5, 1, false);

    // Pre-allocate dummy matrix / color so we don't create GC pressure per frame
    const _mat   = new THREE.Matrix4();
    const _quat  = new THREE.Quaternion();
    const _scale = new THREE.Vector3();
    const _up    = new THREE.Vector3(0, 1, 0);
    const _dir   = new THREE.Vector3();
    const _mid   = new THREE.Vector3();

    const COL_DEFAULT  = new THREE.Color(0x000000); // Blender black
    const COL_SELECTED = new THREE.Color(0xff8c00); // Blender orange

    // ── Helper: write one instance matrix into an InstancedMesh ───────────────
    function setInstanceFromSegment(iMesh, idx, start, end, radius) {
        _dir.subVectors(end, start);
        const length = _dir.length();
        if (length < 1e-6) {
            // Zero-length edge — hide the instance by scaling to 0
            _mat.makeScale(0, 0, 0);
            iMesh.setMatrixAt(idx, _mat);
            return;
        }
        _dir.normalize();
        _quat.setFromUnitVectors(_up, _dir);
        _mid.addVectors(start, end).multiplyScalar(0.5);
        _scale.set(radius, length, radius);
        _mat.compose(_mid, _quat, _scale);
        iMesh.setMatrixAt(idx, _mat);
    }

    // ── Main replacement for UnifiedModelingSystem.buildEdgeHelpers ───────────
    function buildEdgeHelpers_optimized() {
        const sys     = window.UnifiedModelingSystem;
        const em      = sys.editableMesh;
        const mesh    = sys.activeMesh;
        const group   = window.edgeHelpers;
        if (!em || !mesh || !group) return;

        clearGroup(group); // dispose old children

        const edgeCount = em.edges.length;
        if (edgeCount === 0) return;

        // ── 1. Build flat position array for LineSegments ─────────────────────
        // 2 vertices per edge × 3 floats = 6 floats per edge
        const posArr  = new Float32Array(edgeCount * 6);
        const colArr  = new Float32Array(edgeCount * 6); // vertex colours (RGB per vert)

        const wm = mesh.matrixWorld;

        for (let i = 0; i < edgeCount; i++) {
            const edge     = em.edges[i];
            const selected = em.selectedEdges.has(i);
            const col      = selected ? COL_SELECTED : COL_DEFAULT;

            const pa = em.vertices[edge.a].position.clone().applyMatrix4(wm);
            const pb = em.vertices[edge.b].position.clone().applyMatrix4(wm);

            const base = i * 6;
            posArr[base]     = pa.x; posArr[base + 1] = pa.y; posArr[base + 2] = pa.z;
            posArr[base + 3] = pb.x; posArr[base + 4] = pb.y; posArr[base + 5] = pb.z;

            colArr[base]     = col.r; colArr[base + 1] = col.g; colArr[base + 2] = col.b;
            colArr[base + 3] = col.r; colArr[base + 4] = col.g; colArr[base + 5] = col.b;
        }

        const lineGeo = new THREE.BufferGeometry();
        lineGeo.setAttribute("position", new THREE.BufferAttribute(posArr, 3));
        lineGeo.setAttribute("color",    new THREE.BufferAttribute(colArr, 3));

        const lineMat = new THREE.LineBasicMaterial({
            vertexColors: true,
            depthTest:    true,
            polygonOffset: true,
            polygonOffsetFactor: -1,
            polygonOffsetUnits:  -1,
        });

        const lineSegments = new THREE.LineSegments(lineGeo, lineMat);
        lineSegments.renderOrder = 997;
        // Store edge metadata for raycasting fallback (see section 3)
        lineSegments.userData = { type: "edgeLines", isOptimized: true };
        group.add(lineSegments);

        // ── 2. InstancedMesh for hit proxies ──────────────────────────────────
        // Invisible — only catches raycaster. radius scales with scene size.
        const hitRadius = Math.max(sys.getAverageScale() * 0.2, 0.06);

        const hitMat = new THREE.MeshBasicMaterial({
            colorWrite: false,
            depthWrite: false,
            transparent: true,
            opacity: 0,
            depthTest: true,
            side: THREE.DoubleSide,
        });

        const iMesh = new THREE.InstancedMesh(HIT_PROXY_GEO, hitMat, edgeCount);
        iMesh.renderOrder = 998;
        iMesh.userData   = { type: "edgeHitProxy", isOptimized: true };

        for (let i = 0; i < edgeCount; i++) {
            const edge = em.edges[i];
            const pa   = em.vertices[edge.a].position.clone().applyMatrix4(wm);
            const pb   = em.vertices[edge.b].position.clone().applyMatrix4(wm);
            setInstanceFromSegment(iMesh, i, pa, pb, hitRadius);
        }
        iMesh.instanceMatrix.needsUpdate = true;
        group.add(iMesh);

        // ── 3. Store references for fast raycasting ───────────────────────────
        group.userData._lineSegments = lineSegments;
        group.userData._iMesh        = iMesh;
        group.userData._edgeCount    = edgeCount;

        group.visible = true;
    }

    // ── Raycasting for optimised edges ────────────────────────────────────────
    // The old code did: raycaster.intersectObjects(group.children, true)
    // With InstancedMesh the intersect call returns instanceId directly.
    function raycastEdgeHelpers_optimized(event) {
        const sys   = window.UnifiedModelingSystem;
        const group = window.edgeHelpers;
        if (!group?.userData?._iMesh) return null;

        if (!sys.updateRayFromEvent(event)) return null;

        const iMesh = group.userData._iMesh;
        const hits  = raycaster.intersectObject(iMesh, false);
        if (!hits.length) return null;

        const instanceId = hits[0].instanceId;
        if (instanceId == null) return null;

        // Mimic the old userData shape the rest of the system expects
        const fakeObject = {
            userData: { type: "edge", index: instanceId }
        };
        return { object: fakeObject, point: hits[0].point, distance: hits[0].distance };
    }

    // ── Live update during drag (no rebuild, just move positions) ─────────────
    // Called by applyTransformControlsDelta instead of a full rebuild.
    function updateEdgePositions_optimized() {
        const sys   = window.UnifiedModelingSystem;
        const em    = sys.editableMesh;
        const mesh  = sys.activeMesh;
        const group = window.edgeHelpers;
        if (!em || !mesh || !group?.userData?._lineSegments) return;

        const lineGeo = group.userData._lineSegments.geometry;
        const posAttr = lineGeo.attributes.position;
        const colAttr = lineGeo.attributes.color;
        const iMesh   = group.userData._iMesh;
        const wm      = mesh.matrixWorld;
        const hitRadius = Math.max(sys.getAverageScale() * 0.2, 0.06);

        for (let i = 0; i < em.edges.length; i++) {
            const edge     = em.edges[i];
            const selected = em.selectedEdges.has(i);
            const col      = selected ? COL_SELECTED : COL_DEFAULT;

            const pa = em.vertices[edge.a].position.clone().applyMatrix4(wm);
            const pb = em.vertices[edge.b].position.clone().applyMatrix4(wm);

            const base = i * 2; // LineSegments: 2 verts per edge
            posAttr.setXYZ(base,     pa.x, pa.y, pa.z);
            posAttr.setXYZ(base + 1, pb.x, pb.y, pb.z);
            colAttr.setXYZ(base,     col.r, col.g, col.b);
            colAttr.setXYZ(base + 1, col.r, col.g, col.b);

            if (iMesh) setInstanceFromSegment(iMesh, i, pa, pb, hitRadius);
        }

        posAttr.needsUpdate = true;
        colAttr.needsUpdate = true;
        if (iMesh) iMesh.instanceMatrix.needsUpdate = true;
    }

    // ── Vertex helpers optimisation (bonus) ───────────────────────────────────
    // Replaces one Mesh per vertex with one InstancedMesh for all vertices.
    function buildVertexHelpers_optimized() {
        const sys   = window.UnifiedModelingSystem;
        const em    = sys.editableMesh;
        const mesh  = sys.activeMesh;
        const group = window.vertexHelpers;
        if (!em || !mesh || !group) return;

        clearGroup(group);

        const count    = em.vertices.length;
        if (count === 0) return;

        const radius   = sys.getAverageScale() * sys.settings.vertexScale * 0.3;
        const vertGeo  = new THREE.SphereGeometry(radius, 6, 5); // fewer segments than before

        // Use vertex colours via per-instance colour support
        const defaultCol  = new THREE.Color(0x000000);
        const selectedCol = new THREE.Color(0xff8c00);

        const iMesh = new THREE.InstancedMesh(vertGeo,
            new THREE.MeshBasicMaterial({ depthTest: true }), count);
        iMesh.renderOrder = 999;
        iMesh.userData   = { type: "vertexInstanced", isOptimized: true };

        // Soft-selection heatmap colours (3ds Max ROYGB gradient)
        const softEngine = window.SoftSelectionEngine;
        const softView = softEngine?.enabled && softEngine.showHeatmap;
        const softWeights = softView && em.selectedVertices.size
            ? softEngine.computeMeshWeights(em)
            : null;

        const wm = mesh.matrixWorld;
        const tmpColor = new THREE.Color();
        for (let i = 0; i < count; i++) {
            const pos = em.vertices[i].position.clone().applyMatrix4(wm);
            _mat.makeTranslation(pos.x, pos.y, pos.z);
            iMesh.setMatrixAt(i, _mat);

            if (softWeights) {
                const w = em.selectedVertices.has(i) ? 1.0 : (softWeights.get(i) || 0);
                tmpColor.copy(w >= 0.5 ? selectedCol : softEngine.getHeatmapColor(w));
                iMesh.setColorAt(i, tmpColor);
            } else {
                iMesh.setColorAt(i, em.selectedVertices.has(i) ? selectedCol : defaultCol);
            }
        }
        iMesh.instanceMatrix.needsUpdate = true;
        iMesh.instanceColor.needsUpdate  = true;

        // Store for raycasting
        group.userData._iMesh      = iMesh;
        group.userData._vertCount  = count;
        group.add(iMesh);
        group.visible = true;
    }

    function raycastVertexHelpers_optimized(event) {
        const sys   = window.UnifiedModelingSystem;
        const group = window.vertexHelpers;
        if (!group?.userData?._iMesh) return null;
        if (!sys.updateRayFromEvent(event)) return null;

        const hits = raycaster.intersectObject(group.userData._iMesh, false);
        if (!hits.length) return null;

        const fakeObject = {
            userData: { type: "vertex", index: hits[0].instanceId }
        };
        return { object: fakeObject, point: hits[0].point, distance: hits[0].distance };
    }

    // ── Patch UnifiedModelingSystem ───────────────────────────────────────────
    const sys = window.UnifiedModelingSystem;
    if (!sys) {
        console.warn("UnifiedModelingSystem not found — edge optimisation not applied.");
        return;
    }

    // Replace build functions
    sys.buildEdgeHelpers   = buildEdgeHelpers_optimized;
    sys.buildVertexHelpers = buildVertexHelpers_optimized;

    // Replace raycast dispatcher
    const _origRaycast = sys.raycastSelectionHelpers.bind(sys);
    sys.raycastSelectionHelpers = function (event) {
        if (this.selectMode === "edge") {
            return raycastEdgeHelpers_optimized(event)
                ?? _origRaycast(event);        // fallback to old method
        }
        if (this.selectMode === "vertex") {
            return raycastVertexHelpers_optimized(event)
                ?? _origRaycast(event);
        }
        return _origRaycast(event);            // face mode unchanged
    };

    // Replace applyDragDelta to use fast position update during drag
    // with optional soft-selection (weighted) influence from SoftSelectionEngine.
    const _origDelta = sys.applyTransformControlsDelta.bind(sys);
    sys.applyTransformControlsDelta = function (finalize = false) {
        if (!this._subObjectDragState || !this.activeMesh || !this.editableMesh || !this.subObjectPivot) return;

        const meshMWI   = this.activeMesh.matrixWorld.clone().invert();
        const deltaWorld = this.subObjectPivot.matrixWorld.clone()
            .multiply(this._subObjectDragState.startPivotMatrixWorld.clone().invert());

        const softWeights = this._subObjectDragState.softWeights;
        const useSoft = !!(window.SoftSelectionEngine?.enabled && softWeights);

        const affectedIndices = useSoft
            ? Array.from(softWeights.keys())
            : this._subObjectDragState.selectedVertexIndices;

        affectedIndices.forEach((vi) => {
            const srcLocal = this._subObjectDragState.vertexPositions.get(vi);
            const vertex   = this.editableMesh.vertices[vi];
            if (!srcLocal || !vertex) return;
            const next = srcLocal.clone()
                .applyMatrix4(this.activeMesh.matrixWorld)
                .applyMatrix4(deltaWorld)
                .applyMatrix4(meshMWI);
            if (useSoft) {
                const w = softWeights.get(vi) || 0;
                if (w >= 1) vertex.position.copy(next);
                else if (w > 0) vertex.position.lerpVectors(srcLocal, next, w);
            } else {
                vertex.position.copy(next);
            }
        });

        this._subObjectDragDirty = true;

        if (finalize) {
            this.commitEditableMesh(true, true);
            window.SoftSelectionEngine?.endWeightSession?.();
        } else {
            // Fast path: update geometry buffer + edge/vertex helper positions in-place
            this.syncEditableMeshToLiveGeometry();
            updateEdgePositions_optimized();

            // Update vertex helper colours/positions in-place too
            const vGroup = window.vertexHelpers;
            const iMesh  = vGroup?.userData?._iMesh;
            if (iMesh && this.editableMesh) {
                const wm = this.activeMesh.matrixWorld;
                const selectedCol = new THREE.Color(0xff8c00);
                const defaultCol  = new THREE.Color(0x000000);
                affectedIndices.forEach((vi) => {
                    const pos = this.editableMesh.vertices[vi]?.position.clone().applyMatrix4(wm);
                    if (!pos) return;
                    _mat.makeTranslation(pos.x, pos.y, pos.z);
                    iMesh.setMatrixAt(vi, _mat);
                    if (useSoft) {
                        const engine = window.SoftSelectionEngine;
                        const w = softWeights.get(vi) || 0;
                        const color = w >= 0.5 ? selectedCol :
                            (engine?.showHeatmap ? engine.getHeatmapColor(w) : defaultCol);
                        iMesh.setColorAt(vi, color);
                    } else {
                        iMesh.setColorAt(vi, this.editableMesh.selectedVertices.has(vi) ? selectedCol : defaultCol);
                    }
                });
                iMesh.instanceMatrix.needsUpdate = true;
                iMesh.instanceColor.needsUpdate  = true;
            }
        }
    };

    // Expose update function for external callers
    sys._updateEdgePositions = updateEdgePositions_optimized;

    console.log("[EdgeOpt] Optimised edge/vertex helpers patched — 2 draw calls total.");
})();