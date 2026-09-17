// engine/metahuman/SMMetaHumanWorkspace.js
class SMMetaHumanWorkspace {
  constructor(options = {}) {
    this.system = options.system || window.smMetaHumanSystem || null;
    this.camera = options.camera || this.system?.camera || null;
    this.mode = "METAHUMAN";
    this.active = false;
  }

  enter() {
    this.system ||= window.smMetaHumanSystem || null;
    this.camera ||= this.system?.camera || null;
    this.active = true;

    if (this.system) {
      this.system.activate("FULL_BODY");
    }

    window.currentWorkspaceMode = this.mode;
    return true;
  }

  exit() {
    if (this.system) this.system.deactivate();
    this.active = false;
    return true;
  }

  setCameraMode(mode) {
    return this.system?.setCameraMode(mode) || false;
  }

  update(deltaTime = 0) {
    if (!this.active) return;
    this.system?.update(deltaTime);
  }

  getState() {
    return {
      mode: this.mode,
      active: this.active,
      camera: this.camera?.getState?.() || null
    };
  }

  dispose() {
    this.exit();
    this.system = null;
    this.camera = null;
  }
}

window.SMMetaHumanWorkspace = SMMetaHumanWorkspace;
