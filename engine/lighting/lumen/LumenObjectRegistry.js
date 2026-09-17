class LumenObjectRegistry {
    constructor(scene) {
        this.scene = scene;
        this.allMeshes = new Map();
        this.staticMeshes = new Map();
        this.dynamicMeshes = new Map();
        this.skinnedMeshes = new Map();
        this.emissiveMeshes = new Map();
        this.transparentMeshes = new Map();
        this.terrainMeshes = new Map();
        this.dirtyMeshes = new Set();
        this.version = 0;
        this.initialScan();
    }
    initialScan() {
        if (!this.scene) return;
        this.scene.traverse(object => this.register(object));
    }
    register(object) {
        if (!object) return false;
        let changed = false;
        const addMesh = mesh => {
            if (!mesh?.isMesh || !mesh.geometry || !mesh.material) return;
            if (mesh.userData?.isSystemObject) return;
            if (this.allMeshes.has(mesh.uuid)) return;
            this.allMeshes.set(mesh.uuid, mesh);
            const isSkinned = !!mesh.isSkinnedMesh;
            const isDynamic = isSkinned || !!mesh.userData?.isDynamicMesh || mesh.userData?.static === false || !!mesh.userData?.isRuntimeCharacter;
            const isTerrain = !!mesh.userData?.isTerrain || String(mesh.name || '').toLowerCase().includes('terrain');
            const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            const isTransparent = materials.some(material => material?.transparent || (material?.opacity ?? 1) < 1);
            const isEmissive = materials.some(material => {
                if (!material?.emissive) return false;
                const intensity = material.emissiveIntensity ?? 1;
                return intensity > 0 && material.emissive.r + material.emissive.g + material.emissive.b > 0.0001;
            });
            if (isSkinned) this.skinnedMeshes.set(mesh.uuid, mesh);
            if (isDynamic) this.dynamicMeshes.set(mesh.uuid, mesh);
            else this.staticMeshes.set(mesh.uuid, mesh);
            if (isTerrain) this.terrainMeshes.set(mesh.uuid, mesh);
            if (isTransparent) this.transparentMeshes.set(mesh.uuid, mesh);
            if (isEmissive) this.emissiveMeshes.set(mesh.uuid, mesh);
            mesh.userData = mesh.userData || {};
            mesh.userData.lumenRegistered = true;
            mesh.userData.lumenLastMatrixWorld = mesh.matrixWorld.clone();
            mesh.userData.lumenMaterialVersion = 0;
            this.dirtyMeshes.add(mesh);
            changed = true;
        };
        if (object.isMesh) addMesh(object);
        object.traverse?.(child => {
            if (child !== object) addMesh(child);
        });
        if (changed) this.version++;
        return changed;
    }
    unregister(object) {
        if (!object) return false;
        let changed = false;
        const removeMesh = mesh => {
            if (!mesh?.uuid) return;
            if (!this.allMeshes.has(mesh.uuid)) return;
            this.allMeshes.delete(mesh.uuid);
            this.staticMeshes.delete(mesh.uuid);
            this.dynamicMeshes.delete(mesh.uuid);
            this.skinnedMeshes.delete(mesh.uuid);
            this.emissiveMeshes.delete(mesh.uuid);
            this.transparentMeshes.delete(mesh.uuid);
            this.terrainMeshes.delete(mesh.uuid);
            this.dirtyMeshes.delete(mesh);
            if (mesh.userData) mesh.userData.lumenRegistered = false;
            changed = true;
        };
        if (object.isMesh) removeMesh(object);
        object.traverse?.(child => {
            if (child !== object) removeMesh(child);
        });
        if (changed) this.version++;
        return changed;
    }
    markDirty(object) {
        if (!object) return;
        if (object.isMesh && this.allMeshes.has(object.uuid)) this.dirtyMeshes.add(object);
        object.traverse?.(child => {
            if (child.isMesh && this.allMeshes.has(child.uuid)) this.dirtyMeshes.add(child);
        });
    }
    update() {
        for (const mesh of this.dynamicMeshes.values()) {
            if (!mesh?.parent && mesh !== this.scene) {
                this.unregister(mesh);
                continue;
            }
            mesh.updateMatrixWorld?.();
            const previous = mesh.userData?.lumenLastMatrixWorld;
            if (!previous || !previous.equals(mesh.matrixWorld)) {
                this.dirtyMeshes.add(mesh);
                if (mesh.userData) mesh.userData.lumenLastMatrixWorld = mesh.matrixWorld.clone();
            }
        }
        return this.dirtyMeshes.size;
    }
    consumeDirty(limit = Infinity) {
        const result = [];
        for (const mesh of this.dirtyMeshes) {
            result.push(mesh);
            this.dirtyMeshes.delete(mesh);
            if (result.length >= limit) break;
        }
        return result;
    }
    refreshMaterialState(mesh) {
        if (!mesh?.isMesh || !this.allMeshes.has(mesh.uuid)) return;
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        const emissive = materials.some(material => {
            if (!material?.emissive) return false;
            const intensity = material.emissiveIntensity ?? 1;
            return intensity > 0 && material.emissive.r + material.emissive.g + material.emissive.b > 0.0001;
        });
        const transparent = materials.some(material => material?.transparent || (material?.opacity ?? 1) < 1);
        if (emissive) this.emissiveMeshes.set(mesh.uuid, mesh);
        else this.emissiveMeshes.delete(mesh.uuid);
        if (transparent) this.transparentMeshes.set(mesh.uuid, mesh);
        else this.transparentMeshes.delete(mesh.uuid);
        this.dirtyMeshes.add(mesh);
    }
    getStats() {
        return {
            total: this.allMeshes.size,
            static: this.staticMeshes.size,
            dynamic: this.dynamicMeshes.size,
            skinned: this.skinnedMeshes.size,
            emissive: this.emissiveMeshes.size,
            transparent: this.transparentMeshes.size,
            terrain: this.terrainMeshes.size,
            dirty: this.dirtyMeshes.size,
            version: this.version
        };
    }
    dispose() {
        for (const mesh of this.allMeshes.values()) {
            if (mesh.userData) {
                delete mesh.userData.lumenRegistered;
                delete mesh.userData.lumenLastMatrixWorld;
                delete mesh.userData.lumenMaterialVersion;
            }
        }
        this.allMeshes.clear();
        this.staticMeshes.clear();
        this.dynamicMeshes.clear();
        this.skinnedMeshes.clear();
        this.emissiveMeshes.clear();
        this.transparentMeshes.clear();
        this.terrainMeshes.clear();
        this.dirtyMeshes.clear();
    }
}
window.LumenObjectRegistry = LumenObjectRegistry;