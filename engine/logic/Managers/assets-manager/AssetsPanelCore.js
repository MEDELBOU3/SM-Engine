var __SMAssetsPanelPreviousGlobal =
    typeof window !== "undefined" ? window.AssetsPanel || null : null;
if (typeof window !== "undefined") {
    window.__SMAssetsPanelPreviousGlobalForModules =
        __SMAssetsPanelPreviousGlobal;
    window.__SMAssetsPanelModulesReady = false;
}

/**
 * AssetsPanel v6.5-advanced (Panel Resize + IndexedDB + Google Drive + Gameplay)
 * Full drop-in replacement for your latest class (keeps API & HTML hooks).
 *
 * This version integrates the following advanced features:
 *
 * I. Asset Panel & Workflow Enhancements:
 *    - Local Version Control (History, Commit, Revert)
 *      - Asset History: Stores snapshots of asset metadata and some data.
 *      - Commit/Revert: Basic local versioning, with prompt for commit messages.
 *      - History Modal: Displays asset history with revert options.
 *    - Asset Dependencies & Referencing:
 *      - "Requires" List: For materials, automatically detects and lists required texture assets.
 *      - "Used By" List: Identifies other assets that reference the current asset.
 *      - Broken References Detection: (Implicitly handled by UI showing "Broken Ref")
 *    - Asset Packing/Distribution:
 *      - "Pack Scene Assets": Exports all user assets and folder structure into a single JSON file.
 *    - Smart Categories/Tags:
 *      - Auto-tagging: Automatically adds tags based on filename keywords and asset type during import.
 *      - Tag Cloud: A visual representation of popular tags in the toolbar for quick filtering.
 *    - Multi-Asset Editing:
 *      - Multi-Tagging: Apply tags to multiple selected assets simultaneously.
 *      - Multi-Move: Move multiple selected assets to a new folder.
 *    - Drag-and-Drop to Other UI Elements:
 *      - Drag Texture to Material Input: Allows dragging a texture asset directly onto a material property input (e.g., Albedo Map) in the properties panel to assign it.
 *    - Prefab System (Basic):
 *      - Create Prefab: A placeholder system to group selected assets into a new 'prefab' asset type.
 *
 * II. Existing Features Maintained & Enhanced:
 *    - `material` asset type (JSON definitions with texture slots & params)
 *    - Support for FBX and OBJ models
 *    - Importing entire folders from the device, preserving hierarchy.
 *    - Applies materials via drag/drop onto meshes (PBR: map, normalMap, roughnessMap, metalnessMap, emissiveMap, displacementMap)
 *    - Uses inline SVG icons for thumbnails/fallbacks, matching your HTML where possible.
 *    - Preserves folders, multi-select, event hooks, storage, context menus, etc.
 *    - Advanced UI/UX inspired by Unreal Engine / Unity asset browsers.
 *    - Robust asset selection (single, Ctrl/Cmd+Click, Shift+Click) properly passing event object.
 *    - Correct preview pane state management ("Select an asset...", loading spinner, model disposal).
 *    - FBX-only scaling when dropping into the main scene (GLTF, OBJ added without auto-scaling).
 *    - Thumbnail Size Slider
 *    - Breadcrumbs for folder navigation
 *    - Tags/Keywords for assets (display & search)
 *    - Dedicated Interactive 3D Preview Pane (for models, materials, textures)
 *    - Conflict Resolution on asset import (rename/overwrite/skip)
 *    - Vertical/Horizontal connector lines for folder hierarchy in the sidebar (Unreal-like).
 *    - Script Management (addScriptAsset, updateScriptAsset)
 *
 * Usage: Replace previous AssetsPanel class with this code.
 *        Ensure GLTFLoader.js, FBXLoader.js, OBJLoader.js, RGBELoader.js, and OrbitControls.js are loaded.
 *        Call: AssetsPanel.init(scene, renderer, camera, raycaster);
 *
 * NOTE: For full scene object dependency tracking and robust Git integration,
 *       a server-side component or deeper editor integration would be required.
 *       This implementation focuses on *asset-to-asset* dependencies within the
 *       AssetsPanel and local versioning within browser storage.
 */

class AssetsPanel {
    static __nativeAssetsContextMenusV2 = true;
    // --- Core Properties ---
    static scene = null;
    static renderer = null; // Main scene renderer
    static camera = null; // Main scene camera
    static raycaster = null;
    static assets = []; // flat list of assets (includes folder references)
    static folders = {}; // folderId -> folder object (supports nested)
    static dom = {}; // Cache for DOM elements
    static loaders = {};

