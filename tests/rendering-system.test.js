const assert = require('node:assert/strict');
const path = require('node:path');

global.window = global;
global.THREE = require('three');
global.CustomEvent = global.CustomEvent || class CustomEvent extends Event {
    constructor(type, options = {}) {
        super(type);
        this.detail = options.detail;
    }
};

const events = new EventTarget();
window.addEventListener = events.addEventListener.bind(events);
window.removeEventListener = events.removeEventListener.bind(events);
window.dispatchEvent = events.dispatchEvent.bind(events);

const load = file => require(path.join(__dirname, '..', file));

load('rendering/materials/SMMaterialRegistry.js');
load('rendering/materials/SMTextureManager.js');
load('rendering/materials/SMPBRMaterial.js');
load('rendering/materials/SMMaterialCompiler.js');
load('rendering/materials/SMMaterialSystem.js');
load('rendering/quality/SMGraphicsQuality.js');
load('rendering/quality/SMRealisticRendering.js');

const renderer = {
    outputColorSpace: THREE.NoColorSpace,
    physicallyCorrectLights: false,
    useLegacyLights: true,
    toneMapping: THREE.NoToneMapping,
    toneMappingExposure: 0,
    sortObjects: false,
    autoClear: false,
    shadowMap: {
        enabled: false,
        autoUpdate: false,
        type: null,
        needsUpdate: false
    },
    capabilities: {
        getMaxAnisotropy: () => 8
    },
    setPixelRatio(value) {
        this.pixelRatio = value;
    }
};

const scene = new THREE.Scene();
const colorMap = new THREE.Texture();
colorMap.colorSpace = THREE.NoColorSpace;
const normalMap = new THREE.Texture();
normalMap.colorSpace = THREE.SRGBColorSpace;
const aoMap = new THREE.Texture();

const material = new THREE.MeshStandardMaterial({
    map: colorMap,
    normalMap,
    aoMap,
    roughness: 0,
    metalness: 2,
    alphaTest: 0.25
});
const geometry = new THREE.BoxGeometry(1, 1, 1);
geometry.deleteAttribute('uv2');
const mesh = new THREE.Mesh(geometry, material);
scene.add(mesh);

window.renderer = renderer;
window.scene = scene;
window.smPostProcessStack = {
    preset: null,
    setQualityPreset(name) {
        this.preset = name;
    },
    applySettings(settings) {
        this.settings = settings;
    }
};

window.initSMMaterialSystem({ renderer, scene });
const realistic = window.initSMRealisticRendering({
    renderer,
    scene,
    quality: 'high'
});

assert.equal(renderer.physicallyCorrectLights, true);
assert.equal(renderer.useLegacyLights, false);
assert.equal(renderer.outputColorSpace, THREE.SRGBColorSpace);
assert.equal(renderer.toneMapping, THREE.ACESFilmicToneMapping);
assert.equal(renderer.toneMappingExposure, 1);
assert.equal(renderer.shadowMap.enabled, true);
assert.equal(renderer.shadowMap.type, THREE.PCFSoftShadowMap);

assert.equal(material.map.colorSpace, THREE.SRGBColorSpace);
assert.equal(material.normalMap.colorSpace, THREE.NoColorSpace);
assert.equal(material.roughness, 0.02);
assert.equal(material.metalness, 1);
assert.equal(material.dithering, true);
assert.equal(material.alphaToCoverage, true);
assert.equal(material.map.anisotropy, 8);
assert.ok(geometry.attributes.uv2, 'AO/light maps require a secondary UV channel');
assert.equal(mesh.castShadow, true);
assert.equal(mesh.receiveShadow, true);

const glassCoat = window.smMaterialSystem.createPBR({
    name: 'Test clear-coated glass',
    clearcoat: 0.8,
    clearcoatRoughness: 0.12,
    transmission: 0.35,
    thickness: 0.2,
    ior: 1.45
});
assert.equal(glassCoat.isMeshPhysicalMaterial, true);
assert.equal(glassCoat.clearcoat, 0.8);
assert.equal(glassCoat.transmission, 0.35);
assert.equal(glassCoat.userData.smMaterialType, 'physical');

const quality = new window.SMGraphicsQuality({ renderer, preset: 'high' });
window.smGraphicsQuality = quality;
assert.equal(quality.applyPreset('ultra', { keepResolution: true }), true);
assert.equal(realistic.quality, 'ultra');
assert.equal(window.smPostProcessStack.preset, 'ultra');
assert.equal(window.smMaterialSystem.defaults.anisotropy, 8);
assert.equal(renderer.pixelRatio, undefined, 'PerformanceManager keeps resolution ownership');

const report = realistic.diagnostics();
assert.equal(report.initialized, true);
assert.equal(report.stats.meshes, 1);
assert.ok(report.stats.materials >= 1);

realistic.dispose();

console.log(JSON.stringify({
    passed: true,
    renderer: 'ACES + sRGB + physically-correct lights',
    materials: 'PBR/physical normalized',
    quality: quality.getPreset(),
    meshesPrepared: report.stats.meshes
}));
