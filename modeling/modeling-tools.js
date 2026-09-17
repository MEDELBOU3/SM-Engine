// =================================================================================
// UNIFIED MODELING ENGINE (Fixed Layers, Indices, and Deformation)
// =================================================================================

if (typeof vertexHelpers === 'undefined') window.vertexHelpers = new THREE.Group();
if (typeof edgeHelpers === 'undefined') window.edgeHelpers = new THREE.Group();
if (typeof faceHelpers === 'undefined') window.faceHelpers = new THREE.Group();

const ModelingEngine = {
    selectedProxies: [],
    pivot: new THREE.Group(),
    hoveredItem: null,
    dragStartVertices: new Map(), // Stores original vertex positions for dragging
    pivotStartMatrix: new THREE.Matrix4(),

    init: function () {
        this.pivot.name = "ModelingPivot";
        scene.add(this.pivot);
        scene.add(vertexHelpers);
        scene.add(edgeHelpers);
        scene.add(faceHelpers);

        // Ensure camera can see the helper layers
        if (camera) {
            camera.layers.enable(1); // Vertices
            camera.layers.enable(2); // Edges
            camera.layers.enable(3); // Faces
        }

        this.setupGizmoListeners();

        // Do not override the canonical unified system when it already exists.
        if (!window.UnifiedModelingSystem || typeof window.UnifiedModelingSystem.rebuildAllHelpers !== "function") {
            window.UnifiedModelingSystem = this;
        }
    },

    rebuildHelpers: function () {
        this.clearHelpers();
        if (!activeObject || !activeObject.geometry) return;

        const geometry = activeObject.geometry;
        const positions = geometry.attributes.position;
        const matrixWorld = activeObject.matrixWorld;

        // FIX: If geometry is not indexed, simulate an index array so we can draw edges/faces
        let indexArray = geometry.index ? geometry.index.array : null;
        if (!indexArray) {
            indexArray = new Uint32Array(positions.count);
            for (let i = 0; i < positions.count; i++) indexArray[i] = i;
        }

        // --- 1. VERTEX HELPERS (Instanced for Performance) ---
        if (selectionMode === 'vertex') {
            const count = positions.count;
            const dotGeo = new THREE.SphereGeometry(0.03, 6, 6);
            const dotMat = new THREE.MeshBasicMaterial({ color: 0x0077ff, depthTest: false });
            const instancedMesh = new THREE.InstancedMesh(dotGeo, dotMat, count);

            const dummy = new THREE.Object3D();
            for (let i = 0; i < count; i++) {
                dummy.position.fromBufferAttribute(positions, i).applyMatrix4(matrixWorld);
                dummy.updateMatrix();
                instancedMesh.setMatrixAt(i, dummy.matrix);
            }
            instancedMesh.layers.set(1);
            vertexHelpers.add(instancedMesh);
        }

        // --- 2. EDGE HELPERS ---
        if (selectionMode === 'edge') {
            const edgeMaterial = new THREE.LineBasicMaterial({ color: 0x00ffff, depthTest: false, transparent: true, opacity: 0.8 });

            for (let i = 0; i < indexArray.length; i += 3) {
                const edges = [
                    [indexArray[i], indexArray[i + 1]],
                    [indexArray[i + 1], indexArray[i + 2]],
                    [indexArray[i + 2], indexArray[i]]
                ];

                edges.forEach(pair => {
                    const v1 = new THREE.Vector3().fromBufferAttribute(positions, pair[0]).applyMatrix4(matrixWorld);
                    const v2 = new THREE.Vector3().fromBufferAttribute(positions, pair[1]).applyMatrix4(matrixWorld);
                    const geo = new THREE.BufferGeometry().setFromPoints([v1, v2]);
                    const line = new THREE.Line(geo, edgeMaterial.clone()); // Clone material so we can highlight individually
                    line.layers.set(2); // Edge Layer
                    line.userData = { type: 'edge', indices: pair };
                    edgeHelpers.add(line);
                });
            }
        }

        // --- 3. FACE HELPERS ---
        if (selectionMode === 'face') {
            const faceMat = new THREE.MeshBasicMaterial({ color: 0x44dd88, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthTest: false });

            for (let i = 0; i < indexArray.length; i += 3) {
                const v1 = new THREE.Vector3().fromBufferAttribute(positions, indexArray[i]).applyMatrix4(matrixWorld);
                const v2 = new THREE.Vector3().fromBufferAttribute(positions, indexArray[i + 1]).applyMatrix4(matrixWorld);
                const v3 = new THREE.Vector3().fromBufferAttribute(positions, indexArray[i + 2]).applyMatrix4(matrixWorld);

                const geo = new THREE.BufferGeometry().setFromPoints([v1, v2, v3]);
                const mesh = new THREE.Mesh(geo, faceMat.clone());
                mesh.layers.set(3); // Face Layer
                mesh.userData = { type: 'face', indices: [indexArray[i], indexArray[i + 1], indexArray[i + 2]], faceIndex: i / 3 };
                faceHelpers.add(mesh);
            }
        }
    },

    applyModelingShader: function (mesh) {
        mesh.material.onBeforeCompile = (shader) => {
            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <dithering_fragment>',
                `
            // Procedural Edge Detection
            float edge = min(vUv.x, vUv.y); 
            if (edge < 0.05) gl_FragColor = vec4(1.0, 0.8, 0.0, 1.0); // Orange
            #include <dithering_fragment>
            `
            );
        };
        mesh.material.needsUpdate = true;
    },

    clearHelpers: function () {
        [vertexHelpers, edgeHelpers, faceHelpers].forEach(group => {
            group.children.forEach(child => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
                    else child.material.dispose();
                }
            });
            group.clear();
        });
    },

    // ------------------------------------------------------------------
    // 2. SELECTION LOGIC
    // ------------------------------------------------------------------
    onCanvasClick: function (event) {
        if (!isModelingMode || !activeObject || isTransforming) return;

        const isAdditive = event.shiftKey;
        let hit = this.getIntersect();

        if (hit) {
            const data = this.extractData(hit);
            const existingIdx = this.selectedProxies.findIndex(p => this.isEqual(p.userData, data));

            if (existingIdx !== -1) {
                if (isAdditive) this.removeProxy(existingIdx);
                else {
                    this.clearSelection();
                    this.createProxy(data);
                }
            } else {
                if (!isAdditive) this.clearSelection();
                this.createProxy(data);
            }
        } else {
            if (!isAdditive) this.clearSelection();
        }

        this.syncGizmo();
    },

    onCanvasHover: function (event) {
        this.onHover();
    },

    onHover: function () {
        if (isTransforming) return;

        if (this.hoveredItem) {
            const isSelected = this.selectedProxies.some(p => this.isEqual(p.userData, this.hoveredItem));
            this.setVisualState(this.hoveredItem, isSelected, false);
            this.hoveredItem = null;
        }

        let hit = this.getIntersect();
        if (hit) {
            const data = this.extractData(hit);
            this.hoveredItem = data;
            this.setVisualState(data, true, true);
            renderer.domElement.style.cursor = 'pointer';
        } else {
            renderer.domElement.style.cursor = 'crosshair';
        }
    },

    // ------------------------------------------------------------------
    // 3. DEFORMATION LOGIC (Fixed Delta Math)
    // ------------------------------------------------------------------
    setupGizmoListeners: function () {

        transformControls.addEventListener('change', () => {
            if (!isTransforming || !activeObject || this.selectedProxies.length === 0) return;

            const posAttr = activeObject.geometry.attributes.position;
            const invMat = activeObject.matrixWorld.clone().invert();

            // Calculate how much the Gizmo moved since the drag started
            const currentPivotMatrix = this.pivot.matrixWorld.clone();
            const deltaMatrix = currentPivotMatrix.multiply(this.pivotStartMatrix.clone().invert());

            // Apply that exact movement to the original vertices
            this.dragStartVertices.forEach((originalWorldPos, vertexIndex) => {
                const newWorldPos = originalWorldPos.clone().applyMatrix4(deltaMatrix);
                const localPos = newWorldPos.applyMatrix4(invMat);
                posAttr.setXYZ(vertexIndex, localPos.x, localPos.y, localPos.z);
            });

            posAttr.needsUpdate = true;
            this.updateHelpersPositions();
        });

        transformControls.addEventListener('dragging-changed', (event) => {
            isTransforming = event.value;
            if (controls) controls.enabled = !isTransforming;

            if (isTransforming) {
                // START DRAG: Save the exact world positions of everything before moving
                this.dragStartVertices.clear();
                this.pivot.updateMatrixWorld(true);
                this.pivotStartMatrix.copy(this.pivot.matrixWorld);

                const posAttr = activeObject.geometry.attributes.position;

                this.selectedProxies.forEach(proxy => {
                    const indices = proxy.userData.type === 'vertex' ? [proxy.userData.index] : proxy.userData.indices;
                    indices.forEach(idx => {
                        const worldPos = new THREE.Vector3().fromBufferAttribute(posAttr, idx).applyMatrix4(activeObject.matrixWorld);
                        this.dragStartVertices.set(idx, worldPos);
                    });
                });

            } else {
                // END DRAG: Update normals
                if (activeObject && activeObject.geometry) {
                    activeObject.geometry.computeVertexNormals();
                    activeObject.geometry.computeBoundingBox();
                }
                // Save History
                if (window.historyManager) {
                    window.historyManager.addStep({
                        type: 'transform',
                        name: 'Mesh Edit',
                        objectUuid: activeObject.uuid
                    });
                }
            }
        });
    },

    updateHelpersPositions: function () {
        const vInst = vertexHelpers.children.find(c => c.isInstancedMesh);
        if (!vInst) return;

        const pos = activeObject.geometry.attributes.position;
        const dummy = new THREE.Object3D();

        for (let i = 0; i < vInst.count; i++) {
            dummy.position.fromBufferAttribute(pos, i).applyMatrix4(activeObject.matrixWorld);
            dummy.updateMatrix();
            vInst.setMatrixAt(i, dummy.matrix);
        }
        vInst.instanceMatrix.needsUpdate = true;

        // Also update invisible proxies so gizmo stays attached
        this.selectedProxies.forEach(proxy => {
            if (proxy.userData.type === 'vertex') {
                proxy.position.fromBufferAttribute(pos, proxy.userData.index).applyMatrix4(activeObject.matrixWorld);
            } else {
                const center = new THREE.Vector3();
                proxy.userData.indices.forEach(idx => {
                    center.add(new THREE.Vector3().fromBufferAttribute(pos, idx).applyMatrix4(activeObject.matrixWorld));
                });
                center.divideScalar(proxy.userData.indices.length);
                proxy.position.copy(center);
            }
        });
    },

    // ------------------------------------------------------------------
    // UTILITIES
    // ------------------------------------------------------------------
    getIntersect: function () {
        if (selectionMode === 'vertex') raycaster.layers.set(1);
        else if (selectionMode === 'edge') raycaster.layers.set(2);
        else if (selectionMode === 'face') raycaster.layers.set(3);
        else raycaster.layers.set(0);

        const targets = [...vertexHelpers.children, ...edgeHelpers.children, ...faceHelpers.children];
        const intersects = raycaster.intersectObjects(targets, true);

        // FIX: CRITICAL! Reset Raycaster back to default layer (0) immediately!
        // If we don't do this, Architecture tools (Walls, Stairs) cannot click the ground!
        raycaster.layers.set(0);

        if (selectionMode === 'vertex') {
            return intersects.find(hit => hit.instanceId !== undefined);
        }
        return intersects[0];
    },

    extractData: function (hit) {
        if (!hit) return null;
        if (selectionMode === 'vertex') return { type: 'vertex', index: hit.instanceId };
        if (selectionMode === 'edge') return { type: 'edge', indices: hit.object.userData.indices };
        if (selectionMode === 'face') return { type: 'face', indices: hit.object.userData.indices, faceIndex: hit.object.userData.faceIndex };
        return null;
    },

    isEqual: function (a, b) {
        if (!a || !b || a.type !== b.type) return false;
        if (a.type === 'vertex') return a.index === b.index;
        if (a.type === 'edge') return (a.indices[0] === b.indices[0] && a.indices[1] === b.indices[1]) || (a.indices[0] === b.indices[1] && a.indices[1] === b.indices[0]);
        if (a.type === 'face') return a.faceIndex === b.faceIndex;
        return false;
    },

    createProxy: function (data) {
        const proxy = new THREE.Object3D();
        const pos = activeObject.geometry.attributes.position;
        let worldPos = new THREE.Vector3();

        if (data.type === 'vertex') {
            worldPos.fromBufferAttribute(pos, data.index).applyMatrix4(activeObject.matrixWorld);
        } else {
            data.indices.forEach(idx => worldPos.add(new THREE.Vector3().fromBufferAttribute(pos, idx)));
            worldPos.divideScalar(data.indices.length).applyMatrix4(activeObject.matrixWorld);
        }

        proxy.position.copy(worldPos);
        proxy.userData = data;
        scene.add(proxy);
        this.selectedProxies.push(proxy);

        // Sync global array so context menus work
        window.selectedElements = this.selectedProxies;

        this.setVisualState(data, true, false);
    },

    removeProxy: function (idx) {
        const p = this.selectedProxies[idx];
        this.setVisualState(p.userData, false, false);
        scene.remove(p);
        this.selectedProxies.splice(idx, 1);
        window.selectedElements = this.selectedProxies;
    },

    clearSelection: function () {
        this.selectedProxies.forEach(p => {
            this.setVisualState(p.userData, false, false);
            scene.remove(p);
        });
        this.selectedProxies = [];
        window.selectedElements = [];
        if (this.pivot && this.pivot.parent) {
            transformControls.detach();
            scene.remove(this.pivot);
        }
    },

    setVisualState: function (data, isSelected, isHover) {
        const COLOR_SELECTED = 0xffa500;
        const COLOR_HOVER = 0xff0000;
        const COLOR_DEFAULT_VERT = 0x0077ff;
        const COLOR_DEFAULT_EDGE = 0x00ffff;
        const COLOR_DEFAULT_FACE = 0x44dd88;

        if (data.type === 'vertex') {
            const vInst = vertexHelpers.children.find(c => c.isInstancedMesh);
            if (!vInst) return;
            const color = isHover ? COLOR_HOVER : (isSelected ? COLOR_SELECTED : COLOR_DEFAULT_VERT);
            vInst.setColorAt(data.index, new THREE.Color(color));
            if (vInst.instanceColor) vInst.instanceColor.needsUpdate = true;
        } else {
            const group = data.type === 'edge' ? edgeHelpers : faceHelpers;
            const helper = group.children.find(c => this.isEqual(c.userData, data));
            if (helper && helper.material) {
                const color = data.type === 'edge'
                    ? (isHover ? COLOR_HOVER : (isSelected ? COLOR_SELECTED : COLOR_DEFAULT_EDGE))
                    : (isHover ? COLOR_HOVER : (isSelected ? COLOR_SELECTED : COLOR_DEFAULT_FACE));

                helper.material.color.setHex(color);
                helper.material.opacity = isSelected ? 0.8 : (data.type === 'face' ? 0.2 : 0.5);
                helper.material.needsUpdate = true;
            }
        }
    },

    syncGizmo: function () {
        if (this.selectedProxies.length === 0) {
            transformControls.detach();
            if (this.pivot.parent) scene.remove(this.pivot);
            return;
        }

        if (!this.pivot.parent) scene.add(this.pivot);

        const center = new THREE.Vector3();
        this.selectedProxies.forEach(p => center.add(p.position));
        center.divideScalar(this.selectedProxies.length);

        this.pivot.position.copy(center);
        this.pivot.rotation.set(0, 0, 0);
        this.pivot.scale.set(1, 1, 1);
        this.pivot.updateMatrixWorld();

        transformControls.attach(this.pivot);
    }
};

// Start this legacy engine only if the canonical unified system is not active.
if (!window.UnifiedModelingSystem || typeof window.UnifiedModelingSystem.rebuildAllHelpers !== "function") {
    ModelingEngine.init();
}
