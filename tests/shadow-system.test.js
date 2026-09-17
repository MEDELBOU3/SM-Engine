const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

global.window = global;
global.THREE = require('three');
global.CustomEvent = global.CustomEvent || class CustomEvent extends Event {
    constructor(type, options = {}) {
        super(type);
        this.detail = options.detail;
    }
};

const storage = new Map();
global.localStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: key => storage.delete(key)
};
global.document = {
    readyState: 'loading',
    addEventListener() {}
};
global.dispatchEvent = () => true;

const renderer = {
    shadowMap: {
        enabled: false,
        autoUpdate: false,
        needsUpdate: false,
        type: null
    },
    capabilities: {
        maxTextureSize: 4096,
        getMaxAnisotropy: () => 8
    }
};
const scene = new THREE.Scene();
window.renderer = renderer;
window.scene = scene;

// Simulate an old generated light left behind by a workspace transition.
const staleSun = new THREE.DirectionalLight(0xffffff, 1);
staleSun.name = 'RuntimeSunLight';
staleSun.castShadow = true;
staleSun.userData.isSystemObject = true;
scene.add(staleSun);

require(path.join(__dirname, '..', 'Environment/sky.js'));

const sky = new window.SMHDRSkySystem(scene, renderer);
sky._createHierarchyRoot();
sky._createLights();

assert.ok(sky.sunLight?.isDirectionalLight);
assert.equal(sky.sunLight.castShadow, true);
assert.equal(sky.sunLight.shadow.bias, -0.00005);
assert.equal(sky.sunLight.shadow.normalBias, 0.0015);
assert.equal(sky.sunLight.shadow.radius, 1);
assert.equal(sky.sunLight.shadow.mapSize.width, 2048);
assert.equal(sky.sunLight.userData.forceShadow, true);
assert.equal(sky.sunLight.userData.allowShadowBudgetDisable, false);
assert.equal(sky.sunLight.userData.minShadowMapSize, 2048);
assert.equal(staleSun.castShadow, false, 'secondary generated suns must not overlap the global sun');

require(path.join(__dirname, '..', 'engine/environment/sun/SMSunController.js'));
const controller = new window.SMSunController({ persist: false });
controller.light = sky.sunLight;
controller.configureShadows({ normalBias: 0.035 });
assert.equal(
    sky.sunLight.shadow.normalBias,
    0.006,
    'legacy/external values are clamped to a contact-safe maximum'
);
controller.configureShadows({ normalBias: 0.0015, bias: -0.00005, radius: 1 });
assert.equal(sky.sunLight.shadow.normalBias, 0.0015);
assert.equal(controller.getState().profileVersion, 3);

const budgetSource = fs.readFileSync(
    path.join(__dirname, '..', 'engine/optimization/ShadowBudgetManager.js'),
    'utf8'
);
vm.runInThisContext(
    `${budgetSource}\n;globalThis.ShadowBudgetManager = ShadowBudgetManager;`,
    { filename: 'engine/optimization/ShadowBudgetManager.js' }
);
const adaptiveDirectional = new THREE.DirectionalLight(0xffffff, 1);
adaptiveDirectional.shadow.mapSize.set(512, 512);
scene.add(adaptiveDirectional);
const budget = new window.ShadowBudgetManager(scene);
budget._applyShadowMapSize(512);
assert.equal(
    sky.sunLight.shadow.mapSize.width,
    2048,
    'adaptive quality must preserve the global sun minimum resolution'
);
assert.equal(
    adaptiveDirectional.shadow.mapSize.width,
    2048,
    'directional lights must never fall back to visibly pixelated 512px maps'
);

require(path.join(__dirname, '..', 'rendering/shadows/SMDirectionalShadow.js'));
const resizedLight = new THREE.DirectionalLight(0xffffff, 1);
let oldMapDisposed = false;
resizedLight.shadow.map = {
    width: 512,
    height: 512,
    dispose() {
        oldMapDisposed = true;
    }
};
new window.SMDirectionalShadow(resizedLight, { mapSize: 2048 }).configure();
assert.equal(oldMapDisposed, true);
assert.equal(resizedLight.shadow.map, null);
assert.equal(resizedLight.shadow.mapSize.width, 2048);

const systemShadowCasters = [];
scene.traverse(object => {
    if (object.isDirectionalLight && object.castShadow) {
        systemShadowCasters.push(object);
    }
});
assert.equal(systemShadowCasters.length, 1);
assert.equal(systemShadowCasters[0], sky.sunLight);

sky.dispose();

console.log(JSON.stringify({
    passed: true,
    contactNormalBias: 0.0015,
    shadowMap: 2048,
    systemShadowCasters: systemShadowCasters.length,
    profileVersion: 3
}));