    // --- State ---
    static currentFilter = "all";
    static currentCategory = "project";
    static selectedAssetId = null; // single select (ID of the last asset clicked)
    static selectedIds = new Set(); // multi-select set
    static contextAssetId = null;
    static openFolderId = null; // currently viewed folder in Project category (null = root)
    static lastStorageVersion = 4; // MODIFIED: Increment for new schema (history, references)
    static lastSelectedAssetElement = null; // for Shift+Click to reference DOM element
    static currentThumbnailSize = 100; // Default thumbnail size in px
    static expandedFolders = new Set(); // For sidebar folder tree state
    static paneLayoutKeys = {
        sidebar: "assetsPanel_sidebarWidth",
        properties: "assetsPanel_propertiesWidth",
    };
    static paneResizeState = null;

    // --- Whole Content Browser height resize ---
    static panelHeightKey = "assetsPanel_height";
    static panelResizeState = null;
    static panelMinHeight = 220;
    static panelMaxViewportRatio = 0.86;
    static panelResizeRAF = 0;

    // --- External source compatibility ---
    // IMPORTANT: this class does NOT replace the Google Drive API with a local
    // directory picker. If an older AssetsPanel / provider already exposed a
    // Drive method, it is preserved and reused.
    static _legacyDriveSyncMethod = null;
    static _dynamicImportBindingsVersion = 0;

    // --- Google Drive API ---
    // Public folder ID is safe to keep in source.
    static GOOGLE_DRIVE_FOLDER_ID = "1NS4qBTzRfagZECvDoINMhFGzVaxedFSo";

    // Do NOT commit a real API key into a public repository.
    // Preferred:
    //   window.SM_GOOGLE_DRIVE_API_KEY = "YOUR_RESTRICTED_KEY";
    // before AssetsPanel.init().
    static GOOGLE_DRIVE_API_KEY = "AIzaSyBhv_HAk7CVt3sOr_eU8ZIbiPiYE10V1r4";

    static GOOGLE_DRIVE_ROOT_FOLDER_ID = "sme_google_drive";
    static GOOGLE_DRIVE_FOLDER_MIME = "application/vnd.google-apps.folder";
    static GOOGLE_DRIVE_SOURCES_GLOBAL = "SM_ASSET_DRIVE_SOURCES";
    static GOOGLE_DRIVE_DEFAULT_SOURCE_ID = "default";
    static googleDriveSyncBusy = false;
    static googleDriveLastSync = 0;
    static googleDriveLastSyncResults = [];

    // --- Persistent Asset Library ---
    // Binary files are stored as Blobs in IndexedDB, NOT localStorage.
    // localStorage is kept only as a small metadata/UI fallback.
    static assetStorage = null;
    static assetStorageReady = null;
    static assetStorageHydrated = false;
    static localStorageInlineLimit = 128 * 1024;

    // --- Preview Renderer Properties ---
    static previewScene = null;
    static previewCamera = null;
    static previewRenderer = null;
    static previewControls = null;
    static previewModel = null; // The object currently in the preview scene
    static previewLight = null; // A light for preview scene

    // --- Event hooks (you can override/add handlers externally) ---
    static onAssetsChanged = null; // function(assets, folders) {}
    static onAssetAdded = null; // function(asset) {}
    static onAssetRemoved = null; // function(assetId) {}
    static onFolderChanged = null; // function(folders) {}
    // NEW HOOKS for advanced features
    static onAssetVersionCommit = null; // function(assetId, versionData) {}
    static onAssetVersionRevert = null; // function(assetId, versionData) {}
    static onAssetUpdate = null; // function(assetId, newAssetData) {}

