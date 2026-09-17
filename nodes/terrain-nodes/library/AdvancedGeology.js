// ============================================================================
// nodes/terrain-nodes/library/AdvancedGeology.js
// SM Engine Terrain Nodes - Advanced geomorphology
//
// Adds:
// - Coastal Erosion
// - Karst / Sinkholes
// - Wind Erosion / Yardangs
// - Scree / Talus Deposition
// - Mesa / Escarpment
// ============================================================================
(function (global) {
    'use strict';
    const NS = global.SMTerrainNodes;
    const registry = global.SMTerrainNodeRegistry;
    if (!NS?.BaseTerrainNode || !registry) {
        throw new Error('[Terrain Nodes] Load core scripts before AdvancedGeology.js');
    }
    const {
        BaseTerrainNode,
        FastSimplex2D,
        TerrainMath,
        ValueType
    } = NS;
    class CoastalErosionNode extends BaseTerrainNode {
        constructor(params = {}) {
            super({
                type: 'geology.coastal',
                name: 'Coastal Erosion',
                category: 'geology',
                params: {
                    seaLevel: 0,
                    beachWidth: 8,
                    beachHeight: 1.5,
                    cliffHeight: 12,
                    cliffWidth: 8,
                    waveCut: 0.5,
                    strength: 1,
                    ...params
                },
                paramSchema: {
                    seaLevel: { type: 'number', min: -500, max: 500, step: 0.1 },
                    beachWidth: { type: 'number', min: 0, max: 100, step: 0.25 },
                    beachHeight: { type: 'number', min: 0, max: 20, step: 0.1 },
                    cliffHeight: { type: 'number', min: 0, max: 100, step: 0.25 },
                    cliffWidth: { type: 'number', min: 0.5, max: 100, step: 0.25 },
                    waveCut: { type: 'number', min: 0, max: 1, step: 0.01 },
                    strength: { type: 'number', min: 0, max: 1, step: 0.01 }
                },
                inputs: {
                    height: { type: ValueType.HEIGHT, required: true }
                },
                outputs: {
                    height: { type: ValueType.HEIGHT },
                    coastMask: { type: ValueType.MASK },
                    beachMask: { type: ValueType.MASK }
                }
            });
        }
        evaluate(context, inputs) {
            const p = this.params;
            const source = this.getHeightInput(inputs, 'height', context, true);
            const out = new Float32Array(context.count);
            const coastMask = new Float32Array(context.count);
            const beachMask = new Float32Array(context.count);
            for (let i = 0; i < context.count; i++) {
                const h = source[i];
                const distance = h - p.seaLevel;
                const coast =
                    1 -
                    TerrainMath.smoothstep(
                        0,
                        p.cliffWidth,
                        Math.abs(distance)
                    );
                const beach =
                    1 -
                    TerrainMath.smoothstep(
                        0,
                        p.beachWidth,
                        Math.abs(distance)
                    );
                const beachTarget =
                    p.seaLevel +
                    TerrainMath.clamp(
                        distance,
                        -p.beachHeight,
                        p.beachHeight
                    );
                let target =
                    TerrainMath.lerp(
                        h,
                        beachTarget,
                        beach * 0.7
                    );
                if (distance > 0) {
                    const cliff =
                        TerrainMath.smoothstep(
                            p.beachHeight,
                            p.cliffHeight,
                            distance
                        );
                    const cliffTarget =
                        p.seaLevel +
                        p.beachHeight +
                        cliff *
                        p.cliffHeight;
                    target =
                        TerrainMath.lerp(
                            target,
                            cliffTarget,
                            coast * p.waveCut
                        );
                }
                out[i] =
                    TerrainMath.lerp(
                        h,
                        target,
                        p.strength
                    );
                coastMask[i] =
                    TerrainMath.clamp01(coast);
                beachMask[i] =
                    TerrainMath.clamp01(beach);
            }
            return {
                height: out,
                coastMask,
                beachMask
            };
        }
    }
    class KarstNode extends BaseTerrainNode {
        constructor(params = {}) {
            super({
                type: 'geology.karst',
                name: 'Karst / Sinkholes',
                category: 'geology',
                params: {
                    seed: 909,
                    density: 34,
                    minRadius: 4,
                    maxRadius: 18,
                    depth: 9,
                    towerStrength: 0.25,
                    noiseScale: 0.01,
                    strength: 1,
                    ...params
                },
                paramSchema: {
                    seed: { type: 'number', min: 0, max: 999999, step: 1, randomize: true },
                    density: { type: 'number', min: 1, max: 200, step: 1 },
                    minRadius: { type: 'number', min: 1, max: 50, step: 0.25 },
                    maxRadius: { type: 'number', min: 2, max: 100, step: 0.25 },
                    depth: { type: 'number', min: 0, max: 80, step: 0.25 },
                    towerStrength: { type: 'number', min: 0, max: 2, step: 0.01 },
                    noiseScale: { type: 'number', min: 0.0001, max: 0.1, step: 0.0001 },
                    strength: { type: 'number', min: 0, max: 1, step: 0.01 }
                },
                inputs: {
                    height: { type: ValueType.HEIGHT, required: true }
                },
                outputs: {
                    height: { type: ValueType.HEIGHT },
                    sinkholeMask: { type: ValueType.MASK }
                }
            });
        }
        evaluate(context, inputs) {
            const p = this.params;
            const source = this.getHeightInput(inputs, 'height', context, true);
            const out = new Float32Array(source);
            const sinkholeMask = new Float32Array(context.count);
            const seed = (Number(p.seed) || 0) + context.seed;
            const random = TerrainMath.mulberry32(TerrainMath.hash32(seed));
            const noise = new FastSimplex2D(seed + 51);
            const holes = [];
            for (let h = 0; h < Math.floor(p.density); h++) {
                const radius =
                    TerrainMath.lerp(
                        p.minRadius,
                        p.maxRadius,
                        random()
                    );
                holes.push({
                    x: (random() - 0.5) * context.width,
                    z: (random() - 0.5) * context.length,
                    radius
                });
            }
            for (let z = 0; z < context.sizeZ; z++) {
                const wz = context.worldZ(z);
                for (let x = 0; x < context.sizeX; x++) {
                    const wx = context.worldX(x);
                    const i = z * context.sizeX + x;
                    let sink = 0;
                    let mask = 0;
                    for (let h = 0; h < holes.length; h++) {
                        const hole = holes[h];
                        const dx = wx - hole.x;
                        const dz = wz - hole.z;
                        const d = Math.sqrt(dx * dx + dz * dz);
                        const r = d / hole.radius;
                        if (r > 1.35) continue;
                        const bowl =
                            Math.pow(
                                Math.max(0, 1 - r),
                                1.8
                            );
                        sink +=
                            bowl *
                            p.depth;
                        mask =
                            Math.max(
                                mask,
                                TerrainMath.clamp01(
                                    1 - r
                                )
                            );
                    }
                    const towers =
                        TerrainMath.ridgedFbm(
                            noise,
                            wx,
                            wz,
                            {
                                frequency: p.noiseScale,
                                octaves: 5,
                                lacunarity: 2.15,
                                gain: 0.52,
                                sharpness: 3
                            }
                        ) *
                        p.towerStrength *
                        p.depth;
                    out[i] =
                        source[i] +
                        (towers - sink) *
                        p.strength;
                    sinkholeMask[i] =
                        mask;
                }
            }
            return {
                height: out,
                sinkholeMask
            };
        }
    }
    class WindErosionNode extends BaseTerrainNode {
        constructor(params = {}) {
            super({
                type: 'geology.windErosion',
                name: 'Wind Erosion / Yardangs',
                category: 'geology',
                params: {
                    seed: 771,
                    angle: 20,
                    wavelength: 30,
                    carveDepth: 7,
                    ridgeHeight: 3,
                    sharpness: 3,
                    noise: 0.25,
                    strength: 1,
                    ...params
                },
                paramSchema: {
                    seed: { type: 'number', min: 0, max: 999999, step: 1, randomize: true },
                    angle: { type: 'number', min: -180, max: 180, step: 1 },
                    wavelength: { type: 'number', min: 2, max: 250, step: 0.5 },
                    carveDepth: { type: 'number', min: 0, max: 50, step: 0.1 },
                    ridgeHeight: { type: 'number', min: 0, max: 30, step: 0.1 },
                    sharpness: { type: 'number', min: 0.5, max: 8, step: 0.05 },
                    noise: { type: 'number', min: 0, max: 1, step: 0.01 },
                    strength: { type: 'number', min: 0, max: 1, step: 0.01 }
                },
                inputs: {
                    height: { type: ValueType.HEIGHT, required: true }
                },
                outputs: {
                    height: { type: ValueType.HEIGHT }
                }
            });
        }
        evaluate(context, inputs) {
            const p = this.params;
            const source = this.getHeightInput(inputs, 'height', context, true);
            const out = new Float32Array(context.count);
            const noise = new FastSimplex2D((Number(p.seed) || 0) + context.seed);
            const angle = p.angle * Math.PI / 180;
            const ca = Math.cos(angle);
            const sa = Math.sin(angle);
            const k = Math.PI * 2 / Math.max(1e-6, p.wavelength);
            for (let z = 0; z < context.sizeZ; z++) {
                const wz = context.worldZ(z);
                for (let x = 0; x < context.sizeX; x++) {
                    const wx = context.worldX(x);
                    const i = z * context.sizeX + x;
                    const u =
                        wx * ca +
                        wz * sa;
                    const v =
                        -wx * sa +
                        wz * ca;
                    const wave =
                        0.5 +
                        0.5 *
                        Math.sin(
                            u * k +
                            TerrainMath.fbm(
                                noise,
                                u,
                                v,
                                {
                                    frequency: 0.015,
                                    octaves: 3,
                                    lacunarity: 2,
                                    gain: 0.5
                                }
                            ) *
                            p.noise *
                            4
                        );
                    const ridge =
                        Math.pow(
                            wave,
                            p.sharpness
                        );
                    const carve =
                        Math.pow(
                            1 - wave,
                            p.sharpness * 0.75
                        );
                    out[i] =
                        source[i] +
                        (
                            ridge *
                            p.ridgeHeight -
                            carve *
                            p.carveDepth
                        ) *
                        p.strength;
                }
            }
            return { height: out };
        }
    }
    class TalusDepositionNode extends BaseTerrainNode {
        constructor(params = {}) {
            super({
                type: 'geology.talusDeposit',
                name: 'Scree / Talus Deposit',
                category: 'geology',
                params: {
                    minSlope: 28,
                    maxSlope: 55,
                    amount: 4,
                    spread: 0.7,
                    strength: 1,
                    ...params
                },
                paramSchema: {
                    minSlope: { type: 'number', min: 0, max: 89, step: 0.5 },
                    maxSlope: { type: 'number', min: 0, max: 89, step: 0.5 },
                    amount: { type: 'number', min: 0, max: 30, step: 0.1 },
                    spread: { type: 'number', min: 0, max: 1, step: 0.01 },
                    strength: { type: 'number', min: 0, max: 1, step: 0.01 }
                },
                inputs: {
                    height: { type: ValueType.HEIGHT, required: true }
                },
                outputs: {
                    height: { type: ValueType.HEIGHT },
                    talusMask: { type: ValueType.MASK }
                }
            });
        }
        evaluate(context, inputs) {
            const p = this.params;
            const source = this.getHeightInput(inputs, 'height', context, true);
            let mask = new Float32Array(context.count);
            for (let z = 0; z < context.sizeZ; z++) {
                const z0 = Math.max(0, z - 1);
                const z1 = Math.min(context.sizeZ - 1, z + 1);
                for (let x = 0; x < context.sizeX; x++) {
                    const x0 = Math.max(0, x - 1);
                    const x1 = Math.min(context.sizeX - 1, x + 1);
                    const i = z * context.sizeX + x;
                    const dx =
                        (
                            source[z * context.sizeX + x1] -
                            source[z * context.sizeX + x0]
                        ) /
                        Math.max(
                            1e-6,
                            (x1 - x0) *
                            context.cellSizeX
                        );
                    const dz =
                        (
                            source[z1 * context.sizeX + x] -
                            source[z0 * context.sizeX + x]
                        ) /
                        Math.max(
                            1e-6,
                            (z1 - z0) *
                            context.cellSizeZ
                        );
                    const slope =
                        Math.atan(
                            Math.sqrt(
                                dx * dx +
                                dz * dz
                            )
                        ) *
                        180 / Math.PI;
                    const enter =
                        TerrainMath.smoothstep(
                            p.minSlope,
                            p.maxSlope,
                            slope
                        );
                    const leave =
                        1 -
                        TerrainMath.smoothstep(
                            p.maxSlope,
                            Math.min(89, p.maxSlope + 12),
                            slope
                        );
                    mask[i] =
                        TerrainMath.clamp01(
                            enter * leave
                        );
                }
            }
            mask =
                TerrainMath.blur3x3(
                    mask,
                    context.sizeX,
                    context.sizeZ,
                    p.spread
                );
            const out = new Float32Array(context.count);
            for (let i = 0; i < context.count; i++) {
                out[i] =
                    source[i] +
                    mask[i] *
                    p.amount *
                    p.strength;
            }
            return {
                height: out,
                talusMask: mask
            };
        }
    }
    class MesaEscarpmentNode extends BaseTerrainNode {
        constructor(params = {}) {
            super({
                type: 'geology.mesaEscarpment',
                name: 'Mesa / Escarpment',
                category: 'geology',
                params: {
                    stepHeight: 18,
                    capStrength: 0.8,
                    cliffSharpness: 0.75,
                    erosionNoise: 0.18,
                    frequency: 0.008,
                    strength: 1,
                    ...params
                },
                paramSchema: {
                    stepHeight: { type: 'number', min: 1, max: 100, step: 0.25 },
                    capStrength: { type: 'number', min: 0, max: 1, step: 0.01 },
                    cliffSharpness: { type: 'number', min: 0, max: 1, step: 0.01 },
                    erosionNoise: { type: 'number', min: 0, max: 1, step: 0.01 },
                    frequency: { type: 'number', min: 0.0001, max: 0.1, step: 0.0001 },
                    strength: { type: 'number', min: 0, max: 1, step: 0.01 }
                },
                inputs: {
                    height: { type: ValueType.HEIGHT, required: true }
                },
                outputs: {
                    height: { type: ValueType.HEIGHT }
                }
            });
        }
        evaluate(context, inputs) {
            const p = this.params;
            const source = this.getHeightInput(inputs, 'height', context, true);
            const out = new Float32Array(context.count);
            const noise = new FastSimplex2D(context.seed + 932);
            const step = Math.max(0.01, p.stepHeight);
            for (let z = 0; z < context.sizeZ; z++) {
                const wz = context.worldZ(z);
                for (let x = 0; x < context.sizeX; x++) {
                    const wx = context.worldX(x);
                    const i = z * context.sizeX + x;
                    const shifted =
                        source[i] +
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
                        ) *
                        step *
                        p.erosionNoise;
                    const level =
                        shifted / step;
                    const low =
                        Math.floor(level);
                    const frac =
                        level - low;
                    const edge =
                        TerrainMath.smoothstep(
                            0.5 - p.cliffSharpness * 0.49,
                            0.5 + p.cliffSharpness * 0.49,
                            frac
                        );
                    const mesa =
                        (low + edge) *
                        step;
                    const cap =
                        Math.floor(
                            shifted / step
                        ) *
                        step +
                        step * 0.9;
                    const target =
                        TerrainMath.lerp(
                            mesa,
                            cap,
                            p.capStrength *
                            TerrainMath.smoothstep(
                                0.65,
                                1,
                                frac
                            )
                        );
                    out[i] =
                        TerrainMath.lerp(
                            source[i],
                            target,
                            p.strength
                        );
                }
            }
            return { height: out };
        }
    }
    registry.register('geology.coastal', CoastalErosionNode, {
        label: 'Coastal Erosion',
        category: 'geology',
        icon: 'fa-water',
        role: 'Beach, wave-cut shelf and coastal cliff',
        cost: 'LOW',
        keywords: ['coast', 'beach', 'ocean', 'cliff', 'shore']
    });
    registry.register('geology.karst', KarstNode, {
        label: 'Karst / Sinkholes',
        category: 'geology',
        icon: 'fa-circle',
        role: 'Sinkholes and tower karst',
        cost: 'MED',
        keywords: ['karst', 'sinkhole', 'limestone', 'cave']
    });
    registry.register('geology.windErosion', WindErosionNode, {
        label: 'Wind Erosion / Yardangs',
        category: 'geology',
        icon: 'fa-wind',
        role: 'Directional aeolian carving',
        cost: 'LOW',
        keywords: ['wind', 'yardang', 'erosion', 'desert']
    });
    registry.register('geology.talusDeposit', TalusDepositionNode, {
        label: 'Scree / Talus Deposit',
        category: 'geology',
        icon: 'fa-mountain',
        role: 'Slope-controlled debris aprons',
        cost: 'MED',
        keywords: ['talus', 'scree', 'debris', 'rockfall']
    });
    registry.register('geology.mesaEscarpment', MesaEscarpmentNode, {
        label: 'Mesa / Escarpment',
        category: 'geology',
        icon: 'fa-layer-group',
        role: 'Flat caps and vertical escarpments',
        cost: 'LOW',
        keywords: ['mesa', 'plateau', 'escarpment', 'canyon']
    });
    Object.assign(NS, {
        CoastalErosionNode,
        KarstNode,
        WindErosionNode,
        TalusDepositionNode,
        MesaEscarpmentNode
    });
})(window);