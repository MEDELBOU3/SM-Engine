/**
 * AudioInspectorPanel.js
 * SM Engine Video Editing — Audio quick inspector.
 *
 * This is intentionally the SMALL right Inspector UI.
 * The larger waveform / mixer / channel-FX UI lives in AudioStudioDockManager.
 */
(function (global) {
  "use strict";

  class AudioInspectorPanel {
    constructor(audioManager = null) {
      this.audio =
        audioManager ||
        global.audioStudioManager ||
        global.ensureAudioStudioManager?.(global.videoProject) ||
        null;

      this.project = this.audio?.project || global.videoProject || null;

      this.host = null;
      this._styles();
    }

    render(host) {
      this.host = host || this.host;
      if (!this.host) return false;

      this.audio =
        global.ensureAudioStudioManager?.(global.videoProject) ||
        this.audio ||
        global.audioStudioManager;

      this.project = this.audio?.project || global.videoProject || this.project;

      const clip = this._selectedClip();

      if (!clip) {
        this.host.innerHTML = `
    <div class="ve-audio-inspector">
     ${this._sectionHeader("Audio", "audio")}
     <div class="ve-audio-inspector-empty">
      <span class="ve-audio-empty-icon">${this._svg("audio")}</span>
      <strong>No audio clip selected</strong>
      <span>Select an audio or video clip in the Sequencer.</span>
     </div>
     <button type="button" class="ve-audio-open-dock" data-audio-open-dock>
      ${this._svg("panel")}
      <span>OPEN AUDIO PANEL</span>
     </button>
    </div>`;
        this._bindOpenDock();
        return true;
      }

      if (clip.trackId) {
        this.audio?.selectTrack?.(clip.trackId);
      }

      const track = this._trackForClip(clip);
      const trackState = track
        ? this.audio?.ensureTrackState?.(track.id)
        : null;

      const master = this.project?.audio?.master || {};
      const clipVolume = Math.max(0, Number(clip.volume ?? 1));
      const trackGain = Math.max(0, Number(trackState?.gain ?? 1));
      const masterGain = Math.max(0, Number(master.gain ?? 1));

      this.host.innerHTML = `
   <div class="ve-audio-inspector">
    <div class="ve-audio-inspector-top">
     <div class="ve-audio-inspector-title">
      <span class="ve-audio-title-icon">${this._svg("audio")}</span>
      <div>
       <strong>Audio</strong>
       <span>${this._escape(clip.name || "Selected clip")}</span>
      </div>
     </div>
     <button type="button" class="ve-audio-open-dock compact" data-audio-open-dock title="Open audio panel">
      ${this._svg("panel")}
     </button>
    </div>

    <section class="ve-audio-section">
     <header>
      <span>CLIP</span>
      <em>${String(clip.mediaType || "audio").toUpperCase()}</em>
     </header>

     ${this._infoRow("Name", clip.name || "Audio Clip")}
     ${this._infoRow("Track", track?.name || track?.id || "—")}
     ${this._infoRow("Duration", this._time(clip.duration || 0))}

     <label class="ve-audio-range-row">
      <span>Volume</span>
      <input
       type="range"
       min="0"
       max="2"
       step="0.01"
       value="${clipVolume}"
       data-audio-clip-volume>
      <output data-audio-clip-volume-read>${this._dbText(this._gainToDb(clipVolume))}</output>
     </label>

     <div class="ve-audio-button-row">
      <button
       type="button"
       class="${clip.muted ? "active" : ""}"
       data-audio-clip-mute>
       ${this._svg(clip.muted ? "muted" : "speaker")}
       <span>${clip.muted ? "UNMUTE CLIP" : "MUTE CLIP"}</span>
      </button>
     </div>
    </section>

    <section class="ve-audio-section">
     <header>
      <span>TRACK / CHANNEL</span>
      <em>${this._escape(track?.name || track?.id || "NO TRACK")}</em>
     </header>

     <label class="ve-audio-range-row">
      <span>Gain</span>
      <input
       type="range"
       min="-60"
       max="6"
       step="0.1"
       value="${Math.max(-60, Math.min(6, this._gainToDb(trackGain)))}"
       data-audio-track-gain
       ${track ? "" : "disabled"}>
      <output data-audio-track-gain-read>${this._dbText(this._gainToDb(trackGain))}</output>
     </label>

     <label class="ve-audio-range-row">
      <span>Pan</span>
      <input
       type="range"
       min="-1"
       max="1"
       step="0.01"
       value="${Number(trackState?.pan || 0)}"
       data-audio-track-pan
       ${track ? "" : "disabled"}>
      <output data-audio-track-pan-read>${this._panText(trackState?.pan || 0)}</output>
     </label>

     <div class="ve-audio-button-row split">
      <button
       type="button"
       class="${trackState?.muted || track?.muted ? "active" : ""}"
       data-audio-track-mute
       ${track ? "" : "disabled"}>
       MUTE
      </button>
      <button
       type="button"
       class="${trackState?.solo || track?.solo ? "active" : ""}"
       data-audio-track-solo
       ${track ? "" : "disabled"}>
       SOLO
      </button>
     </div>
    </section>

    <section class="ve-audio-section">
     <header>
      <span>MASTER</span>
      <em>OUTPUT</em>
     </header>

     <label class="ve-audio-range-row">
      <span>Gain</span>
      <input
       type="range"
       min="-60"
       max="6"
       step="0.1"
       value="${Math.max(-60, Math.min(6, this._gainToDb(masterGain)))}"
       data-audio-master-gain>
      <output data-audio-master-gain-read>${this._dbText(this._gainToDb(masterGain))}</output>
     </label>

     <div class="ve-audio-button-row split">
      <button
       type="button"
       class="${master.muted ? "active" : ""}"
       data-audio-master-mute>
       MASTER MUTE
      </button>

      <button
       type="button"
       class="${master.limiterEnabled !== false ? "active" : ""}"
       data-audio-master-limiter>
       LIMITER
      </button>
     </div>
    </section>

    <button type="button" class="ve-audio-open-dock" data-audio-open-dock>
     ${this._svg("panel")}
     <span>WAVEFORM / MIXER / FX</span>
    </button>
   </div>
  `;

      this._bind(clip, track, trackState);

      return true;
    }

    _bind(clip, track, trackState) {
      this._bindOpenDock();

      const clipVolume = this.host.querySelector("[data-audio-clip-volume]");
      const clipVolumeRead = this.host.querySelector(
        "[data-audio-clip-volume-read]",
      );

      clipVolume?.addEventListener("input", () => {
        const value = Math.max(0, Number(clipVolume.value) || 0);

        this.project?.updateClip?.(clip.id, {
          volume: value,
        });

        if (clipVolumeRead) {
          clipVolumeRead.textContent = this._dbText(this._gainToDb(value));
        }

        this.audio?.syncRuntimeMedia?.();
        global.videoEditingManager?.compositionRuntime?.syncFromProject?.({
          force: false,
          hierarchy: false,
        });
      });

      this.host
        .querySelector("[data-audio-clip-mute]")
        ?.addEventListener("click", () => {
          this.project?.updateClip?.(clip.id, {
            muted: !clip.muted,
          });

          this.audio?.syncRuntimeMedia?.();
          this.render(this.host);
        });

      const trackGain = this.host.querySelector("[data-audio-track-gain]");
      const trackGainRead = this.host.querySelector(
        "[data-audio-track-gain-read]",
      );

      trackGain?.addEventListener("input", () => {
        if (!track) return;

        const db = Number(trackGain.value);
        this.audio?.setTrackGain?.(track.id, this._dbToGain(db));

        if (trackGainRead) {
          trackGainRead.textContent = this._dbText(db);
        }
      });

      const pan = this.host.querySelector("[data-audio-track-pan]");
      const panRead = this.host.querySelector("[data-audio-track-pan-read]");

      pan?.addEventListener("input", () => {
        if (!track) return;

        const value = Math.max(-1, Math.min(1, Number(pan.value) || 0));

        this.audio?.setTrackPan?.(track.id, value);

        if (panRead) {
          panRead.textContent = this._panText(value);
        }
      });

      this.host
        .querySelector("[data-audio-track-mute]")
        ?.addEventListener("click", () => {
          if (!track) return;

          const state = this.audio?.ensureTrackState?.(track.id);

          this.audio?.setTrackMuted?.(track.id, !state?.muted);

          this.render(this.host);
        });

      this.host
        .querySelector("[data-audio-track-solo]")
        ?.addEventListener("click", () => {
          if (!track) return;

          const state = this.audio?.ensureTrackState?.(track.id);

          this.audio?.setTrackSolo?.(track.id, !state?.solo);

          this.render(this.host);
        });

      const masterGain = this.host.querySelector("[data-audio-master-gain]");
      const masterRead = this.host.querySelector(
        "[data-audio-master-gain-read]",
      );

      masterGain?.addEventListener("input", () => {
        const db = Number(masterGain.value);

        this.audio?.setMasterGain?.(this._dbToGain(db));

        if (masterRead) {
          masterRead.textContent = this._dbText(db);
        }
      });

      this.host
        .querySelector("[data-audio-master-mute]")
        ?.addEventListener("click", () => {
          const master = this.project?.audio?.master;

          this.audio?.setMasterMuted?.(!master?.muted);

          this.render(this.host);
        });

      this.host
        .querySelector("[data-audio-master-limiter]")
        ?.addEventListener("click", () => {
          const master = this.project?.audio?.master;

          if (!master) return;

          master.limiterEnabled = master.limiterEnabled === false;

          this.project?.touch?.("audio.master.limiter", {
            enabled: master.limiterEnabled,
          });

          this.audio?._applyMaster?.();
          this.render(this.host);
        });
    }

    _bindOpenDock() {
      this.host
        ?.querySelectorAll("[data-audio-open-dock]")
        .forEach((button) => {
          button.addEventListener("click", () => {
            global.ensureAudioStudioDockManager?.()?.open?.({
              tab: "waveform",
            });
          });
        });
    }

    _selectedClip() {
      const id =
        this.project?.selection?.primaryClipId ||
        global.sequencerManager?.state?.primarySelection?.id ||
        null;

      return (
        this.project?.getClip?.(id) ||
        this.project?.timeline?.clips?.find((clip) => clip.id === id) ||
        global.sequencerManager?.state?.primarySelection ||
        null
      );
    }

    _trackForClip(clip) {
      if (!clip?.trackId) return null;

      return (
        this.project?.timeline?.tracks?.find(
          (track) => track.id === clip.trackId,
        ) || null
      );
    }

    _sectionHeader(title, icon) {
      return `
   <div class="ve-audio-inspector-title">
    <span class="ve-audio-title-icon">${this._svg(icon)}</span>
    <div>
     <strong>${this._escape(title)}</strong>
     <span>Clip / Track / Master</span>
    </div>
   </div>
  `;
    }

    _infoRow(label, value) {
      return `
   <div class="ve-audio-info-row">
    <span>${this._escape(label)}</span>
    <strong>${this._escape(value)}</strong>
   </div>
  `;
    }

    _gainToDb(value) {
      const gain = Math.max(0, Number(value) || 0);

      if (gain <= 0.000001) {
        return -60;
      }

      return Math.max(-60, 20 * Math.log10(gain));
    }

    _dbToGain(db) {
      const value = Number(db);

      if (!Number.isFinite(value) || value <= -60) {
        return 0;
      }

      return Math.pow(10, value / 20);
    }

    _dbText(db) {
      const value = Number(db);

      if (!Number.isFinite(value) || value <= -59.9) {
        return "-∞ dB";
      }

      return `${value.toFixed(1)} dB`;
    }

    _panText(value) {
      const pan = Math.max(-1, Math.min(1, Number(value) || 0));

      if (Math.abs(pan) < 0.01) {
        return "C";
      }

      return pan < 0
        ? `L ${Math.round(Math.abs(pan) * 100)}`
        : `R ${Math.round(pan * 100)}`;
    }

    _time(seconds) {
      const value = Math.max(0, Number(seconds) || 0);

      const minutes = Math.floor(value / 60);
      const secs = value % 60;

      return `${String(minutes).padStart(2, "0")}:${secs.toFixed(2).padStart(5, "0")}`;
    }

    _escape(value) {
      return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
    }

    _svg(name) {
      const icons = {
        audio:
          '<svg viewBox="0 0 24 24"><path d="M5 10v4M9 7v10M13 4v16M17 8v8M21 10v4"/></svg>',
        panel:
          '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16"/><path d="M14 4v16M17 8h2M17 12h2M17 16h2"/></svg>',
        speaker:
          '<svg viewBox="0 0 24 24"><path d="M4 10h4l5-4v12l-5-4H4z"/><path d="M16 9c1 1 1 5 0 6M19 7c2 2 2 8 0 10"/></svg>',
        muted:
          '<svg viewBox="0 0 24 24"><path d="M4 10h4l5-4v12l-5-4H4z"/><path d="M17 9l4 6M21 9l-4 6"/></svg>',
      };

      return icons[name] || icons.audio;
    }

    _styles() {
      if (document.getElementById("ve-audio-inspector-styles")) {
        return;
      }

      const style = document.createElement("style");

      style.id = "ve-audio-inspector-styles";

      style.textContent = `
   .ve-audio-inspector{
    display:flex;
    flex-direction:column;
    gap:6px;
    min-width:0;
    padding:6px;
    color:var(--text-primary,#fff);
   }

   .ve-audio-inspector-top{
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:6px;
   }

   .ve-audio-inspector-title{
    min-width:0;
    display:flex;
    align-items:center;
    gap:7px;
   }

   .ve-audio-title-icon{
    width:18px;
    height:18px;
    flex:0 0 18px;
    display:inline-flex;
    color:var(--text-secondary,#b0b0b0);
   }

   .ve-audio-title-icon svg,
   .ve-audio-open-dock svg,
   .ve-audio-button-row svg,
   .ve-audio-empty-icon svg{
    width:100%;
    height:100%;
    fill:none;
    stroke:currentColor;
    stroke-width:1.65;
    stroke-linecap:round;
    stroke-linejoin:round;
   }

   .ve-audio-inspector-title>div{
    min-width:0;
   }

   .ve-audio-inspector-title strong,
   .ve-audio-inspector-title span{
    display:block;
   }

   .ve-audio-inspector-title strong{
    font-size:9px;
   }

   .ve-audio-inspector-title div>span{
    max-width:220px;
    margin-top:2px;
    overflow:hidden;
    text-overflow:ellipsis;
    white-space:nowrap;
    color:var(--text-secondary,#b0b0b0);
    font-size:7px;
   }

   .ve-audio-section{
    border:1px solid var(--border-color,#4d4d4d81);
    background:var(--panel-bg,var(--primary-dark,#333));
   }

   .ve-audio-section>header{
    height:23px;
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:5px;
    padding:0 6px;
    box-sizing:border-box;
    border-bottom:1px solid var(--border-color,#4d4d4d81);
    background:var(--header-bg,var(--secondary-dark,#3c3c3c));
    color:var(--text-secondary,#b0b0b0);
    font-size:7px;
    font-weight:700;
    letter-spacing:.35px;
   }

   .ve-audio-section>header em{
    max-width:120px;
    overflow:hidden;
    text-overflow:ellipsis;
    white-space:nowrap;
    font-style:normal;
    font-weight:500;
    letter-spacing:0;
   }

   .ve-audio-info-row{
    min-height:24px;
    display:grid;
    grid-template-columns:58px minmax(0,1fr);
    align-items:center;
    gap:5px;
    padding:0 6px;
    border-bottom:1px solid var(--border-color,#4d4d4d35);
   }

   .ve-audio-info-row span{
    color:var(--text-secondary,#b0b0b0);
    font-size:7px;
   }

   .ve-audio-info-row strong{
    min-width:0;
    overflow:hidden;
    text-overflow:ellipsis;
    white-space:nowrap;
    text-align:right;
    font-size:7px;
    font-weight:500;
   }

   .ve-audio-range-row{
    min-height:30px;
    display:grid;
    grid-template-columns:50px minmax(0,1fr) 49px;
    align-items:center;
    gap:5px;
    padding:0 6px;
    color:var(--text-secondary,#b0b0b0);
    font-size:7px;
   }

   .ve-audio-range-row input{
    width:100%;
    min-width:0;
    accent-color:var(--accent-blue,#5f5f5f);
   }

   .ve-audio-range-row output{
    text-align:right;
    color:var(--text-primary,#fff);
    font-size:7px;
    white-space:nowrap;
   }

   .ve-audio-button-row{
    display:flex;
    gap:4px;
    padding:4px 6px 6px;
   }

   .ve-audio-button-row.split>*{
    flex:1 1 0;
   }

   .ve-audio-button-row button,
   .ve-audio-open-dock{
    min-height:22px;
    display:flex;
    align-items:center;
    justify-content:center;
    gap:5px;
    padding:0 7px;
    border:1px solid var(--border-color,#4d4d4d81);
    border-radius:0;
    background:var(--bg-button,#363636);
    color:var(--text-secondary,#b0b0b0);
    font-size:7px;
    cursor:pointer;
   }

   .ve-audio-button-row button:hover,
   .ve-audio-open-dock:hover{
    background:var(--bg-button-hover,#414141);
    color:var(--text-primary,#fff);
   }

   .ve-audio-button-row button.active{
    background:var(--accent-blue-dark,#474747);
    color:var(--text-primary,#fff);
   }

   .ve-audio-button-row button svg,
   .ve-audio-open-dock svg{
    width:14px;
    height:14px;
   }

   .ve-audio-open-dock{
    width:100%;
    min-height:25px;
   }

   .ve-audio-open-dock.compact{
    width:25px;
    height:23px;
    min-height:23px;
    flex:0 0 25px;
    padding:4px;
   }

   .ve-audio-inspector-empty{
    min-height:120px;
    display:flex;
    flex-direction:column;
    align-items:center;
    justify-content:center;
    gap:5px;
    padding:10px;
    color:var(--text-secondary,#b0b0b0);
    text-align:center;
   }

   .ve-audio-empty-icon{
    width:22px;
    height:22px;
   }

   .ve-audio-inspector-empty strong{
    color:var(--text-primary,#fff);
    font-size:9px;
   }

   .ve-audio-inspector-empty>span:last-child{
    max-width:210px;
    font-size:7px;
   }
  `;

      document.head.appendChild(style);
    }
  }

  global.AudioInspectorPanel = AudioInspectorPanel;

  global.ensureAudioInspectorPanel = function ensureAudioInspectorPanel() {
    if (!global.audioInspectorPanel) {
      global.audioInspectorPanel = new AudioInspectorPanel(
        global.audioStudioManager || null,
      );
    }

    return global.audioInspectorPanel;
  };
})(window);
