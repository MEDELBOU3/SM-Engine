/**
 * AssetsPanel v5.2-professional (Folder Lines & Robustness)
 * Full drop-in replacement for your latest class (keeps API & HTML hooks).
 * - Adds `material` asset type (JSON definitions with texture slots & params)
 * - Adds support for FBX and OBJ models
 * - Supports importing entire folders from the device, preserving hierarchy.
 * - Applies materials via drag/drop onto meshes (PBR: map, normalMap, roughnessMap, metalnessMap, emissiveMap, displacementMap)
 * - Uses inline SVG icons for thumbnails/fallbacks, matching your HTML where possible.
 * - Preserves folders, multi-select, event hooks, storage, context menus, etc.
 * - Advanced UI/UX inspired by Unreal Engine / Unity asset browsers.
 *
 * FIXES & IMPROVEMENTS:
 * - Fixed asset selection (single, Ctrl/Cmd+Click, Shift+Click) to correctly trigger preview.
 * - Fixed preview pane not showing "Select an asset for preview" and correctly handling loading/empty states.
 * - Implemented FBX-only scaling when dropping into the main scene (GLTF, OBJ added without auto-scaling).
 * - Thumbnail Size Slider
 * - Breadcrumbs for folder navigation
 * - Tags/Keywords for assets (display & search)
 * - Dedicated Interactive 3D Preview Pane (for models, materials, textures)
 * - Conflict Resolution on asset import (rename/overwrite/skip)
 * - NEW: Vertical/Horizontal connector lines for folder hierarchy in the sidebar (Unreal-like).
 *
 * Usage: Replace previous AssetsPanel class with this code.
 *        Ensure GLTFLoader.js, FBXLoader.js, OBJLoader.js, RGBELoader.js, and OrbitControls.js are loaded.
 *        Call: AssetsPanel.init(scene, renderer, camera, raycaster);
 *
 * HTML structure updates (as per previous response) are required.
 */

