// Enhanced Assets Panel System
class AssetVersion {
    constructor(asset) {
       this.assetId = asset.id;
       this.version = Date.now();
       this.data = structuredClone(asset);
    }
}



class AssetsPanel {
    constructor() {
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
                        <button class="close-preview-btn"><i class="fas fa-times"></i></button>
                    </div>
                    <div class="preview-container" display="none">
                        <canvas id="preview-canvas"></canvas>
                    </div>
                    <div class="preview-info">
                        <h3 class="model-name">No asset selected</h3>
                        <div class="model-stats"></div>
                    </div>
                    <div class="preview-controls">
                        <button class="preview-btn wireframe-btn" title="Toggle Wireframe"><i class="fas fa-vector-square"></i></button>
                        <button class="preview-btn grid-btn active" title="Toggle Grid"><i class="fas fa-border-all"></i></button>
                        <button class="preview-btn rotate-btn active" title="Auto Rotate"><i class="fas fa-sync"></i></button>
                        <button class="preview-btn bones-btn" title="Show Bones"><i class="fas fa-bone"></i></button>
                        <button class="preview-btn bg-color-btn" title="Change Background"><i class="fas fa-fill-drip"></i></button>
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
                bottom: 0;
                width: 95%;
                z-index: 3;
                min-height: 300px;
                max-height: 380px;
                background: #2a2a2a;
                border-top: 1px solid #3a3a3a;
                display: flex;
                flex-direction: column;
                transform: translate(-50%, 100%);
                transition: transform 0.3s ease-in-out;
                color: #e0e0e0;
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
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
            e.target.closest('.wireframe-btn').classList.toggle('active', this.previewSettings.showWireframe);
            this.updatePreviewSettings();
        });

        document.querySelector('.grid-btn').addEventListener('click', (e) => {
            this.previewSettings.showGrid = !this.previewSettings.showGrid;
            e.target.closest('.grid-btn').classList.toggle('active', this.previewSettings.showGrid);
            this.updatePreviewSettings();
        });

        document.querySelector('.rotate-btn').addEventListener('click', (e) => {
            this.previewSettings.autoRotate = !this.previewSettings.autoRotate;
            e.target.closest('.rotate-btn').classList.toggle('active', this.previewSettings.autoRotate);
            this.updatePreviewSettings();
        });

        document.querySelector('.bones-btn').addEventListener('click', (e) => {
            this.previewSettings.showBones = !this.previewSettings.showBones;
            e.target.closest('.bones-btn').classList.toggle('active', this.previewSettings.showBones);
            this.updatePreviewSettings();
        });

        document.querySelector('.bg-color-btn').addEventListener('click', () => {
            this.previewSettings.backgroundColor = this.previewSettings.backgroundColor === '#1a1a1a' ? '#4a4a4a' : '#1a1a1a';
            this.updatePreviewSettings();
        });

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
        this.scrubAnimation(parseFloat(e.target.value) / 100);
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
        else if (this.supportedHDRIFormats.includes('.' + extension)) return this.loadHDRI(file);
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