    // --- Init ---
    static init(scene, renderer, camera, raycaster) {
        if (
            typeof window !== "undefined" &&
            window.__SMAssetsPanelModulesReady !== true
        ) {
            window.__SMAssetsPanelPendingInitArgs = [
                scene,
                renderer,
                camera,
                raycaster,
            ];
            console.warn(
                "[AssetsPanel] init() deferred until modular AssetsPanel bootstrap is ready.",
            );
            return;
        }

        this.scene = scene;
        this.renderer = renderer;
        this.camera = camera;
        this.raycaster = raycaster || new THREE.Raycaster();

        // Check for required THREE.js and loaders
        if (
            typeof THREE === "undefined" ||
            !THREE.GLTFLoader ||
            !THREE.RGBELoader ||
            !THREE.FBXLoader ||
            !THREE.OBJLoader ||
            typeof THREE.OrbitControls === "undefined"
        ) {
            console.error(
                "AssetsPanel Error: THREE.js or required loaders (GLTFLoader, RGBELoader, FBXLoader, OBJLoader, OrbitControls) not found. Please ensure they are loaded before AssetsPanel.js.",
            );
            const panel = document.getElementById("assetsPanel");
            if (panel)
                panel.innerHTML =
                    '<div style="color:red;padding:20px;">AssetsPanel failed to initialize. Missing THREE.js or required loaders. Check console for details.</div>';
            return;
        }

        // DOM cache
        this.dom.panel = document.getElementById("assetsPanel");
        this.dom.grid = document.getElementById("assetsGrid");
        this.dom.properties = document.getElementById("propertiesContent");
        this.dom.uploadZone = document.getElementById("uploadDropzone");
        this.dom.uploadInput = document.getElementById("uploadInput");
        this.dom.uploadFolderInput = document.getElementById("uploadFolderInput");
        this.dom.contextMenu = document.getElementById("contextMenu");
        this.dom.header = document.getElementById("assetsPanelHeader");
        this.dom.content = this.dom.panel?.querySelector(".assets-content");
        this.dom.searchBox = document.querySelector(".search-box");
        this.dom.filterButtons = document.querySelectorAll(".filter-btn");
        this.dom.categoriesContainer = document.querySelector(".assets-categories");
        this.dom.gridPane = this.dom.panel?.querySelector(".assets-grid-container");
        this.dom.propertiesPanel = this.dom.panel?.querySelector(".assets-properties");
        this.dom.thumbnailSizeSlider = document.getElementById(
            "thumbnailSizeSlider",
        );
        this.dom.assetsBreadcrumbs = document.getElementById("assetsBreadcrumbs");
        this.dom.assetPreviewContainer = document.getElementById(
            "assetPreviewContainer",
        );
        this.dom.assetPreviewCanvas = document.getElementById("assetPreviewCanvas");
        this.dom.tagCloudContainer = document.getElementById("tagCloudContainer"); // NEW: For tag cloud
        // Ensure this.dom.properties is cleared for dynamic content initialization
        if (this.dom.properties)
            this.dom.properties.innerHTML = `<div class="property-row"><div class="property-label">Select an asset</div><div class="property-value">No asset selected</div></div>`;

        // Loaders
        this.loaders.gltf = new THREE.GLTFLoader();
        this.loaders.fbx = new THREE.FBXLoader();
        this.loaders.obj = new THREE.OBJLoader();
        this.loaders.texture = new THREE.TextureLoader();
        this.loaders.hdri = new THREE.RGBELoader();
        this.loaders.exr = THREE.EXRLoader ? new THREE.EXRLoader() : null;

        this.expandedFolders = new Set(
            JSON.parse(localStorage.getItem("assetsPanel_expandedFolders") || "[]"),
        );
        // Ensure upload inputs exist and are configured
        if (this.dom.uploadInput) this.dom.uploadInput.multiple = true;
        if (this.dom.uploadFolderInput) {
            this.dom.uploadFolderInput.webkitdirectory = true;
            this.dom.uploadFolderInput.directory = true;
            this.dom.uploadFolderInput.multiple = true;
        }

        this._initPreviewRenderer();
        this._loadFromStorage();
        this._ensureBuiltins();
        this.ensureScriptsFolder();
        this._ensurePaneResizers();
        this._restorePaneLayout();
        this._setupEventListeners();
        this._refreshDOMCache();
        this._ensurePanelHeightResizer();
        this._restorePanelHeight();
        this._setupPanelHeightResize();
        this._bindCurrentImportInputs();
        this._repairGameplayFolderTree();
        this._ensureProjectManifestAssets();
        this._ensureGoogleDriveButton();
        this._ensureMaterialPackageImportButton();
        this._syncRuntimeAssetRegistry();
        this.render();
        this._buildTagCloud(); // NEW: Build initial tag cloud
        this._initializePersistentAssetStorage();

        // Let late-loaded procedural libraries know that the content browser is
        // fully initialized.  This avoids a load-order race with
        // SMCityGenerator.js (the old implementation tried only once).
        window.dispatchEvent(new CustomEvent("sm-assets-panel-ready", {
            detail: { panel: this }
        }));


        console.log("AssetsPanel v6.0 initialized with advanced features.");
    }

