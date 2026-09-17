// engine/importers/blender/BlenderImporter.js
// SM Engine — .blend importer.
// Secure path:
//   File -> preload webUtils.getPathForFile -> main-process Blender -> GLB bytes.
(function () {
    'use strict';


    function getNode() {
        const req =
            (
                typeof window !==
                    'undefined' &&
                typeof window.require ===
                    'function'
            )
                ? window.require
                : (
                    typeof require ===
                        'function'
                        ? require
                        : null
                );

        if (!req) {
            return null;
        }

        try {
            let electron =
                null;

            try {
                electron =
                    req('electron');
            } catch (_) {}

            return {
                fs:
                    req('fs'),
                path:
                    req('path'),
                os:
                    req('os'),
                crypto:
                    req('crypto'),
                electron
            };
        } catch (_) {
            return null;
        }
    }


    function normalizeBytes(
        value
    ) {
        if (!value) {
            return null;
        }

        if (
            value instanceof
                Uint8Array
        ) {
            return value;
        }

        if (
            value instanceof
                ArrayBuffer
        ) {
            return new Uint8Array(
                value
            );
        }

        if (
            ArrayBuffer.isView(
                value
            )
        ) {
            return new Uint8Array(
                value.buffer,
                value.byteOffset,
                value.byteLength
            );
        }

        if (
            Array.isArray(
                value
            )
        ) {
            return new Uint8Array(
                value
            );
        }

        return null;
    }


    class BlenderImporter {

        constructor(
            options = {}
        ) {
            this.node =
                getNode();

            this.options = {
                cacheFolderName:
                    '.smcache',
                addToScene:
                    true,
                centerOnImport:
                    false,
                extractMaterialAssets:
                    true,
                /*
                 * Large converted GLBs stay on disk. This avoids copying them
                 * through Electron IPC and then into renderer memory before the
                 * user even places the asset in the scene.
                 */
                returnBytes:
                    false,
                maxInlineBytes:
                    32 *
                    1024 *
                    1024,
                ...options
            };

            this.detector =
                window.smBlenderDetector ||
                null;

            this.processBridge =
                window.smBlenderProcessBridge ||
                null;

            this.metadataBridge =
                window.smBlenderMetadataBridge ||
                null;

            this.textureBridge =
                window.smBlenderTextureBridge ||
                null;

            this.materialBridge =
                window.smBlenderMaterialBridge ||
                null;

            this.uiPanelBridge =
                window.smBlenderUIPanelBridge ||
                null;

            this.lastConversion =
                null;

            this.lastImport =
                null;
        }


        isSupportedFile(
            input
        ) {
            const name =
                typeof input ===
                    'string'
                    ? input
                    : input?.name ||
                        '';

            return /\.blend$/i.test(
                name
            );
        }


        _emit(
            name,
            detail = {}
        ) {
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


        async _resolveFilePath(
            input
        ) {
            if (
                typeof input ===
                'string'
            ) {
                return input;
            }

            /*
             * Legacy Electron File.path.
             */
            if (
                typeof input?.path ===
                    'string' &&
                input.path
            ) {
                return input.path;
            }

            /*
             * Legacy direct electron.webUtils.
             */
            try {
                const result =
                    this.node
                        ?.electron
                        ?.webUtils
                        ?.getPathForFile?.(
                            input
                        );

                if (
                    typeof result ===
                        'string' &&
                    result
                ) {
                    return result;
                }
            } catch (_) {}

            /*
             * Secure/current path through preload.
             */
            try {
                const result =
                    window.electronAPI
                        ?.getPathForFile?.(
                            input
                        );

                const resolved =
                    result &&
                    typeof result.then ===
                        'function'
                        ? await result
                        : result;

                if (
                    typeof resolved ===
                        'string' &&
                    resolved
                ) {
                    return resolved;
                }
            } catch (_) {}

            return null;
        }


        _resolveExporterScriptPath(
            explicitPath = null
        ) {
            if (explicitPath) {
                return explicitPath;
            }

            /*
             * Secure IPC mode does not need this path in the renderer.
             * Main process owns the fixed export_sm.py path.
             */
            if (
                window.electronAPI
                    ?.blender
                    ?.convert
            ) {
                return null;
            }

            if (!this.node) {
                return null;
            }

            const candidates =
                [];

            if (
                typeof process !==
                    'undefined' &&
                process.cwd
            ) {
                candidates.push(
                    this.node.path.join(
                        process.cwd(),
                        'engine',
                        'importers',
                        'blender',
                        'scripts',
                        'export_sm.py'
                    )
                );
            }

            if (
                window.SMEnginePaths
                    ?.root
            ) {
                candidates.push(
                    this.node.path.join(
                        window.SMEnginePaths.root,
                        'engine',
                        'importers',
                        'blender',
                        'scripts',
                        'export_sm.py'
                    )
                );
            }

            return (
                candidates.find(
                    candidate =>
                        this.node.fs.existsSync(
                            candidate
                        )
                ) ||
                candidates[0] ||
                null
            );
        }


        _hashSource(
            sourcePath
        ) {
            if (!this.node) {
                return String(
                    Date.now()
                );
            }

            let signature =
                sourcePath;

            try {
                const stat =
                    this.node.fs.statSync(
                        sourcePath
                    );

                signature +=
                    `|${stat.size}|${stat.mtimeMs}`;
            } catch (_) {}

            return this.node.crypto
                .createHash(
                    'sha1'
                )
                .update(
                    signature
                )
                .digest(
                    'hex'
                )
                .slice(
                    0,
                    12
                );
        }


        _defaultOutputDir(
            sourcePath
        ) {
            if (!this.node) {
                return null;
            }

            const sourceDir =
                this.node.path.dirname(
                    sourcePath
                );

            const baseName =
                this.node.path.basename(
                    sourcePath,
                    this.node.path.extname(
                        sourcePath
                    )
                );

            return this.node.path.join(
                sourceDir,
                this.options.cacheFolderName,
                'blender',
                `${baseName}_${this._hashSource(sourcePath)}`
            );
        }


        _resolveGLTFLoader() {
            if (
                window.gltfLoader
                    ?.load
            ) {
                return window.gltfLoader;
            }

            if (
                window.GLTFLoader
            ) {
                try {
                    return new window.GLTFLoader();
                } catch (_) {}
            }

            if (
                window.THREE
                    ?.GLTFLoader
            ) {
                try {
                    return new window.THREE.GLTFLoader();
                } catch (_) {}
            }

            return null;
        }


        _toFileURL(
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

            /*
             * GLTFLoader ultimately goes through fetch/XHR. Encode spaces and
             * other URL-sensitive characters while preserving drive letters.
             */
            return encodeURI(
                `file:///${normalized}`
            )
                .replace(
                    /#/g,
                    '%23'
                );
        }


        _loadGLBBytes(
            bytes
        ) {
            const loader =
                this._resolveGLTFLoader();

            if (!loader) {
                return Promise.reject(
                    new Error(
                        'GLTFLoader is not available. Load GLTFLoader before BlenderImporter.'
                    )
                );
            }

            const normalized =
                normalizeBytes(
                    bytes
                );

            if (!normalized) {
                return Promise.reject(
                    new Error(
                        'Converted Blender GLB bytes are unavailable.'
                    )
                );
            }

            /*
             * Slice the exact view; IPC buffers may have a non-zero byteOffset.
             */
            const arrayBuffer =
                normalized.buffer.slice(
                    normalized.byteOffset,
                    normalized.byteOffset +
                    normalized.byteLength
                );

            if (
                typeof loader.parse !==
                    'function'
            ) {
                return Promise.reject(
                    new Error(
                        'GLTFLoader.parse() is unavailable.'
                    )
                );
            }

            return new Promise(
                (resolve, reject) => {
                    loader.parse(
                        arrayBuffer,
                        '',
                        resolve,
                        reject
                    );
                }
            );
        }


        _loadGLBPath(
            filePath
        ) {
            const loader =
                this._resolveGLTFLoader();

            if (!loader) {
                return Promise.reject(
                    new Error(
                        'GLTFLoader is not available. Load GLTFLoader before BlenderImporter.'
                    )
                );
            }

            const url =
                this._toFileURL(
                    filePath
                );

            return new Promise(
                (resolve, reject) => {
                    loader.load(
                        url,
                        resolve,
                        undefined,
                        reject
                    );
                }
            );
        }


        _centerObject(
            root
        ) {
            if (
                !root ||
                !window.THREE?.Box3
            ) {
                return false;
            }

            const box =
                new THREE.Box3()
                    .setFromObject(
                        root
                    );

            if (
                box.isEmpty()
            ) {
                return false;
            }

            const center =
                box.getCenter(
                    new THREE.Vector3()
                );

            root.position.sub(
                center
            );

            return true;
        }


        async convertFile(
            input,
            options = {}
        ) {
            if (
                !this.isSupportedFile(
                    input
                )
            ) {
                throw new Error(
                    'BlenderImporter accepts only .blend files.'
                );
            }

            const sourcePath =
                await this._resolveFilePath(
                    input
                );

            if (!sourcePath) {
                throw new Error(
                    'Could not resolve the filesystem path of the selected .blend file. Make sure preload.js exposes electronAPI.getPathForFile().'
                );
            }

            this.detector =
                this.detector ||
                window.smBlenderDetector;

            this.processBridge =
                this.processBridge ||
                window.smBlenderProcessBridge;

            this.metadataBridge =
                this.metadataBridge ||
                window.smBlenderMetadataBridge;

            if (
                !this.detector ||
                !this.processBridge
            ) {
                throw new Error(
                    'Blender importer dependencies are not loaded.'
                );
            }

            if (
                !this.processBridge.isAvailable?.()
            ) {
                throw new Error(
                    'Blender process bridge is unavailable. Restart the Electron app after updating electron-main.js and preload.js.'
                );
            }

            /*
             * Direct-node mode can verify the source here.
             * Secure IPC mode validates it in the main process.
             */
            if (
                this.node &&
                !this.node.fs.existsSync(
                    sourcePath
                )
            ) {
                throw new Error(
                    `Blend file does not exist: ${sourcePath}`
                );
            }

            const detected =
                options.blenderPath
                    ? await this.detector
                        .validatePath(
                            options.blenderPath
                        )
                    : await this.detector
                        .detect();

            if (!detected?.valid) {
                throw new Error(
                    detected?.reason ||
                    'Blender executable not found.'
                );
            }

            const secureIPC =
                typeof window.electronAPI
                    ?.blender
                    ?.convert ===
                    'function';

            const exporterScript =
                secureIPC
                    ? null
                    : this._resolveExporterScriptPath(
                        options.exporterScriptPath
                    );

            if (
                !secureIPC &&
                (
                    !exporterScript ||
                    !this.node?.fs?.existsSync(
                        exporterScript
                    )
                )
            ) {
                throw new Error(
                    `Blender exporter script not found: ${exporterScript || '(unknown path)'}`
                );
            }

            const outputDir =
                secureIPC
                    ? null
                    : (
                        options.outputDir ||
                        this._defaultOutputDir(
                            sourcePath
                        )
                    );

            this._emit(
                'sm:blender-conversion-start',
                {
                    sourcePath,
                    outputDir,
                    blender:
                        detected,
                    transport:
                        secureIPC
                            ? 'electron-ipc'
                            : 'direct-node'
                }
            );

            const processResult =
                await this.processBridge
                    .runConversion({
                        blenderPath:
                            detected.path,
                        sourcePath,
                        outputDir,
                        exportScriptPath:
                            exporterScript,
                        applyModifiers:
                            options.applyModifiers !==
                            false,
                        exportAnimations:
                            options.exportAnimations !==
                            false,
                        exportCameras:
                            options.exportCameras !==
                            false,
                        exportLights:
                            options.exportLights !==
                            false,
                        returnBytes:
                            options.returnBytes ??
                            this.options.returnBytes,
                        maxInlineBytes:
                            options.maxInlineBytes ??
                            this.options.maxInlineBytes,
                        onLog:
                            options.onLog ||
                            null
                    });

            const metadataRaw =
                processResult.metadata ||
                (
                    processResult.metadataPath
                        ? this.metadataBridge
                            ?.read?.(
                                processResult.metadataPath
                            )
                        : null
                ) ||
                null;

            const metadata =
                this.metadataBridge
                    ?.normalize?.(
                        metadataRaw
                    ) ||
                metadataRaw;

            const result = {
                sourcePath,
                outputDir:
                    processResult.outputDir ||
                    outputDir ||
                    null,
                outputGlb:
                    processResult.outputGlb ||
                    processResult.runtimePath ||
                    null,
                runtimePath:
                    processResult.runtimePath ||
                    processResult.outputGlb ||
                    null,
                glbBytes:
                    normalizeBytes(
                        processResult.glbBytes
                    ),
                glbSize:
                    Number(
                        processResult.glbSize
                    ) ||
                    0,
                storageMode:
                    processResult.storageMode ||
                    (
                        processResult.glbBytes
                            ? 'ipc-inline'
                            : 'filesystem'
                    ),
                metadataPath:
                    processResult.metadataPath ||
                    null,
                blender:
                    processResult.blender ||
                    detected,
                metadata,
                summary:
                    this.metadataBridge
                        ?.summarize?.(
                            metadata
                        ) ||
                    null,
                process:
                    processResult
            };

            if (
                !result.glbBytes &&
                !result.outputGlb
            ) {
                throw new Error(
                    'Blender conversion finished without GLB bytes or a runtime GLB path.'
                );
            }

            this.lastConversion =
                result;

            this._emit(
                'sm:blender-conversion-complete',
                result
            );

            return result;
        }


        async loadConversion(
            conversion,
            options = {}
        ) {
            if (!conversion) {
                throw new Error(
                    'BlenderImporter.loadConversion() requires a conversion result.'
                );
            }

            const gltf =
                conversion.glbBytes
                    ? await this._loadGLBBytes(
                        conversion.glbBytes
                    )
                    : await this._loadGLBPath(
                        conversion.outputGlb
                    );

            const root =
                gltf.scene ||
                gltf.scenes?.[0] ||
                null;

            if (!root) {
                throw new Error(
                    'The converted GLB contains no scene.'
                );
            }

            const sourceName =
                options.sourceName ||
                conversion.sourceName ||
                String(conversion.sourcePath || 'BlenderAsset.blend')
                    .replace(/\\/g, '/')
                    .split('/')
                    .pop();

            root.name =
                root.name ||
                sourceName.replace(
                    /\.blend$/i,
                    ''
                );

            root.userData =
                root.userData ||
                {};

            root.userData.smImportedAsset =
                true;

            root.userData.smSourceFormat =
                'blend';

            root.userData.smSourcePath =
                conversion.sourcePath ||
                null;

            if (
                options.applyMetadata !==
                false
            ) {
                this.metadataBridge
                    ?.applyToObject3D?.(
                        root,
                        conversion.metadata
                    );
            }

            root.animations =
                gltf.animations ||
                root.animations ||
                [];

            this.textureBridge =
                this.textureBridge ||
                window.smBlenderTextureBridge ||
                null;

            this.materialBridge =
                this.materialBridge ||
                window.smBlenderMaterialBridge ||
                null;

            this.uiPanelBridge =
                this.uiPanelBridge ||
                window.smBlenderUIPanelBridge ||
                null;

            const runtimeAssets =
                options.prepareRuntime === false
                    ? null
                    : this.materialBridge
                        ?.prepareRuntime?.(
                            root,
                            {
                                metadata:
                                    conversion.metadata ||
                                    null,
                                renderer:
                                    options.renderer ||
                                    window.renderer ||
                                    null,
                                textureBridge:
                                    this.textureBridge
                            }
                        ) ||
                        this.textureBridge
                            ?.prepareRuntime?.(
                                root,
                                {
                                    metadata:
                                        conversion.metadata ||
                                        null,
                                    renderer:
                                        options.renderer ||
                                        window.renderer ||
                                        null
                                }
                            ) ||
                        null;

            const uiPanels =
                this.uiPanelBridge
                    ?.attach?.(
                        root,
                        conversion.metadata,
                        {
                            mount: false,
                            asset:
                                options.asset ||
                                null
                        }
                    ) ||
                [];

            root.updateMatrixWorld?.(
                true
            );

            return {
                gltf,
                root,
                sourceName,
                runtimeAssets,
                uiPanels
            };
        }


        disposeLoadedRoot(
            root
        ) {
            if (!root?.traverse) {
                return false;
            }

            this.uiPanelBridge
                ?.detach?.(
                    root
                );

            const textures =
                new Set();

            root.traverse(
                object => {
                    if (!object?.isMesh) {
                        return;
                    }

                    object.geometry
                        ?.dispose?.();

                    const materials =
                        Array.isArray(
                            object.material
                        )
                            ? object.material
                            : [object.material];

                    for (
                        const material
                        of materials
                    ) {
                        if (!material) {
                            continue;
                        }

                        for (
                            const value
                            of Object.values(
                                material
                            )
                        ) {
                            if (
                                value
                                    ?.isTexture
                            ) {
                                textures.add(
                                    value
                                );
                            }
                        }

                        material.dispose?.();
                    }
                }
            );

            for (
                const texture
                of textures
            ) {
                texture.dispose?.();
            }

            return true;
        }


        async importFile(
            input,
            options = {}
        ) {
            const conversion =
                await this.convertFile(
                    input,
                    options
                );

            const sourceName =
                typeof input ===
                    'string'
                    ? String(input)
                        .replace(/\\/g, '/')
                        .split('/')
                        .pop()
                    : input?.name ||
                        'BlenderAsset.blend';

            const loaded =
                await this.loadConversion(
                    conversion,
                    {
                        sourceName
                    }
                );

            const gltf =
                loaded.gltf;

            const root =
                loaded.root;

            if (
                options.centerOnImport ??
                this.options.centerOnImport
            ) {
                this._centerObject(
                    root
                );
            }

            this.textureBridge =
                this.textureBridge ||
                window.smBlenderTextureBridge ||
                null;

            this.materialBridge =
                this.materialBridge ||
                window.smBlenderMaterialBridge ||
                null;

            let extractedAssets =
                null;

            const extractMaterialAssets =
                options.extractMaterialAssets ??
                this.options.extractMaterialAssets;

            if (
                extractMaterialAssets &&
                this.materialBridge
                    ?.extractAndRegister &&
                window.AssetsPanel
            ) {
                try {
                    extractedAssets =
                        await this.materialBridge
                            .extractAndRegister(
                                root,
                                {
                                    panel:
                                        window.AssetsPanel,
                                    parentFolderId:
                                        options.folderId ??
                                        null,
                                    sourceName,
                                    sourcePath:
                                        conversion.sourcePath ||
                                        null,
                                    textureBridge:
                                        this.textureBridge,
                                    metadata:
                                        conversion.metadata ||
                                        null,
                                    renderer:
                                        options.renderer ||
                                        window.renderer ||
                                        null
                                }
                            );
                } catch (error) {
                    console.warn(
                        '[BlenderImporter] Material/texture asset extraction failed; model import continues:',
                        error
                    );
                }
            }

            const addToScene =
                options.addToScene ??
                this.options.addToScene;

            if (
                addToScene &&
                window.scene &&
                root.parent !==
                    window.scene
            ) {
                window.scene.add(
                    root
                );
            }

            if (
                addToScene &&
                options.mountUIPanels !== false &&
                loaded.uiPanels?.some?.(
                    panel => panel.autoOpen !== false
                )
            ) {
                this.uiPanelBridge
                    ?.mount?.(
                        root,
                        {
                            panels:
                                loaded.uiPanels,
                            container:
                                options.uiContainer ||
                                null
                        }
                    );
            }

            root.updateMatrixWorld?.(
                true
            );

            const result = {
                ...conversion,
                gltf,
                root,
                extractedAssets,
                runtimeAssets:
                    loaded.runtimeAssets ||
                    null,
                uiPanels:
                    loaded.uiPanels ||
                    []
            };

            this.lastImport =
                result;

            this._emit(
                'sm:blender-import-complete',
                result
            );

            window.updateHierarchy?.();
            window.refreshOutliner?.();

            return result;
        }


        cancel() {
            return (
                this.processBridge
                    ?.cancel?.() ||
                false
            );
        }
    }


    window.BlenderImporter =
        BlenderImporter;

    window.smBlenderImporter =
        window.smBlenderImporter ||
        new BlenderImporter();
})();
