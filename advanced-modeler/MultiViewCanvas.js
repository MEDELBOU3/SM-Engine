/**
 * MULTI-VIEW CANVAS ENGINE (v6.0)
 * Handles: Viewport Management, High-DPI Rendering, Adaptive Grids, Coordinate Systems
 */
class MultiViewCanvas {
    constructor(modeler) {
        this.modeler = modeler;
        
        // Store viewport states (Canvas, Context, Pan/Zoom)
        this.views = {
            front: { axis: 'xy', zoom: 1.0, pan: { x: 0, y: 0 }, label: 'FRONT' },
            top:   { axis: 'xz', zoom: 1.0, pan: { x: 0, y: 0 }, label: 'TOP' },
            right: { axis: 'yz', zoom: 1.0, pan: { x: 0, y: 0 }, label: 'RIGHT' }
        };

        // Industrial Colors
        this.colors = {
            bg: '#0a0a0c',
            gridMajor: '#2d2d3a',
            gridMinor: '#16161e',
            axisX: '#ef4444', // Red
            axisY: '#22c55e', // Green
            text: '#64748b'
        };

        this.initCanvases();
    }

    /**
     * Initialize DOM elements and Contexts with High-DPI support
     */
    initCanvases() {
        Object.keys(this.views).forEach(viewId => {
            const canvas = document.getElementById(`am-2d-${viewId}`);
            if (!canvas) return;

            const ctx = canvas.getContext('2d', { alpha: false }); // Optimization
            this.views[viewId].canvas = canvas;
            this.views[viewId].ctx = ctx;

            // Attach Events
            this.attachEvents(canvas, viewId);
        });
        
        // Initial Resize
        this.resizeAll();
    }

    /**
     * Handle Window Resizing with Pixel Ratio correction
     */
    resizeAll() {
        const dpr = window.devicePixelRatio || 1;
        
        Object.keys(this.views).forEach(viewId => {
            const vp = this.views[viewId];
            if(!vp.canvas) return;

            const rect = vp.canvas.parentElement.getBoundingClientRect();
            
            // Set actual backing store size
            vp.canvas.width = rect.width * dpr;
            vp.canvas.height = rect.height * dpr;
            
            // Normalize coordinate system to CSS pixels
            vp.ctx.scale(dpr, dpr);
            
            // Store logical size for calculations
            vp.width = rect.width;
            vp.height = rect.height;
        });
        
        this.redrawAll();
    }

