// panels/settingsPanel.js
//
// UI-ONLY settings window. All feature logic, default values and
// engine application live in engine/settings/*.js; this file owns
// only the DOM:
//
//   - builds #settings-window
//   - section navigation & collapsible blocks
//   - titlebar drag / minimize / close (+ window position save)
//   - binds each control to window.EngineSettings.set(id, value)
//
// Nothing here touches renderer/scene/camera/controls directly.

(function () {
  class SettingsPanel {
    constructor() {
      this.panel = null;
      this.activeSection = "interface";
      this._dragState = null;
      this._settingsUnsubscribe = null;

      // Document-tab integration.
      this._displayMode = "closed"; // closed | modal | document
      this._documentHost = null;
      this._documentSurface = null;
      this._documentResizeBound = false;
      this._documentResizeObserver = null;
      this._originalParent = null;
      this._originalNextSibling = null;
    }

    init() {
      if (this.panel) return;

      this.panel = document.createElement("div");
      this.panel.id = "settings-window";
      this.panel.className = "settings-window";

      this.panel.innerHTML = `
                <div class="settings-window-titlebar" id="settings-window-titlebar">
                    <div class="settings-window-title">
                        <i class="fa-solid fa-gear"></i>
                        <span>Preferences</span>
                    </div>

                    <div class="settings-window-titlebar-actions">
                        <button class="settings-titlebar-shortcuts" id="settings-shortcuts-btn" type="button" title="Keyboard Shortcuts (?)" aria-label="Open keyboard shortcuts">
                            <i class="fa-solid fa-keyboard" aria-hidden="true"></i>
                            <span>Shortcuts</span>
                            <kbd>?</kbd>
                        </button>

                        <div class="settings-window-controls">
                            <button class="settings-window-control" id="settings-minimize-btn" title="Minimize">
                                <i class="fa-solid fa-minus"></i>
                            </button>

                            <button class="settings-window-control settings-close-btn" id="settings-close-btn" title="Close">
                                <i class="fa-solid fa-xmark"></i>
                            </button>
                        </div>
                    </div>
                </div>

                <div class="settings-window-body">

                    <aside class="settings-sidebar">

                        <div class="settings-sidebar-group">
                            <button class="settings-nav-btn active" data-settings-section="interface">
                                <i class="fa-solid fa-window-maximize"></i>
                                <span>Interface</span>
                            </button>

                            <button class="settings-nav-btn" data-settings-section="viewport">
                                <i class="fa-solid fa-cube"></i>
                                <span>Viewport</span>
                            </button>

                            <button class="settings-nav-btn" data-settings-section="lighting">
                                <i class="fa-solid fa-lightbulb"></i>
                                <span>Lights</span>
                            </button>

                            <button class="settings-nav-btn settings-nav-sky" data-settings-section="sky">
                                <i class="fa-solid fa-cloud-sun"></i>
                                <span>Sky &amp; Atmosphere</span>
                            </button>

                            <button class="settings-nav-btn" data-settings-section="editing">
                                <i class="fa-solid fa-pen-ruler"></i>
                                <span>Editing</span>
                            </button>

                            <button class="settings-nav-btn" data-settings-section="animation">
                                <i class="fa-solid fa-film"></i>
                                <span>Animation</span>
                            </button>
                        </div>


                        <div class="settings-sidebar-group">
                            <button class="settings-nav-btn" data-settings-section="addons">
                                <i class="fa-solid fa-puzzle-piece"></i>
                                <span>Add-ons</span>
                            </button>

                            <button class="settings-nav-btn" data-settings-section="themes">
                                <i class="fa-solid fa-palette"></i>
                                <span>Themes</span>
                            </button>
                        </div>


                        <div class="settings-sidebar-group">
                            <button class="settings-nav-btn" data-settings-section="input">
                                <i class="fa-solid fa-keyboard"></i>
                                <span>Input</span>
                            </button>

                            <button class="settings-nav-btn" data-settings-section="navigation">
                                <i class="fa-solid fa-compass"></i>
                                <span>Navigation</span>
                            </button>

                            <button class="settings-nav-btn" data-settings-section="keymap">
                                <i class="fa-solid fa-key"></i>
                                <span>Keymap</span>
                            </button>
                        </div>


                        <div class="settings-sidebar-group">
                            <button class="settings-nav-btn" data-settings-section="system">
                                <i class="fa-solid fa-microchip"></i>
                                <span>System</span>
                            </button>

                            <button class="settings-nav-btn" data-settings-section="save-load">
                                <i class="fa-solid fa-floppy-disk"></i>
                                <span>Save &amp; Load</span>
                            </button>

                            <button class="settings-nav-btn" data-settings-section="file-paths">
                                <i class="fa-solid fa-folder-tree"></i>
                                <span>File Paths</span>
                            </button>
                        </div>

                    </aside>


                    <main class="settings-main">

                        <!-- INTERFACE -->
                        <section class="settings-section active" data-settings-page="interface">

                            <div class="settings-section-block">
                                <div class="settings-section-header">
                                    <i class="fa-solid fa-chevron-down"></i>
                                    <span>Display</span>
                                </div>

                                <div class="settings-section-content">

                                    <div class="settings-row">
                                        <span class="settings-label">Resolution Scale</span>

                                        <div class="settings-control-wide">
                                            <input
                                                id="setting-resolution-scale"
                                                class="settings-range"
                                                type="range"
                                                min="0.5"
                                                max="2"
                                                value="1"
                                                step="0.01"
                                            >
                                            <span id="setting-resolution-scale-value">1.00</span>
                                        </div>
                                    </div>


                                    <div class="settings-row">
                                        <span class="settings-label">Line Width</span>

                                        <select id="setting-line-width" class="settings-select-wide">
                                            <option value="default">Default</option>
                                            <option value="thin">Thin</option>
                                            <option value="thick">Thick</option>
                                        </select>
                                    </div>


                                    <div class="settings-row">
                                        <span class="settings-label"></span>

                                        <label class="settings-checkbox-row">
                                            <input id="setting-splash-screen" type="checkbox" checked>
                                            <span>Splash Screen</span>
                                        </label>
                                    </div>


                                    <div class="settings-row">
                                        <span class="settings-label"></span>

                                        <label class="settings-checkbox-row">
                                            <input id="setting-developer-extras" type="checkbox">
                                            <span>Developer Extras</span>
                                        </label>
                                    </div>


                                    <div class="settings-row">
                                        <span class="settings-label">Tooltips</span>

                                        <label class="settings-checkbox-row">
                                            <input id="setting-user-tooltips" type="checkbox" checked>
                                            <span>User Tooltips</span>
                                        </label>
                                    </div>

                                </div>
                            </div>


                            <div class="settings-section-block">
                                <div class="settings-section-header">
                                    <i class="fa-solid fa-chevron-down"></i>
                                    <span>Editors</span>
                                </div>

                                <div class="settings-section-content">

                                    <div class="settings-row">
                                        <span class="settings-label"></span>

                                        <label class="settings-checkbox-row">
                                            <input id="setting-region-overlap" type="checkbox" checked>
                                            <span>Region Overlap</span>
                                        </label>
                                    </div>


                                    <div class="settings-row">
                                        <span class="settings-label"></span>

                                        <label class="settings-checkbox-row">
                                            <input id="setting-navigation-controls" type="checkbox" checked>
                                            <span>Navigation Controls</span>
                                        </label>
                                    </div>


                                    <div class="settings-row">
                                        <span class="settings-label">Header Position</span>

                                        <select id="setting-header-position" class="settings-select-wide">
                                            <option value="keep-existing">Keep Existing</option>
                                            <option value="top">Top</option>
                                            <option value="bottom">Bottom</option>
                                        </select>
                                    </div>

                                </div>
                            </div>


                            <div class="settings-section-block">
                                <div class="settings-section-header">
                                    <i class="fa-solid fa-chevron-down"></i>
                                    <span>Status Bar</span>
                                </div>

                                <div class="settings-section-content">

                                    <div class="settings-row">
                                        <span class="settings-label">Show</span>

                                        <div class="settings-checkbox-column">
                                            <label class="settings-checkbox-row">
                                                <input id="setting-scene-statistics" type="checkbox">
                                                <span>Scene Statistics</span>
                                            </label>

                                            <label class="settings-checkbox-row">
                                                <input id="setting-system-memory" type="checkbox">
                                                <span>System Memory</span>
                                            </label>

                                            <label class="settings-checkbox-row">
                                                <input id="setting-video-memory" type="checkbox">
                                                <span>Video Memory</span>
                                            </label>

                                            <label class="settings-checkbox-row">
                                                <input id="setting-version-info" type="checkbox" checked>
                                                <span>Engine Version</span>
                                            </label>
                                        </div>
                                    </div>

                                </div>
                            </div>


                            <div class="settings-section-block">
                                <div class="settings-section-header">
                                    <i class="fa-solid fa-chevron-down"></i>
                                    <span>Language</span>
                                </div>

                                <div class="settings-section-content">

                                    <div class="settings-row">
                                        <span class="settings-label">Language</span>

                                        <select id="setting-language" class="settings-select-wide">
                                            <option value="en">English</option>
                                            <option value="fr">Français</option>
                                            <option value="de">Deutsch</option>
                                            <option value="ar">العربية</option>
                                        </select>
                                    </div>

                                </div>
                            </div>

                        </section>


                        <!-- VIEWPORT -->
                        <section class="settings-section" data-settings-page="viewport">

                            <div class="settings-section-block">
                                <div class="settings-section-header">
                                    <i class="fa-solid fa-chevron-down"></i>
                                    <span>Viewport</span>
                                </div>

                                <div class="settings-section-content">

                                    <div class="settings-row">
                                        <span class="settings-label">Grid</span>

                                        <label class="settings-checkbox-row">
                                            <input id="setting-grid-visible" type="checkbox" checked>
                                            <span>Show Grid</span>
                                        </label>
                                    </div>


                                    <div class="settings-row">
                                        <span class="settings-label">Gizmos</span>

                                        <label class="settings-checkbox-row">
                                            <input id="setting-gizmos-visible" type="checkbox" checked>
                                            <span>Show Transform Gizmos</span>
                                        </label>
                                    </div>


                                    <div class="settings-row">
                                        <span class="settings-label">Pixel Ratio</span>

                                        <select id="setting-pixel-ratio" class="settings-select-wide">
                                            <option value="0.5">0.5×</option>
                                            <option value="0.75">0.75×</option>
                                            <option value="1" selected>1×</option>
                                            <option value="1.5">1.5×</option>
                                            <option value="2">2×</option>
                                        </select>
                                    </div>


                                    <div class="settings-row">
                                        <span class="settings-label">Shadows</span>

                                        <label class="settings-checkbox-row">
                                            <input id="setting-shadows" type="checkbox" checked>
                                            <span>Real-time Shadows</span>
                                        </label>
                                    </div>


                                    <div class="settings-row">
                                        <span class="settings-label">Shadow Map Size</span>

                                        <select id="setting-shadow-map-size" class="settings-select-wide">
                                            <option value="512">512</option>
                                            <option value="1024">1024</option>
                                            <option value="2048" selected>2048</option>
                                            <option value="4096">4096</option>
                                        </select>
                                    </div>


                                    <div class="settings-row">
                                        <span class="settings-label">Anti-aliasing</span>

                                        <select id="setting-antialiasing" class="settings-select-wide">
                                            <option value="off">Off</option>
                                            <option value="msaa" selected>MSAA</option>
                                            <option value="fxaa">FXAA</option>
                                            <option value="smaa">SMAA</option>
                                        </select>
                                    </div>


                                    <div class="settings-row">
                                        <span class="settings-label"></span>

                                        <label class="settings-checkbox-row">
                                            <input id="setting-wireframe" type="checkbox">
                                            <span>Wireframe Overlay</span>
                                        </label>
                                    </div>


                                    <div class="settings-row">
                                        <span class="settings-label"></span>

                                        <label class="settings-checkbox-row">
                                            <input id="setting-backface-culling" type="checkbox" checked>
                                            <span>Backface Culling</span>
                                        </label>
                                    </div>


                                    <div class="settings-row">
                                        <span class="settings-label">Background</span>

                                        <input id="setting-background-color" type="color" value="#333538">
                                    </div>


                                    <div class="settings-row">
                                        <span class="settings-label"></span>

                                        <label class="settings-checkbox-row">
                                            <input id="setting-stats-overlay" type="checkbox">
                                            <span>Stats Overlay (FPS / draw calls)</span>
                                        </label>
                                    </div>

                                </div>
                            </div>


                            <div class="settings-section-block">
                                <div class="settings-section-header">
                                    <i class="fa-solid fa-chevron-down"></i>
                                    <span>Camera</span>
                                </div>

                                <div class="settings-section-content">

                                    <div class="settings-row">
                                        <span class="settings-label">Field of View</span>

                                        <div class="settings-control-wide">
                                            <input
                                                id="setting-camera-fov"
                                                class="settings-range"
                                                type="range"
                                                min="20"
                                                max="120"
                                                value="50"
                                                step="1"
                                            >
                                            <span id="setting-camera-fov-value">50</span>
                                        </div>
                                    </div>


                                    <div class="settings-row">
                                        <span class="settings-label">Near Clip</span>

                                        <input
                                            id="setting-camera-near"
                                            class="settings-number-input"
                                            type="number"
                                            min="0.001"
                                            step="0.001"
                                            value="0.1"
                                        >
                                    </div>


                                    <div class="settings-row">
                                        <span class="settings-label">Far Clip</span>

                                        <input
                                            id="setting-camera-far"
                                            class="settings-number-input"
                                            type="number"
                                            min="1"
                                            step="10"
                                            value="1000"
                                        >
                                    </div>


                                    <div class="settings-row">
                                        <span class="settings-label"></span>

                                        <label class="settings-checkbox-row">
                                            <input id="setting-fog-enabled" type="checkbox">
                                            <span>Enable Fog</span>
                                        </label>
                                    </div>

                                </div>
                            </div>

                        </section>


                        <!-- LIGHTING -->
                        <section class="settings-section" data-settings-page="lighting">

                            <div class="settings-section-block">
                                <div class="settings-section-header">
                                    <i class="fa-solid fa-chevron-down"></i>
                                    <span>Lighting</span>
                                </div>

                                <div class="settings-section-content">

                                    <div class="settings-row">
                                        <span class="settings-label">Ambient Intensity</span>

                                        <div class="settings-control-wide">
                                            <input
                                                id="setting-ambient-intensity"
                                                class="settings-range"
                                                type="range"
                                                min="0"
                                                max="3"
                                                step="0.05"
                                                value="0.4"
                                            >
                                            <span id="setting-ambient-intensity-value">0.40</span>
                                        </div>
                                    </div>


                                    <div class="settings-row">
                                        <span class="settings-label">Directional Intensity</span>

                                        <div class="settings-control-wide">
                                            <input
                                                id="setting-directional-intensity"
                                                class="settings-range"
                                                type="range"
                                                min="0"
                                                max="5"
                                                step="0.05"
                                                value="1"
                                            >
                                            <span id="setting-directional-intensity-value">1.00</span>
                                        </div>
                                    </div>


                                    <div class="settings-row">
                                        <span class="settings-label">Tone Mapping</span>

                                        <select id="setting-tone-mapping" class="settings-select-wide">
                                            <option value="none">None</option>
                                            <option value="linear">Linear</option>
                                            <option value="reinhard">Reinhard</option>
                                            <option value="cineon">Cineon</option>
                                            <option value="aces-filmic" selected>ACES Filmic</option>
                                        </select>
                                    </div>


                                    <div class="settings-row">
                                        <span class="settings-label">Exposure</span>

                                        <div class="settings-control-wide">
                                            <input
                                                id="setting-exposure"
                                                class="settings-range"
                                                type="range"
                                                min="0"
                                                max="3"
                                                step="0.05"
                                                value="1"
                                            >
                                            <span id="setting-exposure-value">1.00</span>
                                        </div>
                                    </div>

                                    <div class="settings-row">
                                        <span class="settings-label">Auto Exposure</span>
                                        <label class="settings-checkbox-row">
                                            <input id="setting-auto-exposure" type="checkbox" checked>
                                            <span>Eye Adaptation</span>
                                        </label>
                                    </div>

                                    <div class="settings-row">
                                        <span class="settings-label">Compensation (EV)</span>
                                        <div class="settings-control-wide">
                                            <input id="setting-exposure-compensation" class="settings-range" type="range" min="-3" max="3" step="0.1" value="0">
                                            <span id="setting-exposure-compensation-value">0.0</span>
                                        </div>
                                    </div>

                                    <div class="settings-row">
                                        <span class="settings-label">Exposure Range</span>
                                        <div class="settings-control-wide">
                                            <input id="setting-exposure-min" class="settings-range" title="Minimum exposure" type="range" min="0.05" max="2" step="0.05" value="0.32">
                                            <span id="setting-exposure-min-value">0.32</span>
                                            <input id="setting-exposure-max" class="settings-range" title="Maximum exposure" type="range" min="0.5" max="8" step="0.1" value="3.2">
                                            <span id="setting-exposure-max-value">3.2</span>
                                        </div>
                                    </div>

                                    <div class="settings-row">
                                        <span class="settings-label">Bright Adaptation</span>
                                        <div class="settings-control-wide">
                                            <input id="setting-exposure-speed-bright" class="settings-range" type="range" min="0.1" max="8" step="0.1" value="3.5">
                                            <span id="setting-exposure-speed-bright-value">3.5</span>
                                        </div>
                                    </div>

                                    <div class="settings-row">
                                        <span class="settings-label">Dark Adaptation</span>
                                        <div class="settings-control-wide">
                                            <input id="setting-exposure-speed-dark" class="settings-range" type="range" min="0.1" max="5" step="0.1" value="1.1">
                                            <span id="setting-exposure-speed-dark-value">1.1</span>
                                        </div>
                                    </div>

                                    <div class="settings-row">
                                        <span class="settings-label">Center Metering</span>
                                        <div class="settings-control-wide">
                                            <input id="setting-exposure-center-weight" class="settings-range" type="range" min="0" max="1" step="0.05" value="0.8">
                                            <span id="setting-exposure-center-weight-value">0.80</span>
                                        </div>
                                    </div>

                                    <div class="settings-row">
                                        <span class="settings-label">Local Exposure</span>
                                        <div class="settings-control-wide">
                                            <input id="setting-local-exposure" class="settings-range" type="range" min="0" max="0.5" step="0.01" value="0.1">
                                            <span id="setting-local-exposure-value">0.10</span>
                                        </div>
                                    </div>

                                    <div class="settings-row">
                                        <span class="settings-label">Exposure Debug</span>
                                        <label class="settings-checkbox-row">
                                            <input id="setting-exposure-debug" type="checkbox">
                                            <span>Show Meter Values</span>
                                        </label>
                                    </div>


                                    <div class="settings-row">
                                        <span class="settings-label"></span>

                                        <label class="settings-checkbox-row">
                                            <input id="setting-environment-map" type="checkbox">
                                            <span>Use Environment Map (IBL)</span>
                                        </label>
                                    </div>


                                    <div class="settings-row">
                                        <span class="settings-label">HDRI Intensity</span>

                                        <div class="settings-control-wide">
                                            <input
                                                id="setting-hdri-intensity"
                                                class="settings-range"
                                                type="range"
                                                min="0"
                                                max="3"
                                                step="0.05"
                                                value="0.65"
                                            >
                                            <span id="setting-hdri-intensity-value">0.65</span>
                                        </div>
                                    </div>


                                </div>
                            </div>
                            <div class="settings-section-block">
                                <div class="settings-section-header">
                                    <i class="fa-solid fa-chevron-down"></i>
                                    <span>Lumen Global Illumination</span>
                                </div>
                                <div class="settings-section-content">
                                    <div class="settings-row">
                                        <span class="settings-label">Lumen</span>
                                        <label class="settings-checkbox-row">
                                            <input id="setting-lumen-enabled" type="checkbox" checked>
                                            <span>Enable Lumen Lighting</span>
                                        </label>
                                    </div>
                                    <div class="settings-row">
                                        <span class="settings-label">G-Buffer</span>
                                        <label class="settings-checkbox-row">
                                            <input id="setting-lumen-gbuffer-enabled" type="checkbox" checked>
                                            <span>Render Normal / Depth Buffer</span>
                                        </label>
                                    </div>
                                    <div class="settings-row">
                                        <span class="settings-label">Screen Space GI</span>
                                        <label class="settings-checkbox-row">
                                            <input id="setting-lumen-ssgi-enabled" type="checkbox" checked>
                                            <span>Enable SSGI</span>
                                        </label>
                                    </div>
                                    <div class="settings-row">
                                        <span class="settings-label">GI Intensity</span>
                                        <div class="settings-control-wide">
                                            <input id="setting-lumen-gi-intensity" class="settings-range" type="range" min="0" max="3" step="0.05" value="1">
                                            <span id="setting-lumen-gi-intensity-value">1.00</span>
                                        </div>
                                    </div>
                                    <div class="settings-row">
                                        <span class="settings-label">GI Resolution</span>
                                        <select id="setting-lumen-gi-resolution-scale" class="settings-select-wide">
                                            <option value="0.125">12.5%</option>
                                            <option value="0.25" selected>25%</option>
                                            <option value="0.5">50%</option>
                                            <option value="0.75">75%</option>
                                            <option value="1">100%</option>
                                        </select>
                                    </div>
                                    <div class="settings-row">
                                        <span class="settings-label">GI Rays / Pixel</span>
                                        <div class="settings-control-wide">
                                            <input id="setting-lumen-gi-rays" class="settings-range" type="range" min="1" max="8" step="1" value="1">
                                            <span id="setting-lumen-gi-rays-value">1</span>
                                        </div>
                                    </div>
                                    <div class="settings-row">
                                        <span class="settings-label">GI Max Steps</span>
                                        <div class="settings-control-wide">
                                            <input id="setting-lumen-gi-max-steps" class="settings-range" type="range" min="4" max="64" step="1" value="12">
                                            <span id="setting-lumen-gi-max-steps-value">12</span>
                                        </div>
                                    </div>
                                    <div class="settings-row">
                                        <span class="settings-label">Ray Thickness</span>
                                        <div class="settings-control-wide">
                                            <input id="setting-lumen-gi-thickness" class="settings-range" type="range" min="0.01" max="1" step="0.01" value="0.2">
                                            <span id="setting-lumen-gi-thickness-value">0.20</span>
                                        </div>
                                    </div>
                                    <div class="settings-row">
                                        <span class="settings-label">Emissive Boost</span>
                                        <div class="settings-control-wide">
                                            <input id="setting-lumen-emissive-boost" class="settings-range" type="range" min="0" max="8" step="0.1" value="1.5">
                                            <span id="setting-lumen-emissive-boost-value">1.5</span>
                                        </div>
                                    </div>
                                    <div class="settings-row">
                                        <span class="settings-label">Probe Fallback</span>
                                        <label class="settings-checkbox-row">
                                            <input id="setting-lumen-probe-fallback" type="checkbox" checked>
                                            <span>Use Radiance Probes Off-screen</span>
                                        </label>
                                    </div>
                                    <div class="settings-row">
                                        <span class="settings-label">Indirect Diffuse</span>
                                        <label class="settings-checkbox-row">
                                            <input id="setting-lumen-indirect-diffuse" type="checkbox" checked>
                                            <span>Composite Indirect Lighting</span>
                                        </label>
                                    </div>
                                </div>
                            </div>
                            <div class="settings-section-block">
                                <div class="settings-section-header">
                                    <i class="fa-solid fa-chevron-down"></i>
                                    <span>Lumen Probes &amp; Scene Cache</span>
                                </div>
                                <div class="settings-section-content">
                                    <div class="settings-row">
                                        <span class="settings-label">Probe Grid Size</span>
                                        <div class="settings-control-wide">
                                            <input id="setting-lumen-probe-grid-size" class="settings-range" type="range" min="4" max="24" step="1" value="12">
                                            <span id="setting-lumen-probe-grid-size-value">12</span>
                                        </div>
                                    </div>
                                    <div class="settings-row">
                                        <span class="settings-label">Probe Spacing</span>
                                        <div class="settings-control-wide">
                                            <input id="setting-lumen-probe-spacing" class="settings-range" type="range" min="0.5" max="12" step="0.5" value="3">
                                            <span id="setting-lumen-probe-spacing-value">3.0</span>
                                        </div>
                                    </div>
                                    <div class="settings-row">
                                        <span class="settings-label">Probe Update Budget</span>
                                        <div class="settings-control-wide">
                                            <input id="setting-lumen-probe-update-budget" class="settings-range" type="range" min="0" max="24" step="1" value="2">
                                            <span id="setting-lumen-probe-update-budget-value">2</span>
                                        </div>
                                    </div>
                                    <div class="settings-row">
                                        <span class="settings-label">Camera Relative</span>
                                        <label class="settings-checkbox-row">
                                            <input id="setting-lumen-probe-follow-camera" type="checkbox" checked>
                                            <span>Probe Grid Follows Camera</span>
                                        </label>
                                    </div>
                                    <div class="settings-row">
                                        <span class="settings-label">Surface Cache</span>
                                        <label class="settings-checkbox-row">
                                            <input id="setting-lumen-surface-cache" type="checkbox" checked>
                                            <span>Enable Static Surface Cache</span>
                                        </label>
                                    </div>
                                    <div class="settings-row">
                                        <span class="settings-label">Surface Card Budget</span>
                                        <div class="settings-control-wide">
                                            <input id="setting-lumen-surface-card-budget" class="settings-range" type="range" min="0" max="16" step="1" value="1">
                                            <span id="setting-lumen-surface-card-budget-value">1</span>
                                        </div>
                                    </div>
                                    <div class="settings-row">
                                        <span class="settings-label">Voxel Scene</span>
                                        <label class="settings-checkbox-row">
                                            <input id="setting-lumen-voxel-enabled" type="checkbox">
                                            <span>Enable Voxel Off-screen Scene</span>
                                        </label>
                                    </div>
                                    <div class="settings-row">
                                        <span class="settings-label">Voxel Resolution</span>
                                        <select id="setting-lumen-voxel-resolution" class="settings-select-wide">
                                            <option value="16">16³</option>
                                            <option value="32" selected>32³</option>
                                            <option value="64">64³</option>
                                            <option value="96">96³</option>
                                            <option value="128">128³</option>
                                        </select>
                                    </div>
                                    <div class="settings-row">
                                        <span class="settings-label">Voxel World Size</span>
                                        <div class="settings-control-wide">
                                            <input id="setting-lumen-voxel-world-size" class="settings-range" type="range" min="16" max="256" step="8" value="96">
                                            <span id="setting-lumen-voxel-world-size-value">96</span>
                                        </div>
                                    </div>
                                    <div class="settings-row">
                                        <span class="settings-label">Voxel Update Budget</span>
                                        <div class="settings-control-wide">
                                            <input id="setting-lumen-voxel-update-budget" class="settings-range" type="range" min="0" max="16" step="1" value="1">
                                            <span id="setting-lumen-voxel-update-budget-value">1</span>
                                        </div>
                                    </div>
                                    <div class="settings-row">
                                        <span class="settings-label">Rebuild Cache</span>
                                        <label class="settings-checkbox-row">
                                            <input id="setting-lumen-rebuild-cache" type="checkbox">
                                            <span>Rebuild Lumen Scene Data</span>
                                        </label>
                                    </div>
                                </div>
                            </div>
                        </section>


                        <!-- SKY & ATMOSPHERE (available in every workspace mode) -->
                        <section class="settings-section" data-settings-page="sky">

                            <div class="settings-section-block">
                                <div class="settings-section-header">
                                    <i class="fa-solid fa-chevron-down"></i>
                                    <span>Time &amp; Weather</span>
                                </div>

                                <div class="settings-section-content">

                                    <div class="settings-row">
                                        <span class="settings-label">Sky Visible</span>

                                        <label class="settings-checkbox-row">
                                            <input id="setting-sky-visible" type="checkbox" checked>
                                            <span>Render Sky &amp; Atmosphere</span>
                                        </label>
                                    </div>

                                    <div class="settings-row">
                                        <span class="settings-label">Shader Sky</span>
                                    
                                        <label class="settings-checkbox-row" for="setting-advanced-shader-sky" style="cursor: pointer; user-select: none;">
                                            <input 
                                                id="setting-advanced-shader-sky" 
                                                type="checkbox" 
                                                style="cursor: pointer; pointer-events: auto !important; position: relative; z-index: 10;"
                                            >
                                            <span>Active Advanced Atmospheric Shader</span>
                                        </label>
                                    </div>


                                    <div class="settings-row">
                                        <span class="settings-label">Time of Day</span>

                                        <div class="settings-control-wide">
                                            <input
                                                id="setting-time-of-day"
                                                class="settings-range"
                                                type="range"
                                                min="0"
                                                max="24"
                                                step="0.1"
                                                value="10.5"
                                            >
                                            <span id="setting-time-of-day-value">10.5</span>
                                        </div>
                                    </div>


                                    <div class="settings-row">
                                        <span class="settings-label">Auto Time Cycle</span>

                                        <label class="settings-checkbox-row">
                                            <input id="setting-sky-auto-cycle" type="checkbox">
                                            <span>Advance Over Time</span>
                                        </label>
                                    </div>


                                    <div class="settings-row">
                                        <span class="settings-label">Day Cycle Speed</span>

                                        <div class="settings-control-wide">
                                            <input
                                                id="setting-sky-day-speed"
                                                class="settings-range"
                                                type="range"
                                                min="0"
                                                max="0.05"
                                                step="0.001"
                                                value="0.003"
                                            >
                                            <span id="setting-sky-day-speed-value">0.003</span>
                                        </div>
                                    </div>


                                    <div class="settings-row">
                                        <span class="settings-label">Weather</span>

                                        <select id="setting-weather" class="settings-select-wide">
                                            <option value="clear" selected>Clear</option>
                                            <option value="cloudy">Cloudy</option>
                                            <option value="overcast">Overcast</option>
                                            <option value="rain">Rain</option>
                                            <option value="storm">Thunderstorm</option>
                                        </select>
                                    </div>


                                    <div class="settings-row">
                                        <span class="settings-label">Weather Intensity</span>

                                        <div class="settings-control-wide">
                                            <input
                                                id="setting-weather-intensity"
                                                class="settings-range"
                                                type="range"
                                                min="0"
                                                max="1"
                                                step="0.05"
                                                value="1"
                                            >
                                            <span id="setting-weather-intensity-value">1.00</span>
                                        </div>
                                    </div>

                                </div>
                            </div>


                            <div class="settings-section-block">
                                <div class="settings-section-header">
                                    <i class="fa-solid fa-chevron-down"></i>
                                    <span>Atmosphere &amp; Sun</span>
                                </div>

                                <div class="settings-section-content">

                                    <div class="settings-row">
                                        <span class="settings-label">Sun Elevation</span>

                                        <div class="settings-control-wide">
                                            <input
                                                id="setting-sun-elevation"
                                                class="settings-range"
                                                type="range"
                                                min="-90"
                                                max="90"
                                                step="1"
                                                value="35"
                                            >
                                            <span id="setting-sun-elevation-value">35</span>
                                        </div>
                                    </div>


                                    <div class="settings-row">
                                        <span class="settings-label">Sun Distance</span>

                                        <div class="settings-control-wide">
                                            <input
                                                id="setting-sun-distance"
                                                class="settings-range"
                                                type="range"
                                                min="30"
                                                max="2000"
                                                step="10"
                                                value="500"
                                            >
                                            <span id="setting-sun-distance-value">500</span>
                                        </div>
                                    </div>


                                    <div class="settings-row">
                                        <span class="settings-label">Turbidity</span>

                                        <div class="settings-control-wide">
                                            <input
                                                id="setting-atmosphere-turbidity"
                                                class="settings-range"
                                                type="range"
                                                min="0"
                                                max="20"
                                                step="0.1"
                                                value="2.8"
                                            >
                                            <span id="setting-atmosphere-turbidity-value">2.8</span>
                                        </div>
                                    </div>


                                    <div class="settings-row">
                                        <span class="settings-label">Sky Scatter</span>

                                        <div class="settings-control-wide">
                                            <input
                                                id="setting-atmosphere-rayleigh"
                                                class="settings-range"
                                                type="range"
                                                min="0"
                                                max="4"
                                                step="0.05"
                                                value="1.05"
                                            >
                                            <span id="setting-atmosphere-rayleigh-value">1.05</span>
                                        </div>
                                    </div>


                                    <div class="settings-row">
                                        <span class="settings-label">Haze</span>

                                        <div class="settings-control-wide">
                                            <input
                                                id="setting-atmosphere-mie-coefficient"
                                                class="settings-range"
                                                type="range"
                                                min="0"
                                                max="0.1"
                                                step="0.001"
                                                value="0.005"
                                            >
                                            <span id="setting-atmosphere-mie-coefficient-value">0.005</span>
                                        </div>
                                    </div>


                                    <div class="settings-row">
                                        <span class="settings-label">Sun Corona</span>

                                        <div class="settings-control-wide">
                                            <input
                                                id="setting-atmosphere-mie-directional-g"
                                                class="settings-range"
                                                type="range"
                                                min="0.5"
                                                max="0.99"
                                                step="0.01"
                                                value="0.83"
                                            >
                                            <span id="setting-atmosphere-mie-directional-g-value">0.83</span>
                                        </div>
                                    </div>


                                    <div class="settings-row">
                                        <span class="settings-label">Sky Exposure</span>

                                        <div class="settings-control-wide">
                                            <input
                                                id="setting-sky-exposure"
                                                class="settings-range"
                                                type="range"
                                                min="0.1"
                                                max="1.5"
                                                step="0.01"
                                                value="0.45"
                                            >
                                            <span id="setting-sky-exposure-value">0.45</span>
                                        </div>
                                    </div>

                                </div>

                            </div>


                            <div class="settings-section-block">
                                <div class="settings-section-header">
                                    <i class="fa-solid fa-chevron-down"></i>
                                    <span>Shadows</span>
                                </div>

                                <div class="settings-section-content">

                                    <div class="settings-row">
                                        <span class="settings-label">Shadow Quality</span>

                                        <select id="setting-shadow-preset" class="settings-select-wide">
                                            <option value="cinematic">Cinematic</option>
                                            <option value="ultra" selected>Ultra</option>
                                            <option value="high">High</option>
                                            <option value="medium">Medium</option>
                                        </select>
                                    </div>


                                    <div class="settings-row">
                                        <span class="settings-label">Debug Frustum</span>

                                        <label class="settings-checkbox-row">
                                            <input id="setting-sky-shadow-debug" type="checkbox">
                                            <span>Show Shadow Camera Helper</span>
                                        </label>
                                    </div>


                                    <div class="settings-row">
                                        <span class="settings-label">Rebuild Shadows</span>

                                        <label class="settings-checkbox-row">
                                            <input id="setting-sky-refresh-shadows" type="checkbox">
                                            <span>Refresh shadow maps now</span>
                                        </label>
                                    </div>

                                </div>

                            </div>


                            <div class="settings-section-block">
                                <div class="settings-section-header">
                                    <i class="fa-solid fa-chevron-down"></i>
                                    <span>Lighting &amp; Clouds</span>
                                </div>

                                <div class="settings-section-content">

                                    <div class="settings-row">
                                        <span class="settings-label">Sun Max</span>

                                        <div class="settings-control-wide">
                                            <input
                                                id="setting-sky-sun-max"
                                                class="settings-range"
                                                type="range"
                                                min="0"
                                                max="10"
                                                step="0.1"
                                                value="1.8"
                                            >
                                            <span id="setting-sky-sun-max-value">1.8</span>
                                        </div>
                                    </div>


                                    <div class="settings-row">
                                        <span class="settings-label">SkyLight</span>

                                        <div class="settings-control-wide">
                                            <input
                                                id="setting-sky-hemi-day"
                                                class="settings-range"
                                                type="range"
                                                min="0"
                                                max="2"
                                                step="0.05"
                                                value="0.25"
                                            >
                                            <span id="setting-sky-hemi-day-value">0.25</span>
                                        </div>
                                    </div>


                                    <div class="settings-row">
                                        <span class="settings-label">Bounce (Ambient)</span>

                                        <div class="settings-control-wide">
                                            <input
                                                id="setting-sky-ambient"
                                                class="settings-range"
                                                type="range"
                                                min="0"
                                                max="0.5"
                                                step="0.005"
                                                value="0.05"
                                            >
                                            <span id="setting-sky-ambient-value">0.05</span>
                                        </div>
                                    </div>


                                    <div class="settings-row">
                                        <span class="settings-label">Moon Intensity</span>

                                        <div class="settings-control-wide">
                                            <input
                                                id="setting-sky-moon-max"
                                                class="settings-range"
                                                type="range"
                                                min="0"
                                                max="1"
                                                step="0.05"
                                                value="0.15"
                                            >
                                            <span id="setting-sky-moon-max-value">0.15</span>
                                        </div>
                                    </div>


                                    <div class="settings-row">
                                        <span class="settings-label">Cloud Coverage</span>

                                        <div class="settings-control-wide">
                                            <input
                                                id="setting-cloud-coverage"
                                                class="settings-range"
                                                type="range"
                                                min="0"
                                                max="1"
                                                step="0.02"
                                                value="0.08"
                                            >
                                            <span id="setting-cloud-coverage-value">0.08</span>
                                        </div>
                                    </div>


                                    <div class="settings-row">
                                        <span class="settings-label">Cloud Opacity</span>

                                        <div class="settings-control-wide">
                                            <input
                                                id="setting-cloud-opacity"
                                                class="settings-range"
                                                type="range"
                                                min="0"
                                                max="1"
                                                step="0.02"
                                                value="0.10"
                                            >
                                            <span id="setting-cloud-opacity-value">0.10</span>
                                        </div>
                                    </div>


                                    <div class="settings-row">
                                        <span class="settings-label">Cloud Wind Speed</span>

                                        <div class="settings-control-wide">
                                            <input
                                                id="setting-cloud-speed"
                                                class="settings-range"
                                                type="range"
                                                min="0"
                                                max="0.2"
                                                step="0.005"
                                                value="0.02"
                                            >
                                            <span id="setting-cloud-speed-value">0.02</span>
                                        </div>
                                    </div>


                                    <div class="settings-row">
                                        <span class="settings-label">Cloud Height</span>

                                        <div class="settings-control-wide">
                                            <input
                                                id="setting-cloud-height"
                                                class="settings-range"
                                                type="range"
                                                min="100"
                                                max="1000"
                                                step="10"
                                                value="500"
                                            >
                                            <span id="setting-cloud-height-value">500</span>
                                        </div>
                                    </div>

                                </div>

                            </div>


                            <div class="settings-section-block">
                                <div class="settings-section-header">
                                    <i class="fa-solid fa-chevron-down"></i>
                                    <span>Scene Presets</span>
                                </div>

                                <div class="settings-section-content">

                                    <div class="settings-row">
                                        <span class="settings-label">Preset</span>

                                        <select id="setting-sky-scene-preset" class="settings-select-wide">
                                            <option value="none" selected>-- Select Preset --</option>
                                            <option value="clear-noon">Clear Noon</option>
                                            <option value="golden-hour">Golden Hour</option>
                                            <option value="sunrise">Sunrise</option>
                                            <option value="overcast-rain">Overcast Rain</option>
                                            <option value="thunderstorm">Thunderstorm</option>
                                            <option value="moonlit-night">Moonlit Night</option>
                                            <option value="cinematic-dusk">Cinematic Dusk</option>
                                        </select>
                                    </div>

                                </div>

                            </div>

                        </section>


                        <!-- EDITING -->
                        <section class="settings-section" data-settings-page="editing">

                            <div class="settings-section-block">
                                <div class="settings-section-header">
                                    <i class="fa-solid fa-chevron-down"></i>
                                    <span>Transform</span>
                                </div>

                                <div class="settings-section-content">

                                    <div class="settings-row">
                                        <span class="settings-label">Gizmo Space</span>

                                        <select id="setting-transform-space" class="settings-select-wide">
                                            <option value="world" selected>World</option>
                                            <option value="local">Local</option>
                                        </select>
                                    </div>


                                    <div class="settings-row">
                                        <span class="settings-label">Gizmo Size</span>

                                        <div class="settings-control-wide">
                                            <input
                                                id="setting-gizmo-size"
                                                class="settings-range"
                                                type="range"
                                                min="0.2"
                                                max="3"
                                                step="0.1"
                                                value="1"
                                            >
                                            <span id="setting-gizmo-size-value">1.0</span>
                                        </div>
                                    </div>


                                    <div class="settings-row">
                                        <span class="settings-label"></span>

                                        <label class="settings-checkbox-row">
                                            <input id="setting-snap-enabled" type="checkbox">
                                            <span>Enable Snapping</span>
                                        </label>
                                    </div>


                                    <div class="settings-row">
                                        <span class="settings-label">Move Increment</span>

                                        <input
                                            id="setting-snap-translate"
                                            class="settings-number-input"
                                            type="number"
                                            min="0.01"
                                            step="0.05"
                                            value="0.5"
                                        >
                                    </div>


                                    <div class="settings-row">
                                        <span class="settings-label">Rotate Increment (°)</span>

                                        <input
                                            id="setting-snap-rotate"
                                            class="settings-number-input"
                                            type="number"
                                            min="1"
                                            step="1"
                                            value="15"
                                        >
                                    </div>


                                    <div class="settings-row">
                                        <span class="settings-label">Scale Increment</span>

                                        <input
                                            id="setting-snap-scale"
                                            class="settings-number-input"
                                            type="number"
                                            min="0.01"
                                            step="0.05"
                                            value="0.1"
                                        >
                                    </div>

                                </div>
                            </div>


                            <div class="settings-section-block">
                                <div class="settings-section-header">
                                    <i class="fa-solid fa-chevron-down"></i>
                                    <span>Undo / History</span>
                                </div>

                                <div class="settings-section-content">

                                    <div class="settings-row">
                                        <span class="settings-label">Undo Steps</span>

                                        <input
                                            id="setting-undo-steps"
                                            class="settings-number-input"
                                            type="number"
                                            min="10"
                                            max="500"
                                            step="10"
                                            value="100"
                                        >
                                    </div>


                                    <div class="settings-row">
                                        <span class="settings-label"></span>

                                        <label class="settings-checkbox-row">
                                            <input id="setting-double-click-focus" type="checkbox" checked>
                                            <span>Double-click to Focus Object</span>
                                        </label>
                                    </div>

                                </div>
                            </div>

                        </section>


                        <!-- ANIMATION -->
                        <section class="settings-section" data-settings-page="animation">

                            <div class="settings-section-block">
                                <div class="settings-section-header">
                                    <i class="fa-solid fa-chevron-down"></i>
                                    <span>Playback</span>
                                </div>

                                <div class="settings-section-content">

                                    <div class="settings-row">
                                        <span class="settings-label">Playback FPS</span>

                                        <select id="setting-playback-fps" class="settings-select-wide">
                                            <option value="24">24</option>
                                            <option value="30" selected>30</option>
                                            <option value="60">60</option>
                                            <option value="120">120</option>
                                        </select>
                                    </div>


                                    <div class="settings-row">
                                        <span class="settings-label">Loop Mode</span>

                                        <select id="setting-loop-mode" class="settings-select-wide">
                                            <option value="loop" selected>Loop</option>
                                            <option value="once">Play Once</option>
                                            <option value="ping-pong">Ping-Pong</option>
                                        </select>
                                    </div>


                                    <div class="settings-row">
                                        <span class="settings-label">Interpolation</span>

                                        <select id="setting-interpolation" class="settings-select-wide">
                                            <option value="linear">Linear</option>
                                            <option value="smooth" selected>Smooth (Catmull-Rom)</option>
                                            <option value="step">Step</option>
                                        </select>
                                    </div>


                                    <div class="settings-row">
                                        <span class="settings-label"></span>

                                        <label class="settings-checkbox-row">
                                            <input id="setting-onion-skinning" type="checkbox">
                                            <span>Onion Skinning</span>
                                        </label>
                                    </div>


                                    <div class="settings-row">
                                        <span class="settings-label"></span>

                                        <label class="settings-checkbox-row">
                                            <input id="setting-root-motion" type="checkbox" checked>
                                            <span>Apply Root Motion</span>
                                        </label>
                                    </div>

                                </div>
                            </div>


                            <div class="settings-section-block">
                                <div class="settings-section-header">
                                    <i class="fa-solid fa-chevron-down"></i>
                                    <span>Motion Matching</span>
                                </div>

                                <div class="settings-section-content">

                                    <div class="settings-row">
                                        <span class="settings-label">Trajectory Points</span>

                                        <input
                                            id="setting-mm-trajectory-points"
                                            class="settings-number-input"
                                            type="number"
                                            min="2"
                                            max="12"
                                            step="1"
                                            value="4"
                                        >
                                    </div>


                                    <div class="settings-row">
                                        <span class="settings-label">Search Interval (ms)</span>

                                        <input
                                            id="setting-mm-search-interval"
                                            class="settings-number-input"
                                            type="number"
                                            min="0"
                                            max="500"
                                            step="10"
                                            value="100"
                                        >
                                    </div>


                                    <div class="settings-row">
                                        <span class="settings-label"></span>

                                        <label class="settings-checkbox-row">
                                            <input id="setting-mm-inertialization" type="checkbox" checked>
                                            <span>Inertialization Blending</span>
                                        </label>
                                    </div>


                                    <div class="settings-row">
                                        <span class="settings-label"></span>

                                        <label class="settings-checkbox-row">
                                            <input id="setting-mm-debug-overlay" type="checkbox">
                                            <span>Debug Trajectory Overlay</span>
                                        </label>
                                    </div>

                                </div>
                            </div>

                        </section>


                        <!-- ADDONS -->
                        <section class="settings-section" data-settings-page="addons">
                            <div class="settings-placeholder">
                                <i class="fa-solid fa-puzzle-piece"></i>
                                <h3>Add-ons</h3>
                                <p>Extensions and editor modules.</p>
                            </div>
                        </section>


                        <!-- THEMES -->
                        <section class="settings-section" data-settings-page="themes">

                            <div class="settings-section-block">
                                <div class="settings-section-header">
                                    <i class="fa-solid fa-chevron-down"></i>
                                    <span>Theme</span>
                                </div>

                                <div class="settings-section-content">

                                    <div class="settings-row">
                                        <span class="settings-label">Editor Theme</span>

                                        <select id="setting-theme" class="settings-select-wide">
                                            <option value="dark">Dark</option>
                                            <option value="light">Light</option>
                                            <option value="system">System</option>
                                        </select>
                                    </div>


                                    <div class="settings-row">
                                        <span class="settings-label">Accent Color</span>

                                        <input id="setting-accent-color" type="color" value="#4e78b6">
                                    </div>

                                </div>
                            </div>

                        </section>


                        <!-- INPUT -->
                        <section class="settings-section" data-settings-page="input">

                            <div class="settings-section-block">
                                <div class="settings-section-header">
                                    <i class="fa-solid fa-chevron-down"></i>
                                    <span>Input</span>
                                </div>

                                <div class="settings-section-content">

                                    <div class="settings-row">
                                        <span class="settings-label">Mouse Sensitivity</span>

                                        <input
                                            id="setting-mouse-sensitivity"
                                            class="settings-range settings-range-small"
                                            type="range"
                                            min="0.1"
                                            max="4"
                                            step="0.1"
                                            value="1"
                                        >
                                    </div>


                                    <div class="settings-row">
                                        <span class="settings-label">Invert Y</span>

                                        <label class="settings-checkbox-row">
                                            <input id="setting-invert-y" type="checkbox">
                                            <span>Invert Vertical Look</span>
                                        </label>
                                    </div>


                                    <div class="settings-row">
                                        <span class="settings-label">Invert X</span>

                                        <label class="settings-checkbox-row">
                                            <input id="setting-invert-x" type="checkbox">
                                            <span>Invert Horizontal Look</span>
                                        </label>
                                    </div>


                                    <div class="settings-row">
                                        <span class="settings-label">Pan Speed</span>

                                        <input
                                            id="setting-pan-speed"
                                            class="settings-range settings-range-small"
                                            type="range"
                                            min="0.1"
                                            max="4"
                                            step="0.1"
                                            value="1"
                                        >
                                    </div>


                                    <div class="settings-row">
                                        <span class="settings-label">Zoom Speed</span>

                                        <input
                                            id="setting-zoom-speed"
                                            class="settings-range settings-range-small"
                                            type="range"
                                            min="0.1"
                                            max="4"
                                            step="0.1"
                                            value="1"
                                        >
                                    </div>


                                    <div class="settings-row">
                                        <span class="settings-label">Scroll Zoom</span>

                                        <label class="settings-checkbox-row">
                                            <input id="setting-scroll-zoom" type="checkbox" checked>
                                            <span>Enable Mouse Wheel Zoom</span>
                                        </label>
                                    </div>

                                </div>
                            </div>

                        </section>


                        <!-- NAVIGATION -->
                        <section class="settings-section" data-settings-page="navigation">

                            <div class="settings-section-block">
                                <div class="settings-section-header">
                                    <i class="fa-solid fa-chevron-down"></i>
                                    <span>Camera Movement</span>
                                </div>

                                <div class="settings-section-content">

                                    <div class="settings-row">
                                        <span class="settings-label">Navigation Mode</span>

                                        <select id="setting-nav-mode" class="settings-select-wide">
                                            <option value="orbit" selected>Orbit</option>
                                            <option value="fly">Fly</option>
                                            <option value="walk">Walk</option>
                                        </select>
                                    </div>


                                    <div class="settings-row">
                                        <span class="settings-label">Fly Speed</span>

                                        <input
                                            id="setting-fly-speed"
                                            class="settings-range settings-range-small"
                                            type="range"
                                            min="0.5"
                                            max="20"
                                            step="0.5"
                                            value="5"
                                        >
                                    </div>


                                    <div class="settings-row">
                                        <span class="settings-label">Walk Speed</span>

                                        <input
                                            id="setting-walk-speed"
                                            class="settings-range settings-range-small"
                                            type="range"
                                            min="0.5"
                                            max="20"
                                            step="0.5"
                                            value="3"
                                        >
                                    </div>


                                    <div class="settings-row">
                                        <span class="settings-label"></span>

                                        <label class="settings-checkbox-row">
                                            <input id="setting-camera-collision" type="checkbox">
                                            <span>Camera Collision</span>
                                        </label>
                                    </div>


                                    <div class="settings-row">
                                        <span class="settings-label"></span>

                                        <label class="settings-checkbox-row">
                                            <input id="setting-orbit-auto-rotate" type="checkbox">
                                            <span>Auto-Orbit When Idle</span>
                                        </label>
                                    </div>

                                </div>
                            </div>

                        </section>


                        <!-- KEYMAP -->
                        <section class="settings-section" data-settings-page="keymap">
                            <div class="settings-keymap-page">
                                <div class="settings-keymap-page-header">
                                    <div>
                                        <h2>Keyboard Shortcuts</h2>
                                        <p>Browse, search, and customize editor shortcuts.</p>
                                    </div>
                                    <span class="settings-keymap-hint"><kbd>?</kbd> Open anywhere</span>
                                </div>
                                <div id="settings-keymap-shortcuts" class="settings-keymap-shortcuts"></div>
                            </div>
                        </section>


                        <!-- SYSTEM -->
                        <section class="settings-section" data-settings-page="system">

                            <div class="settings-section-block">
                                <div class="settings-section-header">
                                    <i class="fa-solid fa-chevron-down"></i>
                                    <span>System</span>
                                </div>

                                <div class="settings-section-content">

                                    <div class="settings-row">
                                        <span class="settings-label">Dynamic Resolution</span>

                                        <label class="settings-checkbox-row">
                                            <input id="setting-dynamic-resolution" type="checkbox" checked>
                                            <span>Enable</span>
                                        </label>
                                    </div>


                                    <div class="settings-row">
                                        <span class="settings-label">Min Res Scale</span>

                                        <div class="settings-control-wide">
                                            <input
                                                id="setting-dynamic-res-min-scale"
                                                class="settings-range"
                                                type="range"
                                                min="0.4"
                                                max="1"
                                                step="0.05"
                                                value="0.7"
                                            >
                                            <span id="setting-dynamic-res-min-scale-value">0.70</span>
                                        </div>
                                    </div>


                                    <div class="settings-row">
                                        <span class="settings-label">Max Res Scale</span>

                                        <div class="settings-control-wide">
                                            <input
                                                id="setting-dynamic-res-max-scale"
                                                class="settings-range"
                                                type="range"
                                                min="0.5"
                                                max="2"
                                                step="0.05"
                                                value="1"
                                            >
                                            <span id="setting-dynamic-res-max-scale-value">1.00</span>
                                        </div>
                                    </div>


                                    <div class="settings-row">
                                        <span class="settings-label">FPS Limit</span>

                                        <select id="setting-fps-limit" class="settings-select-wide">
                                            <option value="30">30 FPS</option>
                                            <option value="60" selected>60 FPS</option>
                                            <option value="120">120 FPS</option>
                                            <option value="0">Unlimited</option>
                                        </select>
                                    </div>


                                    <div class="settings-row">
                                        <span class="settings-label">Performance HUD</span>

                                        <label class="settings-checkbox-row">
                                            <input id="setting-performance-hud" type="checkbox">
                                            <span>Show Renderer Statistics</span>
                                        </label>
                                    </div>


                                    <div class="settings-row">
                                        <span class="settings-label"></span>

                                        <label class="settings-checkbox-row">
                                            <input id="setting-vsync" type="checkbox" checked>
                                            <span>V-Sync</span>
                                        </label>
                                    </div>

                                </div>
                            </div>


                            <div class="settings-section-block">
                                <div class="settings-section-header">
                                    <i class="fa-solid fa-chevron-down"></i>
                                    <span>Quality</span>
                                </div>

                                <div class="settings-section-content">

                                    <div class="settings-row">
                                        <span class="settings-label">Texture Quality</span>

                                        <select id="setting-texture-quality" class="settings-select-wide">
                                            <option value="low">Low</option>
                                            <option value="medium">Medium</option>
                                            <option value="high" selected>High</option>
                                            <option value="ultra">Ultra</option>
                                        </select>
                                    </div>


                                    <div class="settings-row">
                                        <span class="settings-label">Anisotropic Filtering</span>

                                        <select id="setting-anisotropic-filtering" class="settings-select-wide">
                                            <option value="1">Off</option>
                                            <option value="2">2×</option>
                                            <option value="4">4×</option>
                                            <option value="8" selected>8×</option>
                                            <option value="16">16×</option>
                                        </select>
                                    </div>


                                    <div class="settings-row">
                                        <span class="settings-label">LOD Bias</span>

                                        <div class="settings-control-wide">
                                            <input
                                                id="setting-lod-bias"
                                                class="settings-range"
                                                type="range"
                                                min="-2"
                                                max="2"
                                                step="0.1"
                                                value="0"
                                            >
                                            <span id="setting-lod-bias-value">0.0</span>
                                        </div>
                                    </div>

                                </div>
                            </div>


                            <div class="settings-section-block">
                                <div class="settings-section-header">
                                    <i class="fa-solid fa-chevron-down"></i>
                                    <span>Threading</span>
                                </div>

                                <div class="settings-section-content">

                                    <div class="settings-row">
                                        <span class="settings-label">Worker Threads</span>

                                        <input
                                            id="setting-worker-threads"
                                            class="settings-number-input"
                                            type="number"
                                            min="0"
                                            max="16"
                                            step="1"
                                            value="4"
                                        >
                                    </div>


                                    <div class="settings-row">
                                        <span class="settings-label"></span>

                                        <label class="settings-checkbox-row">
                                            <input id="setting-async-asset-loading" type="checkbox" checked>
                                            <span>Async Asset Loading</span>
                                        </label>
                                    </div>

                                </div>
                            </div>

                        </section>


                        <!-- SAVE LOAD -->
                        <section class="settings-section" data-settings-page="save-load">

                            <div class="settings-section-block">
                                <div class="settings-section-header">
                                    <i class="fa-solid fa-chevron-down"></i>
                                    <span>Save &amp; Load</span>
                                </div>

                                <div class="settings-section-content">

                                    <div class="settings-row">
                                        <span class="settings-label">Auto Save</span>

                                        <label class="settings-checkbox-row">
                                            <input id="setting-auto-save" type="checkbox" checked>
                                            <span>Enable Auto Save</span>
                                        </label>
                                    </div>


                                    <div class="settings-row">
                                        <span class="settings-label">Interval</span>

                                        <input
                                            id="setting-auto-save-interval"
                                            class="settings-number-input"
                                            type="number"
                                            min="1"
                                            max="60"
                                            value="5"
                                        >
                                    </div>

                                </div>
                            </div>

                        </section>


                        <!-- FILE PATHS -->
                        <section class="settings-section" data-settings-page="file-paths">
                            <div class="settings-placeholder">
                                <i class="fa-solid fa-folder-tree"></i>
                                <h3>File Paths</h3>
                                <p>Project and resource path configuration.</p>
                            </div>
                        </section>

                    </main>

                </div>
            `;

      document.body.appendChild(this.panel);

      this._mountKeyboardShortcuts();
      this._bindNavigation();
      this._bindTitlebar();
      this._bindSectionCollapse();
      this._bindSettings();
      this._loadPosition();

      this._syncGameDevVisibility();
      if (!this._gameDevSyncTimer) {
        this._gameDevSyncTimer = setInterval(
          () => this._syncGameDevVisibility(),
          500,
        );
      }
    }

    /**
     * The Sky & Atmosphere page mirrors the SkyLightingSystem and is
     * available in every workspace mode. The active workspace controls
     * which sky visuals are rendered; the settings remain editable and
     * are applied as soon as that rig is visible.
     */
    _syncGameDevVisibility() {
      if (!this.panel) return;
      this.panel.querySelector(".settings-nav-sky")?.classList.remove("hidden");
      this.panel
        .querySelector('[data-settings-page="sky"]')
        ?.classList.remove("hidden");
    }

    // ----------------------------------------------------------
    // DOCUMENT TAB MODE
    // ----------------------------------------------------------

    _ensureDocumentModeStyles() {
      if (document.getElementById("sm-settings-document-mode-styles")) {
        return;
      }

      const style = document.createElement("style");
      style.id = "sm-settings-document-mode-styles";

      style.textContent = `
                /*
                 * Preferences is a full editor document below #subToolBar.
                 * It intentionally covers the viewport/hierarchy/inspector
                 * workspace while the Preferences document is active.
                 */
                #sm-settings-document-surface {
                    position: fixed !important;

                    min-width: 0 !important;
                    min-height: 0 !important;

                    display: none;

                    background: var(--settings-bg, #303030);

                    overflow: hidden;

                    /*
                     * Above renderer/editor content, but below detached menus.
                     * It occupies ONLY the editor-scene rectangle.
                     */
                    z-index: 90;
                }

                #sm-settings-document-surface.open {
                    display: block !important;
                }

                #sm-settings-document-surface > .settings-window.settings-document-mode {
                    position: absolute !important;

                    inset: 0 !important;
                    left: 0 !important;
                    top: 0 !important;
                    right: 0 !important;
                    bottom: 0 !important;

                    width: 100% !important;
                    height: 100% !important;

                    min-width: 0 !important;
                    min-height: 0 !important;
                    max-width: none !important;
                    max-height: none !important;

                    display: flex !important;
                    flex-direction: column !important;

                    transform: none !important;
                    opacity: 1 !important;

                    background: var(--settings-bg, #303030);

                    border: 0 !important;
                    border-radius: 0 !important;

                    box-shadow: none !important;

                    overflow: hidden !important;

                    z-index: 1 !important;

                    transition: none !important;
                }

                #sm-settings-document-surface
                > .settings-window.settings-document-mode.settings-window-enter {
                    transform: none !important;
                    opacity: 1 !important;
                }

                /*
                 * The sub-toolbar tab is the window chrome now.
                 */
                #sm-settings-document-surface
                > .settings-window.settings-document-mode
                > .settings-window-titlebar {
                    display: none !important;
                }

                /*
                 * CRITICAL:
                 * flex: 1 1 0 + height: 0 prevents the body from collapsing
                 * to the intrinsic height of the first settings row.
                 */
                #sm-settings-document-surface
                > .settings-window.settings-document-mode
                > .settings-window-body {
                    width: 100% !important;
                    height: 0 !important;

                    min-width: 0 !important;
                    min-height: 0 !important;

                    flex: 1 1 0% !important;

                    display: flex !important;
                    flex-direction: row !important;
                    align-items: stretch !important;

                    overflow: hidden !important;
                }

                #sm-settings-document-surface
                .settings-window.settings-document-mode
                .settings-sidebar {
                    width: 174px !important;
                    height: auto !important;

                    min-height: 0 !important;

                    flex: 0 0 174px !important;
                    align-self: stretch !important;

                    overflow-x: hidden !important;
                    overflow-y: auto !important;
                }

                #sm-settings-document-surface
                .settings-window.settings-document-mode
                .settings-main {
                    width: auto !important;
                    height: auto !important;

                    min-width: 0 !important;
                    min-height: 0 !important;

                    flex: 1 1 0% !important;
                    align-self: stretch !important;

                    overflow-x: hidden !important;
                    overflow-y: auto !important;
                }

                #sm-settings-document-surface
                .settings-window.settings-document-mode
                .settings-section.active {
                    min-height: 100% !important;
                }

                #sm-settings-document-surface
                .settings-window.settings-document-mode.minimized {
                    height: 100% !important;
                }

                #sm-settings-document-surface
                .settings-window.settings-document-mode.minimized
                .settings-window-body {
                    display: flex !important;
                }

                body.settings-document-open {
                    --sm-settings-document-open: 1;
                }

                @media (max-width: 720px) {
                    #sm-settings-document-surface
                    .settings-window.settings-document-mode
                    .settings-sidebar {
                        width: 48px !important;
                        flex-basis: 48px !important;
                    }
                }
            `;

      document.head.appendChild(style);
    }

    _updateDocumentSurfaceBounds() {
      const surface = this._documentSurface;

      if (!surface) {
        return;
      }

      /*
       * SOURCE OF TRUTH:
       * Preferences must occupy exactly the same screen rectangle as
       * the real editor scene / viewport.
       *
       * We DO NOT append the SettingsPanel into #editor-scene because
       * viewport internals can impose their own sizing/stacking rules.
       * Instead we keep a body-level overlay and copy the viewport rect.
       */
      const editorScene =
        document.getElementById("editor-scene") ||
        document.querySelector(".editor-scene") ||
        document.getElementById("renderer-container") ||
        document.querySelector(".renderer-container");

      if (editorScene) {
        const rect = editorScene.getBoundingClientRect();

        if (rect.width > 10 && rect.height > 10) {
          surface.style.left = `${Math.round(rect.left)}px`;

          surface.style.top = `${Math.round(rect.top)}px`;

          surface.style.width = `${Math.round(rect.width)}px`;

          surface.style.height = `${Math.round(rect.height)}px`;

          surface.style.right = "auto";

          surface.style.bottom = "auto";

          surface.dataset.boundsSource = editorScene.id || "editor-scene";

          return;
        }
      }

      /*
       * FALLBACK:
       * Mirror the same horizontal constraints used by #subToolBar:
       *
       * left:
       * hierarchy + spreadsheet + history
       *
       * right:
       * inspector
       *
       * and stop above Timeline.
       *
       * Your current CSS defines #subToolBar using exactly those live
       * variables, so Preferences stays aligned with it even while
       * panels resize.
       */
      const rootStyle = getComputedStyle(document.documentElement);

      const readPx = (name, fallback = 0) => {
        const parsed = parseFloat(rootStyle.getPropertyValue(name));

        return Number.isFinite(parsed) ? parsed : fallback;
      };

      const hierarchy = readPx(
        "--hierarchy-live-width",
        readPx("--hierarchy-width-default", 0),
      );

      const spreadsheet = readPx("--spreadsheet-width", 0);

      const history = readPx("--history-width", 0);

      const inspector = readPx("--inspector-live-width", 0);

      const toolbar = readPx("--toolbar-height", 36);

      const subToolbarHeight = readPx("--sub-toolbar-height", 38);

      const timeline = readPx(
        "--timeline-live-height",
        readPx("--timeline-height", 0),
      );

      const left = Math.max(0, hierarchy + spreadsheet + history);

      const top = Math.max(0, toolbar + subToolbarHeight);

      const right = Math.max(0, inspector);

      const bottom = Math.max(0, timeline);

      surface.style.left = `${left}px`;

      surface.style.top = `${top}px`;

      surface.style.right = `${right}px`;

      surface.style.bottom = `${bottom}px`;

      surface.style.width = "auto";

      surface.style.height = "auto";

      surface.dataset.boundsSource = "layout-css-variables";
    }

    _ensureDocumentSurface() {
      this._ensureDocumentModeStyles();

      let surface = document.getElementById("sm-settings-document-surface");

      if (!surface) {
        surface = document.createElement("div");

        surface.id = "sm-settings-document-surface";

        surface.setAttribute("role", "tabpanel");

        surface.setAttribute("aria-label", "Preferences");

        document.body.appendChild(surface);
      }

      this._documentSurface = surface;

      this._documentHost = surface;

      if (!this._documentResizeBound) {
        this._documentResizeBound = true;

        window.addEventListener("resize", () =>
          this._updateDocumentSurfaceBounds(),
        );

        window.addEventListener("sm:sync-layout", () =>
          this._updateDocumentSurfaceBounds(),
        );
      }

      if (
        !this._documentResizeObserver &&
        typeof ResizeObserver !== "undefined"
      ) {
        const subToolbar = document.getElementById("subToolBar");

        if (subToolbar) {
          this._documentResizeObserver = new ResizeObserver(() =>
            this._updateDocumentSurfaceBounds(),
          );

          this._documentResizeObserver.observe(subToolbar);

          const editorScene =
            document.getElementById("editor-scene") ||
            document.querySelector(".editor-scene") ||
            document.getElementById("renderer-container");

          if (editorScene) {
            this._documentResizeObserver.observe(editorScene);
          }

          const hierarchyPanel = document.getElementById("hierarchy-panel");

          if (hierarchyPanel) {
            this._documentResizeObserver.observe(hierarchyPanel);
          }

          const inspectorPanel = document.getElementById("inspector-panel");

          if (inspectorPanel) {
            this._documentResizeObserver.observe(inspectorPanel);
          }

          const timelineBody =
            document.getElementById("timelineBody") ||
            document.getElementById("timeline-panel");

          if (timelineBody) {
            this._documentResizeObserver.observe(timelineBody);
          }
        }
      }

      this._updateDocumentSurfaceBounds();

      return surface;
    }

    _restorePanelToOriginalParent() {
      if (!this.panel || !this._originalParent) {
        return;
      }

      if (this.panel.parentNode === this._originalParent) {
        return;
      }

      if (
        this._originalNextSibling &&
        this._originalNextSibling.parentNode === this._originalParent
      ) {
        this._originalParent.insertBefore(
          this.panel,
          this._originalNextSibling,
        );
      } else {
        this._originalParent.appendChild(this.panel);
      }
    }

    _mountIntoDocumentHost() {
      this.init();

      const surface = this._ensureDocumentSurface();

      if (!surface) {
        return false;
      }

      if (!this._originalParent) {
        this._originalParent = this.panel.parentNode || document.body;

        this._originalNextSibling = this.panel.nextSibling || null;
      }

      if (this.panel.parentNode !== surface) {
        surface.appendChild(this.panel);
      }

      return true;
    }

    _applyDocumentLayout() {
      if (!this.panel) {
        return;
      }

      const body = this.panel.querySelector(".settings-window-body");

      const sidebar = this.panel.querySelector(".settings-sidebar");

      const main = this.panel.querySelector(".settings-main");

      /*
       * Inline values make the document resilient against older global
       * panel CSS loaded after the Preferences document styles.
       */
      Object.assign(this.panel.style, {
        position: "absolute",

        inset: "0px",

        left: "0px",

        top: "0px",

        right: "0px",

        bottom: "0px",

        width: "100%",

        height: "100%",

        maxWidth: "none",

        maxHeight: "none",

        display: "flex",

        flexDirection: "column",

        transform: "none",

        opacity: "1",

        overflow: "hidden",
      });

      if (body) {
        Object.assign(body.style, {
          width: "100%",

          /*
           * This is deliberate: flex-grow supplies the actual
           * remaining height and avoids intrinsic-height collapse.
           */
          height: "0px",

          minWidth: "0px",

          minHeight: "0px",

          flex: "1 1 0%",

          display: "flex",

          flexDirection: "row",

          alignItems: "stretch",

          overflow: "hidden",
        });
      }

      if (sidebar) {
        Object.assign(sidebar.style, {
          height: "auto",

          minHeight: "0px",

          flex: "0 0 174px",

          alignSelf: "stretch",

          overflowX: "hidden",

          overflowY: "auto",
        });
      }

      if (main) {
        Object.assign(main.style, {
          width: "auto",

          height: "auto",

          minWidth: "0px",

          minHeight: "0px",

          flex: "1 1 0%",

          alignSelf: "stretch",

          overflowX: "hidden",

          overflowY: "auto",
        });
      }
    }

    openDocument() {
      if (!this._mountIntoDocumentHost()) {
        this.open();
        return false;
      }

      this._displayMode = "document";

      this._dragState = null;

      document.body.classList.remove("settings-window-dragging");

      document.body.classList.add("settings-document-open");

      this._documentSurface?.classList.add("open");

      this.panel.classList.remove("minimized");

      this.panel.classList.add(
        "visible",
        "settings-window-enter",
        "settings-document-mode",
      );

      this.panel.style.display = "flex";

      this._updateDocumentSurfaceBounds();
      this._applyDocumentLayout();
      this._syncGameDevVisibility();

      /*
       * A second layout pass after style/layout calculation catches
       * workspace managers that mutate editor sizes in the same frame.
       */
      requestAnimationFrame(() => {
        this._updateDocumentSurfaceBounds();
        this._applyDocumentLayout();

        window.dispatchEvent(new Event("resize"));
      });

      window.dispatchEvent(
        new CustomEvent("sm:settings-document-opened", {
          detail: {
            panel: this.panel,

            host: this._documentSurface,
          },
        }),
      );

      window.dispatchEvent(new Event("sm:sync-layout"));

      return true;
    }

    hideDocument() {
      if (!this.panel || this._displayMode !== "document") {
        return;
      }

      this._documentSurface?.classList.remove("open");

      document.body.classList.remove("settings-document-open");

      window.dispatchEvent(
        new CustomEvent("sm:settings-document-hidden", {
          detail: {
            panel: this.panel,
          },
        }),
      );

      window.dispatchEvent(new Event("resize"));
    }

    closeDocument() {
      if (!this.panel) {
        return;
      }

      const wasDocument =
        this._displayMode === "document" ||
        this.panel.classList.contains("settings-document-mode");

      if (!wasDocument) {
        this.close();
        return;
      }

      this.hideDocument();

      this.panel.classList.remove(
        "settings-document-mode",
        "settings-window-enter",
        "visible",
        "minimized",
      );

      /*
       * Remove document-only inline geometry before returning the panel
       * to its legacy DOM location.
       */
      [
        "position",
        "inset",
        "left",
        "top",
        "right",
        "bottom",
        "width",
        "height",
        "max-width",
        "max-height",
        "display",
        "flex-direction",
        "transform",
        "opacity",
        "overflow",
      ].forEach((property) => this.panel.style.removeProperty(property));

      const body = this.panel.querySelector(".settings-window-body");

      const sidebar = this.panel.querySelector(".settings-sidebar");

      const main = this.panel.querySelector(".settings-main");

      body?.removeAttribute("style");

      sidebar?.removeAttribute("style");

      main?.removeAttribute("style");

      this._restorePanelToOriginalParent();

      this._documentSurface?.remove();

      this._documentSurface = null;

      this._documentHost = null;

      this._displayMode = "closed";

      window.dispatchEvent(new CustomEvent("sm:settings-document-closed"));
    }

    isDocumentMode() {
      return (
        this._displayMode === "document" &&
        this.panel?.classList.contains("settings-document-mode")
      );
    }

    debugDocumentLayout() {
      const panel = this.panel;

      const body = panel?.querySelector(".settings-window-body");

      const sidebar = panel?.querySelector(".settings-sidebar");

      const main = panel?.querySelector(".settings-main");

      const row = (element) => {
        if (!element) {
          return null;
        }

        const rect = element.getBoundingClientRect();

        const style = getComputedStyle(element);

        return {
          width: Math.round(rect.width),

          height: Math.round(rect.height),

          display: style.display,

          position: style.position,

          flex: style.flex,

          overflow: `${style.overflowX}/${style.overflowY}`,
        };
      };

      const result = {
        Surface: row(this._documentSurface),

        Panel: row(panel),

        Body: row(body),

        Sidebar: row(sidebar),

        Main: row(main),
      };

      console.table(result);

      return result;
    }

    open() {
      this.init();

      /*
       * Keep legacy modal open() available for explicit callers.
       * Normal Preferences navigation is routed through SMDocumentTabs.
       */
      if (this._displayMode === "document") {
        this.closeDocument();
      }

      this._displayMode = "modal";

      this.panel.classList.remove("settings-document-mode");
      this.panel.classList.add("visible");
      this.panel.style.display = "flex";

      requestAnimationFrame(() => {
        this.panel.classList.add("settings-window-enter");
      });
    }

    close() {
      if (!this.panel) return;

      if (this.isDocumentMode()) {
        this.closeDocument();
        return;
      }

      this._displayMode = "closed";

      this.panel.classList.remove("settings-window-enter");

      setTimeout(() => {
        if (this.panel) {
          this.panel.style.display = "none";
          this.panel.classList.remove("visible");
        }
      }, 120);
    }

    toggle() {
      if (!this.panel || this.panel.style.display === "none") {
        this.open();
      } else {
        this.close();
      }
    }

    _bindNavigation() {
      const buttons = this.panel.querySelectorAll(".settings-nav-btn");

      buttons.forEach((button) => {
        button.addEventListener("click", () => {
          this._activateSection(button.dataset.settingsSection);
        });
      });
    }

    _activateSection(section) {
      if (!section || !this.panel) return;

      this.activeSection = section;

      this.panel
        .querySelectorAll(".settings-nav-btn")
        .forEach((button) =>
          button.classList.toggle(
            "active",
            button.dataset.settingsSection === section,
          ),
        );

      this.panel
        .querySelectorAll(".settings-section")
        .forEach((page) =>
          page.classList.toggle(
            "active",
            page.dataset.settingsPage === section,
          ),
        );
    }

    _mountKeyboardShortcuts() {
      const host = this.panel?.querySelector("#settings-keymap-shortcuts");
      if (!host || typeof window.mountKeyboardShortcuts !== "function") return;

      window.mountKeyboardShortcuts(host);
    }

    _bindSectionCollapse() {
      this.panel
        .querySelectorAll(".settings-section-header")
        .forEach((header) => {
          header.addEventListener("click", () => {
            const block = header.closest(".settings-section-block");

            if (!block) return;

            block.classList.toggle("collapsed");

            const icon = header.querySelector("i");

            if (icon) {
              icon.classList.toggle(
                "fa-chevron-right",
                block.classList.contains("collapsed"),
              );

              icon.classList.toggle(
                "fa-chevron-down",
                !block.classList.contains("collapsed"),
              );
            }
          });
        });
    }

    _bindTitlebar() {
      const closeBtn = this.panel.querySelector("#settings-close-btn");
      const minimizeBtn = this.panel.querySelector("#settings-minimize-btn");
      const shortcutsBtn = this.panel.querySelector("#settings-shortcuts-btn");
      const titlebar = this.panel.querySelector("#settings-window-titlebar");

      closeBtn?.addEventListener("click", () => this.close());

      shortcutsBtn?.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();

        if (typeof window.openKeyboardShortcuts === "function") {
          window.openKeyboardShortcuts();
        } else {
          document.getElementById("toggle-shortcuts")?.click();
        }
      });

      minimizeBtn?.addEventListener("click", () => {
        if (this.isDocumentMode()) return;
        this.panel.classList.toggle("minimized");
      });

      titlebar?.addEventListener("mousedown", (event) => {
        if (this.isDocumentMode()) return;
        if (event.target.closest("button")) return;

        const rect = this.panel.getBoundingClientRect();

        this._dragState = {
          offsetX: event.clientX - rect.left,
          offsetY: event.clientY - rect.top,
        };

        document.body.classList.add("settings-window-dragging");
      });

      window.addEventListener("mousemove", (event) => {
        if (this.isDocumentMode()) return;
        if (!this._dragState) return;

        const x = event.clientX - this._dragState.offsetX;
        const y = event.clientY - this._dragState.offsetY;

        const maxX = window.innerWidth - this.panel.offsetWidth;
        const maxY = window.innerHeight - 40;

        const clampedX = Math.max(0, Math.min(x, maxX));
        const clampedY = Math.max(0, Math.min(y, maxY));

        this.panel.style.left = `${clampedX}px`;
        this.panel.style.top = `${clampedY}px`;
        this.panel.style.transform = "none";
      });

      window.addEventListener("mouseup", () => {
        if (!this._dragState) return;

        this._dragState = null;

        document.body.classList.remove("settings-window-dragging");

        this._savePosition();
      });
    }

    // ----------------------------------------------------------
    // Bind every control to window.EngineSettings. The engine
    // module owns defaults, persistence, and applying values to
    // the actual scene/renderer -- this file only bridges the DOM.
    // ----------------------------------------------------------
  _bindSettings() {
      const engine = window.EngineSettings;
      if (!engine) return;

      const pushValue = (control) => {
        if (control.id === "setting-advanced-shader-sky") return;

        const value =
          control.type === "checkbox" ? control.checked : control.value;
        engine.set(control.id, value);

        // Some settings are self-resetting (buttons / one-shot
        // actions: rebuild shadows, scene presets). Read the
        // engine value back so the control snaps to its stored
        // state after the action fires.
        const stored = engine.get(control.id);
        if (
          stored !== undefined &&
          ((control.type === "checkbox" &&
            Boolean(stored) !== control.checked) ||
            (control.type !== "checkbox" && String(stored) !== control.value))
        ) {
          if (control.type === "checkbox") {
            control.checked = Boolean(stored);
          } else {
            control.value = stored;
            syncRangeReadout(control);
          }
        }
      };

      // Live value readouts for range inputs that have a matching
      // #<id>-value element (resolution scale, fov, intensities,
      // exposure, gizmo size, lod bias, ...).
      const syncRangeReadout = (range) => {
        const valueEl = this.panel.querySelector(`#${range.id}-value`);
        if (!valueEl) return;
        const decimals =
          range.step && range.step.includes(".")
            ? range.step.split(".")[1].length
            : 0;
        valueEl.textContent = Number(range.value).toFixed(decimals);
      };

      // 🌟 التحكم المستقل فـ Advanced Shader Sky (كوشاج + حفظ الحالة)
      const shaderSkyToggle = this.panel.querySelector(
        "#setting-advanced-shader-sky",
      );
      if (shaderSkyToggle) {
        const isSavedActive =
          localStorage.getItem("sm_setting_advanced_shader_sky") === "true";
        shaderSkyToggle.checked = isSavedActive;

        shaderSkyToggle.addEventListener("change", (e) => {
          e.stopPropagation();
          const active = e.target.checked;
          localStorage.setItem(
            "sm_setting_advanced_shader_sky",
            active ? "true" : "false",
          );
          window.SMAdvancedShaderSky?.setEnabled(active);
        });
      }

      // Update the DOM to match the engine's current values.
      Object.entries(engine.getAll()).forEach(([id, value]) => {
        if (id === "setting-advanced-shader-sky") return;
        const control = this.panel.querySelector(`#${id}`);
        if (!control) return;
        if (control.type === "checkbox") {
          control.checked = Boolean(value);
        } else {
          control.value = value;
          syncRangeReadout(control);
        }
      });

      if (!this._settingsUnsubscribe && typeof engine.onChange === "function") {
        this._settingsUnsubscribe = engine.onChange((id, value) => {
          if (id === "setting-advanced-shader-sky") return;
          const control = this.panel?.querySelector(`#${id}`);
          if (!control) return;
          if (control.type === "checkbox") {
            control.checked = Boolean(value);
          } else {
            control.value = value;
            syncRangeReadout(control);
          }
        });
      }

      // Wire events: ranges update their readout + the engine.
      this.panel.querySelectorAll('input[type="range"]').forEach((range) => {
        range.addEventListener("input", () => {
          syncRangeReadout(range);
          pushValue(range);
        });
      });

      // Everything else (selects, checkboxes, number/color inputs)
      // applies on change.
      this.panel
        .querySelectorAll('input:not([type="range"]), select')
        .forEach((control) => {
          control.addEventListener("change", () => pushValue(control));
        });
    }

    _savePosition() {
      try {
        const rect = this.panel.getBoundingClientRect();

        localStorage.setItem(
          "sm-engine-preferences-position",
          JSON.stringify({ left: rect.left, top: rect.top }),
        );
      } catch (error) {
        console.warn("Could not save settings position:", error);
      }
    }

    _loadPosition() {
      try {
        const saved = JSON.parse(
          localStorage.getItem("sm-engine-preferences-position") || "null",
        );

        if (!saved) return;

        this.panel.style.left = `${saved.left}px`;
        this.panel.style.top = `${saved.top}px`;
        this.panel.style.transform = "none";
      } catch (error) {
        console.warn("Could not restore settings position:", error);
      }
    }
  }

  window.settingsPanel = new SettingsPanel();

  /*
   * Public document-surface API used by the sub-toolbar tab system.
   */
  window.openSettingsDocument = () => {
    return window.settingsPanel.openDocument();
  };

  window.hideSettingsDocument = () => {
    return window.settingsPanel.hideDocument();
  };

  window.closeSettingsDocument = () => {
    return window.settingsPanel.closeDocument();
  };

  /*
   * Preferences should normally open as a document tab.
   * Legacy modal behavior remains available as:
   *     window.settingsPanel.open()
   */
  window.openSettingsPanel = () => {
    if (
      window.SMDocumentTabs?.open &&
      window.SMDocumentTabs.active !== "settings"
    ) {
      window.SMDocumentTabs.open("settings");
      return;
    }

    window.settingsPanel.openDocument();
  };

  window.showSettingsKeyboardShortcuts = () => {
    if (window.SMDocumentTabs?.open) {
      window.SMDocumentTabs.open("settings");
    } else {
      window.settingsPanel.openDocument();
    }

    window.settingsPanel._activateSection("keymap");

    requestAnimationFrame(() => {
      window.settingsPanel.panel?.querySelector("#shortcut-search")?.focus();
    });
  };

  window.closeSettingsKeyboardShortcuts = () => {
    if (window.SMDocumentTabs?.active === "settings") {
      window.SMDocumentTabs.close("settings");
    } else {
      window.settingsPanel.closeDocument();
    }
  };

  window.closeSettingsPanel = () => {
    window.settingsPanel.closeDocument();
  };
})();
