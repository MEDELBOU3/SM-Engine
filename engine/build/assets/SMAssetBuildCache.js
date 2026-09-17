(function () {
    'use strict';
    class SMAssetBuildCache {
        constructor(options = {}) {
            this.dbName = String(options.dbName || 'SMEngineBuildCache');
            this.storeName = String(options.storeName || 'assets');
            this.version = 1;
            this.db = null;
            this.ready = null;
            this.memory = new Map();
            this.hits = 0;
            this.misses = 0;
            this.enabled = options.enabled !== false;
        }
        async init() {
            if (!this.enabled) return this;
            if (this.ready) return await this.ready;
            this.ready = this._open().catch(error => {
                console.warn('[SMAssetBuildCache] IndexedDB unavailable; using memory cache.', error);
                this.db = null;
                return this;
            });
            return await this.ready;
        }
        async get(key, fingerprint = null) {
            if (!this.enabled) return null;
            await this.init();
            const id = String(key);
            let record = this.memory.get(id) || null;
            if (!record && this.db) record = await this._dbGet(id);
            if (!record || (fingerprint !== null && record.fingerprint !== fingerprint)) {
                this.misses += 1;
                return null;
            }
            this.memory.set(id, record);
            this.hits += 1;
            return record;
        }
        async put(key, fingerprint, value, metadata = {}) {
            if (!this.enabled) return null;
            await this.init();
            const id = String(key);
            const record = { key: id, fingerprint: String(fingerprint || ''), value, metadata: { ...(metadata || {}) }, updatedAt: Date.now() };
            this.memory.set(id, record);
            if (this.db) await this._dbPut(record);
            return record;
        }
        async delete(key) {
            const id = String(key);
            this.memory.delete(id);
            if (this.db) await new Promise((resolve, reject) => {
                const tx = this.db.transaction(this.storeName, 'readwrite');
                const request = tx.objectStore(this.storeName).delete(id);
                request.onsuccess = () => resolve(true);
                request.onerror = () => reject(request.error);
            });
            return true;
        }
        async clear() {
            this.memory.clear();
            this.hits = 0;
            this.misses = 0;
            if (this.db) await new Promise((resolve, reject) => {
                const tx = this.db.transaction(this.storeName, 'readwrite');
                const request = tx.objectStore(this.storeName).clear();
                request.onsuccess = () => resolve(true);
                request.onerror = () => reject(request.error);
            });
            return true;
        }
        async fingerprint(data, metadata = {}) {
            const bytes = await this._bytes(data);
            const header = new TextEncoder().encode(JSON.stringify(metadata || {}));
            const joined = new Uint8Array(header.length + bytes.length);
            joined.set(header, 0);
            joined.set(bytes, header.length);
            if (window.crypto?.subtle) {
                const hash = await crypto.subtle.digest('SHA-256', joined);
                return Array.from(new Uint8Array(hash)).map(value => value.toString(16).padStart(2, '0')).join('');
            }
            let hash = 2166136261;
            for (const byte of joined) { hash ^= byte; hash = Math.imul(hash, 16777619); }
            return (hash >>> 0).toString(16).padStart(8, '0');
        }
        stats() {
            return { enabled: this.enabled, hits: this.hits, misses: this.misses, memoryEntries: this.memory.size, dbReady: !!this.db };
        }
        async _open() {
            if (!window.indexedDB) return this;
            this.db = await new Promise((resolve, reject) => {
                const request = indexedDB.open(this.dbName, this.version);
                request.onupgradeneeded = () => {
                    const db = request.result;
                    if (!db.objectStoreNames.contains(this.storeName)) db.createObjectStore(this.storeName, { keyPath: 'key' });
                };
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
            return this;
        }
        async _dbGet(key) {
            return await new Promise((resolve, reject) => {
                const tx = this.db.transaction(this.storeName, 'readonly');
                const request = tx.objectStore(this.storeName).get(key);
                request.onsuccess = () => resolve(request.result || null);
                request.onerror = () => reject(request.error);
            });
        }
        async _dbPut(record) {
            return await new Promise((resolve, reject) => {
                const tx = this.db.transaction(this.storeName, 'readwrite');
                const request = tx.objectStore(this.storeName).put(record);
                request.onsuccess = () => resolve(record);
                request.onerror = () => reject(request.error);
            });
        }
        async _bytes(data) {
            if (data === null || data === undefined) return new Uint8Array();
            if (data instanceof Uint8Array) return data;
            if (data instanceof ArrayBuffer) return new Uint8Array(data);
            if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
            if (data instanceof Blob) return new Uint8Array(await data.arrayBuffer());
            if (typeof data === 'string') return new TextEncoder().encode(data);
            return new TextEncoder().encode(JSON.stringify(data));
        }
        debug() {
            const state = this.stats();
            console.log('[SMAssetBuildCache]', state);
            return state;
        }
    }
    const cache = new SMAssetBuildCache();
    window.SMAssetBuildCacheClass = SMAssetBuildCache;
    window.SMAssetBuildCache = cache;
    window.smAssetBuildCache = cache;
})();