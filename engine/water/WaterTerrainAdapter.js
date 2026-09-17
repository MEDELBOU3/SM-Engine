(function () {
    class SMWaterTerrainAdapter {
        constructor(terrain = null) {
            this.meshes = [];
            this.terrainContexts = [];
            this._snapshots = new Map();
            this._dataSnapshots = new Map();
            this.setTerrain(terrain);
        }

        _collect(input, out = [], seen = new Set()) {
            if (!input) return out;
            if (Array.isArray(input)) {
                input.forEach(item => this._collect(item, out, seen));
                return out;
            }
            if (input.mesh && input.mesh !== input) this._collect(input.mesh, out, seen);
            if (input.terrain && input.terrain !== input) this._collect(input.terrain, out, seen);
            const key = input.uuid || input.id || input;
            if (seen.has(key)) return out;
            seen.add(key);
            if (input.geometry?.attributes?.position) {
                if (!input.userData?.isWater && !input.userData?.isHelper && !input.userData?.isBrushHelper) out.push(input);
                return out;
            }
            if (input.traverse) input.traverse(child => this._collect(child, out, seen));
            return out;
        }

        _collectTerrainContexts(input, out = [], seen = new Set()) {
            if (!input) return out;
            if (Array.isArray(input)) {
                input.forEach(item => this._collectTerrainContexts(item, out, seen));
                return out;
            }
            const key = input.uuid || input.id || input;
            if (seen.has(key)) return out;
            seen.add(key);
            const data = input.userData?.terrainData || input.terrainData;
            const manager = input.userData?.componentManager || input.componentManager;
            if (data?.heights && data.resolutionX && data.resolutionZ) out.push({ root: input, data, manager });
            if (input.traverse) input.traverse(child => this._collectTerrainContexts(child, out, seen));
            return out;
        }

        setTerrain(terrain) {
            const oldMeshKeys = new Set(this.meshes.map(mesh => mesh.uuid || mesh.id));
            const oldData = new Set(this.terrainContexts.map(context => context.data));
            this.meshes = this._collect(terrain, [], new Set());
            this.terrainContexts = this._collectTerrainContexts(terrain, [], new Set());

            for (const key of Array.from(this._snapshots.keys())) {
                if (!this.meshes.some(mesh => (mesh.uuid || mesh.id) === key)) this._snapshots.delete(key);
            }
            for (const data of oldData) {
                if (!this.terrainContexts.some(context => context.data === data)) this._dataSnapshots.delete(data);
            }

            for (const mesh of this.meshes) {
                mesh.updateMatrixWorld?.(true);
                this._snapshot(mesh);
            }
            for (const context of this.terrainContexts) this._rememberTerrainData(context);
            return this.meshes;
        }

        _snapshot(mesh) {
            const position = mesh?.geometry?.attributes?.position;
            if (!position) return null;
            const key = mesh.uuid || mesh.id;
            let state = this._snapshots.get(key);
            if (!state || state.count !== position.count || state.base.length !== position.array.length) {
                state = {
                    mesh,
                    count: position.count,
                    base: new Float32Array(position.array),
                    lastApplied: new Float32Array(position.array)
                };
                this._snapshots.set(key, state);
            } else {
                state.mesh = mesh;
            }
            return state;
        }

        _rememberTerrainData(context) {
            const data = context?.data;
            if (!data?.heights) return null;
            let state = this._dataSnapshots.get(data);
            if (!state || state.base.length !== data.heights.length) {
                state = {
                    context,
                    base: new Float32Array(data.heights),
                    lastApplied: new Float32Array(data.heights),
                    lastAppliedVersion: data.version
                };
                this._dataSnapshots.set(data, state);
            } else {
                state.context = context;
            }
            return state;
        }

        _captureExternalMeshEdits() {
            const eps = 1e-7;
            for (const mesh of this.meshes) {
                const state = this._snapshot(mesh);
                const arr = mesh?.geometry?.attributes?.position?.array;
                if (!state || !arr || arr.length !== state.lastApplied.length) continue;
                let changed = false;
                for (let i = 0; i < arr.length; i++) {
                    const delta = arr[i] - state.lastApplied[i];
                    if (Math.abs(delta) > eps) {
                        state.base[i] += delta;
                        changed = true;
                    }
                }
                if (changed) state.lastApplied.set(arr);
            }
        }

        _captureExternalTerrainDataEdits() {
            const eps = 1e-7;
            for (const context of this.terrainContexts) {
                const state = this._rememberTerrainData(context);
                if (!state) continue;
                const data = context.data;
                if (data.version === state.lastAppliedVersion) continue;
                for (let i = 0; i < data.heights.length; i++) {
                    const delta = data.heights[i] - state.lastApplied[i];
                    if (Math.abs(delta) > eps) state.base[i] += delta;
                }
                state.lastApplied.set(data.heights);
                state.lastAppliedVersion = data.version;
            }
        }

        captureExternalEdits() {
            this._captureExternalMeshEdits();
            this._captureExternalTerrainDataEdits();
        }

        _restoreMeshBases() {
            for (const state of this._snapshots.values()) {
                const position = state.mesh?.geometry?.attributes?.position;
                if (!position || position.array.length !== state.base.length) continue;
                position.array.set(state.base);
                position.needsUpdate = true;
                state.lastApplied.set(state.base);
            }
        }

        _restoreTerrainDataBases() {
            for (const state of this._dataSnapshots.values()) {
                const data = state.context?.data;
                if (!data?.heights || data.heights.length !== state.base.length) continue;
                data.heights.set(state.base);
                state.lastApplied.set(state.base);
            }
        }

        restoreAll() {
            this._restoreMeshBases();
            this._restoreTerrainDataBases();
            for (const mesh of this.meshes) {
                mesh.geometry?.computeVertexNormals?.();
                mesh.geometry?.computeBoundingBox?.();
                mesh.geometry?.computeBoundingSphere?.();
            }
            for (const context of this.terrainContexts) context.manager?.syncAll?.();
        }

        _smooth01(t) {
            t = THREE.MathUtils.clamp(t, 0, 1);
            return t * t * (3 - 2 * t);
        }

        _distanceToSegment(px, pz, a, b) {
            const abx = b.x - a.x, abz = b.z - a.z;
            const apx = px - a.x, apz = pz - a.z;
            const len2 = abx * abx + abz * abz;
            const t = len2 > 1e-8 ? THREE.MathUtils.clamp((apx * abx + apz * abz) / len2, 0, 1) : 0;
            return Math.hypot(px - (a.x + abx * t), pz - (a.z + abz * t));
        }

        _distanceToPolyline(x, z, points = []) {
            let min = Infinity;
            for (let i = 0; i < points.length - 1; i++) min = Math.min(min, this._distanceToSegment(x, z, points[i], points[i + 1]));
            return min;
        }

        _distanceToPolygon(x, z, points = []) {
            let min = Infinity;
            for (let i = 0; i < points.length; i++) min = Math.min(min, this._distanceToSegment(x, z, points[i], points[(i + 1) % points.length]));
            return min;
        }

        _pointInPolygon(x, z, points = []) {
            if (points.length < 3) return false;
            let inside = false;
            for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
                const a = points[i], b = points[j];
                if (((a.z > z) !== (b.z > z)) && x < (b.x - a.x) * (z - a.z) / ((b.z - a.z) || 1e-9) + a.x) inside = !inside;
            }
            return inside;
        }

        _profile(body, x, z, originalWorldY) {
            if (!body || body.type === 'ocean' || body.config?.terrainCarve === false) return null;
            const surface = Number(body.surfaceYAt?.(x, z, false));
            if (!Number.isFinite(surface)) return null;
            const bedDepth = Math.max(0.02, Number(body.config?.bedDepth ?? body.config?.volumeDepth ?? 3));
            const shoreDepth = THREE.MathUtils.clamp(Number(body.config?.shoreDepth ?? 0.08), 0.01, bedDepth);
            const shore = Math.max(0.05, Number(body.config?.shoreWidth ?? 1.5));

            if (body.type === 'river') {
                const distance = this._distanceToPolyline(x, z, body.points);
                const halfWidth = Math.max(0.125, Number(body.config?.width || 4) * 0.5);
                if (distance <= halfWidth) {
                    const center = this._smooth01(1 - distance / halfWidth);
                    const depth = THREE.MathUtils.lerp(shoreDepth, bedDepth, center);
                    return surface - depth;
                }
                if (distance <= halfWidth + shore) {
                    const bank = this._smooth01(1 - (distance - halfWidth) / shore);
                    const edgeTarget = surface + Math.max(0.015, shoreDepth * 0.25);
                    return THREE.MathUtils.lerp(originalWorldY, edgeTarget, bank);
                }
                return null;
            }

            if (body.type === 'lake' || body.type === 'pool') {
                const inside = this._pointInPolygon(x, z, body.points);
                const edge = this._distanceToPolygon(x, z, body.points);
                if (inside) {
                    const deep = this._smooth01(edge / shore);
                    const depth = THREE.MathUtils.lerp(shoreDepth, bedDepth, deep);
                    return surface - depth;
                }
                if (edge <= shore) {
                    const bank = this._smooth01(1 - edge / shore);
                    const edgeTarget = surface + Math.max(0.015, shoreDepth * 0.25);
                    return THREE.MathUtils.lerp(originalWorldY, edgeTarget, bank);
                }
            }
            return null;
        }

        applyBodies(bodies = []) {
            this.captureExternalEdits();
            this._restoreMeshBases();
            this._restoreTerrainDataBases();
            const list = Array.from(bodies || []).filter(Boolean);
            const changedMeshes = new Set();

            for (const state of this._dataSnapshots.values()) {
                const context = state.context;
                const data = context?.data;
                if (!data?.heights) continue;
                const root = context.root;
                root?.updateMatrixWorld?.(true);
                const matrixWorld = root?.matrixWorld || new THREE.Matrix4();
                const inverse = new THREE.Matrix4().copy(matrixWorld).invert();
                const world = new THREE.Vector3();
                const local = new THREE.Vector3();
                const scale = Math.max(0.0001, Number(data.heightScale) || 1);
                let changed = false;

                for (let gz = 0; gz < data.resolutionZ; gz++) {
                    for (let gx = 0; gx < data.resolutionX; gx++) {
                        const index = data.index(gx, gz);
                        const original = Number(state.base[index]) || 0;
                        world.set(data.localX(gx), original * scale, data.localZ(gz)).applyMatrix4(matrixWorld);
                        let nextWorldY = world.y;
                        for (const body of list) {
                            const target = this._profile(body, world.x, world.z, world.y);
                            if (target == null) continue;
                            nextWorldY = Math.min(nextWorldY, target);
                        }
                        if (nextWorldY < world.y - 1e-5) {
                            local.copy(world).setY(nextWorldY).applyMatrix4(inverse);
                            data.heights[index] = local.y / scale;
                            changed = true;
                        }
                    }
                }

                if (changed) {
                    data.version = (Number(data.version) || 0) + 1;
                    state.lastAppliedVersion = data.version;
                    state.lastApplied.set(data.heights);
                    context.manager?.refreshAfterExternalDeformation?.() || context.manager?.syncAll?.();
                } else {
                    state.lastApplied.set(data.heights);
                }
            }

            for (const mesh of this.meshes) {
                if (mesh.userData?.isTerrainComponent && mesh.userData?.terrainComponent) continue;
                const state = this._snapshot(mesh);
                const position = mesh.geometry?.attributes?.position;
                if (!state || !position) continue;
                mesh.updateMatrixWorld?.(true);
                const inverse = new THREE.Matrix4().copy(mesh.matrixWorld).invert();
                const world = new THREE.Vector3();
                const local = new THREE.Vector3();
                let changed = false;

                for (let i = 0; i < position.count; i++) {
                    const ai = i * position.itemSize;
                    local.set(state.base[ai], state.base[ai + 1], state.base[ai + 2]);
                    world.copy(local).applyMatrix4(mesh.matrixWorld);
                    let nextWorldY = world.y;
                    for (const body of list) {
                        const target = this._profile(body, world.x, world.z, world.y);
                        if (target == null) continue;
                        nextWorldY = Math.min(nextWorldY, target);
                    }
                    if (nextWorldY < world.y - 1e-5) {
                        world.y = nextWorldY;
                        local.copy(world).applyMatrix4(inverse);
                        position.setXYZ(i, local.x, local.y, local.z);
                        changed = true;
                    }
                }

                position.needsUpdate = true;
                state.lastApplied.set(position.array);
                if (changed) {
                    changedMeshes.add(mesh);
                    mesh.geometry.computeVertexNormals?.();
                    mesh.geometry.computeBoundingBox?.();
                    mesh.geometry.computeBoundingSphere?.();
                    mesh.userData = mesh.userData || {};
                    mesh.userData.waterCarved = true;
                    mesh.userData.waterCarveVersion = (mesh.userData.waterCarveVersion || 0) + 1;
                } else if (!list.length) {
                    mesh.userData.waterCarved = false;
                }
            }

            for (const context of this.terrainContexts) {
                const state = this._dataSnapshots.get(context.data);
                if (state) state.lastApplied.set(context.data.heights);
            }

            return changedMeshes.size;
        }

        sampleHeightAt(x, z, maxHeight = 10000, minHeight = -10000) {
            if (!this.meshes.length) return null;
            const raycaster = new THREE.Raycaster(
                new THREE.Vector3(x, maxHeight, z),
                new THREE.Vector3(0, -1, 0),
                0,
                Math.max(0, maxHeight - minHeight)
            );
            const hits = raycaster.intersectObjects(this.meshes, true);
            return hits.length ? hits[0].point.y : null;
        }

        clear() {
            this.restoreAll();
            this.meshes = [];
            this.terrainContexts = [];
            this._snapshots.clear();
            this._dataSnapshots.clear();
        }
    }

    window.SMWaterTerrainAdapter = SMWaterTerrainAdapter;
})();
