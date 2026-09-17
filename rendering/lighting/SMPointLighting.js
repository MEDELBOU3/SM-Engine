(function (global) {
    'use strict';

    class SMPointLighting {
        constructor(light) {
            if (!light?.isPointLight) {
                throw new Error('[SMPointLighting] PointLight required.');
            }

            this.light = light;
        }

        configure(options = {}) {
            if ('color' in options) this.light.color.set(options.color);
            if ('intensity' in options) this.light.intensity = Math.max(0, Number(options.intensity) || 0);
            if ('distance' in options) this.light.distance = Math.max(0, Number(options.distance) || 0);
            if ('decay' in options) this.light.decay = Math.max(0, Number(options.decay) || 0);
            if ('castShadow' in options) this.light.castShadow = !!options.castShadow;

            if (this.light.shadow && options.shadowMapSize) {
                const size = Math.max(256, options.shadowMapSize | 0);
                this.light.shadow.mapSize.set(size, size);
                this.light.shadow.needsUpdate = true;
            }

            return this;
        }
    }

    global.SMPointLighting = SMPointLighting;
})(window);
