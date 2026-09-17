// engine/formats/smf/formats/SMMaterialFormat.js
// SM Engine native material format (.smmaterial).
(function (global) {
    'use strict';

    const C = global.SMFormatConstants;

    if (!C || !global.SMFormatWriter || !global.SMFormatReader) {
        throw new Error(
            'SMMaterialFormat requires the SMF Core to be loaded first.'
        );
    }

    function cloneJSON(value) {
        return value == null
            ? value
            : JSON.parse(JSON.stringify(value));
    }

    function collectTextureDependencies(textures, output = []) {
        if (!textures || typeof textures !== 'object') {
            return output;
        }

        for (const [slot, value] of Object.entries(textures)) {
            if (typeof value === 'string') {
                const uuid = global.SMAssetUUID?.fromAssetURI?.(value);

                if (uuid) {
                    output.push({
                        uuid,
                        type: C.FileType.TEXTURE,
                        flags: C.DependencyFlags.REQUIRED,
                        name: slot,
                        path: value
                    });
                }
                continue;
            }

            if (value && typeof value === 'object') {
                if (value.uuid && global.SMAssetUUID?.isValid?.(value.uuid)) {
                    output.push({
                        uuid: value.uuid,
                        type: C.FileType.TEXTURE,
                        flags:
                            value.optional === true
                                ? C.DependencyFlags.OPTIONAL
                                : C.DependencyFlags.REQUIRED,
                        name: value.name || slot,
                        path: value.path || ''
                    });
                } else if (value.asset) {
                    const uuid =
                        global.SMAssetUUID?.fromAssetURI?.(
                            value.asset
                        );

                    if (uuid) {
                        output.push({
                            uuid,
                            type: C.FileType.TEXTURE,
                            flags: C.DependencyFlags.REQUIRED,
                            name: value.name || slot,
                            path: value.asset
                        });
                    }
                }
            }
        }

        return output;
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
            ? reader.readChunkJSON(entry, options)
            : null;
    }

    class SMMaterialFormat {
        static EXTENSION = 'smmaterial';
        static FILE_TYPE = C.FileType.MATERIAL;
        static VERSION = 1;

        static async encode(material = {}, options = {}) {
            const writer =
                new global.SMFormatWriter({
                    fileType:
                        this.FILE_TYPE,
                    uuid:
                        options.uuid ||
                        material.uuid,
                    flags:
                        options.flags,
                    formatHash:
                        options.formatHash
                });

            const definition = {
                name:
                    material.name ||
                    'Material',
                shader:
                    material.shader ||
                    'PBR',
                shaderModel:
                    material.shaderModel ||
                    'metallic-roughness',
                parameters:
                    cloneJSON(
                        material.parameters ||
                        {}
                    ),
                textures:
                    cloneJSON(
                        material.textures ||
                        {}
                    ),
                renderState:
                    cloneJSON(
                        material.renderState ||
                        {}
                    ),
                keywords:
                    Array.isArray(
                        material.keywords
                    )
                        ? [...material.keywords]
                        : [],
                userData:
                    cloneJSON(
                        material.userData ||
                        {}
                    )
            };

            const meta = {
                format:
                    'SM_MATERIAL',
                version:
                    this.VERSION,
                name:
                    definition.name,
                shader:
                    definition.shader,
                shaderModel:
                    definition.shaderModel,
                engineVersion:
                    options.engineVersion ||
                    null
            };

            writer.addJSONChunk(
                C.ChunkType.META,
                meta,
                {
                    name:
                        'materialMeta',
                    compression:
                        options.metaCompression ||
                        'gzip'
                }
            );

            writer.addJSONChunk(
                C.ChunkType.MATERIAL_DATA,
                definition,
                {
                    name:
                        'materialData',
                    compression:
                        options.dataCompression ||
                        'gzip'
                }
            );

            if (
                material.graph &&
                options.includeGraph !== false
            ) {
                writer.addJSONChunk(
                    C.ChunkType.MATERIAL_GRAPH,
                    cloneJSON(
                        material.graph
                    ),
                    {
                        name:
                            'materialGraph',
                        compression:
                            options.graphCompression ||
                            'gzip',
                        flags:
                            options.graphRuntime === true
                                ? C.ChunkFlags.OPTIONAL
                                : (
                                    C.ChunkFlags.OPTIONAL |
                                    C.ChunkFlags.EDITOR_ONLY
                                )
                    }
                );
            }

            const dependencies = [
                ...collectTextureDependencies(
                    definition.textures
                ),
                ...(
                    Array.isArray(
                        options.dependencies
                    )
                        ? options.dependencies
                        : []
                ),
                ...(
                    Array.isArray(
                        material.dependencies
                    )
                        ? material.dependencies
                        : []
                )
            ];

            const seen =
                new Set();

            for (const dep of dependencies) {
                if (
                    !dep?.uuid ||
                    !global.SMAssetUUID?.isValid?.(
                        dep.uuid
                    )
                ) {
                    continue;
                }

                const key =
                    global.SMAssetUUID.normalize(
                        dep.uuid
                    );

                if (seen.has(key)) {
                    continue;
                }

                seen.add(key);

                writer.addDependency({
                    ...dep,
                    uuid: key,
                    type:
                        dep.type ??
                        C.FileType.TEXTURE
                });
            }

            if (
                options.editorData &&
                options.includeEditorData !== false
            ) {
                writer.addJSONChunk(
                    C.ChunkType.EDITOR_DATA,
                    cloneJSON(
                        options.editorData
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

            const material =
                await readFirstJSON(
                    reader,
                    C.ChunkType.MATERIAL_DATA,
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
                material,
                graph:
                    await readFirstJSON(
                        reader,
                        C.ChunkType.MATERIAL_GRAPH,
                        options
                    ),
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

    global.SMF.Formats.Material =
        SMMaterialFormat;

    global.SMMaterialFormat =
        SMMaterialFormat;
})(typeof window !== 'undefined' ? window : globalThis);
