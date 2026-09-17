// ============================================================================
// InspectorPanel.js — Fixed: panel slots pre-reserved, no !important conflicts
// ============================================================================

// One owner for Inspector collapse/expand state. This keeps the CSS layout
// variable, viewport, timeline, toolbar and renderer synchronized even while
// a secondary sidebar (Architecture, History, etc.) is open.
window.setInspectorCollapsed = function setInspectorCollapsed(collapsed) {
  const inspector = document.getElementById("inspector-panel");
  if (!inspector) return false;

  const shouldCollapse = !!collapsed;
  const root = document.documentElement;
  const sidebarWidth =
    parseFloat(
      getComputedStyle(root).getPropertyValue("--inspector-sidebar-width"),
    ) || 44;
  const layoutRevision = String(
    (Number(inspector.dataset.layoutRevision) || 0) + 1,
  );
  inspector.dataset.layoutRevision = layoutRevision;
  inspector.dataset.layoutTransitioning = "true";

  if (shouldCollapse) {
    const currentWidth = Math.round(
      inspector.getBoundingClientRect().width || 0,
    );
    if (currentWidth > sidebarWidth + 1) {
      inspector.dataset.expandedWidth = `${currentWidth}px`;
      root.style.setProperty("--inspector-width-default", `${currentWidth}px`);
      root.style.setProperty("--inspector-width", `${currentWidth}px`);
    }
    inspector.classList.add("closed");
    // The Inspector's icon rail remains visible while collapsed, so the
    // viewport must continue to reserve exactly that rail width.
    root.style.setProperty("--inspector-live-width", `${sidebarWidth}px`);
  } else {
    const expandedWidth =
      inspector.dataset.expandedWidth || "var(--inspector-width-default)";
    root.style.setProperty("--inspector-live-width", expandedWidth);
    inspector.classList.remove("closed");
  }

  [
    document.querySelector(".editor-scene"),
    document.querySelector(".timeline"),
    document.getElementById("subToolBar"),
    document.getElementById("navigator-container"),
    document.querySelector(".node-editor"),
    document.querySelector(".sound-controls-header"),
    document.querySelector(".site-modal-container"),
  ]
    .filter(Boolean)
    .forEach((element) => {
      element.classList.toggle("expanded", shouldCollapse);
    });

  document
    .getElementById("toggle-inspector")
    ?.classList.toggle("active", !shouldCollapse);

  const syncLayout = () => {
    window.dispatchEvent(new Event("sm:sync-layout"));
    window.dispatchEvent(new Event("resize"));
    window.onWindowResize?.();
  };
  requestAnimationFrame(syncLayout);
  setTimeout(() => {
    if (inspector.dataset.layoutRevision !== layoutRevision) return;
    delete inspector.dataset.layoutTransitioning;
    syncLayout();
  }, 170);

  window.dispatchEvent(
    new CustomEvent("sm:inspector-collapsed-changed", {
      detail: { collapsed: shouldCollapse },
    }),
  );
  return shouldCollapse;
};

// ─── Shared panel visibility helper ─────────────────────────────────────────
// All panels must use these helpers so there is never an !important conflict.
window.InspectorPanelState = {
  show(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.removeProperty("display");
    el.style.display = "flex";
  },
  showBlock(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.removeProperty("display");
    el.style.display = "block";
  },
  hide(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.removeProperty("display");
    el.style.display = "none";
  },
  hideAll(ids) {
    ids.forEach((id) => this.hide(id));
  },
};

