// engine/settings/system/SMWorkerPoolManager.js
// Global worker budget + main-thread background scheduler for SM Engine.
// The worker limit is GLOBAL across worker types, not multiplied per type.

(function () {
    'use strict';

    class SMWorkerPoolManager {
        constructor() {
            this.enabled = true;
            this.desiredCount = 'auto';
            this.pauseWhenHidden = true;
            this.useIdleCallback = true;
            this.frameBudgetMs = 6;
            this.backgroundBudgetMs = 3;
            this.maxTasksPerFrame = 8;
            this.maxWorkersPerType = 4;
            this.priorityMode = 'balanced';

            this.factories = new Map();
            this.pools = new Map();
            this.jobSequence = 0;
            this.pending = new Map();
            this.orphanedJobs = new Map();
            this.mainThreadQueue = [];

            this._hidden = document.hidden;
            this._idleHandle = 0;
            this._schedulerMode = null;
            this._raf = 0;
            this._engineFrameCallback = () => this._frame();
            this._visibilityHandler = () => {
                this._hidden = document.hidden;
            };

            document.addEventListener(
                'visibilitychange',
                this._visibilityHandler
            );

            this.startScheduler();
        }

        configure(options = {}) {
            const previousCount = this.getResolvedWorkerCount();

            if (options.enabled !== undefined) {
                this.enabled = Boolean(options.enabled);
            }
            if (options.workerCount !== undefined) {
                this.desiredCount = this._normalizeWorkerCount(
                    options.workerCount
                );
            }
            if (options.pauseWhenHidden !== undefined) {
                this.pauseWhenHidden = Boolean(options.pauseWhenHidden);
            }
            if (options.useIdleCallback !== undefined) {
                this.useIdleCallback = Boolean(options.useIdleCallback);
            }
            if (options.frameBudgetMs !== undefined) {
                this.frameBudgetMs = this._positive(
                    options.frameBudgetMs,
                    6
                );
            }
            if (options.backgroundBudgetMs !== undefined) {
                this.backgroundBudgetMs = this._positive(
                    options.backgroundBudgetMs,
                    3
                );
            }
            if (options.maxTasksPerFrame !== undefined) {
                this.maxTasksPerFrame = Math.max(
                    1,
                    Math.round(Number(options.maxTasksPerFrame) || 8)
                );
            }
            if (options.maxWorkersPerType !== undefined) {
                this.maxWorkersPerType = Math.max(
                    1,
                    Math.min(
                        8,
                        Math.round(Number(options.maxWorkersPerType) || 4)
                    )
                );
            }
            if (options.priorityMode !== undefined) {
                const mode = String(options.priorityMode);
                this.priorityMode = [
                    'performance',
                    'balanced',
                    'responsiveness'
                ].includes(mode)
                    ? mode
                    : 'balanced';
            }

            const nextCount = this.getResolvedWorkerCount();
            if (!this.enabled) {
                this.terminateAll();
            } else if (previousCount !== nextCount) {
                this._trimWorkersToBudget();
            }

            this._emitConfig();
            return this.getConfig();
        }

        getConfig() {
            return {
                enabled: this.enabled,
                workerCount: this.desiredCount,
                resolvedWorkerCount: this.getResolvedWorkerCount(),
                pauseWhenHidden: this.pauseWhenHidden,
                useIdleCallback: this.useIdleCallback,
                frameBudgetMs: this.frameBudgetMs,
                backgroundBudgetMs: this.backgroundBudgetMs,
                maxTasksPerFrame: this.maxTasksPerFrame,
                maxWorkersPerType: this.maxWorkersPerType,
                priorityMode: this.priorityMode
            };
        }

        getResolvedWorkerCount() {
            if (this.desiredCount !== 'auto') {
                return Math.max(1, Number(this.desiredCount) || 1);
            }

            const logical = Math.max(
                1,
                Number(navigator.hardwareConcurrency || 4)
            );

            // Leave at least two logical processors for Chromium renderer/GPU,
            // Electron main process and the OS. Cap browser workers globally.
            return Math.max(
                1,
                Math.min(6, logical - 2)
            );
        }

        registerWorkerFactory(type, factory) {
            if (!type || typeof factory !== 'function') {
                throw new TypeError(
                    'registerWorkerFactory(type, factory) requires a function.'
                );
            }

            const key = String(type);
            this.factories.set(key, factory);

            // Workers are created lazily on the first run(). Registering many
            // worker types therefore has zero thread cost at startup.
            if (!this.pools.has(key)) {
                this.pools.set(key, []);
            }

            return () => {
                this._terminatePool(key);
                this.factories.delete(key);
            };
        }

        async run(type, payload, options = {}) {
            if (!this.enabled) {
                throw new Error('SM worker pool is disabled.');
            }

            const key = String(type);
            let pool = this._ensurePool(key);

            if (!pool?.length) {
                throw new Error(
                    `No worker factory registered for "${key}" or no worker capacity is available.`
                );
            }

            // Grow a busy pool only when the GLOBAL worker budget allows it.
            if (
                pool.every(slot => slot.pending > 0) &&
                pool.length < this.maxWorkersPerType &&
                this._countWorkers() < this.getResolvedWorkerCount()
            ) {
                this._growPool(key, 1);
                pool = this.pools.get(key) || pool;
            }

            const slot = pool.reduce(
                (best, current) =>
                    !best || current.pending < best.pending
                        ? current
                        : best,
                null
            );

            if (!slot) {
                throw new Error(`No live worker slot is available for "${key}".`);
            }

            const id = ++this.jobSequence;

            return new Promise((resolve, reject) => {
                const timeoutMs = Math.max(
                    0,
                    Number(options.timeoutMs || 0)
                );

                let timeout = 0;
                if (timeoutMs) {
                    timeout = window.setTimeout(() => {
                        const pending = this.pending.get(id);
                        if (!pending) return;

                        this.pending.delete(id);

                        // The browser Worker API cannot cancel an individual
                        // message. Keep the slot busy until its late result
                        // arrives so load balancing remains accurate.
                        this.orphanedJobs.set(id, slot);

                        reject(
                            new Error(
                                `Worker job "${key}" timed out.`
                            )
                        );
                    }, timeoutMs);
                }

                this.pending.set(id, {
                    resolve,
                    reject,
                    slot,
                    timeout,
                    type: key,
                    started: performance.now()
                });

                slot.pending++;
                slot.activeJobs.add(id);

                slot.worker.postMessage({
                    __smWorkerJob: true,
                    id,
                    type: key,
                    payload
                });
            });
        }

        scheduleMainThread(task, options = {}) {
            if (typeof task !== 'function') {
                throw new TypeError(
                    'scheduleMainThread(task) requires a function.'
                );
            }

            const priority = [
                'critical',
                'normal',
                'background'
            ].includes(options.priority)
                ? options.priority
                : 'background';

            return new Promise((resolve, reject) => {
                this.mainThreadQueue.push({
                    task,
                    priority,
                    resolve,
                    reject,
                    label: options.label || 'task',
                    queuedAt: performance.now()
                });
                this._sortQueue();
            });
        }

        cancelQueuedMainThreadTasks(predicate = null) {
            const keep = [];
            let cancelled = 0;

            for (const item of this.mainThreadQueue) {
                const shouldCancel =
                    typeof predicate === 'function'
                        ? !!predicate(item)
                        : true;

                if (!shouldCancel) {
                    keep.push(item);
                    continue;
                }

                cancelled++;
                item.reject(
                    new Error(
                        `Scheduled task "${item.label}" was cancelled.`
                    )
                );
            }

            this.mainThreadQueue = keep;
            return cancelled;
        }

        getStats() {
            let workerCount = 0;
            let workerJobs = 0;
            const pools = {};

            for (const [type, pool] of this.pools) {
                workerCount += pool.length;
                const pending = pool.reduce(
                    (sum, slot) => sum + slot.pending,
                    0
                );
                workerJobs += pending;
                pools[type] = {
                    workers: pool.length,
                    pending
                };
            }

            return {
                enabled: this.enabled,
                workers: workerCount,
                globalWorkerBudget: this.getResolvedWorkerCount(),
                pendingWorkerJobs: workerJobs,
                orphanedWorkerJobs: this.orphanedJobs.size,
                queuedMainThreadTasks: this.mainThreadQueue.length,
                registeredWorkerTypes: this.factories.size,
                hidden: this._hidden,
                schedulerMode: this._schedulerMode,
                pools
            };
        }

        rebuildPools() {
            this.terminateAll();
            // Pools remain lazy. They are recreated when run() is called.
            for (const type of this.factories.keys()) {
                if (!this.pools.has(type)) this.pools.set(type, []);
            }
        }

        terminateAll() {
            for (const type of Array.from(this.pools.keys())) {
                this._terminatePool(type);
            }
        }

        startScheduler() {
            if (this._schedulerMode) return;

            // Reuse the engine's existing RAF instead of creating a second
            // permanent requestAnimationFrame loop.
            window.engineFrameCallbacks = Array.isArray(
                window.engineFrameCallbacks
            )
                ? window.engineFrameCallbacks
                : [];

            if (
                !window.engineFrameCallbacks.includes(
                    this._engineFrameCallback
                )
            ) {
                window.engineFrameCallbacks.push(
                    this._engineFrameCallback
                );
            }

            this._schedulerMode = 'engine-frame-callback';
        }

        stopScheduler() {
            if (this._schedulerMode === 'engine-frame-callback') {
                const callbacks = window.engineFrameCallbacks;
                const index = Array.isArray(callbacks)
                    ? callbacks.indexOf(this._engineFrameCallback)
                    : -1;
                if (index >= 0) callbacks.splice(index, 1);
            }

            if (this._raf) {
                cancelAnimationFrame(this._raf);
                this._raf = 0;
            }

            if (this._idleHandle && 'cancelIdleCallback' in window) {
                cancelIdleCallback(this._idleHandle);
                this._idleHandle = 0;
            }

            this._schedulerMode = null;
        }

        _frame() {
            if (
                !this.enabled ||
                (this.pauseWhenHidden && this._hidden)
            ) {
                return;
            }

            this._drainMainThreadQueue();
        }

        _drainMainThreadQueue() {
            if (!this.mainThreadQueue.length) return;

            const start = performance.now();
            const budget = this._resolveMainThreadBudget();
            let completed = 0;

            while (
                this.mainThreadQueue.length &&
                completed < this.maxTasksPerFrame &&
                performance.now() - start < budget
            ) {
                const item = this.mainThreadQueue.shift();
                completed++;

                try {
                    Promise.resolve(item.task())
                        .then(item.resolve, item.reject);
                } catch (error) {
                    item.reject(error);
                }
            }

            if (
                this.useIdleCallback &&
                this.mainThreadQueue.length &&
                'requestIdleCallback' in window &&
                !this._idleHandle
            ) {
                this._idleHandle = requestIdleCallback(
                    deadline => {
                        this._idleHandle = 0;
                        let count = 0;

                        while (
                            this.mainThreadQueue.length &&
                            deadline.timeRemaining() > 1 &&
                            count < 4
                        ) {
                            const item = this.mainThreadQueue.shift();
                            count++;
                            try {
                                Promise.resolve(item.task())
                                    .then(item.resolve, item.reject);
                            } catch (error) {
                                item.reject(error);
                            }
                        }
                    },
                    { timeout: 250 }
                );
            }
        }

        _resolveMainThreadBudget() {
            if (this.priorityMode === 'performance') {
                return Math.max(
                    this.backgroundBudgetMs,
                    this.frameBudgetMs
                );
            }

            if (this.priorityMode === 'responsiveness') {
                return Math.max(
                    0.5,
                    Math.min(this.backgroundBudgetMs, 1.5)
                );
            }

            return Math.max(
                0.5,
                Math.min(this.frameBudgetMs, this.backgroundBudgetMs)
            );
        }

        _ensurePool(type) {
            if (!this.factories.has(type)) return null;
            if (!this.pools.has(type)) this.pools.set(type, []);

            const pool = this.pools.get(type);
            if (
                !pool.length &&
                this.enabled &&
                typeof Worker !== 'undefined' &&
                this._countWorkers() < this.getResolvedWorkerCount()
            ) {
                this._growPool(type, 1);
            }

            return this.pools.get(type);
        }

        _growPool(type, requested = 1) {
            const factory = this.factories.get(type);
            const pool = this.pools.get(type) || [];
            this.pools.set(type, pool);

            if (!factory || !this.enabled || typeof Worker === 'undefined') {
                return pool;
            }

            const globalBudget = this.getResolvedWorkerCount();
            let remaining = Math.max(
                0,
                globalBudget - this._countWorkers()
            );
            let count = Math.min(
                Math.max(0, requested),
                remaining,
                Math.max(0, this.maxWorkersPerType - pool.length)
            );

            while (count-- > 0) {
                let worker = null;
                const index = pool.length;

                try {
                    worker = factory({
                        index,
                        type,
                        count: globalBudget
                    });
                } catch (error) {
                    console.error(
                        `[SMWorkerPoolManager] Worker factory "${type}" failed.`,
                        error
                    );
                    break;
                }

                if (!(worker instanceof Worker)) {
                    console.warn(
                        `[SMWorkerPoolManager] Factory "${type}" did not return a Worker.`
                    );
                    try { worker?.terminate?.(); } catch { }
                    break;
                }

                const slot = {
                    worker,
                    pending: 0,
                    index,
                    type,
                    activeJobs: new Set()
                };

                worker.addEventListener(
                    'message',
                    event => this._onWorkerMessage(slot, event)
                );
                worker.addEventListener(
                    'error',
                    error => this._onWorkerError(slot, type, error)
                );

                pool.push(slot);
                remaining--;
                if (remaining <= 0) break;
            }

            return pool;
        }

        _terminatePool(type) {
            const pool = this.pools.get(type);
            if (!pool) return;

            for (const slot of pool) {
                try { slot.worker.terminate(); } catch { }
            }

            this.pools.set(type, []);

            for (const [id, pending] of Array.from(this.pending)) {
                if (pending.type !== type) continue;
                clearTimeout(pending.timeout);
                pending.reject(
                    new Error(`Worker pool "${type}" was terminated.`)
                );
                this.pending.delete(id);
            }

            for (const [id, slot] of Array.from(this.orphanedJobs)) {
                if (slot.type === type) {
                    this.orphanedJobs.delete(id);
                }
            }
        }

        _trimWorkersToBudget() {
            const budget = this.getResolvedWorkerCount();
            let total = this._countWorkers();
            if (total <= budget) return;

            // Remove idle workers first, keeping at least one live worker in a
            // pool that currently has queued work.
            for (const pool of this.pools.values()) {
                for (let i = pool.length - 1; i >= 0 && total > budget; i--) {
                    const slot = pool[i];
                    if (slot.pending > 0) continue;
                    try { slot.worker.terminate(); } catch { }
                    pool.splice(i, 1);
                    total--;
                }
            }
        }

        _countWorkers() {
            let count = 0;
            for (const pool of this.pools.values()) {
                count += pool.length;
            }
            return count;
        }

        _finishSlotJob(slot, id) {
            if (!slot) return;
            slot.activeJobs.delete(id);
            slot.pending = Math.max(0, slot.pending - 1);
        }

        _onWorkerMessage(slot, event) {
            const data = event.data;

            if (!data || data.__smWorkerResult !== true) {
                window.dispatchEvent(
                    new CustomEvent('sm:worker-message', {
                        detail: {
                            worker: slot.index,
                            type: slot.type,
                            data
                        }
                    })
                );
                return;
            }

            const pending = this.pending.get(data.id);

            if (!pending) {
                if (this.orphanedJobs.has(data.id)) {
                    this.orphanedJobs.delete(data.id);
                    this._finishSlotJob(slot, data.id);
                }
                return;
            }

            this.pending.delete(data.id);
            this._finishSlotJob(slot, data.id);
            clearTimeout(pending.timeout);

            if (data.ok === false) {
                pending.reject(
                    new Error(data.error || 'Worker job failed.')
                );
            } else {
                pending.resolve(data.result);
            }
        }

        _onWorkerError(slot, type, error) {
            console.error(
                `[SMWorkerPoolManager] Worker "${type}" error.`,
                error
            );

            // Reject every live job assigned to the failed worker. Without this,
            // jobs with no timeout can remain pending forever.
            for (const id of Array.from(slot.activeJobs)) {
                const pending = this.pending.get(id);
                if (pending) {
                    clearTimeout(pending.timeout);
                    pending.reject(
                        new Error(
                            `Worker "${type}" crashed while running job ${id}.`
                        )
                    );
                    this.pending.delete(id);
                }
                this.orphanedJobs.delete(id);
                this._finishSlotJob(slot, id);
            }

            const pool = this.pools.get(type);
            const index = pool?.indexOf(slot) ?? -1;
            if (index >= 0) {
                try { slot.worker.terminate(); } catch { }
                pool.splice(index, 1);
            }

            window.dispatchEvent(
                new CustomEvent('sm:worker-error', {
                    detail: {
                        type,
                        index: slot.index,
                        error
                    }
                })
            );
        }

        _sortQueue() {
            const rank = {
                critical: 0,
                normal: 1,
                background: 2
            };

            this.mainThreadQueue.sort(
                (a, b) =>
                    rank[a.priority] - rank[b.priority] ||
                    a.queuedAt - b.queuedAt
            );
        }

        _normalizeWorkerCount(value) {
            if (String(value) === 'auto') return 'auto';
            return Math.max(
                1,
                Math.min(
                    12,
                    Math.round(Number(value) || 1)
                )
            );
        }

        _positive(value, fallback) {
            const n = Number(value);
            return Number.isFinite(n) && n > 0 ? n : fallback;
        }

        _emitConfig() {
            window.dispatchEvent(
                new CustomEvent('sm:system-worker-config', {
                    detail: this.getConfig()
                })
            );
        }

        debug() {
            console.log(
                '[SMWorkerPoolManager]',
                this.getConfig(),
                this.getStats()
            );
        }

        destroy() {
            this.stopScheduler();
            this.terminateAll();
            this.cancelQueuedMainThreadTasks();
            document.removeEventListener(
                'visibilitychange',
                this._visibilityHandler
            );
        }
    }

    const manager = new SMWorkerPoolManager();
    window.SMWorkerPoolManager = manager;
    window.smWorkerPoolManager = manager;
    window.SMWorkerPoolManagerClass = SMWorkerPoolManager;
})();