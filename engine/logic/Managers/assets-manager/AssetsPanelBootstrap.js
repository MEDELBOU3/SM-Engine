// AssetsPanelBootstrap.js
// Load LAST after every AssetsPanel module.
(function (global) {
    "use strict";
    const AssetsPanel = global.AssetsPanel;
    if (!AssetsPanel) {
        throw new Error("[AssetsPanelBootstrap] AssetsPanelCore is missing.");
    }
    const requiredModules = [
        "AssetsPanelDrive",
        "AssetsPanelAssetsFolders",
        "AssetsPanelScenePreview",
        "AssetsPanelStorage",
        "AssetsPanelUIEventsLayout",
        "AssetsPanelImportPBR",
        "AssetsPanelRenderNavigation",
        "AssetsPanelContextMenus",
        "AssetsPanelMaterialApplication",
        "AssetsPanelAdvancedFeatures",
        "AssetsPanelScriptsBuiltins"
    ];
    const loaded = new Set(global.__SMAssetsPanelLoadedModules || []);
    const missing = requiredModules.filter(name => !loaded.has(name));
    if (missing.length) {
        throw new Error(`[AssetsPanelBootstrap] Missing modules: ${missing.join(", ")}`);
    }
    const previous = global.__SMAssetsPanelPreviousGlobalForModules || null;
    if (previous && previous !== AssetsPanel) {
        const driveMethodNames = Object.getOwnPropertyNames(previous).filter(name => /drive|google/i.test(name));
        for (const name of driveMethodNames) {
            const descriptor = Object.getOwnPropertyDescriptor(previous, name);
            if (!descriptor) continue;
            if (name === "syncGoogleDrive" && typeof descriptor.value === "function") {
                AssetsPanel._legacyDriveSyncMethod = descriptor.value;
                continue;
            }
            if (!Object.prototype.hasOwnProperty.call(AssetsPanel, name)) {
                try { Object.defineProperty(AssetsPanel, name, descriptor); }
                catch (error) { console.warn(`AssetsPanel: Could not preserve external method '${name}'.`, error); }
            }
        }
    }
    global.AssetsPanel = AssetsPanel;
    global.__SMAssetsPanelModulesReady = true;
    global.dispatchEvent(new CustomEvent("sm-assets-panel-modules-ready", { detail: { modules: [...loaded] } }));
    global.addEventListener("sm-assets-panel-ui-ready", () => {
        AssetsPanel._refreshDOMCache();
        AssetsPanel._ensurePanelHeightResizer();
        AssetsPanel._restorePanelHeight();
        AssetsPanel._setupPanelHeightResize();
        AssetsPanel._bindCurrentImportInputs();
        AssetsPanel._repairGameplayFolderTree();
        AssetsPanel._ensureProjectManifestAssets();
        AssetsPanel._ensureGoogleDriveButton();
        AssetsPanel._ensureMaterialPackageImportButton?.();
        AssetsPanel._ensurePersistenceButton();
        AssetsPanel.render();
    });
    global.addEventListener("sm-assets-google-drive-ready", () => {
        AssetsPanel._afterExternalAssetSync();
    });
    global.addEventListener("sm-asset-drive-sources-updated", () => {
        AssetsPanel._ensureGoogleDriveButton();
        console.log(`[AssetsPanel] Drive source registry updated (${AssetsPanel.getGoogleDriveSources().length} enabled source(s)).`);
    });
    const pending = global.__SMAssetsPanelPendingInitArgs;
    if (Array.isArray(pending)) {
        delete global.__SMAssetsPanelPendingInitArgs;
        AssetsPanel.init(...pending);
    }
    console.log(`[AssetsPanel] Modular build ready (${requiredModules.length + 2} files).`);
})(window);
