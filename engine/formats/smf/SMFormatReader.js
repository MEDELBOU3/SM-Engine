// engine/formats/smf/SMFormatReader.js
// High-level SMF v1 reader.
(function (global) {
    'use strict';

    const SMF = global.SMF = global.SMF || {};
    const C = global.SMFormatConstants;

    const required = [
        'SMFormatHeader',
        'SMChunkReader',
        'SMStringTable',
        'SMDependencyTable'
    ];

    for (const name of required) {
        if (!global[name]) {
            throw new Error(`SMFormatReader requires ${name}.js`);
        }
    }

    async function asBytes(input) {
        if (input instanceof Uint8Array) return input;
        if (input instanceof ArrayBuffer) return new Uint8Array(input);

        if (ArrayBuffer.isView(input)) {
            return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
        }

        if (typeof Blob !== 'undefined' && input instanceof Blob) {
            return new Uint8Array(await input.arrayBuffer());
        }

        throw new TypeError('SMFormatReader expects ArrayBuffer, Uint8Array or Blob.');
    }

    class SMFormatReader {
        constructor(bytes, header, stringTable, dependencies, entries) {
            this.bytes = bytes;
            this.header = header;
            this.stringTable = stringTable;
            this.dependencies = dependencies;
            this.entries = entries;

            this._byId = new Map(entries.map(entry => [entry.id, entry]));
        }

        static async open(input, options = {}) {
            const bytes = await asBytes(input);
            const header = global.SMFormatHeader.decode(bytes, {
                verify: options.verifyHeader !== false
            });

            if (header.major !== C.VERSION.major) {
                throw new Error(
                    `Unsupported SMF major version ${header.major}; engine supports ${C.VERSION.major}.`
                );
            }

            if (header.fileSize && header.fileSize !== bytes.byteLength) {
                throw new Error(
                    `SMF file size mismatch: header=${header.fileSize}, actual=${bytes.byteLength}.`
                );
            }

            const chunkTableSize = header.chunkCount * C.CHUNK_ENTRY_SIZE;
            const chunkTableEnd = header.chunkTableOffset + chunkTableSize;

            if (chunkTableEnd > bytes.byteLength) {
                throw new Error('SMF chunk table is outside the file.');
            }

            const entries = [];

            for (let i = 0; i < header.chunkCount; i++) {
                entries.push(
                    global.SMChunkReader.decodeEntry(
                        bytes,
                        header.chunkTableOffset + i * C.CHUNK_ENTRY_SIZE
                    )
                );
            }

            const stringEnd = header.payloadOffset;
            const stringBytes = bytes.subarray(
                header.stringTableOffset,
                stringEnd
            );

            const stringTable = global.SMStringTable.decode(stringBytes);

            if (stringTable.count !== header.stringCount) {
                throw new Error(
                    `SMF string count mismatch: header=${header.stringCount}, table=${stringTable.count}.`
                );
            }

            const dependencySize = header.dependencyCount * C.DEPENDENCY_ENTRY_SIZE;
            const dependencyBytes = bytes.subarray(
                header.dependencyTableOffset,
                header.dependencyTableOffset + dependencySize
            );

            const dependencies = global.SMDependencyTable.decode(
                dependencyBytes,
                header.dependencyCount,
                stringTable
            );

            return new SMFormatReader(
                bytes,
                header,
                stringTable,
                dependencies,
                entries
            );
        }

        listChunks() {
            return this.entries.map(entry => ({
                ...entry,
                name: entry.nameStringIndex === 0xffffffff
                    ? ''
                    : (this.stringTable.get(entry.nameStringIndex) || '')
            }));
        }

        getChunkEntry(idOrNameOrType) {
            if (typeof idOrNameOrType === 'number') {
                return (
                    this._byId.get(idOrNameOrType) ||
                    this.entries.find(e => e.type === (idOrNameOrType >>> 0)) ||
                    null
                );
            }

            const query = String(idOrNameOrType || '');

            return this.entries.find(entry => {
                const name = entry.nameStringIndex === 0xffffffff
                    ? ''
                    : this.stringTable.get(entry.nameStringIndex);

                return name === query;
            }) || null;
        }

        getChunksByType(type) {
            const resolved = global.SMChunkTypes
                ? global.SMChunkTypes.resolve(type)
                : Number(type) >>> 0;

            return this.entries.filter(entry => entry.type === resolved);
        }

        openChunk(idOrEntry) {
            const entry = typeof idOrEntry === 'object'
                ? idOrEntry
                : this.getChunkEntry(idOrEntry);

            if (!entry) return null;

            return new global.SMChunkReader(
                this.bytes,
                entry,
                this.stringTable
            );
        }

        async readChunk(idOrEntry, options) {
            const reader = this.openChunk(idOrEntry);

            if (!reader) {
                throw new Error(`SMF chunk not found: ${idOrEntry}`);
            }

            return reader.read(options);
        }

        async readChunkJSON(idOrEntry, options) {
            const reader = this.openChunk(idOrEntry);

            if (!reader) {
                throw new Error(`SMF chunk not found: ${idOrEntry}`);
            }

            return reader.readJSON(options);
        }

        hasDependency(uuid) {
            return this.dependencies.items.some(
                dep => global.SMAssetUUID.equals(dep.uuid, uuid)
            );
        }
    }

    SMF.FormatReader = SMFormatReader;
    global.SMFormatReader = SMFormatReader;
})(typeof window !== 'undefined' ? window : globalThis);
