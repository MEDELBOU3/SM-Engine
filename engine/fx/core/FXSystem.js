/*
 * SM Engine FX - FXSystem
 * Base lifecycle class for all FX systems.
 */
(function (global) {
    'use strict';

    class FXSystem {
        constructor(options = {}) {
            global.SMFXUtils?.assertThree?.();

            this.scene = global.SMFXUtils?.resolveScene(options.scene) || options.scene || null;
            this.camera = global.SMFXUtils?.resolveCamera(options.camera) || options.camera || null;
            this.renderer = global.SMFXUtils?.resolveRenderer(options.renderer) || options.renderer || null;

            this.enabled = options.enabled !== false;
            this.initialized = false;
            this.disposed = false;
            this.name = options.name || this.constructor.name;
        }

        initialize() {
            if (this.disposed) {
                throw new Error(`[SMFX] Cannot initialize disposed system: ${this.name}`);
            }
            if (this.initialized) return this;

            this.onInitialize?.();
            this.initialized = true;
            return this;
        }

        setEnabled(enabled) {
            this.enabled = !!enabled;
            this.onEnabledChanged?.(this.enabled);
            return this;
        }

        toggle() {
            return this.setEnabled(!this.enabled);
        }

        update(deltaTime, elapsedTime) {
            if (!this.enabled || this.disposed) return;
            if (!this.initialized) this.initialize();

            const dt = Number.isFinite(deltaTime) ? Math.min(Math.max(deltaTime, 0), 0.1) : 0;
            this.onUpdate?.(dt, elapsedTime);
        }

        dispose() {
            if (this.disposed) return;
            try {
                this.onDispose?.();
            } finally {
                this.disposed = true;
                this.initialized = false;
            }
        }
    }

    global.SMFXSystem = FXSystem;
})(window);
