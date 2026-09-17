// engine/formats/smf/formats/SMAnimationFormat.js
// SM Engine native animation format (.smanim).
(function (global) {
    'use strict';

    const C = global.SMFormatConstants;

    if (!C || !global.SMFormatWriter || !global.SMFormatReader) {
        throw new Error(
            'SMAnimationFormat requires the SMF Core to be loaded first.'
        );
    }

    function isBinary(value) {
        return (
            value instanceof ArrayBuffer ||
            value instanceof Uint8Array ||
            ArrayBuffer.isView(value)
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
            'Expected binary animation data.'
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

    class SMAnimationFormat {
        static EXTENSION = 'smanim';
        static FILE_TYPE = C.FileType.ANIMATION;
        static VERSION = 1;

        static async encode(animation = {}, options = {}) {
            const writer =
                new global.SMFormatWriter({
                    fileType:
                        this.FILE_TYPE,
                    uuid:
                        options.uuid ||
                        animation.uuid,
                    flags:
                        options.flags
                });

            const binary =
                animation.binaryData ||
                animation.data;

            const useBinary =
                isBinary(
                    binary
                ) &&
                options.forceJSON !== true;

            const payload =
                useBinary
                    ? asBytes(binary)
                    : {
                        tracks:
                            animation.tracks ||
                            [],
                        events:
                            animation.events ||
                            [],
                        rootMotion:
                            animation.rootMotion ||
                            null,
                        markers:
                            animation.markers ||
                            []
                    };

            const meta = {
                format:
                    'SM_ANIMATION',
                version:
                    this.VERSION,
                name:
                    animation.name ||
                    'Animation',
                duration:
                    Number(
                        animation.duration ||
                        0
                    ),
                fps:
                    Number(
                        animation.fps ||
                        30
                    ),
                loop:
                    animation.loop !== false,
                encoding:
                    useBinary
                        ? (
                            animation.encoding ||
                            'binary'
                        )
                        : 'json',
                trackCount:
                    Array.isArray(
                        animation.tracks
                    )
                        ? animation.tracks.length
                        : Number(
                            animation.trackCount ||
                            0
                        ),
                skeleton:
                    animation.skeleton ||
                    null
            };

            writer.addJSONChunk(
                C.ChunkType.META,
                meta,
                {
                    name:
                        'animationMeta',
                    compression:
                        'gzip'
                }
            );

            if (useBinary) {
                writer.addChunk(
                    C.ChunkType.ANIMATION_DATA,
                    payload,
                    {
                        name:
                            'animationData',
                        compression:
                            options.dataCompression ||
                            'gzip',
                        flags:
                            C.ChunkFlags.REQUIRED |
                            C.ChunkFlags.STREAMABLE
                    }
                );
            } else {
                writer.addJSONChunk(
                    C.ChunkType.ANIMATION_DATA,
                    payload,
                    {
                        name:
                            'animationData',
                        compression:
                            options.dataCompression ||
                            'gzip',
                        flags:
                            C.ChunkFlags.REQUIRED |
                            C.ChunkFlags.STREAMABLE
                    }
                );
            }

            if (
                animation.skeleton &&
                typeof animation.skeleton ===
                    'string'
            ) {
                const uuid =
                    global.SMAssetUUID
                        ?.fromAssetURI?.(
                            animation.skeleton
                        );

                if (uuid) {
                    writer.addDependency({
                        uuid,
                        type:
                            C.FileType.SKELETON,
                        name:
                            'Skeleton',
                        path:
                            animation.skeleton,
                        flags:
                            C.DependencyFlags.REQUIRED
                    });
                }
            }

            for (
                const dep
                of [
                    ...(animation.dependencies || []),
                    ...(options.dependencies || [])
                ]
            ) {
                if (
                    dep?.uuid &&
                    global.SMAssetUUID.isValid(
                        dep.uuid
                    )
                ) {
                    writer.addDependency(
                        dep
                    );
                }
            }

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

            const dataEntry =
                reader.getChunksByType(
                    C.ChunkType.ANIMATION_DATA
                )[0];

            const meta =
                metaEntry
                    ? await reader.readChunkJSON(
                        metaEntry,
                        options
                    )
                    : {};

            let data =
                null;

            if (dataEntry) {
                data =
                    meta.encoding === 'json'
                        ? await reader.readChunkJSON(
                            dataEntry,
                            options
                        )
                        : await reader.readChunk(
                            dataEntry,
                            options
                        );
            }

            return {
                uuid:
                    reader.header.uuid,
                meta,
                data,
                dependencies:
                    reader.dependencies.items
                        .map(dep => ({
                            ...dep
                        })),
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

    global.SMF.Formats.Animation =
        SMAnimationFormat;

    global.SMAnimationFormat =
        SMAnimationFormat;
})(typeof window !== 'undefined' ? window : globalThis);