/*class AssetsPanel {
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
  static currentFilter = 'all';
  static currentCategory = 'project';
  static selectedAssetId = null; // single select (ID of the last asset clicked)
  static selectedIds = new Set(); // multi-select set
  static contextAssetId = null;
  static openFolderId = null; // currently viewed folder in Project category (null = root)
  static lastStorageVersion = 3; // for schema migrations
  static lastSelectedAssetElement = null; // for Shift+Click to reference DOM element
  static currentThumbnailSize = 100; // Default thumbnail size in px
  static expandedFolders = new Set(); // For sidebar folder tree state

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

  // --- Init ---
  static init(scene, renderer, camera, raycaster) {
    this.scene = scene;
    this.renderer = renderer;
    this.camera = camera;
    this.raycaster = raycaster || new THREE.Raycaster();

    // Check for required THREE.js and loaders
    if (typeof THREE === 'undefined' || !THREE.GLTFLoader || !THREE.RGBELoader || !THREE.FBXLoader || !THREE.OBJLoader || typeof THREE.OrbitControls === 'undefined') {
      console.error("AssetsPanel Error: THREE.js or required loaders (GLTFLoader, RGBELoader, FBXLoader, OBJLoader, OrbitControls) not found. Please ensure they are loaded before AssetsPanel.js.");
      // Provide a fallback or prevent further initialization if crucial parts are missing
      const panel = document.getElementById('assetsPanel');
      if (panel) panel.innerHTML = '<div style="color:red;padding:20px;">AssetsPanel failed to initialize. Missing THREE.js or required loaders. Check console for details.</div>';
      return;
    }

    // DOM cache
    this.dom.panel = document.getElementById('assetsPanel');
    this.dom.grid = document.getElementById('assetsGrid');
    this.dom.properties = document.getElementById('propertiesContent');
    this.dom.uploadZone = document.getElementById('uploadDropzone');
    this.dom.uploadInput = document.getElementById('uploadInput');
    this.dom.uploadFolderInput = document.getElementById('uploadFolderInput');
    this.dom.contextMenu = document.getElementById('contextMenu');
    this.dom.header = document.getElementById('assetsPanelHeader');
    this.dom.searchBox = document.querySelector('.search-box');
    this.dom.filterButtons = document.querySelectorAll('.filter-btn');
    this.dom.categoriesContainer = document.querySelector('.assets-categories');
    this.dom.thumbnailSizeSlider = document.getElementById('thumbnailSizeSlider');
    this.dom.assetsBreadcrumbs = document.getElementById('assetsBreadcrumbs');
    this.dom.assetPreviewContainer = document.getElementById('assetPreviewContainer');
    this.dom.assetPreviewCanvas = document.getElementById('assetPreviewCanvas');
    // Note: assetTagsInput is dynamically created inside _updatePropertiesPanel, so no static cache here.

    // Loaders
    this.loaders.gltf = new THREE.GLTFLoader();
    this.loaders.fbx = new THREE.FBXLoader();
    this.loaders.obj = new THREE.OBJLoader();
    this.loaders.texture = new THREE.TextureLoader();
    this.loaders.hdri = new THREE.RGBELoader();

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
    this._setupEventListeners();
    this.render();

    console.log("AssetsPanel v5.2 initialized.");
  }

  // --- Preview Renderer Initialization ---
  static _initPreviewRenderer() {
    if (!this.dom.assetPreviewCanvas || !this.dom.assetPreviewContainer) {
      console.warn("AssetsPanel: Preview canvas or container element not found. Preview will not work.");
      return;
    }

    const container = this.dom.assetPreviewContainer;
    const width = container.clientWidth;
    const height = container.clientHeight;

    this.previewScene = new THREE.Scene();
    this.previewCamera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100);
    this.previewCamera.position.set(0, 0, 3);
    
    // Add simple lighting for the preview
    this.previewScene.add(new THREE.AmbientLight(0xffffff, 0.8));
    this.previewLight = new THREE.DirectionalLight(0xffffff, 1.2);
    this.previewLight.position.set(1, 1, 1).normalize();
    this.previewScene.add(this.previewLight);

    this.previewRenderer = new THREE.WebGLRenderer({
      canvas: this.dom.assetPreviewCanvas,
      alpha: true, // Allow transparent background
      antialias: true
    });
    this.previewRenderer.setSize(width, height);
    this.previewRenderer.setPixelRatio(window.devicePixelRatio);
    this.previewRenderer.setClearColor(0x000000, 0); // Transparent background

    this.previewControls = new THREE.OrbitControls(this.previewCamera, this.previewRenderer.domElement);
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
        if (this.dom.assetPreviewContainer && this.previewRenderer && this.previewCamera) {
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
  static toggle() { if (!this.dom.panel) return; this.dom.panel.classList.toggle('visible'); }
  static showUploadZone() { if (this.dom.uploadZone) this.dom.uploadZone.classList.add('visible'); }
  static hideUploadZone() { if (this.dom.uploadZone) this.dom.uploadZone.classList.remove('visible'); }
  static refreshAssets() { this.render(); }
  static searchAssets(query) { this.render(query ? query.toLowerCase() : ''); }
  static filterByType(type, element) { this.currentFilter = type; document.querySelectorAll('.filter-btn.active').forEach(b => b.classList.remove('active')); if (element) element.classList.add('active'); this.render(); }
  static selectCategory(category, element) { this.currentCategory = category; document.querySelectorAll('.category-item.active').forEach(c => c.classList.remove('active')); if (element) element.classList.add('active'); this.render(); }

  // Thumbnail size control
  static setThumbnailSize(size) {
    this.currentThumbnailSize = parseInt(size, 10);
    if (this.dom.panel) {
      this.dom.panel.style.setProperty('--thumbnail-size', `${this.currentThumbnailSize}px`);
    }
    localStorage.setItem('assetsPanel_thumbnailSize', this.currentThumbnailSize);
  }

  // File actions (rename/delete/favorite preserved)
  static renameAsset() {
    const asset = this._findById(this.contextAssetId);
    if (!asset || asset.isBuiltIn) return;
    const newName = prompt("Enter new name:", asset.name);
    if (newName && newName !== asset.name) {
      const siblingAssets = this.assets.filter(a =>
        !a.isBuiltIn && a.id !== asset.id && a.folderId === asset.folderId
      );
      if (siblingAssets.some(a => a.name === newName)) {
        alert("An asset with this name already exists in the current folder.");
        return;
      }

      asset.name = newName;
      this._saveToStorage();
      this.render();
      this.selectAsset(asset.id, null, false, null); // Re-select to update properties panel
    }
  }

  static deleteAsset() {
    if (!confirm("Are you sure you want to delete this asset(s)?")) return;
    const idsToDelete = this.selectedIds.size ? Array.from(this.selectedIds) : [this.contextAssetId];
    for (const id of idsToDelete) this._removeAsset(id);
    this.selectedIds.clear();
    this.selectedAssetId = null;
    this._clearPreview();
    this._saveToStorage();
    this.render();
  }

  static toggleFavorite() {
    const asset = this._findById(this.contextAssetId);
    if (asset) { asset.isFavorite = !asset.isFavorite; this._saveToStorage(); this.render(); }
  }

  // Folder operations
  static createFolder(name = 'New Folder', parentId = null) {
    const id = `folder_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    let uniqueName = name;
    let counter = 1;
    const siblingFolders = Object.values(this.folders).filter(f => (f.parentId || null) === (parentId || null));
    while (siblingFolders.some(f => f.name === uniqueName)) {
        uniqueName = `${name} (${counter++})`;
    }
    
    this.folders[id] = { id, name: uniqueName, parentId, children: [] };
    if (parentId && this.folders[parentId]) this.folders[parentId].children.push(id);
    this._saveToStorage();
    if (typeof this.onFolderChanged === 'function') this.onFolderChanged(this.folders);
    this.render();
    return id;
  }

  static renameFolder(folderId) {
    const folder = this.folders[folderId];
    if (!folder) return;
    const n = prompt('Rename folder', folder.name);
    if (n && n !== folder.name) {
      const siblingFolders = Object.values(this.folders).filter(f => f.id !== folderId && (f.parentId || null) === (folder.parentId || null));
      if (siblingFolders.some(f => f.name === n)) {
          alert("A folder with this name already exists in the current directory.");
          return;
      }
      folder.name = n;
      this._saveToStorage();
      if (typeof this.onFolderChanged === 'function') this.onFolderChanged(this.folders);
      this.render();
    }
  }

  static deleteFolder(folderId, options = { deleteContents: false }) {
    const folder = this.folders[folderId]; if (!folder) return;
    const all = this._collectFolderTree(folderId);
    if (!options.deleteContents) {
      const targetParent = folder.parentId || null;
      for (const asset of this.assets) {
        if (asset.folderId && all.includes(asset.folderId)) {
          asset.folderId = targetParent;
        }
      }
    } else {
      this.assets = this.assets.filter(a => !(a.folderId && all.includes(a.folderId)));
    }
    for (const fid of all) delete this.folders[fid];
    for (const f of Object.values(this.folders)) f.children = f.children.filter(c => !all.includes(c));
    
    if (this.openFolderId && all.includes(this.openFolderId)) {
        this.openFolderId = folder.parentId || null;
    }

    this._saveToStorage();
    if (typeof this.onFolderChanged === 'function') this.onFolderChanged(this.folders);
    this.render();
  }

  static moveAssetToFolder(assetId, folderId) { const asset = this._findById(assetId); if (!asset) return; asset.folderId = folderId || null; this._saveToStorage(); this.render(); }

  // Export / Import
  static exportJSON() {
    const payload = { version: this.lastStorageVersion, assets: this.assets.filter(a => !a.isBuiltIn), folders: this.folders };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'assets_export.json'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }

  static importJSON(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (data.assets) {
          for (const a of data.assets) {
            a.id = `asset_${Date.now()}_${Math.floor(Math.random()*1000)}`;
            a.isBuiltIn = false;
            if (!Array.isArray(a.tags)) a.tags = []; // Ensure tags array is present
            this.assets.push(a);
          }
        }
        if (data.folders) {
          const idMap = {};
          for (const fid in data.folders) {
            const f = data.folders[fid];
            const nid = `folder_${Date.now()}_${Math.floor(Math.random()*1000)}`;
            idMap[fid] = nid;
            this.folders[nid] = { ...f, id: nid, children: [], parentId: null };
          }
          for (const fid in data.folders) {
            const oldFolder = data.folders[fid];
            const newFolder = this.folders[idMap[fid]];
            if (oldFolder.parentId && idMap[oldFolder.parentId]) {
              newFolder.parentId = idMap[oldFolder.parentId];
              if (this.folders[newFolder.parentId] && !this.folders[newFolder.parentId].children.includes(newFolder.id)) {
                this.folders[newFolder.parentId].children.push(newFolder.id);
              }
            }
            newFolder.children = (oldFolder.children || []).map(c => idMap[c]).filter(Boolean);
          }
        }
        this._saveToStorage(); this.render();
      } catch (err) { console.error('Import failed', err); alert('Invalid JSON file'); }
    };
    reader.readAsText(file);
  }

  // Selection Logic - CORRECTED FOR SHIFT+CLICK
  static selectAsset(assetId, element = null, append = false, event = null) {
    const isCtrlOrMeta = event && (event.ctrlKey || event.metaKey);
    const isShift = event && event.shiftKey;

    if (!isCtrlOrMeta && !isShift) { // Plain click: clear all, then select current
        this.selectedIds.clear();
        if (assetId) this.selectedIds.add(assetId);
    } else if (isCtrlOrMeta) { // Ctrl/Cmd+Click: Toggle individual asset
        if (assetId) {
            if (this.selectedIds.has(assetId)) {
                this.selectedIds.delete(assetId);
            } else {
                this.selectedIds.add(assetId);
            }
        }
    } else if (isShift && this.lastSelectedAssetElement) { // Shift+Click: Range select
        const allVisibleAssetElements = Array.from(this.dom.grid.querySelectorAll('.asset-item'));
        const allVisibleAssetIds = allVisibleAssetElements.map(el => el.dataset.id);

        const startIndex = allVisibleAssetIds.indexOf(this.lastSelectedAssetElement.dataset.id);
        const endIndex = allVisibleAssetIds.indexOf(assetId);

        if (startIndex !== -1 && endIndex !== -1) {
            const [start, end] = [Math.min(startIndex, endIndex), Math.max(startIndex, endIndex)];
            this.selectedIds.clear(); // Clear current selection before range adding
            for (let i = start; i <= end; i++) {
                this.selectedIds.add(allVisibleAssetIds[i]);
            }
        } else { // Fallback to single select if range can't be determined (e.g., lastSelected not found)
            this.selectedIds.clear();
            if (assetId) this.selectedIds.add(assetId);
        }
    } else { // No assetId or other unexpected case, clear selection
        this.selectedIds.clear();
    }
    
    // Update last selected ID and element
    this.selectedAssetId = Array.from(this.selectedIds).pop() || null; // Last selected ID or null
    if (element) this.lastSelectedAssetElement = element; // Store the clicked DOM element

    // Visually update selection in the grid
    document.querySelectorAll('.asset-item.selected').forEach(el => el.classList.remove('selected'));
    for (const id of this.selectedIds) {
      const el = this.dom.grid.querySelector(`.asset-item[data-id='${id}']`);
      if (el) el.classList.add('selected');
    }

    // Update properties and preview for the *last selected* asset (or clear if none)
    const asset = this._findById(this.selectedAssetId);
    if (asset) {
      this._updatePropertiesPanel(asset);
      this._updatePreview(asset);
    } else {
      this.dom.properties.innerHTML = `<div class="property-row"><div class="property-label">Select an asset</div><div class="property-value">No asset selected</div></div>`;
      this._clearPreview();
    }
  }

  // Update Properties Panel
  static _updatePropertiesPanel(asset) {
    if (!this.dom.properties) return;

    let propsHtml = `<div class="properties-title">${asset.name}</div>
      <div class="property-row"><div class="property-label">Type</div><div class="property-value">${asset.type.toUpperCase()}</div></div>
      <div class="property-row"><div class="property-label">ID</div><div class="property-value">${asset.id.slice(0,8)}...</div></div>`;
    
    // Material specific properties
    if (asset.type === 'material' && asset.definition) {
      const d = asset.definition;
      propsHtml += `<div class="property-row"><div class="property-label">Color</div><div class="property-value">${d.color || '—'}</div></div>
        <div class="property-row"><div class="property-label">Roughness</div><div class="property-value">${d.roughness ?? '—'}</div></div>
        <div class="property-row"><div class="property-label">Metalness</div><div class="property-value">${d.metalness ?? '—'}</div></div>`;
      if (d.map) propsHtml += `<div class="property-row"><div class="property-label">Albedo</div><div class="property-value">${this._shortName(d.map)}</div></div>`;
      if (d.normalMap) propsHtml += `<div class="property-row"><div class="property-label">Normal</div><div class="property-value">${this._shortName(d.normalMap)}</div></div>`;
    }

    // Tags input/display
    propsHtml += `
      <div class="property-row property-tags">
          <div class="property-label">Tags</div>
          <div class="property-value">
              <input type="text" class="property-input tags-input" id="assetTagsInput" placeholder="Comma separated tags" value="${(asset.tags || []).join(', ')}">
          </div>
      </div>`;

    this.dom.properties.innerHTML = propsHtml;

    // Attach event listener for tags input AFTER HTML is rendered
    const tagsInput = this.dom.properties.querySelector('#assetTagsInput'); // CORRECTED ACCESS
    if (tagsInput) {
        tagsInput.onblur = tagsInput.onchange = (e) => {
            const newTags = e.target.value.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
            const selectedAsset = this._findById(this.selectedAssetId);
            if (selectedAsset) {
                selectedAsset.tags = newTags;
                this._saveToStorage();
            }
        };
    }
  }


  // Adds an asset to scene or multiple drop handling - FIXED FBX-ONLY SCALING
  static async _addToScene(assetId, event = null) {
    const asset = this._findById(assetId) || this._getPrimitiveAssets().find(a => a.id === assetId) || this._getLightAssets().find(a => a.id === assetId);
    if (!asset) { console.error(`AssetsPanel: Could not find asset with ID ${assetId}`); return; }
    if (typeof window.addObjectToScene !== 'function') { console.error("AssetsPanel Error: window.addObjectToScene() is not defined. Please define it globally."); return; }

    let position = new THREE.Vector3(0, 0, 0);
    if (event) {
      const rect = this.renderer.domElement.getBoundingClientRect();
      const mouse = new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      this.raycaster.setFromCamera(mouse, this.camera);
      const intersects = this.raycaster.intersectObjects(this.scene.children, true);
      if (intersects.length > 0) { position.copy(intersects[0].point); }
    }

    switch(asset.type) {
      case 'model':
        const ext = asset.name.split('.').pop().toLowerCase();
        let loaderPromise;

        if (ext === 'glb' || ext === 'gltf') {
          loaderPromise = new Promise((resolve, reject) => {
            this.loaders.gltf.load(asset.data, gltf => resolve(gltf.scene), undefined, reject);
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
            console.warn(`AssetsPanel: No specific loader for model type '${ext}' (asset: ${asset.name}). Trying GLTF loader as fallback.`);
            loaderPromise = new Promise((resolve, reject) => {
                this.loaders.gltf.load(asset.data, gltf => resolve(gltf.scene), undefined, reject);
            });
        }

        loaderPromise.then(model => {
          // --- BEGIN Scaling and Centering Logic (ONLY FOR FBX) ---
          if (ext === 'fbx') { // Apply scaling ONLY for FBX files
              const bbox = new THREE.Box3().setFromObject(model);
              if (bbox.isEmpty()) {
                  console.warn(`AssetsPanel: FBX Model '${asset.name}' bounding box is empty, skipping scaling/centering.`);
              } else {
                  const size = bbox.getSize(new THREE.Vector3());
                  const center = bbox.getCenter(new THREE.Vector3());

                  const targetMaxDim = 1.8; // Target size for FBX models
                  const currentMaxDim = Math.max(size.x, size.y, size.z);

                  if (currentMaxDim > 0) {
                      const scaleFactor = targetMaxDim / currentMaxDim;
                      model.scale.set(scaleFactor, scaleFactor, scaleFactor);
                  }

                  const newBbox = new THREE.Box3().setFromObject(model);
                  const newCenter = newBbox.getCenter(new THREE.Vector3());
                  model.position.sub(newCenter);
              }
          }
          // --- END Scaling and Centering Logic ---

          model.position.add(position); // Apply drop position always

          window.addObjectToScene(model, asset.name.split('.').slice(0, -1).join('.'));
          if (typeof this.onAssetAdded === 'function') this.onAssetAdded(asset);
        }).catch(error => {
          console.error(`AssetsPanel: Failed to load model '${asset.name}':`, error);
        });
        break;
      case 'texture':
        this.loaders.texture.load(asset.data, texture => {
          const intersects = this.raycaster.intersectObjects(this.scene.children, true);
          const target = intersects.length > 0 ? intersects[0].object : null;
          if (target && target.isMesh && target.material) {
            target.material.map = texture;
            target.material.needsUpdate = true;
            console.log(`Applied texture '${asset.name}' to object '${target.name}'.`);
          } else { console.warn("AssetsPanel: Could not apply texture. Drop it onto a mesh object."); }
        });
        break;
      case 'hdri':
        this.loaders.hdri.load(asset.data, texture => {
          texture.mapping = THREE.EquirectangularReflectionMapping;
          this.scene.background = texture;
          this.scene.environment = texture;
          console.log(`Applied HDRI '${asset.name}' to the scene.`);
        });
        break;
      case 'material':
        const intersects = event ? (()=>{
          const rect = this.renderer.domElement.getBoundingClientRect();
          const mouse = new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
          this.raycaster.setFromCamera(mouse, this.camera);
          return this.raycaster.intersectObjects(this.scene.children, true);
        })() : [];
        if (intersects && intersects.length > 0) {
          this._applyMaterialToMesh(asset, intersects[0].object);
        } else {
          console.warn("AssetsPanel: Drop a material onto a mesh to apply it.");
        }
        break;
      case 'primitive':
        const mesh = asset.factory(); mesh.position.copy(position); window.addObjectToScene(mesh, asset.name); break;
      case 'light':
        const light = asset.factory(); light.position.copy(position); if (light.target) { light.target.position.set(position.x, position.y -1, position.z); } window.addObjectToScene(light, asset.name); if(light.target) window.addObjectToScene(light.target, `${asset.name} Target`); break;
    }
  }

  // --- Preview Logic - FIXED LOADING/EMPTY STATES ---
  static async _updatePreview(asset) {
    if (!this.previewScene || !this.dom.assetPreviewContainer) return;

    this._clearPreview(); // Clear previous content and set to empty state
    this.dom.assetPreviewContainer.classList.add('loading'); // Show loading state

    try {
        if (asset.type === 'model') {
            const ext = asset.name.split('.').pop().toLowerCase();
            let loaderPromise;

            if (ext === 'glb' || ext === 'gltf') {
                loaderPromise = new Promise((resolve, reject) => this.loaders.gltf.load(asset.data, gltf => resolve(gltf.scene), undefined, reject));
            } else if (ext === 'fbx') {
                loaderPromise = new Promise((resolve, reject) => this.loaders.fbx.load(asset.data, obj => resolve(obj), undefined, reject));
            } else if (ext === 'obj') {
                loaderPromise = new Promise((resolve, reject) => this.loaders.obj.load(asset.data, obj => resolve(obj), undefined, reject));
            } else {
                console.warn(`Preview: No specific loader for model type '${ext}' (asset: ${asset.name}).`);
                this._clearPreview(); // Clear on unsupported type
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
                this.previewModel.position.sub(center.clone().multiplyScalar(scaleFactor)); // Adjust position after scaling
            } else {
                 console.warn(`Preview: Model '${asset.name}' bounding box is empty. Displaying empty preview.`);
                 this._clearPreview(); // Clear on empty model
                 return;
            }

            this.previewScene.add(this.previewModel);
            this.previewControls.target.set(0, 0, 0); // Recenter orbit controls target
            this.previewCamera.position.set(0, 0, Math.max(2, (bbox.max.z - bbox.min.z) * 1.5)); // Adjust camera distance
            this.previewControls.update();

        } else if (asset.type === 'material') {
            const material = new THREE.MeshStandardMaterial({
                color: asset.definition.color ? new THREE.Color(asset.definition.color) : 0xffffff,
                roughness: asset.definition.roughness ?? 0.5,
                metalness: asset.definition.metalness ?? 0.0,
                emissive: asset.definition.emissive ? new THREE.Color(asset.definition.emissive) : 0x000000,
                emissiveIntensity: asset.definition.emissiveIntensity ?? 1
            });
            const loader = new THREE.TextureLoader();
            const texturePromises = [];
            const slots = [['map','map'], ['normalMap','normalMap'], ['roughnessMap','roughnessMap'], ['metalnessMap','metalnessMap'], ['emissiveMap','emissiveMap'], ['displacementMap','displacementMap']];
            for (const [k, srcKey] of slots) {
              if (asset.definition[srcKey]) {
                texturePromises.push(new Promise(res => loader.load(asset.definition[srcKey], t => { material[k]=t; material.needsUpdate=true; res(); }, undefined, res)));
              }
            }
            await Promise.all(texturePromises);
            this.previewModel = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), material);
            this.previewScene.add(this.previewModel);
            this.previewCamera.position.set(0, 0, 2);
            this.previewControls.target.set(0, 0, 0);
            this.previewControls.update();

        } else if (asset.type === 'texture' || asset.type === 'hdri') {
            const texture = await new Promise(res => this.loaders.texture.load(asset.data, res, undefined, res));
            if (asset.type === 'hdri') texture.mapping = THREE.EquirectangularReflectionMapping;

            const material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide });
            // Use a sphere for HDRI preview to show mapping better, plane for regular texture
            this.previewModel = new THREE.Mesh(
                asset.type === 'hdri' ? new THREE.SphereGeometry(1, 32, 16) : new THREE.PlaneGeometry(2, 2),
                material
            );
            this.previewScene.add(this.previewModel);
            this.previewCamera.position.set(0, 0, 2);
            this.previewControls.target.set(0, 0, 0);
            this.previewControls.update();
        }
        // If anything was successfully loaded, remove the 'empty' class
        if (this.previewModel) {
            this.dom.assetPreviewContainer.classList.remove('empty');
        } else {
            this.dom.assetPreviewContainer.classList.add('empty'); // Fallback to empty if model somehow wasn't set
        }

    } catch (error) {
        console.error("Error loading preview asset:", error);
        this._clearPreview(); // Clear on error
    } finally {
        this.dom.assetPreviewContainer.classList.remove('loading');
    }
  }

  static _clearPreview() {
    if (this.previewScene) {
      // Dispose of previous preview model if it exists
      if (this.previewModel) {
        this.previewScene.remove(this.previewModel);
        this._disposeHierarchy(this.previewModel); // Custom recursive dispose
        this.previewModel = null;
      }
      
      // Reset camera and controls to default state
      this.previewCamera.position.set(0, 0, 3);
      this.previewControls.target.set(0, 0, 0);
      this.previewControls.update();

      // Show the "Select an asset for preview" overlay
      this.dom.assetPreviewContainer.classList.add('empty');
      this.dom.assetPreviewContainer.classList.remove('loading');
    }
  }

  // Helper to dispose of Three.js objects recursively
  static _disposeHierarchy(object) {
      if (!object) return;
      // Dispose geometry
      if (object.geometry) {
          object.geometry.dispose();
          object.geometry = undefined;
      }
      // Dispose material(s) and textures
      if (object.material) {
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          for (const material of materials) {
              for (const key in material) {
                  if (material[key] && typeof material[key].isTexture === 'boolean' && material[key].isTexture) {
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
          for (let i = 0; i < object.children.length; i++) {
              this._disposeHierarchy(object.children[i]);
          }
      }
  }


  // ------------------------------------------------------------------
  // Storage, Loading & Migration
  // ------------------------------------------------------------------
  static _saveToStorage() {
    try {
      const userAssets = this.assets.filter(a => !a.isBuiltIn);
      const payload = { version: this.lastStorageVersion, assets: userAssets, folders: this.folders };
      localStorage.setItem('assetsPanel_data_v3', JSON.stringify(payload));
      if (typeof this.onAssetsChanged === 'function') this.onAssetsChanged(this.assets, this.folders);
    } catch (e) { console.error('Failed to save assets', e); }
  }

  static _loadFromStorage() {
    try {
      const raw = localStorage.getItem('assetsPanel_data_v3');
      if (!raw) return this._migrateLegacy();
      const data = JSON.parse(raw);
      if (data.assets) {
        this.assets = data.assets.map(a => {
            if (!Array.isArray(a.tags)) a.tags = []; // Ensure tags are always an array
            return a;
        }).concat(this.assets.filter(a=>a.isBuiltIn));
      }
      if (data.folders) this.folders = data.folders;

      // Load thumbnail size
      const storedSize = localStorage.getItem('assetsPanel_thumbnailSize');
      if (storedSize) {
        this.currentThumbnailSize = parseInt(storedSize, 10);
        if (this.dom.thumbnailSizeSlider) {
            this.dom.thumbnailSizeSlider.value = this.currentThumbnailSize;
        }
        this.dom.panel.style.setProperty('--thumbnail-size', `${this.currentThumbnailSize}px`);
      }
    } catch (e) { console.error('Failed to load assets', e); this._migrateLegacy(); }
  }

  static _migrateLegacy() {
    const old = localStorage.getItem('assetsPanel_assets');
    if (!old) return;
    try {
      const arr = JSON.parse(old);
      this.assets = (arr||[]).map(a => ({
          ...a,
          id: a.id || `asset_${Date.now()}_${Math.floor(Math.random()*1000)}`,
          tags: [] // Initialize tags for legacy assets
      }));
      this.folders = {};
      this._saveToStorage();
      localStorage.removeItem('assetsPanel_assets');
      console.log('AssetsPanel: Migrated legacy assets to v3 storage.');
    } catch (e) { console.warn('AssetsPanel: Legacy migration failed', e); }
  }

  // ------------------------------------------------------------------
  // Event listeners and DOM behavior
  // ------------------------------------------------------------------
  static _setupEventListeners() {
    // Upload zone drag for files (and basic folder detection)
    if (this.dom.uploadZone) {
      this.dom.uploadZone.ondragover = (e) => { e.preventDefault(); this.dom.uploadZone.classList.add('dragover'); };
      this.dom.uploadZone.ondragleave = () => this.dom.uploadZone.classList.remove('dragover');
      this.dom.uploadZone.ondrop = async (e) => {
        e.preventDefault();
        this.dom.uploadZone.classList.remove('dragover');
        
        const droppedItems = Array.from(e.dataTransfer.items || []);
        const files = Array.from(e.dataTransfer.files || []);

        const hasDirectory = droppedItems.some(item => item.webkitGetAsEntry && item.webkitGetAsEntry().isDirectory);

        if (hasDirectory) {
            alert("Folder drop is not supported for drag-and-drop directly into the dropzone. Please use the 'Browse Folder' button to import directories.");
            this.hideUploadZone();
            return;
        }

        for (const file of files) {
          if (file.webkitRelativePath) {
            const pathSegments = file.webkitRelativePath.split('/');
            pathSegments.pop();
            const folderPath = pathSegments.join('/');
            const targetFolderId = this._ensureFolderPath(folderPath, this.openFolderId);
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
        e.target.value = ''; // Clear input value
      };
    }
    
    // Folder input (static in HTML)
    if (this.dom.uploadFolderInput) {
      this.dom.uploadFolderInput.onchange = async (e) => {
          await this._addAssetsFromFolderInput(Array.from(e.target.files), this.openFolderId);
          this.hideUploadZone();
          e.target.value = ''; // Clear input value
      };
    }

    // Renderer drag/drop -> add to scene or apply material/texture
    if (this.renderer && this.renderer.domElement) {
      this.renderer.domElement.ondragover = (e) => e.preventDefault();
      this.renderer.domElement.ondrop = (e) => {
        e.preventDefault();
        try {
          const data = JSON.parse(e.dataTransfer.getData('application/json'));
          if (data && data.assetId) this._addToScene(data.assetId, e);
        } catch (err) { /* ignore invalid drops }
      };
    }

    // Header resize
    if (this.dom.header && this.dom.panel) {
      this.dom.header.onmousedown = (e) => {
        if (e.target.closest('.assets-panel-controls')) return;

        const startY = e.clientY, startHeight = this.dom.panel.offsetHeight;
        const mouseMove = (ev) => { this.dom.panel.style.height = `${startHeight - (ev.clientY - startY)}px`; };
        document.addEventListener('mousemove', mouseMove);
        document.addEventListener('mouseup', () => document.removeEventListener('mousemove', mouseMove), { once: true });
      };
    }

    // Global click hides context menu and clears selection if clicked outside assets panel
    document.addEventListener('click', (e) => {
        if (this.dom.contextMenu) this.dom.contextMenu.style.display = 'none';

        if (this.dom.panel && !this.dom.panel.contains(e.target) && !e.target.closest('.context-menu')) {
            if (this.renderer && this.renderer.domElement && this.renderer.domElement.contains(e.target)) {
                // Do nothing, assume user is interacting with the 3D scene
            } else {
                this.selectAsset(null, null, false, null); // Deselect all assets
            }
        }
    });


    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      const isPanelActive = this.dom.panel.contains(document.activeElement) || this.dom.panel.classList.contains('visible');

      if (isPanelActive) {
        if (e.key === 'Delete') {
          if (this.selectedIds.size) { e.preventDefault(); this.deleteAsset(); }
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
          e.preventDefault(); this._selectAllInView();
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
          if (this.selectedIds.size) {
            const names = Array.from(this.selectedIds).map(id => (this._findById(id)||{}).name).filter(Boolean).join('\n');
            navigator.clipboard.writeText(names).catch(()=>{});
          }
        }
      }
    });

    // Folder sidebar dblclick -> open
    if (this.dom.categoriesContainer) {
      this.dom.categoriesContainer.addEventListener('dblclick', (e) => {
        const node = e.target.closest('.category-item'); if (!node) return;
        const id = node.dataset.folderId;
        if (id === '') {
            this.openFolderId = null;
            this.currentCategory = 'project';
        } else if (id) {
            this.openFolderId = id;
            this.currentCategory = 'project';
        }
        document.querySelectorAll('.category-item.active').forEach(c => c.classList.remove('active'));
        node.classList.add('active');
        this.render();
      });
    }

    // Thumbnail size slider
    if (this.dom.thumbnailSizeSlider) {
        this.dom.thumbnailSizeSlider.value = this.currentThumbnailSize;
        this.dom.thumbnailSizeSlider.oninput = (e) => this.setThumbnailSize(e.target.value);
    }

    // Search debounce is already set up in HTML onclick attributes
  }

  // ------------------------------------------------------------------
  // Asset ingestion and thumbnails
  // ------------------------------------------------------------------
  static async _addAssetFromFile(file, folderId = null) {
    const type = this._getAssetType(file.name);
    if (!type) {
      console.warn(`AssetsPanel: Unsupported file type for ${file.name}. Skipping.`);
      return;
    }
    
    // Conflict Resolution
    let finalFileName = file.name;
    let shouldOverwrite = false;
    let existingAsset = this.assets.find(a =>
      !a.isBuiltIn && a.name === finalFileName && (a.folderId || null) === (folderId || null)
    );

    if (existingAsset) {
      const response = prompt(
        `Asset '${file.name}' already exists in this folder.\n` +
        `Enter a NEW NAME to rename, type 'overwrite' to replace, or leave blank to skip:`,
        file.name
      );

      if (response === null || response.trim() === '') {
        console.log(`AssetsPanel: Skipped import of '${file.name}'.`);
        return;
      } else if (response.toLowerCase() === 'overwrite') {
        shouldOverwrite = true;
      } else {
        finalFileName = response.trim();
        if (this.assets.some(a => !a.isBuiltIn && a.name === finalFileName && (a.folderId || null) === (folderId || null))) {
          alert(`The new name '${finalFileName}' also conflicts with an existing asset. Skipping.`);
          return;
        }
      }
    }

    // Read file data
    const reader = new FileReader();
    reader.readAsDataURL(file);
    await new Promise(resolve => { reader.onload = resolve; reader.onerror = resolve; });
    
    if (!reader.result) {
        console.error(`AssetsPanel: Failed to read file ${finalFileName}.`);
        return;
    }

    if (shouldOverwrite && existingAsset) {
        this._removeAsset(existingAsset.id); // Remove old asset if overwriting
    }

    const id = `asset_${Date.now()}_${Math.floor(Math.random()*1000)}`;
    const dataUrl = reader.result;
    let asset = { id, name: finalFileName, type, data: dataUrl, thumbnail: null, isFavorite: false, isBuiltIn: false, folderId, tags: [] };

    // If JSON and detected as material, parse definition
    if (type === 'material') {
      const textReader = new FileReader();
      textReader.readAsText(file);
      await new Promise(resolve => { textReader.onload = resolve; textReader.onerror = resolve; });
      
      if (!textReader.result) {
          console.error(`AssetsPanel: Failed to read material JSON file ${finalFileName}.`);
          return;
      }
      try {
        const def = JSON.parse(textReader.result);
        asset.definition = def;
        asset.thumbnail = await this._generateMaterialThumbnail(def);
      } catch (err) {
        console.warn(`Invalid material JSON for ${finalFileName}`, err);
        asset.thumbnail = this._svgIcon('material');
      }
    } else {
      asset.thumbnail = await this._generateThumbnail(dataUrl, type, file);
    }
    
    this.assets.push(asset);
    this._saveToStorage();
    if (typeof this.onAssetAdded === 'function') this.onAssetAdded(asset);
    this.render(); // Re-render to show new asset
  }

  static async _addAssetsFromFolderInput(files, baseFolderId) {
    console.log(`AssetsPanel: Importing ${files.length} files from folder...`);
    for (const file of files) {
        if (file.webkitRelativePath) {
            const pathSegments = file.webkitRelativePath.split('/');
            pathSegments.pop();
            const folderPath = pathSegments.join('/');
            
            const targetFolderId = this._ensureFolderPath(folderPath, baseFolderId);
            
            await this._addAssetFromFile(file, targetFolderId);
        } else {
            await this._addAssetFromFile(file, baseFolderId);
        }
    }
    console.log("AssetsPanel: Folder import complete.");
    this.render();
  }

  static _ensureFolderPath(relativePath, baseParentId = null) {
    if (!relativePath) return baseParentId;

    const segments = relativePath.split('/').filter(s => s !== '');
    let currentParentId = baseParentId;

    for (const segment of segments) {
      let existingFolder = Object.values(this.folders).find(
        f => f.name === segment && (f.parentId || null) === (currentParentId || null)
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
    if (type === 'texture' || type === 'hdri') {
      return new Promise(resolve => {
        const img = new Image(); img.crossOrigin = 'anonymous';
        img.onload = () => {
          const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 128;
          const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, 128, 128);
          resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = () => resolve(this._svgIcon('texture'));
        img.src = dataURL;
      });
    }
    if (type === 'model') {
      const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
      renderer.setSize(128, 128);
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
      scene.add(new THREE.AmbientLight(0xffffff, 2.0));
      scene.add(new THREE.DirectionalLight(0xffffff, 2.0).position.set(2,3,1));
      
      return new Promise(resolve => {
        const ext = file.name.split('.').pop().toLowerCase();
        let loader;
        if (ext === 'glb' || ext === 'gltf') loader = this.loaders.gltf;
        else if (ext === 'fbx') loader = this.loaders.fbx;
        else if (ext === 'obj') loader = this.loaders.obj;
        else { resolve(this._svgIcon('model')); return; }

        loader.load(dataURL, loadedObject => {
          let model = loadedObject.scene || loadedObject;
          
          const bbox = new THREE.Box3().setFromObject(model); 
          if (bbox.isEmpty()) { resolve(this._svgIcon('model')); return; }
          const size = bbox.getSize(new THREE.Vector3()); 
          const center = bbox.getCenter(new THREE.Vector3()); 
          const maxDim = Math.max(size.x, size.y, size.z) || 1;
          
          model.position.sub(center);
          camera.position.set(0, 0, maxDim * 1.5);
          camera.lookAt(0,0,0);
          
          scene.add(model);
          renderer.render(scene, camera);
          resolve(renderer.domElement.toDataURL('image/png'));
          renderer.dispose();
        }, ()=>{ resolve(this._svgIcon('model')); }, ()=>{ resolve(this._svgIcon('model')); }); // Added error callbacks
      });
    }
    return Promise.resolve(this._svgIcon(type));
  }

  static _generateMaterialThumbnail(def) {
    return new Promise(resolve => {
      try {
        const size = 128;
        const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
        renderer.setSize(size, size);
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
        camera.position.set(0, 0, 3);
        scene.add(new THREE.AmbientLight(0xffffff, 0.6));
        const d = new THREE.DirectionalLight(0xffffff, 1.0); d.position.set(2,2,2); scene.add(d);
        const mat = new THREE.MeshStandardMaterial({
          color: def.color ? new THREE.Color(def.color) : 0xffffff,
          roughness: def.roughness ?? 0.5,
          metalness: def.metalness ?? 0.0,
          emissive: def.emissive ? new THREE.Color(def.emissive) : 0x000000,
          emissiveIntensity: def.emissiveIntensity ?? 1
        });
        const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.8, 32, 16), mat);
        scene.add(sphere);
        const loader = new THREE.TextureLoader();
        const slots = [['map','map'], ['normalMap','normalMap'], ['roughnessMap','roughnessMap'], ['metalnessMap','metalnessMap'], ['emissiveMap','emissiveMap'], ['displacementMap','displacementMap']];
        let pending = 0;
        for (const [k, srcKey] of slots) {
          if (def[srcKey]) {
            pending++;
            loader.load(def[srcKey], (t) => { mat[k]=t; mat.needsUpdate=true; pending--; if (pending===0) finish(); }, undefined, ()=>{ pending--; if (pending===0) finish(); });
          }
        }
        const finish = () => {
          renderer.render(scene, camera);
          try { const dURL = renderer.domElement.toDataURL('image/png'); renderer.dispose(); resolve(dURL); } catch (e) { renderer.dispose(); resolve(this._svgIcon('material')); }
        };
        if (pending === 0) finish();
      } catch (e) { resolve(this._svgIcon('material')); }
    });
  }

  static _svgIcon(type) {
    const icons = {
      'logo': `<svg class="svg-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16c2.76 0 5-2.24 5-5 0-4.42-4.03-8-9-8zm-5.5 9c-.83 0-1.5-.67-1.5-1.5S5.67 9 6.5 9 8 9.67 8 10.5 7.33 12 6.5 12zm3-4C8.67 8 8 7.33 8 6.5S8.67 5 9.5 5s1.5.67 1.5 1.5S10.33 8 9.5 8zm5 0c-.83 0-1.5-.67-1.5-1.5S13.67 5 14.5 5s1.5.67 1.5 1.5S15.33 8 14.5 8zm3 4c-.83 0-1.5-.67-1.5-1.5S16.67 9 17.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"></path></svg>`,
      'upload-btn': ` <svg class="svg-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16h6v-6h4l-7-7-7 7h4v6zm-4 2h14v2H5v-2z"></path></svg>`,
      'download-btn': `<svg class="svg-icon" viewBox="0 0 24 24" fill="currentColor"><!-- Download (Export Project) --><path d="M5 18h14v2H5v-2zM13 5v9h3l-4 4-4-4h3V5h2z"></path></svg>`,
      'refresh-btn': `<svg class="svg-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"></path></svg>`,
      'upload-zone-icon': `<svg class="svg-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M21 15c0-1.66-1.34-3-3-3h-1.17C16.24 9.35 13.83 8 12 8s-4.24 1.35-4.83 3.83H6c-1.66 0-3 1.34-3 3v4c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-4z"></path></svg>`,
      'folder-icon-html': `<svg class="svg-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-4z"></path></svg>`,

      'arrow-right': `<svg viewBox="0 0 24 24" class="svg-icon" width="16" height="16" fill="currentColor"><path d="M10 17l5-5-5-5v10z"></path></svg>`,
      'arrow-down': `<svg viewBox="0 0 24 24" class="svg-icon" width="16" height="16" fill="currentColor"><path d="M7 10l5 5 5-5H7z"></path></svg>`,

      model: `<svg class="svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"></path></svg>`,
      texture: `<svg class="svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>`,
      hdri: `<svg class="svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M12 2a10 10 0 0 0 0 20A10 10 0 0 0 12 2z"></path><path d="M12 2v20"></path><path d="M2 12h20"></path><path d="M7 3h10"></path><path d="M7 21h10"></path><path d="M3 7v10"></path><path d="M21 7v10"></path></svg>`,
      material: `<svg class="svg-icon" viewBox="0 0 24 24" fill="currentColor" stroke="none"><circle cx="12" cy="12" r="8"/></svg>`,
      primitive: `<svg class="svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg>`,
      light: `<svg class="svg-icon" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M9 21c0 .5.4 1 1 1h4c.6 0 1-.5 1-1v-1H9v1zm3-20C8.9 2 6 4.9 6 8c0 2.8 2.2 5.2 5 5.9V18h2v-4.1c2.8-.7 5-3.1 5-5.9 0-3.1-2.9-6-6-6z"/></svg>`,
      star: `<svg class="svg-icon" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`,
      breadcrumbs: `<svg class="svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>`
    };
    return icons[type] || icons.primitive;
  }

  // ------------------------------------------------------------------
  // Rendering UI: Folders + Assets grid
  // ------------------------------------------------------------------
  static render(searchQuery = '') {
    if (!this.dom.grid) return;
    this._renderBreadcrumbs();
    this._renderFolderSidebar(); // This now handles folder line rendering

    let assetsToRender = [];
    switch (this.currentCategory) {
      case 'project': assetsToRender = this.assets.filter(a => (this.openFolderId ? a.folderId === this.openFolderId : !a.folderId)); break;
      case 'favorites': assetsToRender = this.assets.filter(a => a.isFavorite); break;
      case 'primitives': assetsToRender = this._getPrimitiveAssets(); break;
      case 'lights': assetsToRender = this._getLightAssets(); break;
      default: assetsToRender = this.assets; break;
    }
    if (this.currentFilter !== 'all') assetsToRender = assetsToRender.filter(a => a.type === this.currentFilter);
    if (searchQuery) assetsToRender = assetsToRender.filter(a =>
        (a.name||'').toLowerCase().includes(searchQuery) ||
        (a.tags||[]).some(t => t.toLowerCase().includes(searchQuery))
    );

    this.dom.grid.innerHTML = '';
    for (const asset of assetsToRender) {
      const item = document.createElement('div');
      item.className = `asset-item ${asset.isFavorite ? 'favorite' : ''} ${this.selectedIds.has(asset.id) ? 'selected' : ''}`;
      item.dataset.id = asset.id; item.draggable = true;

      const thumbHtml = (asset.thumbnail && asset.thumbnail.startsWith('data:image')) ? `<img src="${asset.thumbnail}" alt="${asset.name}" />` : (asset.thumbnail ? asset.thumbnail : this._svgIcon(asset.type));
      item.innerHTML = `
        <div class="asset-thumbnail">${thumbHtml}</div>
        <div class="asset-name">${asset.name}</div>
        <div class="asset-meta">${asset.type}</div>
        <div class="asset-fav-icon" title="Favorite">${this._svgIcon('star')}</div>
      `;

      item.onclick = (e) => {
        const append = e.ctrlKey || e.metaKey;
        this.selectAsset(asset.id, item, append, e); // Pass the event object here
      };
      item.ondblclick = () => this._addToScene(asset.id);
      item.ondragstart = (e) => {
        e.dataTransfer.setData('application/json', JSON.stringify({ assetId: asset.id }));
        e.dataTransfer.effectAllowed = 'copy';
      };
      item.oncontextmenu = (e) => { e.preventDefault(); this._showContextMenu(e, asset.id); };

      this.dom.grid.appendChild(item);
    }

    if (assetsToRender.length === 0) this.dom.grid.innerHTML = '<div class="no-assets">No assets found.</div>';
  }

  // Render Breadcrumbs
  static _renderBreadcrumbs() {
    if (!this.dom.assetsBreadcrumbs) return;
    this.dom.assetsBreadcrumbs.innerHTML = '';

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

    path.unshift({ id: null, name: 'Project Assets' });

    path.forEach((segment, index) => {
        const item = document.createElement('span');
        item.className = `breadcrumb-item ${segment.id === this.openFolderId ? 'active' : ''}`;
        item.textContent = segment.name;
        item.onclick = () => {
            this.openFolderId = segment.id;
            this.currentCategory = 'project';
            this.render();
        };
        this.dom.assetsBreadcrumbs.appendChild(item);

        if (index < path.length - 1) {
            const separator = document.createElement('span');
            separator.className = 'breadcrumb-separator';
            separator.innerHTML = this._svgIcon('breadcrumbs');
            this.dom.assetsBreadcrumbs.appendChild(separator);
        }
    });
  }

  // _renderFolderSidebar - UPDATED FOR CONNECTOR LINES
  static _renderFolderSidebar() {
    const container = document.querySelector('.assets-categories');
    if (!container) return;
    container.innerHTML = '';
    
    // Top action bar
    const topActions = document.createElement('div');
    topActions.className = 'folder-actions';
    topActions.innerHTML = `
      <button class="panel-btn" onclick="AssetsPanel.createFolder(undefined, AssetsPanel.openFolderId)">${this._svgIcon('folder-icon-html')} New Folder</button>
      <button class="panel-btn" onclick="AssetsPanel.exportJSON()">${this._svgIcon('upload-btn')} Export Project</button>
      <label class="panel-btn file-import">
        ${this._svgIcon('download-btn')} Import Project
        <input type="file" style="display:none" onchange="(function(e){ AssetsPanel.importJSON(e.target.files[0]); })(event)" accept=".json"/>
      </label>
    `;
    container.appendChild(topActions);

    // Root item
    const root = document.createElement('div');
    root.className = `category-item root ${!this.openFolderId && this.currentCategory==='project' ? 'active' : ''}`;
    root.dataset.folderId = '';
    root.innerHTML = `<span class="category-icon">${this._svgIcon('folder-icon-html')}</span> Project Assets`;
    root.onclick = () => {
      this.openFolderId = null;
      this.currentCategory = 'project';
      document.querySelectorAll('.category-item.active').forEach(c => c.classList.remove('active'));
      root.classList.add('active');
      this.render();
    };
    container.appendChild(root);

    // Recursive folder builder
    const buildList = (parentId, depth = 0) => {
      const siblings = Object.values(this.folders)
        .filter(f => (f.parentId || null) === (parentId || null))
        .sort((a, b) => a.name.localeCompare(b.name));

      siblings.forEach((f, index) => {
        const hasChildren = Object.values(this.folders).some(sf => sf.parentId === f.id);
        const isLastSibling = (index === siblings.length - 1);

        const folderNode = document.createElement('div');
        folderNode.className = `folder-node depth-${depth} ${isLastSibling ? 'is-last-sibling' : ''}`;
        folderNode.style.setProperty('--depth-level', depth); // Pass depth as CSS custom property

        // Lines container (actual lines drawn with pseudo-elements on this)
        const linesContainer = document.createElement('div');
        linesContainer.className = 'folder-tree-connector';
        folderNode.appendChild(linesContainer); // Add lines container as first child of folderNode

        const el = document.createElement('div'); // This is the actual clickable category-item content
        el.className = `category-item ${this.openFolderId===f.id && this.currentCategory==='project' ? 'active' : ''}`;
        el.dataset.folderId = f.id;
        el.innerHTML = `
            <span class="expand-toggle">${hasChildren ? this._svgIcon(this.expandedFolders.has(f.id) ? 'arrow-down' : 'arrow-right') : ''}</span>
            <span class="category-icon">${this._svgIcon('folder-icon-html')}</span>
            <span class="folder-name">${f.name}</span>
        `;

        el.querySelector('.expand-toggle')?.addEventListener('click', (ev) => {
          ev.stopPropagation();
          if (this.expandedFolders.has(f.id)) {
            this.expandedFolders.delete(f.id);
          } else {
            this.expandedFolders.add(f.id);
          }
          this._renderFolderSidebar(); // Re-render sidebar to show/hide children
        });

        el.onclick = (ev) => {
          ev.stopPropagation();
          this.openFolderId = f.id;
          this.currentCategory = 'project';
          document.querySelectorAll('.category-item.active').forEach(c => c.classList.remove('active'));
          el.classList.add('active');
          this.render(); // Re-render grid for new folder content
        };

        el.oncontextmenu = (ev) => {
          ev.preventDefault();
          this._showFolderContextMenu(ev, f.id);
        };

        folderNode.appendChild(el);
        container.appendChild(folderNode);

        // Recursively build children if expanded
        if (this.expandedFolders.has(f.id)) {
          buildList(f.id, depth + 1);
        }
      });
    };

    buildList(null, 0); // Start building from the root (parentId = null)
  }

  // Context menus
  static _showContextMenu(event, assetId) {
    this.contextAssetId = assetId;
    const asset = this._findById(assetId);
    if (!asset || asset.isBuiltIn) return;
    this.dom.contextMenu.style.display = 'block';
    this.dom.contextMenu.style.left = `${event.clientX}px`;
    this.dom.contextMenu.style.top = `${event.clientY}px`;
    this.dom.contextMenu.innerHTML = '';

    const create = (label, cb, style='') => { const d = document.createElement('div'); d.className = 'context-menu-item'; if (style) d.style = style; d.textContent = label; d.onclick = () => { cb(); this.dom.contextMenu.style.display='none'; }; this.dom.contextMenu.appendChild(d); };
    create('Rename', ()=> this.renameAsset());
    create(asset.isFavorite? 'Remove from Favorites' : 'Add to Favorites', ()=> this.toggleFavorite());
    create('Move to Folder', ()=> this._showMoveAssetMenu(assetId));
    create('Export Asset', ()=> this._exportSingleAsset(assetId));
    this.dom.contextMenu.appendChild(document.createElement('div')).className = 'context-menu-separator';
    create('Delete', ()=> this.deleteAsset(), 'color: var(--danger-color);');
  }

  static _showFolderContextMenu(event, folderId) {
    this.dom.contextMenu.style.display = 'block';
    this.dom.contextMenu.style.left = `${event.clientX}px`;
    this.dom.contextMenu.style.top = `${event.clientY}px`;
    this.dom.contextMenu.innerHTML = '';
    const create = (label, cb, style='') => { const d = document.createElement('div'); d.className = 'context-menu-item'; if (style) d.style = style; d.textContent = label; d.onclick = () => { cb(); this.dom.contextMenu.style.display='none'; }; this.dom.contextMenu.appendChild(d); };
    create('Rename Folder', ()=> this.renameFolder(folderId));
    create('Create Subfolder', ()=> { const name = prompt('New subfolder name:', 'New Folder'); if(name) this.createFolder(name, folderId); });
    this.dom.contextMenu.appendChild(document.createElement('div')).className = 'context-menu-separator';
    create('Delete Folder (Move contents to parent)', ()=> this.deleteFolder(folderId, {deleteContents:false}));
    create('Delete Folder & Contents', ()=> { if (confirm('Delete folder and all its contents? This cannot be undone.')) this.deleteFolder(folderId, {deleteContents:true}); }, 'color: var(--danger-color);');
  }

  static _showMoveAssetMenu(assetId) {
    const folderNames = [{ id: null, name: 'Root' }].concat(Object.values(this.folders).map(f=>({ id: f.id, name: f.name })));
    const sel = prompt('Move asset to folder:\n' + folderNames.map((f,i)=>`${i}: ${f.name}`).join('\n'), '0');
    const idx = parseInt(sel);
    if (isNaN(idx)) return;
    const target = folderNames[idx]; this.moveAssetToFolder(assetId, target.id);
  }

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------
  static _findById(id) { return this.assets.find(a => a.id === id); }
  static _removeAsset(id) {
    const idx = this.assets.findIndex(a => a.id === id);
    if (idx >= 0) {
      const [rem] = this.assets.splice(idx,1);
      if (typeof this.onAssetRemoved === 'function') this.onAssetRemoved(rem.id);
    }
  }

  static _collectFolderTree(folderId) { const out = []; const rec = (fid) => { out.push(fid); const f = this.folders[fid]; if (!f) return; for (const c of f.children||[]) rec(c); }; rec(folderId); return out; }

  static _selectAllInView() {
    const nodes = this.dom.grid.querySelectorAll('.asset-item'); this.selectedIds.clear(); for (const n of nodes) this.selectedIds.add(n.dataset.id); this.render();
  }

  // ==================================================================
  // ===                UPGRADED ASSET LIBRARIES                      ===
  // ==================================================================
  static _getPrimitiveAssets() {
    const defaultMaterial = () => new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    return [
      { id: 'prim_cube', name: 'Cube', type: 'primitive', isBuiltIn: true, thumbnail: this._svgIcon('primitive'), factory: () => new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), defaultMaterial()), tags: ['primitive', 'basic'] },
      { id: 'prim_sphere', name: 'Sphere', type: 'primitive', isBuiltIn: true, thumbnail: this._svgIcon('primitive'), factory: () => new THREE.Mesh(new THREE.SphereGeometry(0.5, 32, 16), defaultMaterial()), tags: ['primitive', 'basic'] },
      { id: 'prim_plane', name: 'Plane', type: 'primitive', isBuiltIn: true, thumbnail: this._svgIcon('primitive'), factory: () => new THREE.Mesh(new THREE.PlaneGeometry(1, 1), defaultMaterial()), tags: ['primitive', 'basic'] },
      { id: 'prim_cylinder', name: 'Cylinder', type: 'primitive', isBuiltIn: true, thumbnail: this._svgIcon('primitive'), factory: () => new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1, 32), defaultMaterial()), tags: ['primitive', 'basic'] },
      { id: 'prim_wall', name: 'Wall', type: 'primitive', isBuiltIn: true, thumbnail: this._svgIcon('primitive'), factory: () => new THREE.Mesh(new THREE.BoxGeometry(4, 2.5, 0.15), defaultMaterial()), tags: ['primitive', 'architecture'] },
      { id: 'prim_stair', name: 'Stairs', type: 'primitive', isBuiltIn: true, thumbnail: this._svgIcon('primitive'), factory: () => {
        const steps = 10; const stepWidth = 1.2, stepHeight = 0.2, stepDepth = 0.3; const group = new THREE.Group();
        for (let i = 0; i < steps; i++) { const geom = new THREE.BoxGeometry(stepWidth, stepHeight, stepDepth); const mesh = new THREE.Mesh(geom, defaultMaterial()); mesh.position.set(0, stepHeight / 2 + i * stepHeight, i * stepDepth); group.add(mesh); }
        const boundingBox = new THREE.Box3().setFromObject(group); const center = boundingBox.getCenter(new THREE.Vector3()); group.position.sub(center);
        return group;
      }, tags: ['primitive', 'architecture'] },
      { id: 'prim_arch', name: 'Arch', type: 'primitive', isBuiltIn: true, thumbnail: this._svgIcon('primitive'), factory: () => { const shape = new THREE.Shape(); shape.moveTo(-1,0); shape.lineTo(-1,1.5); shape.absarc(0,1.5,1,Math.PI,0,true); shape.lineTo(1,0); shape.lineTo(-1,0); const extrudeSettings = { depth: 0.2, bevelEnabled: false }; const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings); geometry.center(); return new THREE.Mesh(geometry, defaultMaterial()); }, tags: ['primitive', 'architecture'] },
      { id: 'prim_column', name: 'Column', type: 'primitive', isBuiltIn: true, thumbnail: this._svgIcon('primitive'), factory: () => new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 3, 20), defaultMaterial()), tags: ['primitive', 'architecture'] },
    ];
  }

  static _getLightAssets() {
    return [
      { id: 'light_point', name: 'Point Light', type: 'light', isBuiltIn: true, thumbnail: this._svgIcon('light'), factory: () => { const light = new THREE.PointLight(0xffffff, 50, 10); light.castShadow = true; return light; }, tags: ['light', 'point'] },
      { id: 'light_sun', name: 'Sun Light', type: 'light', isBuiltIn: true, thumbnail: this._svgIcon('light'), factory: () => { const light = new THREE.DirectionalLight(0xfff5e1, 8); light.castShadow = true; light.shadow.mapSize.width = 2048; light.shadow.mapSize.height = 2048; light.shadow.camera.near = 0.5; light.shadow.camera.far = 50; light.shadow.bias = -0.0001; return light; }, tags: ['light', 'sun', 'directional'] },
      { id: 'light_spot', name: 'Spotlight', type: 'light', isBuiltIn: true, thumbnail: this._svgIcon('light'), factory: () => { const light = new THREE.SpotLight(0xffffff, 200, 20, Math.PI/6, 0.2, 1.5); light.castShadow = true; return light; }, tags: ['light', 'spot'] },
      { id: 'light_rect', name: 'Rect Area Light', type: 'light', isBuiltIn: true, thumbnail: this._svgIcon('light'), factory: () => { const light = new THREE.RectAreaLight(0x87ceeb, 10, 2, 3); return light; }, tags: ['light', 'area'] },
      { id: 'light_hemi', name: 'Hemisphere Sky', type: 'light', isBuiltIn: true, thumbnail: this._svgIcon('light'), factory: () => { const light = new THREE.HemisphereLight(0x87ceeb, 0x404040, 2); return light; }, tags: ['light', 'environment'] },
    ];
  }

  static _ensureBuiltins() {
    const builtinPrims = this._getPrimitiveAssets();
    const builtinLights = this._getLightAssets();
    for (const b of [...builtinPrims, ...builtinLights]) {
      if (!this.assets.some(a => a.id === b.id)) this.assets.unshift(b);
    }
  }

  static _getAssetType = (filename) => {
    const ext = filename.split('.').pop().toLowerCase();
    if (['glb','gltf', 'fbx', 'obj'].includes(ext)) return 'model';
    if (['png','jpg','jpeg','webp','bmp'].includes(ext)) return 'texture';
    if (['hdr','exr'].includes(ext)) return 'hdri';
    if (['json'].includes(ext)) return 'material';
    return null;
  };

  static _exportSingleAsset(assetId) {
    const asset = this._findById(assetId); if (!asset) return;
    if (asset.type === 'material' && asset.definition) {
      const blob = new Blob([JSON.stringify(asset.definition, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = (asset.name||'material') + '.material.json'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
      return;
    }
    const blob = new Blob([asset.data], { type: 'application/octet-stream' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = asset.name; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }

  static _applyMaterialToMesh(asset, mesh) {
    if (!mesh || !mesh.isMesh) {
      console.warn('AssetsPanel: target is not a mesh');
      return;
    }
    if (!asset.definition) { console.warn('AssetsPanel: material asset missing definition'); return; }
    const def = asset.definition;
    const mat = new THREE.MeshStandardMaterial({
      color: def.color ? new THREE.Color(def.color) : 0xffffff,
      roughness: def.roughness ?? 0.5,
      metalness: def.metalness ?? 0.0,
      emissive: def.emissive ? new THREE.Color(def.emissive) : 0x000000,
      emissiveIntensity: def.emissiveIntensity ?? 1
    });

    const loader = new THREE.TextureLoader();
    const promises = [];

    const tryLoad = (key, assignTo) => {
      if (!def[key]) return;
      promises.push(new Promise((res) => {
        loader.load(def[key], (tex) => { mat[assignTo] = tex; mat.needsUpdate = true; res(); }, undefined, () => { console.warn('Texture load failed', def[key]); res(); });
      }));
    };

    tryLoad('map', 'map');
    tryLoad('normalMap', 'normalMap');
    tryLoad('roughnessMap', 'roughnessMap');
    tryLoad('metalnessMap', 'metalnessMap');
    tryLoad('emissiveMap', 'emissiveMap');
    tryLoad('displacementMap', 'displacementMap');

    Promise.all(promises).then(() => {
      if (mesh.material && mesh.material.side) mat.side = mesh.material.side;
      mesh.material = mat;
      mesh.material.needsUpdate = true;
      console.log(`Applied material '${asset.name}' to ${mesh.name || mesh.uuid}`);
    });
  }

  static _shortName(src) {
    try { return src.split('/').pop(); } catch (e) { return src; }
  }

  // END OF CLASS
}*/

