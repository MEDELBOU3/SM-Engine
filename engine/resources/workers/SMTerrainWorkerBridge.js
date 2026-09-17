// engine/resources/workers/SMTerrainWorkerBridge.js
// Main-thread bridge for SMTerrainWorker.js.
// Load AFTER SMWorkerPoolManager.js and SMResourceManager.js.

(() => {
    'use strict';

    if (window.SMTerrainWorkerBridge) return;

    const WORKER_TYPE = 'terrain';
    const DEFAULT_WORKER_PATH = 'engine/resources/workers/SMTerrainWorker.js';

    const state = {
        initialized: false,
        registered: false,
        workerPath: DEFAULT_WORKER_PATH,
        lastJob: null,
        lastError: null,
        jobsCompleted: 0,
        totalWorkerTimeMs: 0
    };

    function resolveWorkerURL(path = state.workerPath) {
        try {
            return new URL(path, document.baseURI).href;
        } catch (_) {
            return path;
        }
    }

    function getWorkerPool() {
        return window.SMWorkerPoolManager || window.smWorkerPoolManager || null;
    }

    function getResourceManager() {
        return window.SMResourceManager || window.smResourceManager || null;
    }

    function createTerrainWorker() {
        const url = resolveWorkerURL();
        return new Worker(url);
    }

    function register() {
        if (state.registered) return true;

        const pool = getWorkerPool();
        if (!pool?.registerWorkerFactory) {
            console.warn(
                '[SMTerrainWorkerBridge] SMWorkerPoolManager is not ready yet.'
            );
            return false;
        }

        pool.registerWorkerFactory(
            WORKER_TYPE,
            () => createTerrainWorker()
        );

        state.registered = true;

        window.dispatchEvent(
            new CustomEvent('sm:terrain-worker-ready', {
                detail: {
                    type: WORKER_TYPE,
                    workerPath: state.workerPath
                }
            })
        );

        console.log('[SMTerrainWorkerBridge] Registered terrain worker:', state.workerPath);
        return true;
    }

    async function run(payload, options = {}) {
        if (!state.registered && !register()) {
            throw new Error(
                '[SMTerrainWorkerBridge] Terrain worker could not be registered.'
            );
        }

        const resourceManager = getResourceManager();
        const pool = getWorkerPool();
        const timeoutMs = Math.max(0, Number(options.timeoutMs ?? 30000) || 0);
        const started = performance.now();

        try {
            let result;

            if (resourceManager?.runWorker) {
                result = await resourceManager.runWorker(
                    WORKER_TYPE,
                    payload,
                    { ...options, timeoutMs }
                );
            } else if (pool?.run) {
                result = await pool.run(
                    WORKER_TYPE,
                    payload,
                    { ...options, timeoutMs }
                );
            } else {
                throw new Error('No SM worker execution backend is available.');
            }

            const elapsed = performance.now() - started;
            state.jobsCompleted++;
            state.totalWorkerTimeMs += elapsed;
            state.lastError = null;
            state.lastJob = {
                type: WORKER_TYPE,
                elapsedMs: elapsed,
                finishedAt: Date.now()
            };

            return result;
        } catch (error) {
            state.lastError = error?.message || String(error);
            throw error;
        }
    }

    function normalizeHeightmapRequest(options = {}) {
        const resolution = Math.max(1, Math.round(Number(options.resolution || 0)));

        return {
            resolutionX: Math.max(
                1,
                Math.round(
                    Number(options.resolutionX) ||
                    (resolution ? resolution + 1 : 97)
                )
            ),
            resolutionZ: Math.max(
                1,
                Math.round(
                    Number(options.resolutionZ) ||
                    (resolution ? resolution + 1 : 97)
                )
            ),
            width: Math.max(0.000001, Number(options.width) || 100),
            length: Math.max(
                0.000001,
                Number(options.length) || Number(options.depth) || 100
            ),
            initialMode: String(options.initialMode || 'noise').toLowerCase(),
            noiseAmplitude: Number(options.noiseAmplitude ?? 8) || 0,
            noiseFrequency: Math.max(
                0.00000001,
                Number(options.noiseFrequency ?? 0.025) || 0.025
            ),
            noiseOctaves: Math.max(
                1,
                Math.min(12, Math.round(Number(options.noiseOctaves ?? 4) || 4))
            ),
            noisePersistence: Math.max(
                0,
                Math.min(1, Number(options.noisePersistence ?? 0.5))
            ),
            noiseLacunarity: Math.max(
                1.01,
                Number(options.noiseLacunarity ?? 2) || 2
            ),
            seed: (Number(options.seed ?? 1337) || 1337) | 0
        };
    }

    async function generateHeightmap(options = {}) {
        const request = normalizeHeightmapRequest(options);
        const result = await run(request, {
            timeoutMs: options.timeoutMs ?? 30000
        });

        if (!(result?.heightsBuffer instanceof ArrayBuffer)) {
            throw new Error(
                '[SMTerrainWorkerBridge] Worker returned an invalid height buffer.'
            );
        }

        const heights = new Float32Array(result.heightsBuffer);
        const expectedCount = result.resolutionX * result.resolutionZ;

        if (heights.length !== expectedCount) {
            throw new Error(
                `[SMTerrainWorkerBridge] Height count mismatch. Expected ${expectedCount}, received ${heights.length}.`
            );
        }

        return {
            heights,
            resolutionX: result.resolutionX,
            resolutionZ: result.resolutionZ,
            count: result.count,
            minHeight: result.minHeight,
            maxHeight: result.maxHeight,
            workerDurationMs: Number(result.durationMs || 0),
            settings: result.settings || request
        };
    }

    async function test() {
        const start = performance.now();

        const result = await generateHeightmap({
            width: 100,
            length: 100,
            resolutionX: 65,
            resolutionZ: 65,
            initialMode: 'noise',
            noiseAmplitude: 10,
            noiseFrequency: 0.025,
            noiseOctaves: 4,
            noisePersistence: 0.5,
            seed: 1337
        });

        const report = {
            ok: true,
            vertices: result.heights.length,
            minHeight: result.minHeight,
            maxHeight: result.maxHeight,
            workerDurationMs: result.workerDurationMs,
            totalDurationMs: performance.now() - start
        };

        console.log('[SMTerrainWorkerBridge] Test passed:', report);
        return report;
    }

    function configure(options = {}) {
        if (options.workerPath && options.workerPath !== state.workerPath) {
            state.workerPath = String(options.workerPath);

            // Re-registration is intentionally not automatic because the pool owns
            // already-created workers. Configure the path before init/register.
            if (state.registered) {
                console.warn(
                    '[SMTerrainWorkerBridge] workerPath changed after registration. Rebuild the terrain worker pool to apply it.'
                );
            }
        }

        return getState();
    }

    function getState() {
        return {
            ...state,
            averageJobTimeMs:
                state.jobsCompleted > 0
                    ? state.totalWorkerTimeMs / state.jobsCompleted
                    : 0,
            workerURL: resolveWorkerURL()
        };
    }

    function init() {
        if (state.initialized) return api;
        state.initialized = true;

        if (!register()) {
            const retry = () => {
                if (state.registered) return;
                if (register()) {
                    window.removeEventListener('sm:resource-manager-ready', retry);
                    window.removeEventListener('sm:system-worker-config', retry);
                }
            };

            window.addEventListener('sm:resource-manager-ready', retry);
            window.addEventListener('sm:system-worker-config', retry);
        }

        return api;
    }

    const api = {
        state,
        init,
        register,
        run,
        generateHeightmap,
        normalizeHeightmapRequest,
        configure,
        getState,
        test
    };

    window.SMTerrainWorkerBridge = api;
    window.smTerrainWorkerBridge = api;

    init();
})();