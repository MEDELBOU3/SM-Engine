/**
 * 2D DRAFTING RENDERER (v7.0)
 * High-Performance HTML5 Canvas Renderer with Advanced Curve Tangents
 * Handles: Lines, Arcs, Splines, Smooth Curves, Tangents, Grid, Snapping, and Rubber-banding
 */
class TwoDProfileDrawer {
    constructor(modeler) {
        this.modeler = modeler;
        this.curveTangent = new AdvancedCurveTangent(modeler);
        
        // Professional CAD Visual Styles
        this.styles = {
            default: { stroke: '#6366f1', width: 2, fill: 'rgba(99, 102, 241, 0.05)' },
            selected: { stroke: '#00e5ff', width: 3, fill: 'rgba(0, 229, 255, 0.15)' },
            preview:  { stroke: '#4ade80', width: 1, dash: [5, 5] },
            grid:     { stroke: '#1e1e24', width: 1 },
            axis:     { stroke: '#333333', width: 2 },
            snap:     { stroke: '#facc15', width: 2 },
            tangent:  { stroke: '#ff6b6b', width: 1, dash: [3, 3] },
            controlPoint: { stroke: '#ffd700', width: 4 },
            controlPointSelected: { stroke: '#ff1493', width: 5 }
        };
        this.showTangents = true;
        this.showControlPoints = true;
    }

    /**
     * MAIN RENDER LOOP
     * Called whenever mouse moves or entities change
     */
    draw(ctx, viewName) {
        const vp = this.modeler.viewports.get(viewName);
        if (!vp) return;

        // 1. Clear & Setup Context
        ctx.clearRect(0, 0, vp.canvas.width, vp.canvas.height);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // 2. Draw Engineering Grid & Axis
        this.drawGrid(ctx, vp);

        // 3. Draw All Established Entities
        this.modeler.entities.forEach(ent => {
            const style = ent.selected ? this.styles.selected : this.styles.default;
            this.drawEntity(ctx, ent, viewName, style);
            
            // 3.5 Draw Tangent Vectors for Smooth Curves
            if (ent.selected && this.showTangents && (ent.type === 'spline' || ent.controlPoints)) {
                this.drawCurveTangents(ctx, ent, viewName);
            }
        });

        // 4. Draw Active Tool Preview (Rubber-banding)
        if (this.modeler.isDrawing) {
            this.drawPreview(ctx, viewName);
        }

        // 5. Draw Object Snap Indicators (Endpoints/Midpoints)
        this.drawSnapMarker(ctx, viewName);
    }

    /**
     * LOGIC: Renders specific geometric shapes based on Entity Type
     */
    drawEntity(ctx, ent, viewName, style) {
        ctx.beginPath();
        ctx.strokeStyle = style.stroke;
        ctx.lineWidth = style.width;
        ctx.setLineDash([]); // Reset dash

        if (ent.type === 'line') {
            const s1 = this.worldToScreen(ent.p1, viewName);
            const s2 = this.worldToScreen(ent.p2, viewName);
            ctx.moveTo(s1.x, s1.y);
            ctx.lineTo(s2.x, s2.y);
        
        } else if (ent.type === 'rect') {
            const s1 = this.worldToScreen(ent.p1, viewName);
            const s2 = this.worldToScreen(ent.p2, viewName);
            const w = s2.x - s1.x;
            const h = s2.y - s1.y;
            ctx.rect(s1.x, s1.y, w, h);
            ctx.fillStyle = style.fill;
            ctx.fill();

        } else if (ent.type === 'circle') {
            const c = this.worldToScreen(ent.center, viewName);
            // Calculate radius in Screen Pixels based on Zoom
            const r = ent.radius * this.modeler.worldScale * this.modeler.viewports.get(viewName).zoom;
            ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
            ctx.fillStyle = style.fill;
            ctx.fill();

        } else if (ent.type === 'arc') {
            const c = this.worldToScreen(ent.center, viewName);
            const r = ent.radius * this.modeler.worldScale * this.modeler.viewports.get(viewName).zoom;
            // Canvas Arcs are Counter-Clockwise
            ctx.arc(c.x, c.y, r, ent.startAngle, ent.endAngle);
        
        } else if (ent.type === 'spline' || (ent.controlPoints && ent.controlPoints.length > 0)) {
            // ENHANCED: Use Catmull-Rom Smooth Interpolation
            const controlPts = ent.controlPoints || (ent.points && ent.points.length > 0 ? ent.points : []);
            
            if (controlPts.length > 1) {
                // Generate smooth curve using Catmull-Rom interpolation
                const smoothPts = this.curveTangent.interpolateCatmullRom(controlPts, 50);
                
                if (smoothPts.length > 0) {
                    const start = this.worldToScreen(smoothPts[0], viewName);
                    ctx.moveTo(start.x, start.y);
                    
                    for (let i = 1; i < smoothPts.length; i++) {
                        const pt = this.worldToScreen(smoothPts[i], viewName);
                        ctx.lineTo(pt.x, pt.y);
                    }
                }
            }
        }

        ctx.stroke();
        
        // Draw control points for splines
        if ((ent.type === 'spline' || ent.controlPoints) && this.showControlPoints && ent.selected) {
            const controlPts = ent.controlPoints || ent.points || [];
            controlPts.forEach((pt, idx) => {
                const s = this.worldToScreen(pt, viewName);
                ctx.beginPath();
                ctx.fillStyle = this.styles.controlPoint.stroke;
                ctx.arc(s.x, s.y, 4, 0, Math.PI * 2);
                ctx.fill();
            });
        }
    }

