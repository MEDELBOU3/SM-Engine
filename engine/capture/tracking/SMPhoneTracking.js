(function () {
  "use strict";

  class SMPhoneTracking {
    constructor(options = {}) {
      this.options = {
        orientationEnabled: true,
        motionEnabled: true,
        positionScale: 0.015,
        smoothing: 0.18,
        ...options,
      };

      this.enabled = false;

      this.orientation = {
        alpha: 0,
        beta: 0,
        gamma: 0,
        absolute: false,
      };

      this.motion = {
        acceleration: {
          x: 0,
          y: 0,
          z: 0,
        },
        accelerationIncludingGravity: {
          x: 0,
          y: 0,
          z: 0,
        },
        rotationRate: {
          alpha: 0,
          beta: 0,
          gamma: 0,
        },
        interval: 0,
      };

      this.position = new THREE.Vector3();

      this.rotation = new THREE.Quaternion();

      this._targetRotation = new THREE.Quaternion();

      this._deviceEuler = new THREE.Euler();

      this.listeners = new Map();

      this._boundOrientation = this._handleOrientation.bind(this);

      this._boundMotion = this._handleMotion.bind(this);
    }

    on(event, callback) {
      if (typeof callback !== "function") {
        return () => {};
      }

      if (!this.listeners.has(event)) {
        this.listeners.set(event, new Set());
      }

      this.listeners.get(event).add(callback);

      return () => {
        this.listeners.get(event)?.delete(callback);
      };
    }

    emit(event, detail = {}) {
      const callbacks = this.listeners.get(event);

      if (!callbacks) return;

      for (const callback of callbacks) {
        try {
          callback(detail);
        } catch (error) {
          console.error("[SMPhoneTracking]", error);
        }
      }
    }

    async requestPermission() {
      const results = {
        orientation: true,
        motion: true,
      };

      if (
        typeof DeviceOrientationEvent !== "undefined" &&
        typeof DeviceOrientationEvent.requestPermission === "function"
      ) {
        const response = await DeviceOrientationEvent.requestPermission();

        results.orientation = response === "granted";
      }

      if (
        typeof DeviceMotionEvent !== "undefined" &&
        typeof DeviceMotionEvent.requestPermission === "function"
      ) {
        const response = await DeviceMotionEvent.requestPermission();

        results.motion = response === "granted";
      }

      return results;
    }

    async start() {
      if (this.enabled) {
        return true;
      }

      const permissions = await this.requestPermission();

      if (this.options.orientationEnabled && permissions.orientation) {
        window.addEventListener(
          "deviceorientation",
          this._boundOrientation,
          true,
        );
      }

      if (this.options.motionEnabled && permissions.motion) {
        window.addEventListener("devicemotion", this._boundMotion, true);
      }

      this.enabled = true;

      this.emit("start", {
        permissions,
      });

      return true;
    }

    stop() {
      if (!this.enabled) return;

      window.removeEventListener(
        "deviceorientation",
        this._boundOrientation,
        true,
      );

      window.removeEventListener("devicemotion", this._boundMotion, true);

      this.enabled = false;

      this.emit("stop", {});
    }

    _handleOrientation(event) {
      this.orientation.alpha = Number(event.alpha) || 0;

      this.orientation.beta = Number(event.beta) || 0;

      this.orientation.gamma = Number(event.gamma) || 0;

      this.orientation.absolute = !!event.absolute;

      const alpha = THREE.MathUtils.degToRad(this.orientation.alpha);

      const beta = THREE.MathUtils.degToRad(this.orientation.beta);

      const gamma = THREE.MathUtils.degToRad(this.orientation.gamma);

      this._deviceEuler.set(beta, alpha, -gamma, "YXZ");

      this._targetRotation.setFromEuler(this._deviceEuler);

      this.emit("orientation", {
        orientation: {
          ...this.orientation,
        },
        quaternion: this._targetRotation.clone(),
      });
    }

    _handleMotion(event) {
      const acceleration = event.acceleration || {};

      const gravityAcceleration = event.accelerationIncludingGravity || {};

      const rotationRate = event.rotationRate || {};

      this.motion.acceleration.x = Number(acceleration.x) || 0;

      this.motion.acceleration.y = Number(acceleration.y) || 0;

      this.motion.acceleration.z = Number(acceleration.z) || 0;

      this.motion.accelerationIncludingGravity.x =
        Number(gravityAcceleration.x) || 0;

      this.motion.accelerationIncludingGravity.y =
        Number(gravityAcceleration.y) || 0;

      this.motion.accelerationIncludingGravity.z =
        Number(gravityAcceleration.z) || 0;

      this.motion.rotationRate.alpha = Number(rotationRate.alpha) || 0;

      this.motion.rotationRate.beta = Number(rotationRate.beta) || 0;

      this.motion.rotationRate.gamma = Number(rotationRate.gamma) || 0;

      this.motion.interval = Number(event.interval) || 0;

      const dt = Math.max(0.001, this.motion.interval / 1000);

      const scale = Number(this.options.positionScale) || 0;

      this.position.x += this.motion.acceleration.x * dt * scale;

      this.position.y += this.motion.acceleration.z * dt * scale;

      this.position.z -= this.motion.acceleration.y * dt * scale;

      this.emit("motion", {
        motion: JSON.parse(JSON.stringify(this.motion)),
        position: this.position.clone(),
      });
    }

    update() {
      const smoothing = THREE.MathUtils.clamp(
        Number(this.options.smoothing) || 0,
        0,
        1,
      );

      this.rotation.slerp(this._targetRotation, 1 - Math.pow(1 - smoothing, 2));
    }

    setRemotePose(data = {}) {
      if (data.quaternion) {
        this._targetRotation
          .set(
            Number(data.quaternion.x) || 0,
            Number(data.quaternion.y) || 0,
            Number(data.quaternion.z) || 0,
            Number(data.quaternion.w) || 1,
          )
          .normalize();
      }

      if (data.position) {
        this.position.set(
          Number(data.position.x) || 0,
          Number(data.position.y) || 0,
          Number(data.position.z) || 0,
        );
      }

      this.emit("remotepose", {
        position: this.position.clone(),
        quaternion: this._targetRotation.clone(),
      });
    }

    reset() {
      this.position.set(0, 0, 0);

      this.rotation.identity();
      this._targetRotation.identity();

      this.orientation.alpha = 0;
      this.orientation.beta = 0;
      this.orientation.gamma = 0;
    }

    destroy() {
      this.stop();
      this.listeners.clear();
    }
  }

  window.SMPhoneTracking = SMPhoneTracking;
})();
