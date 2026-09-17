(function () {
    'use strict';
    const H = window.SMHistory = window.SMHistory || {};

    class HistoryManager {
        constructor(scene, transformControls, controls) {
            this.scene = scene || window.scene;
            this.transformControls = transformControls || window.transformControls;
            this.controls = controls || window.controls;

            this.undoStack = [];
            this.redoStack = [];
            this.maxHistory = 50;
            this.isExecuting = false;

            // Search State
            this.searchQuery = "";

            // State for capturing object transforms
            this.dragStartState = null;

            // State for capturing sub-object vertex/edge/face edits via Gizmo
            this.modelingDragStartGeo = null;
            this.modelingTargetMesh = null;

            // Ensure global reference immediately
            window.historyManager = this;

            // Initialize listeners and UI
            this.initListeners();
            this.setupUI();
            console.log("✅ Advanced History Manager Initialized (3D Viewport & Unified Modeling System support)");
        }

        // --- 1. EVENT LISTENERS ---
        initListeners() {
            if (!this.transformControls) {
                console.warn("HistoryManager: TransformControls not found initially, binding fallback.");
            } else {
                this.bindTransformControls(this.transformControls);
            }

            // Global Event for recording 2D keyframes / actions
            window.addEventListener('animation2d:keyframe-recorded', () => {
                if (this.isExecuting) return;
                this.updateUI();
            });
        }

        bindTransformControls(transformControls) {
            if (!transformControls || transformControls._smHistoryBound) return;
            transformControls._smHistoryBound = true;
            this.transformControls = transformControls;

            // Mouse Down: Capture "Before" state and disable OrbitControls
            transformControls.addEventListener('mouseDown', () => {
                const activeControls = this.controls || window.controls;
                if (activeControls) activeControls.enabled = false;
                if (this.isExecuting) return;

                // FIX: In modeling edit mode, capture the mesh geometry BEFORE dragging vertex/edge/face
                const modelingSystem = window.UnifiedModelingSystem;
                if (modelingSystem && modelingSystem.isEditMode && 
                   (transformControls.object === modelingSystem.subObjectPivot || !transformControls.object || transformControls.object === modelingSystem.activeMesh)) {
                    
                    const activeMesh = modelingSystem.activeMesh;
                    if (activeMesh && activeMesh.geometry) {
                        this.modelingDragStartGeo = this.serializeGeometry(activeMesh.geometry);
                        this.modelingTargetMesh = activeMesh;
                    } else {
                        this.modelingDragStartGeo = null;
                        this.modelingTargetMesh = null;
                    }
                    this.dragStartState = null;
                    return;
                }

                // Standard Object Mode transform
                const object = transformControls.object;
                if (object) {
                    this.dragStartState = {
                        position: object.position.clone(),
                        rotation: object.rotation.clone(),
                        scale: object.scale.clone()
                    };
                }
            });

            // Mouse Up: Capture "After" state, Record, and re-enable OrbitControls
            transformControls.addEventListener('mouseUp', () => {
                const activeControls = this.controls || window.controls;
                if (activeControls) activeControls.enabled = true;
                if (this.isExecuting) return;

                // FIX: In modeling edit mode, compare and record the vertex/edge/face move
                const modelingSystem = window.UnifiedModelingSystem;
                if (this.modelingDragStartGeo && modelingSystem && modelingSystem.isEditMode) {
                    const activeMesh = this.modelingTargetMesh || modelingSystem.activeMesh;
                    if (activeMesh && activeMesh.geometry) {
                        const afterGeo = this.serializeGeometry(activeMesh.geometry);
                        if (afterGeo && this.hasGeometryChanged(this.modelingDragStartGeo, afterGeo)) {
                            const modeLabel = modelingSystem.currentMode || modelingSystem.selectionMode || 'Element';
                            this.addStep({
                                type: 'geometry',
                                name: `Move ${modeLabel}`,
                                objectUuid: activeMesh.uuid,
                                objectName: activeMesh.name,
                                object: activeMesh,
                                before: this.modelingDragStartGeo,
                                after: afterGeo
                            });
                        }
                    }
                    this.modelingDragStartGeo = null;
                    this.modelingTargetMesh = null;
                    return;
                }

                // Standard Object Mode transform record
                if (!this.dragStartState) return;
                const object = transformControls.object;
                if (object) {
                    if (!object.position.equals(this.dragStartState.position) ||
                        !object.rotation.equals(this.dragStartState.rotation) ||
                        !object.scale.equals(this.dragStartState.scale)) {

                        const modeLabel = transformControls.mode ? transformControls.mode.toUpperCase() : 'Transform';
                        this.addStep({
                            type: 'transform',
                            name: `${modeLabel} ${object.name || 'Object'}`,
                            objectUuid: object.uuid,
                            objectName: object.name,
                            object: object,
                            before: this.dragStartState,
                            after: {
                                position: object.position.clone(),
                                rotation: object.rotation.clone(),
                                scale: object.scale.clone()
                            }
                        });
                    }
                }
                this.dragStartState = null;
            });
        }

        // Helper to detect if positions actually changed
        hasGeometryChanged(before, after) {
            if (!before || !after) return false;
            if (!before.positions || !after.positions) return false;
            if (before.positions.length !== after.positions.length) return true;
            const b = before.positions;
            const a = after.positions;
            const len = b.length;
            for (let i = 0; i < len; i++) {
                if (Math.abs(b[i] - a[i]) > 1e-5) {
                    return true;
                }
            }
            return false;
        }

        // --- 2. CORE RECORDING FUNCTIONS ---

        addStep(action) {
            if (!action || this.isExecuting) return;

            const timestamp = action.timestamp || new Date();
            const id = action.id || (Date.now() + Math.random().toString(16).slice(2));

            // Guarantee the step is recorded in the stack
            this.undoStack.push({ ...action, id, timestamp });
            this.redoStack = [];

            if (this.undoStack.length > this.maxHistory) {
                this.undoStack.shift();
            }

            this.updateUI();
            window.dispatchEvent(new CustomEvent('historyChanged', { detail: action }));
        }

        push(step) {
            if (!step) return;
            if (step.undo && step.redo) {
                this.recordCustomAction(step.name || step.type || 'Action', step.detail || '', step.undo, step.redo);
            } else {
                this.addStep(step);
            }
        }

        // Universal Geometry Serializer (Supports live THREE.BufferGeometry and existing snapshot objects)
        serializeGeometry(geometry) {
            if (!geometry) return null;

            // 1. If it is already a serialized snapshot
            if (geometry.positions && (Array.isArray(geometry.positions) || ArrayBuffer.isView(geometry.positions))) {
                return {
                    positions: Array.from(geometry.positions),
                    index: geometry.index ? Array.from(geometry.index) : null,
                    uv: geometry.uv ? Array.from(geometry.uv) : null,
                    topology: geometry.topology
                        ? JSON.parse(JSON.stringify(geometry.topology))
                        : (geometry.editMeshTopology ? JSON.parse(JSON.stringify(geometry.editMeshTopology)) : null),
                    smoothAngle: geometry.smoothAngle
                };
            }

            // 2. If it is a live THREE.BufferGeometry
            if (!geometry.attributes || !geometry.attributes.position) return null;

            const serialized = {
                positions: Array.from(geometry.attributes.position.array),
                index: geometry.index ? Array.from(geometry.index.array) : null,
                topology: geometry.userData?.editMeshTopology
                    ? JSON.parse(JSON.stringify(geometry.userData.editMeshTopology))
                    : null,
                smoothAngle: geometry.userData?.smoothAngle
            };
            if (geometry.attributes.uv) {
                serialized.uv = Array.from(geometry.attributes.uv.array);
            }
            return serialized;
        }

        // Helper for Geometry / Modeling Changes (Subdivide, Extrude, Inset, Bevel, Delete, etc.)
        recordGeometryChange(object, beforeGeometry, afterGeometry, name) {
            let targetObj = object;
            let before = beforeGeometry;
            let after = afterGeometry;
            let actionName = name;

            // Handle case where caller omitted object: recordGeometryChange(beforeGeo, "Subdivide")
            if (targetObj && (targetObj.isBufferGeometry || targetObj.attributes || targetObj.positions)) {
                actionName = typeof after === 'string' ? after : (typeof before === 'string' ? before : 'Mesh Edit');
                after = (before && !before.isBufferGeometry && !before.attributes && !before.positions) ? null : before;
                before = targetObj;
                targetObj = window.UnifiedModelingSystem?.activeMesh;
            }

            if (!targetObj) targetObj = window.UnifiedModelingSystem?.activeMesh;
            if (!targetObj) return;

            // FIX: Handle flexible 3-arg signature: recordGeometryChange(mesh, beforeGeo, "Subdivide")
            if (typeof after === 'string' && !actionName) {
                actionName = after;
                after = targetObj.geometry;
            } else if (!after) {
                after = targetObj.geometry;
            }

            const serializedBefore = this.serializeGeometry(before);
            const serializedAfter = this.serializeGeometry(after || targetObj.geometry);

            if (!serializedBefore || !serializedAfter) {
                console.warn("[HistoryManager] recordGeometryChange aborted: invalid before/after geometry", { before, after });
                return;
            }

            this.addStep({
                type: 'geometry',
                name: actionName || 'Mesh Edit',
                objectUuid: targetObj.uuid,
                objectName: targetObj.name,
                object: targetObj,
                before: serializedBefore,
                after: serializedAfter
            });
        }

        recordCustomAction(name, detail, undoAction, redoAction) {
            let undoFn = null;
            let redoFn = null;
            let displayName = typeof name === 'string' ? name : (name?.name || name?.type || 'Action');
            let detailStr = typeof detail === 'string' ? detail : '';

            if (typeof undoAction === 'function') {
                undoFn = undoAction;
                redoFn = typeof redoAction === 'function' ? redoAction : null;
            } else if (typeof detail === 'function') {
                undoFn = detail;
                redoFn = typeof undoAction === 'function' ? undoAction : null;
                detailStr = '';
            } else if (typeof name === 'object' && name) {
                if (typeof name.undo === 'function') undoFn = name.undo;
                if (typeof name.redo === 'function') redoFn = name.redo;
            }

            const title = detailStr ? `${displayName}: ${detailStr}` : displayName;

            this.addStep({
                type: 'custom',
                name: title,
                undo: undoFn,
                redo: redoFn
            });
        }

        recordMaterialChange(object, oldMaterial, newMaterial) {
            if (!object) return;
            this.addStep({
                type: 'material',
                name: `Material: ${object.name || 'Object'}`,
                objectUuid: object.uuid,
                objectName: object.name,
                object: object,
                oldMat: oldMaterial,
                newMat: newMaterial
            });
        }

        recordPropertyChange(object, path, oldVal, newVal) {
            if (!object) return;
            this.addStep({
                type: 'property',
                name: `Change ${path} on ${object.name || 'Object'}`,
                objectUuid: object.uuid,
                objectName: object.name,
                object: object,
                path: path,
                oldVal: oldVal,
                newVal: newVal
            });
        }

        recordObjectLifecycle(object, actionType) {
            if (!object) return;
            this.addStep({
                type: 'lifecycle',
                name: `${actionType === 'add' ? 'Add' : 'Delete'} ${object.name || 'Object'}`,
                objectUuid: object.uuid,
                objectName: object.name,
                object: object,
                actionType: actionType,
                objectData: actionType === 'delete' ? this.serializeObject(object) : null
            });
        }

        // --- 3. UNDO / REDO EXECUTION ---

        undo() {
            if (this.undoStack.length === 0 || this.isExecuting) return;

            this.isExecuting = true;
            const action = this.undoStack.pop();
            this.redoStack.push(action);

            try {
                this.applyState(action, 'undo');
            } catch (e) {
                console.error("History: Error during undo execution", e);
            }

            this.isExecuting = false;
            this.updateUI();
        }

        redo() {
            if (this.redoStack.length === 0 || this.isExecuting) return;

            this.isExecuting = true;
            const action = this.redoStack.pop();
            this.undoStack.push(action);

            try {
                this.applyState(action, 'redo');
            } catch (e) {
                console.error("History: Error during redo execution", e);
            }

            this.isExecuting = false;
            this.updateUI();
        }

        applyState(action, mode) {
            if (!action) return;

            // 1. Custom Callback Functions
            if (mode === 'undo' && typeof action.undo === 'function') {
                action.undo();
                this.refreshAfterStateChange(action);
                return;
            }
            if (mode === 'redo' && typeof action.redo === 'function') {
                action.redo();
                this.refreshAfterStateChange(action);
                return;
            }

            // 2. 2D Animation Actions
            if (action.type && (action.type.startsWith('2d_') || action.type === 'animation2d' || action.type === '2d_animation')) {
                const state = (mode === 'undo') ? action.before : action.after;
                const animMgr = window.animation2DManager || window.v2dManager?.animManager;
                if (animMgr && state) {
                    this.restore2DState(animMgr, state);
                }
                this.refreshAfterStateChange(action);
                return;
            }

            // 3. Object Lookup (Resolved via direct reference, active scene, or UnifiedModelingSystem)
            let object = action.object || null;
            const activeScene = this.scene || window.scene;

            if (!object || !object.parent) {
                if (action.objectUuid && activeScene) {
                    object = activeScene.getObjectByProperty('uuid', action.objectUuid);
                }
                if (!object && action.objectId && activeScene) {
                    object = activeScene.getObjectById(action.objectId);
                }
                if (!object && action.objectName && activeScene) {
                    object = activeScene.getObjectByName(action.objectName);
                }
                if (!object && window.UnifiedModelingSystem?.activeMesh) {
                    const activeMesh = window.UnifiedModelingSystem.activeMesh;
                    if (activeMesh.uuid === action.objectUuid || !action.objectUuid) {
                        object = activeMesh;
                    }
                }
            }

            // 4. Transform Action
            if (action.type === 'transform') {
                if (object) {
                    const data = (mode === 'undo') ? action.before : action.after;
                    if (data) {
                        if (data.position) object.position.copy(data.position);
                        if (data.rotation) object.rotation.copy(data.rotation);
                        if (data.scale) object.scale.copy(data.scale);
                        object.updateMatrixWorld(true);
                        const gizmo = this.transformControls || window.transformControls;
                        if (gizmo && gizmo.object === object && typeof gizmo.updateMatrix === 'function') {
                            gizmo.updateMatrix();
                        }
                    }
                }
            }
            // 5. Material Action
            else if (action.type === 'material') {
                if (object) {
                    const mat = (mode === 'undo') ? action.oldMat : action.newMat;
                    if (mat) {
                        if (Array.isArray(mat)) {
                            if (Array.isArray(object.material)) {
                                mat.forEach((m, i) => { if (object.material[i] && m) object.material[i].copy(m); });
                            } else if (mat[0]) {
                                object.material.copy(mat[0]);
                            }
                        } else if (object.material) {
                            object.material.copy(mat);
                        }
                        if (Array.isArray(object.material)) object.material.forEach(m => m.needsUpdate = true);
                        else if (object.material) object.material.needsUpdate = true;
                    }
                }
            }
            // 6. Property Action
            else if (action.type === 'property') {
                if (object) {
                    const val = (mode === 'undo') ? action.oldVal : action.newVal;
                    const parts = action.path ? action.path.split('.') : [];
                    let target = object;
                    for (let i = 0; i < parts.length - 1; i++) {
                        if (target == null) break;
                        target = target[parts[i]];
                    }
                    if (target != null && parts.length > 0) {
                        target[parts[parts.length - 1]] = val;
                        if (object.material) {
                            if (Array.isArray(object.material)) object.material.forEach(m => m.needsUpdate = true);
                            else object.material.needsUpdate = true;
                        }
                    }
                }
            }
            // 7. Lifecycle (Add / Delete)
            else if (action.type === 'lifecycle') {
                if (action.actionType === 'add') {
                    if (mode === 'undo') {
                        if (object && activeScene) activeScene.remove(object);
                    } else {
                        if (object && activeScene && !object.parent) activeScene.add(object);
                    }
                } else if (action.actionType === 'delete') {
                    if (mode === 'undo') {
                        let restored = object;
                        if (!restored && action.objectData && typeof THREE !== 'undefined') {
                            const loader = new THREE.ObjectLoader();
                            try { restored = loader.parse(action.objectData); } catch (e) { console.error(e); }
                        }
                        if (restored && activeScene && !restored.parent) {
                            activeScene.add(restored);
                            if (typeof window.objects !== 'undefined' && Array.isArray(window.objects) && !window.objects.includes(restored)) {
                                window.objects.push(restored);
                            }
                        }
                    } else {
                        if (object && activeScene) {
                            activeScene.remove(object);
                            if (typeof window.objects !== 'undefined' && Array.isArray(window.objects)) {
                                const idx = window.objects.indexOf(object);
                                if (idx !== -1) window.objects.splice(idx, 1);
                            }
                        }
                    }
                }
            }
            // 8. Sculpt Action
            else if (action.type === 'sculpt') {
                if (object) {
                    const positions = (mode === 'undo') ? action.before : action.after;
                    if (object.geometry && object.geometry.attributes.position && positions) {
                        object.geometry.attributes.position.array.set(positions);
                        object.geometry.attributes.position.needsUpdate = true;
                        object.geometry.computeVertexNormals();
                        object.geometry.computeBoundingBox();
                        if (window.sculptingSystem && window.sculptingSystem.currentMesh === object) {
                            window.sculptingSystem.buildSpatialIndex?.();
                        }
                    }
                }
            }
            // 9. Geometry / Modeling Action (Subdivide, Extrude, Move Vertex/Edge/Face)
            else if (action.type === 'geometry' || action.type === 'modeling') {
                if (object) {
                    const geoData = (mode === 'undo')
                        ? (action.before || action.beforeGeometry)
                        : (action.after || action.afterGeometry);
                    if (geoData && this.restoreGeometryFromData(object, geoData)) {
                        this.refreshModelingState(object);
                    }
                }
            }

            this.refreshAfterStateChange(action);
        }

        // Rebuild mesh geometry from serialized snapshot
        restoreGeometryFromData(object, data) {
            if (!object || !data || !data.positions || typeof THREE === 'undefined') return false;
            try {
                const geometry = new THREE.BufferGeometry();
                geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));
                if (data.index && data.index.length) {
                    geometry.setIndex(data.index);
                }
                if (data.uv) {
                    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(data.uv, 2));
                }
                if (data.topology) {
                    geometry.userData.editMeshTopology = JSON.parse(JSON.stringify(data.topology));
                }
                if (data.smoothAngle !== undefined) {
                    geometry.userData.smoothAngle = data.smoothAngle;
                }
                geometry.computeVertexNormals();
                geometry.computeBoundingBox();
                geometry.computeBoundingSphere();

                const oldGeometry = object.geometry;
                object.geometry = geometry;
                if (oldGeometry && oldGeometry !== geometry) {
                    try { oldGeometry.dispose(); } catch (e) { }
                }
                return true;
            } catch (e) {
                console.warn("HistoryManager: Geometry restore failed.", e);
                return false;
            }
        }

        // Refresh UnifiedModelingSystem helpers and edit mesh cache
        refreshModelingState(object) {
            try {
                const sys = window.UnifiedModelingSystem;
                if (!sys || !sys.isEditMode) return;
                if (sys.activeMesh && sys.activeMesh !== object && sys.activeMesh.uuid !== object?.uuid) return;
                
                if (typeof sys.refreshEditableMeshFromLiveGeometry === 'function') {
                    sys.refreshEditableMeshFromLiveGeometry();
                } else if (typeof sys.rebuildAllHelpers === 'function') {
                    sys.rebuildAllHelpers();
                } else if (typeof sys.syncWithActiveMesh === 'function') {
                    sys.syncWithActiveMesh();
                }
            } catch (e) {
                console.warn("HistoryManager: Modeling refresh failed.", e);
            }
        }

        refreshAfterStateChange(action) {
            if (typeof window.updateHierarchy === 'function') window.updateHierarchy();
            if (typeof window.updateInspector === 'function') window.updateInspector();
            window.dispatchEvent(new CustomEvent('sceneChanged'));
            window.dispatchEvent(new CustomEvent('historyChanged', { detail: action }));
            const currentScene = this.scene || window.scene;
            if (window.renderer && currentScene && window.camera) {
                window.renderer.render(currentScene, window.camera);
            }
        }

        serializeObject(object) {
            try {
                const safeUserData = {};
                const badKeys = ['mixer', 'physicsBody', 'bboxHelper', 'helper', 'originalMaterial', 'selectionProxy', 'origHighlight'];
                for (let key in object.userData) {
                    if (!badKeys.includes(key)) safeUserData[key] = object.userData[key];
                }
                const originalUserData = object.userData;
                object.userData = safeUserData;
                const json = object.toJSON();
                object.userData = originalUserData;
                return json;
            } catch (e) {
                console.warn("HistoryManager: Failed to serialize object for history.", e);
                return null;
            }
        }

        restore2DState(animMgr, state) {
            if (!animMgr || !state) return;
            if (animMgr.keyframes && state.keyframes) {
                animMgr.keyframes.clear();
                for (const f in state.keyframes) {
                    animMgr.keyframes.set(Number(f), JSON.parse(JSON.stringify(state.keyframes[f])));
                }
            }
            if (state.layers) animMgr.layers = JSON.parse(JSON.stringify(state.layers));
            if (animMgr.cameraKeyframes && state.cameraKeyframes) {
                animMgr.cameraKeyframes.clear();
                for (const f in state.cameraKeyframes) {
                    animMgr.cameraKeyframes.set(Number(f), JSON.parse(JSON.stringify(state.cameraKeyframes[f])));
                }
            }
            if (state.activeLayerId !== undefined) {
                animMgr.currentLayerId = state.activeLayerId;
                animMgr.activeLayerId = state.activeLayerId;
            }
            if (state.currentFrame !== undefined && typeof animMgr.goToFrame === 'function') {
                animMgr.goToFrame(state.currentFrame);
            } else {
                const frameIdx = typeof animMgr.getCurrentFrameIndex === 'function' ? animMgr.getCurrentFrameIndex() : 1;
                animMgr.strokes = animMgr.keyframes ? (animMgr.keyframes.get(frameIdx) || []) : [];
            }
            if (typeof animMgr.refreshLayerSelect === 'function') animMgr.refreshLayerSelect();
            if (typeof animMgr.syncLayerControls === 'function') animMgr.syncLayerControls();
            if (typeof animMgr.syncWithTimeline === 'function') animMgr.syncWithTimeline();
            if (typeof animMgr.updateTimelineUI === 'function') animMgr.updateTimelineUI();
            if (typeof animMgr.syncTimelineMarkers === 'function') animMgr.syncTimelineMarkers();
            if (typeof animMgr.render === 'function') animMgr.render();
        }

        // --- 4. UI HANDLING ---

        setupUI() {
            const historyBtn = document.getElementById("historyBtn");
            const historyPanel = document.getElementById("historyPanel");
            const undoBtns = [document.getElementById("historyUndo"), document.getElementById("panelUndoBtn")].filter(Boolean);
            const redoBtns = [document.getElementById("historyRedo"), document.getElementById("panelRedoBtn")].filter(Boolean);

            const historySystemHeader = document.querySelector('.history-system .panel-header');
            if (historySystemHeader && !historySystemHeader.dataset.bound) {
                historySystemHeader.dataset.bound = "1";
                historySystemHeader.style.cursor = 'pointer';
                historySystemHeader.addEventListener('click', () => {
                    const hPanel = document.getElementById('history-panel');
                    if (hPanel) {
                        const hidden = hPanel.style.display === 'none';
                        hPanel.style.display = hidden ? 'flex' : 'none';
                        const icon = historySystemHeader.querySelector('.expand-button i');
                        if (icon) icon.className = hidden ? 'fas fa-caret-down' : 'fas fa-caret-right';
                    }
                });
            }

            if (historyBtn && !historyBtn.dataset.historySidebarBound) {
                historyBtn.dataset.historySidebarBound = "1";
                historyBtn.addEventListener('click', () => {
                    if (window.SecondarySidebar) {
                        window.SecondarySidebar.open('history');
                    } else if (historyPanel) {
                        const isVisible = historyPanel.style.display !== 'none';
                        historyPanel.style.display = isVisible ? 'none' : 'flex';
                        document.body.classList.toggle('side-panel-open', !isVisible);
                        document.body.classList.toggle('history-active', !isVisible);
                        if (!isVisible) this.updateUI();
                    }
                });
            }

            if (historyPanel && !document.getElementById('historySearch')) {
                const searchContainer = document.createElement('div');
                searchContainer.className = "pp-search-container";
                searchContainer.innerHTML = `
                    <input type="text" id="historySearch" placeholder="Search History..." class="pp-search-input">
                    <i class="fas fa-search pp-search-icon"></i>
                `;
                const header = historyPanel.querySelector('.pp-header-row');
                if (header) historyPanel.insertBefore(searchContainer, header.nextSibling);

                const searchInput = document.getElementById('historySearch');
                if (searchInput) {
                    searchInput.addEventListener('input', (e) => {
                        this.searchQuery = e.target.value.toLowerCase();
                        this.updateUI();
                    });
                    searchInput.addEventListener('keydown', (e) => e.stopPropagation());
                }
            }

            undoBtns.forEach(btn => btn.onclick = () => this.undo());
            redoBtns.forEach(btn => btn.onclick = () => this.redo());

            window.addEventListener('keydown', (e) => {
                const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
                if (tag === 'input' || tag === 'textarea' || e.target?.isContentEditable) return;

                if (e.ctrlKey || e.metaKey) {
                    if (e.key.toLowerCase() === 'z') {
                        e.preventDefault();
                        if (e.shiftKey) this.redo();
                        else this.undo();
                    } else if (e.key.toLowerCase() === 'y') {
                        e.preventDefault();
                        this.redo();
                    }
                }
            });
        }

        getIconAndColor(action) {
            const type = action.type || '';
            let iconClass = 'fa-cube';
            let colorClass = 'pp-color-blue';

            if (type === 'transform' || type === 'transform_2d') {
                colorClass = 'pp-color-green';
                iconClass = 'fa-arrows-alt';
            } else if (type === 'material') {
                colorClass = 'pp-color-purple';
                iconClass = 'fa-palette';
            } else if (type === 'property') {
                colorClass = 'pp-color-teal';
                iconClass = 'fa-sliders-h';
            } else if (type === 'sculpt') {
                colorClass = 'pp-color-orange';
                iconClass = 'fa-paint-brush';
            } else if (type === 'geometry' || type === 'modeling') {
                colorClass = 'pp-color-blue';
                iconClass = 'fa-shapes';
            } else if (type === 'lifecycle') {
                if (action.actionType === 'delete') {
                    colorClass = 'pp-color-orange';
                    iconClass = 'fa-trash-alt';
                } else {
                    colorClass = 'pp-color-blue';
                    iconClass = 'fa-plus-circle';
                }
            } else if (type.startsWith('2d_') || type === '2d_animation' || type === 'animation2d') {
                colorClass = 'pp-color-orange';
                if (type === '2d_stroke') iconClass = 'fa-pen-nib';
                else if (type === '2d_keyframe') iconClass = 'fa-film';
                else if (type === '2d_layer') iconClass = 'fa-layer-group';
                else iconClass = 'fa-paint-brush';
            } else if (type === 'custom') {
                colorClass = 'pp-color-purple';
                iconClass = 'fa-magic';
            }

            return { iconClass, colorClass };
        }

        updateUI() {
            const list = document.getElementById("historyListContainer");
            const historyItemsList = document.getElementById("history-items");
            const undoBtns = [document.getElementById("historyUndo"), document.getElementById("panelUndoBtn")].filter(Boolean);
            const redoBtns = [document.getElementById("historyRedo"), document.getElementById("panelRedoBtn")].filter(Boolean);

            undoBtns.forEach(btn => btn.disabled = this.undoStack.length === 0);
            redoBtns.forEach(btn => btn.disabled = this.redoStack.length === 0);

            let allActions = [
                ...this.redoStack.map(a => ({ ...a, status: 'future' })).reverse(),
                ...this.undoStack.map((a, i) => ({
                    ...a,
                    status: (i === this.undoStack.length - 1) ? 'current-state' : 'past'
                })).reverse()
            ];

            if (this.searchQuery) {
                allActions = allActions.filter(a => a.name && a.name.toLowerCase().includes(this.searchQuery));
            }

            if (list) {
                list.innerHTML = "";
                if (allActions.length === 0) {
                    list.innerHTML = `<div style="padding:15px; color:#666; text-align:center; font-size:11px;">No history events found.</div>`;
                } else {
                    allActions.forEach(action => list.appendChild(this.createRow(action)));
                }
            }

            if (historyItemsList) {
                historyItemsList.innerHTML = "";
                if (allActions.length === 0) {
                    historyItemsList.innerHTML = `<div style="padding:12px; color:#777; font-size:11px; text-align:center;">No history actions logged.</div>`;
                } else {
                    allActions.forEach(action => historyItemsList.appendChild(this.createHistoryItemRow(action)));
                }
            }
        }

        createRow(action) {
            const row = document.createElement("div");
            row.className = `pp-row ${action.status || ''}`;
            const { iconClass, colorClass } = this.getIconAndColor(action);
            const timeStr = action.timestamp ? new Date(action.timestamp).toLocaleTimeString([], {
                hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit"
            }) : '';

            row.innerHTML = `
                <div class="pp-cell" style="padding:0;"><div class="pp-color-strip ${colorClass}"></div></div>
                <div class="pp-cell pp-icon"><i class="fas ${iconClass}"></i></div>
                <div class="pp-cell name-cell">${action.name}</div>
                <div class="pp-cell time-cell">${timeStr}</div>
            `;
            row.onclick = () => this.jumpToId(action.id);
            return row;
        }

        createHistoryItemRow(action) {
            const row = document.createElement("div");
            const isCurrent = action.status === 'current-state';
            const isFuture = action.status === 'future';
            row.className = `history-item ${isCurrent ? 'current-state' : ''} ${isFuture ? 'future-state' : ''}`;
            const { iconClass } = this.getIconAndColor(action);
            const timeStr = action.timestamp ? new Date(action.timestamp).toLocaleTimeString([], {
                hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit"
            }) : '';

            row.innerHTML = `
                <div class="history-icon"><i class="fas ${iconClass}"></i></div>
                <div style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${action.name}</div>
                <div style="font-size:10px; opacity:0.6; margin-left:6px;">${timeStr}</div>
            `;
            row.onclick = () => this.jumpToId(action.id);
            return row;
        }

        jumpToId(targetId) {
            let indexInUndo = this.undoStack.findIndex(a => a.id === targetId);
            if (indexInUndo !== -1) {
                if (indexInUndo === this.undoStack.length - 1) return;
                const steps = this.undoStack.length - 1 - indexInUndo;
                for (let i = 0; i < steps; i++) this.undo();
                return;
            }

            let indexInRedo = this.redoStack.findIndex(a => a.id === targetId);
            if (indexInRedo !== -1) {
                let limit = 50;
                while (limit-- > 0 && this.redoStack.length > 0) {
                    const nextAction = this.redoStack[this.redoStack.length - 1];
                    this.redo();
                    if (nextAction && nextAction.id === targetId) break;
                }
            }
        }
    }

    // Global recordHistoryAction helper for engine interoperability
    window.recordHistoryAction = function (typeOrName, objectNameOrDetail, undoAction = null, redoAction = null) {
        if (window.historyManager) {
            window.historyManager.recordCustomAction(typeOrName, objectNameOrDetail, undoAction, redoAction);
        }
    };

    window.SMHistory.HistoryManager = HistoryManager;
    window.HistoryManager = HistoryManager;
})();