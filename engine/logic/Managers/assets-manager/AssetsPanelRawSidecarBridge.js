// engine/logic/Managers/assets-manager/AssetsPanelRawSidecarBridge.js
// SM Engine — generic raw / sidecar asset preservation for folder imports.
// Unknown files are preserved instead of skipped. Known .blend handling stays intact.
(function (global) {
    'use strict';

    if (global.SMAssetsPanelRawSidecarBridge?.version) return;

    const STATE_KEY = '__smAssetsPanelRawSidecarBridgeInstalled';
    const TEXT_CAPTURE_LIMIT = 512 * 1024;

    const TEXT_EXTENSIONS = new Set([
        'txt','md','markdown','csv','tsv','xml','yaml','yml','toml','ini','cfg','conf',
        'properties','license','log','mtl','cats'
    ]);

    const METADATA_EXTENSIONS = new Set([
        'cats','mtl','xml','yaml','yml','toml','ini','cfg','conf','properties','csv','tsv'
    ]);

    const METADATA_BASENAMES = new Set([
        'blender_assets.cats','blender_assets.cats.txt','metadata.json','manifest.json',
        'asset.json','catalog.json','catalogs.json','package.json','package-lock.json',
        'readme.txt','readme.md','license','license.txt'
    ]);

    const RAW_SOURCE_EXTENSIONS = new Set([
        'blend1','blend2','blend3','bin','usd','usda','usdc','usdz','tres','res',
        'material','mesh','anim','zip','7z','rar','tar','gz'
    ]);

    const panel = () => global.AssetsPanel || null;

    function normalizeName(value) {
        return String(value || '').replace(/\\/g, '/').split('/').pop().trim();
    }

    function lowerName(value) {
        return normalizeName(value).toLowerCase();
    }

    function extensionOf(value) {
        const name = lowerName(value);
        const index = name.lastIndexOf('.');
        return index >= 0 ? name.slice(index + 1) : '';
    }

    function isBlenderCatalogName(value) {
        const name = lowerName(value);
        return name === 'blender_assets.cats' ||
            name === 'blender_assets.cats.txt' ||
            name.endsWith('.cats') ||
            name.endsWith('.cats.txt');
    }

    function isMetadataName(value) {
        const name = lowerName(value);
        const ext = extensionOf(name);
        if (isBlenderCatalogName(name)) return true;
        if (METADATA_BASENAMES.has(name)) return true;
        return METADATA_EXTENSIONS.has(ext);
    }

    function isTextLike(file) {
        const ext = extensionOf(file?.name);
        if (TEXT_EXTENSIONS.has(ext)) return true;
        const mime = String(file?.type || '').toLowerCase();
        return mime.startsWith('text/') || mime.includes('xml') || mime.includes('yaml') || mime.includes('csv');
    }

    function rawKindForName(value) {
        const name = lowerName(value);
        const ext = extensionOf(name);
        if (isBlenderCatalogName(name)) return 'blender-catalog';
        if (/^.+\.blend[1-9]$/i.test(name)) return 'blender-backup';
        if (ext === 'mtl') return 'obj-material-library';
        if (ext === 'bin') return 'binary-sidecar';
        if (['usd','usda','usdc','usdz'].includes(ext)) return 'usd-source';
        if (['tres','res'].includes(ext)) return 'engine-resource';
        return RAW_SOURCE_EXTENSIONS.has(ext) ? 'source-sidecar' : 'raw-file';
    }

    function sidecarIcon(kind, fileName) {
        const ext = extensionOf(fileName).toUpperCase();
        const label = kind === 'blender-catalog' ? 'CAT' :
            kind === 'blender-backup' ? 'BLD' :
            kind === 'metadata' ? 'META' : (ext.slice(0, 4) || 'FILE');
        const safe = String(label).replace(/[^A-Z0-9]/g, '').slice(0, 4) || 'FILE';
        return `<svg class="svg-icon sm-raw-sidecar-icon" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M14 6h24l12 12v40H14z" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="M38 6v14h12" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><rect x="18" y="34" width="28" height="14" rx="3" fill="currentColor" opacity=".16"/><text x="32" y="44" text-anchor="middle" font-size="9" font-family="system-ui,Segoe UI,sans-serif" font-weight="700" fill="currentColor">${safe}</text></svg>`;
    }

    function parseBlenderCatalogs(text) {
        const result = { version: null, catalogs: [], rawLines: 0 };
        if (typeof text !== 'string') return result;
        const lines = text.split(/\r?\n/);
        result.rawLines = lines.length;
        for (const sourceLine of lines) {
            const line = sourceLine.trim();
            if (!line || line.startsWith('#')) continue;
            const versionMatch = line.match(/^VERSION\s+(\d+)/i);
            if (versionMatch) {
                result.version = Number(versionMatch[1]) || null;
                continue;
            }
            const first = line.indexOf(':');
            const second = first >= 0 ? line.indexOf(':', first + 1) : -1;
            if (first <= 0 || second <= first) continue;
            result.catalogs.push({
                uuid: line.slice(0, first).trim(),
                path: line.slice(first + 1, second).trim(),
                name: line.slice(second + 1).trim()
            });
        }
        return result;
    }

    function dispatch(name, detail = {}) {
        try { global.dispatchEvent(new CustomEvent(name, { detail })); } catch (_) {}
    }

    async function decoratePreservedAsset(P, asset, file, semanticType) {
        if (!asset) return asset;
        const fileName = file?.name || asset.name || '';
        const rawKind = semanticType === 'metadata'
            ? (isBlenderCatalogName(fileName) ? 'blender-catalog' : 'metadata')
            : rawKindForName(fileName);

        asset.sourceType = semanticType === 'metadata' ? 'sidecar-import' : 'raw-source-import';
        asset.sourceFormat = extensionOf(fileName) || null;
        asset.rawKind = rawKind;
        asset.isSidecar = semanticType === 'metadata' || rawKind !== 'raw-file';
        asset.isPreservedSource = true;
        asset.mimeType = file?.type || asset.mimeType || '';
        asset.thumbnail = sidecarIcon(rawKind, fileName);
        asset.tags = Array.isArray(asset.tags) ? asset.tags : [];

        const tags = [semanticType, asset.isSidecar ? 'sidecar' : 'raw'];
        if (rawKind === 'blender-catalog' || rawKind === 'blender-backup') tags.push('blender');
        for (const tag of tags) {
            if (tag && !asset.tags.includes(tag)) asset.tags.push(tag);
        }

        if (isTextLike(file) && Number(file?.size || 0) <= TEXT_CAPTURE_LIMIT) {
            try {
                const text = await file.text();
                asset.sidecarText = text;
                if (rawKind === 'blender-catalog') asset.blenderCatalogs = parseBlenderCatalogs(text);
            } catch (_) {}
        }

        P._saveToStorage?.();
        P.render?.();
        P._buildTagCloud?.();
        dispatch('sm:assets-preserved-source-added', { asset, file, semanticType, rawKind });
        return asset;
    }

    function install() {
        if (global[STATE_KEY] === true) return true;
        const P = panel();
        if (!P || typeof P._getAssetType !== 'function' || typeof P._addAssetFromFile !== 'function') return false;

        const previousGetAssetType = P._getAssetType.bind(P);
        const previousAddAssetFromFile = P._addAssetFromFile.bind(P);
        const previousSvgIcon = typeof P._svgIcon === 'function' ? P._svgIcon.bind(P) : null;
        const previousAddToScene = typeof P._addToScene === 'function' ? P._addToScene.bind(P) : null;

        P._getAssetType = function (filename) {
            const known = previousGetAssetType(filename);
            if (known) {
                const name = lowerName(filename);
                if (known === 'material' && METADATA_BASENAMES.has(name)) return 'metadata';
                return known;
            }
            if (isMetadataName(filename)) return 'metadata';
            return 'raw';
        };

        P._addAssetFromFile = async function (file, folderId = null, ...rest) {
            const semanticType = this._getAssetType(file?.name || '');
            const asset = await previousAddAssetFromFile(file, folderId, ...rest);
            if (!asset || (semanticType !== 'raw' && semanticType !== 'metadata')) return asset;
            return await decoratePreservedAsset(this, asset, file, semanticType);
        };

        if (previousSvgIcon) {
            P._svgIcon = function (type) {
                if (type === 'metadata') return sidecarIcon('metadata', 'metadata');
                if (type === 'raw') return sidecarIcon('raw-file', 'file');
                return previousSvgIcon(type);
            };
        }

        if (previousAddToScene) {
            P._addToScene = async function (assetId, ...args) {
                const asset = this._findById?.(assetId) || null;
                if (asset && (asset.type === 'raw' || asset.type === 'metadata')) {
                    console.info(`[SM Assets] "${asset.name}" is a preserved ${asset.type} source file and is not directly placeable in the scene.`);
                    dispatch('sm:assets-preserved-source-open', { asset });
                    return asset;
                }
                return previousAddToScene(assetId, ...args);
            };
        }

        global[STATE_KEY] = true;
        global.SMAssetsPanelRawSidecarBridge = {
            version: 1,
            installed: true,
            install,
            parseBlenderCatalogs,
            classify(filename) {
                const known = previousGetAssetType(filename);
                if (known && !(known === 'material' && METADATA_BASENAMES.has(lowerName(filename)))) return known;
                return isMetadataName(filename) ? 'metadata' : 'raw';
            },
            status() {
                return {
                    installed: global[STATE_KEY] === true,
                    blenderCatalog: P._getAssetType('blender_assets.cats.txt'),
                    mtl: P._getAssetType('model.mtl'),
                    blendBackup: P._getAssetType('scene.blend1'),
                    usd: P._getAssetType('scene.usdc'),
                    unknown: P._getAssetType('future-format.xyzabc')
                };
            }
        };

        console.info('[SM Assets] Raw/sidecar preservation bridge installed.');
        return true;
    }

    function attach(attempt = 0) {
        if (install()) return;
        if (attempt >= 240) {
            console.warn('[SM Assets] Raw/sidecar bridge could not find AssetsPanel.');
            return;
        }
        setTimeout(() => attach(attempt + 1), 250);
    }

    global.SMAssetsPanelRawSidecarBridge = { version: 1, installed: false, install };
    attach();
})(window);
