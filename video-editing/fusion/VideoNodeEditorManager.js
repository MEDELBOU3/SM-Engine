/**
 * VideoNodeEditorManager.js
 * SM Engine — docked Fusion-style node editor.
 *
 * Visual layout:
 * Viewport / Sequencer | Node Editor | Inspector
 */
(function (global) {
    'use strict';
    class VideoNodeEditorManager {
        constructor(project = null) {
            this.project = project || global.videoProject || global.ensureVideoProjectState?.() || null;
            this.library = global.videoNodeLibrary || new global.VideoNodeLibrary();
            this.evaluator = global.ensureVideoFusionEvaluator?.() || global.videoFusionEvaluator || null;
            this.gpuEvaluator = global.ensureVideoFusionGPUEvaluator?.() || global.videoFusionGPUEvaluator || null;
            this.runtimeBridge = global.ensureVideoFusionRuntimeBridge?.() || global.videoFusionRuntimeBridge || null;
            this.graph = null; this.renderer = null; this.panel = null; this.canvasHost = null; this.editorScene = null; this.opened = false;
            this.width = Number(this.project?.workspace?.perWorkspace?.edit?.nodePanelWidth || 430);
            this._resizeState = null; this._menu = null;
            this.snapEnabled = true;
            this.gridSize = 20;
            this.clipboard = null;
            this.history = [];
            this.historyIndex = -1;
            this._interactiveHistory = null;
            this._paramHistory = null;
            this._selectionHandler = () => { if (this.opened) this.loadGraphForSelection() };

            /*
             * Hot-reload safety:
             * if an older Node Editor build left the body class behind while the panel
             * itself no longer exists, clear that layout state before injecting styles.
             */
            if (
                document.body.classList.contains('video-node-editor-open') &&
                !document.getElementById('video-node-editor-panel')
            ) {
                document.body.classList.remove(
                    'video-node-editor-open',
                    'video-node-panel-resizing'
                );
            }

            this._styles(); this._bindEvents();
        }
        isOpen() { return !!(this.opened && this.panel?.isConnected) }
        open(options = {}) {
            if (!document.body.classList.contains('video-editing-mode')) global.videoEditingManager?.enter?.();

            /*
             * Fusion Nodes / Audio Studio / Color Studio use the same right-side
             * professional dock slot.
             */
            global.audioStudioDockManager
                ?.close?.({
                    keepMeters: false
                });

            global.colorStudioDockManager
                ?.close?.();

            global.videoEffectsDockManager
                ?.close?.();

            global.videoTransitionsDockManager
                ?.close?.();

            global.videoProjectDockManager
                ?.close?.();

            global.videoDeliverDockManager
                ?.close?.();

            this.editorScene = document.getElementById('editor-scene');
            if (!this.editorScene) { console.warn('[VideoNodeEditor] #editor-scene not found'); return false }

            /*
             * Do not mutate editorScene.style.position.
             * The host's own engine layout must stay untouched.
             */
            this._ensurePanel();

            /*
             * Keep the Fusion dock as the last child of #editor-scene.
             * The base Three.js/WebGL canvas can otherwise paint over it.
             */
            if (
                this.panel.parentElement === this.editorScene &&
                this.editorScene.lastElementChild !== this.panel
            ) {
                this.editorScene.appendChild(this.panel);
            }

            this.panel.hidden = false;
            this.panel.style.visibility = 'visible';
            this.panel.style.opacity = '1';
            this.panel.style.pointerEvents = 'auto';
            this.panel.style.zIndex = '40';

            this.opened = true;
            document.body.classList.add('video-node-editor-open');
            this._applyWidth();
            this.loadGraphForSelection(options.force === true);
            this._updateBackendBadge();
            this._refreshLayout();
            return true;
        }
        close() {
            this.opened = false;

            document.body.classList.remove(
                'video-node-editor-open',
                'video-node-panel-resizing'
            );

            if (this.panel) {
                this.panel.hidden = true;
                this.panel.style.removeProperty('visibility');
                this.panel.style.removeProperty('opacity');
                this.panel.style.removeProperty('pointer-events');
                this.panel.style.removeProperty('z-index');
            }

            this._resizeState = null;
            this._closeMenu();
            this._refreshLayout();

            return true;
        }
        toggle() { return this.isOpen() ? this.close() : this.open() }
        _ensurePanel() {
            if (this.panel?.isConnected) return;
            const p = document.createElement('section'); p.id = 'video-node-editor-panel'; p.className = 'video-node-editor-panel';
            p.innerHTML = `<div class="video-node-resize-handle"></div><header class="video-node-panel-header"><div class="video-node-panel-title"><span class="video-node-panel-icon">${this._svg('nodes')}</span><div><strong>Fusion Nodes</strong><span data-node-graph-name>Composition</span></div></div><div class="video-node-panel-actions"><span class="video-node-live-badge" data-fusion-backend-badge title="Fusion runtime backend">LIVE</span><button data-node-action="add" title="Add Node">${this._svg('plus')}</button><button data-node-action="frame" title="Frame All">${this._svg('frame')}</button><button data-node-action="close" title="Close">${this._svg('close')}</button></div></header><div class="video-node-panel-toolbar"><button data-quick-node="MediaIn">MediaIn</button><button data-quick-node="Transform">Transform</button><button data-quick-node="ColorCorrect">Color</button><button data-quick-node="Blur">Blur</button><button data-quick-node="Glow">Glow</button><button data-quick-node="ChromaKey">Key</button><button data-quick-node="MaskRectangle">Mask</button><button data-quick-node="Merge">Merge</button><button data-quick-node="MediaOut">MediaOut</button><span class="video-node-toolbar-separator"></span><button data-node-toggle="gpu" class="active" title="Prefer WebGL2 GPU Fusion">GPU</button><button data-node-toggle="snap" class="active" title="Snap nodes to grid">SNAP</button><button data-node-action="frame-selected" title="Frame Selected">F</button><span class="video-node-zoom-readout" data-node-zoom>100%</span></div><div class="video-node-canvas-host"></div><footer class="video-node-panel-status"><span data-node-status>Ready</span><span>LIVE CLIP FX · Shift+A Add · Alt/MMB Pan · Wheel Zoom</span></footer>`;
            /*
             * #editor-scene is already a positioned SM Engine workspace.
             * Mount the absolute dock into it without changing host positioning.
             */
            this.editorScene.appendChild(p); this.panel = p; this.canvasHost = p.querySelector('.video-node-canvas-host'); this._bindPanelUI();
        }
        loadGraphForSelection(force = false) {
            const clip = this._selectedClip(); let data = null;
            if (clip) data = Object.values(this.project?.fusion?.graphs || {}).find(g => g.clipId === clip.id) || null;
            if (!data && this.project) data = this.project.createFusionGraph?.({ name: clip ? `${clip.name || 'Clip'} Fusion` : 'Global Fusion', clipId: clip?.id || null }) || null;
            if (!data) return false;
            if (this.graph?.id === data.id && force !== true) { this.renderer?.render?.(); return true }
            this.graph = new global.VideoNodeGraph(this.project, data);
            if (!this.graph.nodes.length) this.library.createDefaultGraph(this.graph);
            this.evaluator = global.ensureVideoFusionEvaluator?.() || this.evaluator;
            this.runtimeBridge = global.ensureVideoFusionRuntimeBridge?.() || this.runtimeBridge;
            this.evaluator?.invalidate?.(this.graph.id);
            this._resetHistory();
            if (!this.renderer) { this.renderer = new global.VideoNodeRenderer(this.graph, this.library, { manager: this }); this.renderer.mount(this.canvasHost) }
            else this.renderer.setGraph(this.graph);
            const title = this.panel?.querySelector('[data-node-graph-name]'); if (title) title.textContent = this.graph.data.name;
            this._status(clip ? `LIVE · ${clip.name || clip.id} · ${this.graph.nodes.length} nodes` : 'Global composition graph'); global.videoEditingManager?.renderCompositeAt?.(global.sequencerManager?.state?.playhead ?? 0); return true;
        }
        onNodeSelectionChanged(node) {
            if (this.project?.selection) { this.project.state.selection.nodeIds = this.graph?.getSelectedNodes()?.map(n => n.id) || []; this.project.touch?.('selection.nodes', { nodeIds: this.project.state.selection.nodeIds }, { dirty: false, autosave: false }) }
            this._status(node ? `${node.title} selected` : 'Selection cleared');
        }
        onNodeParamChanged(node, key, value) {
            this._status(`LIVE · ${node.title} · ${key}: ${value}`);
            this.evaluator?.invalidate?.(this.graph?.id);
            global.dispatchEvent(new CustomEvent('videoFusionNodeParamChanged', { detail: { graph: this.graph, node, key, value } }));
            global.videoEditingManager?.renderCompositeAt?.(global.sequencerManager?.state?.playhead ?? 0);
        }
        addNode(type, pos = null) {
            if (!this.graph) this.loadGraphForSelection(); if (!this.graph) return null;
            const data = this.library.create(type, pos || this._insertPosition()); if (!data) return null;
            this.commitHistory('Add Node');
            const node = this.graph.addNode(data); this.graph.selectNode(node.id, false); this.renderer?.render(); return node;
        }
        deleteSelectedNodes() { if (!this.graph) return; const ids = this.graph.getSelectedNodes().map(n => n.id); if (!ids.length) { this._status('Nothing selected'); return } this.commitHistory('Delete Nodes'); ids.forEach(id => this.graph.removeNode(id)); this._status(`${ids.length} node(s) deleted`) }
        duplicateSelectedNodes() {
            if (!this.graph) return; const selected = this.graph.getSelectedNodes().slice(); if (!selected.length) return; this.commitHistory('Duplicate Nodes'); this.graph.clearSelection({ silent: true });
            selected.forEach(n => { const c = this.graph.duplicateNode(n.id); if (c) c.selected = true }); this.graph._emit('node:duplicate', { count: selected.length });
        }
        copySelectedNodes() {
            if (!this.graph) return false; const selected = this.graph.getSelectedNodes(); if (!selected.length) return false;
            const ids = new Set(selected.map(n => n.id));
            this.clipboard = { nodes: selected.map(n => JSON.parse(JSON.stringify(n))), links: this.graph.links.filter(l => ids.has(l.fromNode) && ids.has(l.toNode)).map(l => JSON.parse(JSON.stringify(l))) };
            this._status(`${selected.length} node(s) copied`); return true;
        }
        cutSelectedNodes() { if (!this.copySelectedNodes()) return false; this.deleteSelectedNodes(); return true }
        pasteNodes() {
            if (!this.graph || !this.clipboard?.nodes?.length) return false; this.commitHistory('Paste Nodes');
            const idMap = new Map(); this.graph.clearSelection({ silent: true });
            this.clipboard.nodes.forEach(src => { const data = JSON.parse(JSON.stringify(src)); const old = data.id; delete data.id; data.x += 35; data.y += 35; data.selected = false; const n = this.graph.addNode(data); idMap.set(old, n.id); n.selected = true });
            this.clipboard.links.forEach(l => { const a = idMap.get(l.fromNode), b = idMap.get(l.toNode); if (a && b) this.graph.connect(a, l.fromSocket, b, l.toSocket, { replaceInput: false }) });
            this.graph._emit('clipboard:paste', { count: this.clipboard.nodes.length }); this._status(`${this.clipboard.nodes.length} node(s) pasted`); return true;
        }
        frameAll() {
            if (!this.graph?.nodes.length || !this.canvasHost) return; const n = this.graph.nodes, minX = Math.min(...n.map(x => x.x)), minY = Math.min(...n.map(x => x.y)), maxX = Math.max(...n.map(x => x.x + (x.width || 172))), maxY = Math.max(...n.map(x => x.y + 180));
            const r = this.canvasHost.getBoundingClientRect(), cw = Math.max(1, maxX - minX), ch = Math.max(1, maxY - minY), z = Math.max(.35, Math.min(1.25, Math.min((r.width - 60) / cw, (r.height - 60) / ch)));
            this.graph.setViewport({ x: r.width / 2 - (minX + cw / 2) * z, y: r.height / 2 - (minY + ch / 2) * z, zoom: z });
        }
        frameSelected() {
            if (!this.graph || !this.canvasHost) return;
            const nodes = this.graph.getSelectedNodes(); if (!nodes.length) { this.frameAll(); return }
            const minX = Math.min(...nodes.map(n => n.x)), minY = Math.min(...nodes.map(n => n.y)), maxX = Math.max(...nodes.map(n => n.x + (n.width || 172))), maxY = Math.max(...nodes.map(n => n.y + (n.collapsed ? 28 : 180)));
            const r = this.canvasHost.getBoundingClientRect(), cw = Math.max(1, maxX - minX), ch = Math.max(1, maxY - minY), z = Math.max(.4, Math.min(1.5, Math.min((r.width - 90) / cw, (r.height - 90) / ch)));
            this.graph.setViewport({ x: r.width / 2 - (minX + cw / 2) * z, y: r.height / 2 - (minY + ch / 2) * z, zoom: z });
        }
        updateZoomReadout(zoom) {
            const e = this.panel?.querySelector('[data-node-zoom]'); if (e) e.textContent = `${Math.round(Number(zoom || 1) * 100)}%`;
        }
        _snapshot() { return this.graph?.serialize?.() || null }
        _resetHistory() { this.history = []; this.historyIndex = -1; const s = this._snapshot(); if (s) { this.history.push(s); this.historyIndex = 0 } }
        commitHistory(label = 'Edit') {
            if (!this.graph) return; const current = this._snapshot(); if (!current) return;
            const last = this.history[this.historyIndex]; if (last && JSON.stringify(last) === JSON.stringify(current)) return;
            this.history = this.history.slice(0, this.historyIndex + 1); this.history.push(current); this.historyIndex = this.history.length - 1; this._status(label);
        }
        beginInteractiveHistory(label = 'Edit') { if (this._interactiveHistory) return; this._interactiveHistory = { label, snapshot: this._snapshot() } }
        endInteractiveHistory() {
            if (!this._interactiveHistory) return; const before = this._interactiveHistory.snapshot, label = this._interactiveHistory.label; this._interactiveHistory = null; const after = this._snapshot();
            if (JSON.stringify(before) !== JSON.stringify(after)) { this.history = this.history.slice(0, this.historyIndex + 1); this.history.push(before); this.history.push(after); this.historyIndex = this.history.length - 1; this._status(label) }
        }
        beginParamEdit() { if (!this._paramHistory) this._paramHistory = this._snapshot() }
        commitParamEdit(label = 'Change Parameter') {
            if (!this._paramHistory) return; const before = this._paramHistory; this._paramHistory = null; const after = this._snapshot();
            if (JSON.stringify(before) !== JSON.stringify(after)) { this.history = this.history.slice(0, this.historyIndex + 1); this.history.push(before); this.history.push(after); this.historyIndex = this.history.length - 1; this._status(label) }
        }
        undo() {
            if (!this.graph || this.historyIndex <= 0) return false; this.historyIndex--; this.graph.restore(this.history[this.historyIndex], { reason: 'undo' }); this.renderer?.setGraph?.(this.graph); this._status('Undo'); return true;
        }
        redo() {
            if (!this.graph || this.historyIndex >= this.history.length - 1) return false; this.historyIndex++; this.graph.restore(this.history[this.historyIndex], { reason: 'redo' }); this.renderer?.setGraph?.(this.graph); this._status('Redo'); return true;
        }
        openAddNodeMenu(x, y, worldPos) {
            this._closeMenu(); const menu = document.createElement('div'); menu.className = 'video-node-add-menu'; const input = document.createElement('input'); input.type = 'text'; input.placeholder = 'Search nodes...'; const list = document.createElement('div'); list.className = 'video-node-add-list';
            const render = q => { const s = String(q || '').trim().toLowerCase(); list.innerHTML = ''; this.library.list().filter(d => !s || d.title.toLowerCase().includes(s) || d.type.toLowerCase().includes(s) || d.category.toLowerCase().includes(s) || String(d.description || '').toLowerCase().includes(s)).forEach(d => { const b = document.createElement('button'); b.type = 'button'; b.innerHTML = `<strong>${this._esc(d.title)}</strong><span>${this._esc(d.category)} · ${this._esc(d.type)}</span>`; b.title = d.description || d.title; b.addEventListener('click', () => { this.addNode(d.type, worldPos); this._closeMenu() }); list.appendChild(b) }) };
            input.addEventListener('input', () => render(input.value)); menu.append(input, list); document.body.appendChild(menu); menu.style.left = `${Math.min(x, innerWidth - 238)}px`; menu.style.top = `${Math.min(y, innerHeight - 328)}px`; this._menu = menu; render(''); requestAnimationFrame(() => input.focus());
            const outside = e => { if (!menu.contains(e.target)) { this._closeMenu(); document.removeEventListener('pointerdown', outside, true) } }; setTimeout(() => document.addEventListener('pointerdown', outside, true), 0);
        }
        _closeMenu() { this._menu?.remove?.(); this._menu = null }
        _bindPanelUI() {
            this.panel.addEventListener('click', e => {
                const a = e.target.closest('[data-node-action]')?.dataset?.nodeAction;
                if (a === 'close') this.close();
                if (a === 'frame') this.frameAll();
                if (a === 'frame-selected') this.frameSelected();
                if (a === 'add') { const r = this.panel.getBoundingClientRect(); this.openAddNodeMenu(r.left + 40, r.top + 70, this._insertPosition()) }
                const toggle = e.target.closest('[data-node-toggle]')?.dataset?.nodeToggle;
                if (toggle === 'snap') { this.snapEnabled = !this.snapEnabled; const b = e.target.closest('[data-node-toggle]'); b?.classList.toggle('active', this.snapEnabled); this._status(this.snapEnabled ? 'Snap enabled' : 'Snap disabled') }
                if (toggle === 'gpu') {
                    this.runtimeBridge = global.ensureVideoFusionRuntimeBridge?.() || this.runtimeBridge;
                    const next = !(this.runtimeBridge?.preferGPU !== false);
                    this.runtimeBridge?.setPreferGPU?.(next);
                    const b = e.target.closest('[data-node-toggle]');
                    b?.classList.toggle('active', next);
                    this._status(next ? 'GPU Fusion preferred' : 'CPU Fusion forced');
                    this._updateBackendBadge();
                }
                const q = e.target.closest('[data-quick-node]')?.dataset?.quickNode; if (q) this.addNode(q);
            });
            const h = this.panel.querySelector('.video-node-resize-handle'); h.addEventListener('pointerdown', e => {
                e.preventDefault(); this._resizeState = { startX: e.clientX, width: this.width }; document.body.classList.add('video-node-panel-resizing');
                const move = m => { if (!this._resizeState) return; this.width = Math.max(280, Math.min(720, this._resizeState.width + (this._resizeState.startX - m.clientX))); this._applyWidth(); this._refreshLayout() };
                const up = () => { global.removeEventListener('pointermove', move); document.body.classList.remove('video-node-panel-resizing'); this._resizeState = null; this.project?.setWorkspaceState?.('edit', { nodePanelWidth: this.width }, { dirty: false }) };
                global.addEventListener('pointermove', move); global.addEventListener('pointerup', up, { once: true });
            });
        }
        _bindEvents() {
            global.addEventListener('videoCanvasTransformChanged', this._selectionHandler);
            global.addEventListener('videoInspectorPanelChanged', e => { if (e?.detail?.id === 'fusion') this.open() });
            global.addEventListener('sm:video-mode', e => { if (e?.detail?.active === false) this.close() });
            global.addEventListener('videoFusionBackendChanged', () => this._updateBackendBadge());
            global.addEventListener('videoFusionGPUStatus', () => this._updateBackendBadge());
        }
        _updateBackendBadge() {
            const badge = this.panel?.querySelector('[data-fusion-backend-badge]');
            if (!badge) return;
            this.runtimeBridge = global.ensureVideoFusionRuntimeBridge?.() || this.runtimeBridge;
            const info = this.runtimeBridge?.backendInfo?.() || {};
            const gpuReady = !!info.gpu?.webgl2;
            const backend = info.active || 'none';
            badge.textContent = backend === 'gpu' ? 'GPU LIVE' : backend === 'cpu' ? 'CPU LIVE' : gpuReady ? 'GPU READY' : 'CPU READY';
            badge.classList.toggle('gpu', backend === 'gpu' || (backend === 'none' && gpuReady));
            badge.classList.toggle('cpu', backend === 'cpu' || !gpuReady);
            badge.title = gpuReady ? `WebGL2 Fusion · ${info.gpu?.renderer || 'GPU'}` : 'WebGL2 unavailable · CPU fallback';
        }
        _applyWidth() { document.documentElement.style.setProperty('--video-node-panel-width', `${Math.round(this.width)}px`); if (this.panel) this.panel.style.width = `${Math.round(this.width)}px` }
        _refreshLayout() { requestAnimationFrame(() => { global.videoEditingManager?.resizeCanvas?.(); global.sequencerManager?.renderer?.refreshLayout?.(); global.sequencerManager?.renderer?.render?.(); global.dispatchEvent(new CustomEvent('sm:layout-resized', { detail: { source: 'video-node-editor', open: this.opened, width: this.width } })) }) }
        _selectedClip() {
            const state = global.sequencerManager?.state;
            const project = this.project || global.videoProject;
            const clips = project?.timeline?.clips || state?.clips || [];

            const primary = state?.primarySelection;
            if (primary && typeof primary === 'object' && primary.id) return primary;

            if (typeof primary === 'string') {
                const clip = clips.find(candidate => candidate.id === primary);
                if (clip) return clip;
            }

            const projectId =
                project?.selection?.primaryClipId ||
                project?.state?.selection?.primaryClipId ||
                null;

            if (projectId) {
                const clip = clips.find(candidate => candidate.id === projectId);
                if (clip) return clip;
            }

            const selectedId =
                state?.selectedIds?.[0];

            if (selectedId) {
                const clip = clips.find(candidate => candidate.id === selectedId);
                if (clip) return clip;
            }

            return clips.find(candidate => candidate.selected) || null;
        }
        _insertPosition() { const r = this.canvasHost?.getBoundingClientRect(); if (!r || !this.graph) return { x: 160, y: 160 }; const v = this.graph.viewport; return { x: (r.width / 2 - v.x) / v.zoom - 85, y: (r.height / 2 - v.y) / v.zoom - 40 } }
        _status(t) { const e = this.panel?.querySelector('[data-node-status]'); if (e) e.textContent = t }
        _svg(n) { const m = { nodes: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="6" height="5"/><rect x="15" y="15" width="6" height="5"/><path d="M9 6.5h3c3 0 3 11 6 11h-3"/></svg>', plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>', frame: '<svg viewBox="0 0 24 24"><path d="M8 4H4v4M16 4h4v4M8 20H4v-4M16 20h4v-4"/></svg>', close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>' }; return m[n] || m.nodes }
        _esc(v) { return String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;') }
        _styles() {
            if (document.getElementById('video-node-editor-manager-styles')) return; const s = document.createElement('style'); s.id = 'video-node-editor-manager-styles'; s.textContent = `
  :root{--video-node-panel-width:430px}
  /*
   * LAYOUT SAFETY:
   * Never override #editor-scene position here.
   * SM Engine already owns its workspace geometry. Changing it to relative
   * collapses/reflows the central editor and can move the Sequencer to the top.
   */
  body.video-editing-mode #editor-scene{min-width:0!important}
  .video-node-editor-panel{position:absolute;top:0;right:0;bottom:0;width:var(--video-node-panel-width);z-index:40;min-width:280px;max-width:720px;display:grid;grid-template-rows:34px 28px minmax(0,1fr) 22px;box-sizing:border-box;border-left:1px solid var(--border-color,#4d4d4d81);background:var(--panel-bg,var(--primary-dark,#333));color:var(--text-primary,#fff);overflow:visible}
  .video-node-editor-panel[hidden]{display:none!important}
  body.video-node-editor-open #editor-scene>canvas,
  body.video-node-editor-open #editor-scene>.renderer-container,
  body.video-node-editor-open #editor-scene>.viewport-canvas,
  body.video-node-editor-open #editor-scene>.scene-canvas{z-index:0!important}
  body.video-node-editor-open #video-node-editor-panel{z-index:40!important;visibility:visible!important;opacity:1!important;pointer-events:auto!important}
  body.video-node-editor-open #video-editing-container{right:var(--video-node-panel-width)!important;width:auto!important;max-width:calc(100% - var(--video-node-panel-width))!important}
  body.video-node-editor-open #sequencer-root{right:var(--video-node-panel-width)!important;width:auto!important;max-width:calc(100% - var(--video-node-panel-width))!important}
  body.video-node-editor-open .sequencer-splitter{right:var(--video-node-panel-width)!important}
  .video-node-resize-handle{position:absolute;left:-4px;top:0;bottom:0;width:8px;cursor:col-resize;background:transparent}.video-node-resize-handle::after{content:'';position:absolute;left:3px;top:0;bottom:0;width:1px;background:var(--border-color,#4d4d4d81)}body.video-node-panel-resizing{cursor:col-resize!important;user-select:none!important}
  .video-node-panel-header{display:flex;align-items:center;justify-content:space-between;gap:6px;padding:0 5px 0 7px;background:var(--header-bg,var(--secondary-dark,#3c3c3c));border-bottom:1px solid var(--border-color,#4d4d4d81)}.video-node-live-badge{height:18px;display:inline-flex;align-items:center;padding:0 5px;border:1px solid var(--border-color,#4d4d4d81);background:var(--accent-blue-dark,#474747);color:var(--text-primary,#fff);font-size:6px;font-weight:700;letter-spacing:.35px}.video-node-live-badge.gpu{box-shadow:inset 0 -1px 0 var(--text-secondary,#b0b0b0)}.video-node-live-badge.cpu{opacity:.72}.video-node-panel-title{min-width:0;display:flex;align-items:center;gap:6px}.video-node-panel-title>div{min-width:0}.video-node-panel-title strong,.video-node-panel-title span{display:block}.video-node-panel-title strong{font-size:9px}.video-node-panel-title div>span{max-width:220px;margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text-secondary,#b0b0b0);font-size:7px}.video-node-panel-icon{width:17px;height:17px;display:inline-flex;color:var(--text-secondary,#b0b0b0)}
  .video-node-panel-icon svg,.video-node-panel-actions svg{width:100%;height:100%;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}.video-node-panel-actions{display:flex;gap:1px}.video-node-panel-actions button{width:24px;height:22px;padding:5px;border:0;background:transparent;color:var(--text-secondary,#b0b0b0)}.video-node-panel-actions button:hover{background:var(--bg-button-hover,#414141);color:#fff}
  .video-node-panel-toolbar{display:flex;align-items:center;gap:2px;padding:0 4px;overflow:hidden;background:var(--secondary-dark,#3c3c3c);border-bottom:1px solid var(--border-color,#4d4d4d81)}.video-node-panel-toolbar button{height:20px;padding:0 6px;border:1px solid transparent;border-radius:0;background:transparent;color:var(--text-secondary,#b0b0b0);font-size:7px;white-space:nowrap}.video-node-panel-toolbar button:hover{border-color:var(--border-color,#4d4d4d81);background:var(--bg-button,#363636);color:#fff}.video-node-panel-toolbar button.active{background:var(--accent-blue-dark,#474747);color:var(--text-primary,#fff);border-color:var(--border-color,#4d4d4d81)}.video-node-toolbar-separator{width:1px;height:14px;background:var(--border-color,#4d4d4d81);margin:0 2px}.video-node-zoom-readout{margin-left:auto;min-width:34px;text-align:right;color:var(--text-secondary,#b0b0b0);font-size:7px}
  .video-node-canvas-host{min-width:0;min-height:0;overflow:hidden}.video-node-panel-status{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:0 6px;border-top:1px solid var(--border-color,#4d4d4d81);background:var(--header-bg,var(--secondary-dark,#3c3c3c));color:var(--text-secondary,#b0b0b0);font-size:6px;white-space:nowrap;overflow:hidden}.video-node-panel-status span{overflow:hidden;text-overflow:ellipsis}
  .video-node-add-menu{position:fixed;width:230px;max-height:320px;display:grid;grid-template-rows:28px minmax(0,1fr);overflow:hidden;border:1px solid var(--border-color,#4d4d4d81);background:var(--panel-bg,#333);box-shadow:0 10px 28px rgba(0,0,0,.45);color:#fff}.video-node-add-menu>input{height:28px;box-sizing:border-box;padding:0 7px;border:0;border-bottom:1px solid var(--border-color,#4d4d4d81);border-radius:0;outline:none;background:var(--input-bg,var(--secondary-dark,#3c3c3c));color:#fff;font-size:8px}.video-node-add-list{overflow:auto}.video-node-add-list button{width:100%;min-height:34px;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:4px 7px;border:0;border-bottom:1px solid var(--border-color,#4d4d4d40);border-radius:0;background:transparent;color:#fff;text-align:left}.video-node-add-list button:hover{background:var(--accent-blue-dark,#474747)}.video-node-add-list strong{font-size:8px}.video-node-add-list span{color:var(--text-secondary,#b0b0b0);font-size:7px}
  `; document.head.appendChild(s)
        }
    }
    global.VideoNodeEditorManager = VideoNodeEditorManager;
    global.ensureVideoNodeEditorManager = function (project) { if (!global.videoNodeEditorManager) global.videoNodeEditorManager = new VideoNodeEditorManager(project || global.videoProject || null); return global.videoNodeEditorManager };
    global.ensureVideoNodeEditorManager();
})(window);