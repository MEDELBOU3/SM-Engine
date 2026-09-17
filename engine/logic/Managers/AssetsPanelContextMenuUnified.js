/**
 * AssetsPanelContextMenuUnified.js
 * SM Engine — AssetsPanel context menu with Dynamic Auto-Loading for Sprite Sheet Studio.
 */
(function (root) {
    "use strict";

    let spriteEditorLoadPromise = null;

    // 1. Resolve exact Image String / Blob URL
    async function resolveSpriteSource(asset = {}) {

        if (!asset) return null;

        if (typeof asset === "string") {
            return asset;
        }

        // =========================================================
        // 1. Resolve the persisted binary FIRST
        // =========================================================

        if (asset.id && typeof root.AssetsPanel?.openSpriteSheetAsset === "function") {
            const managedAsset = root.AssetsPanel._findById?.(asset.id) || asset;
            if (managedAsset.storageKey || managedAsset.storageKind === "indexeddb-blob") {
                try {
                    const storage = await root.AssetsPanel._getPersistentAssetStorage?.();
                    const resolved = await storage?.resolveAssetData?.(managedAsset);
                    if (resolved) return resolved;
                } catch (error) {
                    console.warn("[SpriteSheet Launcher] Persisted image resolution failed:", error);
                }
            }
        }

        // =========================================================
        // 2. Direct runtime URLs
        // =========================================================

        const directCandidates = [
            asset.sourceURL,
            asset.url,
            asset.data,
            asset.sourcePath
        ];

        for (const value of directCandidates) {

            if (
                typeof value === "string" &&
                (
                    value.startsWith("blob:") ||
                    value.startsWith("data:") ||
                    value.startsWith("http://") ||
                    value.startsWith("https://")
                )
            ) {
                console.log(
                    "[SpriteSheet Launcher] Using direct source:",
                    value
                );

                return value;
            }
        }

        // =========================================================
        // 3. IndexedDB Blob fallback
        // =========================================================

        if (
            asset.storageKind === "indexeddb-blob" ||
            asset.storageKey
        ) {

            try {

                const panel = root.AssetsPanel;

                const storage =
                    (await panel?._getPersistentAssetStorage?.()) ||
                    panel?.assetStorage ||
                    panel?.storageManager ||
                    root.assetStorageManager;

                if (storage?.getBlob) {

                    const key =
                        asset.storageKey || asset.id;

                    const blob =
                        await Promise.race([
                            storage.getBlob(key),

                            new Promise((_, reject) =>
                                setTimeout(
                                    () =>
                                        reject(
                                            new Error(
                                                "IndexedDB blob timeout"
                                            )
                                        ),
                                    3000
                                )
                            )
                        ]);

                    if (blob instanceof Blob) {

                        console.log(
                            "[SpriteSheet Launcher] Blob loaded:",
                            key
                        );

                        return storage.createRuntimeURL
                            ? storage.createRuntimeURL(
                                asset.id,
                                blob
                            )
                            : URL.createObjectURL(blob);
                    }
                }

            } catch (error) {

                console.warn(
                    "[SpriteSheet Launcher] IndexedDB resolution failed:",
                    error
                );
            }
        }

        // A thumbnail is UI-only.  It must never be returned as a sprite
        // source because its reduced dimensions corrupt slice coordinates.
        return null;
    }

    // 2. Ensure SMSpriteSheetEditor.js is loaded in DOM
    function ensureSpriteEditorLoaded() {

        if (
            root.smSpriteSheetEditor?.open ||
            typeof root.openSpriteSheetEditor === "function" ||
            root.SMSpriteSheetEditor
        ) {
            return Promise.resolve();
        }

        if (spriteEditorLoadPromise) {
            return spriteEditorLoadPromise;
        }

        spriteEditorLoadPromise = new Promise((resolve, reject) => {

            const existing =
                document.querySelector(
                    'script[src*="SMSpriteSheetEditor.js"]'
                );

            if (existing) {

                const checkLoaded = () => {

                    if (
                        root.SMSpriteSheetEditor ||
                        typeof root.openSpriteSheetEditor === "function"
                    ) {
                        resolve();
                    } else {
                        reject(
                            new Error(
                                "SMSpriteSheetEditor loaded but did not expose the editor."
                            )
                        );
                    }
                };

                existing.addEventListener(
                    "load",
                    checkLoaded,
                    { once: true }
                );

                existing.addEventListener(
                    "error",
                    () =>
                        reject(
                            new Error(
                                "Failed to load SMSpriteSheetEditor.js"
                            )
                        ),
                    { once: true }
                );

                // In case it was already loaded before listeners were attached,
                // poll briefly instead of declaring failure after only 50 ms.
                const started = Date.now();
                const poll = () => {
                    if (root.SMSpriteSheetEditor || typeof root.openSpriteSheetEditor === "function") {
                        resolve();
                        return;
                    }
                    if (Date.now() - started >= 5000) {
                        reject(new Error("SMSpriteSheetEditor script loaded but editor registration timed out."));
                        return;
                    }
                    setTimeout(poll, 100);
                };
                poll();

                return;
            }

            const script =
                document.createElement("script");

            script.id =
                "sm-sprite-sheet-editor-script";

            script.src =
                "engine/2d/sprites/SMSpriteSheetEditor.js";

            script.onload = () => {

                console.log(
                    "✅ [SpriteSheet Launcher] SMSpriteSheetEditor.js loaded."
                );

                if (
                    root.SMSpriteSheetEditor ||
                    typeof root.openSpriteSheetEditor === "function"
                ) {
                    resolve();
                } else {
                    reject(
                        new Error(
                            "SMSpriteSheetEditor.js loaded but editor is unavailable."
                        )
                    );
                }
            };

            script.onerror = () => {

                reject(
                    new Error(
                    "Could not load engine/2d/sprites/SMSpriteSheetEditor.js"
                    )
                );
            };

            document.head.appendChild(script);
        });

        spriteEditorLoadPromise =
            spriteEditorLoadPromise.finally(() => {
                spriteEditorLoadPromise = null;
            });

        return spriteEditorLoadPromise;
    }

    async function waitForAssetsPanel(timeoutMs = 10000) {
        if (root.AssetsPanel?.dom && typeof root.AssetsPanel.openSpriteSheetAsset === 'function') {
            return root.AssetsPanel;
        }

        return new Promise((resolve) => {
            let done = false;
            let timer = null;
            const finish = (panel) => {
                if (done) return;
                done = true;
                if (timer) clearTimeout(timer);
                root.removeEventListener('sm-assets-panel-ready', onReady);
                resolve(panel || root.AssetsPanel || null);
            };
            const onReady = () => {
                const panel = root.AssetsPanel;
                if (panel?.dom && typeof panel.openSpriteSheetAsset === 'function') {
                    finish(panel);
                }
            };
            root.addEventListener('sm-assets-panel-ready', onReady);
            const started = Date.now();
            const poll = () => {
                if (done) return;
                const panel = root.AssetsPanel;
                if (panel?.dom && typeof panel.openSpriteSheetAsset === 'function') {
                    finish(panel);
                    return;
                }
                if (Date.now() - started >= timeoutMs) {
                    finish(null);
                    return;
                }
                setTimeout(poll, 100);
            };
            poll();
            timer = setTimeout(() => finish(null), timeoutMs + 100);
        });
    }

    // 3. Reliable Launcher
    async function launchSpriteEditor(asset = {}) {
        console.log('[SpriteSheet Launcher] Opening editor with embedded asset browser...', asset);
        try {
            // IMPORTANT: Do not resolve/decode the image in the context menu.
            // The Sprite Sheet Editor now owns its own asset browser and queue.
            // Passing only metadata prevents a stale thumbnail/blob URL from
            // blocking the editor before it can display the project assets.
            await ensureSpriteEditorLoaded();

            const assetName = asset?.name || 'spritesheet';
            const editorPayload = {
                id: asset?.id || null,
                assetId: asset?.id || null,
                name: assetName,
                spriteSheet: asset?.spriteSheet || null,
                source: null,
                sourceURL: null,
                sourceFallbacks: []
            };

            if (root.smSpriteSheetEditor?.open) {
                await root.smSpriteSheetEditor.open(editorPayload, assetName);
                // Explicitly select the originating asset in the editor queue.
                root.smSpriteSheetEditor.assetQueueSelectedId = asset?.id ? `project:${asset.id}` : null;
                root.smSpriteSheetEditor.renderEmbeddedAssets?.();
                if (asset?.id) await root.smSpriteSheetEditor.useQueuedAsset?.(`project:${asset.id}`);
                return true;
            }

            if (typeof root.openSpriteSheetEditor === 'function') {
                root.openSpriteSheetEditor(editorPayload, assetName);
                return true;
            }

            throw new Error('SMSpriteSheetEditor is not available.');
        } catch (error) {
            console.error('[SpriteSheet Launcher] Launch failed:', error);
            alert('Could not open Sprite Sheet Editor:\n' + (error?.message || error));
            return false;
        }
    }

    const Unified = {
        installed: false,
        AP: null,
        originalRender: null,
        originalSidebarRender: null,

        install() {
            if (this.installed) return true;

            const AP =
                root.AssetsPanel ||
                (typeof AssetsPanel !== "undefined" ? AssetsPanel : null);

            if (!AP?.dom || !root.SMContextMenu?.open) {
                setTimeout(() => this.install(), 120);
                return false;
            }

            this.AP = AP;
            this.installed = true;

            root.SMContextMenu.register?.("contextMenu");

            this._installHelpers(AP);
            this._overrideMenus(AP);
            this._patchSidebarRender(AP);
            this._patchRender(AP);
            this._bindContainers(AP);

            AP.render?.();
            console.log("[AssetsPanelContextMenuUnified] Installed — Sprite Sheet Studio integration ready.");
            return true;
        },

        _installHelpers(AP) {
            AP.closeContextMenus = () => root.SMContextMenu?.closeAll?.();
            AP.copyFolderPath = (folderId) => this._copy(this._folderPath(AP, folderId));
            AP.moveFolderToFolder = (folderId, targetFolderId = null) => this._moveFolder(AP, folderId, targetFolderId);
            AP.expandFolderRecursive = (folderId) => {
                this._collectFolderTree(AP, folderId).forEach((id) => AP.expandedFolders?.add?.(id));
                AP._renderFolderSidebar?.();
            };
            AP.collapseFolderRecursive = (folderId) => {
                this._collectFolderTree(AP, folderId).forEach((id) => AP.expandedFolders?.delete?.(id));
                AP._renderFolderSidebar?.();
            };
        },

        _overrideMenus(AP) {
            AP._showContextMenu = (event, assetId) => this.showAssetMenu(AP, event, assetId);
            AP._showFolderContextMenu = (event, folderId) => this.showFolderMenu(AP, event, folderId);
            AP._showEmptyGridContextMenu = (event) => this.showRootMenu(AP, event, "assets-grid");
        },

        _patchRender(AP) {
            if (AP.__smUnifiedAssetsContextRender) return;
            AP.__smUnifiedAssetsContextRender = true;
            this.originalRender = AP.render;
            AP.render = (...args) => {
                const result = this.originalRender.apply(AP, args);
                this._decorateGridFolders(AP);
                this._bindContainers(AP);
                return result;
            };
        },

        _patchSidebarRender(AP) {
            if (AP.__smUnifiedAssetsSidebarContext) return;
            AP.__smUnifiedAssetsSidebarContext = true;
            this.originalSidebarRender = AP._renderFolderSidebar;
            AP._renderFolderSidebar = (...args) => {
                const result = this.originalSidebarRender.apply(AP, args);
                this._decorateSidebarFolders(AP);
                this._bindContainers(AP);
                return result;
            };
        },

        _bindContainers(AP) {
            AP._refreshDOMCache?.();
            const grid = AP.dom?.grid || document.getElementById("assetsGrid");
            const explorer = document.getElementById("assetsCategoriesPanel") || AP.dom?.categoriesContainer;

            if (grid && grid.dataset.smUnifiedContextBound !== "true") {
                grid.addEventListener("contextmenu", (event) => {
                    if (event.target.closest(".asset-item")) return;
                    event.preventDefault();
                    event.stopPropagation();
                    this.showRootMenu(AP, event, "assets-grid");
                });
                grid.dataset.smUnifiedContextBound = "true";
            }

            if (explorer && explorer.dataset.smUnifiedContextBound !== "true") {
                explorer.addEventListener("contextmenu", (event) => {
                    const row = event.target.closest(".tree-row[data-folder-id]");
                    event.preventDefault();
                    event.stopPropagation();
                    if (row?.dataset.folderId) {
                        this.showFolderMenu(AP, event, row.dataset.folderId, "assets-explorer");
                        return;
                    }
                    this.showRootMenu(AP, event, "assets-explorer");
                });
                explorer.dataset.smUnifiedContextBound = "true";
            }
        },

        _decorateGridFolders(AP) {
            const grid = AP.dom?.grid;
            if (!grid) return;
            const folders = Object.values(AP.folders || {})
                .filter((folder) => (folder.parentId || null) === (AP.openFolderId || null))
                .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
            const cards = Array.from(grid.querySelectorAll(".asset-item.folder-item"));

            cards.forEach((card, index) => {
                const folder = folders[index];
                if (!folder) return;
                card.dataset.folderId = folder.id;
                card.oncontextmenu = (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    this.showFolderMenu(AP, event, folder.id, "assets-grid");
                };
            });
        },

        _decorateSidebarFolders(AP) {
            const explorer = document.getElementById("assetsCategoriesPanel");
            if (!explorer) return;
            const visibleFolders = [];
            const walk = (parentId = null) => {
                Object.values(AP.folders || {})
                    .filter((folder) => (folder.parentId || null) === (parentId || null))
                    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")))
                    .forEach((folder) => {
                        visibleFolders.push(folder);
                        if (AP.expandedFolders?.has?.(folder.id)) walk(folder.id);
                    });
            };
            walk(null);

            const rows = Array.from(explorer.querySelectorAll(".tree-node-container .tree-row"));
            rows.forEach((row, index) => {
                const folder = visibleFolders[index];
                if (!folder) return;
                row.dataset.folderId = folder.id;
                row.oncontextmenu = (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    this.showFolderMenu(AP, event, folder.id, "assets-explorer");
                };
            });
        },

        showRootMenu(AP, event, owner = "assets-grid") {
            const insideGame = !!this._owningGameProject(AP, AP.openFolderId);
            const sections = [
                {
                    header: AP.openFolderId && AP.folders?.[AP.openFolderId] ? AP.folders[AP.openFolderId].name : "Project Assets",
                    badge: owner === "assets-explorer" ? "EXPLORER" : "CONTENT",
                    noSep: true,
                },
                {
                    header: "Create & 2D Studio",
                    items: [
                        {
                            label: "New Folder",
                            shortcut: "Ctrl+Shift+N",
                            icon: "fas fa-folder-plus",
                            action: () =>
                                typeof AP.createFolderFromUI === "function"
                                    ? AP.createFolderFromUI(null, AP.openFolderId || null)
                                    : AP.createFolder?.("New Folder", AP.openFolderId || null),
                        },
                        {
                            label: "Open Sprite Sheet Studio…",
                            icon: "fas fa-cubes-stacked",
                            action: () => launchSpriteEditor({ name: "spritesheet" })
                        },
                        {
                            label: "New Game Project…",
                            icon: "fas fa-gamepad",
                            disabled: insideGame || typeof AP.createGameProject !== "function",
                            action: () => AP.createGameProject?.(null, AP.openFolderId || null),
                        },
                    ],
                },
                {
                    header: "Import",
                    items: [
                        {
                            label: "Import Asset(s)…",
                            icon: "fas fa-file-import",
                            action: () => this._importInto(AP, AP.openFolderId || null, false),
                        },
                        {
                            label: "Import Folder…",
                            icon: "fas fa-folder-open",
                            action: () => this._importInto(AP, AP.openFolderId || null, true),
                        },
                    ],
                },
                {
                    header: "Explorer & Project",
                    items: [
                        {
                            label: "Refresh Assets",
                            shortcut: "F5",
                            icon: "fas fa-rotate",
                            action: () => AP.refreshAssets?.(),
                        },
                        {
                            label: "Expand All Folders",
                            icon: "fas fa-angles-down",
                            action: () => {
                                Object.keys(AP.folders || {}).forEach((id) => AP.expandedFolders?.add?.(id));
                                AP._renderFolderSidebar?.();
                            },
                        },
                        {
                            label: "Collapse All Folders",
                            icon: "fas fa-angles-up",
                            action: () => {
                                AP.expandedFolders?.clear?.();
                                AP._renderFolderSidebar?.();
                            },
                        },
                        { sep: true },
                        {
                            label: "Save Asset Library to Device…",
                            shortcut: "Ctrl+Shift+S",
                            icon: "fas fa-floppy-disk",
                            disabled: typeof AP.saveAssetsToDeviceFolder !== "function",
                            action: () => AP.saveAssetsToDeviceFolder?.(),
                        },
                        {
                            label: "Pack All Project Assets…",
                            icon: "fas fa-box-archive",
                            action: () => AP._packSceneAssets?.(),
                        },
                    ],
                },
            ];

            return this._openAssetsMenu(event, sections, owner);
        },

        showFolderMenu(AP, event, folderId, owner = "assets-explorer") {
            const folder = AP.folders?.[folderId];
            if (!folder) return null;

            const readOnly = this._isProtectedFolder(folder);
            const path = this._folderPath(AP, folderId);

            const openActions = [
                {
                    label: "Open Folder",
                    shortcut: "Enter",
                    icon: "fas fa-folder-open",
                    action: () => AP.openFolder?.(folderId),
                },
                {
                    label: "Open in Content Grid",
                    icon: "fas fa-table-cells-large",
                    action: () => {
                        AP.openFolderId = folderId;
                        AP.currentCategory = "project";
                        AP.render?.();
                    },
                },
            ];

            const createImportActions = [
                {
                    label: "New Subfolder",
                    icon: "fas fa-folder-plus",
                    disabled: readOnly,
                    action: () => {
                        const name = prompt("New subfolder name:", "New Folder");
                        if (name) AP.createFolder?.(name, folderId);
                    },
                },
                {
                    label: "Import Asset(s) Here…",
                    icon: "fas fa-file-import",
                    disabled: readOnly,
                    action: () => this._importInto(AP, folderId, false),
                },
            ];

            const organizeActions = [
                {
                    label: "Move Folder To",
                    icon: "fas fa-folder-tree",
                    disabled: readOnly,
                    children: this._folderMoveTargets(AP, folderId),
                },
                {
                    label: "Rename Folder",
                    shortcut: "F2",
                    icon: "fas fa-pen",
                    disabled: readOnly,
                    action: () => AP.renameFolder?.(folderId),
                },
            ];

            const copyActions = [
                {
                    label: "Copy Folder Path",
                    icon: "fas fa-copy",
                    action: () => this._copy(path),
                },
            ];

            const deleteActions = [
                {
                    label: "Delete Folder",
                    icon: "fas fa-trash",
                    danger: true,
                    disabled: readOnly,
                    action: () => {
                        if (confirm(`Delete "${folder.name}"?`)) {
                            AP.deleteFolder?.(folderId, { deleteContents: true });
                        }
                    },
                },
            ];

            const mainItems = [
                { label: "Open", icon: "fas fa-folder-open", children: openActions },
                { label: "Create & Import", icon: "fas fa-plus", children: createImportActions },
                { label: "Organize", icon: "fas fa-folder-tree", children: organizeActions },
                { label: "Copy", icon: "fas fa-copy", children: copyActions },
                { sep: true },
                { label: "Delete", icon: "fas fa-trash", danger: true, disabled: readOnly, children: deleteActions }
            ];

            const sections = [
                {
                    header: folder.name,
                    badge: "FOLDER",
                    noSep: true,
                },
                { items: mainItems },
            ];

            return this._openAssetsMenu(event, sections, owner);
        },

        showAssetMenu(AP, event, assetId) {
            AP.contextAssetId = assetId;
            const asset = AP._findById?.(assetId);
            if (!asset || asset.isBuiltIn) return null;

            const readOnly = this._isProtectedAsset(asset);
            const canDelete = !readOnly;

            // Check if asset is Image, Texture, or Sprite
            const isImageOrSprite =
                asset.type === "texture" ||
                asset.type === "image" ||
                asset.type === "spritesheet" ||
                asset.isSpriteSheet === true ||
                /\.(png|jpe?g|webp|gif|bmp|svg|avif|tiff?)$/i.test(
                    String(asset.name || asset.sourcePath || asset.data || asset.sourceURL || "")
                );

            const openAction = {
                label: "Add to Scene",
                icon: "fas fa-arrow-up-right-from-square",
                action: () => AP._addToScene?.(asset.id),
            };

            const assetActions = [
                {
                    label: "Rename",
                    shortcut: "F2",
                    icon: "fas fa-pen",
                    disabled: readOnly,
                    action: () => AP.renameAsset?.(),
                },
                {
                    label: asset.isFavorite ? "Remove from Favorites" : "Add to Favorites",
                    icon: "fas fa-star",
                    action: () => AP.toggleFavorite?.(),
                },
                {
                    label: "Export Asset",
                    icon: "fas fa-download",
                    action: () => AP._exportSingleAsset?.(asset.id),
                },
            ];

            const organizeActions = [
                {
                    label: "Move to Folder",
                    icon: "fas fa-folder-tree",
                    disabled: readOnly,
                    children: this._assetMoveTargets(AP, asset.id),
                },
            ];

            const copyActions = [
                {
                    label: "Copy Asset Name",
                    icon: "fas fa-copy",
                    action: () => this._copy(asset.name),
                },
                {
                    label: "Copy Path / URL",
                    icon: "fas fa-link",
                    action: () => this._copy(asset.sourcePath || asset.sourceURL || asset.data || ""),
                },
            ];

            const mainItems = [openAction];

            // -------------------------------------------------------------
            // DEDICATED SPRITE SHEET STUDIO ACTION
            // -------------------------------------------------------------
            if (isImageOrSprite) {
                mainItems.push({
                    label: "Edit Sprite Sheet & Slices…",
                    icon: "fas fa-scissors",
                    action: () => launchSpriteEditor(asset)
                });
            }

            mainItems.push(
                { sep: true },
                { label: "Asset Actions", icon: "fas fa-sliders", children: assetActions },
                { label: "Organize", icon: "fas fa-folder-tree", children: organizeActions },
                { label: "Copy", icon: "fas fa-copy", children: copyActions },
                { sep: true },
                {
                    label: "Delete",
                    shortcut: "Delete",
                    icon: "fas fa-trash",
                    danger: true,
                    disabled: !canDelete,
                    action: () => AP.deleteAsset?.(),
                }
            );

            const sections = [
                {
                    header: asset.name,
                    badge: isImageOrSprite ? "SPRITE / TEXTURE" : String(asset.type || "ASSET").toUpperCase(),
                    noSep: true,
                },
                { items: mainItems },
            ];

            return this._openAssetsMenu(event, sections, "assets-grid");
        },

        _installAssetsClickSubmenuStyles() {
            if (document.getElementById("sm-assets-click-submenu-styles")) return;

            const style = document.createElement("style");
            style.id = "sm-assets-click-submenu-styles";
            style.textContent = `
                .sm-dcc-menu[data-context-owner^="assets"] { overflow: visible !important; }
                .sm-dcc-menu[data-context-owner^="assets"] .sm-dcc-item.has-submenu { overflow: visible !important; cursor: default; }
                .sm-dcc-menu[data-context-owner^="assets"] .sm-dcc-item.has-submenu:hover > .sm-dcc-sub,
                .sm-dcc-menu[data-context-owner^="assets"] .sm-dcc-item:hover > .sm-dcc-sub { display: none !important; }
                .sm-dcc-menu[data-context-owner^="assets"] .sm-dcc-item.assets-submenu-open > .sm-dcc-sub,
                .sm-dcc-menu[data-context-owner^="assets"] .sm-dcc-item.has-submenu.assets-submenu-open:hover > .sm-dcc-sub {
                    display: block !important;
                    visibility: visible !important;
                    opacity: 1 !important;
                    pointer-events: auto !important;
                }
                .sm-dcc-menu[data-context-owner^="assets"] .sm-dcc-sub {
                    position: absolute !important;
                    z-index: 100020 !important;
                    overflow: visible !important;
                }
                .sm-dcc-menu[data-context-owner^="assets"] .sm-dcc-item.assets-submenu-open { background: #474747; }
            `;
            document.head.appendChild(style);
        },

        _closeAssetsSubmenus(menu, except = null) {
            if (!menu) return;
            menu.querySelectorAll(".sm-dcc-item.assets-submenu-open").forEach((item) => {
                if (except && (item === except || item.contains(except) || except.contains(item))) return;
                item.classList.remove("assets-submenu-open");
            });
        },

        _positionAssetsSubmenu(item, submenu) {
            if (!item || !submenu) return;
            submenu.style.left = "100%";
            submenu.style.right = "auto";
            submenu.style.top = "-4px";
            submenu.style.bottom = "auto";

            requestAnimationFrame(() => {
                if (!item.classList.contains("assets-submenu-open")) return;
                const vw = window.innerWidth || 1024;
                const vh = window.innerHeight || 768;
                let rect = submenu.getBoundingClientRect();
                if (rect.right > vw - 6) {
                    submenu.style.left = "auto";
                    submenu.style.right = "100%";
                }
                if (rect.bottom > vh - 6) {
                    submenu.style.top = "auto";
                    submenu.style.bottom = "-4px";
                }
            });
        },

        _enableAssetsClickSubmenus(menu) {
            if (!menu) return menu;
            this._installAssetsClickSubmenuStyles();

            const parents = Array.from(menu.querySelectorAll(".sm-dcc-item")).filter(
                (item) => item.querySelector(":scope > .sm-dcc-sub"),
            );

            parents.forEach((item) => {
                item.classList.add("has-submenu");
                item.setAttribute("aria-haspopup", "menu");
                item.setAttribute("aria-expanded", "false");
            });

            if (menu.dataset.assetsDelegatedSubmenuBound === "true") return menu;
            menu.dataset.assetsDelegatedSubmenuBound = "true";

            menu.addEventListener("click", (event) => {
                const clickedItem = event.target.closest(".sm-dcc-item");
                if (!clickedItem || !menu.contains(clickedItem)) return;

                const submenu = clickedItem.querySelector(":scope > .sm-dcc-sub");
                if (!submenu) return;

                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation();

                if (clickedItem.classList.contains("disabled")) return;

                const willOpen = !clickedItem.classList.contains("assets-submenu-open");
                this._closeAssetsSubmenus(menu, clickedItem);
                clickedItem.classList.toggle("assets-submenu-open", willOpen);

                if (!willOpen) return;
                this._positionAssetsSubmenu(clickedItem, submenu);
            }, true);

            menu.addEventListener("pointerdown", (event) => {
                if (!event.target.closest(".sm-dcc-item")) this._closeAssetsSubmenus(menu);
            });

            return menu;
        },

        _openAssetsMenu(event, sections, owner = "assets-grid") {
            const menu = root.SMContextMenu.open(event, sections, { owner });
            return this._enableAssetsClickSubmenus(menu);
        },

        _collectFolderTree(AP, folderId) {
            if (!folderId) return [];
            const ids = [];
            const walk = (id) => {
                if (!AP.folders?.[id]) return;
                ids.push(id);
                Object.values(AP.folders || {})
                    .filter((folder) => folder?.parentId === id)
                    .forEach((folder) => walk(folder.id));
            };
            walk(folderId);
            return ids;
        },

        _folderPath(AP, folderId) {
            if (!folderId) return "Project Assets";
            const parts = [];
            let current = AP.folders?.[folderId];
            while (current) {
                parts.unshift(current.name || current.id);
                current = current.parentId ? AP.folders?.[current.parentId] : null;
            }
            return `Project Assets/${parts.join("/")}`;
        },

        _copy(value) {
            const text = String(value ?? "");
            if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
            return Promise.resolve();
        },

        _importInto(AP, folderId, folderMode) {
            AP.openFolderId = folderId || null;
            AP.currentCategory = "project";
            if (folderMode) AP.dom?.uploadFolderInput ? AP.dom.uploadFolderInput.click() : AP.showUploadZone?.();
            else AP.dom?.uploadInput ? AP.dom.uploadInput.click() : AP.showUploadZone?.();
        },

        _isProtectedFolder(folder) {
            return !folder || folder.isBuiltIn;
        },

        _isProtectedAsset(asset) {
            return !asset || asset.isBuiltIn;
        },

        _moveFolder(AP, folderId, targetFolderId) {
            const folder = AP.folders?.[folderId];
            if (!folder || this._isProtectedFolder(folder) || folderId === targetFolderId) return false;

            const descendants = new Set(this._collectFolderTree(AP, folderId));
            if (targetFolderId && descendants.has(targetFolderId)) {
                alert("A folder cannot be moved inside itself or one of its descendants.");
                return false;
            }

            const oldParent = folder.parentId || null;
            if (oldParent && AP.folders?.[oldParent]) {
                AP.folders[oldParent].children = (AP.folders[oldParent].children || []).filter((id) => id !== folderId);
            }

            folder.parentId = targetFolderId || null;
            if (targetFolderId && AP.folders?.[targetFolderId]) {
                const target = AP.folders[targetFolderId];
                if (!Array.isArray(target.children)) target.children = [];
                if (!target.children.includes(folderId)) target.children.push(folderId);
            }

            AP._saveToStorage?.();
            AP.onFolderChanged?.(AP.folders);
            AP.render?.();
            return true;
        },

        _folderMoveTargets(AP, folderId) {
            const excluded = new Set(this._collectFolderTree(AP, folderId));
            const build = (parentId = null) =>
                Object.values(AP.folders || {})
                    .filter((folder) => (folder.parentId || null) === (parentId || null) && !excluded.has(folder.id) && !this._isProtectedFolder(folder))
                    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")))
                    .map((folder) => ({
                        label: folder.name,
                        icon: "fas fa-folder",
                        action: () => this._moveFolder(AP, folderId, folder.id),
                        children: build(folder.id),
                    }));

            return [
                {
                    label: "Project Assets (Root)",
                    icon: "fas fa-boxes-stacked",
                    action: () => this._moveFolder(AP, folderId, null),
                },
                { sep: true },
                ...build(null),
            ];
        },

        _assetMoveTargets(AP, assetId) {
            const build = (parentId = null) =>
                Object.values(AP.folders || {})
                    .filter((folder) => (folder.parentId || null) === (parentId || null) && !this._isProtectedFolder(folder))
                    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")))
                    .map((folder) => ({
                        label: folder.name,
                        icon: "fas fa-folder",
                        action: () => AP.moveAssetToFolder?.(assetId, folder.id),
                        children: build(folder.id),
                    }));

            return [
                {
                    label: "Project Assets (Root)",
                    icon: "fas fa-boxes-stacked",
                    action: () => AP.moveAssetToFolder?.(assetId, null),
                },
                { sep: true },
                ...build(null),
            ];
        },

        _owningGameProject(AP, folderId) {
            let currentId = folderId || null;
            while (currentId) {
                const folder = AP.folders?.[currentId];
                if (!folder) break;
                if (folder.isGameProject) return folder;
                currentId = folder.parentId || null;
            }
            return null;
        }
    };

    root.AssetsPanelContextMenuUnified = Unified;
    root.addEventListener("sm-assets-panel-ready", () => Unified.install());

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => setTimeout(() => Unified.install(), 0), { once: true });
    } else {
        setTimeout(() => Unified.install(), 0);
    }
})(window);