const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(
    path.join(
        __dirname,
        '..',
        'engine',
        'native',
        'water',
        'NativeWaterWasmBridge.js'
    ),
    'utf8'
);

async function main() {
    const memory = new ArrayBuffer(1024 * 1024);
    const heapF64 = new Float64Array(memory);
    const heapU8 = new Uint8Array(memory);
    let nextPointer = 1024;
    const calls = [];

    const module = {
        HEAPF64: heapF64,
        HEAPU8: heapU8,
        _malloc(bytes) {
            const pointer = nextPointer;
            nextPointer += Math.max(8, Math.ceil(bytes / 8) * 8);
            return pointer;
        },
        _free() {},
        cwrap(name) {
            return (...args) => {
                if (name === 'water_upsert_body') {
                    calls.push({
                        name,
                        id: args[0],
                        config: Array.from(
                            heapF64.subarray(args[1] >> 3, (args[1] >> 3) + 27)
                        ),
                        pointCount: args[3]
                    });
                    return 1;
                }

                if (name === 'water_sample_body') {
                    heapF64.set(
                        [2.25, 0.1, 0.98, -0.04, 1.5, 0, 0.2, 0.03, 6],
                        args[3] >> 3
                    );
                    const bodyId = 'river-01';
                    for (let index = 0; index < bodyId.length; index += 1) {
                        heapU8[args[4] + index] = bodyId.charCodeAt(index);
                    }
                    heapU8[args[4] + bodyId.length] = 0;
                    return 1;
                }

                if (name === 'water_add_ripple') {
                    calls.push({ name, args });
                    return 1;
                }

                if (name === 'water_get_body_count') return 1;
                if (name === 'water_get_time') return 0.5;
                return undefined;
            };
        }
    };

    const listeners = new Map();
    const events = [];
    const window = {
        SMWaterCoreWASM: async () => module,
        addEventListener(type, listener) {
            listeners.set(type, listener);
        },
        dispatchEvent(event) {
            events.push(event.type);
            listeners.get(event.type)?.(event);
        },
        location: { href: 'file:///sm-engine/index.html' },
        console: { info() {}, warn() {} }
    };
    const document = { baseURI: 'file:///sm-engine/index.html' };
    const CustomEvent = class {
        constructor(type, init = {}) {
            this.type = type;
            this.detail = init.detail;
        }
    };
    window.window = window;

    vm.runInNewContext(source, {
        window,
        document,
        CustomEvent,
        Float64Array,
        Uint8Array,
        Math,
        Number,
        Promise,
        String,
        console: window.console,
        URL
    });

    const api = await window.SMNativeWaterWasmBridge.init();
    assert.ok(api);
    assert.equal(api.stats().ready, true);
    assert.deepEqual(events, ['sm:native-water-ready']);

    assert.equal(
        api.upsertBody({
            id: 'river-01',
            type: 'river',
            width: 8,
            flowDirection: { x: 0, y: 1 },
            points: [
                { x: -4, y: 1, z: 0 },
                { x: 4, y: 1.4, z: 0 }
            ]
        }),
        true
    );
    assert.equal(calls[0].id, 'river-01');
    assert.equal(calls[0].config[0], 0);
    assert.equal(calls[0].config[12], 0);
    assert.equal(calls[0].config[13], 1);
    assert.equal(calls[0].pointCount, 2);

    const result = api.sampleBody('river-01', 0, 0);
    assert.equal(result.found, true);
    assert.equal(result.bodyId, 'river-01');
    assert.equal(result.surfaceY, 2.25);
    assert.equal(result.waterDepth, 6);

    assert.equal(
        api.addRipple('river-01', { x: 1, z: 2, strength: 0.3 }),
        true
    );
    assert.equal(calls.at(-1).name, 'water_add_ripple');

    console.log(JSON.stringify({
        passed: true,
        backend: 'renderer-wasm-adapter',
        bodyId: result.bodyId,
        event: events[0]
    }));
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
