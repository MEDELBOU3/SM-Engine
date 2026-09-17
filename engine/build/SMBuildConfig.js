(function () {
    'use strict';
    class SMBuildConfig {
        constructor(data = {}) {
            const d = SMBuildConfig.defaults();
            this.name = String(data.name ?? d.name);
            this.version = String(data.version ?? d.version);
            this.target = String(data.target ?? d.target).toLowerCase();
            this.startLevel = data.startLevel ?? d.startLevel;
            this.outputPath = String(data.outputPath ?? d.outputPath);
            this.development = Boolean(data.development ?? d.development);
            this.fullscreen = Boolean(data.fullscreen ?? d.fullscreen);
            this.resolution = { ...d.resolution, ...(data.resolution || {}) };
            this.assets = { ...d.assets, ...(data.assets || {}) };
            this.runtime = { ...d.runtime, ...(data.runtime || {}) };
            this.optimization = { ...d.optimization, ...(data.optimization || {}) };
            this.packaging = { ...d.packaging, ...(data.packaging || {}) };
            this.metadata = { ...d.metadata, ...(data.metadata || {}) };
            this.custom = { ...(data.custom || {}) };
            this._normalize();
        }
        static defaults() {
            return { name: 'SM Game', version: '1.0.0', target: 'web', startLevel: null, outputPath: 'dist', development: false, fullscreen: true, resolution: { width: 1920, height: 1080, devicePixelRatio: 'auto', allowResize: true }, assets: { removeUnused: true, includeExternal: true, compress: true, useCache: true, hashNames: false, maxInlineBytes: 0 }, runtime: { includeEditor: false, includeDebug: false, includeSourceMaps: false, minify: false }, optimization: { deduplicate: true, stripEditorMetadata: true, stripUnusedComponents: true }, packaging: { zip: true, zipName: null, generateManifest: true, generateAssetManifest: true }, metadata: { engine: 'SM Engine' }, custom: {} };
        }
        merge(patch = {}) {
            const next = this.toJSON();
            for (const [key, value] of Object.entries(patch || {})) {
                if (value && typeof value === 'object' && !Array.isArray(value) && next[key] && typeof next[key] === 'object' && !Array.isArray(next[key])) next[key] = { ...next[key], ...value };
                else next[key] = value;
            }
            return this.from(next);
        }
        from(data = {}) {
            Object.assign(this, new SMBuildConfig(data));
            return this;
        }
        clone() {
            return new SMBuildConfig(this.toJSON());
        }
        setTarget(target) {
            this.target = String(target || 'web').toLowerCase();
            this._normalize();
            return this.target;
        }
        setStartLevel(levelOrId) {
            this.startLevel = levelOrId?.id || levelOrId || null;
            return this.startLevel;
        }
        setResolution(width, height, options = {}) {
            this.resolution.width = Math.max(1, Math.trunc(Number(width) || 1920));
            this.resolution.height = Math.max(1, Math.trunc(Number(height) || 1080));
            Object.assign(this.resolution, options || {});
            return { ...this.resolution };
        }
        getZipName() {
            if (this.packaging.zipName) return String(this.packaging.zipName);
            const safe = this.name.trim().replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '') || 'SM-Game';
            return `${safe}-${this.version}.zip`;
        }
        validateBasic() {
            const errors = [];
            const warnings = [];
            if (!this.name.trim()) errors.push('Build name is required.');
            if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(this.version)) warnings.push(`Version "${this.version}" is not standard semantic versioning.`);
            if (!['web', 'electron'].includes(this.target)) errors.push(`Unsupported build target "${this.target}".`);
            if (!this.startLevel) warnings.push('No startLevel is configured.');
            if (!this.outputPath.trim()) errors.push('outputPath cannot be empty.');
            if (!Number.isFinite(Number(this.resolution.width)) || Number(this.resolution.width) <= 0) errors.push('Resolution width must be greater than zero.');
            if (!Number.isFinite(Number(this.resolution.height)) || Number(this.resolution.height) <= 0) errors.push('Resolution height must be greater than zero.');
            return { ok: errors.length === 0, errors, warnings };
        }
        toJSON() {
            return { name: this.name, version: this.version, target: this.target, startLevel: this.startLevel, outputPath: this.outputPath, development: this.development, fullscreen: this.fullscreen, resolution: { ...this.resolution }, assets: { ...this.assets }, runtime: { ...this.runtime }, optimization: { ...this.optimization }, packaging: { ...this.packaging }, metadata: { ...this.metadata }, custom: this._clone(this.custom) };
        }
        _normalize() {
            this.resolution.width = Math.max(1, Math.trunc(Number(this.resolution.width) || 1920));
            this.resolution.height = Math.max(1, Math.trunc(Number(this.resolution.height) || 1080));
            this.outputPath = this.outputPath.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '') || 'dist';
            this.target = ['web', 'electron'].includes(this.target) ? this.target : 'web';
            this.assets.removeUnused = this.assets.removeUnused !== false;
            this.assets.includeExternal = this.assets.includeExternal !== false;
            this.assets.compress = this.assets.compress !== false;
            this.assets.useCache = this.assets.useCache !== false;
            this.assets.hashNames = this.assets.hashNames === true;
            this.runtime.includeEditor = this.runtime.includeEditor === true;
            this.runtime.includeDebug = this.runtime.includeDebug === true;
            this.runtime.includeSourceMaps = this.runtime.includeSourceMaps === true;
            this.runtime.minify = this.runtime.minify === true;
        }
        _clone(value) {
            try { return structuredClone(value); } catch { }
            try { return JSON.parse(JSON.stringify(value)); } catch { return value; }
        }
        debug() {
            const state = this.toJSON();
            console.log('[SMBuildConfig]', state);
            return state;
        }
    }
    window.SMBuildConfig = SMBuildConfig;
    window.SMBuildConfigClass = SMBuildConfig;
})();