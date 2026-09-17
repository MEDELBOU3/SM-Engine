(function (global) {
    'use strict';

    class SMAmbientOcclusion {
        constructor(options = {}) {
            this.scene = options.scene || global.scene || null;
            this.camera = options.camera || global.camera || null;

            this.options = {
                enabled: options.enabled !== false,
                kernelRadius: options.kernelRadius ?? 10,
                minDistance: options.minDistance ?? 0.0025,
                maxDistance: options.maxDistance ?? 0.09
            };

            this.pass = null;
        }

        create(width, height) {
            if (typeof THREE.SSAOPass === 'undefined') {
                console.warn('[SMAmbientOcclusion] THREE.SSAOPass is unavailable.');
                return null;
            }

            this.pass = new THREE.SSAOPass(
                this.scene,
                this.camera,
                Math.max(1, width | 0),
                Math.max(1, height | 0)
            );

            this.apply(this.options);

            return this.pass;
        }

        apply(options = {}) {
            Object.assign(this.options, options);

            if (!this.pass) return;

            this.pass.enabled = this.options.enabled !== false;
            this.pass.kernelRadius = this.options.kernelRadius;
            this.pass.minDistance = this.options.minDistance;
            this.pass.maxDistance = this.options.maxDistance;
        }

        setCamera(camera) {
            this.camera = camera || this.camera;
            if (this.pass && this.camera) {
                this.pass.camera = this.camera;
            }
        }

        setSize(width, height) {
            this.pass?.setSize?.(
                Math.max(1, width | 0),
                Math.max(1, height | 0)
            );
        }

        dispose() {
            this.pass?.dispose?.();
            this.pass = null;
        }
    }

    global.SMAmbientOcclusion = SMAmbientOcclusion;
})(window);
