/**
 * VideoProjectDockManager.js
 * SM Engine — Project Studio dock.
 *
 * Shared slot:
 * Viewport / Sequencer | Project Studio | Inspector
 *
 * Tabs:
 * CONTENTS | SETTINGS | INFO | MANAGE
 */
(function (global) {
  "use strict";

  class VideoProjectDockManager {
    constructor() {
      this.manager = global.videoProjectContentManager;

      this.panel = null;
      this.host = null;
      this.content = null;
      this.instance = null;
      this.opened = false;

      this.activeTab =
        global.videoProject?.workspace?.perWorkspace?.edit?.projectDockTab ||
        "contents";

      this.width = Number(
        global.videoProject?.workspace?.perWorkspace?.edit?.projectDockWidth ||
          430,
      );

      this._resizeState = null;
      this._layoutSnapshot = null;

      this._managerUnsub = this.manager?.subscribe?.((event) => {
        if (!this.opened) {
          return;
        }

        if (["metadata", "settings"].includes(event?.type)) {
          this._syncHeader();
          return;
        }

        this.refresh();
        global.videoProjectInspectorPanel?.render?.();
      });

      this._styles();
    }

    isOpen() {
      return !!(this.opened && this.panel?.isConnected);
    }

    open(options = {}) {
      if (!document.body.classList.contains("video-editing-mode")) {
        global.videoEditingManager?.enter?.();
      }

      global.videoNodeEditorManager?.close?.();

      global.audioStudioDockManager?.close?.();

      global.colorStudioDockManager?.close?.();

      global.videoEffectsDockManager?.close?.();

      global.videoTransitionsDockManager?.close?.();

      global.videoDeliverDockManager?.close?.();

      this.manager =
        global.ensureVideoProjectContentManager?.() || this.manager;

      this.host = document.getElementById("editor-scene");

      if (!this.host) {
        console.warn("[ProjectStudioDock] #editor-scene not found.");

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

      document.body.classList.add("video-project-dock-open");

      document.body.classList.remove(
        "video-node-editor-open",
        "video-audio-dock-open",
        "video-color-dock-open",
        "video-effects-dock-open",
        "video-transitions-dock-open",
      );

      this._applyWidth();
      this._applyDockLayout();

      this.setTab(options.tab || this.activeTab || "contents");

      this._syncHeader();
      this._refreshLayout();

      return true;
    }

    close() {
      this.opened = false;

      document.body.classList.remove(
        "video-project-dock-open",
        "video-project-dock-resizing",
      );

      this._destroyInstance();

      if (this.panel) {
        this.panel.hidden = true;
        this.panel.style.removeProperty("display");
        this.panel.style.removeProperty("visibility");
        this.panel.style.removeProperty("opacity");
        this.panel.style.removeProperty("pointer-events");
      }

      this._restoreDockLayout();
      this._refreshLayout();

      return true;
    }

    toggle(options = {}) {
      return this.isOpen() ? this.close() : this.open(options);
    }

    setTab(tab) {
      const allowed = ["contents", "settings", "info", "manage"];

      this.activeTab = allowed.includes(tab) ? tab : "contents";

      this._renderActiveTab();
      this._syncTabs();

      global.videoProject?.setWorkspaceState?.(
        "edit",
        {
          projectDockTab: this.activeTab,
        },
        {
          dirty: false,
        },
      );
    }

    refresh() {
      if (!this.opened) {
        return;
      }

      this._renderActiveTab();
      this._syncHeader();
    }

    _ensurePanel() {
      if (this.panel?.isConnected) {
        return;
      }

      const panel = document.createElement("section");

      panel.id = "video-project-studio-dock";

      panel.className = "video-project-studio-dock";

      panel.innerHTML = `
   <div class="video-project-dock-resize"></div>

   <header class="video-project-dock-header">
    <div class="video-project-dock-title">
     <span>${this._svg("project")}</span>

     <div>
      <strong>Project Studio</strong>
      <em data-project-dock-subtitle>Untitled Video Project</em>
     </div>
    </div>

    <div class="video-project-dock-actions">
     <button
      type="button"
      data-project-dock-action="save"
      title="Save Project">
      ${this._svg("save")}
     </button>

     <button
      type="button"
      data-project-dock-action="close"
      title="Close Project Studio">
      ${this._svg("close")}
     </button>
    </div>
   </header>

   <nav class="video-project-dock-tabs">
    <button
     type="button"
     data-project-dock-tab="contents">
     ${this._svg("contents")}
     <span>CONTENTS</span>
    </button>

    <button
     type="button"
     data-project-dock-tab="settings">
     ${this._svg("settings")}
     <span>SETTINGS</span>
    </button>

    <button
     type="button"
     data-project-dock-tab="info">
     ${this._svg("info")}
     <span>INFO</span>
    </button>

    <button
     type="button"
     data-project-dock-tab="manage">
     ${this._svg("manage")}
     <span>MANAGE</span>
    </button>
   </nav>

   <div class="video-project-dock-content"></div>

   <footer class="video-project-dock-status">
    <span data-project-dock-status>Ready</span>
    <span data-project-dock-summary>0 media · 0 clips</span>
   </footer>
  `;

      this.host.appendChild(panel);

      this.panel = panel;

      this.content = panel.querySelector(".video-project-dock-content");

      this._bindPanel();
    }

    _renderActiveTab() {
      if (!this.content || !this.manager) {
        return;
      }

      this._destroyInstance();

      this.content.innerHTML = "";

      const constructors = {
        contents: global.VideoProjectContentsPanel,

        settings: global.VideoProjectSettingsPanel,

        info: global.VideoProjectInfoPanel,

        manage: global.VideoProjectManagementPanel,
      };

      const Constructor = constructors[this.activeTab];

      if (!Constructor) {
        this.content.innerHTML = `
    <div class="veproj-dock-empty">
     <strong>Module not loaded</strong>
     <span>${this.activeTab}</span>
    </div>
   `;

        return;
      }

      this.instance = new Constructor(this.manager);

      this.instance.mount(this.content);

      this._syncHeader();
    }

    _destroyInstance() {
      this.instance?.destroy?.();

      this.instance = null;
    }

    _syncHeader() {
      const project = this.manager?.project;

      const summary = this.manager?.summary?.() || {
        media: 0,
        clips: 0,
      };

      const subtitle = this.panel?.querySelector(
        "[data-project-dock-subtitle]",
      );

      if (subtitle) {
        subtitle.textContent =
          project?.project?.name || "Untitled Video Project";
      }

      const status = this.panel?.querySelector("[data-project-dock-status]");

      if (status) {
        const labels = {
          contents: "Project Contents",
          settings: "Project Settings",
          info: "Project Information",
          manage: "Project Management",
        };

        status.textContent = `${labels[this.activeTab] || "Project"} · ${project?.dirty ? "Modified" : "Saved"}`;
      }

      const summaryElement = this.panel?.querySelector(
        "[data-project-dock-summary]",
      );

      if (summaryElement) {
        summaryElement.textContent = `${summary.media} media · ${summary.clips} clips`;
      }
    }

    _syncTabs() {
      this.panel
        ?.querySelectorAll("[data-project-dock-tab]")
        .forEach((button) => {
          button.classList.toggle(
            "active",
            button.dataset.projectDockTab === this.activeTab,
          );
        });
    }

    _bindPanel() {
      this.panel.addEventListener("click", (event) => {
        const tab = event.target.closest("[data-project-dock-tab]")?.dataset
          ?.projectDockTab;

        if (tab) {
          this.setTab(tab);

          return;
        }

        const action = event.target.closest("[data-project-dock-action]")
          ?.dataset?.projectDockAction;

        if (action === "close") {
          this.close();
        }

        if (action === "save") {
          this.manager.exportProjectFile?.();

          this._syncHeader();

          global.videoProjectInspectorPanel?.render?.();
        }
      });

      const handle = this.panel.querySelector(".video-project-dock-resize");

      handle?.addEventListener("pointerdown", (event) => {
        event.preventDefault();

        this._resizeState = {
          startX: event.clientX,

          width: this.width,
        };

        document.body.classList.add("video-project-dock-resizing");

        const move = (moveEvent) => {
          if (!this._resizeState) {
            return;
          }

          this.width = Math.max(
            320,
            Math.min(
              760,
              this._resizeState.width +
                (this._resizeState.startX - moveEvent.clientX),
            ),
          );

          this._applyWidth();
          this._applyDockLayout();
          this._refreshLayout();
        };

        const up = () => {
          global.removeEventListener("pointermove", move);

          document.body.classList.remove("video-project-dock-resizing");

          this._resizeState = null;

          global.videoProject?.setWorkspaceState?.(
            "edit",
            {
              projectDockWidth: this.width,
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

    _capture(element, name) {
      if (!element) {
        return null;
      }

      return {
        value: element.style.getPropertyValue(name),

        priority: element.style.getPropertyPriority(name),
      };
    }

    _restore(element, name, snapshot) {
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
          right: this._capture(video, "right"),
          width: this._capture(video, "width"),
          maxWidth: this._capture(video, "max-width"),
        },

        sequencer: {
          element: sequencer,
          right: this._capture(sequencer, "right"),
          width: this._capture(sequencer, "width"),
          maxWidth: this._capture(sequencer, "max-width"),
        },

        splitter: {
          element: splitter,
          right: this._capture(splitter, "right"),
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

      [video, sequencer].forEach((element) => {
        if (!element) {
          return;
        }

        element.style.setProperty("right", width, "important");

        element.style.setProperty("width", "auto", "important");

        element.style.setProperty("max-width", remaining, "important");
      });

      splitter?.style.setProperty("right", width, "important");
    }

    _restoreDockLayout() {
      const snapshot = this._layoutSnapshot;

      if (!snapshot) {
        return;
      }

      this._restore(snapshot.video.element, "right", snapshot.video.right);

      this._restore(snapshot.video.element, "width", snapshot.video.width);

      this._restore(
        snapshot.video.element,
        "max-width",
        snapshot.video.maxWidth,
      );

      this._restore(
        snapshot.sequencer.element,
        "right",
        snapshot.sequencer.right,
      );

      this._restore(
        snapshot.sequencer.element,
        "width",
        snapshot.sequencer.width,
      );

      this._restore(
        snapshot.sequencer.element,
        "max-width",
        snapshot.sequencer.maxWidth,
      );

      this._restore(
        snapshot.splitter.element,
        "right",
        snapshot.splitter.right,
      );

      this._layoutSnapshot = null;
    }

    _applyWidth() {
      document.documentElement.style.setProperty(
        "--video-project-dock-width",
        `${Math.round(this.width)}px`,
      );

      if (this.panel) {
        this.panel.style.width = `${Math.round(this.width)}px`;
      }
    }

    _refreshLayout() {
      requestAnimationFrame(() => {
        global.videoEditingManager?.resizeCanvas?.();

        global.sequencerManager?.renderer?.refreshLayout?.();

        global.sequencerManager?.renderer?.render?.();

        global.dispatchEvent(
          new CustomEvent("sm:layout-resized", {
            detail: {
              source: "project-studio-dock",

              open: this.opened,

              width: this.width,
            },
          }),
        );
      });
    }

    _svg(name) {
      const icons = {
        project:
          '<svg viewBox="0 0 24 24"><path d="M4 5h6l2 2h8v12H4z"/><path d="M8 11h8M8 15h6"/></svg>',
        save: '<svg viewBox="0 0 24 24"><path d="M5 4h12l2 2v14H5z"/><path d="M8 4v6h8V4M8 16h8"/></svg>',
        close:
          '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
        contents:
          '<svg viewBox="0 0 24 24"><path d="M4 5h6l2 2h8v12H4z"/><path d="M8 11h8M8 15h5"/></svg>',
        settings:
          '<svg viewBox="0 0 24 24"><path d="M4 7h10M18 7h2M4 12h3M11 12h9M4 17h8M16 17h4"/><circle cx="16" cy="7" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="14" cy="17" r="2"/></svg>',
        info: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 10v6M12 7h.01"/></svg>',
        manage:
          '<svg viewBox="0 0 24 24"><rect x="5" y="4" width="14" height="16"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>',
      };

      return icons[name] || icons.project;
    }

    _styles() {
      if (document.getElementById("video-project-dock-style")) {
        return;
      }

      const style = document.createElement("style");

      style.id = "video-project-dock-style";

      style.textContent = `
   :root{
    --video-project-dock-width:430px;
   }

   .video-project-studio-dock{
    position:absolute;
    top:0;
    right:0;
    bottom:0;
    width:var(--video-project-dock-width);
    min-width:320px;
    max-width:760px;
    display:grid;
    grid-template-rows:34px 29px minmax(0,1fr) 22px;
    box-sizing:border-box;
    border-left:1px solid var(--border-color,#4d4d4d81);
    background:var(--panel-bg,var(--primary-dark,#333));
    color:#fff;
    overflow:visible;
    z-index:40;
   }

   .video-project-studio-dock[hidden]{
    display:none!important;
   }

   body.video-project-dock-open
   #editor-scene>canvas,
   body.video-project-dock-open
   #editor-scene>.renderer-container,
   body.video-project-dock-open
   #editor-scene>.viewport-canvas,
   body.video-project-dock-open
   #editor-scene>.scene-canvas{
    z-index:0!important;
   }

   body.video-project-dock-open
   #video-project-studio-dock{
    z-index:40!important;
    visibility:visible!important;
    opacity:1!important;
    pointer-events:auto!important;
   }

   .video-project-dock-resize{
    position:absolute;
    left:-4px;
    top:0;
    bottom:0;
    width:8px;
    cursor:col-resize;
   }

   .video-project-dock-resize::after{
    content:'';
    position:absolute;
    left:3px;
    top:0;
    bottom:0;
    width:1px;
    background:var(--border-color,#4d4d4d81);
   }

   body.video-project-dock-resizing{
    cursor:col-resize!important;
    user-select:none!important;
   }

   .video-project-dock-header{
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:6px;
    padding:0 5px 0 7px;
    border-bottom:1px solid var(--border-color,#4d4d4d81);
    background:var(--header-bg,var(--secondary-dark,#3c3c3c));
   }

   .video-project-dock-title{
    min-width:0;
    display:flex;
    align-items:center;
    gap:7px;
   }

   .video-project-dock-title>span{
    width:18px;
    height:18px;
    color:var(--text-secondary,#b0b0b0);
   }

   .video-project-studio-dock svg{
    width:100%;
    height:100%;
    fill:none;
    stroke:currentColor;
    stroke-width:1.65;
    stroke-linecap:round;
    stroke-linejoin:round;
   }

   .video-project-dock-title>div{
    min-width:0;
   }

   .video-project-dock-title strong,
   .video-project-dock-title em{
    display:block;
   }

   .video-project-dock-title strong{
    font-size:9px;
   }

   .video-project-dock-title em{
    margin-top:1px;
    max-width:220px;
    overflow:hidden;
    text-overflow:ellipsis;
    white-space:nowrap;
    color:var(--text-secondary,#b0b0b0);
    font-style:normal;
    font-size:7px;
   }

   .video-project-dock-actions{
    display:flex;
    gap:1px;
   }

   .video-project-dock-actions button{
    width:24px;
    height:22px;
    padding:5px;
    border:0;
    background:transparent;
    color:var(--text-secondary,#b0b0b0);
   }

   .video-project-dock-actions button:hover{
    background:var(--accent-blue-dark,#474747);
    color:#fff;
   }

   .video-project-dock-tabs{
    display:flex;
    align-items:center;
    gap:2px;
    padding:0 4px;
    border-bottom:1px solid var(--border-color,#4d4d4d81);
    background:var(--secondary-dark,#3c3c3c);
   }

   .video-project-dock-tabs button{
    height:21px;
    display:flex;
    align-items:center;
    gap:4px;
    padding:0 6px;
    border:1px solid transparent;
    border-radius:0;
    background:transparent;
    color:var(--text-secondary,#b0b0b0);
    font-size:7px;
   }

   .video-project-dock-tabs button svg{
    width:13px;
    height:13px;
   }

   .video-project-dock-tabs button:hover,
   .video-project-dock-tabs button.active{
    border-color:var(--border-color,#4d4d4d81);
    background:var(--accent-blue-dark,#474747);
    color:#fff;
   }

   .video-project-dock-content{
    min-width:0;
    min-height:0;
    overflow:hidden;
    background:var(--primary-dark,#333);
   }

   .video-project-dock-status{
    display:flex;
    align-items:center;
    justify-content:space-between;
    padding:0 6px;
    border-top:1px solid var(--border-color,#4d4d4d81);
    background:var(--header-bg,var(--secondary-dark,#3c3c3c));
    color:var(--text-secondary,#b0b0b0);
    font-size:6px;
   }

   .veproj-dock-empty{
    height:100%;
    display:flex;
    flex-direction:column;
    align-items:center;
    justify-content:center;
    gap:5px;
    color:var(--text-secondary,#b0b0b0);
    text-align:center;
   }

   .veproj-dock-empty strong{
    color:#fff;
    font-size:9px;
   }

   .veproj-dock-empty span{
    font-size:7px;
   }
  `;

      document.head.appendChild(style);
    }
  }

  global.VideoProjectDockManager = VideoProjectDockManager;

  global.ensureVideoProjectDockManager =
    function ensureVideoProjectDockManager() {
      if (!global.videoProjectDockManager) {
        global.videoProjectDockManager = new VideoProjectDockManager();
      }

      return global.videoProjectDockManager;
    };

  global.ensureVideoProjectDockManager();
})(window);
