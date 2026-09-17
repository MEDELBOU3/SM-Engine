/*
 * SM Engine FX - ParticlePool
 * Reusable typed-array particle storage.
 */
(function (global) {
    'use strict';

    class ParticlePool {
        constructor(capacity = 1000) {
            this.capacity = Math.max(1, capacity | 0);
            this.count = 0;

            this.positions = new Float32Array(this.capacity * 3);
            this.velocities = new Float32Array(this.capacity * 3);
            this.ages = new Float32Array(this.capacity);
            this.lifetimes = new Float32Array(this.capacity);
            this.sizes = new Float32Array(this.capacity);
            this.alive = new Uint8Array(this.capacity);

            this._free = [];
            for (let i = this.capacity - 1; i >= 0; --i) this._free.push(i);
        }

        spawn(config = {}) {
            if (!this._free.length) return -1;

            const i = this._free.pop();
            const p = i * 3;

            const position = config.position || { x: 0, y: 0, z: 0 };
            const velocity = config.velocity || { x: 0, y: 0, z: 0 };

            this.positions[p] = position.x || 0;
            this.positions[p + 1] = position.y || 0;
            this.positions[p + 2] = position.z || 0;

            this.velocities[p] = velocity.x || 0;
            this.velocities[p + 1] = velocity.y || 0;
            this.velocities[p + 2] = velocity.z || 0;

            this.ages[i] = 0;
            this.lifetimes[i] = Math.max(0.001, Number(config.lifetime) || 1);
            this.sizes[i] = Number(config.size) || 1;
            this.alive[i] = 1;
            this.count++;

            return i;
        }

        kill(index) {
            if (index < 0 || index >= this.capacity || !this.alive[index]) return;
            this.alive[index] = 0;
            this.ages[index] = 0;
            this.count--;
            this._free.push(index);
        }

        update(deltaTime, updater) {
            for (let i = 0; i < this.capacity; i++) {
                if (!this.alive[i]) continue;

                this.ages[i] += deltaTime;
                if (this.ages[i] >= this.lifetimes[i]) {
                    this.kill(i);
                    continue;
                }

                updater?.(i, deltaTime, this);
            }
        }

        clear() {
            this.count = 0;
            this._free.length = 0;

            for (let i = this.capacity - 1; i >= 0; --i) {
                this.alive[i] = 0;
                this.ages[i] = 0;
                this._free.push(i);
            }
        }
    }

    global.SMParticlePool = ParticlePool;
})(window);
