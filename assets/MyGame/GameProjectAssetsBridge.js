/**
 * GameProjectAssetsBridge.js
 * STEP 2 — Game Project structure support for SM Engine AssetsPanel.
 *
 * Includes STEP 1:
 *  - "New Game Project..."
 *  - special Game Project folder
 *  - game.smproject
 *  - Game Project icon/label
 *
 * STEP 2 adds:
 *  - automatic project folder structure
 *  - upgrade of existing Step-1 projects
 *  - idempotent structure initialization (safe to call more than once)
 *
 * Default structure:
 *  MyGame/
 *  ├── game.smproject
 *  ├── Maps/
 *  ├── Prefabs/
 *  ├── Models/
 *  ├── Materials/
 *  ├── Textures/
 *  ├── Audio/
 *  ├── UI/
 *  ├── Scripts/
 *  └── Config/
 *
 * Load AFTER AssetsPanel.js.
 */

(function (root) {
    "use strict";

    function getAssetsPanel() {
        if (typeof AssetsPanel !== "undefined") return AssetsPanel;
        return root.AssetsPanel || null;
    }

    const DEFAULT_GAME_PROJECT_FOLDERS = [
        "Maps",
        "Prefabs",
        "Models",
        "Materials",
        "Textures",
        "Audio",
        "UI",
        "Scripts",
        "Config"
    ];

    const GameProjectAssetsBridge = {
        installed: false,
        structureVersion: 1,

        install() {
            if (this.installed) return true;

            const AP = getAssetsPanel();
            if (!AP) {
                setTimeout(() => this.install(), 100);
                return false;
            }

            this.installed = true;

            this._installStructureAPI(AP);
            this._installCreateGameProject(AP);
            this._patchEmptyGridContextMenu(AP);
            this._patchRender(AP);
            this._patchFolderContextMenu(AP);
            this._patchAddToScene(AP);

            // Upgrade Game Projects created with Step 1.
            this._upgradeExistingProjects(AP);

            try { AP.render?.(); } catch {}

            console.log("[GameProjectAssetsBridge] Step 2 installed.");
            return true;
        },

        _makeId(prefix) {
            if (root.crypto?.randomUUID) {
                return `${prefix}_${root.crypto.randomUUID()}`;
            }

            return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1000000)}`;
        },

        _sanitizeProjectName(name) {
            return String(name || "")
                .replace(/[\\/:*?"<>|]/g, " ")
                .replace(/\s+/g, " ")
                .trim();
        },

        _findProjectManifest(AP, projectFolder) {
            if (!projectFolder) return null;

            if (projectFolder.manifestAssetId) {
                const direct = AP.assets?.find(
                    asset => asset.id === projectFolder.manifestAssetId
                );
                if (direct) return direct;
            }

            return AP.assets?.find(asset =>
                asset &&
                asset.folderId === projectFolder.id &&
                (
                    asset.isGameProjectManifest ||
                    asset.type === "game-project" ||
                    asset.name === "game.smproject"
                )
            ) || null;
        },

        _parseManifest(asset) {
            if (!asset) return null;

            if (asset.definition && typeof asset.definition === "object") {
                return asset.definition;
            }

            try {
                return JSON.parse(asset.data || "{}");
            } catch {
                return null;
            }
        },

        _writeManifest(AP, asset, manifest) {
            if (!asset || !manifest) return;

            asset.definition = manifest;
            asset.data = JSON.stringify(manifest, null, 2);

            try {
                AP._commitAssetVersion?.(
                    asset.id,
                    `Project structure updated to v${manifest.structureVersion || 1}`
                );
            } catch {}
        },

        _projectFolderIconMarkup() {
            return `
                <div class="sm-game-project-icon" aria-hidden="true">
                    <i class="fas fa-gamepad"></i>
                </div>
            `;
        },

        _manifestThumbnail() {
            return `
                <svg viewBox="0 0 128 128" width="100%" height="100%" aria-hidden="true">
                    <rect x="20" y="14" width="88" height="100" fill="#393939"/>
                    <path d="M84 14H108V38H84Z" fill="#4a4a4a"/>
                    <path d="M84 14L108 38H84Z" fill="#606060"/>
                    <rect x="29" y="49" width="70" height="42" rx="6" fill="#2f2f2f"/>
                    <circle cx="48" cy="70" r="8" fill="#6a6a6a"/>
                    <rect x="44" y="57" width="8" height="26" rx="2" fill="#8b8b8b"/>
                    <rect x="35" y="66" width="26" height="8" rx="2" fill="#8b8b8b"/>
                    <circle cx="79" cy="64" r="5" fill="#888"/>
                    <circle cx="90" cy="76" r="5" fill="#888"/>
                    <text x="64" y="106" text-anchor="middle"
                          font-family="Arial,sans-serif"
                          font-size="10" fill="#cfcfcf">SM PROJECT</text>
                </svg>
            `;
        },

        _installStructureAPI(AP) {
            /**
             * Initialize or repair the default folders inside one Game Project.
             *
             * folderId:
             *   - Game Project folder id
             *   - null => use currently open folder if it is a Game Project
             *
             * Safe to call multiple times: existing folders are reused.
             */
            AP.initializeGameProjectStructure = function (folderId = null) {
                const bridge = root.GameProjectAssetsBridge;

                const targetId = folderId || this.openFolderId;
                const projectFolder = this.folders?.[targetId];

                if (!projectFolder?.isGameProject) {
                    console.warn(
                        "[AssetsPanel] initializeGameProjectStructure: " +
                        "target folder is not a Game Project."
                    );
                    return null;
                }

                if (!Array.isArray(projectFolder.children)) {
                    projectFolder.children = [];
                }

                const folderIds = {};

                for (const folderName of DEFAULT_GAME_PROJECT_FOLDERS) {
                    let child = Object.values(this.folders || {}).find(folder =>
                        folder &&
                        folder.name === folderName &&
                        (folder.parentId || null) === projectFolder.id
                    );

                    if (!child) {
                        const childId = this.createFolder(
                            folderName,
                            projectFolder.id
                        );
                        child = this.folders?.[childId];
                    }

                    if (!child) continue;

                    child.isGameContentFolder = true;
                    child.gameProjectId = projectFolder.projectId || null;
                    child.gameContentType = folderName.toLowerCase();

                    if (!projectFolder.children.includes(child.id)) {
                        projectFolder.children.push(child.id);
                    }

                    folderIds[folderName] = child.id;
                }

                projectFolder.structureVersion = bridge.structureVersion;
                projectFolder.gameContentFolders = { ...folderIds };

                const manifestAsset =
                    bridge._findProjectManifest(this, projectFolder);

                if (manifestAsset) {
                    const manifest =
                        bridge._parseManifest(manifestAsset) || {};

                    manifest.format =
                        manifest.format || "SM_GAME_PROJECT";
                    manifest.version =
                        Number.isFinite(manifest.version)
                            ? manifest.version
                            : 1;
                    manifest.id =
                        manifest.id ||
                        projectFolder.projectId ||
                        bridge._makeId("smgame");
                    manifest.name =
                        projectFolder.name;
                    manifest.structureVersion =
                        bridge.structureVersion;

                    manifest.contentFolders = {
                        maps: folderIds.Maps || null,
                        prefabs: folderIds.Prefabs || null,
                        models: folderIds.Models || null,
                        materials: folderIds.Materials || null,
                        textures: folderIds.Textures || null,
                        audio: folderIds.Audio || null,
                        ui: folderIds.UI || null,
                        scripts: folderIds.Scripts || null,
                        config: folderIds.Config || null
                    };

                    bridge._writeManifest(
                        this,
                        manifestAsset,
                        manifest
                    );
                }

                this.expandedFolders?.add(projectFolder.id);

                // Save only after all folders/metadata are ready.
                this._saveToStorage?.();

                if (typeof this.onFolderChanged === "function") {
                    this.onFolderChanged(this.folders);
                }

                this.render?.();

                console.log(
                    `[AssetsPanel] Game Project structure ready: ${projectFolder.name}`,
                    folderIds
                );

                return {
                    projectFolder,
                    folders: folderIds,
                    manifestAsset
                };
            };

            /**
             * Convenience helper for console/testing.
             */
            AP.initializeCurrentGameProjectStructure = function () {
                return this.initializeGameProjectStructure(
                    this.openFolderId
                );
            };
        },

        _installCreateGameProject(AP) {
            // Replace any Step-1 version so new projects always get Step-2 structure.
            AP.createGameProject = function (name = null, parentId = undefined) {
                const bridge = root.GameProjectAssetsBridge;

                let projectName =
                    name || prompt("Game Project name:", "MyGame");

                projectName =
                    bridge._sanitizeProjectName(projectName);

                if (!projectName) return null;

                const resolvedParentId =
                    parentId !== undefined
                        ? parentId
                        : (this.openFolderId || null);

                // Do not nest a Game Project inside another Game Project.
                let cursorId = resolvedParentId;

                while (cursorId) {
                    const ancestor = this.folders?.[cursorId];
                    if (!ancestor) break;

                    if (ancestor.isGameProject) {
                        alert(
                            "Create the Game Project outside another Game Project folder."
                        );
                        return null;
                    }

                    cursorId = ancestor.parentId || null;
                }

                const folderId =
                    this.createFolder(
                        projectName,
                        resolvedParentId
                    );

                const folder = this.folders?.[folderId];
                if (!folder) return null;

                const projectId =
                    bridge._makeId("smgame");

                const manifestAssetId =
                    bridge._makeId("gameproject");

                Object.assign(folder, {
                    isGameProject: true,
                    projectId,
                    projectFormat: "SM_GAME_PROJECT",
                    projectVersion: 1,
                    structureVersion: 0,
                    manifestAssetId
                });

                const manifest = {
                    format: "SM_GAME_PROJECT",
                    version: 1,
                    structureVersion: 0,
                    id: projectId,
                    name: folder.name,

                    // Kept null until Scene system is added.
                    startupScene: null,
                    defaultGameScene: null,

                    contentFolders: {},
                    createdAt: new Date().toISOString()
                };

                const manifestAsset = {
                    id: manifestAssetId,
                    name: "game.smproject",
                    type: "game-project",
                    data: JSON.stringify(manifest, null, 2),
                    definition: manifest,
                    thumbnail: bridge._manifestThumbnail(),
                    isFavorite: false,
                    isBuiltIn: false,
                    folderId,
                    tags: ["game-project", "project"],
                    history: [],
                    references: [],
                    isGameProjectManifest: true,
                    projectId
                };

                this.assets.push(manifestAsset);

                try {
                    this._commitAssetVersion?.(
                        manifestAsset.id,
                        `Created Game Project "${folder.name}"`
                    );
                } catch {}

                this.openFolderId = folderId;
                this.currentCategory = "project";
                this.expandedFolders?.add(folderId);

                if (resolvedParentId) {
                    this.expandedFolders?.add(
                        resolvedParentId
                    );
                }

                // STEP 2:
                // create Maps, Prefabs, Models... automatically.
                const structure =
                    this.initializeGameProjectStructure(folderId);

                this._saveToStorage?.();

                if (typeof this.onAssetAdded === "function") {
                    this.onAssetAdded(manifestAsset);
                }

                this.render?.();
                this._buildTagCloud?.();
                this._syncRuntimeAssetRegistry?.();

                console.log(
                    `[AssetsPanel] Game Project created: ${folder.name}`
                );

                return {
                    folder,
                    manifestAsset,
                    manifest:
                        bridge._parseManifest(manifestAsset),
                    structure
                };
            };
        },

        _upgradeExistingProjects(AP) {
            const projects =
                Object.values(AP.folders || {})
                    .filter(folder => folder?.isGameProject);

            if (!projects.length) return;

            for (const project of projects) {
                const currentVersion =
                    Number(project.structureVersion || 0);

                if (currentVersion >= this.structureVersion) {
                    // Even for already upgraded projects, repair missing
                    // folders if the user deleted one manually.
                    const existingNames =
                        new Set(
                            Object.values(AP.folders || {})
                                .filter(
                                    folder =>
                                        (folder.parentId || null) === project.id
                                )
                                .map(folder => folder.name)
                        );

                    const missing =
                        DEFAULT_GAME_PROJECT_FOLDERS.some(
                            name => !existingNames.has(name)
                        );

                    if (!missing) continue;
                }

                AP.initializeGameProjectStructure(project.id);
            }
        },

        _patchEmptyGridContextMenu(AP) {
            if (AP.__smGameProjectEmptyMenuPatchedV2) return;
            AP.__smGameProjectEmptyMenuPatchedV2 = true;

            const original = AP._showEmptyGridContextMenu;

            AP._showEmptyGridContextMenu = function (event) {
                if (!this.dom?.contextMenu) {
                    return original?.call(this, event);
                }

                this.dom.contextMenu.style.display = "block";
                this.dom.contextMenu.style.left =
                    `${event.clientX}px`;
                this.dom.contextMenu.style.top =
                    `${event.clientY}px`;

                // Do not offer a nested Game Project if currently inside one.
                let insideGameProject = false;
                let cursorId = this.openFolderId;

                while (cursorId) {
                    const folder = this.folders?.[cursorId];
                    if (!folder) break;

                    if (folder.isGameProject) {
                        insideGameProject = true;
                        break;
                    }

                    cursorId = folder.parentId || null;
                }

                this.dom.contextMenu.innerHTML = `
                    <div class="context-menu-item"
                         onclick="AssetsPanel.createFolder(
                             'New Folder',
                             AssetsPanel.openFolderId || null
                         )">
                        New Folder
                    </div>

                    ${
                        !insideGameProject
                            ? `
                                <div class="context-menu-item sm-new-game-project-menu"
                                     onclick="AssetsPanel.createGameProject()">
                                    <i class="fas fa-gamepad"></i>
                                    <span>New Game Project...</span>
                                </div>
                              `
                            : ""
                    }

                    <div class="context-menu-separator"></div>

                    <div class="context-menu-item"
                         onclick="AssetsPanel.showUploadZone()">
                        Import Asset...
                    </div>
                `;
            };
        },

        _patchRender(AP) {
            if (AP.__smGameProjectRenderPatchedV2) return;
            AP.__smGameProjectRenderPatchedV2 = true;

            const originalRender = AP.render;

            AP.render = function (...args) {
                const result =
                    originalRender.apply(this, args);

                try {
                    root.GameProjectAssetsBridge
                        ._decorateProjectFolders(this);
                } catch (error) {
                    console.warn(
                        "[GameProjectAssetsBridge] Decoration failed:",
                        error
                    );
                }

                return result;
            };
        },

        _decorateProjectFolders(AP) {
            const parentId =
                AP.openFolderId || null;

            const visibleFolders =
                Object.values(AP.folders || {})
                    .filter(
                        folder =>
                            (folder.parentId || null) === parentId
                    )
                    .sort(
                        (a, b) =>
                            a.name.localeCompare(b.name)
                    );

            const gridFolderItems =
                Array.from(
                    AP.dom?.grid?.querySelectorAll?.(
                        ".asset-item.folder-item"
                    ) || []
                );

            gridFolderItems.forEach((item, index) => {
                const folder =
                    visibleFolders[index];

                if (!folder) return;

                item.dataset.folderId =
                    folder.id;

                item.oncontextmenu = event => {
                    event.preventDefault();
                    AP._showFolderContextMenu?.(
                        event,
                        folder.id
                    );
                };

                if (!folder.isGameProject) return;

                item.classList.add(
                    "game-project-folder"
                );

                item.dataset.type =
                    "game-project-folder";

                const thumb =
                    item.querySelector(
                        ".asset-thumbnail"
                    );

                if (thumb) {
                    thumb.innerHTML =
                        root.GameProjectAssetsBridge
                            ._projectFolderIconMarkup();
                }

                const meta =
                    item.querySelector(".asset-meta");

                if (meta) {
                    meta.textContent =
                        "Game Project";
                }
            });

            for (
                const folder of
                Object.values(AP.folders || {})
            ) {
                if (!folder?.isGameProject) continue;

                const safeId =
                    String(folder.id)
                        .replace(/\\/g, "\\\\")
                        .replace(/"/g, '\\"');

                const row =
                    document.querySelector(
                        `[data-folder-id="${safeId}"]`
                    );

                if (!row) continue;

                row.classList.add(
                    "game-project-folder-tree"
                );

                const icon =
                    row.querySelector(
                        ".category-icon"
                    );

                if (icon) {
                    icon.innerHTML =
                        `<i class="fas fa-gamepad"></i>`;
                }

                const name =
                    row.querySelector(
                        ".folder-name, .tree-label"
                    );

                if (name) {
                    name.dataset.gameProject =
                        "true";
                }
            }
        },

        _patchFolderContextMenu(AP) {
            if (AP.__smGameProjectFolderMenuPatchedV2) return;
            AP.__smGameProjectFolderMenuPatchedV2 = true;

            const original =
                AP._showFolderContextMenu;

            AP._showFolderContextMenu =
                function (event, folderId) {
                    const folder =
                        this.folders?.[folderId];

                    if (!folder?.isGameProject) {
                        return original?.call(
                            this,
                            event,
                            folderId
                        );
                    }

                    if (!this.dom?.contextMenu) return;

                    this.dom.contextMenu.style.display =
                        "block";
                    this.dom.contextMenu.style.left =
                        `${event.clientX}px`;
                    this.dom.contextMenu.style.top =
                        `${event.clientY}px`;
                    this.dom.contextMenu.innerHTML = "";

                    const create =
                        (label, callback, style = "") => {
                            const item =
                                document.createElement("div");

                            item.className =
                                "context-menu-item";

                            if (style) item.style = style;

                            item.textContent = label;

                            item.onclick = () => {
                                callback();
                                this.dom.contextMenu.style.display =
                                    "none";
                            };

                            this.dom.contextMenu
                                .appendChild(item);
                        };

                    const separator = () => {
                        const element =
                            document.createElement("div");

                        element.className =
                            "context-menu-separator";

                        this.dom.contextMenu
                            .appendChild(element);
                    };

                    create(
                        "Open Game Project",
                        () => this.openFolder(folderId)
                    );

                    create(
                        "Repair / Initialize Structure",
                        () =>
                            this.initializeGameProjectStructure(
                                folderId
                            )
                    );

                    separator();

                    create(
                        "Rename Game Project",
                        () => this.renameFolder(folderId)
                    );

                    separator();

                    create(
                        "Delete Game Project",
                        () => {
                            if (
                                confirm(
                                    `Delete Game Project "${folder.name}" and all its contents?`
                                )
                            ) {
                                this.deleteFolder(
                                    folderId,
                                    { deleteContents: true }
                                );
                            }
                        },
                        "color: var(--danger-color);"
                    );
                };
        },

        _patchAddToScene(AP) {
            if (AP.__smGameProjectAddToScenePatchedV2) return;
            AP.__smGameProjectAddToScenePatchedV2 = true;

            const original =
                AP._addToScene;

            AP._addToScene =
                async function (assetId, ...args) {
                    const asset =
                        this._findById?.(assetId);

                    if (
                        asset?.type === "game-project" ||
                        asset?.isGameProjectManifest
                    ) {
                        const project = Object.values(this.folders || {}).find(
                            folder => folder?.isGameProject && (
                                folder.id === asset.folderId ||
                                folder.projectId === asset.projectId
                            )
                        );

                        if (project && typeof this.loadGameProject === "function") {
                            return this.loadGameProject(project, {
                                openStartup: true,
                                replaceScene: true,
                                requireStartup: true
                            });
                        }

                        console.info(
                            "[GameProjectAssetsBridge] game.smproject is ready, " +
                            "but the runtime bridge has not installed yet.",
                            asset.definition || asset.data
                        );
                        return asset;
                    }

                    return original?.call(
                        this,
                        assetId,
                        ...args
                    );
                };
        }
    };

    root.GameProjectAssetsBridge =
        GameProjectAssetsBridge;

    if (document.readyState === "loading") {
        document.addEventListener(
            "DOMContentLoaded",
            () =>
                GameProjectAssetsBridge.install(),
            { once: true }
        );
    } else {
        GameProjectAssetsBridge.install();
    }
})(window);
/**
 * GameProjectAssetsBridge.js
 * STEP 2 — Game Project structure support for SM Engine AssetsPanel.
 *
 * Includes STEP 1:
 *  - "New Game Project..."
 *  - special Game Project folder
 *  - game.smproject
 *  - Game Project icon/label
 *
 * STEP 2 adds:
 *  - automatic project folder structure
 *  - upgrade of existing Step-1 projects
 *  - idempotent structure initialization (safe to call more than once)
 *
 * Default structure:
 *  MyGame/
 *  ├── game.smproject
 *  ├── Maps/
 *  ├── Prefabs/
 *  ├── Models/
 *  ├── Materials/
 *  ├── Textures/
 *  ├── Audio/
 *  ├── UI/
 *  ├── Scripts/
 *  └── Config/
 *
 * Load AFTER AssetsPanel.js.
 */

(function (root) {
    "use strict";

    function getAssetsPanel() {
        if (typeof AssetsPanel !== "undefined") return AssetsPanel;
        return root.AssetsPanel || null;
    }

    const DEFAULT_GAME_PROJECT_FOLDERS = [
        "Maps",
        "Prefabs",
        "Models",
        "Materials",
        "Textures",
        "Audio",
        "UI",
        "Scripts",
        "Config"
    ];

    const GameProjectAssetsBridge = {
        installed: false,
        structureVersion: 1,

        install() {
            if (this.installed) return true;

            const AP = getAssetsPanel();
            if (!AP) {
                setTimeout(() => this.install(), 100);
                return false;
            }

            this.installed = true;

            this._installStructureAPI(AP);
            this._installCreateGameProject(AP);
            this._patchEmptyGridContextMenu(AP);
            this._patchRender(AP);
            this._patchFolderContextMenu(AP);
            this._patchAddToScene(AP);

            // Upgrade Game Projects created with Step 1.
            this._upgradeExistingProjects(AP);

            try { AP.render?.(); } catch {}

            console.log("[GameProjectAssetsBridge] Step 2 installed.");
            return true;
        },

        _makeId(prefix) {
            if (root.crypto?.randomUUID) {
                return `${prefix}_${root.crypto.randomUUID()}`;
            }

            return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1000000)}`;
        },

        _sanitizeProjectName(name) {
            return String(name || "")
                .replace(/[\\/:*?"<>|]/g, " ")
                .replace(/\s+/g, " ")
                .trim();
        },

        _findProjectManifest(AP, projectFolder) {
            if (!projectFolder) return null;

            if (projectFolder.manifestAssetId) {
                const direct = AP.assets?.find(
                    asset => asset.id === projectFolder.manifestAssetId
                );
                if (direct) return direct;
            }

            return AP.assets?.find(asset =>
                asset &&
                asset.folderId === projectFolder.id &&
                (
                    asset.isGameProjectManifest ||
                    asset.type === "game-project" ||
                    asset.name === "game.smproject"
                )
            ) || null;
        },

        _parseManifest(asset) {
            if (!asset) return null;

            if (asset.definition && typeof asset.definition === "object") {
                return asset.definition;
            }

            try {
                return JSON.parse(asset.data || "{}");
            } catch {
                return null;
            }
        },

        _writeManifest(AP, asset, manifest) {
            if (!asset || !manifest) return;

            asset.definition = manifest;
            asset.data = JSON.stringify(manifest, null, 2);

            try {
                AP._commitAssetVersion?.(
                    asset.id,
                    `Project structure updated to v${manifest.structureVersion || 1}`
                );
            } catch {}
        },

        _projectFolderIconMarkup() {
            return `
                <div class="sm-game-project-icon" aria-hidden="true">
                    <i class="fas fa-gamepad"></i>
                </div>
            `;
        },

        _manifestThumbnail() {
            return `
                <svg viewBox="0 0 128 128" width="100%" height="100%" aria-hidden="true">
                    <rect x="20" y="14" width="88" height="100" fill="#393939"/>
                    <path d="M84 14H108V38H84Z" fill="#4a4a4a"/>
                    <path d="M84 14L108 38H84Z" fill="#606060"/>
                    <rect x="29" y="49" width="70" height="42" rx="6" fill="#2f2f2f"/>
                    <circle cx="48" cy="70" r="8" fill="#6a6a6a"/>
                    <rect x="44" y="57" width="8" height="26" rx="2" fill="#8b8b8b"/>
                    <rect x="35" y="66" width="26" height="8" rx="2" fill="#8b8b8b"/>
                    <circle cx="79" cy="64" r="5" fill="#888"/>
                    <circle cx="90" cy="76" r="5" fill="#888"/>
                    <text x="64" y="106" text-anchor="middle"
                          font-family="Arial,sans-serif"
                          font-size="10" fill="#cfcfcf">SM PROJECT</text>
                </svg>
            `;
        },

        _installStructureAPI(AP) {
            /**
             * Initialize or repair the default folders inside one Game Project.
             *
             * folderId:
             *   - Game Project folder id
             *   - null => use currently open folder if it is a Game Project
             *
             * Safe to call multiple times: existing folders are reused.
             */
            AP.initializeGameProjectStructure = function (folderId = null) {
                const bridge = root.GameProjectAssetsBridge;

                const targetId = folderId || this.openFolderId;
                const projectFolder = this.folders?.[targetId];

                if (!projectFolder?.isGameProject) {
                    console.warn(
                        "[AssetsPanel] initializeGameProjectStructure: " +
                        "target folder is not a Game Project."
                    );
                    return null;
                }

                if (!Array.isArray(projectFolder.children)) {
                    projectFolder.children = [];
                }

                const folderIds = {};

                for (const folderName of DEFAULT_GAME_PROJECT_FOLDERS) {
                    let child = Object.values(this.folders || {}).find(folder =>
                        folder &&
                        folder.name === folderName &&
                        (folder.parentId || null) === projectFolder.id
                    );

                    if (!child) {
                        const childId = this.createFolder(
                            folderName,
                            projectFolder.id
                        );
                        child = this.folders?.[childId];
                    }

                    if (!child) continue;

                    child.isGameContentFolder = true;
                    child.gameProjectId = projectFolder.projectId || null;
                    child.gameContentType = folderName.toLowerCase();

                    if (!projectFolder.children.includes(child.id)) {
                        projectFolder.children.push(child.id);
                    }

                    folderIds[folderName] = child.id;
                }

                projectFolder.structureVersion = bridge.structureVersion;
                projectFolder.gameContentFolders = { ...folderIds };

                const manifestAsset =
                    bridge._findProjectManifest(this, projectFolder);

                if (manifestAsset) {
                    const manifest =
                        bridge._parseManifest(manifestAsset) || {};

                    manifest.format =
                        manifest.format || "SM_GAME_PROJECT";
                    manifest.version =
                        Number.isFinite(manifest.version)
                            ? manifest.version
                            : 1;
                    manifest.id =
                        manifest.id ||
                        projectFolder.projectId ||
                        bridge._makeId("smgame");
                    manifest.name =
                        projectFolder.name;
                    manifest.structureVersion =
                        bridge.structureVersion;

                    manifest.contentFolders = {
                        maps: folderIds.Maps || null,
                        prefabs: folderIds.Prefabs || null,
                        models: folderIds.Models || null,
                        materials: folderIds.Materials || null,
                        textures: folderIds.Textures || null,
                        audio: folderIds.Audio || null,
                        ui: folderIds.UI || null,
                        scripts: folderIds.Scripts || null,
                        config: folderIds.Config || null
                    };

                    bridge._writeManifest(
                        this,
                        manifestAsset,
                        manifest
                    );
                }

                this.expandedFolders?.add(projectFolder.id);

                // Save only after all folders/metadata are ready.
                this._saveToStorage?.();

                if (typeof this.onFolderChanged === "function") {
                    this.onFolderChanged(this.folders);
                }

                this.render?.();

                console.log(
                    `[AssetsPanel] Game Project structure ready: ${projectFolder.name}`,
                    folderIds
                );

                return {
                    projectFolder,
                    folders: folderIds,
                    manifestAsset
                };
            };

            /**
             * Convenience helper for console/testing.
             */
            AP.initializeCurrentGameProjectStructure = function () {
                return this.initializeGameProjectStructure(
                    this.openFolderId
                );
            };
        },

        _installCreateGameProject(AP) {
            // Replace any Step-1 version so new projects always get Step-2 structure.
            AP.createGameProject = function (name = null, parentId = undefined) {
                const bridge = root.GameProjectAssetsBridge;

                let projectName =
                    name || prompt("Game Project name:", "MyGame");

                projectName =
                    bridge._sanitizeProjectName(projectName);

                if (!projectName) return null;

                const resolvedParentId =
                    parentId !== undefined
                        ? parentId
                        : (this.openFolderId || null);

                // Do not nest a Game Project inside another Game Project.
                let cursorId = resolvedParentId;

                while (cursorId) {
                    const ancestor = this.folders?.[cursorId];
                    if (!ancestor) break;

                    if (ancestor.isGameProject) {
                        alert(
                            "Create the Game Project outside another Game Project folder."
                        );
                        return null;
                    }

                    cursorId = ancestor.parentId || null;
                }

                const folderId =
                    this.createFolder(
                        projectName,
                        resolvedParentId
                    );

                const folder = this.folders?.[folderId];
                if (!folder) return null;

                const projectId =
                    bridge._makeId("smgame");

                const manifestAssetId =
                    bridge._makeId("gameproject");

                Object.assign(folder, {
                    isGameProject: true,
                    projectId,
                    projectFormat: "SM_GAME_PROJECT",
                    projectVersion: 1,
                    structureVersion: 0,
                    manifestAssetId
                });

                const manifest = {
                    format: "SM_GAME_PROJECT",
                    version: 1,
                    structureVersion: 0,
                    id: projectId,
                    name: folder.name,

                    // Kept null until Scene system is added.
                    startupScene: null,
                    defaultGameScene: null,

                    contentFolders: {},
                    createdAt: new Date().toISOString()
                };

                const manifestAsset = {
                    id: manifestAssetId,
                    name: "game.smproject",
                    type: "game-project",
                    data: JSON.stringify(manifest, null, 2),
                    definition: manifest,
                    thumbnail: bridge._manifestThumbnail(),
                    isFavorite: false,
                    isBuiltIn: false,
                    folderId,
                    tags: ["game-project", "project"],
                    history: [],
                    references: [],
                    isGameProjectManifest: true,
                    projectId
                };

                this.assets.push(manifestAsset);

                try {
                    this._commitAssetVersion?.(
                        manifestAsset.id,
                        `Created Game Project "${folder.name}"`
                    );
                } catch {}

                this.openFolderId = folderId;
                this.currentCategory = "project";
                this.expandedFolders?.add(folderId);

                if (resolvedParentId) {
                    this.expandedFolders?.add(
                        resolvedParentId
                    );
                }

                // STEP 2:
                // create Maps, Prefabs, Models... automatically.
                const structure =
                    this.initializeGameProjectStructure(folderId);

                this._saveToStorage?.();

                if (typeof this.onAssetAdded === "function") {
                    this.onAssetAdded(manifestAsset);
                }

                this.render?.();
                this._buildTagCloud?.();
                this._syncRuntimeAssetRegistry?.();

                console.log(
                    `[AssetsPanel] Game Project created: ${folder.name}`
                );

                return {
                    folder,
                    manifestAsset,
                    manifest:
                        bridge._parseManifest(manifestAsset),
                    structure
                };
            };
        },

        _upgradeExistingProjects(AP) {
            const projects =
                Object.values(AP.folders || {})
                    .filter(folder => folder?.isGameProject);

            if (!projects.length) return;

            for (const project of projects) {
                const currentVersion =
                    Number(project.structureVersion || 0);

                if (currentVersion >= this.structureVersion) {
                    // Even for already upgraded projects, repair missing
                    // folders if the user deleted one manually.
                    const existingNames =
                        new Set(
                            Object.values(AP.folders || {})
                                .filter(
                                    folder =>
                                        (folder.parentId || null) === project.id
                                )
                                .map(folder => folder.name)
                        );

                    const missing =
                        DEFAULT_GAME_PROJECT_FOLDERS.some(
                            name => !existingNames.has(name)
                        );

                    if (!missing) continue;
                }

                AP.initializeGameProjectStructure(project.id);
            }
        },

        _patchEmptyGridContextMenu(AP) {
            if (AP.__smGameProjectEmptyMenuPatchedV2) return;
            AP.__smGameProjectEmptyMenuPatchedV2 = true;

            // AssetsPanel v2 owns the compact native menu and dynamically
            // detects createGameProject(). Do not override it.
            if (AP.__nativeAssetsContextMenusV2 || typeof AP._openNativeContextMenu === "function") {
                return;
            }

            const original = AP._showEmptyGridContextMenu;

            AP._showEmptyGridContextMenu = function (event) {
                if (!this.dom?.contextMenu) {
                    return original?.call(this, event);
                }

                this.dom.contextMenu.style.display = "block";
                this.dom.contextMenu.style.left =
                    `${event.clientX}px`;
                this.dom.contextMenu.style.top =
                    `${event.clientY}px`;

                // Do not offer a nested Game Project if currently inside one.
                let insideGameProject = false;
                let cursorId = this.openFolderId;

                while (cursorId) {
                    const folder = this.folders?.[cursorId];
                    if (!folder) break;

                    if (folder.isGameProject) {
                        insideGameProject = true;
                        break;
                    }

                    cursorId = folder.parentId || null;
                }

                this.dom.contextMenu.innerHTML = `
                    <div class="context-menu-item"
                         onclick="AssetsPanel.createFolder(
                             'New Folder',
                             AssetsPanel.openFolderId || null
                         )">
                        New Folder
                    </div>

                    ${
                        !insideGameProject
                            ? `
                                <div class="context-menu-item sm-new-game-project-menu"
                                     onclick="AssetsPanel.createGameProject()">
                                    <i class="fas fa-gamepad"></i>
                                    <span>New Game Project...</span>
                                </div>
                              `
                            : ""
                    }

                    <div class="context-menu-separator"></div>

                    <div class="context-menu-item"
                         onclick="AssetsPanel.showUploadZone()">
                        Import Asset...
                    </div>
                `;
            };
        },

        _patchRender(AP) {
            if (AP.__smGameProjectRenderPatchedV2) return;
            AP.__smGameProjectRenderPatchedV2 = true;

            const originalRender = AP.render;

            AP.render = function (...args) {
                const result =
                    originalRender.apply(this, args);

                try {
                    root.GameProjectAssetsBridge
                        ._decorateProjectFolders(this);
                } catch (error) {
                    console.warn(
                        "[GameProjectAssetsBridge] Decoration failed:",
                        error
                    );
                }

                return result;
            };
        },

        _decorateProjectFolders(AP) {
            const parentId =
                AP.openFolderId || null;

            const visibleFolders =
                Object.values(AP.folders || {})
                    .filter(
                        folder =>
                            (folder.parentId || null) === parentId
                    )
                    .sort(
                        (a, b) =>
                            a.name.localeCompare(b.name)
                    );

            const gridFolderItems =
                Array.from(
                    AP.dom?.grid?.querySelectorAll?.(
                        ".asset-item.folder-item"
                    ) || []
                );

            gridFolderItems.forEach((item, index) => {
                const folder =
                    visibleFolders[index];

                if (!folder) return;

                item.dataset.folderId =
                    folder.id;

                item.oncontextmenu = event => {
                    event.preventDefault();
                    AP._showFolderContextMenu?.(
                        event,
                        folder.id
                    );
                };

                if (!folder.isGameProject) return;

                item.classList.add(
                    "game-project-folder"
                );

                item.dataset.type =
                    "game-project-folder";

                const thumb =
                    item.querySelector(
                        ".asset-thumbnail"
                    );

                if (thumb) {
                    thumb.innerHTML =
                        root.GameProjectAssetsBridge
                            ._projectFolderIconMarkup();
                }

                const meta =
                    item.querySelector(".asset-meta");

                if (meta) {
                    meta.textContent =
                        "Game Project";
                }
            });

            for (
                const folder of
                Object.values(AP.folders || {})
            ) {
                if (!folder?.isGameProject) continue;

                const safeId =
                    String(folder.id)
                        .replace(/\\/g, "\\\\")
                        .replace(/"/g, '\\"');

                const row =
                    document.querySelector(
                        `[data-folder-id="${safeId}"]`
                    );

                if (!row) continue;

                row.classList.add(
                    "game-project-folder-tree"
                );

                const icon =
                    row.querySelector(
                        ".category-icon"
                    );

                if (icon) {
                    icon.innerHTML =
                        `<i class="fas fa-gamepad"></i>`;
                }

                const name =
                    row.querySelector(
                        ".folder-name, .tree-label"
                    );

                if (name) {
                    name.dataset.gameProject =
                        "true";
                }
            }
        },

        _patchFolderContextMenu(AP) {
            if (AP.__smGameProjectFolderMenuPatchedV2) return;
            AP.__smGameProjectFolderMenuPatchedV2 = true;

            // AssetsPanel v2 already includes Game Project actions inside
            // Game Project >. Do not replace it with the old flat menu.
            if (AP.__nativeAssetsContextMenusV2 || typeof AP._openNativeContextMenu === "function") {
                return;
            }

            const original =
                AP._showFolderContextMenu;

            AP._showFolderContextMenu =
                function (event, folderId) {
                    const folder =
                        this.folders?.[folderId];

                    if (!folder?.isGameProject) {
                        return original?.call(
                            this,
                            event,
                            folderId
                        );
                    }

                    if (!this.dom?.contextMenu) return;

                    this.dom.contextMenu.style.display =
                        "block";
                    this.dom.contextMenu.style.left =
                        `${event.clientX}px`;
                    this.dom.contextMenu.style.top =
                        `${event.clientY}px`;
                    this.dom.contextMenu.innerHTML = "";

                    const create =
                        (label, callback, style = "") => {
                            const item =
                                document.createElement("div");

                            item.className =
                                "context-menu-item";

                            if (style) item.style = style;

                            item.textContent = label;

                            item.onclick = () => {
                                callback();
                                this.dom.contextMenu.style.display =
                                    "none";
                            };

                            this.dom.contextMenu
                                .appendChild(item);
                        };

                    const separator = () => {
                        const element =
                            document.createElement("div");

                        element.className =
                            "context-menu-separator";

                        this.dom.contextMenu
                            .appendChild(element);
                    };

                    create(
                        "Open Game Project",
                        () => this.openFolder(folderId)
                    );

                    create(
                        "Repair / Initialize Structure",
                        () =>
                            this.initializeGameProjectStructure(
                                folderId
                            )
                    );

                    separator();

                    create(
                        "Rename Game Project",
                        () => this.renameFolder(folderId)
                    );

                    separator();

                    create(
                        "Delete Game Project",
                        () => {
                            if (
                                confirm(
                                    `Delete Game Project "${folder.name}" and all its contents?`
                                )
                            ) {
                                this.deleteFolder(
                                    folderId,
                                    { deleteContents: true }
                                );
                            }
                        },
                        "color: var(--danger-color);"
                    );
                };
        },

        _patchAddToScene(AP) {
            if (AP.__smGameProjectAddToScenePatchedV2) return;
            AP.__smGameProjectAddToScenePatchedV2 = true;

            const original =
                AP._addToScene;

            AP._addToScene =
                async function (assetId, ...args) {
                    const asset =
                        this._findById?.(assetId);

                    if (
                        asset?.type === "game-project" ||
                        asset?.isGameProjectManifest
                    ) {
                        const project = Object.values(this.folders || {}).find(
                            folder => folder?.isGameProject && (
                                folder.id === asset.folderId ||
                                folder.projectId === asset.projectId
                            )
                        );

                        if (project && typeof this.loadGameProject === "function") {
                            return this.loadGameProject(project, {
                                openStartup: true,
                                replaceScene: true,
                                requireStartup: true
                            });
                        }

                        console.info(
                            "[GameProjectAssetsBridge] game.smproject is ready, " +
                            "but the runtime bridge has not installed yet.",
                            asset.definition || asset.data
                        );
                        return asset;
                    }

                    return original?.call(
                        this,
                        assetId,
                        ...args
                    );
                };
        }
    };

    root.GameProjectAssetsBridge =
        GameProjectAssetsBridge;

    if (document.readyState === "loading") {
        document.addEventListener(
            "DOMContentLoaded",
            () =>
                GameProjectAssetsBridge.install(),
            { once: true }
        );
    } else {
        GameProjectAssetsBridge.install();
    }
})(window);