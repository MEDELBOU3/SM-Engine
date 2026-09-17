// ============================================================================
// engine\2d\sprites\SMSpriteSheetEditor.js
// SM Engine — Professional 2D Sprite Sheet Slicer & Animator  v3.1 — Embedded Asset Queue + Atlas Composition
// Advanced: Undo/Redo · Multi-Select · Hitbox Editor · Keyboard Shortcuts
//           Atlas PNG Export · JSON Import · 9-Slice · Per-Clip FPS
//           Frame Thumbnails · Pixel Ruler · Variable Frame Duration
// ============================================================================
(function (root) {
    'use strict';

    // -------------------------------------------------------------------------
    // Toast notification (no alert() calls)
    // -------------------------------------------------------------------------
    function showToast(msg, type = 'info', duration = 2800) {
        let container = document.getElementById('sm-sse-toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'sm-sse-toast-container';
            container.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:99999999;display:flex;flex-direction:column;gap:8px;pointer-events:none;';
            document.body.appendChild(container);
        }
        const colors = { info: '#0284c7', success: '#16a34a', warn: '#d97706', error: '#dc2626' };
        const icons = { info: 'fa-circle-info', success: 'fa-circle-check', warn: 'fa-triangle-exclamation', error: 'fa-circle-xmark' };
        const toast = document.createElement('div');
        toast.style.cssText = `background:#111622;border:1px solid ${colors[type]};border-radius:6px;padding:10px 16px;color:#e2e8f0;font-size:12px;font-family:-apple-system,sans-serif;display:flex;align-items:center;gap:10px;box-shadow:0 4px 20px rgba(0,0,0,.7);pointer-events:auto;transition:opacity 0.3s;`;
        toast.innerHTML = `<i class="fas ${icons[type]}" style="color:${colors[type]}"></i><span>${msg}</span>`;
        container.appendChild(toast);
        setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 320); }, duration);
    }

    // -------------------------------------------------------------------------
    class SMSpriteSheetEditor {
        constructor() {
            this.initialized = false;
            this.isOpen = false;

            // Image & Canvas State
            this.sourceImage = null;
            this.imageWidth = 0;
            this.imageHeight = 0;
            this.sourceFileName = 'spritesheet';
            this.sourceAssetId = null;
            this.sourceURL = null;
            this.sourceFile = null;
            this._ownedSourceURL = null;
            this.pendingSpriteSheetData = null;
            this.isDirty = false;

            // Embedded Assets Browser / image queue. The editor owns this queue
            // so it never has to depend on the AssetsPanel's thumbnail/runtime URL.
            this.assetQueue = [];
            this.assetQueueSelectedId = null;
            this.assetQueueFilter = '';
            this._assetQueueObjectURLs = new Set();

            // Sprite-sheet composition state. The queue is not the sheet itself:
            // queued assets become real layers placed onto an atlas canvas.
            this.sheetLayers = [];
            this._sheetCanvas = null;
            this._sheetCanvasCtx = null;
            this._sheetNextPlacement = { x: 0, y: 0, rowHeight: 0 };
            this._sheetCanvasSize = { width: 2048, height: 2048 };

            // Slices & Animation State
            this.slices = [];
            this.selectedSliceIds = new Set();   // multi-select set
            this.clips = [];
            this.activeClipId = null;

            // Viewport & Navigation
            this.zoom = 1.0;
            this.panX = 0;
            this.panY = 0;
            this.isPanning = false;
            this._spaceDown = false;   // FIX: proper space-bar tracking
            this.startPanX = 0;
            this.startPanY = 0;

            // Tools: 'select', 'slice-manual', 'pivot', 'hitbox', '9slice'
            this.activeTool = 'select';
            this.hitboxType = 'hurtbox';
            this.isDrawingBox = false;
            this.dragBoxStart = null;
            this.dragBoxCurrent = { x: 0, y: 0, w: 0, h: 0 };

            // Preview Player State
            this.previewPlaying = false;
            this.previewCurrentFrameIndex = 0;
            this.previewElapsed = 0;
            this.previewFPS = 12;
            this.previewZoom = 2.0;
            this.previewDirection = 1;
            this.onionSkinEnabled = false;
            this._animRAF = 0;

            // Undo / Redo  (max 50 steps)
            this._undoStack = [];
            this._redoStack = [];

            // Pixel ruler
            this._showRuler = true;

            this.dom = {};

            // Bound methods
            this._onCanvasMouseDown = this._onCanvasMouseDown.bind(this);
            this._onCanvasMouseMove = this._onCanvasMouseMove.bind(this);
            this._onCanvasMouseUp = this._onCanvasMouseUp.bind(this);
            this._onCanvasWheel = this._onCanvasWheel.bind(this);
            this._onKeyDown = this._onKeyDown.bind(this);
            this._onKeyUp = this._onKeyUp.bind(this);
            this._previewLoop = this._previewLoop.bind(this);
        }

        // ======================================================================
        // INIT
        // ======================================================================
        init() {
            if (this.initialized && this.modal?.parentElement) return this;
            this._injectStyles();
            this._buildDOM();
            this._bindEvents();
            this.initialized = true;
            this.refreshEmbeddedAssets();
            return this;
        }

        // ======================================================================
        // STYLES
        // ======================================================================
        _injectStyles() {
            if (document.getElementById('sm-sse-injected-styles')) return;
            const style = document.createElement('style');
            style.id = 'sm-sse-injected-styles';
            style.textContent = `
                .sm-sse-modal {
                    position: fixed !important; inset: 0 !important;
                    width: 100vw !important; height: 100vh !important;
                    z-index: 9999999 !important;
                    background: rgba(0,0,0,0.88) !important;
                    backdrop-filter: blur(18px) !important;
                    -webkit-backdrop-filter: blur(18px) !important;
                    display: none; align-items: center; justify-content: center;
                    box-sizing: border-box; padding: 20px;
                }
                .sm-sse-modal.active { display: flex !important; }
                .sm-sse-window {
                    width: 100%; height: 100%;
                    max-width: 1680px; max-height: 960px;
                    background: var(--pp-base);
                    border: 1px solid rgba(var(--text-primary-rgb), 0.14);
                    border-radius: 12px;
                    box-shadow: 0 32px 90px rgba(0,0,0,0.95), 0 0 0 1px rgba(var(--text-primary-rgb), 0.08);
                    display: flex; flex-direction: column; overflow: hidden;
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                    color: var(--pp-text-0);
                }
                .sm-sse-topbar {
                    height: 50px; background: var(--pp-surface-0);
                    border-bottom: 1px solid rgba(var(--text-primary-rgb), 0.08);
                    display: flex; align-items: center; justify-content: space-between;
                    padding: 0 14px; flex-shrink: 0; gap: 6px;
                }
                .sm-sse-brand {
                    display: flex; align-items: center; gap: 10px;
                    font-size: 12.5px; font-weight: 800; color: var(--pp-accent); white-space: nowrap;
                }
                .sm-sse-topbar-tools { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
                .sm-sse-divider { width: 1px; height: 22px; background: rgba(255,255,255,0.1); margin: 0 4px; }
                .sm-sse-btn {
                    height: 30px; padding: 0 11px;
                    background: rgba(var(--text-primary-rgb), 0.06);
                    border: 1px solid rgba(var(--text-primary-rgb), 0.13);
                    border-radius: 5px; color: var(--pp-text-1);
                    font-size: 11px; font-weight: 600; cursor: pointer;
                    display: inline-flex; align-items: center; gap: 5px;
                    transition: all 0.12s ease; white-space: nowrap;
                }
                .sm-sse-btn:hover { background: rgba(var(--text-primary-rgb), 0.13); color: #fff; border-color: rgba(var(--text-primary-rgb), 0.25); }
                .sm-sse-btn-primary { background: linear-gradient(180deg,var(--pp-accent),color-mix(in srgb, var(--pp-accent) 78%, black 22%)); border-color: var(--pp-accent); color:var(--pp-base); font-weight:750; }
                .sm-sse-btn-primary:hover { background: linear-gradient(180deg,var(--pp-accent-hover),var(--pp-accent)); color:var(--pp-base); }
                .sm-sse-btn-accent  { background: var(--cb-accent); border-color: var(--cb-accent-hi); color:#fff; }
                .sm-sse-btn-accent:hover { background: color-mix(in srgb, var(--cb-accent) 78%, black 22%); }
                .sm-sse-btn-danger  { background: var(--cb-danger-dim); border-color: rgba(var(--accent-danger-rgb), 0.38); color:color-mix(in srgb, var(--pp-red) 72%, white 28%); }
                .sm-sse-btn-danger:hover { background: rgba(var(--accent-danger-rgb), 0.20); }
                .sm-sse-btn-active  { background: var(--pp-accent-dim); border-color: var(--pp-accent-glow); color:var(--pp-accent); }
                .sm-sse-close { background:transparent; border:none; color:var(--pp-text-1); font-size:18px; cursor:pointer; padding:6px; }
                .sm-sse-close:hover { color:var(--pp-red); }

                /* BODY 3-COL LAYOUT */
                .sm-sse-body {
                    flex: 1; display: grid;
                    grid-template-columns: 255px 270px minmax(420px,1fr) 330px;
                    overflow: hidden;
                    min-width: 0;
                }
                /* EMBEDDED ASSETS BROWSER */
                .sm-sse-assets-panel {
                    background:var(--pp-surface-0); border-right:1px solid rgba(var(--text-primary-rgb), 0.08);
                    display:flex; flex-direction:column; overflow:hidden; min-width:0;
                }
                .sm-sse-assets-toolbar {
                    padding:7px; display:flex; gap:5px; border-bottom:1px solid rgba(var(--text-primary-rgb), 0.07);
                    background:var(--pp-surface-0); flex-shrink:0;
                }
                .sm-sse-assets-search {
                    flex:1; min-width:0; height:26px; background:var(--pp-border-hard); border:1px solid rgba(255,255,255,.1);
                    border-radius:4px; color:#fff; padding:0 7px; font-size:10.5px;
                }
                .sm-sse-assets-search:focus { outline:none; border-color:var(--cb-accent-hi); }
                .sm-sse-assets-actions { padding:6px 7px; display:flex; gap:5px; border-bottom:1px solid rgba(255,255,255,.07); flex-shrink:0; }
                .sm-sse-assets-actions .sm-sse-mini-btn { flex:1; justify-content:center; }
                .sm-sse-assets-drop {
                    margin:7px; padding:12px 7px; border:1px dashed var(--cb-accent-glow); border-radius:5px;
                    color:var(--pp-text-2); text-align:center; font-size:10px; line-height:1.4; flex-shrink:0; cursor:pointer;
                    background:var(--cb-accent-dim);
                }
                .sm-sse-assets-drop.dragover { border-color:var(--cb-accent-hi); background:rgba(56,189,248,.1); color:color-mix(in srgb, var(--cb-accent-hi) 72%, white 28%); }
                .sm-sse-assets-queue { flex:1; overflow-y:auto; padding:5px; display:flex; flex-direction:column; gap:4px; min-height:0; }
                .sm-sse-asset-item {
                    display:flex; align-items:center; gap:7px; padding:5px; border:1px solid transparent; border-radius:5px;
                    background:var(--pp-surface-1); cursor:pointer; min-width:0;
                }
                .sm-sse-asset-item:hover { background:var(--pp-surface-3); border-color:rgba(255,255,255,.1); }
                .sm-sse-asset-item.active { background:var(--cb-accent-dim); border-color:var(--cb-accent-ring); }
                .sm-sse-asset-thumb { width:42px; height:42px; flex:0 0 42px; object-fit:contain; background:var(--pp-base); border-radius:3px; image-rendering:auto; }
                .sm-sse-asset-info { flex:1; min-width:0; }
                .sm-sse-asset-name { display:block; color:var(--pp-text-1); font-size:10.5px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
                .sm-sse-asset-meta { display:block; color:var(--pp-text-2); font-size:9px; margin-top:3px; }
                .sm-sse-asset-use { width:25px; height:25px; flex:0 0 25px; background:var(--pp-surface-3); border:1px solid rgba(255,255,255,.1); border-radius:4px; color:var(--cb-accent-hi); cursor:pointer; }
                .sm-sse-asset-use:hover { background:var(--cb-accent); color:#fff; }
                .sm-sse-assets-status { padding:5px 8px; border-top:1px solid rgba(255,255,255,.07); color:var(--pp-text-2); font-size:9px; flex-shrink:0; }
                .sm-sse-sidebar-left, .sm-sse-sidebar-right {
                    background: var(--pp-surface-1); display:flex; flex-direction:column; overflow:hidden;
                }
                .sm-sse-sidebar-left  { border-right: 1px solid rgba(var(--text-primary-rgb), 0.08); }
                .sm-sse-sidebar-right { border-left:  1px solid rgba(var(--text-primary-rgb), 0.08); }
                .sm-sse-panel-header {
                    height: 36px; padding: 0 12px;
                    background: var(--pp-surface-2);
                    border-bottom: 1px solid rgba(var(--text-primary-rgb), 0.08);
                    display: flex; align-items: center; justify-content: space-between;
                    font-size: 10.5px; font-weight: 750; color: var(--pp-text-2);
                    letter-spacing: 0.06em; text-transform: uppercase; flex-shrink: 0;
                }
                /* TOOL SELECTOR */
                .sm-sse-tool-selector {
                    display: grid; grid-template-columns: repeat(5,1fr);
                    padding: 7px; gap: 3px;
                    background: var(--pp-surface-0); border-bottom: 1px solid rgba(var(--text-primary-rgb), 0.07);
                    flex-shrink: 0;
                }
                .sm-sse-tool-btn {
                    height: 28px; background:transparent;
                    border: 1px solid transparent; border-radius: 4px;
                    color: var(--pp-text-1); font-size: 10.5px; font-weight: 600;
                    cursor: pointer; display:flex; align-items:center; justify-content:center; gap:3px;
                }
                .sm-sse-tool-btn:hover { background:rgba(var(--text-primary-rgb), 0.06); color:#fff; }
                .sm-sse-tool-btn.active {
                    background: var(--pp-accent-dim); border-color: var(--pp-accent-glow); color:var(--pp-accent);
                }
                /* SLICE INSPECTOR */
                .sm-sse-slice-inspector { padding:10px 12px; background:var(--pp-surface-1); border-bottom:1px solid rgba(var(--text-primary-rgb), 0.07); }
                .sm-sse-prop-title { font-size:9.5px; font-weight:800; color:var(--pp-text-2); margin-bottom:6px; text-transform:uppercase; letter-spacing:.06em; }
                .sm-sse-form-row { display:flex; flex-direction:column; gap:3px; margin-bottom:6px; }
                .sm-sse-form-row label { font-size:10px; color:var(--pp-text-1); }
                .sm-sse-input {
                    height:24px; background:var(--pp-border-hard); border:1px solid rgba(255,255,255,0.1);
                    border-radius:3px; padding:0 6px; color:#fff; font-size:11px;
                    width:100%; box-sizing:border-box;
                }
                .sm-sse-input:focus { outline:none; border-color:var(--cb-accent-hi); }
                .sm-sse-form-grid-2 { display:grid; grid-template-columns:1fr 1fr; gap:5px; }
                .sm-sse-form-grid-2 label { font-size:10px; color:var(--pp-text-1); }
                .sm-sse-pivot-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:2px; margin-top:4px; }
                .sm-sse-pivot-grid button {
                    height:21px; background:var(--pp-surface-3); border:1px solid rgba(var(--text-primary-rgb), 0.07);
                    border-radius:3px; color:var(--pp-text-1); font-size:9px; font-weight:700; cursor:pointer;
                }
                .sm-sse-pivot-grid button:hover { background:var(--pp-accent); color:var(--pp-base); }
                /* HITBOX LIST */
                .sm-sse-hitbox-list { padding:6px 12px; max-height:120px; overflow-y:auto; display:flex; flex-direction:column; gap:3px; }
                .sm-sse-hitbox-item { display:flex; align-items:center; gap:6px; font-size:10.5px; }
                .sm-sse-hitbox-color { width:10px; height:10px; border-radius:2px; flex-shrink:0; }
                .sm-sse-hitbox-label { flex:1; color:var(--pp-text-1); }
                .sm-sse-hitbox-del { background:transparent; border:none; color:var(--pp-text-2); cursor:pointer; font-size:11px; }
                .sm-sse-hitbox-del:hover { color:var(--pp-red); }
                /* SLICE LIST */
                .sm-sse-slice-list {
                    flex:1; overflow-y:auto; padding:5px;
                    display:flex; flex-direction:column; gap:2px;
                }
                .sm-sse-slice-item {
                    display:flex; align-items:center; gap:7px;
                    padding:5px 7px; border-radius:4px; border:1px solid transparent;
                    cursor:pointer; font-size:11px; color:var(--pp-text-1);
                }
                .sm-sse-slice-item:hover { background:rgba(var(--text-primary-rgb), 0.04); }
                .sm-sse-slice-item.active {
                    background:rgba(56,189,248,0.12); border-color:rgba(56,189,248,0.4); color:var(--cb-accent-hi);
                }
                .sm-sse-slice-item.multi-selected {
                    background:rgba(245,158,11,0.1); border-color:rgba(245,158,11,0.35); color:var(--pp-accent);
                }
                .sm-sse-slice-thumb { width:28px; height:20px; object-fit:contain; background:var(--pp-surface-0); border-radius:2px; flex-shrink:0; }
                .sm-sse-slice-idx  { font-size:10px; color:var(--pp-text-2); width:16px; flex-shrink:0; }
                .sm-sse-slice-name { flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
                .sm-sse-slice-res  { font-size:9.5px; color:var(--pp-text-2); font-family:monospace; }
                .sm-sse-delete-slice { background:transparent; border:none; color:var(--pp-text-2); cursor:pointer; font-size:11px; }
                .sm-sse-delete-slice:hover { color:var(--pp-red); }
                /* VIEWPORT */
                .sm-sse-viewport-wrap {
                    position:relative; flex:1; overflow:hidden;
                    background:var(--pp-surface-1); user-select:none;
                }
                .sm-sse-canvas-hud {
                    position:absolute; bottom:10px; left:10px;
                    background:rgba(11,14,20,0.85);
                    border:1px solid rgba(255,255,255,0.1);
                    backdrop-filter:blur(8px); border-radius:4px;
                    padding:4px 10px; display:flex; gap:14px;
                    font-size:10.5px; color:var(--pp-text-1); pointer-events:none;
                }
                /* PREVIEW */
                .sm-sse-preview-box { border-bottom:1px solid rgba(var(--text-primary-rgb), 0.07); flex-shrink:0; }
                .sm-sse-preview-canvas-wrap {
                    height:220px; display:flex; align-items:center; justify-content:center;
                    background:var(--pp-surface-0); border-bottom:1px solid rgba(var(--text-primary-rgb), 0.05);
                    position:relative;
                }
                .sm-sse-preview-controls { display:flex; gap:4px; }
                .sm-sse-preview-controls button, .sm-sse-mini-btn {
                    width:24px; height:24px; background:var(--pp-surface-3);
                    border:1px solid rgba(255,255,255,0.1); border-radius:4px;
                    color:var(--pp-text-1); cursor:pointer; display:flex; align-items:center;
                    justify-content:center; font-size:10px;
                }
                .sm-sse-mini-btn { width:auto; padding:0 8px; gap:4px; }
                .sm-sse-mini-btn:hover { background:var(--pp-surface-4); }
                .sm-sse-preview-footer { padding:8px 12px; display:flex; flex-direction:column; gap:6px; }
                .sm-sse-slider-row { display:flex; flex-direction:column; gap:3px; font-size:10.5px; }
                .sm-sse-slider-row input[type="range"] { accent-color:var(--pp-accent); }
                .sm-sse-toggle-row { display:flex; justify-content:space-between; font-size:10.5px; color:var(--pp-text-1); }
                /* CLIP THUMBNAILS */
                .sm-sse-clip-thumb-strip {
                    display:flex; gap:3px; padding:5px 8px; overflow-x:auto;
                    border-top:1px solid rgba(var(--text-primary-rgb), 0.06);
                    background:var(--pp-surface-0); min-height:40px; flex-shrink:0;
                }
                .sm-sse-clip-frame-thumb {
                    width:32px; height:32px; background:var(--pp-surface-1);
                    border:1px solid rgba(255,255,255,0.1); border-radius:3px;
                    cursor:pointer; flex-shrink:0; position:relative;
                }
                .sm-sse-clip-frame-thumb.current { border-color:var(--pp-accent); }
                .sm-sse-clip-frame-thumb canvas { width:100%; height:100%; display:block; }
                /* CLIPS MANAGER */
                .sm-sse-clips-manager { flex:1; display:flex; flex-direction:column; overflow:hidden; }
                .sm-sse-clips-list { flex:1; overflow-y:auto; padding:7px; display:flex; flex-direction:column; gap:5px; }
                .sm-sse-clip-card {
                    background:var(--pp-surface-3); border:1px solid rgba(var(--text-primary-rgb), 0.08);
                    border-radius:6px; padding:7px 9px; cursor:pointer;
                }
                .sm-sse-clip-card.active { border-color:var(--pp-accent); background:rgba(245,158,11,0.1); }
                .sm-sse-clip-head { display:flex; justify-content:space-between; font-size:11.5px; margin-bottom:4px; align-items:center; }
                .sm-sse-clip-body { display:flex; gap:10px; font-size:10px; color:var(--pp-text-1); flex-wrap:wrap; }
                .sm-sse-clip-fps-input { width:40px; height:18px; font-size:10px; background:var(--pp-surface-0); border:1px solid rgba(255,255,255,0.1); border-radius:2px; color:#fff; text-align:center; }
                .sm-sse-empty-hint { padding:18px; text-align:center; color:var(--pp-text-2); font-size:11px; font-style:italic; }
                /* DIALOG */
                .sm-sse-dialog-backdrop {
                    position:absolute; inset:0;
                    background:rgba(0,0,0,0.65); backdrop-filter:blur(4px);
                    display:flex; align-items:center; justify-content:center; z-index:100;
                }
                .sm-sse-dialog {
                    width:340px; background:var(--pp-surface-1);
                    border:1px solid rgba(var(--text-primary-rgb), 0.15); border-radius:8px;
                    padding:16px; box-shadow:0 16px 40px rgba(0,0,0,0.85);
                }
                .sm-sse-dialog h3 { margin:0 0 12px; font-size:13px; color:var(--pp-text-0); }
                .sm-sse-dialog-actions { display:flex; justify-content:flex-end; gap:8px; margin-top:14px; }
                /* SCROLLBARS */
                .sm-sse-slice-list::-webkit-scrollbar,
                .sm-sse-clips-list::-webkit-scrollbar { width:5px; }
                .sm-sse-slice-list::-webkit-scrollbar-track,
                .sm-sse-clips-list::-webkit-scrollbar-track { background:var(--pp-surface-0); }
                .sm-sse-slice-list::-webkit-scrollbar-thumb,
                .sm-sse-clips-list::-webkit-scrollbar-thumb { background:var(--pp-surface-4); border-radius:3px; }
                /* UNDO/REDO INDICATOR */
                .sm-sse-undo-state { font-size:10px; color:var(--pp-text-2); margin-left:4px; }
                /* 9-SLICE GUIDE LINES */
                .sm-sse-9slice-guide { pointer-events:none; }
                /* KEYBOARD SHORTCUT TOOLTIP */
                .sm-sse-kbd { background:var(--pp-surface-3); border:1px solid var(--pp-surface-4); border-radius:3px; padding:1px 4px; font-family:monospace; font-size:9.5px; color:var(--pp-text-1); }
            `;
            document.head.appendChild(style);
        }

        // ======================================================================
        // DOM BUILD
        // ======================================================================
        _buildDOM() {
            let container = document.getElementById('sm-spritesheet-editor-modal');
            if (container) container.remove();

            container = document.createElement('div');
            container.id = 'sm-spritesheet-editor-modal';
            container.className = 'sm-sse-modal';
            container.innerHTML = `
                <div class="sm-sse-window">
                    <!-- TOP BAR -->
                    <div class="sm-sse-topbar">
                        <div class="sm-sse-brand">
                            <i class="fas fa-cubes-stacked"></i>
                            <strong>2D SPRITE SHEET STUDIO</strong>
                            <span class="sm-sse-undo-state" id="sm-sse-undo-state"></span>
                        </div>
                        <div class="sm-sse-topbar-tools">
                            <label class="sm-sse-btn" title="Load an existing sprite sheet image">
                                <i class="fas fa-folder-open"></i> Load Sheet
                                <input type="file" id="sm-sse-file-input" accept="image/*" style="display:none">
                            </label>
                            <label class="sm-sse-btn" title="Import JSON Atlas">
                                <i class="fas fa-file-import"></i> Import JSON
                                <input type="file" id="sm-sse-json-import" accept=".json,application/json" style="display:none">
                            </label>
                            <div class="sm-sse-divider"></div>
                            <button type="button" class="sm-sse-btn" id="sm-sse-auto-slice" title="Auto Alpha Island Slicing  [A]">
                                <i class="fas fa-wand-magic-sparkles"></i> Auto Slice
                            </button>
                            <button type="button" class="sm-sse-btn" id="sm-sse-grid-slice-btn" title="Uniform Grid Slicing  [G]">
                                <i class="fas fa-border-all"></i> Grid Slice
                            </button>
                            <button type="button" class="sm-sse-btn" id="sm-sse-fit-btn" title="Fit Image to View  [F]">
                                <i class="fas fa-expand"></i> Fit
                            </button>
                            <button type="button" class="sm-sse-btn" id="sm-sse-ruler-btn" title="Toggle Pixel Ruler">
                                <i class="fas fa-ruler"></i> Ruler
                            </button>
                            <button type="button" class="sm-sse-btn sm-sse-btn-danger" id="sm-sse-clear-slices" title="Clear All Slices">
                                <i class="fas fa-trash-can"></i> Clear
                            </button>
                            <div class="sm-sse-divider"></div>
                            <button type="button" class="sm-sse-btn" id="sm-sse-undo-btn" title="Undo  [Ctrl+Z]">
                                <i class="fas fa-rotate-left"></i>
                            </button>
                            <button type="button" class="sm-sse-btn" id="sm-sse-redo-btn" title="Redo  [Ctrl+Y]">
                                <i class="fas fa-rotate-right"></i>
                            </button>
                            <div class="sm-sse-divider"></div>
                            <button type="button" class="sm-sse-btn sm-sse-btn-primary" id="sm-sse-export-json">
                                <i class="fas fa-file-code"></i> Export JSON
                            </button>
                            <button type="button" class="sm-sse-btn sm-sse-btn-accent" id="sm-sse-save-asset" title="Save slices and image to Assets Manager">
                                <i class="fas fa-floppy-disk"></i> Save to Assets
                            </button>
                            <button type="button" class="sm-sse-btn" id="sm-sse-export-png" title="Export Atlas PNG">
                                <i class="fas fa-image"></i> Export PNG
                            </button>
                            <button type="button" class="sm-sse-btn sm-sse-btn-accent" id="sm-sse-spawn-scene" title="Spawn as 2D Sprite into active scene">
                                <i class="fas fa-plus"></i> Add to Scene
                            </button>
                        </div>
                        <button type="button" class="sm-sse-close" id="sm-sse-close-btn"><i class="fas fa-xmark"></i></button>
                    </div>

                    <!-- BODY -->
                    <div class="sm-sse-body">
                        <!-- EMBEDDED ASSETS BROWSER / IMAGE QUEUE -->
                        <div class="sm-sse-assets-panel" id="sm-sse-assets-panel">
                            <div class="sm-sse-panel-header">
                                <span><i class="fas fa-images"></i> ASSETS</span>
                                <span id="sm-sse-assets-count">0</span>
                            </div>
                            <div class="sm-sse-assets-toolbar">
                                <input id="sm-sse-assets-search" class="sm-sse-assets-search" placeholder="Search images..." autocomplete="off">
                            </div>
                            <div class="sm-sse-assets-actions">
                                <label class="sm-sse-mini-btn" title="Add images to the editor queue">
                                    <i class="fas fa-plus"></i> Add Images
                                    <input type="file" id="sm-sse-assets-file-input" accept="image/*" multiple style="display:none">
                                </label>
                                <button type="button" class="sm-sse-mini-btn" id="sm-sse-assets-refresh" title="Refresh project Assets"><i class="fas fa-rotate"></i></button>
                            </div>
                            <div class="sm-sse-assets-drop" id="sm-sse-assets-drop">
                                <i class="fas fa-cloud-arrow-down"></i><br>
                                Drop PNG / JPG / WebP here<br>
                                <span style="font-size:9px">Then press → to add the original image to the sheet.</span>
                            </div>
                            <div class="sm-sse-assets-queue" id="sm-sse-assets-queue">
                                <div class="sm-sse-empty-hint">Loading project images...</div>
                            </div>
                            <div class="sm-sse-assets-status" id="sm-sse-assets-status">0 queued</div>
                        </div>

                        <!-- LEFT SIDEBAR: Slices -->
                        <div class="sm-sse-sidebar-left">
                            <div class="sm-sse-panel-header">
                                <span><i class="fas fa-scissors"></i> SLICES (<span id="sm-sse-slice-count">0</span>)</span>
                                <span style="font-size:9px;color:#475569">Ctrl+Click = multi-select</span>
                            </div>
                            <!-- TOOLS -->
                            <div class="sm-sse-tool-selector">
                                <button type="button" class="sm-sse-tool-btn active" data-tool="select" title="Select [V]"><i class="fas fa-arrow-pointer"></i> Sel</button>
                                <button type="button" class="sm-sse-tool-btn" data-tool="slice-manual" title="Draw Slice [S]"><i class="fas fa-crop-simple"></i> Slice</button>
                                <button type="button" class="sm-sse-tool-btn" data-tool="pivot" title="Set Pivot [P]"><i class="fas fa-crosshairs"></i> Pivot</button>
                                <button type="button" class="sm-sse-tool-btn" data-tool="hitbox" title="Draw Hitbox [H]"><i class="fas fa-shield-halved"></i> Hitbox</button>
                                <button type="button" class="sm-sse-tool-btn" data-tool="9slice" title="9-Slice Borders [9]"><i class="fas fa-border-none"></i> 9-Sl</button>
                            </div>
                            <!-- SLICE INSPECTOR -->
                            <div class="sm-sse-slice-inspector" id="sm-sse-slice-inspector" style="display:none;">
                                <div class="sm-sse-prop-title">FRAME PROPERTIES</div>
                                <div class="sm-sse-form-row">
                                    <label>Name</label>
                                    <input type="text" id="sm-sse-prop-name" class="sm-sse-input">
                                </div>
                                <div class="sm-sse-form-grid-2">
                                    <div><label>X</label><input type="number" id="sm-sse-prop-x" class="sm-sse-input"></div>
                                    <div><label>Y</label><input type="number" id="sm-sse-prop-y" class="sm-sse-input"></div>
                                    <div><label>W</label><input type="number" id="sm-sse-prop-w" class="sm-sse-input"></div>
                                    <div><label>H</label><input type="number" id="sm-sse-prop-h" class="sm-sse-input"></div>
                                </div>
                                <div class="sm-sse-form-grid-2" style="margin-top:6px">
                                    <div><label>Pivot X</label><input type="number" id="sm-sse-prop-pvx" class="sm-sse-input" step="0.01" min="0" max="1"></div>
                                    <div><label>Pivot Y</label><input type="number" id="sm-sse-prop-pvy" class="sm-sse-input" step="0.01" min="0" max="1"></div>
                                </div>
                                <div class="sm-sse-prop-title" style="margin-top:8px">PIVOT PRESET</div>
                                <div class="sm-sse-pivot-grid">
                                    <button type="button" data-pivot="0,0">TL</button>
                                    <button type="button" data-pivot="0.5,0">TC</button>
                                    <button type="button" data-pivot="1,0">TR</button>
                                    <button type="button" data-pivot="0,0.5">CL</button>
                                    <button type="button" data-pivot="0.5,0.5">C</button>
                                    <button type="button" data-pivot="1,0.5">CR</button>
                                    <button type="button" data-pivot="0,1">BL</button>
                                    <button type="button" data-pivot="0.5,1">BC</button>
                                    <button type="button" data-pivot="1,1">BR</button>
                                </div>
                                <!-- 9-SLICE BORDERS (shown when tool=9slice) -->
                                <div id="sm-sse-9slice-controls" style="display:none;margin-top:8px;">
                                    <div class="sm-sse-prop-title">9-SLICE BORDERS (px)</div>
                                    <div class="sm-sse-form-grid-2">
                                        <div><label>Top</label><input type="number" id="sm-sse-9s-top" class="sm-sse-input" value="8" min="0"></div>
                                        <div><label>Bottom</label><input type="number" id="sm-sse-9s-bot" class="sm-sse-input" value="8" min="0"></div>
                                        <div><label>Left</label><input type="number" id="sm-sse-9s-left" class="sm-sse-input" value="8" min="0"></div>
                                        <div><label>Right</label><input type="number" id="sm-sse-9s-right" class="sm-sse-input" value="8" min="0"></div>
                                    </div>
                                </div>
                                <!-- HITBOX CONTROLS (shown when tool=hitbox) -->
                                <div id="sm-sse-hitbox-controls" style="display:none;margin-top:8px;">
                                    <div class="sm-sse-prop-title" style="display:flex;justify-content:space-between;align-items:center;">
                                        <span>HITBOXES</span>
                                        <div style="display:flex;gap:4px">
                                            <button type="button" class="sm-sse-mini-btn" id="sm-sse-hb-type-hurt" title="Hurtbox" style="font-size:9px;color:#34d399">Hurt</button>
                                            <button type="button" class="sm-sse-mini-btn" id="sm-sse-hb-type-hit"  title="Hitbox"  style="font-size:9px;color:#f87171">Hit</button>
                                        </div>
                                    </div>
                                    <div class="sm-sse-hitbox-list" id="sm-sse-hitbox-list"></div>
                                </div>
                            </div>
                            <!-- LAYER ASSIGNMENT -->
                            <div style="padding:6px 12px;border-bottom:1px solid rgba(255,255,255,0.07);flex-shrink:0;display:flex;align-items:center;gap:8px;" id="sm-sse-layer-row" style="display:none">
                                <label style="font-size:10px;color:#94a3b8;flex-shrink:0;">2D Layer:</label>
                                <select id="sm-sse-layer-select" class="sm-sse-input" style="height:22px;font-size:10px;">
                                    <option value="background">Background</option>
                                    <option value="midground" selected>Midground</option>
                                    <option value="foreground">Foreground</option>
                                    <option value="ui">UI</option>
                                </select>
                            </div>
                            <!-- SLICE LIST -->
                            <div class="sm-sse-slice-list" id="sm-sse-slice-list">
                                <div class="sm-sse-empty-hint">Load an image to create slices.</div>
                            </div>
                            <!-- MULTI SELECT ACTIONS -->
                            <div id="sm-sse-multi-actions" style="display:none;padding:6px;border-top:1px solid rgba(255,255,255,0.07);flex-shrink:0;display:flex;gap:4px;">
                                <button type="button" class="sm-sse-btn" id="sm-sse-multi-add-clip" style="flex:1;font-size:10px;">
                                    <i class="fas fa-film"></i> Add to Clip
                                </button>
                                <button type="button" class="sm-sse-btn sm-sse-btn-danger" id="sm-sse-multi-delete" style="font-size:10px;">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </div>
                        </div>

                        <!-- CENTER: Main Canvas Viewport -->
                        <div class="sm-sse-viewport-wrap" id="sm-sse-viewport-wrap">
                            <canvas id="sm-sse-main-canvas"></canvas>
                            <div class="sm-sse-canvas-hud">
                                <span id="sm-sse-hud-dimensions">0 × 0 px</span>
                                <span id="sm-sse-hud-zoom">100%</span>
                                <span id="sm-sse-hud-cursor">0, 0</span>
                                <span><kbd class="sm-sse-kbd">Space</kbd>+Drag Pan &nbsp; <kbd class="sm-sse-kbd">Scroll</kbd> Zoom &nbsp; <kbd class="sm-sse-kbd">F</kbd> Fit &nbsp; <kbd class="sm-sse-kbd">Del</kbd> Delete</span>
                            </div>
                        </div>

                        <!-- RIGHT SIDEBAR: Preview + Clips -->
                        <div class="sm-sse-sidebar-right">
                            <!-- PREVIEW -->
                            <div class="sm-sse-preview-box">
                                <div class="sm-sse-panel-header">
                                    <span><i class="fas fa-play"></i> PREVIEW</span>
                                    <div class="sm-sse-preview-controls">
                                        <button type="button" id="sm-sse-play-toggle"><i class="fas fa-play"></i></button>
                                        <button type="button" id="sm-sse-step-prev"><i class="fas fa-backward-step"></i></button>
                                        <button type="button" id="sm-sse-step-next"><i class="fas fa-forward-step"></i></button>
                                    </div>
                                </div>
                                <div class="sm-sse-preview-canvas-wrap">
                                    <canvas id="sm-sse-preview-canvas" width="280" height="220"></canvas>
                                </div>
                                <!-- FRAME THUMBNAIL STRIP -->
                                <div class="sm-sse-clip-thumb-strip" id="sm-sse-clip-thumb-strip"></div>
                                <div class="sm-sse-preview-footer">
                                    <div class="sm-sse-slider-row">
                                        <label>Preview Speed (FPS): <b id="sm-sse-fps-val">12</b></label>
                                        <input type="range" id="sm-sse-fps-slider" min="1" max="60" value="12">
                                    </div>
                                    <div class="sm-sse-toggle-row">
                                        <label><input type="checkbox" id="sm-sse-onion-skin"> Onion Skin</label>
                                        <label><input type="checkbox" id="sm-sse-pixel-snap" checked> Pixel Snap</label>
                                        <label><input type="checkbox" id="sm-sse-show-ruler" checked> Ruler</label>
                                    </div>
                                </div>
                            </div>

                            <!-- ANIMATIONS/CLIPS -->
                            <div class="sm-sse-clips-manager">
                                <div class="sm-sse-panel-header">
                                    <span><i class="fas fa-film"></i> ANIMATIONS</span>
                                    <button type="button" class="sm-sse-mini-btn" id="sm-sse-new-clip-btn">
                                        <i class="fas fa-plus"></i> New Clip
                                    </button>
                                </div>
                                <div class="sm-sse-clips-list" id="sm-sse-clips-list"></div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- GRID SLICE DIALOG -->
                <div class="sm-sse-dialog-backdrop" id="sm-sse-grid-dialog" style="display:none;">
                    <div class="sm-sse-dialog">
                        <h3><i class="fas fa-border-all"></i> Grid Slicing Setup</h3>
                        <div class="sm-sse-form-grid-2">
                            <div><label class="sm-sse-form-row" style="gap:3px"><span style="font-size:10px;color:#94a3b8">Tile Width (px)</span><input type="number" id="sm-sse-grid-w" value="32" class="sm-sse-input"></label></div>
                            <div><label class="sm-sse-form-row" style="gap:3px"><span style="font-size:10px;color:#94a3b8">Tile Height (px)</span><input type="number" id="sm-sse-grid-h" value="32" class="sm-sse-input"></label></div>
                            <div><label class="sm-sse-form-row" style="gap:3px"><span style="font-size:10px;color:#94a3b8">Padding (px)</span><input type="number" id="sm-sse-grid-pad" value="0" class="sm-sse-input"></label></div>
                            <div><label class="sm-sse-form-row" style="gap:3px"><span style="font-size:10px;color:#94a3b8">Margin (px)</span><input type="number" id="sm-sse-grid-margin" value="0" class="sm-sse-input"></label></div>
                        </div>
                        <div style="margin-top:8px;display:flex;align-items:center;gap:8px;">
                            <label style="font-size:10.5px;color:#94a3b8">Start Row:</label>
                            <input type="number" id="sm-sse-grid-row-start" value="0" min="0" class="sm-sse-input" style="width:60px">
                            <label style="font-size:10.5px;color:#94a3b8">Start Col:</label>
                            <input type="number" id="sm-sse-grid-col-start" value="0" min="0" class="sm-sse-input" style="width:60px">
                        </div>
                        <div class="sm-sse-dialog-actions">
                            <button type="button" class="sm-sse-btn" id="sm-sse-grid-cancel">Cancel</button>
                            <button type="button" class="sm-sse-btn sm-sse-btn-primary" id="sm-sse-grid-apply">Apply Slice</button>
                        </div>
                    </div>
                </div>
            `;

            document.body.appendChild(container);
            this.modal = container;

            this.dom = {
                fileInput: container.querySelector('#sm-sse-file-input'),
                jsonImport: container.querySelector('#sm-sse-json-import'),
                assetsPanel: container.querySelector('#sm-sse-assets-panel'),
                assetsSearch: container.querySelector('#sm-sse-assets-search'),
                assetsFileInput: container.querySelector('#sm-sse-assets-file-input'),
                assetsRefresh: container.querySelector('#sm-sse-assets-refresh'),
                assetsDrop: container.querySelector('#sm-sse-assets-drop'),
                assetsQueue: container.querySelector('#sm-sse-assets-queue'),
                assetsCount: container.querySelector('#sm-sse-assets-count'),
                assetsStatus: container.querySelector('#sm-sse-assets-status'),
                mainCanvas: container.querySelector('#sm-sse-main-canvas'),
                viewportWrap: container.querySelector('#sm-sse-viewport-wrap'),
                previewCanvas: container.querySelector('#sm-sse-preview-canvas'),
                sliceList: container.querySelector('#sm-sse-slice-list'),
                sliceCount: container.querySelector('#sm-sse-slice-count'),
                sliceInspector: container.querySelector('#sm-sse-slice-inspector'),
                clipsList: container.querySelector('#sm-sse-clips-list'),
                thumbStrip: container.querySelector('#sm-sse-clip-thumb-strip'),
                hudDimensions: container.querySelector('#sm-sse-hud-dimensions'),
                hudZoom: container.querySelector('#sm-sse-hud-zoom'),
                hudCursor: container.querySelector('#sm-sse-hud-cursor'),
                playToggle: container.querySelector('#sm-sse-play-toggle'),
                fpsSlider: container.querySelector('#sm-sse-fps-slider'),
                fpsVal: container.querySelector('#sm-sse-fps-val'),
                onionSkin: container.querySelector('#sm-sse-onion-skin'),
                gridDialog: container.querySelector('#sm-sse-grid-dialog'),
                undoState: container.querySelector('#sm-sse-undo-state'),
                hitboxList: container.querySelector('#sm-sse-hitbox-list'),
                hitboxControls: container.querySelector('#sm-sse-hitbox-controls'),
                nineSliceControls: container.querySelector('#sm-sse-9slice-controls'),
                multiActions: container.querySelector('#sm-sse-multi-actions'),
            };

            this.mainCtx = this.dom.mainCanvas.getContext('2d');
            this.previewCtx = this.dom.previewCanvas.getContext('2d');
        }

        // ======================================================================
        // EVENTS
        // ======================================================================
        _bindEvents() {
            const m = this.modal;

            m.querySelector('#sm-sse-close-btn').addEventListener('click', () => this.close());

            // File inputs
            this.dom.fileInput.addEventListener('change', (e) => {
                if (e.target.files?.[0]) this.loadFromFile(e.target.files[0]);
                e.target.value = '';
            });
            this.dom.jsonImport.addEventListener('change', (e) => {
                if (e.target.files?.[0]) this.importJSON(e.target.files[0]);
                e.target.value = '';
            });

            // Embedded Assets Browser. It is deliberately independent from the
            // external AssetsPanel rendering and always queues the original File/Blob.
            this.dom.assetsFileInput?.addEventListener('change', (e) => {
                this.queueLocalImages(Array.from(e.target.files || []));
                e.target.value = '';
            });
            this.dom.assetsRefresh?.addEventListener('click', () => this.refreshEmbeddedAssets());
            this.dom.assetsSearch?.addEventListener('input', (e) => {
                this.assetQueueFilter = String(e.target.value || '').toLowerCase().trim();
                this.renderEmbeddedAssets();
            });
            this.dom.assetsDrop?.addEventListener('click', () => this.dom.assetsFileInput?.click());
            ['dragenter','dragover'].forEach(type => this.dom.assetsDrop?.addEventListener(type, (e) => {
                e.preventDefault(); e.stopPropagation(); this.dom.assetsDrop.classList.add('dragover');
            }));
            ['dragleave','drop'].forEach(type => this.dom.assetsDrop?.addEventListener(type, (e) => {
                e.preventDefault(); e.stopPropagation(); this.dom.assetsDrop.classList.remove('dragover');
            }));
            this.dom.assetsDrop?.addEventListener('drop', (e) => {
                this.queueLocalImages(Array.from(e.dataTransfer?.files || []));
            });
            this.dom.viewportWrap.addEventListener('dragover', (e) => {
                if (e.dataTransfer?.types?.includes('application/x-sm-sse-asset')) { e.preventDefault(); }
            });
            this.dom.viewportWrap.addEventListener('drop', async (e) => {
                const id = e.dataTransfer?.getData('application/x-sm-sse-asset');
                if (!id) return;
                e.preventDefault(); e.stopPropagation();
                const pos = this._sheetPointFromEvent(e);
                await this.addQueuedAssetToSheet(id, pos);
            });

            // Tool buttons
            m.querySelectorAll('.sm-sse-tool-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    m.querySelectorAll('.sm-sse-tool-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    this.activeTool = btn.dataset.tool;
                    this._updateToolPanels();
                    this.renderCanvas();
                });
            });

            // Hitbox type buttons
            m.querySelector('#sm-sse-hb-type-hurt')?.addEventListener('click', () => { this.hitboxType = 'hurtbox'; this._syncHitboxTypeBtns(); });
            m.querySelector('#sm-sse-hb-type-hit')?.addEventListener('click', () => { this.hitboxType = 'hitbox'; this._syncHitboxTypeBtns(); });

            // Topbar actions
            m.querySelector('#sm-sse-auto-slice').addEventListener('click', () => this.autoSliceAlpha());
            m.querySelector('#sm-sse-grid-slice-btn').addEventListener('click', () => { this.dom.gridDialog.style.display = 'flex'; });
            m.querySelector('#sm-sse-grid-cancel').addEventListener('click', () => { this.dom.gridDialog.style.display = 'none'; });
            m.querySelector('#sm-sse-grid-apply').addEventListener('click', () => {
                const w = parseInt(m.querySelector('#sm-sse-grid-w').value) || 32;
                const h = parseInt(m.querySelector('#sm-sse-grid-h').value) || 32;
                const pad = parseInt(m.querySelector('#sm-sse-grid-pad').value) || 0;
                const mg = parseInt(m.querySelector('#sm-sse-grid-margin').value) || 0;
                const rs = parseInt(m.querySelector('#sm-sse-grid-row-start').value) || 0;
                const cs = parseInt(m.querySelector('#sm-sse-grid-col-start').value) || 0;
                this.gridSlice(w, h, pad, mg, rs, cs);
                this.dom.gridDialog.style.display = 'none';
            });
            m.querySelector('#sm-sse-clear-slices').addEventListener('click', () => {
                this._pushUndo();
                this.slices = []; this.clips = [];
                this.selectedSliceIds.clear(); this.activeClipId = null;
                this.updateSlicesList(); this.updateClipsList();
                this.renderCanvas(); this.renderPreview();
                showToast('All slices cleared', 'warn');
            });
            m.querySelector('#sm-sse-fit-btn').addEventListener('click', () => this.fitToView());
            m.querySelector('#sm-sse-ruler-btn').addEventListener('click', () => {
                this._showRuler = !this._showRuler;
                m.querySelector('#sm-sse-ruler-btn').classList.toggle('sm-sse-btn-active', this._showRuler);
                this.renderCanvas();
            });
            m.querySelector('#sm-sse-show-ruler').addEventListener('change', (e) => {
                this._showRuler = e.target.checked;
                this.renderCanvas();
            });
            m.querySelector('#sm-sse-export-json').addEventListener('click', () => this.exportJSON());
            m.querySelector('#sm-sse-save-asset').addEventListener('click', () => this.saveToAssets());
            m.querySelector('#sm-sse-export-png').addEventListener('click', () => this.exportAtlasPNG());
            m.querySelector('#sm-sse-spawn-scene').addEventListener('click', () => this.spawnIntoScene());
            m.querySelector('#sm-sse-undo-btn').addEventListener('click', () => this.undo());
            m.querySelector('#sm-sse-redo-btn').addEventListener('click', () => this.redo());

            // Canvas events
            this.dom.mainCanvas.addEventListener('mousedown', this._onCanvasMouseDown);
            this.dom.mainCanvas.addEventListener('mousemove', (e) => {
                const pos = this._getMousePos(e);
                if (this.dom.hudCursor) this.dom.hudCursor.textContent = `${pos.worldX}, ${pos.worldY}`;
            });
            window.addEventListener('mousemove', this._onCanvasMouseMove);
            window.addEventListener('mouseup', this._onCanvasMouseUp);
            this.dom.viewportWrap.addEventListener('wheel', this._onCanvasWheel, { passive: false });

            // Preview
            this.dom.playToggle.addEventListener('click', () => this.togglePreviewPlay());
            m.querySelector('#sm-sse-step-prev').addEventListener('click', () => this.stepPreviewFrame(-1));
            m.querySelector('#sm-sse-step-next').addEventListener('click', () => this.stepPreviewFrame(1));
            this.dom.fpsSlider.addEventListener('input', (e) => {
                this.previewFPS = parseInt(e.target.value);
                this.dom.fpsVal.textContent = this.previewFPS;
            });
            this.dom.onionSkin.addEventListener('change', (e) => {
                this.onionSkinEnabled = e.target.checked;
                this.renderPreview();
            });

            // Pivot presets
            m.querySelectorAll('[data-pivot]').forEach(btn => {
                btn.addEventListener('click', () => {
                    const [px, py] = btn.dataset.pivot.split(',').map(Number);
                    const slice = this._getPrimarySlice();
                    if (slice) {
                        this._pushUndo();
                        slice.pivot = { x: px, y: py };
                        this._syncInspectorPivot(slice);
                        this.renderCanvas(); this.renderPreview();
                    }
                });
            });

            // New clip
            m.querySelector('#sm-sse-new-clip-btn').addEventListener('click', () => {
                const name = prompt('Animation Clip Name:', `anim_${this.clips.length + 1}`) || `anim_${this.clips.length + 1}`;
                const selectedIds = this.selectedSliceIds.size > 0
                    ? [...this.selectedSliceIds]
                    : this.slices.map(s => s.id);
                const newClip = {
                    id: 'clip_' + Date.now(),
                    name: name.trim(),
                    fps: this.previewFPS,
                    loop: true,
                    pingPong: false,
                    frameSliceIds: selectedIds,
                    frameDurations: {}    // per-frame ms override (empty = use clip fps)
                };
                this.clips.push(newClip);
                this.activeClipId = newClip.id;
                this.updateClipsList(); this.renderPreview();
            });

            // Multi-select actions
            m.querySelector('#sm-sse-multi-add-clip')?.addEventListener('click', () => {
                if (this.selectedSliceIds.size === 0) return;
                const name = prompt('Clip Name:', `anim_${this.clips.length + 1}`) || `anim_${this.clips.length + 1}`;
                const newClip = {
                    id: 'clip_' + Date.now(), name: name.trim(),
                    fps: this.previewFPS, loop: true, pingPong: false,
                    frameSliceIds: [...this.selectedSliceIds],
                    frameDurations: {}
                };
                this.clips.push(newClip);
                this.activeClipId = newClip.id;
                this.updateClipsList(); this.renderPreview();
            });
            m.querySelector('#sm-sse-multi-delete')?.addEventListener('click', () => {
                if (this.selectedSliceIds.size === 0) return;
                this._pushUndo();
                this.slices = this.slices.filter(s => !this.selectedSliceIds.has(s.id));
                this.selectedSliceIds.clear();
                this.updateSlicesList(); this.renderCanvas(); this.renderPreview();
                this._updateMultiActions();
            });

            // 9-slice inputs
            ['#sm-sse-9s-top', '#sm-sse-9s-bot', '#sm-sse-9s-left', '#sm-sse-9s-right'].forEach(sel => {
                m.querySelector(sel)?.addEventListener('input', () => {
                    const slice = this._getPrimarySlice();
                    if (!slice) return;
                    slice.nineSlice = slice.nineSlice || {};
                    slice.nineSlice.top = parseInt(m.querySelector('#sm-sse-9s-top').value) || 0;
                    slice.nineSlice.bottom = parseInt(m.querySelector('#sm-sse-9s-bot').value) || 0;
                    slice.nineSlice.left = parseInt(m.querySelector('#sm-sse-9s-left').value) || 0;
                    slice.nineSlice.right = parseInt(m.querySelector('#sm-sse-9s-right').value) || 0;
                    this.renderCanvas();
                });
            });

            // Layer select
            m.querySelector('#sm-sse-layer-select')?.addEventListener('change', (e) => {
                const slice = this._getPrimarySlice();
                if (slice) slice.layer2D = e.target.value;
            });

            // Keyboard (global while editor is open)
            document.addEventListener('keydown', this._onKeyDown);
            document.addEventListener('keyup', this._onKeyUp);

            window.addEventListener('sm-assets-panel-ready', () => this.refreshEmbeddedAssets());
            window.addEventListener('sm:asset-persistence-upgraded', () => this.refreshEmbeddedAssets());
            window.addEventListener('sm:sprite-sheet-saved', () => this.refreshEmbeddedAssets());

            // Resize observer
            if (window.ResizeObserver) {
                new ResizeObserver(() => this.resizeCanvas()).observe(this.dom.viewportWrap);
            }
        }

        // ======================================================================
        // KEYBOARD SHORTCUTS
        // ======================================================================
        _onKeyDown(e) {
            if (!this.isOpen) return;
            if (e.code === 'Space' && !e.target.matches('input,textarea,select')) {
                e.preventDefault();
                this._spaceDown = true;
                this.dom.mainCanvas.style.cursor = 'grab';
            }
            if (e.target.matches('input,textarea,select')) return;

            if (e.ctrlKey || e.metaKey) {
                if (e.code === 'KeyZ') { e.preventDefault(); this.undo(); return; }
                if (e.code === 'KeyY') { e.preventDefault(); this.redo(); return; }
                if (e.code === 'KeyA') { e.preventDefault(); this._selectAllSlices(); return; }
            }
            switch (e.code) {
                case 'Delete':
                case 'Backspace':
                    e.preventDefault(); this._deleteSelected(); break;
                case 'Escape':
                    this.selectedSliceIds.clear(); this.updateSlicesList(); this.renderCanvas(); this._updateMultiActions(); break;
                case 'KeyF': this.fitToView(); break;
                case 'KeyG': this.dom.gridDialog.style.display = 'flex'; break;
                case 'KeyA': if (!e.ctrlKey) this.autoSliceAlpha(); break;
                case 'KeyV': this._setTool('select'); break;
                case 'KeyS': this._setTool('slice-manual'); break;
                case 'KeyP': this._setTool('pivot'); break;
                case 'KeyH': this._setTool('hitbox'); break;
                case 'Digit9': this._setTool('9slice'); break;
                case 'Equal':
                case 'NumpadAdd': e.preventDefault(); this._zoomBy(1.2); break;
                case 'Minus':
                case 'NumpadSubtract': e.preventDefault(); this._zoomBy(0.833); break;
                case 'ArrowLeft': this.stepPreviewFrame(-1); break;
                case 'ArrowRight': this.stepPreviewFrame(1); break;
                case 'Space': if (!e.repeat) this.togglePreviewPlay(); break;
            }
        }

        _onKeyUp(e) {
            if (e.code === 'Space') {
                this._spaceDown = false;
                this.dom.mainCanvas.style.cursor = this.activeTool === 'slice-manual' ? 'crosshair' : 'default';
            }
        }

        _setTool(tool) {
            this.activeTool = tool;
            this.modal.querySelectorAll('.sm-sse-tool-btn').forEach(b => {
                b.classList.toggle('active', b.dataset.tool === tool);
            });
            this._updateToolPanels();
            this.renderCanvas();
        }

        _updateToolPanels() {
            const is9 = this.activeTool === '9slice';
            const isHB = this.activeTool === 'hitbox';
            if (this.dom.nineSliceControls) this.dom.nineSliceControls.style.display = is9 ? 'block' : 'none';
            if (this.dom.hitboxControls) this.dom.hitboxControls.style.display = isHB ? 'block' : 'none';
            this.dom.mainCanvas.style.cursor = (this.activeTool === 'slice-manual' || this.activeTool === 'hitbox' || this.activeTool === '9slice')
                ? 'crosshair' : 'default';
        }

        _syncHitboxTypeBtns() {
            this.modal.querySelector('#sm-sse-hb-type-hurt')?.classList.toggle('sm-sse-btn-active', this.hitboxType === 'hurtbox');
            this.modal.querySelector('#sm-sse-hb-type-hit')?.classList.toggle('sm-sse-btn-active', this.hitboxType === 'hitbox');
        }

        _zoomBy(factor) {
            const rect = this.dom.viewportWrap.getBoundingClientRect();
            const cx = rect.width / 2, cy = rect.height / 2;
            const oldZoom = this.zoom;
            const newZoom = Math.max(0.05, Math.min(32, oldZoom * factor));
            this.panX = cx - (cx - this.panX) * (newZoom / oldZoom);
            this.panY = cy - (cy - this.panY) * (newZoom / oldZoom);
            this.zoom = newZoom;
            if (this.dom.hudZoom) this.dom.hudZoom.textContent = `${Math.round(this.zoom * 100)}%`;
            this.renderCanvas();
        }

        _selectAllSlices() {
            this.slices.forEach(s => this.selectedSliceIds.add(s.id));
            this.updateSlicesList(); this.renderCanvas(); this._updateMultiActions();
        }

        _deleteSelected() {
            if (this.selectedSliceIds.size === 0) return;
            this._pushUndo();
            this.slices = this.slices.filter(s => !this.selectedSliceIds.has(s.id));
            this.selectedSliceIds.clear();
            this.updateSlicesList(); this.renderCanvas(); this.renderPreview();
            this._updateMultiActions();
        }

        _updateMultiActions() {
            if (!this.dom.multiActions) return;
            this.dom.multiActions.style.display = this.selectedSliceIds.size > 1 ? 'flex' : 'none';
        }

        // ======================================================================
        // EMBEDDED ASSETS BROWSER / IMAGE QUEUE
        // ======================================================================
        _isImageAsset(asset) {
            if (!asset || asset.isBuiltIn && asset.type === 'folder') return false;
            const type = String(asset.type || '').toLowerCase();
            const mime = String(asset.sourceMimeType || asset.mimeType || '').toLowerCase();
            const name = String(asset.name || '').toLowerCase();
            return mime.startsWith('image/') ||
                ['texture','image','icon','sprite','spritesheet','hdri'].includes(type) ||
                /\.(png|jpe?g|webp|bmp|gif|tga|tiff?)$/i.test(name);
        }

        async refreshEmbeddedAssets() {
            if (!this.dom.assetsQueue) return;
            const panel = window.AssetsPanel;
            const projectAssets = Array.isArray(panel?.assets) ? panel.assets.filter(a => this._isImageAsset(a)) : [];

            // Preserve local queued files and replace only the project-asset section.
            const locals = this.assetQueue.filter(q => q.kind === 'local');
            const project = projectAssets.map(asset => ({
                id: `project:${asset.id}`,
                kind: 'project',
                assetId: asset.id,
                name: asset.name || `asset_${asset.id}`,
                type: asset.type || 'image',
                asset,
                blob: null,
                url: null
            }));

            const localByName = new Map(locals.map(q => [q.name + ':' + q.size, q]));
            this.assetQueue = [...project, ...[...localByName.values()]];
            if (!this.assetQueueSelectedId && this.assetQueue.length) this.assetQueueSelectedId = this.assetQueue[0].id;
            if (this.assetQueueSelectedId && !this.assetQueue.some(q => q.id === this.assetQueueSelectedId)) {
                this.assetQueueSelectedId = this.assetQueue[0]?.id || null;
            }
            this.renderEmbeddedAssets();
        }

        queueLocalImages(files = []) {
            const imageFiles = files.filter(file => file instanceof Blob &&
                (String(file.type || '').startsWith('image/') || /\.(png|jpe?g|webp|bmp|gif|tga|tiff?)$/i.test(file.name || '')));
            if (!imageFiles.length) return;
            for (const file of imageFiles) {
                const id = `local:${Date.now()}:${Math.random().toString(36).slice(2)}`;
                const url = URL.createObjectURL(file);
                this._assetQueueObjectURLs.add(url);
                this.assetQueue.push({
                    id,
                    kind: 'local',
                    assetId: null,
                    name: file.name || 'image',
                    type: 'image',
                    size: Number(file.size || 0),
                    asset: null,
                    blob: file,
                    url
                });
            }
            this.assetQueueSelectedId = this.assetQueue[this.assetQueue.length - imageFiles.length]?.id || this.assetQueue[0]?.id || null;
            this.renderEmbeddedAssets();
            // Queue first selected file immediately. The user can then switch images without reopening the editor.
            this.addQueuedAssetToSheet(this.assetQueueSelectedId);
        }

        async _resolveQueuedAssetBlob(item) {
            if (!item) return null;
            if (item.blob instanceof Blob) return item.blob;
            const asset = item.asset || window.AssetsPanel?._findById?.(item.assetId);
            if (!asset) return null;

            // 1. Persistent original bytes from the engine storage.
            try {
                const panel = window.AssetsPanel;
                const storage = await panel?._getPersistentAssetStorage?.();
                if (storage?.resolveAssetData) {
                    const resolved = await Promise.race([
                        Promise.resolve(storage.resolveAssetData(asset)),
                        new Promise(resolve => setTimeout(() => resolve(null), 6000))
                    ]);
                    if (resolved instanceof Blob) return resolved;
                }
                if (storage?.getBlob) {
                    const key = asset.storageKey || asset.id;
                    const blob = await Promise.race([
                        Promise.resolve(storage.getBlob(key)),
                        new Promise(resolve => setTimeout(() => resolve(null), 6000))
                    ]);
                    if (blob instanceof Blob) return blob;
                }
            } catch (error) {
                console.warn('[SpriteSheet Assets] Persistent source lookup failed:', error);
            }

            // 2. Runtime/data URL fallback. Fetch the URL into a Blob so the editor
            // always enters through loadFromFile(), exactly like a native upload.
            const candidates = [asset.sourceURL, asset.url, asset.data, item.url, asset.sourcePath];
            for (const candidate of candidates) {
                if (candidate instanceof Blob) return candidate;
                if (typeof candidate !== 'string' || !candidate) continue;
                try {
                    const response = await fetch(candidate);
                    if (!response.ok) continue;
                    const blob = await response.blob();
                    if (blob.size > 0) return blob;
                } catch (_) {}
            }
            return null;
        }

        async useQueuedAsset(id) {
            const item = this.assetQueue.find(q => q.id === id);
            if (!item) return null;
            this.assetQueueSelectedId = id;
            this.renderEmbeddedAssets();
            showToast(`Loading ${item.name}...`, 'info', 1200);
            const blob = await this._resolveQueuedAssetBlob(item);
            if (!(blob instanceof Blob) || blob.size === 0) {
                showToast(`Could not read original image: ${item.name}`, 'error');
                return null;
            }

            this.sourceAssetId = item.assetId || null;
            this.pendingSpriteSheetData = item.asset?.spriteSheet || null;
            this.sourceFile = blob;
            const result = await this.loadFromFile(blob);
            if (!result) return null;
            this.sourceAssetId = item.assetId || null;
            this.sourceFileName = String(item.name || 'spritesheet').replace(/\.[^/.]+$/, '');
            this.sourceURL = item.url || null;
            this.fitToView();
            this.renderEmbeddedAssets();
            return result;
        }

        // ======================================================================
        // SHEET COMPOSITION — queued assets become real atlas layers
        // ======================================================================
        async _loadQueueItemImage(item) {
            const blob = await this._resolveQueuedAssetBlob(item);
            if (!(blob instanceof Blob) || !blob.size) return null;

            // IMPORTANT: do NOT call this._loadImageElement() here. That method
            // calls setImage() and would replace the current sheet while we are
            // only trying to decode a queued layer. Decode with a private Image
            // element that never touches editor state.
            const url = URL.createObjectURL(blob);
            try {
                const image = await new Promise((resolve) => {
                    const img = new Image();
                    let done = false;
                    const finish = (value) => {
                        if (done) return;
                        done = true;
                        clearTimeout(timer);
                        img.onload = null;
                        img.onerror = null;
                        resolve(value);
                    };
                    const timer = setTimeout(() => finish(null), 10000);
                    img.decoding = 'async';
                    img.onload = () => finish(img);
                    img.onerror = () => finish(null);
                    img.src = url;
                });
                if (!image) return null;
                return { image, blob };
            } finally {
                URL.revokeObjectURL(url);
            }
        }

        _ensureSheetCanvas() {
            if (!this._sheetCanvas) {
                this._sheetCanvas = document.createElement('canvas');
                this._sheetCanvas.width = this._sheetCanvasSize.width;
                this._sheetCanvas.height = this._sheetCanvasSize.height;
                this._sheetCanvasCtx = this._sheetCanvas.getContext('2d');
            }
            return this._sheetCanvas;
        }

        _findFreeSheetPosition(width, height) {
            const gap = 2;
            const maxW = this._sheetCanvasSize.width;
            const maxH = this._sheetCanvasSize.height;
            let x = this._sheetNextPlacement.x;
            let y = this._sheetNextPlacement.y;
            let rowHeight = this._sheetNextPlacement.rowHeight;

            if (x + width > maxW) {
                x = 0;
                y += rowHeight + gap;
                rowHeight = 0;
            }
            if (y + height > maxH) {
                // Grow the atlas instead of rejecting the asset.
                this._sheetCanvasSize.height = Math.min(8192, Math.max(maxH * 2, y + height + gap));
                this._ensureSheetCanvas();
                this._sheetCanvas.height = this._sheetCanvasSize.height;
                this._sheetCanvasCtx = this._sheetCanvas.getContext('2d');
            }
            this._sheetNextPlacement = { x: x + width + gap, y, rowHeight: Math.max(rowHeight, height) };
            return { x, y };
        }

        _rebuildSheetCanvas() {
            const canvas = this._ensureSheetCanvas();
            const ctx = this._sheetCanvasCtx || canvas.getContext('2d');
            this._sheetCanvasCtx = ctx;
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            let maxX = 1, maxY = 1;
            for (const layer of this.sheetLayers) {
                if (!layer.image) continue;
                ctx.imageSmoothingEnabled = false;
                ctx.drawImage(layer.image, layer.x, layer.y, layer.width, layer.height);
                maxX = Math.max(maxX, layer.x + layer.width);
                maxY = Math.max(maxY, layer.y + layer.height);
            }

            // Keep a compact atlas rather than forcing the 2048px backing store
            // into the slicer. This is the actual composited sprite-sheet image.
            const compact = document.createElement('canvas');
            compact.width = Math.max(1, maxX);
            compact.height = Math.max(1, maxY);
            const cctx = compact.getContext('2d');
            cctx.imageSmoothingEnabled = false;
            cctx.drawImage(canvas, 0, 0);
            this._sheetCanvas = compact;
            this._sheetCanvasCtx = cctx;

            this.sourceImage = compact;
            this.imageWidth = compact.width;
            this.imageHeight = compact.height;
            this.sourceURL = null;
            this.sourceFile = null;
            this.sourceAssetId = null;
            this.pendingSpriteSheetData = null;
            this.sourceFileName = 'spritesheet';
            this.slices = [];
            this.clips = [];
            this.selectedSliceIds.clear();
            this.activeClipId = null;
            this._undoStack = [];
            this._redoStack = [];
            if (this.dom.hudDimensions) this.dom.hudDimensions.textContent = `${this.imageWidth} × ${this.imageHeight} px`;
            this.fitToView();
            this.updateSlicesList();
            this.updateClipsList();
            this.renderCanvas();
            this.renderPreview();
        }

        async addQueuedAssetToSheet(id, dropPosition = null) {
            const item = this.assetQueue.find(q => q.id === id);
            if (!item) return null;
            this.assetQueueSelectedId = id;
            this.renderEmbeddedAssets();
            showToast(`Adding ${item.name} to sprite sheet...`, 'info', 1400);

            const loaded = await this._loadQueueItemImage(item);
            if (!loaded?.image) {
                showToast(`Could not decode original image: ${item.name}`, 'error');
                return null;
            }

            const image = loaded.image;
            const width = image.naturalWidth || image.width || 1;
            const height = image.naturalHeight || image.height || 1;
            let pos = dropPosition;
            if (!pos) pos = this._findFreeSheetPosition(width, height);

            const layer = {
                id: `layer:${item.id}:${Date.now()}:${Math.random().toString(36).slice(2)}`,
                assetId: item.assetId || null,
                queueId: item.id,
                name: item.name,
                image,
                x: Math.max(0, Math.round(pos.x)),
                y: Math.max(0, Math.round(pos.y)),
                width,
                height
            };
            this.sheetLayers.push(layer);
            this._rebuildSheetCanvas();
            showToast(`Added ${item.name} to sheet (${width}×${height})`, 'success');
            return layer;
        }

        _sheetPointFromEvent(e) {
            const rect = this.dom.mainCanvas.getBoundingClientRect();
            return {
                x: Math.round((e.clientX - rect.left - this.panX) / this.zoom),
                y: Math.round((e.clientY - rect.top - this.panY) / this.zoom)
            };
        }

        renderEmbeddedAssets() {
            if (!this.dom.assetsQueue) return;
            const filter = this.assetQueueFilter;
            const items = this.assetQueue.filter(item => !filter || String(item.name || '').toLowerCase().includes(filter));
            if (this.dom.assetsCount) this.dom.assetsCount.textContent = String(this.assetQueue.length);
            if (this.dom.assetsStatus) this.dom.assetsStatus.textContent = `${this.assetQueue.length} queued · ${items.length} shown`;
            this.dom.assetsQueue.innerHTML = '';
            if (!items.length) {
                this.dom.assetsQueue.innerHTML = `<div class="sm-sse-empty-hint">${this.assetQueue.length ? 'No images match the search.' : 'No images queued. Add images or refresh project Assets.'}</div>`;
                return;
            }
            for (const item of items) {
                const row = document.createElement('div');
                row.className = `sm-sse-asset-item ${item.id === this.assetQueueSelectedId ? 'active' : ''}`;
                row.draggable = true;
                row.dataset.assetQueueId = item.id;
                const thumb = document.createElement('img');
                thumb.className = 'sm-sse-asset-thumb';
                thumb.alt = '';
                if (item.asset?.thumbnail && typeof item.asset.thumbnail === 'string') thumb.src = item.asset.thumbnail;
                else if (item.url) thumb.src = item.url;
                else thumb.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="42" height="42"><rect width="42" height="42" fill="#111622"/><text x="21" y="24" text-anchor="middle" fill="#64748b" font-size="9">IMG</text></svg>');
                const info = document.createElement('div');
                info.className = 'sm-sse-asset-info';
                const name = document.createElement('span');
                name.className = 'sm-sse-asset-name'; name.textContent = item.name;
                const meta = document.createElement('span');
                meta.className = 'sm-sse-asset-meta'; meta.textContent = item.kind === 'project' ? 'Project Asset' : 'Queued File';
                info.append(name, meta);
                const use = document.createElement('button');
                use.type = 'button'; use.className = 'sm-sse-asset-use'; use.title = 'Add this image to the sprite sheet canvas';
                use.innerHTML = '<i class="fas fa-arrow-right"></i>';
                row.append(thumb, info, use);
                row.addEventListener('click', () => { this.assetQueueSelectedId = item.id; this.renderEmbeddedAssets(); });
                use.addEventListener('click', async e => { e.stopPropagation(); await this.addQueuedAssetToSheet(item.id); });
                row.addEventListener('dblclick', async () => { await this.addQueuedAssetToSheet(item.id); });
                row.addEventListener('dragstart', e => {
                    e.dataTransfer?.setData('application/x-sm-sse-asset', item.id);
                    e.dataTransfer?.setData('text/plain', item.name);
                });
                this.dom.assetsQueue.appendChild(row);
            }
        }

        // ======================================================================
        // OPEN / CLOSE
        // ======================================================================
        async open(imageSource = null, name = 'spritesheet') {
            this.init();
            this.modal.classList.add('active');
            this.isOpen = true;
            await new Promise(r => setTimeout(r, 40));
            this.resizeCanvas();

            if (!imageSource) {
                const mat = window.selectedObject?.material;
                const texImg = mat?.map?.image || mat?.map?.source?.data;
                if (texImg) { this.setImage(texImg); return; }
                this.renderCanvas(); return;
            }

            let src = imageSource;
            let sourceFallbacks = [];
            this.sourceAssetId = null;
            this.sourceURL = null;
            this.sourceFile = null;
            this.pendingSpriteSheetData = null;
            if (typeof imageSource === 'object'
                && !(imageSource instanceof HTMLImageElement)
                && !(imageSource instanceof HTMLCanvasElement)
                && !(imageSource instanceof ImageBitmap)
                && !(imageSource instanceof Blob)) {
                this.sourceAssetId = imageSource.assetId || imageSource.id || null;
                this.sourceURL = imageSource.sourceURL || imageSource.url || imageSource.data || imageSource.source || null;
                this.pendingSpriteSheetData = imageSource.spriteSheet || null;
                // A thumbnail is UI-only; it may have a different resolution
                // from the source image and must never be sliced.
                src = imageSource.source || imageSource.src || imageSource.data || imageSource.sourceURL || imageSource.url || null;
                sourceFallbacks = Array.isArray(imageSource.sourceFallbacks)
                    ? imageSource.sourceFallbacks
                    : [];
                name = imageSource.name || name;

                // IMPORTANT: Assets opened from the AssetsPanel must use the
                // ORIGINAL persisted Blob, not an old blob URL/data URL.
                // This is the same byte-for-byte PNG/JPG that was imported,
                // so transparent PNG alpha is preserved exactly.
                let originalBlob = imageSource.sourceFile instanceof Blob
                    ? imageSource.sourceFile
                    : null;
                if (!originalBlob && this.sourceAssetId) {
                    originalBlob = await this._resolveOriginalAssetBlob(this.sourceAssetId);
                }
                if (originalBlob instanceof Blob) {
                    const loaded = await this.loadFromFile(originalBlob);
                    if (loaded) {
                        this._previewLoop();
                        return loaded;
                    }
                }
            }

            // Direct Blob/File input is a first-class source.
            if (src instanceof Blob) {
                const loaded = await this.loadFromFile(src);
                if (loaded) {
                    this._previewLoop();
                    return loaded;
                }
            }

            if (src instanceof HTMLImageElement || src instanceof HTMLCanvasElement || src instanceof ImageBitmap) {
                this.setImage(src, this.sourceURL);
            } else {
                // Last-resort recovery: ask AssetsPanel for the canonical Blob
                // using the asset ID. This avoids relying on stale blob URLs.
                if (!src && this.sourceAssetId) {
                    try {
                        const panel = window.AssetsPanel;
                        const storage = await panel?._getPersistentAssetStorage?.();
                        const blob = await Promise.race([
                            storage?.getBlob?.(panel?._findById?.(this.sourceAssetId)?.storageKey || this.sourceAssetId),
                            new Promise(resolve => setTimeout(() => resolve(null), 3500))
                        ]);
                        if (blob instanceof Blob) src = blob;
                    } catch (error) {
                        console.warn('[SpriteSheetEditor] Persistent Blob recovery failed:', error);
                    }
                }

                if (src instanceof Blob) {
                    const loaded = await this.loadFromFile(src);
                    if (loaded) {
                        this._previewLoop();
                        return loaded;
                    }
                }

                const candidates = [src, ...sourceFallbacks].filter(
                    (candidate, index, values) =>
                        typeof candidate === 'string' && candidate && values.indexOf(candidate) === index
                );
                let decoded = null;
                for (const candidate of candidates) {
                    decoded = await this.loadFromURL(candidate, name);
                    if (decoded) break;
                }
                if (!decoded) {
                    this._clearSourceImage();
                    showToast('Original image data could not be decoded', 'error');
                }
            }
            this._previewLoop();
        }

        close() {
            if (this.modal) this.modal.classList.remove('active');
            this.isOpen = false;
            this.previewPlaying = false;
            cancelAnimationFrame(this._animRAF);
        }

        // ======================================================================
        // IMAGE LOADING
        // ======================================================================
        async loadFromFile(file) {
            if (!(file instanceof Blob)) {
                showToast('Choose a valid image file', 'error');
                return null;
            }

            // Keep the File itself so Save to Assets can persist the exact
            // original PNG/JPG bytes, not a thumbnail or a re-encoded canvas.
            this.sourceFile = file;
            this.sourceFileName = String(file.name || 'spritesheet').replace(/\.[^/.]+$/, '');
            // Direct file loading means the user explicitly chose a new sheet.
            this.sheetLayers = [];
            this._sheetNextPlacement = { x: 0, y: 0, rowHeight: 0 };

            if (this._ownedSourceURL) {
                URL.revokeObjectURL(this._ownedSourceURL);
                this._ownedSourceURL = null;
            }
            this._ownedSourceURL = URL.createObjectURL(file);
            this.sourceURL = this._ownedSourceURL;

            const image = await this._loadImageElement(this._ownedSourceURL);
            if (!image) {
                showToast('Could not load the selected image', 'error');
                return null;
            }

            // Do not clear sourceAssetId here. Replacing the source in an
            // existing sheet updates that same saved animated asset on Save.
            return image;
        }

        async _resolveOriginalAssetBlob(assetId) {
            if (!assetId) return null;
            try {
                const panel = window.AssetsPanel;
                if (!panel) return null;
                const asset = panel._findById?.(assetId) || null;
                const storage = await panel._getPersistentAssetStorage?.();
                if (!storage) return null;

                // resolveAssetData is the canonical path when available.
                if (typeof storage.resolveAssetData === 'function') {
                    const resolved = await Promise.race([
                        Promise.resolve(storage.resolveAssetData(asset || { id: assetId })),
                        new Promise(resolve => setTimeout(() => resolve(null), 5000))
                    ]);
                    if (resolved instanceof Blob) return resolved;
                    // Some storage implementations return a runtime URL.
                    // Do NOT use that as the final source; recover the Blob below.
                }

                if (typeof storage.getBlob === 'function') {
                    const key = asset?.storageKey || assetId;
                    const blob = await Promise.race([
                        Promise.resolve(storage.getBlob(key)),
                        new Promise(resolve => setTimeout(() => resolve(null), 5000))
                    ]);
                    if (blob instanceof Blob) return blob;
                }
            } catch (error) {
                console.warn('[SpriteSheetEditor] Could not resolve original asset Blob:', error);
            }
            return null;
        }

        loadFromURL(url, name = 'spritesheet') {
            this.sourceFileName = String(name || 'spritesheet').replace(/\.[^/.]+$/, '');
            return this._loadImageData(url);
        }

        _clearSourceImage() {
            this.sourceImage = null;
            this.sourceURL = null;
            this.imageWidth = 0;
            this.imageHeight = 0;
            this.slices = [];
            this.clips = [];
            this.selectedSliceIds.clear();
            this.activeClipId = null;
            if (this.dom.hudDimensions) this.dom.hudDimensions.textContent = 'No source image';
            this.updateSlicesList();
            this.updateClipsList();
            this.renderCanvas();
            this.renderPreview();
        }

        async _loadImageData(url) {
            const source = String(url || '').trim();
            if (!source) return null;

            // 1) Direct decode. This handles data:, blob: and normal http(s) URLs.
            const direct = await this._loadImageElement(source, 5000);
            if (direct) return direct;

            // 2) Fetch the ORIGINAL bytes and turn them into a data URL.
            // This is especially important for stale/Chromium blob URLs and
            // keeps PNG RGBA/alpha intact because no canvas re-encoding occurs.
            try {
                if (typeof fetch === 'function' && !/^(?:file:|[a-z]:[\/])/i.test(source)) {
                    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
                    const timeout = setTimeout(() => controller?.abort(), 5000);
                    const response = await fetch(source, controller ? { signal: controller.signal } : undefined);
                    clearTimeout(timeout);
                    if (response.ok) {
                        const blob = await response.blob();
                        const dataURL = await new Promise((resolve, reject) => {
                            const reader = new FileReader();
                            reader.onload = () => resolve(reader.result || null);
                            reader.onerror = () => reject(reader.error || new Error('FileReader failed'));
                            reader.readAsDataURL(blob);
                        });
                        if (dataURL) {
                            const decoded = await this._loadImageElement(String(dataURL), 5000);
                            if (decoded) return decoded;
                        }

                        // 3) ImageBitmap fallback for browsers where Image fails.
                        if (typeof createImageBitmap === 'function') {
                            try {
                                const bitmap = await createImageBitmap(blob);
                                this.sourceURL = source;
                                this.setImage(bitmap, source);
                                return bitmap;
                            } catch (bitmapError) {
                                console.warn('[SpriteSheetEditor] createImageBitmap fallback failed:', bitmapError);
                            }
                        }
                    }
                }
            } catch (error) {
                console.warn('[SpriteSheetEditor] Original-byte decode fallback failed:', error);
            }

            return null;
        }

        _loadImageElement(url, timeoutMs = 5000) {
            return new Promise((resolve) => {
                const source = String(url || '').trim();
                if (!source) return resolve(null);

                const image = new Image();
                let finished = false;
                const finish = (value) => {
                    if (finished) return;
                    finished = true;
                    clearTimeout(timeout);
                    image.onload = null;
                    image.onerror = null;
                    resolve(value);
                };
                const timeout = setTimeout(() => {
                    console.warn('[SpriteSheetEditor] Image decode timed out:', source);
                    finish(null);
                }, timeoutMs);

                // crossOrigin is only safe for real remote HTTP(S) sources.
                if (/^https?:\/\//i.test(source)) image.crossOrigin = 'anonymous';
                image.decoding = 'async';
                image.onload = () => {
                    this.sourceURL = source;
                    this.setImage(image, source);
                    finish(image);
                };
                image.onerror = () => finish(null);
                image.src = source;
            });
        }

        setImage(img, sourceURL = this.sourceURL) {
            if (!img) return;
            this.sourceImage = img;
            this.sourceURL = sourceURL || this.sourceURL || null;
            this.isDirty = false;
            this.imageWidth = img.naturalWidth || img.width || 0;
            this.imageHeight = img.naturalHeight || img.height || 0;
            if (!this.imageWidth || !this.imageHeight) {
                showToast('Image decoded without valid dimensions', 'error');
                return;
            }
            if (this.dom.hudDimensions) this.dom.hudDimensions.textContent = `${this.imageWidth} × ${this.imageHeight} px`;
            this.slices = []; this.clips = [];
            this.selectedSliceIds.clear(); this.activeClipId = null;
            this._undoStack = []; this._redoStack = [];
            if (this.pendingSpriteSheetData) {
                this.slices = JSON.parse(JSON.stringify(this.pendingSpriteSheetData.slices || []));
                this.clips = JSON.parse(JSON.stringify(this.pendingSpriteSheetData.clips || []));
                this.activeClipId = this.pendingSpriteSheetData.activeClipId || this.clips[0]?.id || null;
                this.pendingSpriteSheetData = null;
            }
            this.fitToView();
            this.updateSlicesList(); this.updateClipsList();
            this.renderCanvas(); this.renderPreview();
            showToast(`Loaded: ${this.sourceFileName} (${this.imageWidth}×${this.imageHeight})`, 'success');

            // Keep an exact-byte Blob/File for Save to Assets even when the
            // source arrived as a runtime/data URL rather than a File object.
            if (!(this.sourceFile instanceof Blob) && this.sourceURL && typeof fetch === 'function') {
                const sourceAtLoad = this.sourceURL;
                Promise.resolve().then(async () => {
                    try {
                        const response = await fetch(sourceAtLoad);
                        if (!response.ok) return;
                        const blob = await response.blob();
                        this.sourceFile = new File(
                            [blob],
                            `${this.sourceFileName}.png`,
                            { type: blob.type || 'image/png', lastModified: Date.now() }
                        );
                    } catch { /* keep sourceURL fallback */ }
                });
            }
        }

        fitToView() {
            if (!this.dom.viewportWrap) return;
            const rect = this.dom.viewportWrap.getBoundingClientRect();
            if (this.imageWidth > 0 && this.imageHeight > 0) {
                const pad = 40;
                const scaleX = (rect.width - pad * 2) / this.imageWidth;
                const scaleY = (rect.height - pad * 2) / this.imageHeight;
                this.zoom = Math.min(scaleX, scaleY, 8);
            }
            this.panX = Math.round((rect.width - this.imageWidth * this.zoom) / 2);
            this.panY = Math.round((rect.height - this.imageHeight * this.zoom) / 2);
            if (this.dom.hudZoom) this.dom.hudZoom.textContent = `${Math.round(this.zoom * 100)}%`;
            this.renderCanvas();
        }

        resizeCanvas() {
            if (!this.dom.viewportWrap || !this.dom.mainCanvas) return;
            const rect = this.dom.viewportWrap.getBoundingClientRect();
            this.dom.mainCanvas.width = rect.width || 900;
            this.dom.mainCanvas.height = rect.height || 600;
            this.renderCanvas();
        }

        // ======================================================================
        // UNDO / REDO
        // ======================================================================
        _pushUndo() {
            const snapshot = {
                slices: JSON.parse(JSON.stringify(this.slices)),
                clips: JSON.parse(JSON.stringify(this.clips)),
                selectedSliceIds: [...this.selectedSliceIds],
                activeClipId: this.activeClipId
            };
            this._undoStack.push(snapshot);
            if (this._undoStack.length > 50) this._undoStack.shift();
            this._redoStack = [];
            this._updateUndoState();
        }

        undo() {
            if (this._undoStack.length === 0) { showToast('Nothing to undo', 'warn', 1500); return; }
            const current = {
                slices: JSON.parse(JSON.stringify(this.slices)),
                clips: JSON.parse(JSON.stringify(this.clips)),
                selectedSliceIds: [...this.selectedSliceIds],
                activeClipId: this.activeClipId
            };
            this._redoStack.push(current);
            const snap = this._undoStack.pop();
            this._restoreSnapshot(snap);
            showToast('Undo', 'info', 1200);
        }

        redo() {
            if (this._redoStack.length === 0) { showToast('Nothing to redo', 'warn', 1500); return; }
            const current = {
                slices: JSON.parse(JSON.stringify(this.slices)),
                clips: JSON.parse(JSON.stringify(this.clips)),
                selectedSliceIds: [...this.selectedSliceIds],
                activeClipId: this.activeClipId
            };
            this._undoStack.push(current);
            const snap = this._redoStack.pop();
            this._restoreSnapshot(snap);
            showToast('Redo', 'info', 1200);
        }

        _restoreSnapshot(snap) {
            this.slices = snap.slices;
            this.clips = snap.clips;
            this.selectedSliceIds = new Set(snap.selectedSliceIds);
            this.activeClipId = snap.activeClipId;
            this.updateSlicesList(); this.updateClipsList();
            this.renderCanvas(); this.renderPreview();
            this._updateUndoState();
        }

        _updateUndoState() {
            if (this.dom.undoState) {
                this.dom.undoState.textContent = this._undoStack.length > 0
                    ? `(${this._undoStack.length} undo${this._undoStack.length > 1 ? 's' : ''})` : '';
            }
        }

        // ======================================================================
        // AUTO SLICE — Optimized Iterative BFS (no call-stack overflow)
        // ======================================================================
        autoSliceAlpha() {
            if (!this.sourceImage) { showToast('Load an image first', 'warn'); return; }
            this._pushUndo();

            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = this.imageWidth;
            tempCanvas.height = this.imageHeight;
            const ctx = tempCanvas.getContext('2d');
            ctx.drawImage(this.sourceImage, 0, 0);

            const imgData = ctx.getImageData(0, 0, this.imageWidth, this.imageHeight);
            const data = imgData.data;
            const visited = new Uint8Array(this.imageWidth * this.imageHeight);
            const newSlices = [];
            const W = this.imageWidth, H = this.imageHeight;

            for (let sy = 0; sy < H; sy++) {
                for (let sx = 0; sx < W; sx++) {
                    const startIdx = sy * W + sx;
                    if (visited[startIdx] || data[startIdx * 4 + 3] <= 16) continue;

                    let minX = sx, maxX = sx, minY = sy, maxY = sy;
                    const stack = [sx + sy * W]; // use flat indices
                    visited[startIdx] = 1;

                    while (stack.length > 0) {
                        const flat = stack.pop();
                        const cx = flat % W, cy = (flat / W) | 0;
                        if (cx < minX) minX = cx;
                        if (cx > maxX) maxX = cx;
                        if (cy < minY) minY = cy;
                        if (cy > maxY) maxY = cy;

                        const neighbors = [flat - 1, flat + 1, flat - W, flat + W];
                        for (const nFlat of neighbors) {
                            if (nFlat < 0 || nFlat >= W * H) continue;
                            const nx = nFlat % W, ny = (nFlat / W) | 0;
                            if (Math.abs(nx - cx) > 1) continue; // prevent wrap-around
                            if (!visited[nFlat] && data[nFlat * 4 + 3] > 16) {
                                visited[nFlat] = 1;
                                stack.push(nFlat);
                            }
                        }
                    }

                    const sw = maxX - minX + 1, sh = maxY - minY + 1;
                    if (sw >= 8 && sh >= 8) {
                        newSlices.push(this._createSlice(minX, minY, sw, sh, newSlices.length));
                    }
                }
            }

            this.slices = newSlices;
            this.createDefaultClip();
            this.updateSlicesList(); this.updateClipsList();
            this.renderCanvas(); this.renderPreview();
            showToast(`Auto-sliced: ${newSlices.length} frames found`, 'success');
        }

        // ======================================================================
        // GRID SLICE
        // ======================================================================
        gridSlice(cellW = 32, cellH = 32, padding = 0, margin = 0, rowStart = 0, colStart = 0) {
            if (!this.sourceImage) return;
            this._pushUndo();

            const cols = Math.floor((this.imageWidth - margin * 2 + padding) / (cellW + padding));
            const rows = Math.floor((this.imageHeight - margin * 2 + padding) / (cellH + padding));
            const newSlices = [];

            for (let r = rowStart; r < rows; r++) {
                for (let c = colStart; c < cols; c++) {
                    const x = margin + c * (cellW + padding);
                    const y = margin + r * (cellH + padding);
                    if (x + cellW > this.imageWidth || y + cellH > this.imageHeight) continue;
                    newSlices.push(this._createSlice(x, y, cellW, cellH, newSlices.length, { pivot: { x: 0.5, y: 0.5 } }));
                }
            }

            this.slices = newSlices;
            this.createDefaultClip();
            this.updateSlicesList(); this.updateClipsList();
            this.renderCanvas(); this.renderPreview();
            showToast(`Grid slice: ${newSlices.length} frames`, 'success');
        }

        _createSlice(x, y, w, h, idx, extras = {}) {
            return {
                id: `slice_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
                name: `${this.sourceFileName}_${idx}`,
                x, y, width: w, height: h,
                pivot: extras.pivot || { x: 0.5, y: 1.0 },
                hitboxes: [],
                nineSlice: null,
                layer2D: 'midground',
                ...extras
            };
        }

        createDefaultClip() {
            if (this.slices.length === 0) return;
            this.clips = [{
                id: 'clip_default',
                name: 'animation',
                fps: this.previewFPS,
                loop: true,
                pingPong: false,
                frameSliceIds: this.slices.map(s => s.id),
                frameDurations: {}
            }];
            this.activeClipId = this.clips[0].id;
        }

        // ======================================================================
        // CANVAS RENDERING
        // ======================================================================
        renderCanvas() {
            if (!this.mainCtx) return;
            const ctx = this.mainCtx;
            const w = this.dom.mainCanvas.width;
            const h = this.dom.mainCanvas.height;

            ctx.clearRect(0, 0, w, h);
            this._drawCheckerboard(ctx, w, h);

            if (this._showRuler) this._drawRuler(ctx, w, h);

            if (!this.sourceImage) return;

            ctx.save();
            ctx.translate(this.panX, this.panY);
            ctx.scale(this.zoom, this.zoom);
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(this.sourceImage, 0, 0);

            // Draw slices
            this.slices.forEach((slice, idx) => {
                const isPrimary = this.selectedSliceIds.size === 1 && this.selectedSliceIds.has(slice.id);
                const isMulti = this.selectedSliceIds.size > 1 && this.selectedSliceIds.has(slice.id);
                const isSelected = isPrimary || isMulti;

                const fillColor = isPrimary ? 'rgba(56,189,248,0.18)'
                    : isMulti ? 'rgba(245,158,11,0.15)'
                        : 'rgba(255,255,255,0.03)';
                ctx.fillStyle = fillColor;
                ctx.fillRect(slice.x, slice.y, slice.width, slice.height);

                ctx.strokeStyle = isPrimary ? '#38bdf8' : isMulti ? '#f59e0b' : 'rgba(245,158,11,0.6)';
                ctx.lineWidth = (isSelected ? 2 : 1) / this.zoom;
                ctx.strokeRect(slice.x, slice.y, slice.width, slice.height);

                // Frame index label
                if (this.zoom > 0.5) {
                    ctx.fillStyle = isSelected ? '#fff' : '#f59e0b';
                    ctx.font = `${Math.max(9, 11 / this.zoom)}px monospace`;
                    ctx.fillText(String(idx + 1), slice.x + 2 / this.zoom, slice.y + 12 / this.zoom);
                }

                // Pivot crosshair
                const pivX = slice.x + slice.width * slice.pivot.x;
                const pivY = slice.y + slice.height * slice.pivot.y;
                ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 1.5 / this.zoom;
                const arm = 6 / this.zoom;
                ctx.beginPath();
                ctx.moveTo(pivX - arm, pivY); ctx.lineTo(pivX + arm, pivY);
                ctx.moveTo(pivX, pivY - arm); ctx.lineTo(pivX, pivY + arm);
                ctx.stroke();

                // Hitboxes
                if (isSelected && slice.hitboxes?.length > 0) {
                    slice.hitboxes.forEach(hb => {
                        ctx.strokeStyle = hb.type === 'hitbox' ? 'rgba(248,113,113,0.9)' : 'rgba(52,211,153,0.9)';
                        ctx.fillStyle = hb.type === 'hitbox' ? 'rgba(248,113,113,0.12)' : 'rgba(52,211,153,0.12)';
                        ctx.lineWidth = 1.5 / this.zoom;
                        ctx.fillRect(slice.x + hb.x, slice.y + hb.y, hb.w, hb.h);
                        ctx.strokeRect(slice.x + hb.x, slice.y + hb.y, hb.w, hb.h);
                    });
                }

                // 9-slice guides
                if (isSelected && slice.nineSlice && this.activeTool === '9slice') {
                    const ns = slice.nineSlice;
                    ctx.setLineDash([3 / this.zoom, 2 / this.zoom]);
                    ctx.strokeStyle = 'rgba(168,85,247,0.85)'; ctx.lineWidth = 1 / this.zoom;
                    // top border
                    ctx.beginPath(); ctx.moveTo(slice.x, slice.y + ns.top); ctx.lineTo(slice.x + slice.width, slice.y + ns.top); ctx.stroke();
                    // bottom border
                    ctx.beginPath(); ctx.moveTo(slice.x, slice.y + slice.height - ns.bottom); ctx.lineTo(slice.x + slice.width, slice.y + slice.height - ns.bottom); ctx.stroke();
                    // left border
                    ctx.beginPath(); ctx.moveTo(slice.x + ns.left, slice.y); ctx.lineTo(slice.x + ns.left, slice.y + slice.height); ctx.stroke();
                    // right border
                    ctx.beginPath(); ctx.moveTo(slice.x + slice.width - ns.right, slice.y); ctx.lineTo(slice.x + slice.width - ns.right, slice.y + slice.height); ctx.stroke();
                    ctx.setLineDash([]);
                }
            });

            // Drawing box preview (slice-manual or hitbox tool)
            if (this.isDrawingBox && this.dragBoxStart) {
                ctx.strokeStyle = this.activeTool === 'hitbox'
                    ? (this.hitboxType === 'hitbox' ? '#f87171' : '#34d399')
                    : '#38bdf8';
                ctx.lineWidth = 1.5 / this.zoom;
                ctx.setLineDash([4 / this.zoom, 2 / this.zoom]);
                ctx.fillStyle = this.activeTool === 'hitbox'
                    ? (this.hitboxType === 'hitbox' ? 'rgba(248,113,113,0.1)' : 'rgba(52,211,153,0.1)')
                    : 'rgba(56,189,248,0.1)';
                ctx.fillRect(this.dragBoxCurrent.x, this.dragBoxCurrent.y, this.dragBoxCurrent.w, this.dragBoxCurrent.h);
                ctx.strokeRect(this.dragBoxCurrent.x, this.dragBoxCurrent.y, this.dragBoxCurrent.w, this.dragBoxCurrent.h);
                ctx.setLineDash([]);
            }

            ctx.restore();
        }

        _drawCheckerboard(ctx, w, h) {
            const size = 16;
            for (let y = 0; y < h; y += size) {
                for (let x = 0; x < w; x += size) {
                    ctx.fillStyle = ((x / size + y / size) % 2 === 0) ? '#181e29' : '#111622';
                    ctx.fillRect(x, y, size, size);
                }
            }
        }

        _drawRuler(ctx, w, h) {
            const RULER_SIZE = 20;
            const zoom = this.zoom;
            const panX = this.panX, panY = this.panY;

            // Backgrounds
            ctx.fillStyle = '#0b0e14';
            ctx.fillRect(0, 0, w, RULER_SIZE);
            ctx.fillRect(0, 0, RULER_SIZE, h);

            ctx.strokeStyle = 'rgba(255,255,255,0.12)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(0, RULER_SIZE); ctx.lineTo(w, RULER_SIZE);
            ctx.moveTo(RULER_SIZE, 0); ctx.lineTo(RULER_SIZE, h);
            ctx.stroke();

            // Determine tick interval
            const minPixelStep = 40;
            const rawStep = minPixelStep / zoom;
            const niceSteps = [1, 2, 4, 5, 8, 10, 16, 20, 32, 50, 64, 100, 128, 200, 256, 500, 512, 1000];
            const step = niceSteps.find(s => s * zoom >= minPixelStep) || 1000;

            ctx.font = '9px monospace'; ctx.textAlign = 'center'; ctx.fillStyle = '#64748b';

            // Horizontal ruler
            const startX = Math.floor(-panX / zoom / step) * step;
            for (let wx = startX; wx < (w - panX) / zoom; wx += step) {
                const sx = panX + wx * zoom;
                if (sx < RULER_SIZE || sx > w) continue;
                ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1;
                ctx.beginPath(); ctx.moveTo(sx, RULER_SIZE - 6); ctx.lineTo(sx, RULER_SIZE); ctx.stroke();
                ctx.fillText(String(wx), sx, RULER_SIZE - 7);
            }

            // Vertical ruler
            ctx.textAlign = 'right';
            const startY = Math.floor(-panY / zoom / step) * step;
            for (let wy = startY; wy < (h - panY) / zoom; wy += step) {
                const sy = panY + wy * zoom;
                if (sy < RULER_SIZE || sy > h) continue;
                ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1;
                ctx.beginPath(); ctx.moveTo(RULER_SIZE, sy); ctx.lineTo(RULER_SIZE - 6, sy); ctx.stroke();
                ctx.save(); ctx.translate(RULER_SIZE - 7, sy); ctx.rotate(-Math.PI / 2); ctx.fillText(String(wy), 0, 0); ctx.restore();
            }

            // Corner
            ctx.fillStyle = '#0b0e14'; ctx.fillRect(0, 0, RULER_SIZE, RULER_SIZE);
        }

        // ======================================================================
        // MOUSE EVENTS
        // ======================================================================
        _getMousePos(e) {
            const rect = this.dom.mainCanvas.getBoundingClientRect();
            const clientX = e.clientX - rect.left;
            const clientY = e.clientY - rect.top;
            const worldX = Math.round((clientX - this.panX) / this.zoom);
            const worldY = Math.round((clientY - this.panY) / this.zoom);
            return { clientX, clientY, worldX, worldY };
        }

        _onCanvasMouseDown(e) {
            if (!this.sourceImage) return;
            const pos = this._getMousePos(e);

            // Panning: middle mouse OR space+left OR alt+left
            if (e.button === 1 || this._spaceDown || e.altKey) {
                this.isPanning = true;
                this.startPanX = e.clientX - this.panX;
                this.startPanY = e.clientY - this.panY;
                this.dom.mainCanvas.style.cursor = 'grabbing';
                return;
            }

            if (e.button === 0) {
                if (this.activeTool === 'select') {
                    const clicked = this.slices.slice().reverse().find(s =>
                        pos.worldX >= s.x && pos.worldX <= s.x + s.width &&
                        pos.worldY >= s.y && pos.worldY <= s.y + s.height
                    );
                    if (clicked) {
                        if (e.ctrlKey || e.metaKey) {
                            // Multi-select toggle
                            if (this.selectedSliceIds.has(clicked.id)) {
                                this.selectedSliceIds.delete(clicked.id);
                            } else {
                                this.selectedSliceIds.add(clicked.id);
                            }
                        } else if (e.shiftKey && this.selectedSliceIds.size > 0) {
                            // Range-select
                            const allIds = this.slices.map(s => s.id);
                            const lastSelected = [...this.selectedSliceIds].pop();
                            const a = allIds.indexOf(lastSelected);
                            const b = allIds.indexOf(clicked.id);
                            const [lo, hi] = [Math.min(a, b), Math.max(a, b)];
                            for (let i = lo; i <= hi; i++) this.selectedSliceIds.add(allIds[i]);
                        } else {
                            this.selectedSliceIds.clear();
                            this.selectedSliceIds.add(clicked.id);
                        }
                        this._syncInspector();
                    } else {
                        if (!e.ctrlKey && !e.shiftKey) this.selectedSliceIds.clear();
                        this._syncInspector();
                    }
                    this.updateSlicesList(); this.renderCanvas(); this._updateMultiActions();
                }
                else if (this.activeTool === 'slice-manual' || this.activeTool === 'hitbox') {
                    this.isDrawingBox = true;
                    this.dragBoxStart = { x: pos.worldX, y: pos.worldY };
                    this.dragBoxCurrent = { x: pos.worldX, y: pos.worldY, w: 0, h: 0 };
                }
                else if (this.activeTool === 'pivot') {
                    const slice = this._getPrimarySlice();
                    if (slice) {
                        this._pushUndo();
                        slice.pivot.x = Math.max(0, Math.min(1, (pos.worldX - slice.x) / slice.width));
                        slice.pivot.y = Math.max(0, Math.min(1, (pos.worldY - slice.y) / slice.height));
                        this._syncInspectorPivot(slice);
                        this.renderCanvas(); this.renderPreview();
                    }
                }
                else if (this.activeTool === '9slice') {
                    // clicking on a slice selects it for 9-slice editing
                    const clicked = this.slices.slice().reverse().find(s =>
                        pos.worldX >= s.x && pos.worldX <= s.x + s.width &&
                        pos.worldY >= s.y && pos.worldY <= s.y + s.height
                    );
                    if (clicked) {
                        this.selectedSliceIds.clear(); this.selectedSliceIds.add(clicked.id);
                        if (!clicked.nineSlice) clicked.nineSlice = { top: 8, bottom: 8, left: 8, right: 8 };
                        this._syncInspector(); this.updateSlicesList(); this.renderCanvas();
                    }
                }
            }
        }

        _onCanvasMouseMove(e) {
            if (this.isPanning) {
                this.panX = e.clientX - this.startPanX;
                this.panY = e.clientY - this.startPanY;
                this.renderCanvas();
                return;
            }
            if (this.isDrawingBox && this.dragBoxStart) {
                const pos = this._getMousePos(e);
                const x = Math.min(this.dragBoxStart.x, pos.worldX);
                const y = Math.min(this.dragBoxStart.y, pos.worldY);
                const w = Math.abs(pos.worldX - this.dragBoxStart.x);
                const h = Math.abs(pos.worldY - this.dragBoxStart.y);
                this.dragBoxCurrent = { x, y, w, h };
                this.renderCanvas();
            }
        }

        _onCanvasMouseUp(e) {
            if (this.isPanning) {
                this.isPanning = false;
                this.dom.mainCanvas.style.cursor = this._spaceDown ? 'grab' : 'default';
                return;
            }
            if (this.isDrawingBox && this.dragBoxStart) {
                this.isDrawingBox = false;
                const b = this.dragBoxCurrent;

                if (b.w >= 4 && b.h >= 4) {
                    this._pushUndo();
                    if (this.activeTool === 'slice-manual') {
                        const ns = this._createSlice(b.x, b.y, b.w, b.h, this.slices.length);
                        this.slices.push(ns);
                        this.selectedSliceIds.clear();
                        this.selectedSliceIds.add(ns.id);
                        this._syncInspector();
                        this.updateSlicesList();
                    } else if (this.activeTool === 'hitbox') {
                        const slice = this._getPrimarySlice();
                        if (slice) {
                            slice.hitboxes = slice.hitboxes || [];
                            slice.hitboxes.push({
                                id: 'hb_' + Date.now(),
                                type: this.hitboxType,
                                x: b.x - slice.x, y: b.y - slice.y,
                                w: b.w, h: b.h
                            });
                            this._renderHitboxList(slice);
                        }
                    }
                }
                this.dragBoxStart = null;
                this.renderCanvas(); this.renderPreview();
            }
        }

        _onCanvasWheel(e) {
            e.preventDefault();
            const rect = this.dom.mainCanvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            const factor = e.deltaY < 0 ? 1.2 : 0.833;
            const oldZoom = this.zoom;
            const newZoom = Math.max(0.05, Math.min(32, oldZoom * factor));
            this.panX = mouseX - (mouseX - this.panX) * (newZoom / oldZoom);
            this.panY = mouseY - (mouseY - this.panY) * (newZoom / oldZoom);
            this.zoom = newZoom;
            if (this.dom.hudZoom) this.dom.hudZoom.textContent = `${Math.round(this.zoom * 100)}%`;
            this.renderCanvas();
        }

        // ======================================================================
        // SLICE SELECTION & INSPECTOR
        // ======================================================================
        _getPrimarySlice() {
            if (this.selectedSliceIds.size === 0) return null;
            const id = [...this.selectedSliceIds][this.selectedSliceIds.size - 1];
            return this.slices.find(s => s.id === id) || null;
        }

        _syncInspector() {
            const slice = this._getPrimarySlice();
            if (!slice) {
                this.dom.sliceInspector.style.display = 'none';
                document.getElementById('sm-sse-layer-row').style.display = 'none';
                return;
            }
            this.dom.sliceInspector.style.display = 'block';
            document.getElementById('sm-sse-layer-row').style.display = 'flex';

            const n = this.modal.querySelector('#sm-sse-prop-name');
            const xi = this.modal.querySelector('#sm-sse-prop-x');
            const yi = this.modal.querySelector('#sm-sse-prop-y');
            const wi = this.modal.querySelector('#sm-sse-prop-w');
            const hi = this.modal.querySelector('#sm-sse-prop-h');
            const pvx = this.modal.querySelector('#sm-sse-prop-pvx');
            const pvy = this.modal.querySelector('#sm-sse-prop-pvy');
            const lay = this.modal.querySelector('#sm-sse-layer-select');

            n.value = slice.name;
            xi.value = slice.x;
            yi.value = slice.y;
            wi.value = slice.width;
            hi.value = slice.height;
            pvx.value = slice.pivot.x.toFixed(3);
            pvy.value = slice.pivot.y.toFixed(3);
            lay.value = slice.layer2D || 'midground';

            // Remove old listeners, rebind
            const sync = () => {
                slice.name = n.value;
                slice.x = parseInt(xi.value) || 0;
                slice.y = parseInt(yi.value) || 0;
                slice.width = parseInt(wi.value) || 1;
                slice.height = parseInt(hi.value) || 1;
                slice.pivot.x = parseFloat(pvx.value) || 0;
                slice.pivot.y = parseFloat(pvy.value) || 0;
                this.updateSlicesList(); this.renderCanvas(); this.renderPreview();
            };
            [n, xi, yi, wi, hi, pvx, pvy].forEach(inp => { inp.oninput = sync; });

            // 9-slice sync
            if (slice.nineSlice) {
                this.modal.querySelector('#sm-sse-9s-top').value = slice.nineSlice.top || 0;
                this.modal.querySelector('#sm-sse-9s-bot').value = slice.nineSlice.bottom || 0;
                this.modal.querySelector('#sm-sse-9s-left').value = slice.nineSlice.left || 0;
                this.modal.querySelector('#sm-sse-9s-right').value = slice.nineSlice.right || 0;
            }

            this._renderHitboxList(slice);
            this._updateToolPanels();
        }

        _syncInspectorPivot(slice) {
            const pvx = this.modal.querySelector('#sm-sse-prop-pvx');
            const pvy = this.modal.querySelector('#sm-sse-prop-pvy');
            if (pvx) pvx.value = slice.pivot.x.toFixed(3);
            if (pvy) pvy.value = slice.pivot.y.toFixed(3);
        }

        _renderHitboxList(slice) {
            if (!this.dom.hitboxList) return;
            if (!slice?.hitboxes?.length) {
                this.dom.hitboxList.innerHTML = '<div style="color:#475569;font-size:10px;padding:4px">Draw boxes in viewport to add hitboxes.</div>';
                return;
            }
            this.dom.hitboxList.innerHTML = '';
            slice.hitboxes.forEach(hb => {
                const row = document.createElement('div');
                row.className = 'sm-sse-hitbox-item';
                const col = hb.type === 'hitbox' ? '#f87171' : '#34d399';
                row.innerHTML = `
                    <span class="sm-sse-hitbox-color" style="background:${col}"></span>
                    <span class="sm-sse-hitbox-label">${hb.type} · ${hb.w}×${hb.h} @${hb.x},${hb.y}</span>
                    <button class="sm-sse-hitbox-del" data-hb-id="${hb.id}"><i class="fas fa-xmark"></i></button>
                `;
                row.querySelector('.sm-sse-hitbox-del').addEventListener('click', () => {
                    slice.hitboxes = slice.hitboxes.filter(h => h.id !== hb.id);
                    this._renderHitboxList(slice);
                    this.renderCanvas();
                });
                this.dom.hitboxList.appendChild(row);
            });
        }

        // ======================================================================
        // SLICE LIST
        // ======================================================================
        updateSlicesList() {
            if (!this.dom.sliceCount || !this.dom.sliceList) return;
            this.dom.sliceCount.textContent = this.slices.length;

            if (this.slices.length === 0) {
                this.dom.sliceList.innerHTML = '<div class="sm-sse-empty-hint">No slices yet. Use Auto Slice or Grid Slice.</div>';
                return;
            }

            this.dom.sliceList.innerHTML = '';
            this.slices.forEach((s, idx) => {
                const isPrimary = this.selectedSliceIds.size === 1 && this.selectedSliceIds.has(s.id);
                const isMulti = this.selectedSliceIds.size > 1 && this.selectedSliceIds.has(s.id);
                const cls = isPrimary ? 'active' : isMulti ? 'multi-selected' : '';

                const item = document.createElement('div');
                item.className = `sm-sse-slice-item ${cls}`;
                item.dataset.id = s.id;

                // Build thumbnail canvas
                const tc = document.createElement('canvas');
                tc.width = 28; tc.height = 20;
                tc.className = 'sm-sse-slice-thumb';
                if (this.sourceImage && s.width > 0 && s.height > 0) {
                    const tctx = tc.getContext('2d');
                    tctx.imageSmoothingEnabled = false;
                    const scale = Math.min(28 / s.width, 20 / s.height);
                    const dw = s.width * scale, dh = s.height * scale;
                    const dx = (28 - dw) / 2, dy = (20 - dh) / 2;
                    tctx.drawImage(this.sourceImage, s.x, s.y, s.width, s.height, dx, dy, dw, dh);
                }

                item.appendChild(tc);
                item.innerHTML += `
                    <span class="sm-sse-slice-idx">${idx + 1}</span>
                    <span class="sm-sse-slice-name" title="${s.name}">${s.name}</span>
                    <span class="sm-sse-slice-res">${s.width}×${s.height}</span>
                    <button type="button" class="sm-sse-delete-slice" title="Delete [Del]"><i class="fas fa-xmark"></i></button>
                `;

                item.addEventListener('click', (e) => {
                    if (e.target.closest('.sm-sse-delete-slice')) {
                        this._pushUndo();
                        this.slices = this.slices.filter(sl => sl.id !== s.id);
                        this.selectedSliceIds.delete(s.id);
                        this.updateSlicesList(); this.renderCanvas(); this.renderPreview();
                        this._updateMultiActions();
                        return;
                    }
                    if (e.ctrlKey || e.metaKey) {
                        if (this.selectedSliceIds.has(s.id)) this.selectedSliceIds.delete(s.id);
                        else this.selectedSliceIds.add(s.id);
                    } else if (e.shiftKey && this.selectedSliceIds.size > 0) {
                        const ids = this.slices.map(sl => sl.id);
                        const lastId = [...this.selectedSliceIds].pop();
                        const a = ids.indexOf(lastId), b = ids.indexOf(s.id);
                        const [lo, hi] = [Math.min(a, b), Math.max(a, b)];
                        for (let i = lo; i <= hi; i++) this.selectedSliceIds.add(ids[i]);
                    } else {
                        this.selectedSliceIds.clear();
                        this.selectedSliceIds.add(s.id);
                    }
                    this._syncInspector(); this.updateSlicesList(); this.renderCanvas(); this._updateMultiActions();
                });

                this.dom.sliceList.appendChild(item);
            });
        }

        // ======================================================================
        // CLIPS LIST
        // ======================================================================
        updateClipsList() {
            if (!this.dom.clipsList) return;
            if (this.clips.length === 0) {
                this.dom.clipsList.innerHTML = '<div class="sm-sse-empty-hint">No animation clips yet. Create slices first, then New Clip.</div>';
                this._updateClipThumbStrip();
                return;
            }

            this.dom.clipsList.innerHTML = '';
            this.clips.forEach(c => {
                const card = document.createElement('div');
                card.className = `sm-sse-clip-card ${c.id === this.activeClipId ? 'active' : ''}`;
                card.dataset.id = c.id;
                card.innerHTML = `
                    <div class="sm-sse-clip-head">
                        <strong><i class="fas fa-play" style="font-size:9px"></i> ${c.name}</strong>
                        <div style="display:flex;align-items:center;gap:6px">
                            <span style="font-size:10px;color:#64748b">${c.frameSliceIds.length} fr</span>
                            <label style="font-size:9.5px;color:#94a3b8">FPS:</label>
                            <input type="number" class="sm-sse-clip-fps-input" value="${c.fps || 12}" min="1" max="120" title="Clip FPS">
                            <button type="button" class="sm-sse-delete-slice" title="Delete Clip"><i class="fas fa-trash" style="font-size:9px"></i></button>
                        </div>
                    </div>
                    <div class="sm-sse-clip-body">
                        <label><input type="checkbox" class="sm-sse-clip-loop" ${c.loop ? 'checked' : ''}> Loop</label>
                        <label><input type="checkbox" class="sm-sse-clip-pp" ${c.pingPong ? 'checked' : ''}> Ping-Pong</label>
                    </div>
                `;
                card.addEventListener('click', (e) => {
                    if (e.target.closest('.sm-sse-delete-slice')) {
                        this.clips = this.clips.filter(cl => cl.id !== c.id);
                        if (this.activeClipId === c.id) this.activeClipId = this.clips[0]?.id || null;
                        this.updateClipsList(); this.renderPreview(); return;
                    }
                    if (e.target.matches('.sm-sse-clip-fps-input,.sm-sse-clip-loop,.sm-sse-clip-pp')) return;
                    this.activeClipId = c.id;
                    this.previewCurrentFrameIndex = 0;
                    this.updateClipsList(); this.renderPreview();
                });
                card.querySelector('.sm-sse-clip-fps-input').addEventListener('change', (e) => {
                    c.fps = Math.max(1, parseInt(e.target.value) || 12);
                    if (this.activeClipId === c.id) this.previewFPS = c.fps;
                });
                card.querySelector('.sm-sse-clip-loop').addEventListener('change', (e) => { c.loop = e.target.checked; });
                card.querySelector('.sm-sse-clip-pp').addEventListener('change', (e) => { c.pingPong = e.target.checked; });
                this.dom.clipsList.appendChild(card);
            });

            this._updateClipThumbStrip();
        }

        _updateClipThumbStrip() {
            if (!this.dom.thumbStrip) return;
            const clip = this.getActiveClip();
            if (!clip || !this.sourceImage) { this.dom.thumbStrip.innerHTML = ''; return; }

            this.dom.thumbStrip.innerHTML = '';
            clip.frameSliceIds.forEach((sid, fi) => {
                const slice = this.slices.find(s => s.id === sid);
                const wrapper = document.createElement('div');
                wrapper.className = `sm-sse-clip-frame-thumb ${fi === this.previewCurrentFrameIndex ? 'current' : ''}`;
                wrapper.title = slice ? `Frame ${fi + 1}: ${slice.name}` : `Frame ${fi + 1}`;

                const tc = document.createElement('canvas');
                tc.width = 32; tc.height = 32;
                wrapper.appendChild(tc);

                if (slice && this.sourceImage) {
                    const tctx = tc.getContext('2d');
                    tctx.imageSmoothingEnabled = false;
                    const sc = Math.min(32 / slice.width, 32 / slice.height);
                    const dw = slice.width * sc, dh = slice.height * sc;
                    tctx.drawImage(this.sourceImage, slice.x, slice.y, slice.width, slice.height, (32 - dw) / 2, (32 - dh) / 2, dw, dh);
                }
                wrapper.addEventListener('click', () => {
                    this.previewCurrentFrameIndex = fi;
                    this.previewPlaying = false;
                    this.dom.playToggle.innerHTML = '<i class="fas fa-play"></i>';
                    this._updateClipThumbStrip(); this.renderPreview();
                });
                this.dom.thumbStrip.appendChild(wrapper);
            });
        }

        // ======================================================================
        // PREVIEW PLAYER
        // ======================================================================
        getActiveClip() { return this.clips.find(c => c.id === this.activeClipId) || null; }

        togglePreviewPlay() {
            this.previewPlaying = !this.previewPlaying;
            this.dom.playToggle.innerHTML = this.previewPlaying ? '<i class="fas fa-pause"></i>' : '<i class="fas fa-play"></i>';
        }

        stepPreviewFrame(dir = 1) {
            const clip = this.getActiveClip();
            if (!clip || clip.frameSliceIds.length === 0) return;
            const count = clip.frameSliceIds.length;
            this.previewCurrentFrameIndex = (this.previewCurrentFrameIndex + dir + count) % count;
            this._updateClipThumbStrip(); this.renderPreview();
        }

        _previewLoop() {
            if (!this.isOpen) return;
            const now = performance.now();
            const delta = (now - (this._lastPreviewTime || now)) / 1000;
            this._lastPreviewTime = now;

            if (this.previewPlaying) {
                const clip = this.getActiveClip();
                if (clip && clip.frameSliceIds.length > 0) {
                    const clipFPS = clip.fps || this.previewFPS;
                    this.previewElapsed += delta;
                    const frameDuration = 1 / Math.max(1, clipFPS);

                    if (this.previewElapsed >= frameDuration) {
                        this.previewElapsed %= frameDuration;
                        this.previewCurrentFrameIndex += this.previewDirection;

                        if (this.previewCurrentFrameIndex >= clip.frameSliceIds.length) {
                            if (clip.pingPong) {
                                this.previewDirection = -1;
                                this.previewCurrentFrameIndex = Math.max(0, clip.frameSliceIds.length - 2);
                            } else if (clip.loop) {
                                this.previewCurrentFrameIndex = 0;
                            } else {
                                this.previewCurrentFrameIndex = clip.frameSliceIds.length - 1;
                                this.previewPlaying = false;
                                this.dom.playToggle.innerHTML = '<i class="fas fa-play"></i>';
                            }
                        } else if (this.previewCurrentFrameIndex < 0) {
                            this.previewDirection = 1;
                            this.previewCurrentFrameIndex = 0;
                        }

                        this.renderPreview();
                        this._updateClipThumbStrip();
                    }
                }
            }
            this._animRAF = requestAnimationFrame(this._previewLoop);
        }

        renderPreview() {
            if (!this.previewCtx) return;
            const ctx = this.previewCtx;
            const pw = this.dom.previewCanvas.width;
            const ph = this.dom.previewCanvas.height;

            ctx.clearRect(0, 0, pw, ph);
            this._drawCheckerboard(ctx, pw, ph);

            if (!this.sourceImage) return;
            const clip = this.getActiveClip();
            if (!clip || clip.frameSliceIds.length === 0) return;

            const frameIdx = Math.max(0, Math.min(this.previewCurrentFrameIndex, clip.frameSliceIds.length - 1));

            // Onion skin (previous frame ghost)
            if (this.onionSkinEnabled && frameIdx > 0) {
                const prevId = clip.frameSliceIds[frameIdx - 1];
                const prevSlice = this.slices.find(s => s.id === prevId);
                if (prevSlice) {
                    ctx.save(); ctx.globalAlpha = 0.25; ctx.imageSmoothingEnabled = false;
                    const sc = Math.min((pw - 8) / prevSlice.width, (ph - 8) / prevSlice.height, 8);
                    const dx = Math.round(pw / 2 - prevSlice.width * sc * prevSlice.pivot.x);
                    const dy = Math.round(ph / 2 - prevSlice.height * sc * prevSlice.pivot.y);
                    ctx.drawImage(this.sourceImage, prevSlice.x, prevSlice.y, prevSlice.width, prevSlice.height, dx, dy, prevSlice.width * sc, prevSlice.height * sc);
                    ctx.restore();
                }
            }

            const currentId = clip.frameSliceIds[frameIdx];
            const currentSlice = this.slices.find(s => s.id === currentId);
            if (!currentSlice) return;

            ctx.save(); ctx.imageSmoothingEnabled = false;
            const scale = Math.min((pw - 8) / currentSlice.width, (ph - 8) / currentSlice.height, 8);
            const drawX = Math.round(pw / 2 - currentSlice.width * scale * currentSlice.pivot.x);
            const drawY = Math.round(ph / 2 - currentSlice.height * scale * currentSlice.pivot.y);

            ctx.drawImage(
                this.sourceImage,
                currentSlice.x, currentSlice.y, currentSlice.width, currentSlice.height,
                drawX, drawY, currentSlice.width * scale, currentSlice.height * scale
            );

            // Pivot crosshair
            const pivCX = drawX + currentSlice.width * scale * currentSlice.pivot.x;
            const pivCY = drawY + currentSlice.height * scale * currentSlice.pivot.y;
            ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(pivCX - 10, pivCY); ctx.lineTo(pivCX + 10, pivCY);
            ctx.moveTo(pivCX, pivCY - 10); ctx.lineTo(pivCX, pivCY + 10);
            ctx.stroke();

            // Hitbox overlays in preview
            if (currentSlice.hitboxes?.length > 0) {
                currentSlice.hitboxes.forEach(hb => {
                    ctx.strokeStyle = hb.type === 'hitbox' ? 'rgba(248,113,113,0.8)' : 'rgba(52,211,153,0.8)';
                    ctx.fillStyle = hb.type === 'hitbox' ? 'rgba(248,113,113,0.15)' : 'rgba(52,211,153,0.15)';
                    ctx.lineWidth = 1;
                    ctx.fillRect(drawX + hb.x * scale, drawY + hb.y * scale, hb.w * scale, hb.h * scale);
                    ctx.strokeRect(drawX + hb.x * scale, drawY + hb.y * scale, hb.w * scale, hb.h * scale);
                });
            }

            // Frame info
            ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = '10px monospace'; ctx.textAlign = 'left';
            ctx.fillText(`${frameIdx + 1}/${clip.frameSliceIds.length}  ${currentSlice.width}×${currentSlice.height}px`, 4, ph - 4);

            ctx.restore();
        }

        // ======================================================================
        // EXPORT / IMPORT
        // ======================================================================
        async saveToAssets() {
            if (!this.sourceImage || this.imageWidth <= 0 || this.imageHeight <= 0) {
                showToast('Load an image before saving', 'warn');
                return null;
            }

            let assetManager = window.AssetsPanel;
            if (!assetManager) {
                await new Promise((resolve) => {
                    const timer = setTimeout(resolve, 2500);
                    window.addEventListener('sm-assets-panel-ready', () => {
                        clearTimeout(timer);
                        resolve();
                    }, { once: true });
                });
                assetManager = window.AssetsPanel;
            }
            if (!assetManager?.saveSpriteSheetAsset) {
                showToast('Assets Manager is not loaded yet. Reopen the editor after the panel finishes loading.', 'error');
                return null;
            }

            try {
                // Persist the exact sprite definition together with the
                // original binary source. Never replace the source with a
                // thumbnail or a canvas export.
                let sourceFile = this.sourceFile;
                if (!(sourceFile instanceof Blob)) {
                    try {
                        const response = await fetch(this.sourceURL);
                        if (response.ok) {
                            const blob = await response.blob();
                            sourceFile = new File(
                                [blob],
                                `${this.sourceFileName}.png`,
                                { type: blob.type || 'image/png', lastModified: Date.now() }
                            );
                        }
                    } catch (sourceError) {
                        console.warn('[SpriteSheetEditor] Could not reconstruct source File:', sourceError);
                    }
                }

                const spriteSheet = {
                    version: 1,
                    sourceAssetId: this.sourceAssetId || null,
                    sourceFileName: `${this.sourceFileName}.png`,
                    width: this.imageWidth,
                    height: this.imageHeight,
                    slices: JSON.parse(JSON.stringify(this.slices)),
                    clips: JSON.parse(JSON.stringify(this.clips)),
                    activeClipId: this.activeClipId || null
                };

                let asset = null;
                if (typeof assetManager.saveSpriteSheetAsset === 'function') {
                    try {
                        asset = await assetManager.saveSpriteSheetAsset({
                            id: this.sourceAssetId,
                            name: `${this.sourceFileName}.png`,
                            sourceURL: this.sourceURL,
                            sourceFile,
                            image: this.sourceImage,
                            width: this.imageWidth,
                            height: this.imageHeight,
                            slices: this.slices,
                            clips: this.clips,
                            activeClipId: this.activeClipId,
                            spriteSheet,
                        });
                    } catch (saveError) {
                        console.warn('[SpriteSheetEditor] saveSpriteSheetAsset failed; using direct persistence fallback:', saveError);
                        asset = null;
                    }
                }

                // Compatibility fallback for AssetsPanel builds that do not
                // expose saveSpriteSheetAsset: update the existing asset in
                // place so animations still survive the Save button.
                if (!asset && this.sourceAssetId && typeof assetManager._findById === 'function') {
                    asset = assetManager._findById(this.sourceAssetId);
                    if (asset) {
                        asset.spriteSheet = spriteSheet;
                        asset.isSpriteSheet = true;
                        asset.spriteSheetVersion = 1;
                        asset.spriteSheetUpdatedAt = Date.now();
                        if (sourceFile instanceof Blob && assetManager._getPersistentAssetStorage) {
                            try {
                                const storage = await assetManager._getPersistentAssetStorage();
                                if (storage?.saveImportedFile && storage?.createRuntimeURL) {
                                    const persisted = await Promise.race([
                                        storage.saveImportedFile(asset.id, sourceFile),
                                        new Promise(resolve => setTimeout(() => resolve(null), 7000))
                                    ]);
                                    if (persisted === null) throw new Error('Persistent source save timed out');
                                    asset.data = storage.createRuntimeURL(asset.id, sourceFile);
                                    asset.storageKind = 'indexeddb-blob';
                                    asset.storageKey = asset.id;
                                    asset.sourceSize = Number(sourceFile.size || 0);
                                    asset.sourceMimeType = sourceFile.type || 'image/png';
                                }
                            } catch (persistError) {
                                console.warn('[SpriteSheetEditor] Direct source persistence fallback failed:', persistError);
                            }
                        }
                        assetManager._commitAssetVersion?.(asset.id, 'Sprite Sheet Studio');
                        assetManager._saveToStorage?.();
                        assetManager._syncRuntimeAssetRegistry?.();
                        assetManager.onAssetUpdate?.(asset.id, asset);
                        assetManager.render?.();
                        window.dispatchEvent(new CustomEvent('sm:sprite-sheet-saved', {
                            detail: { assetId: asset.id, asset, spriteSheet }
                        }));
                    }
                }
                if (!asset) throw new Error('AssetsPanel could not save the sprite sheet asset.');

                this.sourceAssetId = asset?.id || this.sourceAssetId;
                this.isDirty = false;
                showToast(`Saved to Assets Manager: ${asset?.name || this.sourceFileName}`, 'success');
                return asset;
            } catch (error) {
                console.error('[SpriteSheetEditor] Save failed:', error);
                showToast(`Save failed: ${error.message || error}`, 'error');
                return null;
            }
        }

        exportJSON() {
            if (this.slices.length === 0) { showToast('No slices to export', 'warn'); return; }
            const exportData = {
                generator: 'SM Engine SpriteSheet Studio v3.0',
                version: '3.0',
                image: `${this.sourceFileName}.png`,
                size: { width: this.imageWidth, height: this.imageHeight },
                frames: this.slices.map(s => ({
                    filename: s.name,
                    frame: { x: s.x, y: s.y, w: s.width, h: s.height },
                    pivot: s.pivot,
                    layer2D: s.layer2D || 'midground',
                    hitboxes: s.hitboxes || [],
                    nineSlice: s.nineSlice || null
                })),
                animations: this.clips.map(c => ({
                    name: c.name, fps: c.fps || 12, loop: c.loop, pingPong: c.pingPong,
                    frames: c.frameSliceIds.map(id => {
                        const sl = this.slices.find(s => s.id === id);
                        return { name: sl ? sl.name : id, duration: c.frameDurations?.[id] || null };
                    })
                }))
            };
            const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = `${this.sourceFileName}_atlas.json`;
            a.click(); URL.revokeObjectURL(url);
            showToast(`Exported: ${this.sourceFileName}_atlas.json`, 'success');
        }

        exportAtlasPNG() {
            if (!this.sourceImage || this.slices.length === 0) { showToast('Load an image and create slices first', 'warn'); return; }
            const canvas = document.createElement('canvas');
            canvas.width = this.imageWidth;
            canvas.height = this.imageHeight;
            const ctx = canvas.getContext('2d');
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(this.sourceImage, 0, 0);
            canvas.toBlob((blob) => {
                if (!blob) { showToast('PNG export failed', 'error'); return; }
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = `${this.sourceFileName}_atlas.png`;
                a.click(); URL.revokeObjectURL(url);
                showToast(`Exported: ${this.sourceFileName}_atlas.png`, 'success');
            }, 'image/png');
        }

        importJSON(file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = JSON.parse(e.target.result);
                    if (!data.frames) throw new Error('Not a valid SM Engine atlas JSON');
                    this._pushUndo();

                    const framesMap = {};
                    this.slices = data.frames.map((f, i) => {
                        const slice = {
                            id: `slice_imported_${i}_${Date.now()}`,
                            name: f.filename || f.name || `frame_${i}`,
                            x: f.frame.x, y: f.frame.y, width: f.frame.w, height: f.frame.h,
                            pivot: f.pivot || { x: 0.5, y: 1.0 },
                            hitboxes: f.hitboxes || [],
                            nineSlice: f.nineSlice || null,
                            layer2D: f.layer2D || 'midground'
                        };
                        framesMap[slice.name] = slice.id;
                        return slice;
                    });

                    if (data.size) {
                        this.imageWidth = data.size.width;
                        this.imageHeight = data.size.height;
                        if (this.dom.hudDimensions) this.dom.hudDimensions.textContent = `${this.imageWidth} × ${this.imageHeight} px`;
                    }

                    this.clips = (data.animations || []).map((anim, i) => ({
                        id: `clip_imported_${i}_${Date.now()}`,
                        name: anim.name || `anim_${i}`,
                        fps: anim.fps || 12,
                        loop: anim.loop !== false,
                        pingPong: anim.pingPong || false,
                        frameSliceIds: (anim.frames || []).map(f => framesMap[f.name || f] || null).filter(Boolean),
                        frameDurations: {}
                    }));

                    this.activeClipId = this.clips[0]?.id || null;
                    this.updateSlicesList(); this.updateClipsList();
                    this.renderCanvas(); this.renderPreview();
                    showToast(`Imported: ${this.slices.length} frames, ${this.clips.length} animations`, 'success');
                } catch (err) {
                    showToast(`Import failed: ${err.message}`, 'error');
                }
            };
            reader.readAsText(file);
        }

        // ======================================================================
        // SPAWN INTO SCENE
        // ======================================================================
        spawnIntoScene() {
            if (this.slices.length === 0 || !this.sourceImage) {
                showToast(
                    'Slice the sprite sheet before adding to scene',
                    'warn'
                );
                return;
            }

            if (typeof THREE === 'undefined') {
                showToast('THREE.js not available', 'error');
                return;
            }

            const scene = window.scene;

            if (!scene) {
                showToast('No active scene found', 'error');
                return;
            }

            // ============================================================
            // 1. Create a real canvas containing the complete sprite sheet
            // ============================================================

            const offscreen = document.createElement('canvas');

            offscreen.width = this.imageWidth;
            offscreen.height = this.imageHeight;

            const octx = offscreen.getContext('2d');

            octx.clearRect(
                0,
                0,
                this.imageWidth,
                this.imageHeight
            );

            octx.drawImage(
                this.sourceImage,
                0,
                0
            );

            // ============================================================
            // 2. Create THREE texture
            // ============================================================

            const texture = new THREE.CanvasTexture(offscreen);

            texture.magFilter = THREE.NearestFilter;
            texture.minFilter = THREE.NearestFilter;
            texture.generateMipmaps = false;
            texture.needsUpdate = true;

            // ============================================================
            // 3. Create geometry using first frame dimensions
            // ============================================================

            const firstSlice = this.slices[0];

            const aspect =
                firstSlice.width / firstSlice.height;

            const geo = new THREE.PlaneGeometry(
                2 * aspect,
                2
            );

            // ============================================================
            // 4. Apply first frame UV
            // ============================================================

            const uvs = geo.attributes.uv;

            const u0 =
                firstSlice.x / this.imageWidth;

            const v0 =
                1 -
                (firstSlice.y + firstSlice.height) /
                this.imageHeight;

            const u1 =
                (firstSlice.x + firstSlice.width) /
                this.imageWidth;

            const v1 =
                1 -
                firstSlice.y /
                this.imageHeight;

            uvs.setXY(0, u0, v1);
            uvs.setXY(1, u1, v1);
            uvs.setXY(2, u0, v0);
            uvs.setXY(3, u1, v0);

            uvs.needsUpdate = true;

            // ============================================================
            // 5. Material
            // ============================================================

            const mat = new THREE.MeshBasicMaterial({
                map: texture,
                transparent: true,
                side: THREE.DoubleSide
            });

            // ============================================================
            // 6. Mesh
            // ============================================================

            const mesh = new THREE.Mesh(
                geo,
                mat
            );

            mesh.name =
                `Sprite_${this.sourceFileName}`;

            mesh.position.set(
                0,
                1,
                0
            );

            // ============================================================
            // 7. Runtime animation data
            // ============================================================

            const slices =
                JSON.parse(
                    JSON.stringify(this.slices)
                );

            const clips =
                JSON.parse(
                    JSON.stringify(this.clips)
                );

            mesh.userData = {

                // Sprite identification
                is2DSprite: true,
                sourceAssetId: this.sourceAssetId || null,

                // Sprite sheet information
                spriteSheet: this.sourceFileName,

                // IMPORTANT:
                // SM2DGameRuntime expects this object
                spriteSheetSize: {
                    width: this.imageWidth,
                    height: this.imageHeight
                },

                // Keep these too for compatibility
                imageWidth: this.imageWidth,
                imageHeight: this.imageHeight,

                // Sprite frames
                slices: slices,

                // Animation clips
                clips: clips,

                // Runtime state
                sprite2D: {
                    frameIndex: 0,
                    frameElapsed: 0,
                    playing: true,

                    activeClipId:
                        this.activeClipId ||
                        clips[0]?.id ||
                        null,

                    pixelsPerUnit: 64,
                    depth: 0
                }
            };

            // ============================================================
            // 8. Add to scene
            // ============================================================

            scene.add(mesh);

            window.selectedObject = mesh;

            window.updateHierarchy?.();

            showToast(
                `Sprite added to scene: ${mesh.name}`,
                'success'
            );

            this.close();
        }
    }

    // =====================================================================
    // GLOBAL REGISTRATION
    // =====================================================================
    root.SMSpriteSheetEditor = SMSpriteSheetEditor;
    root.smSpriteSheetEditor = root.smSpriteSheetEditor || new SMSpriteSheetEditor();

    root.openSpriteSheetEditor = function (imageSrc = null, name = 'spritesheet') {
        root.smSpriteSheetEditor.open(imageSrc, name);
    };

    console.log('✅ [SMSpriteSheetEditor v3.1] Professional sprite sheet studio loaded.');

})(window);