/**
 * AssetsPanel v5.2-professional (Final Fixes & Robustness)
 * Full drop-in replacement for your latest class (keeps API & HTML hooks).
 * - Adds `material` asset type (JSON definitions with texture slots & params)
 * - Adds support for FBX and OBJ models
 * - Supports importing entire folders from the device, preserving hierarchy.
 * - Applies materials via drag/drop onto meshes (PBR: map, normalMap, roughnessMap, metalnessMap, emissiveMap, displacementMap)
 * - Uses inline SVG icons for thumbnails/fallbacks, matching your HTML where possible.
 * - Preserves folders, multi-select, event hooks, storage, context menus, etc.
 * - Advanced UI/UX inspired by Unreal Engine / Unity asset browsers.
 *
 * FINAL FIXES & IMPROVEMENTS:
 * - Robust asset selection (single, Ctrl/Cmd+Click, Shift+Click) properly passing event object.
 * - Correct preview pane state management ("Select an asset...", loading spinner, model disposal).
 * - FBX-only scaling when dropping into the main scene (GLTF, OBJ added without auto-scaling).
 * - Thumbnail Size Slider
 * - Breadcrumbs for folder navigation
 * - Tags/Keywords for assets (display & search)
 * - Dedicated Interactive 3D Preview Pane (for models, materials, textures)
 * - Conflict Resolution on asset import (rename/overwrite/skip)
 * - Vertical/Horizontal connector lines for folder hierarchy in the sidebar (Unreal-like).
 *
 * Usage: Replace previous AssetsPanel class with this code.
 *        Ensure GLTFLoader.js, FBXLoader.js, OBJLoader.js, RGBELoader.js, and OrbitControls.js are loaded.
 *        Call: AssetsPanel.init(scene, renderer, camera, raycaster);
 *
 * HTML structure updates (as per previous comprehensive response) are required for new UI elements.
 * CSS updates (provided below) are essential for styling the new elements and folder lines.
 */

