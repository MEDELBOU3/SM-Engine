/**
 * ColorInspectorPanel.js
 * SM Engine — quick right-side Color inspector.
 *
 * Full Resolve-style tools live in ColorStudioDockManager.
 */
(function (global) {
  "use strict";

  class ColorInspectorPanel {
    constructor(manager = null) {
      this.manager =
        manager ||
        global.colorGradingManager ||
        global.ensureColorGradingManager?.(global.videoProject) ||
        null;

      this.host = null;
      this._styles();
    }

    render(host) {
      this.host = host || this.host;

      if (!this.host) {
        return false;
      }

      this.manager =
        global.ensureColorGradingManager?.(global.videoProject) || this.manager;

      const clip = this.manager?.selectedClip?.();

      if (!clip) {
        this.host.innerHTML = `
    <div class="ve-color-inspector">
     <div class="ve-color-inspector-title">
      <span>${this._svg("color")}</span>
      <div>
       <strong>Color</strong>
       <em>Primary grading</em>
      </div>
     </div>

     <div class="ve-color-inspector-empty">
      <span>${this._svg("color")}</span>
      <strong>No color-capable clip selected</strong>
      <em>Select a video or image clip.</em>
     </div>

     <button type="button" class="ve-color-open-dock" data-color-open-dock>
      ${this._svg("panel")}
      <span>OPEN COLOR PANEL</span>
     </button>
    </div>
   `;

        this._bindOpenDock();

        return true;
      }

      const grade = this.manager.ensureGrade(clip);

      this.host.innerHTML = `
   <div class="ve-color-inspector">
    <div class="ve-color-inspector-top">
     <div class="ve-color-inspector-title">
      <span>${this._svg("color")}</span>
      <div>
       <strong>Color</strong>
       <em>${this._esc(clip.name || "Selected Clip")}</em>
      </div>
     </div>

     <button
      type="button"
      class="ve-color-open-dock compact"
      data-color-open-dock
      title="Open Color Studio">
      ${this._svg("panel")}
     </button>
    </div>

    <section class="ve-color-inspector-section">
     <header>
      <span>PRIMARY</span>
      <em>${grade.enabled === false ? "BYPASSED" : "ACTIVE"}</em>
     </header>

     ${this._slider("exposure", "Exposure", -5, 5, 0.01, grade.exposure, "st")}
     ${this._slider("contrast", "Contrast", 0, 2, 0.01, grade.contrast, "")}
     ${this._slider("saturation", "Saturation", 0, 2, 0.01, grade.saturation, "")}
     ${this._slider("temperature", "Temperature", -100, 100, 1, grade.temperature, "")}
     ${this._slider("tint", "Tint", -100, 100, 1, grade.tint, "")}
    </section>

    <section class="ve-color-inspector-section">
     <header>
      <span>GRADE</span>
      <em>CLIP</em>
     </header>

     <div class="ve-color-inspector-buttons">
      <button
       type="button"
       data-color-bypass
       class="${grade.enabled === false ? "active" : ""}">
       ${this._svg("bypass")}
       <span>${grade.enabled === false ? "ENABLE" : "BYPASS"}</span>
      </button>

      <button
       type="button"
       data-color-reset>
       ${this._svg("reset")}
       <span>RESET</span>
      </button>
     </div>
    </section>

    <button type="button" class="ve-color-open-dock" data-color-open-dock>
     ${this._svg("panel")}
     <span>PRIMARIES / CURVES / SCOPES</span>
    </button>
   </div>
  `;

      this._bind(clip);

      return true;
    }

    _slider(key, label, min, max, step, value, unit) {
      return `
   <label class="ve-color-inspector-row">
    <span>${label}</span>

    <input
     type="range"
     min="${min}"
     max="${max}"
     step="${step}"
     value="${Number(value || 0)}"
     data-color-inspector-range="${key}">

    <output data-color-inspector-read="${key}">
     ${this._format(value, unit)}
    </output>
   </label>
  `;
    }

    _bind(clip) {
      this._bindOpenDock();

      this.host
        .querySelectorAll("[data-color-inspector-range]")
        .forEach((range) => {
          range.addEventListener("input", () => {
            const key = range.dataset.colorInspectorRange;

            const value = Number(range.value);

            const output = this.host.querySelector(
              `[data-color-inspector-read="${key}"]`,
            );

            if (output) {
              output.textContent = this._format(
                value,
                key === "exposure" ? "st" : "",
              );
            }

            this.manager.update(key, value, clip);
          });
        });

      this.host
        .querySelector("[data-color-bypass]")
        ?.addEventListener("click", () => {
          this.manager.toggleEnabled(clip);

          this.render(this.host);
        });

      this.host
        .querySelector("[data-color-reset]")
        ?.addEventListener("click", () => {
          this.manager.reset(clip);

          this.render(this.host);
        });
    }

    _bindOpenDock() {
      this.host
        ?.querySelectorAll("[data-color-open-dock]")
        .forEach((button) => {
          button.addEventListener("click", () => {
            global.ensureColorStudioDockManager?.()?.open?.({
              tab:
                global.videoProject?.workspace?.perWorkspace?.edit
                  ?.colorDockTab || "primaries",
            });
          });
        });
    }

    _format(value, unit) {
      const number = Number(value || 0);

      if (unit === "st") {
        return `${number >= 0 ? "+" : ""}${number.toFixed(2)} st`;
      }

      return Number.isInteger(number) ? String(number) : number.toFixed(2);
    }

    _svg(name) {
      const icons = {
        color:
          '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 4v16M4 12h16"/><path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/></svg>',
        panel:
          '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16"/><path d="M14 4v16M17 8h2M17 12h2M17 16h2"/></svg>',
        reset:
          '<svg viewBox="0 0 24 24"><path d="M5 8a8 8 0 1 1-1 7"/><path d="M5 4v4h4"/></svg>',
        bypass:
          '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7"/><path d="M7 17L17 7"/></svg>',
      };

      return icons[name] || icons.color;
    }

    _esc(value) {
      return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
    }

    _styles() {
      if (document.getElementById("ve-color-inspector-styles")) {
        return;
      }

      const style = document.createElement("style");

      style.id = "ve-color-inspector-styles";

      style.textContent = `
   .ve-color-inspector{
    display:flex;
    flex-direction:column;
    gap:6px;
    min-width:0;
    padding:6px;
    color:var(--text-primary,#fff);
   }

   .ve-color-inspector-top{
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:6px;
   }

   .ve-color-inspector-title{
    min-width:0;
    display:flex;
    align-items:center;
    gap:7px;
   }

   .ve-color-inspector-title>span{
    width:18px;
    height:18px;
    flex:0 0 18px;
    display:inline-flex;
    color:var(--text-secondary,#b0b0b0);
   }

   .ve-color-inspector svg{
    width:100%;
    height:100%;
    fill:none;
    stroke:currentColor;
    stroke-width:1.65;
    stroke-linecap:round;
    stroke-linejoin:round;
   }

   .ve-color-inspector-title>div{
    min-width:0;
   }

   .ve-color-inspector-title strong,
   .ve-color-inspector-title em{
    display:block;
   }

   .ve-color-inspector-title strong{
    font-size:9px;
   }

   .ve-color-inspector-title em{
    max-width:220px;
    margin-top:2px;
    overflow:hidden;
    text-overflow:ellipsis;
    white-space:nowrap;
    color:var(--text-secondary,#b0b0b0);
    font-size:7px;
    font-style:normal;
   }

   .ve-color-inspector-section{
    border:1px solid var(--border-color,#4d4d4d81);
    background:var(--panel-bg,#333);
   }

   .ve-color-inspector-section>header{
    height:23px;
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:5px;
    padding:0 6px;
    border-bottom:1px solid var(--border-color,#4d4d4d81);
    background:var(--header-bg,var(--secondary-dark,#3c3c3c));
    color:var(--text-secondary,#b0b0b0);
    font-size:7px;
    font-weight:700;
   }

   .ve-color-inspector-section>header em{
    font-style:normal;
    font-weight:500;
   }

   .ve-color-inspector-row{
    min-height:29px;
    display:grid;
    grid-template-columns:64px minmax(0,1fr) 55px;
    align-items:center;
    gap:5px;
    padding:0 6px;
    color:var(--text-secondary,#b0b0b0);
    font-size:7px;
   }

   .ve-color-inspector-row input{
    width:100%;
    min-width:0;
    accent-color:var(--accent-blue,#5f5f5f);
   }

   .ve-color-inspector-row output{
    text-align:right;
    color:var(--text-primary,#fff);
    white-space:nowrap;
    font-size:7px;
   }

   .ve-color-inspector-buttons{
    display:grid;
    grid-template-columns:1fr 1fr;
    gap:4px;
    padding:6px;
   }

   .ve-color-inspector-buttons button,
   .ve-color-open-dock{
    min-height:23px;
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

   .ve-color-inspector-buttons button:hover,
   .ve-color-open-dock:hover,
   .ve-color-inspector-buttons button.active{
    background:var(--accent-blue-dark,#474747);
    color:var(--text-primary,#fff);
   }

   .ve-color-inspector-buttons button svg,
   .ve-color-open-dock svg{
    width:13px;
    height:13px;
   }

   .ve-color-open-dock{
    width:100%;
   }

   .ve-color-open-dock.compact{
    width:25px;
    height:23px;
    min-height:23px;
    flex:0 0 25px;
    padding:4px;
   }

   .ve-color-inspector-empty{
    min-height:120px;
    display:flex;
    flex-direction:column;
    align-items:center;
    justify-content:center;
    gap:5px;
    color:var(--text-secondary,#b0b0b0);
    text-align:center;
   }

   .ve-color-inspector-empty>span{
    width:23px;
    height:23px;
   }

   .ve-color-inspector-empty strong{
    color:var(--text-primary,#fff);
    font-size:9px;
   }

   .ve-color-inspector-empty em{
    font-style:normal;
    font-size:7px;
   }
  `;

      document.head.appendChild(style);
    }
  }

  global.ColorInspectorPanel = ColorInspectorPanel;

  global.ensureColorInspectorPanel = function ensureColorInspectorPanel() {
    if (!global.colorInspectorPanel) {
      global.colorInspectorPanel = new ColorInspectorPanel(
        global.colorGradingManager || null,
      );
    }

    return global.colorInspectorPanel;
  };
})(window);
