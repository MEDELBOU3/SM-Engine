// engine/formats/smf/SMChecksum.js
// CRC32 + SHA-256 helpers for SMF validation.
(function (global) {
    'use strict';

    const SMF = global.SMF = global.SMF || {};

    const CRC_TABLE = (() => {
        const table = new Uint32Array(256);

        for (let n = 0; n < 256; n++) {
            let c = n;
            for (let k = 0; k < 8; k++) {
                c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
            }
            table[n] = c >>> 0;
        }

        return table;
    })();

    function asBytes(data) {
        if (data instanceof Uint8Array) return data;

        if (data instanceof ArrayBuffer) {
            return new Uint8Array(data);
        }

        if (ArrayBuffer.isView(data)) {
            return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
        }

        if (typeof data === 'string') {
            return new TextEncoder().encode(data);
        }

        throw new TypeError('Unsupported checksum input.');
    }

    class SMChecksum {
        static crc32(data, seed = 0) {
            const bytes = asBytes(data);
            let crc = (seed ^ 0xffffffff) >>> 0;

            for (let i = 0; i < bytes.length; i++) {
                crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
            }

            return (crc ^ 0xffffffff) >>> 0;
        }

        static verifyCRC32(data, expected) {
            return this.crc32(data) === (Number(expected) >>> 0);
        }

        static async sha256(data) {
            const bytes = asBytes(data);
            const cryptoObject = global.crypto || globalThis.crypto;

            if (cryptoObject?.subtle?.digest) {
                const digest = await cryptoObject.subtle.digest('SHA-256', bytes);
                return new Uint8Array(digest);
            }

            const req = typeof global.require === 'function'
                ? global.require
                : (typeof require === 'function' ? require : null);

            if (req) {
                const crypto = req('crypto');
                const digest = crypto.createHash('sha256').update(Buffer.from(bytes)).digest();
                return new Uint8Array(digest.buffer, digest.byteOffset, digest.byteLength);
            }

            throw new Error('SHA-256 is unavailable in this environment.');
        }

        static async sha256Hex(data) {
            const digest = await this.sha256(data);
            return Array.from(digest, b => b.toString(16).padStart(2, '0')).join('');
        }
    }

    SMF.Checksum = SMChecksum;
    global.SMChecksum = SMChecksum;
})(typeof window !== 'undefined' ? window : globalThis);
