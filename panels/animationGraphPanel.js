// ============================================================================
// SM Engine - Animation Graph Panel
// panels/animationGraphPanel.js
// ============================================================================

window.AnimationGraphPanel = {
  host: null,

  initialized: false,

  activeSection: "anim-graph",

  init(host) {
    if (!host) {
      console.error("[AnimationGraphPanel] Missing host");

      return;
    }

    this.host = host;

    if (this.initialized && host.querySelector(".sm-animation-editor")) {
      this.onVisible();
      return;
    }

    this._injectStyles();
    this._buildUI();
    this._bindEvents();

    this.initialized = true;

    this._initializeEditor();

    console.log("[AnimationGraphPanel] initialized");
  },

  // ========================================================================
  // UI
  // ========================================================================

  _buildUI() {
    this.host.innerHTML = `
            <div class="sm-animation-editor">

                <!-- =========================================================
                     TOOLBAR
                ========================================================== -->

                <div class="anim-toolbar">

                    <div class="anim-toolbar-left">

                        <span class="anim-editor-icon">
                            <i class="fas fa-running"></i>
                        </span>

                        <div class="anim-editor-title">

                            <strong>
                                Player Animation Blueprint
                            </strong>

                            <span id="anim-blueprint-name">
                                DefaultPlayerAnimation
                            </span>

                        </div>

                    </div>

                    <div class="anim-toolbar-center">

                        <button
                            class="anim-toolbar-btn"
                            id="anim-save-btn"
                            type="button"
                            title="Save animation graph"
                        >
                            <i class="fas fa-save"></i>
                            Save
                        </button>

                        <button
                            class="anim-toolbar-btn anim-compile-btn"
                            id="anim-compile-btn"
                            type="button"
                            title="Compile animation graph"
                        >
                            <i class="fas fa-check"></i>
                            Compile
                        </button>

                        <span
                            class="anim-compile-status"
                            id="anim-compile-status"
                        >
                            Ready
                        </span>

                    </div>

                    <div class="anim-toolbar-right">

                        <button
                            class="anim-toolbar-btn"
                            id="anim-preview-play"
                            type="button"
                        >
                            <i class="fas fa-play"></i>
                        </button>

                        <button
                            class="anim-toolbar-btn"
                            id="anim-preview-stop"
                            type="button"
                        >
                            <i class="fas fa-stop"></i>
                        </button>

                        <span class="anim-live-label">
                            Live Preview
                        </span>

                    </div>

                </div>

                <!-- =========================================================
                     NAVIGATION
                ========================================================== -->

                <div class="anim-navigation">

                    <button
                        class="anim-nav-btn active"
                        data-section="anim-graph"
                        type="button"
                    >
                        Anim Graph
                    </button>

                    <button
                        class="anim-nav-btn"
                        data-section="state-machines"
                        type="button"
                    >
                        State Machines
                    </button>

                    <button
                        class="anim-nav-btn"
                        data-section="blend-spaces"
                        type="button"
                    >
                        Blend Spaces
                    </button>

                </div>

                <!-- =========================================================
                     BODY
                ========================================================== -->

                <div class="anim-workspace">

                    <!-- LEFT -->

                    <aside class="anim-sidebar anim-sidebar-left">

                        <section class="anim-panel-section">

                            <div class="anim-section-header">

                                <span>
                                    Parameters
                                </span>

                                <button
                                    id="anim-add-parameter"
                                    type="button"
                                    title="Add parameter"
                                >
                                    +
                                </button>

                            </div>

                            <div
                                id="anim-parameter-list"
                                class="anim-parameter-list"
                            >

                                <div
                                    class="anim-parameter"
                                    data-parameter="Speed"
                                >
                                    <span class="anim-param-icon float">
                                        F
                                    </span>

                                    <span>
                                        Speed
                                    </span>

                                    <small>
                                        0.00
                                    </small>
                                </div>

                                <div
                                    class="anim-parameter"
                                    data-parameter="Direction"
                                >
                                    <span class="anim-param-icon float">
                                        F
                                    </span>

                                    <span>
                                        Direction
                                    </span>

                                    <small>
                                        0.00
                                    </small>
                                </div>

                                <div
                                    class="anim-parameter"
                                    data-parameter="IsGrounded"
                                >
                                    <span class="anim-param-icon bool">
                                        B
                                    </span>

                                    <span>
                                        IsGrounded
                                    </span>

                                    <small>
                                        true
                                    </small>
                                </div>

                                <div
                                    class="anim-parameter"
                                    data-parameter="IsRunning"
                                >
                                    <span class="anim-param-icon bool">
                                        B
                                    </span>

                                    <span>
                                        IsRunning
                                    </span>

                                    <small>
                                        false
                                    </small>
                                </div>

                            </div>

                        </section>

                        <section class="anim-panel-section anim-assets-section">

                            <div class="anim-section-header">

                                <span>
                                    Animation Assets
                                </span>

                                <button
                                    id="anim-import-animation"
                                    type="button"
                                    title="Import animation"
                                >
                                    +
                                </button>

                            </div>

                            <div class="anim-search-row">

                                <i class="fas fa-search"></i>

                                <input
                                    id="anim-asset-search"
                                    type="text"
                                    placeholder="Search animations"
                                    autocomplete="off"
                                >

                            </div>

                            <div
                                id="anim-assets-list"
                                class="anim-assets-list"
                            >

                                <div
                                    class="anim-asset"
                                    draggable="true"
                                    data-animation="Idle"
                                >
                                    <i class="fas fa-film"></i>

                                    <span>
                                        Idle
                                    </span>
                                </div>

                                <div
                                    class="anim-asset"
                                    draggable="true"
                                    data-animation="Walk"
                                >
                                    <i class="fas fa-film"></i>

                                    <span>
                                        Walk
                                    </span>
                                </div>

                                <div
                                    class="anim-asset"
                                    draggable="true"
                                    data-animation="Run"
                                >
                                    <i class="fas fa-film"></i>

                                    <span>
                                        Run
                                    </span>
                                </div>

                                <div
                                    class="anim-asset"
                                    draggable="true"
                                    data-animation="Jump"
                                >
                                    <i class="fas fa-film"></i>

                                    <span>
                                        Jump
                                    </span>
                                </div>

                            </div>

                        </section>

                    </aside>

                    <!-- CENTER -->

                    <main class="anim-graph-area">

                        <div class="anim-graph-breadcrumb">

                            <span>
                                DefaultPlayerAnimation
                            </span>

                            <i class="fas fa-chevron-right"></i>

                            <strong id="anim-current-graph-name">
                                Anim Graph
                            </strong>

                        </div>

                        <div
                            id="animation-node-canvas"
                            class="animation-node-canvas"
                        ></div>

                        <div class="anim-canvas-footer">

                            <span>
                                RMB: Add Node
                            </span>

                            <span>
                                Mouse Wheel: Zoom
                            </span>

                            <span>
                                MMB: Pan
                            </span>

                        </div>

                    </main>

                    <!-- RIGHT -->

                    <aside class="anim-sidebar anim-sidebar-right">

                        <section class="anim-panel-section">

                            <div class="anim-section-header">
                                Details
                            </div>

                            <div
                                id="anim-node-details"
                                class="anim-node-details"
                            >

                                <div class="anim-empty-details">

                                    <i class="fas fa-mouse-pointer"></i>

                                    <span>
                                        Select a node to edit its properties
                                    </span>

                                </div>

                            </div>

                        </section>

                        <section class="anim-panel-section">

                            <div class="anim-section-header">
                                Preview
                            </div>

                            <div class="anim-preview-info">

                                <div>
                                    <span>
                                        Speed
                                    </span>

                                    <strong id="anim-preview-speed">
                                        0.00
                                    </strong>
                                </div>

                                <div>
                                    <span>
                                        State
                                    </span>

                                    <strong id="anim-preview-state">
                                        Idle
                                    </strong>
                                </div>

                                <div>
                                    <span>
                                        Grounded
                                    </span>

                                    <strong id="anim-preview-grounded">
                                        Yes
                                    </strong>
                                </div>

                            </div>

                        </section>

                    </aside>

                </div>

            </div>
        `;
  },

  // ========================================================================
  // EDITOR
  // ========================================================================

  _initializeEditor() {
    const canvas = document.getElementById("animation-node-canvas");

    if (!canvas) return;

    if (
      window.AnimationGraphEditor &&
      typeof window.AnimationGraphEditor.init === "function"
    ) {
      window.AnimationGraphEditor.init(canvas);
      return;
    }

    /*
     * Temporary visual default until
     * editor/animation/AnimationGraphEditor.js
     * initializes.
     */

    canvas.innerHTML = `
            <svg
                class="anim-wire-layer"
                width="100%"
                height="100%"
            >
                <path
                    d="M 255 235 C 330 235, 350 235, 430 235"
                    fill="none"
                    stroke="#9ca3af"
                    stroke-width="2"
                />

                <path
                    d="M 640 235 C 720 235, 740 235, 825 235"
                    fill="none"
                    stroke="#9ca3af"
                    stroke-width="2"
                />
            </svg>

            <div
                class="anim-node entry-node"
                style="left:90px;top:185px;"
            >

                <div class="anim-node-title">
                    Entry
                </div>

                <div class="anim-node-body">
                    Animation Start
                </div>

                <span class="anim-pin output"></span>

            </div>

            <div
                class="anim-node state-node"
                style="left:430px;top:165px;"
            >

                <div class="anim-node-title">
                    Locomotion
                </div>

                <div class="anim-node-body">
                    State Machine
                </div>

                <span class="anim-pin input"></span>
                <span class="anim-pin output"></span>

            </div>

            <div
                class="anim-node output-node"
                style="left:825px;top:185px;"
            >

                <div class="anim-node-title">
                    Output Pose
                </div>

                <div class="anim-node-body">
                    Final Animation Pose
                </div>

                <span class="anim-pin input"></span>

            </div>
        `;
  },

  // ========================================================================
  // EVENTS
  // ========================================================================

  _bindEvents() {
    this.host.addEventListener("click", (event) => {
      const nav = event.target.closest(".anim-nav-btn");

      if (nav) {
        this._setSection(nav.dataset.section);

        return;
      }

      const compile = event.target.closest("#anim-compile-btn");

      if (compile) {
        this.compile();
        return;
      }

      const save = event.target.closest("#anim-save-btn");

      if (save) {
        this.save();
        return;
      }

      const play = event.target.closest("#anim-preview-play");

      if (play) {
        this.playPreview();
        return;
      }

      const stop = event.target.closest("#anim-preview-stop");

      if (stop) {
        this.stopPreview();
        return;
      }
    });

    const search = document.getElementById("anim-asset-search");

    search?.addEventListener("input", () => {
      this._filterAssets(search.value);
    });
  },

  _setSection(section) {
    this.activeSection = section;

    this.host.querySelectorAll(".anim-nav-btn").forEach((button) => {
      button.classList.toggle("active", button.dataset.section === section);
    });

    const title = document.getElementById("anim-current-graph-name");

    if (!title) return;

    const names = {
      "anim-graph": "Anim Graph",

      "state-machines": "State Machines",

      "blend-spaces": "Blend Spaces",
    };

    title.textContent = names[section] || "Anim Graph";

    window.AnimationGraphEditor?.setWorkspace?.(section);
  },

  // ========================================================================
  // COMPILE
  // ========================================================================

  compile() {
    const status = document.getElementById("anim-compile-status");

    if (status) {
      status.textContent = "Compiling...";

      status.classList.remove("success", "error");
    }

    try {
      const result =
        window.AnimationGraphEditor?.compile?.() ??
        window.playerAnimationGraph?.compile?.();

      if (result && result.success === false) {
        throw new Error(result.error || "Graph compilation failed");
      }

      if (status) {
        status.textContent = "Compiled";

        status.classList.add("success");
      }

      window.dispatchEvent(
        new CustomEvent("sm:animation-graph-compiled", {
          detail: {
            result,
          },
        }),
      );
    } catch (error) {
      console.error("[AnimationGraph] compile failed:", error);

      if (status) {
        status.textContent = "Compile Error";

        status.classList.add("error");
      }
    }
  },

  // ========================================================================
  // SAVE
  // ========================================================================

  save() {
    try {
      const data = window.AnimationGraphEditor?.serialize?.();

      if (data) {
        localStorage.setItem("sm_player_animation_graph", JSON.stringify(data));
      }

      console.log("[AnimationGraph] saved", data);
    } catch (error) {
      console.error("[AnimationGraph] save failed:", error);
    }
  },

  // ========================================================================
  // PREVIEW
  // ========================================================================

  playPreview() {
    window.AnimationGraphEditor?.playPreview?.();

    window.playerAnimationController?.playPreview?.();
  },

  stopPreview() {
    window.AnimationGraphEditor?.stopPreview?.();

    window.playerAnimationController?.stopPreview?.();
  },

  // ========================================================================
  // ASSET SEARCH
  // ========================================================================

  _filterAssets(value) {
    const query = String(value || "")
      .trim()
      .toLowerCase();

    this.host.querySelectorAll(".anim-asset").forEach((asset) => {
      const name = asset.dataset.animation?.toLowerCase() || "";

      asset.style.display = !query || name.includes(query) ? "" : "none";
    });
  },

  // ========================================================================
  // VISIBILITY
  // ========================================================================

  onVisible() {
    requestAnimationFrame(() => {
      window.AnimationGraphEditor?.resize?.();
    });
  },

  // ========================================================================
  // STYLES
  // ========================================================================

  _injectStyles() {
    if (document.getElementById("sm-animation-graph-styles")) {
      return;
    }

    const style = document.createElement("style");

    style.id = "sm-animation-graph-styles";

    style.textContent = `

            .sm-animation-editor {
                width: 100%;
                height: 100%;
                min-width: 0;
                min-height: 0;

                display: flex;
                flex-direction: column;

                overflow: hidden;

                background:
                    var(--primary-dark, #333333);

                color:
                    var(--text-primary, #ffffff);

                font-family:
                    Inter,
                    "Segoe UI",
                    Arial,
                    sans-serif;
            }

            .anim-toolbar {
                height: 42px;
                min-height: 42px;

                display: flex;
                align-items: center;
                justify-content: space-between;

                padding: 0 8px;

                background:
                    var(--secondary-dark, #3c3c3c);

                border-bottom:
                    1px solid
                    var(--border-color, #4d4d4d81);
            }

            .anim-toolbar-left,
            .anim-toolbar-center,
            .anim-toolbar-right {
                display: flex;
                align-items: center;
                gap: 6px;
            }

            .anim-editor-icon {
                width: 27px;
                height: 27px;

                display: grid;
                place-items: center;

                background: #484848;
            }

            .anim-editor-title {
                display: flex;
                flex-direction: column;

                line-height: 1.05;
            }

            .anim-editor-title strong {
                font-size: 12px;
                font-weight: 600;
            }

            .anim-editor-title span {
                margin-top: 3px;

                font-size: 10px;

                color:
                    var(--text-secondary, #b0b0b0);
            }

            .anim-toolbar-btn {
                height: 27px;

                padding: 0 9px;

                display: flex;
                align-items: center;
                gap: 5px;

                border: none;
                border-radius: 0;

                background: #494949;

                color: #eee;

                cursor: pointer;
            }

            .anim-toolbar-btn:hover {
                background: #565656;
            }

            .anim-compile-btn {
                background: #515151;
            }

            .anim-compile-status {
                margin-left: 4px;

                padding: 3px 6px;

                font-size: 10px;

                color: #bdbdbd;
            }

            .anim-compile-status.success {
                color: #a7d8a7;
            }

            .anim-compile-status.error {
                color: #f0a0a0;
            }

            .anim-live-label {
                margin-left: 4px;

                font-size: 10px;

                color:
                    var(--text-secondary, #b0b0b0);
            }

            .anim-navigation {
                height: 31px;
                min-height: 31px;

                display: flex;
                align-items: stretch;

                padding-left: 7px;

                background: #303030;

                border-bottom:
                    1px solid
                    var(--border-color, #4d4d4d81);
            }

            .anim-nav-btn {
                padding: 0 13px;

                border: none;
                border-radius: 0;

                background: transparent;

                color: #aaa;

                font-size: 11px;

                cursor: pointer;
            }

            .anim-nav-btn:hover {
                background: #393939;

                color: #eee;
            }

            .anim-nav-btn.active {
                background: #424242;

                color: #fff;

                box-shadow:
                    inset 0 -2px 0 #8a8a8a;
            }

            .anim-workspace {
                min-height: 0;

                flex: 1 1 auto;

                display: grid;

                grid-template-columns:
                    230px
                    minmax(300px, 1fr)
                    240px;

                overflow: hidden;
            }

            .anim-sidebar {
                min-width: 0;
                min-height: 0;

                display: flex;
                flex-direction: column;

                overflow: auto;

                background: #303030;
            }

            .anim-sidebar-left {
                border-right:
                    1px solid
                    var(--border-color, #4d4d4d81);
            }

            .anim-sidebar-right {
                border-left:
                    1px solid
                    var(--border-color, #4d4d4d81);
            }

            .anim-panel-section {
                border-bottom:
                    1px solid
                    var(--border-color, #4d4d4d81);
            }

            .anim-assets-section {
                flex: 1;
            }

            .anim-section-header {
                height: 30px;

                padding: 0 9px;

                display: flex;
                align-items: center;
                justify-content: space-between;

                background: #383838;

                color: #ddd;

                font-size: 11px;
                font-weight: 600;
            }

            .anim-section-header button {
                width: 22px;
                height: 22px;

                border: none;

                background: transparent;

                color: #ccc;

                cursor: pointer;
            }

            .anim-section-header button:hover {
                background: #505050;
            }

            .anim-parameter-list,
            .anim-assets-list {
                padding: 5px;
            }

            .anim-parameter {
                height: 28px;

                display: grid;

                grid-template-columns:
                    22px
                    1fr
                    auto;

                align-items: center;

                gap: 4px;

                padding: 0 5px;

                color: #ddd;

                font-size: 11px;

                cursor: default;
            }

            .anim-parameter:hover,
            .anim-asset:hover {
                background: #414141;
            }

            .anim-parameter small {
                color: #858585;
            }

            .anim-param-icon {
                width: 17px;
                height: 17px;

                display: grid;
                place-items: center;

                font-size: 9px;

                background: #505050;
            }

            .anim-param-icon.bool {
                background: #595959;
            }

            .anim-search-row {
                height: 29px;

                display: flex;
                align-items: center;

                gap: 6px;

                margin: 6px;

                padding: 0 7px;

                background: #252525;
            }

            .anim-search-row i {
                font-size: 10px;

                color: #777;
            }

            .anim-search-row input {
                width: 100%;

                border: none;
                outline: none;

                background: transparent;

                color: #eee;

                font-size: 11px;
            }

            .anim-asset {
                height: 28px;

                display: flex;
                align-items: center;

                gap: 7px;

                padding: 0 7px;

                color: #ddd;

                font-size: 11px;

                cursor: grab;
            }

            .anim-asset i {
                color: #999;
            }

            .anim-graph-area {
                position: relative;

                min-width: 0;
                min-height: 0;

                overflow: hidden;

                background: #252525;
            }

            .anim-graph-breadcrumb {
                position: absolute;

                top: 0;
                left: 0;
                right: 0;

                z-index: 20;

                height: 29px;

                display: flex;
                align-items: center;

                gap: 7px;

                padding: 0 9px;

                background: #323232;

                border-bottom:
                    1px solid
                    var(--border-color, #4d4d4d81);

                color: #999;

                font-size: 10px;
            }

            .anim-graph-breadcrumb strong {
                color: #ddd;
            }

            .anim-graph-breadcrumb i {
                font-size: 8px;
            }

            .animation-node-canvas {
                position: absolute;

                inset: 29px 0 24px 0;

                overflow: hidden;

                background-color: #242424;

                background-image:
                    linear-gradient(
                        #2c2c2c 1px,
                        transparent 1px
                    ),
                    linear-gradient(
                        90deg,
                        #2c2c2c 1px,
                        transparent 1px
                    ),
                    linear-gradient(
                        #292929 1px,
                        transparent 1px
                    ),
                    linear-gradient(
                        90deg,
                        #292929 1px,
                        transparent 1px
                    );

                background-size:
                    64px 64px,
                    64px 64px,
                    16px 16px,
                    16px 16px;
            }

            .anim-wire-layer {
                position: absolute;

                inset: 0;

                pointer-events: none;
            }

            .anim-node {
                position: absolute;

                width: 180px;

                background: #353535;

                border:
                    1px solid #555;

                box-shadow:
                    0 5px 16px
                    rgba(0,0,0,.22);

                user-select: none;
            }

            .anim-node-title {
                height: 28px;

                display: flex;
                align-items: center;

                padding: 0 8px;

                background: #464646;

                color: white;

                font-size: 11px;
                font-weight: 600;
            }

            .anim-node-body {
                min-height: 42px;

                display: flex;
                align-items: center;

                padding: 7px;

                color: #bbb;

                font-size: 10px;
            }

            .entry-node {
                width: 165px;
            }

            .entry-node .anim-node-title {
                background: #4a4a4a;
            }

            .state-node {
                width: 210px;
            }

            .state-node .anim-node-title {
                background: #505050;
            }

            .output-node {
                width: 185px;
            }

            .output-node .anim-node-title {
                background: #565656;
            }

            .anim-pin {
                position: absolute;

                top: 50%;

                width: 11px;
                height: 11px;

                transform:
                    translateY(-50%)
                    rotate(45deg);

                background: #aaa;

                border: 2px solid #333;
            }

            .anim-pin.input {
                left: -7px;
            }

            .anim-pin.output {
                right: -7px;
            }

            .anim-canvas-footer {
                position: absolute;

                left: 0;
                right: 0;
                bottom: 0;

                height: 24px;

                display: flex;
                align-items: center;

                gap: 15px;

                padding: 0 8px;

                background: #303030;

                border-top:
                    1px solid
                    var(--border-color, #4d4d4d81);

                color: #777;

                font-size: 9px;
            }

            .anim-empty-details {
                min-height: 110px;

                display: flex;
                flex-direction: column;
                justify-content: center;
                align-items: center;

                gap: 8px;

                padding: 15px;

                color: #777;

                text-align: center;

                font-size: 10px;
            }

            .anim-preview-info {
                padding: 7px;
            }

            .anim-preview-info > div {
                min-height: 27px;

                display: flex;
                align-items: center;
                justify-content: space-between;

                padding: 0 5px;

                border-bottom:
                    1px solid #393939;

                font-size: 10px;
            }

            .anim-preview-info span {
                color: #999;
            }

            .anim-preview-info strong {
                color: #ddd;

                font-weight: 500;
            }

        `;

    document.head.appendChild(style);
  },
};
