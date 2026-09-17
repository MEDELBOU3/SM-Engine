/**
 * VideoProjectInfoPanel.js
 * SM Engine — Project metadata and statistics.
 */
(function (global) {
  "use strict";

  class VideoProjectInfoPanel {
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

      const project = this.manager.project;

      const meta = project?.project || {};

      const summary = this.manager.summary();

      const settings = project?.settings || {};

      this.host.innerHTML = `
   <div class="veproj-info-panel">
    <header>
     <div>
      <strong>PROJECT INFO</strong>
      <span>Metadata and project statistics</span>
     </div>

     <span class="veproj-info-status ${project?.dirty ? "dirty" : ""}">
      ${project?.dirty ? "MODIFIED" : "SAVED"}
     </span>
    </header>

    <section class="veproj-info-section">
     <header>
      <span>METADATA</span>
      <em>${this._esc(meta.id || "Project")}</em>
     </header>

     <label class="veproj-info-field">
      <span>Name</span>
      <input
       type="text"
       value="${this._esc(meta.name || "Untitled Video Project")}"
       data-project-name>
     </label>

     <label class="veproj-info-field">
      <span>Tags</span>
      <input
       type="text"
       value="${this._esc((meta.tags || []).join(", "))}"
       placeholder="commercial, documentary, short"
       data-project-tags>
     </label>

     <label class="veproj-info-notes">
      <span>Notes</span>
      <textarea
       data-project-notes
       placeholder="Project notes...">${this._esc(meta.notes || "")}</textarea>
     </label>
    </section>

    <section class="veproj-info-section">
     <header>
      <span>STATISTICS</span>
      <em>${this.manager.formatTime(summary.duration)}</em>
     </header>

     <div class="veproj-stat-grid">
      ${this._stat("Media", summary.media, "media")}
      ${this._stat("Clips", summary.clips, "clip")}
      ${this._stat("Tracks", summary.tracks, "track")}
      ${this._stat("Markers", summary.markers, "marker")}
      ${this._stat("Used Media", summary.usedMedia, "link")}
      ${this._stat("Unused", summary.unusedMedia, "unused")}
     </div>
    </section>

    <section class="veproj-info-section">
     <header>
      <span>FORMAT SUMMARY</span>
      <em>${Number(settings.fps || 30)} FPS</em>
     </header>

     <div class="veproj-info-summary">
      ${this._summaryRow(
        "Resolution",
        `${settings.resolution?.w || 1280} × ${settings.resolution?.h || 720}`,
      )}

      ${this._summaryRow(
        "Color",
        settings.workingColorSpace || settings.colorSpace || "sRGB",
      )}

      ${this._summaryRow(
        "Audio",
        `${Number(settings.sampleRate || 48000) / 1000} kHz · ${settings.audioChannels || 2} ch`,
      )}

      ${this._summaryRow("Created", this._date(meta.createdAt))}

      ${this._summaryRow("Modified", this._date(meta.modifiedAt))}
     </div>
    </section>
   </div>
  `;

      this._bind();
    }

    _bind() {
      this.host
        .querySelector("[data-project-name]")
        ?.addEventListener("change", (event) => {
          this.manager.rename(event.target.value);

          this.render();
        });

      this.host
        .querySelector("[data-project-tags]")
        ?.addEventListener("change", (event) => {
          this.manager.setTags(event.target.value);
        });

      this.host
        .querySelector("[data-project-notes]")
        ?.addEventListener("change", (event) => {
          this.manager.setNotes(event.target.value);
        });
    }

    _stat(label, value, icon) {
      return `
   <article class="veproj-stat-card">
    <span>${this._svg(icon)}</span>
    <strong>${Number(value || 0)}</strong>
    <em>${label}</em>
   </article>
  `;
    }

    _summaryRow(label, value) {
      return `
   <div class="veproj-info-row">
    <span>${this._esc(label)}</span>
    <strong>${this._esc(value)}</strong>
   </div>
  `;
    }

    _date(value) {
      if (!value) {
        return "—";
      }

      const date = new Date(value);

      if (Number.isNaN(date.getTime())) {
        return String(value);
      }

      return date.toLocaleString();
    }

    _svg(name) {
      const icons = {
        media:
          '<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="14"/><path d="M9 9l6 3-6 3z"/></svg>',
        clip: '<svg viewBox="0 0 24 24"><rect x="4" y="7" width="16" height="10"/><path d="M8 7v10M16 7v10"/></svg>',
        track:
          '<svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
        marker:
          '<svg viewBox="0 0 24 24"><path d="M12 3l5 5-5 5-5-5z"/><path d="M12 13v8"/></svg>',
        link: '<svg viewBox="0 0 24 24"><path d="M9 8l-2-2a4 4 0 0 0-6 6l3 3a4 4 0 0 0 6 0l2-2"/><path d="M15 16l2 2a4 4 0 0 0 6-6l-3-3a4 4 0 0 0-6 0l-2 2"/><path d="M8 12h8"/></svg>',
        unused:
          '<svg viewBox="0 0 24 24"><path d="M4 4l16 16"/><rect x="5" y="6" width="14" height="12"/></svg>',
      };

      return icons[name] || icons.media;
    }

    _esc(value) {
      return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
    }

    _styles() {
      if (document.getElementById("veproj-info-style")) {
        return;
      }

      const style = document.createElement("style");

      style.id = "veproj-info-style";

      style.textContent = `
   .veproj-info-panel{
    height:100%;
    overflow:auto;
    background:var(--primary-dark,#333);
    color:#fff;
   }

   .veproj-info-panel>header{
    min-height:36px;
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:7px;
    padding:0 6px;
    border-bottom:1px solid var(--border-color,#4d4d4d81);
    background:var(--header-bg,var(--secondary-dark,#3c3c3c));
   }

   .veproj-info-panel>header strong,
   .veproj-info-panel>header span{
    display:block;
   }

   .veproj-info-panel>header strong{
    font-size:8px;
   }

   .veproj-info-panel>header span{
    margin-top:2px;
    color:var(--text-secondary,#b0b0b0);
    font-size:7px;
   }

   .veproj-info-status{
    padding:3px 5px;
    border:1px solid var(--border-color,#4d4d4d81);
    color:var(--text-secondary,#b0b0b0)!important;
    font-size:6px!important;
   }

   .veproj-info-status.dirty{
    color:#fff!important;
    background:var(--accent-blue-dark,#474747);
   }

   .veproj-info-section{
    margin:6px;
    border:1px solid var(--border-color,#4d4d4d81);
    background:var(--panel-bg,#333);
   }

   .veproj-info-section>header{
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

   .veproj-info-section>header em{
    max-width:170px;
    overflow:hidden;
    text-overflow:ellipsis;
    white-space:nowrap;
    font-style:normal;
    font-weight:500;
   }

   .veproj-info-field{
    min-height:31px;
    display:grid;
    grid-template-columns:64px minmax(0,1fr);
    align-items:center;
    gap:5px;
    padding:0 6px;
    color:var(--text-secondary,#b0b0b0);
    font-size:7px;
   }

   .veproj-info-field input{
    height:20px;
    padding:0 6px;
    border:1px solid var(--border-color,#4d4d4d81);
    border-radius:0;
    background:var(--secondary-dark,#3c3c3c);
    color:#fff;
    font-size:7px;
   }

   .veproj-info-notes{
    display:grid;
    gap:5px;
    padding:5px 6px 7px;
    color:var(--text-secondary,#b0b0b0);
    font-size:7px;
   }

   .veproj-info-notes textarea{
    min-height:70px;
    resize:vertical;
    padding:6px;
    border:1px solid var(--border-color,#4d4d4d81);
    border-radius:0;
    background:var(--secondary-dark,#3c3c3c);
    color:#fff;
    font-family:inherit;
    font-size:7px;
   }

   .veproj-stat-grid{
    display:grid;
    grid-template-columns:repeat(3,1fr);
    gap:4px;
    padding:6px;
   }

   .veproj-stat-card{
    min-height:62px;
    display:flex;
    flex-direction:column;
    align-items:center;
    justify-content:center;
    gap:3px;
    border:1px solid var(--border-color,#4d4d4d81);
    background:var(--primary-dark,#333);
   }

   .veproj-stat-card>span{
    width:15px;
    height:15px;
    color:var(--text-secondary,#b0b0b0);
   }

   .veproj-stat-card svg{
    width:100%;
    height:100%;
    fill:none;
    stroke:currentColor;
    stroke-width:1.6;
   }

   .veproj-stat-card strong{
    font-size:12px;
   }

   .veproj-stat-card em{
    color:var(--text-secondary,#b0b0b0);
    font-style:normal;
    font-size:6px;
   }

   .veproj-info-summary{
    padding:4px 0;
   }

   .veproj-info-row{
    min-height:27px;
    display:grid;
    grid-template-columns:85px minmax(0,1fr);
    align-items:center;
    gap:6px;
    padding:0 6px;
    color:var(--text-secondary,#b0b0b0);
    font-size:7px;
   }

   .veproj-info-row strong{
    overflow:hidden;
    text-overflow:ellipsis;
    white-space:nowrap;
    color:#fff;
    text-align:right;
    font-weight:500;
   }
  `;

      document.head.appendChild(style);
    }
  }

  global.VideoProjectInfoPanel = VideoProjectInfoPanel;
})(window);
