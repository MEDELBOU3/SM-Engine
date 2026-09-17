const assert = require('node:assert/strict');
const path = require('node:path');

global.window = global;
global.THREE = require('three');
global.localStorage = {
    getItem: () => null,
    setItem: () => {}
};

const load = file => require(path.join(__dirname, '..', file));
load('rendering/exposure/SMLuminanceAnalyzer.js');
load('rendering/exposure/SMEyeAdaptation.js');
load('rendering/exposure/SMExposureVolume.js');
load('rendering/exposure/SMExposureVolumeManager.js');
load('rendering/exposure/SMExposureSystem.js');

const renderer = {
    toneMapping: THREE.NoToneMapping,
    toneMappingExposure: 1
};
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera();
camera.position.set(0, 1, 0);
camera.updateMatrixWorld(true);

const system = window.initSMExposureSystem({ renderer, scene });
assert.equal(renderer.toneMapping, THREE.ACESFilmicToneMapping);

system.analyzer.last.luminance = 0.8;
const brightTarget = system._calculateTarget(0.8, system.settings);
system.analyzer.last.luminance = 0.025;
const darkTarget = system._calculateTarget(0.025, system.settings);
assert.ok(brightTarget < 1, 'bright scenes must lower exposure');
assert.ok(darkTarget > 1, 'dark scenes must raise exposure');

system.eye.reset(1);
const afterBrightFrame = system.eye.update(1 / 60, brightTarget, system.settings);
assert.ok(afterBrightFrame < 1, 'eye adaptation must move toward bright-scene exposure');
system.eye.reset(1);
const afterDarkFrame = system.eye.update(1 / 60, darkTarget, system.settings);
assert.ok(afterDarkFrame > 1, 'eye adaptation must recover in darkness');
assert.ok(
    (1 - afterBrightFrame) / (1 - brightTarget) >
        (afterDarkFrame - 1) / (darkTarget - 1),
    'dark-to-light adaptation should be faster than light-to-dark recovery'
);

const volume = system.addVolume({
    id: 'interior',
    center: [0, 1, 0],
    size: [4, 4, 4],
    blendDistance: 2,
    priority: 10,
    settings: { compensation: 1, maxExposure: 5 }
});
assert.equal(volume.getWeight(camera.position), 1);
const resolved = system.volumes.resolve(camera, system.settings);
assert.equal(resolved.settings.compensation, 1);
assert.equal(resolved.settings.maxExposure, 5);
assert.equal(resolved.activeVolumes[0].id, 'interior');

system.analyzer.last.luminance = 0.8;
system.update(1 / 60, camera);
assert.equal(renderer.toneMapping, THREE.ACESFilmicToneMapping);
assert.equal(renderer.toneMappingExposure, system.eye.current);

const report = system.diagnostics(false);
assert.equal(report.autoExposure, true);
assert.equal(report.activeVolumes.length, 1);
system.dispose();

console.log(JSON.stringify({
    passed: true,
    brightTarget,
    darkTarget,
    exposureVolume: true,
    aces: true
}));
