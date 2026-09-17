(function (global) {
    'use strict';

    function fileURL(filePath) {
        const value = String(filePath || '')
            .replace(/\\/g, '/');

        if (!value) return null;
        if (/^file:\/\//i.test(value)) return value;

        return encodeURI(
            value.startsWith('/')
                ? `file://${value}`
                : `file:///${value}`
        );
    }

    function basename(filePath) {
        return String(filePath || '')
            .replace(/\\/g, '/')
            .split('/')
            .pop() ||
            'BlendSwapAsset.blend';
    }

    function createId() {
        return (
            typeof crypto !== 'undefined' &&
            typeof crypto.randomUUID === 'function'
        )
            ? `asset_${crypto.randomUUID()}`
            : `asset_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    }

    class BlendSwapAssetImporter {
        constructor(options = {}) {
            this.options = {
                registerAsset: true,
                addToScene: true,
                ...options
            };

            this.lastImport = null;
        }

        _panel() {
            return global.AssetsPanel || null;
        }

        _importer() {
            return global.smBlenderImporter || null;
        }

        _createAssetRecord(
            panel,
            asset,
            download,
            conversion,
            folderId = null
        ) {
            const runtimePath =
                conversion?.runtimePath ||
                conversion?.outputGlb ||
                null;

            if (!runtimePath) {
                throw new Error(
                    'Blender conversion produced no runtime GLB path.'
                );
            }

            const runtimeSize = Number(
                conversion?.glbSize ||
                conversion?.runtimeSize ||
                0
            ) || 0;

            const sourceName =
                basename(download?.blendPath);

            const licenseInfo =
                global.SMBlendSwapLicense
                    ?.describe?.(asset) ||
                {};

            const record = {
                id: createId(),
                name: sourceName,
                type: 'model',
                data: fileURL(runtimePath),
                thumbnail:
                    panel?._svgIcon?.('model') ||
                    null,
                isFavorite: false,
                isBuiltIn: false,
                folderId,
                tags: [
                    'model',
                    'blender',
                    'blend',
                    'blendswap',
                    'disk-backed',
                    ...(asset?.category?.slug
                        ? [asset.category.slug]
                        : []),
                    ...(licenseInfo.key
                        ? [licenseInfo.key]
                        : [])
                ],
                history: [],
                references: [],
                storageKind: 'filesystem-path',
                storageKey: runtimePath,
                storageMode: 'filesystem',
                runtimePath,
                runtimeURL: fileURL(runtimePath),
                runtimeSize,
                sourceType: 'blendswap-import',
                sourceSize: Number(
                    download?.sizeBytes ||
                    asset?.sizeBytes ||
                    0
                ),
                sourceLastModified: Date.now(),

                sourceFormat: 'blend',
                runtimeFormat: 'glb',
                blenderSourcePath:
                    download?.blendPath ||
                    null,
                blenderMetadataPath:
                    conversion?.metadataPath ||
                    null,
                blenderMetadata:
                    conversion?.metadata ||
                    null,
                blenderVersion:
                    conversion?.blender ||
                    null,

                blendSwap: {
                    assetId:
                        asset?.id ||
                        download?.assetId ||
                        null,
                    title:
                        asset?.title ||
                        null,
                    sourceUrl:
                        asset?.url ||
                        null,
                    category:
                        asset?.category ||
                        null,
                    author:
                        asset?.author ||
                        null,
                    license:
                        asset?.license ||
                        null,
                    licenseSource:
                        asset?.licenseSource ||
                        asset?.license?.license_source ||
                        'uploader_declared',
                    file:
                        asset?.primaryFile ||
                        asset?.files?.[0] ||
                        null,
                    downloadedPath:
                        download?.downloadedPath ||
                        null,
                    blendPath:
                        download?.blendPath ||
                        null,
                    importedAt: Date.now(),
                    attribution:
                        global.SMBlendSwapLicense
                            ?.attributionText?.(asset) ||
                        ''
                }
            };

            panel?._autoTagAsset?.(record);

            return record;
        }

        _registerRecord(panel, record) {
            panel.assets =
                Array.isArray(panel.assets)
                    ? panel.assets
                    : [];

            const conflict = panel.assets.find(
                (entry) =>
                    entry?.blendSwap?.assetId ===
                        record.blendSwap?.assetId &&
                    entry?.name === record.name
            );

            if (conflict) {
                return conflict;
            }

            panel.assets.push(record);

            panel._commitAssetVersion?.(
                record.id,
                'Initial BlendSwap Import'
            );

            panel._saveToStorage?.();

            if (typeof panel.onAssetAdded === 'function') {
                panel.onAssetAdded(record);
            }

            panel.render?.();
            panel._buildTagCloud?.();

            return record;
        }

        async _addConvertedToScene(conversion, asset) {
            const importer = this._importer();

            const runtimePath =
                conversion?.runtimePath ||
                conversion?.outputGlb;

            if (
                !runtimePath ||
                typeof importer?._loadGLBPath !== 'function'
            ) {
                return null;
            }

            const gltf =
                await importer._loadGLBPath(runtimePath);

            const root =
                gltf?.scene ||
                gltf?.scenes?.[0] ||
                null;

            if (!root) return null;

            root.name =
                root.name ||
                asset?.title ||
                'BlendSwap Scene';

            root.userData =
                root.userData ||
                {};

            Object.assign(
                root.userData,
                {
                    smImportedAsset: true,
                    smSourceFormat: 'blend',
                    smSourcePath:
                        conversion.sourcePath ||
                        null,
                    smBlendSwapAssetId:
                        asset?.id ||
                        null,
                    smBlendSwap: true
                }
            );

            importer.metadataBridge
                ?.applyToObject3D?.(
                    root,
                    conversion.metadata
                );

            global.scene?.add?.(root);

            root.updateMatrixWorld?.(true);

            global.updateHierarchy?.();
            global.refreshOutliner?.();

            return { gltf, root };
        }

        async importAsset(asset, options = {}) {
            const client =
                options.client ||
                global.smBlendSwapClient;

            const importer =
                this._importer();

            if (!client) {
                throw new Error('BlendSwapClient is not loaded.');
            }

            if (!importer?.convertFile) {
                throw new Error(
                    'SM BlenderImporter.convertFile() is not available.'
                );
            }

            const download =
                options.download ||
                await client.download(asset);

            if (!download?.blendPath) {
                throw new Error(
                    'BlendSwap download produced no .blend path.'
                );
            }

            const conversion =
                await importer.convertFile(
                    download.blendPath,
                    {
                        addToScene: false,
                        returnBytes: false
                    }
                );

            const panel = this._panel();
            let assetRecord = null;

            const registerAsset =
                options.registerAsset ??
                this.options.registerAsset;

            if (registerAsset && panel) {
                assetRecord =
                    this._createAssetRecord(
                        panel,
                        asset,
                        download,
                        conversion,
                        options.folderId ?? null
                    );

                assetRecord =
                    this._registerRecord(
                        panel,
                        assetRecord
                    );
            }

            const addToScene =
                options.addToScene ??
                this.options.addToScene;

            let sceneImport = null;

            if (addToScene) {
                sceneImport =
                    await this._addConvertedToScene(
                        conversion,
                        asset
                    );
            }

            const result = {
                ok: true,
                asset,
                download,
                conversion,
                assetRecord,
                sceneImport
            };

            this.lastImport = result;

            try {
                global.dispatchEvent(
                    new CustomEvent(
                        'sm:blendswap-import-complete',
                        { detail: result }
                    )
                );
            } catch (_) {}

            return result;
        }
    }

    global.SMBlendSwapAssetImporter =
        BlendSwapAssetImporter;

    global.smBlendSwapAssetImporter =
        global.smBlendSwapAssetImporter ||
        new BlendSwapAssetImporter();
})(typeof window !== 'undefined' ? window : globalThis);
