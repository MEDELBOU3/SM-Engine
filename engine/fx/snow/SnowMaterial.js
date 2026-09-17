/*
 * SM Engine FX - SnowMaterial
 * GPU point-sprite material for snow flakes.
 */
(function (global) {
    'use strict';

    class SnowMaterial {
        static create(options = {}) {
            if (!global.THREE) throw new Error('[SMFX] THREE is required.');

            const texture = options.texture || SnowMaterial.createProceduralTexture();

            return new THREE.PointsMaterial({
                color: new THREE.Color(options.color ?? 0xeaf7ff),
                size: Number(options.size) || 0.1,
                map: texture,
                transparent: true,
                opacity: options.opacity ?? 0.92,
                alphaTest: options.alphaTest ?? 0.06,
                depthWrite: false,
                depthTest: true,
                blending: THREE.NormalBlending,
                sizeAttenuation: true,
                vertexColors: false
            });
        }

        static createProceduralTexture(size = 64) {
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = size;

            const ctx = canvas.getContext('2d');
            const c = size * 0.5;
            const gradient = ctx.createRadialGradient(c, c, 0, c, c, c);

            gradient.addColorStop(0.0, 'rgba(255,255,255,1)');
            gradient.addColorStop(0.35, 'rgba(240,250,255,.95)');
            gradient.addColorStop(0.72, 'rgba(210,235,255,.35)');
            gradient.addColorStop(1.0, 'rgba(210,235,255,0)');

            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, size, size);

            const texture = new THREE.CanvasTexture(canvas);
            texture.name = 'SM_Snowflake_Procedural';
            texture.needsUpdate = true;
            return texture;
        }
    }

    global.SMSnowMaterial = SnowMaterial;
})(window);
