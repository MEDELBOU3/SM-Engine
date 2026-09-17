// engine/formats/smf/SMChunkWriter.js
// Chunk preparation + fixed 64-byte chunk-table entry encoding.
(function (global) {
    'use strict';

    const SMF = global.SMF = global.SMF || {};
    const C = global.SMFormatConstants;

    if (!C || !global.SMCompression || !global.SMChecksum || !global.SMFormatHeader) {
        throw new Error(
            'SMChunkWriter requires SMFormatConstants, SMCompression, SMChecksum and SMFormatHeader.'
        );
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

        return new TextEncoder().encode(JSON.stringify(data));
    }

    class SMChunkWriter {
        constructor(options = {}) {
            this.id = Number(options.id ?? 0) >>> 0;
            this.type = global.SMChunkTypes
                ? global.SMChunkTypes.resolve(options.type ?? C.ChunkType.UNKNOWN)
                : Number(options.type ?? C.ChunkType.UNKNOWN) >>> 0;

            this.flags = Number(options.flags ?? C.ChunkFlags.REQUIRED) >>> 0;
            this.name = String(options.name || '');
            this.version = Number(options.version ?? 1) >>> 0;
            this.alignment = Math.max(1, Number(options.alignment ?? C.DEFAULT_ALIGNMENT) | 0);
            this.compression = global.SMCompression.resolve(
                options.compression ?? C.Compression.NONE
            );

            this.rawData = asBytes(options.data ?? new Uint8Array());
            this.data = null;
            this.offset = 0;
            this.uncompressedSize = this.rawData.byteLength;
            this.compressedSize = 0;
            this.checksumCRC32 = 0;
            this.nameStringIndex = 0xffffffff;
        }

        async prepare() {
            this.data = await global.SMCompression.compress(
                this.rawData,
                this.compression
            );

            this.compressedSize = this.data.byteLength;
            this.uncompressedSize = this.rawData.byteLength;
            this.checksumCRC32 = global.SMChecksum.crc32(this.rawData);

            return this;
        }

        encodeEntry(stringTable) {
            if (!this.data) {
                throw new Error(`Chunk ${this.id} has not been prepared.`);
            }

            const bytes = new Uint8Array(C.CHUNK_ENTRY_SIZE);
            const view = new DataView(bytes.buffer);

            this.nameStringIndex = this.name
                ? stringTable.add(this.name)
                : 0xffffffff;

            view.setUint32(0, this.type, true);
            view.setUint32(4, this.flags, true);
            view.setUint32(8, this.id, true);
            view.setUint32(12, this.nameStringIndex, true);

            global.SMFormatHeader.writeU64(view, 16, this.offset);
            global.SMFormatHeader.writeU64(view, 24, this.compressedSize);
            global.SMFormatHeader.writeU64(view, 32, this.uncompressedSize);

            view.setUint32(40, this.checksumCRC32, true);
            view.setUint16(44, this.compression, true);
            view.setUint16(46, this.alignment, true);
            view.setUint32(48, this.version, true);
            view.setUint32(52, 0, true);
            global.SMFormatHeader.writeU64(view, 56, 0);

            return bytes;
        }
    }

    SMF.ChunkWriter = SMChunkWriter;
    global.SMChunkWriter = SMChunkWriter;
})(typeof window !== 'undefined' ? window : globalThis);
