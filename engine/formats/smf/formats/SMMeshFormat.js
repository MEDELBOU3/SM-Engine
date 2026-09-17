// engine/formats/smf/formats/SMMeshFormat.js
// SM Engine native mesh format (.smmesh).
//
// Each LOD is stored as:
// [u32 JSON header length][JSON header][16-byte alignment][raw attribute/index bytes]
//
// Offsets inside the LOD header are relative to the beginning of the raw-data section.
(function (global) {
    'use strict';

    const C = global.SMFormatConstants;

    if (!C || !global.SMFormatWriter || !global.SMFormatReader) {
        throw new Error(
            'SMMeshFormat requires the SMF Core to be loaded first.'
        );
    }

    const LOD_CHUNK_TYPES = [
        C.ChunkType.MESH_LOD0,
        C.ChunkType.MESH_LOD1,
        C.ChunkType.MESH_LOD2,
        C.ChunkType.MESH_LOD3
    ];

    const ARRAY_CTORS = Object.freeze({
        Int8Array:
            Int8Array,
        Uint8Array:
            Uint8Array,
        Uint8ClampedArray:
            Uint8ClampedArray,
        Int16Array:
            Int16Array,
        Uint16Array:
            Uint16Array,
        Int32Array:
            Int32Array,
        Uint32Array:
            Uint32Array,
        Float32Array:
            Float32Array,
        Float64Array:
            Float64Array
    });

    function align(value, alignment = 16) {
        return Math.ceil(
            value /
            alignment
        ) * alignment;
    }

    function asTypedArray(value) {
        if (
            ArrayBuffer.isView(
                value
            ) &&
            !(value instanceof DataView)
        ) {
            return value;
        }

        if (Array.isArray(value)) {
            return new Float32Array(
                value
            );
        }

        throw new TypeError(
            'Mesh buffer must be a TypedArray or numeric Array.'
        );
    }

    function bytesOf(typed) {
        return new Uint8Array(
            typed.buffer,
            typed.byteOffset,
            typed.byteLength
        );
    }

    function normalizeAttribute(name, value) {
        const record =
            value &&
            typeof value === 'object' &&
            value.data !== undefined
                ? value
                : {
                    data:
                        value
                };

        const data =
            asTypedArray(
                record.data
            );

        return {
            name:
                String(name),
            data,
            itemSize:
                Number(
                    record.itemSize ||
                    (
                        name === 'POSITION' ||
                        name === 'NORMAL'
                            ? 3
                            : (
                                name === 'TANGENT'
                                    ? 4
                                    : (
                                        name.startsWith(
                                            'TEXCOORD'
                                        )
                                            ? 2
                                            : 1
                                    )
                            )
                    )
                ),
            normalized:
                !!record.normalized
        };
    }

    function inferVertexCount(attributes) {
        const position =
            attributes.find(
                attr =>
                    attr.name ===
                    'POSITION'
            );

        if (position) {
            return Math.floor(
                position.data.length /
                Math.max(
                    1,
                    position.itemSize
                )
            );
        }

        const first =
            attributes[0];

        return first
            ? Math.floor(
                first.data.length /
                Math.max(
                    1,
                    first.itemSize
                )
            )
            : 0;
    }

    function packLOD(lod = {}) {
        const attributes =
            Object.entries(
                lod.attributes ||
                {}
            ).map(
                ([name, value]) =>
                    normalizeAttribute(
                        name,
                        value
                    )
            );

        const indices =
            lod.indices != null
                ? asTypedArray(
                    lod.indices
                )
                : null;

        const rawParts =
            [];

        const header = {
            version:
                1,
            topology:
                lod.topology ||
                'triangles',
            vertexCount:
                Number(
                    lod.vertexCount ||
                    inferVertexCount(
                        attributes
                    )
                ),
            indexCount:
                indices
                    ? indices.length
                    : 0,
            indexType:
                indices
                    ? indices.constructor.name
                    : null,
            attributes:
                [],
            bounds:
                lod.bounds ||
                null
        };

        let rawOffset =
            0;

        for (const attr of attributes) {
            const bytes =
                bytesOf(
                    attr.data
                );

            header.attributes.push({
                name:
                    attr.name,
                itemSize:
                    attr.itemSize,
                normalized:
                    attr.normalized,
                componentType:
                    attr.data.constructor.name,
                byteOffset:
                    rawOffset,
                byteLength:
                    bytes.byteLength,
                count:
                    Math.floor(
                        attr.data.length /
                        Math.max(
                            1,
                            attr.itemSize
                        )
                    )
            });

            rawParts.push(
                bytes
            );

            rawOffset +=
                bytes.byteLength;
        }

        let indexInfo =
            null;

        if (indices) {
            const bytes =
                bytesOf(
                    indices
                );

            indexInfo = {
                componentType:
                    indices.constructor.name,
                byteOffset:
                    rawOffset,
                byteLength:
                    bytes.byteLength,
                count:
                    indices.length
            };

            rawParts.push(
                bytes
            );

            rawOffset +=
                bytes.byteLength;
        }

        header.indices =
            indexInfo;

        const headerBytes =
            new TextEncoder()
                .encode(
                    JSON.stringify(
                        header
                    )
                );

        const dataStart =
            align(
                4 +
                headerBytes.byteLength,
                16
            );

        const output =
            new Uint8Array(
                dataStart +
                rawOffset
            );

        const view =
            new DataView(
                output.buffer
            );

        view.setUint32(
            0,
            headerBytes.byteLength,
            true
        );

        output.set(
            headerBytes,
            4
        );

        let cursor =
            dataStart;

        for (const part of rawParts) {
            output.set(
                part,
                cursor
            );

            cursor +=
                part.byteLength;
        }

        return {
            bytes:
                output,
            header
        };
    }

    function constructTypedArray(
        componentType,
        source,
        byteOffset,
        byteLength
    ) {
        const Ctor =
            ARRAY_CTORS[
                componentType
            ];

        if (!Ctor) {
            throw new Error(
                `Unsupported mesh component type: ${componentType}`
            );
        }

        const start =
            source.byteOffset +
            byteOffset;

        const elementCount =
            byteLength /
            Ctor.BYTES_PER_ELEMENT;

        if (
            !Number.isInteger(
                elementCount
            )
        ) {
            throw new Error(
                `Misaligned ${componentType} mesh buffer.`
            );
        }

        /*
         * Copy to a fresh aligned ArrayBuffer so typed-array construction is
         * valid even when the SMF chunk itself was not naturally aligned for
         * the component type.
         */
        const copy =
            source.slice(
                byteOffset,
                byteOffset +
                byteLength
            );

        return new Ctor(
            copy.buffer,
            copy.byteOffset,
            elementCount
        );
    }

    function unpackLOD(bytes) {
        if (
            bytes.byteLength <
            4
        ) {
            throw new Error(
                'Mesh LOD payload is truncated.'
            );
        }

        const view =
            new DataView(
                bytes.buffer,
                bytes.byteOffset,
                bytes.byteLength
            );

        const headerLength =
            view.getUint32(
                0,
                true
            );

        if (
            4 +
            headerLength >
            bytes.byteLength
        ) {
            throw new Error(
                'Mesh LOD JSON header is truncated.'
            );
        }

        const header =
            JSON.parse(
                new TextDecoder()
                    .decode(
                        bytes.subarray(
                            4,
                            4 +
                            headerLength
                        )
                    )
            );

        const dataStart =
            align(
                4 +
                headerLength,
                16
            );

        const raw =
            bytes.subarray(
                dataStart
            );

        const attributes =
            {};

        for (
            const attr
            of header.attributes ||
            []
        ) {
            const data =
                constructTypedArray(
                    attr.componentType,
                    raw,
                    attr.byteOffset,
                    attr.byteLength
                );

            attributes[
                attr.name
            ] = {
                data,
                itemSize:
                    attr.itemSize,
                normalized:
                    !!attr.normalized
            };
        }

        let indices =
            null;

        if (
            header.indices
        ) {
            indices =
                constructTypedArray(
                    header.indices
                        .componentType,
                    raw,
                    header.indices
                        .byteOffset,
                    header.indices
                        .byteLength
                );
        }

        return {
            topology:
                header.topology ||
                'triangles',
            vertexCount:
                header.vertexCount ||
                0,
            indexCount:
                header.indexCount ||
                0,
            attributes,
            indices,
            bounds:
                header.bounds ||
                null
        };
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

    async function readMaybeJSON(reader, type, encoding, options) {
        const entry =
            reader.getChunksByType(type)[0];

        if (!entry) {
            return null;
        }

        return encoding === 'binary'
            ? reader.readChunk(
                entry,
                options
            )
            : reader.readChunkJSON(
                entry,
                options
            );
    }

    class SMMeshFormat {
        static EXTENSION = 'smmesh';
        static FILE_TYPE = C.FileType.MESH;
        static VERSION = 1;

        static async encode(mesh = {}, options = {}) {
            const sourceLODs =
                Array.isArray(
                    mesh.lods
                ) &&
                mesh.lods.length
                    ? mesh.lods
                    : [
                        {
                            attributes:
                                mesh.attributes ||
                                {},
                            indices:
                                mesh.indices ||
                                null,
                            bounds:
                                mesh.bounds ||
                                null,
                            topology:
                                mesh.topology ||
                                'triangles'
                        }
                    ];

            if (
                sourceLODs.length >
                LOD_CHUNK_TYPES.length
            ) {
                throw new Error(
                    `SMF v1 supports up to ${LOD_CHUNK_TYPES.length} mesh LOD chunks.`
                );
            }

            const packedLODs =
                sourceLODs.map(
                    packLOD
                );

            const writer =
                new global.SMFormatWriter({
                    fileType:
                        this.FILE_TYPE,
                    uuid:
                        options.uuid ||
                        mesh.uuid,
                    flags:
                        options.flags
                });

            const collisionIsBinary =
                mesh.collision != null &&
                (
                    mesh.collision instanceof
                        ArrayBuffer ||
                    mesh.collision instanceof
                        Uint8Array ||
                    ArrayBuffer.isView(
                        mesh.collision
                    )
                );

            const meshletsIsBinary =
                mesh.meshlets != null &&
                (
                    mesh.meshlets instanceof
                        ArrayBuffer ||
                    mesh.meshlets instanceof
                        Uint8Array ||
                    ArrayBuffer.isView(
                        mesh.meshlets
                    )
                );

            const info = {
                format:
                    'SM_MESH',
                version:
                    this.VERSION,
                name:
                    mesh.name ||
                    'Mesh',
                topology:
                    mesh.topology ||
                    sourceLODs[0]
                        ?.topology ||
                    'triangles',
                lodCount:
                    packedLODs.length,
                bounds:
                    mesh.bounds ||
                    packedLODs[0]
                        ?.header
                        ?.bounds ||
                    null,
                materialSlots:
                    mesh.materialSlots ||
                    [],
                skinning:
                    mesh.skinning ||
                    null,
                collisionEncoding:
                    mesh.collision == null
                        ? null
                        : (
                            collisionIsBinary
                                ? 'binary'
                                : 'json'
                        ),
                meshletEncoding:
                    mesh.meshlets == null
                        ? null
                        : (
                            meshletsIsBinary
                                ? 'binary'
                                : 'json'
                        )
            };

            writer.addJSONChunk(
                C.ChunkType.MESH_INFO,
                info,
                {
                    name:
                        'meshInfo',
                    compression:
                        'gzip'
                }
            );

            packedLODs.forEach(
                (packed, index) => {
                    writer.addChunk(
                        LOD_CHUNK_TYPES[
                            index
                        ],
                        packed.bytes,
                        {
                            name:
                                `lod${index}`,
                            compression:
                                options.lodCompression ||
                                'gzip',
                            flags:
                                C.ChunkFlags.REQUIRED |
                                C.ChunkFlags.STREAMABLE,
                            alignment:
                                16
                        }
                    );
                }
            );

            if (
                mesh.collision != null
            ) {
                if (
                    collisionIsBinary
                ) {
                    writer.addChunk(
                        C.ChunkType.COLLISION,
                        mesh.collision,
                        {
                            name:
                                'collision',
                            compression:
                                options.collisionCompression ||
                                'gzip',
                            flags:
                                C.ChunkFlags.OPTIONAL |
                                C.ChunkFlags.STREAMABLE
                        }
                    );
                } else {
                    writer.addJSONChunk(
                        C.ChunkType.COLLISION,
                        mesh.collision,
                        {
                            name:
                                'collision',
                            compression:
                                'gzip',
                            flags:
                                C.ChunkFlags.OPTIONAL |
                                C.ChunkFlags.STREAMABLE
                        }
                    );
                }
            }

            if (
                mesh.meshlets != null
            ) {
                if (
                    meshletsIsBinary
                ) {
                    writer.addChunk(
                        C.ChunkType.MESHLETS,
                        mesh.meshlets,
                        {
                            name:
                                'meshlets',
                            compression:
                                options.meshletCompression ||
                                'gzip',
                            flags:
                                C.ChunkFlags.OPTIONAL |
                                C.ChunkFlags.STREAMABLE
                        }
                    );
                } else {
                    writer.addJSONChunk(
                        C.ChunkType.MESHLETS,
                        mesh.meshlets,
                        {
                            name:
                                'meshlets',
                            compression:
                                'gzip',
                            flags:
                                C.ChunkFlags.OPTIONAL |
                                C.ChunkFlags.STREAMABLE
                        }
                    );
                }
            }

            for (
                const dep
                of [
                    ...(mesh.dependencies || []),
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

            const infoEntry =
                reader.getChunksByType(
                    C.ChunkType.MESH_INFO
                )[0];

            const info =
                infoEntry
                    ? await reader.readChunkJSON(
                        infoEntry,
                        options
                    )
                    : {};

            const lods =
                [];

            for (
                let i = 0;
                i < LOD_CHUNK_TYPES.length;
                i++
            ) {
                const entry =
                    reader.getChunksByType(
                        LOD_CHUNK_TYPES[
                            i
                        ]
                    )[0];

                if (!entry) {
                    continue;
                }

                const bytes =
                    await reader.readChunk(
                        entry,
                        options
                    );

                lods.push(
                    unpackLOD(
                        bytes
                    )
                );
            }

            return {
                uuid:
                    reader.header.uuid,
                info,
                lods,
                collision:
                    await readMaybeJSON(
                        reader,
                        C.ChunkType.COLLISION,
                        info.collisionEncoding,
                        options
                    ),
                meshlets:
                    await readMaybeJSON(
                        reader,
                        C.ChunkType.MESHLETS,
                        info.meshletEncoding,
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

    global.SMF.Formats.Mesh =
        SMMeshFormat;

    global.SMMeshFormat =
        SMMeshFormat;
})(typeof window !== 'undefined' ? window : globalThis);
