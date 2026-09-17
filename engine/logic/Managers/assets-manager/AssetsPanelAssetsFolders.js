// AssetsPanelAssetsFolders.js
// Asset source helpers, search/filter, CRUD, folders, properties
// Extracted from AssetsPanel_FULL_9483_PBR_FIXED without rewriting method bodies.
(function(global){
"use strict";
const AssetsPanel=global.AssetsPanel;
if(!AssetsPanel){
throw new Error("[SMAssetsPanelAssetsFoldersMixin] AssetsPanelCore must load first.");
}
class SMAssetsPanelAssetsFoldersMixin {
    static _getThumbnailMarkup(asset) {
        const thumb = asset?.thumbnail;
        if (typeof thumb === "string" && thumb.trim() !== "") {
            const trimmed = thumb.trim();
            if (trimmed.startsWith("<")) return trimmed;
            if (this._isImageSource(trimmed)) {
                return `<img src="${this._normalizeAssetSource(trimmed)}" alt="${asset?.name || "Asset"}" />`;
            }
        }
        return this._svgIcon(asset?.type || "primitive");
    }

    static _normalizeAssetSource(source = "") {
        const value = String(source || "").trim();
        if (!value || value.startsWith("data:") || value.startsWith("<")) return value;
        // Electron gives selected local files as Windows paths. Preserve the
        // actual file URL instead of letting URL() turn C:\\... into a web URL.
        if (/^[a-z]:[\\/]/i.test(value)) {
            const path = value.replace(/\\/g, "/").replace(/#/g, "%23");
            return `file:///${encodeURI(path)}`;
        }
        try {
            return new URL(value, window.location.href).href;
        } catch {
            try {
                return encodeURI(value);
            } catch {
                return value;
            }
        }
    }

    static _isImageSource(source = "") {
        const normalized = String(source || "").trim().toLowerCase();
        return normalized.startsWith("data:image") ||
            normalized.startsWith("blob:") ||
            normalized.includes("googleusercontent.com") ||
            normalized.includes("drive.google.com/thumbnail") ||
            /\.(png|jpe?g|webp|bmp|gif|svg)(\?|#|$)/i.test(normalized);
    }

    static _isHiddenProjectEntryName(name = "") {
        const normalized = String(name || "").trim();
        return !normalized || normalized === "__MACOSX" || normalized.startsWith("._");
    }

    static _isTextureCompatibleAssetType(type = "") {
        return ["texture", "image", "icon"].includes(String(type || "").toLowerCase());
    }

    static _getAssetDisplayMeta(asset) {
        const type = String(asset?.type || "asset");
        const width = Number(asset?.sourceDimensions?.width || 0);
        const height = Number(asset?.sourceDimensions?.height || 0);
        if (width > 0 && height > 0) return `${type} · ${width} × ${height}`;
        if (asset?.missingStoredFile) return `${type} · source missing`;
        return type;
    }

    static _isSceneMediaAssetType(type = "") {
        return ["texture", "image", "icon", "video"].includes(String(type || "").toLowerCase());
    }

    static _getAssetSourceUrl(asset) {
        if (!asset) return null;
        // Generated thumbnails used to be stored in `data` by older library
        // records. They are display-only (usually 128 px) and cannot be used
        // as an image/texture source without corrupting dimensions.
        const previewOnlyData = asset.thumbnail && asset.data === asset.thumbnail;
        return this._normalizeAssetSource(
            asset.url || asset.sourceURL || (previewOnlyData ? "" : asset.data) || asset.sourcePath || ""
        );
    }

    static _isEXRAsset(asset, source = "") {
        const resolved = window.SMHDRIPackage?.sourceFromAsset?.(asset, this);
        return resolved?.kind === "exr" ||
            /\.exr(?:$|[?#])/i.test(String(asset?.name || "")) ||
            /\.exr(?:$|[?#])/i.test(String(source || ""));
    }

    static async _applyHDRIAsset(asset) {
        const resolved = window.SMHDRIPackage?.sourceFromAsset?.(asset, this) || {
            source: this._getAssetSourceUrl(asset),
            kind: this._isEXRAsset(asset) ? "exr" : "hdr"
        };
        const source = this._normalizeAssetSource(resolved.source || "");
        if (!source) throw new Error(`HDRI '${asset?.name || "asset"}' has no source.`);

        const isEXR = resolved.kind === "exr";
        const isLDR = resolved.kind === "ldr";
        const loader = isEXR
            ? this.loaders.exr
            : isLDR
                ? this.loaders.texture
                : this.loaders.hdri;
        if (!loader) {
            throw new Error(
                `${isEXR ? "THREE.EXRLoader" : isLDR ? "THREE.TextureLoader" : "THREE.RGBELoader"} is not available.`,
            );
        }

        const texture = await new Promise((resolve, reject) => {
            loader.load(source, resolve, undefined, reject);
        });
        texture.mapping = THREE.EquirectangularReflectionMapping;
        if (isLDR && THREE.SRGBColorSpace) texture.colorSpace = THREE.SRGBColorSpace;

        // Prefer the tonemapped companion as the visible background while the
        // EXR remains the physically useful environment source.
        let backgroundTexture = texture;
        const preview = window.SMHDRIPackage?.previewFromAsset?.(asset, this);
        if (preview?.source && preview.source !== resolved.source) {
            backgroundTexture = await new Promise((resolve) => {
                this.loaders.texture.load(
                    this._normalizeAssetSource(preview.source),
                    resolve,
                    undefined,
                    () => resolve(texture)
                );
            });
            backgroundTexture.mapping = THREE.EquirectangularReflectionMapping;
            if (THREE.SRGBColorSpace) backgroundTexture.colorSpace = THREE.SRGBColorSpace;
        }

        const configuredIntensity = Number(
            window.EngineSettings?.get?.("setting-hdri-intensity") ?? 0.65,
        );
        const intensity = Number.isFinite(configuredIntensity)
            ? configuredIntensity
            : 0.65;
        window.smActiveHDRI = {
            texture,
            environmentTexture: texture,
            backgroundTexture,
            source,
            assetId: asset?.id || null,
            name: asset?.name || null,
            type: isEXR ? "exr" : isLDR ? "ldr" : "hdr",
            package: asset?.hdriPackage || null,
            intensity,
        };
        if (window.smHDRIEnvironmentEnabled === undefined) {
            window.smHDRIEnvironmentEnabled = true;
        }

        const sky = window.skyLightingSystem;
        if (sky?.applyExternalEnvironmentTexture) {
            sky.applyExternalEnvironmentTexture(texture, {
                intensity,
                asBackground: true,
                backgroundTexture,
                type: isEXR ? "exr" : isLDR ? "ldr" : "hdr",
                source,
                assetId: asset?.id || null,
            });
        } else if (this.scene) {
            this.scene.background = backgroundTexture;
            if (window.smHDRIEnvironmentEnabled !== false) {
                this.scene.environment = texture;
                this.scene.environmentIntensity = intensity;
            }
        }

        window.workspaceManager?._restoreActiveHDRI?.(this.scene);
        console.log(
            `Applied ${isEXR ? "EXR" : isLDR ? "LDR sky" : "HDR"} environment '${asset?.name || "Environment"}'.`,
        );
        return texture;
    }

    static _getActiveGameViewportMode() {
        const raw = document.body?.dataset?.gameViewportMode || "3D";
        const normalized = String(raw).toUpperCase();
        return normalized === "2.5D" || normalized === "25D" ? "2.5D" : (normalized === "2D" ? "2D" : "3D");
    }

    static _resolveAssetReference(reference) {
        if (!reference) return null;
        return this._findById(reference)
            || this.assets.find((asset) => asset?.name === reference)
            || this.assets.find((asset) => String(asset?.name || "").toLowerCase() === String(reference).toLowerCase())
            || this._getPrimitiveAssets().find((asset) => asset.id === reference || asset.name === reference)
            || this._getLightAssets().find((asset) => asset.id === reference || asset.name === reference);
    }

    static _syncRuntimeAssetRegistry() {
        if (typeof window === "undefined" || !window.ResourceManager?.syncFromAssetsPanel) return;
        try {
            window.ResourceManager.syncFromAssetsPanel(this.assets);
        } catch (error) {
            console.warn("AssetsPanel: Failed to sync runtime asset registry.", error);
        }
    }

    static async addAssetToSceneByReference(reference, options = {}) {
        const asset = this._resolveAssetReference(reference);
        if (!asset) {
            throw new Error(`AssetsPanel: Asset not found for reference "${reference}".`);
        }
        return await this._addToScene(asset.id, options.event || null, options);
    }

    static searchAssets(query) {
        this.render(query ? query.toLowerCase() : "");
    }
    static filterByType(type, element) {
        this.currentFilter = type;
        document
            .querySelectorAll(".filter-btn.active")
            .forEach((b) => b.classList.remove("active"));
        if (element) element.classList.add("active");
        this.render();
    }
    static selectCategory(category, element) {
        this.currentCategory = category;

        // A type filter hides every folder in Project Assets. Reset it when
        // returning to the project browser so Gameplay/Procedural Cities can
        // always be reached instead of leaving an apparently empty grid.
        if (category === "project") {
            this.currentFilter = "all";
            document
                .querySelectorAll(".filter-btn.active")
                .forEach((button) => button.classList.remove("active"));
            document
                .querySelector('.filter-btn[data-type="all"], .filter-btn[onclick*="all"]')
                ?.classList.add("active");
        }

        document
            .querySelectorAll(".category-item.active")
            .forEach((c) => c.classList.remove("active"));
        if (element) element.classList.add("active");
        this.render();
    }

    // Thumbnail size control
    static setThumbnailSize(size) {
        this.currentThumbnailSize = parseInt(size, 10);
        if (this.dom.panel) {
            this.dom.panel.style.setProperty(
                "--thumbnail-size",
                `${this.currentThumbnailSize}px`,
            );
        }
        localStorage.setItem(
            "assetsPanel_thumbnailSize",
            this.currentThumbnailSize,
        );
    }

    // File actions (rename/delete/favorite preserved) - MODIFIED: Renaming commits a version
    static renameAsset() {
        const asset = this._findById(this.contextAssetId);
        if (!asset || asset.isBuiltIn) return;
        const newName = prompt("Enter new name:", asset.name);
        if (newName && newName !== asset.name) {
            const siblingAssets = this.assets.filter(
                (a) =>
                    !a.isBuiltIn && a.id !== asset.id && a.folderId === asset.folderId,
            );
            if (siblingAssets.some((a) => a.name === newName)) {
                alert("An asset with this name already exists in the current folder.");
                return;
            }

            asset.name = newName;
            this._commitAssetVersion(asset.id, `Renamed to "${newName}"`); // NEW: Commit a new version
            this._saveToStorage();
            this.render();
            this.selectAsset(asset.id, null, false, null); // Re-select to update properties panel
        }
    }

    static deleteAsset() {
        if (
            !confirm(
                "Are you sure you want to delete this asset(s)? This action cannot be undone from history.",
            )
        )
            return;
        const idsToDelete = this.selectedIds.size
            ? Array.from(this.selectedIds)
            : [this.contextAssetId];
        for (const id of idsToDelete) this._removeAsset(id);
        this.selectedIds.clear();
        this.selectedAssetId = null;
        this._clearPreview();
        this._saveToStorage();
        this.render();
        this._buildTagCloud(); // MODIFIED: Rebuild tag cloud
    }

    static toggleFavorite() {
        const asset = this._findById(this.contextAssetId);
        if (asset) {
            asset.isFavorite = !asset.isFavorite;
            this._saveToStorage();
            this.render();
        }
    }

    // Folder operations
    // UI-safe entry point used by the toolbar and professional shell.
    static createFolderFromUI(event = null, parentId = undefined) {
        event?.preventDefault?.();

        const requestedParent =
            parentId !== undefined
                ? parentId
                : (this.openFolderId || null);

        let targetParent = requestedParent;

        // Physical/Drive/Built-in folders are source mirrors. Creating a normal
        // virtual folder inside them is misleading, so fall back to Project Assets.
        if (targetParent && this.folders?.[targetParent]) {
            const parentFolder = this.folders[targetParent];

            const readOnly =
                typeof this._ctxIsReadOnlyFolder === "function"
                    ? this._ctxIsReadOnlyFolder(parentFolder)
                    : !!(
                        parentFolder.isBuiltIn ||
                        parentFolder.sourceType === "google-drive" ||
                        parentFolder.isGoogleDriveFolder ||
                        parentFolder.isPhysicalGameProject ||
                        parentFolder.isPhysicalGameContentFolder ||
                        parentFolder.sourceType === "physical-game-project"
                    );

            if (readOnly) {
                targetParent = null;
            }
        }

        const rawName = prompt("Folder name", "New Folder");
        const name = String(rawName || "").trim();

        if (!name) return null;

        // Make sure the new folder is visible immediately after creation.
        this.currentCategory = "project";
        this.currentFilter = "all";

        const id = this.createFolder(name, targetParent);

        if (id) {
            this.expandedSections?.add?.("project");

            if (targetParent) {
                this.expandedFolders?.add?.(targetParent);
            }

            this.render?.();
        }

        return id;
    }

    static createFolder(name = "New Folder", parentId = null) {
        const id = `folder_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        let uniqueName = name;
        let counter = 1;
        const siblingFolders = Object.values(this.folders).filter(
            (f) => (f.parentId || null) === (parentId || null),
        );
        while (siblingFolders.some((f) => f.name === uniqueName)) {
            uniqueName = `${name} (${counter++})`;
        }

        this.folders[id] = { id, name: uniqueName, parentId, children: [] };

        if (parentId && this.folders[parentId]) {
            if (!Array.isArray(this.folders[parentId].children)) {
                this.folders[parentId].children = [];
            }

            if (!this.folders[parentId].children.includes(id)) {
                this.folders[parentId].children.push(id);
            }
        }
        this._saveToStorage();
        if (typeof this.onFolderChanged === "function")
            this.onFolderChanged(this.folders);
        this.render();
        return id;
    }

    /**
     * Return the persistent project folder used by the code editor. Keeping
     * this deterministic prevents a new "Scripts" folder being created on
     * every engine reload and gives saved scripts a stable parent id.
     */
    static ensureScriptsFolder() {
        const existing = Object.values(this.folders || {}).find((folder) =>
            folder && String(folder.name).toLowerCase() === "scripts" && !(folder.parentId || null)
        );
        if (existing) return existing.id;

        const id = "sme_scripts";
        this.folders[id] = {
            id,
            name: "Scripts",
            parentId: null,
            children: [],
            isProjectAssetFolder: true
        };
        this._saveToStorage();
        if (typeof this.onFolderChanged === "function") this.onFolderChanged(this.folders);
        return id;
    }

    static renameFolder(folderId) {
        const folder = this.folders[folderId];
        if (!folder) return;
        const n = prompt("Rename folder", folder.name);
        if (n && n !== folder.name) {
            const siblingFolders = Object.values(this.folders).filter(
                (f) =>
                    f.id !== folderId &&
                    (f.parentId || null) === (folder.parentId || null),
            );
            if (siblingFolders.some((f) => f.name === n)) {
                alert(
                    "A folder with this name already exists in the current directory.",
                );
                return;
            }
            folder.name = n;
            this._saveToStorage();
            if (typeof this.onFolderChanged === "function")
                this.onFolderChanged(this.folders);
            this.render();
        }
    }

    static deleteFolder(folderId, options = { deleteContents: false }) {
        const folder = this.folders[folderId];
        if (!folder) return;
        const all = this._collectFolderTree(folderId);
        if (!options.deleteContents) {
            const targetParent = folder.parentId || null;
            for (const asset of this.assets) {
                if (asset.folderId && all.includes(asset.folderId)) {
                    asset.folderId = targetParent;
                    this._commitAssetVersion(
                        asset.id,
                        `Moved to parent due to folder deletion`,
                    ); // NEW: Commit
                }
            }
        } else {
            // Delete assets AND their history/dependencies as they are gone
            this.assets = this.assets.filter(
                (a) => !(a.folderId && all.includes(a.folderId)),
            );
        }
        for (const fid of all) delete this.folders[fid];
        for (const f of Object.values(this.folders))
            f.children = f.children.filter((c) => !all.includes(c));

        if (this.openFolderId && all.includes(this.openFolderId)) {
            this.openFolderId = folder.parentId || null;
        }

        this._saveToStorage();
        if (typeof this.onFolderChanged === "function")
            this.onFolderChanged(this.folders);
        this.render();
        this._buildTagCloud(); // MODIFIED: Rebuild tag cloud
    }

    // MODIFIED: Moving an asset commits a version
    static moveAssetToFolder(assetId, folderId) {
        const asset = this._findById(assetId);
        if (!asset) return;
        asset.folderId = folderId || null;
        this._commitAssetVersion(asset.id, "Move to Folder"); // NEW: Commit a new version
        this._saveToStorage();
        this.render();
    }

    // Export / Import - MODIFIED: Import initializes new asset properties
    static exportJSON() {
        const payload = {
            version: this.lastStorageVersion,
            assets: this.assets.filter((a) => !a.isBuiltIn),
            folders: this.folders,
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], {
            type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "assets_export.json";
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    }

    static importJSON(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                if (data.assets) {
                    for (const a of data.assets) {
                        a.id = `asset_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
                        a.isBuiltIn = false;
                        if (!Array.isArray(a.tags)) a.tags = [];
                        if (!Array.isArray(a.history)) a.history = []; // NEW: Initialize history
                        if (!Array.isArray(a.references)) a.references = []; // NEW: Initialize references
                        this.assets.push(a);
                    }
                }
                if (data.folders) {
                    const idMap = {};
                    for (const fid in data.folders) {
                        const f = data.folders[fid];
                        const nid = `folder_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
                        idMap[fid] = nid;
                        this.folders[nid] = { ...f, id: nid, children: [], parentId: null };
                    }
                    for (const fid in data.folders) {
                        const oldFolder = data.folders[fid];
                        const newFolder = this.folders[idMap[fid]];
                        if (oldFolder.parentId && idMap[oldFolder.parentId]) {
                            newFolder.parentId = idMap[oldFolder.parentId];
                            if (
                                this.folders[newFolder.parentId] &&
                                !this.folders[newFolder.parentId].children.includes(
                                    newFolder.id,
                                )
                            ) {
                                this.folders[newFolder.parentId].children.push(newFolder.id);
                            }
                        }
                        newFolder.children = (oldFolder.children || [])
                            .map((c) => idMap[c])
                            .filter(Boolean);
                    }
                }
                this._saveToStorage();
                this.render();
                this._buildTagCloud(); // MODIFIED: Rebuild tag cloud
            } catch (err) {
                console.error("Import failed", err);
                alert("Invalid JSON file");
            }
        };
        reader.readAsText(file);
    }

    // Selection Logic - MODIFIED: Updated to handle new properties panel logic
    static selectAsset(assetId, element = null, append = false, event = null) {
        const isCtrlOrMeta = event && (event.ctrlKey || event.metaKey);
        const isShift = event && event.shiftKey;

        if (!isCtrlOrMeta && !isShift) {
            // Plain click: clear all, then select current
            this.selectedIds.clear();
            if (assetId) this.selectedIds.add(assetId);
        } else if (isCtrlOrMeta) {
            // Ctrl/Cmd+Click: Toggle individual asset
            if (assetId) {
                if (this.selectedIds.has(assetId)) {
                    this.selectedIds.delete(assetId);
                } else {
                    this.selectedIds.add(assetId);
                }
            }
        } else if (isShift && this.lastSelectedAssetElement) {
            // Shift+Click: Range select
            const allVisibleAssetElements = Array.from(
                this.dom.grid.querySelectorAll(".asset-item"),
            );
            const allVisibleAssetIds = allVisibleAssetElements.map(
                (el) => el.dataset.id,
            );

            const startIndex = allVisibleAssetIds.indexOf(
                this.lastSelectedAssetElement.dataset.id,
            );
            const endIndex = allVisibleAssetIds.indexOf(assetId);

            if (startIndex !== -1 && endIndex !== -1) {
                const [start, end] = [
                    Math.min(startIndex, endIndex),
                    Math.max(startIndex, endIndex),
                ];
                this.selectedIds.clear(); // Clear current selection before range adding
                for (let i = start; i <= end; i++) {
                    this.selectedIds.add(allVisibleAssetIds[i]);
                }
            } else {
                // Fallback to single select if range can't be determined (e.g., lastSelected not found)
                this.selectedIds.clear();
                if (assetId) this.selectedIds.add(assetId);
            }
        } else {
            // No assetId or other unexpected case, clear selection
            this.selectedIds.clear();
        }

        // Update last selected ID and element
        this.selectedAssetId = Array.from(this.selectedIds).pop() || null; // Last selected ID or null
        if (element) this.lastSelectedAssetElement = element; // Store the clicked DOM element

        // Visually update selection in the grid
        document
            .querySelectorAll(".asset-item.selected")
            .forEach((el) => el.classList.remove("selected"));
        for (const id of this.selectedIds) {
            const el = this.dom.grid.querySelector(`.asset-item[data-id='${id}']`);
            if (el) el.classList.add("selected");
        }

        // Update properties and preview for the *last selected* asset (or clear if none)
        const asset = this._findById(this.selectedAssetId);
        if (asset) {
            this._updatePropertiesPanel(asset);
            this._updatePreview(asset);
            if (asset.type === "code" && window.codeEditorManager &&
                typeof window.codeEditorManager.loadScriptFromAsset === "function") {
                window.codeEditorManager.loadScriptFromAsset(asset);
            }
        } else {
            this.dom.properties.innerHTML = `<div class="property-row"><div class="property-label">Select an asset</div><div class="property-value">No asset selected</div></div>`;
            this._clearPreview();
        }
    }

    // Update Properties Panel - MODIFIED: Now shows history, dependencies, and supports drag-to-UI for textures
    /**
    * Updates the right-side properties panel when an asset is selected
    * @param {Object} asset - The selected asset object
    */
    static _updatePropertiesPanel(asset) {
        if (!this.dom.properties) return;

        // Basic info (always shown)
        let propsHtml = `
        <div class="properties-title">${asset.name || 'Unnamed Asset'}</div>
        <div class="property-row">
            <div class="property-label">Type</div>
            <div class="property-value">${(asset.type || 'unknown').toUpperCase()}</div>
        </div>
        <div class="property-row">
            <div class="property-label">ID</div>
            <div class="property-value">${asset.id?.slice(0, 8) || '—'}...</div>
        </div>`;

        // ────────────────────────────────────────────────
        // Material-specific properties
        // ────────────────────────────────────────────────
        if (asset.type === 'material' && asset.definition) {
            const d = asset.definition;

            propsHtml += `
            <div class="property-section-header">Material Properties</div>
            <div class="property-row">
                <div class="property-label">Color</div>
                <div class="property-value">
                    <input type="color" class="property-input color-input" data-prop="color" value="${d.color || '#ffffff'}">
                </div>
            </div>
            <div class="property-row">
                <div class="property-label">Roughness</div>
                <div class="property-value">
                    <input type="range" min="0" max="1" step="0.01" class="property-input range-input" data-prop="roughness" value="${d.roughness ?? 0.5}">
                    <span>${(d.roughness ?? 0.5).toFixed(2)}</span>
                </div>
            </div>
            <div class="property-row">
                <div class="property-label">Metalness</div>
                <div class="property-value">
                    <input type="range" min="0" max="1" step="0.01" class="property-input range-input" data-prop="metalness" value="${d.metalness ?? 0.0}">
                    <span>${(d.metalness ?? 0.0).toFixed(2)}</span>
                </div>
            </div>`;

            // Texture slots (drag & drop + clear button)
            const textureSlots = [
                { key: 'map', label: 'Albedo Map' },
                { key: 'normalMap', label: 'Normal Map' },
                { key: 'roughnessMap', label: 'Roughness Map' },
                { key: 'metalnessMap', label: 'Metalness Map' },
                { key: 'emissiveMap', label: 'Emissive Map' },
                { key: 'displacementMap', label: 'Displacement Map' }
            ];

            textureSlots.forEach(slot => {
                const textureId = asset.definition[slot.key];
                const textureAsset = textureId ? this._findById(textureId) : null;
                const textureName = textureAsset ? textureAsset.name : '';

                propsHtml += `
                <div class="property-row">
                    <div class="property-label">${slot.label}</div>
                    <div class="property-value">
                        <input type="text"
                               class="property-input texture-slot-input"
                               placeholder="Drag Texture Here"
                               value="${textureName}"
                               readonly
                               data-texture-slot="${slot.key}"
                               data-material-asset-id="${asset.id}"
                               data-current-texture-id="${textureId || ''}"
                        >
                        ${textureId ? `
                            <button class="clear-texture-btn panel-btn mini-btn" 
                                    data-texture-slot="${slot.key}" 
                                    data-material-asset-id="${asset.id}">
                                ×
                            </button>
                        ` : ''}
                    </div>
                </div>`;
            });
        }

        if (asset.type === 'hdri' && asset.hdriPackage) {
            const packageFiles = Array.isArray(asset.hdriPackage.files)
                ? asset.hdriPackage.files
                : [];
            const companionCount = packageFiles.filter((file) => file.type === 'hdri-companion').length;
            propsHtml += `
            <div class="property-section-header">HDRI Package</div>
            <div class="property-row">
                <div class="property-label">Lighting</div>
                <div class="property-value">${asset.hdriPackage.environmentKind === 'ldr' ? 'LDR sky source' : `${String(asset.hdriPackage.environmentKind || 'HDR').toUpperCase()} source linked`}</div>
            </div>
            <div class="property-row">
                <div class="property-label">Background</div>
                <div class="property-value">${asset.hdriPackage.previewAssetId ? 'Tonemapped preview linked' : 'Lighting source'}</div>
            </div>
            <div class="property-row">
                <div class="property-label">Source files</div>
                <div class="property-value">${packageFiles.length} files · ${companionCount} companion</div>
            </div>`;
        }

        // ────────────────────────────────────────────────
        // Dependencies (this asset uses these assets)
        // ────────────────────────────────────────────────
        if (asset.references?.length > 0) {
            propsHtml += `
             <div class="property-section-header">
                Dependencies (Uses)
                <!-- 👇 THIS IS THE BUTTON TO UPDATE 👇 -->
                <button class="panel-btn mini-btn" 
                        onclick="AssetsPanel.showDependencyGraph('${asset.id}')">
                    View Graph
                </button>
            </div>
            <div class="asset-dependency-list">`;

            asset.references.forEach(refId => {
                const refAsset = this._findById(refId);
                if (refAsset) {
                    propsHtml += `
                    <div class="dependency-item" data-id="${refId}">
                        ${refAsset.name} (${refAsset.type})
                    </div>`;
                } else {
                    propsHtml += `
                    <div class="dependency-item broken" title="Asset not found">
                        Broken Ref: ${refId.slice(0, 8)}...
                    </div>`;
                }
            });

            propsHtml += `</div>`;
        }

        // ────────────────────────────────────────────────
        // Used By (other assets that reference this one)
        // ────────────────────────────────────────────────
        const usedBy = this._getAssetsUsing(asset.id);
        if (usedBy.length > 0) {
            propsHtml += `
            <div class="property-section-header">Used By</div>
            <div class="asset-dependency-list">`;

            usedBy.forEach(user => {
                propsHtml += `
                <div class="dependency-item" data-id="${user.id}">
                    ${user.name} (${user.type})
                </div>`;
            });

            propsHtml += `</div>`;
        }

        // ────────────────────────────────────────────────
        // History
        // ────────────────────────────────────────────────
        if (asset.history?.length > 0) {
            const latest = asset.history[asset.history.length - 1];
            propsHtml += `
            <div class="property-section-header">
                History
                <button class="panel-btn mini-btn" id="showAssetHistoryBtn">
                    Show All (${asset.history.length})
                </button>
            </div>
            <div class="property-row">
                <div class="property-label">Last Commit</div>
                <div class="property-value">${new Date(latest.timestamp).toLocaleString()}</div>
            </div>
            <div class="property-row">
                <div class="property-label">Message</div>
                <div class="property-value">${latest.message || '—'}</div>
            </div>`;
        }

        // ────────────────────────────────────────────────
        // Tags
        // ────────────────────────────────────────────────
        propsHtml += `
        <div class="property-row property-tags">
            <div class="property-label">Tags</div>
            <div class="property-value">
                <input type="text" 
                       class="property-input tags-input" 
                       id="assetTagsInput" 
                       placeholder="Comma separated tags" 
                       value="${(asset.tags || []).join(', ')}">
            </div>
        </div>`;

        // Apply the generated HTML
        this.dom.properties.innerHTML = propsHtml;

        // ────────────────────────────────────────────────
        // Attach event listeners (AFTER HTML is inserted)
        // ────────────────────────────────────────────────

        // 1. Material property changes
        if (asset.type === 'material') {
            this.dom.properties.querySelectorAll('.color-input, .range-input').forEach(input => {
                input.oninput = input.onchange = e => {
                    const prop = e.target.dataset.prop;
                    let value = e.target.value;

                    if (e.target.type === 'range') {
                        value = parseFloat(value);
                        e.target.nextElementSibling.textContent = value.toFixed(2);
                    }

                    if (asset.definition[prop] !== value) {
                        asset.definition[prop] = value;
                        this._commitAssetVersion(asset.id, `Updated ${prop} → ${value}`);
                        this._saveToStorage();
                        this._updatePreview(asset);
                    }
                };
            });

            // Clear texture buttons
            this.dom.properties.querySelectorAll('.clear-texture-btn').forEach(btn => {
                btn.onclick = e => {
                    const slot = e.target.dataset.textureSlot;
                    const matId = e.target.dataset.materialAssetId;
                    const mat = this._findById(matId);

                    if (mat?.type === 'material' && mat.definition?.[slot]) {
                        const oldId = mat.definition[slot];
                        delete mat.definition[slot];
                        mat.references = mat.references.filter(r => r !== oldId);

                        this._commitAssetVersion(mat.id, `Cleared ${slot}`);
                        this._saveToStorage();
                        this._updatePropertiesPanel(mat);
                        this._updatePreview(mat);
                    }
                };
            });
        }

        // 2. Tags input
        const tagsInput = this.dom.properties.querySelector('#assetTagsInput');
        if (tagsInput) {
            tagsInput.onblur = tagsInput.onchange = e => {
                const newTags = e.target.value
                    .split(',')
                    .map(t => t.trim())
                    .filter(t => t.length > 0);

                if (JSON.stringify(asset.tags) !== JSON.stringify(newTags)) {
                    asset.tags = newTags;
                    this._commitAssetVersion(asset.id, 'Tags updated');
                    this._saveToStorage();
                    this._buildTagCloud();
                }
            };
        }

        // 3. Show full history
        const historyBtn = this.dom.properties.querySelector('#showAssetHistoryBtn');
        if (historyBtn) {
            historyBtn.onclick = () => this._showAssetHistory(asset.id);
        }

        // 4. Clickable dependency items
        this.dom.properties.querySelectorAll('.dependency-item').forEach(item => {
            if (item.dataset.id) {
                item.onclick = () => this.selectAsset(item.dataset.id, null, false, null);
            }
        });

        // 5. Drag-and-drop for texture slots (unchanged, just cleaned)
        this.dom.properties.querySelectorAll('.texture-slot-input').forEach(input => {
            input.ondragover = e => {
                e.preventDefault();
                try {
                    const data = JSON.parse(e.dataTransfer.getData('application/json'));
                    if (this._isTextureCompatibleAssetType(data?.assetType)) {
                        input.classList.add('dragover');
                        e.dataTransfer.dropEffect = 'link';
                    }
                } catch { }
            };

            input.ondragleave = () => input.classList.remove('dragover');

            input.ondrop = e => {
                e.preventDefault();
                input.classList.remove('dragover');

                try {
                    const data = JSON.parse(e.dataTransfer.getData('application/json'));
                    if (data?.assetId && this._isTextureCompatibleAssetType(data.assetType)) {
                        const tex = this._findById(data.assetId);
                        if (!tex || !this._isTextureCompatibleAssetType(tex.type)) return;

                        const slot = input.dataset.textureSlot;
                        const matId = input.dataset.materialAssetId;
                        const mat = this._findById(matId);

                        if (mat?.type === 'material') {
                            const oldId = mat.definition?.[slot];
                            if (oldId && oldId !== data.assetId) {
                                mat.references = mat.references.filter(r => r !== oldId);
                            }

                            mat.definition[slot] = data.assetId;
                            if (!mat.references.includes(data.assetId)) {
                                mat.references.push(data.assetId);
                            }

                            this._commitAssetVersion(mat.id, `Assigned texture to ${slot}`);
                            this._saveToStorage();
                            this._updatePropertiesPanel(mat);
                            this._updatePreview(mat);
                        }
                    }
                } catch (err) {
                    console.error('Drop error:', err);
                }
            };
        });
    }

}
for(const key of Reflect.ownKeys(SMAssetsPanelAssetsFoldersMixin)){
if(key==="length"||key==="name"||key==="prototype")continue;
const descriptor=Object.getOwnPropertyDescriptor(SMAssetsPanelAssetsFoldersMixin,key);
if(!descriptor)continue;
Object.defineProperty(AssetsPanel,key,descriptor);
}
global.__SMAssetsPanelLoadedModules=global.__SMAssetsPanelLoadedModules||[];
global.__SMAssetsPanelLoadedModules.push("AssetsPanelAssetsFolders");
})(window);
