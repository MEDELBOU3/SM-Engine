/*
 * SM Engine FX - ExplosionPresets
 */
(function (global) {
    'use strict';

    global.SMExplosionPresets = Object.freeze({
        default: Object.freeze({
            maxParticles: 5000,
            force: 10,
            duration: 3.0,
            fireIntensity: 0.8,
            fireSize: 5.0,
            smokeDensity: 0.6,
            smokeSpeed: 2.0,
            shockwave: true,
            debris: true,
            sparks: true,
            color: 0xff6b35
        }),

        fireball: Object.freeze({
            maxParticles: 9000,
            force: 16,
            duration: 4.0,
            fireIntensity: 1.35,
            fireSize: 7.5,
            smokeDensity: 0.75,
            smokeSpeed: 2.5,
            shockwave: true,
            debris: true,
            sparks: true,
            color: 0xff5a24
        }),

        nuclear: Object.freeze({
            maxParticles: 22000,
            force: 45,
            duration: 8.0,
            fireIntensity: 1.9,
            fireSize: 18.0,
            smokeDensity: 1.8,
            smokeSpeed: 4.5,
            shockwave: true,
            debris: true,
            sparks: true,
            color: 0xffd36b
        }),

        dust: Object.freeze({
            maxParticles: 12000,
            force: 14,
            duration: 5.5,
            fireIntensity: 0.15,
            fireSize: 3.0,
            smokeDensity: 1.6,
            smokeSpeed: 1.8,
            shockwave: false,
            debris: true,
            sparks: false,
            color: 0xb89a78
        })
    });
})(window);
