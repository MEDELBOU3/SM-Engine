// engine/formats/smf/SMCompression.js
// Async per-chunk compression with browser, Electron/Node and adapter support.
(function (global) {
    'use strict';

    const SMF = global.SMF = global.SMF || {};
    const C = global.SMFormatConstants;

    if (!C) {
        throw new Error('SMCompression requires SMFormatConstants.js');
    }

    function asBytes(data) {
        if (data instanceof Uint8Array) return data;
        if (data instanceof ArrayBuffer) return new Uint8Array(data);

        if (ArrayBuffer.isView(data)) {
            return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
        }

        if (typeof data === 'string') {
            return new TextEncoder().encode(data);
        }

        throw new TypeError('Unsupported compression input.');
    }

    async function streamTransform(bytes, StreamCtor, format) {
        const stream = new StreamCtor(format);
        const writer = stream.writable.getWriter();
        await writer.write(bytes);
        await writer.close();

        const response = new Response(stream.readable);
        return new Uint8Array(await response.arrayBuffer());
    }

    function nodeRequire() {
        return typeof global.require === 'function'
            ? global.require
            : (typeof require === 'function' ? require : null);
    }

    class SMCompression {
        static _adapters = new Map();

        static registerAdapter(idOrName, adapter) {
            const key = typeof idOrName === 'number'
                ? idOrName
                : String(idOrName || '').toLowerCase();

            if (!adapter?.compress || !adapter?.decompress) {
                throw new TypeError('Compression adapter needs compress() and decompress().');
            }

            this._adapters.set(key, adapter);
        }

        static resolve(value) {
            if (typeof value === 'number') return value;

            const name = String(value || 'none').toLowerCase();

            for (const [id, compressionName] of Object.entries(C.CompressionName)) {
                if (compressionName === name) return Number(id);
            }

            throw new Error(`Unknown compression algorithm: ${value}`);
        }

        static async compress(data, algorithm = C.Compression.NONE) {
            const bytes = asBytes(data);
            const id = this.resolve(algorithm);

            if (id === C.Compression.NONE) {
                return new Uint8Array(bytes);
            }

            const adapter =
                this._adapters.get(id) ||
                this._adapters.get(C.CompressionName[id]);

            if (adapter) {
                return asBytes(await adapter.compress(bytes));
            }

            if (
                typeof CompressionStream !== 'undefined' &&
                (id === C.Compression.GZIP || id === C.Compression.DEFLATE)
            ) {
                return streamTransform(
                    bytes,
                    CompressionStream,
                    id === C.Compression.GZIP ? 'gzip' : 'deflate'
                );
            }

            const req = nodeRequire();

            if (req && (id === C.Compression.GZIP || id === C.Compression.DEFLATE)) {
                const zlib = req('zlib');
                const buffer = Buffer.from(bytes);
                const output = id === C.Compression.GZIP
                    ? zlib.gzipSync(buffer)
                    : zlib.deflateSync(buffer);

                return new Uint8Array(output.buffer, output.byteOffset, output.byteLength);
            }

            if (id === C.Compression.ZSTD) {
                throw new Error(
                    'Zstd adapter is not installed. Register one with SMCompression.registerAdapter().'
                );
            }

            throw new Error(`Compression algorithm ${id} is unavailable.`);
        }

        static async decompress(data, algorithm = C.Compression.NONE) {
            const bytes = asBytes(data);
            const id = this.resolve(algorithm);

            if (id === C.Compression.NONE) {
                return new Uint8Array(bytes);
            }

            const adapter =
                this._adapters.get(id) ||
                this._adapters.get(C.CompressionName[id]);

            if (adapter) {
                return asBytes(await adapter.decompress(bytes));
            }

            if (
                typeof DecompressionStream !== 'undefined' &&
                (id === C.Compression.GZIP || id === C.Compression.DEFLATE)
            ) {
                return streamTransform(
                    bytes,
                    DecompressionStream,
                    id === C.Compression.GZIP ? 'gzip' : 'deflate'
                );
            }

            const req = nodeRequire();

            if (req && (id === C.Compression.GZIP || id === C.Compression.DEFLATE)) {
                const zlib = req('zlib');
                const buffer = Buffer.from(bytes);
                const output = id === C.Compression.GZIP
                    ? zlib.gunzipSync(buffer)
                    : zlib.inflateSync(buffer);

                return new Uint8Array(output.buffer, output.byteOffset, output.byteLength);
            }

            if (id === C.Compression.ZSTD) {
                throw new Error(
                    'Zstd adapter is not installed. Register one with SMCompression.registerAdapter().'
                );
            }

            throw new Error(`Decompression algorithm ${id} is unavailable.`);
        }
    }

    SMF.Compression = SMCompression;
    global.SMCompression = SMCompression;
})(typeof window !== 'undefined' ? window : globalThis);
