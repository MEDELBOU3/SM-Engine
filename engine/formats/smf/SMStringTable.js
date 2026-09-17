// engine/formats/smf/SMStringTable.js
// Deduplicated UTF-8 string table.
(function (global) {
    'use strict';

    const SMF = global.SMF = global.SMF || {};

    class SMStringTable {
        constructor(strings = []) {
            this._strings = [];
            this._index = new Map();

            for (const value of strings) {
                this.add(value);
            }
        }

        add(value) {
            const text = String(value ?? '');
            const existing = this._index.get(text);

            if (existing !== undefined) {
                return existing;
            }

            const index = this._strings.length;
            this._strings.push(text);
            this._index.set(text, index);
            return index;
        }

        get(index) {
            return this._strings[index] ?? null;
        }

        indexOf(value) {
            const index = this._index.get(String(value ?? ''));
            return index === undefined ? -1 : index;
        }

        get count() {
            return this._strings.length;
        }

        toArray() {
            return [...this._strings];
        }

        encode() {
            const encoder = new TextEncoder();
            const encoded = this._strings.map(s => encoder.encode(s));

            let dataSize = 0;
            for (const bytes of encoded) dataSize += bytes.byteLength;

            const headerSize = 4 + ((this.count + 1) * 4);
            const output = new Uint8Array(headerSize + dataSize);
            const view = new DataView(output.buffer);

            view.setUint32(0, this.count, true);

            let cursor = 0;
            for (let i = 0; i < encoded.length; i++) {
                view.setUint32(4 + i * 4, cursor, true);
                output.set(encoded[i], headerSize + cursor);
                cursor += encoded[i].byteLength;
            }

            view.setUint32(4 + this.count * 4, cursor, true);
            return output;
        }

        static decode(input) {
            const bytes = input instanceof Uint8Array
                ? input
                : new Uint8Array(input);

            if (bytes.byteLength < 8) {
                if (bytes.byteLength === 0) return new SMStringTable();
                throw new Error('String table is truncated.');
            }

            const view = new DataView(
                bytes.buffer,
                bytes.byteOffset,
                bytes.byteLength
            );

            const count = view.getUint32(0, true);
            const headerSize = 4 + ((count + 1) * 4);

            if (headerSize > bytes.byteLength) {
                throw new Error('String table offset header is truncated.');
            }

            const decoder = new TextDecoder();
            const table = new SMStringTable();

            for (let i = 0; i < count; i++) {
                const start = view.getUint32(4 + i * 4, true);
                const end = view.getUint32(4 + (i + 1) * 4, true);

                if (start > end || headerSize + end > bytes.byteLength) {
                    throw new Error(`Invalid string table range at index ${i}.`);
                }

                table.add(
                    decoder.decode(bytes.subarray(headerSize + start, headerSize + end))
                );
            }

            return table;
        }
    }

    SMF.StringTable = SMStringTable;
    global.SMStringTable = SMStringTable;
})(typeof window !== 'undefined' ? window : globalThis);
