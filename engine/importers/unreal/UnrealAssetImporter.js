/**
 * SM ENGINE — UNREAL ASSET IMPORTER
 * Coordinates Unreal package import via C# backend and GLTF loader.
 */
(function () {
    'use strict';

    class UnrealAssetImporter {
        constructor(options = {}) {
            this.options = options;
            this.backend = options.backend || window.SMUnrealAssetBackend || null;
            this.registry = options.registry || window.SMUnrealAssetRegistry || null;
            this.gltfLoader = options.gltfLoader || (typeof THREE !== 'undefined' && THREE.GLTFLoader ? new THREE.GLTFLoader() : null);
        }

        async import(file, options = {}) {
            if (!file) {
                throw new Error('UnrealAssetImporter: file is required.');
            }

            const fileName = file.name || '';
            const ext = (fileName.split('.').pop() || '').toLowerCase();

            // Skip companion files so they don't create duplicate cards
            if (['uexp', 'ubulk', 'uptnl', 'utoc', 'ucas'].includes(ext)) {
                return {
                    ok: false,
                    status: 'companion-skipped',
                    format: ext,
                    file,
                    message: `Skipping companion binary file ${fileName}. Payload will be read through the primary package.`
                };
            }

            if (ext !== 'uasset' && ext !== 'umap') {
                return {
                    ok: false,
                    status: 'delegate-existing-loader',
                    format: ext,
                    file
                };
            }

            const backend = this.backend || window.SMUnrealAssetBackend;
            if (!backend) {
                return {
                    ok: false,
                    status: 'backend-unavailable',
                    format: ext,
                    file,
                    message: 'SM Unreal Bridge backend is unavailable.'
                };
            }

            if (typeof options.onProgress === 'function') {
                options.onProgress(20, 'Parsing package...');
            }

            const response = await backend.import(file, options);
            if (!response || !response.ok) {
                return {
                    ok: false,
                    status: response?.status || 'import-failed',
                    format: ext,
                    file,
                    error: response?.message || 'Unreal import failed.',
                    diagnostics: response?.diagnostics || []
                };
            }

            if (typeof options.onProgress === 'function') {
                options.onProgress(60, 'Extracting mesh & generating GLB...');
            }

            const glbPath = response.metadata?.glbPath;
            let sceneObject = null;

            if (glbPath) {
                try {
                    const arrayBuffer = await backend.downloadGlb(glbPath);
                    if (typeof options.onProgress === 'function') {
                        options.onProgress(85, 'Loading Three.js geometry...');
                    }

                    sceneObject = await this._parseGlb(arrayBuffer);
                } catch (loadErr) {
                    console.warn('[SM Unreal Importer] GLB download/parse failed:', loadErr);
                }
            }

            if (sceneObject) {
                sceneObject.userData = sceneObject.userData || {};
                sceneObject.userData.smSourceFormat = 'unreal';
                sceneObject.userData.smUnreal = true;
                sceneObject.userData.smUnrealPackage = response.metadata?.packagePath || '';
                sceneObject.userData.smUnrealObject = response.metadata?.meshName || '';
                sceneObject.userData.smUnrealSource = fileName;
                sceneObject.userData.smGlbPath = glbPath;
            }

            if (this.registry && typeof this.registry.register === 'function') {
                this.registry.register(file, {
                    format: ext,
                    source: fileName,
                    packagePath: response.metadata?.packagePath,
                    meshName: response.metadata?.meshName,
                    glbPath: glbPath,
                    status: 'ready'
                });

                if (sceneObject && typeof this.registry.registerRuntimeObject === 'function') {
                    this.registry.registerRuntimeObject(file, sceneObject);
                }
            }

            if (typeof options.onProgress === 'function') {
                options.onProgress(100, 'Ready');
            }

            return {
                ok: true,
                status: 'imported',
                format: ext,
                sourceFile: file,
                object: sceneObject,
                glbPath,
                metadata: response.metadata,
                diagnostics: response.diagnostics
            };
        }

        async _parseGlb(arrayBuffer) {
            const loader = this.gltfLoader || (typeof THREE !== 'undefined' && THREE.GLTFLoader ? new THREE.GLTFLoader() : null);
            if (!loader) {
                throw new Error('THREE.GLTFLoader is not available in runtime.');
            }

            return await new Promise((resolve, reject) => {
                loader.parse(
                    arrayBuffer,
                    '',
                    (gltf) => {
                        const scene = gltf.scene || (gltf.scenes && gltf.scenes[0]) || null;
                        resolve(scene);
                    },
                    (err) => reject(err)
                );
            });
        }
    }

    window.SMUnrealAssetImporter = window.SMUnrealAssetImporter || new UnrealAssetImporter();
    window.UnrealAssetImporter = UnrealAssetImporter;
})();