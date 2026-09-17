/*
 * SM Engine FX - SnowEmitter
 * Efficient CPU-simulated / GPU-rendered snow emitter.
 */
(function (global) {
    'use strict';

    class SnowEmitter extends global.SMParticleEmitter {
        constructor(options = {}) {
            super({
                scene: options.scene,
                name: options.name || 'SM_SnowEmitter',
                position: options.position
            });

            this.settings = {
                mode: options.mode || 'normal',
                density: Math.max(100, options.density | 0 || 1000),
                size: Number(options.size) || 0.1,
                speed: Number(options.speed) || 1,
                wind: Number(options.wind) || 0,
                turbulence: Number(options.turbulence) || 0.5,
                area: Number(options.area) || 30,
                height: Number(options.height) || 20
            };

            this.geometry = null;
            this.material = null;
            this.points = null;

            this.positions = null;
            this.seeds = null;

            this._build(this.settings.density);
        }

        _build(count) {
            if (this.points) {
                this.object.remove(this.points);
                this.geometry?.dispose?.();
                this.material?.map?.dispose?.();
                this.material?.dispose?.();
            }

            const density = Math.max(100, Math.min(100000, count | 0));
            this.settings.density = density;

            this.positions = new Float32Array(density * 3);
            this.seeds = new Float32Array(density * 4);

            const halfArea = this.settings.area * 0.5;

            for (let i = 0; i < density; i++) {
                const p = i * 3;
                const s = i * 4;

                this.positions[p] = THREE.MathUtils.randFloat(-halfArea, halfArea);
                this.positions[p + 1] = THREE.MathUtils.randFloat(0, this.settings.height);
                this.positions[p + 2] = THREE.MathUtils.randFloat(-halfArea, halfArea);

                this.seeds[s] = Math.random() * Math.PI * 2;
                this.seeds[s + 1] = THREE.MathUtils.randFloat(0.7, 1.3);
                this.seeds[s + 2] = THREE.MathUtils.randFloat(0.4, 1.0);
                this.seeds[s + 3] = Math.random();
            }

            this.geometry = new THREE.BufferGeometry();
            const attr = new THREE.BufferAttribute(this.positions, 3);
            attr.setUsage(THREE.DynamicDrawUsage);
            this.geometry.setAttribute('position', attr);

            this.material = global.SMSnowMaterial.create({
                size: this.settings.size
            });

            this.points = new THREE.Points(this.geometry, this.material);
            this.points.name = 'SM_SnowPoints';
            this.points.frustumCulled = false;

            this.object.add(this.points);
        }

        setDensity(value) {
            value = Math.round(global.SMFXUtils.clamp(value, 100, 100000));
            if (value !== this.settings.density) this._build(value);
        }

        setSize(value) {
            this.settings.size = global.SMFXUtils.clamp(value, 0.01, 2);
            if (this.material) this.material.size = this.settings.size;
        }

        setSpeed(value) {
            this.settings.speed = global.SMFXUtils.clamp(value, 0, 20);
        }

        setWind(value) {
            this.settings.wind = global.SMFXUtils.clamp(value, -20, 20);
        }

        setTurbulence(value) {
            this.settings.turbulence = global.SMFXUtils.clamp(value, 0, 5);
        }

        setMode(mode) {
            this.settings.mode = mode === 'vortex' ? 'vortex' : 'normal';
        }

        applySettings(settings = {}) {
            if ('density' in settings) this.setDensity(settings.density);
            if ('size' in settings) this.setSize(settings.size);
            if ('speed' in settings) this.setSpeed(settings.speed);
            if ('wind' in settings) this.setWind(settings.wind);
            if ('turbulence' in settings) this.setTurbulence(settings.turbulence);
            if ('mode' in settings) this.setMode(settings.mode);

            if ('area' in settings) this.settings.area = Math.max(1, Number(settings.area) || 30);
            if ('height' in settings) this.settings.height = Math.max(1, Number(settings.height) || 20);
        }

        onUpdate(dt, elapsed) {
            if (!this.positions || !this.points) return;

            const count = this.settings.density;
            const halfArea = this.settings.area * 0.5;
            const height = this.settings.height;
            const speed = this.settings.speed;
            const wind = this.settings.wind;
            const turbulence = this.settings.turbulence;
            const vortex = this.settings.mode === 'vortex';

            for (let i = 0; i < count; i++) {
                const p = i * 3;
                const s = i * 4;

                let x = this.positions[p];
                let y = this.positions[p + 1];
                let z = this.positions[p + 2];

                const phase = this.seeds[s];
                const velocityScale = this.seeds[s + 1];
                const flutter = this.seeds[s + 2];
                const variation = this.seeds[s + 3];

                y -= speed * velocityScale * dt;

                const noiseX = Math.sin(elapsed * (1.4 + variation) + phase + y * 0.08);
                const noiseZ = Math.cos(elapsed * (1.1 + flutter) + phase * 1.7 + x * 0.06);

                x += (wind + noiseX * turbulence * flutter) * dt;
                z += noiseZ * turbulence * 0.55 * dt;

                if (vortex) {
                    const angle = elapsed * (0.9 + variation) + phase;
                    const swirl = (0.7 + turbulence) * dt;
                    x += Math.cos(angle) * swirl;
                    z += Math.sin(angle) * swirl;
                }

                if (y < 0) {
                    y = height + Math.random() * 2;
                    x = THREE.MathUtils.randFloat(-halfArea, halfArea);
                    z = THREE.MathUtils.randFloat(-halfArea, halfArea);
                }

                if (x < -halfArea) x += this.settings.area;
                else if (x > halfArea) x -= this.settings.area;

                if (z < -halfArea) z += this.settings.area;
                else if (z > halfArea) z -= this.settings.area;

                this.positions[p] = x;
                this.positions[p + 1] = y;
                this.positions[p + 2] = z;
            }

            this.geometry.attributes.position.needsUpdate = true;
        }

        onDispose() {
            if (this.points) this.object.remove(this.points);

            this.geometry?.dispose?.();
            this.material?.map?.dispose?.();
            this.material?.dispose?.();

            this.points = null;
            this.geometry = null;
            this.material = null;
            this.positions = null;
            this.seeds = null;
        }
    }

    global.SMSnowEmitter = SnowEmitter;
})(window);