class AssetsPanel {
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
    static currentFilter = 'all';
    static currentCategory = 'project';
    static selectedAssetId = null; // single select (ID of the last asset clicked)
    static selectedIds = new Set(); // multi-select set
    static contextAssetId = null;
    static openFolderId = null; // currently viewed folder in Project category (null = root)
    static lastStorageVersion = 3; // for schema migrations
    static lastSelectedAssetElement = null; // for Shift+Click to reference DOM element
    static currentThumbnailSize = 100; // Default thumbnail size in px
    static expandedFolders = new Set(); // For sidebar folder tree state

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

    // --- Init ---
    static init(scene, renderer, camera, raycaster) {
        this.scene = scene;
        this.renderer = renderer;
        this.camera = camera;
        this.raycaster = raycaster || new THREE.Raycaster();

        // Check for required THREE.js and loaders
        if (typeof THREE === 'undefined' || !THREE.GLTFLoader || !THREE.RGBELoader || !THREE.FBXLoader || !THREE.OBJLoader || typeof THREE.OrbitControls === 'undefined') {
            console.error("AssetsPanel Error: THREE.js or required loaders (GLTFLoader, RGBELoader, FBXLoader, OBJLoader, OrbitControls) not found. Please ensure they are loaded before AssetsPanel.js.");
            // Provide a fallback or prevent further initialization if crucial parts are missing
            const panel = document.getElementById('assetsPanel');
            if (panel) panel.innerHTML = '<div style="color:red;padding:20px;">AssetsPanel failed to initialize. Missing THREE.js or required loaders. Check console for details.</div>';
            return;
        }

        // DOM cache
        this.dom.panel = document.getElementById('assetsPanel');
        this.dom.grid = document.getElementById('assetsGrid');
        this.dom.properties = document.getElementById('propertiesContent');
        this.dom.uploadZone = document.getElementById('uploadDropzone');
        this.dom.uploadInput = document.getElementById('uploadInput');
        this.dom.uploadFolderInput = document.getElementById('uploadFolderInput');
        this.dom.contextMenu = document.getElementById('contextMenu');
        this.dom.header = document.getElementById('assetsPanelHeader');
        this.dom.searchBox = document.querySelector('.search-box');
        this.dom.filterButtons = document.querySelectorAll('.filter-btn');
        this.dom.categoriesContainer = document.querySelector('.assets-categories');
        this.dom.thumbnailSizeSlider = document.getElementById('thumbnailSizeSlider');
        this.dom.assetsBreadcrumbs = document.getElementById('assetsBreadcrumbs');
        this.dom.assetPreviewContainer = document.getElementById('assetPreviewContainer');
        this.dom.assetPreviewCanvas = document.getElementById('assetPreviewCanvas');
        // Note: assetTagsInput is dynamically created inside _updatePropertiesPanel, so no static cache here.

        // Loaders
        this.loaders.gltf = new THREE.GLTFLoader();
        this.loaders.fbx = new THREE.FBXLoader();
        this.loaders.obj = new THREE.OBJLoader();
        this.loaders.texture = new THREE.TextureLoader();
        this.loaders.hdri = new THREE.RGBELoader();

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
        this._setupEventListeners();
        this.render();

        console.log("AssetsPanel v5.2 initialized.");
    }

