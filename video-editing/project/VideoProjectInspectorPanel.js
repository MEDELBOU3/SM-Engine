/**
 * VideoProjectInspectorPanel.js
 * SM Engine — quick right-side Project inspector.
 */
(function (global) {
  "use strict";

  class VideoProjectInspectorPanel {
    constructor(manager = null) {
      this.manager = manager || global.videoProjectContentManager;

      this.host = null;

      this._unsub = this.manager?.subscribe?.((event) => {
        if (!this.host) {
          return;
        }

        if (["metadata", "settings"].includes(event?.type)) {
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

      const project = this.manager.project;

      const meta = project?.project || {};

      const settings = project?.settings || {};

      const summary = this.manager.summary();

      const resolution = settings.resolution || {
        w: 1280,
        h: 720,
      };

      this.host.innerHTML = `
   <div class="veproj-inspector">
    <div class="veproj-inspector-top">
     <div class="veproj-inspector-title">
      <span>${this._svg("project")}</span>

      <div>
       <strong>Project</strong>
       <em>${this._esc(meta.name || "Untitled Video Project")}</em>
      </div>
     </div>

     <button
      type="button"
      class="veproj-open-dock compact"
      data-open-project-dock>
      ${this._svg("panel")}
     </button>
    </div>

    <section class="veproj-inspector-section">
     <header>
      <span>PROJECT</span>
      <em>${project?.dirty ? "MODIFIED" : "SAVED"}</em>
     </header>

     <label class="veproj-inspector-field">
      <span>Name</span>
      <input
       type="text"
       value="${this._esc(meta.name || "Untitled Video Project")}"
       data-project-inspector-name>
     </label>

     <div class="veproj-inspector-summary">
      ${this._row("Resolution", `${resolution.w} × ${resolution.h}`)}

      ${this._row("Frame Rate", `${Number(settings.fps || 30)} fps`)}

      ${this._row("Duration", this.manager.formatTime(summary.duration))}

      ${this._row("Media", String(summary.media))}

      ${this._row("Clips", String(summary.clips))}
     </div>
    </section>

    <section class="veproj-inspector-section">
     <header>
      <span>FORMAT</span>
      <em>${this._esc(settings.workingColorSpace || "sRGB")}</em>
     </header>

     <label class="veproj-inspector-select">
      <span>FPS</span>
      <select data-project-inspector-fps>
       ${[23.976, 24, 25, 29.97, 30, 50, 59.94, 60]
         .map(
           (value) => `
        <option
         value="${value}"
         ${Math.abs(Number(settings.fps || 30) - value) < 0.001 ? "selected" : ""}>
         ${value}
        </option>
       `,
         )
         .join("")}
      </select>
     </label>

     <label class="veproj-inspector-select">
      <span>Color</span>
      <select data-project-inspector-color>
       ${["sRGB", "Rec.709", "Display-P3", "Rec.2020"]
         .map(
           (value) => `
        <option
         value="${value}"
         ${String(settings.workingColorSpace || "sRGB") === value ? "selected" : ""}>
         ${value}
        </option>
       `,
         )
         .join("")}
      </select>
     </label>
    </section>

    <section class="veproj-inspector-section">
     <header>
      <span>STATUS</span>
      <em>${project?._autosaveEnabled ? "AUTOSAVE ON" : "AUTOSAVE OFF"}</em>
     </header>

     <div class="veproj-inspector-actions">
      <button
       type="button"
       data-project-save>
       ${this._svg("save")}
       <span>SAVE</span>
      </button>

      <button
       type="button"
       data-project-autosave
       class="${project?._autosaveEnabled ? "active" : ""}">
       ${this._svg("autosave")}
       <span>AUTOSAVE</span>
      </button>
     </div>
    </section>

    <button
     type="button"
     class="veproj-open-dock"
     data-open-project-dock>
     ${this._svg("panel")}
     <span>CONTENTS / SETTINGS / INFO / MANAGE</span>
    </button>
   </div>
  `;

      this._bind();

      return true;
    }

    _bind() {
      this.host
        .querySelector("[data-project-inspector-name]")
        ?.addEventListener("change", (event) => {
          this.manager.rename(event.target.value);

          this.render();
        });

      this.host
        .querySelector("[data-project-inspector-fps]")
        ?.addEventListener("change", (event) => {
          this.manager.setFPS(Number(event.target.value));
        });

      this.host
        .querySelector("[data-project-inspector-color]")
        ?.addEventListener("change", (event) => {
          this.manager.setColorSpace(event.target.value);
        });

      this.host
        .querySelector("[data-project-save]")
        ?.addEventListener("click", () => {
          this.manager.exportProjectFile();
          this.render();
        });

      this.host
        .querySelector("[data-project-autosave]")
        ?.addEventListener("click", () => {
          this.manager.toggleAutosave(!this.manager.project?._autosaveEnabled);

          this.render();
        });

      this.host
        .querySelectorAll("[data-open-project-dock]")
        .forEach((button) => {
          button.addEventListener("click", () => {
            global.ensureVideoProjectDockManager?.()?.open?.({
              tab:
                global.videoProject?.workspace?.perWorkspace?.edit
                  ?.projectDockTab || "contents",
            });
          });
        });
    }

    _row(label, value) {
      return `
   <div class="veproj-inspector-row">
    <span>${this._esc(label)}</span>
    <strong>${this._esc(value)}</strong>
   </div>
  `;
    }

    _svg(name) {
      const icons = {
        project:
          '<svg viewBox="0 0 24 24"><path d="M4 5h6l2 2h8v12H4z"/><path d="M8 11h8M8 15h6"/></svg>',
        panel:
          '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16"/><path d="M14 4v16M17 8h2M17 12h2M17 16h2"/></svg>',
        save: '<svg viewBox="0 0 24 24"><path d="M5 4h12l2 2v14H5z"/><path d="M8 4v6h8V4M8 16h8"/></svg>',
        autosave:
          '<svg viewBox="0 0 24 24"><path d="M5 8a8 8 0 1 1-1 7"/><path d="M5 4v4h4"/><path d="M9 11h6v5H9z"/></svg>',
      };

      return icons[name] || icons.project;
    }

    _esc(value) {
      return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
    }

    _styles() {
      if (document.getElementById("veproj-inspector-style")) {
        return;
      }

      const style = document.createElement("style");

      style.id = "veproj-inspector-style";

      style.textContent = `
   .veproj-inspector{
    display:flex;
    flex-direction:column;
    gap:6px;
    padding:6px;
    color:#fff;
   }

   .veproj-inspector-top{
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:6px;
   }

   .veproj-inspector-title{
    display:flex;
    align-items:center;
    gap:7px;
    min-width:0;
   }

   .veproj-inspector-title>span{
    width:18px;
    height:18px;
    flex:0 0 18px;
    color:var(--text-secondary,#b0b0b0);
   }

   .veproj-inspector svg{
    width:100%;
    height:100%;
    fill:none;
    stroke:currentColor;
    stroke-width:1.65;
    stroke-linecap:round;
    stroke-linejoin:round;
   }

   .veproj-inspector-title>div{
    min-width:0;
   }

   .veproj-inspector-title strong,
   .veproj-inspector-title em{
    display:block;
   }

   .veproj-inspector-title strong{
    font-size:9px;
   }

   .veproj-inspector-title em{
    margin-top:2px;
    max-width:220px;
    overflow:hidden;
    text-overflow:ellipsis;
    white-space:nowrap;
    color:var(--text-secondary,#b0b0b0);
    font-style:normal;
    font-size:7px;
   }

   .veproj-inspector-section{
    border:1px solid var(--border-color,#4d4d4d81);
    background:var(--panel-bg,#333);
   }

   .veproj-inspector-section>header{
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

   .veproj-inspector-section>header em{
    font-style:normal;
    font-weight:500;
   }

   .veproj-inspector-field,
   .veproj-inspector-select{
    min-height:30px;
    display:grid;
    grid-template-columns:60px minmax(0,1fr);
    align-items:center;
    gap:5px;
    padding:0 6px;
    color:var(--text-secondary,#b0b0b0);
    font-size:7px;
   }

   .veproj-inspector-field input,
   .veproj-inspector-select select{
    height:20px;
    box-sizing:border-box;
    border:1px solid var(--border-color,#4d4d4d81);
    border-radius:0;
    background:var(--secondary-dark,#3c3c3c);
    color:#fff;
    font-size:7px;
   }

   .veproj-inspector-field input{
    padding:0 5px;
   }

   .veproj-inspector-summary{
    padding:3px 0;
   }

   .veproj-inspector-row{
    min-height:25px;
    display:grid;
    grid-template-columns:70px minmax(0,1fr);
    align-items:center;
    gap:6px;
    padding:0 6px;
    color:var(--text-secondary,#b0b0b0);
    font-size:7px;
   }

   .veproj-inspector-row strong{
    color:#fff;
    text-align:right;
    font-weight:500;
   }

   .veproj-inspector-actions{
    display:grid;
    grid-template-columns:1fr 1fr;
    gap:4px;
    padding:6px;
   }

   .veproj-inspector-actions button,
   .veproj-open-dock{
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

   .veproj-inspector-actions button:hover,
   .veproj-inspector-actions button.active,
   .veproj-open-dock:hover{
    background:var(--accent-blue-dark,#474747);
    color:#fff;
   }

   .veproj-inspector-actions svg,
   .veproj-open-dock svg{
    width:12px;
    height:12px;
   }

   .veproj-open-dock{
    width:100%;
    min-height:25px;
   }

   .veproj-open-dock.compact{
    width:25px;
    min-height:23px;
    flex:0 0 25px;
    padding:5px;
   }
  `;

      document.head.appendChild(style);
    }
  }

  global.VideoProjectInspectorPanel = VideoProjectInspectorPanel;

  global.ensureVideoProjectInspectorPanel =
    function ensureVideoProjectInspectorPanel() {
      if (!global.videoProjectInspectorPanel) {
        global.videoProjectInspectorPanel = new VideoProjectInspectorPanel(
          global.videoProjectContentManager,
        );
      }

      return global.videoProjectInspectorPanel;
    };
})(window);
