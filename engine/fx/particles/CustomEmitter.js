/*
 * SM Engine FX - CustomEmitter
 * Generic reusable particle emitter.
 */
(function (global) {
    'use strict';

    class CustomEmitter extends global.SMParticleEmitter {
        constructor(options = {}) {
            super({
                scene: options.scene,
                name: options.name || 'SM_CustomEmitter',
                position: options.position
            });

            const defaults = global.SMParticlePresets?.default || {};

            this.settings = {
                ...defaults,
                ...options
            };

            this.settings.count = Math.max(1, Math.min(250000, this.settings.count | 0 || 5000));
            this.settings.size = Number(this.settings.size) || 0.3;
            this.settings.opacity = THREE.MathUtils.clamp(Number(this.settings.opacity) || 0.8, 0, 1);
            this.settings.speed = Number(this.settings.speed) || 1;
            this.settings.lifetime = Math.max(0.05, Number(this.settings.lifetime) || 3);
            this.settings.spread = Math.max(0.01, Number(this.settings.spread) || 2.5);
            this.settings.gravity = Number(this.settings.gravity) || 0;

            this.geometry = null;
            this.material = null;
            this.points = null;

            this.positions = null;
            this.velocities = null;
            this.ages = null;
            this.lifetimes = null;
            this.seed = null;

            this._build(this.settings.count);
        }

        _directionVector() {
            const d = this.settings.direction || [0, 1, 0];

            if (d.isVector3) return d.clone().normalize();

            return new THREE.Vector3(
                Number(d[0]) || 0,
                Number(d[1]) || 1,
                Number(d[2]) || 0
            ).normalize();
        }

        _build(count) {
            if (this.points) {
                this.object.remove(this.points);
                this.geometry?.dispose?.();
                this.material?.map?.dispose?.();
                this.material?.dispose?.();
            }

            count = Math.max(1, Math.min(250000, count | 0));
            this.settings.count = count;

            this.positions = new Float32Array(count * 3);
            this.velocities = new Float32Array(count * 3);
            this.ages = new Float32Array(count);
            this.lifetimes = new Float32Array(count);
            this.seed = new Float32Array(count);

            this.geometry = new THREE.BufferGeometry();

            const attr = new THREE.BufferAttribute(this.positions, 3);
            attr.setUsage(THREE.DynamicDrawUsage);
            this.geometry.setAttribute('position', attr);

            this.material = global.SMParticleMaterial.create(this.settings);

            this.points = new THREE.Points(this.geometry, this.material);
            this.points.name = 'SM_CustomEmitterPoints';
            this.points.frustumCulled = false;

            this.object.add(this.points);

            for (let i = 0; i < count; i++) {
                this._resetParticle(i, true);
            }

            this.geometry.attributes.position.needsUpdate = true;
        }

        _resetParticle(i, randomAge = false) {
            const p = i * 3;
            const direction = this._directionVector();

            const random = new THREE.Vector3(
                THREE.MathUtils.randFloatSpread(2),
                THREE.MathUtils.randFloatSpread(2),
                THREE.MathUtils.randFloatSpread(2)
            ).normalize();

            direction.lerp(random, THREE.MathUtils.clamp(this.settings.spread / 10, 0, 0.95)).normalize();

            const radius = Math.random() * this.settings.spread * 0.15;

            this.positions[p] = THREE.MathUtils.randFloatSpread(radius);
            this.positions[p + 1] = THREE.MathUtils.randFloatSpread(radius);
            this.positions[p + 2] = THREE.MathUtils.randFloatSpread(radius);

            const speed = this.settings.speed * THREE.MathUtils.randFloat(0.55, 1.45);

            this.velocities[p] = direction.x * speed;
            this.velocities[p + 1] = direction.y * speed;
            this.velocities[p + 2] = direction.z * speed;

            this.lifetimes[i] = this.settings.lifetime * THREE.MathUtils.randFloat(0.65, 1.3);
            this.ages[i] = randomAge ? Math.random() * this.lifetimes[i] : 0;
            this.seed[i] = Math.random() * Math.PI * 2;
        }

        setCount(value) {
            value = Math.round(THREE.MathUtils.clamp(Number(value) || 1, 1, 250000));
            if (value !== this.settings.count) this._build(value);
        }

        setSize(value) {
            this.settings.size = THREE.MathUtils.clamp(Number(value) || 0.01, 0.01, 20);
            if (this.material) this.material.size = this.settings.size;
        }

        setOpacity(value) {
            this.settings.opacity = THREE.MathUtils.clamp(Number(value) || 0, 0, 1);
            if (this.material) this.material.opacity = this.settings.opacity;
        }

        setSpeed(value) {
            this.settings.speed = Math.max(0, Number(value) || 0);
        }

        setColor(value) {
            this.settings.color = value;
            this.material?.color?.set?.(value);
        }

        setBlending(value) {
            this.settings.blending = value;
            if (this.material) {
                this.material.blending = global.SMParticleMaterial.resolveBlending(value);
                this.material.needsUpdate = true;
            }
        }

        applyPreset(name) {
            const preset = global.SMParticlePresets?.[name];
            if (!preset) return this;

            const oldCount = this.settings.count;
            this.settings = { ...this.settings, ...preset };

            if (this.settings.count !== oldCount) {
                this._build(this.settings.count);
            } else {
                this.setSize(this.settings.size);
                this.setOpacity(this.settings.opacity);
                this.setColor(this.settings.color);
                this.setBlending(this.settings.blending);
            }

            return this;
        }

        getParameters() {
            return { ...this.settings };
        }

        onUpdate(dt, elapsed) {
            const count = this.settings.count;
            const gravity = this.settings.gravity;

            for (let i = 0; i < count; i++) {
                const p = i * 3;

                this.ages[i] += dt;

                if (this.ages[i] >= this.lifetimes[i]) {
                    this._resetParticle(i, false);
                    continue;
                }

                const noise = Math.sin(elapsed * 1.3 + this.seed[i]) * 0.08;

                this.velocities[p + 1] += gravity * dt;

                this.positions[p] += (this.velocities[p] + noise) * dt;
                this.positions[p + 1] += this.velocities[p + 1] * dt;
                this.positions[p + 2] += (this.velocities[p + 2] + noise * 0.75) * dt;
            }

            this.geometry.attributes.position.needsUpdate = true;
        }

        onDispose() {
            this.geometry?.dispose?.();
            this.material?.map?.dispose?.();
            this.material?.dispose?.();

            this.points = null;
            this.geometry = null;
            this.material = null;
        }
    }

    global.SMCustomEmitter = CustomEmitter;
})(window);
