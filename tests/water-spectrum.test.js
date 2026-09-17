const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class Vector4 {
    constructor(x = 0, y = 0, z = 0, w = 0) {
        this.x = x;
        this.y = y;
        this.z = z;
        this.w = w;
    }
}

const source = fs.readFileSync(
    path.join(__dirname, '..', 'engine', 'water', 'WaterWaveSpectrum.js'),
    'utf8'
);
const window = {};
window.window = window;

vm.runInNewContext(source, {
    window,
    THREE: { Vector4 },
    Math,
    Number,
    String,
    Object,
    Array
});

const spectrum = window.SMWaterWaveSpectrum;
assert.ok(spectrum);
assert.equal(spectrum.WAVE_COUNT, 6);
assert.equal(spectrum.typeCode('pool'), 3);

for (const type of ['river', 'lake', 'ocean', 'pool']) {
    const options = {
        type,
        waveHeight: 0.5,
        waveLength: 10,
        animationSpeed: 1.2,
        waveScale: 1,
        waveSteepness: 0.42,
        waveChoppiness: 0.5,
        windSpeed: 1,
        flowSpeed: type === 'river' ? 1.4 : 0.1,
        flowCoherence: 0.8,
        windDirection: { x: 0.8, y: 0.6 },
        flowDirection: { x: 1, y: 0 }
    };
    const uniforms = spectrum.createUniformData(options);
    const sampleA = spectrum.evaluate(options, 2.4, -1.7, 0.0);
    const sampleB = spectrum.evaluate(options, 2.4, -1.7, 0.75);

    assert.equal(uniforms.waveData.length, 6);
    assert.equal(uniforms.waveParams.length, 6);
    assert.ok(Number.isFinite(sampleA.height));
    assert.ok(Number.isFinite(sampleA.displacementX));
    assert.ok(Number.isFinite(sampleA.displacementZ));
    assert.notEqual(sampleA.height, sampleB.height);
}

const ocean = spectrum.evaluate({ type: 'ocean', waveHeight: 1, waveLength: 12 }, 0.5, 0.25, 0.2);
const pool = spectrum.evaluate({ type: 'pool', waveHeight: 1, waveLength: 12 }, 0.5, 0.25, 0.2);
assert.ok(Math.abs(pool.height) < Math.abs(ocean.height) || Math.abs(pool.displacementX) < Math.abs(ocean.displacementX));

console.log(JSON.stringify({
    passed: true,
    waves: spectrum.WAVE_COUNT,
    types: 4,
    gerstnerDisplacement: true
}));
