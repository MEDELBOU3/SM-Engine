/**
 * VideoDeliverSettingsPanel.js
 * SM Engine — Deliver Studio Render Settings
 *
 * Professional responsive UI using SM Engine roots.css design tokens.
 *
 * Expected dock API:
 *   dock.settings
 *   dock.exporter
 *   dock.updateSettings(patch)
 *   dock.applyPreset(id)
 *   dock.addCurrentToQueue()
 *   dock.quickExport()
 *   dock.exportCurrentFrame()
 *   dock.setTab(tab)
 */
(function (global) {
  "use strict";

  class VideoDeliverSettingsPanel {
    constructor(dock) {
      this.dock = dock;
      this.host = null;
      this._styles();
    }

    mount(host) {
      this.host = host;
      this.render();
    }

    destroy() {
      this.host = null;
    }

    render() {
      if (!this.host || !this.dock?.exporter) return;

      const settings =
        this.dock.settings || this.dock.exporter.defaultSettings?.() || {};

      const exporter = this.dock.exporter;

      const capabilities = exporter.capabilities;

      const range = exporter.getRange(settings);

      const estimate = exporter.estimate(settings);

      const format = capabilities?.get?.(settings.formatId);

      const formats = capabilities?.formats || [];

      const validation = exporter.validate?.(settings) || {
        valid: true,
        issues: [],
      };

      const preset = exporter.presets?.get?.(settings.presetId);

      this.host.innerHTML = `
   <div class="sm-deliver-settings">

    <!-- =====================================================
         TOP SUMMARY
         ===================================================== -->
    <div class="sm-deliver-settings-summary">
     <div class="sm-deliver-settings-summary-main">
      <span class="sm-deliver-settings-summary-icon">
       ${this._svg("deliver")}
      </span>

      <div>
       <strong>Render Settings</strong>
       <em>
        ${this._esc(preset?.name || "Custom Export")}
       </em>
      </div>
     </div>

     <div class="sm-deliver-settings-summary-status ${validation.valid ? "ready" : "warning"}">
      <span>
       ${validation.valid ? this._svg("check") : this._svg("warning")}
      </span>

      <strong>
       ${
         validation.valid
           ? "READY"
           : `${validation.issues.length} ISSUE${validation.issues.length === 1 ? "" : "S"}`
       }
      </strong>
     </div>
    </div>


    <!-- =====================================================
         FILE
         ===================================================== -->
    <section class="sm-deliver-section">
     <header class="sm-deliver-section-header">
      <div class="sm-deliver-section-heading">
       <span class="sm-deliver-section-icon">
        ${this._svg("file")}
       </span>

       <div>
        <strong>FILE</strong>
        <em>Output naming and destination metadata</em>
       </div>
      </div>

      <span class="sm-deliver-section-value">
       ${this._esc(settings.presetId || "custom")}
      </span>
     </header>

     <div class="sm-deliver-section-body">
      <label class="sm-deliver-field sm-deliver-field-full">
       <span class="sm-deliver-label">Filename</span>

       <div class="sm-deliver-input-shell">
        <span class="sm-deliver-input-icon">
         ${this._svg("rename")}
        </span>

        <input
         class="sm-deliver-input"
         type="text"
         spellcheck="false"
         value="${this._esc(settings.filename || "")}"
         data-deliver-text="filename">
       </div>
      </label>

      <div class="sm-deliver-token-row">
       <span class="sm-deliver-label">Tokens</span>

       <div class="sm-deliver-token-list">
        ${[
          "{project}",
          "{date}",
          "{time}",
          "{resolution}",
          "{fps}",
          "{codec}",
          "{clip}",
          "{index}",
        ]
          .map(
            (token) => `
         <button
          type="button"
          class="sm-deliver-token"
          data-insert-token="${this._esc(token)}">
          ${this._esc(token)}
         </button>
        `,
          )
          .join("")}
       </div>
      </div>
     </div>
    </section>


    <!-- =====================================================
         VIDEO
         ===================================================== -->
    <section class="sm-deliver-section">
     <header class="sm-deliver-section-header">
      <div class="sm-deliver-section-heading">
       <span class="sm-deliver-section-icon">
        ${this._svg("video")}
       </span>

       <div>
        <strong>VIDEO</strong>
        <em>Codec, format, resolution and quality</em>
       </div>
      </div>

      <span class="sm-deliver-section-value">
       ${Number(settings.width || 0)}×${Number(settings.height || 0)}
       ·
       ${Number(settings.fps || 0)} fps
      </span>
     </header>

     <div class="sm-deliver-section-body">

      <label class="sm-deliver-feature-toggle">
       <div class="sm-deliver-feature-copy">
        <span class="sm-deliver-feature-icon">
         ${this._svg("video")}
        </span>

        <div>
         <strong>Export Video</strong>
         <em>Encode the composition canvas into the selected output format.</em>
        </div>
       </div>

       <input
        type="checkbox"
        class="sm-deliver-checkbox"
        data-deliver-check="includeVideo"
        ${settings.includeVideo !== false ? "checked" : ""}>
      </label>

      <div class="sm-deliver-grid">

       <label class="sm-deliver-field sm-deliver-field-full">
        <span class="sm-deliver-label">Format / Codec</span>

        <div class="sm-deliver-select-shell">
         <span class="sm-deliver-input-icon">
          ${this._svg("codec")}
         </span>

         <select
          class="sm-deliver-select"
          data-deliver-select="formatId">
          ${formats
            .map(
              (item) => `
           <option
            value="${this._esc(item.id)}"
            ${settings.formatId === item.id ? "selected" : ""}
            ${item.supported ? "" : "disabled"}>
            ${this._esc(item.label)}
            ${item.supported ? "" : " · Unsupported"}
           </option>
          `,
            )
            .join("")}
         </select>
        </div>
       </label>

       ${this._numberField(
         "width",
         "Width",
         1,
         16384,
         1,
         settings.width,
         "px",
         "resolution",
       )}

       ${this._numberField(
         "height",
         "Height",
         1,
         16384,
         1,
         settings.height,
         "px",
         "resolution",
       )}

       ${this._numberField(
         "fps",
         "Frame Rate",
         1,
         240,
         0.001,
         settings.fps,
         "fps",
         "fps",
       )}

       ${this._numberField(
         "videoBitrateMbps",
         "Video Bitrate",
         0.25,
         300,
         0.25,
         settings.videoBitrateMbps,
         "Mbps",
         "bitrate",
       )}

       <label class="sm-deliver-field">
        <span class="sm-deliver-label">Scaling</span>

        <div class="sm-deliver-select-shell">
         <span class="sm-deliver-input-icon">
          ${this._svg("scale")}
         </span>

         <select
          class="sm-deliver-select"
          data-deliver-select="scaleMode">
          ${[
            ["fit", "Fit · Preserve Entire Frame"],
            ["fill", "Fill · Crop to Frame"],
            ["stretch", "Stretch · Ignore Aspect"],
          ]
            .map(
              ([value, label]) => `
           <option
            value="${value}"
            ${settings.scaleMode === value ? "selected" : ""}>
            ${label}
           </option>
          `,
            )
            .join("")}
         </select>
        </div>
       </label>

       <label class="sm-deliver-field">
        <span class="sm-deliver-label">Quality</span>

        <div class="sm-deliver-select-shell">
         <span class="sm-deliver-input-icon">
          ${this._svg("quality")}
         </span>

         <select
          class="sm-deliver-select"
          data-deliver-select="quality">
          ${[
            ["draft", "Draft"],
            ["balanced", "Balanced"],
            ["high", "High"],
            ["master", "Master"],
          ]
            .map(
              ([value, label]) => `
           <option
            value="${value}"
            ${settings.quality === value ? "selected" : ""}>
            ${label}
           </option>
          `,
            )
            .join("")}
         </select>
        </div>
       </label>
      </div>

      <div class="sm-deliver-codec-status">
       <div>
        <span class="sm-deliver-codec-status-icon ${format?.supported ? "ready" : "warning"}">
         ${format?.supported ? this._svg("check") : this._svg("warning")}
        </span>

        <div>
         <strong>
          ${this._esc(
            format?.codec?.toUpperCase() ||
              settings.formatId ||
              "Unknown Codec",
          )}
         </strong>

         <em>
          ${
            format?.supported
              ? `Runtime encoder ready · ${this._esc(format?.mime || "")}`
              : "This codec is unavailable in the current Chromium / Electron runtime."
          }
         </em>
        </div>
       </div>
      </div>
     </div>
    </section>


    <!-- =====================================================
         AUDIO
         ===================================================== -->
    <section class="sm-deliver-section">
     <header class="sm-deliver-section-header">
      <div class="sm-deliver-section-heading">
       <span class="sm-deliver-section-icon">
        ${this._svg("audio")}
       </span>

       <div>
        <strong>AUDIO</strong>
        <em>Post-master Audio Studio output</em>
       </div>
      </div>

      <span class="sm-deliver-section-value">
       ${Number(settings.audioBitrateKbps || 0)} kbps
      </span>
     </header>

     <div class="sm-deliver-section-body">
      <label class="sm-deliver-feature-toggle">
       <div class="sm-deliver-feature-copy">
        <span class="sm-deliver-feature-icon">
         ${this._svg("audio")}
        </span>

        <div>
         <strong>Export Audio</strong>
         <em>Capture the mixed post-master signal from Audio Studio.</em>
        </div>
       </div>

       <input
        type="checkbox"
        class="sm-deliver-checkbox"
        data-deliver-check="includeAudio"
        ${settings.includeAudio !== false ? "checked" : ""}>
      </label>

      <div class="sm-deliver-grid sm-deliver-grid-single">
       ${this._numberField(
         "audioBitrateKbps",
         "Audio Bitrate",
         32,
         512,
         16,
         settings.audioBitrateKbps,
         "kbps",
         "audio",
       )}
      </div>
     </div>
    </section>


    <!-- =====================================================
         RANGE
         ===================================================== -->
    <section class="sm-deliver-section">
     <header class="sm-deliver-section-header">
      <div class="sm-deliver-section-heading">
       <span class="sm-deliver-section-icon">
        ${this._svg("range")}
       </span>

       <div>
        <strong>RENDER RANGE</strong>
        <em>Select what part of the timeline should be exported</em>
       </div>
      </div>

      <span class="sm-deliver-section-value">
       ${this._time(range.start)}
       →
       ${this._time(range.end)}
      </span>
     </header>

     <div class="sm-deliver-section-body">
      <label class="sm-deliver-field sm-deliver-field-full">
       <span class="sm-deliver-label">Range</span>

       <div class="sm-deliver-select-shell">
        <span class="sm-deliver-input-icon">
         ${this._svg("range")}
        </span>

        <select
         class="sm-deliver-select"
         data-deliver-select="range">
         ${[
           ["entire", "Entire Timeline"],
           ["work", "In / Out Work Area"],
           ["selected", "Selected Clip"],
           ["custom", "Custom Range"],
         ]
           .map(
             ([value, label]) => `
          <option
           value="${value}"
           ${settings.range === value ? "selected" : ""}>
           ${label}
          </option>
         `,
           )
           .join("")}
        </select>
       </div>
      </label>

      <div class="sm-deliver-grid ${settings.range === "custom" ? "" : "sm-deliver-disabled-group"}">
       ${this._numberField(
         "rangeStart",
         "Start",
         0,
         999999,
         0.001,
         settings.rangeStart ?? range.start,
         "s",
         "start",
         settings.range !== "custom",
       )}

       ${this._numberField(
         "rangeEnd",
         "End",
         0,
         999999,
         0.001,
         settings.rangeEnd ?? range.end,
         "s",
         "end",
         settings.range !== "custom",
       )}
      </div>

      <div class="sm-deliver-range-info">
       <span>${this._svg("clock")}</span>

       <div>
        <strong>
         ${this._rangeLabel(settings.range)}
        </strong>

        <em>
         ${this._time(Math.max(0, range.end - range.start))}
         render duration
        </em>
       </div>
      </div>
     </div>
    </section>


    <!-- =====================================================
         ESTIMATE
         ===================================================== -->
    <section class="sm-deliver-section sm-deliver-estimate-section">
     <header class="sm-deliver-section-header">
      <div class="sm-deliver-section-heading">
       <span class="sm-deliver-section-icon">
        ${this._svg("estimate")}
       </span>

       <div>
        <strong>ESTIMATE</strong>
        <em>Calculated from current render settings</em>
       </div>
      </div>

      <span class="sm-deliver-section-value">
       REAL-TIME ENCODE
      </span>
     </header>

     <div class="sm-deliver-section-body">
      <div class="sm-deliver-estimate-grid">

       ${this._estimateCard(
         "Duration",
         this._time(estimate.duration),
         "Timeline render length",
         "clock",
       )}

       ${this._estimateCard(
         "Estimated Size",
         this._size(estimate.bytes),
         "Approximate encoded output",
         "storage",
       )}

       ${this._estimateCard(
         "Frames",
         Math.round(
           Number(estimate.duration || 0) * Number(settings.fps || 0),
         ).toLocaleString(),
         `At ${Number(settings.fps || 0)} fps`,
         "frames",
       )}

       ${this._estimateCard(
         "Encoder",
         this._esc(format?.codec?.toUpperCase() || "—"),
         format?.supported
           ? "Runtime encoder available"
           : "Encoder unavailable",
         "codec",
       )}
      </div>

      ${
        validation.issues.length
          ? `
        <div class="sm-deliver-issue-summary ${validation.valid ? "warning" : "error"}">
         <span>
          ${validation.valid ? this._svg("warning") : this._svg("error")}
         </span>

         <div>
          <strong>
           ${validation.valid ? "Preflight warning" : "Export blocked"}
          </strong>

          <em>
           ${this._esc(
             validation.issues[0]?.message || "Review export settings.",
           )}
          </em>
         </div>

         <button
          type="button"
          data-open-preflight>
          PREFLIGHT
         </button>
        </div>
       `
          : ""
      }
     </div>
    </section>


    <!-- =====================================================
         FOOTER ACTIONS
         ===================================================== -->
    <div class="sm-deliver-actions">
     <div class="sm-deliver-actions-left">
      <button
       type="button"
       class="sm-deliver-button"
       data-reset-deliver>
       ${this._svg("reset")}
       <span>Reset</span>
      </button>

      <button
       type="button"
       class="sm-deliver-button"
       data-export-frame>
       ${this._svg("frame")}
       <span>Export Frame</span>
      </button>
     </div>

     <div class="sm-deliver-actions-right">
      <button
       type="button"
       class="sm-deliver-button"
       data-add-queue
       ${validation.valid ? "" : "disabled"}>
       ${this._svg("queue")}
       <span>Add to Queue</span>
      </button>

      <button
       type="button"
       class="sm-deliver-button sm-deliver-button-primary"
       data-quick-export
       ${validation.valid ? "" : "disabled"}>
       ${this._svg("rocket")}
       <span>Quick Export</span>
      </button>
     </div>
    </div>

   </div>
  `;

      this._bind();
    }

    _numberField(
      key,
      label,
      min,
      max,
      step,
      value,
      unit,
      icon = "sliders",
      disabled = false,
    ) {
      return `
   <label class="sm-deliver-field ${disabled ? "sm-deliver-field-disabled" : ""}">
    <span class="sm-deliver-label">${this._esc(label)}</span>

    <div class="sm-deliver-number-shell">
     <span class="sm-deliver-input-icon">
      ${this._svg(icon)}
     </span>

     <input
      class="sm-deliver-number"
      type="number"
      min="${min}"
      max="${max}"
      step="${step}"
      value="${Number(value ?? 0)}"
      data-deliver-number="${this._esc(key)}"
      ${disabled ? "disabled" : ""}>

     <span class="sm-deliver-unit">
      ${this._esc(unit)}
     </span>
    </div>
   </label>
  `;
    }

    _estimateCard(label, value, note, icon) {
      return `
   <article class="sm-deliver-estimate-card">
    <div class="sm-deliver-estimate-card-top">
     <span>
      ${this._svg(icon)}
     </span>

     <em>
      ${this._esc(label)}
     </em>
    </div>

    <strong>
     ${value}
    </strong>

    <small>
     ${this._esc(note)}
    </small>
   </article>
  `;
    }

    _bind() {
      if (!this.host) return;

      /*
       * Text fields
       */
      this.host.querySelectorAll("[data-deliver-text]").forEach((input) => {
        input.addEventListener("change", () => {
          this.dock.updateSettings({
            [input.dataset.deliverText]: input.value,
          });
        });
      });

      /*
       * Select fields
       */
      this.host.querySelectorAll("[data-deliver-select]").forEach((select) => {
        select.addEventListener("change", () => {
          const key = select.dataset.deliverSelect;

          const patch = {
            [key]: select.value,
          };

          if (key === "formatId" || key === "scaleMode" || key === "quality") {
            patch.presetId = "custom";
          }

          this.dock.updateSettings(patch);

          this.render();
        });
      });

      /*
       * Checkboxes
       */
      this.host.querySelectorAll("[data-deliver-check]").forEach((input) => {
        input.addEventListener("change", () => {
          this.dock.updateSettings({
            [input.dataset.deliverCheck]: input.checked,
            presetId: "custom",
          });

          this.render();
        });
      });

      /*
       * Numeric inputs
       */
      this.host.querySelectorAll("[data-deliver-number]").forEach((input) => {
        input.addEventListener("change", () => {
          const key = input.dataset.deliverNumber;

          const value = Number(input.value);

          if (!Number.isFinite(value)) {
            return;
          }

          this.dock.updateSettings({
            [key]: value,
            presetId: "custom",
          });

          this.render();
        });
      });

      /*
       * Filename tokens
       */
      this.host.querySelectorAll("[data-insert-token]").forEach((button) => {
        button.addEventListener("click", () => {
          const input = this.host.querySelector(
            '[data-deliver-text="filename"]',
          );

          if (!input) {
            return;
          }

          const token = button.dataset.insertToken || "";

          const start = input.selectionStart ?? input.value.length;

          const end = input.selectionEnd ?? input.value.length;

          input.value =
            input.value.slice(0, start) + token + input.value.slice(end);

          const next = start + token.length;

          input.focus();

          input.setSelectionRange?.(next, next);

          this.dock.updateSettings({
            filename: input.value,
          });
        });
      });

      /*
       * Reset
       */
      this.host
        .querySelector("[data-reset-deliver]")
        ?.addEventListener("click", () => {
          this.dock.applyPreset("custom");

          this.render();
        });

      /*
       * Export current frame
       */
      this.host
        .querySelector("[data-export-frame]")
        ?.addEventListener("click", () => {
          this.dock.exportCurrentFrame?.();
        });

      /*
       * Add render job
       */
      this.host
        .querySelector("[data-add-queue]")
        ?.addEventListener("click", () => {
          const result = this.dock.addCurrentToQueue?.();

          if (result) {
            this.dock.setTab?.("queue");
          } else {
            this.dock.setTab?.("preflight");
          }
        });

      /*
       * Quick export
       */
      this.host
        .querySelector("[data-quick-export]")
        ?.addEventListener("click", () => {
          this.dock.quickExport?.();
        });

      /*
       * Preflight
       */
      this.host
        .querySelector("[data-open-preflight]")
        ?.addEventListener("click", () => {
          this.dock.setTab?.("preflight");
        });
    }

    _rangeLabel(value) {
      const labels = {
        entire: "Entire Timeline",
        work: "In / Out Work Area",
        selected: "Selected Clip",
        custom: "Custom Range",
      };

      return labels[value] || value || "Entire Timeline";
    }

    _time(seconds) {
      const total = Math.max(0, Number(seconds) || 0);

      const hours = Math.floor(total / 3600);

      const minutes = Math.floor((total % 3600) / 60);

      const secs = total % 60;

      return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${secs.toFixed(2).padStart(5, "0")}`;
    }

    _size(bytes) {
      const value = Math.max(0, Number(bytes) || 0);

      if (value < 1024) {
        return `${Math.round(value)} B`;
      }

      if (value < 1024 * 1024) {
        return `${(value / 1024).toFixed(1)} KB`;
      }

      if (value < 1024 * 1024 * 1024) {
        return `${(value / 1024 / 1024).toFixed(1)} MB`;
      }

      return `${(value / 1024 / 1024 / 1024).toFixed(2)} GB`;
    }

    _esc(value) {
      return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
    }

    _svg(name) {
      const icons = {
        deliver:
          '<svg viewBox="0 0 24 24"><path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 18h14v3H5z"/></svg>',
        check: '<svg viewBox="0 0 24 24"><path d="M5 12l4 4 10-10"/></svg>',
        warning:
          '<svg viewBox="0 0 24 24"><path d="M12 4l9 16H3z"/><path d="M12 9v5M12 17h.01"/></svg>',
        error:
          '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M9 9l6 6M15 9l-6 6"/></svg>',
        file: '<svg viewBox="0 0 24 24"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5"/></svg>',
        rename:
          '<svg viewBox="0 0 24 24"><path d="M5 19l4-1 9-9-3-3-9 9z"/><path d="M13 8l3 3"/></svg>',
        video:
          '<svg viewBox="0 0 24 24"><rect x="4" y="6" width="12" height="12"/><path d="M16 10l4-3v10l-4-3z"/></svg>',
        codec:
          '<svg viewBox="0 0 24 24"><path d="M7 5L3 12l4 7M17 5l4 7-4 7"/><path d="M10 18l4-12"/></svg>',
        resolution:
          '<svg viewBox="0 0 24 24"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/></svg>',
        fps: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 8v5l3 2"/></svg>',
        bitrate:
          '<svg viewBox="0 0 24 24"><path d="M4 17V7M8 17V10M12 17V5M16 17v-8M20 17v-4"/></svg>',
        scale:
          '<svg viewBox="0 0 24 24"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/><path d="M9 9l6 6M15 9l-6 6"/></svg>',
        quality:
          '<svg viewBox="0 0 24 24"><path d="M12 3l2.5 5.2L20 9l-4 4 1 6-5-2.8L7 19l1-6-4-4 5.5-.8z"/></svg>',
        audio:
          '<svg viewBox="0 0 24 24"><path d="M5 10v4M9 7v10M13 4v16M17 8v8M21 10v4"/></svg>',
        range:
          '<svg viewBox="0 0 24 24"><path d="M5 5v14M19 5v14M5 12h14"/><path d="M8 9l-3 3 3 3M16 9l3 3-3 3"/></svg>',
        start:
          '<svg viewBox="0 0 24 24"><path d="M6 5v14M9 12h9M12 9l-3 3 3 3"/></svg>',
        end: '<svg viewBox="0 0 24 24"><path d="M18 5v14M15 12H6M12 9l3 3-3 3"/></svg>',
        clock:
          '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/></svg>',
        estimate:
          '<svg viewBox="0 0 24 24"><path d="M4 19V5h16v14z"/><path d="M7 15l3-4 3 2 4-5"/></svg>',
        storage:
          '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v6c0 2 4 3 8 3s8-1 8-3V6M4 12v6c0 2 4 3 8 3s8-1 8-3v-6"/></svg>',
        frames:
          '<svg viewBox="0 0 24 24"><rect x="4" y="5" width="12" height="10"/><path d="M8 9h12v10H8z"/></svg>',
        sliders:
          '<svg viewBox="0 0 24 24"><path d="M4 7h10M18 7h2M4 12h3M11 12h9M4 17h8M16 17h4"/><circle cx="16" cy="7" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="14" cy="17" r="2"/></svg>',
        reset:
          '<svg viewBox="0 0 24 24"><path d="M5 8a8 8 0 1 1-1 7"/><path d="M5 4v4h4"/></svg>',
        frame:
          '<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="14"/><path d="M8 9h8v6H8z"/></svg>',
        queue:
          '<svg viewBox="0 0 24 24"><path d="M5 6h14M5 12h10M5 18h7"/><path d="M18 14v6M15 17h6"/></svg>',
        rocket:
          '<svg viewBox="0 0 24 24"><path d="M8 16c5-1 8-4 9-9-5 1-8 4-9 9z"/><path d="M9 15l-4 4 1-5-3-3 5-1M15 9l4-4-5 1-3-3-1 5"/></svg>',
      };

      return icons[name] || icons.sliders;
    }

    _styles() {
      if (document.getElementById("sm-deliver-settings-style")) {
        return;
      }

      const style = document.createElement("style");

      style.id = "sm-deliver-settings-style";

      style.textContent = `
   /* =========================================================
      DELIVER SETTINGS PANEL
      Uses SM Engine roots.css variables.
      ========================================================= */

   .sm-deliver-settings{
    min-height:100%;
    padding:8px;
    box-sizing:border-box;
    background:var(--panel-bg,var(--primary-dark,#333333));
    color:var(--text-primary,#ffffff);
    font-family:inherit;
   }

   .sm-deliver-settings *,
   .sm-deliver-settings *::before,
   .sm-deliver-settings *::after{
    box-sizing:border-box;
   }

   .sm-deliver-settings svg{
    width:100%;
    height:100%;
    fill:none;
    stroke:currentColor;
    stroke-width:1.55;
    stroke-linecap:round;
    stroke-linejoin:round;
   }

   /* ---------------------------------------------------------
      Top summary
      --------------------------------------------------------- */

   .sm-deliver-settings-summary{
    min-height:48px;
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:12px;
    margin-bottom:8px;
    padding:0 10px;
    border:1px solid var(--border-color,#4d4d4d81);
    background:var(--header-bg,var(--secondary-dark,#3c3c3c));
   }

   .sm-deliver-settings-summary-main{
    min-width:0;
    display:flex;
    align-items:center;
    gap:9px;
   }

   .sm-deliver-settings-summary-icon{
    width:21px;
    height:21px;
    flex:0 0 21px;
    color:var(--text-secondary,#b0b0b0);
   }

   .sm-deliver-settings-summary-main>div{
    min-width:0;
   }

   .sm-deliver-settings-summary-main strong,
   .sm-deliver-settings-summary-main em{
    display:block;
    overflow:hidden;
    text-overflow:ellipsis;
    white-space:nowrap;
   }

   .sm-deliver-settings-summary-main strong{
    font-size:11px;
    font-weight:700;
   }

   .sm-deliver-settings-summary-main em{
    margin-top:2px;
    color:var(--text-secondary,#b0b0b0);
    font-size:8px;
    font-style:normal;
   }

   .sm-deliver-settings-summary-status{
    min-height:24px;
    display:flex;
    align-items:center;
    gap:5px;
    padding:0 7px;
    border:1px solid var(--border-color,#4d4d4d81);
    background:var(--primary-dark,#333333);
    color:var(--text-secondary,#b0b0b0);
   }

   .sm-deliver-settings-summary-status>span{
    width:12px;
    height:12px;
   }

   .sm-deliver-settings-summary-status strong{
    font-size:7px;
    letter-spacing:.35px;
   }

   .sm-deliver-settings-summary-status.ready{
    color:var(--text-primary,#ffffff);
   }

   .sm-deliver-settings-summary-status.warning{
    background:var(--accent-blue-dark,#474747);
    color:var(--text-primary,#ffffff);
   }

   /* ---------------------------------------------------------
      Sections
      --------------------------------------------------------- */

   .sm-deliver-section{
    margin-bottom:8px;
    border:1px solid var(--border-color,#4d4d4d81);
    background:var(--panel-bg,var(--primary-dark,#333333));
   }

   .sm-deliver-section-header{
    min-height:32px;
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:10px;
    padding:0 8px;
    border-bottom:1px solid var(--border-color,#4d4d4d81);
    background:var(--header-bg,var(--secondary-dark,#3c3c3c));
   }

   .sm-deliver-section-heading{
    min-width:0;
    display:flex;
    align-items:center;
    gap:7px;
   }

   .sm-deliver-section-icon{
    width:15px;
    height:15px;
    flex:0 0 15px;
    color:var(--text-secondary,#b0b0b0);
   }

   .sm-deliver-section-heading>div{
    min-width:0;
   }

   .sm-deliver-section-heading strong,
   .sm-deliver-section-heading em{
    display:block;
   }

   .sm-deliver-section-heading strong{
    font-size:8px;
    letter-spacing:.45px;
   }

   .sm-deliver-section-heading em{
    margin-top:1px;
    color:var(--text-secondary,#b0b0b0);
    font-size:6px;
    font-style:normal;
   }

   .sm-deliver-section-value{
    max-width:48%;
    overflow:hidden;
    text-overflow:ellipsis;
    white-space:nowrap;
    color:var(--text-secondary,#b0b0b0);
    font-size:7px;
    text-align:right;
   }

   .sm-deliver-section-body{
    padding:8px;
   }

   /* ---------------------------------------------------------
      Grid / fields
      --------------------------------------------------------- */

   .sm-deliver-grid{
    display:grid;
    grid-template-columns:minmax(0,1fr) minmax(0,1fr);
    gap:8px 10px;
    margin-top:8px;
   }

   .sm-deliver-grid-single{
    grid-template-columns:minmax(0,1fr);
   }

   .sm-deliver-field{
    min-width:0;
    display:flex;
    flex-direction:column;
    gap:5px;
   }

   .sm-deliver-field-full{
    grid-column:1/-1;
   }

   .sm-deliver-label{
    color:var(--text-secondary,#b0b0b0);
    font-size:7px;
    font-weight:600;
    letter-spacing:.15px;
   }

   .sm-deliver-input-shell,
   .sm-deliver-select-shell,
   .sm-deliver-number-shell{
    min-height:28px;
    display:grid;
    align-items:center;
    border:1px solid var(--input-border,var(--border-color,#4d4d4d81));
    background:var(--input-bg,var(--primary-dark,#333333));
   }

   .sm-deliver-input-shell,
   .sm-deliver-select-shell{
    grid-template-columns:26px minmax(0,1fr);
   }

   .sm-deliver-number-shell{
    grid-template-columns:26px minmax(0,1fr) auto;
   }

   .sm-deliver-input-shell:focus-within,
   .sm-deliver-select-shell:focus-within,
   .sm-deliver-number-shell:focus-within{
    border-color:var(--accent-blue,#5f5f5f);
    background:var(--secondary-dark,#3c3c3c);
   }

   .sm-deliver-input-icon{
    width:14px;
    height:14px;
    margin:auto;
    color:var(--text-secondary,#b0b0b0);
   }

   .sm-deliver-input,
   .sm-deliver-select,
   .sm-deliver-number{
    width:100%;
    min-width:0;
    height:26px;
    padding:0 7px;
    border:0;
    outline:0;
    background:transparent;
    color:var(--text-primary,#ffffff);
    font:inherit;
    font-size:8px;
   }

   .sm-deliver-number{
    text-align:right;
   }

   .sm-deliver-select{
    cursor:pointer;
   }

   .sm-deliver-select option{
    background:var(--secondary-dark,#3c3c3c);
    color:var(--text-primary,#ffffff);
   }

   .sm-deliver-unit{
    min-width:38px;
    padding:0 7px;
    color:var(--text-secondary,#b0b0b0);
    font-size:6px;
    text-align:right;
   }

   .sm-deliver-field-disabled{
    opacity:.38;
    pointer-events:none;
   }

   .sm-deliver-disabled-group{
    opacity:.42;
   }

   /* ---------------------------------------------------------
      Feature toggles
      --------------------------------------------------------- */

   .sm-deliver-feature-toggle{
    min-height:54px;
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:12px;
    padding:0 9px;
    border:1px solid var(--border-color,#4d4d4d81);
    background:var(--primary-dark,#333333);
   }

   .sm-deliver-feature-copy{
    min-width:0;
    display:flex;
    align-items:center;
    gap:8px;
   }

   .sm-deliver-feature-icon{
    width:17px;
    height:17px;
    flex:0 0 17px;
    color:var(--text-secondary,#b0b0b0);
   }

   .sm-deliver-feature-copy>div{
    min-width:0;
   }

   .sm-deliver-feature-copy strong,
   .sm-deliver-feature-copy em{
    display:block;
   }

   .sm-deliver-feature-copy strong{
    font-size:8px;
   }

   .sm-deliver-feature-copy em{
    margin-top:3px;
    color:var(--text-secondary,#b0b0b0);
    font-size:6px;
    font-style:normal;
    line-height:1.35;
   }

   .sm-deliver-checkbox{
    width:15px;
    height:15px;
    flex:0 0 15px;
    accent-color:var(--accent-blue,#5f5f5f);
    cursor:pointer;
   }

   /* ---------------------------------------------------------
      Tokens
      --------------------------------------------------------- */

   .sm-deliver-token-row{
    display:grid;
    grid-template-columns:58px minmax(0,1fr);
    align-items:start;
    gap:7px;
    margin-top:8px;
   }

   .sm-deliver-token-row>.sm-deliver-label{
    padding-top:5px;
   }

   .sm-deliver-token-list{
    display:flex;
    flex-wrap:wrap;
    gap:4px;
   }

   .sm-deliver-token{
    min-height:22px;
    padding:0 6px;
    border:1px solid var(--border-color,#4d4d4d81);
    border-radius:0;
    background:var(--bg-button,var(--primary-dark,#333333));
    color:var(--text-secondary,#b0b0b0);
    font-size:6px;
    cursor:pointer;
   }

   .sm-deliver-token:hover{
    background:var(--bg-button-hover,var(--accent-blue-dark,#474747));
    color:var(--text-primary,#ffffff);
   }

   /* ---------------------------------------------------------
      Codec / range status
      --------------------------------------------------------- */

   .sm-deliver-codec-status,
   .sm-deliver-range-info{
    margin-top:8px;
    padding:7px 8px;
    border:1px solid var(--border-color,#4d4d4d81);
    background:var(--primary-dark,#333333);
   }

   .sm-deliver-codec-status>div,
   .sm-deliver-range-info{
    display:flex;
    align-items:center;
    gap:8px;
   }

   .sm-deliver-codec-status-icon,
   .sm-deliver-range-info>span{
    width:15px;
    height:15px;
    flex:0 0 15px;
    color:var(--text-secondary,#b0b0b0);
   }

   .sm-deliver-codec-status-icon.warning{
    color:var(--text-primary,#ffffff);
   }

   .sm-deliver-codec-status strong,
   .sm-deliver-codec-status em,
   .sm-deliver-range-info strong,
   .sm-deliver-range-info em{
    display:block;
   }

   .sm-deliver-codec-status strong,
   .sm-deliver-range-info strong{
    font-size:7px;
   }

   .sm-deliver-codec-status em,
   .sm-deliver-range-info em{
    margin-top:2px;
    color:var(--text-secondary,#b0b0b0);
    font-size:6px;
    font-style:normal;
    line-height:1.4;
   }

   /* ---------------------------------------------------------
      Estimate
      --------------------------------------------------------- */

   .sm-deliver-estimate-grid{
    display:grid;
    grid-template-columns:repeat(2,minmax(0,1fr));
    gap:6px;
   }

   .sm-deliver-estimate-card{
    min-height:76px;
    display:flex;
    flex-direction:column;
    justify-content:center;
    gap:5px;
    padding:8px;
    border:1px solid var(--border-color,#4d4d4d81);
    background:var(--primary-dark,#333333);
   }

   .sm-deliver-estimate-card-top{
    display:flex;
    align-items:center;
    gap:5px;
   }

   .sm-deliver-estimate-card-top>span{
    width:13px;
    height:13px;
    color:var(--text-secondary,#b0b0b0);
   }

   .sm-deliver-estimate-card-top em{
    color:var(--text-secondary,#b0b0b0);
    font-size:6px;
    font-style:normal;
    text-transform:uppercase;
    letter-spacing:.25px;
   }

   .sm-deliver-estimate-card>strong{
    overflow:hidden;
    text-overflow:ellipsis;
    white-space:nowrap;
    font-size:12px;
    font-weight:700;
   }

   .sm-deliver-estimate-card>small{
    color:var(--text-secondary,#b0b0b0);
    font-size:6px;
    line-height:1.35;
   }

   .sm-deliver-issue-summary{
    min-height:52px;
    display:grid;
    grid-template-columns:18px minmax(0,1fr) auto;
    align-items:center;
    gap:7px;
    margin-top:7px;
    padding:6px 7px;
    border:1px solid var(--border-color,#4d4d4d81);
    background:var(--secondary-dark,#3c3c3c);
   }

   .sm-deliver-issue-summary>span{
    width:15px;
    height:15px;
    color:var(--text-secondary,#b0b0b0);
   }

   .sm-deliver-issue-summary strong,
   .sm-deliver-issue-summary em{
    display:block;
   }

   .sm-deliver-issue-summary strong{
    font-size:7px;
   }

   .sm-deliver-issue-summary em{
    margin-top:2px;
    color:var(--text-secondary,#b0b0b0);
    font-size:6px;
    font-style:normal;
    line-height:1.4;
   }

   .sm-deliver-issue-summary button{
    min-height:22px;
    padding:0 7px;
    border:1px solid var(--border-color,#4d4d4d81);
    border-radius:0;
    background:var(--bg-button,#363636);
    color:var(--text-secondary,#b0b0b0);
    font-size:6px;
    cursor:pointer;
   }

   .sm-deliver-issue-summary button:hover{
    background:var(--bg-button-hover,var(--accent-blue-dark,#474747));
    color:var(--text-primary,#ffffff);
   }

   /* ---------------------------------------------------------
      Bottom actions
      --------------------------------------------------------- */

   .sm-deliver-actions{
    position:sticky;
    bottom:0;
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:8px;
    padding:8px 0 2px;
    background:var(--panel-bg,var(--primary-dark,#333333));
   }

   .sm-deliver-actions-left,
   .sm-deliver-actions-right{
    display:flex;
    align-items:center;
    gap:5px;
   }

   .sm-deliver-button{
    min-height:28px;
    display:inline-flex;
    align-items:center;
    justify-content:center;
    gap:5px;
    padding:0 9px;
    border:1px solid var(--border-color,#4d4d4d81);
    border-radius:0;
    background:var(--bg-button,#363636);
    color:var(--text-secondary,#b0b0b0);
    font-size:7px;
    cursor:pointer;
   }

   .sm-deliver-button>svg{
    width:13px;
    height:13px;
   }

   .sm-deliver-button:hover{
    background:var(--bg-button-hover,var(--accent-blue-dark,#474747));
    color:var(--text-primary,#ffffff);
   }

   .sm-deliver-button-primary{
    background:var(--accent-blue-dark,#474747);
    color:var(--text-primary,#ffffff);
   }

   .sm-deliver-button-primary:hover{
    background:var(--accent-blue,#5f5f5f);
   }

   .sm-deliver-button:disabled{
    opacity:.35;
    pointer-events:none;
   }

   /* ---------------------------------------------------------
      Scrollbar
      --------------------------------------------------------- */

   .video-deliver-dock-content{
    scrollbar-width:thin;
    scrollbar-color:
     var(--accent-blue-dark,#474747)
     var(--panel-bg,#333333);
   }

   .video-deliver-dock-content::-webkit-scrollbar{
    width:8px;
    height:8px;
   }

   .video-deliver-dock-content::-webkit-scrollbar-track{
    background:var(--panel-bg,#333333);
   }

   .video-deliver-dock-content::-webkit-scrollbar-thumb{
    background:var(--accent-blue-dark,#474747);
   }

   .video-deliver-dock-content::-webkit-scrollbar-thumb:hover{
    background:var(--accent-blue,#5f5f5f);
   }

   /* ---------------------------------------------------------
      Responsive
      --------------------------------------------------------- */

   @media (max-width:760px){
    .sm-deliver-grid,
    .sm-deliver-estimate-grid{
     grid-template-columns:minmax(0,1fr);
    }

    .sm-deliver-actions{
     align-items:stretch;
     flex-direction:column;
    }

    .sm-deliver-actions-left,
    .sm-deliver-actions-right{
     width:100%;
    }

    .sm-deliver-button{
     flex:1;
    }

    .sm-deliver-section-value{
     max-width:40%;
    }
   }
  `;

      document.head.appendChild(style);
    }
  }

  global.VideoDeliverSettingsPanel = VideoDeliverSettingsPanel;
})(window);
