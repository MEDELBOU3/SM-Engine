// Enhanced Assets Panel System
class AssetVersion {
    constructor(asset) {
       this.assetId = asset.id;
       this.version = Date.now();
       this.data = structuredClone(asset);
    }
}



class AssetsPanel {
    constructor(scene, renderer) {
        this.scene = scene;
        this.renderer = renderer

        this.gltfLoader = new THREE.GLTFLoader();
        this.objLoader = new THREE.OBJLoader();
        this.fbxLoader = new THREE.FBXLoader();
        this.textureLoader = new THREE.TextureLoader();
        this.rgbeLoader = new THREE.RGBELoader();
        
        this.supportedModelFormats = ['.glb', '.gltf', '.fbx', '.obj'];
        this.supportedHDRIFormats = ['.hdr', '.exr'];
        this.supportedTextureFormats = ['.jpg', '.jpeg', '.png', '.tga', '.tif', '.tiff', '.bmp'];
        this.supportedMaterialFormats = ['.mtl', '.mat'];

        this.assets = {
            folders: {},
            models: [],
            hdris: [],
            materials: [],
            textures: [],
            recent: []
        };

        this.favorites = JSON.parse(localStorage.getItem('assetFavorites')) || [];
    
        this.currentPath = [];
        this.currentView = 'grid';
        this.sortBy = 'name';
        this.searchFilter = '';

        this.mixers = new Map();
        this.materialLibrary = {};
        this.assetCache = new Map();

        this.previewSettings = {
            autoRotate: true,
            showGrid: true,
            showBones: false,
            showWireframe: false,
            backgroundColor: '#1a1a1a'
        };

        this.previewScene = null;
        this.previewCamera = null;
        this.previewRenderer = null;
        this.previewControls = null;
        this.previewMixer = null;
        this.previewGrid = null;
        this.previewWireframe = null;
        this.previewSkeleton = null;
        this.previewModel = null;
        this.activeAction = null;
        this.previewAnimationId = null;
        this.currentAsset = null;

        this.initializeUI();
        this.setupEventListeners();
        this.loadSavedAssets();
    }


    initializeUI() {
        // Create assets panel HTML with improved UI
        const assetsPanel = `
            <div class="assets-panel">
                <div class="resize-handle"></div>
                <div class="assets-header">
                    <div class="assets-toolbar">
                        <div class="search-bar">
                            <input type="text" placeholder="Search assets..." class="search-input">
                            <button class="search-btn"><i class="fas fa-search"></i></button>
                        </div>
                        
                        <div class="view-options">
                            <button class="view-btn active" data-view="grid"><i class="fas fa-th"></i></button>
                            <button class="view-btn" data-view="list"><i class="fas fa-list"></i></button>
                            <button class="sort-btn"><i class="fas fa-sort"></i></button>
                        </div>
                    </div>
                    
                    <div class="tabs">
                        <button class="tab-btn active" data-tab="all">All Assets</button>
                        <button class="tab-btn" data-tab="models">3D Models</button>
                        <button class="tab-btn" data-tab="materials">Materials</button>
                        <button class="tab-btn" data-tab="textures">Textures</button>
                        <button class="tab-btn" data-tab="hdris">HDRI</button>
                        <button class="tab-btn" data-tab="favorites">Favorites</button>
                        <button class="tab-btn" data-tab="recent">Recent</button>
                    </div>
                    
                    <div class="navigation-bar">
                        <button class="nav-btn back-btn" disabled><i class="fas fa-arrow-left"></i></button>
                        <div class="breadcrumb"></div>
                        <div class="import-container">
                            <button class="import-btn">
                                <i class="fas fa-plus"></i> Import
                            </button>
                            <div class="import-dropdown">
                                <button class="import-option" data-type="file">File</button>
                                <button class="import-option" data-type="folder">Folder</button>
                                <button class="import-option" data-type="url">From URL</button>
                            </div>
                            <input type="file" class="file-input" multiple accept=".glb,.gltf,.fbx,.obj,.hdr,.exr,.jpg,.jpeg,.png,.tga,.tif,.tiff,.bmp,.mtl,.mat" style="display: none;">
                            <input type="file" class="folder-input" webkitdirectory directory multiple style="display: none;">
                        </div>
                    </div>
                </div>
                
                <div class="assets-content">
                    <!-- Main grid view -->
                    <div class="assets-view grid-view active"></div>
                    <!-- List view -->
                    <div class="assets-view list-view"></div>
                    
                    <!-- Empty state -->
                    <div class="empty-state">
                        <i class="fas fa-inbox"></i>
                        <p>No assets found. Import some files to get started.</p>
                    </div>
                </div>
                
                <div class="asset-preview-panel">
                    <div class="preview-header">
                        <span class="preview-title">Asset Preview</span>
                        <!--<button class="close-preview-btn"><i class="fas fa-times"></i></button>-->
                        <div class="preview-controls">
                            <button class="preview-btn wireframe-btn" title="Toggle Wireframe"><i class="fas fa-vector-square"></i></button>
                            <button class="preview-btn grid-btn active" title="Toggle Grid"><i class="fas fa-border-all"></i></button>
                            <button class="preview-btn rotate-btn active" title="Auto Rotate"><i class="fas fa-sync"></i></button>
                            <button class="preview-btn bones-btn" title="Show Bones"><i class="fas fa-bone"></i></button>
                            <button class="preview-btn bg-color-btn" title="Change Background"><i class="fas fa-fill-drip"></i></button>
                        </div>
                    </div>
                    <div class="preview-container" display="none">
                        <canvas id="preview-canvas"></canvas>
                    </div>
                    <div class="preview-info">
                        <h3 class="model-name">No asset selected</h3>
                        <div class="model-stats"></div>
                    </div>
                    <div class="animation-controls">
                        <select class="animation-select"></select>
                        <div class="animation-buttons">
                            <button class="play-btn"><i class="fas fa-play"></i></button>
                            <button class="pause-btn"><i class="fas fa-pause"></i></button>
                            <button class="stop-btn"><i class="fas fa-stop"></i></button>
                        </div>
                        <div class="animation-timeline">
                            <input type="range" min="0" max="100" value="0" class="timeline-slider">
                            <div class="timeline-info">
                                <span class="current-time">0.00s</span>
                                <span class="total-time">0.00s</span>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="asset-context-menu">
                    <ul>
                        <li data-action="preview"><i class="fas fa-eye"></i> Preview</li>
                        <li data-action="add-to-scene"><i class="fas fa-plus-circle"></i> Add to Scene</li>
                        <li data-action="favorite"><i class="far fa-star"></i> Add to Favorites</li>
                        <li data-action="rename"><i class="fas fa-edit"></i> Rename</li>
                        <li data-action="duplicate"><i class="fas fa-copy"></i> Duplicate</li>
                        <li data-action="delete"><i class="fas fa-trash"></i> Delete</li>
                    </ul>
                </div>
                
                <div class="sort-menu">
                    <ul>
                        <li data-sort="name"><i class="fas fa-sort-alpha-down"></i> Name</li>
                        <li data-sort="date"><i class="fas fa-clock"></i> Date</li>
                        <li data-sort="type"><i class="fas fa-file"></i> Type</li>
                        <li data-sort="size"><i class="fas fa-weight"></i> Size</li>
                    </ul>
                </div>
                
                <div class="drop-zone">
                    <div class="drop-zone-content">
                        <i class="fas fa-cloud-upload-alt"></i>
                        <p>Drag & Drop Files or Folders Here</p>
                    </div>
                </div>
                
                <div class="import-url-dialog">
                    <div class="dialog-header">
                        <h3>Import from URL</h3>
                        <button class="close-dialog-btn"><i class="fas fa-times"></i></button>
                    </div>
                    <div class="dialog-content">
                        <input type="text" placeholder="Enter URL..." class="url-input">
                        <div class="url-type-selection">
                            <label>
                                <input type="radio" name="url-type" value="model" checked> 3D Model
                            </label>
                            <label>
                                <input type="radio" name="url-type" value="hdri"> HDRI
                            </label>
                            <label>
                                <input type="radio" name="url-type" value="texture"> Texture
                            </label>
                        </div>
                    </div>
                    <div class="dialog-footer">
                        <button class="cancel-url-btn">Cancel</button>
                        <button class="import-url-btn">Import</button>
                    </div>
                </div>
            </div>
        `;
        
        // Add to DOM
        document.querySelector('.viewport').insertAdjacentHTML('beforeend', assetsPanel);
        
        // Add styles
        const styles = `
           .assets-panel {
                position: absolute;
                left: 47%;
                bottom: -10vh;
                width: 95%;
                z-index: 4;
                min-height: 300px;
                max-height: 74vh;
                background: #2a2a2a;
                border-top: 1px solid #3a3a3a;
                display: flex;
                flex-direction: column;
                transform: translate(-50%, 100%);
                transition: transform 0.3s ease-in-out;
                color: #e0e0e0;
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            }

            .resize-handle {
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 3px;
                background: #777;
                cursor: ns-resize; /* Vertical resize cursor */
            }
        
            .assets-panel.visible {
                transform: translate(-50%, 0);
            }
            
        `;
        
        const styleSheet = document.createElement('style');
        styleSheet.textContent = styles;
        document.head.appendChild(styleSheet);
    }

setupEventListeners() {
    this.initTabListeners();
    
    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const tab = e.target.dataset.tab;
            this.switchTab(tab);
        });
    });

    // View toggle buttons
    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const view = e.target.closest('.view-btn').dataset.view;
            this.switchView(view);
        });
    });

    // Sort menu
    const sortBtn = document.querySelector('.sort-btn');
    const sortMenu = document.querySelector('.sort-menu');

    sortBtn.addEventListener('click', () => {
        sortMenu.classList.toggle('visible');
    });

    document.querySelectorAll('.sort-menu li').forEach(item => {
        item.addEventListener('click', (e) => {
            this.sortBy = e.target.dataset.sort;
            this.sortAssets(this.sortBy);
            sortMenu.classList.remove('visible');
        });
    });

   
    // File import handling
    const fileInput = document.querySelector('.file-input');
    const folderInput = document.querySelector('.folder-input');
    const importBtn = document.querySelector('.import-btn');
    const importDropdown = document.querySelector('.import-dropdown');

    importBtn.addEventListener('click', () => {
       importDropdown.classList.toggle('visible');
    });

    document.querySelectorAll('.import-option').forEach(option => {
        option.addEventListener('click', (e) => {
            const type = e.target.dataset.type;
            importDropdown.classList.remove('visible');
            
            if (type === 'file') {
                fileInput.click();
            } else if (type === 'folder') {
                folderInput.click();
            } else if (type === 'url') {
                document.querySelector('.import-url-dialog').classList.add('visible');
            }
        });
    });

    fileInput.addEventListener('change', (e) => {
        this.handleFiles(Array.from(e.target.files));
        });
        
    folderInput.addEventListener('change', (e) => {
        this.handleFiles(Array.from(e.target.files));
    });

    // URL import dialog
    const urlDialog = document.querySelector('.import-url-dialog');
    const closeDialogBtn = document.querySelector('.close-dialog-btn');
    const importUrlBtn = document.querySelector('.import-url-btn');
    const cancelUrlBtn = document.querySelector('.cancel-url-btn');

    closeDialogBtn.addEventListener('click', () => {
      urlDialog.classList.remove('visible');
    });

    cancelUrlBtn.addEventListener('click', () => {
        urlDialog.classList.remove('visible');
    });

    importUrlBtn.addEventListener('click', () => {
        const url = document.querySelector('.url-input').value.trim();
        const type = document.querySelector('input[name="url-type"]:checked').value;
        if (url) {
            this.importFromUrl(url, type);
            urlDialog.classList.remove('visible');
        }
    });

    // Drag and drop handling
    const dropZone = document.querySelector('.drop-zone');
    const assetsPanel = document.querySelector('.assets-panel');

    assetsPanel.addEventListener('dragover', (e) => {
        e.preventDefault();
      dropZone.classList.add('active');
    });
    
    assetsPanel.addEventListener('dragleave', (e) => {
        if (!assetsPanel.contains(e.relatedTarget)) {
           e.preventDefault();
           dropZone.classList.remove('active');
        }
    });

    assetsPanel.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('active');
        
        if (e.dataTransfer.files.length > 0) {
            this.handleFiles(Array.from(e.dataTransfer.files));
        }
    });

    //Resize assets panel
    document.addEventListener("DOMContentLoaded", function () {
        const panel = document.querySelector(".assets-panel");
        const resizeHandle = document.createElement("div");
        resizeHandle.classList.add("resize-handle");
        panel.appendChild(resizeHandle);
    
        let isResizing = false;
        let startY;
        let startHeight;
    
        resizeHandle.addEventListener("mousedown", function (e) {
            isResizing = true;
            startY = e.clientY;
            startHeight = panel.offsetHeight;
            document.addEventListener("mousemove", resizePanel);
            document.addEventListener("mouseup", stopResizing);
        });
    
        function resizePanel(e) {
            if (!isResizing) return;
            let newHeight = startHeight - (e.clientY - startY);
            newHeight = Math.max(300, Math.min(800, newHeight)); // Limit min/max height
            panel.style.height = `${newHeight}px`;
        }
    
        function stopResizing() {
            isResizing = false;
            document.removeEventListener("mousemove", resizePanel);
            document.removeEventListener("mouseup", stopResizing);
        }
    });
    

    // Search functionality
    const searchInput = document.querySelector('.search-input');

    searchInput.addEventListener('input', (e) => {
        this.searchFilter = e.target.value.toLowerCase();
        this.filterAssets();
    });

    // Navigation
    const backBtn = document.querySelector('.back-btn');

    backBtn.addEventListener('click', () => {
        if (this.currentPath.length > 0) {
            this.currentPath.pop();
            this.navigateToFolder(this.currentPath.join('/'));
        }
    });

    // Preview panel controls
    const closePreviewBtn = document.querySelector('.close-preview-btn');
    const previewPanel = document.querySelector('.asset-preview-panel');

    closePreviewBtn.addEventListener('click', () => {
        previewPanel.classList.remove('visible');
    });

    // Preview control buttons
    document.querySelector('.wireframe-btn').addEventListener('click', (e) => {
        this.previewSettings.showWireframe = !this.previewSettings.showWireframe;
        e.target.closest('.preview-btn').classList.toggle('active', this.previewSettings.showWireframe);
        this.updatePreviewSettings(); // Apply changes immediately
    });

    document.querySelector('.grid-btn').addEventListener('click', (e) => {
        this.previewSettings.showGrid = !this.previewSettings.showGrid;
        e.target.closest('.preview-btn').classList.toggle('active', this.previewSettings.showGrid);
        this.updatePreviewSettings(); // Apply changes immediately
    });

    document.querySelector('.rotate-btn').addEventListener('click', (e) => {
        this.previewSettings.autoRotate = !this.previewSettings.autoRotate;
        e.target.closest('.preview-btn').classList.toggle('active', this.previewSettings.autoRotate);
        this.updatePreviewSettings(); // Apply changes immediately
    });

    document.querySelector('.bones-btn').addEventListener('click', (e) => {
        this.previewSettings.showBones = !this.previewSettings.showBones;
        e.target.closest('.preview-btn').classList.toggle('active', this.previewSettings.showBones);
        this.updatePreviewSettings(); // Apply changes immediately
    });

    document.querySelector('.bg-color-btn').addEventListener('click', () => {
        // Simple toggle example, could use a color picker
        const currentColor = this.previewSettings.backgroundColor;
        this.previewSettings.backgroundColor = currentColor === '#1a1a1a' ? '#4a4a4a' : (currentColor === '#4a4a4a' ? '#f0f0f0' : '#1a1a1a');
        this.updatePreviewSettings(); // Apply changes immediately
    });

  // --- This entire block goes inside your setupEventListeners() method ---

const assetsContentElement = document.querySelector('.assets-content');

