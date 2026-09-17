/**
 * GAME-UI/animation/UIAnimationSystem.js
 * ------------------------------------------------------------
 * Runtime animation player for Game UI widgets.
 *
 * Supports:
 * - multiple tracks per animation
 * - delay
 * - playback speed
 * - loop / ping-pong
 * - pause / resume / stop
 * - animation events
 */
(function () {
    'use strict';

    class UIAnimationSystem {
        constructor(options = {}) {
            this.document = options.document || null;
            this.evaluator =
                options.evaluator ||
                window.uiKeyframeEvaluator ||
                null;

            this.animations = new Map();
            this.active = new Map();

            this.enabled = options.enabled ?? true;

            this._raf = 0;
            this._running = false;
            this._counter = 0;
        }

        setDocument(document) {
            this.stopAll();
            this.document = document || null;
            return this;
        }

        setEnabled(state) {
            this.enabled = Boolean(state);

            if (!this.enabled) {
                this.pauseAll();
            }

            return this;
        }

        register(name, definition) {
            if (!name || !definition) {
                throw new TypeError('UIAnimationSystem.register(name, definition): invalid arguments.');
            }

            const normalized = this._normalizeDefinition(name, definition);
            this.animations.set(String(name), normalized);

            return normalized;
        }

        unregister(name) {
            return this.animations.delete(String(name));
        }

        get(name) {
            return this.animations.get(String(name)) || null;
        }

        play(nameOrDefinition, options = {}) {
            if (!this.enabled) return null;

            const definition = typeof nameOrDefinition === 'string'
                ? this.get(nameOrDefinition)
                : this._normalizeDefinition(
                    nameOrDefinition?.name || `animation-${++this._counter}`,
                    nameOrDefinition || {}
                );

            if (!definition) {
                console.warn('[UIAnimationSystem] Animation was not found.');
                return null;
            }

            const widget = this._resolveWidget(
                options.widget ||
                options.widgetId ||
                definition.widgetId
            );

            if (!widget) {
                console.warn(
                    `[UIAnimationSystem] Target widget for "${definition.name}" was not found.`
                );
                return null;
            }

            const duration =
                Number(options.duration ?? definition.duration) ||
                this.evaluator?.getDuration?.(definition.tracks) ||
                0;

            const instanceId =
                options.instanceId ||
                `${definition.name}:${widget.id}:${++this._counter}`;

            const instance = {
                id: instanceId,
                definition,
                widget,
                widgetId: widget.id,

                duration,
                delay: Math.max(0, Number(options.delay ?? definition.delay ?? 0)),
                speed: Math.max(0.0001, Number(options.speed ?? definition.speed ?? 1)),

                loop: options.loop ?? definition.loop ?? false,
                loopCount: Number(options.loopCount ?? definition.loopCount ?? Infinity),
                pingPong: options.pingPong ?? definition.pingPong ?? false,

                direction: options.reverse ? -1 : 1,
                startTime: performance?.now?.() ?? Date.now(),
                localTime: options.reverse ? duration : 0,

                completedLoops: 0,
                paused: false,
                pauseTime: 0,

                restoreOnStop: options.restoreOnStop ?? definition.restoreOnStop ?? false,
                initialState: this._captureInitialState(widget, definition.tracks),

                onStart: options.onStart || definition.onStart || null,
                onUpdate: options.onUpdate || definition.onUpdate || null,
                onComplete: options.onComplete || definition.onComplete || null
            };

            this.active.set(instanceId, instance);

            this._invoke(instance.onStart, {
                instance,
                widget,
                animationSystem: this
            });

            this._ensureLoop();

            return instanceId;
        }

        stop(instanceId, options = {}) {
            const instance = this.active.get(instanceId);
            if (!instance) return false;

            if (options.restore ?? instance.restoreOnStop) {
                this._restoreInitialState(instance);
            }

            this.active.delete(instanceId);

            if (!this.active.size) {
                this._stopLoop();
            }

            return true;
        }

        stopByWidget(widgetOrId, options = {}) {
            const widgetId = typeof widgetOrId === 'string'
                ? widgetOrId
                : widgetOrId?.id;

            if (!widgetId) return 0;

            let stopped = 0;

            for (const [id, instance] of [...this.active.entries()]) {
                if (instance.widgetId === widgetId) {
                    if (this.stop(id, options)) stopped++;
                }
            }

            return stopped;
        }

        stopAll(options = {}) {
            const ids = [...this.active.keys()];

            for (const id of ids) {
                this.stop(id, options);
            }

            return ids.length;
        }

        pause(instanceId) {
            const instance = this.active.get(instanceId);
            if (!instance || instance.paused) return false;

            instance.paused = true;
            instance.pauseTime = performance?.now?.() ?? Date.now();

            return true;
        }

        resume(instanceId) {
            const instance = this.active.get(instanceId);
            if (!instance || !instance.paused) return false;

            const now = performance?.now?.() ?? Date.now();
            const pausedFor = now - instance.pauseTime;

            instance.startTime += pausedFor;
            instance.paused = false;
            instance.pauseTime = 0;

            this._ensureLoop();

            return true;
        }

        pauseAll() {
            for (const id of this.active.keys()) {
                this.pause(id);
            }

            return this;
        }

        resumeAll() {
            for (const id of this.active.keys()) {
                this.resume(id);
            }

            return this;
        }

        update(now = performance?.now?.() ?? Date.now()) {
            if (!this.enabled || !this.active.size) return 0;

            let updated = 0;

            for (const [id, instance] of [...this.active.entries()]) {
                if (instance.paused) continue;

                const elapsedMs = now - instance.startTime;
                const elapsed = elapsedMs / 1000;

                if (elapsed < instance.delay) continue;

                const effective =
                    (elapsed - instance.delay) * instance.speed;

                let localTime =
                    instance.direction === 1
                        ? effective
                        : instance.duration - effective;

                const finishedForward =
                    instance.direction === 1 &&
                    localTime >= instance.duration;

                const finishedReverse =
                    instance.direction === -1 &&
                    localTime <= 0;

                if (finishedForward || finishedReverse) {
                    localTime =
                        instance.direction === 1
                            ? instance.duration
                            : 0;
                }

                instance.localTime = localTime;

                this._applyAnimation(instance, localTime);

                updated++;

                this._invoke(instance.onUpdate, {
                    instance,
                    widget: instance.widget,
                    progress:
                        instance.duration > 0
                            ? localTime / instance.duration
                            : 1,
                    animationSystem: this
                });

                if (finishedForward || finishedReverse) {
                    if (this._shouldLoop(instance)) {
                        instance.completedLoops++;

                        if (instance.pingPong) {
                            instance.direction *= -1;
                        }

                        instance.startTime = now;
                    } else {
                        this._invoke(instance.onComplete, {
                            instance,
                            widget: instance.widget,
                            animationSystem: this
                        });

                        this.active.delete(id);
                    }
                }
            }

            if (!this.active.size) {
                this._stopLoop();
            }

            return updated;
        }

        _applyAnimation(instance, localTime) {
            const widget = instance.widget;

            for (const track of instance.definition.tracks) {
                const value = this.evaluator?.evaluateTrack?.(
                    track,
                    localTime
                );

                if (value === undefined) continue;

                this._setProperty(widget, track.property, value);
            }

            widget.markDirty?.();

            if (
                widget._element &&
                typeof widget.applyElementState === 'function'
            ) {
                widget.applyElementState(widget._element);
            }
        }

        _setProperty(object, path, value) {
            if (!object || !path) return false;

            const parts = String(path).split('.').filter(Boolean);

            if (!parts.length) return false;

            if (parts.length === 1) {
                const property = parts[0];
                const setter =
                    `set${property.charAt(0).toUpperCase()}${property.slice(1)}`;

                if (typeof object[setter] === 'function') {
                    object[setter](value);
                    return true;
                }

                object[property] = value;
                return true;
            }

            let current = object;

            for (let i = 0; i < parts.length - 1; i++) {
                const key = parts[i];

                if (
                    current[key] == null ||
                    typeof current[key] !== 'object'
                ) {
                    current[key] = {};
                }

                current = current[key];
            }

            current[parts[parts.length - 1]] = value;

            return true;
        }

        _captureInitialState(widget, tracks) {
            const state = {};

            for (const track of tracks || []) {
                state[track.property] = this._getProperty(
                    widget,
                    track.property
                );
            }

            return state;
        }

        _restoreInitialState(instance) {
            for (const [path, value] of Object.entries(instance.initialState || {})) {
                this._setProperty(instance.widget, path, value);
            }
        }

        _getProperty(object, path) {
            const parts = String(path).split('.').filter(Boolean);
            let current = object;

            for (const part of parts) {
                if (current == null) return undefined;
                current = current[part];
            }

            if (
                current &&
                typeof current === 'object'
            ) {
                if (typeof structuredClone === 'function') {
                    try {
                        return structuredClone(current);
                    } catch (_) {}
                }

                try {
                    return JSON.parse(JSON.stringify(current));
                } catch (_) {}
            }

            return current;
        }

        _shouldLoop(instance) {
            if (!instance.loop) return false;

            return (
                instance.loopCount === Infinity ||
                instance.completedLoops + 1 < instance.loopCount
            );
        }

        _normalizeDefinition(name, definition) {
            if (!definition || typeof definition !== 'object') {
                return null;
            }

            const tracks = Array.isArray(definition.tracks)
                ? definition.tracks.filter(track =>
                    track &&
                    track.property &&
                    Array.isArray(track.keyframes)
                )
                : [];

            return {
                name: String(name),
                widgetId: definition.widgetId || null,
                tracks,
                duration:
                    Number(definition.duration) ||
                    this.evaluator?.getDuration?.(tracks) ||
                    0,
                delay: Number(definition.delay ?? 0),
                speed: Number(definition.speed ?? 1),
                loop: definition.loop ?? false,
                loopCount:
                    definition.loopCount == null
                        ? Infinity
                        : Number(definition.loopCount),
                pingPong: definition.pingPong ?? false,
                restoreOnStop: definition.restoreOnStop ?? false,

                onStart: definition.onStart || null,
                onUpdate: definition.onUpdate || null,
                onComplete: definition.onComplete || null
            };
        }

        _resolveWidget(widgetOrId) {
            if (!widgetOrId) return null;

            if (typeof widgetOrId === 'string') {
                return this.document?.getWidget?.(widgetOrId) || null;
            }

            return widgetOrId;
        }

        _invoke(callback, payload) {
            if (typeof callback !== 'function') return;

            try {
                callback(payload);
            } catch (error) {
                console.error('[UIAnimationSystem] Animation callback failed.', error);
            }
        }

        _ensureLoop() {
            if (this._running || !this.active.size) return;

            this._running = true;

            const loop = (time) => {
                if (!this._running) return;

                this.update(time);

                if (this._running) {
                    this._raf = requestAnimationFrame(loop);
                }
            };

            this._raf = requestAnimationFrame(loop);
        }

        _stopLoop() {
            this._running = false;

            if (this._raf) {
                cancelAnimationFrame(this._raf);
                this._raf = 0;
            }
        }
    }

    window.UIAnimationSystem = UIAnimationSystem;

    if (!window.uiAnimationSystem) {
        window.uiAnimationSystem = new UIAnimationSystem();
    }
})();