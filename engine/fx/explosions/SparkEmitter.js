/*
 * SM Engine FX - SparkEmitter
 */
(function (global) {
    'use strict';

    class SparkEmitter extends global.SMParticleEmitter {
        constructor(options = {}) {
            super({
                scene: options.scene,
                name: options.name || 'SM_SparkEmitter',
                position: options.position
            });

            this.duration = Math.max(0.05, Number(options.duration) || 1.2);
            this.force = Math.max(0.1, Number(options.force) || 10);
            this.count = Math.max(16, Math.min(5000, options.count | 0 || 280));
            this.elapsedLife = 0;
            this.finished = false;

            this.positions = new Float32Array(this.count * 3);
            this.velocities = new Float32Array(this.count * 3);
            this.life = new Float32Array(this.count);

            this.geometry = new THREE.BufferGeometry();
            const positionAttr = new THREE.BufferAttribute(this.positions, 3);
            positionAttr.setUsage(THREE.DynamicDrawUsage);
            this.geometry.setAttribute('position', positionAttr);

            this.material = new THREE.PointsMaterial({
                color: new THREE.Color(options.color ?? 0xffcc33),
                size: Number(options.size) || 0.08,
                transparent: true,
                opacity: 1,
                depthWrite: false,
                blending: THREE.AdditiveBlending,
                sizeAttenuation: true
            });

            this.points = new THREE.Points(this.geometry, this.material);
            this.points.frustumCulled = false;
            this.object.add(this.points);

            this._seed();
        }

        _seed() {
            for (let i = 0; i < this.count; i++) {
                const p = i * 3;

                const dir = new THREE.Vector3(
                    THREE.MathUtils.randFloatSpread(2),
                    THREE.MathUtils.randFloat(0.25, 1.5),
                    THREE.MathUtils.randFloatSpread(2)
                ).normalize();

                const speed = THREE.MathUtils.randFloat(this.force * 0.45, this.force * 1.15);

                this.positions[p] = 0;
                this.positions[p + 1] = 0;
                this.positions[p + 2] = 0;

                this.velocities[p] = dir.x * speed;
                this.velocities[p + 1] = dir.y * speed;
                this.velocities[p + 2] = dir.z * speed;

                this.life[i] = THREE.MathUtils.randFloat(0.45, 1.0);
            }
        }

        onUpdate(dt) {
            if (this.finished) return;

            this.elapsedLife += dt;
            const lifeT = this.elapsedLife / this.duration;

            for (let i = 0; i < this.count; i++) {
                const p = i * 3;

                this.velocities[p + 1] -= 9.81 * dt;

                this.positions[p] += this.velocities[p] * dt;
                this.positions[p + 1] += this.velocities[p + 1] * dt;
                this.positions[p + 2] += this.velocities[p + 2] * dt;

                this.velocities[p] *= Math.pow(0.985, dt * 60);
                this.velocities[p + 2] *= Math.pow(0.985, dt * 60);
            }

            this.geometry.attributes.position.needsUpdate = true;
            this.material.opacity = Math.max(0, 1 - lifeT);

            if (this.elapsedLife >= this.duration) {
                this.finished = true;
                this.setEnabled(false);
            }
        }

        onDispose() {
            this.geometry?.dispose?.();
            this.material?.dispose?.();
        }
    }

    global.SMSparkEmitter = SparkEmitter;
})(window);
