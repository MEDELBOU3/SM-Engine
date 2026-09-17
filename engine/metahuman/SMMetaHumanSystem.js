// engine/metahuman/SMMetaHumanSystem.js

class SMMetaHumanSystem {
  constructor(options = {}) {
    this.scene = options.scene || window.scene || null;

    this.character = options.character ||
      new window.SMMetaHumanCharacter({ scene: this.scene });

    this.camera = options.camera || new window.SMMetaHumanCamera();

    this.presets = options.presets ||
      new window.SMMetaHumanPresets(this.character);

    this.faceBoard = options.faceBoard ||
      new window.SMMetaHumanFaceBoard();

    this.dna = options.dna ||
      new window.SMMetaHumanDNA();

    this.assetLoader = options.assetLoader ||
      new window.SMMetaHumanAssetLoader({
        system: this,
        scene: this.scene
      });

    this.assembler = options.assembler ||
      new window.SMMetaHumanCharacterAssembler({
        system: this,
        scene: this.scene
      });

    this.faceRig = options.faceRig ||
      new window.SMMetaHumanFaceRig({
        character: this.character,
        faceBoard: this.faceBoard
      });

    this.bodyRig = options.bodyRig ||
      new window.SMMetaHumanBodyRig({
        character: this.character
      });

    this.morphs = this.character.morphs || null;

    this.active = false;
    this.initialized = false;
    this.loading = null;

    window.smMetaHumanSystem = this;
    window.smMetaHumanCharacter = this.character;
    window.smMetaHumanAssetLoader = this.assetLoader;
    window.smMetaHumanCharacterAssembler = this.assembler;
    window.smMetaHumanFaceRig = this.faceRig;
    window.smMetaHumanBodyRig = this.bodyRig;
  }

  async initialize(options = {}) {
    if (this.initialized) return this;
    if (this.loading) return this.loading;

    this.loading = (async () => {
      await Promise.all([
        this.faceBoard.load(options.faceBoardUrl),
        this.dna.load(options.dnaUrl)
      ]);

      this.character.initialize({
        scene: this.scene,
        faceBoard: this.faceBoard.getData(),
        dna: this.dna.getBuffer()
      });

      this.morphs = this.character.morphs || this.morphs;

      this.faceRig.setCharacter(this.character);
      this.faceRig.setFaceBoard(this.faceBoard);
      this.faceRig.setMorphs(this.morphs);

      this.morphs?.setFaceRig?.(this.faceRig);
      this.morphs?.loadFaceBoard?.(this.faceBoard.getData());

      if (options.assets) {
        await this.assetLoader.load({
          sources: options.assets
        });
      }

      if (options.assemble !== false) {
        this.assembler.assemble({
          assets: this.assetLoader.getAssets(),
          scene: this.scene
        });
      }

      this.faceRig.registerCharacterMeshes(
        this.assembler.getRoot()
      );

      this.faceRig.build();

      this.bodyRig.setCharacter(this.character);
      this.bodyRig.setRoot(this.assembler.getRoot());

      this.initialized = true;
      this.loading = null;

      return this;
    })();

    try {
      return await this.loading;
    } catch (error) {
      this.loading = null;
      console.error("[MetaHuman] System initialization failed:", error);
      throw error;
    }
  }

  setScene(scene) {
    this.scene = scene || null;
    this.character.scene = this.scene;
    this.assetLoader.setScene(this.scene);
    this.assembler.setScene(this.scene);
    return this.scene;
  }

  registerMesh(name, mesh) {
    const ok = this.character.registerMesh(name, mesh);

    if (ok) {
      this.character.registerMeshMorphTargets(mesh);
      this.faceRig.registerMesh(mesh);
    }

    return ok;
  }

  registerMeshMorphTargets(mesh, names = []) {
    const count = this.character.registerMeshMorphTargets(mesh, names);
    this.faceRig.registerMesh(mesh);
    return count;
  }