    /**
     * Mouse & Wheel Event Handlers (Pan/Zoom)
     */
    attachEvents(canvas, viewId) {
        let isPanning = false;
        let lastPos = { x: 0, y: 0 };

        // Mouse Wheel (Zoom)
        canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            const vp = this.views[viewId];
            
            // Zoom towards mouse pointer logic
            const rect = canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            // Calculate world point before zoom
            const wx = (mouseX - vp.width/2 - vp.pan.x) / vp.zoom;
            const wy = (mouseY - vp.height/2 - vp.pan.y) / vp.zoom;

            // Apply Zoom
            const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
            vp.zoom *= zoomFactor;
            vp.zoom = Math.max(0.1, Math.min(50, vp.zoom)); // Clamp

            // Compensate Pan to keep mouse steady
            vp.pan.x = mouseX - vp.width/2 - wx * vp.zoom;
            vp.pan.y = mouseY - vp.height/2 - wy * vp.zoom;

            this.modeler.renderAll(); // Request re-render from parent
        }, { passive: false });

        // Middle Mouse / Space+Drag (Pan)
        canvas.addEventListener('mousedown', (e) => {
            if (e.button === 1 || e.shiftKey) { // Middle click or Shift+Click
                isPanning = true;
                lastPos = { x: e.clientX, y: e.clientY };
                canvas.style.cursor = 'grabbing';
            } else {
                // Delegate draw events to parent modeler
                this.modeler.onCanvasMouseDown(e, viewId);
            }
        });

        window.addEventListener('mousemove', (e) => {
            if (isPanning) {
                const vp = this.views[viewId];
                const dx = e.clientX - lastPos.x;
                const dy = e.clientY - lastPos.y;
                vp.pan.x += dx;
                vp.pan.y += dy;
                lastPos = { x: e.clientX, y: e.clientY };
                this.redrawAll();
            } else {
                // Delegate draw move
                if(e.target === canvas) this.modeler.onCanvasMouseMove(e, viewId);
            }
        });

        window.addEventListener('mouseup', (e) => {
            if (isPanning) {
                isPanning = false;
                canvas.style.cursor = 'default';
            } else {
                // Delegate draw up
                if(e.target === canvas) this.modeler.onCanvasMouseUp(e, viewId);
            }
        });
    }

    /**
     * MAIN RENDER PIPELINE
     */
    redrawAll() {
        Object.keys(this.views).forEach(viewId => this.renderView(viewId));
    }

    renderView(viewId) {
        const vp = this.views[viewId];
        if (!vp.ctx) return;

        const ctx = vp.ctx;

        // 1. Clear Screen
        ctx.fillStyle = this.colors.bg;
        ctx.fillRect(0, 0, vp.width, vp.height);

        // 2. Apply Transformations (Center Origin)
        ctx.save();
        ctx.translate(vp.width / 2 + vp.pan.x, vp.height / 2 + vp.pan.y);
        
        // 3. Draw Infinite Adaptive Grid
        this.drawAdaptiveGrid(ctx, vp);

        // 4. Draw Origin Axis
        this.drawAxis(ctx, vp);

        // 5. Delegate Entity Drawing to Parent Modeler
        // Pass the context and view ID so the Modeler knows where to draw
        if (this.modeler && this.modeler.drawEntities) {
            this.modeler.drawEntities(ctx, viewId, vp); 
        }

        ctx.restore();

        // 6. Draw HUD (View Label) - Non-transformed
        this.drawHUD(ctx, vp);
    }

    /**
     * PRO FEATURE: Adaptive Infinite Grid
     * Fades grid lines in/out based on zoom level (LOD)
     */
    drawAdaptiveGrid(ctx, vp) {
        const zoom = vp.zoom;
        const worldScale = this.modeler.worldScale || 100;
        
        // Calculate grid spacing based on zoom
        // If we zoom out, we switch from 0.1m to 1m to 10m grids
        let baseStep = 1.0; // 1 meter
        if (zoom > 2.0) baseStep = 0.1;
        if (zoom > 10.0) baseStep = 0.05;
        if (zoom < 0.5) baseStep = 10.0;

        const step = baseStep * worldScale * zoom;
        
        // Viewport boundaries in Local transform space
        const left = -(vp.width / 2 + vp.pan.x);
        const top = -(vp.height / 2 + vp.pan.y);
        const right = left + vp.width;
        const bottom = top + vp.height;

        // Snap start to grid
        const startX = Math.floor(left / step) * step;
        const startY = Math.floor(top / step) * step;

        ctx.lineWidth = 1;

        // Render Grid
        ctx.beginPath();
        
        for (let x = startX; x < right; x += step) {
            ctx.moveTo(x, top);
            ctx.lineTo(x, bottom);
        }
        for (let y = startY; y < bottom; y += step) {
            ctx.moveTo(left, y);
            ctx.lineTo(right, y);
        }

        // Determine opacity based on "perfect" zoom levels
        ctx.strokeStyle = (baseStep >= 1.0) ? this.colors.gridMajor : this.colors.gridMinor;
        ctx.stroke();
    }

    /**
     * Draw X/Y Axis Lines
     */
    drawAxis(ctx, vp) {
        const len = 10000; // Effectively infinite
        ctx.lineWidth = 1.5;

        // X Axis (Red)
        ctx.beginPath();
        ctx.strokeStyle = this.colors.axisX;
        ctx.moveTo(-len, 0); ctx.lineTo(len, 0);
        ctx.stroke();

        // Y Axis (Green)
        ctx.beginPath();
        ctx.strokeStyle = this.colors.axisY;
        ctx.moveTo(0, -len); ctx.lineTo(0, len);
        ctx.stroke();
    }

    /**
     * Draw Viewport Label (HUD)
     */
    drawHUD(ctx, vp) {
        ctx.font = 'bold 10px Inter, sans-serif';
        ctx.fillStyle = this.colors.text;
        ctx.fillText(vp.label, 10, 15);
        
        // Scale Indicator
        ctx.textAlign = 'right';
        ctx.fillText(`ZOOM: ${(vp.zoom * 100).toFixed(0)}%`, vp.width - 10, 15);
        ctx.textAlign = 'left';
    }

    // --- Helpers for Parent Classes ---

    /**
     * Convert Screen Pixel (Mouse) -> World Coordinate
     */
    screenToWorld(px, py, viewId) {
        const vp = this.views[viewId];
        // 1. Remove Center Offset
        let lx = px - vp.width / 2;
        let ly = py - vp.height / 2;
        
        // 2. Remove Pan
        lx -= vp.pan.x;
        ly -= vp.pan.y;

        // 3. Remove Zoom & WorldScale
        const ws = this.modeler.worldScale || 100;
        const wx = lx / (vp.zoom * ws);
        const wy = -ly / (vp.zoom * ws); // Flip Y for CAD standard (Up is Positive)

        return { x: wx, y: wy };
    }

    /**
     * Convert World Coordinate -> Screen Pixel
     */
    worldToScreen(wx, wy, viewId) {
        const vp = this.views[viewId];
        const ws = this.modeler.worldScale || 100;

        // 1. Scale
        let lx = wx * ws * vp.zoom;
        let ly = -wy * ws * vp.zoom; // Flip Y

        // 2. Add Pan (This creates the illusion of moving the camera)
        // Note: We don't add pan here if the context is already translated!
        // But for "Rubber banding" overlay which might be drawn on top, we need raw coords.
        // Assuming this is used for raw coordinate calculation:
        
        return {
            x: lx, // Context handles Pan/Center via ctx.translate
            y: ly
        };
    }
}

// Export
window.MultiViewCanvas = MultiViewCanvas;