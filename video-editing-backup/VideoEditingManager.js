/**
 * VideoEditingManager.js
 * SM Engine Video Editing mode core.
 * Full Feature Set Preserved + Blender Sequencer Canvas & Viewport Style.
 */

// Inject Blender Sequencer Viewport & Checkerboard CSS
(function () {
    const STYLE_ID = 'sm-blender-sequencer-viewport-theme';
    if (!document.getElementById(STYLE_ID)) {
        const s = document.createElement('style');
        s.id = STYLE_ID;
        s.textContent = `
            .video-preview-professional,
            .video-preview-shell {
                background: #0e0e0e !important;
                border: none !important;
            }
            .video-preview-viewport {
                background: #0e0e0e !important;
                position: relative;
                overflow: hidden;
            }
            /* Blender Dark Checkerboard Stage */
            .video-preview-stage {
                background-color: #202020 !important;
                background-image: repeating-conic-gradient(#202020 0% 25%, #292929 0% 50%) !important;
                background-size: 16px 16px !important;
                background-position: 50% 50% !important;
                box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.08), 0 14px 44px rgba(0, 0, 0, 0.9) !important;
            }
            /* Floating Top-Right Navigation Overlay (Blender Style) */
            .blender-nav-overlay {
                position: absolute;
                top: 10px;
                right: 10px;
                display: flex;
                flex-direction: column;
                gap: 6px;
                z-index: 60;
                pointer-events: auto;
            }
            .blender-nav-btn {
                width: 30px;
                height: 30px;
                border-radius: 50%;
                background: rgba(32, 32, 32, 0.85);
                border: 1px solid rgba(255, 255, 255, 0.14);
                color: #e0e0e0;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.6);
                transition: all 0.15s ease;
                backdrop-filter: blur(4px);
                padding: 0;
            }
            .blender-nav-btn:hover {
                background: rgba(52, 52, 52, 0.95);
                color: #ffffff;
                border-color: rgba(255, 255, 255, 0.3);
                transform: scale(1.05);
            }
            .blender-nav-btn.active {
                background: #4a4a4a;
                color: #ffffff;
                border-color: #888888;
            }
            .video-preview-rail {
               position: absolut;
               bottom: 10px;
               left: 50px;
               gap: 6px;
               z-index: 60;
               pointer-events: auto;
            }

            .video-preview-rail button {
                width: 30px;
                height: 30px;
                border-radius: 50%;
                background: rgba(32, 32, 32, 0.85);
                border: 1px solid rgba(255, 255, 255, 0.14);
                color: #e0e0e0;
            }  
        `;
        document.head.appendChild(s);
    }
})();

