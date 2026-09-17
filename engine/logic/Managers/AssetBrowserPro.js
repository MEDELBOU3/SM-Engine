// ============================================================================
// engine/logic/Managers/AssetBrowserPro.js
// Professional UX layer for the existing AssetsPanel class.
// Load AFTER the existing AssetsPanel logic file and BEFORE index.js.
// ============================================================================
(function () {
    const Pro = {
        installed: false,
        initialized: false,
        panel: null,
        searchQuery: "",
        sortMode: localStorage.getItem("sm_asset_browser_sort") || "name-asc",
        viewMode: localStorage.getItem("sm_asset_browser_view") || "grid",
        backStack: [],
        forwardStack: [],
        lastFolderId: undefined,
        navigatingHistory: false,

        install() {
            const AP = window.AssetsPanel;
            if (!AP || this.installed) return false;

            this.installed = true;

            const originalInit = AP.init;
            AP.init = function (...args) {
                window.AssetPanel?.init?.();
                const result = originalInit.apply(this, args);
                Pro.afterCoreInit();
                return result;
            };

            const originalRender = AP.render;
            AP.render = function (searchQuery) {
                Pro._captureNavigation(this);

                if (arguments.length > 0) {
                    Pro.searchQuery = String(searchQuery || "").trim();
                } else {
                    const input = document.getElementById("assetSearchInput");
                    if (input) Pro.searchQuery = input.value.trim();
                }

                const result = originalRender.call(this, "");
                Pro.decorate();
                return result;
            };

            const originalSelect = AP.selectAsset;
            AP.selectAsset = function (...args) {
                const result = originalSelect.apply(this, args);
                Pro.updateStatus();
                return result;
            };

            const originalFilter = AP.filterByType;
            AP.filterByType = function (...args) {
                const result = originalFilter.apply(this, args);
                Pro.updateFilterState();
                return result;
            };

            if (AP.dom?.panel) this.afterCoreInit();
            return true;
        },

        afterCoreInit() {
            if (this.initialized) {
                this.decorate();
                return;
            }

            const AP = window.AssetsPanel;
            const panel = AP?.dom?.panel || document.getElementById("assetsPanel");
            if (!AP || !panel) return;

            this.panel = panel;
            this.initialized = true;
            this.lastFolderId = AP.openFolderId ?? null;

            AP.dom.searchBox = panel.querySelector("#assetSearchInput");
            AP.dom.filterButtons = panel.querySelectorAll(".filter-btn");
            AP.dom.categoriesContainer = panel.querySelector("#assetsCategoriesPanel");
            AP.dom.gridPane = panel.querySelector(".assets-grid-container");
            AP.dom.propertiesPanel = panel.querySelector(".assets-properties");
            AP.dom.thumbnailSizeSlider = panel.querySelector("#thumbnailSizeSlider");
            AP.dom.assetsBreadcrumbs = panel.querySelector("#assetsBreadcrumbs");
            AP.dom.assetPreviewContainer = panel.querySelector("#assetPreviewContainer");
            AP.dom.assetPreviewCanvas = panel.querySelector("#assetPreviewCanvas");

            if (AP.previewRenderer) {
                AP.previewRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
                if ("outputColorSpace" in AP.previewRenderer && THREE?.SRGBColorSpace) {
                    AP.previewRenderer.outputColorSpace = THREE.SRGBColorSpace;
                }
            }

            this.bindControls();
            this.applyViewMode(this.viewMode, false);

            const sortSelect = document.getElementById("assetSortSelect");
            if (sortSelect) sortSelect.value = this.sortMode;

            this.decorate();
            console.log("[AssetBrowserPro] Professional UX layer initialized.");
        },

        bindControls() {
            const AP = window.AssetsPanel;
            if (!AP || !this.panel) return;

            const bind = (id, handler) => {
                const element = document.getElementById(id);
                if (!element || element.dataset.abpBound) return;
                element.dataset.abpBound = "1";
                element.addEventListener("click", handler);
            };

            bind("cbNavBack", () => this.goBack());
            bind("cbNavForward", () => this.goForward());
            bind("cbNavUp", () => this.goUp());
            bind("cbNavRoot", () => this.goRoot());
            bind("cbToggleSources", () => this.toggleSources());
            bind("cbToggleDetails", () => this.toggleDetails());
            bind("cbCollapseDetails", () => this.toggleDetails());
            bind("cbCloseBrowser", () => this.closeBrowser());
            bind("cbNewFolderBtn", () => this.newFolder());
            bind("cbSaveLibraryDeviceBtn", () => AP.saveAssetsToDeviceFolder?.());
            bind("cbPackProjectBtn", () => AP._packSceneAssets?.());
            bind("cbClearSearch", () => this.clearSearch());

            const sort = document.getElementById("assetSortSelect");
            if (sort && !sort.dataset.abpBound) {
                sort.dataset.abpBound = "1";
                sort.addEventListener("change", () => {
                    this.sortMode = sort.value;
                    localStorage.setItem("sm_asset_browser_sort", this.sortMode);
                    this.decorateGrid();
                });
            }

            this.panel.querySelectorAll(".view-mode-btn").forEach((button) => {
                if (button.dataset.abpBound) return;
                button.dataset.abpBound = "1";
                button.addEventListener("click", () => {
                    this.applyViewMode(button.dataset.mode || "grid");
                });
            });

            const search = document.getElementById("assetSearchInput");
            if (search && !search.dataset.abpKeyBound) {
                search.dataset.abpKeyBound = "1";
                search.addEventListener("keydown", (event) => {
                    if (event.key === "Escape") {
                        event.preventDefault();
                        this.clearSearch();
                        search.blur();
                    }
                });
            }

            if (!document.documentElement.dataset.abpKeyboardBound) {
                document.documentElement.dataset.abpKeyboardBound = "1";
                document.addEventListener("keydown", (event) => {
                    const active = this.panel?.classList.contains("visible") || this.panel?.offsetParent !== null;
                    if (!active) return;

                    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
                        event.preventDefault();
                        document.getElementById("assetSearchInput")?.focus();
                        document.getElementById("assetSearchInput")?.select();
                    }

                    if (event.altKey && event.key === "ArrowLeft") {
                        event.preventDefault();
                        this.goBack();
                    }

                    if (event.altKey && event.key === "ArrowRight") {
                        event.preventDefault();
                        this.goForward();
                    }

                    if (event.altKey && event.key === "ArrowUp") {
                        event.preventDefault();
                        this.goUp();
                    }

                    if (event.key === "F2" && window.AssetsPanel?.selectedIds?.size === 1) {
                        event.preventDefault();
                        window.AssetsPanel.contextAssetId = Array.from(window.AssetsPanel.selectedIds)[0];
                        window.AssetsPanel.renameAsset?.();
                    }

                    // Ctrl+Shift+N — New Folder (matches UE5 shortcut)
                    if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "n") {
                        event.preventDefault();
                        this.newFolder();
                    }

                    // Ctrl+Shift+S — Save Asset Library to Device
                    if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "s") {
                        event.preventDefault();
                        window.AssetsPanel?.saveAssetsToDeviceFolder?.();
                    }

                    // Delete key — delete selected assets (if focus is inside panel)
                    if (event.key === "Delete" && window.AssetsPanel?.selectedIds?.size > 0) {
                        const target = event.target;
                        const insidePanel = this.panel?.contains(target);
                        const isInput = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA";
                        if (insidePanel && !isInput) {
                            event.preventDefault();
                            const ids = Array.from(window.AssetsPanel.selectedIds);
                            if (confirm(`Delete ${ids.length} selected asset(s)?`)) {
                                ids.forEach(id => window.AssetsPanel.deleteAsset?.(id));
                            }
                        }
                    }
                });
            }
        },

        decorate() {
            if (!this.initialized) return;
            this.decorateSidebar();
            this.decorateGrid();
            this.updateFilterState();
            this.updateStatus();
            this.updateNavigationButtons();
            this.updateFolderHeading();
        },

        decorateSidebar() {
            const AP = window.AssetsPanel;
            const container = document.getElementById("assetsCategoriesPanel");
            if (!AP || !container) return;

            if (!container.querySelector(".abp-quick-sources")) {
                const quick = document.createElement("div");
                quick.className = "abp-quick-sources";
                quick.innerHTML = `
                    <button data-category="project"><i class="fas fa-folder"></i><span>All Content</span></button>
                    <button data-category="favorites"><i class="fas fa-star"></i><span>Favorites</span></button>
                    <button data-category="scripts"><i class="fas fa-code"></i><span>Scripts</span></button>
                    <button data-category="prefabs"><i class="fas fa-cubes"></i><span>Prefabs</span></button>
                    <button data-category="primitives"><i class="fas fa-shapes"></i><span>Primitives</span></button>
                    <button data-category="lights"><i class="fas fa-lightbulb"></i><span>Lights</span></button>
                `;

                quick.querySelectorAll("button").forEach((button) => {
                    button.addEventListener("click", () => {
                        const category = button.dataset.category;
                        if (category === "project") {
                            AP.openFolderId = null;
                            AP.currentCategory = "project";
                            AP.currentFilter = "all";
                            this._syncFilterButton("all");
                            AP.render();
                            return;
                        }
                        AP.currentCategory = category;
                        AP.currentFilter = "all";
                        this._syncFilterButton("all");
                        AP.render();
                    });
                });

                container.prepend(quick);
            }

            container.querySelectorAll(".abp-quick-sources button").forEach((button) => {
                button.classList.toggle("active", button.dataset.category === AP.currentCategory);
            });
        },

        decorateGrid() {
            const AP = window.AssetsPanel;
            const grid = document.getElementById("assetsGrid");
            if (!AP || !grid) return;

            this.applyViewMode(this.viewMode, false);

            const query = this.searchQuery.toLowerCase();
            const nodes = Array.from(grid.querySelectorAll(":scope > .asset-item"));

            nodes.forEach((node) => {
                let haystack = node.textContent || "";
                const id = node.dataset.id;

                if (id) {
                    const asset = AP._findById?.(id)
                        || AP._getPrimitiveAssets?.().find((a) => a.id === id)
                        || AP._getLightAssets?.().find((a) => a.id === id);

                    if (asset) {
                        haystack += " " + (asset.type || "");
                        haystack += " " + (asset.tags || []).join(" ");
                    }
                }

                node.hidden = !!query && !haystack.toLowerCase().includes(query);
            });

            const visibleNodes = nodes.filter((node) => !node.hidden);
            const folderNodes = visibleNodes.filter((node) => node.classList.contains("folder-item"));
            const assetNodes = visibleNodes.filter((node) => !node.classList.contains("folder-item"));

            const assetForNode = (node) => {
                const id = node.dataset.id;
                return AP._findById?.(id)
                    || AP._getPrimitiveAssets?.().find((a) => a.id === id)
                    || AP._getLightAssets?.().find((a) => a.id === id)
                    || null;
            };

            assetNodes.sort((a, b) => {
                const aa = assetForNode(a);
                const bb = assetForNode(b);
                const an = (aa?.name || a.textContent || "").toLowerCase();
                const bn = (bb?.name || b.textContent || "").toLowerCase();

                if (this.sortMode === "name-desc") return bn.localeCompare(an);
                if (this.sortMode === "type") {
                    const typeDiff = String(aa?.type || "").localeCompare(String(bb?.type || ""));
                    return typeDiff || an.localeCompare(bn);
                }
                if (this.sortMode === "favorite") {
                    const favDiff = Number(!!bb?.isFavorite) - Number(!!aa?.isFavorite);
                    return favDiff || an.localeCompare(bn);
                }
                return an.localeCompare(bn);
            });

            [...folderNodes, ...assetNodes].forEach((node) => grid.appendChild(node));

            let empty = grid.querySelector(".abp-empty-state");
            const visibleCount = nodes.filter((node) => !node.hidden).length;

            if (visibleCount === 0) {
                if (!empty) {
                    empty = document.createElement("div");
                    empty.className = "abp-empty-state";
                    grid.appendChild(empty);
                }
                empty.innerHTML = query
                    ? `<i class="fas fa-search"></i><strong>No matching assets</strong><span>Try another name, type or tag.</span>`
                    : `<i class="fas fa-folder-open"></i><strong>This folder is empty</strong><span>Import an asset or create a subfolder.</span>`;
            } else {
                empty?.remove();
            }

            const visibleLabel = document.getElementById("cbVisibleCount");
            if (visibleLabel) visibleLabel.textContent = `${visibleCount} item${visibleCount === 1 ? "" : "s"}`;
        },

        updateStatus() {
            const AP = window.AssetsPanel;
            if (!AP) return;

            const grid = document.getElementById("assetsGrid");
            const visible = Array.from(grid?.querySelectorAll(":scope > .asset-item") || []).filter((node) => !node.hidden);
            const selectedCount = AP.selectedIds?.size || 0;

            const count = document.getElementById("sb-count");
            if (count) count.innerHTML = `<strong>${visible.length}</strong> items`;

            const selected = document.getElementById("sb-sel");
            if (selected) {
                selected.style.display = selectedCount ? "" : "none";
                selected.innerHTML = selectedCount
                    ? `<i class="fas fa-mouse-pointer"></i><strong>${selectedCount}</strong> selected`
                    : "";
            }

            const typeCounts = {};
            AP.assets?.forEach((asset) => {
                if (asset?.isBuiltIn) return;
                const type = asset.type || "other";
                typeCounts[type] = (typeCounts[type] || 0) + 1;
            });

            const types = document.getElementById("sb-types");
            if (types) {
                const pieces = [
                    typeCounts.model ? `${typeCounts.model} meshes` : "",
                    typeCounts.texture ? `${typeCounts.texture} textures` : "",
                    typeCounts.material ? `${typeCounts.material} materials` : ""
                ].filter(Boolean);
                types.textContent = pieces.join(" · ");
            }

            const path = document.getElementById("sb-path");
            if (path) path.textContent = this.getFolderPath();
        },

        updateFilterState() {
            const AP = window.AssetsPanel;
            if (!AP) return;
            this.panel?.querySelectorAll(".filter-btn").forEach((button) => {
                button.classList.toggle("active", button.dataset.type === AP.currentFilter);
            });
        },

        updateFolderHeading() {
            const AP = window.AssetsPanel;
            const title = document.getElementById("cbFolderTitle");
            const subtitle = document.getElementById("cbFolderSubtitle");
            if (!AP || !title || !subtitle) return;

            const folder = AP.openFolderId ? AP.folders?.[AP.openFolderId] : null;
            if (AP.currentCategory !== "project") {
                title.textContent = AP.currentCategory.charAt(0).toUpperCase() + AP.currentCategory.slice(1);
                subtitle.textContent = "Virtual asset collection";
                return;
            }

            title.textContent = folder?.name || "Content";
            subtitle.textContent = folder ? this.getFolderPath() : "Project asset root";
        },

        _captureNavigation(AP) {
            const current = AP.openFolderId ?? null;

            if (this.lastFolderId === undefined) {
                this.lastFolderId = current;
                return;
            }

            if (current === this.lastFolderId) return;

            if (!this.navigatingHistory) {
                this.backStack.push(this.lastFolderId);
                if (this.backStack.length > 40) this.backStack.shift();
                this.forwardStack.length = 0;
            }

            this.lastFolderId = current;
        },

        goBack() {
            const AP = window.AssetsPanel;
            if (!AP || !this.backStack.length) return;

            const target = this.backStack.pop();
            this.forwardStack.push(AP.openFolderId ?? null);
            this._navigateTo(target);
        },

        goForward() {
            const AP = window.AssetsPanel;
            if (!AP || !this.forwardStack.length) return;

            const target = this.forwardStack.pop();
            this.backStack.push(AP.openFolderId ?? null);
            this._navigateTo(target);
        },

        goUp() {
            const AP = window.AssetsPanel;
            if (!AP || AP.currentCategory !== "project") {
                this.goRoot();
                return;
            }

            const current = AP.openFolderId ? AP.folders?.[AP.openFolderId] : null;
            const target = current?.parentId || null;

            if (target === (AP.openFolderId ?? null)) return;
            AP.openFolderId = target;
            AP.currentCategory = "project";
            AP.render();
        },

        goRoot() {
            const AP = window.AssetsPanel;
            if (!AP) return;
            AP.openFolderId = null;
            AP.currentCategory = "project";
            AP.currentFilter = "all";
            this._syncFilterButton("all");
            AP.render();
        },

        _navigateTo(folderId) {
            const AP = window.AssetsPanel;
            if (!AP) return;

            this.navigatingHistory = true;
            AP.openFolderId = folderId ?? null;
            AP.currentCategory = "project";
            AP.render();
            this.lastFolderId = AP.openFolderId ?? null;
            this.navigatingHistory = false;
        },

        updateNavigationButtons() {
            const AP = window.AssetsPanel;
            const back = document.getElementById("cbNavBack");
            const forward = document.getElementById("cbNavForward");
            const up = document.getElementById("cbNavUp");

            if (back) back.disabled = this.backStack.length === 0;
            if (forward) forward.disabled = this.forwardStack.length === 0;

            if (up) {
                up.disabled = AP?.currentCategory === "project" && !AP?.openFolderId;
            }
        },

        getFolderPath() {
            const AP = window.AssetsPanel;
            if (!AP || AP.currentCategory !== "project") return AP?.currentCategory || "Content";

            const path = ["Content"];
            let id = AP.openFolderId;

            while (id) {
                const folder = AP.folders?.[id];
                if (!folder) break;
                path.splice(1, 0, folder.name);
                id = folder.parentId;
            }

            return path.join(" / ");
        },

        applyViewMode(mode, persist = true) {
            const normalized = mode === "list" ? "list" : "grid";
            this.viewMode = normalized;

            const grid = document.getElementById("assetsGrid");
            grid?.classList.toggle("list-view", normalized === "list");

            this.panel?.querySelectorAll(".view-mode-btn").forEach((button) => {
                button.classList.toggle("active", button.dataset.mode === normalized);
            });

            if (persist) localStorage.setItem("sm_asset_browser_view", normalized);
        },

        toggleSources() {
            this.panel?.classList.toggle("sources-collapsed");
        },

        toggleDetails() {
            this.panel?.classList.toggle("details-collapsed");
        },

        closeBrowser() {
            if (typeof window.toggleAssetsPanelSafe === "function") {
                window.toggleAssetsPanelSafe(false);
                return;
            }

            const AP = window.AssetsPanel;
            if (AP?.dom?.panel) AP.dom.panel.classList.remove("visible");
        },

        clearSearch() {
            const AP = window.AssetsPanel;
            const input = document.getElementById("assetSearchInput");
            if (input) input.value = "";
            this.searchQuery = "";
            AP?.searchAssets?.("");
        },

        newFolder() {
            const AP = window.AssetsPanel;
            if (!AP) return;

            if (typeof AP.createFolderFromUI === "function") {
                AP.createFolderFromUI(null, AP.openFolderId || null);
                return;
            }

            const name = prompt("Folder name", "New Folder");
            if (!name?.trim()) return;

            AP.createFolder(name.trim(), AP.openFolderId || null);
        },

        _syncFilterButton(type) {
            this.panel?.querySelectorAll(".filter-btn").forEach((button) => {
                button.classList.toggle("active", button.dataset.type === type);
            });
        }
    };

    window.AssetBrowserPro = Pro;

    const tryInstall = () => {
        if (window.AssetsPanel) {
            Pro.install();
            return true;
        }
        return false;
    };

    if (!tryInstall()) {
        window.addEventListener("sm-assets-panel-ready", () => {
            if (!Pro.installed) Pro.install();
            Pro.afterCoreInit();
        });

        let attempts = 0;
        const timer = setInterval(() => {
            attempts++;
            if (tryInstall() || attempts > 100) clearInterval(timer);
        }, 50);
    }
})();