// ============================================================================
// NodeSocket v2 — Blender-like typed sockets for SM Geometry Nodes.
// Pure metadata / compatibility layer. No DOM dependencies.
// ============================================================================
(function (global) {
    'use strict';

    const SOCKET_COLORS = Object.freeze({
        geometry: '#8bc34a',
        material: '#d18bd1',
        float: '#b8b8b8',
        integer: '#9db7d9',
        vector: '#6aa6d9',
        vector2: '#6aa6d9',
        rotation: '#b58bd4',
        color: '#d8c25a',
        boolean: '#d87979',
        string: '#8eb2c9',
        object: '#ef8c63',
        collection: '#8e9fb3',
        matrix: '#9c8fbf',
        enum: '#888888',
        any: '#b0b0b0'
    });

    const COMPAT = Object.freeze({
        geometry: ['geometry'],
        material: ['material'],
        float: ['float', 'integer', 'boolean'],
        integer: ['integer', 'float', 'boolean'],
        vector: ['vector', 'vector2', 'color', 'float', 'integer', 'rotation'],
        vector2: ['vector2', 'vector', 'float', 'integer'],
        rotation: ['rotation', 'vector'],
        color: ['color', 'vector', 'float', 'integer'],
        boolean: ['boolean', 'float', 'integer'],
        string: ['string', 'enum'],
        object: ['object'],
        collection: ['collection'],
        matrix: ['matrix'],
        enum: ['enum', 'string'],
        any: ['geometry', 'material', 'float', 'integer', 'vector', 'vector2', 'rotation',
              'color', 'boolean', 'string', 'object', 'collection', 'matrix', 'enum', 'any']
    });

    class NodeSocket {
        constructor(name, type = 'any', options = {}) {
            this.name = String(name || 'Socket');
            this.type = type || 'any';
            this.default = options.default !== undefined ? options.default : null;
            this.min = options.min;
            this.max = options.max;
            this.step = options.step;
            this.opts = Array.isArray(options.opts) ? [...options.opts] : null;
            this.node = options.node || null;
            this.index = Number.isInteger(options.index) ? options.index : 0;
            this.hideValue = !!options.hideValue;
            this.multiInput = !!options.multiInput;
            this.optional = !!options.optional;
            this.domain = options.domain || null;
            this.description = options.description || '';
        }

        static color(type) {
            return SOCKET_COLORS[type] || SOCKET_COLORS.any;
        }

        static canConnect(fromType, toType) {
            if (fromType === 'any' || toType === 'any') return true;
            const allowed = COMPAT[toType] || [toType];
            return allowed.includes(fromType);
        }

        static convert(value, fromType, toType) {
            if (value == null || fromType === toType || toType === 'any') return value;

            if (toType === 'float') {
                if (Array.isArray(value)) return Number(value[0]) || 0;
                return Number(value) || 0;
            }

            if (toType === 'integer') {
                if (Array.isArray(value)) return Math.round(Number(value[0]) || 0);
                return Math.round(Number(value) || 0);
            }

            if (toType === 'boolean') return !!value;

            if (toType === 'vector' || toType === 'rotation') {
                if (Array.isArray(value)) return [
                    Number(value[0]) || 0,
                    Number(value[1]) || 0,
                    Number(value[2]) || 0
                ];
                const n = Number(value) || 0;
                return [n, n, n];
            }

            if (toType === 'vector2') {
                if (Array.isArray(value)) return [Number(value[0]) || 0, Number(value[1]) || 0];
                const n = Number(value) || 0;
                return [n, n];
            }

            if (toType === 'color') {
                if (typeof value === 'string') return value;
                if (Array.isArray(value)) return value.slice(0, 3);
                const n = Number(value) || 0;
                return [n, n, n];
            }

            return value;
        }

        clone(overrides = {}) {
            return new NodeSocket(
                overrides.name ?? this.name,
                overrides.type ?? this.type,
                {
                    default: overrides.default ?? this.default,
                    min: overrides.min ?? this.min,
                    max: overrides.max ?? this.max,
                    step: overrides.step ?? this.step,
                    opts: overrides.opts ?? this.opts,
                    node: overrides.node ?? this.node,
                    index: overrides.index ?? this.index,
                    hideValue: overrides.hideValue ?? this.hideValue,
                    multiInput: overrides.multiInput ?? this.multiInput,
                    optional: overrides.optional ?? this.optional,
                    domain: overrides.domain ?? this.domain,
                    description: overrides.description ?? this.description
                }
            );
        }

        toJSON() {
            return {
                name: this.name,
                type: this.type,
                default: this.default,
                min: this.min,
                max: this.max,
                step: this.step,
                opts: this.opts,
                hideValue: this.hideValue,
                multiInput: this.multiInput,
                optional: this.optional,
                domain: this.domain
            };
        }
    }

    global.NodeSocket = NodeSocket;
    global.SOCKET_COLORS = SOCKET_COLORS;
    global.GEOMETRY_NODE_SOCKET_COMPAT = COMPAT;
})(typeof window !== 'undefined' ? window : globalThis);