class SMVideoCanvasController {
    constructor(manager) {
        this.manager = manager;
        this.container = manager.container;
        this.canvas = manager.canvas;
        this.ctx = manager.ctx;
        this.zoom = 1;
        this.panX = 0;
        this.panY = 0;
        this.fitMode = true;
        this.initialized = false;
        this.showGrid = false;
        this.showSafeAreas = false;
        this.showCenterGuides = false;
        this.showThirds = false;
        this.forcePanMode = false;
        this.snapEnabled = true;
        this.snapThresholdPx = 8;
        this.rotationSnapDegrees = 15;
        this._spaceDown = false;
        this._drag = null;
        this._renderRaf = 0;
        this._lastPointer = { x: 0, y: 0 };
        this._bound = [];
    }
    init() {
        if (this.initialized || !this.container || !this.canvas) return;
        this.initialized = true;
        this.container.classList.add('video-preview-professional');
        this.canvas.classList.add('video-preview-canvas');
        this.canvas.removeAttribute('style');

        const shell = document.createElement('div');
        shell.className = 'video-preview-shell';

        const toolbar = document.createElement('div');
        toolbar.className = 'video-preview-toolbar';
        toolbar.innerHTML = `
            <div class="video-preview-toolbar-group video-preview-toolbar-left">
                <span class="video-preview-mode-label"><i class="fas fa-film"></i> Composite</span>
                <span class="video-preview-divider"></span>
                <button class="video-preview-btn" data-vpc-action="fit" title="Fit composition in viewer (F)"><i class="fas fa-expand"></i><span>Fit</span></button>
                <button class="video-preview-btn" data-vpc-action="actual" title="Actual size 100%"><span>100%</span></button>
                <select class="video-preview-zoom" data-vpc-action="zoom" title="Viewer zoom">
                    <option value="fit">Fit</option>
                    <option value="0.25">25%</option>
                    <option value="0.5">50%</option>
                    <option value="1">100%</option>
                    <option value="2">200%</option>
                    <option value="4">400%</option>
                </select>
            </div>
            <div class="video-preview-toolbar-group video-preview-toolbar-center">
                <button class="video-preview-icon-btn" data-vpc-action="center" title="Center guides"><i class="fas fa-plus"></i></button>
                <button class="video-preview-icon-btn" data-vpc-action="thirds" title="Rule of thirds"><i class="fas fa-border-all"></i></button>
                <button class="video-preview-icon-btn" data-vpc-action="safe" title="Title / action safe areas"><i class="fas fa-vector-square"></i></button>
                <button class="video-preview-icon-btn" data-vpc-action="grid" title="Transparent checker / pixel grid"><i class="fas fa-th"></i></button>
                <button class="video-preview-icon-btn active" data-vpc-action="snap" title="Snap transforms to composition and other layers"><i class="fas fa-magnet"></i></button>
            </div>
            <div class="video-preview-toolbar-group video-preview-toolbar-right">
                <span class="video-preview-quality"><span class="video-preview-dot"></span> Full</span>
                <span class="video-preview-resolution" data-vpc-resolution>1280 × 720</span>
            </div>`;

        const viewport = document.createElement('div');
        viewport.className = 'video-preview-viewport';

        const stage = document.createElement('div');
        stage.className = 'video-preview-stage';

        const guides = document.createElement('div');
        guides.className = 'video-preview-guides';
        guides.innerHTML = `
            <div class="vpc-guide vpc-guide-center-x"></div>
            <div class="vpc-guide vpc-guide-center-y"></div>
            <div class="vpc-thirds vpc-thirds-v1"></div><div class="vpc-thirds vpc-thirds-v2"></div>
            <div class="vpc-thirds vpc-thirds-h1"></div><div class="vpc-thirds vpc-thirds-h2"></div>
            <div class="vpc-safe vpc-safe-action"></div><div class="vpc-safe vpc-safe-title"></div>`;

        const selection = document.createElement('div');
        selection.className = 'video-preview-selection';
        selection.innerHTML = `
            <span class="vpc-rotate-stem"></span>
            <span class="vpc-rotate-handle" data-handle="rotate" title="Rotate layer"></span>
            <span class="vpc-anchor-handle" data-handle="anchor" title="Anchor Point"></span>
            <span class="vpc-handle nw" data-handle="nw"></span><span class="vpc-handle n" data-handle="n"></span><span class="vpc-handle ne" data-handle="ne"></span>
            <span class="vpc-handle e" data-handle="e"></span><span class="vpc-handle se" data-handle="se"></span><span class="vpc-handle s" data-handle="s"></span>
            <span class="vpc-handle sw" data-handle="sw"></span><span class="vpc-handle w" data-handle="w"></span>
            <span class="vpc-selection-label" data-vpc-selection-label></span>
            <span class="vpc-transform-hud" data-vpc-transform-hud></span>`;

        const snapGuides = document.createElement('div');
        snapGuides.className = 'video-preview-snap-guides';
        snapGuides.innerHTML = `
            <span class="vpc-snap-line vertical" data-vpc-snap-x></span>
            <span class="vpc-snap-line horizontal" data-vpc-snap-y></span>`;

        const empty = document.createElement('div');
        empty.className = 'video-preview-empty';
        empty.innerHTML = `<i class="fas fa-photo-video"></i><strong>Composition Preview</strong><span>Import media or add a layer to start editing.</span>`;

        // Blender Top-Right Nav Overlay (Zoom In, Zoom Out & Pan)
        const navOverlay = document.createElement('div');
        navOverlay.className = 'blender-nav-overlay';
        navOverlay.innerHTML = `
            <button class="blender-nav-btn" data-vpc-action="zoom-in" title="Zoom In"><i class="fas fa-search-plus"></i></button>
            <button class="blender-nav-btn" data-vpc-action="zoom-out" title="Zoom Out"><i class="fas fa-search-minus"></i></button>
            <button class="blender-nav-btn" data-vpc-action="hand" title="Pan Tool (H / Space)"><i class="fas fa-hand-paper"></i></button>`;

        const status = document.createElement('div');
        status.className = 'video-preview-statusbar';
        status.innerHTML = `
            <div class="video-preview-status-left"><span data-vpc-status-selection>No layer selected</span></div>
            <div class="video-preview-status-right"><span data-vpc-status-zoom>Fit</span><span class="video-preview-status-sep"></span><span data-vpc-status-time>00:00:00:00</span></div>`;

        const parent = this.canvas.parentElement;
        if (parent === this.container) this.canvas.remove();

        stage.appendChild(this.canvas);
        stage.appendChild(guides);
        stage.appendChild(snapGuides);
        stage.appendChild(selection);

        viewport.appendChild(stage);
        viewport.appendChild(navOverlay);
        viewport.appendChild(empty);

        shell.appendChild(toolbar);
        shell.appendChild(viewport);
        shell.appendChild(status);

        this.container.innerHTML = '';
        this.container.appendChild(shell);

        this.el = { shell, toolbar, viewport, stage, guides, snapGuides, selection, navOverlay, empty, status };
        this._bindUI();
        this._syncGuideClasses();
        this.refreshOverlay();
        this.updateStatus();
    }
    _bind(target, type, fn, opts) {
        target?.addEventListener(type, fn, opts);
        if (target) this._bound.push([target, type, fn, opts]);
    }
    _bindUI() {
        const toolbar = this.el.toolbar;
        const handleActionButton = (btn) => {
            if (!btn || btn.tagName === 'SELECT') return;
            const action = btn.dataset.vpcAction;
            if (action === 'fit') this.fitToView();
            else if (action === 'actual') this.actualSize();
            else if (action === 'zoom-in') this.setZoom(this.zoom * 1.15);
            else if (action === 'zoom-out') this.setZoom(this.zoom / 1.15);
            else if (action === 'hand') {
                this.forcePanMode = !this.forcePanMode;
                btn.classList.toggle('active', this.forcePanMode);
                this.el.navOverlay?.querySelector('[data-vpc-action="hand"]')?.classList.toggle('active', this.forcePanMode);
                this.el.viewport.classList.toggle('is-pan-ready', this.forcePanMode || this._spaceDown);
            }
            else if (action === 'center') { this.showCenterGuides = !this.showCenterGuides; btn.classList.toggle('active', this.showCenterGuides); this._syncGuideClasses(); }
            else if (action === 'thirds') { this.showThirds = !this.showThirds; btn.classList.toggle('active', this.showThirds); this._syncGuideClasses(); }
            else if (action === 'safe') { this.showSafeAreas = !this.showSafeAreas; btn.classList.toggle('active', this.showSafeAreas); this._syncGuideClasses(); }
            else if (action === 'grid') { this.showGrid = !this.showGrid; btn.classList.toggle('active', this.showGrid); this._syncGuideClasses(); }
            else if (action === 'snap') {
                this.snapEnabled = !this.snapEnabled;
                btn.classList.toggle('active', this.snapEnabled);
                if (!this.snapEnabled) this._hideSnapGuides();
            }
            this.updateStatus();
        };
        this._bind(toolbar, 'click', (e) => {
            const btn = e.target.closest('[data-vpc-action]');
            handleActionButton(btn);
        });
        this._bind(this.el.rail, 'click', (e) => {
            const btn = e.target.closest('[data-vpc-action]');
            handleActionButton(btn);
        });
        this._bind(this.el.navOverlay, 'click', (e) => {
            const btn = e.target.closest('[data-vpc-action]');
            handleActionButton(btn);
        });
        const zoomSelect = toolbar.querySelector('[data-vpc-action="zoom"]');
        this._bind(zoomSelect, 'change', () => {
            if (zoomSelect.value === 'fit') this.fitToView();
            else this.setZoom(Number(zoomSelect.value) || 1);
        });
        this._bind(this.el.viewport, 'wheel', (e) => {
            e.preventDefault();
            if (e.ctrlKey || e.metaKey || e.altKey) {
                const factor = Math.exp(-e.deltaY * 0.0015);
                this.setZoom(this.zoom * factor, e.clientX, e.clientY);
            } else {
                this.fitMode = false;
                this.panX -= e.deltaX;
                this.panY -= e.deltaY;
                this._applyView();
            }
        }, { passive: false });
        this._bind(this.el.viewport, 'pointerdown', (e) => this._pointerDown(e));
        this._bind(window, 'pointermove', (e) => this._pointerMove(e));
        this._bind(window, 'pointerup', (e) => this._pointerUp(e));
        this._bind(window, 'pointercancel', (e) => this._pointerUp(e));
        this._bind(window, 'keydown', (e) => {
            const t = e.target;
            if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
            if (e.code === 'Space') { this._spaceDown = true; this.el.viewport.classList.add('is-pan-ready'); e.preventDefault(); }
            if (e.key.toLowerCase() === 'f' && this.manager.active) { this.fitToView(); e.preventDefault(); }
            if (e.key.toLowerCase() === 'h' && this.manager.active) {
                this.forcePanMode = !this.forcePanMode;
                this.el.viewport.classList.toggle('is-pan-ready', this.forcePanMode || this._spaceDown);
                this.el.rail?.querySelector('[data-vpc-action="hand"]')?.classList.toggle('active', this.forcePanMode);
                this.el.navOverlay?.querySelector('[data-vpc-action="hand"]')?.classList.toggle('active', this.forcePanMode);
                e.preventDefault();
            }
        });
        this._bind(window, 'keyup', (e) => {
            if (e.code === 'Space') { this._spaceDown = false; this.el.viewport.classList.toggle('is-pan-ready', !!this.forcePanMode); }
        });
        this._bind(this.el.viewport, 'dblclick', (e) => {
            if (e.target.closest('.video-preview-selection')) return;
            this.fitToView();
        });
    }
    resize() {
        if (!this.initialized) this.init();
        if (!this.canvas || !this.el?.viewport) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const w = Math.max(1, this.manager.resolution.w || 1280);
        const h = Math.max(1, this.manager.resolution.h || 720);
        const pxW = Math.round(w * dpr);
        const pxH = Math.round(h * dpr);
        if (this.canvas.width !== pxW) this.canvas.width = pxW;
        if (this.canvas.height !== pxH) this.canvas.height = pxH;
        this.canvas.style.width = `${w}px`;
        this.canvas.style.height = `${h}px`;
        this.el.stage.style.width = `${w}px`;
        this.el.stage.style.height = `${h}px`;
        this.ctx = this.canvas.getContext('2d');
        this.manager.ctx = this.ctx;
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.el.toolbar.querySelector('[data-vpc-resolution]').textContent = `${w} × ${h}`;
        if (this.fitMode || !Number.isFinite(this.panX) || !Number.isFinite(this.panY)) this.fitToView(false);
        else this._applyView();
        this.refreshOverlay();
    }
    fitToView(render = true) {
        if (!this.el?.viewport) return;
        const rect = this.el.viewport.getBoundingClientRect();
        const w = Math.max(1, this.manager.resolution.w || 1280);
        const h = Math.max(1, this.manager.resolution.h || 720);
        const pad = Math.max(28, Math.min(64, Math.min(rect.width, rect.height) * 0.08));
        const zx = Math.max(0.01, (rect.width - pad * 2) / w);
        const zy = Math.max(0.01, (rect.height - pad * 2) / h);
        this.zoom = Math.max(0.05, Math.min(4, Math.min(zx, zy)));
        this.panX = (rect.width - w * this.zoom) * 0.5;
        this.panY = (rect.height - h * this.zoom) * 0.5;
        this.fitMode = true;
        this._applyView();
        if (render) this.manager.renderCompositeAt?.(window.sequencerManager?.state?.playhead ?? this.manager.currentTime ?? 0);
    }
    actualSize() {
        this.zoom = 1;
        this.fitMode = false;
        this.centerView();
    }
    centerView() {
        const rect = this.el.viewport.getBoundingClientRect();
        const w = this.manager.resolution.w || 1280;
        const h = this.manager.resolution.h || 720;
        this.panX = (rect.width - w * this.zoom) * 0.5;
        this.panY = (rect.height - h * this.zoom) * 0.5;
        this._applyView();
    }
    resetView() { this.fitToView(); }
    setZoom(next, clientX = null, clientY = null) {
        next = Math.max(0.05, Math.min(8, Number(next) || 1));
        const rect = this.el.viewport.getBoundingClientRect();
        const ax = clientX == null ? rect.width * 0.5 : clientX - rect.left;
        const ay = clientY == null ? rect.height * 0.5 : clientY - rect.top;
        const worldX = (ax - this.panX) / this.zoom;
        const worldY = (ay - this.panY) / this.zoom;
        this.zoom = next;
        this.panX = ax - worldX * next;
        this.panY = ay - worldY * next;
        this.fitMode = false;
        this._applyView();
    }
    _applyView() {
        if (!this.el?.stage) return;
        this.el.stage.style.transform = `translate3d(${this.panX}px,${this.panY}px,0) scale(${this.zoom})`;
        this.el.stage.style.setProperty('--vpc-inv-scale', String(1 / Math.max(0.001, this.zoom)));
        const zoomSelect = this.el.toolbar.querySelector('[data-vpc-action="zoom"]');
        if (zoomSelect) {
            const values = [0.25, 0.5, 1, 2, 4];
            const nearest = values.find(v => Math.abs(v - this.zoom) < 0.001);
            zoomSelect.value = this.fitMode ? 'fit' : (nearest ? String(nearest) : 'fit');
        }
        this.updateStatus();
    }
    _syncGuideClasses() {
        if (!this.el) return;
        this.el.guides.classList.toggle('show-center', this.showCenterGuides);
        this.el.guides.classList.toggle('show-thirds', this.showThirds);
        this.el.guides.classList.toggle('show-safe', this.showSafeAreas);
        this.el.stage.classList.toggle('show-grid', this.showGrid);
    }
    clientToProject(clientX, clientY) {
        const rect = this.el.viewport.getBoundingClientRect();
        return { x: (clientX - rect.left - this.panX) / this.zoom, y: (clientY - rect.top - this.panY) / this.zoom };
    }
    getItemBounds(item) {
        if (!item) return null;
        const W = this.manager.resolution.w || 1280;
        const H = this.manager.resolution.h || 720;
        const seq = window.sequencerManager;
        const playhead = seq?.state?.playhead ?? this.manager.currentTime ?? 0;
        const clip = seq?.state?.primarySelection?.mediaRef === item.id
            ? seq.state.primarySelection
            : seq?.state?.clips?.find(c => c.mediaRef === item.id && playhead >= c.start && playhead < c.start + c.duration) || null;
        const evaluated = clip && seq?.evaluateClipAt
            ? seq.evaluateClipAt(clip, playhead)
            : clip;
        if (item.type === 'text') {
            const size = item.fontSize || 42;
            const text = item.text || 'Title';
            let tw = text.length * size * 0.58;
            try {
                const ctx = this.ctx;
                ctx.save();
                ctx.font = `${item.fontWeight || 700} ${size}px ${item.fontFamily || 'Segoe UI'}`;
                tw = Math.max(24, ctx.measureText(text).width);
                ctx.restore();
            } catch (_) {}
            const th = size * 1.25;
            const cx = evaluated?.x ?? item.x ?? W / 2;
            const cy = evaluated?.y ?? item.y ?? H / 2;
            return {
                x: cx - tw / 2, y: cy - th / 2, w: tw, h: th, cx, cy,
                scaleX: evaluated?.scaleX ?? item.scaleX ?? 1,
                scaleY: evaluated?.scaleY ?? item.scaleY ?? 1,
                rotation: evaluated?.rotation ?? item.rotation ?? 0,
                anchorX: evaluated?.anchorX ?? item.anchorX ?? 0.5,
                anchorY: evaluated?.anchorY ?? item.anchorY ?? 0.5
            };
        }
        const x = evaluated?.x ?? item.x ?? (item.type === 'media' ? 0 : W * 0.2);
        const y = evaluated?.y ?? item.y ?? (item.type === 'media' ? 0 : H * 0.24);
        const w = evaluated?.w ?? item.w ?? (item.type === 'media' ? W : W * 0.6);
        const h = evaluated?.h ?? item.h ?? (item.type === 'media' ? H : H * 0.48);
        return {
            x, y, w, h, cx: x + w / 2, cy: y + h / 2,
            scaleX: evaluated?.scaleX ?? item.scaleX ?? 1,
            scaleY: evaluated?.scaleY ?? item.scaleY ?? 1,
            rotation: evaluated?.rotation ?? item.rotation ?? 0,
            anchorX: evaluated?.anchorX ?? item.anchorX ?? 0.5,
            anchorY: evaluated?.anchorY ?? item.anchorY ?? 0.5
        };
    }
    _selectionPivot(bounds) {
        if (!bounds) return { x: 0, y: 0 };
        const ax = Math.max(0, Math.min(1, Number(bounds.anchorX ?? 0.5)));
        const ay = Math.max(0, Math.min(1, Number(bounds.anchorY ?? 0.5)));
        return { x: bounds.x + bounds.w * ax, y: bounds.y + bounds.h * ay };
    }
    _projectThreshold() {
        return Math.max(0.25, this.snapThresholdPx / Math.max(0.001, this.zoom || 1));
    }
    _candidateSnapTargets(excludeItem) {
        const W = this.manager.resolution.w || 1280;
        const H = this.manager.resolution.h || 720;
        const xs = [{ value: 0 }, { value: W * 0.5 }, { value: W }];
        const ys = [{ value: 0 }, { value: H * 0.5 }, { value: H }];
        if (this.showThirds) {
            xs.push({ value: W / 3 }, { value: W * 2 / 3 });
            ys.push({ value: H / 3 }, { value: H * 2 / 3 });
        }
        (this.manager.items || []).forEach(item => {
            if (!item || item === excludeItem || item.visible === false) return;
            const b = this.getItemBounds(item);
            if (!b) return;
            xs.push({ value: b.x }, { value: b.x + b.w * 0.5 }, { value: b.x + b.w });
            ys.push({ value: b.y }, { value: b.y + b.h * 0.5 }, { value: b.y + b.h });
        });
        return { xs, ys };
    }
    _snapMove(item, x, y, bounds, event) {
        if (!this.snapEnabled || event?.ctrlKey || event?.metaKey) {
            this._hideSnapGuides();
            return { x, y };
        }
        const threshold = this._projectThreshold();
        const targets = this._candidateSnapTargets(item);
        const pointsX = [x, x + bounds.w * 0.5, x + bounds.w];
        const pointsY = [y, y + bounds.h * 0.5, y + bounds.h];
        let bestX = null, bestY = null;
        pointsX.forEach(p => targets.xs.forEach(t => {
            const delta = t.value - p, dist = Math.abs(delta);
            if (dist <= threshold && (!bestX || dist < bestX.dist)) bestX = { dist, delta, guide: t.value };
        }));
        pointsY.forEach(p => targets.ys.forEach(t => {
            const delta = t.value - p, dist = Math.abs(delta);
            if (dist <= threshold && (!bestY || dist < bestY.dist)) bestY = { dist, delta, guide: t.value };
        }));
        if (bestX) x += bestX.delta;
        if (bestY) y += bestY.delta;
        this._showSnapGuides(bestX ? bestX.guide : null, bestY ? bestY.guide : null);
        return { x, y };
    }
    _showSnapGuides(x, y) {
        const host = this.el?.snapGuides;
        if (!host) return;
        const vx = host.querySelector('[data-vpc-snap-x]');
        const hy = host.querySelector('[data-vpc-snap-y]');
        if (vx) {
            if (Number.isFinite(x)) { vx.style.left = `${x}px`; vx.classList.add('visible'); }
            else vx.classList.remove('visible');
        }
        if (hy) {
            if (Number.isFinite(y)) { hy.style.top = `${y}px`; hy.classList.add('visible'); }
            else hy.classList.remove('visible');
        }
    }
    _hideSnapGuides() {
        this.el?.snapGuides?.querySelectorAll('.vpc-snap-line').forEach(el => el.classList.remove('visible'));
    }
    _setTransformHud(text, visible = true) {
        const hud = this.el?.selection?.querySelector('[data-vpc-transform-hud]');
        if (!hud) return;
        hud.textContent = text || '';
        hud.classList.toggle('visible', !!visible && !!text);
    }
    _rotationFromPointer(clientX, clientY, pivot) {
        const p = this.clientToProject(clientX, clientY);
        return Math.atan2(p.y - pivot.y, p.x - pivot.x) * 180 / Math.PI;
    }
    _hitTest(x, y) {
        const items = this.manager.items || [];
        for (let i = items.length - 1; i >= 0; i--) {
            const item = items[i];
            if (!item || item.visible === false) continue;
            const b = this.getItemBounds(item);
            if (b && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return item;
        }
        return null;
    }
    _pointerDown(e) {
        if (e.button === 1 || this._spaceDown || this.forcePanMode) {
            e.preventDefault();
            this.fitMode = false;
            this._drag = { type: 'pan', startClientX: e.clientX, startClientY: e.clientY, startPanX: this.panX, startPanY: this.panY };
            this.el.viewport.classList.add('is-panning');
            return;
        }
        if (e.button !== 0) return;
        const handle = e.target.closest?.('[data-handle]');
        const item = this.manager.selectedItem;
        if (handle && item) {
            const handleType = handle.dataset.handle;
            const b = this.getItemBounds(item);
            if (!b) return;
            e.preventDefault();
            e.stopPropagation();
            if (handleType === 'rotate') {
                const pivot = this._selectionPivot(b);
                this._drag = {
                    type: 'rotate', item, pivot,
                    startPointerAngle: this._rotationFromPointer(e.clientX, e.clientY, pivot),
                    startRotation: Number(b.rotation || 0)
                };
                this.el.viewport.classList.add('is-rotating-layer');
                this._setTransformHud(`${Math.round(Number(b.rotation || 0) * 10) / 10}°`);
                return;
            }
            if (handleType === 'anchor') {
                this._drag = { type: 'anchor', item, start: { ...b } };
                this.el.viewport.classList.add('is-moving-anchor');
                return;
            }
            if (item.type !== 'text' && handle.classList.contains('vpc-handle')) {
                this._drag = {
                    type: 'resize', handle: handleType, item,
                    startClientX: e.clientX, startClientY: e.clientY,
                    start: { ...b }, aspect: b.w / Math.max(1, b.h)
                };
                return;
            }
        }
        const p = this.clientToProject(e.clientX, e.clientY);
        const hit = this._hitTest(p.x, p.y);
        if (hit) {
            e.preventDefault();
            if (this.manager.selectedItem !== hit) this.manager.selectItem(hit);
            const b = this.getItemBounds(hit);
            this._drag = { type: 'move', item: hit, startProjectX: p.x, startProjectY: p.y, startX: b.x, startY: b.y, bounds: b };
            this.el.viewport.classList.add('is-moving-layer');
        } else {
            this.manager.selectedItem = null;
            this.refreshOverlay();
            this.updateStatus();
        }
    }
    _pointerMove(e) {
        this._lastPointer.x = e.clientX;
        this._lastPointer.y = e.clientY;
        const d = this._drag;
        if (!d) return;
        if (d.type === 'pan') {
            this.panX = d.startPanX + (e.clientX - d.startClientX);
            this.panY = d.startPanY + (e.clientY - d.startClientY);
            this._applyView();
            return;
        }
        if (d.type === 'move') {
            const p = this.clientToProject(e.clientX, e.clientY);
            let x = d.startX + (p.x - d.startProjectX);
            let y = d.startY + (p.y - d.startProjectY);
            if (e.shiftKey) {
                const dx = Math.abs(x - d.startX), dy = Math.abs(y - d.startY);
                if (dx > dy) y = d.startY; else x = d.startX;
            }
            const snapped = this._snapMove(d.item, x, y, d.bounds, e);
            x = snapped.x;
            y = snapped.y;
            if (d.item.type === 'text') {
                d.item.x = x + d.bounds.w / 2;
                d.item.y = y + d.bounds.h / 2;
            } else {
                d.item.x = x;
                d.item.y = y;
            }
            this._syncPrimaryClip(d.item);
            this._setTransformHud(`X ${Math.round(x)}   Y ${Math.round(y)}`);
            this._scheduleRender();
            return;
        }
        if (d.type === 'rotate') {
            let angle = d.startRotation + (
                this._rotationFromPointer(e.clientX, e.clientY, d.pivot) - d.startPointerAngle
            );
            if (e.shiftKey) {
                const step = Math.max(1, Number(this.rotationSnapDegrees || 15));
                angle = Math.round(angle / step) * step;
            }
            angle = ((angle + 180) % 360 + 360) % 360 - 180;
            d.item.rotation = angle;
            this._syncPrimaryClip(d.item);
            this._hideSnapGuides();
            this._setTransformHud(`${Math.round(angle * 10) / 10}°`);
            this._scheduleRender();
            return;
        }
        if (d.type === 'anchor') {
            const p = this.clientToProject(e.clientX, e.clientY);
            const b = d.start;
            let ax = (p.x - b.x) / Math.max(1, b.w);
            let ay = (p.y - b.y) / Math.max(1, b.h);
            if (!e.altKey) {
                ax = Math.max(0, Math.min(1, ax));
                ay = Math.max(0, Math.min(1, ay));
            }
            if (e.shiftKey) {
                const presets = [0, 0.5, 1];
                ax = presets.reduce((best, v) => Math.abs(v - ax) < Math.abs(best - ax) ? v : best, presets[0]);
                ay = presets.reduce((best, v) => Math.abs(v - ay) < Math.abs(best - ay) ? v : best, presets[0]);
            }
            d.item.anchorX = ax;
            d.item.anchorY = ay;
            this._syncPrimaryClip(d.item);
            this._setTransformHud(`Anchor ${Math.round(ax * 100)}%, ${Math.round(ay * 100)}%`);
            this._scheduleRender();
            return;
        }
        if (d.type === 'resize') {
            const p0 = this.clientToProject(d.startClientX, d.startClientY);
            const p1 = this.clientToProject(e.clientX, e.clientY);
            const dx = p1.x - p0.x, dy = p1.y - p0.y;
            let { x, y, w, h } = d.start;
            const hnd = d.handle;
            if (hnd.includes('e')) w = Math.max(8, d.start.w + dx);
            if (hnd.includes('s')) h = Math.max(8, d.start.h + dy);
            if (hnd.includes('w')) { x = d.start.x + dx; w = Math.max(8, d.start.w - dx); if (w === 8) x = d.start.x + d.start.w - 8; }
            if (hnd.includes('n')) { y = d.start.y + dy; h = Math.max(8, d.start.h - dy); if (h === 8) y = d.start.y + d.start.h - 8; }
            if (e.shiftKey && /^(nw|ne|sw|se)$/.test(hnd)) {
                const targetH = w / d.aspect;
                const targetW = h * d.aspect;
                if (Math.abs(targetH - h) < Math.abs(targetW - w)) h = Math.max(8, targetH); else w = Math.max(8, targetW);
                if (hnd.includes('w')) x = d.start.x + d.start.w - w;
                if (hnd.includes('n')) y = d.start.y + d.start.h - h;
            }
            if (e.altKey) {
                const cx = d.start.x + d.start.w * 0.5;
                const cy = d.start.y + d.start.h * 0.5;
                if (hnd.includes('e') || hnd.includes('w')) x = cx - w * 0.5;
                if (hnd.includes('n') || hnd.includes('s')) y = cy - h * 0.5;
            }
            Object.assign(d.item, { x, y, w, h });
            this._syncPrimaryClip(d.item);
            this._hideSnapGuides();
            this._setTransformHud(`${Math.round(w)} × ${Math.round(h)}`);
            this._scheduleRender();
        }
    }
    _pointerUp() {
        if (!this._drag) return;
        const changed = this._drag.item || null;
        this._drag = null;
        this.el.viewport.classList.remove('is-panning', 'is-moving-layer', 'is-rotating-layer', 'is-moving-anchor');
        this._hideSnapGuides();
        this._setTransformHud('', false);
        if (changed) {
            this._syncPrimaryClip(changed);
            this.manager.renderCompositeAt?.(window.sequencerManager?.state?.playhead ?? this.manager.currentTime ?? 0);
            const seq = window.sequencerManager;
            const clip = seq?.state?.clips?.find?.(c => c.mediaRef === changed.id) || null;
            if (clip) seq?.renderer?.updateClip?.(clip);
            seq?.inspector?.refresh?.();
            window.dispatchEvent(new CustomEvent(
                'videoCanvasTransformChanged',
                { detail: { item: changed, clip } }
            ));
        }
    }
    _syncPrimaryClip(item) {
        const seq = window.sequencerManager;
        if (!seq?.state || !item) return;

        let clip = seq.state.primarySelection;
        if (!clip || clip.mediaRef !== item.id) {
            clip = seq.state.clips.find(c => c.mediaRef === item.id) || null;
        }
        if (!clip) return;

        const b = this.getItemBounds(item);

        const write = (channel, prop, value) => {
            if (!Number.isFinite(Number(value))) return;

            if (seq.isPropertyAnimated?.(clip, channel)) {
                seq.setAnimatedProperty?.(
                    clip,
                    channel,
                    Number(value),
                    { refresh: false }
                );
            } else {
                clip[prop] = Number(value);
            }
        };

        if (item.type === 'text') {
            write('positionX', 'x', item.x);
            write('positionY', 'y', item.y);
        } else {
            write('positionX', 'x', item.x ?? b.x);
            write('positionY', 'y', item.y ?? b.y);

            // Width / height are still static geometry properties.
            clip.w = item.w ?? b.w;
            clip.h = item.h ?? b.h;
        }

        if (item.scaleX != null) write('scaleX', 'scaleX', item.scaleX);
        if (item.scaleY != null) write('scaleY', 'scaleY', item.scaleY);
        if (item.rotation != null) write('rotation', 'rotation', item.rotation);
        if (item.anchorX != null) write('anchorX', 'anchorX', item.anchorX);
        if (item.anchorY != null) write('anchorY', 'anchorY', item.anchorY);
    }
    _scheduleRender() {
        if (this._renderRaf) return;
        this._renderRaf = requestAnimationFrame(() => {
            this._renderRaf = 0;
            const t = window.sequencerManager?.state?.playhead ?? this.manager.currentTime ?? 0;
            this.manager.renderCompositeAt?.(t);
            this.refreshOverlay();
        });
    }
    refreshOverlay() {
        if (!this.el) return;
        const item = this.manager.selectedItem;
        const sel = this.el.selection;
        if (!item || item.visible === false) {
            sel.classList.remove('visible');
            this.el.empty.classList.toggle('visible', !(this.manager.items || []).length);
            this.updateStatus();
            return;
        }
        const b = this.getItemBounds(item);
        if (!b) return;
        sel.style.left = `${b.x}px`;
        sel.style.top = `${b.y}px`;
        sel.style.width = `${Math.max(1, b.w)}px`;
        sel.style.height = `${Math.max(1, b.h)}px`;
        sel.style.transformOrigin =
            `${Math.max(0, Math.min(1, b.anchorX ?? 0.5)) * 100}% ` +
            `${Math.max(0, Math.min(1, b.anchorY ?? 0.5)) * 100}%`;
        sel.style.transform =
            `rotate(${Number(b.rotation || 0)}deg) ` +
            `scale(${Number(b.scaleX ?? 1)}, ${Number(b.scaleY ?? 1)})`;
        sel.classList.add('visible');
        sel.classList.toggle('is-text', item.type === 'text');
        const anchor = sel.querySelector('.vpc-anchor-handle');
        if (anchor) {
            anchor.style.left = `${Math.max(0, Math.min(1, b.anchorX ?? 0.5)) * 100}%`;
            anchor.style.top = `${Math.max(0, Math.min(1, b.anchorY ?? 0.5)) * 100}%`;
        }
        const label = sel.querySelector('[data-vpc-selection-label]');
        if (label) label.textContent = item.name || item.text || item.type || 'Layer';
        this.el.empty.classList.toggle('visible', !(this.manager.items || []).length);
        this.updateStatus();
    }
    updateStatus() {
        if (!this.el) return;
        const selection = this.el.status.querySelector('[data-vpc-status-selection]');
        const zoom = this.el.status.querySelector('[data-vpc-status-zoom]');
        const time = this.el.status.querySelector('[data-vpc-status-time]');
        const item = this.manager.selectedItem;
        if (selection) selection.textContent = item ? `${item.name || item.type} · ${item.mediaType || item.type}` : 'No layer selected';
        if (zoom) zoom.textContent = `${this.fitMode ? 'Fit' : 'Zoom'} · ${Math.round(this.zoom * 100)}%${this.forcePanMode ? ' · Pan' : ''}`;
        const seq = window.sequencerManager;
        if (time) time.textContent = window.SequencerMath?.timecode ? window.SequencerMath.timecode(seq?.state?.playhead || 0, seq?.state?.fps || this.manager.tl.fps || 30) : '00:00:00:00';
    }
    drawItem(item) {
        if (!item || !this.manager?.drawItem) return;
        return this.manager.drawItem(item);
    }
    theme(name, fallback) {
        const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
        return value || fallback;
    }
}
window.SMVideoCanvasController = SMVideoCanvasController;


class SMVideoEditingManager {
    constructor() {
        this.active = false;
        this.items = [];
        this.selectedItem = null;
        this.currentTime = 0;
        this.resolution = { w: 1280, h: 720 };
        this.tl = { fps: 30 };
        this.canvas = document.getElementById('video-editing-canvas');
        this.container = document.getElementById('video-editing-container');
        this.ctx = this.canvas?.getContext?.('2d') || null;
        this.projectBackground = 'transparent'; // Transparent to show Blender checkerboard

        // Master audio gain used by the Video Editing audio panel.
        this.masterGain = 1;
        this._isSequencePlaying = false;

        this.canvasController = new SMVideoCanvasController(this);
        this.canvasController.init();
        this.ctx = this.canvasController.ctx || this.ctx;
        this.bind();
    }

