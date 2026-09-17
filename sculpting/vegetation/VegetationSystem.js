// sculpting/vegetation/VegetationSystem.js

class VegetationSystem {
    constructor(scene, camera, domElement) {
        this.scene = scene;
        this.camera = camera;
        this.domElement = domElement;
        this.enabled = false;
        this.mode = 'paint'; // paint, erase, single, fill
        this.activeSpecies = 'wild_grass';
        this.workspaceMode = 'TERRAIN';

        this.brushRadius = 2.5;
        this.brushDensity = 15;
        this.normalAlignment = 0.8;
        this.scaleMin = 0.8;
        this.scaleMax = 1.3;
        this.rotationJitter = Math.PI * 2;

        this.windSpeed = 1.2;
        this.windStrength = 0.15;
        this.windTurbulence = 0.5;

        this.speciesMap = {};
        this.speciesData = {};
        this.speciesMeta = {};
        this.maxCounts = {};
        this.terrainMeshes = [];
        this.currentPathPoints = [];
        this.pathJitter = 0.5;
        this.pathSpacing = 0.8;
        this.isPainting = false;
        this._lastPaintAt = 0;
        this._previousControlsState = null;

        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.brushHelper = null;
        this.foliageRoot = null;
        this.init();
    }

    init() {
        this.setupFoliageRoot();
        this.setupBrushHelper();
        this.setupDefaultPresets();
        this.setupEventListeners();
    }

    setupFoliageRoot() {
        if (!this.scene) return;
        this.foliageRoot = this.scene.getObjectByName('SM_Vegetation') || new THREE.Group();
        this.foliageRoot.name = 'SM_Vegetation';
        this.foliageRoot.userData = {
            ...(this.foliageRoot.userData || {}),
            isVegetationRoot: true,
            workspaceOnly: 'TERRAIN',
            ignoreInTimeline: true,
            ignoreInHierarchy: false,
            selectable: true,
            expanded: true,
        };
        if (!this.foliageRoot.parent) this.scene.add(this.foliageRoot);
        this.foliageRoot.visible = this.workspaceMode === 'TERRAIN';
    }

    setupBrushHelper() {
        if (!this.scene) return;
        const geom = new THREE.RingGeometry(0.98, 1, 64);
        geom.rotateX(-Math.PI / 2);
        const mat = new THREE.MeshBasicMaterial({
            color: 0x00ffcc,
            side: THREE.DoubleSide,
            depthTest: false,
            transparent: true,
            opacity: 0.85,
        });
        this.brushHelper = new THREE.Mesh(geom, mat);
        this.brushHelper.name = 'SM_VegetationBrushHelper';
        this.brushHelper.visible = false;
        this.brushHelper.userData = {
            isSystemObject: true,
            isHelper: true,
            ignoreInHierarchy: true,
            ignoreInTimeline: true,
            selectable: false,
            workspaceOnly: 'TERRAIN',
        };
        this.scene.add(this.brushHelper);
    }

    setupDefaultPresets() {
        const presets = window.VegetationPresets || {
            createGrass() {
                const geom = new THREE.PlaneGeometry(0.4, 0.8);
                geom.translate(0, 0.4, 0);
                const mat = new THREE.MeshStandardMaterial({ color: 0x5a9e32, side: THREE.DoubleSide });
                return new THREE.Mesh(geom, mat);
            },
            createTree() {
                const geom = new THREE.CylinderGeometry(0.1, 0.15, 2, 8);
                geom.translate(0, 1, 0);
                const mat = new THREE.MeshStandardMaterial({ color: 0x2e5c1e });
                return new THREE.Mesh(geom, mat);
            },
        };
        this.registerSpecies('wild_grass', presets.createGrass(), 20000, {
            label: 'Wild Grass', builtIn: true,
        });
        this.registerSpecies('oak_tree', presets.createTree(), 1500, {
            label: 'Oak Tree', builtIn: true,
        });
    }