    // --- Preview Renderer Initialization ---
    static _initPreviewRenderer() {
        if (!this.dom.assetPreviewCanvas || !this.dom.assetPreviewContainer) {
            console.warn(
                "AssetsPanel: Preview canvas or container element not found. Preview will not work.",
            );
            return;
        }

        const container = this.dom.assetPreviewContainer;
        const width = container.clientWidth;
        const height = container.clientHeight;

        this.previewScene = new THREE.Scene();
        this.previewCamera = new THREE.PerspectiveCamera(
            50,
            width / height,
            0.1,
            100,
        );
        this.previewCamera.position.set(0, 0, 3);

        // Add simple lighting for the preview
        this.previewScene.add(new THREE.AmbientLight(0xffffff, 0.8));
        this.previewLight = new THREE.DirectionalLight(0xffffff, 1.2);
        this.previewLight.position.set(1, 1, 1).normalize();
        this.previewScene.add(this.previewLight);

        this.previewRenderer = new THREE.WebGLRenderer({
            canvas: this.dom.assetPreviewCanvas,
            alpha: true, // Allow transparent background
            antialias: true,
        });
        this.previewRenderer.setSize(width, height);
        this.previewRenderer.setPixelRatio(window.devicePixelRatio);
        this.previewRenderer.setClearColor(0x000000, 0); // Transparent background

        this.previewControls = new THREE.OrbitControls(
            this.previewCamera,
            this.previewRenderer.domElement,
        );
        this.previewControls.enablePan = false;
        this.previewControls.enableZoom = true;
        this.previewControls.minDistance = 0.5;
        this.previewControls.maxDistance = 10;
        this.previewControls.target.set(0, 0, 0); // Always look at the origin
        this.previewControls.update(); // Initial update

        const animatePreview = () => {
            requestAnimationFrame(animatePreview);
            if (this.previewControls) this.previewControls.update();
            if (this.previewRenderer && this.previewScene && this.previewCamera) {
                this.previewRenderer.render(this.previewScene, this.previewCamera);
            }
        };
        animatePreview();

        // Handle resize of preview canvas
        new ResizeObserver(() => {
            if (
                this.dom.assetPreviewContainer &&
                this.previewRenderer &&
                this.previewCamera
            ) {
                const newWidth = this.dom.assetPreviewContainer.clientWidth;
                const newHeight = this.dom.assetPreviewContainer.clientHeight;
                this.previewRenderer.setSize(newWidth, newHeight);
                this.previewCamera.aspect = newWidth / newHeight;
                this.previewCamera.updateProjectionMatrix();
            }
        }).observe(this.dom.assetPreviewContainer);

        this._clearPreview(); // Initialize preview as empty
    }

    // ---------------- Public API (HTML hooks preserved) -----------------
    static _refreshDOMCache() {
        const panel = document.getElementById("assetsPanel");

        if (panel) {
            this.dom.panel = panel;
            this.dom.content = panel.querySelector(".assets-content");
            this.dom.gridPane = panel.querySelector(".assets-grid-container");
            this.dom.propertiesPanel = panel.querySelector(".assets-properties");
            this.dom.searchBox =
                panel.querySelector("#assetSearchInput, .search-box") ||
                this.dom.searchBox ||
                null;
            this.dom.filterButtons = panel.querySelectorAll(".filter-btn");
            this.dom.categoriesContainer =
                panel.querySelector("#assetsCategoriesPanel, .assets-categories") ||
                this.dom.categoriesContainer ||
                null;
        }

        this.dom.grid =
            document.getElementById("assetsGrid") ||
            this.dom.grid ||
            null;

        this.dom.properties =
            document.getElementById("propertiesContent") ||
            this.dom.properties ||
            null;

        // Re-query these every time. The professional UI shell can recreate
        // the import overlay, so old element references can become stale.
        this.dom.uploadZone =
            document.getElementById("uploadDropzone") ||
            this.dom.uploadZone ||
            null;

        this.dom.uploadInput =
            document.getElementById("uploadInput") ||
            null;

        this.dom.uploadFolderInput =
            document.getElementById("uploadFolderInput") ||
            null;

        this.dom.contextMenu =
            document.getElementById("contextMenu") ||
            this.dom.contextMenu ||
            null;

        this.dom.header =
            document.getElementById("assetsPanelHeader") ||
            this.dom.header ||
            null;

        this.dom.thumbnailSizeSlider =
            document.getElementById("thumbnailSizeSlider") ||
            this.dom.thumbnailSizeSlider ||
            null;

        this.dom.assetsBreadcrumbs =
            document.getElementById("assetsBreadcrumbs") ||
            this.dom.assetsBreadcrumbs ||
            null;

        this.dom.assetPreviewContainer =
            document.getElementById("assetPreviewContainer") ||
            this.dom.assetPreviewContainer ||
            null;

        this.dom.assetPreviewCanvas =
            document.getElementById("assetPreviewCanvas") ||
            this.dom.assetPreviewCanvas ||
            null;

        this.dom.tagCloudContainer =
            document.getElementById("tagCloudContainer") ||
            this.dom.tagCloudContainer ||
            null;

        if (this.dom.uploadInput) {
            this.dom.uploadInput.multiple = true;
        }

        if (this.dom.uploadFolderInput) {
            this.dom.uploadFolderInput.multiple = true;
            this.dom.uploadFolderInput.setAttribute("webkitdirectory", "");
            this.dom.uploadFolderInput.setAttribute("directory", "");

            try {
                this.dom.uploadFolderInput.webkitdirectory = true;
                this.dom.uploadFolderInput.directory = true;
            } catch (_) { }
        }

        return this.dom;
    }

