// engine/formats/smf/formats/SMTextureFormat.js
// SM Engine native texture format (.smtexture).
(function (global) {
    'use strict';

    const C = global.SMFormatConstants;

    if (!C || !global.SMFormatWriter || !global.SMFormatReader) {
        throw new Error(
            'SMTextureFormat requires the SMF Core to be loaded first.'
        );
    }

    function asBytes(value) {
        if (value instanceof Uint8Array) {
            return value;
        }

        if (value instanceof ArrayBuffer) {
            return new Uint8Array(value);
        }

        if (ArrayBuffer.isView(value)) {
            return new Uint8Array(
                value.buffer,
                value.byteOffset,
                value.byteLength
            );
        }

        throw new TypeError(
            'Texture mip data must be binary.'
        );
    }

    async function openReader(input, options) {
        if (
            input &&
            input.header &&
            typeof input.readChunk === 'function'
        ) {
            return input;
        }

        return global.SMFormatReader.open(
            input,
            options
        );
    }

    class SMTextureFormat {
        static EXTENSION = 'smtexture';
        static FILE_TYPE = C.FileType.TEXTURE;
        static VERSION = 1;

        static async encode(texture = {}, options = {}) {
            const sourceMips =
                Array.isArray(
                    texture.mipmaps
                ) &&
                texture.mipmaps.length
                    ? texture.mipmaps
                    : [
                        {
                            width:
                                texture.width,
                            height:
                                texture.height,
                            depth:
                                texture.depth ||
                                1,
                            data:
                                texture.data
                        }
                    ];

            const mipmaps =
                sourceMips.map(
                    (mip, level) => {
                        if (!mip?.data) {
                            throw new Error(
                                `Texture mip ${level} has no data.`
                            );
                        }

                        return {
                            level,
                            width:
                                Number(
                                    mip.width ||
                                    Math.max(
                                        1,
                                        (texture.width || 1) >> level
                                    )
                                ),
                            height:
                                Number(
                                    mip.height ||
                                    Math.max(
                                        1,
                                        (texture.height || 1) >> level
                                    )
                                ),
                            depth:
                                Number(
                                    mip.depth ||
                                    texture.depth ||
                                    1
                                ),
                            rowPitch:
                                Number(
                                    mip.rowPitch ||
                                    0
                                ),
                            slicePitch:
                                Number(
                                    mip.slicePitch ||
                                    0
                                ),
                            bytes:
                                asBytes(
                                    mip.data
                                )
                        };
                    }
                );

            const totalBytes =
                mipmaps.reduce(
                    (sum, mip) =>
                        sum +
                        mip.bytes.byteLength,
                    0
                );

            const payload =
                new Uint8Array(
                    totalBytes
                );

            const mipTable =
                [];

            let cursor =
                0;

            for (const mip of mipmaps) {
                payload.set(
                    mip.bytes,
                    cursor
                );

                mipTable.push({
                    level:
                        mip.level,
                    width:
                        mip.width,
                    height:
                        mip.height,
                    depth:
                        mip.depth,
                    offset:
                        cursor,
                    byteLength:
                        mip.bytes.byteLength,
                    rowPitch:
                        mip.rowPitch,
                    slicePitch:
                        mip.slicePitch
                });

                cursor +=
                    mip.bytes.byteLength;
            }

            const writer =
                new global.SMFormatWriter({
                    fileType:
                        this.FILE_TYPE,
                    uuid:
                        options.uuid ||
                        texture.uuid,
                    flags:
                        options.flags
                });

            writer.addJSONChunk(
                C.ChunkType.META,
                {
                    format:
                        'SM_TEXTURE',
                    version:
                        this.VERSION,
                    name:
                        texture.name ||
                        'Texture',
                    width:
                        Number(
                            texture.width ||
                            mipmaps[0]?.width ||
                            1
                        ),
                    height:
                        Number(
                            texture.height ||
                            mipmaps[0]?.height ||
                            1
                        ),
                    depth:
                        Number(
                            texture.depth ||
                            mipmaps[0]?.depth ||
                            1
                        ),
                    formatName:
                        texture.format ||
                        'RGBA8',
                    colorSpace:
                        texture.colorSpace ||
                        'srgb',
                    dimension:
                        texture.dimension ||
                        '2d',
                    mipCount:
                        mipmaps.length,
                    gpuCompressed:
                        !!texture.gpuCompressed,
                    sourceFormat:
                        texture.sourceFormat ||
                        null
                },
                {
                    name:
                        'textureMeta',
                    compression:
                        'gzip'
                }
            );

            writer.addJSONChunk(
                C.ChunkType.TEXTURE_MIP_TABLE,
                mipTable,
                {
                    name:
                        'mipTable',
                    compression:
                        'gzip'
                }
            );

            writer.addChunk(
                C.ChunkType.TEXTURE_DATA,
                payload,
                {
                    name:
                        'textureData',
                    compression:
                        options.dataCompression ??
                        (
                            texture.gpuCompressed
                                ? 'none'
                                : 'gzip'
                        ),
                    flags:
                        C.ChunkFlags.REQUIRED |
                        C.ChunkFlags.STREAMABLE,
                    alignment:
                        options.alignment ||
                        16
                }
            );

            return writer.finalize();
        }

        static async decode(input, options = {}) {
            const reader =
                await openReader(
                    input,
                    options
                );

            if (
                reader.header.fileType !==
                this.FILE_TYPE
            ) {
                throw new Error(
                    `Not an .${this.EXTENSION} file.`
                );
            }

            const metaEntry =
                reader.getChunksByType(
                    C.ChunkType.META
                )[0];

            const tableEntry =
                reader.getChunksByType(
                    C.ChunkType.TEXTURE_MIP_TABLE
                )[0];

            const dataEntry =
                reader.getChunksByType(
                    C.ChunkType.TEXTURE_DATA
                )[0];

            const meta =
                metaEntry
                    ? await reader.readChunkJSON(
                        metaEntry,
                        options
                    )
                    : {};

            const mipTable =
                tableEntry
                    ? await reader.readChunkJSON(
                        tableEntry,
                        options
                    )
                    : [];

            const data =
                dataEntry
                    ? await reader.readChunk(
                        dataEntry,
                        options
                    )
                    : new Uint8Array();

            const mipmaps =
                mipTable.map(
                    mip => {
                        const start =
                            Number(
                                mip.offset ||
                                0
                            );

                        const end =
                            start +
                            Number(
                                mip.byteLength ||
                                0
                            );

                        if (
                            start < 0 ||
                            end >
                                data.byteLength
                        ) {
                            throw new Error(
                                `Invalid texture mip range for level ${mip.level}.`
                            );
                        }

                        return {
                            ...mip,
                            data:
                                new Uint8Array(
                                    data.slice(
                                        start,
                                        end
                                    )
                                )
                        };
                    }
                );

            return {
                uuid:
                    reader.header.uuid,
                meta,
                mipmaps,
                data,
                reader
            };
        }
    }

    global.SMF =
        global.SMF ||
        {};

    global.SMF.Formats =
        global.SMF.Formats ||
        {};

    global.SMF.Formats.Texture =
        SMTextureFormat;

    global.SMTextureFormat =
        SMTextureFormat;
})(typeof window !== 'undefined' ? window : globalThis);
