const assert = require('node:assert/strict');
const path = require('node:path');

global.window = global;
global.THREE = require('three');
require(path.join(__dirname, '..', 'engine', 'water', 'WaterFFTSpectrum.js'));
require(path.join(__dirname, '..', 'engine', 'water', 'WaterWaveSpectrum.js'));
require(path.join(__dirname, '..', 'engine', 'water', 'WaterMaterial.js'));

const renderCalls = [];
const renderer = {
    autoClear: true,
    getRenderTarget() { return null; },
    getViewport(target) { target.set(0, 0, 1280, 720); },
    setRenderTarget(target) { renderCalls.push(target ? 'target' : 'screen'); },
    setViewport() {},
    clear() {},
    render() { renderCalls.push('render'); }
};

const spectrum = new window.SMWaterFFTSpectrum(renderer, {
    resolution: 32,
    tileSize: 120
});

assert.equal(spectrum.enabled, true);
assert.equal(
    spectrum.update(0.75, {
        type: 'ocean',
        waveHeight: 0.4,
        waveLength: 15,
        waveSpeed: 1,
        windSpeed: 1,
        windDirection: { x: 0.8, y: 0.6 },
        waveChoppiness: 0.8,
        waveSteepness: 0.5
    }),
    true
);

const initialData = spectrum._initialSpectrum.image.data;
assert.equal(initialData.length, 32 * 32 * 4);
assert.equal(initialData.some(Number.isNaN), false);
assert.ok(renderCalls.filter(call => call === 'render').length >= 10);

const waterMaterial = window.SMWaterMaterialFactory.create({ type: 'ocean' });
spectrum.attach(waterMaterial);
assert.equal(
    waterMaterial.uniforms.uFFTVertexEnabled.value,
    0,
    'FFT normals may be used, but FFT vertex motion must not expose the floor through the viewport surface'
);
waterMaterial.dispose();

spectrum.dispose();
assert.equal(spectrum.disposed, true);

console.log(JSON.stringify({
    passed: true,
    resolution: 32,
    gpuPasses: renderCalls.filter(call => call === 'render').length,
    field: 'spectrum -> IFFT -> displacement + normal'
}));