    bind() {
        document.getElementById('toggle-video-editor-btn')?.addEventListener('click', (event) => {
            event.preventDefault();
            this.toggle();
        });
        document.getElementById('video-add-text')?.addEventListener('click', () => this.addText());
        document.getElementById('video-add-solid')?.addEventListener('click', () => this.addSolid());
        window.addEventListener('resize', () => this.scheduleLayoutRefresh({ canvas: true }));
        window.addEventListener('sm:layout-resized', () => this.scheduleLayoutRefresh({ canvas: true }));
    }

    ensureTimelinePanel() {
        let panel = document.getElementById('video-timeline-panel');
        if (panel) return panel;
        const timeline = document.getElementById('timelineBody');
        if (!timeline) return null;
        panel = document.createElement('div');
        panel.id = 'video-timeline-panel';
        panel.className = 'video-timeline-panel video-mode-element';
        panel.innerHTML = `
            <div class="video-timeline-workspace">
                <div class="video-timeline-main">
                    <div class="video-timeline-header">
                        <button class="video-tool-btn" id="video-import-media"><i class="fas fa-plus"></i> Import</button>
                        <button class="video-tool-btn" id="video-play-toggle"><i class="fas fa-play"></i></button>
                        <span class="video-toolbar-title">00:00:00:00</span>
                    </div>
                    <div class="video-track-area" id="video-track-area">
                        <div class="video-track-labels">
                            <div>V1</div><div>A1</div>
                        </div>
                        <div class="video-track-lanes" id="video-track-lanes"></div>
                    </div>
                </div>
                <div class="video-timeline-dock-resizer" style="display:none;"><div class="video-timeline-dock-resizer-grip"></div></div>
                <div class="video-timeline-dock" id="video-timeline-dock" style="display:none;">
                    <div class="video-timeline-dock-header">
                        <span id="video-tool-dock-title">Clip Tools</span>
                        <button class="video-tool-btn" id="video-tool-dock-close">Close</button>
                    </div>
                    <div class="video-timeline-dock-content" id="video-tool-panel-host"></div>
                </div>
            </div>`;
        timeline.appendChild(panel);
        panel.querySelector('#video-tool-dock-close')?.addEventListener('click', () => {
            panel.querySelector('#video-timeline-dock').style.display = 'none';
            panel.querySelector('.video-timeline-dock-resizer').style.display = 'none';
            window.dispatchEvent(new Event('videoToolDockClose'));
        });
        panel.querySelector('#video-import-media')?.addEventListener('click', () => this.addSolid());
        this.renderTimeline();
        return panel;
    }