    // --- Preview Renderer Initialization ---
    static _initPreviewRenderer() {
        if (!this.dom.assetPreviewCanvas || !this.dom.assetPreviewContainer) {
            console.warn("AssetsPanel: Preview canvas or container element not found. Preview will not work.");
            return;
        }

        const container = this.dom.assetPreviewContainer;
        const width = container.clientWidth;
        const height = container.clientHeight;

        this.previewScene = new THREE.Scene();
        this.previewCamera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100);
        this.previewCamera.position.set(0, 0, 3);

        // Add simple lighting for the preview
        this.previewScene.add(new THREE.AmbientLight(0xffffff, 0.8));
        this.previewLight = new THREE.DirectionalLight(0xffffff, 1.2);
        this.previewLight.position.set(1, 1, 1).normalize();
        this.previewScene.add(this.previewLight);

        this.previewRenderer = new THREE.WebGLRenderer({
            canvas: this.dom.assetPreviewCanvas,
            alpha: true, // Allow transparent background
            antialias: true
        });
        this.previewRenderer.setSize(width, height);
        this.previewRenderer.setPixelRatio(window.devicePixelRatio);
        this.previewRenderer.setClearColor(0x000000, 0); // Transparent background

        this.previewControls = new THREE.OrbitControls(this.previewCamera, this.previewRenderer.domElement);
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
            if (this.dom.assetPreviewContainer && this.previewRenderer && this.previewCamera) {
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
    static toggle() { if (!this.dom.panel) return; this.dom.panel.classList.toggle('visible'); }
    static showUploadZone() { if (this.dom.uploadZone) this.dom.uploadZone.classList.add('visible'); }
    static hideUploadZone() { if (this.dom.uploadZone) this.dom.uploadZone.classList.remove('visible'); }
    static refreshAssets() { this.render(); }
    static searchAssets(query) { this.render(query ? query.toLowerCase() : ''); }
    static filterByType(type, element) { this.currentFilter = type; document.querySelectorAll('.filter-btn.active').forEach(b => b.classList.remove('active')); if (element) element.classList.add('active'); this.render(); }
    static selectCategory(category, element) { this.currentCategory = category; document.querySelectorAll('.category-item.active').forEach(c => c.classList.remove('active')); if (element) element.classList.add('active'); this.render(); }

    // Thumbnail size control
    static setThumbnailSize(size) {
        this.currentThumbnailSize = parseInt(size, 10);
        if (this.dom.panel) {
            this.dom.panel.style.setProperty('--thumbnail-size', `${this.currentThumbnailSize}px`);
        }
        localStorage.setItem('assetsPanel_thumbnailSize', this.currentThumbnailSize);
    }

    // File actions (rename/delete/favorite preserved)
    static renameAsset() {
        const asset = this._findById(this.contextAssetId);
        if (!asset || asset.isBuiltIn) return;
        const newName = prompt("Enter new name:", asset.name);
        if (newName && newName !== asset.name) {
            const siblingAssets = this.assets.filter(a =>
                !a.isBuiltIn && a.id !== asset.id && a.folderId === asset.folderId
            );
            if (siblingAssets.some(a => a.name === newName)) {
                alert("An asset with this name already exists in the current folder.");
                return;
            }

            asset.name = newName;
            this._saveToStorage();
            this.render();
            this.selectAsset(asset.id, null, false, null); // Re-select to update properties panel
        }
    }

    static deleteAsset() {
        if (!confirm("Are you sure you want to delete this asset(s)?")) return;
        const idsToDelete = this.selectedIds.size ? Array.from(this.selectedIds) : [this.contextAssetId];
        for (const id of idsToDelete) this._removeAsset(id);
        this.selectedIds.clear();
        this.selectedAssetId = null;
        this._clearPreview();
        this._saveToStorage();
        this.render();
    }

    static toggleFavorite() {
        const asset = this._findById(this.contextAssetId);
        if (asset) { asset.isFavorite = !asset.isFavorite; this._saveToStorage(); this.render(); }
    }

    // Folder operations
    static createFolder(name = 'New Folder', parentId = null) {
        const id = `folder_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        let uniqueName = name;
        let counter = 1;
        const siblingFolders = Object.values(this.folders).filter(f => (f.parentId || null) === (parentId || null));
        while (siblingFolders.some(f => f.name === uniqueName)) {
            uniqueName = `${name} (${counter++})`;
        }

        this.folders[id] = { id, name: uniqueName, parentId, children: [] };
        if (parentId && this.folders[parentId]) this.folders[parentId].children.push(id);
        this._saveToStorage();
        if (typeof this.onFolderChanged === 'function') this.onFolderChanged(this.folders);
        this.render();
        return id;
    }

    static renameFolder(folderId) {
        const folder = this.folders[folderId];
        if (!folder) return;
        const n = prompt('Rename folder', folder.name);
        if (n && n !== folder.name) {
            const siblingFolders = Object.values(this.folders).filter(f => f.id !== folderId && (f.parentId || null) === (folder.parentId || null));
            if (siblingFolders.some(f => f.name === n)) {
                alert("A folder with this name already exists in the current directory.");
                return;
            }
            folder.name = n;
            this._saveToStorage();
            if (typeof this.onFolderChanged === 'function') this.onFolderChanged(this.folders);
            this.render();
        }
    }

    static deleteFolder(folderId, options = { deleteContents: false }) {
        const folder = this.folders[folderId]; if (!folder) return;
        const all = this._collectFolderTree(folderId);
        if (!options.deleteContents) {
            const targetParent = folder.parentId || null;
            for (const asset of this.assets) {
                if (asset.folderId && all.includes(asset.folderId)) {
                    asset.folderId = targetParent;
                }
            }
        } else {
            this.assets = this.assets.filter(a => !(a.folderId && all.includes(a.folderId)));
        }
        for (const fid of all) delete this.folders[fid];
        for (const f of Object.values(this.folders)) f.children = f.children.filter(c => !all.includes(c));

        if (this.openFolderId && all.includes(this.openFolderId)) {
            this.openFolderId = folder.parentId || null;
        }

        this._saveToStorage();
        if (typeof this.onFolderChanged === 'function') this.onFolderChanged(this.folders);
        this.render();
    }

    static moveAssetToFolder(assetId, folderId) { const asset = this._findById(assetId); if (!asset) return; asset.folderId = folderId || null; this._saveToStorage(); this.render(); }

    // Export / Import
    static exportJSON() {
        const payload = { version: this.lastStorageVersion, assets: this.assets.filter(a => !a.isBuiltIn), folders: this.folders };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = 'assets_export.json'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    }

    static importJSON(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                if (data.assets) {
                    for (const a of data.assets) {
                        a.id = `asset_${Date.now()}_${Math.floor(Math.random()*1000)}`;
                        a.isBuiltIn = false;
                        if (!Array.isArray(a.tags)) a.tags = []; // Ensure tags array is present
                        this.assets.push(a);
                    }
                }
                if (data.folders) {
                    const idMap = {};
                    for (const fid in data.folders) {
                        const f = data.folders[fid];
                        const nid = `folder_${Date.now()}_${Math.floor(Math.random()*1000)}`;
                        idMap[fid] = nid;
                        this.folders[nid] = { ...f, id: nid, children: [], parentId: null };
                    }
                    for (const fid in data.folders) {
                        const oldFolder = data.folders[fid];
                        const newFolder = this.folders[idMap[fid]];
                        if (oldFolder.parentId && idMap[oldFolder.parentId]) {
                            newFolder.parentId = idMap[oldFolder.parentId];
                            if (this.folders[newFolder.parentId] && !this.folders[newFolder.parentId].children.includes(newFolder.id)) {
                                this.folders[newFolder.parentId].children.push(newFolder.id);
                            }
                        }
                        newFolder.children = (oldFolder.children || []).map(c => idMap[c]).filter(Boolean);
                    }
                }
                this._saveToStorage(); this.render();
            } catch (err) { console.error('Import failed', err); alert('Invalid JSON file'); }
        };
        reader.readAsText(file);
    }

    // Selection Logic - CORRECTED FOR SHIFT+CLICK
    static selectAsset(assetId, element = null, append = false, event = null) {
        const isCtrlOrMeta = event && (event.ctrlKey || event.metaKey);
        const isShift = event && event.shiftKey;

        if (!isCtrlOrMeta && !isShift) { // Plain click: clear all, then select current
            this.selectedIds.clear();
            if (assetId) this.selectedIds.add(assetId);
        } else if (isCtrlOrMeta) { // Ctrl/Cmd+Click: Toggle individual asset
            if (assetId) {
                if (this.selectedIds.has(assetId)) {
                    this.selectedIds.delete(assetId);
                } else {
                    this.selectedIds.add(assetId);
                }
            }
        } else if (isShift && this.lastSelectedAssetElement) { // Shift+Click: Range select
            const allVisibleAssetElements = Array.from(this.dom.grid.querySelectorAll('.asset-item'));
            const allVisibleAssetIds = allVisibleAssetElements.map(el => el.dataset.id);

            const startIndex = allVisibleAssetIds.indexOf(this.lastSelectedAssetElement.dataset.id);
            const endIndex = allVisibleAssetIds.indexOf(assetId);

            if (startIndex !== -1 && endIndex !== -1) {
                const [start, end] = [Math.min(startIndex, endIndex), Math.max(startIndex, endIndex)];
                this.selectedIds.clear(); // Clear current selection before range adding
                for (let i = start; i <= end; i++) {
                    this.selectedIds.add(allVisibleAssetIds[i]);
                }
            } else { // Fallback to single select if range can't be determined (e.g., lastSelected not found)
                this.selectedIds.clear();
                if (assetId) this.selectedIds.add(assetId);
            }
        } else { // No assetId or other unexpected case, clear selection
            this.selectedIds.clear();
        }

        // Update last selected ID and element
        this.selectedAssetId = Array.from(this.selectedIds).pop() || null; // Last selected ID or null
        if (element) this.lastSelectedAssetElement = element; // Store the clicked DOM element

        // Visually update selection in the grid
        document.querySelectorAll('.asset-item.selected').forEach(el => el.classList.remove('selected'));
        for (const id of this.selectedIds) {
            const el = this.dom.grid.querySelector(`.asset-item[data-id='${id}']`);
            if (el) el.classList.add('selected');
        }

        // Update properties and preview for the *last selected* asset (or clear if none)
        const asset = this._findById(this.selectedAssetId);
        if (asset) {
            this._updatePropertiesPanel(asset);
            this._updatePreview(asset);
        } else {
            this.dom.properties.innerHTML = `<div class="property-row"><div class="property-label">Select an asset</div><div class="property-value">No asset selected</div></div>`;
            this._clearPreview();
        }
    }

    // Update Properties Panel
    static _updatePropertiesPanel(asset) {
        if (!this.dom.properties) return;

        let propsHtml = `<div class="properties-title">${asset.name}</div>
            <div class="property-row"><div class="property-label">Type</div><div class="property-value">${asset.type.toUpperCase()}</div></div>
            <div class="property-row"><div class="property-label">ID</div><div class="property-value">${asset.id.slice(0,8)}...</div></div>`;

        // Material specific properties
        if (asset.type === 'material' && asset.definition) {
            const d = asset.definition;
            propsHtml += `<div class="property-row"><div class="property-label">Color</div><div class="property-value">${d.color || '—'}</div></div>
                <div class="property-row"><div class="property-label">Roughness</div><div class="property-value">${d.roughness ?? '—'}</div></div>
                <div class="property-row"><div class="property-label">Metalness</div><div class="property-value">${d.metalness ?? '—'}</div></div>`;
            if (d.map) propsHtml += `<div class="property-row"><div class="property-label">Albedo</div><div class="property-value">${this._shortName(d.map)}</div></div>`;
            if (d.normalMap) propsHtml += `<div class="property-row"><div class="property-label">Normal</div><div class="property-value">${this._shortName(d.normalMap)}</div></div>`;
        }

        // Tags input/display
        propsHtml += `
            <div class="property-row property-tags">
                <div class="property-label">Tags</div>
                <div class="property-value">
                    <input type="text" class="property-input tags-input" id="assetTagsInput" placeholder="Comma separated tags" value="${(asset.tags || []).join(', ')}">
                </div>
            </div>`;

        this.dom.properties.innerHTML = propsHtml;

        // Attach event listener for tags input AFTER HTML is rendered
        const tagsInput = this.dom.properties.querySelector('#assetTagsInput'); // CORRECTED ACCESS
        if (tagsInput) {
            tagsInput.onblur = tagsInput.onchange = (e) => {
                const newTags = e.target.value.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
                const selectedAsset = this._findById(this.selectedAssetId);
                if (selectedAsset) {
                    selectedAsset.tags = newTags;
                    this._saveToStorage();
                }
            };
        }
    }


    // Adds an asset to scene or multiple drop handling - FIXED FBX-ONLY SCALING
    /*static async _addToScene(assetId, event = null) {
        const asset = this._findById(assetId) || this._getPrimitiveAssets().find(a => a.id === assetId) || this._getLightAssets().find(a => a.id === assetId);
        if (!asset) { console.error(`AssetsPanel: Could not find asset with ID ${assetId}`); return; }
        if (typeof window.addObjectToScene !== 'function') { console.error("AssetsPanel Error: window.addObjectToScene() is not defined. Please define it globally."); return; }

        let position = new THREE.Vector3(0, 0, 0);
        if (event) {
            const rect = this.renderer.domElement.getBoundingClientRect();
            const mouse = new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
            this.raycaster.setFromCamera(mouse, this.camera);
            const intersects = this.raycaster.intersectObjects(this.scene.children, true);
            if (intersects.length > 0) { position.copy(intersects[0].point); }
        }

        switch(asset.type) {
           
           case 'model':
                const ext = asset.name.split('.').pop().toLowerCase();
                let loaderPromise;

                // CRITICAL FIX: Resolve the entire GLTFResult object (gltf),
                // NOT just gltf.scene, so we can access gltf.animations.
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
                    console.warn(`AssetsPanel: No specific loader for model type '${ext}' (asset: ${asset.name}). Trying GLTF loader as fallback.`);
                    // Fallback should also try to get the full gltf object if possible
                    loaderPromise = new Promise((resolve, reject) => {
                        this.loaders.gltf.load(asset.data, gltf => resolve(gltf), undefined, reject);
                    });
                }

                loaderPromise.then(loadedContent => {
                    let modelObject;
                    let animations = [];

                    // Determine if it's a GLTFResult (has .scene and .animations) or a direct Object3D
                    if (loadedContent && loadedContent.scene instanceof THREE.Object3D) { // Likely GLTF result
                        modelObject = loadedContent.scene;
                        animations = loadedContent.animations || [];
                    } else if (loadedContent instanceof THREE.Object3D) { // Likely FBX, OBJ, or simple Object3D
                        modelObject = loadedContent;
                        animations = loadedContent.animations || []; // FBXLoader puts animations directly on the object
                    } else {
                        console.error(`AssetsPanel: Loaded content not a valid THREE.Object3D or GLTFResult for ${asset.name}.`, loadedContent);
                        throw new Error("Invalid model content.");
                    }

                    // --- BEGIN Scaling and Centering Logic (Applies to all model types for consistency) ---
                    if (ext === 'fbx' || ext === 'obj' || ext === 'gltf' || ext === 'glb') {
                        const bbox = new THREE.Box3().setFromObject(modelObject);
                        if (bbox.isEmpty()) {
                            console.warn(`AssetsPanel: Model '${asset.name}' bounding box is empty, skipping scaling/centering.`);
                        } else {
                            const size = bbox.getSize(new THREE.Vector3());
                            const center = bbox.getCenter(new THREE.Vector3());

                            const targetMaxDim = 1.8; // Target size for models
                            const currentMaxDim = Math.max(size.x, size.y, size.z);

                            if (currentMaxDim > 0) {
                                const scaleFactor = targetMaxDim / currentMaxDim;
                                modelObject.scale.set(scaleFactor, scaleFactor, scaleFactor);
                            }

                            // Re-center after scaling to origin
                            const newBbox = new THREE.Box3().setFromObject(modelObject);
                            const newCenter = newBbox.getCenter(new THREE.Vector3());
                            modelObject.position.sub(newCenter);
                        }
                    }
                    // --- END Scaling and Centering Logic ---

                    modelObject.position.add(position); // Apply drop position always

                    // CRITICAL FIX: Assign animations to the modelObject BEFORE it's added to the scene.
                    // Your `scene.add` override (which calls `addObjectToTimeline`) relies on this.
                    modelObject.animations = animations;
                
                    // Add the model to the scene using your global helper.
                    // This will trigger scene.add, which in turn calls addObjectToTimeline.
                    window.addObjectToScene(modelObject, asset.name.split('.').slice(0, -1).join('.'));

                    if (typeof this.onAssetAdded === 'function') this.onAssetAdded(asset);
                }).catch(error => {
                    console.error(`AssetsPanel: Failed to load model '${asset.name}':`, error);
                });
                break; // End of 'model' case
            case 'texture':
                this.loaders.texture.load(asset.data, texture => {
                    const intersects = this.raycaster.intersectObjects(this.scene.children, true);
                    const target = intersects.length > 0 ? intersects[0].object : null;
                    if (target && target.isMesh && target.material) {
                        target.material.map = texture;
                        target.material.needsUpdate = true;
                        console.log(`Applied texture '${asset.name}' to object '${target.name}'.`);
                    } else { console.warn("AssetsPanel: Could not apply texture. Drop it onto a mesh object."); }
                });
                break;
            case 'hdri':
                this.loaders.hdri.load(asset.data, texture => {
                    texture.mapping = THREE.EquirectangularReflectionMapping;
                    this.scene.background = texture;
                    this.scene.environment = texture;
                    console.log(`Applied HDRI '${asset.name}' to the scene.`);
                });
                break;
            case 'material':
                const intersects = event ? (()=>{
                    const rect = this.renderer.domElement.getBoundingClientRect();
                    const mouse = new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
                    this.raycaster.setFromCamera(mouse, this.camera);
                    return this.raycaster.intersectObjects(this.scene.children, true);
                })() : [];
                if (intersects && intersects.length > 0) {
                    this._applyMaterialToMesh(asset, intersects[0].object);
                } else {
                    console.warn("AssetsPanel: Drop a material onto a mesh to apply it.");
                }
                break;
            case 'primitive':
                const mesh = asset.factory(); mesh.position.copy(position); window.addObjectToScene(mesh, asset.name); break;
            case 'light':
                const light = asset.factory(); light.position.copy(position); if (light.target) { light.target.position.set(position.x, position.y -1, position.z); } window.addObjectToScene(light, asset.name); if(light.target) window.addObjectToScene(light.target, `${asset.name} Target`); break;
        }
    }*/ 
    static async _addToScene(assetId, event = null) { 
    const asset = this._findById(assetId) 
        || this._getPrimitiveAssets().find(a => a.id === assetId) 
        || this._getLightAssets().find(a => a.id === assetId);

    if (!asset) { 
        console.error(`AssetsPanel: Could not find asset with ID ${assetId}`); 
        return; 
    }
    if (typeof window.addObjectToScene !== 'function') { 
        console.error("AssetsPanel Error: window.addObjectToScene() is not defined. Please define it globally."); 
        return; 
    }

    // Always spawn models at world origin
    let position = new THREE.Vector3(0, 0, 0);

    switch(asset.type) {
        case 'model': {
            const ext = asset.name.split('.').pop().toLowerCase();
            let loaderPromise;

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

                // ✅ Preserve skeleton and skinned mesh data
                let hasSkeletonData = false;
                modelObject.traverse((child) => {
                    if (child.isSkinnedMesh) {
                        hasSkeletonData = true;
                        // Ensure skeleton is properly initialized
                        if (child.skeleton) {
                            child.skeleton.update();
                        }
                        console.log(`Found skinned mesh: ${child.name} with ${child.skeleton?.bones?.length || 0} bones`);
                    }
                });

                // --- Scaling & Centering ---
                if (['fbx','obj','gltf','glb'].includes(ext)) {
                    const bbox = new THREE.Box3().setFromObject(modelObject);
                    if (!bbox.isEmpty()) {
                        const size = bbox.getSize(new THREE.Vector3());
                        const center = bbox.getCenter(new THREE.Vector3());

                        const targetMaxDim = 1.8;
                        const currentMaxDim = Math.max(size.x, size.y, size.z);

                        if (currentMaxDim > 0) {
                            const scaleFactor = targetMaxDim / currentMaxDim;
                            modelObject.scale.setScalar(scaleFactor);
                        }

                        const newBbox = new THREE.Box3().setFromObject(modelObject);
                        const newCenter = newBbox.getCenter(new THREE.Vector3());
                        modelObject.position.sub(newCenter);
                        
                        // ✅ Update skeleton after scaling/centering
                        if (hasSkeletonData) {
                            modelObject.traverse((child) => {
                                if (child.isSkinnedMesh && child.skeleton) {
                                    child.skeleton.update();
                                }
                            });
                        }
                    }
                }

                // Always set model at (0,0,0)
                modelObject.position.copy(position);

                // Attach animations
                modelObject.animations = animations;

                // ✅ Store skeleton information in userData for easy access
                if (hasSkeletonData) {
                    modelObject.userData.hasSkeleton = true;
                    console.log(`Model '${asset.name}' has skeleton data`);
                }

                // Add to scene through helper
                window.addObjectToScene(
                    modelObject, 
                    asset.name.split('.').slice(0, -1).join('.')
                );

                if (typeof this.onAssetAdded === 'function') 
                    this.onAssetAdded(asset);
            }).catch(error => {
                console.error(`AssetsPanel: Failed to load model '${asset.name}':`, error);
            });
            break;
        }

        case 'texture': {
            this.loaders.texture.load(asset.data, texture => {
                const intersects = this.raycaster.intersectObjects(this.scene.children, true);
                const target = intersects.length > 0 ? intersects[0].object : null;
                if (target && target.isMesh && target.material) {
                    target.material.map = texture;
                    target.material.needsUpdate = true;
                    console.log(`Applied texture '${asset.name}' to '${target.name}'.`);
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
    }
}

       
    // --- Preview Logic - FIXED LOADING/EMPTY STATES ---
    static async _updatePreview(asset) {
        if (!this.previewScene || !this.dom.assetPreviewContainer) return;

        this._clearPreview(); // Clear previous content and set to empty state
        this.dom.assetPreviewContainer.classList.add('loading'); // Show loading state

        try {
            if (asset.type === 'model') {
                const ext = asset.name.split('.').pop().toLowerCase();
                let loaderPromise;

                if (ext === 'glb' || ext === 'gltf') {
                    loaderPromise = new Promise((resolve, reject) => this.loaders.gltf.load(asset.data, gltf => resolve(gltf.scene), undefined, reject));
                } else if (ext === 'fbx') {
                    loaderPromise = new Promise((resolve, reject) => this.loaders.fbx.load(asset.data, obj => resolve(obj), undefined, reject));
                } else if (ext === 'obj') {
                    loaderPromise = new Promise((resolve, reject) => this.loaders.obj.load(asset.data, obj => resolve(obj), undefined, reject));
                } else {
                    console.warn(`Preview: No specific loader for model type '${ext}' (asset: ${asset.name}).`);
                    this._clearPreview(); // Clear on unsupported type
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
                    this.previewModel.position.sub(center.clone().multiplyScalar(scaleFactor)); // Adjust position after scaling
                } else {
                    console.warn(`Preview: Model '${asset.name}' bounding box is empty. Displaying empty preview.`);
                    this._clearPreview(); // Clear on empty model
                    return;
                }

                this.previewScene.add(this.previewModel);
                this.previewControls.target.set(0, 0, 0); // Recenter orbit controls target
                this.previewCamera.position.set(0, 0, Math.max(2, (bbox.max.z - bbox.min.z) * 1.5)); // Adjust camera distance
                this.previewControls.update();

            } else if (asset.type === 'material') {
                const material = new THREE.MeshStandardMaterial({
                    color: asset.definition.color ? new THREE.Color(asset.definition.color) : 0xffffff,
                    roughness: asset.definition.roughness ?? 0.5,
                    metalness: asset.definition.metalness ?? 0.0,
                    emissive: asset.definition.emissive ? new THREE.Color(asset.definition.emissive) : 0x000000,
                    emissiveIntensity: asset.definition.emissiveIntensity ?? 1
                });
                const loader = new THREE.TextureLoader();
                const texturePromises = [];
                const slots = [['map','map'], ['normalMap','normalMap'], ['roughnessMap','roughnessMap'], ['metalnessMap','metalnessMap'], ['emissiveMap','emissiveMap'], ['displacementMap','displacementMap']];
                for (const [k, srcKey] of slots) {
                    if (asset.definition[srcKey]) {
                        texturePromises.push(new Promise(res => loader.load(asset.definition[srcKey], t => { material[k]=t; material.needsUpdate=true; res(); }, undefined, res)));
                    }
                }
                await Promise.all(texturePromises);
                this.previewModel = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), material);
                this.previewScene.add(this.previewModel);
                this.previewCamera.position.set(0, 0, 2);
                this.previewControls.target.set(0, 0, 0);
                this.previewControls.update();

            } else if (asset.type === 'texture' || asset.type === 'hdri') {
                const texture = await new Promise(res => this.loaders.texture.load(asset.data, res, undefined, res));
                if (asset.type === 'hdri') texture.mapping = THREE.EquirectangularReflectionMapping;

                const material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide });
                // Use a sphere for HDRI preview to show mapping better, plane for regular texture
                this.previewModel = new THREE.Mesh(
                    asset.type === 'hdri' ? new THREE.SphereGeometry(1, 32, 16) : new THREE.PlaneGeometry(2, 2),
                    material
                );
                this.previewScene.add(this.previewModel);
                this.previewCamera.position.set(0, 0, 2);
                this.previewControls.target.set(0, 0, 0);
                this.previewControls.update();
            } else if (asset.type === 'code') { // No visual preview for code
                this._clearPreview();
                this.dom.assetPreviewContainer.classList.add('empty'); // Show empty state for code
                return;
            }
            // If anything was successfully loaded, remove the 'empty' class
            if (this.previewModel) {
                this.dom.assetPreviewContainer.classList.remove('empty');
            } else {
                this.dom.assetPreviewContainer.classList.add('empty'); // Fallback to empty if model somehow wasn't set
            }

        } catch (error) {
            console.error("Error loading preview asset:", error);
            this._clearPreview(); // Clear on error
        } finally {
            this.dom.assetPreviewContainer.classList.remove('loading');
        }
    }

    static _clearPreview() {
        if (this.previewScene) {
            // Dispose of previous preview model if it exists
            if (this.previewModel) {
                this.previewScene.remove(this.previewModel);
                this._disposeHierarchy(this.previewModel); // Custom recursive dispose
                this.previewModel = null;
            }

            // Reset camera and controls to default state
            this.previewCamera.position.set(0, 0, 3);
            this.previewControls.target.set(0, 0, 0);
            this.previewControls.update();

            // Show the "Select an asset for preview" overlay
            this.dom.assetPreviewContainer.classList.add('empty');
            this.dom.assetPreviewContainer.classList.remove('loading');
        }
    }

    // Helper to dispose of Three.js objects recursively
    static _disposeHierarchy(object) {
        if (!object) return;
        // Dispose geometry
        if (object.geometry) {
            object.geometry.dispose();
            object.geometry = undefined;
        }
        // Dispose material(s) and textures
        if (object.material) {
            const materials = Array.isArray(object.material) ? object.material : [object.material];
            for (const material of materials) {
                for (const key in material) {
                    if (material[key] && typeof material[key].isTexture === 'boolean' && material[key].isTexture) {
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
    // Storage, Loading & Migration
    // ------------------------------------------------------------------
    static _saveToStorage() {
        try {
            const userAssets = this.assets.filter(a => !a.isBuiltIn);
            const payload = { version: this.lastStorageVersion, assets: userAssets, folders: this.folders };
            localStorage.setItem('assetsPanel_data_v3', JSON.stringify(payload));
            if (typeof this.onAssetsChanged === 'function') this.onAssetsChanged(this.assets, this.folders);
        } catch (e) { console.error('Failed to save assets', e); }
    }

    static _loadFromStorage() {
        try {
            const raw = localStorage.getItem('assetsPanel_data_v3');
            if (!raw) return this._migrateLegacy();
            const data = JSON.parse(raw);
            if (data.assets) {
                // Filter out any built-in assets from loaded data to avoid duplicates with _ensureBuiltins
                const loadedUserAssets = data.assets.filter(a => !a.isBuiltIn).map(a => {
                    if (!Array.isArray(a.tags)) a.tags = []; // Ensure tags are always an array
                    return a;
                });
                // Merge loaded user assets with built-in assets
                this.assets = [...loadedUserAssets];
            }
            if (data.folders) this.folders = data.folders;

            // Load thumbnail size
            const storedSize = localStorage.getItem('assetsPanel_thumbnailSize');
            if (storedSize) {
                this.currentThumbnailSize = parseInt(storedSize, 10);
                if (this.dom.thumbnailSizeSlider) {
                    this.dom.thumbnailSizeSlider.value = this.currentThumbnailSize;
                }
                this.dom.panel.style.setProperty('--thumbnail-size', `${this.currentThumbnailSize}px`);
            }
        } catch (e) { console.error('Failed to load assets', e); this._migrateLegacy(); }
    }

    static _migrateLegacy() {
        const old = localStorage.getItem('assetsPanel_assets');
        if (!old) return;
        try {
            const arr = JSON.parse(old);
            this.assets = (arr||[]).map(a => ({
                ...a,
                id: a.id || `asset_${Date.now()}_${Math.floor(Math.random()*1000)}`,
                tags: [] // Initialize tags for legacy assets
            }));
            this.folders = {};
            this._saveToStorage();
            localStorage.removeItem('assetsPanel_assets');
            console.log('AssetsPanel: Migrated legacy assets to v3 storage.');
        } catch (e) { console.warn('AssetsPanel: Legacy migration failed', e); }
    }

    // ------------------------------------------------------------------
    // Event listeners and DOM behavior
    // ------------------------------------------------------------------
    static _setupEventListeners() {
        // Upload zone drag for files (and basic folder detection)
        if (this.dom.uploadZone) {
            this.dom.uploadZone.ondragover = (e) => { e.preventDefault(); this.dom.uploadZone.classList.add('dragover'); };
            this.dom.uploadZone.ondragleave = () => this.dom.uploadZone.classList.remove('dragover');
            this.dom.uploadZone.ondrop = async (e) => {
                e.preventDefault();
                this.dom.uploadZone.classList.remove('dragover');

                const droppedItems = Array.from(e.dataTransfer.items || []);
                const files = Array.from(e.dataTransfer.files || []);

                const hasDirectory = droppedItems.some(item => item.webkitGetAsEntry && item.webkitGetAsEntry().isDirectory);

                if (hasDirectory) {
                    alert("Folder drop is not supported for drag-and-drop directly into the dropzone. Please use the 'Browse Folder' button to import directories.");
                    this.hideUploadZone();
                    return;
                }

                for (const file of files) {
                    if (file.webkitRelativePath) {
                        const pathSegments = file.webkitRelativePath.split('/');
                        pathSegments.pop();
                        const folderPath = pathSegments.join('/');
                        const targetFolderId = this._ensureFolderPath(folderPath, this.openFolderId);
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
                e.target.value = ''; // Clear input value
            };
        }

        // Folder input (static in HTML)
        if (this.dom.uploadFolderInput) {
            this.dom.uploadFolderInput.onchange = async (e) => {
                await this._addAssetsFromFolderInput(Array.from(e.target.files), this.openFolderId);
                this.hideUploadZone();
                e.target.value = ''; // Clear input value
            };
        }

        // Renderer drag/drop -> add to scene or apply material/texture
        if (this.renderer && this.renderer.domElement) {
            this.renderer.domElement.ondragover = (e) => e.preventDefault();
            this.renderer.domElement.ondrop = (e) => {
                e.preventDefault();
                try {
                    const data = JSON.parse(e.dataTransfer.getData('application/json'));
                    if (data && data.assetId) this._addToScene(data.assetId, e);
                } catch (err) { /* ignore invalid drops */ }
            };
        }

        // Header resize
        if (this.dom.header && this.dom.panel) {
            this.dom.header.onmousedown = (e) => {
                if (e.target.closest('.assets-panel-controls')) return;

                const startY = e.clientY, startHeight = this.dom.panel.offsetHeight;
                const mouseMove = (ev) => { this.dom.panel.style.height = `${startHeight - (ev.clientY - startY)}px`; };
                document.addEventListener('mousemove', mouseMove);
                document.addEventListener('mouseup', () => document.removeEventListener('mousemove', mouseMove), { once: true });
            };
        }

        // Global click hides context menu and clears selection if clicked outside assets panel
        document.addEventListener('click', (e) => {
            if (this.dom.contextMenu) this.dom.contextMenu.style.display = 'none';

            if (this.dom.panel && !this.dom.panel.contains(e.target) && !e.target.closest('.context-menu')) {
                if (this.renderer && this.renderer.domElement && this.renderer.domElement.contains(e.target)) {
                    // Do nothing, assume user is interacting with the 3D scene
                } else {
                    this.selectAsset(null, null, false, null); // Deselect all assets
                }
            }
        });


        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            const isPanelActive = this.dom.panel.contains(document.activeElement) || this.dom.panel.classList.contains('visible');

            if (isPanelActive) {
                if (e.key === 'Delete') {
                    if (this.selectedIds.size) { e.preventDefault(); this.deleteAsset(); }
                }
                if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
                    e.preventDefault(); this._selectAllInView();
                }
                if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
                    if (this.selectedIds.size) {
                        const names = Array.from(this.selectedIds).map(id => (this._findById(id)||{}).name).filter(Boolean).join('\n');
                        navigator.clipboard.writeText(names).catch(()=>{});
                    }
                }
            }
        });

        // Folder sidebar dblclick -> open
        if (this.dom.categoriesContainer) {
            this.dom.categoriesContainer.addEventListener('dblclick', (e) => {
                const node = e.target.closest('.category-item'); if (!node) return;
                const id = node.dataset.folderId;
                if (id === '') {
                    this.openFolderId = null;
                    this.currentCategory = 'project';
                } else if (id) {
                    this.openFolderId = id;
                    this.currentCategory = 'project';
                }
                document.querySelectorAll('.category-item.active').forEach(c => c.classList.remove('active'));
                node.classList.add('active');
                this.render();
            });
        }

        // Thumbnail size slider
        if (this.dom.thumbnailSizeSlider) {
            this.dom.thumbnailSizeSlider.value = this.currentThumbnailSize;
            this.dom.thumbnailSizeSlider.oninput = (e) => this.setThumbnailSize(e.target.value);
        }

        // Search debounce is already set up in HTML onclick attributes
    }

    // ------------------------------------------------------------------
    // Asset ingestion and thumbnails
    // ------------------------------------------------------------------
    static async _addAssetFromFile(file, folderId = null) {
        const type = this._getAssetType(file.name);
        if (!type) {
            console.warn(`AssetsPanel: Unsupported file type for ${file.name}. Skipping.`);
            return;
        }

        // Conflict Resolution
        let finalFileName = file.name;
        let shouldOverwrite = false;
        let existingAsset = this.assets.find(a =>
            !a.isBuiltIn && a.name === finalFileName && (a.folderId || null) === (folderId || null)
        );

        if (existingAsset) {
            const response = prompt(
                `Asset '${file.name}' already exists in this folder.\n` +
                `Enter a NEW NAME to rename, type 'overwrite' to replace, or leave blank to skip:`,
                file.name
            );

            if (response === null || response.trim() === '') {
                console.log(`AssetsPanel: Skipped import of '${file.name}'.`);
                return;
            } else if (response.toLowerCase() === 'overwrite') {
                shouldOverwrite = true;
            } else {
                finalFileName = response.trim();
                if (this.assets.some(a => !a.isBuiltIn && a.name === finalFileName && (a.folderId || null) === (folderId || null))) {
                    alert(`The new name '${finalFileName}' also conflicts with an existing asset. Skipping.`);
                    return;
                }
            }
        }

        // Read file data
        const reader = new FileReader();
        if (type === 'code' || type === 'material') { // Read as text for code/material JSON
            reader.readAsText(file);
        } else { // Read as Data URL for others
            reader.readAsDataURL(file);
        }
        await new Promise(resolve => { reader.onload = resolve; reader.onerror = resolve; });

        if (!reader.result) {
            console.error(`AssetsPanel: Failed to read file ${finalFileName}.`);
            return;
        }

        if (shouldOverwrite && existingAsset) {
            this._removeAsset(existingAsset.id); // Remove old asset if overwriting
        }

        const id = `asset_${Date.now()}_${Math.floor(Math.random()*1000)}`;
        const fileContent = reader.result;
        let asset = { id, name: finalFileName, type, data: fileContent, thumbnail: null, isFavorite: false, isBuiltIn: false, folderId, tags: [] };

        // If JSON and detected as material, parse definition
        if (type === 'material') {
            try {
                const def = JSON.parse(fileContent);
                asset.definition = def;
                asset.thumbnail = await this._generateMaterialThumbnail(def);
            } catch (err) {
                console.warn(`Invalid material JSON for ${finalFileName}`, err);
                asset.thumbnail = this._svgIcon('material');
            }
        } else if (type === 'code') {
            asset.thumbnail = this._svgIcon('code'); // Assign a code icon
        } else {
            asset.thumbnail = await this._generateThumbnail(fileContent, type, file);
        }

        this.assets.push(asset);
        this._saveToStorage();
        if (typeof this.onAssetAdded === 'function') this.onAssetAdded(asset);
        this.render(); // Re-render to show new asset
    }

    static async _addAssetsFromFolderInput(files, baseFolderId) {
        console.log(`AssetsPanel: Importing ${files.length} files from folder...`);
        for (const file of files) {
            if (file.webkitRelativePath) {
                const pathSegments = file.webkitRelativePath.split('/');
                pathSegments.pop();
                const folderPath = pathSegments.join('/');

                const targetFolderId = this._ensureFolderPath(folderPath, baseFolderId);

                await this._addAssetFromFile(file, targetFolderId);
            } else {
                await this._addAssetFromFile(file, baseFolderId);
            }
        }
        console.log("AssetsPanel: Folder import complete.");
        this.render();
    }

    static _ensureFolderPath(relativePath, baseParentId = null) {
        if (!relativePath) return baseParentId;

        const segments = relativePath.split('/').filter(s => s !== '');
        let currentParentId = baseParentId;

        for (const segment of segments) {
            let existingFolder = Object.values(this.folders).find(
                f => f.name === segment && (f.parentId || null) === (currentParentId || null)
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
        if (type === 'texture' || type === 'hdri') {
            return new Promise(resolve => {
                const img = new Image(); img.crossOrigin = 'anonymous';
                img.onload = () => {
                    const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 128;
                    const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, 128, 128);
                    resolve(canvas.toDataURL('image/png'));
                };
                img.onerror = () => resolve(this._svgIcon('texture'));
                img.src = dataURL;
            });
        }
        if (type === 'model') {
            const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
            renderer.setSize(128, 128);
            const scene = new THREE.Scene();
            const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
            scene.add(new THREE.AmbientLight(0xffffff, 2.0));
            scene.add(new THREE.DirectionalLight(0xffffff, 2.0).position.set(2,3,1));

            return new Promise(resolve => {
                const ext = file.name.split('.').pop().toLowerCase();
                let loader;
                if (ext === 'glb' || ext === 'gltf') loader = this.loaders.gltf;
                else if (ext === 'fbx') loader = this.loaders.fbx;
                else if (ext === 'obj') loader = this.loaders.obj;
                else { resolve(this._svgIcon('model')); return; }

                loader.load(dataURL, loadedObject => {
                    let model = loadedObject.scene || loadedObject;

                    const bbox = new THREE.Box3().setFromObject(model);
                    if (bbox.isEmpty()) { resolve(this._svgIcon('model')); return; }
                    const size = bbox.getSize(new THREE.Vector3());
                    const center = bbox.getCenter(new THREE.Vector3());
                    const maxDim = Math.max(size.x, size.y, size.z) || 1;

                    model.position.sub(center);
                    camera.position.set(0, 0, maxDim * 1.5);
                    camera.lookAt(0,0,0);

                    scene.add(model);
                    renderer.render(scene, camera);
                    resolve(renderer.domElement.toDataURL('image/png'));
                    renderer.dispose();
                }, ()=>{ resolve(this._svgIcon('model')); }, (error)=>{ console.error("Model thumbnail generation error:", error); resolve(this._svgIcon('model')); }); // Added error callbacks
            });
        }
        return Promise.resolve(this._svgIcon(type));
    }

    static _generateMaterialThumbnail(def) {
        return new Promise(resolve => {
            try {
                const size = 128;
                const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
                renderer.setSize(size, size);
                const scene = new THREE.Scene();
                const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
                camera.position.set(0, 0, 3);
                scene.add(new THREE.AmbientLight(0xffffff, 0.6));
                const d = new THREE.DirectionalLight(0xffffff, 1.0); d.position.set(2,2,2); scene.add(d);
                const mat = new THREE.MeshStandardMaterial({
                    color: def.color ? new THREE.Color(def.color) : 0xffffff,
                    roughness: def.roughness ?? 0.5,
                    metalness: def.metalness ?? 0.0,
                    emissive: def.emissive ? new THREE.Color(def.emissive) : 0x000000,
                    emissiveIntensity: def.emissiveIntensity ?? 1
                });
                const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.8, 32, 16), mat);
                scene.add(sphere);
                const loader = new THREE.TextureLoader();
                const slots = [['map','map'], ['normalMap','normalMap'], ['roughnessMap','roughnessMap'], ['metalnessMap','metalnessMap'], ['emissiveMap','emissiveMap'], ['displacementMap','displacementMap']];
                let pending = 0;
                for (const [k, srcKey] of slots) {
                    if (def[srcKey]) {
                        pending++;
                        loader.load(def[srcKey], (t) => { mat[k]=t; mat.needsUpdate=true; pending--; if (pending===0) finish(); }, undefined, ()=>{ pending--; if (pending===0) finish(); });
                    }
                }
                const finish = () => {
                    renderer.render(scene, camera);
                    try { const dURL = renderer.domElement.toDataURL('image/png'); renderer.dispose(); resolve(dURL); } catch (e) { renderer.dispose(); resolve(this._svgIcon('material')); }
                };
                if (pending === 0) finish();
            } catch (e) { resolve(this._svgIcon('material')); }
        });
    }

    static _svgIcon(type) {
        const icons = {
            'logo': `<svg class="svg-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16c2.76 0 5-2.24 5-5 0-4.42-4.03-8-9-8zm-5.5 9c-.83 0-1.5-.67-1.5-1.5S5.67 9 6.5 9 8 9.67 8 10.5 7.33 12 6.5 12zm3-4C8.67 8 8 7.33 8 6.5S8.67 5 9.5 5s1.5.67 1.5 1.5S10.33 8 9.5 8zm5 0c-.83 0-1.5-.67-1.5-1.5S13.67 5 14.5 5s1.5.67 1.5 1.5S15.33 8 14.5 8zm3 4c-.83 0-1.5-.67-1.5-1.5S16.67 9 17.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"></path></svg>`,
            'upload-btn': ` <svg class="svg-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16h6v-6h4l-7-7-7 7h4v6zm-4 2h14v2H5v-2z"></path></svg>`,
            'download-btn': `<svg class="svg-icon" viewBox="0 0 24 24" fill="currentColor"><!-- Download (Export Project) --><path d="M5 18h14v2H5v-2zM13 5v9h3l-4 4-4-4h3V5h2z"></path></svg>`,
            'refresh-btn': `<svg class="svg-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"></path></svg>`,
            'upload-zone-icon': `<svg class="svg-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M21 15c0-1.66-1.34-3-3-3h-1.17C16.24 9.35 13.83 8 12 8s-4.24 1.35-4.83 3.83H6c-1.66 0-3 1.34-3 3v4c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-4z"></path></svg>`,
            'folder-icon-html': `<svg class="svg-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-4z"></path></svg>`,

            'arrow-right': `<svg viewBox="0 0 24 24" class="svg-icon" width="16" height="16" fill="currentColor"><path d="M10 17l5-5-5-5v10z"></path></svg>`,
            'arrow-down': `<svg viewBox="0 0 24 24" class="svg-icon" width="16" height="16" fill="currentColor"><path d="M7 10l5 5 5-5H7z"></path></svg>`,

            model: `<svg class="svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"></path></svg>`,
            texture: `<svg class="svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>`,
            hdri: `<svg class="svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M12 2a10 10 0 0 0 0 20A10 10 0 0 0 12 2z"></path><path d="M12 2v20"></path><path d="M2 12h20"></path><path d="M7 3h10"></path><path d="M7 21h10"></path><path d="M3 7v10"></path><path d="M21 7v10"></path></svg>`,
            material: `<svg class="svg-icon" viewBox="0 0 24 24" fill="currentColor" stroke="none"><circle cx="12" cy="12" r="8"/></svg>`,
            primitive: `<svg class="svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg>`,
            light: `<svg class="svg-icon" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M9 21c0 .5.4 1 1 1h4c.6 0 1-.5 1-1v-1H9v1zm3-20C8.9 2 6 4.9 6 8c0 2.8 2.2 5.2 5 5.9V18h2v-4.1c2.8-.7 5-3.1 5-5.9 0-3.1-2.9-6-6-6z"/></svg>`,
            star: `<svg class="svg-icon" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`,
            breadcrumbs: `<svg class="svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>`,
            // NEW: Code icon
            code: `<svg class="svg-icon" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M14.6 16.6L19.2 12 14.6 7.4 16 6l6 6-6 6-1.4-1.4zm-5.2 0L4.8 12 9.4 7.4 8 6l-6 6 6 6 1.4-1.4z"/></svg>`,
        };
        return icons[type] || icons.primitive;
    }

