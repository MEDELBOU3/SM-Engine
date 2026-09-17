/**
 * AudioStudioDockManager.js
 * SM Engine — Phase 15 Fairlight-style docked Audio Studio.
 *
 * Shared dock layout:
 * Viewport + Sequencer | Audio Studio | Inspector
 *
 * Main views:
 * - MIXER
 * - CHANNEL (EQ / Dynamics / Inserts)
 * - WAVEFORM
 */
(function (global) {
  "use strict";

  class AudioStudioDockManager {
    constructor() {
      this.audio = null;
      this.panel = null;
      this.host = null;
      this.content = null;

      this.opened = false;

      this.activeTab =
        global.videoProject?.workspace?.perWorkspace?.edit?.audioDockTab ||
        "mixer";

      if (this.activeTab === "effects") {
        this.activeTab = "channel";
      }

      this.width = Number(
        global.videoProject?.workspace?.perWorkspace?.edit?.audioDockWidth ||
          520,
      );

      this.instances = {
        mixer: null,
        channel: null,
        waveform: null,
      };

      this._resizeState = null;
      this._meterStarted = false;

      this._selectionHandler = () => this.refresh();

      this._engineHandler = () => this._syncHeader();

      this._meterHandler = (event) => this._syncMasterMeter(event.detail);

      global.addEventListener(
        "audioStudioSelectionChanged",
        this._selectionHandler,
      );

      global.addEventListener("audioStudioEngineState", this._engineHandler);

      global.addEventListener("audioStudioMeters", this._meterHandler);

      this._styles();
    }

    isOpen() {
      return !!(this.opened && this.panel?.isConnected);
    }

    async open(options = {}) {
      const video = global.videoEditingManager;

      if (!document.body.classList.contains("video-editing-mode")) {
        video?.enter?.();
      }

      this._closeOtherDocks();

      this.audio =
        global.ensureAudioStudioManager?.(global.videoProject) ||
        global.audioStudioManager;

      if (!this.audio) {
        console.warn("[AudioStudioDock] AudioStudioManager not loaded.");

        return false;
      }

      this.host = document.getElementById("editor-scene");

      if (!this.host) {
        console.warn("[AudioStudioDock] #editor-scene not found.");

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

      document.body.classList.add("video-audio-dock-open");

      document.body.classList.remove("video-node-editor-open");

      this._applyWidth();

      await this._startAudioEngine();

      const clip = this._selectedClip();

      if (clip?.trackId) {
        this.audio.selectTrack?.(clip.trackId);
      }

      const requestedTab = options.tab === "effects" ? "channel" : options.tab;

      this.setTab(requestedTab || this.activeTab || "mixer");

      this._syncTrackSelect();
      this._syncHeader();
      this._refreshLayout();

      return true;
    }

    close(options = {}) {
      this.opened = false;

      document.body.classList.remove(
        "video-audio-dock-open",
        "video-audio-dock-resizing",
      );

      if (this.panel) {
        this.panel.hidden = true;
        this.panel.style.removeProperty("display");
        this.panel.style.removeProperty("visibility");
        this.panel.style.removeProperty("opacity");
        this.panel.style.removeProperty("pointer-events");
      }

      this._resizeState = null;

      if (options.keepMeters !== true) {
        this.audio?._stopMeters?.();
        this._meterStarted = false;
      }

      this._refreshLayout();

      return true;
    }

    toggle(options = {}) {
      return this.isOpen() ? this.close() : this.open(options);
    }

    setTab(tab) {
      const normalized = tab === "effects" ? "channel" : tab;

      const allowed = ["mixer", "channel", "waveform"];

      this.activeTab = allowed.includes(normalized) ? normalized : "mixer";

      this._renderActiveTab();
      this._syncTabButtons();

      global.videoProject?.setWorkspaceState?.(
        "edit",
        {
          audioDockTab: this.activeTab,
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

      const clip = this._selectedClip();

      if (clip?.trackId) {
        this.audio?.selectTrack?.(clip.trackId);
      }

      const instance = this.instances[this.activeTab];

      instance?.render?.();

      this._syncTrackSelect();
      this._syncHeader();
    }

    async _startAudioEngine() {
      await this.audio?.ensureContext?.();

      if (this.audio?.context?.state === "suspended") {
        try {
          await this.audio.context.resume();
        } catch (_) {}
      }

      this.audio?.syncTracks?.();
      this.audio?.syncRuntimeMedia?.();

      this.audio.active = true;

      if (!this._meterStarted) {
        this.audio?._startMeters?.();
        this._meterStarted = true;
      }
    }

    _ensurePanel() {
      if (this.panel?.isConnected) {
        return;
      }

      const panel = document.createElement("section");

      panel.id = "video-audio-studio-dock";

      panel.className = "video-audio-studio-dock";

      panel.innerHTML = `
   <div class="video-audio-dock-resize"></div>

   <header class="video-audio-dock-header">
    <div class="video-audio-dock-title">
     <span class="video-audio-dock-icon">
      ${this._svg("audio")}
     </span>

     <div>
      <strong>Audio Studio</strong>
      <span data-audio-dock-subtitle>Professional Audio Post</span>
     </div>
    </div>

    <div class="video-audio-dock-actions">
     <button
      type="button"
      data-audio-dock-action="home"
      title="Go To Start">
      ${this._svg("home")}
     </button>

     <button
      type="button"
      data-audio-dock-action="play"
      title="Play / Pause">
      <span data-audio-play-icon>
       ${this._svg("play")}
      </span>
     </button>

     <button
      type="button"
      data-audio-dock-action="stop"
      title="Stop">
      ${this._svg("stop")}
     </button>

     <button
      type="button"
      data-audio-dock-action="close"
      title="Close Audio Studio">
      ${this._svg("close")}
     </button>
    </div>
   </header>

   <div class="video-audio-dock-channelbar">
    <label>
     <span>CHANNEL</span>
     <select data-audio-track-select></select>
    </label>

    <div class="video-audio-engine-badge">
     <i data-audio-engine-led></i>
     <span data-audio-engine-state>Audio Engine</span>
    </div>

    <div class="video-audio-master-mini">
     <span>MAIN</span>

     <i>
      <b data-audio-master-mini-meter></b>
     </i>

     <output data-audio-master-mini-read>-∞</output>
    </div>
   </div>

   <nav class="video-audio-dock-tabs">
    <button
     type="button"
     data-audio-dock-tab="mixer">
     ${this._svg("mixer")}
     <span>MIXER</span>
    </button>

    <button
     type="button"
     data-audio-dock-tab="channel">
     ${this._svg("channel")}
     <span>CHANNEL</span>
    </button>

    <button
     type="button"
     data-audio-dock-tab="waveform">
     ${this._svg("waveform")}
     <span>WAVEFORM</span>
    </button>
   </nav>

   <div class="video-audio-dock-content"></div>

   <footer class="video-audio-dock-status">
    <span data-audio-dock-status>Ready</span>
    <span>6-Band EQ · Dynamics · 6 Inserts</span>
   </footer>
  `;

      this.host.appendChild(panel);

      this.panel = panel;

      this.content = panel.querySelector(".video-audio-dock-content");

      this._bindPanel();
    }

    _renderActiveTab() {
      if (!this.content || !this.audio) {
        return;
      }

      this.content.innerHTML = "";

      if (this.activeTab === "mixer") {
        if (!global.AudioMixerPanel) {
          this._missingModule("AudioMixerPanel.js");

          return;
        }

        if (!this.instances.mixer) {
          this.instances.mixer = new global.AudioMixerPanel(this.audio);
        }

        this.instances.mixer.mount(this.content);

        return;
      }

      if (this.activeTab === "channel") {
        if (!global.AudioEffectsRack) {
          this._missingModule("AudioEffectsRack.js");

          return;
        }

        if (!this.instances.channel) {
          this.instances.channel = new global.AudioEffectsRack(this.audio);
        }

        this.instances.channel.mount(this.content);

        return;
      }

      if (!global.AudioWaveformEditor) {
        this._missingModule("AudioWaveformEditor.js");

        return;
      }

      if (!this.instances.waveform) {
        this.instances.waveform = new global.AudioWaveformEditor(this.audio);
      }

      this.instances.waveform.mount(this.content);
    }

    _bindPanel() {
      this.panel?.addEventListener("click", (event) => {
        const tab = event.target.closest?.("[data-audio-dock-tab]")?.dataset
          ?.audioDockTab;

        if (tab) {
          this.setTab(tab);

          return;
        }

        const action = event.target.closest?.("[data-audio-dock-action]")
          ?.dataset?.audioDockAction;

        if (!action) {
          return;
        }

        if (action === "close") {
          this.close();
        } else if (action === "play") {
          global.sequencerManager?.togglePlay?.();
        } else if (action === "stop") {
          global.sequencerManager?.pause?.();

          global.sequencerManager?.seekTo?.(0);
        } else if (action === "home") {
          global.sequencerManager?.seekTo?.(0);
        }
      });

      this.panel
        ?.querySelector("[data-audio-track-select]")
        ?.addEventListener("change", (event) => {
          this.audio?.selectTrack?.(event.target.value);

          this.refresh();
        });

      const resize = this.panel?.querySelector(".video-audio-dock-resize");

      resize?.addEventListener("pointerdown", (event) => {
        event.preventDefault();

        this._resizeState = {
          pointerId: event.pointerId,

          startX: event.clientX,

          startWidth: this.width,
        };

        resize.setPointerCapture?.(event.pointerId);

        document.body.classList.add("video-audio-dock-resizing");
      });

      resize?.addEventListener("pointermove", (event) => {
        if (
          !this._resizeState ||
          event.pointerId !== this._resizeState.pointerId
        ) {
          return;
        }

        const delta = this._resizeState.startX - event.clientX;

        this.width = Math.max(
          360,
          Math.min(900, this._resizeState.startWidth + delta),
        );

        this._applyWidth();
        this._refreshLayout();
      });

      const finishResize = (event) => {
        if (
          !this._resizeState ||
          event.pointerId !== this._resizeState.pointerId
        ) {
          return;
        }

        resize.releasePointerCapture?.(event.pointerId);

        this._resizeState = null;

        document.body.classList.remove("video-audio-dock-resizing");

        global.videoProject?.setWorkspaceState?.(
          "edit",
          {
            audioDockWidth: this.width,
          },
          {
            dirty: false,
          },
        );

        this._refreshLayout();
      };

      resize?.addEventListener("pointerup", finishResize);

      resize?.addEventListener("pointercancel", finishResize);

      resize?.addEventListener("dblclick", () => {
        this.width = 520;
        this._applyWidth();
        this._refreshLayout();
      });
    }

    _syncTabButtons() {
      this.panel
        ?.querySelectorAll("[data-audio-dock-tab]")
        .forEach((button) =>
          button.classList.toggle(
            "active",
            button.dataset.audioDockTab === this.activeTab,
          ),
        );
    }

    _syncTrackSelect() {
      const select = this.panel?.querySelector("[data-audio-track-select]");

      if (!select) {
        return;
      }

      const tracks = this.audio?.project?.timeline?.tracks || [];

      const selected = this.audio?.selectedTrackId || "";

      select.innerHTML = tracks.length
        ? tracks
            .map(
              (track) => `
        <option
         value="${this._esc(track.id)}"
         ${track.id === selected ? "selected" : ""}>
         ${this._esc(track.name || track.id)}
        </option>
       `,
            )
            .join("")
        : '<option value="">No Tracks</option>';
    }

    _syncHeader() {
      if (!this.panel) {
        return;
      }

      const track = this.audio?.getSelectedTrack?.();

      const subtitle = this.panel.querySelector("[data-audio-dock-subtitle]");

      if (subtitle) {
        subtitle.textContent = track
          ? `${track.name || track.id} · ${track.type === "audio" ? "Audio Track" : "Video Audio"}`
          : "Professional Audio Post";
      }

      const state = this.panel.querySelector("[data-audio-engine-state]");

      const led = this.panel.querySelector("[data-audio-engine-led]");

      const contextState = this.audio?.context?.state;

      if (state) {
        state.textContent =
          contextState === "running"
            ? `${Math.round((this.audio.context.sampleRate || 48000) / 1000)} kHz`
            : contextState === "suspended"
              ? "Suspended"
              : "Engine";
      }

      led?.classList.toggle("running", contextState === "running");

      const playIcon = this.panel.querySelector("[data-audio-play-icon]");

      if (playIcon) {
        playIcon.innerHTML = global.sequencerManager?.state?.playing
          ? this._svg("pause")
          : this._svg("play");
      }
    }

    _syncMasterMeter(detail) {
      if (!this.panel) {
        return;
      }

      const db = Number(detail?.master?.peakDb ?? -96);

      const bar = this.panel.querySelector("[data-audio-master-mini-meter]");

      const output = this.panel.querySelector("[data-audio-master-mini-read]");

      const percent = Math.max(0, Math.min(100, ((db + 60) / 66) * 100));

      if (bar) {
        bar.style.width = `${percent}%`;
      }

      if (output) {
        output.textContent = db <= -59.9 ? "-∞" : db.toFixed(1);
      }

      this._syncHeader();
    }

    _missingModule(name) {
      this.content.innerHTML = `
   <div class="video-audio-dock-missing">
    <span>${this._svg("warning")}</span>
    <strong>${this._esc(name)}</strong>
    <em>Audio UI module is not loaded.</em>
   </div>
  `;
    }

    _selectedClip() {
      const id =
        global.videoProject?.selection?.primaryClipId ||
        global.videoProject?.state?.selection?.primaryClipId ||
        global.sequencerManager?.state?.primarySelection?.id ||
        null;

      return (
        global.videoProject?.getClip?.(id) ||
        global.videoProject?.timeline?.clips?.find((clip) => clip.id === id) ||
        (global.sequencerManager?.state?.primarySelection &&
        typeof global.sequencerManager.state.primarySelection === "object"
          ? global.sequencerManager.state.primarySelection
          : null)
      );
    }

    _closeOtherDocks() {
      [
        global.videoNodeEditorManager,
        global.colorStudioDockManager,
        global.videoEffectsDockManager,
        global.videoTransitionsDockManager,
        global.videoProjectDockManager,
        global.videoDeliverDockManager,
      ].forEach((manager) => {
        if (manager && manager !== this && manager.isOpen?.()) {
          manager.close?.();
        }
      });
    }

    _applyWidth() {
      document.documentElement.style.setProperty(
        "--video-audio-dock-width",
        `${this.width}px`,
      );

      if (this.panel) {
        this.panel.style.width = `${this.width}px`;
      }
    }

    _refreshLayout() {
      try {
        global.dispatchEvent(
          new CustomEvent("sm:layout-resized", {
            detail: {
              source: "audio-studio-dock",

              width: this.opened ? this.width : 0,
            },
          }),
        );
      } catch (_) {}

      try {
        global.dispatchEvent(new Event("resize"));
      } catch (_) {}
    }

    _esc(value) {
      return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
    }

    _svg(name) {
      const icons = {
        audio:
          '<svg viewBox="0 0 24 24"><path d="M4 12h2l2-7 3 14 3-16 3 15 2-6h2"/></svg>',

        mixer:
          '<svg viewBox="0 0 24 24"><path d="M5 4v16M12 4v16M19 4v16"/><path d="M2 8h6M9 15h6M16 10h6"/></svg>',

        channel:
          '<svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"/><circle cx="9" cy="7" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="11" cy="17" r="2"/></svg>',

        waveform:
          '<svg viewBox="0 0 24 24"><path d="M3 12h2l2-6 3 12 3-15 3 14 2-5h3"/></svg>',

        play: '<svg viewBox="0 0 24 24"><path d="M8 5l11 7-11 7z"/></svg>',

        pause: '<svg viewBox="0 0 24 24"><path d="M8 5v14M16 5v14"/></svg>',

        stop: '<svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12"/></svg>',

        home: '<svg viewBox="0 0 24 24"><path d="M5 5v14M8 12h11"/></svg>',

        close:
          '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',

        warning:
          '<svg viewBox="0 0 24 24"><path d="M12 3l9 17H3z"/><path d="M12 9v5M12 17h.01"/></svg>',
      };

      return icons[name] || icons.audio;
    }

    _styles() {
      if (document.getElementById("video-audio-studio-dock-styles")) {
        return;
      }

      const style = document.createElement("style");

      style.id = "video-audio-studio-dock-styles";

      style.textContent = `
   :root{
    --video-audio-dock-width:520px;
   }

   .video-audio-studio-dock{
    position:absolute;
    top:0;
    right:0;
    bottom:0;
    width:var(--video-audio-dock-width);
    min-width:360px;
    max-width:900px;
    display:grid;
    grid-template-rows:36px 32px 30px minmax(0,1fr) 22px;
    box-sizing:border-box;
    border-left:1px solid var(--border-color,#4d4d4d81);
    background:var(--panel-bg,var(--primary-dark,#333));
    color:var(--text-primary,#fff);
    overflow:visible;
    z-index:40;
   }

   .video-audio-studio-dock[hidden]{
    display:none!important;
   }

   body.video-audio-dock-open
   #editor-scene
   >canvas,
   body.video-audio-dock-open
   #editor-scene
   >.renderer-container,
   body.video-audio-dock-open
   #editor-scene
   >.viewport-canvas,
   body.video-audio-dock-open
   #editor-scene
   >.scene-canvas{
    z-index:0!important;
   }

   body.video-audio-dock-open
   #video-editing-container{
    right:var(--video-audio-dock-width)!important;
    width:auto!important;
    max-width:calc(100% - var(--video-audio-dock-width))!important;
   }

   body.video-audio-dock-open
   #sequencer-root{
    right:var(--video-audio-dock-width)!important;
    width:auto!important;
    max-width:calc(100% - var(--video-audio-dock-width))!important;
   }

   body.video-audio-dock-open
   .sequencer-splitter{
    right:var(--video-audio-dock-width)!important;
   }

   .video-audio-studio-dock *{
    box-sizing:border-box;
   }

   .video-audio-studio-dock svg{
    width:100%;
    height:100%;
    fill:none;
    stroke:currentColor;
    stroke-width:1.6;
    stroke-linecap:round;
    stroke-linejoin:round;
   }

   .video-audio-dock-resize{
    position:absolute;
    left:-4px;
    top:0;
    bottom:0;
    width:8px;
    cursor:col-resize;
    background:transparent;
   }

   .video-audio-dock-resize::after{
    content:'';
    position:absolute;
    left:3px;
    top:0;
    bottom:0;
    width:1px;
    background:var(--border-color,#4d4d4d81);
   }

   body.video-audio-dock-resizing{
    cursor:col-resize!important;
    user-select:none!important;
   }

   .video-audio-dock-header{
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:6px;
    padding:0 5px 0 7px;
    border-bottom:1px solid var(--border-color,#4d4d4d81);
    background:var(--header-bg,var(--secondary-dark,#3c3c3c));
   }

   .video-audio-dock-title{
    min-width:0;
    display:flex;
    align-items:center;
    gap:7px;
   }

   .video-audio-dock-icon{
    width:18px;
    height:18px;
    flex:0 0 18px;
    color:var(--text-secondary,#b0b0b0);
   }

   .video-audio-dock-title>div{
    min-width:0;
   }

   .video-audio-dock-title strong,
   .video-audio-dock-title span{
    display:block;
    overflow:hidden;
    text-overflow:ellipsis;
    white-space:nowrap;
   }

   .video-audio-dock-title strong{
    font-size:9px;
   }

   .video-audio-dock-title div>span{
    max-width:270px;
    margin-top:1px;
    color:var(--text-secondary,#b0b0b0);
    font-size:6.5px;
   }

   .video-audio-dock-actions{
    display:flex;
    gap:1px;
   }

   .video-audio-dock-actions button{
    width:24px;
    height:23px;
    padding:5px;
    border:0;
    border-radius:0;
    background:transparent;
    color:var(--text-secondary,#b0b0b0);
    cursor:pointer;
   }

   .video-audio-dock-actions button:hover{
    background:var(--bg-button-hover,#414141);
    color:var(--text-primary,#fff);
   }

   .video-audio-dock-channelbar{
    min-width:0;
    display:grid;
    grid-template-columns:minmax(130px,1fr) auto minmax(105px,140px);
    align-items:center;
    gap:6px;
    padding:0 6px;
    border-bottom:1px solid var(--border-color,#4d4d4d40);
    background:var(--panel-bg,#333);
   }

   .video-audio-dock-channelbar>label{
    min-width:0;
    display:grid;
    grid-template-columns:45px minmax(0,1fr);
    align-items:center;
    gap:4px;
    color:var(--text-secondary,#b0b0b0);
    font-size:6px;
   }

   .video-audio-dock-channelbar select{
    width:100%;
    min-width:0;
    height:21px;
    border:1px solid var(--input-border,var(--border-color,#4d4d4d81));
    border-radius:0;
    background:var(--input-bg,var(--secondary-dark,#3c3c3c));
    color:var(--text-primary,#fff);
    font:inherit;
    font-size:7px;
   }

   .video-audio-engine-badge{
    display:flex;
    align-items:center;
    gap:4px;
    color:var(--text-secondary,#b0b0b0);
    font-size:6px;
    white-space:nowrap;
   }

   .video-audio-engine-badge i{
    width:5px;
    height:5px;
    border-radius:50%;
    background:currentColor;
    opacity:.35;
   }

   .video-audio-engine-badge i.running{
    opacity:1;
   }

   .video-audio-master-mini{
    min-width:0;
    display:grid;
    grid-template-columns:28px minmax(0,1fr) 30px;
    align-items:center;
    gap:4px;
    color:var(--text-secondary,#b0b0b0);
    font-size:6px;
   }

   .video-audio-master-mini i{
    height:6px;
    overflow:hidden;
    border:1px solid var(--border-color,#4d4d4d81);
    background:var(--primary-dark,#333);
   }

   .video-audio-master-mini i b{
    display:block;
    width:0;
    height:100%;
    background:var(--text-secondary,#b0b0b0);
    transition:width 42ms linear;
   }

   .video-audio-master-mini output{
    text-align:right;
    color:var(--text-primary,#fff);
   }

   .video-audio-dock-tabs{
    display:grid;
    grid-template-columns:repeat(3,1fr);
    border-bottom:1px solid var(--border-color,#4d4d4d81);
    background:var(--secondary-dark,#3c3c3c);
   }

   .video-audio-dock-tabs button{
    display:flex;
    align-items:center;
    justify-content:center;
    gap:4px;
    border:0;
    border-right:1px solid var(--border-color,#4d4d4d40);
    border-radius:0;
    background:transparent;
    color:var(--text-secondary,#b0b0b0);
    font-size:7px;
    cursor:pointer;
   }

   .video-audio-dock-tabs button:last-child{
    border-right:0;
   }

   .video-audio-dock-tabs button svg{
    width:13px;
    height:13px;
   }

   .video-audio-dock-tabs button:hover,
   .video-audio-dock-tabs button.active{
    background:var(--accent-blue-dark,#474747);
    color:var(--text-primary,#fff);
   }

   .video-audio-dock-content{
    min-width:0;
    min-height:0;
    overflow:hidden;
    background:var(--panel-bg,var(--primary-dark,#333));
   }

   .video-audio-dock-status{
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:7px;
    padding:0 6px;
    border-top:1px solid var(--border-color,#4d4d4d81);
    background:var(--header-bg,var(--secondary-dark,#3c3c3c));
    color:var(--text-secondary,#b0b0b0);
    font-size:6px;
   }

   .video-audio-dock-missing{
    height:100%;
    display:flex;
    flex-direction:column;
    align-items:center;
    justify-content:center;
    gap:5px;
    color:var(--text-secondary,#b0b0b0);
    text-align:center;
   }

   .video-audio-dock-missing>span{
    width:24px;
    height:24px;
   }

   .video-audio-dock-missing strong{
    color:var(--text-primary,#fff);
    font-size:9px;
   }

   .video-audio-dock-missing em{
    font-size:7px;
    font-style:normal;
   }

   @media(max-width:1000px){
    .video-audio-dock-channelbar{
     grid-template-columns:minmax(115px,1fr) auto;
    }

    .video-audio-master-mini{
     display:none;
    }
   }
  `;

      document.head.appendChild(style);
    }

    destroy() {
      this.close();

      this.instances.mixer?.destroy?.();
      this.instances.channel?.destroy?.();
      this.instances.waveform?.destroy?.();

      global.removeEventListener(
        "audioStudioSelectionChanged",
        this._selectionHandler,
      );

      global.removeEventListener("audioStudioEngineState", this._engineHandler);

      global.removeEventListener("audioStudioMeters", this._meterHandler);
    }
  }

  global.AudioStudioDockManager = AudioStudioDockManager;

  global.ensureAudioStudioDockManager =
    function ensureAudioStudioDockManager() {
      if (!global.audioStudioDockManager) {
        global.audioStudioDockManager = new AudioStudioDockManager();
      }

      return global.audioStudioDockManager;
    };

  global.openVideoAudioStudio = function openVideoAudioStudio(options = {}) {
    return global.ensureAudioStudioDockManager().open(options);
  };

  global.closeVideoAudioStudio = function closeVideoAudioStudio() {
    return global.ensureAudioStudioDockManager().close();
  };
})(window);