if (assetsContentElement) {
    // --- 1. Listener for LEFT CLICKS on asset items (for selection and preview) ---
    assetsContentElement.addEventListener('click', (e) => {
        // Ensure it's a left click (button 0 is the main mouse button)
        if (e.button !== 0) {
            return; // Ignore right-clicks or middle-clicks here
        }

        const assetItem = e.target.closest('.asset-item');
        if (assetItem) {
            const assetId = assetItem.dataset.assetId;
            if (!assetId) {
                console.warn("Asset item clicked but no asset-id found:", assetItem);
                return;
            }

            // --- Handle Selection Logic ---
            const isCtrlOrMeta = e.ctrlKey || e.metaKey; // For multi-select add/remove
            const isShift = e.shiftKey;                  // For range select (advanced)

            if (!isCtrlOrMeta && !isShift) {
                // Standard single click: Deselect others, then toggle the current one
                const wasSelected = assetItem.classList.contains('selected');
                document.querySelectorAll('.asset-item.selected').forEach(selected => {
                    selected.classList.remove('selected');
                });
                // If it wasn't already the only selected item, select it.
                // If it was the only selected item, this will deselect it.
                // If you want a click on an already selected single item to KEEP it selected,
                // you'd modify this:
                // if (!wasSelected) assetItem.classList.add('selected');
                // else assetItem.classList.add('selected'); // Keep it selected
                // For now, standard toggle:
                assetItem.classList.add('selected'); // Select the clicked item

            } else if (isCtrlOrMeta) {
                // Ctrl/Meta click: Toggle selection of the clicked item without affecting others
                assetItem.classList.toggle('selected');
            } else if (isShift) {
                // Shift click (basic range selection example - can be made more robust)
                // This requires knowing the "last clicked" item that wasn't part of a shift-select
                const lastSelectedAnchor = assetsContentElement.querySelector('.asset-item.last-anchor-selected');
                document.querySelectorAll('.asset-item.selected').forEach(selected => selected.classList.remove('selected')); // Clear previous range

                if (lastSelectedAnchor) {
                    const allItems = Array.from(assetsContentElement.querySelectorAll('.asset-item'));
                    const anchorIndex = allItems.indexOf(lastSelectedAnchor);
                    const currentIndex = allItems.indexOf(assetItem);

                    const start = Math.min(anchorIndex, currentIndex);
                    const end = Math.max(anchorIndex, currentIndex);

                    for (let i = start; i <= end; i++) {
                        if (allItems[i]) {
                            allItems[i].classList.add('selected');
                        }
                    }
                } else {
                    // If no anchor, just select the current item
                    assetItem.classList.add('selected');
                }
            }

            // Update the "last anchor selected" for shift-click, only if not shift-clicking
            if (!isShift) {
                document.querySelectorAll('.asset-item.last-anchor-selected').forEach(el => el.classList.remove('last-anchor-selected'));
                if (assetItem.classList.contains('selected')) {
                    assetItem.classList.add('last-anchor-selected');
                }
            }


            // --- Show Preview ---
            // Show preview if the clicked item is now selected
            if (assetItem.classList.contains('selected')) {
                this.showAssetPreview(assetId);
            } else {
                // If the item was deselected and it was the one being previewed, close/clear preview.
                if (this.currentAsset && this.currentAsset.id === assetId) {
                    const previewPanel = document.querySelector('.asset-preview-panel');
                    // Only hide if it's actually visible and belongs to the deselected asset
                    if (previewPanel.classList.contains('visible')) {
                        previewPanel.classList.remove('visible');
                        this.cleanupPreview();
                        this.currentAsset = null;
                    }
                }
            }
        } else {
            // Clicked inside assetsContentElement but NOT on an asset-item
            // Optional: Deselect all items if clicking on the background
            // document.querySelectorAll('.asset-item.selected').forEach(selected => {
            //     selected.classList.remove('selected');
            // });
            // Optional: Close preview panel if it's visible
            // const previewPanel = document.querySelector('.asset-preview-panel');
            // if (previewPanel.classList.contains('visible')) {
            //     previewPanel.classList.remove('visible');
            //     this.cleanupPreview();
            //     this.currentAsset = null;
            // }
        }
    });

    // --- 2. Listener for RIGHT CLICKS (Context Menu) on asset items ---
    assetsContentElement.addEventListener('contextmenu', (e) => {
        const assetItem = e.target.closest('.asset-item');
        if (assetItem) {
            e.preventDefault(); // Prevent default browser context menu
            const assetId = assetItem.dataset.assetId;
            if (!assetId) {
                console.warn("Asset item right-clicked but no asset-id found:", assetItem);
                return;
            }

            const contextMenu = document.querySelector('.asset-context-menu');

            // Position the context menu
            // Consider viewport boundaries to prevent menu from going off-screen
            const menuWidth = contextMenu.offsetWidth;
            const menuHeight = contextMenu.offsetHeight;
            let x = e.clientX;
            let y = e.clientY;

            if (x + menuWidth > window.innerWidth) {
                x -= menuWidth;
            }
            if (y + menuHeight > window.innerHeight) {
                y -= menuHeight;
            }
            // Ensure x and y are not negative
            x = Math.max(0, x);
            y = Math.max(0, y);


            contextMenu.style.left = `${x}px`;
            contextMenu.style.top = `${y}px`;
            contextMenu.dataset.assetId = assetId; // Store ID on the menu for action handlers

            // Update context menu items based on the state of the RIGHT-CLICKED asset
            const asset = this.findAssetById(assetId);
            if (asset) {
                const favMenuItem = contextMenu.querySelector('li[data-action="favorite"]');
                if (favMenuItem) {
                    favMenuItem.innerHTML = asset.favorite
                        ? '<i class="fas fa-star"></i> Unfavorite'
                        : '<i class="far fa-star"></i> Add to Favorites';
                }
                // You could update other menu items here if needed
            }

            contextMenu.classList.add('visible');
        } else {
            // If right-click is not on an asset item, ensure the custom menu is hidden
            const contextMenu = document.querySelector('.asset-context-menu');
            if (contextMenu) {
                contextMenu.classList.remove('visible');
            }
            // Allow default browser context menu if not on an item (or explicitly prevent if desired)
        }
    });

    // --- 3. Listener for DRAG START on asset items ---
    assetsContentElement.addEventListener('dragstart', (e) => {
        const assetItem = e.target.closest('.asset-item');
        if (assetItem && assetItem.draggable) { // Check if the item is actually draggable
            const assetId = assetItem.dataset.assetId;
            if (assetId) {
                e.dataTransfer.setData('text/plain', assetId);
                e.dataTransfer.effectAllowed = 'copy'; // Or 'move'
                // Optional: Add a class for drag image styling
                // assetItem.classList.add('dragging');
            }
        } else {
            // If the closest element isn't a draggable asset-item, prevent default drag
            e.preventDefault();
        }
    });
    // Optional: Listener for 'dragend' to remove styling class
    // assetsContentElement.addEventListener('dragend', (e) => {
    //     const assetItem = e.target.closest('.asset-item.dragging');
    //     if (assetItem) {
    //         assetItem.classList.remove('dragging');
    //     }
    // });


    // --- 4. Listener for Clicks on ACTION BUTTONS (Favorite/Delete) WITHIN asset items ---
    // This uses event delegation as well, attached to assetsContentElement
    assetsContentElement.addEventListener('click', (e) => {
        const favoriteButton = e.target.closest('.favorite-btn');
        const deleteButton = e.target.closest('.delete-btn');

        // Check if the click originated from one of these buttons
        if (favoriteButton || deleteButton) {
            const assetItem = e.target.closest('.asset-item');
            if (!assetItem) return;

            const assetId = assetItem.dataset.assetId;
            if (!assetId) return;

            e.stopPropagation(); // Important: Prevent the left-click listener on assetItem itself from firing
                                 // (which would handle selection and preview, possibly conflicting)

            if (favoriteButton) {
                this.toggleFavorite(assetId);
            } else if (deleteButton) {
                this.confirmRemoveAsset(assetId);
            }
        }
    });

} else {
    console.error("Assets content element ('.assets-content') not found. Event listeners for asset items cannot be attached.");
}

// --- Action handlers for context menu LIST ITEMS (attach ONCE) ---
// This should be outside the 'if (assetsContentElement)' block if the menu is global,
// but since its data comes from asset items, keeping it conceptually close is fine.
// Ensure these listeners are only added ONCE during the lifetime of the AssetsPanel.
const contextMenuItems = document.querySelectorAll('.asset-context-menu li');
if (contextMenuItems.length > 0) {
    contextMenuItems.forEach(item => {
        // Prevent adding listeners multiple times if setupEventListeners is called again
        if (!item.dataset.listenerAttached) {
            item.addEventListener('click', (e) => {
                const action = e.currentTarget.dataset.action;
                const contextMenu = document.querySelector('.asset-context-menu'); // Or e.currentTarget.closest('.asset-context-menu')
                const assetId = contextMenu.dataset.assetId;

                if (action && assetId) {
                    this.handleContextMenuAction(action, assetId);
                } else {
                    console.warn("Action or AssetID missing from context menu click. Action:", action, "AssetID:", assetId);
                }
                contextMenu.classList.remove('visible'); // Hide menu after action
            });
            item.dataset.listenerAttached = 'true';
        }
    });
} else {
    console.warn("Context menu list items ('.asset-context-menu li') not found.");
}


// --- Global click listener to HIDE MENUS (Context, Sort, Import Dropdown) ---
// This should also be attached only ONCE.
// Using a flag to ensure it's not added multiple times if setupEventListeners is called more than once.
if (!document.body.dataset.globalMenuHideListener) {
    document.addEventListener('click', (e) => {
        // Hide Asset Context Menu
        const assetContextMenu = document.querySelector('.asset-context-menu');
        if (assetContextMenu && assetContextMenu.classList.contains('visible')) {
            // Hide if click is outside the menu AND not on an asset item
            // (because clicking an asset item might be a left-click action,
            // and right-clicking an item will be handled by its own contextmenu listener to show it)
            if (!e.target.closest('.asset-context-menu') && !e.target.closest('.asset-item')) {
                assetContextMenu.classList.remove('visible');
            }
        }

        // Hide Sort Menu
        const sortMenu = document.querySelector('.sort-menu');
        if (sortMenu && sortMenu.classList.contains('visible')) {
            if (!e.target.closest('.sort-menu') && !e.target.closest('.sort-btn')) {
                sortMenu.classList.remove('visible');
            }
        }

        // Hide Import Dropdown
        const importDropdown = document.querySelector('.import-dropdown');
        if (importDropdown && importDropdown.classList.contains('visible')) {
            if (!e.target.closest('.import-dropdown') && !e.target.closest('.import-btn')) {
                importDropdown.classList.remove('visible');
            }
        }
    }, true); // Use capture phase to catch clicks early.
    document.body.dataset.globalMenuHideListener = 'true';
}
    // Context menu for assets
    const assetsContent = document.querySelector('.assets-content');
    if (assetsContent) {
        assetsContent.addEventListener('contextmenu', (e) => { // For DISPLAYING the menu
           const assetItem = e.target.closest('.asset-item');
            if (assetItem) {
               e.preventDefault();
               const assetId = assetItem.dataset.assetId;
               const contextMenu = document.querySelector('.asset-context-menu');
               contextMenu.style.left = `${e.clientX}px`;
               contextMenu.style.top = `${e.clientY}px`;
               contextMenu.dataset.assetId = assetId;
               const keepSelection = e.shiftKey; // Keep selection if shift is held
                if (!keepSelection) {
                    document.querySelectorAll('.asset-item.selected').forEach(selected => {
                    if (selected !== assetItem) {
                        selected.classList.remove('selected');
                    }
                });
                }
                assetItem.classList.toggle('selected');
                
                if (assetItem.classList.contains('selected')) {
                    this.showAssetPreview(assetId);
                } else {
                    // Optional: close preview if deselected
                    // if (this.currentAsset && this.currentAsset.id === assetId) {
                    //     document.querySelector('.asset-preview-panel').classList.remove('visible');
                    //     this.cleanupPreview();
                    // }
                }
   
               const asset = this.findAssetById(assetId);
               if (asset) {
                   const favMenuItem = contextMenu.querySelector('li[data-action="favorite"]');
                    if (favMenuItem) {
                        favMenuItem.innerHTML = asset.favorite
                            ? '<i class="fas fa-star"></i> Unfavorite'
                            : '<i class="far fa-star"></i> Add to Favorites';
                    }
               }
               contextMenu.classList.add('visible');
           } else {
                document.querySelector('.asset-context-menu').classList.remove('visible');
           }
       });
   } else {
       console.error("Assets content area not found for context menu listener.");
   }
   
 
     // Handle context menu actions
     document.querySelectorAll('.asset-context-menu li').forEach(item => {
        // Check if a listener is already attached to prevent duplicates if setupEventListeners were called multiple times
        // A simple way is a flag, or ensure setupEventListeners is truly once.
        if (!item.dataset.listenerAttached) { // Simple flag
            item.addEventListener('click', (e) => {
                const action = e.currentTarget.dataset.action;
                const contextMenu = document.querySelector('.asset-context-menu');
                const assetId = contextMenu.dataset.assetId;
                if (action && assetId) {
                     this.handleContextMenuAction(action, assetId);
                }
                contextMenu.classList.remove('visible');
            });
            item.dataset.listenerAttached = 'true';
        }
    });
 
     // Close context menu when clicking elsewhere
     document.addEventListener('click', (e) => {
        const contextMenu = document.querySelector('.asset-context-menu');
        if (contextMenu && !e.target.closest('.asset-context-menu') && !e.target.closest('.asset-item')) { // also don't hide if clicking an asset item that might open it
            contextMenu.classList.remove('visible');
        }
        const sortMenu = document.querySelector('.sort-menu');
        if (sortMenu && !e.target.closest('.sort-menu') && !e.target.closest('.sort-btn')) {
            sortMenu.classList.remove('visible');
        }
        const importDropdown = document.querySelector('.import-dropdown');
        if (importDropdown && !e.target.closest('.import-dropdown') && !e.target.closest('.import-btn')) {
            importDropdown.classList.remove('visible');
        }
    }, true); // Use capture phase for dropdowns if needed
 
 
      // Add favorites saving logic
      this.saveFavorites = () => {
          localStorage.setItem('assetFavorites', JSON.stringify(this.favorites));
      };

    // Make assets draggable to scene
    document.addEventListener('dragstart', (e) => {
        if (e.target.classList.contains('asset-item')) {
            e.dataTransfer.setData('text/plain', e.target.dataset.assetId);
        }
    });

  

    // Handle dropping assets into scene
    document.addEventListener('drop', (e) => {
        if (!e.target.closest('.assets-panel')) {
            e.preventDefault();
            const assetId = e.dataTransfer.getData('text/plain');
            if (assetId) {
                this.addAssetToScene(assetId);
            }
        }
        });
        
        // Context menu for assets
        document.addEventListener('contextmenu', (e) => {
            if (e.target.closest('.asset-item')) {
                e.preventDefault();
                const assetItem = e.target.closest('.asset-item');
                const assetId = assetItem.dataset.assetId;
                const rect = assetItem.getBoundingClientRect();
                
                const contextMenu = document.querySelector('.asset-context-menu');
                contextMenu.style.left = `${e.clientX}px`;
                contextMenu.style.top = `${e.clientY}px`;
                contextMenu.dataset.assetId = assetId;
                contextMenu.classList.add('visible');
            }
        });
        
        
        // Handle context menu actions
        document.querySelectorAll('.asset-context-menu li').forEach(item => {
        item.addEventListener('click', (e) => {
            const action = e.target.closest('li').dataset.action;
            const assetId = document.querySelector('.asset-context-menu').dataset.assetId;
            
            this.handleContextMenuAction(action, assetId);
            document.querySelector('.asset-context-menu').classList.remove('visible');
        });
        });
        
        // Close context menu when clicking elsewhere
        document.addEventListener('click', () => {
        document.querySelector('.asset-context-menu').classList.remove('visible');
        document.querySelector('.sort-menu').classList.remove('visible');
        document.querySelector('.import-dropdown').classList.remove('visible');
    });



    // Animation controls
    const animationSelect = document.querySelector('.animation-select');
    const playBtn = document.querySelector('.play-btn');
    const pauseBtn = document.querySelector('.pause-btn');
    const stopBtn = document.querySelector('.stop-btn');
    const timelineSlider = document.querySelector('.timeline-slider');

    animationSelect.addEventListener('change', () => {
        this.selectAnimation(animationSelect.value);
    });
        
    playBtn.addEventListener('click', () => {
        this.playAnimation();
    });
        
    pauseBtn.addEventListener('click', () => {
        this.pauseAnimation();
    });
        
    stopBtn.addEventListener('click', () => {
        this.stopAnimation();
    });
        
    timelineSlider.addEventListener('input', (e) => {
        // Pause animation while scrubbing for better control
        if (this.activeAction && !this.activeAction.paused) {
            this.activeAction.paused = true;
            timelineSlider.dataset.wasPlaying = 'true'; // Mark that it was playing
        }
        this.scrubAnimation(parseFloat(e.target.value) / 100);
    });

      // Use 'change' for when scrubbing finishes (mouse up)
      timelineSlider.addEventListener('change', (e) => {
        // Resume playback if it was playing before scrubbing started
        if (timelineSlider.dataset.wasPlaying === 'true') {
            if (this.activeAction) {
                this.activeAction.paused = false;
                // Ensure it plays from the scrubbed position if needed
                // this.activeAction.play(); // Might not be needed if mixer time was set
            }
            delete timelineSlider.dataset.wasPlaying; // Clear the flag
        }
        // Final scrub set - redundant if 'input' worked correctly
        // this.scrubAnimation(parseFloat(e.target.value) / 100);
    });
}