    registerSpecies(id, sourceMesh, maxCount = 5000, meta = {}) {
        if (!sourceMesh?.geometry || !this.foliageRoot) return false;
        this.unregisterSpecies(id, { keepMeta: true });

        const geometry = sourceMesh.geometry.clone();
        const material = Array.isArray(sourceMesh.material)
            ? sourceMesh.material.map(item => item.clone())
            : sourceMesh.material.clone();
        this.injectWindShader(material);

        const instancedMesh = new THREE.InstancedMesh(geometry, material, maxCount);
        instancedMesh.name = `SM_Vegetation_${id}`;
        instancedMesh.count = 0;
        instancedMesh.frustumCulled = false;
        instancedMesh.castShadow = true;
        instancedMesh.receiveShadow = true;
        instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        instancedMesh.userData = {
            isVegetation: true,
            vegetationSpecies: id,
            workspaceOnly: 'TERRAIN',
            ignoreInTimeline: true,
            ignoreInHierarchy: false,
            selectable: true,
            expanded: false,
            foliageAssetId: meta.sourceAssetId || null,
        };
        this.foliageRoot.add(instancedMesh);
        this.speciesMap[id] = instancedMesh;
        this.speciesData[id] = [];
        this.maxCounts[id] = maxCount;
        this.speciesMeta[id] = {
            label: meta.label || id,
            sourceAssetId: meta.sourceAssetId || null,
            sourceAssetName: meta.sourceAssetName || null,
            builtIn: meta.builtIn === true,
            maxCount,
        };
        return true;
    }

    unregisterSpecies(id, options = {}) {
        const mesh = this.speciesMap[id];
        if (mesh) {
            this.foliageRoot?.remove(mesh);
            mesh.geometry?.dispose?.();
            const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            materials.forEach(material => material?.dispose?.());
        }
        delete this.speciesMap[id];
        delete this.speciesData[id];
        delete this.maxCounts[id];
        if (!options.keepMeta) delete this.speciesMeta[id];
        if (this.activeSpecies === id) this.activeSpecies = Object.keys(this.speciesMap)[0] || null;
        window.updateHierarchy?.();
    }

    getSpeciesLibrary() {
        return Object.keys(this.speciesMap).map(id => ({
            id,
            ...(this.speciesMeta[id] || { label: id }),
            count: this.speciesData[id]?.length || 0,
        }));
    }

    _geometryUtils() {
        return THREE.BufferGeometryUtils || window.BufferGeometryUtils || null;
    }

    _prepareSourceObject(sourceObject, options = {}) {
        if (!sourceObject?.isObject3D) return null;
        sourceObject.updateMatrixWorld?.(true);
        const rootInverse = sourceObject.matrixWorld?.clone?.().invert?.() || new THREE.Matrix4();
        const geometries = [];
        const materials = [];
        let materialOffset = 0;
        const meshes = [];
        sourceObject.traverse(child => {
            if (child.isMesh && child.geometry && !child.isSkinnedMesh) meshes.push(child);
        });
        meshes.forEach(child => {
            const geometry = child.geometry.clone();
            const relativeMatrix = rootInverse.clone().multiply(child.matrixWorld);
            geometry.applyMatrix4(relativeMatrix);
            const childMaterials = Array.isArray(child.material) ? child.material : [child.material];
            const clonedMaterials = childMaterials.filter(Boolean).map(material => material.clone());
            if (!clonedMaterials.length) return;
            // Keep material groups when a source mesh has multiple slots.
            if (clonedMaterials.length === 1) {
                geometry.clearGroups();
                const count = geometry.index ? geometry.index.count : geometry.getAttribute('position')?.count || 0;
                geometry.addGroup(0, count, materialOffset);
            } else {
                geometry.groups.forEach(group => { group.materialIndex += materialOffset; });
            }
            geometries.push(geometry);
            materials.push(...clonedMaterials);
            materialOffset += clonedMaterials.length;
        });
        if (!geometries.length) return null;

        const utils = this._geometryUtils();
        let geometry = geometries[0];
        if (geometries.length > 1 && utils) {
            const merge = utils.mergeGeometries || utils.mergeBufferGeometries;
            try { geometry = merge?.(geometries, true) || geometry; } catch (error) {
                console.warn('[Vegetation] Could not merge all source meshes; using first mesh.', error);
            }
        }
        const bounds = new THREE.Box3().setFromBufferAttribute(geometry.getAttribute('position'));
        if (!bounds.isEmpty()) {
            const center = bounds.getCenter(new THREE.Vector3());
            geometry.translate(-center.x, -bounds.min.y, -center.z);
            const normalizeHeight = options.normalizeHeight !== false;
            const targetHeight = Number(options.targetHeight ?? 2.5);
            const height = bounds.max.y - bounds.min.y;
            if (normalizeHeight && height > 0.0001 && Number.isFinite(targetHeight)) {
                const scale = targetHeight / height;
                geometry.scale(scale, scale, scale);
            }
        }
        return { geometry, material: materials.length === 1 ? materials[0] : materials };
    }

