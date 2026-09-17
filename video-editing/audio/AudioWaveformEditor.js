/**
 * AudioWaveformEditor.js
 * SM Engine — Phase 15 detailed clip waveform editor.
 *
 * Non-destructive controls:
 * - scrub
 * - zoom / pan
 * - clip gain
 * - clip mute
 * - waveform overview
 */
(function (global) {
  "use strict";

  class AudioWaveformEditor {
    constructor(manager) {
      this.manager = manager;
      this.host = null;
      this.canvas = null;
      this.context = null;
      this.clip = null;

      this.zoom = 1;
      this.offset = 0;

      this.resizeObserver = null;
      this.dragging = false;

      this._timelineEvent = () => this.updatePlayhead();

      global.addEventListener("audioStudioTrackChanged", this._timelineEvent);

      this._styles();
    }

    mount(host) {
      this.host = host;

      if (!host) {
        return;
      }

      host.innerHTML = `
   <section class="sm-pro-waveform">
    <header class="sm-pro-waveform-head">
     <div class="sm-pro-waveform-title">
      <strong data-wave-name>WAVEFORM</strong>
      <span data-wave-meta>Select a timeline clip</span>
     </div>

     <div class="sm-pro-waveform-tools">
      <button type="button" data-wave-action="zoom-out">−</button>
      <output data-wave-zoom>100%</output>
      <button type="button" data-wave-action="zoom-in">+</button>
      <button type="button" data-wave-action="fit">FIT</button>
     </div>
    </header>

    <div class="sm-pro-waveform-properties">
     <label>
      <span>CLIP GAIN</span>
      <input
       type="range"
       min="-60"
       max="12"
       step=".1"
       value="0"
       data-wave-gain>
      <output data-wave-gain-read>0.0 dB</output>
     </label>

     <button
      type="button"
      data-wave-action="mute"
      data-wave-mute>
      MUTE
     </button>

     <span data-wave-source-info>
      NO SOURCE
     </span>
    </div>

    <div class="sm-pro-waveform-ruler">
     <canvas data-wave-ruler></canvas>
    </div>

    <div class="sm-pro-waveform-wrap">
     <canvas data-wave-canvas></canvas>

     <i
      class="sm-pro-waveform-playhead"
      data-wave-playhead>
     </i>

     <div
      class="sm-pro-waveform-empty"
      data-wave-empty>
      <strong>No analyzed waveform</strong>
      <span>Select an audio/video clip with audio peak data.</span>
     </div>
    </div>

    <footer class="sm-pro-waveform-footer">
     <span data-wave-start>START 00:00:00:00</span>
     <strong data-wave-time>00:00:00:00</strong>
     <span data-wave-end>END 00:00:00:00</span>
    </footer>
   </section>
  `;

      this.canvas = host.querySelector("[data-wave-canvas]");

      this.ruler = host.querySelector("[data-wave-ruler]");

      this.context = this.canvas?.getContext("2d");

      this.rulerContext = this.ruler?.getContext("2d");

      this._bind();

      this.resizeObserver?.disconnect?.();

      this.resizeObserver = new ResizeObserver(() => {
        this._resize();
        this.draw();
        this._drawRuler();
      });

      this.resizeObserver.observe(host);

      this.render();
    }

    render() {
      if (!this.host) {
        return;
      }

      this.clip = this.manager.getSelectedClip();

      const empty = this.host.querySelector("[data-wave-empty]");

      if (!this.clip) {
        if (empty) {
          empty.hidden = false;
        }

        this._setText("[data-wave-name]", "WAVEFORM");

        this._setText("[data-wave-meta]", "Select a timeline clip");

        this._setText("[data-wave-source-info]", "NO SOURCE");

        this.draw();
        this._drawRuler();

        return;
      }

      const source = this._source(this.clip);

      const peaks = this._peaks(this.clip, source);

      if (empty) {
        empty.hidden = !!peaks?.length;
      }

      const duration = Math.max(0, Number(this.clip.duration || 0));

      this._setText(
        "[data-wave-name]",
        this.clip.name || source?.name || "Audio Clip",
      );

      this._setText(
        "[data-wave-meta]",
        `${String(this.clip.mediaType || source?.mediaType || "media").toUpperCase()} · ${this._time(duration)}`,
      );

      this._setText(
        "[data-wave-source-info]",
        source
          ? `${source.name || "SOURCE"} · ${source.audioChannels || 2}ch`
          : "TIMELINE SOURCE",
      );

      this._setText(
        "[data-wave-start]",
        `START ${this._time(Number(this.clip.start || 0))}`,
      );

      this._setText(
        "[data-wave-end]",
        `END ${this._time(Number(this.clip.start || 0) + duration)}`,
      );

      const gain = this.host.querySelector("[data-wave-gain]");

      const gainRead = this.host.querySelector("[data-wave-gain-read]");

      const gainDb = this.manager.gainToDb(this.clip.volume ?? 1);

      if (gain) {
        gain.value = Math.max(-60, Math.min(12, gainDb));
      }

      if (gainRead) {
        gainRead.textContent = this._dbText(gainDb);
      }

      const mute = this.host.querySelector("[data-wave-mute]");

      mute?.classList.toggle("active", !!this.clip.muted);

      this._updateZoomLabel();
      this._resize();
      this.draw();
      this._drawRuler();
      this.updatePlayhead();
    }

    draw() {
      if (!this.context || !this.canvas) {
        return;
      }

      const rect = this.canvas.getBoundingClientRect();

      const width = rect.width;

      const height = rect.height;

      if (width <= 0 || height <= 0) {
        return;
      }

      const dpr = Math.min(2, global.devicePixelRatio || 1);

      const context = this.context;

      const styles = getComputedStyle(document.documentElement);

      const background =
        styles.getPropertyValue("--primary-dark").trim() || "#333333";

      const border =
        styles.getPropertyValue("--border-color").trim() || "#4d4d4d";

      const wave =
        styles.getPropertyValue("--text-secondary").trim() || "#b0b0b0";

      const primary =
        styles.getPropertyValue("--text-primary").trim() || "#ffffff";

      context.setTransform(dpr, 0, 0, dpr, 0, 0);

      context.clearRect(0, 0, width, height);

      context.fillStyle = background;

      context.fillRect(0, 0, width, height);

      context.strokeStyle = border;

      context.lineWidth = 1;

      context.beginPath();

      for (let y = height / 4; y < height; y += height / 4) {
        context.moveTo(0, y + 0.5);

        context.lineTo(width, y + 0.5);
      }

      const seconds = this._visibleDuration();

      const duration = Math.max(0.001, Number(this.clip?.duration || 1));

      const lines = Math.max(4, Math.floor(seconds));

      for (let index = 0; index <= lines; index++) {
        const x = (index / Math.max(1, lines)) * width;

        context.moveTo(x + 0.5, 0);

        context.lineTo(x + 0.5, height);
      }

      context.stroke();

      if (!this.clip) {
        return;
      }

      const peaks = this._peaks(this.clip, this._source(this.clip));

      if (!peaks?.length) {
        return;
      }

      const visibleFraction = 1 / this.zoom;

      const startFraction = this._clamp(this.offset, 0, 1 - visibleFraction);

      const startIndex = Math.floor(peaks.length * startFraction);

      const endIndex = Math.min(
        peaks.length,
        Math.ceil(startIndex + peaks.length * visibleFraction),
      );

      const count = Math.max(1, endIndex - startIndex);

      const center = height / 2;

      const amplitude = Math.max(4, height * 0.44);

      context.strokeStyle = wave;

      context.lineWidth = 1;

      context.beginPath();

      for (let x = 0; x < width; x++) {
        const ratio = x / Math.max(1, width - 1);

        const index =
          startIndex + Math.min(count - 1, Math.floor(ratio * count));

        const value = this._clamp(Number(peaks[index] || 0), 0, 1);

        const heightValue = value * amplitude;

        context.moveTo(x + 0.5, center - heightValue);

        context.lineTo(x + 0.5, center + heightValue);
      }

      context.stroke();

      /*
       * Center line.
       */
      context.strokeStyle = primary;

      context.globalAlpha = 0.26;

      context.beginPath();

      context.moveTo(0, center + 0.5);

      context.lineTo(width, center + 0.5);

      context.stroke();

      context.globalAlpha = 1;
    }

    _drawRuler() {
      if (!this.ruler || !this.rulerContext) {
        return;
      }

      const rect = this.ruler.getBoundingClientRect();

      const width = rect.width;

      const height = rect.height;

      if (width <= 0 || height <= 0) {
        return;
      }

      const dpr = Math.min(2, global.devicePixelRatio || 1);

      const context = this.rulerContext;

      const styles = getComputedStyle(document.documentElement);

      const background =
        styles.getPropertyValue("--header-bg").trim() || "#3c3c3c";

      const line =
        styles.getPropertyValue("--text-secondary").trim() || "#b0b0b0";

      context.setTransform(dpr, 0, 0, dpr, 0, 0);

      context.clearRect(0, 0, width, height);

      context.fillStyle = background;

      context.fillRect(0, 0, width, height);

      if (!this.clip) {
        return;
      }

      const duration = Math.max(0.001, Number(this.clip.duration || 0));

      const viewDuration = duration / this.zoom;

      const viewStart = duration * this.offset;

      let step = 1;

      if (viewDuration > 120) {
        step = 20;
      } else if (viewDuration > 60) {
        step = 10;
      } else if (viewDuration > 20) {
        step = 5;
      } else if (viewDuration < 4) {
        step = 0.5;
      }

      const start = Math.floor(viewStart / step) * step;

      context.strokeStyle = line;

      context.fillStyle = line;

      context.font = "6px sans-serif";

      context.textBaseline = "top";

      for (
        let time = start;
        time <= viewStart + viewDuration + step;
        time += step
      ) {
        const x = ((time - viewStart) / viewDuration) * width;

        context.beginPath();

        context.moveTo(x + 0.5, height - 8);

        context.lineTo(x + 0.5, height);

        context.stroke();

        context.fillText(this._shortTime(time), x + 3, 3);
      }
    }

    updatePlayhead() {
      if (!this.host || !this.clip) {
        return;
      }

      const timelineTime = Number(
        global.sequencerManager?.state?.playhead || 0,
      );

      const local = timelineTime - Number(this.clip.start || 0);

      const duration = Math.max(0.001, Number(this.clip.duration || 0));

      const full = local / duration;

      const visibleFraction = 1 / this.zoom;

      const visiblePosition = (full - this.offset) / visibleFraction;

      const playhead = this.host.querySelector("[data-wave-playhead]");

      if (playhead) {
        playhead.style.left = `${this._clamp(visiblePosition, 0, 1) * 100}%`;

        playhead.hidden = visiblePosition < 0 || visiblePosition > 1;
      }

      this._setText("[data-wave-time]", this._time(Math.max(0, timelineTime)));
    }

    _bind() {
      const wrap = this.host.querySelector(".sm-pro-waveform-wrap");

      const seek = (event) => {
        if (!this.clip) {
          return;
        }

        const rect = wrap.getBoundingClientRect();

        const x = this._clamp(event.clientX - rect.left, 0, rect.width);

        const view = rect.width ? x / rect.width : 0;

        const full = this.offset + view / this.zoom;

        const time =
          Number(this.clip.start || 0) +
          this._clamp(full, 0, 1) * Number(this.clip.duration || 0);

        global.sequencerManager?.seekTo?.(time);
      };

      wrap?.addEventListener("pointerdown", (event) => {
        this.dragging = true;

        wrap.setPointerCapture?.(event.pointerId);

        seek(event);
      });

      wrap?.addEventListener("pointermove", (event) => {
        if (this.dragging) {
          seek(event);
        }
      });

      wrap?.addEventListener("pointerup", (event) => {
        this.dragging = false;

        wrap.releasePointerCapture?.(event.pointerId);
      });

      wrap?.addEventListener(
        "wheel",
        (event) => {
          if (event.ctrlKey || event.metaKey) {
            event.preventDefault();

            const direction = event.deltaY < 0 ? 1.25 : 1 / 1.25;

            this.zoom = this._clamp(this.zoom * direction, 1, 32);

            this._clampOffset();
            this._updateZoomLabel();
            this.draw();
            this._drawRuler();
            this.updatePlayhead();

            return;
          }

          if (this.zoom > 1) {
            event.preventDefault();

            this.offset +=
              (Math.sign(event.deltaY || event.deltaX) * 0.045) / this.zoom;

            this._clampOffset();
            this.draw();
            this._drawRuler();
            this.updatePlayhead();
          }
        },
        {
          passive: false,
        },
      );

      this.host?.querySelectorAll("[data-wave-action]").forEach((button) =>
        button.addEventListener("click", () => {
          const action = button.dataset.waveAction;

          if (action === "zoom-in") {
            this.zoom = Math.min(32, this.zoom * 1.5);
          } else if (action === "zoom-out") {
            this.zoom = Math.max(1, this.zoom / 1.5);
          } else if (action === "fit") {
            this.zoom = 1;
            this.offset = 0;
          } else if (action === "mute" && this.clip) {
            this.clip.muted = !this.clip.muted;

            this.manager.project?.touch?.("timeline.clip.audio", {
              clipId: this.clip.id,
              muted: this.clip.muted,
            });

            this.render();
            return;
          }

          this._clampOffset();
          this._updateZoomLabel();
          this.draw();
          this._drawRuler();
          this.updatePlayhead();
        }),
      );

      const gain = this.host.querySelector("[data-wave-gain]");

      gain?.addEventListener("input", () => {
        if (!this.clip) {
          return;
        }

        const db = Number(gain.value);

        this.clip.volume = this.manager.dbToLinear(db);

        this.manager.project?.touch?.("timeline.clip.audio", {
          clipId: this.clip.id,
          volume: this.clip.volume,
        });

        this._setText("[data-wave-gain-read]", this._dbText(db));
      });
    }

    _source(clip) {
      if (clip?.sourceMediaId && this.manager.project?.getMedia) {
        return this.manager.project.getMedia(clip.sourceMediaId);
      }

      return (
        this.manager.project?.media?.find(
          (media) => media.id === clip?.sourceMediaId,
        ) || null
      );
    }

    _peaks(clip, source) {
      const peaks = source?.audioPeaks || clip?.audioPeaks || null;

      return ArrayBuffer.isView(peaks) || Array.isArray(peaks) ? peaks : null;
    }

    _visibleDuration() {
      const duration = Math.max(0.001, Number(this.clip?.duration || 1));

      return duration / this.zoom;
    }

    _clampOffset() {
      this.offset = this._clamp(this.offset, 0, Math.max(0, 1 - 1 / this.zoom));
    }

    _updateZoomLabel() {
      this._setText("[data-wave-zoom]", `${Math.round(this.zoom * 100)}%`);
    }

    _resize() {
      for (const canvas of [this.canvas, this.ruler]) {
        if (!canvas) {
          continue;
        }

        const rect = canvas.getBoundingClientRect();

        const dpr = Math.min(2, global.devicePixelRatio || 1);

        const width = Math.max(1, Math.round(rect.width * dpr));

        const height = Math.max(1, Math.round(rect.height * dpr));

        if (canvas.width !== width) {
          canvas.width = width;
        }

        if (canvas.height !== height) {
          canvas.height = height;
        }
      }
    }

    _setText(selector, value) {
      const element = this.host?.querySelector(selector);

      if (element) {
        element.textContent = value;
      }
    }

    _time(value) {
      const fps = Math.max(
        1,
        Number(this.manager.project?.settings?.fps || 30),
      );

      const time = Math.max(0, Number(value) || 0);

      const whole = Math.floor(time);

      const frame = Math.floor((time - whole) * fps);

      const hours = Math.floor(whole / 3600);

      const minutes = Math.floor((whole % 3600) / 60);

      const seconds = whole % 60;

      const pad = (number) => String(number).padStart(2, "0");

      return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}:${pad(frame)}`;
    }

    _shortTime(value) {
      const time = Math.max(0, Number(value) || 0);

      if (time >= 60) {
        return `${Math.floor(time / 60)}:${String(Math.floor(time % 60)).padStart(2, "0")}`;
      }

      return `${time.toFixed(time < 10 ? 1 : 0)}s`;
    }

    _dbText(value) {
      const db = Number(value);

      if (!Number.isFinite(db) || db <= -59.9) {
        return "-∞ dB";
      }

      return `${db.toFixed(1)} dB`;
    }

    _clamp(value, min, max) {
      return Math.max(min, Math.min(max, value));
    }

    _styles() {
      if (document.getElementById("sm-pro-waveform-style")) {
        return;
      }

      const style = document.createElement("style");

      style.id = "sm-pro-waveform-style";

      style.textContent = `
   .sm-pro-waveform{
    height:100%;
    min-width:0;
    min-height:0;
    display:grid;
    grid-template-rows:38px 36px 23px minmax(0,1fr) 24px;
    overflow:hidden;
    background:var(--primary-dark,#333);
    color:var(--text-primary,#fff);
   }

   .sm-pro-waveform *{
    box-sizing:border-box;
   }

   .sm-pro-waveform-head{
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:8px;
    padding:0 7px;
    border-bottom:1px solid var(--border-color,#4d4d4d81);
    background:var(--header-bg,var(--secondary-dark,#3c3c3c));
   }

   .sm-pro-waveform-title{
    min-width:0;
   }

   .sm-pro-waveform-title strong,
   .sm-pro-waveform-title span{
    display:block;
    overflow:hidden;
    text-overflow:ellipsis;
    white-space:nowrap;
   }

   .sm-pro-waveform-title strong{
    font-size:9px;
   }

   .sm-pro-waveform-title span{
    margin-top:2px;
    color:var(--text-secondary,#b0b0b0);
    font-size:6.5px;
   }

   .sm-pro-waveform-tools{
    display:flex;
    align-items:center;
    gap:2px;
   }

   .sm-pro-waveform-tools button{
    height:21px;
    min-width:23px;
    padding:0 5px;
    border:1px solid var(--border-color,#4d4d4d81);
    border-radius:0;
    background:var(--bg-button,#363636);
    color:var(--text-secondary,#b0b0b0);
    font-size:7px;
    cursor:pointer;
   }

   .sm-pro-waveform-tools output{
    min-width:38px;
    text-align:center;
    color:var(--text-secondary,#b0b0b0);
    font-size:6.5px;
   }

   .sm-pro-waveform-properties{
    display:grid;
    grid-template-columns:minmax(150px,1fr) 48px minmax(80px,auto);
    align-items:center;
    gap:6px;
    padding:0 7px;
    border-bottom:1px solid var(--border-color,#4d4d4d40);
    background:var(--panel-bg,#333);
   }

   .sm-pro-waveform-properties>label{
    display:grid;
    grid-template-columns:50px minmax(0,1fr) 50px;
    align-items:center;
    gap:5px;
    color:var(--text-secondary,#b0b0b0);
    font-size:6px;
   }

   .sm-pro-waveform-properties input{
    min-width:0;
    width:100%;
    accent-color:var(--accent-blue,#5f5f5f);
   }

   .sm-pro-waveform-properties output{
    text-align:right;
    color:var(--text-primary,#fff);
    white-space:nowrap;
   }

   .sm-pro-waveform-properties button{
    height:22px;
    border:1px solid var(--border-color,#4d4d4d81);
    border-radius:0;
    background:var(--bg-button,#363636);
    color:var(--text-secondary,#b0b0b0);
    font-size:6px;
    cursor:pointer;
   }

   .sm-pro-waveform-properties button.active{
    background:var(--accent-blue-dark,#474747);
    color:var(--text-primary,#fff);
   }

   .sm-pro-waveform-properties>span{
    min-width:0;
    overflow:hidden;
    text-overflow:ellipsis;
    white-space:nowrap;
    text-align:right;
    color:var(--text-secondary,#b0b0b0);
    font-size:6px;
   }

   .sm-pro-waveform-ruler{
    min-height:0;
    overflow:hidden;
    border-bottom:1px solid var(--border-color,#4d4d4d40);
   }

   .sm-pro-waveform-ruler canvas{
    width:100%;
    height:100%;
    display:block;
   }

   .sm-pro-waveform-wrap{
    position:relative;
    min-width:0;
    min-height:0;
    overflow:hidden;
    cursor:crosshair;
   }

   .sm-pro-waveform-wrap canvas{
    width:100%;
    height:100%;
    display:block;
   }

   .sm-pro-waveform-playhead{
    position:absolute;
    top:0;
    bottom:0;
    width:1px;
    background:var(--text-primary,#fff);
    pointer-events:none;
   }

   .sm-pro-waveform-empty{
    position:absolute;
    left:50%;
    top:50%;
    transform:translate(-50%,-50%);
    display:flex;
    flex-direction:column;
    align-items:center;
    gap:4px;
    max-width:250px;
    text-align:center;
    color:var(--text-secondary,#b0b0b0);
    pointer-events:none;
   }

   .sm-pro-waveform-empty[hidden]{
    display:none;
   }

   .sm-pro-waveform-empty strong{
    color:var(--text-primary,#fff);
    font-size:8px;
   }

   .sm-pro-waveform-empty span{
    font-size:6.5px;
   }

   .sm-pro-waveform-footer{
    display:grid;
    grid-template-columns:1fr auto 1fr;
    align-items:center;
    gap:7px;
    padding:0 7px;
    border-top:1px solid var(--border-color,#4d4d4d81);
    background:var(--header-bg,var(--secondary-dark,#3c3c3c));
    color:var(--text-secondary,#b0b0b0);
    font-size:6px;
   }

   .sm-pro-waveform-footer strong{
    color:var(--text-primary,#fff);
    font-size:7px;
    font-weight:500;
   }

   .sm-pro-waveform-footer span:last-child{
    text-align:right;
   }
  `;

      document.head.appendChild(style);
    }

    destroy() {
      this.resizeObserver?.disconnect?.();

      global.removeEventListener(
        "audioStudioTrackChanged",
        this._timelineEvent,
      );
    }
  }

  global.AudioWaveformEditor = AudioWaveformEditor;
})(window);
