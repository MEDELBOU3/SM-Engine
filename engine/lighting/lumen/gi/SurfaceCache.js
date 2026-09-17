class SurfaceCache {
    constructor(scene, renderer, config, scheduler = null, objectRegistry = null) {
        this.scene = scene;
        this.renderer = renderer;
        this.config = config;
        this.scheduler = scheduler;
        this.objectRegistry = objectRegistry;
        this.enabled = true;
        this.cards = new Map();
        this.meshCards = new Map();
        this.dirtyCards = new Set();
        this.version = 0;
        this.cardResolution = 64;
        this.captureDirections = [
            { name: 'px', direction: new THREE.Vector3(1, 0, 0), up: new THREE.Vector3(0, 1, 0) },
            { name: 'nx', direction: new THREE.Vector3(-1, 0, 0), up: new THREE.Vector3(0, 1, 0) },
            { name: 'py', direction: new THREE.Vector3(0, 1, 0), up: new THREE.Vector3(0, 0, -1) },
            { name: 'ny', direction: new THREE.Vector3(0, -1, 0), up: new THREE.Vector3(0, 0, 1) },
            { name: 'pz', direction: new THREE.Vector3(0, 0, 1), up: new THREE.Vector3(0, 1, 0) },
            { name: 'nz', direction: new THREE.Vector3(0, 0, -1), up: new THREE.Vector3(0, 1, 0) }
        ];
        this.tempBox = new THREE.Box3();
        this.tempCenter = new THREE.Vector3();
        this.tempSize = new THREE.Vector3();
        this.stats = {
            registeredMeshes: 0,
            cards: 0,
            dirty: 0,
            updatedThisFrame: 0
        };
        this.initialScan();
    }
    initialScan() {
        if (this.objectRegistry?.staticMeshes) {
            for (const mesh of this.objectRegistry.staticMeshes.values()) this.register(mesh);
            return;
        }
        this.scene?.traverse?.(object => {
            if (object?.isMesh && !object.isSkinnedMesh && !object.userData?.isDynamicMesh) this.register(object);
        });
    }
    isEligible(mesh) {
        if (!mesh?.isMesh || !mesh.geometry || !mesh.material) return false;
        if (mesh.userData?.isSystemObject) return false;
        if (mesh.userData?.excludeFromLumenSurfaceCache) return false;
        if (mesh.isSkinnedMesh || mesh.userData?.isDynamicMesh) return false;
        if (mesh.material?.transparent) return false;
        return true;
    }
    register(mesh) {
        if (!this.isEligible(mesh) || this.meshCards.has(mesh.uuid)) return false;
        mesh.updateMatrixWorld?.(true);
        this.tempBox.setFromObject(mesh);
        if (this.tempBox.isEmpty()) return false;
        this.tempBox.getCenter(this.tempCenter);
        this.tempBox.getSize(this.tempSize);
        const maxExtent = Math.max(this.tempSize.x, this.tempSize.y, this.tempSize.z, 0.001);
        const distance = maxExtent * 1.35 + 0.25;
        const cards = [];
        for (const info of this.captureDirections) {
            const id = `${mesh.uuid}:${info.name}`;
            const card = {
                id,
                mesh,
                meshUUID: mesh.uuid,
                directionName: info.name,
                direction: info.direction.clone(),
                up: info.up.clone(),
                center: this.tempCenter.clone(),
                size: this.tempSize.clone(),
                captureDistance: distance,
                dirty: true,
                valid: false,
                lastUpdateFrame: -1,
                albedo: new THREE.Color(0.5, 0.5, 0.5),
                emissive: new THREE.Color(0, 0, 0),
                roughness: 1,
                metalness: 0,
                radiance: new THREE.Color(0, 0, 0)
            };
            this.cards.set(id, card);
            this.dirtyCards.add(card);
            cards.push(card);
        }
        this.meshCards.set(mesh.uuid, cards);
        this.version++;
        this.refreshStats();
        return true;
    }
    unregister(mesh) {
        if (!mesh?.uuid) return false;
        const cards = this.meshCards.get(mesh.uuid);
        if (!cards) return false;
        for (const card of cards) {
            this.cards.delete(card.id);
            this.dirtyCards.delete(card);
        }
        this.meshCards.delete(mesh.uuid);
        this.version++;
        this.refreshStats();
        return true;
    }
    markDirty(mesh) {
        const cards = this.meshCards.get(mesh?.uuid);
        if (!cards) return false;
        for (const card of cards) {
            card.dirty = true;
            this.dirtyCards.add(card);
        }
        return true;
    }
    readMaterial(card) {
        const mesh = card.mesh;
        const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
        if (!material) return;
        if (material.color?.isColor) card.albedo.copy(material.color);
        else card.albedo.setRGB(0.5, 0.5, 0.5);
        if (material.emissive?.isColor) card.emissive.copy(material.emissive).multiplyScalar(material.emissiveIntensity ?? 1);
        else card.emissive.setRGB(0, 0, 0);
        card.roughness = material.roughness ?? 1;
        card.metalness = material.metalness ?? 0;
        card.radiance.copy(card.albedo).multiplyScalar(0.04).add(card.emissive);
    }
    updateCard(card, frame = 0) {
        if (!card?.mesh?.parent) {
            this.unregister(card?.mesh);
            return false;
        }
        card.mesh.updateMatrixWorld?.(true);
        this.tempBox.setFromObject(card.mesh);
        if (!this.tempBox.isEmpty()) {
            this.tempBox.getCenter(card.center);
            this.tempBox.getSize(card.size);
        }
        this.readMaterial(card);
        card.valid = true;
        card.dirty = false;
        card.lastUpdateFrame = frame;
        this.dirtyCards.delete(card);
        return true;
    }
    scheduleDirtyCards() {
        if (!this.scheduler) return 0;
        let scheduled = 0;
        for (const card of this.dirtyCards) {
            const camera = window.camera || window.cameraSystem?.camera;
            const distance = camera ? camera.position.distanceTo(card.center) : 0;
            const priority = 10000 - distance;
            this.scheduler.schedule('surfaceCards', card, priority);
            scheduled++;
        }
        return scheduled;
    }
    update(delta = 0) {
        if (!this.enabled || this.config?.surfaceCacheEnabled === false) return 0;
        if (this.objectRegistry?.staticMeshes) {
            for (const mesh of this.objectRegistry.staticMeshes.values()) if (!this.meshCards.has(mesh.uuid)) this.register(mesh);
        }
        this.scheduleDirtyCards();
        this.stats.updatedThisFrame = 0;
        if (this.scheduler) {
            this.scheduler.runQueue('surfaceCards', card => {
                if (this.updateCard(card, this.scheduler.frame)) this.stats.updatedThisFrame++;
            });
        } else {
            const budget = Math.max(1, this.config?.surfaceCardBudget ?? 2);
            let count = 0;
            for (const card of Array.from(this.dirtyCards)) {
                if (count >= budget) break;
                if (this.updateCard(card, 0)) count++;
            }
            this.stats.updatedThisFrame = count;
        }
        this.refreshStats();
        return this.stats.updatedThisFrame;
    }
    findNearestCard(position, normal = null) {
        let best = null;
        let bestScore = Infinity;
        for (const card of this.cards.values()) {
            if (!card.valid) continue;
            const distance = card.center.distanceTo(position);
            let score = distance;
            if (normal) {
                const facing = Math.max(0, card.direction.dot(normal));
                score += (1 - facing) * 2;
            }
            if (score < bestScore) {
                bestScore = score;
                best = card;
            }
        }
        return best;
    }
    sampleRadiance(position, normal, target = new THREE.Color()) {
        const card = this.findNearestCard(position, normal);
        if (!card) return target.setRGB(0, 0, 0);
        return target.copy(card.radiance);
    }
    refreshStats() {
        this.stats.registeredMeshes = this.meshCards.size;
        this.stats.cards = this.cards.size;
        this.stats.dirty = this.dirtyCards.size;
    }
    getStats() {
        this.refreshStats();
        return {
            ...this.stats,
            version: this.version
        };
    }
    dispose() {
        this.cards.clear();
        this.meshCards.clear();
        this.dirtyCards.clear();
    }
}
window.SurfaceCache = SurfaceCache;