const assert = require('node:assert/strict');
const path = require('node:path');

global.window = global;
global.THREE = require('three');
global.crypto = global.crypto || require('node:crypto').webcrypto;
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
global.document = { getElementById: () => null };
window.objects = [];

const load = (file) => require(path.join(__dirname, '..', file));
load('engine/runtime/SMRuntimeEventBus.js');
load('engine/runtime/components/SMComponent.js');
load('engine/runtime/components/SMBehaviour.js');
load('engine/runtime/components/SMComponentRegistry.js');
load('engine/runtime/components/SMComponentContainer.js');
load('engine/runtime/prefabs/SMPrefab.js');
load('engine/runtime/prefabs/SMPrefabRegistry.js');
load('engine/runtime/prefabs/SMPrefabSerializer.js');
load('engine/runtime/prefabs/SMPrefabInstantiator.js');
load('engine/scene/SMEntity.js');
load('engine/scene/SMCustomComponent.js');
load('engine/scene/SMSceneManager.js');
load('engine/scene/SMWorldSceneSerializer.js');
load('engine/project/serializers/SceneSerializer.js');

async function run() {
    const scene = new THREE.Scene();
    scene.name = 'Architecture Test';
    window.scene = scene;
    const manager = new window.SMSceneManager(scene).initialize();
    window.smSceneManager = manager;

    const root = new THREE.Group();
    root.name = 'Vehicle';
    root.position.set(4, 2, -3);
    const wheel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.5, 0.5, 0.25, 12),
        new THREE.MeshStandardMaterial({ color: 0x333333 })
    );
    wheel.name = 'Wheel';
    wheel.position.set(1, -0.5, 0);
    root.add(wheel);

    const rootEntity = manager.addObject(root, { tags: ['vehicle'], category: 'Gameplay' });
    const wheelEntity = manager.getEntity(wheel);
    assert.ok(rootEntity?.id);
    assert.ok(wheelEntity?.id);
    assert.notEqual(rootEntity.id, wheelEntity.id);

    const custom = manager.addComponent(root, 'SMCustomComponent', {
        customType: 'VehicleSettings',
        properties: { maxSpeed: 120, enabled: true }
    });
    assert.equal(custom.customType, 'VehicleSettings');
    assert.equal(root.getComponent('SMCustomComponent'), custom);

    const duplicate = manager.duplicateEntity(root, { select: false });
    assert.ok(duplicate);
    assert.notEqual(duplicate.id, rootEntity.id);
    assert.notEqual(manager.getEntity(duplicate.object.children[0]).id, wheelEntity.id);

    assert.equal(manager.reparentEntity(wheel, duplicate, { preserveWorld: true }), true);
    assert.equal(wheel.parent, duplicate.object);

    const payload = manager.serialize({ roots: [root, duplicate.object] });
    assert.equal(payload.format, 'SM_WORLD_SCENE');
    assert.ok(payload.entities.length >= 3);
    assert.ok(payload.entities.every((entity) => entity.id && Array.isArray(entity.components)));

    const originalIds = new Set(payload.entities.map((entity) => entity.id));
    const restoredScene = new THREE.Scene();
    const restoredManager = new window.SMSceneManager(restoredScene).initialize();
    window.scene = restoredScene;
    window.smSceneManager = restoredManager;
    const result = await restoredManager.load(payload, { clearExisting: true });

    assert.equal(result.loaded, true);
    assert.equal(result.entityCount, payload.entities.length);
    assert.deepEqual(new Set(restoredManager.entities.keys()), originalIds);
    const restoredWheel = restoredManager.findByName('Wheel')[0];
    assert.ok(restoredWheel?.parent);
    assert.equal(restoredWheel.parent.name, 'Vehicle_Copy');
    const restoredVehicle = restoredManager.findByName('Vehicle')[0];
    assert.ok(Array.isArray(restoredVehicle.object.userData.components));
    assert.equal(restoredVehicle.object.userData.components[0].customType, 'VehicleSettings');

    const projectPayload = window.smSceneSerializer.capture();
    assert.equal(projectPayload.format, 'SM_SCENE');
    assert.equal(projectPayload.version, 2);
    assert.equal(projectPayload.architecture, 'SM_WORLD_SCENE');
    assert.equal(projectPayload.entities.length, payload.entities.length);
    const projectRestore = await window.smSceneSerializer.restoreCapture(projectPayload, {
        projectId: 'test-project',
        clearExisting: true
    });
    assert.equal(projectRestore.loaded, true);
    assert.equal(projectRestore.entityCount, projectPayload.entities.length);

    const stats = restoredManager.getStats();
    assert.equal(stats.entities, payload.entities.length);
    assert.ok(stats.components >= 1);

    const legacyObject = new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshStandardMaterial({ color: 0xff8844 })
    );
    legacyObject.name = 'Legacy Box';
    const legacyRestore = await window.smSceneSerializer.restoreCapture({
        format: 'SM_SCENE',
        version: 1,
        objects: [{ name: legacyObject.name, uuid: legacyObject.uuid, json: legacyObject.toJSON() }]
    }, { projectId: 'legacy-project', clearExisting: true });
    assert.equal(legacyRestore.loaded, true);
    assert.equal(legacyRestore.objectCount, 1);
    console.log(JSON.stringify({
        passed: true,
        entities: stats.entities,
        components: stats.components,
        roots: stats.roots,
        stableIds: originalIds.size,
        legacyV1: true
    }));
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
