(function () {
    'use strict';
    class SMAddonStorage {
        constructor(options = {}) { this.storageKey = options.storageKey || 'sm-engine-addons-v1'; this.state = { version: 1, addons: {} }; this.load(); }
        load() { try { const raw = localStorage.getItem(this.storageKey); const p = raw ? JSON.parse(raw) : null; if (p && typeof p === 'object') this.state = { version: 1, addons: p.addons && typeof p.addons === 'object' ? p.addons : {} }; } catch (e) { console.warn('[SMAddonStorage] restore failed:', e); } return this.state; }
        save() { try { localStorage.setItem(this.storageKey, JSON.stringify(this.state)); return true; } catch (e) { console.warn('[SMAddonStorage] save failed:', e); return false; } }
        _ensure(id) { if (!this.state.addons[id]) this.state.addons[id] = { enabled: null, prefs: {} }; const r = this.state.addons[id]; r.prefs = r.prefs && typeof r.prefs === 'object' ? r.prefs : {}; return r; }
        getAddonState(id) { const r = this.state.addons[id]; return r ? { enabled: typeof r.enabled === 'boolean' ? r.enabled : null, prefs: { ...(r.prefs || {}) } } : { enabled: null, prefs: {} }; }
        setEnabled(id, enabled) { const r = this._ensure(id); r.enabled = !!enabled; this.save(); return r.enabled; }
        getPreference(id, key, fallback = null) { const r = this.state.addons[id]; return !r || !r.prefs || !Object.prototype.hasOwnProperty.call(r.prefs, key) ? fallback : r.prefs[key]; }
        setPreference(id, key, value) { const r = this._ensure(id); r.prefs[key] = value; this.save(); return value; }
        setPreferences(id, values) { const r = this._ensure(id); r.prefs = { ...r.prefs, ...(values || {}) }; this.save(); return { ...r.prefs }; }
        resetAddon(id) { delete this.state.addons[id]; this.save(); }
        exportState() { return JSON.parse(JSON.stringify(this.state)); }
    }
    window.SMAddonStorage = SMAddonStorage;
    window.smAddonStorage = window.smAddonStorage || new SMAddonStorage();
})();