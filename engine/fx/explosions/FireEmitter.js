/*
 * SM Engine FX - FireEmitter
 * Lightweight layered point-sprite fire burst.
 */
(function (global) {
    'use strict';

    class FireEmitter extends global.SMParticleEmitter {
        constructor(options = {}) {
            super({
                scene: options.scene,
                name: options.name || 'SM_FireEmitter',
                position: options.position
            });

            this.duration = Math.max(0.1, Number(options.duration) || 2.0);
            this.intensity = Math.max(0, Number(options.intensity) || 0.8);
            this.radius = Math.max(0.2, Number(options.size) || 5);
            this.count = Math.max(64, Math.min(8000, options.count | 0 || Math.round(900 * this.intensity)));
            this.elapsedLife = 0;
            this.finished = false;

            this.positions = new Float32Array(this.count * 3);
            this.velocities = new Float32Array(this.count * 3);
            this.seed = new Float32Array(this.count);

            this.geometry = new THREE.BufferGeometry();
            const attr = new THREE.BufferAttribute(this.positions, 3);
            attr.setUsage(THREE.DynamicDrawUsage);
            this.geometry.setAttribute('position', attr);

            const texture = this._createTexture();

            this.material = new THREE.PointsMaterial({
                color: options.color ?? 0xff6a22,
                size: Math.max(0.08, this.radius * 0.15),
                map: texture,
                transparent: true,
                opacity: 0.92,
                alphaTest: 0.02,
                depthWrite: false,
                blending: THREE.AdditiveBlending,
                sizeAttenuation: true
            });

            this.points = new THREE.Points(this.geometry, this.material);
            this.points.frustumCulled = false;
            this.object.add(this.points);

            this._seedParticles();
        }

        _createTexture() {
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = 64;
            const ctx = canvas.getContext('2d');
            const c = 32;
            const g = ctx.createRadialGradient(c, c, 1, c, c, 31);
            g.addColorStop(0, 'rgba(255,255,210,1)');
            g.addColorStop(0.25, 'rgba(255,190,60,.98)');
            g.addColorStop(0.62, 'rgba(255,80,10,.72)');
            g.addColorStop(1, 'rgba(255,40,0,0)');
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, 64, 64);
            return new THREE.CanvasTexture(canvas);
        }

        _seedParticles() {
            for (let i = 0; i < this.count; i++) {
                const p = i * 3;

                const dir = new THREE.Vector3(
                    THREE.MathUtils.randFloatSpread(2),
                    THREE.MathUtils.randFloat(-0.2, 1.3),
                    THREE.MathUtils.randFloatSpread(2)
                ).normalize();

                const spread = THREE.MathUtils.randFloat(0.1, this.radius * 0.45);
                const speed = THREE.MathUtils.randFloat(this.radius * 0.3, this.radius * 1.6);

                this.positions[p] = dir.x * spread;
                this.positions[p + 1] = dir.y * spread * 0.45;
                this.positions[p + 2] = dir.z * spread;

                this.velocities[p] = dir.x * speed;
                this.velocities[p + 1] = Math.abs(dir.y) * speed + this.radius * 0.7;
                this.velocities[p + 2] = dir.z * speed;

                this.seed[i] = Math.random();
            }
        }

        onUpdate(dt) {
            if (this.finished) return;

            this.elapsedLife += dt;
            const t = this.elapsedLife / this.duration;

            for (let i = 0; i < this.count; i++) {
                const p = i * 3;
                const wobble = Math.sin(this.elapsedLife * (4 + this.seed[i] * 4) + i * 0.17);

                this.positions[p] += (this.velocities[p] + wobble * 0.45) * dt;
                this.positions[p + 1] += this.velocities[p + 1] * dt;
                this.positions[p + 2] += (this.velocities[p + 2] + wobble * 0.35) * dt;

                this.velocities[p] *= Math.pow(0.97, dt * 60);
                this.velocities[p + 1] += 0.4 * dt;
                this.velocities[p + 2] *= Math.pow(0.97, dt * 60);
            }

            this.geometry.attributes.position.needsUpdate = true;
            this.material.opacity = Math.max(0, (1 - t) * 0.95);
            this.material.size = Math.max(0.02, this.radius * 0.15 * (1 + t * 0.7));

            if (this.elapsedLife >= this.duration) {
                this.finished = true;
                this.setEnabled(false);
            }
        }

        onDispose() {
            this.geometry?.dispose?.();
            this.material?.map?.dispose?.();
            this.material?.dispose?.();
        }
    }

    global.SMFireEmitter = FireEmitter;
})(window);
