(function () {
  "use strict";

  class SMCameraPoseTracker {
    constructor(options = {}) {
      this.options = {
        positionEnabled: true,
        rotationEnabled: true,
        positionScale: 1,
        rotationOffset: new THREE.Quaternion(),
        positionOffset: new THREE.Vector3(),
        ...options,
      };

      this.source = null;
      this.camera = null;

      this.basePosition = new THREE.Vector3();

      this.baseQuaternion = new THREE.Quaternion();

      this.enabled = false;
    }

    bindSource(source) {
      this.source = source || null;
      return this;
    }

    bindCamera(camera) {
      if (!camera?.isCamera) {
        throw new Error(
          "SMCameraPoseTracker.bindCamera expects a THREE.Camera.",
        );
      }

      this.camera = camera;

      this.basePosition.copy(camera.position);

      this.baseQuaternion.copy(camera.quaternion);

      return this;
    }

    captureBasePose() {
      if (!this.camera) return;

      this.basePosition.copy(this.camera.position);

      this.baseQuaternion.copy(this.camera.quaternion);
    }

    recenter() {
      if (!this.camera) return false;

      this.captureBasePose();

      const sourceRotation = this.source?.rotation;

      if (sourceRotation?.isQuaternion) {
        this.options.rotationOffset
          .copy(sourceRotation)
          .invert();
      } else {
        this.options.rotationOffset.identity();
      }

      const sourcePosition = this.source?.position;

      if (sourcePosition?.isVector3) {
        const scale = Number(this.options.positionScale) || 1;

        this.options.positionOffset
          .copy(sourcePosition)
          .multiplyScalar(-scale);
      } else {
        this.options.positionOffset.set(0, 0, 0);
      }

      return true;
    }

    setEnabled(value) {
      this.enabled = !!value;
    }

    resetCamera() {
      if (!this.camera) return;

      this.camera.position.copy(this.basePosition);

      this.camera.quaternion.copy(this.baseQuaternion);

      this.camera.updateMatrixWorld?.(true);
    }

    update() {
      if (!this.enabled || !this.camera || !this.source) {
        return;
      }

      if (this.options.positionEnabled && this.source.position) {
        const scale = Number(this.options.positionScale) || 1;

        this.camera.position
          .copy(this.basePosition)
          .addScaledVector(this.source.position, scale)
          .add(this.options.positionOffset || new THREE.Vector3());
      }

      if (this.options.rotationEnabled && this.source.rotation) {
        this.camera.quaternion
          .copy(this.baseQuaternion)
          .multiply(this.options.rotationOffset || new THREE.Quaternion())
          .multiply(this.source.rotation);
      }

      this.camera.updateMatrixWorld?.(true);
    }

    destroy() {
      this.source = null;
      this.camera = null;
      this.enabled = false;
    }
  }

  window.SMCameraPoseTracker = SMCameraPoseTracker;
})();