updatePreviewSettings() {
    if (!this.previewScene || !this.previewRenderer || !this.previewCamera) return;

    // Update background color
    this.previewScene.background = new THREE.Color(this.previewSettings.backgroundColor);
    this.previewRenderer.setClearColor(this.previewSettings.backgroundColor, 1);

    // Update auto-rotate
    if (this.previewControls) {
        this.previewControls.autoRotate = this.previewSettings.autoRotate;
    }

    // Handle grid visibility
    if (this.previewGrid) {
        this.previewGrid.visible = this.previewSettings.showGrid;
    } else if (this.previewSettings.showGrid && (this.currentAsset?.type === 'model' || this.currentAsset?.type === 'material' || this.currentAsset?.type === 'hdri')) {
        this.previewGrid = new THREE.GridHelper(3, 10, 0x333333, 0x222222);
        this.previewGrid.position.y = -1;
        this.previewScene.add(this.previewGrid);
    }

    // Handle wireframe for models and materials
    if (this.currentAsset?.type === 'model' || this.currentAsset?.type === 'material') {
        if (this.previewSettings.showWireframe) {
            if (!this.previewWireframe) {
                this.previewWireframe = new THREE.Group();
                this.previewModel.traverse(child => {
                    if (child.isMesh) {
                        const wireframe = new THREE.WireframeGeometry(child.geometry);
                        const line = new THREE.LineSegments(wireframe);
                        line.material.color.set(0x00ff00);
                        line.material.opacity = 0.25;
                        line.material.transparent = true;
                        line.position.copy(child.position);
                        line.rotation.copy(child.rotation);
                        line.scale.copy(child.scale);
                        this.previewWireframe.add(line);
                    }
                });
                this.previewScene.add(this.previewWireframe);
            }
        } else {
            if (this.previewWireframe) {
                this.previewScene.remove(this.previewWireframe);
                this.previewWireframe = null;
            }
        }
    }

    // Handle bones for models with skeletons
    if (this.currentAsset?.type === 'model') {
        if (this.previewSettings.showBones) {
            if (!this.previewSkeleton) {
                let skeletonFound = false;
                this.previewModel.traverse(child => {
                    if (child.isSkinnedMesh && child.skeleton && !skeletonFound) {
                        this.previewSkeleton = new THREE.SkeletonHelper(child);
                        this.previewSkeleton.material.linewidth = 2;
                        this.previewScene.add(this.previewSkeleton);
                        skeletonFound = true;
                    }
                });
            }
        } else {
            if (this.previewSkeleton) {
                this.previewScene.remove(this.previewSkeleton);
                this.previewSkeleton = null;
            }
        }
    }

    // Trigger a render
    this.previewRenderer.render(this.previewScene, this.previewCamera);
}