    static toggle() {
        this._refreshDOMCache();
        if (!this.dom.panel) return;

        const willOpen = !this.dom.panel.classList.contains("visible");

        if (willOpen) {
            this._ensurePanelHeightResizer();
            this._restorePanelHeight();
            this._setupPanelHeightResize();

            // Rehydrate built-in/editor folders every time the browser opens.
            // This is non-destructive and specifically protects Gameplay.
            this._repairGameplayFolderTree();

            // API-backed/project-manifest folders may arrive after init.
            this._ensureProjectManifestAssets();

            this._ensureGoogleDriveButton();
            this._ensureMaterialPackageImportButton();
            this._bindCurrentImportInputs();
        }

        this.dom.panel.classList.toggle("visible");

        if (willOpen) {
            this.render();
            this._buildTagCloud();
        }
    }

    static showUploadZone() {
        this._refreshDOMCache();
        this._bindCurrentImportInputs();

        if (this.dom.uploadZone) {
            this.dom.uploadZone.classList.add("visible");
        }
    }

    static hideUploadZone() {
        this._refreshDOMCache();

        if (this.dom.uploadZone) {
            this.dom.uploadZone.classList.remove("visible", "dragover");
        }
    }

    static refreshAssets() {
        this._refreshDOMCache();
        this._ensurePanelHeightResizer();
        this._restorePanelHeight();
        this._setupPanelHeightResize();

        // Preserve the latest Gameplay repair logic from the user's class.
        this._repairGameplayFolderTree();
        this.registerCityLibrary({
            reveal: false,
            render: false,
        });

        // Re-read API/project manifest data if the provider populated it after
        // AssetsPanel.init().
        this._ensureProjectManifestAssets();

        this._bindCurrentImportInputs();
        this._ensureGoogleDriveButton();
        this._ensureMaterialPackageImportButton();
        this._ensurePersistenceButton();
        this._syncRuntimeAssetRegistry();

        this.render();
        this._buildTagCloud();

        // External API providers can optionally listen to this without the core
        // class knowing their implementation details.
        window.dispatchEvent(
            new CustomEvent("sm-assets-panel-refresh-external", {
                detail: {
                    panel: this,
                    manifest: window.SMProjectAssetManifest || null,
                },
            }),
        );
    }

