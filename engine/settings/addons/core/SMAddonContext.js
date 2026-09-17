(function () {
    'use strict';
    class SMAddonContext {
        constructor(manager, manifest) { this.manager = manager; this.manifest = manifest; this.id = manifest.id; this._cleanups = []; this._disposed = false; }
        get scene() { return window.scene || null; } get renderer() { return window.renderer || null; } get camera() { return window.cameraSystem?.activeCamera || window.camera || null; } get controls() { return window.controls || null; } get settings() { return window.EngineSettings || null; }
        pref(key, fallback = null) { return this.manager?.getPreference?.(this.id, key, fallback); }
        setPref(key, value) { return this.manager?.setPreference?.(this.id, key, value); }
        log(message, level = 'info', extra = null) { const order = { debug: 0, info: 1, warn: 2, error: 3, none: 99 }; const threshold = String(this.manager?.policy?.logLevel || 'info'); if ((order[level] ?? 1) < (order[threshold] ?? 1)) return; const args = [`[${this.manifest.name}] ${String(message ?? '')}`]; if (extra !== null && extra !== undefined) args.push(extra); if (window.SMConsolePanel?.push) { window.SMConsolePanel.push(level, args, { source: `Addon:${this.manifest.name}`, addonId: this.id }); return; } const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : level === 'debug' ? console.debug : console.info; fn(...args); }
        dispatch(name, detail = {}) { window.dispatchEvent(new CustomEvent(name, { detail: { addonId: this.id, ...detail } })); }
        cleanup(fn) { if (typeof fn === 'function') this._cleanups.push(fn); return fn; }
        on(target, name, fn, options) { if (!target?.addEventListener || typeof fn !== 'function') return null; target.addEventListener(name, fn, options); this.cleanup(() => target.removeEventListener(name, fn, options)); return fn; }
        onWindow(name, fn, options) { return this.on(window, name, fn, options); }
        interval(fn, ms) { const id = setInterval(fn, Math.max(16, Number(ms) || 1000)); this.cleanup(() => clearInterval(id)); return id; }
        timeout(fn, ms) { const id = setTimeout(fn, Math.max(0, Number(ms) || 0)); this.cleanup(() => clearTimeout(id)); return id; }
        frame(fn) { if (typeof fn !== 'function') return null; window.engineFrameCallbacks = Array.isArray(window.engineFrameCallbacks) ? window.engineFrameCallbacks : []; window.engineFrameCallbacks.push(fn); this.cleanup(() => { const a = window.engineFrameCallbacks; if (!Array.isArray(a)) return; const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); }); return fn; }
        dispose() { if (this._disposed) return; this._disposed = true; for (let i = this._cleanups.length - 1; i >= 0; i--) { try { this._cleanups[i](); } catch (e) { console.warn(`[SMAddonContext:${this.id}] cleanup failed:`, e); } } this._cleanups = []; }
    }
    window.SMAddonContext = SMAddonContext;
})();