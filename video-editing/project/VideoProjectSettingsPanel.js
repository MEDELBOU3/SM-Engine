/**
 * VideoProjectSettingsPanel.js
 * SM Engine — Project resolution / timing / color / audio settings.
 */
(function (global) {
  "use strict";

  class VideoProjectSettingsPanel {
    constructor(manager) {
      this.manager = manager || global.videoProjectContentManager;

      this.host = null;
      this._styles();
    }

    mount(host) {
      this.host = host;
      this.render();
    }

    render() {
      if (!this.host) return;

      const settings = this.manager.project?.settings || {};

      const resolution = settings.resolution || {
        w: 1280,
        h: 720,
      };

      const presets = [
        ["1280x720", "HD 720p"],
        ["1920x1080", "Full HD"],
        ["2560x1440", "QHD"],
        ["3840x2160", "UHD 4K"],
        ["4096x2160", "DCI 4K"],
      ];

      this.host.innerHTML = `
   <div class="veproj-settings-panel">
    <header>
     <div>
      <strong>PROJECT SETTINGS</strong>
      <span>Timeline, color and audio configuration</span>
     </div>

     <button
      type="button"
      data-settings-reset>
      ${this._svg("reset")}
      DEFAULT
     </button>
    </header>

    <section class="veproj-settings-section">
     <header>
      <span>VIDEO FORMAT</span>
      <em>${resolution.w}×${resolution.h}</em>
     </header>

     <label class="veproj-settings-select">
      <span>Preset</span>
      <select data-resolution-preset>
       <option value="custom">Custom</option>
       ${presets
         .map(
           ([value, label]) => `
        <option
         value="${value}"
         ${`${resolution.w}x${resolution.h}` === value ? "selected" : ""}>
         ${label} · ${value.replace("x", "×")}
        </option>
       `,
         )
         .join("")}
      </select>
     </label>

     <div class="veproj-settings-grid">
      ${this._number("width", "Width", 1, 16384, 1, resolution.w, "px")}
      ${this._number("height", "Height", 1, 16384, 1, resolution.h, "px")}
      ${this._number("fps", "Frame Rate", 1, 240, 0.001, settings.fps || 30, "fps")}
      ${this._number("pixelAspect", "Pixel Aspect", 0.1, 10, 0.001, settings.pixelAspect || 1, "")}
     </div>
    </section>

    <section class="veproj-settings-section">
     <header>
      <span>COLOR MANAGEMENT</span>
      <em>${this._esc(settings.workingColorSpace || "sRGB")}</em>
     </header>

     ${this._select(
       "colorSpace",
       "Timeline Space",
       ["sRGB", "Rec.709", "Display-P3", "Rec.2020"],
       settings.colorSpace || "sRGB",
     )}

     ${this._select(
       "workingColorSpace",
       "Working Space",
       ["sRGB", "Rec.709", "Display-P3", "Rec.2020"],
       settings.workingColorSpace || settings.colorSpace || "sRGB",
     )}

     ${this._select(
       "background",
       "Background",
       ["transparent", "black", "white"],
       settings.background || "transparent",
     )}
    </section>

    <section class="veproj-settings-section">
     <header>
      <span>AUDIO FORMAT</span>
      <em>${Number(settings.sampleRate || 48000) / 1000} kHz</em>
     </header>

     ${this._select(
       "sampleRate",
       "Sample Rate",
       ["44100", "48000", "96000"],
       String(settings.sampleRate || 48000),
       (value) => `${Number(value) / 1000} kHz`,
     )}

     ${this._select(
       "audioChannels",
       "Channels",
       ["1", "2", "6", "8"],
       String(settings.audioChannels || 2),
       (value) =>
         value === "1"
           ? "Mono"
           : value === "2"
             ? "Stereo"
             : `${value} Channels`,
     )}
    </section>

    <footer class="veproj-settings-footer">
     <span>Changes apply to the Video Editing project immediately.</span>
    </footer>
   </div>
  `;

      this._bind();
    }

    _number(key, label, min, max, step, value, unit) {
      return `
   <label class="veproj-settings-number">
    <span>${label}</span>
    <input
     type="number"
     min="${min}"
     max="${max}"
     step="${step}"
     value="${Number(value)}"
     data-setting-number="${key}">
    <em>${unit}</em>
   </label>
  `;
    }

    _select(key, label, options, selected, formatter = null) {
      return `
   <label class="veproj-settings-select">
    <span>${label}</span>

    <select data-setting-select="${key}">
     ${options
       .map(
         (value) => `
      <option
       value="${this._esc(value)}"
       ${String(selected) === String(value) ? "selected" : ""}>
       ${this._esc(formatter ? formatter(value) : value)}
      </option>
     `,
       )
       .join("")}
    </select>
   </label>
  `;
    }

    _bind() {
      const preset = this.host.querySelector("[data-resolution-preset]");

      preset?.addEventListener("change", () => {
        if (preset.value === "custom") {
          return;
        }

        const [w, h] = preset.value.split("x").map(Number);

        this.manager.setResolution(w, h);

        this.render();
      });

      this.host.querySelectorAll("[data-setting-number]").forEach((input) => {
        input.addEventListener("change", () => {
          const key = input.dataset.settingNumber;

          const value = Number(input.value);

          if (key === "width" || key === "height") {
            const settings = this.manager.project?.settings;

            this.manager.setResolution(
              key === "width" ? value : settings?.resolution?.w,
              key === "height" ? value : settings?.resolution?.h,
            );
          } else if (key === "fps") {
            this.manager.setFPS(value);
          } else {
            this.manager.updateSettings({
              [key]: value,
            });
          }
        });
      });

      this.host.querySelectorAll("[data-setting-select]").forEach((select) => {
        select.addEventListener("change", () => {
          const key = select.dataset.settingSelect;

          let value = select.value;

          if (key === "sampleRate" || key === "audioChannels") {
            value = Number(value);
          }

          this.manager.updateSettings({
            [key]: value,
          });
        });
      });

      this.host
        .querySelector("[data-settings-reset]")
        ?.addEventListener("click", () => {
          this.manager.updateSettings({
            resolution: {
              w: 1280,
              h: 720,
            },
            fps: 30,
            pixelAspect: 1,
            background: "transparent",
            colorSpace: "sRGB",
            workingColorSpace: "sRGB",
            sampleRate: 48000,
            audioChannels: 2,
          });

          this.render();
        });
    }

    _svg(name) {
      if (name === "reset") {
        return '<svg viewBox="0 0 24 24"><path d="M5 8a8 8 0 1 1-1 7"/><path d="M5 4v4h4"/></svg>';
      }

      return "";
    }

    _esc(value) {
      return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
    }

    _styles() {
      if (document.getElementById("veproj-settings-style")) {
        return;
      }

      const style = document.createElement("style");

      style.id = "veproj-settings-style";

      style.textContent = `
   .veproj-settings-panel{
    height:100%;
    overflow:auto;
    background:var(--primary-dark,#333);
    color:#fff;
   }

   .veproj-settings-panel>header{
    min-height:36px;
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:7px;
    padding:0 6px;
    border-bottom:1px solid var(--border-color,#4d4d4d81);
    background:var(--header-bg,var(--secondary-dark,#3c3c3c));
   }

   .veproj-settings-panel>header strong,
   .veproj-settings-panel>header span{
    display:block;
   }

   .veproj-settings-panel>header strong{
    font-size:8px;
   }

   .veproj-settings-panel>header span{
    margin-top:2px;
    color:var(--text-secondary,#b0b0b0);
    font-size:7px;
   }

   .veproj-settings-panel>header button{
    height:21px;
    display:flex;
    align-items:center;
    gap:4px;
    padding:0 6px;
    border:1px solid var(--border-color,#4d4d4d81);
    border-radius:0;
    background:var(--bg-button,#363636);
    color:var(--text-secondary,#b0b0b0);
    font-size:7px;
   }

   .veproj-settings-panel svg{
    width:12px;
    height:12px;
    fill:none;
    stroke:currentColor;
    stroke-width:1.6;
   }

   .veproj-settings-section{
    margin:6px;
    border:1px solid var(--border-color,#4d4d4d81);
    background:var(--panel-bg,#333);
   }

   .veproj-settings-section>header{
    height:23px;
    display:flex;
    align-items:center;
    justify-content:space-between;
    padding:0 6px;
    border-bottom:1px solid var(--border-color,#4d4d4d81);
    background:var(--secondary-dark,#3c3c3c);
    color:var(--text-secondary,#b0b0b0);
    font-size:7px;
    font-weight:700;
   }

   .veproj-settings-section>header em{
    font-style:normal;
    font-weight:500;
   }

   .veproj-settings-select{
    min-height:30px;
    display:grid;
    grid-template-columns:90px minmax(0,1fr);
    align-items:center;
    gap:6px;
    padding:0 6px;
    color:var(--text-secondary,#b0b0b0);
    font-size:7px;
   }

   .veproj-settings-select select{
    height:21px;
    border:1px solid var(--border-color,#4d4d4d81);
    border-radius:0;
    background:var(--secondary-dark,#3c3c3c);
    color:#fff;
    font-size:7px;
   }

   .veproj-settings-grid{
    display:grid;
    grid-template-columns:1fr 1fr;
    gap:1px 8px;
    padding:2px 6px 6px;
   }

   .veproj-settings-number{
    min-height:29px;
    display:grid;
    grid-template-columns:72px minmax(0,1fr) 30px;
    align-items:center;
    gap:5px;
    color:var(--text-secondary,#b0b0b0);
    font-size:7px;
   }

   .veproj-settings-number input{
    width:100%;
    height:20px;
    box-sizing:border-box;
    border:1px solid var(--border-color,#4d4d4d81);
    border-radius:0;
    background:var(--secondary-dark,#3c3c3c);
    color:#fff;
    text-align:right;
    font-size:7px;
   }

   .veproj-settings-number em{
    font-style:normal;
    font-size:6px;
   }

   .veproj-settings-footer{
    padding:8px;
    color:var(--text-secondary,#b0b0b0);
    font-size:7px;
   }
  `;

      document.head.appendChild(style);
    }
  }

  global.VideoProjectSettingsPanel = VideoProjectSettingsPanel;
})(window);
