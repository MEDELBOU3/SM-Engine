/**
 * SM Engine - DynamicResolutionManager
 * Classic non-module build.
 * Adaptive renderer pixel ratio with smoothing, hysteresis and cooldown.
 */
class DynamicResolutionManager {
    constructor(renderer, options = {}) {
        if (!renderer) throw new Error("DynamicResolutionManager: renderer is required.");
        this.renderer = renderer;
        this.options = {
            enabled: true,
            targetFPS: 60,
            lowerFPSThreshold: 54,
            upperFPSThreshold: 61,
            minScale: 0.6,
            maxScale: 1.0,
            stepDown: 0.05,
            stepUp: 0.025,
            cooldownMs: 700,
            emergencyFPS: 35,
            emergencyStepDown: 0.10,
            smoothing: 0.15,
            basePixelRatio: null,
            ...options
        };
        // Respect the pixel-ratio cap already selected by the engine bootstrap.
        // Do not jump back to raw devicePixelRatio on high-DPI displays.
        const rendererRatio =
            typeof renderer.getPixelRatio === "function"
                ? renderer.getPixelRatio()
                : Math.min(window.devicePixelRatio || 1, 1.75);
        this.nativePixelRatio = Math.max(0.1, rendererRatio || 1);
        this.basePixelRatio = Number.isFinite(this.options.basePixelRatio)
            ? Math.max(0.1, this.options.basePixelRatio)
            : this.nativePixelRatio;
        this.currentScale = THREE.MathUtils.clamp(
            this.options.maxScale,
            this.options.minScale,
            this.options.maxScale
        );
        this.currentFPS = this.options.targetFPS;
        this._smoothedFPS = this.options.targetFPS;
        this._lastChangeTime = 0;
        this._lastAppliedPixelRatio = null;
        this.stats = {
            fps: this.currentFPS,
            scale: this.currentScale,
            pixelRatio: this.basePixelRatio * this.currentScale,
            qualityDirection: "STABLE",
            changes: 0
        };
        this._applyScale(true);
    }

    update(metricsOrDelta) {
        if (!this.options.enabled) return this.stats;
        const fps = this._extractFPS(metricsOrDelta);
        if (!Number.isFinite(fps) || fps <= 0) return this.stats;
        const alpha = THREE.MathUtils.clamp(this.options.smoothing, 0.01, 1);
        this._smoothedFPS += (fps - this._smoothedFPS) * alpha;
        this.currentFPS = this._smoothedFPS;
        const now = performance.now();
        const cooldownPassed =
            now - this._lastChangeTime >= this.options.cooldownMs;
        let nextScale = this.currentScale;
        let direction = "STABLE";
        if (cooldownPassed) {
            if (this.currentFPS <= this.options.emergencyFPS) {
                nextScale -= this.options.emergencyStepDown;
                direction = "DOWN_EMERGENCY";
            } else if (this.currentFPS < this.options.lowerFPSThreshold) {
                nextScale -= this.options.stepDown;
                direction = "DOWN";
            } else if (this.currentFPS > this.options.upperFPSThreshold) {
                nextScale += this.options.stepUp;
                direction = "UP";
            }
        }
        nextScale = THREE.MathUtils.clamp(
            nextScale,
            this.options.minScale,
            this.options.maxScale
        );
        if (Math.abs(nextScale - this.currentScale) >= 0.001) {
            this.currentScale = nextScale;
            this._lastChangeTime = now;
            this.stats.changes++;
            this._applyScale();
        } else {
            direction = "STABLE";
        }
        this.stats.fps = this.currentFPS;
        this.stats.scale = this.currentScale;
        this.stats.pixelRatio = this.basePixelRatio * this.currentScale;
        this.stats.qualityDirection = direction;
        return this.stats;
    }

