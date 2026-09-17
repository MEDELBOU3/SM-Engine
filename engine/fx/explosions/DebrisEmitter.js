/*
 * SM Engine FX - DebrisEmitter
 */
(function (global) {
    'use strict';

    class DebrisEmitter extends global.SMParticleEmitter {
        constructor(options = {}) {
            super({
                scene: options.scene,
                name: options.name || 'SM_DebrisEmitter',
                position: options.position
            });

            this.duration = Math.max(0.1, Number(options.duration) || 2.5);
            this.force = Math.max(0.1, Number(options.force) || 10);
            this.count = Math.max(4, Math.min(150, options.count | 0 || 26));
            this.elapsedLife = 0;
            this.finished = false;
            this.fragments = [];

            const geometry = new THREE.BoxGeometry(0.12, 0.12, 0.12);
            const material = new THREE.MeshStandardMaterial({
                color: options.color ?? 0x6e6256,
                roughness: 0.9,
                metalness: 0.0
            });

            for (let i = 0; i < this.count; i++) {
                const mesh = new THREE.Mesh(geometry, material);
                mesh.scale.setScalar(THREE.MathUtils.randFloat(0.5, 1.6));
                mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);

                const dir = new THREE.Vector3(
                    THREE.MathUtils.randFloatSpread(2),
                    THREE.MathUtils.randFloat(0.35, 1.6),
                    THREE.MathUtils.randFloatSpread(2)
                ).normalize();

                mesh.userData.velocity = dir.multiplyScalar(
                    THREE.MathUtils.randFloat(this.force * 0.35, this.force)
                );

                mesh.userData.angularVelocity = new THREE.Vector3(
                    THREE.MathUtils.randFloatSpread(7),
                    THREE.MathUtils.randFloatSpread(7),
                    THREE.MathUtils.randFloatSpread(7)
                );

                this.object.add(mesh);
                this.fragments.push(mesh);
            }

            this._sharedGeometry = geometry;
            this._sharedMaterial = material;
        }

        onUpdate(dt) {
            if (this.finished) return;

            this.elapsedLife += dt;
            const fadeStart = this.duration * 0.65;
            const fadeT = Math.max(0, (this.elapsedLife - fadeStart) / Math.max(0.001, this.duration - fadeStart));

            for (const fragment of this.fragments) {
                const v = fragment.userData.velocity;
                const av = fragment.userData.angularVelocity;

                v.y -= 9.81 * dt;

                fragment.position.addScaledVector(v, dt);
                fragment.rotation.x += av.x * dt;
                fragment.rotation.y += av.y * dt;
                fragment.rotation.z += av.z * dt;

                if (fragment.position.y < 0) {
                    fragment.position.y = 0;
                    if (v.y < 0) v.y *= -0.25;
                    v.x *= 0.75;
                    v.z *= 0.75;
                }

                fragment.scale.multiplyScalar(1 - fadeT * dt * 1.4);
            }

            if (this.elapsedLife >= this.duration) {
                this.finished = true;
                this.setEnabled(false);
            }
        }

        onDispose() {
            this.fragments.length = 0;
            this._sharedGeometry?.dispose?.();
            this._sharedMaterial?.dispose?.();
        }
    }

    global.SMDebrisEmitter = DebrisEmitter;
})(window);
