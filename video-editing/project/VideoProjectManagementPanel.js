/**
 * VideoProjectManagementPanel.js
 * SM Engine — save/import/autosave/new project controls.
 */
(function (global) {
  "use strict";

  class VideoProjectManagementPanel {
    constructor(manager) {
      this.manager = manager || global.videoProjectContentManager;

      this.host = null;
      this.fileInput = null;
      this._styles();
    }

    mount(host) {
      this.host = host;
      this.render();
    }

    render() {
      if (!this.host) return;

      const project = this.manager.project;

      const autosaveEnabled = !!project?._autosaveEnabled;

      const hasAutosave = this._hasAutosave();

      this.host.innerHTML = `
   <div class="veproj-management-panel">
    <header>
     <div>
      <strong>PROJECT MANAGEMENT</strong>
      <span>Save, restore and project lifecycle</span>
     </div>

     <span class="veproj-management-state ${project?.dirty ? "dirty" : ""}">
      ${project?.dirty ? "UNSAVED CHANGES" : "PROJECT SAVED"}
     </span>
    </header>

    <section class="veproj-management-section">
     <header>
      <span>PROJECT FILE</span>
      <em>.smvideo.json</em>
     </header>

     <div class="veproj-management-actions">
      <button
       type="button"
       data-export-project>
       ${this._svg("save")}
       <strong>SAVE PROJECT</strong>
       <span>Export the full VideoProjectState.</span>
      </button>

      <button
       type="button"
       data-import-project>
       ${this._svg("open")}
       <strong>OPEN PROJECT</strong>
       <span>Load an SM Engine video project.</span>
      </button>
     </div>
    </section>

    <section class="veproj-management-section">
     <header>
      <span>AUTOSAVE</span>
      <em>${autosaveEnabled ? "ON" : "OFF"}</em>
     </header>

     <label class="veproj-autosave-toggle">
      <span>
       <strong>Enable Autosave</strong>
       <em>Store a recoverable project snapshot locally.</em>
      </span>

      <input
       type="checkbox"
       data-autosave-toggle
       ${autosaveEnabled ? "checked" : ""}>
     </label>

     <div class="veproj-management-small-actions">
      <button
       type="button"
       data-autosave-now>
       SAVE SNAPSHOT
      </button>

      <button
       type="button"
       data-autosave-restore
       ${hasAutosave ? "" : "disabled"}>
       RESTORE
      </button>

      <button
       type="button"
       data-autosave-clear
       ${hasAutosave ? "" : "disabled"}>
       CLEAR
      </button>
     </div>
    </section>

    <section class="veproj-management-section danger">
     <header>
      <span>PROJECT LIFECYCLE</span>
      <em>CAUTION</em>
     </header>

     <div class="veproj-management-danger">
      <div>
       <strong>New Empty Project</strong>
       <span>Clears the current Video Editing project state.</span>
      </div>

      <button
       type="button"
       data-new-project>
       NEW PROJECT
      </button>
     </div>
    </section>

    <input
     type="file"
     accept=".json,.smvideo.json,application/json"
     hidden
     data-project-file-input>
   </div>
  `;

      this.fileInput = this.host.querySelector("[data-project-file-input]");

      this._bind();
    }

    _bind() {
      this.host
        .querySelector("[data-export-project]")
        ?.addEventListener("click", () => {
          this.manager.exportProjectFile();
          this.render();
        });

      this.host
        .querySelector("[data-import-project]")
        ?.addEventListener("click", () => {
          this.fileInput?.click();
        });

      this.fileInput?.addEventListener("change", async () => {
        const file = this.fileInput.files?.[0];

        if (!file) {
          return;
        }

        try {
          await this.manager.importProjectFile(file);

          this.render();
        } catch (error) {
          console.error("[ProjectManagement] import failed:", error);

          alert("Could not open this project file.");
        }
      });

      this.host
        .querySelector("[data-autosave-toggle]")
        ?.addEventListener("change", (event) => {
          this.manager.toggleAutosave(event.target.checked);

          this.render();
        });

      this.host
        .querySelector("[data-autosave-now]")
        ?.addEventListener("click", () => {
          this.manager.saveAutosave();
          this.render();
        });

      this.host
        .querySelector("[data-autosave-restore]")
        ?.addEventListener("click", () => {
          if (
            confirm(
              "Restore the autosaved project snapshot? Current unsaved changes will be replaced.",
            )
          ) {
            this.manager.restoreAutosave();
            this.render();
          }
        });

      this.host
        .querySelector("[data-autosave-clear]")
        ?.addEventListener("click", () => {
          this.manager.clearAutosave();
          this.render();
        });

      this.host
        .querySelector("[data-new-project]")
        ?.addEventListener("click", () => {
          if (
            confirm(
              "Create a new empty project? Current unsaved project data will be cleared.",
            )
          ) {
            this.manager.createNewProject();
            this.render();
          }
        });
    }

    _hasAutosave() {
      try {
        const project = this.manager.project;

        const key =
          project?._autosaveKey || "sm-engine.video-project.autosave.v1";

        return !!global.localStorage?.getItem(key);
      } catch (_) {
        return false;
      }
    }

    _svg(name) {
      const icons = {
        save: '<svg viewBox="0 0 24 24"><path d="M5 4h12l2 2v14H5z"/><path d="M8 4v6h8V4M8 16h8"/></svg>',
        open: '<svg viewBox="0 0 24 24"><path d="M3 7h7l2 2h9l-2 10H4z"/><path d="M4 7V5h7l2 2"/></svg>',
      };

      return icons[name] || icons.save;
    }

    _styles() {
      if (document.getElementById("veproj-management-style")) {
        return;
      }

      const style = document.createElement("style");

      style.id = "veproj-management-style";

      style.textContent = `
   .veproj-management-panel{
    height:100%;
    overflow:auto;
    background:var(--primary-dark,#333);
    color:#fff;
   }

   .veproj-management-panel>header{
    min-height:36px;
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:7px;
    padding:0 6px;
    border-bottom:1px solid var(--border-color,#4d4d4d81);
    background:var(--header-bg,var(--secondary-dark,#3c3c3c));
   }

   .veproj-management-panel>header strong,
   .veproj-management-panel>header span{
    display:block;
   }

   .veproj-management-panel>header strong{
    font-size:8px;
   }

   .veproj-management-panel>header span{
    margin-top:2px;
    color:var(--text-secondary,#b0b0b0);
    font-size:7px;
   }

   .veproj-management-state{
    padding:3px 5px;
    border:1px solid var(--border-color,#4d4d4d81);
    font-size:6px!important;
   }

   .veproj-management-state.dirty{
    background:var(--accent-blue-dark,#474747);
    color:#fff!important;
   }

   .veproj-management-section{
    margin:6px;
    border:1px solid var(--border-color,#4d4d4d81);
    background:var(--panel-bg,#333);
   }

   .veproj-management-section>header{
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

   .veproj-management-section>header em{
    font-style:normal;
    font-weight:500;
   }

   .veproj-management-actions{
    display:grid;
    grid-template-columns:1fr 1fr;
    gap:5px;
    padding:6px;
   }

   .veproj-management-actions button{
    min-height:88px;
    display:grid;
    grid-template-rows:24px auto auto;
    justify-items:center;
    align-content:center;
    gap:4px;
    border:1px solid var(--border-color,#4d4d4d81);
    border-radius:0;
    background:var(--primary-dark,#333);
    color:var(--text-secondary,#b0b0b0);
   }

   .veproj-management-actions button:hover{
    background:var(--secondary-dark,#3c3c3c);
    color:#fff;
   }

   .veproj-management-actions svg{
    width:22px;
    height:22px;
    fill:none;
    stroke:currentColor;
    stroke-width:1.6;
   }

   .veproj-management-actions button strong{
    font-size:8px;
   }

   .veproj-management-actions button span{
    max-width:140px;
    text-align:center;
    font-size:6px;
   }

   .veproj-autosave-toggle{
    min-height:52px;
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:8px;
    padding:0 7px;
   }

   .veproj-autosave-toggle>span{
    min-width:0;
   }

   .veproj-autosave-toggle strong,
   .veproj-autosave-toggle em{
    display:block;
   }

   .veproj-autosave-toggle strong{
    font-size:8px;
   }

   .veproj-autosave-toggle em{
    margin-top:3px;
    color:var(--text-secondary,#b0b0b0);
    font-style:normal;
    font-size:6px;
   }

   .veproj-management-small-actions{
    display:grid;
    grid-template-columns:1fr 1fr 1fr;
    gap:4px;
    padding:0 6px 6px;
   }

   .veproj-management-small-actions button,
   .veproj-management-danger button{
    min-height:22px;
    border:1px solid var(--border-color,#4d4d4d81);
    border-radius:0;
    background:var(--bg-button,#363636);
    color:var(--text-secondary,#b0b0b0);
    font-size:7px;
   }

   .veproj-management-small-actions button:hover,
   .veproj-management-danger button:hover{
    background:var(--accent-blue-dark,#474747);
    color:#fff;
   }

   .veproj-management-small-actions button:disabled{
    opacity:.35;
   }

   .veproj-management-danger{
    min-height:58px;
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:8px;
    padding:0 7px;
   }

   .veproj-management-danger strong,
   .veproj-management-danger span{
    display:block;
   }

   .veproj-management-danger strong{
    font-size:8px;
   }

   .veproj-management-danger span{
    margin-top:3px;
    color:var(--text-secondary,#b0b0b0);
    font-size:6px;
   }

   .veproj-management-danger button{
    min-width:92px;
    padding:0 8px;
   }
  `;

      document.head.appendChild(style);
    }
  }

  global.VideoProjectManagementPanel = VideoProjectManagementPanel;
})(window);
