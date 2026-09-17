/**
 * VideoProjectContentsPanel.js
 * SM Engine — Project Contents browser.
 *
 * Tabs:
 * MEDIA | CLIPS | TRACKS | MARKERS
 */
(function (global) {
  "use strict";

  class VideoProjectContentsPanel {
    constructor(manager) {
      this.manager = manager || global.videoProjectContentManager;

      this.host = null;
      this.active = this.manager?.activeContentType || "media";

      this.search = this.manager?.search || "";

      this._styles();
    }

    mount(host) {
      this.host = host;
      this.render();
    }

    render() {
      if (!this.host) return;

      const summary = this.manager.summary();

      const items = this.manager.contents(this.active, this.search);

      this.host.innerHTML = `
   <div class="veproj-contents-panel">
    <header class="veproj-contents-head">
     <div>
      <strong>PROJECT CONTENTS</strong>
      <span>${summary.media} media · ${summary.clips} clips · ${summary.tracks} tracks</span>
     </div>

     <button
      type="button"
      data-project-refresh
      title="Refresh">
      ${this._svg("refresh")}
     </button>
    </header>

    <div class="veproj-content-search">
     <span>${this._svg("search")}</span>
     <input
      type="text"
      value="${this._esc(this.search)}"
      placeholder="Search project contents">
    </div>

    <nav class="veproj-content-tabs">
     ${[
       ["media", "MEDIA", summary.media],
       ["clips", "CLIPS", summary.clips],
       ["tracks", "TRACKS", summary.tracks],
       ["markers", "MARKERS", summary.markers],
     ]
       .map(
         ([id, label, count]) => `
      <button
       type="button"
       data-project-content-tab="${id}"
       class="${this.active === id ? "active" : ""}">
       <span>${label}</span>
       <em>${count}</em>
      </button>
     `,
       )
       .join("")}
    </nav>

    <div class="veproj-content-list">
     ${
       items.length
         ? items.map((item) => this._card(this.active, item)).join("")
         : `
       <div class="veproj-content-empty">
        <span>${this._svg("folder")}</span>
        <strong>No ${this.active}</strong>
        <em>${this.search ? "No matching items." : "This section is empty."}</em>
       </div>
      `
     }
    </div>

    <footer class="veproj-content-status">
     <span>${items.length} shown</span>
     <span>${this.manager.project?.dirty ? "Modified" : "Saved"}</span>
    </footer>
   </div>
  `;

      this._bind();
    }

    _card(type, item) {
      if (type === "media") {
        const mediaType = String(item.mediaType || "media").toLowerCase();

        const icon = mediaType.includes("video")
          ? "video"
          : mediaType.includes("audio")
            ? "audio"
            : mediaType.includes("image")
              ? "image"
              : "media";

        return `
    <article
     class="veproj-content-card"
     data-content-id="${this._esc(item.id)}"
     data-content-type="media">
     <span class="veproj-content-icon">
      ${this._svg(icon)}
     </span>

     <div class="veproj-content-copy">
      <strong>${this._esc(item.name || "Media")}</strong>
      <em>${this._esc(mediaType.toUpperCase())}${item.duration ? ` · ${this.manager.formatTime(item.duration)}` : ""}</em>
     </div>

     <span class="veproj-content-meta">
      ${
        item.mediaWidth && item.mediaHeight
          ? `${item.mediaWidth}×${item.mediaHeight}`
          : item.mimeType || ""
      }
     </span>
    </article>
   `;
      }

      if (type === "clips") {
        return `
    <article
     class="veproj-content-card"
     data-content-id="${this._esc(item.id)}"
     data-content-type="clips">
     <span class="veproj-content-icon">
      ${this._svg("clip")}
     </span>

     <div class="veproj-content-copy">
      <strong>${this._esc(item.name || item.id || "Clip")}</strong>
      <em>${this._esc(item.trackId || "No Track")} · ${this.manager.formatTime(item.start || 0)}</em>
     </div>

     <span class="veproj-content-meta">
      ${this.manager.formatTime(item.duration || 0)}
     </span>
    </article>
   `;
      }

      if (type === "tracks") {
        return `
    <article
     class="veproj-content-card"
     data-content-id="${this._esc(item.id)}"
     data-content-type="tracks">
     <span class="veproj-content-icon">
      ${this._svg(item.type === "audio" ? "audio" : "track")}
     </span>

     <div class="veproj-content-copy">
      <strong>${this._esc(item.name || item.id || "Track")}</strong>
      <em>${String(item.type || "track").toUpperCase()} · ${item.locked ? "LOCKED" : "UNLOCKED"}</em>
     </div>

     <span class="veproj-content-meta">
      ${item.muted ? "MUTE " : ""}${item.solo ? "SOLO" : ""}
     </span>
    </article>
   `;
      }

      const time = Number(item.time ?? item.start ?? 0);

      return `
   <article
    class="veproj-content-card"
    data-content-id="${this._esc(item.id || String(time))}"
    data-content-type="markers">
    <span class="veproj-content-icon">
     ${this._svg("marker")}
    </span>

    <div class="veproj-content-copy">
     <strong>${this._esc(item.name || item.label || "Marker")}</strong>
     <em>${this._esc(item.comment || "Timeline Marker")}</em>
    </div>

    <span class="veproj-content-meta">
     ${this.manager.formatTime(time)}
    </span>
   </article>
  `;
    }

    _bind() {
      const search = this.host.querySelector(".veproj-content-search input");

      search?.addEventListener("input", () => {
        this.search = search.value;

        this.manager.search = this.search;

        this.render();
      });

      this.host
        .querySelectorAll("[data-project-content-tab]")
        .forEach((button) => {
          button.addEventListener("click", () => {
            this.active = button.dataset.projectContentTab;

            this.manager.activeContentType = this.active;

            this.render();
          });
        });

      this.host.querySelectorAll("[data-content-id]").forEach((card) => {
        card.addEventListener("click", () => {
          this.manager.selectContent(
            card.dataset.contentType,
            card.dataset.contentId,
          );

          this.host.querySelectorAll(".veproj-content-card").forEach((item) => {
            item.classList.toggle("selected", item === card);
          });
        });
      });

      this.host
        .querySelector("[data-project-refresh]")
        ?.addEventListener("click", () => {
          this.render();
        });
    }

    _svg(name) {
      const icons = {
        refresh:
          '<svg viewBox="0 0 24 24"><path d="M5 8a8 8 0 1 1-1 7"/><path d="M5 4v4h4"/></svg>',
        search:
          '<svg viewBox="0 0 24 24"><circle cx="10" cy="10" r="6"/><path d="M15 15l5 5"/></svg>',
        folder: '<svg viewBox="0 0 24 24"><path d="M3 6h7l2 2h9v10H3z"/></svg>',
        media:
          '<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="14"/><path d="M9 9l6 3-6 3z"/></svg>',
        video:
          '<svg viewBox="0 0 24 24"><rect x="4" y="6" width="12" height="12"/><path d="M16 10l4-3v10l-4-3z"/></svg>',
        audio:
          '<svg viewBox="0 0 24 24"><path d="M5 10v4M9 7v10M13 4v16M17 8v8M21 10v4"/></svg>',
        image:
          '<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="14"/><circle cx="9" cy="10" r="2"/><path d="M5 18l5-5 3 3 3-3 3 3"/></svg>',
        clip: '<svg viewBox="0 0 24 24"><rect x="4" y="7" width="16" height="10"/><path d="M8 7v10M16 7v10"/></svg>',
        track:
          '<svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"/><circle cx="9" cy="7" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="7" cy="17" r="2"/></svg>',
        marker:
          '<svg viewBox="0 0 24 24"><path d="M12 3l5 5-5 5-5-5z"/><path d="M12 13v8"/></svg>',
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
      if (document.getElementById("veproj-contents-style")) {
        return;
      }

      const style = document.createElement("style");

      style.id = "veproj-contents-style";

      style.textContent = `
   .veproj-contents-panel{
    height:100%;
    display:grid;
    grid-template-rows:36px 34px 29px minmax(0,1fr) 22px;
    overflow:hidden;
    background:var(--primary-dark,#333);
    color:var(--text-primary,#fff);
   }

   .veproj-contents-head{
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:6px;
    padding:0 6px;
    border-bottom:1px solid var(--border-color,#4d4d4d81);
    background:var(--header-bg,var(--secondary-dark,#3c3c3c));
   }

   .veproj-contents-head strong,
   .veproj-contents-head span{
    display:block;
   }

   .veproj-contents-head strong{
    font-size:8px;
   }

   .veproj-contents-head span{
    margin-top:2px;
    color:var(--text-secondary,#b0b0b0);
    font-size:7px;
   }

   .veproj-contents-head button{
    width:22px;
    height:21px;
    padding:4px;
    border:1px solid var(--border-color,#4d4d4d81);
    border-radius:0;
    background:var(--bg-button,#363636);
    color:var(--text-secondary,#b0b0b0);
   }

   .veproj-contents-panel svg{
    width:100%;
    height:100%;
    fill:none;
    stroke:currentColor;
    stroke-width:1.6;
    stroke-linecap:round;
    stroke-linejoin:round;
   }

   .veproj-content-search{
    display:grid;
    grid-template-columns:17px minmax(0,1fr);
    align-items:center;
    gap:5px;
    padding:0 6px;
    border-bottom:1px solid var(--border-color,#4d4d4d81);
   }

   .veproj-content-search>span{
    width:14px;
    height:14px;
    color:var(--text-secondary,#b0b0b0);
   }

   .veproj-content-search input{
    height:21px;
    padding:0 6px;
    border:1px solid var(--border-color,#4d4d4d81);
    border-radius:0;
    background:var(--secondary-dark,#3c3c3c);
    color:#fff;
    font-size:8px;
   }

   .veproj-content-tabs{
    display:flex;
    align-items:center;
    gap:2px;
    padding:0 4px;
    border-bottom:1px solid var(--border-color,#4d4d4d81);
    background:var(--secondary-dark,#3c3c3c);
   }

   .veproj-content-tabs button{
    height:21px;
    display:flex;
    align-items:center;
    gap:4px;
    padding:0 6px;
    border:1px solid transparent;
    border-radius:0;
    background:transparent;
    color:var(--text-secondary,#b0b0b0);
    font-size:7px;
   }

   .veproj-content-tabs button em{
    min-width:14px;
    padding:1px 3px;
    background:rgba(255,255,255,.08);
    font-style:normal;
    text-align:center;
    font-size:6px;
   }

   .veproj-content-tabs button:hover,
   .veproj-content-tabs button.active{
    border-color:var(--border-color,#4d4d4d81);
    background:var(--accent-blue-dark,#474747);
    color:#fff;
   }

   .veproj-content-list{
    overflow:auto;
    padding:5px;
   }

   .veproj-content-card{
    min-height:42px;
    display:grid;
    grid-template-columns:22px minmax(0,1fr) auto;
    align-items:center;
    gap:6px;
    margin-bottom:3px;
    padding:4px 6px;
    border:1px solid var(--border-color,#4d4d4d81);
    background:var(--panel-bg,#333);
    cursor:pointer;
   }

   .veproj-content-card:hover{
    background:var(--secondary-dark,#3c3c3c);
   }

   .veproj-content-card.selected{
    outline:1px solid var(--text-primary,#fff);
    outline-offset:1px;
   }

   .veproj-content-icon{
    width:18px;
    height:18px;
    color:var(--text-secondary,#b0b0b0);
   }

   .veproj-content-copy{
    min-width:0;
   }

   .veproj-content-copy strong,
   .veproj-content-copy em{
    display:block;
    overflow:hidden;
    text-overflow:ellipsis;
    white-space:nowrap;
   }

   .veproj-content-copy strong{
    font-size:8px;
   }

   .veproj-content-copy em{
    margin-top:2px;
    color:var(--text-secondary,#b0b0b0);
    font-style:normal;
    font-size:6px;
   }

   .veproj-content-meta{
    max-width:95px;
    overflow:hidden;
    text-overflow:ellipsis;
    white-space:nowrap;
    color:var(--text-secondary,#b0b0b0);
    font-size:6px;
   }

   .veproj-content-empty{
    min-height:150px;
    display:flex;
    flex-direction:column;
    align-items:center;
    justify-content:center;
    gap:5px;
    color:var(--text-secondary,#b0b0b0);
    text-align:center;
   }

   .veproj-content-empty>span{
    width:24px;
    height:24px;
   }

   .veproj-content-empty strong{
    color:#fff;
    font-size:9px;
   }

   .veproj-content-empty em{
    font-style:normal;
    font-size:7px;
   }

   .veproj-content-status{
    display:flex;
    align-items:center;
    justify-content:space-between;
    padding:0 6px;
    border-top:1px solid var(--border-color,#4d4d4d81);
    background:var(--header-bg,var(--secondary-dark,#3c3c3c));
    color:var(--text-secondary,#b0b0b0);
    font-size:6px;
   }
  `;

      document.head.appendChild(style);
    }
  }

  global.VideoProjectContentsPanel = VideoProjectContentsPanel;
})(window);
