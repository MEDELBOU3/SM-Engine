/**
 * VideoInspectorSidebarManager.js — V2 HOTFIX
 *
 * IMPORTANT:
 * InspectorPanel.renderDefaultInspector() rebuilds #inspector-panel with innerHTML.
 * That destroys the old #video-inspector-sidebar-tools node.
 *
 * This V2 manager NEVER trusts an old DOM reference:
 * - it remounts against the current .inspector-sidebar
 * - it observes #inspector-panel rebuilds
 * - it restores the active video panel after a rebuild
 * - video buttons are visible whenever body.video-editing-mode is active
 */
(function (global) {
  "use strict";

  const VIDEO_INSPECTOR_SVG_ICONS = Object.freeze({
    clip: `
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 7h10"/>
                <path d="M18 7h2"/>
                <circle cx="16" cy="7" r="2"/>
                <path d="M4 17h2"/>
                <path d="M10 17h10"/>
                <circle cx="8" cy="17" r="2"/>
                <path d="M4 12h5"/>
                <path d="M13 12h7"/>
                <circle cx="11" cy="12" r="2"/>
            </svg>`,

    effects: `
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M15 4l5 5"/>
                <path d="M14 5l-9.5 9.5a2.1 2.1 0 0 0 0 3l2 2a2.1 2.1 0 0 0 3 0L19 10"/>
                <path d="M6 4v3"/>
                <path d="M4.5 5.5h3"/>
                <path d="M18 15v4"/>
                <path d="M16 17h4"/>
                <path d="M12 2v2"/>
                <path d="M11 3h2"/>
            </svg>`,

    fusion: `
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="3" y="4" width="6" height="5"/>
                <rect x="15" y="15" width="6" height="5"/>
                <path d="M9 6.5h3c3 0 3 11 6 11h-3"/>
                <circle cx="12" cy="6.5" r="1.2"/>
                <circle cx="12" cy="17.5" r="1.2"/>
            </svg>`,

    transitions: `
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 7h5l3 3 3-3h5"/>
                <path d="M17 4l3 3-3 3"/>
                <path d="M4 17h5l3-3 3 3h5"/>
                <path d="M17 14l3 3-3 3"/>
            </svg>`,

    color: `
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="9"/>
                <path d="M12 3a9 9 0 0 1 0 18"/>
                <path d="M4.5 7.5h15"/>
                <path d="M4.5 16.5h15"/>
            </svg>`,

    audio: `
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M5 10v4"/>
                <path d="M9 7v10"/>
                <path d="M13 4v16"/>
                <path d="M17 8v8"/>
                <path d="M21 10v4"/>
            </svg>`,

    project: `
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19 12a7 7 0 0 0-.08-1l2.02-1.57-2-3.46-2.48 1a7.6 7.6 0 0 0-1.73-1L14.36 3h-4.72l-.37 2.97a7.6 7.6 0 0 0-1.73 1l-2.48-1-2 3.46L5.08 11A7 7 0 0 0 5 12c0 .34.03.67.08 1l-2.02 1.57 2 3.46 2.48-1a7.6 7.6 0 0 0 1.73 1L9.64 21h4.72l.37-2.97a7.6 7.6 0 0 0 1.73-1l2.48 1 2-3.46L18.92 13c.05-.33.08-.66.08-1z"/>
            </svg>`,

    render: `
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 3v11"/>
                <path d="M8 10l4 4 4-4"/>
                <path d="M5 16v4h14v-4"/>
            </svg>`,

    info: `
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="9"/>
                <path d="M12 10v6"/>
                <path d="M12 7h.01"/>
            </svg>`,

    warning: `
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 3l10 18H2L12 3z"/>
                <path d="M12 9v5"/>
                <path d="M12 17h.01"/>
            </svg>`,
  });

  class VideoInspectorSidebarManager {
    constructor() {
      this.panels = new Map();
      this.activePanelId = null;
      this.lastPanelId = "clip";

      this.sidebarTools = null;
      this.host = null;
      this.inspectorRoot = null;

      this.initialized = false;
      this._observer = null;
      this._repairRaf = 0;
      this._isRenderingButtons = false;
      this._isOpeningPanel = false;

      this._onVideoMode = this._onVideoMode.bind(this);
      this._onSelectionChanged = this._onSelectionChanged.bind(this);

      this._registerBuiltins();
      this.init();
    }

    init() {
      if (this.initialized) return;
      this.initialized = true;

      this._ensureSvgStyles();

      const boot = () => {
        this.ensureMount(true);
        this._observeInspectorRebuilds();

        this.syncMode(document.body.classList.contains("video-editing-mode"));
      };

      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot, { once: true });
      } else {
        boot();
      }

      global.addEventListener("sm:video-mode", this._onVideoMode);

      global.addEventListener(
        "videoCanvasTransformChanged",
        this._onSelectionChanged,
      );

      global.addEventListener("videoToolPanelRequest", (event) => {
        const id = event?.detail?.tab;

        if (
          document.body.classList.contains("video-editing-mode") &&
          this.panels.has(id)
        ) {
          this.openPanel(id);
        }
      });
    }

    _ensureSvgStyles() {
      if (document.getElementById("video-inspector-svg-icon-styles")) {
        return;
      }

      const style = document.createElement("style");
      style.id = "video-inspector-svg-icon-styles";
      style.textContent = `
                .video-inspector-svg-icon{
                    width:15px;
                    height:15px;
                    display:inline-flex;
                    align-items:center;
                    justify-content:center;
                    flex:0 0 15px;
                    pointer-events:none;
                    color:currentColor;
                }

                .video-inspector-svg-icon svg{
                    width:15px;
                    height:15px;
                    display:block;
                    fill:none;
                    stroke:currentColor;
                    stroke-width:1.65;
                    stroke-linecap:round;
                    stroke-linejoin:round;
                    vector-effect:non-scaling-stroke;
                }

                .video-inspector-empty-svg{
                    width:20px;
                    height:20px;
                    display:inline-flex;
                    align-items:center;
                    justify-content:center;
                    color:var(--text-secondary,#b0b0b0);
                    pointer-events:none;
                }

                .video-inspector-empty-svg svg{
                    width:20px;
                    height:20px;
                    display:block;
                    fill:none;
                    stroke:currentColor;
                    stroke-width:1.65;
                    stroke-linecap:round;
                    stroke-linejoin:round;
                }

                .video-inspector-side-btn .video-inspector-svg-icon{
                    opacity:.82;
                }

                .video-inspector-side-btn:hover .video-inspector-svg-icon,
                .video-inspector-side-btn.active .video-inspector-svg-icon{
                    opacity:1;
                }

                .video-audio-studio-launcher{
                    display:flex;
                    align-items:center;
                    justify-content:space-between;
                    gap:7px;

                    margin:0 0 6px;
                    padding:7px;

                    border:1px solid var(--border-color,#4d4d4d81);
                    background:var(--secondary-dark,#3c3c3c);
                    color:var(--text-primary,#fff);
                }

                .video-audio-studio-launcher-copy{
                    min-width:0;
                    display:flex;
                    align-items:center;
                    gap:7px;
                }

                .video-audio-launcher-icon{
                    width:18px;
                    height:18px;
                    flex:0 0 18px;
                    display:inline-flex;
                    color:var(--text-secondary,#b0b0b0);
                }

                .video-audio-launcher-icon svg{
                    width:18px;
                    height:18px;
                    fill:none;
                    stroke:currentColor;
                    stroke-width:1.65;
                    stroke-linecap:round;
                    stroke-linejoin:round;
                }

                .video-audio-studio-launcher-copy strong,
                .video-audio-studio-launcher-copy span{
                    display:block;
                }

                .video-audio-studio-launcher-copy strong{
                    font-size:9px;
                    color:var(--text-primary,#fff);
                }

                .video-audio-studio-launcher-copy span{
                    margin-top:2px;
                    font-size:7px;
                    color:var(--text-secondary,#b0b0b0);
                    white-space:nowrap;
                    overflow:hidden;
                    text-overflow:ellipsis;
                }

                .video-audio-studio-launcher button{
                    flex:0 0 auto;
                    height:21px;
                    padding:0 7px;

                    border:1px solid var(--border-color,#4d4d4d81);
                    border-radius:0;

                    background:var(--bg-button,#363636);
                    color:var(--text-secondary,#b0b0b0);

                    font-size:7px;
                    cursor:pointer;
                }

                .video-audio-studio-launcher button:hover{
                    background:var(--accent-blue-dark,#474747);
                    color:var(--text-primary,#fff);
                }

                .video-fusion-inspector-card{
                    display:flex;
                    flex-direction:column;
                    gap:6px;
                    padding:7px;
                    border:1px solid var(--border-color,#4d4d4d81);
                    background:var(--panel-bg,var(--primary-dark,#333333));
                }

                .video-fusion-inspector-head{
                    display:flex;
                    align-items:center;
                    gap:7px;
                    min-width:0;
                }

                .video-fusion-inspector-head>div{
                    min-width:0;
                }

                .video-fusion-inspector-head strong,
                .video-fusion-inspector-head span{
                    display:block;
                }

                .video-fusion-inspector-head strong{
                    font-size:9px;
                    color:var(--text-primary,#fff);
                }

                .video-fusion-inspector-head div>span{
                    margin-top:2px;
                    overflow:hidden;
                    text-overflow:ellipsis;
                    white-space:nowrap;
                    font-size:7px;
                    color:var(--text-secondary,#b0b0b0);
                }

                .video-fusion-inspector-info{
                    min-height:23px;
                    display:grid;
                    grid-template-columns:45px minmax(0,1fr);
                    align-items:center;
                    gap:5px;
                    padding:0 5px;
                    background:var(--secondary-dark,#3c3c3c);
                    border:1px solid var(--border-color,#4d4d4d81);
                }

                .video-fusion-inspector-info span{
                    font-size:7px;
                    color:var(--text-secondary,#b0b0b0);
                }

                .video-fusion-inspector-info strong{
                    min-width:0;
                    overflow:hidden;
                    text-overflow:ellipsis;
                    white-space:nowrap;
                    font-size:8px;
                }

                .video-fusion-inspector-card>button{
                    height:23px;
                    border:1px solid var(--border-color,#4d4d4d81);
                    border-radius:0;
                    background:var(--bg-button,#363636);
                    color:var(--text-secondary,#b0b0b0);
                    font-size:7px;
                    cursor:pointer;
                }

                .video-fusion-inspector-card>button:hover{
                    background:var(--accent-blue-dark,#474747);
                    color:var(--text-primary,#fff);
                }
            `;

      document.head.appendChild(style);
    }

    /**
     * Re-acquire the CURRENT Inspector DOM.
     *
     * InspectorPanel.renderDefaultInspector() uses innerHTML, so any
     * previously stored sidebar/host nodes may become detached.
     */
    ensureMount(renderButtons = false) {
      const root = document.getElementById("inspector-panel");
      const sidebar =
        root?.querySelector(".inspector-sidebar") ||
        document.querySelector(".inspector-sidebar");

      const host =
        root?.querySelector("#inspector-main-content") ||
        document.getElementById("inspector-main-content");

      if (!sidebar) {
        this.sidebarTools = null;
        this.host = host || null;
        this.inspectorRoot = root || null;
        return false;
      }

      let tools = sidebar.querySelector("#video-inspector-sidebar-tools");

      if (!tools) {
        tools = document.createElement("div");
        tools.id = "video-inspector-sidebar-tools";
        tools.className = "video-inspector-sidebar-tools";
        tools.setAttribute("aria-label", "Video Editing Inspector Tools");
        sidebar.appendChild(tools);
      }

      const changed =
        tools !== this.sidebarTools ||
        host !== this.host ||
        root !== this.inspectorRoot;

      this.sidebarTools = tools;
      this.host = host || null;
      this.inspectorRoot = root || null;

      if ((changed || renderButtons) && !this._isRenderingButtons) {
        this._renderButtonsIntoCurrentNode();
      }

      return true;
    }

    _observeInspectorRebuilds() {
      this._observer?.disconnect?.();

      // Observe the stable #inspector-panel shell if possible.
      // If it does not exist yet, observe document.body.
      const target =
        document.getElementById("inspector-panel") || document.body;

      if (!target) return;

      this._observer = new MutationObserver(() => {
        if (this._repairRaf) return;

        this._repairRaf = requestAnimationFrame(() => {
          this._repairRaf = 0;

          const oldTools = this.sidebarTools;
          const oldHost = this.host;

          this.ensureMount(false);

          const rebuilt =
            oldTools !== this.sidebarTools ||
            oldHost !== this.host ||
            !this.sidebarTools?.isConnected;

          if (rebuilt) {
            this._renderButtonsIntoCurrentNode();
          }

          if (document.body.classList.contains("video-editing-mode")) {
            this.sidebarTools?.classList.add("video-sidebar-active");

            /*
             * CRITICAL:
             * Do NOT re-render the active panel for ordinary child
             * mutations inside the Inspector.
             *
             * Replacing the <select> DOM while Chromium/Electron has
             * its native dropdown open makes the popup appear for a
             * frame and immediately close.
             *
             * Only restore the panel when InspectorPanel actually
             * rebuilt the host/sidebar nodes.
             */
            if (rebuilt) {
              const desired = this.activePanelId || this.lastPanelId || "clip";

              if (this.host && !this._isOpeningPanel) {
                this.openPanel(desired, {
                  force: true,
                  reason: "inspector-rebuild",
                });
              }
            }
          }
        });
      });

      this._observer.observe(target, {
        childList: true,
        subtree: true,
      });
    }

    _registerBuiltins() {
      this.registerPanel({
        id: "clip",
        title: "Clip / Transform",
        icon: "clip",
        order: 10,
        render: (host) => {
          const seq = global.sequencerManager;
          const clip =
            seq?.state?.primarySelection ||
            seq?.state?.clips?.find((c) => c.selected) ||
            null;

          global.videoTabbedInspector?.releaseInspectorHost?.();

          if (global.ensureVideoClipInspector && seq) {
            const inspector = global.ensureVideoClipInspector(seq);

            if (clip) {
              inspector.open(clip);
            } else {
              host.innerHTML = this.emptyState(
                "Clip / Transform",
                "Select a clip in the timeline to edit its transform, timing and keyframes.",
                "fa-sliders",
              );
            }
          } else {
            host.innerHTML = this.emptyState(
              "Clip / Transform",
              "VideoClipInspector.js is not loaded.",
              "fa-triangle-exclamation",
            );
          }
        },
      });

      this.registerPanel({
        id: "effects",
        title: "Effects",
        icon: "effects",
        order: 20,
        render: (host) => {
          /*
           * Professional Effects workflow:
           *
           * Inspector:
           *   selected effect controls
           *
           * Shared side dock:
           *   Effects / Stack / Masks / Presets
           */
          global.videoNodeEditorManager?.close?.();

          global.audioStudioDockManager?.close?.();

          global.colorStudioDockManager?.close?.();

          global.videoTransitionsDockManager?.close?.();

          global.videoProjectDockManager?.close?.();

          global.videoDeliverDockManager?.close?.();

          const inspector = global.ensureVideoEffectsInspectorPanel?.();

          if (!inspector) {
            host.innerHTML = this.emptyState(
              "Effects",
              "VideoEffectsInspectorPanel.js is not loaded.",
              "effects",
            );

            return;
          }

          inspector.render(host);

          global.ensureVideoEffectsDockManager?.()?.open?.({
            tab:
              global.videoProject?.workspace?.perWorkspace?.edit
                ?.effectsDockTab || "effects",
          });
        },
      });

      this.registerPanel({
        id: "fusion",
        title: "Fusion Nodes",
        icon: "fusion",
        order: 25,
        render: (host) => {
          global.audioStudioDockManager?.close?.();

          global.colorStudioDockManager?.close?.();

          global.videoEffectsDockManager?.close?.();

          global.videoTransitionsDockManager?.close?.();

          global.videoProjectDockManager?.close?.();

          global.videoDeliverDockManager?.close?.();

          const manager =
            global.ensureVideoNodeEditorManager?.(global.videoProject) ||
            global.videoNodeEditorManager;

          manager?.open?.();

          const clip = global.sequencerManager?.state?.primarySelection || null;

          host.innerHTML = `
                        <div class="video-fusion-inspector-card">
                            <div class="video-fusion-inspector-head">
                                <span class="video-inspector-svg-icon" aria-hidden="true">
                                    ${this._svgIcon("fusion")}
                                </span>
                                <div>
                                    <strong>Fusion Nodes</strong>
                                    <span>${clip ? "Linked to selected clip" : "Global composition graph"}</span>
                                </div>
                            </div>

                            <div class="video-fusion-inspector-info">
                                <span>Graph</span>
                                <strong>${clip ? clip.name || clip.id : "Global Fusion"}</strong>
                            </div>

                            <button
                                type="button"
                                data-toggle-video-node-editor>
                                ${manager?.isOpen?.() ? "CLOSE NODE EDITOR" : "OPEN NODE EDITOR"}
                            </button>
                        </div>
                    `;

          host
            .querySelector("[data-toggle-video-node-editor]")
            ?.addEventListener("click", () => {
              manager?.toggle?.();
              this.refresh?.();
            });
        },
      });

      this.registerPanel({
        id: "transitions",
        title: "Transitions",
        icon: "transitions",
        order: 30,
        render: (host) => {
          /*
           * Professional Transitions workflow:
           *
           * Inspector:
           *   selected transition quick controls
           *
           * Shared side dock:
           *   Transitions / Applied / Controls / Presets
           */
          global.videoNodeEditorManager?.close?.();

          global.audioStudioDockManager?.close?.();

          global.colorStudioDockManager?.close?.();

          global.videoEffectsDockManager?.close?.();

          global.videoProjectDockManager?.close?.();

          global.videoDeliverDockManager?.close?.();

          const inspector = global.ensureVideoTransitionInspectorPanel?.();

          if (!inspector) {
            host.innerHTML = this.emptyState(
              "Transitions",
              "VideoTransitionInspectorPanel.js is not loaded.",
              "transitions",
            );

            return;
          }

          inspector.render(host);

          global.ensureVideoTransitionsDockManager?.()?.open?.({
            tab:
              global.videoProject?.workspace?.perWorkspace?.edit
                ?.transitionsDockTab || "transitions",
          });
        },
      });

      this.registerPanel({
        id: "color",
        title: "Color",
        icon: "color",
        order: 40,
        render: (host) => {
          /*
           * DaVinci-style Color workflow:
           *
           * Inspector:
           *   quick primary grade controls
           *
           * Side dock:
           *   Primaries / Curves / Scopes
           */
          global.videoNodeEditorManager?.close?.();

          global.audioStudioDockManager?.close?.();

          global.videoEffectsDockManager?.close?.();

          global.videoTransitionsDockManager?.close?.();

          global.videoProjectDockManager?.close?.();

          global.videoDeliverDockManager?.close?.();

          const inspector = global.ensureColorInspectorPanel?.();

          if (!inspector) {
            host.innerHTML = this.emptyState(
              "Color",
              "ColorInspectorPanel.js is not loaded.",
              "color",
            );

            return;
          }

          inspector.render(host);

          global.ensureColorStudioDockManager?.()?.open?.({
            tab:
              global.videoProject?.workspace?.perWorkspace?.edit
                ?.colorDockTab || "primaries",
          });
        },
      });

      this.registerPanel({
        id: "audio",
        title: "Audio",
        icon: "audio",
        order: 50,
        render: (host) => {
          /*
           * Resolve-style Audio workflow:
           *
           * Inspector:
           *   clip / track / master quick controls
           *
           * Side dock:
           *   waveform / mixer / channel FX
           *
           * Do not use the old generic advanced inspector audio tab.
           */
          global.videoNodeEditorManager?.close?.();

          global.colorStudioDockManager?.close?.();

          global.videoEffectsDockManager?.close?.();

          global.videoTransitionsDockManager?.close?.();

          global.videoProjectDockManager?.close?.();

          global.videoDeliverDockManager?.close?.();

          const inspector = global.ensureAudioInspectorPanel?.();

          if (!inspector) {
            host.innerHTML = this.emptyState(
              "Audio",
              "AudioInspectorPanel.js is not loaded.",
              "audio",
            );

            return;
          }

          inspector.render(host);

          /*
           * Clicking the Audio sidebar button opens the dock
           * automatically in the SAME visual slot as Fusion Nodes.
           */
          global.ensureAudioStudioDockManager?.()?.open?.({
            tab:
              global.videoProject?.workspace?.perWorkspace?.edit
                ?.audioDockTab || "waveform",
          });
        },
      });

      this.registerPanel({
        id: "project",
        title: "Project",
        icon: "project",
        order: 60,
        render: (host) => {
          /*
           * Professional Project workflow:
           *
           * Inspector:
           *   quick project summary + format + save/autosave
           *
           * Shared side dock:
           *   Contents / Settings / Info / Manage
           */
          global.videoNodeEditorManager?.close?.();
          global.audioStudioDockManager?.close?.();
          global.colorStudioDockManager?.close?.();
          global.videoEffectsDockManager?.close?.();
          global.videoTransitionsDockManager?.close?.();
          global.videoDeliverDockManager?.close?.();

          const inspector = global.ensureVideoProjectInspectorPanel?.();

          if (!inspector) {
            host.innerHTML = this.emptyState(
              "Project",
              "VideoProjectInspectorPanel.js is not loaded.",
              "project",
            );

            return;
          }

          inspector.render(host);

          global.ensureVideoProjectDockManager?.()?.open?.({
            tab:
              global.videoProject?.workspace?.perWorkspace?.edit
                ?.projectDockTab || "contents",
          });
        },
      });

      this.registerPanel({
        id: "render",
        title: "Deliver / Export",
        icon: "render",
        order: 70,
        render: (host) => {
          /*
           * Professional Deliver workflow:
           *
           * Inspector:
           *   quick preset / format / queue / quick export
           *
           * Shared side dock:
           *   Settings / Presets / Preflight / Queue
           */
          global.videoNodeEditorManager?.close?.();
          global.audioStudioDockManager?.close?.();
          global.colorStudioDockManager?.close?.();
          global.videoEffectsDockManager?.close?.();
          global.videoTransitionsDockManager?.close?.();
          global.videoProjectDockManager?.close?.();

          const inspector = global.ensureVideoDeliverInspectorPanel?.();

          if (!inspector) {
            host.innerHTML = this.emptyState(
              "Deliver",
              "VideoDeliverInspectorPanel.js is not loaded.",
              "render",
            );

            return;
          }

          inspector.render(host);

          global.ensureVideoDeliverDockManager?.()?.open?.({
            tab:
              global.videoProject?.workspace?.perWorkspace?.edit
                ?.deliverDockTab || "settings",
          });
        },
      });
    }

    registerPanel(definition) {
      if (
        !definition ||
        !definition.id ||
        typeof definition.render !== "function"
      ) {
        return false;
      }

      const panel = {
        id: definition.id,
        title: definition.title || definition.id,
        icon: definition.icon || "info",
        order: Number(definition.order ?? 100),
        render: definition.render,
      };

      this.panels.set(panel.id, panel);

      if (this.initialized) {
        this.ensureMount(false);
        this._renderButtonsIntoCurrentNode();
      }

      return true;
    }

    unregisterPanel(id) {
      const removed = this.panels.delete(id);

      if (removed) {
        this.ensureMount(false);
        this._renderButtonsIntoCurrentNode();
      }

      if (this.activePanelId === id) {
        this.openPanel("clip");
      }

      return removed;
    }

    _svgIcon(name) {
      return VIDEO_INSPECTOR_SVG_ICONS[name] || VIDEO_INSPECTOR_SVG_ICONS.info;
    }

    renderButtons() {
      this.ensureMount(false);
      this._renderButtonsIntoCurrentNode();
    }

    _renderButtonsIntoCurrentNode() {
      if (!this.sidebarTools || this._isRenderingButtons) return;

      this._isRenderingButtons = true;

      try {
        const panels = Array.from(this.panels.values()).sort(
          (a, b) => a.order - b.order,
        );

        this.sidebarTools.innerHTML = panels
          .map(
            (panel) => `
                        <button
                            type="button"
                            class="tool-btn video-inspector-side-btn"
                            data-video-inspector-panel="${panel.id}"
                            title="${panel.title}"
                            aria-label="${panel.title}">
                            <span
                                class="video-inspector-svg-icon"
                                aria-hidden="true">
                                ${this._svgIcon(panel.icon)}
                            </span>
                        </button>
                    `,
          )
          .join("");

        this.sidebarTools
          .querySelectorAll("[data-video-inspector-panel]")
          .forEach((button) => {
            button.addEventListener("click", (event) => {
              event.preventDefault();
              event.stopPropagation();

              this.openPanel(button.dataset.videoInspectorPanel);
            });
          });

        if (document.body.classList.contains("video-editing-mode")) {
          this.sidebarTools.classList.add("video-sidebar-active");
        } else {
          this.sidebarTools.classList.remove("video-sidebar-active");
        }

        this._syncActiveButton();
      } finally {
        this._isRenderingButtons = false;
      }
    }

    getHost() {
      this.ensureMount(false);
      return this.host;
    }

    openPanel(id, options = {}) {
      if (!document.body.classList.contains("video-editing-mode")) {
        return false;
      }

      if (this._isOpeningPanel) return false;

      /*
       * Keep native Chromium/Electron controls alive while they are
       * focused/open. Re-rendering their parent destroys the native popup.
       */
      if (
        options.force !== true &&
        id === this.activePanelId &&
        this._hasActiveNativeControl()
      ) {
        return true;
      }

      this.ensureMount(false);

      const panel = this.panels.get(id);
      const host = this.host;

      if (!panel || !host) return false;

      this._isOpeningPanel = true;

      try {
        global.setInspectorCollapsed?.(false);

        this._hideLegacyVideoDock();

        this.activePanelId = id;
        this.lastPanelId = id;

        /*
         * Fusion / Audio / Color / Effects / Transitions / Project
         * share ONE professional side-dock slot between Viewport and
         * Inspector.
         */
        const closeAllProfessionalDocks = (except) => {
          if (except !== "audio") global.audioStudioDockManager?.close?.();
          if (except !== "fusion") global.videoNodeEditorManager?.close?.();
          if (except !== "color") global.colorStudioDockManager?.close?.();
          if (except !== "effects") global.videoEffectsDockManager?.close?.();
          if (except !== "transitions")
            global.videoTransitionsDockManager?.close?.();
          if (except !== "project") global.videoProjectDockManager?.close?.();
          if (except !== "render") global.videoDeliverDockManager?.close?.();
        };

        if (
          [
            "audio",
            "fusion",
            "color",
            "effects",
            "transitions",
            "project",
            "render",
          ].includes(id)
        ) {
          closeAllProfessionalDocks(id);
        } else {
          closeAllProfessionalDocks(null);
        }

        this.sidebarTools?.classList.add("video-sidebar-active");
        host.classList.add("video-inspector-panel-host");

        try {
          panel.render(host);
        } catch (error) {
          console.error(
            `[VideoInspectorSidebar] Failed to render "${id}"`,
            error,
          );

          host.innerHTML = this.emptyState(
            panel.title,
            error?.message || "Panel failed to render.",
            "fa-triangle-exclamation",
          );
        }

        this._syncActiveButton();

        global.dispatchEvent(
          new CustomEvent("videoInspectorPanelChanged", {
            detail: {
              id,
              panel,
            },
          }),
        );
      } finally {
        this._isOpeningPanel = false;
      }

      return true;
    }

    _hasActiveNativeControl() {
      const active = document.activeElement;

      if (!active || !this.host?.contains(active)) {
        return false;
      }

      if (active.matches?.("select")) {
        return true;
      }

      if (
        active.matches?.(
          'input[type="color"], input[type="date"], input[type="time"], input[type="datetime-local"], input[type="file"]',
        )
      ) {
        return true;
      }

      return false;
    }

    refresh(options = {}) {
      if (
        !this.activePanelId ||
        !document.body.classList.contains("video-editing-mode")
      ) {
        return;
      }

      /*
       * Never rebuild the Inspector DOM while a native dropdown/color
       * picker is active. The control itself already writes its value
       * through its own change/input event.
       */
      if (options.force !== true && this._hasActiveNativeControl()) {
        return;
      }

      this.ensureMount(false);

      const panel = this.panels.get(this.activePanelId);

      if (panel && this.host) {
        panel.render(this.host);
      }
    }

    syncMode(active) {
      this.ensureMount(false);

      if (!this.sidebarTools) return;

      this.sidebarTools.classList.toggle("video-sidebar-active", !!active);

      if (active) {
        this._renderButtonsIntoCurrentNode();

        requestAnimationFrame(() => {
          this.ensureMount(false);

          this.openPanel(this.lastPanelId || "clip");
        });
      } else {
        this.activePanelId = null;
        this._syncActiveButton();

        this.host?.classList.remove("video-inspector-panel-host");

        global.videoTabbedInspector?.releaseInspectorHost?.();

        global.videoClipInspector?.close?.(false);

        if (global.InspectorPanel?.renderDefaultInspector) {
          global.InspectorPanel.renderDefaultInspector();

          // renderDefaultInspector() just rebuilt the DOM,
          // so immediately bind to the new sidebar again.
          requestAnimationFrame(() => {
            this.ensureMount(true);
          });
        }
      }
    }

    _onVideoMode(event) {
      const active =
        event?.detail?.active ??
        document.body.classList.contains("video-editing-mode");

      this.syncMode(!!active);
    }

    _onSelectionChanged() {
      if (!document.body.classList.contains("video-editing-mode")) {
        return;
      }

      if (this.activePanelId === "clip" || this.activePanelId === "effects") {
        this.refresh();
      }
    }

    _openAdvancedTab(tab, host) {
      global.videoClipInspector?.close?.(false);

      const advanced = global.videoTabbedInspector;

      if (advanced?.openInInspector) {
        advanced.openInInspector(tab, host);
        return;
      }

      if (tab === "effects" && global.videoEffectsManager?.renderPanel) {
        global.videoEffectsManager.renderPanel(
          host,
          global.videoEditingManager,
        );
        return;
      }

      if (
        tab === "transitions" &&
        global.videoTransitionsManager?.renderPanel
      ) {
        global.videoTransitionsManager.renderPanel(
          host,
          global.sequencerManager,
        );
        return;
      }

      if (tab === "render" && global.veaExportEngine?.renderPanel) {
        global.veaExportEngine.renderPanel(host, global.videoEditingManager);
        return;
      }

      host.innerHTML = this.emptyState(
        tab,
        "The requested video panel module is not loaded yet.",
        "fa-circle-info",
      );
    }

    _hideLegacyVideoDock() {
      const dock = document.getElementById("video-timeline-dock");

      const resizer = document.querySelector(".video-timeline-dock-resizer");

      if (dock) dock.style.display = "none";
      if (resizer) resizer.style.display = "none";
    }

    _syncActiveButton() {
      this.sidebarTools
        ?.querySelectorAll(".video-inspector-side-btn")
        .forEach((button) => {
          const active =
            button.dataset.videoInspectorPanel === this.activePanelId;

          button.classList.toggle("active", active);

          button.setAttribute("aria-pressed", active ? "true" : "false");
        });
    }

    emptyState(title, message, icon = "fa-circle-info") {
      return `
                <div class="video-inspector-empty-state">
                    <span class="video-inspector-empty-svg" aria-hidden="true">
                        ${this._svgIcon(
                          icon === "fa-triangle-exclamation"
                            ? "warning"
                            : "info",
                        )}
                    </span>
                    <strong>${title}</strong>
                    <span>${message}</span>
                </div>
            `;
    }
  }

  global.VideoInspectorSidebarManager = VideoInspectorSidebarManager;

  global.videoInspectorSidebar =
    global.videoInspectorSidebar || new VideoInspectorSidebarManager();
})(window);
