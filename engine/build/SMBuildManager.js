(function () {
    'use strict';
    class SMBuildManager {
        constructor(options = {}) {
            this.configStorageKey = 'sm-build-config-v1';
            this.config = options.config instanceof window.SMBuildConfig ? options.config : new window.SMBuildConfig(options.config || this._loadConfig());
            this.pipeline = null;
            this.lastBuild = null;
            this.history = [];
            this.maxHistory = Math.max(1, Number(options.maxHistory || 10));
            this.adapters = { ...(options.adapters || {}) };
            this.listeners = new Map();
        }
        setConfig(config) {
            this.config = config instanceof window.SMBuildConfig ? config : new window.SMBuildConfig(config || {});
            this.saveConfig();
            this._emit('config-changed', { config: this.config });
            return this.config;
        }
        updateConfig(patch = {}) {
            this.config.merge(patch);
            this.saveConfig();
            this._emit('config-changed', { config: this.config });
            return this.config;
        }
        getConfig() { return this.config; }
        setAdapter(name, adapter) {
            this.adapters[String(name)] = adapter;
            return adapter;
        }
        removeAdapter(name) { return delete this.adapters[String(name)]; }
        on(event, handler) {
            if (typeof handler !== 'function') throw new TypeError('SMBuildManager.on(event, handler) expects a function.');
            const key = String(event);
            if (!this.listeners.has(key)) this.listeners.set(key, new Set());
            this.listeners.get(key).add(handler);
            return () => this.listeners.get(key)?.delete(handler);
        }
        async validate(options = {}) {
            const graph = new window.SMAssetDependencyGraph();
            const scanner = new window.SMAssetReferenceScanner({ graph, includeExternal: this.config.assets.includeExternal });
            const scanResult = scanner.scanRuntime({ scene: options.scene || window.scene, levelRegistry: options.levelRegistry || window.SMLevelRegistry, prefabRegistry: options.prefabRegistry || window.SMPrefabRegistry });
            const validator = new window.SMBuildValidator();
            return await validator.validate({ config: this.config, graph, scanResult, levelRegistry: options.levelRegistry || window.SMLevelRegistry, options });
        }
        async build(options = {}) {
            if (this.pipeline?.running) throw new Error('SMBuildManager: a build is already running.');
            const config = options.config instanceof window.SMBuildConfig ? options.config : this.config.clone().merge(options.config || {});
            this.pipeline = new window.SMBuildPipeline({ config, adapters: { ...this.adapters, ...(options.adapters || {}) } });
            this._wirePipeline(this.pipeline);
            this._emit('build-started', { config, pipeline: this.pipeline });
            try {
                const result = await this.pipeline.run(options);
                this.lastBuild = result;
                this.history.unshift({ buildId: result.buildId, createdAt: Date.now(), config: result.config.toJSON(), statistics: { ...result.statistics }, packageType: result.package?.type || null });
                if (this.history.length > this.maxHistory) this.history.length = this.maxHistory;
                this._emit('build-completed', result);
                return result;
            } catch (error) {
                this._emit('build-failed', { error, pipeline: this.pipeline });
                throw error;
            }
        }
        cancel(reason = 'user-cancelled') {
            return this.pipeline?.cancel?.(reason) || false;
        }
        async downloadLastBuild(filename = null) {
            const result = this.lastBuild;
            if (!result) throw new Error('No completed build is available.');
            let blob = result.package?.blob || null;
            const name = filename || result.package?.name || result.config.getZipName();
            if (!blob && result.bundle && window.JSZip) blob = await result.bundle.toZip();
            if (!blob) throw new Error('Last build has no downloadable ZIP package.');
            if (window.saveAs) {
                window.saveAs(blob, name);
                return { name, blob };
            }
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = name;
            anchor.style.display = 'none';
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            return { name, blob };
        }
        async clearCache() {
            return await window.SMAssetBuildCache?.clear?.();
        }
        getLastBuild() { return this.lastBuild; }
        getHistory() {
            return this.history.map(item => ({ ...item, config: { ...item.config }, statistics: { ...item.statistics } }));
        }
        saveConfig() {
            try { localStorage.setItem(this.configStorageKey, JSON.stringify(this.config.toJSON())); return true; } catch { return false; }
        }
        _loadConfig() {
            try {
                const raw = localStorage.getItem(this.configStorageKey);
                return raw ? JSON.parse(raw) : {};
            } catch { return {}; }
        }
        _wirePipeline(pipeline) {
            for (const event of ['stage', 'progress', 'cancel', 'complete', 'error']) pipeline.on(event, payload => this._emit(event, payload));
        }
        _emit(event, payload) {
            for (const handler of this.listeners.get(String(event)) || []) {
                try { handler(payload); } catch (error) { console.error(`[SMBuildManager] Listener "${event}" failed.`, error); }
            }
            window.dispatchEvent(new CustomEvent(`sm:build-manager-${event}`, { detail: payload }));
        }
        debug() {
            const state = { config: this.config.toJSON(), building: Boolean(this.pipeline?.running), stage: this.pipeline?.stage || 'idle', progress: this.pipeline?.progress || 0, lastBuild: this.lastBuild?.buildId || null, history: this.history.length, adapters: Object.keys(this.adapters) };
            console.log('[SMBuildManager]', state);
            return state;
        }
    }
    const manager = new SMBuildManager();
    window.SMBuildManagerClass = SMBuildManager;
    window.SMBuildManager = manager;
    window.smBuildManager = manager;
})();