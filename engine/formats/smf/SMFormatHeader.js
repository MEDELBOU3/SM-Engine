// engine/formats/smf/SMFormatHeader.js
// Fixed 128-byte SMF v1 header.
(function (global) {
    'use strict';

    const SMF = global.SMF = global.SMF || {};
    const C = global.SMFormatConstants;

    if (!C) {
        throw new Error('SMFormatHeader requires SMFormatConstants.js');
    }

    if (!global.SMAssetUUID) {
        throw new Error('SMFormatHeader requires SMAssetUUID.js');
    }

    if (!global.SMChecksum) {
        throw new Error('SMFormatHeader requires SMChecksum.js');
    }

    const O = Object.freeze({
        MAGIC: 0,
        MAJOR: 4,
        MINOR: 6,
        HEADER_SIZE: 8,
        FILE_TYPE: 12,
        FLAGS: 16,
        UUID: 20,
        CREATED_AT: 36,
        MODIFIED_AT: 44,
        CHUNK_COUNT: 52,
        DEPENDENCY_COUNT: 56,
        STRING_COUNT: 60,
        CHUNK_TABLE_OFFSET: 64,
        DEPENDENCY_TABLE_OFFSET: 72,
        STRING_TABLE_OFFSET: 80,
        PAYLOAD_OFFSET: 88,
        FILE_SIZE: 96,
        HEADER_CRC32: 104,
        FORMAT_HASH: 108,
        RESERVED: 112
    });

    function writeU64(view, offset, value) {
        const n = typeof value === 'bigint'
            ? value
            : BigInt(Math.max(0, Number(value) || 0));

        if (typeof view.setBigUint64 === 'function') {
            view.setBigUint64(offset, n, true);
            return;
        }

        view.setUint32(offset, Number(n & 0xffffffffn), true);
        view.setUint32(offset + 4, Number((n >> 32n) & 0xffffffffn), true);
    }

    function readU64(view, offset) {
        if (typeof view.getBigUint64 === 'function') {
            return view.getBigUint64(offset, true);
        }

        const lo = BigInt(view.getUint32(offset, true));
        const hi = BigInt(view.getUint32(offset + 4, true));
        return (hi << 32n) | lo;
    }

    function safeNumber(value, label) {
        if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
            throw new RangeError(`${label} exceeds JavaScript safe integer range.`);
        }
        return Number(value);
    }

    class SMFormatHeader {
        constructor(options = {}) {
            const now = Date.now();

            this.magic = C.MAGIC;
            this.major = options.major ?? C.VERSION.major;
            this.minor = options.minor ?? C.VERSION.minor;
            this.headerSize = C.HEADER_SIZE;
            this.fileType = options.fileType ?? C.FileType.UNKNOWN;
            this.flags = (options.flags ?? C.FileFlags.LITTLE_ENDIAN) >>> 0;
            this.uuid = options.uuid || global.SMAssetUUID.generate();
            this.createdAt = options.createdAt ?? now;
            this.modifiedAt = options.modifiedAt ?? now;
            this.chunkCount = options.chunkCount ?? 0;
            this.dependencyCount = options.dependencyCount ?? 0;
            this.stringCount = options.stringCount ?? 0;
            this.chunkTableOffset = options.chunkTableOffset ?? C.HEADER_SIZE;
            this.dependencyTableOffset = options.dependencyTableOffset ?? 0;
            this.stringTableOffset = options.stringTableOffset ?? 0;
            this.payloadOffset = options.payloadOffset ?? 0;
            this.fileSize = options.fileSize ?? 0;
            this.headerCRC32 = options.headerCRC32 ?? 0;
            this.formatHash = options.formatHash ?? 0;
        }

        encode() {
            const bytes = new Uint8Array(C.HEADER_SIZE);
            const view = new DataView(bytes.buffer);

            for (let i = 0; i < 4; i++) {
                bytes[O.MAGIC + i] = this.magic.charCodeAt(i) || 0;
            }

            view.setUint16(O.MAJOR, this.major, true);
            view.setUint16(O.MINOR, this.minor, true);
            view.setUint32(O.HEADER_SIZE, C.HEADER_SIZE, true);
            view.setUint32(O.FILE_TYPE, this.fileType >>> 0, true);
            view.setUint32(O.FLAGS, this.flags >>> 0, true);

            bytes.set(global.SMAssetUUID.toBytes(this.uuid), O.UUID);

            writeU64(view, O.CREATED_AT, this.createdAt);
            writeU64(view, O.MODIFIED_AT, this.modifiedAt);

            view.setUint32(O.CHUNK_COUNT, this.chunkCount >>> 0, true);
            view.setUint32(O.DEPENDENCY_COUNT, this.dependencyCount >>> 0, true);
            view.setUint32(O.STRING_COUNT, this.stringCount >>> 0, true);

            writeU64(view, O.CHUNK_TABLE_OFFSET, this.chunkTableOffset);
            writeU64(view, O.DEPENDENCY_TABLE_OFFSET, this.dependencyTableOffset);
            writeU64(view, O.STRING_TABLE_OFFSET, this.stringTableOffset);
            writeU64(view, O.PAYLOAD_OFFSET, this.payloadOffset);
            writeU64(view, O.FILE_SIZE, this.fileSize);

            view.setUint32(O.HEADER_CRC32, 0, true);
            view.setUint32(O.FORMAT_HASH, this.formatHash >>> 0, true);

            const crc = global.SMChecksum.crc32(bytes);
            view.setUint32(O.HEADER_CRC32, crc, true);
            this.headerCRC32 = crc;

            return bytes;
        }

        static decode(input, { verify = true } = {}) {
            const bytes = input instanceof Uint8Array
                ? input
                : new Uint8Array(input);

            if (bytes.byteLength < C.HEADER_SIZE) {
                throw new RangeError('SMF header is truncated.');
            }

            const headerBytes = bytes.subarray(0, C.HEADER_SIZE);
            const view = new DataView(
                headerBytes.buffer,
                headerBytes.byteOffset,
                headerBytes.byteLength
            );

            const magic = String.fromCharCode(...headerBytes.subarray(0, 4));

            if (magic !== C.MAGIC) {
                throw new Error(`Invalid SMF magic "${magic}".`);
            }

            const storedCRC = view.getUint32(O.HEADER_CRC32, true);

            if (verify) {
                const copy = new Uint8Array(headerBytes);
                new DataView(copy.buffer).setUint32(O.HEADER_CRC32, 0, true);
                const actualCRC = global.SMChecksum.crc32(copy);

                if (actualCRC !== storedCRC) {
                    throw new Error(
                        `SMF header CRC mismatch: expected ${storedCRC}, got ${actualCRC}.`
                    );
                }
            }

            const headerSize = view.getUint32(O.HEADER_SIZE, true);

            if (headerSize !== C.HEADER_SIZE) {
                throw new Error(`Unsupported SMF header size ${headerSize}.`);
            }

            const result = new SMFormatHeader({
                major: view.getUint16(O.MAJOR, true),
                minor: view.getUint16(O.MINOR, true),
                fileType: view.getUint32(O.FILE_TYPE, true),
                flags: view.getUint32(O.FLAGS, true),
                uuid: global.SMAssetUUID.fromBytes(headerBytes, O.UUID),
                createdAt: safeNumber(readU64(view, O.CREATED_AT), 'createdAt'),
                modifiedAt: safeNumber(readU64(view, O.MODIFIED_AT), 'modifiedAt'),
                chunkCount: view.getUint32(O.CHUNK_COUNT, true),
                dependencyCount: view.getUint32(O.DEPENDENCY_COUNT, true),
                stringCount: view.getUint32(O.STRING_COUNT, true),
                chunkTableOffset: safeNumber(readU64(view, O.CHUNK_TABLE_OFFSET), 'chunkTableOffset'),
                dependencyTableOffset: safeNumber(readU64(view, O.DEPENDENCY_TABLE_OFFSET), 'dependencyTableOffset'),
                stringTableOffset: safeNumber(readU64(view, O.STRING_TABLE_OFFSET), 'stringTableOffset'),
                payloadOffset: safeNumber(readU64(view, O.PAYLOAD_OFFSET), 'payloadOffset'),
                fileSize: safeNumber(readU64(view, O.FILE_SIZE), 'fileSize'),
                headerCRC32: storedCRC,
                formatHash: view.getUint32(O.FORMAT_HASH, true)
            });

            result.magic = magic;
            result.headerSize = headerSize;
            return result;
        }

        static get OFFSETS() {
            return O;
        }

        static writeU64(view, offset, value) {
            writeU64(view, offset, value);
        }

        static readU64(view, offset) {
            return readU64(view, offset);
        }
    }

    SMF.FormatHeader = SMFormatHeader;
    global.SMFormatHeader = SMFormatHeader;
})(typeof window !== 'undefined' ? window : globalThis);
