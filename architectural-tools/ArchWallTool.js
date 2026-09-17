/**
 * ArchWallTool.js - Interactive Wall Drawing Tool
 * Click to start, click to continue chain, Escape/double-click to end
 */
"use strict";

(function() {

window.ArchWallTool = {
    name: 'Wall Tool',
    points: [],
    previewPoint: null,
    isActive: false,
    thickness: 0.2,

    activate() {
        this.isActive = true;
        this.points = [];
        if (window.ArchCanvas) window.ArchCanvas.canvas.style.cursor = 'crosshair';
        ArchFloorPlanPanel?.setStatus?.('Wall Tool: Click to start drawing. Double-click or Esc to finish.');
    },

    deactivate() {
        this.isActive = false;
        this.points = [];
        this.previewPoint = null;
    },

    onMouseMove(worldPos) {
        if (!this.isActive) return;
        const AC = window.ArchCanvas;
        this.previewPoint = AC.snapToPoint(worldPos.x, worldPos.y);
    },

    onMouseDown(worldPos) {
        if (!this.isActive) return;
        const AC = window.ArchCanvas;
        const snapped = AC.snapToPoint(worldPos.x, worldPos.y);

        if (this.points.length > 0) {
            const last = this.points[this.points.length - 1];
            const dist = Math.hypot(snapped.x - last.x, snapped.y - last.y);
            if (dist < 0.05) return; // too close

            // Add wall segment
            AC.walls.push({
                p1: { x: last.x, y: last.y },
                p2: { x: snapped.x, y: snapped.y },
                thickness: this.thickness,
                id: 'w_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4)
            });
        }

        this.points.push({ x: snapped.x, y: snapped.y });
        AC.render();
    },

    onDblClick() {
        this.finish();
    },

    onEscape() {
        // Remove last segment if exists
        if (this.points.length > 1) {
            window.ArchCanvas?.walls.pop();
        }
        this.finish();
    },

    finish() {
        this.points = [];
        this.previewPoint = null;
        window.ArchCanvas?.render();
        ArchFloorPlanPanel?.setStatus?.('Wall Tool: Click to start a new wall chain.');
    },

    draw(ctx) {
        if (!this.isActive || this.points.length === 0 || !this.previewPoint) return;
        const AC = window.ArchCanvas;
        const last = this.points[this.points.length - 1];
        const p1 = AC.worldToScreen(last.x, last.y);
        const p2 = AC.worldToScreen(this.previewPoint.x, this.previewPoint.y);
        const s = AC.pixelsPerMeter * AC.zoom;
        const thickness = this.thickness * s;

        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const len = Math.hypot(dx, dy);
        if (len < 1) return;

        const nx = -dy / len;
        const ny = dx / len;
        const t = thickness / 2;

        // Preview wall (semi-transparent)
        ctx.beginPath();
        ctx.moveTo(p1.x + nx * t, p1.y + ny * t);
        ctx.lineTo(p2.x + nx * t, p2.y + ny * t);
        ctx.lineTo(p2.x - nx * t, p2.y - ny * t);
        ctx.lineTo(p1.x - nx * t, p1.y - ny * t);
        ctx.closePath();
        ctx.fillStyle = 'rgba(200, 220, 255, 0.35)';
        ctx.fill();
        ctx.strokeStyle = '#64a0ff';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 3]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Length label
        const dist = Math.hypot(this.previewPoint.x - last.x, this.previewPoint.y - last.y);
        const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
        ctx.font = 'bold 12px monospace';
        ctx.fillStyle = '#64ffb4';
        ctx.textAlign = 'center';
        ctx.fillText(dist.toFixed(2) + 'm', mid.x, mid.y - 8);

        // Dot at start
        ctx.beginPath();
        ctx.arc(p1.x, p1.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#ff9f43';
        ctx.fill();
    }
};

})();
