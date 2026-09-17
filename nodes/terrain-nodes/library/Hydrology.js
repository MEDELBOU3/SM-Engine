// ============================================================================
// nodes/terrain-nodes/library/Hydrology.js
// SM Engine Terrain Nodes - Drainage, rivers, stream-power erosion, deposition
//
// Adds:
// - Flow Analysis
// - River Network
// - Stream Power Erosion
// - Alluvial Deposition
// - Wetness Index
// ============================================================================
(function (global) {
    'use strict';
    const NS = global.SMTerrainNodes;
    const registry = global.SMTerrainNodeRegistry;
    if (!NS?.BaseTerrainNode || !registry) {
        throw new Error('[Terrain Nodes] Load core scripts before Hydrology.js');
    }
    const {
        BaseTerrainNode,
        TerrainMath,
        ValueType
    } = NS;
    const NEIGHBOURS = [
        [-1, -1, Math.SQRT2],
        [ 0, -1, 1],
        [ 1, -1, Math.SQRT2],
        [-1,  0, 1],
        [ 1,  0, 1],
        [-1,  1, Math.SQRT2],
        [ 0,  1, 1],
        [ 1,  1, Math.SQRT2]
    ];
    function computeFlow(height, context) {
        const sizeX = context.sizeX;
        const sizeZ = context.sizeZ;
        const count = context.count;
        const receiver = new Int32Array(count);
        receiver.fill(-1);
        const slope = new Float32Array(count);
        const order = new Array(count);
        for (let i = 0; i < count; i++) {
            order[i] = i;
        }
        for (let z = 0; z < sizeZ; z++) {
            for (let x = 0; x < sizeX; x++) {
                const i = z * sizeX + x;
                const h = height[i];
                let bestDrop = 0;
                let best = -1;
                for (let n = 0; n < NEIGHBOURS.length; n++) {
                    const ox = NEIGHBOURS[n][0];
                    const oz = NEIGHBOURS[n][1];
                    const distance = NEIGHBOURS[n][2];
                    const nx = x + ox;
                    const nz = z + oz;
                    if (
                        nx < 0 ||
                        nx >= sizeX ||
                        nz < 0 ||
                        nz >= sizeZ
                    ) {
                        continue;
                    }
                    const ni = nz * sizeX + nx;
                    const drop =
                        (h - height[ni]) /
                        (
                            distance *
                            Math.min(
                                context.cellSizeX,
                                context.cellSizeZ
                            )
                        );
                    if (drop > bestDrop) {
                        bestDrop = drop;
                        best = ni;
                    }
                }
                receiver[i] = best;
                slope[i] = Math.max(0, bestDrop);
            }
        }
        order.sort((a, b) => height[b] - height[a]);
        const accumulation = new Float32Array(count);
        accumulation.fill(1);
        for (let o = 0; o < order.length; o++) {
            const i = order[o];
            const r = receiver[i];
            if (r >= 0) {
                accumulation[r] += accumulation[i];
            }
        }
        return {
            receiver,
            accumulation,
            slope
        };
    }
    class FlowAnalysisNode extends BaseTerrainNode {
        constructor(params = {}) {
            super({
                type: 'hydrology.flowAnalysis',
                name: 'Flow Analysis',
                category: 'mask',
                params: {
                    accumulationScale: 1,
                    logResponse: true,
                    slopeInfluence: 0.15,
                    ...params
                },
                paramSchema: {
                    accumulationScale: { type: 'number', min: 0.01, max: 20, step: 0.01 },
                    logResponse: { type: 'boolean' },
                    slopeInfluence: { type: 'number', min: 0, max: 2, step: 0.01 }
                },
                inputs: {
                    height: { type: ValueType.HEIGHT, required: true }
                },
                outputs: {
                    flowMask: { type: ValueType.MASK },
                    slopeMask: { type: ValueType.MASK }
                }
            });
        }
        evaluate(context, inputs) {
            const height = this.getHeightInput(inputs, 'height', context, true);
            const flow = computeFlow(height, context);
            const flowMask = new Float32Array(context.count);
            const slopeMask = new Float32Array(context.count);
            let maxAccum = 1;
            let maxSlope = 1e-6;
            for (let i = 0; i < context.count; i++) {
                if (flow.accumulation[i] > maxAccum) {
                    maxAccum = flow.accumulation[i];
                }
                if (flow.slope[i] > maxSlope) {
                    maxSlope = flow.slope[i];
                }
            }
            for (let i = 0; i < context.count; i++) {
                let a =
                    flow.accumulation[i] /
                    maxAccum;
                if (this.params.logResponse) {
                    a =
                        Math.log1p(
                            flow.accumulation[i] *
                            this.params.accumulationScale
                        ) /
                        Math.log1p(
                            maxAccum *
                            this.params.accumulationScale
                        );
                } else {
                    a *=
                        this.params.accumulationScale;
                }
                const s =
                    flow.slope[i] /
                    maxSlope;
                flowMask[i] =
                    TerrainMath.clamp01(
                        a +
                        s *
                        this.params.slopeInfluence *
                        a
                    );
                slopeMask[i] =
                    TerrainMath.clamp01(s);
            }
            return {
                flowMask,
                slopeMask
            };
        }
    }
    class RiverNetworkNode extends BaseTerrainNode {
        constructor(params = {}) {
            super({
                type: 'hydrology.riverNetwork',
                name: 'River Network',
                category: 'geology',
                params: {
                    threshold: 0.035,
                    width: 2.5,
                    depth: 8,
                    bankWidth: 2,
                    bankHeight: 0.8,
                    smoothPasses: 2,
                    strength: 1,
                    ...params
                },
                paramSchema: {
                    threshold: { type: 'number', min: 0.0001, max: 0.5, step: 0.0005 },
                    width: { type: 'number', min: 0.5, max: 15, step: 0.25 },
                    depth: { type: 'number', min: 0, max: 80, step: 0.25 },
                    bankWidth: { type: 'number', min: 0, max: 8, step: 0.25 },
                    bankHeight: { type: 'number', min: 0, max: 20, step: 0.1 },
                    smoothPasses: { type: 'number', min: 0, max: 8, step: 1 },
                    strength: { type: 'number', min: 0, max: 1, step: 0.01 }
                },
                inputs: {
                    height: { type: ValueType.HEIGHT, required: true }
                },
                outputs: {
                    height: { type: ValueType.HEIGHT },
                    riverMask: { type: ValueType.MASK }
                }
            });
        }
        evaluate(context, inputs) {
            const p = this.params;
            const source = this.getHeightInput(inputs, 'height', context, true);
            const flow = computeFlow(source, context);
            let maxAccum = 1;
            for (let i = 0; i < context.count; i++) {
                maxAccum = Math.max(maxAccum, flow.accumulation[i]);
            }
            const rawMask = new Float32Array(context.count);
            for (let i = 0; i < context.count; i++) {
                const normalized =
                    Math.log1p(flow.accumulation[i]) /
                    Math.log1p(maxAccum);
                rawMask[i] =
                    TerrainMath.smoothstep(
                        p.threshold,
                        Math.min(1, p.threshold * 2.8 + 0.01),
                        normalized
                    );
            }
            let riverMask = rawMask;
            const blurStrength =
                TerrainMath.clamp01(
                    p.width /
                    8
                );
            for (let pass = 0; pass < Math.floor(p.smoothPasses); pass++) {
                riverMask =
                    TerrainMath.blur3x3(
                        riverMask,
                        context.sizeX,
                        context.sizeZ,
                        blurStrength
                    );
            }
            const out = new Float32Array(source);
            const bankBlur =
                TerrainMath.blur3x3(
                    riverMask,
                    context.sizeX,
                    context.sizeZ,
                    TerrainMath.clamp01(p.bankWidth / 8)
                );
            for (let i = 0; i < context.count; i++) {
                const channel =
                    TerrainMath.clamp01(
                        riverMask[i]
                    );
                const bank =
                    Math.max(
                        0,
                        bankBlur[i] -
                        channel
                    );
                out[i] =
                    source[i] -
                    channel *
                    p.depth *
                    p.strength +
                    bank *
                    p.bankHeight *
                    p.strength;
            }
            return {
                height: out,
                riverMask
            };
        }
    }
    class StreamPowerErosionNode extends BaseTerrainNode {
        constructor(params = {}) {
            super({
                type: 'hydrology.streamPower',
                name: 'Stream Power Erosion',
                category: 'geology',
                params: {
                    iterations: 8,
                    erosionRate: 0.12,
                    areaExponent: 0.45,
                    slopeExponent: 1,
                    maxCutPerIteration: 2,
                    deposition: 0.18,
                    strength: 1,
                    ...params
                },
                paramSchema: {
                    iterations: { type: 'number', min: 1, max: 60, step: 1 },
                    erosionRate: { type: 'number', min: 0, max: 2, step: 0.01 },
                    areaExponent: { type: 'number', min: 0, max: 2, step: 0.01 },
                    slopeExponent: { type: 'number', min: 0, max: 3, step: 0.01 },
                    maxCutPerIteration: { type: 'number', min: 0.01, max: 20, step: 0.05 },
                    deposition: { type: 'number', min: 0, max: 1, step: 0.01 },
                    strength: { type: 'number', min: 0, max: 1, step: 0.01 }
                },
                inputs: {
                    height: { type: ValueType.HEIGHT, required: true }
                },
                outputs: {
                    height: { type: ValueType.HEIGHT },
                    erosionMask: { type: ValueType.MASK }
                }
            });
        }
        evaluate(context, inputs) {
            const p = this.params;
            const original = this.getHeightInput(inputs, 'height', context, true);
            let working = new Float32Array(original);
            const erosionMask = new Float32Array(context.count);
            for (let iteration = 0; iteration < Math.floor(p.iterations); iteration++) {
                const flow = computeFlow(working, context);
                let maxAccum = 1;
                for (let i = 0; i < context.count; i++) {
                    maxAccum = Math.max(maxAccum, flow.accumulation[i]);
                }
                const next = new Float32Array(working);
                for (let i = 0; i < context.count; i++) {
                    const receiver = flow.receiver[i];
                    if (receiver < 0) continue;
                    const area =
                        Math.max(
                            1e-6,
                            flow.accumulation[i] /
                            maxAccum
                        );
                    const slope =
                        Math.max(
                            1e-6,
                            flow.slope[i]
                        );
                    const power =
                        Math.pow(
                            area,
                            p.areaExponent
                        ) *
                        Math.pow(
                            slope,
                            p.slopeExponent
                        );
                    const cut =
                        Math.min(
                            p.maxCutPerIteration,
                            power *
                            p.erosionRate
                        );
                    next[i] -= cut;
                    next[receiver] +=
                        cut *
                        p.deposition;
                    erosionMask[i] =
                        Math.max(
                            erosionMask[i],
                            TerrainMath.clamp01(
                                power * 2.5
                            )
                        );
                }
                working = next;
            }
            const out = new Float32Array(context.count);
            for (let i = 0; i < context.count; i++) {
                out[i] =
                    TerrainMath.lerp(
                        original[i],
                        working[i],
                        p.strength
                    );
            }
            return {
                height: out,
                erosionMask
            };
        }
    }
    class AlluvialDepositionNode extends BaseTerrainNode {
        constructor(params = {}) {
            super({
                type: 'hydrology.alluvial',
                name: 'Alluvial Deposition',
                category: 'geology',
                params: {
                    flowThreshold: 0.025,
                    lowSlope: 0.22,
                    amount: 4,
                    spread: 0.65,
                    strength: 1,
                    ...params
                },
                paramSchema: {
                    flowThreshold: { type: 'number', min: 0.0001, max: 0.5, step: 0.0005 },
                    lowSlope: { type: 'number', min: 0.001, max: 2, step: 0.005 },
                    amount: { type: 'number', min: 0, max: 40, step: 0.1 },
                    spread: { type: 'number', min: 0, max: 1, step: 0.01 },
                    strength: { type: 'number', min: 0, max: 1, step: 0.01 }
                },
                inputs: {
                    height: { type: ValueType.HEIGHT, required: true }
                },
                outputs: {
                    height: { type: ValueType.HEIGHT },
                    depositionMask: { type: ValueType.MASK }
                }
            });
        }
        evaluate(context, inputs) {
            const p = this.params;
            const source = this.getHeightInput(inputs, 'height', context, true);
            const flow = computeFlow(source, context);
            let maxAccum = 1;
            for (let i = 0; i < context.count; i++) {
                maxAccum = Math.max(maxAccum, flow.accumulation[i]);
            }
            let mask = new Float32Array(context.count);
            for (let i = 0; i < context.count; i++) {
                const area =
                    Math.log1p(flow.accumulation[i]) /
                    Math.log1p(maxAccum);
                const river =
                    TerrainMath.smoothstep(
                        p.flowThreshold,
                        p.flowThreshold * 3 + 0.01,
                        area
                    );
                const flat =
                    1 -
                    TerrainMath.smoothstep(
                        p.lowSlope,
                        p.lowSlope * 2.5,
                        flow.slope[i]
                    );
                mask[i] =
                    TerrainMath.clamp01(
                        river * flat
                    );
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
                depositionMask: mask
            };
        }
    }
    class WetnessIndexNode extends BaseTerrainNode {
        constructor(params = {}) {
            super({
                type: 'mask.wetness',
                name: 'Topographic Wetness',
                category: 'mask',
                params: {
                    flowWeight: 1,
                    flatnessWeight: 0.65,
                    ...params
                },
                paramSchema: {
                    flowWeight: { type: 'number', min: 0, max: 3, step: 0.01 },
                    flatnessWeight: { type: 'number', min: 0, max: 3, step: 0.01 }
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
            const source = this.getHeightInput(inputs, 'height', context, true);
            const flow = computeFlow(source, context);
            const out = new Float32Array(context.count);
            let maxAccum = 1;
            let maxSlope = 1e-6;
            for (let i = 0; i < context.count; i++) {
                maxAccum = Math.max(maxAccum, flow.accumulation[i]);
                maxSlope = Math.max(maxSlope, flow.slope[i]);
            }
            for (let i = 0; i < context.count; i++) {
                const a =
                    Math.log1p(flow.accumulation[i]) /
                    Math.log1p(maxAccum);
                const flat =
                    1 -
                    TerrainMath.clamp01(
                        flow.slope[i] /
                        maxSlope
                    );
                out[i] =
                    TerrainMath.clamp01(
                        a *
                        this.params.flowWeight +
                        flat *
                        this.params.flatnessWeight *
                        a
                    );
            }
            return { mask: out };
        }
    }
    NS.computeTerrainFlow = computeFlow;
    registry.register('hydrology.flowAnalysis', FlowAnalysisNode, {
        label: 'Flow Analysis',
        category: 'mask',
        icon: 'fa-water',
        role: 'Flow accumulation + drainage mask',
        cost: 'MED',
        keywords: ['flow', 'drainage', 'watershed', 'river']
    });
    registry.register('hydrology.riverNetwork', RiverNetworkNode, {
        label: 'River Network',
        category: 'geology',
        icon: 'fa-water',
        role: 'Carve drainage-derived rivers',
        cost: 'HIGH',
        keywords: ['river', 'channel', 'drainage', 'water']
    });
    registry.register('hydrology.streamPower', StreamPowerErosionNode, {
        label: 'Stream Power Erosion',
        category: 'geology',
        icon: 'fa-droplet',
        role: 'Fluvial incision by discharge + slope',
        cost: 'HIGH',
        keywords: ['stream power', 'river erosion', 'fluvial']
    });
    registry.register('hydrology.alluvial', AlluvialDepositionNode, {
        label: 'Alluvial Deposition',
        category: 'geology',
        icon: 'fa-layer-group',
        role: 'Floodplain / fan sediment deposition',
        cost: 'MED',
        keywords: ['alluvial', 'deposition', 'sediment', 'floodplain']
    });
    registry.register('mask.wetness', WetnessIndexNode, {
        label: 'Topographic Wetness',
        category: 'mask',
        icon: 'fa-droplet',
        role: 'Wet valleys and low-drainage zones',
        cost: 'MED',
        keywords: ['wetness', 'moisture', 'biome', 'water']
    });
    Object.assign(NS, {
        FlowAnalysisNode,
        RiverNetworkNode,
        StreamPowerErosionNode,
        AlluvialDepositionNode,
        WetnessIndexNode
    });
})(window);