initDragAndDrop() {
    const dropZone = document.querySelector('.drop-zone');
    const assetsPanel = document.querySelector('.assets-panel');
    
    // Show drop zone when dragging files over the window
    window.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.add('active');
    });
    
    // Handle drag leave
    window.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        // Check if the mouse is outside the window
        const { clientX, clientY } = e;
        if (clientX <= 0 || clientY <= 0 || 
            clientX >= window.innerWidth || clientY >= window.innerHeight) {
            dropZone.classList.remove('active');
        }
    });
    
    // Handle drop
    window.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.remove('active');
        
        // Check if we're dropping onto the assets panel
        if (e.target.closest('.assets-panel')) {
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                this.importFiles(files);
            }
        }
    });
    
    // Make asset items draggable to the scene
    assetsPanel.addEventListener('dragstart', (e) => {
        if (e.target.classList.contains('asset-item')) {
            const assetId = e.target.dataset.assetId;
            e.dataTransfer.setData('text/plain', assetId);
            e.dataTransfer.effectAllowed = 'copy';
        }
    });
}


handleFiles(files) {
    const acceptedFiles = Array.from(files).filter(file => {
        const extension = '.' + file.name.split('.').pop().toLowerCase();
        return [
            ...this.supportedModelFormats,
            ...this.supportedHDRIFormats,
            ...this.supportedTextureFormats,
            ...this.supportedMaterialFormats
        ].includes(extension);
    });

    if (acceptedFiles.length === 0) {
        alert('No supported files found. Supported formats: ' + [
            ...this.supportedModelFormats,
            ...this.supportedHDRIFormats,
            ...this.supportedTextureFormats,
            ...this.supportedMaterialFormats
        ].join(', '));
        return;
    }

    const loadingIndicator = document.createElement('div');
    loadingIndicator.className = 'loading-indicator';
    loadingIndicator.innerHTML = `<div class="spinner"></div><p>Loading files...</p>`;
    document.body.appendChild(loadingIndicator);

    const promises = acceptedFiles.map(file => {
        const extension = file.name.split('.').pop().toLowerCase();
        if (this.supportedModelFormats.includes('.' + extension)) return this.loadModel(file);
        else if (this.supportedHDRIFormats.includes('.' + extension)) return this.loadHDRI(file, true); // Auto-add to scene
        else if (this.supportedTextureFormats.includes('.' + extension)) return this.loadTexture(file);
        else if (this.supportedMaterialFormats.includes('.' + extension)) return this.loadMaterial(file);
    });

    Promise.all(promises.filter(p => p))
        .then(results => {
            results.forEach((result, index) => {
                const file = acceptedFiles[index];
                if (result) {
                    this.addToRecent({ name: file.name, id: this.generateAssetId() });
                }
            });
            this.updateAssetsView();
        })
        .catch(error => {
            console.error('Error processing files:', error);
            alert('An error occurred while processing files. Check console for details.');
        })
        .finally(() => {
            document.body.removeChild(loadingIndicator);
        });
}

// Implement the context menu handler
handleContextMenuAction(action, assetId) {
    console.log(`Context action '${action}' on asset '${assetId}'`); // Debug log
    const asset = this.findAssetById(assetId); // Helper function to find asset
    if (!asset) {
        console.error(`Asset not found for action: ${assetId}`);
        this.showErrorNotification(`Asset with ID ${assetId} not found.`);
        return;
    }

    switch (action) {
        case 'preview':
            this.showAssetPreview(assetId);
            break;
        case 'add-to-scene':
            this.addAssetToScene(assetId); // Use the existing method
            break;
        case 'favorite':
            this.toggleFavorite(assetId);
            break;
        case 'rename':
            this.renameAsset(assetId);
            break;
        case 'duplicate':
            this.duplicateAsset(assetId);
            break;
        case 'delete':
            this.confirmRemoveAsset(assetId); // Add confirmation step
            break;
        default:
            console.warn(`Unhandled context menu action: ${action}`);
    }
}

// Helper to find an asset by ID across all types
findAssetById(assetId) {
    return [
       ...this.assets.models,
       ...this.assets.textures,
       ...this.assets.materials,
       ...this.assets.hdris,
       // Search recent/favorites if necessary, though they should point to main assets
   ].find(a => a && a.id === assetId); // Add check for 'a' being defined
}

// Implement or refine specific actions
toggleFavorite(assetId) {
    const asset = this.findAssetById(assetId);
    if (asset) {
        asset.favorite = !asset.favorite;
        console.log(`Asset ${asset.name} favorite status: ${asset.favorite}`);

        // Update favorite icon in the UI immediately
        const assetItemElement = document.querySelector(`.asset-item[data-asset-id="${assetId}"]`);
        if (assetItemElement) {
            assetItemElement.classList.toggle('favorite', asset.favorite);
            const favIcon = assetItemElement.querySelector('.favorite-btn i');
            if (favIcon) {
                favIcon.classList.toggle('fa-star', asset.favorite); // Solid star
                favIcon.classList.toggle('fa-star-o', !asset.favorite); // Outline star
            }
        }
         // Update context menu text based on new state (optional)


        this.updateAssetsView(); // Redraw view if needed (e.g., if in Favorites tab)
        this.saveAssets(); // Persist changes
        this.saveFavorites(); // Save favorites separately if needed
    }
}

renameAsset(assetId) {
    const asset = this.findAssetById(assetId);
    if (asset) {
        const newName = prompt(`Enter new name for "${asset.name}":`, asset.name);
        if (newName && newName.trim() !== '' && newName !== asset.name) {
            asset.name = newName.trim();
            console.log(`Asset renamed to: ${asset.name}`);
            this.updateAssetsView(); // Update UI
            this.saveAssets(); // Persist changes

            // Update preview title if this asset is being previewed
            if (this.currentAsset && this.currentAsset.id === assetId) {
                document.querySelector('.preview-title').textContent = `Asset Preview: ${asset.type}`;
                document.querySelector('.model-name').textContent = asset.name;
            }
        }
    }
}

duplicateAsset(assetId) {
    const originalAsset = this.findAssetById(assetId);
    if (originalAsset) {
        // Note: Duplicating assets with complex THREE objects (models, textures)
        // requires careful cloning to avoid shared references.
        // structuredClone might work for metadata, but not THREE objects.
        console.warn(`Duplicating asset '${originalAsset.name}'. Full object duplication might be complex.`);

        // Simple metadata duplication (adjust as needed for actual object cloning)
        const newAsset = {
            ...originalAsset, // Spread existing properties
            id: this.generateAssetId(), // Generate a NEW ID
            name: `${originalAsset.name} Copy`, // Append "Copy"
            dateAdded: new Date(), // Set new date
            favorite: false, // Duplicates aren't favorites by default
            // *** CRITICAL: Handle actual object/texture/material duplication ***
            // object: originalAsset.object ? this.cloneThreeObject(originalAsset.object) : null,
            // texture: originalAsset.texture ? originalAsset.texture.clone() : null, // THREE.Texture has clone()
            // material: originalAsset.material ? originalAsset.material.clone() : null, // THREE materials often have clone()
            // thumbnail: this.createThumbnail(...) // Re-generate thumbnail for the clone
        };

        // Placeholder: For now, just showing the concept
        if (originalAsset.type === 'model' && originalAsset.object) {
             // Proper cloning is hard. For now, maybe just reference? (Not ideal)
             // newAsset.object = originalAsset.object; // Creates shared reference - AVOID for modification
             console.error("Model duplication requires deep cloning - not fully implemented.");
             this.showErrorNotification("Model duplication not fully implemented yet.");
             return; // Abort duplication for models for now
        }
         if (originalAsset.type === 'texture' && originalAsset.texture) {
             newAsset.texture = originalAsset.texture.clone();
             newAsset.thumbnail = this.createTextureThumbnail(newAsset.texture);
         }
         if (originalAsset.type === 'material' && originalAsset.material) {
             newAsset.material = originalAsset.material.clone();
              newAsset.thumbnail = this.createMaterialThumbnail(newAsset.material);
         }
         if (originalAsset.type === 'hdri' && originalAsset.texture) {
             newAsset.texture = originalAsset.texture.clone();
             newAsset.thumbnail = this.createHDRIThumbnail(newAsset.texture);
         }


        // Add the new asset to the correct array
        const assetArray = this.assets[originalAsset.type + 's'];
        if (assetArray) {
            assetArray.push(newAsset);
            this.cacheAsset(newAsset); // Cache the new asset
            this.updateAssetsView();
            this.saveAssets();
            this.showInfoNotification(`Asset "${originalAsset.name}" duplicated.`); // Use an info notification
        } else {
            console.error(`Invalid asset type for duplication: ${originalAsset.type}`);
        }
    }
}


confirmRemoveAsset(assetId) {
    const asset = this.findAssetById(assetId);
    if (asset) {
        if (confirm(`Are you sure you want to delete "${asset.name}"? This cannot be undone.`)) {
            this.removeAsset(assetId);
        }
    }
}

// Refine removeAsset
removeAsset(assetId) {
    let assetRemoved = false;
    let assetName = 'Unknown Asset';

    Object.keys(this.assets).forEach(key => {
        // Ensure the key corresponds to an array (like 'models', 'textures', etc.)
        if (Array.isArray(this.assets[key])) {
            const assetArray = this.assets[key];
            const index = assetArray.findIndex(a => a && a.id === assetId); // Check 'a' exists
            if (index > -1) {
                const asset = assetArray[index];
                assetName = asset.name; // Store name for notification
                console.log(`Removing asset ${asset.type}: ${asset.name} (ID: ${assetId})`);

                // Dispose THREE resources associated with the asset
                this.disposeAsset(asset);

                // Remove from the specific asset array
                assetArray.splice(index, 1);

                 // Remove from recent list if present
                 const recentIndex = this.assets.recent.findIndex(r => r && r.id === assetId);
                 if (recentIndex > -1) {
                     this.assets.recent.splice(recentIndex, 1);
                 }

                // Remove from cache
                this.assetCache?.delete(assetId);

                // Remove from favorites (localStorage)
                 const favIndex = this.favorites.indexOf(assetId);
                 if (favIndex > -1) {
                     this.favorites.splice(favIndex, 1);
                     this.saveFavorites();
                 }


                assetRemoved = true;
                // Don't break, asset ID *should* be unique, but check all lists just in case
            }
        }
    });

    if (assetRemoved) {
        this.updateAssetsView(); // Update the UI
        this.saveAssets(); // Persist changes to main asset lists
        this.showInfoNotification(`Asset "${assetName}" deleted.`);

        // If the deleted asset was being previewed, close the preview
        if (this.currentAsset && this.currentAsset.id === assetId) {
            document.querySelector('.asset-preview-panel').classList.remove('visible');
            this.cleanupPreview();
            this.currentAsset = null;
        }
    } else {
        console.warn(`Asset with ID ${assetId} not found for deletion.`);
        this.showErrorNotification(`Could not find asset with ID ${assetId} to delete.`);
    }
}

// Implement disposeAsset more thoroughly
disposeAsset(asset) {
    console.log(`Disposing resources for asset: ${asset.name}`);
    try {
        if (asset.object && typeof asset.object.traverse === 'function') { // Models
            asset.object.traverse((child) => {
                if (child.geometry) {
                    child.geometry.dispose();
                    // console.log(`Disposed geometry for ${child.name || 'child'}`);
                }
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(mat => {
                            this.disposeMaterialTextures(mat);
                            mat.dispose();
                        });
                    } else {
                        this.disposeMaterialTextures(child.material);
                        child.material.dispose();
                    }
                   // console.log(`Disposed material for ${child.name || 'child'}`);
                }
            });
             // If using SkeletonHelper, ensure it's removed/disposed if attached
        } else if (asset.texture && typeof asset.texture.dispose === 'function') { // Textures, HDRIs
            asset.texture.dispose();
             console.log(`Disposed texture: ${asset.name}`);
        } else if (asset.material && typeof asset.material.dispose === 'function') { // Materials
             this.disposeMaterialTextures(asset.material);
             asset.material.dispose();
              console.log(`Disposed material: ${asset.name}`);
        } else if (asset.materials && typeof asset.materials === 'object') { // MTL file materials?
             Object.values(asset.materials).forEach(mat => {
                 if (mat && typeof mat.dispose === 'function') {
                    this.disposeMaterialTextures(mat);
                    mat.dispose();
                }
             });
             console.log(`Disposed material group: ${asset.name}`);
        }

        // Dispose thumbnail canvas/renderer if stored directly (unlikely)
        // Clear references
        asset.object = null;
        asset.texture = null;
        asset.material = null;
        asset.materials = null;
        asset.thumbnail = null; // Remove thumbnail data URL

    } catch (error) {
        console.error(`Error disposing asset ${asset.name}:`, error);
    }
}

// Helper to dispose textures within a material
disposeMaterialTextures(material) {
    if (!material) return;
    for (const key in material) {
        const value = material[key];
        if (value instanceof THREE.Texture && typeof value.dispose === 'function') {
             // console.log(`Disposing texture '${key}' in material`);
             value.dispose();
        }
    }
}

// Add notification functions (implement with your preferred UI library or simple divs)
showErrorNotification(message) {
    console.error("ASSET PANEL ERROR:", message);
    // Example implementation:
    const notification = document.createElement('div');
    notification.className = 'asset-notification error';
    notification.textContent = `Error: ${message}`;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 5000); // Auto-remove after 5s
     // Add CSS for .asset-notification.error
}

showInfoNotification(message) {
    console.log("ASSET PANEL INFO:", message);
    // Example implementation:
    const notification = document.createElement('div');
    notification.className = 'asset-notification info';
    notification.textContent = message;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000); // Auto-remove after 3s
     // Add CSS for .asset-notification.info
}

