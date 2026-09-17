// engine/metahuman/SMMetaHumanCamera.js
class SMMetaHumanCamera {
  constructor(camera = null) {
    this.system = window.cameraSystem || null;
    this.camera = camera || this.system?.activeCamera || this.system?.camera || window.camera || null;
    this.mode = "FULL_BODY";
    this.active = false;
    this.speed = 8;
    this.saved = null;
    this.target = new THREE.Vector3(0, 1.55, 0);

    this.modes = {
      FULL_BODY: { position: [0, 1.7, 3.2], target: [0, 1.55, 0] },
      HEAD:      { position: [0, 1.65, 1.25], target: [0, 1.6, 0] },
      FACE:      { position: [0, 1.62, 0.75], target: [0, 1.6, 0] },
      EYES:      { position: [0, 1.63, 0.5], target: [0, 1.63, 0] },
      HAIR:      { position: [0, 1.75, 0.95], target: [0, 1.65, 0] },
      CLOTHING:  { position: [0, 1.35, 1.8], target: [0, 1.2, 0] }
    };
  }

  setCamera(camera) {
    this.camera = camera || this.system?.activeCamera || window.camera || null;
    return this.camera;
  }

  activate(options = {}) {
    this.system ||= window.cameraSystem || null;
    this.setCamera(this.system?.activeCamera || this.camera);
    if (!this.camera) return false;

    this._save();
    this.active = true;
    if (options.mode) this.mode = options.mode;
    this.snapToMode();
    return true;
  }

  deactivate() {
    if (!this.active) return true;
    this.active = false;
    this._restore();
    return true;
  }

  setMode(mode, smooth = true) {
    if (!this.modes[mode]) return false;
    this.mode = mode;
    if (!smooth) this.snapToMode();
    return true;
  }

  snapToMode() {
    const config = this.modes[this.mode];
    if (!config || !this.camera) return false;

    this.camera.position.fromArray(config.position);
    this.target.fromArray(config.target);

    const controls = this.system?.controls;
    if (controls?.target) {
      controls.target.copy(this.target);
      controls.update?.();
    } else {
      this.camera.lookAt(this.target);
    }

    return true;
  }

  update(deltaTime = 0) {
    if (!this.active || !this.camera) return;

    const config = this.modes[this.mode];
    if (!config) return;

    const p = new THREE.Vector3().fromArray(config.position);
    const t = new THREE.Vector3().fromArray(config.target);
    const alpha = 1 - Math.exp(-this.speed * Math.max(0, deltaTime));

    this.camera.position.lerp(p, alpha);

    const controls = this.system?.controls;
    if (controls?.target) {
      controls.target.lerp(t, alpha);
      controls.update?.();
    } else {
      this.target.lerp(t, alpha);
      this.camera.lookAt(this.target);
    }
  }

  reset() {
    this.mode = "FULL_BODY";
    this.snapToMode();
  }

  _save() {
    if (!this.camera) return;
    const controls = this.system?.controls;
    this.saved = {
      position: this.camera.position.clone(),
      target: controls?.target?.clone() || this.target.clone(),
      fov: this.camera.fov,
      zoom: this.camera.zoom
    };
  }

  _restore() {
    if (!this.camera || !this.saved) return;

    this.camera.position.copy(this.saved.position);
    if ("fov" in this.saved && this.camera.fov != null) this.camera.fov = this.saved.fov;
    if ("zoom" in this.saved && this.camera.zoom != null) this.camera.zoom = this.saved.zoom;

    const controls = this.system?.controls;
    if (controls?.target) {
      controls.target.copy(this.saved.target);
      controls.update?.();
    } else {
      this.camera.lookAt(this.saved.target);
    }

    this.camera.updateProjectionMatrix?.();
    this.saved = null;
  }

  setPosition(x, y, z) {
    this.camera?.position.set(x, y, z);
  }

  setTarget(x, y, z) {
    const controls = this.system?.controls;
    this.target.set(x, y, z);
    if (controls?.target) {
      controls.target.copy(this.target);
      controls.update?.();
    } else {
      this.camera?.lookAt(this.target);
    }
  }

  getState() {
    return {
      active: this.active,
      mode: this.mode,
      position: this.camera?.position?.toArray() || null,
      target: this.system?.controls?.target?.toArray() || this.target.toArray()
    };
  }

  dispose() {
    this.active = false;
    this.saved = null;
    this.camera = null;
    this.system = null;
  }
}

window.SMMetaHumanCamera = SMMetaHumanCamera;
