/**
 * SM ENGINE — UNREAL ASSET LOADER
 *
 * Runtime entry point for Unreal-related asset loading.
 *
 * Supported:
 *   - Unreal metadata recognition: .uasset / .umap / .uproject / .uplugin
 *   - Unreal package loading through SM Unreal Backend when available
 *   - Unreal-exported GLB / GLTF / FBX / OBJ through existing SM loaders
 *
 * Architecture:
 *
 *   AssetsPanelImportQueue
 *          ↓
 *   UnrealAssetLoader
 *          ↓
 *   UnrealAssetBackend
 *          ↓
 *   SMUnrealNativeBridge
 *          ↓
 *   CUE4Parse / native Unreal package parser
 *
 * IMPORTANT:
 *   The browser must NOT guess/decode arbitrary Unreal packages.
 *   If no Unreal backend is available, .uasset/.umap return
 *   "bridge-required" instead of pretending the asset was imported.
 */

(function () {
    'use strict';

    class UnrealAssetLoader {

        constructor(options = {}) {
            this.options = options;

            this.THREE =
                options.THREE ||
                window.THREE ||
                null;

            this.loaders =
                options.loaders ||
                {};

            this.registry =
                options.registry ||
                window.SMUnrealAssetRegistry ||
                null;

            this.backend =
                options.backend ||
                window.SMUnrealAssetBackend ||
                null;

            this.importer =
                options.importer ||
                window.SMUnrealAssetImporter ||
                null;
        }

        getExtension(name) {
            const clean = String(name || '').split(/[?#]/)[0];

            const base =
                clean.split(/[\\/]/).pop() || '';

            const dot = base.lastIndexOf('.');

            return dot >= 0
                ? base.slice(dot + 1).toLowerCase()
                : '';
        }

        detect(fileOrName) {
            const name =
                typeof fileOrName === 'string'
                    ? fileOrName
                    : (fileOrName && fileOrName.name) || '';

            const ext = this.getExtension(name);

            return {
                name,
                extension: ext,

                isUnreal: [
                    'uasset',
                    'umap',
                    'uproject',
                    'uplugin'
                ].includes(ext),

                isPackage: [
                    'uasset',
                    'umap'
                ].includes(ext),

                kind:
                    ext === 'uasset'
                        ? 'asset'
                        : ext === 'umap'
                            ? 'map'
                            : ext === 'uproject'
                                ? 'project'
                                : ext === 'uplugin'
                                    ? 'plugin'
                                    : [
                                        'glb',
                                        'gltf',
                                        'fbx',
                                        'obj'
                                    ].includes(ext)
                                        ? 'model'
                                        : 'unknown'
            };
        }

        canLoad(fileOrName) {
            const info = this.detect(fileOrName);

            return [
                'uasset',
                'umap',
                'uproject',
                'uplugin',
                'glb',
                'gltf',
                'fbx',
                'obj'
            ].includes(info.extension);
        }

        async load(file, options = {}) {

            if (!file) {
                throw new Error(
                    'UnrealAssetLoader: file is required.'
                );
            }

            const info = this.detect(file);

            /*
             * ---------------------------------------------------------
             * UNREAL PACKAGE
             * ---------------------------------------------------------
             */

            if (info.extension === 'uasset' ||
                info.extension === 'umap') {

                return await this._loadUnrealPackage(
                    file,
                    info,
                    options
                );
            }

            /*
             * ---------------------------------------------------------
             * UNREAL PROJECT / PLUGIN METADATA
             * ---------------------------------------------------------
             */

            if (info.extension === 'uproject' ||
                info.extension === 'uplugin') {

                return await this._loadUnrealMetadata(
                    file,
                    info
                );
            }

            /*
             * ---------------------------------------------------------
             * EXISTING THREE.JS RUNTIME FORMATS
             * ---------------------------------------------------------
             */

            return await this._loadExistingRuntimeFormat(
                file,
                info.extension
            );
        }

        async _loadUnrealPackage(file, info, options = {}) {

            /*
             * Preferred path:
             *
             * UnrealAssetImporter (orchestrates backend, GLB download, and GLTF parsing)
             */
            const importer =
                this.importer ||
                window.SMUnrealAssetImporter ||
                null;

            if (importer && typeof importer.import === 'function') {
                try {
                    const result = await importer.import(file, {
                        ...options,
                        format: info.extension
                    });

                    if (result) {
                        return {
                            ...result,
                            source: result.source || 'unreal',
                            format: result.format || info.extension,
                            file,
                            unreal: true
                        };
                    }
                } catch (error) {
                    return {
                        ok: false,
                        status: 'error',
                        source: 'unreal',
                        format: info.extension,
                        file,
                        error: error && error.message ? error.message : String(error),
                        message: `Unreal ${info.extension} import failed.`
                    };
                }
            }

            const backend =
                this.backend ||
                window.SMUnrealAssetBackend ||
                null;

            if (backend) {

                try {

                    let result;

                    /*
                     * Backend instance
                     */

                    if (typeof backend === 'object' &&
                        typeof backend.import === 'function') {

                        result = await backend.import(
                            file,
                            {
                                ...options,
                                format: info.extension
                            }
                        );
                    }

                    /*
                     * Backend constructor
                     */

                    else if (typeof backend === 'function') {

                        const instance =
                            new backend({
                                THREE: this.THREE,
                                registry: this.registry
                            });

                        if (instance &&
                            typeof instance.import === 'function') {

                            result = await instance.import(
                                file,
                                {
                                    ...options,
                                    format: info.extension
                                }
                            );

                        } else if (instance &&
                                   typeof instance.parse === 'function') {

                            result = await instance.parse(
                                file,
                                {
                                    ...options,
                                    format: info.extension
                                }
                            );
                        }
                    }

                    if (result) {

                        return {
                            ...result,

                            source:
                                result.source ||
                                'unreal',

                            format:
                                result.format ||
                                info.extension,

                            file,

                            unreal:
                                true
                        };
                    }

                } catch (error) {

                    return {
                        ok: false,
                        status: 'error',
                        source: 'unreal',
                        format: info.extension,
                        file,

                        error:
                            error &&
                            error.message
                                ? error.message
                                : String(error),

                        message:
                            `Unreal ${info.extension} import failed.`
                    };
                }
            }

            /*
             * No real backend available.
             *
             * Never pretend the asset was imported.
             */

            return {
                ok: false,

                status: 'bridge-required',

                source: 'unreal',

                format: info.extension,

                file,

                message:
                    `Direct ${info.extension} decoding requires ` +
                    'the SM Unreal package backend. ' +
                    'No binary conversion is attempted here.'
            };
        }

        async _loadUnrealMetadata(file, info) {

            let metadata = {
                name: file.name || '',
                size: Number(file.size || 0),
                type: file.type || '',
                extension: info.extension,
                kind: info.kind
            };

            /*
             * .uproject / .uplugin are JSON files.
             *
             * We can safely inspect them without Unreal Engine.
             */

            try {

                if (typeof file.text === 'function') {

                    const text = await file.text();

                    const json =
                        JSON.parse(text);

                    metadata = {
                        ...metadata,
                        data: json
                    };
                }

            } catch (error) {

                return {
                    ok: false,

                    status: 'metadata-error',

                    source: 'unreal',

                    format: info.extension,

                    file,

                    metadata,

                    error:
                        error &&
                        error.message
                            ? error.message
                            : String(error),

                    message:
                        `Unable to parse Unreal ${info.extension} metadata.`
                };
            }

            return {
                ok: true,

                status: 'metadata-only',

                source: 'unreal',

                format: info.extension,

                file,

                metadata
            };
        }

        async _loadExistingRuntimeFormat(
            file,
            extension
        ) {

            const loader =
                extension === 'glb' ||
                extension === 'gltf'
                    ? this.loaders.gltf

                    : extension === 'fbx'
                        ? this.loaders.fbx

                        : extension === 'obj'
                            ? this.loaders.obj

                            : null;

            if (!loader) {

                throw new Error(
                    `UnrealAssetLoader: no existing ` +
                    `${extension.toUpperCase()} loader was supplied.`
                );
            }

            /*
             * GLB / GLTF
             */

            if (extension === 'glb' ||
                extension === 'gltf') {

                const url =
                    URL.createObjectURL(file);

                try {

                    return await new Promise(
                        (resolve, reject) => {

                            loader.load(
                                url,
                                resolve,
                                undefined,
                                reject
                            );
                        }
                    );

                } finally {

                    URL.revokeObjectURL(url);
                }
            }

            /*
             * FBX
             */

            if (extension === 'fbx') {

                const buffer =
                    await file.arrayBuffer();

                return loader.parse(
                    buffer,
                    ''
                );
            }

            /*
             * OBJ
             */

            if (extension === 'obj') {

                const text =
                    await file.text();

                return loader.parse(text);
            }

            throw new Error(
                `UnrealAssetLoader: unsupported extension ${extension}.`
            );
        }
    }

    window.SMUnrealAssetLoader =
        UnrealAssetLoader;

})();