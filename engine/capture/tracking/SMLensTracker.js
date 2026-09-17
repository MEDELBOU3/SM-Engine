(function () {
  "use strict";

  class SMLensTracker {
    constructor(options = {}) {
      this.options = {
        sensorWidth: 36,
        focalLength: 50,
        focusDistance: 5,
        aperture: 2.8,
        smoothing: 0.16,
        ...options,
      };

      this.camera = null;

      this.current = {
        focalLength: Number(this.options.focalLength) || 50,

        focusDistance: Number(this.options.focusDistance) || 5,

        aperture: Number(this.options.aperture) || 2.8,
      };

      this.target = {
        ...this.current,
      };

      this.enabled = true;
    }

    bindCamera(camera) {
      if (!camera?.isPerspectiveCamera) {
        throw new Error("SMLensTracker requires a THREE.PerspectiveCamera.");
      }

      this.camera = camera;

      this.applyImmediate();

      return this;
    }

    setFocalLength(mm) {
      const value = Math.max(1, Number(mm) || 50);

      this.target.focalLength = value;
    }

    setFocusDistance(distance) {
      this.target.focusDistance = Math.max(0.01, Number(distance) || 0.01);
    }

    setAperture(fStop) {
      this.target.aperture = Math.max(0.1, Number(fStop) || 2.8);
    }

    setLensState(state = {}) {
      if (state.focalLength !== undefined) {
        this.setFocalLength(state.focalLength);
      }

      if (state.focusDistance !== undefined) {
        this.setFocusDistance(state.focusDistance);
      }

      if (state.aperture !== undefined) {
        this.setAperture(state.aperture);
      }
    }

    _focalLengthToFov(focalLength) {
      const sensorWidth = Math.max(1, Number(this.options.sensorWidth) || 36);

      const radians =
        2 * Math.atan(sensorWidth / (2 * Math.max(focalLength, 0.001)));

      return THREE.MathUtils.radToDeg(radians);
    }

    applyImmediate() {
      if (!this.camera) return;

      this.current = {
        ...this.target,
      };

      this._applyToCamera();
    }

    _applyToCamera() {
      if (!this.camera) return;

      this.camera.fov = this._focalLengthToFov(this.current.focalLength);

      this.camera.userData = this.camera.userData || {};

      this.camera.userData.smLens = {
        focalLength: this.current.focalLength,

        sensorWidth: Number(this.options.sensorWidth) || 36,

        focusDistance: this.current.focusDistance,

        aperture: this.current.aperture,
      };

      this.camera.updateProjectionMatrix?.();
    }

    update(delta = 1 / 60) {
      if (!this.enabled || !this.camera) {
        return;
      }

      const smoothing = THREE.MathUtils.clamp(
        Number(this.options.smoothing) || 0,
        0,
        1,
      );

      const alpha =
        1 - Math.pow(1 - smoothing, Math.max(1, Number(delta) * 60));

      this.current.focalLength = THREE.MathUtils.lerp(
        this.current.focalLength,
        this.target.focalLength,
        alpha,
      );

      this.current.focusDistance = THREE.MathUtils.lerp(
        this.current.focusDistance,
        this.target.focusDistance,
        alpha,
      );

      this.current.aperture = THREE.MathUtils.lerp(
        this.current.aperture,
        this.target.aperture,
        alpha,
      );

      this._applyToCamera();
    }

    getLensState() {
      return {
        ...this.current,
        sensorWidth: Number(this.options.sensorWidth) || 36,
        fov:
          this.camera?.fov ?? this._focalLengthToFov(this.current.focalLength),
      };
    }

    destroy() {
      this.camera = null;
      this.enabled = false;
    }
  }

  window.SMLensTracker = SMLensTracker;
})();
