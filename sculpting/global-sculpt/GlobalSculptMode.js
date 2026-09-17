/*
 * SM Engine Global Sculpt Mode
 * A viewport-scoped sculpt workflow for any editable mesh. It deliberately
 * owns only left mouse input: right drag orbits, middle drag pans and the
 * wheel zooms just like Blender's sculpt workspace.
 */
(function () {
    'use strict';

    class GlobalSculptMode {
        constructor() {
            this.active = false;
            this.mesh = null;
            this.brush = 'draw';
            this.radius = 0.5;
            this.strength = 0.35;
            this.falloff = 0.45;
            this.symmetry = false;
            this.symmetryAxis = 'x';
            this.isolate = false;
            this.mask = null;
            this.positions = null;
            this.normals = null;
            this.adjacency = null;
            // Render meshes duplicate vertices at UV and hard-normal seams.
            // Keep coincident copies welded while sculpting so the surface cannot split.
            this.seamGroups = null;
            this.seamGroupForVertex = null;
            this.history = [];
            this.historyIndex = -1;
            this.dragging = false;
            this.lastPoint = null;
            this.strokeBefore = null;
            this.raycaster = new THREE.Raycaster();
            this.pointer = new THREE.Vector2();
            this.cursor = null;
            this._savedViewport = null;
            this._hiddenObjects = [];
            this._bound = false;
            this._bindViewportEvents();
        }

        _canvas() { return window.renderer?.domElement || null; }

        _bindViewportEvents() {
            if (this._bound) return;
            const canvas = this._canvas();
            if (!canvas) {
                window.addEventListener('sm:renderer-ready', () => this._bindViewportEvents(), { once: true });
                return;
            }
            this._bound = true;
            canvas.addEventListener('pointerdown', (event) => this._pointerDown(event), true);
            canvas.addEventListener('pointermove', (event) => this._pointerMove(event), true);
            window.addEventListener('pointerup', (event) => this._pointerUp(event), true);
            canvas.addEventListener('wheel', (event) => this._wheel(event), { passive: false, capture: true });
            window.addEventListener('keydown', (event) => this._keyDown(event), true);
            window.addEventListener('sm:workspace-changed', () => {
                if (this.active && String(window.workspaceManager?.currentMode || '').toUpperCase() !== 'FILM') this.exit();
            });
        }

        _resolveMesh(candidate) {
            if (candidate?.isMesh || candidate?.isSkinnedMesh) return candidate;
            let mesh = null;
            candidate?.traverse?.((child) => {
                if (!mesh && (child.isMesh || child.isSkinnedMesh) && !child.userData?.isSystemObject) mesh = child;
            });
            return mesh;
        }

        open() {
            if (window.workspaceManager?.currentMode !== 'FILM') window.workspaceManager?.setMode?.('FILM');
            window.GlobalSculptPanel?.open?.();
            return true;
        }

        activate(candidate = window.selectedObject) {
            const mesh = this._resolveMesh(candidate);
            if (!mesh?.geometry?.attributes?.position) {
                window.GlobalSculptPanel?.setStatus?.('Select an editable mesh first.');
                return false;
            }
            if (this.active) this.exit({ keepPanel: true });
            this.mesh = mesh;
            this._prepareGeometry(mesh);
            this._createCursor();
            this.active = true;
            this._enterViewportSculpting();
            this._setIsolation(this.isolate);
            window.dispatchEvent(new CustomEvent('sm:global-sculpt-changed', { detail: { active: true, mesh } }));
            window.GlobalSculptPanel?.refresh?.();
            return true;
        }

        exit({ keepPanel = false } = {}) {
            if (!this.active) return;
            this._finishStroke();
            this._setIsolation(false);
            this._restoreViewport();
            this.cursor && (this.cursor.visible = false);
            this.active = false;
            this.mesh = null;
            this.positions = this.normals = this.mask = this.adjacency = null;
            this.seamGroups = this.seamGroupForVertex = null;
            this.lastPoint = null;
            window.dispatchEvent(new CustomEvent('sm:global-sculpt-changed', { detail: { active: false } }));
            if (!keepPanel) window.GlobalSculptPanel?.close?.();
            else window.GlobalSculptPanel?.refresh?.();
        }

        _prepareGeometry(mesh) {
            if (!mesh.userData.smGlobalSculptSourceGeometry) mesh.userData.smGlobalSculptSourceGeometry = mesh.geometry;
            const geometry = mesh.geometry.clone();
            geometry.deleteAttribute('normal');
            geometry.computeVertexNormals();
            geometry.computeBoundingBox();
            mesh.geometry = geometry;
            this.positions = geometry.attributes.position.array;
            this.normals = geometry.attributes.normal.array;
            this.mask = new Float32Array(geometry.attributes.position.count);
            this._buildAdjacency();
        }

        _buildAdjacency() {
            const geometry = this.mesh.geometry;
            const count = geometry.attributes.position.count;
            const position = geometry.attributes.position;
            geometry.computeBoundingBox();
            const bounds = geometry.boundingBox;
            const diagonal = bounds ? bounds.max.distanceTo(bounds.min) : 1;
            const precision = Math.max(diagonal * 1e-6, 1e-6);
            const groupsByPosition = new Map();
            const seamGroups = [];
            const seamGroupForVertex = new Int32Array(count);

            for (let vertex = 0; vertex < count; vertex += 1) {
                const key = [
                    Math.round(position.getX(vertex) / precision),
                    Math.round(position.getY(vertex) / precision),
                    Math.round(position.getZ(vertex) / precision),
                ].join(':');
                let groupIndex = groupsByPosition.get(key);
                if (groupIndex === undefined) {
                    groupIndex = seamGroups.length;
                    groupsByPosition.set(key, groupIndex);
                    seamGroups.push([]);
                }
                seamGroups[groupIndex].push(vertex);
                seamGroupForVertex[vertex] = groupIndex;
            }

            const representatives = seamGroups.map((group) => group[0]);
            const adjacency = Array.from({ length: count }, () => new Set());
            const connect = (first, second) => {
                const a = representatives[seamGroupForVertex[first]];
                const b = representatives[seamGroupForVertex[second]];
                if (a === b) return;
                adjacency[a].add(b);
                adjacency[b].add(a);
            };
            const index = geometry.index?.array;
            if (index) {
                for (let i = 0; i < index.length; i += 3) {
                    const a = index[i], b = index[i + 1], c = index[i + 2];
                    connect(a, b); connect(a, c); connect(b, c);
                }
            } else {
                for (let i = 0; i < count; i += 3) {
                    connect(i, i + 1); connect(i, i + 2); connect(i + 1, i + 2);
                }
            }
            this.seamGroups = seamGroups;
            this.seamGroupForVertex = seamGroupForVertex;
            this.adjacency = adjacency.map((neighbors) => [...neighbors]);
        }

        _createCursor() {
            if (this.cursor) return;
            const circle = new THREE.EllipseCurve(0, 0, 1, 1, 0, Math.PI * 2)
                .getPoints(64).map((point) => new THREE.Vector3(point.x, point.y, 0));
            const geometry = new THREE.BufferGeometry().setFromPoints(circle);
            this.cursor = new THREE.LineLoop(geometry, new THREE.LineBasicMaterial({
                color: 0x6edcff, transparent: true, opacity: 0.95, depthTest: false
            }));
            this.cursor.name = 'SMGlobalSculptBrushCursor';
            this.cursor.userData = { isSystemObject: true, ignoreInHierarchy: true, selectable: false };
            this.cursor.renderOrder = 5000;
            window.scene?.add(this.cursor);
        }

        _enterViewportSculpting() {
            window.__smGlobalSculptMode = true;
            document.body.classList.add('sm-global-sculpt-active');
            const controls = window.cameraSystem?.controls || window.controls;
            const transform = window.transformControls;
            this._savedViewport = {
                controls: controls && {
                    enabled: controls.enabled,
                    enableRotate: controls.enableRotate,
                    enablePan: controls.enablePan,
                    enableZoom: controls.enableZoom,
                    enableDamping: controls.enableDamping,
                    dampingFactor: controls.dampingFactor,
                    mouseButtons: { ...(controls.mouseButtons || {}) },
                },
                transform: transform && { enabled: transform.enabled, visible: transform.visible, object: transform.object || null },
                grids: this._gridRoots().map((grid) => ({ grid, visible: grid.visible })),
            };
            this._savedViewport.grids.forEach(({ grid }) => this._setTreeVisible(grid, false));
            if (controls) {
                controls.enabled = true;
                controls.enableRotate = true;
                controls.enablePan = true;
                controls.enableZoom = true;
                controls.enableDamping = true;
                controls.dampingFactor = 0.08;
                controls.mouseButtons = {
                    ...(controls.mouseButtons || {}),
                    LEFT: THREE.MOUSE.NONE,
                    MIDDLE: THREE.MOUSE.PAN,
                    RIGHT: THREE.MOUSE.ROTATE,
                };
                controls.update?.();
            }
            if (transform) { transform.enabled = false; transform.visible = false; }
            window.dispatchEvent(new Event('sm:layout-resized'));
        }

        _restoreViewport() {
            const saved = this._savedViewport;
            window.__smGlobalSculptMode = false;
            document.body.classList.remove('sm-global-sculpt-active');
            const controls = window.cameraSystem?.controls || window.controls;
            if (controls && saved?.controls) {
                Object.assign(controls, saved.controls);
                controls.mouseButtons = { ...saved.controls.mouseButtons };
                controls.update?.();
            }
            const transform = window.transformControls;
            if (transform && saved?.transform) {
                transform.enabled = saved.transform.enabled;
                transform.visible = saved.transform.visible;
                if (saved.transform.object?.parent && !transform.object) transform.attach?.(saved.transform.object);
            }
            saved?.grids?.forEach(({ grid, visible }) => this._setTreeVisible(grid, visible));
            const showFilmGrid = String(window.workspaceManager?.currentMode || '').toUpperCase() === 'FILM';
            window.workspaceManager?._ensureGridVisible?.(showFilmGrid);
            this._savedViewport = null;
            window.dispatchEvent(new Event('sm:layout-resized'));
        }

        _gridRoots() {
            const scene = window.scene;
            return [...new Set([
                scene?.getObjectByName?.('advancedGrid'), scene?.getObjectByName?.('blenderGrid'),
                scene?.getObjectByName?.('infiniteGrid'), window.grid, window.infiniteGrid,
            ].filter(Boolean))];
        }

        _setTreeVisible(root, visible) {
            if (!root) return;
            root.visible = visible;
            root.traverse?.((child) => { child.visible = visible; });
        }

        _setIsolation(enabled) {
            if (!this.active && enabled) return;
            if (!enabled) {
                this._hiddenObjects.forEach(({ object, visible }) => { if (object) object.visible = visible; });
                this._hiddenObjects = [];
                return;
            }
            this._hiddenObjects = [];
            window.scene?.traverse?.((object) => {
                if (!object.visible || object === this.mesh || object === this.cursor || object.isCamera || object.isLight) return;
                if (object.userData?.isSystemObject || object.getObjectByProperty?.('uuid', this.mesh.uuid)) return;
                this._hiddenObjects.push({ object, visible: object.visible });
                object.visible = false;
            });
        }

        setIsolation(enabled) {
            this.isolate = !!enabled;
            if (this.active) this._setIsolation(this.isolate);
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
            if (!this.active || event.button !== 0 || event.target !== this._canvas()) return;
            const hit = this._eventHit(event);
            if (!hit) return;
            event.preventDefault(); event.stopImmediatePropagation();
            this.dragging = true;
            this.strokeBefore = new Float32Array(this.positions);
            this.lastPoint = hit.point.clone();
            this._applyHit(hit, event, null);
            this._canvas()?.setPointerCapture?.(event.pointerId);
        }

        _pointerMove(event) {
            if (!this.active) return;
            const hit = this._eventHit(event);
            if (!hit) { if (this.cursor) this.cursor.visible = false; return; }
            this._updateCursor(hit);
            if (!this.dragging) return;
            event.preventDefault(); event.stopImmediatePropagation();
            const distance = hit.point.distanceTo(this.lastPoint || hit.point);
            const spacing = Math.max(this.radius * 0.12, 0.008);
            const steps = Math.max(1, Math.ceil(distance / spacing));
            for (let step = 1; step <= steps; step += 1) {
                const point = this.lastPoint.clone().lerp(hit.point, step / steps);
                this._applyPoint(point, hit, event, point.clone().sub(this.lastPoint));
            }
            this.lastPoint.copy(hit.point);
        }

        _pointerUp(event) {
            if (!this.dragging) return;
            event.stopImmediatePropagation();
            this._finishStroke();
        }

        _wheel(event) {
            if (!this.active || !event.shiftKey) return;
            event.preventDefault(); event.stopImmediatePropagation();
            this.radius = THREE.MathUtils.clamp(this.radius * (event.deltaY > 0 ? 0.9 : 1.1), 0.01, 100);
            window.GlobalSculptPanel?.refresh?.();
        }

        _keyDown(event) {
            if (!this.active || event.target?.matches?.('input, textarea, select') || event.target?.isContentEditable) return;
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); this.undo(); }
            else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); this.redo(); }
            else if (event.key === '[') { event.preventDefault(); this.radius = Math.max(0.01, this.radius * 0.9); window.GlobalSculptPanel?.refresh?.(); }
            else if (event.key === ']') { event.preventDefault(); this.radius = Math.min(100, this.radius * 1.1); window.GlobalSculptPanel?.refresh?.(); }
            else if (event.key === 'Escape') this.exit({ keepPanel: true });
        }

        _updateCursor(hit) {
            if (!this.cursor) return;
            const normal = hit.face.normal.clone().transformDirection(this.mesh.matrixWorld).normalize();
            this.cursor.visible = true;
            this.cursor.position.copy(hit.point);
            this.cursor.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
            this.cursor.scale.setScalar(this.radius);
            this.cursor.material.color.setHex(this.brush === 'mask' ? 0xf4ca64 : 0x64d8ff);
        }

        _applyHit(hit, event, delta) { this._applyPoint(hit.point, hit, event, delta); }

        _applyPoint(worldPoint, hit, event, delta) {
            const localPoint = this.mesh.worldToLocal(worldPoint.clone());
            const worldNormal = hit.face.normal.clone().transformDirection(this.mesh.matrixWorld).normalize();
            const inverse = this.mesh.matrixWorld.clone().invert();
            const localNormal = worldNormal.clone().transformDirection(inverse).normalize();
            const scale = this.mesh.getWorldScale(new THREE.Vector3());
            const localRadius = this.radius / Math.max(scale.x, scale.y, scale.z, 1e-5);
            this._sculptAt(localPoint, localNormal, localRadius, event, delta);
            if (this.symmetry) {
                const mirrorPoint = localPoint.clone();
                const mirrorNormal = localNormal.clone();
                const center = this.mesh.geometry.boundingBox?.getCenter(new THREE.Vector3()) || new THREE.Vector3();
                mirrorPoint[this.symmetryAxis] = center[this.symmetryAxis] * 2 - mirrorPoint[this.symmetryAxis];
                mirrorNormal[this.symmetryAxis] *= -1;
                this._sculptAt(mirrorPoint, mirrorNormal, localRadius, event, delta);
            }
            this.mesh.geometry.attributes.position.needsUpdate = true;
        }

        _sculptAt(center, normal, radius, event, delta) {
            const indices = this._verticesInRadius(center, radius);
            const mode = event.shiftKey ? 'smooth' : this.brush;
            const sign = event.ctrlKey || event.metaKey ? -1 : 1;
            const position = new THREE.Vector3();
            const average = new THREE.Vector3();
            if (mode === 'flatten' || mode === 'smooth') {
                indices.forEach(({ index }) => average.add(this._positionAt(index)));
                if (indices.length) average.multiplyScalar(1 / indices.length);
            }
            indices.forEach(({ index, distance }) => {
                const factor = this._falloff(distance / radius) * (1 - this.mask[index]);
                if (factor < 0.0001) return;
                position.copy(this._positionAt(index));
                const amount = factor * this.strength * sign;
                if (mode === 'mask') {
                    this.mask[index] = THREE.MathUtils.clamp(this.mask[index] + factor * 0.08 * sign, 0, 1);
                    return;
                }
                if (mode === 'smooth') {
                    const neighbors = this.adjacency[index] || [];
                    if (neighbors.length) {
                        const target = new THREE.Vector3();
                        neighbors.forEach((neighbor) => target.add(this._positionAt(neighbor)));
                        target.multiplyScalar(1 / neighbors.length);
                        position.lerp(target, Math.abs(amount) * 0.45);
                    } else position.lerp(average, Math.abs(amount) * 0.35);
                } else if (mode === 'flatten') {
                    position.addScaledVector(normal, -normal.dot(position.clone().sub(center)) * Math.abs(amount) * 0.55);
                } else if (mode === 'pinch') {
                    position.lerp(center, Math.abs(amount) * 0.22);
                } else if (mode === 'grab' && delta) {
                    const localDelta = this.mesh.worldToLocal(worldPointForDelta(this.mesh, delta)).sub(this.mesh.worldToLocal(new THREE.Vector3()));
                    position.addScaledVector(localDelta, factor * 0.8);
                } else if (mode === 'crease') {
                    position.addScaledVector(normal, amount * 0.06);
                    position.lerp(center, Math.abs(amount) * factor * 0.08);
                } else {
                    const vertexNormal = new THREE.Vector3(this.normals[index * 3], this.normals[index * 3 + 1], this.normals[index * 3 + 2]).normalize();
                    position.addScaledVector(mode === 'clay' ? normal : vertexNormal, amount * 0.085);
                }
                this._writePosition(index, position);
            });
        }

        _verticesInRadius(center, radius) {
            const values = [];
            const radiusSq = radius * radius;
            const groups = this.seamGroups || [];
            const groupCount = groups.length || this.positions.length / 3;
            for (let groupIndex = 0; groupIndex < groupCount; groupIndex += 1) {
                const index = groups.length ? groups[groupIndex][0] : groupIndex;
                const offset = index * 3;
                const dx = this.positions[offset] - center.x;
                const dy = this.positions[offset + 1] - center.y;
                const dz = this.positions[offset + 2] - center.z;
                const distanceSq = dx * dx + dy * dy + dz * dz;
                if (distanceSq <= radiusSq) values.push({ index, distance: Math.sqrt(distanceSq) });
            }
            return values;
        }

        _positionAt(index) { const i = index * 3; return new THREE.Vector3(this.positions[i], this.positions[i + 1], this.positions[i + 2]); }
        _writePosition(index, value) {
            const groupIndex = this.seamGroupForVertex?.[index];
            const vertices = Number.isInteger(groupIndex) ? this.seamGroups[groupIndex] : [index];
            vertices.forEach((vertex) => {
                const offset = vertex * 3;
                this.positions[offset] = value.x;
                this.positions[offset + 1] = value.y;
                this.positions[offset + 2] = value.z;
            });
        }
        _falloff(t) { const s = THREE.MathUtils.clamp(1 - t, 0, 1); return Math.pow(s * s * (3 - 2 * s), 1 + this.falloff * 2); }

        _finishStroke() {
            if (!this.dragging) return;
            this.dragging = false;
            this.lastPoint = null;
            this.mesh.geometry.computeVertexNormals();
            this.mesh.geometry.computeBoundingBox();
            this.normals = this.mesh.geometry.attributes.normal.array;
            const after = new Float32Array(this.positions);
            if (this.strokeBefore && !this._samePositions(this.strokeBefore, after)) {
                this.history.splice(this.historyIndex + 1);
                this.history.push({ before: this.strokeBefore, after });
                if (this.history.length > 40) this.history.shift();
                this.historyIndex = this.history.length - 1;
            }
            this.strokeBefore = null;
            window.GlobalSculptPanel?.refresh?.();
        }

        _samePositions(first, second) { for (let index = 0; index < first.length; index += 1) if (first[index] !== second[index]) return false; return true; }
        undo() { if (this.historyIndex < 0 || !this.mesh) return; this._restorePositions(this.history[this.historyIndex--].before); }
        redo() { if (this.historyIndex >= this.history.length - 1 || !this.mesh) return; this._restorePositions(this.history[++this.historyIndex].after); }
        _restorePositions(values) { this.positions.set(values); this.mesh.geometry.attributes.position.needsUpdate = true; this.mesh.geometry.computeVertexNormals(); this.mesh.geometry.computeBoundingBox(); this.normals = this.mesh.geometry.attributes.normal.array; window.GlobalSculptPanel?.refresh?.(); }
        clearMask() { this.mask?.fill(0); window.GlobalSculptPanel?.refresh?.(); }
        setBrush(brush) { this.brush = brush; window.GlobalSculptPanel?.refresh?.(); }
        setRadius(value) { this.radius = THREE.MathUtils.clamp(Number(value) || 0.5, 0.01, 100); }
        setStrength(value) { this.strength = THREE.MathUtils.clamp(Number(value) || 0.35, 0.001, 5); }
        setFalloff(value) { this.falloff = THREE.MathUtils.clamp(Number(value) || 0.45, 0, 1); }
        getStatus() { return { active: this.active, mesh: this.mesh?.name || 'No mesh selected', brush: this.brush, radius: this.radius, strength: this.strength, falloff: this.falloff, history: this.historyIndex + 1, historyMax: this.history.length }; }
    }

    // Convert an incremental world delta to a point without allocating a
    // hidden scene object. Kept outside the class to make grab's intention clear.
    function worldPointForDelta(mesh, delta) {
        return mesh.getWorldPosition(new THREE.Vector3()).add(delta);
    }

    function install() {
        if (window.GlobalSculptMode) return;
        window.GlobalSculptMode = new GlobalSculptMode();
        window.requestGlobalSculptingWorkspace = () => window.GlobalSculptMode.open();
        // The toolbar and keyboard dispatcher resolve this function at click
        // time. Override the legacy terrain toggle so they can never route a
        // global mesh sculpt command into the Terrain workspace.
        window.toggleSculptingPanelSafe = (forceVisible = null) => {
            if (forceVisible === false) {
                window.GlobalSculptMode.exit();
                return;
            }
            window.GlobalSculptMode.open();
        };
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
    else install();
}());
