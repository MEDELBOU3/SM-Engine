// ============================================================================
// nodes/terrain-nodes/library/AdvancedGenerators.js
// SM Engine Terrain Nodes - Advanced macro landform generation
//
// Adds:
// - Plate Tectonics
// - Fold / Orogeny Mountains
// - Volcanic Field
// - Badlands
// - Crater Field
// ============================================================================
(function (global) {
    'use strict';
    const NS = global.SMTerrainNodes;
    const registry = global.SMTerrainNodeRegistry;
    if (!NS?.BaseTerrainNode || !registry) {
        throw new Error('[Terrain Nodes] Load core scripts before AdvancedGenerators.js');
    }
    const {
        BaseTerrainNode,
        FastSimplex2D,
        TerrainMath,
        ValueType
    } = NS;
    function seededPoints(count, width, length, seed) {
        const random = TerrainMath.mulberry32(TerrainMath.hash32(seed | 0));
        const points = [];
        for (let i = 0; i < count; i++) {
            points.push({
                x: (random() - 0.5) * width,
                z: (random() - 0.5) * length,
                vx: random() * 2 - 1,
                vz: random() * 2 - 1,
                uplift: random() * 2 - 1,
                value: random()
            });
        }
        return points;
    }
    function nearestTwoPlates(points, x, z) {
        let a = null;
        let b = null;
        let da = Infinity;
        let db = Infinity;
        for (let i = 0; i < points.length; i++) {
            const p = points[i];
            const dx = p.x - x;
            const dz = p.z - z;
            const d = dx * dx + dz * dz;
            if (d < da) {
                b = a;
                db = da;
                a = p;
                da = d;
            } else if (d < db) {
                b = p;
                db = d;
            }
        }
        return {
            a,
            b,
            da: Math.sqrt(da),
            db: Math.sqrt(db)
        };
    }
    class PlateTectonicsNode extends BaseTerrainNode {
        constructor(params = {}) {
            super({
                type: 'generator.plateTectonics',
                name: 'Plate Tectonics',
                category: 'generator',
                params: {
                    seed: 9127,
                    plates: 11,
                    continentalHeight: 12,
                    oceanDepth: 20,
                    boundaryWidth: 28,
                    collisionUplift: 70,
                    riftDepth: 28,
                    transformRoughness: 12,
                    macroNoise: 0.22,
                    macroFrequency: 0.002,
                    strength: 1,
                    ...params
                },
                paramSchema: {
                    seed: { type: 'number', min: 0, max: 999999, step: 1, randomize: true },
                    plates: { type: 'number', min: 3, max: 40, step: 1 },
                    continentalHeight: { type: 'number', min: 0, max: 100, step: 0.5 },
                    oceanDepth: { type: 'number', min: 0, max: 150, step: 0.5 },
                    boundaryWidth: { type: 'number', min: 1, max: 200, step: 0.5 },
                    collisionUplift: { type: 'number', min: 0, max: 300, step: 0.5 },
                    riftDepth: { type: 'number', min: 0, max: 200, step: 0.5 },
                    transformRoughness: { type: 'number', min: 0, max: 100, step: 0.25 },
                    macroNoise: { type: 'number', min: 0, max: 1, step: 0.01 },
                    macroFrequency: { type: 'number', min: 0.0001, max: 0.02, step: 0.0001 },
                    strength: { type: 'number', min: 0, max: 1, step: 0.01 }
                },
                inputs: {
                    base: { type: ValueType.HEIGHT, required: false }
                },
                outputs: {
                    height: { type: ValueType.HEIGHT },
                    boundaryMask: { type: ValueType.MASK },
                    continentalMask: { type: ValueType.MASK }
                }
            });
        }
        evaluate(context, inputs) {
            const p = this.params;
            const base = this.getHeightInput(inputs, 'base', context, true);
            const out = new Float32Array(context.count);
            const boundaryMask = new Float32Array(context.count);
            const continentalMask = new Float32Array(context.count);
            const seed = (Number(p.seed) || 0) + context.seed;
            const points = seededPoints(
                Math.max(3, Math.floor(p.plates)),
                context.width * 1.15,
                context.length * 1.15,
                seed
            );
            const noise = new FastSimplex2D(seed + 177);
            const width = Math.max(1e-6, p.boundaryWidth);
            for (let z = 0; z < context.sizeZ; z++) {
                const wz = context.worldZ(z);
                for (let x = 0; x < context.sizeX; x++) {
                    const wx = context.worldX(x);
                    const i = z * context.sizeX + x;
                    const nearest = nearestTwoPlates(points, wx, wz);
                    const plate = nearest.a;
                    const other = nearest.b || nearest.a;
                    const boundaryDistance = Math.abs(nearest.db - nearest.da);
                    const boundary = 1 - TerrainMath.smoothstep(
                        0,
                        width,
                        boundaryDistance
                    );
                    const dirX = other.x - plate.x;
                    const dirZ = other.z - plate.z;
                    const dirLength = Math.max(1e-6, Math.sqrt(dirX * dirX + dirZ * dirZ));
                    const nx = dirX / dirLength;
                    const nz = dirZ / dirLength;
                    const relativeVX = other.vx - plate.vx;
                    const relativeVZ = other.vz - plate.vz;
                    const convergence =
                        -(relativeVX * nx + relativeVZ * nz);
                    const tangentX = -nz;
                    const tangentZ = nx;
                    const transform =
                        Math.abs(
                            relativeVX * tangentX +
                            relativeVZ * tangentZ
                        );
                    const continental =
                        TerrainMath.smoothstep(
                            0.35,
                            0.7,
                            plate.value
                        );
                    const oceanic =
                        1 - continental;
                    let generated =
                        continental * p.continentalHeight -
                        oceanic * p.oceanDepth;
                    if (convergence > 0) {
                        generated +=
                            boundary *
                            convergence *
                            p.collisionUplift;
                    } else {
                        generated -=
                            boundary *
                            (-convergence) *
                            p.riftDepth;
                    }
                    const rough =
                        TerrainMath.ridgedFbm(
                            noise,
                            wx,
                            wz,
                            {
                                frequency: p.macroFrequency * 2.5,
                                octaves: 4,
                                lacunarity: 2.1,
                                gain: 0.5,
                                sharpness: 2.2
                            }
                        );
                    generated +=
                        boundary *
                        transform *
                        rough *
                        p.transformRoughness;
                    const macro =
                        TerrainMath.fbm(
                            noise,
                            wx + 83,
                            wz - 31,
                            {
                                frequency: p.macroFrequency,
                                octaves: 4,
                                lacunarity: 2,
                                gain: 0.52
                            }
                        );
                    generated +=
                        macro *
                        p.macroNoise *
                        Math.max(
                            p.continentalHeight,
                            p.collisionUplift * 0.25
                        );
                    out[i] =
                        TerrainMath.lerp(
                            base[i],
                            base[i] + generated,
                            p.strength
                        );
                    boundaryMask[i] =
                        TerrainMath.clamp01(boundary);
                    continentalMask[i] =
                        TerrainMath.clamp01(continental);
                }
            }
            return {
                height: out,
                boundaryMask,
                continentalMask
            };
        }
    }
    class OrogenyNode extends BaseTerrainNode {
        constructor(params = {}) {
            super({
                type: 'generator.orogeny',
                name: 'Fold / Orogeny',
                category: 'generator',
                params: {
                    seed: 4771,
                    amplitude: 82,
                    wavelength: 75,
                    angle: 30,
                    foldSharpness: 2.4,
                    warpStrength: 42,
                    warpFrequency: 0.0045,
                    secondaryFold: 0.35,
                    upliftNoise: 0.28,
                    strength: 1,
                    ...params
                },
                paramSchema: {
                    seed: { type: 'number', min: 0, max: 999999, step: 1, randomize: true },
                    amplitude: { type: 'number', min: 0, max: 400, step: 0.5 },
                    wavelength: { type: 'number', min: 5, max: 600, step: 0.5 },
                    angle: { type: 'number', min: -180, max: 180, step: 1 },
                    foldSharpness: { type: 'number', min: 0.5, max: 8, step: 0.05 },
                    warpStrength: { type: 'number', min: 0, max: 300, step: 0.5 },
                    warpFrequency: { type: 'number', min: 0.0001, max: 0.05, step: 0.0001 },
                    secondaryFold: { type: 'number', min: 0, max: 1, step: 0.01 },
                    upliftNoise: { type: 'number', min: 0, max: 1, step: 0.01 },
                    strength: { type: 'number', min: 0, max: 1, step: 0.01 }
                },
                inputs: {
                    base: { type: ValueType.HEIGHT, required: false },
                    mask: { type: ValueType.MASK, required: false }
                },
                outputs: {
                    height: { type: ValueType.HEIGHT }
                }
            });
        }
        evaluate(context, inputs) {
            const p = this.params;
            const base = this.getHeightInput(inputs, 'base', context, true);
            const mask = inputs?.mask instanceof Float32Array ? inputs.mask : null;
            const out = new Float32Array(context.count);
            const noise = new FastSimplex2D((Number(p.seed) || 0) + context.seed);
            const angle = p.angle * Math.PI / 180;
            const ca = Math.cos(angle);
            const sa = Math.sin(angle);
            const k = Math.PI * 2 / Math.max(1e-5, p.wavelength);
            for (let z = 0; z < context.sizeZ; z++) {
                const wz = context.worldZ(z);
                for (let x = 0; x < context.sizeX; x++) {
                    const wx = context.worldX(x);
                    const i = z * context.sizeX + x;
                    const warped = TerrainMath.domainWarp(noise, wx, wz, {
                        frequency: p.warpFrequency,
                        strength: p.warpStrength,
                        octaves: 3
                    });
                    const u = warped.x * ca + warped.y * sa;
                    const v = -warped.x * sa + warped.y * ca;
                    const foldA =
                        Math.pow(
                            0.5 + 0.5 * Math.sin(u * k),
                            p.foldSharpness
                        );
                    const foldB =
                        Math.pow(
                            0.5 +
                            0.5 *
                            Math.sin(
                                (
                                    u * 0.52 +
                                    v * 0.18
                                ) *
                                k *
                                1.37 +
                                1.1
                            ),
                            p.foldSharpness * 0.8
                        ) *
                        p.secondaryFold;
                    const uplift =
                        0.72 +
                        TerrainMath.fbm(
                            noise,
                            wx + 91,
                            wz - 47,
                            {
                                frequency: p.warpFrequency * 0.7,
                                octaves: 4,
                                lacunarity: 2,
                                gain: 0.52
                            }
                        ) *
                        p.upliftNoise;
                    const generated =
                        (foldA + foldB) *
                        uplift *
                        p.amplitude;
                    const m =
                        mask
                            ? TerrainMath.clamp01(mask[i])
                            : 1;
                    out[i] =
                        base[i] +
                        generated *
                        p.strength *
                        m;
                }
            }
            return { height: out };
        }
    }
    class VolcanicFieldNode extends BaseTerrainNode {
        constructor(params = {}) {
            super({
                type: 'generator.volcanicField',
                name: 'Volcanic Field',
                category: 'generator',
                params: {
                    seed: 6174,
                    volcanoes: 7,
                    minRadius: 24,
                    maxRadius: 85,
                    minHeight: 25,
                    maxHeight: 110,
                    craterRadius: 0.18,
                    craterDepth: 0.22,
                    calderaChance: 0.22,
                    lavaRoughness: 0.12,
                    strength: 1,
                    ...params
                },
                paramSchema: {
                    seed: { type: 'number', min: 0, max: 999999, step: 1, randomize: true },
                    volcanoes: { type: 'number', min: 1, max: 40, step: 1 },
                    minRadius: { type: 'number', min: 2, max: 300, step: 0.5 },
                    maxRadius: { type: 'number', min: 3, max: 500, step: 0.5 },
                    minHeight: { type: 'number', min: 0, max: 300, step: 0.5 },
                    maxHeight: { type: 'number', min: 0, max: 500, step: 0.5 },
                    craterRadius: { type: 'number', min: 0.02, max: 0.6, step: 0.01 },
                    craterDepth: { type: 'number', min: 0, max: 1, step: 0.01 },
                    calderaChance: { type: 'number', min: 0, max: 1, step: 0.01 },
                    lavaRoughness: { type: 'number', min: 0, max: 1, step: 0.01 },
                    strength: { type: 'number', min: 0, max: 1, step: 0.01 }
                },
                inputs: {
                    base: { type: ValueType.HEIGHT, required: false }
                },
                outputs: {
                    height: { type: ValueType.HEIGHT },
                    volcanicMask: { type: ValueType.MASK }
                }
            });
        }
        evaluate(context, inputs) {
            const p = this.params;
            const base = this.getHeightInput(inputs, 'base', context, true);
            const out = new Float32Array(base);
            const mask = new Float32Array(context.count);
            const seed = (Number(p.seed) || 0) + context.seed;
            const random = TerrainMath.mulberry32(TerrainMath.hash32(seed));
            const noise = new FastSimplex2D(seed + 121);
            const volcanoes = [];
            for (let i = 0; i < Math.floor(p.volcanoes); i++) {
                const radius = TerrainMath.lerp(p.minRadius, p.maxRadius, random());
                const height = TerrainMath.lerp(p.minHeight, p.maxHeight, random());
                volcanoes.push({
                    x: (random() - 0.5) * context.width * 0.92,
                    z: (random() - 0.5) * context.length * 0.92,
                    radius,
                    height,
                    caldera: random() < p.calderaChance
                });
            }
            for (let z = 0; z < context.sizeZ; z++) {
                const wz = context.worldZ(z);
                for (let x = 0; x < context.sizeX; x++) {
                    const wx = context.worldX(x);
                    const idx = z * context.sizeX + x;
                    let delta = 0;
                    let localMask = 0;
                    for (let v = 0; v < volcanoes.length; v++) {
                        const volcano = volcanoes[v];
                        const dx = wx - volcano.x;
                        const dz = wz - volcano.z;
                        const d = Math.sqrt(dx * dx + dz * dz);
                        const r = d / Math.max(1e-6, volcano.radius);
                        if (r > 1.45) continue;
                        const cone =
                            Math.max(0, 1 - r) *
                            volcano.height;
                        const craterCenter =
                            p.craterRadius;
                        const crater =
                            Math.exp(
                                -Math.pow(
                                    r /
                                    Math.max(0.01, craterCenter),
                                    2
                                ) *
                                4
                            ) *
                            volcano.height *
                            p.craterDepth *
                            (volcano.caldera ? 2.0 : 1.0);
                        const lava =
                            TerrainMath.ridgedFbm(
                                noise,
                                wx + v * 19.7,
                                wz - v * 11.1,
                                {
                                    frequency: 0.025,
                                    octaves: 3,
                                    lacunarity: 2.1,
                                    gain: 0.5,
                                    sharpness: 2.2
                                }
                            ) *
                            p.lavaRoughness *
                            volcano.height *
                            Math.max(0, 1 - r);
                        delta +=
                            cone -
                            crater +
                            lava;
                        localMask =
                            Math.max(
                                localMask,
                                TerrainMath.clamp01(
                                    1 - r / 1.25
                                )
                            );
                    }
                    out[idx] =
                        base[idx] +
                        delta * p.strength;
                    mask[idx] =
                        localMask;
                }
            }
            return {
                height: out,
                volcanicMask: mask
            };
        }
    }
    class BadlandsNode extends BaseTerrainNode {
        constructor(params = {}) {
            super({
                type: 'generator.badlands',
                name: 'Badlands / Hoodoos',
                category: 'generator',
                params: {
                    seed: 1103,
                    amplitude: 38,
                    frequency: 0.012,
                    ridges: 0.75,
                    drainage: 0.6,
                    terraceHeight: 5,
                    terraceStrength: 0.45,
                    warpStrength: 22,
                    strength: 1,
                    ...params
                },
                paramSchema: {
                    seed: { type: 'number', min: 0, max: 999999, step: 1, randomize: true },
                    amplitude: { type: 'number', min: 0, max: 200, step: 0.5 },
                    frequency: { type: 'number', min: 0.0002, max: 0.1, step: 0.0001 },
                    ridges: { type: 'number', min: 0, max: 2, step: 0.01 },
                    drainage: { type: 'number', min: 0, max: 2, step: 0.01 },
                    terraceHeight: { type: 'number', min: 0.1, max: 50, step: 0.1 },
                    terraceStrength: { type: 'number', min: 0, max: 1, step: 0.01 },
                    warpStrength: { type: 'number', min: 0, max: 150, step: 0.25 },
                    strength: { type: 'number', min: 0, max: 1, step: 0.01 }
                },
                inputs: {
                    base: { type: ValueType.HEIGHT, required: false }
                },
                outputs: {
                    height: { type: ValueType.HEIGHT }
                }
            });
        }
        evaluate(context, inputs) {
            const p = this.params;
            const base = this.getHeightInput(inputs, 'base', context, true);
            const out = new Float32Array(context.count);
            const noise = new FastSimplex2D((Number(p.seed) || 0) + context.seed);
            for (let z = 0; z < context.sizeZ; z++) {
                const wz = context.worldZ(z);
                for (let x = 0; x < context.sizeX; x++) {
                    const wx = context.worldX(x);
                    const i = z * context.sizeX + x;
                    const warped =
                        TerrainMath.domainWarp(
                            noise,
                            wx,
                            wz,
                            {
                                frequency: p.frequency * 0.35,
                                strength: p.warpStrength,
                                octaves: 3
                            }
                        );
                    const ridge =
                        TerrainMath.ridgedFbm(
                            noise,
                            warped.x,
                            warped.y,
                            {
                                frequency: p.frequency,
                                octaves: 6,
                                lacunarity: 2.12,
                                gain: 0.52,
                                sharpness: 2.8
                            }
                        );
                    const drainage =
                        Math.abs(
                            TerrainMath.fbm(
                                noise,
                                warped.x + 73,
                                warped.y - 41,
                                {
                                    frequency: p.frequency * 0.58,
                                    octaves: 5,
                                    lacunarity: 2.05,
                                    gain: 0.52
                                }
                            )
                        );
                    let generated =
                        (
                            ridge * p.ridges -
                            drainage * p.drainage * 0.45
                        ) *
                        p.amplitude;
                    const step =
                        Math.max(0.01, p.terraceHeight);
                    const terraced =
                        Math.floor(generated / step) *
                        step;
                    generated =
                        TerrainMath.lerp(
                            generated,
                            terraced,
                            p.terraceStrength
                        );
                    out[i] =
                        base[i] +
                        generated *
                        p.strength;
                }
            }
            return { height: out };
        }
    }
    class CraterFieldNode extends BaseTerrainNode {
        constructor(params = {}) {
            super({
                type: 'generator.craterField',
                name: 'Crater Field',
                category: 'generator',
                params: {
                    seed: 5502,
                    count: 35,
                    minRadius: 4,
                    maxRadius: 42,
                    depth: 0.32,
                    rimHeight: 0.16,
                    ejecta: 0.12,
                    powerLaw: 2.2,
                    strength: 1,
                    ...params
                },
                paramSchema: {
                    seed: { type: 'number', min: 0, max: 999999, step: 1, randomize: true },
                    count: { type: 'number', min: 1, max: 300, step: 1 },
                    minRadius: { type: 'number', min: 0.5, max: 100, step: 0.25 },
                    maxRadius: { type: 'number', min: 1, max: 400, step: 0.25 },
                    depth: { type: 'number', min: 0, max: 1, step: 0.01 },
                    rimHeight: { type: 'number', min: 0, max: 1, step: 0.01 },
                    ejecta: { type: 'number', min: 0, max: 1, step: 0.01 },
                    powerLaw: { type: 'number', min: 0.5, max: 5, step: 0.05 },
                    strength: { type: 'number', min: 0, max: 1, step: 0.01 }
                },
                inputs: {
                    base: { type: ValueType.HEIGHT, required: false }
                },
                outputs: {
                    height: { type: ValueType.HEIGHT },
                    craterMask: { type: ValueType.MASK }
                }
            });
        }
        evaluate(context, inputs) {
            const p = this.params;
            const base = this.getHeightInput(inputs, 'base', context, true);
            const out = new Float32Array(base);
            const craterMask = new Float32Array(context.count);
            const seed = (Number(p.seed) || 0) + context.seed;
            const random = TerrainMath.mulberry32(TerrainMath.hash32(seed));
            const craters = [];
            const minRadius = Math.max(0.1, p.minRadius);
            const maxRadius = Math.max(minRadius, p.maxRadius);
            for (let c = 0; c < Math.floor(p.count); c++) {
                const u = random();
                const radius =
                    minRadius +
                    (maxRadius - minRadius) *
                    Math.pow(
                        u,
                        Math.max(0.01, p.powerLaw)
                    );
                craters.push({
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
                    let delta = 0;
                    let mask = 0;
                    for (let c = 0; c < craters.length; c++) {
                        const crater = craters[c];
                        const dx = wx - crater.x;
                        const dz = wz - crater.z;
                        const d = Math.sqrt(dx * dx + dz * dz);
                        const r = d / crater.radius;
                        if (r > 2.0) continue;
                        const bowl =
                            -Math.max(0, 1 - r * r) *
                            crater.radius *
                            p.depth;
                        const rim =
                            Math.exp(
                                -Math.pow(
                                    (r - 1) / 0.15,
                                    2
                                )
                            ) *
                            crater.radius *
                            p.rimHeight;
                        const ejecta =
                            r > 1
                                ? Math.exp(
                                    -(r - 1) * 2.8
                                ) *
                                crater.radius *
                                p.ejecta
                                : 0;
                        delta +=
                            bowl +
                            rim +
                            ejecta;
                        mask =
                            Math.max(
                                mask,
                                TerrainMath.clamp01(
                                    1 - r / 1.5
                                )
                            );
                    }
                    out[i] =
                        base[i] +
                        delta *
                        p.strength;
                    craterMask[i] =
                        mask;
                }
            }
            return {
                height: out,
                craterMask
            };
        }
    }
    registry.register('generator.plateTectonics', PlateTectonicsNode, {
        label: 'Plate Tectonics',
        category: 'generator',
        icon: 'fa-earth-americas',
        role: 'Plate collision / rift macro terrain',
        cost: 'HIGH',
        keywords: ['tectonic', 'plates', 'continent', 'rift', 'collision']
    });
    registry.register('generator.orogeny', OrogenyNode, {
        label: 'Fold / Orogeny',
        category: 'generator',
        icon: 'fa-mountain',
        role: 'Folded mountain belts',
        cost: 'MED',
        keywords: ['orogeny', 'fold', 'mountain', 'geology']
    });
    registry.register('generator.volcanicField', VolcanicFieldNode, {
        label: 'Volcanic Field',
        category: 'generator',
        icon: 'fa-volcano',
        role: 'Volcanoes, calderas and lava roughness',
        cost: 'MED',
        keywords: ['volcano', 'caldera', 'lava', 'cone']
    });
    registry.register('generator.badlands', BadlandsNode, {
        label: 'Badlands / Hoodoos',
        category: 'generator',
        icon: 'fa-mountain-sun',
        role: 'Rilled badlands morphology',
        cost: 'MED',
        keywords: ['badlands', 'hoodoos', 'rills', 'desert']
    });
    registry.register('generator.craterField', CraterFieldNode, {
        label: 'Crater Field',
        category: 'generator',
        icon: 'fa-meteor',
        role: 'Power-law impact crater distribution',
        cost: 'MED',
        keywords: ['crater', 'moon', 'meteor', 'impact']
    });
    Object.assign(NS, {
        PlateTectonicsNode,
        OrogenyNode,
        VolcanicFieldNode,
        BadlandsNode,
        CraterFieldNode
    });
})(window);