    toggle(force = null) {
        const next = force === null ? !this.active : !!force;
        return next ? this.enter() : this.exit();
    }

    enter() {
        this.active = true;
        document.body.classList.add('video-editing-mode');
        document.getElementById('toggle-video-editor-btn')?.classList.add('active');
        if (this.container) this.container.style.display = 'block';
        document.getElementById('video-editor-toolbar')?.style.setProperty('display', 'flex', 'important');
        window.hierarchyManager?.setVideoMode?.(true, this);
        const seq = window.ensureSequencerManager(this);
        if (!seq.inspector) {
            window.ensureVideoClipInspector(seq);
            seq.setInspector(window.videoClipInspector);
        }
        seq.mount(document.getElementById('editor-scene'));
        this.resizeCanvas();
        requestAnimationFrame(() => this.canvasController?.fitToView?.(false));
        this.bindTimelineResizer();
        this._syncHierarchy();
        this.renderCompositeAt(seq.state.playhead);
        window.sceneSplitViewManager?.refresh?.();
        window.dispatchEvent(new CustomEvent('sm:video-mode', { detail: { active: true } }));
    }

    exit() {
        this.active = false;
        document.body.classList.remove('video-editing-mode');
        document.getElementById('toggle-video-editor-btn')?.classList.remove('active');
        if (this.container) this.container.style.display = 'none';
        document.getElementById('video-editor-toolbar')?.style.setProperty('display', 'none');

        // Never allow media audio to continue after leaving Video Editing.
        this._pauseAllMedia();

        window.sequencerManager?.unmount?.();
        window.hierarchyManager?.setVideoMode?.(false);
        window.dispatchEvent(new CustomEvent('sm:video-mode', { detail: { active: false } }));
    }

