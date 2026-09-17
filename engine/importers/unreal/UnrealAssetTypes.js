/**
 * SM ENGINE — UNREAL ASSET TYPES
 * Metadata and classification helpers for Unreal Engine assets.
 */
(function () {
    'use strict';

    const EXTENSIONS = Object.freeze({
        uasset: 'uasset',
        umap: 'umap',
        uproject: 'uproject',
        uplugin: 'uplugin',
        upluginmanifest: 'upluginmanifest',
        uexp: 'uexp',
        ubulk: 'ubulk',
        pak: 'pak',
        utoc: 'utoc',
        ucas: 'ucas',
        glb: 'glb',
        gltf: 'gltf',
        fbx: 'fbx',
        obj: 'obj'
    });

    const TYPES = Object.freeze({
        UASSET: 'unreal-asset',
        UMAP: 'unreal-map',
        UPROJECT: 'unreal-project',
        UPLUGIN: 'unreal-plugin',
        COMPANION: 'unreal-companion',
        CONTAINER: 'unreal-container',
        MODEL: 'model'
    });

    function getExtension(name) {
        const clean = String(name || '').split(/[?#]/)[0];
        const base = clean.split(/[\\/]/).pop() || '';
        const dot = base.lastIndexOf('.');
        return dot >= 0 ? base.slice(dot + 1).toLowerCase() : '';
    }

    function classify(name) {
        const ext = getExtension(name);

        if (ext === EXTENSIONS.uasset) return TYPES.UASSET;
        if (ext === EXTENSIONS.umap) return TYPES.UMAP;
        if (ext === EXTENSIONS.uproject) return TYPES.UPROJECT;
        if (ext === EXTENSIONS.uplugin || ext === EXTENSIONS.upluginmanifest) {
            return TYPES.UPLUGIN;
        }
        if (ext === EXTENSIONS.uexp || ext === EXTENSIONS.ubulk) {
            return TYPES.COMPANION;
        }
        if (ext === EXTENSIONS.pak || ext === EXTENSIONS.utoc || ext === EXTENSIONS.ucas) {
            return TYPES.CONTAINER;
        }

        if (['glb', 'gltf', 'fbx', 'obj'].includes(ext)) {
            return TYPES.MODEL;
        }

        return null;
    }

    function isUnrealPackage(name) {
        const type = classify(name);
        return type === TYPES.UASSET || type === TYPES.UMAP;
    }

    function isCompanionFile(name) {
        const ext = getExtension(name);
        return ext === EXTENSIONS.uexp || ext === EXTENSIONS.ubulk || ext === EXTENSIONS.utoc || ext === EXTENSIONS.ucas;
    }

    window.SMUnrealAssetTypes = Object.freeze({
        EXTENSIONS,
        TYPES,
        getExtension,
        classify,
        isUnrealPackage,
        isCompanionFile
    });
})();
