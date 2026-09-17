/*
 * SM Engine FX - ParticlePresets
 */
(function (global) {
    'use strict';

    global.SMParticlePresets = Object.freeze({
        default: Object.freeze({
            count: 5000,
            size: 0.3,
            opacity: 0.8,
            speed: 1.0,
            color: '#ffcc88',
            blending: 'AdditiveBlending',
            lifetime: 3.0,
            spread: 2.5,
            gravity: 0.0,
            direction: [0, 1, 0]
        }),

        sparks: Object.freeze({
            count: 2200,
            size: 0.08,
            opacity: 1.0,
            speed: 5.0,
            color: '#ffcc33',
            blending: 'AdditiveBlending',
            lifetime: 1.1,
            spread: 3.0,
            gravity: -9.81,
            direction: [0, 1, 0]
        }),

        magic: Object.freeze({
            count: 7000,
            size: 0.18,
            opacity: 0.78,
            speed: 0.7,
            color: '#9f7cff',
            blending: 'AdditiveBlending',
            lifetime: 4.5,
            spread: 1.8,
            gravity: 0.0,
            direction: [0, 1, 0]
        }),

        dust: Object.freeze({
            count: 3500,
            size: 0.5,
            opacity: 0.35,
            speed: 0.5,
            color: '#b7a28b',
            blending: 'NormalBlending',
            lifetime: 5.0,
            spread: 3.0,
            gravity: -0.4,
            direction: [0, 1, 0]
        })
    });
})(window);
