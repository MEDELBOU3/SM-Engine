/**
 * VideoDeliverPresetsPanel.js
 * SM Engine — Quick Export / custom delivery preset browser.
 */
(function (global) {
  "use strict";

  class VideoDeliverPresetsPanel {
    constructor(dock) {
      this.dock = dock;
      this.host = null;
      this._styles();
    }

    mount(host) {
      this.host = host;
      this.render();
    }

    render() {
      if (!this.host) return;

      const library = this.dock.exporter.presets;

      const groups = library.groups();

      const items = library.list();

      this.host.innerHTML = `
   <div class="vedel-presets-panel">
    <header>
     <div>
      <strong>DELIVERY PRESETS</strong>
      <span>Fast presets + capability-aware fallback</span>
     </div>

     <span>${items.length} presets</span>
    </header>

    <div class="vedel-preset-scroll">
     ${groups
       .map(
         (group) => `
      <section class="vedel-preset-group">
       <header>
        <span>${this._esc(group)}</span>
       </header>

       <div class="vedel-preset-grid">
        ${items
          .filter((item) => (item.group || "General") === group)
          .map((item) => this._card(item))
          .join("")}
       </div>
      </section>
     `,
       )
       .join("")}
    </div>
   </div>
  `;

      this.host.querySelectorAll("[data-deliver-preset]").forEach((card) => {
        card.addEventListener("click", () => {
          this.dock.applyPreset(card.dataset.deliverPreset);

          this.render();
        });

        card
          .querySelector("[data-preset-queue]")
          ?.addEventListener("click", (event) => {
            event.stopPropagation();

            this.dock.applyPreset(card.dataset.deliverPreset);

            this.dock.addCurrentToQueue();
          });

        card
          .querySelector("[data-preset-quick]")
          ?.addEventListener("click", (event) => {
            event.stopPropagation();

            this.dock.applyPreset(card.dataset.deliverPreset);

            this.dock.quickExport();
          });
      });
    }

    _card(item) {
      const active = this.dock.settings.presetId === item.id;

      const resolved = this.dock.exporter.presets.resolve(
        item.id,
        global.videoProject,
      );

      const format = this.dock.exporter.capabilities.get(resolved.formatId);

      return `
   <article
    class="vedel-preset-card ${active ? "active" : ""}"
    data-deliver-preset="${item.id}">
    <span class="vedel-preset-icon">
     ${this._svg(item.icon)}
    </span>

    <div class="vedel-preset-copy">
     <strong>${this._esc(item.name)}</strong>
     <em>${resolved.width}×${resolved.height} · ${resolved.videoBitrateMbps} Mbps</em>
     <small>${format?.supported ? "READY" : `Fallback → ${this._esc(format?.label || resolved.formatId)}`}</small>
    </div>

    <div class="vedel-preset-actions">
     <button
      type="button"
      data-preset-queue
      title="Add to Render Queue">
      ${this._svg("queue")}
     </button>

     <button
      type="button"
      data-preset-quick
      title="Quick Export">
      ${this._svg("rocket")}
     </button>
    </div>
   </article>
  `;
    }

    _svg(name) {
      const icons = {
        sliders:
          '<svg viewBox="0 0 24 24"><path d="M4 7h10M18 7h2M4 12h3M11 12h9M4 17h8M16 17h4"/><circle cx="16" cy="7" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="14" cy="17" r="2"/></svg>',
        master:
          '<svg viewBox="0 0 24 24"><path d="M4 5h16v14H4z"/><path d="M8 9h8M8 13h8M8 17h5"/></svg>',
        online:
          '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M4 12h16M12 4a12 12 0 0 1 0 16M12 4a12 12 0 0 0 0 16"/></svg>',
        web: '<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="14"/><path d="M4 9h16M8 7h.01M11 7h.01"/></svg>',
        phone:
          '<svg viewBox="0 0 24 24"><rect x="7" y="3" width="10" height="18"/><path d="M10 6h4M11 18h2"/></svg>',
        draft:
          '<svg viewBox="0 0 24 24"><path d="M5 4h14v16H5z"/><path d="M8 8h8M8 12h5"/></svg>',
        queue:
          '<svg viewBox="0 0 24 24"><path d="M5 6h14M5 12h10M5 18h7"/><path d="M18 14v6M15 17h6"/></svg>',
        rocket:
          '<svg viewBox="0 0 24 24"><path d="M9 15l-4 4 1-5-3-3 5-1M15 9l4-4-5 1-3-3-1 5"/><path d="M8 16c5-1 8-4 9-9-5 1-8 4-9 9z"/></svg>',
      };

      return icons[name] || icons.sliders;
    }

    _esc(value) {
      return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
    }

    _styles() {
      if (document.getElementById("vedel-presets-style")) {
        return;
      }

      const style = document.createElement("style");

      style.id = "vedel-presets-style";

      style.textContent = `
   .vedel-presets-panel{
    height:100%;
    display:grid;
    grid-template-rows:36px minmax(0,1fr);
    overflow:hidden;
    background:var(--primary-dark,#333);
    color:#fff;
   }

   .vedel-presets-panel>header{
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:7px;
    padding:0 6px;
    border-bottom:1px solid var(--border-color,#4d4d4d81);
    background:var(--header-bg,var(--secondary-dark,#3c3c3c));
   }

   .vedel-presets-panel>header strong,
   .vedel-presets-panel>header span{
    display:block;
   }

   .vedel-presets-panel>header strong{
    font-size:8px;
   }

   .vedel-presets-panel>header div span,
   .vedel-presets-panel>header>span{
    color:var(--text-secondary,#b0b0b0);
    font-size:7px;
   }

   .vedel-presets-panel>header div span{
    margin-top:2px;
   }

   .vedel-preset-scroll{
    overflow:auto;
    padding:6px;
   }

   .vedel-preset-group{
    margin-bottom:8px;
   }

   .vedel-preset-group>header{
    height:22px;
    display:flex;
    align-items:center;
    padding:0 2px;
    color:var(--text-secondary,#b0b0b0);
    font-size:7px;
    font-weight:700;
   }

   .vedel-preset-grid{
    display:grid;
    grid-template-columns:repeat(2,minmax(0,1fr));
    gap:4px;
   }

   .vedel-preset-card{
    min-height:70px;
    display:grid;
    grid-template-columns:24px minmax(0,1fr) auto;
    align-items:center;
    gap:6px;
    padding:6px;
    border:1px solid var(--border-color,#4d4d4d81);
    background:var(--panel-bg,#333);
    cursor:pointer;
   }

   .vedel-preset-card:hover,
   .vedel-preset-card.active{
    background:var(--secondary-dark,#3c3c3c);
   }

   .vedel-preset-card.active{
    outline:1px solid var(--text-primary,#fff);
    outline-offset:1px;
   }

   .vedel-preset-icon{
    width:20px;
    height:20px;
    color:var(--text-secondary,#b0b0b0);
   }

   .vedel-preset-card svg{
    width:100%;
    height:100%;
    fill:none;
    stroke:currentColor;
    stroke-width:1.6;
    stroke-linecap:round;
    stroke-linejoin:round;
   }

   .vedel-preset-copy{
    min-width:0;
   }

   .vedel-preset-copy strong,
   .vedel-preset-copy em,
   .vedel-preset-copy small{
    display:block;
    overflow:hidden;
    text-overflow:ellipsis;
    white-space:nowrap;
   }

   .vedel-preset-copy strong{
    font-size:8px;
   }

   .vedel-preset-copy em{
    margin-top:3px;
    color:var(--text-secondary,#b0b0b0);
    font-style:normal;
    font-size:6px;
   }

   .vedel-preset-copy small{
    margin-top:2px;
    color:var(--text-secondary,#b0b0b0);
    font-size:6px;
   }

   .vedel-preset-actions{
    display:flex;
    flex-direction:column;
    gap:2px;
   }

   .vedel-preset-actions button{
    width:22px;
    height:21px;
    padding:4px;
    border:1px solid var(--border-color,#4d4d4d81);
    border-radius:0;
    background:var(--bg-button,#363636);
    color:var(--text-secondary,#b0b0b0);
   }

   .vedel-preset-actions button:hover{
    background:var(--accent-blue-dark,#474747);
    color:#fff;
   }
  `;

      document.head.appendChild(style);
    }
  }

  global.VideoDeliverPresetsPanel = VideoDeliverPresetsPanel;
})(window);