    /**
     * LOGIC: Draws the temporary "Ghost" shape while dragging mouse
     */
    drawPreview(ctx, viewName) {
        const points = this.modeler.activePoints;
        const snap = this.modeler.snapResult;
        
        if (points.length === 0) return;

        ctx.beginPath();
        ctx.strokeStyle = this.styles.preview.stroke;
        ctx.lineWidth = this.styles.preview.width;
        ctx.setLineDash(this.styles.preview.dash);

        const start = this.worldToScreen(points[points.length-1], viewName);
        const mouse = this.worldToScreen(snap, viewName);

        // Tool-specific Preview Logic
        if (this.modeler.currentTool === 'rect') {
            const w = mouse.x - start.x;
            const h = mouse.y - start.y;
            ctx.strokeRect(start.x, start.y, w, h);
        } else if (this.modeler.currentTool === 'circle') {
            const r = Math.hypot(mouse.x - start.x, mouse.y - start.y);
            ctx.arc(start.x, start.y, r, 0, Math.PI*2);
        } else if (this.modeler.currentTool === 'line') {
            ctx.moveTo(start.x, start.y);
            ctx.lineTo(mouse.x, mouse.y);
        } else if (this.modeler.currentTool === 'spline') {
            // ENHANCED: Preview smooth curve as points are added
            const previewPts = [...points, snap];
            if (previewPts.length > 1) {
                const smoothPts = this.curveTangent.interpolateCatmullRom(previewPts, 30);
                const start = this.worldToScreen(smoothPts[0], viewName);
                ctx.moveTo(start.x, start.y);
                for (let i = 1; i < smoothPts.length; i++) {
                    const pt = this.worldToScreen(smoothPts[i], viewName);
                    ctx.lineTo(pt.x, pt.y);
                }
            }
        }
        
        ctx.stroke();
        ctx.setLineDash([]); // Reset dash for next frame
    }

    /**
     * LOGIC: Infinite Grid & Axis
     */
    drawGrid(ctx, vp) {
        // Calculate dynamic grid step based on zoom
        const step = this.modeler.settings.gridMinor * this.modeler.worldScale * vp.zoom;
        const cx = vp.canvas.width / 2 + vp.offset.x;
        const cy = vp.canvas.height / 2 + vp.offset.y;

        ctx.beginPath();
        ctx.strokeStyle = this.styles.grid.stroke;
        ctx.lineWidth = this.styles.grid.width;

        // Optimization: Draw only lines visible on screen
        const startX = (cx % step);
        const startY = (cy % step);

        for (let x = startX; x < vp.canvas.width; x += step) { 
            ctx.moveTo(x, 0); ctx.lineTo(x, vp.canvas.height); 
        }
        for (let y = startY; y < vp.canvas.height; y += step) { 
            ctx.moveTo(0, y); ctx.lineTo(vp.canvas.width, y); 
        }
        ctx.stroke();

        // Draw Major Axis (X/Y)
        ctx.beginPath();
        ctx.strokeStyle = this.styles.axis.stroke;
        ctx.lineWidth = this.styles.axis.width;
        ctx.moveTo(0, cy); ctx.lineTo(vp.canvas.width, cy); // X Axis
        ctx.moveTo(cx, 0); ctx.lineTo(cx, vp.canvas.height); // Y Axis
        ctx.stroke();
    }

