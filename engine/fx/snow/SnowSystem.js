/*
 * SM Engine FX - SnowSystem
 * High-level snow feature used by UI, game logic and AI tools.
 */
(function (global) {
    'use strict';

    class SnowSystem extends global.SMFXSystem {
        constructor(options = {}) {
            super({
                ...options,
                name: options.name || 'SM Snow System'
            });

            this.settings = {
                ...(global.SMSnowPresets?.default || {
                    mode: 'normal',
                    density: 1000,
                    size: 0.1,
                    speed: 1,
                    wind: 0,
                    turbulence: 0.5,
                    area: 30,
                    height: 20
                }),
                ...(options.settings || {})
            };

            this.emitter = null;
        }

        onInitialize() {
            if (!this.scene) {
                this.scene = global.SMFXUtils?.resolveScene();
            }

            if (!this.scene) {
                throw new Error('[SMFX][Snow] Scene is not available.');
            }

            this.emitter = new global.SMSnowEmitter({
                scene: this.scene,
                ...this.settings
            });

            this.emitter.setEnabled(this.enabled);
        }

        onEnabledChanged(enabled) {
            this.emitter?.setEnabled(enabled);
        }

        setMode(mode) {
            this.settings.mode = mode === 'vortex' ? 'vortex' : 'normal';
            this.emitter?.setMode(this.settings.mode);
            return this;
        }

        setDensity(value) {
            this.settings.density = Math.round(global.SMFXUtils.clamp(value, 100, 100000));
            this.emitter?.setDensity(this.settings.density);
            return this;
        }

        setSize(value) {
            this.settings.size = global.SMFXUtils.clamp(value, 0.01, 2);
            this.emitter?.setSize(this.settings.size);
            return this;
        }

        setSpeed(value) {
            this.settings.speed = global.SMFXUtils.clamp(value, 0, 20);
            this.emitter?.setSpeed(this.settings.speed);
            return this;
        }

        setWind(value) {
            this.settings.wind = global.SMFXUtils.clamp(value, -20, 20);
            this.emitter?.setWind(this.settings.wind);
            return this;
        }

        setTurbulence(value) {
            this.settings.turbulence = global.SMFXUtils.clamp(value, 0, 5);
            this.emitter?.setTurbulence(this.settings.turbulence);
            return this;
        }

        setPosition(position) {
            this.emitter?.setPosition(position);
            return this;
        }

        applyPreset(name) {
            const preset = global.SMSnowPresets?.[name];
            if (!preset) {
                console.warn(`[SMFX][Snow] Unknown preset: ${name}`);
                return this;
            }

            this.settings = { ...this.settings, ...preset };
            this.emitter?.applySettings(this.settings);

            console.info(`[SMFX][Snow] Applied preset: ${name}`, this.settings);
            return this;
        }

        getParameters() {
            return { ...this.settings, enabled: this.enabled };
        }

        setParameters(params = {}) {
            if ('mode' in params) this.setMode(params.mode);
            if ('density' in params) this.setDensity(params.density);
            if ('size' in params) this.setSize(params.size);
            if ('speed' in params) this.setSpeed(params.speed);
            if ('wind' in params) this.setWind(params.wind);
            if ('turbulence' in params) this.setTurbulence(params.turbulence);
            if ('enabled' in params) this.setEnabled(params.enabled);
            return this;
        }

        onUpdate(dt) {
            this.emitter?.update(dt);
        }

        onDispose() {
            this.emitter?.dispose();
            this.emitter = null;
        }
    }

    global.SMSnowSystem = SnowSystem;
})(window);
