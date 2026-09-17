// engine/architecture/geometry/SMOpeningLayout.js
// Builds solid wall rectangles around door/window openings without CSG.
(function (global) {
    'use strict';

    class SMOpeningLayout {
        static normalize(wall) {
            const dx = wall.to[0] - wall.from[0];
            const dz = wall.to[1] - wall.from[1];
            const length = Math.hypot(dx, dz);
            const openings = [...(wall.doors || []), ...(wall.windows || [])];

            return openings
                .map((o) => ({
                    ...o,
                    left: Math.max(0, Number(o.offset || 0) - Number(o.width || 0) * 0.5),
                    right: Math.min(length, Number(o.offset || 0) + Number(o.width || 0) * 0.5),
                    bottom: Math.max(0, Number(o.sillHeight || 0)),
                    top: Math.min(
                        Number(wall.height || 0),
                        Number(o.sillHeight || 0) + Number(o.height || 0)
                    )
                }))
                .filter((o) => o.right - o.left > 0.001 && o.top - o.bottom > 0.001)
                .sort((a, b) => a.left - b.left);
        }

        static buildRectangles(wall) {
            const dx = wall.to[0] - wall.from[0];
            const dz = wall.to[1] - wall.from[1];
            const length = Math.hypot(dx, dz);
            const height = Number(wall.height || 0);
            const openings = this.normalize(wall);

            if (!openings.length) {
                return [{ x0: 0, x1: length, y0: 0, y1: height, role: 'wall' }];
            }

            const xCuts = new Set([0, length]);
            openings.forEach((o) => {
                xCuts.add(Math.max(0, Math.min(length, o.left)));
                xCuts.add(Math.max(0, Math.min(length, o.right)));
            });

            const xs = [...xCuts].sort((a, b) => a - b);
            const rectangles = [];

            for (let i = 0; i < xs.length - 1; i++) {
                const x0 = xs[i];
                const x1 = xs[i + 1];
                if (x1 - x0 < 0.001) continue;

                const mid = (x0 + x1) * 0.5;
                const active = openings.filter((o) => mid > o.left + 1e-6 && mid < o.right - 1e-6);

                if (!active.length) {
                    rectangles.push({ x0, x1, y0: 0, y1: height, role: 'wall' });
                    continue;
                }

                const yCuts = new Set([0, height]);
                active.forEach((o) => {
                    yCuts.add(Math.max(0, Math.min(height, o.bottom)));
                    yCuts.add(Math.max(0, Math.min(height, o.top)));
                });

                const ys = [...yCuts].sort((a, b) => a - b);
                for (let j = 0; j < ys.length - 1; j++) {
                    const y0 = ys[j];
                    const y1 = ys[j + 1];
                    if (y1 - y0 < 0.001) continue;
                    const yMid = (y0 + y1) * 0.5;
                    const insideOpening = active.some((o) => yMid > o.bottom + 1e-6 && yMid < o.top - 1e-6);
                    if (!insideOpening) {
                        rectangles.push({ x0, x1, y0, y1, role: 'wall' });
                    }
                }
            }

            return rectangles;
        }
    }

    global.SMOpeningLayout = SMOpeningLayout;
})(typeof window !== 'undefined' ? window : globalThis);
