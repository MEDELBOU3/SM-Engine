/**
 * VideoDeliverQueuePanel.js
 * SM Engine — Render Queue UI.
 */
(function (global) {
  "use strict";

  class VideoDeliverQueuePanel {
    constructor(dock) {
      this.dock = dock;
      this.queue = dock.queue;

      this.host = null;

      this._unsub = this.queue?.subscribe?.(() => {
        if (this.host) {
          this.render();
        }
      });

      this._styles();
    }

    mount(host) {
      this.host = host;
      this.render();
    }

    render() {
      if (!this.host) return;

      const counts = this.queue.counts();

      const jobs = this.queue.jobs;

      this.host.innerHTML = `
   <div class="vedel-queue-panel">
    <header>
     <div>
      <strong>RENDER QUEUE</strong>
      <span>${jobs.length} jobs · ${counts.queued} queued · ${counts.completed} done</span>
     </div>

     <div>
      <button
       type="button"
       data-queue-clear
       title="Clear Completed">
       ${this._svg("clear")}
      </button>

      <button
       type="button"
       data-queue-start
       class="primary"
       ${this.queue.running ? "disabled" : ""}>
       ${this._svg("play")}
       START RENDER
      </button>
     </div>
    </header>

    <div class="vedel-queue-toolbar">
     <button
      type="button"
      data-add-current>
      ${this._svg("plus")}
      ADD CURRENT
     </button>

     <button
      type="button"
      data-add-clips>
      ${this._svg("clips")}
      ADD INDIVIDUAL CLIPS
     </button>

     ${
       this.queue.running
         ? `
       <button
        type="button"
        data-cancel-current>
        ${this._svg("stop")}
        CANCEL CURRENT
       </button>
      `
         : ""
     }
    </div>

    <div class="vedel-queue-list">
     ${
       jobs.length
         ? jobs.map((job, index) => this._job(job, index)).join("")
         : `
       <div class="vedel-queue-empty">
        <span>${this._svg("queue")}</span>
        <strong>Render Queue is empty</strong>
        <em>Add current settings or create multiple versions.</em>
       </div>
      `
     }
    </div>

    <footer>
     <span>${this.queue.running ? "Rendering…" : "Queue Ready"}</span>
     <span>${counts.failed ? `${counts.failed} failed` : this.queue.stopAfterCurrent ? "Stop after current" : "Batch Mode"}</span>
    </footer>
   </div>
  `;

      this._bind();
    }

    _job(job, index) {
      const settings = job.settings || {};

      const format = this.dock.exporter.capabilities.get(settings.formatId);

      return `
   <article
    class="vedel-queue-job ${job.status}"
    draggable="${job.status !== "rendering"}"
    data-job="${job.id}"
    data-job-index="${index}">
    <header>
     <span class="vedel-queue-drag">
      ${this._svg("drag")}
     </span>

     <span class="vedel-queue-status">
      ${this._statusIcon(job.status)}
     </span>

     <div>
      <strong>${this._esc(job.name || "Render Job")}</strong>
      <em>${settings.width}×${settings.height} · ${settings.fps} fps · ${this._esc(format?.codec?.toUpperCase() || settings.formatId || "")}</em>
     </div>

     <b>${String(job.status).toUpperCase()}</b>

     <button
      type="button"
      data-job-menu="duplicate"
      title="Duplicate">
      ${this._svg("copy")}
     </button>

     <button
      type="button"
      data-job-menu="remove"
      title="Remove"
      ${job.status === "rendering" ? "disabled" : ""}>
      ${this._svg("trash")}
     </button>
    </header>

    <div class="vedel-job-progress">
     <span style="width:${Math.round(Number(job.progress || 0) * 100)}%"></span>
    </div>

    <footer>
     <span>
      ${this._esc(job.outputName || job.error || settings.filename || "Pending")}
     </span>

     <div>
      ${
        job.status === "failed"
          ? `
        <button
         type="button"
         data-job-menu="retry">
         RETRY
        </button>
       `
          : ""
      }

      ${
        ["queued", "failed", "cancelled"].includes(job.status)
          ? `
         <button
          type="button"
          data-job-menu="start">
          RENDER
         </button>
        `
          : ""
      }
     </div>
    </footer>
   </article>
  `;
    }

    _bind() {
      this.host
        .querySelector("[data-queue-start]")
        ?.addEventListener("click", () => {
          this.queue.start();
        });

      this.host
        .querySelector("[data-queue-clear]")
        ?.addEventListener("click", () => {
          this.queue.clearCompleted();
        });

      this.host
        .querySelector("[data-add-current]")
        ?.addEventListener("click", () => {
          this.dock.addCurrentToQueue();
        });

      this.host
        .querySelector("[data-add-clips]")
        ?.addEventListener("click", () => {
          this.queue.addIndividualClips(this.dock.settings);
        });

      this.host
        .querySelector("[data-cancel-current]")
        ?.addEventListener("click", () => {
          this.queue.cancelCurrent();
        });

      this.host.querySelectorAll("[data-job]").forEach((card) => {
        const id = card.dataset.job;

        card.querySelectorAll("[data-job-menu]").forEach((button) => {
          button.addEventListener("click", (event) => {
            event.stopPropagation();

            const action = button.dataset.jobMenu;

            if (action === "duplicate") {
              this.queue.duplicate(id);
            } else if (action === "remove") {
              this.queue.remove(id);
            } else if (action === "retry") {
              this.queue.retry(id);
            } else if (action === "start") {
              this.queue.startJob(id);
            }
          });
        });

        card.addEventListener("dragstart", (event) => {
          if (card.getAttribute("draggable") !== "true") {
            event.preventDefault();
            return;
          }

          event.dataTransfer.setData("text/plain", id);

          card.classList.add("dragging");
        });

        card.addEventListener("dragend", () => {
          card.classList.remove("dragging");
        });

        card.addEventListener("dragover", (event) => {
          event.preventDefault();

          card.classList.add("drag-over");
        });

        card.addEventListener("dragleave", () => {
          card.classList.remove("drag-over");
        });

        card.addEventListener("drop", (event) => {
          event.preventDefault();

          card.classList.remove("drag-over");

          const moving = event.dataTransfer.getData("text/plain");

          if (moving) {
            this.queue.move(moving, Number(card.dataset.jobIndex));
          }
        });
      });
    }

    _statusIcon(status) {
      if (status === "completed") {
        return this._svg("check");
      }

      if (status === "failed") {
        return this._svg("warning");
      }

      if (status === "rendering") {
        return this._svg("render");
      }

      if (status === "cancelled") {
        return this._svg("stop");
      }

      return this._svg("queue");
    }

    _svg(name) {
      const icons = {
        clear:
          '<svg viewBox="0 0 24 24"><path d="M5 7h14M9 7V4h6v3M8 10v8M12 10v8M16 10v8M7 7l1 14h8l1-14"/></svg>',
        play: '<svg viewBox="0 0 24 24"><path d="M8 5l11 7-11 7z"/></svg>',
        plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
        clips:
          '<svg viewBox="0 0 24 24"><rect x="3" y="7" width="8" height="10"/><rect x="13" y="7" width="8" height="10"/></svg>',
        stop: '<svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12"/></svg>',
        queue:
          '<svg viewBox="0 0 24 24"><path d="M5 6h14M5 12h10M5 18h7"/><path d="M18 14v6M15 17h6"/></svg>',
        drag: '<svg viewBox="0 0 24 24"><circle cx="8" cy="7" r="1"/><circle cx="8" cy="12" r="1"/><circle cx="8" cy="17" r="1"/><circle cx="16" cy="7" r="1"/><circle cx="16" cy="12" r="1"/><circle cx="16" cy="17" r="1"/></svg>',
        copy: '<svg viewBox="0 0 24 24"><rect x="8" y="8" width="11" height="11"/><path d="M16 8V5H5v11h3"/></svg>',
        trash:
          '<svg viewBox="0 0 24 24"><path d="M5 7h14M9 7V4h6v3M8 10v8M12 10v8M16 10v8M7 7l1 14h8l1-14"/></svg>',
        check: '<svg viewBox="0 0 24 24"><path d="M5 12l4 4 10-10"/></svg>',
        warning:
          '<svg viewBox="0 0 24 24"><path d="M12 4l9 16H3z"/><path d="M12 9v5M12 17h.01"/></svg>',
        render:
          '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7"/><path d="M12 5v7l4 2"/></svg>',
      };

      return icons[name] || icons.queue;
    }

    _esc(value) {
      return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
    }

    _styles() {
      if (document.getElementById("vedel-queue-style")) {
        return;
      }

      const style = document.createElement("style");

      style.id = "vedel-queue-style";

      style.textContent = `
   .vedel-queue-panel{
    height:100%;
    display:grid;
    grid-template-rows:36px 30px minmax(0,1fr) 22px;
    overflow:hidden;
    background:var(--primary-dark,#333);
    color:#fff;
   }

   .vedel-queue-panel>header{
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:7px;
    padding:0 6px;
    border-bottom:1px solid var(--border-color,#4d4d4d81);
    background:var(--header-bg,var(--secondary-dark,#3c3c3c));
   }

   .vedel-queue-panel>header strong,
   .vedel-queue-panel>header span{
    display:block;
   }

   .vedel-queue-panel>header strong{
    font-size:8px;
   }

   .vedel-queue-panel>header div:first-child span{
    margin-top:2px;
    color:var(--text-secondary,#b0b0b0);
    font-size:7px;
   }

   .vedel-queue-panel>header>div:last-child{
    display:flex;
    gap:2px;
   }

   .vedel-queue-panel>header button,
   .vedel-queue-toolbar button{
    height:21px;
    display:flex;
    align-items:center;
    justify-content:center;
    gap:4px;
    padding:0 6px;
    border:1px solid var(--border-color,#4d4d4d81);
    border-radius:0;
    background:var(--bg-button,#363636);
    color:var(--text-secondary,#b0b0b0);
    font-size:7px;
   }

   .vedel-queue-panel>header button.primary{
    color:#fff;
    background:var(--accent-blue-dark,#474747);
   }

   .vedel-queue-panel button:disabled{
    opacity:.4;
   }

   .vedel-queue-panel svg{
    width:12px;
    height:12px;
    fill:none;
    stroke:currentColor;
    stroke-width:1.6;
    stroke-linecap:round;
    stroke-linejoin:round;
   }

   .vedel-queue-toolbar{
    display:flex;
    align-items:center;
    gap:3px;
    padding:0 5px;
    border-bottom:1px solid var(--border-color,#4d4d4d81);
   }

   .vedel-queue-list{
    overflow:auto;
    padding:6px;
   }

   .vedel-queue-job{
    margin-bottom:5px;
    border:1px solid var(--border-color,#4d4d4d81);
    background:var(--panel-bg,#333);
   }

   .vedel-queue-job.drag-over{
    border-top-color:#fff;
   }

   .vedel-queue-job.rendering{
    outline:1px solid var(--text-primary,#fff);
    outline-offset:1px;
   }

   .vedel-queue-job>header{
    min-height:39px;
    display:grid;
    grid-template-columns:15px 18px minmax(0,1fr) 58px 22px 22px;
    align-items:center;
    gap:4px;
    padding:0 5px;
   }

   .vedel-queue-drag,
   .vedel-queue-status{
    width:13px;
    height:13px;
    color:var(--text-secondary,#b0b0b0);
   }

   .vedel-queue-job>header div{
    min-width:0;
   }

   .vedel-queue-job>header strong,
   .vedel-queue-job>header em{
    display:block;
    overflow:hidden;
    text-overflow:ellipsis;
    white-space:nowrap;
   }

   .vedel-queue-job>header strong{
    font-size:8px;
   }

   .vedel-queue-job>header em{
    margin-top:2px;
    color:var(--text-secondary,#b0b0b0);
    font-style:normal;
    font-size:6px;
   }

   .vedel-queue-job>header b{
    color:var(--text-secondary,#b0b0b0);
    text-align:right;
    font-size:6px;
   }

   .vedel-queue-job>header button{
    width:20px;
    height:20px;
    padding:4px;
    border:0;
    background:transparent;
    color:var(--text-secondary,#b0b0b0);
   }

   .vedel-job-progress{
    height:3px;
    margin:0 5px;
    overflow:hidden;
    background:rgba(255,255,255,.08);
   }

   .vedel-job-progress>span{
    display:block;
    height:100%;
    background:var(--text-secondary,#b0b0b0);
   }

   .vedel-queue-job>footer{
    min-height:28px;
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:5px;
    padding:0 5px;
    border-top:1px solid var(--border-color,#4d4d4d40);
   }

   .vedel-queue-job>footer>span{
    min-width:0;
    overflow:hidden;
    text-overflow:ellipsis;
    white-space:nowrap;
    color:var(--text-secondary,#b0b0b0);
    font-size:6px;
   }

   .vedel-queue-job>footer>div{
    display:flex;
    gap:2px;
   }

   .vedel-queue-job>footer button{
    height:19px;
    padding:0 5px;
    border:1px solid var(--border-color,#4d4d4d81);
    border-radius:0;
    background:var(--bg-button,#363636);
    color:var(--text-secondary,#b0b0b0);
    font-size:6px;
   }

   .vedel-queue-panel>footer{
    display:flex;
    align-items:center;
    justify-content:space-between;
    padding:0 6px;
    border-top:1px solid var(--border-color,#4d4d4d81);
    background:var(--header-bg,var(--secondary-dark,#3c3c3c));
    color:var(--text-secondary,#b0b0b0);
    font-size:6px;
   }

   .vedel-queue-empty{
    min-height:170px;
    display:flex;
    flex-direction:column;
    align-items:center;
    justify-content:center;
    gap:5px;
    color:var(--text-secondary,#b0b0b0);
    text-align:center;
   }

   .vedel-queue-empty>span{
    width:26px;
    height:26px;
   }

   .vedel-queue-empty strong{
    color:#fff;
    font-size:9px;
   }

   .vedel-queue-empty em{
    font-style:normal;
    font-size:7px;
   }
  `;

      document.head.appendChild(style);
    }

    destroy() {
      this._unsub?.();
    }
  }

  global.VideoDeliverQueuePanel = VideoDeliverQueuePanel;
})(window);
