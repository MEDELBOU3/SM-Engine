// engine/metahuman/SMMetaHumanCharacter.js
class SMMetaHumanCharacter {
  constructor(options = {}) {
    this.id = options.id || `metahuman-${Date.now()}`;
    this.name = options.name || "MetaHuman";
    this.scene = options.scene || null;
    this.root = options.root || null;
    this.meshes = new Map();
    this.dna = null;
    this.initialized = false;

    this.data = {
      id: this.id,
      name: this.name,
      face: { morphs: {} },
      body: {},
      metadata: {}
    };

    this.morphs = options.morphs ||
      (window.SMMetaHumanMorphs ? new window.SMMetaHumanMorphs(this) : null);
  }

  initialize(options = {}) {
    if (options.scene) this.scene = options.scene;
    if (options.root) this.root = options.root;
    if (options.faceBoard && this.morphs) this.morphs.loadFaceBoard(options.faceBoard);
    if (options.dna) this.setDNA(options.dna);
    this.initialized = true;
    return this;
  }

  setRoot(root) {
    this.root = root;
    return root;
  }

  getRoot() {
    return this.root;
  }

  registerMesh(name, mesh) {
    if (!name || !mesh) return false;
    this.meshes.set(String(name), mesh);
    return true;
  }

  unregisterMesh(name) {
    return this.meshes.delete(String(name));
  }

  getMesh(name) {
    return this.meshes.get(String(name)) || null;
  }

  getMeshes() {
    return [...this.meshes.entries()];
  }

  clearMeshes() {
    this.meshes.clear();
  }

  registerMeshMorphTargets(mesh, names = []) {
    if (!mesh?.morphTargetDictionary || !this.morphs) return 0;

    let count = 0;
    for (const [name, index] of Object.entries(mesh.morphTargetDictionary)) {
      if (names.length && !names.includes(name)) continue;
      if (this.morphs.registerTarget(name, mesh, index)) count++;
    }
    return count;
  }

  setDNA(dna) {
    this.dna = dna || null;
    this.updateData("metadata.dnaLoaded", !!this.dna);
    return this.dna;
  }

  getDNA() {
    return this.dna;
  }

  hasDNA() {
    return !!this.dna;
  }

  setMorph(name, value) {
    return this.morphs?.set(name, value) || false;
  }

  getMorph(name) {
    return this.morphs?.get(name) || 0;
  }

  resetMorphs() {
    this.morphs?.resetAll();
  }

  updateData(path, value) {
    const parts = String(path || "").split(".").filter(Boolean);
    if (!parts.length) return false;

    let current = this.data;
    for (let i = 0; i < parts.length - 1; i++) {
      current[parts[i]] ||= {};
      current = current[parts[i]];
    }

    current[parts.at(-1)] = value;
    return true;
  }

  getData(path = null) {
    if (!path) {
      return typeof structuredClone === "function"
        ? structuredClone(this.data)
        : JSON.parse(JSON.stringify(this.data));
    }

    return String(path).split(".").filter(Boolean).reduce(
      (value, key) => value == null ? undefined : value[key],
      this.data
    );
  }

  addToScene(scene = this.scene) {
    if (!scene || !this.root) return false;
    if (this.root.parent !== scene) scene.add(this.root);
    this.scene = scene;
    return true;
  }

  removeFromScene() {
    if (!this.root?.parent) return false;
    this.root.parent.remove(this.root);
    return true;
  }

  update(deltaTime = 0) {
    if (!this.initialized) return;
    this.root?.updateMatrixWorld?.();
  }

  dispose() {
    this.removeFromScene();
    this.meshes.clear();
    this.morphs?.resetAll();
    this.dna = null;
    this.root = null;
    this.scene = null;
    this.initialized = false;
  }

  getStats() {
    return {
      id: this.id,
      name: this.name,
      initialized: this.initialized,
      meshes: this.meshes.size,
      morphTargets: this.morphs?.targets.size || 0,
      morphValues: Object.keys(this.morphs?.getValues() || {}).length,
      dnaLoaded: this.hasDNA()
    };
  }
}

window.SMMetaHumanCharacter = SMMetaHumanCharacter;
