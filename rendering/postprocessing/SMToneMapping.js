(function (global) {
    'use strict';

    class SMToneMapping {
        constructor(renderer = global.renderer) {
            this.renderer =
                renderer || null;

            this.mode = 'aces';
            this.exposure = 1.0;
        }

        setMode(mode) {
            this.mode =
                String(mode || 'aces')
                    .toLowerCase();

            if (!this.renderer) {
                return this;
            }

            const map = {
                none:
                    THREE.NoToneMapping,

                linear:
                    THREE.LinearToneMapping,

                reinhard:
                    THREE.ReinhardToneMapping,

                cineon:
                    THREE.CineonToneMapping,

                aces:
                    THREE.ACESFilmicToneMapping,

                agx:
                    THREE.AgXToneMapping
            };

            const resolved =
                map[this.mode];

            if (resolved !== undefined) {
                this.renderer.toneMapping =
                    resolved;
            }

            return this;
        }

        setExposure(value) {
            this.exposure =
                Math.max(
                    0,
                    Number(value) || 0
                );

            if (this.renderer) {
                this.renderer.toneMappingExposure =
                    this.exposure;
            }

            return this;
        }

        apply(options = {}) {
            if ('mode' in options) {
                this.setMode(
                    options.mode
                );
            }

            if ('exposure' in options) {
                this.setExposure(
                    options.exposure
                );
            }

            return this;
        }
    }

    global.SMToneMapping =
        SMToneMapping;
})(window);
