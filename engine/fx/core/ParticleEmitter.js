/*
 * SM Engine FX - ParticleEmitter
 * Base emitter with lifecycle and transform support.
 */
(function (global) {
    'use strict';

    class ParticleEmitter {
        constructor(options = {}) {
            if (!global.THREE) throw new Error('[SMFX] THREE is required.');

            this.scene = global.SMFXUtils?.resolveScene(options.scene) || options.scene || null;
            this.enabled = options.enabled !== false;

            this.object = new THREE.Group();
            this.object.name = options.name || 'FX_ParticleEmitter';

            if (options.position) this.object.position.copy(options.position);
            if (options.rotation) this.object.rotation.copy(options.rotation);

            this.elapsed = 0;
            this.disposed = false;

            this.scene?.add?.(this.object);
        }

        setPosition(position) {
            if (position) this.object.position.copy(position);
            return this;
        }

        setEnabled(enabled) {
            this.enabled = !!enabled;
            this.object.visible = this.enabled;
            return this;
        }

        update(deltaTime) {
            if (!this.enabled || this.disposed) return;
            const dt = Math.min(Math.max(Number(deltaTime) || 0, 0), 0.1);
            this.elapsed += dt;
            this.onUpdate?.(dt, this.elapsed);
        }

        dispose() {
            if (this.disposed) return;

            this.onDispose?.();

            this.object.traverse?.((child) => {
                if (child === this.object) return;
                global.SMFXUtils?.safeDispose?.(child);
            });

            this.scene?.remove?.(this.object);
            this.object.clear?.();
            this.disposed = true;
        }
    }

    global.SMParticleEmitter = ParticleEmitter;
})(window);
