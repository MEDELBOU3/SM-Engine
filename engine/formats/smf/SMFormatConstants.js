// engine/formats/smf/SMFormatConstants.js
// SM Engine Format (SMF) — shared constants and binary layout definitions.
(function (global) {
    'use strict';

    const SMF = global.SMF = global.SMF || {};

    const MAGIC = 'SMF1';
    const VERSION = Object.freeze({ major: 1, minor: 0 });

    const HEADER_SIZE = 128;
    const CHUNK_ENTRY_SIZE = 64;
    const DEPENDENCY_ENTRY_SIZE = 40;
    const DEFAULT_ALIGNMENT = 16;

    const FileType = Object.freeze({
        UNKNOWN: 0,
        SCENE: 1,
        ASSET: 2,
        PREFAB: 3,
        MATERIAL: 4,
        MESH: 5,
        ANIMATION: 6,
        SKELETON: 7,
        TEXTURE: 8,
        AUDIO: 9,
        PACKAGE: 10,
        PROJECT: 11
    });

    const FileTypeName = Object.freeze(
        Object.fromEntries(
            Object.entries(FileType).map(([name, id]) => [id, name])
        )
    );

    const FileFlags = Object.freeze({
        NONE: 0,
        COMPRESSED: 1 << 0,
        STREAMABLE: 1 << 1,
        HAS_EDITOR_DATA: 1 << 2,
        COOKED: 1 << 3,
        SIGNED: 1 << 4,
        ENCRYPTED: 1 << 5,
        LITTLE_ENDIAN: 1 << 6
    });

    const ChunkFlags = Object.freeze({
        NONE: 0,
        REQUIRED: 1 << 0,
        STREAMABLE: 1 << 1,
        EDITOR_ONLY: 1 << 2,
        RUNTIME_ONLY: 1 << 3,
        OPTIONAL: 1 << 4,
        ENCRYPTED: 1 << 5
    });

    const Compression = Object.freeze({
        NONE: 0,
        GZIP: 1,
        DEFLATE: 2,
        ZSTD: 3,
        CUSTOM: 255
    });

    const CompressionName = Object.freeze({
        0: 'none',
        1: 'gzip',
        2: 'deflate',
        3: 'zstd',
        255: 'custom'
    });

    const ChunkType = Object.freeze({
        UNKNOWN: 0,
        META: 1,
        THUMBNAIL: 2,
        EDITOR_DATA: 3,

        SCENE_ENTITIES: 100,
        SCENE_COMPONENTS: 101,
        SCENE_WORLD: 102,

        MESH_INFO: 200,
        MESH_LOD0: 210,
        MESH_LOD1: 211,
        MESH_LOD2: 212,
        MESH_LOD3: 213,
        MESHLETS: 220,
        COLLISION: 230,

        MATERIAL_DATA: 300,
        MATERIAL_GRAPH: 301,

        TEXTURE_DATA: 400,
        TEXTURE_MIP_TABLE: 401,

        SKELETON_DATA: 500,
        ANIMATION_DATA: 510,

        AUDIO_DATA: 600,

        SCRIPT_DATA: 700,

        PACKAGE_MANIFEST: 800,
        PACKAGE_INDEX: 801,

        USER: 0x80000000
    });

    const DependencyFlags = Object.freeze({
        NONE: 0,
        REQUIRED: 1 << 0,
        OPTIONAL: 1 << 1,
        EDITOR_ONLY: 1 << 2,
        RUNTIME_ONLY: 1 << 3,
        SOFT_REFERENCE: 1 << 4
    });

    const ExtensionToFileType = Object.freeze({
        smscene: FileType.SCENE,
        smasset: FileType.ASSET,
        smprefab: FileType.PREFAB,
        smmaterial: FileType.MATERIAL,
        smmesh: FileType.MESH,
        smanim: FileType.ANIMATION,
        smskeleton: FileType.SKELETON,
        smtexture: FileType.TEXTURE,
        smaudio: FileType.AUDIO,
        smpackage: FileType.PACKAGE,
        smproject: FileType.PROJECT
    });

    const FileTypeToExtension = Object.freeze(
        Object.fromEntries(
            Object.entries(ExtensionToFileType).map(([ext, type]) => [type, ext])
        )
    );

    const SMFormatConstants = Object.freeze({
        MAGIC,
        VERSION,
        HEADER_SIZE,
        CHUNK_ENTRY_SIZE,
        DEPENDENCY_ENTRY_SIZE,
        DEFAULT_ALIGNMENT,
        FileType,
        FileTypeName,
        FileFlags,
        ChunkFlags,
        ChunkType,
        Compression,
        CompressionName,
        DependencyFlags,
        ExtensionToFileType,
        FileTypeToExtension
    });

    SMF.Constants = SMFormatConstants;
    global.SMFormatConstants = SMFormatConstants;
})(typeof window !== 'undefined' ? window : globalThis);
