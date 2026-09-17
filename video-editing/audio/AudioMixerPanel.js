/**
 * AudioMixerPanel.js
 * SM Engine — Phase 15 professional mixer.
 *
 * Channel strip:
 * - 6 insert slots
 * - EQ + dynamics quick sections
 * - stereo pan
 * - fader + realtime meter
 * - mute / solo / automation mode
 */
(function (global) {
  "use strict";

  class AudioMixerPanel {
    constructor(manager) {
      this.manager = manager;
      this.host = null;
      this._meterState = new Map();

      this._meters = (event) => this._updateMeters(event.detail);

      this._selection = () => this.syncSelection();

      global.addEventListener("audioStudioMeters", this._meters);

      global.addEventListener("audioStudioSelectionChanged", this._selection);

      this._styles();
    }

    mount(host) {
      this.host = host;
      this.render();
    }

    render() {
      if (!this.host) {
        return;
      }

      const tracks = this.manager.project?.timeline?.tracks || [];

      this.host.innerHTML = `
   <section class="sm-pro-mixer">
    <header class="sm-pro-mixer-head">
     <div>
      <strong>MIXER</strong>
      <span>${tracks.length} timeline track${tracks.length === 1 ? "" : "s"}</span>
     </div>

     <div class="sm-pro-mixer-head-actions">
      <button type="button" data-mixer-action="reset-meters">
       RESET PEAKS
      </button>
     </div>
    </header>

    <div class="sm-pro-mixer-scroll">
     <div class="sm-pro-mixer-strips">
      ${tracks.map((track, index) => this._strip(track, index)).join("")}

      ${this._masterStrip()}
     </div>
    </div>
   </section>
  `;

      this._bind();
      this.syncSelection();

      if (this._lastMeterDetail) {
        this._updateMeters(this._lastMeterDetail);
      }
    }

    _strip(track, index) {
      const state = this.manager.ensureTrackState(track.id);

      const db = this.manager.gainToDb(state.gain);

      const pan = Number(state.pan || 0);

      const selected = track.id === this.manager.selectedTrackId;

      const inserts = Array.from(
        {
          length: 6,
        },
        (_, slot) => state.effects[slot] || null,
      );

      const eqActive =
        state.eq?.enabled !== false &&
        state.eq?.bands?.some(
          (band) =>
            band.enabled !== false && Math.abs(Number(band.gain || 0)) > 0.01,
        );

      const dynamicsActive =
        state.compressor?.enabled !== false || state.limiter?.enabled !== false;

      return `
   <article
    class="sm-pro-channel${selected ? " selected" : ""}"
    data-strip="${this._esc(track.id)}">

    <div class="sm-channel-index">
     <span>${String(index + 1).padStart(2, "0")}</span>
     <em>${track.type === "audio" ? "AUDIO" : "VIDEO"}</em>
    </div>

    <button
     type="button"
     class="sm-channel-name"
     data-select-track="${this._esc(track.id)}"
     title="${this._esc(track.name || track.id)}">
     ${this._esc(track.name || track.id)}
    </button>

    <section class="sm-channel-inserts">
     <header>
      <span>INSERTS</span>
      <em>${state.effects.length}/6</em>
     </header>

     <div>
      ${inserts
        .map((effect, slot) =>
          effect
            ? `
          <button
           type="button"
           class="${effect.enabled === false ? "bypassed" : ""}"
           data-insert-slot="${slot}"
           data-track="${this._esc(track.id)}"
           title="${this._esc(effect.name)}">
           <span>${slot + 1}</span>
           <strong>${this._esc(this._shortEffectName(effect.name))}</strong>
          </button>
         `
            : `
          <button
           type="button"
           class="empty"
           data-insert-slot="${slot}"
           data-track="${this._esc(track.id)}"
           title="Empty Insert">
           <span>${slot + 1}</span>
           <strong>—</strong>
          </button>
         `,
        )
        .join("")}
     </div>
    </section>

    <section class="sm-channel-processing">
     <button
      type="button"
      data-open-channel="eq"
      data-track="${this._esc(track.id)}"
      class="${eqActive ? "active" : ""}">
      <span>EQ</span>
      <em>${eqActive ? "ON" : "FLAT"}</em>
     </button>

     <button
      type="button"
      data-open-channel="dynamics"
      data-track="${this._esc(track.id)}"
      class="${dynamicsActive ? "active" : ""}">
      <span>DYN</span>
      <em>${dynamicsActive ? "ON" : "OFF"}</em>
     </button>
    </section>

    <section class="sm-channel-pan">
     <header>
      <span>PAN</span>
      <output data-pan-read="${this._esc(track.id)}">
       ${this._panText(pan)}
      </output>
     </header>

     <input
      type="range"
      min="-1"
      max="1"
      step=".01"
      value="${pan}"
      data-pan="${this._esc(track.id)}">
    </section>

    <section class="sm-channel-fader-area">
     <div class="sm-channel-meter-wrap">
      <div class="sm-channel-db-scale">
       <span>0</span>
       <span>-6</span>
       <span>-12</span>
       <span>-24</span>
       <span>-48</span>
      </div>

      <div class="sm-channel-meter">
       <i data-meter-rms="${this._esc(track.id)}"></i>
       <b data-meter-peak="${this._esc(track.id)}"></b>
      </div>
     </div>

     <div class="sm-channel-fader">
      <input
       type="range"
       min="-60"
       max="12"
       step=".1"
       value="${Math.max(-60, Math.min(12, db))}"
       data-gain="${this._esc(track.id)}">

      <output data-gain-read="${this._esc(track.id)}">
       ${this._dbText(db)}
      </output>
     </div>
    </section>

    <section class="sm-channel-buttons">
     <button
      type="button"
      data-mute="${this._esc(track.id)}"
      class="${track.muted || state.muted ? "active mute" : ""}"
      title="Mute">
      M
     </button>

     <button
      type="button"
      data-solo="${this._esc(track.id)}"
      class="${track.solo || state.solo ? "active solo" : ""}"
      title="Solo">
      S
     </button>

     <select
      data-automation="${this._esc(track.id)}"
      title="Automation Mode">
      ${["off", "read", "touch", "latch", "write"]
        .map(
          (mode) =>
            `<option value="${mode}" ${state.automationMode === mode ? "selected" : ""}>${mode.toUpperCase()}</option>`,
        )
        .join("")}
     </select>
    </section>
   </article>
  `;
    }

    _masterStrip() {
      const master =
        this.manager.project?.state?.audio?.master ||
        this.manager.project?.audio?.master ||
        {};

      const db = this.manager.gainToDb(master.gain ?? 1);

      return `
   <article class="sm-pro-channel master">
    <div class="sm-channel-index">
     <span>M</span>
     <em>BUS</em>
    </div>

    <div class="sm-channel-name static">
     MAIN 1
    </div>

    <section class="sm-channel-inserts master-info">
     <header>
      <span>OUTPUT</span>
      <em>STEREO</em>
     </header>

     <div class="sm-master-summary">
      <strong>MASTER BUS</strong>
      <span>Limiter ${master.limiterEnabled === false ? "OFF" : "ON"}</span>
     </div>
    </section>

    <section class="sm-channel-processing">
     <button
      type="button"
      data-master-limiter
      class="${master.limiterEnabled === false ? "" : "active"}">
      <span>LIM</span>
      <em>${master.limiterEnabled === false ? "OFF" : "ON"}</em>
     </button>

     <button
      type="button"
      class="disabled">
      <span>BUS</span>
      <em>1</em>
     </button>
    </section>

    <section class="sm-channel-pan master-pan">
     <header>
      <span>FORMAT</span>
      <output>2.0</output>
     </header>

     <div>STEREO</div>
    </section>

    <section class="sm-channel-fader-area">
     <div class="sm-channel-meter-wrap">
      <div class="sm-channel-db-scale">
       <span>0</span>
       <span>-6</span>
       <span>-12</span>
       <span>-24</span>
       <span>-48</span>
      </div>

      <div class="sm-channel-meter master-meter">
       <i data-meter-rms="master"></i>
       <b data-meter-peak="master"></b>
      </div>
     </div>

     <div class="sm-channel-fader">
      <input
       type="range"
       min="-60"
       max="12"
       step=".1"
       value="${Math.max(-60, Math.min(12, db))}"
       data-master-gain>

      <output data-master-read>
       ${this._dbText(db)}
      </output>
     </div>
    </section>

    <section class="sm-channel-buttons master-buttons">
     <button
      type="button"
      data-master-mute
      class="${master.muted ? "active mute" : ""}">
      M
     </button>

     <button
      type="button"
      class="disabled">
      S
     </button>

     <span>MAIN</span>
    </section>
   </article>
  `;
    }

    _bind() {
      this.host?.querySelectorAll("[data-select-track]").forEach((button) =>
        button.addEventListener("click", () => {
          this.manager.selectTrack(button.dataset.selectTrack);
        }),
      );

      this.host?.querySelectorAll("[data-strip]").forEach((strip) =>
        strip.addEventListener("pointerdown", (event) => {
          if (event.target.closest("input,button,select")) {
            return;
          }

          this.manager.selectTrack(strip.dataset.strip);
        }),
      );

      this.host?.querySelectorAll("[data-gain]").forEach((input) =>
        input.addEventListener("input", () => {
          const id = input.dataset.gain;

          const db = Number(input.value);

          this.manager.setTrackGain(id, this.manager.dbToLinear(db));

          const output = this.host.querySelector(
            `[data-gain-read="${CSS.escape(id)}"]`,
          );

          if (output) {
            output.textContent = this._dbText(db);
          }
        }),
      );

      this.host?.querySelectorAll("[data-pan]").forEach((input) =>
        input.addEventListener("input", () => {
          const id = input.dataset.pan;

          const value = Number(input.value);

          this.manager.setTrackPan(id, value);

          const output = this.host.querySelector(
            `[data-pan-read="${CSS.escape(id)}"]`,
          );

          if (output) {
            output.textContent = this._panText(value);
          }
        }),
      );

      this.host?.querySelectorAll("[data-mute]").forEach((button) =>
        button.addEventListener("click", () => {
          const id = button.dataset.mute;

          const state = this.manager.ensureTrackState(id);

          this.manager.setTrackMuted(id, !state.muted);

          this.render();
        }),
      );

      this.host?.querySelectorAll("[data-solo]").forEach((button) =>
        button.addEventListener("click", () => {
          const id = button.dataset.solo;

          const state = this.manager.ensureTrackState(id);

          this.manager.setTrackSolo(id, !state.solo);

          this.render();
        }),
      );

      this.host?.querySelectorAll("[data-automation]").forEach((select) =>
        select.addEventListener("change", () => {
          this.manager.setAutomationMode(
            select.dataset.automation,
            select.value,
          );
        }),
      );

      this.host?.querySelectorAll("[data-open-channel]").forEach((button) =>
        button.addEventListener("click", () => {
          const id = button.dataset.track;

          this.manager.selectTrack(id);

          global.ensureAudioStudioDockManager?.()?.setTab?.("channel");

          try {
            global.dispatchEvent(
              new CustomEvent("audioStudioChannelSection", {
                detail: {
                  section: button.dataset.openChannel,

                  trackId: id,
                },
              }),
            );
          } catch (_) {}
        }),
      );

      this.host?.querySelectorAll("[data-insert-slot]").forEach((button) =>
        button.addEventListener("click", () => {
          const id = button.dataset.track;

          this.manager.selectTrack(id);

          global.ensureAudioStudioDockManager?.()?.setTab?.("channel");

          try {
            global.dispatchEvent(
              new CustomEvent("audioStudioChannelSection", {
                detail: {
                  section: "inserts",
                  trackId: id,
                  slot: Number(button.dataset.insertSlot),
                },
              }),
            );
          } catch (_) {}
        }),
      );

      const masterGain = this.host?.querySelector("[data-master-gain]");

      masterGain?.addEventListener("input", () => {
        const db = Number(masterGain.value);

        this.manager.setMasterGain(this.manager.dbToLinear(db));

        const output = this.host.querySelector("[data-master-read]");

        if (output) {
          output.textContent = this._dbText(db);
        }
      });

      this.host
        ?.querySelector("[data-master-mute]")
        ?.addEventListener("click", () => {
          const master = this.manager.project?.state?.audio?.master || {};

          this.manager.setMasterMuted(!master.muted);

          this.render();
        });

      this.host
        ?.querySelector("[data-master-limiter]")
        ?.addEventListener("click", () => {
          const master = this.manager.project?.state?.audio?.master || {};

          this.manager.setMasterLimiter({
            enabled: master.limiterEnabled === false,
          });

          this.render();
        });

      this.host
        ?.querySelector('[data-mixer-action="reset-meters"]')
        ?.addEventListener("click", () => {
          this._meterState.clear();

          this.host?.querySelectorAll("[data-meter-peak]").forEach((peak) => {
            peak.style.height = "0%";
          });
        });
    }

    syncSelection() {
      const id = this.manager.selectedTrackId;

      this.host
        ?.querySelectorAll("[data-strip]")
        .forEach((strip) =>
          strip.classList.toggle("selected", strip.dataset.strip === id),
        );
    }

    _updateMeters(detail) {
      if (!this.host || !detail) {
        return;
      }

      this._lastMeterDetail = detail;

      Object.entries(detail.tracks || {}).forEach(([id, meter]) =>
        this._setMeter(id, meter),
      );

      this._setMeter(
        "master",
        detail.master || {
          rmsDb: -96,
          peakDb: -96,
        },
      );
    }

    _setMeter(id, meter) {
      const rms = this.host.querySelector(
        `[data-meter-rms="${CSS.escape(id)}"]`,
      );

      const peak = this.host.querySelector(
        `[data-meter-peak="${CSS.escape(id)}"]`,
      );

      if (rms) {
        rms.style.height = `${this._meterPercent(meter.rmsDb)}%`;
      }

      const previous = this._meterState.get(id) || -96;

      const held = Math.max(Number(meter.peakDb ?? -96), previous - 0.35);

      this._meterState.set(id, held);

      if (peak) {
        peak.style.height = `${this._meterPercent(held)}%`;

        peak.classList.toggle("clip", held > -0.2);
      }
    }

    _meterPercent(db) {
      const value = Math.max(-60, Math.min(6, Number(db) || -60));

      return ((value + 60) / 66) * 100;
    }

    _shortEffectName(name) {
      const value = String(name || "");

      if (value.length <= 7) {
        return value;
      }

      return value
        .replace("Compressor", "Comp")
        .replace("High Pass", "HPF")
        .replace("Low Pass", "LPF")
        .slice(0, 7);
    }

    _panText(value) {
      const pan = Math.max(-1, Math.min(1, Number(value) || 0));

      if (Math.abs(pan) < 0.01) {
        return "C";
      }

      return pan < 0
        ? `L${Math.round(Math.abs(pan) * 100)}`
        : `R${Math.round(pan * 100)}`;
    }

    _dbText(value) {
      const db = Number(value);

      if (!Number.isFinite(db) || db <= -59.9) {
        return "-∞";
      }

      return `${db.toFixed(1)}`;
    }

    _esc(value) {
      return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
    }

    _styles() {
      if (document.getElementById("sm-pro-audio-mixer-style")) {
        return;
      }

      const style = document.createElement("style");

      style.id = "sm-pro-audio-mixer-style";

      style.textContent = `
   .sm-pro-mixer{
    height:100%;
    min-width:0;
    display:grid;
    grid-template-rows:30px minmax(0,1fr);
    background:var(--panel-bg,var(--primary-dark,#333));
    color:var(--text-primary,#fff);
   }

   .sm-pro-mixer *{
    box-sizing:border-box;
   }

   .sm-pro-mixer-head{
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:8px;
    padding:0 7px;
    border-bottom:1px solid var(--border-color,#4d4d4d81);
    background:var(--header-bg,var(--secondary-dark,#3c3c3c));
   }

   .sm-pro-mixer-head>div:first-child{
    min-width:0;
    display:flex;
    align-items:center;
    gap:7px;
   }

   .sm-pro-mixer-head strong{
    font-size:8px;
    letter-spacing:.3px;
   }

   .sm-pro-mixer-head span{
    color:var(--text-secondary,#b0b0b0);
    font-size:7px;
   }

   .sm-pro-mixer-head-actions button{
    height:20px;
    padding:0 6px;
    border:1px solid var(--border-color,#4d4d4d81);
    border-radius:0;
    background:var(--bg-button,#363636);
    color:var(--text-secondary,#b0b0b0);
    font-size:6px;
    cursor:pointer;
   }

   .sm-pro-mixer-scroll{
    min-width:0;
    min-height:0;
    overflow:auto hidden;
   }

   .sm-pro-mixer-strips{
    min-height:100%;
    display:flex;
    align-items:stretch;
    width:max-content;
   }

   .sm-pro-channel{
    width:106px;
    min-width:106px;
    min-height:100%;
    display:grid;
    grid-template-rows:
     25px
     28px
     126px
     41px
     50px
     minmax(178px,1fr)
     34px;
    border-right:1px solid var(--border-color,#4d4d4d81);
    background:var(--panel-bg,var(--primary-dark,#333));
   }

   .sm-pro-channel:hover{
    background:var(--secondary-dark,#3c3c3c);
   }

   .sm-pro-channel.selected{
    box-shadow:inset 0 0 0 1px var(--text-secondary,#b0b0b0);
    background:var(--secondary-dark,#3c3c3c);
   }

   .sm-pro-channel.master{
    width:116px;
    min-width:116px;
    background:var(--secondary-dark,#3c3c3c);
   }

   .sm-channel-index{
    display:flex;
    align-items:center;
    justify-content:space-between;
    padding:0 6px;
    border-bottom:1px solid var(--border-color,#4d4d4d40);
    color:var(--text-secondary,#b0b0b0);
   }

   .sm-channel-index span{
    font-size:8px;
    font-weight:700;
   }

   .sm-channel-index em{
    font-size:6px;
    font-style:normal;
   }

   .sm-channel-name{
    width:100%;
    min-width:0;
    overflow:hidden;
    text-overflow:ellipsis;
    white-space:nowrap;
    padding:0 6px;
    border:0;
    border-bottom:1px solid var(--border-color,#4d4d4d40);
    border-radius:0;
    background:transparent;
    color:var(--text-primary,#fff);
    font:inherit;
    font-size:8px;
    font-weight:600;
    text-align:left;
    cursor:pointer;
   }

   .sm-channel-name:hover{
    background:var(--bg-button-hover,#414141);
   }

   .sm-channel-name.static{
    display:flex;
    align-items:center;
    cursor:default;
   }

   .sm-channel-inserts{
    display:grid;
    grid-template-rows:22px minmax(0,1fr);
    border-bottom:1px solid var(--border-color,#4d4d4d40);
   }

   .sm-channel-inserts>header,
   .sm-channel-pan>header{
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:4px;
    padding:0 5px;
    color:var(--text-secondary,#b0b0b0);
    font-size:6px;
   }

   .sm-channel-inserts>header em{
    font-style:normal;
   }

   .sm-channel-inserts>div:not(.sm-master-summary){
    display:grid;
    grid-template-rows:repeat(6,1fr);
    min-height:0;
   }

   .sm-channel-inserts button{
    min-width:0;
    display:grid;
    grid-template-columns:14px minmax(0,1fr);
    align-items:center;
    gap:3px;
    padding:0 4px;
    border:0;
    border-top:1px solid var(--border-color,#4d4d4d28);
    border-radius:0;
    background:transparent;
    color:var(--text-secondary,#b0b0b0);
    text-align:left;
    cursor:pointer;
   }

   .sm-channel-inserts button:hover{
    background:var(--bg-button-hover,#414141);
    color:var(--text-primary,#fff);
   }

   .sm-channel-inserts button.empty{
    opacity:.55;
   }

   .sm-channel-inserts button.bypassed{
    text-decoration:line-through;
    opacity:.5;
   }

   .sm-channel-inserts button span{
    font-size:6px;
   }

   .sm-channel-inserts button strong{
    min-width:0;
    overflow:hidden;
    text-overflow:ellipsis;
    white-space:nowrap;
    font-size:6.5px;
    font-weight:500;
   }

   .sm-channel-processing{
    display:grid;
    grid-template-columns:1fr 1fr;
    border-bottom:1px solid var(--border-color,#4d4d4d40);
   }

   .sm-channel-processing button{
    min-width:0;
    display:flex;
    flex-direction:column;
    align-items:center;
    justify-content:center;
    gap:2px;
    border:0;
    border-right:1px solid var(--border-color,#4d4d4d40);
    border-radius:0;
    background:transparent;
    color:var(--text-secondary,#b0b0b0);
    cursor:pointer;
   }

   .sm-channel-processing button:last-child{
    border-right:0;
   }

   .sm-channel-processing button:hover,
   .sm-channel-processing button.active{
    background:var(--accent-blue-dark,#474747);
    color:var(--text-primary,#fff);
   }

   .sm-channel-processing button.disabled{
    pointer-events:none;
    opacity:.45;
   }

   .sm-channel-processing button span{
    font-size:7px;
    font-weight:700;
   }

   .sm-channel-processing button em{
    font-size:5.5px;
    font-style:normal;
   }

   .sm-channel-pan{
    display:grid;
    grid-template-rows:20px minmax(0,1fr);
    padding:0 5px 3px;
    border-bottom:1px solid var(--border-color,#4d4d4d40);
   }

   .sm-channel-pan input{
    width:100%;
    accent-color:var(--accent-blue,#5f5f5f);
   }

   .sm-channel-pan output{
    color:var(--text-primary,#fff);
   }

   .sm-channel-pan.master-pan>div{
    display:flex;
    align-items:center;
    justify-content:center;
    color:var(--text-secondary,#b0b0b0);
    font-size:7px;
   }

   .sm-channel-fader-area{
    min-height:0;
    display:grid;
    grid-template-columns:42px minmax(0,1fr);
    gap:5px;
    padding:6px 6px 4px;
   }

   .sm-channel-meter-wrap{
    min-height:0;
    display:grid;
    grid-template-columns:20px 11px;
    gap:3px;
   }

   .sm-channel-db-scale{
    min-height:0;
    display:flex;
    flex-direction:column;
    justify-content:space-between;
    align-items:flex-end;
    padding:0 1px;
    color:var(--text-secondary,#b0b0b0);
    font-size:5.5px;
   }

   .sm-channel-meter{
    position:relative;
    min-height:0;
    overflow:hidden;
    border:1px solid var(--border-color,#4d4d4d81);
    background:var(--primary-dark,#333);
   }

   .sm-channel-meter i,
   .sm-channel-meter b{
    position:absolute;
    left:1px;
    right:1px;
    bottom:1px;
    height:0;
    transition:height 42ms linear;
   }

   .sm-channel-meter i{
    background:var(--text-secondary,#b0b0b0);
    opacity:.72;
   }

   .sm-channel-meter b{
    left:3px;
    right:3px;
    background:var(--text-primary,#fff);
    opacity:.5;
   }

   .sm-channel-meter b.clip{
    opacity:1;
   }

   .sm-channel-fader{
    min-height:0;
    display:grid;
    grid-template-rows:minmax(0,1fr) 20px;
    justify-items:center;
   }

   .sm-channel-fader input{
    width:22px;
    height:100%;
    min-height:130px;
    writing-mode:vertical-lr;
    direction:rtl;
    accent-color:var(--accent-blue,#5f5f5f);
   }

   .sm-channel-fader output{
    align-self:center;
    min-width:35px;
    text-align:center;
    color:var(--text-primary,#fff);
    font-size:6.5px;
   }

   .sm-channel-buttons{
    display:grid;
    grid-template-columns:25px 25px minmax(0,1fr);
    align-items:center;
    gap:3px;
    padding:4px;
    border-top:1px solid var(--border-color,#4d4d4d40);
   }

   .sm-channel-buttons button,
   .sm-channel-buttons select{
    height:22px;
    min-width:0;
    border:1px solid var(--border-color,#4d4d4d81);
    border-radius:0;
    background:var(--bg-button,#363636);
    color:var(--text-secondary,#b0b0b0);
    font:inherit;
    font-size:6px;
   }

   .sm-channel-buttons button{
    cursor:pointer;
   }

   .sm-channel-buttons button.active{
    background:var(--accent-blue-dark,#474747);
    color:var(--text-primary,#fff);
   }

   .sm-channel-buttons button.disabled{
    pointer-events:none;
    opacity:.35;
   }

   .sm-channel-buttons span{
    justify-self:center;
    color:var(--text-secondary,#b0b0b0);
    font-size:6px;
   }

   .sm-master-summary{
    display:flex;
    flex-direction:column;
    align-items:center;
    justify-content:center;
    gap:4px;
    padding:6px;
    text-align:center;
   }

   .sm-master-summary strong{
    font-size:7px;
   }

   .sm-master-summary span{
    color:var(--text-secondary,#b0b0b0);
    font-size:6px;
   }
  `;

      document.head.appendChild(style);
    }

    destroy() {
      global.removeEventListener("audioStudioMeters", this._meters);

      global.removeEventListener(
        "audioStudioSelectionChanged",
        this._selection,
      );
    }
  }

  global.AudioMixerPanel = AudioMixerPanel;
})(window);
