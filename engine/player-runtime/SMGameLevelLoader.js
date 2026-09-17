(function () {
    'use strict';
    class SMGameLevelLoader {
        constructor(options = {}) {
            this.manifestLoader = options.manifestLoader || null;
            this.assetLoader = options.assetLoader || null;
            this.levelRegistry = options.levelRegistry || window.SMLevelRegistry || null;
            this.prefabRegistry = options.prefabRegistry || window.SMPrefabRegistry || null;
            this.levelManager = options.levelManager || window.SMLevelManager || null;
            this.loadedDefinitions = new Map();
            this.registeredLevels = new Set();
            this.registeredPrefabs = new Set();
        }
        setContext(options = {}) {
            if (options.manifestLoader) this.manifestLoader = options.manifestLoader;
            if (options.assetLoader) this.assetLoader = options.assetLoader;
            if (options.levelRegistry) this.levelRegistry = options.levelRegistry;
            if (options.prefabRegistry) this.prefabRegistry = options.prefabRegistry;
            if (options.levelManager) this.levelManager = options.levelManager;
            return this;
        }
        async registerManifestContent(options = {}) {
            const manifest = this.manifestLoader?.manifest;
            if (!manifest) throw new Error('SMGameLevelLoader requires a loaded manifest.');
            for (const prefabInfo of manifest.prefabs || []) {
                try { await this.registerPrefab(prefabInfo, options); } catch (error) {
                    if (options.failFast === true) throw error;
                    console.warn(`[SMGameLevelLoader] Failed to register prefab "${prefabInfo.id}".`, error);
                }
            }
            for (const levelInfo of manifest.levels || []) {
                try { await this.registerLevel(levelInfo, options); } catch (error) {
                    if (options.failFast === true) throw error;
                    console.warn(`[SMGameLevelLoader] Failed to register level "${levelInfo.id}".`, error);
                }
            }
            return { levels: this.registeredLevels.size, prefabs: this.registeredPrefabs.size };
        }
        async registerLevel(levelInfoOrId, options = {}) {
            const info = typeof levelInfoOrId === 'string' ? this.manifestLoader?.getLevel?.(levelInfoOrId) : levelInfoOrId;
            if (!info?.id) throw new Error(`Unknown level "${levelInfoOrId}".`);
            if (this.registeredLevels.has(String(info.id))) return this.levelRegistry?.get?.(info.id) || this.loadedDefinitions.get(`level:${info.id}`) || null;
            const data = await this._loadDefinition(info.path, options);
            let level = null;
            if (window.SMLevelSerializer?.deserialize) {
                try { level = await window.SMLevelSerializer.deserialize(data, { registry: this.levelRegistry, scene: window.scene }); } catch { }
            }
            if (!level && window.SMLevel) {
                try { level = new window.SMLevel(data?.id ? data : { ...data, id: info.id, name: info.name || info.id, type: info.type || 'level' }); } catch { }
            }
            if (!level) level = { ...data, id: data?.id || info.id, name: data?.name || info.name || info.id, type: data?.type || info.type || 'level' };
            this._register(this.levelRegistry, info.id, level);
            this.registeredLevels.add(String(info.id));
            this.loadedDefinitions.set(`level:${info.id}`, data);
            return level;
        }
        async registerPrefab(prefabInfoOrId, options = {}) {
            const info = typeof prefabInfoOrId === 'string' ? this.manifestLoader?.getPrefab?.(prefabInfoOrId) : prefabInfoOrId;
            if (!info?.id) throw new Error(`Unknown prefab "${prefabInfoOrId}".`);
            if (this.registeredPrefabs.has(String(info.id))) return this.prefabRegistry?.get?.(info.id) || this.loadedDefinitions.get(`prefab:${info.id}`) || null;
            const data = await this._loadDefinition(info.path, options);
            let prefab = null;
            if (window.SMPrefab?.fromJSON) try { prefab = window.SMPrefab.fromJSON(data); } catch { }
            if (!prefab && window.SMPrefab) try { prefab = new window.SMPrefab(data?.id ? data : { ...data, id: info.id, name: info.name || info.id }); } catch { }
            if (!prefab) prefab = { ...data, id: data?.id || info.id, name: data?.name || info.name || info.id };
            this._register(this.prefabRegistry, info.id, prefab);
            this.registeredPrefabs.add(String(info.id));
            this.loadedDefinitions.set(`prefab:${info.id}`, data);
            return prefab;
        }
        async openStartLevel(options = {}) {
            const id = options.startLevel || this.manifestLoader?.getStartLevel?.();
            if (!id) return null;
            return await this.openLevel(id, options);
        }
        async openLevel(levelOrId, options = {}) {
            const id = String(levelOrId?.id || levelOrId || '');
            if (!id) throw new Error('SMGameLevelLoader.openLevel() requires a level id.');
            let level = this.levelRegistry?.get?.(id) || null;
            if (!level) level = await this.registerLevel(id, options);
            if (window.SMRuntime?.openLevel) {
                const result = await window.SMRuntime.openLevel(id, { unloadCurrent: options.unloadCurrent !== false, ...options });
                await window.SMRuntime.whenLevelReady?.();
                return result;
            }
            if (this.levelManager?.openLevel) return await this.levelManager.openLevel(level, { unloadCurrent: options.unloadCurrent !== false, ...options });
            if (this.levelManager?.load) return await this.levelManager.load(level, { active: true, ...options });
            return level;
        }
        getDefinition(kind, id) {
            return this.loadedDefinitions.get(`${kind}:${id}`) || null;
        }
        async _loadDefinition(path, options = {}) {
            if (!path) throw new Error('Manifest content entry has no path.');
            const url = this.manifestLoader?.resolve?.(path) || path;
            if (this.assetLoader) {
                try {
                    const loaded = await this.assetLoader.load(url, { ...options, responseType: 'json' });
                    return loaded?.data ?? loaded;
                } catch { }
            }
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Failed to load definition "${url}" (${response.status}).`);
            return await response.json();
        }
        _register(registry, id, value) {
            if (!registry) return value;
            if (typeof registry.register === 'function') {
                try { return registry.register(id, value) || value; } catch {
                    try { return registry.register(value) || value; } catch { }
                }
            }
            if (typeof registry.add === 'function') try { return registry.add(value) || value; } catch { }
            return value;
        }
        debug() {
            const state = { registeredLevels: Array.from(this.registeredLevels), registeredPrefabs: Array.from(this.registeredPrefabs), definitions: this.loadedDefinitions.size, startLevel: this.manifestLoader?.getStartLevel?.() || null };
            console.log('[SMGameLevelLoader]', state);
            return state;
        }
    }
    window.SMGameLevelLoader = SMGameLevelLoader;
    window.SMGameLevelLoaderClass = SMGameLevelLoader;
})();