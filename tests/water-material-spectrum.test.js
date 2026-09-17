const assert = require('node:assert/strict');
const path = require('node:path');

global.window = global;
global.THREE = require('three');
require(path.join(__dirname, '..', 'engine', 'water', 'WaterWaveSpectrum.js'));
require(path.join(__dirname, '..', 'engine', 'water', 'WaterMaterial.js'));

const factory = window.SMWaterMaterialFactory;
const material = factory.create({
    type: 'ocean',
    waveHeight: 0.4,
    waveLength: 14,
    waveScale: 1.2,
    waveSteepness: 0.55,
    waveChoppiness: 0.8,
    windDirection: { x: 0.7, y: 0.3 }
});

assert.equal(material.uniforms.uWaveData.value.length, 6);
assert.equal(material.uniforms.uWaveParams.value.length, 6);
assert.equal(material.uniforms.uWaterType.value, 2);
assert.equal(material.uniforms.uFFTEnabled.value, 0);
assert.ok(material.uniforms.uFFTDisplacementMap);
assert.ok(material.uniforms.uFFTNormalMap);
assert.equal(material.uniforms.uFFTHorizontalScale.value, 0);
assert.equal(material.uniforms.uFFTVerticalScale.value, 0.72);
assert.equal(material.uniforms.uFFTVertexEnabled.value, 0);
assert.equal(material.transparent, false);
assert.equal(material.depthWrite, true);

const before = factory.sampleWaveHeight(material, 2.5, -0.8, 0.15);
factory.apply(material, { choppiness: 1.15, windDirection: { x: -1, y: 0 } });
const after = factory.sampleWaveHeight(material, 2.5, -0.8, 0.15);
assert.ok(Number.isFinite(before));
assert.ok(Number.isFinite(after));
assert.notEqual(before, after);

const shader = {
    uniforms: {},
    vertexShader: '#include <common>\n#include <begin_vertex>',
    fragmentShader: '#include <common>\n#include <normal_fragment_maps>\n#include <color_fragment>\n#include <roughnessmap_fragment>'
};
material.onBeforeCompile(shader);
assert.match(shader.vertexShader, /smGerstnerDisplacement/);
assert.match(shader.vertexShader, /smFFTDisplacement/);
assert.match(shader.vertexShader, /maxHorizontal/);
assert.match(shader.vertexShader, /uFFTHorizontalScale/);
assert.match(shader.vertexShader, /uFFTVerticalScale/);
assert.match(shader.vertexShader, /uFFTVertexEnabled/);
assert.match(shader.vertexShader, /uWaveData\[6\]/);
assert.match(shader.fragmentShader, /smSurfaceWorldNormal/);
assert.match(shader.fragmentShader, /uFFTNormalMap/);

material.dispose();
console.log(JSON.stringify({
    passed: true,
    shaderSpectrum: true,
    cpuGpuWaveField: 'shared'
}));
