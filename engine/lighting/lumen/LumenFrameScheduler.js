class LumenFrameScheduler {
    constructor(config) {
        this.config = config;
        this.frame = 0;
        this.delta = 0;
        this.tasks = new Map();
        this.stats = {};
        this.defaultBudgets = {
            probeUpdates: config?.probeUpdateBudget ?? 6,
            surfaceCards: config?.surfaceCardBudget ?? 2,
            voxelUpdates: config?.voxelUpdateBudget ?? 4,
            reflectionFaces: config?.reflectionFaceBudget ?? 1
        };
    }
    beginFrame(frame, delta = 0) {
        this.frame = frame;
        this.delta = delta;
        this.stats = {
            frame,
            probeUpdates: 0,
            surfaceCards: 0,
            voxelUpdates: 0,
            reflectionFaces: 0
        };
        return this.stats;
    }
    setBudget(name, value) {
        this.defaultBudgets[name] = Math.max(0, Math.floor(value));
    }
    getBudget(name) {
        if (name === 'probeUpdates') return Math.max(0, Math.floor(this.config?.probeUpdateBudget ?? this.defaultBudgets.probeUpdates));
        if (name === 'surfaceCards') return Math.max(0, Math.floor(this.config?.surfaceCardBudget ?? this.defaultBudgets.surfaceCards));
        if (name === 'voxelUpdates') return Math.max(0, Math.floor(this.config?.voxelUpdateBudget ?? this.defaultBudgets.voxelUpdates));
        if (name === 'reflectionFaces') return Math.max(0, Math.floor(this.config?.reflectionFaceBudget ?? this.defaultBudgets.reflectionFaces));
        return Math.max(0, Math.floor(this.defaultBudgets[name] ?? 0));
    }
    canRun(name) {
        const budget = this.getBudget(name);
        const used = this.stats[name] ?? 0;
        return used < budget;
    }
    consume(name, count = 1) {
        const budget = this.getBudget(name);
        const used = this.stats[name] ?? 0;
        const allowed = Math.max(0, Math.min(count, budget - used));
        this.stats[name] = used + allowed;
        return allowed;
    }
    getTaskKey(item) {
        if (item == null) return 'null';
        if (typeof item === 'string' || typeof item === 'number') return String(item);
        if (item.id != null) return String(item.id);
        if (item.uuid != null) return String(item.uuid);
        if (item.index != null) return `index:${item.index}`;
        if (!item.__lumenSchedulerId) {
            Object.defineProperty(item, '__lumenSchedulerId', {
                value: `lumen-task-${LumenFrameScheduler._nextTaskId++}`,
                enumerable: false,
                configurable: true
            });
        }
        return item.__lumenSchedulerId;
    }
    schedule(name, item, priority = 0) {
        if (!this.tasks.has(name)) this.tasks.set(name, new Map());
        const queue = this.tasks.get(name);
        const key = this.getTaskKey(item);
        const existing = queue.get(key);
        if (existing) {
            existing.priority = Math.max(existing.priority, priority);
            existing.frame = Math.min(existing.frame, this.frame);
            existing.item = item;
            return queue.size;
        }
        queue.set(key, { key, item, priority, frame: this.frame });
        return queue.size;
    }
    runQueue(name, callback, budgetOverride = null) {
        const queue = this.tasks.get(name);
        if (!queue?.size || typeof callback !== 'function') return 0;
        const tasks = Array.from(queue.values()).sort((a, b) => b.priority - a.priority || a.frame - b.frame);
        const budget = budgetOverride == null ? this.getBudget(name) : Math.max(0, Math.floor(budgetOverride));
        let executed = 0;
        for (const task of tasks) {
            if (executed >= budget) break;
            queue.delete(task.key);
            callback(task.item, task);
            executed++;
        }
        this.stats[name] = (this.stats[name] ?? 0) + executed;
        return executed;
    }
    remove(name, item) {
        const queue = this.tasks.get(name);
        if (!queue) return false;
        return queue.delete(this.getTaskKey(item));
    }
    clearQueue(name) {
        this.tasks.get(name)?.clear?.();
    }
    clearAll() {
        for (const queue of this.tasks.values()) queue.clear?.();
    }
    getQueueSize(name) {
        return this.tasks.get(name)?.size || 0;
    }
    getStats() {
        const queued = {};
        for (const [name, queue] of this.tasks) queued[name] = queue.size;
        return {
            ...this.stats,
            queued
        };
    }
    dispose() {
        this.clearAll();
        this.tasks.clear();
    }
}
LumenFrameScheduler._nextTaskId = 1;
window.LumenFrameScheduler = LumenFrameScheduler;