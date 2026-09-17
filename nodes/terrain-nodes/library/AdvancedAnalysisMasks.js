// ============================================================================
// nodes/terrain-nodes/library/AdvancedAnalysisMasks.js
// SM Engine Terrain Nodes - terrain analysis and biome masks
//
// Adds:
// - Ridge / Valley Mask
// - Aspect Mask
// - Snow Accumulation Mask
// - Biome Climate Mask
// - Distance-from-Height-Band Mask
// - Mask Morphology
// ============================================================================
(function (global) {
    'use strict';
    const NS = global.SMTerrainNodes;
    const registry = global.SMTerrainNodeRegistry;
    if (!NS?.BaseTerrainNode || !registry) {
        throw new Error('[Terrain Nodes] Load core scripts before AdvancedAnalysisMasks.js');
    }
    const {
        BaseTerrainNode,
        FastSimplex2D,
        TerrainMath,
        ValueType
    } = NS;
    function gradientAt(height, context, x, z) {
        const sizeX = context.sizeX;
        const sizeZ = context.sizeZ;
        const x0 = Math.max(0, x - 1);
        const x1 = Math.min(sizeX - 1, x + 1);
        const z0 = Math.max(0, z - 1);
        const z1 = Math.min(sizeZ - 1, z + 1);
        const dx =
            (
                height[z * sizeX + x1] -
                height[z * sizeX + x0]
            ) /
            Math.max(
                1e-6,
                (x1 - x0) *
                context.cellSizeX
            );
        const dz =
            (
                height[z1 * sizeX + x] -
                height[z0 * sizeX + x]
            ) /
            Math.max(
                1e-6,
                (z1 - z0) *
                context.cellSizeZ
            );
        return { dx, dz };
    }
    class RidgeValleyMaskNode extends BaseTerrainNode {
        constructor(params = {}) {
            super({
                type: 'mask.ridgeValley',
                name: 'Ridge / Valley',
                category: 'mask',
                params: {
                    mode: 'ridge',
                    scale: 3,
                    threshold: 0.02,
                    softness: 0.18,
                    ...params
                },
                paramSchema: {
                    mode: { type: 'select', options: ['ridge', 'valley', 'both'] },
                    scale: { type: 'number', min: 0.01, max: 20, step: 0.01 },
                    threshold: { type: 'number', min: 0, max: 10, step: 0.01 },
                    softness: { type: 'number', min: 0.001, max: 10, step: 0.01 }
                },
                inputs: {
                    height: { type: ValueType.HEIGHT, required: true }
                },
                outputs: {
                    mask: { type: ValueType.MASK }
                }
            });
        }
        evaluate(context, inputs) {
            const p = this.params;
            const height = this.getHeightInput(inputs, 'height', context, true);
            const out = new Float32Array(context.count);
            for (let z = 1; z < context.sizeZ - 1; z++) {
                for (let x = 1; x < context.sizeX - 1; x++) {
                    const i = z * context.sizeX + x;
                    const lap =
                        (
                            height[i - 1] +
                            height[i + 1] +
                            height[i - context.sizeX] +
                            height[i + context.sizeX] -
                            height[i] * 4
                        ) *
                        p.scale;
                    let value;
                    if (p.mode === 'ridge') {
                        value = -lap;
                    } else if (p.mode === 'valley') {
                        value = lap;
                    } else {
                        value = Math.abs(lap);
                    }
                    out[i] =
                        TerrainMath.smoothstep(
                            p.threshold,
                            p.threshold + p.softness,
                            value
                        );
                }
            }
            return { mask: out };
        }
    }
    class AspectMaskNode extends BaseTerrainNode {
        constructor(params = {}) {
            super({
                type: 'mask.aspect',
                name: 'Aspect / Direction',
                category: 'mask',
                params: {
                    direction: 180,
                    spread: 60,
                    minSlope: 5,
                    ...params
                },
                paramSchema: {
                    direction: { type: 'number', min: 0, max: 360, step: 1 },
                    spread: { type: 'number', min: 1, max: 180, step: 1 },
                    minSlope: { type: 'number', min: 0, max: 89, step: 0.5 }
                },
                inputs: {
                    height: { type: ValueType.HEIGHT, required: true }
                },
                outputs: {
                    mask: { type: ValueType.MASK }
                }
            });
        }
        evaluate(context, inputs) {
            const p = this.params;
            const height = this.getHeightInput(inputs, 'height', context, true);
            const out = new Float32Array(context.count);
            const desired = p.direction * Math.PI / 180;
            const spread = Math.max(1e-6, p.spread * Math.PI / 180);
            for (let z = 0; z < context.sizeZ; z++) {
                for (let x = 0; x < context.sizeX; x++) {
                    const i = z * context.sizeX + x;
                    const g = gradientAt(height, context, x, z);
                    const slope =
                        Math.atan(
                            Math.sqrt(
                                g.dx * g.dx +
                                g.dz * g.dz
                            )
                        ) *
                        180 / Math.PI;
                    if (slope < p.minSlope) {
                        out[i] = 0;
                        continue;
                    }
                    let aspect =
                        Math.atan2(
                            -g.dx,
                            -g.dz
                        );
                    let d =
                        Math.atan2(
                            Math.sin(aspect - desired),
                            Math.cos(aspect - desired)
                        );
                    d = Math.abs(d);
                    out[i] =
                        1 -
                        TerrainMath.smoothstep(
                            0,
                            spread,
                            d
                        );
                }
            }
            return { mask: out };
        }
    }
    class SnowAccumulationMaskNode extends BaseTerrainNode {
        constructor(params = {}) {
            super({
                type: 'mask.snow',
                name: 'Snow Accumulation',
                category: 'mask',
                params: {
                    snowLine: 35,
                    transition: 12,
                    maxSlope: 48,
                    slopeFade: 12,
                    windDirection: 225,
                    windEffect: 0.25,
                    seed: 2026,
                    variation: 0.08,
                    ...params
                },
                paramSchema: {
                    snowLine: { type: 'number', min: -500, max: 1000, step: 0.5 },
                    transition: { type: 'number', min: 0.1, max: 200, step: 0.5 },
                    maxSlope: { type: 'number', min: 1, max: 89, step: 0.5 },
                    slopeFade: { type: 'number', min: 0.1, max: 30, step: 0.5 },
                    windDirection: { type: 'number', min: 0, max: 360, step: 1 },
                    windEffect: { type: 'number', min: 0, max: 1, step: 0.01 },
                    seed: { type: 'number', min: 0, max: 999999, step: 1, randomize: true },
                    variation: { type: 'number', min: 0, max: 0.5, step: 0.01 }
                },
                inputs: {
                    height: { type: ValueType.HEIGHT, required: true }
                },
                outputs: {
                    mask: { type: ValueType.MASK }
                }
            });
        }
        evaluate(context, inputs) {
            const p = this.params;
            const height = this.getHeightInput(inputs, 'height', context, true);
            const out = new Float32Array(context.count);
            const noise = new FastSimplex2D((Number(p.seed) || 0) + context.seed);
            const wind = p.windDirection * Math.PI / 180;
            const windX = Math.sin(wind);
            const windZ = Math.cos(wind);
            for (let z = 0; z < context.sizeZ; z++) {
                const wz = context.worldZ(z);
                for (let x = 0; x < context.sizeX; x++) {
                    const wx = context.worldX(x);
                    const i = z * context.sizeX + x;
                    const altitude =
                        TerrainMath.smoothstep(
                            p.snowLine,
                            p.snowLine + p.transition,
                            height[i]
                        );
                    const g = gradientAt(height, context, x, z);
                    const slope =
                        Math.atan(
                            Math.sqrt(
                                g.dx * g.dx +
                                g.dz * g.dz
                            )
                        ) *
                        180 / Math.PI;
                    const slopeKeep =
                        1 -
                        TerrainMath.smoothstep(
                            p.maxSlope - p.slopeFade,
                            p.maxSlope,
                            slope
                        );
                    const len =
                        Math.max(
                            1e-6,
                            Math.sqrt(
                                g.dx * g.dx +
                                g.dz * g.dz
                            )
                        );
                    const normalSlopeX =
                        -g.dx / len;
                    const normalSlopeZ =
                        -g.dz / len;
                    const lee =
                        TerrainMath.clamp01(
                            0.5 +
                            0.5 *
                            (
                                normalSlopeX * windX +
                                normalSlopeZ * windZ
                            )
                        );
                    const variation =
                        noise.noise2D(
                            wx * 0.01,
                            wz * 0.01
                        ) *
                        p.variation;
                    out[i] =
                        TerrainMath.clamp01(
                            altitude *
                            slopeKeep *
                            (
                                1 -
                                p.windEffect +
                                lee *
                                p.windEffect
                            ) +
                            variation *
                            altitude
                        );
                }
            }
            return { mask: out };
        }
    }
    class BiomeClimateMaskNode extends BaseTerrainNode {
        constructor(params = {}) {
            super({
                type: 'mask.biomeClimate',
                name: 'Biome Climate',
                category: 'mask',
                params: {
                    seed: 77,
                    temperature: 0.5,
                    moisture: 0.5,
                    altitudeCooling: 0.004,
                    tempVariation: 0.22,
                    moistureVariation: 0.3,
                    frequency: 0.003,
                    target: 'temperate',
                    softness: 0.25,
                    ...params
                },
                paramSchema: {
                    seed: { type: 'number', min: 0, max: 999999, step: 1, randomize: true },
                    temperature: { type: 'number', min: 0, max: 1, step: 0.01 },
                    moisture: { type: 'number', min: 0, max: 1, step: 0.01 },
                    altitudeCooling: { type: 'number', min: 0, max: 0.05, step: 0.0005 },
                    tempVariation: { type: 'number', min: 0, max: 1, step: 0.01 },
                    moistureVariation: { type: 'number', min: 0, max: 1, step: 0.01 },
                    frequency: { type: 'number', min: 0.0001, max: 0.05, step: 0.0001 },
                    target: { type: 'select', options: ['desert', 'grassland', 'temperate', 'tropical', 'tundra'] },
                    softness: { type: 'number', min: 0.01, max: 1, step: 0.01 }
                },
                inputs: {
                    height: { type: ValueType.HEIGHT, required: true },
                    wetness: { type: ValueType.MASK, required: false }
                },
                outputs: {
                    mask: { type: ValueType.MASK },
                    temperatureMask: { type: ValueType.MASK },
                    moistureMask: { type: ValueType.MASK }
                }
            });
        }
        evaluate(context, inputs) {
            const p = this.params;
            const height = this.getHeightInput(inputs, 'height', context, true);
            const wetness =
                inputs?.wetness instanceof Float32Array
                    ? inputs.wetness
                    : null;
            const out = new Float32Array(context.count);
            const temperatureMask = new Float32Array(context.count);
            const moistureMask = new Float32Array(context.count);
            const noise = new FastSimplex2D((Number(p.seed) || 0) + context.seed);
            const targets = {
                desert: [0.78, 0.18],
                grassland: [0.62, 0.48],
                temperate: [0.52, 0.62],
                tropical: [0.82, 0.86],
                tundra: [0.18, 0.42]
            };
            const target = targets[p.target] || targets.temperate;
            for (let z = 0; z < context.sizeZ; z++) {
                const wz = context.worldZ(z);
                for (let x = 0; x < context.sizeX; x++) {
                    const wx = context.worldX(x);
                    const i = z * context.sizeX + x;
                    const tempNoise =
                        TerrainMath.fbm(
                            noise,
                            wx,
                            wz,
                            {
                                frequency: p.frequency,
                                octaves: 3,
                                lacunarity: 2,
                                gain: 0.5
                            }
                        );
                    const moistNoise =
                        TerrainMath.fbm(
                            noise,
                            wx + 131,
                            wz - 79,
                            {
                                frequency: p.frequency * 0.8,
                                octaves: 4,
                                lacunarity: 2,
                                gain: 0.52
                            }
                        );
                    const temperature =
                        TerrainMath.clamp01(
                            p.temperature +
                            tempNoise *
                            p.tempVariation -
                            height[i] *
                            p.altitudeCooling
                        );
                    const moisture =
                        TerrainMath.clamp01(
                            p.moisture +
                            moistNoise *
                            p.moistureVariation +
                            (
                                wetness
                                    ? wetness[i] * 0.4
                                    : 0
                            )
                        );
                    const tempDistance =
                        Math.abs(
                            temperature -
                            target[0]
                        );
                    const moistureDistance =
                        Math.abs(
                            moisture -
                            target[1]
                        );
                    const distance =
                        Math.sqrt(
                            tempDistance * tempDistance +
                            moistureDistance * moistureDistance
                        );
                    out[i] =
                        1 -
                        TerrainMath.smoothstep(
                            0,
                            p.softness,
                            distance
                        );
                    temperatureMask[i] =
                        temperature;
                    moistureMask[i] =
                        moisture;
                }
            }
            return {
                mask: out,
                temperatureMask,
                moistureMask
            };
        }
    }
    class HeightBandDistanceNode extends BaseTerrainNode {
        constructor(params = {}) {
            super({
                type: 'mask.heightBandDistance',
                name: 'Height Band Distance',
                category: 'mask',
                params: {
                    height: 0,
                    width: 5,
                    invert: false,
                    ...params
                },
                paramSchema: {
                    height: { type: 'number', min: -1000, max: 1000, step: 0.5 },
                    width: { type: 'number', min: 0.01, max: 500, step: 0.1 },
                    invert: { type: 'boolean' }
                },
                inputs: {
                    heightField: { type: ValueType.HEIGHT, required: true }
                },
                outputs: {
                    mask: { type: ValueType.MASK }
                }
            });
        }
        evaluate(context, inputs) {
            const source = this.getHeightInput(inputs, 'heightField', context, true);
            const out = new Float32Array(context.count);
            const width = Math.max(1e-6, this.params.width);
            for (let i = 0; i < context.count; i++) {
                const d =
                    Math.abs(
                        source[i] -
                        this.params.height
                    );
                let value =
                    1 -
                    TerrainMath.smoothstep(
                        0,
                        width,
                        d
                    );
                if (this.params.invert) {
                    value = 1 - value;
                }
                out[i] = value;
            }
            return { mask: out };
        }
    }
    class MaskMorphologyNode extends BaseTerrainNode {
        constructor(params = {}) {
            super({
                type: 'filter.maskMorphology',
                name: 'Mask Morphology',
                category: 'filter',
                params: {
                    operation: 'dilate',
                    radius: 2,
                    iterations: 1,
                    ...params
                },
                paramSchema: {
                    operation: { type: 'select', options: ['dilate', 'erode', 'open', 'close'] },
                    radius: { type: 'number', min: 1, max: 8, step: 1 },
                    iterations: { type: 'number', min: 1, max: 8, step: 1 }
                },
                inputs: {
                    mask: { type: ValueType.MASK, required: true }
                },
                outputs: {
                    mask: { type: ValueType.MASK }
                }
            });
        }
        _pass(source, context, dilate) {
            const out = new Float32Array(context.count);
            const r = Math.max(1, Math.floor(this.params.radius));
            for (let z = 0; z < context.sizeZ; z++) {
                for (let x = 0; x < context.sizeX; x++) {
                    let value = dilate ? 0 : 1;
                    for (let oz = -r; oz <= r; oz++) {
                        const nz = TerrainMath.clamp(z + oz, 0, context.sizeZ - 1);
                        for (let ox = -r; ox <= r; ox++) {
                            if (ox * ox + oz * oz > r * r) continue;
                            const nx = TerrainMath.clamp(x + ox, 0, context.sizeX - 1);
                            const sample = source[nz * context.sizeX + nx];
                            if (dilate) {
                                if (sample > value) value = sample;
                            } else {
                                if (sample < value) value = sample;
                            }
                        }
                    }
                    out[z * context.sizeX + x] = value;
                }
            }
            return out;
        }
        evaluate(context, inputs) {
            let source =
                inputs?.mask instanceof Float32Array
                    ? new Float32Array(inputs.mask)
                    : new Float32Array(context.count).fill(1);
            const operation = this.params.operation;
            const iterations = Math.max(1, Math.floor(this.params.iterations));
            const applyPass = (dilate, count = 1) => {
                for (let i = 0; i < count; i++) {
                    source = this._pass(source, context, dilate);
                }
            };
            if (operation === 'dilate') {
                applyPass(true, iterations);
            } else if (operation === 'erode') {
                applyPass(false, iterations);
            } else if (operation === 'open') {
                applyPass(false, iterations);
                applyPass(true, iterations);
            } else if (operation === 'close') {
                applyPass(true, iterations);
                applyPass(false, iterations);
            }
            return { mask: source };
        }
    }
    registry.register('mask.ridgeValley', RidgeValleyMaskNode, {
        label: 'Ridge / Valley',
        category: 'mask',
        icon: 'fa-wave-square',
        role: 'Separate ridges and valleys',
        cost: 'LOW',
        keywords: ['ridge', 'valley', 'cavity', 'convex']
    });
    registry.register('mask.aspect', AspectMaskNode, {
        label: 'Aspect / Direction',
        category: 'mask',
        icon: 'fa-compass',
        role: 'Slope facing direction mask',
        cost: 'LOW',
        keywords: ['aspect', 'direction', 'north', 'south', 'sun']
    });
    registry.register('mask.snow', SnowAccumulationMaskNode, {
        label: 'Snow Accumulation',
        category: 'mask',
        icon: 'fa-snowflake',
        role: 'Altitude + slope + wind snow mask',
        cost: 'MED',
        keywords: ['snow', 'ice', 'winter', 'mountain']
    });
    registry.register('mask.biomeClimate', BiomeClimateMaskNode, {
        label: 'Biome Climate',
        category: 'mask',
        icon: 'fa-leaf',
        role: 'Temperature + moisture biome selection',
        cost: 'MED',
        keywords: ['biome', 'climate', 'temperature', 'moisture']
    });
    registry.register('mask.heightBandDistance', HeightBandDistanceNode, {
        label: 'Height Band Distance',
        category: 'mask',
        icon: 'fa-arrows-up-down',
        role: 'Distance around elevation contour',
        cost: 'LOW',
        keywords: ['height', 'contour', 'shoreline', 'band']
    });
    registry.register('filter.maskMorphology', MaskMorphologyNode, {
        label: 'Mask Morphology',
        category: 'filter',
        icon: 'fa-circle-nodes',
        role: 'Dilate, erode, open, close masks',
        cost: 'MED',
        keywords: ['dilate', 'erode', 'mask', 'morphology']
    });
    Object.assign(NS, {
        RidgeValleyMaskNode,
        AspectMaskNode,
        SnowAccumulationMaskNode,
        BiomeClimateMaskNode,
        HeightBandDistanceNode,
        MaskMorphologyNode
    });
})(window);
