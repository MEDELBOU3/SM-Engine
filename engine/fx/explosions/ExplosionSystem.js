/*
 * SM Engine FX - ExplosionSystem
 * High-level explosion manager.
 */
(function (global) {
    'use strict';

    class ExplosionSystem extends global.SMFXSystem {
        constructor(options = {}) {
            super({
                ...options,
                name: options.name || 'SM Explosion System'
            });

            this.settings = {
                ...(global.SMExplosionPresets?.default || {}),
                ...(options.settings || {})
            };

            this.activeExplosions = [];
            this.presetName = 'default';
        }

        explode(position = new THREE.Vector3(), options = {}) {
            if (!this.initialized) this.initialize();

            const preset = options.preset
                ? global.SMExplosionPresets?.[options.preset]
                : null;

            const settings = {
                ...this.settings,
                ...(preset || {}),
                ...(options.settings || {})
            };

            const explosion = new global.SMExplosionEmitter({
                scene: this.scene,
                position,
                settings
            });

            explosion.start();
            this.activeExplosions.push(explosion);

            return explosion;
        }

        applyPreset(name) {
            const preset = global.SMExplosionPresets?.[name];
            if (!preset) {
                console.warn(`[SMFX][Explosion] Unknown preset: ${name}`);
                return this;
            }

            this.settings = { ...this.settings, ...preset };
            this.presetName = name;
            return this;
        }

        setParameters(params = {}) {
            this.settings = {
                ...this.settings,
                ...params
            };
            return this;
        }

        getParameters() {
            return {
                ...this.settings,
                preset: this.presetName
            };
        }

        clear() {
            for (const explosion of this.activeExplosions) {
                explosion.dispose();
            }
            this.activeExplosions.length = 0;
        }

        onUpdate(dt) {
            for (let i = this.activeExplosions.length - 1; i >= 0; i--) {
                const explosion = this.activeExplosions[i];
                explosion.update(dt);

                if (explosion.finished) {
                    explosion.dispose();
                    this.activeExplosions.splice(i, 1);
                }
            }
        }

        onDispose() {
            this.clear();
        }
    }

    global.SMExplosionSystem = ExplosionSystem;
})(window);
