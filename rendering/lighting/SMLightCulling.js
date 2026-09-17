(function (global) {
    'use strict';

    class SMLightCulling {
        constructor(options = {}) {
            this.maxDistance = options.maxDistance ?? 120;
            this.maxPointLights = options.maxPointLights ?? 64;
            this.maxSpotLights = options.maxSpotLights ?? 32;

            this._cameraPosition = new THREE.Vector3();
            this._worldPosition = new THREE.Vector3();
        }

        update(scene, camera) {
            if (!scene || !camera) return;

            camera.getWorldPosition(this._cameraPosition);

            const pointCandidates = [];
            const spotCandidates = [];
            const nativeEntries = [];

            scene.traverse(object => {
                if (!object?.isLight) return;
                if (object.isDirectionalLight || object.isHemisphereLight || object.isAmbientLight) {
                    return;
                }

                object.getWorldPosition(this._worldPosition);

                const distance = this._cameraPosition.distanceTo(this._worldPosition);
                const configuredRange =
                    object.distance > 0
                        ? object.distance
                        : this.maxDistance;

                const maxDistance = Math.min(
                    this.maxDistance,
                    configuredRange || this.maxDistance
                );

                const score = Math.max(0, object.intensity || 0) / Math.max(1, distance * distance);

                const entry = {
                    light: object,
                    distance,
                    score,
                    visibleByDistance: distance <= maxDistance
                };

                if (object.isPointLight) {
                    entry.nativeIndex = nativeEntries.length;
                    pointCandidates.push(entry);
                    nativeEntries.push({
                        x: this._worldPosition.x,
                        y: this._worldPosition.y,
                        z: this._worldPosition.z,
                        range: configuredRange,
                        intensity: object.intensity,
                        type: 'point'
                    });
                } else if (object.isSpotLight) {
                    entry.nativeIndex = nativeEntries.length;
                    spotCandidates.push(entry);
                    nativeEntries.push({
                        x: this._worldPosition.x,
                        y: this._worldPosition.y,
                        z: this._worldPosition.z,
                        range: configuredRange,
                        intensity: object.intensity,
                        type: 'spot'
                    });
                }
            });

            const nativeSelection = global.SculptWASM?.selectLights?.(
                nativeEntries,
                this._cameraPosition,
                this.maxDistance,
                this.maxPointLights,
                this.maxSpotLights
            );

            if (nativeSelection) {
                [...pointCandidates, ...spotCandidates].forEach(entry => {
                    const light = entry.light;
                    if (light.userData.smManualVisibility === undefined) {
                        light.userData.smManualVisibility = light.visible;
                    }
                    light.visible =
                        light.userData.smManualVisibility !== false &&
                        nativeSelection.visible[entry.nativeIndex] === 1;
                });
                return;
            }

            const apply = (items, maxCount) => {
                items.sort((a, b) => b.score - a.score);

                items.forEach((entry, index) => {
                    const light = entry.light;

                    if (light.userData.smManualVisibility === undefined) {
                        light.userData.smManualVisibility = light.visible;
                    }

                    light.visible =
                        light.userData.smManualVisibility !== false &&
                        entry.visibleByDistance &&
                        index < maxCount;
                });
            };

            apply(pointCandidates, this.maxPointLights);
            apply(spotCandidates, this.maxSpotLights);
        }

        restore(scene) {
            scene?.traverse?.(object => {
                if (!object?.isLight) return;

                if (object.userData.smManualVisibility !== undefined) {
                    object.visible = object.userData.smManualVisibility;
                    delete object.userData.smManualVisibility;
                }
            });
        }
    }

    global.SMLightCulling = SMLightCulling;
})(window);
