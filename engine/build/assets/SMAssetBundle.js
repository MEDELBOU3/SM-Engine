(function () {
    'use strict';
    class SMAssetBundle {
        constructor(options = {}) {
            this.name = String(options.name || 'SMBuild');
            this.files = new Map();
            this.metadata = { ...(options.metadata || {}) };
            this.createdAt = Date.now();
        }
        add(path, data, options = {}) {
            const key = this._path(path);
            if (!key) throw new Error('SMAssetBundle.add() requires path.');
            const record = { path: key, data, type: String(options.type || 'file'), mimeType: options.mimeType || null, source: options.source || null, hash: options.hash || null, metadata: { ...(options.metadata || {}) } };
            this.files.set(key, record);
            return record;
        }
        addJSON(path, value, options = {}) {
            return this.add(path, JSON.stringify(value, null, options.pretty === false ? 0 : 2), { ...options, type: options.type || 'json', mimeType: 'application/json' });
        }
        addText(path, text, options = {}) {
            return this.add(path, String(text ?? ''), { ...options, type: options.type || 'text', mimeType: options.mimeType || 'text/plain' });
        }
        addCookedAsset(asset) {
            if (!asset?.outputPath) throw new Error('Cooked asset requires outputPath.');
            return this.add(asset.outputPath, asset.data, { type: asset.type || 'asset', mimeType: asset.mimeType, source: asset.path, hash: asset.hash, metadata: asset.metadata });
        }
        has(path) { return this.files.has(this._path(path)); }
        get(path) { return this.files.get(this._path(path)) || null; }
        remove(path) { return this.files.delete(this._path(path)); }
        list() { return Array.from(this.files.values()).sort((a, b) => a.path.localeCompare(b.path)); }
        async size() {
            let total = 0;
            for (const file of this.files.values()) total += (await this._bytes(file.data)).byteLength;
            return total;
        }
        async toZip(options = {}) {
            if (!window.JSZip) throw new Error('JSZip is required to create a ZIP build bundle.');
            const zip = new JSZip();
            for (const file of this.files.values()) {
                const data = await this._zipData(file.data);
                zip.file(file.path, data, { binary: typeof data !== 'string' });
            }
            return await zip.generateAsync({ type: options.type || 'blob', compression: options.compression || 'DEFLATE', compressionOptions: { level: Math.max(0, Math.min(9, Number(options.level ?? 6))) } });
        }
        async export(options = {}) {
            if (options.zip === false) return { type: 'virtual', bundle: this, files: this.list(), size: await this.size() };
            const blob = await this.toZip(options);
            return { type: 'zip', blob, name: String(options.name || `${this.name}.zip`), files: this.list(), size: blob.size };
        }
        async manifest() {
            const files = [];
            for (const file of this.list()) {
                const bytes = await this._bytes(file.data);
                files.push({ path: file.path, type: file.type, mimeType: file.mimeType, source: file.source, hash: file.hash, size: bytes.byteLength, metadata: { ...file.metadata } });
            }
            return { name: this.name, createdAt: this.createdAt, metadata: { ...this.metadata }, files };
        }
        clear() { this.files.clear(); }
        _path(value) { return String(value || '').replace(/\\/g, '/').replace(/^\.?\//, '').replace(/\/+/g, '/'); }
        async _zipData(data) {
            if (data instanceof Blob) return data;
            if (data instanceof ArrayBuffer || ArrayBuffer.isView(data) || typeof data === 'string') return data;
            return JSON.stringify(data);
        }
        async _bytes(data) {
            if (data instanceof Uint8Array) return data;
            if (data instanceof ArrayBuffer) return new Uint8Array(data);
            if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
            if (data instanceof Blob) return new Uint8Array(await data.arrayBuffer());
            if (typeof data === 'string') return new TextEncoder().encode(data);
            return new TextEncoder().encode(JSON.stringify(data ?? null));
        }
        debug() {
            const state = { name: this.name, files: this.files.size, paths: this.list().map(file => file.path) };
            console.log('[SMAssetBundle]', state);
            return state;
        }
    }
    window.SMAssetBundle = SMAssetBundle;
    window.SMAssetBundleClass = SMAssetBundle;
})();