    /**
     * LOGIC: Visual Feedback for Snapping (Endpoint/Midpoint)
     */
    drawSnapMarker(ctx, viewName) {
        const snap = this.modeler.snapResult;
        if (snap.type === 'none') return;

        const s = this.worldToScreen(snap, viewName);
        
        ctx.beginPath();
        ctx.lineWidth = 2;
        ctx.strokeStyle = this.styles.snap.stroke;
        
        // Different shapes for different snap types (AutoCAD style)
        if (snap.type === 'endpoint') {
            // Square for Endpoint
            ctx.strokeRect(s.x - 5, s.y - 5, 10, 10); 
        } else if (snap.type === 'midpoint') {
            // Triangle for Midpoint
            ctx.moveTo(s.x, s.y - 6); 
            ctx.lineTo(s.x - 5, s.y + 4); 
            ctx.lineTo(s.x + 5, s.y + 4); 
            ctx.closePath(); 
        } else if (snap.type === 'grid') {
            // Circle for Grid
            ctx.arc(s.x, s.y, 2, 0, Math.PI * 2); 
        }
        
        ctx.stroke();
    }

    // --- Helper: Bridge to Parent Modeler Coordinates ---
    worldToScreen(worldPt, viewName) {
        return this.modeler.worldToScreen(worldPt.x, worldPt.y, viewName);
    }

    /**
     * DRAW SMOOTH CURVE TANGENT VECTORS
     * Shows tangent direction and influence at each control point
     * Helps visualize how adjacent points affect the curve
     */
    drawCurveTangents(ctx, ent, viewName) {
        const controlPts = ent.controlPoints || ent.points || [];
        if (controlPts.length < 2) return;

        const tangentLength = 20; // Screen pixels
        const vp = this.modeler.viewports.get(viewName);
        const zoom = vp.zoom;

        controlPts.forEach((pt, idx) => {
            // Calculate tangent at this control point
            const tangent = this.curveTangent.calculateTangent(controlPts, idx);
            const screenPt = this.worldToScreen(pt, viewName);

            // Draw tangent vector
            ctx.beginPath();
            ctx.strokeStyle = this.styles.tangent.stroke;
            ctx.lineWidth = this.styles.tangent.width;
            ctx.setLineDash(this.styles.tangent.dash);

            const endX = screenPt.x + tangent.x * tangentLength;
            const endY = screenPt.y + tangent.y * tangentLength;

            ctx.moveTo(screenPt.x, screenPt.y);
            ctx.lineTo(endX, endY);
            ctx.stroke();

            // Draw arrowhead
            const arrowSize = 6;
            const angle = Math.atan2(tangent.y, tangent.x);
            ctx.beginPath();
            ctx.moveTo(endX, endY);
            ctx.lineTo(endX - arrowSize * Math.cos(angle - Math.PI / 6), endY - arrowSize * Math.sin(angle - Math.PI / 6));
            ctx.lineTo(endX - arrowSize * Math.cos(angle + Math.PI / 6), endY - arrowSize * Math.sin(angle + Math.PI / 6));
            ctx.closePath();
            ctx.fillStyle = this.styles.tangent.stroke;
            ctx.fill();

            // Draw influence zone (shows how far this point affects neighbors)
            ctx.beginPath();
            ctx.strokeStyle = 'rgba(255, 107, 107, 0.2)';
            ctx.lineWidth = 1;
            ctx.setLineDash([2, 2]);
            const influenceRadius = 30; // Screen pixels
            ctx.arc(screenPt.x, screenPt.y, influenceRadius, 0, Math.PI * 2);
            ctx.stroke();

            ctx.setLineDash([]);
        });
    }

    /**
     * TOGGLE TANGENT VISUALIZATION
     */
    toggleTangentDisplay() {
        this.showTangents = !this.showTangents;
        console.log(`Tangent display: ${this.showTangents ? 'ON' : 'OFF'}`);
    }

    /**
     * TOGGLE CONTROL POINT VISUALIZATION
     */
    toggleControlPointDisplay() {
        this.showControlPoints = !this.showControlPoints;
        console.log(`Control points display: ${this.showControlPoints ? 'ON' : 'OFF'}`);
    }
}

// Export
window.TwoDProfileDrawer = TwoDProfileDrawer;