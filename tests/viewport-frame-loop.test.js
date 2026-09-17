const assert = require('node:assert/strict');

global.window = global;
global.engineFrameCallbacks = [];

require('../engine/viewport/SMViewportFrameLoop.js');

const FrameLoop = window.SMViewportFrameLoopClass;
assert.equal(typeof FrameLoop, 'function');

async function main() {
    const order = [];
    let legacyCalls = 0;

    window.engineFrameCallbacks = [() => {
        legacyCalls += 1;
    }];

    const loop = new FrameLoop({
        maxDelta: 0.033,
        runLegacyCallbacks: false
    });

    loop.subscribe(() => order.push('render'), {
        id: 'render',
        priority: -100,
        phase: 'render'
    });
    loop.subscribe(context => {
        order.push('update');
        assert.ok(context.delta <= 0.033);
    }, {
        id: 'update',
        priority: 100,
        phase: 'update'
    });

    loop.stepExternally(1000);
    const context = loop.stepExternally(1016);

    assert.deepEqual(order, ['update', 'render', 'update', 'render']);
    assert.equal(legacyCalls, 0);
    assert.equal(context.frame, 2);
    assert.equal(context.delta, 0.016);
    assert.equal(loop.getDebugState().externallyDriven, true);

    loop.dispose();
    console.log(JSON.stringify({
        passed: true,
        frames: context.frame,
        phases: order.length,
        singleLegacyOwner: legacyCalls === 0
    }));
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
