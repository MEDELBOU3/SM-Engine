const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

global.window = global;
global.CustomEvent = class CustomEvent {
    constructor(type, options = {}) {
        this.type = type;
        this.detail = options.detail;
    }
};
global.dispatchEvent = () => true;
global.THREE = {
    DoubleSide: 2,
    SRGBColorSpace: 'srgb',
    NoColorSpace: '',
    AnimationMixer: class AnimationMixer {}
};

require('../engine/importers/blender/BlenderMetadataBridge.js');
require('../engine/importers/blender/BlenderUIPanelBridge.js');
require('../engine/importers/blender/SMBlenderTextureBridge.js');
require('../engine/importers/blender/SMBlenderMaterialBridge.js');

const metadata = {
    format: 'SM_BLENDER_IMPORT_METADATA',
    version: 2,
    blenderVersion: '4.3.0',
    scene: { name: 'Scene', customProperties: {} },
    materials: [{
        name: 'HeroPaint',
        blendMethod: 'CLIP',
        doubleSided: true,
        alphaThreshold: 0.42,
        pbr: { baseColor: [0.2, 0.4, 0.8, 1], roughness: 0.3, metallic: 0.7 },
        textures: [{
            name: 'Hero_BaseColor',
            semantic: 'baseColor',
            colorTexture: true,
            image: {
                name: 'hero_basecolor.png',
                packed: true,
                colorspace: 'sRGB',
                width: 2048,
                height: 2048
            },
            transform: { scale: [2, 2], offset: [0.1, 0.2] }
        }]
    }],
    images: [{ name: 'hero_basecolor.png', packed: true, width: 2048, height: 2048 }],
    objects: [{
        name: 'Hero',
        type: 'MESH',
        materials: ['HeroPaint'],
        customProperties: { health: 100 }
    }],
    uiPanels: [{
        id: 'hero-look',
        title: 'Hero Look',
        target: 'Hero',
        controls: [
            { id: 'roughness', label: 'Roughness', type: 'slider', bind: 'material.roughness', min: 0, max: 1 },
            { id: 'visibility', label: 'Visible', type: 'toggle', bind: 'visible' },
            { id: 'unsafe', label: 'Unsafe', type: 'text', bind: 'constructor.prototype.bad' },
            { id: 'reset', label: 'Reset', type: 'button', action: 'resetTransform' }
        ]
    }]
};

const normalized = window.smBlenderMetadataBridge.normalize(metadata);
assert.equal(normalized.version, 2);
assert.equal(normalized.materials[0].textures[0].image.packed, true);
assert.equal(window.smBlenderMetadataBridge.summarize(normalized).textures, 1);
assert.equal(window.smBlenderMetadataBridge.summarize(normalized).uiPanels, 1);

const texture = {
    isTexture: true,
    uuid: 'texture-1',
    name: 'hero_basecolor.png',
    userData: {},
    colorSpace: '',
    flipY: true,
    anisotropy: 1,
    repeat: { x: 1, y: 1 },
    offset: { x: 0, y: 0 },
    rotation: 0
};
const material = {
    uuid: 'material-1',
    name: 'HeroPaint',
    isMeshPhysicalMaterial: true,
    color: { isColor: true, getHexString: () => '3366cc' },
    emissive: { isColor: true, getHexString: () => '000000' },
    specularColor: { isColor: true, getHexString: () => 'ffffff' },
    sheenColor: { isColor: true, getHexString: () => '000000' },
    attenuationColor: { isColor: true, getHexString: () => 'ffffff' },
    roughness: 0.3,
    metalness: 0.7,
    opacity: 1,
    transparent: false,
    alphaTest: 0,
    normalScale: { x: 1, y: 1 },
    map: texture,
    userData: {}
};
const mesh = {
    isMesh: true,
    uuid: 'mesh-1',
    name: 'Hero',
    visible: true,
    material,
    geometry: {
        attributes: { uv: { itemSize: 2 } },
        setAttribute(name, value) { this.attributes[name] = value; }
    },
    position: { set() {} },
    rotation: { set() {} },
    scale: { set() {} },
    userData: {},
    updateMatrixWorld() {}
};
const root = {
    uuid: 'root-1',
    name: 'ImportedHero',
    userData: {},
    animations: [],
    traverse(callback) { callback(mesh); },
    getObjectByName(name) { return name === 'Hero' ? mesh : null; },
    updateMatrixWorld() {}
};

assert.equal(window.smBlenderMetadataBridge.applyToObject3D(root, normalized), true);
assert.equal(material.userData.smBlender.name, 'HeroPaint');

const runtime = window.smBlenderMaterialBridge.prepareRuntime(root, {
    metadata: normalized,
    renderer: { capabilities: { getMaxAnisotropy: () => 16 } },
    textureBridge: window.smBlenderTextureBridge
});
assert.equal(runtime.materials, 1);
assert.equal(texture.colorSpace, 'srgb');
assert.equal(texture.flipY, false);
assert.equal(texture.anisotropy, 8);
assert.equal(material.side, 2);
assert.equal(material.alphaTest, 0.42);

const textureResult = { byUUID: new Map([['texture-1', { assetId: 'asset-texture-1' }]]) };
const definition = window.smBlenderMaterialBridge.definitionFromThree(material, textureResult, {
    sourceName: 'hero.blend',
    metadataRecord: normalized.materials[0]
});
assert.equal(definition.map, 'asset-texture-1');
assert.equal(definition.textureBindings.map.flipY, false);
assert.equal(definition.blendMethod, 'CLIP');

const panels = window.smBlenderUIPanelBridge.attach(root, normalized, { mount: false });
assert.equal(panels.length, 1);
assert.equal(panels[0].controls.length, 4);
assert.equal(panels[0].controls[2].bind, null);
assert.equal(panels[0].controls[2].disabled, true);
assert.equal(window.smBlenderUIPanelBridge._write(root, panels[0], panels[0].controls[0], 0.8), true);
assert.equal(material.roughness, 0.8);

const loaderSource = fs.readFileSync(
    path.join(__dirname, '..', 'js', 'SMEngineScriptLoader.js'),
    'utf8'
);
assert.match(loaderSource, /engine\/importers\/blender\/BlenderUIPanelBridge\.js/);

console.log(JSON.stringify({
    passed: true,
    metadataVersion: normalized.version,
    materials: runtime.materials,
    textures: runtime.textures.configured,
    uiPanels: panels.length,
    sandboxedControl: panels[0].controls[2].disabled
}));
