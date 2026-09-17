const fs = require('fs');

function noopCtx() {
    return new Proxy({}, {
        get(target, prop) {
            if (prop === 'measureText') return () => ({ width: 100 });
            if (typeof prop === 'string') return () => {};
            return undefined;
        },
        set() { return true; }
    });
}

const fakeCanvas = { width: 0, height: 0, getContext: () => noopCtx() };
globalThis.document = { createElement: () => fakeCanvas };

const sceneStub = {
    children: [],
    add(obj) { this.children.push(obj); },
    remove(obj) { const i = this.children.indexOf(obj); if (i >= 0) this.children.splice(i, 1); },
    getObjectByName(name) { return this.children.find(c => c.name === name) || null; },
    traverse(fn) { this.children.forEach(c => { fn(c); }); }
};

const vector3 = () => ({
    x: 0, y: 0, z: 0,
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; },
    copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; },
    clone() { return vector3(); },
    toArray() { return [this.x, this.y, this.z]; },
    fromArray(a) { this.x = a[0]; this.y = a[1]; this.z = a[2]; return this; }
});
const vector2 = () => ({ set() { return this; } });

function makeGeo(width, height, depth) {
    const pos = { count: 24 };
    pos.getX = (i) => (i % 4 < 2 ? width / 2 : -width / 2);
    pos.getY = (i) => (i % 4 === 1 || i % 4 === 2 ? height / 2 : -height / 2);
    pos.getZ = (i) => 0;
    const uv = { count: 24 };
    uv.getX = () => 0; uv.getY = () => 0; uv.setXY = () => {};
    return {
        type: 'BoxGeometry',
        attributes: { position: pos, uv },
        parameters: { width, height, depth },
        computeBoundingBox() { this.boundingBox = {}; },
        computeVertexNormals() {}
    };
}

globalThis.THREE = {
    PlaneGeometry: function (w, h) { return { type: 'PlaneGeometry', attributes: { position: { count: 4 }, uv: { count: 4 } }, parameters: { width: w, height: h }, computeBoundingBox() {}, computeVertexNormals() {} }; },
    BoxGeometry: function (w, h, d) { return makeGeo(w, h, d); },
    CylinderGeometry: function (r, r2, h) { return { type: 'CylinderGeometry', attributes: { position: { count: 100 }, uv: { count: 100 } }, parameters: { radiusTop: r, radiusBottom: r2, height: h }, computeBoundingBox() {} }; },
    MeshStandardMaterial: function () { return { color: {}, map: null, normalMap: null, roughnessMap: null, needsUpdate: false }; },
    MeshBasicMaterial: function () { return { map: null, transparent: false, depthTest: true, depthWrite: true }; },
    Mesh: function (geo, mat) { this.geometry = geo; this.material = mat; this.position = vector3(); this.rotation = { x: 0, y: 0, z: 0 }; this.name = ''; this.visible = true; this.castShadow = false; this.receiveShadow = false; this.userData = {}; this.renderOrder = 0; this.children = []; this.isMesh = true; this.updateMatrixWorld = () => {}; this.getWorldPosition = () => vector3(); this.getWorldQuaternion = () => ({ copy() {} }); this.traverse = (fn) => { fn(this); }; },
    Group: function () { this.children = []; this.position = vector3(); this.name = ''; this.userData = {}; this.visible = true; this.isGroup = true; this.add = (c) => this.children.push(c); this.updateMatrixWorld = () => {}; this.traverse = (fn) => { fn(this); this.children.forEach(c => c.traverse && c.traverse(fn)); }; },
    Color: function (hex) { this._hex = hex; this.getHSL = () => ({ h: 0, s: 0, l: 0.5 }); this.setHSL = () => {}; this.set = () => {}; },
    Vector2: function () { this.set = () => this; },
    Vector3: function () { return vector3(); },
    Quaternion: function () { this.copy = () => {}; this.set = () => {}; },
    Box3: function () { this.setFromObject = () => this; },
    CanvasTexture: function () { this.wrapS = 0; this.wrapT = 0; this.repeat = { set() {} }; this.colorSpace = ''; this.anisotropy = 1; this.minFilter = 0; this.magFilter = 0; this.needsUpdate = false; },
    RepeatWrapping: 1000,
    SRGBColorSpace: 'srgb',
    LinearMipmapLinearFilter: 1003,
    LinearFilter: 1006,
    FrontSide: 0,
    DoubleSide: 2
};

globalThis.window = {
    renderer: { capabilities: { getMaxAnisotropy: () => 8 } },
    scene: sceneStub
};
globalThis.scene = sceneStub;
globalThis.unitSize = 100;

const code = fs.readFileSync('engine/grid-materials-obstacles.js', 'utf8');

try {
    (0, eval)(code);
    console.log('--- file parsed OK ---');

    const ground = createUnrealFloor();
    console.log('createUnrealFloor OK. name=', ground.name, 'in scene?', sceneStub.children.includes(ground));

    const markers = createDistanceMarkers({ gridSize: 2000, majorStep: 100 });
    console.log('createDistanceMarkers OK. name=', markers.name, 'children=', markers.children.length);

    const world = setupPhysicsWorld(sceneStub, ground);
    console.log('setupPhysicsWorld OK. group name=', world.obstaclesGroup.name, 'obstacle count=', world.obstaclesGroup.children.length, 'in scene?', sceneStub.children.includes(world.obstaclesGroup));

    const sat = boostObstacleSaturation(sceneStub);
    console.log('boostObstacleSaturation OK');

    const sceneNames = sceneStub.children.map(c => c.name);
    console.log('SCENE CHILDREN:', JSON.stringify(sceneNames));
    console.log('RESULT: ALL ENVIRONMENT FUNCTIONS RAN WITHOUT ERROR');
} catch (e) {
    console.error('RUNTIME ERROR:', e.message);
    console.error(e.stack.split('\n').slice(0, 6).join('\n'));
    process.exit(1);
}
