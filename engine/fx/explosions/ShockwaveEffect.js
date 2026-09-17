/*
 * SM Engine FX - ShockwaveEffect
 */
(function (global) {
    'use strict';

    class ShockwaveEffect {
        constructor(options = {}) {
            this.scene = global.SMFXUtils?.resolveScene(options.scene) || options.scene || null;
            this.duration = Math.max(0.1, Number(options.duration) || 0.9);
            this.maxRadius = Math.max(0.5, Number(options.radius) || 8);
            this.elapsed = 0;
            this.finished = false;

            const geometry = new THREE.RingGeometry(0.92, 1.0, 96);
            const material = new THREE.MeshBasicMaterial({
                color: options.color ?? 0x66d9ff,
                transparent: true,
                opacity: 0.62,
                side: THREE.DoubleSide,
                depthWrite: false,
                blending: THREE.AdditiveBlending
            });

            this.mesh = new THREE.Mesh(geometry, material);
            this.mesh.name = 'SM_Shockwave';
            this.mesh.rotation.x = -Math.PI * 0.5;
            this.mesh.scale.setScalar(0.05);
            if (options.position) this.mesh.position.copy(options.position);

            this.scene?.add?.(this.mesh);
        }

        update(dt) {
            if (this.finished) return;

            this.elapsed += dt;
            const t = THREE.MathUtils.clamp(this.elapsed / this.duration, 0, 1);
            const eased = 1 - Math.pow(1 - t, 3);

            const scale = THREE.MathUtils.lerp(0.05, this.maxRadius, eased);
            this.mesh.scale.setScalar(scale);
            this.mesh.material.opacity = (1 - t) * 0.62;

            if (t >= 1) {
                this.finished = true;
                this.mesh.visible = false;
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

    global.SMShockwaveEffect = ShockwaveEffect;
})(window);
