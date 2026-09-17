// engine/metahuman/SMMetaHumanAssetLoader.js
//
// Loads the visual assets used by MetaHuman mode and registers them with
// SMMetaHumanSystem. This does not decode DNA by itself; the DNA runtime
// remains optional and is handled by SMMetaHumanDNA.

class SMMetaHumanAssetLoader {
  constructor(options = {}) {
    this.system = options.system || window.smMetaHumanSystem || null;
    this.scene = options.scene || window.scene || null;

    this.assets = {
      body: null,
      head: null,
      face: null,
      eyes: null,
      hair: null,
      clothing: null
    };

    this.loaded = false;
    this.loading = null;
  }

  setSystem(system) {
    this.system = system || null;
    return this.system;
  }

  setScene(scene) {
    this.scene = scene || null;
    return this.scene;
  }

  async load(options = {}) {
    if (this.loading) return this.loading;

    const system = this.system || window.smMetaHumanSystem;
    if (!system) {
      console.warn("[MetaHuman] AssetLoader: system not available.");
      return false;
    }

    this.system = system;

    this.loading = (async () => {
      const sources = options.sources || {};

      // Accept already-created Three.js objects.
      this.assets.body = sources.body || options.body || null;
      this.assets.head = sources.head || options.head || null;
      this.assets.face = sources.face || options.face || null;
      this.assets.eyes = sources.eyes || options.eyes || null;
      this.assets.hair = sources.hair || options.hair || null;
      this.assets.clothing = sources.clothing || options.clothing || null;

      this._registerAssets();

      this.loaded = true;
      return this.getAssets();
    })();

    try {
      return await this.loading;
    } finally {
      this.loading = null;
    }
  }

  register(name, object) {
    if (!(name in this.assets) || !object) return false;

    this.assets[name] = object;

    const system = this.system || window.smMetaHumanSystem;
    if (system) {
      system.registerMesh(name, object);
    }

    return true;
  }

  _registerAssets() {
    const system = this.system;
    if (!system) return;

    for (const [name, object] of Object.entries(this.assets)) {
      if (!object) continue;

      if (object.isMesh) {
        system.registerMesh(name, object);
        continue;
      }

      object.traverse?.(node => {
        if (!node?.isMesh) return;

        const meshName = node.name || name;
        system.registerMesh(meshName, node);
      });
    }
  }

  registerObject(name, object) {
    return this.register(name, object);
  }

  get(name) {
    return this.assets[name] || null;
  }

  getAssets() {
    return { ...this.assets };
  }

  getRegisteredMeshes() {
    const result = [];

    for (const [name, object] of Object.entries(this.assets)) {
      if (!object) continue;

      if (object.isMesh) {
        result.push({
          name,
          mesh: object,
          morphTargets: Object.keys(object.morphTargetDictionary || {})
        });
        continue;
      }

      object.traverse?.(node => {
        if (!node?.isMesh) return;

        result.push({
          name: node.name || name,
          mesh: node,
          morphTargets: Object.keys(node.morphTargetDictionary || {})
        });
      });
    }

    return result;
  }

  getStats() {
    const meshes = this.getRegisteredMeshes();

    return {
      loaded: this.loaded,
      assets: Object.values(this.assets).filter(Boolean).length,
      meshes: meshes.length,
      morphMeshes: meshes.filter(item =>
        item.morphTargets.length > 0
      ).length,
      morphTargets: meshes.reduce(
        (total, item) => total + item.morphTargets.length,
        0
      )
    };
  }

  dispose() {
    this.assets = {
      body: null,
      head: null,
      face: null,
      eyes: null,
      hair: null,
      clothing: null
    };

    this.loaded = false;
    this.loading = null;

    if (window.smMetaHumanAssetLoader === this) {
      window.smMetaHumanAssetLoader = null;
    }
  }
}

window.SMMetaHumanAssetLoader = SMMetaHumanAssetLoader;

if (!window.smMetaHumanAssetLoader) {
  window.smMetaHumanAssetLoader = new SMMetaHumanAssetLoader();
}
