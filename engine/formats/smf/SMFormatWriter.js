// engine/formats/smf/SMFormatWriter.js
// High-level SMF v1 binary writer.
(function (global) {
    'use strict';

    const SMF = global.SMF = global.SMF || {};
    const C = global.SMFormatConstants;

    const required = [
        'SMFormatHeader',
        'SMChunkWriter',
        'SMStringTable',
        'SMDependencyTable',
        'SMAssetUUID',
        'SMChecksum'
    ];

    for (const name of required) {
        if (!global[name]) {
            throw new Error(`SMFormatWriter requires ${name}.js`);
        }
    }

    function align(value, alignment) {
        const a = Math.max(1, alignment | 0);
        return Math.ceil(value / a) * a;
    }

    class SMFormatWriter {
        constructor(options = {}) {
            this.fileType = Number(options.fileType ?? C.FileType.ASSET) >>> 0;
            this.uuid = options.uuid || global.SMAssetUUID.generate();
            this.flags = (
                options.flags ??
                (C.FileFlags.LITTLE_ENDIAN | C.FileFlags.STREAMABLE)
            ) >>> 0;

            this.createdAt = options.createdAt ?? Date.now();
            this.modifiedAt = options.modifiedAt ?? this.createdAt;
            this.formatHash = Number(options.formatHash ?? 0) >>> 0;

            this.stringTable = new global.SMStringTable();
            this.dependencies = new global.SMDependencyTable();
            this.chunks = [];
            this._nextChunkId = 1;
        }

        addString(value) {
            return this.stringTable.add(value);
        }

        addDependency(dependency) {
            return this.dependencies.add(dependency);
        }

        addChunk(type, data, options = {}) {
            const chunk = new global.SMChunkWriter({
                id: options.id ?? this._nextChunkId++,
                type,
                data,
                name: options.name || '',
                flags: options.flags ?? C.ChunkFlags.REQUIRED,
                version: options.version ?? 1,
                alignment: options.alignment ?? C.DEFAULT_ALIGNMENT,
                compression: options.compression ?? C.Compression.NONE
            });

            if (this.chunks.some(existing => existing.id === chunk.id)) {
                throw new Error(`Duplicate SMF chunk id ${chunk.id}.`);
            }

            if (chunk.id >= this._nextChunkId) {
                this._nextChunkId = chunk.id + 1;
            }

            this.chunks.push(chunk);
            return chunk;
        }

        addJSONChunk(type, value, options = {}) {
            const text = JSON.stringify(value, null, options.pretty ? 2 : 0);
            return this.addChunk(type, text, options);
        }

        async finalize() {
            for (const chunk of this.chunks) {
                if (chunk.name) this.stringTable.add(chunk.name);
            }

            this.dependencies.registerStrings(this.stringTable);

            await Promise.all(this.chunks.map(chunk => chunk.prepare()));

            const dependencyBytes = this.dependencies.encode(this.stringTable);
            const stringBytes = this.stringTable.encode();

            const chunkTableOffset = C.HEADER_SIZE;
            const chunkTableSize = this.chunks.length * C.CHUNK_ENTRY_SIZE;
            const dependencyTableOffset = chunkTableOffset + chunkTableSize;
            const stringTableOffset = dependencyTableOffset + dependencyBytes.byteLength;
            const payloadOffset = align(
                stringTableOffset + stringBytes.byteLength,
                C.DEFAULT_ALIGNMENT
            );

            let cursor = payloadOffset;

            for (const chunk of this.chunks) {
                cursor = align(cursor, chunk.alignment);
                chunk.offset = cursor;
                cursor += chunk.compressedSize;
            }

            const fileSize = cursor;
            const output = new Uint8Array(fileSize);

            // Tables
            output.set(dependencyBytes, dependencyTableOffset);
            output.set(stringBytes, stringTableOffset);

            for (let i = 0; i < this.chunks.length; i++) {
                const entry = this.chunks[i].encodeEntry(this.stringTable);
                output.set(entry, chunkTableOffset + i * C.CHUNK_ENTRY_SIZE);
                output.set(this.chunks[i].data, this.chunks[i].offset);
            }

            let flags = this.flags;

            if (this.chunks.some(c => c.compression !== C.Compression.NONE)) {
                flags |= C.FileFlags.COMPRESSED;
            }

            if (this.chunks.some(c => (c.flags & C.ChunkFlags.EDITOR_ONLY) !== 0)) {
                flags |= C.FileFlags.HAS_EDITOR_DATA;
            }

            const header = new global.SMFormatHeader({
                fileType: this.fileType,
                flags,
                uuid: this.uuid,
                createdAt: this.createdAt,
                modifiedAt: this.modifiedAt,
                chunkCount: this.chunks.length,
                dependencyCount: this.dependencies.count,
                stringCount: this.stringTable.count,
                chunkTableOffset,
                dependencyTableOffset,
                stringTableOffset,
                payloadOffset,
                fileSize,
                formatHash: this.formatHash
            });

            output.set(header.encode(), 0);

            return {
                bytes: output,
                arrayBuffer: output.buffer,
                header,
                uuid: this.uuid,
                fileType: this.fileType
            };
        }

        async toBlob(mimeType = 'application/x-smf') {
            const result = await this.finalize();
            return new Blob([result.bytes], { type: mimeType });
        }
    }

    SMF.FormatWriter = SMFormatWriter;
    global.SMFormatWriter = SMFormatWriter;
})(typeof window !== 'undefined' ? window : globalThis);
