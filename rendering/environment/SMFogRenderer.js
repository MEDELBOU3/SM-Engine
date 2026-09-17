(function (global) {
    'use strict';

    class SMFogRenderer {
        constructor(scene = global.scene) {
            this.scene = scene || null;
            this.backup = null;
        }

        setLinear(options = {}) {
            if (!this.scene) return null;

            this.scene.fog = new THREE.Fog(
                options.color ?? 0x8a929d,
                options.near ?? 25,
                options.far ?? 180
            );

            return this.scene.fog;
        }

        setExp2(options = {}) {
            if (!this.scene) return null;

            this.scene.fog = new THREE.FogExp2(
                options.color ?? 0x8a929d,
                options.density ?? 0.0025
            );

            return this.scene.fog;
        }

        disable() {
            if (!this.scene) return;

            if (this.backup === null) {
                this.backup = this.scene.fog;
            }

            this.scene.fog = null;
        }

        restore() {
            if (!this.scene) return;

            if (this.backup !== null) {
                this.scene.fog = this.backup;
                this.backup = null;
            }
        }
    }

    global.SMFogRenderer = SMFogRenderer;
})(window);
