/**
 * ArchDoorTool.js - Door Placement Tool
 * Click to place a door; it snaps to nearest wall
 */
"use strict";

(function() {

window.ArchDoorTool = {
    name: 'Door Tool',
    isActive: false,
    previewPos: null,
    width: 1.0,

    activate() {
        this.isActive = true;
        if (window.ArchCanvas) window.ArchCanvas.canvas.style.cursor = 'cell';
        window.ArchFloorPlanPanel?.setStatus?.('Door Tool: Click on a wall to place a door.');
    },

    deactivate() {
        this.isActive = false;
        this.previewPos = null;
    },

    _snapToWall(wx, wy) {
        const AC = window.ArchCanvas;
        let bestPoint = null;
        let bestAngle = 0;
        let minDist = 1.5;

        AC.walls.forEach(wall => {
            const dx = wall.p2.x - wall.p1.x;
            const dy = wall.p2.y - wall.p1.y;
            const len = Math.hypot(dx, dy);
            if (len < 0.1) return;
            const t = ((wx - wall.p1.x) * dx + (wy - wall.p1.y) * dy) / (len * len);
            const ct = Math.max(0, Math.min(1, t));
            const cx = wall.p1.x + ct * dx;
            const cy = wall.p1.y + ct * dy;
            const dist = Math.hypot(wx - cx, wy - cy);
            if (dist < minDist) {
                minDist = dist;
                bestPoint = { x: cx, y: cy };
                bestAngle = Math.atan2(dy, dx);
            }
        });

        return bestPoint ? { pos: bestPoint, angle: bestAngle } : null;
    },

    onMouseMove(worldPos) {
        if (!this.isActive) return;
        const snapped = this._snapToWall(worldPos.x, worldPos.y);
        this.previewPos = snapped;
    },

    onMouseDown(worldPos) {
        if (!this.isActive) return;
        const snapped = this._snapToWall(worldPos.x, worldPos.y);
        if (!snapped) {
            // Place at grid snap if no wall nearby
            const gs = window.ArchCanvas.snapToGrid(worldPos.x, worldPos.y);
            window.ArchCanvas.doors.push({ x: gs.x, y: gs.y, width: this.width, angle: 0, id: 'd_' + Date.now() });
        } else {
            window.ArchCanvas.doors.push({ x: snapped.pos.x, y: snapped.pos.y, width: this.width, angle: snapped.angle, id: 'd_' + Date.now() });
        }
        window.ArchCanvas.render();
    },

    onEscape() { window.ArchFloorPlanPanel?.setTool?.('select'); },

    draw(ctx) {
        if (!this.isActive || !this.previewPos) return;
        const AC = window.ArchCanvas;
        const sc = AC.worldToScreen(this.previewPos.pos.x, this.previewPos.pos.y);
        const s = AC.pixelsPerMeter * AC.zoom;
        const w = this.width * s;

        ctx.save();
        ctx.translate(sc.x, sc.y);
        ctx.rotate(this.previewPos.angle);

        ctx.strokeStyle = 'rgba(100, 255, 150, 0.7)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-w / 2, 0); ctx.lineTo(w / 2, 0);
        ctx.stroke();

        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = 'rgba(100, 200, 100, 0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(-w / 2, 0, w, 0, Math.PI / 2);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.restore();
    }
};

})();

/**
 * ArchWindowTool.js - Window Placement Tool
 */
(function() {

window.ArchWindowTool = {
    name: 'Window Tool',
    isActive: false,
    previewPos: null,
    width: 1.2,

    activate() {
        this.isActive = true;
        if (window.ArchCanvas) window.ArchCanvas.canvas.style.cursor = 'cell';
        window.ArchFloorPlanPanel?.setStatus?.('Window Tool: Click on a wall to place a window.');
    },

    deactivate() { this.isActive = false; this.previewPos = null; },

    _snapToWall(wx, wy) {
        const AC = window.ArchCanvas;
        let bestPoint = null;
        let bestAngle = 0;
        let minDist = 1.5;
        AC.walls.forEach(wall => {
            const dx = wall.p2.x - wall.p1.x;
            const dy = wall.p2.y - wall.p1.y;
            const len = Math.hypot(dx, dy);
            if (len < 0.1) return;
            const t = Math.max(0, Math.min(1, ((wx - wall.p1.x) * dx + (wy - wall.p1.y) * dy) / (len * len)));
            const cx = wall.p1.x + t * dx;
            const cy = wall.p1.y + t * dy;
            const dist = Math.hypot(wx - cx, wy - cy);
            if (dist < minDist) { minDist = dist; bestPoint = { x: cx, y: cy }; bestAngle = Math.atan2(dy, dx); }
        });
        return bestPoint ? { pos: bestPoint, angle: bestAngle } : null;
    },

    onMouseMove(worldPos) {
        if (!this.isActive) return;
        this.previewPos = this._snapToWall(worldPos.x, worldPos.y);
    },

    onMouseDown(worldPos) {
        if (!this.isActive) return;
        const snapped = this._snapToWall(worldPos.x, worldPos.y) || { pos: window.ArchCanvas.snapToGrid(worldPos.x, worldPos.y), angle: 0 };
        window.ArchCanvas.windows.push({ x: snapped.pos.x, y: snapped.pos.y, width: this.width, angle: snapped.angle, id: 'win_' + Date.now() });
        window.ArchCanvas.render();
    },

    onEscape() { window.ArchFloorPlanPanel?.setTool?.('select'); },

    draw(ctx) {
        if (!this.isActive || !this.previewPos) return;
        const AC = window.ArchCanvas;
        const sc = AC.worldToScreen(this.previewPos.pos.x, this.previewPos.pos.y);
        const s = AC.pixelsPerMeter * AC.zoom;
        const w = this.width * s;

        ctx.save();
        ctx.translate(sc.x, sc.y);
        ctx.rotate(this.previewPos.angle);
        ctx.strokeStyle = 'rgba(100,200,255,0.8)';
        ctx.lineWidth = 2;
        for (const oy of [-3, 0, 3]) {
            ctx.beginPath();
            ctx.moveTo(-w / 2, oy); ctx.lineTo(w / 2, oy);
            ctx.stroke();
        }
        ctx.restore();
    }
};

})();
