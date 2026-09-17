(function (global) {
    'use strict';

    const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

    class SMEyeAdaptation {
        constructor(options = {}) {
            this.current = Number.isFinite(options.initialExposure) ? options.initialExposure : 1;
            this.target = this.current;
            this.speedDarkToLight = options.speedDarkToLight ?? 3.5;
            this.speedLightToDark = options.speedLightToDark ?? 1.15;
            this.deadZone = options.deadZone ?? 0.015;
        }

        reset(value = 1) {
            this.current = Math.max(0.001, Number(value) || 1);
            this.target = this.current;
            return this.current;
        }

        update(delta, target, options = {}) {
            this.target = Math.max(0.001, Number(target) || 1);
            const difference = this.target - this.current;
            if (Math.abs(difference) <= Math.max(0.001, this.current * this.deadZone)) {
                return this.current;
            }

            // Lower exposure is the eye adapting to a bright scene and should
            // react faster than recovery when returning to darkness.
            const speed = difference < 0
                ? (options.speedDarkToLight ?? this.speedDarkToLight)
                : (options.speedLightToDark ?? this.speedLightToDark);
            const amount = 1 - Math.exp(-Math.max(0, speed) * clamp(delta, 0, 0.1));
            this.current += difference * amount;
            return this.current;
        }
    }

    global.SMEyeAdaptation = SMEyeAdaptation;
})(window);
