// engine/formats/smf/formats/SMPrefabFormat.js
// SM Engine native prefab format (.smprefab).
(function (global) {
    'use strict';

    const C = global.SMFormatConstants;

    if (!C || !global.SMFormatWriter || !global.SMFormatReader) {
        throw new Error(
            'SMPrefabFormat requires the SMF Core to be loaded first.'
        );
    }

    function cloneJSON(value) {
        return value == null
            ? value
            : JSON.parse(JSON.stringify(value));
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

    async function readFirstJSON(reader, type, options) {
        const entry =
            reader.getChunksByType(type)[0];

        return entry
            ? reader.readChunkJSON(
                entry,
                options
            )
            : null;
    }

    class SMPrefabFormat {
        static EXTENSION = 'smprefab';
        static FILE_TYPE = C.FileType.PREFAB;
        static VERSION = 1;

        static async encode(prefab = {}, options = {}) {
            const writer =
                new global.SMFormatWriter({
                    fileType:
                        this.FILE_TYPE,
                    uuid:
                        options.uuid ||
                        prefab.uuid,
                    flags:
                        options.flags
                });

            const entities =
                Array.isArray(
                    prefab.entities
                )
                    ? cloneJSON(
                        prefab.entities
                    )
                    : [];

            const rootEntity =
                prefab.rootEntity ||
                prefab.root ||
                entities[0]?.uuid ||
                null;

            writer.addJSONChunk(
                C.ChunkType.META,
                {
                    format:
                        'SM_PREFAB',
                    version:
                        this.VERSION,
                    name:
                        prefab.name ||
                        'Prefab',
                    rootEntity,
                    entityCount:
                        entities.length
                },
                {
                    name:
                        'prefabMeta',
                    compression:
                        'gzip'
                }
            );

            writer.addJSONChunk(
                C.ChunkType.SCENE_ENTITIES,
                {
                    rootEntity,
                    entities,
                    variants:
                        cloneJSON(
                            prefab.variants ||
                            []
                        )
                },
                {
                    name:
                        'prefabEntities',
                    compression:
                        'gzip'
                }
            );

            writer.addJSONChunk(
                C.ChunkType.SCENE_COMPONENTS,
                cloneJSON(
                    prefab.components ||
                    {}
                ),
                {
                    name:
                        'prefabComponents',
                    compression:
                        'gzip'
                }
            );

            if (
                prefab.editorData &&
                options.includeEditorData !== false
            ) {
                writer.addJSONChunk(
                    C.ChunkType.EDITOR_DATA,
                    cloneJSON(
                        prefab.editorData
                    ),
                    {
                        name:
                            'editorData',
                        compression:
                            'gzip',
                        flags:
                            C.ChunkFlags.EDITOR_ONLY |
                            C.ChunkFlags.OPTIONAL
                    }
                );
            }

            for (
                const dep
                of [
                    ...(prefab.dependencies || []),
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

            const entityChunk =
                await readFirstJSON(
                    reader,
                    C.ChunkType.SCENE_ENTITIES,
                    options
                ) ||
                {};

            return {
                uuid:
                    reader.header.uuid,
                meta:
                    await readFirstJSON(
                        reader,
                        C.ChunkType.META,
                        options
                    ),
                rootEntity:
                    entityChunk.rootEntity ||
                    null,
                entities:
                    entityChunk.entities ||
                    [],
                variants:
                    entityChunk.variants ||
                    [],
                components:
                    await readFirstJSON(
                        reader,
                        C.ChunkType.SCENE_COMPONENTS,
                        options
                    ) ||
                    {},
                editorData:
                    options.includeEditorData === false
                        ? null
                        : await readFirstJSON(
                            reader,
                            C.ChunkType.EDITOR_DATA,
                            options
                        ),
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

    global.SMF.Formats.Prefab =
        SMPrefabFormat;

    global.SMPrefabFormat =
        SMPrefabFormat;
})(typeof window !== 'undefined' ? window : globalThis);
