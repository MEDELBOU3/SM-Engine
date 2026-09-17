(function (global) {
    'use strict';

    class SMRenderStats {
        constructor(options = {}) {
            this.renderer = options.renderer || global.renderer || null;

            this.frame = 0;
            this.lastUpdate = performance.now();
            this.fps = 0;
            this.frameTimeMs = 0;

            this.history = [];
            this.maxHistory = options.maxHistory ?? 120;
        }

        update(delta) {
            this.frame++;

            if (Number.isFinite(delta) && delta > 0) {
                this.frameTimeMs = delta * 1000;
                this.fps = 1 / delta;
            }

            const renderer = this.renderer || global.renderer;
            const info = renderer?.info;

            const sample = {
                frame: this.frame,
                fps: this.fps,
                frameTimeMs: this.frameTimeMs,

                calls: info?.render?.calls || 0,
                triangles: info?.render?.triangles || 0,
                points: info?.render?.points || 0,
                lines: info?.render?.lines || 0,

                geometries: info?.memory?.geometries || 0,
                textures: info?.memory?.textures || 0,

                programs: info?.programs?.length || 0
            };

            this.history.push(sample);

            if (this.history.length > this.maxHistory) {
                this.history.shift();
            }

            return sample;
        }

        snapshot() {
            const renderer = this.renderer || global.renderer;
            const info = renderer?.info;

            return {
                fps: this.fps,
                frameTimeMs: this.frameTimeMs,

                render: {
                    calls: info?.render?.calls || 0,
                    triangles: info?.render?.triangles || 0,
                    points: info?.render?.points || 0,
                    lines: info?.render?.lines || 0
                },

                memory: {
                    geometries: info?.memory?.geometries || 0,
                    textures: info?.memory?.textures || 0
                },

                programs: info?.programs?.length || 0
            };
        }

        diagnostics() {
            const report = this.snapshot();
            console.log('[SMRenderStats]', report);
            return report;
        }
    }

    global.SMRenderStats = SMRenderStats;
})(window);
