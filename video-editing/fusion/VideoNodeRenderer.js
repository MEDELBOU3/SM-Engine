/**
 * VideoNodeRenderer.js
 * SM Engine — Fusion-style interactive node canvas.
 * Phase 5.1 interaction upgrade.
 *
 * Controls:
 * - MMB drag / Alt+LMB / Space+LMB: pan
 * - Wheel: zoom at cursor
 * - Shift+Wheel: horizontal pan
 * - LMB background drag: box select
 * - Shift/Ctrl: additive selection
 * - F: frame selected
 * - Home: frame all
 * - Shift+A: add-node search
 * - Ctrl+C / Ctrl+V / Ctrl+X / Ctrl+D
 * - Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z
 * - Delete: delete selected node/link
 * - Double-click node header: collapse/expand
 * - Alt+click input socket: disconnect input
 */
(function (global) {
    'use strict';
    class VideoNodeRenderer {
        constructor(graph, library, options = {}) {
            this.graph = graph; this.library = library; this.manager = options.manager || null;
            this.host = null; this.root = null; this.world = null; this.linksSvg = null; this.nodeLayer = null;
            this.pendingLink = null; this.dragState = null; this.boxState = null; this.selectedLinkId = null;
            this.spaceHeld = false; this._unsubscribe = null; this._raf = 0;
            this._resize = () => this.scheduleRender();
            this._keydown = e => this._onKeyDown(e);
            this._keyup = e => this._onKeyUp(e);
            this._styles();
        }
        mount(host) {
            if (!host) return; this.host = host;
            host.innerHTML = `<div class="video-node-editor-canvas" tabindex="0"><div class="video-node-grid"></div><div class="video-node-world"><svg class="video-node-links" xmlns="http://www.w3.org/2000/svg"></svg><div class="video-node-layer"></div></div><div class="video-node-box-select" hidden></div><div class="video-node-minimap"><div class="video-node-minimap-content"></div><div class="video-node-minimap-view"></div></div><div class="video-node-empty"><strong>Fusion Graph</strong><span>Shift+A or right click to add a node.</span></div></div>`;
            this.root = host.querySelector('.video-node-editor-canvas'); this.world = host.querySelector('.video-node-world'); this.linksSvg = host.querySelector('.video-node-links'); this.nodeLayer = host.querySelector('.video-node-layer');
            this._bind(); this._unsubscribe = this.graph.subscribe(() => this.scheduleRender()); global.addEventListener('resize', this._resize); document.addEventListener('keydown', this._keydown, true); document.addEventListener('keyup', this._keyup, true); this.render();
        }
        setGraph(graph) { this._unsubscribe?.(); this.graph = graph; this.selectedLinkId = null; this._unsubscribe = this.graph.subscribe(() => this.scheduleRender()); this.render() }
        scheduleRender() { if (this._raf) return; this._raf = requestAnimationFrame(() => { this._raf = 0; this.render() }) }
        render() {
            if (!this.nodeLayer || !this.graph) return;
            this._renderNodes(); this._applyViewport(); this._renderLinks(); this._renderMiniMap();
            const e = this.root.querySelector('.video-node-empty'); if (e) e.hidden = this.graph.nodes.length > 0;
            this.manager?.updateZoomReadout?.(this.graph.viewport.zoom);
        }
        _renderNodes() {
            const old = new Map([...this.nodeLayer.children].map(e => [e.dataset.nodeId, e])), keep = new Set();
            this.graph.nodes.forEach(n => { keep.add(n.id); let el = old.get(n.id); if (!el) { el = this._createNode(n); this.nodeLayer.appendChild(el) } this._updateNode(el, n) });
            old.forEach((el, id) => { if (!keep.has(id)) el.remove() });
        }
        _createNode(node) {
            const el = document.createElement('article'); el.className = 'video-fusion-node'; el.dataset.nodeId = node.id;
            el.innerHTML = `<header class="video-node-header"><span class="video-node-dot"></span><strong></strong><span class="video-node-header-spacer"></span><button class="video-node-enable" type="button" title="Enable / bypass"></button></header><div class="video-node-body"><div class="video-node-sockets video-node-inputs"></div><div class="video-node-params"></div><div class="video-node-sockets video-node-outputs"></div></div>`;
            el.addEventListener('pointerdown', e => {
                if (e.button !== 0) return;
                if (e.target.closest('.video-node-socket,input,select,button')) return;
                if (this.spaceHeld || e.altKey) return;
                this._beginNodeDrag(e, node);
            });
            el.addEventListener('click', e => { if (e.target.closest('.video-node-socket,input,select,button')) return; e.stopPropagation(); this.graph.selectNode(node.id, e.shiftKey || e.ctrlKey || e.metaKey); this.selectedLinkId = null; this.manager?.onNodeSelectionChanged?.(node) });
            el.querySelector('.video-node-header').addEventListener('dblclick', e => { if (e.target.closest('button')) return; e.preventDefault(); e.stopPropagation(); this.manager?.commitHistory?.('Collapse Node'); this.graph.setNodeCollapsed(node.id, !node.collapsed) });
            el.querySelector('.video-node-enable').addEventListener('click', e => { e.stopPropagation(); this.manager?.commitHistory?.('Bypass Node'); this.graph.setNodeEnabled(node.id, !node.enabled) });
            return el;
        }
        _updateNode(el, node) {
            el.classList.toggle('selected', !!node.selected); el.classList.toggle('disabled', node.enabled === false); el.classList.toggle('collapsed', !!node.collapsed);
            el.style.left = `${node.x}px`; el.style.top = `${node.y}px`; el.style.width = `${node.width || 172}px`; el.style.setProperty('--node-accent', node.color || 'var(--accent-blue,#5f5f5f)');
            const def = this.library.get(node.type); el.title = def?.description || node.title;
            el.querySelector('.video-node-header strong').textContent = node.title; el.querySelector('.video-node-enable').innerHTML = node.enabled === false ? this._svg('bypass') : this._svg('enabled');
            this._renderSockets(el.querySelector('.video-node-inputs'), node, node.inputs, 'input'); this._renderSockets(el.querySelector('.video-node-outputs'), node, node.outputs, 'output'); this._renderParams(el.querySelector('.video-node-params'), node);
        }
        _renderSockets(host, node, sockets, side) {
            host.innerHTML = '';
            sockets.forEach(s => {
                const row = document.createElement('div'); row.className = `video-node-socket-row ${side}`; const b = document.createElement('button'); b.type = 'button'; b.className = `video-node-socket ${side} type-${s.type || 'image'}`; b.dataset.nodeId = node.id; b.dataset.socketName = s.name; b.dataset.socketType = s.type || 'image'; const label = document.createElement('span'); label.textContent = s.name; side === 'input' ? row.append(b, label) : row.append(label, b);
                b.addEventListener('pointerdown', e => {
                    e.preventDefault(); e.stopPropagation();
                    if (e.altKey && side === 'input') { this.manager?.commitHistory?.('Disconnect Input'); this.graph.disconnectInput(node.id, s.name); return }
                    this._beginSocketLink(e, node, s, side);
                }); host.appendChild(row)
            });
        }
        _renderParams(host, node) {
            const def = this.library.get(node.type), descs = def?.params || {}; host.innerHTML = '';
            Object.entries(descs).forEach(([key, d]) => {
                const row = document.createElement('label'); row.className = 'video-node-param'; const n = document.createElement('span'); n.textContent = d.label || key; let input;
                if (d.type === 'select') {
                    input = document.createElement('select');
                    (d.options || []).forEach(v => { const o = document.createElement('option'); o.value = v; o.textContent = v; input.appendChild(o) });
                    input.value = node.params[key];
                } else if (d.type === 'color') {
                    input = document.createElement('input');
                    input.type = 'color';
                    input.value = node.params[key] || '#ffffff';
                } else if (d.type === 'bool') {
                    input = document.createElement('input');
                    input.type = 'checkbox';
                    input.checked = !!node.params[key];
                    row.classList.add('boolean');
                } else {
                    input = document.createElement('input');
                    input.type = 'number';
                    input.value = Number(node.params[key] ?? d.default ?? 0);
                    if (d.min != null) input.min = d.min;
                    if (d.max != null) input.max = d.max;
                    input.step = d.step ?? .01;
                }
                input.addEventListener('focus', () => this.manager?.beginParamEdit?.());
                input.addEventListener('change', () => {
                    this.manager?.commitParamEdit?.('Change Node Parameter');
                    const v = input.type === 'number' ? Number(input.value) : input.type === 'checkbox' ? input.checked : input.value;
                    this.graph.setNodeParam(node.id, key, v);
                    this.manager?.onNodeParamChanged?.(node, key, v);
                });
                row.append(n, input); host.appendChild(row)
            });
        }
        _applyViewport() { const v = this.graph.viewport; this.world.style.transform = `translate(${v.x}px,${v.y}px) scale(${v.zoom})`; this.root.style.setProperty('--node-grid-x', `${v.x}px`); this.root.style.setProperty('--node-grid-y', `${v.y}px`); this.root.style.setProperty('--node-grid-scale', v.zoom) }
        _renderLinks() {
            this.linksSvg.innerHTML = '';
            this.graph.links.forEach(l => {
                const a = this._socketCenter(l.fromNode, l.fromSocket, 'output'), b = this._socketCenter(l.toNode, l.toSocket, 'input'); if (!a || !b) return;
                const p = this._path(a, b, false); p.dataset.linkId = l.id; p.classList.toggle('selected', l.id === this.selectedLinkId);
                p.addEventListener('pointerdown', e => { e.stopPropagation(); this.selectedLinkId = l.id; this.graph.clearSelection(); this._renderLinks(); this.manager?._status?.('Link selected · Delete to remove') });
                this.linksSvg.appendChild(p);
            });
            if (this.pendingLink?.start && this.pendingLink?.current) this.linksSvg.appendChild(this._path(this.pendingLink.start, this.pendingLink.current, true));
        }
        _path(a, b, preview) { const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'), d = Math.max(48, Math.abs(b.x - a.x) * .5); p.setAttribute('d', `M ${a.x} ${a.y} C ${a.x + d} ${a.y}, ${b.x - d} ${b.y}, ${b.x} ${b.y}`); p.setAttribute('class', preview ? 'video-node-link preview' : 'video-node-link'); return p }
        _socketCenter(nodeId, socket, side) {
            const el = this.nodeLayer?.querySelector(`.video-node-socket.${side}[data-node-id="${CSS.escape(nodeId)}"][data-socket-name="${CSS.escape(socket)}"]`); if (!el) return null;
            const r = el.getBoundingClientRect(), wr = this.world.getBoundingClientRect(), z = this.graph.viewport.zoom; return { x: (r.left + r.width / 2 - wr.left) / z, y: (r.top + r.height / 2 - wr.top) / z };
        }
        _beginNodeDrag(e, node) {
            e.preventDefault(); this.root.focus({ preventScroll: true });
            if (!node.selected) this.graph.selectNode(node.id, e.shiftKey || e.ctrlKey || e.metaKey);
            const selected = this.graph.getSelectedNodes(), start = selected.map(n => ({ id: n.id, x: n.x, y: n.y })), sx = e.clientX, sy = e.clientY;
            this.manager?.beginInteractiveHistory?.('Move Nodes');
            this.root.classList.add('dragging-node');
            const move = m => {
                const z = this.graph.viewport.zoom, dx = (m.clientX - sx) / z, dy = (m.clientY - sy) / z;
                start.forEach(s => { const n = this.graph.getNode(s.id); if (!n) return; let x = s.x + dx, y = s.y + dy; if (this.manager?.snapEnabled && !m.shiftKey) { const g = this.manager.gridSize || 20; x = Math.round(x / g) * g; y = Math.round(y / g) * g } n.x = x; n.y = y });
                this.render();
            };
            const up = () => { global.removeEventListener('pointermove', move); this.root.classList.remove('dragging-node'); this.manager?.endInteractiveHistory?.(); this.graph._emit('node:move', { selectedIds: selected.map(n => n.id) }) };
            global.addEventListener('pointermove', move); global.addEventListener('pointerup', up, { once: true });
        }
        _beginSocketLink(e, node, socket, side) {
            const start = this._socketCenter(node.id, socket.name, side); if (!start) return;
            this.pendingLink = { side, nodeId: node.id, socketName: socket.name, socketType: socket.type || 'image', start, current: start }; this.root.classList.add('linking');
            const move = m => { const r = this.world.getBoundingClientRect(), z = this.graph.viewport.zoom; this.pendingLink.current = { x: (m.clientX - r.left) / z, y: (m.clientY - r.top) / z }; this._renderLinks() };
            const up = m => { global.removeEventListener('pointermove', move); const t = document.elementFromPoint(m.clientX, m.clientY)?.closest?.('.video-node-socket'); if (t && this.pendingLink) this._completeLink(t); this.pendingLink = null; this.root.classList.remove('linking'); this._renderLinks() };
            global.addEventListener('pointermove', move); global.addEventListener('pointerup', up, { once: true });
        }
        _completeLink(t) {
            const s = this.pendingLink, targetSide = t.classList.contains('input') ? 'input' : 'output'; if (s.side === targetSide) return;
            const targetType = t.dataset.socketType || 'image'; if (s.socketType !== targetType && s.socketType !== 'any' && targetType !== 'any') { this.manager?._status?.(`Cannot connect ${s.socketType} to ${targetType}`); return }
            const tn = t.dataset.nodeId, ts = t.dataset.socketName; this.manager?.commitHistory?.('Connect Nodes');
            s.side === 'output' ? this.graph.connect(s.nodeId, s.socketName, tn, ts) : this.graph.connect(tn, ts, s.nodeId, s.socketName);
        }
        _bind() {
            this.root.addEventListener('pointerdown', e => {
                this.root.focus({ preventScroll: true });
                if (e.target.closest('.video-fusion-node,.video-node-link')) return;
                if (e.button === 1 || (e.button === 0 && (e.altKey || this.spaceHeld))) { this._beginPan(e); return }
                if (e.button === 0) this._beginBoxSelection(e);
            });
            this.root.addEventListener('wheel', e => {
                e.preventDefault();
                const v = this.graph.viewport;
                if (e.shiftKey && !e.ctrlKey && !e.metaKey) { this.graph.setViewport({ x: v.x - e.deltaY, y: v.y - e.deltaX }, { silent: true }); this.render(); return }
                const r = this.root.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top, bx = (mx - v.x) / v.zoom, by = (my - v.y) / v.zoom, nz = Math.max(.25, Math.min(2.4, v.zoom * (e.deltaY < 0 ? 1.1 : .9)));
                this.graph.setViewport({ x: mx - bx * nz, y: my - by * nz, zoom: nz });
            }, { passive: false });
            this.root.addEventListener('contextmenu', e => { e.preventDefault(); this.manager?.openAddNodeMenu?.(e.clientX, e.clientY, this.screenToWorld(e.clientX, e.clientY)) });
            const mini = this.root.querySelector('.video-node-minimap'); mini?.addEventListener('pointerdown', e => this._miniMapNavigate(e));
        }
        _beginPan(e) {
            e.preventDefault(); const v = this.graph.viewport, sx = e.clientX, sy = e.clientY, x = v.x, y = v.y; this.root.classList.add('panning');
            const move = m => { this.graph.setViewport({ x: x + (m.clientX - sx), y: y + (m.clientY - sy) }, { silent: true }); this.render() };
            const up = () => { global.removeEventListener('pointermove', move); this.root.classList.remove('panning'); this.graph._emit('viewport', this.graph.viewport) };
            global.addEventListener('pointermove', move); global.addEventListener('pointerup', up, { once: true });
        }
        _beginBoxSelection(e) {
            const startX = e.clientX, startY = e.clientY, add = e.shiftKey || e.ctrlKey || e.metaKey, box = this.root.querySelector('.video-node-box-select'); let active = false;
            const move = m => {
                const dx = m.clientX - startX, dy = m.clientY - startY; if (!active && Math.hypot(dx, dy) < 4) return; active = true;
                const rr = this.root.getBoundingClientRect(), x1 = Math.min(startX, m.clientX) - rr.left, y1 = Math.min(startY, m.clientY) - rr.top, x2 = Math.max(startX, m.clientX) - rr.left, y2 = Math.max(startY, m.clientY) - rr.top;
                box.hidden = false; box.style.left = `${x1}px`; box.style.top = `${y1}px`; box.style.width = `${x2 - x1}px`; box.style.height = `${y2 - y1}px`;
            };
            const up = m => {
                global.removeEventListener('pointermove', move); if (!active) { if (!add) this.graph.clearSelection(); this.selectedLinkId = null; this.manager?.onNodeSelectionChanged?.(null); return }
                box.hidden = true;
                const br = box.getBoundingClientRect(); if (!add) this.graph.nodes.forEach(n => n.selected = false);
                this.nodeLayer.querySelectorAll('.video-fusion-node').forEach(el => { const r = el.getBoundingClientRect(); const hit = !(r.right < br.left || r.left > br.right || r.bottom < br.top || r.top > br.bottom); if (hit) { const n = this.graph.getNode(el.dataset.nodeId); if (n) n.selected = true } });
                this.graph._emit('selection', { selectedIds: this.graph.getSelectedNodes().map(n => n.id) }); this.manager?.onNodeSelectionChanged?.(this.graph.getSelectedNodes()[0] || null);
            };
            global.addEventListener('pointermove', move); global.addEventListener('pointerup', up, { once: true });
        }
        _onKeyDown(e) {
            if (!this.manager?.isOpen?.()) return;
            if (e.code === 'Space' && !document.activeElement?.matches?.('input,textarea,select')) { this.spaceHeld = true; this.root?.classList.add('pan-ready'); if (e.target === document.body) e.preventDefault() }
            if (document.activeElement?.matches?.('input,textarea,select')) { if (e.key === 'Escape') document.activeElement.blur(); return }
            const mod = e.ctrlKey || e.metaKey, key = e.key.toLowerCase();
            if (e.key === 'Escape') { this.pendingLink = null; this._renderLinks(); this.manager?._closeMenu?.(); return }
            if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); if (this.selectedLinkId) { this.manager?.commitHistory?.('Delete Link'); this.graph.disconnect(this.selectedLinkId); this.selectedLinkId = null } else this.manager?.deleteSelectedNodes?.(); return }
            if (key === 'a' && e.shiftKey) { e.preventDefault(); const r = this.root.getBoundingClientRect(); this.manager?.openAddNodeMenu?.(r.left + r.width / 2, r.top + 90, this.screenToWorld(r.left + r.width / 2, r.top + r.height / 2)); return }
            if (key === 'f' && !mod) { e.preventDefault(); this.manager?.frameSelected?.(); return }
            if (e.key === 'Home') { e.preventDefault(); this.manager?.frameAll?.(); return }
            if (mod && key === 'c') { e.preventDefault(); this.manager?.copySelectedNodes?.(); return }
            if (mod && key === 'x') { e.preventDefault(); this.manager?.cutSelectedNodes?.(); return }
            if (mod && key === 'v') { e.preventDefault(); this.manager?.pasteNodes?.(); return }
            if (mod && key === 'd') { e.preventDefault(); this.manager?.duplicateSelectedNodes?.(); return }
            if (mod && key === 'z' && e.shiftKey) { e.preventDefault(); this.manager?.redo?.(); return }
            if (mod && key === 'z') { e.preventDefault(); this.manager?.undo?.(); return }
            if (mod && key === 'y') { e.preventDefault(); this.manager?.redo?.(); return }
        }
        _onKeyUp(e) { if (e.code === 'Space') { this.spaceHeld = false; this.root?.classList.remove('pan-ready') } }
        screenToWorld(x, y) { const r = this.root.getBoundingClientRect(), v = this.graph.viewport; return { x: (x - r.left - v.x) / v.zoom, y: (y - r.top - v.y) / v.zoom } }
        _renderMiniMap() {
            const mini = this.root?.querySelector('.video-node-minimap'), content = mini?.querySelector('.video-node-minimap-content'), view = mini?.querySelector('.video-node-minimap-view'); if (!mini || !content || !view) return;
            const nodes = this.graph.nodes; if (!nodes.length) { mini.hidden = true; return } mini.hidden = false;
            const minX = Math.min(...nodes.map(n => n.x)) - 60, minY = Math.min(...nodes.map(n => n.y)) - 60, maxX = Math.max(...nodes.map(n => n.x + (n.width || 172))) + 60, maxY = Math.max(...nodes.map(n => n.y + (n.collapsed ? 28 : 150))) + 60, w = Math.max(1, maxX - minX), h = Math.max(1, maxY - minY);
            content.innerHTML = ''; nodes.forEach(n => { const d = document.createElement('i'); d.style.left = `${(n.x - minX) / w * 100}%`; d.style.top = `${(n.y - minY) / h * 100}%`; d.style.width = `${Math.max(3, (n.width || 172) / w * 100)}%`; d.style.height = `${Math.max(3, (n.collapsed ? 28 : 80) / h * 100)}%`; d.classList.toggle('selected', !!n.selected); content.appendChild(d) });
            const rr = this.root.getBoundingClientRect(), v = this.graph.viewport, left = (-v.x / v.zoom - minX) / w * 100, top = (-v.y / v.zoom - minY) / h * 100, vw = (rr.width / v.zoom) / w * 100, vh = (rr.height / v.zoom) / h * 100;
            view.style.left = `${left}%`; view.style.top = `${top}%`; view.style.width = `${vw}%`; view.style.height = `${vh}%`;
            mini.dataset.minX = minX; mini.dataset.minY = minY; mini.dataset.worldW = w; mini.dataset.worldH = h;
        }
        _miniMapNavigate(e) {
            const mini = this.root.querySelector('.video-node-minimap'), r = mini.getBoundingClientRect(), minX = Number(mini.dataset.minX), minY = Number(mini.dataset.minY), w = Number(mini.dataset.worldW), h = Number(mini.dataset.worldH), v = this.graph.viewport, rr = this.root.getBoundingClientRect();
            const wx = minX + (e.clientX - r.left) / r.width * w, wy = minY + (e.clientY - r.top) / r.height * h;
            this.graph.setViewport({ x: rr.width / 2 - wx * v.zoom, y: rr.height / 2 - wy * v.zoom });
        }
        _svg(n) { return n === 'bypass' ? '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7"/><path d="M7 17L17 7"/></svg>' : '<svg viewBox="0 0 24 24"><path d="M5 12h14"/><circle cx="12" cy="12" r="7"/></svg>' }
        _styles() {
            if (document.getElementById('video-node-renderer-styles')) return; const s = document.createElement('style'); s.id = 'video-node-renderer-styles'; s.textContent = `
  .video-node-editor-canvas{position:relative;width:100%;height:100%;overflow:hidden;outline:none;background:var(--primary-dark,#333);user-select:none;--node-grid-x:0px;--node-grid-y:0px;--node-grid-scale:1}
  .video-node-editor-canvas.pan-ready{cursor:grab}.video-node-editor-canvas.panning{cursor:grabbing}.video-node-editor-canvas.linking{cursor:crosshair}
  .video-node-grid{position:absolute;inset:0;pointer-events:none;background-image:linear-gradient(to right,rgba(255,255,255,.035) 1px,transparent 1px),linear-gradient(to bottom,rgba(255,255,255,.035) 1px,transparent 1px),linear-gradient(to right,rgba(255,255,255,.07) 1px,transparent 1px),linear-gradient(to bottom,rgba(255,255,255,.07) 1px,transparent 1px);background-size:calc(20px * var(--node-grid-scale)) calc(20px * var(--node-grid-scale)),calc(20px * var(--node-grid-scale)) calc(20px * var(--node-grid-scale)),calc(100px * var(--node-grid-scale)) calc(100px * var(--node-grid-scale)),calc(100px * var(--node-grid-scale)) calc(100px * var(--node-grid-scale));background-position:var(--node-grid-x) var(--node-grid-y)}
  .video-node-world{position:absolute;left:0;top:0;width:4000px;height:2600px;transform-origin:0 0}.video-node-links{position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:auto}.video-node-link{fill:none;stroke:var(--text-secondary,#b0b0b0);stroke-width:2;opacity:.72;pointer-events:stroke;cursor:pointer}.video-node-link:hover{stroke:var(--text-primary,#fff);opacity:1;stroke-width:3}.video-node-link.selected{stroke:var(--text-primary,#fff);stroke-width:3.5;opacity:1}.video-node-link.preview{stroke-dasharray:5 4;opacity:.9;pointer-events:none}.video-node-layer{position:absolute;inset:0}
  .video-fusion-node{position:absolute;min-height:54px;border:1px solid var(--border-color,#4d4d4d81);background:var(--panel-bg,#333);box-shadow:0 4px 12px rgba(0,0,0,.2);color:var(--text-primary,#fff)}.video-fusion-node.selected{outline:1px solid var(--text-primary,#fff);outline-offset:1px}.video-fusion-node.disabled{opacity:.55}.video-fusion-node.collapsed{min-height:23px}.video-fusion-node.collapsed .video-node-body{display:none}
  .video-node-header{height:23px;display:grid;grid-template-columns:7px minmax(0,1fr) 1fr 20px;align-items:center;gap:5px;padding:0 4px 0 6px;background:linear-gradient(to right,var(--node-accent),var(--secondary-dark,#3c3c3c) 34%);border-bottom:1px solid var(--border-color,#4d4d4d81);cursor:grab}.video-node-header:active{cursor:grabbing}.video-node-header strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:8px}.video-node-dot{width:5px;height:5px;border-radius:50%;background:var(--text-secondary,#b0b0b0)}.video-node-enable{width:18px;height:18px;padding:3px;border:0;background:transparent;color:var(--text-secondary,#b0b0b0)}.video-node-enable svg{width:100%;height:100%;fill:none;stroke:currentColor;stroke-width:1.7}
  .video-node-body{display:grid;padding:5px 0}.video-node-sockets{display:flex;flex-direction:column;gap:2px}.video-node-socket-row{min-height:18px;display:flex;align-items:center;gap:5px;padding:0 5px;color:var(--text-secondary,#b0b0b0);font-size:7px}.video-node-socket-row.output{justify-content:flex-end;text-align:right}.video-node-socket{width:10px;height:10px;flex:0 0 10px;padding:0;border:1px solid var(--text-secondary,#b0b0b0);border-radius:50%;background:var(--primary-dark,#333);cursor:crosshair}.video-node-socket[data-socket-type="mask"]{border-radius:2px}.video-node-socket:hover{background:var(--text-secondary,#b0b0b0)}
  .video-node-params{display:flex;flex-direction:column;gap:2px;padding:4px 5px;border-top:1px solid var(--border-color,#4d4d4d40);border-bottom:1px solid var(--border-color,#4d4d4d40)}.video-node-param{min-height:20px;display:grid;grid-template-columns:minmax(50px,1fr) 58px;align-items:center;gap:4px;color:var(--text-secondary,#b0b0b0);font-size:7px}.video-node-param input,.video-node-param select{width:100%;height:18px;box-sizing:border-box;padding:0 3px;border:1px solid var(--input-border,var(--border-color,#4d4d4d81));border-radius:0;background:var(--input-bg,var(--secondary-dark,#3c3c3c));color:var(--text-primary,#fff);font:inherit}.video-node-param.boolean input[type=checkbox]{width:14px;height:14px;justify-self:end;padding:0;accent-color:var(--accent-blue,#5f5f5f)}.video-node-socket.type-mask{border-color:#6d817b!important}.video-node-socket.type-image{border-color:#7a818b!important}
  .video-node-box-select{position:absolute;border:1px solid var(--text-secondary,#b0b0b0);background:rgba(255,255,255,.06);pointer-events:none}.video-node-box-select[hidden]{display:none}
  .video-node-minimap{position:absolute;right:8px;bottom:8px;width:132px;height:82px;border:1px solid var(--border-color,#4d4d4d81);background:rgba(35,35,35,.88);overflow:hidden;cursor:crosshair}.video-node-minimap-content{position:absolute;inset:0}.video-node-minimap-content i{position:absolute;display:block;min-width:2px;min-height:2px;background:var(--text-secondary,#b0b0b0);opacity:.45}.video-node-minimap-content i.selected{opacity:1;background:var(--text-primary,#fff)}.video-node-minimap-view{position:absolute;border:1px solid var(--text-primary,#fff);background:rgba(255,255,255,.035);pointer-events:none}
  .video-node-empty{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:3px;color:var(--text-secondary,#b0b0b0);pointer-events:none}.video-node-empty strong{font-size:10px}.video-node-empty span{font-size:8px}.video-node-empty[hidden]{display:none}
  `; document.head.appendChild(s)
        }
        destroy() { this._unsubscribe?.(); if (this._raf) cancelAnimationFrame(this._raf); global.removeEventListener('resize', this._resize); document.removeEventListener('keydown', this._keydown, true); document.removeEventListener('keyup', this._keyup, true); if (this.host) this.host.innerHTML = ''; this.host = null }
    }
    global.VideoNodeRenderer = VideoNodeRenderer;
})(window);