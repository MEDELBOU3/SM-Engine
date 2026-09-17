(function (global) {
    'use strict';

    class SMContactShadows {
        constructor(options = {}) {
            this.scene = options.scene || global.scene || null;

            this.mesh = null;

            this.settings = {
                size: options.size ?? 200,
                opacity: options.opacity ?? 0.18,
                y: options.y ?? -0.015
            };
        }

        initialize() {
            if (this.mesh) return this.mesh;
            if (!this.scene) return null;

            const geometry = new THREE.PlaneGeometry(
                this.settings.size,
                this.settings.size
            );

            const material = new THREE.ShadowMaterial({
                color: 0x000000,
                opacity: this.settings.opacity,
                transparent: true,
                depthWrite: false
            });

            this.mesh = new THREE.Mesh(geometry, material);

            this.mesh.name = 'SMContactShadowReceiver';
            this.mesh.rotation.x = -Math.PI / 2;
            this.mesh.position.y = this.settings.y;
            this.mesh.receiveShadow = true;
            this.mesh.castShadow = false;
            this.mesh.renderOrder = -10;

            this.mesh.userData = {
                isSystemObject: true,
                isContactShadowReceiver: true,
                ignoreInHierarchy: true,
                ignoreInTimeline: true,
                excludeFromNanite: true
            };

            this.scene.add(this.mesh);

            return this.mesh;
        }

        setVisible(visible) {
            if (!this.mesh && visible) this.initialize();
            if (this.mesh) this.mesh.visible = !!visible;
        }

        setOpacity(value) {
            this.settings.opacity = THREE.MathUtils.clamp(
                Number(value) || 0,
                0,
                1
            );

            if (this.mesh?.material) {
                this.mesh.material.opacity = this.settings.opacity;
            }
        }

        dispose() {
            if (!this.mesh) return;

            this.scene?.remove?.(this.mesh);
            this.mesh.geometry?.dispose?.();
            this.mesh.material?.dispose?.();

            this.mesh = null;
        }
    }

    global.SMContactShadows = SMContactShadows;
})(window);
