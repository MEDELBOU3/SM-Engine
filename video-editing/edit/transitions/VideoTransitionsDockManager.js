/**
 * VideoTransitionsDockManager.js
 * SM Engine — professional Transitions Studio dock.
 *
 * Shared right-side slot:
 * Viewport / Sequencer | Transitions Studio | Inspector
 *
 * Tabs:
 * TRANSITIONS | APPLIED | CONTROLS | PRESETS
 */
(function (global) {
  "use strict";

  class VideoTransitionsDockManager {
    constructor() {
      this.manager = global.videoTransitionsManager;

      this.panel = null;
      this.host = null;
      this.content = null;
      this.opened = false;

      this.activeTab =
        global.videoProject?.workspace?.perWorkspace?.edit
          ?.transitionsDockTab || "transitions";

      this.targetMode =
        global.videoProject?.workspace?.perWorkspace?.edit
          ?.transitionTargetMode || "between";

      this.defaultDuration = Number(
        global.videoProject?.workspace?.perWorkspace?.edit
          ?.transitionDefaultDuration ||
          this.manager?.duration ||
          0.5,
      );

      this.width = Number(
        global.videoProject?.workspace?.perWorkspace?.edit
          ?.transitionsDockWidth || 430,
      );

      this.instance = null;
      this._resizeState = null;
      this._layoutSnapshot = null;

      this._managerUnsub = this.manager?.subscribe?.((event) => {
        if (!this.opened) {
          return;
        }

        if (["option", "duration"].includes(event?.type)) {
          this._syncHeader();
          return;
        }

        this.refresh();

        global.videoTransitionInspectorPanel?.render?.();
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

      /*
       * All professional right-side workspaces share this same physical slot.
       */
      global.videoNodeEditorManager?.close?.();

      global.audioStudioDockManager?.close?.();

      global.colorStudioDockManager?.close?.();

      global.videoEffectsDockManager?.close?.();

      global.videoProjectDockManager?.close?.();

      global.videoDeliverDockManager?.close?.();

      this.manager = global.videoTransitionsManager || this.manager;

      this.host = document.getElementById("editor-scene");

      if (!this.host) {
        console.warn("[TransitionsStudioDock] #editor-scene not found.");

        return false;
      }

      this._ensurePanel();

      if (
        this.panel.parentElement === this.host &&
        this.host.lastElementChild !== this.panel
      ) {
        this.host.appendChild(this.panel);
      }

      if (options.target) {
        this.targetMode = options.target;
      }

      if (Number.isFinite(Number(options.duration))) {
        this.defaultDuration = Math.max(0.03, Number(options.duration));
      }

      this.opened = true;

      this.panel.hidden = false;
      this.panel.style.display = "grid";
      this.panel.style.visibility = "visible";
      this.panel.style.opacity = "1";
      this.panel.style.pointerEvents = "auto";

      document.body.classList.add("video-transitions-dock-open");

      document.body.classList.remove(
        "video-node-editor-open",
        "video-audio-dock-open",
        "video-color-dock-open",
        "video-effects-dock-open",
      );

      this._applyWidth();
      this._applyDockLayout();

      this.setTab(options.tab || this.activeTab || "transitions");

      this._syncHeader();
      this._refreshLayout();

      return true;
    }

    close() {
      this.opened = false;

      document.body.classList.remove(
        "video-transitions-dock-open",
        "video-transitions-dock-resizing",
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
      const allowed = ["transitions", "applied", "controls", "presets"];

      this.activeTab = allowed.includes(tab) ? tab : "transitions";

      this._renderActiveTab();
      this._syncTabs();

      global.videoProject?.setWorkspaceState?.(
        "edit",
        {
          transitionsDockTab: this.activeTab,
          transitionTargetMode: this.targetMode,
          transitionDefaultDuration: this.defaultDuration,
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

      panel.id = "video-transitions-studio-dock";

      panel.className = "video-transitions-studio-dock";

      panel.innerHTML = `
   <div class="video-transitions-dock-resize"></div>

   <header class="video-transitions-dock-header">
    <div class="video-transitions-dock-title">
     <span>${this.manager.library.icon("transitions")}</span>

     <div>
      <strong>Transitions Studio</strong>
      <em data-transitions-dock-subtitle>No clip selected</em>
     </div>
    </div>

    <div class="video-transitions-dock-actions">
     <button
      type="button"
      data-transitions-action="copy"
      title="Copy selected transition">
      ${this._svg("copy")}
     </button>

     <button
      type="button"
      data-transitions-action="paste"
      title="Paste transition">
      ${this._svg("paste")}
     </button>

     <button
      type="button"
      data-transitions-action="close"
      title="Close">
      ${this._svg("close")}
     </button>
    </div>
   </header>

   <nav class="video-transitions-dock-tabs">
    <button
     type="button"
     data-transitions-tab="transitions">
     ${this.manager.library.icon("transitions")}
     <span>TRANSITIONS</span>
    </button>

    <button
     type="button"
     data-transitions-tab="applied">
     ${this._svg("applied")}
     <span>APPLIED</span>
    </button>

    <button
     type="button"
     data-transitions-tab="controls">
     ${this._svg("controls")}
     <span>CONTROLS</span>
    </button>

    <button
     type="button"
     data-transitions-tab="presets">
     ${this._svg("preset")}
     <span>PRESETS</span>
    </button>
   </nav>

   <div class="video-transitions-dock-content"></div>

   <footer class="video-transitions-dock-status">
    <span data-transitions-status>Ready</span>
    <span data-transitions-summary>0 transitions</span>
   </footer>
  `;

      this.host.appendChild(panel);

      this.panel = panel;

      this.content = panel.querySelector(".video-transitions-dock-content");

      this._bindPanel();
    }

    _renderActiveTab() {
      if (!this.content || !this.manager) {
        return;
      }

      this._destroyInstance();

      this.content.innerHTML = "";

      if (this.activeTab === "transitions") {
        this.instance = new global.VideoTransitionsBrowserPanel(this.manager);

        this.instance.mount(this.content);

        return;
      }

      if (this.activeTab === "controls") {
        this.instance = new global.VideoTransitionControlsPanel(this.manager);

        this.instance.mount(this.content);

        return;
      }

      if (this.activeTab === "applied") {
        this._renderApplied();

        return;
      }

      this._renderPresets();
    }

    _renderApplied() {
      const clip = this.manager.selectedClip();

      if (!clip) {
        this.content.innerHTML = `
    <div class="vetr-dock-empty">
     <strong>No clip selected</strong>
     <span>Select a clip to inspect its IN / OUT transitions.</span>
    </div>
   `;

        return;
      }

      const transitions = this.manager.ensure(clip);

      const prev = this.manager.adjacent(clip, "previous");

      const next = this.manager.adjacent(clip, "next");

      this.content.innerHTML = `
   <div class="vetr-applied-panel">
    <header>
     <div>
      <strong>APPLIED TRANSITIONS</strong>
      <span>${this._esc(clip.name || "Selected Clip")}</span>
     </div>

     <button
      type="button"
      data-clear-all>
      ${this._svg("trash")}
      CLEAR
     </button>
    </header>

    <div class="vetr-cut-map">
     <article>
      <em>PREVIOUS</em>
      <strong>${this._esc(prev?.name || "—")}</strong>
     </article>

     <div class="vetr-cut-line"></div>

     <article class="selected">
      <em>SELECTED</em>
      <strong>${this._esc(clip.name || clip.id)}</strong>
     </article>

     <div class="vetr-cut-line"></div>

     <article>
      <em>NEXT</em>
      <strong>${this._esc(next?.name || "—")}</strong>
     </article>
    </div>

    <div class="vetr-applied-list">
     ${this._appliedCard(clip, "in", transitions.in)}

     ${this._appliedCard(clip, "out", transitions.out)}
    </div>

    <div class="vetr-applied-actions">
     <button
      type="button"
      data-quick-cross>
      ${this.manager.library.icon("dissolve")}
      CROSS DISSOLVE TO NEXT
     </button>

     <button
      type="button"
      data-go-browser>
      ${this.manager.library.icon("transitions")}
      BROWSE
     </button>
    </div>
   </div>
  `;

      this.content
        .querySelector("[data-clear-all]")
        ?.addEventListener("click", () => {
          this.manager.clearClip(clip);

          this._renderApplied();
        });

      this.content
        .querySelector("[data-go-browser]")
        ?.addEventListener("click", () => {
          this.setTab("transitions");
        });

      this.content
        .querySelector("[data-quick-cross]")
        ?.addEventListener("click", () => {
          const adjacent = this.manager.adjacent(clip, "next");

          if (!adjacent) {
            this._status("No adjacent clip on the same track.");

            return;
          }

          this.manager.applyBetween(
            clip,
            adjacent,
            "cross-dissolve",
            this.defaultDuration,
          );

          this.setTab("controls");
        });

      this.content.querySelectorAll("[data-applied-card]").forEach((card) => {
        const edge = card.dataset.appliedCard;

        card
          .querySelector("[data-select-transition]")
          ?.addEventListener("click", () => {
            this.manager.select(clip.id, edge);

            this.setTab("controls");

            global.videoTransitionInspectorPanel?.render?.();
          });

        card
          .querySelector("[data-remove-transition]")
          ?.addEventListener("click", () => {
            this.manager.remove(clip, edge);

            this._renderApplied();
          });
      });
    }

    _appliedCard(clip, edge, transition) {
      if (!transition) {
        return `
    <article
     class="vetr-applied-card empty"
     data-applied-card="${edge}">
     <header>
      <strong>${edge.toUpperCase()}</strong>
      <em>NONE</em>
     </header>

     <div>
      <span>No ${edge.toUpperCase()} transition</span>
     </div>
    </article>
   `;
      }

      const def = this.manager.library.get(transition.id);

      return `
   <article
    class="vetr-applied-card ${this.manager.selectedRef?.clipId === clip.id && this.manager.selectedRef?.edge === edge ? "selected" : ""}"
    data-applied-card="${edge}">
    <header>
     <strong>${edge.toUpperCase()}</strong>
     <em>${transition.pairId ? "PAIRED CUT" : "EDGE"}</em>
    </header>

    <div class="vetr-applied-main">
     <span class="vetr-applied-icon">
      ${this.manager.library.icon(def?.icon || "transitions")}
     </span>

     <div>
      <strong>${this._esc(def?.name || transition.name || transition.id)}</strong>
      <em>${Number(transition.duration || 0.5).toFixed(2)} s · ${transition.easing || "ease-in-out"}</em>
     </div>
    </div>

    <footer>
     <button
      type="button"
      data-select-transition>
      ${this._svg("controls")}
      EDIT
     </button>

     <button
      type="button"
      data-remove-transition>
      ${this._svg("trash")}
      REMOVE
     </button>
    </footer>
   </article>
  `;
    }

    _renderPresets() {
      const presets = global.ensureVideoTransitionsPresetManager?.();

      const list = presets?.list?.() || [];

      this.content.innerHTML = `
   <div class="vetr-presets-panel">
    <header>
     <div>
      <strong>TRANSITION PRESETS</strong>
      <span>Project-local transition presets</span>
     </div>

     <button
      type="button"
      data-save-preset>
      ${this._svg("save")}
      SAVE SELECTED
     </button>
    </header>

    <div class="vetr-preset-list">
     ${
       list.length
         ? list
             .map(
               (preset) => `
       <article
        class="vetr-preset-card"
        data-preset="${preset.id}">
        <span>
         ${this.manager.library.icon(
           this.manager.library.get(preset.transition?.id)?.icon ||
             "transitions",
         )}
        </span>

        <div>
         <strong>${this._esc(preset.name)}</strong>
         <em>${this._esc(preset.transition?.name || preset.transition?.id || "Transition")}</em>
        </div>

        <button
         type="button"
         data-apply-preset>
         APPLY
        </button>

        <button
         type="button"
         data-delete-preset>
         ${this._svg("trash")}
        </button>
       </article>
      `,
             )
             .join("")
         : `
       <div class="vetr-dock-empty">
        <strong>No presets</strong>
        <span>Save the currently selected transition.</span>
       </div>
      `
     }
    </div>
   </div>
  `;

      this.content
        .querySelector("[data-save-preset]")
        ?.addEventListener("click", () => {
          const name = prompt("Transition preset name");

          if (name && presets.save(name)) {
            this._renderPresets();
          }
        });

      this.content.querySelectorAll("[data-preset]").forEach((card) => {
        const id = card.dataset.preset;

        card
          .querySelector("[data-apply-preset]")
          ?.addEventListener("click", () => {
            const result = presets.apply(id, this.targetMode);

            if (result) {
              this.setTab("controls");
            } else {
              this._status("Could not apply preset to current target.");
            }
          });

        card
          .querySelector("[data-delete-preset]")
          ?.addEventListener("click", () => {
            presets.remove(id);

            this._renderPresets();
          });
      });
    }

    _destroyInstance() {
      this.instance?.destroy?.();

      this.instance = null;
    }

    _syncHeader() {
      const clip = this.manager?.selectedClip?.();

      const subtitle = this.panel?.querySelector(
        "[data-transitions-dock-subtitle]",
      );

      if (subtitle) {
        subtitle.textContent = clip
          ? clip.name || "Selected Clip"
          : "No clip selected";
      }

      const summary = this.panel?.querySelector("[data-transitions-summary]");

      if (summary) {
        if (!clip) {
          summary.textContent = "0 transitions";
        } else {
          const t = this.manager.ensure(clip);

          const count = Number(!!t.in) + Number(!!t.out);

          summary.textContent = `${count} transition${count === 1 ? "" : "s"}`;
        }
      }

      const status = this.panel?.querySelector("[data-transitions-status]");

      if (status) {
        status.textContent =
          this.activeTab === "transitions"
            ? `Browser · Target ${this.targetMode.toUpperCase()}`
            : this.activeTab === "applied"
              ? "Applied Transitions"
              : this.activeTab === "controls"
                ? "Transition Controls"
                : "Transition Presets";
      }
    }

    _status(text) {
      const status = this.panel?.querySelector("[data-transitions-status]");

      if (status) {
        status.textContent = text;
      }
    }

    _syncTabs() {
      this.panel
        ?.querySelectorAll("[data-transitions-tab]")
        .forEach((button) => {
          button.classList.toggle(
            "active",
            button.dataset.transitionsTab === this.activeTab,
          );
        });
    }

    _bindPanel() {
      this.panel.addEventListener("click", (event) => {
        const tab = event.target.closest("[data-transitions-tab]")?.dataset
          ?.transitionsTab;

        if (tab) {
          this.setTab(tab);

          return;
        }

        const action = event.target.closest("[data-transitions-action]")
          ?.dataset?.transitionsAction;

        if (action === "close") {
          this.close();
        }

        if (action === "copy") {
          this.manager.duplicateSelected?.();
        }

        if (action === "paste") {
          const result = this.manager.pasteToSelection(
            this.targetMode === "between" ? "out" : this.targetMode,
          );

          if (result) {
            this.setTab("controls");
          }
        }
      });

      const handle = this.panel.querySelector(".video-transitions-dock-resize");

      handle?.addEventListener("pointerdown", (event) => {
        event.preventDefault();

        this._resizeState = {
          startX: event.clientX,

          width: this.width,
        };

        document.body.classList.add("video-transitions-dock-resizing");

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

          document.body.classList.remove("video-transitions-dock-resizing");

          this._resizeState = null;

          global.videoProject?.setWorkspaceState?.(
            "edit",
            {
              transitionsDockWidth: this.width,
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
        "--video-transitions-dock-width",
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
              source: "transitions-studio-dock",

              open: this.opened,

              width: this.width,
            },
          }),
        );
      });
    }

    _svg(name) {
      const icons = {
        close:
          '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
        copy: '<svg viewBox="0 0 24 24"><rect x="8" y="8" width="11" height="11"/><path d="M16 8V5H5v11h3"/></svg>',
        paste:
          '<svg viewBox="0 0 24 24"><path d="M9 5h6M9 3h6v4H9z"/><rect x="5" y="5" width="14" height="16"/></svg>',
        applied:
          '<svg viewBox="0 0 24 24"><path d="M4 8h6l2 4-2 4H4M20 8h-6l-2 4 2 4h6"/></svg>',
        controls:
          '<svg viewBox="0 0 24 24"><path d="M4 7h10M18 7h2M4 12h3M11 12h9M4 17h8M16 17h4"/><circle cx="16" cy="7" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="14" cy="17" r="2"/></svg>',
        preset:
          '<svg viewBox="0 0 24 24"><path d="M5 4h14v16H5z"/><path d="M8 8h8M8 12h5M8 16h7"/></svg>',
        trash:
          '<svg viewBox="0 0 24 24"><path d="M5 7h14M9 7V4h6v3M8 10v8M12 10v8M16 10v8M7 7l1 14h8l1-14"/></svg>',
        save: '<svg viewBox="0 0 24 24"><path d="M5 4h12l2 2v14H5z"/><path d="M8 4v6h8V4M8 16h8"/></svg>',
      };

      return icons[name] || icons.controls;
    }

    _esc(value) {
      return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
    }

    _styles() {
      if (document.getElementById("video-transitions-dock-style")) {
        return;
      }

      const style = document.createElement("style");

      style.id = "video-transitions-dock-style";

      style.textContent = `
   :root{
    --video-transitions-dock-width:430px;
   }

   .video-transitions-studio-dock{
    position:absolute;
    top:0;
    right:0;
    bottom:0;
    width:var(--video-transitions-dock-width);
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

   .video-transitions-studio-dock[hidden]{
    display:none!important;
   }

   body.video-transitions-dock-open
   #editor-scene>canvas,
   body.video-transitions-dock-open
   #editor-scene>.renderer-container,
   body.video-transitions-dock-open
   #editor-scene>.viewport-canvas,
   body.video-transitions-dock-open
   #editor-scene>.scene-canvas{
    z-index:0!important;
   }

   body.video-transitions-dock-open
   #video-transitions-studio-dock{
    z-index:40!important;
    visibility:visible!important;
    opacity:1!important;
    pointer-events:auto!important;
   }

   .video-transitions-dock-resize{
    position:absolute;
    left:-4px;
    top:0;
    bottom:0;
    width:8px;
    cursor:col-resize;
   }

   .video-transitions-dock-resize::after{
    content:'';
    position:absolute;
    left:3px;
    top:0;
    bottom:0;
    width:1px;
    background:var(--border-color,#4d4d4d81);
   }

   body.video-transitions-dock-resizing{
    cursor:col-resize!important;
    user-select:none!important;
   }

   .video-transitions-dock-header{
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:6px;
    padding:0 5px 0 7px;
    border-bottom:1px solid var(--border-color,#4d4d4d81);
    background:var(--header-bg,var(--secondary-dark,#3c3c3c));
   }

   .video-transitions-dock-title{
    min-width:0;
    display:flex;
    align-items:center;
    gap:7px;
   }

   .video-transitions-dock-title>span{
    width:18px;
    height:18px;
    color:var(--text-secondary,#b0b0b0);
   }

   .video-transitions-studio-dock svg{
    width:100%;
    height:100%;
    fill:none;
    stroke:currentColor;
    stroke-width:1.65;
    stroke-linecap:round;
    stroke-linejoin:round;
   }

   .video-transitions-dock-title>div{
    min-width:0;
   }

   .video-transitions-dock-title strong,
   .video-transitions-dock-title em{
    display:block;
   }

   .video-transitions-dock-title strong{
    font-size:9px;
   }

   .video-transitions-dock-title em{
    margin-top:1px;
    max-width:220px;
    overflow:hidden;
    text-overflow:ellipsis;
    white-space:nowrap;
    color:var(--text-secondary,#b0b0b0);
    font-style:normal;
    font-size:7px;
   }

   .video-transitions-dock-actions{
    display:flex;
    gap:1px;
   }

   .video-transitions-dock-actions button{
    width:24px;
    height:22px;
    padding:5px;
    border:0;
    background:transparent;
    color:var(--text-secondary,#b0b0b0);
   }

   .video-transitions-dock-actions button:hover{
    background:var(--accent-blue-dark,#474747);
    color:#fff;
   }

   .video-transitions-dock-tabs{
    display:flex;
    align-items:center;
    gap:2px;
    padding:0 4px;
    border-bottom:1px solid var(--border-color,#4d4d4d81);
    background:var(--secondary-dark,#3c3c3c);
   }

   .video-transitions-dock-tabs button{
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

   .video-transitions-dock-tabs button svg{
    width:13px;
    height:13px;
   }

   .video-transitions-dock-tabs button:hover,
   .video-transitions-dock-tabs button.active{
    border-color:var(--border-color,#4d4d4d81);
    background:var(--accent-blue-dark,#474747);
    color:#fff;
   }

   .video-transitions-dock-content{
    min-width:0;
    min-height:0;
    overflow:hidden;
    background:var(--primary-dark,#333);
   }

   .video-transitions-dock-status{
    display:flex;
    align-items:center;
    justify-content:space-between;
    padding:0 6px;
    border-top:1px solid var(--border-color,#4d4d4d81);
    background:var(--header-bg,var(--secondary-dark,#3c3c3c));
    color:var(--text-secondary,#b0b0b0);
    font-size:6px;
   }

   .vetr-applied-panel,
   .vetr-presets-panel{
    height:100%;
    display:grid;
    grid-template-rows:36px auto minmax(0,1fr) auto;
    overflow:hidden;
   }

   .vetr-presets-panel{
    grid-template-rows:36px minmax(0,1fr);
   }

   .vetr-applied-panel>header,
   .vetr-presets-panel>header{
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:6px;
    padding:0 6px;
    border-bottom:1px solid var(--border-color,#4d4d4d81);
    background:var(--header-bg,var(--secondary-dark,#3c3c3c));
   }

   .vetr-applied-panel>header strong,
   .vetr-applied-panel>header span,
   .vetr-presets-panel>header strong,
   .vetr-presets-panel>header span{
    display:block;
   }

   .vetr-applied-panel>header strong,
   .vetr-presets-panel>header strong{
    font-size:8px;
   }

   .vetr-applied-panel>header span,
   .vetr-presets-panel>header span{
    margin-top:2px;
    color:var(--text-secondary,#b0b0b0);
    font-size:7px;
   }

   .vetr-applied-panel>header button,
   .vetr-presets-panel>header button,
   .vetr-applied-actions button{
    min-height:21px;
    display:flex;
    align-items:center;
    justify-content:center;
    gap:4px;
    padding:0 6px;
    border:1px solid var(--border-color,#4d4d4d81);
    border-radius:0;
    background:var(--bg-button,#363636);
    color:var(--text-secondary,#b0b0b0);
    font-size:7px;
   }

   .vetr-applied-panel>header svg,
   .vetr-presets-panel>header svg,
   .vetr-applied-actions svg{
    width:12px;
    height:12px;
   }

   .vetr-cut-map{
    display:grid;
    grid-template-columns:minmax(0,1fr) 18px minmax(0,1fr) 18px minmax(0,1fr);
    align-items:center;
    gap:2px;
    padding:7px;
    border-bottom:1px solid var(--border-color,#4d4d4d81);
   }

   .vetr-cut-map article{
    min-width:0;
    min-height:46px;
    display:flex;
    flex-direction:column;
    justify-content:center;
    padding:0 6px;
    border:1px solid var(--border-color,#4d4d4d81);
    background:var(--panel-bg,#333);
   }

   .vetr-cut-map article.selected{
    background:var(--secondary-dark,#3c3c3c);
   }

   .vetr-cut-map em,
   .vetr-cut-map strong{
    display:block;
    overflow:hidden;
    text-overflow:ellipsis;
    white-space:nowrap;
   }

   .vetr-cut-map em{
    color:var(--text-secondary,#b0b0b0);
    font-style:normal;
    font-size:6px;
   }

   .vetr-cut-map strong{
    margin-top:3px;
    font-size:7px;
   }

   .vetr-cut-line{
    height:1px;
    background:var(--text-secondary,#b0b0b0);
   }

   .vetr-applied-list{
    overflow:auto;
    padding:6px;
   }

   .vetr-applied-card{
    margin-bottom:5px;
    border:1px solid var(--border-color,#4d4d4d81);
    background:var(--panel-bg,#333);
   }

   .vetr-applied-card.selected{
    outline:1px solid var(--text-primary,#fff);
    outline-offset:1px;
   }

   .vetr-applied-card>header{
    height:23px;
    display:flex;
    align-items:center;
    justify-content:space-between;
    padding:0 6px;
    border-bottom:1px solid var(--border-color,#4d4d4d40);
    background:var(--secondary-dark,#3c3c3c);
   }

   .vetr-applied-card>header strong{
    font-size:7px;
   }

   .vetr-applied-card>header em{
    color:var(--text-secondary,#b0b0b0);
    font-style:normal;
    font-size:6px;
   }

   .vetr-applied-main{
    min-height:49px;
    display:grid;
    grid-template-columns:24px minmax(0,1fr);
    align-items:center;
    gap:6px;
    padding:5px 6px;
   }

   .vetr-applied-icon{
    width:20px;
    height:20px;
    color:var(--text-secondary,#b0b0b0);
   }

   .vetr-applied-main strong,
   .vetr-applied-main em{
    display:block;
   }

   .vetr-applied-main strong{
    font-size:8px;
   }

   .vetr-applied-main em{
    margin-top:2px;
    color:var(--text-secondary,#b0b0b0);
    font-style:normal;
    font-size:6px;
   }

   .vetr-applied-card>footer{
    display:flex;
    justify-content:flex-end;
    gap:3px;
    padding:4px 5px;
    border-top:1px solid var(--border-color,#4d4d4d40);
   }

   .vetr-applied-card>footer button{
    height:20px;
    display:flex;
    align-items:center;
    gap:3px;
    padding:0 5px;
    border:1px solid var(--border-color,#4d4d4d81);
    border-radius:0;
    background:var(--bg-button,#363636);
    color:var(--text-secondary,#b0b0b0);
    font-size:6px;
   }

   .vetr-applied-card>footer svg{
    width:11px;
    height:11px;
   }

   .vetr-applied-card.empty>div{
    padding:14px 6px;
    color:var(--text-secondary,#b0b0b0);
    font-size:7px;
   }

   .vetr-applied-actions{
    display:grid;
    grid-template-columns:1fr 1fr;
    gap:4px;
    padding:6px;
    border-top:1px solid var(--border-color,#4d4d4d81);
   }

   .vetr-preset-list{
    overflow:auto;
    padding:6px;
   }

   .vetr-preset-card{
    min-height:39px;
    display:grid;
    grid-template-columns:20px minmax(0,1fr) 42px 22px;
    align-items:center;
    gap:5px;
    margin-bottom:4px;
    padding:4px 5px;
    border:1px solid var(--border-color,#4d4d4d81);
    background:var(--panel-bg,#333);
   }

   .vetr-preset-card>span{
    width:16px;
    height:16px;
    color:var(--text-secondary,#b0b0b0);
   }

   .vetr-preset-card div{
    min-width:0;
   }

   .vetr-preset-card strong,
   .vetr-preset-card em{
    display:block;
    overflow:hidden;
    text-overflow:ellipsis;
    white-space:nowrap;
   }

   .vetr-preset-card strong{
    font-size:8px;
   }

   .vetr-preset-card em{
    margin-top:2px;
    color:var(--text-secondary,#b0b0b0);
    font-style:normal;
    font-size:6px;
   }

   .vetr-preset-card button{
    height:20px;
    border:1px solid var(--border-color,#4d4d4d81);
    border-radius:0;
    background:var(--bg-button,#363636);
    color:var(--text-secondary,#b0b0b0);
    font-size:7px;
   }

   .vetr-preset-card button:last-child{
    width:20px;
    padding:4px;
    border:0;
    background:transparent;
   }

   .vetr-dock-empty{
    min-height:120px;
    display:flex;
    flex-direction:column;
    align-items:center;
    justify-content:center;
    gap:5px;
    color:var(--text-secondary,#b0b0b0);
    text-align:center;
   }

   .vetr-dock-empty strong{
    color:#fff;
    font-size:9px;
   }

   .vetr-dock-empty span{
    font-size:7px;
   }
  `;

      document.head.appendChild(style);
    }
  }

  global.VideoTransitionsDockManager = VideoTransitionsDockManager;

  global.ensureVideoTransitionsDockManager =
    function ensureVideoTransitionsDockManager() {
      if (!global.videoTransitionsDockManager) {
        global.videoTransitionsDockManager = new VideoTransitionsDockManager();
      }

      return global.videoTransitionsDockManager;
    };

  global.ensureVideoTransitionsDockManager();
})(window);
