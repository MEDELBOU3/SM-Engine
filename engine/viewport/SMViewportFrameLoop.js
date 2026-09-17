// ============================================================================
// engine/viewport/SMViewportFrameLoop.js
// SM Engine — Single frame scheduler for the editor/runtime viewport.
// ============================================================================
(function (root) {
    'use strict';

    if (root.SMViewportFrameLoopClass) return;

    class SMViewportFrameLoop {
        constructor(options = {}) {
            this.maxDelta = Number.isFinite(options.maxDelta)
                ? Math.max(0.001, options.maxDelta)
                : 0.05;
            this.runLegacyCallbacks = options.runLegacyCallbacks !== false;

            this.running = false;
            this.externallyDriven = false;
            this.paused = false;
            this.frame = 0;
            this.time = 0;
            this.delta = 0;
            this.rawDelta = 0;

            this._raf = 0;
            this._lastTimeMs = 0;
            this._nextId = 1;
            this._subscribers = new Map();
            this._sortedSubscribers = [];
            this._sortDirty = true;
            this._boundTick = this._tick.bind(this);
            this._errorOnce = new Set();

            // Compatibility registry used by several existing SM Engine systems.
            // The clean viewport executes it from the SAME frame loop, so legacy
            // callbacks no longer need their own requestAnimationFrame fallback.
            if (!Array.isArray(root.engineFrameCallbacks)) {
                root.engineFrameCallbacks = [];
            }
        }

        subscribe(callback, options = {}) {
            if (typeof callback !== 'function') {
                throw new TypeError('SMViewportFrameLoop.subscribe() requires a function.');
            }

            const id = options.id || `sm_vp_frame_${this._nextId++}`;
            const entry = {
                id,
                callback,
                priority: Number.isFinite(options.priority) ? options.priority : 0,
                enabled: options.enabled !== false,
                once: options.once === true,
                phase: options.phase || 'update'
            };

            this._subscribers.set(id, entry);
            this._sortDirty = true;

            const unsubscribe = () => this.unsubscribe(id);
            unsubscribe.id = id;
            return unsubscribe;
        }

        unsubscribe(reference) {
            const id = typeof reference === 'string'
                ? reference
                : reference?.id;

            if (!id) return false;
            const removed = this._subscribers.delete(id);
            if (removed) this._sortDirty = true;
            return removed;
        }

        setEnabled(reference, enabled) {
            const id = typeof reference === 'string' ? reference : reference?.id;
            const entry = id ? this._subscribers.get(id) : null;
            if (!entry) return false;
            entry.enabled = Boolean(enabled);
            return true;
        }

        setPaused(paused) {
            this.paused = Boolean(paused);
            return this.paused;
        }

        _getSortedSubscribers() {
            if (!this._sortDirty) return this._sortedSubscribers;

            this._sortedSubscribers = Array.from(this._subscribers.values())
                .sort((a, b) => {
                    if (a.priority !== b.priority) return b.priority - a.priority;
                    return String(a.id).localeCompare(String(b.id));
                });

            this._sortDirty = false;
            return this._sortedSubscribers;
        }

        _reportError(key, error) {
            if (this._errorOnce.has(key)) return;
            this._errorOnce.add(key);
            console.error(`[SMViewportFrameLoop] ${key}`, error);
        }

        _runLegacyCallbacks(context) {
            const registry = root.engineFrameCallbacks;
            if (!Array.isArray(registry) || registry.length === 0) return;

            // Snapshot the array so callbacks may safely register/unregister while
            // a frame is being processed.
            const callbacks = registry.slice();
            for (const callback of callbacks) {
                if (typeof callback !== 'function') continue;
                try {
                    callback(context.delta, context.time, context);
                } catch (error) {
                    this._reportError('Legacy frame callback failed.', error);
                }
            }
        }

        step(nowMs = performance.now()) {
            const now = Number.isFinite(nowMs) ? nowMs : performance.now();

            if (!this._lastTimeMs) {
                this._lastTimeMs = now;
            }

            this.rawDelta = Math.max(0, (now - this._lastTimeMs) / 1000);
            this.delta = Math.min(this.rawDelta, this.maxDelta);
            this.time = now * 0.001;
            this._lastTimeMs = now;
            this.frame += 1;

            const context = {
                frame: this.frame,
                time: this.time,
                delta: this.delta,
                rawDelta: this.rawDelta,
                paused: this.paused,
                frameLoop: this,
                viewport: root.smViewport || null
            };

            // Existing systems update first, then modern subscribers. Rendering is
            // registered with a very low priority by SMViewport so gameplay, water,
            // animation and tools can finish their update before the draw.
            if (!this.paused && this.runLegacyCallbacks) {
                this._runLegacyCallbacks(context);
            }

            const removeAfterFrame = [];
            for (const entry of this._getSortedSubscribers()) {
                if (!entry.enabled) continue;
                if (this.paused && entry.phase !== 'render-while-paused') continue;

                try {
                    entry.callback(context);
                } catch (error) {
                    this._reportError(`Subscriber '${entry.id}' failed.`, error);
                }

                if (entry.once) removeAfterFrame.push(entry.id);
            }

            for (const id of removeAfterFrame) {
                this.unsubscribe(id);
            }

            return context;
        }

        _tick(nowMs) {
            if (!this.running) return;
            this._raf = requestAnimationFrame(this._boundTick);
            this.step(nowMs);
        }

        start() {
            if (this.running) return true;

            this.externallyDriven = false;
            this.running = true;
            this._lastTimeMs = performance.now();
            this._raf = requestAnimationFrame(this._boundTick);

            root.dispatchEvent?.(new CustomEvent('sm:viewport-frame-loop-start'));
            return true;
        }

        stop() {
            if (!this.running && !this._raf) return true;

            this.running = false;
            this.externallyDriven = false;
            if (this._raf) {
                cancelAnimationFrame(this._raf);
                this._raf = 0;
            }

            this._lastTimeMs = 0;
            root.dispatchEvent?.(new CustomEvent('sm:viewport-frame-loop-stop'));
            return true;
        }

        stepExternally(nowMs = performance.now()) {
            if (!this.running) this.externallyDriven = true;
            return this.step(nowMs);
        }

        resetClock() {
            this._lastTimeMs = performance.now();
            this.rawDelta = 0;
            this.delta = 0;
        }

        getDebugState() {
            return {
                running: this.running,
                externallyDriven: this.externallyDriven,
                paused: this.paused,
                frame: this.frame,
                delta: this.delta,
                rawDelta: this.rawDelta,
                subscribers: Array.from(this._subscribers.values()).map(entry => ({
                    id: entry.id,
                    priority: entry.priority,
                    enabled: entry.enabled,
                    phase: entry.phase
                })),
                legacyCallbacks: Array.isArray(root.engineFrameCallbacks)
                    ? (this.runLegacyCallbacks ? root.engineFrameCallbacks.length : 0)
                    : 0
            };
        }

        dispose() {
            this.stop();
            this._subscribers.clear();
            this._sortedSubscribers = [];
            this._sortDirty = true;
        }
    }

    root.SMViewportFrameLoopClass = SMViewportFrameLoop;
})(window);
