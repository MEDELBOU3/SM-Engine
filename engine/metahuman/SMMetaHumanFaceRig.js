// engine/metahuman/SMMetaHumanFaceRig.js
// FaceBoard CTRL_* -> Three.js morph-target bridge.
// If a MetaHuman RigLogic runtime is present, it can be used externally;
// this class provides the browser-side morph-target path.

class SMMetaHumanFaceRig {
  constructor(options = {}) {
    this.character = options.character || window.smMetaHumanCharacter || null;
    this.faceBoard = options.faceBoard || window.smMetaHumanFaceBoard || null;
    this.morphs = options.morphs || null;
    this.controls = new Map();
    this.targets = new Map();
    this.values = {};
  }

  setCharacter(character) { this.character = character || null; return this.character; }
  setFaceBoard(faceBoard) { this.faceBoard = faceBoard || null; return this.faceBoard; }
  setMorphs(morphs) { this.morphs = morphs || null; return this.morphs; }

  registerMesh(mesh) {
    if (!mesh?.morphTargetDictionary) return 0;
    let count = 0;
    for (const [name, index] of Object.entries(mesh.morphTargetDictionary)) {
      this.targets.set(name, { mesh, index });
      count++;
    }
    return count;
  }

  registerCharacterMeshes(root) {
    let count = 0;
    root?.traverse?.(node => {
      if (node?.isMesh) count += this.registerMesh(node);
    });
    return count;
  }

  build() {
    const controls = this.faceBoard?.getControls?.() || [];
    this.controls.clear();

    for (const control of controls) {
      if (!control?.name) continue;

      const candidates = this._candidates(control);

      const mapped = candidates.find(name => this.targets.has(name)) || null;

      this.controls.set(control.name, {
        control,
        target: mapped
      });
    }

    return this.getStats();
  }

  setControl(name, value) {
    const entry = this.controls.get(String(name));

    if (!entry) {
      // Direct morph fallback.
      return this.setTarget(name, value);
    }

    const v = this._normalize(value);
    this.values[name] = v;

    if (entry.target) {
      return this.setTarget(entry.target, v);
    }

    // A FaceBoard control may drive several destinations. Try destination
    // names when the control itself has no exact morph target.
    const destinations = this.faceBoard?.getDestinations?.(name) || [];

    let applied = false;
    for (const destination of destinations) {
      const targetName = destination.target;
      if (!this.targets.has(targetName)) continue;

      const min = Number(destination.min);
      const max = Number(destination.max);
      const mapped = Number.isFinite(min) && Number.isFinite(max)
        ? this._map(v, 0, 1, min, max)
        : v;

      this.setTarget(targetName, mapped);
      applied = true;
    }

    return applied;
  }

  setTarget(name, value) {
    const target = this.targets.get(String(name));
    const v = this._normalize(value);

    if (!target) return false;

    target.mesh.morphTargetInfluences[target.index] = v;
    return true;
  }

  getControl(name) {
    return this.controls.get(String(name)) || null;
  }

  getStats() {
    let mapped = 0;
    for (const entry of this.controls.values()) {
      if (entry.target) mapped++;
    }

    return {
      controls: this.controls.size,
      targets: this.targets.size,
      mapped,
      unmapped: this.controls.size - mapped
    };
  }

  _candidates(control) {
    const name = String(control.name);
    const names = new Set([name]);

    for (const axis of control.axes || []) {
      for (const destination of axis.destinations || []) {
        if (destination?.target) names.add(String(destination.target));
      }
    }

    // Common naming variations used by exported morph libraries.
    names.add(name.replace(/^CTRL_/, ""));
    names.add(name.replace(/^CTRL_[LR]_/, ""));
    names.add(name.replace(/^CTRL_C_/, ""));

    return [...names];
  }

  _normalize(value) {
    return Math.max(0, Math.min(1, Number(value) || 0));
  }

  _map(value, inMin, inMax, outMin, outMax) {
    if (inMax === inMin) return outMin;
    const t = (value - inMin) / (inMax - inMin);
    return outMin + t * (outMax - outMin);
  }

  dispose() {
    this.controls.clear();
    this.targets.clear();
    this.values = {};
  }
}

window.SMMetaHumanFaceRig = SMMetaHumanFaceRig;
if (!window.smMetaHumanFaceRig) {
  window.smMetaHumanFaceRig = new SMMetaHumanFaceRig();
}
