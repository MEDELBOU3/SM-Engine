/*
 * SM Engine FX - SnowPresets
 */
(function (global) {
    'use strict';

    const presets = Object.freeze({
        gentle: Object.freeze({
            mode: 'normal',
            density: 700,
            size: 0.085,
            speed: 0.55,
            wind: 0.25,
            turbulence: 0.18,
            area: 26,
            height: 18
        }),

        storm: Object.freeze({
            mode: 'normal',
            density: 3200,
            size: 0.105,
            speed: 2.3,
            wind: 2.0,
            turbulence: 1.1,
            area: 34,
            height: 24
        }),

        blizzard: Object.freeze({
            mode: 'vortex',
            density: 5000,
            size: 0.09,
            speed: 4.0,
            wind: 4.2,
            turbulence: 1.8,
            area: 42,
            height: 26
        }),

        default: Object.freeze({
            mode: 'normal',
            density: 1000,
            size: 0.1,
            speed: 1.0,
            wind: 0,
            turbulence: 0.5,
            area: 30,
            height: 20
        })
    });

    global.SMSnowPresets = presets;
})(window);
