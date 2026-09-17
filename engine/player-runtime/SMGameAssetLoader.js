(function () {
    'use strict';
    class SMGameAssetLoader {
        constructor(options = {}) {
            this.manifestLoader = options.manifestLoader || null;
            this.baseURL = String(options.baseURL || this.manifestLoader?.baseURL || './');
            this.cache = new Map();
            this.pending = new Map();
            this.adapters = [];
            this.stats = { loaded: 0, failed: 0, bytes: 0, cacheHits: 0 };
        }
        setManifestLoader(loader) {
            this.manifestLoader = loader || null;
            if (loader?.baseURL) this.baseURL = loader.baseURL;
            return this;
        }
        registerAdapter(test, load, priority = 0) {
            if (typeof test !== 'function' || typeof load !== 'function') throw new TypeError('SMGameAssetLoader.registerAdapter(test, load) expects functions.');
            const record = { test, load, priority: Number(priority) || 0 };
            this.adapters.push(record);
            this.adapters.sort((a, b) => b.priority - a.priority);
            return () => { this.adapters = this.adapters.filter(item => item !== record); };
        }
        resolve(idOrPath) {
            const descriptor = this.manifestLoader?.getAsset?.(idOrPath);
            const path = descriptor?.path || descriptor?.source || String(idOrPath || '');
            const url = this.manifestLoader?.resolve?.(path) || this._resolve(path);
            return { descriptor, path, url, type: descriptor?.type || this._type(path) };
        }
        async load(idOrPath, options = {}) {
            const info = this.resolve(idOrPath);
            const key = info.descriptor?.id || info.path || info.url;
            if (options.cache !== false && this.cache.has(key)) {
                this.stats.cacheHits += 1;
                return this.cache.get(key);
            }
            if (this.pending.has(key)) return await this.pending.get(key);
            const promise = this._loadResolved(info, options).then(result => {
                if (options.cache !== false) this.cache.set(key, result);
                this.stats.loaded += 1;
                return result;
            }).catch(error => {
                this.stats.failed += 1;
                throw error;
            }).finally(() => this.pending.delete(key));
            this.pending.set(key, promise);
            return await promise;
        }
        async preload(options = {}) {
            const assets = options.assets || this.manifestLoader?.manifest?.assets || [];
            const concurrency = Math.max(1, Math.trunc(Number(options.concurrency || 4)));
            const results = [];
            const errors = [];
            let index = 0;
            const worker = async () => {
                while (index < assets.length) {
                    const current = index++;
                    const asset = assets[current];
                    try {
                        const result = await this.load(asset.id || asset.path, options);
                        results[current] = result;
                        options.onProgress?.({ index: current + 1, total: assets.length, asset, result });
                    } catch (error) {
                        errors.push({ asset, error });
                        if (options.failFast === true) throw error;
                    }
                }
            };
            await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(1, assets.length)) }, worker));
            return { results: results.filter(Boolean), errors };
        }
        async loadJSON(idOrPath, options = {}) {
            const value = await this.load(idOrPath, { ...options, responseType: 'json' });
            return value?.data ?? value;
        }
        async loadText(idOrPath, options = {}) {
            const value = await this.load(idOrPath, { ...options, responseType: 'text' });
            return value?.data ?? value;
        }
        async loadBlob(idOrPath, options = {}) {
            const value = await this.load(idOrPath, { ...options, responseType: 'blob' });
            return value?.data ?? value;
        }
        async loadArrayBuffer(idOrPath, options = {}) {
            const value = await this.load(idOrPath, { ...options, responseType: 'arrayBuffer' });
            return value?.data ?? value;
        }
        async loadThree(idOrPath, options = {}) {
            const info = this.resolve(idOrPath);
            const ext = this._ext(info.path);
            if ((ext === '.glb' || ext === '.gltf') && window.THREE?.GLTFLoader) {
                const loader = new THREE.GLTFLoader();
                return await new Promise((resolve, reject) => loader.load(info.url, resolve, undefined, reject));
            }
            if (ext === '.fbx' && window.THREE?.FBXLoader) {
                const loader = new THREE.FBXLoader();
                return await new Promise((resolve, reject) => loader.load(info.url, resolve, undefined, reject));
            }
            if (ext === '.obj' && window.THREE?.OBJLoader) {
                const loader = new THREE.OBJLoader();
                return await new Promise((resolve, reject) => loader.load(info.url, resolve, undefined, reject));
            }
            if ((ext === '.hdr' || ext === '.exr') && (window.THREE?.RGBELoader || window.THREE?.EXRLoader)) {
                const Loader = ext === '.hdr' ? THREE.RGBELoader : THREE.EXRLoader;
                const loader = new Loader();
                return await new Promise((resolve, reject) => loader.load(info.url, resolve, undefined, reject));
            }
            if (['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.tga'].includes(ext) && window.THREE?.TextureLoader) {
                const loader = new THREE.TextureLoader();
                return await new Promise((resolve, reject) => loader.load(info.url, resolve, undefined, reject));
            }
            return await this.load(idOrPath, options);
        }
        get(idOrPath) {
            const info = this.resolve(idOrPath);
            return this.cache.get(info.descriptor?.id || info.path || info.url) || null;
        }
        has(idOrPath) {
            return Boolean(this.get(idOrPath));
        }
        clear(options = {}) {
            if (options.dispose === true) {
                for (const value of this.cache.values()) this._dispose(value?.data ?? value);
            }
            this.cache.clear();
            this.pending.clear();
            return true;
        }
        async _loadResolved(info, options) {
            for (const adapter of this.adapters) {
                if (!adapter.test(info, options)) continue;
                const value = await adapter.load(info, options, this);
                if (value !== undefined && value !== null) return value;
            }
            const response = await fetch(info.url, { cache: options.browserCache || 'default' });
            if (!response.ok) throw new Error(`Failed to load asset "${info.path}" (${response.status}).`);
            const responseType = options.responseType || this._responseType(info.path, info.type);
            let data;
            if (responseType === 'json') data = await response.json();
            else if (responseType === 'text') data = await response.text();
            else if (responseType === 'arrayBuffer') data = await response.arrayBuffer();
            else data = await response.blob();
            const size = Number(response.headers.get('content-length')) || data?.byteLength || data?.size || 0;
            this.stats.bytes += size;
            return { id: info.descriptor?.id || info.path, path: info.path, url: info.url, type: info.type, data, size, descriptor: info.descriptor || null };
        }
        _responseType(path, type) {
            const ext = this._ext(path);
            if (ext === '.json' || type === 'json') return 'json';
            if (['.js', '.css', '.txt', '.glsl', '.vert', '.frag'].includes(ext)) return 'text';
            if (['.bin', '.wasm'].includes(ext)) return 'arrayBuffer';
            return 'blob';
        }
        _type(path) {
            const ext = this._ext(path);
            if (['.glb', '.gltf', '.fbx', '.obj'].includes(ext)) return 'model';
            if (['.png', '.jpg', '.jpeg', '.webp', '.hdr', '.exr'].includes(ext)) return 'texture';
            if (['.mp3', '.wav', '.ogg'].includes(ext)) return 'audio';
            if (ext === '.json') return 'json';
            return 'asset';
        }
        _ext(path) {
            const clean = String(path || '').split(/[?#]/)[0].toLowerCase();
            const index = clean.lastIndexOf('.');
            return index >= 0 ? clean.slice(index) : '';
        }
        _resolve(path) {
            try { return new URL(path, this.baseURL || document.baseURI).href; } catch { return path; }
        }
        _dispose(value) {
            if (!value) return;
            if (value.dispose) try { value.dispose(); } catch { }
            if (value.scene?.traverse) value.scene.traverse(object => {
                try { object.geometry?.dispose?.(); } catch { }
                const materials = Array.isArray(object.material) ? object.material : [object.material];
                for (const material of materials) try { material?.dispose?.(); } catch { }
            });
        }
        debug() {
            const state = { baseURL: this.baseURL, cached: this.cache.size, pending: this.pending.size, adapters: this.adapters.length, stats: { ...this.stats } };
            console.log('[SMGameAssetLoader]', state);
            return state;
        }
    }
    window.SMGameAssetLoader = SMGameAssetLoader;
    window.SMGameAssetLoaderClass = SMGameAssetLoader;
})();