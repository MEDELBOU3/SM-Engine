// ============================================================================
// GeometryNodeEditor v2 — Blender-inspired editor shell (UI ONLY).
//
// This file contains NO procedural geometry algorithms, NO graph evaluation
// logic, NO serialization format. It orchestrates the core+runtime layers:
//
//    registry  →  getGeometryNodeRegistry()   node definitions
//    core      →  NodeGraph / NodeEvaluator / NodeSerializer / History
//    runtime   →  GeometryOps
//
// The editor exchanges data with those layers and renders/interacts with the
// canvas. The graph can be evaluated headlessly via GeometryCompiler without
// this file ever being loaded.
// ============================================================================

(function () {
    'use strict';

    const registry = window.getGeometryNodeRegistry ? window.getGeometryNodeRegistry() : null;
    const NodeGraph = window.NodeGraph || null;
    const NodeEvaluator = window.NodeEvaluator || null;
    const NodeSerializer = window.NodeSerializer || null;
    const History = window.History || null;

    class GeometryNodeEditor {
        // ────────────────────────────────────────────────────────────────────
        constructor(containerId) {
            this.container = document.getElementById(containerId)
                || (() => { const d = document.createElement('div'); d.id = containerId; return d; })();
            this.canvas = null;
            this.ctx = null;
            this.isInitialized = false;

            // Core layers
            this.registry = registry;
            this.graph = new NodeGraph();
            this.evaluator = new NodeEvaluator(this.graph, this.registry);
            this.history = new History(this.graph, this.registry, 60);
            this.geometryCompiler = window.GeometryCompiler ? new window.GeometryCompiler(this.registry, this.evaluator) : null;

            // View model mirrors graph state for rendering
            this.nodes = this.graph.nodes;
            this.connections = this.graph.connections;
            this.groups = this.graph.groups;

            this.panX = 0;
            this.panY = 0;
            this.zoom = 1.0;
            this.gridSize = 40;
            this.gridSubdivisions = 5;
            this.showGrid = true;
            this.snapToGrid = false;
            this.showMinimap = true;
            this.minZoom = 0.12;
            this.maxZoom = 4.0;

            this.draggedNode = null;
            this.activeLink = null;
            this.isPanning = false;
            this.lastMouse = { x: 0, y: 0 };
            this.selectedNode = null;
            this.selectedNodes = [];
            this.selectedGroup = null;
            this.contextMenuTarget = null;
            this.hoveredSocket = null;
            this.spacePressed = false;
            this.selectionRect = null;
            this.isSelecting = false;
            this.draggedGroup = null;
            this._dragHistoryPushed = false;

            this.targetObject = null;
            this.previewResult = null;
            this.previewMaterial = null;

            this.previewRenderer = null;
            this.previewScene = null;
            this.previewCamera = null;
            this.previewMesh = null;
            this.previewOrbit = { theta: 0.6, phi: 0.9, dist: 6, target: window.THREE ? new window.THREE.Vector3(0, 0, 0) : { x: 0, y: 0, z: 0 } };
            this._previewDragging = false;
            this._previewLast = { x: 0, y: 0 };

            this.evalDebounceTimer = null;
            this.autoEvaluate = true;
            this._mounted = false;
            this._rafId = 0;

            if (this.container && this.container.id) {
                try { this.init(); } catch (e) {
                    console.warn('[GeometryNodeEditor] auto init deferred:', e);
                }
            }
        }

        // =====================================================================
        // INIT
        // =====================================================================

        init() {
            if (this.isInitialized) return this;
            this._injectBlenderStyles();
            if (!this.container.querySelector('.editor-container-nodes')) {
                this.setupUI();
            }
            this.canvas = document.getElementById('geo-graph-canvas');
            if (this.canvas) this.ctx = this.canvas.getContext('2d');

            this.setupCanvasEvents();
            this.startRenderLoop();
            this.resize();
            this.setupPreviewViewport();

            window.addEventListener('resize', () => {
                if (!this.container.offsetParent) return;
                this.resize();
            });

            // Default starter graph (Group Input -> Cube -> Subdivide -> Output)
            if (this.graph.nodes.length === 0) {
                const output = this.graph.addNode('Geometry_Output', 620, 180, this.registry);
                const cube = this.graph.addNode('Cube', 180, 120, this.registry);
                const subdiv = this.graph.addNode('Subdivide', 400, 140, this.registry);
                if (cube && subdiv && output) {
                    this.graph.addConnection(cube.id, 0, subdiv.id, 0);
                    this.graph.addConnection(subdiv.id, 0, output.id, 0);
                }
            }

            this.isInitialized = true;
            this.scheduleEvaluate();
            return this;
        }

        _injectBlenderStyles() {
            if (document.getElementById('sm-geometry-nodes-v2-styles')) return;
            const style = document.createElement('style');
            style.id = 'sm-geometry-nodes-v2-styles';
            style.textContent = `
                .node-geo-editor-container{
                    --gn-bg:#2b2b2b;--gn-panel:#303030;--gn-header:#343434;
                    --gn-border:#202020;--gn-border-soft:#454545;--gn-text:#d8d8d8;
                    --gn-dim:#888;--gn-hover:#3b3b3b;--gn-active:#4a4a4a;
                    width:100%;height:100%;min-height:0;display:flex;flex-direction:column;
                    background:var(--gn-bg);color:var(--gn-text);overflow:hidden;
                    font-family:Inter,"Segoe UI",Arial,sans-serif;
                }
                .node-geo-editor-container *{box-sizing:border-box}
                .geo-editor-dock-layout{display:flex;flex:1 1 0;min-height:0;overflow:hidden;background:#2b2b2b}
                .geo-library-sidebar{width:250px;min-width:180px;display:flex;flex-direction:column;background:#303030;border-right:1px solid #202020}
                .geo-properties-sidebar{width:300px;min-width:220px;display:flex;flex-direction:column;background:#303030;border-left:1px solid #202020}
                .node-geo-editor-container .sidebar-header{height:31px;min-height:31px;display:flex;align-items:center;padding:0 9px;background:#343434;border-bottom:1px solid #222;color:#cfcfcf;font-size:10px;font-weight:700;letter-spacing:.08em}
                .node-geo-editor-container .search-box{padding:7px;background:#2e2e2e;border-bottom:1px solid #242424}
                .node-geo-editor-container .search-input{width:100%;height:27px;border:1px solid #484848;background:#272727;color:#ddd;padding:0 8px;outline:none;font-size:11px}
                .node-geo-editor-container .search-input:focus{border-color:#707983}
                .node-geo-editor-container .node-categories{flex:1 1 0;min-height:0;overflow:auto;padding:2px 0 8px}
                .node-geo-editor-container .node-categories summary{min-height:27px;display:flex;align-items:center;gap:6px;padding:0 8px;background:#303030;color:#9b9b9b;font-size:10px;cursor:pointer;user-select:none}
                .node-geo-editor-container .node-categories summary:hover{background:#383838;color:#ddd}
                .node-geo-editor-container .node-item{width:100%;min-height:27px;border:0;background:#2d2d2d;color:#aaa;display:flex;align-items:center;gap:7px;padding:0 9px;font-size:10px;text-align:left;cursor:pointer}
                .node-geo-editor-container .node-item:hover{background:#3b3b3b;color:#fff}
                .node-geo-editor-container .node-icon{width:8px;height:8px;border-radius:50%;flex:0 0 auto}
                .node-geo-editor-container .sidebar-footer{padding:7px;border-top:1px solid #232323;background:#2d2d2d}
                .node-geo-editor-container .max-btn,.node-geo-editor-container .toolbar-btn{
                    height:25px;border:0;background:#3a3a3a;color:#ccc;font-size:10px;padding:0 8px;cursor:pointer;outline:none
                }
                .node-geo-editor-container .max-btn:hover,.node-geo-editor-container .toolbar-btn:hover{background:#474747;color:#fff}
                .node-geo-editor-container .toolbar-btn.primary,.node-geo-editor-container .max-btn.primary{background:#4b5967;color:#fff}
                .node-geo-editor-container .full-width{width:100%}
                .geo-canvas-workspace{position:relative;flex:1 1 0;min-width:0;min-height:0;overflow:hidden;background:#303030}
                .node-geo-editor-container .editor-toolbar-node{position:absolute;left:0;right:0;top:0;z-index:20;height:32px;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:5px;padding:0 6px;background:#343434;border-bottom:1px solid #202020;user-select:none}
                .node-geo-editor-container .toolbar-left,.node-geo-editor-container .toolbar-center,.node-geo-editor-container .toolbar-right{display:flex;align-items:center;gap:3px;min-width:0}
                .node-geo-editor-container .toolbar-center{justify-content:center}.node-geo-editor-container .toolbar-right{justify-content:flex-end}
                .node-geo-editor-container .toolbar-hint{font-size:9px;color:#777;white-space:nowrap}
                .node-geo-editor-container .zoom-indicator{min-width:42px;text-align:center;color:#aaa;font-size:10px;font-variant-numeric:tabular-nums}
                .geo-toolbar-status{font-size:9px;color:#999;max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
                .gn-toggle{height:25px;display:flex;align-items:center;gap:4px;padding:0 6px;background:#333;color:#aaa;font-size:10px;cursor:pointer}
                .gn-toggle:hover{background:#3d3d3d;color:#ddd}.gn-toggle input{margin:0;accent-color:#7d8791}
                .geo-graph-canvas{position:absolute;left:0;right:0;top:32px;bottom:22px;width:100%;height:calc(100% - 54px);display:block;background:#303030;outline:none}
                .geo-statusbar{position:absolute;left:0;right:0;bottom:0;height:22px;z-index:18;display:flex;align-items:center;justify-content:space-between;padding:0 8px;background:#303030;border-top:1px solid #222;color:#777;font-size:9px;user-select:none}
                .geo-statusbar span{white-space:nowrap}
                #geo-minimap{position:absolute;z-index:14;right:9px;bottom:31px;width:170px;height:104px;background:rgba(42,42,42,.95);border:1px solid #4c4c4c;pointer-events:none}
                .geo-preview-viewport{height:220px;min-height:150px;background:#383838;border-bottom:1px solid #242424;position:relative;overflow:hidden}
                .geo-properties-sidebar .properties-panel{flex:1 1 0;min-height:0;overflow:auto;background:#303030}
                .geo-context-menu{border-radius:0!important;background:#303030!important;border-color:#4a4a4a!important;box-shadow:0 8px 24px rgba(0,0,0,.4)!important}
                .node-geo-editor-container input,.node-geo-editor-container select{border-radius:0!important}
                .node-geo-editor-container .scrollbar-custom{scrollbar-width:thin;scrollbar-color:#555 #2a2a2a}
                .node-geo-editor-container .scrollbar-custom::-webkit-scrollbar{width:8px;height:8px}
                .node-geo-editor-container .scrollbar-custom::-webkit-scrollbar-track{background:#2a2a2a}
                .node-geo-editor-container .scrollbar-custom::-webkit-scrollbar-thumb{background:#555;border:2px solid #2a2a2a}
            `;
            document.head.appendChild(style);
        }

        setGridVisible(enabled) {
            this.showGrid = !!enabled;
            const el = document.getElementById('geo-grid-toggle');
            if (el) el.checked = this.showGrid;
        }

        setSnapToGrid(enabled) {
            this.snapToGrid = !!enabled;
            const el = document.getElementById('geo-snap-toggle');
            if (el) el.checked = this.snapToGrid;
        }

        resetView() {
            this.zoom = 1;
            this.panX = 0;
            this.panY = 0;
            this.updateZoomIndicator();
        }

        _snapSelectedNodes() {
            if (!this.snapToGrid) return;
            const step = Math.max(5, this.gridSize * 0.5);
            this.selectedNodes.forEach(n => {
                n.x = Math.round(n.x / step) * step;
                n.y = Math.round(n.y / step) * step;
            });
        }

        // ======================================================================
        // GLOBAL API SHIMS (compat with panel manager)
        // ======================================================================

        refreshDOMReferences() {
            this.canvas = document.getElementById('geo-graph-canvas');
            if (this.canvas) this.ctx = this.canvas.getContext('2d');
            this.resize();
        }

        spawnNode(type, color = null, x = 80, y = 80) {
            const before = NodeSerializer.toJSON(this.graph);
            const node = this.graph.addNode(type, x, y, this.registry);
            if (!node) return null;
            if (color) node.color = color;
            const after = () => NodeSerializer.toJSON(this.graph);
            this.history.pushSnapshot('Add node', before, after);
            this._onGraphChanged();
            return node;
        }

        spawnNodeAtCenter(type) {
            const cx = (this.canvas ? this.canvas.width : 400) / 2;
            const cy = (this.canvas ? this.canvas.height : 300) / 2;
            const world = this.screenToWorld({ x: cx, y: cy });
            const n = this.spawnNode(type, null, world.x, world.y);
            if (n) this.setSelectedNodes([n]);
            return n;
        }

        addNode(type, x, y) {
            const before = NodeSerializer.toJSON(this.graph);
            const node = this.graph.addNode(type, x, y, this.registry);
            if (node) {
                const after = () => NodeSerializer.toJSON(this.graph);
                this.history.pushSnapshot('Add node', before, after);
                this._onGraphChanged();
            }
            return node;
        }

        // ======================================================================
        // GRAPH MUTATIONS (recorded in history)
        // ======================================================================

        deleteNode(nodeId) {
            const before = NodeSerializer.toJSON(this.graph);
            const node = this.graph.findNode(nodeId);
            if (!node) return;
            this.graph.removeNode(nodeId);
            this.selectedNodes = this.selectedNodes.filter(n => n.id !== nodeId);
            if (this.selectedNode && this.selectedNode.id === nodeId) {
                this.selectedNode = null;
                this.updatePropertiesPanel();
            }
            const after = () => NodeSerializer.toJSON(this.graph);
            this.history.pushSnapshot('Delete node', before, after);
            this._onGraphChanged();
        }

        duplicateNode(nodeId) {
            const src = this.graph.findNode(nodeId);
            if (!src) return;
            const before = NodeSerializer.toJSON(this.graph);
            const clone = this.graph.addNode(src.type, src.x + 30, src.y + 30, this.registry);
            if (!clone) return;
            clone.value = Array.isArray(src.value) ? [...src.value] : src.value;
            clone.params = Object.assign({}, src.params || {});
            if (src.inputs) clone.inputs = src.inputs.map(i => ({ ...i }));
            if (src.outputs) clone.outputs = src.outputs.map(o => ({ ...o }));
            this.graph._updateHeight(clone);
            this.setSelectedNodes([clone]);
            const after = () => NodeSerializer.toJSON(this.graph);
            this.history.pushSnapshot('Duplicate node', before, after);
            this._onGraphChanged();
        }

        createConnection(fromId, fromSocket, toId, toSocket) {
            const fromNode = this.graph.findNode(fromId);
            const toNode = this.graph.findNode(toId);
            const res = this._validateConnection(fromNode, fromSocket, toNode, toSocket);
            if (!res.valid) {
                this.showNotification('Invalid connection: ' + (res.errors[0] || 'type mismatch'), 'error');
                return false;
            }
            const before = NodeSerializer.toJSON(this.graph);
            if (!this.graph.addConnection(fromId, fromSocket, toId, toSocket)) {
                this.showNotification('Circular dependency blocked', 'error');
                return false;
            }
            const after = () => NodeSerializer.toJSON(this.graph);
            this.history.pushSnapshot('Connect', before, after);
            this._onGraphChanged();
            return true;
        }

        updateNodePosition(nodeId, dx, dy) {
            const n = this.graph.findNode(nodeId);
            if (n) { n.x += dx; n.y += dy; }
        }

        setNodeParam(nodeId, name, val) {
            const n = this.graph.findNode(nodeId);
            if (!n) return;
            n.params = n.params || {};
            n.params[name] = val;
            this.graph.markDirty(nodeId);
            this.evaluator.markDownstream(nodeId);
            this.scheduleEvaluate();
        }

        // ======================================================================
        // VALIDATION
        // ======================================================================

        _validateConnection(fromNode, fromSocket, toNode, toSocket) {
            return this.graph.validateConnection(fromNode, toNode, fromSocket, toSocket);
        }

        updateZoomIndicator() {
            const el = document.getElementById('geo-zoom-val');
            if (el) el.textContent = Math.round(this.zoom * 100) + '%';
        }

        // ======================================================================
        // EVALUATION (delegated to core evaluator)
        // ======================================================================

        _onGraphChanged() {
            this.updatePropertiesPanel();
            this.scheduleEvaluate();
        }

        scheduleEvaluate() {
            if (!this.autoEvaluate) return;
            if (this.evalDebounceTimer) clearTimeout(this.evalDebounceTimer);
            this.evalDebounceTimer = setTimeout(() => this.evaluateGraph(false), 200);
        }

        evaluateGraph(force) {
            if (!this.canvas) return null;
            if (this.evalDebounceTimer) clearTimeout(this.evalDebounceTimer);
            const res = this.evaluator.evaluate({ force: !!force });
            this.previewResult = res.geometry || null;
            this.previewMaterial = res.material || window.GeometryData?.from?.(res.geometry)?.material || null;
            this.lastEval = res;
            this._renderPreviewMesh(this.previewResult, this.previewMaterial);
            this.updateStatusBar(res);
            return this.previewResult;
        }

        updateStatusBar(res) {
            const el = document.getElementById('geo-status');
            const left = document.getElementById('geo-status-left');
            const right = document.getElementById('geo-status-right');

            if (left) left.textContent = `${this.nodes.length} Nodes · ${this.connections.length} Links`;

            if (res) {
                const errs = this.nodes.filter(n => n.evalError);
                if (el) {
                    el.textContent = errs.length
                        ? `⚠ ${errs.length} error(s) · ${res.totalTime} ms`
                        : `Evaluated ${res.changedNodes.length} · ${res.totalTime} ms`;
                }

                if (right) {
                    const d = window.GeometryData?.from?.(res.geometry);
                    const stats = d?.stats?.() || { vertices:0, triangles:0, instances:0 };
                    right.textContent = `${stats.vertices} verts · ${stats.triangles} tris · ${stats.instances} instances`;
                }
            }
        }

        evaluatorChanged() { /* hook for future reactive UI */ }

        // ======================================================================
        // DATA I/O
        // ======================================================================

        exportGraph(name) {
            const json = NodeSerializer.toJSON(this.graph, { name: name || 'Untitled' });
            const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = (name || 'geometry-graph') + '.gnode';
            a.click();
            URL.revokeObjectURL(a.href);
            this.showNotification('Graph saved (.gnode)', 'success');
        }

        importGraph(file) {
            const reader = new FileReader();
            reader.onload = () => {
                try {
                    const before = NodeSerializer.toJSON(this.graph);
                    NodeSerializer.fromJSON(reader.result, this.registry, this.graph);
                    this._syncRefs();
                    const after = () => NodeSerializer.toJSON(this.graph);
                    this.history.pushSnapshot('Import graph', before, after);
                    this.evaluateGraph(true);
                    this.showNotification('Graph imported', 'success');
                } catch (err) {
                    console.error('[GeometryNodeEditor] import failed:', err);
                    this.showNotification('Import failed: ' + err.message, 'error');
                }
            };
            reader.readAsText(file);
        }

        _syncRefs() {
            this.nodes = this.graph.nodes;
            this.connections = this.graph.connections;
            this.groups = this.graph.groups;
        }

        // ======================================================================
        // SOCKET GEOMETRY / HIT TESTING
        // ======================================================================

        getSocketPosition(node, kind, index) {
            const yOff = 44 + index * 24;
            if (kind === 'output') return { x: node.x + node.w, y: node.y + yOff };
            return { x: node.x, y: node.y + yOff };
        }

        socketHitTest(sx, sy) {
            for (const node of this.nodes) {
                for (let i = 0; i < node.inputs.length; i++) {
                    const p = this.getSocketPosition(node, 'input', i);
                    if (Math.hypot(sx - p.x, sy - p.y) < 10) return { node, kind: 'input', index: i, pos: p };
                }
                for (let i = 0; i < node.outputs.length; i++) {
                    const p = this.getSocketPosition(node, 'output', i);
                    if (Math.hypot(sx - p.x, sy - p.y) < 10) return { node, kind: 'output', index: i, pos: p };
                }
            }
            return null;
        }

        nodeAt(sx, sy) {
            for (let i = this.nodes.length - 1; i >= 0; i--) {
                const n = this.nodes[i];
                if (sx >= n.x && sx <= n.x + n.w && sy >= n.y && sy <= n.y + n.h) return n;
            }
            return null;
        }

        // ======================================================================
        // VIEW TRANSFORMS
        // ======================================================================

        screenToWorld(s) {
            return { x: (s.x - this.panX) / this.zoom, y: (s.y - this.panY) / this.zoom };
        }

        fitToView() {
            if (!this.nodes.length) return;
            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
            this.nodes.forEach(n => {
                minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x + n.w);
                minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y + n.h);
            });
            const pad = 60;
            const w = (maxX - minX) + pad * 2;
            const h = (maxY - minY) + pad * 2;
            const cw = this.canvas ? (this.canvas.clientWidth || 800) : 800;
            const ch = this.canvas ? (this.canvas.clientHeight || 600) : 600;
            this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, Math.min(cw / w, ch / h)));
            this.panX = (cw - w * this.zoom) / 2 + pad * this.zoom;
            this.panY = (ch - h * this.zoom) / 2 + pad * this.zoom;
            this.updateZoomIndicator();
        }

        clearGraph() {
            const ids = this.nodes.filter(n => !n.isOutput).map(n => n.id);
            if (!ids.length) return;
            const before = NodeSerializer.toJSON(this.graph);
            ids.forEach(id => this.graph.removeNode(id));
            const after = () => NodeSerializer.toJSON(this.graph);
            this.history.pushSnapshot('Clear graph', before, after);
            this.selectedNodes = [];
            this.selectedNode = null;
            this.selectedGroup = null;
            this.updatePropertiesPanel();
            this._onGraphChanged();
        }

        // ======================================================================
        // UI SETUP
        // ======================================================================

        _buildLibraryHTML() {
            const categories = this.registry.listByCategory();
            return Object.entries(categories).map(([cat, items]) => `
                <details open>
                    <summary><i class="fas fa-folder"></i> ${cat}</summary>
                    ${items.map(def => `
                        <button class="node-item" data-spawn="${def.type}"
                            style="border-left:3px solid ${def.color || '#888'};">
                            <span class="node-icon" style="background-color:${def.color || '#888'};"></span>
                            ${def.displayName}
                        </button>`).join('')}
                </details>`).join('');
        }

        setupUI() {
            this.container.classList.add('node-geo-editor-container');
            this.container.innerHTML = `
                <div class="editor-container-nodes geo-editor-dock-layout">
                    <div class="node-library-sidebar geo-library-sidebar">
                        <div class="sidebar-header">GEOMETRY NODES</div>
                        <div class="search-box">
                            <input type="text" id="geo-node-search" placeholder="Search nodes…" class="search-input" autocomplete="off">
                        </div>
                        <div class="node-categories scrollbar-custom" id="geo-node-library-list">
                            ${this._buildLibraryHTML()}
                        </div>
                        <div class="sidebar-footer">
                            <button class="max-btn primary full-width" onclick="geometryNodeEditor.applyToObject()">Apply To Object</button>
                        </div>
                    </div>

                    <div class="canvas-workspace geo-canvas-workspace">
                        <div class="editor-toolbar-node">
                            <div class="toolbar-left">
                                <button class="toolbar-btn" onclick="geometryNodeEditor.fitToView()" title="Frame all nodes (Home)">Frame All</button>
                                <button class="toolbar-btn" onclick="geometryNodeEditor.resetView()">Reset View</button>
                                <button class="toolbar-btn" onclick="geometryNodeEditor.exportSave()">Save</button>
                                <button class="toolbar-btn" onclick="geometryNodeEditor.importGraphPrompt()">Open</button>
                                <button class="toolbar-btn" onclick="geometryNodeEditor.undo()">Undo</button>
                                <button class="toolbar-btn" onclick="geometryNodeEditor.redo()">Redo</button>
                                <label class="gn-toggle"><input id="geo-grid-toggle" type="checkbox" ${this.showGrid ? 'checked' : ''} onchange="geometryNodeEditor.setGridVisible(this.checked)"> Grid</label>
                                <label class="gn-toggle"><input id="geo-snap-toggle" type="checkbox" ${this.snapToGrid ? 'checked' : ''} onchange="geometryNodeEditor.setSnapToGrid(this.checked)"> Snap</label>
                            </div>
                            <div class="toolbar-center">
                                <span id="geo-zoom-val" class="zoom-indicator">100%</span>
                                <span class="toolbar-hint">Shift+A Add · Space+Drag Pan · Wheel Zoom · Home Frame All</span>
                            </div>
                            <div class="toolbar-right">
                                <label class="gn-toggle"><input type="checkbox" ${this.autoEvaluate ? 'checked' : ''} onchange="geometryNodeEditor.autoEvaluate=this.checked"> Auto</label>
                                <span id="geo-status" class="geo-toolbar-status">Ready</span>
                                <button class="toolbar-btn primary" onclick="geometryNodeEditor.evaluateGraph(true)">Evaluate</button>
                            </div>
                        </div>

                        <canvas id="geo-graph-canvas" class="geo-graph-canvas" tabindex="0"></canvas>
                        <canvas id="geo-minimap" width="340" height="208"></canvas>
                        <div class="geo-statusbar">
                            <span id="geo-status-left">0 Nodes · 0 Links</span>
                            <span id="geo-status-right">0 verts · 0 tris · 0 instances</span>
                        </div>
                    </div>

                    <div class="properties-sidebar geo-properties-sidebar">
                        <div class="sidebar-header">NODE DETAILS</div>
                        <div id="geo-preview-viewport" class="geo-preview-viewport"></div>
                        <div class="properties-panel scrollbar-custom" id="geo-properties-panel">
                            <div class="placeholder">Select a node to edit</div>
                        </div>
                    </div>
                </div>

                <div id="geo-context-menu" class="geo-context-menu"
                    style="display:none;position:fixed;z-index:9999;min-width:180px;"></div>
                <div id="geo-search-menu" class="geo-context-menu"
                    style="display:none;position:fixed;z-index:9999;min-width:280px;max-height:65vh;overflow:auto;"></div>`;

            const searchBox = document.getElementById('geo-node-search');
            if (searchBox) {
                searchBox.addEventListener('input', (e) => {
                    const q = e.target.value.toLowerCase();
                    document.querySelectorAll('#geo-node-library-list .node-item').forEach(btn => {
                        btn.style.display = btn.textContent.toLowerCase().includes(q) ? 'flex' : 'none';
                    });
                    document.querySelectorAll('#geo-node-library-list details').forEach(d => {
                        const any = [...d.querySelectorAll('.node-item')].some(b => b.style.display !== 'none');
                        d.style.display = any ? '' : 'none';
                    });
                });
            }

            const library = document.getElementById('geo-node-library-list');
            if (library) {
                library.addEventListener('click', (e) => {
                    const btn = e.target.closest('.node-item[data-spawn]');
                    if (!btn) return;
                    const type = btn.dataset.spawn;
                    const node = this.spawnNodeAtCenter(type);
                    if (node) this.setSelectedNodes([node]);
                });
            }

            const ctxMenu = document.getElementById('geo-context-menu');
            if (ctxMenu) {
                ctxMenu.addEventListener('click', (e) => {
                    if (e.target.tagName === 'BUTTON' && e.target.dataset.action) {
                        this._handleContextAction(e.target.dataset.action);
                    }
                });
                ctxMenu.addEventListener('contextmenu', (e) => e.preventDefault());
            }
            window.addEventListener('mousedown', (e) => {
                if (ctxMenu && ctxMenu.style.display !== 'none' && !ctxMenu.contains(e.target)) {
                    ctxMenu.style.display = 'none';
                }
                this._hideSearchMenu();
            });
        }

        exportSave() {
            this.exportGraph();
        }

        undo() {
            const ok = this.history.undo();
            if (ok) { this._syncRefs(); this.evaluateGraph(true); }
        }

        redo() {
            const ok = this.history.redo();
            if (ok) { this._syncRefs(); this.evaluateGraph(true); }
        }

        importGraphPrompt() {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.gnode,application/json';
            input.onchange = () => {
                if (input.files && input.files[0]) this.importGraph(input.files[0]);
            };
            input.click();
        }

        _hideSearchMenu() {
            const m = document.getElementById('geo-search-menu');
            if (m) m.style.display = 'none';
        }

        // ======================================================================
        // SELECTION
        // ======================================================================

        setSelectedNodes(nodes) {
            this.selectedNodes = nodes ? [...new Set(nodes)] : [];
            this.selectedNode = this.selectedNodes.length === 1 ? this.selectedNodes[0] : null;
            this.selectedGroup = null;
            this.updatePropertiesPanel();
        }

        // ======================================================================
        // CONTEXT / SEARCH MENU
        // ======================================================================

        showContextMenu(e, node) {
            const menu = document.getElementById('geo-context-menu');
            if (!menu) return;
            this.contextMenuTarget = node || null;
            const items = node
                ? [
                    { action: 'duplicate', label: 'Duplicate (Ctrl+D)' },
                    { action: 'group', label: 'Group Selection' },
                    { action: 'delete', label: 'Delete' },
                    { action: 'separator' },
                    { action: 'evaluate', label: 'Evaluate Graph' },
                ]
                : [
                    { action: 'fit', label: 'Fit View' },
                    { action: 'evaluate', label: 'Evaluate Graph' },
                    { action: 'separator' },
                    { action: 'add', label: 'Add Node (Shift+A)' },
                    { action: 'clear', label: 'Clear Graph' },
                ];
            menu.innerHTML = items.map(i => i.action === 'separator'
                ? '<div style="height:1px;background:#2a2a2a;margin:4px 0;"></div>'
                : `<button data-action="${i.action}" style="display:block;width:100%;text-align:left;background:none;border:none;color:#ccc;padding:7px 12px;font-size:11px;cursor:pointer;">${i.label}</button>`).join('');
            menu.style.display = 'block';
            menu.style.left = Math.min(e.clientX, window.innerWidth - 200) + 'px';
            menu.style.top = Math.min(e.clientY, window.innerHeight - 200) + 'px';
        }

        _handleContextAction(action) {
            const menu = document.getElementById('geo-context-menu');
            if (menu) menu.style.display = 'none';
            switch (action) {
                case 'duplicate':
                    if (this.contextMenuTarget) this.duplicateNode(this.contextMenuTarget.id);
                    break;
                case 'group':
                    this.createGroupFromSelection();
                    break;
                case 'delete':
                    if (this.contextMenuTarget) this.deleteNode(this.contextMenuTarget.id);
                    break;
                case 'fit': this.fitToView(); break;
                case 'add': this.openSearchMenuAt(this._lastContextEvent); break;
                case 'evaluate': this.evaluateGraph(true); break;
                case 'clear': this.clearGraph(); break;
            }
            this.contextMenuTarget = null;
        }

        openSearchMenuAt(e) {
            this._lastContextEvent = e;
            const menu = document.getElementById('geo-search-menu');
            if (!menu) return;
            const cats = this.registry.listByCategory();
            let html = '<div style="padding:8px 10px;font-size:10px;color:#aaa;border-bottom:1px solid #2a2a2a;">Add Node <span style="color:#555;">(type to search)</span></div>';
            html += '<input id="geo-search-input" placeholder="Search…" style="width:100%;background:#101010;border:none;color:#ddd;padding:8px 10px;font-size:11px;outline:none;box-sizing:border-box;border-bottom:1px solid #2a2a2a;">';
            Object.entries(cats).forEach(([cat, items]) => {
                let section = '<div class="geo-search-cat">';
                section += '<div style="padding:6px 10px;font-size:9px;color:#777;">' + cat + '</div>';
                items.forEach(def => {
                    const col = def.color || '#888';
                    section += '<button type="button" data-spawn="' + def.type + '" style="display:flex;width:100%;text-align:left;background:none;border:none;color:#ccc;padding:5px 10px;font-size:11px;cursor:pointer;align-items:center;gap:8px;">';
                    section += '<span style="width:8px;height:8px;background:' + col + ';border-radius:50%;display:inline-block;flex-shrink:0;"></span>';
                    section += def.displayName + '</button>';
                });
                section += '</div>';
                html += section;
            });
            menu.innerHTML = html;
            menu.style.display = 'block';
            menu.style.left = Math.min(e.clientX, window.innerWidth - 260) + 'px';
            menu.style.top = Math.min(e.clientY, window.innerHeight - 200) + 'px';

            const input = document.getElementById('geo-search-input');
            if (input) {
                input.focus();
                input.addEventListener('input', () => {
                    const s = input.value.toLowerCase();
                    menu.querySelectorAll('.geo-search-cat').forEach(cat => {
                        let visible = 0;
                        cat.querySelectorAll('button').forEach(b => {
                            const show = !s || b.textContent.toLowerCase().includes(s);
                            b.style.display = show ? 'flex' : 'none';
                            if (show) visible++;
                        });
                        cat.style.display = visible ? '' : 'none';
                    });
                });
            }
            menu.querySelectorAll('button[data-spawn]').forEach(btn => {
                btn.addEventListener('click', () => {
                    const type = btn.dataset.spawn;
                    let wx = 200, wy = 100;
                    if (this._lastContextEvent && this.canvas) {
                        const rect = this.canvas.getBoundingClientRect();
                        const px = this._lastContextEvent.clientX - rect.left;
                        const py = this._lastContextEvent.clientY - rect.top;
                        const w = this.screenToWorld({ x: px, y: py });
                        wx = w.x; wy = w.y;
                    }
                    const node = this.addNode(type, wx, wy);
                    if (node) this.setSelectedNodes([node]);
                    this._hideSearchMenu();
                });
            });
        }

        _hideMenu() { this._hideSearchMenu(); }

        // ======================================================================
        // GROUPS
        // ======================================================================

        createGroupFromSelection() {
            const ids = this.selectedNodes.map(n => n.id);
            if (!ids.length) return;
            const before = NodeSerializer.toJSON(this.graph);
            const group = {
                id: 'group_' + (this.graph.groupIdCounter++),
                nodeIds: ids,
                title: 'Group',
                stroke: '#8a6736',
                x: Math.min(...this.selectedNodes.map(n => n.x)) - 30,
                y: Math.min(...this.selectedNodes.map(n => n.y)) - 30,
                w: Math.max(...this.selectedNodes.map(n => n.x + n.w)) - Math.min(...this.selectedNodes.map(n => n.x)) + 60,
                h: Math.max(...this.selectedNodes.map(n => n.y + n.h)) - Math.min(...this.selectedNodes.map(n => n.y)) + 60,
            };
            this.graph.groups.push(group);
            this.selectedGroup = group;
            this.selectedNode = null;
            this.updatePropertiesPanel();
            const after = () => NodeSerializer.toJSON(this.graph);
            this.history.pushSnapshot('Create group', before, after);
        }

        // ======================================================================
        // CANVAS EVENTS
        // ======================================================================

        setupCanvasEvents() {
            const canvas = this.canvas;
            if (!canvas) return;

            canvas.addEventListener('wheel', (e) => {
                e.preventDefault();
                const rect = canvas.getBoundingClientRect();
                const mx = e.clientX - rect.left, my = e.clientY - rect.top;
                const before = this.screenToWorld({ x: mx, y: my });
                const delta = e.deltaY > 0 ? 0.9 : 1.1;
                this.zoom = Math.min(Math.max(this.zoom * delta, this.minZoom), this.maxZoom);
                const after = this.screenToWorld({ x: mx, y: my });
                this.panX += (after.x - before.x) * this.zoom;
                this.panY += (after.y - before.y) * this.zoom;
                this.updateZoomIndicator();
            }, { passive: false });

            window.addEventListener('keydown', (e) => {
                if (e.code === 'Space' && !e.repeat) {
                    e.preventDefault();
                    this.spacePressed = true;
                }
            });
            window.addEventListener('keyup', (e) => {
                if (e.code === 'Space') this.spacePressed = false;
            });

            canvas.addEventListener('mousedown', (e) => {
                if (e.button === 2) return;
                const m = this.screenToWorld(this._getWorldCanvasAxis(e));
                this.lastMouse = { x: e.clientX, y: e.clientY };

                if (this.spacePressed) {
                    e.preventDefault();
                    this.isPanning = true;
                    return;
                }

                const socket = this.socketHitTest(m.x, m.y);
                if (socket && socket.kind === 'output') {
                    this.activeLink = {
                        fromNode: socket.node,
                        fromSocket: socket.index,
                        currentX: m.x, currentY: m.y
                    };
                    return;
                }
                if (socket && socket.kind === 'input') {
                    const conn = this.connections.find(c => c.toId === socket.node.id && c.toSocket === socket.index);
                    if (conn) {
                        this._removeConnection(conn);
                        this.activeLink = {
                            fromNode: this.graph.findNode(conn.fromId),
                            fromSocket: conn.fromSocket,
                            currentX: m.x, currentY: m.y
                        };
                        this._onGraphChanged();
                    }
                    return;
                }

                const node = this.nodeAt(m.x, m.y);
                if (node) {
                    const group = this.groups.find(g => (g.nodeIds || []).includes(node.id));
                    if (group && (group.nodeIds.length > 1 || !this.selectedNodes.includes(node))) {
                        const allInGroup = this.selectedNodes.length > 1
                            && this.selectedNodes.every(sn => group.nodeIds.includes(sn.id));
                        if (allInGroup) {
                            this.draggedGroup = group;
                        } else {
                            this.draggedNode = node;
                        }
                    } else {
                        this.draggedNode = node;
                    }
                    if (!this.selectedNodes.includes(node)) this.setSelectedNodes([node]);
                    else this.updatePropertiesPanel();
                    this._syncRefs();
                    this.nodes.splice(this.nodes.indexOf(node), 1);
                    this.nodes.push(node);
                } else {
                    if (!this.spacePressed && !e.ctrlKey) this.setSelectedNodes([]);
                    this.selectionRect = { x: m.x, y: m.y, w: 0, h: 0 };
                    this.isSelecting = true;
                }
            });

            window.addEventListener('mousemove', (e) => {
                const dx = e.clientX - this.lastMouse.x;
                const dy = e.clientY - this.lastMouse.y;

                if (this.isPanning) {
                    this.panX += dx;
                    this.panY += dy;
                } else if (this.draggedNode) {
                    this._dragStartState = this._dragStartState || NodeSerializer.toJSON(this.graph);
                    this.draggedNode.x += dx / this.zoom;
                    this.draggedNode.y += dy / this.zoom;
                } else if (this.draggedGroup) {
                    this._dragStartState = this._dragStartState || NodeSerializer.toJSON(this.graph);
                    this.draggedGroup.x += dx / this.zoom;
                    this.draggedGroup.y += dy / this.zoom;
                    this.draggedGroup.nodeIds.forEach(id => {
                        const n = this.graph.findNode(id);
                        if (n) { n.x += dx / this.zoom; n.y += dy / this.zoom; }
                    });
                } else if (this.activeLink) {
                    const m = this.screenToWorld(this._getWorldCanvasAxis(e));
                    this.activeLink.currentX = m.x;
                    this.activeLink.currentY = m.y;
                    this._updateHover(m);
                } else if (this.isSelecting) {
                    const m = this.screenToWorld(this._getWorldCanvasAxis(e));
                    this.selectionRect.w = m.x - this.selectionRect.x;
                    this.selectionRect.h = m.y - this.selectionRect.y;
                }

                this.lastMouse = { x: e.clientX, y: e.clientY };
            });

            window.addEventListener('mouseup', (e) => {
                if (this.activeLink) {
                    const m = this.screenToWorld(this._getWorldCanvasAxis(e));
                    const target = this.socketHitTest(m.x, m.y);
                    if (target && target.kind === 'input') {
                        this.createConnection(
                            this.activeLink.fromNode.id, this.activeLink.fromSocket,
                            target.node.id, target.index
                        );
                    }
                }
                if (this.isSelecting && this.selectionRect) {
                    const r = this.selectionRect;
                    const x0 = Math.min(r.x, r.x + r.w), x1 = Math.max(r.x, r.x + r.w);
                    const y0 = Math.min(r.y, r.y + r.h), y1 = Math.max(r.y, r.y + r.h);
                    const picked = this.nodes.filter(n => n.x < x1 && n.x + n.w > x0 && n.y < y1 && n.y + n.h > y0);
                    if (picked.length) this.setSelectedNodes(picked);
                }
                if (this._dragStartState) {
                    if (this.snapToGrid) this._snapSelectedNodes();
                    this.history.pushSnapshot('Move node', this._dragStartState, () => NodeSerializer.toJSON(this.graph));
                    this._dragStartState = null;
                }
                this.draggedNode = null;
                this.draggedGroup = null;
                this.isPanning = false;
                this.activeLink = null;
                this.isSelecting = false;
                this.selectionRect = null;
            });

            canvas.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                this._lastContextEvent = e;
                const m = this.screenToWorld(this._getWorldCanvasAxis(e));
                const node = this.nodeAt(m.x, m.y);
                this.showContextMenu(e, node);
            });

            window.addEventListener('keydown', (e) => {
                const tag = (document.activeElement || {}).tagName;
                if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
                if ((e.key === 'Delete' || e.key === 'Backspace') && this.selectedNodes.length) {
                    e.preventDefault();
                    this.selectedNodes.forEach(n => this.deleteNode(n.id));
                }
                if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd' && this.selectedNode) {
                    e.preventDefault();
                    this.duplicateNode(this.selectedNode.id);
                }
                if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'g' && this.selectedNodes.length > 1) {
                    e.preventDefault();
                    this.createGroupFromSelection();
                }
                if (e.shiftKey && (e.key.toLowerCase() === 'a')) {
                    e.preventDefault();
                    const rect = canvas.getBoundingClientRect();
                    this._lastContextEvent = { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 };
                    this.openSearchMenuAt(this._lastContextEvent);
                }
                if (e.key === 'Home') {
                    e.preventDefault();
                    this.fitToView();
                }
                if (e.key.toLowerCase() === 'g' && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
                    this.setGridVisible(!this.showGrid);
                }
            });

            // Register a single canonical keydown for undo/redo
            const keyHandler = (e) => {
                const tag = (document.activeElement || {}).tagName;
                if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
                if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
                    e.preventDefault();
                    this.undo();
                }
                if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) {
                    e.preventDefault();
                    this.redo();
                }
            };
            window.removeEventListener('keydown', keyHandler);
            window.addEventListener('keydown', keyHandler);
        }

        _getWorldCanvasAxis(e) {
            const rect = this.canvas.getBoundingClientRect();
            return { x: e.clientX - rect.left, y: e.clientY - rect.top };
        }

        _getWorldCanvas(e) {
            return this._getWorldCanvasAxis(e);
        }

        _updateHover(m) {
            for (const node of this.nodes) {
                for (let i = 0; i < node.inputs.length; i++) {
                    const p = this.getSocketPosition(node, 'input', i);
                    if (Math.hypot(m.x - p.x, m.y - p.y) < 12) {
                        this.hoveredSocket = { node, kind: 'input', index: i, pos: p };
                        return;
                    }
                }
            }
            this.hoveredSocket = null;
        }

        _removeConnection(conn) {
            const before = NodeSerializer.toJSON(this.graph);
            this.graph.removeConnectionById(conn);
            const after = () => NodeSerializer.toJSON(this.graph);
            this.history.pushSnapshot('Disconnect', before, after);
        }

        _dragHistory() { }

        // ======================================================================
        // RENDER LOOP
        // ======================================================================

        startRenderLoop() {
            if (typeof requestAnimationFrame !== 'function') return;
            const tick = () => {
                this._rafId = requestAnimationFrame(tick);
                this.draw();
                this._tickPreview();
            };
            this._rafId = requestAnimationFrame(tick);
        }

        draw() {
            if (!this.ctx || !this.canvas) return;
            const ctx = this.ctx;
            const w = this.canvas.clientWidth || 1;
            const h = this.canvas.clientHeight || 1;
            ctx.clearRect(0, 0, w, h);
            ctx.fillStyle = '#303030';
            ctx.fillRect(0, 0, w, h);

            if (this.showGrid) this.drawGrid(ctx, w, h);
            ctx.save();
            ctx.translate(this.panX, this.panY);
            ctx.scale(this.zoom, this.zoom);
            ctx.lineWidth = 1 / this.zoom;

            this.groups.forEach(g => this.drawGroup(ctx, g));
            this.connections.forEach(c => this.drawConnection(ctx, c));
            this.nodes.forEach(n => this.drawNode(ctx, n));

            if (this.activeLink) this.drawActiveLink(ctx);
            if (this.selectionRect) this.drawSelectionRect(ctx);

            ctx.restore();

            this.drawMinimap();
            this.updateStatusBar(this.lastEval);
        }

        drawGrid(ctx, w, h) {
            const base = Math.max(10, this.gridSize);
            let spacing = base * this.zoom;
            let worldStep = base;

            if (spacing < 12) { worldStep *= 4; spacing = worldStep * this.zoom; }
            else if (spacing < 22) { worldStep *= 2; spacing = worldStep * this.zoom; }

            const offX = ((this.panX % spacing) + spacing) % spacing;
            const offY = ((this.panY % spacing) + spacing) % spacing;

            ctx.lineWidth = 1;
            ctx.strokeStyle = '#383838';
            ctx.beginPath();

            let index = 0;
            for (let x = offX; x < w; x += spacing, index++) {
                if (index % this.gridSubdivisions === 0) continue;
                const px = Math.round(x) + 0.5;
                ctx.moveTo(px, 0); ctx.lineTo(px, h);
            }

            index = 0;
            for (let y = offY; y < h; y += spacing, index++) {
                if (index % this.gridSubdivisions === 0) continue;
                const py = Math.round(y) + 0.5;
                ctx.moveTo(0, py); ctx.lineTo(w, py);
            }
            ctx.stroke();

            const major = spacing * this.gridSubdivisions;
            const majorX = ((this.panX % major) + major) % major;
            const majorY = ((this.panY % major) + major) % major;
            ctx.strokeStyle = '#444444';
            ctx.beginPath();
            for (let x = majorX; x < w; x += major) {
                const px = Math.round(x) + 0.5;
                ctx.moveTo(px, 0); ctx.lineTo(px, h);
            }
            for (let y = majorY; y < h; y += major) {
                const py = Math.round(y) + 0.5;
                ctx.moveTo(0, py); ctx.lineTo(w, py);
            }
            ctx.stroke();
        }

        drawMinimap() {
            const canvas = document.getElementById('geo-minimap');
            if (!canvas) return;
            canvas.style.display = this.showMinimap ? 'block' : 'none';
            if (!this.showMinimap) return;

            const ctx = canvas.getContext('2d');
            const w = canvas.width, h = canvas.height;
            ctx.clearRect(0,0,w,h);
            ctx.fillStyle = '#2d2d2d';
            ctx.fillRect(0,0,w,h);

            if (!this.nodes.length) return;

            let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
            this.nodes.forEach(n => {
                minX=Math.min(minX,n.x); minY=Math.min(minY,n.y);
                maxX=Math.max(maxX,n.x+n.w); maxY=Math.max(maxY,n.y+n.h);
            });
            const pad=20;
            const gw=Math.max(1,maxX-minX), gh=Math.max(1,maxY-minY);
            const scale=Math.min((w-pad*2)/gw,(h-pad*2)/gh);
            const tx=pad-minX*scale+(w-pad*2-gw*scale)*0.5;
            const ty=pad-minY*scale+(h-pad*2-gh*scale)*0.5;

            this.connections.forEach(c => {
                const a=this.graph.findNode(c.fromId), b=this.graph.findNode(c.toId);
                if(!a||!b)return;
                ctx.strokeStyle='#5b5b5b';ctx.lineWidth=1;ctx.beginPath();
                ctx.moveTo(tx+(a.x+a.w)*scale,ty+(a.y+30)*scale);
                ctx.lineTo(tx+b.x*scale,ty+(b.y+30)*scale);ctx.stroke();
            });

            this.nodes.forEach(n => {
                ctx.fillStyle=this.selectedNodes.includes(n)?'#b0b0b0':'#666';
                ctx.fillRect(tx+n.x*scale,ty+n.y*scale,Math.max(2,n.w*scale),Math.max(2,n.h*scale));
            });

            const viewLeft=-this.panX/this.zoom;
            const viewTop=-this.panY/this.zoom;
            const viewW=(this.canvas.clientWidth||1)/this.zoom;
            const viewH=(this.canvas.clientHeight||1)/this.zoom;
            ctx.strokeStyle='#d0d0d0';ctx.lineWidth=2;
            ctx.strokeRect(tx+viewLeft*scale,ty+viewTop*scale,viewW*scale,viewH*scale);
            ctx.strokeStyle='#555';ctx.lineWidth=1;ctx.strokeRect(.5,.5,w-1,h-1);
        }

        drawGroup(ctx, g) {
            ctx.strokeStyle = g.stroke || '#8a6736';
            ctx.fillStyle = 'rgba(70,70,70,0.16)';
            ctx.lineWidth = 1.5 / this.zoom;
            ctx.fillRect(g.x, g.y, g.w, g.h);
            ctx.strokeRect(g.x, g.y, g.w, g.h);
            if (g.title) {
                ctx.fillStyle = g.stroke || '#8a6736';
                ctx.font = `12px monospace`;
                ctx.fillText(g.title, g.x + 8, g.y - 6);
            }
        }

        drawConnection(ctx, c) {
            const fromNode = this.graph.findNode(c.fromId);
            const toNode = this.graph.findNode(c.toId);
            if (!fromNode || !toNode) return;
            const p1 = this.getSocketPosition(fromNode, 'output', c.fromSocket);
            const p2 = this.getSocketPosition(toNode, 'input', c.toSocket);
            if (!p1 || !p2) return;

            const type = fromNode.outputs[c.fromSocket]?.type || 'any';
            const color = this._socketColor(type);
            const dx = Math.max(45, Math.min(180, Math.abs(p2.x - p1.x) * 0.5));

            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.bezierCurveTo(p1.x + dx, p1.y, p2.x - dx, p2.y, p2.x, p2.y);
            ctx.strokeStyle = 'rgba(10,10,10,.75)';
            ctx.lineWidth = 4 / this.zoom;
            ctx.lineCap = 'round';
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.bezierCurveTo(p1.x + dx, p1.y, p2.x - dx, p2.y, p2.x, p2.y);
            ctx.strokeStyle = color;
            ctx.lineWidth = 2 / this.zoom;
            ctx.globalAlpha = 0.9;
            ctx.stroke();
            ctx.globalAlpha = 1;
        }

        drawActiveLink(ctx) {
            const link = this.activeLink;
            const fromNode = link.fromNode;
            const p1 = this.getSocketPosition(fromNode, 'output', link.fromSocket);
            if (!p1) return;
            const p2 = { x: link.currentX, y: link.currentY };
            const dx = Math.max(40, (p2.x - p1.x) * 0.5);
            ctx.strokeStyle = 'rgba(255,170,51,0.8)';
            ctx.lineWidth = 2 / this.zoom;
            ctx.setLineDash([6 / this.zoom, 4 / this.zoom]);
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.bezierCurveTo(p1.x + dx, p1.y, p2.x - dx, p2.y, p2.x, p2.y);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = '#ffaa33';
            ctx.beginPath();
            ctx.arc(p2.x, p2.y, 5, 0, Math.PI * 2);
            ctx.fill();
        }

        drawSelectionRect(ctx) {
            const r = this.selectionRect;
            ctx.strokeStyle = '#4a90d9';
            ctx.fillStyle = 'rgba(74,144,217,0.08)';
            ctx.lineWidth = 1 / this.zoom;
            ctx.fillRect(r.x, r.y, r.w, r.h);
            ctx.strokeRect(r.x, r.y, r.w, r.h);
        }

        _socketColor(type) {
            if (window.SOCKET_COLORS) return window.SOCKET_COLORS[type] || '#888888';
            const map = {
                geometry: '#5cb85c', material: '#c39bd3', float: '#b0b0b0',
                integer: '#e0b060', vector: '#5a9fd8', color: '#f0c050',
                boolean: '#e07070', string: '#88aacc', enum: '#888888',
            };
            return map[type] || '#888888';
        }

        _roundRect(x, y, w, h, r) {
            if (typeof r === 'number') r = { tl: r, tr: r, bl: r, br: r };
            const ctx = this.ctx;
            ctx.beginPath();
            ctx.moveTo(x + r.tl, y);
            ctx.lineTo(x + w - r.tr, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r.tr);
            ctx.lineTo(x + w, y + h - r.br); ctx.quadraticCurveTo(x + w, y + h, x + w - r.br, y + h);
            ctx.lineTo(x + r.bl, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r.bl);
            ctx.lineTo(x, y + r.tl); ctx.quadraticCurveTo(x, y, x + r.tl, y);
            ctx.closePath();
        }

        drawNode(ctx, node) {
            const selected = this.selectedNodes.includes(node);
            const x = node.x, y = node.y, w = node.w, h = node.h;

            ctx.fillStyle = 'rgba(0,0,0,0.35)';
            this._roundRect(x + 2, y + 3, w, h, 6);
            ctx.fill();

            ctx.fillStyle = selected ? '#363636' : '#2b2b2b';
            ctx.strokeStyle = selected ? '#b8b8b8' : '#171717';
            ctx.lineWidth = selected ? 2 / this.zoom : 1 / this.zoom;
            this._roundRect(x, y, w, h, 6);
            ctx.fill();
            ctx.stroke();

            // dirty marker
            if (this.graph.dirty.has(node.id)) {
                ctx.fillStyle = 'rgba(255,214,90,0.16)';
                ctx.fillRect(x, y, w, h);
            }

            ctx.fillStyle = node.color;
            this._roundRect(x, y, w, 26, { tl: 6, tr: 6, bl: 0, br: 0 });
            ctx.fill();

            ctx.fillStyle = '#fff';
            const label = node.schema ? node.schema.displayName : node.type;
            ctx.font = `600 12px "Segoe UI", sans-serif`;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(label, x + 8, y + 13);

            ctx.fillStyle = 'rgba(0,0,0,0.10)';
            ctx.fillRect(x, y + 26, w, Math.max(0, h - 26));

            // sockets
            node.inputs.forEach((inp, i) => {
                const p = this.getSocketPosition(node, 'input', i);
                ctx.fillStyle = this._socketColor(inp.type);
                ctx.beginPath();
                ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = '#000';
                ctx.lineWidth = 1;
                ctx.stroke();
                const connected = this.connections.some(c => c.toId === node.id && c.toSocket === i);
                ctx.fillStyle = connected ? '#9fdf9f' : '#bbb';
                ctx.font = `11px "Segoe UI", sans-serif`;
                ctx.textAlign = 'left';
                ctx.fillText(inp.name + (connected ? '' : ''), p.x + 9, p.y);
            });

            node.outputs.forEach((out, i) => {
                const p = this.getSocketPosition(node, 'output', i);
                ctx.fillStyle = this._socketColor(out.type);
                ctx.beginPath();
                ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = '#000';
                ctx.lineWidth = 1;
                ctx.stroke();
                ctx.fillStyle = '#bbb';
                ctx.font = `11px "Segoe UI", sans-serif`;
                ctx.textAlign = 'right';
                ctx.fillText(out.name, p.x - 9, p.y);
            });

            if (node.evalError) {
                ctx.fillStyle = 'rgba(200,60,50,0.9)';
                ctx.font = `10px monospace`;
                ctx.textAlign = 'right';
                ctx.fillText('⚠', x + w - 8, y + h - 6);
            }
            if (node.evalTime != null && typeof node.evalTime === 'number' && this._showProfiler) {
                ctx.fillStyle = 'rgba(255,255,255,0.4)';
                ctx.font = `8px "Segoe UI", sans-serif`;
                ctx.textAlign = 'right';
                ctx.fillText(node.evalTime.toFixed(1) + 'ms', x + w - 8, y + 24);
            }
        }

        // ======================================================================
        // PREVIEW VIEWPORT
        // ======================================================================

        setupPreviewViewport() {
            const host = document.getElementById('geo-preview-viewport');
            if (!host || !window.THREE) return;
            host.innerHTML = '';
            try {
                this.previewRenderer = new window.THREE.WebGLRenderer({ antialias: true, alpha: true });
                this.previewRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
                this.previewRenderer.setClearColor(0x383838, 1);
                host.appendChild(this.previewRenderer.domElement);
                this.previewRenderer.domElement.style.width = '100%';
                this.previewRenderer.domElement.style.height = '100%';
                this.previewRenderer.domElement.style.display = 'block';
                this.previewRenderer.domElement.style.cursor = 'grab';

                this.previewScene = new window.THREE.Scene();
                this.previewScene.background = new window.THREE.Color(0x383838);
                this.previewCamera = new window.THREE.PerspectiveCamera(50, 1, 0.1, 200);

                const hemi = new window.THREE.HemisphereLight(0xffffff, 0x20242c, 0.9);
                const key = new window.THREE.DirectionalLight(0xffffff, 1.4);
                key.position.set(5, 8, 6);
                this.previewScene.add(hemi);
                this.previewScene.add(key);
                this.previewScene.add(new window.THREE.AmbientLight(0x404860, 0.5));

                const grid = new window.THREE.GridHelper(10, 20, 0x555555, 0x444444);
                grid.position.y = -2.5;
                this.previewScene.add(grid);

                this._bindPreviewEvents();
                this.resizePreviewViewport();
            } catch (err) {
                console.warn('[GeometryNodeEditor] 3D preview unavailable:', err);
                host.innerHTML = '<div class="placeholder">3D preview unavailable</div>';
            }
        }

        _bindPreviewEvents() {
            const canvas = this.previewRenderer && this.previewRenderer.domElement;
            if (!canvas) return;
            canvas.addEventListener('mousedown', (e) => {
                this._previewDragging = true;
                this._previewLast = { x: e.clientX, y: e.clientY };
                canvas.style.cursor = 'grabbing';
                e.preventDefault();
            });
            window.addEventListener('mousemove', (e) => {
                if (!this._previewDragging) return;
                const dx = e.clientX - this._previewLast.x;
                const dy = e.clientY - this._previewLast.y;
                this._previewLast = { x: e.clientX, y: e.clientY };
                this.previewOrbit.theta -= dx * 0.01;
                this.previewOrbit.phi = Math.max(0.05, Math.min(Math.PI / 2 + 0.2, this.previewOrbit.phi - dy * 0.01));
            });
            window.addEventListener('mouseup', () => {
                if (this._previewDragging) {
                    this._previewDragging = false;
                    if (canvas) canvas.style.cursor = 'grab';
                }
            });
            canvas.addEventListener('wheel', (e) => {
                e.preventDefault();
                this.previewOrbit.dist *= e.deltaY > 0 ? 1.1 : 0.9;
                this.previewOrbit.dist = Math.max(1.5, Math.min(60, this.previewOrbit.dist));
            }, { passive: false });
        }

        _tickPreview() {
            if (!this.previewRenderer || !this.previewScene || !this.previewCamera) return;
            const o = this.previewOrbit;
            const t = o.target || { x: 0, y: 0, z: 0 };
            this.previewCamera.position.set(
                t.x + o.dist * Math.sin(o.theta) * Math.cos(o.phi),
                t.y + o.dist * Math.sin(o.phi),
                t.z + o.dist * Math.cos(o.theta) * Math.cos(o.phi)
            );
            this.previewCamera.lookAt(t);
            this.previewRenderer.render(this.previewScene, this.previewCamera);
        }

        _renderPreviewMesh(value, material) {
            if (!this.previewScene || !window.THREE) return;

            if (this.previewMesh) {
                this.previewScene.remove(this.previewMesh);
                this.previewMesh.geometry?.dispose?.();
                this.previewMesh.material?.dispose?.();
                this.previewMesh = null;
            }

            let data = window.GeometryData?.from?.(value);
            if (!data) return;
            if (data.hasInstances?.()) data = window.GeometryOps?.realizeInstances?.(data) || data;

            const geometry = data.geometry;
            if (!geometry) return;

            const matPayload = material || data.material;
            let mat;

            if (matPayload?.__mat) {
                mat = new window.THREE.MeshStandardMaterial({
                    color: (() => { try { return new window.THREE.Color(matPayload.color || '#8e8e8e'); } catch (_) { return new window.THREE.Color('#8e8e8e'); } })(),
                    roughness: matPayload.roughness ?? 0.5,
                    metalness: matPayload.metalness ?? 0,
                    transparent: (matPayload.opacity ?? 1) < 0.999,
                    opacity: matPayload.opacity ?? 1,
                    side: window.THREE.DoubleSide
                });
            } else {
                mat = new window.THREE.MeshStandardMaterial({
                    color: 0x8d9298,
                    roughness: 0.62,
                    metalness: 0.05,
                    side: window.THREE.DoubleSide
                });
            }

            const mesh = new window.THREE.Mesh(geometry.clone(), mat);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            this.previewMesh = mesh;
            this.previewScene.add(mesh);

            mesh.geometry.computeBoundingBox?.();
            const bb = mesh.geometry.boundingBox;
            if (bb) {
                const size = Math.max(0.001, bb.getSize(new window.THREE.Vector3()).length());
                const center = bb.getCenter(new window.THREE.Vector3());
                this.previewOrbit.target?.copy?.(center);
                this.previewOrbit.dist = Math.max(2.5, size * 1.35);
            }
        }

        resizePreviewViewport() {
            const host = document.getElementById('geo-preview-viewport');
            if (!host || !this.previewRenderer) return;
            const w = Math.max(1, host.clientWidth);
            const h = Math.max(1, host.clientHeight);
            this.previewRenderer.setSize(w, h, false);
            if (this.previewCamera) {
                this.previewCamera.aspect = w / h;
                this.previewCamera.updateProjectionMatrix();
            }
        }

        // ======================================================================
        // PROPERTIES PANEL
        // ======================================================================

        updatePropertiesPanel() {
            const panel = document.getElementById('geo-properties-panel');
            if (!panel) return;

            if (this.selectedGroup && !this.selectedNode) {
                const g = this.selectedGroup;
                panel.innerHTML = `
                    <div style="padding:10px 12px;border-bottom:1px solid #111;">
                        <div style="font-weight:bold;color:${g.stroke || '#8a6736'};font-size:12px;">${g.title || 'Group'}</div>
                        <div style="font-size:9px;color:#444;margin-top:2px;">${g.nodeIds.length} node${g.nodeIds.length === 1 ? '' : 's'}</div>
                    </div>
                    <div style="padding:10px 12px;">
                        <label style="font-size:10px;color:#777;display:block;margin-bottom:4px;">Title</label>
                        <input type="text" value="${(g.title || 'Group').replace(/"/g, '&quot;')}"
                            oninput="geometryNodeEditor.setGroupTitle(this.value)"
                            style="width:100%;background:#101010;border:1px solid #282828;color:#ddd;padding:6px;font-size:11px;box-sizing:border-box;">
                        <div style="margin-top:10px;display:flex;align-items:center;gap:8px;">
                            <label style="font-size:10px;color:#777;flex:1;">Color</label>
                            <input type="color" value="${g.stroke || '#8a6736'}" onchange="geometryNodeEditor.updateGroupColor(this.value)"
                                style="width:36px;height:24px;border:none;background:none;cursor:pointer;padding:0;">
                        </div>
                    </div>`;
                return;
            }

            if (!this.selectedNode) {
                panel.innerHTML = `<div style="padding:12px;font-size:11px;color:#888;">
                    <div style="color:#444;padding:16px;font-size:11px;">Select a node to edit</div></div>`;
                return;
            }

            const node = this.selectedNode;
            const schema = node.schema || (this.registry.get(node.type)) || {};
            let html = `
                <div style="padding:10px 12px;border-bottom:1px solid #111;">
                    <div style="font-weight:bold;color:${node.color};font-size:12px;">${schema.displayName || node.type}</div>
                    <div style="font-size:9px;color:#444;margin-top:2px;">${node.id}</div>
                </div>
                <div style="padding:10px 12px;">`;

            // Widgets first
            if (schema.widget === 'slider') {
                const val = parseFloat(node.value ?? 0.5);
                html += widgetSlider(node, val);
            }
            if (schema.widget === 'int') {
                const val = Math.round(node.value ?? 3);
                html += widgetInt(node, val);
            }
            if (schema.widget === 'color') {
                const cv = typeof node.value === 'string' && node.value.startsWith('#') ? node.value : '#ffffff';
                html += widgetColor(node, cv);
            }
            if (schema.widget === 'bool') {
                html += widgetBool(node);
            }

            (node.inputs || []).forEach((inp, i) => {
                const connected = this.connections.some(c => c.toId === node.id && c.toSocket === i);
                if (connected || inp.type === 'geometry' || inp.type === 'material') {
                    if (inp.type === 'geometry' || inp.type === 'material')
                        html += `<div style="padding:4px 0;display:flex;align-items:center;gap:6px;"><span style="font-size:10px;color:#555;flex:1;">${inp.name}</span><span style="font-size:9px;color:${connected ? '#2ecc71' : '#444'};">${connected ? '● linked' : ''}</span></div>`;
                    return;
                }

                const cur = (node.params && node.params[inp.name] !== undefined) ? node.params[inp.name] : inp.default;
                if (inp.type === 'float' || inp.type === 'integer') {
                    html += floatInput(node, inp, cur);
                } else if (inp.type === 'vector') {
                    html += vectorInput(node, inp, cur);
                } else if (inp.type === 'color') {
                    html += colorInput(node, inp, cur);
                } else if (inp.type === 'enum') {
                    html += enumInput(node, inp, cur);
                } else if (inp.type === 'boolean') {
                    html += boolInput(node, inp, cur);
                } else if (inp.type === 'string') {
                    html += stringInput(node, inp, cur);
                } else if (inp.type === 'any') {
                    html += `<div style="padding:3px 0;color:#777;font-size:10px;">${inp.name}: field/value socket</div>`;
                }
            });

            html += `
                <div style="margin-top:14px;padding-top:10px;border-top:1px solid #111;display:flex;gap:6px;flex-wrap:wrap;">
                    <button onclick="geometryNodeEditor.duplicateNode('${node.id}')" style="flex:1;...">Duplicate</button>
                    <button onclick="geometryNodeEditor.deleteNode('${node.id}')" style="flex:1;...">Delete</button>
                </div>`;
            html += `</div>`;
            panel.innerHTML = html;
        }

        // ---- property setters (inline HTML callbacks) ------------------------

        setProp(nodeId, name, val) {
            this.setNodeParam(nodeId, name, (typeof val === 'string' && !isNaN(+val) && isFinite(val)) ? +val : val);
            this.updatePropertiesPanel();
        }

        setVecProp(nodeId, name, index, val) {
            const n = this.graph.findNode(nodeId);
            if (!n) return;
            n.params = n.params || {};
            n.params[name] = n.params[name] || [0, 0, 0];
            n.params[name][index] = parseFloat(val) || 0;
            this.graph.markDirty(nodeId);
            this.evaluator.markDownstream(nodeId);
            this.scheduleEvaluate();
            this.updatePropertiesPanel();
        }

        setNodeValue(nodeId, val) {
            const n = this.graph.findNode(nodeId);
            if (!n) return;
            n.value = (typeof val === 'boolean') ? val : (isNaN(val) ? val : parseFloat(val));
            this.graph.markDirty(nodeId);
            this.scheduleEvaluate();
            this.updatePropertiesPanel();
        }

        setGroupTitle(text) {
            if (this.selectedGroup) this.selectedGroup.title = text;
        }

        updateGroupColor(hex) {
            if (this.selectedGroup) this.selectedGroup.stroke = hex;
        }

        // ======================================================================
        // APPLY
        // ======================================================================

        applyToObject() {
            const evaluated = this.evaluateGraph(true);
            if (!evaluated) {
                this.showNotification('Nothing to apply — connect geometry to Group Output', 'error');
                return false;
            }

            const target = (this.targetObject?.isMesh ? this.targetObject : null)
                || (window.selectedObject?.isMesh ? window.selectedObject : null);

            if (!target) {
                this.showNotification('Select a mesh object in the scene first', 'error');
                return false;
            }

            try {
                let data = window.GeometryData.from(evaluated);
                if (data.hasInstances()) data = window.GeometryOps.realizeInstances(data);
                if (!data.geometry) {
                    this.showNotification('Output contains no realized mesh geometry', 'error');
                    return false;
                }

                const oldGeometry = target.geometry;
                target.geometry = data.geometry.clone();
                target.geometry.computeVertexNormals?.();
                target.geometry.computeBoundingBox?.();
                target.geometry.computeBoundingSphere?.();

                // Do not dispose shared/imported geometry unless this editor created it earlier.
                if (oldGeometry?.userData?.geometryNodesOwned) oldGeometry.dispose?.();
                target.geometry.userData = target.geometry.userData || {};
                target.geometry.userData.geometryNodesOwned = true;

                const payload = this.previewMaterial || data.material;
                if (payload?.__mat && target.material) {
                    try { target.material.color?.set?.(payload.color || '#8e8e8e'); } catch (_) {}
                    if ('roughness' in target.material) target.material.roughness = payload.roughness ?? target.material.roughness;
                    if ('metalness' in target.material) target.material.metalness = payload.metalness ?? target.material.metalness;
                    if ('opacity' in target.material) {
                        target.material.opacity = payload.opacity ?? 1;
                        target.material.transparent = target.material.opacity < 0.999;
                    }
                    target.material.needsUpdate = true;
                }

                target.userData = target.userData || {};
                target.userData.geometryNodesApplied = true;
                target.userData.geometryNodesGraph = NodeSerializer.toJSON(this.graph, {
                    name: target.name || 'Geometry Nodes'
                });

                this.showNotification(`Geometry Nodes applied to "${target.name || 'Object'}"`, 'success');
                window.refreshScenePreview?.();
                return true;
            } catch (err) {
                console.error('[GeometryNodeEditor] apply failed:', err);
                this.showNotification('Apply failed: ' + err.message, 'error');
                return false;
            }
        }

        resize() {
            if (!this.canvas || !this.canvas.parentElement) return;

            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            const width = Math.max(1, Math.floor(this.canvas.clientWidth || this.canvas.parentElement.clientWidth));
            const height = Math.max(1, Math.floor(this.canvas.clientHeight || Math.max(1, this.canvas.parentElement.clientHeight - 54)));

            const targetWidth = Math.floor(width * dpr);
            const targetHeight = Math.floor(height * dpr);

            if (this.canvas.width !== targetWidth) this.canvas.width = targetWidth;
            if (this.canvas.height !== targetHeight) this.canvas.height = targetHeight;

            this.ctx?.setTransform?.(dpr, 0, 0, dpr, 0, 0);
            this.resizePreviewViewport();
        }

        showNotification(msg, type = 'success') {
            const colors = { success: '#1a4a2a', error: '#4a1a1a', warning: '#4a3a0a' };
            const borders = { success: '#27ae60', error: '#e74c3c', warning: '#f39c12' };
            const div = document.createElement('div');
            div.style.cssText = `position:fixed;top:20px;right:20px;background:${colors[type] || colors.success};border:1px solid ${borders[type] || borders.success};color:#ddd;padding:10px 16px;border-radius:3px;z-index:99999;font-family:monospace;font-size:11px;box-shadow:0 4px 12px #000;`;
            div.textContent = msg;
            document.body.appendChild(div);
            setTimeout(() => { div.style.opacity = '0'; div.style.transition = 'opacity 0.3s'; setTimeout(() => div.remove(), 300); }, 2800);
        }

        setTarget(obj) {
            this.targetObject = obj || null;
        }
    }

    // Widget builders are module-scoped functions (no closure state) ----------
    function widgetSlider(node, val) {
        return `<div style="padding:4px 0;"><label style="font-size:10px;color:#777;">Value: ${val.toFixed(3)}</label>
            <input type="range" min="0" max="1" step="0.01" value="${val}"
                oninput="geometryNodeEditor.setNodeValue('${node.id}',this.value);this.previousElementSibling.textContent='Value: '+parseFloat(this.value).toFixed(3);"
                style="width:100%;accent-color:${node.color};margin-top:4px;"></div>`;
    }
    function widgetInt(node, val) {
        return `<div style="padding:4px 0;"><label style="font-size:10px;color:#777;">Value</label><br>
            <input type="number" step="1" value="${val}" onchange="geometryNodeEditor.setNodeValue('${node.id}',this.value)"
                style="width:100%;margin-top:4px;background:#101010;border:1px solid #282828;color:#ddd;padding:6px;font-size:11px;box-sizing:border-box;"></div>`;
    }
    function widgetColor(node, cv) {
        return `<div style="padding:4px 0;"><label style="font-size:10px;color:#777;">Color</label><br>
            <input type="color" value="${cv}" onchange="geometryNodeEditor.setNodeValue('${node.id}',this.value)"
                style="width:100%;height:32px;border:none;background:none;cursor:pointer;padding:0;margin-top:4px;"></div>`;
    }
    function widgetBool(node) {
        return `<div style="padding:4px 0;display:flex;align-items:center;gap:8px;">
            <label style="font-size:10px;color:#777;flex:1;">Enabled</label>
            <input type="checkbox" ${node.value ? 'checked' : ''} onchange="geometryNodeEditor.setNodeValue('${node.id}',this.checked)"
                style="accent-color:${node.color};"></div>`;
    }
    function floatInput(node, inp, cur) {
        const v = typeof cur === 'number' ? cur : parseFloat(cur) || 0;
        return `<div style="padding:3px 0;"><label style="font-size:10px;color:#777;display:block;margin-bottom:2px;">${inp.name}</label>
            <div style="display:flex;gap:4px;align-items:center;">
                <input type="range" min="${inp.min ?? 0}" max="${inp.max ?? 1}" step="${inp.step ?? 0.01}" value="${v}"
                    oninput="geometryNodeEditor.setProp('${node.id}','${inp.name}',this.value);this.nextElementSibling.value=parseFloat(this.value).toFixed(3);"
                    style="flex:1;accent-color:#888;">
                <input type="number" min="${inp.min ?? 0}" max="${inp.max ?? 1}" step="${inp.step ?? 0.01}" value="${v.toFixed(3)}"
                    onchange="geometryNodeEditor.setProp('${node.id}','${inp.name}',this.value);"
                    style="width:52px;background:#111;border:1px solid #333;color:#ccc;font-size:10px;padding:2px 4px;border-radius:2px;">
            </div></div>`;
    }
    function vectorInput(node, inp, cur) {
        const arr = Array.isArray(cur) ? cur : [0, 0, 0];
        return `<div style="padding:3px 0;"><label style="font-size:10px;color:#777;display:block;margin-bottom:2px;">${inp.name}</label>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px;">
                ${['X', 'Y', 'Z'].map((c, k) => `<input type="number" step="0.01" value="${(+arr[k]).toFixed(3)}"
                    onchange="geometryNodeEditor.setVecProp('${node.id}','${inp.name}',${k},this.value)"
                    style="background:#111;border:1px solid #333;color:#ccc;font-size:11px;padding:2px 4px;border-radius:2px;" title="${c}">`).join('')}
            </div></div>`;
    }
    function colorInput(node, inp, cur) {
        const cv = typeof cur === 'string' && cur.startsWith('#') ? cur : (inp.default || '#ffffff');
        return `<div style="padding:3px 0;display:flex;align-items:center;gap:8px;">
            <label style="font-size:10px;color:#777;flex:1;">${inp.name}</label>
            <input type="color" value="${cv}" onchange="geometryNodeEditor.setProp('${node.id}','${inp.name}',this.value)"
                style="width:36px;height:24px;border:none;background:none;cursor:pointer;padding:0;"></div>`;
    }
    function enumInput(node, inp, cur) {
        const opts = inp.opts || [];
        return `<div style="padding:3px 0;"><label style="font-size:10px;color:#777;display:block;margin-bottom:2px;">${inp.name}</label>
            <select onchange="geometryNodeEditor.setProp('${node.id}','${inp.name}',this.value)"
                style="width:100%;background:#111;border:1px solid #333;color:#ccc;font-size:11px;padding:4px;border-radius:2px;">
                ${opts.map(o => `<option value="${o}" ${String(cur) === o ? 'selected' : ''}>${o}</option>`).join('')}
            </select></div>`;
    }
    function boolInput(node, inp, cur) {
        return `<div style="padding:3px 0;display:flex;align-items:center;gap:8px;">
            <label style="font-size:10px;color:#777;flex:1;">${inp.name}</label>
            <input type="checkbox" ${cur ? 'checked' : ''} onchange="geometryNodeEditor.setProp('${node.id}','${inp.name}',this.checked)"
                style="accent-color:#888;"></div>`;
    }

    function stringInput(node, inp, cur) {
        const safe = String(cur ?? inp.default ?? '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
        return `<div style="padding:3px 0;"><label style="font-size:10px;color:#777;display:block;margin-bottom:2px;">${inp.name}</label>
            <input type="text" value="${safe}" onchange="geometryNodeEditor.setProp('${node.id}','${inp.name}',this.value)"
                style="width:100%;background:#272727;border:1px solid #484848;color:#ccc;font-size:10px;padding:5px 6px;"></div>`;
    }

    // ============================================================================
    // GLOBAL EXPORTS (compat with NodeEditorPanel / GlobalNodeEditorManager)
    // ============================================================================
    window.GeometryNodeEditor = GeometryNodeEditor;

    let _singleton = null;
    window.ensureGeometryNodeEditor = function () {
        if (_singleton && _singleton.isInitialized) {
            _singleton.refreshDOMReferences();
            return _singleton;
        }
        _singleton = new GeometryNodeEditor('geometry-graph-wrapper');
        window.geometryNodeEditor = _singleton;
        try { _singleton.init(); } catch (e) { console.warn('[GeometryNodeEditor] init retry failed:', e); }
        _singleton.refreshDOMReferences();
        if (_singleton.autoEvaluate !== false) _singleton.evaluateGraph(false);
        return _singleton;
    };

    window.addEventListener('DOMContentLoaded', () => {
        if (document.getElementById('geometry-graph-wrapper')) {
            try { window.ensureGeometryNodeEditor(); } catch (e) {
                console.warn('[GeometryNodeEditor] lazy init skipped:', e);
            }
        }
    });

    window.addEventListener('resize', () => window.geometryNodeEditor?.resize());
    window.addGeoNode = (type) => {
        if (!window.geometryNodeEditor) return;
        const n = window.geometryNodeEditor.spawnNodeAtCenter(type);
        if (n) window.geometryNodeEditor.setSelectedNodes([n]);
    };
    window.applyGeometryNodes = () => window.geometryNodeEditor?.applyToObject();

    if (typeof module !== 'undefined' && module.exports) module.exports = { GeometryNodeEditor };
})();