// engine/metahuman/SMMetaHumanAssetImporter.js
//
// MetaHuman-specific bridge on top of the existing SM Engine model loaders.
// It imports GLB/GLTF/FBX/OBJ and registers the resulting meshes with
// SMMetaHumanSystem. It does not decode .dna or Unreal .uasset packages.

class SMMetaHumanAssetImporter {
  constructor(options = {}) {
    this.system = options.system || window.smMetaHumanSystem || null;
    this.assetLoader = options.assetLoader ||
      window.smMetaHumanAssetLoader || null;
    this.scene = options.scene || window.scene || null;

    this.supportedExtensions = ["glb", "gltf", "fbx", "obj"];
  }

  setSystem(system) {
    this.system = system || null;
    return this.system;
  }

  setAssetLoader(loader) {
    this.assetLoader = loader || null;
    return this.assetLoader;
  }

  setScene(scene) {
    this.scene = scene || null;
    return this.scene;
  }

  async importFile(file, options = {}) {
    if (!file) {
      throw new Error("[MetaHuman] AssetImporter: file is required.");
    }

    const name = options.name ||
      file.name ||
      "MetaHumanAsset";

    const extension = this._extension(name);

    if (!this.supportedExtensions.includes(extension)) {
      throw new Error(
        `[MetaHuman] Unsupported asset format: .${extension}`
      );
    }

    const object = await this._load(file, extension);

    if (!object) {
      throw new Error(
        `[MetaHuman] Could not load asset: ${name}`
      );
    }

    const root = object.scene || object;

    root.userData = root.userData || {};
    root.userData.smMetaHumanAsset = true;
    root.userData.smMetaHumanSource = name;
    root.userData.smMetaHumanFormat = extension;

    this._registerRoot(root, options.role || this._guessRole(name));

    if (options.addToScene !== false) {
      const scene = options.scene || this.scene || window.scene;

      if (scene && root.parent !== scene) {
        scene.add(root);
      }
    }

    return {
      name,
      extension,
      role: options.role || this._guessRole(name),
      object: root,
      meshes: this._collectMeshes(root)
    };
  }

  async importURL(url, options = {}) {
    if (!url) {
      throw new Error("[MetaHuman] AssetImporter: url is required.");
    }

    const name = options.name ||
      String(url).split("/").pop() ||
      "MetaHumanAsset";

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(
        `[MetaHuman] Asset request failed: HTTP ${response.status}`
      );
    }

    const extension = this._extension(name);
    const blob = await response.blob();

    const file = new File(
      [blob],
      name,
      { type: blob.type || "application/octet-stream" }
    );

    return this.importFile(file, {
      ...options,
      name,
      extension
    });
  }

  async _load(file, extension) {
    if (typeof THREE === "undefined") {
      throw new Error("[MetaHuman] THREE.js is not available.");
    }

    const loaders = {
      glb: THREE.GLTFLoader,
      gltf: THREE.GLTFLoader,
      fbx: THREE.FBXLoader,
      obj: THREE.OBJLoader
    };

    const LoaderClass = loaders[extension];

    if (!LoaderClass) {
      throw new Error(
        `[MetaHuman] Loader missing for .${extension}`
      );
    }

    const loader = new LoaderClass();

    if (extension === "glb" || extension === "gltf") {
      return this._loadGLTF(loader, file);
    }

    return this._loadFileLoader(loader, file);
  }

  _loadGLTF(loader, file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);

      loader.load(
        url,
        result => {
          URL.revokeObjectURL(url);
          resolve(result);
        },
        undefined,
        error => {
          URL.revokeObjectURL(url);
          reject(error);
        }
      );
    });
  }

  _loadFileLoader(loader, file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);

      loader.load(
        url,
        result => {
          URL.revokeObjectURL(url);
          resolve(result);
        },
        undefined,
        error => {
          URL.revokeObjectURL(url);
          reject(error);
        }
      );
    });
  }

  _registerRoot(root, role) {
    const system = this.system || window.smMetaHumanSystem;
    const assetLoader =
      this.assetLoader || window.smMetaHumanAssetLoader;

    if (!system) {
      console.warn(
        "[MetaHuman] AssetImporter: SMMetaHumanSystem not available."
      );
      return;
    }

    let firstMesh = true;

    root.traverse?.(node => {
      if (!node?.isMesh) return;

      const meshRole = firstMesh
        ? role
        : `${role}:${node.name || "mesh"}`;

      firstMesh = false;

      system.registerMesh(meshRole, node);

      if (assetLoader) {
        assetLoader.register(meshRole, node);
      }

      node.userData = node.userData || {};
      node.userData.smMetaHumanRole = meshRole;
    });
  }

  _collectMeshes(root) {
    const meshes = [];

    root.traverse?.(node => {
      if (!node?.isMesh) return;

      meshes.push({
        name: node.name || "mesh",
        morphTargets: Object.keys(
          node.morphTargetDictionary || {}
        ),
        hasSkeleton: !!node.skeleton
      });
    });

    return meshes;
  }

  _extension(name) {
    const clean = String(name)
      .split("?")[0]
      .split("#")[0];

    return clean.includes(".")
      ? clean.split(".").pop().toLowerCase()
      : "";
  }

  _guessRole(name) {
    const value = String(name).toLowerCase();

    if (value.includes("head") || value.includes("face")) return "head";
    if (value.includes("eye")) return "eyes";
    if (value.includes("hair")) return "hair";
    if (value.includes("cloth") || value.includes("shirt")) return "clothing";
    if (value.includes("body") || value.includes("torso")) return "body";

    return "character";
  }

  getSupportedExtensions() {
    return [...this.supportedExtensions];
  }
}

window.SMMetaHumanAssetImporter = SMMetaHumanAssetImporter;

if (!window.smMetaHumanAssetImporter) {
  window.smMetaHumanAssetImporter =
    new SMMetaHumanAssetImporter();
}
