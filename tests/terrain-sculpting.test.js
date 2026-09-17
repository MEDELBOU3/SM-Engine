const assert = require('node:assert/strict');
const path = require('node:path');

global.window = global;
global.THREE = require('three');
global.localStorage = {
  getItem: () => 'TERRAIN',
  setItem() {},
  removeItem() {},
};
global.CustomEvent = global.CustomEvent || class CustomEvent extends Event {
  constructor(type, options = {}) {
    super(type);
    this.detail = options.detail;
  }
};

const emittedEvents = [];
global.dispatchEvent = (event) => {
  emittedEvents.push(event);
  return true;
};
global.workspaceManager = { currentMode: 'TERRAIN' };
global.addEventListener = () => {};
global.document = {
  querySelectorAll: () => [],
  addEventListener() {},
};

const terrainDir = path.join(__dirname, '..', 'sculpting', 'terrain-sculpting');
require(path.join(terrainDir, 'TerrainState.js'));
require(path.join(terrainDir, 'TerrainData.js'));
require(path.join(terrainDir, 'TerrainComponent.js'));
require(path.join(terrainDir, 'TerrainComponentManager.js'));

// This require used to throw because TerrainBrushes attempted Object.assign()
// against TerrainState's frozen tool registry.
require(path.join(terrainDir, 'TerrainBrushes.js'));

const TS = window.TerrainSculpting;
assert.ok(Object.isFrozen(TS.TOOLS));
assert.equal(TS.TOOLS.RAISE_LOWER, 'raiseLower');
assert.equal(TS.TOOLS.HYDRAULIC_EROSION, 'hydraulic');
assert.equal(typeof TS.brushes?.applyTool, 'function');

// Rectangular data makes sure brush indexing uses resolutionX/resolutionZ and
// does not incorrectly assume that every heightfield is square.
const data = new TS.TerrainData({
  sectionSize: 4,
  sectionsPerComponent: 1,
  componentsX: 2,
  componentsZ: 1,
  quadSize: 1,
  heightScale: 1,
});
const landscape = new THREE.Group();
landscape.userData = {
  isTerrain: true,
  terrainData: data,
};
const material = new THREE.MeshStandardMaterial();
const manager = new TS.TerrainComponentManager({
  terrainData: data,
  landscape,
  material,
});
manager.build();
landscape.userData.componentManager = manager;
const firstComponentMesh = manager.components.values().next().value.mesh;
assert.equal(
  TS.setLandscape(firstComponentMesh),
  landscape,
  'selecting a terrain component must resolve to the landscape data root',
);

let regionUpdates = 0;
const originalUpdateRegion = manager.updateRegion.bind(manager);
manager.updateRegion = (...args) => {
  regionUpdates++;
  return originalUpdateRegion(...args);
};

TS.state.mode = TS.MODES.SCULPT;
TS.state.selectedTool = TS.TOOLS.RAISE_LOWER;
TS.state.brushSize = 2.25;
TS.state.brushStrength = 1;
TS.state.brushFalloff = 0.35;
TS.state.isShiftPressed = false;

landscape.updateMatrixWorld(true);
const beforeVersion = data.version;
const applied = TS.brushes.applyTool({
  terrain: landscape,
  point: new THREE.Vector3(0, 0, 0),
  normal: new THREE.Vector3(0, 1, 0),
  tool: TS.TOOLS.RAISE_LOWER,
  pressure: 1,
});

assert.equal(applied, true);
assert.ok(data.version > beforeVersion, 'heightfield version should advance');
assert.ok(regionUpdates > 0, 'only the affected terrain component region should sync');
assert.ok(
  Array.from(data.heights).some((height) => height > 0),
  'raise brush should modify the authoritative heightfield',
);

const renderedHeights = [];
manager.components.forEach((component) => {
  const positions = component.mesh.geometry.attributes.position;
  for (let i = 0; i < positions.count; i++) renderedHeights.push(positions.getY(i));
});
assert.ok(
  renderedHeights.some((height) => height > 0),
  'component mesh vertices should receive the sculpted height values',
);
assert.ok(
  emittedEvents.some((event) => event.type === 'sm:terrain-changed'),
  'terrain changes should be announced to dependent systems',
);

// Verify the complete viewport input path too: canvas pointerdown -> raycast ->
// selected tool -> brush -> terrain component update.
const canvasHandlers = new Map();
const canvas = {
  style: {},
  addEventListener(type, handler) {
    canvasHandlers.set(type, handler);
  },
  getBoundingClientRect() {
    return { left: 0, top: 0, width: 100, height: 100 };
  },
  setPointerCapture() {},
  releasePointerCapture() {},
};
const renderer = { domElement: canvas };
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
camera.position.set(0, 8, 8);
camera.lookAt(0, 0, 0);
camera.updateProjectionMatrix();
camera.updateMatrixWorld(true);
const scene = new THREE.Scene();
scene.add(landscape);
scene.updateMatrixWorld(true);
TS.setContext(scene, camera, renderer, null);
window.scene = scene;
window.camera = camera;
window.renderer = renderer;

require(path.join(terrainDir, 'TerrainInteraction.js'));
assert.equal(TS.interaction.setActiveTool('raise'), TS.TOOLS.RAISE_LOWER);
assert.equal(TS.state.isBrushActive, true);
assert.equal(typeof canvasHandlers.get('pointerdown'), 'function');

const heightBeforePointer = Math.max(...data.heights);
canvasHandlers.get('pointerdown')({
  button: 0,
  clientX: 50,
  clientY: 50,
  pointerId: 1,
  pointerType: 'mouse',
  pressure: 0,
  shiftKey: false,
  ctrlKey: false,
  metaKey: false,
  preventDefault() {},
  stopPropagation() {},
});
assert.ok(
  Math.max(...data.heights) > heightBeforePointer,
  'a viewport pointer stroke should visibly raise the terrain',
);

manager.dispose();
material.dispose();

console.log(JSON.stringify({
  passed: true,
  toolsRegistered: Object.keys(TS.TOOLS).length,
  resolution: `${data.resolutionX}x${data.resolutionZ}`,
  changedSamples: Array.from(data.heights).filter((height) => height > 0).length,
  regionUpdates,
  pointerInput: true,
}));
