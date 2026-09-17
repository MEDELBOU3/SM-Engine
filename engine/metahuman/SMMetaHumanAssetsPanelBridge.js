// engine/metahuman/SMMetaHumanAssetsPanelBridge.js
//
// Connects the existing SM Engine AssetsPanel to MetaHuman mode.
// The bridge does not replace AssetsPanel or its loaders.

(function (root) {
  "use strict";

  const BRIDGE_KEY = "__smMetaHumanAssetsPanelBridgeInstalled";

  if (root[BRIDGE_KEY]) return;
  root[BRIDGE_KEY] = true;

  function getImporter() {
    return root.smMetaHumanAssetImporter ||
      root.SMMetaHumanAssetImporter ||
      null;
  }

  function getSystem() {
    return root.smMetaHumanSystem ||
      root.SMMetaHumanSystem ||
      null;
  }

  function isMetaHumanMode() {
    return String(
      root.currentWorkspaceMode ||
      root.workspaceMode ||
      ""
    ).toUpperCase() === "METAHUMAN";
  }

  function isSupportedFile(file) {
    if (!file?.name) return false;

    const ext = file.name
      .split(".")
      .pop()
      .toLowerCase();

    return ["glb", "gltf", "fbx", "obj"].includes(ext);
  }

  async function importSelectedFile(file, options = {}) {
    if (!isMetaHumanMode()) {
      return {
        handled: false,
        reason: "workspace-not-metahuman"
      };
    }

    if (!isSupportedFile(file)) {
      return {
        handled: false,
        reason: "unsupported-format"
      };
    }

    const importer = getImporter();

    if (!importer?.importFile) {
      console.warn(
        "[MetaHuman AssetsBridge] Asset importer is not available."
      );

      return {
        handled: false,
        reason: "importer-unavailable"
      };
    }

    try {
      const result = await importer.importFile(file, {
        ...options,
        addToScene: options.addToScene !== false
      });

      root.dispatchEvent(
        new CustomEvent("sm:metahuman-asset-imported", {
          detail: result
        })
      );

      return {
        handled: true,
        result
      };
    } catch (error) {
      console.error(
        "[MetaHuman AssetsBridge] Import failed:",
        error
      );

      root.dispatchEvent(
        new CustomEvent("sm:metahuman-asset-import-error", {
          detail: {
            file,
            error
          }
        })
      );

      return {
        handled: true,
        error
      };
    }
  }

  function registerAsset(asset, options = {}) {
    if (!isMetaHumanMode()) return false;

    const system = getSystem();

    if (!system?.registerAsset || !asset) {
      return false;
    }

    const name =
      options.name ||
      asset.name ||
      asset.id ||
      "character";

    const object =
      asset.object ||
      asset.scene ||
      asset.model ||
      asset;

    return system.registerAsset(name, object);
  }

  function getMetaHumanAssets() {
    const system = getSystem();

    if (!system?.assetLoader?.getAssets) {
      return {};
    }

    return system.assetLoader.getAssets();
  }

  root.SMMetaHumanAssetsPanelBridge = {
    importSelectedFile,
    registerAsset,
    getMetaHumanAssets,
    isMetaHumanMode,
    isSupportedFile
  };

  // Public helper for the existing AssetsPanel/import queue.
  root.importMetaHumanAsset = importSelectedFile;

  root.addEventListener(
    "sm:assets-model-selected",
    async event => {
      if (!isMetaHumanMode()) return;

      const file = event.detail?.file ||
        event.detail?.asset?.file ||
        null;

      if (!file) return;

      await importSelectedFile(file, {
        role: event.detail?.role
      });
    }
  );

  console.info(
    "[MetaHuman] AssetsPanel bridge ready."
  );
})(window);
