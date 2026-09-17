// ============================================================
// engine/settings/settings-store.js
//
// Core settings registry + persistence. This is the single source
// of truth for every editor preference:
//
//   - schema (id -> { type, group, default }) 
//   - value storage (in-memory + localStorage `sm-engine-preferences`)
//   - per-setting applier wiring (an applier mutates *engine*
//     state, e.g. window.renderer / window.camera / window.controls)
//   - change notification (UI subscribes via onChange)
//
// Plain classic-script file like the rest of engine/*.js. Exposes
// the class as window.SettingsStore and a ready-made singleton as
// window.EngineSettingsStore so feature files and the settings UI
// both talk to the same instance.
// ============================================================

(function () {
    class SettingsStore {
        constructor() {
            this._schema = new Map();   // id -> { type, group, default }
            this._appliers = new Map(); // id -> fn(value, ctx)
            this._values = {};          // id -> current value
            this._listeners = new Set();// fn(id, value)
            this._storageKey = 'sm-engine-preferences';
            this._loadedIds = new Set();
            this._explicitIds = new Set();
        }

        // ----------------------------------------------------------
        // Schema / registration
        // ----------------------------------------------------------

        /**
         * Define a setting entry. `type` may be 'boolean' | 'number'
         * | 'string'. `group` is informational (which UI section owns
         * it). `default` is used when nothing is stored yet.
         */
        define(id, { type = 'string', group = '', default: def = null } = {}) {
            this._schema.set(id, {
                type,
                group,
                default: def !== null ? def : this._coerce(def, type)
            });
            if (!(id in this._values)) {
                this._values[id] = this._schema.get(id).default;
            }
            return this;
        }

        /** Attach an applier fn(value, ctx) for a setting id. */
        registerApplier(id, fn) {
            if (typeof fn === 'function') this._appliers.set(id, fn);
            return this;
        }

        has(id) {
            return this._schema.has(id);
        }

        coerce(id, value) {
            const def = this._schema.get(id);
            return def ? this._coerce(value, def.type) : value;
        }

        _coerce(value, type) {
            switch (type) {
                case 'boolean':
                    return value === true || value === 'true' || value === 'on' || value === 1 || value === '1';
                case 'number':
                    {
                        const n = Number(value);
                        return Number.isFinite(n) ? n : 0;
                    }
                default:
                    return String(value ?? '');
            }
        }

        // ------------------------------------------------------------
        // Read
        // ----------------------------------------------------------

        get(id) {
            return id in this._values
                ? this._values[id]
                : (this._schema.get(id)?.default ?? null);
        }

        getAll() {
            return { ...this._values };
        }

        /** True when a value came from persistence or an explicit user set. */
        isConfigured(id) {
            return this._loadedIds.has(id) || this._explicitIds.has(id);
        }

        getSchema() {
            return Object.fromEntries(this._schema);
        }

        // ------------------------------------------------------------
        // Write + apply + persist
        // ----------------------------------------------------------

        set(id, value) {
            if (!this._schema.has(id)) return value;
            const coerced = this.coerce(id, value);
            this._values[id] = coerced;
            this._explicitIds.add(id);
            this._applyApplier(id, coerced);
            this._save();
            this._notify(id, coerced);
            return coerced;
        }

        /** Set without applying/persisting (used during restore/build). */
        setRaw(id, value) {
            if (!this._schema.has(id)) return;
            this._values[id] = this.coerce(id, value);
        }

        apply(id) {
            if (!(id in this._values)) return;
            this._applyApplier(id, this._values[id]);
        }

        applyAll() {
            // Apply in a stable order (groups in registration order).
            this._schema.forEach((def, id) => {
                if (id in this._values) this._applyApplier(id, this._values[id]);
            });
        }

        reset(id) {
            if (!this._schema.has(id)) return;
            const def = this._schema.get(id);
            this.set(id, def.default);
        }

        _applyApplier(id, value) {
            const fn = this._appliers.get(id);
            if (typeof fn === 'function') {
                try {
                    fn(value, {
                        store: this,
                        get: (oid) => this.get(oid),
                        isConfigured: (oid) => this.isConfigured(oid)
                    });
                } catch (err) {
                    console.warn(`[SettingsStore] applier "${id}" failed:`, err);
                }
            }
        }

        // ------------------------------------------------------------
        // Persistence
        // ----------------------------------------------------------

        _save() {
            try {
                localStorage.setItem(this._storageKey, JSON.stringify(this._values));
            } catch (err) {
                console.warn('[SettingsStore] could not save preferences:', err);
            }
        }

        /**
         * Load persisted values then (optionally) apply them to the
         * engine. Appliers are skipped by default here so the UI can
         * sync first; call applyAll() when the engine is ready.
         */
        restore({ apply = false } = {}) {
            let loaded = {};
            try {
                const raw = localStorage.getItem(this._storageKey);
                if (raw) loaded = JSON.parse(raw) || {};
            } catch (err) {
                console.warn('[SettingsStore] could not restore preferences:', err);
            }

            this._loadedIds = new Set(Object.keys(loaded));
            this._explicitIds.clear();

            // Backfill everything from schema first (defaults).
            this._values = {};
            this._schema.forEach((def, id) => {
                this._values[id] = def.default;
                if (id in loaded) this._values[id] = this.coerce(id, loaded[id]);
            });

            if (apply) this.applyAll();
            return loaded;
        }

        // ------------------------------------------------------------
        // Change notification
        // ----------------------------------------------------------

        onChange(cb) {
            if (typeof cb === 'function') this._listeners.add(cb);
            return () => this._listeners.delete(cb);
        }

        _notify(id, value) {
            this._listeners.forEach((cb) => {
                try { cb(id, value); } catch (err) { console.warn('[SettingsStore] listener error:', err); }
            });
        }
    }

    window.SettingsStore = SettingsStore;

    const singleton = new SettingsStore();
    window.EngineSettingsStore = singleton;
    window.settingsEngine = singleton;
})();
