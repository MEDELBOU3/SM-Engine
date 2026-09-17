// AssetsPanelAdvancedFeatures.js
// History/versioning, references, tagging, packing, prefabs
// Extracted from AssetsPanel_FULL_9483_PBR_FIXED without rewriting method bodies.
(function(global){
"use strict";
const AssetsPanel=global.AssetsPanel;
if(!AssetsPanel){
throw new Error("[SMAssetsPanelAdvancedFeaturesMixin] AssetsPanelCore must load first.");
}
class SMAssetsPanelAdvancedFeaturesMixin {
    // === NEW ADVANCED FEATURES IMPLEMENTATION                       ===
    // ==================================================================

    // --- Version Control Integration ---

    /**
     * Commits the current state of an asset to its history.
     * @param {string} assetId The ID of the asset to commit.
     * @param {string} message A message describing the change.
     */
    static _commitAssetVersion(assetId, message = "Automatic commit") {
        const asset = this._findById(assetId);
        if (!asset || asset.isBuiltIn) return;

        // Create a lightweight snapshot of the current asset state for history.
        // We capture key mutable properties. Full binary 'data' is NOT stored in history
        // to prevent excessive localStorage usage. Full data revert would require reloading from source or a separate data store.
        const snapshot = {
            timestamp: Date.now(),
            message: message,
            name: asset.name,
            tags: [...(asset.tags || [])], // Clone array
            folderId: asset.folderId,
            definition:
                asset.type === "material" ? { ...asset.definition } : undefined, // Clone definition for materials
            references: [...(asset.references || [])], // Clone references
            // You could store a small thumbnail preview for history items if desired
            // Or a hash of the 'data' to detect actual content changes
        };

        if (!asset.history) asset.history = [];
        asset.history.push(snapshot);

        // Limit history length to prevent excessive storage (e.g., last 10 versions)
        const MAX_HISTORY = 10;
        if (asset.history.length > MAX_HISTORY) {
            asset.history.shift(); // Remove oldest entry
        }

        this._saveToStorage();
        if (typeof this.onAssetVersionCommit === "function")
            this.onAssetVersionCommit(assetId, snapshot);
        console.log(
            `AssetsPanel: Committed new version for '${asset.name}': "${message}"`,
        );
    }

    /**
     * Reverts an asset to a previous version from its history.
     * Current implementation reverts to the *immediately previous* version.
     * For arbitrary history selection, _showAssetHistory would handle applying.
     * @param {string} assetId The ID of the asset to revert.
     */
    static _revertAsset(assetId) {
        const asset = this._findById(assetId);
        if (
            !asset ||
            asset.isBuiltIn ||
            !asset.history ||
            asset.history.length < 2
        ) {
            alert("No previous version to revert to.");
            return;
        }

        if (
            !confirm(
                `Are you sure you want to revert '${asset.name}' to its immediately previous state? The current state will be committed before reverting.`,
            )
        ) {
            return;
        }

        // Commit current state before reverting, so user can always go forward if they change their mind
        this._commitAssetVersion(assetId, "Auto-commit before revert");

        const previousSnapshot = asset.history[asset.history.length - 2]; // Get the second-to-last (previous to current)

        // Apply properties from the snapshot
        asset.name = previousSnapshot.name;
        asset.tags = [...previousSnapshot.tags];
        asset.folderId = previousSnapshot.folderId;
        if (asset.type === "material" && previousSnapshot.definition) {
            asset.definition = { ...previousSnapshot.definition }; // Revert material definition
            asset.references = [...(previousSnapshot.references || [])]; // Revert references too
        }

        // IMPORTANT: For actual 'data' rollback (e.g., changing image content or model geometry),
        // you would need to have stored the full 'data' in the snapshot, or a reference to it.
        // This implementation focuses on metadata rollback.

        this._saveToStorage();
        this.render();
        this.selectAsset(assetId, null, false, null); // Re-select to update UI
        if (typeof this.onAssetVersionRevert === "function")
            this.onAssetVersionRevert(assetId, previousSnapshot);
        console.log(`AssetsPanel: Reverted '${asset.name}' to a previous version.`);
    }

    /**
     * Opens the History Data Grid inside the main panel (Embedded).
     * @param {string} assetId
     */
    static _showAssetHistory(assetId) {
        const asset = this._findById(assetId);
        if (!asset) return;

        // 1. Get Main Containers
        const gridContainer = document.querySelector('.assets-grid-container');
        const assetsGrid = document.getElementById('assetsGrid');
        if (!gridContainer || !assetsGrid) return;

        // 2. Hide Main Grid
        assetsGrid.style.display = 'none';

        // 3. Remove existing history view if any (cleanup)
        const existingView = document.getElementById('embeddedHistoryView');
        if (existingView) existingView.remove();

        // 4. Create View Container
        const view = document.createElement('div');
        view.id = 'embeddedHistoryView';
        view.className = 'history-embedded-view';

        // 5. Prepare Data
        const history = (asset.history && asset.history.length > 0)
            ? [...asset.history].reverse()
            : [{ timestamp: Date.now(), message: "Initial Import", tags: asset.tags || [] }];

        // 6. Build HTML Structure
        view.innerHTML = `
            <div class="history-toolbar">
                <button class="btn-history-back" id="btnHistoryBack">Back</button>
                <span>History: ${asset.name}</span>
            </div>
            <div class="history-grid-header">
                <div class="history-cell center"></div>
                <div class="history-cell">Date Modified</div>
                <div class="history-cell">Commit Message</div>
                <div class="history-cell">Tags</div>
                <div class="history-cell">Action</div>
            </div>
            <div class="history-list-scroll-area" id="historyListRoot">
                <!-- Rows injected here -->
            </div>
        `;

        // 7. Inject Rows
        const listRoot = view.querySelector('#historyListRoot');
        const iconSvg = `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" style="opacity:0.7"><path d="M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"/></svg>`;

        history.forEach((version, index) => {
            const isCurrent = index === 0;
            const originalIndex = history.length - 1 - index;

            const row = document.createElement('div');
            row.className = `history-grid-row ${isCurrent ? 'current-version' : ''}`;

            const dateStr = new Date(version.timestamp).toLocaleString(undefined, {
                year: '2-digit', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
            });
            const tagsStr = (version.tags && version.tags.length) ? version.tags.join(", ") : "";
            const actionHtml = isCurrent
                ? "Active"
                : `<button class="btn-revert-link" data-idx="${originalIndex}">Revert</button>`;

            row.innerHTML = `
                <div class="history-cell center">${iconSvg}</div>
                <div class="history-cell">${dateStr}</div>
                <div class="history-cell" title="${version.message}">${version.message}</div>
                <div class="history-cell">${tagsStr}</div>
                <div class="history-cell">${actionHtml}</div>
            `;

            // Row click selection logic
            row.onclick = () => {
                listRoot.querySelectorAll('.history-grid-row').forEach(r => r.classList.remove('current-version'));
                row.classList.add('current-version');
            };

            listRoot.appendChild(row);
        });

        // 8. Append to DOM
        gridContainer.appendChild(view);

        // --- Event Listeners ---

        // Back Button
        view.querySelector('#btnHistoryBack').onclick = () => this._closeAssetHistory();

        // Revert Action
        listRoot.addEventListener("click", (e) => {
            if (e.target.classList.contains("btn-revert-link")) {
                const idx = parseInt(e.target.dataset.idx);
                const targetVersion = asset.history[idx];
                if (confirm(`Revert to "${targetVersion.message}"?`)) {
                    this._applyHistoricalVersion(assetId, idx);
                    this._closeAssetHistory(); // Close view after reverting
                }
            }
        });
    }

    /**
     * Closes the embedded history view and shows the grid again.
     */
    static _closeAssetHistory() {
        const assetsGrid = document.getElementById('assetsGrid');
        const view = document.getElementById('embeddedHistoryView');

        if (view) view.remove();

        // FIX: Clear inline style to let CSS handle Grid vs List view
        if (assetsGrid) assetsGrid.style.display = '';
    }

    /**
     * Internal helper to apply a specific historical version to an asset.
     * @param {string} assetId
     * @param {number} versionIndex
     */
    static _applyHistoricalVersion(assetId, versionIndex) {
        const asset = this._findById(assetId);
        if (
            !asset ||
            !asset.history ||
            versionIndex < 0 ||
            versionIndex >= asset.history.length
        ) {
            console.error("Invalid history index for revert.");
            return;
        }

        this._commitAssetVersion(
            assetId,
            `Auto-commit before reverting to V${versionIndex + 1}`,
        ); // Commit current state

        const targetVersion = asset.history[versionIndex];

        // Apply changes from targetVersion
        asset.name = targetVersion.name;
        asset.tags = [...targetVersion.tags];
        asset.folderId = targetVersion.folderId;
        if (asset.type === "material" && targetVersion.definition) {
            asset.definition = { ...targetVersion.definition };
            asset.references = [...(targetVersion.references || [])];
        }

        // Again, 'data' and 'thumbnail' are not reverted here for simplicity and storage reasons.

        this._saveToStorage();
        this.render();
        this.selectAsset(assetId, null, false, null); // Re-select to update UI
        if (typeof this.onAssetVersionRevert === "function")
            this.onAssetVersionRevert(assetId, targetVersion);
        console.log(
            `AssetsPanel: Reverted '${asset.name}' to version from ${new Date(targetVersion.timestamp).toLocaleString()}.`,
        );
    }

    // --- Asset Dependencies & Referencing ---

    /**
     * Detects asset references within a material definition.
     * Assumes texture paths (data URLs or asset IDs) within the material definition correspond to asset.data or asset.id.
     * This is primarily for *initial import* of a JSON that might have data URLs.
     * After import, `definition` will store asset IDs.
     * @param {object} materialDefinition
     * @returns {string[]} Array of asset IDs referenced.
     */
    static _detectMaterialReferences(materialDefinition) {
        const refs = new Set();
        const textureSlots = [
            "map",
            "normalMap",
            "roughnessMap",
            "metalnessMap",
            "emissiveMap",
            "displacementMap",
        ];

        for (const slot of textureSlots) {
            const textureRef = materialDefinition[slot];
            if (textureRef) {
                let referencedAsset;
                if (
                    typeof textureRef === "string" &&
                    textureRef.startsWith("data:image")
                ) {
                    // Try to find by data URL (legacy or initial import case)
                    referencedAsset = this.assets.find(
                        (a) => this._isTextureCompatibleAssetType(a.type) && a.data === textureRef,
                    );
                } else {
                    // Assume it's an asset ID
                    referencedAsset = this._findById(textureRef);
                }

                if (referencedAsset && this._isTextureCompatibleAssetType(referencedAsset.type)) {
                    refs.add(referencedAsset.id);
                }
            }
        }
        return Array.from(refs);
    }

    /**
     * Finds all assets that explicitly reference a given assetId.
     * This relies on the 'references' array in other assets.
     * @param {string} assetId The ID of the asset being searched for.
     * @returns {Array<object>} A list of assets that use this asset.
     */
    static _getAssetsUsing(assetId) {
        return this.assets.filter(
            (a) => a.id !== assetId && a.references && a.references.includes(assetId),
        );
        // Note: This does NOT track scene objects using an asset. That would require
        // a global scene graph traversal or a dedicated scene management system.
    }

    // --- Asset Packing/Distribution ---

    /**
     * Packs all assets currently in the panel (excluding built-ins) and their folder structure
     * into a single downloadable JSON archive.
     * @param {boolean} includeSceneObjects If true, attempts to serialize scene objects. (Not implemented here)
     */
    static async _packSceneAssets(includeSceneObjects = false) {
        // Collect all non-built-in assets
        const assetsToPack = this.assets
            .filter((a) => !a.isBuiltIn)
            .map((a) => {
                // When packing material, convert texture asset IDs back to data URLs for portability
                if (a.type === "material" && a.definition) {
                    const exportDef = { ...a.definition };
                    const textureSlots = [
                        "map",
                        "normalMap",
                        "roughnessMap",
                        "metalnessMap",
                        "emissiveMap",
                        "displacementMap",
                    ];
                    for (const slot of textureSlots) {
                        const textureAssetId = exportDef[slot];
                        const textureAsset = textureAssetId
                            ? this._findById(textureAssetId)
                            : null;
                        if (textureAsset && textureAsset.data) {
                            exportDef[slot] = textureAsset.data; // Use data URL for export
                        }
                    }
                    return { ...a, definition: exportDef, history: [] }; // Don't export history
                }
                return { ...a, history: [] }; // Don't export history for other types either
            });
        const folderData = this.folders;

        // Basic JSON export structure
        const exportData = {
            metadata: {
                generator: "AssetsPanel v6.0 Packager",
                version: "1.0",
                timestamp: new Date().toISOString(),
            },
            assets: assetsToPack,
            folders: folderData,
            // If includeSceneObjects was true, you'd add scene.toJSON() or similar here
            sceneData: includeSceneObjects ? null : null, // Placeholder for scene data
        };

        const jsonString = JSON.stringify(exportData, null, 2);
        const blob = new Blob([jsonString], { type: "application/json" });
        const url = URL.createObjectURL(blob);

        const a = document.createElement("a");
        a.href = url;
        a.download = `project_assets_package_${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        console.log(
            `AssetsPanel: Packed ${assetsToPack.length} assets and ${Object.keys(folderData).length} folders into a JSON package.`,
        );
        alert(`Exported asset package as 'project_assets_package_${Date.now()}.json'.
        (Note: For very large assets or full scene export, a ZIP archive solution would be more robust.)`);
    }

    // --- Smart Categories/Tags ---

    /**
     * Builds and renders a tag cloud in the toolbar.
     */
    static _buildTagCloud() {
        if (!this.dom.tagCloudContainer) return;

        const tagCounts = {};
        this.assets.forEach((asset) => {
            (asset.tags || []).forEach((tag) => {
                const lowerTag = tag.toLowerCase();
                tagCounts[lowerTag] = (tagCounts[lowerTag] || 0) + 1;
            });
        });

        let tagCloudHtml = "";
        const sortedTags = Object.keys(tagCounts).sort(
            (a, b) => tagCounts[b] - tagCounts[a],
        ); // Sort by count descending

        sortedTags.forEach((tag) => {
            if (tagCounts[tag] > 1) {
                // Only show tags that appear more than once
                tagCloudHtml += `<button class="tag-cloud-tag panel-btn mini-btn" data-tag="${tag}">${tag} (${tagCounts[tag]})</button>`;
            }
        });
        this.dom.tagCloudContainer.innerHTML = tagCloudHtml;
    }

    /**
     * Auto-tags an asset based on its filename and type.
     * @param {object} asset The asset object.
     */
    static _autoTagAsset(asset) {
        if (!asset.tags) asset.tags = [];
        const lowerName = asset.name.toLowerCase();

        // Type-based tags
        if (asset.type && !asset.tags.includes(asset.type))
            this._addTag(asset, asset.type);

        // Filename keyword tags (more granular)
        if (lowerName.includes("ground") || lowerName.includes("floor"))
            this._addTag(asset, "ground");
        if (lowerName.includes("wall") || lowerName.includes("building"))
            this._addTag(asset, "architecture");
        if (
            lowerName.includes("tree") ||
            lowerName.includes("bush") ||
            lowerName.includes("foliage")
        ) {
            this._addTag(asset, "nature");
            this._addTag(asset, "foliage");
        }
        if (lowerName.includes("rock") || lowerName.includes("stone")) {
            this._addTag(asset, "nature");
            this._addTag(asset, "rock");
        }
        if (lowerName.includes("water")) this._addTag(asset, "environment");
        if (
            lowerName.includes("metal") ||
            lowerName.includes("steel") ||
            lowerName.includes("iron")
        )
            this._addTag(asset, "metal");
        if (
            lowerName.includes("wood") ||
            lowerName.includes("timber") ||
            lowerName.includes("bark")
        )
            this._addTag(asset, "wood");
        if (lowerName.includes("fabric") || lowerName.includes("cloth"))
            this._addTag(asset, "fabric");
        if (lowerName.includes("glass")) this._addTag(asset, "glass");
        if (lowerName.includes("concrete") || lowerName.includes("cement"))
            this._addTag(asset, "concrete");
        if (lowerName.includes("road") || lowerName.includes("asphalt"))
            this._addTag(asset, "road");

        // Material/Texture specific tags
        if (lowerName.includes("normal") || lowerName.includes("nrm"))
            this._addTag(asset, "normal-map");
        if (
            lowerName.includes("albedo") ||
            lowerName.includes("basecolor") ||
            lowerName.includes("diffuse")
        )
            this._addTag(asset, "albedo");
        if (lowerName.includes("roughness") || lowerName.includes("gloss"))
            this._addTag(asset, "roughness");
        if (
            lowerName.includes("metalness") ||
            lowerName.includes("metallic") ||
            lowerName.includes("mtl")
        )
            this._addTag(asset, "metalness");
        if (lowerName.includes("emissive") || lowerName.includes("emit"))
            this._addTag(asset, "emissive");
        if (lowerName.includes("displacement") || lowerName.includes("disp"))
            this._addTag(asset, "displacement");
        if (lowerName.includes("height")) this._addTag(asset, "height-map");
        if (lowerName.includes("ao") || lowerName.includes("occlusion"))
            this._addTag(asset, "ao");

        // Remove duplicates and ensure tags are clean
        asset.tags = [
            ...new Set(asset.tags.map((tag) => tag.toLowerCase().trim())),
        ].filter(Boolean);
    }

    static _addTag(asset, tag) {
        if (!asset.tags.includes(tag)) {
            asset.tags.push(tag);
        }
    }

    // --- Multi-Asset Editing ---

    /**
     * Prompts the user to add tags to all currently selected assets.
     */
    static _promptMultiTag() {
        if (this.selectedIds.size === 0) {
            alert("No assets selected for multi-tagging.");
            return;
        }

        const tagsToAdd = prompt(
            `Add comma-separated tags to ${this.selectedIds.size} selected assets:`,
        );
        if (tagsToAdd) {
            const newTags = tagsToAdd
                .split(",")
                .map((tag) => tag.trim().toLowerCase())
                .filter((tag) => tag.length > 0);
            this.selectedIds.forEach((id) => {
                const asset = this._findById(id);
                if (asset && !asset.isBuiltIn) {
                    const currentTags = new Set(asset.tags);
                    newTags.forEach((tag) => currentTags.add(tag));
                    asset.tags = Array.from(currentTags);
                    this._commitAssetVersion(
                        asset.id,
                        `Multi-tagging: Added "${tagsToAdd}"`,
                    ); // NEW: Commit version
                }
            });
            this._saveToStorage();
            this.render(); // Re-render to update UI, possibly tag cloud
            this._buildTagCloud();
            alert(`Tags "${tagsToAdd}" added to ${this.selectedIds.size} assets.`);
        }
    }

    /**
     * Prompts the user to select a folder and moves all selected assets to it.
     */
    static _showMoveSelectedAssetsMenu() {
        if (this.selectedIds.size === 0) {
            alert("No assets selected to move.");
            return;
        }

        const folderNames = [{ id: null, name: "Root" }].concat(
            Object.values(this.folders).map((f) => ({ id: f.id, name: f.name })),
        );
        const sel = prompt(
            `Move ${this.selectedIds.size} assets to folder:\n` +
            folderNames.map((f, i) => `${i}: ${f.name}`).join("\n"),
            "0",
        );
        const idx = parseInt(sel);
        if (isNaN(idx) || !folderNames[idx]) return;

        const targetFolder = folderNames[idx];
        const movedCount = Array.from(this.selectedIds).reduce((count, assetId) => {
            const asset = this._findById(assetId);
            if (asset && !asset.isBuiltIn && asset.folderId !== targetFolder.id) {
                asset.folderId = targetFolder.id;
                this._commitAssetVersion(
                    asset.id,
                    `Moved to folder: ${targetFolder.name}`,
                ); // NEW: Commit version
                return count + 1;
            }
            return count;
        }, 0);

        this._saveToStorage();
        this.render();
        alert(`Moved ${movedCount} assets to "${targetFolder.name}".`);
    }

    // --- Prefab System (Basic integration) ---
    /**
     * Placeholder for creating a "prefab" from selected assets.
     * A real prefab system is complex, involving bundling multiple assets and scene relationships.
     * This example demonstrates adding a "Prefab" type asset.
     * @param {string} selectedAssetId (Optional, if creating from single asset context, not used here as it's multi-select)
     */
    static _createPrefab() {
        // Collect currently selected assets
        const assetsForPrefab = Array.from(this.selectedIds)
            .map((id) => this._findById(id))
            .filter(Boolean);

        if (assetsForPrefab.length === 0) {
            alert("Select one or more assets to create a prefab.");
            return;
        }

        const prefabName = prompt("Enter name for new Prefab:", "New Prefab");
        if (!prefabName) return;

        // Collect basic info of component assets for the prefab
        const componentReferences = assetsForPrefab.map((a) => ({
            id: a.id,
            name: a.name,
            type: a.type,
            // In a real system, you'd also capture relative positions, rotations, scales
            // of these components from the main scene if they are already placed.
            // For now, it's just a list of asset references.
        }));

        const id = `prefab_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        const prefabAsset = {
            id,
            name: prefabName,
            type: "prefab",
            data: JSON.stringify(componentReferences), // Store references as data (JSON string)
            thumbnail: this._svgIcon("prefab-create"), // Use a generic prefab icon
            isFavorite: false,
            isBuiltIn: false,
            folderId: this.openFolderId, // Or a designated 'Prefabs' folder
            tags: ["prefab", ...new Set(assetsForPrefab.flatMap((a) => a.tags))], // Inherit tags from components
        };

        this.assets.push(prefabAsset);
        this._commitAssetVersion(prefabAsset.id, "Initial Prefab Creation"); // NEW: Commit version
        this._saveToStorage();
        this.render();
        this._buildTagCloud(); // NEW: Rebuild tag cloud
        alert(
            `Prefab '${prefabName}' created with ${assetsForPrefab.length} components.`,
        );
        this.selectedIds.clear(); // Clear selection after creating prefab
        this.selectAsset(prefabAsset.id); // Select the new prefab
    }

    // ==================================================================
    // === NEW ASSET PANEL METHODS FOR SCRIPT MANAGEMENT (PUBLIC)     ===
    // ==================================================================

    /**
     * Adds a new script asset to the Assets Panel.
     * @param {string} name - The name of the script file (e.g., "MyScript.js").
     * @param {string} code - The source code of the script.
     * @param {string|null} folderId - The ID of the folder to add the script to, or null for root.
     * @returns {object|null} The newly created asset object, or null if creation failed (e.g., name conflict).
     */
}
for(const key of Reflect.ownKeys(SMAssetsPanelAdvancedFeaturesMixin)){
if(key==="length"||key==="name"||key==="prototype")continue;
const descriptor=Object.getOwnPropertyDescriptor(SMAssetsPanelAdvancedFeaturesMixin,key);
if(!descriptor)continue;
Object.defineProperty(AssetsPanel,key,descriptor);
}
global.__SMAssetsPanelLoadedModules=global.__SMAssetsPanelLoadedModules||[];
global.__SMAssetsPanelLoadedModules.push("AssetsPanelAdvancedFeatures");
})(window);
