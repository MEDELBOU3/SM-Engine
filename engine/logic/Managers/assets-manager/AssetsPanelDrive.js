// AssetsPanelDrive.js
// Google Drive / multi-source asset library
// Extracted from AssetsPanel_FULL_9483_PBR_FIXED without rewriting method bodies.
(function(global){
"use strict";
const AssetsPanel=global.AssetsPanel;
if(!AssetsPanel){
throw new Error("[SMAssetsPanelDriveMixin] AssetsPanelCore must load first.");
}
class SMAssetsPanelDriveMixin {
    static _getGoogleDriveAPIKey(options = {}) {
        const key =
            options.apiKey ||
            window.SM_GOOGLE_DRIVE_API_KEY ||
            this.GOOGLE_DRIVE_API_KEY ||
            "";

        return String(key).trim();
    }

    static _sanitizeGoogleDriveSourceId(value = "") {
        const normalized = String(value || "")
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9_-]+/g, "_")
            .replace(/^_+|_+$/g, "");

        return normalized || this.GOOGLE_DRIVE_DEFAULT_SOURCE_ID;
    }

    static _extractGoogleDriveFolderId(value = "") {
        const raw = String(value || "").trim();
        if (!raw) return "";

        // A plain Drive folder id is also accepted.
        if (/^[a-zA-Z0-9_-]{10,}$/.test(raw) && !raw.includes("/") && !raw.includes(":")) {
            return raw;
        }

        const folderMatch = raw.match(
            /drive\.google\.com\/drive\/(?:u\/\d+\/)?folders\/([a-zA-Z0-9_-]+)/i,
        );
        if (folderMatch?.[1]) return folderMatch[1];

        const alternateMatch = raw.match(
            /drive\.google\.com\/drive\/folders\/([a-zA-Z0-9_-]+)/i,
        );
        if (alternateMatch?.[1]) return alternateMatch[1];

        try {
            const parsed = new URL(raw, window.location.href);
            const id = parsed.searchParams.get("id");
            if (id && /^[a-zA-Z0-9_-]{10,}$/.test(id)) return id;
        } catch (_) { }

        return "";
    }

    static _normalizeGoogleDriveSource(source, index = 0) {
        const input = typeof source === "string"
            ? { url: source }
            : { ...(source || {}) };

        const rawLocation =
            input.folderId ||
            input.url ||
            input.driveUrl ||
            input.driveURL ||
            "";

        const folderId = this._extractGoogleDriveFolderId(rawLocation);
        if (!folderId) return null;

        const isLegacyFolder = folderId === String(this.GOOGLE_DRIVE_FOLDER_ID || "").trim();
        const automaticId = isLegacyFolder
            ? this.GOOGLE_DRIVE_DEFAULT_SOURCE_ID
            : `drive_${folderId.slice(0, 12)}`;

        const id = this._sanitizeGoogleDriveSourceId(
            input.id || input.key || input.sourceId || automaticId || `drive_${index + 1}`,
        );

        return {
            id,
            folderId,
            url: input.url || `https://drive.google.com/drive/folders/${folderId}`,
            name: String(input.name || input.label || "").trim(),
            enabled: input.enabled !== false,
            removeMissing: input.removeMissing !== false,
            reveal: input.reveal === true,
            tags: Array.isArray(input.tags)
                ? input.tags.map((tag) => String(tag).trim()).filter(Boolean)
                : [],
            apiKey: typeof input.apiKey === "string" ? input.apiKey.trim() : "",
            metadata: input.metadata && typeof input.metadata === "object"
                ? { ...input.metadata }
                : {},
        };
    }

    static getGoogleDriveSources(options = {}) {
        // Explicit one-off source wins over the global registry.
        if (options.source) {
            const source = this._normalizeGoogleDriveSource(options.source, 0);
            return source && source.enabled ? [source] : [];
        }

        if (options.url || options.folderId || options.driveUrl || options.driveURL) {
            const source = this._normalizeGoogleDriveSource({
                id: options.sourceId || options.id || options.key,
                name: options.rootName || options.name,
                url: options.url || options.driveUrl || options.driveURL,
                folderId: options.folderId,
                enabled: options.enabled,
                removeMissing: options.removeMissing,
                reveal: options.reveal,
                tags: options.tags,
                apiKey: options.apiKey,
            }, 0);

            return source && source.enabled ? [source] : [];
        }

        const configured = window?.[this.GOOGLE_DRIVE_SOURCES_GLOBAL];
        const sourceList = Array.isArray(configured)
            ? configured
            : (configured ? [configured] : []);

        const normalized = sourceList
            .map((source, index) => this._normalizeGoogleDriveSource(source, index))
            .filter((source) => !!source && source.enabled);

        if (normalized.length) {
            // Keep IDs unique. The first declaration wins so a typo cannot make
            // two remote libraries write into the same AssetsPanel subtree.
            const seen = new Set();
            return normalized.filter((source) => {
                if (seen.has(source.id)) {
                    console.warn(
                        `[AssetsPanel] Duplicate Google Drive source id '${source.id}' ignored.`,
                    );
                    return false;
                }
                seen.add(source.id);
                return true;
            });
        }

        // Backward compatibility: if AssetDriveSources.js is not loaded, keep
        // the original single-folder behavior from v6.5.
        const legacy = this._normalizeGoogleDriveSource({
            id: this.GOOGLE_DRIVE_DEFAULT_SOURCE_ID,
            folderId: this.GOOGLE_DRIVE_FOLDER_ID,
            enabled: true,
            removeMissing: true,
            reveal: true,
        });

        return legacy ? [legacy] : [];
    }

    static _getGoogleDriveFolderId(options = {}) {
        const explicit =
            options.folderId ||
            options.url ||
            options.driveUrl ||
            options.driveURL ||
            this.GOOGLE_DRIVE_FOLDER_ID ||
            "";

        return this._extractGoogleDriveFolderId(explicit);
    }

    static _googleDriveRootFolderId(sourceId = this.GOOGLE_DRIVE_DEFAULT_SOURCE_ID) {
        const safeSourceId = this._sanitizeGoogleDriveSourceId(sourceId);

        // Preserve the old v6.5 root id for the original source so users do not
        // get a duplicate Google Drive folder after upgrading.
        if (safeSourceId === this.GOOGLE_DRIVE_DEFAULT_SOURCE_ID) {
            return this.GOOGLE_DRIVE_ROOT_FOLDER_ID;
        }

        return `${this.GOOGLE_DRIVE_ROOT_FOLDER_ID}_${safeSourceId}`;
    }

    static _googleDriveBrowserFolderId(
        driveFolderId,
        sourceId = this.GOOGLE_DRIVE_DEFAULT_SOURCE_ID,
    ) {
        const safeFolder = String(driveFolderId).replace(/[^a-zA-Z0-9_-]/g, "_");
        const safeSourceId = this._sanitizeGoogleDriveSourceId(sourceId);

        if (safeSourceId === this.GOOGLE_DRIVE_DEFAULT_SOURCE_ID) {
            return `gdrive_folder_${safeFolder}`;
        }

        return `gdrive_folder_${safeSourceId}_${safeFolder}`;
    }

    static _googleDriveAssetId(
        fileId,
        sourceId = this.GOOGLE_DRIVE_DEFAULT_SOURCE_ID,
    ) {
        const safeFile = String(fileId).replace(/[^a-zA-Z0-9_-]/g, "_");
        const safeSourceId = this._sanitizeGoogleDriveSourceId(sourceId);

        if (safeSourceId === this.GOOGLE_DRIVE_DEFAULT_SOURCE_ID) {
            return `gdrive_asset_${safeFile}`;
        }

        return `gdrive_asset_${safeSourceId}_${safeFile}`;
    }

    static _belongsToGoogleDriveSource(entry, sourceId) {
        if (entry?.sourceType !== "google-drive") return false;

        const safeSourceId = this._sanitizeGoogleDriveSourceId(sourceId);
        const entrySource = entry?.driveSourceId
            ? this._sanitizeGoogleDriveSourceId(entry.driveSourceId)
            : this.GOOGLE_DRIVE_DEFAULT_SOURCE_ID;

        return entrySource === safeSourceId;
    }

    static async syncGoogleDrive(options = {}) {
        if (this.googleDriveSyncBusy) {
            console.warn("AssetsPanel: Google Drive sync is already running.");
            return false;
        }

        const sources = this.getGoogleDriveSources(options);
        if (!sources.length) {
            console.error(
                "AssetsPanel: No enabled Google Drive sources found. " +
                "Add URLs to window.SM_ASSET_DRIVE_SOURCES in AssetDriveSources.js.",
            );
            return false;
        }

        const button = document.getElementById("cbGoogleDriveBtn");
        const oldButtonHTML = button?.innerHTML || "";

        this.googleDriveSyncBusy = true;
        this.googleDriveLastSyncResults = [];

        if (button) {
            button.disabled = true;
            button.innerHTML =
                '<i class="fas fa-spinner fa-spin"></i><span>Syncing...</span>';
        }

        let successCount = 0;

        try {
            for (let index = 0; index < sources.length; index++) {
                const source = sources[index];

                if (button && sources.length > 1) {
                    button.innerHTML =
                        `<i class="fas fa-spinner fa-spin"></i>` +
                        `<span>Drive ${index + 1}/${sources.length}</span>`;
                }

                const apiKey = this._getGoogleDriveAPIKey({
                    ...options,
                    apiKey: source.apiKey || options.apiKey,
                });

                if (!apiKey) {
                    const error = new Error(
                        `Google Drive API key is missing for source '${source.id}'.`,
                    );
                    console.error(`[AssetsPanel] ${error.message}`);
                    this.googleDriveLastSyncResults.push({
                        sourceId: source.id,
                        ok: false,
                        error: error.message,
                    });
                    continue;
                }

                try {
                    const result = await this._syncGoogleDriveSource(source, {
                        ...options,
                        apiKey,
                    });

                    this.googleDriveLastSyncResults.push({
                        sourceId: source.id,
                        ok: true,
                        ...result,
                    });
                    successCount++;
                } catch (error) {
                    console.error(
                        `[AssetsPanel] Google Drive source '${source.id}' failed:`,
                        error,
                    );

                    this.googleDriveLastSyncResults.push({
                        sourceId: source.id,
                        ok: false,
                        error: error?.message || String(error),
                    });
                }
            }

            this.googleDriveLastSync = Date.now();

            // Run these once after all sources so the UI does not rebuild for
            // every remote folder while a multi-source sync is in progress.
            this._repairGameplayFolderTree();
            this._ensureProjectManifestAssets();
            this._syncRuntimeAssetRegistry();
            this.currentCategory = "project";
            this._saveToStorage();
            this.render();
            this._buildTagCloud();
            this._ensureGoogleDriveButton();

            const summary = {
                panel: this,
                sourceCount: sources.length,
                successCount,
                failedCount: sources.length - successCount,
                results: [...this.googleDriveLastSyncResults],
            };

            window.dispatchEvent(
                new CustomEvent("sm-assets-google-drive-synced", {
                    detail: summary,
                }),
            );

            console.log(
                `[AssetsPanel] Google Drive sync finished: ` +
                `${successCount}/${sources.length} source(s) synced.`,
            );

            return successCount === sources.length;
        } finally {
            this.googleDriveSyncBusy = false;

            if (button) {
                button.disabled = false;
                button.innerHTML =
                    oldButtonHTML ||
                    '<i class="fas fa-cloud-download-alt"></i><span>Drive</span>';
            }
        }
    }

    static async syncGoogleDriveSource(sourceId, options = {}) {
        const wantedId = this._sanitizeGoogleDriveSourceId(sourceId);
        const source = this.getGoogleDriveSources()
            .find((entry) => entry.id === wantedId);

        if (!source) {
            console.error(
                `[AssetsPanel] Google Drive source '${sourceId}' was not found.`,
            );
            return false;
        }

        return this.syncGoogleDrive({
            ...options,
            source,
        });
    }

    static async _syncGoogleDriveSource(source, options = {}) {
        const apiKey = this._getGoogleDriveAPIKey({
            ...options,
            apiKey: source.apiKey || options.apiKey,
        });
        const folderId = source.folderId;
        const sourceId = this._sanitizeGoogleDriveSourceId(source.id);

        if (!folderId) {
            throw new Error(`Google Drive folder id is missing for '${sourceId}'.`);
        }

        if (!apiKey) {
            throw new Error(`Google Drive API key is missing for '${sourceId}'.`);
        }

        const rootMeta = await this._googleDriveGetFileMetadata(folderId, apiKey);
        const rootName =
            source.name ||
            rootMeta?.name ||
            options.rootName ||
            "Google Drive";

        const rootFolderId = this._ensureGoogleDriveRootFolder(
            rootName,
            folderId,
            sourceId,
            source,
        );

        const seenFolderIds = new Set([rootFolderId]);
        const seenAssetIds = new Set();

        await this._googleDriveScanFolder({
            driveFolderId: folderId,
            browserFolderId: rootFolderId,
            apiKey,
            sourceId,
            sourceTags: source.tags || [],
            seenFolderIds,
            seenAssetIds,
        });

        const removeMissing =
            options.removeMissing !== undefined
                ? options.removeMissing !== false
                : source.removeMissing !== false;

        if (removeMissing) {
            this.assets = this.assets.filter((asset) => {
                if (!this._belongsToGoogleDriveSource(asset, sourceId)) return true;
                return seenAssetIds.has(asset.id);
            });

            for (const [id, folder] of Object.entries(this.folders)) {
                if (!this._belongsToGoogleDriveSource(folder, sourceId)) continue;
                if (id === rootFolderId) continue;
                if (seenFolderIds.has(id)) continue;
                delete this.folders[id];
            }

            // Repair folder child references after stale remote folders were removed.
            for (const folder of Object.values(this.folders)) {
                if (!Array.isArray(folder.children)) folder.children = [];
                folder.children = folder.children.filter((childId) => !!this.folders[childId]);
            }
        }

        const reveal =
            options.reveal !== undefined
                ? options.reveal === true
                : source.reveal === true;

        if (reveal) {
            this.openFolderId = rootFolderId;
            this.expandedSections?.add?.("project");
            this.expandedFolders?.add?.(rootFolderId);
        }

        const result = {
            folderId,
            rootFolderId,
            sourceId,
            assetCount: seenAssetIds.size,
            folderCount: seenFolderIds.size,
        };

        window.dispatchEvent(
            new CustomEvent("sm-assets-google-drive-source-synced", {
                detail: {
                    panel: this,
                    ...result,
                },
            }),
        );

        console.log(
            `[AssetsPanel] Drive '${sourceId}' synced: ` +
            `${seenAssetIds.size} assets, ${Math.max(0, seenFolderIds.size - 1)} subfolders.`,
        );

        return result;
    }

    static async _googleDriveRequest(path, params, apiKey) {
        const query = new URLSearchParams({
            ...params,
            key: apiKey,
        });

        const response = await fetch(
            `https://www.googleapis.com/drive/v3/${path}?${query.toString()}`,
            {
                method: "GET",
                mode: "cors",
                cache: "no-store",
            },
        );

        if (!response.ok) {
            let details = "";

            try {
                const payload = await response.json();
                details = payload?.error?.message || JSON.stringify(payload);
            } catch (_) {
                try {
                    details = await response.text();
                } catch (_) { }
            }

            throw new Error(
                `Google Drive API ${response.status}: ${details || response.statusText}`,
            );
        }

        return response.json();
    }

    static async _googleDriveGetFileMetadata(fileId, apiKey) {
        return this._googleDriveRequest(
            `files/${encodeURIComponent(fileId)}`,
            {
                fields: "id,name,mimeType,modifiedTime,size,thumbnailLink,webContentLink",
                supportsAllDrives: "true",
            },
            apiKey,
        );
    }

    static async _googleDriveListChildren(folderId, apiKey) {
        const files = [];
        let pageToken = "";

        do {
            const params = {
                q: `'${folderId.replace(/'/g, "\\'")}' in parents and trashed = false`,
                fields:
                    "nextPageToken,files(id,name,mimeType,size,modifiedTime,thumbnailLink,webContentLink)",
                pageSize: "1000",
                orderBy: "folder,name",
                supportsAllDrives: "true",
                includeItemsFromAllDrives: "true",
            };

            if (pageToken) params.pageToken = pageToken;

            const data = await this._googleDriveRequest("files", params, apiKey);
            if (Array.isArray(data.files)) files.push(...data.files);
            pageToken = data.nextPageToken || "";
        } while (pageToken);

        return files;
    }

    static _ensureGoogleDriveRootFolder(
        name,
        driveFolderId,
        sourceId = this.GOOGLE_DRIVE_DEFAULT_SOURCE_ID,
        source = {},
    ) {
        const id = this._googleDriveRootFolderId(sourceId);
        const existing = this.folders[id] || {};

        this.folders[id] = {
            ...existing,
            id,
            name: name || "Google Drive",
            parentId: null,
            children: Array.isArray(existing.children) ? existing.children : [],
            isBuiltIn: false,
            isProjectAssetFolder: true,
            sourceType: "google-drive",
            driveSourceId: this._sanitizeGoogleDriveSourceId(sourceId),
            driveFolderId,
            driveUrl: source.url || `https://drive.google.com/drive/folders/${driveFolderId}`,
            sourceMetadata: source.metadata || {},
            remote: true,
        };

        return id;
    }

    static _ensureGoogleDriveFolder(
        driveFolder,
        parentBrowserFolderId,
        sourceId = this.GOOGLE_DRIVE_DEFAULT_SOURCE_ID,
    ) {
        const id = this._googleDriveBrowserFolderId(driveFolder.id, sourceId);
        const existing = this.folders[id] || {};

        this.folders[id] = {
            ...existing,
            id,
            name: driveFolder.name || "Folder",
            parentId: parentBrowserFolderId || null,
            children: Array.isArray(existing.children) ? existing.children : [],
            isBuiltIn: false,
            isProjectAssetFolder: true,
            sourceType: "google-drive",
            driveSourceId: this._sanitizeGoogleDriveSourceId(sourceId),
            driveFolderId: driveFolder.id,
            modifiedTime: driveFolder.modifiedTime || null,
            remote: true,
        };

        const parent = this.folders[parentBrowserFolderId];
        if (parent) {
            if (!Array.isArray(parent.children)) parent.children = [];
            if (!parent.children.includes(id)) parent.children.push(id);
        }

        return id;
    }

    static async _googleDriveScanFolder({
        driveFolderId,
        browserFolderId,
        apiKey,
        sourceId = this.GOOGLE_DRIVE_DEFAULT_SOURCE_ID,
        sourceTags = [],
        seenFolderIds,
        seenAssetIds,
    }) {
        const entries = await this._googleDriveListChildren(driveFolderId, apiKey);
        const browserFolder = this.folders[browserFolderId];

        // This subtree mirrors its own Drive source, therefore its remote child
        // folder links can be rebuilt safely without touching other sources.
        if (browserFolder) browserFolder.children = [];

        for (const entry of entries) {
            if (!entry?.id || !entry?.name) continue;

            if (entry.mimeType === this.GOOGLE_DRIVE_FOLDER_MIME) {
                const childBrowserFolderId = this._ensureGoogleDriveFolder(
                    entry,
                    browserFolderId,
                    sourceId,
                );

                seenFolderIds.add(childBrowserFolderId);

                await this._googleDriveScanFolder({
                    driveFolderId: entry.id,
                    browserFolderId: childBrowserFolderId,
                    apiKey,
                    sourceId,
                    sourceTags,
                    seenFolderIds,
                    seenAssetIds,
                });
                continue;
            }

            const type = this._getAssetType(entry.name);
            if (!type) continue;

            const asset = this._createGoogleDriveAsset(
                entry,
                browserFolderId,
                apiKey,
                type,
                sourceId,
                sourceTags,
            );

            seenAssetIds.add(asset.id);

            const existingIndex = this.assets.findIndex((item) => item.id === asset.id);
            if (existingIndex >= 0) {
                const previous = this.assets[existingIndex];
                this.assets[existingIndex] = {
                    ...previous,
                    ...asset,
                    history: previous.history || [],
                    references: previous.references || asset.references || [],
                    tags: Array.from(new Set([
                        ...(previous.tags || []),
                        ...(asset.tags || []),
                    ])),
                    isFavorite: previous.isFavorite === true,
                };
            } else {
                this.assets.push(asset);
            }
        }
    }

    static _createGoogleDriveAsset(
        file,
        folderId,
        apiKey,
        type,
        sourceId = this.GOOGLE_DRIVE_DEFAULT_SOURCE_ID,
        sourceTags = [],
    ) {
        const safeSourceId = this._sanitizeGoogleDriveSourceId(sourceId);
        const assetId = this._googleDriveAssetId(file.id, safeSourceId);
        const downloadURL = this._getGoogleDriveMediaURL(file.id, apiKey);
        const thumbnail = this._getGoogleDriveThumbnailURL(file, type);

        const asset = {
            id: assetId,
            name: file.name,
            type,
            folderId,
            data: downloadURL,
            url: downloadURL,
            thumbnail,
            isFavorite: false,
            isBuiltIn: false,
            tags: Array.from(new Set([
                "google-drive",
                "cloud",
                type,
                safeSourceId,
                ...sourceTags,
            ])),
            history: [],
            references: [],
            sourceType: "google-drive",
            driveSourceId: safeSourceId,
            driveFileId: file.id,
            driveMimeType: file.mimeType,
            sourceModifiedTime: file.modifiedTime || null,
            sourceSize: Number(file.size || 0) || 0,
            remote: true,
        };

        this._autoTagAsset?.(asset);
        return asset;
    }

    static _getGoogleDriveMediaURL(
        fileId,
        apiKey = this._getGoogleDriveAPIKey(),
    ) {
        const query = new URLSearchParams({
            alt: "media",
            key: apiKey,
            supportsAllDrives: "true",
        });

        return (
            `https://www.googleapis.com/drive/v3/files/` +
            `${encodeURIComponent(fileId)}?${query.toString()}`
        );
    }

    static _getGoogleDriveThumbnailURL(file, type) {
        if (typeof file?.thumbnailLink === "string" && file.thumbnailLink) {
            return file.thumbnailLink;
        }

        if (["texture", "image", "icon", "video"].includes(type)) {
            return (
                `https://drive.google.com/thumbnail?id=` +
                `${encodeURIComponent(file.id)}&sz=w400`
            );
        }

        return this._svgIcon?.(type) || null;
    }

    static configureGoogleDrive({
        apiKey,
        folderId,
        sources,
    } = {}) {
        if (typeof apiKey === "string") {
            window.SM_GOOGLE_DRIVE_API_KEY = apiKey.trim();
        }

        if (typeof folderId === "string" && folderId.trim()) {
            const parsed = this._extractGoogleDriveFolderId(folderId);
            if (parsed) this.GOOGLE_DRIVE_FOLDER_ID = parsed;
        }

        if (Array.isArray(sources)) {
            window[this.GOOGLE_DRIVE_SOURCES_GLOBAL] = sources;
        }

        return {
            folderId: this.GOOGLE_DRIVE_FOLDER_ID,
            sources: this.getGoogleDriveSources(),
            hasAPIKey: !!this._getGoogleDriveAPIKey(),
        };
    }

    static _afterExternalAssetSync() {
        this._refreshDOMCache();
        this._repairGameplayFolderTree();
        this._ensureProjectManifestAssets();
        this._syncRuntimeAssetRegistry();
        this.render();
        this._buildTagCloud();
        this._ensureGoogleDriveButton();
    }

    static _ensureGoogleDriveButton() {
        this._refreshDOMCache();

        if (
            typeof this.syncGoogleDrive !== "function" ||
            document.getElementById("cbGoogleDriveBtn")
        ) {
            return;
        }

        const host =
            this.dom.panel?.querySelector(".cb-primary-actions") ||
            this.dom.panel?.querySelector(".cb-toolbar-actions") ||
            this.dom.panel?.querySelector(".filter-group");

        if (!host) return;

        const button = document.createElement("button");
        button.id = "cbGoogleDriveBtn";
        button.className = host.classList.contains("filter-group")
            ? "panel-btn"
            : "cb-action-btn";
        button.title = "Sync all configured Google Drive asset sources";
        button.innerHTML =
            '<i class="fas fa-cloud-download-alt"></i><span>Drive</span>';

        button.addEventListener("click", () => {
            this.syncGoogleDrive();
        });

        host.appendChild(button);
    }

}
for(const key of Reflect.ownKeys(SMAssetsPanelDriveMixin)){
if(key==="length"||key==="name"||key==="prototype")continue;
const descriptor=Object.getOwnPropertyDescriptor(SMAssetsPanelDriveMixin,key);
if(!descriptor)continue;
Object.defineProperty(AssetsPanel,key,descriptor);
}
global.__SMAssetsPanelLoadedModules=global.__SMAssetsPanelLoadedModules||[];
global.__SMAssetsPanelLoadedModules.push("AssetsPanelDrive");
})(window);