    resizeCanvas() {
        if (!this.canvas || !this.container) return;
        this.canvasController?.resize?.();
        this.ctx = this.canvasController?.ctx || this.canvas.getContext('2d');
        this.renderCompositeAt(window.sequencerManager?.state?.playhead ?? this.currentTime ?? 0);
    }

    scheduleLayoutRefresh() {
        cancelAnimationFrame(this._layoutRaf);
        this._layoutRaf = requestAnimationFrame(() => {
            this.resizeCanvas();
            this.renderTimeline();
        });
    }

    renderCanvas() {
        if (!this.ctx || !this.canvas) return;
        const width = this.resolution.w;
        const height = this.resolution.h;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        
        // Transparent clear so the Blender dark checkerboard shows behind layers
        this.ctx.clearRect(0, 0, width, height);

        this.items.forEach(item => this.canvasController.drawItem(item));
        this.canvasController?.refreshOverlay?.();
        this.canvasController?.updateStatus?.();
    }

    drawItem(item) {
        if (!this.ctx || !this.canvas || !item || item.visible === false) return;

        const width = this.resolution.w;
        const height = this.resolution.h;
        const opacity = Math.max(0, Math.min(1, item.opacity ?? 1));

        const scaleX = Number.isFinite(Number(item.scaleX))
            ? Number(item.scaleX)
            : 1;
        const scaleY = Number.isFinite(Number(item.scaleY))
            ? Number(item.scaleY)
            : 1;
        const rotation =
            Number(item.rotation || 0) * Math.PI / 180;

        const anchorX = Math.max(
            0,
            Math.min(1, Number(item.anchorX ?? 0.5))
        );
        const anchorY = Math.max(
            0,
            Math.min(1, Number(item.anchorY ?? 0.5))
        );

        let pivotX = width * 0.5;
        let pivotY = height * 0.5;

        if (item.type === 'text') {
            pivotX = item.x ?? width * 0.5;
            pivotY = item.y ?? height * 0.5;
        } else {
            const x = item.x ?? (
                item.type === 'media' ? 0 : width * 0.2
            );
            const y = item.y ?? (
                item.type === 'media' ? 0 : height * 0.24
            );
            const w = item.w ?? (
                item.type === 'media' ? width : width * 0.6
            );
            const h = item.h ?? (
                item.type === 'media' ? height : height * 0.48
            );

            pivotX = x + w * anchorX;
            pivotY = y + h * anchorY;
        }

        this.ctx.save();

        this.ctx.globalAlpha *= opacity;
        this.ctx.globalCompositeOperation =
            item.blendMode || 'source-over';

        this.ctx.translate(pivotX, pivotY);

        if (rotation) {
            this.ctx.rotate(rotation);
        }

        if (scaleX !== 1 || scaleY !== 1) {
            this.ctx.scale(scaleX, scaleY);
        }

        this.ctx.translate(-pivotX, -pivotY);

        if (item.type === 'text') {
            const x = item.x ?? (width / 2);
            const y = item.y ?? (height / 2);
            const size = Math.max(1, item.fontSize || 42);

            this.ctx.fillStyle = item.color || '#ffffff';
            this.ctx.font =
                `${item.fontWeight || 700} ${size}px ` +
                `${item.fontFamily || 'Segoe UI'}`;
            this.ctx.textAlign = item.textAlign || 'center';
            this.ctx.textBaseline = 'middle';

            this.ctx.fillText(
                item.text || 'Title',
                x,
                y
            );
        } else if (item.type === 'media') {
            this._drawMediaItem(item);
        } else {
            const x = item.x ?? (width * 0.2);
            const y = item.y ?? (height * 0.24);
            const w = item.w ?? (width * 0.6);
            const h = item.h ?? (height * 0.48);

            this.ctx.fillStyle =
                item.color || '#4778ff';

            this.ctx.fillRect(
                x,
                y,
                w,
                h
            );
        }

        this.ctx.restore();
    }

    _drawMediaItem(item) {
        const width = this.resolution.w;
        const height = this.resolution.h;
        const x = item.x ?? 0;
        const y = item.y ?? 0;
        const w = item.w ?? width;
        const h = item.h ?? height;

        if (item.mediaType === 'image') {
            if (!item._img) {
                item._img = new Image();
                if (!/^(blob:|data:)/i.test(item.src || '')) item._img.crossOrigin = 'anonymous';
                item._img.onload = () => {
                    item.mediaWidth = item._img.naturalWidth;
                    item.mediaHeight = item._img.naturalHeight;
                    this.renderCompositeAt(window.sequencerManager?.state?.playhead ?? this.currentTime ?? 0);
                };
                item._img.onerror = () => {
                    item._mediaError = 'Image decode failed';
                    console.warn('[VideoEditing] Image failed to decode:', item.name, item.src);
                    this.renderCompositeAt(window.sequencerManager?.state?.playhead ?? this.currentTime ?? 0);
                };
                item._img.src = item.src;
            }
            if (item._img.complete && item._img.naturalWidth) {
                this._drawMediaContain(item._img, item._img.naturalWidth, item._img.naturalHeight, x, y, w, h);
            } else {
                this._drawMediaPlaceholder(x, y, w, h, item._mediaError ? 'image-error' : 'image');
            }
        } else if (item.mediaType === 'video') {
            const video = this._ensureVideoElement(item);
            if (!video) {
                this._drawMediaPlaceholder(x, y, w, h, 'video-error');
                return;
            }

            const targetTime = Number.isFinite(item._videoTargetTime)
                ? item._videoTargetTime
                : 0;
            const playbackRate = Number.isFinite(item._videoPlaybackRate)
                ? item._videoPlaybackRate
                : 1;
            const sequencePlaying = !!window.sequencerManager?.state?.playing;

            if (sequencePlaying) {
                this._syncVideoPlayback(item, targetTime, playbackRate);
            } else {
                this._syncVideoFrame(item, targetTime);
            }

            if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0 && !item._mediaError) {
                try {
                    this._drawMediaContain(video, video.videoWidth, video.videoHeight, x, y, w, h);
                    item._videoHasDrawableFrame = true;
                } catch (error) {
                    console.warn('[VideoEditing] drawImage(video) failed:', error);
                    this._drawMediaPlaceholder(x, y, w, h, 'video');
                }
            } else if (!item._videoHasDrawableFrame) {
                this._drawMediaPlaceholder(x, y, w, h, item._mediaError ? 'video-error' : 'video');
            }
        } else if (item.mediaType === 'audio') {
            const audio = this._ensureAudioElement(item);

            if (audio) {
                const targetTime =
                    Number.isFinite(item._audioTargetTime)
                        ? item._audioTargetTime
                        : 0;

                const playbackRate =
                    Number.isFinite(item._audioPlaybackRate)
                        ? item._audioPlaybackRate
                        : 1;

                const sequencePlaying =
                    !!window.sequencerManager
                        ?.state?.playing;

                if (sequencePlaying) {
                    this._syncAudioPlayback(
                        item,
                        targetTime,
                        playbackRate
                    );
                } else {
                    this._syncAudioFrame(
                        item,
                        targetTime
                    );
                }
            }

            this._drawAudioPlaceholder(
                item,
                x,
                y,
                w,
                h
            );
        } else {
            this._drawAudioPlaceholder(item, x, y, w, h);
        }
    }

    _ensureVideoElement(item) {
        if (!item?.src) return null;
        if (item._video) return item._video;

        const video = document.createElement('video');
        item._video = video;
        item._mediaError = null;
        item._videoMetadataReady = false;
        item._videoFrameReady = false;
        item._videoPendingTime = null;
        item._videoPlayPending = false;
        item._videoHasDrawableFrame = false;
        item._videoPlaybackRate = 1;

        // IMPORTANT:
        // The old code forced every imported MP4 to muted + volume 0,
        // which is why the editor could never output its audio track.
        video.muted = false;
        video.defaultMuted = false;
        video.volume = 1;
        video.playsInline = true;
        video.autoplay = false;
        video.loop = false;
        video.preload = 'auto';
        video.disablePictureInPicture = true;
        video.setAttribute('playsinline', '');
        video.setAttribute('webkit-playsinline', '');

        if (!/^(blob:|data:)/i.test(item.src || '')) {
            video.crossOrigin = 'anonymous';
        }

        const rerender = () => {
            if (!this.active) return;
            const time = window.sequencerManager?.state?.playhead ?? this.currentTime ?? 0;
            requestAnimationFrame(() => this.renderCompositeAt(time));
        };

        video.addEventListener('loadedmetadata', () => {
            item._videoMetadataReady = true;
            item.mediaWidth = video.videoWidth || item.mediaWidth || 0;
            item.mediaHeight = video.videoHeight || item.mediaHeight || 0;
            if (Number.isFinite(video.duration) && video.duration > 0) {
                item.duration = video.duration;
                item.sourceDuration = video.duration;
            }

            const wanted = Number.isFinite(item._videoTargetTime) ? item._videoTargetTime : 0;
            const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
            const firstFrameTime = duration > 0
                ? Math.min(Math.max(wanted, 0.001), Math.max(0.001, duration - 0.001))
                : Math.max(0.001, wanted);
            try {
                video.currentTime = firstFrameTime;
            } catch (_) {}
            rerender();
        });

        const onFrameReady = () => {
            item._videoFrameReady = true;
            item._videoHasDrawableFrame = true;
            item._mediaError = null;
            item.mediaWidth = video.videoWidth || item.mediaWidth || 0;
            item.mediaHeight = video.videoHeight || item.mediaHeight || 0;
            rerender();
        };
        video.addEventListener('loadeddata', onFrameReady);
        video.addEventListener('canplay', onFrameReady);
        video.addEventListener('seeked', () => {
            item._videoFrameReady = true;
            if (Number.isFinite(item._videoPendingTime)) {
                const next = item._videoPendingTime;
                item._videoPendingTime = null;
                this._syncVideoFrame(item, next, true);
            }
            rerender();
        });

        video.addEventListener('error', () => {
            const err = video.error;
            const code = err?.code || 0;
            const reasons = {
                1: 'MEDIA_ERR_ABORTED',
                2: 'MEDIA_ERR_NETWORK',
                3: 'MEDIA_ERR_DECODE',
                4: 'MEDIA_ERR_SRC_NOT_SUPPORTED'
            };
            item._mediaError = reasons[code] || 'VIDEO_DECODE_ERROR';
            console.error('[VideoEditing] Video cannot be decoded:', {
                name: item.name,
                mimeType: item.mimeType || '',
                code,
                error: item._mediaError,
                src: item.src
            });
            rerender();
        });

        try {
            video.src = item.src;
            video.load();
        } catch (error) {
            item._mediaError = 'VIDEO_LOAD_ERROR';
            console.error('[VideoEditing] Failed to initialize video:', item.name, error);
        }
        return video;
    }

