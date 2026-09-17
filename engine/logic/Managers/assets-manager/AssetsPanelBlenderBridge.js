// engine/logic/Managers/assets-manager/AssetsPanelBlenderBridge.js
// SM Engine — AssetsPanel integration for native-feeling .blend support.
//
// Design:
//   .blend selected/dropped in AssetsPanel
//       -> BlenderImporter.convertFile()
//       -> Blender Headless exports GLB + metadata
//       -> converted GLB stays disk-backed in .smcache
//       -> AssetsPanel stores only path + metadata (no giant IPC/base64/blob copy)
//       -> asset keeps the original .blend name/source metadata
//       -> preview/add-to-scene load the cached GLB on demand
(function () {
    'use strict';

    function getNode() {
        const req =
            (typeof window !== 'undefined' &&
             typeof window.require === 'function')
                ? window.require
                : (typeof require === 'function'
                    ? require
                    : null);

        if (!req) return null;

        try {
            return {
                fs: req('fs'),
                path: req('path')
            };
        } catch (_) {
            return null;
        }
    }

    const node =
        getNode();

    const STATE_KEY =
        '__smAssetsPanelBlenderBridgeInstalled';

    /*
     * Automatic material/texture extraction parses the whole GLB. Keep it
     * automatic for normal assets, but defer it for large scenes so a 80MB+
     * .blend import can finish quickly and without a second full GLB parse.
     */
    const AUTO_EXTRACT_LIMIT_BYTES =
        48 *
        1024 *
        1024;

    function toFileURL(
        filePath
    ) {
        if (!filePath) {
            return '';
        }

        if (
            /^file:\/\//i.test(
                filePath
            )
        ) {
            return filePath;
        }

        const normalized =
            String(
                filePath
            )
                .replace(
                    /\\/g,
                    '/'
                )
                .replace(
                    /^\/+/, ''
                );

        return encodeURI(
            `file:///${normalized}`
        )
            .replace(
                /#/g,
                '%23'
            );
    }

    function getRuntimeSize(
        conversion
    ) {
        const reported =
            Number(
                conversion?.glbSize ||
                conversion?.process?.glbSize
            );

        if (
            Number.isFinite(
                reported
            ) &&
            reported >= 0
        ) {
            return reported;
        }

        if (
            node?.fs &&
            conversion?.outputGlb
        ) {
            try {
                return Number(
                    node.fs.statSync(
                        conversion.outputGlb
                    ).size
                ) ||
                0;
            } catch (_) {}
        }

        return 0;
    }

    function createAssetId() {
        return (
            typeof crypto !==
                'undefined' &&
            typeof crypto.randomUUID ===
                'function'
        )
            ? `asset_${crypto.randomUUID()}`
            : `asset_${Date.now()}_${Math.floor(
                Math.random() *
                1000000
            )}`;
    }

    function createDiskBackedAsset(
        panel,
        originalFile,
        folderId,
        conversion
    ) {
        const runtimePath =
            conversion?.outputGlb ||
            conversion?.runtimePath ||
            null;

        if (!runtimePath) {
            return null;
        }

        let finalFileName =
            originalFile?.name ||
            'BlenderAsset.blend';

        let existingAsset =
            panel.assets?.find?.(
                asset =>
                    !asset.isBuiltIn &&
                    asset.name ===
                        finalFileName &&
                    (asset.folderId ||
                        null) ===
                        (folderId ||
                            null)
            ) ||
            null;

        let shouldOverwrite =
            false;

        if (existingAsset) {
            const response =
                prompt(
                    `Asset '${finalFileName}' already exists in this folder.\n` +
                    `Enter a NEW NAME to rename, type 'overwrite' to replace, or leave blank to skip:`,
                    finalFileName
                );

            if (
                response ===
                    null ||
                response.trim() ===
                    ''
            ) {
                console.log(
                    `[AssetsPanelBlenderBridge] Skipped '${finalFileName}'.`
                );
                return null;
            }

            if (
                response
                    .trim()
                    .toLowerCase() ===
                    'overwrite'
            ) {
                shouldOverwrite =
                    true;
            } else {
                finalFileName =
                    response.trim();

                const conflict =
                    panel.assets?.some?.(
                        asset =>
                            !asset.isBuiltIn &&
                            asset.name ===
                                finalFileName &&
                            (asset.folderId ||
                                null) ===
                                (folderId ||
                                    null)
                    );

                if (conflict) {
                    alert(
                        `The new name '${finalFileName}' also conflicts with an existing asset. Skipping.`
                    );
                    return null;
                }
            }
        }

        if (
            shouldOverwrite &&
            existingAsset
        ) {
            panel._removeAsset?.(
                existingAsset.id
            );
        }

        const runtimeSize =
            getRuntimeSize(
                conversion
            );

        const asset = {
            id:
                createAssetId(),
            name:
                finalFileName,
            type:
                'model',
            data:
                toFileURL(
                    runtimePath
                ),
            thumbnail:
                panel._svgIcon?.(
                    'model'
                ) ||
                null,
            isFavorite:
                false,
            isBuiltIn:
                false,
            folderId,
            tags: [
                'model',
                'blender',
                'blend',
                'disk-backed'
            ],
            history: [],
            references: [],
            /*
             * No IndexedDB Blob for converted .blend output. The GLB cache is
             * already persistent on disk beside the source .blend.
             */
            storageKind:
                'filesystem-path',
            storageKey:
                runtimePath,
            storageMode:
                'filesystem',
            runtimePath,
            runtimeURL:
                toFileURL(
                    runtimePath
                ),
            runtimeSize,
            sourceType:
                'blender-import',
            sourceSize:
                Number(
                    originalFile?.size ||
                    0
                ),
            sourceLastModified:
                Number(
                    originalFile?.lastModified ||
                    0
                )
        };

        panel._autoTagAsset?.(
            asset
        );

        panel.assets =
            Array.isArray(
                panel.assets
            )
                ? panel.assets
                : [];

        panel.assets.push(
            asset
        );

        panel._commitAssetVersion?.(
            asset.id,
            'Initial Blender Import (disk-backed)'
        );

        panel._saveToStorage?.();

        if (
            typeof panel.onAssetAdded ===
                'function'
        ) {
            panel.onAssetAdded(
                asset
            );
        }

        panel.render?.();
        panel._buildTagCloud?.();

        return asset;
    }

    function isBlendName(name = '') {
        return /\.blend$/i.test(
            String(name || '')
        );
    }

    function replaceExtension(
        name,
        extension
    ) {
        const value =
            String(name || 'BlenderAsset.blend');

        return /\.[^.]+$/.test(value)
            ? value.replace(
                /\.[^.]+$/,
                extension
            )
            : value + extension;
    }

    function getAssetPanel() {
        return (
            window.AssetsPanel ||
            null
        );
    }

    function getImporter() {
        return (
            window.smBlenderImporter ||
            null
        );
    }

    function dispatch(name, detail = {}) {
        try {
            window.dispatchEvent(
                new CustomEvent(
                    name,
                    {
                        detail
                    }
                )
            );
        } catch (_) {}
    }

    function normalizeConvertedBytes(
        value
    ) {
        if (!value) return null;

        if (value instanceof Uint8Array) {
            return value;
        }

        if (value instanceof ArrayBuffer) {
            return new Uint8Array(value);
        }

        if (ArrayBuffer.isView(value)) {
            return new Uint8Array(
                value.buffer,
                value.byteOffset,
                value.byteLength
            );
        }

        if (Array.isArray(value)) {
            return new Uint8Array(value);
        }

        return null;
    }

    function createConvertedFile(
        conversion,
        originalFile
    ) {
        let bytes =
            normalizeConvertedBytes(
                conversion?.glbBytes
            );

        /*
         * Legacy fallback only. The new secure Electron path returns GLB bytes
         * over IPC, so renderer filesystem access is no longer required.
         */
        if (
            !bytes &&
            node?.fs &&
            conversion?.outputGlb
        ) {
            const buffer =
                node.fs.readFileSync(
                    conversion.outputGlb
                );

            bytes =
                new Uint8Array(
                    buffer
                );
        }

        if (!bytes) {
            throw new Error(
                'Blender conversion returned no GLB bytes.'
            );
        }

        const options = {
            type:
                'model/gltf-binary',
            lastModified:
                Number(
                    originalFile
                        ?.lastModified
                ) ||
                Date.now()
        };

        if (
            typeof File ===
            'function'
        ) {
            return new File(
                [
                    bytes
                ],
                originalFile?.name ||
                    'BlenderAsset.blend',
                options
            );
        }

        const blob =
            new Blob(
                [
                    bytes
                ],
                {
                    type:
                        options.type
                }
            );

        Object.defineProperty(
            blob,
            'name',
            {
                configurable:
                    true,
                value:
                    originalFile?.name ||
                    'BlenderAsset.blend'
            }
        );

        Object.defineProperty(
            blob,
            'lastModified',
            {
                configurable:
                    true,
                value:
                    options.lastModified
            }
        );

        return blob;
    }

    function makeFileViewWithExtension(
        file,
        extension
    ) {
        if (!file) return file;

        const view =
            Object.create(
                file
            );

        try {
            Object.defineProperty(
                view,
                'name',
                {
                    configurable: true,
                    enumerable: true,
                    value:
                        replaceExtension(
                            file.name,
                            extension
                        )
                }
            );
        } catch (_) {
            return {
                name:
                    replaceExtension(
                        file.name,
                        extension
                    ),
                type:
                    file.type
            };
        }

        return view;
    }

    function markInputSupport(panel) {
        const inputs = [
            panel?.dom?.uploadInput,
            document.getElementById(
                'uploadInput'
            )
        ].filter(Boolean);

        for (const input of inputs) {
            const current =
                String(
                    input.getAttribute(
                        'accept'
                    ) ||
                    ''
                ).trim();

            if (!current) {
                /*
                 * Do not restrict an unrestricted input. .blend is already
                 * selectable when accept is empty.
                 */
                continue;
            }

            const entries =
                current
                    .split(',')
                    .map(value =>
                        value.trim()
                    )
                    .filter(Boolean);

            if (
                !entries.some(
                    value =>
                        value.toLowerCase() ===
                        '.blend'
                )
            ) {
                entries.push(
                    '.blend'
                );

                input.setAttribute(
                    'accept',
                    entries.join(',')
                );
            }
        }
    }

    function decorateAsset(
        panel,
        asset,
        originalFile,
        conversion
    ) {
        if (!asset) return asset;

        asset.sourceType =
            'blender-import';

        asset.sourceFormat =
            'blend';

        asset.runtimeFormat =
            'glb';

        asset.storageMode =
            asset.storageMode ||
            conversion.storageMode ||
            conversion.process
                ?.storageMode ||
            'filesystem';

        asset.runtimePath =
            conversion.outputGlb ||
            conversion.runtimePath ||
            asset.runtimePath ||
            null;

        asset.runtimeURL =
            asset.runtimePath
                ? toFileURL(
                    asset.runtimePath
                )
                : asset.runtimeURL ||
                    null;

        asset.runtimeSize =
            getRuntimeSize(
                conversion
            );

        asset.blenderSourcePath =
            conversion.sourcePath ||
            null;

        asset.blenderVersion =
            conversion.blender
                ?.version ||
            null;

        asset.blenderMetadataPath =
            conversion.metadataPath ||
            null;

        asset.blenderImportSummary =
            conversion.summary ||
            null;

        /*
         * Keep normalized metadata directly on the asset. This is useful for
         * Inspector/rigging/animation tooling without reopening Blender.
         */
        asset.blenderMetadata =
            conversion.metadata ||
            null;

        asset.blenderUIPanels =
            window.smBlenderUIPanelBridge
                ?.extract?.(
                    conversion.metadata
                ) ||
            [];

        asset.tags =
            Array.isArray(asset.tags)
                ? asset.tags
                : [];

        for (const tag of [
            'blender',
            'blend',
            'model'
        ]) {
            if (
                !asset.tags.includes(
                    tag
                )
            ) {
                asset.tags.push(
                    tag
                );
            }
        }

        if (asset.blenderUIPanels.length) {
            for (const tag of ['viewport-ui', 'interactive-ui']) {
                if (!asset.tags.includes(tag)) asset.tags.push(tag);
            }
        }

        panel._saveToStorage?.();
        panel.render?.();
        panel._buildTagCloud?.();

        dispatch(
            'sm:assets-blender-asset-added',
            {
                asset,
                sourceFile:
                    originalFile,
                conversion
            }
        );

        return asset;
    }

    async function extractMaterialAssets(
        panel,
        importer,
        conversion,
        originalFile,
        folderId
    ) {
        const materialBridge =
            window.smBlenderMaterialBridge ||
            null;

        if (
            !materialBridge
                ?.extractAndRegister ||
            !importer
                ?.loadConversion
        ) {
            return null;
        }

        let loaded =
            null;

        try {
            loaded =
                await importer
                    .loadConversion(
                        conversion,
                        {
                            sourceName:
                                originalFile?.name ||
                                'BlenderAsset.blend'
                        }
                    );

            return await materialBridge
                .extractAndRegister(
                    loaded.root,
                    {
                        panel,
                        parentFolderId:
                            folderId,
                        sourceName:
                            originalFile?.name ||
                            loaded.sourceName ||
                            'BlenderAsset.blend',
                        sourcePath:
                            conversion.sourcePath ||
                            null,
                        textureBridge:
                            window.smBlenderTextureBridge ||
                            null,
                        metadata:
                            conversion.metadata ||
                            null,
                        renderer:
                            window.renderer ||
                            null
                    }
                );
        } finally {
            if (
                loaded?.root
            ) {
                importer
                    .disposeLoadedRoot?.(
                        loaded.root
                    );
            }
        }
    }


    function decorateExtraction(
        panel,
        asset,
        extraction
    ) {
        if (
            !asset ||
            !extraction
        ) {
            return asset;
        }

        asset.blenderExtractedAssets = {
            rootFolderId:
                extraction.folders
                    ?.rootFolderId ||
                null,
            materialsFolderId:
                extraction.folders
                    ?.materialsFolderId ||
                null,
            texturesFolderId:
                extraction.folders
                    ?.texturesFolderId ||
                null,
            materials:
                extraction.extractedMaterials ||
                0,
            materialTotal:
                extraction.materialCount ||
                0,
            textures:
                extraction.textures
                    ?.extracted ||
                0,
            textureTotal:
                extraction.textures
                    ?.total ||
                0,
            materialAssetIds:
                (extraction.materialAssets || [])
                    .map(item => item?.id)
                    .filter(Boolean),
            textureAssetIds:
                (extraction.textures?.assets || [])
                    .map(item => item?.id)
                    .filter(Boolean)
        };

        asset.references = [
            ...new Set([
                ...(asset.references || []),
                ...asset.blenderExtractedAssets
                    .materialAssetIds,
                ...asset.blenderExtractedAssets
                    .textureAssetIds
            ])
        ];

        asset.tags = [
            ...new Set([
                ...(asset.tags || []),
                'materials-extracted',
                'textures-extracted'
            ])
        ];

        panel._saveToStorage?.();
        panel.render?.();
        panel._buildTagCloud?.();

        return asset;
    }


    function install() {
        if (
            window[STATE_KEY] === true
        ) {
            return true;
        }

        const panel =
            getAssetPanel();

        const importer =
            getImporter();

        if (
            !panel ||
            !importer ||
            typeof panel._addAssetFromFile !==
                'function'
        ) {
            return false;
        }

        const originalGetAssetType =
            panel._getAssetType
                ?.bind(panel);

        const originalAddAssetFromFile =
            panel._addAssetFromFile
                .bind(panel);

        const originalGenerateThumbnail =
            panel._generateThumbnail
                ?.bind(panel);

        const originalUpdatePreview =
            panel._updatePreview
                ?.bind(panel);

        const originalAddToScene =
            panel._addToScene
                ?.bind(panel);

        /*
         * 1. Type detection
         * --------------------------------------------------------------
         * All existing upload/drop/folder-import routes already call
         * _addAssetFromFile(), so this one hook makes .blend visible to every
         * AssetsPanel ingestion path.
         */
        panel._getAssetType =
            function (
                filename
            ) {
                if (
                    isBlendName(
                        filename
                    )
                ) {
                    return 'model';
                }

                return (
                    originalGetAssetType
                        ?.(
                            filename
                        ) ||
                    null
                );
            };

        /*
         * 2. Ingestion
         * --------------------------------------------------------------
         * Convert .blend -> cached GLB, then register a light AssetsPanel
         * record that points to the GLB on disk. Do NOT create another File,
         * do NOT copy the GLB into IndexedDB, and do NOT generate a heavy
         * thumbnail during import.
         */
        panel._addAssetFromFile =
            async function (
                file,
                folderId = null
            ) {
                if (
                    !isBlendName(
                        file?.name
                    )
                ) {
                    return originalAddAssetFromFile(
                        file,
                        folderId
                    );
                }

                const activeImporter =
                    getImporter();

                if (
                    !activeImporter
                        ?.convertFile
                ) {
                    throw new Error(
                        'BlenderImporter.convertFile() is not available.'
                    );
                }

                dispatch(
                    'sm:assets-blender-import-start',
                    {
                        file,
                        folderId
                    }
                );

                try {
                    const conversion =
                        await activeImporter
                            .convertFile(
                                file,
                                {
                                    addToScene:
                                        false
                                }
                            );

                    let asset =
                        createDiskBackedAsset(
                            this,
                            file,
                            folderId,
                            conversion
                        );

                    /*
                     * Compatibility fallback for an older conversion service
                     * that returns bytes but no path.
                     */
                    if (
                        !asset &&
                        !conversion?.outputGlb &&
                        !conversion?.runtimePath
                    ) {
                        const convertedFile =
                            createConvertedFile(
                                conversion,
                                file
                            );

                        asset =
                            await originalAddAssetFromFile(
                                convertedFile,
                                folderId
                            );
                    }

                    if (!asset) {
                        return null;
                    }

                    decorateAsset(
                        this,
                        asset,
                        file,
                        conversion
                    );

                    let extractedAssets =
                        null;

                    const runtimeSize =
                        getRuntimeSize(
                            conversion
                        );

                    const autoExtract =
                        runtimeSize <=
                            AUTO_EXTRACT_LIMIT_BYTES;

                    if (autoExtract) {
                        try {
                            extractedAssets =
                                await extractMaterialAssets(
                                    this,
                                    activeImporter,
                                    conversion,
                                    file,
                                    folderId
                                );

                            if (extractedAssets) {
                                conversion.extractedAssets =
                                    extractedAssets;

                                decorateExtraction(
                                    this,
                                    asset,
                                    extractedAssets
                                );
                            }
                        } catch (extractionError) {
                            /*
                             * Material extraction must never invalidate a model
                             * that Blender already converted successfully.
                             */
                            console.warn(
                                '[AssetsPanelBlenderBridge] Model imported, but material/texture extraction failed:',
                                extractionError
                            );
                        }
                    } else {
                        asset.blenderMaterialExtraction =
                            'deferred-large-file';

                        asset.tags = [
                            ...new Set([
                                ...(asset.tags || []),
                                'materials-deferred'
                            ])
                        ];

                        this._saveToStorage?.();

                        console.info(
                            `[AssetsPanelBlenderBridge] Large Blender asset imported disk-backed (${(
                                runtimeSize /
                                (1024 * 1024)
                            ).toFixed(1)} MB GLB). Material extraction deferred.`
                        );
                    }

                    dispatch(
                        'sm:assets-blender-import-complete',
                        {
                            asset,
                            conversion,
                            extractedAssets
                        }
                    );

                    return asset;
                } catch (error) {
                    console.error(
                        '[AssetsPanelBlenderBridge] Import failed:',
                        error
                    );

                    dispatch(
                        'sm:assets-blender-import-error',
                        {
                            file,
                            folderId,
                            error
                        }
                    );

                    /*
                     * Re-throw so the calling AssetsPanel UI can decide how it
                     * wants to surface the error.
                     */
                    throw error;
                }
            };

        /*
         * 3. Thumbnail
         * --------------------------------------------------------------
         * The bytes are GLB, so let the existing GLB thumbnail path render
         * them instead of returning the generic model icon for ".blend".
         */
        if (
            originalGenerateThumbnail
        ) {
            panel._generateThumbnail =
                function (
                    dataURL,
                    type,
                    file
                ) {
                    const sourceFile =
                        type === 'model' &&
                        isBlendName(
                            file?.name
                        )
                            ? makeFileViewWithExtension(
                                file,
                                '.glb'
                            )
                            : file;

                    return originalGenerateThumbnail(
                        dataURL,
                        type,
                        sourceFile
                    );
                };
        }

        /*
         * 4. Inspector preview
         * --------------------------------------------------------------
         * Current AssetsPanel preview explicitly supports glb/gltf/fbx/obj and
         * rejects unknown model extensions. Temporarily expose ".glb" only to
         * that loader-selection branch; the actual asset name remains .blend.
         */
        if (
            originalUpdatePreview
        ) {
            panel._updatePreview =
                async function (
                    asset,
                    ...rest
                ) {
                    if (
                        !asset ||
                        asset.type !==
                            'model' ||
                        !isBlendName(
                            asset.name
                        )
                    ) {
                        return originalUpdatePreview(
                            asset,
                            ...rest
                        );
                    }

                    const originalName =
                        asset.name;

                    try {
                        asset.name =
                            replaceExtension(
                                originalName,
                                '.glb'
                            );

                        return await originalUpdatePreview(
                            asset,
                            ...rest
                        );
                    } finally {
                        asset.name =
                            originalName;
                    }
                };
        }

        /*
         * 5. Scene hydration
         * --------------------------------------------------------------
         * AssetsPanel loads the cached GLB directly. Re-attach Blender's rich
         * metadata after that load, configure texture color spaces/PBR state,
         * and mount only declarative (sandboxed) UI panels in the viewport.
         */
        if (originalAddToScene) {
            panel._addToScene =
                async function (
                    assetId,
                    event = null,
                    options = {}
                ) {
                    const asset =
                        this._findById?.(assetId) ||
                        null;

                    const root =
                        await originalAddToScene(
                            assetId,
                            event,
                            options
                        );

                    if (
                        !root ||
                        !asset ||
                        !(
                            asset.sourceFormat === 'blend' ||
                            isBlendName(asset.name)
                        )
                    ) {
                        return root;
                    }

                    const metadata =
                        asset.blenderMetadata ||
                        null;

                    window.smBlenderMetadataBridge
                        ?.applyToObject3D?.(
                            root,
                            metadata
                        );

                    const runtimeAssets =
                        window.smBlenderMaterialBridge
                            ?.prepareRuntime?.(
                                root,
                                {
                                    metadata,
                                    renderer:
                                        window.renderer ||
                                        this.renderer ||
                                        null,
                                    textureBridge:
                                        window.smBlenderTextureBridge ||
                                        null
                                }
                            ) ||
                        window.smBlenderTextureBridge
                            ?.prepareRuntime?.(
                                root,
                                {
                                    metadata,
                                    renderer:
                                        window.renderer ||
                                        this.renderer ||
                                        null
                                }
                            ) ||
                        null;

                    root.userData ||= {};
                    root.userData.smSourceAssetId = asset.id;
                    root.userData.smSourceFormat = 'blend';

                    const uiPanels =
                        window.smBlenderUIPanelBridge
                            ?.attach?.(
                                root,
                                metadata,
                                {
                                    asset,
                                    mount: false
                                }
                            ) ||
                        [];

                    if (
                        options.mountBlenderUI !== false &&
                        uiPanels.some(panel => panel.autoOpen !== false)
                    ) {
                        window.smBlenderUIPanelBridge
                            ?.mount?.(
                                root,
                                {
                                    panels: uiPanels,
                                    container:
                                        options.uiContainer ||
                                        null
                                }
                            );
                    }

                    dispatch(
                        'sm:assets-blender-scene-ready',
                        {
                            asset,
                            root,
                            runtimeAssets,
                            uiPanels
                        }
                    );

                    return root;
                };
        }

        /*
         * Current _addToScene() already falls back to GLTFLoader for model
         * extensions other than glb/fbx/obj, so it can consume our converted
         * GLB bytes without another invasive patch.
         */

        markInputSupport(
            panel
        );

        window[STATE_KEY] =
            true;

        async function extractMaterialsForAsset(
            assetOrId
        ) {
            const asset =
                typeof assetOrId ===
                    'string'
                    ? panel._findById?.(
                        assetOrId
                    )
                    : assetOrId;

            if (
                !asset ||
                asset.sourceFormat !==
                    'blend'
            ) {
                throw new Error(
                    'A Blender AssetsPanel asset is required.'
                );
            }

            const activeImporter =
                getImporter();

            const conversion = {
                sourcePath:
                    asset.blenderSourcePath ||
                    null,
                outputGlb:
                    asset.runtimePath ||
                    asset.storageKey ||
                    null,
                runtimePath:
                    asset.runtimePath ||
                    asset.storageKey ||
                    null,
                glbSize:
                    Number(
                        asset.runtimeSize
                    ) ||
                    0,
                metadataPath:
                    asset.blenderMetadataPath ||
                    null,
                metadata:
                    asset.blenderMetadata ||
                    null,
                summary:
                    asset.blenderImportSummary ||
                    null,
                blender: {
                    version:
                        asset.blenderVersion ||
                        null
                },
                storageMode:
                    'filesystem'
            };

            const extraction =
                await extractMaterialAssets(
                    panel,
                    activeImporter,
                    conversion,
                    {
                        name:
                            asset.name
                    },
                    asset.folderId ||
                    null
                );

            if (extraction) {
                decorateExtraction(
                    panel,
                    asset,
                    extraction
                );

                asset.blenderMaterialExtraction =
                    'complete';

                panel._saveToStorage?.();
            }

            return extraction;
        }

        window.SMAssetsPanelBlenderBridge = {
            installed: true,
            panel,
            importer,
            isBlendName,
            extractMaterials:
                extractMaterialsForAsset,
            AUTO_EXTRACT_LIMIT_BYTES,
            textureBridge:
                window.smBlenderTextureBridge ||
                null,
            materialBridge:
                window.smBlenderMaterialBridge ||
                null,
            uiPanelBridge:
                window.smBlenderUIPanelBridge ||
                null
        };

        console.log(
            '[AssetsPanelBlenderBridge] .blend support installed.'
        );

        dispatch(
            'sm:assets-blender-ready',
            {
                panel,
                importer
            }
        );

        return true;
    }

    /*
     * Load this script after AssetsPanelBootstrap.js. The retry is only a
     * safety net for alternative boot orders.
     */
    if (!install()) {
        let attempts = 0;

        const timer =
            setInterval(
                () => {
                    attempts += 1;

                    if (
                        install() ||
                        attempts >= 120
                    ) {
                        clearInterval(
                            timer
                        );
                    }
                },
                100
            );
    }
})();
