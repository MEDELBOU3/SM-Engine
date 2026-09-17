/**
 * AudioEffectsRack.js
 * SM Engine — Phase 15 Channel processing panel.
 *
 * Tabs:
 * - 6-band EQ
 * - Dynamics
 * - 6 insert FX slots
 */
(function (global) {
  "use strict";

  class AudioEffectsRack {
    constructor(manager) {
      this.manager = manager;
      this.host = null;
      this.activeSection = "eq";
      this.eqCanvas = null;
      this.eqContext = null;
      this.resizeObserver = null;

      this._sectionEvent = (event) => {
        const section = event?.detail?.section;

        if (["eq", "dynamics", "inserts"].includes(section)) {
          this.activeSection = section;
          this.render();
        }
      };

      this._meterEvent = (event) => this._updateDynamicsMeter(event.detail);

      global.addEventListener("audioStudioChannelSection", this._sectionEvent);

      global.addEventListener("audioStudioMeters", this._meterEvent);

      this._styles();
    }

    mount(host) {
      this.host = host;

      this.resizeObserver?.disconnect?.();

      this.resizeObserver = new ResizeObserver(() => {
        if (this.activeSection === "eq") {
          this._resizeEQCanvas();
          this._drawEQ();
        }
      });

      if (host) {
        this.resizeObserver.observe(host);
      }

      this.render();
    }

    render() {
      if (!this.host) {
        return;
      }

      const track = this.manager.getSelectedTrack();

      if (!track) {
        this.host.innerHTML = `
    <div class="sm-channel-empty">
     <span>${this._svg("channel")}</span>
     <strong>Channel Processing</strong>
     <em>Select an audio or video track from the mixer.</em>
    </div>
   `;

        return;
      }

      const state = this.manager.ensureTrackState(track.id);

      this.host.innerHTML = `
   <section class="sm-channel-rack">
    <header class="sm-channel-rack-head">
     <div>
      <strong>${this._esc(track.name || track.id)}</strong>
      <span>CHANNEL STRIP · ${track.type === "audio" ? "AUDIO" : "VIDEO AUDIO"}</span>
     </div>

     <div class="sm-channel-rack-head-actions">
      <button
       type="button"
       data-channel-reset
       title="Reset Channel Processing">
       RESET
      </button>
     </div>
    </header>

    <nav class="sm-channel-rack-tabs">
     <button
      type="button"
      data-channel-section="eq"
      class="${this.activeSection === "eq" ? "active" : ""}">
      EQ
     </button>

     <button
      type="button"
      data-channel-section="dynamics"
      class="${this.activeSection === "dynamics" ? "active" : ""}">
      DYNAMICS
     </button>

     <button
      type="button"
      data-channel-section="inserts"
      class="${this.activeSection === "inserts" ? "active" : ""}">
      INSERTS
     </button>
    </nav>

    <div class="sm-channel-rack-content">
     ${
       this.activeSection === "dynamics"
         ? this._dynamics(track, state)
         : this.activeSection === "inserts"
           ? this._inserts(track, state)
           : this._eq(track, state)
     }
    </div>
   </section>
  `;

      this._bind(track, state);

      if (this.activeSection === "eq") {
        this.eqCanvas = this.host.querySelector("[data-eq-graph]");

        this.eqContext = this.eqCanvas?.getContext("2d");

        this._resizeEQCanvas();
        this._drawEQ();
      }
    }

    _eq(track, state) {
      return `
   <div class="sm-channel-eq">
    <div class="sm-channel-module-head">
     <div>
      <strong>6-BAND PARAMETRIC EQ</strong>
      <span>20 Hz — 20 kHz</span>
     </div>

     <label>
      <input
       type="checkbox"
       data-eq-enabled
       ${state.eq.enabled !== false ? "checked" : ""}>
      <span>ON</span>
     </label>
    </div>

    <div class="sm-eq-graph-wrap">
     <canvas data-eq-graph></canvas>

     <div class="sm-eq-graph-scale">
      <span>+18</span>
      <span>0</span>
      <span>-18</span>
     </div>

     <div class="sm-eq-frequency-scale">
      <span>20</span>
      <span>100</span>
      <span>1k</span>
      <span>10k</span>
      <span>20k</span>
     </div>
    </div>

    <div class="sm-eq-band-list">
     ${state.eq.bands.map((band, index) => this._eqBand(band, index)).join("")}
    </div>
   </div>
  `;
    }

    _eqBand(band, index) {
      const label = ["LOW", "LOW MID", "MID 1", "MID 2", "HIGH MID", "HIGH"][
        index
      ];

      return `
   <article
    class="sm-eq-band${band.enabled === false ? " disabled" : ""}"
    data-eq-band="${index}">

    <header>
     <strong>${index + 1}</strong>
     <span>${label}</span>

     <label>
      <input
       type="checkbox"
       data-eq-band-enabled="${index}"
       ${band.enabled !== false ? "checked" : ""}>
     </label>
    </header>

    <label class="sm-eq-type">
     <span>TYPE</span>

     <select data-eq-type="${index}">
      ${["lowshelf", "peaking", "highshelf", "highpass", "lowpass", "notch"]
        .map(
          (type) =>
            `<option value="${type}" ${band.type === type ? "selected" : ""}>${this._filterTypeName(type)}</option>`,
        )
        .join("")}
     </select>
    </label>

    ${this._parameter(
      "FREQ",
      "Hz",
      20,
      20000,
      1,
      band.frequency,
      `eq-freq-${index}`,
      true,
    )}

    ${this._parameter(
      "GAIN",
      "dB",
      -24,
      24,
      0.1,
      band.gain,
      `eq-gain-${index}`,
    )}

    ${this._parameter("Q", "", 0.1, 18, 0.1, band.q, `eq-q-${index}`)}
   </article>
  `;
    }

    _dynamics(track, state) {
      const compressor = state.compressor;

      const limiter = state.limiter;

      return `
   <div class="sm-channel-dynamics">
    <section class="sm-dynamics-module">
     <div class="sm-channel-module-head">
      <div>
       <strong>COMPRESSOR</strong>
       <span>Realtime track dynamics</span>
      </div>

      <label>
       <input
        type="checkbox"
        data-compressor-enabled
        ${compressor.enabled !== false ? "checked" : ""}>
       <span>ON</span>
      </label>
     </div>

     <div class="sm-dynamics-meter">
      <div>
       <span>GAIN REDUCTION</span>
       <output data-compressor-reduction>0.0 dB</output>
      </div>

      <i>
       <b data-compressor-reduction-bar></b>
      </i>
     </div>

     <div class="sm-dynamics-grid">
      ${this._parameter(
        "THRESHOLD",
        "dB",
        -60,
        0,
        0.5,
        compressor.threshold,
        "comp-threshold",
      )}

      ${this._parameter(
        "RATIO",
        ":1",
        1,
        20,
        0.1,
        compressor.ratio,
        "comp-ratio",
      )}

      ${this._parameter("KNEE", "dB", 0, 40, 0.5, compressor.knee, "comp-knee")}

      ${this._parameter(
        "ATTACK",
        "ms",
        1,
        200,
        1,
        Number(compressor.attack || 0) * 1000,
        "comp-attack",
      )}

      ${this._parameter(
        "RELEASE",
        "ms",
        10,
        2000,
        5,
        Number(compressor.release || 0) * 1000,
        "comp-release",
      )}
     </div>
    </section>

    <section class="sm-dynamics-module">
     <div class="sm-channel-module-head">
      <div>
       <strong>LIMITER</strong>
       <span>Peak protection after inserts</span>
      </div>

      <label>
       <input
        type="checkbox"
        data-limiter-enabled
        ${limiter.enabled !== false ? "checked" : ""}>
       <span>ON</span>
      </label>
     </div>

     <div class="sm-dynamics-grid">
      ${this._parameter(
        "CEILING",
        "dB",
        -12,
        0,
        0.1,
        limiter.threshold,
        "limiter-threshold",
      )}

      ${this._parameter(
        "ATTACK",
        "ms",
        1,
        100,
        1,
        Number(limiter.attack || 0) * 1000,
        "limiter-attack",
      )}

      ${this._parameter(
        "RELEASE",
        "ms",
        10,
        1000,
        5,
        Number(limiter.release || 0) * 1000,
        "limiter-release",
      )}
     </div>
    </section>
   </div>
  `;
    }

    _inserts(track, state) {
      const library = this.manager.effectLibrary();

      const slots = Array.from(
        {
          length: 6,
        },
        (_, slot) => state.effects[slot] || null,
      );

      return `
   <div class="sm-channel-insert-panel">
    <div class="sm-channel-module-head">
     <div>
      <strong>REALTIME INSERTS</strong>
      <span>Up to 6 effects per track</span>
     </div>

     <span class="sm-insert-count">
      ${state.effects.length}/6
     </span>
    </div>

    <div class="sm-insert-list">
     ${slots
       .map((effect, index) => this._insertSlot(track, effect, index, library))
       .join("")}
    </div>
   </div>
  `;
    }

    _insertSlot(track, effect, index, library) {
      if (!effect) {
        return `
    <article
     class="sm-insert-slot empty"
     data-insert-index="${index}">

     <header>
      <strong>${index + 1}</strong>
      <span>EMPTY INSERT</span>
     </header>

     <div class="sm-insert-add-row">
      <select data-insert-add="${index}">
       <option value="">Add Effect…</option>
       ${library
         .map(
           (entry) =>
             `<option value="${this._esc(entry.type)}">${this._esc(entry.name)}</option>`,
         )
         .join("")}
      </select>
     </div>
    </article>
   `;
      }

      return `
   <article
    class="sm-insert-slot${effect.enabled === false ? " bypassed" : ""}"
    data-effect-id="${this._esc(effect.id)}">

    <header>
     <strong>${index + 1}</strong>

     <span>${this._esc(effect.name)}</span>

     <div>
      <button
       type="button"
       data-effect-bypass="${this._esc(effect.id)}"
       title="Bypass Effect">
       ${effect.enabled === false ? "OFF" : "ON"}
      </button>

      <button
       type="button"
       data-effect-up="${this._esc(effect.id)}"
       title="Move Up">
       ↑
      </button>

      <button
       type="button"
       data-effect-down="${this._esc(effect.id)}"
       title="Move Down">
       ↓
      </button>

      <button
       type="button"
       data-effect-remove="${this._esc(effect.id)}"
       title="Remove">
       ×
      </button>
     </div>
    </header>

    <div class="sm-insert-controls">
     <label>
      <span>TYPE</span>

      <select data-effect-type="${this._esc(effect.id)}">
       ${library
         .map(
           (entry) =>
             `<option value="${this._esc(entry.type)}" ${effect.type === entry.type ? "selected" : ""}>${this._esc(entry.name)}</option>`,
         )
         .join("")}
      </select>
     </label>

     ${this._insertControls(effect)}
    </div>
   </article>
  `;
    }

    _insertControls(effect) {
      const p = effect.params || {};

      if (effect.type === "gain") {
        return this._parameter(
          "GAIN",
          "dB",
          -24,
          24,
          0.1,
          p.gainDb,
          `fx-${effect.id}-gainDb`,
        );
      }

      if (effect.type === "highpass" || effect.type === "lowpass") {
        return `
    ${this._parameter(
      "FREQUENCY",
      "Hz",
      20,
      20000,
      1,
      p.frequency,
      `fx-${effect.id}-frequency`,
      true,
    )}

    ${this._parameter("Q", "", 0.1, 18, 0.1, p.q, `fx-${effect.id}-q`)}
   `;
      }

      if (effect.type === "compressor") {
        return `
    ${this._parameter(
      "THRESHOLD",
      "dB",
      -60,
      0,
      0.5,
      p.threshold,
      `fx-${effect.id}-threshold`,
    )}

    ${this._parameter(
      "RATIO",
      ":1",
      1,
      20,
      0.1,
      p.ratio,
      `fx-${effect.id}-ratio`,
    )}
   `;
      }

      if (effect.type === "delay") {
        return `
    ${this._parameter(
      "MIX",
      "%",
      0,
      100,
      1,
      Number(effect.mix || 0) * 100,
      `fx-${effect.id}-mix`,
    )}

    ${this._parameter(
      "TIME",
      "ms",
      1,
      1500,
      1,
      Number(p.time || 0) * 1000,
      `fx-${effect.id}-time`,
    )}

    ${this._parameter(
      "FEEDBACK",
      "%",
      0,
      92,
      1,
      Number(p.feedback || 0) * 100,
      `fx-${effect.id}-feedback`,
    )}
   `;
      }

      if (effect.type === "reverb") {
        return `
    ${this._parameter(
      "MIX",
      "%",
      0,
      100,
      1,
      Number(effect.mix || 0) * 100,
      `fx-${effect.id}-mix`,
    )}

    ${this._parameter(
      "DECAY",
      "s",
      0.2,
      6,
      0.1,
      p.decay,
      `fx-${effect.id}-decay`,
    )}

    ${this._parameter(
      "DAMPING",
      "%",
      0,
      100,
      1,
      Number(p.damping || 0) * 100,
      `fx-${effect.id}-damping`,
    )}
   `;
      }

      return "";
    }

    _parameter(label, unit, min, max, step, value, id, logarithmic = false) {
      const safe = Number.isFinite(Number(value)) ? Number(value) : 0;

      let sliderValue = safe;

      let sliderMin = min;

      let sliderMax = max;

      let sliderStep = step;

      if (logarithmic) {
        const logMin = Math.log10(Math.max(20, min));

        const logMax = Math.log10(Math.max(20, max));

        const safeLog = Math.log10(Math.max(20, safe));

        sliderMin = logMin;

        sliderMax = logMax;

        sliderStep = 0.001;

        sliderValue = safeLog;
      }

      return `
   <label
    class="sm-channel-param"
    data-param-row="${this._esc(id)}">

    <span>${this._esc(label)}</span>

    <input
     type="range"
     min="${sliderMin}"
     max="${sliderMax}"
     step="${sliderStep}"
     value="${sliderValue}"
     data-channel-param="${this._esc(id)}"
     ${logarithmic ? 'data-logarithmic="true"' : ""}>

    <output data-channel-output="${this._esc(id)}">
     ${this._formatValue(safe, unit)}
    </output>
   </label>
  `;
    }

    _bind(track, state) {
      this.host?.querySelectorAll("[data-channel-section]").forEach((button) =>
        button.addEventListener("click", () => {
          this.activeSection = button.dataset.channelSection;

          this.render();
        }),
      );

      this.host
        ?.querySelector("[data-channel-reset]")
        ?.addEventListener("click", () => {
          const id = track.id;

          const audio = this.manager.project?.state?.audio;

          if (audio?.trackStates) {
            delete audio.trackStates[id];
          }

          this.manager.ensureTrackState(id);

          this.manager._touch(id, "channel-reset");

          this.manager._rebuildInsertChain(id);

          this.manager.updateTrackBus(id);

          this.render();
        });

      this._bindEQ(track);

      this._bindDynamics(track);

      this._bindInserts(track);
    }

    _bindEQ(track) {
      const id = track.id;

      this.host
        ?.querySelector("[data-eq-enabled]")
        ?.addEventListener("change", (event) => {
          this.manager.setTrackEQ(id, {
            enabled: event.target.checked,
          });

          this._drawEQ();
        });

      for (let index = 0; index < 6; index++) {
        this.host
          ?.querySelector(`[data-eq-band-enabled="${index}"]`)
          ?.addEventListener("change", (event) => {
            this.manager.setEQBand(id, index, {
              enabled: event.target.checked,
            });

            this._drawEQ();
          });

        this.host
          ?.querySelector(`[data-eq-type="${index}"]`)
          ?.addEventListener("change", (event) => {
            this.manager.setEQBand(id, index, {
              type: event.target.value,
            });

            this._drawEQ();
          });

        this._bindParam(`eq-freq-${index}`, (value) => {
          this.manager.setEQBand(id, index, {
            frequency: value,
          });

          this._drawEQ();
        });

        this._bindParam(`eq-gain-${index}`, (value) => {
          this.manager.setEQBand(id, index, {
            gain: value,
          });

          this._drawEQ();
        });

        this._bindParam(`eq-q-${index}`, (value) => {
          this.manager.setEQBand(id, index, {
            q: value,
          });

          this._drawEQ();
        });
      }
    }

    _bindDynamics(track) {
      const id = track.id;

      this.host
        ?.querySelector("[data-compressor-enabled]")
        ?.addEventListener("change", (event) =>
          this.manager.setTrackCompressor(id, {
            enabled: event.target.checked,
          }),
        );

      this._bindParam("comp-threshold", (value) =>
        this.manager.setTrackCompressor(id, {
          threshold: value,
        }),
      );

      this._bindParam("comp-ratio", (value) =>
        this.manager.setTrackCompressor(id, {
          ratio: value,
        }),
      );

      this._bindParam("comp-knee", (value) =>
        this.manager.setTrackCompressor(id, {
          knee: value,
        }),
      );

      this._bindParam("comp-attack", (value) =>
        this.manager.setTrackCompressor(id, {
          attack: value / 1000,
        }),
      );

      this._bindParam("comp-release", (value) =>
        this.manager.setTrackCompressor(id, {
          release: value / 1000,
        }),
      );

      this.host
        ?.querySelector("[data-limiter-enabled]")
        ?.addEventListener("change", (event) =>
          this.manager.setTrackLimiter(id, {
            enabled: event.target.checked,
          }),
        );

      this._bindParam("limiter-threshold", (value) =>
        this.manager.setTrackLimiter(id, {
          threshold: value,
        }),
      );

      this._bindParam("limiter-attack", (value) =>
        this.manager.setTrackLimiter(id, {
          attack: value / 1000,
        }),
      );

      this._bindParam("limiter-release", (value) =>
        this.manager.setTrackLimiter(id, {
          release: value / 1000,
        }),
      );
    }

    _bindInserts(track) {
      const id = track.id;

      this.host?.querySelectorAll("[data-insert-add]").forEach((select) =>
        select.addEventListener("change", () => {
          if (!select.value) {
            return;
          }

          this.manager.addTrackEffect(id, select.value);

          this.render();
        }),
      );

      this.host?.querySelectorAll("[data-effect-bypass]").forEach((button) =>
        button.addEventListener("click", () => {
          const effect = this.manager
            .ensureTrackState(id)
            .effects.find(
              (candidate) => candidate.id === button.dataset.effectBypass,
            );

          if (!effect) {
            return;
          }

          this.manager.updateTrackEffect(id, effect.id, {
            enabled: !effect.enabled,
          });

          this.render();
        }),
      );

      this.host?.querySelectorAll("[data-effect-type]").forEach((select) =>
        select.addEventListener("change", () => {
          this.manager.updateTrackEffect(id, select.dataset.effectType, {
            type: select.value,
          });

          this.render();
        }),
      );

      this.host?.querySelectorAll("[data-effect-remove]").forEach((button) =>
        button.addEventListener("click", () => {
          this.manager.removeTrackEffect(id, button.dataset.effectRemove);

          this.render();
        }),
      );

      this.host?.querySelectorAll("[data-effect-up]").forEach((button) =>
        button.addEventListener("click", () => {
          this.manager.moveTrackEffect(id, button.dataset.effectUp, -1);

          this.render();
        }),
      );

      this.host?.querySelectorAll("[data-effect-down]").forEach((button) =>
        button.addEventListener("click", () => {
          this.manager.moveTrackEffect(id, button.dataset.effectDown, 1);

          this.render();
        }),
      );

      const state = this.manager.ensureTrackState(id);

      for (const effect of state.effects) {
        const prefix = `fx-${effect.id}-`;

        const updateParam = (suffix, transform = (value) => value) => {
          this._bindParam(`${prefix}${suffix}`, (value) => {
            this.manager.updateTrackEffect(id, effect.id, {
              params: {
                [suffix]: transform(value),
              },
            });
          });
        };

        if (effect.type === "gain") {
          updateParam("gainDb");
        } else if (effect.type === "highpass" || effect.type === "lowpass") {
          updateParam("frequency");

          updateParam("q");
        } else if (effect.type === "compressor") {
          updateParam("threshold");

          updateParam("ratio");
        } else if (effect.type === "delay") {
          this._bindEffectMix(id, effect);

          updateParam("time", (value) => value / 1000);

          updateParam("feedback", (value) => value / 100);
        } else if (effect.type === "reverb") {
          this._bindEffectMix(id, effect);

          updateParam("decay");

          updateParam("damping", (value) => value / 100);
        }
      }
    }

    _bindEffectMix(trackId, effect) {
      this._bindParam(`fx-${effect.id}-mix`, (value) => {
        this.manager.updateTrackEffect(trackId, effect.id, {
          mix: value / 100,
        });
      });
    }

    _bindParam(id, callback) {
      const input = this.host?.querySelector(
        `[data-channel-param="${CSS.escape(id)}"]`,
      );

      const output = this.host?.querySelector(
        `[data-channel-output="${CSS.escape(id)}"]`,
      );

      input?.addEventListener("input", () => {
        let value = Number(input.value);

        if (input.dataset.logarithmic === "true") {
          value = Math.pow(10, value);
        }

        if (output) {
          const row = input.closest(".sm-channel-param");

          const label = row?.querySelector(":scope>span")?.textContent || "";

          output.textContent = this._formatDynamic(label, value);
        }

        callback(value);
      });
    }

    _resizeEQCanvas() {
      if (!this.eqCanvas) {
        return;
      }

      const rect = this.eqCanvas.getBoundingClientRect();

      const dpr = Math.min(2, global.devicePixelRatio || 1);

      const width = Math.max(1, Math.round(rect.width * dpr));

      const height = Math.max(1, Math.round(rect.height * dpr));

      if (this.eqCanvas.width !== width) {
        this.eqCanvas.width = width;
      }

      if (this.eqCanvas.height !== height) {
        this.eqCanvas.height = height;
      }
    }

    _drawEQ() {
      if (!this.eqCanvas || !this.eqContext) {
        return;
      }

      const rect = this.eqCanvas.getBoundingClientRect();

      const width = rect.width;

      const height = rect.height;

      if (width <= 0 || height <= 0) {
        return;
      }

      const dpr = Math.min(2, global.devicePixelRatio || 1);

      const context = this.eqContext;

      const styles = getComputedStyle(document.documentElement);

      const background =
        styles.getPropertyValue("--primary-dark").trim() || "#333333";

      const border =
        styles.getPropertyValue("--border-color").trim() || "#4d4d4d";

      const line =
        styles.getPropertyValue("--text-primary").trim() || "#ffffff";

      const secondary =
        styles.getPropertyValue("--text-secondary").trim() || "#b0b0b0";

      context.setTransform(dpr, 0, 0, dpr, 0, 0);

      context.clearRect(0, 0, width, height);

      context.fillStyle = background;

      context.fillRect(0, 0, width, height);

      context.strokeStyle = border;

      context.lineWidth = 1;

      context.beginPath();

      const dbLines = [-18, -12, -6, 0, 6, 12, 18];

      dbLines.forEach((db) => {
        const y = height / 2 - (db / 36) * height;

        context.moveTo(0, y + 0.5);

        context.lineTo(width, y + 0.5);
      });

      [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000].forEach(
        (frequency) => {
          const x = this._frequencyX(frequency, width);

          context.moveTo(x + 0.5, 0);

          context.lineTo(x + 0.5, height);
        },
      );

      context.stroke();

      const track = this.manager.getSelectedTrack();

      const response = track
        ? this.manager.getTrackFrequencyResponse(
            track.id,
            Math.max(80, Math.round(width)),
          )
        : null;

      if (!response) {
        return;
      }

      context.strokeStyle = line;

      context.lineWidth = 1.5;

      context.beginPath();

      const values = response.magnitudeDb;

      for (let index = 0; index < values.length; index++) {
        const x = (index / Math.max(1, values.length - 1)) * width;

        const db = Math.max(-18, Math.min(18, values[index]));

        const y = height / 2 - (db / 36) * height;

        if (index === 0) {
          context.moveTo(x, y);
        } else {
          context.lineTo(x, y);
        }
      }

      context.stroke();

      const state = track ? this.manager.ensureTrackState(track.id) : null;

      state?.eq?.bands?.forEach((band, index) => {
        const x = this._frequencyX(band.frequency, width);

        const y =
          height / 2 -
          (this._clamp(Number(band.gain || 0), -18, 18) / 36) * height;

        context.beginPath();

        context.fillStyle = band.enabled === false ? secondary : line;

        context.arc(x, y, 3.3, 0, Math.PI * 2);

        context.fill();

        context.fillStyle = background;

        context.font = "6px sans-serif";

        context.textAlign = "center";

        context.textBaseline = "middle";

        context.fillText(String(index + 1), x, y + 0.5);
      });
    }

    _frequencyX(frequency, width) {
      const min = 20;
      const max = 20000;

      const ratio =
        (Math.log10(Math.max(min, frequency)) - Math.log10(min)) /
        (Math.log10(max) - Math.log10(min));

      return ratio * width;
    }

    _updateDynamicsMeter(detail) {
      if (this.activeSection !== "dynamics" || !this.host) {
        return;
      }

      const track = this.manager.getSelectedTrack();

      if (!track) {
        return;
      }

      const meter = detail?.tracks?.[track.id];

      const reduction = Math.abs(Number(meter?.reductionDb || 0));

      const output = this.host.querySelector("[data-compressor-reduction]");

      if (output) {
        output.textContent = `${reduction.toFixed(1)} dB`;
      }

      const bar = this.host.querySelector("[data-compressor-reduction-bar]");

      if (bar) {
        bar.style.width = `${Math.min(100, (reduction / 24) * 100)}%`;
      }
    }

    _filterTypeName(type) {
      return (
        {
          lowshelf: "Low Shelf",
          highshelf: "High Shelf",
          peaking: "Bell",
          notch: "Notch",
          highpass: "High Pass",
          lowpass: "Low Pass",
        }[type] || type
      );
    }

    _formatDynamic(label, value) {
      if (label.includes("FREQ") || label.includes("FREQUENCY")) {
        return this._formatValue(value, "Hz");
      }

      if (
        label.includes("ATTACK") ||
        label.includes("RELEASE") ||
        label.includes("TIME")
      ) {
        return this._formatValue(value, "ms");
      }

      if (label.includes("RATIO")) {
        return this._formatValue(value, ":1");
      }

      if (
        label.includes("MIX") ||
        label.includes("FEEDBACK") ||
        label.includes("DAMPING")
      ) {
        return this._formatValue(value, "%");
      }

      if (label.includes("DECAY")) {
        return this._formatValue(value, "s");
      }

      if (
        label.includes("GAIN") ||
        label.includes("THRESHOLD") ||
        label.includes("KNEE") ||
        label.includes("CEILING")
      ) {
        return this._formatValue(value, "dB");
      }

      return Number(value).toFixed(2);
    }

    _formatValue(value, unit) {
      const number = Number(value);

      if (unit === "Hz") {
        if (number >= 1000) {
          return `${(number / 1000).toFixed(number >= 10000 ? 1 : 2)}k`;
        }

        return `${Math.round(number)} Hz`;
      }

      if (unit === "ms") {
        return `${Math.round(number)} ms`;
      }

      if (unit === ":1") {
        return `${number.toFixed(1)}:1`;
      }

      if (unit === "%") {
        return `${Math.round(number)}%`;
      }

      if (unit === "s") {
        return `${number.toFixed(1)} s`;
      }

      if (unit === "dB") {
        return `${number.toFixed(1)} dB`;
      }

      return number.toFixed(2);
    }

    _clamp(value, min, max) {
      return Math.max(min, Math.min(max, value));
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
        channel:
          '<svg viewBox="0 0 24 24"><path d="M5 4v16M12 4v16M19 4v16"/><path d="M2 8h6M9 15h6M16 10h6"/></svg>',
      };

      return icons[name] || icons.channel;
    }

    _styles() {
      if (document.getElementById("sm-channel-rack-style")) {
        return;
      }

      const style = document.createElement("style");

      style.id = "sm-channel-rack-style";

      style.textContent = `
   .sm-channel-rack{
    height:100%;
    min-width:0;
    min-height:0;
    display:grid;
    grid-template-rows:38px 29px minmax(0,1fr);
    background:var(--panel-bg,var(--primary-dark,#333));
    color:var(--text-primary,#fff);
   }

   .sm-channel-rack *{
    box-sizing:border-box;
   }

   .sm-channel-rack-head{
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:6px;
    padding:0 7px;
    border-bottom:1px solid var(--border-color,#4d4d4d81);
    background:var(--header-bg,var(--secondary-dark,#3c3c3c));
   }

   .sm-channel-rack-head strong,
   .sm-channel-rack-head span{
    display:block;
   }

   .sm-channel-rack-head strong{
    max-width:240px;
    overflow:hidden;
    text-overflow:ellipsis;
    white-space:nowrap;
    font-size:9px;
   }

   .sm-channel-rack-head span{
    margin-top:2px;
    color:var(--text-secondary,#b0b0b0);
    font-size:6px;
   }

   .sm-channel-rack-head-actions button{
    height:20px;
    padding:0 6px;
    border:1px solid var(--border-color,#4d4d4d81);
    border-radius:0;
    background:var(--bg-button,#363636);
    color:var(--text-secondary,#b0b0b0);
    font-size:6px;
    cursor:pointer;
   }

   .sm-channel-rack-tabs{
    display:grid;
    grid-template-columns:repeat(3,1fr);
    border-bottom:1px solid var(--border-color,#4d4d4d81);
    background:var(--secondary-dark,#3c3c3c);
   }

   .sm-channel-rack-tabs button{
    border:0;
    border-right:1px solid var(--border-color,#4d4d4d40);
    border-radius:0;
    background:transparent;
    color:var(--text-secondary,#b0b0b0);
    font-size:7px;
    font-weight:700;
    cursor:pointer;
   }

   .sm-channel-rack-tabs button:last-child{
    border-right:0;
   }

   .sm-channel-rack-tabs button:hover,
   .sm-channel-rack-tabs button.active{
    background:var(--accent-blue-dark,#474747);
    color:var(--text-primary,#fff);
   }

   .sm-channel-rack-content{
    min-height:0;
    overflow:auto;
   }

   .sm-channel-module-head{
    min-height:34px;
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:6px;
    padding:4px 7px;
    border-bottom:1px solid var(--border-color,#4d4d4d40);
    background:var(--panel-bg,var(--primary-dark,#333));
   }

   .sm-channel-module-head strong,
   .sm-channel-module-head span{
    display:block;
   }

   .sm-channel-module-head strong{
    font-size:7px;
    letter-spacing:.25px;
   }

   .sm-channel-module-head div>span{
    margin-top:2px;
    color:var(--text-secondary,#b0b0b0);
    font-size:6px;
   }

   .sm-channel-module-head label{
    display:flex;
    align-items:center;
    gap:4px;
    color:var(--text-secondary,#b0b0b0);
    font-size:6px;
   }

   .sm-channel-module-head input[type=checkbox]{
    accent-color:var(--accent-blue,#5f5f5f);
   }

   .sm-eq-graph-wrap{
    position:relative;
    height:145px;
    margin:6px;
    border:1px solid var(--border-color,#4d4d4d81);
    background:var(--primary-dark,#333);
   }

   .sm-eq-graph-wrap canvas{
    width:100%;
    height:100%;
    display:block;
   }

   .sm-eq-graph-scale{
    position:absolute;
    inset:4px 4px 4px auto;
    display:flex;
    flex-direction:column;
    justify-content:space-between;
    color:var(--text-secondary,#b0b0b0);
    font-size:5px;
    pointer-events:none;
   }

   .sm-eq-frequency-scale{
    position:absolute;
    left:4px;
    right:22px;
    bottom:3px;
    display:flex;
    justify-content:space-between;
    color:var(--text-secondary,#b0b0b0);
    font-size:5px;
    pointer-events:none;
   }

   .sm-eq-band-list{
    display:grid;
    grid-template-columns:repeat(2,minmax(0,1fr));
    gap:4px;
    padding:0 6px 7px;
   }

   .sm-eq-band{
    min-width:0;
    border:1px solid var(--border-color,#4d4d4d81);
    background:var(--panel-bg,var(--primary-dark,#333));
   }

   .sm-eq-band.disabled{
    opacity:.55;
   }

   .sm-eq-band>header{
    height:24px;
    display:grid;
    grid-template-columns:18px minmax(0,1fr) auto;
    align-items:center;
    gap:4px;
    padding:0 5px;
    border-bottom:1px solid var(--border-color,#4d4d4d40);
    background:var(--secondary-dark,#3c3c3c);
   }

   .sm-eq-band>header strong{
    font-size:7px;
   }

   .sm-eq-band>header span{
    color:var(--text-secondary,#b0b0b0);
    font-size:6px;
   }

   .sm-eq-band>header input{
    accent-color:var(--accent-blue,#5f5f5f);
   }

   .sm-eq-type{
    min-height:25px;
    display:grid;
    grid-template-columns:45px minmax(0,1fr);
    align-items:center;
    gap:4px;
    padding:0 5px;
    color:var(--text-secondary,#b0b0b0);
    font-size:6px;
   }

   .sm-eq-type select,
   .sm-insert-controls select,
   .sm-insert-add-row select{
    width:100%;
    height:20px;
    min-width:0;
    border:1px solid var(--input-border,var(--border-color,#4d4d4d81));
    border-radius:0;
    background:var(--input-bg,var(--secondary-dark,#3c3c3c));
    color:var(--text-primary,#fff);
    font:inherit;
    font-size:6px;
   }

   .sm-channel-param{
    min-height:27px;
    display:grid;
    grid-template-columns:56px minmax(0,1fr) 55px;
    align-items:center;
    gap:5px;
    padding:0 5px;
    color:var(--text-secondary,#b0b0b0);
    font-size:6px;
   }

   .sm-channel-param input{
    width:100%;
    min-width:0;
    accent-color:var(--accent-blue,#5f5f5f);
   }

   .sm-channel-param output{
    text-align:right;
    color:var(--text-primary,#fff);
    font-size:6px;
    white-space:nowrap;
   }

   .sm-channel-dynamics{
    display:grid;
    gap:6px;
    padding:6px;
   }

   .sm-dynamics-module{
    border:1px solid var(--border-color,#4d4d4d81);
   }

   .sm-dynamics-grid{
    display:grid;
    padding:4px 0 6px;
   }

   .sm-dynamics-meter{
    display:grid;
    grid-template-columns:120px minmax(0,1fr);
    align-items:center;
    gap:7px;
    padding:7px;
    border-bottom:1px solid var(--border-color,#4d4d4d40);
   }

   .sm-dynamics-meter>div{
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:5px;
    color:var(--text-secondary,#b0b0b0);
    font-size:6px;
   }

   .sm-dynamics-meter output{
    color:var(--text-primary,#fff);
   }

   .sm-dynamics-meter>i{
    height:7px;
    overflow:hidden;
    border:1px solid var(--border-color,#4d4d4d81);
    background:var(--primary-dark,#333);
   }

   .sm-dynamics-meter>i>b{
    display:block;
    width:0;
    height:100%;
    background:var(--text-secondary,#b0b0b0);
    transition:width 45ms linear;
   }

   .sm-insert-count{
    color:var(--text-primary,#fff)!important;
    font-size:7px!important;
   }

   .sm-insert-list{
    display:grid;
    gap:4px;
    padding:6px;
   }

   .sm-insert-slot{
    border:1px solid var(--border-color,#4d4d4d81);
    background:var(--panel-bg,var(--primary-dark,#333));
   }

   .sm-insert-slot.bypassed{
    opacity:.55;
   }

   .sm-insert-slot>header{
    min-height:27px;
    display:grid;
    grid-template-columns:18px minmax(0,1fr) auto;
    align-items:center;
    gap:4px;
    padding:0 5px;
    border-bottom:1px solid var(--border-color,#4d4d4d40);
    background:var(--secondary-dark,#3c3c3c);
   }

   .sm-insert-slot>header>strong{
    font-size:7px;
   }

   .sm-insert-slot>header>span{
    min-width:0;
    overflow:hidden;
    text-overflow:ellipsis;
    white-space:nowrap;
    font-size:7px;
   }

   .sm-insert-slot>header>div{
    display:flex;
    gap:2px;
   }

   .sm-insert-slot>header button{
    height:19px;
    min-width:20px;
    padding:0 4px;
    border:1px solid var(--border-color,#4d4d4d81);
    border-radius:0;
    background:var(--bg-button,#363636);
    color:var(--text-secondary,#b0b0b0);
    font-size:6px;
    cursor:pointer;
   }

   .sm-insert-controls{
    display:grid;
    padding:4px 0 6px;
   }

   .sm-insert-controls>label:not(.sm-channel-param){
    min-height:26px;
    display:grid;
    grid-template-columns:56px minmax(0,1fr);
    align-items:center;
    gap:5px;
    padding:0 5px;
    color:var(--text-secondary,#b0b0b0);
    font-size:6px;
   }

   .sm-insert-add-row{
    padding:6px;
   }

   .sm-channel-empty{
    height:100%;
    min-height:160px;
    display:flex;
    flex-direction:column;
    align-items:center;
    justify-content:center;
    gap:5px;
    padding:12px;
    color:var(--text-secondary,#b0b0b0);
    text-align:center;
   }

   .sm-channel-empty>span{
    width:25px;
    height:25px;
   }

   .sm-channel-empty svg{
    width:100%;
    height:100%;
    fill:none;
    stroke:currentColor;
    stroke-width:1.5;
   }

   .sm-channel-empty strong{
    color:var(--text-primary,#fff);
    font-size:9px;
   }

   .sm-channel-empty em{
    max-width:230px;
    font-size:7px;
    font-style:normal;
   }

   @media (max-width:520px){
    .sm-eq-band-list{
     grid-template-columns:1fr;
    }

    .sm-channel-param{
     grid-template-columns:48px minmax(0,1fr) 48px;
    }
   }
  `;

      document.head.appendChild(style);
    }

    destroy() {
      this.resizeObserver?.disconnect?.();

      global.removeEventListener(
        "audioStudioChannelSection",
        this._sectionEvent,
      );

      global.removeEventListener("audioStudioMeters", this._meterEvent);
    }
  }

  global.AudioEffectsRack = AudioEffectsRack;
})(window);