cleanupPreview() {
    if (this.previewAnimationId) {
        cancelAnimationFrame(this.previewAnimationId);
        this.previewAnimationId = null;
    }
    if (this.previewMixer) {
        this.previewMixer.stopAllAction();
        this.previewMixer = null;
    }
    if (this.previewControls) {
        this.previewControls.dispose();
        this.previewControls = null;
    }
    if (this.previewRenderer) {
        this.previewRenderer.dispose();
        this.previewRenderer = null;
    }
    if (this.previewScene) {
        this.disposeScene(this.previewScene);
        this.previewScene = null;
    }
    this.previewCamera = null;
    this.previewGrid = null;
    this.previewWireframe = null;
    this.previewSkeleton = null;
    this.previewModel = null;
    this.activeAction = null;
    this.currentAsset = null;

    const canvas = document.getElementById('preview-canvas');
    const context = canvas.getContext('2d');
    context.clearRect(0, 0, canvas.width, canvas.height);
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
                            this.fbxLoader.load(url, (obj) => {
                                obj.scale.set(0.01, 0.01, 0.01);
                                resolveLoader(obj);
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

disposeAsset(asset) {
if (asset.object) {
asset.object.traverse((child) => {
    if (child.geometry) {
        child.geometry.dispose();
    }
    if (child.material) {
        if (Array.isArray(child.material)) {
            child.material.forEach(mat => mat.dispose());
        } else {
            child.material.dispose();
        }
    }
});
}

if (asset.texture) {
asset.texture.dispose();
}

// Remove from assets array
const index = this.assets[asset.type + 's'].findIndex(a => a.id === asset.id);
if (index > -1) {
this.assets[asset.type + 's'].splice(index, 1);
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
removeAsset(assetId) {
Object.keys(this.assets).forEach(type => {
const index = this.assets[type].findIndex(a => a.id === assetId);
if (index > -1) {
    const asset = this.assets[type][index];
    this.disposeAsset(asset);
    this.assets[type].splice(index, 1);
    this.assetCache?.delete(assetId);
}
});

this.updateAssetsView();
this.saveAssets();
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

    scene.add(object);
    if (typeof addObjectToScene === 'function') addObjectToScene(object, name);
    if (typeof updateHierarchy === 'function') updateHierarchy();
    this.addModelAsset(name, object);
}


loadHDRI(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            const buffer = event.target.result;
            const url = URL.createObjectURL(new Blob([buffer]));
            this.rgbeLoader.load(url, (texture) => {
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
                resolve(asset);
                URL.revokeObjectURL(url);
            }, undefined, (error) => {
                console.error('Error loading HDRI:', error);
                this.showErrorNotification(`Failed to load HDRI: ${file.name}`);
                reject(error);
                URL.revokeObjectURL(url);
            });
        };
        reader.onerror = (error) => {
            console.error('Error reading HDRI file:', error);
            reject(error);
        };
        reader.readAsArrayBuffer(file);
    });
}

loadTexture(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            const url = event.target.result;
            this.textureLoader.load(url, (texture) => {
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
                this.showErrorNotification(`Failed to load texture: ${file.name}`);
                reject(error);
            });
        };
        reader.onerror = (error) => {
            console.error('Error reading texture file:', error);
            reject(error);
        };
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
                // Parse .mtl file (simplified parsing for demonstration)
                material = new THREE.MeshStandardMaterial({ color: 0xcccccc }); // Default material
                const lines = text.split('\n');
                lines.forEach(line => {
                    if (line.startsWith('Kd')) {
                        const [_, r, g, b] = line.split(/\s+/).map(parseFloat);
                        material.color.setRGB(r, g, b);
                    }
                });
            } else if (extension === 'mat') {
                // Placeholder for .mat parsing (specific to your software)
                material = new THREE.MeshStandardMaterial({ color: 0x888888 });
            }

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
        reader.onerror = (error) => {
            console.error('Error reading material file:', error);
            reject(error);
        };
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
        object: object,
        thumbnail: this.createThumbnail(object),
        dateAdded: new Date(),
        size: this.calculateAssetSize(object),
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
        if (!listView.querySelector('table')) {
            const table = document.createElement('table');
            table.className = 'assets-table';
            table.innerHTML = `<thead><tr><th>Name</th><th>Type</th><th>Size</th><th>Date Added</th></tr></thead><tbody></tbody>`;
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
                <td><div class="asset-row-preview">${asset.thumbnail ? `<img src="${asset.thumbnail}" alt="${asset.name}" class="mini-thumbnail">` : `<i class="${this.getIconForType(asset.type)}"></i>`}<span>${asset.name}</span></div></td>
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
    if (!asset) return;

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

    this.cleanupPreview();

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
    const previewPanel = document.querySelector('.asset-preview-panel');
    const isExpanded = previewPanel.classList.contains('expanded');

    const width = isExpanded ? previewContainer.clientWidth : previewContainer.clientWidth;
    const height = isExpanded ? previewContainer.clientHeight : previewContainer.clientHeight;

    canvas.width = width;
    canvas.height = height;

    if (this.previewRenderer) {
        this.previewRenderer.setSize(width, height);
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
    this.previewScene = new THREE.Scene();
    this.previewScene.background = new THREE.Color(this.previewSettings.backgroundColor);

    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    this.previewCamera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    this.previewCamera.position.set(0, 0, 2);
    this.previewCamera.lookAt(0, 0, 0);

    this.previewRenderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.previewRenderer.setSize(width, height, false);
    this.previewRenderer.setPixelRatio(window.devicePixelRatio);
    this.previewRenderer.setClearColor(this.previewSettings.backgroundColor, 1);

    const geometry = new THREE.PlaneGeometry(1, 1);
    const material = new THREE.MeshBasicMaterial({
        map: asset.texture,
        side: THREE.DoubleSide,
        transparent: true
    });
    const plane = new THREE.Mesh(geometry, material);
    this.previewScene.add(plane);
    this.previewModel = plane;

    this.previewControls = new THREE.OrbitControls(this.previewCamera, canvas);
    this.previewControls.enableDamping = true;
    this.previewControls.dampingFactor = 0.1;
    this.previewControls.autoRotate = this.previewSettings.autoRotate;

    this.startPreviewAnimation();
    window.addEventListener('resize', this.resizePreviewCanvas.bind(this));

    if (asset.texture && asset.texture.image) {
        document.querySelector('.model-stats').innerHTML += `
            <div><strong>Dimensions:</strong> ${asset.texture.image.width} x ${asset.texture.image.height}</div>
        `;
    }
}

setupHDRIPreview(asset, canvas) {
    this.previewScene = new THREE.Scene();
    this.previewScene.background = new THREE.Color(this.previewSettings.backgroundColor);

    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    this.previewCamera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    this.previewCamera.position.set(0, 0, 2);

    this.previewRenderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.previewRenderer.setSize(width, height);

    const geometry = new THREE.SphereGeometry(0.5, 32, 32);
    const material = new THREE.MeshStandardMaterial({
        metalness: 1.0,
        roughness: 0.2,
        envMap: asset.texture
    });
    const sphere = new THREE.Mesh(geometry, material);
    this.previewScene.add(sphere);
    this.previewModel = sphere;

    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(1, 1, 1);
    this.previewScene.add(light);
    this.previewScene.add(new THREE.AmbientLight(0xffffff, 0.3));

    this.previewControls = new THREE.OrbitControls(this.previewCamera, canvas);
    this.previewControls.enableDamping = true;
    this.previewControls.dampingFactor = 0.1;
    this.previewControls.autoRotate = this.previewSettings.autoRotate;

    this.startPreviewAnimation();
}

setupMaterialPreview(asset, canvas) {
    this.previewScene = new THREE.Scene();
    this.previewScene.background = new THREE.Color(this.previewSettings.backgroundColor);

    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    this.previewCamera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    this.previewCamera.position.set(0, 0, 2);

    this.previewRenderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.previewRenderer.setSize(width, height);

    const geometry = new THREE.SphereGeometry(0.5, 32, 32);
    const material = asset.material || new THREE.MeshStandardMaterial({ color: 0xcccccc });
    const sphere = new THREE.Mesh(geometry, material);
    this.previewScene.add(sphere);
    this.previewModel = sphere;

    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(1, 1, 1);
    this.previewScene.add(light);
    this.previewScene.add(new THREE.AmbientLight(0xffffff, 0.3));

    this.previewControls = new THREE.OrbitControls(this.previewCamera, canvas);
    this.previewControls.enableDamping = true;
    this.previewControls.dampingFactor = 0.1;
    this.previewControls.autoRotate = this.previewSettings.autoRotate;

    this.startPreviewAnimation();
}

startPreviewAnimation() {
    if (this.previewAnimationId) {
        cancelAnimationFrame(this.previewAnimationId);
    }

    const animate = () => {
        this.previewAnimationId = requestAnimationFrame(animate);
        if (this.previewControls) this.previewControls.update();
        if (this.previewMixer) this.previewMixer.update(0.016);
        if (this.previewRenderer && this.previewScene && this.previewCamera) {
            this.previewRenderer.render(this.previewScene, this.previewCamera);
        }
    };
    animate();
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
    if (!this.previewMixer || !this.previewModel) return;
    if (this.activeAction) this.activeAction.stop();

    const animationClips = [];
    this.previewModel.traverse(node => {
        if (node.animations && node.animations.length > 0) {
            animationClips.push(...node.animations);
        }
    });
    if (this.previewModel.animations) {
        animationClips.push(...this.previewModel.animations);
    }
    if (animationClips.length === 0) return;

    const clip = animationClips[index];
    if (!clip) return;

    this.activeAction = this.previewMixer.clipAction(clip);
    this.activeAction.reset();
    this.activeAction.play();
    document.querySelector('.total-time').textContent = clip.duration.toFixed(2) + 's';
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

scrubAnimation(value) {
    if (this.activeAction) {
        const duration = this.activeAction.getClip().duration;
        this.activeAction.time = duration * value;
        document.querySelector('.current-time').textContent = (this.activeAction.time).toFixed(2) + 's';
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
            <button class="favorite-btn"><i class="fas ${asset.favorite ? 'fa-star' : 'fa-star-o'}"></i></button>
            <button class="delete-btn"><i class="fas fa-trash"></i></button>
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
        this.currentView = view;
        document.querySelectorAll('.view-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.view === view);
        });
        this.updateAssetsView();
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
const assetsPanel = new AssetsPanel();

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

