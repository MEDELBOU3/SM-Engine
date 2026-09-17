class VoxelScene {
    constructor(scene, renderer, camera, config, scheduler = null, objectRegistry = null) {
        this.scene = scene;
        this.renderer = renderer;
        this.camera = camera;
        this.config = config;
        this.scheduler = scheduler;
        this.objectRegistry = objectRegistry;
        this.enabled = true;
        this.resolution = this.getResolution();
        this.worldSize = Math.max(4, this.config?.voxelWorldSize ?? 96);
        this.origin = new THREE.Vector3();
        this.lastCameraCell = new THREE.Vector3(Infinity, Infinity, Infinity);
        this.data = null;
        this.texture = null;
        this.dirtyObjects = new Set();
        this.version = 0;
        this.tempBox = new THREE.Box3();
        this.tempCenter = new THREE.Vector3();
        this.tempSize = new THREE.Vector3();
        this.tempColor = new THREE.Color();
        this.stats = {
            resolution: this.resolution,
            voxelizedObjects: 0,
            dirtyObjects: 0,
            updatesThisFrame: 0
        };
        this.createTexture();
        this.recenter(true);
        this.markAllDirty();
    }
    getResolution() {
        return Math.max(8, Math.floor(this.config?.voxelResolution ?? 64));
    }
    createTexture() {
        this.resolution = this.getResolution();
        const count = this.resolution * this.resolution * this.resolution * 4;
        this.data = new Uint8Array(count);
        this.texture?.dispose?.();
        this.texture = new THREE.Data3DTexture(this.data, this.resolution, this.resolution, this.resolution);
        this.texture.name = 'LumenVoxelScene';
        this.texture.format = THREE.RGBAFormat;
        this.texture.type = THREE.UnsignedByteType;
        this.texture.minFilter = THREE.LinearFilter;
        this.texture.magFilter = THREE.LinearFilter;
        this.texture.wrapS = THREE.ClampToEdgeWrapping;
        this.texture.wrapT = THREE.ClampToEdgeWrapping;
        this.texture.wrapR = THREE.ClampToEdgeWrapping;
        this.texture.unpackAlignment = 1;
        this.texture.needsUpdate = true;
        this.version++;
    }
    clear() {
        this.data.fill(0);
        this.texture.needsUpdate = true;
    }
    recenter(force = false) {
        if (!this.camera) return false;
        const cellSize = this.worldSize * 0.25;
        const cell = new THREE.Vector3(Math.floor(this.camera.position.x / cellSize), Math.floor(this.camera.position.y / cellSize), Math.floor(this.camera.position.z / cellSize));
        if (!force && cell.equals(this.lastCameraCell)) return false;
        this.lastCameraCell.copy(cell);
        this.origin.set(cell.x * cellSize, cell.y * cellSize, cell.z * cellSize);
        this.clear();
        this.markAllDirty();
        return true;
    }
    markAllDirty() {
        this.dirtyObjects.clear();
        const source = this.objectRegistry?.staticMeshes || null;
        if (source) {
            for (const mesh of source.values()) if (this.isEligible(mesh)) this.dirtyObjects.add(mesh);
        } else {
            this.scene?.traverse?.(object => {
                if (this.isEligible(object)) this.dirtyObjects.add(object);
            });
        }
        this.stats.dirtyObjects = this.dirtyObjects.size;
    }
    markDirty(object) {
        if (this.isEligible(object)) this.dirtyObjects.add(object);
    }
    isEligible(mesh) {
        if (!mesh?.isMesh || !mesh.geometry || !mesh.material) return false;
        if (mesh.userData?.isSystemObject || mesh.userData?.excludeFromLumenVoxel) return false;
        if (mesh.isSkinnedMesh || mesh.userData?.isDynamicMesh) return false;
        if (mesh.material?.transparent) return false;
        return true;
    }
    worldToVoxel(position, target = new THREE.Vector3()) {
        const half = this.worldSize * 0.5;
        const min = this.tempCenter.copy(this.origin).addScalar(-half);
        target.copy(position).sub(min).multiplyScalar(this.resolution / this.worldSize);
        target.floor();
        return target;
    }
    getIndex(x, y, z) {
        return ((z * this.resolution * this.resolution) + (y * this.resolution) + x) * 4;
    }
    inside(x, y, z) {
        return x >= 0 && y >= 0 && z >= 0 && x < this.resolution && y < this.resolution && z < this.resolution;
    }
    getMaterialRadiance(mesh, target = new THREE.Color()) {
        target.setRGB(0.03, 0.03, 0.03);
        const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
        if (!material) return target;
        if (material.color?.isColor) target.copy(material.color).multiplyScalar(0.18);
        if (material.emissive?.isColor) {
            const e = material.emissive.clone().multiplyScalar((material.emissiveIntensity ?? 1) * (this.config?.emissiveBoost ?? 1.5));
            target.add(e);
        }
        target.r = THREE.MathUtils.clamp(target.r, 0, 1);
        target.g = THREE.MathUtils.clamp(target.g, 0, 1);
        target.b = THREE.MathUtils.clamp(target.b, 0, 1);
        return target;
    }
    voxelizeObject(mesh) {
        if (!this.isEligible(mesh) || !mesh.parent) return false;
        mesh.updateMatrixWorld?.(true);
        this.tempBox.setFromObject(mesh);
        if (this.tempBox.isEmpty()) return false;
        const minVoxel = this.worldToVoxel(this.tempBox.min, new THREE.Vector3());
        const maxVoxel = this.worldToVoxel(this.tempBox.max, new THREE.Vector3());
        const minX = THREE.MathUtils.clamp(minVoxel.x, 0, this.resolution - 1);
        const minY = THREE.MathUtils.clamp(minVoxel.y, 0, this.resolution - 1);
        const minZ = THREE.MathUtils.clamp(minVoxel.z, 0, this.resolution - 1);
        const maxX = THREE.MathUtils.clamp(maxVoxel.x, 0, this.resolution - 1);
        const maxY = THREE.MathUtils.clamp(maxVoxel.y, 0, this.resolution - 1);
        const maxZ = THREE.MathUtils.clamp(maxVoxel.z, 0, this.resolution - 1);
        const color = this.getMaterialRadiance(mesh, this.tempColor);
        const r = Math.floor(color.r * 255);
        const g = Math.floor(color.g * 255);
        const b = Math.floor(color.b * 255);
        const maxFill = 250000;
        let filled = 0;
        for (let z = minZ; z <= maxZ; z++) {
            for (let y = minY; y <= maxY; y++) {
                for (let x = minX; x <= maxX; x++) {
                    if (!this.inside(x, y, z)) continue;
                    const index = this.getIndex(x, y, z);
                    this.data[index] = Math.max(this.data[index], r);
                    this.data[index + 1] = Math.max(this.data[index + 1], g);
                    this.data[index + 2] = Math.max(this.data[index + 2], b);
                    this.data[index + 3] = 255;
                    filled++;
                    if (filled >= maxFill) {
                        this.texture.needsUpdate = true;
                        return true;
                    }
                }
            }
        }
        this.texture.needsUpdate = true;
        return true;
    }
    scheduleUpdates() {
        if (!this.scheduler) return 0;
        let count = 0;
        for (const mesh of this.dirtyObjects) {
            const distance = this.camera ? this.camera.position.distanceTo(mesh.getWorldPosition(new THREE.Vector3())) : 0;
            this.scheduler.schedule('voxelUpdates', mesh, 10000 - distance);
            count++;
        }
        return count;
    }
    update(delta = 0, cameraMoved = false) {
        if (!this.enabled || this.config?.voxelEnabled === false) return 0;
        const desiredResolution = this.getResolution();
        if (desiredResolution !== this.resolution) {
            this.createTexture();
            this.markAllDirty();
        }
        this.worldSize = Math.max(4, this.config?.voxelWorldSize ?? this.worldSize);
        if (cameraMoved) this.recenter(false);
        if (this.objectRegistry) {
            for (const mesh of this.objectRegistry.consumeDirty?.(this.config?.voxelUpdateBudget ?? 4) || []) this.markDirty(mesh);
        }
        this.scheduleUpdates();
        this.stats.updatesThisFrame = 0;
        if (this.scheduler) {
            this.scheduler.runQueue('voxelUpdates', mesh => {
                if (this.voxelizeObject(mesh)) this.stats.updatesThisFrame++;
                this.dirtyObjects.delete(mesh);
            });
        } else {
            const budget = Math.max(1, this.config?.voxelUpdateBudget ?? 4);
            for (const mesh of Array.from(this.dirtyObjects).slice(0, budget)) {
                if (this.voxelizeObject(mesh)) this.stats.updatesThisFrame++;
                this.dirtyObjects.delete(mesh);
            }
        }
        this.stats.dirtyObjects = this.dirtyObjects.size;
        this.stats.voxelizedObjects += this.stats.updatesThisFrame;
        return this.stats.updatesThisFrame;
    }
    getTexture() {
        return this.texture;
    }
    getUniformData() {
        return {
            texture: this.texture,
            origin: this.origin,
            worldSize: this.worldSize,
            resolution: this.resolution
        };
    }
    getStats() {
        return {
            ...this.stats,
            version: this.version,
            worldSize: this.worldSize,
            origin: this.origin.toArray()
        };
    }
    dispose() {
        this.texture?.dispose?.();
        this.texture = null;
        this.data = null;
        this.dirtyObjects.clear();
    }
}
window.VoxelScene = VoxelScene;