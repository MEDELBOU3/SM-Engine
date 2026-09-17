/**
 * VideoDeliverPreflightPanel.js
 * SM Engine — render preflight and capability diagnostics.
 */
(function (global) {
  "use strict";

  class VideoDeliverPreflightPanel {
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

      const exporter = this.dock.exporter;

      const validation = exporter.validate(this.dock.settings);

      const estimate = exporter.estimate(this.dock.settings);

      const caps = exporter.capabilities.snapshot();

      const issues = validation.issues;

      const errors = issues.filter((issue) => issue.severity === "error");

      const warnings = issues.filter((issue) => issue.severity === "warning");

      this.host.innerHTML = `
   <div class="vedel-preflight-panel">
    <header>
     <div>
      <strong>EXPORT PREFLIGHT</strong>
      <span>Codec, timeline and render diagnostics</span>
     </div>

     <span class="vedel-preflight-state ${validation.valid ? "ready" : "blocked"}">
      ${validation.valid ? "READY" : "BLOCKED"}
     </span>
    </header>

    <section class="vedel-preflight-summary">
     ${this._metric("Errors", errors.length, "error")}

     ${this._metric("Warnings", warnings.length, "warning")}

     ${this._metric("Duration", this._time(estimate.duration), "time")}

     ${this._metric("Est. Size", this._size(estimate.bytes), "size")}
    </section>

    <section class="vedel-preflight-section">
     <header>
      <span>ISSUES</span>
      <em>${issues.length}</em>
     </header>

     <div class="vedel-preflight-issues">
      ${
        issues.length
          ? issues.map((issue) => this._issue(issue)).join("")
          : `
        <article class="vedel-preflight-ok">
         <span>${this._svg("check")}</span>
         <div>
          <strong>No blocking issues</strong>
          <em>The current settings can be rendered by this runtime.</em>
         </div>
        </article>
       `
      }
     </div>
    </section>

    <section class="vedel-preflight-section">
     <header>
      <span>ENCODER CAPABILITIES</span>
      <em>${caps.webCodecs ? "WebCodecs" : "MediaRecorder"}</em>
     </header>

     <div class="vedel-capability-list">
      ${caps.formats
        .map(
          (format) => `
       <div class="vedel-capability-row">
        <span class="${format.supported ? "supported" : "unsupported"}">
         ${format.supported ? this._svg("check") : this._svg("close")}
        </span>

        <div>
         <strong>${this._esc(format.label)}</strong>
         <em>${this._esc(format.mime)}</em>
        </div>

        <b>${format.supported ? "READY" : "NO"}</b>
       </div>
      `,
        )
        .join("")}
     </div>
    </section>

    <section class="vedel-preflight-section">
     <header>
      <span>RUNTIME</span>
      <em>LOCAL SYSTEM</em>
     </header>

     <div class="vedel-runtime-grid">
      ${this._runtime("MediaRecorder", caps.mediaRecorder)}

      ${this._runtime("Canvas Capture", caps.captureStream)}

      ${this._runtime("WebAudio", caps.audioContext)}

      ${this._runtime("WebCodecs", caps.webCodecs)}
     </div>
    </section>

    <footer class="vedel-preflight-footer">
     <button
      type="button"
      data-preflight-refresh>
      ${this._svg("refresh")}
      RUN PREFLIGHT AGAIN
     </button>
    </footer>
   </div>
  `;

      this.host
        .querySelector("[data-preflight-refresh]")
        ?.addEventListener("click", () => {
          this.render();
        });
    }

    _metric(label, value, type) {
      return `
   <article class="vedel-preflight-metric ${type}">
    <span>${label}</span>
    <strong>${value}</strong>
   </article>
  `;
    }

    _issue(issue) {
      return `
   <article class="vedel-preflight-issue ${issue.severity}">
    <span>
     ${issue.severity === "error" ? this._svg("close") : this._svg("warning")}
    </span>

    <div>
     <strong>${issue.severity.toUpperCase()}</strong>
     <em>${this._esc(issue.message)}</em>
    </div>
   </article>
  `;
    }

    _runtime(label, ready) {
      return `
   <article>
    <span class="${ready ? "ready" : "missing"}">
     ${ready ? this._svg("check") : this._svg("close")}
    </span>

    <div>
     <strong>${label}</strong>
     <em>${ready ? "Available" : "Unavailable"}</em>
    </div>
   </article>
  `;
    }

    _time(seconds) {
      const value = Math.max(0, Number(seconds) || 0);

      const minutes = Math.floor(value / 60);

      const secs = value % 60;

      return `${minutes}:${secs.toFixed(1).padStart(4, "0")}`;
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
        check: '<svg viewBox="0 0 24 24"><path d="M5 12l4 4 10-10"/></svg>',
        close:
          '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
        warning:
          '<svg viewBox="0 0 24 24"><path d="M12 4l9 16H3z"/><path d="M12 9v5M12 17h.01"/></svg>',
        refresh:
          '<svg viewBox="0 0 24 24"><path d="M5 8a8 8 0 1 1-1 7"/><path d="M5 4v4h4"/></svg>',
      };

      return icons[name] || icons.check;
    }

    _esc(value) {
      return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
    }

    _styles() {
      if (document.getElementById("vedel-preflight-style")) {
        return;
      }

      const style = document.createElement("style");

      style.id = "vedel-preflight-style";

      style.textContent = `
   .vedel-preflight-panel{
    height:100%;
    overflow:auto;
    background:var(--primary-dark,#333);
    color:#fff;
   }

   .vedel-preflight-panel>header{
    min-height:36px;
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:7px;
    padding:0 6px;
    border-bottom:1px solid var(--border-color,#4d4d4d81);
    background:var(--header-bg,var(--secondary-dark,#3c3c3c));
   }

   .vedel-preflight-panel>header strong,
   .vedel-preflight-panel>header span{
    display:block;
   }

   .vedel-preflight-panel>header strong{
    font-size:8px;
   }

   .vedel-preflight-panel>header div span{
    margin-top:2px;
    color:var(--text-secondary,#b0b0b0);
    font-size:7px;
   }

   .vedel-preflight-state{
    padding:3px 6px;
    border:1px solid var(--border-color,#4d4d4d81);
    font-size:6px;
   }

   .vedel-preflight-state.blocked{
    background:var(--accent-blue-dark,#474747);
   }

   .vedel-preflight-summary{
    display:grid;
    grid-template-columns:repeat(4,1fr);
    gap:4px;
    padding:6px;
   }

   .vedel-preflight-metric{
    min-height:52px;
    display:flex;
    flex-direction:column;
    justify-content:center;
    align-items:center;
    gap:3px;
    border:1px solid var(--border-color,#4d4d4d81);
    background:var(--panel-bg,#333);
   }

   .vedel-preflight-metric span{
    color:var(--text-secondary,#b0b0b0);
    font-size:6px;
   }

   .vedel-preflight-metric strong{
    font-size:10px;
   }

   .vedel-preflight-section{
    margin:0 6px 6px;
    border:1px solid var(--border-color,#4d4d4d81);
   }

   .vedel-preflight-section>header{
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

   .vedel-preflight-section>header em{
    font-style:normal;
    font-weight:500;
   }

   .vedel-preflight-issues{
    padding:5px;
   }

   .vedel-preflight-issue,
   .vedel-preflight-ok{
    min-height:42px;
    display:grid;
    grid-template-columns:20px minmax(0,1fr);
    align-items:center;
    gap:6px;
    margin-bottom:4px;
    padding:4px 6px;
    border:1px solid var(--border-color,#4d4d4d81);
    background:var(--panel-bg,#333);
   }

   .vedel-preflight-issue>span,
   .vedel-preflight-ok>span{
    width:16px;
    height:16px;
    color:var(--text-secondary,#b0b0b0);
   }

   .vedel-preflight-panel svg{
    width:100%;
    height:100%;
    fill:none;
    stroke:currentColor;
    stroke-width:1.7;
    stroke-linecap:round;
    stroke-linejoin:round;
   }

   .vedel-preflight-issue strong,
   .vedel-preflight-ok strong,
   .vedel-preflight-issue em,
   .vedel-preflight-ok em{
    display:block;
   }

   .vedel-preflight-issue strong,
   .vedel-preflight-ok strong{
    font-size:7px;
   }

   .vedel-preflight-issue em,
   .vedel-preflight-ok em{
    margin-top:2px;
    color:var(--text-secondary,#b0b0b0);
    font-style:normal;
    font-size:6px;
    line-height:1.45;
   }

   .vedel-capability-list{
    padding:4px 0;
   }

   .vedel-capability-row{
    min-height:38px;
    display:grid;
    grid-template-columns:20px minmax(0,1fr) 36px;
    align-items:center;
    gap:5px;
    padding:0 6px;
   }

   .vedel-capability-row>span{
    width:14px;
    height:14px;
    color:var(--text-secondary,#b0b0b0);
   }

   .vedel-capability-row strong,
   .vedel-capability-row em{
    display:block;
   }

   .vedel-capability-row strong{
    font-size:7px;
   }

   .vedel-capability-row em{
    margin-top:2px;
    overflow:hidden;
    text-overflow:ellipsis;
    white-space:nowrap;
    color:var(--text-secondary,#b0b0b0);
    font-style:normal;
    font-size:6px;
   }

   .vedel-capability-row b{
    color:var(--text-secondary,#b0b0b0);
    text-align:right;
    font-size:6px;
   }

   .vedel-runtime-grid{
    display:grid;
    grid-template-columns:1fr 1fr;
    gap:4px;
    padding:6px;
   }

   .vedel-runtime-grid article{
    min-height:45px;
    display:grid;
    grid-template-columns:20px minmax(0,1fr);
    align-items:center;
    gap:5px;
    padding:0 6px;
    border:1px solid var(--border-color,#4d4d4d81);
   }

   .vedel-runtime-grid article>span{
    width:14px;
    height:14px;
    color:var(--text-secondary,#b0b0b0);
   }

   .vedel-runtime-grid strong,
   .vedel-runtime-grid em{
    display:block;
   }

   .vedel-runtime-grid strong{
    font-size:7px;
   }

   .vedel-runtime-grid em{
    margin-top:2px;
    color:var(--text-secondary,#b0b0b0);
    font-style:normal;
    font-size:6px;
   }

   .vedel-preflight-footer{
    padding:0 6px 7px;
   }

   .vedel-preflight-footer button{
    width:100%;
    height:24px;
    display:flex;
    align-items:center;
    justify-content:center;
    gap:5px;
    border:1px solid var(--border-color,#4d4d4d81);
    border-radius:0;
    background:var(--bg-button,#363636);
    color:var(--text-secondary,#b0b0b0);
    font-size:7px;
   }

   .vedel-preflight-footer button:hover{
    background:var(--accent-blue-dark,#474747);
    color:#fff;
   }

   .vedel-preflight-footer svg{
    width:12px;
    height:12px;
   }
  `;

      document.head.appendChild(style);
    }
  }

  global.VideoDeliverPreflightPanel = VideoDeliverPreflightPanel;
})(window);
