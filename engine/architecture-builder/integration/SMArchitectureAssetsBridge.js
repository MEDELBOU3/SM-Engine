// engine/architecture/integration/SMArchitectureAssetsBridge.js
// Optional AssetsPanel integration for .smbuilding.json and .smap files.
(function (global) {
    'use strict';

    const BUILDING_EXT_RE = /\.(smbuilding\.json|smap)$/i;

    function install() {
        const AssetsPanel = global.AssetsPanel;
        if (!AssetsPanel || AssetsPanel.__smArchitectureAssetsBridgeInstalled) return false;

        const originalGetAssetType = AssetsPanel._getAssetType?.bind(AssetsPanel);
        if (originalGetAssetType) {
            AssetsPanel._getAssetType = function (name) {
                if (BUILDING_EXT_RE.test(String(name || ''))) return 'building-map';
                return originalGetAssetType(name);
            };
        }

        const originalAddAssetFromFile = AssetsPanel._addAssetFromFile?.bind(AssetsPanel);
        if (originalAddAssetFromFile) {
            AssetsPanel._addAssetFromFile = async function (file, folderId = null) {
                if (!BUILDING_EXT_RE.test(String(file?.name || ''))) {
                    return originalAddAssetFromFile(file, folderId);
                }

                const text = await file.text();
                let map;
                try {
                    map = global.SMBuildingMapParser.parse(text);
                } catch (error) {
                    console.error('[SM Architecture] Invalid building map:', error);
                    throw error;
                }

                const id =
                    typeof crypto !== 'undefined' && crypto.randomUUID
                        ? `asset_${crypto.randomUUID()}`
                        : `asset_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

                const asset = {
                    id,
                    name: file.name,
                    type: 'building-map',
                    data: text,
                    definition: map,
                    thumbnail: this._svgIcon?.('model') || null,
                    isFavorite: false,
                    isBuiltIn: false,
                    folderId,
                    tags: ['architecture', 'building-map'],
                    history: [],
                    references: [],
                    storageKind: 'text',
                    storageKey: null,
                    sourceType: 'local-import',
                    sourceSize: Number(file.size || text.length),
                    sourceLastModified: Number(file.lastModified || 0)
                };

                this.assets.push(asset);
                this._saveToStorage?.();
                this.render?.();
                this._buildTagCloud?.();

                if (typeof this.onAssetAdded === 'function') this.onAssetAdded(asset);
                return asset;
            };
        }

        const originalAddToScene = AssetsPanel._addToScene?.bind(AssetsPanel);
        if (originalAddToScene) {
            AssetsPanel._addToScene = async function (assetId, event = null, options = {}) {
                const asset = this._findById?.(assetId);
                if (asset?.type !== 'building-map') {
                    return originalAddToScene(assetId, event, options);
                }

                const map = asset.definition || global.SMBuildingMapParser.parse(asset.data);
                const generator =
                    global.smBuildingGenerator ||
                    new global.SMBuildingGenerator();

                global.smBuildingGenerator = generator;
                const root = generator.generate(map, options);

                if (typeof global.addObjectToScene === 'function') {
                    global.addObjectToScene(root, map.building.name);
                } else {
                    (this.scene || global.scene)?.add?.(root);
                    global.updateHierarchy?.();
                }

                return root;
            };
        }

        AssetsPanel.__smArchitectureAssetsBridgeInstalled = true;
        console.log('[SM Architecture] AssetsPanel building-map bridge installed.');
        return true;
    }

    global.SMArchitectureAssetsBridge = {
        install,
        pattern: BUILDING_EXT_RE
    };

    if (!install()) {
        global.addEventListener?.('sm-assets-panel-ready', install, { once: true });
        setTimeout(install, 1000);
        setTimeout(install, 3000);
    }
})(typeof window !== 'undefined' ? window : globalThis);
