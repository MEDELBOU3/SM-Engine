(function () {
    'use strict';
    class SMBuildManifest {
        constructor(config = {}, options = {}) {
            this.schema = 'sm-build-manifest';
            this.schemaVersion = 1;
            this.buildId = String(options.buildId || `build-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
            this.createdAt = Number(options.createdAt || Date.now());
            this.engine = String(options.engine || 'SM Engine');
            this.config = config?.toJSON ? config.toJSON() : this._clone(config || {});
            this.startLevel = this.config.startLevel || null;
            this.files = [];
            this.assets = [];
            this.levels = [];
            this.prefabs = [];
            this.runtime = [];
            this.dependencies = {};
            this.statistics = { files: 0, assets: 0, levels: 0, prefabs: 0, bytes: 0, cookedBytes: 0, cacheHits: 0, cacheMisses: 0 };
            this.metadata = { ...(options.metadata || {}) };
            this.warnings = [];
        }
        addFile(file = {}) {
            const path = this._path(file.path || file.name);
            if (!path) throw new Error('SMBuildManifest.addFile() requires file.path.');
            const record = { path, type: String(file.type || 'file'), size: Math.max(0, Number(file.size || 0)), hash: file.hash || null, source: file.source || null, metadata: { ...(file.metadata || {}) } };
            const index = this.files.findIndex(item => item.path === path);
            if (index >= 0) this.files[index] = record;
            else this.files.push(record);
            this._recalculate();
            return record;
        }
        addAsset(asset = {}) {
            const id = String(asset.id || asset.key || asset.path || '');
            if (!id) throw new Error('SMBuildManifest.addAsset() requires id/path.');
            const record = { id, path: this._path(asset.outputPath || asset.path || id), source: asset.source || asset.path || null, type: String(asset.type || 'asset'), size: Math.max(0, Number(asset.size || 0)), cookedSize: Math.max(0, Number(asset.cookedSize ?? asset.size ?? 0)), hash: asset.hash || null, dependencies: Array.isArray(asset.dependencies) ? [...asset.dependencies] : [], metadata: { ...(asset.metadata || {}) } };
            const index = this.assets.findIndex(item => item.id === id);
            if (index >= 0) this.assets[index] = record;
            else this.assets.push(record);
            this.dependencies[id] = [...record.dependencies];
            this._recalculate();
            return record;
        }
        addLevel(level = {}) {
            const id = String(level.id || level.name || '');
            if (!id) throw new Error('SMBuildManifest.addLevel() requires level.id.');
            const record = { id, name: String(level.name || id), path: this._path(level.path || `levels/${id}.json`), persistent: level.persistent === true, type: String(level.type || 'level'), dependencies: Array.isArray(level.dependencies) ? [...level.dependencies] : [], metadata: { ...(level.metadata || {}) } };
            const index = this.levels.findIndex(item => item.id === id);
            if (index >= 0) this.levels[index] = record;
            else this.levels.push(record);
            this._recalculate();
            return record;
        }
        addPrefab(prefab = {}) {
            const id = String(prefab.id || prefab.name || '');
            if (!id) throw new Error('SMBuildManifest.addPrefab() requires prefab.id.');
            const record = { id, name: String(prefab.name || id), path: this._path(prefab.path || `prefabs/${id}.json`), dependencies: Array.isArray(prefab.dependencies) ? [...prefab.dependencies] : [], metadata: { ...(prefab.metadata || {}) } };
            const index = this.prefabs.findIndex(item => item.id === id);
            if (index >= 0) this.prefabs[index] = record;
            else this.prefabs.push(record);
            this._recalculate();
            return record;
        }
        addRuntimeFile(path, metadata = {}) {
            const normalized = this._path(path);
            if (!normalized) return null;
            const existing = this.runtime.find(item => item.path === normalized);
            if (existing) return existing;
            const record = { path: normalized, metadata: { ...(metadata || {}) } };
            this.runtime.push(record);
            return record;
        }
        addWarning(message) {
            const value = String(message || '').trim();
            if (value && !this.warnings.includes(value)) this.warnings.push(value);
            return value;
        }
        setCacheStats(hits = 0, misses = 0) {
            this.statistics.cacheHits = Math.max(0, Number(hits) || 0);
            this.statistics.cacheMisses = Math.max(0, Number(misses) || 0);
            return this.statistics;
        }
        finalize() {
            this.files.sort((a, b) => a.path.localeCompare(b.path));
            this.assets.sort((a, b) => a.path.localeCompare(b.path));
            this.levels.sort((a, b) => a.id.localeCompare(b.id));
            this.prefabs.sort((a, b) => a.id.localeCompare(b.id));
            this.runtime.sort((a, b) => a.path.localeCompare(b.path));
            this._recalculate();
            this.metadata.finalizedAt = Date.now();
            return this;
        }
        toJSON() {
            this._recalculate();
            return { schema: this.schema, schemaVersion: this.schemaVersion, buildId: this.buildId, createdAt: this.createdAt, engine: this.engine, config: this._clone(this.config), startLevel: this.startLevel, files: this._clone(this.files), assets: this._clone(this.assets), levels: this._clone(this.levels), prefabs: this._clone(this.prefabs), runtime: this._clone(this.runtime), dependencies: this._clone(this.dependencies), statistics: { ...this.statistics }, metadata: this._clone(this.metadata), warnings: [...this.warnings] };
        }
        toString(pretty = true) {
            return JSON.stringify(this.toJSON(), null, pretty ? 2 : 0);
        }
        _recalculate() {
            this.statistics.files = this.files.length;
            this.statistics.assets = this.assets.length;
            this.statistics.levels = this.levels.length;
            this.statistics.prefabs = this.prefabs.length;
            this.statistics.bytes = this.files.reduce((sum, item) => sum + (Number(item.size) || 0), 0);
            this.statistics.cookedBytes = this.assets.reduce((sum, item) => sum + (Number(item.cookedSize) || 0), 0);
        }
        _path(value) {
            return String(value || '').replace(/\\/g, '/').replace(/^\.?\//, '').replace(/\/+/g, '/');
        }
        _clone(value) {
            try { return structuredClone(value); } catch { }
            try { return JSON.parse(JSON.stringify(value)); } catch { return value; }
        }
        debug() {
            const state = this.toJSON();
            console.log('[SMBuildManifest]', state);
            return state;
        }
    }
    window.SMBuildManifest = SMBuildManifest;
    window.SMBuildManifestClass = SMBuildManifest;
})();