(function (global) {
    "use strict";

    if (global.__SM_ASSET_PACKAGE_BRIDGE_INSTALLED__) {
        return;
    }

    const PACKAGE_RE = /\.(smpackage|sm-package)$/i;

    function isPackageName(name) {
        return PACKAGE_RE.test(String(name || "").trim());
    }

    function reclassifyPackages() {
        const panel = global.AssetsPanel;
        if (!panel?.assets) return 0;

        let changed = 0;

        for (const asset of panel.assets) {
            if (!asset || !isPackageName(asset.name)) continue;

            if (asset.type !== "package") {
                asset.type = "package";
                changed++;
            }

            asset.isPackage = true;
            asset.tags = Array.from(
                new Set([
                    ...(asset.tags || []),
                    "package",
                    "sm-package",
                    "loadable"
                ])
            );

            const thumbnail = panel.assets.find(item =>
                item?.folderId === asset.folderId &&
                /^thumbnail\.(png|jpg|jpeg|webp)$/i.test(String(item?.name || ""))
            );

            if (thumbnail?.url || thumbnail?.data) {
                asset.thumbnail = thumbnail.url || thumbnail.data;
            }
        }

        return changed;
    }

    function install() {
        const panel = global.AssetsPanel;

        if (!panel || panel.__smPackageBridgeInstalled) {
            return !!panel;
        }

        if (!global.SMAssetPackageLoader) {
            console.error(
                "AssetsPanelPackageBridge: SMAssetPackageLoader.js must load before this bridge."
            );
            return false;
        }

        panel.__smPackageBridgeInstalled = true;

        /**
         * GOOGLE DRIVE RESOURCE-KEY SUPPORT
         * ---------------------------------
         * Drive files shared by link can require resourceKey for media access.
         * The original AssetsPanel list query did not request this field.
         */
        const originalDriveListChildren =
            panel._googleDriveListChildren;

        if (
            typeof panel._googleDriveRequest === "function" &&
            typeof originalDriveListChildren === "function" &&
            !panel.__smDriveResourceKeyListPatch
        ) {
            panel.__smDriveResourceKeyListPatch = true;

            panel._googleDriveListChildren =
                async function (folderId, apiKey) {
                    const files = [];
                    let pageToken = "";

                    do {
                        const params = {
                            q:
                                `'${String(folderId).replace(/'/g, "\\'")}' ` +
                                `in parents and trashed = false`,

                            fields:
                                "nextPageToken,files(" +
                                "id,name,mimeType,size,modifiedTime," +
                                "thumbnailLink,webContentLink,webViewLink," +
                                "resourceKey,shortcutDetails(" +
                                "targetId,targetMimeType,targetResourceKey" +
                                "))",

                            pageSize: "1000",
                            orderBy: "folder,name",
                            supportsAllDrives: "true",
                            includeItemsFromAllDrives: "true"
                        };

                        if (pageToken) {
                            params.pageToken =
                                pageToken;
                        }

                        const data =
                            await this._googleDriveRequest(
                                "files",
                                params,
                                apiKey
                            );

                        if (
                            Array.isArray(
                                data.files
                            )
                        ) {
                            files.push(
                                ...data.files
                            );
                        }

                        pageToken =
                            data.nextPageToken ||
                            "";
                    } while (pageToken);

                    return files;
                };
        }

        /**
         * Store the resource key and useful Drive metadata on each mirrored asset.
         */
        const originalCreateGoogleDriveAsset =
            panel._createGoogleDriveAsset;

        if (
            typeof originalCreateGoogleDriveAsset === "function" &&
            !panel.__smDriveResourceKeyAssetPatch
        ) {
            panel.__smDriveResourceKeyAssetPatch = true;

            panel._createGoogleDriveAsset =
                function (
                    file,
                    folderId,
                    apiKey,
                    type,
                    sourceId,
                    sourceTags
                ) {
                    const asset =
                        originalCreateGoogleDriveAsset.call(
                            this,
                            file,
                            folderId,
                            apiKey,
                            type,
                            sourceId,
                            sourceTags
                        );

                    if (!asset) {
                        return asset;
                    }

                    asset.driveResourceKey =
                        file?.resourceKey ||
                        file?.shortcutDetails
                            ?.targetResourceKey ||
                        null;

                    asset.driveWebContentLink =
                        file?.webContentLink ||
                        null;

                    asset.driveWebViewLink =
                        file?.webViewLink ||
                        null;

                    asset.driveShortcutTargetId =
                        file?.shortcutDetails
                            ?.targetId ||
                        null;

                    return asset;
                };
        }

        const originalGetAssetType = panel._getAssetType;

        panel._getAssetType = (filename) => {
            if (isPackageName(filename)) {
                return "package";
            }
            return originalGetAssetType?.(filename) || null;
        };

        const originalAddToScene = panel._addToScene;

        panel._addToScene = async function (assetId, event = null, options = {}) {
            const asset =
                this._findById?.(assetId) ||
                this.assets?.find?.(item => item?.id === assetId) ||
                null;

            if (asset && (asset.type === "package" || isPackageName(asset.name))) {
                asset.type = "package";

                try {
                    return await global.SMAssetPackageLoader.loadFromAsset(
                        asset,
                        {
                            ...options,
                            event,
                            scene: this.scene || global.scene,
                            renderer: this.renderer || global.renderer,
                            camera: this.camera || global.camera,
                            raycaster: this.raycaster || global.raycaster
                        }
                    );
                } catch (error) {
                    console.error(
                        `AssetsPanel: Package "${asset.name}" failed to load.`,
                        error
                    );
                    global.alert?.(
                        `Package load failed:\n${asset.name}\n\n${error.message}`
                    );
                    return null;
                }
            }

            return await originalAddToScene.call(this, assetId, event, options);
        };

        for (const methodName of ["syncGoogleDrive", "syncGoogleDriveSource"]) {
            const original = panel[methodName];

            if (typeof original !== "function") continue;

            panel[methodName] = async function (...args) {
                const result = await original.apply(this, args);
                reclassifyPackages();
                this.render?.();
                return result;
            };
        }

        panel.loadPackageAsset = async function (assetId, options = {}) {
            return await this._addToScene(assetId, null, options);
        };

        panel.unloadPackage = async function (packageId) {
            return await global.SMAssetPackageLoader.unload(packageId);
        };

        reclassifyPackages();

        global.addEventListener(
            "sm-google-drive-sync-complete",
            () => {
                reclassifyPackages();
                panel.render?.();
            }
        );

        global.__SM_ASSET_PACKAGE_BRIDGE_INSTALLED__ = true;

        console.log(
            "%c📦 AssetsPanel Package Bridge ready",
            "color:#8bd5ff;font-weight:700"
        );

        return true;
    }

    global.installSMAssetPackageBridge = install;

    if (!install()) {
        global.addEventListener("sm-assets-panel-ready", install, { once: true });

        let attempts = 0;
        const timer = setInterval(() => {
            attempts++;
            if (install() || attempts > 100) {
                clearInterval(timer);
            }
        }, 100);
    }
})(window);