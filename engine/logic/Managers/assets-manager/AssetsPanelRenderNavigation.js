// AssetsPanelRenderNavigation.js
// Grid render, breadcrumb, categories, folder tree/sidebar
// Extracted from AssetsPanel_FULL_9483_PBR_FIXED without rewriting method bodies.
(function(global){
"use strict";
const AssetsPanel=global.AssetsPanel;
if(!AssetsPanel){
throw new Error("[SMAssetsPanelRenderNavigationMixin] AssetsPanelCore must load first.");
}
class SMAssetsPanelRenderNavigationMixin {
    static render(searchQuery = "") {
        if (!this.dom.grid) return;
        this._renderBreadcrumbs();
        this._renderFolderSidebar();

        this.dom.grid.innerHTML = "";

        // 1. RENDER FOLDERS
        if (this.currentCategory === "project" && this.currentFilter === "all") {
            const subfolders = Object.values(this.folders)
                .filter(f => (f.parentId || null) === (this.openFolderId || null))
                .sort((a, b) => a.name.localeCompare(b.name));

            subfolders.forEach(folder => {
                const item = document.createElement("div");
                item.className = "asset-item folder-item";
                item.dataset.type = "folder";

                item.innerHTML = `
                <div class="asset-thumbnail">
                    <i class="fas fa-folder folder-icon-large"></i>
                </div>
                <div class="asset-info">
                    <div class="asset-name">${folder.name}</div>
                    <div class="asset-meta">Folder</div>
                </div>
            `;

                item.ondblclick = () => { this.openFolderId = folder.id; this.render(); };
                item.onclick = () => this.selectAsset(null, item);
                item.oncontextmenu = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this._showFolderContextMenu(e, folder.id);
                };
                this.dom.grid.appendChild(item);
            });
        }

        // 2. RENDER ASSETS
        let assetsToRender = this._getFilteredAssets();
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            assetsToRender = assetsToRender.filter(a => a.name.toLowerCase().includes(q));
        }

        assetsToRender.forEach(asset => {
            const item = document.createElement("div");
            const isSelected = this.selectedIds.has(asset.id);
            item.className = `asset-item ${isSelected ? 'selected' : ''}`;
            item.dataset.id = asset.id;
            item.dataset.type = asset.type; // Triggers the color bar in CSS
            item.draggable = true;

            const thumb = this._getThumbnailMarkup(asset);

            item.innerHTML = `
            <div class="asset-thumbnail">${thumb}</div>
            <div class="asset-info">
                <div class="asset-name">${asset.name}</div>
                <div class="asset-meta">${this._getAssetDisplayMeta?.(asset) || asset.type}</div>
            </div>
            ${asset.isFavorite ? `<div class="asset-fav-icon"><i class="fas fa-star"></i></div>` : ''}
        `;

            item.onclick = (e) => this.selectAsset(asset.id, item, e.ctrlKey, e);
            item.ondblclick = () => this._addToScene(asset.id);
            item.ondragstart = (e) => {
                e.dataTransfer.setData("application/json", JSON.stringify({ assetId: asset.id, assetType: asset.type }));
            };
            item.oncontextmenu = (e) => {
                e.preventDefault();
                this._showContextMenu(e, asset.id);
            };

            this.dom.grid.appendChild(item);
        });

        // Update the status bar count
        const countEl = document.getElementById("sb-count");
        if (countEl) countEl.innerHTML = `<strong>${this.dom.grid.children.length}</strong> items`;
    }


    static _showEmptyGridContextMenu(event) {
        const parentId = this.openFolderId || null;
        const insideGame = !!this._ctxOwningGameProject(parentId);

        const items = [
            {
                label: "New Folder",
                icon: "plus",
                action: () => this.createFolder?.("New Folder", parentId)
            },
            {
                label: "New Game Project…",
                icon: "game",
                disabled:
                    insideGame ||
                    typeof this.createGameProject !== "function",
                action: () => this.createGameProject?.(null, parentId)
            },
            {
                label: "Import",
                icon: "import",
                children: [
                    {
                        label: "Import Asset(s)…",
                        icon: "import",
                        action: () => {
                            this._refreshDOMCache?.();
                            if (this.dom?.uploadInput) this.dom.uploadInput.click();
                            else this.showUploadZone?.();
                        }
                    },
                    {
                        label: "Import Folder…",
                        icon: "folder",
                        action: () => {
                            this._refreshDOMCache?.();
                            if (this.dom?.uploadFolderInput) this.dom.uploadFolderInput.click();
                            else this.showUploadZone?.();
                        }
                    }
                ]
            },
            { separator: true },
            {
                label: "Refresh Assets",
                icon: "refresh",
                action: () => this.refreshAssets?.()
            },
            {
                label: "Project",
                icon: "project",
                children: [
                    {
                        label: "Pack All Project Assets",
                        icon: "project",
                        action: () => this._packSceneAssets?.()
                    },
                    {
                        label: "Save Asset Library to Device…",
                        icon: "export",
                        disabled: typeof this.saveAssetsToDeviceFolder !== "function",
                        action: () => this.saveAssetsToDeviceFolder?.()
                    },
                    {
                        label: "Sync Google Drive",
                        icon: "refresh",
                        disabled: typeof this.syncGoogleDrive !== "function",
                        action: () => this.syncGoogleDrive?.()
                    }
                ]
            }
        ];

        return this._openNativeContextMenu(event, {
            owner: "assets-grid",
            title:
                parentId && this.folders?.[parentId]
                    ? this.folders[parentId].name
                    : "Project Assets",
            badge: "CONTENT",
            items
        });
    }

    // Example recursive folder builder
    // --- FIXED: Recursive Folder Node Builder ---
    static _buildFolderNode(folderId, depth = 0) {
        const folder = this.folders[folderId];
        if (!folder) return "";

        const isExpanded = this.expandedFolders.has(folderId);
        const isActive = this.openFolderId === folderId;

        let html = `
        <div class="folder-node-wrapper depth-${depth}" style="--depth: ${depth}">
            <div class="category-item folder-tree-item ${isActive ? 'active' : ''}" 
                 data-folder-id="${folderId}" 
                 onclick="AssetsPanel.openFolder('${folderId}')">
                
                <span class="expand-toggle ${isExpanded ? 'expanded' : ''}" 
                      onclick="event.stopPropagation(); AssetsPanel.toggleFolder('${folderId}')">
                    ${this._svgIcon(isExpanded ? "arrow-down" : "arrow-right")}
                </span>
                
                <span class="category-icon">${this._svgIcon("folder-icon-html")}</span>
                <span class="folder-name">${folder.name}</span>
            </div>
        </div>`;

        if (isExpanded && folder.children) {
            folder.children.forEach(childId => {
                html += this._buildFolderNode(childId, depth + 1);
            });
        }
        return html;
    }

    // --- IMPROVED: Unified Folder Opening ---
    static openFolder(folderId) {
        this.openFolderId = folderId;
        this.currentCategory = "project";

        // Ensure parent folders are expanded so the sidebar matches the grid
        let current = this.folders[folderId];
        while (current && current.parentId) {
            this.expandedFolders.add(current.parentId);
            current = this.folders[current.parentId];
        }

        this.selectedIds.clear();
        this.render();
    }

    // --- IMPROVED: Professional Grid Rendering ---
    /*static render(searchQuery = "") {
        if (!this.dom.grid) return;
        this._renderBreadcrumbs();
        this._renderFolderSidebar();

        this.dom.grid.innerHTML = "";

        // 1. RENDER FOLDERS (Grid View)
        if (this.currentCategory === "project" && this.currentFilter === "all") {
            const subfolders = Object.values(this.folders)
                .filter(f => (f.parentId || null) === (this.openFolderId || null))
                .sort((a, b) => a.name.localeCompare(b.name));

            subfolders.forEach(folder => {
                const item = document.createElement("div");
                item.className = "asset-item folder-item";
                item.innerHTML = `
                    <div class="asset-thumbnail folder-thumb">${this._svgIcon("folder-icon-html")}</div>
                    <div class="asset-name">${folder.name}</div>
                    <div class="asset-meta">Folder</div>
                `;
                item.ondblclick = () => this.openFolder(folder.id);
                item.onclick = () => {
                    document.querySelectorAll('.asset-item').forEach(el => el.classList.remove('selected'));
                    item.classList.add('selected');
                };
                item.oncontextmenu = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this._showFolderContextMenu(e, folder.id);
                };
                this.dom.grid.appendChild(item);
            });
        }

        // 2. RENDER ASSETS
        let assetsToRender = this._getFilteredAssets();

        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            assetsToRender = assetsToRender.filter(a =>
                (a.name || "").toLowerCase().includes(q) || (a.tags || []).some(t => (t || "").toLowerCase().includes(q))
            );
        }

        assetsToRender.forEach(asset => {
            const item = document.createElement("div");
            // Highlight border by type: texture=orange, material=green, model=blue
            item.className = `asset-item type-${asset.type} ${this.selectedIds.has(asset.id) ? 'selected' : ''}`;
            item.dataset.id = asset.id;
            item.draggable = true;

            const thumb = this._getThumbnailMarkup(asset);

            item.innerHTML = `
                <div class="asset-thumbnail">${thumb}</div>
                <div class="asset-name">${asset.name}</div>
                <div class="asset-meta">${asset.type.toUpperCase()}</div>
                ${asset.isFavorite ? `<div class="asset-fav-icon">${this._svgIcon("star")}</div>` : ''}
            `;

            item.onclick = (e) => this.selectAsset(asset.id, item, e.ctrlKey, e);
            item.ondragstart = (e) => {
                e.dataTransfer.setData("application/json", JSON.stringify({ assetId: asset.id, assetType: asset.type }));
            };
            item.ondblclick = () => this._addToScene(asset.id);

            this.dom.grid.appendChild(item);
        });
    }*/

    static _getFilteredAssets() {
        let assetsToRender = [];

        switch (this.currentCategory) {
            case "project":
                assetsToRender = this.assets.filter((a) =>
                    this.openFolderId ? a.folderId === this.openFolderId : !a.folderId,
                );
                break;
            case "favorites":
                assetsToRender = this.assets.filter((a) => a.isFavorite);
                break;
            case "primitives":
                assetsToRender = this._getPrimitiveAssets();
                break;
            case "lights":
                assetsToRender = this._getLightAssets();
                break;
            case "scripts":
                assetsToRender = this.assets.filter((a) => a.type === "code");
                break;
            case "prefabs":
                assetsToRender = this.assets.filter((a) => a.type === "prefab");
                break;
            default:
                assetsToRender = this.assets;
                break;
        }

        if (this.currentFilter !== "all") {
            if (this.currentFilter === "primitive") {
                assetsToRender = this._getPrimitiveAssets();
            } else if (this.currentFilter === "light") {
                assetsToRender = this._getLightAssets();
            } else {
                assetsToRender = assetsToRender.filter((a) => a.type === this.currentFilter);
            }
        }

        return assetsToRender;
    }

    // Toggle function
    static toggleFolder(folderId) {
        const isExpanded = this.expandedFolders.has(folderId);
        if (isExpanded) {
            this.expandedFolders.delete(folderId);
        } else {
            this.expandedFolders.add(folderId);
        }
        localStorage.setItem(
            "assetsPanel_expandedFolders",
            JSON.stringify(Array.from(this.expandedFolders)),
        ); // Persist
        this._buildCategoriesSidebar(); // Rebuild sidebar
        this.render(); // Optional: refresh grid if needed
    }

    static _buildCategoriesSidebar() {
        let html =
            '<div class="category-item root active" onclick="AssetsPanel.selectCategory(\'project\', this)">Project Assets</div>'; // Root
        html += this._buildFolderNode("root_folder_id_or_null"); // Assume root is null or a virtual ID
        this.dom.categoriesContainer.innerHTML = html;
    }
    // Render Breadcrumbs (unchanged)
    static _renderBreadcrumbs() {
        if (!this.dom.assetsBreadcrumbs) return;
        this.dom.assetsBreadcrumbs.innerHTML = "";

        const path = [];
        let currentId = this.openFolderId;

        while (currentId !== null) {
            const folder = this.folders[currentId];
            if (folder) {
                path.unshift({ id: folder.id, name: folder.name });
                currentId = folder.parentId;
            } else {
                console.warn("AssetsPanel: Invalid folder ID in hierarchy:", currentId);
                break;
            }
        }

        path.unshift({ id: null, name: "Project Assets" });

        path.forEach((segment, index) => {
            const item = document.createElement("span");
            item.className = `breadcrumb-item ${segment.id === this.openFolderId ? "active" : ""}`;
            item.textContent = segment.name;
            item.onclick = () => {
                this.openFolderId = segment.id;
                this.currentCategory = "project";
                this.render();
            };
            this.dom.assetsBreadcrumbs.appendChild(item);

            if (index < path.length - 1) {
                const separator = document.createElement("span");
                separator.className = "breadcrumb-separator";
                separator.innerHTML = this._svgIcon("breadcrumbs");
                this.dom.assetsBreadcrumbs.appendChild(separator);
            }
        });
    }

    // _renderFolderSidebar - UPDATED FOR CONNECTOR LINES (unchanged)
    static _renderFolderSidebar() {
        const container = document.getElementById("assetsCategoriesPanel");
        if (!container) return;
        container.innerHTML = "";

        // --- 1. FAVORITES SECTION ---
        // Added "favorites" as the 3rd argument (sectionId)
        this._addTreeSectionHeader(container, "Favorites", "favorites");

        if (this.expandedSections.has("favorites")) {
            const favRoot = document.createElement('div');
            favRoot.className = "tree-node-container";
            // (Optional: Logic to render favorite folders here)
            container.appendChild(favRoot);
        }

        // --- 2. PROJECT CONTENT SECTION ---
        // Added "project" as the 3rd argument (sectionId)
        this._addTreeSectionHeader(container, "Project Content", "project");

        // FIX: Wrap the tree rendering in a check for the "project" section state
        if (this.expandedSections.has("project")) {
            const treeRoot = document.createElement('div');
            treeRoot.className = "tree-node-container";
            container.appendChild(treeRoot);

            /**
             * Recursive function to render levels
             */
            const renderLevel = (parentId, depth = 0, parentHasMore = []) => {
                const siblings = Object.values(this.folders)
                    .filter(f => (f.parentId || null) === (parentId || null))
                    .sort((a, b) => a.name.localeCompare(b.name));

                siblings.forEach((folder, index) => {
                    const isLast = index === siblings.length - 1;
                    const hasChildren = Object.values(this.folders).some(f => f.parentId === folder.id);
                    const isExpanded = this.expandedFolders.has(folder.id);
                    const isActive = this.openFolderId === folder.id;

                    const row = document.createElement('div');
                    row.className = `tree-row ${isActive ? 'active' : ''} ${isLast ? 'is-last' : ''}`;

                    // 1. Create Indent Guides
                    for (let i = 0; i < depth; i++) {
                        const guide = document.createElement('div');
                        const needsLine = parentHasMore[i] === true;
                        guide.className = `indent-guide ${needsLine ? 'line' : ''}`;
                        row.appendChild(guide);
                    }

                    // 2. Add the "L" junction
                    const junction = document.createElement('div');
                    junction.className = `indent-guide line current-indent`;
                    row.appendChild(junction);

                    // 3. Folder Content
                    row.innerHTML += `
                    <div class="tree-arrow ${isExpanded ? 'expanded' : ''}" 
                         style="visibility: ${hasChildren ? 'visible' : 'hidden'}">
                        <i class="fas fa-caret-right"></i>
                    </div>
                    <div class="tree-folder-icon">
                        <i class="fas ${isExpanded ? 'fa-folder-open' : 'fa-folder'}"></i>
                    </div>
                    <div class="tree-label">${folder.name}</div>
                `;

                    // Interactions
                    row.onclick = () => {
                        this.openFolderId = folder.id;
                        this.currentCategory = "project";
                        this.render();
                    };

                    row.oncontextmenu = (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        this._showFolderContextMenu(e, folder.id);
                    };

                    const arrow = row.querySelector('.tree-arrow');
                    arrow.onclick = (e) => {
                        e.stopPropagation();
                        if (this.expandedFolders.has(folder.id)) this.expandedFolders.delete(folder.id);
                        else this.expandedFolders.add(folder.id);
                        this._renderFolderSidebar(); // Refresh the sidebar
                    };

                    treeRoot.appendChild(row);

                    // 4. Recurse children
                    if (isExpanded) {
                        renderLevel(folder.id, depth + 1, [...parentHasMore, !isLast]);
                    }
                });
            };

            // Start rendering from the root
            renderLevel(null, 0, []);
        }
    }

    static expandedSections = new Set(["favorites", "project"]);

    static _addTreeSectionHeader(container, title, sectionId) {
        const isOpen = this.expandedSections.has(sectionId);

        const header = document.createElement('div');
        header.className = 'tree-section-header';
        header.innerHTML = `
        <i class="fas fa-caret-right tree-arrow ${isOpen ? 'expanded' : ''}" style="margin-right:8px;"></i>
        <span>${title}</span>
        <i class="fas fa-search"></i>
    `;

        // Toggle Section on Click
        header.onclick = (e) => {
            e.stopPropagation();
            if (this.expandedSections.has(sectionId)) {
                this.expandedSections.delete(sectionId);
            } else {
                this.expandedSections.add(sectionId);
            }
            // Only re-render the sidebar to keep it fast
            this._renderFolderSidebar();
        };

        container.appendChild(header);
    }

    // Helper for the top-level items
    static _addSidebarRootItem(container, label, iconType, category) {
        const isActive = this.currentCategory === category;
        const row = document.createElement('div');
        row.className = `tree-row ${isActive ? 'active' : ''}`;
        row.style.setProperty('--depth', 0);
        row.innerHTML = `
        <div class="tree-arrow" style="visibility:hidden"><i class="fas fa-caret-right"></i></div>
        <div class="tree-icon" style="color: #666;"><i class="fas fa-${iconType === 'folder' ? 'folder-open' : 'cube'}"></i></div>
        <div class="tree-label">${label}</div>
    `;
        row.onclick = () => {
            if (category) {
                this.selectCategory(category, row);
            } else {
                this.openFolderId = null;
                this.currentCategory = "project";
                this.render();
            }
        };
        container.appendChild(row);
    }
    // ==================================================================
    // NATIVE ASSETSPANEL CONTEXT MENU SYSTEM v2
    // Compact root menus + click/touch submenus.
    // Uses the existing persistent #contextMenu element and coordinates with
    // window.SMContextMenu when it exists.
    // ==================================================================

}
for(const key of Reflect.ownKeys(SMAssetsPanelRenderNavigationMixin)){
if(key==="length"||key==="name"||key==="prototype")continue;
const descriptor=Object.getOwnPropertyDescriptor(SMAssetsPanelRenderNavigationMixin,key);
if(!descriptor)continue;
Object.defineProperty(AssetsPanel,key,descriptor);
}
global.__SMAssetsPanelLoadedModules=global.__SMAssetsPanelLoadedModules||[];
global.__SMAssetsPanelLoadedModules.push("AssetsPanelRenderNavigation");
})(window);
