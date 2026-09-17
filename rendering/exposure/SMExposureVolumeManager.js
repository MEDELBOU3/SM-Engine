(function (global) {
    'use strict';

    class SMExposureVolumeManager {
        constructor() {
            this.volumes = [];
            this._cameraPosition = new THREE.Vector3();
        }

        add(options) {
            const volume = options instanceof global.SMExposureVolume
                ? options
                : new global.SMExposureVolume(options);
            this.remove(volume.id);
            this.volumes.push(volume);
            this.volumes.sort((a, b) => a.priority - b.priority);
            return volume;
        }

        remove(volumeOrId) {
            const id = typeof volumeOrId === 'string' ? volumeOrId : volumeOrId?.id;
            const index = this.volumes.findIndex(volume => volume.id === id);
            if (index < 0) return false;
            this.volumes.splice(index, 1);
            return true;
        }

        resolve(camera, baseSettings) {
            const resolved = { ...baseSettings };
            if (!camera) return { settings: resolved, activeVolumes: [] };
            camera.getWorldPosition(this._cameraPosition);
            const activeVolumes = [];
            for (const volume of this.volumes) {
                const weight = volume.getWeight(this._cameraPosition);
                if (weight <= 0) continue;
                activeVolumes.push({ id: volume.id, priority: volume.priority, weight });
                for (const [key, value] of Object.entries(volume.settings)) {
                    if (typeof value === 'number' && Number.isFinite(value)) {
                        const current = Number(resolved[key]);
                        resolved[key] = Number.isFinite(current)
                            ? THREE.MathUtils.lerp(current, value, weight)
                            : value;
                    } else if (weight >= 0.5) {
                        resolved[key] = value;
                    }
                }
            }
            return { settings: resolved, activeVolumes };
        }
    }

    global.SMExposureVolumeManager = SMExposureVolumeManager;
})(window);