updatePreviewSettings() {
    // Check if preview components are actually initialized
    if (!this.previewScene || !this.previewRenderer || !this.previewCamera) {
        console.warn("Attempted to update preview settings, but preview is not initialized.");
        return;
    }
    console.log("Applying preview settings:", this.previewSettings); // Debug log

    // Update background color
    // For textures/HDRIs, the scene background might be the asset itself. Handle this.
    if (this.currentAsset?.type === 'hdri' && this.previewScene.background instanceof THREE.Texture) {
        // Don't override HDRI background with solid color
    } else if (this.currentAsset?.type === 'texture' && this.previewScene.background instanceof THREE.Texture) {
        // Don't override checkerboard background with solid color
        // (Unless you want an option to toggle checkerboard off)
    }
     else {
        const bgColor = new THREE.Color(this.previewSettings.backgroundColor);
        this.previewScene.background = bgColor;
        this.previewRenderer.setClearColor(bgColor, 1);
    }


    // Update auto-rotate
    if (this.previewControls) {
        this.previewControls.autoRotate = this.previewSettings.autoRotate;
        // If turning auto-rotate on, might need to call controls.update() once if it stopped
        if (this.previewSettings.autoRotate) {
             // this.previewControls.update(); // Usually handled by the animation loop
        }
    }

    // Handle grid visibility - Create if needed, toggle visibility
    if (this.previewSettings.showGrid) {
        if (!this.previewGrid) {
            // Create grid only if it doesn't exist
            console.log("Creating preview grid");
            this.previewGrid = new THREE.GridHelper(10, 10, 0x555555, 0x333333); // Adjusted size/colors
            this.previewGrid.position.y = -0.5; // Adjust based on model pivot
             // Determine grid position based on model bounding box if available
            if (this.previewModel) {
                const box = new THREE.Box3().setFromObject(this.previewModel);
                const center = box.getCenter(new THREE.Vector3());
                const size = box.getSize(new THREE.Vector3());
                 this.previewGrid.position.y = box.min.y; // Place grid at bottom
            } else {
                 this.previewGrid.position.y = -0.5; // Default position
            }

            this.previewScene.add(this.previewGrid);
        }
        this.previewGrid.visible = true; // Ensure visible
    } else {
        if (this.previewGrid) {
            console.log("Hiding preview grid");
            this.previewGrid.visible = false; // Just hide if it exists
        }
    }

    // Handle wireframe for models (ensure previewModel exists)
    // Remove existing wireframe helper unconditionally before potentially creating a new one
    if (this.previewWireframe) {
        console.log("Removing existing wireframe helper");
        this.previewScene.remove(this.previewWireframe);
         // Properly dispose geometry/material of the wireframe helper if needed
        this.previewWireframe.traverse(child => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
        });
        this.previewWireframe = null;
    }
    if (this.previewSettings.showWireframe && this.previewModel && this.currentAsset?.type === 'model') {
        console.log("Creating wireframe helper");
        this.previewWireframe = new THREE.Group();
        this.previewModel.traverse(child => {
            if (child.isMesh && child.geometry) { // Check geometry exists
                try { // Add try-catch for robustness
                    const wireframeGeo = new THREE.WireframeGeometry(child.geometry);
                    const wireframeMat = new THREE.LineBasicMaterial({
                         color: 0x00ff00, // Wireframe color
                         linewidth: 1, // Note: linewidth > 1 requires WebGL2 or extensions
                         transparent: true,
                         opacity: 0.5
                        });
                    const line = new THREE.LineSegments(wireframeGeo, wireframeMat);
                    // Match transform of the original mesh part
                    line.position.copy(child.position);
                    line.rotation.copy(child.rotation);
                    line.scale.copy(child.scale);
                    this.previewWireframe.add(line);
                } catch (e) {
                    console.error("Error creating wireframe for mesh:", child.name, e);
                }
            }
        });
        this.previewScene.add(this.previewWireframe);
    }

    // Handle bones for models (ensure previewModel exists and is skinned)
    // Remove existing skeleton helper unconditionally
     if (this.previewSkeleton) {
        console.log("Removing existing skeleton helper");
        this.previewScene.remove(this.previewSkeleton);
        // SkeletonHelper doesn't need explicit geometry/material disposal typically
        this.previewSkeleton = null;
    }
    if (this.previewSettings.showBones && this.previewModel && this.currentAsset?.type === 'model') {
        console.log("Attempting to create skeleton helper");
        let skeletonFound = false;
        this.previewModel.traverse(child => {
            // Find the root object for the skeleton helper (often the scene or skinned mesh parent)
             if (child.isSkinnedMesh && !skeletonFound) {
                 console.log("Found skinned mesh, creating SkeletonHelper for:", child.name);
                 this.previewSkeleton = new THREE.SkeletonHelper(child); // Pass the skinned mesh itself
                 this.previewSkeleton.material.linewidth = 2; // Adjust line width
                 this.previewScene.add(this.previewSkeleton);
                 skeletonFound = true; // Create only one helper for the model
             }
             // Alternative: Find the highest parent with a skeleton
             /* if (child.skeleton && !skeletonFound) {
                 console.log("Found object with skeleton, creating SkeletonHelper for:", child.name);
                 this.previewSkeleton = new THREE.SkeletonHelper(child); // Pass the object with the skeleton
                 this.previewSkeleton.material.linewidth = 2;
                 this.previewScene.add(this.previewSkeleton);
                 skeletonFound = true;
             } */
        });
        if (!skeletonFound) {
            console.log("No suitable skinned mesh or skeleton found for SkeletonHelper.");
        }
    }

    // *** Force a render immediately after applying settings ***
    // This might be redundant if the animation loop is running smoothly,
    // but can help ensure changes are visible instantly.
    // if (this.previewRenderer && this.previewScene && this.previewCamera) {
    //     this.previewRenderer.render(this.previewScene, this.previewCamera);
    // }
}

cleanupPreview() {
    console.log("Cleaning up previous preview..."); // Debug log
    if (this.previewAnimationId) {
        cancelAnimationFrame(this.previewAnimationId);
        this.previewAnimationId = null;
    }

    // Remove resize listener specific to the preview
    window.removeEventListener('resize', this.resizePreviewCanvas); // Ensure the correct bound function is removed if used previously

    if (this.previewMixer) {
        // Properly stop and uncache actions/objects
        this.previewMixer.stopAllAction();
        if(this.previewModel && this.previewModel.animations) {
             this.previewModel.animations.forEach(clip => {
                this.previewMixer.uncacheClip(clip);
            });
        }
        if(this.previewModel) {
             this.previewMixer.uncacheRoot(this.previewModel);
        }
        this.previewMixer = null;
    }
    if (this.previewControls) {
        this.previewControls.dispose();
        this.previewControls = null;
    }

     // Dispose scene contents thoroughly
    if (this.previewScene) {
        this.disposeScene(this.previewScene); // Use your existing disposeScene method
        this.previewScene = null;
    }

    // Dispose renderer AFTER scene objects
    if (this.previewRenderer) {
        this.previewRenderer.dispose();
        this.previewRenderer = null;
    }


    this.previewCamera = null; // Just nullify camera reference

    // Nullify helpers (disposeScene should handle their geometry/material)
    this.previewGrid = null;
    this.previewWireframe = null;
    this.previewSkeleton = null;
    this.previewModel = null; // Nullify model reference

    this.activeAction = null;
    // Keep this.currentAsset until the next one is selected

    // Clear the canvas context if possible (might help prevent lingering visuals)
    const canvas = document.getElementById('preview-canvas');
    if (canvas) {
        const context = canvas.getContext('webgl2') || canvas.getContext('webgl');
        if (context) {
             // Optional: Force context loss if issues persist (drastic)
             // const ext = context.getExtension('WEBGL_lose_context');
             // if (ext) ext.loseContext();
             context.clearColor(0, 0, 0, 0);
             context.clear(context.COLOR_BUFFER_BIT | context.DEPTH_BUFFER_BIT);
        } else {
            const ctx2d = canvas.getContext('2d');
            if (ctx2d) {
                ctx2d.clearRect(0, 0, canvas.width, canvas.height);
            }
        }
    }
    // Hide the preview container display? Or let the next setup handle it.
    // document.querySelector('.preview-container').style.display = 'none';
}


// In your AssetsPanel class
loadModel(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async (event) => {
            const buffer = event.target.result;
            const url = URL.createObjectURL(new Blob([buffer]));
            const extension = file.name.split('.').pop().toLowerCase();

            try {
                let object;
                const progressCallback = (xhr) => {
                    const percent = Math.round((xhr.loaded / xhr.total) * 100);
                    console.log(`Loading ${file.name}: ${percent}%`);
                };
                const errorCallback = (error) => {
                    console.error(`Error loading model ${file.name}:`, error);
                    this.showErrorNotification(`Failed to load ${file.name}`);
                    reject(error);
                };

                switch (extension) {
                    case 'fbx':
                        object = await new Promise((resolveLoader) => {
                            this.fbxLoader.load(url, (obj) => { obj.scale.set(0.01, 0.01, 0.01), resolveLoader(obj);
                            }, progressCallback, errorCallback);
                        });    
                        break;
                    case 'obj':
                        object = await new Promise((resolveLoader) => {
                            this.objLoader.load(url, (obj) => resolveLoader(obj), progressCallback, errorCallback);
                        });
                        break;
                    case 'glb':
                    case 'gltf':
                        object = await new Promise((resolveLoader) => {
                            this.gltfLoader.load(url, (gltf) => resolveLoader(gltf.scene || gltf), progressCallback, errorCallback);
                        });
                        break;
                    default:
                        throw new Error(`Unsupported file format: ${extension}`);
                }

                const previewObject = object.clone();
                this.createModelPreview(previewObject, file.name);
                this.processModel(object, file.name, object.animations || []);
                resolve(object);
            } catch (error) {
                console.error('Error processing model:', error);
                this.showErrorNotification(`Failed to load model: ${error.message}`);
                reject(error);
            } finally {
                URL.revokeObjectURL(url);
            }
        };
        reader.onerror = (error) => {
            console.error('Error reading file:', error);
            this.showErrorNotification('Failed to read file');
            reject(error);
        };
        reader.readAsArrayBuffer(file);
    });
}

compressAsset(asset) {
    if (asset.type === 'model') {
    // Compress geometry
    asset.object.traverse((child) => {
        if (child.geometry) {
            child.geometry.mergeVertices();
            child.geometry.computeVertexNormals();
            child.geometry.computeBoundingSphere();
        }
    });
    } else if (asset.type === 'texture') {
    // Compress texture
    asset.texture.encoding = THREE.sRGBEncoding;
    asset.texture.generateMipmaps = true;
    asset.texture.minFilter = THREE.LinearMipmapLinearFilter;
    }
    return asset;
}
    
searchAssets(query) {
    const searchTerm = query.toLowerCase();
    
    const filterAssets = (assets) => {
    return assets.filter(asset => 
        asset.name.toLowerCase().includes(searchTerm) ||
        asset.type.toLowerCase().includes(searchTerm)
    );
    };
    
    return {
    models: filterAssets(this.assets.models),
    textures: filterAssets(this.assets.textures),
    materials: filterAssets(this.assets.materials),
    hdris: filterAssets(this.assets.hdris)
    };
}

addAssetTags(asset, tags) {
    if (!asset.tags) asset.tags = [];
    asset.tags.push(...tags);
    this.updateAssetsView();
    this.saveAssets();
}

filterByTag(tag) {
    return {
        models: this.assets.models.filter(asset => asset.tags?.includes(tag)),
        textures: this.assets.textures.filter(asset => asset.tags?.includes(tag)),
        materials: this.assets.materials.filter(asset => asset.tags?.includes(tag)),
        hdris: this.assets.hdris.filter(asset => asset.tags?.includes(tag))
    };
}


addAssetVersion(asset) {
    if (!this.assetVersions) this.assetVersions = new Map();
    if (!this.assetVersions.has(asset.id)) {
       this.assetVersions.set(asset.id, []);
    }
    this.assetVersions.get(asset.id).push(new AssetVersion(asset));
}

revertToVersion(assetId, version) {
    const versions = this.assetVersions.get(assetId);
    const targetVersion = versions.find(v => v.version === version);
    if (targetVersion) {
        // Revert asset to version
        this.updateAsset(assetId, targetVersion.data);
    }
}



// Add asset caching to avoid reloading
cacheAsset(asset) {
    if (!this.assetCache) this.assetCache = new Map();
    this.assetCache.set(asset.id, asset);
}

getFromCache(id) {
   return this.assetCache?.get(id);
}

showLoading(assetName) {
   const loadingEl = document.createElement('div');
   loadingEl.className = 'loading-overlay';
   loadingEl.innerHTML = `Loading ${assetName}...`;
   document.body.appendChild(loadingEl);
   return loadingEl;
}

hideLoading(loadingEl) {
    if (loadingEl && loadingEl.parentNode) {
      loadingEl.parentNode.removeChild(loadingEl); 
    }
}

validateAsset(file) {
    if (!file) return false;

    const extension = file.name.split('.').pop().toLowerCase();
    const validExtensions = [
        ...this.supportedModelFormats,
        ...this.supportedHDRIFormats,
        ...this.supportedTextureFormats,
        ...this.supportedMaterialFormats
    ];

    if (!validExtensions.includes('.' + extension)) {
       throw new Error(`Unsupported file format: ${extension}`);
    }

    if (file.size > 100 * 1024 * 1024) { // 100MB limit
       throw new Error('File too large');
    }

    return true;
}


cleanupUnusedAssets() {
    // Remove assets not used in scene
    const usedAssets = new Set();
    scene.traverse((object) => {
    if (object.userData.assetId) {
        usedAssets.add(object.userData.assetId);
    }
    });
    
    this.assets.models = this.assets.models.filter(asset => 
    usedAssets.has(asset.id) || asset.favorite
    );
    // Similar filtering for other asset types
    
    this.updateAssetsView();
    this.saveAssets();
}

