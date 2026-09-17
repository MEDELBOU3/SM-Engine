class RadianceCache {
    constructor(scene, camera, config, probeGrid, scheduler, objectRegistry = null) {
        this.scene = scene;
        this.camera = camera;
        this.config = config;
        this.probeGrid = probeGrid;
        this.scheduler = scheduler;
        this.objectRegistry = objectRegistry;
        this.enabled = true;
        this.frame = 0;
        this.skyColor = new THREE.Color(0.04, 0.05, 0.07);
        this.groundColor = new THREE.Color(0.015, 0.012, 0.01);
        this.tempColor = new THREE.Color();
        this.tempWorldPosition = new THREE.Vector3();
        this.stats = {
            updatedThisFrame: 0,
            totalUpdates: 0
        };
    }
    setSkyColor(color) {
        if (color?.isColor) this.skyColor.copy(color);
        else this.skyColor.set(color);
    }
    estimateSkyRadiance(probe) {
        const skySystem = window.skyLightingSystem;
        if (skySystem?.hemiLight?.color) {
            const intensity = skySystem.hemiLight.intensity ?? 1;
            probe.skyRadiance.copy(skySystem.hemiLight.color).multiplyScalar(intensity * 0.18);
            return probe.skyRadiance;
        }
        if (this.scene?.background?.isColor) {
            probe.skyRadiance.copy(this.scene.background).multiplyScalar(0.12);
            return probe.skyRadiance;
        }
        probe.skyRadiance.copy(this.skyColor);
        return probe.skyRadiance;
    }
    estimateLocalLightRadiance(probe, target = new THREE.Color()) {
        target.setRGB(0, 0, 0);
        if (!this.scene) return target;
        this.scene.traverse(object => {
            if (!object?.isLight || object.visible === false) return;
            if (object.userData?.isLumenInternal) return;
            if (object.isHemisphereLight || object.isAmbientLight) {
                const c = object.color || this.skyColor;
                const intensity = object.intensity ?? 1;
                target.r += c.r * intensity * 0.05;
                target.g += c.g * intensity * 0.05;
                target.b += c.b * intensity * 0.05;
                return;
            }
            object.getWorldPosition?.(this.tempWorldPosition);
            const distanceSq = Math.max(0.25, this.tempWorldPosition.distanceToSquared(probe.position));
            const range = object.distance > 0 ? object.distance : 50;
            if (distanceSq > range * range) return;
            const attenuation = 1 / (1 + distanceSq * 0.08);
            const intensity = object.intensity ?? 1;
            const c = object.color || this.skyColor;
            target.r += c.r * intensity * attenuation * 0.035;
            target.g += c.g * intensity * attenuation * 0.035;
            target.b += c.b * intensity * attenuation * 0.035;
        });
        return target;
    }
    updateProbe(probe) {
        if (!probe) return;
        const sky = this.estimateSkyRadiance(probe);
        const local = this.estimateLocalLightRadiance(probe, this.tempColor);
        probe.radiance.copy(sky).add(local).add(probe.emissiveRadiance);
        probe.irradiance.lerp(probe.radiance, probe.validity > 0 ? 0.25 : 1.0);
        this.probeGrid.updateProbe(probe, this.frame);
        this.stats.updatedThisFrame++;
        this.stats.totalUpdates++;
    }
    update() {
        if (!this.enabled || !this.scheduler || !this.probeGrid) return 0;
        this.frame++;
        this.stats.updatedThisFrame = 0;
        this.scheduler.runQueue('probeUpdates', probe => this.updateProbe(probe));
        return this.stats.updatedThisFrame;
    }
    invalidateAround(position, radius = 10) {
        return this.probeGrid?.markDirtyNear?.(position, radius) || 0;
    }
    invalidateAll() {
        this.probeGrid?.markAllDirty?.();
    }
    getStats() {
        return {
            ...this.stats,
            frame: this.frame
        };
    }
    dispose() {
        this.enabled = false;
    }
}
window.RadianceCache = RadianceCache;