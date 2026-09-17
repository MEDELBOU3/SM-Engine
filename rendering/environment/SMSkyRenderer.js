(function (global) {
    'use strict';

    class SMSkyRenderer {
        constructor(options = {}) {
            this.scene = options.scene || global.scene || null;
            this.sky = null;
            this.sunDirection = new THREE.Vector3(0.3, 0.8, 0.2).normalize();

            this.settings = {
                turbidity: options.turbidity ?? 6,
                rayleigh: options.rayleigh ?? 2,
                mieCoefficient: options.mieCoefficient ?? 0.005,
                mieDirectionalG: options.mieDirectionalG ?? 0.8,
                elevation: options.elevation ?? 35,
                azimuth: options.azimuth ?? 140
            };
        }

        initialize() {
            if (this.sky) return this.sky;
            if (!this.scene) return null;

            if (typeof THREE.Sky === 'undefined') {
                return null;
            }

            this.sky = new THREE.Sky();
            this.sky.name = 'SM_Sky';
            this.sky.scale.setScalar(450000);

            this.sky.userData = {
                isSystemObject: true,
                ignoreInHierarchy: true,
                excludeFromNanite: true
            };

            this.scene.add(this.sky);

            this.applySettings(this.settings);

            return this.sky;
        }

        applySettings(options = {}) {
            Object.assign(this.settings, options);

            if (!this.sky) {
                this.initialize();
            }

            if (!this.sky) return false;

            const uniforms = this.sky.material.uniforms;

            if (uniforms.turbidity) {
                uniforms.turbidity.value = this.settings.turbidity;
            }

            if (uniforms.rayleigh) {
                uniforms.rayleigh.value = this.settings.rayleigh;
            }

            if (uniforms.mieCoefficient) {
                uniforms.mieCoefficient.value = this.settings.mieCoefficient;
            }

            if (uniforms.mieDirectionalG) {
                uniforms.mieDirectionalG.value = this.settings.mieDirectionalG;
            }

            const phi = THREE.MathUtils.degToRad(
                90 - this.settings.elevation
            );

            const theta = THREE.MathUtils.degToRad(
                this.settings.azimuth
            );

            this.sunDirection.setFromSphericalCoords(
                1,
                phi,
                theta
            );

            uniforms.sunPosition?.value?.copy?.(
                this.sunDirection
            );

            return true;
        }

        setVisible(visible) {
            if (!this.sky && visible) this.initialize();
            if (this.sky) this.sky.visible = !!visible;
        }

        dispose() {
            if (!this.sky) return;

            this.scene?.remove?.(this.sky);
            this.sky.geometry?.dispose?.();
            this.sky.material?.dispose?.();

            this.sky = null;
        }
    }

    global.SMSkyRenderer = SMSkyRenderer;
})(window);
