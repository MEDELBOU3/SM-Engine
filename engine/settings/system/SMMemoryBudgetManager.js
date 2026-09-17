// engine/settings/system/SMMemoryBudgetManager.js
// Deep / slow memory audit for SM Engine.
// NOTE: this is intentionally NOT a per-frame monitor. PerformanceManager's
// MemoryBudgetManager remains responsible for lightweight renderer diagnostics.

(function () {
    'use strict';

    class SMMemoryBudgetManager {
        constructor() {
            this.budgets = {
                textureMB: 1024,
                geometryMB: 768,
                cacheMB: 512
            };

            this.autoCleanup = true;
            this.unusedAssetTimeoutSec = 120;
            this.gpuDisposeDelayFrames = 3;

            // A scene traversal that inspects every geometry/material/texture is
            // expensive. Cache the result and only repeat it at a slow cadence.
            this.sceneEstimateIntervalMs = 5000;
            this.snapshotMinIntervalMs = 5000;
            this.cleanupCooldownMs = 15000;

            this.providers = new Map();
            this.cleanupHooks = new Map();
            this.lastReport = null;

            this._sceneEstimateCache = null;
            this._lastSceneEstimateAt = 0;
            this._lastSnapshotAt = 0;
            this._lastCleanupAt = 0;
            this._sceneDirty = true;
            this._snapshotPromise = null;
            this._cleanupPromise = null;
        }

        configure(options = {}) {
            if (options.textureMB !== undefined) {
                this.budgets.textureMB = this._positive(options.textureMB, 1024);
            }
            if (options.geometryMB !== undefined) {
                this.budgets.geometryMB = this._positive(options.geometryMB, 768);
            }
            if (options.cacheMB !== undefined) {
                this.budgets.cacheMB = this._positive(options.cacheMB, 512);
            }
            if (options.autoCleanup !== undefined) {
                this.autoCleanup = Boolean(options.autoCleanup);
            }
            if (options.unusedAssetTimeoutSec !== undefined) {
                this.unusedAssetTimeoutSec = this._positive(
                    options.unusedAssetTimeoutSec,
                    120
                );
            }
            if (options.gpuDisposeDelayFrames !== undefined) {
                this.gpuDisposeDelayFrames = Math.max(
                    0,
                    Math.round(Number(options.gpuDisposeDelayFrames) || 0)
                );
            }
            if (options.sceneEstimateIntervalMs !== undefined) {
                this.sceneEstimateIntervalMs = Math.max(
                    1000,
                    Number(options.sceneEstimateIntervalMs) || 5000
                );
            }
            if (options.snapshotMinIntervalMs !== undefined) {
                this.snapshotMinIntervalMs = Math.max(
                    1000,
                    Number(options.snapshotMinIntervalMs) || 5000
                );
            }
            if (options.cleanupCooldownMs !== undefined) {
                this.cleanupCooldownMs = Math.max(
                    1000,
                    Number(options.cleanupCooldownMs) || 15000
                );
            }

            this._emitConfig();
            return this.getConfig();
        }

        getConfig() {
            return {
                budgets: { ...this.budgets },
                autoCleanup: this.autoCleanup,
                unusedAssetTimeoutSec: this.unusedAssetTimeoutSec,
                gpuDisposeDelayFrames: this.gpuDisposeDelayFrames,
                sceneEstimateIntervalMs: this.sceneEstimateIntervalMs,
                snapshotMinIntervalMs: this.snapshotMinIntervalMs,
                cleanupCooldownMs: this.cleanupCooldownMs
            };
        }

        registerProvider(id, provider) {
            if (!id || typeof provider !== 'function') {
                throw new TypeError('registerProvider(id, provider) requires a function.');
            }
            this.providers.set(String(id), provider);
            return () => this.providers.delete(String(id));
        }

        registerCleanupHook(id, hook) {
            if (!id || typeof hook !== 'function') {
                throw new TypeError('registerCleanupHook(id, hook) requires a function.');
            }
            this.cleanupHooks.set(String(id), hook);
            return () => this.cleanupHooks.delete(String(id));
        }

        markSceneDirty() {
            this._sceneDirty = true;
        }

        estimateScene(scene = window.scene || null, { force = false } = {}) {
            const now = performance.now();
            if (
                !force &&
                !this._sceneDirty &&
                this._sceneEstimateCache &&
                now - this._lastSceneEstimateAt < this.sceneEstimateIntervalMs
            ) {
                return { ...this._sceneEstimateCache };
            }

            let geometryBytes = 0;
            let textureBytes = 0;
            const geometries = new Set();
            const textures = new Set();

            if (!scene?.traverse) {
                const empty = {
                    geometryBytes,
                    textureBytes,
                    geometryCount: 0,
                    textureCount: 0,
                    scanDurationMs: 0
                };
                this._sceneEstimateCache = empty;
                this._lastSceneEstimateAt = now;
                this._sceneDirty = false;
                return { ...empty };
            }

            const started = performance.now();

            scene.traverse(object => {
                const geometry = object.geometry;
                if (geometry && !geometries.has(geometry)) {
                    geometries.add(geometry);
                    geometryBytes += this._estimateGeometryBytes(geometry);
                }

                const materials = Array.isArray(object.material)
                    ? object.material
                    : object.material
                        ? [object.material]
                        : [];

                for (const material of materials) {
                    if (!material) continue;

                    for (const key of Object.keys(material)) {
                        const value = material[key];
                        if (value?.isTexture && !textures.has(value)) {
                            textures.add(value);
                            textureBytes += this._estimateTextureBytes(value);
                        }
                    }

                    const uniforms = material.uniforms;
                    if (uniforms && typeof uniforms === 'object') {
                        for (const uniform of Object.values(uniforms)) {
                            const value = uniform?.value;
                            if (value?.isTexture && !textures.has(value)) {
                                textures.add(value);
                                textureBytes += this._estimateTextureBytes(value);
                            }
                        }
                    }
                }
            });

            const estimate = {
                geometryBytes,
                textureBytes,
                geometryCount: geometries.size,
                textureCount: textures.size,
                scanDurationMs: performance.now() - started
            };

            this._sceneEstimateCache = estimate;
            this._lastSceneEstimateAt = now;
            this._sceneDirty = false;
            return { ...estimate };
        }

        async snapshot(options = {}) {
            const force = options.force === true;
            const now = performance.now();

            if (this._snapshotPromise) {
                return this._snapshotPromise;
            }

            if (
                !force &&
                this.lastReport &&
                now - this._lastSnapshotAt < this.snapshotMinIntervalMs
            ) {
                return this.lastReport;
            }

            this._snapshotPromise = this._snapshotInternal({ force })
                .finally(() => {
                    this._snapshotPromise = null;
                });

            return this._snapshotPromise;
        }

        async _snapshotInternal({ force = false } = {}) {
            const sceneEstimate = this.estimateScene(
                window.scene || null,
                { force }
            );

            let cacheBytes = 0;
            const providerResults = {};

            for (const [id, provider] of this.providers) {
                try {
                    const value = await provider();
                    providerResults[id] = value;
                    if (typeof value === 'number') {
                        cacheBytes += Math.max(0, value);
                    } else if (value && typeof value === 'object') {
                        cacheBytes += Math.max(0, Number(value.bytes || 0));
                    }
                } catch (error) {
                    providerResults[id] = {
                        error: error?.message || String(error)
                    };
                }
            }

            const textureBudgetBytes = this.budgets.textureMB * 1024 * 1024;
            const geometryBudgetBytes = this.budgets.geometryMB * 1024 * 1024;
            const cacheBudgetBytes = this.budgets.cacheMB * 1024 * 1024;

            const report = {
                estimated: {
                    textures: sceneEstimate.textureBytes,
                    geometry: sceneEstimate.geometryBytes,
                    cache: cacheBytes,
                    total:
                        sceneEstimate.textureBytes +
                        sceneEstimate.geometryBytes +
                        cacheBytes
                },
                counts: {
                    textures: sceneEstimate.textureCount,
                    geometries: sceneEstimate.geometryCount
                },
                budgets: {
                    textures: textureBudgetBytes,
                    geometry: geometryBudgetBytes,
                    cache: cacheBudgetBytes
                },
                pressure: {
                    textures: this._ratio(
                        sceneEstimate.textureBytes,
                        textureBudgetBytes
                    ),
                    geometry: this._ratio(
                        sceneEstimate.geometryBytes,
                        geometryBudgetBytes
                    ),
                    cache: this._ratio(cacheBytes, cacheBudgetBytes)
                },
                providers: providerResults,
                scanDurationMs: sceneEstimate.scanDurationMs || 0,
                exactVRAM: false,
                timestamp: Date.now()
            };

            report.pressure.max = Math.max(
                report.pressure.textures,
                report.pressure.geometry,
                report.pressure.cache
            );

            this.lastReport = report;
            this._lastSnapshotAt = performance.now();

            window.dispatchEvent(
                new CustomEvent('sm:system-memory-report', {
                    detail: { report }
                })
            );

            return report;
        }

        async cleanup(reason = 'manual', options = {}) {
            const force = options.force === true;
            const now = performance.now();

            if (this._cleanupPromise) {
                return this._cleanupPromise;
            }

            if (
                !force &&
                now - this._lastCleanupAt < this.cleanupCooldownMs
            ) {
                return [];
            }

            this._cleanupPromise = this._cleanupInternal(reason)
                .finally(() => {
                    this._cleanupPromise = null;
                });

            return this._cleanupPromise;
        }

        async _cleanupInternal(reason) {
            const results = [];

            for (const [id, hook] of this.cleanupHooks) {
                try {
                    results.push({
                        id,
                        ok: true,
                        result: await hook({
                            reason,
                            config: this.getConfig()
                        })
                    });
                } catch (error) {
                    results.push({
                        id,
                        ok: false,
                        error: error?.message || String(error)
                    });
                }
            }

            // Dispose renderer-side cached draw lists only. Never dispose scene
            // geometry/materials here because their owners must do that safely.
            window.renderer?.renderLists?.dispose?.();

            this._lastCleanupAt = performance.now();
            this.markSceneDirty();

            window.dispatchEvent(
                new CustomEvent('sm:system-memory-cleanup', {
                    detail: { reason, results }
                })
            );

            return results;
        }

        isUnderPressure(threshold = 0.9) {
            return Number(this.lastReport?.pressure?.max || 0) >= threshold;
        }

        getStats() {
            return {
                config: this.getConfig(),
                pressure: Number(this.lastReport?.pressure?.max || 0),
                lastReportAt: this.lastReport?.timestamp || null,
                lastSceneScanDurationMs:
                    Number(this.lastReport?.scanDurationMs || 0),
                sceneDirty: this._sceneDirty,
                providerCount: this.providers.size,
                cleanupHookCount: this.cleanupHooks.size
            };
        }

        _estimateGeometryBytes(geometry) {
            let total = 0;

            for (const attribute of Object.values(geometry.attributes || {})) {
                total += Number(attribute?.array?.byteLength || 0);
            }

            for (const list of Object.values(geometry.morphAttributes || {})) {
                if (!Array.isArray(list)) continue;
                for (const attribute of list) {
                    total += Number(attribute?.array?.byteLength || 0);
                }
            }

            total += Number(geometry.index?.array?.byteLength || 0);
            return total;
        }

        _estimateTextureBytes(texture) {
            const image = texture?.image || texture?.source?.data;
            const width = Number(
                image?.videoWidth ||
                image?.naturalWidth ||
                image?.width ||
                0
            );
            const height = Number(
                image?.videoHeight ||
                image?.naturalHeight ||
                image?.height ||
                0
            );

            if (!width || !height) return 0;

            const mipFactor = texture.generateMipmaps === false ? 1 : 4 / 3;
            const depth = Number(image?.depth || 1);
            return Math.round(width * height * depth * 4 * mipFactor);
        }

        _positive(value, fallback) {
            const n = Number(value);
            return Number.isFinite(n) && n > 0 ? n : fallback;
        }

        _ratio(value, limit) {
            return limit ? Math.max(0, value / limit) : 0;
        }

        _emitConfig() {
            window.dispatchEvent(
                new CustomEvent('sm:system-memory-config', {
                    detail: this.getConfig()
                })
            );
        }

        debug() {
            console.log(
                '[SMMemoryBudgetManager]',
                this.getConfig(),
                this.lastReport,
                this.getStats()
            );
        }
    }

    const manager = new SMMemoryBudgetManager();
    window.SMMemoryBudgetManager = manager;
    window.smMemoryBudgetManager = manager;
    window.SMMemoryBudgetManagerClass = SMMemoryBudgetManager;
})();