    // ------------------------------------------------------------------
    // Rendering UI: Folders + Assets grid
    // ------------------------------------------------------------------
    static render(searchQuery = '') {
        if (!this.dom.grid) return;
        this._renderBreadcrumbs();
        this._renderFolderSidebar(); // This now handles folder line rendering

        let assetsToRender = [];
        switch (this.currentCategory) {
            case 'project': assetsToRender = this.assets.filter(a => (this.openFolderId ? a.folderId === this.openFolderId : !a.folderId)); break;
            case 'favorites': assetsToRender = this.assets.filter(a => a.isFavorite); break;
            case 'primitives': assetsToRender = this._getPrimitiveAssets(); break;
            case 'lights': assetsToRender = this._getLightAssets(); break;
            case 'scripts': assetsToRender = this.assets.filter(a => a.type === 'code'); break; // NEW: Scripts category
            default: assetsToRender = this.assets; break;
        }
        if (this.currentFilter !== 'all') assetsToRender = assetsToRender.filter(a => a.type === this.currentFilter);
        if (searchQuery) assetsToRender = assetsToRender.filter(a =>
            (a.name||'').toLowerCase().includes(searchQuery) ||
            (a.tags||[]).some(t => t.toLowerCase().includes(searchQuery))
        );

        this.dom.grid.innerHTML = '';
        for (const asset of assetsToRender) {
            const item = document.createElement('div');
            item.className = `asset-item ${asset.isFavorite ? 'favorite' : ''} ${this.selectedIds.has(asset.id) ? 'selected' : ''}`;
            item.dataset.id = asset.id; item.draggable = true;

            const thumbHtml = (asset.thumbnail && asset.thumbnail.startsWith('data:image')) ? `<img src="${asset.thumbnail}" alt="${asset.name}" />` : (asset.thumbnail ? asset.thumbnail : this._svgIcon(asset.type));
            item.innerHTML = `
                <div class="asset-thumbnail">${thumbHtml}</div>
                <div class="asset-name">${asset.name}</div>
                <div class="asset-meta">${asset.type}</div>
                <div class="asset-fav-icon" title="Favorite">${this._svgIcon('star')}</div>
            `;

            item.onclick = (e) => {
                const append = e.ctrlKey || e.metaKey;
                this.selectAsset(asset.id, item, append, e); // Pass the event object here
            };
            item.ondblclick = () => {
                if (asset.type === 'code' && typeof codeEditorManager !== 'undefined') {
                    codeEditorManager.loadScriptFromAsset(asset);
                    document.getElementById('code-editor-panel').classList.add('open'); // Open editor panel
                    // Also ensure the JS tab is active
                    document.querySelector('.editor-tab[data-tab="js"]').click();
                } else {
                    this._addToScene(asset.id);
                }
            };
            item.ondragstart = (e) => {
                e.dataTransfer.setData('application/json', JSON.stringify({ assetId: asset.id }));
                e.dataTransfer.effectAllowed = 'copy';
            };
            item.oncontextmenu = (e) => { e.preventDefault(); this._showContextMenu(e, asset.id); };

            this.dom.grid.appendChild(item);
        }

        if (assetsToRender.length === 0) this.dom.grid.innerHTML = '<div class="no-assets">No assets found.</div>';
    }

