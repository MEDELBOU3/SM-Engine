const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(
    path.join(__dirname, '..', 'rendering', 'lighting', 'SMLightCulling.js'),
    'utf8'
);

const vector = (x = 0, y = 0, z = 0) => ({
    x, y, z,
    distanceTo(other) {
        const dx = this.x - other.x;
        const dy = this.y - other.y;
        const dz = this.z - other.z;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
});

let nativeCall = null;
const context = {
    console,
    Math,
    Number,
    Array,
    THREE: { Vector3: function Vector3() { return vector(); } },
    window: {
        SculptWASM: {
            selectLights(entries) {
                nativeCall = entries;
                return {
                    native: true,
                    visible: new Uint8Array([1, 0]),
                    selected: 1
                };
            }
        }
    },
    Uint8Array
};

vm.runInNewContext(source, context, { filename: 'SMLightCulling.js' });

const point = {
    isLight: true,
    isPointLight: true,
    visible: true,
    intensity: 10,
    distance: 10,
    userData: {},
    getWorldPosition(target) { target.x = 0; target.y = 0; target.z = 0; }
};
const spot = {
    isLight: true,
    isSpotLight: true,
    visible: true,
    intensity: 3,
    distance: 10,
    userData: {},
    getWorldPosition(target) { target.x = 4; target.y = 0; target.z = 0; }
};
const scene = { traverse(callback) { callback(point); callback(spot); } };
const camera = {
    getWorldPosition(target) { target.x = 0; target.y = 0; target.z = 0; }
};

const culling = new context.window.SMLightCulling({
    maxDistance: 120,
    maxPointLights: 1,
    maxSpotLights: 1
});
culling.update(scene, camera);

assert.equal(nativeCall.length, 2);
assert.equal(nativeCall[0].type, 'point');
assert.equal(nativeCall[1].type, 'spot');
assert.equal(point.visible, true);
assert.equal(spot.visible, false);

console.log(JSON.stringify({
    passed: true,
    nativeSelection: true,
    entries: nativeCall.length,
    visible: [point.visible, spot.visible]
}));