    _syncVideoFrame(item, targetTime, force = false) {
        const video = item?._video;
        if (!video || video.readyState < HTMLMediaElement.HAVE_METADATA || item._mediaError) return;

        this._applyMediaVolume(video, item);

        if (!video.paused) {
            try { video.pause(); } catch (_) {}
        }
        item._videoPlayPending = false;

        const duration = Number.isFinite(video.duration) && video.duration > 0
            ? video.duration
            : Number(item.sourceDuration || item.duration || 0);
        let target = Math.max(0, Number(targetTime) || 0);

        if (duration > 0) {
            target = Math.min(target, Math.max(0, duration - 0.001));
            if (
                target === 0 &&
                video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
            ) {
                target = Math.min(0.001, duration * 0.5);
            }
        }

        const fps = Math.max(
            1,
            Number(window.sequencerManager?.state?.fps || this.tl?.fps || 30)
        );
        const tolerance = Math.max(0.006, 0.45 / fps);

        if (
            !force &&
            Math.abs((video.currentTime || 0) - target) <= tolerance &&
            video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
        ) {
            return;
        }

        if (video.seeking) {
            item._videoPendingTime = target;
            return;
        }

        try {
            video.currentTime = target;
        } catch (error) {
            console.warn('[VideoEditing] Video seek failed:', item.name, target, error);
        }
    }

    _syncVideoPlayback(item, targetTime, clipPlaybackRate = 1) {
        const video = item?._video;
        if (
            !video ||
            video.readyState < HTMLMediaElement.HAVE_METADATA ||
            item._mediaError
        ) {
            return;
        }

        this._applyMediaVolume(video, item);

        const duration = Number.isFinite(video.duration) && video.duration > 0
            ? video.duration
            : Number(item.sourceDuration || item.duration || 0);

        let target = Math.max(0, Number(targetTime) || 0);
        if (duration > 0) {
            target = Math.min(target, Math.max(0, duration - 0.001));
        }

        const sequenceRate = Math.max(
            0.01,
            Number(window.sequencerManager?.state?.playbackRate || 1)
        );
        const wantedRate = Math.max(
            0.0625,
            Math.min(16, Number(clipPlaybackRate || 1) * sequenceRate)
        );

        if (Math.abs((video.playbackRate || 1) - wantedRate) > 0.001) {
            try { video.playbackRate = wantedRate; } catch (_) {}
        }

        const current = Number(video.currentTime || 0);
        const drift = Math.abs(current - target);

        if (video.paused) {
            if (!video.seeking && drift > 0.05) {
                try { video.currentTime = target; } catch (_) {}
            }

            if (!item._videoPlayPending) {
                item._videoPlayPending = true;
                try {
                    const promise = video.play();
                    if (promise && typeof promise.then === 'function') {
                        promise
                            .catch(error => {
                                if (error?.name !== 'AbortError') {
                                    console.warn('[VideoEditing] video.play() failed:', item.name, error);
                                }
                            })
                            .finally(() => {
                                item._videoPlayPending = false;
                            });
                    } else {
                        item._videoPlayPending = false;
                    }
                } catch (error) {
                    item._videoPlayPending = false;
                    if (error?.name !== 'AbortError') {
                        console.warn('[VideoEditing] video.play() failed:', item.name, error);
                    }
                }
            }
            return;
        }

        if (!video.seeking && drift > 0.18) {
            try {
                video.currentTime = target;
            } catch (error) {
                console.warn('[VideoEditing] Playback drift correction failed:', item.name, target, error);
            }
        }
    }

    _ensureAudioElement(item) {
        if (!item?.src) return null;
        if (item._audio) return item._audio;

        const audio = document.createElement('audio');

        item._audio = audio;
        item._audioMetadataReady = false;
        item._audioPendingTime = null;
        item._audioPlayPending = false;
        item._audioError = null;

        audio.preload = 'auto';
        audio.autoplay = false;
        audio.loop = false;
        audio.muted = false;
        audio.defaultMuted = false;
        audio.volume = 1;

        if (!/^(blob:|data:)/i.test(item.src || '')) {
            audio.crossOrigin = 'anonymous';
        }

        const rerender = () => {
            if (!this.active) return;

            const time =
                window.sequencerManager?.state?.playhead ??
                this.currentTime ??
                0;

            requestAnimationFrame(() => {
                if (this.active) {
                    this.renderCompositeAt(time);
                }
            });
        };

        audio.addEventListener('loadedmetadata', () => {
            item._audioMetadataReady = true;

            if (
                Number.isFinite(audio.duration) &&
                audio.duration > 0
            ) {
                item.duration = audio.duration;
                item.sourceDuration = audio.duration;
            }

            const wanted =
                Number.isFinite(item._audioTargetTime)
                    ? item._audioTargetTime
                    : 0;

            try {
                audio.currentTime = Math.max(
                    0,
                    Math.min(
                        wanted,
                        Math.max(
                            0,
                            (audio.duration || wanted) - 0.001
                        )
                    )
                );
            } catch (_) {}

            rerender();
        });

        audio.addEventListener('canplay', () => {
            item._audioError = null;
            rerender();
        });

        audio.addEventListener('seeked', () => {
            if (Number.isFinite(item._audioPendingTime)) {
                const pending = item._audioPendingTime;
                item._audioPendingTime = null;

                this._syncAudioFrame(
                    item,
                    pending,
                    true
                );
            }

            rerender();
        });

        audio.addEventListener('error', () => {
            const err = audio.error;
            const code = err?.code || 0;

            const reasons = {
                1: 'MEDIA_ERR_ABORTED',
                2: 'MEDIA_ERR_NETWORK',
                3: 'MEDIA_ERR_DECODE',
                4: 'MEDIA_ERR_SRC_NOT_SUPPORTED'
            };

            item._audioError =
                reasons[code] ||
                'AUDIO_DECODE_ERROR';

            console.error(
                '[VideoEditing] Audio cannot be decoded:',
                {
                    name: item.name,
                    mimeType: item.mimeType || '',
                    code,
                    error: item._audioError,
                    src: item.src
                }
            );
        });

        try {
            audio.src = item.src;
            audio.load();
        } catch (error) {
            item._audioError =
                'AUDIO_LOAD_ERROR';

            console.error(
                '[VideoEditing] Failed to initialize audio:',
                item.name,
                error
            );
        }

        return audio;
    }

    _applyMediaVolume(media, item) {
        if (!media || !item) return;

        const master =
            Math.max(
                0,
                Number(this.masterGain ?? 1)
            );

        const clipGain =
            Math.max(
                0,
                Number(
                    item._runtimeVolume ??
                    item.volume ??
                    1
                )
            );

        const gain =
            Math.max(
                0,
                Math.min(
                    1,
                    master * clipGain
                )
            );

        const muted =
            !!item._runtimeMuted ||
            gain <= 0.0001;

        try {
            media.defaultMuted = false;
            media.muted = muted;
            media.volume = muted ? 0 : gain;
        } catch (_) {}
    }

    _syncAudioFrame(
        item,
        targetTime,
        force = false
    ) {
        const audio =
            item?._audio;

        if (
            !audio ||
            audio.readyState <
                HTMLMediaElement.HAVE_METADATA ||
            item._audioError
        ) {
            return;
        }

        this._applyMediaVolume(
            audio,
            item
        );

        if (!audio.paused) {
            try {
                audio.pause();
            } catch (_) {}
        }

        item._audioPlayPending = false;

        const duration =
            Number.isFinite(audio.duration) &&
            audio.duration > 0
                ? audio.duration
                : Number(
                    item.sourceDuration ||
                    item.duration ||
                    0
                );

        let target =
            Math.max(
                0,
                Number(targetTime) || 0
            );

        if (duration > 0) {
            target = Math.min(
                target,
                Math.max(
                    0,
                    duration - 0.001
                )
            );
        }

        const fps =
            Math.max(
                1,
                Number(
                    window.sequencerManager
                        ?.state?.fps ||
                    this.tl?.fps ||
                    30
                )
            );

        const tolerance =
            Math.max(
                0.006,
                0.45 / fps
            );

        if (
            !force &&
            Math.abs(
                (audio.currentTime || 0) -
                target
            ) <= tolerance
        ) {
            return;
        }

        if (audio.seeking) {
            item._audioPendingTime =
                target;

            return;
        }

        try {
            audio.currentTime = target;
        } catch (error) {
            console.warn(
                '[VideoEditing] Audio seek failed:',
                item.name,
                target,
                error
            );
        }
    }

