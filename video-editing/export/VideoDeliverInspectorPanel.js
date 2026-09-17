/**
 * VideoDeliverInspectorPanel.js
 * SM Engine — quick Deliver controls in the right Inspector.
 */
(function (global) {
  "use strict";

  class VideoDeliverInspectorPanel {
    constructor(dock = null) {
      this.dock = dock || global.videoDeliverDockManager || null;

      this.host = null;

      this._queueUnsub = global.renderQueueManager?.subscribe?.(() => {
        if (this.host) {
          this.render();
        }
      });

      this._styles();
    }

    render(host = null) {
      this.host = host || this.host;

      if (!this.host) {
        return false;
      }

      this.dock = global.ensureVideoDeliverDockManager?.() || this.dock;

      const settings = this.dock.settings;

      const exporter = this.dock.exporter;

      const validation = exporter.validate(settings);

      const estimate = exporter.estimate(settings);

      const queueCounts = this.dock.queue.counts();

      const format = exporter.capabilities.get(settings.formatId);

      this.host.innerHTML = `
   <div class="vedel-inspector">
    <div class="vedel-inspector-top">
     <div class="vedel-inspector-title">
      <span>${this._svg("deliver")}</span>

      <div>
       <strong>Deliver</strong>
       <em>${this._esc(settings.presetId || "Custom Export")}</em>
      </div>
     </div>

     <button
      type="button"
      class="vedel-open-dock compact"
      data-open-deliver>
      ${this._svg("panel")}
     </button>
    </div>

    <section class="vedel-inspector-section">
     <header>
      <span>OUTPUT</span>
      <em>${validation.valid ? "READY" : "CHECK"}</em>
     </header>

     <label class="vedel-inspector-select">
      <span>Preset</span>
      <select data-deliver-inspector-preset>
       ${exporter.presets
         .list()
         .map(
           (preset) => `
        <option
         value="${preset.id}"
         ${settings.presetId === preset.id ? "selected" : ""}>
         ${this._esc(preset.name)}
        </option>
       `,
         )
         .join("")}
      </select>
     </label>

     <label class="vedel-inspector-select">
      <span>Format</span>
      <select data-deliver-inspector-format>
       ${exporter.capabilities.formats
         .map(
           (item) => `
        <option
         value="${item.id}"
         ${settings.formatId === item.id ? "selected" : ""}
         ${item.supported ? "" : "disabled"}>
         ${this._esc(item.codec.toUpperCase())} · ${this._esc(item.container.toUpperCase())}
        </option>
       `,
         )
         .join("")}
      </select>
     </label>

     <div class="vedel-inspector-summary">
      ${this._row("Resolution", `${settings.width} × ${settings.height}`)}

      ${this._row("Frame Rate", `${settings.fps} fps`)}

      ${this._row("Range", this._rangeLabel(settings.range))}

      ${this._row("Estimate", this._size(estimate.bytes))}

      ${this._row(
        "Encoder",
        format?.supported ? format.codec.toUpperCase() : "Unavailable",
      )}
     </div>
    </section>

    <section class="vedel-inspector-section">
     <header>
      <span>RENDER QUEUE</span>
      <em>${queueCounts.queued} QUEUED</em>
     </header>

     <div class="vedel-inspector-actions">
      <button
       type="button"
       data-deliver-add-queue>
       ${this._svg("queue")}
       <span>ADD QUEUE</span>
      </button>

      <button
       type="button"
       class="primary"
       data-deliver-quick
       ${validation.valid ? "" : "disabled"}>
       ${this._svg("rocket")}
       <span>QUICK EXPORT</span>
      </button>
     </div>

     <div class="vedel-inspector-actions three">
      <button
       type="button"
       data-deliver-frame>
       ${this._svg("frame")}
       <span>FRAME</span>
      </button>

      <button
       type="button"
       data-deliver-preflight>
       ${this._svg("check")}
       <span>PREFLIGHT</span>
      </button>

      <button
       type="button"
       data-deliver-queue>
       ${this._svg("list")}
       <span>QUEUE</span>
      </button>
     </div>
    </section>

    <section class="vedel-inspector-section">
     <header>
      <span>STATUS</span>
      <em>${validation.issues.length} ISSUES</em>
     </header>

     <div class="vedel-inspector-status ${validation.valid ? "ready" : "blocked"}">
      <span>
       ${validation.valid ? this._svg("check") : this._svg("warning")}
      </span>

      <div>
       <strong>${validation.valid ? "Ready to render" : "Preflight requires attention"}</strong>
       <em>${validation.issues[0]?.message || "No blocking export issues detected."}</em>
      </div>
     </div>
    </section>

    <button
     type="button"
     class="vedel-open-dock"
     data-open-deliver>
     ${this._svg("panel")}
     <span>SETTINGS / PRESETS / PREFLIGHT / QUEUE</span>
    </button>
   </div>
  `;

      this._bind();

      return true;
    }

    _bind() {
      this.host
        .querySelector("[data-deliver-inspector-preset]")
        ?.addEventListener("change", (event) => {
          this.dock.applyPreset(event.target.value);

          this.render();
        });

      this.host
        .querySelector("[data-deliver-inspector-format]")
        ?.addEventListener("change", (event) => {
          this.dock.updateSettings({
            formatId: event.target.value,
            presetId: "custom",
          });

          this.render();
        });

      this.host
        .querySelector("[data-deliver-add-queue]")
        ?.addEventListener("click", () => {
          this.dock.addCurrentToQueue();
          this.render();
        });

      this.host
        .querySelector("[data-deliver-quick]")
        ?.addEventListener("click", () => {
          this.dock.quickExport();
        });

      this.host
        .querySelector("[data-deliver-frame]")
        ?.addEventListener("click", () => {
          this.dock.exportCurrentFrame();
        });

      this.host
        .querySelector("[data-deliver-preflight]")
        ?.addEventListener("click", () => {
          this.dock.open({
            tab: "preflight",
          });
        });

      this.host
        .querySelector("[data-deliver-queue]")
        ?.addEventListener("click", () => {
          this.dock.open({
            tab: "queue",
          });
        });

      this.host.querySelectorAll("[data-open-deliver]").forEach((button) => {
        button.addEventListener("click", () => {
          this.dock.open({
            tab:
              global.videoProject?.workspace?.perWorkspace?.edit
                ?.deliverDockTab || "settings",
          });
        });
      });
    }

    _row(label, value) {
      return `
   <div class="vedel-inspector-row">
    <span>${this._esc(label)}</span>
    <strong>${this._esc(value)}</strong>
   </div>
  `;
    }

    _rangeLabel(value) {
      const labels = {
        entire: "Entire Timeline",
        work: "In / Out",
        selected: "Selected Clip",
        custom: "Custom",
      };

      return labels[value] || value;
    }

    _size(bytes) {
      const value = Number(bytes) || 0;

      if (value < 1024 * 1024) {
        return `${(value / 1024).toFixed(1)} KB`;
      }

      if (value < 1024 * 1024 * 1024) {
        return `${(value / 1024 / 1024).toFixed(1)} MB`;
      }

      return `${(value / 1024 / 1024 / 1024).toFixed(2)} GB`;
    }

    _svg(name) {
      const icons = {
        deliver:
          '<svg viewBox="0 0 24 24"><path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 18h14v3H5z"/></svg>',
        panel:
          '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16"/><path d="M14 4v16M17 8h2M17 12h2M17 16h2"/></svg>',
        queue:
          '<svg viewBox="0 0 24 24"><path d="M5 6h14M5 12h10M5 18h7"/><path d="M18 14v6M15 17h6"/></svg>',
        rocket:
          '<svg viewBox="0 0 24 24"><path d="M8 16c5-1 8-4 9-9-5 1-8 4-9 9z"/><path d="M9 15l-4 4 1-5-3-3 5-1M15 9l4-4-5 1-3-3-1 5"/></svg>',
        frame:
          '<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="14"/><path d="M8 9h8v6H8z"/></svg>',
        check: '<svg viewBox="0 0 24 24"><path d="M5 12l4 4 10-10"/></svg>',
        list: '<svg viewBox="0 0 24 24"><path d="M8 6h11M8 12h11M8 18h11"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/></svg>',
        warning:
          '<svg viewBox="0 0 24 24"><path d="M12 4l9 16H3z"/><path d="M12 9v5M12 17h.01"/></svg>',
      };

      return icons[name] || icons.deliver;
    }

    _esc(value) {
      return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
    }

    _styles() {
      if (document.getElementById("vedel-inspector-style")) {
        return;
      }

      const style = document.createElement("style");

      style.id = "vedel-inspector-style";

      style.textContent = `
   .vedel-inspector{
    display:flex;
    flex-direction:column;
    gap:6px;
    padding:6px;
    color:#fff;
   }

   .vedel-inspector-top{
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:6px;
   }

   .vedel-inspector-title{
    display:flex;
    align-items:center;
    gap:7px;
    min-width:0;
   }

   .vedel-inspector-title>span{
    width:18px;
    height:18px;
    flex:0 0 18px;
    color:var(--text-secondary,#b0b0b0);
   }

   .vedel-inspector svg{
    width:100%;
    height:100%;
    fill:none;
    stroke:currentColor;
    stroke-width:1.65;
    stroke-linecap:round;
    stroke-linejoin:round;
   }

   .vedel-inspector-title>div{
    min-width:0;
   }

   .vedel-inspector-title strong,
   .vedel-inspector-title em{
    display:block;
   }

   .vedel-inspector-title strong{
    font-size:9px;
   }

   .vedel-inspector-title em{
    margin-top:2px;
    max-width:220px;
    overflow:hidden;
    text-overflow:ellipsis;
    white-space:nowrap;
    color:var(--text-secondary,#b0b0b0);
    font-style:normal;
    font-size:7px;
   }

   .vedel-inspector-section{
    border:1px solid var(--border-color,#4d4d4d81);
    background:var(--panel-bg,#333);
   }

   .vedel-inspector-section>header{
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

   .vedel-inspector-section>header em{
    font-style:normal;
    font-weight:500;
   }

   .vedel-inspector-select{
    min-height:30px;
    display:grid;
    grid-template-columns:58px minmax(0,1fr);
    align-items:center;
    gap:5px;
    padding:0 6px;
    color:var(--text-secondary,#b0b0b0);
    font-size:7px;
   }

   .vedel-inspector-select select{
    height:20px;
    border:1px solid var(--border-color,#4d4d4d81);
    border-radius:0;
    background:var(--secondary-dark,#3c3c3c);
    color:#fff;
    font-size:7px;
   }

   .vedel-inspector-summary{
    padding:3px 0;
   }

   .vedel-inspector-row{
    min-height:24px;
    display:grid;
    grid-template-columns:72px minmax(0,1fr);
    align-items:center;
    gap:6px;
    padding:0 6px;
    color:var(--text-secondary,#b0b0b0);
    font-size:7px;
   }

   .vedel-inspector-row strong{
    overflow:hidden;
    text-overflow:ellipsis;
    white-space:nowrap;
    color:#fff;
    text-align:right;
    font-weight:500;
   }

   .vedel-inspector-actions{
    display:grid;
    grid-template-columns:1fr 1fr;
    gap:4px;
    padding:6px;
   }

   .vedel-inspector-actions.three{
    grid-template-columns:repeat(3,1fr);
    padding-top:0;
   }

   .vedel-inspector-actions button,
   .vedel-open-dock{
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

   .vedel-inspector-actions button.primary{
    background:var(--accent-blue-dark,#474747);
    color:#fff;
   }

   .vedel-inspector-actions button:hover,
   .vedel-open-dock:hover{
    background:var(--accent-blue-dark,#474747);
    color:#fff;
   }

   .vedel-inspector-actions button:disabled{
    opacity:.4;
   }

   .vedel-inspector-actions svg,
   .vedel-open-dock svg{
    width:12px;
    height:12px;
   }

   .vedel-inspector-status{
    min-height:48px;
    display:grid;
    grid-template-columns:20px minmax(0,1fr);
    align-items:center;
    gap:6px;
    padding:5px 6px;
   }

   .vedel-inspector-status>span{
    width:16px;
    height:16px;
    color:var(--text-secondary,#b0b0b0);
   }

   .vedel-inspector-status strong,
   .vedel-inspector-status em{
    display:block;
   }

   .vedel-inspector-status strong{
    font-size:7px;
   }

   .vedel-inspector-status em{
    margin-top:2px;
    color:var(--text-secondary,#b0b0b0);
    font-style:normal;
    font-size:6px;
    line-height:1.4;
   }

   .vedel-open-dock{
    width:100%;
    min-height:25px;
   }

   .vedel-open-dock.compact{
    width:25px;
    min-height:23px;
    flex:0 0 25px;
    padding:5px;
   }
  `;

      document.head.appendChild(style);
    }

    destroy() {
      this._queueUnsub?.();
    }
  }

  global.VideoDeliverInspectorPanel = VideoDeliverInspectorPanel;

  global.ensureVideoDeliverInspectorPanel =
    function ensureVideoDeliverInspectorPanel() {
      if (!global.videoDeliverInspectorPanel) {
        global.videoDeliverInspectorPanel = new VideoDeliverInspectorPanel(
          global.videoDeliverDockManager,
        );
      }

      return global.videoDeliverInspectorPanel;
    };
})(window);
