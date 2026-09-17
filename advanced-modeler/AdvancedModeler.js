/**
 * INDUSTRIAL CAD ENGINE (v5.0) - "MAX-PRO"
 * Entity-Based Drafting & Parametric Modifier Stack
 * Advanced Tools: Arc, Polygon, Spline, Fillet, Offset, Trim, Mirror, Array
 */
class AdvancedModeler {
    constructor(scene, camera, renderer) {
        this.scene = scene;
        this.camera = camera;
        this.renderer = renderer;

        // --- CAD Workspace Settings ---
        this.worldScale = 100; // 1m = 100px
        this.units = 'meters';
        this.precision = 3;

        // --- State Management ---
        this.isActive = false;
        this.isDrawing = false;
        this.currentTool = 'line'; // line, rect, circle, arc, fillet, polygon, spline, offset, trim, mirror, array
        this.selectionMode = false;
        this.selectedEntities = [];

        // --- Geometry Data ---
        this.entities = []; // Array of {type, p1, p2, radius, etc}
        this.activePoints = []; // Temporary points for current drawing
        this.current3DObject = null;

        // --- Viewport Control ---
        this.viewports = new Map();
        this.views = ['front', 'top', 'right'];
        this.snapResult = { x: 0, y: 0, type: 'none' };

        this.settings = {
            gridMinor: 0.1,
            gridMajor: 1.0,
            snapTolerance: 15,
            snapToGrid: true,
            extrusionLength: 2.5,
            bevel: 0.02,
            segments: 1,
            filletRadius: 0.1,
            offsetDistance: 0.2,
            polygonSides: 6,
            arrayCount: 4,
            arraySpacing: 1.0
        };

        this.initialize();
    }

    /*async initialize() {
        this.createModal();
        this.initViewports();
        this.setupEventListeners();
    }*/ 

    initialize() {
        console.log("⚙️ Starting Advanced Modeler initialization...");
        
        try {
            this.createModal();
            this.initViewports();
            this.setupEventListeners();
            console.log("✅ Advanced Modeler initialized successfully");
        } catch (e) {
            console.error("❌ Initialization failed:", e);
        }
    }

    /*
    createModal() {
        if (document.getElementById('advanced-modeler-modal')) {
            console.log('ℹ️ Modal already exists, reusing');
            this.modal = document.getElementById('advanced-modeler-modal');
            return;
        }
        const modal = document.createElement('div');
        modal.id = 'advanced-modeler-modal';
        modal.className = 'advanced-modeler-modal';
        modal.innerHTML = `
            <div class="am-modal-overlay"></div>
            <div class="am-modal-content">
                <div class="am-modal-header">
                    <h2>CAD ENGINE v5.0 | INDUSTRIAL</h2>
                    <div id="am-coordinate-hud">X: 0.000 | Y: 0.000 | SNAP: NONE</div>
                    <button class="am-close-btn">&times;</button>
                </div>
                <div class="am-modal-body">
                    <div class="am-canvas-container">
                        <div id="am-view-container" class="am-view-container multi-view">
                            <div class="am-canvas-view"><div class="am-canvas-label">FRONT (XY)</div><canvas id="am-2d-front"></canvas></div>
                            <div class="am-canvas-view"><div class="am-canvas-label">TOP (XZ)</div><canvas id="am-2d-top"></canvas></div>
                            <div class="am-canvas-view"><div class="am-canvas-label">RIGHT (YZ)</div><canvas id="am-2d-right"></canvas></div>
                            <div class="am-canvas-view am-3d-preview"><div class="am-canvas-label">3D PERSPECTIVE</div><div id="am-3d-preview"></div></div>
                        </div>
                    </div>
                </div>

                <div class="am-modal-sidebar">
    
                 <!-- DRAW TOOLS -->
                <div class="am-panel">
                    <div class="am-panel-header">Draw</div>
                    <div class="am-panel-content">
                        <div class="am-tool-group">
                            <button class="am-tool-btn active" id="btn-line">LINE</button>
                            <button class="am-tool-btn" id="btn-rect">RECT</button>
                            <button class="am-tool-btn" id="btn-circle">CIRCLE</button>
                            <button class="am-tool-btn" id="btn-arc">ARC</button> 
                            <button class="am-tool-btn" id="btn-poly">POLY</button>
                            <button class="am-tool-btn" id="btn-spline">SPLINE</button>
                        </div>
                    </div>
                </div>

                <!-- EDIT TOOLS -->
                <div class="am-panel">
                    <div class="am-panel-header">Edit</div>
                    <div class="am-panel-content">
                        <div class="am-tool-group">
                            <button class="am-tool-btn" id="btn-fillet">FILLET</button>
                            <button class="am-tool-btn" id="btn-offset">OFFSET</button>
                            <button class="am-tool-btn" id="btn-trim">TRIM</button> <!-- NEW -->
                            <button class="am-tool-btn" id="btn-mirror">MIRROR</button>
                            <button class="am-tool-btn" id="btn-select" style="grid-column: span 2">SELECT</button>
                        </div>
                    </div>
                </div>

                <!-- 3D OPERATIONS -->
                <div class="am-panel">
                    <div class="am-panel-header">3D Generation</div>
                    <div class="am-panel-content">
                        <div class="am-control-group">
                            <label>Operation</label>
                            <select id="am-3d-op">
                               <option value="extrude">Extrude</option>
                               <option value="revolve">Revolve (Lathe)</option>
                               <option value="loft">Loft (Bridge)</option>
                            </select>
                        </div>
            
                        <!-- Dynamic Inputs based on 3D Op -->
                        <div id="settings-3d-extrude">
                            <div class="am-control-group">
                                <label>Height</label>
                                <input type="number" id="am-ext-height" value="2.5" step="0.1">
                            </div>
                        </div>

                        <div id="settings-3d-revolve" style="display:none">
                            <div class="am-control-group">
                               <label>Segments</label>
                               <input type="number" id="am-rev-seg" value="32">
                            </div>
                        </div>
  
                        <button class="am-btn-action" id="am-build-btn">BUILD 3D</button>
                    </div>
                </div>
            </div>
        </div>`;
        document.body.appendChild(modal);
        this.modal = modal;
        console.log('✅ Modal created and appended to body');
        console.log('Modal element:', this.modal);
        console.log('Modal in DOM:', document.getElementById('advanced-modeler-modal') !== null);
    }*/

 
        createModal() {
        let modal = document.getElementById('advanced-modeler-modal');
        
        // 1. Create if it doesn't exist
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'advanced-modeler-modal';
            modal.className = 'advanced-modeler-modal';
            document.body.appendChild(modal);
        }

