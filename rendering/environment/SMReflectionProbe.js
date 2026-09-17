(function (global) {
    'use strict';

    class SMReflectionProbe {
        constructor(options = {}) {
            this.renderer = options.renderer || global.renderer || null;
            this.scene = options.scene || global.scene || null;

            this.resolution = options.resolution ?? 256;
            this.near = options.near ?? 0.1;
            this.far = options.far ?? 1000;

            this.target = null;
            this.camera = null;

            this.position = options.position?.clone?.() || new THREE.Vector3();
        }

        initialize() {
            if (this.camera) return this;

            this.target = new THREE.WebGLCubeRenderTarget(
                this.resolution,
                {
                    generateMipmaps: true,
                    minFilter: THREE.LinearMipmapLinearFilter
                }
            );

            this.target.texture.name = 'SM_ReflectionProbe';

            this.camera = new THREE.CubeCamera(
                this.near,
                this.far,
                this.target
            );

            this.camera.position.copy(this.position);

            this.scene?.add?.(this.camera);

            return this;
        }

        update(position = null) {
            if (!this.camera) this.initialize();

            if (!this.camera || !this.renderer || !this.scene) {
                return null;
            }

            if (position?.isVector3) {
                this.position.copy(position);
                this.camera.position.copy(position);
            }

            const wasVisible = this.camera.visible;
            this.camera.visible = false;

            this.camera.update(
                this.renderer,
                this.scene
            );

            this.camera.visible = wasVisible;

            return this.target.texture;
        }

        get texture() {
            return this.target?.texture || null;
        }

        dispose() {
            if (this.camera) {
                this.scene?.remove?.(this.camera);
            }

            this.target?.dispose?.();

            this.camera = null;
            this.target = null;
        }
    }

    global.SMReflectionProbe = SMReflectionProbe;
})(window);
