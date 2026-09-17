const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const bridgeSource = fs.readFileSync(
    path.join(__dirname, '..', 'sculpting', 'sculpt_wasm_bridge.js'),
    'utf8'
);

const memory = new ArrayBuffer(1024 * 1024);
const heap = {
    HEAP32: new Int32Array(memory),
    HEAPF32: new Float32Array(memory),
    HEAPU32: new Uint32Array(memory),
    HEAPU8: new Uint8Array(memory)
};

let nextPointer = 1024;
let meshVertexCount = 0;
let meshTriangleCount = 0;

function alloc(bytes) {
    const pointer = nextPointer;
    nextPointer += Math.max(4, Math.ceil(bytes / 4) * 4);
    return pointer;
}

const moduleInstance = {
    ...heap,
    cwrap(name) {
        return (...args) => {
            switch (name) {
                case 'wasm_alloc':
                    return alloc(args[0]);
                case 'get_abi_version':
                    return 4;
                case 'set_mesh':
                    meshVertexCount = args[4];
                    meshTriangleCount = args[5];
                    return undefined;
                case 'get_mesh_vertex_count':
                    return meshVertexCount;
                case 'get_mesh_triangle_count':
                    return meshTriangleCount;
                case 'clear_mesh_state':
                    meshVertexCount = 0;
                    meshTriangleCount = 0;
                    return undefined;
                case 'terrain_get_dirty_rect':
                    heap.HEAP32[args[0] >> 2] = 0;
                    heap.HEAP32[args[1] >> 2] = 1;
                    heap.HEAP32[args[2] >> 2] = 0;
                    heap.HEAP32[args[3] >> 2] = 1;
                    return 1;
                case 'terrain_apply_brush':
                    return 1;
                case 'render_analyze_luminance':
                    heap.HEAPF32[args[4] >> 2] = 0.24;
                    heap.HEAPF32[(args[4] >> 2) + 1] = 0.3;
                    heap.HEAPF32[(args[4] >> 2) + 2] = 0.04;
                    heap.HEAPF32[(args[4] >> 2) + 3] = 0.82;
                    heap.HEAP32[args[5] >> 2] = 4;
                    return 1;
                case 'render_select_lights':
                    for (let i = 0; i < args[1]; i++) {
                        heap.HEAPU8[args[8] + i] = i === 0 ? 1 : 0;
                        heap.HEAPF32[(args[9] >> 2) + i] = 1 / Math.max(1, i + 1);
                    }
                    return 1;
                case 'terrain_bind':
                case 'terrain_sync':
                case 'terrain_clear_state':
                    return undefined;
                case 'build_bvh':
                case 'refit_bvh':
                case 'build_adjacency':
                case 'rebuild_bvh':
                    return undefined;
                case 'query_radius':
                    heap.HEAP32[args[4] >> 2] = 1;
                    heap.HEAPF32[args[5] >> 2] = 0.5;
                    return 1;
                default:
                    return undefined;
            }
        };
    },
    getValue(pointer, type) {
        return type === 'i32' ? heap.HEAP32[pointer >> 2] : 0;
    },
    setValue(pointer, value, type) {
        if (type === 'i32') heap.HEAP32[pointer >> 2] = value;
    }
};

const context = {
    console,
    Float32Array,
        Uint32Array,
        Uint8Array,
    Int32Array,
    ArrayBuffer,
    Math,
    Number,
    Object,
    Promise,
    SculptEngineWASM: async () => moduleInstance,
    window: {}
};

vm.runInNewContext(bridgeSource, context, {
    filename: 'sculpting/sculpt_wasm_bridge.js'
});

const bridge = context.window.SculptWASM;

(async () => {
    assert.equal(await bridge.init(), true);
    assert.equal(bridge.getStatus().abiVersion, 4);
    assert.equal(bridge.getStatus().renderNative, true);

    const luminance = bridge.analyzeLuminance(new Uint8Array(2 * 2 * 4), 2, 2, 0.78);
    assert.equal(luminance.native, true);
    assert.ok(Math.abs(luminance.luminance - 0.24) < 1e-5);
    assert.equal(luminance.samples, 4);

    const lightSelection = bridge.selectLights([
        { x: 0, y: 0, z: 0, range: 10, intensity: 5, type: 'point' },
        { x: 8, y: 0, z: 0, range: 10, intensity: 1, type: 'spot' }
    ], { x: 0, y: 0, z: 0 }, 120, 1, 1);
    assert.equal(lightSelection.native, true);
    assert.equal(lightSelection.selected, 1);
    assert.equal(lightSelection.visible[0], 1);
    assert.equal(lightSelection.visible[1], 0);

    const mesh = {
        geometry: {
            attributes: {
                position: {
                    array: new Float32Array([0, 0, 0, 1, 0, 0]),
                    count: 2
                },
                normal: {
                    array: new Float32Array([0, 1, 0, 0, 1, 0])
                }
            },
            index: { array: new Uint32Array([0, 1, 0]) }
        }
    };

    bridge.setMesh(mesh, new Float32Array([0, 0]), [[], []]);
    assert.equal(bridge.getStatus().verts, 2);
    assert.equal(bridge.getStatus().triangles, 1);
    const nativeHits = bridge.queryRadius({ x: 0, y: 0, z: 0 }, 1);
    assert.equal(nativeHits.length, 1);
    assert.equal(nativeHits[0].index, 1);
    assert.equal(nativeHits[0].dist, 0.5);

    const terrainData = {
        heights: new Float32Array([0, 0, 0, 0]),
        version: 0
    };
    const terrainResult = bridge.applyTerrainTool({
        data: terrainData,
        grid: { width: 2, height: 2 },
        dimensions: { width: 10, length: 10 },
        center: { x: 0.5, z: 0.5 },
        radius: 2,
        strength: 0.5,
        pressure: 1,
        falloff: 0.5,
        heightScale: 1,
        tool: 'raiseLower'
    });
    assert.equal(terrainResult.native, true);
    assert.equal(terrainResult.minX, 0);
    assert.equal(terrainResult.maxZ, 1);
    assert.equal(bridge.getStatus().terrainBound, true);

    bridge.dispose();
    assert.equal(bridge.isReady(), false);
    assert.equal(bridge.getStatus().meshBound, false);

    console.log(JSON.stringify({
        passed: true,
        abi: 4,
        nativeQuery: true,
        nativeTerrain: true,
        disposed: true
    }));
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