// createModelPreview function
createModelPreview(object, name) {
    const previewPanel = document.querySelector('.asset-preview-panel');
    const canvas = document.getElementById('preview-canvas');
    const previewContainer = document.querySelector('.preview-container');

    // Make preview container visible
    previewContainer.style.display = 'block';

    // Set canvas dimensions
    const containerWidth = previewContainer.clientWidth;
    const containerHeight = previewContainer.clientHeight;
    canvas.width = containerWidth;
    canvas.height = containerHeight;

    // Initialize renderer
    const previewRenderer = new THREE.WebGLRenderer({
       canvas: canvas,
       antialias: true,
       alpha: true
    });

    previewRenderer.setSize(containerWidth, containerHeight);
    previewRenderer.setPixelRatio(window.devicePixelRatio);
    previewRenderer.setClearColor(this.previewSettings.backgroundColor, 1);
    previewRenderer.shadowMap.enabled = true;
    previewRenderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Setup scene
    const previewScene = new THREE.Scene();
    const previewCamera = new THREE.PerspectiveCamera(
        45,
        containerWidth / containerHeight,
        0.1,
        1000
    );

    // Add OrbitControls
    const controls = new THREE.OrbitControls(previewCamera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.screenSpacePanning = true;
    controls.minDistance = 1;
    controls.maxDistance = 50;
    controls.enablePan = true;
    controls.enableZoom = true;
    controls.rotateSpeed = 0.8;
    controls.zoomSpeed = 1.2;
    controls.panSpeed = 0.8;
    controls.autoRotate = this.previewSettings.autoRotate;
    controls.autoRotateSpeed = 2.0;

    // Lighting setup
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    previewScene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 5, 5);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 1024;
    directionalLight.shadow.mapSize.height = 1024;
    previewScene.add(directionalLight);

    const secondaryLight = new THREE.DirectionalLight(0xffffff, 0.4);
    secondaryLight.position.set(-5, 2, -5);
    previewScene.add(secondaryLight);

    // Add grid helper
    const gridHelper = new THREE.GridHelper(20, 20, 0x333333, 0x222222);
    gridHelper.position.y = -0.01;
    gridHelper.visible = this.previewSettings.showGrid;
    previewScene.add(gridHelper);

    // Center and scale the object
    const box = new THREE.Box3().setFromObject(object);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);

    object.position.sub(center);

    // Position camera based on object size
    const fov = previewCamera.fov * (Math.PI / 180);
    let cameraZ = Math.abs(maxDim / Math.tan(fov / 2)) * 2;

    previewCamera.position.set(cameraZ * 0.5, cameraZ * 0.5, cameraZ);
    controls.target.set(0, 0, 0);

    // Add object to preview scene
    previewScene.add(object);

    // Update model info
    this.updateModelInfo(object, name);

    // Setup wireframe if needed
    let wireframeHelper;
    if (this.previewSettings.showWireframe) {
        wireframeHelper = new THREE.Group();
        object.traverse(child => {
            if (child.isMesh) {
                const wireframe = new THREE.WireframeGeometry(child.geometry);
                const line = new THREE.LineSegments(wireframe);
                line.material.color.set(0x00ff00);
                line.material.opacity = 0.25;
                line.material.transparent = true;
                line.position.copy(child.position);
                line.rotation.copy(child.rotation);
                line.scale.copy(child.scale);
                wireframeHelper.add(line);
            }
       });
       previewScene.add(wireframeHelper);
    }

    // Setup bone visualization if needed
    let skeletonHelper;
    if (this.previewSettings.showBones) {
        object.traverse(child => {
            if (child.isSkinnedMesh && child.skeleton) {
                skeletonHelper = new THREE.SkeletonHelper(child.skeleton.bones[0].parent);
                skeletonHelper.visible = true;
                previewScene.add(skeletonHelper);
            }
        });
    }

    // Setup animation if available
    let mixer;
    let actions = [];
    let currentAction;
    let animationList = [];

    if (object.animations && object.animations.length > 0) {
        mixer = new THREE.AnimationMixer(object);

        // Get all animation clips
        animationList = object.animations.map(clip => ({
            name: clip.name || `Animation ${animationList.length + 1}`,
            duration: clip.duration,
            clip: clip
        }));

        // Update animation select dropdown
        const animSelect = document.querySelector('.animation-select');
        animSelect.innerHTML = '';
        animationList.forEach(anim => {
            const option = document.createElement('option');
            option.value = anim.name;
            option.textContent = `${anim.name} (${anim.duration.toFixed(2)}s)`;
            animSelect.appendChild(option);
        });

        // Enable animation controls
        document.querySelector('.animation-controls').style.display = 'block';

        // Play the first animation by default
        if (animationList.length > 0) {
            currentAction = mixer.clipAction(animationList[0].clip);
            currentAction.play();
            actions.push(currentAction);
            
            // Update timeline max value
            const timelineSlider = document.querySelector('.timeline-slider');
            timelineSlider.max = 100;
            timelineSlider.value = 0;
            
            document.querySelector('.total-time').textContent = 
                animationList[0].duration.toFixed(2) + 's';
        }
        } else {
        document.querySelector('.animation-controls').style.display = 'none';
    }

    // Animation clock
    const clock = new THREE.Clock();

    // Render loop
    let animating = true;
    const animate = () => {
    if (!animating) return;

    const delta = clock.getDelta();

    // Update controls
    controls.update();

    // Update animations
    if (mixer) {
        mixer.update(delta);
        
        // Update timeline display
        if (currentAction) {
            const normalizedTime = mixer.time / currentAction.getClip().duration;
            const sliderValue = normalizedTime * 100;
            document.querySelector('.timeline-slider').value = sliderValue;
            document.querySelector('.current-time').textContent = 
                (mixer.time).toFixed(2) + 's';
        }
    }

    // Update skeleton helper
    if (skeletonHelper) {
        skeletonHelper.update();
    }

    // Render scene
    previewRenderer.render(previewScene, previewCamera);

    requestAnimationFrame(animate);
};

// Start animation loop
animate();

// Handle window resize
const handleResize = () => {
const width = previewContainer.clientWidth;
const height = previewContainer.clientHeight;

previewCamera.aspect = width / height;
previewCamera.updateProjectionMatrix();

previewRenderer.setSize(width, height);
};

window.addEventListener('resize', handleResize);

// Add control hints
this.addControlHints(canvas);

// Store cleanup function in the object for later use
object.userData.disposePreview = () => {
animating = false;
window.removeEventListener('resize', handleResize);

if (mixer) {
    mixer.stopAllAction();
    actions.forEach(action => mixer.uncacheAction(action));
    mixer.uncacheRoot(object);
}

controls.dispose();
previewRenderer.dispose();

// Remove additional helpers
if (wireframeHelper) previewScene.remove(wireframeHelper);
if (skeletonHelper) previewScene.remove(skeletonHelper);

// Clear the canvas
const context = canvas.getContext('2d');
context.clearRect(0, 0, canvas.width, canvas.height);
};

// Animation control methods
document.querySelector('.play-btn').onclick = () => {
if (currentAction) {
    currentAction.paused = false;
    currentAction.play();
}
};

document.querySelector('.pause-btn').onclick = () => {
if (currentAction) {
    currentAction.paused = true;
}
};

document.querySelector('.stop-btn').onclick = () => {
if (currentAction) {
    currentAction.reset();
}
};

document.querySelector('.animation-select').onchange = (e) => {
const selectedName = e.target.value;
const selectedAnim = animationList.find(a => a.name === selectedName);

if (selectedAnim && mixer) {
    // Stop current action
    if (currentAction) {
        currentAction.fadeOut(0.5);
    }
    
    // Start new action
    currentAction = mixer.clipAction(selectedAnim.clip);
    currentAction.reset().fadeIn(0.5).play();
    
    // Update timeline
    document.querySelector('.total-time').textContent = 
        selectedAnim.duration.toFixed(2) + 's';
}
};

   // Return the preview setup for future reference
    const previewSetup = {
        renderer: previewRenderer,
        scene: previewScene,
        camera: previewCamera,
        controls: controls,
        mixer: mixer,
        animationList: animationList
    };
    object.userData.previewSetup = previewSetup; // Store for cleanup
   previewPanel.classList.add('visible');
   return previewSetup;
  
}

updateModelInfo(object, name) {
    const modelName = document.querySelector('.model-name');
    const modelStats = document.querySelector('.model-stats');
 
    let vertexCount = 0;
    let triangleCount = 0;
    let materialCount = new Set();
    let meshCount = 0;
    let animationCount = 0;
    let hasSkinnedMeshes = false;
 
    // Collect geometry stats
     object.traverse((child) => {
     if (child.isMesh) {
         meshCount++;
         
         if (child.isSkinnedMesh) {
             hasSkinnedMeshes = true;
         }
         
         if (child.geometry) {
             // Count vertices
             if (child.geometry.attributes && child.geometry.attributes.position) {
                 vertexCount += child.geometry.attributes.position.count;
             }
             
             // Count triangles/faces
             if (child.geometry.index) {
                 triangleCount += child.geometry.index.count / 3;
             } else if (child.geometry.attributes.position) {
                 triangleCount += child.geometry.attributes.position.count / 3;
             }
         }
         
         // Count materials
         if (child.material) {
             if (Array.isArray(child.material)) {
                 child.material.forEach(mat => materialCount.add(mat));
             } else {
                 materialCount.add(child.material);
             }
         }
     }
     });
 
     // Count animations
     if (object.animations) {
        animationCount = object.animations.length;
     }
 
     // Update display
     if (modelName) modelName.textContent = name;
 
     if (modelStats) {
         modelStats.innerHTML = `
     <div class="stats-grid">
         <div class="stat-item">
             <span class="stat-label">Vertices:</span>
             <span class="stat-value">${vertexCount.toLocaleString()}</span>
         </div>
         <div class="stat-item">
             <span class="stat-label">Triangles:</span>
             <span class="stat-value">${triangleCount.toLocaleString()}</span>
         </div>
         <div class="stat-item">
             <span class="stat-label">Materials:</span>
             <span class="stat-value">${materialCount.size}</span>
         </div>
         <div class="stat-item">
             <span class="stat-label">Meshes:</span>
             <span class="stat-value">${meshCount}</span>
         </div>
         <div class="stat-item">
             <span class="stat-label">Animations:</span>
             <span class="stat-value">${animationCount}</span>
         </div>
         ${hasSkinnedMeshes ? `
         <div class="stat-item">
             <span class="stat-label">Rigged:</span>
             <span class="stat-value">Yes</span>
         </div>` : ''}
     </div>
 `;
 }
}

addControlHints(canvas) {
    // Remove any existing hints
    const existingHints = canvas.parentElement.querySelector('.control-hints');
    if (existingHints) {
       existingHints.remove();
    }

    // Create new hints container
    const hints = document.createElement('div');
    hints.className = 'control-hints';
    hints.innerHTML = `
        <div class="hint">
            <span class="hint-key">Left Click</span>
            <span class="hint-action">Rotate</span>
        </div>
        <div class="hint">
            <span class="hint-key">Right Click</span>
            <span class="hint-action">Pan</span>
        </div>
        <div class="hint">
            <span class="hint-key">Scroll</span>
            <span class="hint-action">Zoom</span>
        </div>
    `;

    // Add hints to canvas container
    canvas.parentElement.appendChild(hints);

    // Auto-hide hints after a few seconds
    setTimeout(() => {
        hints.classList.add('fade-out');
        setTimeout(() => {
            if (hints.parentElement) {
                hints.remove();
            }
        }, 500);
    }, 5000);
}


setupAnimation(model) {
    if (!this.mixers) this.mixers = new Map();
    
    if (model.animations && model.animations.length > 0) {
    const mixer = new THREE.AnimationMixer(model.scene || model);
    this.mixers.set(model.scene || model, mixer);
    
    model.animations.forEach((clip) => {
        const action = mixer.clipAction(clip);
        action.play();
    });
    }
}

processModel(object, name, animations) {
    object.traverse((child) => {
        if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            if (child.material) {
                child.material.side = THREE.DoubleSide;
                child.material.needsUpdate = true;
            }
        }
    });

    object.position.set(0, 0, 0);
    if (animations.length > 0) {
        object.animations = animations;
        const mixer = new THREE.AnimationMixer(object);
        object.userData.mixer = mixer;
        animations.forEach(clip => mixer.clipAction(clip).play());
    }

    selectedObject = object; // Set as selected for keyframe addition
    addKeyframe(); 

    scene.add(object);
    if (typeof addObjectToScene === 'function') addObjectToScene(object, name);
    if (typeof updateHierarchy === 'function') updateHierarchy();
    this.addModelAsset(name, object);
}


loadHDRI(file, autoAddToScene = true) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            const buffer = event.target.result;
            const url = URL.createObjectURL(new Blob([buffer]));
            this.rgbeLoader.load(
                url,
                (texture) => {
                    texture.mapping = THREE.EquirectangularReflectionMapping;
                    const asset = {
                        id: this.generateAssetId(),
                        name: file.name,
                        type: 'hdri',
                        texture: texture,
                        dateAdded: new Date(),
                        size: file.size,
                        favorite: false
                    };
                    this.assets.hdris.push(asset);
                    this.saveAssets();

                    // Optionally apply to scene immediately
                    if (autoAddToScene) {
                        this.applyHDRItoScene(asset);
                    }

                    resolve(asset);
                    URL.revokeObjectURL(url);
                },
                undefined,
                (error) => {
                    console.error('Error loading HDRI:', error);
                    this.showErrorNotification(`Failed to load HDRI: ${file.name}`);
                    reject(error);
                    URL.revokeObjectURL(url);
                }
            );
        };
        reader.onerror = (error) => {
            console.error('Error reading HDRI file:', error);
            reject(error);
        };
        reader.readAsArrayBuffer(file);
    });

}

applyHDRItoScene(asset) {
    if (!asset || asset.type !== 'hdri' || !asset.texture) {
        console.error('Invalid HDRI asset:', asset);
        return;
    }
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    pmremGenerator.compileEquirectangularShader();
    const envMap = pmremGenerator.fromEquirectangular(asset.texture).texture;
    this.scene.environment = envMap;
    this.scene.background = asset.texture; // or envMap
    pmremGenerator.dispose();
    console.log(`Applied HDRI "${asset.name}" to scene`);
}


loadTexture(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            const url = event.target.result;
            this.textureLoader.load(url, (texture) => {
                texture.needsUpdate = true;
                console.log('Loaded texture:', texture); // Debug
                const asset = {
                    id: this.generateAssetId(),
                    name: file.name,
                    type: 'texture',
                    texture: texture,
                    dateAdded: new Date(),
                    size: file.size,
                    favorite: false
                };
                this.assets.textures.push(asset);
                this.saveAssets();
                resolve(asset);
            }, undefined, (error) => {
                console.error('Error loading texture:', error);
                reject(error);
            });
        };
        reader.onerror = (error) => reject(error);
        reader.readAsDataURL(file);
    });
}

loadMaterial(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            const text = event.target.result;
            const extension = file.name.split('.').pop().toLowerCase();
            let material;
            if (extension === 'mtl') {
                material = new THREE.MeshStandardMaterial({ color: 0xcccccc });
                const lines = text.split('\n');
                lines.forEach(line => {
                    if (line.startsWith('Kd')) {
                        const [_, r, g, b] = line.split(/\s+/).map(parseFloat);
                        material.color.setRGB(r, g, b);
                    }
                });
            } else {
                material = new THREE.MeshStandardMaterial({ color: 0x888888 });
            }
            console.log('Loaded material:', material); // Debug
            const asset = {
                id: this.generateAssetId(),
                name: file.name,
                type: 'material',
                material: material,
                dateAdded: new Date(),
                size: file.size,
                favorite: false,
                thumbnail: this.createMaterialThumbnail(material)
            };
            this.assets.materials.push(asset);
            this.saveAssets();
            resolve(asset);
        };
        reader.onerror = (error) => reject(error);
        reader.readAsText(file);
    });
}

createTexturePreview(texture, name) {
    const previewContainer = document.createElement('div');
    previewContainer.className = 'texture-preview';
    
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    // Set preview size
    canvas.width = 256;
    canvas.height = 256;
    
    // Create preview image
    const image = new Image();
    image.src = texture.image.src;
    image.onload = () => {
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    
    // Add texture info
    const info = document.createElement('div');
    info.className = 'texture-info';
    info.innerHTML = `
        <h3>${name}</h3>
        <p>Size: ${texture.image.width} x ${texture.image.height}</p>
        <p>Format: ${texture.format}</p>
    `;
    
    previewContainer.appendChild(canvas);
    previewContainer.appendChild(info);
    };
    
    return previewContainer;
    }
    
    createMaterialPreview(materials, name) {
    const previewContainer = document.createElement('div');
    previewContainer.className = 'material-preview';
    
    // Create preview sphere for each material
    Object.keys(materials.materials).forEach(key => {
    const material = materials.materials[key];
    
    const sphereGeometry = new THREE.SphereGeometry(1, 32, 32);
    const mesh = new THREE.Mesh(sphereGeometry, material);
    
    // Create preview renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(128, 128);
    
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.z = 3;
    
    scene.add(mesh);
    
    // Add lighting
    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(1, 1, 1);
    scene.add(light);
    
    scene.add(new THREE.AmbientLight(0xffffff, 0.3));
    
    // Render preview
    renderer.render(scene, camera);
    
    const preview = document.createElement('div');
    preview.className = 'material-sphere';
    preview.appendChild(renderer.domElement);
    
    const info = document.createElement('div');
    info.className = 'material-info';
    info.innerHTML = `
        <h4>${key}</h4>
        <p>Type: ${material.type}</p>
    `;
    
    preview.appendChild(info);
    previewContainer.appendChild(preview);
    });
    
    return previewContainer;
}

addModelAsset(name, object) {
    const asset = {
        id: this.generateAssetId(),
        name: name,
        type: 'model',
        object: object, // <-- Live THREE.js object
        thumbnail: this.createThumbnail(object),
        dateAdded: new Date(),
        size: this.calculateAssetSize(object), // Should be file.size
        favorite: false,
        animations: object.animations || []
    };
    this.assets.models.push(asset);
    this.addToRecent(asset);
    this.updateAssetsView();
    this.saveAssets();
}

