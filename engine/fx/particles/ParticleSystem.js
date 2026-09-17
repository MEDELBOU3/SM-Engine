/*
 * SM Engine FX - ParticleSystem
 * High-level manager for custom particle emitters.
 */
(function (global) {
    'use strict';

    class ParticleSystem extends global.SMFXSystem {
        constructor(options = {}) {
            super({
                ...options,
                name: options.name || 'SM Particle System'
            });

            this.emitters = new Set();
            this.defaultPreset = options.defaultPreset || 'default';
        }

        createEmitter(options = {}) {
            if (!this.initialized) this.initialize();

            const preset = options.preset
                ? global.SMParticlePresets?.[options.preset]
                : global.SMParticlePresets?.[this.defaultPreset];

            const emitter = new global.SMCustomEmitter({
                scene: this.scene,
                ...(preset || {}),
                ...options
            });

            this.emitters.add(emitter);
            return emitter;
        }

        removeEmitter(emitter) {
            if (!emitter || !this.emitters.has(emitter)) return false;
            emitter.dispose?.();
            this.emitters.delete(emitter);
            return true;
        }

        clear() {
            for (const emitter of this.emitters) {
                emitter.dispose?.();
            }
            this.emitters.clear();
        }

        setEnabled(enabled) {
            super.setEnabled(enabled);

            for (const emitter of this.emitters) {
                emitter.setEnabled?.(enabled);
            }

            return this;
        }

        onUpdate(dt) {
            for (const emitter of this.emitters) {
                emitter.update?.(dt);
            }
        }

        onDispose() {
            this.clear();
        }
    }

    global.SMParticleSystem = ParticleSystem;
})(window);
