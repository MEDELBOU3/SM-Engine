// SM Engine - browser/Electron renderer bridge for the C++ WaterWorld WASM.
//
// This is deliberately an optional backend. NativeWaterBridge.js keeps the
// Node addon as the first choice and the existing JS water system as the
// final fallback. This file only makes the shared C++ core available when a
// compiler for .node addons is not installed on the target machine.

(function (global) {
    'use strict';

    // Keep indices 0..18 ABI-compatible with the first native bridge. The
    // spectrum controls append to the payload so older callers remain safe.
    const CONFIG_LENGTH = 27;
    const OUTPUT_LENGTH = 9;
    const BODY_ID_BYTES = 256;
    const VERSION = 'sm-native-water-wasm-v1';

    const state = {
        module: null,
        functions: null,
        initPromise: null,
        ready: false,
        failed: false,
        configPtr: 0,
        pointsPtr: 0,
        pointsBytes: 0,
        outputPtr: 0,
        bodyIdPtr: 0
    };

    function finite(value, fallback = 0) {
        const number = Number(value);
        return Number.isFinite(number) ? number : fallback;
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, finite(value, min)));
    }

    function normalizeDirection(value, fallback = { x: 1, y: 0 }) {
        let x = finite(value?.x, fallback.x);
        let y = finite(value?.y, fallback.y);
        const length = Math.hypot(x, y);
        if (length < 1e-8) {
            x = fallback.x;
            y = fallback.y;
        } else {
            x /= length;
            y /= length;
        }
        return { x, y };
    }

    function typeCode(type) {
        const normalized = String(type || 'river').toLowerCase();
        if (normalized === 'lake') return 1;
        if (normalized === 'ocean') return 2;
        if (normalized === 'pool') return 3;
        return 0;
    }

    function moduleFactory() {
        return global.SMWaterCoreWASM;
    }

    function loadScript(url) {
        if (typeof document === 'undefined') {
            return Promise.reject(new Error('Water WASM requires a document.'));
        }

        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.async = true;
            script.src = url;
            script.onload = resolve;
            script.onerror = () => reject(
                new Error(`Unable to load native water WASM script: ${url}`)
            );
            (document.head || document.documentElement).appendChild(script);
        });
    }

    function bindFunctions(module) {
        return {
            reset: module.cwrap('water_reset', null, []),
            setTime: module.cwrap('water_set_time', null, ['number']),
            step: module.cwrap(
                'water_step',
                null,
                ['number', 'number']
            ),
            upsertBody: module.cwrap(
                'water_upsert_body',
                'number',
                ['string', 'number', 'number', 'number']
            ),
            removeBody: module.cwrap(
                'water_remove_body',
                'number',
                ['string']
            ),
            sample: module.cwrap(
                'water_sample',
                'number',
                ['number', 'number', 'number', 'number', 'number']
            ),
            sampleBody: module.cwrap(
                'water_sample_body',
                'number',
                ['string', 'number', 'number', 'number', 'number']
            ),
            addRipple: module.cwrap(
                'water_add_ripple',
                'number',
                [
                    'string',
                    'number',
                    'number',
                    'number',
                    'number',
                    'number',
                    'number',
                    'number',
                    'number'
                ]
            ),
            bodyCount: module.cwrap(
                'water_get_body_count',
                'number',
                []
            ),
            time: module.cwrap('water_get_time', 'number', [])
        };
    }

    function allocateBuffers(module) {
        state.configPtr = module._malloc(CONFIG_LENGTH * 8);
        state.outputPtr = module._malloc(OUTPUT_LENGTH * 8);
        state.bodyIdPtr = module._malloc(BODY_ID_BYTES);

        if (!state.configPtr || !state.outputPtr || !state.bodyIdPtr) {
            throw new Error('Unable to allocate native water WASM buffers.');
        }

        module.HEAPU8.fill(
            0,
            state.bodyIdPtr,
            state.bodyIdPtr + BODY_ID_BYTES
        );
    }

    function ensurePoints(module, count) {
        const bytes = Math.max(0, count * 3 * 8);
        if (bytes <= state.pointsBytes && state.pointsPtr) {
            return state.pointsPtr;
        }

        if (state.pointsPtr) module._free(state.pointsPtr);
        state.pointsPtr = bytes > 0 ? module._malloc(bytes) : 0;
        state.pointsBytes = bytes;

        if (bytes > 0 && !state.pointsPtr) {
            throw new Error('Unable to allocate native water point buffer.');
        }

        return state.pointsPtr;
    }

    function writeBody(body) {
        const module = state.module;
        const functions = state.functions;
        if (!module || !functions || !body?.id) return false;

        // NativeWaterBridge sends a flattened payload, while direct callers
        // may still provide { config: {...} }. Accept both shapes.
        const config = {
            ...(body.config || {}),
            ...body
        };
        const flowDirection = config.flowDirection || body.flowDirection || {};
        const points = Array.isArray(body.points) ? body.points : [];
        const pointValues = new Float64Array(points.length * 3);
        for (let index = 0; index < points.length; index += 1) {
            const point = points[index] || {};
            pointValues[index * 3] = finite(point.x);
            pointValues[index * 3 + 1] = finite(point.y);
            pointValues[index * 3 + 2] = finite(point.z);
        }

        const configValues = new Float64Array(CONFIG_LENGTH);
        configValues[0] = typeCode(body.type || config.type);
        configValues[1] = finite(config.width, 4);
        configValues[2] = finite(config.levelOffset, 0.08);
        configValues[3] = finite(config.oceanSize, 800);
        configValues[4] = finite(
            config.volumeDepth,
            finite(config.bedDepth, 4)
        );
        configValues[5] = finite(config.bedDepth, 3);
        configValues[6] = finite(config.waveHeight, 0.22);
        configValues[7] = Math.max(0.2, finite(config.waveLength, 9));
        configValues[8] = Math.max(0, finite(config.waveSpeed, 1.05));
        configValues[9] = finite(config.choppiness, 0.48);
        configValues[10] = clamp(config.animationSpeed ?? 1.25, 0.05, 8);
        configValues[11] = Math.max(0, finite(config.flowSpeed, 0.72));
        configValues[12] = finite(flowDirection.x, 1);
        configValues[13] = finite(flowDirection.y, 0);
        configValues[14] = clamp(config.flowCoherence ?? 0.86, 0, 1);
        configValues[15] = config.flowReverse ? 1 : 0;
        configValues[16] = Math.max(0, finite(config.currentStrength, 1.5));
        configValues[17] = clamp(config.currentBankDrag ?? 0.55, 0, 0.95);
        configValues[18] = Math.max(
            0,
            finite(
                config.nativeRippleHeightScale,
                finite(config.rippleHeightScale, 1)
            )
        );
        configValues[19] = Math.max(0.08, finite(config.waveScale, 1));
        configValues[20] = clamp(config.waveSteepness ?? 0.42, 0, 1.5);
        configValues[21] = clamp(
            config.waveChoppiness ?? config.choppiness ?? 0.48,
            0,
            1.5
        );
        configValues[22] = clamp(config.waveSpread ?? 0.72, 0, 2);
        configValues[23] = Math.max(0, finite(config.windSpeed, 1));
        const windDirection = normalizeDirection(
            config.windDirection || flowDirection
        );
        configValues[24] = windDirection.x;
        configValues[25] = windDirection.y;
        configValues[26] = Math.max(
            0,
            finite(
                config.smallWaveStrength,
                finite(config.microWaveStrength, 0.34)
            )
        );

        const pointsPtr = ensurePoints(module, points.length);
        module.HEAPF64.set(configValues, state.configPtr >> 3);
        if (pointValues.length > 0) {
            module.HEAPF64.set(pointValues, pointsPtr >> 3);
        }

        return functions.upsertBody(
            String(body.id),
            state.configPtr,
            pointsPtr,
            points.length
        ) !== 0;
    }

    function readBodyId(module) {
        const bytes = module.HEAPU8;
        const chars = [];
        for (let index = 0; index < BODY_ID_BYTES; index += 1) {
            const value = bytes[state.bodyIdPtr + index];
            if (!value) break;
            chars.push(String.fromCharCode(value));
        }
        return chars.join('');
    }

    function readSample(found, requestedBodyId = '') {
        const module = state.module;
        const values = module.HEAPF64.subarray(
            state.outputPtr >> 3,
            (state.outputPtr >> 3) + OUTPUT_LENGTH
        );

        return {
            found: !!found,
            bodyId: readBodyId(module) || String(requestedBodyId || ''),
            surfaceY: finite(values[0]),
            normal: {
                x: finite(values[1]),
                y: finite(values[2], 1),
                z: finite(values[3])
            },
            current: {
                x: finite(values[4]),
                y: finite(values[5]),
                z: finite(values[6])
            },
            surfaceVelocityY: finite(values[7]),
            waterDepth: finite(values[8])
        };
    }

    function sample(x, z) {
        if (!state.ready) return null;
        state.module.HEAPU8.fill(
            0,
            state.bodyIdPtr,
            state.bodyIdPtr + BODY_ID_BYTES
        );
        const found = state.functions.sample(
            finite(x),
            finite(z),
            state.outputPtr,
            state.bodyIdPtr,
            BODY_ID_BYTES
        );
        return readSample(found);
    }

    function sampleBody(id, x, z) {
        if (!state.ready || !id) return null;
        state.module.HEAPU8.fill(
            0,
            state.bodyIdPtr,
            state.bodyIdPtr + BODY_ID_BYTES
        );
        const key = String(id);
        const found = state.functions.sampleBody(
            key,
            finite(x),
            finite(z),
            state.outputPtr,
            state.bodyIdPtr,
            BODY_ID_BYTES
        );
        return readSample(found, key);
    }

    function addRipple(id, options = {}) {
        if (!state.ready || !id) return false;
        return state.functions.addRipple(
            String(id),
            finite(options.x),
            finite(options.z),
            finite(options.radius, 7),
            finite(options.strength, 0.14),
            finite(options.speed, 2.6),
            finite(options.frequency, 11),
            finite(options.decay, 1.4),
            finite(options.time, state.functions.time())
        ) !== 0;
    }

    function dispose() {
        if (!state.module) return;
        if (state.pointsPtr) state.module._free(state.pointsPtr);
        if (state.configPtr) state.module._free(state.configPtr);
        if (state.outputPtr) state.module._free(state.outputPtr);
        if (state.bodyIdPtr) state.module._free(state.bodyIdPtr);
        state.pointsPtr = 0;
        state.pointsBytes = 0;
        state.configPtr = 0;
        state.outputPtr = 0;
        state.bodyIdPtr = 0;
        state.ready = false;
    }

    const api = {
        VERSION,
        init,
        reset() {
            if (!state.ready) return false;
            state.functions.reset();
            return true;
        },
        setTime(seconds) {
            if (!state.ready) return false;
            state.functions.setTime(finite(seconds));
            return true;
        },
        step(delta, absoluteTime) {
            if (!state.ready) return false;
            state.functions.step(
                finite(delta),
                finite(absoluteTime, NaN)
            );
            return true;
        },
        upsertBody: writeBody,
        removeBody(id) {
            if (!state.ready || !id) return false;
            return state.functions.removeBody(String(id)) !== 0;
        },
        sample,
        sampleBody,
        addRipple,
        stats() {
            if (!state.ready) {
                return {
                    bodyCount: 0,
                    time: 0,
                    version: VERSION,
                    ready: false
                };
            }
            return {
                bodyCount: state.functions.bodyCount(),
                time: state.functions.time(),
                version: VERSION,
                ready: true
            };
        },
        dispose
    };

    async function init() {
        if (state.ready) return api;
        if (state.initPromise) return state.initPromise;
        if (state.failed) return null;

        state.initPromise = (async () => {
            const base = document.baseURI || global.location?.href || '';
            const scriptUrl = new URL(
                'engine/native/water/sm_water_core.js',
                base
            ).href;
            const wasmUrl = new URL(
                'engine/native/water/sm_water_core.wasm',
                base
            ).href;

            if (typeof moduleFactory() !== 'function') {
                await loadScript(scriptUrl);
            }

            const factory = moduleFactory();
            if (typeof factory !== 'function') {
                throw new Error('SMWaterCoreWASM factory is unavailable.');
            }

            const module = await factory({
                locateFile(file) {
                    return file.endsWith('.wasm') ? wasmUrl : file;
                }
            });

            state.module = module;
            state.functions = bindFunctions(module);
            allocateBuffers(module);
            state.ready = true;
            global.smNativeWaterWasmAPI = api;

            try {
                global.dispatchEvent(
                    new CustomEvent('sm:native-water-ready', {
                        detail: { source: 'wasm', version: VERSION }
                    })
                );
            } catch (_) {}

            console.info(`[SM Native Water] ${VERSION} ready.`);
            return api;
        })().catch(error => {
            state.failed = true;
            console.warn(
                '[SM Native Water] WASM backend unavailable; keeping JS fallback.',
                error?.message || error
            );
            return null;
        });

        return state.initPromise;
    }

    global.SMNativeWaterWasmBridge = api;
    init();
})(window);
