(function (global) {
    'use strict';

    class SMBloom {
        constructor(options = {}) {
            this.options = {
                enabled: options.enabled !== false,
                strength: options.strength ?? 0.26,
                radius: options.radius ?? 0.32,
                threshold: options.threshold ?? 0.96
            };

            this.pass = null;
        }

        create(width, height) {
            if (typeof THREE.UnrealBloomPass === 'undefined') {
                console.warn('[SMBloom] THREE.UnrealBloomPass is unavailable.');
                return null;
            }

            this.pass = new THREE.UnrealBloomPass(
                new THREE.Vector2(
                    Math.max(1, width | 0),
                    Math.max(1, height | 0)
                ),
                this.options.strength,
                this.options.radius,
                this.options.threshold
            );

            this.pass.enabled = this.options.enabled;

            return this.pass;
        }

        apply(options = {}) {
            Object.assign(this.options, options);

            if (!this.pass) return;

            this.pass.enabled = this.options.enabled !== false;
            this.pass.strength = this.options.strength;
            this.pass.radius = this.options.radius;
            this.pass.threshold = this.options.threshold;
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

    global.SMBloom = SMBloom;
})(window);
