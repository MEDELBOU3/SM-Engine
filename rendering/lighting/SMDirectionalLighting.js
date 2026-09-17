(function (global) {
    'use strict';

    class SMDirectionalLighting {
        constructor(light, options = {}) {
            if (!light?.isDirectionalLight) {
                throw new Error('[SMDirectionalLighting] DirectionalLight required.');
            }

            this.light = light;
            this.scene = options.scene || global.scene || light.parent || null;
            this.target = light.target;

            this.settings = {
                intensity: options.intensity ?? light.intensity ?? 1,
                color: options.color ?? light.color?.getHex?.() ?? 0xffffff,
                castShadow: options.castShadow ?? light.castShadow ?? true,
                shadowDistance: options.shadowDistance ?? 100,
                shadowMapSize: options.shadowMapSize ?? 2048,
                shadowBias: options.shadowBias ?? -0.00005,
                shadowNormalBias: options.shadowNormalBias ?? 0.0015,
                shadowRadius: options.shadowRadius ?? 1.0
            };

            this.apply();
        }

        apply() {
            const light = this.light;
            const s = this.settings;

            light.intensity = s.intensity;
            light.color?.set?.(s.color);
            light.castShadow = !!s.castShadow;

            if (light.shadow) {
                const size = Math.max(256, s.shadowMapSize | 0);
                if (
                    light.shadow.map &&
                    (light.shadow.map.width !== size || light.shadow.map.height !== size)
                ) {
                    light.shadow.map.dispose?.();
                    light.shadow.map = null;
                }
                light.shadow.mapSize.set(size, size);
                light.shadow.bias = s.shadowBias;
                light.shadow.normalBias = s.shadowNormalBias;
                light.shadow.radius = s.shadowRadius;

                const d = Math.max(5, Number(s.shadowDistance) || 100);
                light.shadow.camera.near = 0.1;
                light.shadow.camera.far = d * 2;
                light.shadow.camera.left = -d * 0.5;
                light.shadow.camera.right = d * 0.5;
                light.shadow.camera.top = d * 0.5;
                light.shadow.camera.bottom = -d * 0.5;
                light.shadow.camera.updateProjectionMatrix?.();
                light.shadow.needsUpdate = true;
            }

            return this;
        }

        setDirection(direction) {
            if (!direction?.isVector3) return this;

            const position = this.light.position;
            const targetPosition = position.clone().add(direction.clone().normalize());

            this.target.position.copy(targetPosition);

            if (!this.target.parent && this.scene) {
                this.scene.add(this.target);
            }

            this.target.updateMatrixWorld?.(true);
            return this;
        }

        setIntensity(value) {
            this.settings.intensity = Math.max(0, Number(value) || 0);
            this.light.intensity = this.settings.intensity;
            return this;
        }

        setColor(value) {
            this.settings.color = value;
            this.light.color?.set?.(value);
            return this;
        }

        setShadowDistance(value) {
            this.settings.shadowDistance = Math.max(5, Number(value) || 100);
            return this.apply();
        }

        setShadowQuality(mapSize) {
            this.settings.shadowMapSize = Math.max(256, mapSize | 0);
            return this.apply();
        }
    }

    global.SMDirectionalLighting = SMDirectionalLighting;
})(window);