    _extractFPS(metricsOrDelta) {
        if (typeof metricsOrDelta === "number") {
            if (metricsOrDelta > 0 && metricsOrDelta < 1) {
                return 1 / metricsOrDelta;
            }
            return metricsOrDelta;
        }
        if (metricsOrDelta && typeof metricsOrDelta === "object") {
            if (Number.isFinite(metricsOrDelta.averageFPS)) {
                return metricsOrDelta.averageFPS;
            }
            if (Number.isFinite(metricsOrDelta.fps)) {
                return metricsOrDelta.fps;
            }
            if (
                Number.isFinite(metricsOrDelta.frameTimeMs) &&
                metricsOrDelta.frameTimeMs > 0
            ) {
                return 1000 / metricsOrDelta.frameTimeMs;
            }
        }
        return NaN;
    }

    _applyScale(force = false) {
        const pixelRatio = this.basePixelRatio * this.currentScale;
        if (
            !force &&
            this._lastAppliedPixelRatio !== null &&
            Math.abs(pixelRatio - this._lastAppliedPixelRatio) < 0.001
        ) {
            return;
        }
        this.renderer.setPixelRatio(pixelRatio);
        this._lastAppliedPixelRatio = pixelRatio;
        this.stats.pixelRatio = pixelRatio;
    }

    setScale(scale, immediate = true) {
        if (!Number.isFinite(scale)) return false;
        this.currentScale = THREE.MathUtils.clamp(
            scale,
            this.options.minScale,
            this.options.maxScale
        );
        if (immediate) this._applyScale(true);
        return true;
    }

    setBasePixelRatio(pixelRatio, applyNow = true) {
        if (!Number.isFinite(pixelRatio) || pixelRatio <= 0) return false;
        this.basePixelRatio = pixelRatio;
        if (applyNow) this._applyScale(true);
        return true;
    }

    setTargetFPS(fps) {
        if (!Number.isFinite(fps) || fps <= 0) return false;
        this.options.targetFPS = fps;
        if (this.options.lowerFPSThreshold >= fps) {
            this.options.lowerFPSThreshold = Math.max(1, fps - 6);
        }
        if (this.options.upperFPSThreshold <= fps) {
            this.options.upperFPSThreshold = fps + 1;
        }
        return true;
    }

    setEnabled(enabled) {
        const state = !!enabled;
        if (this.options.enabled === state) return;
        this.options.enabled = state;
        if (!state) {
            // Export/video/offline paths should never inherit a degraded scale.
            this.currentScale = THREE.MathUtils.clamp(
                this.options.maxScale,
                this.options.minScale,
                this.options.maxScale
            );
            this._applyScale(true);
            this.stats.qualityDirection = "DISABLED";
        } else {
            this._smoothedFPS = this.options.targetFPS;
            this.currentFPS = this.options.targetFPS;
            this._lastChangeTime = performance.now();
            this.stats.qualityDirection = "STABLE";
        }
    }

    reset() {
        this.currentScale = THREE.MathUtils.clamp(
            this.options.maxScale,
            this.options.minScale,
            this.options.maxScale
        );
        this._smoothedFPS = this.options.targetFPS;
        this.currentFPS = this.options.targetFPS;
        this._lastChangeTime = 0;
        this._applyScale(true);
    }

    restoreNativePixelRatio() {
        this.renderer.setPixelRatio(this.nativePixelRatio);
        this._lastAppliedPixelRatio = this.nativePixelRatio;
        this.stats.pixelRatio = this.nativePixelRatio;
    }

    getStats() {
        return {
            ...this.stats,
            fps: Number(this.stats.fps.toFixed(2)),
            scale: Number(this.stats.scale.toFixed(3)),
            pixelRatio: Number(this.stats.pixelRatio.toFixed(3)),
            basePixelRatio: Number(this.basePixelRatio.toFixed(3)),
            nativePixelRatio: Number(this.nativePixelRatio.toFixed(3))
        };
    }

    destroy({ restorePixelRatio = true } = {}) {
        if (restorePixelRatio) this.restoreNativePixelRatio();
    }
}

window.DynamicResolutionManager = DynamicResolutionManager;