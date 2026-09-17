// engine/architecture/geometry/SMArchitecturalUV.js
(function (global) {
    'use strict';

    class SMArchitecturalUV {
        static scaleUV(geometry, uScale = 1, vScale = 1) {
            const uv = geometry?.attributes?.uv;
            if (!uv) return geometry;
            for (let i = 0; i < uv.count; i++) {
                uv.setXY(i, uv.getX(i) * uScale, uv.getY(i) * vScale);
            }
            uv.needsUpdate = true;
            return geometry;
        }

        static repeatByWorldSize(geometry, width, height, tileMeters = 1) {
            const tile = Math.max(0.001, Number(tileMeters || 1));
            return this.scaleUV(
                geometry,
                Math.max(0.001, width) / tile,
                Math.max(0.001, height) / tile
            );
        }
    }

    global.SMArchitecturalUV = SMArchitecturalUV;
})(typeof window !== 'undefined' ? window : globalThis);
