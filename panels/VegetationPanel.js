// panels/VegetationPanel.js

window.VegetationPanel = {
    _isOpen: false,
    init() {
        const container = window.PanelDockManager?.mountPanel?.({
            id: 'vegetation', title: 'Vegetation', icon: 'fas fa-leaf',
            elementId: 'vegetation-painter-container', className: 'property-group', display: 'block',
        });
        if (!container) return;

        // Initialize VegetationSystem globally if not already constructed
        if (!window.vegetationSystem && (window.scene || window.editorScene)) {
            const rendererDom = window.renderer?.domElement ||
                document.querySelector('#renderer-container canvas') ||
                document.getElementById('renderer-container');
            window.vegetationSystem = new VegetationSystem(
                window.scene || window.editorScene,
                window.camera || window.mainCamera,
                rendererDom
            );
            
            // Auto-detect terrain
            this.syncTerrainReference();
        }
        if (window.__pendingVegetationData && window.vegetationSystem) {
            window.vegetationSystem.deserialize(window.__pendingVegetationData);
            delete window.__pendingVegetationData;
        }

        this.renderPanel(container);
    },

    syncTerrainReference() {
        const sys = window.vegetationSystem;
        if (!sys) return;

        if (window.terrain) {
            sys.setTerrainMeshes(window.terrain);
        } else {
            const candidates = [];
            window.scene?.traverse(obj => {
                const name = String(obj.name || '').toLowerCase();
                if (obj.isMesh && !obj.userData?.isVegetation &&
                    (obj.userData?.isTerrain || name.includes('terrain') || name.includes('ground'))) {
                    candidates.push(obj);
                }
            });
            sys.setTerrainMeshes(candidates);
        }
    },

    renderPanel(container) {
        container.innerHTML = `
            <div class="pro-group-label" style="background: #1a1a1a; display: flex; align-items: center; gap: 6px; padding: 6px 12px; font-size: 9px; font-weight: 800; color: #666; text-transform: uppercase; letter-spacing: 1px; border-bottom: 1px solid #333;">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: #00ffcc;">
                    <path d="M12 2L2 22h20L12 2z"/>
                </svg>
                VEGETATION GENERATOR
            </div>

            <div style="padding: 12px;">
                <!-- Mode Controller -->
                <div class="ph-card" style="background: #1f1f24; border: 1px solid #2d2d35; padding: 8px; border-radius: 4px; margin-bottom: 10px;">
                    <button class="ph-btn ph-btn-large ph-btn-primary" id="veg-toggle-active-btn" style="width:100%; margin-bottom: 6px; font-weight: bold;">
                        Enable Painting Tools
                    </button>
                    <div style="display: flex; gap: 4px;">
                        <button class="ph-btn" id="veg-mode-paint-btn" style="flex:1; font-size:11px; padding: 5px;">Paint</button>
                        <button class="ph-btn" id="veg-mode-erase-btn" style="flex:1; font-size:11px; padding: 5px;">Erase</button>
                    </div>
                    <div style="display: flex; gap: 4px; margin-top:4px;">
                        <button class="ph-btn" id="veg-mode-single-btn" style="flex:1; font-size:10px; padding: 5px;">Single</button>
                        <button class="ph-btn" id="veg-mode-fill-btn" style="flex:1; font-size:10px; padding: 5px;">Fill Brush</button>
                    </div>
                </div>

                <!-- Species Library Selection -->
                <div class="ph-card" style="background: #1f1f24; border: 1px solid #2d2d35; padding: 8px; border-radius: 4px; margin-bottom: 10px;">
                    <div style="font-size: 10px; font-weight: bold; color: #888; margin-bottom: 6px; text-transform: uppercase;">Foliage Mesh List</div>
                    <div id="veg-species-list" style="display: grid; grid-template-columns: 1fr; gap: 5px; max-height: 145px; overflow-y: auto;"></div>
                    <div id="veg-asset-drop" style="margin-top:8px; padding:9px 6px; border:1px dashed #4a7168; border-radius:4px; color:#8bbeb0; text-align:center; font-size:10px; background:rgba(0,255,204,.035);">
                        Drop a model from Content Browser here
                    </div>
                    <div style="display:flex; gap:5px; margin-top:6px;">
                        <button class="ph-btn" id="veg-add-selected-asset" style="flex:1; font-size:10px; padding:6px;">Add Selected Asset</button>
                        <button class="ph-btn" id="veg-add-selected-model" style="flex:1; font-size:10px; padding:6px;">Use Scene Mesh</button>
                    </div>
                    <div id="veg-asset-status" style="font-size:9px; color:#777; margin-top:5px; min-height:12px;"></div>
                </div>

                <!-- Core Brush Controls -->
                <div class="ph-card" style="background: #1f1f24; border: 1px solid #2d2d35; padding: 8px; border-radius: 4px; margin-bottom: 10px;">
                    <div style="font-size: 10px; font-weight: bold; color: #888; margin-bottom: 6px; text-transform: uppercase;">Brush Settings</div>
                    
                    <div class="ph-prop-row" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                        <span style="font-size: 11px; color: #aaa;">Radius</span>
                        <div style="display: flex; gap: 6px; align-items: center; width: 65%;">
                            <input type="range" id="veg-brush-radius" min="0.5" max="15" step="0.5" value="2.5" style="width: 100%; accent-color: #00ffcc;">
                            <span id="veg-brush-radius-lbl" style="font-size: 10px; color: #00ffaa; background: #111; padding: 1px 4px; min-width: 20px; text-align: center;">2.5</span>
                        </div>
                    </div>

                    <div class="ph-prop-row" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                        <span style="font-size: 11px; color: #aaa;">Density</span>
                        <div style="display: flex; gap: 6px; align-items: center; width: 65%;">
                            <input type="range" id="veg-brush-density" min="1" max="100" step="1" value="15" style="width: 100%; accent-color: #00ffcc;">
                            <span id="veg-brush-density-lbl" style="font-size: 10px; color: #00ffaa; background: #111; padding: 1px 4px; min-width: 20px; text-align: center;">15</span>
                        </div>
                    </div>

                    <div class="ph-prop-row" style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-size: 11px; color: #aaa;">Norm Align</span>
                        <div style="display: flex; gap: 6px; align-items: center; width: 65%;">
                            <input type="range" id="veg-brush-align" min="0" max="1" step="0.05" value="0.8" style="width: 100%; accent-color: #00ffcc;">
                            <span id="veg-brush-align-lbl" style="font-size: 10px; color: #00ffaa; background: #111; padding: 1px 4px; min-width: 20px; text-align: center;">0.8</span>
                        </div>
                    </div>
                    <div class="ph-prop-row" style="display: flex; justify-content: space-between; align-items: center; margin-top:6px;">
                        <span style="font-size: 11px; color: #aaa;">Scale Min</span>
                        <input type="range" id="veg-scale-min" min="0.1" max="3" step="0.05" value="0.8" style="width: 65%; accent-color: #00ffcc;">
                    </div>
                    <div class="ph-prop-row" style="display: flex; justify-content: space-between; align-items: center; margin-top:6px;">
                        <span style="font-size: 11px; color: #aaa;">Scale Max</span>
                        <input type="range" id="veg-scale-max" min="0.1" max="3" step="0.05" value="1.3" style="width: 65%; accent-color: #00ffcc;">
                    </div>
                </div>

                <!-- Dynamic Wind Animation Parameter Deck -->
                <div class="ph-card" style="background: #1f1f24; border: 1px solid #2d2d35; padding: 8px; border-radius: 4px; margin-bottom: 10px;">
                    <div style="font-size: 10px; font-weight: bold; color: #888; margin-bottom: 6px; text-transform: uppercase;">Wind Physics</div>
                    
                    <div class="ph-prop-row" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                        <span style="font-size: 11px; color: #aaa;">Speed</span>
                        <input type="range" id="veg-wind-speed" min="0" max="5" step="0.1" value="1.2" style="width: 65%; accent-color: #00ffcc;">
                    </div>

                    <div class="ph-prop-row" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                        <span style="font-size: 11px; color: #aaa;">Strength</span>
                        <input type="range" id="veg-wind-strength" min="0" max="1" step="0.05" value="0.15" style="width: 65%; accent-color: #00ffcc;">
                    </div>

                    <div class="ph-prop-row" style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-size: 11px; color: #aaa;">Turbulence</span>
                        <input type="range" id="veg-wind-turb" min="0" max="2" step="0.05" value="0.5" style="width: 65%; accent-color: #00ffcc;">
                    </div>
                </div>

                <!-- Nanite-style instance visibility controls -->
                <div class="ph-card" style="background: #1f1f24; border: 1px solid #2d2d35; padding: 8px; border-radius: 4px; margin-bottom: 10px;">
                    <div style="font-size: 10px; font-weight: bold; color: #888; margin-bottom: 6px; text-transform: uppercase;">Foliage Performance</div>
                    <label style="display:flex; align-items:center; gap:7px; font-size:11px; color:#aaa; margin-bottom:7px;">
                        <input type="checkbox" id="veg-culling-enabled" checked style="accent-color:#00ffcc;">
                        Instance Frustum Culling
                    </label>
                    <div class="ph-prop-row" style="display:flex; justify-content:space-between; align-items:center;">
                        <span style="font-size:11px; color:#aaa;">Cull Distance</span>
                        <div style="display:flex; gap:6px; align-items:center; width:65%;">
                            <input type="range" id="veg-cull-distance" min="25" max="1500" step="25" value="300" style="width:100%; accent-color:#00ffcc;">
                            <span id="veg-cull-distance-lbl" style="font-size:10px; color:#00ffaa; background:#111; padding:1px 4px; min-width:30px; text-align:center;">300</span>
                        </div>
                    </div>
                </div>

                <!-- Done & Operations -->
                <div style="display: flex; flex-direction: column; gap: 6px; margin-top: 12px;">
                    <button class="ph-btn" id="veg-clear-btn" style="width:100%; border: 1px solid #4a1a1a; background: #200f0f; color: #f66; font-size:11px; padding: 6px;">Clear Foliage</button>
                    <button class="ph-btn ph-btn-primary" id="veg-done-btn" style="width:100%; font-weight: bold; background: #2196f3; color: white; border: 1px solid #0056b3; font-size:11px; padding: 8px; border-radius:4px; margin-top: 4px;">Done & Close Painter</button>
                </div>
            </div>
        `;

        this.renderSpeciesList();
        this.bindEvents();
    },

    renderSpeciesList() {
        const list = document.getElementById('veg-species-list');
        const sys = window.vegetationSystem;
        if (!list || !sys) return;
        list.innerHTML = '';
        sys.getSpeciesLibrary?.().forEach(species => {
            const row = document.createElement('div');
            row.style.cssText = 'display:flex; gap:4px; align-items:center;';
            const button = document.createElement('button');
            button.className = `ph-btn veg-species-btn ${sys.activeSpecies === species.id ? 'ph-btn-primary active' : ''}`;
            button.dataset.species = species.id;
            button.style.cssText = 'flex:1; text-align:left; font-size:10px; padding:6px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;';
            button.title = `${species.label} (${species.count} instances)`;
            button.innerHTML = `<i class="fas ${species.builtIn ? 'fa-leaf' : 'fa-cube'}" style="margin-right:5px;"></i>${species.label}<span style="float:right; opacity:.55;">${species.count}</span>`;
            button.addEventListener('click', () => {
                sys.setActiveSpecies?.(species.id);
                this.renderSpeciesList();
            });
            row.appendChild(button);
            if (!species.builtIn) {
                const remove = document.createElement('button');
                remove.className = 'ph-btn';
                remove.title = 'Remove foliage type';
                remove.style.cssText = 'width:24px; padding:5px; color:#e88989;';
                remove.innerHTML = '<i class="fas fa-times"></i>';
                remove.addEventListener('click', () => {
                    sys.unregisterSpecies?.(species.id);
                    this.renderSpeciesList();
                });
                row.appendChild(remove);
            }
            list.appendChild(row);
        });
    },

    setAssetStatus(message, error = false) {
        const status = document.getElementById('veg-asset-status');
        if (status) {
            status.textContent = message || '';
            status.style.color = error ? '#e88989' : '#8bbeb0';
        }
    },

    async addAssetToFoliage(asset) {
        const sys = window.vegetationSystem;
        if (!sys || !asset) return;
        if (asset.type !== 'model') {
            this.setAssetStatus('Select a mesh/model asset, not a texture.', true);
            return;
        }
        this.setAssetStatus(`Loading ${asset.name}...`);
        const ok = await sys.registerAsset?.(asset);
        this.setAssetStatus(ok ? `${asset.name} added to foliage list.` : 'Could not load this model.', !ok);
        if (ok) this.renderSpeciesList();
    },

    addSelectedAsset() {
        const panel = window.AssetsPanel;
        const id = panel?.selectedAssetId;
        const asset = panel?._findById?.(id) || panel?.assets?.find?.(item => item.id === id);
        if (!asset) {
            this.setAssetStatus('Select a model in Content Browser first.', true);
            return;
        }
        this.addAssetToFoliage(asset);
    },

    addSelectedSceneMesh() {
        const sys = window.vegetationSystem;
        const object = window.selectedObject || window.transformControls?.object;
        if (!sys || !object?.isObject3D) {
            this.setAssetStatus('Select a mesh/group in the viewport first.', true);
            return;
        }
        const id = `scene_${String(object.uuid || object.name || Date.now()).replace(/[^a-z0-9_-]/gi, '_')}`;
        const ok = sys.registerSpeciesFromObject?.(id, object, object.name || 'Scene Foliage', {
            sourceAssetId: object.userData?.sourceAssetId || null,
            sourceAssetName: object.name || 'Scene Foliage',
            maxCount: 5000,
            targetHeight: 2.5,
        });
        this.setAssetStatus(ok ? `${object.name || 'Mesh'} added to foliage list.` : 'Selected object has no renderable meshes.', !ok);
        if (ok) this.renderSpeciesList();
    },

    bindEvents() {
        const sys = window.vegetationSystem;
        if (!sys) return;

        // Toggle activation
        const activeBtn = document.getElementById('veg-toggle-active-btn');
        if (activeBtn) {
            activeBtn.addEventListener('click', () => {
                sys.setEnabled?.(!sys.enabled);
                activeBtn.textContent = sys.enabled ? 'Painting Enabled' : 'Enable Painting Tools';
                activeBtn.classList.toggle('ph-btn-primary', sys.enabled);
            });
        }

        // Toggle draw modes
        const paintBtn = document.getElementById('veg-mode-paint-btn');
        const eraseBtn = document.getElementById('veg-mode-erase-btn');
        const singleBtn = document.getElementById('veg-mode-single-btn');
        const fillBtn = document.getElementById('veg-mode-fill-btn');
        
        const updateModeUI = () => {
            [[paintBtn, 'paint'], [eraseBtn, 'erase'], [singleBtn, 'single'], [fillBtn, 'fill']]
                .forEach(([button, mode]) => button?.classList.toggle('ph-btn-primary', sys.mode === mode));
        };
        updateModeUI();

        paintBtn?.addEventListener('click', () => { sys.setMode?.('paint'); updateModeUI(); });
        eraseBtn?.addEventListener('click', () => { sys.setMode?.('erase'); updateModeUI(); });
        singleBtn?.addEventListener('click', () => { sys.setMode?.('single'); updateModeUI(); });
        fillBtn?.addEventListener('click', () => { sys.setMode?.('fill'); updateModeUI(); });

        document.getElementById('veg-add-selected-asset')?.addEventListener('click', () => {
            this.addSelectedAsset();
        });
        document.getElementById('veg-add-selected-model')?.addEventListener('click', () => {
            this.addSelectedSceneMesh();
        });
        const assetDrop = document.getElementById('veg-asset-drop');
        assetDrop?.addEventListener('dragover', (event) => {
            event.preventDefault();
            assetDrop.style.background = 'rgba(0,255,204,.15)';
        });
        assetDrop?.addEventListener('dragleave', () => {
            assetDrop.style.background = 'rgba(0,255,204,.035)';
        });
        assetDrop?.addEventListener('drop', (event) => {
            event.preventDefault();
            assetDrop.style.background = 'rgba(0,255,204,.035)';
            try {
                const data = JSON.parse(event.dataTransfer.getData('application/json'));
                const panel = window.AssetsPanel;
                const asset = panel?._findById?.(data.assetId) || panel?.assets?.find?.(item => item.id === data.assetId);
                this.addAssetToFoliage(asset);
            } catch {
                this.setAssetStatus('Drag a model asset from Content Browser.', true);
            }
        });

        // Sliders & UI params
        document.getElementById('veg-brush-radius')?.addEventListener('input', (e) => {
            sys.brushRadius = parseFloat(e.target.value);
            const label = document.getElementById('veg-brush-radius-lbl');
            if (label) label.textContent = e.target.value;
        });

        document.getElementById('veg-brush-density')?.addEventListener('input', (e) => {
            sys.brushDensity = parseInt(e.target.value, 10);
            const label = document.getElementById('veg-brush-density-lbl');
            if (label) label.textContent = e.target.value;
        });

        document.getElementById('veg-brush-align')?.addEventListener('input', (e) => {
            sys.normalAlignment = parseFloat(e.target.value);
            const label = document.getElementById('veg-brush-align-lbl');
            if (label) label.textContent = e.target.value;
        });
        document.getElementById('veg-scale-min')?.addEventListener('input', (e) => {
            sys.scaleMin = Math.min(parseFloat(e.target.value), sys.scaleMax);
        });
        document.getElementById('veg-scale-max')?.addEventListener('input', (e) => {
            sys.scaleMax = Math.max(parseFloat(e.target.value), sys.scaleMin);
        });

        // Wind Physics Updates
        document.getElementById('veg-wind-speed')?.addEventListener('input', (e) => { sys.windSpeed = parseFloat(e.target.value); });
        document.getElementById('veg-wind-strength')?.addEventListener('input', (e) => { sys.windStrength = parseFloat(e.target.value); });
        document.getElementById('veg-wind-turb')?.addEventListener('input', (e) => { sys.windTurbulence = parseFloat(e.target.value); });

        document.getElementById('veg-culling-enabled')?.addEventListener('change', (e) => {
            sys.cullingEnabled = e.target.checked;
            sys._lastCullAt = 0;
            if (!sys.cullingEnabled) Object.keys(sys.speciesMap || {}).forEach(id => sys.rebuildInstances?.(id));
        });
        document.getElementById('veg-cull-distance')?.addEventListener('input', (e) => {
            sys.cullDistance = parseFloat(e.target.value);
            sys._lastCullAt = 0;
            const label = document.getElementById('veg-cull-distance-lbl');
            if (label) label.textContent = e.target.value;
        });

        // Operations
        document.getElementById('veg-clear-btn')?.addEventListener('click', () => {
            if (confirm('Clear all foliage meshes from scene?')) sys.clear();
        });

        // Close / Done Button Action
        document.getElementById('veg-done-btn')?.addEventListener('click', () => {
            this.close();
        });
    },

    open() {
        const mode = String(
            window.workspaceManager?.currentMode ||
            window.currentWorkspaceMode ||
            localStorage.getItem('sm_workspace_mode') ||
            ''
        ).toUpperCase();
        if (mode && mode !== 'TERRAIN') return;
        this.init();
        this.syncTerrainReference();

        window.PanelDockManager?.openPanel?.('vegetation');
        document.getElementById('vegetationPainterBtn')?.classList.add('active');
        document.getElementById('sculptingLandscapeBtn')?.classList.remove('active');

        this._isOpen = true;
    },

    close() {
        // 1. Deactivate sculpting mode immediately
        const sys = window.vegetationSystem;
        if (sys) {
            sys.setEnabled?.(false);
            sys.enabled = false;
            if (sys.brushHelper) sys.brushHelper.visible = false;
        }
        // The dock owns view visibility. Return to terrain sculpt when it is
        // the active terrain workflow, without touching other panels.
        window.PanelDockManager?.closePanel?.('vegetation');
        const mode = String(
            window.workspaceManager?.currentMode ||
            window.currentWorkspaceMode ||
            localStorage.getItem('sm_workspace_mode') ||
            ''
        ).toUpperCase();
        if (mode === 'TERRAIN') {
            window.requestTerrainSculptingWorkspace?.();
            document.getElementById('physics-controls')?.classList.remove('active');
        }

        // 4. Remove highlight state from the sidebar button
        const vegBtn = document.getElementById('vegetationPainterBtn');
        if (vegBtn) vegBtn.classList.remove('active');
        this._isOpen = false;
    },

    isOpen() {
        const container = document.getElementById('vegetation-painter-container');
        return this._isOpen || !!(container && !container.hidden);
    },

    toggle() {
        if (this.isOpen()) this.close();
        else this.open();
    },

    toggleSiblingPanels(show) {
        // Compatibility shim for older callers. Visibility is dock-managed.
        return !!show;
    }
};
