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
const events = [];
global.dispatchEvent = event => { events.push(event); return true; };
global.addEventListener = () => {};

const dir = path.join(__dirname, '..', 'sculpting', 'terrain-sculpting');
require(path.join(dir, 'TerrainState.js'));
require(path.join(dir, 'TerrainData.js'));
require(path.join(dir, 'TerrainBrushes.js'));
require(path.join(dir, 'material-painting', 'TerrainMaterialPainting.js'));

const TS = window.TerrainSculpting;
const data = new TS.TerrainData({
  sectionSize: 8,
  componentsX: 1,
  componentsZ: 1,
  quadSize: 1,
});
const terrain = new THREE.Group();
const material = new THREE.MeshStandardMaterial();
terrain.userData = {
  isTerrain: true,
  terrainData: data,
  sharedMaterial: material,
};
TS.setLandscape(terrain);
TS.state.materialPaintResolution = 128;
TS.state.materialPaintLayer = 'rock';
TS.state.materialPaintFlow = 1;
TS.state.materialPaintOpacity = 1;
TS.state.materialPaintOperation = 'paint';
TS.state.brushSize = 2;
TS.state.brushStrength = 1;

const paintData = TS.materialPainting.ensureForTerrain(terrain);
assert.equal(paintData.resolution, 128);
assert.equal(material.userData.smTerrainPaintShaderInstalled, true);

const shader = {
  uniforms: {},
  vertexShader: '#include <common>\n#include <uv_vertex>',
  fragmentShader: `#include <common>
vec4 smMaterialWeights(vec3 p, vec3 n) {
  float soil = 1.0;
  float gravel = 0.0;
  float weatheredRock = 0.0;
  float cliff = 0.0;
  float total = soil + gravel + weatheredRock + cliff;
  return vec4(
    soil,
    gravel,
    weatheredRock,
    cliff
  ) / max(total, 0.0001);
}`,
};
material.onBeforeCompile(shader, null);
assert.equal(shader.uniforms.uSMPaintWeights.value, paintData.texture);
assert.match(shader.vertexShader, /vSMPaintUV = uv/);
assert.match(shader.fragmentShader, /texture2D\(\s*uSMPaintWeights/);
assert.match(shader.fragmentShader, /mix\(\s*smAutoWeights/);

terrain.updateMatrixWorld(true);
const point = new THREE.Vector3(0, 0, 0);
const applied = TS.brushes.applyTool({
  terrain,
  point,
  normal: new THREE.Vector3(0, 1, 0),
  tool: TS.TOOLS.MATERIAL_PAINT,
  pressure: 1,
});
assert.equal(applied, true, 'central terrain brush path should paint material');

const painted = TS.materialPainting.sampleAtWorldPoint(point, terrain);
assert.ok(painted.rock > 0.5, 'rock layer weight should be visible at the brush centre');
assert.ok(painted.auto < 0.5, 'manual paint should replace procedural auto weight');

TS.state.materialPaintOperation = 'erase';
TS.brushes.applyTool({
  terrain,
  point,
  normal: new THREE.Vector3(0, 1, 0),
  tool: TS.TOOLS.MATERIAL_PAINT,
  pressure: 1,
});
const erased = TS.materialPainting.sampleAtWorldPoint(point, terrain);
assert.ok(erased.rock < painted.rock, 'erase operation should reduce the active layer');
assert.ok(events.some(event => event.type === 'sm:terrain-material-painted'));

paintData.texture.dispose();
material.dispose();

console.log(JSON.stringify({
  passed: true,
  layers: Object.keys(TS.materialPainting.LAYER_INFO).length,
  resolution: paintData.resolution,
  shaderBlend: true,
  brushBridge: true,
}));
