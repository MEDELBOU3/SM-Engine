/*
 * Advanced mesh sculpt workspace. It is intentionally namespaced as
 * SMAdvancedMeshSculptWorkspace and does not call TerrainSculptingSystem,
 * TerrainState, or any terrain brush APIs.
 */
(function () {
    'use strict';

    const BRUSHES = new Set([
        'draw', 'clay', 'inflate', 'smooth', 'flatten', 'scrape', 'pinch',
        'grab', 'snake-hook', 'crease', 'expand', 'mask', 'mask-smooth'
    ]);

    class SMAdvancedMeshSculptWorkspace {
        constructor() {
            this.active = false;
            this.mesh = null;
            this.sourceGeometry = null;
            this.brush = 'draw';
            this.radius = 0.42;
            this.strength = 0.38;
            this.falloff = 0.48;
            this.falloffProfile = 'smooth';
            this.symmetry = true;
            this.symmetryAxis = 'x';
            this.isolate = false;
            this.autoSmooth = 0.08;
            this.brushEngine = new window.SMAdvancedSculptBrushEngine();
            this.history = new window.SMAdvancedSculptHistory(18);
            this.mask = null;
            this.raycaster = new THREE.Raycaster();
            this.pointer = new THREE.Vector2();
            this.cursor = null;
            this.dragging = false;
            this.strokeBefore = null;
            this.lastHitPoint = null;
            this.lastLocalPoint = null;
            this.navigationDrag = null;
            this._savedViewport = null;
            this._hiddenObjects = [];
            this._bound = false;
            this._bind();
        }

        _canvas() { return window.renderer?.domElement || null; }
        _controls() { return window.cameraSystem?.controls || window.orbitControls || window.controls || null; }

        _bind() {
            if (this._bound) return;
            const canvas = this._canvas();
            if (!canvas) {
                window.addEventListener('sm:renderer-ready', () => this._bind(), { once: true });
                return;
            }
            this._bound = true;
            canvas.addEventListener('pointerdown', event => this._pointerDown(event), true);
            canvas.addEventListener('pointermove', event => this._pointerMove(event), true);
            canvas.addEventListener('wheel', event => this._wheel(event), { passive: false, capture: true });
            window.addEventListener('pointerup', event => this._pointerUp(event), true);
            window.addEventListener('pointercancel', event => this._pointerUp(event), true);
            window.addEventListener('keydown', event => this._keyDown(event), true);
            window.addEventListener('sm:workspace-changed', () => {
                if (this.active && String(window.workspaceManager?.currentMode || '').toUpperCase() === 'TERRAIN') this.exit({ keepPanel: true });
            });
        }

        open() {
            if (String(window.workspaceManager?.currentMode || '').toUpperCase() === 'TERRAIN') {
                window.workspaceManager?.setMode?.('FILM');
            }
            window.SMAdvancedMeshSculptPanel?.open?.();
            return true;
        }

        createSculptSphere(detail = 5) {
            const geometry = new THREE.IcosahedronGeometry(1, THREE.MathUtils.clamp(Math.floor(detail), 2, 6));
            geometry.computeVertexNormals();
            const material = new THREE.MeshStandardMaterial({ color: 0x8f9aa7, roughness: 0.68, metalness: 0.03 });
            const mesh = new THREE.Mesh(geometry, material);
            mesh.name = 'Sculpt Sphere';
            mesh.userData.smMeshSculptObject = true;
            window.scene?.add(mesh);
            window.selectedObject = mesh;
            window.selectObject?.(mesh);
            this.activate(mesh);
            return mesh;
        }

        activate(candidate = window.selectedObject) {
            const mesh = this._resolveMesh(candidate);
            if (!mesh?.geometry?.getAttribute?.('position')) {
                this._setStatus('Select a mesh or create a sculpt sphere first.');
                return false;
            }
            if (this.active) this.exit({ keepPanel: true });
            if (String(window.workspaceManager?.currentMode || '').toUpperCase() === 'TERRAIN') {
                this._setStatus('Mesh sculpt and terrain sculpt are separate. Leave Terrain mode first.');
                return false;
            }

            this.mesh = mesh;
            this._prepareMesh(mesh);
            this._createCursor();
            this.active = true;
            this._captureViewport();
            this._setIsolation(this.isolate);
            document.body.classList.add('sm-mesh-sculpt-active');
            window.__smAdvancedMeshSculptMode = true;
            this._emitChange();
            window.SMAdvancedMeshSculptPanel?.refresh?.();
            return true;
        }

        exit({ keepPanel = false } = {}) {
            if (!this.active) return;
            this._finishStroke();
            this._setIsolation(false);
            this._restoreViewport();
            this.cursor && (this.cursor.visible = false);
            this.active = false;
            window.__smAdvancedMeshSculptMode = false;
            document.body.classList.remove('sm-mesh-sculpt-active');
            this.mesh = null;
            this.sourceGeometry = null;
            this.mask = null;
            this.lastHitPoint = this.lastLocalPoint = null;
            this._emitChange();
            if (!keepPanel) window.SMAdvancedMeshSculptPanel?.close?.();
            else window.SMAdvancedMeshSculptPanel?.refresh?.();
        }

        _resolveMesh(candidate) {
            if (candidate?.isMesh && !candidate.userData?.isTerrain) return candidate;
            let mesh = null;
            candidate?.traverse?.(child => {
                if (!mesh && child.isMesh && !child.userData?.isSystemObject && !child.userData?.isTerrain) mesh = child;
            });
            return mesh;
        }

        _prepareMesh(mesh) {
            if (!mesh.userData.smMeshSculptSourceGeometry) mesh.userData.smMeshSculptSourceGeometry = mesh.geometry.clone();
            this.sourceGeometry = mesh.userData.smMeshSculptSourceGeometry;
            const previous = mesh.geometry;
            const working = previous.clone();
            working.deleteAttribute('normal');
            working.computeVertexNormals();
            working.computeBoundingBox();
            working.computeBoundingSphere();
            mesh.geometry = working;
            if (previous !== this.sourceGeometry) previous.dispose?.();
            this.mask = this.brushEngine.prepare(working);
            this.history.clear();
        }

        restoreHistoryState(state) {
            if (!this.mesh || !state?.geometry) return;
            const previous = this.mesh.geometry;
            this.mesh.geometry = state.geometry.clone();
            previous?.dispose?.();
            this.mask = this.brushEngine.prepare(this.mesh.geometry, state.mask);
            this._refreshGeometry();
            window.SMAdvancedMeshSculptPanel?.refresh?.();
        }

        _captureViewport() {
            const activePanel = window.SMViewportSystem?.getActivePanel?.();
            if (window.cameraSystem?.axisViewLocked || window.cameraAxisLocked || activePanel?.axisViewLocked) {
                if (window.exitAxisView) window.exitAxisView();
                else window.cameraSystem?.unlockAxisView?.({ switchToPerspective: true, preserveView: true });
            }

            const controls = this._controls();
            const transform = window.transformControls;
            const grids = this._gridRoots().map(grid => ({ grid, visible: grid.visible }));
            this._savedViewport = {
                controls: controls && {
                    enabled: controls.enabled, enableRotate: controls.enableRotate, enablePan: controls.enablePan,
                    enableZoom: controls.enableZoom, enableDamping: controls.enableDamping,
                    mouseButtons: { ...(controls.mouseButtons || {}) }
                },
                transform: transform && { enabled: transform.enabled, visible: transform.visible },
                grids
            };
            grids.forEach(({ grid }) => this._setTreeVisible(grid, false));
            if (controls) {
                controls.enabled = true;
                controls.enableRotate = true;
                controls.enablePan = true;
                controls.enableZoom = true;
                controls.mouseButtons = { ...(controls.mouseButtons || {}), LEFT: THREE.MOUSE.NONE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE };
                controls.update?.();
            }
            if (transform) { transform.enabled = false; transform.visible = false; }
            window.dispatchEvent(new Event('sm:layout-resized'));
        }

        _restoreViewport() {
            const saved = this._savedViewport;
            const controls = this._controls();
            if (controls && saved?.controls) {
                Object.assign(controls, saved.controls);
                controls.mouseButtons = { ...saved.controls.mouseButtons };
                controls.update?.();
            }
            if (window.transformControls && saved?.transform) {
                window.transformControls.enabled = saved.transform.enabled;
                window.transformControls.visible = saved.transform.visible;
            }
            saved?.grids?.forEach(({ grid, visible }) => this._setTreeVisible(grid, visible));
            this._savedViewport = null;
            window.dispatchEvent(new Event('sm:layout-resized'));
        }

        _gridRoots() {
            const scene = window.scene;
            return [...new Set([
                scene?.getObjectByName?.('advancedGrid'), scene?.getObjectByName?.('blenderGrid'),
                scene?.getObjectByName?.('infiniteGrid'), window.grid, window.infiniteGrid
            ].filter(Boolean))];
        }

        _setTreeVisible(root, visible) {
            root.visible = visible;
            root.traverse?.(child => { child.visible = visible; });
        }

        setIsolation(enabled) {
            this.isolate = !!enabled;
            if (this.active) this._setIsolation(this.isolate);
            window.SMAdvancedMeshSculptPanel?.refresh?.();
        }

        _setIsolation(enabled) {
            if (!enabled) {
                this._hiddenObjects.forEach(({ object, visible }) => { if (object) object.visible = visible; });
                this._hiddenObjects = [];
                return;
            }
            this._hiddenObjects = [];
            window.scene?.traverse?.(object => {
                if (!object.visible || object === this.mesh || object === this.cursor || object.isCamera || object.isLight) return;
                if (object.userData?.isSystemObject || object.userData?.isTerrain || object.getObjectByProperty?.('uuid', this.mesh.uuid)) return;
                this._hiddenObjects.push({ object, visible: object.visible });
                object.visible = false;
            });
        }

        _eventHit(event) {
            if (!this.mesh) return null;
            const canvas = this._canvas();
            const rect = canvas?.getBoundingClientRect();
            if (!rect || event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) return null;
            this.pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
            this.raycaster.setFromCamera(this.pointer, window.cameraSystem?.activeCamera || window.camera);
            return this.raycaster.intersectObject(this.mesh, false)[0] || null;
        }

        _pointerDown(event) {
            if (!this.active || event.target !== this._canvas()) return;
            if (event.button === 0 && event.altKey && this._beginNavigation(event)) return;
            if (event.button !== 0) return;
            const hit = this._eventHit(event);
            if (!hit) return;
            event.preventDefault(); event.stopImmediatePropagation();
            this.dragging = true;
            this.strokeBefore = this.history.capture(this.mesh, this.mask, this.brush);
            this.lastHitPoint = hit.point.clone();
            this._applyHit(hit, event, new THREE.Vector3());
            this._canvas()?.setPointerCapture?.(event.pointerId);
        }

        _pointerMove(event) {
            if (!this.active) return;
            if (this.navigationDrag) {
                if (this.cursor) this.cursor.visible = false;
                return;
            }
            const hit = this._eventHit(event);
            if (!hit) { if (this.cursor) this.cursor.visible = false; return; }
            this._updateCursor(hit, event);
            if (!this.dragging) return;
            event.preventDefault(); event.stopImmediatePropagation();
            const previous = this.lastHitPoint || hit.point;
            const distance = previous.distanceTo(hit.point);
            const spacing = Math.max(this.radius * 0.14, 0.006);
            const steps = Math.max(1, Math.ceil(distance / spacing));
            for (let step = 1; step <= steps; step += 1) {
                const point = previous.clone().lerp(hit.point, step / steps);
                this._applyPoint(point, hit, event, point.clone().sub(previous));
            }
            this.lastHitPoint.copy(hit.point);
        }

        _pointerUp(event) {
            if (this._finishNavigation(event)) return;
            if (!this.dragging) return;
            event.stopImmediatePropagation();
            this._finishStroke();
        }

        _beginNavigation(event) {
            const controls = this._controls();
            if (!controls) return false;
            this.navigationDrag = {
                pointerId: event.pointerId,
                controls,
                leftButton: controls.mouseButtons?.LEFT
            };
            controls.mouseButtons = { ...(controls.mouseButtons || {}), LEFT: THREE.MOUSE.ROTATE };
            return true;
        }

        _finishNavigation(event) {
            const navigation = this.navigationDrag;
            if (!navigation || (event.pointerId !== undefined && event.pointerId !== navigation.pointerId)) return false;
            navigation.controls.mouseButtons = {
                ...(navigation.controls.mouseButtons || {}),
                LEFT: navigation.leftButton
            };
            this.navigationDrag = null;
            return true;
        }

        _wheel(event) {
            if (!this.active || !event.shiftKey) return;
            event.preventDefault(); event.stopImmediatePropagation();
            this.setRadius(this.radius * (event.deltaY > 0 ? 0.9 : 1.1));
        }

        _keyDown(event) {
            if (!this.active || event.target?.matches?.('input, textarea, select') || event.target?.isContentEditable) return;
            const key = event.key.toLowerCase();
            if ((event.ctrlKey || event.metaKey) && key === 'z') { event.preventDefault(); event.shiftKey ? this.redo() : this.undo(); }
            else if ((event.ctrlKey || event.metaKey) && key === 'y') { event.preventDefault(); this.redo(); }
            else if (event.key === '[') { event.preventDefault(); this.setRadius(this.radius * 0.9); }
            else if (event.key === ']') { event.preventDefault(); this.setRadius(this.radius * 1.1); }
            else if (event.key === 'Escape') this.exit({ keepPanel: true });
        }

        _applyHit(hit, event, delta) {
            this._updateCursor(hit, event);
            this._applyPoint(hit.point, hit, event, delta);
        }

        _applyPoint(worldPoint, hit, event, worldDelta) {
            if (!this.mesh) return;
            this.mesh.updateMatrixWorld(true);
            const inverse = this.mesh.matrixWorld.clone().invert();
            const localPoint = this.mesh.worldToLocal(worldPoint.clone());
            const localNormal = (hit.normal || hit.face?.normal || new THREE.Vector3(0, 1, 0)).clone()
                .transformDirection(hit.normal ? inverse : new THREE.Matrix4())
                .normalize();
            const scale = this.mesh.getWorldScale(new THREE.Vector3());
            const localRadius = this.radius / Math.max(scale.x, scale.y, scale.z, 1e-5);
            const localDelta = worldDelta?.clone?.().transformDirection(inverse) || new THREE.Vector3();
            const options = {
                center: localPoint, normal: localNormal, radius: localRadius, strength: this.strength,
                falloff: this.falloff, profile: this.falloffProfile, brush: this.brush,
                invert: event.ctrlKey || event.metaKey, smooth: event.shiftKey, delta: localDelta
            };
            this.brushEngine.apply(options);
            if (this.symmetry) {
                const center = this.mesh.geometry.boundingBox?.getCenter(new THREE.Vector3()) || new THREE.Vector3();
                const mirrored = localPoint.clone();
                mirrored[this.symmetryAxis] = center[this.symmetryAxis] * 2 - mirrored[this.symmetryAxis];
                if (mirrored.distanceToSquared(localPoint) > 1e-9) {
                    const mirroredNormal = localNormal.clone();
                    mirroredNormal[this.symmetryAxis] *= -1;
                    this.brushEngine.apply({ ...options, center: mirrored, normal: mirroredNormal, delta: localDelta.clone().multiplyScalar(this.symmetryAxis === 'x' ? -1 : 1) });
                }
            }
        }

        _updateCursor(hit, event) {
            if (!this.cursor || !this.mesh) return;
            const normal = (hit.normal || hit.face?.normal || new THREE.Vector3(0, 1, 0)).clone();
            if (!hit.normal) normal.transformDirection(this.mesh.matrixWorld);
            this.cursor.visible = true;
            this.cursor.position.copy(hit.point);
            this.cursor.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal.normalize());
            this.cursor.scale.setScalar(this.radius);
            this.cursor.material.color.setHex(event?.ctrlKey || event?.metaKey ? 0xff7c78 : this.brush === 'mask' ? 0xf5bd5a : 0x65d8ff);
        }

        _createCursor() {
            if (this.cursor) return;
            const points = new THREE.EllipseCurve(0, 0, 1, 1, 0, Math.PI * 2, false, 0).getPoints(72)
                .map(point => new THREE.Vector3(point.x, point.y, 0));
            this.cursor = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: 0x65d8ff, transparent: true, opacity: 0.94, depthTest: false }));
            this.cursor.name = 'SMAdvancedMeshSculptCursor';
            this.cursor.renderOrder = 5000;
            this.cursor.userData = { isSystemObject: true, ignoreInHierarchy: true, selectable: false };
            window.scene?.add(this.cursor);
        }

        _finishStroke() {
            if (!this.dragging || !this.mesh) return;
            this.dragging = false;
            this.lastHitPoint = null;
            this._refreshGeometry();
            const after = this.history.capture(this.mesh, this.mask, this.brush);
            this.history.commit(this.strokeBefore, after, this.brush);
            this.strokeBefore = null;
            window.SMAdvancedMeshSculptPanel?.refresh?.();
        }

        _refreshGeometry() {
            if (!this.mesh?.geometry) return;
            const geometry = this.mesh.geometry;
            geometry.getAttribute('position').needsUpdate = true;
            geometry.computeVertexNormals();
            geometry.computeBoundingBox();
            geometry.computeBoundingSphere();
            this.mask = this.brushEngine.prepare(geometry, this.mask);
            const vertices = geometry.getAttribute('position').count;
            this.history.limit = vertices > 250000 ? 6 : vertices > 100000 ? 10 : 18;
        }

        undo() { if (this.history.undo(this)) this._emitChange(); }
        redo() { if (this.history.redo(this)) this._emitChange(); }
        clearMask() { this.mask?.fill(0); window.SMAdvancedMeshSculptPanel?.refresh?.(); }
        setBrush(brush) { if (BRUSHES.has(brush)) this.brush = brush; window.SMAdvancedMeshSculptPanel?.refresh?.(); }
        setRadius(value) { this.radius = THREE.MathUtils.clamp(Number(value) || 0.42, 0.01, 50); window.SMAdvancedMeshSculptPanel?.refresh?.(); }
        setStrength(value) { this.strength = THREE.MathUtils.clamp(Number(value) || 0.38, 0.001, 3); window.SMAdvancedMeshSculptPanel?.refresh?.(); }
        setFalloff(value) { this.falloff = THREE.MathUtils.clamp(Number(value) || 0.48, 0, 1); window.SMAdvancedMeshSculptPanel?.refresh?.(); }
        setSymmetry(enabled, axis = this.symmetryAxis) { this.symmetry = !!enabled; this.symmetryAxis = ['x', 'y', 'z'].includes(axis) ? axis : 'x'; window.SMAdvancedMeshSculptPanel?.refresh?.(); }

        prepareResolution(candidate = window.selectedObject, levels = 1) {
            const mesh = this._resolveMesh(candidate);
            const topology = window.SMAdvancedSculptTopology;
            const levelCount = Math.max(1, Math.floor(Number(levels) || 1));
            if (!mesh?.geometry?.getAttribute?.('position') || !topology) {
                this._setStatus('Select an ordinary mesh before increasing sculpt resolution.');
                return null;
            }
            if (!topology.canSubdivide(mesh.geometry, levelCount)) {
                const requested = topology.getSubdividedVertexCount(mesh.geometry, levelCount);
                this._setStatus(`Refinement would create ${requested.toLocaleString()} vertices. Add fewer levels first.`);
                return null;
            }

            const isActiveMesh = this.active && this.mesh === mesh;
            const beforeState = isActiveMesh
                ? this.history.capture(mesh, this.mask, 'Increase sculpt resolution')
                : null;
            const beforeVertices = topology.getVertexCount(mesh.geometry);

            try {
                const next = topology.subdivideGeometry(mesh.geometry, { levels: levelCount });
                const previous = mesh.geometry;
                mesh.geometry = next;
                previous.dispose?.();
                mesh.userData.smMeshSculptObject = true;
                mesh.userData.smMeshSculptSubdivisionLevels =
                    (Number(mesh.userData.smMeshSculptSubdivisionLevels) || 0) + levelCount;

                if (isActiveMesh) {
                    this.mask = null;
                    this._refreshGeometry();
                    this.history.commit(
                        beforeState,
                        this.history.capture(mesh, this.mask, 'Increase sculpt resolution'),
                        'Increase sculpt resolution'
                    );
                }

                const result = {
                    mesh,
                    levels: levelCount,
                    beforeVertices,
                    afterVertices: topology.getVertexCount(next)
                };
                window.selectedObject = mesh;
                window.selectObject?.(mesh);
                this._setStatus(`Sculpt resolution increased — ${result.afterVertices.toLocaleString()} vertices.`);
                window.dispatchEvent(new CustomEvent('sm:mesh-sculpt-resolution-changed', { detail: result }));
                this._emitChange();
                window.SMAdvancedMeshSculptPanel?.refresh?.();
                return result;
            } catch (error) {
                console.warn('[Mesh Sculpt]', error);
                this._setStatus(error.message || 'Could not increase sculpt resolution.');
                return null;
            }
        }

        refine(levels = 1) {
            return this._runTopology('Refine', geometry => window.SMAdvancedSculptTopology.subdivideGeometry(geometry, { levels }));
        }

        remesh() {
            return this._runTopology('Uniform remesh', geometry => window.SMAdvancedSculptTopology.uniformRemeshGeometry(geometry, { subdivisions: 1, relaxIterations: 2 }));
        }

        relax(iterations = 2) {
            if (!this.mesh) return false;
            const before = this.history.capture(this.mesh, this.mask, 'Relax');
            window.SMAdvancedSculptTopology.relaxGeometry(this.mesh.geometry, iterations, 0.22);
            this._refreshGeometry();
            this.history.commit(before, this.history.capture(this.mesh, this.mask, 'Relax'), 'Relax');
            this._emitChange();
            return true;
        }

        _runTopology(label, factory) {
            if (!this.mesh) return false;
            try {
                const before = this.history.capture(this.mesh, this.mask, label);
                const next = factory(this.mesh.geometry);
                const previous = this.mesh.geometry;
                this.mesh.geometry = next;
                previous.dispose?.();
                this.mask = null;
                this._refreshGeometry();
                this.history.commit(before, this.history.capture(this.mesh, this.mask, label), label);
                this._setStatus(`${label} complete — ${this.getStatus().vertices.toLocaleString()} vertices.`);
                this._emitChange();
                return true;
            } catch (error) {
                console.warn('[Mesh Sculpt]', error);
                this._setStatus(error.message || 'Topology operation could not finish.');
                return false;
            }
        }

        extractMasked(threshold = 0.55) {
            if (!this.mesh || !this.mask) return null;
            const geometry = this.mesh.geometry;
            const position = geometry.getAttribute('position');
            const index = geometry.index?.array;
            const faces = [];
            const get = offset => index ? index[offset] : offset;
            const triangleCount = Math.floor((index?.length || position.count) / 3);
            for (let triangle = 0; triangle < triangleCount; triangle += 1) {
                const offset = triangle * 3;
                const vertices = [get(offset), get(offset + 1), get(offset + 2)];
                const amount = vertices.reduce((sum, vertex) => sum + this.mask[vertex], 0) / 3;
                if (amount >= threshold) faces.push(vertices);
            }
            if (!faces.length) { this._setStatus('Mask an area first, then extract it.'); return null; }
            const output = new Float32Array(faces.length * 9);
            faces.forEach((face, faceIndex) => face.forEach((vertex, slot) => {
                output.set([position.getX(vertex), position.getY(vertex), position.getZ(vertex)], faceIndex * 9 + slot * 3);
            }));
            const extractedGeometry = new THREE.BufferGeometry();
            extractedGeometry.setAttribute('position', new THREE.BufferAttribute(output, 3));
            extractedGeometry.computeVertexNormals();
            const extracted = new THREE.Mesh(extractedGeometry, this.mesh.material?.clone?.() || new THREE.MeshStandardMaterial({ color: 0x8f9aa7 }));
            extracted.name = `${this.mesh.name || 'Mesh'} Mask Extract`;
            extracted.position.copy(this.mesh.position); extracted.quaternion.copy(this.mesh.quaternion); extracted.scale.copy(this.mesh.scale);
            this.mesh.parent?.add(extracted);
            window.selectedObject = extracted;
            window.selectObject?.(extracted);
            this._setStatus(`Extracted ${faces.length.toLocaleString()} faces.`);
            return extracted;
        }

        revertToSource() {
            if (!this.mesh || !this.sourceGeometry) return false;
            const before = this.history.capture(this.mesh, this.mask, 'Revert');
            const previous = this.mesh.geometry;
            this.mesh.geometry = this.sourceGeometry.clone();
            previous.dispose?.();
            this.mask = null;
            this._refreshGeometry();
            this.history.commit(before, this.history.capture(this.mesh, this.mask, 'Revert'), 'Revert');
            this._emitChange();
            return true;
        }

        getStatus() {
            const geometry = this.mesh?.geometry;
            const history = this.history.status;
            return {
                active: this.active,
                mesh: this.mesh?.name || 'No mesh selected',
                brush: this.brush,
                radius: this.radius,
                strength: this.strength,
                falloff: this.falloff,
                falloffProfile: this.falloffProfile,
                symmetry: this.symmetry,
                symmetryAxis: this.symmetryAxis,
                isolate: this.isolate,
                vertices: geometry?.getAttribute?.('position')?.count || 0,
                triangles: window.SMAdvancedSculptTopology?.getTriangleCount?.(geometry) || 0,
                history
            };
        }

        _setStatus(message) { window.SMAdvancedMeshSculptPanel?.setStatus?.(message); }
        _emitChange() { window.dispatchEvent(new CustomEvent('sm:mesh-sculpt-changed', { detail: { active: this.active, mesh: this.mesh } })); }
    }

    function install() {
        if (window.SMAdvancedMeshSculptWorkspace) return;
        const workspace = new SMAdvancedMeshSculptWorkspace();
        window.SMAdvancedMeshSculptWorkspace = workspace;
        window.requestMeshSculptingWorkspace = () => workspace.open();
        // Keep existing toolbar/sidebar entry points, but route only mesh sculpt
        // commands here. Terrain explicitly uses requestTerrainSculptingWorkspace.
        window.requestGlobalSculptingWorkspace = () => workspace.open();
        window.toggleSculptingPanelSafe = forceVisible => {
            if (forceVisible === false) workspace.exit();
            else workspace.open();
        };
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
    else install();
}());
