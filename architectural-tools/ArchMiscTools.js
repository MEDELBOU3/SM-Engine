/**
 * ArchColumnTool.js - Column Placement Tool
 */
"use strict";

(function() {

window.ArchColumnTool = {
    name: 'Column Tool',
    isActive: false,
    previewPos: null,
    size: 0.4,
    shape: 'square',

    activate() {
        this.isActive = true;
        if (window.ArchCanvas) window.ArchCanvas.canvas.style.cursor = 'cell';
        window.ArchFloorPlanPanel?.setStatus?.('Column Tool: Click to place a column. Shape: ' + this.shape);
    },

    deactivate() { this.isActive = false; this.previewPos = null; },

    onMouseMove(worldPos) {
        if (!this.isActive) return;
        this.previewPos = window.ArchCanvas.snapToGrid(worldPos.x, worldPos.y);
    },

    onMouseDown(worldPos) {
        if (!this.isActive) return;
        const p = window.ArchCanvas.snapToGrid(worldPos.x, worldPos.y);
        window.ArchCanvas.columns.push({ x: p.x, y: p.y, size: this.size, shape: this.shape, id: 'col_' + Date.now() });
        window.ArchCanvas.render();
    },

    onEscape() { window.ArchFloorPlanPanel?.setTool?.('select'); },

    draw(ctx) {
        if (!this.isActive || !this.previewPos) return;
        const AC = window.ArchCanvas;
        const sc = AC.worldToScreen(this.previewPos.x, this.previewPos.y);
        const s = AC.pixelsPerMeter * AC.zoom;
        const size = this.size * s;

        ctx.strokeStyle = 'rgba(100,255,150,0.7)';
        ctx.lineWidth = 2;
        ctx.fillStyle = 'rgba(200,220,255,0.25)';

        if (this.shape === 'round') {
            ctx.beginPath();
            ctx.arc(sc.x, sc.y, size / 2, 0, Math.PI * 2);
            ctx.fill(); ctx.stroke();
        } else {
            ctx.fillRect(sc.x - size/2, sc.y - size/2, size, size);
            ctx.strokeRect(sc.x - size/2, sc.y - size/2, size, size);
        }
    }
};

})();

/**
 * ArchStairTool.js - Staircase Placement Tool
 */
(function() {

window.ArchStairTool = {
    name: 'Stair Tool',
    isActive: false,
    previewPos: null,
    width: 1.2,
    length: 3.0,
    steps: 10,
    angle: 0,

    activate() {
        this.isActive = true;
        if (window.ArchCanvas) window.ArchCanvas.canvas.style.cursor = 'cell';
        window.ArchFloorPlanPanel?.setStatus?.('Stair Tool: Click to place stairs. Rotate with R key.');
    },

    deactivate() { this.isActive = false; this.previewPos = null; },

    onMouseMove(worldPos) {
        if (!this.isActive) return;
        this.previewPos = window.ArchCanvas.snapToGrid(worldPos.x, worldPos.y);
    },

    onMouseDown(worldPos) {
        if (!this.isActive) return;
        const p = window.ArchCanvas.snapToGrid(worldPos.x, worldPos.y);
        window.ArchCanvas.stairs.push({
            x: p.x, y: p.y,
            width: this.width,
            length: this.length,
            steps: this.steps,
            angle: this.angle,
            id: 'st_' + Date.now()
        });
        window.ArchCanvas.render();
    },

    onEscape() { window.ArchFloorPlanPanel?.setTool?.('select'); },

    draw(ctx) {
        if (!this.isActive || !this.previewPos) return;
        const AC = window.ArchCanvas;
        const sc = AC.worldToScreen(this.previewPos.x, this.previewPos.y);
        const s = AC.pixelsPerMeter * AC.zoom;
        const w = this.width * s;
        const l = this.length * s;
        const stepH = l / this.steps;

        ctx.save();
        ctx.translate(sc.x, sc.y);
        ctx.rotate(this.angle);
        ctx.globalAlpha = 0.6;
        ctx.strokeStyle = '#64a0ff';
        ctx.lineWidth = 1.5;
        for (let i = 0; i <= this.steps; i++) {
            const y = -l/2 + i * stepH;
            ctx.beginPath();
            ctx.moveTo(-w/2, y); ctx.lineTo(w/2, y);
            ctx.stroke();
        }
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-w/2, -l/2); ctx.lineTo(-w/2, l/2);
        ctx.moveTo(w/2, -l/2); ctx.lineTo(w/2, l/2);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.restore();
    }
};

})();

