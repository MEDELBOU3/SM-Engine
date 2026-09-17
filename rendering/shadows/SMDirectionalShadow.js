(function (global) {
    'use strict';

    class SMDirectionalShadow {
        constructor(light, options = {}) {
            if (!light?.isDirectionalLight) {
                throw new Error('[SMDirectionalShadow] DirectionalLight required.');
            }

            this.light = light;

            this.settings = {
                mapSize: options.mapSize ?? 2048,
                distance: options.distance ?? 120,
                bias: options.bias ?? -0.00005,
                normalBias: options.normalBias ?? 0.0015,
                radius: options.radius ?? 1.0
            };
        }

        configure(camera = null) {
            const shadow = this.light.shadow;
            if (!shadow) return this;

            const size = Math.max(256, this.settings.mapSize | 0);
            const distance = Math.max(10, Number(this.settings.distance) || 120);

            this.light.castShadow = true;
            if (
                shadow.map &&
                (shadow.map.width !== size || shadow.map.height !== size)
            ) {
                shadow.map.dispose?.();
                shadow.map = null;
            }
            shadow.mapSize.set(size, size);

            shadow.bias = this.settings.bias;
            shadow.normalBias = this.settings.normalBias;
            shadow.radius = this.settings.radius;

            shadow.camera.near = 0.1;
            shadow.camera.far = distance * 2;

            const half = distance * 0.5;
            shadow.camera.left = -half;
            shadow.camera.right = half;
            shadow.camera.top = half;
            shadow.camera.bottom = -half;

            if (camera?.isCamera) {
                const p = new THREE.Vector3();
                camera.getWorldPosition(p);

                // Keep the shadow target centered roughly around the active view.
                this.light.target.position.copy(p);
                this.light.target.updateMatrixWorld?.(true);
            }

            shadow.camera.updateProjectionMatrix?.();
            shadow.needsUpdate = true;

            return this;
        }
    }

    global.SMDirectionalShadow = SMDirectionalShadow;
})(window);