    _syncAudioPlayback(
        item,
        targetTime,
        clipPlaybackRate = 1
    ) {
        const audio =
            item?._audio;

        if (
            !audio ||
            audio.readyState <
                HTMLMediaElement.HAVE_METADATA ||
            item._audioError
        ) {
            return;
        }

        this._applyMediaVolume(
            audio,
            item
        );

        const duration =
            Number.isFinite(audio.duration) &&
            audio.duration > 0
                ? audio.duration
                : Number(
                    item.sourceDuration ||
                    item.duration ||
                    0
                );

        let target =
            Math.max(
                0,
                Number(targetTime) || 0
            );

        if (duration > 0) {
            target = Math.min(
                target,
                Math.max(
                    0,
                    duration - 0.001
                )
            );
        }

        const sequenceRate =
            Math.max(
                0.01,
                Number(
                    window.sequencerManager
                        ?.state?.playbackRate ||
                    1
                )
            );

        const wantedRate =
            Math.max(
                0.0625,
                Math.min(
                    16,
                    Number(
                        clipPlaybackRate || 1
                    ) * sequenceRate
                )
            );

        if (
            Math.abs(
                (audio.playbackRate || 1) -
                wantedRate
            ) > 0.001
        ) {
            try {
                audio.playbackRate =
                    wantedRate;
            } catch (_) {}
        }

        const current =
            Number(
                audio.currentTime || 0
            );

        const drift =
            Math.abs(
                current - target
            );

        if (audio.paused) {
            if (
                !audio.seeking &&
                drift > 0.05
            ) {
                try {
                    audio.currentTime =
                        target;
                } catch (_) {}
            }

            if (!item._audioPlayPending) {
                item._audioPlayPending =
                    true;

                try {
                    const promise =
                        audio.play();

                    if (
                        promise &&
                        typeof promise.then ===
                            'function'
                    ) {
                        promise
                            .catch(error => {
                                if (
                                    error?.name !==
                                    'AbortError'
                                ) {
                                    console.warn(
                                        '[VideoEditing] audio.play() failed:',
                                        item.name,
                                        error
                                    );
                                }
                            })
                            .finally(() => {
                                item._audioPlayPending =
                                    false;
                            });
                    } else {
                        item._audioPlayPending =
                            false;
                    }
                } catch (error) {
                    item._audioPlayPending =
                        false;

                    if (
                        error?.name !==
                        'AbortError'
                    ) {
                        console.warn(
                            '[VideoEditing] audio.play() failed:',
                            item.name,
                            error
                        );
                    }
                }
            }

            return;
        }

        // Do not continuously seek audio.
        // Correct only meaningful A/V drift.
        if (
            !audio.seeking &&
            drift > 0.18
        ) {
            try {
                audio.currentTime =
                    target;
            } catch (error) {
                console.warn(
                    '[VideoEditing] Audio drift correction failed:',
                    item.name,
                    target,
                    error
                );
            }
        }
    }

    _pauseAllMedia() {
        this.items.forEach(item => {
            const media =
                item?._video ||
                item?._audio;

            if (!media) return;

            try {
                media.pause();
            } catch (_) {}

            item._videoPlayPending =
                false;

            item._audioPlayPending =
                false;
        });
    }

    _isClipAudible(
        clip,
        state
    ) {
        if (!clip || !state) {
            return true;
        }

        if (clip.muted === true) {
            return false;
        }

        const track =
            state.getTrack?.(
                clip.trackId
            ) ||
            state.tracks?.find?.(
                t => t.id === clip.trackId
            ) ||
            null;

        if (track?.muted === true) {
            return false;
        }

        const anySolo =
            !!state.tracks?.some?.(
                t => t.solo === true
            );

        if (
            anySolo &&
            track?.solo !== true
        ) {
            return false;
        }

        return true;
    }

    setPlaybackState(isPlaying) {
        const playing = !!isPlaying;
        this._isSequencePlaying = playing;

        if (!playing) {
            this._pauseAllMedia();
        }

        const t = window.sequencerManager?.state?.playhead ?? this.currentTime ?? 0;
        requestAnimationFrame(() => {
            if (this.active) this.renderCompositeAt(t);
        });
    }

    _drawMediaContain(source, sw, sh, x, y, w, h) {
        if (!sw || !sh || !w || !h) return;
        const scale = Math.min(w / sw, h / sh);
        const dw = sw * scale;
        const dh = sh * scale;
        const dx = x + (w - dw) / 2;
        const dy = y + (h - dh) / 2;
        this.ctx.drawImage(source, dx, dy, dw, dh);
    }

    _drawMediaPlaceholder(x, y, w, h, kind) {
        if (!this.ctx) return;
        this.ctx.fillStyle = this.canvasController?.theme?.('--video-bg-2', '#282828') || '#282828';
        this.ctx.fillRect(x, y, w, h);
        this.ctx.strokeStyle = this.canvasController?.theme?.('--video-border-strong', 'rgba(255,255,255,0.18)') || 'rgba(255,255,255,0.18)';
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
        this.ctx.fillStyle = this.canvasController?.theme?.('--video-text-muted', '#b0b0b0') || '#b0b0b0';
        this.ctx.font = '700 20px Segoe UI';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        const label = kind === 'video-error' ? 'VIDEO FORMAT / CODEC ERROR' : kind === 'image-error' ? 'IMAGE ERROR' : kind === 'video' ? 'VIDEO · DECODING…' : 'IMAGE';
        this.ctx.fillText(label, x + w / 2, y + h / 2);
    }

    _drawAudioPlaceholder(item, x, y, w, h) {
        if (!this.ctx) return;
        this.ctx.fillStyle = this.canvasController?.theme?.('--video-bg-1', '#282828') || '#282828';
        this.ctx.fillRect(x, y, w, h);
        this.ctx.fillStyle = item.color || '#7c8cf5';
        const bars = 48;
        const gap = w / bars;
        for (let i = 0; i < bars; i++) {
            const peak = 0.25 + 0.75 * Math.abs(Math.sin(i * 0.7 + (item.id?.length || 1)));
            const bh = Math.max(4, h * 0.9 * peak);
            this.ctx.fillRect(x + i * gap, y + (h - bh) / 2, Math.max(1, gap - 2), bh);
        }
    }

    renderTimeline() {
        const lanes = document.getElementById('video-track-lanes');
        if (!lanes) return;
        lanes.innerHTML = '';
        const track = document.createElement('div');
        track.className = 'video-track-row';
        this.items.forEach((item, index) => {
            const clip = document.createElement('button');
            clip.className = 'video-clip-item';
            clip.style.left = `${12 + index * 120}px`;
            clip.style.width = '108px';
            if (this.selectedItem === item) {
                clip.style.border = '2px solid #4a9eff';
                clip.style.background = '#2a3b5c';
            }
            clip.textContent = item.name || item.type;
            clip.addEventListener('click', () => {
                this.selectItem(item);
            });
            track.appendChild(clip);
        });
        lanes.appendChild(track);
    }

    selectItem(item) {
        if (!item) return;
        this.selectedItem = item;
        this.renderTimeline();
        this.renderCanvas();
        this.openTimelineToolDock('clip');
        window.sequencerManager?.selectItem?.(item.id);
        window.hierarchyManager?.updateVideoSelection?.(item);
        this.canvasController?.refreshOverlay?.();
        this.canvasController?.updateStatus?.();
    }

    deleteItem(item) {
        const idx = this.items.indexOf(item);
        if (idx === -1) return;

        // Stop any native media element before removing the clip.
        [item?._video, item?._audio].forEach(media => {
            if (!media) return;

            try {
                media.pause();
                media.removeAttribute('src');
                media.load?.();
            } catch (_) {}
        });

        this.items.splice(idx, 1);
        if (this.selectedItem === item) {
            this.selectedItem = this.items[idx] || this.items[idx - 1] || null;
        }
        this.renderCanvas();
        this.renderTimeline();
        if (this.selectedItem) this.openTimelineToolDock('clip');
        window.sequencerManager?.removeClipsByItem?.(item.id);
        this._syncHierarchy();
        this.canvasController?.refreshOverlay?.();
    }

    renameItem(item, name) {
        if (!item) return;
        const clean = String(name || '').trim();
        if (!clean) return;
        item.name = clean;
        this.renderTimeline();
        this.renderCanvas();
        window.sequencerManager?.renameClipsForItem?.(item.id, clean);
        this._syncHierarchy();
    }

    _syncHierarchy() {
        if (!this.active) return;

        if (window.hierarchyManager?.renderAll) {
            window.hierarchyManager.renderAll();
        }

        const container = document.getElementById('media-pool-grid') || document.getElementById('hierarchy-content');
        if (!container) return;

        if (!this.items.length) {
            container.innerHTML = '<div data-media-empty="true" style="color:#8a93a1; padding:12px; font-size:11px; text-align:center;">No video canvas items</div>';
            return;
        }

        container.innerHTML = this.items.map(item => `
            <div class="hm-row-video ${this.selectedItem === item ? 'hm-selected' : ''}" 
                 onclick="window.videoEditingManager.selectItem(window.videoEditingManager.items.find(i => i.id === '${item.id}'))"
                 style="display:flex; align-items:center; justify-content:space-between; padding:6px 10px; border-bottom:1px solid #282d38; cursor:pointer; font-size:11px; color:#e0e6f0;">
                <span style="display:flex; align-items:center; gap:8px;">
                    <i class="fas ${item.type === 'text' ? 'fa-font' : (item.type === 'media' ? 'fa-file-video' : 'fa-square')}" style="color:#4a9eff;"></i>
                    <strong>${item.name || item.type}</strong>
                </span>
                <button class="hm-video-delete" onclick="event.stopPropagation(); window.videoEditingManager.deleteItem(window.videoEditingManager.items.find(i => i.id === '${item.id}'))"
                        style="background:none; border:none; color:#ff4d4d; cursor:pointer; font-size:10px;">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `).join('');
    }

    addText() {
        const seq = window.ensureSequencerManager(this);
        const clip = seq.addTextClip();
        const item = clip.mediaRef ? this.items.find(i => i.id === clip.mediaRef) : null;
        if (item) this.selectItem(item);
        this._syncHierarchy();
    }

    addSolid() {
        const seq = window.ensureSequencerManager(this);
        const clip = seq.addSolidClip();
        const item = clip.mediaRef ? this.items.find(i => i.id === clip.mediaRef) : null;
        if (item) this.selectItem(item);
        this._syncHierarchy();
    }

