// ============================================================================
// panels/assetsPanel.js
// SM Engine - Professional Content Browser UI Shell
// Keeps every DOM hook required by the existing AssetsPanel logic.
// ============================================================================
window.AssetPanel = {
    _initialized: false,

    init() {
        const ap = document.getElementById("assetsPanel");
        if (!ap) {
            console.warn("[AssetPanel UI] #assetsPanel was not found.");
            return false;
        }

        ap.classList.add("assets-panel-container", "sm-content-browser");
        ap.setAttribute("role", "region");
        ap.setAttribute("aria-label", "SM Engine Content Browser");

        if (!this._initialized || !ap.querySelector("#assetsGrid")) {
            ap.innerHTML = `
                <div class="assets-panel-header" id="assetsPanelHeader">
                    <div class="cb-title-area">
                        <div class="cb-title-icon"><i class="fas fa-box-open"></i></div>
                        <div class="cb-title-copy">
                            <strong>Content Browser</strong>
                            <span>Project Assets</span>
                        </div>
                    </div>
                    <div class="assets-panel-controls">
                        <button class="cb-icon-btn" id="cbToggleSources" title="Toggle Sources"><i class="fas fa-columns"></i></button>
                        <button class="cb-icon-btn" id="cbToggleDetails" title="Toggle Details"><i class="fas fa-window-maximize"></i></button>
                        <button class="cb-icon-btn" onclick="AssetsPanel.refreshAssets()" title="Refresh"><i class="fas fa-sync-alt"></i></button>
                        <button class="cb-icon-btn cb-close-btn" id="cbCloseBrowser" title="Close"><i class="fas fa-times"></i></button>
                    </div>
                </div>

                <div class="assets-toolbar cb-main-toolbar">
                    <div class="cb-toolbar-group cb-primary-actions">
                        <button class="cb-action-btn cb-action-primary" onclick="AssetsPanel.showUploadZone()" title="Import asset files">
                            <i class="fas fa-plus"></i><span>Import</span>
                        </button>
                        <button class="cb-action-btn" id="cbNewFolderBtn"
                            onclick="return AssetsPanel.createFolderFromUI(event)"
                            title="Create folder">
                            <i class="fas fa-folder-plus"></i><span>New Folder</span>
                        </button>
                        <button class="cb-action-btn" id="cbSaveLibraryDeviceBtn"
                            onclick="AssetsPanel.saveAssetsToDeviceFolder()"
                            title="Save / Export Asset Library to local device folder">
                            <i class="fas fa-folder-arrow-down"></i><span>Save to Device</span>
                        </button>
                        <button class="cb-action-btn" onclick="AssetsPanel.exportJSON()" title="Export asset database">
                            <i class="fas fa-save"></i><span>Export</span>
                        </button>
                        <button class="cb-action-btn" id="cbPackProjectBtn" title="Pack project assets">
                            <i class="fas fa-box"></i><span>Pack</span>
                        </button>
                    </div>

                    <div class="cb-separator"></div>

                    <div class="cb-navigation">
                        <button class="cb-icon-btn" id="cbNavBack" title="Back"><i class="fas fa-arrow-left"></i></button>
                        <button class="cb-icon-btn" id="cbNavForward" title="Forward"><i class="fas fa-arrow-right"></i></button>
                        <button class="cb-icon-btn" id="cbNavUp" title="Parent Folder"><i class="fas fa-arrow-up"></i></button>
                        <button class="cb-icon-btn" id="cbNavRoot" title="Content Root"><i class="fas fa-home"></i></button>
                    </div>

                    <div class="cb-path-shell">
                        <i class="fas fa-folder-open cb-path-icon"></i>
                        <div id="assetsBreadcrumbs" class="assets-breadcrumbs"></div>
                    </div>

                    <div class="cb-toolbar-spacer"></div>

                    <div class="cb-search-wrap">
                        <i class="fas fa-search cb-search-icon"></i>
                        <input
                            type="text"
                            id="assetSearchInput"
                            class="search-box"
                            placeholder="Search names, types, tags..."
                            autocomplete="off"
                            spellcheck="false"
                            oninput="AssetsPanel.searchAssets(this.value)"
                        >
                        <button class="cb-search-clear" id="cbClearSearch" title="Clear Search"><i class="fas fa-times"></i></button>
                    </div>
                </div>

                <div class="assets-toolbar cb-secondary-toolbar">
                    <div class="filter-group cb-filter-strip">
                        <button class="filter-btn active" data-type="all" onclick="AssetsPanel.filterByType('all',this)">All</button>
                        <button class="filter-btn" data-type="model" onclick="AssetsPanel.filterByType('model',this)">Meshes</button>
                        <button class="filter-btn" data-type="texture" onclick="AssetsPanel.filterByType('texture',this)">Textures</button>
                        <button class="filter-btn" data-type="material" onclick="AssetsPanel.filterByType('material',this)">Materials</button>
                        <button class="filter-btn" data-type="code" onclick="AssetsPanel.filterByType('code',this)">Scripts</button>
                        <button class="filter-btn" data-type="prefab" onclick="AssetsPanel.filterByType('prefab',this)">Prefabs</button>
                    </div>

                    <div id="tagCloudContainer" class="tag-cloud-container"></div>

                    <div class="cb-toolbar-spacer"></div>

                    <label class="cb-sort-wrap" title="Sort Assets">
                        <span>Sort</span>
                        <select id="assetSortSelect" class="cb-select">
                            <option value="name-asc">Name A–Z</option>
                            <option value="name-desc">Name Z–A</option>
                            <option value="type">Type</option>
                            <option value="favorite">Favorites First</option>
                        </select>
                    </label>

                    <div class="view-mode-toggle">
                        <button class="view-mode-btn active" data-mode="grid" title="Grid View"><i class="fas fa-th-large"></i></button>
                        <button class="view-mode-btn" data-mode="list" title="List View"><i class="fas fa-list"></i></button>
                    </div>

                    <button class="cb-icon-btn" onclick="AssetsPanel.showDependencyGraph()" title="Reference Viewer"><i class="fas fa-project-diagram"></i></button>

                    <div class="cb-thumb-control" title="Thumbnail Size">
                        <i class="fas fa-image"></i>
                        <input type="range" id="thumbnailSizeSlider" min="64" max="180" value="100">
                    </div>
                </div>

                <div class="assets-content">
                    <aside class="assets-categories" id="assetsCategoriesPanel" aria-label="Asset Sources"></aside>

                    <main class="assets-grid-container">
                        <div class="cb-grid-header">
                            <div>
                                <strong id="cbFolderTitle">Content</strong>
                                <span id="cbFolderSubtitle">Browse project assets</span>
                            </div>
                            <div class="cb-grid-header-actions">
                                <span id="cbVisibleCount">0 items</span>
                            </div>
                        </div>

                        <div class="assets-grid-scroll">
                            <div class="assets-grid" id="assetsGrid"></div>

                            <div id="referenceViewerContainer" class="reference-viewer-container" style="display:none;">
                                <div class="reference-viewer-header">
                                    <div>
                                        <strong>Reference Viewer</strong>
                                        <span>Asset dependencies and usages</span>
                                    </div>
                                    <button class="cb-action-btn" onclick="AssetsPanel.closeDependencyGraph()">
                                        <i class="fas fa-times"></i><span>Close</span>
                                    </button>
                                </div>
                                <div id="dependencyGraphCanvas" class="dependency-graph-canvas"></div>
                            </div>
                        </div>
                    </main>

                    <aside class="assets-properties" aria-label="Asset Details">
                        <div class="cb-details-header">
                            <div>
                                <strong>Details</strong>
                                <span>Selected asset</span>
                            </div>
                            <button class="cb-icon-btn" id="cbCollapseDetails" title="Collapse Details"><i class="fas fa-angle-right"></i></button>
                        </div>

                        <div id="assetPreviewContainer" class="asset-preview-container empty">
                            <canvas id="assetPreviewCanvas"></canvas>
                            <div class="asset-preview-empty-state">
                                <i class="fas fa-cube"></i>
                                <strong>No Asset Selected</strong>
                                <span>Select an asset to inspect it</span>
                            </div>
                            <div class="asset-preview-loading-state">
                                <div class="cb-spinner"></div>
                                <span>Preparing preview...</span>
                            </div>
                        </div>

                        <div class="cb-properties-scroll">
                            <div id="propertiesContent">
                                <div class="cb-empty-properties">
                                    <i class="fas fa-info-circle"></i>
                                    <span>Asset properties will appear here.</span>
                                </div>
                            </div>
                        </div>
                    </aside>
                </div>

                <div class="assets-status-bar" id="assetsStatusBar">
                    <div class="status-item"><i class="fas fa-layer-group"></i><span id="sb-count"><strong>0</strong> items</span></div>
                    <div class="status-item" id="sb-sel" style="display:none;"></div>
                    <div class="status-item cb-status-types" id="sb-types"></div>
                    <div class="status-item cb-status-path" id="sb-path"></div>
                    <div class="status-item cb-status-engine">SM Content Browser</div>
                </div>
            `;
        }

        this._ensureUploadOverlay();
        this._ensureContextMenu();
        this._initialized = true;
        ap.dataset.assetPanelUiReady = "1";
        console.log("[AssetPanel UI] Professional Content Browser shell ready.");
        return true;
    },

    _ensureUploadOverlay() {
        let overlay = document.getElementById("uploadDropzone");
        if (!overlay) {
            overlay = document.createElement("div");
            overlay.id = "uploadDropzone";
            overlay.className = "upload-dropzone";
            document.body.appendChild(overlay);
        }

        if (overlay.dataset.assetPanelUiReady === "1" && overlay.querySelector("#uploadInput")) return;

        overlay.innerHTML = `
            <div class="cb-import-dialog" role="dialog" aria-modal="true" aria-label="Import Assets">
                <div class="cb-import-header">
                    <div>
                        <strong>Import Assets</strong>
                        <span>Add files or an entire folder to the current Content directory.</span>
                    </div>
                    <button class="cb-icon-btn" onclick="AssetsPanel.hideUploadZone()" title="Close"><i class="fas fa-times"></i></button>
                </div>

                <div id="uploadNormalContent" class="cb-import-body">
                    <div class="cb-drop-hero">
                        <div class="cb-drop-icon"><i class="fas fa-cloud-upload-alt"></i></div>
                        <strong>Drop files here</strong>
                        <span>Models, textures, HDR environments, materials and scripts</span>
                        <small>GLB · GLTF · FBX · OBJ · PNG · JPG · WEBP · HDR · EXR · JSON · JS</small>
                    </div>

                    <div class="cb-import-actions">
                        <label for="uploadInput" class="cb-action-btn cb-action-primary">
                            <i class="fas fa-file-import"></i><span>Browse Files</span>
                        </label>
                        <label for="uploadFolderInput" class="cb-action-btn">
                            <i class="fas fa-folder-open"></i><span>Browse Folder</span>
                        </label>
                        <button class="cb-action-btn" onclick="AssetsPanel.hideUploadZone()">
                            <span>Cancel</span>
                        </button>
                    </div>

                    <input id="uploadInput" type="file" multiple hidden>
                    <input id="uploadFolderInput" type="file" multiple webkitdirectory directory hidden>
                </div>

                <div id="uploadProgressContent" class="cb-import-progress" style="display:none;">
                    <div class="cb-spinner"></div>
                    <strong id="uploadStatusText">Processing assets...</strong>
                    <div class="cb-progress-track">
                        <div id="uploadProgressBar" class="cb-progress-bar"></div>
                    </div>
                </div>
            </div>
        `;

        if (!overlay.dataset.assetPanelBackdropBound) {
            overlay.dataset.assetPanelBackdropBound = "1";
            overlay.addEventListener("click", (event) => {
                if (event.target === overlay && window.AssetsPanel?.hideUploadZone) {
                    window.AssetsPanel.hideUploadZone();
                }
            });
        }
        overlay.dataset.assetPanelUiReady = "1";
    },

    _ensureContextMenu() {
        let menu = document.getElementById("contextMenu");
        if (!menu) {
            menu = document.createElement("div");
            menu.id = "contextMenu";
            menu.className = "context-menu assets-context-menu";
            menu.style.display = "none";
            document.body.appendChild(menu);
        }
    }
};

(function bootstrapAssetPanelUI() {
    const run = () => window.AssetPanel?.init?.();
    if (document.getElementById("assetsPanel")) run();
    else if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run, { once: true });
    else run();
})();