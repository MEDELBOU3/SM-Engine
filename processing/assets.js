/**
 * AssetsPanel v3.1-full
 * Full drop-in replacement for your latest class (keeps API & HTML hooks).
 * - Adds `material` asset type (JSON definitions with texture slots & params)
 * - Applies materials via drag/drop onto meshes (PBR: map, normalMap, roughnessMap, metalnessMap, emissiveMap, displacementMap)
 * - Uses inline SVG icons for thumbnails/fallbacks
 * - Preserves folders, multi-select, event hooks, storage, context menus, etc.
 *
 * Usage: Replace previous AssetsPanel class with this code. Call:
 *    AssetsPanel.init(scene, renderer, camera, raycaster);
 */

class AssetsPanel {
  // --- Core Properties ---
  static scene = null;
  static renderer = null;
  static camera = null;
  static raycaster = null;
  static assets = []; // flat list of assets (includes folder references)
  static folders = {}; // folderId -> folder object (supports nested)
  static dom = {}; // Cache for DOM elements
  static loaders = {};

  // --- State ---
  static currentFilter = 'all';
  static currentCategory = 'project';
  static selectedAssetId = null; // single select
  static selectedIds = new Set(); // multi-select set
  static contextAssetId = null;
  static openFolderId = null; // currently viewed folder in Project category (null = root)
  static lastStorageVersion = 3; // for schema migrations

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

    if (typeof THREE === 'undefined' || !THREE.GLTFLoader || !THREE.RGBELoader) {
      console.error("AssetsPanel Error: THREE.js or required loaders not found.");
      return;
    }

    // DOM cache (expects same IDs/classes as your HTML)
    this.dom.panel = document.getElementById('assetsPanel');
    this.dom.grid = document.getElementById('assetsGrid');
    this.dom.properties = document.getElementById('propertiesContent');
    this.dom.uploadZone = document.getElementById('uploadDropzone');
    this.dom.uploadInput = document.getElementById('uploadInput');
    this.dom.contextMenu = document.getElementById('contextMenu');
    this.dom.header = document.getElementById('assetsPanelHeader');
    this.dom.searchBox = document.querySelector('.search-box');
    this.dom.filterButtons = document.querySelectorAll('.filter-btn');
    this.dom.categoriesContainer = document.querySelector('.assets-categories');

    // Loaders
    this.loaders.gltf = new THREE.GLTFLoader();
    this.loaders.texture = new THREE.TextureLoader();
    this.loaders.hdri = new THREE.RGBELoader();

    // Ensure upload input exists
    if (this.dom.uploadInput) this.dom.uploadInput.multiple = true;

    this._loadFromStorage();
    this._ensureBuiltins();
    this._setupEventListeners();
    this.render();

