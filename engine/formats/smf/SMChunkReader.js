// engine/formats/smf/SMChunkReader.js
// Chunk table decoding, decompression and checksum verification.
(function (global) {
    'use strict';

    const SMF = global.SMF = global.SMF || {};
    const C = global.SMFormatConstants;

    if (!C || !global.SMCompression || !global.SMChecksum || !global.SMFormatHeader) {
        throw new Error(
            'SMChunkReader requires SMFormatConstants, SMCompression, SMChecksum and SMFormatHeader.'
        );
    }

    function safeNumber(value, label) {
        if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
            throw new RangeError(`${label} exceeds JavaScript safe integer range.`);
        }
        return Number(value);
    }

    class SMChunkReader {
        constructor(sourceBytes, entry, stringTable) {
            this.source = sourceBytes;
            this.entry = entry;
            this.stringTable = stringTable;
        }

        get name() {
            return this.entry.nameStringIndex === 0xffffffff
                ? ''
                : (this.stringTable.get(this.entry.nameStringIndex) || '');
        }

        getStoredBytes() {
            const start = this.entry.offset;
            const end = start + this.entry.compressedSize;

            if (start < 0 || end > this.source.byteLength) {
                throw new RangeError(`Chunk ${this.entry.id} payload is outside the file.`);
            }

            return this.source.subarray(start, end);
        }

        async read({ verify = true } = {}) {
            const raw = await global.SMCompression.decompress(
                this.getStoredBytes(),
                this.entry.compression
            );

            if (raw.byteLength !== this.entry.uncompressedSize) {
                throw new Error(
                    `Chunk ${this.entry.id} size mismatch: expected ` +
                    `${this.entry.uncompressedSize}, got ${raw.byteLength}.`
                );
            }

            if (verify && !global.SMChecksum.verifyCRC32(raw, this.entry.checksumCRC32)) {
                throw new Error(`Chunk ${this.entry.id} CRC32 verification failed.`);
            }

            return raw;
        }

        async readText(options) {
            return new TextDecoder().decode(await this.read(options));
        }

        async readJSON(options) {
            return JSON.parse(await this.readText(options));
        }

        static decodeEntry(bytes, offset = 0) {
            if (offset < 0 || offset + C.CHUNK_ENTRY_SIZE > bytes.byteLength) {
                throw new RangeError('Chunk table entry is truncated.');
            }

            const view = new DataView(
                bytes.buffer,
                bytes.byteOffset + offset,
                C.CHUNK_ENTRY_SIZE
            );

            return {
                type: view.getUint32(0, true),
                flags: view.getUint32(4, true),
                id: view.getUint32(8, true),
                nameStringIndex: view.getUint32(12, true),
                offset: safeNumber(global.SMFormatHeader.readU64(view, 16), 'chunk offset'),
                compressedSize: safeNumber(global.SMFormatHeader.readU64(view, 24), 'compressed size'),
                uncompressedSize: safeNumber(global.SMFormatHeader.readU64(view, 32), 'uncompressed size'),
                checksumCRC32: view.getUint32(40, true),
                compression: view.getUint16(44, true),
                alignment: view.getUint16(46, true),
                version: view.getUint32(48, true)
            };
        }
    }

    SMF.ChunkReader = SMChunkReader;
    global.SMChunkReader = SMChunkReader;
})(typeof window !== 'undefined' ? window : globalThis);
