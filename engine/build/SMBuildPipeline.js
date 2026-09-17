(function () {
    'use strict';
    class SMBuildPipeline {
        constructor(options = {}) {
            this.config = options.config instanceof window.SMBuildConfig ? options.config : new window.SMBuildConfig(options.config || {});
            this.validator = options.validator || new window.SMBuildValidator();
            this.graph = options.graph || new window.SMAssetDependencyGraph();
            this.scanner = options.scanner || new window.SMAssetReferenceScanner({ graph: this.graph, includeExternal: this.config.assets.includeExternal });
            this.cache = options.cache || window.SMAssetBuildCache || new window.SMAssetBuildCache();
            this.cooker = options.cooker || new window.SMAssetCooker({ cache: this.cache });
            this.bundle = options.bundle || new window.SMAssetBundle({ name: this.config.name });
            this.manifest = options.manifest || new window.SMBuildManifest(this.config);
            this.adapters = { ...(options.adapters || {}) };
            this.listeners = new Map();
            this.cancelled = false;
            this.running = false;
            this.stage = 'idle';
            this.progress = 0;
            this.context = null;
        }
        on(event, handler) {
            if (typeof handler !== 'function') throw new TypeError('SMBuildPipeline.on(event, handler) expects a function.');
            const key = String(event);
            if (!this.listeners.has(key)) this.listeners.set(key, new Set());
            this.listeners.get(key).add(handler);
            return () => this.listeners.get(key)?.delete(handler);
        }
        cancel(reason = 'cancelled') {
            this.cancelled = true;
            this._emit('cancel', { reason });
            return true;
        }
        async run(options = {}) {
            if (this.running) throw new Error('A build is already running on this pipeline.');
            this.running = true;
            this.cancelled = false;
            this.progress = 0;
            this.bundle.clear();
            this.cooker.resetStats();
            const startedAt = Date.now();
            try {
                const context = this.context = { pipeline: this, config: this.config, manifest: this.manifest, bundle: this.bundle, graph: this.graph, scanner: this.scanner, cooker: this.cooker, cache: this.cache, adapters: this.adapters, options, startedAt, project: null, scanResult: null, validation: null, cookedAssets: [], result: null };
                await this._stage('prepare', 5, () => this._prepare(context));
                await this._stage('scan', 20, () => this._scan(context));
                await this._stage('validate', 35, () => this._validate(context));
                await this._stage('cook', 60, () => this._cook(context));
                await this._stage('serialize', 75, () => this._serializeRuntimeData(context));
                await this._stage('manifest', 85, () => this._writeManifest(context));
                await this._stage('package', 95, () => this._package(context));
                await this._stage('finalize', 100, () => this._finalize(context));
                context.result.finishedAt = Date.now();
                context.result.durationMs = context.result.finishedAt - startedAt;
                this._emit('complete', context.result);
                return context.result;
            } catch (error) {
                this._emit('error', { error, stage: this.stage, context: this.context });
                throw error;
            } finally {
                this.running = false;
                if (this.stage !== 'complete') this.stage = this.cancelled ? 'cancelled' : 'idle';
            }
        }
        async _prepare(context) {
            this._assertActive();
            await this.cache.init?.();
            context.project = await this._resolveProject(context);
            const configuredStart = this.config.startLevel || context.project?.startLevel || context.project?.config?.startLevel || window.SMRuntime?.getActiveLevel?.()?.id || window.SMLevelManager?.getActive?.()?.id || null;
            if (configuredStart && !this.config.startLevel) this.config.setStartLevel(configuredStart);
            this.manifest.config = this.config.toJSON();
            this.manifest.startLevel = this.config.startLevel;
            return context.project;
        }
        async _scan(context) {
            this._assertActive();
            this.scanner.includeExternal = this.config.assets.includeExternal;
            context.scanResult = this.scanner.scanRuntime({ scene: context.options.scene || window.scene, levelRegistry: context.options.levelRegistry || window.SMLevelRegistry, prefabRegistry: context.options.prefabRegistry || window.SMPrefabRegistry });
            context.graph = context.scanResult.graph;
            if (this.config.assets.removeUnused) {
                const reachable = context.graph.reachableFrom(context.scanResult.roots);
                context.assetReferences = context.scanResult.references.filter(ref => reachable.has(ref.id));
            } else context.assetReferences = [...context.scanResult.references];
            return context.scanResult;
        }
        async _validate(context) {
            this._assertActive();
            context.validation = await this.validator.validate({ ...context, levelRegistry: context.options.levelRegistry || window.SMLevelRegistry });
            for (const warning of context.validation.warnings) this.manifest.addWarning(warning.message || warning);
            if (!context.validation.ok && !context.options.allowValidationErrors) {
                const message = context.validation.errors.map(item => item.message || String(item)).join('\n');
                throw new Error(`Build validation failed:\n${message}`);
            }
            return context.validation;
        }
        async _cook(context) {
            this._assertActive();
            const assets = this._uniqueAssetDescriptors(context.assetReferences || []);
            const cooked = await this.cooker.cookAll(assets, {
                useCache: this.config.assets.useCache, hashNames: this.config.assets.hashNames, compress: this.config.assets.compress, target: this.config.target, resolveAsset: context.options.resolveAsset || this.adapters.resolveAsset, failFast: context.options.failFast !== false, concurrency: context.options.assetConcurrency || 4, onProgress: info => {
                    const ratio = info.total ? info.index / info.total : 1;
                    this._progress(35 + ratio * 25, 'cook', info);
                }
            });
            context.cookedAssets = cooked.results;
            context.cookErrors = cooked.errors;
            for (const asset of context.cookedAssets) {
                this.bundle.addCookedAsset(asset);
                this.manifest.addAsset(asset);
            }
            if (cooked.errors.length && context.options.failFast !== false) throw cooked.errors[0].error;
            return cooked;
        }
        async _serializeRuntimeData(context) {
            this._assertActive();
            const levels = await this._serializeLevels(context);
            const prefabs = await this._serializePrefabs(context);
            for (const level of levels) {
                const path = `levels/${this._safeName(level.id)}.json`;
                this.bundle.addJSON(path, level.data);
                this.manifest.addLevel({ id: level.id, name: level.name, path, type: level.type, persistent: level.persistent, dependencies: level.dependencies, metadata: level.metadata });
            }
            for (const prefab of prefabs) {
                const path = `prefabs/${this._safeName(prefab.id)}.json`;
                this.bundle.addJSON(path, prefab.data);
                this.manifest.addPrefab({ id: prefab.id, name: prefab.name, path, dependencies: prefab.dependencies, metadata: prefab.metadata });
            }
            context.levels = levels;
            context.prefabs = prefabs;
            return { levels, prefabs };
        }
        async _writeManifest(context) {
            this._assertActive();
            const cacheStats = this.cache.stats?.() || {};
            this.manifest.setCacheStats(cacheStats.hits || 0, cacheStats.misses || 0);
            this.manifest.finalize();
            if (this.config.packaging.generateManifest !== false) this.bundle.addText('game.manifest.json', this.manifest.toString(true), { type: 'manifest', mimeType: 'application/json' });
            if (this.config.packaging.generateAssetManifest !== false) this.bundle.addJSON('assets/asset-manifest.json', { assets: this.manifest.assets.map(asset => ({ id: asset.id, path: asset.path, source: asset.source, type: asset.type, size: asset.cookedSize, hash: asset.hash, dependencies: asset.dependencies })) });
            this.bundle.addJSON('config/build-config.json', this.config.toJSON());
            return this.manifest;
        }
        async _package(context) {
            this._assertActive();
            if (typeof this.adapters.package === 'function') {
                context.package = await this.adapters.package(context);
                return context.package;
            }
            if (this.config.packaging.zip !== false && window.JSZip) {
                const blob = await this.bundle.toZip({ compression: this.config.assets.compress ? 'DEFLATE' : 'STORE', level: this.config.assets.compress ? 6 : 0 });
                context.package = { type: 'zip', blob, name: this.config.getZipName() };
            } else context.package = { type: 'virtual', bundle: this.bundle, files: this.bundle.list() };
            return context.package;
        }
        async _finalize(context) {
            this._assertActive();
            const bundleSize = await this.bundle.size();
            context.result = { ok: true, buildId: this.manifest.buildId, config: this.config.clone(), manifest: this.manifest, bundle: this.bundle, package: context.package, validation: context.validation, scanResult: context.scanResult, cookedAssets: context.cookedAssets, cookErrors: context.cookErrors || [], statistics: { ...this.manifest.statistics, bundleBytes: bundleSize }, startedAt: context.startedAt };
            this.stage = 'complete';
            return context.result;
        }
        async _resolveProject(context) {
            if (typeof context.options.resolveProject === 'function') return await context.options.resolveProject(context);
            if (typeof this.adapters.resolveProject === 'function') return await this.adapters.resolveProject(context);
            const manager = window.SMProjectManager || window.smProjectManager;
            for (const method of ['getCurrentProject', 'getActiveProject', 'getProject', 'serializeCurrentProject']) {
                if (typeof manager?.[method] !== 'function') continue;
                try {
                    const value = await manager[method]();
                    if (value) return value;
                } catch { }
            }
            return { startLevel: window.SMRuntime?.getActiveLevel?.()?.id || null, scene: window.scene || null };
        }
        async _serializeLevels(context) {
            if (typeof this.adapters.serializeLevels === 'function') return await this.adapters.serializeLevels(context);
            const registry = context.options.levelRegistry || window.SMLevelRegistry;
            const levels = registry?.list?.() || [];
            const output = [];
            for (const level of levels) {
                let data = null;
                try { data = window.SMLevelSerializer?.serialize?.(level, { scene: window.scene }) ?? level.serialize?.() ?? this._plain(level); } catch { data = this._plain(level); }
                output.push({ id: String(level.id), name: String(level.name || level.id), type: String(level.type || 'level'), persistent: level.type === 'persistent' || level.persistent === true, dependencies: Array.isArray(level.dependencies) ? [...level.dependencies] : [], metadata: { ...(level.metadata || {}) }, data });
            }
            return output;
        }
        async _serializePrefabs(context) {
            if (typeof this.adapters.serializePrefabs === 'function') return await this.adapters.serializePrefabs(context);
            const registry = context.options.prefabRegistry || window.SMPrefabRegistry;
            const entries = registry?.list?.() || [];
            const output = [];
            for (const entry of entries) {
                const prefab = entry?.prefab || entry;
                if (!prefab?.id) continue;
                let data = null;
                try { data = prefab.serialize?.() ?? this._plain(prefab); } catch { data = this._plain(prefab); }
                output.push({ id: String(prefab.id), name: String(prefab.name || prefab.id), dependencies: Array.isArray(prefab.dependencies) ? [...prefab.dependencies] : [], metadata: { ...(prefab.metadata || {}) }, data });
            }
            return output;
        }
        _uniqueAssetDescriptors(references) {
            const map = new Map();
            for (const ref of references) {
                if (!ref?.path) continue;
                if (ref.external && this.config.assets.includeExternal === false) continue;
                const existing = map.get(ref.path);
                if (existing) {
                    if (ref.parentId && !existing.dependencies.includes(ref.parentId)) existing.dependencies.push(ref.parentId);
                    continue;
                }
                map.set(ref.path, { id: ref.id || ref.path, path: ref.path, type: ref.type || 'asset', external: ref.external === true, dependencies: ref.parentId ? [ref.parentId] : [], metadata: { contexts: [ref.context].filter(Boolean) } });
            }
            return Array.from(map.values());
        }
        async _stage(name, progress, fn) {
            this._assertActive();
            this.stage = name;
            this._progress(progress, name);
            this._emit('stage', { stage: name, progress, context: this.context });
            return await fn();
        }
        _progress(value, stage = this.stage, detail = null) {
            this.progress = Math.max(0, Math.min(100, Number(value) || 0));
            this._emit('progress', { progress: this.progress, stage, detail, context: this.context });
        }
        _emit(event, payload) {
            for (const handler of this.listeners.get(String(event)) || []) {
                try { handler(payload); } catch (error) { console.error(`[SMBuildPipeline] Listener "${event}" failed.`, error); }
            }
            window.dispatchEvent(new CustomEvent(`sm:build-${event}`, { detail: payload }));
        }
        _assertActive() {
            if (this.cancelled) throw new Error('Build cancelled.');
        }
        _safeName(value) {
            return String(value || 'item').replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '') || 'item';
        }
        _plain(value) {
            if (value === undefined) return null;
            try { return structuredClone(value); } catch { }
            try { return JSON.parse(JSON.stringify(value)); } catch { return {}; }
        }
        debug() {
            const state = { running: this.running, cancelled: this.cancelled, stage: this.stage, progress: this.progress, config: this.config.toJSON(), bundleFiles: this.bundle.files.size };
            console.log('[SMBuildPipeline]', state);
            return state;
        }
    }
    window.SMBuildPipeline = SMBuildPipeline;
    window.SMBuildPipelineClass = SMBuildPipeline;
})();