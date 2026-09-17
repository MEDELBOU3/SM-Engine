// engine/resources/SMResourceManager.js
// Resource authority for SM Engine.
// Coordinates existing performance, memory and worker systems without
// duplicating their work or creating another render/update loop.

(function () {
    'use strict';

    class SMResourceManager {
        constructor(options = {}) {
            this.options = {
                enabled: true,
                mode: 'balanced',
                sampleIntervalMs: 500,
                memorySnapshotIntervalMs: 6000,
                memoryCleanupThreshold: 0.96,
                memoryWarningThreshold: 0.85,
                workerQueueWarning: 20,
                framePressureWarning: 1.15,
                framePressureCritical: 1.7,
                pauseDeepMemoryScanDuringPlay: true,
                ...options
            };

            this.state = {
                pressure: 'LOW',
                framePressure: 0,
                memoryPressure: 0,
                workerPressure: 0,
                fps: 60,
                frameTimeMs: 16.67,
                qualityLevel: null,
                mode: this.options.mode,
                playing: false,
                lastSampleAt: 0,
                lastMemorySnapshotAt: 0,
                lastPressureChangeAt: 0
            };

            this._started = false;
            this._frameCallback = (delta, time) => this.update(delta, time);
            this._memorySnapshotPromise = null;
            this._lastCleanupRequestAt = 0;

            this._profiles = {
                performance: {
                    workerPriorityMode: 'performance',
                    workerFrameBudgetMs: 7,
                    workerBackgroundBudgetMs: 5,
                    workerTasksPerFrame: 12
                },
                balanced: {
                    workerPriorityMode: 'balanced',
                    workerFrameBudgetMs: 5,
                    workerBackgroundBudgetMs: 3,
                    workerTasksPerFrame: 8
                },
                responsiveness: {
                    workerPriorityMode: 'responsiveness',
                    workerFrameBudgetMs: 2,
                    workerBackgroundBudgetMs: 1.5,
                    workerTasksPerFrame: 4
                },
                quality: {
                    workerPriorityMode: 'balanced',
                    workerFrameBudgetMs: 4,
                    workerBackgroundBudgetMs: 2,
                    workerTasksPerFrame: 6
                }
            };
        }

        get performanceManager() {
            return (
                window.performanceManager ||
                window.smPerformanceManager ||
                null
            );
        }

        get memoryManager() {
            return (
                window.SMMemoryBudgetManager ||
                window.smMemoryBudgetManager ||
                null
            );
        }

        get workerManager() {
            return (
                window.SMWorkerPoolManager ||
                window.smWorkerPoolManager ||
                null
            );
        }

        start() {
            if (this._started) return this;

            window.engineFrameCallbacks = Array.isArray(
                window.engineFrameCallbacks
            )
                ? window.engineFrameCallbacks
                : [];

            if (!window.engineFrameCallbacks.includes(this._frameCallback)) {
                window.engineFrameCallbacks.push(this._frameCallback);
            }

            this._started = true;
            this.setMode(this.options.mode);

            window.dispatchEvent(
                new CustomEvent('sm:resource-manager-ready', {
                    detail: { manager: this }
                })
            );

            return this;
        }

        stop() {
            if (!this._started) return;

            const callbacks = window.engineFrameCallbacks;
            const index = Array.isArray(callbacks)
                ? callbacks.indexOf(this._frameCallback)
                : -1;

            if (index >= 0) callbacks.splice(index, 1);
            this._started = false;
        }

        setEnabled(enabled) {
            this.options.enabled = !!enabled;
            return this.options.enabled;
        }

        setMode(mode) {
            const normalized = String(mode || 'balanced').toLowerCase();
            const profile = this._profiles[normalized] || this._profiles.balanced;
            const finalMode = this._profiles[normalized]
                ? normalized
                : 'balanced';

            this.options.mode = finalMode;
            this.state.mode = finalMode;

            this.workerManager?.configure?.({
                priorityMode: profile.workerPriorityMode,
                frameBudgetMs: profile.workerFrameBudgetMs,
                backgroundBudgetMs: profile.workerBackgroundBudgetMs,
                maxTasksPerFrame: profile.workerTasksPerFrame
            });

            window.dispatchEvent(
                new CustomEvent('sm:resource-mode-changed', {
                    detail: {
                        mode: finalMode,
                        profile: { ...profile }
                    }
                })
            );

            return finalMode;
        }

        update(delta) {
            if (!this.options.enabled) return this.state;

            const now = globalThis.performance?.now?.() || Date.now();
            if (
                now - this.state.lastSampleAt <
                this.options.sampleIntervalMs
            ) {
                return this.state;
            }

            this.state.lastSampleAt = now;
            this.state.playing = this._isPlaying();

            const performanceMetrics = this._readPerformance();
            const workers = this.workerManager?.getStats?.() || null;
            const deepMemory = this.memoryManager?.lastReport || null;

            const framePressure = this._calculateFramePressure(performanceMetrics);
            const memoryPressure = Number(
                deepMemory?.pressure?.max || 0
            );
            const workerPressure = this._calculateWorkerPressure(workers);

            this.state.framePressure = framePressure;
            this.state.memoryPressure = memoryPressure;
            this.state.workerPressure = workerPressure;
            this.state.fps = Number(performanceMetrics?.averageFPS || performanceMetrics?.fps || 60);
            this.state.frameTimeMs = Number(
                performanceMetrics?.averageFrameTimeMs ||
                performanceMetrics?.frameTimeMs ||
                16.67
            );
            this.state.qualityLevel =
                this.performanceManager?.qualityLevel || null;

            const nextPressure = this._resolvePressureLevel({
                framePressure,
                memoryPressure,
                workerPressure
            });

            if (nextPressure !== this.state.pressure) {
                const previous = this.state.pressure;
                this.state.pressure = nextPressure;
                this.state.lastPressureChangeAt = Date.now();

                window.dispatchEvent(
                    new CustomEvent('sm:resource-pressure-changed', {
                        detail: {
                            previous,
                            current: nextPressure,
                            state: this.getStats()
                        }
                    })
                );
            }

            this._adaptWorkerBudget();
            this._scheduleDeepMemorySnapshot(now);
            this._maybeRequestCleanup(now);

            return this.state;
        }

        _readPerformance() {
            const manager = this.performanceManager;
            if (!manager) return null;

            // PerformanceManager is already updated by animate-loop.js.
            // Never call manager.update() from here or it would run the entire
            // optimization stack twice per frame.
            return (
                manager._lastMetrics ||
                manager.monitor?.getSnapshot?.() ||
                manager.stats ||
                null
            );
        }

        _calculateFramePressure(performance) {
            const frameTime = Number(
                performance?.averageFrameTimeMs ||
                performance?.frameTimeMs ||
                16.67
            );
            return Math.max(0, frameTime / (1000 / 60));
        }

        _calculateWorkerPressure(stats) {
            if (!stats) return 0;
            const workerBudget = Math.max(
                1,
                Number(stats.globalWorkerBudget || stats.workers || 1)
            );
            const jobs = Math.max(
                0,
                Number(stats.pendingWorkerJobs || 0)
            );
            const mainQueue = Math.max(
                0,
                Number(stats.queuedMainThreadTasks || 0)
            );

            return Math.max(
                jobs / workerBudget,
                mainQueue / Math.max(1, this.options.workerQueueWarning)
            );
        }

        _resolvePressureLevel({
            framePressure,
            memoryPressure,
            workerPressure
        }) {
            if (
                memoryPressure >= 1 ||
                framePressure >= this.options.framePressureCritical ||
                workerPressure >= 3
            ) {
                return 'CRITICAL';
            }

            if (
                memoryPressure >= this.options.memoryWarningThreshold ||
                framePressure >= this.options.framePressureWarning ||
                workerPressure >= 1.5
            ) {
                return 'HIGH';
            }

            if (
                memoryPressure >= 0.7 ||
                framePressure >= 0.95 ||
                workerPressure >= 0.75
            ) {
                return 'MEDIUM';
            }

            return 'LOW';
        }

        _adaptWorkerBudget() {
            const workers = this.workerManager;
            if (!workers?.configure) return;

            const base = this._profiles[this.state.mode] || this._profiles.balanced;
            const pressure = this.state.pressure;

            if (pressure === 'CRITICAL') {
                workers.configure({
                    priorityMode: 'responsiveness',
                    frameBudgetMs: 1.5,
                    backgroundBudgetMs: 1,
                    maxTasksPerFrame: 2
                });
                return;
            }

            if (pressure === 'HIGH') {
                workers.configure({
                    priorityMode: 'responsiveness',
                    frameBudgetMs: Math.min(2.5, base.workerFrameBudgetMs),
                    backgroundBudgetMs: 1.5,
                    maxTasksPerFrame: Math.min(4, base.workerTasksPerFrame)
                });
                return;
            }

            workers.configure({
                priorityMode: base.workerPriorityMode,
                frameBudgetMs: base.workerFrameBudgetMs,
                backgroundBudgetMs: base.workerBackgroundBudgetMs,
                maxTasksPerFrame: base.workerTasksPerFrame
            });
        }

        _scheduleDeepMemorySnapshot(now) {
            const memory = this.memoryManager;
            if (!memory?.snapshot || this._memorySnapshotPromise) return;

            if (
                now - this.state.lastMemorySnapshotAt <
                this.options.memorySnapshotIntervalMs
            ) {
                return;
            }

            if (
                this.options.pauseDeepMemoryScanDuringPlay &&
                this.state.playing
            ) {
                return;
            }

            this.state.lastMemorySnapshotAt = now;

            const run = () => memory.snapshot({ force: false });
            const workerManager = this.workerManager;

            this._memorySnapshotPromise = (
                workerManager?.scheduleMainThread
                    ? workerManager.scheduleMainThread(run, {
                        priority: 'background',
                        label: 'resource-memory-snapshot'
                    })
                    : run()
            )
                .catch(error => {
                    console.warn(
                        '[SMResourceManager] Deep memory snapshot failed.',
                        error
                    );
                    return null;
                })
                .finally(() => {
                    this._memorySnapshotPromise = null;
                });
        }

        _maybeRequestCleanup(now) {
            const memory = this.memoryManager;
            if (!memory?.cleanup || !memory.autoCleanup) return;

            const pressure = Number(
                memory.lastReport?.pressure?.max || 0
            );

            if (pressure < this.options.memoryCleanupThreshold) return;
            if (now - this._lastCleanupRequestAt < 15000) return;
            if (this.state.playing) return;

            this._lastCleanupRequestAt = now;
            memory.cleanup('resource-pressure').catch(error => {
                console.warn(
                    '[SMResourceManager] Memory cleanup failed.',
                    error
                );
            });
        }

        _isPlaying() {
            if (window.TerrainPlayerPlayBridge?.state?.playing === true) {
                return true;
            }

            return (
                window.PlayOrchestrator?.mode === 'play' ||
                window.__smPIEMode === 'play'
            );
        }

        schedule(task, options = {}) {
            const workers = this.workerManager;
            if (!workers?.scheduleMainThread) {
                return Promise.resolve().then(task);
            }
            return workers.scheduleMainThread(task, options);
        }

        runWorker(type, payload, options = {}) {
            const workers = this.workerManager;
            if (!workers?.run) {
                return Promise.reject(
                    new Error('SMWorkerPoolManager is unavailable.')
                );
            }
            return workers.run(type, payload, options);
        }

        markSceneDirty() {
            this.memoryManager?.markSceneDirty?.();
            this.performanceManager?.requestSceneRescan?.();
        }

        async forceMemorySnapshot() {
            return this.memoryManager?.snapshot?.({ force: true }) || null;
        }

        getStats() {
            return {
                ...this.state,
                performance:
                    this.performanceManager?.monitor?.getSnapshot?.() ||
                    this.performanceManager?.stats ||
                    null,
                workers: this.workerManager?.getStats?.() || null,
                memory: this.memoryManager?.getStats?.() || null
            };
        }

        debug() {
            const stats = this.getStats();
            console.log('[SMResourceManager]', stats);
            return stats;
        }

        destroy() {
            this.stop();
        }
    }

    const manager = new SMResourceManager();
    window.SMResourceManager = manager;
    window.smResourceManager = manager;
    window.SMResourceManagerClass = SMResourceManager;
    manager.start();
})();
