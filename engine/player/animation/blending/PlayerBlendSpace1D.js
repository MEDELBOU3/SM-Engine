// SM Engine - PlayerBlendSpace1D Runtime
(function () {
    class PlayerBlendSpace1D {
        constructor(config = {}) {
            this.name = config.name || 'BlendSpace1D';
            this.parameter = config.parameter || 'Speed';
            this.min = Number.isFinite(Number(config.min)) ? Number(config.min) : 0;
            this.max = Number.isFinite(Number(config.max)) ? Number(config.max) : 1;
            this.samples = Array.isArray(config.samples) ? config.samples.map(sample => ({ value: Number(sample.value) || 0, clip: String(sample.clip || ''), playRate: Number.isFinite(Number(sample.playRate)) ? Number(sample.playRate) : 1 })).sort((a, b) => a.value - b.value) : [];
            this.lastResult = null;
        }
        setSamples(samples = []) {
            this.samples = samples.map(sample => ({ value: Number(sample.value) || 0, clip: String(sample.clip || ''), playRate: Number.isFinite(Number(sample.playRate)) ? Number(sample.playRate) : 1 })).sort((a, b) => a.value - b.value);
            return this;
        }
        evaluate(value) {
            const x = Number(value) || 0;
            if (!this.samples.length) return null;
            if (this.samples.length === 1) return { a: this.samples[0], b: this.samples[0], alpha: 0, value: x };
            if (x <= this.samples[0].value) return { a: this.samples[0], b: this.samples[0], alpha: 0, value: x };
            const last = this.samples[this.samples.length - 1];
            if (x >= last.value) return { a: last, b: last, alpha: 0, value: x };
            for (let i = 0; i < this.samples.length - 1; i++) {
                const a = this.samples[i];
                const b = this.samples[i + 1];
                if (x >= a.value && x <= b.value) {
                    const span = Math.max(0.000001, b.value - a.value);
                    const alpha = Math.max(0, Math.min(1, (x - a.value) / span));
                    return { a, b, alpha, value: x };
                }
            }
            return { a: this.samples[0], b: this.samples[0], alpha: 0, value: x };
        }
        update(value, controller) {
            const result = this.evaluate(value);
            this.lastResult = result;
            if (!result || !controller) return result;
            if (typeof controller.applyBlendSpace1D === 'function') {
                controller.applyBlendSpace1D(result.a, result.b, result.alpha);
                return result;
            }
            if (typeof controller.blendActions === 'function') {
                controller.blendActions(result.a.clip, result.b.clip, result.alpha, { playRateA: result.a.playRate, playRateB: result.b.playRate });
                return result;
            }
            return result;
        }
        toJSON() {
            return { version: 1, type: 'SMBlendSpace1D', name: this.name, parameter: this.parameter, min: this.min, max: this.max, samples: this.samples.map(sample => ({ ...sample })) };
        }
        static fromJSON(data) { return new PlayerBlendSpace1D(data || {}); }
    }
    window.PlayerBlendSpace1D = PlayerBlendSpace1D;
})();