    registerSpeciesFromObject(id, sourceObject, label = id, options = {}) {
        const source = this._prepareSourceObject(sourceObject, options);
        if (!source) return false;
        const registered = this.registerSpecies(id, source, options.maxCount || 5000, {
            label,
            sourceAssetId: options.sourceAssetId || null,
            sourceAssetName: options.sourceAssetName || label,
            builtIn: false,
        });
        if (registered && options.activate !== false) this.activeSpecies = id;
        return registered;
    }

    async registerAsset(asset, options = {}) {
        if (!asset || asset.type !== 'model') return false;
        const panel = window.AssetsPanel;
        const source = panel?._getAssetSourceUrl?.(asset) || asset.url || asset.data;
        const extensionMatch = [asset.name, source].map(value => String(value || '').split('?')[0].split('.').pop().toLowerCase())
            .find(value => ['glb', 'gltf', 'fbx', 'obj'].includes(value));
        const ext = extensionMatch || 'gltf';
        const loader = ext === 'fbx' ? panel?.loaders?.fbx : ext === 'obj' ? panel?.loaders?.obj : panel?.loaders?.gltf;
        if (!loader || !source) {
            console.warn('[Vegetation] Asset has no usable model source:', asset.name);
            return false;
        }
        try {
            const loaded = await new Promise((resolve, reject) => loader.load(source, resolve, undefined, reject));
            const object = loaded?.scene || loaded;
            const id = options.id || `asset_${String(asset.id || asset.name).replace(/[^a-z0-9_-]/gi, '_')}`;
            const ok = this.registerSpeciesFromObject(id, object, asset.name || id, {
                sourceAssetId: asset.id || null,
                sourceAssetName: asset.name || id,
                maxCount: options.maxCount || 5000,
                normalizeHeight: true,
                targetHeight: options.targetHeight || 2.5,
                activate: true,
            });
            if (ok) window.updateHierarchy?.();
            return ok;
        } catch (error) {
            // Built-in assets may need the AssetManager's path resolver/file
            // picker. Reuse its scene loader as a fallback, then remove the
            // temporary scene object after cloning its geometry.
            try {
                const temporaryObject = await panel?._addToScene?.(asset.id);
                if (temporaryObject?.isObject3D) {
                    const id = options.id || `asset_${String(asset.id || asset.name).replace(/[^a-z0-9_-]/gi, '_')}`;
                    const ok = this.registerSpeciesFromObject(id, temporaryObject, asset.name || id, {
                        sourceAssetId: asset.id || null,
                        sourceAssetName: asset.name || id,
                        maxCount: options.maxCount || 5000,
                        targetHeight: options.targetHeight || 2.5,
                        activate: true,
                    });
                    window.removeObjectFromScene?.(temporaryObject, true);
                    return ok;
                }
            } catch (fallbackError) {
                console.error(`[Vegetation] Asset fallback failed for "${asset.name}":`, fallbackError);
            }
            console.error(`[Vegetation] Failed to load foliage asset "${asset.name}":`, error);
            return false;
        }
    }