        // 2. ALWAYS inject the HTML content to ensure canvases exist
        // (We use innerHTML to overwrite/ensure content is correct)
        modal.innerHTML = `
            <div class="am-modal-overlay"></div>
            <div class="am-modal-content">
                <div class="am-modal-header">
                    <h2>CAD ENGINE v5.0 | INDUSTRIAL</h2>
                    <div id="am-coordinate-hud">X: 0.000 | Y: 0.000 | SNAP: NONE</div>
                    <button class="am-close-btn">&times;</button>
                </div>
                <div class="am-modal-body">
                    <div class="am-canvas-container">
                        <div id="am-view-container" class="am-view-container multi-view">
                            <div class="am-canvas-view"><div class="am-canvas-label">FRONT (XY)</div><canvas id="am-2d-front"></canvas></div>
                            <div class="am-canvas-view"><div class="am-canvas-label">TOP (XZ)</div><canvas id="am-2d-top"></canvas></div>
                            <div class="am-canvas-view"><div class="am-canvas-label">RIGHT (YZ)</div><canvas id="am-2d-right"></canvas></div>
                            <div class="am-canvas-view am-3d-preview"><div class="am-canvas-label">3D PERSPECTIVE</div><div id="am-3d-preview"></div></div>
                        </div>
                    </div>
                </div>

                <div class="am-modal-sidebar">
                    <!-- DRAW TOOLS -->
                    <div class="am-panel">
                        <div class="am-panel-header">Draw</div>
                        <div class="am-panel-content">
                            <div class="am-tool-group">
                                <button class="am-tool-btn active" id="btn-line">LINE</button>
                                <button class="am-tool-btn" id="btn-rect">RECT</button>
                                <button class="am-tool-btn" id="btn-circle">CIRCLE</button>
                                <button class="am-tool-btn" id="btn-arc">ARC</button> 
                                <button class="am-tool-btn" id="btn-poly">POLY</button>
                                <button class="am-tool-btn" id="btn-spline">SPLINE</button>
                            </div>
                        </div>
                    </div>

                    <!-- EDIT TOOLS -->
                    <div class="am-panel">
                        <div class="am-panel-header">Edit</div>
                        <div class="am-panel-content">
                            <div class="am-tool-group">
                                <button class="am-tool-btn" id="btn-fillet">FILLET</button>
                                <button class="am-tool-btn" id="btn-offset">OFFSET</button>
                                <button class="am-tool-btn" id="btn-trim">TRIM</button>
                                <button class="am-tool-btn" id="btn-mirror">MIRROR</button>
                                <button class="am-tool-btn" id="btn-select" style="grid-column: span 2">SELECT</button>
                            </div>
                        </div>
                    </div>

                    <!-- 3D OPERATIONS -->
                    <div class="am-panel">
                        <div class="am-panel-header">3D Generation</div>
                        <div class="am-panel-content">
                            <div class="am-control-group">
                                <label>Operation</label>
                                <select id="am-3d-op">
                                    <option value="extrude">Extrude</option>
                                    <option value="revolve">Revolve</option>
                                    <option value="loft">Loft</option>
                                </select>
                            </div>
                            <div id="settings-3d-extrude">
                                <div class="am-control-group">
                                    <label>Height</label>
                                    <input type="number" id="am-ext-height" value="2.5" step="0.1">
                                </div>
                            </div>
                            <div id="settings-3d-revolve" style="display:none">
                                <div class="am-control-group">
                                    <label>Segments</label>
                                    <input type="number" id="am-rev-seg" value="32">
                                </div>
                            </div>
                            <button class="am-btn-action" id="am-build-btn">BUILD 3D</button>
                        </div>
                    </div>
                </div>
            </div>`;
        
        this.modal = modal;
        
        // Re-attach the close listener since we overwrote the HTML
        this.modal.querySelector('.am-close-btn').onclick = () => this.close();
        
