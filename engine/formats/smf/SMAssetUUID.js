// engine/formats/smf/SMAssetUUID.js
// UUID utilities for stable SM Engine asset references.
(function (global) {
    'use strict';

    const SMF = global.SMF = global.SMF || {};

    function hex(byte) {
        return byte.toString(16).padStart(2, '0');
    }

    class SMAssetUUID {
        static NIL = '00000000-0000-0000-0000-000000000000';

        static normalize(value) {
            const text = String(value || '').trim().toLowerCase();
            const compact = text.replace(/[{}-]/g, '');

            if (!/^[0-9a-f]{32}$/.test(compact)) {
                throw new TypeError(`Invalid UUID: ${value}`);
            }

            return [
                compact.slice(0, 8),
                compact.slice(8, 12),
                compact.slice(12, 16),
                compact.slice(16, 20),
                compact.slice(20)
            ].join('-');
        }

        static isValid(value) {
            try {
                this.normalize(value);
                return true;
            } catch (_) {
                return false;
            }
        }

        static generate() {
            const cryptoObject = global.crypto || globalThis.crypto;

            if (cryptoObject?.randomUUID) {
                return cryptoObject.randomUUID().toLowerCase();
            }

            const bytes = new Uint8Array(16);

            if (cryptoObject?.getRandomValues) {
                cryptoObject.getRandomValues(bytes);
            } else {
                for (let i = 0; i < bytes.length; i++) {
                    bytes[i] = Math.floor(Math.random() * 256);
                }
            }

            bytes[6] = (bytes[6] & 0x0f) | 0x40;
            bytes[8] = (bytes[8] & 0x3f) | 0x80;

            return this.fromBytes(bytes);
        }

        static toBytes(uuid) {
            const compact = this.normalize(uuid).replace(/-/g, '');
            const bytes = new Uint8Array(16);

            for (let i = 0; i < 16; i++) {
                bytes[i] = parseInt(compact.slice(i * 2, i * 2 + 2), 16);
            }

            return bytes;
        }

        static fromBytes(bytes, offset = 0) {
            const view = bytes instanceof Uint8Array
                ? bytes
                : new Uint8Array(bytes);

            if (offset < 0 || offset + 16 > view.byteLength) {
                throw new RangeError('UUID bytes require 16 available bytes.');
            }

            const h = Array.from(view.subarray(offset, offset + 16), hex).join('');

            return [
                h.slice(0, 8),
                h.slice(8, 12),
                h.slice(12, 16),
                h.slice(16, 20),
                h.slice(20)
            ].join('-');
        }

        static equals(a, b) {
            try {
                return this.normalize(a) === this.normalize(b);
            } catch (_) {
                return false;
            }
        }

        static assetURI(uuid) {
            return `asset://${this.normalize(uuid)}`;
        }

        static fromAssetURI(uri) {
            const match = String(uri || '').match(/^asset:\/\/(.+)$/i);
            if (!match) return null;
            return this.normalize(match[1]);
        }
    }

    SMF.AssetUUID = SMAssetUUID;
    global.SMAssetUUID = SMAssetUUID;
})(typeof window !== 'undefined' ? window : globalThis);
