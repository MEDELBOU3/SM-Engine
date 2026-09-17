/**
 * SM ENGINE — UNREAL ASSET RUNTIME BRIDGE
 *
 * Connects the Unreal package loader & backend to the existing AssetsPanel and viewport
 * runtime without replacing the current GLB/GLTF/FBX/OBJ pipelines.
 */
(function () {
    'use strict';

    const BRIDGE_KEY = '__smUnrealRuntimeBridgeInstalled';

    function isUnrealPackage(name = '') {
        return /\.(uasset|umap)$/i.test(String(name || ''));
    }

    function isCompanionFile(name = '') {
        return /\.(uexp|ubulk|uptnl|utoc|ucas)$/i.test(String(name || ''));
    }

    function isUnrealMetadata(name = '') {
        return /\.(uproject|uplugin)$/i.test(String(name || ''));
    }

    class UnrealAssetRuntimeBridge {
        constructor(options = {}) {
            this.options = options;
            this.loader = options.loader ||
                (window.SMUnrealAssetLoader ? new window.SMUnrealAssetLoader(options) : null);
            this.importer = options.importer ||
                window.SMUnrealAssetImporter ||
                null;
            this.registry = options.registry ||
                window.SMUnrealAssetRegistry ||
                null;
        }

        async importFile(file, options = {}) {
            const importer = this.importer || window.SMUnrealAssetImporter;
            if (importer && typeof importer.import === 'function') {
                return await importer.import(file, options);
            }

            if (this.loader && typeof this.loader.load === 'function') {
                return await this.loader.load(file, options);
            }

            return {
                ok: false,
                status: 'loader-unavailable',
                format: (file?.name || '').split('.').pop().toLowerCase(),
                file,
                message: 'No Unreal importer or loader is available.'
            };
        }

        static install(panel) {
            panel = panel || window.AssetsPanel;
            if (!panel || panel[BRIDGE_KEY]) {
                return panel?.[BRIDGE_KEY] || null;
            }

            const originalGetAssetType = panel._getAssetType?.bind(panel);
            const originalAddAssetFromFile = panel._addAssetFromFile?.bind(panel);
            const originalUpdatePreview = panel._updatePreview?.bind(panel);
            const originalAddToScene = panel._addToScene?.bind(panel);

            // 1. Asset type classification
            panel._getAssetType = function (filename) {
                if (isUnrealPackage(filename)) {
                    return 'model';
                }
                if (isCompanionFile(filename)) {
                    return 'unreal-companion';
                }
                return originalGetAssetType?.(filename) || null;
            };

            // 2. Ingestion pipeline
            panel._addAssetFromFile = async function (file, folderId = null) {
                const name = file?.name || '';

                // Silently skip companion files - payload is loaded through primary .uasset
                if (isCompanionFile(name)) {
                    console.info(`[SM Unreal Bridge] Skipping companion payload file: ${name}`);
                    return null;
                }

                if (!isUnrealPackage(name)) {
                    return originalAddAssetFromFile(file, folderId);
                }

                const importer = window.SMUnrealAssetImporter;
                if (!importer || typeof importer.import !== 'function') {
                    console.warn('[SM Unreal Bridge] SMUnrealAssetImporter unavailable. Falling back to default import.');
                    return originalAddAssetFromFile(file, folderId);
                }

                const result = await importer.import(file, { folderId });
                if (!result || !result.ok) {
                    console.error('[SM Unreal Bridge] Import failed:', result?.error || result?.message);
                    throw new Error(result?.error || result?.message || `Failed to import Unreal package ${name}`);
                }

                const downloadURL = result.glbPath
                    ? `http://127.0.0.1:8765/download?file=${encodeURIComponent(result.glbPath)}`
                    : null;

                const asset = {
                    id: `unreal_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
                    name: file.name,
                    type: 'model',
                    data: downloadURL,
                    thumbnail: panel._svgIcon?.('model') || null,
                    isFavorite: false,
                    isBuiltIn: false,
                    folderId,
                    tags: ['model', 'unreal', file.name.split('.').pop().toLowerCase(), 'disk-backed'],
                    history: [],
                    references: [],
                    storageKind: 'filesystem-path',
                    storageKey: result.glbPath,
                    storageMode: 'filesystem',
                    runtimePath: result.glbPath,
                    runtimeURL: downloadURL,
                    runtimeSize: Number(file.size || 0),
                    sourceType: 'unreal-import',
                    sourceFormat: 'unreal',
                    unreal: true,
                    glbPath: result.glbPath,
                    metadata: result.metadata || null,
                    sourceSize: Number(file.size || 0),
                    sourceLastModified: Number(file.lastModified || 0)
                };

                panel._autoTagAsset?.(asset);
                panel.assets = Array.isArray(panel.assets) ? panel.assets : [];
                panel.assets.push(asset);
                panel._commitAssetVersion?.(asset.id, 'Initial Unreal Import (disk-backed)');
                panel._saveToStorage?.();

                if (typeof panel.onAssetAdded === 'function') {
                    panel.onAssetAdded(asset);
                }

                panel.render?.();
                panel._buildTagCloud?.();

                try {
                    window.dispatchEvent(new CustomEvent('sm:assets-unreal-asset-added', {
                        detail: { asset, sourceFile: file, result }
                    }));
                } catch (_) {}

                return asset;
            };

            // 3. Asset preview
            if (originalUpdatePreview) {
                panel._updatePreview = async function (asset, ...rest) {
                    if (!asset || asset.type !== 'model' || (!asset.unreal && !isUnrealPackage(asset.name))) {
                        return originalUpdatePreview(asset, ...rest);
                    }

                    if (!this.previewScene || !this.dom?.assetPreviewContainer) return;
                    this._clearPreview?.();
                    this.dom.assetPreviewContainer.classList.add('loading');

                    try {
                        const gltfLoader = this.loaders?.gltf || (typeof THREE !== 'undefined' && THREE.GLTFLoader ? new THREE.GLTFLoader() : null);
                        if (!gltfLoader) {
                            console.warn('[SM Unreal Preview] No GLTF loader available.');
                            return;
                        }

                        const modelUrl = asset.data || asset.runtimeURL;
                        if (!modelUrl) {
                            console.warn('[SM Unreal Preview] No model URL for preview.');
                            return;
                        }

                        const gltf = await new Promise((resolve, reject) => {
                            gltfLoader.load(modelUrl, resolve, undefined, reject);
                        });

                        this.previewModel = gltf.scene || gltf;

                        const bbox = new THREE.Box3().setFromObject(this.previewModel);
                        if (!bbox.isEmpty()) {
                            const size = bbox.getSize(new THREE.Vector3());
                            const center = bbox.getCenter(new THREE.Vector3());
                            const maxDim = Math.max(size.x, size.y, size.z);
                            const scaleFactor = 1.5 / maxDim;
                            this.previewModel.scale.setScalar(scaleFactor);
                            this.previewModel.position.sub(center.multiplyScalar(scaleFactor));
                        }

                        this.previewScene.add(this.previewModel);
                        this.dom.assetPreviewContainer.classList.remove('loading');
                        if (typeof this._renderPreview === 'function') {
                            this._renderPreview();
                        }
                    } catch (err) {
                        console.warn('[SM Unreal Preview] Failed to load preview:', err);
                        this._clearPreview?.();
                        this.dom.assetPreviewContainer.classList.remove('loading');
                    }
                };
            }

            // 4. Viewport placement
            if (originalAddToScene) {
                panel._addToScene = async function (assetId, event = null, options = {}) {
                    const asset = this._findById?.(assetId) ||
                        (Array.isArray(this.assets) ? this.assets.find(a => a.id === assetId) : null);

                    if (!asset || (!asset.unreal && !isUnrealPackage(asset?.name))) {
                        return originalAddToScene(assetId, event, options);
                    }

                    const gltfLoader = this.loaders?.gltf || (typeof THREE !== 'undefined' && THREE.GLTFLoader ? new THREE.GLTFLoader() : null);
                    if (!gltfLoader) {
                        console.error('[SM Unreal AddToScene] THREE.GLTFLoader is not available.');
                        return null;
                    }

                    const modelUrl = asset.data || asset.runtimeURL;
                    if (!modelUrl) {
                        console.error('[SM Unreal AddToScene] No model URL for asset', asset);
                        return null;
                    }

                    try {
                        const gltf = await new Promise((resolve, reject) => {
                            gltfLoader.load(modelUrl, resolve, undefined, reject);
                        });

                        const modelObject = gltf.scene || gltf;

                        // Tag with rich Unreal metadata
                        modelObject.userData = modelObject.userData || {};
                        modelObject.userData.smSourceFormat = 'unreal';
                        modelObject.userData.smUnreal = true;
                        modelObject.userData.smUnrealPackage = asset.metadata?.packagePath || '';
                        modelObject.userData.smUnrealObject = asset.metadata?.meshName || '';
                        modelObject.userData.smUnrealSource = asset.name || '';
                        modelObject.userData.smGlbPath = asset.glbPath || asset.runtimePath || '';

                        // Scale and position
                        const bbox = new THREE.Box3().setFromObject(modelObject);
                        if (!bbox.isEmpty()) {
                            const size = bbox.getSize(new THREE.Vector3());
                            const targetMaxDim = 1.8;
                            const currentMaxDim = Math.max(size.x, size.y, size.z);
                            if (currentMaxDim > 0) {
                                const scaleFactor = targetMaxDim / currentMaxDim;
                                modelObject.scale.setScalar(scaleFactor);
                            }
                            const newBbox = new THREE.Box3().setFromObject(modelObject);
                            const newCenter = newBbox.getCenter(new THREE.Vector3());
                            modelObject.position.sub(newCenter);
                        }

                        const cleanName = (asset.name || 'UnrealModel').replace(/\.[^/.]+$/, '');
                        if (typeof window.addObjectToScene === 'function') {
                            window.addObjectToScene(modelObject, cleanName);
                        } else if (panel.scene) {
                            panel.scene.add(modelObject);
                        }

                        if (typeof this.onAssetAdded === 'function') {
                            this.onAssetAdded(asset);
                        }

                        return modelObject;
                    } catch (loadErr) {
                        console.error(`[SM Unreal AddToScene] Failed to load model for ${asset.name}:`, loadErr);
                        return null;
                    }
                };
            }

            const bridgeInstance = new UnrealAssetRuntimeBridge({ panel });
            panel[BRIDGE_KEY] = bridgeInstance;
            window.SMUnrealAssetRuntimeBridge = bridgeInstance;
            return bridgeInstance;
        }
    }

    // Auto-install on AssetsPanel if available or when ready
    function autoInstall() {
        if (typeof window !== 'undefined') {
            if (window.AssetsPanel) {
                UnrealAssetRuntimeBridge.install(window.AssetsPanel);
            } else if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => {
                    if (window.AssetsPanel) UnrealAssetRuntimeBridge.install(window.AssetsPanel);
                });
            }
        }
    }

    autoInstall();

    window.UnrealAssetRuntimeBridge = UnrealAssetRuntimeBridge;
})();