    injectWindShader(material) {
        const materials = Array.isArray(material) ? material : [material];
        materials.forEach(item => {
            if (!item) return;
            item.onBeforeCompile = (shader) => {
                shader.uniforms.uWindTime = { value: 0 };
                shader.uniforms.uWindSpeed = { value: this.windSpeed };
                shader.uniforms.uWindStrength = { value: this.windStrength };
                shader.uniforms.uWindTurbulence = { value: this.windTurbulence };
                window.animatedVegetationUniforms ||= [];
                window.animatedVegetationUniforms.push(shader.uniforms);
                shader.vertexShader = `
                    uniform float uWindTime;
                    uniform float uWindSpeed;
                    uniform float uWindStrength;
                    uniform float uWindTurbulence;
                ` + shader.vertexShader;
                shader.vertexShader = shader.vertexShader.replace(
                    '#include <begin_vertex>',
                    `
                    #include <begin_vertex>
                    float windHeightFactor = max(position.y, 0.0);
                    float windWave = sin(uWindTime * uWindSpeed + modelMatrix[3].x * uWindTurbulence + modelMatrix[3].z * uWindTurbulence);
                    transformed.x += windWave * uWindStrength * windHeightFactor;
                    transformed.z += windWave * uWindStrength * 0.5 * windHeightFactor;
                    `,
                );
            };
            item.needsUpdate = true;
        });
    }

    updateWindUniforms(time) {
        (window.animatedVegetationUniforms || []).forEach(uniforms => {
            uniforms.uWindTime.value = time;
            uniforms.uWindSpeed.value = this.windSpeed;
            uniforms.uWindStrength.value = this.windStrength;
            uniforms.uWindTurbulence.value = this.windTurbulence;
        });
    }

    setEnabled(value) {
        this.enabled = Boolean(value) && this.workspaceMode === 'TERRAIN';
        if (!this.enabled) {
            this.isPainting = false;
            if (this.brushHelper) this.brushHelper.visible = false;
            this.restoreControls();
        }
    }

    setMode(mode) {
        this.mode = ['paint', 'erase', 'single', 'fill'].includes(mode) ? mode : 'paint';
    }

    setActiveSpecies(id) {
        if (this.speciesMap[id]) this.activeSpecies = id;
    }

    setWorkspaceMode(mode) {
        this.workspaceMode = String(mode || '').toUpperCase() || 'FILM';
        const visible = this.workspaceMode === 'TERRAIN';
        if (this.foliageRoot) this.foliageRoot.visible = visible;
        if (this.brushHelper) this.brushHelper.visible = visible && this.enabled && this.brushHelper.visible;
        if (!visible) this.setEnabled(false);
    }

    setTerrainMeshes(meshes) {
        const roots = Array.isArray(meshes) ? meshes : [meshes];
        const result = [];
        roots.filter(Boolean).forEach(root => {
            if (root.traverse) {
                root.traverse(obj => {
                    if (obj.isMesh && !obj.userData?.isVegetation && !obj.userData?.isHelper) result.push(obj);
                });
            } else if (root.isMesh) {
                result.push(root);
            }
        });
        this.terrainMeshes = [...new Set(result)];
    }

    setupEventListeners() {
        if (!this.domElement?.addEventListener) return;
        const onPointerMove = (event) => {
            if (!this.enabled || this.workspaceMode !== 'TERRAIN' || !this.terrainMeshes.length || !this.camera) {
                if (this.brushHelper) this.brushHelper.visible = false;
                return;
            }
            const bounds = this.domElement.getBoundingClientRect();
            if (!bounds.width || !bounds.height) return;
            this.mouse.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
            this.mouse.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
            this.raycaster.setFromCamera(this.mouse, this.camera);
            const intersections = this.raycaster.intersectObjects(this.terrainMeshes, true);
            if (!intersections.length) {
                if (this.brushHelper) this.brushHelper.visible = false;
                return;
            }
            const hit = intersections[0];
            if (this.brushHelper) {
                this.brushHelper.visible = true;
                this.brushHelper.position.copy(hit.point);
                this.brushHelper.position.y += 0.05;
                this.brushHelper.scale.setScalar(this.brushRadius);
            }
            if (this.isPainting) {
                const now = performance.now();
                if (now - this._lastPaintAt >= 35) {
                    this._lastPaintAt = now;
                    if (this.mode === 'paint') this.paintStroke(hit);
                    else if (this.mode === 'erase') this.eraseStroke(hit);
                    else if (this.mode === 'fill') this.fillStroke(hit);
                    else if (this.mode === 'single') {
                        this.paintStroke({ ...hit, point: hit.point.clone() });
                        this.isPainting = false;
                        this.restoreControls();
                    }
                }
            }
        };

        this.domElement.addEventListener('pointermove', onPointerMove);
        this.domElement.addEventListener('pointerdown', (event) => {
            if (!this.enabled || event.button !== 0) return;
            event.preventDefault();
            event.stopPropagation();
            this.isPainting = true;
            this._lastPaintAt = 0;
            this.disableControls();
            onPointerMove(event);
        }, true);
        window.addEventListener('pointerup', () => {
            this.isPainting = false;
            this.restoreControls();
        });
    }

