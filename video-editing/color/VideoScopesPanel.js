/**
 * VideoScopesPanel.js
 * SM Engine — real-time Color scopes from the Video Editing composite canvas.
 *
 * Scopes:
 * - Waveform
 * - RGB Parade
 * - Histogram
 * - Vectorscope
 */
(function (global) {
  "use strict";

  class VideoScopesPanel {
    constructor() {
      this.host = null;
      this.canvas = null;
      this.ctx = null;
      this.scope = "waveform";
      this.offscreen = document.createElement("canvas");
      this.offctx = this.offscreen.getContext("2d", {
        willReadFrequently: true,
      });
      this.resizeObserver = null;
      this.raf = 0;
      this.lastDraw = 0;
      this.running = false;
      this._styles();
    }

    mount(host) {
      this.host = host;

      host.innerHTML = `
   <div class="ve-scopes-panel">
    <header>
     <div>
      <strong>VIDEO SCOPES</strong>
      <span>Composite output analysis</span>
     </div>

     <button type="button" data-scope-refresh title="Refresh scopes">
      ${this._svg("refresh")}
     </button>
    </header>

    <nav class="ve-scopes-tabs">
     <button type="button" data-scope="waveform" class="active">WAVEFORM</button>
     <button type="button" data-scope="parade">RGB PARADE</button>
     <button type="button" data-scope="histogram">HISTOGRAM</button>
     <button type="button" data-scope="vectorscope">VECTOR</button>
    </nav>

    <div class="ve-scopes-canvas-wrap">
     <canvas></canvas>
    </div>

    <footer>
     <span data-scope-info>Y 0–100 IRE</span>
     <span>Live Composite</span>
    </footer>
   </div>
  `;

      this.canvas = host.querySelector("canvas");

      this.ctx = this.canvas.getContext("2d");

      this._bind();

      this.resizeObserver = new ResizeObserver(() => {
        this._resize();
        this.draw();
      });

      this.resizeObserver.observe(host);

      this._resize();
      this.start();
    }

    render() {
      this.draw();
    }

    start() {
      if (this.running) return;

      this.running = true;

      const loop = (timestamp) => {
        if (!this.running) {
          this.raf = 0;
          return;
        }

        if (timestamp - this.lastDraw > 120) {
          this.lastDraw = timestamp;

          this.draw();
        }

        this.raf = requestAnimationFrame(loop);
      };

      this.raf = requestAnimationFrame(loop);
    }

    stop() {
      this.running = false;

      if (this.raf) {
        cancelAnimationFrame(this.raf);
      }

      this.raf = 0;
    }

    draw() {
      if (!this.canvas || !this.ctx) {
        return;
      }

      const width = this.canvas.clientWidth;

      const height = this.canvas.clientHeight;

      if (width <= 0 || height <= 0) {
        return;
      }

      const colors = this._colors();

      const ctx = this.ctx;

      ctx.clearRect(0, 0, width, height);

      ctx.fillStyle = colors.background;

      ctx.fillRect(0, 0, width, height);

      this._drawGrid(ctx, width, height, colors);

      const pixels = this._sampleComposite();

      if (!pixels) {
        ctx.fillStyle = colors.text;

        ctx.font = "10px sans-serif";

        ctx.textAlign = "center";

        ctx.fillText("No composite frame available", width / 2, height / 2);

        return;
      }

      if (this.scope === "waveform") {
        this._drawWaveform(ctx, width, height, pixels, colors);
      } else if (this.scope === "parade") {
        this._drawParade(ctx, width, height, pixels, colors);
      } else if (this.scope === "histogram") {
        this._drawHistogram(ctx, width, height, pixels, colors);
      } else {
        this._drawVectorscope(ctx, width, height, pixels, colors);
      }
    }

    _sampleComposite() {
      const source =
        global.videoEditingManager?.canvas ||
        document.getElementById("video-editing-canvas");

      if (!source || !source.width || !source.height) {
        return null;
      }

      const sampleW = 144;

      const sampleH = Math.max(
        64,
        Math.round((sampleW * source.height) / source.width),
      );

      this.offscreen.width = sampleW;

      this.offscreen.height = sampleH;

      try {
        this.offctx.clearRect(0, 0, sampleW, sampleH);

        this.offctx.drawImage(source, 0, 0, sampleW, sampleH);

        return {
          width: sampleW,
          height: sampleH,
          data: this.offctx.getImageData(0, 0, sampleW, sampleH).data,
        };
      } catch (error) {
        return null;
      }
    }

    _drawWaveform(ctx, width, height, pixels, colors) {
      ctx.globalAlpha = 0.12;
      ctx.fillStyle = colors.scope;

      const sx = width / pixels.width;

      for (let y = 0; y < pixels.height; y += 2) {
        for (let x = 0; x < pixels.width; x += 1) {
          const i = (y * pixels.width + x) * 4;

          const r = pixels.data[i];

          const g = pixels.data[i + 1];

          const b = pixels.data[i + 2];

          const luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

          const px = x * sx;

          const py = (1 - luma) * (height - 1);

          ctx.fillRect(px, py, Math.max(1, sx), 1);
        }
      }

      ctx.globalAlpha = 1;

      this._setInfo("Waveform · Luma 0–100 IRE");
    }

    _drawParade(ctx, width, height, pixels, colors) {
      const thirds = width / 3;

      const channels = [
        {
          offset: 0,
          color: colors.red,
          index: 0,
        },
        {
          offset: thirds,
          color: colors.green,
          index: 1,
        },
        {
          offset: thirds * 2,
          color: colors.blue,
          index: 2,
        },
      ];

      channels.forEach((channel) => {
        ctx.globalAlpha = 0.14;

        ctx.fillStyle = channel.color;

        const sx = thirds / pixels.width;

        for (let y = 0; y < pixels.height; y += 2) {
          for (let x = 0; x < pixels.width; x++) {
            const i = (y * pixels.width + x) * 4;

            const value = pixels.data[i + channel.index] / 255;

            ctx.fillRect(
              channel.offset + x * sx,
              (1 - value) * (height - 1),
              Math.max(1, sx),
              1,
            );
          }
        }
      });

      ctx.globalAlpha = 1;

      ctx.strokeStyle = colors.gridStrong;

      ctx.beginPath();

      ctx.moveTo(thirds, 0);

      ctx.lineTo(thirds, height);

      ctx.moveTo(thirds * 2, 0);

      ctx.lineTo(thirds * 2, height);

      ctx.stroke();

      this._setInfo("RGB Parade · 0–100");
    }

    _drawHistogram(ctx, width, height, pixels, colors) {
      const bins = {
        r: new Uint32Array(256),
        g: new Uint32Array(256),
        b: new Uint32Array(256),
        y: new Uint32Array(256),
      };

      let max = 1;

      for (let i = 0; i < pixels.data.length; i += 4) {
        const r = pixels.data[i];

        const g = pixels.data[i + 1];

        const b = pixels.data[i + 2];

        const y = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);

        bins.r[r]++;
        bins.g[g]++;
        bins.b[b]++;
        bins.y[y]++;

        max = Math.max(max, bins.r[r], bins.g[g], bins.b[b], bins.y[y]);
      }

      const drawLine = (array, color, alpha) => {
        ctx.strokeStyle = color;

        ctx.globalAlpha = alpha;

        ctx.beginPath();

        for (let x = 0; x < 256; x++) {
          const px = (x / 255) * width;

          const py = height - (array[x] / max) * (height - 8);

          if (x === 0) {
            ctx.moveTo(px, py);
          } else {
            ctx.lineTo(px, py);
          }
        }

        ctx.stroke();
      };

      drawLine(bins.y, colors.scope, 0.8);

      drawLine(bins.r, colors.red, 0.72);

      drawLine(bins.g, colors.green, 0.72);

      drawLine(bins.b, colors.blue, 0.72);

      ctx.globalAlpha = 1;

      this._setInfo("Histogram · YRGB");
    }

    _drawVectorscope(ctx, width, height, pixels, colors) {
      const cx = width / 2;

      const cy = height / 2;

      const radius = Math.min(width, height) * 0.42;

      ctx.strokeStyle = colors.gridStrong;

      ctx.globalAlpha = 0.8;

      ctx.beginPath();

      ctx.arc(cx, cy, radius, 0, Math.PI * 2);

      ctx.stroke();

      ctx.beginPath();

      ctx.moveTo(cx - radius, cy);

      ctx.lineTo(cx + radius, cy);

      ctx.moveTo(cx, cy - radius);

      ctx.lineTo(cx, cy + radius);

      ctx.stroke();

      ctx.globalAlpha = 0.12;

      for (let i = 0; i < pixels.data.length; i += 12) {
        const r = pixels.data[i] / 255;

        const g = pixels.data[i + 1] / 255;

        const b = pixels.data[i + 2] / 255;

        const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;

        const u = (b - y) * 0.565;

        const v = (r - y) * 0.713;

        const x = cx + u * radius * 1.75;

        const py = cy - v * radius * 1.75;

        ctx.fillStyle = `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;

        ctx.fillRect(x, py, 1.5, 1.5);
      }

      ctx.globalAlpha = 1;

      this._setInfo("Vectorscope · Chroma");
    }

    _drawGrid(ctx, width, height, colors) {
      ctx.strokeStyle = colors.grid;

      ctx.lineWidth = 1;

      ctx.beginPath();

      for (let i = 1; i < 4; i++) {
        const y = (height * i) / 4;

        ctx.moveTo(0, y + 0.5);

        ctx.lineTo(width, y + 0.5);

        const x = (width * i) / 4;

        ctx.moveTo(x + 0.5, 0);

        ctx.lineTo(x + 0.5, height);
      }

      ctx.stroke();
    }

    _bind() {
      this.host.querySelectorAll("[data-scope]").forEach((button) => {
        button.addEventListener("click", () => {
          this.scope = button.dataset.scope;

          this.host.querySelectorAll("[data-scope]").forEach((item) => {
            item.classList.toggle("active", item === button);
          });

          this.draw();
        });
      });

      this.host
        .querySelector("[data-scope-refresh]")
        ?.addEventListener("click", () => {
          this.draw();
        });
    }

    _setInfo(text) {
      const info = this.host?.querySelector("[data-scope-info]");

      if (info) {
        info.textContent = text;
      }
    }

    _resize() {
      if (!this.canvas) return;

      const rect = this.canvas.getBoundingClientRect();

      const dpr = Math.min(2, global.devicePixelRatio || 1);

      const width = Math.max(1, Math.round(rect.width * dpr));

      const height = Math.max(1, Math.round(rect.height * dpr));

      if (this.canvas.width !== width) {
        this.canvas.width = width;
      }

      if (this.canvas.height !== height) {
        this.canvas.height = height;
      }

      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    _colors() {
      const root = getComputedStyle(document.documentElement);

      return {
        background: root.getPropertyValue("--primary-dark").trim() || "#333333",

        text: root.getPropertyValue("--text-secondary").trim() || "#b0b0b0",

        grid: "rgba(255,255,255,.055)",

        gridStrong: "rgba(255,255,255,.16)",

        scope: "#d7d7d7",

        red: root.getPropertyValue("--axis-x-color").trim() || "#e16b6b",

        green: root.getPropertyValue("--axis-y-color").trim() || "#71c47a",

        blue: root.getPropertyValue("--axis-z-color").trim() || "#6f8fe6",
      };
    }

    _svg(name) {
      if (name === "refresh") {
        return '<svg viewBox="0 0 24 24"><path d="M5 8a8 8 0 1 1-1 7"/><path d="M5 4v4h4"/></svg>';
      }

      return "";
    }

    _styles() {
      if (document.getElementById("ve-video-scopes-styles")) {
        return;
      }

      const style = document.createElement("style");

      style.id = "ve-video-scopes-styles";

      style.textContent = `
   .ve-scopes-panel{
    height:100%;
    min-width:0;
    min-height:0;
    display:grid;
    grid-template-rows:36px 29px minmax(0,1fr) 22px;
    overflow:hidden;
    background:var(--primary-dark,#333);
    color:var(--text-primary,#fff);
   }

   .ve-scopes-panel>header{
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:6px;
    padding:0 6px;
    border-bottom:1px solid var(--border-color,#4d4d4d81);
    background:var(--header-bg,var(--secondary-dark,#3c3c3c));
   }

   .ve-scopes-panel>header strong,
   .ve-scopes-panel>header span{
    display:block;
   }

   .ve-scopes-panel>header strong{
    font-size:8px;
   }

   .ve-scopes-panel>header span{
    margin-top:2px;
    color:var(--text-secondary,#b0b0b0);
    font-size:7px;
   }

   .ve-scopes-panel>header button{
    width:22px;
    height:21px;
    padding:4px;
    border:1px solid var(--border-color,#4d4d4d81);
    border-radius:0;
    background:var(--bg-button,#363636);
    color:var(--text-secondary,#b0b0b0);
   }

   .ve-scopes-panel>header button svg{
    width:100%;
    height:100%;
    fill:none;
    stroke:currentColor;
    stroke-width:1.6;
   }

   .ve-scopes-tabs{
    display:flex;
    align-items:center;
    gap:2px;
    padding:0 5px;
    overflow:hidden;
    border-bottom:1px solid var(--border-color,#4d4d4d81);
    background:var(--secondary-dark,#3c3c3c);
   }

   .ve-scopes-tabs button{
    height:20px;
    padding:0 6px;
    border:1px solid transparent;
    border-radius:0;
    background:transparent;
    color:var(--text-secondary,#b0b0b0);
    font-size:7px;
    white-space:nowrap;
    cursor:pointer;
   }

   .ve-scopes-tabs button:hover,
   .ve-scopes-tabs button.active{
    border-color:var(--border-color,#4d4d4d81);
    background:var(--accent-blue-dark,#474747);
    color:var(--text-primary,#fff);
   }

   .ve-scopes-canvas-wrap{
    min-height:0;
    padding:7px;
   }

   .ve-scopes-canvas-wrap canvas{
    width:100%;
    height:100%;
    display:block;
    border:1px solid var(--border-color,#4d4d4d81);
   }

   .ve-scopes-panel>footer{
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:8px;
    padding:0 6px;
    border-top:1px solid var(--border-color,#4d4d4d81);
    background:var(--header-bg,var(--secondary-dark,#3c3c3c));
    color:var(--text-secondary,#b0b0b0);
    font-size:6px;
   }
  `;

      document.head.appendChild(style);
    }

    destroy() {
      this.stop();
      this.resizeObserver?.disconnect?.();
    }
  }

  global.VideoScopesPanel = VideoScopesPanel;
})(window);
