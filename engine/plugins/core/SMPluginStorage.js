(function () {
    'use strict';

    class SMPluginStorage {
        constructor(options = {}) {
            this.storageKey = options.storageKey || 'sm-engine-plugins-v1';
            this.state = { version: 1, plugins: {} };
            this.load();
        }

        load() {
            try {
                const raw = window.localStorage?.getItem(this.storageKey);
                const saved = raw ? JSON.parse(raw) : null;
                if (saved && typeof saved === 'object') {
                    this.state = {
                        version: 1,
                        plugins: saved.plugins && typeof saved.plugins === 'object'
                            ? saved.plugins
                            : {}
                    };
                }
            } catch (error) {
                console.warn('[SMPluginStorage] Could not restore plugin settings.', error);
            }
            return this.exportState();
        }

        save() {
            try {
                window.localStorage?.setItem(this.storageKey, JSON.stringify(this.state));
                return true;
            } catch (error) {
                console.warn('[SMPluginStorage] Could not save plugin settings.', error);
                return false;
            }
        }

        _record(id) {
            const key = String(id);
            if (!this.state.plugins[key]) {
                this.state.plugins[key] = { enabled: null, settings: {} };
            }
            const record = this.state.plugins[key];
            record.settings = record.settings && typeof record.settings === 'object'
                ? record.settings
                : {};
            return record;
        }

        getPluginState(id) {
            const record = this.state.plugins[String(id)];
            return record
                ? {
                    enabled: typeof record.enabled === 'boolean' ? record.enabled : null,
                    settings: { ...(record.settings || {}) }
                }
                : { enabled: null, settings: {} };
        }

        setEnabled(id, enabled) {
            const value = !!enabled;
            this._record(id).enabled = value;
            this.save();
            return value;
        }

        getSetting(id, key, fallback = null) {
            const settings = this.state.plugins[String(id)]?.settings;
            return settings && Object.prototype.hasOwnProperty.call(settings, key)
                ? settings[key]
                : fallback;
        }

        setSetting(id, key, value) {
            this._record(id).settings[String(key)] = value;
            this.save();
            return value;
        }

        reset(id) {
            delete this.state.plugins[String(id)];
            return this.save();
        }

        exportState() {
            return JSON.parse(JSON.stringify(this.state));
        }
    }

    window.SMPluginStorage = SMPluginStorage;
    window.smPluginStorage = window.smPluginStorage || new SMPluginStorage();
})();
