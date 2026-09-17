// engine/asset-pipeline/SMAssetCooker.js
// SM Engine — cooks assets for runtime/platform builds.
// Resolves dependency order, strips editor data, compiles dirty assets and creates a manifest.
(function (global) {
    'use strict';

    class SMAssetCooker {
        constructor(options = {}) {
            this.database =
                options.database ||
                global.smAssetDatabase ||
                null;

            this.compiler =
                options.compiler ||
                global.smAssetCompiler ||
                null;

            this.irProvider =
                options.irProvider ||
                null;

            this.cache =
                new Map(); // uuid|platform|variant -> result
        }

        _cacheKey(
            uuid,
            platform,
            variant
        ) {
            return [
                uuid,
                platform ||
                    'generic',
                variant ||
                    'default'
            ].join('|');
        }

        setIRProvider(provider) {
            if (
                typeof provider !==
                    'function'
            ) {
                throw new TypeError(
                    'IR provider must be a function (asset, context) => IR.'
                );
            }

            this.irProvider =
                provider;

            return this;
        }

        clearCache() {
            this.cache.clear();
        }

        async _resolveIR(
            asset,
            context
        ) {
            if (
                typeof context.irProvider ===
                    'function'
            ) {
                return context.irProvider(
                    asset,
                    context
                );
            }

            if (
                typeof this.irProvider ===
                    'function'
            ) {
                return this.irProvider(
                    asset,
                    context
                );
            }

            if (
                asset.metadata?.ir
            ) {
                return asset.metadata.ir;
            }

            throw new Error(
                `No IR provider available for asset "${asset.name}" (${asset.uuid}).`
            );
        }

        async cookAsset(
            uuid,
            options = {}
        ) {
            if (
                !this.database ||
                !this.compiler
            ) {
                throw new Error(
                    'SMAssetCooker requires asset database and compiler.'
                );
            }

            const asset =
                this.database.get(
                    uuid
                );

            if (!asset) {
                throw new Error(
                    `Asset not found: ${uuid}`
                );
            }

            const platform =
                options.platform ||
                'generic';

            const variant =
                options.variant ||
                'default';

            const cacheKey =
                this._cacheKey(
                    asset.uuid,
                    platform,
                    variant
                );

            const cached =
                this.cache.get(
                    cacheKey
                );

            if (
                cached &&
                options.force !==
                    true &&
                !asset.dirty &&
                (
                    !asset.buildHash ||
                    cached.buildHash ===
                        asset.buildHash
                )
            ) {
                return {
                    ...cached,
                    fromCache:
                        true
                };
            }

            const ir =
                await this._resolveIR(
                    asset,
                    {
                        ...options,
                        asset,
                        database:
                            this.database,
                        compiler:
                            this.compiler
                    }
                );

            const compiled =
                await this.compiler.compile(
                    {
                        ...ir,
                        uuid:
                            asset.uuid
                    },
                    {
                        ...options,
                        includeEditorData:
                            false,
                        register:
                            true
                    }
                );

            const result = {
                ...compiled,
                assetUUID:
                    asset.uuid,
                assetName:
                    asset.name,
                platform,
                variant,
                fromCache:
                    false
            };

            this.cache.set(
                cacheKey,
                result
            );

            return result;
        }

        async cook(
            {
                roots = null,
                platform = 'generic',
                variant = 'default',
                force = false,
                irProvider = null
            } = {}
        ) {
            if (
                !this.database ||
                !this.compiler
            ) {
                throw new Error(
                    'SMAssetCooker requires asset database and compiler.'
                );
            }

            const requestedRoots =
                roots?.length
                    ? roots
                    : this.database
                        .query()
                        .map(
                            asset =>
                                asset.uuid
                        );

            const order =
                this.database.graph
                    .topologicalSort(
                        requestedRoots
                    );

            const outputs =
                new Map();

            const manifestAssets =
                [];

            try {
                global.dispatchEvent?.(
                    new CustomEvent(
                        'sm:asset-cook-start',
                        {
                            detail: {
                                roots:
                                    requestedRoots,
                                order,
                                platform,
                                variant
                            }
                        }
                    )
                );
            } catch (_) {}

            for (
                const uuid
                of order
            ) {
                const asset =
                    this.database.get(
                        uuid
                    );

                if (!asset) {
                    /*
                     * External/unregistered dependency:
                     * keep it in graph but don't try to compile it here.
                     */
                    continue;
                }

                const result =
                    await this.cookAsset(
                        uuid,
                        {
                            platform,
                            variant,
                            force,
                            irProvider
                        }
                    );

                outputs.set(
                    uuid,
                    result
                );

                manifestAssets.push({
                    uuid,
                    name:
                        asset.name,
                    kind:
                        asset.kind,
                    format:
                        result.extension,
                    file:
                        result.outputName,
                    byteLength:
                        result.bytes
                            .byteLength,
                    hash:
                        result.buildHash,
                    dependencies:
                        this.database.graph
                            .dependenciesOf(
                                uuid
                            )
                });
            }

            const manifest = {
                format:
                    'SM_COOK_MANIFEST',
                version:
                    1,
                platform,
                variant,
                createdAt:
                    new Date()
                        .toISOString(),
                roots:
                    requestedRoots,
                assets:
                    manifestAssets
            };

            const result = {
                platform,
                variant,
                order,
                outputs,
                manifest
            };

            try {
                global.dispatchEvent?.(
                    new CustomEvent(
                        'sm:asset-cook-complete',
                        {
                            detail:
                                result
                        }
                    )
                );
            } catch (_) {}

            return result;
        }

        async writeToDirectory(
            cookResult,
            directory,
            options = {}
        ) {
            const req =
                typeof global.require ===
                    'function'
                    ? global.require
                    : (
                        typeof require ===
                            'function'
                            ? require
                            : null
                    );

            if (!req) {
                throw new Error(
                    'Writing cooked assets requires Electron/Node filesystem access.'
                );
            }

            const fs =
                req('fs');

            const path =
                req('path');

            fs.mkdirSync(
                directory,
                {
                    recursive: true
                }
            );

            for (
                const [
                    uuid,
                    result
                ]
                of cookResult.outputs
            ) {
                const filename =
                    options.naming ===
                        'uuid'
                        ? `${uuid}.${result.extension}`
                        : result.outputName;

                fs.writeFileSync(
                    path.join(
                        directory,
                        filename
                    ),
                    Buffer.from(
                        result.bytes
                    )
                );
            }

            fs.writeFileSync(
                path.join(
                    directory,
                    'sm-cook-manifest.json'
                ),
                JSON.stringify(
                    cookResult.manifest,
                    null,
                    2
                ),
                'utf8'
            );

            return true;
        }
    }

    global.SMAssetCooker =
        SMAssetCooker;

    global.smAssetCooker =
        global.smAssetCooker ||
        new SMAssetCooker();
})(typeof window !== 'undefined' ? window : globalThis);
