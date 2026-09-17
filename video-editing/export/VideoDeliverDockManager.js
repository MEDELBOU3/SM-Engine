/**
 * VideoDeliverDockManager.js
 * SM Engine — professional Deliver Studio dock.
 *
 * Shared right-side slot:
 * Viewport / Sequencer | Deliver Studio | Inspector
 *
 * Tabs:
 * SETTINGS | PRESETS | PREFLIGHT | QUEUE
 */
(function (global) {
  "use strict";

  class VideoDeliverDockManager {
    constructor() {
      this.exporter = global.videoExportManager;

      this.queue = global.renderQueueManager;

      this.panel = null;
      this.host = null;
      this.content = null;
      this.instance = null;
      this.opened = false;

      this.activeTab =
        global.videoProject?.workspace?.perWorkspace?.edit?.deliverDockTab ||
        "settings";

      this.width = Number(
        global.videoProject?.workspace?.perWorkspace?.edit?.deliverDockWidth ||
          460,
      );

      this.settings = this._loadSettings();

      this._resizeState = null;
      this._layoutSnapshot = null;

      this._queueUnsub = this.queue?.subscribe?.(() => {
        this._syncHeader();

        global.videoDeliverInspectorPanel?.render?.();
      });

      this._styles();
    }

    _loadSettings() {
      const saved = global.videoProject?.state?.export?.deliverSettings;

      return this.exporter.resolveSettings(
        saved || this.exporter.defaultSettings(),
      );
    }

    _saveSettings() {
      const project = global.videoProject;

      if (!project?.state) {
        return;
      }

      project.state.export = project.state.export || {};

      project.state.export.deliverSettings = {
        ...this.settings,
      };

      project.touch?.("export.deliverSettings", {
        settings: {
          ...this.settings,
        },
      });
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
      global.videoProjectDockManager?.close?.();

      this.exporter = global.videoExportManager || this.exporter;

      this.queue = global.renderQueueManager || this.queue;

      this.host = document.getElementById("editor-scene");

      if (!this.host) {
        console.warn("[DeliverStudioDock] #editor-scene not found.");

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

      document.body.classList.add("video-deliver-dock-open");

      document.body.classList.remove(
        "video-node-editor-open",
        "video-audio-dock-open",
        "video-color-dock-open",
        "video-effects-dock-open",
        "video-transitions-dock-open",
        "video-project-dock-open",
      );

      this._applyWidth();
      this._applyDockLayout();

      this.setTab(options.tab || this.activeTab || "settings");

      this._syncHeader();
      this._refreshLayout();

      return true;
    }

    close() {
      this.opened = false;

      document.body.classList.remove(
        "video-deliver-dock-open",
        "video-deliver-dock-resizing",
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
      const allowed = ["settings", "presets", "preflight", "queue"];

      this.activeTab = allowed.includes(tab) ? tab : "settings";

      this._renderActiveTab();
      this._syncTabs();

      global.videoProject?.setWorkspaceState?.(
        "edit",
        {
          deliverDockTab: this.activeTab,
        },
        {
          dirty: false,
        },
      );
    }

    updateSettings(patch = {}) {
      this.settings = this.exporter.resolveSettings({
        ...this.settings,
        ...patch,
      });

      if (
        !Object.prototype.hasOwnProperty.call(patch, "presetId") &&
        Object.keys(patch).length
      ) {
        this.settings.presetId = "custom";
      }

      this._saveSettings();
      this._syncHeader();

      global.videoDeliverInspectorPanel?.render?.();

      return this.settings;
    }

    applyPreset(id) {
      this.settings = this.exporter.presets.resolve(id, global.videoProject);

      this.settings.presetId = id;

      this._saveSettings();
      this._syncHeader();

      global.videoDeliverInspectorPanel?.render?.();

      return this.settings;
    }

    addCurrentToQueue() {
      const validation = this.exporter.validate(this.settings);

      if (!validation.valid) {
        this.setTab("preflight");

        return null;
      }

      const job = this.queue.addJob(this.settings);

      this._syncHeader();

      return job;
    }

    async quickExport() {
      const validation = this.exporter.validate(this.settings);

      if (!validation.valid) {
        this.setTab("preflight");

        return false;
      }

      const job = this.queue.addJob(
        {
          ...this.settings,
        },
        {
          name: `Quick Export · ${this.settings.width}×${this.settings.height}`,
        },
      );

      this.setTab("queue");

      await this.queue.startJob(job.id);

      return true;
    }

    async exportCurrentFrame() {
      try {
        await this.exporter.exportFrame({
          width: this.settings.width,

          height: this.settings.height,

          scaleMode: this.settings.scaleMode,

          filename: this.settings.filename,

          frameFormat: "png",
        });
      } catch (error) {
        console.error("[DeliverStudio] frame export failed:", error);
      }
    }

    _ensurePanel() {
      if (this.panel?.isConnected) {
        return;
      }

      const panel = document.createElement("section");

      panel.id = "video-deliver-studio-dock";

      panel.className = "video-deliver-studio-dock";

      panel.innerHTML = `
   <div class="video-deliver-dock-resize"></div>

   <header class="video-deliver-dock-header">
    <div class="video-deliver-dock-title">
     <span>${this._svg("deliver")}</span>

     <div>
      <strong>Deliver Studio</strong>
      <em data-deliver-dock-subtitle>Custom Export</em>
     </div>
    </div>

    <div class="video-deliver-dock-actions">
     <button
      type="button"
      data-deliver-action="frame"
      title="Export Current Frame">
      ${this._svg("frame")}
     </button>

     <button
      type="button"
      data-deliver-action="queue"
      title="Add to Render Queue">
      ${this._svg("queue")}
     </button>

     <button
      type="button"
      data-deliver-action="quick"
      class="primary"
      title="Quick Export">
      ${this._svg("rocket")}
     </button>

     <button
      type="button"
      data-deliver-action="close"
      title="Close Deliver Studio">
      ${this._svg("close")}
     </button>
    </div>
   </header>

   <nav class="video-deliver-dock-tabs">
    <button
     type="button"
     data-deliver-tab="settings">
     ${this._svg("settings")}
     <span>SETTINGS</span>
    </button>

    <button
     type="button"
     data-deliver-tab="presets">
     ${this._svg("preset")}
     <span>PRESETS</span>
    </button>

    <button
     type="button"
     data-deliver-tab="preflight">
     ${this._svg("check")}
     <span>PREFLIGHT</span>
    </button>

    <button
     type="button"
     data-deliver-tab="queue">
     ${this._svg("queue")}
     <span>QUEUE</span>
    </button>
   </nav>

   <div class="video-deliver-dock-content"></div>

   <footer class="video-deliver-dock-status">
    <span data-deliver-dock-status>Ready</span>
    <span data-deliver-dock-summary>0 queued</span>
   </footer>
  `;

      this.host.appendChild(panel);

      this.panel = panel;

      this.content = panel.querySelector(".video-deliver-dock-content");

      this._bindPanel();
    }

    _renderActiveTab() {
      if (!this.content || !this.exporter) {
        return;
      }

      this._destroyInstance();

      this.content.innerHTML = "";

      const constructors = {
        settings: global.VideoDeliverSettingsPanel,

        presets: global.VideoDeliverPresetsPanel,

        preflight: global.VideoDeliverPreflightPanel,

        queue: global.VideoDeliverQueuePanel,
      };

      const Constructor = constructors[this.activeTab];

      if (!Constructor) {
        this.content.innerHTML = `
    <div class="vedel-dock-empty">
     <strong>Deliver module not loaded</strong>
     <span>${this.activeTab}</span>
    </div>
   `;

        return;
      }

      this.instance = new Constructor(this);

      this.instance.mount(this.content);

      this._syncHeader();
    }

    _destroyInstance() {
      this.instance?.destroy?.();

      this.instance = null;
    }

    _syncHeader() {
      if (!this.panel) {
        return;
      }

      const preset = this.exporter?.presets?.get?.(this.settings.presetId);

      const subtitle = this.panel.querySelector("[data-deliver-dock-subtitle]");

      if (subtitle) {
        subtitle.textContent = preset?.name || "Custom Export";
      }

      const validation = this.exporter.validate(this.settings);

      const status = this.panel.querySelector("[data-deliver-dock-status]");

      if (status) {
        const labels = {
          settings: "Render Settings",
          presets: "Delivery Presets",
          preflight: "Export Preflight",
          queue: "Render Queue",
        };

        status.textContent = `${labels[this.activeTab] || "Deliver"} · ${validation.valid ? "Ready" : "Check Settings"}`;
      }

      const summary = this.panel.querySelector("[data-deliver-dock-summary]");

      if (summary) {
        const counts = this.queue.counts();

        summary.textContent = `${counts.queued} queued · ${counts.completed} done`;
      }
    }

    _syncTabs() {
      this.panel?.querySelectorAll("[data-deliver-tab]").forEach((button) => {
        button.classList.toggle(
          "active",
          button.dataset.deliverTab === this.activeTab,
        );
      });
    }

    _bindPanel() {
      this.panel.addEventListener("click", (event) => {
        const tab =
          event.target.closest("[data-deliver-tab]")?.dataset?.deliverTab;

        if (tab) {
          this.setTab(tab);

          return;
        }

        const action = event.target.closest("[data-deliver-action]")?.dataset
          ?.deliverAction;

        if (action === "close") {
          this.close();
        } else if (action === "frame") {
          this.exportCurrentFrame();
        } else if (action === "queue") {
          this.addCurrentToQueue();
          this.setTab("queue");
        } else if (action === "quick") {
          this.quickExport();
        }
      });

      const handle = this.panel.querySelector(".video-deliver-dock-resize");

      handle?.addEventListener("pointerdown", (event) => {
        event.preventDefault();

        this._resizeState = {
          startX: event.clientX,
          width: this.width,
        };

        document.body.classList.add("video-deliver-dock-resizing");

        const move = (moveEvent) => {
          if (!this._resizeState) {
            return;
          }

          this.width = Math.max(
            340,
            Math.min(
              820,
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

          document.body.classList.remove("video-deliver-dock-resizing");

          this._resizeState = null;

          global.videoProject?.setWorkspaceState?.(
            "edit",
            {
              deliverDockWidth: this.width,
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
        "--video-deliver-dock-width",
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
              source: "deliver-studio-dock",
              open: this.opened,
              width: this.width,
            },
          }),
        );
      });
    }

    _svg(name) {
      const icons = {
        deliver:
          '<svg viewBox="0 0 24 24"><path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 18h14v3H5z"/></svg>',
        frame:
          '<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="14"/><path d="M8 9h8v6H8z"/></svg>',
        queue:
          '<svg viewBox="0 0 24 24"><path d="M5 6h14M5 12h10M5 18h7"/><path d="M18 14v6M15 17h6"/></svg>',
        rocket:
          '<svg viewBox="0 0 24 24"><path d="M8 16c5-1 8-4 9-9-5 1-8 4-9 9z"/><path d="M9 15l-4 4 1-5-3-3 5-1M15 9l4-4-5 1-3-3-1 5"/></svg>',
        close:
          '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
        settings:
          '<svg viewBox="0 0 24 24"><path d="M4 7h10M18 7h2M4 12h3M11 12h9M4 17h8M16 17h4"/><circle cx="16" cy="7" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="14" cy="17" r="2"/></svg>',
        preset:
          '<svg viewBox="0 0 24 24"><path d="M5 4h14v16H5z"/><path d="M8 8h8M8 12h5M8 16h7"/></svg>',
        check: '<svg viewBox="0 0 24 24"><path d="M5 12l4 4 10-10"/></svg>',
      };

      return icons[name] || icons.deliver;
    }

    _styles() {
      if (document.getElementById("video-deliver-dock-style")) {
        return;
      }

      const style = document.createElement("style");

      style.id = "video-deliver-dock-style";

      style.textContent = `
   :root{
    --video-deliver-dock-width:460px;
   }

   .video-deliver-studio-dock{
    position:absolute;
    top:0;
    right:0;
    bottom:0;
    width:var(--video-deliver-dock-width);
    min-width:340px;
    max-width:820px;
    display:grid;
    grid-template-rows:34px 29px minmax(0,1fr) 22px;
    box-sizing:border-box;
    border-left:1px solid var(--border-color,#4d4d4d81);
    background:var(--panel-bg,var(--primary-dark,#333));
    color:#fff;
    overflow:visible;
    z-index:40;
   }

   .video-deliver-studio-dock[hidden]{
    display:none!important;
   }

   body.video-deliver-dock-open
   #editor-scene>canvas,
   body.video-deliver-dock-open
   #editor-scene>.renderer-container,
   body.video-deliver-dock-open
   #editor-scene>.viewport-canvas,
   body.video-deliver-dock-open
   #editor-scene>.scene-canvas{
    z-index:0!important;
   }

   body.video-deliver-dock-open
   #video-deliver-studio-dock{
    z-index:40!important;
    visibility:visible!important;
    opacity:1!important;
    pointer-events:auto!important;
   }

   .video-deliver-dock-resize{
    position:absolute;
    left:-4px;
    top:0;
    bottom:0;
    width:8px;
    cursor:col-resize;
   }

   .video-deliver-dock-resize::after{
    content:'';
    position:absolute;
    left:3px;
    top:0;
    bottom:0;
    width:1px;
    background:var(--border-color,#4d4d4d81);
   }

   body.video-deliver-dock-resizing{
    cursor:col-resize!important;
    user-select:none!important;
   }

   .video-deliver-dock-header{
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:6px;
    padding:0 5px 0 7px;
    border-bottom:1px solid var(--border-color,#4d4d4d81);
    background:var(--header-bg,var(--secondary-dark,#3c3c3c));
   }

   .video-deliver-dock-title{
    min-width:0;
    display:flex;
    align-items:center;
    gap:7px;
   }

   .video-deliver-dock-title>span{
    width:18px;
    height:18px;
    color:var(--text-secondary,#b0b0b0);
   }

   .video-deliver-studio-dock svg{
    width:100%;
    height:100%;
    fill:none;
    stroke:currentColor;
    stroke-width:1.65;
    stroke-linecap:round;
    stroke-linejoin:round;
   }

   .video-deliver-dock-title>div{
    min-width:0;
   }

   .video-deliver-dock-title strong,
   .video-deliver-dock-title em{
    display:block;
   }

   .video-deliver-dock-title strong{
    font-size:9px;
   }

   .video-deliver-dock-title em{
    margin-top:1px;
    max-width:220px;
    overflow:hidden;
    text-overflow:ellipsis;
    white-space:nowrap;
    color:var(--text-secondary,#b0b0b0);
    font-style:normal;
    font-size:7px;
   }

   .video-deliver-dock-actions{
    display:flex;
    gap:1px;
   }

   .video-deliver-dock-actions button{
    width:24px;
    height:22px;
    padding:5px;
    border:0;
    background:transparent;
    color:var(--text-secondary,#b0b0b0);
   }

   .video-deliver-dock-actions button.primary{
    background:var(--accent-blue-dark,#474747);
    color:#fff;
   }

   .video-deliver-dock-actions button:hover{
    background:var(--accent-blue-dark,#474747);
    color:#fff;
   }

   .video-deliver-dock-tabs{
    display:flex;
    align-items:center;
    gap:2px;
    padding:0 4px;
    border-bottom:1px solid var(--border-color,#4d4d4d81);
    background:var(--secondary-dark,#3c3c3c);
   }

   .video-deliver-dock-tabs button{
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

   .video-deliver-dock-tabs button svg{
    width:13px;
    height:13px;
   }

   .video-deliver-dock-tabs button:hover,
   .video-deliver-dock-tabs button.active{
    border-color:var(--border-color,#4d4d4d81);
    background:var(--accent-blue-dark,#474747);
    color:#fff;
   }

   .video-deliver-dock-content{
    min-width:0;
    min-height:0;
    overflow:hidden;
    background:var(--primary-dark,#333);
   }

   .video-deliver-dock-status{
    display:flex;
    align-items:center;
    justify-content:space-between;
    padding:0 6px;
    border-top:1px solid var(--border-color,#4d4d4d81);
    background:var(--header-bg,var(--secondary-dark,#3c3c3c));
    color:var(--text-secondary,#b0b0b0);
    font-size:6px;
   }

   .vedel-dock-empty{
    height:100%;
    display:flex;
    flex-direction:column;
    align-items:center;
    justify-content:center;
    gap:5px;
    color:var(--text-secondary,#b0b0b0);
   }

   .vedel-dock-empty strong{
    color:#fff;
    font-size:9px;
   }

   .vedel-dock-empty span{
    font-size:7px;
   }
    /* =========================================================
   DELIVER STUDIO CONTENT THEME
   Uses roots.css tokens
   ========================================================= */

.video-deliver-panel{
    height:100%;
    display:flex;
    flex-direction:column;
    background:var(--panel-bg,#333333);
    color:var(--text-primary,#ffffff);
    font-family:inherit;
    overflow:hidden;
}

.video-deliver-scroll{
    flex:1;
    overflow:auto;
    padding:10px;
    background:var(--panel-bg,#333333);
}

.video-deliver-scroll::-webkit-scrollbar{
    width:10px;
    height:10px;
}
.video-deliver-scroll::-webkit-scrollbar-track{
    background:var(--secondary-dark,#3c3c3c);
}
.video-deliver-scroll::-webkit-scrollbar-thumb{
    background:var(--accent-blue-dark,#474747);
}
.video-deliver-scroll::-webkit-scrollbar-thumb:hover{
    background:var(--accent-blue,#5f5f5f);
}

.video-deliver-toolbar{
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:8px;
    padding:8px 10px;
    border-bottom:1px solid var(--border-color,#4d4d4d81);
    background:var(--header-bg,var(--secondary-dark,#3c3c3c));
}

.video-deliver-toolbar-left,
.video-deliver-toolbar-right{
    display:flex;
    align-items:center;
    gap:6px;
    flex-wrap:wrap;
}

.video-deliver-section{
    margin-bottom:12px;
    border:1px solid var(--border-color,#4d4d4d81);
    background:linear-gradient(
        180deg,
        rgba(255,255,255,0.02) 0%,
        rgba(0,0,0,0.05) 100%
    );
}

.video-deliver-section-header{
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:10px;
    min-height:28px;
    padding:0 10px;
    border-bottom:1px solid var(--border-color,#4d4d4d81);
    background:var(--secondary-dark,#3c3c3c);
}

.video-deliver-section-title{
    font-size:11px;
    font-weight:700;
    letter-spacing:.5px;
    color:var(--text-primary,#ffffff);
    text-transform:uppercase;
}

.video-deliver-section-subtitle{
    font-size:10px;
    color:var(--text-secondary,#b0b0b0);
}

.video-deliver-section-body{
    padding:10px;
}

.video-deliver-tabs-inline{
    display:flex;
    gap:6px;
    flex-wrap:wrap;
    margin-bottom:10px;
}

.video-deliver-tab-chip{
    height:24px;
    padding:0 10px;
    border:1px solid var(--border-color,#4d4d4d81);
    background:var(--primary-dark,#333333);
    color:var(--text-secondary,#b0b0b0);
    font-size:10px;
    display:inline-flex;
    align-items:center;
    justify-content:center;
    cursor:pointer;
}
.video-deliver-tab-chip.active{
    background:var(--accent-blue-dark,#474747);
    color:var(--text-primary,#ffffff);
    border-color:var(--accent-blue,#5f5f5f);
}

.video-deliver-form-grid{
    display:grid;
    grid-template-columns:1fr 1fr;
    gap:10px 12px;
}

.video-deliver-form-grid.single{
    grid-template-columns:1fr;
}

.video-deliver-field{
    display:flex;
    flex-direction:column;
    gap:5px;
    min-width:0;
}

.video-deliver-field.full{
    grid-column:1 / -1;
}

.video-deliver-label-row{
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:8px;
}

.video-deliver-label{
    font-size:10px;
    font-weight:600;
    color:var(--text-secondary,#b0b0b0);
    text-transform:uppercase;
    letter-spacing:.35px;
}

.video-deliver-help{
    font-size:10px;
    color:var(--text-dim,#8f8f8f);
}

.video-deliver-input,
.video-deliver-select,
.video-deliver-textarea{
    width:100%;
    min-height:30px;
    padding:0 9px;
    border:1px solid var(--border-color,#4d4d4d81);
    background:var(--primary-dark,#333333);
    color:var(--text-primary,#ffffff);
    outline:none;
    box-sizing:border-box;
    font-size:12px;
    transition:border-color .15s ease, background .15s ease;
}

.video-deliver-textarea{
    min-height:72px;
    padding:8px 9px;
    resize:vertical;
}

.video-deliver-input:hover,
.video-deliver-select:hover,
.video-deliver-textarea:hover{
    border-color:var(--accent-blue,#5f5f5f);
}

.video-deliver-input:focus,
.video-deliver-select:focus,
.video-deliver-textarea:focus{
    border-color:var(--accent-blue,#5f5f5f);
    background:var(--secondary-dark,#3c3c3c);
}

.video-deliver-inline{
    display:flex;
    align-items:center;
    gap:8px;
}

.video-deliver-inline .video-deliver-input,
.video-deliver-inline .video-deliver-select{
    flex:1;
}

.video-deliver-suffix{
    min-width:34px;
    text-align:right;
    font-size:10px;
    color:var(--text-dim,#8f8f8f);
}

.video-deliver-check{
    display:flex;
    align-items:flex-start;
    justify-content:space-between;
    gap:12px;
    padding:8px 10px;
    border:1px solid var(--border-color,#4d4d4d81);
    background:rgba(255,255,255,0.02);
}

.video-deliver-check-info{
    display:flex;
    flex-direction:column;
    gap:2px;
}

.video-deliver-check-title{
    font-size:11px;
    font-weight:600;
    color:var(--text-primary,#ffffff);
}

.video-deliver-check-desc{
    font-size:10px;
    color:var(--text-secondary,#b0b0b0);
}

.video-deliver-checkbox{
    width:16px;
    height:16px;
    accent-color:#6ea0ff;
    cursor:pointer;
    margin-top:2px;
}

.video-deliver-chips{
    display:flex;
    flex-wrap:wrap;
    gap:6px;
}

.video-deliver-chip{
    display:inline-flex;
    align-items:center;
    justify-content:center;
    min-height:24px;
    padding:0 8px;
    border:1px solid var(--border-color,#4d4d4d81);
    background:var(--primary-dark,#333333);
    color:var(--text-secondary,#b0b0b0);
    font-size:10px;
    cursor:pointer;
    user-select:none;
}
.video-deliver-chip:hover{
    border-color:var(--accent-blue,#5f5f5f);
    color:var(--text-primary,#ffffff);
}
.video-deliver-chip.active{
    background:var(--accent-blue-dark,#474747);
    border-color:var(--accent-blue,#5f5f5f);
    color:var(--text-primary,#ffffff);
}

.video-deliver-estimate-grid{
    display:grid;
    grid-template-columns:repeat(2,minmax(0,1fr));
    gap:10px;
}

.video-deliver-estimate-card{
    min-height:78px;
    border:1px solid var(--border-color,#4d4d4d81);
    background:var(--primary-dark,#333333);
    display:flex;
    flex-direction:column;
    justify-content:space-between;
    padding:10px;
}

.video-deliver-estimate-label{
    font-size:10px;
    color:var(--text-secondary,#b0b0b0);
    text-transform:uppercase;
    letter-spacing:.35px;
}

.video-deliver-estimate-value{
    font-size:16px;
    font-weight:700;
    color:var(--text-primary,#ffffff);
}

.video-deliver-estimate-sub{
    font-size:10px;
    color:var(--text-dim,#8f8f8f);
}

.video-deliver-actions{
    display:flex;
    flex-wrap:wrap;
    gap:8px;
    margin-top:12px;
}

.video-deliver-btn{
    min-width:120px;
    height:30px;
    padding:0 12px;
    border:1px solid var(--border-color,#4d4d4d81);
    background:var(--primary-dark,#333333);
    color:var(--text-primary,#ffffff);
    cursor:pointer;
    font-size:11px;
    font-weight:600;
}

.video-deliver-btn:hover{
    background:var(--secondary-dark,#3c3c3c);
    border-color:var(--accent-blue,#5f5f5f);
}

.video-deliver-btn.primary{
    background:var(--accent-blue-dark,#474747);
    border-color:var(--accent-blue,#5f5f5f);
}

.video-deliver-btn.primary:hover{
    background:var(--accent-blue,#5f5f5f);
}

.video-deliver-btn.ghost{
    color:var(--text-secondary,#b0b0b0);
}

.video-deliver-divider{
    height:1px;
    margin:10px 0;
    background:var(--border-color,#4d4d4d81);
}

.video-deliver-muted{
    color:var(--text-secondary,#b0b0b0);
    font-size:10px;
}

.video-deliver-kpi{
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:10px;
    min-height:30px;
    padding:0 10px;
    border:1px solid var(--border-color,#4d4d4d81);
    background:rgba(255,255,255,0.02);
}

.video-deliver-kpi strong{
    color:var(--text-primary,#ffffff);
    font-size:11px;
}

.video-deliver-kpi span{
    color:var(--text-secondary,#b0b0b0);
    font-size:10px;
}

@media (max-width: 700px){
    .video-deliver-form-grid,
    .video-deliver-estimate-grid{
        grid-template-columns:1fr;
    }
}
  `;

      document.head.appendChild(style);
    }
  }

  global.VideoDeliverDockManager = VideoDeliverDockManager;

  global.ensureVideoDeliverDockManager =
    function ensureVideoDeliverDockManager() {
      if (!global.videoDeliverDockManager) {
        global.videoDeliverDockManager = new VideoDeliverDockManager();
      }

      return global.videoDeliverDockManager;
    };

  global.ensureVideoDeliverDockManager();
})(window);
