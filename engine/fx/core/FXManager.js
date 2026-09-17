/*
 * SM Engine FX - FXManager
 * Central runtime coordinator.
 */
(function (global) {
    'use strict';

    class FXManager {
        constructor(options = {}) {
            this.scene = global.SMFXUtils?.resolveScene(options.scene) || null;
            this.camera = global.SMFXUtils?.resolveCamera(options.camera) || null;
            this.renderer = global.SMFXUtils?.resolveRenderer(options.renderer) || null;

            this.systems = new Map();
            this.elapsed = 0;
            this.enabled = true;

            // Auto-register Snow when its class is already loaded.
            if (global.SMSnowSystem) {
                this.register('snow', new global.SMSnowSystem({
                    scene: this.scene,
                    camera: this.camera,
                    renderer: this.renderer,
                    enabled: false
                }));
            }
        }

        register(name, system) {
            if (!name || !system) return null;

            if (this.systems.has(name)) {
                this.systems.get(name)?.dispose?.();
            }

            this.systems.set(name, system);
            system.initialize?.();

            if (name === 'snow') this.snow = system;

            return system;
        }

        unregister(name, dispose = true) {
            const system = this.systems.get(name);
            if (!system) return false;

            if (dispose) system.dispose?.();
            this.systems.delete(name);

            if (this[name] === system) delete this[name];
            return true;
        }

        get(name) {
            return this.systems.get(name) || null;
        }

        update(deltaTime) {
            if (!this.enabled) return;

            const dt = Math.min(Math.max(Number(deltaTime) || 0, 0), 0.1);
            this.elapsed += dt;

            for (const system of this.systems.values()) {
                try {
                    system.update?.(dt, this.elapsed);
                } catch (error) {
                    console.error(`[SMFX] Update failed in ${system.name || 'system'}:`, error);
                }
            }
        }

        setEnabled(enabled) {
            this.enabled = !!enabled;
        }

        dispose() {
            for (const system of this.systems.values()) {
                system.dispose?.();
            }
            this.systems.clear();
            this.snow = null;
        }
    }

    global.SMFXManager = FXManager;
})(window);