    disableControls() {
        if (this._previousControlsState) return;
        const controls = window.controls || window.orbitControls;
        this._previousControlsState = {
            controls,
            enabled: controls ? controls.enabled : undefined,
            transform: window.transformControls,
            transformEnabled: window.transformControls ? window.transformControls.enabled : undefined,
        };
        if (controls) controls.enabled = false;
        if (window.transformControls) window.transformControls.enabled = false;
    }

    restoreControls() {
        const state = this._previousControlsState;
        if (!state) return;
        if (state.controls && state.enabled !== undefined) state.controls.enabled = state.enabled;
        if (state.transform && state.transformEnabled !== undefined) state.transform.enabled = state.transformEnabled;
        this._previousControlsState = null;
    }

    worldNormal(hit) {
        const normal = hit.face?.normal?.clone() || new THREE.Vector3(0, 1, 0);
        if (hit.object?.matrixWorld) {
            normal.applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld)).normalize();
        }
        return normal;
    }

    paintStroke(hitPoint) {
        const mesh = this.speciesMap[this.activeSpecies];
        const data = this.speciesData[this.activeSpecies];
        if (!mesh || !data || data.length >= this.maxCounts[this.activeSpecies]) return;
        const center = hitPoint.point;
        for (let i = 0; i < this.brushDensity; i++) {
            const angle = Math.random() * Math.PI * 2;
            const radius = Math.sqrt(Math.random()) * this.brushRadius;
            const testPos = new THREE.Vector3(
                center.x + Math.cos(angle) * radius,
                center.y + 100,
                center.z + Math.sin(angle) * radius,
            );
            this.raycaster.set(testPos, new THREE.Vector3(0, -1, 0));
            const hits = this.raycaster.intersectObjects(this.terrainMeshes, true);
            if (hits.length && center.distanceTo(hits[0].point) <= this.brushRadius) {
                this.addInstance(this.activeSpecies, hits[0].point, this.worldNormal(hits[0]));
            }
            if (data.length >= this.maxCounts[this.activeSpecies]) break;
        }
    }

    fillStroke(hitPoint) {
        const density = this.brushDensity;
        this.brushDensity = Math.min(Math.max(density * 4, 40), 240);
        this.paintStroke(hitPoint);
        this.brushDensity = density;
    }

    eraseStroke(hitPoint) {
        const center = hitPoint.point;
        const data = this.speciesData[this.activeSpecies] || [];
        const mesh = this.speciesMap[this.activeSpecies];
        if (!mesh || !data.length) return;
        const remaining = data.filter(inst => center.distanceTo(inst.pos) > this.brushRadius);
        if (remaining.length !== data.length) {
            this.speciesData[this.activeSpecies] = remaining;
            this.rebuildInstances(this.activeSpecies);
            window.persistenceManager?.autoSave?.();
        }
    }

    addInstance(speciesId, pos, normal) {
        const data = this.speciesData[speciesId];
        const mesh = this.speciesMap[speciesId];
        if (!mesh || data.length >= this.maxCounts[speciesId]) return;
        const scaleValue = this.scaleMin + Math.random() * (this.scaleMax - this.scaleMin);
        const dummy = new THREE.Object3D();
        dummy.position.copy(pos);
        const alignTarget = new THREE.Vector3(0, 1, 0).lerp(normal, this.normalAlignment).normalize();
        dummy.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), alignTarget);
        dummy.rotateY(Math.random() * this.rotationJitter);
        dummy.scale.setScalar(scaleValue);
        dummy.updateMatrix();
        mesh.setMatrixAt(data.length, dummy.matrix);
        data.push({ pos: pos.clone(), matrix: dummy.matrix.clone(), normal: normal.clone() });
        mesh.count = data.length;
        mesh.instanceMatrix.needsUpdate = true;
        window.persistenceManager?.autoSave?.();
    }

    rebuildInstances(speciesId) {
        const data = this.speciesData[speciesId] || [];
        const mesh = this.speciesMap[speciesId];
        if (!mesh) return;
        data.forEach((item, index) => mesh.setMatrixAt(index, item.matrix));
        mesh.count = data.length;
        mesh.instanceMatrix.needsUpdate = true;
    }

    scatterOnPath(pointsArray) {
        if (!pointsArray || pointsArray.length < 2) return;
        const curve = new THREE.CatmullRomCurve3(pointsArray);
        const steps = Math.max(1, Math.floor(curve.getLength() / this.pathSpacing));
        for (let i = 0; i <= steps; i++) {
            const point = curve.getPointAt(i / steps);
            const tangent = curve.getTangentAt(i / steps);
            point.add(new THREE.Vector3(-tangent.z, 0, tangent.x).normalize().multiplyScalar((Math.random() - 0.5) * 2 * this.pathJitter));
            this.raycaster.set(new THREE.Vector3(point.x, point.y + 100, point.z), new THREE.Vector3(0, -1, 0));
            const hits = this.raycaster.intersectObjects(this.terrainMeshes, true);
            if (hits.length) this.addInstance(this.activeSpecies, hits[0].point, this.worldNormal(hits[0]));
        }
    }

    serialize() {
        const instances = {};
        Object.keys(this.speciesData).forEach(id => {
            instances[id] = this.speciesData[id].map(inst => ({
                p: [inst.pos.x, inst.pos.y, inst.pos.z],
                n: [inst.normal.x, inst.normal.y, inst.normal.z],
                m: Array.from(inst.matrix.elements),
            }));
        });
        return {
            version: 2,
            definitions: Object.fromEntries(Object.entries(this.speciesMeta).map(([id, meta]) => [id, {
                ...meta,
                maxCount: this.maxCounts[id] || meta.maxCount || 5000,
            }])),
            instances,
        };
    }

    async deserialize(data) {
        if (!data || typeof data !== 'object') return;
        const isVersioned = data.version === 2 && data.instances;
        const instances = isVersioned ? data.instances : data;
        if (isVersioned && data.definitions) {
            for (const [id, definition] of Object.entries(data.definitions)) {
                if (this.speciesMap[id] || !definition.sourceAssetId) continue;
                const asset = window.AssetsPanel?._findById?.(definition.sourceAssetId) ||
                    window.AssetsPanel?.assets?.find?.(item => item.id === definition.sourceAssetId);
                if (asset) {
                    await this.registerAsset(asset, {
                        id,
                        maxCount: definition.maxCount,
                    });
                }
            }
        }
        Object.keys(instances).forEach(id => {
            if (!this.speciesMap[id]) return;
            this.speciesData[id] = (instances[id] || []).slice(0, this.maxCounts[id]).map(item => ({
                pos: new THREE.Vector3().fromArray(item.p || [0, 0, 0]),
                normal: new THREE.Vector3().fromArray(item.n || [0, 1, 0]),
                matrix: new THREE.Matrix4().fromArray(item.m || new THREE.Matrix4().elements),
            }));
            this.rebuildInstances(id);
        });
    }

    clear() {
        Object.keys(this.speciesMap).forEach(id => {
            this.speciesData[id] = [];
            this.speciesMap[id].count = 0;
            this.speciesMap[id].instanceMatrix.needsUpdate = true;
        });
        window.persistenceManager?.autoSave?.();
    }
}

window.VegetationSystem = VegetationSystem;
