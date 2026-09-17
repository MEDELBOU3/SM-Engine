(function () {
    'use strict';
    class SMAssetCooker {
        constructor(options = {}) {
            this.cache = options.cache || window.SMAssetBuildCache || null;
            this.resolvers = [];
            this.processors = new Map();
            this.stats = { processed: 0, cacheHits: 0, cacheMisses: 0, inputBytes: 0, outputBytes: 0 };
            this._registerDefaultProcessors();
        }
        registerResolver(resolver, priority = 0) {
            if (typeof resolver !== 'function') throw new TypeError('SMAssetCooker.registerResolver() expects a function.');
            this.resolvers.push({ resolver, priority: Number(priority) || 0 });
            this.resolvers.sort((a, b) => b.priority - a.priority);
            return () => { this.resolvers = this.resolvers.filter(item => item.resolver !== resolver); };
        }
        registerProcessor(type, processor) {
            if (typeof processor !== 'function') throw new TypeError('SMAssetCooker.registerProcessor(type, processor) expects a function.');
            this.processors.set(String(type), processor);
            return processor;
        }
        async cook(asset, options = {}) {
            const descriptor = this._normalizeAsset(asset);
            const raw = await this.resolve(descriptor, options);
            if (raw === null || raw === undefined) throw new Error(`Unable to resolve asset "${descriptor.path}".`);
            const bytes = await this._bytes(raw);
            this.stats.inputBytes += bytes.byteLength;
            const fingerprint = await (this.cache?.fingerprint?.(bytes, { path: descriptor.path, type: descriptor.type, options: this._fingerprintOptions(options) }) || this._hash(bytes));
            const cacheKey = `${descriptor.type}:${descriptor.path}`;
            if (options.useCache !== false && this.cache) {
                const cached = await this.cache.get(cacheKey, fingerprint);
                if (cached?.value) {
                    this.stats.cacheHits += 1;
                    const result = { ...cached.value, fromCache: true };
                    this.stats.outputBytes += Number(result.cookedSize || result.size || 0);
                    return result;
                }
                this.stats.cacheMisses += 1;
            }
            const processor = this.processors.get(descriptor.type) || this.processors.get('*');
            const processed = await processor.call(this, { ...descriptor, data: raw, bytes }, options);
            const cookedBytes = await this._bytes(processed.data);
            const hash = await this._hash(cookedBytes);
            const outputPath = this._outputPath(descriptor.path, hash, options);
            const result = { id: descriptor.id || descriptor.path, path: descriptor.path, outputPath, type: descriptor.type, data: processed.data, mimeType: processed.mimeType || descriptor.mimeType || this._mime(descriptor.path), size: bytes.byteLength, cookedSize: cookedBytes.byteLength, hash, dependencies: [...(descriptor.dependencies || [])], metadata: { ...(descriptor.metadata || {}), ...(processed.metadata || {}) }, fromCache: false };
            this.stats.processed += 1;
            this.stats.outputBytes += result.cookedSize;
            if (options.useCache !== false && this.cache) await this.cache.put(cacheKey, fingerprint, { ...result, data: processed.data }, { path: descriptor.path, type: descriptor.type });
            return result;
        }
        async cookAll(assets = [], options = {}) {
            const results = [];
            const errors = [];
            const concurrency = Math.max(1, Math.trunc(Number(options.concurrency || 4)));
            let index = 0;
            const worker = async () => {
                while (index < assets.length) {
                    const current = index++;
                    const asset = assets[current];
                    try {
                        const result = await this.cook(asset, options);
                        results[current] = result;
                        options.onProgress?.({ index: current + 1, total: assets.length, asset, result });
                    } catch (error) {
                        errors.push({ asset, error });
                        if (options.failFast !== false) throw error;
                    }
                }
            };
            await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(1, assets.length)) }, worker));
            return { results: results.filter(Boolean), errors, stats: { ...this.stats } };
        }
        async resolve(asset, options = {}) {
            if (asset.data !== undefined) return asset.data;
            if (typeof options.resolveAsset === 'function') {
                const value = await options.resolveAsset(asset);
                if (value !== undefined && value !== null) return value;
            }
            for (const item of this.resolvers) {
                const value = await item.resolver(asset, options);
                if (value !== undefined && value !== null) return value;
            }
            const fromManagers = await this._resolveFromManagers(asset);
            if (fromManagers !== undefined && fromManagers !== null) return fromManagers;
            if (asset.external === true || this._isFetchablePath(asset.path)) {
                try {
                    const response = await fetch(asset.path);
                    if (response.ok) return await response.blob();
                } catch { }
            }
            return null;
        }
        resetStats() {
            this.stats = { processed: 0, cacheHits: 0, cacheMisses: 0, inputBytes: 0, outputBytes: 0 };
        }
        _registerDefaultProcessors() {
            this.registerProcessor('code-data', async asset => {
                const ext = this._extension(asset.path);
                if (ext === '.json') {
                    try {
                        const text = typeof asset.data === 'string' ? asset.data : await new Blob([asset.data]).text();
                        return { data: JSON.stringify(JSON.parse(text)), mimeType: 'application/json', metadata: { normalized: true } };
                    } catch { }
                }
                return { data: asset.data, mimeType: asset.mimeType };
            });
            this.registerProcessor('*', async asset => ({ data: asset.data, mimeType: asset.mimeType }));
        }
        async _resolveFromManagers(asset) {
            const managers = [window.AssetManager, window.assetManager, window.AssetStorageManager, window.SMProjectStorage, window.smProjectStorage];
            const methods = ['getAsset', 'loadAsset', 'get', 'readFile', 'read', 'getFile', 'getBlob'];
            for (const manager of managers) {
                if (!manager) continue;
                for (const method of methods) {
                    if (typeof manager[method] !== 'function') continue;
                    try {
                        const value = await manager[method](asset.path);
                        if (value !== undefined && value !== null) return value?.data ?? value?.blob ?? value?.content ?? value;
                    } catch { }
                }
            }
            return null;
        }
        _normalizeAsset(asset) {
            if (typeof asset === 'string') asset = { path: asset };
            const path = String(asset?.path || asset?.source || asset?.id || '').replace(/\\/g, '/');
            return { id: asset?.id || path, path, type: String(asset?.type || this._type(path)), external: asset?.external === true, data: asset?.data, mimeType: asset?.mimeType || this._mime(path), dependencies: Array.isArray(asset?.dependencies) ? asset.dependencies : [], metadata: { ...(asset?.metadata || {}) } };
        }
        _outputPath(path, hash, options = {}) {
            const clean = String(path || 'asset').replace(/\\/g, '/').replace(/^(\.\.\/|\.\/)+/g, '').replace(/^\/+/, '');
            const base = clean.startsWith('assets/') ? clean : `assets/${clean}`;
            if (options.hashNames !== true) return base;
            const index = base.lastIndexOf('.');
            return index > base.lastIndexOf('/') ? `${base.slice(0, index)}.${hash.slice(0, 10)}${base.slice(index)}` : `${base}.${hash.slice(0, 10)}`;
        }
        _type(path) {
            const ext = this._extension(path);
            if (['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.tga', '.hdr', '.exr', '.ktx', '.ktx2', '.dds', '.svg'].includes(ext)) return 'texture';
            if (['.glb', '.gltf', '.fbx', '.obj', '.dae', '.stl', '.ply', '.3ds'].includes(ext)) return 'model';
            if (['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac'].includes(ext)) return 'audio';
            if (['.mp4', '.webm'].includes(ext)) return 'video';
            if (['.ttf', '.otf', '.woff', '.woff2'].includes(ext)) return 'font';
            if (['.json', '.js', '.css', '.bin', '.wasm'].includes(ext)) return 'code-data';
            return 'asset';
        }
        _mime(path) {
            const ext = this._extension(path);
            const map = { '.json': 'application/json', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.mp4': 'video/mp4', '.webm': 'video/webm', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.wasm': 'application/wasm' };
            return map[ext] || 'application/octet-stream';
        }
        _extension(path) {
            const clean = String(path || '').split(/[?#]/)[0].toLowerCase();
            const index = clean.lastIndexOf('.');
            return index >= 0 ? clean.slice(index) : '';
        }
        _isFetchablePath(path) {
            return /^(https?:)?\/\//i.test(path) || /^(\.\/|\.\.\/|\/|assets\/|engine\/|game-ui\/)/i.test(path);
        }
        _fingerprintOptions(options) {
            return { hashNames: options.hashNames === true, compress: options.compress !== false, target: options.target || 'web' };
        }
        async _bytes(data) {
            if (data instanceof Uint8Array) return data;
            if (data instanceof ArrayBuffer) return new Uint8Array(data);
            if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
            if (data instanceof Blob) return new Uint8Array(await data.arrayBuffer());
            if (typeof data === 'string') return new TextEncoder().encode(data);
            return new TextEncoder().encode(JSON.stringify(data ?? null));
        }
        async _hash(bytes) {
            if (window.crypto?.subtle) {
                const digest = await crypto.subtle.digest('SHA-256', bytes);
                return Array.from(new Uint8Array(digest)).map(value => value.toString(16).padStart(2, '0')).join('');
            }
            let hash = 2166136261;
            for (const byte of bytes) { hash ^= byte; hash = Math.imul(hash, 16777619); }
            return (hash >>> 0).toString(16).padStart(8, '0');
        }
        debug() {
            const state = { processors: Array.from(this.processors.keys()), resolvers: this.resolvers.length, stats: { ...this.stats } };
            console.log('[SMAssetCooker]', state);
            return state;
        }
    }
    window.SMAssetCooker = SMAssetCooker;
    window.SMAssetCookerClass = SMAssetCooker;
})();