        console.log('✅ Modal HTML injected successfully');
    }

    // ==========================================
    // CAD MATH & SNAPPING
    // ==========================================

    screenToWorld(pixelX, pixelY, view) {
        const vp = this.viewports.get(view);
        const rect = vp.canvas.getBoundingClientRect();
        const lx = (pixelX - rect.left) - (vp.canvas.width / 2);
        const ly = (pixelY - rect.top) - (vp.canvas.height / 2);
        return {
            x: (lx - vp.offset.x) / (this.worldScale * vp.zoom),
            y: (-(ly - vp.offset.y)) / (this.worldScale * vp.zoom)
        };
    }

    worldToScreen(wx, wy, view) {
        const vp = this.viewports.get(view);
        return {
            x: (vp.canvas.width / 2) + (wx * this.worldScale * vp.zoom) + vp.offset.x,
            y: (vp.canvas.height / 2) - (wy * this.worldScale * vp.zoom) + vp.offset.y
        };
    }

    calculateSnap(wx, wy, view) {
        let snap = { x: wx, y: wy, type: 'none' };
        const vp = this.viewports.get(view);
        const tol = this.settings.snapTolerance / (this.worldScale * vp.zoom);

        // 1. Endpoint Snapping
        for (let ent of this.entities) {
            if (ent.p1 && Math.hypot(wx - ent.p1.x, wy - ent.p1.y) < tol) return { x: ent.p1.x, y: ent.p1.y, type: 'endpoint' };
            if (ent.p2 && Math.hypot(wx - ent.p2.x, wy - ent.p2.y) < tol) return { x: ent.p2.x, y: ent.p2.y, type: 'endpoint' };
        }

        // 2. Grid Snapping
        if (this.settings.snapToGrid) {
            const g = this.settings.gridMinor;
            snap.x = Math.round(wx / g) * g;
            snap.y = Math.round(wy / g) * g;
            snap.type = 'grid';
        }
        return snap;
    }

    // ==========================================
    // ENTITY DRAWING LOGIC
    // ==========================================

    onCanvasMouseDown(e, view) {
        const world = this.screenToWorld(e.clientX, e.clientY, view);
        const snapped = this.calculateSnap(world.x, world.y, view);

        if (this.currentTool === 'select') {
            this.handleSelection(snapped, view);
            return;
        }

        this.isDrawing = true;

        if (this.currentTool === 'line') {
            this.activePoints.push({ x: snapped.x, y: snapped.y });
        } else if (['rect', 'circle', 'arc', 'polygon'].includes(this.currentTool)) {
            this.activePoints = [{ x: snapped.x, y: snapped.y }];
        } else if (this.currentTool === 'spline') {
            this.activePoints.push({ x: snapped.x, y: snapped.y });
        } else if (['fillet', 'trim', 'offset', 'mirror', 'array'].includes(this.currentTool)) {
            this.handleAdvancedTool(snapped, view);
        }
    }

    onCanvasMouseMove(e, view) {
        const world = this.screenToWorld(e.clientX, e.clientY, view);
        this.snapResult = this.calculateSnap(world.x, world.y, view);
        this.updateHUD(this.snapResult);
        this.renderAll();
    }

    onCanvasMouseUp(e, view) {
        if (!this.isDrawing) return;

        const start = this.activePoints[0];
        const end = this.snapResult;

        if (this.currentTool === 'poly') {
            // Create N-Sided Polygon
            const sides = 6; // Could make this an input
            const radius = Math.hypot(end.x - start.x, end.y - start.y);
            const polyPoints = [];
            for (let i = 0; i < sides; i++) {
                const angle = (i / sides) * Math.PI * 2;
                polyPoints.push({
                    x: start.x + Math.cos(angle) * radius,
                    y: start.y + Math.sin(angle) * radius
                });
            }
            // Save as closed loop of lines
            for (let i = 0; i < sides; i++) {
                this.entities.push({
                    type: 'line',
                    p1: polyPoints[i],
                    p2: polyPoints[(i + 1) % sides],
                    selected: false
                });
            }
            this.activePoints = [];
            this.isDrawing = false;
        } else
            if (this.currentTool === 'rect') {
                this.entities.push({ type: 'rect', p1: start, p2: end, selected: false });
                this.activePoints = [];
                this.isDrawing = false;
            } else if (this.currentTool === 'circle') {
                const radius = Math.hypot(end.x - start.x, end.y - start.y);
                this.entities.push({ type: 'circle', center: start, radius: radius, selected: false });
                this.activePoints = [];
                this.isDrawing = false;
            } else if (this.currentTool === 'arc') {
                if (this.activePoints.length === 1) {
                    this.activePoints.push(end);
                } else if (this.activePoints.length === 2) {
                    this.createArc(this.activePoints[0], this.activePoints[1], end);
                    this.activePoints = [];
                    this.isDrawing = false;
                }
            } else if (this.currentTool === 'polygon') {
                const radius = Math.hypot(end.x - start.x, end.y - start.y);
                this.createPolygon(start, radius);
                this.activePoints = [];
                this.isDrawing = false;
            } else if (this.currentTool === 'line') {
                if (this.activePoints.length > 1) {
                    const p1 = this.activePoints[this.activePoints.length - 2];
                    const p2 = this.activePoints[this.activePoints.length - 1];
                    this.entities.push({ type: 'line', p1, p2, selected: false });
                }
            } else if (this.currentTool === 'spline' && e.button === 2) {
                // Right-click to finish spline
                this.createSpline();
                this.activePoints = [];
                this.isDrawing = false;
            }
        this.renderAll();
    }

    performTrim(clickPoint) {
        const tolerance = 0.5; // Sensitivity

        // 1. Find the entity clicked
        const targetIdx = this.entities.findIndex(ent => this.isPointNearEntity(clickPoint, ent, tolerance));
        if (targetIdx === -1) return;

        const target = this.entities[targetIdx];

        // Only trim lines for now
        if (target.type !== 'line') return;

        // 2. Find all intersections between Target and ALL other entities
        let intersections = [];

        this.entities.forEach((other, idx) => {
            if (idx === targetIdx || other.type !== 'line') return;

            // Math: Line-Line Intersection
            const ints = this.getLineIntersection(target.p1, target.p2, other.p1, other.p2);
            if (ints) intersections.push(ints);
        });

        // Add endpoints to split list
        intersections.push(target.p1, target.p2);

        // 3. Sort points along the line
        // (Simple logic: sort by distance from p1)
        intersections.sort((a, b) => {
            const dA = Math.hypot(a.x - target.p1.x, a.y - target.p1.y);
            const dB = Math.hypot(b.x - target.p1.x, b.y - target.p1.y);
            return dA - dB;
        });

        // 4. Find which segment the user clicked and remove it
        // Rebuild the line excluding the clicked segment
        this.entities.splice(targetIdx, 1); // Remove original

        for (let i = 0; i < intersections.length - 1; i++) {
            const pA = intersections[i];
            const pB = intersections[i + 1];
            const mid = { x: (pA.x + pB.x) / 2, y: (pA.y + pB.y) / 2 };

            // If the click was NOT on this segment, keep it
            if (Math.hypot(clickPoint.x - mid.x, clickPoint.y - mid.y) > tolerance) {
                this.entities.push({ type: 'line', p1: pA, p2: pB, selected: false });
            }
        }
        this.renderAll();
    }

    // Math Helper: Returns intersection point {x,y} or null
    getLineIntersection(p1, p2, p3, p4) {
        const det = (p2.x - p1.x) * (p4.y - p3.y) - (p4.x - p3.x) * (p2.y - p1.y);
        if (det === 0) return null; // Parallel

        const lambda = ((p4.y - p3.y) * (p4.x - p1.x) + (p3.x - p4.x) * (p4.y - p1.y)) / det;
        const gamma = ((p1.y - p2.y) * (p4.x - p1.x) + (p2.x - p1.x) * (p4.y - p1.y)) / det;

        if ((0 < lambda && lambda < 1) && (0 < gamma && gamma < 1)) {
            return {
                x: p1.x + lambda * (p2.x - p1.x),
                y: p1.y + lambda * (p2.y - p1.y)
            };
        }
        return null;
    }

    // ==========================================
    // ADVANCED CAD TOOLS
    // ==========================================

    createArc(p1, p2, p3) {
        // Three-point arc
        const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
        const d1 = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        const d2 = Math.hypot(p3.x - mid.x, p3.y - mid.y);
        const radius = (d1 * d1) / (4 * d2) + d2;

        const angle1 = Math.atan2(p1.y - p3.y, p1.x - p3.x);
        const angle2 = Math.atan2(p2.y - p3.y, p2.x - p3.x);

        this.entities.push({
            type: 'arc',
            center: p3,
            radius: radius,
            startAngle: angle1,
            endAngle: angle2,
            selected: false
        });
    }

    createPolygon(center, radius) {
        const sides = parseInt(document.getElementById('am-poly-sides').value);
        const points = [];
        for (let i = 0; i < sides; i++) {
            const angle = (Math.PI * 2 * i) / sides - Math.PI / 2;
            points.push({
                x: center.x + radius * Math.cos(angle),
                y: center.y + radius * Math.sin(angle)
            });
        }
        for (let i = 0; i < sides; i++) {
            this.entities.push({
                type: 'line',
                p1: points[i],
                p2: points[(i + 1) % sides],
                selected: false
            });
        }
    }

    createSpline() {
        if (this.activePoints.length < 3) return;
        this.entities.push({
            type: 'spline',
            points: [...this.activePoints],
            selected: false
        });
    }

    handleSelection(point, view) {
        const tolerance = this.settings.snapTolerance / (this.worldScale * this.viewports.get(view).zoom);
        let found = false;

        this.entities.forEach(ent => {
            const isNear = this.isPointNearEntity(point, ent, tolerance);
            if (isNear) {
                ent.selected = !ent.selected;
                found = true;
            }
        });

        this.renderAll();
    }

    isPointNearEntity(point, entity, tolerance) {
        if (entity.type === 'line') {
            return this.distanceToLineSegment(point, entity.p1, entity.p2) < tolerance;
        } else if (entity.type === 'circle') {
            const dist = Math.hypot(point.x - entity.center.x, point.y - entity.center.y);
            return Math.abs(dist - entity.radius) < tolerance;
        } else if (entity.type === 'rect' || entity.type === 'roundrect') {
            const inX = point.x >= Math.min(entity.p1.x, entity.p2.x) - tolerance &&
                point.x <= Math.max(entity.p1.x, entity.p2.x) + tolerance;
            const inY = point.y >= Math.min(entity.p1.y, entity.p2.y) - tolerance &&
                point.y <= Math.max(entity.p1.y, entity.p2.y) + tolerance;
            return inX && inY;
        } else if (entity.type === 'spline') {
            for (let i = 0; i < entity.points.length - 1; i++) {
                if (this.distanceToLineSegment(point, entity.points[i], entity.points[i + 1]) < tolerance) {
                    return true;
                }
            }
        }
        return false;
    }

    distanceToLineSegment(p, l1, l2) {
        const A = p.x - l1.x;
        const B = p.y - l1.y;
        const C = l2.x - l1.x;
        const D = l2.y - l1.y;
        const dot = A * C + B * D;
        const lenSq = C * C + D * D;
        let param = -1;
        if (lenSq !== 0) param = dot / lenSq;

        let xx, yy;
        if (param < 0) { xx = l1.x; yy = l1.y; }
        else if (param > 1) { xx = l2.x; yy = l2.y; }
        else { xx = l1.x + param * C; yy = l1.y + param * D; }

        return Math.hypot(p.x - xx, p.y - yy);
    }

    handleAdvancedTool(point, view) {
        const selected = this.entities.filter(e => e.selected);

        if (this.currentTool === 'fillet') {
            this.applyFillet(selected);
        } else if (this.currentTool === 'offset') {
            this.applyOffset(selected);
        } else if (this.currentTool === 'trim') {
            this.applyTrim(point);
        } else if (this.currentTool === 'mirror') {
            if (!this.activePoints.length) {
                this.activePoints.push(point);
            } else if (this.activePoints.length === 1) {
                this.applyMirror(selected, this.activePoints[0], point);
                this.activePoints = [];
            }
        } else if (this.currentTool === 'array') {
            this.applyArray(selected);
        }
        this.renderAll();
    }

    applyFillet(entities) {
        const radius = parseFloat(document.getElementById('am-fillet-radius').value);
        entities.forEach(ent => {
            if (ent.type === 'rect') {
                // Convert rect to rounded rect
                const minX = Math.min(ent.p1.x, ent.p2.x);
                const maxX = Math.max(ent.p1.x, ent.p2.x);
                const minY = Math.min(ent.p1.y, ent.p2.y);
                const maxY = Math.max(ent.p1.y, ent.p2.y);

                ent.type = 'roundrect';
                ent.radius = radius;
                ent.p1 = { x: minX, y: minY };
                ent.p2 = { x: maxX, y: maxY };
            }
        });
    }

    applyOffset(entities) {
        const distance = parseFloat(document.getElementById('am-offset-dist').value);
        entities.forEach(ent => {
            if (ent.type === 'line') {
                const dx = ent.p2.x - ent.p1.x;
                const dy = ent.p2.y - ent.p1.y;
                const len = Math.hypot(dx, dy);
                const perpX = -dy / len * distance;
                const perpY = dx / len * distance;

                this.entities.push({
                    type: 'line',
                    p1: { x: ent.p1.x + perpX, y: ent.p1.y + perpY },
                    p2: { x: ent.p2.x + perpX, y: ent.p2.y + perpY },
                    selected: false
                });
            } else if (ent.type === 'circle') {
                this.entities.push({
                    type: 'circle',
                    center: { ...ent.center },
                    radius: ent.radius + distance,
                    selected: false
                });
            }
        });
    }

    applyTrim(point) {
        // Find and remove entities near the click point
        this.entities = this.entities.filter(ent => {
            const tol = 0.2;
            return !this.isPointNearEntity(point, ent, tol);
        });
    }

    applyMirror(entities, p1, p2) {
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const len = Math.hypot(dx, dy);
        const ux = dx / len;
        const uy = dy / len;

        entities.forEach(ent => {
            const mirrored = JSON.parse(JSON.stringify(ent));
            mirrored.selected = false;

            if (ent.type === 'line') {
                mirrored.p1 = this.mirrorPoint(ent.p1, p1, ux, uy);
                mirrored.p2 = this.mirrorPoint(ent.p2, p1, ux, uy);
            } else if (ent.type === 'circle' || ent.type === 'arc') {
                mirrored.center = this.mirrorPoint(ent.center, p1, ux, uy);
            } else if (ent.type === 'rect' || ent.type === 'roundrect') {
                mirrored.p1 = this.mirrorPoint(ent.p1, p1, ux, uy);
                mirrored.p2 = this.mirrorPoint(ent.p2, p1, ux, uy);
            } else if (ent.type === 'spline') {
                mirrored.points = ent.points.map(pt => this.mirrorPoint(pt, p1, ux, uy));
            }

            this.entities.push(mirrored);
        });
    }

    mirrorPoint(point, linePoint, ux, uy) {
        const dx = point.x - linePoint.x;
        const dy = point.y - linePoint.y;
        const dot = dx * ux + dy * uy;
        const projX = linePoint.x + dot * ux;
        const projY = linePoint.y + dot * uy;
        return {
            x: 2 * projX - point.x,
            y: 2 * projY - point.y
        };
    }

    applyArray(entities) {
        const count = parseInt(document.getElementById('am-array-count').value);
        const spacing = parseFloat(document.getElementById('am-array-spacing').value);

        entities.forEach(ent => {
            for (let i = 1; i < count; i++) {
                const copied = JSON.parse(JSON.stringify(ent));
                copied.selected = false;

                if (ent.type === 'line') {
                    copied.p1.x += spacing * i;
                    copied.p2.x += spacing * i;
                } else if (ent.type === 'circle' || ent.type === 'arc') {
                    copied.center.x += spacing * i;
                } else if (ent.type === 'rect' || ent.type === 'roundrect') {
                    copied.p1.x += spacing * i;
                    copied.p2.x += spacing * i;
                } else if (ent.type === 'spline') {
                    copied.points = copied.points.map(pt => ({ x: pt.x + spacing * i, y: pt.y }));
                }

                this.entities.push(copied);
            }
        });
    }

    // ==========================================
    // 3D GENERATION (Industrial Solver)
    // ==========================================

    async build3D() {
        if (this.entities.length === 0) return;

        const operation = document.getElementById('am-3d-operation').value;

        if (operation === 'extrude') {
            this.buildExtrude();
        } else if (operation === 'revolve') {
            this.buildRevolve();
        } else if (operation === 'loft') {
            this.buildLoft();
        }
    }

    buildExtrude() {
        const shape = new THREE.Shape();
        let started = false;

        // Path Solver: Convert Entities to THREE.Shape
        this.entities.forEach(ent => {
            if (ent.type === 'line') {
                if (!started) { shape.moveTo(ent.p1.x, ent.p1.y); started = true; }
                shape.lineTo(ent.p2.x, ent.p2.y);
            } else if (ent.type === 'circle') {
                shape.absarc(ent.center.x, ent.center.y, ent.radius, 0, Math.PI * 2);
            } else if (ent.type === 'arc') {
                shape.absarc(ent.center.x, ent.center.y, ent.radius, ent.startAngle, ent.endAngle);
            } else if (ent.type === 'rect') {
                shape.moveTo(ent.p1.x, ent.p1.y);
                shape.lineTo(ent.p2.x, ent.p1.y);
                shape.lineTo(ent.p2.x, ent.p2.y);
                shape.lineTo(ent.p1.x, ent.p2.y);
                shape.lineTo(ent.p1.x, ent.p1.y);
            } else if (ent.type === 'roundrect') {
                const r = ent.radius;
                const x1 = ent.p1.x, y1 = ent.p1.y;
                const x2 = ent.p2.x, y2 = ent.p2.y;
                shape.moveTo(x1 + r, y1);
                shape.lineTo(x2 - r, y1);
                shape.quadraticCurveTo(x2, y1, x2, y1 + r);
                shape.lineTo(x2, y2 - r);
                shape.quadraticCurveTo(x2, y2, x2 - r, y2);
                shape.lineTo(x1 + r, y2);
                shape.quadraticCurveTo(x1, y2, x1, y2 - r);
                shape.lineTo(x1, y1 + r);
                shape.quadraticCurveTo(x1, y1, x1 + r, y1);
            } else if (ent.type === 'spline') {
                // 1. Get raw control points
                const rawPoints = ent.points || ent.controlPoints;

                // 2. Use the AdvancedCurveTangent engine to smooth them
                // (Assuming window.TwoDProfileDrawer or similar helper exists, 
                // or instantiate the math class directly)
                const curveEngine = new AdvancedCurveTangent(this);
                const smoothPoints = curveEngine.interpolateCatmullRom(rawPoints, 20); // 20 segments per point

                // 3. Draw to Shape
                if (smoothPoints.length > 0) {
                    if (!started) {
                        shape.moveTo(smoothPoints[0].x, smoothPoints[0].y);
                        started = true;
                    }
                    for (let i = 1; i < smoothPoints.length; i++) {
                        shape.lineTo(smoothPoints[i].x, smoothPoints[i].y);
                    }
                }
            }
        });

        const depth = parseFloat(document.getElementById('am-ext-height').value);
        const segs = parseInt(document.getElementById('am-ext-segs').value);

        const geo = new THREE.ExtrudeGeometry(shape, {
            depth: depth,
            steps: segs,
            bevelEnabled: true,
            bevelThickness: this.settings.bevel,
            bevelSize: this.settings.bevel
        });

        const mat = new THREE.MeshStandardMaterial({
            color: 0x94a3b8,
            metalness: 0.4,
            roughness: 0.2,
            flatShading: false
        });

        if (this.current3DObject) this.scene.remove(this.current3DObject);
        this.current3DObject = new THREE.Mesh(geo, mat);
        this.current3DObject.rotation.x = -Math.PI / 2;

        this.scene.add(this.current3DObject);
        console.log("✅ Extrusion Complete");
    }

    buildRevolve() {
        // Revolve profile around Y-axis
        const points = [];
        this.entities.forEach(ent => {
            if (ent.type === 'line') {
                points.push(new THREE.Vector2(ent.p1.x, ent.p1.y));
                points.push(new THREE.Vector2(ent.p2.x, ent.p2.y));
            }
        });

        if (points.length < 2) return;

        const geo = new THREE.LatheGeometry(points, 32);
        const mat = new THREE.MeshStandardMaterial({
            color: 0x94a3b8,
            metalness: 0.5,
            roughness: 0.3
        });

        if (this.current3DObject) this.scene.remove(this.current3DObject);
        this.current3DObject = new THREE.Mesh(geo, mat);
        this.current3DObject.rotation.x = -Math.PI / 2;

        this.scene.add(this.current3DObject);
        console.log("✅ Revolution Complete");
    }

    buildLoft() {
        // Simple loft between first and last rectangular profiles
        const rects = this.entities.filter(e => e.type === 'rect');
        if (rects.length < 2) {
            console.warn("Need at least 2 rectangles for loft");
            return;
        }

        const shape1 = new THREE.Shape([
            new THREE.Vector2(rects[0].p1.x, rects[0].p1.y),
            new THREE.Vector2(rects[0].p2.x, rects[0].p1.y),
            new THREE.Vector2(rects[0].p2.x, rects[0].p2.y),
            new THREE.Vector2(rects[0].p1.x, rects[0].p2.y)
        ]);

        const depth = parseFloat(document.getElementById('am-ext-height').value);
        const geo = new THREE.ExtrudeGeometry(shape1, { depth, bevelEnabled: false });
        const mat = new THREE.MeshStandardMaterial({ color: 0x94a3b8 });

        if (this.current3DObject) this.scene.remove(this.current3DObject);
        this.current3DObject = new THREE.Mesh(geo, mat);
        this.current3DObject.rotation.x = -Math.PI / 2;

        this.scene.add(this.current3DObject);
        console.log("✅ Loft Complete");
    }

    // ==========================================
    // RENDERING & HUD
    // ==========================================

    renderAll() {
        this.viewports.forEach((vp, name) => {
            const ctx = vp.ctx;
            ctx.clearRect(0, 0, vp.canvas.width, vp.canvas.height);
            this.drawGrid(vp);
            this.drawEntities(vp, name);
        });
    }

    drawEntities(vp, name) {
        const ctx = vp.ctx;
        ctx.lineWidth = 2;

        // Draw established entities
        this.entities.forEach(ent => {
            ctx.strokeStyle = ent.selected ? '#22d3ee' : '#6366f1';
            ctx.fillStyle = ent.selected ? 'rgba(34, 211, 238, 0.1)' : 'rgba(99, 102, 241, 0.05)';
            ctx.beginPath();

            if (ent.type === 'line') {
                const s1 = this.worldToScreen(ent.p1.x, ent.p1.y, name);
                const s2 = this.worldToScreen(ent.p2.x, ent.p2.y, name);
                ctx.moveTo(s1.x, s1.y);
                ctx.lineTo(s2.x, s2.y);
                ctx.stroke();
            } else if (ent.type === 'rect') {
                const s1 = this.worldToScreen(ent.p1.x, ent.p1.y, name);
                const s2 = this.worldToScreen(ent.p2.x, ent.p2.y, name);
                ctx.strokeRect(s1.x, s1.y, s2.x - s1.x, s2.y - s1.y);
                if (ent.selected) ctx.fillRect(s1.x, s1.y, s2.x - s1.x, s2.y - s1.y);
            } else if (ent.type === 'roundrect') {
                const s1 = this.worldToScreen(ent.p1.x, ent.p1.y, name);
                const s2 = this.worldToScreen(ent.p2.x, ent.p2.y, name);
                const r = ent.radius * this.worldScale * vp.zoom;
                this.drawRoundRect(ctx, s1.x, s1.y, s2.x - s1.x, s2.y - s1.y, r);
                ctx.stroke();
                if (ent.selected) ctx.fill();
            } else if (ent.type === 'circle') {
                const center = this.worldToScreen(ent.center.x, ent.center.y, name);
                ctx.arc(center.x, center.y, ent.radius * this.worldScale * vp.zoom, 0, Math.PI * 2);
                ctx.stroke();
                if (ent.selected) ctx.fill();
            } else if (ent.type === 'arc') {
                const center = this.worldToScreen(ent.center.x, ent.center.y, name);
                ctx.arc(center.x, center.y, ent.radius * this.worldScale * vp.zoom,
                    ent.startAngle, ent.endAngle);
                ctx.stroke();
            } else if (ent.type === 'spline' && ent.points.length > 1) {
                const p0 = this.worldToScreen(ent.points[0].x, ent.points[0].y, name);
                ctx.moveTo(p0.x, p0.y);
                for (let i = 1; i < ent.points.length - 1; i += 2) {
                    const cp = this.worldToScreen(ent.points[i].x, ent.points[i].y, name);
                    const ep = ent.points[i + 1] || ent.points[i];
                    const epScreen = this.worldToScreen(ep.x, ep.y, name);
                    ctx.quadraticCurveTo(cp.x, cp.y, epScreen.x, epScreen.y);
                }
                ctx.stroke();
            }
        });

        // Draw temporary "Rubber-band" preview
        if (this.isDrawing && this.activePoints.length > 0) {
            ctx.beginPath();
            ctx.strokeStyle = 'rgba(99, 102, 241, 0.5)';
            ctx.setLineDash([5, 5]);
            const s1 = this.worldToScreen(this.activePoints[0].x, this.activePoints[0].y, name);
            const s2 = this.worldToScreen(this.snapResult.x, this.snapResult.y, name);

            if (this.currentTool === 'rect') {
                ctx.strokeRect(s1.x, s1.y, s2.x - s1.x, s2.y - s1.y);
            } else if (this.currentTool === 'circle') {
                const radius = Math.hypot(s2.x - s1.x, s2.y - s1.y);
                ctx.arc(s1.x, s1.y, radius, 0, Math.PI * 2);
            } else if (this.currentTool === 'polygon') {
                const radius = Math.hypot(s2.x - s1.x, s2.y - s1.y);
                const sides = parseInt(document.getElementById('am-poly-sides').value);
                for (let i = 0; i < sides; i++) {
                    const angle = (Math.PI * 2 * i) / sides - Math.PI / 2;
                    const x = s1.x + radius * Math.cos(angle);
                    const y = s1.y + radius * Math.sin(angle);
                    if (i === 0) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                }
                ctx.closePath();
            } else if (this.currentTool === 'mirror' && this.activePoints.length === 1) {
                ctx.strokeStyle = '#f59e0b';
                ctx.moveTo(s1.x, s1.y);
                ctx.lineTo(s2.x, s2.y);
            } else {
                ctx.moveTo(s1.x, s1.y);
                ctx.lineTo(s2.x, s2.y);
            }
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // OSNAP Indicator
        if (this.snapResult.type !== 'none') {
            const s = this.worldToScreen(this.snapResult.x, this.snapResult.y, name);
            ctx.strokeStyle = '#22d3ee';
            ctx.strokeRect(s.x - 6, s.y - 6, 12, 12);
        }
    }

    drawRoundRect(ctx, x, y, w, h, r) {
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
    }

    drawGrid(vp) {
        const ctx = vp.ctx;
        const step = this.settings.gridMinor * this.worldScale * vp.zoom;
        const cx = vp.canvas.width / 2 + vp.offset.x;
        const cy = vp.canvas.height / 2 + vp.offset.y;
        ctx.strokeStyle = '#1a1a20';
        ctx.beginPath();
        for (let x = cx % step; x < vp.canvas.width; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, vp.canvas.height); }
        for (let y = cy % step; y < vp.canvas.height; y += step) { ctx.moveTo(0, y); ctx.lineTo(vp.canvas.width, y); }
        ctx.stroke();
        // Axis
        ctx.strokeStyle = '#333';
        ctx.beginPath();
        ctx.moveTo(0, cy); ctx.lineTo(vp.canvas.width, cy);
        ctx.moveTo(cx, 0); ctx.lineTo(cx, vp.canvas.height);
        ctx.stroke();
    }

    // ==========================================
    // SYSTEM SETUP
    // ==========================================

    setupEventListeners() {
        this.viewports.forEach((vp, name) => {
            vp.canvas.onmousedown = (e) => this.onCanvasMouseDown(e, name);
            vp.canvas.onmousemove = (e) => this.onCanvasMouseMove(e, name);
            vp.canvas.onmouseup = (e) => this.onCanvasMouseUp(e, name);
            vp.canvas.oncontextmenu = (e) => {
                e.preventDefault();
                if (this.currentTool === 'spline' && this.activePoints.length >= 3) {
                    this.createSpline();
                    this.activePoints = [];
                    this.isDrawing = false;
                    this.renderAll();
                } else if (this.currentTool === 'line' && this.activePoints.length >= 2) {
                    this.activePoints = [];
                    this.isDrawing = false;
                }
            };
            vp.canvas.onwheel = (e) => {
                e.preventDefault();
                vp.zoom *= (e.deltaY > 0 ? 0.9 : 1.1);
                this.renderAll();
            };
        });

        // UI Binding - Drawing Tools
        document.getElementById('btn-line').onclick = () => this.setTool('line');
        document.getElementById('btn-rect').onclick = () => this.setTool('rect');
        document.getElementById('btn-circle').onclick = () => this.setTool('circle');
        document.getElementById('btn-arc').onclick = () => this.setTool('arc');
        document.getElementById('btn-polygon').onclick = () => this.setTool('polygon');
        document.getElementById('btn-spline').onclick = () => this.setTool('spline');

        // UI Binding - Edit Tools
        document.getElementById('btn-fillet').onclick = () => this.setTool('fillet');
        document.getElementById('btn-offset').onclick = () => this.setTool('offset');
        document.getElementById('btn-trim').onclick = () => this.setTool('trim');
        document.getElementById('btn-mirror').onclick = () => this.setTool('mirror');
        document.getElementById('btn-array').onclick = () => this.setTool('array');
        document.getElementById('btn-select').onclick = () => this.setTool('select');

        // UI Binding - Actions
        document.getElementById('am-build-btn').onclick = () => this.build3D();
        document.getElementById('am-delete-selected-btn').onclick = () => {
            this.entities = this.entities.filter(e => !e.selected);
            this.renderAll();
        };
        document.getElementById('am-clear-btn').onclick = () => {
            this.entities = [];
            this.selectedEntities = [];
            this.renderAll();
        };

        // Tool Settings Updates
        document.getElementById('am-fillet-radius').onchange = (e) => {
            this.settings.filletRadius = parseFloat(e.target.value);
        };
        document.getElementById('am-offset-dist').onchange = (e) => {
            this.settings.offsetDistance = parseFloat(e.target.value);
        };
        document.getElementById('am-poly-sides').onchange = (e) => {
            this.settings.polygonSides = parseInt(e.target.value);
        };
        document.getElementById('am-array-count').onchange = (e) => {
            this.settings.arrayCount = parseInt(e.target.value);
        };
        document.getElementById('am-array-spacing').onchange = (e) => {
            this.settings.arraySpacing = parseFloat(e.target.value);
        };

        this.modal.querySelector('.am-close-btn').onclick = () => this.close();

        // Bind New Tools
        ['arc', 'poly', 'trim'].forEach(t => {
            const btn = document.getElementById(`btn-${t}`);
            if (btn) btn.onclick = () => this.setTool(t);
        });

        // Handle 3D Operation Dropdown Change
        const opSelect = document.getElementById('am-3d-op');
        if (opSelect) {
            opSelect.onchange = (e) => {
                const val = e.target.value;
                document.getElementById('settings-3d-extrude').style.display = (val === 'extrude') ? 'block' : 'none';
                document.getElementById('settings-3d-revolve').style.display = (val === 'revolve') ? 'block' : 'none';
            };
        }
        // Show/hide tool settings based on active tool
        this.updateToolSettings();
    }

    updateToolSettings() {
        const allSettings = ['setting-fillet', 'setting-offset', 'setting-polygon', 'setting-array'];
        allSettings.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });

        if (this.currentTool === 'fillet') {
            document.getElementById('setting-fillet').style.display = 'block';
        } else if (this.currentTool === 'offset') {
            document.getElementById('setting-offset').style.display = 'block';
        } else if (this.currentTool === 'polygon') {
            document.getElementById('setting-polygon').style.display = 'block';
        } else if (this.currentTool === 'array') {
            document.getElementById('setting-array').style.display = 'block';
        }
    }

    setTool(tool) {
        this.currentTool = tool;
        this.activePoints = [];
        this.isDrawing = false;
        document.querySelectorAll('.am-tool-btn').forEach(b => b.classList.remove('active'));
        document.getElementById(`btn-${tool}`).classList.add('active');
        this.updateToolSettings();

        // Update HUD with tool name
        const toolNames = {
            line: 'POLYLINE', rect: 'RECTANGLE', circle: 'CIRCLE',
            arc: '3-POINT ARC', polygon: 'POLYGON', spline: 'SPLINE',
            fillet: 'FILLET', offset: 'OFFSET', trim: 'TRIM',
            mirror: 'MIRROR', array: 'ARRAY', select: 'SELECT'
        };
        document.getElementById('am-coordinate-hud').innerHTML =
            `<span style="color:#22d3ee">${toolNames[tool] || tool.toUpperCase()}</span> | X: 0.000 | Y: 0.000`;
    }

    updateHUD(snap) {
        const toolNames = {
            line: 'POLYLINE', rect: 'RECTANGLE', circle: 'CIRCLE',
            arc: '3-POINT ARC', polygon: 'POLYGON', spline: 'SPLINE',
            fillet: 'FILLET', offset: 'OFFSET', trim: 'TRIM',
            mirror: 'MIRROR', array: 'ARRAY', select: 'SELECT'
        };
        document.getElementById('am-coordinate-hud').innerHTML =
            `<span style="color:#22d3ee">${toolNames[this.currentTool] || this.currentTool.toUpperCase()}</span> | X: ${snap.x.toFixed(3)}m | Y: ${snap.y.toFixed(3)}m | SNAP: ${snap.type.toUpperCase()}`;
    }

    initViewports() {
        this.views.forEach(v => {
            const canvas = document.getElementById(`am-2d-${v}`);
            if (canvas) {
                this.viewports.set(v, { canvas, ctx: canvas.getContext('2d'), offset: { x: 0, y: 0 }, zoom: 1.0 });
                this.resizeCanvas(v);
            }
        });
    }

    resizeCanvas(name) {
        const vp = this.viewports.get(name);
        vp.canvas.width = vp.canvas.parentElement.clientWidth;
        vp.canvas.height = vp.canvas.parentElement.clientHeight;
    }

    open() {
        if (!this.modal) {
            console.error('❌ Modal element not found');
            return;
        }
        this.isActive = true;
        this.modal.classList.add('active');
        console.log('✅ Modal opened, added active class');
        setTimeout(() => { 
            this.views.forEach(v => this.resizeCanvas(v)); 
            this.renderAll();
            console.log('✅ Canvas resized and rendered');
        }, 100);
    }

    close() { 
        this.isActive = false;
        if (this.modal) {
            this.modal.classList.remove('active');
            console.log('✅ Modal closed, removed active class');
        }
    }
}

window.AdvancedModeler = AdvancedModeler;

