// engine/metahuman/SMMetaHumanMorphs.js

class SMMetaHumanMorphs {
  constructor(character) {
    this.character = character;
    this.values = {};
    this.targets = new Map();
    this.faceBoard = null;
    this.faceRig = null;
  }

  setFaceRig(faceRig) {
    this.faceRig = faceRig || null;
    return this.faceRig;
  }

  registerTarget(name, mesh, morphIndex) {
    if (!mesh?.morphTargetInfluences) return false;
    this.targets.set(String(name), { mesh, morphIndex });
    if (!(name in this.values)) this.values[name] = 0;

    this.faceRig?.registerMesh?.(mesh);
    return true;
  }

  registerMesh(mesh, names = []) {
    if (!mesh?.morphTargetDictionary) return 0;

    let count = 0;

    for (const [name, index] of Object.entries(mesh.morphTargetDictionary)) {
      if (names.length && !names.includes(name)) continue;
      if (this.registerTarget(name, mesh, index)) count++;
    }

    return count;
  }

  registerRoot(root) {
    let count = 0;
    root?.traverse?.(node => {
      if (node?.isMesh) count += this.registerMesh(node);
    });
    return count;
  }

  set(name, value) {
    name = String(name);
    const v = Math.max(0, Math.min(1, Number(value) || 0));

    const target = this.targets.get(name);

    if (target) {
      target.mesh.morphTargetInfluences[target.morphIndex] = v;
    }

    this.faceRig?.setControl?.(name, v);

    this.values[name] = v;
    this.character?.updateData("face.morphs." + name, v);

    return true;
  }

  setControl(name, value) {
    const v = Math.max(0, Math.min(1, Number(value) || 0));
    const applied = this.faceRig?.setControl?.(String(name), v);

    this.values[String(name)] = v;
    this.character?.updateData("face.controls." + String(name), v);

    return applied !== false;
  }

  get(name) {
    return this.values[String(name)] ?? 0;
  }

  reset(name) {
    return this.set(name, 0);
  }

  resetAll() {
    Object.keys(this.values).forEach(name => this.set(name, 0));
  }

  apply(values = {}) {
    Object.entries(values).forEach(([name, value]) => this.set(name, value));
  }

  getValues() {
    return { ...this.values };
  }

  loadFaceBoard(data) {
    try {
      this.faceBoard = typeof data === "string"
        ? JSON.parse(data)
        : data;
      return !!this.faceBoard;
    } catch (error) {
      console.warn("[MetaHuman] FaceBoard parse failed:", error);
      return false;
    }
  }

  getFaceBoard() {
    return this.faceBoard;
  }

  getAvailableNames() {
    return [...new Set([
      ...Object.keys(this.values),
      ...this.targets.keys()
    ])];
  }
}

window.SMMetaHumanMorphs = SMMetaHumanMorphs;