    /**
     * Non-destructive repair for folders that must always exist.
     * Unlike _ensureBuiltins(), this does NOT clear built-in/API assets first.
     */
    static _repairGameplayFolderTree() {
        const gameplayId = "sme_gameplay";
        const obstaclesId = "sme_game_obstacles";
        const citiesId = "sme_procedural_cities";

        if (!this.folders[gameplayId]) {
            this.folders[gameplayId] = {
                id: gameplayId,
                name: "Gameplay",
                parentId: null,
                children: [],
                isBuiltIn: true,
                isProjectAssetFolder: true,
            };
        }

        const gameplay = this.folders[gameplayId];
        gameplay.name = "Gameplay";
        gameplay.parentId = null;
        gameplay.isBuiltIn = true;
        gameplay.isProjectAssetFolder = true;

        if (!Array.isArray(gameplay.children)) {
            gameplay.children = [];
        }

        if (!this.folders[obstaclesId]) {
            this.folders[obstaclesId] = {
                id: obstaclesId,
                name: "Blockout Obstacles",
                parentId: gameplayId,
                children: [],
                isBuiltIn: true,
                isProjectAssetFolder: true,
            };
        }

        const obstacles = this.folders[obstaclesId];
        obstacles.name = "Blockout Obstacles";
        obstacles.parentId = gameplayId;
        obstacles.isBuiltIn = true;
        obstacles.isProjectAssetFolder = true;

        if (!Array.isArray(obstacles.children)) {
            obstacles.children = [];
        }

        if (!gameplay.children.includes(obstaclesId)) {
            gameplay.children.push(obstaclesId);
        }

        // _registerCityAssets is already idempotent in the latest class and
        // repairs Procedural Cities without requiring SMCityGenerator to have
        // loaded yet.
        this._registerCityAssets();

        if (this.folders[citiesId]) {
            const cities = this.folders[citiesId];
            cities.parentId = gameplayId;
            cities.isBuiltIn = true;
            cities.isProjectAssetFolder = true;

            if (!Array.isArray(cities.children)) {
                cities.children = [];
            }

            if (!gameplay.children.includes(citiesId)) {
                gameplay.children.push(citiesId);
            }
        }

        this.expandedSections?.add?.("project");

        return gameplay;
    }

    /**
     * Rebind only the CURRENT import elements.
     * No Drive API behavior is replaced here.
     */
    static _bindCurrentImportInputs() {
        this._refreshDOMCache();

        const uploadInput = this.dom.uploadInput;
        const uploadFolderInput = this.dom.uploadFolderInput;
        const uploadZone = this.dom.uploadZone;

        if (uploadInput) {
            uploadInput.onchange = async (event) => {
                const files = Array.from(event.target.files || []);

                try {
                    for (const file of files) {
                        await this._addAssetFromFile(
                            file,
                            this.openFolderId,
                        );
                    }
                } finally {
                    event.target.value = "";
                    this.hideUploadZone();
                }
            };
        }

        if (uploadFolderInput) {
            uploadFolderInput.onchange = async (event) => {
                const files = Array.from(event.target.files || []);

                try {
                    if (files.length) {
                        await this._addAssetsFromFolderInput(
                            files,
                            this.openFolderId,
                        );
                    }
                } finally {
                    event.target.value = "";
                    this.hideUploadZone();
                }
            };
        }

        // Only attach a fresh drop handler when the shell created a NEW zone.
        if (
            uploadZone &&
            uploadZone.dataset.smAssetsUploadBound !== "1"
        ) {
            uploadZone.dataset.smAssetsUploadBound = "1";

            uploadZone.addEventListener("dragover", (event) => {
                event.preventDefault();
                uploadZone.classList.add("dragover");
            });

            uploadZone.addEventListener("dragleave", () => {
                uploadZone.classList.remove("dragover");
            });

            uploadZone.addEventListener("drop", async (event) => {
                event.preventDefault();
                uploadZone.classList.remove("dragover");

                const droppedItems = Array.from(
                    event.dataTransfer?.items || [],
                );

                const hasDirectory = droppedItems.some((item) => {
                    const entry =
                        typeof item.webkitGetAsEntry === "function"
                            ? item.webkitGetAsEntry()
                            : null;

                    return !!entry?.isDirectory;
                });

                if (hasDirectory) {
                    // Keep the same behavior as the stable class. Folder
                    // importing is handled by Browse Folder.
                    alert(
                        "For folders, use Browse Folder so the directory hierarchy is preserved.",
                    );
                    return;
                }

                const files = Array.from(
                    event.dataTransfer?.files || [],
                );

                for (const file of files) {
                    await this._addAssetFromFile(
                        file,
                        this.openFolderId,
                    );
                }

                this.hideUploadZone();
            });
        }

        this._dynamicImportBindingsVersion++;
    }

    // ---------------------------------------------------------------------
    // Google Drive multi-source library
    // ---------------------------------------------------------------------
    // Sources live OUTSIDE this class in AssetDriveSources.js:
    //
    // window.SM_ASSET_DRIVE_SOURCES = [
    //     {
    //         id: "city_assets",
    //         name: "City Assets",
    //         url: "https://drive.google.com/drive/folders/FOLDER_ID",
    //         enabled: true,
    //     },
    // ];
    //
    // AssetsPanel.syncGoogleDrive() syncs every enabled source.
    // AssetsPanel.syncGoogleDriveSource("city_assets") syncs only one.

}

if (typeof window !== "undefined") {
    window.AssetsPanel = AssetsPanel;
    window.__SMAssetsPanelBaseClass = AssetsPanel;
}
