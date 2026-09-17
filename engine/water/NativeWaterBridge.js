// ============================================================================
// engine/water/NativeWaterBridge.js
// SM Engine - Native C++ Water Physics Bridge V1
//
// BASELINE:
//   Designed specifically for the latest SM Water "Smooth Geometry + Animation
//   Fix" package. It does NOT replace WaterMaterial.js, WaterBody.js,
//   WaterSystem.js, riverbank foam or the underwater renderer.
//
// LOAD:
//   Load this AFTER WaterSystem.js and BEFORE initWaterSystem() is called.
// ============================================================================

(function (global) {
    'use strict';

    const VERSION = 'sm-native-water-bridge-v1';
    const WRAPPED_ADD_RIPPLE = new WeakSet();

    const state = {
        installed: false,
        native: null,
        nativeSource: 'none',
        system: null,
        syncedBodies: new Set(),
        updateWrapped: false,
        initWrapped: false,
        wasmReadyListenerInstalled: false,
        warningShown: false,
        lastReconcileAt: -Infinity
    };

    function finite(value, fallback = 0) {
        const n = Number(value);
        return Number.isFinite(n) ? n : fallback;
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, finite(value, min)));
    }

    function normalizeVec2(value, fallback = { x: 1, y: 0 }) {
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

    function safeRequire() {
        try {
            if (typeof require === 'function') return require;
        } catch (_) {}

        try {
            if (global.require && typeof global.require === 'function') {
                return global.require;
            }
        } catch (_) {}

        return null;
    }

    function tryLoadNativeAddon() {
        // Preferred path when Electron contextIsolation is enabled.
        if (
            global.smNativeWaterAPI &&
            typeof global.smNativeWaterAPI.sample === 'function'
        ) {
            state.native = global.smNativeWaterAPI;
            state.nativeSource = 'preload';
            return state.native;
        }

        // Renderer-side C++ backend. It becomes available asynchronously after
        // NativeWaterWasmBridge.js finishes instantiating the shared module.
        if (
            global.smNativeWaterWasmAPI &&
            typeof global.smNativeWaterWasmAPI.sample === 'function'
        ) {
            state.native = global.smNativeWaterWasmAPI;
            state.nativeSource = 'wasm';
            return state.native;
        }

        const req = safeRequire();
        if (!req) return null;

        const candidates = [];

        try {
            const path = req('path');
            const processObj =
                typeof process !== 'undefined'
                    ? process
                    : global.process;

            const cwd = processObj?.cwd?.();
            const dirname =
                typeof __dirname !== 'undefined'
                    ? __dirname
                    : null;

            if (cwd) {
                candidates.push(
                    path.join(
                        cwd,
                        'engine',
                        'native',
                        'water',
                        'build',
                        'Release',
                        'sm_water_native.node'
                    )
                );

                candidates.push(
                    path.join(
                        cwd,
                        'engine',
                        'native',
                        'water',
                        'build',
                        'Debug',
                        'sm_water_native.node'
                    )
                );
            }

            if (dirname) {
                candidates.push(
                    path.resolve(
                        dirname,
                        '..',
                        'native',
                        'water',
                        'build',
                        'Release',
                        'sm_water_native.node'
                    )
                );
            }
        } catch (_) {}

        // Also support a configured absolute path from the Electron main process.
        if (global.SM_NATIVE_WATER_ADDON_PATH) {
            candidates.unshift(global.SM_NATIVE_WATER_ADDON_PATH);
        }

        for (const candidate of candidates) {
            if (!candidate) continue;

            try {
                const addon = req(candidate);
                if (
                    addon &&
                    typeof addon.sample === 'function' &&
                    typeof addon.upsertBody === 'function'
                ) {
                    state.native = addon;
                    state.nativeSource = candidate;
                    return addon;
                }
            } catch (_) {}
        }

        return null;
    }

    function getNative() {
        return state.native || tryLoadNativeAddon();
    }

    function bodyToNative(body) {
        if (!body) return null;

        const config = body.config || {};
        const materialOptions =
            body.material?.userData?.smWaterOptions ||
            {};

        // Material options are included because the latest package keeps the
        // master animation clock there as well. body.config remains authoritative.
        const merged = {
            ...materialOptions,
            ...config
        };

        const flowDirection =
            body.type === 'river' && body.flowDirectionAt
                ? (() => {
                    const center =
                        body.points?.length
                            ? body.points[
                                Math.floor(
                                    body.points.length * 0.5
                                )
                            ]
                            : { x: 0, z: 0 };

                    const v =
                        body.flowDirectionAt(
                            finite(center?.x),
                            finite(center?.z),
                            global.THREE
                                ? new global.THREE.Vector3()
                                : undefined
                        );

                    return normalizeVec2(
                        { x: v?.x, y: v?.z },
                        merged.flowDirection
                    );
                })()
                : normalizeVec2(merged.flowDirection);

        return {
            id: String(body.id || ''),
            type: String(body.type || merged.type || 'river').toLowerCase(),
            points: (body.points || []).map(point => ({
                x: finite(point?.x),
                y: finite(point?.y),
                z: finite(point?.z)
            })),

            width: finite(merged.width, 4),
            levelOffset: finite(merged.levelOffset, 0.08),
            oceanSize: finite(merged.oceanSize, 800),
            volumeDepth: finite(
                merged.volumeDepth,
                finite(merged.bedDepth, 4)
            ),
            bedDepth: finite(merged.bedDepth, 3),

            waveHeight: finite(merged.waveHeight, 0.22),
            waveLength: Math.max(
                0.2,
                finite(merged.waveLength, 9)
            ),
            waveSpeed: Math.max(
                0,
                finite(merged.waveSpeed, 1.05)
            ),
            choppiness: finite(merged.choppiness, 0.48),
            waveScale: Math.max(
                0.08,
                finite(merged.waveScale, 1)
            ),
            waveSteepness: clamp(
                merged.waveSteepness ?? 0.42,
                0,
                1.5
            ),
            waveChoppiness: clamp(
                merged.waveChoppiness ?? merged.choppiness ?? 0.48,
                0,
                1.5
            ),
            waveSpread: clamp(
                merged.waveSpread ?? 0.72,
                0,
                2
            ),
            windSpeed: Math.max(
                0,
                finite(merged.windSpeed, 1)
            ),
            windDirection: normalizeVec2(
                merged.windDirection || merged.flowDirection
            ),
            smallWaveStrength: Math.max(
                0,
                finite(
                    merged.smallWaveStrength,
                    finite(merged.microWaveStrength, 0.34)
                )
            ),

            // Latest Smooth Animation package master clock.
            animationSpeed: clamp(
                merged.animationSpeed ?? 1.25,
                0.05,
                8.0
            ),

            flowSpeed: Math.max(
                0,
                finite(merged.flowSpeed, 0.72)
            ),
            flowDirection,
            flowCoherence: clamp(
                merged.flowCoherence ?? 0.86,
                0,
                1
            ),
            flowReverse: !!merged.flowReverse,

            currentStrength: Math.max(
                0,
                finite(merged.currentStrength, 1.5)
            ),
            currentBankDrag: clamp(
                merged.currentBankDrag ?? 0.55,
                0,
                0.95
            ),

            nativeRippleHeightScale: Math.max(
                0,
                finite(merged.nativeRippleHeightScale, 1)
            )
        };
    }

    function wrapBodyRipple(body) {
        if (
            !body ||
            typeof body.addRipple !== 'function' ||
            WRAPPED_ADD_RIPPLE.has(body)
        ) {
            return;
        }

        const original = body.addRipple.bind(body);

        body.addRipple = function nativeAwareAddRipple(
            position,
            options = {}
        ) {
            const result = original(position, options);

            const addon = getNative();
            if (addon && position) {
                try {
                    addon.addRipple(
                        String(body.id),
                        {
                            x: finite(position.x),
                            z: finite(position.z),
                            radius: finite(options.radius, 7),
                            strength: finite(options.strength, 0.14),
                            speed: finite(options.speed, 2.6),
                            frequency: finite(options.frequency, 11),
                            decay: finite(options.decay, 1.4),
                            time: finite(
                                options.time,
                                state.system?.time ??
                                body.time ??
                                0
                            )
                        }
                    );
                } catch (error) {
                    warnOnce(
                        '[SM Native Water] Native ripple mirror failed.',
                        error
                    );
                }
            }

            return result;
        };

        WRAPPED_ADD_RIPPLE.add(body);
    }

    function syncBody(body) {
        const addon = getNative();
        if (!addon || !body?.id) return false;

        const payload = bodyToNative(body);
        if (!payload?.id) return false;

        try {
            const ok = addon.upsertBody(payload);
            if (ok !== false) {
                state.syncedBodies.add(payload.id);
                wrapBodyRipple(body);
                return true;
            }
        } catch (error) {
            warnOnce(
                `[SM Native Water] Failed to sync body ${payload.id}.`,
                error
            );
        }

        return false;
    }

    function removeBody(id) {
        const addon = getNative();
        const key = String(id || '');
        if (!key) return false;

        state.syncedBodies.delete(key);

        if (!addon) return false;

        try {
            return addon.removeBody(key) !== false;
        } catch (error) {
            warnOnce(
                `[SM Native Water] Failed to remove body ${key}.`,
                error
            );
            return false;
        }
    }

    function reconcileBodies(force = false) {
        const system = state.system;
        const addon = getNative();

        if (!system || !addon) return false;

        const now =
            typeof performance !== 'undefined'
                ? performance.now()
                : Date.now();

        if (!force && now - state.lastReconcileAt < 1000) {
            return true;
        }

        state.lastReconcileAt = now;

        const currentIds = new Set();

        for (const body of system.bodies?.values?.() || []) {
            if (!body?.id) continue;
            currentIds.add(String(body.id));
            syncBody(body);
        }

        for (const id of Array.from(state.syncedBodies)) {
            if (!currentIds.has(id)) {
                removeBody(id);
            }
        }

        return true;
    }

    function warnOnce(message, error = null) {
        if (state.warningShown) return;
        state.warningShown = true;
        console.warn(message, error || '');
    }

    function patchSystem(system) {
        if (!system) return null;

        state.system = system;

        const addon = getNative();

        if (addon) {
            try {
                addon.reset?.();
                addon.setTime?.(finite(system.time, 0));
            } catch (_) {}
        } else {
            console.info(
                '[SM Native Water] Native addon not loaded; ' +
                'bridge will use the existing JS water sampling fallback.'
            );
        }

        if (typeof system.on === 'function') {
            system.on('bodycreated', ({ body } = {}) => {
                syncBody(body);
            });

            system.on('bodyupdated', ({ body } = {}) => {
                syncBody(body);
            });

            system.on('bodyremoved', ({ id } = {}) => {
                removeBody(id);
            });

            system.on('settingschange', () => {
                if (system.activeBody) syncBody(system.activeBody);
            });

            system.on('preset', () => {
                if (system.activeBody) syncBody(system.activeBody);
            });
        }

        reconcileBodies(true);

        if (
            typeof system.update === 'function' &&
            !system.__smNativeWaterUpdateWrapped
        ) {
            const originalUpdate = system.update.bind(system);

            system.update = function nativeWaterUpdate(delta = 0) {
                const result = originalUpdate(delta);

                // Latest WaterSystem owns the canonical clamped water clock.
                // Use its absolute time to avoid double-stepping native physics.
                const native = getNative();
                if (native) {
                    try {
                        native.step?.(
                            finite(delta, 0),
                            finite(system.time, 0)
                        );
                    } catch (error) {
                        warnOnce(
                            '[SM Native Water] Native step failed.',
                            error
                        );
                    }
                }

                reconcileBodies(false);
                return result;
            };

            system.__smNativeWaterUpdateWrapped = true;
        }

        return system;
    }

    function resolveWaterSystem(result = null) {
        return (
            result ||
            global.waterSystem ||
            global.smWaterSystem ||
            global.SMWaterSystemInstance ||
            null
        );
    }

    function wrapInitWaterSystem() {
        if (state.initWrapped) return true;

        const original = global.initWaterSystem;
        if (typeof original !== 'function') {
            return false;
        }

        global.initWaterSystem = function nativeWaterInitWrapper(...args) {
            const result = original.apply(this, args);
            const system = resolveWaterSystem(result);
            if (system) patchSystem(system);
            return result;
        };

        global.initWaterSystem.__smNativeWaterWrapped = true;
        state.initWrapped = true;
        return true;
    }

    function installWasmReadyListener() {
        if (
            state.wasmReadyListenerInstalled ||
            typeof global.addEventListener !== 'function'
        ) {
            return;
        }

        state.wasmReadyListenerInstalled = true;
        global.addEventListener('sm:native-water-ready', () => {
            // A loaded Node addon remains the preferred desktop backend.
            if (
                global.smNativeWaterAPI &&
                typeof global.smNativeWaterAPI.sample === 'function'
            ) {
                return;
            }

            state.native = null;
            state.nativeSource = 'none';

            const addon = getNative();
            if (!addon || !state.system) return;

            try {
                addon.reset?.();
                addon.setTime?.(finite(state.system.time, 0));
                reconcileBodies(true);
            } catch (error) {
                warnOnce(
                    '[SM Native Water] WASM backend attach failed.',
                    error
                );
            }
        });
    }

    function findBodyAt(position) {
        const system = state.system || resolveWaterSystem();
        if (!system || !position) return null;

        if (typeof system.getBodyAt === 'function') {
            return system.getBodyAt(
                finite(position.x),
                finite(position.z),
                0
            );
        }

        for (const body of system.bodies?.values?.() || []) {
            if (
                body?.containsXZ?.(
                    finite(position.x),
                    finite(position.z),
                    0
                )
            ) {
                return body;
            }
        }

        return null;
    }

    function fallbackSample(position, bodyHint = null) {
        const system = state.system || resolveWaterSystem();
        if (!system || !position) {
            return {
                found: false,
                bodyId: '',
                surfaceY: 0,
                normal: { x: 0, y: 1, z: 0 },
                current: { x: 0, y: 0, z: 0 },
                surfaceVelocityY: 0,
                waterDepth: 0,
                native: false
            };
        }

        const body =
            bodyHint ||
            findBodyAt(position);

        if (!body) {
            return {
                found: false,
                bodyId: '',
                surfaceY: 0,
                normal: { x: 0, y: 1, z: 0 },
                current: { x: 0, y: 0, z: 0 },
                surfaceVelocityY: 0,
                waterDepth: 0,
                native: false
            };
        }

        const x = finite(position.x);
        const z = finite(position.z);
        const time = finite(system.time, finite(body.time, 0));

        const sampleY = (sx, sz, st = time) =>
            finite(
                body.surfaceYAt?.(
                    sx,
                    sz,
                    true,
                    st
                ),
                0
            );

        const surfaceY = sampleY(x, z);

        const eps = 0.08;
        const dx =
            (
                sampleY(x + eps, z) -
                sampleY(x - eps, z)
            ) /
            (2 * eps);
        const dz =
            (
                sampleY(x, z + eps) -
                sampleY(x, z - eps)
            ) /
            (2 * eps);

        let nx = -dx;
        let ny = 1;
        let nz = -dz;
        const nLen = Math.hypot(nx, ny, nz) || 1;
        nx /= nLen;
        ny /= nLen;
        nz /= nLen;

        const currentTarget =
            global.THREE
                ? new global.THREE.Vector3()
                : { x: 0, y: 0, z: 0 };

        const current =
            typeof body.currentAt === 'function'
                ? body.currentAt(x, z, currentTarget)
                : system.getCurrentAt?.(
                    { x, y: surfaceY, z },
                    currentTarget
                ) ||
                  currentTarget;

        const dt = 1 / 120;
        const surfaceVelocityY =
            (
                sampleY(x, z, time + dt) -
                sampleY(x, z, time - dt)
            ) /
            (2 * dt);

        return {
            found: true,
            bodyId: String(body.id || ''),
            surfaceY,
            normal: { x: nx, y: ny, z: nz },
            current: {
                x: finite(current?.x),
                y: finite(current?.y),
                z: finite(current?.z)
            },
            surfaceVelocityY,
            waterDepth: Math.max(
                0.02,
                finite(
                    body.depthAt?.(x, z),
                    finite(
                        body.config?.volumeDepth,
                        finite(body.config?.bedDepth, 4)
                    )
                )
            ),
            native: false
        };
    }

    function sample(position) {
        if (!position) return fallbackSample(null);

        const addon = getNative();
        if (addon) {
            try {
                const out = addon.sample(
                    finite(position.x),
                    finite(position.z)
                );
                if (out) {
                    return {
                        ...out,
                        native: true
                    };
                }
            } catch (error) {
                warnOnce(
                    '[SM Native Water] Native sample failed; using JS fallback.',
                    error
                );
            }
        }

        return fallbackSample(position);
    }

    function sampleBody(bodyOrId, position) {
        if (!position) return fallbackSample(null);

        const system = state.system || resolveWaterSystem();
        const body =
            typeof bodyOrId === 'string'
                ? system?.bodies?.get?.(bodyOrId)
                : bodyOrId;

        const id =
            typeof bodyOrId === 'string'
                ? bodyOrId
                : body?.id;

        const addon = getNative();
        if (addon && id) {
            try {
                const out = addon.sampleBody(
                    String(id),
                    finite(position.x),
                    finite(position.z)
                );
                if (out) {
                    return {
                        ...out,
                        native: true
                    };
                }
            } catch (error) {
                warnOnce(
                    '[SM Native Water] Native body sample failed; using JS fallback.',
                    error
                );
            }
        }

        return fallbackSample(position, body || null);
    }

    function addImpulse(
        position,
        {
            body = null,
            radius = 7,
            strength = 0.14,
            speed = 2.6,
            frequency = 11,
            decay = 1.4,
            visual = true
        } = {}
    ) {
        if (!position) return false;

        const system = state.system || resolveWaterSystem();
        const targetBody =
            typeof body === 'string'
                ? system?.bodies?.get?.(body)
                : body || findBodyAt(position);

        if (!targetBody) return false;

        // Keep the current shader/InteractionFX path alive.
        if (visual) {
            targetBody.addRipple?.(
                position,
                {
                    radius,
                    strength,
                    speed,
                    frequency,
                    decay,
                    time: finite(system?.time, 0)
                }
            );

            // addRipple is wrapped, therefore it already mirrored to native.
            return true;
        }

        const addon = getNative();
        if (!addon) return false;

        try {
            return addon.addRipple(
                String(targetBody.id),
                {
                    x: finite(position.x),
                    z: finite(position.z),
                    radius: finite(radius, 7),
                    strength: finite(strength, 0.14),
                    speed: finite(speed, 2.6),
                    frequency: finite(frequency, 11),
                    decay: finite(decay, 1.4),
                    time: finite(system?.time, 0)
                }
            ) !== false;
        } catch (error) {
            warnOnce(
                '[SM Native Water] addImpulse failed.',
                error
            );
            return false;
        }
    }

    function stats() {
        const addon = getNative();

        let nativeStats = null;
        if (addon?.stats) {
            try {
                nativeStats = addon.stats();
            } catch (_) {}
        }

        return {
            version: VERSION,
            nativeLoaded: !!addon,
            nativeSource: state.nativeSource,
            attached: !!state.system,
            syncedBodyCount: state.syncedBodies.size,
            nativeStats
        };
    }

    function install() {
        state.installed = true;
        installWasmReadyListener();

        // Retrying this is intentional. If the bridge script was loaded a few
        // milliseconds before WaterSystem.js, a later install() call can still
        // wrap initWaterSystem without re-registering everything.
        wrapInitWaterSystem();

        const existing = resolveWaterSystem();
        if (existing && existing !== state.system) {
            patchSystem(existing);
        }

        return api;
    }

    const api = {
        VERSION,
        install,
        attach: patchSystem,
        syncBody,
        reconcileBodies,
        sample,
        sampleBody,
        addImpulse,
        stats,
        get native() {
            return getNative();
        },
        get system() {
            return state.system;
        }
    };

    global.SMNativeWaterBridge = api;

    global.getNativeWaterSample = function getNativeWaterSample(position) {
        return api.sample(position);
    };

    global.addNativeWaterImpulse = function addNativeWaterImpulse(
        position,
        options
    ) {
        return api.addImpulse(position, options);
    };

    // Safe auto-install. Correct load order still remains:
    // WaterSystem.js -> NativeWaterBridge.js -> initWaterSystem()
    install();

    console.info(
        `[SM Native Water] ${VERSION} ready ` +
        `(${getNative() ? 'native addon loaded' : 'JS fallback until addon loads'}).`
    );
})(window);
