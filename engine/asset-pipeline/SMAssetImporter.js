// engine/asset-pipeline/SMAssetImporter.js
// SM Engine — source asset importer registry.
// Importers convert external source files into a normalized intermediate representation (IR).
(function (global) {
    'use strict';

    function extensionOf(name = '') {
        const match =
            String(name || '')
                .trim()
                .toLowerCase()
                .match(/\.([a-z0-9_-]+)$/);

        return match?.[1] ||
            '';
    }

    function normalizeKind(value) {
        const kind =
            String(
                value ||
                'asset'
            )
                .trim()
                .toLowerCase();

        const aliases = {
            geometry:
                'mesh',
            image:
                'texture',
            hdri:
                'texture',
            model:
                'mesh',
            mat:
                'material',
            anim:
                'animation'
        };

        return aliases[kind] ||
            kind;
    }

    class SMAssetImporter {
        constructor(options = {}) {
            this.importers =
                new Map();

            this.byExtension =
                new Map();

            this.database =
                options.database ||
                global.smAssetDatabase ||
                null;
        }

        register(importer) {
            if (
                !importer ||
                typeof importer.import !==
                    'function'
            ) {
                throw new TypeError(
                    'Importer must provide import(source, context).'
                );
            }

            const id =
                String(
                    importer.id ||
                    ''
                ).trim();

            if (!id) {
                throw new TypeError(
                    'Importer id is required.'
                );
            }

            if (
                this.importers.has(
                    id
                )
            ) {
                throw new Error(
                    `Importer already registered: ${id}`
                );
            }

            const record = {
                id,
                label:
                    importer.label ||
                    id,
                priority:
                    Number(
                        importer.priority ||
                        0
                    ),
                extensions:
                    (
                        importer.extensions ||
                        []
                    ).map(
                        ext =>
                            String(ext)
                                .replace(
                                    /^\./,
                                    ''
                                )
                                .toLowerCase()
                    ),
                canImport:
                    typeof importer.canImport ===
                        'function'
                        ? importer.canImport.bind(
                            importer
                        )
                        : null,
                import:
                    importer.import.bind(
                        importer
                    )
            };

            this.importers.set(
                id,
                record
            );

            for (
                const ext
                of record.extensions
            ) {
                if (
                    !this.byExtension.has(
                        ext
                    )
                ) {
                    this.byExtension.set(
                        ext,
                        []
                    );
                }

                this.byExtension
                    .get(ext)
                    .push(
                        record
                    );

                this.byExtension
                    .get(ext)
                    .sort(
                        (a, b) =>
                            b.priority -
                            a.priority
                    );
            }

            return record;
        }

        unregister(id) {
            const record =
                this.importers.get(
                    id
                );

            if (!record) {
                return false;
            }

            this.importers.delete(
                id
            );

            for (
                const ext
                of record.extensions
            ) {
                const list =
                    this.byExtension.get(
                        ext
                    ) ||
                    [];

                this.byExtension.set(
                    ext,
                    list.filter(
                        item =>
                            item.id !==
                            id
                    )
                );
            }

            return true;
        }

        async resolve(
            source,
            options = {}
        ) {
            const name =
                typeof source ===
                    'string'
                    ? source
                    : (
                        source?.name ||
                        source?.path ||
                        ''
                    );

            const ext =
                extensionOf(
                    name
                );

            const candidates = [
                ...(
                    this.byExtension.get(
                        ext
                    ) ||
                    []
                ),
                ...[
                    ...this.importers.values()
                ].filter(
                    importer =>
                        !importer.extensions.length
                )
            ];

            for (
                const importer
                of candidates
            ) {
                if (
                    !importer.canImport ||
                    await importer.canImport(
                        source,
                        {
                            extension:
                                ext,
                            options
                        }
                    )
                ) {
                    return importer;
                }
            }

            return null;
        }

        normalizeIR(
            raw,
            {
                source,
                importer
            } = {}
        ) {
            if (
                !raw ||
                typeof raw !==
                    'object'
            ) {
                throw new Error(
                    `Importer "${importer?.id || 'unknown'}" returned invalid IR.`
                );
            }

            const kind =
                normalizeKind(
                    raw.kind ||
                    raw.type
                );

            const uuid =
                raw.uuid &&
                global.SMAssetUUID?.isValid?.(
                    raw.uuid
                )
                    ? global.SMAssetUUID.normalize(
                        raw.uuid
                    )
                    : global.SMAssetUUID.generate();

            return {
                irVersion:
                    Number(
                        raw.irVersion ||
                        1
                    ),
                uuid,
                kind,
                name:
                    raw.name ||
                    (
                        typeof source ===
                            'string'
                            ? source
                                .split(/[\\/]/)
                                .pop()
                            : source?.name
                    ) ||
                    'ImportedAsset',
                source:
                    raw.source ||
                    (
                        typeof source ===
                            'string'
                            ? {
                                path:
                                    source
                            }
                            : {
                                path:
                                    source?.path ||
                                    null,
                                name:
                                    source?.name ||
                                    null
                            }
                    ),
                data:
                    raw.data ??
                    raw.payload ??
                    {},
                dependencies:
                    Array.isArray(
                        raw.dependencies
                    )
                        ? raw.dependencies
                        : [],
                metadata:
                    raw.metadata &&
                    typeof raw.metadata ===
                        'object'
                        ? {
                            ...raw.metadata
                        }
                        : {},
                importSettings:
                    raw.importSettings &&
                    typeof raw.importSettings ===
                        'object'
                        ? {
                            ...raw.importSettings
                        }
                        : {}
            };
        }

        async import(
            source,
            options = {}
        ) {
            const importer =
                options.importerId
                    ? this.importers.get(
                        options.importerId
                    )
                    : await this.resolve(
                        source,
                        options
                    );

            if (!importer) {
                throw new Error(
                    `No source importer found for "${typeof source === 'string' ? source : source?.name || 'asset'}".`
                );
            }

            try {
                global.dispatchEvent?.(
                    new CustomEvent(
                        'sm:asset-import-start',
                        {
                            detail: {
                                source,
                                importer:
                                    importer.id
                            }
                        }
                    )
                );
            } catch (_) {}

            const raw =
                await importer.import(
                    source,
                    {
                        ...options,
                        database:
                            this.database,
                        importer:
                            this
                    }
                );

            const ir =
                this.normalizeIR(
                    raw,
                    {
                        source,
                        importer
                    }
                );

            ir.metadata.importerId =
                importer.id;

            if (
                options.register !==
                    false &&
                this.database
            ) {
                const sourcePath =
                    ir.source?.path ||
                    (
                        typeof source ===
                            'string'
                            ? source
                            : source?.path ||
                                null
                    );

                const asset =
                    this.database.upsert({
                        uuid:
                            options.preserveUUID !==
                                false
                                ? ir.uuid
                                : undefined,
                        name:
                            ir.name,
                        kind:
                            ir.kind,
                        sourcePath,
                        sourceFormat:
                            extensionOf(
                                sourcePath ||
                                ir.source?.name ||
                                ''
                            ),
                        importerId:
                            importer.id,
                        dirty:
                            true,
                        status:
                            'imported',
                        metadata:
                            ir.metadata,
                        importSettings:
                            ir.importSettings,
                        lastImportedAt:
                            Date.now()
                    });

                ir.uuid =
                    asset.uuid;

                this.database.setDependencies(
                    asset.uuid,
                    ir.dependencies
                );
            }

            try {
                global.dispatchEvent?.(
                    new CustomEvent(
                        'sm:asset-import-complete',
                        {
                            detail: {
                                source,
                                importer:
                                    importer.id,
                                ir
                            }
                        }
                    )
                );
            } catch (_) {}

            return ir;
        }

        list() {
            return [
                ...this.importers.values()
            ].map(
                importer => ({
                    id:
                        importer.id,
                    label:
                        importer.label,
                    extensions:
                        [
                            ...importer.extensions
                        ],
                    priority:
                        importer.priority
                })
            );
        }

        supports(filename) {
            return this.byExtension.has(
                extensionOf(
                    filename
                )
            );
        }

        static extensionOf(value) {
            return extensionOf(
                value
            );
        }
    }

    global.SMAssetImporter =
        SMAssetImporter;

    global.smAssetImporter =
        global.smAssetImporter ||
        new SMAssetImporter();
})(typeof window !== 'undefined' ? window : globalThis);
