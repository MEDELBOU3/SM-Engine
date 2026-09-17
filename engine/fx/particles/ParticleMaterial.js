/*
 * SM Engine FX - ParticleMaterial
 */
(function (global) {
    'use strict';

    class ParticleMaterial {
        static resolveBlending(name) {
            const map = {
                AdditiveBlending: THREE.AdditiveBlending,
                NormalBlending: THREE.NormalBlending,
                SubtractiveBlending: THREE.SubtractiveBlending,
                MultiplyBlending: THREE.MultiplyBlending
            };

            return map[name] ?? THREE.AdditiveBlending;
        }

        static create(options = {}) {
            return new THREE.PointsMaterial({
                color: new THREE.Color(options.color ?? '#ffcc88'),
                size: Number(options.size) || 0.3,
                transparent: true,
                opacity: options.opacity ?? 0.8,
                depthWrite: false,
                depthTest: true,
                sizeAttenuation: true,
                blending: this.resolveBlending(options.blending),
                map: options.texture || this.createProceduralTexture(),
                alphaTest: 0.015
            });
        }

        static createProceduralTexture(size = 64) {
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = size;

            const ctx = canvas.getContext('2d');
            const c = size * 0.5;
            const gradient = ctx.createRadialGradient(c, c, 0, c, c, c);

            gradient.addColorStop(0, 'rgba(255,255,255,1)');
            gradient.addColorStop(0.45, 'rgba(255,255,255,.85)');
            gradient.addColorStop(1, 'rgba(255,255,255,0)');

            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, size, size);

            return new THREE.CanvasTexture(canvas);
        }
    }

    global.SMParticleMaterial = ParticleMaterial;
})(window);
