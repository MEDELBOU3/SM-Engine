// SM Engine - PlayerBlendSpace2D Runtime
// Samples are blended with triangle barycentric weights when the input is
// inside the authored field, then fall back to the nearest segment outside it.
(function () {
    class PlayerBlendSpace2D {
        constructor(config = {}) {
            this.name = config.name || 'BlendSpace2D';
            this.parameterX = config.parameterX || 'Direction';
            this.parameterY = config.parameterY || 'Speed';
            this.minX = Number.isFinite(Number(config.minX)) ? Number(config.minX) : -180;
            this.maxX = Number.isFinite(Number(config.maxX)) ? Number(config.maxX) : 180;
            this.minY = Number.isFinite(Number(config.minY)) ? Number(config.minY) : 0;
            this.maxY = Number.isFinite(Number(config.maxY)) ? Number(config.maxY) : 1;
            this.samples = [];
            this.lastResult = null;
            this.setSamples(config.samples || []);
        }
        _sample(sample, index) {
            return {
                id: sample?.id || `blend2d_${index}`,
                x: Number.isFinite(Number(sample?.x ?? sample?.valueX)) ? Number(sample.x ?? sample.valueX) : 0,
                y: Number.isFinite(Number(sample?.y ?? sample?.valueY)) ? Number(sample.y ?? sample.valueY) : 0,
                clip: String(sample?.clip || ''),
                playRate: Number.isFinite(Number(sample?.playRate)) ? Number(sample.playRate) : 1,
                loop: sample?.loop !== false
            };
        }
        setSamples(samples = []) {
            this.samples = (Array.isArray(samples) ? samples : [])
                .map((sample, index) => this._sample(sample, index))
                .filter(sample => sample.clip);
            return this;
        }
        _triangleWeights(a, b, c, x, y) {
            const denominator = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y);
            if (Math.abs(denominator) < 0.000001) return null;
            const wa = ((b.y - c.y) * (x - c.x) + (c.x - b.x) * (y - c.y)) / denominator;
            const wb = ((c.y - a.y) * (x - c.x) + (a.x - c.x) * (y - c.y)) / denominator;
            const wc = 1 - wa - wb;
            if (wa < -0.0001 || wb < -0.0001 || wc < -0.0001) return null;
            return [Math.max(0, wa), Math.max(0, wb), Math.max(0, wc)];
        }
        _nearestSegment(x, y) {
            let best = null;
            for (let i = 0; i < this.samples.length - 1; i++) {
                for (let j = i + 1; j < this.samples.length; j++) {
                    const a = this.samples[i];
                    const b = this.samples[j];
                    const dx = b.x - a.x;
                    const dy = b.y - a.y;
                    const lengthSq = dx * dx + dy * dy;
                    if (lengthSq < 0.000001) continue;
                    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / lengthSq));
                    const px = a.x + dx * t;
                    const py = a.y + dy * t;
                    const distanceSq = (x - px) ** 2 + (y - py) ** 2;
                    if (!best || distanceSq < best.distanceSq) best = { a, b, t, distanceSq };
                }
            }
            return best;
        }
        _result(targets, x, y) {
            const merged = new Map();
            targets.forEach(target => {
                if (!target?.sample?.clip || target.weight <= 0) return;
                const key = target.sample.clip;
                const current = merged.get(key) || { ...target.sample, weight: 0 };
                current.weight += target.weight;
                merged.set(key, current);
            });
            const normalized = [...merged.values()];
            const total = normalized.reduce((sum, target) => sum + target.weight, 0);
            if (total > 0) normalized.forEach(target => target.weight /= total);
            return { x, y, targets: normalized };
        }
        evaluate(valueX, valueY) {
            const x = Number(valueX) || 0;
            const y = Number(valueY) || 0;
            if (!this.samples.length) return null;
            if (this.samples.length === 1) return this._result([{ sample: this.samples[0], weight: 1 }], x, y);
            const exact = this.samples.find(sample => (sample.x - x) ** 2 + (sample.y - y) ** 2 < 0.00000001);
            if (exact) return this._result([{ sample: exact, weight: 1 }], x, y);
            for (let i = 0; i < this.samples.length - 2; i++) {
                for (let j = i + 1; j < this.samples.length - 1; j++) {
                    for (let k = j + 1; k < this.samples.length; k++) {
                        const weights = this._triangleWeights(this.samples[i], this.samples[j], this.samples[k], x, y);
                        if (weights) return this._result([
                            { sample: this.samples[i], weight: weights[0] },
                            { sample: this.samples[j], weight: weights[1] },
                            { sample: this.samples[k], weight: weights[2] }
                        ], x, y);
                    }
                }
            }
            const segment = this._nearestSegment(x, y);
            if (segment) return this._result([
                { sample: segment.a, weight: 1 - segment.t },
                { sample: segment.b, weight: segment.t }
            ], x, y);
            return this._result([{ sample: this.samples[0], weight: 1 }], x, y);
        }
        update(valueX, valueY, controller, options = {}) {
            const result = this.evaluate(valueX, valueY);
            this.lastResult = result;
            if (result?.targets?.length && typeof controller?.applyBlendSpace2D === 'function') {
                controller.applyBlendSpace2D(result.targets, options);
            }
            return result;
        }
        toJSON() {
            return {
                version: 1,
                type: 'SMBlendSpace2D',
                name: this.name,
                parameterX: this.parameterX,
                parameterY: this.parameterY,
                minX: this.minX, maxX: this.maxX, minY: this.minY, maxY: this.maxY,
                samples: this.samples.map(sample => ({ ...sample }))
            };
        }
        static fromJSON(data) { return new PlayerBlendSpace2D(data || {}); }
    }
    window.PlayerBlendSpace2D = PlayerBlendSpace2D;
})();