    addMedia(entry) {
        if (!entry || !entry.src) return null;

        const item = {
            id: `clip-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            sourceMediaId: entry.id || null,
            type: 'media',
            mediaType: entry.mediaType || 'image',
            name: entry.name || 'Media',
            src: entry.src,
            mimeType: entry.mimeType || entry.file?.type || '',
            color: entry.color || '#4778ff',
            visible: true,
            opacity: entry.opacity ?? 1,
            volume: Number.isFinite(Number(entry.volume))
                ? Number(entry.volume)
                : 1,
            duration: Number(entry.duration || 0),
            sourceDuration: Number(entry.duration || entry.sourceDuration || 0),
            mediaWidth: Number(entry.mediaWidth || 0),
            mediaHeight: Number(entry.mediaHeight || 0),
            thumb: entry.thumb || null,
            thumbnails: Array.isArray(entry.thumbnails) ? entry.thumbnails.slice() : [],
            audioPeaks: entry.audioPeaks || null
        };

        this.items.push(item);

        const seq = window.ensureSequencerManager(this);
        if (this.active && !seq.mounted) {
            const host = document.getElementById('editor-scene');
            if (host) seq.mount(host);
        }

        let clip = null;
        if (seq.mounted) {
            clip = seq.addMediaClip(item, {});
            seq.selectItem?.(item.id);
        }

        this.selectedItem = item;
        this._syncHierarchy();

        if (this.active) {
            this.renderCompositeAt(seq?.state?.playhead ?? this.currentTime ?? 0);
        } else {
            this.renderCanvas();
        }

        this.openTimelineToolDock?.('clip');
        window.hierarchyManager?.updateVideoSelection?.(item);
        this.canvasController?.refreshOverlay?.();
        this.canvasController?.updateStatus?.();

        return { item, clip };
    }

    renderCompositeAt(time) {
        if (!this.active || !this.ctx || !this.canvas) return;
        this.currentTime = Math.max(0, Number(time) || 0);
        const seq = window.sequencerManager;
        if (!seq || !seq.mounted) {
            this.renderCanvas();
            return;
        }
        const s = seq.state;
        const width = this.resolution.w;
        const height = this.resolution.h;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        
        // Transparent clear so the Blender dark checkerboard stage shows behind layers
        this.ctx.clearRect(0, 0, width, height);

        const active = s.clips
            .filter(c => c.visible !== false && time >= c.start && time < c.start + c.duration)
            .sort((a, b) => (s.getTrack(a.trackId)?.order ?? 99) - (s.getTrack(b.trackId)?.order ?? 99));
        const activeMediaRefs = new Set();
        active.forEach(clip => {
            const item = this.items.find(i => i.id === clip.mediaRef);
            if (!item) return;
            const evaluated = seq.evaluateClipAt?.(clip, time) || clip;

            const original = {
                opacity: item.opacity,
                x: item.x,
                y: item.y,
                w: item.w,
                h: item.h,
                scaleX: item.scaleX,
                scaleY: item.scaleY,
                rotation: item.rotation,
                anchorX: item.anchorX,
                anchorY: item.anchorY,
                blendMode: item.blendMode,
                videoTargetTime: item._videoTargetTime,
                videoPlaybackRate: item._videoPlaybackRate,
                audioTargetTime: item._audioTargetTime,
                audioPlaybackRate: item._audioPlaybackRate,
                runtimeVolume: item._runtimeVolume,
                runtimeMuted: item._runtimeMuted
            };

            item.opacity =
                (original.opacity ?? 1) *
                (evaluated.opacity ?? clip.opacity ?? 1);
            item.blendMode = clip.blendMode || original.blendMode || 'source-over';

            // Runtime audio state from Clip + Track + Solo + Master gain.
            // SequencerManager.evaluateClipAt() already evaluates Volume keyframes.
            const clipVolume =
                Math.max(
                    0,
                    Number(
                        evaluated.volume ??
                        clip.volume ??
                        1
                    )
                );

            item._runtimeVolume = clipVolume;
            item._runtimeMuted =
                !this._isClipAudible(
                    clip,
                    s
                );

            if (
                item.mediaType === 'video' ||
                item.mediaType === 'audio'
            ) {
                const localTime =
                    Math.max(
                        0,
                        time -
                        Number(clip.start || 0)
                    );

                const playbackRate =
                    Math.max(
                        0.001,
                        Number(
                            clip.playbackRate || 1
                        )
                    );

                const sourceTime =
                    Math.max(
                        0,
                        Number(
                            clip.sourceIn || 0
                        ) +
                        localTime *
                        playbackRate
                    );

                if (item.mediaType === 'video') {
                    item._videoTargetTime =
                        sourceTime;

                    item._videoPlaybackRate =
                        playbackRate;
                } else {
                    item._audioTargetTime =
                        sourceTime;

                    item._audioPlaybackRate =
                        playbackRate;
                }

                activeMediaRefs.add(
                    item.id
                );
            }
            if (evaluated.x != null) item.x = evaluated.x;
            if (evaluated.y != null) item.y = evaluated.y;
            if (evaluated.w != null) item.w = evaluated.w;
            if (evaluated.h != null) item.h = evaluated.h;

            item.scaleX =
                evaluated.scaleX ?? clip.scaleX ?? 1;
            item.scaleY =
                evaluated.scaleY ?? clip.scaleY ?? 1;
            item.rotation =
                evaluated.rotation ?? clip.rotation ?? 0;
            item.anchorX =
                evaluated.anchorX ?? clip.anchorX ?? 0.5;
            item.anchorY =
                evaluated.anchorY ?? clip.anchorY ?? 0.5;
            this.canvasController.drawItem(item);
            item.opacity = original.opacity;
            item.x = original.x;
            item.y = original.y;
            item.w = original.w;
            item.h = original.h;
            item.scaleX = original.scaleX;
            item.scaleY = original.scaleY;
            item.rotation = original.rotation;
            item.anchorX = original.anchorX;
            item.anchorY = original.anchorY;
            item.blendMode = original.blendMode;
            item._videoTargetTime = original.videoTargetTime;
            item._videoPlaybackRate = original.videoPlaybackRate;
            item._audioTargetTime = original.audioTargetTime;
            item._audioPlaybackRate = original.audioPlaybackRate;
            item._runtimeVolume = original.runtimeVolume;
            item._runtimeMuted = original.runtimeMuted;
        });

        // Stop media that is outside its active clip range or when paused.
        // This handles BOTH video-with-audio and standalone audio clips.
        this.items.forEach(item => {
            const media =
                item?._video ||
                item?._audio;

            if (!media) return;

            if (
                !s.playing ||
                !activeMediaRefs.has(item.id)
            ) {
                if (!media.paused) {
                    try {
                        media.pause();
                    } catch (_) {}
                }

                item._videoPlayPending =
                    false;

                item._audioPlayPending =
                    false;
            }
        });

        this.canvasController?.refreshOverlay?.();
        this.canvasController?.updateStatus?.();
    }

    syncFromSequencer() {
        const seq = window.sequencerManager;
        if (!seq) return;
        const s = seq.state;
        const refs = new Set();
        s.clips.forEach(c => {
            if (c.mediaRef) refs.add(c.mediaRef);
        });
        this.items = this.items.filter(it => refs.has(it.id));
        s.clips.forEach(c => {
            if (c.mediaType !== 'text' && c.mediaType !== 'solid') return;
            let item = this.items.find(i => i.id === c.mediaRef);
            if (!item) {
                item = {
                    id: `${c.mediaType}-${Date.now()}`,
                    type: c.mediaType,
                    mediaType: c.mediaType,
                    name: c.name,
                    text: c.mediaType === 'text' ? (c.text || 'SM Engine') : undefined,
                    color: c.mediaType === 'solid' ? (c.color || '#4778ff') : '#ffffff',
                    visible: c.visible !== false
                };
                c.mediaRef = item.id;
                this.items.push(item);
            } else {
                item.name = c.name;
                item.visible = c.visible !== false;
                if (c.mediaType === 'text') item.text = c.text;
                if (c.mediaType === 'solid') item.color = c.color;
            }
        });
        this._syncHierarchy();
    }

    setSequencerSelection(ids) {
        if (!this.active) return;
        const seq = window.sequencerManager;
        if (!seq) return;
        const primary = seq.state.primarySelection;
        const item = primary ? this.items.find(i => i.id === primary.mediaRef) : null;
        if (item && this.selectedItem !== item) {
            this.selectedItem = item;
            window.hierarchyManager?.updateVideoSelection?.(item);
        }
        this.canvasController?.refreshOverlay?.();
        this.canvasController?.updateStatus?.();
    }

    setMasterGain(value) {
        this.masterGain =
            Math.max(
                0,
                Number(value) || 0
            );

        // Apply immediately to already-created media elements.
        this.items.forEach(item => {
            const media =
                item?._video ||
                item?._audio;

            if (media) {
                this._applyMediaVolume(
                    media,
                    item
                );
            }
        });
    }

    setItemMuted(
        item,
        muted = true
    ) {
        if (!item) return;

        item._runtimeMuted =
            !!muted;

        const media =
            item._video ||
            item._audio;

        if (media) {
            this._applyMediaVolume(
                media,
                item
            );
        }
    }

    bindTimelineResizer() {
        const splitter = document.querySelector('#editor-scene > .sequencer-splitter');
        if (!splitter || splitter.dataset.bound === '1') return;
        splitter.dataset.bound = '1';

        let isResizing = false;
        let startY = 0;
        let startHeight = 260;

        splitter.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            isResizing = true;
            startY = e.clientY;
            const currentPx = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sequencer-live-height')) || 260;
            startHeight = currentPx;
            splitter.setPointerCapture?.(e.pointerId);
        });

        window.addEventListener('pointermove', (e) => {
            if (!isResizing) return;
            const deltaY = startY - e.clientY;
            const maxH = Math.floor(window.innerHeight * 0.65);
            const newH = Math.max(120, Math.min(maxH, startHeight + deltaY));
            document.documentElement.style.setProperty('--sequencer-live-height', `${newH}px`);
            window.dispatchEvent(new Event('resize'));
            window.dispatchEvent(new CustomEvent('sm:layout-resized'));
        });

        const stopResize = (e) => {
            if (isResizing) {
                isResizing = false;
                try { splitter.releasePointerCapture?.(e.pointerId); } catch (_) {}
                window.dispatchEvent(new Event('resize'));
            }
        };

        window.addEventListener('pointerup', stopResize);
        window.addEventListener('pointercancel', stopResize);
    }
    getVideoToolPanelHost() {
        return document.getElementById('video-tool-panel-host') || document.getElementById('video-inspector-content');
    }

    openTimelineToolDock(tab = 'clip') {
        const dock = document.getElementById('video-timeline-dock');
        const resizer = document.querySelector('.video-timeline-dock-resizer');
        const title = document.getElementById('video-tool-dock-title');
        if (dock) dock.style.display = 'flex';
        if (resizer) resizer.style.display = 'flex';
        if (title) title.textContent = `${tab[0].toUpperCase()}${tab.slice(1)} Tools`;
        window.dispatchEvent(new CustomEvent('videoToolPanelRequest', { detail: { tab } }));
    }
}

window.SMVideoCanvasController = SMVideoCanvasController;
window.SMVideoEditingManager = SMVideoEditingManager;

window.ensureVideoEditingManager = function ensureVideoEditingManager() {
    if (!window.videoEditingManager) window.videoEditingManager = new SMVideoEditingManager();
    return window.videoEditingManager;
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.ensureVideoEditingManager());
} else {
    window.ensureVideoEditingManager();
}