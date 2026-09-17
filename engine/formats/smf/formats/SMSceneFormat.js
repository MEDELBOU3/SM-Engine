// engine/formats/smf/formats/SMSceneFormat.js
// SM Engine native scene/world format (.smscene).
(function (global) {
    'use strict';

    const C = global.SMFormatConstants;

    if (!C || !global.SMFormatWriter || !global.SMFormatReader) {
        throw new Error(
            'SMSceneFormat requires the SMF Core to be loaded first.'
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

    function normalizeEntity(entity, index) {
        return {
            uuid:
                entity?.uuid ||
                global.SMAssetUUID.generate(),
            name:
                entity?.name ||
                `Entity_${index}`,
            parent:
                entity?.parent ||
                null,
            enabled:
                entity?.enabled !== false,
            tags:
                Array.isArray(entity?.tags)
                    ? [...entity.tags]
                    : [],
            transform:
                cloneJSON(
                    entity?.transform ||
                    {
                        position:
                            [0, 0, 0],
                        rotation:
                            [0, 0, 0, 1],
                        scale:
                            [1, 1, 1]
                    }
                ),
            userData:
                cloneJSON(
                    entity?.userData ||
                    {}
                )
        };
    }

    class SMSceneFormat {
        static EXTENSION = 'smscene';
        static FILE_TYPE = C.FileType.SCENE;
        static VERSION = 1;

        static async encode(scene = {}, options = {}) {
            const writer =
                new global.SMFormatWriter({
                    fileType:
                        this.FILE_TYPE,
                    uuid:
                        options.uuid ||
                        scene.uuid,
                    flags:
                        options.flags,
                    formatHash:
                        options.formatHash
                });

            const sourceEntities =
                Array.isArray(
                    scene.entities
                )
                    ? scene.entities
                    : [];

            const entities =
                sourceEntities.map(
                    normalizeEntity
                );

            const components =
                cloneJSON(
                    scene.components ||
                    {}
                );

            const world = {
                name:
                    scene.name ||
                    'Scene',
                gravity:
                    cloneJSON(
                        scene.world?.gravity ??
                        scene.gravity ??
                        [0, -9.81, 0]
                    ),
                units:
                    scene.world?.units ||
                    scene.units ||
                    'meters',
                environment:
                    cloneJSON(
                        scene.world?.environment ||
                        scene.environment ||
                        {}
                    ),
                lighting:
                    cloneJSON(
                        scene.world?.lighting ||
                        scene.lighting ||
                        {}
                    ),
                physics:
                    cloneJSON(
                        scene.world?.physics ||
                        scene.physics ||
                        {}
                    ),
                navigation:
                    cloneJSON(
                        scene.world?.navigation ||
                        scene.navigation ||
                        {}
                    ),
                settings:
                    cloneJSON(
                        scene.world?.settings ||
                        scene.settings ||
                        {}
                    )
            };

            writer.addJSONChunk(
                C.ChunkType.META,
                {
                    format:
                        'SM_SCENE',
                    version:
                        this.VERSION,
                    name:
                        world.name,
                    entityCount:
                        entities.length,
                    engineVersion:
                        options.engineVersion ||
                        null
                },
                {
                    name:
                        'sceneMeta',
                    compression:
                        'gzip'
                }
            );

            writer.addJSONChunk(
                C.ChunkType.SCENE_WORLD,
                world,
                {
                    name:
                        'world',
                    compression:
                        options.worldCompression ||
                        'gzip',
                    flags:
                        C.ChunkFlags.REQUIRED
                }
            );

            writer.addJSONChunk(
                C.ChunkType.SCENE_ENTITIES,
                entities,
                {
                    name:
                        'entities',
                    compression:
                        options.entityCompression ||
                        'gzip',
                    flags:
                        C.ChunkFlags.REQUIRED |
                        C.ChunkFlags.STREAMABLE
                }
            );

            writer.addJSONChunk(
                C.ChunkType.SCENE_COMPONENTS,
                components,
                {
                    name:
                        'components',
                    compression:
                        options.componentCompression ||
                        'gzip',
                    flags:
                        C.ChunkFlags.REQUIRED |
                        C.ChunkFlags.STREAMABLE
                }
            );

            if (
                scene.editorData &&
                options.includeEditorData !== false
            ) {
                writer.addJSONChunk(
                    C.ChunkType.EDITOR_DATA,
                    cloneJSON(
                        scene.editorData
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

            const dependencies = [
                ...(
                    Array.isArray(
                        scene.dependencies
                    )
                        ? scene.dependencies
                        : []
                ),
                ...(
                    Array.isArray(
                        options.dependencies
                    )
                        ? options.dependencies
                        : []
                )
            ];

            const seen =
                new Set();

            for (const dep of dependencies) {
                if (
                    !dep?.uuid ||
                    !global.SMAssetUUID.isValid(
                        dep.uuid
                    )
                ) {
                    continue;
                }

                const uuid =
                    global.SMAssetUUID.normalize(
                        dep.uuid
                    );

                if (seen.has(uuid)) {
                    continue;
                }

                seen.add(uuid);

                writer.addDependency({
                    ...dep,
                    uuid
                });
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

            return {
                uuid:
                    reader.header.uuid,
                meta:
                    await readFirstJSON(
                        reader,
                        C.ChunkType.META,
                        options
                    ),
                world:
                    await readFirstJSON(
                        reader,
                        C.ChunkType.SCENE_WORLD,
                        options
                    ) ||
                    {},
                entities:
                    await readFirstJSON(
                        reader,
                        C.ChunkType.SCENE_ENTITIES,
                        options
                    ) ||
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

    global.SMF.Formats.Scene =
        SMSceneFormat;

    global.SMSceneFormat =
        SMSceneFormat;
})(typeof window !== 'undefined' ? window : globalThis);
