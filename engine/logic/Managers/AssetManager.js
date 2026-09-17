//=================================================================================================//
// ========================================= BACKUP FILE ==========================================//
//=================================================================================================//

var __SMAssetsPanelPreviousGlobal =
    typeof window !== "undefined" ? window.AssetsPanel || null : null;

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

    static _isSceneMediaAssetType(type = "") {
        return ["texture", "image", "icon", "video"].includes(String(type || "").toLowerCase());
    }

    static _getAssetSourceUrl(asset) {
        if (!asset) return null;
        return this._normalizeAssetSource(asset.url || asset.data || "");
    }

    static _isEXRAsset(asset, source = "") {
        return /\.exr(?:$|[?#])/i.test(String(asset?.name || "")) ||
            /\.exr(?:$|[?#])/i.test(String(source || ""));
    }

    static async _applyHDRIAsset(asset) {
        const source = this._getAssetSourceUrl(asset);
        if (!source) throw new Error(`HDRI '${asset?.name || "asset"}' has no source.`);

        const isEXR = this._isEXRAsset(asset, source);
        const loader = isEXR ? this.loaders.exr : this.loaders.hdri;
        if (!loader) {
            throw new Error(
                `${isEXR ? "THREE.EXRLoader" : "THREE.RGBELoader"} is not available.`,
            );
        }

        const texture = await new Promise((resolve, reject) => {
            loader.load(source, resolve, undefined, reject);
        });
        texture.mapping = THREE.EquirectangularReflectionMapping;

        const configuredIntensity = Number(
            window.EngineSettings?.get?.("setting-hdri-intensity") ?? 0.65,
        );
        const intensity = Number.isFinite(configuredIntensity)
            ? configuredIntensity
            : 0.65;
        window.smActiveHDRI = {
            texture,
            source,
            assetId: asset?.id || null,
            name: asset?.name || null,
            type: isEXR ? "exr" : "hdr",
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
                source,
                assetId: asset?.id || null,
            });
        } else if (this.scene) {
            this.scene.background = texture;
            if (window.smHDRIEnvironmentEnabled !== false) {
                this.scene.environment = texture;
                this.scene.environmentIntensity = intensity;
            }
        }

        window.workspaceManager?._restoreActiveHDRI?.(this.scene);
        console.log(
            `Applied ${isEXR ? "EXR" : "HDR"} environment '${asset?.name || "Environment"}'.`,
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

    static addMaterialAsset(name, jsonString, folderId = null) {
        let uniqueName = name;
        let counter = 1;
        const baseName = name.replace(/\.json$/, "");
        while (
            this.assets.some(
                (a) =>
                    !a.isBuiltIn &&
                    a.name === uniqueName &&
                    (a.folderId || null) === (folderId || null),
            )
        ) {
            uniqueName = `${baseName} (${counter++}).json`;
        }

        if (uniqueName !== name) {
            console.warn(
                `AssetsPanel: Asset name conflict for '${name}'. Renamed to '${uniqueName}'.`,
            );
        }

        let definition;
        try {
            definition = JSON.parse(jsonString);
        } catch (e) {
            console.error("Invalid JSON for material asset.");
            return null;
        }

        const id = `material_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        const asset = {
            id,
            name: uniqueName,
            type: "material",
            data: jsonString, // Store the raw JSON string
            definition, // Parsed object for quick access
            thumbnail: this._svgIcon("material"),
            isFavorite: false,
            isBuiltIn: false,
            folderId,
            tags: ["material"], // Auto-tagging
            history: [], // Initialize history
            references: [], // Initialize references
        };

        // Optional: Auto-detect references (textures) in the material
        asset.references = this._detectMaterialReferences(definition);

        // Optional: Generate thumbnail if _generateThumbnail exists
        // asset.thumbnail = await this._generateThumbnail(asset);

        // Auto-tag based on content
        this._autoTagAsset(asset);

        this.assets.push(asset);
        this._commitAssetVersion(asset.id, "Initial Material Import");
        this._saveToStorage();
        if (typeof this.onAssetAdded === "function") this.onAssetAdded(asset);
        this.render();
        this._buildTagCloud();

        // Generate a proper sphere thumbnail (UE-like material ball) in background.
        this._generateMaterialThumbnail(definition)
            .then((thumb) => {
                if (!thumb) return;
                asset.thumbnail = thumb;
                this._saveToStorage();
                this.render();
            })
            .catch((err) => {
                console.warn("AssetsPanel: Material thumbnail generation failed.", err);
            });

        return asset;
    }

    // Adds an asset to scene or multiple drop handling - MODIFIED: For Drag-to-UI (and texture asset ID storage)
    /*static async _addToScene(assetId, event = null) {
          const asset = this._findById(assetId)
              || this._getPrimitiveAssets().find(a => a.id === assetId)
              || this._getLightAssets().find(a => a.id === assetId);
  
          if (!asset) {
              console.error(`AssetsPanel: Could not find asset with ID ${assetId}`);
              return;
          }
          if (typeof window.addObjectToScene !== 'function') {
              console.error("AssetsPanel Error: window.addObjectToScene() is not defined. Please define it globally.");
              // If addObjectToScene is crucial, prevent further execution
              return;
          }
  
          // --- NEW: Drag-to-UI handling ---
          // This part of the logic is now handled entirely within _updatePropertiesPanel's
          // texture-slot-input.ondrop event handler.
          // The _addToScene method is primarily for dropping assets *into the 3D scene*.
          // The 'return' statement in _updatePropertiesPanel's drop handler ensures
          // that if a UI drop occurs, _addToScene does not attempt to add the texture to the 3D scene.
          // So, this block is conceptually moved, but its impact is still relevant.
          // For clarity, I'm removing the redundant UI drop handling from here as it's now specific
          // to the properties panel logic.
          // --- END NEW: Drag-to-UI handling ---
  
          let position = new THREE.Vector3(0, 0, 0);
  
          switch (asset.type) {
              case 'model': {
                  const ext = asset.name.split('.').pop().toLowerCase();
                  let loaderPromise;
  
                  const bbox = new THREE.Box3().setFromObject(modelObject);
                  const size = bbox.getSize(new THREE.Vector3());
                  const targetHeight = 1.8; // Standard human height
                  const scaleFactor = targetHeight / size.y;
                  modelObject.scale.setScalar(scaleFactor);
                  if (ext === 'glb' || ext === 'gltf') {
                      loaderPromise = new Promise((resolve, reject) => {
                          this.loaders.gltf.load(asset.data, gltf => resolve(gltf), undefined, reject);
                      });
                  } else if (ext === 'fbx') {
                      loaderPromise = new Promise((resolve, reject) => {
                          this.loaders.fbx.load(asset.data, obj => resolve(obj), undefined, reject);
                      });
                  } else if (ext === 'obj') {
                      loaderPromise = new Promise((resolve, reject) => {
                          this.loaders.obj.load(asset.data, obj => resolve(obj), undefined, reject);
                      });
                  } else {
                      console.warn(`AssetsPanel: No specific loader for model type '${ext}'. Falling back to GLTF.`);
                      loaderPromise = new Promise((resolve, reject) => {
                          this.loaders.gltf.load(asset.data, gltf => resolve(gltf), undefined, reject);
                      });
                  }
  
  
                  loaderPromise.then(loadedContent => {
                      let modelObject;
                      let animations = [];
  
                      if (loadedContent && loadedContent.scene instanceof THREE.Object3D) {
                          modelObject = loadedContent.scene;
                          animations = loadedContent.animations || [];
                      } else if (loadedContent instanceof THREE.Object3D) {
                          modelObject = loadedContent;
                          animations = loadedContent.animations || [];
                      } else {
                          console.error(`AssetsPanel: Loaded content not valid for ${asset.name}.`, loadedContent);
                          throw new Error("Invalid model content.");
                      }
  
                      let hasSkeletonData = false;
                      modelObject.traverse((child) => {
                          if (child.isSkinnedMesh) {
                              hasSkeletonData = true;
                              if (child.skeleton) {
                                  child.skeleton.update();
                              }
                          }
                      });

                      if (['fbx', 'obj', 'gltf', 'glb'].includes(ext)) {
                          const bbox = new THREE.Box3().setFromObject(modelObject);
                          if (!bbox.isEmpty()) {
                              const size = bbox.getSize(new THREE.Vector3());
  
                              const targetMaxDim = 1.8;
                              const currentMaxDim = Math.max(size.x, size.y, size.z);
  
                              if (currentMaxDim > 0) {
                                  const scaleFactor = targetMaxDim / currentMaxDim;
                                  modelObject.scale.setScalar(scaleFactor);
                              }

                              const newBbox = new THREE.Box3().setFromObject(modelObject);
                              const newCenter = newBbox.getCenter(new THREE.Vector3());
                              modelObject.position.sub(newCenter);
  
                              if (hasSkeletonData) {
                                  modelObject.traverse((child) => {
                                      if (child.isSkinnedMesh && child.skeleton) {
                                          child.skeleton.update();
                                      }
                                  });
                              }
                          }
                      }
  
                      modelObject.position.copy(position);
                      modelObject.animations = animations;
  
                      if (hasSkeletonData) {
                          modelObject.userData.hasSkeleton = true;
                      }
  
                      window.addObjectToScene(
                          modelObject,
                          asset.name.split('.').slice(0, -1).join('.')
  
                      );
  
                      if (hasSkeletonData && window.rigManager) {
                          window.rigManager.setupRigForObject(modelObject);
                      }
  
  
  
                      if (typeof this.onAssetAdded === 'function')
                          this.onAssetAdded(asset);
                  }).catch(error => {
                      console.error(`AssetsPanel: Failed to load model '${asset.name}':`, error);
                  });
                  break;
              }
  
              case 'texture': {
                  // If dropping directly onto the 3D scene, apply to the map slot
                  this.loaders.texture.load(asset.data, texture => {
                      const intersects = this.raycaster.intersectObjects(this.scene.children, true);
                      const target = intersects.length > 0 ? intersects[0].object : null;
                      if (target && target.isMesh && target.material) {
                          // For simplicity, apply to 'map' by default
                          target.material.map = texture;
                          target.material.needsUpdate = true;
                          console.log(`Applied texture '${asset.name}' to 'map' of '${target.name}'.`);
                      } else {
                          console.warn("AssetsPanel: Drop texture on a mesh.");
                      }
                  });
                  break;
              }
  
              case 'hdri': {
                  this.loaders.hdri.load(asset.data, texture => {
                      texture.mapping = THREE.EquirectangularReflectionMapping;
                      this.scene.background = texture;
                      this.scene.environment = texture;
                      console.log(`Applied HDRI '${asset.name}' to scene.`);
                  });
                  break;
              }
  
              case 'material': {
                  // Raycast to find the target mesh in the 3D scene
                  const intersects = event ? (() => {
                      const rect = this.renderer.domElement.getBoundingClientRect();
                      const mouse = new THREE.Vector2(
                          (event.clientX - rect.left) / rect.width * 2 - 1,
                          -((event.clientY - rect.top) / rect.height) * 2 + 1
                      );
                      this.raycaster.setFromCamera(mouse, this.camera);
                      return this.raycaster.intersectObjects(this.scene.children, true);
                  })() : [];
  
                  if (intersects.length > 0) {
                      this._applyMaterialToMesh(asset, intersects[0].object);
                  } else {
                      console.warn("AssetsPanel: Drop material on a mesh.");
                  }
                  break;
              }
  
              case 'primitive': {
                  const mesh = asset.factory();
                  mesh.position.copy(position);
                  window.addObjectToScene(mesh, asset.name);
                  break;
              }
  
              case 'light': {
                  const light = asset.factory();
                  light.position.copy(position);
                  if (light.target) {
                      light.target.position.set(0, -1, 0);
                      window.addObjectToScene(light.target, `${asset.name} Target`);
                  }
                  window.addObjectToScene(light, asset.name);
                  break;
              }
              case 'prefab': { // NEW: Handle prefab instancing (basic placeholder)
                  try {
                      const components = JSON.parse(asset.data);
                      const prefabGroup = new THREE.Group();
                      prefabGroup.name = asset.name;
  
                      // This is a basic example; a real prefab would load/clone models
                      // and apply their saved relative transforms and properties.
                      for (const comp of components) {
                          const compAsset = this._findById(comp.id);
                          if (compAsset && compAsset.type === 'model') {
                              // Load/clone model and add to prefabGroup
                              // For simplicity, we'll just log here. Real implementation is complex.
                              console.log(`Prefab: Instantiating component ${comp.name} from prefab ${asset.name}`);
                              // await someLoadModelFunction(compAsset.data).then(model => prefabGroup.add(model));
                          }
                      }
                      if (prefabGroup.children.length > 0) {
                          window.addObjectToScene(prefabGroup, prefabGroup.name);
                          console.log(`AssetsPanel: Instantiated prefab '${asset.name}'. (Components not fully loaded in this example)`);
                      } else {
                          console.warn(`AssetsPanel: Prefab '${asset.name}' has no loadable components.`);
                      }
                  } catch (error) {
                      console.error(`AssetsPanel: Failed to instantiate prefab '${asset.name}':`, error);
                  }
                  break;
              }
          }
      }*/

    /**
     * Enhanced _addToScene method with automatic RigManager integration
     * Drop-in replacement for your existing AssetsPanel._addToScene method
     */
    static _resolveDropPosition(event = null, mode = this._getActiveGameViewportMode()) {
        const activeCamera = window.getActiveViewportCamera?.() || this.camera;
        const fallback = new THREE.Vector3(0, 0, 0);

        if (window.selectedObject?.position?.isVector3) {
            fallback.copy(window.selectedObject.position);
        } else if (activeCamera) {
            const forward = new THREE.Vector3();
            activeCamera.getWorldDirection(forward);
            fallback.copy(activeCamera.position).add(forward.multiplyScalar(mode === "3D" ? 6 : 0));
            if (mode !== "3D") fallback.set(0, 0, 0);
        }

        if (!event || !this.renderer?.domElement || !activeCamera) return fallback;

        const rect = this.renderer.domElement.getBoundingClientRect();
        const mouse = new THREE.Vector2(
            ((event.clientX - rect.left) / rect.width) * 2 - 1,
            -((event.clientY - rect.top) / rect.height) * 2 + 1,
        );
        this.raycaster.setFromCamera(mouse, activeCamera);

        const plane = mode === "3D"
            ? new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
            : new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
        const point = new THREE.Vector3();
        if (this.raycaster.ray.intersectPlane(plane, point)) {
            return point;
        }
        return fallback;
    }

    static async _createImageLikeSceneObject(asset, options = {}) {
        const source = this._getAssetSourceUrl(asset);
        if (!source) throw new Error(`Missing image source for asset "${asset?.name || "unknown"}".`);

        const texture = await new Promise((resolve, reject) => {
            this.loaders.texture.load(source, resolve, undefined, reject);
        });
        if (THREE.SRGBColorSpace) texture.colorSpace = THREE.SRGBColorSpace;

        const image = texture.image || {};
        const aspect = image.width && image.height ? image.width / image.height : 1;
        const mode = this._getActiveGameViewportMode();
        const height = Number.isFinite(options.height) ? options.height : (mode === "3D" ? 2.4 : 4);
        const width = Number.isFinite(options.width) ? options.width : Math.max(0.4, height * aspect);

        const mesh = new THREE.Mesh(
            new THREE.PlaneGeometry(width, Math.max(0.4, height)),
            new THREE.MeshBasicMaterial({
                map: texture,
                transparent: true,
                alphaTest: 0.02,
                side: THREE.DoubleSide,
                depthWrite: false,
                toneMapped: false
            }),
        );
        mesh.name = options.name || asset.name.replace(/\.[^.]+$/, "");
        mesh.userData = {
            ...mesh.userData,
            selectable: true,
            disableAutoShadows: true,
            isMediaPlane: true,
            mediaType: asset.type,
            sourceAssetId: asset.id
        };
        return mesh;
    }

    static async _createSpriteSheetSceneObject(asset, options = {}) {
        const source = this._getAssetSourceUrl(asset);
        const sheet = asset?.spriteSheet;
        const firstSlice = sheet?.slices?.[0];
        if (!source || !firstSlice) {
            return this._createImageLikeSceneObject(asset, options);
        }

        const texture = await new Promise((resolve, reject) => {
            this.loaders.texture.load(source, resolve, undefined, reject);
        });
        const imageWidth = Number(sheet.imageWidth || texture.image?.width || 1);
        const imageHeight = Number(sheet.imageHeight || texture.image?.height || 1);
        const pixelsPerUnit = Number(options.pixelsPerUnit || 64);
        const geometry = new THREE.PlaneGeometry(
            Math.max(1, firstSlice.width) / pixelsPerUnit,
            Math.max(1, firstSlice.height) / pixelsPerUnit
        );
        const uv = geometry.attributes.uv;
        const u0 = firstSlice.x / imageWidth;
        const u1 = (firstSlice.x + firstSlice.width) / imageWidth;
        const v0 = 1 - (firstSlice.y + firstSlice.height) / imageHeight;
        const v1 = 1 - firstSlice.y / imageHeight;
        uv.setXY(0, u0, v1);
        uv.setXY(1, u1, v1);
        uv.setXY(2, u0, v0);
        uv.setXY(3, u1, v0);
        uv.needsUpdate = true;

        const mesh = new THREE.Mesh(
            geometry,
            new THREE.MeshBasicMaterial({
                map: texture,
                transparent: true,
                alphaTest: 0.02,
                side: THREE.DoubleSide,
                depthWrite: false,
                toneMapped: false,
            })
        );
        mesh.name = options.name || asset.name.replace(/\.[^.]+$/, "");
        mesh.userData = {
            ...mesh.userData,
            selectable: true,
            is2DSprite: true,
            sourceAssetId: asset.id,
            spriteSheet: asset.name,
            spriteSheetSize: { width: imageWidth, height: imageHeight },
            imageWidth,
            imageHeight,
            slices: JSON.parse(JSON.stringify(sheet.slices || [])),
            clips: JSON.parse(JSON.stringify(sheet.clips || [])),
            sprite2D: {
                frameIndex: 0,
                frameElapsed: 0,
                playing: true,
                activeClipId: sheet.activeClipId || sheet.clips?.[0]?.id || null,
                pixelsPerUnit,
                depth: 0,
            },
        };
        return mesh;
    }

    static async _createVideoSceneObject(asset, options = {}) {
        const source = this._getAssetSourceUrl(asset);
        if (!source) throw new Error(`Missing video source for asset "${asset?.name || "unknown"}".`);

        const video = document.createElement("video");
        video.src = source;
        video.crossOrigin = "anonymous";
        video.loop = options.loop ?? true;
        video.muted = options.muted ?? true;
        video.playsInline = true;
        video.preload = options.preload || "auto";

        await new Promise((resolve) => {
            const done = () => resolve();
            video.addEventListener("loadeddata", done, { once: true });
            video.addEventListener("error", done, { once: true });
            video.load();
        });

        if (options.autoplay !== false) {
            video.play().catch(() => { });
        }

        const texture = new THREE.VideoTexture(video);
        texture.colorSpace = THREE.SRGBColorSpace;
        const image = texture.image || {};
        const aspect = image.videoWidth && image.videoHeight
            ? image.videoWidth / image.videoHeight
            : 16 / 9;
        const mode = this._getActiveGameViewportMode();
        const height = Number.isFinite(options.height) ? options.height : (mode === "3D" ? 2.8 : 4.5);
        const width = Number.isFinite(options.width) ? options.width : Math.max(0.8, height * aspect);

        const mesh = new THREE.Mesh(
            new THREE.PlaneGeometry(width, Math.max(0.6, height)),
            new THREE.MeshBasicMaterial({
                map: texture,
                side: THREE.DoubleSide,
                toneMapped: false
            }),
        );
        mesh.name = options.name || asset.name.replace(/\.[^.]+$/, "");
        mesh.userData = {
            ...mesh.userData,
            selectable: true,
            disableAutoShadows: true,
            isMediaPlane: true,
            mediaType: "video",
            sourceAssetId: asset.id,
            videoElement: video
        };
        return mesh;
    }

    static _placeMediaObjectInScene(object, asset, event = null, options = {}) {
        const mode = this._getActiveGameViewportMode();
        const position = options.position?.isVector3
            ? options.position.clone()
            : this._resolveDropPosition(event, mode);

        if (options.position && !options.position.isVector3 && typeof options.position === "object") {
            position.set(
                Number.isFinite(options.position.x) ? options.position.x : position.x,
                Number.isFinite(options.position.y) ? options.position.y : position.y,
                Number.isFinite(options.position.z) ? options.position.z : position.z,
            );
        }

        object.position.copy(position);

        if (mode === "3D") {
            const activeCamera = window.getActiveViewportCamera?.() || this.camera;
            if (activeCamera) object.quaternion.copy(activeCamera.quaternion);
        } else {
            object.rotation.set(0, 0, 0);
        }

        window.addObjectToScene(object, options.name || object.name || asset.name);
        return object;
    }

    static async _addToScene(assetId, event = null, options = {}) {
        const asset =
            this._findById(assetId) ||
            this._getPrimitiveAssets().find((a) => a.id === assetId) ||
            this._getLightAssets().find((a) => a.id === assetId);

        if (!asset) {
            console.error(`AssetsPanel: Could not find asset with ID ${assetId}`);
            return;
        }

        if (typeof window.addObjectToScene !== "function") {
            console.error(
                "AssetsPanel Error: window.addObjectToScene() is not defined.",
            );
            return;
        }

        switch (asset.type) {
            case "model": {
                const ext = asset.name.split(".").pop().toLowerCase();
                let loaderPromise;
                const source = this._getAssetSourceUrl(asset);

                // 1. Setup loaders
                if (ext === "glb" || ext === "gltf") {
                    loaderPromise = new Promise((resolve, reject) => {
                        this.loaders.gltf.load(source, resolve, undefined, reject);
                    });
                } else if (ext === "fbx") {
                    loaderPromise = new Promise((resolve, reject) => {
                        this.loaders.fbx.load(source, resolve, undefined, reject);
                    });
                } else if (ext === "obj") {
                    loaderPromise = new Promise((resolve, reject) => {
                        this.loaders.obj.load(source, resolve, undefined, reject);
                    });
                } else {
                    loaderPromise = new Promise((resolve, reject) => {
                        this.loaders.gltf.load(source, resolve, undefined, reject);
                    });
                }

                return loaderPromise
                    .then((loadedContent) => {
                        let modelObject = loadedContent.scene || loadedContent;
                        let animations = loadedContent.animations || [];

                        // --- A. PHYSICAL PROPERTIES PASS ---
                        modelObject.traverse((child) => {
                            if (child.isMesh) {
                                child.castShadow = true;
                                child.receiveShadow = true;

                                if (child.material) {
                                    child.material.shadowSide = THREE.DoubleSide;

                                    const isBuilding = asset.name
                                        .toLowerCase()
                                        .match(/(house|building|wall|room|floor)/);
                                    if (isBuilding) {
                                        child.material.side = THREE.DoubleSide;
                                    }
                                }
                            }
                        });

                        // Ensure world matrices are up to date before bounding calculations
                        modelObject.updateMatrixWorld(true);

                        // --- B. AUTO-SCALING WITH SAFETY ---
                        const bbox = new THREE.Box3().setFromObject(modelObject);
                        const size = bbox.getSize(new THREE.Vector3());
                        const targetHeight = 1.8;
                        if (size.y > 0.0001 && Number.isFinite(size.y)) {
                            const scaleFactor = targetHeight / size.y;
                            if (Number.isFinite(scaleFactor) && scaleFactor > 0.0001 && scaleFactor < 500) {
                                modelObject.scale.setScalar(scaleFactor);
                                modelObject.updateMatrixWorld(true);
                            }
                        }

                        // --- C. GROUNDING WITH SAFETY ---
                        const groundedBbox = new THREE.Box3().setFromObject(modelObject);
                        if (Number.isFinite(groundedBbox.min.y) && Math.abs(groundedBbox.min.y) < 10000) {
                            modelObject.position.y = -groundedBbox.min.y;
                        }

                        modelObject.animations = animations;

                        // Add to scene once
                        window.addObjectToScene(
                            modelObject,
                            asset.name.split('.').slice(0, -1).join('.')
                        );

                        // --- D. ANIMATION & TIMELINE REGISTRATION ---
                        if (animations && animations.length > 0) {
                            if (!modelObject.userData.mixer) {
                                modelObject.userData.mixer = new THREE.AnimationMixer(modelObject);
                            }
                            if (typeof extractAnimationsToTimeline === 'function') {
                                extractAnimationsToTimeline(modelObject, animations);
                            }
                            window.selectedObject = modelObject;
                            if (window.SelectionManager) {
                                window.SelectionManager.select(modelObject);
                            }
                            setTimeout(() => {
                                if (typeof window.updateLayersUI === 'function') window.updateLayersUI();
                                if (typeof window.updateKeyframesUI === 'function') window.updateKeyframesUI();
                                if (typeof window.updateHierarchy === 'function') window.updateHierarchy();
                            }, 50);
                        }

                        // --- E. AUTOMATIC RIG SETUP ---
                        if (hasBones && window.rigManager) {
                            setTimeout(() => {
                                window.rigManager.setupRigForObject(modelObject);
                                window.rigManager.showRigForObject(modelObject);
                                if (window.advancedControlRig?.setActiveObject) {
                                    window.advancedControlRig.setActiveObject(modelObject);
                                }
                                if (typeof updateTimelineHierarchy === "function")
                                    updateTimelineHierarchy();
                            }, 100);
                        }

                        // --- F. ENGINE SENTINEL & LUMEN SYNC ---
                        if (window.lumenSystem && size.y > 5) {
                            window.lumenSystem.updateReflections();
                        }

                        if (typeof updateHierarchy === "function") updateHierarchy();
                        if (typeof this.onAssetAdded === "function")
                            this.onAssetAdded(asset);

                        return modelObject;
                    })
                    .catch((error) => {
                        console.error(
                            `AssetsPanel: Failed to load model '${asset.name}':`,
                            error,
                        );
                        return null;
                    });
            }

            case "texture":
            case "image":
            case "icon": {
                try {
                    const mediaObject = asset.isSpriteSheet
                        ? await this._createSpriteSheetSceneObject(asset, options)
                        : await this._createImageLikeSceneObject(asset, options);
                    return this._placeMediaObjectInScene(mediaObject, asset, event, options);
                } catch (error) {
                    console.error(`AssetsPanel: Failed to place media asset '${asset.name}'.`, error);
                    return null;
                }
            }

            case "video": {
                try {
                    const mediaObject = await this._createVideoSceneObject(asset, options);
                    return this._placeMediaObjectInScene(mediaObject, asset, event, options);
                } catch (error) {
                    console.error(`AssetsPanel: Failed to place video asset '${asset.name}'.`, error);
                    return null;
                }
            }

            case "audio": {
                console.warn(`AssetsPanel: '${asset.name}' is an audio asset. Use it from scripts via Assets.getAudio().`);
                return null;
            }

            case "hdri": {
                try {
                    await this._applyHDRIAsset(asset);
                } catch (error) {
                    console.error(`AssetsPanel: Failed to apply HDRI '${asset.name}'.`, error);
                }
                return null;
            }

            case "material": {
                let targetMesh = null;

                if (event && this.renderer?.domElement && this.camera) {
                    const rect = this.renderer.domElement.getBoundingClientRect();
                    const mouse = new THREE.Vector2(
                        ((event.clientX - rect.left) / rect.width) * 2 - 1,
                        -((event.clientY - rect.top) / rect.height) * 2 + 1,
                    );
                    this.raycaster.setFromCamera(mouse, this.camera);
                    const intersects = this.raycaster.intersectObjects(
                        this.scene.children,
                        true,
                    );
                    targetMesh = intersects.find((it) => it.object?.isMesh)?.object || null;
                }

                // Fallbacks for non-drop usage (double-click, keyboard workflows).
                if (!targetMesh && window.selectedObject?.isMesh) {
                    targetMesh = window.selectedObject;
                }

                if (!targetMesh) {
                    console.warn("AssetsPanel: Select or drop onto a mesh to apply material.");
                    return;
                }

                this._applyMaterialToMesh(asset, targetMesh);
                return targetMesh;
            }

            case "city": {
                const city = asset.factory?.();

                if (!city) {
                    console.error(
                        "AssetsPanel: City factory failed for " + asset.name
                    );
                    return null;
                }

                const position = options.position?.isVector3
                    ? options.position.clone()
                    : this._resolveDropPosition(event, "3D");

                city.position.copy(position);
                city.updateMatrixWorld(true);

                const bounds = new THREE.Box3().setFromObject(city);

                if (!bounds.isEmpty() && Number.isFinite(bounds.min.y)) {
                    city.position.y -= bounds.min.y;
                }

                city.userData = {
                    ...city.userData,
                    selectable: true,
                    isSelectableRoot: true,
                    isCityRoot: true,
                    isProceduralCity: true,
                    isSystemObject: false,
                    ignoreInHierarchy: false,
                    sourceAssetId: asset.id
                };

                city.traverse(child => {
                    child.userData = {
                        ...child.userData,
                        selectable: true,
                        isCityObject: true,
                        isSystemObject: false,
                        ignoreInHierarchy: false,
                        sourceAssetId: asset.id
                    };

                    if (child.isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                    }
                });

                window.addObjectToScene(city, asset.name);
                window.transformControls?.attach?.(city);
                window.updateHierarchy?.();

                return city;
            }

            case "obstacle": {
                const obstacle = asset.factory?.();
                if (!obstacle) {
                    console.error("AssetsPanel: Obstacle factory failed for " + asset.name);
                    return null;
                }

                const mode = this._getActiveGameViewportMode();
                const position = options.position?.isVector3
                    ? options.position.clone()
                    : this._resolveDropPosition(event, mode);

                if (options.position && !options.position.isVector3 && typeof options.position === "object") {
                    position.set(
                        Number.isFinite(options.position.x) ? options.position.x : position.x,
                        Number.isFinite(options.position.y) ? options.position.y : position.y,
                        Number.isFinite(options.position.z) ? options.position.z : position.z
                    );
                }

                obstacle.position.copy(position);
                obstacle.updateMatrixWorld(true);

                const bounds = new THREE.Box3().setFromObject(obstacle);
                const groundY = options.position && Number.isFinite(options.position.y)
                    ? options.position.y
                    : 0;
                if (!bounds.isEmpty() && Number.isFinite(bounds.min.y)) {
                    obstacle.position.y += groundY - bounds.min.y;
                }

                obstacle.userData = {
                    ...obstacle.userData,
                    selectable: true,
                    isSelectableRoot: true,
                    isGameObstacle: true,
                    isSystemObject: false,
                    ignoreInHierarchy: false,
                    sourceAssetId: asset.id
                };

                obstacle.traverse((child) => {
                    child.userData = {
                        ...child.userData,
                        selectable: true,
                        isSystemObject: false,
                        ignoreInHierarchy: false,
                        sourceAssetId: asset.id
                    };
                    if (child.isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                    }
                });

                window.addObjectToScene(obstacle, asset.name);
                window.transformControls?.attach?.(obstacle);
                window.updateHierarchy?.();
                return obstacle;
            }

            case "primitive": {
                const mesh = asset.factory();
                window.addObjectToScene(mesh, asset.name);
                return mesh;
            }

            case "light": {
                const light = asset.factory();
                window.addObjectToScene(light, asset.name);
                return light;
            }

            case "prefab": {
                console.warn(`AssetsPanel: Prefab placement is not fully implemented yet for '${asset.name}'.`);
                return null;
            }

            case "scene": {
                if (!asset.data) return null;
                try {
                    const objectsData = JSON.parse(asset.data);
                    const loader = new THREE.ObjectLoader();
                    const sceneGroup = new THREE.Group();
                    sceneGroup.name = asset.name.replace(/\.scene$/i, "");

                    // Parse and reconstruct all objects in the scene file
                    objectsData.forEach(jsonObj => {
                        const loadedObj = loader.parse(jsonObj);
                        sceneGroup.add(loadedObj);
                    });

                    const position = options.position?.isVector3
                        ? options.position.clone()
                        : this._resolveDropPosition(event, "3D");

                    sceneGroup.position.copy(position);
                    window.addObjectToScene(sceneGroup, sceneGroup.name);
                    window.updateHierarchy?.();
                    return sceneGroup;
                } catch (err) {
                    console.error(`AssetsPanel: Failed to parse scene file '${asset.name}':`, err);
                    return null;
                }
            }
        }
    }

    /**
     * BONUS: Helper method to manually trigger rig detection
     * Call this if you load models through other methods
     */
    static setupRigsForScene() {
        if (!window.rigManager) {
            console.error("RigManager not initialized. Cannot setup rigs.");
            return;
        }

        console.log("AssetsPanel: Scanning entire scene for rigs...");
        const rigsFound = window.rigManager.scanSceneForRigs();

        if (rigsFound === 0) {
            console.log("  └─ No rigs found in scene");
        } else {
            console.log(`  └─ ✓ ${rigsFound} rig(s) initialized`);
        }

        return rigsFound;
    }

    /**
     * BONUS: Call this when deleting objects to clean up rig visuals
     */
    static removeObjectFromScene(object) {
        if (!object) return;

        // Check if object has rig
        let hasBones = false;
        object.traverse((n) => {
            if (n.isBone && n.userData.hasVisual) {
                hasBones = true;
            }
        });

        // Remove rig visuals if present
        if (hasBones && window.rigManager) {
            console.log("AssetsPanel: Removing rig visuals...");
            window.rigManager.removeRigForObject(object);
        }

        // Remove from scene
        if (object.parent) {
            object.parent.remove(object);
        }

        // Dispose of resources
        object.traverse((child) => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                if (Array.isArray(child.material)) {
                    child.material.forEach((m) => m.dispose());
                } else {
                    child.material.dispose();
                }
            }
        });

        console.log("AssetsPanel: Object removed from scene");
    }
    // --- Preview Logic (unchanged for core, now handles material definitions referencing assets) ---
    static async _updatePreview(asset) {
        if (!this.previewScene || !this.dom.assetPreviewContainer) return;

        this._clearPreview();
        this.dom.assetPreviewContainer.classList.add("loading");

        try {
            if (asset.type === "model") {
                const ext = asset.name.split(".").pop().toLowerCase();
                let loaderPromise;

                if (ext === "glb" || ext === "gltf") {
                    loaderPromise = new Promise((resolve, reject) =>
                        this.loaders.gltf.load(
                            asset.data,
                            (gltf) => resolve(gltf.scene),
                            undefined,
                            reject,
                        ),
                    );
                } else if (ext === "fbx") {
                    loaderPromise = new Promise((resolve, reject) =>
                        this.loaders.fbx.load(
                            asset.data,
                            (obj) => resolve(obj),
                            undefined,
                            reject,
                        ),
                    );
                } else if (ext === "obj") {
                    loaderPromise = new Promise((resolve, reject) =>
                        this.loaders.obj.load(
                            asset.data,
                            (obj) => resolve(obj),
                            undefined,
                            reject,
                        ),
                    );
                } else {
                    console.warn(
                        `Preview: No specific loader for model type '${ext}' (asset: ${asset.name}).`,
                    );
                    this._clearPreview();
                    return;
                }

                this.previewModel = await loaderPromise;

                // Scale and center the model in the preview scene
                const bbox = new THREE.Box3().setFromObject(this.previewModel);
                if (!bbox.isEmpty()) {
                    const size = bbox.getSize(new THREE.Vector3());
                    const center = bbox.getCenter(new THREE.Vector3());
                    const maxDim = Math.max(size.x, size.y, size.z);
                    const scaleFactor = 1.5 / maxDim; // Target max dim of 1.5 units for preview

                    this.previewModel.scale.set(scaleFactor, scaleFactor, scaleFactor);
                    this.previewModel.position.sub(
                        center.clone().multiplyScalar(scaleFactor),
                    ); // Adjust position after scaling
                } else {
                    console.warn(
                        `Preview: Model '${asset.name}' bounding box is empty. Displaying empty preview.`,
                    );
                    this._clearPreview(); // Clear on empty model
                    return;
                }

                this.previewScene.add(this.previewModel);
                this.previewControls.target.set(0, 0, 0); // Recenter orbit controls target
                this.previewCamera.position.set(
                    0,
                    0,
                    Math.max(2, (bbox.max.z - bbox.min.z) * 1.5),
                ); // Adjust camera distance
                this.previewControls.update();
            } else if (asset.type === "obstacle" && typeof asset.factory === "function") {
                this.previewModel = asset.factory();
                const bounds = new THREE.Box3().setFromObject(this.previewModel);
                if (!bounds.isEmpty()) {
                    const size = bounds.getSize(new THREE.Vector3());
                    const center = bounds.getCenter(new THREE.Vector3());
                    const maxDim = Math.max(size.x, size.y, size.z, 0.001);
                    const scale = 1.65 / maxDim;
                    this.previewModel.scale.setScalar(scale);
                    this.previewModel.position.sub(center.multiplyScalar(scale));
                }
                this.previewScene.add(this.previewModel);
                this.previewCamera.position.set(2.2, 1.7, 2.8);
                this.previewControls.target.set(0, 0, 0);
                this.previewControls.update();
            } else if (asset.type === "material") {
                const material = new THREE.MeshStandardMaterial({
                    color: asset.definition.color
                        ? new THREE.Color(asset.definition.color)
                        : 0xffffff,
                    roughness: asset.definition.roughness ?? 0.5,
                    metalness: asset.definition.metalness ?? 0.0,
                    emissive: asset.definition.emissive
                        ? new THREE.Color(asset.definition.emissive)
                        : 0x000000,
                    emissiveIntensity: asset.definition.emissiveIntensity ?? 1,
                });
                // IMPORTANT: Fetch texture data from referenced assets, not direct data URLs in definition
                const loader = new THREE.TextureLoader();
                const texturePromises = [];
                const slots = [
                    ["map", "map"],
                    ["normalMap", "normalMap"],
                    ["roughnessMap", "roughnessMap"],
                    ["metalnessMap", "metalnessMap"],
                    ["emissiveMap", "emissiveMap"],
                    ["displacementMap", "displacementMap"],
                ];
                for (const [k, slotKey] of slots) {
                    const textureAssetId = asset.definition[slotKey]; // Get texture asset ID
                    const textureAsset = textureAssetId
                        ? this._findById(textureAssetId)
                        : null;

                    if (textureAsset && textureAsset.data && this._isTextureCompatibleAssetType(textureAsset.type)) {
                        texturePromises.push(
                            new Promise((res) =>
                                loader.load(
                                    this._getAssetSourceUrl(textureAsset),
                                    (t) => {
                                        material[k] = t;
                                        material.needsUpdate = true;
                                        res();
                                    },
                                    undefined,
                                    res,
                                ),
                            ),
                        );
                    }
                }
                await Promise.all(texturePromises);
                this.previewModel = new THREE.Mesh(
                    new THREE.SphereGeometry(1, 32, 16),
                    material,
                );
                this.previewScene.add(this.previewModel);
                this.previewCamera.position.set(0, 0, 2);
                this.previewControls.target.set(0, 0, 0);
                this.previewControls.update();
            } else if (asset.type === "texture" || asset.type === "image" || asset.type === "icon" || asset.type === "hdri") {
                const texture = await new Promise((res) =>
                    this.loaders.texture.load(this._getAssetSourceUrl(asset), res, undefined, res),
                );
                if (asset.type === "hdri")
                    texture.mapping = THREE.EquirectangularReflectionMapping;

                const material = new THREE.MeshBasicMaterial({
                    map: texture,
                    side: THREE.DoubleSide,
                });
                // Use a sphere for HDRI preview to show mapping better, plane for regular texture
                this.previewModel = new THREE.Mesh(
                    asset.type === "hdri"
                        ? new THREE.SphereGeometry(1, 32, 16)
                        : new THREE.PlaneGeometry(2, 2),
                    material,
                );
                this.previewScene.add(this.previewModel);
                this.previewCamera.position.set(0, 0, 2);
                this.previewControls.target.set(0, 0, 0);
                this.previewControls.update();
            } else if (asset.type === "video") {
                const video = document.createElement("video");
                video.src = this._getAssetSourceUrl(asset);
                video.crossOrigin = "anonymous";
                video.muted = true;
                video.loop = true;
                video.playsInline = true;
                await new Promise((resolve) => {
                    const done = () => resolve();
                    video.addEventListener("loadeddata", done, { once: true });
                    video.addEventListener("error", done, { once: true });
                    video.load();
                });
                video.play().catch(() => { });
                const texture = new THREE.VideoTexture(video);
                texture.colorSpace = THREE.SRGBColorSpace;
                const material = new THREE.MeshBasicMaterial({
                    map: texture,
                    side: THREE.DoubleSide,
                    toneMapped: false
                });
                this.previewModel = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
                this.previewModel.userData.previewVideoElement = video;
                this.previewScene.add(this.previewModel);
                this.previewCamera.position.set(0, 0, 2);
                this.previewControls.target.set(0, 0, 0);
                this.previewControls.update();
            } else if (asset.type === "code" || asset.type === "prefab") {
                // NEW: No visual preview for code/prefab
                this._clearPreview();
                this.dom.assetPreviewContainer.classList.add("empty"); // Show empty state for code/prefab
                return;
            }
            // If anything was successfully loaded, remove the 'empty' class
            if (this.previewModel) {
                this.dom.assetPreviewContainer.classList.remove("empty");
            } else {
                this.dom.assetPreviewContainer.classList.add("empty"); // Fallback to empty if model somehow wasn't set
            }
        } catch (error) {
            console.error("Error loading preview asset:", error);
            this._clearPreview(); // Clear on error
        } finally {
            this.dom.assetPreviewContainer.classList.remove("loading");
        }
    }

    static _clearPreview() {
        if (this.previewScene) {
            // Dispose of previous preview model if it exists
            if (this.previewModel) {
                const previewVideo = this.previewModel.userData?.previewVideoElement;
                if (previewVideo) {
                    previewVideo.pause();
                    previewVideo.removeAttribute("src");
                    previewVideo.load();
                }
                this.previewScene.remove(this.previewModel);
                this._disposeHierarchy(this.previewModel); // Custom recursive dispose
                this.previewModel = null;
            }

            // Reset camera and controls to default state
            this.previewCamera.position.set(0, 0, 3);
            this.previewControls.target.set(0, 0, 0);
            this.previewControls.update();

            // Show the "Select an asset for preview" overlay
            this.dom.assetPreviewContainer.classList.add("empty");
            this.dom.assetPreviewContainer.classList.remove("loading");
        }
    }

    // Helper to dispose of Three.js objects recursively (unchanged)
    static _disposeHierarchy(object) {
        if (!object) return;
        // Dispose geometry
        if (object.geometry) {
            object.geometry.dispose();
            object.geometry = undefined;
        }
        // Dispose material(s) and textures
        if (object.material) {
            const materials = Array.isArray(object.material)
                ? object.material
                : [object.material];
            for (const material of materials) {
                for (const key in material) {
                    if (
                        material[key] &&
                        typeof material[key].isTexture === "boolean" &&
                        material[key].isTexture
                    ) {
                        material[key].dispose();
                        material[key] = undefined;
                    }
                }
                material.dispose();
                material = undefined;
            }
        }
        // Recursively dispose children
        if (object.children) {
            // Important: iterate backwards when removing children from a collection being traversed
            for (let i = object.children.length - 1; i >= 0; i--) {
                this._disposeHierarchy(object.children[i]);
                object.remove(object.children[i]); // Remove from parent after disposing
            }
        }
    }

    // ------------------------------------------------------------------
    // Persistent Asset Library (IndexedDB + optional device folder)
    // ------------------------------------------------------------------
    static _initializePersistentAssetStorage() {
        if (this.assetStorageReady) {
            return this.assetStorageReady;
        }

        if (typeof window.AssetStorageManager !== "function") {
            console.warn(
                "AssetsPanel: AssetStorageManager.js is not loaded. " +
                "Falling back to metadata-only localStorage persistence."
            );

            this.assetStorageReady =
                Promise.resolve(null);

            return this.assetStorageReady;
        }

        this.assetStorage =
            new window.AssetStorageManager();

        this.assetStorageReady =
            (async () => {
                await this.assetStorage.init();

                const persistent =
                    await this.assetStorage
                        .requestPersistentStorage()
                        .catch(() => false);

                const stored =
                    await this.assetStorage.loadLibrary();

                const currentBuiltIns =
                    this.assets.filter(
                        (asset) => asset?.isBuiltIn
                    );

                const currentUserAssets =
                    this.assets.filter(
                        (asset) => asset && !asset.isBuiltIn
                    );

                if (stored.assets.length) {
                    this.assets = [
                        ...stored.assets,
                        ...currentBuiltIns
                    ];

                    if (
                        stored.folders &&
                        Object.keys(stored.folders).length
                    ) {
                        this.folders = {
                            ...stored.folders,
                            ...this.folders
                        };
                    }
                } else if (currentUserAssets.length) {
                    // First launch after upgrading from the old localStorage
                    // implementation. saveLibrary() automatically migrates
                    // legacy data URLs into IndexedDB Blobs.
                    await this.assetStorage.saveLibrary(
                        this.assets,
                        this.folders
                    );

                    const migrated =
                        await this.assetStorage.loadLibrary();

                    this.assets = [
                        ...migrated.assets,
                        ...currentBuiltIns
                    ];

                    if (
                        migrated.folders &&
                        Object.keys(migrated.folders).length
                    ) {
                        this.folders = {
                            ...migrated.folders,
                            ...this.folders
                        };
                    }
                }

                this._ensureBuiltins();
                this._repairGameplayFolderTree?.();
                this._ensureProjectManifestAssets?.();
                this.ensureScriptsFolder?.();
                this._syncRuntimeAssetRegistry?.();

                this.assetStorageHydrated = true;

                // Rewrite the old localStorage payload without giant binary
                // data URLs so the quota problem is permanently removed.
                this._saveLocalStorageMetadataFallback();

                this.render();
                this._buildTagCloud?.();
                this._ensurePersistenceButton();

                const estimate =
                    await this.assetStorage
                        .estimate()
                        .catch(() => null);

                console.log(
                    "[AssetsPanel] Persistent library ready.",
                    {
                        persistent,
                        assets:
                            this.assets.filter(
                                (asset) => !asset.isBuiltIn
                            ).length,
                        usageMB:
                            estimate?.usageMB?.toFixed?.(1),
                        quotaMB:
                            estimate?.quotaMB?.toFixed?.(1)
                    }
                );

                return this.assetStorage;
            })().catch((error) => {
                console.error(
                    "AssetsPanel: Failed to initialize persistent asset storage.",
                    error
                );

                this.assetStorage = null;
                return null;
            });

        return this.assetStorageReady;
    }

    static async _getPersistentAssetStorage() {
        if (!this.assetStorageReady) {
            this._initializePersistentAssetStorage();
        }

        return await this.assetStorageReady;
    }

    static async openSpriteSheetAsset(assetId) {
        const asset = this._findById(assetId);
        if (!asset) throw new Error("Image asset was not found.");

        const storage = await this._getPersistentAssetStorage();
        let source = null;

        // A runtime blob URL can be stale after restart. Always resolve the
        // persisted binary first when the asset has an IndexedDB key.
        if (asset.storageKey && storage) {
            source = await storage.resolveAssetData(asset);
        }

        source = source || this._getAssetSourceUrl(asset);

        if (!source) throw new Error("Could not load the image data from Assets Manager.");

        const openEditor = window.openSpriteEditorSafely || window.openSpriteSheetEditor;
        if (typeof openEditor !== "function") {
            throw new Error("Sprite Sheet Editor is not loaded.");
        }

        await openEditor({
            id: asset.id,
            assetId: asset.id,
            source,
            sourceURL: source,
            spriteSheet: asset.spriteSheet || null,
            name: asset.name,
        }, asset.name);

        return asset;
    }

    static _safeLocalStorageAssetRecord(asset) {
        const record = {
            id: asset.id,
            name: asset.name,
            type: asset.type,
            thumbnail:
                typeof asset.thumbnail === "string" &&
                    asset.thumbnail.length <= 96 * 1024
                    ? asset.thumbnail
                    : null,
            isFavorite: !!asset.isFavorite,
            isBuiltIn: false,
            folderId: asset.folderId || null,
            tags: Array.isArray(asset.tags)
                ? [...asset.tags]
                : [],
            definition: asset.definition || undefined,
            history: Array.isArray(asset.history)
                ? asset.history.slice(-10)
                : [],
            references: Array.isArray(asset.references)
                ? [...asset.references]
                : [],
            sourceType: asset.sourceType || null,
            storageKind: asset.storageKind || null,
            storageKey: asset.storageKey || null,
            driveFileId: asset.driveFileId || null,
            driveMimeType: asset.driveMimeType || null,
            sourceRelativePath:
                asset.sourceRelativePath || null,
            sourceModifiedTime:
                asset.sourceModifiedTime || null,
            sourceLastModified:
                Number(asset.sourceLastModified || 0),
            sourceSize:
                Number(asset.sourceSize || 0),
            remote: asset.remote === true
        };

        // Keep only small text or remote URLs in localStorage.
        // Never write binary data URLs / blob URLs here.
        if (
            typeof asset.data === "string" &&
            asset.data.length <=
            this.localStorageInlineLimit &&
            (
                asset.type === "code" ||
                asset.type === "material" ||
                asset.type === "scene" ||
                /^https?:\/\//i.test(asset.data)
            )
        ) {
            record.data = asset.data;
        } else {
            record.data = null;
        }

        return record;
    }

    static _saveLocalStorageMetadataFallback() {
        try {
            const payload = {
                version: this.lastStorageVersion,
                storageMode: "indexeddb",
                assets: this.assets
                    .filter((asset) => !asset.isBuiltIn)
                    .map((asset) =>
                        this._safeLocalStorageAssetRecord(
                            asset
                        )
                    ),
                folders: this.folders
            };

            localStorage.setItem(
                `assetsPanel_data_v${this.lastStorageVersion}`,
                JSON.stringify(payload)
            );
        } catch (error) {
            console.warn(
                "AssetsPanel: localStorage metadata fallback could not be saved.",
                error
            );
        }
    }

    static async getPersistenceStatus() {
        const storage =
            await this._getPersistentAssetStorage();

        const estimate =
            await storage?.estimate?.();

        const projectFolder =
            await storage
                ?.getProjectDirectoryHandle?.({
                    requestPermission: false
                })
                .catch?.(() => null);

        return {
            backend:
                storage
                    ? "indexeddb"
                    : "localStorage-fallback",
            hydrated:
                this.assetStorageHydrated,
            userAssets:
                this.assets.filter(
                    (asset) => !asset.isBuiltIn
                ).length,
            folders:
                Object.keys(this.folders || {}).length,
            usageMB:
                estimate?.usageMB || 0,
            quotaMB:
                estimate?.quotaMB || 0,
            projectFolder:
                projectFolder?.name || null
        };
    }

    static async mountProjectAssetsFolder() {
        const storage =
            await this._getPersistentAssetStorage();

        if (!storage) {
            alert(
                "Persistent storage is not available."
            );
            return null;
        }

        try {
            const handle =
                await storage.mountProjectDirectory({
                    forcePicker: true
                });

            this._ensurePersistenceButton();

            console.log(
                `[AssetsPanel] Project Assets folder mounted: ${handle.name}`
            );

            return handle;
        } catch (error) {
            if (error?.name !== "AbortError") {
                console.error(
                    "AssetsPanel: Could not mount project Assets folder.",
                    error
                );
            }

            return null;
        }
    }

    static async saveAssetsToDeviceFolder({
        forcePicker = false
    } = {}) {
        const storage =
            await this._getPersistentAssetStorage();

        if (!storage) {
            alert(
                "Persistent storage is not available."
            );
            return false;
        }

        try {
            if (forcePicker) {
                await storage.mountProjectDirectory({
                    forcePicker: true
                });
            }

            const result =
                await storage.exportLibraryToProjectDirectory(
                    this.assets,
                    this.folders,
                    {
                        forcePicker:
                            !forcePicker &&
                            !(await storage
                                .getProjectDirectoryHandle({
                                    requestPermission: true
                                }))
                    }
                );

            console.log(
                "[AssetsPanel] Device Assets folder saved:",
                result
            );

            return result;
        } catch (error) {
            if (error?.name !== "AbortError") {
                console.error(
                    "AssetsPanel: Failed to save Assets library to device folder.",
                    error
                );

                alert(
                    "Could not save the Assets library to the selected device folder."
                );
            }

            return false;
        }
    }

    static _ensurePersistenceButton() {
        if (
            document.getElementById(
                "cbSaveLibraryDeviceBtn"
            )
        ) {
            return;
        }

        const host =
            this.dom.panel?.querySelector(
                ".cb-primary-actions"
            ) ||
            this.dom.panel?.querySelector(
                ".cb-toolbar-actions"
            );

        if (!host) return;

        const button =
            document.createElement("button");

        button.id =
            "cbSaveLibraryDeviceBtn";
        button.className =
            "cb-action-btn";
        button.title =
            "Save a user-visible copy of the Asset Library to a folder on this device";
        button.innerHTML =
            '<i class="fas fa-folder-arrow-down"></i><span>Save Library</span>';

        button.addEventListener(
            "click",
            () => {
                this.saveAssetsToDeviceFolder();
            }
        );

        host.appendChild(button);
    }

    // ------------------------------------------------------------------
    // Storage, Loading & Migration - MODIFIED: For history and references
    // ------------------------------------------------------------------
    static _saveToStorage() {
        // 1. Small synchronous fallback so folder names/UI metadata survive
        //    even if IndexedDB initialization is still in progress.
        this._saveLocalStorageMetadataFallback();

        // 2. Real persistent storage. Binary assets live here as Blobs.
        this._getPersistentAssetStorage()
            .then((storage) => {
                if (!storage) return;

                storage.scheduleSaveLibrary(
                    this.assets,
                    this.folders,
                    180
                );
            })
            .catch((error) => {
                console.error(
                    "AssetsPanel: Failed to queue persistent save.",
                    error
                );
            });

        this._syncRuntimeAssetRegistry();

        if (
            typeof this.onAssetsChanged ===
            "function"
        ) {
            this.onAssetsChanged(
                this.assets,
                this.folders
            );
        }
    }

    static _loadFromStorage() {
        try {
            const raw = localStorage.getItem(
                `assetsPanel_data_v${this.lastStorageVersion}`,
            ); // MODIFIED: Use current version key
            if (!raw) return this._migrateLegacy(); // Try to migrate if current version not found
            const data = JSON.parse(raw);
            if (data.assets) {
                // Filter out any built-in assets from loaded data to avoid duplicates with _ensureBuiltins
                const loadedUserAssets = data.assets
                    .filter((a) => !a.isBuiltIn)
                    .map((a) => {
                        // Ensure new properties are initialized if missing from older saved data
                        if (!Array.isArray(a.tags)) a.tags = [];
                        if (!Array.isArray(a.history)) a.history = []; // NEW: Initialize history
                        if (!Array.isArray(a.references)) a.references = []; // NEW: Initialize references
                        if (!a.storageKind) a.storageKind = null;
                        if (!a.storageKey) a.storageKey = null;

                        // V6.0 Migration: If material definition still stores data URLs, try to convert to asset IDs
                        if (a.type === "material" && a.definition) {
                            const textureSlots = [
                                "map",
                                "normalMap",
                                "roughnessMap",
                                "metalnessMap",
                                "emissiveMap",
                                "displacementMap",
                            ];
                            for (const slot of textureSlots) {
                                if (
                                    typeof a.definition[slot] === "string" &&
                                    a.definition[slot].startsWith("data:image")
                                ) {
                                    // Find an existing texture asset with this data URL
                                    const existingTexture = this.assets.find(
                                        (tex) =>
                                            tex.type === "texture" && tex.data === a.definition[slot],
                                    );
                                    if (existingTexture) {
                                        a.definition[slot] = existingTexture.id; // Convert to asset ID
                                        if (!a.references.includes(existingTexture.id)) {
                                            a.references.push(existingTexture.id);
                                        }
                                    } else {
                                        // If texture doesn't exist, create a new asset for it and link it
                                        const textureId = `asset_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
                                        const textureName = `${a.name}_${slot}_texture.png`; // Generic name
                                        const newTextureAsset = {
                                            id: textureId,
                                            name: textureName,
                                            type: "texture",
                                            data: a.definition[slot],
                                            thumbnail: null, // Will be generated on load if needed or on re-import
                                            isFavorite: false,
                                            isBuiltIn: false,
                                            folderId: a.folderId, // Put in same folder as material
                                            tags: ["texture", "auto-migrated"],
                                            history: [],
                                            references: [],
                                        };
                                        this.assets.push(newTextureAsset); // Add new texture asset
                                        a.definition[slot] = textureId; // Link material to new texture asset ID
                                        if (!a.references.includes(textureId)) {
                                            a.references.push(textureId);
                                        }
                                        console.log(
                                            `AssetsPanel: Migrated texture data URL for '${a.name}' to new texture asset '${textureName}'.`,
                                        );
                                    }
                                }
                            }
                        }
                        return a;
                    });
                this.assets = [...loadedUserAssets]; // Start with loaded user assets
            }
            if (data.folders) this.folders = data.folders;

            // Load thumbnail size
            const storedSize = localStorage.getItem("assetsPanel_thumbnailSize");
            if (storedSize) {
                this.currentThumbnailSize = parseInt(storedSize, 10);
                if (this.dom.thumbnailSizeSlider) {
                    this.dom.thumbnailSizeSlider.value = this.currentThumbnailSize;
                }
                this.dom.panel.style.setProperty(
                    "--thumbnail-size",
                    `${this.currentThumbnailSize}px`,
                );
            }
        } catch (e) {
            console.error("Failed to load assets", e);
            this._migrateLegacy(); // Attempt migration if load fails
        }
    }

    // MODIFIED: Migration logic for v3 to v4, and very old legacy
    static _migrateLegacy() {
        // Migration from v3 to v4 (adding history, references)
        // FIX: Only migrate if there are no assets currently in memory.
        // This prevents accidental data loss if v4 is missing but v3 exists.
        if (this.assets.length > 0) {
            return;
        }
        const v3Raw = localStorage.getItem("assetsPanel_data_v3");
        if (v3Raw) { // This check is now safe because of the guard above.
            try {
                const data = JSON.parse(v3Raw);
                if (data.assets) {
                    this.assets = data.assets.map((a) => ({
                        ...a,
                        history: [], // Initialize history for all assets
                        references: [], // Initialize references for all assets
                    }));
                }
                if (data.folders) this.folders = data.folders;
                console.log(
                    "AssetsPanel: Migrated assets from v3 to v4 storage. Initialized history and references.",
                );
                this._saveToStorage(); // Save in new v4 format
                localStorage.removeItem("assetsPanel_data_v3"); // Remove old key
                return;
            } catch (e) {
                console.warn("AssetsPanel: v3 migration failed", e);
            }
        }

        // Fallback for very old 'assetsPanel_assets' (pre-v3)
        const old = localStorage.getItem("assetsPanel_assets");
        if (!old) return; // No legacy data found at all
        try {
            const arr = JSON.parse(old);
            this.assets = (arr || []).map((a) => ({
                ...a,
                id: a.id || `asset_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
                tags: [],
                history: [], // NEW: Initialize history for very old assets
                references: [], // NEW: Initialize references for very old assets
            }));
            this.folders = {};
            this._saveToStorage();
            localStorage.removeItem("assetsPanel_assets");
            console.log("AssetsPanel: Migrated very old assets to v4 storage.");
        } catch (e) {
            console.warn("AssetsPanel: Very old legacy migration failed", e);
        }
    }

    // ------------------------------------------------------------------
    // Event listeners and DOM behavior - MODIFIED FOR NEW UI ELEMENTS
    // ------------------------------------------------------------------
    static _setupEventListeners() {
        this._setupPaneResizers();
        this._refreshDOMCache();
        this._bindCurrentImportInputs();

        // Upload zone drag for files (and basic folder detection)
        if (this.dom.uploadZone) {
            this.dom.uploadZone.ondragover = (e) => {
                e.preventDefault();
                this.dom.uploadZone.classList.add("dragover");
            };
            this.dom.uploadZone.ondragleave = () =>
                this.dom.uploadZone.classList.remove("dragover");
            this.dom.uploadZone.ondrop = async (e) => {
                e.preventDefault();
                this.dom.uploadZone.classList.remove("dragover");

                const droppedItems = Array.from(e.dataTransfer.items || []);
                const files = Array.from(e.dataTransfer.files || []);

                const hasDirectory = droppedItems.some(
                    (item) =>
                        item.webkitGetAsEntry && item.webkitGetAsEntry().isDirectory,
                );

                if (hasDirectory) {
                    alert(
                        "Folder drop is not supported for drag-and-drop directly into the dropzone. Please use the 'Browse Folder' button to import directories.",
                    );
                    this.hideUploadZone();
                    return;
                }

                for (const file of files) {
                    if (file.webkitRelativePath) {
                        const pathSegments = file.webkitRelativePath.split("/");
                        pathSegments.pop();
                        const folderPath = pathSegments.join("/");
                        const targetFolderId = this._ensureFolderPath(
                            folderPath,
                            this.openFolderId,
                        );
                        await this._addAssetFromFile(file, targetFolderId);
                    } else {
                        await this._addAssetFromFile(file, this.openFolderId);
                    }
                }
                this.hideUploadZone();
            };
        }

        // Single/multi file input (static in HTML)
        if (this.dom.uploadInput) {
            this.dom.uploadInput.onchange = async (e) => {
                const files = Array.from(e.target.files);
                for (const file of files) {
                    await this._addAssetFromFile(file, this.openFolderId);
                }
                this.hideUploadZone();
                e.target.value = ""; // Clear input value
            };
        }

        // Folder input (static in HTML)
        if (this.dom.uploadFolderInput) {
            this.dom.uploadFolderInput.onchange = async (e) => {
                await this._addAssetsFromFolderInput(
                    Array.from(e.target.files),
                    this.openFolderId,
                );
                this.hideUploadZone();
                e.target.value = ""; // Clear input value
            };
        }

        // Native Assets grid context menu. Folder/asset cards stop propagation,
        // so this handler only handles empty grid space.
        if (this.dom.grid) {
            this.dom.grid.oncontextmenu = (e) => {
                if (e.target.closest(".asset-item")) return;
                e.preventDefault();
                e.stopPropagation();
                this._showEmptyGridContextMenu(e);
            };
        }

        // Renderer drag/drop -> add to scene or apply material/texture - MODIFIED: Passes event to _addToScene
        if (this.renderer && this.renderer.domElement) {
            this.renderer.domElement.ondragover = (e) => e.preventDefault();
            this.renderer.domElement.ondrop = (e) => {
                e.preventDefault();
                try {
                    const data = JSON.parse(e.dataTransfer.getData("application/json"));
                    if (data && data.assetId) this._addToScene(data.assetId, e); // Pass event for drop target checking
                } catch (err) {
                    /* ignore invalid drops */
                }
            };
        }

        // Whole-panel height resizing is handled by _setupPanelHeightResize().
        // The old mouse-only header handler was removed because the professional
        // UI can rebuild the header and leave a stale DOM reference.

        // Global click: close Assets context menu ONLY when clicking outside
        // any context-menu surface. The old unconditional hide killed submenu
        // interactions on every click.
        document.addEventListener("click", (e) => {
            const insideAnyContextMenu =
                !!e.target.closest(
                    "#contextMenu, #__sm_ctx_root, .context-menu, .sm-context-menu, [data-sm-context-menu='true']"
                );

            if (!insideAnyContextMenu) {
                this._hideNativeContextMenu?.();
            }

            if (
                this.dom.panel &&
                !this.dom.panel.contains(e.target) &&
                !insideAnyContextMenu
            ) {
                if (
                    this.renderer &&
                    this.renderer.domElement &&
                    this.renderer.domElement.contains(e.target)
                ) {
                    // Do nothing, assume user is interacting with the 3D scene
                } else {
                    this.selectAsset(null, null, false, null); // Deselect all assets
                }
            }
        });

        document.querySelectorAll(".view-mode-btn").forEach((btn) => {
            btn.addEventListener("click", () => {
                // Remove active from all buttons
                document
                    .querySelectorAll(".view-mode-btn")
                    .forEach((b) => b.classList.remove("active"));
                // Add active to clicked one
                btn.classList.add("active");

                const mode = btn.dataset.mode;
                const gridEl = document.getElementById("assetsGrid");

                if (mode === "list") {
                    gridEl.classList.add("list-view");
                } else {
                    gridEl.classList.remove("list-view");
                }

                // Optional: re-render to better adapt item content in list mode
                AssetsPanel.render();
            });
        });

        // Keyboard shortcuts - MODIFIED: Added multi-tagging shortcut
        document.addEventListener("keydown", (e) => {
            const isPanelActive =
                this.dom.panel.contains(document.activeElement) ||
                this.dom.panel.classList.contains("visible");

            if (isPanelActive) {
                if (e.key === "Delete") {
                    if (this.selectedIds.size) {
                        e.preventDefault();
                        this.deleteAsset();
                    }
                }
                if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
                    e.preventDefault();
                    this._selectAllInView();
                }
                if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") {
                    if (this.selectedIds.size) {
                        const names = Array.from(this.selectedIds)
                            .map((id) => (this._findById(id) || {}).name)
                            .filter(Boolean)
                            .join("\n");
                        navigator.clipboard.writeText(names).catch(() => { });
                    }
                }
                // NEW: Multi-tagging shortcut (Ctrl+T)
                if (
                    (e.ctrlKey || e.metaKey) &&
                    e.key.toLowerCase() === "t" &&
                    this.selectedIds.size > 1
                ) {
                    e.preventDefault();
                    this._promptMultiTag();
                }
            }
        });

        document.addEventListener('click', e => {
            const modal = document.getElementById('dependencyGraphModal');
            if (!modal) return;

            if (e.target === modal || e.target.classList.contains('modal-close-btn')) {
                modal.style.display = 'none';
                // Optional: destroy network instance if you want to clean up memory
                // if (window.currentGraphNetwork) window.currentGraphNetwork.destroy();
            }
        });

        // Folder sidebar dblclick -> open (unchanged)
        if (this.dom.categoriesContainer) {
            this.dom.categoriesContainer.addEventListener("dblclick", (e) => {
                const node = e.target.closest(".category-item");
                if (!node) return;
                const id = node.dataset.folderId;
                if (id === "") {
                    this.openFolderId = null;
                    this.currentCategory = "project";
                } else if (id) {
                    this.openFolderId = id;
                    this.currentCategory = "project";
                }
                document
                    .querySelectorAll(".category-item.active")
                    .forEach((c) => c.classList.remove("active"));
                node.classList.add("active");
                this.render();
            });
        }

        // Thumbnail size slider (unchanged)
        if (this.dom.thumbnailSizeSlider) {
            this.dom.thumbnailSizeSlider.value = this.currentThumbnailSize;
            this.dom.thumbnailSizeSlider.oninput = (e) =>
                this.setThumbnailSize(e.target.value);
        }

        // NEW: Tag Cloud click handler
        if (this.dom.tagCloudContainer) {
            this.dom.tagCloudContainer.addEventListener("click", (e) => {
                const tagBtn = e.target.closest(".tag-cloud-tag");
                if (tagBtn) {
                    const tag = tagBtn.dataset.tag;
                    this.dom.searchBox.value = tag; // Put tag in search box
                    this.render(tag.toLowerCase()); // Filter by tag
                }
            });
        }
    }

    // ------------------------------------------------------------------
    // Whole Content Browser height resize
    // ------------------------------------------------------------------
    static _getPanelHeightBounds() {
        const minHeight = Math.max(
            180,
            Number(this.panelMinHeight) || 220,
        );

        const viewportHeight = Math.max(
            minHeight,
            window.innerHeight ||
            document.documentElement.clientHeight ||
            800,
        );

        const maxHeight = Math.max(
            minHeight,
            Math.floor(
                viewportHeight *
                (Number(this.panelMaxViewportRatio) || 0.86),
            ),
        );

        return {
            minHeight,
            maxHeight,
        };
    }

    static _clampPanelHeight(value) {
        const { minHeight, maxHeight } =
            this._getPanelHeightBounds();

        const numeric = Number(value);

        if (!Number.isFinite(numeric)) {
            return minHeight;
        }

        return Math.min(
            maxHeight,
            Math.max(minHeight, numeric),
        );
    }

    static _ensurePanelHeightResizer() {
        this._refreshDOMCache();

        const panel = this.dom.panel;
        if (!panel) return null;

        let handle =
            panel.querySelector(
                ":scope > .assets-panel-height-resizer",
            );

        if (!handle) {
            handle = document.createElement("div");
            handle.className =
                "assets-panel-height-resizer";
            handle.setAttribute("role", "separator");
            handle.setAttribute(
                "aria-orientation",
                "horizontal",
            );
            handle.setAttribute(
                "aria-label",
                "Resize Content Browser height",
            );
            handle.tabIndex = -1;

            // Inline fallback makes resize work even if an older AssetsPanel CSS
            // is still loaded or another stylesheet overrides the panel shell.
            Object.assign(handle.style, {
                position: "absolute",
                top: "0",
                left: "0",
                right: "0",
                height: "8px",
                zIndex: "60",
                cursor: "ns-resize",
                touchAction: "none",
                userSelect: "none",
                background: "transparent",
            });

            panel.prepend(handle);
        }

        this.dom.heightResizer = handle;
        return handle;
    }

    static _publishPanelHeightResize(height) {
        document.documentElement.style.setProperty(
            "--assets-panel-height",
            `${Math.round(height)}px`,
        );

        cancelAnimationFrame(
            this.panelResizeRAF || 0,
        );

        this.panelResizeRAF =
            requestAnimationFrame(() => {
                this.panelResizeRAF = 0;

                window.dispatchEvent(
                    new CustomEvent(
                        "sm-assets-panel-resized",
                        {
                            detail: {
                                panel: this.dom.panel,
                                height:
                                    Math.round(height),
                            },
                        },
                    ),
                );
            });
    }

    static _setPanelHeight(
        height,
        {
            persist = false,
            important = true,
        } = {},
    ) {
        this._refreshDOMCache();

        const panel = this.dom.panel;
        if (!panel) return 0;

        const nextHeight =
            this._clampPanelHeight(height);

        panel.style.setProperty(
            "height",
            `${nextHeight}px`,
            important ? "important" : "",
        );

        // Remove any browser-native vertical resize rule if another stylesheet
        // adds it. The SM Engine resize system owns the height.
        panel.style.resize = "none";

        if (persist) {
            try {
                localStorage.setItem(
                    this.panelHeightKey,
                    String(Math.round(nextHeight)),
                );
            } catch (_) { }
        }

        this._publishPanelHeightResize(
            nextHeight,
        );

        return nextHeight;
    }

    static _restorePanelHeight() {
        this._refreshDOMCache();

        const panel = this.dom.panel;
        if (!panel) return false;

        let stored = NaN;

        try {
            stored = parseFloat(
                localStorage.getItem(
                    this.panelHeightKey,
                ) || "",
            );
        } catch (_) { }

        if (
            Number.isFinite(stored) &&
            stored > 0
        ) {
            this._setPanelHeight(stored, {
                persist: false,
                important: true,
            });
            return true;
        }

        return false;
    }

    static resetPanelHeight() {
        this._refreshDOMCache();

        const panel = this.dom.panel;
        if (!panel) return;

        try {
            localStorage.removeItem(
                this.panelHeightKey,
            );
        } catch (_) { }

        panel.style.removeProperty("height");
        panel.style.removeProperty("resize");

        // Publish the computed CSS default when the panel is visible.
        requestAnimationFrame(() => {
            const height =
                panel.getBoundingClientRect()
                    .height;

            if (height > 0) {
                this._publishPanelHeightResize(
                    height,
                );
            }
        });
    }

    static _setupPanelHeightResize() {
        this._refreshDOMCache();

        const panel = this.dom.panel;
        const header = this.dom.header;
        const handle =
            this._ensurePanelHeightResizer();

        if (!panel || !handle) return;

        const beginResize = (
            event,
            source = "handle",
        ) => {
            if (
                event.button !== undefined &&
                event.button !== 0
            ) {
                return;
            }

            // Header dragging is useful, but controls/search/buttons must remain
            // clickable. The dedicated top handle has no such exclusions.
            if (
                source === "header" &&
                event.target.closest(
                    [
                        "button",
                        "input",
                        "select",
                        "textarea",
                        "label",
                        "a",
                        ".assets-panel-controls",
                        ".cb-toolbar-right",
                        ".view-mode-toggle",
                    ].join(","),
                )
            ) {
                return;
            }

            event.preventDefault();
            event.stopPropagation();

            const startHeight =
                panel.getBoundingClientRect()
                    .height;

            if (startHeight <= 0) return;

            this.panelResizeState = {
                pointerId:
                    event.pointerId ?? null,
                startY: event.clientY,
                startHeight,
                source,
            };

            document.body.classList.add(
                "assets-panel-height-resizing",
            );

            document.body.style.userSelect =
                "none";
            document.body.style.cursor =
                "ns-resize";

            handle.classList.add(
                "is-active",
            );

            if (
                event.pointerId !== undefined &&
                typeof handle.setPointerCapture ===
                "function" &&
                source === "handle"
            ) {
                try {
                    handle.setPointerCapture(
                        event.pointerId,
                    );
                } catch (_) { }
            }

            const onMove = (moveEvent) => {
                if (!this.panelResizeState) {
                    return;
                }

                // Panel is docked to bottom:
                // moving the pointer upward increases its height.
                const deltaY =
                    this.panelResizeState.startY -
                    moveEvent.clientY;

                this._setPanelHeight(
                    this.panelResizeState
                        .startHeight + deltaY,
                    {
                        persist: false,
                        important: true,
                    },
                );
            };

            const onEnd = () => {
                if (!this.panelResizeState) {
                    return;
                }

                const finalHeight =
                    panel.getBoundingClientRect()
                        .height;

                this._setPanelHeight(
                    finalHeight,
                    {
                        persist: true,
                        important: true,
                    },
                );

                this.panelResizeState = null;

                handle.classList.remove(
                    "is-active",
                );

                document.body.classList.remove(
                    "assets-panel-height-resizing",
                );

                document.body.style.userSelect =
                    "";
                document.body.style.cursor =
                    "";

                window.removeEventListener(
                    "pointermove",
                    onMove,
                    true,
                );
                window.removeEventListener(
                    "pointerup",
                    onEnd,
                    true,
                );
                window.removeEventListener(
                    "pointercancel",
                    onEnd,
                    true,
                );
            };

            window.addEventListener(
                "pointermove",
                onMove,
                true,
            );
            window.addEventListener(
                "pointerup",
                onEnd,
                true,
            );
            window.addEventListener(
                "pointercancel",
                onEnd,
                true,
            );
        };

        if (
            handle.dataset
                .panelHeightResizeBound !==
            "true"
        ) {
            handle.addEventListener(
                "pointerdown",
                (event) =>
                    beginResize(
                        event,
                        "handle",
                    ),
            );

            handle.addEventListener(
                "dblclick",
                (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    this.resetPanelHeight();
                },
            );

            handle.addEventListener(
                "pointerenter",
                () => {
                    handle.style.background =
                        "rgba(130, 163, 203, 0.24)";
                },
            );

            handle.addEventListener(
                "pointerleave",
                () => {
                    if (
                        !this.panelResizeState
                    ) {
                        handle.style.background =
                            "transparent";
                    }
                },
            );

            handle.dataset.panelHeightResizeBound =
                "true";
        }

        if (
            header &&
            header.dataset
                .panelHeightResizeBound !==
            "true"
        ) {
            header.addEventListener(
                "pointerdown",
                (event) =>
                    beginResize(
                        event,
                        "header",
                    ),
            );

            header.dataset.panelHeightResizeBound =
                "true";
        }

        if (
            document.documentElement.dataset
                .assetsPanelWindowResizeBound !==
            "true"
        ) {
            window.addEventListener(
                "resize",
                () => {
                    const activePanel =
                        document.getElementById(
                            "assetsPanel",
                        );

                    if (!activePanel) return;

                    const inlineHeight =
                        parseFloat(
                            activePanel.style.height ||
                            "",
                        );

                    if (
                        Number.isFinite(
                            inlineHeight,
                        )
                    ) {
                        this._setPanelHeight(
                            inlineHeight,
                            {
                                persist: true,
                                important: true,
                            },
                        );
                    }
                },
                {
                    passive: true,
                },
            );

            document.documentElement.dataset.assetsPanelWindowResizeBound =
                "true";
        }
    }

    static _ensurePaneResizers() {
        if (!this.dom.content || !this.dom.categoriesContainer || !this.dom.gridPane) return;

        let leftResizer = this.dom.content.querySelector(".assets-pane-resizer-left");
        if (!leftResizer) {
            leftResizer = document.createElement("div");
            leftResizer.className = "assets-pane-resizer assets-pane-resizer-left";
            leftResizer.setAttribute("role", "separator");
            leftResizer.setAttribute("aria-orientation", "vertical");
            leftResizer.setAttribute("aria-label", "Resize asset sources panel");
            this.dom.categoriesContainer.insertAdjacentElement("afterend", leftResizer);
        }

        if (this.dom.propertiesPanel) {
            let rightResizer = this.dom.content.querySelector(".assets-pane-resizer-right");
            if (!rightResizer) {
                rightResizer = document.createElement("div");
                rightResizer.className = "assets-pane-resizer assets-pane-resizer-right";
                rightResizer.setAttribute("role", "separator");
                rightResizer.setAttribute("aria-orientation", "vertical");
                rightResizer.setAttribute("aria-label", "Resize asset details panel");
                this.dom.propertiesPanel.insertAdjacentElement("beforebegin", rightResizer);
            }
        }
    }

    static _restorePaneLayout() {
        const applyWidth = (key, element) => {
            if (!element) return;
            const stored = parseFloat(localStorage.getItem(key) || "");
            if (Number.isFinite(stored) && stored > 0) {
                element.style.flex = `0 0 ${stored}px`;
            }
        };

        applyWidth(this.paneLayoutKeys.sidebar, this.dom.categoriesContainer);
        applyWidth(this.paneLayoutKeys.properties, this.dom.propertiesPanel);
    }

    static _setupPaneResizers() {
        const bindHandle = (selector, pane, side) => {
            const handle = this.dom.content?.querySelector(selector);
            if (!handle || !pane || handle.dataset.resizeBound === "true") return;

            handle.addEventListener("pointerdown", (event) => {
                if (event.button !== 0 || !this.dom.content) return;

                const contentRect = this.dom.content.getBoundingClientRect();
                const currentPaneRect = pane.getBoundingClientRect();
                const sidebarWidth = this.dom.categoriesContainer?.getBoundingClientRect().width || 0;
                const propertiesWidth = this.dom.propertiesPanel?.getBoundingClientRect().width || 0;
                const handleCount = this.dom.content.querySelectorAll(".assets-pane-resizer").length;
                const handleAllowance = handleCount * 12;
                const gridMinWidth = 360;
                const minWidth = side === "left" ? 180 : 220;
                const otherPaneWidth = side === "left" ? propertiesWidth : sidebarWidth;
                const maxWidth = Math.max(minWidth, contentRect.width - otherPaneWidth - gridMinWidth - handleAllowance);

                this.paneResizeState = {
                    handle,
                    pane,
                    side,
                    startX: event.clientX,
                    startWidth: currentPaneRect.width,
                    minWidth,
                    maxWidth,
                };

                handle.classList.add("is-active");
                document.body.classList.add("assets-pane-resizing");
                if (typeof handle.setPointerCapture === "function") {
                    handle.setPointerCapture(event.pointerId);
                }

                const onMove = (moveEvent) => {
                    if (!this.paneResizeState) return;
                    const deltaX = moveEvent.clientX - this.paneResizeState.startX;
                    const direction = this.paneResizeState.side === "left" ? 1 : -1;
                    const nextWidth = Math.min(
                        Math.max(this.paneResizeState.startWidth + deltaX * direction, this.paneResizeState.minWidth),
                        this.paneResizeState.maxWidth,
                    );
                    this.paneResizeState.pane.style.flex = `0 0 ${nextWidth}px`;
                };

                const onEnd = () => {
                    if (!this.paneResizeState) return;
                    const { pane: activePane, side: activeSide, handle: activeHandle } = this.paneResizeState;
                    const storageKey = activeSide === "left" ? this.paneLayoutKeys.sidebar : this.paneLayoutKeys.properties;
                    localStorage.setItem(storageKey, `${Math.round(activePane.getBoundingClientRect().width)}`);
                    activeHandle.classList.remove("is-active");
                    document.body.classList.remove("assets-pane-resizing");
                    this.paneResizeState = null;
                    window.removeEventListener("pointermove", onMove);
                    window.removeEventListener("pointerup", onEnd);
                    window.removeEventListener("pointercancel", onEnd);
                };

                window.addEventListener("pointermove", onMove);
                window.addEventListener("pointerup", onEnd);
                window.addEventListener("pointercancel", onEnd);
            });

            handle.addEventListener("dblclick", () => {
                pane.style.flex = "";
                const storageKey = side === "left" ? this.paneLayoutKeys.sidebar : this.paneLayoutKeys.properties;
                localStorage.removeItem(storageKey);
            });

            handle.dataset.resizeBound = "true";
        };

        bindHandle(".assets-pane-resizer-left", this.dom.categoriesContainer, "left");
        bindHandle(".assets-pane-resizer-right", this.dom.propertiesPanel, "right");
    }

    // ------------------------------------------------------------------
    // Asset ingestion and thumbnails - MODIFIED: For history, references, auto-tagging
    // ------------------------------------------------------------------
    static async _addAssetFromFile(
        file,
        folderId = null
    ) {
        const type =
            this._getAssetType(file.name);

        if (!type) {
            console.warn(
                `AssetsPanel: Unsupported file type for ${file.name}. Skipping.`
            );
            return null;
        }

        // --------------------------------------------------------------
        // Conflict resolution
        // --------------------------------------------------------------
        let finalFileName = file.name;
        let shouldOverwrite = false;

        let existingAsset =
            this.assets.find(
                (asset) =>
                    !asset.isBuiltIn &&
                    asset.name ===
                    finalFileName &&
                    (asset.folderId || null) ===
                    (folderId || null)
            );

        if (existingAsset) {
            const response = prompt(
                `Asset '${file.name}' already exists in this folder.\n` +
                `Enter a NEW NAME to rename, type 'overwrite' to replace, or leave blank to skip:`,
                file.name
            );

            if (
                response === null ||
                response.trim() === ""
            ) {
                console.log(
                    `AssetsPanel: Skipped import of '${file.name}'.`
                );
                return null;
            }

            if (
                response.toLowerCase() ===
                "overwrite"
            ) {
                shouldOverwrite = true;
            } else {
                finalFileName =
                    response.trim();

                if (
                    this.assets.some(
                        (asset) =>
                            !asset.isBuiltIn &&
                            asset.name ===
                            finalFileName &&
                            (asset.folderId ||
                                null) ===
                            (folderId ||
                                null)
                    )
                ) {
                    alert(
                        `The new name '${finalFileName}' also conflicts with an existing asset. Skipping.`
                    );
                    return null;
                }
            }
        }

        if (
            shouldOverwrite &&
            existingAsset
        ) {
            this._removeAsset(
                existingAsset.id
            );
        }

        const id =
            typeof crypto !== "undefined" &&
                typeof crypto.randomUUID ===
                "function"
                ? `asset_${crypto.randomUUID()}`
                : `asset_${Date.now()}_${Math.floor(
                    Math.random() * 1000000
                )}`;

        const storage =
            await this._getPersistentAssetStorage();

        let fileContent = null;
        let storageKind = null;
        let storageKey = null;

        const isSmallText =
            type === "code" ||
            type === "material" ||
            type === "scene";

        if (isSmallText) {
            try {
                fileContent =
                    await file.text();
                storageKind = "text";
            } catch (error) {
                console.error(
                    `AssetsPanel: Failed to read ${file.name}.`,
                    error
                );
                return null;
            }
        } else {
            // Never encode binary user files into localStorage.
            // Keep the original File/Blob in IndexedDB and use a temporary
            // object URL during this browser session.
            try {
                if (storage) {
                    await storage.saveImportedFile(
                        id,
                        file
                    );

                    fileContent =
                        storage.createRuntimeURL(
                            id,
                            file
                        );

                    storageKind =
                        "indexeddb-blob";
                    storageKey = id;
                } else {
                    // Emergency compatibility fallback when IndexedDB is
                    // unavailable. This remains session-only for large files.
                    fileContent =
                        URL.createObjectURL(file);
                    storageKind =
                        "session-blob";
                }
            } catch (error) {
                console.error(
                    `AssetsPanel: Failed to persist ${file.name}.`,
                    error
                );
                return null;
            }
        }

        const asset = {
            id,
            name: finalFileName,
            type,
            data: fileContent,
            thumbnail: null,
            isFavorite: false,
            isBuiltIn: false,
            folderId,
            tags: [],
            history: [],
            references: [],
            storageKind,
            storageKey,
            sourceType: "local-import",
            sourceSize:
                Number(file.size || 0),
            sourceLastModified:
                Number(file.lastModified || 0)
        };

        // --------------------------------------------------------------
        // Thumbnail / definition
        // --------------------------------------------------------------
        if (type === "material") {
            try {
                const definition =
                    JSON.parse(fileContent);

                asset.definition =
                    definition;

                asset.thumbnail =
                    await this._generateMaterialThumbnail(
                        definition
                    );

                asset.references =
                    this._detectMaterialReferences(
                        definition
                    );
            } catch (error) {
                console.warn(
                    `Invalid material JSON for ${finalFileName}`,
                    error
                );

                asset.thumbnail =
                    this._svgIcon("material");
            }
        } else if (type === "code") {
            asset.thumbnail =
                this._svgIcon("code");
        } else if (type === "prefab") {
            asset.thumbnail =
                this._svgIcon(
                    "prefab-create"
                );
        } else if (type === "model") {
            asset.thumbnail =
                await this._generateThumbnail(
                    fileContent,
                    "model",
                    file
                );
        } else {
            asset.thumbnail =
                await this._generateThumbnail(
                    fileContent,
                    type,
                    file
                );
        }

        this._autoTagAsset(asset);
        this.assets.push(asset);

        this._commitAssetVersion(
            asset.id,
            "Initial Import"
        );

        this._saveToStorage();

        if (
            typeof this.onAssetAdded ===
            "function"
        ) {
            this.onAssetAdded(asset);
        }

        this.render();
        this._buildTagCloud();

        return asset;
    }

    // ==================================================================
    // === NATIVE PBR MATERIAL PACKAGE IMPORT                         ===
    // ==================================================================
    // AssetsPanel is the single owner of material ingestion.
    // A material package is detected from texture-map naming, not from
    // preview meshes (.gltf/.glb/.fbx/.obj) shipped by asset providers.

    static _pbrTextureRole(fileName = "") {
        const name = String(fileName || "").toLowerCase();

        const patterns = [
            ["color", /(^|[_\-.])(albedo|basecolor|base_color|basecolour|diff|diffuse|color|colour|col)([_\-.]|$)/i],
            ["normalGL", /(^|[_\-.])(nor_gl|normal_gl|normalgl|nrm_gl)([_\-.]|$)/i],
            ["normalDX", /(^|[_\-.])(nor_dx|normal_dx|normaldx|nrm_dx)([_\-.]|$)/i],
            ["normal", /(^|[_\-.])(normal|nor|nrm)([_\-.]|$)/i],
            ["roughness", /(^|[_\-.])(roughness|rough|rgh)([_\-.]|$)/i],
            ["metalness", /(^|[_\-.])(metalness|metallic|metal|mtl)([_\-.]|$)/i],
            ["ao", /(^|[_\-.])(ambientocclusion|ambient_occlusion|occlusion|ao)([_\-.]|$)/i],
            ["height", /(^|[_\-.])(displacement|disp|height|heightmap)([_\-.]|$)/i],
            ["opacity", /(^|[_\-.])(opacity|alpha|transparency|trans)([_\-.]|$)/i],
            ["emissive", /(^|[_\-.])(emissive|emission|emit)([_\-.]|$)/i],
            ["orm", /(^|[_\-.])(orm|arm)([_\-.]|$)/i],
            ["rma", /(^|[_\-.])(rma)([_\-.]|$)/i],
            ["mra", /(^|[_\-.])(mra)([_\-.]|$)/i]
        ];

        for (const [role, pattern] of patterns) {
            if (pattern.test(name)) return role;
        }

        return null;
    }

    static _isPBRTextureFile(file) {
        if (!file?.name) return false;
        return /\.(png|jpe?g|webp|bmp|tiff?|exr|hdr)$/i.test(file.name);
    }

    static _looksLikePBRMaterialFolder(files = []) {
        const fileList = Array.from(files || [])
            .filter((file) => this._isPBRTextureFile(file));

        if (!fileList.length) return false;

        const roles = new Set(
            fileList
                .map((file) => this._pbrTextureRole(file.name))
                .filter(Boolean)
        );

        const hasColor = roles.has("color");
        const hasSurfaceData =
            roles.has("normalGL") ||
            roles.has("normalDX") ||
            roles.has("normal") ||
            roles.has("roughness") ||
            roles.has("metalness") ||
            roles.has("ao") ||
            roles.has("height") ||
            roles.has("orm") ||
            roles.has("rma") ||
            roles.has("mra");

        return (hasColor && hasSurfaceData) || roles.size >= 3;
    }

    static _pbrProviderFromFiles(files = []) {
        const joined = Array.from(files || [])
            .map((file) =>
                String(file.webkitRelativePath || file.name || "").toLowerCase()
            )
            .join(" ");

        if (joined.includes("polyhaven") || joined.includes("poly_haven")) {
            return "Poly Haven";
        }

        if (joined.includes("poliigon")) {
            return "Poliigon";
        }

        if (joined.includes("ambientcg")) {
            return "ambientCG";
        }

        if (joined.includes("quixel") || joined.includes("megascans")) {
            return "Quixel Megascans";
        }

        if (joined.includes("textures.com")) {
            return "Textures.com";
        }

        return "PBR Package";
    }

    static _cleanPBRMaterialName(value = "") {
        let name = String(value || "")
            .replace(/\.[^.]+$/, "")
            .replace(/(^|[_\-.])(1k|2k|4k|8k|16k)([_\-.]|$)/ig, " ")
            .replace(/(^|[_\-.])(albedo|basecolor|base_color|basecolour|diff|diffuse|color|colour|col|nor_gl|nor_dx|normal_gl|normal_dx|normal|nor|nrm|roughness|rough|rgh|metalness|metallic|metal|mtl|ambientocclusion|ambient_occlusion|occlusion|ao|displacement|disp|height|heightmap|opacity|alpha|transparency|trans|emissive|emission|emit|orm|arm|rma|mra)([_\-.]|$)/ig, " ")
            .replace(/[_\-.]+/g, " ")
            .replace(/\s+/g, " ")
            .trim();

        return name || "Imported PBR Material";
    }

    static _pbrMaterialName(files = []) {
        const list = Array.from(files || []);
        const colorFile =
            list.find(
                (file) => this._pbrTextureRole(file.name) === "color"
            ) ||
            list.find((file) => this._isPBRTextureFile(file)) ||
            list[0];

        const fromColor = this._cleanPBRMaterialName(colorFile?.name || "");

        if (
            fromColor &&
            !/^(package|packages|material|materials|textures?|maps?|assets?|pbr)$/i.test(fromColor)
        ) {
            return fromColor;
        }

        const firstPath = String(
            list[0]?.webkitRelativePath || ""
        );

        const rootName = firstPath
            .split("/")
            .filter(Boolean)[0];

        const fromRoot = this._cleanPBRMaterialName(rootName);

        return fromRoot || fromColor || "Imported PBR Material";
    }

    static _pbrRootFolderName(files = [], materialName = "Material") {
        const firstPath = String(
            Array.from(files || [])[0]?.webkitRelativePath || ""
        );

        const rawRoot = firstPath
            .split("/")
            .filter(Boolean)[0];

        const cleanedRoot = this._cleanPBRMaterialName(rawRoot);

        if (
            cleanedRoot &&
            !/\.(gltf|glb|fbx|obj)$/i.test(rawRoot) &&
            !/^(package|packages|material|materials|textures?|maps?|assets?|pbr)$/i.test(cleanedRoot)
        ) {
            return cleanedRoot;
        }

        return materialName;
    }

    static _isMaterialTextureCompatibleAsset(asset) {
        if (!asset) return false;

        if (this._isTextureCompatibleAssetType(asset.type)) {
            return true;
        }

        return /\.(exr|hdr)$/i.test(String(asset.name || ""));
    }

    static async _loadMaterialTextureAsset(textureAsset, options = {}) {
        if (!textureAsset) return null;

        const source = this._getAssetSourceUrl(textureAsset);
        if (!source) return null;

        const fileName = String(textureAsset.name || "").toLowerCase();

        let loader = this.loaders?.texture || new THREE.TextureLoader();

        if (/\.exr$/i.test(fileName) && this.loaders?.exr) {
            loader = this.loaders.exr;
        } else if (/\.hdr$/i.test(fileName) && this.loaders?.hdri) {
            loader = this.loaders.hdri;
        }

        const texture = await new Promise((resolve) => {
            loader.load(
                source,
                resolve,
                undefined,
                (error) => {
                    console.warn(
                        `AssetsPanel: Failed to load material texture '${textureAsset.name}'.`,
                        error
                    );
                    resolve(null);
                }
            );
        });

        if (!texture) return null;

        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;

        const tiling = Math.max(
            0.001,
            Number(options.tiling) || 1
        );

        if (texture.repeat?.set) {
            texture.repeat.set(tiling, tiling);
        }

        const maxAnisotropy =
            this.renderer?.capabilities?.getMaxAnisotropy?.() || 1;

        texture.anisotropy = Math.min(
            8,
            maxAnisotropy
        );

        if ("colorSpace" in texture) {
            if (
                options.color === true &&
                THREE.SRGBColorSpace !== undefined
            ) {
                texture.colorSpace =
                    THREE.SRGBColorSpace;
            } else if (
                options.color !== true &&
                THREE.NoColorSpace !== undefined
            ) {
                texture.colorSpace =
                    THREE.NoColorSpace;
            }
        }

        texture.needsUpdate = true;

        return texture;
    }

    static async _importPBRMaterialFolder(
        files,
        baseFolderId = null,
        options = {}
    ) {
        const allFiles = Array.from(files || []);

        if (!this._looksLikePBRMaterialFolder(allFiles)) {
            throw new Error(
                "AssetsPanel: Selected folder does not look like a PBR material package."
            );
        }

        const provider =
            options.provider ||
            this._pbrProviderFromFiles(allFiles);

        const materialName =
            options.name ||
            this._pbrMaterialName(allFiles);

        const rootFolderName =
            options.folderName ||
            this._pbrRootFolderName(
                allFiles,
                materialName
            );

        const materialFolderId =
            this._ensureFolderPath(
                rootFolderName,
                baseFolderId
            );

        const texturesFolderId =
            this._ensureFolderPath(
                "textures",
                materialFolderId
            );

        // Only material maps are imported.
        // Provider preview meshes such as *.gltf/*.glb are intentionally ignored.
        const textureFiles = allFiles.filter(
            (file) =>
                this._isPBRTextureFile(file) &&
                !!this._pbrTextureRole(file.name)
        );

        const imported = [];
        const roleAssets = {};

        for (const file of textureFiles) {
            const asset = await this._addAssetFromFile(
                file,
                texturesFolderId
            );

            if (!asset) continue;

            imported.push(asset);

            const role =
                this._pbrTextureRole(file.name);

            if (role && !roleAssets[role]) {
                roleAssets[role] = asset;
            }
        }

        if (
            !roleAssets.normalGL &&
            !roleAssets.normalDX &&
            roleAssets.normal
        ) {
            roleAssets.normalGL =
                roleAssets.normal;
        }

        const definition = {
            version: 4,
            type: "MeshPhysicalMaterial",
            displayName: materialName,
            provider,
            color: "#ffffff",
            roughness: 1,
            metalness: 0,
            clearcoat: 0,
            clearcoatRoughness: 1,
            tiling: Number(options.tiling) || 1,
            normalStrength:
                Number(options.normalStrength) || 1,
            displacementScale:
                Number(options.displacementScale) || 0,
            normalConvention:
                roleAssets.normalDX ? "dx" : "gl",
            sourcePackage: {
                provider,
                importedAt: Date.now(),
                autoDetected:
                    options.autoDetected === true,
                ignoredPreviewModels:
                    allFiles
                        .filter(
                            (file) =>
                                /\.(gltf|glb|fbx|obj)$/i.test(
                                    file.name || ""
                                )
                        )
                        .map(
                            (file) =>
                                file.webkitRelativePath ||
                                file.name
                        ),
                originalFiles:
                    allFiles.map(
                        (file) =>
                            file.webkitRelativePath ||
                            file.name
                    )
            }
        };

        const assign = (slot, role) => {
            const asset = roleAssets[role];

            if (asset?.id) {
                definition[slot] = asset.id;
            }
        };

        assign("map", "color");
        assign(
            "normalMap",
            roleAssets.normalDX
                ? "normalDX"
                : "normalGL"
        );
        assign("roughnessMap", "roughness");
        assign("metalnessMap", "metalness");
        assign("aoMap", "ao");
        assign("displacementMap", "height");
        assign("opacityMap", "opacity");
        assign("emissiveMap", "emissive");
        assign("ormMap", "orm");

        if (roleAssets.rma?.id) {
            definition.packedMap =
                roleAssets.rma.id;
            definition.packedMapLayout =
                "RMA";
        }

        if (roleAssets.mra?.id) {
            definition.packedMap =
                roleAssets.mra.id;
            definition.packedMapLayout =
                "MRA";
        }

        const materialAsset =
            this.addMaterialAsset(
                `${materialName}.material.json`,
                JSON.stringify(
                    definition,
                    null,
                    2
                ),
                materialFolderId
            );

        if (!materialAsset) {
            throw new Error(
                "AssetsPanel: Could not create the PBR material asset."
            );
        }

        materialAsset.tags = [
            ...new Set([
                ...(materialAsset.tags || []),
                "material",
                "pbr",
                "paint-ready",
                String(provider)
                    .toLowerCase()
                    .replace(/\s+/g, "-")
            ])
        ];

        materialAsset.references = [
            ...new Set([
                ...(materialAsset.references || []),
                ...imported
                    .map((asset) => asset?.id)
                    .filter(Boolean)
            ])
        ];

        this._commitAssetVersion?.(
            materialAsset.id,
            `Imported PBR package (${provider})`
        );

        this._saveToStorage();
        this._syncRuntimeAssetRegistry?.();
        this.render();
        this._buildTagCloud();

        window.dispatchEvent(
            new CustomEvent(
                "sm:material-library-changed",
                {
                    detail: {
                        asset: materialAsset,
                        provider,
                        textureAssets: imported,
                        source:
                            "AssetsPanel._importPBRMaterialFolder"
                    }
                }
            )
        );

        console.log(
            `[AssetsPanel] PBR material '${materialName}' imported from ${provider}. ` +
            `${imported.length} texture maps imported; provider preview models ignored.`
        );

        return materialAsset;
    }

    static async importMaterialPackage(
        files,
        options = {}
    ) {
        const baseFolderId =
            options.folderId !== undefined
                ? options.folderId
                : this.openFolderId;

        return await this._importPBRMaterialFolder(
            files,
            baseFolderId,
            options
        );
    }

    static promptImportMaterialPackage(
        options = {}
    ) {
        return new Promise(
            (resolve, reject) => {
                const input =
                    document.createElement(
                        "input"
                    );

                input.type = "file";
                input.multiple = true;
                input.accept =
                    ".png,.jpg,.jpeg,.webp,.bmp,.tif,.tiff,.exr,.hdr,.gltf,.glb,.fbx,.obj";
                input.setAttribute(
                    "webkitdirectory",
                    ""
                );
                input.setAttribute(
                    "directory",
                    ""
                );
                input.style.display =
                    "none";

                document.body.appendChild(
                    input
                );

                input.addEventListener(
                    "change",
                    async () => {
                        try {
                            const files =
                                Array.from(
                                    input.files ||
                                    []
                                );

                            if (!files.length) {
                                resolve(null);
                                return;
                            }

                            const material =
                                await this.importMaterialPackage(
                                    files,
                                    options
                                );

                            resolve(material);
                        } catch (error) {
                            console.error(
                                "AssetsPanel: PBR material package import failed.",
                                error
                            );
                            reject(error);
                        } finally {
                            input.remove();
                        }
                    },
                    { once: true }
                );

                input.click();
            }
        );
    }

    static _ensureMaterialPackageImportButton() {
        if (
            document.getElementById(
                "assetsImportPBRMaterialBtn"
            )
        ) {
            return true;
        }

        this._refreshDOMCache?.();

        const host =
            this.dom?.header?.querySelector?.(
                ".assets-header-actions,.header-actions,.assets-toolbar,.toolbar"
            ) ||
            this.dom?.header;

        if (!host) return false;

        const button =
            document.createElement(
                "button"
            );

        button.id =
            "assetsImportPBRMaterialBtn";

        button.type =
            "button";

        button.className =
            "panel-btn assets-pbr-import-btn";

        button.title =
            "Import Poly Haven / Poliigon / ambientCG PBR material folder";

        button.innerHTML =
            '<i class="fas fa-layer-group"></i><span>PBR Material</span>';

        button.addEventListener(
            "click",
            () => {
                this.promptImportMaterialPackage({
                    folderId:
                        this.openFolderId ??
                        null
                }).catch(() => {});
            }
        );

        host.appendChild(button);

        return true;
    }

    static async _addAssetsFromFolderInput(files, baseFolderId) {
        const fileList = Array.from(files || []);

        if (
            this._looksLikePBRMaterialFolder(
                fileList
            )
        ) {
            console.log(
                "AssetsPanel: PBR material package detected. Importing as a material instead of importing provider preview models."
            );

            return await this._importPBRMaterialFolder(
                fileList,
                baseFolderId,
                {
                    autoDetected: true
                }
            );
        }

        console.log(`AssetsPanel: Importing ${fileList.length} files from folder...`);
        for (const file of fileList) {
            if (file.webkitRelativePath) {
                const pathSegments = file.webkitRelativePath.split("/");
                pathSegments.pop();
                const folderPath = pathSegments.join("/");

                const targetFolderId = this._ensureFolderPath(folderPath, baseFolderId);

                await this._addAssetFromFile(file, targetFolderId);
            } else {
                await this._addAssetFromFile(file, baseFolderId);
            }
        }
        console.log("AssetsPanel: Folder import complete.");
        this.render();
        this._buildTagCloud(); // MODIFIED: Rebuild tag cloud
    }

    static _ensureFolderPath(relativePath, baseParentId = null) {
        if (!relativePath) return baseParentId;

        const segments = relativePath.split("/").filter((s) => s !== "");
        let currentParentId = baseParentId;

        for (const segment of segments) {
            let existingFolder = Object.values(this.folders).find(
                (f) =>
                    f.name === segment &&
                    (f.parentId || null) === (currentParentId || null),
            );

            if (existingFolder) {
                currentParentId = existingFolder.id;
            } else {
                const newFolderId = this.createFolder(segment, currentParentId);
                currentParentId = newFolderId;
            }
        }
        return currentParentId;
    }

    static _generateThumbnail(dataURL, type, file) {
        if (type === "texture" || type === "image" || type === "icon" || type === "hdri") {
            return new Promise((resolve) => {
                const img = new Image();
                img.crossOrigin = "anonymous";
                img.onload = () => {
                    const canvas = document.createElement("canvas");
                    canvas.width = 128;
                    canvas.height = 128;
                    const ctx = canvas.getContext("2d");
                    ctx.drawImage(img, 0, 0, 128, 128);
                    resolve(canvas.toDataURL("image/png"));
                };
                img.onerror = () => resolve(this._svgIcon("texture"));
                img.src = dataURL;
            });
        }
        if (type === "video") {
            return new Promise((resolve) => {
                const video = document.createElement("video");
                video.crossOrigin = "anonymous";
                video.muted = true;
                video.playsInline = true;
                video.preload = "metadata";
                video.src = dataURL;

                const cleanup = () => {
                    video.pause();
                    video.removeAttribute("src");
                    video.load();
                };

                video.onloadeddata = () => {
                    try {
                        const canvas = document.createElement("canvas");
                        canvas.width = 128;
                        canvas.height = 128;
                        const ctx = canvas.getContext("2d");
                        ctx.fillStyle = "#111";
                        ctx.fillRect(0, 0, 128, 128);
                        ctx.drawImage(video, 0, 0, 128, 128);
                        cleanup();
                        resolve(canvas.toDataURL("image/png"));
                    } catch {
                        cleanup();
                        resolve(this._svgIcon("video"));
                    }
                };
                video.onerror = () => {
                    cleanup();
                    resolve(this._svgIcon("video"));
                };
            });
        }
        if (type === "audio") {
            return Promise.resolve(this._svgIcon("audio"));
        }
        if (type === "model") {
            let renderer = null;
            try {
                renderer = new THREE.WebGLRenderer({
                    alpha: true,
                    antialias: true,
                    powerPreference: "low-power",
                });
                renderer.setSize(128, 128);
            } catch (e) {
                console.warn("Model thumbnail renderer init failed:", e);
                return Promise.resolve(this._svgIcon("model"));
            }
            const scene = new THREE.Scene();
            const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
            scene.add(new THREE.AmbientLight(0xffffff, 2.0));
            scene.add(
                new THREE.DirectionalLight(0xffffff, 2.0).position.set(2, 3, 1),
            );

            return new Promise((resolve) => {
                const releaseRenderer = () => {
                    if (!renderer) return;
                    try {
                        const gl = renderer.getContext?.();
                        const lose = gl?.getExtension?.("WEBGL_lose_context");
                        lose?.loseContext?.();
                    } catch { }
                    try { renderer.dispose?.(); } catch { }
                    renderer = null;
                };

                const resolveWith = (value) => {
                    releaseRenderer();
                    resolve(value);
                };

                const ext = file.name.split(".").pop().toLowerCase();
                let loader;
                if (ext === "glb" || ext === "gltf") loader = this.loaders.gltf;
                else if (ext === "fbx") loader = this.loaders.fbx;
                else if (ext === "obj") loader = this.loaders.obj;
                else {
                    resolveWith(this._svgIcon("model"));
                    return;
                }

                loader.load(
                    dataURL,
                    (loadedObject) => {
                        let model = loadedObject.scene || loadedObject;

                        const bbox = new THREE.Box3().setFromObject(model);
                        if (bbox.isEmpty()) {
                            resolveWith(this._svgIcon("model"));
                            return;
                        }
                        const size = bbox.getSize(new THREE.Vector3());
                        const center = bbox.getCenter(new THREE.Vector3());
                        const maxDim = Math.max(size.x, size.y, size.z) || 1;

                        model.position.sub(center);
                        camera.position.set(0, 0, maxDim * 1.5);
                        camera.lookAt(0, 0, 0);

                        scene.add(model);
                        renderer.render(scene, camera);
                        resolveWith(renderer.domElement.toDataURL("image/png"));
                    },
                    () => {
                        resolveWith(this._svgIcon("model"));
                    },
                    (error) => {
                        console.error("Model thumbnail generation error:", error);
                        resolveWith(this._svgIcon("model"));
                    },
                ); // Added error callbacks
            });
        }
        return Promise.resolve(this._svgIcon(type));
    }

    // _generateMaterialThumbnail: Now takes `definition` which might contain asset IDs or data URLs initially
    static _generateMaterialThumbnail(def) {
        return new Promise((resolve) => {
            let renderer = null;
            try {
                const size = 128;
                renderer = new THREE.WebGLRenderer({
                    alpha: true,
                    antialias: true,
                    powerPreference: "low-power",
                });
                renderer.setSize(size, size);
                const scene = new THREE.Scene();
                const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
                camera.position.set(0, 0, 3);
                scene.add(new THREE.AmbientLight(0xffffff, 0.6));
                const d = new THREE.DirectionalLight(0xffffff, 1.0);
                d.position.set(2, 2, 2);
                scene.add(d);
                const mat = new THREE.MeshStandardMaterial({
                    color: def.color ? new THREE.Color(def.color) : 0xffffff,
                    roughness: def.roughness ?? 0.5,
                    metalness: def.metalness ?? 0.0,
                    emissive: def.emissive ? new THREE.Color(def.emissive) : 0x000000,
                    emissiveIntensity: def.emissiveIntensity ?? 1,
                });
                const sphere = new THREE.Mesh(
                    new THREE.SphereGeometry(0.8, 32, 16),
                    mat,
                );
                scene.add(sphere);
                const loader = new THREE.TextureLoader();
                const slots = [
                    ["map", "map"],
                    ["normalMap", "normalMap"],
                    ["roughnessMap", "roughnessMap"],
                    ["metalnessMap", "metalnessMap"],
                    ["emissiveMap", "emissiveMap"],
                    ["displacementMap", "displacementMap"],
                ];
                let pending = 0;

                for (const [k, srcKey] of slots) {
                    let textureSource = def[srcKey];
                    if (textureSource) {
                        // If it's an asset ID, resolve to data URL
                        if (!textureSource.startsWith("data:image")) {
                            const textureAsset = this._findById(textureSource);
                            const resolvedSource = textureAsset
                                ? this._getAssetSourceUrl(textureAsset)
                                : null;
                            if (resolvedSource) {
                                textureSource = resolvedSource;
                            } else {
                                textureSource = null; // Asset not found or no usable source
                            }
                        }
                        if (textureSource) {
                            pending++;
                            loader.load(
                                textureSource,
                                (t) => {
                                    mat[k] = t;
                                    mat.needsUpdate = true;
                                    pending--;
                                    if (pending === 0) finish();
                                },
                                undefined,
                                () => {
                                    pending--;
                                    if (pending === 0) finish();
                                },
                            );
                        }
                    }
                }
                const finish = () => {
                    renderer.render(scene, camera);
                    try {
                        const dURL = renderer.domElement.toDataURL("image/png");
                        try {
                            const gl = renderer.getContext?.();
                            const lose = gl?.getExtension?.("WEBGL_lose_context");
                            lose?.loseContext?.();
                        } catch { }
                        renderer.dispose();
                        renderer = null;
                        resolve(dURL);
                    } catch (e) {
                        try {
                            const gl = renderer.getContext?.();
                            const lose = gl?.getExtension?.("WEBGL_lose_context");
                            lose?.loseContext?.();
                        } catch { }
                        renderer.dispose();
                        renderer = null;
                        resolve(this._svgIcon("material"));
                    }
                };
                if (pending === 0) finish();
            } catch (e) {
                console.error("Error generating material thumbnail:", e);
                try {
                    if (renderer) {
                        const gl = renderer.getContext?.();
                        const lose = gl?.getExtension?.("WEBGL_lose_context");
                        lose?.loseContext?.();
                        renderer.dispose?.();
                        renderer = null;
                    }
                } catch { }
                resolve(this._svgIcon("material"));
            }
        });
    }

    // MODIFIED: Added new icons for advanced features
    static _svgIcon(type) {
        const icons = {
            logo: `<svg class="svg-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16c2.76 0 5-2.24 5-5 0-4.42-4.03-8-9-8zm-5.5 9c-.83 0-1.5-.67-1.5-1.5S5.67 9 6.5 9 8 9.67 8 10.5 7.33 12 6.5 12zm3-4C8.67 8 8 7.33 8 6.5S8.67 5 9.5 5s1.5.67 1.5 1.5S10.33 8 9.5 8zm5 0c-.83 0-1.5-.67-1.5-1.5S13.67 5 14.5 5s1.5.67 1.5 1.5S15.33 8 14.5 8zm3 4c-.83 0-1.5-.67-1.5-1.5S16.67 9 17.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"></path></svg>`,
            "upload-btn": ` <svg class="svg-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16h6v-6h4l-7-7-7 7h4v6zm-4 2h14v2H5v-2z"></path></svg>`,
            "download-btn": `<svg class="svg-icon" viewBox="0 0 24 24" fill="currentColor"><!-- Download (Export Project) --><path d="M5 18h14v2H5v-2zM13 5v9h3l-4 4-4-4h3V5h2z"></path></svg>`,
            "refresh-btn": `<svg class="svg-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"></path></svg>`,
            "upload-zone-icon": `<svg class="svg-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M21 15c0-1.66-1.34-3-3-3h-1.17C16.24 9.35 13.83 8 12 8s-4.24 1.35-4.83 3.83H6c-1.66 0-3 1.34-3 3v4c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-4z"></path></svg>`,
            "folder-icon-html": `<svg class="svg-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-4z"></path></svg>`,

            "arrow-right": `<svg viewBox="0 0 24 24" class="svg-icon" width="16" height="16" fill="currentColor"><path d="M10 17l5-5-5-5v10z"></path></svg>`,
            "arrow-down": `<svg viewBox="0 0 24 24" class="svg-icon" width="16" height="16" fill="currentColor"><path d="M7 10l5 5 5-5H7z"></path></svg>`,

            "folder": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`,
            model: `<svg class="svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"></path></svg>`,
            texture: `<svg class="svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>`,
            image: `<svg class="svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><path d="M21 15l-5-5-4 4-2-2-5 5"></path></svg>`,
            icon: `<svg class="svg-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.35 4.76 5.25.76-3.8 3.7.9 5.22L12 14.77 7.3 16.44l.9-5.22-3.8-3.7 5.25-.76L12 2z"></path></svg>`,
            video: `<svg class="svg-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M4 5h11a2 2 0 0 1 2 2v1.38l3.55-2.37A1 1 0 0 1 22 6.84v10.32a1 1 0 0 1-1.45.83L17 15.62V17a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"></path></svg>`,
            audio: `<svg class="svg-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M14 3.23v17.54a2 2 0 1 1-2-2V7.5L8 9V17a2 2 0 1 1-2-2V7.69l8-4.46z"></path></svg>`,
            hdri: `<svg class="svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M12 2a10 10 0 0 0 0 20A10 10 0 0 0 12 2z"></path><path d="M12 2v20"></path><path d="M2 12h20"></path><path d="M7 3h10"></path><path d="M7 21h10"></path><path d="M3 7v10"></path><path d="M21 7v10"></path></svg>`,
            material: `<svg class="svg-icon" viewBox="0 0 24 24" fill="currentColor" stroke="none"><circle cx="12" cy="12" r="8"/></svg>`,
            primitive: `<svg class="svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg>`,
            light: `<svg class="svg-icon" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M9 21c0 .5.4 1 1 1h4c.6 0 1-.5 1-1v-1H9v1zm3-20C8.9 2 6 4.9 6 8c0 2.8 2.2 5.2 5 5.9V18h2v-4.1c2.8-.7 5-3.1 5-5.9 0-3.1-2.9-6-6-6z"/></svg>`,
            star: `<svg class="svg-icon" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`,
            breadcrumbs: `<svg class="svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>`,
            code: `<svg class="svg-icon" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M14.6 16.6L19.2 12 14.6 7.4 16 6l6 6-6 6-1.4-1.4zm-5.2 0L4.8 12 9.4 7.4 8 6l-6 6 6 6 1.4-1.4z"/></svg>`,
            file: `<svg class="svg-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm7 1.5V9h4.5"/></svg>`,
            scene: `<svg class="svg-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V7h14v12zm-2-7l-4.5 5.5L9.5 14 7 17h10z"/></svg>`,
            // NEW ICONS for advanced features
            "version-commit": `<svg class="svg-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M5 20h14v2H5v-2zm-2-6h18v2H3v-2zm10-5h-2V3h2v6zm-4.7-2.7L6.3 7.7 10 11.4l5.7-5.7L17.7 7 10 14.7 4.3 9z"/></svg>`,
            "version-revert": `<svg class="svg-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M12.5 8c-2.65 0-5.05 1.12-6.76 2.9l1.41 1.41c1.19-1.19 2.76-1.87 4.35-1.87 3.13 0 5.87 2.05 6.71 4.75h-1.42l2.3 2.3 2.3-2.3h-1.42C20.32 10.33 16.79 8 12.5 8zM6 14.75h1.42L5.12 17.05 2.82 14.75h1.42C5.68 18.67 9.21 21 13.5 21c2.65 0 5.05-1.12 6.76-2.9l-1.41-1.41c-1.19 1.19-2.76 1.87-4.35 1.87-3.13 0-5.87-2.05-6.71-4.75z"/></svg>`,
            history: `<svg class="svg-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M13 3c-4.97 0-9 4.03-9 9H1V7l3-3 3 3H4c0 3.87 3.13 7 7 7s7-3.13 7-7c0-2.32-1.12-4.38-2.85-5.73l-1.42 1.42C15.93 5.82 17 7.31 17 9c0 3.31-2.69 6-6 6s-6-2.69-6-6h-2c0 4.42 3.58 8 8 8 4.42 0 8-3.58 8-8s-3.58-8-8-8zM12 7h-1v5l4 2 .71-1.41-3.29-1.6V7H12z"/></svg>`,
            "pack-export": `<svg class="svg-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>`,
            "prefab-create": `<svg class="svg-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M18 10h-2V7h-3V5h3V2h2v3h3v2h-3v3zm-3 7c-.55 0-1-.45-1-1v-4c0-.55.45-1 1-1s1 .45 1 1v4c0 .55-.45 1-1 1zm-4-7V5c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h9c1.1 0 2-.9 2-2v-4h-2v4H4V5h7v5h2z"/></svg>`,
        };
        return icons[type] || icons.primitive;
    }

    // ------------------------------------------------------------------
    // Rendering UI: Folders + Assets grid - MODIFIED: Added assetType to drag data
    // ------------------------------------------------------------------
    /*static render(searchQuery = "") {
        if (!this.dom.grid) return;
        this._renderBreadcrumbs();
        this._renderFolderSidebar();

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
                break; // NEW: Prefabs category
            default:
                assetsToRender = this.assets;
                break;
        }
        if (this.currentFilter !== "all")
            assetsToRender = assetsToRender.filter(
                (a) => a.type === this.currentFilter,
            );
        if (searchQuery) {
            const lowerQuery = searchQuery.toLowerCase();
            assetsToRender = assetsToRender.filter(
                (a) =>
                    (a.name || "").toLowerCase().includes(lowerQuery) ||
                    (a.tags || []).some((t) => t.toLowerCase().includes(lowerQuery)),
            );
        }

        this.dom.grid.innerHTML = "";
        for (const asset of assetsToRender) {
            const item = document.createElement("div");
            item.className = `asset-item ${asset.isFavorite ? "favorite" : ""} ${this.selectedIds.has(asset.id) ? "selected" : ""}`;
            item.dataset.id = asset.id;
            item.draggable = true;

            const thumbHtml =
                asset.thumbnail && asset.thumbnail.startsWith("data:image")
                    ? `<img src="${asset.thumbnail}" alt="${asset.name}" />`
                    : asset.thumbnail
                        ? asset.thumbnail
                        : this._svgIcon(asset.type);
            item.innerHTML = `
                <div class="asset-thumbnail">${thumbHtml}</div>
                <div class="asset-name">${asset.name}</div>
                <div class="asset-meta">${asset.type}</div>
                <div class="asset-fav-icon" title="Favorite">${this._svgIcon("star")}</div>
            `;

            item.onclick = (e) => {
                const append = e.ctrlKey || e.metaKey;
                this.selectAsset(asset.id, item, append, e);
            };
            item.ondblclick = () => {
                if (asset.type === "code" && typeof codeEditorManager !== "undefined") {
                    codeEditorManager.loadScriptFromAsset(asset);
                    document.getElementById("code-editor-panel").classList.add("open");
                    document.querySelector('.editor-tab[data-tab="js"]').click();
                } else {
                    this._addToScene(asset.id);
                }
            };
            item.ondragstart = (e) => {
                // MODIFIED: Add asset type for drag-drop to UI
                e.dataTransfer.setData(
                    "application/json",
                    JSON.stringify({ assetId: asset.id, assetType: asset.type }),
                );
                e.dataTransfer.effectAllowed = "copy";
            };
            item.oncontextmenu = (e) => {
                e.preventDefault();
                this._showContextMenu(e, asset.id);
            };

            this.dom.grid.appendChild(item);
        }

        if (assetsToRender.length === 0)
            this.dom.grid.innerHTML = '<div class="no-assets">No assets found.</div>';
    }*/

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
                <div class="asset-meta">${asset.type}</div>
            </div>
            ${asset.isFavorite ? `<div class="asset-fav-icon"><i class="fas fa-star"></i></div>` : ''}
        `;

            item.onclick = (e) => this.selectAsset(asset.id, item, e.ctrlKey, e);
            item.ondblclick = async () => {
                const isImageAsset = ["texture", "image", "icon"].includes(String(asset.type || "").toLowerCase());
                if ((asset.isSpriteSheet || isImageAsset) && typeof this.openSpriteSheetAsset === "function") {
                    try {
                        await this.openSpriteSheetAsset(asset.id);
                    } catch (error) {
                        console.error("[AssetsPanel] Could not open image in Sprite Sheet Studio:", error);
                        window.dispatchEvent(new CustomEvent("sm-spritesheet-open-error", { detail: { error } }));
                    }
                    return;
                }
                this._addToScene(asset.id);
            };
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

    static _ctxEnsureStyles() {
        if (document.getElementById("assets-native-context-v2-styles")) return;

        const style = document.createElement("style");
        style.id = "assets-native-context-v2-styles";
        style.textContent = `
            #contextMenu.assets-native-context-v2 {
                position: fixed !important;
                display: none;
                min-width: 190px;
                max-width: 250px;
                padding: 4px 0;
                margin: 0;
                overflow: visible !important;
                z-index: 100100 !important;
                background: var(--panel-bg, #333333);
                border: 1px solid var(--border-color, #4d4d4d81);
                border-radius: 3px;
                box-shadow: var(--panel-shadow-pro, 0 10px 22px rgba(0,0,0,.26));
                color: var(--text-primary, #ffffff);
                font-family: var(--ui-font, "Segoe UI", Arial, sans-serif);
                font-size: 11px;
                user-select: none;
            }

            #contextMenu.assets-native-context-v2 .apctx-search {
                padding: 4px 6px 5px;
                border-bottom: 1px solid var(--border-color, #4d4d4d81);
                background: var(--header-bg, #3c3c3c);
            }

            #contextMenu.assets-native-context-v2 .apctx-search input {
                width: 100%;
                box-sizing: border-box;
                height: 24px;
                padding: 0 7px;
                border: 1px solid var(--input-border, #565656);
                border-radius: 2px;
                outline: none;
                background: var(--input-bg, #333333);
                color: var(--text-primary, #ffffff);
                font: inherit;
            }

            #contextMenu.assets-native-context-v2 .apctx-search input::placeholder {
                color: var(--text-muted, #8e8e96);
            }

            #contextMenu.assets-native-context-v2 .apctx-search input:focus {
                border-color: var(--input-focus-border, #555555);
            }

            #contextMenu.assets-native-context-v2 .apctx-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 8px;
                min-height: 26px;
                padding: 3px 8px;
                color: var(--text-secondary, #b0b0b0);
                font-size: 9px;
                font-weight: 700;
                letter-spacing: .055em;
                text-transform: uppercase;
            }

            #contextMenu.assets-native-context-v2 .apctx-header-title {
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }

            #contextMenu.assets-native-context-v2 .apctx-badge {
                flex: 0 0 auto;
                padding: 1px 4px;
                border-radius: 2px;
                background: var(--accent-blue-dark, #474747);
                color: var(--text-primary, #ffffff);
                font-size: 8px;
                letter-spacing: .025em;
            }

            #contextMenu.assets-native-context-v2 .apctx-item {
                position: relative;
                display: grid;
                grid-template-columns: 16px minmax(0,1fr) auto auto;
                align-items: center;
                gap: 6px;
                min-height: 28px;
                padding: 0 8px;
                box-sizing: border-box;
                color: var(--text-primary, #ffffff);
                cursor: default;
                overflow: visible !important;
                white-space: nowrap;
            }

            #contextMenu.assets-native-context-v2 .apctx-item:hover,
            #contextMenu.assets-native-context-v2 .apctx-item.submenu-open {
                background: var(--hover-bg, #474747);
            }

            #contextMenu.assets-native-context-v2 .apctx-item.is-disabled {
                opacity: .42;
                pointer-events: none;
            }

            #contextMenu.assets-native-context-v2 .apctx-item.is-danger {
                color: var(--text-primary, #ffffff);
            }

            #contextMenu.assets-native-context-v2 .apctx-icon {
                width: 14px;
                height: 14px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                color: var(--text-secondary, #b0b0b0);
            }

            #contextMenu.assets-native-context-v2 .apctx-icon svg,
            #contextMenu.assets-native-context-v2 .apctx-caret svg {
                width: 13px;
                height: 13px;
                display: block;
            }

            #contextMenu.assets-native-context-v2 .apctx-label {
                min-width: 0;
                overflow: hidden;
                text-overflow: ellipsis;
            }

            #contextMenu.assets-native-context-v2 .apctx-shortcut {
                color: var(--text-muted, #8e8e96);
                font-size: 9px;
                padding-left: 8px;
            }

            #contextMenu.assets-native-context-v2 .apctx-caret {
                width: 12px;
                height: 12px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                color: var(--text-muted, #8e8e96);
            }

            #contextMenu.assets-native-context-v2 .apctx-separator {
                height: 1px;
                margin: 4px 0;
                background: var(--border-color, #4d4d4d81);
            }

            #contextMenu.assets-native-context-v2 .apctx-submenu {
                position: absolute;
                left: calc(100% + 4px);
                top: -4px;
                display: none;
                min-width: 205px;
                max-width: 280px;
                padding: 4px 0;
                overflow: visible !important;
                z-index: 100110 !important;
                background: var(--panel-bg, #333333);
                border: 1px solid var(--border-color, #4d4d4d81);
                border-radius: 3px;
                box-shadow: var(--panel-shadow-pro, 0 10px 22px rgba(0,0,0,.26));
            }

            #contextMenu.assets-native-context-v2 .apctx-item.submenu-open > .apctx-submenu {
                display: block !important;
            }
        `;

        document.head.appendChild(style);
    }

    static _ctxSvg(name = "dot") {
        const common =
            `viewBox="0 0 24 24" fill="none" stroke="currentColor" ` +
            `stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"`;

        const icons = {
            dot: `<svg ${common}><circle cx="12" cy="12" r="2.5"/></svg>`,
            folder: `<svg ${common}><path d="M3 7.5h7l2 2h9v9.5H3z"/><path d="M3 7.5V5h6l2 2.5"/></svg>`,
            open: `<svg ${common}><path d="M3 8h7l2 2h9l-2 9H5z"/><path d="M3 8V5h6l2 3"/></svg>`,
            game: `<svg ${common}><path d="M7.5 8h9a4.5 4.5 0 0 1 4.1 6.3l-1 2.3a2 2 0 0 1-3.1.8L14.8 16H9.2l-1.7 1.4a2 2 0 0 1-3.1-.8l-1-2.3A4.5 4.5 0 0 1 7.5 8z"/><path d="M8 11v4M6 13h4"/><circle cx="16.5" cy="12" r=".6" fill="currentColor" stroke="none"/><circle cx="18.5" cy="14" r=".6" fill="currentColor" stroke="none"/></svg>`,
            plus: `<svg ${common}><path d="M12 5v14M5 12h14"/></svg>`,
            import: `<svg ${common}><path d="M12 3v12"/><path d="m8 11 4 4 4-4"/><path d="M5 19h14"/></svg>`,
            organize: `<svg ${common}><path d="M4 6h6M14 6h6"/><circle cx="12" cy="6" r="2"/><path d="M4 12h10M18 12h2"/><circle cx="16" cy="12" r="2"/><path d="M4 18h2M10 18h10"/><circle cx="8" cy="18" r="2"/></svg>`,
            move: `<svg ${common}><path d="M12 3v18M3 12h18"/><path d="m9 6 3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3"/></svg>`,
            rename: `<svg ${common}><path d="M4 20h4l10-10-4-4L4 16z"/><path d="m13 7 4 4"/></svg>`,
            copy: `<svg ${common}><rect x="8" y="8" width="11" height="11" rx="1.5"/><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-10A1.5 1.5 0 0 0 3 5.5v10A1.5 1.5 0 0 0 4.5 17H8"/></svg>`,
            id: `<svg ${common}><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8" cy="11" r="2"/><path d="M5.5 16c.8-1.6 4.2-1.6 5 0M13 10h5M13 14h5"/></svg>`,
            chevron: `<svg ${common}><path d="m9 6 6 6-6 6"/></svg>`,
            trash: `<svg ${common}><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13"/><path d="M10 11v5M14 11v5"/></svg>`,
            refresh: `<svg ${common}><path d="M20 7v5h-5"/><path d="M4 17v-5h5"/><path d="M6.1 8A7 7 0 0 1 18 6l2 2M18 16a7 7 0 0 1-11.9 2L4 16"/></svg>`,
            play: `<svg ${common}><path d="m8 5 11 7-11 7z"/></svg>`,
            expand: `<svg ${common}><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"/></svg>`,
            collapse: `<svg ${common}><path d="M3 8h5V3M21 8h-5V3M3 16h5v5M21 16h-5v5"/></svg>`,
            favorite: `<svg ${common}><path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/></svg>`,
            export: `<svg ${common}><path d="M12 21V9"/><path d="m8 13 4-4 4 4"/><path d="M5 5h14"/></svg>`,
            version: `<svg ${common}><circle cx="12" cy="12" r="8"/><path d="M12 8v5l3 2"/></svg>`,
            project: `<svg ${common}><path d="M4 5h6l2 2h8v12H4z"/></svg>`
        };

        return icons[name] || icons.dot;
    }

    static _ctxCloseSubmenus(menu = this.dom.contextMenu, except = null) {
        if (!menu) return;

        menu.querySelectorAll(".apctx-item.submenu-open").forEach((item) => {
            if (
                except &&
                (
                    item === except ||
                    item.contains(except) ||
                    except.contains(item)
                )
            ) {
                return;
            }

            item.classList.remove("submenu-open");
            item.setAttribute("aria-expanded", "false");
        });
    }

    static _ctxPositionSubmenu(item, submenu) {
        if (!item || !submenu) return;

        submenu.style.left = "calc(100% + 4px)";
        submenu.style.right = "auto";
        submenu.style.top = "-4px";
        submenu.style.bottom = "auto";

        requestAnimationFrame(() => {
            if (!item.classList.contains("submenu-open")) return;

            const vw = window.innerWidth || document.documentElement.clientWidth;
            const vh = window.innerHeight || document.documentElement.clientHeight;

            let rect = submenu.getBoundingClientRect();

            if (rect.right > vw - 6) {
                submenu.style.left = "auto";
                submenu.style.right = "calc(100% + 4px)";
                rect = submenu.getBoundingClientRect();
            }

            if (rect.bottom > vh - 6) {
                submenu.style.top = "auto";
                submenu.style.bottom = "-4px";
            }
        });
    }

    static _ctxBuildItems(container, items = [], rootMenu) {
        for (const item of items) {
            if (!item || item.hidden) continue;

            if (item.separator) {
                const separator = document.createElement("div");
                separator.className = "apctx-separator";
                container.appendChild(separator);
                continue;
            }

            const row = document.createElement("div");
            row.className = "apctx-item";
            row.tabIndex = item.disabled ? -1 : 0;

            if (item.disabled) row.classList.add("is-disabled");
            if (item.danger) row.classList.add("is-danger");

            const children =
                Array.isArray(item.children)
                    ? item.children.filter(Boolean)
                    : [];

            if (children.length) {
                row.classList.add("has-submenu");
                row.setAttribute("aria-haspopup", "menu");
                row.setAttribute("aria-expanded", "false");
            }

            row.innerHTML = `
                <span class="apctx-icon">${this._ctxSvg(item.icon || "dot")}</span>
                <span class="apctx-label"></span>
                ${item.shortcut ? `<span class="apctx-shortcut"></span>` : ""}
                ${children.length ? `<span class="apctx-caret">${this._ctxSvg("chevron")}</span>` : ""}
            `;

            row.querySelector(".apctx-label").textContent = item.label || "";

            const shortcut = row.querySelector(".apctx-shortcut");
            if (shortcut) shortcut.textContent = item.shortcut || "";

            if (children.length) {
                const submenu = document.createElement("div");
                submenu.className = "apctx-submenu";
                this._ctxBuildItems(submenu, children, rootMenu);
                row.appendChild(submenu);

                const toggle = (event) => {
                    event.preventDefault();
                    event.stopPropagation();

                    if (item.disabled) return;

                    const willOpen = !row.classList.contains("submenu-open");
                    this._ctxCloseSubmenus(rootMenu, row);

                    row.classList.toggle("submenu-open", willOpen);
                    row.setAttribute("aria-expanded", willOpen ? "true" : "false");

                    if (!willOpen) {
                        row.querySelectorAll(".submenu-open").forEach((child) => {
                            child.classList.remove("submenu-open");
                            child.setAttribute("aria-expanded", "false");
                        });
                        return;
                    }

                    this._ctxPositionSubmenu(row, submenu);
                };

                // Click works for mouse and synthesized touch clicks.
                row.addEventListener("click", toggle);
                row.addEventListener("keydown", (event) => {
                    if (event.key === "Enter" || event.key === " ") toggle(event);
                });
            } else if (!item.disabled && typeof item.action === "function") {
                row.addEventListener("click", async (event) => {
                    event.preventDefault();
                    event.stopPropagation();

                    this._hideNativeContextMenu();

                    try {
                        await item.action();
                    } catch (error) {
                        console.error("[AssetsPanel] Context action failed:", item.label, error);
                    }
                });
            }

            container.appendChild(row);
        }
    }

    static _openNativeContextMenu(event, config = {}) {
        event?.preventDefault?.();
        event?.stopPropagation?.();

        this._ctxEnsureStyles();
        this._refreshDOMCache?.();

        const menu = this.dom.contextMenu || document.getElementById("contextMenu");
        if (!menu) return null;

        // Close any viewport/hierarchy/etc menu first.
        window.SMContextMenu?.closeAll?.();

        menu.className = "context-menu assets-native-context-v2";
        menu.dataset.smContextMenu = "true";
        menu.dataset.contextOwner = config.owner || "assets-panel";
        menu.innerHTML = "";

        if (config.search !== false) {
            const search = document.createElement("div");
            search.className = "apctx-search";
            search.innerHTML = `<input type="text" placeholder="Search actions..." spellcheck="false">`;
            menu.appendChild(search);

            const input = search.querySelector("input");
            input.addEventListener("input", () => {
                const q = input.value.trim().toLowerCase();

                menu.querySelectorAll(".apctx-item").forEach((row) => {
                    const text = row.querySelector(":scope > .apctx-label")?.textContent?.toLowerCase() || "";
                    row.style.display = !q || text.includes(q) ? "" : "none";
                });

                menu.querySelectorAll(".apctx-header, .apctx-separator").forEach((el) => {
                    el.style.display = q ? "none" : "";
                });

                this._ctxCloseSubmenus(menu);
            });
        }

        if (config.title) {
            const header = document.createElement("div");
            header.className = "apctx-header";

            const title = document.createElement("span");
            title.className = "apctx-header-title";
            title.textContent = config.title;

            header.appendChild(title);

            if (config.badge) {
                const badge = document.createElement("span");
                badge.className = "apctx-badge";
                badge.textContent = config.badge;
                header.appendChild(badge);
            }

            menu.appendChild(header);
        }

        this._ctxBuildItems(menu, config.items || [], menu);

        if (window.SMContextMenu?.showExisting) {
            window.SMContextMenu.showExisting(
                event,
                menu,
                config.owner || "assets-panel"
            );
        } else {
            menu.style.display = "block";
            menu.style.visibility = "hidden";
            menu.style.position = "fixed";
            menu.style.left = `${event.clientX}px`;
            menu.style.top = `${event.clientY}px`;

            requestAnimationFrame(() => {
                const rect = menu.getBoundingClientRect();
                const margin = 6;
                let x = event.clientX;
                let y = event.clientY;

                if (x + rect.width > window.innerWidth - margin) {
                    x = window.innerWidth - rect.width - margin;
                }

                if (y + rect.height > window.innerHeight - margin) {
                    y = window.innerHeight - rect.height - margin;
                }

                menu.style.left = `${Math.max(margin, x)}px`;
                menu.style.top = `${Math.max(margin, y)}px`;
                menu.style.visibility = "visible";
            });
        }

        return menu;
    }

    static _hideNativeContextMenu() {
        const menu = this.dom.contextMenu || document.getElementById("contextMenu");
        if (menu) {
            menu.style.display = "none";
            menu.classList.remove("sm-context-menu-open");
            this._ctxCloseSubmenus(menu);
        }

        if (window.SMContextMenu?.activeMenu === menu) {
            window.SMContextMenu.activeMenu = null;
            window.SMContextMenu.activeOwner = null;
        }
    }

    static _ctxFolderPath(folderId) {
        if (!folderId) return "Project Assets";

        const parts = [];
        const seen = new Set();
        let current = this.folders?.[folderId];

        while (current && !seen.has(current.id)) {
            seen.add(current.id);
            parts.unshift(current.name || current.id);
            current = current.parentId ? this.folders?.[current.parentId] : null;
        }

        return `Project Assets/${parts.join("/")}`;
    }

    static _ctxCopyText(value) {
        const text = String(value ?? "");

        if (navigator.clipboard?.writeText) {
            return navigator.clipboard.writeText(text).catch(() => this._ctxLegacyCopy(text));
        }

        return this._ctxLegacyCopy(text);
    }

    static _ctxLegacyCopy(text) {
        const area = document.createElement("textarea");
        area.value = text;
        area.style.position = "fixed";
        area.style.opacity = "0";
        document.body.appendChild(area);
        area.select();

        try {
            document.execCommand("copy");
        } catch { }

        area.remove();
        return true;
    }

    static _ctxIsReadOnlyFolder(folder) {
        if (!folder) return true;

        return !!(
            folder.isBuiltIn ||
            folder.sourceType === "google-drive" ||
            folder.isGoogleDriveFolder ||
            folder.isPhysicalGameProject ||
            folder.isPhysicalGameContentFolder ||
            folder.sourceType === "physical-game-project"
        );
    }

    static _ctxCanDeleteFolder(folder) {
        if (!folder) return false;

        // Engine / built-in folders
        if (folder.isBuiltIn) return false;

        // Remote Drive folders
        if (
            folder.sourceType === "google-drive" ||
            folder.isGoogleDriveFolder
        ) {
            return false;
        }

        // Physical folders are mirrors of assets/... on disk.
        // AssetsPanel cannot truly delete them from Windows filesystem.
        if (
            folder.isPhysicalGameProject ||
            folder.isPhysicalGameContentFolder ||
            folder.sourceType === "physical-game-project"
        ) {
            return false;
        }

        // Normal user-created AssetsPanel folders
        return true;
    }

    static _ctxIsProtectedAsset(asset) {
        return !!(
            !asset ||
            asset.isBuiltIn ||
            asset.sourceType === "physical-game-project" ||
            asset.sourceType === "google-drive"
        );
    }

    static _ctxOwningGameProject(folderId) {
        let currentId = folderId || null;

        while (currentId) {
            const folder = this.folders?.[currentId];
            if (!folder) break;
            if (folder.isGameProject) return folder;
            currentId = folder.parentId || null;
        }

        return null;
    }

    static _ctxOwningPhysicalProject(folderId) {
        let currentId = folderId || null;

        while (currentId) {
            const folder = this.folders?.[currentId];
            if (!folder) break;
            if (folder.isPhysicalGameProject) return folder;
            currentId = folder.parentId || null;
        }

        return null;
    }

    static _ctxCollectFolderTree(folderId) {
        if (!folderId) return [];

        if (typeof this._collectFolderTree === "function") {
            try {
                return this._collectFolderTree(folderId) || [];
            } catch { }
        }

        const ids = [];
        const walk = (id) => {
            if (!this.folders?.[id]) return;
            ids.push(id);

            Object.values(this.folders || {})
                .filter((folder) => folder?.parentId === id)
                .forEach((folder) => walk(folder.id));
        };

        walk(folderId);
        return ids;
    }

    static _ctxMoveFolder(folderId, targetFolderId = null) {
        const folder = this.folders?.[folderId];
        if (!folder || this._ctxIsProtectedFolder(folder)) return false;

        if (folderId === targetFolderId) return false;

        const descendants = new Set(this._ctxCollectFolderTree(folderId));

        if (targetFolderId && descendants.has(targetFolderId)) {
            alert("A folder cannot be moved inside itself or one of its descendants.");
            return false;
        }

        const oldParent = folder.parentId || null;

        if (oldParent && this.folders?.[oldParent]) {
            this.folders[oldParent].children =
                (this.folders[oldParent].children || []).filter((id) => id !== folderId);
        }

        folder.parentId = targetFolderId || null;

        if (targetFolderId && this.folders?.[targetFolderId]) {
            const target = this.folders[targetFolderId];
            if (!Array.isArray(target.children)) target.children = [];
            if (!target.children.includes(folderId)) target.children.push(folderId);
        }

        this._saveToStorage?.();
        this.onFolderChanged?.(this.folders);
        this.render?.();
        return true;
    }

    static _ctxFolderMoveTargets(folderId) {
        const excluded = new Set(this._ctxCollectFolderTree(folderId));

        const build = (parentId = null) =>
            Object.values(this.folders || {})
                .filter((folder) =>
                    (folder.parentId || null) === (parentId || null) &&
                    !excluded.has(folder.id) &&
                    !this._ctxIsProtectedFolder(folder)
                )
                .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")))
                .map((folder) => ({
                    label: folder.name,
                    icon: "folder",
                    action: () => this._ctxMoveFolder(folderId, folder.id),
                    children: build(folder.id)
                }));

        return [
            {
                label: "Project Assets (Root)",
                icon: "project",
                action: () => this._ctxMoveFolder(folderId, null)
            },
            { separator: true },
            ...build(null)
        ];
    }

    static _ctxAssetMoveTargets(assetId) {
        const build = (parentId = null) =>
            Object.values(this.folders || {})
                .filter((folder) =>
                    (folder.parentId || null) === (parentId || null) &&
                    !this._ctxIsProtectedFolder(folder)
                )
                .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")))
                .map((folder) => ({
                    label: folder.name,
                    icon: "folder",
                    action: () => this.moveAssetToFolder?.(assetId, folder.id),
                    children: build(folder.id)
                }));

        return [
            {
                label: "Project Assets (Root)",
                icon: "project",
                action: () => this.moveAssetToFolder?.(assetId, null)
            },
            { separator: true },
            ...build(null)
        ];
    }

    // Compact asset context menu — native AssetsPanel implementation.
    static _showContextMenu(event, assetId) {
        this.contextAssetId = assetId;

        const asset = this._findById(assetId);
        if (!asset || asset.isBuiltIn) return;

        const readOnly = this._ctxIsProtectedAsset(asset);

        const physical =
            asset.physicalGameProjectId
                ? Object.values(this.folders || {}).find((folder) =>
                    folder?.isPhysicalGameProject &&
                    (
                        folder.projectId === asset.physicalGameProjectId ||
                        folder.physicalGameProjectId === asset.physicalGameProjectId
                    )
                )
                : null;

        const openAction = {
            label:
                asset.isGameEntryPoint
                    ? "Play Game Project"
                    : asset.isGameScene || asset.type === "game-scene"
                        ? "Open Game Scene"
                        : asset.isGameProjectManifest || asset.type === "game-project"
                            ? "Load Game Project"
                            : "Add / Open Asset",
            icon:
                asset.isGameEntryPoint
                    ? "play"
                    : asset.isGameProjectManifest || asset.type === "game-project"
                        ? "game"
                        : "open",
            action: () => {
                if (asset.isGameEntryPoint && physical) {
                    return window.PhysicalGameProjectBridge?.playProject?.(physical);
                }

                if (
                    (asset.isGameScene || asset.type === "game-scene") &&
                    typeof this.openGameScene === "function"
                ) {
                    return this.openGameScene(asset);
                }

                return this._addToScene?.(asset.id);
            }
        };

        const selectedCount = this.selectedIds?.size || 0;

        const items = [
            openAction,
            { separator: true },
            {
                label: "Asset Actions",
                icon: "organize",
                children: [
                    {
                        label: "Rename",
                        icon: "rename",
                        shortcut: "F2",
                        disabled: readOnly,
                        action: () => this.renameAsset?.()
                    },
                    {
                        label: asset.isFavorite ? "Remove from Favorites" : "Add to Favorites",
                        icon: "favorite",
                        action: () => this.toggleFavorite?.()
                    },
                    {
                        label: "Export Asset",
                        icon: "export",
                        action: () => this._exportSingleAsset?.(asset.id)
                    }
                ]
            },
            {
                label: "Organize",
                icon: "organize",
                children: [
                    {
                        label: "Move to Folder",
                        icon: "move",
                        disabled: readOnly,
                        children: this._ctxAssetMoveTargets(asset.id)
                    },
                    {
                        label: "Create Prefab from Selection",
                        icon: "project",
                        action: () => this._createPrefab?.()
                    }
                ]
            },
            {
                label: "Copy",
                icon: "copy",
                children: [
                    {
                        label: "Copy Asset Name",
                        icon: "copy",
                        action: () => this._ctxCopyText(asset.name)
                    },
                    {
                        label: "Copy Source Path / URL",
                        icon: "copy",
                        disabled: !(asset.sourcePath || asset.sourceURL || typeof asset.data === "string"),
                        action: () =>
                            this._ctxCopyText(
                                asset.sourcePath ||
                                asset.sourceURL ||
                                (typeof asset.data === "string" ? asset.data : "")
                            )
                    },
                    {
                        label: "Copy Asset ID",
                        icon: "id",
                        action: () => this._ctxCopyText(asset.id)
                    }
                ]
            },
            {
                label: "Version Control",
                icon: "version",
                children: [
                    {
                        label: "Commit Version",
                        icon: "version",
                        disabled: readOnly,
                        action: () =>
                            this._commitAssetVersion?.(
                                asset.id,
                                prompt("Commit message:") || "Manual Commit"
                            )
                    },
                    {
                        label: "Revert to Previous",
                        icon: "version",
                        disabled: readOnly || !asset.history?.length,
                        action: () => this._revertAsset?.(asset.id)
                    },
                    {
                        label: "Show History",
                        icon: "version",
                        disabled: !asset.history?.length,
                        action: () => this._showAssetHistory?.(asset.id)
                    }
                ]
            },
            ...(selectedCount > 1
                ? [{
                    label: `Selection (${selectedCount})`,
                    icon: "organize",
                    children: [
                        {
                            label: `Add Tags to ${selectedCount} Assets`,
                            icon: "organize",
                            action: () => this._promptMultiTag?.()
                        },
                        {
                            label: `Move ${selectedCount} Assets…`,
                            icon: "move",
                            action: () => this._showMoveSelectedAssetsMenu?.()
                        }
                    ]
                }]
                : []),
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
                        label: "Refresh Assets",
                        icon: "refresh",
                        action: () => this.refreshAssets?.()
                    }
                ]
            },
            { separator: true },
            {
                label: "Delete",
                icon: "trash",
                shortcut: "Delete",
                danger: true,
                disabled: readOnly,
                action: () => this.deleteAsset?.()
            }
        ];

        return this._openNativeContextMenu(event, {
            owner: "assets-grid",
            title: asset.name,
            badge: String(asset.type || "ASSET").toUpperCase(),
            items
        });
    }

    // Compact folder context menu — native AssetsPanel implementation.
    static _showFolderContextMenu(event, folderId) {
        const folder = this.folders?.[folderId];
        if (!folder) return;

        const readOnly = this._ctxIsReadOnlyFolder(folder);
        const canDelete = this._ctxCanDeleteFolder(folder);
        const project = this._ctxOwningGameProject(folderId);
        const physical = this._ctxOwningPhysicalProject(folderId);
        const path = this._ctxFolderPath(folderId);

        const items = [
            {
                label: "Open",
                icon: "open",
                children: [
                    {
                        label: "Open Folder",
                        icon: "open",
                        shortcut: "Enter",
                        action: () => this.openFolder?.(folderId)
                    },
                    {
                        label: "Open in Content Grid",
                        icon: "folder",
                        action: () => {
                            this.openFolderId = folderId;
                            this.currentCategory = "project";
                            this.render?.();
                        }
                    }
                ]
            }
        ];

        const gameActions = [];

        if (physical) {
            gameActions.push(
                {
                    label: "Play Game Project",
                    icon: "play",
                    action: () =>
                        window.PhysicalGameProjectBridge?.playProject?.(physical)
                },
                {
                    label: "Refresh Project Files",
                    icon: "refresh",
                    action: () =>
                        window.PhysicalGameProjectBridge?.refreshProject?.(physical)
                }
            );
        }

        if (folder.isGameProject) {
            gameActions.push(
                {
                    label: "Load Game Project",
                    icon: "game",
                    disabled: typeof this.loadGameProject !== "function",
                    action: () =>
                        this.loadGameProject?.(
                            folder,
                            {
                                openStartup: true,
                                replaceScene: true,
                                requireStartup: false
                            }
                        )
                },
                {
                    label: "Set as Active Game Project",
                    icon: "game",
                    disabled: typeof this.setActiveGameProject !== "function",
                    action: () =>
                        this.setActiveGameProject?.(
                            folder,
                            { openProject: false }
                        )
                }
            );

            if (typeof this.openStartupScene === "function") {
                gameActions.push({
                    label: "Open Startup Scene",
                    icon: "open",
                    action: () => this.openStartupScene?.(folder)
                });
            }
        }

        if (gameActions.length) {
            items.push({
                label: "Game Project",
                icon: "game",
                children: gameActions
            });
        }

        const createImportChildren = [
            {
                label: "New Subfolder",
                icon: "plus",
                disabled: readOnly,
                action: () => {
                    const name = prompt("New subfolder name:", "New Folder");
                    if (name) this.createFolder?.(name, folderId);
                }
            },
            {
                label: "New Game Project Here…",
                icon: "game",
                disabled:
                    readOnly ||
                    !!project ||
                    typeof this.createGameProject !== "function",
                action: () => this.createGameProject?.(null, folderId)
            },
            {
                label: "Import Asset(s) Here…",
                icon: "import",
                disabled: readOnly,
                action: () => {
                    this.openFolderId = folderId;
                    this.currentCategory = "project";
                    this._refreshDOMCache?.();

                    if (this.dom?.uploadInput) this.dom.uploadInput.click();
                    else this.showUploadZone?.();
                }
            },
            {
                label: "Import Folder Here…",
                icon: "folder",
                disabled: readOnly,
                action: () => {
                    this.openFolderId = folderId;
                    this.currentCategory = "project";
                    this._refreshDOMCache?.();

                    if (this.dom?.uploadFolderInput) this.dom.uploadFolderInput.click();
                    else this.showUploadZone?.();
                }
            }
        ];

        if (project && typeof this.saveCurrentSceneToGameProject === "function") {
            createImportChildren.push(
                { separator: true },
                {
                    label: "Save Current Scene as Map…",
                    icon: "project",
                    action: () => this.saveCurrentSceneToGameProject?.(project.id)
                }
            );
        }

        items.push(
            {
                label: "Create & Import",
                icon: "plus",
                children: createImportChildren
            },
            {
                label: "Organize",
                icon: "organize",
                children: [
                    {
                        label: "Move Folder To",
                        icon: "move",
                        disabled: readOnly,
                        children: this._ctxFolderMoveTargets(folderId)
                    },
                    {
                        label: "Rename Folder",
                        icon: "rename",
                        shortcut: "F2",
                        disabled: readOnly,
                        action: () => this.renameFolder?.(folderId)
                    },
                    { separator: true },
                    {
                        label: "Expand All Descendants",
                        icon: "expand",
                        action: () => {
                            this._ctxCollectFolderTree(folderId)
                                .forEach((id) => this.expandedFolders?.add?.(id));
                            this._renderFolderSidebar?.();
                        }
                    },
                    {
                        label: "Collapse Descendants",
                        icon: "collapse",
                        action: () => {
                            this._ctxCollectFolderTree(folderId)
                                .forEach((id) => this.expandedFolders?.delete?.(id));
                            this._renderFolderSidebar?.();
                        }
                    }
                ]
            },
            {
                label: "Copy",
                icon: "copy",
                children: [
                    {
                        label: "Copy Folder Path",
                        icon: "copy",
                        action: () => this._ctxCopyText(path)
                    },
                    {
                        label: "Copy Folder ID",
                        icon: "id",
                        action: () => this._ctxCopyText(folder.id)
                    }
                ]
            },
            { separator: true },
            {
                label: "Delete",
                icon: "trash",
                danger: true,
                disabled: readOnly,
                children: [
                    {
                        label: "Delete Folder (Move Contents to Parent)",
                        icon: "trash",
                        disabled: readOnly,
                        action: () => {
                            if (
                                confirm(
                                    `Delete "${folder.name}" and move its contents to the parent folder?`
                                )
                            ) {
                                this.deleteFolder?.(
                                    folderId,
                                    { deleteContents: false }
                                );
                            }
                        }
                    },
                    {
                        label: "Delete Folder & Contents",
                        icon: "trash",
                        danger: true,
                        disabled: readOnly,
                        action: () => {
                            if (
                                confirm(
                                    `Delete "${folder.name}" and ALL contents? This cannot be undone.`
                                )
                            ) {
                                this.deleteFolder?.(
                                    folderId,
                                    { deleteContents: true }
                                );
                            }
                        }
                    }
                ]
            }
        );

        return this._openNativeContextMenu(event, {
            owner: "assets-explorer",
            title: folder.name,
            badge:
                folder.isGameProject || folder.isPhysicalGameProject
                    ? "GAME PROJECT"
                    : "FOLDER",
            items
        });
    }

    static _showMoveAssetMenu(assetId) {
        const folderNames = [{ id: null, name: "Root" }].concat(
            Object.values(this.folders).map((f) => ({ id: f.id, name: f.name })),
        );
        const sel = prompt(
            "Move asset to folder:\n" +
            folderNames.map((f, i) => `${i}: ${f.name}`).join("\n"),
            "0",
        );
        const idx = parseInt(sel);
        if (isNaN(idx)) return;
        const target = folderNames[idx];
        this.moveAssetToFolder(assetId, target.id);
    }

    // ------------------------------------------------------------------
    // Helpers - MODIFIED: _removeAsset cleans up references
    // ------------------------------------------------------------------
    static _findById(id) {
        return this.assets.find((a) => a.id === id);
    }

    static async saveSpriteSheetAsset(data = {}) {
        const width = Number(data.width || data.image?.naturalWidth || data.image?.width || 0);
        const height = Number(data.height || data.image?.naturalHeight || data.image?.height || 0);
        if (!data.image || width <= 0 || height <= 0) {
            throw new Error("Sprite sheet image is empty.");
        }

        const toBlob = async () => {
            if (data.sourceURL && /^(blob:|data:|https?:)/i.test(data.sourceURL)) {
                try {
                    const response = await fetch(data.sourceURL);
                    if (response.ok) return await response.blob();
                } catch (_) { }
            }

            return await new Promise((resolve, reject) => {
                const canvas = document.createElement("canvas");
                canvas.width = width;
                canvas.height = height;
                const context = canvas.getContext("2d");
                try {
                    context.drawImage(data.image, 0, 0, width, height);
                    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Could not encode sprite sheet.")), "image/png");
                } catch (error) {
                    reject(error);
                }
            });
        };

        const blob = await toBlob();
        const existing = data.id ? this._findById(data.id) : null;
        const id = existing?.id || (
            typeof crypto !== "undefined" && crypto.randomUUID
                ? `asset_${crypto.randomUUID()}`
                : `asset_${Date.now()}_${Math.floor(Math.random() * 1000000)}`
        );
        const name = String(data.name || "spritesheet.png").replace(/\.(json|atlas)$/i, "") || "spritesheet.png";
        const storage = await this._getPersistentAssetStorage();
        let runtimeURL = existing?.data || null;
        let storageKind = existing?.storageKind || null;
        let storageKey = existing?.storageKey || null;

        if (storage) {
            await storage.saveBlob(id, blob, { name, type: blob.type });
            runtimeURL = storage.createRuntimeURL(id, blob);
            storageKind = "indexeddb-blob";
            storageKey = id;
        } else {
            runtimeURL = URL.createObjectURL(blob);
            storageKind = "session-blob";
            storageKey = null;
        }

        const spriteSheet = {
            version: 1,
            imageWidth: width,
            imageHeight: height,
            slices: JSON.parse(JSON.stringify(data.slices || [])),
            clips: JSON.parse(JSON.stringify(data.clips || [])),
            activeClipId: data.activeClipId || null,
        };

        const asset = existing || {
            id,
            name,
            type: "texture",
            thumbnail: null,
            isFavorite: false,
            isBuiltIn: false,
            folderId: null,
            tags: [],
            history: [],
            references: [],
        };
        Object.assign(asset, {
            name,
            type: "texture",
            data: runtimeURL,
            storageKind,
            storageKey,
            isSpriteSheet: true,
            spriteSheet,
            sourceType: "sprite-sheet-editor",
            sourceSize: blob.size,
            sourceLastModified: Date.now(),
        });

        if (!existing) this.assets.push(asset);
        this._saveToStorage();
        this.render();
        this._syncRuntimeAssetRegistry();
        this.onAssetUpdate?.(asset.id, asset);
        window.dispatchEvent(new CustomEvent("sm-spritesheet-asset-saved", { detail: { asset } }));
        return asset;
    }

    static _removeAsset(id) {
        const idx = this.assets.findIndex((a) => a.id === id);
        if (idx >= 0) {
            const [rem] = this.assets.splice(idx, 1);

            this.assetStorage
                ?.deleteAsset?.(rem.id)
                ?.catch?.((error) => {
                    console.warn(
                        `AssetsPanel: Could not delete persisted data for ${rem.name}.`,
                        error
                    );
                });

            if (typeof this.onAssetRemoved === "function")
                this.onAssetRemoved(rem.id);
            // NEW: Clean up references pointing to this deleted asset
            this.assets.forEach((a) => {
                if (a.references) {
                    a.references = a.references.filter((refId) => refId !== id);
                }
                // Also clean up history entries that might contain a thumbnail or data from this asset
                // (More robust would be to store original data URLs in history to reconstruct thumbnails)
                if (a.history) {
                    a.history.forEach((h) => {
                        // If a history entry's name was based on this deleted asset, adjust message
                        if (h.message && h.message.includes(rem.name)) {
                            h.message = h.message.replace(
                                new RegExp(rem.name, "g"),
                                "[Deleted Asset]",
                            );
                        }
                    });
                }
                // If a material definition was pointing to this texture asset, clear that slot
                if (a.type === "material" && a.definition) {
                    const textureSlots = [
                        "map",
                        "normalMap",
                        "roughnessMap",
                        "metalnessMap",
                        "emissiveMap",
                        "displacementMap",
                    ];
                    textureSlots.forEach((slot) => {
                        if (a.definition[slot] === id) {
                            delete a.definition[slot];
                        }
                    });
                }
            });
        }
    }

    static _collectFolderTree(folderId) {
        const out = [];
        const rec = (fid) => {
            out.push(fid);
            const f = this.folders[fid];
            if (!f) return;
            for (const c of f.children || []) rec(c);
        };
        rec(folderId);
        return out;
    }

    static _selectAllInView() {
        const nodes = this.dom.grid.querySelectorAll(".asset-item");
        this.selectedIds.clear();
        for (const n of nodes) this.selectedIds.add(n.dataset.id);
        this.render();
    }

    static _exportSingleAsset(assetId) {
        const asset = this._findById(assetId);
        if (!asset) return;
        if (asset.type === "material" && asset.definition) {
            // When exporting material, convert asset IDs back to data URLs for portability
            const exportDef = { ...asset.definition };
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

            const blob = new Blob([JSON.stringify(exportDef, null, 2)], {
                type: "application/json",
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = (asset.name || "material") + ".material.json";
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
            return;
        }
        if (asset.type === "code" && asset.data) {
            const blob = new Blob([asset.data], { type: "text/javascript" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = (asset.name || "script") + ".js";
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
            return;
        }
        const blob = new Blob([asset.data], { type: "application/octet-stream" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = asset.name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    }

    static _isMaterialPaintPanelOpen() {
        return !!(
            document.body?.classList?.contains(
                "sm-material-paint-open"
            ) ||
            document
                .getElementById(
                    "sm-material-paint-dock"
                )
                ?.classList?.contains(
                    "is-open"
                )
        );
    }

    static _objectContainsMesh(
        root,
        mesh
    ) {
        if (!root || !mesh) return false;
        if (root === mesh) return true;

        let current = mesh.parent;

        while (current) {
            if (current === root) {
                return true;
            }

            current = current.parent;
        }

        return false;
    }

    static async _routeMaterialDropToPainter(
        asset,
        mesh
    ) {
        const painter =
            window.SMUniversalMaterialPainter;

        if (
            !painter ||
            !this._isMaterialPaintPanelOpen()
        ) {
            return false;
        }

        if (
            !asset?.id ||
            asset.type !== "material" ||
            !mesh?.isMesh
        ) {
            return false;
        }

        const currentTarget =
            painter.target;

        const paintTarget =
            currentTarget &&
            this._objectContainsMesh(
                currentTarget,
                mesh
            )
                ? currentTarget
                : mesh;

        await painter.setTarget(
            paintTarget
        );

        await painter.setLayerAsset(
            painter.state?.activeLayer ??
                0,
            asset.id,
            paintTarget
        );

        window.dispatchEvent(
            new CustomEvent(
                "sm:assets-material-routed-to-painter",
                {
                    detail: {
                        asset,
                        mesh,
                        target:
                            paintTarget,
                        layer:
                            painter.state
                                ?.activeLayer ??
                            0
                    }
                }
            )
        );

        console.log(
            `[AssetsPanel] Routed '${asset.name}' to Material Paint layer ${(painter.state?.activeLayer ?? 0) + 1}.`
        );

        return true;
    }

    static async _applyMaterialToMesh(
        asset,
        mesh,
        options = {}
    ) {
        if (!mesh || !mesh.isMesh) {
            console.warn(
                "AssetsPanel: target is not a mesh"
            );
            return null;
        }

        if (!asset?.definition) {
            console.warn(
                "AssetsPanel: material asset missing definition"
            );
            return null;
        }

        if (
            options.forceDirect !== true &&
            await this._routeMaterialDropToPainter(
                asset,
                mesh
            )
        ) {
            return mesh.material;
        }

        const def =
            asset.definition;

        const MaterialType =
            def.type ===
            "MeshPhysicalMaterial"
                ? THREE.MeshPhysicalMaterial
                : THREE.MeshStandardMaterial;

        const previousMaterial =
            Array.isArray(mesh.material)
                ? mesh.material[0]
                : mesh.material;

        const mat =
            new MaterialType({
                color:
                    def.color
                        ? new THREE.Color(
                              def.color
                          )
                        : 0xffffff,
                roughness:
                    def.roughness ??
                    0.5,
                metalness:
                    def.metalness ??
                    0.0,
                emissive:
                    def.emissive
                        ? new THREE.Color(
                              def.emissive
                          )
                        : 0x000000,
                emissiveIntensity:
                    def.emissiveIntensity ??
                    1,
                opacity:
                    def.opacity ?? 1,
                transparent:
                    Boolean(
                        def.transparent
                    ) ||
                    (def.opacity ?? 1) <
                        1,
                alphaTest:
                    def.alphaTest ?? 0,
                transmission:
                    def.transmission ??
                    0,
                ior:
                    def.ior ?? 1.5,
                clearcoat:
                    def.clearcoat ?? 0,
                clearcoatRoughness:
                    def.clearcoatRoughness ??
                    0,
                thickness:
                    def.thickness ?? 0,
                side:
                    previousMaterial
                        ?.side ??
                    THREE.FrontSide
            });

        mat.name =
            def.displayName ||
            asset.name ||
            "SM Material";

        mat.userData.smMaterialAssetId =
            asset.id;

        mat.userData.smMaterialDefinition =
            { ...def };

        const loadSlot = async (
            key,
            slot,
            loadOptions = {}
        ) => {
            const textureAssetId =
                def[key];

            if (!textureAssetId) {
                return null;
            }

            const textureAsset =
                this._findById(
                    textureAssetId
                );

            if (
                !this._isMaterialTextureCompatibleAsset(
                    textureAsset
                )
            ) {
                return null;
            }

            const texture =
                await this._loadMaterialTextureAsset(
                    textureAsset,
                    {
                        tiling:
                            def.tiling ??
                            1,
                        ...loadOptions
                    }
                );

            if (texture) {
                mat[slot] =
                    texture;
            }

            return texture;
        };

        await Promise.all([
            loadSlot(
                "map",
                "map",
                { color: true }
            ),
            loadSlot(
                "normalMap",
                "normalMap"
            ),
            loadSlot(
                "roughnessMap",
                "roughnessMap"
            ),
            loadSlot(
                "metalnessMap",
                "metalnessMap"
            ),
            loadSlot(
                "aoMap",
                "aoMap"
            ),
            loadSlot(
                "emissiveMap",
                "emissiveMap",
                { color: true }
            ),
            loadSlot(
                "displacementMap",
                "displacementMap"
            ),
            loadSlot(
                "opacityMap",
                "alphaMap"
            )
        ]);

        if (
            mat.normalMap &&
            mat.normalScale
        ) {
            const strength =
                Number(
                    def.normalStrength
                ) || 1;

            mat.normalScale.set(
                strength,
                String(
                    def.normalConvention ||
                    "gl"
                ).toLowerCase() ===
                    "dx"
                    ? -strength
                    : strength
            );
        }

        if (
            mat.displacementMap
        ) {
            mat.displacementScale =
                Number(
                    def.displacementScale
                ) || 0;

            mat.displacementBias =
                Number(
                    def.displacementBias
                ) || 0;
        }

        if (
            mat.aoMap &&
            mesh.geometry
                ?.attributes?.uv &&
            !mesh.geometry
                ?.attributes?.uv2
        ) {
            mesh.geometry.setAttribute(
                "uv2",
                mesh.geometry.attributes
                    .uv.clone()
            );
        }

        mesh.material = mat;
        mesh.visible = true;
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        mesh.userData =
            mesh.userData || {};

        mesh.userData.smMaterialAssetId =
            asset.id;

        mat.needsUpdate = true;

        if (
            this.renderer?.shadowMap
        ) {
            this.renderer.shadowMap
                .needsUpdate = true;
        }

        window.dispatchEvent(
            new CustomEvent(
                "sm:assets-material-applied",
                {
                    detail: {
                        asset,
                        mesh,
                        material: mat
                    }
                }
            )
        );

        console.log(
            `Applied material '${asset.name}' to ${mesh.name || mesh.uuid}`
        );

        return mat;
    }

    static _shortName(src) {
        try {
            return src.split("/").pop();
        } catch (e) {
            return src;
        }
    }

    // ==================================================================
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
    static addScriptAsset(name, code, folderId = null) {
        // Code assets can contain JS/HTML/CSS/JSON tabs. Preserve a supported
        // extension; JavaScript remains the default for extension-less names.
        const finalName = /\.(js|html|css|json)$/i.test(name) ? name : name + ".js";
        folderId = folderId || this.ensureScriptsFolder();

        // Check for duplicates
        let uniqueName = finalName;
        let counter = 1;
        const baseName = finalName.replace(/\.(js|html|css|json)$/i, "");
        while (
            this.assets.some(
                (a) =>
                    !a.isBuiltIn &&
                    a.name === uniqueName &&
                    (a.folderId || null) === (folderId || null),
            )
        ) {
            const extension = (finalName.match(/\.[^.]+$/) || [".js"])[0];
            uniqueName = `${baseName} (${counter++})${extension}`;
        }

        if (uniqueName !== finalName) {
            console.warn(
                `AssetsPanel: Asset name conflict for '${finalName}'. Renamed to '${uniqueName}'.`,
            );
        }

        const id = `script_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        const asset = {
            id,
            name: uniqueName,
            type: "code",
            data: code,
            thumbnail: this._svgIcon("code"), // Use a specific icon for code
            isFavorite: false,
            isBuiltIn: false,
            folderId,
            tags: ["script", "code"], // Auto-tagging
            history: [], // NEW: Initialize history
            references: [], // NEW: Initialize references
        };

        this.assets.push(asset);
        this._commitAssetVersion(asset.id, "Initial Script Import"); // NEW: Commit initial version
        this._saveToStorage();
        if (typeof this.onAssetAdded === "function") this.onAssetAdded(asset);
        this.render(); // Re-render to show new asset
        this._buildTagCloud(); // NEW: Rebuild tag cloud
        return asset;
    }

    /**
     * Updates an existing script asset in the Assets Panel.
     * @param {string} id - The ID of the asset to update.
     * @param {string} newName - The new name of the script file.
     * @param {string} newCode - The new source code of the script.
     * @returns {boolean} True if update was successful, false otherwise.
     */
    static updateScriptAsset(id, newName, newCode) {
        const asset = this._findById(id);
        if (!asset || asset.type !== "code") {
            console.error(
                `AssetsPanel: Cannot update asset with ID ${id}, it's not a code asset or doesn't exist.`,
            );
            return false;
        }

        // Preserve the editor tab extension; default to JavaScript.
        const finalNewName = /\.(js|html|css|json)$/i.test(newName) ? newName : newName + ".js";

        // Check if newName conflicts with other assets in the same folder, excluding itself
        const conflicts = this.assets.some(
            (a) =>
                a.id !== id &&
                !a.isBuiltIn &&
                a.name === finalNewName &&
                (a.folderId || null) === (asset.folderId || null),
        );
        if (conflicts) {
            alert(
                `An asset named '${finalNewName}' already exists in this folder. Please choose a different name.`,
            );
            return false; // Indicate failure
        }

        asset.name = finalNewName;
        asset.data = newCode;
        this._commitAssetVersion(asset.id, "Script content/name updated"); // NEW: Commit new version
        this._saveToStorage();
        if (typeof this.onAssetUpdate === "function")
            this.onAssetUpdate(asset.id, asset);
        this.render(); // Re-render to update asset name in grid if changed
        return true;
    }

    // ==================================================================
    // ===                UPGRADED ASSET LIBRARIES                      ===
    // ==================================================================
    static _getGameObstacleAssets() {
        const library = window.SMGameObstacleLibrary;
        if (!library || !Array.isArray(library.assets)) return [];

        return library.assets.map((definition) => ({
            id: definition.id,
            name: definition.name,
            type: "obstacle",
            folderId: "sme_game_obstacles",
            isBuiltIn: true,
            thumbnail: this._svgIcon("primitive"),
            tags: definition.tags || ["gameplay", "obstacle"],
            factory: () => library.create(definition.id)
        }));
    }


    static _registerCityAssets() {
        const gameplayId = "sme_gameplay";
        const citiesId = "sme_procedural_cities";

        // Always repair/create Gameplay folder.
        if (!this.folders[gameplayId]) {
            this.folders[gameplayId] = {
                id: gameplayId,
                name: "Gameplay",
                parentId: null,
                children: [],
                isBuiltIn: true,
                isProjectAssetFolder: true
            };
        }

        const gameplayFolder = this.folders[gameplayId];
        gameplayFolder.isBuiltIn = true;
        gameplayFolder.isProjectAssetFolder = true;

        if (!Array.isArray(gameplayFolder.children)) {
            gameplayFolder.children = [];
        }

        // Always repair/create Procedural Cities child folder.
        if (!this.folders[citiesId]) {
            this.folders[citiesId] = {
                id: citiesId,
                name: "Procedural Cities",
                parentId: gameplayId,
                children: [],
                isBuiltIn: true,
                isProjectAssetFolder: true
            };
        }

        const citiesFolder = this.folders[citiesId];
        citiesFolder.name = "Procedural Cities";
        citiesFolder.parentId = gameplayId;
        citiesFolder.isBuiltIn = true;
        citiesFolder.isProjectAssetFolder = true;

        if (!Array.isArray(citiesFolder.children)) {
            citiesFolder.children = [];
        }

        if (!gameplayFolder.children.includes(citiesId)) {
            gameplayFolder.children.push(citiesId);
        }

        const cityFactory = (config) => () => {
            if (
                !window.SMCityGenerator ||
                typeof window.SMCityGenerator.generate !== "function"
            ) {
                console.error(
                    "AssetsPanel: SMCityGenerator.js is not loaded. " +
                    "Load it before using Procedural City assets."
                );
                return null;
            }

            return window.SMCityGenerator.generate(config);
        };

        // IMPORTANT: RETURN the assets. _ensureBuiltins() owns insertion.
        const cityPresets = [
            {
                id: "sme_city_downtown_4x4",
                name: "Downtown City Grid (4x4)",
                type: "city",
                folderId: citiesId,
                isBuiltIn: true,
                thumbnail: this._svgIcon("model"),
                tags: ["city", "procedural", "downtown", "commercial"],
                factory: cityFactory({
                    gridX: 4,
                    gridZ: 4,
                    seed: 101,
                    includeProps: true
                })
            },
            {
                id: "sme_city_suburbs_3x3",
                name: "Residential Suburb (3x3)",
                type: "city",
                folderId: citiesId,
                isBuiltIn: true,
                thumbnail: this._svgIcon("model"),
                tags: ["city", "procedural", "residential", "suburb"],
                factory: cityFactory({
                    gridX: 3,
                    gridZ: 3,
                    seed: 202,
                    includeProps: true
                })
            },
            {
                id: "sme_city_industrial_3x3",
                name: "Industrial District (3x3)",
                type: "city",
                folderId: citiesId,
                isBuiltIn: true,
                thumbnail: this._svgIcon("model"),
                tags: ["city", "procedural", "industrial", "warehouse"],
                factory: cityFactory({
                    gridX: 3,
                    gridZ: 3,
                    seed: 303,
                    includeProps: true
                })
            }
        ];
        cityPresets.forEach((preset) => {
            const existing = this.assets.find(a => a.id === preset.id);

            if (!existing) {
                this.assets.push({
                    ...preset,
                    history: [],
                    references: []
                });
            } else {
                Object.assign(existing, preset);
            }
        });

        return cityPresets;
    }

    /**
     * Public, idempotent registration entry point used by SMCityGenerator.
     * It can safely run before or after the generator script is loaded because
     * preset factories resolve window.SMCityGenerator only when instantiated.
     */
    static registerCityLibrary(options = {}) {
        const reveal = options.reveal === true;
        const shouldRender = options.render !== false;
        const presets = this._registerCityAssets() || [];

        this.expandedSections.add("project");
        this.expandedFolders.add("sme_gameplay");
        localStorage.setItem(
            "assetsPanel_expandedFolders",
            JSON.stringify(Array.from(this.expandedFolders))
        );

        if (reveal) {
            this.currentCategory = "project";
            this.currentFilter = "all";
            this.openFolderId = "sme_procedural_cities";

            document
                .querySelectorAll(".filter-btn.active")
                .forEach((button) => button.classList.remove("active"));
            document
                .querySelector('.filter-btn[data-type="all"], .filter-btn[onclick*="all"]')
                ?.classList.add("active");
        }

        this._syncRuntimeAssetRegistry();

        if (shouldRender && this.dom?.grid) {
            this.render();
            this._buildTagCloud();
        }

        if (typeof this.onAssetsChanged === "function") {
            this.onAssetsChanged(this.assets, this.folders);
        }

        return presets;
    }


    static _getPrimitiveAssets() {
        const defaultMaterial = () =>
            new THREE.MeshStandardMaterial({
                color: 0xffffff,
                side: THREE.DoubleSide,
            });
        return [
            {
                id: "prim_cube",
                name: "Cube",
                type: "primitive",
                isBuiltIn: true,
                thumbnail: this._svgIcon("primitive"),
                factory: () =>
                    new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), defaultMaterial()),
                tags: ["primitive", "basic"],
            },
            {
                id: "prim_sphere",
                name: "Sphere",
                type: "primitive",
                isBuiltIn: true,
                thumbnail: this._svgIcon("primitive"),
                factory: () =>
                    new THREE.Mesh(
                        new THREE.SphereGeometry(0.5, 32, 16),
                        defaultMaterial(),
                    ),
                tags: ["primitive", "basic"],
            },
            {
                id: "prim_plane",
                name: "Plane",
                type: "primitive",
                isBuiltIn: true,
                thumbnail: this._svgIcon("primitive"),
                factory: () =>
                    new THREE.Mesh(new THREE.PlaneGeometry(1, 1), defaultMaterial()),
                tags: ["primitive", "basic"],
            },
            {
                id: "prim_cylinder",
                name: "Cylinder",
                type: "primitive",
                isBuiltIn: true,
                thumbnail: this._svgIcon("primitive"),
                factory: () =>
                    new THREE.Mesh(
                        new THREE.CylinderGeometry(0.5, 0.5, 1, 32),
                        defaultMaterial(),
                    ),
                tags: ["primitive", "basic"],
            },
            {
                id: "prim_wall",
                name: "Wall",
                type: "primitive",
                isBuiltIn: true,
                thumbnail: this._svgIcon("primitive"),
                factory: () =>
                    new THREE.Mesh(
                        new THREE.BoxGeometry(4, 2.5, 0.15),
                        defaultMaterial(),
                    ),
                tags: ["primitive", "architecture"],
            },
            {
                id: "prim_stair",
                name: "Stairs",
                type: "primitive",
                isBuiltIn: true,
                thumbnail: this._svgIcon("primitive"),
                factory: () => {
                    const steps = 10;
                    const stepWidth = 1.2,
                        stepHeight = 0.2,
                        stepDepth = 0.3;
                    const group = new THREE.Group();
                    for (let i = 0; i < steps; i++) {
                        const geom = new THREE.BoxGeometry(
                            stepWidth,
                            stepHeight,
                            stepDepth,
                        );
                        const mesh = new THREE.Mesh(geom, defaultMaterial());
                        mesh.position.set(
                            0,
                            stepHeight / 2 + i * stepHeight,
                            i * stepDepth,
                        );
                        group.add(mesh);
                    }
                    const boundingBox = new THREE.Box3().setFromObject(group);
                    const center = boundingBox.getCenter(new THREE.Vector3());
                    group.position.sub(center);
                    return group;
                },
                tags: ["primitive", "architecture"],
            },
            {
                id: "prim_arch",
                name: "Arch",
                type: "primitive",
                isBuiltIn: true,
                thumbnail: this._svgIcon("primitive"),
                factory: () => {
                    const shape = new THREE.Shape();
                    shape.moveTo(-1, 0);
                    shape.lineTo(-1, 1.5);
                    shape.absarc(0, 1.5, 1, Math.PI, 0, true);
                    shape.lineTo(1, 0);
                    shape.lineTo(-1, 0);
                    const extrudeSettings = { depth: 0.2, bevelEnabled: false };
                    const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
                    geometry.center();
                    return new THREE.Mesh(geometry, defaultMaterial());
                },
                tags: ["primitive", "architecture"],
            },
            {
                id: "prim_column",
                name: "Column",
                type: "primitive",
                isBuiltIn: true,
                thumbnail: this._svgIcon("primitive"),
                factory: () =>
                    new THREE.Mesh(
                        new THREE.CylinderGeometry(0.2, 0.2, 3, 20),
                        defaultMaterial(),
                    ),
                tags: ["primitive", "architecture"],
            },
        ];
    }

    static _getBuiltinModels() {
        return [
            {
                id: "model_tree",
                name: "Tree for Games",
                type: "model",
                isBuiltIn: true,
                thumbnail: this._svgIcon("model"),
                data: "assets/models/tree_for_games.glb",
                tags: ["nature", "tree", "game-ready"],
                references: [],
                history: []
            },
            {
                id: "catfish_mech_low-poly_animated",
                name: "catfish_mech_low-poly_animated",
                type: "model",
                isBuiltIn: true,
                thumbnail: this._svgIcon("model"),
                data: "assets/models/catfish_mech_low-poly_animated.glb",
                folderId: "sme_models",
                tags: ["cyberpunk", "mechanical", "arachnid", "spider"],
                references: [],
                history: []
            },
            {
                id: "robot_unity_test",
                name: "robot_unity_test",
                type: "model",
                isBuiltIn: true,
                thumbnail: this._svgIcon("model"),
                data: "assets/models/robot_unity_test.glb",
                folderId: "sme_models",
                tags: ["cyberpunk", "mechanical", "robot", "unity", "war"],
                references: [],
                history: []
            },

        ];
    }

    static _getLightAssets() {
        return [
            {
                id: "light_point",
                name: "Point Light",
                type: "light",
                isBuiltIn: true,
                thumbnail: this._svgIcon("light"),
                factory: () => {
                    const light = new THREE.PointLight(0xffffff, 50, 10);
                    light.castShadow = true;
                    return light;
                },
                tags: ["light", "point"],
            },
            {
                id: "light_sun",
                name: "Sun Light",
                type: "light",
                isBuiltIn: true,
                thumbnail: this._svgIcon("light"),
                factory: () => {
                    const light = new THREE.DirectionalLight(0xfff5e1, 8);
                    light.castShadow = true;
                    light.shadow.mapSize.width = 2048;
                    light.shadow.mapSize.height = 2048;
                    light.shadow.camera.near = 0.5;
                    light.shadow.camera.far = 50;
                    light.shadow.bias = -0.0001;
                    return light;
                },
                tags: ["light", "sun", "directional"],
            },
            {
                id: "light_spot",
                name: "Spotlight",
                type: "light",
                isBuiltIn: true,
                thumbnail: this._svgIcon("light"),
                factory: () => {
                    const light = new THREE.SpotLight(
                        0xffffff,
                        200,
                        20,
                        Math.PI / 6,
                        0.2,
                        1.5,
                    );
                    light.castShadow = true;
                    return light;
                },
                tags: ["light", "spot"],
            },
            {
                id: "light_rect",
                name: "Rect Area Light",
                type: "light",
                isBuiltIn: true,
                thumbnail: this._svgIcon("light"),
                factory: () => {
                    const light = new THREE.RectAreaLight(0x87ceeb, 10, 2, 3);
                    return light;
                },
                tags: ["light", "area"],
            },
            {
                id: "light_hemi",
                name: "Hemisphere Sky",
                type: "light",
                isBuiltIn: true,
                thumbnail: this._svgIcon("light"),
                factory: () => {
                    const light = new THREE.HemisphereLight(0x87ceeb, 0x404040, 2);
                    return light;
                },
                tags: ["light", "environment"],
            },
        ];
    }

    /**
     * Saves the current 3D viewport scene as a .scene File inside AssetsPanel.
     * @param {string} sceneName - Name of the level file (e.g., "Level_01.scene")
     */
    static saveCurrentSceneAsset(sceneName = "NewLevel.scene") {
        if (!this.scene) {
            console.error("AssetsPanel: No active scene found to save.");
            return null;
        }

        // 1. Filter out editor helpers (Grid, Lights, Transform Controls, Cameras)
        const exportableObjects = this.scene.children.filter(child =>
            child.userData?.selectable && !child.userData?.isSystemObject
        );

        // 2. Serialize objects into JSON
        const sceneData = exportableObjects.map(obj => obj.toJSON());

        const id = `scene_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        const finalName = sceneName.endsWith(".scene") ? sceneName : sceneName + ".scene";

        // 3. Create Scene File Asset
        const asset = {
            id,
            name: finalName,
            type: "scene",
            data: JSON.stringify(sceneData),
            thumbnail: this._svgIcon("scene"),
            isFavorite: false,
            isBuiltIn: false,
            folderId: this.openFolderId,
            tags: ["scene", "level"],
            history: [],
            references: []
        };

        this.assets.push(asset);
        this._saveToStorage();
        this.render();
        console.log(`AssetsPanel: Saved scene asset "${finalName}".`);
        return asset;
    }

    /**
     * Clears the active viewport and loads a .scene asset file.
     */
    static loadSceneAsset(assetId) {
        const asset = this._findById(assetId);
        if (!asset || asset.type !== "scene") return;

        if (!confirm(`Open scene "${asset.name}"? Unsaved viewport objects will be cleared.`)) return;

        // Clear existing user objects from the main scene
        if (this.scene) {
            const toRemove = this.scene.children.filter(c => c.userData?.selectable && !c.userData?.isSystemObject);
            toRemove.forEach(c => this.scene.remove(c));
        }

        // Load scene objects
        this._addToScene(assetId);
        console.log(`AssetsPanel: Loaded scene file "${asset.name}".`);
    }

    /**
     * Opens the Reference Viewer (Dependency Graph) inside the main assets grid area.
     * @param {string|null} centerAssetId - Optional ID of the asset to focus on.
     */
    static showDependencyGraph(centerAssetId = null) {
        const grid = document.getElementById('assetsGrid');
        const graphContainer = document.getElementById('referenceViewerContainer');
        const canvasContainer = document.getElementById('dependencyGraphCanvas');

        if (!grid || !graphContainer || !canvasContainer) {
            console.error("Reference Viewer DOM elements missing.");
            return;
        }

        // 1. Switch Views
        grid.style.display = 'none';
        graphContainer.style.display = 'flex';

        // 2. Clean up old network
        if (window.currentGraphNetwork) {
            window.currentGraphNetwork.destroy();
            window.currentGraphNetwork = null;
        }

        // 3. Prepare Data (Nodes & Edges)
        // Ensure vis.js is loaded
        if (typeof vis === 'undefined') {
            canvasContainer.innerHTML = '<div style="padding:20px; color:red;">Vis.js library not loaded. Cannot display graph.</div>';
            return;
        }

        const nodes = new vis.DataSet();
        const edges = new vis.DataSet();
        const allAssets = this.assets.filter(a => !a.isBuiltIn);

        allAssets.forEach(asset => {
            // ... (Your existing color/shape logic here) ...
            let color = '#555555';
            let shape = 'dot';

            // Simplified color mapping for brevity (keep your full switch logic)
            if (asset.type === 'material') { color = '#00cc66'; shape = 'box'; }
            else if (asset.type === 'texture') { color = '#ff9933'; shape = 'square'; }
            else if (asset.type === 'model') { color = '#cc33ff'; shape = 'triangle'; }

            nodes.add({
                id: asset.id,
                label: asset.name.length > 15 ? asset.name.slice(0, 12) + '...' : asset.name,
                title: `${asset.name}\nType: ${asset.type}`,
                color: { background: color, border: '#888' },
                shape: shape,
                font: { color: '#eee', size: 12, face: 'Segoe UI' },
                shadow: true
            });
        });

        // Add Edges
        allAssets.forEach(asset => {
            if (asset.references && asset.references.length > 0) {
                asset.references.forEach(refId => {
                    if (nodes.get(refId)) {
                        edges.add({
                            from: asset.id,
                            to: refId,
                            arrows: 'to',
                            color: { color: '#666', highlight: '#00aaff' },
                            width: 1,
                            smooth: { type: 'cubicBezier' }
                        });
                    }
                });
            }
        });

        // 4. Network Config (Unreal Style - Left to Right flow)
        const options = {
            height: '100%',
            width: '100%',
            autoResize: true,
            layout: {
                hierarchical: {
                    enabled: true,
                    direction: 'LR', // Left to Right like UE Reference Viewer
                    sortMethod: 'directed',
                    levelSeparation: 200,
                    nodeSpacing: 100
                }
            },
            physics: false, // Hierarchical doesn't need physics usually
            interaction: {
                hover: true,
                navigationButtons: true,
                zoomView: true,
                dragView: true
            }
        };

        // 5. Initialize Network
        window.currentGraphNetwork = new vis.Network(canvasContainer, { nodes, edges }, options);

        // 6. Focus on specific asset if requested
        if (centerAssetId && nodes.get(centerAssetId)) {
            window.currentGraphNetwork.selectNodes([centerAssetId]);
            window.currentGraphNetwork.focus(centerAssetId, {
                scale: 1.0,
                animation: true
            });
        }
    }

    /**
     * Closes the Reference Viewer and shows the asset grid again.
     */
    static closeDependencyGraph() {
        const grid = document.getElementById('assetsGrid');
        const graphContainer = document.getElementById('referenceViewerContainer');

        if (grid && graphContainer) {
            graphContainer.style.display = 'none';

            // FIX: Remove inline display style so CSS classes (.list-view or default) take over
            grid.style.display = '';
        }

        if (window.currentGraphNetwork) {
            window.currentGraphNetwork.destroy();
            window.currentGraphNetwork = null;
        }
    }

    static _ensureBuiltins() {
        // 1. Clear previous built-ins to re-add correctly
        this.assets = this.assets.filter((a) => !a.isBuiltIn);

        // 2. Folder Setup
        const rootId = "sme_models";
        const natureId = "sme_nature";
        const archId = "sme_architecture";
        const gameplayId = "sme_gameplay";
        const obstaclesId = "sme_game_obstacles";

        // Ensure Root Folder exists
        if (!this.folders[rootId]) {
            this.folders[rootId] = {
                id: rootId,
                name: "SM-Engine-models",
                parentId: null,
                children: [],
                isBuiltIn: true,
                isProjectAssetFolder: true
            };
        }
        // Migrate/repair folders saved by older AssetManager schemas. Missing
        // children arrays used to abort this method before city registration.
        this.folders[rootId].name = "SM-Engine-models";
        this.folders[rootId].parentId = null;
        this.folders[rootId].isBuiltIn = true;
        this.folders[rootId].isProjectAssetFolder = true;
        if (!Array.isArray(this.folders[rootId].children)) {
            this.folders[rootId].children = [];
        }

        // Ensure Subfolder "Nature" exists inside Root
        if (!this.folders[natureId]) {
            this.folders[natureId] = {
                id: natureId,
                name: "Nature Assets",
                parentId: rootId, // Linked to parent
                children: [],
                isBuiltIn: true,
                isProjectAssetFolder: true
            };
        }
        this.folders[natureId].parentId = rootId;
        if (!Array.isArray(this.folders[natureId].children)) this.folders[natureId].children = [];
        if (!this.folders[rootId].children.includes(natureId)) this.folders[rootId].children.push(natureId);

        // Ensure Subfolder "Architecture" exists inside Root
        if (!this.folders[archId]) {
            this.folders[archId] = {
                id: archId,
                name: "Architecture",
                parentId: rootId, // Linked to parent
                children: [],
                isBuiltIn: true,
                isProjectAssetFolder: true
            };
        }
        this.folders[archId].parentId = rootId;
        if (!Array.isArray(this.folders[archId].children)) this.folders[archId].children = [];
        if (!this.folders[rootId].children.includes(archId)) this.folders[rootId].children.push(archId);

        if (!this.folders[gameplayId]) {
            this.folders[gameplayId] = {
                id: gameplayId,
                name: "Gameplay",
                parentId: null,
                children: [],
                isBuiltIn: true,
                isProjectAssetFolder: true
            };
        }
        this.folders[gameplayId].name = "Gameplay";
        this.folders[gameplayId].parentId = null;
        this.folders[gameplayId].isBuiltIn = true;
        this.folders[gameplayId].isProjectAssetFolder = true;
        if (!Array.isArray(this.folders[gameplayId].children)) {
            this.folders[gameplayId].children = [];
        }

        if (!this.folders[obstaclesId]) {
            this.folders[obstaclesId] = {
                id: obstaclesId,
                name: "Blockout Obstacles",
                parentId: gameplayId,
                children: [],
                isBuiltIn: true,
                isProjectAssetFolder: true
            };
        }
        this.folders[obstaclesId].parentId = gameplayId;
        if (!Array.isArray(this.folders[obstaclesId].children)) {
            this.folders[obstaclesId].children = [];
        }
        if (!this.folders[gameplayId].children.includes(obstaclesId)) {
            this.folders[gameplayId].children.push(obstaclesId);
        }

        // 3. Add Built-in Assets (Prims, Lights, Models, and Game Obstacles)
        const builtinPrims = this._getPrimitiveAssets();
        const builtinLights = this._getLightAssets();
        const builtinModels = this._getBuiltinModels();
        const builtinGameObstacles = this._getGameObstacleAssets();
        const builtinCityAssets = this._registerCityAssets() || [];

        for (const b of [
            ...builtinPrims,
            ...builtinLights,
            ...builtinModels,
            ...builtinGameObstacles,
            ...builtinCityAssets
        ]) {
            const existing = this.assets.find((a) => a.id === b.id);
            if (!existing) {
                this.assets.unshift({ ...b, history: [], references: [] });
            } else {
                if (b.folderId) existing.folderId = b.folderId;
                if (b.data) existing.data = b.data;
                existing.isBuiltIn = true;
            }
        }

        // 4. NEW: GENERATE SCREENSHOTS (Thumbnails)
        this.assets.forEach(asset => {
            // Only target models that have a file path and no real screenshot yet
            if (asset.type === 'model' && asset.data && asset.isBuiltIn) {
                if (!asset.thumbnail || !asset.thumbnail.startsWith('data:image')) {

                    // Call the helper function (make sure this function is defined in your script)
                    _generatePathThumbnail(asset.data).then(dataURL => {
                        asset.thumbnail = dataURL;

                        // If the assets panel is currently open, refresh the UI
                        const panel = document.getElementById('assetsPanel');
                        if (panel && panel.classList.contains('visible')) {
                            this.render();
                        }
                    }).catch(err => {
                        console.warn(`[ThumbGen] Failed for ${asset.name}:`, err);
                    });
                }
            }
        });

        this._ensureProjectManifestAssets();
        this._syncRuntimeAssetRegistry();
    }

    static _ensureProjectManifestAssets() {
        const manifest = typeof window !== "undefined" ? window.SMProjectAssetManifest : null;
        if (!manifest) return;

        const folderIdMap = new Map();

        const manifestFolders = Array.isArray(manifest.folders) ? manifest.folders : [];
        manifestFolders.forEach((folder) => {
            if (!folder?.id || !folder?.name) return;

            const resolvedParentId = folder.parentId
                ? (folderIdMap.get(folder.parentId) || folder.parentId)
                : null;

            const matchingFolder =
                this.folders[folder.id] ||
                Object.values(this.folders).find(
                    (entry) =>
                        entry.name === folder.name &&
                        (entry.parentId || null) === (resolvedParentId || null),
                );

            const resolvedId = matchingFolder?.id || folder.id;
            folderIdMap.set(folder.id, resolvedId);

            const existing = this.folders[resolvedId] || {};
            this.folders[resolvedId] = {
                ...existing,
                id: resolvedId,
                name: folder.name,
                parentId: resolvedParentId,
                children: Array.isArray(folder.children) ? [...folder.children] : [],
                isBuiltIn: true,
                isProjectAssetFolder: true,
            };
        });

        manifestFolders.forEach((folder) => {
            const resolvedId = folderIdMap.get(folder.id) || folder.id;
            const resolvedParentId = folder.parentId
                ? (folderIdMap.get(folder.parentId) || folder.parentId)
                : null;

            if (this.folders[resolvedId]) {
                this.folders[resolvedId].parentId = resolvedParentId;
            }

            if (!resolvedParentId || !this.folders[resolvedParentId]) return;
            const parent = this.folders[resolvedParentId];
            if (!Array.isArray(parent.children)) parent.children = [];
            if (!parent.children.includes(resolvedId)) parent.children.push(resolvedId);
        });

        const manifestAssets = Array.isArray(manifest.assets) ? [...manifest.assets] : [];
        if (Array.isArray(manifest.groups)) {
            manifest.groups.forEach((group) => {
                const basePath = String(group.basePath || "").replace(/\\/g, "/").replace(/\/+$/, "");
                const folderId = group.folderId
                    ? (folderIdMap.get(group.folderId) || group.folderId)
                    : null;
                const type = group.type || "texture";
                const tags = Array.isArray(group.tags) ? [...group.tags] : [];
                const files = Array.isArray(group.files) ? group.files : [];
                const idPrefix = group.idPrefix || "project_asset";

                files.forEach((fileName) => {
                    if (this._isHiddenProjectEntryName(fileName)) return;
                    const source = `${basePath}/${fileName}`;
                    manifestAssets.push({
                        id: `${idPrefix}_${this._slugifyAssetName(fileName)}`,
                        name: fileName,
                        type,
                        folderId,
                        data: source,
                        thumbnail: this._isSceneMediaAssetType(type) && type !== "video" ? source : null,
                        tags,
                    });
                });
            });
        }

        manifestAssets.forEach((asset) => {
            if (!asset?.id || !asset?.name || !asset?.type) return;
            if (this._isHiddenProjectEntryName(asset.name)) return;

            const normalizedData = asset.data || asset.url || null;
            const resolvedFolderId = asset.folderId
                ? (folderIdMap.get(asset.folderId) || asset.folderId)
                : null;

            const normalized = {
                id: asset.id,
                name: asset.name,
                type: asset.type,
                data: normalizedData ? this._normalizeAssetSource(normalizedData) : null,
                thumbnail: asset.thumbnail
                    ? this._normalizeAssetSource(asset.thumbnail)
                    : (this._isSceneMediaAssetType(asset.type) && asset.type !== "video" && normalizedData ? this._normalizeAssetSource(normalizedData) : null),
                isFavorite: false,
                isBuiltIn: true,
                isProjectAsset: true,
                folderId: resolvedFolderId,
                tags: Array.isArray(asset.tags) ? [...asset.tags] : [],
                history: [],
                references: [],
            };

            const existingIndex = this.assets.findIndex((entry) => entry.id === normalized.id);
            if (existingIndex >= 0) {
                this.assets[existingIndex] = {
                    ...this.assets[existingIndex],
                    ...normalized,
                };
            } else {
                this.assets.push(normalized);
            }
        });
    }

    static _slugifyAssetName(value = "") {
        return String(value || "")
            .toLowerCase()
            .replace(/\.[^.]+$/, "")
            .replace(/[^a-z0-9]+/g, "_")
            .replace(/^_+|_+$/g, "");
    }

    // MODIFIED: Added 'prefab' type
    static _getAssetType = (filename) => {
        const ext = filename.split(".").pop().toLowerCase();
        if (["glb", "gltf", "fbx", "obj"].includes(ext)) return "model";
        if (["png", "jpg", "jpeg", "webp", "bmp", "gif", "avif", "tif", "tiff"].includes(ext)) return "texture";
        if (["svg", "ico"].includes(ext)) return "icon";
        if (["mp4", "webm", "mov", "m4v", "ogv", "avi"].includes(ext)) return "video";
        if (["mp3", "wav", "ogg", "m4a", "aac", "flac"].includes(ext)) return "audio";
        if (["hdr", "exr"].includes(ext)) return "hdri";
        if (["json"].includes(ext)) return "material"; // Custom JSON format for PBR materials
        if (["js"].includes(ext)) return "code";
        if (["prefab"].includes(ext)) return "prefab"; // NEW: Prefab type
        if (["scene", "sme"].includes(ext)) return "scene";
        return null;
    };
    // END OF CLASS
}

// Expose class for inline HTML handlers and external init checks (window.AssetsPanel).
if (typeof window !== "undefined") {
    // Preserve Drive/Google integration that may have been attached by an older
    // AssetsPanel/API script before this replacement loaded.
    if (
        __SMAssetsPanelPreviousGlobal &&
        __SMAssetsPanelPreviousGlobal !== AssetsPanel
    ) {
        const driveMethodNames = Object.getOwnPropertyNames(
            __SMAssetsPanelPreviousGlobal,
        ).filter((name) => /drive|google/i.test(name));

        for (const name of driveMethodNames) {
            const descriptor = Object.getOwnPropertyDescriptor(
                __SMAssetsPanelPreviousGlobal,
                name,
            );

            if (!descriptor) continue;

            // Keep our safe dispatcher for syncGoogleDrive, but remember the
            // old concrete implementation so it is called first.
            if (
                name === "syncGoogleDrive" &&
                typeof descriptor.value === "function"
            ) {
                AssetsPanel._legacyDriveSyncMethod =
                    descriptor.value;
                continue;
            }

            if (!Object.prototype.hasOwnProperty.call(AssetsPanel, name)) {
                try {
                    Object.defineProperty(
                        AssetsPanel,
                        name,
                        descriptor,
                    );
                } catch (error) {
                    console.warn(
                        `AssetsPanel: Could not preserve external method '${name}'.`,
                        error,
                    );
                }
            }
        }
    }

    window.AssetsPanel = AssetsPanel;

    // If a late UI/provider rebuild occurs, repair references without replacing
    // the Google Drive API implementation.
    window.addEventListener("sm-assets-panel-ui-ready", () => {
        AssetsPanel._refreshDOMCache();
        AssetsPanel._ensurePanelHeightResizer();
        AssetsPanel._restorePanelHeight();
        AssetsPanel._setupPanelHeightResize();
        AssetsPanel._bindCurrentImportInputs();
        AssetsPanel._repairGameplayFolderTree();
        AssetsPanel._ensureProjectManifestAssets();
        AssetsPanel._ensureGoogleDriveButton();
        AssetsPanel._ensurePersistenceButton();
        AssetsPanel.render();
    });

    window.addEventListener("sm-assets-google-drive-ready", () => {
        AssetsPanel._afterExternalAssetSync();
    });

    window.addEventListener("sm-asset-drive-sources-updated", () => {
        AssetsPanel._ensureGoogleDriveButton();
        console.log(
            `[AssetsPanel] Drive source registry updated (${AssetsPanel.getGoogleDriveSources().length} enabled source(s)).`,
        );
    });
}