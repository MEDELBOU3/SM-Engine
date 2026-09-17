// ============================================================================
// NodeRegistry v2 — shared, headless definition registry.
// ============================================================================
(function (global) {
    'use strict';

    class NodeRegistry {
        constructor() {
            this.types = Object.create(null);
            this.changedListeners = new Set();
        }

        register(def) {
            if (!def || !def.type) throw new Error('NodeRegistry.register requires a .type');
            const normalized = {
                category: 'Misc',
                color: '#666666',
                inputs: [],
                outputs: [],
                ...def
            };
            this.types[normalized.type] = normalized;
            this._emit('register', normalized);
            return this;
        }

        registerMany(defs = []) {
            defs.forEach(def => this.register(def));
            return this;
        }

        unregister(type) {
            const existing = this.types[type] || null;
            delete this.types[type];
            if (existing) this._emit('unregister', existing);
            return existing;
        }

        get(type) { return this.types[type] || null; }
        has(type) { return !!this.types[type]; }
        all() { return Object.values(this.types); }

        listByCategory() {
            const out = {};
            this.all()
                .sort((a, b) => String(a.displayName || a.type).localeCompare(String(b.displayName || b.type)))
                .forEach(def => {
                    const category = def.category || 'Misc';
                    (out[category] = out[category] || []).push(def);
                });
            return out;
        }

        search(query = '') {
            const q = String(query).trim().toLowerCase();
            if (!q) return this.all();
            return this.all().filter(def => {
                const hay = [
                    def.type,
                    def.displayName,
                    def.category,
                    def.description,
                    ...(def.tags || [])
                ].join(' ').toLowerCase();
                return hay.includes(q);
            });
        }

        onChanged(fn) {
            if (typeof fn === 'function') this.changedListeners.add(fn);
            return () => this.changedListeners.delete(fn);
        }

        _emit(action, def) {
            this.changedListeners.forEach(fn => {
                try { fn(action, def); } catch (_) {}
            });
        }

        clear() {
            this.types = Object.create(null);
            this._emit('clear', null);
        }
    }

    let _registryInstance = null;
    function getRegistry() {
        if (!_registryInstance) _registryInstance = new NodeRegistry();
        return _registryInstance;
    }

    global.NodeRegistry = NodeRegistry;
    global.getGeometryNodeRegistry = getRegistry;
    global.GeoNodeRegistry = getRegistry();
})(typeof window !== 'undefined' ? window : globalThis);