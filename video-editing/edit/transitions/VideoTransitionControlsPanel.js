/**
 * VideoTransitionControlsPanel.js
 * SM Engine — detailed transition controls + A/B preview.
 */
(function (global) {
  "use strict";

  class VideoTransitionControlsPanel {
    constructor(manager) {
      this.manager = manager || global.videoTransitionsManager;

      this.host = null;
      this.previewProgress = 0.5;
      this._styles();
    }

    mount(host) {
      this.host = host;
      this.render();
    }

    render() {
      if (!this.host) return;

      const selected = this.manager.selectedTransition();

      if (!selected) {
        this.host.innerHTML = `
    <div class="vetr-controls-empty">
     <strong>No transition selected</strong>
     <span>Open Transitions and apply one to IN, CUT, or OUT.</span>
    </div>
   `;

        return;
      }

      const transition = selected.transition;

      const def = this.manager.library.get(transition.id);

      const paramHTML = Object.entries(def?.params || {})
        .map(([key, param]) =>
          this._param(key, param, transition.params?.[key] ?? param.def),
        )
        .join("");

      this.host.innerHTML = `
   <div class="vetr-controls-panel">
    <header class="vetr-controls-head">
     <div>
      <strong>TRANSITION CONTROLS</strong>
      <span>${this._esc(def?.name || transition.name || transition.id)} · ${String(selected.edge).toUpperCase()}</span>
     </div>

     <div>
      <button
       type="button"
       data-control-copy>
       ${this._svg("copy")}
       COPY
      </button>

      <button
       type="button"
       data-control-remove>
       ${this._svg("trash")}
       REMOVE
      </button>
     </div>
    </header>

    <section class="vetr-ab-preview">
     <div class="vetr-preview-stage" data-preview-stage>
      <div class="vetr-preview-card a">A</div>
      <div class="vetr-preview-card b">B</div>
      <div class="vetr-preview-overlay" data-preview-overlay></div>
      <span data-preview-label>50%</span>
     </div>

     <label class="vetr-preview-scrub">
      <span>Preview</span>
      <input
       type="range"
       min="0"
       max="1"
       step="0.001"
       value="${this.previewProgress}"
       data-preview-progress>
      <output data-preview-read>${Math.round(this.previewProgress * 100)}%</output>
     </label>
    </section>

    <section class="vetr-controls-section">
     <header>
      <span>TIMING</span>
      <em>${transition.pairId ? "CUT TRANSITION" : "EDGE TRANSITION"}</em>
     </header>

     <label class="vetr-control-row">
      <span>Duration</span>
      <input
       type="range"
       min="0.03"
       max="8"
       step="0.01"
       value="${Number(transition.duration || 0.5)}"
       data-control-duration>
      <input
       type="number"
       min="0.03"
       max="8"
       step="0.01"
       value="${Number(transition.duration || 0.5)}"
       data-control-duration-number>
     </label>

     <label class="vetr-control-select">
      <span>Alignment</span>
      <select data-control-alignment>
       ${["start", "center", "end"]
         .map(
           (value) => `
        <option
         value="${value}"
         ${transition.alignment === value ? "selected" : ""}>
         ${value === "start" ? "Start at Cut" : value === "center" ? "Center on Cut" : "End at Cut"}
        </option>
       `,
         )
         .join("")}
      </select>
     </label>

     <label class="vetr-control-select">
      <span>Easing</span>
      <select data-control-easing>
       ${["linear", "ease-in", "ease-out", "ease-in-out", "smooth"]
         .map(
           (value) => `
        <option
         value="${value}"
         ${transition.easing === value ? "selected" : ""}>
         ${value}
        </option>
       `,
         )
         .join("")}
      </select>
     </label>

     <div class="vetr-control-checks">
      <label>
       <input
        type="checkbox"
        data-control-enabled
        ${transition.enabled !== false ? "checked" : ""}>
       <span>Enabled</span>
      </label>

      <label>
       <input
        type="checkbox"
        data-control-reverse
        ${transition.reverse ? "checked" : ""}>
       <span>Reverse</span>
      </label>
     </div>
    </section>

    <section class="vetr-controls-section">
     <header>
      <span>PARAMETERS</span>
      <em>${Object.keys(def?.params || {}).length}</em>
     </header>

     <div class="vetr-control-params">
      ${paramHTML || '<div class="vetr-no-params">No additional parameters.</div>'}
     </div>
    </section>

    <section class="vetr-controls-section info">
     <header>
      <span>RENDER MODE</span>
      <em>${def?.renderer === "live-opacity" ? "LIVE" : "COMPOSITOR"}</em>
     </header>

     <div class="vetr-render-note">
      ${
        def?.renderer === "live-opacity"
          ? "This transition previews immediately through the current opacity compositor bridge."
          : "The transition is stored and fully editable now. Its transform/wipe data is exposed by VideoTransitionEvaluator for the advanced compositor pass."
      }
     </div>
    </section>
   </div>
  `;

      this._bind(selected, def);

      this._drawPreview(selected, def);
    }

    _param(key, param, value) {
      if (param.type === "boolean") {
        return `
    <label class="vetr-control-check">
     <span>${this._esc(param.label)}</span>
     <input
      type="checkbox"
      data-param="${key}"
      ${value ? "checked" : ""}>
    </label>
   `;
      }

      if (param.type === "select") {
        return `
    <label class="vetr-control-select param">
     <span>${this._esc(param.label)}</span>
     <select data-param="${key}">
      ${(param.options || [])
        .map(
          (option) => `
       <option
        value="${this._esc(option)}"
        ${String(value) === String(option) ? "selected" : ""}>
        ${this._esc(option)}
       </option>
      `,
        )
        .join("")}
     </select>
    </label>
   `;
      }

      if (param.type === "color") {
        return `
    <label class="vetr-control-color">
     <span>${this._esc(param.label)}</span>
     <input
      type="color"
      value="${this._esc(value || param.def || "#000000")}"
      data-param="${key}">
    </label>
   `;
      }

      return `
   <label class="vetr-control-row param">
    <span>${this._esc(param.label)}</span>
    <input
     type="range"
     min="${param.min}"
     max="${param.max}"
     step="${param.step}"
     value="${Number(value)}"
     data-param-range="${key}">
    <input
     type="number"
     min="${param.min}"
     max="${param.max}"
     step="${param.step}"
     value="${Number(value)}"
     data-param-number="${key}">
   </label>
  `;
    }

    _bind(selected, def) {
      const duration = this.host.querySelector("[data-control-duration]");

      const durationNumber = this.host.querySelector(
        "[data-control-duration-number]",
      );

      const applyDuration = (value) => {
        const number = Math.max(0.03, Number(value) || 0.5);

        duration.value = number;

        durationNumber.value = number;

        this.manager.setDuration(number, selected);
      };

      duration?.addEventListener("input", () => {
        applyDuration(duration.value);
      });

      durationNumber?.addEventListener("change", () => {
        applyDuration(durationNumber.value);
      });

      this.host
        .querySelector("[data-control-alignment]")
        ?.addEventListener("change", (event) => {
          this.manager.setOption("alignment", event.target.value, selected);
        });

      this.host
        .querySelector("[data-control-easing]")
        ?.addEventListener("change", (event) => {
          this.manager.setOption("easing", event.target.value, selected);

          this._drawPreview(selected, def);
        });

      this.host
        .querySelector("[data-control-enabled]")
        ?.addEventListener("change", (event) => {
          this.manager.setOption("enabled", event.target.checked, selected);
        });

      this.host
        .querySelector("[data-control-reverse]")
        ?.addEventListener("change", (event) => {
          this.manager.setOption("reverse", event.target.checked, selected);

          this._drawPreview(selected, def);
        });

      this.host.querySelectorAll("[data-param-range]").forEach((range) => {
        range.addEventListener("input", () => {
          const key = range.dataset.paramRange;

          const value = Number(range.value);

          const number = this.host.querySelector(
            `[data-param-number="${key}"]`,
          );

          if (number) {
            number.value = value;
          }

          this.manager.setOption(key, value, selected);

          this._drawPreview(selected, def);
        });
      });

      this.host.querySelectorAll("[data-param-number]").forEach((number) => {
        number.addEventListener("change", () => {
          const key = number.dataset.paramNumber;

          const value = Number(number.value);

          const range = this.host.querySelector(`[data-param-range="${key}"]`);

          if (range) {
            range.value = value;
          }

          this.manager.setOption(key, value, selected);

          this._drawPreview(selected, def);
        });
      });

      this.host.querySelectorAll("[data-param]").forEach((input) => {
        input.addEventListener("change", () => {
          const value = input.type === "checkbox" ? input.checked : input.value;

          this.manager.setOption(input.dataset.param, value, selected);

          this._drawPreview(selected, def);
        });
      });

      const preview = this.host.querySelector("[data-preview-progress]");

      preview?.addEventListener("input", () => {
        this.previewProgress = Number(preview.value);

        const read = this.host.querySelector("[data-preview-read]");

        if (read) {
          read.textContent = `${Math.round(this.previewProgress * 100)}%`;
        }

        this._drawPreview(selected, def);
      });

      this.host
        .querySelector("[data-control-copy]")
        ?.addEventListener("click", () => {
          this.manager.duplicateSelected?.();
        });

      this.host
        .querySelector("[data-control-remove]")
        ?.addEventListener("click", () => {
          this.manager.remove(selected.clip, selected.edge);

          this.render();
        });
    }

    _drawPreview(selected, def) {
      if (!this.host || !selected) {
        return;
      }

      const stage = this.host.querySelector("[data-preview-stage]");

      if (!stage) {
        return;
      }

      const a = stage.querySelector(".vetr-preview-card.a");

      const b = stage.querySelector(".vetr-preview-card.b");

      const overlay = stage.querySelector("[data-preview-overlay]");

      const label = stage.querySelector("[data-preview-label]");

      const raw = selected.transition.reverse
        ? 1 - this.previewProgress
        : this.previewProgress;

      const progress = {
        raw,
        eased: this.manager.evaluator.ease(raw, selected.transition.easing),
      };

      const outState = this.manager.evaluator.evaluate(
        selected.transition,
        "out",
        progress,
      );

      const inState = this.manager.evaluator.evaluate(
        selected.transition,
        "in",
        progress,
      );

      a.style.opacity = String(outState?.opacity ?? 1 - this.previewProgress);

      b.style.opacity = String(inState?.opacity ?? this.previewProgress);

      a.style.transform = `translate(${Number(outState?.translateX || 0) * 100}%,${Number(outState?.translateY || 0) * 100}%) scale(${Number(outState?.scale || 1)})`;

      b.style.transform = `translate(${Number(inState?.translateX || 0) * 100}%,${Number(inState?.translateY || 0) * 100}%) scale(${Number(inState?.scale || 1)})`;

      a.style.filter =
        Number(outState?.blur || 0) > 0
          ? `blur(${Number(outState.blur)}px)`
          : "none";

      b.style.filter =
        Number(inState?.blur || 0) > 0
          ? `blur(${Number(inState.blur)}px)`
          : "none";

      if (overlay && (outState?.overlayColor || inState?.overlayColor)) {
        overlay.style.background =
          outState?.overlayColor || inState?.overlayColor;

        overlay.style.opacity = String(
          Math.max(
            Number(outState?.overlayOpacity || 0),
            Number(inState?.overlayOpacity || 0),
          ),
        );
      } else if (overlay) {
        overlay.style.opacity = "0";
      }

      if (def?.id === "wipe") {
        const direction = selected.transition.params?.direction || "left";

        const p = progress.eased * 100;

        if (direction === "left") {
          b.style.clipPath = `inset(0 ${100 - p}% 0 0)`;
        } else if (direction === "right") {
          b.style.clipPath = `inset(0 0 0 ${100 - p}%)`;
        } else if (direction === "up") {
          b.style.clipPath = `inset(0 0 ${100 - p}% 0)`;
        } else {
          b.style.clipPath = `inset(${100 - p}% 0 0 0)`;
        }
      } else {
        b.style.clipPath = "none";
      }

      if (label) {
        label.textContent = `${Math.round(this.previewProgress * 100)}%`;
      }
    }

    _svg(name) {
      const icons = {
        copy: '<svg viewBox="0 0 24 24"><rect x="8" y="8" width="11" height="11"/><path d="M16 8V5H5v11h3"/></svg>',
        trash:
          '<svg viewBox="0 0 24 24"><path d="M5 7h14M9 7V4h6v3M8 10v8M12 10v8M16 10v8M7 7l1 14h8l1-14"/></svg>',
      };

      return icons[name] || icons.copy;
    }

    _esc(value) {
      return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
    }

    _styles() {
      if (document.getElementById("vetr-controls-style")) {
        return;
      }

      const style = document.createElement("style");

      style.id = "vetr-controls-style";

      style.textContent = `
   .vetr-controls-panel{
    height:100%;
    overflow:auto;
    background:var(--primary-dark,#333);
    color:#fff;
   }

   .vetr-controls-head{
    min-height:36px;
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:7px;
    padding:0 6px;
    border-bottom:1px solid var(--border-color,#4d4d4d81);
    background:var(--header-bg,var(--secondary-dark,#3c3c3c));
   }

   .vetr-controls-head strong,
   .vetr-controls-head span{
    display:block;
   }

   .vetr-controls-head strong{
    font-size:8px;
   }

   .vetr-controls-head span{
    margin-top:2px;
    color:var(--text-secondary,#b0b0b0);
    font-size:7px;
   }

   .vetr-controls-head>div:last-child{
    display:flex;
    gap:2px;
   }

   .vetr-controls-head button{
    height:21px;
    display:flex;
    align-items:center;
    gap:4px;
    padding:0 5px;
    border:1px solid var(--border-color,#4d4d4d81);
    border-radius:0;
    background:var(--bg-button,#363636);
    color:var(--text-secondary,#b0b0b0);
    font-size:7px;
   }

   .vetr-controls-head svg{
    width:12px;
    height:12px;
    fill:none;
    stroke:currentColor;
    stroke-width:1.6;
   }

   .vetr-ab-preview{
    padding:7px;
    border-bottom:1px solid var(--border-color,#4d4d4d81);
   }

   .vetr-preview-stage{
    position:relative;
    height:150px;
    overflow:hidden;
    border:1px solid var(--border-color,#4d4d4d81);
    background:#171717;
   }

   .vetr-preview-card{
    position:absolute;
    inset:13px;
    display:flex;
    align-items:center;
    justify-content:center;
    font-size:44px;
    font-weight:800;
    transition:none;
    transform-origin:center;
   }

   .vetr-preview-card.a{
    background:linear-gradient(135deg,#3b4653,#22282e);
    color:#d3d7dc;
   }

   .vetr-preview-card.b{
    background:linear-gradient(135deg,#5a4339,#2d2420);
    color:#e1d4cf;
   }

   .vetr-preview-overlay{
    position:absolute;
    inset:0;
    opacity:0;
    pointer-events:none;
   }

   .vetr-preview-stage>span{
    position:absolute;
    right:6px;
    bottom:5px;
    padding:2px 4px;
    background:rgba(0,0,0,.5);
    color:#fff;
    font-size:7px;
   }

   .vetr-preview-scrub{
    min-height:30px;
    display:grid;
    grid-template-columns:48px minmax(0,1fr) 40px;
    align-items:center;
    gap:5px;
    color:var(--text-secondary,#b0b0b0);
    font-size:7px;
   }

   .vetr-preview-scrub input{
    width:100%;
    accent-color:var(--accent-blue,#5f5f5f);
   }

   .vetr-preview-scrub output{
    text-align:right;
    color:#fff;
   }

   .vetr-controls-section{
    margin:6px;
    border:1px solid var(--border-color,#4d4d4d81);
    background:var(--panel-bg,#333);
   }

   .vetr-controls-section>header{
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

   .vetr-controls-section>header em{
    font-style:normal;
    font-weight:500;
   }

   .vetr-control-row{
    min-height:29px;
    display:grid;
    grid-template-columns:70px minmax(0,1fr) 56px;
    align-items:center;
    gap:5px;
    padding:0 6px;
    color:var(--text-secondary,#b0b0b0);
    font-size:7px;
   }

   .vetr-control-row input[type="range"]{
    width:100%;
    min-width:0;
    accent-color:var(--accent-blue,#5f5f5f);
   }

   .vetr-control-row input[type="number"]{
    width:56px;
    height:19px;
    box-sizing:border-box;
    border:1px solid var(--border-color,#4d4d4d81);
    border-radius:0;
    background:var(--secondary-dark,#3c3c3c);
    color:#fff;
    font-size:7px;
    text-align:right;
   }

   .vetr-control-select,
   .vetr-control-color,
   .vetr-control-check{
    min-height:29px;
    display:grid;
    grid-template-columns:70px minmax(0,1fr);
    align-items:center;
    gap:5px;
    padding:0 6px;
    color:var(--text-secondary,#b0b0b0);
    font-size:7px;
   }

   .vetr-control-select select{
    height:20px;
    border:1px solid var(--border-color,#4d4d4d81);
    border-radius:0;
    background:var(--secondary-dark,#3c3c3c);
    color:#fff;
    font-size:7px;
   }

   .vetr-control-color input{
    width:100%;
    height:21px;
    padding:0;
    border:1px solid var(--border-color,#4d4d4d81);
    border-radius:0;
    background:transparent;
   }

   .vetr-control-checks{
    display:flex;
    align-items:center;
    gap:14px;
    min-height:30px;
    padding:0 6px;
    color:var(--text-secondary,#b0b0b0);
    font-size:7px;
   }

   .vetr-control-checks label{
    display:flex;
    align-items:center;
    gap:5px;
   }

   .vetr-control-params{
    padding:3px 0;
   }

   .vetr-no-params,
   .vetr-render-note{
    padding:9px;
    color:var(--text-secondary,#b0b0b0);
    font-size:7px;
    line-height:1.5;
   }

   .vetr-controls-empty{
    height:100%;
    display:flex;
    flex-direction:column;
    align-items:center;
    justify-content:center;
    gap:5px;
    color:var(--text-secondary,#b0b0b0);
    text-align:center;
   }

   .vetr-controls-empty strong{
    color:#fff;
    font-size:9px;
   }

   .vetr-controls-empty span{
    font-size:7px;
   }
  `;

      document.head.appendChild(style);
    }
  }

  global.VideoTransitionControlsPanel = VideoTransitionControlsPanel;
})(window);