    console.log("AssetsPanel v3.1 initialized.");
  }

  // ---------------- Public API (HTML hooks preserved) -----------------
  static toggle() { if (!this.dom.panel) return; this.dom.panel.classList.toggle('visible'); }
  static showUploadZone() { if (this.dom.uploadZone) this.dom.uploadZone.classList.add('visible'); }
  static hideUploadZone() { if (this.dom.uploadZone) this.dom.uploadZone.classList.remove('visible'); }
  static refreshAssets() { this.render(); }
  static searchAssets(query) { this.render(query ? query.toLowerCase() : ''); }
  static filterByType(type, element) { this.currentFilter = type; document.querySelectorAll('.filter-btn.active').forEach(b => b.classList.remove('active')); if (element) element.classList.add('active'); this.render(); }
  static selectCategory(category, element) { this.currentCategory = category; document.querySelectorAll('.category-item.active').forEach(c => c.classList.remove('active')); if (element) element.classList.add('active'); this.render(); }

  // File actions (rename/delete/favorite preserved)
  static renameAsset() {
    const asset = this._findById(this.contextAssetId);
    if (!asset) return;
    const newName = prompt("Enter new name:", asset.name);
    if (newName && newName !== asset.name) {
      asset.name = newName;
      this._saveToStorage();
      this.render();
      this.selectAsset(asset.id);
    }
  }

  static deleteAsset() {
    if (!confirm("Are you sure you want to delete this asset(s)?")) return;
    const idsToDelete = this.selectedIds.size ? Array.from(this.selectedIds) : [this.contextAssetId];
    for (const id of idsToDelete) this._removeAsset(id);
    this.selectedIds.clear();
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
    this.folders[id] = { id, name, parentId, children: [] };
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
      for (const asset of this.assets) if (asset.folderId && all.includes(asset.folderId)) asset.folderId = targetParent;
    } else {
      this.assets = this.assets.filter(a => !(a.folderId && all.includes(a.folderId)));
    }
    for (const fid of all) delete this.folders[fid];
    for (const f of Object.values(this.folders)) f.children = f.children.filter(c => !all.includes(c));
    this._saveToStorage(); if (typeof this.onFolderChanged === 'function') this.onFolderChanged(this.folders); this.render();
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
          for (const a of data.assets) { a.id = `asset_${Date.now()}_${Math.floor(Math.random()*1000)}`; this.assets.push(a); }
        }
        if (data.folders) {
          const map = {};
          for (const fid in data.folders) {
            const f = data.folders[fid]; const nid = `folder_${Date.now()}_${Math.floor(Math.random()*1000)}`; map[fid] = nid; this.folders[nid] = { ...f, id: nid, children: [] };
          }
          for (const fid in data.folders) {
            const f = data.folders[fid]; const nid = map[fid];
            this.folders[nid].children = (f.children||[]).map(c => map[c]).filter(Boolean);
            this.folders[nid].parentId = f.parentId ? map[f.parentId] : null;
          }
        }
        this._saveToStorage(); this.render();
      } catch (err) { console.error('Import failed', err); alert('Invalid JSON file'); }
    };
    reader.readAsText(file);
  }

  // Selection
  static selectAsset(assetId, element = null, append = false) {
    if (!append) { this.selectedIds.clear(); }
    if (assetId) { this.selectedIds.add(assetId); this.selectedAssetId = assetId; } else { this.selectedAssetId = null; }
    document.querySelectorAll('.asset-item.selected').forEach(el => el.classList.remove('selected'));
    for (const id of this.selectedIds) {
      const el = this.dom.grid.querySelector(`.asset-item[data-id='${id}']`);
      if (el) el.classList.add('selected');
    }

    // show last selected in properties (single object)
    const asset = this._findById(assetId);
    if (asset) {
      // show extra fields for material
      let propsHtml = `<div class="properties-title">${asset.name}</div>
        <div class="property-row"><div class="property-label">Type</div><div class="property-value">${asset.type.toUpperCase()}</div></div>
        <div class="property-row"><div class="property-label">ID</div><div class="property-value">${asset.id.slice(0,8)}...</div></div>`;
      if (asset.type === 'material' && asset.definition) {
        const d = asset.definition;
        propsHtml += `<div class="property-row"><div class="property-label">Color</div><div class="property-value">${d.color || '—'}</div></div>
          <div class="property-row"><div class="property-label">Roughness</div><div class="property-value">${d.roughness ?? '—'}</div></div>
          <div class="property-row"><div class="property-label">Metalness</div><div class="property-value">${d.metalness ?? '—'}</div></div>`;
        if (d.map) propsHtml += `<div class="property-row"><div class="property-label">Albedo</div><div class="property-value">${this._shortName(d.map)}</div></div>`;
        if (d.normalMap) propsHtml += `<div class="property-row"><div class="property-label">Normal</div><div class="property-value">${this._shortName(d.normalMap)}</div></div>`;
      }
      propsHtml += asset.thumbnail && asset.thumbnail.startsWith('data:image') ? `<img src="${asset.thumbnail}" />` : '';
      this.dom.properties.innerHTML = propsHtml;
    } else {
      this.dom.properties.innerHTML = `<div class="property-row"><div class="property-label">Select an asset</div><div class="property-value">No asset selected</div></div>`;
    }
  }

  // Adds an asset to scene or multiple drop handling
  static async _addToScene(assetId, event = null) {
    const asset = this._findById(assetId) || this._getPrimitiveAssets().find(a => a.id === assetId) || this._getLightAssets().find(a => a.id === assetId);
    if (!asset) { console.error(`AssetsPanel: Could not find asset with ID ${assetId}`); return; }
    if (typeof window.addObjectToScene !== 'function') { console.error("AssetsPanel Error: window.addObjectToScene() is not defined."); return; }

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
        this.loaders.gltf.load(asset.data, gltf => { const model = gltf.scene; model.position.copy(position); window.addObjectToScene(model, asset.name.split('.').slice(0, -1).join('.')); if (typeof this.onAssetAdded === 'function') this.onAssetAdded(asset); });
        break;
      case 'texture':
        this.loaders.texture.load(asset.data, texture => {
          const intersects = this.raycaster.intersectObjects(this.scene.children, true);
          const target = intersects.length > 0 ? intersects[0].object : null;
          if (target && target.isMesh && target.material) {
            // if material is an array or multi-material, apply to first for simplicity
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
        // try to apply material to intersected object (or show message)
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
      if (data.assets) this.assets = data.assets.concat(this.assets.filter(a=>a.isBuiltIn));
      if (data.folders) this.folders = data.folders;
    } catch (e) { console.error('Failed to load assets', e); this._migrateLegacy(); }
  }

  static _migrateLegacy() {
    const old = localStorage.getItem('assetsPanel_assets');
    if (!old) return;
    try {
      const arr = JSON.parse(old);
      this.assets = (arr||[]).map(a => ({ ...a, id: a.id || `asset_${Date.now()}_${Math.floor(Math.random()*1000)}` }));
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
    // Upload zone drag
    if (this.dom.uploadZone) {
      this.dom.uploadZone.ondragover = (e) => { e.preventDefault(); this.dom.uploadZone.classList.add('dragover'); };
      this.dom.uploadZone.ondragleave = () => this.dom.uploadZone.classList.remove('dragover');
      this.dom.uploadZone.ondrop = (e) => { e.preventDefault(); this.dom.uploadZone.classList.remove('dragover'); for (const file of e.dataTransfer.files) this._addAssetFromFile(file, this.openFolderId); this.hideUploadZone(); };
    }
    if (this.dom.uploadInput) {
      this.dom.uploadInput.onchange = (e) => { for (const file of e.target.files) this._addAssetFromFile(file, this.openFolderId); this.hideUploadZone(); };
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

    // header resize
    if (this.dom.header && this.dom.panel) {
      this.dom.header.onmousedown = (e) => {
        if (e.target !== this.dom.header) return;
        const startY = e.clientY, startHeight = this.dom.panel.offsetHeight;
        const mouseMove = (ev) => { this.dom.panel.style.height = `${startHeight - (ev.clientY - startY)}px`; };
        document.addEventListener('mousemove', mouseMove);
        document.addEventListener('mouseup', () => document.removeEventListener('mousemove', mouseMove), { once: true });
      };
    }

    // global click hides context
    document.addEventListener('click', () => { if (this.dom.contextMenu) this.dom.contextMenu.style.display = 'none'; });

    // keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Delete') { if (this.selectedIds.size) this.deleteAsset(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') { e.preventDefault(); this._selectAllInView(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        if (this.selectedIds.size) {
          const names = Array.from(this.selectedIds).map(id => (this._findById(id)||{}).name).filter(Boolean).join('\n');
          navigator.clipboard.writeText(names).catch(()=>{});
        }
      }
    });

    // folder sidebar dblclick -> open
    if (this.dom.categoriesContainer) {
      this.dom.categoriesContainer.addEventListener('dblclick', (e) => {
        const node = e.target.closest('.category-item'); if (!node) return;
        const id = node.dataset.folderId; if (id) { this.openFolderId = id; this.render(); }
      });
    }

    // filters
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.onclick = (e) => {
        const t = btn.dataset.type || btn.getAttribute('data-type');
        if (t) {
          this.filterByType(t, btn);
        }
      };
    });

    // search debounce
    if (this.dom.searchBox) {
      let t = null;
      this.dom.searchBox.oninput = (e) => { clearTimeout(t); t = setTimeout(()=> this.searchAssets(e.target.value), 250); };
    }

    // context menu click handlers will be generated inline when shown
  }

  // ------------------------------------------------------------------
  // Asset ingestion and thumbnails
  // ------------------------------------------------------------------
  static async _addAssetFromFile(file, folderId = null) {
    const type = this._getAssetType(file.name);
    if (!type) return;
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = async () => {
      const id = `asset_${Date.now()}_${Math.floor(Math.random()*1000)}`;
      const dataUrl = reader.result;
      let asset = { id, name: file.name, type, data: dataUrl, thumbnail: null, isFavorite: false, isBuiltIn: false, folderId };

      // If JSON and detected as material, parse definition
      if (type === 'material') {
        // attempt to parse JSON text instead of dataURL for clarity
        const textReader = new FileReader();
        textReader.readAsText(file);
        textReader.onload = () => {
          try {
            const def = JSON.parse(textReader.result);
            asset.definition = def;
            // generate material preview thumbnail
            this._generateMaterialThumbnail(def).then(t => { asset.thumbnail = t; this.assets.push(asset); this._saveToStorage(); this.render(); if (typeof this.onAssetAdded === 'function') this.onAssetAdded(asset); });
          } catch (err) {
            console.warn('Invalid material JSON', err);
            asset.thumbnail = this._svgIcon('material');
            this.assets.push(asset); this._saveToStorage(); this.render();
          }
        };
        return;
      }

      // For textures/models/hdri: generate thumbnail
      asset.thumbnail = await this._generateThumbnail(dataUrl, type, file);
      this.assets.push(asset);
      this._saveToStorage();
      this.render();
      if (typeof this.onAssetAdded === 'function') this.onAssetAdded(asset);
    };
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
      // Attempt GLTF preview (like before) else fallback to model icon
      const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
      renderer.setSize(128, 128);
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
      scene.add(new THREE.AmbientLight(0xffffff, 2.0));
      scene.add(new THREE.DirectionalLight(0xffffff, 2.0).position.set(2,3,1));
      return new Promise(resolve => {
        this.loaders.gltf.load(dataURL, gltf => {
          const model = gltf.scene; const box = new THREE.Box3().setFromObject(model); const center = box.getCenter(new THREE.Vector3()); const size = box.getSize(new THREE.Vector3()); const maxDim = Math.max(size.x, size.y, size.z) || 1;
          camera.position.copy(center); camera.position.z += maxDim * 1.5; camera.lookAt(center);
          scene.add(model);
          renderer.render(scene, camera);
          resolve(renderer.domElement.toDataURL('image/png'));
          renderer.dispose();
        }, ()=>{}, ()=>{ resolve(this._svgIcon('model')); });
      });
    }
    return Promise.resolve(this._svgIcon(type));
  }

  // Small material preview: render a lit sphere with maps if available (returns dataURL)
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

  static _fallbackThumb(type) { return this._svgIcon(type); }

  // Simple inline SVG icons for types (string)
  static _svgIcon(type) {
    const icons = {
      model: `<svg viewBox="0 0 24 24" width="64" height="64" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M12 2 2 7l10 5 10-5-10-5zm0 8-10-5v12l10 5V10zm0 0 10-5v12l-10 5V10z"/></svg>`,
      texture: `<svg viewBox="0 0 24 24" width="64" height="64" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="3" width="18" height="18" stroke="currentColor" fill="none" stroke-width="1.5"/><path fill="currentColor" d="M7 7h10v10H7z"/></svg>`,
      hdri: `<svg viewBox="0 0 24 24" width="64" height="64" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="9" stroke="currentColor" fill="none" stroke-width="1.5"/></svg>`,
      material: `<svg viewBox="0 0 24 24" width="64" height="64" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="7" fill="currentColor"/></svg>`,
      primitive: `<svg viewBox="0 0 24 24" width="64" height="64" xmlns="http://www.w3.org/2000/svg"><rect x="6" y="6" width="12" height="12" stroke="currentColor" fill="none" stroke-width="1.5"/></svg>`,
      light: `<svg viewBox="0 0 24 24" width="64" height="64" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M9 21h6v-1H9v1zm3-20C6.48 1 2 5.48 2 11c0 3.53 1.99 6.62 5 8.21V21h10v-1.79c3.01-1.59 5-4.68 5-8.21 0-5.52-4.48-10-10-10z"/></svg>`
    };
    return icons[type] || icons.model;
  }

  // ------------------------------------------------------------------
  // Rendering UI: Folders + Assets grid
  // ------------------------------------------------------------------
  static render(searchQuery = '') {
    if (!this.dom.grid) return;
    this._renderFolderSidebar();

    let assetsToRender = [];
    switch (this.currentCategory) {
      case 'project': assetsToRender = this.assets.filter(a => (this.openFolderId ? a.folderId === this.openFolderId : !a.folderId)); break;
      case 'favorites': assetsToRender = this.assets.filter(a => a.isFavorite); break;
      case 'primitives': assetsToRender = this._getPrimitiveAssets(); break;
      case 'lights': assetsToRender = this._getLightAssets(); break;
      default: assetsToRender = this.assets; break;
    }
    if (this.currentFilter !== 'all') assetsToRender = assetsToRender.filter(a => a.type === this.currentFilter);
    if (searchQuery) assetsToRender = assetsToRender.filter(a => (a.name||'').toLowerCase().includes(searchQuery) || (a.tags||[]).some(t => t.includes(searchQuery)));

    this.dom.grid.innerHTML = '';
    for (const asset of assetsToRender) {
      const item = document.createElement('div');
      item.className = `asset-item ${asset.isFavorite ? 'favorite' : ''} ${this.selectedIds.has(asset.id) ? 'selected' : ''}`;
      item.dataset.id = asset.id; item.draggable = true;

      const thumbHtml = (asset.thumbnail && asset.thumbnail.startsWith('data:image')) ? `<img src="${asset.thumbnail}" />` : (asset.thumbnail ? asset.thumbnail : this._svgIcon(asset.type));
      item.innerHTML = `<div class="asset-thumbnail">${thumbHtml}</div><div class="asset-name">${asset.name}</div><div class="asset-meta">${asset.type}</div>`;

      item.onclick = (e) => {
        const append = e.ctrlKey || e.metaKey;
        this.selectAsset(asset.id, item, append);
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

  static _renderFolderSidebar() {
    const container = document.querySelector('.assets-categories');
    if (!container) return;
    container.innerHTML = '';
    const top = document.createElement('div'); top.className = 'folder-actions';
    top.innerHTML = `<button class="panel-btn" onclick="AssetsPanel.createFolder()">+ Folder</button>
      <button class="panel-btn" onclick="AssetsPanel.exportJSON()">Export</button>
      <label class="panel-btn file-import">Import<input type="file" style="display:none" onchange="(function(e){ AssetsPanel.importJSON(e.target.files[0]); })(event)"/></label>`;
    container.appendChild(top);

    const root = document.createElement('div'); root.className = `category-item ${!this.openFolderId && this.currentCategory==='project' ? 'active' : ''}`; root.dataset.folderId = ''; root.innerHTML = `<span class="category-icon">${this._svgIcon('primitive')}</span> Project Assets (root)`; root.onclick = () => { this.openFolderId = null; this.currentCategory = 'project'; document.querySelectorAll('.category-item.active').forEach(c => c.classList.remove('active')); root.classList.add('active'); this.render(); };
    container.appendChild(root);

    const buildList = (parentId, depth=0) => {
      const folders = Object.values(this.folders).filter(f => (f.parentId||null) === (parentId||null)).sort((a,b)=> a.name.localeCompare(b.name));
      for (const f of folders) {
        const el = document.createElement('div');
        el.className = `category-item ${this.openFolderId===f.id && this.currentCategory==='project' ? 'active' : ''}`;
        el.style.paddingLeft = `${12 + depth*12}px`;
        el.dataset.folderId = f.id;
        el.innerHTML = `<span class="category-icon">${this._svgIcon('primitive')}</span> ${f.name}`;
        el.onclick = (ev) => { ev.stopPropagation(); this.openFolderId = f.id; this.currentCategory='project'; document.querySelectorAll('.category-item.active').forEach(c => c.classList.remove('active')); el.classList.add('active'); this.render(); };
        el.oncontextmenu = (ev) => { ev.preventDefault(); this._showFolderContextMenu(ev, f.id); };
        container.appendChild(el);
        buildList(f.id, depth+1);
      }
    };
    buildList(null, 0);
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
    create('Delete', ()=> this.deleteAsset(), 'color: var(--danger-color);');
  }

  static _showFolderContextMenu(event, folderId) {
    this.dom.contextMenu.style.display = 'block';
    this.dom.contextMenu.style.left = `${event.clientX}px`;
    this.dom.contextMenu.style.top = `${event.clientY}px`;
    this.dom.contextMenu.innerHTML = '';
    const create = (label, cb, style='') => { const d = document.createElement('div'); d.className = 'context-menu-item'; if (style) d.style = style; d.textContent = label; d.onclick = () => { cb(); this.dom.contextMenu.style.display='none'; }; this.dom.contextMenu.appendChild(d); };
    create('Rename Folder', ()=> this.renameFolder(folderId));
    create('Delete Folder (Move contents to parent)', ()=> this.deleteFolder(folderId, {deleteContents:false}));
    create('Delete Folder & Contents', ()=> { if (confirm('Delete folder and all its contents?')) this.deleteFolder(folderId, {deleteContents:true}); });
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
  static _removeAsset(id) { const idx = this.assets.findIndex(a => a.id === id); if (idx >= 0) { const [rem] = this.assets.splice(idx,1); if (typeof this.onAssetRemoved === 'function') this.onAssetRemoved(rem.id); } }

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
      { id: 'prim_cube', name: 'Cube', type: 'primitive', isBuiltIn: true, thumbnail: this._svgIcon('primitive'), factory: () => new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), defaultMaterial()) },
      { id: 'prim_sphere', name: 'Sphere', type: 'primitive', isBuiltIn: true, thumbnail: this._svgIcon('primitive'), factory: () => new THREE.Mesh(new THREE.SphereGeometry(0.5, 32, 16), defaultMaterial()) },
      { id: 'prim_plane', name: 'Plane', type: 'primitive', isBuiltIn: true, thumbnail: this._svgIcon('primitive'), factory: () => new THREE.Mesh(new THREE.PlaneGeometry(1, 1), defaultMaterial()) },
      { id: 'prim_cylinder', name: 'Cylinder', type: 'primitive', isBuiltIn: true, thumbnail: this._svgIcon('primitive'), factory: () => new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1, 32), defaultMaterial()) },
      { id: 'prim_wall', name: 'Wall', type: 'primitive', isBuiltIn: true, thumbnail: this._svgIcon('primitive'), factory: () => new THREE.Mesh(new THREE.BoxGeometry(4, 2.5, 0.15), defaultMaterial()) },
      { id: 'prim_stair', name: 'Stairs', type: 'primitive', isBuiltIn: true, thumbnail: this._svgIcon('primitive'), factory: () => {
        const steps = 10; const stepWidth = 1.2, stepHeight = 0.2, stepDepth = 0.3; const group = new THREE.Group();
        for (let i = 0; i < steps; i++) { const geom = new THREE.BoxGeometry(stepWidth, stepHeight, stepDepth); const mesh = new THREE.Mesh(geom, defaultMaterial()); mesh.position.set(0, stepHeight / 2 + i * stepHeight, i * stepDepth); group.add(mesh); }
        const boundingBox = new THREE.BoxGeometry(stepWidth, steps * stepHeight, steps * stepDepth); const wrapper = new THREE.Mesh(boundingBox, new THREE.MeshBasicMaterial({ visible: false, transparent: true, opacity: 0 })); wrapper.add(group); group.position.y = - (steps * stepHeight) / 2; group.position.z = - (steps * stepDepth) / 2; return wrapper;
      }},
      { id: 'prim_arch', name: 'Arch', type: 'primitive', isBuiltIn: true, thumbnail: this._svgIcon('primitive'), factory: () => { const shape = new THREE.Shape(); shape.moveTo(-1,0); shape.lineTo(-1,1.5); shape.absarc(0,1.5,1,Math.PI,0,true); shape.lineTo(1,0); shape.lineTo(-1,0); const extrudeSettings = { depth: 0.2, bevelEnabled: false }; const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings); geometry.center(); return new THREE.Mesh(geometry, defaultMaterial()); }},
      { id: 'prim_column', name: 'Column', type: 'primitive', isBuiltIn: true, thumbnail: this._svgIcon('primitive'), factory: () => new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 3, 20), defaultMaterial()) },
    ];
  }

  static _getLightAssets() {
    return [
      { id: 'light_point', name: 'Point Light', type: 'light', isBuiltIn: true, thumbnail: this._svgIcon('light'), factory: () => { const light = new THREE.PointLight(0xffffff, 50, 10); light.castShadow = true; return light; }},
      { id: 'light_sun', name: 'Sun Light', type: 'light', isBuiltIn: true, thumbnail: this._svgIcon('light'), factory: () => { const light = new THREE.DirectionalLight(0xfff5e1, 8); light.castShadow = true; light.shadow.mapSize.width = 2048; light.shadow.mapSize.height = 2048; light.shadow.camera.near = 0.5; light.shadow.camera.far = 50; light.shadow.bias = -0.0001; return light; }},
      { id: 'light_spot', name: 'Spotlight', type: 'light', isBuiltIn: true, thumbnail: this._svgIcon('light'), factory: () => { const light = new THREE.SpotLight(0xffffff, 200, 20, Math.PI/6, 0.2, 1.5); light.castShadow = true; return light; }},
      { id: 'light_rect', name: 'Rect Area Light', type: 'light', isBuiltIn: true, thumbnail: this._svgIcon('light'), factory: () => { const light = new THREE.RectAreaLight(0x87ceeb, 10, 2, 3); return light; }},
      { id: 'light_hemi', name: 'Hemisphere Sky', type: 'light', isBuiltIn: true, thumbnail: this._svgIcon('light'), factory: () => { const light = new THREE.HemisphereLight(0x87ceeb, 0x404040, 2); return light; }},
    ];
  }

  // ensure builtins are present in assets array (without duplicating)
  static _ensureBuiltins() {
    const builtinPrims = this._getPrimitiveAssets();
    const builtinLights = this._getLightAssets();
    for (const b of [...builtinPrims, ...builtinLights]) {
      if (!this.assets.some(a => a.id === b.id)) this.assets.unshift(b);
    }
  }

  // ------------------------------------------------------------------
  // Utility: get type from filename (including material json)
  // ------------------------------------------------------------------
  static _getAssetType = (filename) => {
    const ext = filename.split('.').pop().toLowerCase();
    if (['glb','gltf'].includes(ext)) return 'model';
    if (['png','jpg','jpeg','webp','bmp'].includes(ext)) return 'texture';
    if (['hdr','exr'].includes(ext)) return 'hdri';
    if (['json'].includes(ext)) return 'material';
    return null;
  };

  // single asset export
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

  // Apply material asset to a mesh (loads maps and sets PBR material)
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
      // preserve some settings from previous material (like side)
      if (mesh.material && mesh.material.side) mat.side = mesh.material.side;
      mesh.material = mat;
      mesh.material.needsUpdate = true;
      console.log(`Applied material '${asset.name}' to ${mesh.name || mesh.uuid}`);
    });
  }

  // ------------------------------------------------------------------
  // single asset export helper, shortname
  // ------------------------------------------------------------------
  static _shortName(src) {
    try { return src.split('/').pop(); } catch (e) { return src; }
  }

  // END OF CLASS
}
