/**
 * ColorCurvesPanel.js
 * SM Engine — interactive Custom Curves editor.
 */
(function (global) {
  "use strict";

  class ColorCurvesPanel {
    constructor(manager) {
      this.manager = manager || global.colorGradingManager;

      this.host = null;
      this.canvas = null;
      this.ctx = null;
      this.channel = "master";
      this.dragIndex = -1;
      this.resizeObserver = null;
      this._styles();
    }

    mount(host) {
      this.host = host;

      host.innerHTML = `
   <div class="ve-curves-panel">
    <header>
     <div>
      <strong>CUSTOM CURVES</strong>
      <span>Click to add · drag points · right click to delete</span>
     </div>

     <button type="button" data-curve-reset>
      ${this._svg("reset")}
      <span>RESET</span>
     </button>
    </header>

    <nav class="ve-curves-channels">
     <button type="button" data-curve-channel="master" class="active">Y</button>
     <button type="button" data-curve-channel="red">R</button>
     <button type="button" data-curve-channel="green">G</button>
     <button type="button" data-curve-channel="blue">B</button>
    </nav>

    <div class="ve-curves-canvas-wrap">
     <canvas></canvas>
    </div>

    <footer>
     <span data-curve-point-read>Input 0.000 · Output 0.000</span>
     <span data-curve-channel-read>Master</span>
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
      this.draw();
    }

    render() {
      this.draw();
    }

    draw() {
      if (!this.canvas || !this.ctx) {
        return;
      }

      const clip = this.manager?.selectedClip?.();

      const width = this.canvas.clientWidth;

      const height = this.canvas.clientHeight;

      if (width <= 0 || height <= 0) {
        return;
      }

      const ctx = this.ctx;

      const colors = this._colors();

      ctx.clearRect(0, 0, width, height);

      ctx.fillStyle = colors.background;

      ctx.fillRect(0, 0, width, height);

      this._drawGrid(ctx, width, height, colors);

      if (!clip) {
        ctx.fillStyle = colors.text;

        ctx.font = "10px sans-serif";

        ctx.textAlign = "center";

        ctx.fillText("Select a video/image clip", width / 2, height / 2);

        return;
      }

      const grade = this.manager.ensureGrade(clip);

      const points = grade.curves[this.channel];

      ctx.strokeStyle = colors[this.channel];

      ctx.lineWidth = 1.8;

      ctx.beginPath();

      for (let i = 0; i < points.length; i++) {
        const point = points[i];

        const x = point.x * width;

        const y = (1 - point.y) * height;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }

      ctx.stroke();

      points.forEach((point, index) => {
        const x = point.x * width;

        const y = (1 - point.y) * height;

        ctx.beginPath();

        ctx.arc(x, y, index === this.dragIndex ? 4.5 : 3.5, 0, Math.PI * 2);

        ctx.fillStyle = colors.pointFill;

        ctx.fill();

        ctx.strokeStyle = colors[this.channel];

        ctx.lineWidth = 1.3;

        ctx.stroke();
      });

      const read = this.host.querySelector("[data-curve-channel-read]");

      if (read) {
        read.textContent =
          this.channel === "master"
            ? "Master"
            : this.channel.charAt(0).toUpperCase() + this.channel.slice(1);
      }
    }

    _drawGrid(ctx, width, height, colors) {
      ctx.strokeStyle = colors.grid;

      ctx.lineWidth = 1;

      ctx.beginPath();

      for (let i = 1; i < 4; i++) {
        const x = (width * i) / 4;

        ctx.moveTo(x + 0.5, 0);

        ctx.lineTo(x + 0.5, height);

        const y = (height * i) / 4;

        ctx.moveTo(0, y + 0.5);

        ctx.lineTo(width, y + 0.5);
      }

      ctx.stroke();

      ctx.strokeStyle = colors.diagonal;

      ctx.beginPath();

      ctx.moveTo(0, height);

      ctx.lineTo(width, 0);

      ctx.stroke();
    }

    _bind() {
      this.host.querySelectorAll("[data-curve-channel]").forEach((button) => {
        button.addEventListener("click", () => {
          this.channel = button.dataset.curveChannel;

          this.host.querySelectorAll("[data-curve-channel]").forEach((item) => {
            item.classList.toggle("active", item === button);
          });

          this.draw();
        });
      });

      this.host
        .querySelector("[data-curve-reset]")
        ?.addEventListener("click", () => {
          const clip = this.manager?.selectedClip?.();

          if (!clip) return;

          this.manager.setCurve(
            this.channel,
            [
              { x: 0, y: 0 },
              { x: 1, y: 1 },
            ],
            clip,
          );

          this.draw();
        });

      this.canvas.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) {
          return;
        }

        const clip = this.manager?.selectedClip?.();

        if (!clip) return;

        const grade = this.manager.ensureGrade(clip);

        const points = grade.curves[this.channel];

        const pos = this._pointer(event);

        let nearest = -1;
        let best = Infinity;

        points.forEach((point, index) => {
          const dx = (point.x - pos.x) * this.canvas.clientWidth;

          const dy = (point.y - pos.y) * this.canvas.clientHeight;

          const distance = Math.hypot(dx, dy);

          if (distance < best) {
            best = distance;
            nearest = index;
          }
        });

        if (best > 10) {
          points.push({
            x: pos.x,
            y: pos.y,
          });

          points.sort((a, b) => a.x - b.x);

          nearest = points.findIndex(
            (point) =>
              Math.abs(point.x - pos.x) < 0.0001 &&
              Math.abs(point.y - pos.y) < 0.0001,
          );

          this.manager.setCurve(this.channel, points, clip);
        }

        this.dragIndex = nearest;

        const move = (moveEvent) => {
          const current = this._pointer(moveEvent);

          const currentGrade = this.manager.ensureGrade(clip);

          const curve = currentGrade.curves[this.channel];

          if (this.dragIndex < 0 || !curve[this.dragIndex]) {
            return;
          }

          const point = curve[this.dragIndex];

          point.y = current.y;

          if (this.dragIndex === 0) {
            point.x = 0;
          } else if (this.dragIndex === curve.length - 1) {
            point.x = 1;
          } else {
            const prev = curve[this.dragIndex - 1];

            const next = curve[this.dragIndex + 1];

            point.x = Math.max(
              prev.x + 0.002,
              Math.min(next.x - 0.002, current.x),
            );
          }

          this.manager.setCurve(this.channel, curve, clip);

          this._readPoint(point);

          this.draw();
        };

        const up = () => {
          global.removeEventListener("pointermove", move);

          this.dragIndex = -1;
          this.draw();
        };

        global.addEventListener("pointermove", move);

        global.addEventListener("pointerup", up, {
          once: true,
        });
      });

      this.canvas.addEventListener("contextmenu", (event) => {
        event.preventDefault();

        const clip = this.manager?.selectedClip?.();

        if (!clip) return;

        const grade = this.manager.ensureGrade(clip);

        const points = grade.curves[this.channel];

        const pos = this._pointer(event);

        let nearest = -1;
        let best = Infinity;

        points.forEach((point, index) => {
          if (index === 0 || index === points.length - 1) {
            return;
          }

          const dx = (point.x - pos.x) * this.canvas.clientWidth;

          const dy = (point.y - pos.y) * this.canvas.clientHeight;

          const distance = Math.hypot(dx, dy);

          if (distance < best) {
            best = distance;
            nearest = index;
          }
        });

        if (nearest >= 0 && best < 12) {
          points.splice(nearest, 1);

          this.manager.setCurve(this.channel, points, clip);

          this.draw();
        }
      });
    }

    _pointer(event) {
      const rect = this.canvas.getBoundingClientRect();

      return {
        x: Math.max(
          0,
          Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width)),
        ),
        y: Math.max(
          0,
          Math.min(
            1,
            1 - (event.clientY - rect.top) / Math.max(1, rect.height),
          ),
        ),
      };
    }

    _readPoint(point) {
      const read = this.host.querySelector("[data-curve-point-read]");

      if (read) {
        read.textContent = `Input ${point.x.toFixed(3)} · Output ${point.y.toFixed(3)}`;
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

        grid: "rgba(255,255,255,.08)",

        diagonal: "rgba(255,255,255,.18)",

        text: root.getPropertyValue("--text-secondary").trim() || "#b0b0b0",

        pointFill: root.getPropertyValue("--primary-dark").trim() || "#333333",

        master: "#d6d6d6",

        red: root.getPropertyValue("--axis-x-color").trim() || "#e16b6b",

        green: root.getPropertyValue("--axis-y-color").trim() || "#71c47a",

        blue: root.getPropertyValue("--axis-z-color").trim() || "#6f8fe6",
      };
    }

    _svg(name) {
      if (name === "reset") {
        return '<svg viewBox="0 0 24 24"><path d="M5 8a8 8 0 1 1-1 7"/><path d="M5 4v4h4"/></svg>';
      }

      return "";
    }

    _styles() {
      if (document.getElementById("ve-color-curves-styles")) {
        return;
      }

      const style = document.createElement("style");

      style.id = "ve-color-curves-styles";

      style.textContent = `
   .ve-curves-panel{
    height:100%;
    min-width:0;
    min-height:0;
    display:grid;
    grid-template-rows:36px 29px minmax(0,1fr) 22px;
    overflow:hidden;
    background:var(--primary-dark,#333);
    color:var(--text-primary,#fff);
   }

   .ve-curves-panel>header{
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:6px;
    padding:0 6px;
    border-bottom:1px solid var(--border-color,#4d4d4d81);
    background:var(--header-bg,var(--secondary-dark,#3c3c3c));
   }

   .ve-curves-panel>header strong,
   .ve-curves-panel>header span{
    display:block;
   }

   .ve-curves-panel>header strong{
    font-size:8px;
   }

   .ve-curves-panel>header span{
    margin-top:2px;
    color:var(--text-secondary,#b0b0b0);
    font-size:7px;
   }

   .ve-curves-panel>header button{
    height:21px;
    display:flex;
    align-items:center;
    gap:4px;
    padding:0 6px;
    border:1px solid var(--border-color,#4d4d4d81);
    border-radius:0;
    background:var(--bg-button,#363636);
    color:var(--text-secondary,#b0b0b0);
    font-size:7px;
   }

   .ve-curves-panel>header button svg{
    width:12px;
    height:12px;
    fill:none;
    stroke:currentColor;
    stroke-width:1.6;
   }

   .ve-curves-channels{
    display:flex;
    align-items:center;
    gap:2px;
    padding:0 5px;
    border-bottom:1px solid var(--border-color,#4d4d4d81);
    background:var(--secondary-dark,#3c3c3c);
   }

   .ve-curves-channels button{
    width:26px;
    height:20px;
    border:1px solid transparent;
    border-radius:0;
    background:transparent;
    color:var(--text-secondary,#b0b0b0);
    font-size:8px;
    cursor:pointer;
   }

   .ve-curves-channels button:hover,
   .ve-curves-channels button.active{
    border-color:var(--border-color,#4d4d4d81);
    background:var(--accent-blue-dark,#474747);
    color:var(--text-primary,#fff);
   }

   .ve-curves-canvas-wrap{
    min-height:0;
    padding:7px;
   }

   .ve-curves-canvas-wrap canvas{
    width:100%;
    height:100%;
    display:block;
    border:1px solid var(--border-color,#4d4d4d81);
    cursor:crosshair;
   }

   .ve-curves-panel>footer{
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
  }

  global.ColorCurvesPanel = ColorCurvesPanel;
})(window);
