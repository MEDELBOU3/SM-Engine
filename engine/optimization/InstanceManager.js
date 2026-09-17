/**
 * SM Engine - InstanceManager
 * Classic non-module build.
 * Converts repeated STATIC meshes that share geometry + material into THREE.InstancedMesh batches.
 */
class InstanceManager {
    constructor(scene, options = {}) {
        if (!scene) throw new Error("InstanceManager: scene is required.");
        this.scene = scene;
        this.options = {
            enabled: true,
            minInstances: 4,
            autoHideOriginals: true,
            dynamicUsage: false,
            ...options
        };
        this.batches = new Map();
        this.originalToBatch = new Map();
        this.stats = {
            batches: 0,
            instances: 0,
            hiddenOriginals: 0,
            estimatedDrawCallsSaved: 0
        };
    }

    canInstance(object) {
        if (!object?.isMesh || object.isSkinnedMesh || object.isInstancedMesh) return false;
        if (!object.geometry || !object.material) return false;
        if (object.morphTargetInfluences) return false;
        if (Array.isArray(object.material)) return false;
        return true;
    }

    buildFromScene(root = this.scene, options = {}) {
        if (!this.options.enabled) return [];
        const groups = new Map();
        root.traverse(object => {
            if (!this.canInstance(object)) return;
            if (object.userData?.__smDoNotInstance) return;
            const key = this._getBatchKey(object);
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(object);
        });
        const minInstances = Math.max(2, options.minInstances || this.options.minInstances);
        const created = [];
        for (const objects of groups.values()) {
            if (objects.length < minInstances) continue;
            const batch = this.createBatch(objects, options);
            if (batch) created.push(batch);
        }
        return created;
    }

    createBatch(objects, options = {}) {
        if (!Array.isArray(objects) || objects.length < 2) return null;
        const valid = objects.filter(object => this.canInstance(object) && !this.originalToBatch.has(object.uuid));
        if (valid.length < 2) return null;
        const first = valid[0];
        const key = this._getBatchKey(first);
        for (const object of valid) {
            if (this._getBatchKey(object) !== key) return null;
        }
        const geometry = first.geometry;
        const material = first.material;
        const instanced = new THREE.InstancedMesh(geometry, material, valid.length);
        instanced.name = options.name || `${first.name || "Mesh"}__SMInstances_${valid.length}`;
        instanced.castShadow = first.castShadow;
        instanced.receiveShadow = first.receiveShadow;
        instanced.frustumCulled = true;
        instanced.renderOrder = first.renderOrder;
        if (this.options.dynamicUsage && instanced.instanceMatrix) {
            instanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        }
        this.scene.updateMatrixWorld(true);
        const inverseSceneWorld = new THREE.Matrix4().copy(this.scene.matrixWorld).invert();
        const localMatrix = new THREE.Matrix4();
        for (let i = 0; i < valid.length; i++) {
            const object = valid[i];
            object.updateWorldMatrix(true, false);
            localMatrix.multiplyMatrices(inverseSceneWorld, object.matrixWorld);
            instanced.setMatrixAt(i, localMatrix);
        }
        instanced.instanceMatrix.needsUpdate = true;
        instanced.computeBoundingSphere?.();
        this.scene.add(instanced);
        const hideOriginals = options.hideOriginals ?? this.options.autoHideOriginals;
        const record = {
            id: instanced.uuid,
            key,
            instancedMesh: instanced,
            originals: valid.map(object => ({
                object,
                visible: object.visible,
                parent: object.parent
            })),
            hideOriginals
        };
        this.batches.set(record.id, record);
        for (const entry of record.originals) {
            this.originalToBatch.set(entry.object.uuid, record.id);
            if (hideOriginals) entry.object.visible = false;
        }
        this._refreshStats();
        return instanced;
    }

    updateInstanceTransform(originalObject) {
        if (!originalObject) return false;
        const batchId = this.originalToBatch.get(originalObject.uuid);
        const record = batchId ? this.batches.get(batchId) : null;
        if (!record) return false;
        const index = record.originals.findIndex(entry => entry.object === originalObject);
        if (index < 0) return false;
        this.scene.updateMatrixWorld(true);
        originalObject.updateWorldMatrix(true, false);
        const inverseSceneWorld = new THREE.Matrix4().copy(this.scene.matrixWorld).invert();
        const localMatrix = new THREE.Matrix4().multiplyMatrices(inverseSceneWorld, originalObject.matrixWorld);
        record.instancedMesh.setMatrixAt(index, localMatrix);
        record.instancedMesh.instanceMatrix.needsUpdate = true;
        record.instancedMesh.computeBoundingSphere?.();
        return true;
    }

    restoreBatch(instancedMeshOrId, dispose = false) {
        const id = typeof instancedMeshOrId === "string" ? instancedMeshOrId : instancedMeshOrId?.uuid;
        const record = id ? this.batches.get(id) : null;
        if (!record) return false;
        for (const entry of record.originals) {
            entry.object.visible = entry.visible;
            this.originalToBatch.delete(entry.object.uuid);
        }
        if (record.instancedMesh.parent) record.instancedMesh.parent.remove(record.instancedMesh);
        if (dispose) record.instancedMesh.dispose?.();
        this.batches.delete(id);
        this._refreshStats();
        return true;
    }

    _getBatchKey(object) {
        const geometryId = object.geometry?.uuid || "no-geometry";
        const materialId = object.material?.uuid || "no-material";
        const shadowKey = `${object.castShadow ? 1 : 0}${object.receiveShadow ? 1 : 0}`;
        return `${geometryId}|${materialId}|${shadowKey}|${object.renderOrder || 0}`;
    }

    _refreshStats() {
        let instances = 0;
        let hiddenOriginals = 0;
        for (const record of this.batches.values()) {
            instances += record.originals.length;
            hiddenOriginals += record.originals.reduce((sum, entry) => sum + (entry.object.visible ? 0 : 1), 0);
        }
        this.stats.batches = this.batches.size;
        this.stats.instances = instances;
        this.stats.hiddenOriginals = hiddenOriginals;
        this.stats.estimatedDrawCallsSaved = Math.max(0, instances - this.batches.size);
    }

    getStats() {
        this._refreshStats();
        return { ...this.stats };
    }

    destroy({ restoreOriginals = true, disposeBatches = false } = {}) {
        const records = Array.from(this.batches.values());
        for (const record of records) {
            if (restoreOriginals) {
                for (const entry of record.originals) {
                    entry.object.visible = entry.visible;
                    this.originalToBatch.delete(entry.object.uuid);
                }
            }
            if (record.instancedMesh.parent) record.instancedMesh.parent.remove(record.instancedMesh);
            if (disposeBatches) record.instancedMesh.dispose?.();
        }
        this.batches.clear();
        this.originalToBatch.clear();
        this._refreshStats();
    }
}

window.InstanceManager = InstanceManager;