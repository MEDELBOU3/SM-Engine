(function (global) {
    'use strict';

    class SMHDRIManager {
        constructor(options = {}) {
            this.renderer = options.renderer || global.renderer || null;
            this.scene = options.scene || global.scene || null;

            this.loader = null;
            this.pmrem = null;

            this.current = null;
            this.environment = null;
        }

        initialize() {
            if (!this.renderer) return this;

            if (typeof THREE.PMREMGenerator === 'function') {
                this.pmrem = new THREE.PMREMGenerator(this.renderer);
                this.pmrem.compileEquirectangularShader?.();
            }

            if (typeof THREE.RGBELoader !== 'undefined') {
                this.loader = new THREE.RGBELoader();
            }

            return this;
        }

        async load(url, options = {}) {
            if (!url) return null;
            if (!this.loader) this.initialize();

            if (!this.loader) {
                throw new Error(
                    '[SMHDRIManager] THREE.RGBELoader is unavailable.'
                );
            }

            const texture = await new Promise((resolve, reject) => {
                this.loader.load(
                    url,
                    resolve,
                    undefined,
                    reject
                );
            });

            texture.mapping = THREE.EquirectangularReflectionMapping;

            const environmentTexture =
                this.pmrem
                    ? this.pmrem.fromEquirectangular(texture).texture
                    : texture;

            this.apply(texture, environmentTexture, options);

            return {
                texture,
                environmentTexture
            };
        }

        apply(backgroundTexture, environmentTexture, options = {}) {
            if (!this.scene) return false;

            this.disposeCurrent(false);

            this.current = backgroundTexture || null;
            this.environment =
                environmentTexture ||
                backgroundTexture ||
                null;

            if (options.background !== false) {
                this.scene.background = this.current;
            }

            if (options.environment !== false) {
                this.scene.environment = this.environment;
            }

            if ('backgroundIntensity' in this.scene) {
                this.scene.backgroundIntensity =
                    options.backgroundIntensity ?? 1;
            }

            if ('environmentIntensity' in this.scene) {
                this.scene.environmentIntensity =
                    options.environmentIntensity ?? 1;
            }

            global.smActiveHDRI = {
                texture: this.current,
                environmentTexture: this.environment,
                intensity: options.environmentIntensity ?? 1
            };

            global.dispatchEvent?.(
                new CustomEvent('sm:hdri-environment-changed', {
                    detail: {
                        texture: this.current,
                        environmentTexture: this.environment
                    }
                })
            );

            return true;
        }

        clear() {
            if (!this.scene) return;

            if (
                this.scene.background === this.current
            ) {
                this.scene.background = null;
            }

            if (
                this.scene.environment === this.environment
            ) {
                this.scene.environment = null;
            }

            this.disposeCurrent();
            global.smActiveHDRI = null;
        }

        disposeCurrent(disposeTextures = true) {
            if (disposeTextures) {
                if (
                    this.environment &&
                    this.environment !== this.current
                ) {
                    this.environment.dispose?.();
                }

                this.current?.dispose?.();
            }

            this.current = null;
            this.environment = null;
        }

        dispose() {
            this.clear();
            this.pmrem?.dispose?.();
            this.pmrem = null;
        }
    }

    global.SMHDRIManager = SMHDRIManager;
})(window);
