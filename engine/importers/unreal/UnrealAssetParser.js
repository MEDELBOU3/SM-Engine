/**
 * SM ENGINE — UNREAL ASSET PARSER
 *
 * Real binary Unreal package inspection layer.
 *
 * Supports:
 * - .uasset
 * - .umap
 * - .uproject
 * - .uplugin
 *
 * IMPORTANT:
 * This parser reads package metadata/header structures.
 * Full UE5 object deserialization (StaticMesh, Texture2D,
 * Material, Animation, etc.) requires a complete Unreal
 * object serializer/backend.
 */
(function () {
    'use strict';

    const PACKAGE_FILE_TAG = 0x9E2A83C1;

    class UnrealBinaryReader {

        constructor(buffer) {
            this.buffer = buffer;
            this.view = new DataView(buffer);
            this.offset = 0;
        }

        get position() {
            return this.offset;
        }

        set position(value) {
            this.offset = value;
        }

        get remaining() {
            return this.buffer.byteLength - this.offset;
        }

        ensure(size) {
            if (
                this.offset + size >
                this.buffer.byteLength
            ) {
                throw new RangeError(
                    `UnrealBinaryReader: out of bounds ` +
                    `(${this.offset} + ${size} > ` +
                    `${this.buffer.byteLength})`
                );
            }
        }

        int32() {
            this.ensure(4);

            const value =
                this.view.getInt32(
                    this.offset,
                    true
                );

            this.offset += 4;
            return value;
        }

        uint32() {
            this.ensure(4);

            const value =
                this.view.getUint32(
                    this.offset,
                    true
                );

            this.offset += 4;
            return value;
        }

        int64() {
            this.ensure(8);

            const value =
                this.view.getBigInt64(
                    this.offset,
                    true
                );

            this.offset += 8;
            return value;
        }

        uint64() {
            this.ensure(8);

            const value =
                this.view.getBigUint64(
                    this.offset,
                    true
                );

            this.offset += 8;
            return value;
        }

        bytes(length) {
            this.ensure(length);

            const result =
                new Uint8Array(
                    this.buffer,
                    this.offset,
                    length
                );

            this.offset += length;

            return result;
        }

        skip(length) {
            this.ensure(length);
            this.offset += length;
        }

        /**
         * Unreal FString:
         *
         * Positive length:
         * ANSI / UTF-8 style serialized string
         *
         * Negative length:
         * UTF-16 serialized string
         */
        fstring() {

            const length =
                this.int32();

            if (length === 0) {
                return '';
            }

            if (length < 0) {

                const chars =
                    -length;

                const byteLength =
                    chars * 2;

                const bytes =
                    this.bytes(byteLength);

                return new TextDecoder(
                    'utf-16le'
                )
                    .decode(bytes)
                    .replace(/\0+$/, '');
            }

            const bytes =
                this.bytes(length);

            return new TextDecoder(
                'utf-8'
            )
                .decode(bytes)
                .replace(/\0+$/, '');
        }

        guid() {
            return {
                a: this.uint32(),
                b: this.uint32(),
                c: this.uint32(),
                d: this.uint32()
            };
        }
    }


    class UnrealAssetParser {

        constructor(options = {}) {

            this.options = options;

            /*
             * Optional external backend.
             *
             * Later this can be:
             * - WASM
             * - native helper
             * - CUE4Parse bridge
             */
            this.backend =
                options.backend || null;
        }


        async parse(file, options = {}) {

            if (!file) {
                throw new Error(
                    'UnrealAssetParser: file is required.'
                );
            }

            const extension =
                this._extension(file.name);

            /*
             * JSON project/plugin descriptors
             */
            if (
                extension === 'uproject' ||
                extension === 'uplugin'
            ) {
                return this._parseDescriptor(
                    file,
                    extension
                );
            }

            /*
             * Real binary package.
             */
            if (
                extension === 'uasset' ||
                extension === 'umap'
            ) {

                /*
                 * Give the real backend first chance.
                 */
                if (
                    this.backend &&
                    typeof this.backend.parse ===
                    'function'
                ) {

                    return this.backend.parse(
                        file,
                        options
                    );
                }

                return this._parseBinaryPackage(
                    file,
                    options
                );
            }

            return {
                ok: false,

                status:
                    'unsupported-format',

                extension,

                name:
                    file.name
            };
        }


        async _parseBinaryPackage(
            file,
            options = {}
        ) {

            try {

                const buffer =
                    await file.arrayBuffer();

                const reader =
                    new UnrealBinaryReader(
                        buffer
                    );

                /*
                 * Unreal package magic.
                 */
                const tag =
                    reader.uint32();

                if (
                    tag !== PACKAGE_FILE_TAG
                ) {

                    return {
                        ok: false,

                        status:
                            'invalid-unreal-package',

                        name:
                            file.name,

                        extension:
                            this._extension(
                                file.name
                            ),

                        tag,

                        expectedTag:
                            PACKAGE_FILE_TAG,

                        size:
                            buffer.byteLength
                    };
                }

                /*
                 * We have confirmed this is an
                 * Unreal package.
                 *
                 * UE package header layouts vary
                 * considerably between legacy UE4,
                 * UE5 legacy and Zen packages.
                 */
                const probe =
                    this._probeHeader(
                        reader,
                        buffer.byteLength
                    );

                return {
                    ok: true,

                    status:
                        probe.status,

                    format:
                        'unreal-package',

                    packageFormat:
                        probe.packageFormat,

                    name:
                        file.name,

                    extension:
                        this._extension(
                            file.name
                        ),

                    size:
                        buffer.byteLength,

                    header:
                        probe.header,

                    tables:
                        probe.tables,

                    metadata: {
                        sourceEngine:
                            'Unreal Engine',

                        unrealPackage:
                            true,

                        binary:
                            true
                    },

                    userData: {
                        smSourceFormat:
                            this._extension(
                                file.name
                            ),

                        smUnrealSource:
                            true
                    }
                };

            } catch (error) {

                return {
                    ok: false,

                    status:
                        'binary-parse-error',

                    name:
                        file.name,

                    extension:
                        this._extension(
                            file.name
                        ),

                    error: {
                        name:
                            error?.name ||
                            'Error',

                        message:
                            error?.message ||
                            String(error)
                    }
                };
            }
        }


        /**
         * Header probing.
         *
         * We intentionally do not guess an entire
         * UE5 object serialization layout here.
         */
        _probeHeader(
            reader,
            fileSize
        ) {

            const start =
                reader.position;

            /*
             * First fields after package tag are
             * version-dependent.
             *
             * Read them defensively.
             */
            const legacyFileVersion =
                reader.int32();

            const legacyUE3Version =
                reader.int32();

            const fileVersionUE4 =
                reader.int32();

            const fileVersionUE5 =
                reader.int32();

            const licenseeVersion =
                reader.int32();

            /*
             * Some UE5 packages have modern
             * package/version information here.
             */
            const looksLikeUE5 =
                fileVersionUE5 >= 1000;

            /*
             * We don't advance through conditional
             * fields unless their version can be
             * established safely.
             */
            const header = {
                tag:
                    PACKAGE_FILE_TAG,

                legacyFileVersion,

                legacyUE3Version,

                fileVersionUE4,

                fileVersionUE5,

                licenseeVersion,

                detectedUE5:
                    looksLikeUE5
            };

            /*
             * Known UE5 modern package families
             * need a ZenPackage reader for complete
             * tables/object exports.
             */
            if (
                looksLikeUE5
            ) {

                return {
                    status:
                        'ue5-package-detected',

                    packageFormat:
                        'ue5',

                    header,

                    tables: {
                        parsed:
                            false,

                        reason:
                            'UE5 package requires version-aware table parser.'
                    }
                };
            }

            return {
                status:
                    'legacy-package-detected',

                packageFormat:
                    'ue4-or-legacy',

                header,

                tables: {
                    parsed:
                        false,

                    reason:
                        'Legacy Unreal table parser required.'
                }
            };
        }


        async _parseDescriptor(
            file,
            extension
        ) {

            try {

                const text =
                    await file.text();

                const json =
                    JSON.parse(text);

                return {
                    ok: true,

                    status:
                        'descriptor-parsed',

                    type:
                        extension === 'uproject'
                            ? 'project'
                            : 'plugin',

                    name:
                        file.name,

                    extension,

                    descriptor:
                        json,

                    metadata: {
                        sourceEngine:
                            'Unreal Engine'
                    }
                };

            } catch (error) {

                return {
                    ok: false,

                    status:
                        'invalid-json-descriptor',

                    name:
                        file.name,

                    extension,

                    error: {
                        message:
                            error?.message ||
                            String(error)
                    }
                };
            }
        }


        _extension(name) {

            const base =
                String(name || '')
                    .split(/[\\/]/)
                    .pop();

            const dot =
                base.lastIndexOf('.');

            return dot >= 0
                ? base
                    .slice(dot + 1)
                    .toLowerCase()
                : '';
        }
    }


    /*
     * Expose reader too.
     */
    window.SMUnrealBinaryReader =
        UnrealBinaryReader;

    window.SMUnrealAssetParser =
        UnrealAssetParser;

})();