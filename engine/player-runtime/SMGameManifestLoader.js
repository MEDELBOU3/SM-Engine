(function () {
    'use strict';
    class SMGameManifestLoader {
        constructor(options = {}) {
            this.baseURL = String(options.baseURL || './');
            this.manifestURL = String(options.manifestURL || 'game.manifest.json');
            this.manifest = null;
            this.loading = null;
            this.cache = new Map();
        }
        async load(url = this.manifestURL, options = {}) {
            if (this.loading && !options.force) return await this.loading;
            const resolved = this.resolve(url);
            this.loading = this.loadJSON(resolved, { cache: options.cache !== false }).then(data => {
                this.validate(data);
                this.manifest = data;
                this.manifestURL = url;
                this.baseURL = this._directory(resolved);
                window.dispatchEvent(new CustomEvent('sm:game-manifest-loaded', { detail: { loader: this, manifest: data, url: resolved } }));
                return data;
            }).finally(() => { this.loading = null; });
            return await this.loading;
        }
        async loadJSON(url, options = {}) {
            const resolved = this.resolve(url);
            if (options.cache !== false && this.cache.has(resolved)) return this._clone(this.cache.get(resolved));
            const response = await fetch(resolved, { cache: options.browserCache || 'default' });
            if (!response.ok) throw new Error(`Failed to load JSON "${resolved}" (${response.status}).`);
            const data = await response.json();
            if (options.cache !== false) this.cache.set(resolved, this._clone(data));
            return data;
        }
        validate(manifest) {
            if (!manifest || typeof manifest !== 'object') throw new Error('Invalid SM game manifest.');
            if (manifest.schema && manifest.schema !== 'sm-build-manifest') console.warn(`[SMGameManifestLoader] Unexpected manifest schema "${manifest.schema}".`);
            if (!Array.isArray(manifest.assets)) manifest.assets = [];
            if (!Array.isArray(manifest.levels)) manifest.levels = [];
            if (!Array.isArray(manifest.prefabs)) manifest.prefabs = [];
            if (!Array.isArray(manifest.runtime)) manifest.runtime = [];
            return true;
        }
        resolve(path) {
            const value = String(path || '');
            if (!value) return this.baseURL;
            if (/^(?:https?:|blob:|data:|file:)/i.test(value)) return value;
            try { return new URL(value, this._absoluteBase()).href; } catch { return value; }
        }
        getAsset(idOrPath) {
            const value = String(idOrPath || '');
            return this.manifest?.assets?.find(asset => asset.id === value || asset.path === value || asset.source === value) || null;
        }
        getLevel(id) {
            return this.manifest?.levels?.find(level => String(level.id) === String(id)) || null;
        }
        getPrefab(id) {
            return this.manifest?.prefabs?.find(prefab => String(prefab.id) === String(id)) || null;
        }
        getStartLevel() {
            return this.manifest?.startLevel || this.manifest?.config?.startLevel || null;
        }
        clearCache() {
            this.cache.clear();
        }
        _absoluteBase() {
            try { return new URL(this.baseURL, document.baseURI).href; } catch { return document.baseURI; }
        }
        _directory(url) {
            try {
                const value = new URL(url, document.baseURI);
                value.pathname = value.pathname.slice(0, value.pathname.lastIndexOf('/') + 1);
                value.search = '';
                value.hash = '';
                return value.href;
            } catch { return './'; }
        }
        _clone(value) {
            try { return structuredClone(value); } catch { }
            try { return JSON.parse(JSON.stringify(value)); } catch { return value; }
        }
        debug() {
            const state = { baseURL: this.baseURL, manifestURL: this.manifestURL, loaded: !!this.manifest, assets: this.manifest?.assets?.length || 0, levels: this.manifest?.levels?.length || 0, prefabs: this.manifest?.prefabs?.length || 0, startLevel: this.getStartLevel() };
            console.log('[SMGameManifestLoader]', state);
            return state;
        }
    }
    window.SMGameManifestLoader = SMGameManifestLoader;
    window.SMGameManifestLoaderClass = SMGameManifestLoader;
})();