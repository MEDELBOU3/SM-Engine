/**
 * engine\logic\Managers\PhysicalGameProjectBridge.js
 * SM Engine - Physical project integration for AssetsPanel.
 *
 * Responsibilities:
 *  - Mirror a real folder under /assets into AssetsPanel without copying binaries.
 *  - Keep files as physical URL references.
 *  - Classify physical projects as native or web-only projects.
 *  - Delegate native Three.js projects to ThreeJSNativeProjectBridge.
 *  - Keep the old iframe behavior ONLY as an explicit Web Preview.
 *
 * Load AFTER AssetsPanel.js.
 * Recommended order:
 *   AssetManager.js
 *   PhysicalGameProjectBridge.js
 *   ThreeJSNativeProjectBridge.js
 *   AssetsPanelContextMenuUnified.js
 */
(function (root) {
    "use strict";

    const DEFAULT_PROJECTS = [
        {
            id: "sunset-forest",
            name: "Sunset Forest",
            rootUrl: "assets/Sunset-Forest-main/",
            manifestUrl: "assets/Sunset-Forest-main/sm-project-files.json",
            thumbnail: "game-project/src/ui/game-view.png"
        }
    ];

    function getAssetsPanel() {
        if (typeof AssetsPanel !== "undefined") return AssetsPanel;
        return root.AssetsPanel || null;
    }

    function normalizePath(value = "") {
        return String(value || "")
            .replace(/\\/g, "/")
            .replace(/^\/+/, "")
            .replace(/\/+/g, "/")
            .trim();
    }

    function ensureTrailingSlash(value = "") {
        const clean = normalizePath(value);
        return clean ? `${clean.replace(/\/+$/, "")}/` : "";
    }

    function slug(value = "") {
        return String(value || "")
            .toLowerCase()
            .replace(/[^a-z0-9_-]+/g, "_")
            .replace(/^_+|_+$/g, "") || "item";
    }

    function stableId(prefix, projectId, path = "") {
        const input = `${projectId}:${normalizePath(path)}`;
        let hash = 2166136261;

        for (let i = 0; i < input.length; i++) {
            hash ^= input.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }

        return `${prefix}_${slug(projectId)}_${(hash >>> 0).toString(36)}`;
    }

    function joinURL(rootURL, relativePath = "") {
        return ensureTrailingSlash(rootURL) + normalizePath(relativePath);
    }

    function getExtension(path = "") {
        const name = String(path || "").split("/").pop() || "";
        const index = name.lastIndexOf(".");
        return index >= 0 ? name.slice(index + 1).toLowerCase() : "";
    }

    function classifyAsset(path = "") {
        const ext = getExtension(path);

        if (["glb", "gltf", "fbx", "obj"].includes(ext)) return "model";
        if (["png", "jpg", "jpeg", "webp", "gif", "bmp", "svg", "avif", "tif", "tiff"].includes(ext)) return "texture";
        if (["mp3", "wav", "ogg", "m4a", "aac", "flac"].includes(ext)) return "audio";
        if (["hdr", "exr"].includes(ext)) return "hdri";
        if (["js", "cjs", "mjs", "html", "css", "json"].includes(ext)) return "code";
        if (["md", "txt", "license"].includes(ext)) return "document";
        return "file";
    }

    function fileName(path = "") {
        return normalizePath(path).split("/").pop() || "";
    }

    function parentPath(path = "") {
        const parts = normalizePath(path).split("/").filter(Boolean);
        parts.pop();
        return parts.join("/");
    }

    function isNativeProjectType(value = "") {
        const type = String(value || "").toLowerCase();
        return type === "threejs-native" || type === "sm-native" || type === "native";
    }

    const PhysicalGameProjectBridge = {
        installed: false,
        projects: new Map(),

        webPreview: {
            host: null,
            frame: null,
            projectId: null,
            previousHostPosition: null
        },

        async install() {
            if (this.installed) return true;

            const AP = getAssetsPanel();
            if (!AP) {
                setTimeout(() => this.install(), 120);
                return false;
            }

            // IMPORTANT:
            // AssetManager hydrates its persistent IndexedDB library asynchronously.
            // During hydration it can replace AP.assets with stored assets.
            // If physical projects are mirrored before hydration finishes, all mirrored
            // FILE assets are wiped while the folder objects survive because folders
            // are merged. Wait for hydration before registering physical projects.
            await this._waitForAssetsPanelHydration(AP);

            this.installed = true;
            this._patchFolderContextMenu(AP);
            this._patchAddToScene(AP);

            const configured =
                Array.isArray(root.SM_PHYSICAL_GAME_PROJECTS) && root.SM_PHYSICAL_GAME_PROJECTS.length
                    ? root.SM_PHYSICAL_GAME_PROJECTS
                    : DEFAULT_PROJECTS;

            for (const config of configured) {
                try {
                    await this.registerProject(config);
                } catch (error) {
                    console.error(
                        `[PhysicalGameProjectBridge] Failed to register ${config?.name || config?.id || "project"}.`,
                        error
                    );
                }
            }

            console.log(
                `[PhysicalGameProjectBridge] Installed (${this.projects.size} project(s)).`
            );

            return true;
        },

        async _waitForAssetsPanelHydration(AP) {
            if (!AP) return false;

            try {
                // This is the canonical AssetManager API. It initializes IndexedDB
                // if needed and resolves only after loadLibrary()/migration finished.
                if (typeof AP._getPersistentAssetStorage === "function") {
                    await AP._getPersistentAssetStorage();
                    return true;
                }

                // Fallback for builds exposing only the initialization method.
                if (typeof AP._initializePersistentAssetStorage === "function") {
                    const pending = AP._initializePersistentAssetStorage();
                    if (pending && typeof pending.then === "function") {
                        await pending;
                    }
                    return true;
                }

                // Older builds without persistent storage are already synchronous.
                return true;
            } catch (error) {
                console.warn(
                    "[PhysicalGameProjectBridge] AssetsPanel hydration wait failed; continuing with in-memory registration.",
                    error
                );
                return false;
            }
        },

        _normalizeConfig(config = {}) {
            const id = slug(config.id || config.name || "game-project");
            const rootUrl = ensureTrailingSlash(config.rootUrl || "");
            const manifestUrl = config.manifestUrl || joinURL(rootUrl, "sm-project-files.json");

            return {
                ...config,
                id,
                name: config.name || id,
                rootUrl,
                manifestUrl,
                projectType: String(config.projectType || "").toLowerCase(),
                nativeEntryPoint: normalizePath(config.nativeEntryPoint || ""),
                webPreviewEntryPoint: normalizePath(
                    config.webPreviewEntryPoint || config.entryPoint || ""
                ),
                thumbnail: normalizePath(config.thumbnail || "")
            };
        },

        async _fetchManifest(config) {
            const response = await fetch(config.manifestUrl, { cache: "no-store" });

            if (!response.ok) {
                throw new Error(
                    `Manifest request failed: ${response.status} ${response.statusText}`
                );
            }

            const manifest = await response.json();

            if (!manifest || !Array.isArray(manifest.directories) || !Array.isArray(manifest.files)) {
                throw new Error("Invalid physical game project manifest.");
            }

            return manifest;
        },

        async registerProject(config = {}) {
            const AP = getAssetsPanel();
            if (!AP) throw new Error("AssetsPanel is not ready.");

            // registerProject() can also be called manually by Refresh Project Files.
            // Always wait here too so a late hydration can never erase the mirror.
            await this._waitForAssetsPanelHydration(AP);

            const normalized = this._normalizeConfig(config);
            const manifest = await this._fetchManifest(normalized);

            normalized.name = manifest.name || normalized.name;
            normalized.projectType = String(
                manifest.projectType || normalized.projectType || (manifest.nativeRuntime ? "threejs-native" : "web")
            ).toLowerCase();
            normalized.nativeRuntime = manifest.nativeRuntime || normalized.nativeRuntime || null;
            normalized.sourceRoot = normalizePath(manifest.sourceRoot || normalized.sourceRoot || "");
            normalized.assetRoots = Array.isArray(manifest.assetRoots)
                ? manifest.assetRoots.map(normalizePath).filter(Boolean)
                : [];

            normalized.nativeEntryPoint = normalizePath(
                manifest.nativeRuntime?.main || normalized.nativeEntryPoint || ""
            );

            normalized.webPreview = {
                ...(normalized.webPreview || {}),
                ...(manifest.webPreview || {})
            };

            normalized.webPreviewEntryPoint = normalizePath(
                manifest.webPreview?.entryPoint ||
                normalized.webPreviewEntryPoint ||
                // Legacy v1 compatibility only. It is treated as WEB PREVIEW,
                // never as the native runtime entry point.
                manifest.entryPoint ||
                ""
            );

            normalized.thumbnail = normalizePath(
                manifest.thumbnail || normalized.thumbnail
            );

            this.projects.set(normalized.id, { config: normalized, manifest });

            const result = this._syncIntoAssetsPanel(AP, normalized, manifest);

            const mirroredAssetCount = (AP.assets || []).filter(
                asset => asset?.physicalGameProjectId === normalized.id
            ).length;

            if (mirroredAssetCount === 0 && (manifest.files || []).length > 0) {
                console.error(
                    `[PhysicalGameProjectBridge] ${normalized.name}: manifest contains ${(manifest.files || []).length} files but 0 physical assets exist after sync.`
                );
            }

            AP.render?.();
            AP._buildTagCloud?.();
            AP._syncRuntimeAssetRegistry?.();

            try {
                root.dispatchEvent(
                    new CustomEvent("sm-physical-game-project-registered", {
                        detail: { project: result.rootFolder, manifest, config: normalized }
                    })
                );
            } catch {}

            return result;
        },

        _removePreviousMirror(AP, projectId) {
            AP.assets = (AP.assets || []).filter(
                asset => !(asset?.sourceType === "physical-game-project" && asset?.physicalGameProjectId === projectId)
            );

            for (const [id, folder] of Object.entries(AP.folders || {})) {
                if (
                    folder?.sourceType === "physical-game-project" &&
                    folder?.physicalGameProjectId === projectId
                ) {
                    delete AP.folders[id];
                }
            }

            for (const folder of Object.values(AP.folders || {})) {
                if (!Array.isArray(folder.children)) folder.children = [];
                folder.children = folder.children.filter(childId => !!AP.folders[childId]);
            }
        },

        _syncIntoAssetsPanel(AP, config, manifest) {
            this._removePreviousMirror(AP, config.id);

            const rootFolderId = `physical_game_${slug(config.id)}`;
            const native = isNativeProjectType(config.projectType) && !!config.nativeEntryPoint;
            const webOnly = !native && !!config.webPreviewEntryPoint;

            const rootFolder = {
                id: rootFolderId,
                name: config.name,
                parentId: null,
                children: [],
                isBuiltIn: false,
                isProjectAssetFolder: true,

                isPlayableGameProject: true,
                isPhysicalGameProject: true,
                isNativePhysicalGameProject: native,
                isThreeJSGameProject: config.projectType === "threejs-native",
                isExternalWebGameProject: webOnly,

                projectId: config.id,
                physicalGameProjectId: config.id,
                projectType: config.projectType,
                sourceType: "physical-game-project",
                physicalRoot: config.rootUrl,
                sourceRoot: config.sourceRoot,
                assetRoots: config.assetRoots,
                nativeEntryPoint: config.nativeEntryPoint,
                webPreviewEntryPoint: config.webPreviewEntryPoint,
                // Kept only for compatibility with older UI code. This is WEB preview.
                entryPoint: config.webPreviewEntryPoint,
                thumbnail: config.thumbnail ? joinURL(config.rootUrl, config.thumbnail) : null
            };

            AP.folders[rootFolderId] = rootFolder;

            const folderByPath = new Map();
            folderByPath.set("", rootFolderId);

            const directories = [...new Set(
                (manifest.directories || []).map(normalizePath).filter(Boolean)
            )].sort((a, b) => {
                const depth = a.split("/").length - b.split("/").length;
                return depth || a.localeCompare(b);
            });

            for (const path of directories) {
                const parent = parentPath(path);
                const parentId = folderByPath.get(parent) || rootFolderId;
                const id = stableId("physical_folder", config.id, path);

                AP.folders[id] = {
                    id,
                    name: fileName(path),
                    parentId,
                    children: [],
                    isBuiltIn: false,
                    isProjectAssetFolder: true,
                    isPhysicalGameContentFolder: true,
                    physicalGameProjectId: config.id,
                    sourceType: "physical-game-project",
                    sourcePath: path,
                    sourceURL: joinURL(config.rootUrl, path)
                };

                folderByPath.set(path, id);

                const parentFolder = AP.folders[parentId];
                if (parentFolder && !parentFolder.children.includes(id)) {
                    parentFolder.children.push(id);
                }
            }

            const filePaths = [...new Set(
                (manifest.files || []).map(normalizePath).filter(Boolean)
            )];

            for (const path of filePaths) {
                const parent = parentPath(path);
                const folderId = folderByPath.get(parent) || rootFolderId;
                const type = classifyAsset(path);
                const url = joinURL(config.rootUrl, path);
                const nativeEntry = !!config.nativeEntryPoint && path === config.nativeEntryPoint;
                const webEntry = !!config.webPreviewEntryPoint && path === config.webPreviewEntryPoint;

                const asset = {
                    id: stableId("physical_asset", config.id, path),
                    name: fileName(path),
                    type,
                    folderId,

                    data: url,
                    sourceURL: url,
                    sourcePath: path,
                    sourceType: "physical-game-project",
                    physicalGameProjectId: config.id,
                    storageKind: "source",
                    remote: false,

                    isBuiltIn: false,
                    isFavorite: false,
                    tags: ["game-project", "physical", type],
                    history: [],
                    references: [],

                    isNativeGameEntryPoint: nativeEntry,
                    isWebPreviewEntryPoint: webEntry,
                    // Backwards compatibility only. Existing old code historically
                    // interpreted this flag as "play web entry".
                    isGameEntryPoint: webEntry
                };

                if (type === "texture") asset.thumbnail = url;

                if (nativeEntry) {
                    asset.tags.push("native-entry-point", "native-project");
                }

                if (webEntry) {
                    asset.tags.push("web-preview-entry-point", "web-preview");
                }

                AP.assets.push(asset);
            }

            const descriptor = {
                format: "SM_PHYSICAL_GAME_PROJECT",
                version: Number(manifest.version || 2),
                id: config.id,
                name: config.name,
                projectType: config.projectType,
                physicalRoot: config.rootUrl,
                sourceRoot: config.sourceRoot,
                nativeEntryPoint: config.nativeEntryPoint,
                webPreviewEntryPoint: config.webPreviewEntryPoint,
                fileCount: filePaths.length,
                folderCount: directories.length
            };

            AP.assets.push({
                id: stableId("physical_manifest", config.id, "smgame.project"),
                name: "smgame.project",
                type: "game-project",
                folderId: rootFolderId,
                data: JSON.stringify(descriptor, null, 2),
                definition: descriptor,
                isBuiltIn: false,
                isFavorite: false,
                tags: ["game-project", "physical", native ? "native" : "web"],
                history: [],
                references: [],
                sourceType: "physical-game-project",
                physicalGameProjectId: config.id,
                isPhysicalGameProjectManifest: true,
                isNativeGameProjectManifest: native
            });

            AP.expandedFolders?.add?.(rootFolderId);
            AP._saveToStorage?.();

            console.log(
                `[PhysicalGameProjectBridge] ${config.name}: ${directories.length} folders, ${filePaths.length} files mirrored (${config.projectType}).`
            );

            return {
                rootFolder,
                folderCount: directories.length,
                fileCount: filePaths.length
            };
        },

        _resolveProject(reference = null) {
            const AP = getAssetsPanel();
            if (!AP) return null;

            if (reference && typeof reference === "object" && reference.isPhysicalGameProject) {
                return reference;
            }

            if (reference) {
                const value = String(reference).trim().toLowerCase();
                return (
                    Object.values(AP.folders || {}).find(folder =>
                        folder?.isPhysicalGameProject && (
                            String(folder.id || "").toLowerCase() === value ||
                            String(folder.projectId || "").toLowerCase() === value ||
                            String(folder.physicalGameProjectId || "").toLowerCase() === value ||
                            String(folder.name || "").toLowerCase() === value
                        )
                    ) || null
                );
            }

            const projects = Object.values(AP.folders || {}).filter(
                folder => folder?.isPhysicalGameProject
            );

            return projects.length === 1 ? projects[0] : null;
        },

        getProjectRecord(reference = null) {
            const project = this._resolveProject(reference);
            if (!project) return null;
            return this.projects.get(project.projectId || project.physicalGameProjectId) || null;
        },

        resolveProjectAsset(reference, relativePath) {
            const AP = getAssetsPanel();
            const project = this._resolveProject(reference);
            if (!AP || !project) return null;

            const path = normalizePath(relativePath);
            return (
                (AP.assets || []).find(asset =>
                    asset?.physicalGameProjectId === project.projectId &&
                    normalizePath(asset.sourcePath) === path
                ) || null
            );
        },

        resolveProjectURL(reference, relativePath) {
            const project = this._resolveProject(reference);
            if (!project) return "";
            return joinURL(project.physicalRoot, relativePath);
        },

        async refreshProject(reference = null) {
            const project = this._resolveProject(reference);
            if (!project) return false;

            const record = this.projects.get(project.projectId);
            if (!record) return false;

            return await this.registerProject(record.config);
        },

        async loadNativeProject(reference = null, options = {}) {
            const project = this._resolveProject(reference);
            if (!project) {
                console.warn("[PhysicalGameProjectBridge] Load Native: project not found.");
                return false;
            }

            if (!project.isNativePhysicalGameProject) {
                console.warn(
                    `[PhysicalGameProjectBridge] '${project.name}' is not classified as a native physical project.`
                );
                return false;
            }

            const nativeBridge = root.ThreeJSNativeProjectBridge;
            if (!nativeBridge?.loadProject) {
                console.error(
                    "[PhysicalGameProjectBridge] ThreeJSNativeProjectBridge is not loaded. " +
                    "Load ThreeJSNativeProjectBridge.js after this file and before the context-menu layer."
                );
                return false;
            }

            const result = await nativeBridge.loadProject(project, options);

            try {
                root.dispatchEvent(
                    new CustomEvent("sm-physical-game-native-load", {
                        detail: { project, result }
                    })
                );
            } catch {}

            return result;
        },

        async playNativeProject(reference = null, options = {}) {
            const project = this._resolveProject(reference);
            if (!project) return false;

            const nativeBridge = root.ThreeJSNativeProjectBridge;
            if (!nativeBridge?.playProject) {
                console.error("[PhysicalGameProjectBridge] Native project bridge is unavailable.");
                return false;
            }

            if (!nativeBridge.isLoaded?.(project.projectId)) {
                const loaded = await this.loadNativeProject(project, options);
                if (!loaded) return false;
            }

            return await nativeBridge.playProject(project, options);
        },

        /**
         * Compatibility alias. Native projects now play natively by default.
         * Web-only physical projects still open their web preview.
         */
        async playProject(reference = null, options = {}) {
            const project = this._resolveProject(reference);
            if (!project) return false;

            if (project.isNativePhysicalGameProject) {
                return await this.playNativeProject(project, options);
            }

            return this.openWebPreview(project);
        },

        _getViewportHost() {
            return (
                document.getElementById("editor-scene") ||
                document.querySelector(".editor-scene") ||
                document.body
            );
        },

        _ensureWebPreviewStyle() {
            if (document.getElementById("sm-physical-game-web-preview-style")) return;

            const style = document.createElement("style");
            style.id = "sm-physical-game-web-preview-style";
            style.textContent = `
                #sm-physical-game-web-preview{
                    position:absolute;
                    inset:0;
                    z-index:950;
                    display:flex;
                    flex-direction:column;
                    min-width:0;
                    min-height:0;
                    background:#111;
                    color:#ddd;
                    font:12px Inter,"Segoe UI",Arial,sans-serif;
                }
                #sm-physical-game-web-preview .sm-pgr-header{
                    height:34px;
                    min-height:34px;
                    display:flex;
                    align-items:center;
                    gap:8px;
                    padding:0 8px 0 12px;
                    background:#333;
                    border-bottom:1px solid rgba(255,255,255,.08);
                    user-select:none;
                }
                #sm-physical-game-web-preview .sm-pgr-title{
                    min-width:0;
                    overflow:hidden;
                    text-overflow:ellipsis;
                    white-space:nowrap;
                    font-weight:600;
                    color:#eee;
                }
                #sm-physical-game-web-preview .sm-pgr-spacer{ flex:1; }
                #sm-physical-game-web-preview button{
                    height:24px;
                    padding:0 9px;
                    border:0;
                    background:#444;
                    color:#ddd;
                    cursor:pointer;
                    font:inherit;
                }
                #sm-physical-game-web-preview button:hover{
                    background:#505050;
                    color:#fff;
                }
                #sm-physical-game-web-preview iframe{
                    flex:1 1 auto;
                    min-width:0;
                    min-height:0;
                    width:100%;
                    height:100%;
                    border:0;
                    background:#000;
                }
            `;
            document.head.appendChild(style);
        },

        openWebPreview(reference = null) {
            const project = this._resolveProject(reference);
            if (!project) {
                console.warn("[PhysicalGameProjectBridge] Web Preview: project not found.");
                return false;
            }

            const record = this.projects.get(project.projectId);
            const config = record?.config || {
                id: project.projectId,
                name: project.name,
                rootUrl: project.physicalRoot,
                webPreviewEntryPoint: project.webPreviewEntryPoint || project.entryPoint
            };

            const entryPoint = normalizePath(
                config.webPreviewEntryPoint || project.webPreviewEntryPoint || project.entryPoint || ""
            );

            if (!entryPoint) {
                console.warn(`[PhysicalGameProjectBridge] '${project.name}' has no Web Preview entry point.`);
                return false;
            }

            this.stopWebPreview();

            const entryURL = joinURL(config.rootUrl, entryPoint);
            const host = this._getViewportHost();
            if (!host) return false;

            this._ensureWebPreviewStyle();

            const computed = getComputedStyle(host);
            this.webPreview.previousHostPosition = host.style.position || "";
            if (computed.position === "static") host.style.position = "relative";

            const runtime = document.createElement("div");
            runtime.id = "sm-physical-game-web-preview";
            runtime.innerHTML = `
                <div class="sm-pgr-header">
                    <div class="sm-pgr-title"></div>
                    <div class="sm-pgr-spacer"></div>
                    <button type="button" data-pgr-reload title="Reload web preview">Reload</button>
                    <button type="button" data-pgr-fullscreen title="Fullscreen web preview">Fullscreen</button>
                    <button type="button" data-pgr-stop title="Close web preview">Close</button>
                </div>
            `;

            const title = runtime.querySelector(".sm-pgr-title");
            if (title) title.textContent = `${project.name} — Web Preview`;

            const frame = document.createElement("iframe");
            frame.src = entryURL;
            frame.title = `${project.name} web preview`;
            frame.allow = "autoplay; fullscreen; gamepad; pointer-lock";
            frame.setAttribute("allowfullscreen", "");

            runtime.appendChild(frame);
            host.appendChild(runtime);

            runtime.querySelector("[data-pgr-stop]")?.addEventListener("click", () => this.stopWebPreview());
            runtime.querySelector("[data-pgr-reload]")?.addEventListener("click", () => {
                frame.src = entryURL + (entryURL.includes("?") ? "&" : "?") + `smReload=${Date.now()}`;
            });
            runtime.querySelector("[data-pgr-fullscreen]")?.addEventListener("click", () => {
                const promise = frame.requestFullscreen?.() || runtime.requestFullscreen?.();
                promise?.catch?.(() => {});
            });

            frame.addEventListener("load", () => {
                try { frame.contentWindow?.focus?.(); } catch {}
            });

            this.webPreview.host = runtime;
            this.webPreview.frame = frame;
            this.webPreview.projectId = project.projectId;

            try {
                root.dispatchEvent(
                    new CustomEvent("sm-physical-game-web-preview", {
                        detail: { project, entryURL, frame }
                    })
                );
            } catch {}

            console.log(
                `[PhysicalGameProjectBridge] Web Preview ${project.name}: ${entryURL}`
            );

            return true;
        },

        stopWebPreview() {
            const runtime = this.webPreview.host;
            if (!runtime) return false;

            const parent = runtime.parentElement;
            try { this.webPreview.frame?.contentWindow?.stop?.(); } catch {}
            runtime.remove();

            if (parent && this.webPreview.previousHostPosition !== null) {
                parent.style.position = this.webPreview.previousHostPosition;
            }

            const projectId = this.webPreview.projectId;
            this.webPreview.host = null;
            this.webPreview.frame = null;
            this.webPreview.projectId = null;
            this.webPreview.previousHostPosition = null;

            try {
                root.dispatchEvent(
                    new CustomEvent("sm-physical-game-web-preview-stop", {
                        detail: { projectId }
                    })
                );
            } catch {}

            return true;
        },

        async stopProject(reference = null) {
            let stopped = this.stopWebPreview();
            const nativeBridge = root.ThreeJSNativeProjectBridge;
            if (nativeBridge?.stopProject) {
                try {
                    const result = await nativeBridge.stopProject(reference);
                    stopped = !!result || stopped;
                } catch (error) {
                    console.warn("[PhysicalGameProjectBridge] Native stop failed.", error);
                }
            }
            return stopped;
        },

        _findOwningProject(AP, folderId) {
            let cursor = folderId || null;

            while (cursor) {
                const folder = AP.folders?.[cursor];
                if (!folder) break;
                if (folder.isPhysicalGameProject) return folder;
                cursor = folder.parentId || null;
            }

            return null;
        },

        _patchFolderContextMenu(AP) {
            if (AP.__smPhysicalGameFolderMenuPatched) return;
            AP.__smPhysicalGameFolderMenuPatched = true;

            // AssetsPanelContextMenuUnified is the preferred final menu layer.
            // Do not add duplicate entries when a native menu manager already exists.
            if (AP.__nativeAssetsContextMenusV2 || typeof AP._openNativeContextMenu === "function") {
                return;
            }

            const original = AP._showFolderContextMenu;

            AP._showFolderContextMenu = function (event, folderId) {
                const result = original?.call(this, event, folderId);
                const bridge = root.PhysicalGameProjectBridge;
                const project = bridge?._findOwningProject(this, folderId);

                if (!project || !this.dom?.contextMenu) return result;

                const menu = this.dom.contextMenu;
                const actions = [];

                if (project.isNativePhysicalGameProject) {
                    actions.push({
                        label: "Load Native Project",
                        click: () => bridge.loadNativeProject(project)
                    });
                    actions.push({
                        label: "Play Native Project",
                        click: () => bridge.playNativeProject(project)
                    });
                }

                if (project.webPreviewEntryPoint || project.entryPoint) {
                    actions.push({
                        label: "Open Web Preview",
                        click: () => bridge.openWebPreview(project)
                    });
                }

                actions.push({
                    label: "Refresh Project Files",
                    click: () => bridge.refreshProject(project)
                });

                const separator = document.createElement("div");
                separator.className = "context-menu-separator";
                menu.prepend(separator);

                for (const action of actions.reverse()) {
                    const item = document.createElement("div");
                    item.className = "context-menu-item sm-physical-game-item";
                    item.innerHTML = `<span>${action.label}</span>`;
                    item.onclick = async () => {
                        await action.click();
                        menu.style.display = "none";
                    };
                    menu.prepend(item);
                }

                return result;
            };
        },

        _patchAddToScene(AP) {
            if (AP.__smPhysicalGameAddToScenePatched) return;
            AP.__smPhysicalGameAddToScenePatched = true;

            const original = AP._addToScene;

            AP._addToScene = async function (assetId, ...args) {
                const asset = this._findById?.(assetId);
                const bridge = root.PhysicalGameProjectBridge;

                if (asset?.isWebPreviewEntryPoint && asset?.physicalGameProjectId) {
                    return bridge?.openWebPreview(asset.physicalGameProjectId);
                }

                if (
                    (asset?.isNativeGameEntryPoint || asset?.isNativeGameProjectManifest) &&
                    asset?.physicalGameProjectId
                ) {
                    return await bridge?.loadNativeProject(asset.physicalGameProjectId);
                }

                return await original?.call(this, assetId, ...args);
            };
        },

        debug(reference = null) {
            const AP = getAssetsPanel();
            const project = this._resolveProject(reference);
            if (!project || !AP) return null;

            const record = this.projects.get(project.projectId);
            const assets = (AP.assets || []).filter(
                asset => asset?.physicalGameProjectId === project.projectId
            );
            const nativeDebug = root.ThreeJSNativeProjectBridge?.debug?.(project.projectId) || null;

            const info = {
                projectId: project.projectId,
                name: project.name,
                projectType: project.projectType,
                physicalRoot: project.physicalRoot,
                nativeEntryPoint: project.nativeEntryPoint,
                webPreviewEntryPoint: project.webPreviewEntryPoint || project.entryPoint,
                native: !!project.isNativePhysicalGameProject,
                mirroredAssets: assets.length,
                webPreviewOpen: this.webPreview.projectId === project.projectId,
                iframeUsed: this.webPreview.projectId === project.projectId,
                manifestVersion: Number(record?.manifest?.version || 1),
                nativeRuntime: nativeDebug
            };

            console.log("[PhysicalGameProjectBridge.debug]", info);
            return info;
        }
    };

    root.PhysicalGameProjectBridge = PhysicalGameProjectBridge;

    root.addEventListener("sm-assets-panel-ready", () => {
        PhysicalGameProjectBridge.install();
    });

    if (document.readyState === "loading") {
        document.addEventListener(
            "DOMContentLoaded",
            () => PhysicalGameProjectBridge.install(),
            { once: true }
        );
    } else {
        setTimeout(() => PhysicalGameProjectBridge.install(), 0);
    }
})(window);
