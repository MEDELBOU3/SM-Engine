/**
 * SM Engine - PerformanceMonitor
 * Classic non-module build.
 * Tracks frame timing and renderer statistics without changing scene quality.
 */
class PerformanceMonitor {
    constructor(renderer, options = {}) {
        if (!renderer) throw new Error("PerformanceMonitor: renderer is required.");
        this.renderer = renderer;
        this.options = {
            historySize: 120,
            fpsSmoothing: 0.12,
            spikeThresholdMs: 28,
            sampleIntervalMs: 250,
            ...options
        };
        this.stats = {
            fps: 60,
            averageFPS: 60,
            onePercentLowFPS: 60,
            frameTimeMs: 16.67,
            averageFrameTimeMs: 16.67,
            drawCalls: 0,
            triangles: 0,
            points: 0,
            lines: 0,
            geometries: 0,
            textures: 0,
            programs: 0,
            frameSpikes: 0,
            cpuPressure: 0,
            gpuPressureEstimate: 0
        };
        this.history = {
            fps: [],
            frameTimeMs: []
        };
        this._emaFPS = 60;
        this._emaFrameTime = 16.67;
        this._lastSampleTime = performance.now();
        this._listeners = new Set();
    }

    update(deltaSeconds) {
        if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return this.stats;
        const frameTimeMs = deltaSeconds * 1000;
        const rawFPS = 1 / deltaSeconds;
        const alpha = THREE.MathUtils.clamp(this.options.fpsSmoothing, 0.01, 1);
        this._emaFPS += (rawFPS - this._emaFPS) * alpha;
        this._emaFrameTime += (frameTimeMs - this._emaFrameTime) * alpha;
        this._pushHistory(this.history.fps, rawFPS);
        this._pushHistory(this.history.frameTimeMs, frameTimeMs);
        if (frameTimeMs >= this.options.spikeThresholdMs) this.stats.frameSpikes++;
        this.stats.fps = this._emaFPS;
        this.stats.frameTimeMs = frameTimeMs;
        this.stats.averageFPS = this._average(this.history.fps, 60);
        this.stats.averageFrameTimeMs = this._average(this.history.frameTimeMs, 16.67);
        this.stats.onePercentLowFPS = this._calculateOnePercentLowFPS();
        this._readRendererInfo();
        this._estimatePressure();
        const now = performance.now();
        if (now - this._lastSampleTime >= this.options.sampleIntervalMs) {
            this._lastSampleTime = now;
            this._emit();
        }
        return this.stats;
    }

    _readRendererInfo() {
        const info = this.renderer.info;
        if (!info) return;
        const render = info.render || {};
        const memory = info.memory || {};
        this.stats.drawCalls = render.calls || 0;
        this.stats.triangles = render.triangles || 0;
        this.stats.points = render.points || 0;
        this.stats.lines = render.lines || 0;
        this.stats.geometries = memory.geometries || 0;
        this.stats.textures = memory.textures || 0;
        this.stats.programs = Array.isArray(info.programs) ? info.programs.length : 0;
    }

    _estimatePressure() {
        const frameBudget = 1000 / 60;
        this.stats.cpuPressure = THREE.MathUtils.clamp(this.stats.averageFrameTimeMs / frameBudget, 0, 4);
        const trianglePressure = this.stats.triangles / 2_000_000;
        const drawCallPressure = this.stats.drawCalls / 1500;
        const texturePressure = this.stats.textures / 1500;
        this.stats.gpuPressureEstimate = Math.max(trianglePressure, drawCallPressure, texturePressure);
    }

    _pushHistory(array, value) {
        array.push(value);
        const max = Math.max(10, this.options.historySize | 0);
        while (array.length > max) array.shift();
    }

    _average(array, fallback = 0) {
        if (!array.length) return fallback;
        let sum = 0;
        for (let i = 0; i < array.length; i++) sum += array[i];
        return sum / array.length;
    }

    _calculateOnePercentLowFPS() {
        if (this.history.frameTimeMs.length < 10) return this.stats.averageFPS;
        const sorted = this.history.frameTimeMs.slice().sort((a, b) => b - a);
        const count = Math.max(1, Math.ceil(sorted.length * 0.01));
        let sum = 0;
        for (let i = 0; i < count; i++) sum += sorted[i];
        const worstFrameAverage = sum / count;
        return worstFrameAverage > 0 ? 1000 / worstFrameAverage : 0;
    }

    onSample(callback) {
        if (typeof callback === "function") this._listeners.add(callback);
        return () => this._listeners.delete(callback);
    }

    _emit() {
        const snapshot = this.getSnapshot();
        this._listeners.forEach(callback => {
            try {
                callback(snapshot);
            } catch (error) {
                console.warn("PerformanceMonitor listener error:", error);
            }
        });
    }

    getSnapshot() {
        return {
            ...this.stats,
            fps: Number(this.stats.fps.toFixed(2)),
            averageFPS: Number(this.stats.averageFPS.toFixed(2)),
            onePercentLowFPS: Number(this.stats.onePercentLowFPS.toFixed(2)),
            frameTimeMs: Number(this.stats.frameTimeMs.toFixed(2)),
            averageFrameTimeMs: Number(this.stats.averageFrameTimeMs.toFixed(2))
        };
    }

    reset() {
        this.history.fps.length = 0;
        this.history.frameTimeMs.length = 0;
        this.stats.frameSpikes = 0;
        this._emaFPS = 60;
        this._emaFrameTime = 16.67;
    }

    destroy() {
        this._listeners.clear();
        this.reset();
    }
}

window.PerformanceMonitor = PerformanceMonitor;