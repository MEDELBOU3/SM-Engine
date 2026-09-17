/**
 * VideoTransitionInspectorPanel.js
 * SM Engine — quick right-side Transition inspector.
 */
(function (global) {
  "use strict";

  class VideoTransitionInspectorPanel {
    constructor(manager = null) {
      this.manager = manager || global.videoTransitionsManager;

      this.host = null;

      this._unsub = this.manager?.subscribe?.((event) => {
        if (!this.host) return;

        if (["option", "duration"].includes(event?.type)) {
          return;
        }

        this.render();
      });

      this._styles();
    }

    render(host = null) {
      this.host = host || this.host;

      if (!this.host) {
        return false;
      }

      const clip = this.manager?.selectedClip?.();

      const selected = this.manager?.selectedTransition?.();

      if (!clip) {
        this.host.innerHTML = `
    <div class="vetr-inspector">
     <div class="vetr-inspector-title">
      <span>${this.manager.library.icon("transitions")}</span>
      <div>
       <strong>Transitions</strong>
       <em>Clip / Cut Transitions</em>
      </div>
     </div>

     <div class="vetr-inspector-empty">
      <strong>No clip selected</strong>
      <span>Select a clip in the Sequencer.</span>
     </div>

     <button
      type="button"
      class="vetr-open-dock"
      data-open-transition-dock>
      ${this.manager.library.icon("transitions")}
      <span>OPEN TRANSITIONS STUDIO</span>
     </button>
    </div>
   `;

        this._bindOpen();

        return true;
      }

      if (!selected) {
        this.host.innerHTML = `
    <div class="vetr-inspector">
     <div class="vetr-inspector-title">
      <span>${this.manager.library.icon("transitions")}</span>
      <div>
       <strong>Transitions</strong>
       <em>${this._esc(clip.name || "Selected Clip")}</em>
      </div>
     </div>

     <div class="vetr-inspector-empty">
      <strong>No transition selected</strong>
      <span>Add IN, CUT, or OUT transition from the browser.</span>
     </div>

     <button
      type="button"
      class="vetr-open-dock"
      data-open-transition-dock>
      ${this.manager.library.icon("transitions")}
      <span>BROWSE TRANSITIONS</span>
     </button>
    </div>
   `;

        this._bindOpen("transitions");

        return true;
      }

      const transition = selected.transition;

      const def = this.manager.library.get(transition.id);

      this.host.innerHTML = `
   <div class="vetr-inspector">
    <div class="vetr-inspector-top">
     <div class="vetr-inspector-title">
      <span>${this.manager.library.icon(def?.icon || "transitions")}</span>

      <div>
       <strong>${this._esc(def?.name || transition.name || transition.id)}</strong>
       <em>${String(selected.edge).toUpperCase()} · ${this._esc(selected.clip.name || "Clip")}</em>
      </div>
     </div>

     <button
      type="button"
      class="vetr-open-dock compact"
      data-open-transition-dock>
      ${this.manager.library.icon("transitions")}
     </button>
    </div>

    <section class="vetr-inspector-section">
     <header>
      <span>TRANSITION</span>
      <em>${def?.renderer === "live-opacity" ? "LIVE" : "COMPOSITOR"}</em>
     </header>

     <label class="vetr-inspector-row">
      <span>Duration</span>
      <input
       type="range"
       min="0.03"
       max="5"
       step="0.01"
       value="${Number(transition.duration || 0.5)}"
       data-transition-duration>
      <output data-transition-duration-read>
       ${Number(transition.duration || 0.5).toFixed(2)} s
      </output>
     </label>

     <label class="vetr-inspector-select">
      <span>Alignment</span>
      <select data-transition-alignment>
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

     <label class="vetr-inspector-select">
      <span>Easing</span>
      <select data-transition-easing>
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

     <div class="vetr-inspector-actions">
      <button
       type="button"
       data-transition-enable
       class="${transition.enabled !== false ? "active" : ""}">
       ${this._svg("power")}
       <span>${transition.enabled !== false ? "ENABLED" : "DISABLED"}</span>
      </button>

      <button
       type="button"
       data-transition-reverse
       class="${transition.reverse ? "active" : ""}">
       ${this._svg("reverse")}
       <span>REVERSE</span>
      </button>
     </div>
    </section>

    <section class="vetr-inspector-section">
     <header>
      <span>TOOLS</span>
      <em>${transition.pairId ? "PAIRED CUT" : "CLIP EDGE"}</em>
     </header>

     <div class="vetr-inspector-actions three">
      <button
       type="button"
       data-transition-copy>
       ${this._svg("copy")}
       <span>COPY</span>
      </button>

      <button
       type="button"
       data-transition-reset>
       ${this._svg("reset")}
       <span>RESET</span>
      </button>

      <button
       type="button"
       data-transition-remove>
       ${this._svg("trash")}
       <span>REMOVE</span>
      </button>
     </div>
    </section>

    <button
     type="button"
     class="vetr-open-dock"
     data-open-transition-dock>
     ${this.manager.library.icon("transitions")}
     <span>TRANSITIONS / APPLIED / CONTROLS / PRESETS</span>
    </button>
   </div>
  `;

      this._bind(selected, def);

      return true;
    }

    _bind(selected, def) {
      this._bindOpen("controls");

      const duration = this.host.querySelector("[data-transition-duration]");

      const durationRead = this.host.querySelector(
        "[data-transition-duration-read]",
      );

      duration?.addEventListener("input", () => {
        const value = Number(duration.value);

        this.manager.setDuration(value, selected);

        if (durationRead) {
          durationRead.textContent = `${value.toFixed(2)} s`;
        }
      });

      this.host
        .querySelector("[data-transition-alignment]")
        ?.addEventListener("change", (event) => {
          this.manager.setOption("alignment", event.target.value, selected);
        });

      this.host
        .querySelector("[data-transition-easing]")
        ?.addEventListener("change", (event) => {
          this.manager.setOption("easing", event.target.value, selected);
        });

      this.host
        .querySelector("[data-transition-enable]")
        ?.addEventListener("click", () => {
          this.manager.setOption(
            "enabled",
            selected.transition.enabled === false,
            selected,
          );

          this.render();
        });

      this.host
        .querySelector("[data-transition-reverse]")
        ?.addEventListener("click", () => {
          this.manager.setOption(
            "reverse",
            !selected.transition.reverse,
            selected,
          );

          this.render();
        });

      this.host
        .querySelector("[data-transition-copy]")
        ?.addEventListener("click", () => {
          this.manager.duplicateSelected?.();
        });

      this.host
        .querySelector("[data-transition-reset]")
        ?.addEventListener("click", () => {
          const instance = this.manager.library.createInstance(
            selected.transition.id,
            {
              edge: selected.edge,
              duration: def?.defaultDuration || 0.5,
              pairId: selected.transition.pairId,
            },
          );

          if (!instance) {
            return;
          }

          selected.transition.duration = instance.duration;

          selected.transition.alignment = instance.alignment;

          selected.transition.easing = instance.easing;

          selected.transition.reverse = false;

          selected.transition.enabled = true;

          selected.transition.params = instance.params;

          this.manager._sync(selected.clip, "reset", {
            edge: selected.edge,
          });

          this.render();
        });

      this.host
        .querySelector("[data-transition-remove]")
        ?.addEventListener("click", () => {
          this.manager.remove(selected.clip, selected.edge);

          this.render();
        });
    }

    _bindOpen(tab = "transitions") {
      this.host
        ?.querySelectorAll("[data-open-transition-dock]")
        .forEach((button) => {
          button.addEventListener("click", () => {
            global.ensureVideoTransitionsDockManager?.()?.open?.({
              tab,
            });
          });
        });
    }

    _svg(name) {
      const icons = {
        power:
          '<svg viewBox="0 0 24 24"><path d="M12 3v8M7 6a8 8 0 1 0 10 0"/></svg>',
        reverse:
          '<svg viewBox="0 0 24 24"><path d="M8 7H4v4M4 11c1-4 4-6 8-6 5 0 8 3 8 7M16 17h4v-4M20 13c-1 4-4 6-8 6-5 0-8-3-8-7"/></svg>',
        copy: '<svg viewBox="0 0 24 24"><rect x="8" y="8" width="11" height="11"/><path d="M16 8V5H5v11h3"/></svg>',
        reset:
          '<svg viewBox="0 0 24 24"><path d="M5 8a8 8 0 1 1-1 7"/><path d="M5 4v4h4"/></svg>',
        trash:
          '<svg viewBox="0 0 24 24"><path d="M5 7h14M9 7V4h6v3M8 10v8M12 10v8M16 10v8M7 7l1 14h8l1-14"/></svg>',
      };

      return icons[name] || icons.reverse;
    }

    _esc(value) {
      return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
    }

    _styles() {
      if (document.getElementById("vetr-inspector-style")) {
        return;
      }

      const style = document.createElement("style");

      style.id = "vetr-inspector-style";

      style.textContent = `
   .vetr-inspector{
    display:flex;
    flex-direction:column;
    gap:6px;
    padding:6px;
    color:var(--text-primary,#fff);
   }

   .vetr-inspector-top{
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:6px;
   }

   .vetr-inspector-title{
    display:flex;
    align-items:center;
    gap:7px;
    min-width:0;
   }

   .vetr-inspector-title>span{
    width:18px;
    height:18px;
    flex:0 0 18px;
    color:var(--text-secondary,#b0b0b0);
   }

   .vetr-inspector svg{
    width:100%;
    height:100%;
    fill:none;
    stroke:currentColor;
    stroke-width:1.65;
    stroke-linecap:round;
    stroke-linejoin:round;
   }

   .vetr-inspector-title>div{
    min-width:0;
   }

   .vetr-inspector-title strong,
   .vetr-inspector-title em{
    display:block;
   }

   .vetr-inspector-title strong{
    font-size:9px;
   }

   .vetr-inspector-title em{
    margin-top:2px;
    max-width:220px;
    overflow:hidden;
    text-overflow:ellipsis;
    white-space:nowrap;
    color:var(--text-secondary,#b0b0b0);
    font-style:normal;
    font-size:7px;
   }

   .vetr-inspector-section{
    border:1px solid var(--border-color,#4d4d4d81);
    background:var(--panel-bg,#333);
   }

   .vetr-inspector-section>header{
    height:23px;
    display:flex;
    align-items:center;
    justify-content:space-between;
    padding:0 6px;
    border-bottom:1px solid var(--border-color,#4d4d4d81);
    background:var(--header-bg,var(--secondary-dark,#3c3c3c));
    color:var(--text-secondary,#b0b0b0);
    font-size:7px;
    font-weight:700;
   }

   .vetr-inspector-section>header em{
    font-style:normal;
    font-weight:500;
   }

   .vetr-inspector-row{
    min-height:30px;
    display:grid;
    grid-template-columns:58px minmax(0,1fr) 48px;
    align-items:center;
    gap:5px;
    padding:0 6px;
    color:var(--text-secondary,#b0b0b0);
    font-size:7px;
   }

   .vetr-inspector-row input{
    width:100%;
    accent-color:var(--accent-blue,#5f5f5f);
   }

   .vetr-inspector-row output{
    text-align:right;
    color:#fff;
   }

   .vetr-inspector-select{
    min-height:29px;
    display:grid;
    grid-template-columns:68px minmax(0,1fr);
    align-items:center;
    gap:5px;
    padding:0 6px;
    color:var(--text-secondary,#b0b0b0);
    font-size:7px;
   }

   .vetr-inspector-select select{
    height:20px;
    border:1px solid var(--border-color,#4d4d4d81);
    border-radius:0;
    background:var(--secondary-dark,#3c3c3c);
    color:#fff;
    font-size:7px;
   }

   .vetr-inspector-actions{
    display:grid;
    grid-template-columns:1fr 1fr;
    gap:4px;
    padding:6px;
   }

   .vetr-inspector-actions.three{
    grid-template-columns:repeat(3,1fr);
   }

   .vetr-inspector-actions button,
   .vetr-open-dock{
    min-height:23px;
    display:flex;
    align-items:center;
    justify-content:center;
    gap:4px;
    border:1px solid var(--border-color,#4d4d4d81);
    border-radius:0;
    background:var(--bg-button,#363636);
    color:var(--text-secondary,#b0b0b0);
    font-size:7px;
   }

   .vetr-inspector-actions button:hover,
   .vetr-inspector-actions button.active,
   .vetr-open-dock:hover{
    background:var(--accent-blue-dark,#474747);
    color:#fff;
   }

   .vetr-inspector-actions svg,
   .vetr-open-dock svg{
    width:12px;
    height:12px;
   }

   .vetr-open-dock{
    width:100%;
    min-height:25px;
   }

   .vetr-open-dock.compact{
    width:25px;
    min-height:23px;
    flex:0 0 25px;
    padding:5px;
   }

   .vetr-inspector-empty{
    min-height:110px;
    display:flex;
    flex-direction:column;
    align-items:center;
    justify-content:center;
    gap:5px;
    color:var(--text-secondary,#b0b0b0);
    text-align:center;
   }

   .vetr-inspector-empty strong{
    color:#fff;
    font-size:9px;
   }

   .vetr-inspector-empty span{
    font-size:7px;
   }
  `;

      document.head.appendChild(style);
    }
  }

  global.VideoTransitionInspectorPanel = VideoTransitionInspectorPanel;

  global.ensureVideoTransitionInspectorPanel =
    function ensureVideoTransitionInspectorPanel() {
      if (!global.videoTransitionInspectorPanel) {
        global.videoTransitionInspectorPanel =
          new VideoTransitionInspectorPanel(global.videoTransitionsManager);
      }

      return global.videoTransitionInspectorPanel;
    };
})(window);
