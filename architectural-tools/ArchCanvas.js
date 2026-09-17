/**
 * ArchCanvas.js - 2D Floor Plan Canvas Engine
 * AutoCAD-inspired 2D drawing surface for SM Engine
 * Handles: grid, snap, pan, zoom, rendering all arch elements
 */
"use strict";

(function() {

window.ArchCanvas = {
    canvas: null,
    ctx: null,
    container: null,

    // World state
    panX: 0,
    panY: 0,
    zoom: 1.0,
    gridSize: 0.5,        // meters per grid cell
    pixelsPerMeter: 40,   // base pixels per meter at zoom=1

    // Interaction state
    isPanning: false,
    lastMouse: { x: 0, y: 0 },
    mouseWorld: { x: 0, y: 0 },

    // Floor plan data
    walls: [],
    doors: [],
    windows: [],
    columns: [],
    stairs: [],
    labels: [],
    dimensions: [],

    // Active tool reference
    activeTool: null,

    init() {
        if (this.canvas?.isConnected && this.ctx) {
            this._resize();
            return this;
        }

        this.container = document.getElementById('viewport-container') ||
                         document.querySelector('.viewport-container') ||
                         document.querySelector('#scene-container') ||
                         document.body;

        // Create canvas overlay
        this.canvas = document.createElement('canvas');
        this.canvas.id = 'arch-floorplan-canvas';
        this.canvas.style.cssText = `
            position: absolute;
            top: 0; left: 0; right: 0; bottom: 0;
            width: 100%; height: 100%;
            z-index: 50;
            cursor: crosshair;
            display: none;
            background: #0a1628;
            touch-action: none;
        `;
        if (getComputedStyle(this.container).position === 'static') {
            this.container.style.position = 'relative';
        }

        this.container.appendChild(this.canvas);
        this.ctx = this.canvas.getContext('2d');

        if (!this.ctx) {
            console.error('[ArchCanvas] Could not create 2D canvas context.');
            this.canvas.remove();
            this.canvas = null;
            return null;
        }

        this._bindEvents();
        this._resize();

        window.addEventListener('resize', () => this._resize());
        console.log('[ArchCanvas] Initialized');
        return this;
    },

    show() {
        if (!this.canvas) this.init();
        this.canvas.style.display = 'block';
        this._resize();
        this.render();
    },

    hide() {
        this.isPanning = false;
        if (this.canvas) {
            this.canvas.style.cursor = 'crosshair';
            this.canvas.style.display = 'none';
        }
    },

    _resize() {
        if (!this.canvas) return;
        const r = this.canvas.parentElement.getBoundingClientRect();
        this.canvas.width = r.width || window.innerWidth - 350;
        this.canvas.height = r.height || window.innerHeight - 80;
        this.render();
    },

    // ---- Coordinate conversion ----
    worldToScreen(wx, wy) {
        const s = this.pixelsPerMeter * this.zoom;
        return {
            x: wx * s + this.panX + this.canvas.width / 2,
            y: -wy * s + this.panY + this.canvas.height / 2
        };
    },

    screenToWorld(sx, sy) {
        const s = this.pixelsPerMeter * this.zoom;
        return {
            x: (sx - this.panX - this.canvas.width / 2) / s,
            y: -((sy - this.panY - this.canvas.height / 2) / s)
        };
    },

    snapToGrid(wx, wy) {
        const g = this.gridSize;
        return {
            x: Math.round(wx / g) * g,
            y: Math.round(wy / g) * g
        };
    },

    snapToPoint(wx, wy, threshold = 0.3) {
        // Snap to existing wall endpoints
        let closest = null;
        let minDist = threshold;
        const check = (points) => {
            points.forEach(p => {
                const d = Math.hypot(p.x - wx, p.y - wy);
                if (d < minDist) { minDist = d; closest = p; }
            });
        };
        this.walls.forEach(w => check([w.p1, w.p2]));
        this.columns.forEach(c => check([{ x: c.x, y: c.y }]));
        return closest || this.snapToGrid(wx, wy);
    },

    // ---- Events ----
    _bindEvents() {
        const c = this.canvas;

        c.addEventListener('mousemove', (e) => {
            const rect = c.getBoundingClientRect();
            const sx = e.clientX - rect.left;
            const sy = e.clientY - rect.top;
            this.mouseWorld = this.screenToWorld(sx, sy);

            if (this.isPanning) {
                this.panX += sx - this.lastMouse.x;
                this.panY += sy - this.lastMouse.y;
                this.lastMouse = { x: sx, y: sy };
                this.render();
                return;
            }
            if (this.activeTool?.onMouseMove) {
                this.activeTool.onMouseMove(this.mouseWorld, e);
            }
            this.render();
        });

        c.addEventListener('mousedown', (e) => {
            const rect = c.getBoundingClientRect();
            const sx = e.clientX - rect.left;
            const sy = e.clientY - rect.top;
            this.mouseWorld = this.screenToWorld(sx, sy);

            if (e.button === 1 || (e.button === 0 && e.altKey)) {
                this.isPanning = true;
                this.lastMouse = { x: sx, y: sy };
                this.canvas.style.cursor = 'grabbing';
                return;
            }
            if (e.button === 0 && this.activeTool?.onMouseDown) {
                this.activeTool.onMouseDown(this.mouseWorld, e);
            }
        });

        const stopPanning = () => {
            if (!this.isPanning) return;
            this.isPanning = false;
            if (this.canvas) this.canvas.style.cursor = 'crosshair';
        };

        c.addEventListener('mouseup', stopPanning);
        c.addEventListener('mouseleave', stopPanning);
        window.addEventListener('mouseup', stopPanning);

        c.addEventListener('wheel', (e) => {
            e.preventDefault();

            const rect = c.getBoundingClientRect();
            const sx = e.clientX - rect.left;
            const sy = e.clientY - rect.top;
            const before = this.screenToWorld(sx, sy);

            const factor = e.deltaY < 0 ? 1.12 : 0.88;
            this.zoom = Math.max(0.1, Math.min(10, this.zoom * factor));

            const after = this.worldToScreen(before.x, before.y);
            this.panX += sx - after.x;
            this.panY += sy - after.y;

            this.mouseWorld = this.screenToWorld(sx, sy);
            this.render();
        }, { passive: false });

        c.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            if (this.activeTool?.onRightClick) this.activeTool.onRightClick(this.mouseWorld, e);
        });

        c.addEventListener('dblclick', (e) => {
            if (this.activeTool?.onDblClick) this.activeTool.onDblClick(this.mouseWorld, e);
        });

        document.addEventListener('keydown', (e) => {
            if (this.canvas.style.display === 'none') return;
            if (e.key === 'Escape' && this.activeTool?.onEscape) {
                this.activeTool.onEscape();
            }
            if ((e.key === 'Delete' || e.key === 'Backspace') && this.activeTool?.onDelete) {
                this.activeTool.onDelete();
            }
        });
    },

    setTool(tool) {
        if (this.activeTool?.deactivate) this.activeTool.deactivate();
        this.activeTool = tool;
        if (tool?.activate) tool.activate();
        this.render();
    },

    // ---- Main Render ----
    render() {
        if (!this.ctx || this.canvas.style.display === 'none') return;
        const ctx = this.ctx;
        const W = this.canvas.width;
        const H = this.canvas.height;

        ctx.clearRect(0, 0, W, H);

        // Background
        ctx.fillStyle = '#0a1628';
        ctx.fillRect(0, 0, W, H);

        this._drawGrid(ctx, W, H);
        this._drawAxes(ctx, W, H);
        this._drawWalls(ctx);
        this._drawDoors(ctx);
        this._drawWindows(ctx);
        this._drawColumns(ctx);
        this._drawStairs(ctx);
        this._drawLabels(ctx);
        this._drawDimensions(ctx);

        // Active tool preview
        if (this.activeTool?.draw) this.activeTool.draw(ctx);

        this._drawCursor(ctx, W, H);
        this._drawStatusBar(ctx, W, H);
    },

    _drawGrid(ctx, W, H) {
        const s = this.pixelsPerMeter * this.zoom;
        const gridPixels = this.gridSize * s;
        if (gridPixels < 4) return;

        const origin = this.worldToScreen(0, 0);
        const startX = origin.x % gridPixels;
        const startY = origin.y % gridPixels;

        // Minor grid
        ctx.strokeStyle = 'rgba(255,255,255,0.04)';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        for (let x = startX; x < W; x += gridPixels) {
            ctx.moveTo(x, 0); ctx.lineTo(x, H);
        }
        for (let y = startY; y < H; y += gridPixels) {
            ctx.moveTo(0, y); ctx.lineTo(W, y);
        }
        ctx.stroke();

        // Major grid (every 5 cells)
        const majorPixels = gridPixels * 5;
        const majStartX = origin.x % majorPixels;
        const majStartY = origin.y % majorPixels;
        ctx.strokeStyle = 'rgba(100,160,255,0.12)';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        for (let x = majStartX; x < W; x += majorPixels) {
            ctx.moveTo(x, 0); ctx.lineTo(x, H);
        }
        for (let y = majStartY; y < H; y += majorPixels) {
            ctx.moveTo(0, y); ctx.lineTo(W, y);
        }
        ctx.stroke();
    },

    _drawAxes(ctx, W, H) {
        const o = this.worldToScreen(0, 0);
        ctx.strokeStyle = 'rgba(100,160,255,0.3)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(o.x, 0); ctx.lineTo(o.x, H);
        ctx.moveTo(0, o.y); ctx.lineTo(W, o.y);
        ctx.stroke();
        ctx.setLineDash([]);
    },

    _drawWalls(ctx) {
        const s = this.pixelsPerMeter * this.zoom;
        this.walls.forEach(w => {
            const p1 = this.worldToScreen(w.p1.x, w.p1.y);
            const p2 = this.worldToScreen(w.p2.x, w.p2.y);
            const thickness = w.thickness * s;

            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const len = Math.hypot(dx, dy);
            if (len < 0.5) return;
            const nx = -dy / len;
            const ny = dx / len;
            const t = thickness / 2;

            // Wall fill
            ctx.beginPath();
            ctx.moveTo(p1.x + nx * t, p1.y + ny * t);
            ctx.lineTo(p2.x + nx * t, p2.y + ny * t);
            ctx.lineTo(p2.x - nx * t, p2.y - ny * t);
            ctx.lineTo(p1.x - nx * t, p1.y - ny * t);
            ctx.closePath();
            ctx.fillStyle = '#c8d8e8';
            ctx.fill();
            ctx.strokeStyle = '#e8f4ff';
            ctx.lineWidth = 1.5;
            ctx.stroke();
        });
    },

    _drawDoors(ctx) {
        const s = this.pixelsPerMeter * this.zoom;
        this.doors.forEach(d => {
            const sc = this.worldToScreen(d.x, d.y);
            const w = d.width * s;
            const angle = d.angle || 0;

            ctx.save();
            ctx.translate(sc.x, sc.y);
            ctx.rotate(angle);

            // Door opening gap (white)
            ctx.fillStyle = '#0a1628';
            ctx.fillRect(-w / 2, -4, w, 8);

            // Door panel
            ctx.strokeStyle = '#64a0ff';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(-w / 2, 0);
            ctx.lineTo(-w / 2 + w, 0);
            ctx.stroke();

            // Swing arc
            ctx.setLineDash([3, 3]);
            ctx.strokeStyle = 'rgba(100,160,255,0.6)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(-w / 2, 0, w, 0, Math.PI / 2);
            ctx.stroke();
            ctx.setLineDash([]);

            ctx.restore();
        });
    },

    _drawWindows(ctx) {
        const s = this.pixelsPerMeter * this.zoom;
        this.windows.forEach(win => {
            const sc = this.worldToScreen(win.x, win.y);
            const w = win.width * s;
            const angle = win.angle || 0;

            ctx.save();
            ctx.translate(sc.x, sc.y);
            ctx.rotate(angle);

            // Window opening
            ctx.fillStyle = '#0a1628';
            ctx.fillRect(-w / 2, -5, w, 10);

            // Window lines (3 lines = frame + glass)
            ctx.strokeStyle = '#64a0ff';
            ctx.lineWidth = 2;
            for (const oy of [-3, 0, 3]) {
                ctx.beginPath();
                ctx.moveTo(-w / 2, oy);
                ctx.lineTo(w / 2, oy);
                ctx.stroke();
            }

            ctx.restore();
        });
    },

    _drawColumns(ctx) {
        const s = this.pixelsPerMeter * this.zoom;
        this.columns.forEach(c => {
            const sc = this.worldToScreen(c.x, c.y);
            const size = c.size * s;

            ctx.fillStyle = '#c8d8e8';
            ctx.strokeStyle = '#e8f4ff';
            ctx.lineWidth = 1.5;

            if (c.shape === 'round') {
                ctx.beginPath();
                ctx.arc(sc.x, sc.y, size / 2, 0, Math.PI * 2);
                ctx.fill(); ctx.stroke();
            } else {
                ctx.fillRect(sc.x - size / 2, sc.y - size / 2, size, size);
                ctx.strokeRect(sc.x - size / 2, sc.y - size / 2, size, size);
                // X hatching
                ctx.strokeStyle = 'rgba(232,244,255,0.5)';
                ctx.lineWidth = 0.8;
                ctx.beginPath();
                ctx.moveTo(sc.x - size / 2, sc.y - size / 2);
                ctx.lineTo(sc.x + size / 2, sc.y + size / 2);
                ctx.moveTo(sc.x + size / 2, sc.y - size / 2);
                ctx.lineTo(sc.x - size / 2, sc.y + size / 2);
                ctx.stroke();
            }
        });
    },

    _drawStairs(ctx) {
        const s = this.pixelsPerMeter * this.zoom;
        this.stairs.forEach(st => {
            const sc = this.worldToScreen(st.x, st.y);
            const w = st.width * s;
            const l = st.length * s;
            const steps = Math.max(1, Math.floor(Number(st.steps) || 1));
            const stepH = l / steps;

            ctx.save();
            ctx.translate(sc.x, sc.y);
            ctx.rotate(st.angle || 0);

            // Steps
            ctx.strokeStyle = '#64a0ff';
            ctx.lineWidth = 1.5;
            for (let i = 0; i <= steps; i++) {
                const y = -l / 2 + i * stepH;
                ctx.beginPath();
                ctx.moveTo(-w / 2, y);
                ctx.lineTo(w / 2, y);
                ctx.stroke();
            }

            // Side lines
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(-w / 2, -l / 2); ctx.lineTo(-w / 2, l / 2);
            ctx.moveTo(w / 2, -l / 2);  ctx.lineTo(w / 2, l / 2);
            ctx.stroke();

            // Direction arrow
            ctx.strokeStyle = '#ff9f43';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([4, 2]);
            ctx.beginPath();
            ctx.moveTo(0, l / 2); ctx.lineTo(0, -l / 2);
            ctx.stroke();
            ctx.setLineDash([]);
            // Arrow head
            ctx.beginPath();
            ctx.moveTo(-6, -l / 2 + 10);
            ctx.lineTo(0, -l / 2);
            ctx.lineTo(6, -l / 2 + 10);
            ctx.stroke();

            ctx.restore();
        });
    },

    _drawLabels(ctx) {
        this.labels.forEach(lb => {
            const sc = this.worldToScreen(lb.x, lb.y);
            ctx.font = 'bold 20px Arial';
            ctx.fillStyle = '#e8f4ff';
            ctx.textAlign = 'center';
            ctx.fillText(lb.text.toUpperCase(), sc.x, sc.y);
            if (lb.subtitle) {
                ctx.font = `${Math.max(6, 10 * this.zoom)}px Arial`;
                ctx.fillStyle = 'rgba(200,220,255,0.7)';
                ctx.fillText(lb.subtitle, sc.x, sc.y + 14 * this.zoom);
            }
        });
    },

    _drawDimensions(ctx) {
        const s = this.pixelsPerMeter * this.zoom;
        this.dimensions.forEach(d => {
            const p1 = this.worldToScreen(d.p1.x, d.p1.y);
            const p2 = this.worldToScreen(d.p2.x, d.p2.y);
            const dist = Math.hypot(d.p2.x - d.p1.x, d.p2.y - d.p1.y).toFixed(2);
            const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };

            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const len = Math.hypot(dx, dy);
            if (len < 1e-6) return;

            const nx = -dy / len;
            const ny = dx / len;
            const offset = 20;

            ctx.strokeStyle = '#ff9f43';
            ctx.lineWidth = 1;
            // Main dim line
            ctx.beginPath();
            ctx.moveTo(p1.x + nx * offset, p1.y + ny * offset);
            ctx.lineTo(p2.x + nx * offset, p2.y + ny * offset);
            ctx.stroke();
            // Tick marks
            ctx.beginPath();
            ctx.moveTo(p1.x + nx * (offset - 6), p1.y + ny * (offset - 6));
            ctx.lineTo(p1.x + nx * (offset + 6), p1.y + ny * (offset + 6));
            ctx.moveTo(p2.x + nx * (offset - 6), p2.y + ny * (offset - 6));
            ctx.lineTo(p2.x + nx * (offset + 6), p2.y + ny * (offset + 6));
            ctx.stroke();
            // Label
            ctx.font = `${Math.max(7, 11 * this.zoom)}px Arial`;
            ctx.fillStyle = '#ff9f43';
            ctx.textAlign = 'center';
            ctx.fillText(`${dist}m`, mid.x + nx * (offset + 12), mid.y + ny * (offset + 12));
        });
    },

    _drawCursor(ctx, W, H) {
        const sc = this.worldToScreen(this.mouseWorld.x, this.mouseWorld.y);
        const snapped = this.snapToPoint(this.mouseWorld.x, this.mouseWorld.y);
        const ssc = this.worldToScreen(snapped.x, snapped.y);

        // Snap indicator
        ctx.strokeStyle = 'rgba(100,200,100,0.8)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(ssc.x, ssc.y, 5, 0, Math.PI * 2);
        ctx.stroke();

        // Crosshair
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.lineWidth = 0.5;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(sc.x, 0); ctx.lineTo(sc.x, H);
        ctx.moveTo(0, sc.y); ctx.lineTo(W, sc.y);
        ctx.stroke();
        ctx.setLineDash([]);
    },

    _drawStatusBar(ctx, W, H) {
        const mw = this.mouseWorld;
        const snapped = this.snapToGrid(mw.x, mw.y);
        const text = `X: ${snapped.x.toFixed(2)}m  Y: ${snapped.y.toFixed(2)}m  |  Zoom: ${(this.zoom * 100).toFixed(0)}%  |  Grid: ${this.gridSize.toFixed(2)}m`;

        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(0, H - 24, W, 24);
        ctx.font = '11px monospace';
        ctx.fillStyle = 'rgba(180,220,255,0.9)';
        ctx.textAlign = 'left';
        ctx.fillText(text, 10, H - 7);
    },

    clearAll() {
        this.walls = [];
        this.doors = [];
        this.windows = [];
        this.columns = [];
        this.stairs = [];
        this.labels = [];
        this.dimensions = [];
        this.render();
    },

    exportToJSON() {
        return JSON.stringify({
            walls: this.walls,
            doors: this.doors,
            windows: this.windows,
            columns: this.columns,
            stairs: this.stairs,
            labels: this.labels,
            dimensions: this.dimensions
        }, null, 2);
    },

    importFromJSON(json) {
        try {
            const data = JSON.parse(json);
            Object.assign(this, data);
            this.render();
        } catch (e) {
            console.error('[ArchCanvas] Import error:', e);
        }
    }
};

})();