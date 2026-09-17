// engine/asset-pipeline/SMAssetCompiler.js
// SM Engine — compiles normalized asset IR into native SMF formats.
(function (global) {
    'use strict';

    const C =
        global.SMFormatConstants;

    if (!C) {
        throw new Error(
            'SMAssetCompiler requires SMF Core.'
        );
    }

    function clone(value) {
        if (
            value == null ||
            typeof value !==
                'object'
        ) {
            return value;
        }

        if (
            value instanceof
                ArrayBuffer
        ) {
            return value.slice(
                0
            );
        }

        if (
            ArrayBuffer.isView(
                value
            )
        ) {
            return value.slice
                ? value.slice()
                : new value.constructor(
                    value
                );
        }

        if (
            Array.isArray(
                value
            )
        ) {
            return value.map(
                clone
            );
        }

        const output =
            {};

        for (
            const [
                key,
                item
            ]
            of Object.entries(
                value
            )
        ) {
            output[key] =
                clone(
                    item
                );
        }

        return output;
    }

    class SMAssetCompiler {
        constructor(options = {}) {
            this.database =
                options.database ||
                global.smAssetDatabase ||
                null;

            this.compilers =
                new Map();

            this._registerBuiltins();
        }

        _registerBuiltins() {
            const builtins = [
                {
                    kind:
                        'scene',
                    extension:
                        'smscene',
                    fileType:
                        C.FileType.SCENE,
                    format:
                        () =>
                            global.SMSceneFormat
                },
                {
                    kind:
                        'mesh',
                    extension:
                        'smmesh',
                    fileType:
                        C.FileType.MESH,
                    format:
                        () =>
                            global.SMMeshFormat
                },
                {
                    kind:
                        'material',
                    extension:
                        'smmaterial',
                    fileType:
                        C.FileType.MATERIAL,
                    format:
                        () =>
                            global.SMMaterialFormat
                },
                {
                    kind:
                        'prefab',
                    extension:
                        'smprefab',
                    fileType:
                        C.FileType.PREFAB,
                    format:
                        () =>
                            global.SMPrefabFormat
                },
                {
                    kind:
                        'animation',
                    extension:
                        'smanim',
                    fileType:
                        C.FileType.ANIMATION,
                    format:
                        () =>
                            global.SMAnimationFormat
                },
                {
                    kind:
                        'texture',
                    extension:
                        'smtexture',
                    fileType:
                        C.FileType.TEXTURE,
                    format:
                        () =>
                            global.SMTextureFormat
                }
            ];

            for (
                const builtin
                of builtins
            ) {
                this.register({
                    id:
                        `builtin:${builtin.kind}`,
                    kind:
                        builtin.kind,
                    extension:
                        builtin.extension,
                    fileType:
                        builtin.fileType,
                    compile:
                        async (
                            ir,
                            options
                        ) => {
                            const Format =
                                builtin.format();

                            if (!Format) {
                                throw new Error(
                                    `${builtin.kind} native format is not loaded.`
                                );
                            }

                            const payload =
                                clone(
                                    ir.data ||
                                    {}
                                );

                            if (
                                payload &&
                                typeof payload ===
                                    'object' &&
                                !payload.uuid
                            ) {
                                payload.uuid =
                                    ir.uuid;
                            }

                            if (
                                payload &&
                                typeof payload ===
                                    'object' &&
                                !payload.name
                            ) {
                                payload.name =
                                    ir.name;
                            }

                            if (
                                payload &&
                                typeof payload ===
                                    'object' &&
                                !payload.dependencies
                            ) {
                                payload.dependencies =
                                    ir.dependencies ||
                                    [];
                            }

                            return Format.encode(
                                payload,
                                {
                                    ...options,
                                    uuid:
                                        ir.uuid,
                                    dependencies:
                                        ir.dependencies ||
                                        [],
                                    editorData:
                                        options.editorData ??
                                        ir.metadata
                                            ?.editorData,
                                    includeEditorData:
                                        options.includeEditorData !==
                                        false
                                }
                            );
                        }
                });
            }
        }

        register(compiler) {
            if (
                !compiler ||
                typeof compiler.compile !==
                    'function'
            ) {
                throw new TypeError(
                    'Compiler must provide compile(ir, options).'
                );
            }

            const id =
                String(
                    compiler.id ||
                    ''
                ).trim();

            const kind =
                String(
                    compiler.kind ||
                    ''
                )
                    .trim()
                    .toLowerCase();

            if (!id || !kind) {
                throw new TypeError(
                    'Compiler id and kind are required.'
                );
            }

            const record = {
                id,
                kind,
                extension:
                    String(
                        compiler.extension ||
                        ''
                    )
                        .replace(
                            /^\./,
                            ''
                        )
                        .toLowerCase(),
                fileType:
                    Number(
                        compiler.fileType ??
                        C.FileType.ASSET
                    ),
                compile:
                    compiler.compile.bind(
                        compiler
                    ),
                validate:
                    typeof compiler.validate ===
                        'function'
                        ? compiler.validate.bind(
                            compiler
                        )
                        : null
            };

            this.compilers.set(
                kind,
                record
            );

            return record;
        }

        unregister(kind) {
            return this.compilers.delete(
                String(kind)
                    .toLowerCase()
            );
        }

        get(kind) {
            return this.compilers.get(
                String(kind || '')
                    .toLowerCase()
            ) || null;
        }

        supports(kind) {
            return !!this.get(
                kind
            );
        }

        _defaultOutputName(
            ir,
            extension
        ) {
            const base =
                String(
                    ir.name ||
                    'Asset'
                ).replace(
                    /\.[^.]+$/,
                    ''
                );

            return `${base}.${extension}`;
        }

        async compile(
            ir,
            options = {}
        ) {
            if (
                !ir ||
                typeof ir !==
                    'object'
            ) {
                throw new TypeError(
                    'SMAssetCompiler.compile requires asset IR.'
                );
            }

            const kind =
                String(
                    ir.kind ||
                    ''
                )
                    .toLowerCase();

            const compiler =
                options.compilerId
                    ? [
                        ...this.compilers.values()
                    ].find(
                        item =>
                            item.id ===
                            options.compilerId
                    )
                    : this.get(
                        kind
                    );

            if (!compiler) {
                throw new Error(
                    `No native compiler registered for asset kind "${kind}".`
                );
            }

            if (
                compiler.validate
            ) {
                const result =
                    await compiler.validate(
                        ir,
                        options
                    );

                if (
                    result !== true &&
                    result != null
                ) {
                    throw new Error(
                        typeof result ===
                            'string'
                            ? result
                            : `Asset IR validation failed for "${ir.name}".`
                    );
                }
            }

            try {
                global.dispatchEvent?.(
                    new CustomEvent(
                        'sm:asset-compile-start',
                        {
                            detail: {
                                ir,
                                compiler:
                                    compiler.id
                            }
                        }
                    )
                );
            } catch (_) {}

            const startedAt =
                performance?.now?.() ??
                Date.now();

            const built =
                await compiler.compile(
                    ir,
                    options
                );

            if (
                !built?.bytes
            ) {
                throw new Error(
                    `Compiler "${compiler.id}" returned no binary bytes.`
                );
            }

            const outputName =
                options.outputName ||
                this._defaultOutputName(
                    ir,
                    compiler.extension
                );

            const buildHash =
                await global.SMChecksum.sha256Hex(
                    built.bytes
                );

            const result = {
                uuid:
                    built.uuid ||
                    ir.uuid,
                kind,
                compilerId:
                    compiler.id,
                extension:
                    compiler.extension,
                fileType:
                    compiler.fileType,
                outputName,
                outputPath:
                    options.outputPath ||
                    null,
                bytes:
                    built.bytes,
                arrayBuffer:
                    built.arrayBuffer ||
                    built.bytes.buffer,
                header:
                    built.header ||
                    null,
                buildHash,
                durationMs:
                    (
                        performance?.now?.() ??
                        Date.now()
                    ) -
                    startedAt
            };

            if (
                this.database &&
                options.register !==
                    false
            ) {
                let asset =
                    this.database.get(
                        result.uuid
                    );

                if (!asset) {
                    asset =
                        this.database.create({
                            uuid:
                                result.uuid,
                            name:
                                ir.name,
                            kind:
                                ir.kind,
                            sourcePath:
                                ir.source?.path ||
                                null
                        });
                }

                this.database.update(
                    asset.uuid,
                    {
                        compilerId:
                            compiler.id,
                        nativeFormat:
                            compiler.extension,
                        outputPath:
                            result.outputPath ||
                            asset.outputPath,
                        buildHash,
                        dirty:
                            false,
                        status:
                            'compiled',
                        lastCompiledAt:
                            Date.now()
                    }
                );

                this.database.setDependencies(
                    asset.uuid,
                    ir.dependencies ||
                    []
                );
            }

            try {
                global.dispatchEvent?.(
                    new CustomEvent(
                        'sm:asset-compile-complete',
                        {
                            detail: {
                                ir,
                                result
                            }
                        }
                    )
                );
            } catch (_) {}

            return result;
        }

        list() {
            return [
                ...this.compilers.values()
            ].map(
                item => ({
                    id:
                        item.id,
                    kind:
                        item.kind,
                    extension:
                        item.extension,
                    fileType:
                        item.fileType
                })
            );
        }
    }

    global.SMAssetCompiler =
        SMAssetCompiler;

    global.smAssetCompiler =
        global.smAssetCompiler ||
        new SMAssetCompiler();
})(typeof window !== 'undefined' ? window : globalThis);
