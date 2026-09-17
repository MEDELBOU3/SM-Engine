/*
 * SM Engine FX - SmokeEmitter
 */
(function (global) {
    'use strict';

    class SmokeEmitter extends global.SMParticleEmitter {
        constructor(options = {}) {
            super({
                scene: options.scene,
                name: options.name || 'SM_SmokeEmitter',
                position: options.position
            });

            this.duration = Math.max(0.2, Number(options.duration) || 4.0);
            this.density = Math.max(0, Number(options.density) || 0.6);
            this.speed = Math.max(0.05, Number(options.speed) || 2.0);
            this.radius = Math.max(0.2, Number(options.size) || 5.0);
            this.count = Math.max(32, Math.min(6000, options.count | 0 || Math.round(500 * this.density)));
            this.elapsedLife = 0;
            this.finished = false;

            this.positions = new Float32Array(this.count * 3);
            this.velocities = new Float32Array(this.count * 3);
            this.seed = new Float32Array(this.count);

            this.geometry = new THREE.BufferGeometry();
            const attr = new THREE.BufferAttribute(this.positions, 3);
            attr.setUsage(THREE.DynamicDrawUsage);
            this.geometry.setAttribute('position', attr);

            this.material = new THREE.PointsMaterial({
                color: options.color ?? 0x5a5a5a,
                size: Math.max(0.12, this.radius * 0.22),
                map: this._createTexture(),
                transparent: true,
                opacity: 0.55,
                alphaTest: 0.015,
                depthWrite: false,
                blending: THREE.NormalBlending,
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
            const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
            g.addColorStop(0, 'rgba(255,255,255,.82)');
            g.addColorStop(0.5, 'rgba(205,205,205,.45)');
            g.addColorStop(1, 'rgba(120,120,120,0)');
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, 64, 64);
            return new THREE.CanvasTexture(canvas);
        }

        _seedParticles() {
            for (let i = 0; i < this.count; i++) {
                const p = i * 3;
                const a = Math.random() * Math.PI * 2;
                const r = Math.sqrt(Math.random()) * this.radius * 0.35;

                this.positions[p] = Math.cos(a) * r;
                this.positions[p + 1] = Math.random() * this.radius * 0.15;
                this.positions[p + 2] = Math.sin(a) * r;

                this.velocities[p] = THREE.MathUtils.randFloatSpread(0.6);
                this.velocities[p + 1] = this.speed * THREE.MathUtils.randFloat(0.6, 1.5);
                this.velocities[p + 2] = THREE.MathUtils.randFloatSpread(0.6);

                this.seed[i] = Math.random() * Math.PI * 2;
            }
        }

        onUpdate(dt) {
            if (this.finished) return;

            this.elapsedLife += dt;
            const t = this.elapsedLife / this.duration;

            for (let i = 0; i < this.count; i++) {
                const p = i * 3;
                const phase = this.seed[i];

                this.positions[p] += (this.velocities[p] + Math.sin(this.elapsedLife * 1.3 + phase) * 0.22) * dt;
                this.positions[p + 1] += this.velocities[p + 1] * dt;
                this.positions[p + 2] += (this.velocities[p + 2] + Math.cos(this.elapsedLife * 1.1 + phase) * 0.22) * dt;
            }

            this.geometry.attributes.position.needsUpdate = true;

            const fadeIn = Math.min(1, this.elapsedLife / 0.25);
            const fadeOut = Math.max(0, 1 - t);
            this.material.opacity = 0.55 * fadeIn * fadeOut;
            this.material.size = Math.max(0.1, this.radius * 0.22 * (1 + t * 1.6));

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

    global.SMSmokeEmitter = SmokeEmitter;
})(window);
