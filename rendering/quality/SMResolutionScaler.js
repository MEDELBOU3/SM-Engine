(function (global) {
    'use strict';

    class SMResolutionScaler {
        constructor(
            renderer = global.renderer,
            options = {}
        ) {
            this.renderer =
                renderer || null;

            this.enabled =
                options.enabled !== false;

            this.minScale =
                options.minScale ?? 0.65;

            this.maxScale =
                options.maxScale ?? 1.0;

            this.scale =
                THREE.MathUtils.clamp(
                    options.scale ?? 1.0,
                    this.minScale,
                    this.maxScale
                );

            this.targetFPS =
                options.targetFPS ?? 60;

            this.smoothing =
                options.smoothing ?? 0.08;

            this.adjustInterval =
                options.adjustInterval ?? 0.7;

            this.elapsed = 0;
            this.smoothedFPS =
                this.targetFPS;
        }

        update(
            delta,
            basePixelRatio =
                Math.min(
                    global.devicePixelRatio || 1,
                    2
                )
        ) {
            if (
                !this.enabled ||
                !this.renderer ||
                !Number.isFinite(delta) ||
                delta <= 0
            ) {
                return this.scale;
            }

            const fps =
                1 / delta;

            this.smoothedFPS =
                THREE.MathUtils.lerp(
                    this.smoothedFPS,
                    fps,
                    this.smoothing
                );

            this.elapsed += delta;

            if (
                this.elapsed <
                this.adjustInterval
            ) {
                return this.scale;
            }

            this.elapsed = 0;

            const lower =
                this.targetFPS * 0.9;

            const upper =
                this.targetFPS * 1.08;

            if (
                this.smoothedFPS <
                lower
            ) {
                this.scale -= 0.05;
            } else if (
                this.smoothedFPS >
                upper
            ) {
                this.scale += 0.025;
            }

            this.scale =
                THREE.MathUtils.clamp(
                    this.scale,
                    this.minScale,
                    this.maxScale
                );

            this.renderer.setPixelRatio(
                Math.max(
                    0.5,
                    basePixelRatio *
                    this.scale
                )
            );

            return this.scale;
        }

        setScale(value) {
            this.scale =
                THREE.MathUtils.clamp(
                    Number(value) || 1,
                    this.minScale,
                    this.maxScale
                );

            return this.scale;
        }

        reset() {
            this.scale =
                this.maxScale;

            this.smoothedFPS =
                this.targetFPS;
        }
    }

    global.SMResolutionScaler =
        SMResolutionScaler;
})(window);