  registerAsset(name, object) {
    const registered = this.assetLoader.register(name, object);

    if (registered) {
      this.assembler.addPart(name, object);
      this.faceRig.registerCharacterMeshes(object);
      this.faceRig.build();
    }

    return registered;
  }

  async loadAssets(options = {}) {
    const result = await this.assetLoader.load(options);

    if (options.assemble !== false) {
      this.assembler.assemble({
        assets: this.assetLoader.getAssets(),
        scene: options.scene || this.scene
      });
    }

    this.faceRig.registerCharacterMeshes(
      this.assembler.getRoot()
    );
    this.faceRig.build();
    this.bodyRig.setRoot(this.assembler.getRoot());

    return result;
  }

  assemble(options = {}) {
    const root = this.assembler.assemble({
      ...options,
      assets: options.assets || this.assetLoader.getAssets(),
      scene: options.scene || this.scene
    });

    this.faceRig.registerCharacterMeshes(root);
    this.faceRig.build();
    this.bodyRig.setRoot(root);

    return root;
  }

  setMorph(name, value) {
    return this.character.setMorph(name, value);
  }

  setFaceControl(name, value) {
    return this.morphs?.setControl?.(name, value) ?? false;
  }

  setBody(values = {}) {
    return this.bodyRig.set(values);
  }

  getAsset(name) {
    return this.assetLoader.get(name);
  }

  getRegisteredMeshes() {
    return this.assetLoader.getRegisteredMeshes();
  }

  getCharacterRoot() {
    return this.assembler.getRoot();
  }

  async loadFaceBoard(url) {
    const data = await this.faceBoard.load(url);
    this.faceRig.setFaceBoard(this.faceBoard);
    this.morphs?.loadFaceBoard?.(data);
    this.faceRig.build();
    return data;
  }

  async loadDNA(url) {
    return this.dna.load(url);
  }

  activate(mode = "FULL_BODY") {
    this.active = true;
    this.camera.activate({ mode });
    return true;
  }

  deactivate() {
    this.active = false;
    this.camera.deactivate();
    return true;
  }

  setCameraMode(mode) {
    return this.camera.setMode(mode);
  }

  applyPreset(name) {
    return this.presets.apply(name);
  }

  update(deltaTime = 0) {
    if (!this.active) return;
    this.character.update(deltaTime);
    this.camera.update(deltaTime);
  }

  getState() {
    return {
      initialized: this.initialized,
      active: this.active,
      character: this.character.getStats(),
      camera: this.camera.getState(),
      assets: this.assetLoader.getStats(),
      assembly: this.assembler.getStats(),
      faceRig: this.faceRig.getStats(),
      body: this.bodyRig.get(),
      faceBoardLoaded: this.faceBoard.isLoaded(),
      faceBoardRig: this.faceBoard.getRigDefinition(),
      dnaLoaded: this.dna.isLoaded(),
      dnaRuntimeReady: this.dna.isRuntimeReady(),
      dna: this.dna.getInfo()
    };
  }

  dispose() {
    this.deactivate();
    this.faceRig.dispose();
    this.bodyRig.dispose();
    this.assembler.dispose();
    this.assetLoader.dispose();
    this.character.dispose();
    this.camera.dispose();
    this.faceBoard.dispose();
    this.dna.dispose();

    this.initialized = false;
    this.loading = null;

    if (window.smMetaHumanSystem === this) window.smMetaHumanSystem = null;
    if (window.smMetaHumanCharacter === this.character) window.smMetaHumanCharacter = null;
    if (window.smMetaHumanAssetLoader === this.assetLoader) window.smMetaHumanAssetLoader = null;
    if (window.smMetaHumanCharacterAssembler === this.assembler) window.smMetaHumanCharacterAssembler = null;
    if (window.smMetaHumanFaceRig === this.faceRig) window.smMetaHumanFaceRig = null;
    if (window.smMetaHumanBodyRig === this.bodyRig) window.smMetaHumanBodyRig = null;
  }
}

window.SMMetaHumanSystem = SMMetaHumanSystem;

if (!window.smMetaHumanSystem) {
  new SMMetaHumanSystem();
}
