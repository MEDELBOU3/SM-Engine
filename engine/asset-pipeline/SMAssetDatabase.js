// engine/asset-pipeline/SMAssetDatabase.js
// SM Engine — metadata database for source assets, native assets and build state.
(function (global) {
    'use strict';

    class SMAssetDatabase {
        constructor(options = {}) {
            this.storageKey =
                options.storageKey ||
                'sm_asset_database_v1';

            this.assets =
                new Map();

            this.bySource =
                new Map();

            this.byOutput =
                new Map();

            this.graph =
                options.graph ||
                global.smAssetDependencyGraph ||
                new global.SMAssetDependencyGraph();
        }

        _normalizeUUID(uuid) {
            if (
                global.SMAssetUUID?.isValid?.(
                    uuid
                )
            ) {
                return global.SMAssetUUID.normalize(
                    uuid
                );
            }

            throw new TypeError(
                `Invalid asset UUID: ${uuid}`
            );
        }

        _normalizePath(path) {
            return String(
                path ||
                ''
            )
                .replace(
                    /\\/g,
                    '/'
                )
                .replace(
                    /\/+/g,
                    '/'
                )
                .toLowerCase();
        }

        _emit(
            name,
            detail
        ) {
            try {
                global.dispatchEvent?.(
                    new CustomEvent(
                        name,
                        {
                            detail
                        }
                    )
                );
            } catch (_) {}
        }

        create(record = {}) {
            const uuid =
                record.uuid
                    ? this._normalizeUUID(
                        record.uuid
                    )
                    : global.SMAssetUUID.generate();

            if (
                this.assets.has(
                    uuid
                )
            ) {
                throw new Error(
                    `Asset already exists: ${uuid}`
                );
            }

            const now =
                Date.now();

            const asset = {
                uuid,
                name:
                    String(
                        record.name ||
                        'Asset'
                    ),
                kind:
                    String(
                        record.kind ||
                        'asset'
                    ),
                sourcePath:
                    record.sourcePath ||
                    null,
                outputPath:
                    record.outputPath ||
                    null,
                sourceFormat:
                    record.sourceFormat ||
                    null,
                nativeFormat:
                    record.nativeFormat ||
                    null,
                importerId:
                    record.importerId ||
                    null,
                compilerId:
                    record.compilerId ||
                    null,
                sourceHash:
                    record.sourceHash ||
                    null,
                buildHash:
                    record.buildHash ||
                    null,
                dirty:
                    record.dirty !== false,
                status:
                    record.status ||
                    'registered',
                tags:
                    Array.isArray(
                        record.tags
                    )
                        ? [
                            ...record.tags
                        ]
                        : [],
                metadata:
                    record.metadata &&
                    typeof record.metadata ===
                        'object'
                        ? {
                            ...record.metadata
                        }
                        : {},
                importSettings:
                    record.importSettings &&
                    typeof record.importSettings ===
                        'object'
                        ? {
                            ...record.importSettings
                        }
                        : {},
                createdAt:
                    record.createdAt ||
                    now,
                modifiedAt:
                    record.modifiedAt ||
                    now,
                lastImportedAt:
                    record.lastImportedAt ||
                    null,
                lastCompiledAt:
                    record.lastCompiledAt ||
                    null
            };

            this.assets.set(
                uuid,
                asset
            );

            this.graph.ensure(
                uuid
            );

            this._index(
                asset
            );

            this._emit(
                'sm:asset-db-created',
                {
                    asset
                }
            );

            return asset;
        }

        _index(asset) {
            if (
                asset.sourcePath
            ) {
                this.bySource.set(
                    this._normalizePath(
                        asset.sourcePath
                    ),
                    asset.uuid
                );
            }

            if (
                asset.outputPath
            ) {
                this.byOutput.set(
                    this._normalizePath(
                        asset.outputPath
                    ),
                    asset.uuid
                );
            }
        }

        _deindex(asset) {
            if (
                asset.sourcePath
            ) {
                this.bySource.delete(
                    this._normalizePath(
                        asset.sourcePath
                    )
                );
            }

            if (
                asset.outputPath
            ) {
                this.byOutput.delete(
                    this._normalizePath(
                        asset.outputPath
                    )
                );
            }
        }

        upsert(record = {}) {
            if (
                record.uuid &&
                this.assets.has(
                    this._normalizeUUID(
                        record.uuid
                    )
                )
            ) {
                return this.update(
                    record.uuid,
                    record
                );
            }

            if (
                record.sourcePath
            ) {
                const existing =
                    this.findBySource(
                        record.sourcePath
                    );

                if (existing) {
                    return this.update(
                        existing.uuid,
                        record
                    );
                }
            }

            return this.create(
                record
            );
        }

        update(
            uuid,
            patch = {}
        ) {
            const key =
                this._normalizeUUID(
                    uuid
                );

            const asset =
                this.assets.get(
                    key
                );

            if (!asset) {
                throw new Error(
                    `Asset not found: ${key}`
                );
            }

            this._deindex(
                asset
            );

            const protectedFields =
                new Set([
                    'uuid',
                    'createdAt'
                ]);

            for (
                const [
                    field,
                    value
                ]
                of Object.entries(
                    patch
                )
            ) {
                if (
                    protectedFields.has(
                        field
                    )
                ) {
                    continue;
                }

                if (
                    field === 'metadata' ||
                    field === 'importSettings'
                ) {
                    asset[field] = {
                        ...(asset[field] || {}),
                        ...(value || {})
                    };

                    continue;
                }

                if (
                    field === 'tags'
                ) {
                    asset.tags =
                        Array.isArray(
                            value
                        )
                            ? [
                                ...value
                            ]
                            : [];

                    continue;
                }

                asset[field] =
                    value;
            }

            asset.modifiedAt =
                Date.now();

            this._index(
                asset
            );

            this._emit(
                'sm:asset-db-updated',
                {
                    asset,
                    patch
                }
            );

            return asset;
        }

        remove(uuid) {
            const key =
                this._normalizeUUID(
                    uuid
                );

            const asset =
                this.assets.get(
                    key
                );

            if (!asset) {
                return false;
            }

            this._deindex(
                asset
            );

            this.assets.delete(
                key
            );

            this.graph.removeNode(
                key
            );

            this._emit(
                'sm:asset-db-removed',
                {
                    asset
                }
            );

            return true;
        }

        get(uuid) {
            if (!uuid) {
                return null;
            }

            try {
                return this.assets.get(
                    this._normalizeUUID(
                        uuid
                    )
                ) || null;
            } catch (_) {
                return null;
            }
        }

        findBySource(path) {
            const uuid =
                this.bySource.get(
                    this._normalizePath(
                        path
                    )
                );

            return uuid
                ? this.get(
                    uuid
                )
                : null;
        }

        findByOutput(path) {
            const uuid =
                this.byOutput.get(
                    this._normalizePath(
                        path
                    )
                );

            return uuid
                ? this.get(
                    uuid
                )
                : null;
        }

        query(predicate) {
            if (
                typeof predicate !==
                'function'
            ) {
                return [
                    ...this.assets.values()
                ];
            }

            return [
                ...this.assets.values()
            ].filter(
                predicate
            );
        }

        markDirty(
            uuid,
            reason = null
        ) {
            const asset =
                this.update(
                    uuid,
                    {
                        dirty: true,
                        status:
                            'dirty'
                    }
                );

            if (reason) {
                asset.metadata.dirtyReason =
                    reason;
            }

            for (
                const dependent
                of this.graph.dependentsOf(
                    uuid,
                    {
                        recursive: true
                    }
                )
            ) {
                const depAsset =
                    this.get(
                        dependent
                    );

                if (depAsset) {
                    depAsset.dirty =
                        true;

                    depAsset.status =
                        'dirty';

                    depAsset.metadata.dirtyReason =
                        `Dependency changed: ${uuid}`;
                }
            }

            return asset;
        }

        setDependencies(
            uuid,
            dependencies = []
        ) {
            const asset =
                this.get(
                    uuid
                );

            if (!asset) {
                throw new Error(
                    `Asset not found: ${uuid}`
                );
            }

            const uuids =
                dependencies
                    .map(dep =>
                        typeof dep ===
                            'string'
                            ? dep
                            : dep?.uuid
                    )
                    .filter(Boolean);

            this.graph.setDependencies(
                asset.uuid,
                uuids
            );

            asset.metadata.dependencies =
                uuids;

            asset.modifiedAt =
                Date.now();

            return uuids;
        }

        toJSON() {
            return {
                version: 1,
                assets: [
                    ...this.assets.values()
                ].map(
                    asset => ({
                        ...asset,
                        metadata: {
                            ...asset.metadata
                        },
                        importSettings: {
                            ...asset.importSettings
                        },
                        tags: [
                            ...asset.tags
                        ]
                    })
                ),
                graph:
                    this.graph.toJSON()
            };
        }

        fromJSON(data) {
            this.assets.clear();
            this.bySource.clear();
            this.byOutput.clear();

            this.graph.fromJSON(
                data?.graph ||
                {
                    nodes: []
                }
            );

            for (
                const record
                of data?.assets ||
                []
            ) {
                const asset = {
                    ...record,
                    tags:
                        Array.isArray(
                            record.tags
                        )
                            ? [
                                ...record.tags
                            ]
                            : [],
                    metadata:
                        {
                            ...(record.metadata || {})
                        },
                    importSettings:
                        {
                            ...(record.importSettings || {})
                        }
                };

                this.assets.set(
                    asset.uuid,
                    asset
                );

                this._index(
                    asset
                );

                this.graph.ensure(
                    asset.uuid
                );
            }

            return this;
        }

        save() {
            if (
                typeof localStorage ===
                'undefined'
            ) {
                return false;
            }

            localStorage.setItem(
                this.storageKey,
                JSON.stringify(
                    this.toJSON()
                )
            );

            return true;
        }

        load() {
            if (
                typeof localStorage ===
                'undefined'
            ) {
                return false;
            }

            const raw =
                localStorage.getItem(
                    this.storageKey
                );

            if (!raw) {
                return false;
            }

            this.fromJSON(
                JSON.parse(
                    raw
                )
            );

            return true;
        }

        clear() {
            this.assets.clear();
            this.bySource.clear();
            this.byOutput.clear();
            this.graph =
                new global.SMAssetDependencyGraph();
        }
    }

    global.SMAssetDatabase =
        SMAssetDatabase;

    global.smAssetDatabase =
        global.smAssetDatabase ||
        new SMAssetDatabase();
})(typeof window !== 'undefined' ? window : globalThis);
