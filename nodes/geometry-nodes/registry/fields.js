// ============================================================================
// FieldSystem v2 — small Blender-style field engine.
// A field is a lazy value evaluated for a geometry element/domain context.
// ============================================================================
(function (global) {
    'use strict';

    class GeometryField {
        constructor(type, evaluator, options = {}) {
            this.__geometryField = true;
            this.type = type || 'float';
            this.evaluator = typeof evaluator === 'function' ? evaluator : (() => evaluator);
            this.label = options.label || 'Field';
            this.domain = options.domain || 'POINT';
            this.isConstant = !!options.isConstant;
            this.constantValue = options.constantValue;
        }

        evaluate(context = {}) {
            if (this.isConstant) return this.constantValue;
            return this.evaluator(context);
        }

        map(type, fn, label) {
            return new GeometryField(type || this.type, ctx => fn(this.evaluate(ctx), ctx), {
                label: label || this.label,
                domain: this.domain
            });
        }

        static is(value) {
            return !!(value && value.__geometryField === true && typeof value.evaluate === 'function');
        }

        static constant(value, type = GeometryField.inferType(value), label = 'Constant') {
            return new GeometryField(type, null, {
                label,
                isConstant: true,
                constantValue: value
            });
        }

        static inferType(value) {
            if (typeof value === 'boolean') return 'boolean';
            if (Number.isInteger(value)) return 'integer';
            if (typeof value === 'number') return 'float';
            if (Array.isArray(value)) return value.length === 2 ? 'vector2' : 'vector';
            if (typeof value === 'string' && /^#/.test(value)) return 'color';
            return 'any';
        }
    }

    const FieldSystem = {
        isField: GeometryField.is,

        resolve(value, context = {}) {
            return GeometryField.is(value) ? value.evaluate(context) : value;
        },

        lift(type, fn, ...values) {
            const anyField = values.some(GeometryField.is);
            if (!anyField) return fn(...values);
            return new GeometryField(type, ctx => {
                const resolved = values.map(v => GeometryField.is(v) ? v.evaluate(ctx) : v);
                return fn(...resolved, ctx);
            }, { label: fn.name || 'Field Operation' });
        },

        liftWithContext(type, values, fn, label = 'Field Operation') {
            const anyField = values.some(GeometryField.is);
            if (!anyField) return fn(values, {});
            return new GeometryField(type, ctx => {
                const resolved = values.map(v => GeometryField.is(v) ? v.evaluate(ctx) : v);
                return fn(resolved, ctx);
            }, { label });
        },

        number(value, fallback = 0, context = {}) {
            const resolved = this.resolve(value, context);
            const n = Number(resolved);
            return Number.isFinite(n) ? n : fallback;
        },

        vector(value, fallback = [0, 0, 0], context = {}) {
            const resolved = this.resolve(value, context);
            if (Array.isArray(resolved)) {
                return [
                    Number(resolved[0]) || 0,
                    Number(resolved[1]) || 0,
                    Number(resolved[2]) || 0
                ];
            }
            const n = Number(resolved);
            if (Number.isFinite(n)) return [n, n, n];
            return [...fallback];
        },

        boolean(value, fallback = false, context = {}) {
            const resolved = this.resolve(value, context);
            return resolved == null ? fallback : !!resolved;
        },

        hash(seed, index = 0) {
            let x = Math.sin((Number(seed) || 0) * 12.9898 + (Number(index) || 0) * 78.233) * 43758.5453;
            return x - Math.floor(x);
        },

        noise3(x, y, z, seed = 0) {
            const xi = Number(x) || 0;
            const yi = Number(y) || 0;
            const zi = Number(z) || 0;
            const s = Number(seed) || 0;
            const n = Math.sin(xi * 12.9898 + yi * 78.233 + zi * 37.719 + s * 19.19) * 43758.5453;
            return n - Math.floor(n);
        }
    };

    global.GeometryField = GeometryField;
    global.FieldSystem = FieldSystem;
})(typeof window !== 'undefined' ? window : globalThis);