/*
 * SM Engine FX - ExplosionEmitter
 * Composite explosion instance.
 */
(function (global) {
    'use strict';

    class ExplosionEmitter {
        constructor(options = {}) {
            this.scene = global.SMFXUtils?.resolveScene(options.scene) || options.scene || null;
            this.position = options.position?.clone?.() || new THREE.Vector3();

            this.settings = {
                ...(global.SMExplosionPresets?.default || {}),
                ...(options.settings || {})
            };

            this.elapsed = 0;
            this.finished = false;
            this.started = false;

            this.fire = null;
            this.smoke = null;
            this.shockwave = null;
            this.debris = null;
            this.sparks = null;
        }

        start() {
            if (this.started) return this;
            this.started = true;

            const s = this.settings;

            if ((s.fireIntensity ?? 0) > 0) {
                this.fire = new global.SMFireEmitter({
                    scene: this.scene,
                    position: this.position,
                    duration: Math.max(0.25, s.duration * 0.55),
                    intensity: s.fireIntensity,
                    size: s.fireSize,
                    count: Math.min(s.maxParticles || 5000, Math.round((s.maxParticles || 5000) * 0.35)),
                    color: s.color
                });
            }

            if ((s.smokeDensity ?? 0) > 0) {
                this.smoke = new global.SMSmokeEmitter({
                    scene: this.scene,
                    position: this.position,
                    duration: Math.max(0.5, s.duration),
                    density: s.smokeDensity,
                    speed: s.smokeSpeed,
                    size: Math.max(2, s.fireSize * 0.8),
                    count: Math.round((s.maxParticles || 5000) * 0.15)
                });
            }

            if (s.shockwave) {
                this.shockwave = new global.SMShockwaveEffect({
                    scene: this.scene,
                    position: this.position,
                    duration: Math.min(1.5, Math.max(0.35, s.duration * 0.22)),
                    radius: Math.max(2, s.force * 0.75)
                });
            }

            if (s.debris) {
                this.debris = new global.SMDebrisEmitter({
                    scene: this.scene,
                    position: this.position,
                    duration: Math.min(4.5, Math.max(1.2, s.duration * 0.75)),
                    force: s.force,
                    count: Math.round(THREE.MathUtils.clamp(s.force * 2, 10, 90))
                });
            }

            if (s.sparks) {
                this.sparks = new global.SMSparkEmitter({
                    scene: this.scene,
                    position: this.position,
                    duration: Math.min(2.5, Math.max(0.5, s.duration * 0.4)),
                    force: s.force,
                    count: Math.round(THREE.MathUtils.clamp(s.maxParticles * 0.08, 80, 1600))
                });
            }

            return this;
        }

        update(dt) {
            if (!this.started || this.finished) return;

            this.elapsed += dt;

            this.fire?.update(dt);
            this.smoke?.update(dt);
            this.shockwave?.update(dt);
            this.debris?.update(dt);
            this.sparks?.update(dt);

            const done =
                (!this.fire || this.fire.finished) &&
                (!this.smoke || this.smoke.finished) &&
                (!this.shockwave || this.shockwave.finished) &&
                (!this.debris || this.debris.finished) &&
                (!this.sparks || this.sparks.finished);

            if (done) this.finished = true;
        }

        dispose() {
            this.fire?.dispose?.();
            this.smoke?.dispose?.();
            this.shockwave?.dispose?.();
            this.debris?.dispose?.();
            this.sparks?.dispose?.();

            this.fire = null;
            this.smoke = null;
            this.shockwave = null;
            this.debris = null;
            this.sparks = null;

            this.finished = true;
        }
    }

    global.SMExplosionEmitter = ExplosionEmitter;
})(window);