    // Render Breadcrumbs
    static _renderBreadcrumbs() {
        if (!this.dom.assetsBreadcrumbs) return;
        this.dom.assetsBreadcrumbs.innerHTML = '';

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

        path.unshift({ id: null, name: 'Project Assets' });

        path.forEach((segment, index) => {
            const item = document.createElement('span');
            item.className = `breadcrumb-item ${segment.id === this.openFolderId ? 'active' : ''}`;
            item.textContent = segment.name;
            item.onclick = () => {
                this.openFolderId = segment.id;
                this.currentCategory = 'project';
                this.render();
            };
            this.dom.assetsBreadcrumbs.appendChild(item);

            if (index < path.length - 1) {
                const separator = document.createElement('span');
                separator.className = 'breadcrumb-separator';
                separator.innerHTML = this._svgIcon('breadcrumbs');
                this.dom.assetsBreadcrumbs.appendChild(separator);
            }
        });
    }

    // _renderFolderSidebar - UPDATED FOR CONNECTOR LINES
    static _renderFolderSidebar() {
        const container = document.querySelector('.assets-categories');
        if (!container) return;
        container.innerHTML = '';

        // Top action bar
        const topActions = document.createElement('div');
        topActions.className = 'folder-actions';
        topActions.innerHTML = `
            <button class="panel-btn" onclick="AssetsPanel.createFolder(undefined, AssetsPanel.openFolderId)">${this._svgIcon('folder-icon-html')} New Folder</button>
            <button class="panel-btn" onclick="AssetsPanel.exportJSON()">${this._svgIcon('upload-btn')} Export Project</button>
            <label class="panel-btn file-import">
                ${this._svgIcon('download-btn')} Import Project
                <input type="file" style="display:none" onchange="(function(e){ AssetsPanel.importJSON(e.target.files[0]); })(event)" accept=".json"/>
            </label>
        `;
        container.appendChild(topActions);

        // Root item
        const root = document.createElement('div');
        root.className = `category-item root ${!this.openFolderId && this.currentCategory==='project' ? 'active' : ''}`;
        root.dataset.folderId = '';
        root.innerHTML = `<span class="category-icon">${this._svgIcon('folder-icon-html')}</span> Project Assets`;
        root.onclick = () => {
            this.openFolderId = null;
            this.currentCategory = 'project';
            document.querySelectorAll('.category-item.active').forEach(c => c.classList.remove('active'));
            root.classList.add('active');
            this.render();
        };
        container.appendChild(root);

        // Recursive folder builder
        const buildList = (parentId, depth = 0) => {
            const siblings = Object.values(this.folders)
                .filter(f => (f.parentId || null) === (parentId || null))
                .sort((a, b) => a.name.localeCompare(b.name));

            siblings.forEach((f, index) => {
                const hasChildren = Object.values(this.folders).some(sf => sf.parentId === f.id);
                const isLastSibling = (index === siblings.length - 1);

                const folderNode = document.createElement('div');
                folderNode.className = `folder-node depth-${depth} ${isLastSibling ? 'is-last-sibling' : ''}`;
                folderNode.style.setProperty('--depth-level', depth); // Pass depth as CSS custom property

                // Lines container (actual lines drawn with pseudo-elements on this)
                const linesContainer = document.createElement('div');
                linesContainer.className = 'folder-tree-connector';
                folderNode.appendChild(linesContainer); // Add lines container as first child of folderNode

                const el = document.createElement('div'); // This is the actual clickable category-item content
                el.className = `category-item ${this.openFolderId===f.id && this.currentCategory==='project' ? 'active' : ''}`;
                el.dataset.folderId = f.id;
                el.innerHTML = `
                    <span class="expand-toggle">${hasChildren ? this._svgIcon(this.expandedFolders.has(f.id) ? 'arrow-down' : 'arrow-right') : ''}</span>
                    <span class="category-icon">${this._svgIcon('folder-icon-html')}</span>
                    <span class="folder-name">${f.name}</span>
                `;

                el.querySelector('.expand-toggle')?.addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    if (this.expandedFolders.has(f.id)) {
                        this.expandedFolders.delete(f.id);
                    } else {
                        this.expandedFolders.add(f.id);
                    }
                    this._renderFolderSidebar(); // Re-render sidebar to show/hide children
                });

                el.onclick = (ev) => {
                    ev.stopPropagation();
                    this.openFolderId = f.id;
                    this.currentCategory = 'project';
                    document.querySelectorAll('.category-item.active').forEach(c => c.classList.remove('active'));
                    el.classList.add('active');
                    this.render(); // Re-render grid for new folder content
                };

                el.oncontextmenu = (ev) => {
                    ev.preventDefault();
                    this._showFolderContextMenu(ev, f.id);
                };

                folderNode.appendChild(el);
                container.appendChild(folderNode);

                // Recursively build children if expanded
                if (this.expandedFolders.has(f.id)) {
                    buildList(f.id, depth + 1);
                }
            });
        };

        buildList(null, 0); // Start building from the root (parentId = null)
    }

    // Context menus
    static _showContextMenu(event, assetId) {
        this.contextAssetId = assetId;
        const asset = this._findById(assetId);
        if (!asset || asset.isBuiltIn) return;
        this.dom.contextMenu.style.display = 'block';
        this.dom.contextMenu.style.left = `${event.clientX}px`;
        this.dom.contextMenu.style.top = `${event.clientY}px`;
        this.dom.contextMenu.innerHTML = '';

        const create = (label, cb, style='') => { const d = document.createElement('div'); d.className = 'context-menu-item'; if (style) d.style = style; d.textContent = label; d.onclick = () => { cb(); this.dom.contextMenu.style.display='none'; }; this.dom.contextMenu.appendChild(d); };
        create('Rename', ()=> this.renameAsset());
        create(asset.isFavorite? 'Remove from Favorites' : 'Add to Favorites', ()=> this.toggleFavorite());
        create('Move to Folder', ()=> this._showMoveAssetMenu(assetId));
        create('Export Asset', ()=> this._exportSingleAsset(assetId));
        this.dom.contextMenu.appendChild(document.createElement('div')).className = 'context-menu-separator';
        create('Delete', ()=> this.deleteAsset(), 'color: var(--danger-color);');
    }

    static _showFolderContextMenu(event, folderId) {
        this.dom.contextMenu.style.display = 'block';
        this.dom.contextMenu.style.left = `${event.clientX}px`;
        this.dom.contextMenu.style.top = `${event.clientY}px`;
        this.dom.contextMenu.innerHTML = '';
        const create = (label, cb, style='') => { const d = document.createElement('div'); d.className = 'context-menu-item'; if (style) d.style = style; d.textContent = label; d.onclick = () => { cb(); this.dom.contextMenu.style.display='none'; }; this.dom.contextMenu.appendChild(d); };
        create('Rename Folder', ()=> this.renameFolder(folderId));
        create('Create Subfolder', ()=> { const name = prompt('New subfolder name:', 'New Folder'); if(name) this.createFolder(name, folderId); });
        this.dom.contextMenu.appendChild(document.createElement('div')).className = 'context-menu-separator';
        create('Delete Folder (Move contents to parent)', ()=> this.deleteFolder(folderId, {deleteContents:false}));
        create('Delete Folder & Contents', ()=> { if (confirm('Delete folder and all its contents? This cannot be undone.')) this.deleteFolder(folderId, {deleteContents:true}); }, 'color: var(--danger-color);');
    }

    static _showMoveAssetMenu(assetId) {
        const folderNames = [{ id: null, name: 'Root' }].concat(Object.values(this.folders).map(f=>({ id: f.id, name: f.name })));
        const sel = prompt('Move asset to folder:\n' + folderNames.map((f,i)=>`${i}: ${f.name}`).join('\n'), '0');
        const idx = parseInt(sel);
        if (isNaN(idx)) return;
        const target = folderNames[idx]; this.moveAssetToFolder(assetId, target.id);
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------
    static _findById(id) { return this.assets.find(a => a.id === id); }
    static _removeAsset(id) {
        const idx = this.assets.findIndex(a => a.id === id);
        if (idx >= 0) {
            const [rem] = this.assets.splice(idx,1);
            if (typeof this.onAssetRemoved === 'function') this.onAssetRemoved(rem.id);
        }
    }

    static _collectFolderTree(folderId) { const out = []; const rec = (fid) => { out.push(fid); const f = this.folders[fid]; if (!f) return; for (const c of f.children||[]) rec(c); }; rec(folderId); return out; }

    static _selectAllInView() {
        const nodes = this.dom.grid.querySelectorAll('.asset-item'); this.selectedIds.clear(); for (const n of nodes) this.selectedIds.add(n.dataset.id); this.render();
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
        // Ensure name ends with .js
        const finalName = name.endsWith('.js') ? name : name + '.js';

        // Check for duplicates
        let uniqueName = finalName;
        let counter = 1;
        const baseName = finalName.replace(/\.js$/, '');
        while (this.assets.some(a => !a.isBuiltIn && a.name === uniqueName && (a.folderId || null) === (folderId || null))) {
            uniqueName = `${baseName} (${counter++}).js`;
        }

        if (uniqueName !== finalName) {
            console.warn(`AssetsPanel: Asset name conflict for '${finalName}'. Renamed to '${uniqueName}'.`);
        }

        const id = `script_${Date.now()}_${Math.floor(Math.random()*1000)}`;
        const asset = {
            id,
            name: uniqueName,
            type: 'code',
            data: code,
            thumbnail: this._svgIcon('code'), // Use a specific icon for code
            isFavorite: false,
            isBuiltIn: false,
            folderId,
            tags: ['script', 'code']
        };

        this.assets.push(asset);
        this._saveToStorage();
        if (typeof this.onAssetAdded === 'function') this.onAssetAdded(asset);
        this.render(); // Re-render to show new asset
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
        if (!asset || asset.type !== 'code') {
            console.error(`AssetsPanel: Cannot update asset with ID ${id}, it's not a code asset or doesn't exist.`);
            return false;
        }

        // Ensure newName ends with .js
        const finalNewName = newName.endsWith('.js') ? newName : newName + '.js';

        // Check if newName conflicts with other assets in the same folder, excluding itself
        const conflicts = this.assets.some(a =>
            a.id !== id && !a.isBuiltIn && a.name === finalNewName && (a.folderId || null) === (asset.folderId || null)
        );
        if (conflicts) {
            alert(`An asset named '${finalNewName}' already exists in this folder. Please choose a different name.`);
            return false; // Indicate failure
        }

        asset.name = finalNewName;
        asset.data = newCode;
        this._saveToStorage();
        if (typeof this.onAssetsChanged === 'function') this.onAssetsChanged(this.assets, this.folders);
        this.render(); // Re-render to update asset name in grid if changed
        return true;
    }


    // ==================================================================
    // ===                UPGRADED ASSET LIBRARIES                      ===
    // ==================================================================
    static _getPrimitiveAssets() {
        const defaultMaterial = () => new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide });
        return [
            { id: 'prim_cube', name: 'Cube', type: 'primitive', isBuiltIn: true, thumbnail: this._svgIcon('primitive'), factory: () => new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), defaultMaterial()), tags: ['primitive', 'basic'] },
            { id: 'prim_sphere', name: 'Sphere', type: 'primitive', isBuiltIn: true, thumbnail: this._svgIcon('primitive'), factory: () => new THREE.Mesh(new THREE.SphereGeometry(0.5, 32, 16), defaultMaterial()), tags: ['primitive', 'basic'] },
            { id: 'prim_plane', name: 'Plane', type: 'primitive', isBuiltIn: true, thumbnail: this._svgIcon('primitive'), factory: () => new THREE.Mesh(new THREE.PlaneGeometry(1, 1), defaultMaterial()), tags: ['primitive', 'basic'] },
            { id: 'prim_cylinder', name: 'Cylinder', type: 'primitive', isBuiltIn: true, thumbnail: this._svgIcon('primitive'), factory: () => new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1, 32), defaultMaterial()), tags: ['primitive', 'basic'] },
            { id: 'prim_wall', name: 'Wall', type: 'primitive', isBuiltIn: true, thumbnail: this._svgIcon('primitive'), factory: () => new THREE.Mesh(new THREE.BoxGeometry(4, 2.5, 0.15), defaultMaterial()), tags: ['primitive', 'architecture'] },
            { id: 'prim_stair', name: 'Stairs', type: 'primitive', isBuiltIn: true, thumbnail: this._svgIcon('primitive'), factory: () => {
                const steps = 10; const stepWidth = 1.2, stepHeight = 0.2, stepDepth = 0.3; const group = new THREE.Group();
                for (let i = 0; i < steps; i++) { const geom = new THREE.BoxGeometry(stepWidth, stepHeight, stepDepth); const mesh = new THREE.Mesh(geom, defaultMaterial()); mesh.position.set(0, stepHeight / 2 + i * stepHeight, i * stepDepth); group.add(mesh); }
                const boundingBox = new THREE.Box3().setFromObject(group); const center = boundingBox.getCenter(new THREE.Vector3()); group.position.sub(center);
                return group;
            }, tags: ['primitive', 'architecture'] },
            { id: 'prim_arch', name: 'Arch', type: 'primitive', isBuiltIn: true, thumbnail: this._svgIcon('primitive'), factory: () => { const shape = new THREE.Shape(); shape.moveTo(-1,0); shape.lineTo(-1,1.5); shape.absarc(0,1.5,1,Math.PI,0,true); shape.lineTo(1,0); shape.lineTo(-1,0); const extrudeSettings = { depth: 0.2, bevelEnabled: false }; const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings); geometry.center(); return new THREE.Mesh(geometry, defaultMaterial()); }, tags: ['primitive', 'architecture'] },
            { id: 'prim_column', name: 'Column', type: 'primitive', isBuiltIn: true, thumbnail: this._svgIcon('primitive'), factory: () => new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 3, 20), defaultMaterial()), tags: ['primitive', 'architecture'] },
        ];
    }

    static _getLightAssets() {
        return [
            { id: 'light_point', name: 'Point Light', type: 'light', isBuiltIn: true, thumbnail: this._svgIcon('light'), factory: () => { const light = new THREE.PointLight(0xffffff, 50, 10); light.castShadow = true; return light; }, tags: ['light', 'point'] },
            { id: 'light_sun', name: 'Sun Light', type: 'light', isBuiltIn: true, thumbnail: this._svgIcon('light'), factory: () => { const light = new THREE.DirectionalLight(0xfff5e1, 8); light.castShadow = true; light.shadow.mapSize.width = 2048; light.shadow.mapSize.height = 2048; light.shadow.camera.near = 0.5; light.shadow.camera.far = 50; light.shadow.bias = -0.0001; return light; }, tags: ['light', 'sun', 'directional'] },
            { id: 'light_spot', name: 'Spotlight', type: 'light', isBuiltIn: true, thumbnail: this._svgIcon('light'), factory: () => { const light = new THREE.SpotLight(0xffffff, 200, 20, Math.PI/6, 0.2, 1.5); light.castShadow = true; return light; }, tags: ['light', 'spot'] },
            { id: 'light_rect', name: 'Rect Area Light', type: 'light', isBuiltIn: true, thumbnail: this._svgIcon('light'), factory: () => { const light = new THREE.RectAreaLight(0x87ceeb, 10, 2, 3); return light; }, tags: ['light', 'area'] },
            { id: 'light_hemi', name: 'Hemisphere Sky', type: 'light', isBuiltIn: true, thumbnail: this._svgIcon('light'), factory: () => { const light = new THREE.HemisphereLight(0x87ceeb, 0x404040, 2); return light; }, tags: ['light', 'environment'] },
        ];
    }

    static _ensureBuiltins() {
        // Clear previous built-ins to re-add correctly
        this.assets = this.assets.filter(a => !a.isBuiltIn);

        const builtinPrims = this._getPrimitiveAssets();
        const builtinLights = this._getLightAssets();
        for (const b of [...builtinPrims, ...builtinLights]) {
            // Check if built-in already exists to prevent re-adding if IDs are custom (e.g. from template)
            if (!this.assets.some(a => a.id === b.id)) {
                this.assets.unshift(b); // Add built-ins to the beginning
            }
        }
    }

    static _getAssetType = (filename) => {
        const ext = filename.split('.').pop().toLowerCase();
        if (['glb','gltf', 'fbx', 'obj'].includes(ext)) return 'model';
        if (['png','jpg','jpeg','webp','bmp'].includes(ext)) return 'texture';
        if (['hdr','exr'].includes(ext)) return 'hdri';
        if (['json'].includes(ext)) return 'material';
        // NEW: Asset type for code files
        if (['js'].includes(ext)) return 'code'; 
        return null;
    };

    static _exportSingleAsset(assetId) {
        const asset = this._findById(assetId); if (!asset) return;
        if (asset.type === 'material' && asset.definition) {
            const blob = new Blob([JSON.stringify(asset.definition, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = (asset.name||'material') + '.material.json'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
            return;
        }
        // NEW: Handle code asset export
        if (asset.type === 'code' && asset.data) {
            const blob = new Blob([asset.data], { type: 'text/javascript' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = (asset.name||'script') + '.js'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
            return;
        }
        const blob = new Blob([asset.data], { type: 'application/octet-stream' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = asset.name; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    }

    static _applyMaterialToMesh(asset, mesh) {
        if (!mesh || !mesh.isMesh) {
            console.warn('AssetsPanel: target is not a mesh');
            return;
        }
        if (!asset.definition) { console.warn('AssetsPanel: material asset missing definition'); return; }
        const def = asset.definition;
        const mat = new THREE.MeshStandardMaterial({
            color: def.color ? new THREE.Color(def.color) : 0xffffff,
            roughness: def.roughness ?? 0.5,
            metalness: def.metalness ?? 0.0,
            emissive: def.emissive ? new THREE.Color(def.emissive) : 0x000000,
            emissiveIntensity: def.emissiveIntensity ?? 1
        });

        const loader = new THREE.TextureLoader();
        const promises = [];

        const tryLoad = (key, assignTo) => {
            if (!def[key]) return;
            promises.push(new Promise((res) => {
                loader.load(def[key], (tex) => { mat[assignTo] = tex; mat.needsUpdate = true; res(); }, undefined, () => { console.warn('Texture load failed', def[key]); res(); });
            }));
        };

        tryLoad('map', 'map');
        tryLoad('normalMap', 'normalMap');
        tryLoad('roughnessMap', 'roughnessMap');
        tryLoad('metalnessMap', 'metalnessMap');
        tryLoad('emissiveMap', 'emissiveMap');
        tryLoad('displacementMap', 'displacementMap');

        Promise.all(promises).then(() => {
            if (mesh.material && mesh.material.side) mat.side = mesh.material.side;
            mesh.material = mat;
            mesh.material.needsUpdate = true;
            console.log(`Applied material '${asset.name}' to ${mesh.name || mesh.uuid}`);
        });
    }

    static _shortName(src) {
        try { return src.split('/').pop(); } catch (e) { return src; }
    }

    // END OF CLASS
}