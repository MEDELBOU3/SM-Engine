(function () {
    'use strict';
    const ID_RE = /^[a-z0-9][a-z0-9._-]{2,80}$/i;
    class SMAddonRegistry {
        constructor() { this._entries = new Map(); }
        _pref(p) { if (!p || typeof p !== 'object' || !p.id) return null; const type = ['boolean', 'number', 'string', 'select'].includes(p.type) ? p.type : 'string'; return { id: String(p.id), label: String(p.label || p.id), type, default: p.default ?? (type === 'boolean' ? false : type === 'number' ? 0 : ''), min: p.min, max: p.max, step: p.step, options: Array.isArray(p.options) ? p.options : [], description: String(p.description || '') }; }
        _manifest(m) { const id = String(m?.id || '').trim(); if (!ID_RE.test(id)) throw new Error(`Invalid add-on id "${id}".`); return { id, name: String(m.name || id), version: String(m.version || '1.0.0'), author: String(m.author || 'SM Engine'), description: String(m.description || ''), category: String(m.category || 'General'), icon: String(m.icon || 'fa-solid fa-puzzle-piece'), builtIn: m.builtIn !== false, experimental: m.experimental === true, defaultEnabled: m.defaultEnabled === true, capabilities: Array.isArray(m.capabilities) ? [...m.capabilities] : [], preferences: Array.isArray(m.preferences) ? m.preferences.map(x => this._pref(x)).filter(Boolean) : [], commands: Array.isArray(m.commands) ? m.commands.filter(x => x?.id).map(x => ({ id: String(x.id), label: String(x.label || x.id), description: String(x.description || '') })) : [] }; }
        register(manifest, factory) { if (typeof factory !== 'function') throw new TypeError('Add-on factory must be a function.'); const m = this._manifest(manifest); const e = { manifest: m, factory }; this._entries.set(m.id, e); window.dispatchEvent(new CustomEvent('sm:addon-registered', { detail: { id: m.id, manifest: m } })); return e; }
        unregister(id) { id = String(id); const ok = this._entries.delete(id); if (ok) window.dispatchEvent(new CustomEvent('sm:addon-unregistered', { detail: { id } })); return ok; }
        get(id) { return this._entries.get(String(id)) || null; }
        has(id) { return this._entries.has(String(id)); }
        list() { return Array.from(this._entries.values()).sort((a, b) => a.manifest.name.localeCompare(b.manifest.name)); }
        categories() { return Array.from(new Set(this.list().map(e => e.manifest.category))).sort(); }
    }
    window.SMAddonRegistry = window.SMAddonRegistry || new SMAddonRegistry();
    window.SMAddonRegistryClass = SMAddonRegistry;
})();