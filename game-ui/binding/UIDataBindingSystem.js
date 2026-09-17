/**
 * GAME-UI/binding/UIDataBindingSystem.js
 * ------------------------------------------------------------
 * Data-binding layer between Game UI widgets and runtime game state.
 *
 * Binding example:
 * widget.bindings.value = {
 *     source: 'player',
 *     path: 'health',
 *     mode: 'one-way',
 *     transform: 'percent'
 * };
 *
 * Supported:
 * - source registry
 * - nested paths
 * - one-way binding
 * - optional two-way write-back
 * - transforms / formatters
 * - polling updates with change detection
 */
(function () {
    'use strict';

    class UIDataBindingSystem {
        constructor(options = {}) {
            this.document = options.document || null;

            this.sources = new Map();
            this.transforms = new Map();

            this.enabled = options.enabled ?? true;
            this.autoUpdate = options.autoUpdate ?? false;
            this.updateInterval = Math.max(0, Number(options.updateInterval ?? 0));

            this._lastUpdate = 0;
            this._cache = new Map();
            this._raf = 0;
            this._running = false;

            this.registerDefaultTransforms();
        }

        setDocument(document) {
            this.document = document || null;
            this._cache.clear();
            return this;
        }

        setEnabled(state) {
            this.enabled = Boolean(state);
            return this;
        }

        registerSource(name, source) {
            if (!name) {
                throw new TypeError('UIDataBindingSystem.registerSource(name, source): name is required.');
            }

            this.sources.set(String(name), source);
            return this;
        }

        unregisterSource(name) {
            return this.sources.delete(String(name));
        }

        hasSource(name) {
            return this.sources.has(String(name));
        }

        getSource(name) {
            const source = this.sources.get(String(name));

            if (typeof source === 'function') {
                try {
                    return source();
                } catch (error) {
                    console.error(`[UIDataBindingSystem] Source provider "${name}" failed.`, error);
                    return null;
                }
            }

            return source ?? null;
        }

        registerTransform(name, transform) {
            if (!name || typeof transform !== 'function') {
                throw new TypeError('UIDataBindingSystem.registerTransform(name, transform): invalid arguments.');
            }

            this.transforms.set(String(name), transform);
            return this;
        }

        unregisterTransform(name) {
            return this.transforms.delete(String(name));
        }

        registerDefaultTransforms() {
            this.registerTransform('identity', (value) => value);

            this.registerTransform('string', (value) =>
                value == null ? '' : String(value)
            );

            this.registerTransform('number', (value) => {
                const number = Number(value);
                return Number.isFinite(number) ? number : 0;
            });

            this.registerTransform('integer', (value) => {
                const number = Number(value);
                return Number.isFinite(number) ? Math.round(number) : 0;
            });

            this.registerTransform('percent', (value, binding) => {
                const number = Number(value);
                if (!Number.isFinite(number)) return 0;

                const min = Number(binding.min ?? 0);
                const max = Number(binding.max ?? 100);
                const range = Math.max(0.000001, max - min);

                return Math.max(0, Math.min(100, ((number - min) / range) * 100));
            });

            this.registerTransform('clamp', (value, binding) => {
                const number = Number(value);
                if (!Number.isFinite(number)) return 0;

                const min = Number(binding.min ?? 0);
                const max = Number(binding.max ?? 1);

                return Math.max(min, Math.min(max, number));
            });

            this.registerTransform('boolean', (value) => Boolean(value));

            this.registerTransform('inverse-boolean', (value) => !Boolean(value));

            this.registerTransform('uppercase', (value) =>
                String(value ?? '').toUpperCase()
            );

            this.registerTransform('lowercase', (value) =>
                String(value ?? '').toLowerCase()
            );

            this.registerTransform('format', (value, binding) => {
                const template = binding.format || '{value}';

                return String(template)
                    .replaceAll('{value}', String(value ?? ''))
                    .replaceAll('{source}', String(binding.source ?? ''))
                    .replaceAll('{path}', String(binding.path ?? ''));
            });

            return this;
        }

        update(time = performance?.now?.() ?? Date.now()) {
            if (!this.enabled || !this.document) return 0;

            if (
                this.updateInterval > 0 &&
                time - this._lastUpdate < this.updateInterval
            ) {
                return 0;
            }

            this._lastUpdate = time;

            let changed = 0;

            this.document.traverse?.((widget) => {
                changed += this.updateWidget(widget);
            });

            return changed;
        }

        updateWidget(widget) {
            if (!widget || !widget.bindings) return 0;

            let changed = 0;

            for (const [property, binding] of Object.entries(widget.bindings)) {
                if (!binding || binding.enabled === false) continue;

                const value = this.evaluateBinding(binding, widget);

                if (value === UIDataBindingSystem.UNRESOLVED) {
                    continue;
                }

                const cacheKey = `${widget.id}:${property}`;
                const previous = this._cache.get(cacheKey);

                if (!this._isEqual(previous, value)) {
                    this._cache.set(cacheKey, this._cloneForCache(value));
                    this.applyValue(widget, property, value);
                    changed++;
                }
            }

            if (changed > 0) {
                widget.markDirty?.();

                if (widget._element && typeof widget.applyElementState === 'function') {
                    widget.applyElementState(widget._element);
                }
            }

            return changed;
        }

        evaluateBinding(binding, widget = null) {
            if (typeof binding === 'function') {
                try {
                    return binding({
                        widget,
                        bindingSystem: this
                    });
                } catch (error) {
                    console.error('[UIDataBindingSystem] Functional binding failed.', error);
                    return UIDataBindingSystem.UNRESOLVED;
                }
            }

            if (typeof binding === 'string') {
                binding = {
                    source: 'global',
                    path: binding
                };
            }

            if (!binding || typeof binding !== 'object') {
                return UIDataBindingSystem.UNRESOLVED;
            }

            let source;

            if (binding.source === 'global') {
                source = window;
            } else if (binding.sourceObject !== undefined) {
                source = binding.sourceObject;
            } else {
                source = this.getSource(binding.source);
            }

            if (source == null) {
                if (binding.fallback !== undefined) {
                    return binding.fallback;
                }

                return UIDataBindingSystem.UNRESOLVED;
            }

            let value = binding.path
                ? this.getPath(source, binding.path)
                : source;

            if (value === undefined && binding.fallback !== undefined) {
                value = binding.fallback;
            }

            value = this.applyTransform(value, binding, widget);

            return value;
        }

        applyTransform(value, binding, widget = null) {
            if (!binding) return value;

            if (typeof binding.transform === 'function') {
                try {
                    return binding.transform(value, binding, widget, this);
                } catch (error) {
                    console.error('[UIDataBindingSystem] Inline transform failed.', error);
                    return value;
                }
            }

            if (typeof binding.transform === 'string') {
                const transform = this.transforms.get(binding.transform);

                if (transform) {
                    try {
                        value = transform(value, binding, widget, this);
                    } catch (error) {
                        console.error(
                            `[UIDataBindingSystem] Transform "${binding.transform}" failed.`,
                            error
                        );
                    }
                }
            }

            if (binding.format && binding.transform !== 'format') {
                value = String(binding.format)
                    .replaceAll('{value}', String(value ?? ''));
            }

            return value;
        }

        applyValue(widget, property, value) {
            if (!widget || !property) return false;

            const setterName = `set${property.charAt(0).toUpperCase()}${property.slice(1)}`;

            if (typeof widget[setterName] === 'function') {
                widget[setterName](value);
                return true;
            }

            if (property.includes('.')) {
                return this.setPath(widget, property, value);
            }

            widget[property] = value;
            return true;
        }

        writeBack(widget, property, value) {
            const binding = widget?.bindings?.[property];

            if (!binding || typeof binding !== 'object') return false;

            const mode = binding.mode || 'one-way';

            if (mode !== 'two-way' && mode !== 'one-way-to-source') {
                return false;
            }

            let source;

            if (binding.source === 'global') {
                source = window;
            } else if (binding.sourceObject !== undefined) {
                source = binding.sourceObject;
            } else {
                source = this.getSource(binding.source);
            }

            if (!source || !binding.path) return false;

            return this.setPath(source, binding.path, value);
        }

        getPath(object, path) {
            if (!path) return object;

            const parts = this._parsePath(path);
            let current = object;

            for (const part of parts) {
                if (current == null) return undefined;
                current = current[part];
            }

            return current;
        }

        setPath(object, path, value) {
            if (!object || !path) return false;

            const parts = this._parsePath(path);
            if (!parts.length) return false;

            let current = object;

            for (let i = 0; i < parts.length - 1; i++) {
                const part = parts[i];

                if (
                    current[part] == null ||
                    typeof current[part] !== 'object'
                ) {
                    current[part] = {};
                }

                current = current[part];
            }

            current[parts[parts.length - 1]] = value;
            return true;
        }

        start() {
            if (this._running) return this;

            this._running = true;

            const loop = (time) => {
                if (!this._running) return;

                this.update(time);
                this._raf = requestAnimationFrame(loop);
            };

            this._raf = requestAnimationFrame(loop);
            return this;
        }

        stop() {
            this._running = false;

            if (this._raf) {
                cancelAnimationFrame(this._raf);
                this._raf = 0;
            }

            return this;
        }

        clearCache() {
            this._cache.clear();
            return this;
        }

        _parsePath(path) {
            return String(path)
                .replace(/\[(\w+)\]/g, '.$1')
                .replace(/^\./, '')
                .split('.')
                .filter(Boolean);
        }

        _isEqual(a, b) {
            if (Object.is(a, b)) return true;

            if (
                a &&
                b &&
                typeof a === 'object' &&
                typeof b === 'object'
            ) {
                try {
                    return JSON.stringify(a) === JSON.stringify(b);
                } catch (_) {
                    return false;
                }
            }

            return false;
        }

        _cloneForCache(value) {
            if (!value || typeof value !== 'object') {
                return value;
            }

            if (typeof structuredClone === 'function') {
                try {
                    return structuredClone(value);
                } catch (_) {}
            }

            try {
                return JSON.parse(JSON.stringify(value));
            } catch (_) {
                return value;
            }
        }
    }

    UIDataBindingSystem.UNRESOLVED = Symbol('UI_DATA_BINDING_UNRESOLVED');

    window.UIDataBindingSystem = UIDataBindingSystem;

    if (!window.uiDataBindingSystem) {
        window.uiDataBindingSystem = new UIDataBindingSystem();
    }
})();