addHDRIAsset(name, texture) {
    const asset = {
       id: this.generateAssetId(),
       name: name,
       type: 'hdri',
       texture: texture,
       thumbnail: this.createHDRIThumbnail(texture),
       dateAdded: new Date(),
       size: this.calculateAssetSize(texture),
       favorite: false
    };
    
    this.assets.hdris.push(asset);
    this.addToRecent(asset);
    this.updateAssetsView();
    this.saveAssets();
}


addTextureAsset(name, texture) {
    const asset = {
        id: this.generateAssetId(),
        name: name,
        type: 'texture',
        texture: texture,
        thumbnail: this.createTextureThumbnail(texture),
        dateAdded: new Date(),
        size: this.calculateAssetSize(texture),
        favorite: false
    };
    
    this.assets.textures.push(asset);
    this.addToRecent(asset);
    this.updateAssetsView();
    this.saveAssets();
}

addMaterialAsset(name, materials) {
    const asset = {
        id: this.generateAssetId(),
        name: name,
        type: 'material',
        materials: materials,
        thumbnail: this.createMaterialThumbnail(materials),
        dateAdded: new Date(),
        size: this.calculateAssetSize(materials),
        favorite: false
    };
    
    this.assets.materials.push(asset);
    this.addToRecent(asset);
    this.updateAssetsView();
    this.saveAssets();
}

generateAssetId() {
    return 'asset-' + Math.random().toString(36).substr(2, 9);
}

calculateAssetSize(object) {
    // Implementation for calculating asset size in bytes
    let size = 0;
    
    if (object.isTexture) {
       size = object.image.width * object.image.height * 4; // Approximate size for textures
    } else if (object.isMesh || object.isObject3D) {
    object.traverse(child => {
        if (child.geometry) {
            size += child.geometry.attributes.position.array.byteLength;
            if (child.geometry.index) {
                size += child.geometry.index.array.byteLength;
            }
        }
    });
    }
    
    return 0;
}
    
addToRecent(asset) {
    this.assets.recent = this.assets.recent.filter(item => item.id !== asset.id);
    this.assets.recent.unshift(asset);
    if (this.assets.recent.length > 20) this.assets.recent.pop();
}

loadSavedAssets() {
    console.log("Attempting to load saved assets...");

    // --- 1. Load Main Asset Metadata ---
    let savedAssetData = null;
    try {
        const savedAssetString = localStorage.getItem('assets');
        if (savedAssetString) {
            savedAssetData = JSON.parse(savedAssetString);
            console.log("Successfully parsed 'assets' from localStorage.");
        } else {
            console.log("No 'assets' data found in localStorage.");
        }
    } catch (error) {
        console.error("Error parsing 'assets' from localStorage:", error);
        // Optional: Clear corrupted data
        // localStorage.removeItem('assets');
        savedAssetData = null; // Ensure it's null if parsing failed
    }

    // --- 2. Load Favorites List ---
    let savedFavorites = [];
    try {
        const savedFavoritesString = localStorage.getItem('assetFavorites');
        if (savedFavoritesString) {
            savedFavorites = JSON.parse(savedFavoritesString);
             // Basic validation: Ensure it's an array
            if (!Array.isArray(savedFavorites)) {
                console.warn("'assetFavorites' data is not an array, resetting.");
                savedFavorites = [];
            } else {
                console.log("Successfully parsed 'assetFavorites' from localStorage.");
            }
        } else {
            console.log("No 'assetFavorites' data found in localStorage.");
        }
        this.favorites = savedFavorites; // Assign to the class property
    } catch (error) {
        console.error("Error parsing 'assetFavorites' from localStorage:", error);
        // Optional: Clear corrupted data
        // localStorage.removeItem('assetFavorites');
        this.favorites = []; // Reset favorites on error
    }

    // --- 3. Load Recent Assets List ---
     let savedRecent = [];
     try {
         const savedRecentString = localStorage.getItem('recentAssets');
         if (savedRecentString) {
             savedRecent = JSON.parse(savedRecentString);
             // Basic validation: Ensure it's an array
             if (!Array.isArray(savedRecent)) {
                 console.warn("'recentAssets' data is not an array, resetting.");
                 savedRecent = [];
             } else {
                 console.log("Successfully parsed 'recentAssets' from localStorage.");
             }
         } else {
             console.log("No 'recentAssets' data found in localStorage.");
         }
         this.assets.recent = savedRecent; // Assign to the class property
     } catch (error) {
         console.error("Error parsing 'recentAssets' from localStorage:", error);
         // Optional: Clear corrupted data
         // localStorage.removeItem('recentAssets');
         this.assets.recent = []; // Reset recent on error
     }


    // --- 4. Populate Internal Asset Arrays if Data Loaded ---
    if (savedAssetData) {
        // Assign loaded data, using empty arrays as fallback if a type is missing
        this.assets.models = savedAssetData.models || [];
        this.assets.hdris = savedAssetData.hdris || [];
        this.assets.textures = savedAssetData.textures || [];
        this.assets.materials = savedAssetData.materials || [];

        console.log(`Loaded ${this.assets.models.length} models, ${this.assets.hdris.length} HDRIs, ${this.assets.textures.length} textures, ${this.assets.materials.length} materials.`);

        // --- 5. Process Loaded Assets (Apply Favorites, Convert Dates) ---
        const allLoadedAssets = [
            ...this.assets.models,
            ...this.assets.hdris,
            ...this.assets.textures,
            ...this.assets.materials
        ];

        const validAssetIds = new Set(allLoadedAssets.map(a => a.id)); // Keep track of valid IDs

        allLoadedAssets.forEach(asset => {
            // Ensure required fields exist (basic sanity check)
            if (!asset.id || !asset.name || !asset.type) {
                 console.warn("Loaded asset is missing essential properties (id, name, type):", asset);
                 // Consider removing such invalid assets from the list here if needed
                 return; // Skip processing this asset
            }

            // a) Apply favorite status
            asset.favorite = this.favorites.includes(asset.id);

            // b) Convert date string back to Date object
            if (asset.dateAdded && typeof asset.dateAdded === 'string') {
                asset.dateAdded = new Date(asset.dateAdded);
                // Check if the date conversion was valid
                if (isNaN(asset.dateAdded.getTime())) {
                     console.warn(`Invalid date format for asset ${asset.name}, resetting date.`);
                     asset.dateAdded = new Date(); // Fallback to current date
                }
            } else if (!asset.dateAdded) {
                 // If dateAdded is missing, add it
                 asset.dateAdded = new Date();
            }

            // c) Initialize placeholder for actual THREE objects (they are not loaded from storage)
            asset.object = null;
            asset.texture = null;
            asset.material = null;
            asset.materials = null; // For .mtl type assets

            // d) Add loaded asset to cache (metadata only for now)
            this.cacheAsset(asset);

        });

         // --- 6. Filter Recent List ---
         // Ensure recent list only contains assets that actually exist in the main lists
         this.assets.recent = this.assets.recent.filter(recentItem => recentItem && validAssetIds.has(recentItem.id));
         console.log(`Filtered recent list contains ${this.assets.recent.length} valid items.`);


    } else {
        // If no data was loaded, ensure asset arrays are empty
        this.assets.models = [];
        this.assets.hdris = [];
        this.assets.textures = [];
        this.assets.materials = [];
        this.assets.recent = [];
        this.favorites = [];
    }

    // --- 7. Update the UI ---
    console.log("Updating assets view after loading.");
    this.updateAssetsView();

    // --- 8. Load Last Active Tab ---
     const lastTab = localStorage.getItem('lastActiveTab');
     if (lastTab && document.querySelector(`.tab-btn[data-tab="${lastTab}"]`)) {
         this.switchTab(lastTab);
         console.log(`Switched to last active tab: ${lastTab}`);
     } else {
         this.switchTab('all'); // Default to 'all' if no last tab or invalid
     }

     // --- 9. Load Last View Preference (Optional) ---
     const lastView = localStorage.getItem('lastAssetView');
     if (lastView === 'list' || lastView === 'grid') {
        this.switchView(lastView);
        console.log(`Switched to last view preference: ${lastView}`);
     } // Defaults to grid otherwise
}





saveAssets() {
    // Save assets to localStorage
    const saveData = {
    models: this.assets.models.map(m => ({
        id: m.id,
        name: m.name,
        type: m.type,
        thumbnail: m.thumbnail,
        dateAdded: m.dateAdded,
        size: m.size,
        favorite: m.favorite
    })),
    hdris: this.assets.hdris.map(h => ({
        id: h.id,
        name: h.name,
        type: h.type,
        thumbnail: h.thumbnail,
        dateAdded: h.dateAdded,
        size: h.size,
        favorite: h.favorite
    })),
    textures: this.assets.textures.map(t => ({
        id: t.id,
        name: t.name,
        type: t.type,
        thumbnail: t.thumbnail,
        dateAdded: t.dateAdded,
        size: t.size,
        favorite: t.favorite
    })),
    materials: this.assets.materials.map(m => ({
        id: m.id,
        name: m.name,
        type: m.type,
        thumbnail: m.thumbnail,
        dateAdded: m.dateAdded,
        size: m.size,
        favorite: m.favorite
    }))
    };
    
    localStorage.setItem('assets', JSON.stringify(saveData));

    // Save recent items separately (only IDs or minimal info needed)
   const recentSaveData = this.assets.recent.map(a => ({ id: a.id, name: a.name, type: a.type })); // Save minimal info
   localStorage.setItem('recentAssets', JSON.stringify(recentSaveData));

   // Note: Favorites are saved separately in saveFavorites() called by toggleFavorite()
   console.log("Assets metadata saved.");
}

updateAssetsView() {
    const gridView = document.querySelector('.assets-view.grid-view');
    const listView = document.querySelector('.assets-view.list-view');
    const emptyState = document.querySelector('.empty-state');

    if (!gridView || !listView || !emptyState) return;

    gridView.innerHTML = '';
    listView.innerHTML = '';

    const activeTab = document.querySelector('.tab-btn.active')?.dataset.tab || 'all';
    let assetsToShow = [];

    switch (activeTab) {
        case 'all':
            assetsToShow = [...this.assets.models, ...this.assets.textures, ...this.assets.materials, ...this.assets.hdris];
            break;
        case 'favorites':
            assetsToShow = [
                ...this.assets.models.filter(a => a.favorite),
                ...this.assets.textures.filter(a => a.favorite),
                ...this.assets.materials.filter(a => a.favorite),
                ...this.assets.hdris.filter(a => a.favorite)
            ];
            break;
        case 'recent':
            assetsToShow = this.assets.recent;
            break;
        default:
            assetsToShow = this.assets[activeTab] || [];
    }

    if (this.searchFilter) {
        assetsToShow = assetsToShow.filter(asset =>
            asset.name.toLowerCase().includes(this.searchFilter.toLowerCase())
        );
    }

    assetsToShow = this.sortAssets(assetsToShow, this.sortBy);

    if (assetsToShow.length === 0) {
        emptyState.style.display = 'flex';
        gridView.style.display = 'none';
        listView.style.display = 'none';
        return;
    }

    emptyState.style.display = 'none';

    if (this.currentView === 'grid') {
        gridView.style.display = 'grid';
        listView.style.display = 'none';
        assetsToShow.forEach(asset => {
            const item = this.createAssetItem(asset, gridView);
            if (item && !gridView.contains(item)) gridView.appendChild(item);
        });
    } else {
        gridView.style.display = 'none';
        listView.style.display = 'table';

        if (!listView.querySelector('.assets-table')) {
            const table = document.createElement('table');
            table.className = 'assets-table';
            table.innerHTML = `<thead>
                <tr>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Size</th>
                    <th>Date Added</th>
                </tr>
            </thead>
            <tbody></tbody>`;
            listView.appendChild(table);
        }

        const tbody = listView.querySelector('tbody');
        tbody.innerHTML = '';

        assetsToShow.forEach(asset => {
            const row = document.createElement('tr');
            row.className = 'asset-item';
            row.draggable = true;
            row.dataset.assetId = asset.id;

            row.innerHTML = `
                <td>
                    <div class="asset-row-preview">
                        ${asset.thumbnail ? `<img src="${asset.thumbnail}" alt="${asset.name}" class="mini-thumbnail">` : `<i class="${this.getIconForType(asset.type)}"></i>`}
                        <span class="asset-name">${asset.name}</span>
                    </div>
                </td>
                <td>${asset.type}</td>
                <td>${this.formatFileSize(asset.size)}</td>
                <td>${new Date(asset.dateAdded).toLocaleDateString()}</td>
            `;

            tbody.appendChild(row);
        });
    }

    this.addAssetItemListeners();
}

sortAssets(sortBy) {
    this.sortBy = sortBy;
    this.updateAssetsView();
}

filterAssets() {
    this.updateAssetsView();
}

navigateToFolder(path) {
    this.updateAssetsView();
}

importFromUrl(url, type) {
    // Placeholder for URL import
    console.log(`Importing ${type} from URL: ${url}`);
}



sortAssets(assets, sortBy) {
    return assets.sort((a, b) => {
        if (sortBy === 'name') return a.name.localeCompare(b.name);
        if (sortBy === 'type') return a.type.localeCompare(b.type);
        if (sortBy === 'date') return new Date(b.dateAdded) - new Date(a.dateAdded);
        if (sortBy === 'size') return b.size - a.size;
        return 0;
    });
}

formatFileSize(size) {
    if (size < 1024) return size + ' B';
    if (size < 1024 * 1024) return (size / 1024).toFixed(2) + ' KB';
    return (size / (1024 * 1024)).toFixed(2) + ' MB';
}

// Add event listeners to asset items
addAssetItemListeners() {
    const assetItems = document.querySelectorAll('.asset-item');
    
    assetItems.forEach(item => {
        // Double click to add to scene or preview
        document.querySelectorAll('.asset-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const assetId = item.dataset.assetId;
                this.showAssetPreview(assetId);
            });
            // ... (other listeners like drag, favorite, delete) ...
             // Single click to select
        item.addEventListener('click', (e) => {
            // Handle case where we don't want to deselect others (shift key)
            const keepSelection = e.shiftKey;
            
            if (!keepSelection) {
                document.querySelectorAll('.asset-item.selected').forEach(selected => {
                    if (selected !== item) {
                        selected.classList.remove('selected');
                    }
                });
            }
            
            item.classList.toggle('selected');
            
            // Show preview if selected
            if (item.classList.contains('selected')) {
                this.showAssetPreview(item.dataset.assetId);
            }
        });
        });
    });
}

showAssetPreview(assetId) {
    let asset = [...this.assets.models, ...this.assets.textures, ...this.assets.materials, ...this.assets.hdris]
        .find(a => a.id === assetId);
    if (!asset) {
        console.error(`Asset with ID ${assetId} not found`);
        return;
    }

    console.log(`Previewing asset:`, asset);

    this.currentAsset = asset;

    const previewPanel = document.querySelector('.asset-preview-panel');
    previewPanel.classList.add('visible');


    document.querySelector('.preview-title').textContent = `Asset Preview: ${asset.type}`;
    document.querySelector('.model-name').textContent = asset.name;
    const statsElement = document.querySelector('.model-stats');
    statsElement.innerHTML = `
        <div><strong>Type:</strong> ${asset.type}</div>
        <div><strong>Added:</strong> ${new Date(asset.dateAdded).toLocaleString()}</div>
        <div><strong>Size:</strong> ${this.formatFileSize(asset.size)}</div>
    `;

    const canvas = document.getElementById('preview-canvas');
    const previewContainer = document.querySelector('.preview-container');
    previewContainer.style.display = 'block';

    // Reset canvas
    canvas.width = previewContainer.clientWidth;
    canvas.height = previewContainer.clientHeight;
    const context = canvas.getContext('webgl2', {alpha: true}) || canvas.getContext('webgl', {alpha: true});
    context.clearRect(0, 0, canvas.width, canvas.height);
    if (context) {
        context.clearColor(0, 0, 0, 0); // Clear to transparent black
        context.clear(context.COLOR_BUFFER_BIT | context.DEPTH_BUFFER_BIT);
    }
    this.cleanupPreview(); // Clean up previous preview

    switch (asset.type) {
        case 'model':
            this.setupModelPreview(asset, canvas);
            break;
        case 'texture':
            this.setupTexturePreview(asset, canvas);
            break;
        case 'hdri':
            this.setupHDRIPreview(asset, canvas);
            break;
        case 'material':
            this.setupMaterialPreview(asset, canvas);
            break;
        default:
            console.warn(`No preview handler for asset type: ${asset.type}`);
            // Display placeholder or error in canvas
            const ctx2d = canvas.getContext('2d');
            ctx2d.clearRect(0, 0, canvas.width, canvas.height);
            ctx2d.fillStyle = '#555';
            ctx2d.font = '16px Arial';
            ctx2d.textAlign = 'center';
            ctx2d.fillText(`Preview not available for type: ${asset.type}`, canvas.width / 2, canvas.height / 2);
    }

    const animControls = document.querySelector('.animation-controls');
    if (asset.type === 'model' && asset.animations && asset.animations.length > 0) {
        this.setupAnimationControls(asset);
        animControls.style.display = 'block';
    } else {
        animControls.style.display = 'none';
    }

    this.resizePreviewCanvas();
    this.updatePreviewSettings();
}

