class LumenConfig {
    constructor(overrides = {}) {
        this.enabled = true;
        this.quality = 'medium';
        this.giIntensity = 1.0;
        this.emissiveBoost = 1.5;
        this.giResolutionScale = 0.5;
        this.giRayCount = 4;
        this.giMaxSteps = 32;
        this.giStepLength = 0.35;
        this.giThickness = 0.2;
        this.probeGrid = new THREE.Vector3(12, 6, 12);
        this.probeSpacing = 3.0;
        this.probeRays = 16;
        this.probeUpdateBudget = 6;
        this.probeFollowCamera = true;
        this.surfaceCacheEnabled = true;
        this.surfaceCardBudget = 2;
        this.voxelEnabled = true;
        this.voxelResolution = 64;
        this.voxelWorldSize = 96;
        this.voxelUpdateBudget = 4;
        this.ssrEnabled = true;
        this.ssrResolutionScale = 0.5;
        this.ssrMaxSteps = 32;
        this.ssrThickness = 0.18;
        this.reflectionProbeEnabled = true;
        this.reflectionProbeResolution = 128;
        this.reflectionFaceBudget = 1;
        this.temporalEnabled = true;
        this.temporalHistoryWeight = 0.92;
        this.temporalDepthThreshold = 0.02;
        this.temporalNormalThreshold = 0.85;
        this.denoiserEnabled = true;
        this.denoiserIterations = 2;
        this.debugMode = 'final';
        this.frameIndex = 0;
        this.apply(overrides);
    }
    apply(values = {}) {
        for (const [key, value] of Object.entries(values)) {
            if (!(key in this)) continue;
            if (key === 'probeGrid' && value) {
                if (value.isVector3) this.probeGrid.copy(value);
                else if (Array.isArray(value)) this.probeGrid.set(value[0] ?? this.probeGrid.x, value[1] ?? this.probeGrid.y, value[2] ?? this.probeGrid.z);
                else if (typeof value === 'object') this.probeGrid.set(value.x ?? this.probeGrid.x, value.y ?? this.probeGrid.y, value.z ?? this.probeGrid.z);
                continue;
            }
            this[key] = value;
        }
        return this;
    }
    setQuality(level = 'medium') {
        const name = String(level).toLowerCase();
        const presets = {
            low: {
                quality: 'low',
                giResolutionScale: 0.25,
                giRayCount: 2,
                giMaxSteps: 20,
                probeGrid: [8, 4, 8],
                probeRays: 8,
                probeUpdateBudget: 4,
                surfaceCacheEnabled: false,
                voxelResolution: 32,
                voxelUpdateBudget: 2,
                ssrResolutionScale: 0.5,
                ssrMaxSteps: 16,
                denoiserIterations: 1
            },
            medium: {
                quality: 'medium',
                giResolutionScale: 0.5,
                giRayCount: 4,
                giMaxSteps: 32,
                probeGrid: [12, 6, 12],
                probeRays: 16,
                probeUpdateBudget: 6,
                surfaceCacheEnabled: true,
                voxelResolution: 64,
                voxelUpdateBudget: 4,
                ssrResolutionScale: 0.5,
                ssrMaxSteps: 32,
                denoiserIterations: 2
            },
            high: {
                quality: 'high',
                giResolutionScale: 0.5,
                giRayCount: 8,
                giMaxSteps: 48,
                probeGrid: [16, 8, 16],
                probeRays: 32,
                probeUpdateBudget: 8,
                surfaceCacheEnabled: true,
                voxelResolution: 96,
                voxelUpdateBudget: 6,
                ssrResolutionScale: 0.75,
                ssrMaxSteps: 48,
                denoiserIterations: 3
            }
        };
        this.apply(presets[name] || presets.medium);
        return this;
    }
    nextFrame() {
        this.frameIndex = (this.frameIndex + 1) >>> 0;
        return this.frameIndex;
    }
    clone() {
        const copy = new LumenConfig();
        copy.apply(this.toJSON());
        return copy;
    }
    toJSON() {
        return {
            enabled: this.enabled,
            quality: this.quality,
            giIntensity: this.giIntensity,
            emissiveBoost: this.emissiveBoost,
            giResolutionScale: this.giResolutionScale,
            giRayCount: this.giRayCount,
            giMaxSteps: this.giMaxSteps,
            giStepLength: this.giStepLength,
            giThickness: this.giThickness,
            probeGrid: [this.probeGrid.x, this.probeGrid.y, this.probeGrid.z],
            probeSpacing: this.probeSpacing,
            probeRays: this.probeRays,
            probeUpdateBudget: this.probeUpdateBudget,
            probeFollowCamera: this.probeFollowCamera,
            surfaceCacheEnabled: this.surfaceCacheEnabled,
            surfaceCardBudget: this.surfaceCardBudget,
            voxelEnabled: this.voxelEnabled,
            voxelResolution: this.voxelResolution,
            voxelWorldSize: this.voxelWorldSize,
            voxelUpdateBudget: this.voxelUpdateBudget,
            ssrEnabled: this.ssrEnabled,
            ssrResolutionScale: this.ssrResolutionScale,
            ssrMaxSteps: this.ssrMaxSteps,
            ssrThickness: this.ssrThickness,
            reflectionProbeEnabled: this.reflectionProbeEnabled,
            reflectionProbeResolution: this.reflectionProbeResolution,
            reflectionFaceBudget: this.reflectionFaceBudget,
            temporalEnabled: this.temporalEnabled,
            temporalHistoryWeight: this.temporalHistoryWeight,
            temporalDepthThreshold: this.temporalDepthThreshold,
            temporalNormalThreshold: this.temporalNormalThreshold,
            denoiserEnabled: this.denoiserEnabled,
            denoiserIterations: this.denoiserIterations,
            debugMode: this.debugMode
        };
    }
}
window.LumenConfig = LumenConfig;