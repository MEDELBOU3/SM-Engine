// engine/metahuman/SMMetaHumanCharacterAssembler.js
//
// Assembles registered MetaHuman parts into one character root.
// Uses the existing SM Engine scene/viewport; it does not create a new
// renderer, camera, or render loop.

class SMMetaHumanCharacterAssembler {
  constructor(options = {}) {
    this.system = options.system || window.smMetaHumanSystem || null;
    this.scene = options.scene || window.scene || null;
    this.characterRoot = null;
    this.parts = new Map();
    this.assembled = false;
  }

  setSystem(system) {
    this.system = system || null;
    return this.system;
  }

  setScene(scene) {
    this.scene = scene || null;
    return this.scene;
  }

  createRoot(name = "SM_MetaHuman") {
    if (this.characterRoot) return this.characterRoot;

    if (typeof THREE === "undefined" || !THREE.Group) {
      console.warn("[MetaHuman] THREE.Group is not available.");
      return null;
    }

    this.characterRoot = new THREE.Group();
    this.characterRoot.name = name;

    this.characterRoot.userData = {
      ...(this.characterRoot.userData || {}),
      smMetaHuman: true,
      smMetaHumanRoot: true
    };

    return this.characterRoot;
  }

  addPart(role, object, options = {}) {
    if (!object) return false;

    const root = this.createRoot(
      options.rootName || "SM_MetaHuman"
    );

    if (!root) return false;

    const key = String(role || object.name || "character");

    const previous = this.parts.get(key);

    if (previous?.object?.parent === root) {
      root.remove(previous.object);
    }

    if (object.parent && object.parent !== root) {
      object.parent.remove(object);
    }

    root.add(object);

    object.userData = {
      ...(object.userData || {}),
      smMetaHuman: true,
      smMetaHumanRole: key
    };

    this.parts.set(key, {
      role: key,
      object
    });

    this.assembled = true;

    return true;
  }

  removePart(role) {
    const key = String(role);
    const entry = this.parts.get(key);

    if (!entry) return false;

    if (entry.object?.parent === this.characterRoot) {
      this.characterRoot.remove(entry.object);
    }

    this.parts.delete(key);

    return true;
  }

  clear() {
    if (this.characterRoot) {
      for (const entry of this.parts.values()) {
        if (entry.object?.parent === this.characterRoot) {
          this.characterRoot.remove(entry.object);
        }
      }
    }

    this.parts.clear();
    this.assembled = false;
  }

  assemble(options = {}) {
    const assets =
      options.assets ||
      this.system?.assetLoader?.getAssets?.() ||
      {};

    const roles = [
      "body",
      "head",
      "eyes",
      "hair",
      "clothing"
    ];

    for (const role of roles) {
      const object = assets[role];

      if (object) {
        this.addPart(role, object, options);
      }
    }

    const scene = options.scene ||
      this.scene ||
      window.scene;

    if (
      options.addToScene !== false &&
      scene &&
      this.characterRoot &&
      this.characterRoot.parent !== scene
    ) {
      scene.add(this.characterRoot);
    }

    this._markRootMeshes();

    return this.characterRoot;
  }

  _markRootMeshes() {
    if (!this.characterRoot) return;

    this.characterRoot.traverse?.(node => {
      if (!node?.isMesh) return;

      node.userData = {
        ...(node.userData || {}),
        smMetaHuman: true
      };
    });
  }

  getPart(role) {
    return this.parts.get(String(role))?.object || null;
  }

  getRoot() {
    return this.characterRoot;
  }

  getParts() {
    const result = {};

    for (const [role, entry] of this.parts) {
      result[role] = entry.object;
    }

    return result;
  }

  getMeshes() {
    const meshes = [];

    this.characterRoot?.traverse?.(node => {
      if (!node?.isMesh) return;

      meshes.push(node);
    });

    return meshes;
  }

  getStats() {
    const meshes = this.getMeshes();

    return {
      assembled: this.assembled,
      root: !!this.characterRoot,
      parts: this.parts.size,
      meshes: meshes.length,
      skinnedMeshes: meshes.filter(
        mesh => mesh.isSkinnedMesh
      ).length,
      morphMeshes: meshes.filter(
        mesh => !!mesh.morphTargetDictionary
      ).length
    };
  }

  dispose() {
    this.clear();

    if (this.characterRoot?.parent) {
      this.characterRoot.parent.remove(this.characterRoot);
    }

    this.characterRoot = null;
    this.scene = null;

    if (window.smMetaHumanCharacterAssembler === this) {
      window.smMetaHumanCharacterAssembler = null;
    }
  }
}

window.SMMetaHumanCharacterAssembler =
  SMMetaHumanCharacterAssembler;

if (!window.smMetaHumanCharacterAssembler) {
  window.smMetaHumanCharacterAssembler =
    new SMMetaHumanCharacterAssembler();
}
