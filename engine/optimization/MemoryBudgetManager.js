/**
 * SM Engine - MemoryBudgetManager
 * Classic non-module build.
 * Tracks renderer memory counters and detects suspicious growth / possible leaks.
 * It does NOT dispose assets automatically.
 */
class MemoryBudgetManager {
    constructor(renderer, scene = null, options = {}) {
        if (!renderer) throw new Error("MemoryBudgetManager: renderer is required.");
        this.renderer = renderer;
        this.scene = scene;
        this.options = {
            enabled: true,
            sampleIntervalMs: 1000,
            historySize: 60,
            textureWarning: 1200,
            geometryWarning: 4000,
            programWarning: 250,
            growthWindowSamples: 12,
            leakGrowthThreshold: 8,
            ...options
        };
        this.history = {
            textures: [],
            geometries: [],
            programs: []
        };
        this.stats = {
            textures: 0,
            geometries: 0,
            programs: 0,
            materials: 0,
            renderTargetsEstimate: 0,
            texturePressure: "LOW",
            geometryPressure: "LOW",
            possibleTextureLeak: false,
            possibleGeometryLeak: false,
            lastSampleTime: 0
        };
        this._lastUpdate = 0;
        this._materialSet = new Set();
        this._renderTargetTextureSet = new Set();
    }

    update(force = false) {
        if (!this.options.enabled) return this.stats;
        const now = performance.now();
        if (!force && now - this._lastUpdate < this.options.sampleIntervalMs) return this.stats;
        this._lastUpdate = now;

        const info = this.renderer.info || {};
        const memory = info.memory || {};
        this.stats.textures = memory.textures || 0;
        this.stats.geometries = memory.geometries || 0;
        this.stats.programs = Array.isArray(info.programs) ? info.programs.length : 0;

        if (this.scene) this._scanSceneMemoryReferences();

        this._push(this.history.textures, this.stats.textures);
        this._push(this.history.geometries, this.stats.geometries);
        this._push(this.history.programs, this.stats.programs);

        this.stats.texturePressure = this._pressureLabel(this.stats.textures, this.options.textureWarning);
        this.stats.geometryPressure = this._pressureLabel(this.stats.geometries, this.options.geometryWarning);
        this.stats.possibleTextureLeak = this._detectGrowth(this.history.textures);
        this.stats.possibleGeometryLeak = this._detectGrowth(this.history.geometries);
        this.stats.lastSampleTime = now;

        return this.stats;
    }

    _scanSceneMemoryReferences() {
        this._materialSet.clear();
        this._renderTargetTextureSet.clear();

        this.scene.traverse(object => {
            if (!object) return;

            const materials = Array.isArray(object.material)
                ? object.material
                : object.material
                    ? [object.material]
                    : [];

            for (const material of materials) {
                if (!material) continue;
                this._materialSet.add(material.uuid || material);

                for (const key in material) {
                    const value = material[key];
                    if (value?.isTexture && value.isRenderTargetTexture) {
                        this._renderTargetTextureSet.add(value.uuid || value);
                    }
                }
            }
        });

        this.stats.materials = this._materialSet.size;
        this.stats.renderTargetsEstimate = this._renderTargetTextureSet.size;
    }

    _push(array, value) {
        array.push(value);
        const max = Math.max(10, this.options.historySize | 0);
        while (array.length > max) array.shift();
    }

    _pressureLabel(value, warning) {
        if (warning <= 0) return "LOW";
        const ratio = value / warning;
        if (ratio >= 1.5) return "CRITICAL";
        if (ratio >= 1.0) return "HIGH";
        if (ratio >= 0.7) return "MEDIUM";
        return "LOW";
    }

    _detectGrowth(history) {
        const windowSize = Math.max(4, this.options.growthWindowSamples | 0);
        if (history.length < windowSize) return false;

        const recent = history.slice(-windowSize);
        let increases = 0;
        let totalGrowth = recent[recent.length - 1] - recent[0];

        for (let i = 1; i < recent.length; i++) {
            if (recent[i] > recent[i - 1]) increases++;
        }

        return totalGrowth >= this.options.leakGrowthThreshold &&
            increases >= Math.floor((windowSize - 1) * 0.7);
    }

    getWarnings() {
        const warnings = [];

        if (this.stats.texturePressure === "HIGH" || this.stats.texturePressure === "CRITICAL") {
            warnings.push(`High texture count: ${this.stats.textures}`);
        }

        if (this.stats.geometryPressure === "HIGH" || this.stats.geometryPressure === "CRITICAL") {
            warnings.push(`High geometry count: ${this.stats.geometries}`);
        }

        if (this.stats.programs >= this.options.programWarning) {
            warnings.push(`High shader program count: ${this.stats.programs}`);
        }

        if (this.stats.possibleTextureLeak) {
            warnings.push("Possible texture memory leak detected.");
        }

        if (this.stats.possibleGeometryLeak) {
            warnings.push("Possible geometry memory leak detected.");
        }

        return warnings;
    }

    resetHistory() {
        this.history.textures.length = 0;
        this.history.geometries.length = 0;
        this.history.programs.length = 0;
        this.stats.possibleTextureLeak = false;
        this.stats.possibleGeometryLeak = false;
    }

    setEnabled(enabled) {
        this.options.enabled = !!enabled;
    }

    getStats() {
        return {
            ...this.stats,
            warnings: this.getWarnings()
        };
    }

    destroy() {
        this.resetHistory();
        this._materialSet.clear();
        this._renderTargetTextureSet.clear();
    }
}

window.MemoryBudgetManager = MemoryBudgetManager;