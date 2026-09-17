// ============================================================================
// engine/2d/camera/SMCamera2DShake.js
// SM Engine - Non-linear Trauma-Based 2D Camera Shake Effect
// ============================================================================
(function (root) {
    'use strict';

    class SMCamera2DShake {
        constructor() {
            this.trauma = 0; // Range: 0.0 to 1.0
            this.decaySpeed = 1.6; // Rate at which trauma decays per second
            this.maxAngle = 0.08; // Maximum rotational shake in radians
            this.maxOffset = 1.2; // Maximum position offset in world units
            this.frequency = 25.0; // Oscillation speed
            this.time = 0;
        }

        addTrauma(amount = 0.5) {
            this.trauma = Math.min(1.0, this.trauma + amount);
        }

        update(delta = 1 / 60) {
            if (this.trauma <= 0) return { x: 0, y: 0, rotation: 0 };

            this.time += delta * this.frequency;

            // Non-linear shake power: Shake = Trauma ^ 2
            const shake = this.trauma * this.trauma;

            // Harmonic procedural offsets
            const offsetX = (Math.sin(this.time) + Math.sin(this.time * 1.3)) * 0.5 * this.maxOffset * shake;
            const offsetY = (Math.cos(this.time * 1.1) + Math.cos(this.time * 1.7)) * 0.5 * this.maxOffset * shake;
            const rotation = Math.sin(this.time * 0.9) * this.maxAngle * shake;

            // Decay trauma over time
            this.trauma = Math.max(0, this.trauma - this.decaySpeed * delta);

            return { x: offsetX, y: offsetY, rotation };
        }
    }

    root.SMCamera2DShake = SMCamera2DShake;

})(window);