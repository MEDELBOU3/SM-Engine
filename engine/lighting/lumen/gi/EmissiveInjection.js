class EmissiveInjection {
    constructor(scene, config, probeGrid, objectRegistry = null) {
        this.scene = scene;
        this.config = config;
        this.probeGrid = probeGrid;
        this.objectRegistry = objectRegistry;
        this.enabled = true;
        this.registered = new Map();
        this.tempPosition = new THREE.Vector3();
        this.tempColor = new THREE.Color();
        this.scan();
    }
    scan() {
        this.registered.clear();
        if (this.objectRegistry?.emissiveMeshes) {
            for (const mesh of this.objectRegistry.emissiveMeshes.values()) this.register(mesh);
            return this.registered.size;
        }
        this.scene?.traverse?.(object => {
            if (object?.isMesh) this.register(object);
        });
        return this.registered.size;
    }
    isEmissive(mesh) {
        if (!mesh?.isMesh || !mesh.material) return false;
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        return materials.some(material => {
            if (!material?.emissive) return false;
            const intensity = material.emissiveIntensity ?? 1;
            return intensity > 0 && material.emissive.r + material.emissive.g + material.emissive.b > 0.0001;
        });
    }
    register(mesh) {
        if (!this.isEmissive(mesh)) return false;
        this.registered.set(mesh.uuid, mesh);
        return true;
    }
    unregister(mesh) {
        if (!mesh?.uuid) return false;
        return this.registered.delete(mesh.uuid);
    }
    getMeshEmission(mesh, target = new THREE.Color()) {
        target.setRGB(0, 0, 0);
        if (!mesh?.material) return target;
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        let count = 0;
        for (const material of materials) {
            if (!material?.emissive) continue;
            const intensity = Math.max(0, material.emissiveIntensity ?? 1);
            if (intensity <= 0) continue;
            target.r += material.emissive.r * intensity;
            target.g += material.emissive.g * intensity;
            target.b += material.emissive.b * intensity;
            count++;
        }
        if (count > 1) target.multiplyScalar(1 / count);
        target.multiplyScalar(this.config?.emissiveBoost ?? 1.5);
        return target;
    }
    estimateRadius(mesh, emission) {
        if (!mesh.geometry) return 4;
        if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere?.();
        const sphere = mesh.geometry.boundingSphere;
        let base = sphere?.radius ?? 1;
        mesh.getWorldScale?.(this.tempPosition);
        base *= Math.max(Math.abs(this.tempPosition.x), Math.abs(this.tempPosition.y), Math.abs(this.tempPosition.z), 0.001);
        const strength = Math.max(emission.r, emission.g, emission.b);
        return THREE.MathUtils.clamp(base * 3 + strength * 2, 2, 24);
    }
    clearProbeEmission() {
        if (!this.probeGrid) return;
        for (const probe of this.probeGrid.probes) probe.emissiveRadiance.setRGB(0, 0, 0);
    }
    injectMesh(mesh) {
        if (!mesh?.parent || mesh.visible === false) return;
        const emission = this.getMeshEmission(mesh, this.tempColor);
        const strength = Math.max(emission.r, emission.g, emission.b);
        if (strength <= 0.0001) return;
        mesh.getWorldPosition(this.tempPosition);
        const center = this.tempPosition.clone();
        const radius = this.estimateRadius(mesh, emission);
        const radiusSq = radius * radius;
        for (const probe of this.probeGrid.probes) {
            const distanceSq = probe.position.distanceToSquared(center);
            if (distanceSq > radiusSq) continue;
            const distance = Math.sqrt(distanceSq);
            const falloff = Math.pow(Math.max(0, 1 - distance / radius), 2);
            probe.emissiveRadiance.r += emission.r * falloff * 0.15;
            probe.emissiveRadiance.g += emission.g * falloff * 0.15;
            probe.emissiveRadiance.b += emission.b * falloff * 0.15;
            probe.dirty = true;
        }
    }
    update() {
        if (!this.enabled || !this.probeGrid) return 0;
        if (this.objectRegistry?.emissiveMeshes) {
            for (const mesh of this.objectRegistry.emissiveMeshes.values()) if (!this.registered.has(mesh.uuid)) this.register(mesh);
        }
        this.clearProbeEmission();
        let count = 0;
        for (const [uuid, mesh] of this.registered) {
            if (!mesh?.parent || !this.isEmissive(mesh)) {
                this.registered.delete(uuid);
                continue;
            }
            this.injectMesh(mesh);
            count++;
        }
        return count;
    }
    getStats() {
        return {
            registered: this.registered.size
        };
    }
    dispose() {
        this.registered.clear();
    }
}
window.EmissiveInjection = EmissiveInjection;