/**
 * ArchLabelTool.js - Room Label Tool
 */
(function() {

window.ArchLabelTool = {
    name: 'Label Tool',
    isActive: false,
    previewPos: null,
    currentText: 'ROOM',
    currentSubtitle: '',

    activate() {
        this.isActive = true;
        if (window.ArchCanvas) window.ArchCanvas.canvas.style.cursor = 'text';
        window.ArchFloorPlanPanel?.setStatus?.('Label Tool: Click to place a room label.');
    },

    deactivate() { this.isActive = false; this.previewPos = null; },

    onMouseMove(worldPos) {
        if (!this.isActive) return;
        this.previewPos = window.ArchCanvas.snapToGrid(worldPos.x, worldPos.y);
    },

    onMouseDown(worldPos) {
        if (!this.isActive) return;
        const p = window.ArchCanvas.snapToGrid(worldPos.x, worldPos.y);
        const text = window.ArchFloorPlanPanel?._getLabelText?.() || this.currentText;
        const subtitle = window.ArchFloorPlanPanel?._getLabelSubtitle?.() || this.currentSubtitle;
        window.ArchCanvas.labels.push({ x: p.x, y: p.y, text, subtitle, id: 'lbl_' + Date.now() });
        window.ArchCanvas.render();
    },

    onEscape() { window.ArchFloorPlanPanel?.setTool?.('select'); },

    draw(ctx) {
        if (!this.isActive || !this.previewPos) return;
        const AC = window.ArchCanvas;
        const sc = AC.worldToScreen(this.previewPos.x, this.previewPos.y);
        ctx.globalAlpha = 0.5;
        ctx.font = 'bold 14px Arial';
        ctx.fillStyle = '#e8f4ff';
        ctx.textAlign = 'center';
        ctx.fillText(this.currentText.toUpperCase(), sc.x, sc.y);
        ctx.globalAlpha = 1;
    }
};

})();

/**
 * ArchDimensionTool.js - Dimension/Measurement Tool
 */
(function() {

window.ArchDimensionTool = {
    name: 'Dimension Tool',
    isActive: false,
    startPoint: null,
    previewPoint: null,

    activate() {
        this.isActive = true;
        this.startPoint = null;
        if (window.ArchCanvas) window.ArchCanvas.canvas.style.cursor = 'crosshair';
        window.ArchFloorPlanPanel?.setStatus?.('Dimension Tool: Click first point, then second point to measure.');
    },

    deactivate() { this.isActive = false; this.startPoint = null; this.previewPoint = null; },

    onMouseMove(worldPos) {
        if (!this.isActive) return;
        this.previewPoint = window.ArchCanvas.snapToPoint(worldPos.x, worldPos.y);
    },

    onMouseDown(worldPos) {
        if (!this.isActive) return;
        const p = window.ArchCanvas.snapToPoint(worldPos.x, worldPos.y);
        if (!this.startPoint) {
            this.startPoint = p;
        } else {
            window.ArchCanvas.dimensions.push({
                p1: { x: this.startPoint.x, y: this.startPoint.y },
                p2: { x: p.x, y: p.y },
                id: 'dim_' + Date.now()
            });
            this.startPoint = null;
            window.ArchCanvas.render();
        }
    },

    onEscape() { this.startPoint = null; window.ArchFloorPlanPanel?.setTool?.('select'); },

    draw(ctx) {
        if (!this.isActive || !this.startPoint || !this.previewPoint) return;
        const AC = window.ArchCanvas;
        const p1 = AC.worldToScreen(this.startPoint.x, this.startPoint.y);
        const p2 = AC.worldToScreen(this.previewPoint.x, this.previewPoint.y);
        const dist = Math.hypot(this.previewPoint.x - this.startPoint.x, this.previewPoint.y - this.startPoint.y);

        ctx.strokeStyle = '#ff9f43';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
        ctx.setLineDash([]);

        const mid = { x: (p1.x+p2.x)/2, y: (p1.y+p2.y)/2 };
        ctx.font = 'bold 12px monospace';
        ctx.fillStyle = '#ff9f43';
        ctx.textAlign = 'center';
        ctx.fillText(dist.toFixed(2) + 'm', mid.x, mid.y - 8);

        ctx.beginPath();
        ctx.arc(p1.x, p1.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#ff9f43'; ctx.fill();
    }
};

})();
