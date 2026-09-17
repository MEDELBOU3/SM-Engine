const SculptingPanel = {
  isOpen: false,

  terrain: null,

  _terrainSysReady: false,

  init() {
    this.overrideBootstrapToggle();
    this.setupToolbarToggler();

    window.addEventListener("sm:terrain-created", (event) => {
      this.terrain = event.detail?.landscape || event.detail?.terrain || null;
      if (this.isOpen) {
        this.render();
      } else if (
        this.terrain?.userData?.isTerrain &&
        window.workspaceManager?.currentMode === "TERRAIN"
      ) {
        this.openForTerrain(this.terrain);
      }
    });

    console.log("[SculptingPanel] Landscape workspace ready");
  },

  _ensureTerrainSculptingSystem() {
    if (this._terrainSysReady) {
      // This call is idempotent and also rebinds when the viewport swaps its
      // canvas while keeping the same renderer object.
      window.TerrainSculpting?.setContext?.(
        window.scene,
        window.camera,
        window.renderer,
        window.historyManager || null,
      );
      window.TerrainSculpting?.interaction?.initializeTerrainSculptingEventListeners?.();
      this._terrainSysRenderer = window.renderer;
      return true;
    }
    if (typeof window.initTerrainSculptingSystem !== "function") return false;
    if (!window.scene || !window.camera || !window.renderer?.domElement) return false;

    window.initTerrainSculptingSystem(
      window.scene,
      window.camera,
      window.renderer,
      window.historyManager || null,
    );

    this._terrainSysReady = true;
    this._terrainSysRenderer = window.renderer;
    return true;
  },

  overrideBootstrapToggle() {
    // Terrain sculpting remains a dedicated landscape workflow. Global mesh
    // sculpting is provided separately and stays inside Filming & Content.
    window.requestTerrainSculptingWorkspace = () => this.openWorkspace();
    window.toggleSculptingPanelSafe = (force) => {
      if (force === false) return this.close();
      return this.openWorkspace();
    };
  },

  setupToolbarToggler() {
    // The main Sculpting toolbar is intentionally left to GlobalSculptMode.
    // Terrain entry points call requestTerrainSculptingWorkspace explicitly.
  },

  openWorkspace() {
    const workspace = window.workspaceManager;
    // The landscape editor belongs exclusively to Terrain Sculpting.
    if (workspace?.currentMode !== "TERRAIN") {
      workspace?.setMode?.("TERRAIN");
    }
    this._ensureTerrainSculptingSystem();

    const selected = window.selectedObject;
    if (selected?.userData?.isTerrain) {
      this.terrain = selected;
      window.TerrainSculpting?.setLandscape?.(selected);
    } else {
      this.terrain = window.TerrainSculpting?.getLandscape?.() || null;
    }

    return this.open();
  },

  openForTerrain(terrain) {
    if (!terrain?.userData?.isTerrain) return false;
    this.terrain = terrain;
    window.TerrainSculpting?.setLandscape?.(terrain);
    return this.open();
  },

  open() {
    // openForTerrain() can enter here directly after a terrain-created event.
    // Make sure the input/brush system is initialized in that path too.
    this._ensureTerrainSculptingSystem();

    const inspector = document.getElementById("inspector-panel");
    if (!inspector) return false;

    inspector.classList.remove("closed", "hidden", "mode-hidden");
    inspector.hidden = false;
    // removeProperty first so no lingering !important can block us
    inspector.style.removeProperty('display');
    inspector.style.display = 'flex';
    window.setInspectorCollapsed?.(false);

    const panel = window.PanelDockManager?.mountPanel?.({
      id: 'terrain-sculpt', title: 'Terrain Sculpt', icon: 'fas fa-mountain',
      elementId: 'sculpting-panel', className: 'property-group sculpting-inspector-inner',
    });
    if (!panel) return false;
    panel.style.flexDirection = "column";
    panel.style.flex = "0 0 auto";
    panel.style.minHeight = "0";
    panel.style.overflow = "visible";
    panel.style.backgroundColor = "#333";

    this.isOpen = true;
    if (window.TerrainSculpting?.state && window.TerrainModes?.SCULPT) {
      window.TerrainSculpting.state.mode = window.TerrainModes.SCULPT;
    }

    const activeTerrain = this.terrain?.userData?.terrainData
      ? this.terrain
      : window.TerrainSculpting?.getLandscape?.();
    if (activeTerrain?.userData?.terrainData) {
      window.TerrainSculpting?.setLandscape?.(activeTerrain);
    }

    this.render(panel);
    window.PanelDockManager?.openPanel?.('terrain-sculpt');
    return true;
  },

  render(panel = document.getElementById("sculpting-panel")) {
    if (!panel) return;

    const terrainCreation = window.TerrainSculpting?.state?.creation || {};
    const generatorValue = (key, fallback) => String(terrainCreation[key] ?? fallback);
    const generatorMode = String(terrainCreation.initialMode || "edgeMountains").toLowerCase();
    const generatorStatus = window.TerrainSculpting?.state?.generatorStatus ||
      "Set the landscape, then generate a new terrain.";

    panel.innerHTML = `
    <div class="sculpting-tools">
      <div class="sw-header">
        <div class="sw-title">
          <i class="fas fa-mountain"></i>
          <span>Terrain Sculpting</span>
        </div>
        <button type="button" class="sw-btn-icon" id="sculpting-close-x-btn" title="Close Sculpting">✕</button>
      </div>

      <div class="sw-session-bar" role="toolbar" aria-label="Terrain sculpt session">
        <button type="button" class="sw-session-btn sw-brush-toggle is-active" data-terrain-brush-toggle title="Enable or disable terrain brush"><i class="fas fa-brush"></i> Brush: On</button>
        <button type="button" class="sw-session-btn" data-terrain-action="undo" title="Undo terrain stroke (Ctrl+Z)"><i class="fas fa-undo"></i> Undo</button>
        <button type="button" class="sw-session-btn" data-terrain-action="redo" title="Redo terrain stroke (Ctrl+Shift+Z)"><i class="fas fa-redo"></i> Redo</button>
        <span class="sw-session-status" data-terrain-status>Ready · LMB sculpt · Ctrl/Shift lower</span>
      </div>

      <div class="sw-content-scroll">
        <!-- Landscape Generator - separate from mesh sculpting -->
        <section class="sw-section sw-generator-section" id="terrain-landscape-generator">
          <div class="sw-section-title sw-generator-title-row">
            <span>Landscape Generator</span>
            <span class="sw-generator-badge">NEW TERRAIN</span>
          </div>
          <p class="sw-generator-note">Generate Landscape starts with the SM Default Basin: a broad flat centre surrounded by irregular mountain ridges. Choose Flat Plane only when you explicitly want a completely level landscape.</p>

          <div class="sw-prop-grid">
            <label class="sw-prop">
              <span>Size Preset</span>
              <select id="terrain-generator-preset" class="sw-input">
                <option value="small">Small · 3 × 3</option>
                <option value="standard" selected>Large Default · 4 × 4</option>
                <option value="large">Large · 5 × 5</option>
                <option value="custom">Custom</option>
              </select>
            </label>
            <label class="sw-prop">
              <span>Landscape Profile</span>
              <select id="terrain-generator-profile" class="sw-input">
                <option value="edgeMountains" ${generatorMode === "edgemountains" ? "selected" : ""}>SM Default Basin · Mountain Rim</option>
                <option value="flat" ${generatorMode === "flat" ? "selected" : ""}>Flat Plane</option>
                <option value="noise" ${generatorMode === "noise" ? "selected" : ""}>Noise Terrain</option>
              </select>
            </label>
            <label class="sw-prop">
              <span>Components X</span>
              <input id="terrain-generator-components-x" class="sw-input" type="number" min="1" max="8" step="1" value="${generatorValue("componentsX", 4)}">
            </label>
            <label class="sw-prop">
              <span>Components Z</span>
              <input id="terrain-generator-components-z" class="sw-input" type="number" min="1" max="8" step="1" value="${generatorValue("componentsZ", 4)}">
            </label>
            <label class="sw-prop">
              <span>Quads / Section</span>
              <select id="terrain-generator-section-size" class="sw-input">
                <option value="31" ${Number(terrainCreation.sectionSize) === 31 ? "selected" : ""}>31 · Draft</option>
                <option value="63" ${Number(terrainCreation.sectionSize || 63) === 63 ? "selected" : ""}>63 · Standard</option>
                <option value="127" ${Number(terrainCreation.sectionSize) === 127 ? "selected" : ""}>127 · High Detail</option>
              </select>
            </label>
            <label class="sw-prop">
              <span>Quad Size (m)</span>
              <input id="terrain-generator-quad-size" class="sw-input" type="number" min="0.25" max="20" step="0.1" value="${generatorValue("quadSize", 3.6)}">
            </label>
            <label class="sw-prop">
              <span>Height Scale</span>
              <input id="terrain-generator-height-scale" class="sw-input" type="number" min="0.1" max="10" step="0.1" value="${generatorValue("heightScale", 1)}">
            </label>
            <label class="sw-prop">
              <span>Surface Theme</span>
              <select id="terrain-generator-theme" class="sw-input">
                <option value="realistic" ${terrainCreation.theme === "realistic" ? "selected" : ""}>Realistic</option>
                <option value="grassland" ${terrainCreation.theme === "grassland" ? "selected" : ""}>Grassland</option>
                <option value="desert" ${terrainCreation.theme === "desert" ? "selected" : ""}>Desert</option>
                <option value="arctic" ${terrainCreation.theme === "arctic" ? "selected" : ""}>Arctic</option>
                <option value="volcanic" ${terrainCreation.theme === "volcanic" ? "selected" : ""}>Volcanic</option>
              </select>
            </label>
          </div>

          <div class="sw-generator-range" data-terrain-edge-controls>
            <div class="sw-generator-range-head">
              <span>Flat Centre</span>
              <strong id="terrain-generator-flat-centre-readout">${Math.round(Number(terrainCreation.flatCenterRatio ?? 0.50) * 100)}%</strong>
            </div>
            <input id="terrain-generator-flat-centre" type="range" min="20" max="70" step="1" value="${Math.round(Number(terrainCreation.flatCenterRatio ?? 0.50) * 100)}">
          </div>

          <div class="sw-prop-grid sw-generator-edge-grid" data-terrain-edge-controls>
            <label class="sw-prop">
              <span>Edge Height (m)</span>
              <input id="terrain-generator-edge-height" class="sw-input" type="number" min="0" max="200" step="1" value="${generatorValue("edgeMountainAmplitude", 32)}">
            </label>
            <label class="sw-prop">
              <span>Edge Falloff</span>
              <input id="terrain-generator-edge-falloff" class="sw-input" type="number" min="0.1" max="5" step="0.05" value="${generatorValue("edgeMountainFalloff", 2.25)}">
            </label>
          </div>

          <details class="sw-generator-advanced">
            <summary>Noise &amp; advanced controls</summary>
            <div class="sw-prop-grid">
              <label class="sw-prop">
                <span>Surface Detail</span>
                <input id="terrain-generator-noise-amplitude" class="sw-input" type="number" min="0" max="100" step="0.5" value="${generatorValue("noiseAmplitude", 5.5)}">
              </label>
              <label class="sw-prop">
                <span>Noise Frequency</span>
                <input id="terrain-generator-noise-frequency" class="sw-input" type="number" min="0.0001" max="1" step="0.001" value="${generatorValue("noiseFrequency", 0.016)}">
              </label>
              <label class="sw-prop">
                <span>Noise Octaves</span>
                <input id="terrain-generator-noise-octaves" class="sw-input" type="number" min="1" max="8" step="1" value="${generatorValue("noiseOctaves", 5)}">
              </label>
              <label class="sw-prop">
                <span>Noise Persistence</span>
                <input id="terrain-generator-noise-persistence" class="sw-input" type="number" min="0" max="1" step="0.05" value="${generatorValue("noisePersistence", 0.48)}">
              </label>
              <label class="sw-prop">
                <span>Seed</span>
                <input id="terrain-generator-seed" class="sw-input" type="number" min="0" max="2147483647" step="1" value="${generatorValue("noiseSeed", 1337)}">
              </label>
            </div>
          </details>

          <div class="sw-generator-summary" aria-live="polite" id="terrain-generator-summary"></div>
          <div class="sw-btn-group sw-generator-actions">
            <button type="button" class="sw-btn" id="terrain-generator-reset">Reset</button>
            <button type="button" class="sw-btn" id="terrain-generator-restore-default" title="Replace the current landscape with the default basin terrain"><i class="fas fa-mountain"></i> Restore Default Basin</button>
            <button type="button" class="sw-btn sw-generator-create" id="terrain-generator-create"><i class="fas fa-plus"></i> Generate Landscape</button>
          </div>
          <p class="sw-generator-status" data-terrain-generator-status>${generatorStatus}</p>
        </section>

        <!-- Deformation Brushes -->
        <div class="sw-section">
          <div class="sw-section-title">Brushes</div>
          <div class="sw-tool-grid">
            <button type="button" class="sw-tool active" data-terrain-tool="raise" title="Sculpt / Raise (LMB) & Lower (Ctrl+LMB)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
            </button>
            <button type="button" class="sw-tool" data-terrain-tool="smooth" title="Smooth Height (Shift+LMB)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M2 12c4-4 8 4 12 0s8 4 8 4"/></svg>
            </button>
            <button type="button" class="sw-tool" data-terrain-tool="flatten" title="Flatten to Reference Level">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 17h18M3 12h18M3 7h18"/></svg>
            </button>
            <button type="button" class="sw-tool" data-terrain-tool="pinch" title="Pinch / Peak Vertices">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M6 9l6 6 6-6"/></svg>
            </button>
            <button type="button" class="sw-tool" data-terrain-tool="clay" title="Clay Build-up">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>
            </button>
            <button type="button" class="sw-tool" data-terrain-tool="scrape" title="Scrape Plateau">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 14l8-8 8 8"/></svg>
            </button>
            <button type="button" class="sw-tool" data-terrain-tool="noise" title="Organic Noise / Ruffles">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M2 12h3l2-6 4 12 3-8 2 4 2-2h4"/></svg>
            </button>
            <button type="button" class="sw-tool" data-terrain-tool="erosion" title="Hydraulic Erosion">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 2.5c0 0-6.5 7.5-6.5 12.3a6.5 6.5 0 0 0 13 0C18.5 10 12 2.5 12 2.5z"/></svg>
            </button>
            <button type="button" class="sw-tool" data-terrain-tool="thermal" title="Thermal Erosion / Talus">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m8 3-6 16h20L14 7l-3 4-3-8z"/></svg>
            </button>
            <button type="button" class="sw-tool" data-terrain-tool="material" title="Paint Material Texture">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m19 11-8-8-8.5 8.5a2.12 2.12 0 0 0 3 3L12 8l6.5 6.5a2.12 2.12 0 0 0 3-3z"/></svg>
            </button>
            <button type="button" class="sw-tool" data-terrain-tool="terrace" title="Terrace / stepped landscape">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 18h18M5 13h14M8 8h8"/></svg>
            </button>
            <button type="button" class="sw-tool" data-terrain-tool="grab" title="Grab / lift terrain">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M7 12V7a2 2 0 0 1 4 0v5m0-7a2 2 0 0 1 4 0v7m0-5a2 2 0 0 1 4 0v7c0 4-3 7-7 7h-2c-3 0-5-2-6-5l-1-3a2 2 0 0 1 4-1l1 2V12"/></svg>
            </button>
            <button type="button" class="sw-tool" data-terrain-tool="inflate" title="Inflate / dome">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 16c3-8 13-8 16 0M6 16v3h12v-3M12 4v6m-3-3 3-3 3 3"/></svg>
            </button>
            <button type="button" class="sw-tool" data-terrain-tool="deflate" title="Deflate / press down">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 8c3 8 13 8 16 0M6 8V5h12v3M12 20v-6m-3 3 3 3 3-3"/></svg>
            </button>
            <button type="button" class="sw-tool" data-terrain-tool="ridge" title="Build sharp natural ridges">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 18 9 9l3 4 4-8 5 13"/></svg>
            </button>
            <button type="button" class="sw-tool" data-terrain-tool="valley" title="Carve natural valleys">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 6l6 9 3-4 4 8 5-13"/></svg>
            </button>
            <button type="button" class="sw-tool" data-terrain-tool="cliff" title="Create stepped cliff faces">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M5 4v16h14M5 15h7M5 10h5M5 6h3"/></svg>
            </button>
            <button type="button" class="sw-tool" data-terrain-tool="plateau" title="Flatten broad plateau">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 17h18M6 17v-5h12v5M8 12V8h8v4"/></svg>
            </button>
            <button type="button" class="sw-tool" data-terrain-tool="crater" title="Carve crater / volcanic bowl">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 8c3 8 15 8 18 0M5 8c2-4 12-4 14 0M7 8c2 3 8 3 10 0"/></svg>
            </button>
            <button type="button" class="sw-tool" data-terrain-tool="canyon" title="Carve canyon profile">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 5v14M7 7l3 4 4-2 3 8 4-3"/></svg>
            </button>
            <button type="button" class="sw-tool" data-terrain-tool="dune" title="Create wind-shaped dunes">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M2 18c4-8 7-8 10-2 3 6 6 6 10-2M3 12c3-5 5-5 7-2"/></svg>
            </button>
            <button type="button" class="sw-tool" data-terrain-tool="fill" title="Fill local depressions">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 14c3 0 4 4 8 4s5-4 8-4M12 3v10m-4-4 4 4 4-4"/></svg>
            </button>
            <button type="button" class="sw-tool" data-terrain-tool="relax" title="Relax surface while preserving broad forms">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 8c4-5 12-5 16 0M4 16c4 5 12 5 16 0M8 12h8"/></svg>
            </button>
            <button type="button" class="sw-tool" data-terrain-tool="sharpen" title="Sharpen terrain details">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 3l3 7 6 2-6 2-3 7-3-7-6-2 6-2 3-7z"/></svg>
            </button>
            <button type="button" class="sw-tool" data-terrain-tool="blur" title="Blur / soften terrain">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="7" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="17" cy="12" r="2"/></svg>
            </button>
            <button type="button" class="sw-tool" data-terrain-tool="hydraulic" title="Advanced hydraulic erosion">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 3s-6 7-6 11a6 6 0 0 0 12 0c0-4-6-11-6-11zM8 15c1 2 3 3 5 3"/></svg>
            </button>
          </div>
        </div>

        <!-- Brush Settings -->
        <div class="sw-section">
          <div class="sw-section-title">Brush Parameters</div>
          <div class="sw-prop-grid">
            <div class="sw-prop">
              <label>Radius (m)</label>
              <input type="number" id="sculpt-brush-size-num" class="sw-input" min="0.5" max="200" step="0.5" value="10">
            </div>
            <div class="sw-prop">
              <label>Strength</label>
              <input type="number" id="sculpt-brush-strength-num" class="sw-input" min="0.01" max="5.0" step="0.05" value="0.5">
            </div>
          </div>
          <div style="padding: 0 8px 8px 8px; display: flex; flex-direction: column; gap: 8px;">
            <div>
              <div style="display: flex; justify-content: space-between; font-size: 9px; color: var(--text-muted); margin-bottom: 2px;">
                <span>RADIUS</span>
                <span id="sculpt-brush-size-lbl">10.0m</span>
              </div>
              <input type="range" id="brushSize" min="0.5" max="100" step="0.5" value="10" style="width: 100%; accent-color: var(--accent-info, #3498db);">
            </div>
            <div>
              <div style="display: flex; justify-content: space-between; font-size: 9px; color: var(--text-muted); margin-bottom: 2px;">
                <span>STRENGTH</span>
                <span id="sculpt-brush-strength-lbl">0.50</span>
              </div>
              <input type="range" id="brushStrength" min="0.01" max="2.0" step="0.05" value="0.5" style="width: 100%; accent-color: var(--accent-info, #3498db);">
            </div>
            <div>
              <div style="display: flex; justify-content: space-between; font-size: 9px; color: var(--text-muted); margin-bottom: 2px;">
                <span>FALLOFF</span>
                <span id="sculpt-brush-falloff-lbl">0.50</span>
              </div>
              <input type="range" id="brushFalloff" min="0.01" max="1.0" step="0.05" value="0.5" style="width: 100%; accent-color: var(--accent-info, #3498db);">
            </div>
            <div class="sw-prop-grid sw-advanced-grid">
              <label class="sw-prop"><span>STROKE SPACING</span><input type="number" id="terrain-brush-spacing" class="sw-input" min="0.02" max="0.5" step="0.01" value="0.12"></label>
              <label class="sw-prop"><span>TERRACE STEP (m)</span><input type="number" id="terrain-terrace-step" class="sw-input" min="0.05" max="20" step="0.05" value="1"></label>
              <label class="sw-prop"><span>EROSION ITERATIONS</span><input type="number" id="terrain-erosion-iterations" class="sw-input" min="1" max="12" step="1" value="4"></label>
              <label class="sw-prop"><span>TALUS ANGLE</span><input type="number" id="terrain-talus-angle" class="sw-input" min="0.001" max="2" step="0.01" value="0.08"></label>
              <label class="sw-prop"><span>NOISE AMPLITUDE</span><input type="number" id="terrain-noise-amplitude" class="sw-input" min="0" max="20" step="0.1" value="1"></label>
              <label class="sw-prop"><span>NOISE FREQUENCY</span><input type="number" id="terrain-noise-frequency" class="sw-input" min="0.0001" max="2" step="0.001" value="0.08"></label>
              <label class="sw-prop"><span>NOISE OCTAVES</span><input type="number" id="terrain-noise-octaves" class="sw-input" min="1" max="8" step="1" value="5"></label>
              <label class="sw-prop"><span>NOISE PERSISTENCE</span><input type="number" id="terrain-noise-persistence" class="sw-input" min="0" max="1" step="0.05" value="0.5"></label>
              <label class="sw-prop"><span>NOISE SEED</span><input type="number" id="terrain-noise-seed" class="sw-input" min="0" max="2147483647" step="1" value="1337"></label>
            </div>
          </div>
        </div>

        <div class="sw-section">
          <div class="sw-section-title">Landscape Tools</div>
          <div class="sw-landscape-actions">
            <button type="button" class="sw-session-btn" data-terrain-action="smooth-all"><i class="fas fa-water"></i> Smooth All</button>
            <button type="button" class="sw-session-btn" data-terrain-action="normalize"><i class="fas fa-arrows-alt-v"></i> Normalize Heights</button>
          </div>
          <p class="sw-help">Brushes edit only the affected landscape components. Use the circular preview to place every stroke precisely.</p>
        </div>

        <!-- Symmetry -->
        <div class="sw-section">
          <div class="sw-section-title">Symmetry</div>
          <div style="padding: 8px; display: flex; gap: 8px; align-items: center;">
            <label style="display: flex; align-items: center; gap: 6px; font-size: 10px; cursor: pointer; color: var(--text-secondary);">
              <input type="checkbox" id="terrain-symmetry-toggle">
              <span>Enable Symmetry</span>
            </label>
            <select id="terrain-symmetry-axis" class="sw-input" style="width: 80px; height: 24px; margin-left: auto;">
              <option value="x">X Axis</option>
              <option value="z">Z Axis</option>
            </select>
          </div>
        </div>

        <!-- Player Test -->
        <div class="sw-section" id="terrain-player-test-section">
          <div class="sw-section-title">Player Character Test</div>
          <div style="padding: 8px;" id="terrain-player-test-container"></div>
        </div>
      </div>
    </div>
    `;

    this._bindEvents(panel);
  },

  _bindGeneratorControls(panel, TS) {
    const generator = TS?.generator;
    const state = TS?.state;
    const root = panel.querySelector('#terrain-landscape-generator');
    if (!root || !generator || !state) return;

    const get = (id) => root.querySelector(`#${id}`);
    const preset = get('terrain-generator-preset');
    const profile = get('terrain-generator-profile');
    const flatCentre = get('terrain-generator-flat-centre');
    const flatCentreReadout = get('terrain-generator-flat-centre-readout');
    const summary = get('terrain-generator-summary');
    const status = root.querySelector('[data-terrain-generator-status]');
    const createButton = get('terrain-generator-create');
    const resetButton = get('terrain-generator-reset');
    const restoreDefaultButton = get('terrain-generator-restore-default');
    const edgeControls = root.querySelectorAll('[data-terrain-edge-controls]');
    const dimensionInputs = [
      get('terrain-generator-components-x'),
      get('terrain-generator-components-z'),
      get('terrain-generator-section-size'),
      get('terrain-generator-quad-size'),
    ];

    const presets = {
      small: {
        componentsX: 3,
        componentsZ: 3,
        sectionSize: 63,
        quadSize: 3.2,
      },
      standard: {
        componentsX: 4,
        componentsZ: 4,
        sectionSize: 63,
        quadSize: 3.6,
      },
      large: {
        componentsX: 5,
        componentsZ: 5,
        sectionSize: 63,
        quadSize: 3.6,
      },
    };

    const readNumber = (id, fallback, min, max, integer = false) => {
      const raw = Number(get(id)?.value);
      const finite = Number.isFinite(raw) ? raw : fallback;
      const clamped = Math.max(min, Math.min(max, finite));
      return integer ? Math.round(clamped) : clamped;
    };

    const setStatus = (text) => {
      state.generatorStatus = text;
      if (status) status.textContent = text;
    };

    const setPreset = (name) => {
      const values = presets[name];
      if (!values) return;
      get('terrain-generator-components-x').value = values.componentsX;
      get('terrain-generator-components-z').value = values.componentsZ;
      get('terrain-generator-section-size').value = values.sectionSize;
      get('terrain-generator-quad-size').value = values.quadSize;
      if (preset) preset.value = name;
    };

    const updateEdgeControls = () => {
      const isEdgeProfile = String(profile?.value).toLowerCase() === 'edgemountains';
      edgeControls.forEach(control => {
        control.classList.toggle('is-disabled', !isEdgeProfile);
        control.querySelectorAll('input').forEach(input => { input.disabled = !isEdgeProfile; });
      });
    };

    const updateSummary = () => {
      const componentsX = readNumber('terrain-generator-components-x', 4, 1, 8, true);
      const componentsZ = readNumber('terrain-generator-components-z', 4, 1, 8, true);
      const sectionSize = readNumber('terrain-generator-section-size', 63, 31, 127, true);
      const quadSize = readNumber('terrain-generator-quad-size', 3.6, 0.25, 20);
      const quadsX = componentsX * sectionSize;
      const quadsZ = componentsZ * sectionSize;
      const width = quadsX * quadSize;
      const length = quadsZ * quadSize;
      const vertices = (quadsX + 1) * (quadsZ + 1);
      const centrePercent = readNumber('terrain-generator-flat-centre', 50, 20, 70, true);

      if (flatCentreReadout) flatCentreReadout.textContent = `${centrePercent}%`;
      if (summary) {
        summary.textContent = `${Math.round(width)} m × ${Math.round(length)} m · ${vertices.toLocaleString()} vertices`;
      }

      updateEdgeControls();
    };

    const syncPreset = () => {
      const matches = Object.entries(presets).find(([, values]) =>
        Number(get('terrain-generator-components-x')?.value) === values.componentsX &&
        Number(get('terrain-generator-components-z')?.value) === values.componentsZ &&
        Number(get('terrain-generator-section-size')?.value) === values.sectionSize &&
        Number(get('terrain-generator-quad-size')?.value) === values.quadSize,
      );
      if (preset) preset.value = matches?.[0] || 'custom';
    };

    preset?.addEventListener('change', () => {
      setPreset(preset.value);
      updateSummary();
    });

    profile?.addEventListener('change', updateSummary);
    flatCentre?.addEventListener('input', updateSummary);
    dimensionInputs.forEach(input => {
      const onDimensionChange = () => {
        syncPreset();
        updateSummary();
      };
      input?.addEventListener('input', onDimensionChange);
      input?.addEventListener('change', onDimensionChange);
    });

    resetButton?.addEventListener('click', () => {
      const defaults = {
        componentsX: 4,
        componentsZ: 4,
        sectionSize: 63,
        quadSize: 3.6,
        heightScale: 1,
        initialMode: 'edgeMountains',
        flatCenterRatio: 0.50,
        edgeMountainAmplitude: 32,
        edgeMountainFalloff: 2.25,
        noiseAmplitude: 5.5,
        noiseFrequency: 0.016,
        noiseOctaves: 5,
        noisePersistence: 0.48,
        noiseSeed: 1337,
        theme: 'realistic',
      };

      Object.assign(state.creation, defaults);
      state.generatorStatus = 'SM Default Basin settings restored.';
      this.render(panel);
    });

    restoreDefaultButton?.addEventListener('click', () => {
      const replaceCurrent = window.confirm?.(
        'Replace the current terrain with the default basin landscape? Any sculpting on the current terrain will be lost.',
      );
      if (!replaceCurrent) return;

      const defaultBasinSettings = {
        componentsX: 4,
        componentsZ: 4,
        sectionSize: 63,
        sectionsPerComponent: 1,
        quadSize: 3.6,
        heightScale: 1,
        initialMode: 'edgeMountains',
        flatCenterRatio: 0.50,
        edgeMountainAmplitude: 32,
        edgeMountainFalloff: 2.25,
        noiseAmplitude: 5.5,
        noiseFrequency: 0.016,
        noiseOctaves: 5,
        noisePersistence: 0.48,
        noiseSeed: 1337,
        theme: 'realistic',
        isDefault: true,
      };

      try {
        restoreDefaultButton.disabled = true;
        setStatus('Restoring the default basin terrain…');
        const terrain = generator.createTerrain(defaultBasinSettings);
        if (!terrain) throw new Error('Default terrain could not be created.');
        setStatus('Default basin terrain restored.');
        this.render(panel);
      } catch (error) {
        console.error('[SculptingPanel] Default terrain restore failed', error);
        setStatus('Could not restore the default basin terrain.');
        restoreDefaultButton.disabled = false;
      }
    });

    createButton?.addEventListener('click', async () => {
      const selectedProfile = profile?.value || 'flat';
      const settings = {
        componentsX: readNumber('terrain-generator-components-x', 4, 1, 8, true),
        componentsZ: readNumber('terrain-generator-components-z', 4, 1, 8, true),
        sectionSize: readNumber('terrain-generator-section-size', 63, 31, 127, true),
        sectionsPerComponent: 1,
        quadSize: readNumber('terrain-generator-quad-size', 3.6, 0.25, 20),
        heightScale: readNumber('terrain-generator-height-scale', 1, 0.1, 10),
        initialMode: selectedProfile,
        flatCenterRatio: readNumber('terrain-generator-flat-centre', 50, 20, 70, true) / 100,
        edgeMountainAmplitude: readNumber('terrain-generator-edge-height', 32, 0, 200),
        edgeMountainFalloff: readNumber('terrain-generator-edge-falloff', 2.25, 0.1, 5),
        noiseAmplitude: readNumber('terrain-generator-noise-amplitude', 5.5, 0, 100),
        noiseFrequency: readNumber('terrain-generator-noise-frequency', 0.016, 0.0001, 1),
        noiseOctaves: readNumber('terrain-generator-noise-octaves', 5, 1, 8, true),
        noisePersistence: readNumber('terrain-generator-noise-persistence', 0.48, 0, 1),
        noiseSeed: readNumber('terrain-generator-seed', 1337, 0, 2147483647, true),
        theme: get('terrain-generator-theme')?.value || 'realistic',
        isNewTerrain: true,
      };

      createButton.disabled = true;
      setStatus('Generating landscape…');

      try {
        // Noise can use the existing worker path; the edge-mountain profile is
        // generated synchronously so its central plane remains exact.
        const terrain = selectedProfile === 'noise'
          ? await generator.createTerrainAsync(settings)
          : generator.createTerrain(settings);

        if (!terrain) throw new Error('Landscape could not be created.');
        setStatus('Landscape generated. The centre is ready for sculpting or level building.');
        // Terrain creation refreshes this panel through sm:terrain-created.
        // Render once more so the freshly mounted generator keeps the final
        // status rather than the temporary "Generating" message.
        this.render(panel);
      } catch (error) {
        console.error('[SculptingPanel] Landscape generation failed', error);
        setStatus('Could not generate the landscape. Check the generator values.');
        createButton.disabled = false;
      }
    });

    syncPreset();
    updateSummary();
  },

  _bindEvents(panel) {
    this._abort?.abort?.();
    this._abort = new AbortController();
    const TS = window.TerrainSculpting;

    // Close button
    panel.querySelector('#sculpting-close-x-btn')?.addEventListener('click', () => {
      this.close();
    });

    // Brush tool buttons
    const toolButtons = panel.querySelectorAll('[data-terrain-tool]');
    toolButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const tool = btn.dataset.terrainTool;
        toolButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        if (TS?.interaction?.setActiveTool) {
          TS.interaction.setActiveTool(tool);
        } else if (typeof window.setActiveTerrainTool === 'function') {
          window.setActiveTerrainTool(tool);
        }
        syncBrushToggle?.();
      });
    });

    // Default to 'raise' active tool
    if (TS?.interaction?.setActiveTool) {
      TS.interaction.setActiveTool('raise');
    }

    // Brush Size bindings
    const sizeRange = panel.querySelector('#brushSize');
    const sizeNum = panel.querySelector('#sculpt-brush-size-num');
    const sizeLbl = panel.querySelector('#sculpt-brush-size-lbl');

    const updateSize = (val) => {
      const v = Math.max(0.1, parseFloat(val) || 10);
      if (sizeRange) sizeRange.value = v;
      if (sizeNum) sizeNum.value = v;
      if (sizeLbl) sizeLbl.textContent = v.toFixed(1) + 'm';
      if (TS?.state) {
        TS.state.brushSize = v;

        // TerrainInteraction already scales the rings to brushSize. Keep the
        // preview root at identity or the visible radius becomes brushSize².
        if (TS.state.brushPreview) TS.state.brushPreview.scale.setScalar(1);
        TS.preview?.updateSize?.();
      }
    };
    sizeRange?.addEventListener('input', e => updateSize(e.target.value));
    sizeNum?.addEventListener('input', e => updateSize(e.target.value));

    // Brush Strength bindings
    const strRange = panel.querySelector('#brushStrength');
    const strNum = panel.querySelector('#sculpt-brush-strength-num');
    const strLbl = panel.querySelector('#sculpt-brush-strength-lbl');

    const updateStr = (val) => {
      const v = Math.max(0.01, parseFloat(val) || 0.5);
      if (strRange) strRange.value = v;
      if (strNum) strNum.value = v;
      if (strLbl) strLbl.textContent = v.toFixed(2);
      if (TS?.state) TS.state.brushStrength = v;
    };
    strRange?.addEventListener('input', e => updateStr(e.target.value));
    strNum?.addEventListener('input', e => updateStr(e.target.value));

    // Brush Falloff bindings
    const fallRange = panel.querySelector('#brushFalloff');
    const fallLbl = panel.querySelector('#sculpt-brush-falloff-lbl');

    const updateFall = (val) => {
      const v = Math.max(0.01, Math.min(1.0, parseFloat(val) || 0.5));
      if (fallRange) fallRange.value = v;
      if (fallLbl) fallLbl.textContent = v.toFixed(2);
      if (TS?.state) TS.state.brushFalloff = v;
    };
    fallRange?.addEventListener('input', e => updateFall(e.target.value));

    // Symmetry bindings
    const symToggle = panel.querySelector('#terrain-symmetry-toggle');
    const symAxis = panel.querySelector('#terrain-symmetry-axis');

    symToggle?.addEventListener('change', e => {
      if (TS?.state) TS.state.symmetryEnabled = e.target.checked;
    });
    symAxis?.addEventListener('change', e => {
      if (TS?.state) TS.state.symmetryAxis = e.target.value;
    });

    const spacingInput = panel.querySelector('#terrain-brush-spacing');
    const terraceStepInput = panel.querySelector('#terrain-terrace-step');
    const status = panel.querySelector('[data-terrain-status]');
    const brushToggle = panel.querySelector('[data-terrain-brush-toggle]');
    const setStatus = (text) => { if (status) status.textContent = text; };
    const syncBrushToggle = () => {
      const enabled = !!TS?.state?.isBrushActive;
      brushToggle?.classList.toggle('is-active', enabled);
      if (brushToggle) {
        brushToggle.innerHTML = `<i class="fas fa-brush"></i> Brush: ${enabled ? 'On' : 'Off'}`;
        brushToggle.title = enabled ? 'Disable terrain brush' : 'Enable terrain brush';
      }
    };
    brushToggle?.addEventListener('click', () => {
      const enabled = TS?.interaction?.toggleBrush?.();
      syncBrushToggle();
      setStatus(enabled ? `Brush active · ${TS?.state?.selectedTool || 'raise'}` : 'Brush disabled · orbit controls available');
    });
    spacingInput?.addEventListener('input', event => {
      if (TS?.state) TS.state.brushSpacing = Math.max(0.02, Math.min(0.5, Number(event.target.value) || 0.12));
    });
    terraceStepInput?.addEventListener('input', event => {
      if (TS?.state) TS.state.terraceStep = Math.max(0.05, Number(event.target.value) || 1);
    });

    const bindStateNumber = (id, key, min, max, fallback) => {
      const input = panel.querySelector(`#${id}`);
      const apply = () => {
        if (!TS?.state || !input) return;
        const value = Number(input.value);
        TS.state[key] = Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
      };
      input?.addEventListener('input', apply);
      input?.addEventListener('change', apply);
      if (input && TS?.state?.[key] != null) input.value = TS.state[key];
    };

    bindStateNumber('terrain-erosion-iterations', 'erosionIterations', 1, 12, 4);
    bindStateNumber('terrain-talus-angle', 'talusAngle', 0.001, 2, 0.08);
    bindStateNumber('terrain-noise-amplitude', 'noiseAmplitude', 0, 20, 1);
    bindStateNumber('terrain-noise-frequency', 'noiseFrequency', 0.0001, 2, 0.08);
    bindStateNumber('terrain-noise-octaves', 'noiseOctaves', 1, 8, 5);
    bindStateNumber('terrain-noise-persistence', 'noisePersistence', 0, 1, 0.5);
    bindStateNumber('terrain-noise-seed', 'noiseSeed', 0, 2147483647, 1337);

    panel.querySelectorAll('[data-terrain-action]').forEach(button => {
      button.addEventListener('click', () => {
        const action = button.dataset.terrainAction;
        if (action === 'undo') {
          const changed = TS?.history?.undo?.();
          setStatus(changed ? 'Undid terrain stroke' : 'Nothing to undo');
          return;
        }
        if (action === 'redo') {
          const changed = TS?.history?.redo?.();
          setStatus(changed ? 'Redid terrain stroke' : 'Nothing to redo');
          return;
        }
        const terrain = TS?.getLandscape?.();
        const data = terrain?.userData?.terrainData;
        const manager = terrain?.userData?.componentManager;
        if (!data || !manager) { setStatus('Create a landscape first'); return; }
        TS.history?.capture?.(action === 'smooth-all' ? 'Smooth Landscape' : 'Normalize Landscape');
        if (action === 'smooth-all') {
          const source = data.heights.slice();
          for (let index = 0; index < source.length; index++) {
            const neighbours = TS.spatial.getNeighbors(index);
            if (neighbours.length) data.heights[index] = source[index] * 0.45 + neighbours.reduce((sum, i) => sum + source[i], 0) / neighbours.length * 0.55;
          }
          setStatus('Smoothed landscape');
        } else if (action === 'normalize') {
          let min = Infinity, max = -Infinity;
          for (const height of data.heights) { min = Math.min(min, height); max = Math.max(max, height); }
          const range = Math.max(0.00001, max - min);
          for (let index = 0; index < data.heights.length; index++) data.heights[index] = (data.heights[index] - min) / range * 10;
          setStatus('Normalized height range to 10m');
        }
        data.version = (data.version || 0) + 1;
        manager.syncAll();
        window.dispatchEvent(new CustomEvent('sm:terrain-changed', { detail: { terrain, reason: action } }));
      });
    });

    document.addEventListener('keydown', event => {
      if (!this.isOpen || !event.ctrlKey || event.key.toLowerCase() !== 'z') return;
      if (event.target?.matches?.('input, textarea, select')) return;
      event.preventDefault();
      const changed = event.shiftKey ? TS?.history?.redo?.() : TS?.history?.undo?.();
      setStatus(changed ? (event.shiftKey ? 'Redid terrain stroke' : 'Undid terrain stroke') : 'Nothing to change');
    }, { signal: this._abort?.signal });

    updateSize(TS?.state?.brushSize || 10);
    updateStr(TS?.state?.brushStrength || 0.5);
    updateFall(TS?.state?.brushFalloff || 0.5);
    if (spacingInput) spacingInput.value = TS?.state?.brushSpacing || 0.12;
    if (terraceStepInput) terraceStepInput.value = TS?.state?.terraceStep || 1;
    const advancedDefaults = { erosionIterations: 4, talusAngle: 0.08, noiseAmplitude: 1, noiseFrequency: 0.08, noiseOctaves: 5, noisePersistence: 0.5, noiseSeed: 1337 };
    Object.entries(advancedDefaults).forEach(([key, value]) => {
      const input = panel.querySelector(`#terrain-${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`);
      if (input && TS?.state) input.value = TS.state[key] ?? value;
    });
    syncBrushToggle();

    // The landscape generator owns terrain creation. It deliberately lives
    // here, in Terrain Sculpt, and is never mixed with the mesh-sculpt UI.
    this._bindGeneratorControls(panel, TS);

    // Mount Player Test controls
    TS?.ui?.setupPlayerTestControls?.();
  },

  close() {
    window.setActiveTerrainTool?.(null);
    window.TerrainSculpting?.preview?.hideBrushPreviews?.();

    if (window.controls) {
      window.controls.enabled = true;
    }

    const panel = document.getElementById("sculpting-panel");
    if (panel) {
      window.PanelDockManager?.closePanel?.('terrain-sculpt');
    }

    document.getElementById('sculptingLandscapeBtn')?.classList.remove('active');
    this.isOpen = false;

  },
};

window.SculptingPanel = SculptingPanel;

SculptingPanel.init();
