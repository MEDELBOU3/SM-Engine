/**
 * ColorWheelsPanel.js
 * SM Engine — DaVinci-inspired Primaries color wheels.
 */
(function (global) {
  "use strict";

  class ColorWheelsPanel {
    constructor(manager) {
      this.manager = manager || global.colorGradingManager;

      this.host = null;
      this._styles();
    }

    mount(host) {
      this.host = host;
      this.render();
    }

    render() {
      if (!this.host) return;

      const clip = this.manager?.selectedClip?.();

      if (!clip) {
        this.host.innerHTML = `
    <div class="ve-color-empty">
     <span>${this._svg("color")}</span>
     <strong>No color-capable clip selected</strong>
     <em>Select a video, image, text or solid clip.</em>
    </div>`;

        return;
      }

      const grade = this.manager.ensureGrade(clip);

      this.host.innerHTML = `
   <div class="ve-color-primaries">
    <div class="ve-color-primaries-head">
     <div>
      <strong>PRIMARIES</strong>
      <span>${this._esc(clip.name || "Selected Clip")}</span>
     </div>

     <div class="ve-color-head-actions">
      <button type="button" data-grade-bypass class="${grade.enabled === false ? "active" : ""}">
       ${this._svg("bypass")}
       <span>BYPASS</span>
      </button>

      <button type="button" data-grade-reset>
       ${this._svg("reset")}
       <span>RESET</span>
      </button>
     </div>
    </div>

    <div class="ve-color-wheel-grid">
     ${this._wheelCard("lift", "Lift", grade.wheels.lift)}
     ${this._wheelCard("gamma", "Gamma", grade.wheels.gamma)}
     ${this._wheelCard("gain", "Gain", grade.wheels.gain)}
     ${this._wheelCard("offset", "Offset", grade.wheels.offset)}
    </div>

    <div class="ve-color-primary-controls">
     ${this._slider("temperature", "Temp", -100, 100, 1, grade.temperature, "")}
     ${this._slider("tint", "Tint", -100, 100, 1, grade.tint, "")}
     ${this._slider("contrast", "Contrast", 0, 2, 0.01, grade.contrast, "")}
     ${this._slider("pivot", "Pivot", 0, 1, 0.001, grade.pivot, "")}
     ${this._slider("saturation", "Saturation", 0, 2, 0.01, grade.saturation, "")}
     ${this._slider("hue", "Hue", -180, 180, 0.1, grade.hue, "°")}
     ${this._slider("colorBoost", "Color Boost", -1, 1, 0.01, grade.colorBoost, "")}
     ${this._slider("midtoneDetail", "Mid Detail", -1, 1, 0.01, grade.midtoneDetail, "")}
    </div>
   </div>
  `;

      this._bind(clip, grade);
    }

    _wheelCard(id, title, wheel) {
      const x = this._clamp(Number(wheel?.x || 0), -1, 1);

      const y = this._clamp(Number(wheel?.y || 0), -1, 1);

      const left = 50 + x * 38;

      const top = 50 - y * 38;

      return `
   <section class="ve-color-wheel-card" data-wheel="${id}">
    <header>
     <strong>${title}</strong>
     <button type="button" data-wheel-reset="${id}" title="Reset ${title}">
      ${this._svg("reset")}
     </button>
    </header>

    <div class="ve-color-wheel-surface" data-wheel-surface="${id}">
     <div
      class="ve-color-wheel-puck"
      data-wheel-puck="${id}"
      style="left:${left}%;top:${top}%;">
     </div>
    </div>

    <label class="ve-color-wheel-level">
     <span>Y</span>
     <input
      type="range"
      min="-1"
      max="1"
      step="0.001"
      value="${Number(wheel?.level || 0)}"
      data-wheel-level="${id}">
     <output data-wheel-level-read="${id}">
      ${Number(wheel?.level || 0).toFixed(3)}
     </output>
    </label>
   </section>
  `;
    }

    _slider(key, label, min, max, step, value, unit) {
      const number = Number(value || 0);

      return `
   <label class="ve-color-primary-row">
    <span>${label}</span>

    <input
     type="range"
     min="${min}"
     max="${max}"
     step="${step}"
     value="${number}"
     data-grade-range="${key}">

    <input
     type="number"
     min="${min}"
     max="${max}"
     step="${step}"
     value="${number}"
     data-grade-number="${key}">

    <em>${unit}</em>
   </label>
  `;
    }

    _bind(clip, grade) {
      this.host.querySelectorAll("[data-wheel-surface]").forEach((surface) => {
        const name = surface.dataset.wheelSurface;

        const begin = (event) => {
          event.preventDefault();

          const move = (moveEvent) => {
            const rect = surface.getBoundingClientRect();

            const cx = rect.left + rect.width / 2;

            const cy = rect.top + rect.height / 2;

            const radius = Math.max(
              1,
              Math.min(rect.width, rect.height) * 0.38,
            );

            let x = (moveEvent.clientX - cx) / radius;

            let y = -(moveEvent.clientY - cy) / radius;

            const length = Math.hypot(x, y);

            if (length > 1) {
              x /= length;
              y /= length;
            }

            this.manager.setWheel(
              name,
              {
                x,
                y,
              },
              clip,
            );

            const puck = this.host.querySelector(`[data-wheel-puck="${name}"]`);

            if (puck) {
              puck.style.left = `${50 + x * 38}%`;

              puck.style.top = `${50 - y * 38}%`;
            }
          };

          const up = () => {
            global.removeEventListener("pointermove", move);
          };

          global.addEventListener("pointermove", move);

          global.addEventListener("pointerup", up, {
            once: true,
          });

          move(event);
        };

        surface.addEventListener("pointerdown", begin);
      });

      this.host.querySelectorAll("[data-wheel-level]").forEach((input) => {
        input.addEventListener("input", () => {
          const name = input.dataset.wheelLevel;

          const value = Number(input.value);

          this.manager.setWheel(
            name,
            {
              level: value,
            },
            clip,
          );

          const output = this.host.querySelector(
            `[data-wheel-level-read="${name}"]`,
          );

          if (output) {
            output.textContent = value.toFixed(3);
          }
        });
      });

      this.host.querySelectorAll("[data-wheel-reset]").forEach((button) => {
        button.addEventListener("click", () => {
          this.manager.resetWheel(button.dataset.wheelReset, clip);

          this.render();
        });
      });

      this.host.querySelectorAll("[data-grade-range]").forEach((range) => {
        range.addEventListener("input", () => {
          const key = range.dataset.gradeRange;

          const value = Number(range.value);

          const number = this.host.querySelector(
            `[data-grade-number="${key}"]`,
          );

          if (number) {
            number.value = value;
          }

          this.manager.update(key, value, clip);
        });
      });

      this.host.querySelectorAll("[data-grade-number]").forEach((number) => {
        number.addEventListener("change", () => {
          const key = number.dataset.gradeNumber;

          const value = Number(number.value);

          const range = this.host.querySelector(`[data-grade-range="${key}"]`);

          if (range) {
            range.value = value;
          }

          this.manager.update(key, value, clip);
        });
      });

      this.host
        .querySelector("[data-grade-reset]")
        ?.addEventListener("click", () => {
          this.manager.reset(clip);

          this.render();
        });

      this.host
        .querySelector("[data-grade-bypass]")
        ?.addEventListener("click", () => {
          this.manager.toggleEnabled(clip);

          this.render();
        });
    }

    _svg(name) {
      const icons = {
        reset:
          '<svg viewBox="0 0 24 24"><path d="M5 8a8 8 0 1 1-1 7"/><path d="M5 4v4h4"/></svg>',
        bypass:
          '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7"/><path d="M7 17L17 7"/></svg>',
        color:
          '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 4v16M4 12h16"/></svg>',
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

    _clamp(v, min, max) {
      return Math.max(min, Math.min(max, v));
    }

    _styles() {
      if (document.getElementById("ve-color-wheels-styles")) {
        return;
      }

      const style = document.createElement("style");

      style.id = "ve-color-wheels-styles";

      style.textContent = `
   .ve-color-primaries{
    height:100%;
    min-width:0;
    min-height:0;
    display:grid;
    grid-template-rows:35px minmax(178px,.9fr) auto;
    overflow:auto;
    background:var(--primary-dark,#333);
    color:var(--text-primary,#fff);
   }

   .ve-color-primaries-head{
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:7px;
    padding:0 6px;
    border-bottom:1px solid var(--border-color,#4d4d4d81);
    background:var(--header-bg,var(--secondary-dark,#3c3c3c));
   }

   .ve-color-primaries-head strong,
   .ve-color-primaries-head span{
    display:block;
   }

   .ve-color-primaries-head strong{
    font-size:8px;
   }

   .ve-color-primaries-head span{
    max-width:180px;
    margin-top:1px;
    overflow:hidden;
    text-overflow:ellipsis;
    white-space:nowrap;
    color:var(--text-secondary,#b0b0b0);
    font-size:7px;
   }

   .ve-color-head-actions{
    display:flex;
    gap:2px;
   }

   .ve-color-head-actions button{
    height:21px;
    display:flex;
    align-items:center;
    gap:4px;
    padding:0 5px;
    border:1px solid transparent;
    border-radius:0;
    background:transparent;
    color:var(--text-secondary,#b0b0b0);
    font-size:7px;
    cursor:pointer;
   }

   .ve-color-head-actions button svg{
    width:12px;
    height:12px;
    fill:none;
    stroke:currentColor;
    stroke-width:1.6;
   }

   .ve-color-head-actions button:hover,
   .ve-color-head-actions button.active{
    border-color:var(--border-color,#4d4d4d81);
    background:var(--accent-blue-dark,#474747);
    color:var(--text-primary,#fff);
   }

   .ve-color-wheel-grid{
    display:grid;
    grid-template-columns:repeat(2,minmax(125px,1fr));
    gap:5px;
    padding:6px;
   }

   .ve-color-wheel-card{
    min-width:0;
    display:grid;
    grid-template-rows:22px minmax(92px,1fr) 26px;
    border:1px solid var(--border-color,#4d4d4d81);
    background:var(--panel-bg,#333);
   }

   .ve-color-wheel-card>header{
    display:flex;
    align-items:center;
    justify-content:space-between;
    padding:0 5px;
    border-bottom:1px solid var(--border-color,#4d4d4d40);
    background:var(--secondary-dark,#3c3c3c);
   }

   .ve-color-wheel-card>header strong{
    font-size:7px;
    text-transform:uppercase;
   }

   .ve-color-wheel-card>header button{
    width:18px;
    height:18px;
    padding:4px;
    border:0;
    background:transparent;
    color:var(--text-secondary,#b0b0b0);
    cursor:pointer;
   }

   .ve-color-wheel-card>header svg{
    width:100%;
    height:100%;
    fill:none;
    stroke:currentColor;
    stroke-width:1.6;
   }

   .ve-color-wheel-surface{
    position:relative;
    width:min(92px,72%);
    aspect-ratio:1;
    align-self:center;
    justify-self:center;
    border-radius:50%;
    cursor:crosshair;
    overflow:hidden;
    box-shadow:
     inset 0 0 0 1px rgba(255,255,255,.16),
     inset 0 0 18px rgba(0,0,0,.45);
    background:
     radial-gradient(
      circle at center,
      rgba(128,128,128,.65) 0%,
      rgba(128,128,128,.14) 44%,
      transparent 67%
     ),
     conic-gradient(
      #ff4d4d,
      #ffff4d,
      #4dff4d,
      #4dffff,
      #4d4dff,
      #ff4dff,
      #ff4d4d
     );
   }

   .ve-color-wheel-surface::after{
    content:'';
    position:absolute;
    inset:8%;
    border:1px solid rgba(255,255,255,.18);
    border-radius:50%;
    pointer-events:none;
   }

   .ve-color-wheel-puck{
    position:absolute;
    width:8px;
    height:8px;
    transform:translate(-50%,-50%);
    border:1px solid #fff;
    border-radius:50%;
    background:#252525;
    box-shadow:0 1px 3px rgba(0,0,0,.7);
    pointer-events:none;
   }

   .ve-color-wheel-level{
    display:grid;
    grid-template-columns:12px minmax(0,1fr) 42px;
    align-items:center;
    gap:4px;
    padding:0 5px;
    border-top:1px solid var(--border-color,#4d4d4d40);
    color:var(--text-secondary,#b0b0b0);
    font-size:7px;
   }

   .ve-color-wheel-level input{
    width:100%;
    accent-color:var(--accent-blue,#5f5f5f);
   }

   .ve-color-wheel-level output{
    text-align:right;
    color:var(--text-primary,#fff);
   }

   .ve-color-primary-controls{
    display:grid;
    grid-template-columns:1fr;
    gap:1px;
    padding:5px 6px 7px;
    border-top:1px solid var(--border-color,#4d4d4d81);
   }

   .ve-color-primary-row{
    min-height:25px;
    display:grid;
    grid-template-columns:68px minmax(0,1fr) 54px 12px;
    align-items:center;
    gap:5px;
    color:var(--text-secondary,#b0b0b0);
    font-size:7px;
   }

   .ve-color-primary-row input[type="range"]{
    min-width:0;
    width:100%;
    accent-color:var(--accent-blue,#5f5f5f);
   }

   .ve-color-primary-row input[type="number"]{
    width:54px;
    height:19px;
    box-sizing:border-box;
    border:1px solid var(--border-color,#4d4d4d81);
    border-radius:0;
    background:var(--secondary-dark,#3c3c3c);
    color:var(--text-primary,#fff);
    text-align:right;
    font-size:7px;
   }

   .ve-color-primary-row em{
    font-style:normal;
    color:var(--text-secondary,#b0b0b0);
    font-size:7px;
   }

   .ve-color-empty{
    height:100%;
    display:flex;
    flex-direction:column;
    align-items:center;
    justify-content:center;
    gap:5px;
    color:var(--text-secondary,#b0b0b0);
    text-align:center;
   }

   .ve-color-empty>span{
    width:24px;
    height:24px;
   }

   .ve-color-empty svg{
    width:100%;
    height:100%;
    fill:none;
    stroke:currentColor;
    stroke-width:1.6;
   }

   .ve-color-empty strong{
    color:var(--text-primary,#fff);
    font-size:9px;
   }

   .ve-color-empty em{
    max-width:240px;
    font-style:normal;
    font-size:7px;
   }
  `;

      document.head.appendChild(style);
    }
  }

  global.ColorWheelsPanel = ColorWheelsPanel;
})(window);
