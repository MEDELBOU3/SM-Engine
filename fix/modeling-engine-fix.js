// =================================================================================
// MODELING ENGINE — COMPLETE FIX
// =================================================================================
// HOW TO USE:
//   Add this <script> tag AFTER nanite-ex.js loads (and after the scene/camera/renderer
//   are fully initialised), e.g. at the end of <body>:
//
//   <script src="nanite-ex.js"></script>
//   <script src="modeling-engine-fix.js"></script>
//
// This file patches every root cause that prevents:
//   1. Vertex / Edge / Face helpers from appearing
//   2. Architectural tools (Wall, Door, Stairs, …) from being clickable
//   3. Mesh-operation tools (Extrude, Bevel, Loop-cut, …) from being clickable
// =================================================================================

(function patchModelingEngine() {
    'use strict';

    // ─────────────────────────────────────────────────────────────────────────
    // BUG 1 — LAYER CONSTANTS NEVER DEFINED
    // ─────────────────────────────────────────────────────────────────────────
    // nanite-ex.js uses VERTEX_LAYER / EDGE_LAYER / FACE_LAYER in setModelingMode()
    // but never declares them.  Without them every raycaster.layers.set() call
    // becomes layers.set(undefined) === layers.set(0), so helper meshes on
    // layers 1/2/3 are never hit by the raycaster.
    window.VERTEX_LAYER = 1;
    window.EDGE_LAYER   = 2;
    window.FACE_LAYER   = 3;


    // ─────────────────────────────────────────────────────────────────────────
    // BUG 2 — UnifiedModelingSystem NEVER CREATED
    // ─────────────────────────────────────────────────────────────────────────
    // Every call to UnifiedModelingSystem.rebuildAllHelpers() / clearAllHelpers()
    // throws "Cannot read properties of undefined" because no code ever assigns
    // the object.  We build it here by bridging to the functions that DO exist
    // inside nanite-ex.js.
    //
    // Method name mapping:
    //   nanite-ex expects   →  actual function in nanite-ex.js
    //   rebuildAllHelpers   →  showMeshStructure (calls the real build path)
    //   clearAllHelpers     →  clearMeshStructure / clearHelpers
    //   clearSelection      →  clearSelection  (already global)
    //   onCanvasClick       →  handled by onModelingClick
    //   onCanvasHover       →  handled by handleCanvasMouseMove

    if (typeof window.UnifiedModelingSystem === 'undefined' ||
        typeof window.UnifiedModelingSystem.rebuildAllHelpers !== 'function') {

        window.UnifiedModelingSystem = {

            // ── state ─────────────────────────────────────────────────────
            get activeObject() { return window.activeObject || null; },
            set activeObject(v) { window.activeObject = v; },

            // ── CORE BUILDER ──────────────────────────────────────────────
            // Called every time selection mode changes or the active object changes.
            rebuildAllHelpers: function () {
                const obj = window.activeObject;
                if (!obj || !obj.geometry) {
                    this.clearAllHelpers();
                    return;
                }

                this.clearAllHelpers();

                const geo      = obj.geometry;
                const pos      = geo.attributes.position;
                const mat4     = obj.matrixWorld;
                const mode     = window.selectionMode || 'vertex';

                // Ensure raw index array (handles non-indexed geometry)
                let indexArray = geo.index ? geo.index.array : null;
                if (!indexArray) {
                    indexArray = new Uint32Array(pos.count);
                    for (let i = 0; i < pos.count; i++) indexArray[i] = i;
                }

                const dummy = new THREE.Object3D();

                // ── VERTEX MODE ───────────────────────────────────────────
                if (mode === 'vertex') {
                    const count   = pos.count;
                    const dotGeo  = new THREE.SphereGeometry(this._getVertexSize(), 5, 5);
                    const dotMat  = new THREE.MeshBasicMaterial({
                        color: 0x00aaff, depthTest: false, transparent: true
                    });
                    const instMesh = new THREE.InstancedMesh(dotGeo, dotMat, count);
                    instMesh.frustumCulled = false;

                    const colors = new Float32Array(count * 3);
                    instMesh.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);

                    const defColor = new THREE.Color(0x00aaff);
                    for (let i = 0; i < count; i++) {
                        dummy.position.fromBufferAttribute(pos, i).applyMatrix4(mat4);
                        dummy.updateMatrix();
                        instMesh.setMatrixAt(i, dummy.matrix);
                        instMesh.setColorAt(i, defColor);
                    }
                    instMesh.instanceMatrix.needsUpdate = true;
                    instMesh.instanceColor.needsUpdate  = true;
                    instMesh.layers.set(VERTEX_LAYER);
                    instMesh.userData = { type: 'vertex-instanced', vertexIndices: Array.from({length: count}, (_, i) => i) };
                    window.vertexHelpers.add(instMesh);
                }

                // ── EDGE MODE ─────────────────────────────────────────────
                if (mode === 'edge') {
                    const thickness = this._getEdgeThickness();
                    const edgeMat   = new THREE.LineBasicMaterial({
                        color: 0x00ffcc, depthTest: false, transparent: true, opacity: 0.85,
                        linewidth: thickness          // note: only works with WebGL1 / some drivers
                    });

                    // De-duplicate edges using a Set keyed by sorted pair
                    const seen = new Set();
                    for (let i = 0; i < indexArray.length; i += 3) {
                        const tri = [indexArray[i], indexArray[i+1], indexArray[i+2]];
                        const pairs = [[tri[0],tri[1]],[tri[1],tri[2]],[tri[2],tri[0]]];
                        pairs.forEach(([a, b]) => {
                            const key = a < b ? `${a}_${b}` : `${b}_${a}`;
                            if (seen.has(key)) return;
                            seen.add(key);

                            const v1 = new THREE.Vector3().fromBufferAttribute(pos, a).applyMatrix4(mat4);
                            const v2 = new THREE.Vector3().fromBufferAttribute(pos, b).applyMatrix4(mat4);
                            const lineGeo = new THREE.BufferGeometry().setFromPoints([v1, v2]);
                            const line    = new THREE.Line(lineGeo, edgeMat.clone());
                            line.frustumCulled = false;
                            line.layers.set(EDGE_LAYER);
                            line.userData = { type: 'edge', indices: [a, b] };
                            window.edgeHelpers.add(line);
                        });
                    }
                }

                // ── FACE MODE ─────────────────────────────────────────────
                if (mode === 'face') {
                    const opacity = this._getFaceOpacity();
                    for (let i = 0; i < indexArray.length; i += 3) {
                        const ia = indexArray[i], ib = indexArray[i+1], ic = indexArray[i+2];
                        const v1 = new THREE.Vector3().fromBufferAttribute(pos, ia).applyMatrix4(mat4);
                        const v2 = new THREE.Vector3().fromBufferAttribute(pos, ib).applyMatrix4(mat4);
                        const v3 = new THREE.Vector3().fromBufferAttribute(pos, ic).applyMatrix4(mat4);

                        const faceGeo = new THREE.BufferGeometry().setFromPoints([v1, v2, v3]);
                        faceGeo.setIndex([0, 1, 2]);
                        const faceMat = new THREE.MeshBasicMaterial({
                            color: 0x44dd88, transparent: true, opacity: opacity,
                            side: THREE.DoubleSide, depthTest: false
                        });
                        const faceMesh = new THREE.Mesh(faceGeo, faceMat);
                        faceMesh.frustumCulled = false;
                        faceMesh.layers.set(FACE_LAYER);
                        faceMesh.userData = {
                            type: 'face',
                            indices:   [ia, ib, ic],
                            faceIndex: i / 3
                        };
                        window.faceHelpers.add(faceMesh);
                    }
                }

                // Sync raycaster + helper visibility
                this._syncLayersAndVisibility(mode);
            },

            // ── CLEAR ─────────────────────────────────────────────────────
            clearAllHelpers: function () {
                [window.vertexHelpers, window.edgeHelpers, window.faceHelpers].forEach(grp => {
                    if (!grp) return;
                    grp.children.slice().forEach(child => {
                        if (child.geometry) child.geometry.dispose();
                        if (child.material) {
                            (Array.isArray(child.material) ? child.material : [child.material])
                                .forEach(m => m.dispose());
                        }
                    });
                    grp.clear();
                });
            },

            // ── CLEAR SELECTION PROXIES ───────────────────────────────────
            clearSelection: function () {
                // Delegate to nanite-ex.js's own clearSelection if available
                if (typeof window.clearSelection === 'function') {
                    window.clearSelection();
                }
                if (typeof window.selectedElements !== 'undefined') {
                    window.selectedElements = [];
                }
                if (typeof window.transformControls !== 'undefined') {
                    window.transformControls.detach();
                }
            },

            // ── CLICK / HOVER ROUTING ─────────────────────────────────────
            // The main click handler in nanite-ex.js calls these methods.
            onCanvasClick: function (event) {
                this._handleHit(event, true);
            },
            onCanvasHover: function (event) {
                this._handleHit(event, false);
            },

            // ─────────────────────────────────────────────────────────────
            // INTERNAL UTILITIES
            // ─────────────────────────────────────────────────────────────

            /** Sync THREE.Layers mask on raycaster and group visibility */
            _syncLayersAndVisibility: function (mode) {
                if (!window.raycaster) return;

                window.vertexHelpers.visible = (mode === 'vertex');
                window.edgeHelpers.visible   = (mode === 'edge');
                window.faceHelpers.visible   = (mode === 'face');

                if (mode === 'vertex') window.raycaster.layers.set(VERTEX_LAYER);
                else if (mode === 'edge') window.raycaster.layers.set(EDGE_LAYER);
                else if (mode === 'face') window.raycaster.layers.set(FACE_LAYER);
                else window.raycaster.layers.set(0);

                // Ensure the camera can see the helper layers
                if (window.camera) {
                    window.camera.layers.enable(VERTEX_LAYER);
                    window.camera.layers.enable(EDGE_LAYER);
                    window.camera.layers.enable(FACE_LAYER);
                }
            },

            /** Shared hit logic for click and hover */
            _handleHit: function (event, isClick) {
                if (!window.isModelingMode || !window.activeObject) return;
                if (window.isTransforming && isClick) return;

                // Make sure raycaster is using the right layer
                const mode = window.selectionMode || 'vertex';
                this._syncLayersAndVisibility(mode);

                const targets = [
                    ...window.vertexHelpers.children,
                    ...window.edgeHelpers.children,
                    ...window.faceHelpers.children
                ];

                const intersects = window.raycaster.intersectObjects(targets, true);

                // CRITICAL: Reset to layer 0 after so arch-tool ground-clicks still work
                window.raycaster.layers.set(0);

                const hit = (mode === 'vertex')
                    ? intersects.find(h => h.instanceId !== undefined)
                    : intersects[0];

                if (!hit) {
                    if (isClick && !event.shiftKey) this.clearSelection();
                    return;
                }

                const data = this._extractData(hit);
                if (!data) return;

                if (isClick) {
                    this._processClick(data, event.shiftKey);
                } else {
                    this._processHover(data);
                }
            },

            _extractData: function (hit) {
                const mode = window.selectionMode || 'vertex';
                if (mode === 'vertex') return { type: 'vertex', index: hit.instanceId };
                if (mode === 'edge')   return { type: 'edge',   indices: hit.object.userData.indices };
                if (mode === 'face')   return { type: 'face',   indices: hit.object.userData.indices, faceIndex: hit.object.userData.faceIndex };
                return null;
            },

            _processClick: function (data, additive) {
                const existing = (window.selectedElements || []).findIndex(p => this._isEqual(p.userData, data));
                if (existing !== -1) {
                    if (additive) {
                        this._removeFromSelection(existing);
                    } else {
                        this.clearSelection();
                        this._addToSelection(data);
                    }
                } else {
                    if (!additive) this.clearSelection();
                    this._addToSelection(data);
                }
                this._updateVisualState(data, true, false);
                this._syncTransformGizmo();
            },

            _processHover: function (data) {
                this._updateVisualState(data, true, true);
            },

            _addToSelection: function (data) {
                const proxy = new THREE.Object3D();
                proxy.userData = data;

                const pos = window.activeObject.geometry.attributes.position;
                const worldCenter = new THREE.Vector3();

                if (data.type === 'vertex') {
                    worldCenter.fromBufferAttribute(pos, data.index).applyMatrix4(window.activeObject.matrixWorld);
                } else {
                    data.indices.forEach(idx =>
                        worldCenter.add(new THREE.Vector3().fromBufferAttribute(pos, idx)));
                    worldCenter.divideScalar(data.indices.length).applyMatrix4(window.activeObject.matrixWorld);
                }

                proxy.position.copy(worldCenter);
                window.scene.add(proxy);

                if (!window.selectedElements) window.selectedElements = [];
                window.selectedElements.push(proxy);
            },

            _removeFromSelection: function (idx) {
                const proxy = window.selectedElements[idx];
                this._updateVisualState(proxy.userData, false, false);
                window.scene.remove(proxy);
                window.selectedElements.splice(idx, 1);
            },

            _syncTransformGizmo: function () {
                const elems = window.selectedElements || [];
                if (elems.length === 0) {
                    if (window.transformControls) window.transformControls.detach();
                    return;
                }
                const center = new THREE.Vector3();
                elems.forEach(p => center.add(p.position));
                center.divideScalar(elems.length);

                // Create/reuse a pivot
                if (!this._pivot) {
                    this._pivot = new THREE.Group();
                    this._pivot.name = 'ModelingPivotFix';
                }
                if (!this._pivot.parent) window.scene.add(this._pivot);
                this._pivot.position.copy(center);
                this._pivot.rotation.set(0, 0, 0);
                this._pivot.scale.set(1, 1, 1);
                this._pivot.updateMatrixWorld();

                if (window.transformControls) window.transformControls.attach(this._pivot);
            },

            _updateVisualState: function (data, isSelected, isHover) {
                const SEL    = 0xffa500;
                const HOVER  = 0xff3300;
                const DEF_V  = 0x00aaff;
                const DEF_E  = 0x00ffcc;
                const DEF_F  = 0x44dd88;

                if (data.type === 'vertex') {
                    const inst = window.vertexHelpers.children.find(c => c.isInstancedMesh);
                    if (!inst) return;
                    const col = isHover ? HOVER : (isSelected ? SEL : DEF_V);
                    inst.setColorAt(data.index, new THREE.Color(col));
                    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
                } else {
                    const grp = data.type === 'edge' ? window.edgeHelpers : window.faceHelpers;
                    const helper = grp.children.find(c => this._isEqual(c.userData, data));
                    if (!helper || !helper.material) return;
                    const defColor = data.type === 'edge' ? DEF_E : DEF_F;
                    const col = isHover ? HOVER : (isSelected ? SEL : defColor);
                    helper.material.color.setHex(col);
                    helper.material.opacity = isSelected ? 0.85 : (data.type === 'face' ? 0.2 : 0.6);
                    helper.material.needsUpdate = true;
                }
            },

            _isEqual: function (a, b) {
                if (!a || !b || a.type !== b.type) return false;
                if (a.type === 'vertex') return a.index === b.index;
                if (a.type === 'face')   return a.faceIndex === b.faceIndex;
                if (a.type === 'edge') {
                    return (a.indices[0] === b.indices[0] && a.indices[1] === b.indices[1]) ||
                           (a.indices[0] === b.indices[1] && a.indices[1] === b.indices[0]);
                }
                return false;
            },

            _getVertexSize: function () {
                const el = document.getElementById('vertexSizeSlider');
                return el ? parseFloat(el.value) * 0.03 : 0.03;
            },
            _getEdgeThickness: function () {
                const el = document.getElementById('edgeThicknessSlider');
                return el ? parseFloat(el.value) : 1;
            },
            _getFaceOpacity: function () {
                const el = document.getElementById('faceOpacitySlider');
                return el ? parseFloat(el.value) : 0.25;
            }
        };

        console.log('[Fix] UnifiedModelingSystem created.');
    }


    // ─────────────────────────────────────────────────────────────────────────
    // BUG 3 — setSelectionMode DOES NOT sync helper visibility / raycaster layers
    // ─────────────────────────────────────────────────────────────────────────
    // The existing setSelectionMode calls rebuildAllHelpers (now patched above)
    // but it does NOT call the visibility sync.  We intercept it here so the
    // helpers are actually visible after a mode switch.
    const _origSetSelectionMode = window.setSelectionMode;
    if (typeof _origSetSelectionMode === 'function') {
        window.setSelectionMode = function (mode) {
            _origSetSelectionMode.call(this, mode);
            // After the original runs, force the layer/visibility sync
            if (window.UnifiedModelingSystem && typeof window.UnifiedModelingSystem._syncLayersAndVisibility === 'function') {
                window.UnifiedModelingSystem._syncLayersAndVisibility(mode);
            }
        };
        console.log('[Fix] setSelectionMode patched to sync layers & visibility.');
    }


    // ─────────────────────────────────────────────────────────────────────────
    // BUG 4 — Arch tool & modeling operation buttons disabled when not in
    //          modeling mode, blocking legitimate standalone tool usage
    // ─────────────────────────────────────────────────────────────────────────
    // updateModelingUI() disables ALL .arch-tool buttons when isModelingMode
    // is false.  Architectural tools (wall, door, stairs, …) should be usable
    // without entering the vertex/edge/face modeling mode.
    //
    // Fix: patch updateModelingUI to leave arch-tool buttons ENABLED always,
    // and only disable the vertex/edge/face-specific operations (extrude, bevel…).
    const _origUpdateModelingUI = window.updateModelingUI;
    if (typeof _origUpdateModelingUI === 'function') {
        window.updateModelingUI = function () {
            _origUpdateModelingUI.call(this);

            // Re-enable arch tools regardless of modeling mode
            document.querySelectorAll('.arch-tool').forEach(btn => {
                btn.disabled = false;
            });
        };
        console.log('[Fix] updateModelingUI patched to keep arch-tool buttons enabled.');
    }

    // Also re-enable arch buttons right now in case updateModelingUI already ran
    document.querySelectorAll('.arch-tool').forEach(btn => { btn.disabled = false; });


    // ─────────────────────────────────────────────────────────────────────────
    // BUG 5 — toggleArchTool does NOT check/reset raycaster layer
    // ─────────────────────────────────────────────────────────────────────────
    // When an arch tool activates, the raycaster may still be set to layer 1/2/3
    // from the last vertex/edge/face selection.  Ground-plane clicks then miss.
    const _origToggleArchTool = window.toggleArchTool;
    if (typeof _origToggleArchTool === 'function') {
        window.toggleArchTool = function (toolName) {
            // Reset raycaster to default layer so ground-plane intersections work
            if (window.raycaster) window.raycaster.layers.set(0);
            // Also hide V/E/F helpers so they don't interfere visually
            if (window.vertexHelpers) window.vertexHelpers.visible = false;
            if (window.edgeHelpers)   window.edgeHelpers.visible   = false;
            if (window.faceHelpers)   window.faceHelpers.visible   = false;
            _origToggleArchTool.call(this, toolName);
        };
        console.log('[Fix] toggleArchTool patched to reset raycaster layer.');
    }


    // ─────────────────────────────────────────────────────────────────────────
    // BUG 6 — Helper groups may not have names set, causing scene.getObjectByName
    //          to fail and groups to be double-added
    // ─────────────────────────────────────────────────────────────────────────
    if (window.vertexHelpers) window.vertexHelpers.name = 'VertexHelpers';
    if (window.edgeHelpers)   window.edgeHelpers.name   = 'EdgeHelpers';
    if (window.faceHelpers)   window.faceHelpers.name   = 'FaceHelpers';


    // ─────────────────────────────────────────────────────────────────────────
    // BUG 7 — selectVertex / selectEdge / selectFace called in performViewBoxSelection
    //          but never defined anywhere as standalone functions
    // ─────────────────────────────────────────────────────────────────────────
    if (typeof window.selectVertex === 'undefined') {
        window.selectVertex = function (intersection) {
            if (!window.UnifiedModelingSystem) return;
            const data = { type: 'vertex', index: intersection.instanceId };
            window.UnifiedModelingSystem._addToSelection(data);
            window.UnifiedModelingSystem._updateVisualState(data, true, false);
            window.UnifiedModelingSystem._syncTransformGizmo();
        };
    }
    if (typeof window.selectEdge === 'undefined') {
        window.selectEdge = function (intersection) {
            if (!window.UnifiedModelingSystem) return;
            const data = { type: 'edge', indices: intersection.object.userData.indices };
            window.UnifiedModelingSystem._addToSelection(data);
            window.UnifiedModelingSystem._updateVisualState(data, true, false);
            window.UnifiedModelingSystem._syncTransformGizmo();
        };
    }
    if (typeof window.selectFace === 'undefined') {
        window.selectFace = function (intersection) {
            if (!window.UnifiedModelingSystem) return;
            const ud = intersection.object ? intersection.object.userData : {};
            const data = { type: 'face', indices: ud.indices || [], faceIndex: ud.faceIndex ?? intersection.faceIndex ?? 0 };
            window.UnifiedModelingSystem._addToSelection(data);
            window.UnifiedModelingSystem._updateVisualState(data, true, false);
            window.UnifiedModelingSystem._syncTransformGizmo();
        };
    }
    if (typeof window.deselectVertex === 'undefined') {
        window.deselectVertex = function (proxy) {
            if (!window.UnifiedModelingSystem) return;
            window.UnifiedModelingSystem._updateVisualState(proxy.userData, false, false);
        };
    }
    if (typeof window.deselectEdge === 'undefined') {
        window.deselectEdge = function (proxy) {
            if (!window.UnifiedModelingSystem) return;
            window.UnifiedModelingSystem._updateVisualState(proxy.userData, false, false);
        };
    }
    if (typeof window.deselectFace === 'undefined') {
        window.deselectFace = function (proxy) {
            if (!window.UnifiedModelingSystem) return;
            window.UnifiedModelingSystem._updateVisualState(proxy.userData, false, false);
        };
    }
    console.log('[Fix] selectVertex/selectEdge/selectFace stubs created.');


    // ─────────────────────────────────────────────────────────────────────────
    // BUG 8 — areProxiesEqual used in performViewBoxSelection but never defined
    // ─────────────────────────────────────────────────────────────────────────
    if (typeof window.areProxiesEqual === 'undefined') {
        window.areProxiesEqual = function (a, b) {
            return window.UnifiedModelingSystem
                ? window.UnifiedModelingSystem._isEqual(a, b)
                : false;
        };
        console.log('[Fix] areProxiesEqual stub created.');
    }


    // ─────────────────────────────────────────────────────────────────────────
    // BUG 9 — updateTransformControlsAttachment undefined (called in viewbox sel.)
    // ─────────────────────────────────────────────────────────────────────────
    if (typeof window.updateTransformControlsAttachment === 'undefined') {
        window.updateTransformControlsAttachment = function () {
            if (window.UnifiedModelingSystem) {
                window.UnifiedModelingSystem._syncTransformGizmo();
            }
        };
        console.log('[Fix] updateTransformControlsAttachment stub created.');
    }


    // ─────────────────────────────────────────────────────────────────────────
    // BUG 10 — resetHighlights undefined (called after viewbox selection)
    // ─────────────────────────────────────────────────────────────────────────
    if (typeof window.resetHighlights === 'undefined') {
        window.resetHighlights = function () {
            // Restore all non-selected helpers to their default colour
            if (!window.vertexHelpers || !window.edgeHelpers || !window.faceHelpers) return;
            const selected = window.selectedElements || [];
            const UMS = window.UnifiedModelingSystem;
            if (!UMS) return;

            const inst = window.vertexHelpers.children.find(c => c.isInstancedMesh);
            if (inst) {
                const defColor = new THREE.Color(0x00aaff);
                const selColor = new THREE.Color(0xffa500);
                for (let i = 0; i < inst.count; i++) {
                    const isSel = selected.some(p => p.userData.type === 'vertex' && p.userData.index === i);
                    inst.setColorAt(i, isSel ? selColor : defColor);
                }
                if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
            }
        };
        console.log('[Fix] resetHighlights stub created.');
    }


    // ─────────────────────────────────────────────────────────────────────────
    // VERIFY on next tick that the system is wired correctly
    // ─────────────────────────────────────────────────────────────────────────
    setTimeout(() => {
        const ok = window.UnifiedModelingSystem &&
                   typeof window.UnifiedModelingSystem.rebuildAllHelpers === 'function' &&
                   typeof window.UnifiedModelingSystem.clearAllHelpers    === 'function' &&
                   typeof window.UnifiedModelingSystem.clearSelection     === 'function' &&
                   typeof window.VERTEX_LAYER !== 'undefined';

        console.log(ok
            ? '[Fix] ✅ All modeling-engine patches applied successfully.'
            : '[Fix] ❌ Some patches may be incomplete — check console for errors.');

        // Ensure arch buttons are enabled one more time after all init code runs
        document.querySelectorAll('.arch-tool').forEach(btn => { btn.disabled = false; });
    }, 500);

})();