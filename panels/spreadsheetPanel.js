// panels/spreadsheetPanel.js
// SM Engine — Timeline Spreadsheet Editor PRO v2
// Virtualized + event-driven + deferred Timeline/Graph refresh.
(function () {
    'use strict';

    const DEG = 180 / Math.PI;
    const RAD = Math.PI / 180;
    const ROW_H = 25;
    const HEADER_H = 25;
    const OVERSCAN = 8;
    const DEFAULT_FPS = 30;

    const COLS = Object.freeze([
        { key:'object', label:'Object', width:180, type:'text', ro:true },
        { key:'frame', label:'Frame', width:70, type:'number' },
        { key:'time', label:'Time', width:76, type:'number' },
        { key:'px', label:'Pos X', width:82, type:'number' },
        { key:'py', label:'Pos Y', width:82, type:'number' },
        { key:'pz', label:'Pos Z', width:82, type:'number' },
        { key:'rx', label:'Rot X°', width:82, type:'number' },
        { key:'ry', label:'Rot Y°', width:82, type:'number' },
        { key:'rz', label:'Rot Z°', width:82, type:'number' },
        { key:'sx', label:'Scale X', width:82, type:'number' },
        { key:'sy', label:'Scale Y', width:82, type:'number' },
        { key:'sz', label:'Scale Z', width:82, type:'number' },
        { key:'interpolation', label:'Interpolation', width:104, type:'select' },
        { key:'source', label:'Source', width:120, type:'text', ro:true }
    ]);

    const INTERP = ['bezier','linear','constant','smooth'];

    const n = (v, f = 0) => Number.isFinite(Number(v)) ? Number(v) : f;
    const fmt = (v, d = 4) => Number.isFinite(Number(v)) ? String(Number(Number(v).toFixed(d))) : '';
    const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

    function entries(map) {
        if (!map) return [];
        return map instanceof Map ? Array.from(map.entries()) : Object.entries(map);
    }

    function comp(v, axis, fallback) {
        if (!v) return fallback;
        if (typeof v[axis] === 'number') return v[axis];
        const i = {x:0,y:1,z:2,w:3}[axis];
        return Array.isArray(v) ? n(v[i], fallback) : fallback;
    }

    function setComp(v, axis, value, factory) {
        const t = v || factory();
        if (Array.isArray(t)) {
            t[{x:0,y:1,z:2,w:3}[axis]] = value;
        } else {
            t[axis] = value;
        }
        return t;
    }

    class SMSpreadsheetPanel {
        constructor() {
            this.timelineRoot = null;
            this.root = null;
            this.scroll = null;
            this.header = null;
            this.canvas = null;
            this.search = null;
            this.formula = null;
            this.cellName = null;
            this.status = null;

            this.rows = [];
            this.filtered = [];
            this.byId = new Map();
            this.selected = new Set();

            this.active = null;
            this.editor = null;
            this.visible = false;
            this.selectedOnly = false;
            this.sortKey = 'frame';
            this.sortDir = 1;

            this.dirty = false;
            this.dirtyUUIDs = new Set();

            this._snapshot = new Map();
            this._renderStart = -1;
            this._renderEnd = -1;
            this._scrollRAF = 0;
            this._refreshRAF = 0;
            this._searchTimer = 0;
            this._boundTabs = false;

            this.rowNumWidth = 42;
            this.gridTemplate = `${this.rowNumWidth}px ${COLS.map(c => `${c.width}px`).join(' ')}`;
            this.gridWidth = this.rowNumWidth + COLS.reduce((a,c) => a + c.width, 0);

            window.addEventListener('sm:timeline-panel-ready', e => {
                this.integrateTimeline(e.detail?.root || document.getElementById('timelineBody'));
            });

            this._bindExternalEvents();
            this._bindLegacyButton();
        }

        _fps() {
            const a = Number(document.getElementById('timeline-pro-fps')?.value);
            if (a > 0) return a;
            const b = Number(document.getElementById('timeline-fps')?.value);
            if (b > 0) return b;
            return n(window.timelineFPS, DEFAULT_FPS) || DEFAULT_FPS;
        }

        _object(uuid) {
            return window.scene?.getObjectByProperty?.('uuid', uuid)
                || (window.animation2DManager?.timelineObject?.uuid === uuid ? window.animation2DManager.timelineObject : null);
        }

        _rotation(kf) {
            if (kf?.rotationEuler && Number.isFinite(Number(kf.rotationEuler.x))) {
                return {x:n(kf.rotationEuler.x), y:n(kf.rotationEuler.y), z:n(kf.rotationEuler.z)};
            }
            if (kf?.rotation) {
                const q = new THREE.Quaternion(
                    comp(kf.rotation,'x',0),
                    comp(kf.rotation,'y',0),
                    comp(kf.rotation,'z',0),
                    comp(kf.rotation,'w',1)
                );
                const e = new THREE.Euler().setFromQuaternion(q,'XYZ');
                return {x:e.x,y:e.y,z:e.z};
            }
            return {x:0,y:0,z:0};
        }

        _buildRows() {
            const rows = [];
            const byId = new Map();
            const fps = this._fps();
            const all = window.keyframes;

            if (!(all instanceof Map)) {
                this.rows = rows;
                this.byId = byId;
                return;
            }

            all.forEach((map, uuid) => {
                const obj = this._object(uuid);
                const name = obj?.name || obj?.type || `Object ${String(uuid).slice(0,8)}`;
                const list = entries(map);

                for (let i = 0; i < list.length; i++) {
                    const frameKey = list[i][0];
                    const kf = list[i][1];
                    if (!kf) continue;

                    const frame = n(frameKey, n(kf.time,0) * fps);
                    const time = n(kf.time, frame / fps);
                    const r = this._rotation(kf);
                    const source = String(kf.source || (kf.isImportedTrack ? 'imported' : 'manual'));
                    const ro = source === 'native-animation-clip' || kf.isNativeGraphSample === true;

                    const row = {
                        id:`${uuid}:${frameKey}`,
                        uuid, obj, object:name, map,
                        frameKey:String(frameKey),
                        frame, time,
                        px:comp(kf.position,'x',obj?.position?.x || 0),
                        py:comp(kf.position,'y',obj?.position?.y || 0),
                        pz:comp(kf.position,'z',obj?.position?.z || 0),
                        rx:r.x*DEG, ry:r.y*DEG, rz:r.z*DEG,
                        sx:comp(kf.scale,'x',obj?.scale?.x ?? 1),
                        sy:comp(kf.scale,'y',obj?.scale?.y ?? 1),
                        sz:comp(kf.scale,'z',obj?.scale?.z ?? 1),
                        interpolation:kf.interpolation || 'bezier',
                        source, kf, ro
                    };
                    rows.push(row);
                    byId.set(row.id,row);
                }
            });

            this.rows = rows;
            this.byId = byId;
        }

        _filterSort() {
            const q = this.search?.value?.trim().toLowerCase() || '';
            const selectedUUID = window.selectedObject?.uuid || null;
            const out = [];

            for (let i=0;i<this.rows.length;i++) {
                const r = this.rows[i];
                if (this.selectedOnly && selectedUUID && r.uuid !== selectedUUID) continue;
                if (q) {
                    const h = `${r.object} ${r.source} ${r.interpolation} ${r.frame} ${r.time}`.toLowerCase();
                    if (!h.includes(q)) continue;
                }
                out.push(r);
            }

            const key = this.sortKey;
            const dir = this.sortDir;
            out.sort((a,b) => {
                const av = a[key], bv = b[key];
                if (typeof av === 'number' && typeof bv === 'number') return (av-bv)*dir;
                return String(av ?? '').localeCompare(String(bv ?? ''))*dir;
            });

            this.filtered = out;
        }

        refresh({preserveSelection=true,preserveScroll=true}={}) {
            const old = preserveSelection ? new Set(this.selected) : new Set();
            const top = preserveScroll ? (this.scroll?.scrollTop || 0) : 0;
            this._commitEditor(true);

            this._buildRows();
            this.selected = new Set(Array.from(old).filter(id => this.byId.has(id)));
            this._filterSort();

            this._renderStart = -1;
            this._renderEnd = -1;
            this._updateHeight();

            if (this.scroll) this.scroll.scrollTop = top;
            this._renderVisible(true);
            this._status();
        }

        integrateTimeline(root=document.getElementById('timelineBody')) {
            if (!root) return false;
            this.timelineRoot = root;

            const tabs = root.querySelector('.sm-timeline-pro-view-tabs');
            if (tabs && !tabs.querySelector('[data-timeline-pro-view="spreadsheet"]')) {
                const b = document.createElement('button');
                b.className = 'sm-timeline-pro-view';
                b.dataset.timelineProView = 'spreadsheet';
                b.textContent = 'Spreadsheet';
                b.title = 'Timeline Spreadsheet Editor';
                const consoleTab = tabs.querySelector('[data-timeline-pro-view="console"]');
                consoleTab ? consoleTab.insertAdjacentElement('beforebegin',b) : tabs.appendChild(b);
            }

            this.mount(root);

            if (!this._boundTabs) {
                this._boundTabs = true;
                root.addEventListener('click', e => {
                    const b = e.target.closest('[data-timeline-pro-view]');
                    if (!b) return;
                    const view = b.dataset.timelineProView;

                    if (view === 'spreadsheet') {
                        e.preventDefault();
                        e.stopImmediatePropagation();
                        this.show();
                        return;
                    }

                    if (this.visible) {
                        this.hide({restoreTimeline:true,flush:true});
                    }
                }, true);
            }

            return true;
        }

        _timelineViews() {
            if (!this.timelineRoot) return [];
            const selectors = [
                '.sm-timeline-commandbar',
                '#stats-panel',
                '#timeline-controls-wrapper',
                '#timeline-sculpt-panel',
                '#bone-editor',
                '#global-node-editor-container',
                '.sm-timeline-bottom-status'
            ];
            const out = [];
            selectors.forEach(s => this.timelineRoot.querySelectorAll(s).forEach(el => {
                if (el && el !== this.root && !out.includes(el)) out.push(el);
            }));
            return out;
        }

        show() {
            if (!this.timelineRoot) this.integrateTimeline();
            if (!this.timelineRoot || !this.root) return false;

            if (window.SMConsolePanel?.visible) {
                window.SMConsolePanel.hide?.({restoreTimeline:true});
            }

            if (!this.visible) {
                this._snapshot.clear();
                this._timelineViews().forEach(el => {
                    this._snapshot.set(el,el.style.display);
                    el.style.setProperty('display','none','important');
                });
            }

            this.root.style.setProperty('display','flex','important');
            this.visible = true;

            this.timelineRoot.querySelectorAll('.sm-timeline-pro-view').forEach(b => {
                b.classList.toggle('active', b.dataset.timelineProView === 'spreadsheet');
            });

            this.refresh();
            requestAnimationFrame(() => this._renderVisible(true));
            return true;
        }

        hide({restoreTimeline=true,flush=true}={}) {
            if (!this.root) return false;
            this._commitEditor(false);
            this.root.style.setProperty('display','none','important');
            this.visible = false;

            if (restoreTimeline) {
                this._snapshot.forEach((display,el) => {
                    el.style.removeProperty('display');
                    if (display) el.style.display = display;
                });
                this._snapshot.clear();
            }

            if (flush) this.flushTimelineUI();
            return true;
        }

        toggle() {
            return this.visible ? this.hide() : this.show();
        }

        mount(host) {
            if (!host) return false;
            this._styles();

            if (this.root) {
                if (this.root.parentElement !== host) host.appendChild(this.root);
                return true;
            }

            const root = document.createElement('section');
            root.id = 'sm-timeline-spreadsheet';
            root.className = 'sm-spreadsheet-panel';
            root.style.display = 'none';
            root.innerHTML = `
                <div class="sm-sheet-toolbar">
                    <div class="sm-sheet-title">Timeline Spreadsheet</div>
                    <button class="sm-sheet-tool" data-a="refresh">Refresh</button>
                    <button class="sm-sheet-tool" data-a="add">+ Row</button>
                    <button class="sm-sheet-tool" data-a="duplicate">Duplicate</button>
                    <button class="sm-sheet-tool" data-a="delete">Delete</button>
                    <button class="sm-sheet-tool" data-a="selected">Selected Only</button>
                    <div class="sm-sheet-toolbar-spacer"></div>
                    <label class="sm-sheet-search"><span>⌕</span><input id="sm-sheet-search-input" type="search" placeholder="Search rows"></label>
                    <button class="sm-sheet-tool" data-a="copy">Copy</button>
                </div>
                <div class="sm-sheet-formula-bar">
                    <span id="sm-sheet-cell-name" class="sm-sheet-cell-name">—</span>
                    <span class="sm-sheet-fx">fx</span>
                    <input id="sm-sheet-formula-input" type="text" disabled placeholder="Select an editable cell">
                </div>
                <div class="sm-sheet-grid-scroll" id="sm-sheet-grid-scroll">
                    <div class="sm-sheet-header-row" id="sm-sheet-header-row"></div>
                    <div class="sm-sheet-virtual-canvas" id="sm-sheet-virtual-canvas"></div>
                </div>
                <div class="sm-sheet-status" id="sm-sheet-status">Ready</div>
            `;
            host.appendChild(root);

            this.root = root;
            this.scroll = root.querySelector('#sm-sheet-grid-scroll');
            this.header = root.querySelector('#sm-sheet-header-row');
            this.canvas = root.querySelector('#sm-sheet-virtual-canvas');
            this.search = root.querySelector('#sm-sheet-search-input');
            this.formula = root.querySelector('#sm-sheet-formula-input');
            this.cellName = root.querySelector('#sm-sheet-cell-name');
            this.status = root.querySelector('#sm-sheet-status');

            this._buildHeader();
            this._bindUI();
            return true;
        }

        _buildHeader() {
            this.header.innerHTML = '';
            this.header.style.gridTemplateColumns = this.gridTemplate;
            this.header.style.width = `${this.gridWidth}px`;

            const c = document.createElement('div');
            c.className = 'sm-sheet-header-cell sm-sheet-row-number-head';
            c.textContent = '#';
            this.header.appendChild(c);

            COLS.forEach(col => {
                const b = document.createElement('button');
                b.className = 'sm-sheet-header-cell';
                b.dataset.column = col.key;
                b.textContent = col.label;
                this.header.appendChild(b);
            });
        }

        _styles() {
            document.getElementById('sm-timeline-spreadsheet-styles')?.remove();
            if (document.getElementById('sm-timeline-spreadsheet-styles-v2')) return;

            const s = document.createElement('style');
            s.id = 'sm-timeline-spreadsheet-styles-v2';
            s.textContent = `
                #timelineBody .sm-spreadsheet-panel{min-height:0;flex:1 1 0;display:flex;flex-direction:column;overflow:hidden;background:var(--panel-bg,var(--primary-dark,#333));color:var(--text-primary,#fff);border:0;font:9px Inter,"Segoe UI",Arial,sans-serif}
                #timelineBody .sm-sheet-toolbar{height:31px;min-height:31px;display:flex;align-items:center;gap:2px;padding:0 6px;background:var(--header-bg,var(--secondary-dark,#3c3c3c));overflow-x:auto}
                #timelineBody .sm-sheet-title{padding:0 8px 0 4px;color:var(--text-secondary,#b0b0b0);font-weight:600;text-transform:uppercase;white-space:nowrap}
                #timelineBody .sm-sheet-tool{height:24px;padding:0 7px;background:transparent;color:var(--text-secondary,#b0b0b0);border:0;border-radius:0;font:inherit;cursor:pointer;white-space:nowrap}
                #timelineBody .sm-sheet-tool:hover,#timelineBody .sm-sheet-tool.active{background:rgba(255,255,255,.055);color:#fff}
                #timelineBody .sm-sheet-toolbar-spacer{flex:1 1 auto}
                #timelineBody .sm-sheet-search{width:clamp(140px,18vw,250px);height:24px;display:flex;align-items:center;gap:5px;padding:0 6px;background:var(--primary-dark,#333);color:#666}
                #timelineBody .sm-sheet-search input{min-width:0;width:100%;height:22px;background:transparent;color:#fff;border:0;outline:0;font:inherit}
                #timelineBody .sm-sheet-formula-bar{height:27px;min-height:27px;display:flex;align-items:center;background:var(--primary-dark,#333)}
                #timelineBody .sm-sheet-cell-name{width:74px;padding:0 7px;color:#888;font:8px "Cascadia Mono",Consolas,monospace}
                #timelineBody .sm-sheet-fx{width:28px;text-align:center;color:#666;font:italic 10px Georgia,serif}
                #timelineBody #sm-sheet-formula-input{min-width:0;height:25px;flex:1 1 auto;padding:0 7px;background:var(--secondary-dark,#3c3c3c);color:#fff;border:0;outline:0;font:9px "Cascadia Mono",Consolas,monospace}
                #timelineBody .sm-sheet-grid-scroll{min-height:0;flex:1 1 0;position:relative;overflow:auto;background:var(--primary-dark,#333);contain:strict;scrollbar-width:thin}
                #timelineBody .sm-sheet-header-row{height:${HEADER_H}px;position:sticky;top:0;z-index:30;display:grid;background:var(--header-bg,var(--secondary-dark,#3c3c3c))}
                #timelineBody .sm-sheet-header-cell{height:${HEADER_H}px;display:flex;align-items:center;padding:0 6px;background:transparent;color:#888;border:0;border-radius:0;font:500 9px "Cascadia Mono",Consolas,monospace;white-space:nowrap;overflow:hidden}
                #timelineBody button.sm-sheet-header-cell{cursor:pointer}
                #timelineBody button.sm-sheet-header-cell:hover{background:rgba(255,255,255,.055);color:#ddd}
                #timelineBody .sm-sheet-row-number-head{position:sticky;left:0;z-index:40;justify-content:flex-end;background:var(--header-bg,var(--secondary-dark,#3c3c3c))}
                #timelineBody .sm-sheet-virtual-canvas{position:relative;min-width:max-content;width:100%;contain:layout style}
                #timelineBody .sm-sheet-virtual-row{height:${ROW_H}px;position:absolute;left:0;display:grid;contain:layout paint style;font:9px "Cascadia Mono",Consolas,monospace}
                #timelineBody .sm-sheet-virtual-row.even{background:rgba(255,255,255,.009)}
                #timelineBody .sm-sheet-virtual-row:hover{background:rgba(255,255,255,.025)}
                #timelineBody .sm-sheet-virtual-row.selected{background:rgba(86,111,118,.18)}
                #timelineBody .sm-sheet-row-number,#timelineBody .sm-sheet-cell{height:${ROW_H}px;display:flex;align-items:center;padding:0 6px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;color:#bbb}
                #timelineBody .sm-sheet-row-number{position:sticky;left:0;z-index:10;justify-content:flex-end;background:var(--header-bg,var(--secondary-dark,#3c3c3c));color:#666;cursor:pointer}
                #timelineBody .sm-sheet-cell.editable{cursor:text}
                #timelineBody .sm-sheet-cell.active{background:rgba(255,255,255,.06);color:#fff;box-shadow:inset 0 0 0 1px rgba(150,171,177,.4)}
                #timelineBody .sm-sheet-inline-editor{width:100%;height:100%;padding:0 5px;background:#454545;color:#fff;border:0;outline:0;font:9px "Cascadia Mono",Consolas,monospace}
                #timelineBody .sm-sheet-empty{position:absolute;left:0;right:0;top:0;height:100px;display:grid;place-items:center;color:#666}
                #timelineBody .sm-sheet-status{height:22px;min-height:22px;display:flex;align-items:center;padding:0 7px;background:var(--header-bg,var(--secondary-dark,#3c3c3c));color:#6f6f6f;font-size:8px}
            `;
            document.head.appendChild(s);
        }

        _updateHeight() {
            if (!this.canvas) return;
            this.canvas.style.height = `${Math.max(1,this.filtered.length*ROW_H)}px`;
            this.canvas.style.width = `${this.gridWidth}px`;
        }

        _range() {
            if (!this.scroll || !this.filtered.length) return {start:0,end:0};
            const top = Math.max(0,this.scroll.scrollTop-HEADER_H);
            const h = this.scroll.clientHeight;
            return {
                start:Math.max(0,Math.floor(top/ROW_H)-OVERSCAN),
                end:Math.min(this.filtered.length,Math.ceil((top+h)/ROW_H)+OVERSCAN)
            };
        }

        _scheduleRender() {
            if (this._scrollRAF) return;
            this._scrollRAF = requestAnimationFrame(() => {
                this._scrollRAF = 0;
                this._renderVisible();
            });
        }

        _renderVisible(force=false) {
            if (!this.canvas || !this.visible) return;
            const {start,end} = this._range();
            if (!force && start===this._renderStart && end===this._renderEnd) return;

            this._commitEditor(true);
            this._renderStart = start;
            this._renderEnd = end;
            this.canvas.innerHTML = '';

            if (!this.filtered.length) {
                const e = document.createElement('div');
                e.className = 'sm-sheet-empty';
                e.textContent = 'No timeline keyframes match this view.';
                this.canvas.appendChild(e);
                return;
            }

            const f = document.createDocumentFragment();

            for (let i=start;i<end;i++) {
                const row = this.filtered[i];
                const el = document.createElement('div');
                el.className = 'sm-sheet-virtual-row';
                el.dataset.rowId = row.id;
                el.dataset.rowIndex = String(i);
                el.style.top = `${i*ROW_H}px`;
                el.style.width = `${this.gridWidth}px`;
                el.style.gridTemplateColumns = this.gridTemplate;
                el.classList.toggle('even',i%2===1);
                el.classList.toggle('selected',this.selected.has(row.id));

                const num = document.createElement('div');
                num.className = 'sm-sheet-row-number';
                num.textContent = String(i+1);
                el.appendChild(num);

                COLS.forEach((col,ci) => {
                    const cell = document.createElement('div');
                    cell.className = 'sm-sheet-cell';
                    cell.dataset.rowId = row.id;
                    cell.dataset.column = col.key;
                    cell.dataset.ci = String(ci);
                    if (!col.ro && !row.ro) cell.classList.add('editable');
                    cell.textContent = this._display(row,col);
                    cell.title = `${col.label}: ${cell.textContent}`;
                    el.appendChild(cell);
                });

                f.appendChild(el);
            }

            this.canvas.appendChild(f);
            this._status();
        }

        _display(row,col) {
            const v = row[col.key];
            return col.type === 'number' ? fmt(v,col.key==='frame'?0:4) : String(v ?? '');
        }

        _selectRow(id,e={}) {
            if (!this.byId.has(id)) return;
            const add = e.ctrlKey || e.metaKey;
            if (!add) this.selected.clear();
            if (add && this.selected.has(id)) this.selected.delete(id);
            else this.selected.add(id);
            this.canvas.querySelectorAll('.sm-sheet-virtual-row').forEach(r => {
                r.classList.toggle('selected',this.selected.has(r.dataset.rowId));
            });
            this._status();
        }

        _setActive(cell) {
            if (!cell) return;
            this.canvas.querySelectorAll('.sm-sheet-cell.active').forEach(c => c.classList.remove('active'));
            cell.classList.add('active');

            const row = this.byId.get(cell.dataset.rowId);
            const ci = Number(cell.dataset.ci);
            const col = COLS[ci];
            if (!row || !col) return;

            this.active = {rowId:row.id,ci,cell};

            const ri = Number(cell.parentElement?.dataset.rowIndex || 0);
            this.cellName.textContent = `${this._letters(ci+1)}${ri+1}`;
            this.formula.value = this._display(row,col);
            this.formula.disabled = !!(col.ro || row.ro);

            if (!this.selected.has(row.id)) {
                this.selected.clear();
                this.selected.add(row.id);
                this.canvas.querySelectorAll('.sm-sheet-virtual-row').forEach(r => {
                    r.classList.toggle('selected',r.dataset.rowId===row.id);
                });
            }
        }

        _letters(i) {
            let s = '';
            while (i>0) {
                i--;
                s = String.fromCharCode(65+(i%26))+s;
                i = Math.floor(i/26);
            }
            return s;
        }

        _startEdit(cell) {
            this._commitEditor(false);
            this._setActive(cell);

            const row = this.byId.get(cell.dataset.rowId);
            const col = COLS[Number(cell.dataset.ci)];
            if (!row || !col || col.ro || row.ro) return false;

            const ed = col.type === 'select'
                ? document.createElement('select')
                : document.createElement('input');

            if (col.type === 'select') {
                INTERP.forEach(v => {
                    const o = document.createElement('option');
                    o.value = v;
                    o.textContent = v;
                    ed.appendChild(o);
                });
                ed.value = row[col.key] || 'bezier';
            } else {
                ed.type = col.type === 'number' ? 'number' : 'text';
                ed.value = this._display(row,col);
                if (col.key === 'frame') ed.step = '1';
                else if (col.type === 'number') ed.step = '0.001';
            }

            ed.className = 'sm-sheet-inline-editor';
            cell.textContent = '';
            cell.appendChild(ed);
            this.editor = {ed,cell,rowId:row.id,colKey:col.key};

            ed.addEventListener('keydown',e => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this._commitEditor(false);
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    this._cancelEditor();
                }
            });

            ed.addEventListener('blur',() => {
                if (this.editor?.ed === ed) this._commitEditor(false);
            });

            requestAnimationFrame(() => {
                ed.focus();
                ed.select?.();
            });

            return true;
        }

        _commitEditor(silent=false) {
            const st = this.editor;
            if (!st) return false;
            this.editor = null;

            const row = this.byId.get(st.rowId);
            const col = COLS.find(c => c.key === st.colKey);
            const raw = st.ed.value;
            st.ed.remove();

            if (!row || !col) return false;

            const changed = this._commitCell(row,col,raw,true);
            if (st.cell?.isConnected) st.cell.textContent = this._display(row,col);

            if (changed && !silent) {
                const structural = col.key === 'frame' || col.key === 'time';
                this._finalize(structural);
            }
            return changed;
        }

        _cancelEditor() {
            const st = this.editor;
            if (!st) return;
            this.editor = null;
            const row = this.byId.get(st.rowId);
            const col = COLS.find(c => c.key === st.colKey);
            st.ed.remove();
            if (st.cell?.isConnected && row && col) st.cell.textContent = this._display(row,col);
        }

        _commitCell(row,col,raw,defer=false) {
            if (!row || !col || row.ro || col.ro) return false;
            const kf = row.kf;
            if (!kf) return false;

            const value = col.type === 'number' ? n(raw,row[col.key]) : String(raw);
            const fps = this._fps();

            if (col.key === 'frame') {
                return this._moveFrame(row,Math.max(0,Math.round(value)),false,defer);
            }

            if (col.key === 'time') {
                const t = Math.max(0,value);
                kf.time = t;
                row.time = t;
                return this._moveFrame(row,Math.round(t*fps),true,defer);
            }

            if (col.key === 'interpolation') {
                const next = INTERP.includes(value) ? value : 'bezier';
                if (kf.interpolation === next) return false;
                kf.interpolation = next;
                row.interpolation = next;
                this._mark(row.uuid);
                if (!defer) this._finalize(false);
                return true;
            }

            if (['px','py','pz'].includes(col.key)) {
                const a = col.key[1];
                kf.position = setComp(kf.position,a,value,() => row.obj?.position?.clone?.() || new THREE.Vector3());
                row[col.key] = value;
                this._mark(row.uuid);
                if (!defer) this._finalize(false);
                return true;
            }

            if (['sx','sy','sz'].includes(col.key)) {
                const a = col.key[1];
                kf.scale = setComp(kf.scale,a,value,() => row.obj?.scale?.clone?.() || new THREE.Vector3(1,1,1));
                row[col.key] = value;
                this._mark(row.uuid);
                if (!defer) this._finalize(false);
                return true;
            }

            if (['rx','ry','rz'].includes(col.key)) {
                const a = col.key[1];
                const r = this._rotation(kf);
                r[a] = value*RAD;
                kf.rotationEuler = {x:r.x,y:r.y,z:r.z};
                const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(r.x,r.y,r.z,'XYZ'));
                if (kf.rotation?.isQuaternion) kf.rotation.copy(q);
                else kf.rotation = q;
                row.rx = r.x*DEG; row.ry = r.y*DEG; row.rz = r.z*DEG;
                this._mark(row.uuid);
                if (!defer) this._finalize(false);
                return true;
            }

            return false;
        }

        _moveFrame(row,newFrame,keepTime=false,defer=false) {
            const map = window.keyframes?.get?.(row.uuid);
            if (!map) return false;

            const oldKey = row.frameKey;
            const newKey = String(newFrame);

            if (newKey !== oldKey && has(map,newKey)) {
                this._log('warn',`Spreadsheet: frame ${newFrame} already exists for ${row.object}.`);
                return false;
            }

            if (newKey !== oldKey) {
                delete map[oldKey];
                map[newKey] = row.kf;
                this.byId.delete(row.id);
                row.frameKey = newKey;
                row.id = `${row.uuid}:${newKey}`;
                this.byId.set(row.id,row);
            }

            row.frame = newFrame;
            if (!keepTime) {
                row.kf.time = newFrame/this._fps();
                row.time = row.kf.time;
            }

            this._mark(row.uuid);
            if (!defer) this._finalize(true);
            return true;
        }

        _mark(uuid) {
            this.dirty = true;
            window.__smTimelineSpreadsheetDirty = true;
            if (uuid) {
                this.dirtyUUIDs.add(uuid);
                window.TimelineBinaryEvaluator?.invalidateCache?.(uuid);
            }
        }

        _finalize(structural=false) {
            const selectedUUID = window.selectedObject?.uuid;
            if (selectedUUID && this.dirtyUUIDs.has(selectedUUID)) {
                window.updateSceneFromTimeline?.();
            }

            window.dispatchEvent(new CustomEvent('sm:timeline-spreadsheet-dirty',{
                detail:{source:'spreadsheet',uuids:Array.from(this.dirtyUUIDs)}
            }));

            if (structural) {
                this._filterSort();
                this._updateHeight();
                this._renderStart = -1;
                this._renderEnd = -1;
            }

            this._renderVisible(true);
            this._status();
        }

        flushTimelineUI(force=false) {
            if (!this.dirty && !force) return false;

            const ids = Array.from(this.dirtyUUIDs);
            ids.forEach(id => window.TimelineBinaryEvaluator?.invalidateCache?.(id));

            window.updateKeyframesUI?.();
            window.updateLayersUI?.();
            window.renderGraph?.();
            window.refreshTimelineRows?.();
            window.updateSceneFromTimeline?.();

            this.dirty = false;
            this.dirtyUUIDs.clear();
            window.__smTimelineSpreadsheetDirty = false;

            window.dispatchEvent(new CustomEvent('sm:timeline-spreadsheet-flushed',{
                detail:{source:'spreadsheet',uuids:ids}
            }));

            return true;
        }

        addRow() {
            const obj = window.selectedObject;
            if (!obj?.isObject3D) {
                this._log('warn','Spreadsheet: select a scene object first.');
                return false;
            }

            window.keyframes = window.keyframes instanceof Map ? window.keyframes : new Map();
            const fps = this._fps();
            const frame = Math.max(0,Math.round(n(window.currentTime,0)*fps));
            const map = window.keyframes.get(obj.uuid) || {};

            if (has(map,frame)) {
                this._log('warn',`Spreadsheet: keyframe ${frame} already exists.`);
                return false;
            }

            const e = new THREE.Euler().setFromQuaternion(obj.quaternion,'XYZ');
            map[frame] = {
                time:frame/fps,
                position:obj.position.clone(),
                rotation:obj.quaternion.clone(),
                rotationEuler:{x:e.x,y:e.y,z:e.z},
                scale:obj.scale.clone(),
                interpolation:document.getElementById('timeline-pro-interpolation')?.value || 'bezier',
                source:'manual',
                isImportedTrack:false
            };

            window.keyframes.set(obj.uuid,map);
            this._mark(obj.uuid);
            this.refresh({preserveSelection:false,preserveScroll:true});
            this.selected.add(`${obj.uuid}:${frame}`);
            this._renderVisible(true);
            return true;
        }

        deleteSelectedRows() {
            if (!this.selected.size) return false;
            const affected = new Set();

            for (const id of this.selected) {
                const row = this.byId.get(id);
                if (!row || row.ro) continue;
                const map = window.keyframes?.get?.(row.uuid);
                if (!map) continue;
                delete map[row.frameKey];
                affected.add(row.uuid);
                if (!Object.keys(map).length) window.keyframes.delete(row.uuid);
            }

            if (!affected.size) return false;
            affected.forEach(id => this._mark(id));
            this.selected.clear();
            this.refresh({preserveSelection:false,preserveScroll:true});
            this._finalize(true);
            return true;
        }

        duplicateSelectedRows() {
            const list = Array.from(this.selected).map(id => this.byId.get(id)).filter(r => r && !r.ro);
            if (!list.length) return false;
            const fps = this._fps();
            const affected = new Set();
            const newIds = [];

            list.forEach(row => {
                const map = window.keyframes?.get?.(row.uuid);
                if (!map) return;
                let f = Math.round(row.frame)+1;
                while (has(map,String(f))) f++;
                const k = this._cloneKeyframe(row.kf);
                k.time = f/fps;
                k.source = k.source || 'manual';
                map[f] = k;
                affected.add(row.uuid);
                newIds.push(`${row.uuid}:${f}`);
            });

            affected.forEach(id => this._mark(id));
            this.refresh({preserveSelection:false,preserveScroll:true});
            this.selected = new Set(newIds);
            this._renderVisible(true);
            return true;
        }

        _cloneKeyframe(kf) {
            const c = {...kf};
            if (kf.position?.clone) c.position = kf.position.clone();
            if (kf.rotation?.clone) c.rotation = kf.rotation.clone();
            if (kf.scale?.clone) c.scale = kf.scale.clone();
            if (kf.rotationEuler) c.rotationEuler = {...kf.rotationEuler};
            return c;
        }

        async copySelected() {
            const list = Array.from(this.selected).map(id => this.byId.get(id)).filter(Boolean);
            if (!list.length) return false;

            const text = [
                COLS.map(c => c.label).join('\t'),
                ...list.map(r => COLS.map(c => r[c.key] ?? '').join('\t'))
            ].join('\n');

            try {
                await navigator.clipboard.writeText(text);
                this._setStatus(`Copied ${list.length} row(s).`);
                return true;
            } catch (_) {
                this._setStatus('Clipboard write failed.');
                return false;
            }
        }

        jumpToRow(row) {
            if (!row) return false;
            window.currentTime = Math.max(0,n(row.kf?.time,row.frame/this._fps()));
            window.isPlaying = false;
            window.updatePlayhead?.();
            window.updateTimeDisplay?.();
            window.updateSceneFromTimeline?.();
            if (row.obj) {
                window.selectedObject = row.obj;
                window.updateHierarchy?.();
                window.updateInspector?.();
                if (window.outlinePass) window.outlinePass.selectedObjects = [row.obj];
            }
            return true;
        }

        _bindUI() {
            this.scroll.addEventListener('scroll',() => this._scheduleRender(),{passive:true});

            this.header.addEventListener('click',e => {
                const c = e.target.closest('[data-column]');
                if (!c) return;
                const key = c.dataset.column;
                if (this.sortKey === key) this.sortDir *= -1;
                else { this.sortKey = key; this.sortDir = 1; }
                this._filterSort();
                this._updateHeight();
                this._renderStart = this._renderEnd = -1;
                this._renderVisible(true);
            });

            this.canvas.addEventListener('click',e => {
                const rowEl = e.target.closest('.sm-sheet-virtual-row');
                if (!rowEl) return;
                const row = this.byId.get(rowEl.dataset.rowId);
                if (!row) return;

                if (e.target.closest('.sm-sheet-row-number')) {
                    this._selectRow(row.id,e);
                    return;
                }

                const cell = e.target.closest('.sm-sheet-cell');
                if (cell) this._setActive(cell);
            });

            this.canvas.addEventListener('dblclick',e => {
                const cell = e.target.closest('.sm-sheet-cell');
                if (cell && this._startEdit(cell)) return;
                const rowEl = e.target.closest('.sm-sheet-virtual-row');
                if (rowEl) this.jumpToRow(this.byId.get(rowEl.dataset.rowId));
            });

            this.search.addEventListener('input',() => {
                clearTimeout(this._searchTimer);
                this._searchTimer = setTimeout(() => {
                    this._filterSort();
                    this._updateHeight();
                    this.scroll.scrollTop = 0;
                    this._renderStart = this._renderEnd = -1;
                    this._renderVisible(true);
                },120);
            });

            this.formula.addEventListener('keydown',e => {
                if (e.key !== 'Enter' || !this.active) return;
                e.preventDefault();
                const row = this.byId.get(this.active.rowId);
                const col = COLS[this.active.ci];
                if (!row || !col || row.ro || col.ro) return;
                const changed = this._commitCell(row,col,this.formula.value,true);
                if (changed) {
                    this._finalize(col.key==='frame' || col.key==='time');
                    this.formula.value = this._display(row,col);
                }
            });

            this.root.querySelectorAll('[data-a]').forEach(b => {
                b.addEventListener('click',() => {
                    const a = b.dataset.a;
                    if (a==='refresh') this.refresh();
                    if (a==='add') this.addRow();
                    if (a==='duplicate') this.duplicateSelectedRows();
                    if (a==='delete') this.deleteSelectedRows();
                    if (a==='copy') this.copySelected();
                    if (a==='selected') {
                        this.selectedOnly = !this.selectedOnly;
                        b.classList.toggle('active',this.selectedOnly);
                        this._filterSort();
                        this._updateHeight();
                        this._renderStart = this._renderEnd = -1;
                        this._renderVisible(true);
                    }
                });
            });
        }

        _bindExternalEvents() {
            const schedule = () => {
                if (!this.visible || this._refreshRAF) return;
                this._refreshRAF = requestAnimationFrame(() => {
                    this._refreshRAF = 0;
                    if (this.visible) this.refresh();
                });
            };

            ['selectionChanged','objectSelected','sm:selection-changed','sm:selected-object-changed']
                .forEach(name => window.addEventListener(name,() => {
                    if (this.selectedOnly) schedule();
                }));

            window.addEventListener('sm:timeline-keyframes-changed',e => {
                if (e.detail?.source === 'spreadsheet') return;
                schedule();
            });

            window.addEventListener('sm:timeline-data-replaced',schedule);
        }

        _bindLegacyButton() {
            const bind = () => {
                const b = document.getElementById('view-spreadsheet');
                if (!b || b.__smSpreadsheetBound) return !!b;
                b.__smSpreadsheetBound = true;
                b.addEventListener('click',e => {
                    e.preventDefault();
                    this.show();
                });
                return true;
            };

            if (bind()) return;

            const obs = new MutationObserver(() => {
                if (bind()) obs.disconnect();
            });

            obs.observe(document.documentElement,{childList:true,subtree:true});
        }

        _setStatus(t) {
            if (this.status) this.status.textContent = String(t);
        }

        _status() {
            let ro = 0;
            for (let i=0;i<this.filtered.length;i++) if (this.filtered[i].ro) ro++;
            const domRows = Math.max(0,this._renderEnd-this._renderStart);
            this._setStatus(
                `${this.filtered.length} rows · ${this.selected.size} selected · ${this.filtered.length-ro} editable · ${ro} native/read-only · DOM ${domRows} rows · FPS ${this._fps()}`
            );
        }

        _log(level,msg) {
            if (window.SMConsolePanel?.push) {
                window.SMConsolePanel.push(level,[msg],{source:'Spreadsheet'});
                return;
            }
            (level==='warn' ? console.warn : console.info)(msg);
        }

        debug() {
            console.table({
                Visible:this.visible,
                'Total rows':this.rows.length,
                'Filtered rows':this.filtered.length,
                'DOM rows':Math.max(0,this._renderEnd-this._renderStart),
                Selected:this.selected.size,
                Dirty:this.dirty,
                'Dirty UUIDs':this.dirtyUUIDs.size,
                FPS:this._fps()
            });
        }
    }

    const panel = new SMSpreadsheetPanel();
    window.SMSpreadsheetPanel = panel;
    window.spreadsheetPanel = panel;

    const root = document.getElementById('timelineBody');
    if (root?.querySelector('.sm-timeline-pro-header')) {
        panel.integrateTimeline(root);
    }
})();