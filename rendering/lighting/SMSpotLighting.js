(function (global) {
    'use strict';

    class SMSpotLighting {
        constructor(light, options = {}) {
            if (!light?.isSpotLight) {
                throw new Error('[SMSpotLighting] SpotLight required.');
            }

            this.light = light;
            this.scene = options.scene || global.scene || light.parent || null;
        }

        configure(options = {}) {
            const light = this.light;

            if ('color' in options) light.color.set(options.color);
            if ('intensity' in options) light.intensity = Math.max(0, Number(options.intensity) || 0);
            if ('distance' in options) light.distance = Math.max(0, Number(options.distance) || 0);
            if ('angle' in options) light.angle = THREE.MathUtils.clamp(Number(options.angle) || 0, 0.01, Math.PI / 2);
            if ('penumbra' in options) light.penumbra = THREE.MathUtils.clamp(Number(options.penumbra) || 0, 0, 1);
            if ('decay' in options) light.decay = Math.max(0, Number(options.decay) || 0);
            if ('castShadow' in options) light.castShadow = !!options.castShadow;

            if (light.shadow && options.shadowMapSize) {
                const size = Math.max(256, options.shadowMapSize | 0);
                light.shadow.mapSize.set(size, size);
                light.shadow.needsUpdate = true;
            }

            return this;
        }

        lookAt(position) {
            if (!position?.isVector3) return this;

            this.light.target.position.copy(position);

            if (!this.light.target.parent && this.scene) {
                this.scene.add(this.light.target);
            }

            this.light.target.updateMatrixWorld?.(true);
            return this;
        }
    }

    global.SMSpotLighting = SMSpotLighting;
})(window);
