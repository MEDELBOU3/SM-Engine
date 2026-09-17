/**
 * ColorStudioDockManager.js
 * SM Engine Video Editing — DaVinci-inspired Color Studio dock.
 *
 * Shared slot:
 *   Viewport / Sequencer | Color Studio | Inspector
 *
 * Tabs:
 * - Primaries
 * - Curves
 * - Scopes
 */
(function (global) {
  "use strict";

  class ColorStudioDockManager {
    constructor() {
      this.color =
        global.colorGradingManager ||
        global.ensureColorGradingManager?.(global.videoProject) ||
        null;

      this.panel = null;
      this.host = null;
      this.content = null;
      this.opened = false;
      this.activeTab =
        global.videoProject?.workspace?.perWorkspace?.edit?.colorDockTab ||
        "primaries";

      this.width = Number(
        global.videoProject?.workspace?.perWorkspace?.edit?.colorDockWidth ||
          global.videoProject?.workspace?.perWorkspace?.edit?.nodePanelWidth ||
          430,
      );

      this.activeInstance = null;
      this._resizeState = null;
      this._unsubSelection = null;
      this._layoutSnapshot = null;

      this._styles();
      this._bindProject();
    }

    isOpen() {
      return !!(this.opened && this.panel?.isConnected);
    }

    open(options = {}) {
      if (!document.body.classList.contains("video-editing-mode")) {
        global.videoEditingManager?.enter?.();
      }

      /*
       * Fusion / Audio / Color share one professional side-dock slot.
       */
      global.videoNodeEditorManager?.close?.();

      global.audioStudioDockManager?.close?.();

      global.videoEffectsDockManager?.close?.();

      global.videoTransitionsDockManager?.close?.();

      global.videoProjectDockManager?.close?.();

      global.videoDeliverDockManager?.close?.();

      this.color =
        global.ensureColorGradingManager?.(global.videoProject) || this.color;

      this.host = document.getElementById("editor-scene");

      if (!this.host) {
        console.warn("[ColorStudioDock] #editor-scene not found.");

        return false;
      }

      this._ensurePanel();

      if (
        this.panel.parentElement === this.host &&
        this.host.lastElementChild !== this.panel
      ) {
        this.host.appendChild(this.panel);
      }

      this.opened = true;

      this.panel.hidden = false;
      this.panel.style.display = "grid";
      this.panel.style.visibility = "visible";
      this.panel.style.opacity = "1";
      this.panel.style.pointerEvents = "auto";

      document.body.classList.add("video-color-dock-open");

      document.body.classList.remove(
        "video-node-editor-open",
        "video-audio-dock-open",
      );

      this._applyWidth();
      this._applyDockLayout();

      this.setTab(options.tab || this.activeTab || "primaries");

      this._syncHeader();
      this._refreshLayout();

      return true;
    }

    close() {
      this.opened = false;

      document.body.classList.remove(
        "video-color-dock-open",
        "video-color-dock-resizing",
      );

      this._destroyActivePanel();

      if (this.panel) {
        this.panel.hidden = true;

        this.panel.style.removeProperty("display");

        this.panel.style.removeProperty("visibility");

        this.panel.style.removeProperty("opacity");

        this.panel.style.removeProperty("pointer-events");
      }

      this._resizeState = null;

      this._restoreDockLayout();
      this._refreshLayout();

      return true;
    }

    toggle(options = {}) {
      return this.isOpen() ? this.close() : this.open(options);
    }

    setTab(tab) {
      const allowed = ["primaries", "curves", "scopes"];

      this.activeTab = allowed.includes(tab) ? tab : "primaries";

      this._renderActiveTab();
      this._syncTabButtons();

      global.videoProject?.setWorkspaceState?.(
        "edit",
        {
          colorDockTab: this.activeTab,
        },
        {
          dirty: false,
        },
      );
    }

    refresh() {
      if (!this.opened) return;

      this._syncHeader();

      if (this.activeTab === "primaries") {
        this.activeInstance?.render?.();
      } else if (this.activeTab === "curves") {
        this.activeInstance?.render?.();
      } else {
        this.activeInstance?.draw?.();
      }
    }

    _ensurePanel() {
      if (this.panel?.isConnected) {
        return;
      }

      const panel = document.createElement("section");

      panel.id = "video-color-studio-dock";

      panel.className = "video-color-studio-dock";

      panel.innerHTML = `
   <div class="video-color-dock-resize"></div>

   <header class="video-color-dock-header">
    <div class="video-color-dock-title">
     <span class="video-color-dock-icon">${this._svg("color")}</span>

     <div>
      <strong>Color Studio</strong>
      <span data-color-dock-subtitle>No clip selected</span>
     </div>
    </div>

    <div class="video-color-dock-actions">
     <button
      type="button"
      data-color-dock-action="bypass"
      title="Bypass Grade">
      ${this._svg("bypass")}
     </button>

     <button
      type="button"
      data-color-dock-action="reset"
      title="Reset Grade">
      ${this._svg("reset")}
     </button>

     <button
      type="button"
      data-color-dock-action="close"
      title="Close Color Studio">
      ${this._svg("close")}
     </button>
    </div>
   </header>

   <nav class="video-color-dock-tabs">
    <button
     type="button"
     data-color-dock-tab="primaries">
     ${this._svg("wheels")}
     <span>PRIMARIES</span>
    </button>

    <button
     type="button"
     data-color-dock-tab="curves">
     ${this._svg("curves")}
     <span>CURVES</span>
    </button>

    <button
     type="button"
     data-color-dock-tab="scopes">
     ${this._svg("scopes")}
     <span>SCOPES</span>
    </button>
   </nav>

   <div class="video-color-dock-content"></div>

   <footer class="video-color-dock-status">
    <span data-color-dock-status>Ready</span>
    <span data-color-dock-space>sRGB · Clip Grade</span>
   </footer>
  `;

      this.host.appendChild(panel);

      this.panel = panel;

      this.content = panel.querySelector(".video-color-dock-content");

      this._bindPanel();
    }

    _renderActiveTab() {
      if (!this.content || !this.color) {
        return;
      }

      this._destroyActivePanel();

      this.content.innerHTML = "";

      if (this.activeTab === "primaries") {
        if (!global.ColorWheelsPanel) {
          this._missingModule("ColorWheelsPanel.js");

          return;
        }

        this.activeInstance = new global.ColorWheelsPanel(this.color);

        this.activeInstance.mount(this.content);
      } else if (this.activeTab === "curves") {
        if (!global.ColorCurvesPanel) {
          this._missingModule("ColorCurvesPanel.js");

          return;
        }

        this.activeInstance = new global.ColorCurvesPanel(this.color);

        this.activeInstance.mount(this.content);
      } else {
        if (!global.VideoScopesPanel) {
          this._missingModule("VideoScopesPanel.js");

          return;
        }

        this.activeInstance = new global.VideoScopesPanel();

        this.activeInstance.mount(this.content);
      }

      this._syncHeader();
    }

    _destroyActivePanel() {
      if (!this.activeInstance) {
        return;
      }

      this.activeInstance.destroy?.();

      this.activeInstance = null;
    }

    _missingModule(name) {
      this.content.innerHTML = `
   <div class="video-color-dock-missing">
    <span>${this._svg("warning")}</span>
    <strong>${name}</strong>
    <em>Color UI module is not loaded.</em>
   </div>
  `;
    }

    _syncHeader() {
      const clip = this.color?.selectedClip?.();

      const subtitle = this.panel?.querySelector("[data-color-dock-subtitle]");

      if (subtitle) {
        subtitle.textContent = clip
          ? clip.name || "Selected Clip"
          : "No color-capable clip selected";
      }

      const grade = clip ? this.color?.ensureGrade?.(clip) : null;

      const bypass = this.panel?.querySelector(
        '[data-color-dock-action="bypass"]',
      );

      bypass?.classList.toggle("active", grade?.enabled === false);

      const status = this.panel?.querySelector("[data-color-dock-status]");

      if (status) {
        status.textContent =
          this.activeTab === "primaries"
            ? "Primary Color Correction"
            : this.activeTab === "curves"
              ? "Custom Curves"
              : "Video Scopes";
      }

      const colorSpace = this.panel?.querySelector("[data-color-dock-space]");

      if (colorSpace) {
        const space =
          global.videoProject?.settings?.workingColorSpace ||
          global.videoProject?.settings?.colorSpace ||
          "sRGB";

        colorSpace.textContent = `${space} · Clip Grade`;
      }
    }

    _syncTabButtons() {
      this.panel
        ?.querySelectorAll("[data-color-dock-tab]")
        .forEach((button) => {
          button.classList.toggle(
            "active",
            button.dataset.colorDockTab === this.activeTab,
          );
        });
    }

    _bindPanel() {
      this.panel.addEventListener("click", (event) => {
        const tab = event.target.closest("[data-color-dock-tab]")?.dataset
          ?.colorDockTab;

        if (tab) {
          this.setTab(tab);

          return;
        }

        const action = event.target.closest("[data-color-dock-action]")?.dataset
          ?.colorDockAction;

        if (action === "close") {
          this.close();
        }

        if (action === "reset") {
          const clip = this.color?.selectedClip?.();

          if (clip) {
            this.color.reset(clip);

            this.refresh();

            global.colorInspectorPanel?.render?.(
              global.videoInspectorSidebar?.host,
            );
          }
        }

        if (action === "bypass") {
          const clip = this.color?.selectedClip?.();

          if (clip) {
            this.color.toggleEnabled(clip);

            this.refresh();

            global.colorInspectorPanel?.render?.(
              global.videoInspectorSidebar?.host,
            );
          }
        }
      });

      const handle = this.panel.querySelector(".video-color-dock-resize");

      handle?.addEventListener("pointerdown", (event) => {
        event.preventDefault();

        this._resizeState = {
          startX: event.clientX,
          width: this.width,
        };

        document.body.classList.add("video-color-dock-resizing");

        const move = (moveEvent) => {
          if (!this._resizeState) {
            return;
          }

          const delta = this._resizeState.startX - moveEvent.clientX;

          this.width = Math.max(
            320,
            Math.min(760, this._resizeState.width + delta),
          );

          this._applyWidth();
          this._applyDockLayout();
          this._refreshLayout();
        };

        const up = () => {
          global.removeEventListener("pointermove", move);

          document.body.classList.remove("video-color-dock-resizing");

          this._resizeState = null;

          global.videoProject?.setWorkspaceState?.(
            "edit",
            {
              colorDockWidth: this.width,
            },
            {
              dirty: false,
            },
          );
        };

        global.addEventListener("pointermove", move);

        global.addEventListener("pointerup", up, {
          once: true,
        });
      });
    }

    _bindProject() {
      this._unsubSelection?.();

      if (!global.videoProject?.subscribe) {
        return;
      }

      this._unsubSelection = global.videoProject.subscribe(
        "selection.*",
        () => {
          if (this.opened) {
            this.refresh();

            global.colorInspectorPanel?.render?.(
              global.videoInspectorSidebar?.host,
            );
          }
        },
      );
    }

    _applyWidth() {
      document.documentElement.style.setProperty(
        "--video-color-dock-width",
        `${Math.round(this.width)}px`,
      );

      if (this.panel) {
        this.panel.style.width = `${Math.round(this.width)}px`;
      }
    }

    _captureStyleProperty(element, name) {
      if (!element) {
        return null;
      }

      return {
        value: element.style.getPropertyValue(name),

        priority: element.style.getPropertyPriority(name),
      };
    }

    _restoreStyleProperty(element, name, snapshot) {
      if (!element || snapshot == null) {
        return;
      }

      if (snapshot.value) {
        element.style.setProperty(
          name,
          snapshot.value,
          snapshot.priority || "",
        );
      } else {
        element.style.removeProperty(name);
      }
    }

    _captureDockLayout() {
      if (this._layoutSnapshot) {
        return;
      }

      const video = document.getElementById("video-editing-container");

      const sequencer = document.getElementById("sequencer-root");

      const splitter = document.querySelector(".sequencer-splitter");

      this._layoutSnapshot = {
        video: {
          element: video,
          right: this._captureStyleProperty(video, "right"),
          width: this._captureStyleProperty(video, "width"),
          maxWidth: this._captureStyleProperty(video, "max-width"),
        },

        sequencer: {
          element: sequencer,
          right: this._captureStyleProperty(sequencer, "right"),
          width: this._captureStyleProperty(sequencer, "width"),
          maxWidth: this._captureStyleProperty(sequencer, "max-width"),
        },

        splitter: {
          element: splitter,
          right: this._captureStyleProperty(splitter, "right"),
        },
      };
    }

    _applyDockLayout() {
      if (!this.opened) {
        return;
      }

      this._captureDockLayout();

      const width = `${Math.round(this.width)}px`;

      const remaining = `calc(100% - ${width})`;

      const video = document.getElementById("video-editing-container");

      const sequencer = document.getElementById("sequencer-root");

      const splitter = document.querySelector(".sequencer-splitter");

      /*
       * Use inline !important while the dock is open. This guarantees the Color
       * panel consumes real editor width instead of visually floating on top of
       * the Composition viewport.
       */
      if (video) {
        video.style.setProperty("right", width, "important");

        video.style.setProperty("width", "auto", "important");

        video.style.setProperty("max-width", remaining, "important");
      }

      if (sequencer) {
        sequencer.style.setProperty("right", width, "important");

        sequencer.style.setProperty("width", "auto", "important");

        sequencer.style.setProperty("max-width", remaining, "important");
      }

      if (splitter) {
        splitter.style.setProperty("right", width, "important");
      }

      if (this.panel) {
        this.panel.style.setProperty("right", "0px", "important");

        this.panel.style.setProperty("z-index", "40", "important");

        this.panel.style.setProperty("visibility", "visible", "important");

        this.panel.style.setProperty("opacity", "1", "important");
      }
    }

    _restoreDockLayout() {
      const snapshot = this._layoutSnapshot;

      if (!snapshot) {
        return;
      }

      this._restoreStyleProperty(
        snapshot.video.element,
        "right",
        snapshot.video.right,
      );

      this._restoreStyleProperty(
        snapshot.video.element,
        "width",
        snapshot.video.width,
      );

      this._restoreStyleProperty(
        snapshot.video.element,
        "max-width",
        snapshot.video.maxWidth,
      );

      this._restoreStyleProperty(
        snapshot.sequencer.element,
        "right",
        snapshot.sequencer.right,
      );

      this._restoreStyleProperty(
        snapshot.sequencer.element,
        "width",
        snapshot.sequencer.width,
      );

      this._restoreStyleProperty(
        snapshot.sequencer.element,
        "max-width",
        snapshot.sequencer.maxWidth,
      );

      this._restoreStyleProperty(
        snapshot.splitter.element,
        "right",
        snapshot.splitter.right,
      );

      this._layoutSnapshot = null;
    }

    _refreshLayout() {
      requestAnimationFrame(() => {
        global.videoEditingManager?.resizeCanvas?.();

        global.sequencerManager?.renderer?.refreshLayout?.();

        global.sequencerManager?.renderer?.render?.();

        global.dispatchEvent(
          new CustomEvent("sm:layout-resized", {
            detail: {
              source: "color-studio-dock",
              open: this.opened,
              width: this.width,
            },
          }),
        );
      });
    }

    _svg(name) {
      const icons = {
        color:
          '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 4v16M4 12h16"/><path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/></svg>',

        wheels:
          '<svg viewBox="0 0 24 24"><circle cx="8" cy="12" r="4"/><circle cx="16" cy="12" r="4"/><path d="M8 8v8M4 12h8M16 8v8M12 12h8"/></svg>',

        curves:
          '<svg viewBox="0 0 24 24"><path d="M4 18c5-9 7-2 10-8 2-4 3-4 6-4"/><path d="M4 4v16h16"/></svg>',

        scopes:
          '<svg viewBox="0 0 24 24"><path d="M4 18V9M8 18V5M12 18v-7M16 18V7M20 18V4"/></svg>',

        bypass:
          '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7"/><path d="M7 17L17 7"/></svg>',

        reset:
          '<svg viewBox="0 0 24 24"><path d="M5 8a8 8 0 1 1-1 7"/><path d="M5 4v4h4"/></svg>',

        close:
          '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',

        warning:
          '<svg viewBox="0 0 24 24"><path d="M12 4l9 16H3z"/><path d="M12 9v5M12 17h.01"/></svg>',
      };

      return icons[name] || icons.color;
    }

    _styles() {
      if (document.getElementById("video-color-studio-dock-styles")) {
        return;
      }

      const style = document.createElement("style");

      style.id = "video-color-studio-dock-styles";

      style.textContent = `
   :root{
    --video-color-dock-width:430px;
   }

   .video-color-studio-dock{
    position:absolute;
    top:0;
    right:0;
    bottom:0;

    width:var(--video-color-dock-width);
    min-width:320px;
    max-width:760px;

    display:grid;
    grid-template-rows:34px 29px minmax(0,1fr) 22px;

    box-sizing:border-box;

    border-left:
     1px solid
     var(--border-color,#4d4d4d81);

    background:
     var(
      --panel-bg,
      var(--primary-dark,#333)
     );

    color:
     var(--text-primary,#fff);

    overflow:visible;

    z-index:40;
   }

   .video-color-studio-dock[hidden]{
    display:none!important;
   }

   body.video-color-dock-open
   #editor-scene
   >canvas,
   body.video-color-dock-open
   #editor-scene
   >.renderer-container,
   body.video-color-dock-open
   #editor-scene
   >.viewport-canvas,
   body.video-color-dock-open
   #editor-scene
   >.scene-canvas{
    z-index:0!important;
   }

   body.video-color-dock-open
   #video-color-studio-dock{
    z-index:40!important;
    visibility:visible!important;
    opacity:1!important;
    pointer-events:auto!important;
   }

   body.video-color-dock-open
   #video-editing-container{
    right:
     var(--video-color-dock-width)!important;

    width:auto!important;

    max-width:
     calc(
      100% -
      var(--video-color-dock-width)
     )!important;
   }

   body.video-color-dock-open
   #sequencer-root{
    right:
     var(--video-color-dock-width)!important;

    width:auto!important;

    max-width:
     calc(
      100% -
      var(--video-color-dock-width)
     )!important;
   }

   body.video-color-dock-open
   .sequencer-splitter{
    right:
     var(--video-color-dock-width)!important;
   }

   .video-color-dock-resize{
    position:absolute;
    left:-4px;
    top:0;
    bottom:0;
    width:8px;
    cursor:col-resize;
    background:transparent;
   }

   .video-color-dock-resize::after{
    content:'';
    position:absolute;
    left:3px;
    top:0;
    bottom:0;
    width:1px;
    background:
     var(
      --border-color,
      #4d4d4d81
     );
   }

   body.video-color-dock-resizing{
    cursor:col-resize!important;
    user-select:none!important;
   }

   .video-color-dock-header{
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:6px;
    padding:0 5px 0 7px;

    border-bottom:
     1px solid
     var(--border-color,#4d4d4d81);

    background:
     var(
      --header-bg,
      var(--secondary-dark,#3c3c3c)
     );
   }

   .video-color-dock-title{
    min-width:0;
    display:flex;
    align-items:center;
    gap:7px;
   }

   .video-color-dock-title>div{
    min-width:0;
   }

   .video-color-dock-title strong,
   .video-color-dock-title span{
    display:block;
   }

   .video-color-dock-title strong{
    font-size:9px;
   }

   .video-color-dock-title div>span{
    max-width:220px;
    margin-top:1px;
    overflow:hidden;
    text-overflow:ellipsis;
    white-space:nowrap;
    color:
     var(--text-secondary,#b0b0b0);
    font-size:7px;
   }

   .video-color-dock-icon{
    width:18px;
    height:18px;
    flex:0 0 18px;
    display:inline-flex;
    color:
     var(--text-secondary,#b0b0b0);
   }

   .video-color-dock-icon svg,
   .video-color-dock-actions svg,
   .video-color-dock-tabs svg,
   .video-color-dock-missing svg{
    width:100%;
    height:100%;
    fill:none;
    stroke:currentColor;
    stroke-width:1.65;
    stroke-linecap:round;
    stroke-linejoin:round;
   }

   .video-color-dock-actions{
    display:flex;
    gap:1px;
   }

   .video-color-dock-actions button{
    width:24px;
    height:22px;
    padding:5px;
    border:0;
    border-radius:0;
    background:transparent;
    color:
     var(--text-secondary,#b0b0b0);
    cursor:pointer;
   }

   .video-color-dock-actions button:hover,
   .video-color-dock-actions button.active{
    background:
     var(--accent-blue-dark,#474747);
    color:
     var(--text-primary,#fff);
   }

   .video-color-dock-tabs{
    display:flex;
    align-items:center;
    gap:2px;
    padding:0 4px;

    border-bottom:
     1px solid
     var(--border-color,#4d4d4d81);

    background:
     var(--secondary-dark,#3c3c3c);
   }

   .video-color-dock-tabs button{
    height:21px;
    display:flex;
    align-items:center;
    gap:4px;
    padding:0 6px;

    border:
     1px solid
     transparent;

    border-radius:0;

    background:transparent;

    color:
     var(--text-secondary,#b0b0b0);

    font-size:7px;
    cursor:pointer;
   }

   .video-color-dock-tabs button svg{
    width:13px;
    height:13px;
   }

   .video-color-dock-tabs button:hover,
   .video-color-dock-tabs button.active{
    border-color:
     var(--border-color,#4d4d4d81);

    background:
     var(--accent-blue-dark,#474747);

    color:
     var(--text-primary,#fff);
   }

   .video-color-dock-content{
    min-width:0;
    min-height:0;
    overflow:hidden;
    background:
     var(--primary-dark,#333);
   }

   .video-color-dock-status{
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:8px;
    padding:0 6px;

    border-top:
     1px solid
     var(--border-color,#4d4d4d81);

    background:
     var(
      --header-bg,
      var(--secondary-dark,#3c3c3c)
     );

    color:
     var(--text-secondary,#b0b0b0);

    font-size:6px;
    white-space:nowrap;
   }

   .video-color-dock-missing{
    height:100%;
    display:flex;
    flex-direction:column;
    align-items:center;
    justify-content:center;
    gap:5px;
    color:
     var(--text-secondary,#b0b0b0);
    text-align:center;
   }

   .video-color-dock-missing>span{
    width:22px;
    height:22px;
   }

   .video-color-dock-missing strong{
    color:
     var(--text-primary,#fff);
    font-size:9px;
   }

   .video-color-dock-missing em{
    font-style:normal;
    font-size:7px;
   }
  `;

      document.head.appendChild(style);
    }
  }

  global.ColorStudioDockManager = ColorStudioDockManager;

  global.ensureColorStudioDockManager =
    function ensureColorStudioDockManager() {
      if (!global.colorStudioDockManager) {
        global.colorStudioDockManager = new ColorStudioDockManager();
      }

      return global.colorStudioDockManager;
    };

  global.ensureColorStudioDockManager();
})(window);