window.InspectorPanel = {
  init() {
    const el = document.getElementById("inspector-panel");
    if (!el) {
      console.warn("InspectorPanel element not found: inspector-panel");
      return;
    }
    this.renderDefaultInspector();

    // Keep Tilemap controls inside Inspector whenever selection/workspace
    // changes rebuild the inspector DOM.
    if (!this._tilemapDockEventsBound) {
      this._tilemapDockEventsBound = true;
      [
        "sm:object-selected",
        "sm:tilemap-created",
        "sm:tilemap-applied",
        "sm:tilemap-tileset-changed",
        "sm:2d-workspace-ready",
      ].forEach((eventName) => {
        window.addEventListener(eventName, () => {
          requestAnimationFrame(() => this._dockTilemapInspectorPanel());
          setTimeout(() => this._dockTilemapInspectorPanel(), 30);
        });
      });
    }

    if (!document.getElementById("sm-tilemap-inspector-style")) {
      const style = document.createElement("style");
      style.id = "sm-tilemap-inspector-style";
      style.textContent = `
                #sm-tilemap-inspector-card[hidden] { display:none !important; }
                #sm-tilemap-inspector-host { width:100%; }
                #sm-tilemap-inspector-host #sm-tilemap-paint-ui {
                    box-sizing:border-box;
                    position:relative !important;
                    inset:auto !important;
                    width:100% !important;
                    max-width:none !important;
                    margin:0 !important;
                    padding:0 !important;
                    background:transparent !important;
                    border:0 !important;
                    border-radius:0 !important;
                    box-shadow:none !important;
                    font:11px Arial,sans-serif !important;
                    color:#dbe4ee;
                }
                #sm-tilemap-inspector-host #sm-tilemap-paint-ui .sm-tmp-head {
                    padding:0 0 7px 0;
                    margin:0 0 7px 0;
                    border-bottom:1px solid rgba(255,255,255,.08);
                }
                #sm-tilemap-inspector-host #sm-tilemap-paint-ui .sm-tmp-row {
                    display:grid;
                    grid-template-columns:repeat(4,minmax(0,1fr));
                    gap:4px;
                }
                #sm-tilemap-inspector-host #sm-tilemap-paint-ui .sm-tmp-row button {
                    min-width:0;
                    width:100%;
                }
                #sm-tilemap-inspector-host #sm-tilemap-paint-ui .sm-tmp-palette {
                    width:100% !important;
                    max-width:100%;
                    height:auto;
                    max-height:180px;
                    object-fit:contain;
                    margin-top:6px;
                }
                #sm-tilemap-inspector-host #sm-tilemap-paint-ui .sm-tmp-map div {
                    display:grid;
                    grid-template-columns:1fr auto 1fr auto;
                    align-items:center;
                    gap:4px;
                }
                #sm-tilemap-inspector-host #sm-tilemap-paint-ui .sm-tmp-map input {
                    width:100%;
                    box-sizing:border-box;
                }
            `;
      document.head.appendChild(style);
    }

    console.log("InspectorPanel initialized");
  },

  renderDefaultInspector(force = false) {
    const el = document.getElementById("inspector-panel");
    if (!el) return;

    if (
      force !== true &&
      document.body.classList.contains("video-editing-mode")
    ) {
      window.videoInspectorSidebar?.ensureMount?.(false);
      window.videoInspectorSidebar?.refresh?.();
      return;
    }

    const snowPanel = document.getElementById("snow-sittings");
    if (snowPanel) document.body.appendChild(snowPanel);

    // NOTE: NO inline "display:none !important" anywhere — plain display:none only.
    //       All slots are pre-reserved here so panels don't fight over DOM position.
    el.innerHTML = `
        <div class="panel-header">
            <i class="fas fa-info-circle"></i> Inspector
            <span class="expand-button" aria-hidden="true"><i class="fas fa-caret-down"></i></span>
        </div>

        <div class="inspector-layout-container">
            <div class="inspector-sidebar">
                <button style="color: white;" class="tool-btn inspector-reopen-btn" id="reopen-inspector-btn"
                    title="Open Inspector" onclick="window.setInspectorCollapsed?.(false)">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" color="white" fill="currentColor" viewBox="0 0 512 512">
                        <path d="M41.4 233.4c-12.5 12.5-12.5 32.8 0 45.3l160 160c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L109.3 256 246.6 118.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0l-160 160zm224 0c-12.5 12.5-12.5 32.8 0 45.3l160 160c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L333.3 256 470.6 118.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0l-160 160z" />
                    </svg>
                </button>
                <button class="stm-row" style="background-color : #333;" id="physicsControls" data-action="panel" data-target="physics-controls" title="Physics Lab">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="3" y="3" width="6" height="6" rx="1"></rect>
                        <rect x="15" y="3" width="6" height="6" rx="1"></rect>
                        <rect x="9" y="15" width="6" height="6" rx="1"></rect>
                        <path d="M6 9v3h6m0 0v3M18 9v3h-6"></path>
                    </svg>
                </button>
                <button class="tool-btn" id="vegetationPainterBtn" title="Foliage Paint (Terrain only)" aria-label="Foliage Paint" style="color:#8fe3a2; display:none;">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.4 19 2c1 2 2 4.1 1.4 9-1 7.6-8.6 9-8.4 9z"/>
                        <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/>
                    </svg>
                </button>
                <button class="tool-btn" id="sculptingLandscapeBtn" title="Landscape Sculpting (Terrain only)" aria-label="Landscape Sculpting" style="color:#8fc7ff; display:none;">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <path d="m8 3-6 16h20L14 7l-3 4-3-8z"/>
                        <path d="M4.15 16 8 8l3 4"/>
                    </svg>
                </button>
                <button id="open-water-system-btn" class="tool-btn" type="button" title="Water System">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                       <path d="M12 2.5c0 0-6.5 7.5-6.5 12.3 0 3.6 2.9 6.5 6.5 6.5s6.5-2.9 6.5-6.5C18.5 10 12 2.5 12 2.5zm0 16.8c-2.5 0-4.5-2-4.5-4.5 0-2.3 3.1-6.8 4.5-8.7 1.4 1.9 4.5 6.4 4.5 8.7 0 2.5-2 4.5-4.5 4.5z"/>
                       <circle cx="12" cy="14.5" r="1.8"/>
                       <path d="M12 12v1m0 3v1m-2-2h1m3 0h1" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
                    </svg>
                </button>
                <button id="open-snow-fx-btn" class="tool-btn" type="button" title="FX &amp; Particles (Snow / Explosions)" style="color: #7ad7ff;">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle;">
                        <path d="M12 2v20M2 12h20M4.93 4.93l14.14 14.14M4.93 19.07l14.14-14.14M12 6l2-2M12 6l-2-2M12 18l2 2M12 18l-2 2M6 12l-2 2M6 12l-2-2M18 12l2 2M18 12l2-2"/>
                    </svg>
                </button>
                <button id="open-arch-tools-btn" class="tool-btn" type="button" title="Architecture Tools (Walls, Rooms, Doors, Stairs)" style="color: #f39c12;">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle;">
                        <path d="M3 21h18M3 7v14M21 7v14M6 21V11a6 6 0 0 1 12 0v10M12 3l9 4M12 3L3 7"/>
                    </svg>
                </button>
                <button title="Fusion CAD" onclick="window.FusionModelingUI?.open()">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle;">
                        <path d="M12 2.5L3.5 7.4v9.2L12 21.5l8.5-4.9V7.4L12 2.5z"/>
                        <path d="M12 21.5V12"/>
                        <path d="M20.5 7.4L12 12 3.5 7.4"/>
                        <path d="M12 7l4 2.3v4.6L12 16.2l-4-2.3V9.3L12 7z" fill="currentColor" fill-opacity="0.25" stroke-width="1.2"/>
                    </svg>
                </button>
                <button title="Material Paint" onclick="window.SMMaterialPaintPanel?.toggle()">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;">
                        <path d="M4 4h11a2 2 0 0 1 2 2v3"/>
                        <path d="M17 9h2a1 1 0 0 1 1 1v3a2 2 0 0 1-2 2h-5"/>
                        <path d="M13 13v7"/>
                        <path d="M10 20h6"/>
                        <rect x="3" y="3" width="12" height="6" rx="1.5" fill="currentColor" fill-opacity="0.14"/>
                    </svg>
                </button>
                <div id="video-inspector-sidebar-tools" class="video-inspector-sidebar-tools" aria-label="Video Editing Inspector Tools"></div>
            </div>

            <div class="inspector-main-content inspector-content-root" id="inspector-main-content">
                <div class="search-group">
                    <input type="text" id="search-input" class="search-input" placeholder="Search..." />
                    <div class="search-results-bar" id="search-results-bar"></div>
                </div>

                                <section class="inspector-tool-dock" id="inspector-tool-dock" aria-label="Inspector tools">
                    <div class="inspector-dock-tabs" id="inspector-dock-tabs" role="tablist" aria-label="Inspector tool panels" hidden></div>
                    <div class="inspector-dock-content" id="inspector-dock-content">
                        <div class="physics-lab-panel property-group panel-dock-view" id="physics-controls" hidden style="background-color:#333;">
                            <div class="panel-header"><i class="fas fa-atom"></i> Physics Lab</div>
                            <div class="physics-content"></div>
                        </div>
                        <div class="property-group panel-dock-view" id="sound-controls-vis" hidden></div>
                    </div>
                </section>

                <!-- UNREAL ENGINE 5 DETAILS / INSPECTOR PANEL -->
                <div class="ue5-details-panel" id="ue5InspectorPanel">
                    
                    <!-- Top Search & Filter Bar (UE5 Details Header) -->
                    <div class="ue5-details-header">
                        <div class="ue5-search-box">
                            <i class="fas fa-search"></i>
                            <input type="text" id="ue5DetailsFilter" placeholder="Search Details..." autocomplete="off">
                        </div>
                        <div class="ue5-header-actions">
                            <button class="ue5-icon-btn" title="Expand All" id="ue5ExpandAllBtn"><i class="fas fa-angles-down"></i></button>
                            <button class="ue5-icon-btn" title="Collapse All" id="ue5CollapseAllBtn"><i class="fas fa-angles-up"></i></button>
                        </div>
                    </div>

                    <!-- Main Relative Scrollable Content -->
                    <div class="ue5-details-scroll-content" id="ue5-inspector-scroll">
                        
                        <!-- Entity Identity Card (Dynamically ensured/injected if not present) -->
                        <div class="inspector-card sm-entity-card" id="sm-entity-card">
                            <div class="inspector-card-header">
                                <i class="fas fa-caret-down ue5-fold-icon"></i>
                                <i class="fas fa-cube header-type-icon"></i>
                                <span class="header-title">ENTITY</span>
                                <small class="header-badge" id="sm-entity-id">No Selection</small>
                            </div>
                            <div class="inspector-card-body">
                                <div class="inspector-field-row">
                                    <span class="field-label">Name</span>
                                    <input id="objectNameInput" class="field-input-text" type="text" autocomplete="off" placeholder="Entity Name">
                                </div>
                                <div class="inspector-field-row ue5-toggle-group">
                                    <label class="ue5-checkbox-label"><input id="objectActiveCheck" type="checkbox"> <span>Active</span></label>
                                    <label class="ue5-checkbox-label"><input id="objectVisibleCheck" type="checkbox"> <span>Visible</span></label>
                                    <label class="ue5-checkbox-label"><input id="objectStaticCheck" type="checkbox"> <span>Static</span></label>
                                </div>
                                <div class="inspector-field-row">
                                    <span class="field-label">Tags</span>
                                    <input id="objectTagInput" class="field-input-text" type="text" placeholder="e.g. Player, Interactable">
                                </div>
                                <div class="inspector-field-row">
                                    <span class="field-label">Layer</span>
                                    <input id="objectLayerInput" class="field-input-text" type="text" value="Default">
                                </div>
                                <div class="inspector-field-row">
                                    <span class="field-label">Category</span>
                                    <input id="objectCategoryInput" class="field-input-text" type="text" value="World">
                                </div>
                            </div>
                        </div>
                
                        <!-- SM ENGINE TRANSFORM -->
                        <section class="sm-transform-panel" id="transformContainer" data-inspector-section="transform">
                            <div class="sm-transform-header">
                                <div class="sm-transform-header-left">
                                    <button type="button" class="sm-transform-collapse" id="sm-transform-collapse" aria-label="Collapse Transform">
                                        <i class="fas fa-caret-down"></i>
                                    </button>
                                    <i class="fas fa-arrows-up-down-left-right sm-transform-icon"></i>
                                    <span class="sm-transform-title">TRANSFORM</span>
                                </div>
                                <small class="sm-transform-summary" id="sm-world-transform-summary">World (0, 0, 0)</small>
                            </div>
                            <div class="sm-transform-body" id="transformFieldsBody"></div>
                        </section>
                
                        <!-- TILEMAP EDITOR CARD -->
                        <section class="inspector-card sm-tilemap-inspector-card" id="sm-tilemap-inspector-card" hidden>
                            <div class="inspector-card-header">
                                <i class="fas fa-caret-down ue5-fold-icon"></i>
                                <i class="fas fa-table-cells-large header-type-icon"></i>
                                <span class="header-title">TILEMAP</span>
                                <small class="header-badge" id="sm-tilemap-inspector-status">Paint</small>
                            </div>
                            <div class="inspector-card-body sm-tilemap-inspector-body">
                                <div id="sm-tilemap-inspector-host"></div>
                            </div>
                        </section>

                        <!-- Material & Mesh Card -->
                        <div class="inspector-card" id="materialContainer">
                            <div class="inspector-card-header">
                                <i class="fas fa-caret-down ue5-fold-icon"></i>
                                <i class="fas fa-paint-brush header-type-icon"></i>
                                <span class="header-title">MATERIAL &amp; MESH</span>
                            </div>
                            <div class="inspector-card-body">
                                <div class="inspector-field-row">
                                    <span class="field-label">Triangles</span>
                                    <span class="field-badge-green" id="meshTrianglesDisplay">0 Tris</span>
                                </div>
                                <div class="inspector-field-row">
                                    <span class="field-label">Base Color</span>
                                    <div class="field-color-wrap">
                                        <input type="color" class="field-color-picker" id="matColorInput" value="#ffffff">
                                        <span class="field-color-hex" id="matColorHexDisplay">#FFFFFF</span>
                                    </div>
                                </div>
                                <div class="inspector-field-row">
                                    <span class="field-label">Roughness</span>
                                    <div class="field-slider-wrap">
                                        <input type="range" class="field-slider" id="matRoughnessInput" min="0" max="1" step="0.01" value="0.5">
                                        <span class="field-slider-val" id="matRoughnessVal">0.50</span>
                                    </div>
                                </div>
                                <div class="inspector-field-row">
                                    <span class="field-label">Metallic</span>
                                    <div class="field-slider-wrap">
                                        <input type="range" class="field-slider" id="matMetallicInput" min="0" max="1" step="0.01" value="0.0">
                                        <span class="field-slider-val" id="matMetallicVal">0.00</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                
                        <!-- Rigidbody Physics Card -->
                        <div class="inspector-card" id="physicsContainer">
                            <div class="inspector-card-header">
                                <i class="fas fa-caret-down ue5-fold-icon"></i>
                                <i class="fas fa-atom header-type-icon"></i>
                                <span class="header-title">RIGIDBODY PHYSICS</span>
                            </div>
                            <div class="inspector-card-body">
                                <div class="inspector-field-row">
                                    <span class="field-label">Body Type</span>
                                    <select class="field-dropdown" id="physicsBodyTypeSelect">
                                        <option value="static">Static</option>
                                        <option value="dynamic">Dynamic</option>
                                        <option value="kinematic">Kinematic</option>
                                    </select>
                                </div>
                                <div class="inspector-field-row">
                                    <span class="field-label">Mass (kg)</span>
                                    <input type="number" class="field-number-input" id="physicsMassInput" value="1.0" step="0.1" min="0">
                                </div>
                            </div>
                        </div>
                
                        <!-- Dynamic Components Host -->
                        <div class="sm-entity-components" id="sm-entity-components"></div>
                
                        <!-- Add Component Action Bar (UE5 Style) -->
                        <div class="inspector-action-row" id="addComponentContainer">
                            <button class="btn-add-component" id="sm-add-component-btn" type="button">
                                <i class="fas fa-plus"></i>
                                <span>Add Component / Script</span>
                            </button>
                            <!-- METAHUMAN CREATOR -->
                            <section
                                id="sm-metahuman-inspector-card"
                                class="inspector-card"
                                style="display:none;"
                            >
                                <div id="sm-metahuman-panel-host"></div>
                            </section>
                            <div id="sm-component-picker" class="sm-component-picker" hidden>
                                <div class="sm-picker-search-wrap">
                                    <i class="fas fa-search"></i>
                                    <input id="sm-component-search" type="search" placeholder="Search Components..." autocomplete="off">
                                </div>
                                <div id="sm-component-options" class="sm-component-options"></div>
                            </div>
                        </div>
                
                    </div>
                        
                </div>
              
            </div>
        </div>
        `;

    this._renderTransformPanel();

    // Tilemap Paint is a single inspector-owned panel. If SMTilemapPaint2D
    // has already built its controls, dock them here; otherwise the
    // tilemap events below will dock them as soon as they exist.
    this._dockTilemapInspectorPanel();
    this._mountMetaHumanInspector();
    this._bindSidebarNavigation();

    queueMicrotask(() => {
      window.videoInspectorSidebar?.ensureMount?.(true);
    });

    const vegetationButton = document.getElementById("vegetationPainterBtn");
    const landscapeButton = document.getElementById("sculptingLandscapeBtn");
    const mode = String(
      window.workspaceManager?.currentMode || window.currentWorkspaceMode || "",
    ).toUpperCase();
    if (vegetationButton && mode)
      vegetationButton.style.display = mode === "TERRAIN" ? "" : "none";
    if (landscapeButton && mode)
      landscapeButton.style.display = mode === "TERRAIN" ? "" : "none";
  },

  _renderTransformPanel() {
    const body = document.getElementById("transformFieldsBody");
    const panel = document.getElementById("transformContainer");
    if (!body || !panel) return;
    if (body.dataset.smTransformBuilt === "true") return;
    body.dataset.smTransformBuilt = "true";

    body.innerHTML = `
      <div class="sm-transform-row"><span class="sm-transform-label">Location</span><div class="sm-transform-vector">
        <div class="sm-transform-axis"><span class="sm-transform-axis-label">X</span><input id="transformPosX" class="sm-transform-input" type="number" step="0.01"></div>
        <div class="sm-transform-axis"><span class="sm-transform-axis-label">Y</span><input id="transformPosY" class="sm-transform-input" type="number" step="0.01"></div>
        <div class="sm-transform-axis"><span class="sm-transform-axis-label">Z</span><input id="transformPosZ" class="sm-transform-input" type="number" step="0.01"></div>
      </div></div>
      <div class="sm-transform-row"><span class="sm-transform-label">Rotation</span><div class="sm-transform-vector">
        <div class="sm-transform-axis"><span class="sm-transform-axis-label">X</span><input id="transformRotX" class="sm-transform-input" type="number" step="0.1"></div>
        <div class="sm-transform-axis"><span class="sm-transform-axis-label">Y</span><input id="transformRotY" class="sm-transform-input" type="number" step="0.1"></div>
        <div class="sm-transform-axis"><span class="sm-transform-axis-label">Z</span><input id="transformRotZ" class="sm-transform-input" type="number" step="0.1"></div>
      </div></div>
      <div class="sm-transform-row"><span class="sm-transform-label">Scale</span><div class="sm-transform-vector">
        <div class="sm-transform-axis"><span class="sm-transform-axis-label">X</span><input id="transformScaleX" class="sm-transform-input" type="number" step="0.01"></div>
        <div class="sm-transform-axis"><span class="sm-transform-axis-label">Y</span><input id="transformScaleY" class="sm-transform-input" type="number" step="0.01"></div>
        <div class="sm-transform-axis"><span class="sm-transform-axis-label">Z</span><input id="transformScaleZ" class="sm-transform-input" type="number" step="0.01"></div>
      </div></div>`;

    const collapse = document.getElementById("sm-transform-collapse");
    if (collapse && collapse.dataset.bound !== "true") {
      collapse.dataset.bound = "true";
      collapse.addEventListener("click", (event) => {
        event.preventDefault(); event.stopPropagation();
        panel.classList.toggle("is-collapsed");
      });
    }
  },

  _dockTilemapInspectorPanel() {
    const card = document.getElementById("sm-tilemap-inspector-card");
    const host = document.getElementById("sm-tilemap-inspector-host");
    const floating = document.getElementById("sm-tilemap-paint-ui");
    const selected =
      window.selectedObject || window.transformControls?.object || null;
    const isTilemap = !!selected?.userData?.is2DTilemap;

    if (!card || !host) return;

    card.hidden = !isTilemap;

    if (!isTilemap) {
      if (floating && floating.parentElement === host) {
        document.body.appendChild(floating);
        floating.style.display = "none";
      }
      document.getElementById("sm-tilemap-brush-cell")?.remove?.();
      return;
    }

    if (floating) {
      // Re-parent the existing Tilemap Paint controls instead of creating
      // a second implementation. All Paint/Erase/Fill/Brush/Palette/Map
      // controls keep their original event handlers.
      host.appendChild(floating);
      floating.style.position = "relative";
      floating.style.left = "auto";
      floating.style.top = "auto";
      floating.style.width = "100%";
      floating.style.maxWidth = "100%";
      floating.style.padding = "0";
      floating.style.margin = "0";
      floating.style.zIndex = "auto";
      floating.style.border = "0";
      floating.style.borderRadius = "0";
      floating.style.boxShadow = "none";
      floating.style.background = "transparent";
      floating.style.fontSize = "11px";
      floating.style.display = "block";

      const status = document.getElementById("sm-tilemap-inspector-status");
      if (status) status.textContent = "GRID SNAP";
    }
  },

  _mountMetaHumanInspector() {
    const card = document.getElementById("sm-metahuman-inspector-card");
    const host = document.getElementById("sm-metahuman-panel-host");

    if (!card || !host) return;

    const mode = String(
      window.workspaceManager?.currentMode ||
        window.currentWorkspaceMode ||
        localStorage.getItem("sm_workspace_mode") ||
        "",
    ).toUpperCase();

    if (mode !== "METAHUMAN") {
      card.style.display = "none";
      host.innerHTML = "";
      return;
    }

    card.style.display = "block";

    if (!window.MetaHumanPanel) {
      console.warn("[MetaHuman] MetaHumanPanel not loaded.");
      return;
    }

    if (!window.smMetaHumanInspectorPanel) {
      window.smMetaHumanInspectorPanel = new window.MetaHumanPanel({
        container: host,
        character:
          window.smMetaHumanCharacter ||
          window.metaHumanCharacter ||
          window.selectedObject ||
          null,
      });

      window.smMetaHumanInspectorPanel.mount(host);
    } else {
      window.smMetaHumanInspectorPanel.container = host;
      window.smMetaHumanInspectorPanel.render();
    }
  },
  _bindSidebarNavigation() {
    const mainContent = document.getElementById("inspector-main-content");
    if (!mainContent) return;

    if (document.body.classList.contains("video-editing-mode")) return;

    const physicsButton = document.getElementById("physicsControls");
    const physicsPanel = document.getElementById("physics-controls");
    if (!physicsButton || !physicsPanel) return;

    window.PanelDockManager?.registerPanel({
      id: "physics",
      title: "Physics",
      icon: "fas fa-atom",
      elementId: "physics-controls",
      className: "physics-lab-panel property-group",
    });
    window.PanelDockManager?.registerPanel({
      id: "sound",
      title: "Sound",
      icon: "fas fa-volume-high",
      elementId: "sound-controls-vis",
      className: "property-group",
    });

    const showDefaultInspector = () => {
      physicsButton.classList.remove("active");
      window.PanelDockManager?.closePanel("physics");
    };

    const showPhysicsInspector = () => {
      window.PanelDockManager?.openPanel("physics");
      physicsPanel.style.flexDirection = "column";
      physicsButton.classList.add("active");

      const content = physicsPanel.querySelector(".physics-content");
      if (content && content.children.length === 0) {
        if (window.physicsSystem?.ui) {
          window.physicsSystem.ui.container = physicsPanel;
          window.physicsSystem.ui.build();
        } else if (window.PhysicsUI && window.physicsSystem) {
          window.physicsSystem.ui = new window.PhysicsUI(
            window.physicsSystem,
            "physics-controls",
          );
          window.physicsSystem.ui.build();
        } else if (
          typeof PhysicsUI !== "undefined" &&
          typeof physicsSystem !== "undefined"
        ) {
          physicsSystem.ui = new PhysicsUI(physicsSystem, "physics-controls");
          physicsSystem.ui.build();
        }
      }

      const ui =
        window.physicsSystem?.ui ||
        (typeof physicsSystem !== "undefined" ? physicsSystem?.ui : null);
      if (ui) {
        ui.refreshWorkbench?.();
        const selected =
          window.selectedObject || window.transformControls?.object || null;
        ui.updateObjectPanel?.(selected);
      }

      requestAnimationFrame(() => {
        physicsPanel.scrollTop = 0;
        physicsPanel
          .querySelector(".physics-content")
          ?.scrollTo?.({ top: 0, behavior: "instant" });
      });
    };

    physicsButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (physicsButton.classList.contains("active")) {
        showDefaultInspector();
      } else {
        showPhysicsInspector();
      }
    });

    const vegetationButton = document.getElementById("vegetationPainterBtn");
    if (vegetationButton && vegetationButton.dataset.bound !== "true") {
      vegetationButton.dataset.bound = "true";
      vegetationButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const mode = String(
          window.workspaceManager?.currentMode ||
            window.currentWorkspaceMode ||
            localStorage.getItem("sm_workspace_mode") ||
            "",
        ).toUpperCase();
        if (mode && mode !== "TERRAIN") return;
        window.VegetationPanel?.toggle?.();
        vegetationButton.classList.toggle(
          "active",
          !!window.VegetationPanel?.isOpen?.(),
        );
      });
    }

    const landscapeButton = document.getElementById("sculptingLandscapeBtn");
    if (landscapeButton && landscapeButton.dataset.bound !== "true") {
      landscapeButton.dataset.bound = "true";
      landscapeButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const mode = String(
          window.workspaceManager?.currentMode ||
            window.currentWorkspaceMode ||
            localStorage.getItem("sm_workspace_mode") ||
            "",
        ).toUpperCase();
        if (mode && mode !== "TERRAIN") return;
        if (window.VegetationPanel?.isOpen?.()) {
          window.VegetationPanel.close();
        } else {
          const panel = document.getElementById("sculpting-panel");
          const isOpen = !!panel && panel.style.display !== "none";
          if (isOpen) {
            window.SculptingPanel?.close?.();
          } else {
            // This button belongs to Terrain only. The global
            // sculpt entry point opens the mesh-sculpt workflow
            // in Filming & Content, which is the wrong workspace
            // for a Landscape Sculpt panel.
            window.requestTerrainSculptingWorkspace?.();
          }
        }
        const sp = document.getElementById("sculpting-panel");
        landscapeButton.classList.toggle(
          "active",
          !!sp && sp.style.display !== "none",
        );
      });
    }

    const waterButton = document.getElementById("open-water-system-btn");
    if (waterButton && waterButton.dataset.bound !== "true") {
      waterButton.dataset.bound = "true";
      waterButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (window.SecondarySidebar?.toggle) {
          window.SecondarySidebar.toggle("water");
        } else if (window.SecondarySidebar?.open) {
          window.SecondarySidebar.open("water");
        } else {
          window.keepWaterPanelOpen?.();
        }
        const wp = document.getElementById("water-system-panel");
        waterButton.classList.toggle(
          "active",
          !!wp && wp.classList.contains("active"),
        );
      });
    }

    const snowButton = document.getElementById("open-snow-fx-btn");
    if (snowButton && snowButton.dataset.bound !== "true") {
      snowButton.dataset.bound = "true";
      snowButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (window.SecondarySidebar?.toggle) {
          window.SecondarySidebar.toggle("snow");
        } else {
          const sp = document.getElementById("snow-sittings");
          if (sp) {
            const isHidden = sp.style.display === "none";
            sp.style.display = isHidden ? "flex" : "none";
            sp.classList.toggle("active", isHidden);
          }
        }
        const sp = document.getElementById("snow-sittings");
        snowButton.classList.toggle(
          "active",
          !!sp && sp.classList.contains("active"),
        );
      });
    }

    const archButton = document.getElementById("open-arch-tools-btn");
    if (archButton && archButton.dataset.bound !== "true") {
      archButton.dataset.bound = "true";
      archButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (window.SecondarySidebar?.toggle) {
          window.SecondarySidebar.toggle("arch");
        } else {
          const ap = document.getElementById("architecture-tools-panel");
          if (ap) {
            const isHidden = ap.style.display === "none";
            ap.style.display = isHidden ? "flex" : "none";
            ap.classList.toggle("active", isHidden);
          }
        }
        const ap = document.getElementById("architecture-tools-panel");
        archButton.classList.toggle(
          "active",
          !!ap && ap.classList.contains("active"),
        );
      });
    }

    window.showPhysicsInspector = showPhysicsInspector;
    window.showDefaultInspector = showDefaultInspector;
  },
};

window.addEventListener("sm:workspace-manager-mode-applied", (event) => {
  const mode = String(
    event.detail?.mode || window.workspaceManager?.currentMode || "",
  ).toUpperCase();

  if (mode === "METAHUMAN") {
    setTimeout(() => {
      window.InspectorPanel?.renderDefaultInspector?.(true);
      window.InspectorPanel?._mountMetaHumanInspector?.();
    }, 0);
  } else {
    const card = document.getElementById("sm-metahuman-inspector-card");

    if (card) {
      card.style.display = "none";
    }
  }
});