resizePreviewCanvas() {
    const canvas = document.getElementById('preview-canvas');
    const previewContainer = document.querySelector('.preview-container');
    const width = previewContainer.clientWidth;
    const height = previewContainer.clientHeight;

    canvas.width = width;
    canvas.height = height;

    if (this.previewRenderer) {
        this.previewRenderer.setSize(width, height, false);
    }
    if (this.previewCamera) {
        this.previewCamera.aspect = width / height;
        this.previewCamera.updateProjectionMatrix();
    }
    if (this.previewRenderer && this.previewScene && this.previewCamera) {
        this.previewRenderer.render(this.previewScene, this.previewCamera);
    }
}

setupModelPreview(asset, canvas) {
    this.previewScene = new THREE.Scene();
    this.previewScene.background = new THREE.Color(this.previewSettings.backgroundColor);

    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    this.previewCamera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    this.previewCamera.position.set(2, 2, 2);
    this.previewCamera.lookAt(0, 0, 0);

    this.previewRenderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.previewRenderer.setSize(width, height, false);
    this.previewRenderer.setPixelRatio(window.devicePixelRatio);
    this.previewRenderer.setClearColor(this.previewSettings.backgroundColor, 1);

    const model = asset.object.clone();
    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    model.position.sub(center);
    const maxDim = Math.max(size.x, size.y, size.z);
    if (maxDim > 0) {
        const scale = 1.5 / maxDim;
        model.scale.multiplyScalar(scale);
    }
    this.previewScene.add(model);
    this.previewModel = model;

    const light1 = new THREE.DirectionalLight(0xffffff, 1);
    light1.position.set(1, 1, 1);
    this.previewScene.add(light1);
    const light2 = new THREE.DirectionalLight(0xffffff, 0.3);
    light2.position.set(-1, -1, -1);
    this.previewScene.add(light2);
    this.previewScene.add(new THREE.AmbientLight(0xffffff, 0.3));

    this.previewControls = new THREE.OrbitControls(this.previewCamera, canvas);
    this.previewControls.enableDamping = true;
    this.previewControls.dampingFactor = 0.1;
    this.previewControls.autoRotate = this.previewSettings.autoRotate;

    if (asset.animations && asset.animations.length > 0) {
        this.previewMixer = new THREE.AnimationMixer(model);
        const animSelect = document.querySelector('.animation-select');
        animSelect.innerHTML = '';
        asset.animations.forEach((clip, index) => {
            const option = document.createElement('option');
            option.value = index;
            option.textContent = clip.name || `Animation ${index + 1}`;
            animSelect.appendChild(option);
        });
        if (asset.animations.length > 0) {
            this.selectAnimation(0);
        }
    }

    this.startPreviewAnimation();
    window.addEventListener('resize', this.resizePreviewCanvas.bind(this));
}

setupTexturePreview(asset, canvas) {
    console.log('Setting up texture preview with asset:', asset); // Keep for debugging

    this.cleanupPreview(); // Ensure clean state BEFORE setting up new preview

    this.previewScene = new THREE.Scene();
    this.previewScene.background = new THREE.Color(this.previewSettings.backgroundColor);

    const width = canvas.clientWidth; // Use clientWidth/Height for sizing
    const height = canvas.clientHeight;
    this.previewCamera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    this.previewCamera.position.set(0, 0, 1.5); // Adjust camera distance slightly if needed
    this.previewCamera.lookAt(0, 0, 0);

    this.previewRenderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true }); // Ensure alpha for background potentially
    this.previewRenderer.setSize(width, height, false);
    this.previewRenderer.setPixelRatio(window.devicePixelRatio);
    // Setting clear color might interfere if background is set, but okay for checkerboard fallback
    // this.previewRenderer.setClearColor(this.previewSettings.backgroundColor, 1); // Keep or remove based on desired effect

    if (!asset.texture || !asset.texture.image) {
        console.error('Texture missing or invalid:', asset);
        // Display an error message visually if needed
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'red';
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Error: Texture not loaded', width / 2, height / 2);
        document.querySelector('.model-stats').innerHTML += `<div><strong>Error:</strong> Texture image not available</div>`;
        // No need to setup scene/controls if error
        return;
    } else {
        // Use the checkerboard background for the scene itself for textures
        const loader = new THREE.TextureLoader();
        const bgTexture = loader.load('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAAAGXRFWHRTb2Z0d2FyZQBBZG9iZSBJbWFnZVJlYWR5ccllPAAAACFJREFUeNpiPHPmDA+MDIwMIAEa//8z0JoAEDQAbKEBViIjAQEGAKuMAWzdGgD3AAAAAElFTkSuQmCC'); // Simple 16x16 checker png
        bgTexture.wrapS = THREE.RepeatWrapping;
        bgTexture.wrapT = THREE.RepeatWrapping;
        bgTexture.repeat.set(width / 16, height / 16); // Repeat checkerboard
        this.previewScene.background = bgTexture;

        const geometry = new THREE.PlaneGeometry(1, 1);
        // Ensure texture update flag is sometimes needed
        asset.texture.needsUpdate = true;
        const material = new THREE.MeshBasicMaterial({
            map: asset.texture,
            side: THREE.DoubleSide,
            transparent: true, // Important for seeing checkerboard if texture has alpha
            alphaTest: 0.1 // Optional: adjust if needed for transparency edges
        });
        const plane = new THREE.Mesh(geometry, material);

        // Adjust plane scale based on texture aspect ratio to fit preview
        const imgWidth = asset.texture.image.naturalWidth || asset.texture.image.width;
        const imgHeight = asset.texture.image.naturalHeight || asset.texture.image.height;
        const aspect = imgWidth / imgHeight;
        const viewAspect = width / height;
        let scaleX = 1, scaleY = 1;

        if (aspect > viewAspect) { // Texture is wider than view
             scaleX = 1;
             scaleY = (1 / aspect) * viewAspect;
        } else { // Texture is taller than view or same aspect
             scaleX = aspect / viewAspect;
             scaleY = 1;
        }
        // Apply a base scale to make it fill more of the view
        const baseScale = 1.3;
        plane.scale.set(scaleX * baseScale, scaleY * baseScale, 1);


        this.previewScene.add(plane);
        this.previewModel = plane; // Keep track of the main object

        document.querySelector('.model-stats').innerHTML += `
            <div><strong>Dimensions:</strong> ${imgWidth} x ${imgHeight}</div>
        `;

         // Controls for texture preview (less rotation freedom might be better)
        this.previewControls = new THREE.OrbitControls(this.previewCamera, canvas);
        this.previewControls.enableDamping = true;
        this.previewControls.dampingFactor = 0.1;
        this.previewControls.autoRotate = this.previewSettings.autoRotate; // Allow auto-rotate
        this.previewControls.enableZoom = true;
        this.previewControls.enablePan = true; // Allow panning
        this.previewControls.enableRotate = false; // Disable rotation for flat texture is often better
        this.previewControls.minZoom = 0.5;
        this.previewControls.maxZoom = 4;


        this.startPreviewAnimation(); // Start the loop only if successful
        window.addEventListener('resize', this.resizePreviewCanvas.bind(this));

        // Initial render might be needed if startPreviewAnimation is async
        // this.previewRenderer.render(this.previewScene, this.previewCamera);
    }
}

setupHDRIPreview(asset, canvas) {
    console.log('Setting up HDRI preview with asset:', asset);

    this.cleanupPreview(); // Clean state first

    this.previewScene = new THREE.Scene();
    // *** FIX: Set the scene background to the HDRI texture ***
    if (asset.texture) {
         // Ensure mapping is correct (should be set during load, but double-check)
         asset.texture.mapping = THREE.EquirectangularReflectionMapping;
         this.previewScene.background = asset.texture;
    } else {
         this.previewScene.background = new THREE.Color(this.previewSettings.backgroundColor); // Fallback color
    }


    const width = canvas.clientWidth; // Use clientWidth/Height
    const height = canvas.clientHeight;
    this.previewCamera = new THREE.PerspectiveCamera(60, width / height, 0.1, 100); // Wider FOV often good for HDRIs
    this.previewCamera.position.set(0, 0, 0.1); // Camera inside the sphere for panorama view
    // No lookAt needed if using OrbitControls correctly centered

    this.previewRenderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    this.previewRenderer.setSize(width, height, false);
    this.previewRenderer.setPixelRatio(window.devicePixelRatio);
    // Don't set clear color if background texture is used
    // this.previewRenderer.setClearColor(this.previewSettings.backgroundColor, 1);
    this.previewRenderer.toneMapping = THREE.ACESFilmicToneMapping; // Good tonemapping for HDRIs
    this.previewRenderer.toneMappingExposure = 1.0;


    if (!asset.texture) {
        console.error('HDRI texture missing:', asset);
         // Display an error message visually if needed
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'red';
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Error: HDRI not loaded', width / 2, height / 2);
        document.querySelector('.model-stats').innerHTML += `<div><strong>Error:</strong> HDRI texture not available</div>`;
        return;
    } else {
        // Optional: Add a reflective sphere in the middle to see reflections
        const geometry = new THREE.SphereGeometry(0.3, 32, 32); // Smaller sphere
        const pmremGenerator = new THREE.PMREMGenerator(this.previewRenderer);
        pmremGenerator.compileEquirectangularShader();
        const envMap = pmremGenerator.fromEquirectangular(asset.texture).texture;
        const material = new THREE.MeshStandardMaterial({
            color: 0xffffff, // White base color
            metalness: 1.0,
            roughness: 0.1, // Adjust roughness to see reflections clearly
            envMap: envMap, // Use the processed envMap
            envMapIntensity: 1.0
        });
        const sphere = new THREE.Mesh(geometry, material);
        this.previewScene.add(sphere);
        this.previewModel = sphere; // Track the sphere
        pmremGenerator.dispose(); // Dispose generator after use

        // No extra lights needed if relying on HDRI environment light
    }

    this.previewControls = new THREE.OrbitControls(this.previewCamera, canvas);
    this.previewControls.enableDamping = true;
    this.previewControls.dampingFactor = 0.05; // Smoother damping
    this.previewControls.autoRotate = this.previewSettings.autoRotate;
    this.previewControls.enableZoom = false; // Zoom usually not needed for HDRI preview
    this.previewControls.enablePan = false; // Panning not needed
    this.previewControls.enableRotate = true; // Rotation is key
    this.previewControls.rotateSpeed = -0.5; // Invert rotation direction if needed


    this.startPreviewAnimation();
    window.addEventListener('resize', this.resizePreviewCanvas.bind(this));

    // Initial render
    // this.previewRenderer.render(this.previewScene, this.previewCamera);
}


setupMaterialPreview(asset, canvas) {
    console.log('Setting up material preview with asset:', asset);

    this.previewScene = new THREE.Scene();
    this.previewScene.background = new THREE.Color(this.previewSettings.backgroundColor);

    const width = canvas.width;
    const height = canvas.height;
    this.previewCamera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    this.previewCamera.position.set(0, 0, 2);
    this.previewCamera.lookAt(0, 0, 0);

    this.previewRenderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    this.previewRenderer.setSize(width, height, false);
    this.previewRenderer.setPixelRatio(window.devicePixelRatio);
    this.previewRenderer.setClearColor(this.previewSettings.backgroundColor, 1);

    if (!asset.material) {
        console.error('Material missing:', asset);
        const geometry = new THREE.SphereGeometry(0.5, 32, 32);
        const material = new THREE.MeshBasicMaterial({ color: 0xff0000 }); // Red for error
        const sphere = new THREE.Mesh(geometry, material);
        this.previewScene.add(sphere);
        this.previewModel = sphere;
        document.querySelector('.model-stats').innerHTML += `<div><strong>Error:</strong> Material not available</div>`;
    } else {
        const geometry = new THREE.SphereGeometry(0.5, 32, 32);
        const material = asset.material.clone();
        const sphere = new THREE.Mesh(geometry, material);
        this.previewScene.add(sphere);
        this.previewModel = sphere;

        const light = new THREE.DirectionalLight(0xffffff, 1);
        light.position.set(1, 1, 1);
        this.previewScene.add(light);
        const ambient = new THREE.AmbientLight(0xffffff, 0.3);
        this.previewScene.add(ambient);
    }

    this.previewControls = new THREE.OrbitControls(this.previewCamera, canvas);
    this.previewControls.enableDamping = true;
    this.previewControls.dampingFactor = 0.1;
    this.previewControls.autoRotate = this.previewSettings.autoRotate;
    this.previewControls.enableZoom = true;
    this.previewControls.enablePan = false;

    this.startPreviewAnimation();
    window.addEventListener('resize', this.resizePreviewCanvas.bind(this));

    // Initial render
    this.previewRenderer.render(this.previewScene, this.previewCamera);
}

startPreviewAnimation() {
    if (this.previewAnimationId) {
        // Avoid starting multiple loops
        // cancelAnimationFrame(this.previewAnimationId);
        return;
    }

    const clock = new THREE.Clock();

    const animate = () => {
        // Check if loop should stop (e.g., preview cleaned up)
        if (!this.previewRenderer || !this.previewScene || !this.previewCamera) {
             this.previewAnimationId = null; // Ensure ID is cleared
             return; // Stop loop if components are gone
        }

        this.previewAnimationId = requestAnimationFrame(animate);
        const delta = clock.getDelta();

        if (this.previewControls) {
            this.previewControls.update(delta); // Pass delta for damping if enabled
        }
        if (this.previewMixer) {
            this.previewMixer.update(delta);
            this.updateAnimationTimeline(); // Update timeline visuals
        }

        // Update skeleton helper if it exists
        if (this.previewSkeleton && this.previewSkeleton.visible) {
             // SkeletonHelper updates itself based on the model's pose
             // No explicit update needed here typically
        }

        if (this.previewRenderer && this.previewScene && this.previewCamera) {
            this.previewRenderer.render(this.previewScene, this.previewCamera);
        }
    };
    console.log("Starting preview animation loop");
    animate(); // Start the loop
}

updateAnimationTimeline() {
    if (!this.previewMixer || !this.activeAction) return;

    const currentTime = this.activeAction.time;
    const duration = this.activeAction.getClip().duration;

    if (duration > 0) {
        const normalizedTime = currentTime / duration;
        const sliderValue = Math.min(100, Math.max(0, normalizedTime * 100)); // Clamp value

        const timelineSlider = document.querySelector('.timeline-slider');
        // Update slider only if the user isn't currently dragging it
        if (document.activeElement !== timelineSlider) {
            timelineSlider.value = sliderValue;
        }

        document.querySelector('.current-time').textContent = currentTime.toFixed(2) + 's';
        document.querySelector('.total-time').textContent = duration.toFixed(2) + 's';
    } else {
        // Handle zero duration clips if necessary
        document.querySelector('.timeline-slider').value = 0;
        document.querySelector('.current-time').textContent = '0.00s';
        document.querySelector('.total-time').textContent = '0.00s';
    }
}

