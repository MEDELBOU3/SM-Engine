/**
 * SM Engine — 2D Animation Workspace Layout Controller
 * ----------------------------------------------------
 * UI ownership after the refactor:
 *   - Viewport: mode bar + compact drawing toolbar + brush asset shelf
 *   - Right side: contextual 2D properties (Tool/Layers/Onion/Camera/Light/Bridge/FX)
 *   - Bottom: the existing TimelinePanel (single shared Dope Sheet/Graph editor)
 *
 * IMPORTANT: this file intentionally does NOT create a second Dope Sheet.
 */
(function () {
    'use strict';

    const STYLE_ID = 'sm-anime2d-workspace-v2-style';
    const $ = (id) => document.getElementById(id);
    const clamp = (v, min, max) => Math.max(min, Math.min(max, Number(v)));

    class Anime2DWorkspace {
        constructor() {
            this.active = false;
            this.mode = 'draw';
            this.root = null;
            this.brushShelf = null;
            this.rightPanel = null;
            this.syncTimer = null;
            this._bound = false;
            this._observer = null;
            this._scheduled = false;
            this._lastBrushSignature = '';
            this._lastLayerSignature = '';
            this._savedRightHTML = null;
            this._savedRightDisplay = '';
            this._rightMounted = false;
            this._workspaceGuardBound = false;
        }

        get manager() {
            return window.animation2DManager ||
                window.animation2DManagerAdvanced ||
                window.ensureAnimation2DManager?.() ||
                null;
        }

        init() {
            this.injectStyles();
            this.ensureStaticUI();
            this.bindEvents();
            this.bindWorkspaceExitGuard();
            this.wrapWorkspaceLifecycle();
            this.observeModeClass();
            this.setActive(document.body.classList.contains('animation-2d-mode-active'));

            window.addEventListener('timeUpdate', () => this.sync(false));
            window.addEventListener('animation2d:keyframe-recorded', () => this.sync(true));
            window.addEventListener('sm:timeline-panel-ready', () => {
                this.ensureTimelineBrushPanel();
                this.syncTimelineContext();
                this.renderBrushShelf(null, true);
            });
            window.addEventListener('resize', () => {
                this.ensureStaticUI();
                if (this.active) this.mountRightPanel();
                this.sync(true);
            });
            return this;
        }

        injectStyles() {
            if ($(STYLE_ID)) return;
            const style = document.createElement('style');
            style.id = STYLE_ID;
            style.textContent = `
                :root {
                    --a2w-bg: var(--primary-dark, #333333);
                    --a2w-bg-2: var(--secondary-dark, #3c3c3c);
                    --a2w-bg-3: #282828;
                    --a2w-panel: #303030;
                    --a2w-border: var(--border-color, rgba(255,255,255,.10));
                    --a2w-text: var(--text-primary, #e5e5e5);
                    --a2w-muted: var(--text-secondary, #a8a8a8);
                    --a2w-accent: #5d8cff;
                    --a2w-danger: #d66a6a;
                    --a2w-shelf-height: 66px;
                }

                /* hidden= must beat the component's own display:flex rules. */
                .a2w-topbar[hidden],
                .a2w-brush-shelf[hidden] {
                    display: none !important;
                }

                /* Hard isolation: these workspace surfaces can only exist visually
                   while the real 2D mode class is active. */
                body:not(.animation-2d-mode-active) #a2w-topbar,
                body:not(.animation-2d-mode-active) #a2w-brush-shelf,
                body:not(.animation-2d-mode-active) #animation-2d-toolbar,
                body:not(.animation-2d-mode-active) #animation-2d-container {
                    display: none !important;
                }

                body.animation-2d-mode-active #renderer-container {
                    position: relative !important;
                }

                body.animation-2d-mode-active #animation-2d-container {
    position: absolute !important;
    inset: 0 !important;
    width: 100% !important;
    height: 100% !important;
    z-index: 500 !important;
    pointer-events: auto !important;
}

                body.animation-2d-mode-active #animation-2d-canvas {
    position: absolute !important;
    inset: 0 !important;
    width: 100% !important;
    height: 100% !important;
    display: block !important;
    touch-action: none !important;
    pointer-events: auto !important;
    z-index: 1000 !important;   /* ← ← ← زيدها */
    cursor: crosshair;
}

                body.animation-2d-mode-active #animation-2d-toolbar {
                    display: flex !important;
                    position: absolute !important;
                    left: 8px !important;
                    top: 48px !important;
                    bottom: auto !important;
                    width: 38px !important;
                    max-height: calc(100% - 130px) !important;
                    overflow-y: auto !important;
                    overflow-x: hidden !important;
                    z-index: 510 !important;
                    flex-direction: column !important;
                    align-items: center !important;
                    gap: 2px !important;
                    padding: 5px 3px !important;
                    background: rgba(38,38,38,.95) !important;
                    border: 1px solid var(--a2w-border) !important;
                    box-shadow: 0 8px 22px rgba(0,0,0,.23) !important;
                    pointer-events: auto !important;
                }

                body.animation-2d-mode-active #animation-2d-toolbar .d2-toolbar-label {
                    display: none !important;
                }

                body.animation-2d-mode-active #animation-2d-toolbar .animation-2d-toolbar-sep {
                    width: 26px !important;
                    margin: 3px 0 !important;
                    border: 0 !important;
                    border-top: 1px solid var(--a2w-border) !important;
                }

                body.animation-2d-mode-active #animation-2d-toolbar .st-btn {
                    width: 30px !important;
                    height: 30px !important;
                    min-width: 30px !important;
                    display: grid !important;
                    place-items: center !important;
                    margin: 0 !important;
                    padding: 0 !important;
                    border: 0 !important;
                    border-radius: 2px !important;
                    background: transparent !important;
                    color: #c9c9c9 !important;
                }

                body.animation-2d-mode-active #animation-2d-toolbar .st-btn:hover {
                    background: #4a4a4a !important;
                    color: #fff !important;
                }

                body.animation-2d-mode-active #animation-2d-toolbar .st-btn.active {
                    background: #5579ad !important;
                    color: #fff !important;
                }

                .a2w-topbar {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    min-width: 0;
                    height: 32px;
                    color: var(--a2w-text);
                    font: 11px/1.2 "Segoe UI", Inter, sans-serif;
                }

                .a2w-mode-group,
                .a2w-inline-group {
                    display: flex;
                    align-items: center;
                    background: #292929;
                    border: 1px solid var(--a2w-border);
                }

                .a2w-mode-btn,
                .a2w-menu-btn,
                .a2w-icon-btn {
                    height: 26px;
                    border: 0;
                    border-right: 1px solid rgba(255,255,255,.045);
                    background: transparent;
                    color: var(--a2w-muted);
                    font: 11px "Segoe UI", sans-serif;
                    padding: 0 8px;
                    cursor: pointer;
                    white-space: nowrap;
                }

                .a2w-icon-btn {
                    width: 28px;
                    padding: 0;
                    display: grid;
                    place-items: center;
                }

                .a2w-mode-btn:hover,
                .a2w-menu-btn:hover,
                .a2w-icon-btn:hover {
                    background: #494949;
                    color: #fff;
                }

                .a2w-mode-btn.active {
                    background: #505050;
                    color: #fff;
                    box-shadow: inset 0 -2px 0 var(--a2w-accent);
                }

                .a2w-icon-btn.active {
                    background: #46566b;
                    color: #fff;
                }

                .a2w-icon-btn .material-icons-outlined {
                    font-size: 17px;
                }

                .a2w-spacer { flex: 1; min-width: 4px; }
                .a2w-divider { width: 1px; height: 20px; background: var(--a2w-border); margin: 0 2px; }

                .a2w-field {
                    height: 24px;
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    padding: 0 5px;
                    background: #2b2b2b;
                    border: 1px solid var(--a2w-border);
                    color: #c7c7c7;
                }

                .a2w-field input[type="range"] { width: 72px; }
                .a2w-number {
                    width: 42px;
                    background: #242424;
                    border: 0;
                    color: #ddd;
                    text-align: center;
                    outline: none;
                }

                .a2w-brush-shelf {
                    position: absolute;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    height: var(--a2w-shelf-height);
                    z-index: 505;
                    display: flex;
                    flex-direction: column;
                    background: rgba(42,42,42,.98);
                    border-top: 1px solid var(--a2w-border);
                    pointer-events: auto;
                    color: var(--a2w-text);
                    font: 11px "Segoe UI", sans-serif;
                }

                .a2w-shelf-head {
                    height: 24px;
                    display: flex;
                    align-items: center;
                    padding: 0 8px;
                    gap: 2px;
                    background: #303030;
                    border-bottom: 1px solid var(--a2w-border);
                }

                .a2w-shelf-tab {
                    height: 21px;
                    border: 0;
                    background: transparent;
                    color: #aaa;
                    padding: 0 10px;
                    cursor: pointer;
                    font-size: 10px;
                }

                .a2w-shelf-tab:hover { color: #fff; background: #444; }
                .a2w-shelf-tab.active { color: #fff; background: #505050; }

                .a2w-shelf-scroll {
                    flex: 1;
                    display: flex;
                    align-items: center;
                    gap: 5px;
                    padding: 3px 8px;
                    overflow-x: auto;
                    overflow-y: hidden;
                    scrollbar-width: thin;
                }

                .a2w-brush-card {
                    height: 34px;
                    min-width: 54px;
                    max-width: 76px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 5px;
                    border: 1px solid transparent;
                    background: #383838;
                    color: #bfbfbf;
                    cursor: pointer;
                    padding: 0 7px;
                }

                .a2w-brush-card:hover { background: #484848; color: #fff; }
                .a2w-brush-card.active { border-color: #7898c4; background: #465263; color: #fff; }
                .a2w-brush-glyph { font-size: 15px; font-weight: 700; }
                .a2w-brush-name { font-size: 9px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

                .a2w-right {
                    height: 100%;
                    display: flex;
                    min-height: 0;
                    background: var(--a2w-bg);
                    color: var(--a2w-text);
                    font: 11px "Segoe UI", sans-serif;
                }

                .a2w-right-tabs {
                    flex: 0 0 38px;
                    width: 38px;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 2px;
                    padding: 5px 3px;
                    background: #292929;
                    border-right: 1px solid var(--a2w-border);
                }

                .a2w-right-tab {
                    width: 31px;
                    height: 31px;
                    border: 0;
                    background: transparent;
                    color: #9c9c9c;
                    cursor: pointer;
                    display: grid;
                    place-items: center;
                    border-radius: 2px;
                }

                .a2w-right-tab:hover { color: #fff; background: #404040; }
                .a2w-right-tab.active { color: #fff; background: #46566b; box-shadow: inset 2px 0 0 var(--a2w-accent); }
                .a2w-right-tab .material-icons-outlined { font-size: 18px; }

                .a2w-right-main { flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; }
                .a2w-right-title {
                    height: 31px;
                    flex: 0 0 31px;
                    display: flex;
                    align-items: center;
                    padding: 0 9px;
                    background: #303030;
                    border-bottom: 1px solid var(--a2w-border);
                    font-weight: 700;
                    letter-spacing: .04em;
                    text-transform: uppercase;
                    font-size: 9px;
                    color: #c7c7c7;
                }
                .a2w-right-scroll { flex: 1; min-height: 0; overflow: auto; padding-bottom: 10px; }

                .a2w-page[hidden] { display: none !important; }
                .a2w-section { border-bottom: 1px solid var(--a2w-border); }
                .a2w-section-head {
                    min-height: 28px;
                    display: flex;
                    align-items: center;
                    gap: 5px;
                    padding: 0 8px;
                    background: #363636;
                    font-weight: 600;
                    color: #d4d4d4;
                }
                .a2w-section-head .material-icons-outlined { font-size: 15px; color: #aaa; }
                .a2w-section-body { padding: 8px; display: flex; flex-direction: column; gap: 7px; }

                .a2w-prop {
                    display: grid;
                    grid-template-columns: 74px minmax(0, 1fr) 42px;
                    gap: 6px;
                    align-items: center;
                    color: #bdbdbd;
                }
                .a2w-prop.compact { grid-template-columns: 74px minmax(0, 1fr); }
                .a2w-prop input[type="range"] { width: 100%; min-width: 0; }
                .a2w-prop output,
                .a2w-prop input[type="number"],
                .a2w-prop select {
                    height: 22px;
                    box-sizing: border-box;
                    background: #272727;
                    border: 1px solid #444;
                    color: #ddd;
                    font-size: 10px;
                }
                .a2w-prop output { display: grid; place-items: center; }
                .a2w-prop input[type="number"] { width: 100%; padding: 0 4px; }
                .a2w-prop select { width: 100%; }

                .a2w-check { display: flex; align-items: center; justify-content: space-between; gap: 10px; color: #c7c7c7; }
                .a2w-check input { accent-color: var(--a2w-accent); }
                .a2w-row { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; }

                .a2w-btn {
                    min-height: 25px;
                    border: 1px solid #474747;
                    background: #333;
                    color: #ccc;
                    padding: 0 8px;
                    cursor: pointer;
                    font-size: 10px;
                }
                .a2w-btn:hover { background: #4a4a4a; color: #fff; }
                .a2w-btn.primary { border-color: rgba(93,140,255,.45); background: rgba(93,140,255,.16); color: #dbe6ff; }
                .a2w-btn.danger:hover { border-color: rgba(214,106,106,.45); color: #ffd0d0; background: rgba(214,106,106,.12); }
                .a2w-btn.block { width: 100%; }

                .a2w-asset-preview {
                    min-height: 60px;
                    display: flex;
                    align-items: center;
                    gap: 9px;
                    background: #292929;
                    border: 1px solid #444;
                    padding: 7px;
                }
                .a2w-asset-icon {
                    width: 44px;
                    height: 44px;
                    display: grid;
                    place-items: center;
                    background: #b8b8b8;
                    color: #555;
                    font-size: 20px;
                    font-weight: 700;
                }
                .a2w-asset-meta strong { display: block; font-size: 11px; color: #fff; }
                .a2w-asset-meta span { font-size: 9px; color: #929292; }

                .a2w-layer-list { display: flex; flex-direction: column; border: 1px solid #444; background: #292929; max-height: 230px; overflow: auto; }
                .a2w-layer-row {
                    height: 28px;
                    display: grid;
                    grid-template-columns: 25px 22px 1fr 25px;
                    align-items: center;
                    border-bottom: 1px solid rgba(255,255,255,.045);
                    cursor: pointer;
                }
                .a2w-layer-row.active { background: #465466; }
                .a2w-layer-row button { height: 26px; border: 0; background: transparent; color: #bbb; cursor: pointer; }
                .a2w-layer-row button:hover { color: #fff; background: #4b4b4b; }
                .a2w-layer-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

                .a2w-note {
                    padding: 7px;
                    border: 1px solid rgba(255,255,255,.07);
                    background: rgba(255,255,255,.025);
                    color: #969696;
                    font-size: 9px;
                    line-height: 1.45;
                }

                .a2w-hidden-input { display: none !important; }

                /* The 2D brush shelf belongs to the shared TimelinePanel. */
                #a2w-brush-shelf { display: none !important; }
                #a2w-timeline-brush-panel {
                    display: none;
                    flex: 0 0 auto;
                    width: 100%;
                    min-height: 64px;
                    box-sizing: border-box;
                    position: relative;
                    z-index: 70;
                    background: #343434;
                    border-bottom: 1px solid rgba(255,255,255,.09);
                    color: #ddd;
                    font: 10px/1.2 "Segoe UI", Inter, sans-serif;
                    pointer-events: auto;
                }
                #a2w-timeline-brush-panel[hidden] { display: none !important; }
                body.animation-2d-mode-active #a2w-timeline-brush-panel {
                    display: flex;
                    flex-direction: column;
                }
                #a2w-timeline-brush-panel .a2w-timeline-brush-head {
                    height: 27px;
                    min-height: 27px;
                    display: flex;
                    align-items: center;
                    gap: 3px;
                    padding: 0 7px;
                    background: #3a3a3a;
                    border-bottom: 1px solid rgba(255,255,255,.08);
                }
                #a2w-timeline-brush-panel .a2w-timeline-brush-title {
                    display: inline-flex;
                    align-items: center;
                    gap: 5px;
                    margin-right: 5px;
                    color: #e4e4e4;
                    font-size: 9px;
                    font-weight: 600;
                }
                #a2w-timeline-brush-panel .brush-shelf-tab {
                    height: 21px;
                    min-width: 42px;
                    padding: 0 8px;
                    border: 0;
                    border-radius: 4px;
                    background: transparent;
                    color: #999;
                    cursor: pointer;
                    font: 8.5px "Segoe UI", sans-serif;
                }
                #a2w-timeline-brush-panel .brush-shelf-tab:hover {
                    background: rgba(255,255,255,.06);
                    color: #eee;
                }
                #a2w-timeline-brush-panel .brush-shelf-tab.active {
                    background: #505050;
                    color: #fff;
                }
                #a2w-timeline-brush-panel .a2w-timeline-brush-spacer { flex: 1 1 auto; }
                #a2w-timeline-brush-panel .a2w-timeline-brush-status {
                    color: #777;
                    font-size: 8px;
                    margin-right: 5px;
                }
                #a2w-timeline-brush-panel .a2w-timeline-brush-list {
                    height: 37px;
                    min-height: 37px;
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    padding: 3px 7px;
                    overflow-x: auto;
                    overflow-y: hidden;
                    scrollbar-width: thin;
                }
                #a2w-timeline-brush-panel .a2w-brush-card {
                    flex: 0 0 54px;
                    width: 54px;
                    height: 30px;
                    min-height: 30px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 4px;
                    padding: 0 5px;
                    border: 1px solid transparent;
                    border-radius: 5px;
                    background: #2d2d2d;
                    color: #aaa;
                    cursor: pointer;
                    overflow: hidden;
                }
                #a2w-timeline-brush-panel .a2w-brush-card:hover {
                    background: #444;
                    color: #fff;
                }
                #a2w-timeline-brush-panel .a2w-brush-card.active {
                    background: #505b68;
                    border-color: #7898c4;
                    color: #fff;
                }
                #a2w-timeline-brush-panel .a2w-brush-glyph { font-size: 9px; font-weight: 700; }
                #a2w-timeline-brush-panel .a2w-brush-name {
                    max-width: 38px;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                    font-size: 7.5px;
                }
                #a2w-timeline-brush-panel .a2w-timeline-brush-actions {
                    display: inline-flex;
                    align-items: center;
                    gap: 3px;
                }
                #a2w-timeline-brush-panel .a2w-timeline-brush-action {
                    width: 25px;
                    height: 22px;
                    padding: 0;
                    border: 0;
                    border-radius: 4px;
                    background: transparent;
                    color: #999;
                    cursor: pointer;
                }
                #a2w-timeline-brush-panel .a2w-timeline-brush-action:hover {
                    background: rgba(255,255,255,.07);
                    color: #fff;
                }
                #a2pro-dopesheet { display: none !important; }

                @media (max-width: 1200px) {
                    .a2w-field.optional { display: none; }
                    .a2w-mode-btn { padding: 0 6px; }
                }
            `;
            document.head.appendChild(style);
        }

        ensureStaticUI() {
            this.ensureHeader();
            this.ensureBrushShelf();
            this.ensureTimelineBrushPanel();
        }

        ensureHeader() {
            const viewport = $('renderer-container');
            const panelHeader = document.querySelector('.sm-viewport-panel.active .sm-panel-header') ||
                document.querySelector('.sm-viewport-panel .sm-panel-header');
            let root = $('a2w-topbar');

            if (!root && (panelHeader || viewport)) {
                (panelHeader || viewport).insertAdjacentHTML('beforeend', this.headerHTML());
                root = $('a2w-topbar');
            }

            if (root && panelHeader && root.parentElement !== panelHeader) {
                const right = panelHeader.querySelector('.sm-panel-header-right');
                panelHeader.insertBefore(root, right || null);
            }

            this.root = root;
            if (root) root.hidden = !this.active;
        }

        headerHTML() {
            return `
                <div id="a2w-topbar" class="a2w-topbar" hidden>
                    <div class="a2w-mode-group" role="group" aria-label="2D animation modes">
                        <button class="a2w-mode-btn active" data-a2-mode="draw">Draw</button>
                        <button class="a2w-mode-btn" data-a2-mode="edit">Edit</button>
                        <button class="a2w-mode-btn" data-a2-mode="camera">Camera</button>
                        <button class="a2w-mode-btn" data-a2-mode="storyboard">Storyboard</button>
                    </div>
                    <div class="a2w-divider"></div>
                    <button class="a2w-menu-btn" data-a2-action="view-menu">View</button>
                    <button class="a2w-menu-btn" data-a2-action="draw-menu">Draw</button>
                    <div class="a2w-divider"></div>
                    <label class="a2w-field optional"><span>Origin</span><select id="a2w-origin" style="background:#2b2b2b;color:#ddd;border:0"><option>Origin</option><option>Cursor</option><option>Center</option></select></label>
                    <label class="a2w-field optional"><span>Placement</span><select id="a2w-placement" style="background:#2b2b2b;color:#ddd;border:0"><option>Front (X-Z)</option><option>View</option><option>Surface</option></select></label>
                    <div class="a2w-spacer"></div>
                    <button class="a2w-icon-btn" data-a2-action="undo" title="Undo"><span class="material-icons-outlined">undo</span></button>
                    <button class="a2w-icon-btn" data-a2-action="redo" title="Redo"><span class="material-icons-outlined">redo</span></button>
                    <div class="a2w-divider"></div>
                    <button class="a2w-icon-btn active" data-a2-action="onion" title="Onion Skin"><span class="material-icons-outlined">filter_none</span></button>
                    <button class="a2w-icon-btn" data-a2-action="underlay" title="3D Underlay"><span class="material-icons-outlined">view_in_ar</span></button>
                    <label class="a2w-field"><span>Radius</span><input id="a2w-header-radius" type="range" min="1" max="120" value="12"><input id="a2w-header-radius-num" class="a2w-number" type="number" min="1" max="120" value="12"></label>
                    <label class="a2w-field"><span>Strength</span><input id="a2w-header-strength" type="range" min="0" max="1" step="0.01" value="0.7"><input id="a2w-header-strength-num" class="a2w-number" type="number" min="0" max="1" step="0.01" value="0.7"></label>
                </div>`;
        }

        ensureBrushShelf() {
            // Compatibility only: the old viewport-bottom shelf is intentionally
            // no longer rendered. The real brush shelf now lives in TimelinePanel.
            const oldShelf = $('a2w-brush-shelf');
            if (oldShelf) oldShelf.hidden = true;
        }

        ensureTimelineBrushPanel() {
            const timeline = $('timelineBody');
            if (!timeline) return null;

            let panel = $('a2w-timeline-brush-panel');
            if (!panel) {
                panel = document.createElement('section');
                panel.id = 'a2w-timeline-brush-panel';
                panel.innerHTML = `
                    <div class="a2w-timeline-brush-head">
                        <span class="a2w-timeline-brush-title">Brush</span>
                        <button class="brush-shelf-tab active" data-brush-filter="all" data-a2-brush-filter="all">All</button>
                        <button class="brush-shelf-tab" data-brush-filter="draw" data-a2-brush-filter="draw">Ink</button>
                        <button class="brush-shelf-tab" data-brush-filter="erase" data-a2-brush-filter="erase">Erase</button>
                        <button class="brush-shelf-tab" data-brush-filter="lighting" data-a2-brush-filter="lighting">FX</button>
                        <button class="brush-shelf-tab" data-brush-filter="utility" data-a2-brush-filter="utility">Utils</button>
                        <span class="a2w-timeline-brush-spacer"></span>
                        <span class="a2w-timeline-brush-status" id="a2w-timeline-brush-status">HB</span>
                        <div class="a2w-timeline-brush-actions">
                            <button class="a2w-timeline-brush-action" data-a2-action="brush-settings" title="Tool Properties">⚙</button>
                        </div>
                    </div>
                    <div id="brush-shelf-strip" class="a2w-timeline-brush-list"></div>`;

                const commandbar = timeline.querySelector('.sm-timeline-commandbar');
                const controls = timeline.querySelector('#timeline-controls-wrapper');
                if (commandbar) commandbar.insertAdjacentElement('afterend', panel);
                else if (controls) timeline.insertBefore(panel, controls);
                else timeline.appendChild(panel);
            } else if (panel.parentElement !== timeline) {
                timeline.appendChild(panel);
            }

            // The manager's legacy API expects these exact IDs/classes. Keep them
            // as compatibility aliases while Workspace owns the delegated events.
            this.brushShelf = panel;
            return panel;
        }

        mountRightPanel() {
            const panel = $('panel-2d-right');
            if (!panel) return;

            if (!this._rightMounted) {
                this._savedRightHTML = panel.innerHTML;
                this._savedRightDisplay = panel.style.display;
                panel.innerHTML = this.rightPanelHTML();
                this._rightMounted = true;
            }

            this.rightPanel = panel;
            panel.style.display = 'block';
            this.setRightTab('tool');
        }

        unmountRightPanel() {
            if (!this._rightMounted) return;
            const panel = $('panel-2d-right');
            if (!panel) return;
            panel.innerHTML = this._savedRightHTML ?? '';
            panel.style.display = this._savedRightDisplay || '';
            this._rightMounted = false;
            this.rightPanel = null;
        }

        rightPanelHTML() {
            return `
                <div id="a2w-right" class="a2w-right">
                    <nav class="a2w-right-tabs" aria-label="2D properties">
                        <button class="a2w-right-tab active" data-a2-right-tab="tool" title="Tool"><span class="material-icons-outlined">brush</span></button>
                        <button class="a2w-right-tab" data-a2-right-tab="layers" title="Layers"><span class="material-icons-outlined">layers</span></button>
                        <button class="a2w-right-tab" data-a2-right-tab="onion" title="Onion Skin"><span class="material-icons-outlined">filter_none</span></button>
                        <button class="a2w-right-tab" data-a2-right-tab="camera" title="Camera"><span class="material-icons-outlined">videocam</span></button>
                        <button class="a2w-right-tab" data-a2-right-tab="light" title="Lighting"><span class="material-icons-outlined">light_mode</span></button>
                        <button class="a2w-right-tab" data-a2-right-tab="bridge" title="2D + 3D Bridge"><span class="material-icons-outlined">view_in_ar</span></button>
                        <button class="a2w-right-tab" data-a2-right-tab="fx" title="Production / FX"><span class="material-icons-outlined">auto_awesome</span></button>
                    </nav>
                    <div class="a2w-right-main">
                        <div id="a2w-right-title" class="a2w-right-title">Tool</div>
                        <div class="a2w-right-scroll">
                            ${this.toolPageHTML()}
                            ${this.layersPageHTML()}
                            ${this.onionPageHTML()}
                            ${this.cameraPageHTML()}
                            ${this.lightPageHTML()}
                            ${this.bridgePageHTML()}
                            ${this.fxPageHTML()}
                        </div>
                    </div>
                </div>`;
        }

        toolPageHTML() {
            return `
                <div class="a2w-page" data-a2-right-page="tool">
                    <section class="a2w-section">
                        <div class="a2w-section-head"><span class="material-icons-outlined">brush</span>Active Brush</div>
                        <div class="a2w-section-body">
                            <div class="a2w-asset-preview">
                                <div id="a2w-asset-icon" class="a2w-asset-icon">HB</div>
                                <div class="a2w-asset-meta"><strong id="a2w-asset-name">HB Pencil</strong><span>Grease Pencil / Vector Stroke</span></div>
                            </div>
                        </div>
                    </section>
                    <section class="a2w-section">
                        <div class="a2w-section-head"><span class="material-icons-outlined">tune</span>Brush Settings</div>
                        <div class="a2w-section-body">
                            <div class="a2w-prop"><span>Radius</span><input id="brush-radius-slider-2d" type="range" min="1" max="120" value="12"><output id="val-radius">12</output></div>
                            <div class="a2w-prop"><span>Strength</span><input id="brush-strength-slider-2d" type="range" min="0" max="1" step="0.01" value="0.7"><output id="val-strength">0.70</output></div>
                            <div class="a2w-prop"><span>Opacity</span><input id="brush-opacity-slider-2d" type="range" min="0.05" max="1" step="0.01" value="1"><output id="val-opacity">1.00</output></div>
                            <div class="a2w-prop"><span>Spacing</span><input id="brush-spacing-slider-2d" type="range" min="0.01" max="1" step="0.01" value="0.16"><output id="val-spacing">0.16</output></div>
                            <div class="a2w-prop"><span>Jitter</span><input id="brush-jitter-slider-2d" type="range" min="0" max="1" step="0.01" value="0.1"><output id="val-jitter">0.10</output></div>
                            <div class="a2w-prop"><span>Hardness</span><input id="brush-hardness-slider-2d" type="range" min="0" max="1" step="0.01" value="0.8"><output id="val-hardness">0.80</output></div>
                            <div class="a2w-prop"><span>Stabilize</span><input id="brush-stream-slider-2d" type="range" min="0" max="1" step="0.01" value="0.5"><output id="val-stream">0.50</output></div>
                            <label class="a2w-check"><span>Stabilizer</span><input id="brush-stabilizer-toggle" type="checkbox" checked></label>
                            <label class="a2w-check"><span>Symmetry X</span><input id="brush-symmetry-x-toggle" type="checkbox"></label>
                            <div class="a2w-prop compact"><span>Blend</span><select id="brush-blend-select-2d"><option value="source-over">Normal</option><option value="multiply">Multiply</option><option value="screen">Screen</option></select></div>
                        </div>
                    </section>
                    <section class="a2w-section">
                        <div class="a2w-section-head"><span class="material-icons-outlined">texture</span>Brush Texture</div>
                        <div class="a2w-section-body">
                            <div class="a2w-row" id="brush-texture-list">
                                <button class="a2w-btn active" data-texture="none">None</button>
                                <button class="a2w-btn" data-texture="grain">Grain</button>
                                <button class="a2w-btn" data-texture="canvas">Canvas</button>
                                <button class="a2w-btn" data-texture="noise">Noise</button>
                            </div>
                            <div class="a2w-prop"><span>Scale</span><input id="brush-texture-scale" type="range" min="0.1" max="5" step="0.1" value="1"><output>1.0</output></div>
                            <div class="a2w-prop"><span>Opacity</span><input id="brush-texture-opacity" type="range" min="0" max="1" step="0.05" value="0.5"><output>0.50</output></div>
                        </div>
                    </section>
                </div>`;
        }

        layersPageHTML() {
            return `
                <div class="a2w-page" data-a2-right-page="layers" hidden>
                    <section class="a2w-section">
                        <div class="a2w-section-head"><span class="material-icons-outlined">layers</span>Drawing Layers</div>
                        <div class="a2w-section-body">
                            <div class="a2w-row">
                                <button class="a2w-btn primary" data-a2-action="add-layer">+ Layer</button>
                                <button class="a2w-btn" data-a2-action="duplicate-layer">Duplicate</button>
                                <button class="a2w-btn danger" data-a2-action="remove-layer">Remove</button>
                            </div>
                            <div id="a2w-layer-list" class="a2w-layer-list"></div>
                            <div class="a2w-prop"><span>Opacity</span><input id="a2w-layer-opacity" type="range" min="0" max="1" step="0.01" value="1"><output id="a2w-layer-opacity-out">1.00</output></div>
                        </div>
                    </section>
                </div>`;
        }

        onionPageHTML() {
            return `
                <div class="a2w-page" data-a2-right-page="onion" hidden>
                    <section class="a2w-section">
                        <div class="a2w-section-head"><span class="material-icons-outlined">filter_none</span>Onion Skin</div>
                        <div class="a2w-section-body">
                            <label class="a2w-check"><span>Enabled</span><input id="a2w-onion-enabled" type="checkbox" checked></label>
                            <div class="a2w-prop"><span>Previous</span><input id="brush-onion-prev-slider" type="range" min="0" max="8" step="1" value="1"><output id="a2w-onion-prev-out">1</output></div>
                            <div class="a2w-prop"><span>Next</span><input id="brush-onion-next-slider" type="range" min="0" max="8" step="1" value="1"><output id="a2w-onion-next-out">1</output></div>
                            <div class="a2w-prop"><span>Opacity</span><input id="a2w-onion-alpha" type="range" min="0.05" max="0.9" step="0.05" value="0.35"><output id="a2w-onion-alpha-out">0.35</output></div>
                        </div>
                    </section>
                </div>`;
        }

        cameraPageHTML() {
            return `
                <div class="a2w-page" data-a2-right-page="camera" hidden>
                    <section class="a2w-section">
                        <div class="a2w-section-head"><span class="material-icons-outlined">videocam</span>2D Camera</div>
                        <div class="a2w-section-body">
                            <div class="a2w-prop compact"><span>Draw Space</span><select id="brush-draw-space-select"><option value="camera2d">2D Camera</option><option value="viewport3d">3D View Plane</option></select></div>
                            <div class="a2w-prop compact"><span>3D Anchor</span><select id="brush-draw-anchor-select"><option value="target">View Target</option><option value="selected">Selected Object</option></select></div>
                            <div class="a2w-row">
                                <button class="a2w-btn primary" id="brush-camera-key-btn" data-a2-action="camera-key">Set Key</button>
                                <button class="a2w-btn danger" id="brush-camera-delete-key-btn" data-a2-action="camera-delete-key">Delete</button>
                                <button class="a2w-btn" id="brush-camera-frame-art-btn" data-a2-action="fit-view">Frame Art</button>
                            </div>
                            <div class="a2w-prop compact"><span>X</span><input id="brush-camera-x" type="number" step="1" value="0"></div>
                            <div class="a2w-prop compact"><span>Y</span><input id="brush-camera-y" type="number" step="1" value="0"></div>
                            <div class="a2w-prop compact"><span>Zoom</span><input id="brush-camera-zoom" type="number" min="0.05" max="8" step="0.01" value="1"></div>
                            <div class="a2w-prop compact"><span>Rotation</span><input id="brush-camera-rotation" type="number" min="-360" max="360" step="0.5" value="0"></div>
                            <button class="a2w-btn block" id="brush-camera-reset-btn" data-a2-action="camera-reset">Reset Camera</button>
                            <div class="a2w-note" id="brush-camera-key-status">Preview camera on current frame.</div>
                        </div>
                    </section>
                </div>`;
        }

        lightPageHTML() {
            return `
                <div class="a2w-page" data-a2-right-page="light" hidden>
                    <section class="a2w-section">
                        <div class="a2w-section-head"><span class="material-icons-outlined">light_mode</span>2D Lighting</div>
                        <div class="a2w-section-body">
                            <label class="a2w-check"><span>Enable Lighting</span><input id="brush-lighting-toggle" type="checkbox" checked></label>
                            <label class="a2w-check"><span>Shadows</span><input id="brush-shadow-toggle" type="checkbox" checked></label>
                            <div class="a2w-prop compact"><span>Light X</span><input id="brush-light-dir-x" type="number" min="-1" max="1" step="0.01" value="-0.3"></div>
                            <div class="a2w-prop compact"><span>Light Y</span><input id="brush-light-dir-y" type="number" min="-1" max="1" step="0.01" value="-0.4"></div>
                            <div class="a2w-prop"><span>Intensity</span><input id="brush-light-intensity" type="range" min="0" max="2" step="0.01" value="1"><output id="a2w-light-intensity-out">1.00</output></div>
                            <div class="a2w-prop"><span>Shadow Blur</span><input id="a2w-shadow-blur" type="range" min="0" max="40" step="1" value="8"><output id="a2w-shadow-blur-out">8</output></div>
                        </div>
                    </section>
                </div>`;
        }

        bridgePageHTML() {
            return `
                <div class="a2w-page" data-a2-right-page="bridge" hidden>
                    <section class="a2w-section">
                        <div class="a2w-section-head"><span class="material-icons-outlined">view_in_ar</span>2D + 3D Bridge</div>
                        <div class="a2w-section-body">
                            <label class="a2w-check"><span>Auto Apply To Selected</span><input id="brush-auto-apply-selected" type="checkbox"></label>
                            <label class="a2w-check"><span>3D Projection Guide</span><input id="brush-hybrid-overlay-toggle" type="checkbox" checked></label>
                            <label class="a2w-check"><span>Track Selected Object</span><input id="brush-hybrid-track-toggle" type="checkbox" checked></label>
                            <div class="a2w-row">
                                <button class="a2w-btn" id="brush-hybrid-capture-shot-btn" data-a2-action="capture-shot">Capture Shot</button>
                                <button class="a2w-btn" id="brush-hybrid-sync-storyboard-btn" data-a2-action="sync-storyboard">Sync Storyboard</button>
                            </div>
                            <button class="a2w-btn block primary" id="brush-apply-selected-btn" data-a2-action="apply-selected">Apply Frame To Selected</button>
                            <div id="brush-hybrid-status" class="a2w-note">Hybrid drawing tools are ready.</div>
                        </div>
                    </section>
                </div>`;
        }

        fxPageHTML() {
            return `
                <div class="a2w-page" data-a2-right-page="fx" hidden>
                    <section class="a2w-section">
                        <div class="a2w-section-head"><span class="material-icons-outlined">image</span>References</div>
                        <div class="a2w-section-body">
                            <div class="a2w-row">
                                <button class="a2w-btn" id="brush-import-image-btn" data-a2-action="import-image">Import Image</button>
                                <button class="a2w-btn" id="brush-import-video-btn" data-a2-action="import-video">Import Video</button>
                                <button class="a2w-btn danger" id="brush-clear-image-btn" data-a2-action="clear-references">Clear</button>
                            </div>
                            <input id="brush-ref-image-input" class="a2w-hidden-input" type="file" accept="image/png,image/jpeg,image/webp,image/gif">
                            <div class="a2w-prop"><span>Ref Opacity</span><input id="brush-ref-opacity-slider" type="range" min="0" max="1" step="0.01" value="0.5"><output id="a2w-ref-opacity-out">0.50</output></div>
                        </div>
                    </section>
                    <section class="a2w-section">
                        <div class="a2w-section-head"><span class="material-icons-outlined">auto_awesome</span>Production</div>
                        <div class="a2w-section-body">
                            <button class="a2w-btn block" id="brush-2d-storyboard-btn" data-a2-action="storyboard">Storyboard</button>
                            <button class="a2w-btn block" data-a2-action="production-panel">Anime Production Panel</button>
                            <button class="a2w-btn block" data-a2-action="color-studio">Color Studio</button>
                            <button class="a2w-btn block" id="brush-toggle-fit-btn" data-a2-action="fit-view">Fit Canvas To View</button>
                            <button class="a2w-btn block primary" id="brush-2d-export-btn" data-a2-action="export-png">Export Current Frame PNG</button>
                            <button class="a2w-btn block" id="brush-2d-settings-btn" data-a2-action="settings">2D Settings</button>
                        </div>
                    </section>
                    <section class="a2w-section">
                        <div class="a2w-section-head"><span class="material-icons-outlined">interests</span>Stamp Brush</div>
                        <div class="a2w-section-body">
                            <div class="a2w-row">
                                <button class="a2w-btn" id="brush-stamp-capture-btn" data-a2-action="stamp-capture">Capture</button>
                                <button class="a2w-btn" id="brush-stamp-import-btn" data-a2-action="stamp-import">Import</button>
                                <button class="a2w-btn danger" id="brush-stamp-clear-btn" data-a2-action="stamp-clear">Clear</button>
                            </div>
                            <div class="a2w-prop"><span>Scatter</span><input id="brush-stamp-scatter" type="range" min="0" max="1" step="0.01" value="0.25"><output>0.25</output></div>
                            <div class="a2w-prop"><span>Rotation</span><input id="brush-stamp-rotation" type="range" min="0" max="180" step="1" value="25"><output>25°</output></div>
                            <div class="a2w-prop"><span>Scale Jitter</span><input id="brush-stamp-scale" type="range" min="0" max="1" step="0.01" value="0.3"><output>0.30</output></div>
                            <input id="brush-stamp-input" class="a2w-hidden-input" type="file" accept="image/*">
                        </div>
                    </section>
                </div>`;
        }

        bindEvents() {
            if (this._bound) return;
            this._bound = true;

            document.addEventListener('click', (e) => this.onClick(e));
            document.addEventListener('input', (e) => this.onInput(e));
            document.addEventListener('change', (e) => this.onChange(e));
            document.addEventListener('keydown', (e) => this.onKeyDown(e));
        }

        onClick(e) {
            if (e.__sm2dHandled) return;

            const modeButton = e.target.closest('[data-a2-mode]');
            if (modeButton) {
                this.setMode(modeButton.dataset.a2Mode);
                return;
            }

            const filter = e.target.closest('[data-a2-brush-filter]');
            if (filter) {
                this.setBrushFilter(filter.dataset.a2BrushFilter, filter);
                return;
            }

            const brush = e.target.closest('[data-a2-brush]');
            if (brush) {
                this.manager?.setBrushPreset?.(brush.dataset.a2Brush);
                this.sync(true);
                return;
            }

            const tab = e.target.closest('[data-a2-right-tab]');
            if (tab) {
                this.setRightTab(tab.dataset.a2RightTab);
                return;
            }

            const layerRow = e.target.closest('[data-a2-layer]');
            if (layerRow && !e.target.closest('[data-a2-layer-command]')) {
                const mgr = this.manager;
                if (mgr) {
                    mgr.currentLayerId = layerRow.dataset.a2Layer;
                    mgr.syncLayerControls?.();
                    mgr.render?.();
                    this.sync(true);
                }
                return;
            }

            const layerCommand = e.target.closest('[data-a2-layer-command]');
            if (layerCommand) {
                this.runLayerCommand(layerCommand);
                return;
            }

            const actionButton = e.target.closest('[data-a2-action]');
            if (actionButton) {
                this.runAction(actionButton.dataset.a2Action, actionButton);
                return;
            }

            const legacy = e.target.closest('[id]');
            if (legacy && this.active && this.runLegacyActionById(legacy.id, legacy)) {
                e.__sm2dHandled = true;
            }
        }

        onInput(e) {
            if (!this.active) return;
            const mgr = this.manager;
            if (!mgr) return;

            const id = e.target.id;
            const v = Number(e.target.value);
            mgr.brushSettings = mgr.brushSettings || {};
            mgr.camera2D = mgr.camera2D || { x: 0, y: 0, zoom: 1, rotation: 0 };

            if (id === 'a2w-header-radius' || id === 'a2w-header-radius-num' || id === 'brush-radius-slider-2d') {
                const value = clamp(v, 1, 120);
                mgr.currentSize = value;
                mgr.brushSettings = mgr.brushSettings || {};
                mgr.brushSettings.radius = value;
                this.syncBrushValue('radius', value);
            }

            if (id === 'a2w-header-strength' || id === 'a2w-header-strength-num' || id === 'brush-strength-slider-2d') {
                const value = clamp(v, 0, 1);
                mgr.currentStrength = value;
                mgr.brushSettings = mgr.brushSettings || {};
                mgr.brushSettings.strength = value;
                this.syncBrushValue('strength', value);
            }

            if (id === 'brush-opacity-slider-2d') {
                mgr.currentOpacity = clamp(v, .05, 1);
                this.setText('val-opacity', mgr.currentOpacity.toFixed(2));
            }
            if (id === 'brush-spacing-slider-2d') {
                mgr.brushSettings.spacing = clamp(v, .01, 1);
                this.setText('val-spacing', mgr.brushSettings.spacing.toFixed(2));
            }
            if (id === 'brush-jitter-slider-2d') {
                mgr.brushSettings.jitter = clamp(v, 0, 1);
                this.setText('val-jitter', mgr.brushSettings.jitter.toFixed(2));
            }
            if (id === 'brush-hardness-slider-2d') {
                mgr.brushSettings.hardness = clamp(v, 0, 1);
                this.setText('val-hardness', mgr.brushSettings.hardness.toFixed(2));
            }
            if (id === 'brush-stream-slider-2d') {
                mgr.brushSettings.streamline = clamp(v, 0, 1);
                this.setText('val-stream', mgr.brushSettings.streamline.toFixed(2));
            }
            if (id === 'brush-ref-opacity-slider') {
                mgr.referenceImageOpacity = clamp(v, 0, 1);
                this.setText('a2w-ref-opacity-out', mgr.referenceImageOpacity.toFixed(2));
                mgr.render?.();
            }
            if (id === 'brush-onion-prev-slider') {
                mgr.onionSkinPrev = Math.round(clamp(v, 0, 8));
                this.setText('a2w-onion-prev-out', String(mgr.onionSkinPrev));
                mgr.render?.();
            }
            if (id === 'brush-onion-next-slider') {
                mgr.onionSkinNext = Math.round(clamp(v, 0, 8));
                this.setText('a2w-onion-next-out', String(mgr.onionSkinNext));
                mgr.render?.();
            }
            if (id === 'a2w-onion-alpha') {
                mgr.onionSkinAlpha = clamp(v, .05, .9);
                this.setText('a2w-onion-alpha-out', mgr.onionSkinAlpha.toFixed(2));
                mgr.render?.();
            }
            if (id === 'a2w-layer-opacity') {
                const layer = this.currentLayer();
                if (layer) {
                    layer.opacity = clamp(v, 0, 1);
                    this.setText('a2w-layer-opacity-out', layer.opacity.toFixed(2));
                    mgr.render?.();
                }
            }

            if (id === 'brush-camera-x') {
                mgr.camera2D.x = Number.isFinite(v) ? v : 0;
                this.applyCameraPreview();
            }
            if (id === 'brush-camera-y') {
                mgr.camera2D.y = Number.isFinite(v) ? v : 0;
                this.applyCameraPreview();
            }
            if (id === 'brush-camera-zoom') {
                mgr.camera2D.zoom = clamp(v, .05, 8);
                this.applyCameraPreview();
            }
            if (id === 'brush-camera-rotation') {
                mgr.camera2D.rotation = (Number.isFinite(v) ? v : 0) * Math.PI / 180;
                this.applyCameraPreview();
            }

            if (id === 'brush-light-dir-x' || id === 'brush-light-dir-y' || id === 'brush-light-intensity') {
                const light = this.primaryDirectionalLight(true);
                if (light) {
                    if (id === 'brush-light-dir-x') light.position.x = Number.isFinite(v) ? v : -0.3;
                    if (id === 'brush-light-dir-y') light.position.y = Number.isFinite(v) ? v : -0.4;
                    if (id === 'brush-light-intensity') light.intensity = clamp(v, 0, 2);
                    this.setText('a2w-light-intensity-out', Number(light.intensity ?? 1).toFixed(2));
                    mgr.render?.();
                }
            }
            if (id === 'a2w-shadow-blur') {
                mgr.shadowBlur = clamp(v, 0, 40);
                this.setText('a2w-shadow-blur-out', String(Math.round(mgr.shadowBlur)));
                mgr.render?.();
            }

            this.updateInlineOutput(e.target);
        }

        onChange(e) {
            if (!this.active) return;
            const mgr = this.manager;
            if (!mgr) return;
            const id = e.target.id;

            if (id === 'brush-blend-select-2d') mgr.currentBlendMode = e.target.value || 'source-over';
            if (id === 'brush-symmetry-x-toggle') mgr.symmetryXEnabled = !!e.target.checked;
            if (id === 'brush-stabilizer-toggle') mgr.stabilizerEnabled = !!e.target.checked;
            if (id === 'a2w-onion-enabled') mgr.onionSkinning = !!e.target.checked;
            if (id === 'brush-lighting-toggle') mgr.lightingEnabled = !!e.target.checked;
            if (id === 'brush-shadow-toggle') mgr.shadowsEnabled = !!e.target.checked;
            if (id === 'brush-hybrid-overlay-toggle') mgr.render3DOverlay = !!e.target.checked;
            if (id === 'brush-auto-apply-selected') mgr.autoApply2DToSelected = !!e.target.checked;
            if (id === 'brush-hybrid-track-toggle') mgr.trackSelectedObject2D = !!e.target.checked;

            if (id === 'brush-ref-image-input') this.handleReferenceImageFile(e.target.files?.[0]);
            if (id === 'brush-stamp-input') this.handleStampFile(e.target.files?.[0]);

            mgr.render?.();
            this.sync(false);
        }

        onKeyDown(e) {
            if (!this.active) return;
            if (e.target.matches?.('input,select,textarea,[contenteditable="true"]')) return;
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') return;

            if (e.key === 'Escape') {
                if (this.mode === 'storyboard') this.setMode('draw');
                return;
            }
            if (e.key === 'b' || e.key === 'B') {
                this.setMode('draw');
                this.manager?.setTool?.('pencil');
                e.preventDefault();
            }
            if (e.key === 'e' || e.key === 'E') {
                this.setMode('draw');
                this.manager?.setTool?.('eraser');
                e.preventDefault();
            }
            if (e.key === 'f' || e.key === 'F') {
                this.setMode('draw');
                this.manager?.setTool?.('fill');
                e.preventDefault();
            }
            if (e.key === 'i' || e.key === 'I') {
                this.manager?.saveKeyframe?.();
                this.sync(true);
                e.preventDefault();
            }
            if (e.key === 'Delete' || e.key === 'Backspace') {
                if (this.mode === 'edit' && this.manager?.selectedStroke) this.manager.deleteSelectedStroke?.();
                else this.manager?.deleteCurrentFrameKeyframe?.();
                this.sync(true);
                e.preventDefault();
            }
            if (e.key === '[' || e.key === ']') {
                const mgr = this.manager;
                if (mgr) {
                    const delta = e.key === ']' ? 2 : -2;
                    const value = clamp((mgr.currentSize || mgr.brushSettings?.radius || 12) + delta, 1, 120);
                    mgr.currentSize = value;
                    mgr.brushSettings.radius = value;
                    this.syncBrushValue('radius', value);
                    e.preventDefault();
                }
            }
            if (e.shiftKey && e.key.toLowerCase() === 'd') {
                this.manager?.duplicateFrameToNext?.();
                this.sync(true);
                e.preventDefault();
            }
        }

        runAction(action, button) {
            const mgr = this.manager;
            const actions = {
                'undo': () => mgr?.undo?.(),
                'redo': () => mgr?.redo?.(),
                'onion': () => { if (mgr) mgr.onionSkinning = !mgr.onionSkinning; },
                'underlay': () => {
                    if (typeof window.toggle2D3DUnderlay === 'function') window.toggle2D3DUnderlay();
                    else if (mgr) mgr.render3DOverlay = !mgr.render3DOverlay;
                },
                'brush-settings': () => this.setRightTab('tool'),
                'view-menu': () => this.setRightTab('camera'),
                'draw-menu': () => this.setRightTab('tool'),
                'add-layer': () => mgr?.addLayer?.(),
                'duplicate-layer': () => this.duplicateCurrentLayer(),
                'remove-layer': () => mgr?.removeCurrentLayer?.(),
                'camera-key': () => mgr?.insertCameraKeyframe?.(),
                'camera-delete-key': () => mgr?.deleteCameraKeyframeAtCurrent?.(),
                'camera-reset': () => this.resetCamera(),
                'fit-view': () => this.fitCanvasToView(),
                'import-image': () => $('brush-ref-image-input')?.click(),
                'import-video': () => this.importReferenceVideo(),
                'clear-references': () => this.clearReferences(),
                'storyboard': () => this.openStoryboard(),
                'production-panel': () => window.toggleAnimeProductionPanel?.(true),
                'color-studio': () => window.animeColoringSystem?.togglePanel?.() || window.toggleAnimeColorStudio?.(),
                'export-png': () => this.exportCurrentFrame(),
                'settings': () => this.openSettings(),
                'capture-shot': () => this.captureHybridShot(),
                'sync-storyboard': () => this.syncStoryboard(),
                'apply-selected': () => this.applyFrameToSelected(),
                'stamp-capture': () => mgr?.captureStampFromSelection?.() || mgr?.captureStamp?.(),
                'stamp-import': () => $('brush-stamp-input')?.click(),
                'stamp-clear': () => mgr?.clearStampBrush?.()
            };

            actions[action]?.();
            mgr?.render?.();
            this.sync(true);

            if (button && (action === 'onion' || action === 'underlay')) {
                button.classList.toggle('active', action === 'onion' ? !!mgr?.onionSkinning : !!mgr?.render3DOverlay);
            }
        }

        runLegacyActionById(id) {
            const mgr = this.manager;
            const map = {
                'brush-frame-copy-btn': () => mgr?.copyCurrentFrame?.(),
                'brush-frame-paste-btn': () => mgr?.pasteCurrentFrame?.(),
                'brush-frame-dup-next-btn': () => mgr?.duplicateFrameToNext?.(),
                'brush-frame-clear-btn': () => mgr?.clearCurrentFrame?.(),
                'brush-2d-undo-btn': () => mgr?.undo?.(),
                'brush-2d-redo-btn': () => mgr?.redo?.(),
                'brush-toggle-fit-btn': () => this.fitCanvasToView(),
                'brush-2d-shadow-btn': () => { if (mgr) mgr.shadowsEnabled = !mgr.shadowsEnabled; },
                'brush-2d-export-btn': () => this.exportCurrentFrame(),
                'brush-2d-storyboard-btn': () => this.openStoryboard()
            };
            if (!map[id]) return false;
            map[id]();
            mgr?.render?.();
            this.sync(true);
            return true;
        }

        setMode(mode) {
            const mgr = this.manager;
            if (!mgr) return;

            if (mode === 'storyboard') {
                this.mode = 'storyboard';
                this.openStoryboard();
            } else {
                this.mode = mode;
                const tool = mode === 'draw' ? 'pencil' : mode === 'edit' ? 'select' : 'camera';
                mgr.setTool?.(tool);
            }

            this.root?.querySelectorAll('[data-a2-mode]').forEach((b) => {
                b.classList.toggle('active', b.dataset.a2Mode === mode);
            });
        }

        setBrushFilter(filter, button) {
            this.brushShelf?.querySelectorAll('[data-a2-brush-filter]').forEach((b) => {
                b.classList.toggle('active', b === button);
            });
            this.renderBrushShelf(filter, true);
        }

        setRightTab(tab) {
            if (!this.rightPanel) return;
            this.rightPanel.querySelectorAll('[data-a2-right-tab]').forEach((b) => {
                b.classList.toggle('active', b.dataset.a2RightTab === tab);
            });
            this.rightPanel.querySelectorAll('[data-a2-right-page]').forEach((page) => {
                page.hidden = page.dataset.a2RightPage !== tab;
            });
            const titles = {
                tool: 'Tool', layers: 'Drawing Layers', onion: 'Onion Skin', camera: '2D Camera',
                light: 'Lighting', bridge: '2D + 3D Bridge', fx: 'Production / FX'
            };
            if ($('a2w-right-title')) $('a2w-right-title').textContent = titles[tab] || '2D Properties';
        }

        runLayerCommand(button) {
            const mgr = this.manager;
            if (!mgr) return;
            const row = button.closest('[data-a2-layer]');
            if (!row) return;
            const layer = mgr.layers?.find((l) => l.id === row.dataset.a2Layer);
            if (!layer) return;
            const cmd = button.dataset.a2LayerCommand;
            if (cmd === 'visible') layer.visible = !layer.visible;
            if (cmd === 'lock') layer.locked = !layer.locked;
            mgr.render?.();
            this.sync(true);
        }

        setActive(active) {
            this.active = !!active;
            this.ensureStaticUI();

            if (this.root) this.root.hidden = !this.active;
            this.ensureTimelineBrushPanel();
            if (this.brushShelf) this.brushShelf.hidden = !this.active;

            document.body.classList.toggle('anime2d-production-workspace', this.active);

            if (this.active) {
                this.mountRightPanel();
                this.syncTimelineContext();
                this.manager?.syncWithTimeline?.();
                this.renderBrushShelf('all', true);
                this.sync(true);
                if (!this.syncTimer) this.syncTimer = window.setInterval(() => this.sync(false), 160);
            } else {
                if (this.syncTimer) {
                    window.clearInterval(this.syncTimer);
                    this.syncTimer = null;
                }

                /* Never leave inline display states behind when another workspace
                   takes over. This is intentionally idempotent. */
                window.SM2DWorkspaceCleanup?.('Anime2DWorkspace.setActive(false)');
                window.TimelinePanel?.setContext?.('default', { silent: true });
                this.unmountRightPanel();

                if (this.root) this.root.hidden = true;
                if (this.brushShelf) this.brushShelf.hidden = true;
            }
        }

        syncTimelineContext() {
            if (!this.active) return;
            window.TimelinePanel?.setContext?.('2d', { silent: true });
        }

        sync(force = false) {
            if (!this.active) return;
            const mgr = this.manager;
            if (!mgr) return;

            this.syncHeader();
            this.syncToolControls();
            this.syncOnionControls();
            this.syncCameraControls();
            this.syncLightingControls();
            this.syncBridgeControls();
            this.renderLayers(force);
            this.renderBrushShelf(null, force);
            this.syncTimelineContext();
        }

        syncHeader() {
            const mgr = this.manager;
            if (!mgr || !this.root) return;
            this.root.querySelector('[data-a2-action="onion"]')?.classList.toggle('active', !!mgr.onionSkinning);
            this.root.querySelector('[data-a2-action="underlay"]')?.classList.toggle('active', !!mgr.render3DOverlay);
            this.syncBrushValue('radius', mgr.currentSize || mgr.brushSettings?.radius || 12);
            this.syncBrushValue('strength', mgr.currentStrength ?? mgr.brushSettings?.strength ?? .7);
        }

        syncToolControls() {
            const mgr = this.manager;
            if (!mgr) return;
            const b = mgr.getActiveBrushConfig?.() || mgr.brushSettings || {};
            const values = {
                'brush-opacity-slider-2d': mgr.currentOpacity ?? b.opacity ?? 1,
                'brush-spacing-slider-2d': b.spacing ?? .16,
                'brush-jitter-slider-2d': b.jitter ?? .1,
                'brush-hardness-slider-2d': b.hardness ?? .8,
                'brush-stream-slider-2d': b.streamline ?? .5,
                'brush-ref-opacity-slider': mgr.referenceImageOpacity ?? .5
            };
            Object.entries(values).forEach(([id, value]) => this.setValue(id, value));
            this.setText('val-opacity', Number(values['brush-opacity-slider-2d']).toFixed(2));
            this.setText('val-spacing', Number(values['brush-spacing-slider-2d']).toFixed(2));
            this.setText('val-jitter', Number(values['brush-jitter-slider-2d']).toFixed(2));
            this.setText('val-hardness', Number(values['brush-hardness-slider-2d']).toFixed(2));
            this.setText('val-stream', Number(values['brush-stream-slider-2d']).toFixed(2));
            this.setText('a2w-ref-opacity-out', Number(values['brush-ref-opacity-slider']).toFixed(2));

            if ($('brush-stabilizer-toggle')) $('brush-stabilizer-toggle').checked = mgr.stabilizerEnabled !== false;
            if ($('brush-symmetry-x-toggle')) $('brush-symmetry-x-toggle').checked = !!mgr.symmetryXEnabled;
            if ($('brush-blend-select-2d')) $('brush-blend-select-2d').value = mgr.currentBlendMode || 'source-over';

            const preset = mgr.activeBrushPreset || {};
            if ($('a2w-asset-icon')) $('a2w-asset-icon').textContent = preset.icon || '✎';
            if ($('a2w-asset-name')) $('a2w-asset-name').textContent = preset.name || 'Pencil';
            if ($('a2w-timeline-brush-status')) $('a2w-timeline-brush-status').textContent = preset.name || 'Pencil';
        }

        syncOnionControls() {
            const mgr = this.manager;
            if (!mgr) return;
            if ($('a2w-onion-enabled')) $('a2w-onion-enabled').checked = !!mgr.onionSkinning;
            this.setValue('brush-onion-prev-slider', mgr.onionSkinPrev ?? 1);
            this.setValue('brush-onion-next-slider', mgr.onionSkinNext ?? 1);
            this.setValue('a2w-onion-alpha', mgr.onionSkinAlpha ?? .35);
            this.setText('a2w-onion-prev-out', String(mgr.onionSkinPrev ?? 1));
            this.setText('a2w-onion-next-out', String(mgr.onionSkinNext ?? 1));
            this.setText('a2w-onion-alpha-out', Number(mgr.onionSkinAlpha ?? .35).toFixed(2));
        }

        syncCameraControls() {
            const mgr = this.manager;
            if (!mgr) return;
            const c = mgr._currentCameraState?.() || mgr.camera2D || { x: 0, y: 0, zoom: 1, rotation: 0 };
            this.setValueUnlessFocused('brush-camera-x', Number(c.x || 0).toFixed(0));
            this.setValueUnlessFocused('brush-camera-y', Number(c.y || 0).toFixed(0));
            this.setValueUnlessFocused('brush-camera-zoom', Number(c.zoom || 1).toFixed(2));
            this.setValueUnlessFocused('brush-camera-rotation', Number((c.rotation || 0) * 180 / Math.PI).toFixed(1));
        }

        syncLightingControls() {
            const mgr = this.manager;
            if (!mgr) return;
            if ($('brush-lighting-toggle')) $('brush-lighting-toggle').checked = mgr.lightingEnabled !== false;
            if ($('brush-shadow-toggle')) $('brush-shadow-toggle').checked = mgr.shadowsEnabled !== false;
            this.setValue('a2w-shadow-blur', mgr.shadowBlur ?? 8);
            this.setText('a2w-shadow-blur-out', String(Math.round(mgr.shadowBlur ?? 8)));
            const light = this.primaryDirectionalLight(false);
            if (light) {
                this.setValueUnlessFocused('brush-light-dir-x', light.position?.x ?? -0.3);
                this.setValueUnlessFocused('brush-light-dir-y', light.position?.y ?? -0.4);
                this.setValue('brush-light-intensity', light.intensity ?? 1);
                this.setText('a2w-light-intensity-out', Number(light.intensity ?? 1).toFixed(2));
            }
        }

        syncBridgeControls() {
            const mgr = this.manager;
            if (!mgr) return;
            if ($('brush-hybrid-overlay-toggle')) $('brush-hybrid-overlay-toggle').checked = !!mgr.render3DOverlay;
            if ($('brush-auto-apply-selected')) $('brush-auto-apply-selected').checked = !!mgr.autoApply2DToSelected;
            if ($('brush-hybrid-track-toggle')) $('brush-hybrid-track-toggle').checked = mgr.trackSelectedObject2D !== false;
        }

        renderBrushShelf(filter = null, force = false) {
            const mgr = this.manager;
            const list = $('brush-shelf-strip') || $('a2w-brush-list');
            if (!mgr || !list) return;

            let currentFilter = filter;
            if (!currentFilter) {
                currentFilter = this.brushShelf?.querySelector('[data-a2-brush-filter].active')?.dataset.a2BrushFilter || 'all';
            }

            const presets = (mgr.brushPresets || []).filter((p) => currentFilter === 'all' || p.category === currentFilter);
            const signature = JSON.stringify([currentFilter, mgr.activeBrushPreset?.id, presets.map((p) => p.id)]);
            if (!force && signature === this._lastBrushSignature) return;
            this._lastBrushSignature = signature;

            list.innerHTML = presets.map((p) => `
                <button class="a2w-brush-card ${mgr.activeBrushPreset?.id === p.id ? 'active' : ''}" data-a2-brush="${this.escape(p.id)}" title="${this.escape(p.name)}">
                    <span class="a2w-brush-glyph">${this.escape(p.icon || '✎')}</span>
                    <span class="a2w-brush-name">${this.escape(p.name)}</span>
                </button>`).join('') || '<div class="a2w-note">No brush presets in this category.</div>';
        }

        renderLayers(force = false) {
            const mgr = this.manager;
            const list = $('a2w-layer-list');
            if (!mgr || !list) return;

            const signature = JSON.stringify((mgr.layers || []).map((l) => [
                l.id, l.name, l.visible, l.locked, l.opacity, mgr.currentLayerId === l.id
            ]));
            if (!force && signature === this._lastLayerSignature) return;
            this._lastLayerSignature = signature;

            list.innerHTML = (mgr.layers || []).slice().reverse().map((l) => `
                <div class="a2w-layer-row ${mgr.currentLayerId === l.id ? 'active' : ''}" data-a2-layer="${this.escape(l.id)}">
                    <button data-a2-layer-command="visible" title="Visibility"><span class="material-icons-outlined" style="font-size:15px">${l.visible ? 'visibility' : 'visibility_off'}</span></button>
                    <span class="material-icons-outlined" style="font-size:15px;color:#aaa">gesture</span>
                    <span class="a2w-layer-name">${this.escape(l.name)}</span>
                    <button data-a2-layer-command="lock" title="Lock"><span class="material-icons-outlined" style="font-size:15px">${l.locked ? 'lock' : 'lock_open'}</span></button>
                </div>`).join('') || '<div class="a2w-note">No drawing layers.</div>';

            const layer = this.currentLayer();
            if (layer) {
                this.setValue('a2w-layer-opacity', layer.opacity ?? 1);
                this.setText('a2w-layer-opacity-out', Number(layer.opacity ?? 1).toFixed(2));
            }
        }

        currentLayer() {
            const mgr = this.manager;
            return mgr?.layers?.find((l) => l.id === mgr.currentLayerId) || null;
        }

        duplicateCurrentLayer() {
            const mgr = this.manager;
            const layer = this.currentLayer();
            if (!mgr || !layer) return;
            if (typeof mgr.duplicateLayer === 'function') {
                mgr.duplicateLayer(layer.id);
                return;
            }
            if (!Array.isArray(mgr.layers)) return;
            const clone = {
                ...layer,
                id: `layer_${Date.now()}`,
                name: `${layer.name || 'Layer'} Copy`,
                locked: false
            };
            mgr.layers.push(clone);
            mgr.currentLayerId = clone.id;
            mgr.render?.();
        }

        applyCameraPreview() {
            const mgr = this.manager;
            if (!mgr) return;
            mgr._syncViewFromCamera?.(mgr.camera2D);
            mgr.render?.();
        }

        resetCamera() {
            const mgr = this.manager;
            if (!mgr) return;
            mgr.camera2D = { x: 0, y: 0, zoom: 1, rotation: 0 };
            mgr._syncViewFromCamera?.(mgr.camera2D);
            mgr.render?.();
        }

        fitCanvasToView() {
            const mgr = this.manager;
            if (!mgr) return;
            if (typeof mgr.fitToView === 'function') {
                mgr.fitToView();
            } else if (mgr.canvas && mgr.container) {
                mgr.canvas.width = Math.max(1, mgr.container.clientWidth || mgr.canvas.width);
                mgr.canvas.height = Math.max(1, mgr.container.clientHeight || mgr.canvas.height);
            }
            mgr.render?.();
        }

        openStoryboard() {
            window.storyboard2DIntegration?.open?.() ||
                window.storyboard2DManager?.open?.() ||
                window.toggleStoryboard2D?.() ||
                window.brushPanelHandlers?.toggleStoryboard?.();
        }

        handleReferenceImageFile(file) {
            if (!file) return;
            const mgr = this.manager;
            if (!mgr) return;
            const reader = new FileReader();
            reader.onload = (event) => {
                const img = new Image();
                img.onload = () => {
                    mgr.referenceObjects = Array.isArray(mgr.referenceObjects) ? mgr.referenceObjects : [];
                    mgr.referenceObjects.push({
                        id: `ref_${Date.now()}`,
                        type: 'image',
                        content: img,
                        x: 0,
                        y: 0,
                        w: img.width,
                        h: img.height,
                        opacity: mgr.referenceImageOpacity ?? .5,
                        enabled: true
                    });
                    mgr.referenceImage = img;
                    mgr.render?.();
                };
                img.src = event.target.result;
            };
            reader.readAsDataURL(file);
        }

        importReferenceVideo() {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'video/*';
            input.onchange = () => {
                const file = input.files?.[0];
                if (!file) return;
                const mgr = this.manager;
                if (!mgr) return;
                const video = document.createElement('video');
                video.src = URL.createObjectURL(file);
                video.loop = true;
                video.muted = true;
                video.onloadedmetadata = () => {
                    mgr.referenceObjects = Array.isArray(mgr.referenceObjects) ? mgr.referenceObjects : [];
                    mgr.referenceObjects.push({
                        id: `ref_${Date.now()}`,
                        type: 'video',
                        content: video,
                        x: 0,
                        y: 0,
                        w: video.videoWidth,
                        h: video.videoHeight,
                        opacity: mgr.referenceImageOpacity ?? .5,
                        enabled: true
                    });
                    video.play().catch(() => {});
                    mgr.render?.();
                };
            };
            input.click();
        }

        clearReferences() {
            const mgr = this.manager;
            if (!mgr) return;
            mgr.referenceObjects = [];
            mgr.referenceImage = null;
            mgr.selectedRefId = null;
            mgr.render?.();
        }

        exportCurrentFrame() {
            const mgr = this.manager;
            if (!mgr) return;
            if (typeof mgr.exportCurrentFramePNG === 'function') {
                mgr.exportCurrentFramePNG();
                return;
            }
            if (!mgr.canvas) return;
            const link = document.createElement('a');
            link.href = mgr.canvas.toDataURL('image/png');
            link.download = `sm_2d_frame_${Date.now()}.png`;
            link.click();
        }

        openSettings() {
            if (typeof window.openSettingsPanel === 'function') {
                window.openSettingsPanel('2d-animation');
                return;
            }
            window.settingsPanel?.show?.('2d-animation');
        }

        captureHybridShot() {
            const mgr = this.manager;
            mgr?.captureHybridShot?.() ||
                window.storyboard2DIntegration?.captureCurrentCanvasToFrame?.(window.storyboard2DManager?.selectedFrameId);
            this.setText('brush-hybrid-status', 'Captured current 2D/3D shot state.');
        }

        syncStoryboard() {
            window.storyboard2DIntegration?.syncFromAnimation?.() ||
                window.storyboard2DIntegration?.sync?.();
            this.setText('brush-hybrid-status', 'Storyboard synchronization requested.');
        }

        applyFrameToSelected() {
            const mgr = this.manager;
            mgr?.applyCurrentFrameToSelected?.() ||
                mgr?.applyFrameToSelected?.();
            this.setText('brush-hybrid-status', 'Applied current drawing frame to selected target when supported.');
        }

        handleStampFile(file) {
            if (!file) return;
            const mgr = this.manager;
            if (!mgr) return;
            if (typeof mgr.importStampBrush === 'function') {
                mgr.importStampBrush(file);
                return;
            }
            const reader = new FileReader();
            reader.onload = (event) => {
                const img = new Image();
                img.onload = () => {
                    mgr.stampImage = img;
                    mgr.render?.();
                };
                img.src = event.target.result;
            };
            reader.readAsDataURL(file);
        }

        primaryDirectionalLight(createIfMissing) {
            const mgr = this.manager;
            if (!mgr) return null;
            if (!Array.isArray(mgr.directionalLights)) mgr.directionalLights = [];
            if (!mgr.directionalLights.length && createIfMissing) {
                mgr.directionalLights.push({
                    id: 'ui-key',
                    position: { x: -0.3, y: -0.4, z: 1 },
                    intensity: 1,
                    color: '#ffffff'
                });
            }
            const light = mgr.directionalLights[0] || null;
            if (light && !light.position) light.position = { x: -0.3, y: -0.4, z: 1 };
            return light;
        }

        syncBrushValue(type, value) {
            if (type === 'radius') {
                ['a2w-header-radius', 'a2w-header-radius-num', 'brush-radius-slider-2d'].forEach((id) => this.setValue(id, value));
                this.setText('val-radius', String(Math.round(value)));
            }
            if (type === 'strength') {
                ['a2w-header-strength', 'a2w-header-strength-num', 'brush-strength-slider-2d'].forEach((id) => this.setValue(id, value));
                this.setText('val-strength', Number(value).toFixed(2));
            }
        }

        updateInlineOutput(input) {
            if (!input || input.type !== 'range') return;
            const row = input.closest('.a2w-prop');
            const output = row?.querySelector('output');
            if (!output) return;
            if (output.id) return; // dedicated values are updated by their handlers.
            const value = Number(input.value);
            if (!Number.isFinite(value)) return;
            output.textContent = input.step && Number(input.step) < 1 ? value.toFixed(2) : String(Math.round(value));
        }

        setValue(id, value) {
            const el = $(id);
            if (!el || el.matches(':focus')) return;
            const text = String(value);
            if (el.value !== text) el.value = text;
        }

        setValueUnlessFocused(id, value) {
            const el = $(id);
            if (!el || el.matches(':focus')) return;
            el.value = String(value);
        }

        setText(id, value) {
            const el = $(id);
            if (!el) return;
            if ('value' in el && (el.tagName === 'OUTPUT' || el.tagName === 'INPUT')) el.value = String(value);
            else el.textContent = String(value);
        }

        bindWorkspaceExitGuard() {
            if (this._workspaceGuardBound) return;
            this._workspaceGuardBound = true;

            const normalize = (value) =>
                String(value || '')
                    .replace(/\s+/g, ' ')
                    .trim()
                    .toLowerCase();

            const workspaceLabels = new Set([
                'file', 'add', 'view', 'camera', 'layout', 'terrain',
                'film', 'filming', 'modeling', 'sculpting', 'uv editing',
                '2d animation', 'rendering', 'scripting', 'video editing',
                'assets', 'inspector', 'history', 'stor', 'live capture'
            ]);

            const isTopWorkspaceControl = (el) => {
                if (!el) return false;

                if (
                    el.matches?.(
                        '[data-workspace], [data-workspace-mode], [data-editor-mode], ' +
                        '.workspace-tab, .workspace-mode-tab, .top-workspace-tab, ' +
                        '[role="tab"]'
                    )
                ) {
                    return true;
                }

                const rect = el.getBoundingClientRect?.();
                return !!rect && rect.top >= 0 && rect.bottom <= 150;
            };

            document.addEventListener('click', (event) => {
                if (!this.active && !document.body.classList.contains('animation-2d-mode-active')) return;

                const control = event.target.closest?.(
                    'button, a, [role="tab"], [data-workspace], [data-workspace-mode], ' +
                    '[data-editor-mode], .workspace-tab, .workspace-mode-tab, .top-workspace-tab'
                );
                if (!control || !isTopWorkspaceControl(control)) return;

                const label = normalize(
                    control.dataset?.workspace ||
                    control.dataset?.workspaceMode ||
                    control.dataset?.editorMode ||
                    control.getAttribute?.('aria-label') ||
                    control.title ||
                    control.textContent
                );

                if (!workspaceLabels.has(label)) return;
                if (label === '2d animation') return;

                /* Capture-phase is deliberate: cleanup happens before the next
                   workspace starts mounting its own UI, but we do not cancel the click. */
                this.forceExit2DWorkspace(`workspace-click:${label}`);
            }, true);

            ['sm:workspace-changed', 'sm:workspace-mode-changed', 'sm:editor-mode-changed'].forEach((name) => {
                window.addEventListener(name, (event) => {
                    if (!this.active && !document.body.classList.contains('animation-2d-mode-active')) return;
                    const label = normalize(
                        event?.detail?.workspace ||
                        event?.detail?.mode ||
                        event?.detail?.name ||
                        event?.detail?.label
                    );
                    if (!label || label === '2d animation') return;
                    this.forceExit2DWorkspace(`${name}:${label}`);
                });
            });
        }

        forceExit2DWorkspace(reason = 'external-workspace') {
            const mgr = this.manager;

            try {
                if (mgr?.isActive && typeof mgr.exitMode === 'function') {
                    mgr.exitMode();
                } else {
                    document.body.classList.remove(
                        'animation-2d-mode-active',
                        'animation-2d-3d-underlay',
                        'anime2d-production-workspace'
                    );
                    window._apply2DUI?.(false);
                }
            } catch (error) {
                console.warn('[2D Workspace] Exit cleanup failed:', reason, error);
                document.body.classList.remove(
                    'animation-2d-mode-active',
                    'animation-2d-3d-underlay',
                    'anime2d-production-workspace'
                );
                window.SM2DWorkspaceCleanup?.(reason);
                this.setActive(false);
            }
        }

        wrapWorkspaceLifecycle() {
            if (window._apply2DUI?.__smAnime2DWorkspaceV2Wrapped) return;
            const original = window._apply2DUI;
            if (typeof original !== 'function') return;
            const workspace = this;
            const wrapped = function (active) {
                const result = original.apply(this, arguments);
                requestAnimationFrame(() => workspace.setActive(!!active));
                return result;
            };
            wrapped.__smAnime2DWorkspaceV2Wrapped = true;
            wrapped.__original = original;
            window._apply2DUI = wrapped;
        }

        observeModeClass() {
            if (this._observer) return;
            this._observer = new MutationObserver(() => {
                if (this._scheduled) return;
                this._scheduled = true;
                requestAnimationFrame(() => {
                    this._scheduled = false;
                    const active = document.body.classList.contains('animation-2d-mode-active');
                    if (active !== this.active) this.setActive(active);
                    this.ensureStaticUI();
                });
            });
            this._observer.observe(document.body, { attributes: true, attributeFilter: ['class'], childList: true, subtree: true });
        }

        escape(value) {
            const div = document.createElement('div');
            div.textContent = String(value ?? '');
            return div.innerHTML;
        }
    }

    const boot = () => {
        window.Anime2DWorkspace = Anime2DWorkspace;
        if (window.anime2DWorkspace?.syncTimer) window.clearInterval(window.anime2DWorkspace.syncTimer);
        window.anime2DWorkspace = new Anime2DWorkspace();
        window.anime2DWorkspace.init();
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot, { once: true });
    } else {
        boot();
    }
})();

