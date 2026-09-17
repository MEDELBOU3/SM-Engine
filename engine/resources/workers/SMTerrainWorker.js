// engine/resources/workers/SMTerrainWorker.js
// Classic Web Worker used by SMWorkerPoolManager.
// IMPORTANT: do NOT load this file with <script src>. It is created with new Worker(...).

(() => {
    'use strict';

    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

    function hash2D(x, y, seed) {
        let h = Math.imul((x | 0) ^ (seed | 0), 374761393);
        h = Math.imul(h ^ (y | 0), 668265263);
        h = (h ^ (h >>> 13)) | 0;
        h = Math.imul(h, 1274126177);
        h ^= h >>> 16;
        return (h >>> 0) / 4294967295;
    }

    function smoothstep(t) {
        return t * t * (3 - 2 * t);
    }

    function valueNoise2D(x, y, seed) {
        const x0 = Math.floor(x);
        const y0 = Math.floor(y);
        const x1 = x0 + 1;
        const y1 = y0 + 1;

        const tx = smoothstep(x - x0);
        const ty = smoothstep(y - y0);

        const n00 = hash2D(x0, y0, seed) * 2 - 1;
        const n10 = hash2D(x1, y0, seed) * 2 - 1;
        const n01 = hash2D(x0, y1, seed) * 2 - 1;
        const n11 = hash2D(x1, y1, seed) * 2 - 1;

        const a = n00 + (n10 - n00) * tx;
        const b = n01 + (n11 - n01) * tx;
        return a + (b - a) * ty;
    }

    function fractalNoise2D(x, z, settings) {
        let total = 0;
        let amplitude = 1;
        let frequency = settings.noiseFrequency;
        let maxAmplitude = 0;

        for (let octave = 0; octave < settings.noiseOctaves; octave++) {
            const octaveSeed = (settings.seed + octave * 1013) | 0;
            total += valueNoise2D(x * frequency, z * frequency, octaveSeed) * amplitude;
            maxAmplitude += amplitude;
            amplitude *= settings.noisePersistence;
            frequency *= settings.noiseLacunarity;
        }

        if (maxAmplitude <= 0) return 0;
        return (total / maxAmplitude) * settings.noiseAmplitude;
    }

    function normalizeSettings(payload = {}) {
        const resolution = Math.max(1, Math.round(Number(payload.resolution || 0)));

        // TerrainData can pass its exact vertex dimensions. If they are not supplied,
        // resolution is treated as plane segments, therefore vertices = resolution + 1.
        const resolutionX = Math.max(
            1,
            Math.round(
                Number(payload.resolutionX) ||
                (resolution ? resolution + 1 : 97)
            )
        );

        const resolutionZ = Math.max(
            1,
            Math.round(
                Number(payload.resolutionZ) ||
                (resolution ? resolution + 1 : resolutionX)
            )
        );

        return {
            resolutionX,
            resolutionZ,
            width: Math.max(0.000001, Number(payload.width) || 100),
            length: Math.max(0.000001, Number(payload.length) || Number(payload.depth) || 100),
            initialMode: String(payload.initialMode || 'noise').toLowerCase(),
            noiseAmplitude: Number(payload.noiseAmplitude ?? 8) || 0,
            noiseFrequency: Math.max(0.00000001, Number(payload.noiseFrequency ?? 0.025) || 0.025),
            noiseOctaves: clamp(Math.round(Number(payload.noiseOctaves ?? 4) || 4), 1, 12),
            noisePersistence: clamp(Number(payload.noisePersistence ?? 0.5), 0, 1),
            noiseLacunarity: Math.max(1.01, Number(payload.noiseLacunarity ?? 2) || 2),
            seed: (Number(payload.seed ?? 1337) || 1337) | 0
        };
    }

    function generateHeightmap(payload = {}) {
        const settings = normalizeSettings(payload);
        const start = performance.now();
        const count = settings.resolutionX * settings.resolutionZ;
        const heights = new Float32Array(count);

        if (settings.initialMode !== 'noise' || settings.noiseAmplitude === 0) {
            return {
                result: {
                    heightsBuffer: heights.buffer,
                    resolutionX: settings.resolutionX,
                    resolutionZ: settings.resolutionZ,
                    count,
                    minHeight: 0,
                    maxHeight: 0,
                    durationMs: performance.now() - start,
                    settings
                },
                transfer: [heights.buffer]
            };
        }

        const halfWidth = settings.width * 0.5;
        const halfLength = settings.length * 0.5;
        const denomX = Math.max(1, settings.resolutionX - 1);
        const denomZ = Math.max(1, settings.resolutionZ - 1);

        let minHeight = Infinity;
        let maxHeight = -Infinity;
        let index = 0;

        for (let gz = 0; gz < settings.resolutionZ; gz++) {
            const z = -halfLength + (gz / denomZ) * settings.length;

            for (let gx = 0; gx < settings.resolutionX; gx++) {
                const x = -halfWidth + (gx / denomX) * settings.width;
                const height = fractalNoise2D(x, z, settings);

                heights[index++] = height;
                if (height < minHeight) minHeight = height;
                if (height > maxHeight) maxHeight = height;
            }
        }

        if (!Number.isFinite(minHeight)) minHeight = 0;
        if (!Number.isFinite(maxHeight)) maxHeight = 0;

        return {
            result: {
                heightsBuffer: heights.buffer,
                resolutionX: settings.resolutionX,
                resolutionZ: settings.resolutionZ,
                count,
                minHeight,
                maxHeight,
                durationMs: performance.now() - start,
                settings
            },
            transfer: [heights.buffer]
        };
    }

    function handleJob(type, payload) {
        switch (type) {
            case 'terrain':
            case 'terrain-heightmap':
            case 'generate-heightmap':
                return generateHeightmap(payload);

            case 'ping':
                return {
                    result: {
                        pong: true,
                        now: Date.now()
                    },
                    transfer: []
                };

            default:
                throw new Error(`[SMTerrainWorker] Unsupported job type: ${type}`);
        }
    }

    self.addEventListener('message', event => {
        const message = event.data;
        if (!message || message.__smWorkerJob !== true) return;

        const id = message.id;
        const type = String(message.type || '');

        try {
            const output = handleJob(type, message.payload || {});

            self.postMessage(
                {
                    __smWorkerResult: true,
                    id,
                    ok: true,
                    result: output.result
                },
                output.transfer || []
            );
        } catch (error) {
            self.postMessage({
                __smWorkerResult: true,
                id,
                ok: false,
                error: error?.stack || error?.message || String(error)
            });
        }
    });
})();