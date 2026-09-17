// engine/audio/SMAudioListenerManager.js
// One engine listener that can move between editor camera and runtime/player camera.

(() => {
    "use strict";

    class SMAudioListenerManager {
        constructor() {
            this.listener = null;
            this.context = null;

            this.editorCamera = null;
            this.runtimeCamera = null;
            this.activeCamera = null;

            this.mode = "editor";

            this.unlocked = false;
            this.events = new EventTarget();

            this._unlockBound = false;
        }

        init(camera = null) {
            if (!window.THREE) {
                throw new Error(
                    "SMAudioListenerManager requires THREE."
                );
            }

            if (!this.listener) {
                this.listener =
                    new THREE.AudioListener();

                this.context =
                    this.listener.context;
            }

            if (camera) {
                this.setEditorCamera(camera);
            }

            this.installUnlockGesture();

            return this.listener;
        }

        installUnlockGesture() {
            if (this._unlockBound) return;

            this._unlockBound = true;

            const unlock = () => {
                this.unlock();

                window.removeEventListener(
                    "pointerdown",
                    unlock,
                    true
                );

                window.removeEventListener(
                    "keydown",
                    unlock,
                    true
                );
            };

            window.addEventListener(
                "pointerdown",
                unlock,
                true
            );

            window.addEventListener(
                "keydown",
                unlock,
                true
            );
        }

        async unlock() {
            if (!this.context) return false;

            try {
                if (
                    this.context.state ===
                    "suspended"
                ) {
                    await this.context.resume();
                }

                this.unlocked =
                    this.context.state ===
                    "running";

                this.emit(
                    "unlocked",
                    {
                        state:
                            this.context.state
                    }
                );

                return this.unlocked;
            } catch (error) {
                console.warn(
                    "[SMAudioListener] AudioContext resume failed:",
                    error
                );

                return false;
            }
        }

        setEditorCamera(camera) {
            this.editorCamera = camera || null;

            if (this.mode === "editor") {
                this.attachToCamera(
                    this.editorCamera
                );
            }

            return this.editorCamera;
        }

        setRuntimeCamera(camera) {
            this.runtimeCamera = camera || null;

            if (this.mode === "runtime") {
                this.attachToCamera(
                    this.runtimeCamera
                );
            }

            return this.runtimeCamera;
        }

        setMode(mode) {
            const normalized =
                mode === "runtime"
                    ? "runtime"
                    : "editor";

            this.mode = normalized;

            const camera =
                normalized === "runtime"
                    ? this.runtimeCamera
                    : this.editorCamera;

            this.attachToCamera(camera);

            this.emit(
                "mode-change",
                {
                    mode: this.mode,
                    camera:
                        this.activeCamera
                }
            );

            return this.mode;
        }

        useCamera(camera, mode = null) {
            if (mode === "runtime") {
                this.runtimeCamera = camera;
                this.mode = "runtime";
            } else if (mode === "editor") {
                this.editorCamera = camera;
                this.mode = "editor";
            }

            this.attachToCamera(camera);

            return camera;
        }

        attachToCamera(camera) {
            if (!this.listener || !camera) {
                return false;
            }

            if (
                this.listener.parent &&
                this.listener.parent !== camera
            ) {
                this.listener.parent.remove(
                    this.listener
                );
            }

            if (
                this.listener.parent !==
                camera
            ) {
                camera.add(
                    this.listener
                );
            }

            this.activeCamera = camera;

            this.emit(
                "camera-change",
                {
                    mode: this.mode,
                    camera
                }
            );

            return true;
        }

        getInput() {
            if (!this.listener) return null;

            if (
                typeof this.listener.getInput ===
                "function"
            ) {
                return this.listener.getInput();
            }

            return (
                this.listener.gain ||
                null
            );
        }

        getWorldPosition(target = null) {
            if (!this.listener) return null;

            const out =
                target ||
                new THREE.Vector3();

            this.listener.getWorldPosition(out);

            return out;
        }

        emit(type, payload) {
            const detail = {
                type,
                payload
            };

            this.events.dispatchEvent(
                new CustomEvent(type, { detail })
            );

            window.dispatchEvent(
                new CustomEvent(
                    `sm:audio-listener-${type}`,
                    { detail }
                )
            );
        }
    }

    window.SMAudioListenerManager =
        SMAudioListenerManager;
})();