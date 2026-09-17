// Shared water-wave math for the GPU material and deterministic CPU queries.
// Keep this file free of scene/editor concerns: WaterBody and WaterMaterial
// both use it so boats do not sample a different surface than the renderer.

(function (global) {
    'use strict';

    const TAU = Math.PI * 2;
    const WAVE_COUNT = 6;

    // Two broad swells, two wind waves and two short geometric waves. The
    // phase offsets prevent the field from reading as synchronized sine bands.
    const WAVES = [
        { length: 1.85, weight: 0.48, speed: 0.48, steepness: 0.72, angle: 0.00, phase: 0.37, band: 0 },
        { length: 1.18, weight: 0.27, speed: 0.72, steepness: 0.55, angle: 0.24, phase: -1.70, band: 0 },
        { length: 0.72, weight: 0.14, speed: 1.05, steepness: 0.42, angle: -0.31, phase: 2.40, band: 1 },
        { length: 0.42, weight: 0.065, speed: 1.35, steepness: 0.32, angle: 0.58, phase: -0.90, band: 1 },
        { length: 0.23, weight: 0.032, speed: 1.80, steepness: 0.22, angle: -0.88, phase: 1.70, band: 2 },
        { length: 0.12, weight: 0.013, speed: 2.45, steepness: 0.14, angle: 1.25, phase: -2.30, band: 2 }
    ];

    const PROFILES = {
        ocean: { macro: 1.00, meso: 1.00, micro: 1.00, horizontal: 1.00, detail: 1.00 },
        lake: { macro: 0.24, meso: 0.54, micro: 0.82, horizontal: 0.56, detail: 0.82 },
        river: { macro: 0.16, meso: 0.68, micro: 1.00, horizontal: 0.52, detail: 1.05 },
        pool: { macro: 0.06, meso: 0.22, micro: 0.58, horizontal: 0.34, detail: 0.70 }
    };

    function finite(value, fallback = 0) {
        const number = Number(value);
        return Number.isFinite(number) ? number : fallback;
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, finite(value, min)));
    }

    function normalizeType(type) {
        const normalized = String(type || 'river').toLowerCase();
        return PROFILES[normalized] ? normalized : 'river';
    }

    function profile(type) {
        return PROFILES[normalizeType(type)];
    }

    function direction(value, fallback = { x: 1, y: 0 }) {
        let x = finite(value?.x, fallback.x);
        let y = finite(value?.y, fallback.y);
        const length = Math.hypot(x, y);
        if (length < 1e-8) return { ...fallback };
        return { x: x / length, y: y / length };
    }

    function optionsOf(options = {}) {
        options = options || {};
        const type = normalizeType(options.waterType || options.type);
        const flow = direction(options.flowDirection);
        const wind = direction(options.windDirection || flow);
        return {
            type,
            waveHeight: finite(options.waveHeight, 0.22),
            waveScale: Math.max(0.08, finite(options.waveScale, 1)),
            waveSpeed: Math.max(0, finite(options.waveSpeed, 1.05)),
            windSpeed: Math.max(0, finite(options.windSpeed, 1)),
            waveSteepness: clamp(options.waveSteepness ?? 0.42, 0, 1.5),
            waveChoppiness: clamp(
                options.waveChoppiness ?? options.choppiness ?? 0.48,
                0,
                1.5
            ),
            waveSpread: clamp(options.waveSpread ?? 0.72, 0, 2.0),
            flowSpeed: Math.max(0, finite(options.flowSpeed, 0.72)),
            flowCoherence: clamp(options.flowCoherence ?? 0.86, 0, 1),
            wind,
            flow
        };
    }

    function createUniformData(options = {}) {
        const o = optionsOf(options);
        const waveData = [];
        const waveParams = [];

        for (const wave of WAVES) {
            waveData.push(new THREE.Vector4(
                wave.length,
                wave.weight,
                wave.band,
                0
            ));
            waveParams.push(new THREE.Vector4(
                wave.speed,
                wave.steepness,
                wave.phase,
                wave.angle
            ));
        }

        return { waveData, waveParams, waterType: typeCode(o.type) };
    }

    function typeCode(type) {
        const normalized = normalizeType(type);
        if (normalized === 'lake') return 1;
        if (normalized === 'ocean') return 2;
        if (normalized === 'pool') return 3;
        return 0;
    }

    function bandFactor(band, p) {
        if (band <= 0) return p.macro;
        if (band === 1) return p.meso;
        return p.micro;
    }

    function evaluate(options = {}, x = 0, z = 0, time = 0, flowDirection = null) {
        options = options || {};
        const o = optionsOf(options);
        const p = profile(o.type);
        const base = o.type === 'river'
            ? direction(flowDirection || o.flow)
            : o.wind;
        const side = { x: -base.y, y: base.x };
        const spread = o.waveSpread * (
            o.type === 'river'
                ? 0.22 + o.flowCoherence * 0.78
                : 1
        );
        const elapsed = finite(time);
        const animationTime = elapsed * Math.max(0.05, finite(options.animationSpeed, 1.25));
        const heightScale = o.waveHeight;
        const result = { height: 0, displacementX: 0, displacementZ: 0 };

        for (const wave of WAVES) {
            const angle = wave.angle * spread;
            const cosine = Math.cos(angle);
            const sine = Math.sin(angle);
            const dir = {
                x: base.x * cosine + side.x * sine,
                y: base.y * cosine + side.y * sine
            };
            const wavelength = Math.max(0.08, wave.length * o.waveScale * Math.max(0.2, finite(options.waveLength, 9)));
            const k = TAU / wavelength;
            const amplitude = heightScale * wave.weight * bandFactor(wave.band, p);
            const phase =
                (x * dir.x + z * dir.y) * k -
                animationTime * o.waveSpeed * o.windSpeed * wave.speed -
                animationTime * o.flowSpeed * (o.type === 'river' ? 0.12 : 0.025) * wave.speed +
                wave.phase;
            const horizontal =
                amplitude *
                wave.steepness *
                o.waveSteepness *
                o.waveChoppiness *
                p.horizontal *
                0.72 /
                Math.max(k, 0.08);

            result.height += amplitude * Math.sin(phase);
            result.displacementX += dir.x * horizontal * Math.cos(phase);
            result.displacementZ += dir.y * horizontal * Math.cos(phase);
        }

        return result;
    }

    class SMWaterWaveSpectrum {
        static get WAVE_COUNT() { return WAVE_COUNT; }
        static normalizeType = normalizeType;
        static typeCode = typeCode;
        static profiles = PROFILES;
        static descriptors = WAVES;
        static options = optionsOf;
        static createUniformData = createUniformData;
        static evaluate = evaluate;
        static height(options, x, z, time, flowDirection) {
            return evaluate(options, x, z, time, flowDirection).height;
        }
    }

    global.SMWaterWaveSpectrum = SMWaterWaveSpectrum;
})(window);
