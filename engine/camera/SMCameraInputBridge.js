// engine/camera/SMCameraInputBridge.js
// Professional viewport shortcuts.
//
// F / Numpad .  -> frame selection
// Home          -> frame visible scene
// Numpad 1      -> Front
// Ctrl+Numpad 1 -> Back
// Numpad 3      -> Right
// Ctrl+Numpad 3 -> Left
// Numpad 7      -> Top
// Ctrl+Numpad 7 -> Bottom
// Numpad 5      -> Perspective/Orthographic
// Esc           -> cancel camera flight
(function () {
  "use strict";

  class SMCameraInputBridge {
    constructor() {
      this.system = null;
      this.bound = false;

      this._onKeyDown = this._handleKeyDown.bind(this);
    }

    init(system = window.cameraSystem || null) {
      if (!system) {
        return false;
      }

      this.system = system;

      if (!this.bound) {
        window.addEventListener("keydown", this._onKeyDown, {
          capture: true,
        });

        this.bound = true;
      }

      return true;
    }

    _isTyping(event) {
      const target = event.target;

      const tag = target?.tagName?.toLowerCase?.();

      return !!(
        tag === "input" ||
        tag === "textarea" ||
        tag === "select" ||
        target?.isContentEditable
      );
    }

    _handleKeyDown(event) {
      if (this._isTyping(event)) {
        return;
      }

      const system = this.system || window.cameraSystem;

      if (!system) {
        return;
      }

      if (event.code === "Escape" && system._flight) {
        system.stopFlight();

        event.preventDefault();

        return;
      }

      if (event.code === "KeyF" && !event.ctrlKey && !event.altKey) {
        if (
          system.frameSelection({
            animate: true,
            duration: 0.35,
          })
        ) {
          event.preventDefault();
        }

        return;
      }

      if (event.code === "NumpadDecimal") {
        if (
          system.frameSelection({
            animate: true,
            duration: 0.35,
          })
        ) {
          event.preventDefault();
        }

        return;
      }

      if (event.code === "Numpad5") {
        system.toggleProjection();

        event.preventDefault();

        return;
      }

      if (event.code === "Numpad1") {
        system.setAxisView(event.ctrlKey ? "-z" : "z", {
          orthographic: true,
        });

        event.preventDefault();

        return;
      }

      if (event.code === "Numpad3") {
        system.setAxisView(event.ctrlKey ? "-x" : "x", {
          orthographic: true,
        });

        event.preventDefault();

        return;
      }

      if (event.code === "Numpad7") {
        system.setAxisView(event.ctrlKey ? "-y" : "y", {
          orthographic: true,
        });

        event.preventDefault();

        return;
      }

      if (event.code === "Home") {
        const scene = window.scene;

        if (!scene) {
          return;
        }

        const visible = [];

        scene.children.forEach((object) => {
          if (
            object.visible !== false &&
            !object.userData?.isSystemObject &&
            !object.userData?.editorOnly
          ) {
            visible.push(object);
          }
        });

        if (
          system.frameObjects(visible, {
            animate: true,
            duration: 0.45,
          })
        ) {
          event.preventDefault();
        }
      }
    }

    dispose() {
      if (!this.bound) {
        return;
      }

      window.removeEventListener("keydown", this._onKeyDown, {
        capture: true,
      });

      this.bound = false;
    }
  }

  window.SMCameraInputBridge = SMCameraInputBridge;

  window.smCameraInputBridge =
    window.smCameraInputBridge || new SMCameraInputBridge();
})();
