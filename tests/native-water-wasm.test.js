const assert = require('node:assert/strict');
const path = require('node:path');

const createWaterModule = require(
    path.join(
        __dirname,
        '..',
        'engine',
        'native',
        'water',
        'sm_water_core.js'
    )
);

async function main() {
    const module = await createWaterModule({
        locateFile(file) {
            return path.join(
                __dirname,
                '..',
                'engine',
                'native',
                'water',
                file
            );
        }
    });

    const reset = module.cwrap('water_reset', null, []);
    const setTime = module.cwrap('water_set_time', null, ['number']);
    const upsertBody = module.cwrap(
        'water_upsert_body',
        'number',
        ['string', 'number', 'number', 'number']
    );
    const sample = module.cwrap(
        'water_sample',
        'number',
        ['number', 'number', 'number', 'number', 'number']
    );
    const sampleBody = module.cwrap(
        'water_sample_body',
        'number',
        ['string', 'number', 'number', 'number', 'number']
    );
    const addRipple = module.cwrap(
        'water_add_ripple',
        'number',
        [
            'string',
            'number',
            'number',
            'number',
            'number',
            'number',
            'number',
            'number',
            'number'
        ]
    );
    const bodyCount = module.cwrap('water_get_body_count', 'number', []);
    const time = module.cwrap('water_get_time', 'number', []);

    const configPtr = module._malloc(27 * 8);
    const outputPtr = module._malloc(9 * 8);
    const bodyIdPtr = module._malloc(256);
    assert.ok(configPtr && outputPtr && bodyIdPtr);

    const config = new Float64Array(27);
    config[0] = 2; // ocean
    config[2] = 1.25;
    config[3] = 100;
    config[4] = 6;
    config[5] = 4;
    config[6] = 0.32;
    config[7] = 8;
    config[8] = 1.1;
    config[9] = 0.4;
    config[10] = 1;
    module.HEAPF64.set(config, configPtr >> 3);

    reset();
    assert.equal(upsertBody('test-ocean', configPtr, 0, 0), 1);
    assert.equal(bodyCount(), 1);

    setTime(0.4);
    assert.equal(time(), 0.4);

    const found = sampleBody(
        'test-ocean',
        0,
        0,
        outputPtr,
        bodyIdPtr,
        256
    );
    assert.equal(found, 1);
    const values = module.HEAPF64.subarray(
        outputPtr >> 3,
        (outputPtr >> 3) + 9
    );
    for (const value of values) assert.ok(Number.isFinite(value));
    assert.ok(values[2] > 0.5); // normal.y
    assert.ok(values[8] > 0); // configured water depth
    const initialValues = Array.from(values);

    const idBytes = module.HEAPU8.subarray(bodyIdPtr, bodyIdPtr + 10);
    assert.equal(String.fromCharCode(...idBytes.slice(0, 10)), 'test-ocean');

    assert.equal(
        addRipple('test-ocean', 0, 0, 5, 0.2, 2.5, 11, 1.2, 0.4),
        1
    );
    setTime(0.8);
    assert.equal(
        sample(0, 0, outputPtr, bodyIdPtr, 256),
        1
    );
    assert.equal(
        sampleBody('outside', 0, 0, outputPtr, bodyIdPtr, 256),
        0
    );

    // Pool support uses the same polygon containment path as lakes but keeps
    // the lower-amplitude spectrum profile used by the renderer.
    const poolPointsPtr = module._malloc(4 * 3 * 8);
    const poolPoints = new Float64Array([
        -5, 0, -5,
        5, 0, -5,
        5, 0, 5,
        -5, 0, 5
    ]);
    module.HEAPF64.set(poolPoints, poolPointsPtr >> 3);
    config[0] = 3; // pool
    config[3] = 100;
    config[4] = 2;
    config[5] = 2;
    config[19] = 1;
    config[20] = 0.2;
    config[21] = 0.2;
    config[22] = 0.72;
    config[23] = 0.5;
    config[24] = 1;
    config[25] = 0;
    module.HEAPF64.set(config, configPtr >> 3);
    assert.equal(upsertBody('test-pool', configPtr, poolPointsPtr, 4), 1);
    assert.equal(sampleBody('test-pool', 0, 0, outputPtr, bodyIdPtr, 256), 1);
    assert.ok(module.HEAPF64[(outputPtr >> 3) + 2] > 0.5);
    module._free(poolPointsPtr);

    module._free(configPtr);
    module._free(outputPtr);
    module._free(bodyIdPtr);

    console.log(JSON.stringify({
        passed: true,
        backend: 'c++-waterworld-wasm',
        bodyCount: 2,
        normalY: initialValues[2],
        depth: initialValues[8],
        time: time()
    }));
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