disposeScene(scene) {
    scene.traverse(object => {
        if (object.geometry) {
            object.geometry.dispose();
        }
        
        if (object.material) {
            if (Array.isArray(object.material)) {
                object.material.forEach(material => {
                    Object.keys(material).forEach(prop => {
                        if (material[prop] && material[prop].dispose) {
                            material[prop].dispose();
                        }
                    });
                    material.dispose();
                });
            } else {
                Object.keys(object.material).forEach(prop => {
                    if (object.material[prop] && object.material[prop].dispose) {
                        object.material[prop].dispose();
                    }
                });
                object.material.dispose();
            }
        }
    });
}


selectAnimation(index) {
    if (!this.previewMixer || !this.previewModel || !this.currentAsset || !this.currentAsset.animations) {
        console.warn("Cannot select animation: Missing components.");
        return;
    }

    const animations = this.currentAsset.animations;
    if (index < 0 || index >= animations.length) {
        console.error("Invalid animation index:", index);
        return;
    }

    const clip = animations[index];
    if (!clip) {
        console.error("Animation clip not found at index:", index);
        return;
    }
    console.log("Selecting animation:", clip.name || `Animation ${index + 1}`);


    const newAction = this.previewMixer.clipAction(clip);

    // Fade out the previous action if it exists and is different
    if (this.activeAction && this.activeAction !== newAction) {
        console.log("Fading out previous action");
        this.activeAction.fadeOut(0.3); // Fade out over 0.3 seconds
    } else if (this.activeAction === newAction && this.activeAction.isRunning()) {
        console.log("Restarting the same action");
        // If selecting the same action again, just reset and play
        this.activeAction.reset();
    }


    // Reset, fade in, and play the new action
    newAction.reset();
    newAction.setEffectiveWeight(1.0); // Ensure weight is 1
    newAction.setEffectiveTimeScale(1.0); // Ensure speed is normal
    newAction.paused = false; // Ensure it's not paused
    newAction.fadeIn(0.3); // Fade in over 0.3 seconds
    newAction.play();


    this.activeAction = newAction; // Update the active action reference

    // Update timeline display
    const duration = clip.duration;
    document.querySelector('.timeline-slider').max = 100; // Keep max at 100
    document.querySelector('.timeline-slider').value = 0; // Reset slider
    document.querySelector('.current-time').textContent = '0.00s';
    document.querySelector('.total-time').textContent = duration.toFixed(2) + 's';
}

playAnimation() {
    if (this.activeAction) {
        this.activeAction.paused = false;
        this.activeAction.play();
    }
}

pauseAnimation() {
    if (this.activeAction) {
        this.activeAction.paused = true;
    }
}

stopAnimation() {
    if (this.activeAction) {
        this.activeAction.stop();
    }
}

scrubAnimation(normalizedValue) { // Value from 0 to 1
    if (this.activeAction && this.previewMixer) {
        const duration = this.activeAction.getClip().duration;
        const time = duration * normalizedValue;

        // Set the mixer's time, which affects all actions
        this.previewMixer.setTime(time);

        // If paused, ensure the action's time reflects the scrubbed time
        if (this.activeAction.paused) {
             this.activeAction.time = time;
        }


        document.querySelector('.current-time').textContent = time.toFixed(2) + 's';
        // Optional: Render a single frame immediately after scrubbing
        // if (this.previewRenderer && this.previewScene && this.previewCamera) {
        //     this.previewRenderer.render(this.previewScene, this.previewCamera);
        // }
    }
}


updateAnimationTime(value) {
    if (this.activeAction) {
        const duration = this.activeAction.getClip().duration;
        this.activeAction.time = duration * (value / 100);
    }

    // Update time display
    const time = this.activeAction.time;
    document.querySelector('.current-time').textContent = time.toFixed(2) + 's';
}

setupAnimationControls(asset) {
    // Show animation controls
    const animControls = document.querySelector('.animation-controls');
    animControls.style.display = 'block';

    // Setup animation select
    const animSelect = document.querySelector('.animation-select');
    animSelect.innerHTML = '';

    asset.animations.forEach((clip, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = clip.name || `Animation ${index + 1}`;
        animSelect.appendChild(option);
    });

    // Setup event listeners
    animSelect.onchange = (e) => {
        this.selectAnimation(parseInt(e.target.value));
    };

    document.querySelector('.play-btn').onclick = () => {
        this.playAnimation();
    }

    document.querySelector('.pause-btn').onclick = () => {
        this.pauseAnimation();
    }

    document.querySelector('.stop-btn').onclick = () => {
        this.stopAnimation();
    }

    document.querySelector('.timeline-slider').oninput = (e) => {
        this.updateAnimationTime(e.target.value);
    }

    document.querySelector('.timeline-slider').onchange = (e) => {
        this.updateAnimationTime(e.target.value);
    }
}


createAssetItem(asset, parent) {
    const item = document.createElement('div');
    item.className = `asset-item ${asset.favorite ? 'favorite' : ''}`;
    item.draggable = true;
    item.dataset.assetId = asset.id;

    let thumbnailHTML = '';
    if (asset.type === 'model' || asset.type === 'hdri') {
        thumbnailHTML = asset.thumbnail ? `<img src="${asset.thumbnail}" alt="${asset.name}" class="thumbnail">` : `<div class="thumbnail-placeholder"><i class="${this.getIconForType(asset.type)}"></i></div>`;
    } else if (asset.type === 'texture') {
        if (asset.texture && asset.texture.image) {
            const img = asset.texture.image;
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = 100;
            tempCanvas.height = 100;
            const ctx = tempCanvas.getContext('2d');
            this.drawCheckerboard(ctx, 100, 100);
            const imgRatio = img.width / img.height;
            let drawWidth = 90;
            let drawHeight = drawWidth / imgRatio;
            if (drawHeight > 90) {
                drawHeight = 90;
                drawWidth = drawHeight * imgRatio;
            }
            const x = (100 - drawWidth) / 2;
            const y = (100 - drawHeight) / 2;
            ctx.drawImage(img, x, y, drawWidth, drawHeight);
            thumbnailHTML = `<img src="${tempCanvas.toDataURL('image/png')}" alt="${asset.name}" class="thumbnail">`;
        } else {
            thumbnailHTML = `<div class="thumbnail-placeholder"><i class="${this.getIconForType(asset.type)}"></i></div>`;
        }
    } else if (asset.type === 'material') {
        thumbnailHTML = asset.thumbnail ? `<img src="${asset.thumbnail}" alt="${asset.name}" class="thumbnail">` : `<div class="thumbnail-placeholder"><i class="${this.getIconForType(asset.type)}"></i></div>`;
    }

    item.innerHTML = `
        ${thumbnailHTML}
        <span class="asset-name">${asset.name}</span>
        <div class="asset-actions">
             <button class="favorite-btn">
               <i class="${asset.favorite ? 'fas fa-star' : 'far fa-star'}"></i>
            </button>
            <button  class="delete-btn"><i class="fas fa-trash"  style="font-size: 14px;" ></i></button>
        </div>
       
    `;
    return item;
}

// Helper function to get appropriate icon
getIconForType(type) {
    switch (type) {
        case 'model': return 'fas fa-cube';
        case 'texture': return 'fas fa-image';
        case 'hdri': return 'fas fa-globe';
        case 'material': return 'fas fa-paint-brush';
        default: return 'fas fa-file';
    }
}

createThumbnail(object) {
    const width = 100;
    const height = 100;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(width, height);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(2, 2, 2);
    camera.lookAt(0, 0, 0);

    const clone = object.clone();
    const box = new THREE.Box3().setFromObject(clone);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    clone.position.sub(center);
    const maxDim = Math.max(size.x, size.y, size.z);
    if (maxDim > 0) {
        const scale = 1.5 / maxDim;
        clone.scale.multiplyScalar(scale);
    }
    scene.add(clone);

    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(1, 1, 1);
    scene.add(light);
    scene.add(new THREE.AmbientLight(0xffffff, 0.3));

    renderer.render(scene, camera);
    const dataURL = canvas.toDataURL('image/png');

    renderer.dispose();
    scene.traverse(obj => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
            if (Array.isArray(obj.material)) {
                obj.material.forEach(mat => mat.dispose());
            } else {
                obj.material.dispose();
            }
        }
    });

    return dataURL;
}

createTextureThumbnail(texture) {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    
    // Set checkerboard background for transparency
    this.drawCheckerboard(ctx, canvas.width, canvas.height);
    
    // Draw texture if available
    if (texture.image) {
        try {
            // Center the image and maintain aspect ratio
            const imgWidth = texture.image.width;
            const imgHeight = texture.image.height;
            const scale = Math.min(canvas.width / imgWidth, canvas.height / imgHeight) * 0.8;
            const scaledWidth = imgWidth * scale;
            const scaledHeight = imgHeight * scale;
            const x = (canvas.width - scaledWidth) / 2;
            const y = (canvas.height - scaledHeight) / 2;
            
            ctx.drawImage(texture.image, x, y, scaledWidth, scaledHeight);
        } catch (e) {
            console.error('Error creating texture thumbnail:', e);
            // Draw a placeholder if we can't render the texture
            ctx.fillStyle = '#f0f0f0';
            ctx.fillRect(10, 10, canvas.width - 20, canvas.height - 20);
            ctx.fillStyle = '#999';
            ctx.font = '14px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('Texture', canvas.width / 2, canvas.height / 2);
        }
    } else {
        // Draw placeholder for texture without image
        ctx.fillStyle = '#f0f0f0';
        ctx.fillRect(10, 10, canvas.width - 20, canvas.height - 20);
        ctx.fillStyle = '#999';
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Texture', canvas.width / 2, canvas.height / 2);
    }
    
    return canvas.toDataURL('image/png');
}

createHDRIThumbnail(texture) {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    
    // For HDRIs, we'll render a sphere with the HDRI as environment map
    // But we need a WebGL renderer for this
    const renderer = new THREE.WebGLRenderer({
        canvas: canvas,
        antialias: true
    });
    
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.z = 3;
    
    // Create a reflective sphere
    const geometry = new THREE.SphereGeometry(1, 32, 32);
    const material = new THREE.MeshStandardMaterial({
        metalness: 1.0,
        roughness: 0.2,
        envMap: texture
    });
    
    const sphere = new THREE.Mesh(geometry, material);
    scene.add(sphere);
    
    // Add some lighting
    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    
    // Set background
    scene.background = new THREE.Color(0x444444);
    
    // Render
    renderer.render(scene, camera);
    
    // Clean up
    geometry.dispose();
    material.dispose();
    
    return canvas.toDataURL('image/png');
}

createMaterialThumbnail(material) {
    const width = 100;
    const height = 100;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(width, height);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 0, 2);

    const geometry = new THREE.SphereGeometry(0.5, 32, 32);
    const sphere = new THREE.Mesh(geometry, material);
    scene.add(sphere);

    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(1, 1, 1);
    scene.add(light);
    scene.add(new THREE.AmbientLight(0xffffff, 0.3));

    renderer.render(scene, camera);
    const dataURL = canvas.toDataURL('image/png');

    // Clean up
    renderer.dispose();
    scene.traverse(obj => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) obj.material.dispose();
    });

    return dataURL;
}

// Helper method for texture thumbnails
drawCheckerboard(ctx, width, height) {
    const tileSize = 8;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "#eeeeee";
    for (let y = 0; y < height; y += tileSize) {
        for (let x = 0; x < width; x += tileSize) {
            if ((x / tileSize + y / tileSize) % 2 === 0) {
                ctx.fillRect(x, y, tileSize, tileSize);
            }
        }
    }
}

addAssetToScene(assetId) {
    const asset = [
        ...this.assets.models,
        ...this.assets.textures,
        ...this.assets.materials,
        ...this.assets.hdris
    ].find(a => a.id === assetId);

    if (!asset) {
        console.error(`Asset with ID ${assetId} not found`);
        return;
    }

    switch (asset.type) {
        case 'model':
            const clone = asset.object.clone();
            clone.position.set(0, 0, 0);
            scene.add(clone);
            objects.push(clone);
            updateHierarchy();
            selectObject(clone);
            transformControls.attach(clone);
            updateInspector();
            break;
        case 'hdri':
            this.applyHDRItoScene(asset);
            break;
        case 'texture':
            // Add texture application logic if needed (e.g., apply to selected object)
            console.log(`Texture ${asset.name} selected for application`);
            break;
        case 'material':
            // Add material application logic if needed
            console.log(`Material ${asset.name} selected for application`);
            break;
        default:
            console.warn(`Unsupported asset type: ${asset.type}`);
    }
}


addAssetToScene(object) {
    if (!object) return;
        const clone = object.clone();
        clone.position.set(0, 0, 0);
    
        scene.add(clone);
        objects.push(clone);
        updateHierarchy();
        selectObject(clone);
        transformControls.attach(clone);
        updateInspector();
    }
    
    updateAnimation(deltaTime) {
        if (this.mixers) {
            this.mixers.forEach(mixer => {
                mixer.update(deltaTime);
            });
        }
    }

    addAnimationControls(object) {
        if (!object.animations || object.animations.length === 0) return;
        
        const mixer = this.mixers.get(object);
        if (!mixer) return;
        
        const animations = object.animations.map(clip => ({
            name: clip.name,
            action: mixer.clipAction(clip)
        }));
        
        // Create animation controls UI
        const controls = document.createElement('div');
        controls.className = 'animation-controls';
        controls.innerHTML = `
        <select class="animation-select">
        ${animations.map(anim => `
            <option value="${anim.name}">${anim.name}</option>
           `).join('')}
               </select>
               <button class="play-btn">Play</button>
               <button class="stop-btn">Stop</button>
        `;
        
        // Add event listeners
        controls.querySelector('.animation-select').addEventListener('change', (e) => {
            const selectedAnim = animations.find(a => a.name === e.target.value);
            if (selectedAnim) {
                animations.forEach(a => a.action.stop());
                selectedAnim.action.play();
            }
        });
            
            // Add controls to UI
        document.querySelector('.inspector').appendChild(controls);
    }
            
    switchTab(tab) {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tab);
        });
        this.updateAssetsView();
        localStorage.setItem('lastActiveTab', tab);
    }

    switchView(view) {
        if (view !== 'grid' && view !== 'list') return; // Basic validation
        this.currentView = view;
        document.querySelectorAll('.view-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        const activeBtn = document.querySelector(`.view-btn[data-view="${view}"]`);
        if (activeBtn) {
            activeBtn.classList.add('active');
        } else {
             // Fallback if button not found (shouldn't happen)
             document.querySelector('.view-btn[data-view="grid"]').classList.add('active');
             this.currentView = 'grid';
        }
    
        // Update which view container is visible
         document.querySelector('.assets-view.grid-view').classList.toggle('active', view === 'grid');
         document.querySelector('.assets-view.list-view').classList.toggle('active', view === 'list');
    
    
        this.updateAssetsView(); // Re-render content in the new view format
        localStorage.setItem('lastAssetView', view); // Save preference
    }
  
   

    // Add proper event listeners for tab buttons
    initTabListeners() {
        const tabButtons = document.querySelectorAll('.tab-btn');
        
        tabButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tabName = e.target.dataset.tab;
                this.switchTab(tabName);
            });
        });
    }
    

}

// Initialize the assets panel
const assetsPanel = new AssetsPanel(scene, renderer);
// Add toggle function to your existing toolbar button
function toggleAssetsPanel() {
    document.querySelector('.assets-panel').classList.toggle('visible');
}


function visualizeBones(model) {
    // Check if the model has a skeleton
    if (model.skeleton) {
       const skeletonHelper = new THREE.SkeletonHelper(model);
       skeletonHelper.visible = true;
       model.add(skeletonHelper);  // Add the skeleton helper to the model
    }
}

