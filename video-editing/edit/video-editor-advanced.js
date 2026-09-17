/**
 * video-editor-advanced.js (Professional Color Grade & DaVinci Inspired Tools)
 */

(function () {
    'use strict';

    /* ------------------------------------------------------------------ */
    /*  Helpers & Constants                                                */
    /* ------------------------------------------------------------------ */
    const waitForManager = (cb, tries = 0) => {
        if (window.videoEditingManager) return cb(window.videoEditingManager);
        if (tries > 60) return console.error('[VEA] VideoEditingManager not found.');
        setTimeout(() => waitForManager(cb, tries + 1), 200);
    };

    /**
     * SVG Filter Setup for Pro Curves
     */
    const createVeaFilters = () => {
        let svg = document.getElementById('vea-svg-filters');
        if (!svg) {
            svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.id = 'vea-svg-filters';
            svg.style.display = 'none';
            document.body.appendChild(svg);
        }
        return svg;
    };

    const updateCurveFilter = (itemId, curves) => {
        const svg = createVeaFilters();
        // Ensure ID is safe for CSS selectors
        const safeId = itemId.toString().replace(/[^a-zA-Z0-9]/g, '_');
        let filter = document.getElementById(`vea-filter-${safeId}`);

        if (!filter) {
            filter = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
            filter.id = `vea-filter-${safeId}`;
            const transfer = document.createElementNS('http://www.w3.org/2000/svg', 'feComponentTransfer');
            ['R', 'G', 'B'].forEach(c => {
                const func = document.createElementNS('http://www.w3.org/2000/svg', `feFunc${c}`);
                func.setAttribute('type', 'table');
                func.setAttribute('tableValues', '0 1');
                transfer.appendChild(func);
            });
            filter.appendChild(transfer);
            svg.appendChild(filter);
        }

        const transfer = filter.querySelector('feComponentTransfer');
        if (transfer) {
            ['red', 'green', 'blue'].forEach((chan, idx) => {
                const points = curves?.[chan] || [{ x: 0, y: 0 }, { x: 1, y: 1 }];
                // Use 16 steps for reasonably smooth linear approximation
                const steps = 16;
                const table = new Array(steps).fill(0).map((_, i) => {
                    const t = i / (steps - 1);
                    const p1 = [...points].reverse().find(p => p.x <= t) || points[0];
                    const p2 = points.find(p => p.x > t) || points[points.length - 1];
                    if (p1 === p2) return p1.y;
                    const den = p2.x - p1.x;
                    const segmentT = den === 0 ? 0 : (t - p1.x) / den;
                    const val = p1.y + (p2.y - p1.y) * segmentT;
                    return Math.max(0, Math.min(1, val));
                });
                if (transfer.children[idx]) {
                    transfer.children[idx].setAttribute('tableValues', table.join(' '));
                }
            });
        }
    };

    const rad = d => d * Math.PI / 180;
    const deg = r => r * 180 / Math.PI;
    const cssColor = (name, fallback) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

    /* ------------------------------------------------------------------ */
    /*  PREMIUM STYLES                                                    */
    /* ------------------------------------------------------------------ */
    const styles = `
        #video-inspector-content,
        .video-timeline-dock-content,
        .video-tool-pane-main {
            display: flex;
            flex-direction: column;
            gap: 10px;
            align-items: stretch;
            min-height: 0;
            overflow: auto;
            color: var(--video-text);
        }
        #video-inspector-content .vea-card,
        .video-timeline-dock-content .vea-card,
        .video-tool-pane-main .vea-card {
            background: linear-gradient(180deg, rgba(255,255,255,0.035), rgba(255,255,255,0));
            border: 1px solid var(--video-border);
            border-radius: 3px;
            padding: 10px;
        }
        #video-inspector-content .vea-note,
        .video-timeline-dock-content .vea-note,
        .video-tool-pane-main .vea-note {
            color: var(--video-text-muted);
            font-size: 10px;
            line-height: 1.5;
        }
        #video-inspector-content .vea-grid-2,
        .video-timeline-dock-content .vea-grid-2,
        .video-tool-pane-main .vea-grid-2 {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 8px;
        }
        #video-inspector-content input,
        #video-inspector-content select,
        #video-inspector-content button,
        .video-timeline-dock-content input,
        .video-timeline-dock-content select,
        .video-timeline-dock-content button,
        .video-tool-pane-main input,
        .video-tool-pane-main select,
        .video-tool-pane-main button {
            font-family: inherit;
        }
        .color-wheel { transition: box-shadow 0.2s; }
        .color-wheel:hover { box-shadow: 0 0 15px rgba(var(--video-accent-rgb), 0.35); }
        .wheel-knob { pointer-events: none; border: 2px solid #fff; box-shadow: 0 0 2px #000; }
        .vea-subtab-btn { transition: all 0.2s; }
        .vea-subtab-btn:hover { background: rgba(255,255,255,0.1); }
        .curve-chan-btn.active { background: var(--video-accent) !important; color: #fff !important; }
        #curve-canvas { image-rendering: pixelated; }
        .vea-section-title { text-transform: uppercase; letter-spacing: 0.5px; }
        .tool-btn.video-mode-element.active { color: var(--video-accent) !important; border-color: rgba(var(--video-accent-rgb), 0.4) !important; background: rgba(var(--video-accent-rgb), 0.12) !important; }
        .vea-select, .vea-input {
            width: 100%;
            background: var(--video-bg-0);
            color: var(--video-text);
            border: 1px solid var(--video-border);
            border-radius: 3px;
            font-size: 11px;
            padding: 6px 8px;
            box-sizing: border-box;
        }
        .vea-button-row {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 6px;
        }
        .vea-pill {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            border-radius: 999px;
            padding: 4px 8px;
            font-size: 10px;
            background: var(--video-bg-2);
            border: 1px solid var(--video-border);
            color: var(--video-text-soft);
        }
    `;
    const styleEl = document.createElement('style');
    styleEl.textContent = styles;
    document.head.appendChild(styleEl);

    /* ------------------------------------------------------------------ */
    /*  TABBED INSPECTOR (PRO COLOR EDITION)                              */
    /* ------------------------------------------------------------------ */
    class TabbedInspector {
        constructor(mgr) {
            this.mgr = mgr;
            this.activeTab = 'clip'; // clip/project/audio/color/effects/transitions/render
            this._build();
        }

        _build() {
            const btnClip = document.getElementById('ve-clip-properties');
            const btnProj = document.getElementById('ve-project-settings');
            const btnAudio = document.getElementById('ve-audio-master');
            const btnColor = document.getElementById('ve-color-grade');
            const btnRender = document.getElementById('ve-render-export');

            btnClip?.addEventListener('click', () => this._activateTab('clip'));
            btnProj?.addEventListener('click', () => this._activateTab('project'));
            btnAudio?.addEventListener('click', () => this._activateTab('audio'));
            btnColor?.addEventListener('click', () => this._activateTab('color'));
            btnRender?.addEventListener('click', () => this._activateTab('render'));

            // Workspace video toolbar integration.
            document.querySelectorAll('#video-mode-tabs [data-mode]').forEach(btn => {
                btn.addEventListener('click', event => {
                    const mode =
                        btn.dataset.mode;

                    // Full workspace: Audio Studio.
                    if (
                        mode === 'audio' &&
                        window.videoWorkspaceRouter
                    ) {
                        event.preventDefault();

                        window.videoWorkspaceRouter
                            .switchTo('audio');

                        return;
                    }

                    // Return to the normal Edit workspace.
                    if (
                        (mode === 'edit' || mode === 'cut') &&
                        window.videoWorkspaceRouter
                    ) {
                        event.preventDefault();

                        window.videoWorkspaceRouter
                            .switchTo('edit');

                        return;
                    }

                    // Keep current panel behavior for workspaces not built yet.
                    if (mode === 'fx') {
                        this._activateTab('effects');
                    } else if (mode === 'color') {
                        this._activateTab('color');
                    } else if (mode === 'deliver') {
                        this._activateTab('render');
                    }
                });
            });

            // If dedicated buttons exist in a future toolbar, support them automatically.
            document.getElementById('ve-effects')?.addEventListener('click', () => this._activateTab('effects'));
            document.getElementById('ve-transitions')?.addEventListener('click', () => this._activateTab('transitions'));

            this._setActiveButtonState();
            window.addEventListener('videoToolPanelRequest', (event) => {
                if (!this.mgr?.active) return;
                const nextTab = event?.detail?.tab;
                if (!nextTab) return;
                this.activeTab = nextTab;
                this.render();
            });
            window.addEventListener('videoToolDockClose', () => {
                this._setActiveButtonState();
            });
        }

        _resolveContainer() {
            if (this.mgr?.active && this.mgr?.getVideoToolPanelHost) {
                const dockHost = this.mgr.getVideoToolPanelHost();
                if (dockHost) {
                    this.container = dockHost;
                    return dockHost;
                }
            }
            this.container = document.getElementById('video-inspector-content');
            return this.container;
        }

        _activateTab(tab) {
            if (!this.mgr?.active) return;
            this.activeTab = tab;
            this.mgr?.openTimelineToolDock?.(tab);
            this.render();
        }

        _setActiveButtonState() {
            const tabs = {
                'clip': 've-clip-properties',
                'project': 've-project-settings',
                'audio': 've-audio-master',
                'color': 've-color-grade',
                'render': 've-render-export'
            };
            Object.values(tabs).forEach(id => document.getElementById(id)?.classList.remove('active'));
            if (!this.mgr?.active) return;
            const activeId = tabs[this.activeTab];
            if (activeId) document.getElementById(activeId)?.classList.add('active');
            document.querySelectorAll('#video-mode-tabs [data-mode]').forEach(btn => btn.classList.remove('active'));
            const modeMap = { clip: 'edit', project: 'edit', audio: 'audio', color: 'color', effects: 'fx', transitions: 'fx', render: 'deliver' };
            const mode = modeMap[this.activeTab];
            if (mode) document.querySelector(`#video-mode-tabs [data-mode="${mode}"]`)?.classList.add('active');
        }

        render() {
            this.container = this._resolveContainer();
            if (!this.container) return;
            if (!this.mgr?.active) {
                this.container.innerHTML = "";
                this._setActiveButtonState();
                return;
            }
            // Unbind previous UI to prevent memory leaks/multiple listeners
            this.container.innerHTML = "";
            if (this.activeTab === 'project') this._renderProject();
            else if (this.activeTab === 'audio') this._renderAudio();
            else if (this.activeTab === 'color') this._renderColor();
            else if (this.activeTab === 'effects') this._renderEffects();
            else if (this.activeTab === 'transitions') this._renderTransitions();
            else if (this.activeTab === 'render') this._renderRender();
            else this._renderClip();

            this._setActiveButtonState();
            this._bindTabEvents();
            this.refresh();
        }

        /* --- 1. PROJECT TAB --- */
        _renderProject() {
            this.container.innerHTML = `
<div class="vea-section-title" style="color:var(--video-accent); font-weight:bold; font-size:10px; margin: 5px 0 10px; border-bottom:1px solid #333; padding-bottom:5px;">PROJECT CONFIG</div>
<div class="vea-card">
<div class="vea-row">
    <label style="font-size:11px; color:#aaa; display:block; margin-bottom:4px;">Output Resolution</label>
    <select id="projRes" class="vea-select">
        <option value="720">HD 720p (1280x720)</option>
        <option value="1080">Full HD 1080p (1920x1080)</option>
        <option value="portrait">Vertical 9:16 (1080x1920)</option>
    </select>
</div>
<div class="vea-row" style="margin-top:12px;">
    <label style="font-size:11px; color:#aaa; display:block; margin-bottom:4px;">Frame Rate (FPS)</label>
    <select id="projFps" class="vea-select">
        <option value="24">24 Cinema</option>
        <option value="30" selected>30 Web</option>
        <option value="60">60 Gaming</option>
    </select>
</div>
<div class="vea-note" style="margin-top:10px;">Project size updates the video canvas immediately so the preview keeps matching your output framing.</div>
</div>
`;
        }

        /* --- 2. AUDIO TAB --- */
        _renderAudio() {
            this.container.innerHTML = `
<div class="vea-section-title" style="color:var(--video-accent); font-weight:bold; font-size:10px; margin: 5px 0 10px; border-bottom:1px solid #333; padding-bottom:5px;">MASTER MIXER</div>
<div class="vea-card">
<div class="vea-row">
    <div style="display:flex; justify-content:space-between; font-size:11px; color:#ccc; margin-bottom:6px;"><span>Gain</span><span id="masterGainVal">100%</span></div>
    <input type="range" id="masterGain" min="0" max="200" value="100" style="width:100%;">
</div>
<div id="vu-meter" style="margin-top:20px; background:#000; height:100px; position:relative; overflow:hidden; border-radius:3px;">
    <div id="v-L" style="position:absolute; bottom:0; left:30%; width:10%; background:#0f0; height:0%;"></div>
    <div id="v-R" style="position:absolute; bottom:0; left:50%; width:10%; background:#0f0; height:0%;"></div>
</div>
<div class="vea-note" style="margin-top:10px;">Use this panel for timeline-wide audio gain while editing.</div>
</div>
`;
        }

        /* --- 3. CLIP TAB --- */
        _renderClip() {
            this.container.innerHTML = `
<div class="vea-section-title" style="color:var(--video-accent); font-weight:bold; font-size:10px; margin: 5px 0 10px; border-bottom:1px solid #333; padding-bottom:5px;">CLIP TOOLS</div>
<div class="vea-card">
<div class="vea-button-row" style="margin-bottom:12px;">
    <button id="vea-center" class="panel-button" style="font-size:10px; padding:5px;"><i class="fas fa-align-center"></i> Center</button>
    <button id="vea-fit" class="panel-button" style="font-size:10px; padding:5px;"><i class="fas fa-expand"></i> Fit</button>
</div>
<div class="vea-grid-2">
    ${this._row('X', 'iX')} ${this._row('Y', 'iY')} 
    ${this._row('W', 'iW')} ${this._row('H', 'iH')}
</div>
<div class="vea-row" style="margin-top:10px;">
    <div style="justify-content:space-between; display:flex; font-size:10px; color:#888;"><span>Opacity</span><span id="ioVal">1.0</span></div>
    <input type="range" id="io" min="0" max="1" step="0.01" style="width:100%;">
</div>
<div class="vea-row" style="margin-top:10px;">
    <label style="font-size:11px; color:var(--video-text-muted);">Quick Effects</label>
    <div style="display:flex; align-items:center; gap:8px; margin-top:5px;">
        <input type="checkbox" id="iChEnable"> <span style="font-size:10px;">Chroma Key</span>
        <input type="color" id="iChColor" value="#00ff00" style="width:24px; border:none; background:none;">
        <button id="vea-open-effects" class="panel-button" style="margin-left:auto;font-size:9px;padding:3px 6px;">Open Effects</button>
    </div>
</div>
<div class="vea-note" style="margin-top:10px;">These controls affect the selected clip on the canvas and update live while you edit.</div>
</div>
`;
        }

        /* --- 4. COLOR GRADE TAB (DaVinci Resolve Inspired) --- */
        _renderColor() {
            this.colorSubTab = this.colorSubTab || 'primary';

            this.container.innerHTML = `
<div class="vea-color-tabs" style="display:flex; justify-content:space-between; background:#222; margin-bottom:10px; border-radius:3px; overflow:hidden;">
    <button class="vea-subtab-btn" data-tab="primary" style="flex:1; border:none; background:${this.colorSubTab === 'primary' ? 'var(--video-accent)' : 'transparent'}; color:#fff; font-size:9px; padding:6px; cursor:pointer;">Primary</button>
    <button class="vea-subtab-btn" data-tab="curves" style="flex:1; border:none; background:${this.colorSubTab === 'curves' ? 'var(--video-accent)' : 'transparent'}; color:#fff; font-size:9px; padding:6px; cursor:pointer;">Curves</button>
    <button class="vea-subtab-btn" data-tab="qualifier" style="flex:1; border:none; background:${this.colorSubTab === 'qualifier' ? 'var(--video-accent)' : 'transparent'}; color:#fff; font-size:9px; padding:6px; cursor:pointer;">Qualifier</button>
    <button class="vea-subtab-btn" data-tab="warper" style="flex:1; border:none; background:${this.colorSubTab === 'warper' ? 'var(--video-accent)' : 'transparent'}; color:#fff; font-size:9px; padding:6px; cursor:pointer;">Warper</button>
    <button class="vea-subtab-btn" data-tab="scopes" style="flex:1; border:none; background:${this.colorSubTab === 'scopes' ? 'var(--video-accent)' : 'transparent'}; color:#fff; font-size:9px; padding:6px; cursor:pointer;">Scopes</button>
</div>
<div id="color-sub-content"></div>
<div style="margin-top:15px; border-top:1px solid #333; padding-top:10px;">
    <button class="panel-button" style="width:100%; font-size:10px;" id="btn-reset-grade">RESET ALL COLOR</button>
</div>
`;
            this._renderColorSub();

            this.container.querySelectorAll('.vea-subtab-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    this.colorSubTab = btn.dataset.tab;
                    this.render();
                });
            });
        }

        _renderColorSub() {
            const sub = this.container.querySelector('#color-sub-content');
            if (this.colorSubTab === 'primary') this._renderPrimary(sub);
            else if (this.colorSubTab === 'curves') this._renderCurves(sub);
            else if (this.colorSubTab === 'qualifier') this._renderQualifier(sub);
            else if (this.colorSubTab === 'warper') this._renderWarper(sub);
            else if (this.colorSubTab === 'scopes') this._renderScopes(sub);
        }

        _renderEffects() {
            if (window.videoEffectsManager?.renderPanel) {
                window.videoEffectsManager.renderPanel(this.container, this.mgr);
                return;
            }
            this.container.innerHTML = `<div class="vea-card"><div class="vea-note">VideoEffectsManager.js is not loaded.</div></div>`;
        }

        _renderTransitions() {
            if (window.videoTransitionsManager?.renderPanel) {
                window.videoTransitionsManager.renderPanel(this.container, window.sequencerManager);
                return;
            }
            this.container.innerHTML = `<div class="vea-card"><div class="vea-note">VideoTransitionsManager.js is not loaded.</div></div>`;
        }

        _renderRender() {
            if (window.veaExportEngine?.renderPanel) {
                window.veaExportEngine.renderPanel(this.container, this.mgr);
                return;
            }
            this.container.innerHTML = `
<div class="vea-section-title" style="color:var(--video-accent);font-weight:bold;font-size:10px;margin:5px 0 10px;">RENDER & EXPORT</div>
<div class="vea-card"><div class="vea-note">VideoExportManager.js is not loaded yet.</div></div>`;
        }

        _renderPrimary(sub) {
            sub.innerHTML = `
<div class="vea-section-title" style="color:#888; font-size:9px; margin: 0 0 10px;">PRO COLOR WHEELS</div>
<div style="display:flex; flex-direction:column; gap:10px; margin-bottom:15px; background:#111; padding:10px; border-radius:5px;">
    <div style="display:flex; justify-content:space-between; text-align:center;">
        ${this._wheel('shadows', 'LIFT', '#3a86ff')}
        ${this._wheel('midtones', 'GAMMA', '#ffcc33')}
        ${this._wheel('highlights', 'GAIN', '#f72585')}
    </div>
</div>
<div class="vea-section-title" style="color:#888; font-size:9px; margin:10px 0 6px;">ADJUSTMENTS</div>
${this._slider('Temperature', 'iTemp', -100, 100)}
${this._slider('Tint', 'iTint', -100, 100)}
${this._slider('Saturation', 'iSa', 0, 200)}
${this._slider('Contrast', 'iCo', 0, 200)}
${this._slider('Exposure', 'iEx', -100, 100)}
`;
            this._initWheels();
        }

        _wheel(type, label, color) {
            return `
<div style="flex:1;">
    <div style="font-size:8px; color:${color}; margin-bottom:2px;">${label}</div>
    <div class="color-wheel" id="wheel-${type}" data-type="${type}" style="width:55px; height:55px; border-radius:50%; background:conic-gradient(red, yellow, green, cyan, blue, magenta, red); margin:0 auto; position:relative; border:2px solid #333; cursor:crosshair; box-shadow:inset 0 0 10px rgba(0,0,0,0.5);">
        <div class="wheel-knob" style="position:absolute; width:6px; height:6px; background:#fff; border-radius:50%; top:50%; left:50%; transform:translate(-50%,-50%); border:1px solid #000;"></div>
    </div>
</div>`;
        }

        _row(l, id) {
            return `<div style="display:flex;align-items:center;margin-bottom:4px;"><label style="width:14px;font-size:10px;color:#666;">${l}</label><input type="number" id="${id}" style="width:100%;background:#111;border:1px solid #333;color:#eee;font-size:10px;padding:2px;"></div>`;
        }

        _slider(l, id, min, max) {
            return `<div style="margin-bottom:6px;"><div style="display:flex;justify-content:space-between;font-size:9px;color:#aaa;"><span>${l}</span><span id="${id}Val">0</span></div><input type="range" id="${id}" min="${min}" max="${max}" value="0" style="width:100%;height:8px;accent-color:var(--video-accent);"></div>`;
        }

        _renderCurves(sub) {
            sub.innerHTML = `
<div class="vea-section-title" style="color:#888; font-size:9px; margin: 0 0 10px;">CUSTOM CURVES</div>
<div style="display:flex; gap:5px; margin-bottom:10px;">
    <button class="curve-chan-btn active" data-chan="luma" style="flex:1; background:#333; border:1px solid #444; color:#fff; font-size:8px; padding:3px;">Luma</button>
    <button class="curve-chan-btn" data-chan="red" style="flex:1; background:#333; border:1px solid #444; color:#f44; font-size:8px; padding:3px;">Red</button>
    <button class="curve-chan-btn" data-chan="green" style="flex:1; background:#333; border:1px solid #444; color:#4f4; font-size:8px; padding:3px;">Green</button>
    <button class="curve-chan-btn" data-chan="blue" style="flex:1; background:#333; border:1px solid #444; color:#44f; font-size:8px; padding:3px;">Blue</button>
</div>
<div id="curve-editor-box" style="width:100%; aspect-ratio:1; background:#000; position:relative; border:1px solid #333; cursor:crosshair;">
    <canvas id="curve-canvas" style="width:100%; height:100%;"></canvas>
</div>
<div style="display:flex; justify-content:space-between; margin-top:5px; font-size:8px; color:#555;">
    <span>Blacks</span><span>Mids</span><span>Whites</span>
</div>
`;
            this._initCurves();
        }

        _renderQualifier(sub) {
            sub.innerHTML = `
<div class="vea-section-title" style="color:#888; font-size:9px; margin: 0 0 10px;">HSL QUALIFIER</div>
<div style="background:#111; padding:8px; border-radius:4px;">
    ${this._slider('Hue Selection', 'iQualHue', 0, 360)}
    ${this._slider('Hue Width', 'iQualHueW', 0, 180)}
    <div style="height:10px; margin-bottom:10px; border-radius:5px; background:linear-gradient(to right, red, yellow, green, cyan, blue, magenta, red);"></div>
    ${this._slider('Sat Threshold', 'iQualSat', 0, 100)}
    ${this._slider('Lum Threshold', 'iQualLum', 0, 100)}
</div>
<div style="margin-top:10px; display:flex; gap:5px;">
    <button class="panel-button" style="flex:1; font-size:9px;">Invert</button>
    <button class="panel-button" style="flex:1; font-size:9px;">Clean Black</button>
</div>
`;
        }

        _renderWarper(sub) {
            sub.innerHTML = `
<div class="vea-section-title" style="color:#888; font-size:9px; margin: 0 0 10px;">COLOR WARPER</div>
<div id="warper-box" style="width:100%; aspect-ratio:1; background:#000; border-radius:50%; position:relative; overflow:hidden; border:2px solid #222;">
    <canvas id="warper-canvas" style="width:100%; height:100%; cursor:grab;"></canvas>
</div>
<div style="text-align:center; font-size:8px; color:#444; margin-top:5px;">DRAG POINTS TO WARP HUE/SAT</div>
`;
            this._initWarper();
        }

        _renderScopes(sub) {
            sub.innerHTML = `
<div class="vea-section-title" style="color:#888; font-size:9px; margin: 0 0 10px;">REAL-TIME SCOPES</div>
<div style="display:flex; flex-direction:column; gap:8px;">
    <div>
        <div style="font-size:8px; color:#aaa; margin-bottom:2px;">HISTOGRAM (RGB)</div>
        <canvas id="scope-histogram" style="width:100%; height:60px; background:#050505; border:1px solid #222;"></canvas>
    </div>
    <div>
        <div style="font-size:8px; color:#aaa; margin-bottom:2px;">WAVEFORM (LUMA)</div>
        <canvas id="scope-waveform" style="width:100%; height:80px; background:#050505; border:1px solid #222;"></canvas>
    </div>
    <div>
        <div style="font-size:8px; color:#aaa; margin-bottom:2px;">VECTORSCOPE</div>
        <canvas id="scope-vectorscope" style="width:100%; aspect-ratio:1; background:#050505; border:1px solid #222; border-radius:50%;"></canvas>
    </div>
</div>
`;
            this._initScopes();
        }

        _initWheels() {
            const wheels = this.container.querySelectorAll('.color-wheel');
            wheels.forEach(wheel => {
                wheel.addEventListener('mousedown', (e) => this._onWheelDrag(e, wheel));
            });
        }

        _initCurves() {
            const canvas = document.getElementById('curve-canvas');
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            const box = document.getElementById('curve-editor-box');
            canvas.width = 200; canvas.height = 200;

            this.curveChan = 'luma';
            const btns = this.container.querySelectorAll('.curve-chan-btn');
            btns.forEach(b => {
                b.addEventListener('click', () => {
                    btns.forEach(x => x.classList.remove('active'));
                    b.classList.add('active');
                    this.curveChan = b.dataset.chan;
                    this._drawCurves(ctx);
                });
            });

            this._drawCurves(ctx);

            let dragPt = null;
            const onDown = (e) => {
                const rect = box.getBoundingClientRect();
                const x = (e.clientX - rect.left) / rect.width;
                const y = 1 - (e.clientY - rect.top) / rect.height;

                const it = this._item();
                if (!it) return;
                it.curves = it.curves || { luma: [{ x: 0, y: 0 }, { x: 1, y: 1 }], red: [{ x: 0, y: 0 }, { x: 1, y: 1 }], green: [{ x: 0, y: 0 }, { x: 1, y: 1 }], blue: [{ x: 0, y: 0 }, { x: 1, y: 1 }] };
                const pts = it.curves[this.curveChan];

                // Find nearest
                dragPt = pts.find(p => Math.abs(p.x - x) < 0.05 && Math.abs(p.y - y) < 0.05);
                if (!dragPt && pts.length < 10) {
                    dragPt = { x, y };
                    pts.push(dragPt);
                    pts.sort((a, b) => a.x - b.x);
                }

                const onMove = (me) => {
                    if (!dragPt) return;
                    const r2 = box.getBoundingClientRect();
                    dragPt.x = Math.max(0, Math.min(1, (me.clientX - r2.left) / r2.width));
                    dragPt.y = Math.max(0, Math.min(1, 1 - (me.clientY - r2.top) / r2.height));
                    pts.sort((a, b) => a.x - b.x);
                    this._drawCurves(ctx);
                    this.mgr.renderCanvas();
                };
                const onUp = () => {
                    window.removeEventListener('mousemove', onMove);
                    window.removeEventListener('mouseup', onUp);
                    dragPt = null;
                };
                window.addEventListener('mousemove', onMove);
                window.addEventListener('mouseup', onUp);
            };
            box.addEventListener('mousedown', onDown);
        }

        _drawCurves(ctx) {
            const w = ctx.canvas.width;
            const h = ctx.canvas.height;
            ctx.clearRect(0, 0, w, h);

            ctx.strokeStyle = '#222';
            for (let i = 1; i < 4; i++) {
                ctx.beginPath(); ctx.moveTo(i * w / 4, 0); ctx.lineTo(i * w / 4, h); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(0, i * h / 4); ctx.lineTo(w, i * h / 4); ctx.stroke();
            }

            const it = this._item();
            const points = it?.curves?.[this.curveChan] || [{ x: 0, y: 0 }, { x: 1, y: 1 }];

            ctx.strokeStyle = this.curveChan === 'luma' ? '#fff' : (this.curveChan === 'red' ? '#f44' : (this.curveChan === 'green' ? '#4f4' : '#44f'));
            ctx.lineWidth = 2;
            ctx.beginPath();
            points.forEach((p, i) => {
                const px = p.x * w; const py = h - (p.y * h);
                if (i === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            });
            ctx.stroke();

            points.forEach(p => {
                const px = p.x * w; const py = h - (p.y * h);
                ctx.fillStyle = '#fff';
                ctx.beginPath(); ctx.arc(px, py, 3, 0, Math.PI * 2); ctx.fill();
            });
        }

        _initWarper() {
            const canvas = document.getElementById('warper-canvas');
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            canvas.width = 200; canvas.height = 200;

            const drawGrid = () => {
                ctx.clearRect(0, 0, 200, 200);
                ctx.strokeStyle = '#444';
                ctx.lineWidth = 1;
                ctx.beginPath();
                for (let r = 0; r < 4; r++) {
                    ctx.arc(100, 100, (r + 1) * 24, 0, Math.PI * 2);
                }
                for (let a = 0; a < 12; a++) {
                    const ang = (a / 12) * Math.PI * 2;
                    ctx.moveTo(100, 100);
                    ctx.lineTo(100 + Math.cos(ang) * 96, 100 + Math.sin(ang) * 96);
                }
                ctx.stroke();

                // Interactive points
                const it = this._item();
                const warps = it?.grade?.warper || [
                    { a: 0, d: 60 }, { a: 60, d: 60 }, { a: 120, d: 60 },
                    { a: 180, d: 60 }, { a: 240, d: 60 }, { a: 300, d: 60 }
                ];

                warps.forEach(p => {
                    const aRad = rad(p.a);
                    const qx = 100 + Math.cos(aRad) * p.d;
                    const qy = 100 + Math.sin(aRad) * p.d;
                    ctx.fillStyle = cssColor('--video-accent', '#e6855e');
                    ctx.beginPath(); ctx.arc(qx, qy, 5, 0, Math.PI * 2); ctx.fill();
                    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke();
                });
            };
            drawGrid();

            let activePt = null;
            canvas.onmousedown = (e) => {
                const rect = canvas.getBoundingClientRect();
                const mx = (e.clientX - rect.left) * (200 / rect.width);
                const my = (e.clientY - rect.top) * (200 / rect.height);

                const it = this._item();
                if (!it) return;
                it.grade = it.grade || {};
                it.grade.warper = it.grade.warper || [
                    { a: 0, d: 60 }, { a: 60, d: 60 }, { a: 120, d: 60 },
                    { a: 180, d: 60 }, { a: 240, d: 60 }, { a: 300, d: 60 }
                ];

                activePt = it.grade.warper.find(p => {
                    const r = rad(p.a);
                    return Math.hypot(mx - (100 + Math.cos(r) * p.d), my - (100 + Math.sin(r) * p.d)) < 10;
                });

                const onMove = (me) => {
                    if (!activePt) return;
                    const r2 = canvas.getBoundingClientRect();
                    const nx = (me.clientX - r2.left) * (200 / r2.width) - 100;
                    const ny = (me.clientY - r2.top) * (200 / r2.height) - 100;
                    activePt.d = Math.min(95, Math.hypot(nx, ny));
                    activePt.a = deg(Math.atan2(ny, nx));
                    drawGrid();
                    this.mgr.renderCanvas();
                };
                const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
                window.addEventListener('mousemove', onMove);
                window.addEventListener('mouseup', onUp);
            };
        }

        _initScopes() {
            if (this._scopeLoop) return;
            this._scopeLoop = true;

            const update = () => {
                if (this.activeTab !== 'color' || this.colorSubTab !== 'scopes') {
                    this._scopeLoop = false;
                    return;
                }

                if (this.mgr.active && this.mgr.canvas) {
                    this._processRealTimeScopes();
                }
                requestAnimationFrame(update);
            };
            update();
        }

        _processRealTimeScopes() {
            const mCanvas = this.mgr.canvas;
            const mCtx = this.mgr.ctx;

            // Sample canvas (scaled down for performance)
            const sw = 160, sh = 90;
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = sw; tempCanvas.height = sh;
            const tCtx = tempCanvas.getContext('2d');
            tCtx.drawImage(mCanvas, 0, 0, sw, sh);

            const imgData = tCtx.getImageData(0, 0, sw, sh);
            const data = imgData.data;

            // 1. HISTOGRAM
            const histCanvas = document.getElementById('scope-histogram');
            if (histCanvas) {
                const ctx = histCanvas.getContext('2d');
                const w = histCanvas.width = histCanvas.clientWidth;
                const h = histCanvas.height = histCanvas.clientHeight;
                ctx.clearRect(0, 0, w, h);

                const r = new Uint32Array(256), g = new Uint32Array(256), b = new Uint32Array(256);
                for (let i = 0; i < data.length; i += 4) {
                    r[data[i]]++; g[data[i + 1]]++; b[data[i + 2]]++;
                }

                const max = Math.max(...r, ...g, ...b) || 1;
                const drawChan = (arr, col) => {
                    ctx.strokeStyle = col; ctx.beginPath();
                    for (let i = 0; i < 256; i++) {
                        const x = (i / 256) * w; const y = h - (arr[i] / max) * h;
                        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                    }
                    ctx.stroke();
                };
                ctx.globalCompositeOperation = 'screen';
                drawChan(r, '#f44'); drawChan(g, '#4f4'); drawChan(b, '#44f');
                ctx.globalCompositeOperation = 'source-over';
            }

            // 2. WAVEFORM
            const waveCanvas = document.getElementById('scope-waveform');
            if (waveCanvas) {
                const ctx = waveCanvas.getContext('2d');
                const w = waveCanvas.width = waveCanvas.clientWidth;
                const h = waveCanvas.height = waveCanvas.clientHeight;
                ctx.clearRect(0, 0, w, h);
                ctx.fillStyle = 'rgba(255,255,255,0.05)';

                for (let x = 0; x < sw; x++) {
                    const screenX = (x / sw) * w;
                    for (let y = 0; y < sh; y++) {
                        const idx = (y * sw + x) * 4;
                        const lum = (data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114);
                        const screenY = h - (lum / 255) * h;
                        ctx.fillRect(screenX, screenY, 1, 1);
                    }
                }
            }

            // 3. VECTORSCOPE
            const vectCanvas = document.getElementById('scope-vectorscope');
            if (vectCanvas) {
                const ctx = vectCanvas.getContext('2d');
                const w = vectCanvas.width = vectCanvas.clientWidth;
                const h = vectCanvas.height = vectCanvas.clientHeight;
                ctx.clearRect(0, 0, w, h);

                const cx = w / 2, cy = h / 2, rLimit = (w / 2) - 5;
                ctx.strokeStyle = '#222'; ctx.beginPath(); ctx.arc(cx, cy, rLimit, 0, Math.PI * 2); ctx.stroke();

                ctx.fillStyle = 'rgba(100, 255, 255, 0.2)';
                for (let i = 0; i < data.length; i += 16) { // Subsample
                    const r = data[i], g = data[i + 1], b = data[i + 2];
                    const u = (-0.14713 * r - 0.28886 * g + 0.436 * b);
                    const v = (0.615 * r - 0.51499 * g - 0.10001 * b);
                    ctx.fillRect(cx + u, cy - v, 1, 1);
                }
            }
        }

        _item() { return this.mgr.items.find(i => i.selected); }
        _set(k, v) { const i = this._item(); if (i) { i[k] = v; this.mgr.renderCanvas(); } }
        _setGrade(k, v) { const i = this._item(); if (i) { i.grade = i.grade || {}; i.grade[k] = v; this.mgr.renderCanvas(); } }
        _setFx(k, v) { const i = this._item(); if (i) { i.fx = i.fx || {}; i.fx[k] = v; this.mgr.renderCanvas(); } }

        refresh() {
            const i = this._item(); if (!i) return;
            const el = this.container;
            const set = (id, v) => { const x = el.querySelector(`#${id}`); if (x) x.value = v; };
            const txt = (id, v) => { const x = el.querySelector(`#${id}`); if (x) x.textContent = v; };

            if (this.activeTab === 'clip') {
                set('iX', Math.round(i.x)); set('iY', Math.round(i.y));
                set('iW', Math.round(i.w)); set('iH', Math.round(i.h));
                set('io', i.opacity ?? 1); txt('ioVal', (i.opacity ?? 1).toFixed(2));
            } else if (this.activeTab === 'color') {
                // Update wheels
                const g = i.grade || {};
                const updateWheel = (id, type) => {
                    const w = el.querySelector(`#wheel-${id}`);
                    const knob = w?.querySelector('.wheel-knob');
                    if (!knob) return;
                    const pos = g[type] || { x: 0, y: 0 };
                    const centerX = w.offsetWidth / 2;
                    const centerY = w.offsetHeight / 2;
                    const radius = (centerX - 5);
                    knob.style.left = (centerX + pos.x * radius) + 'px';
                    knob.style.top = (centerY + pos.y * radius) + 'px';
                };
                updateWheel('shadows', 'shadows');
                updateWheel('midtones', 'midtones');
                updateWheel('highlights', 'highlights');
            }
        }

        _onWheelDrag(e, wheel) {
            const item = this._item();
            if (!item) return;

            // Capture state before drag begins
            const _histToken = window.veHistory?.begin(`Color Wheel: ${wheel.dataset.type || 'adjust'}`, 'color') ?? null;

            const update = (me) => {
                const rect = wheel.getBoundingClientRect();
                const centerX = rect.width / 2;
                const centerY = rect.height / 2;
                const x = me.clientX - rect.left - centerX;
                const y = me.clientY - rect.top - centerY;

                const dist = Math.sqrt(x * x + y * y);
                const maxD = centerX - 5;
                const fx = (dist > maxD) ? (x / dist * maxD) : x;
                const fy = (dist > maxD) ? (y / dist * maxD) : y;

                const knob = wheel.querySelector('.wheel-knob');
                knob.style.left = (centerX + fx) + 'px';
                knob.style.top = (centerY + fy) + 'px';

                item.grade = item.grade || {};
                const type = wheel.dataset.type;
                item.grade[type] = { x: fx / maxD, y: fy / maxD };
                this.mgr.renderCanvas();
            };

            const onMove = (me) => update(me);
            const onUp = () => {
                window.removeEventListener('mousemove', onMove);
                window.removeEventListener('mouseup', onUp);
                // Commit history after drag ends
                if (_histToken) window.veHistory?.commit(_histToken);
            };
            window.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup', onUp);
            update(e);
        }

        _bindTabEvents() {
            const el = this.container;
            const bind = (id, setter) => el.querySelector(`#${id}`)?.addEventListener('input', (e) => setter(e.target.value));

            if (this.activeTab === 'color') {
                const bindColorSlider = (id, key, def = 0) => {
                    const s = el.querySelector(`#${id}`);
                    const v = el.querySelector(`#${id}Val`);
                    if (!s) return;
                    s.value = this._item()?.grade?.[key] ?? def;
                    if (v) v.textContent = s.value;

                    // Record on commit (change), live-update on input
                    let _histToken = null;
                    s.addEventListener('mousedown', () => {
                        _histToken = window.veHistory?.begin(`Color: ${key}`, 'color') ?? null;
                    });
                    s.addEventListener('input', () => {
                        if (v) v.textContent = s.value;
                        this._setGrade(key, +s.value);
                    });
                    s.addEventListener('change', () => {
                        if (_histToken) { window.veHistory?.commit(_histToken); _histToken = null; }
                    });
                };

                if (this.colorSubTab === 'primary') {
                    bindColorSlider('iTemp', 'temp');
                    bindColorSlider('iTint', 'tint');
                    bindColorSlider('iSa', 'saturation', 100);
                    bindColorSlider('iCo', 'contrast', 100);
                    bindColorSlider('iEx', 'exposure');
                } else if (this.colorSubTab === 'qualifier') {
                    bindColorSlider('iQualHue', 'qualHue');
                    bindColorSlider('iQualHueW', 'qualHueW');
                    bindColorSlider('iQualSat', 'qualSat');
                    bindColorSlider('iQualLum', 'qualLum');
                }

                el.querySelector('#btn-reset-grade')?.addEventListener('click', () => {
                    const it = this._item();
                    if (it) {
                        window.veHistory?.record('Reset Color Grade', 'color', () => {
                            it.grade = {};
                            it.curves = {};
                        });
                        this.render();
                        this.mgr.renderCanvas();
                    }
                });

            } else if (this.activeTab === 'clip') {
                bind('iX', v => this._set('x', +v));
                bind('iY', v => this._set('y', +v));
                bind('iW', v => this._set('w', +v));
                bind('iH', v => this._set('h', +v));
                bind('io', v => { el.querySelector('#ioVal').textContent = v; this._set('opacity', +v); });
                bind('iChEnable', v => this._setFx('chromaEnable', el.querySelector('#iChEnable').checked));
                bind('iChColor', v => this._setFx('chromaColor', v));
                el.querySelector('#vea-open-effects')?.addEventListener('click', () => this._activateTab('effects'));

                el.querySelector('#vea-center')?.addEventListener('click', () => {
                    const it = this._item(); if (!it) return;
                    window.veHistory?.record('Center Clip', 'transform', () => {
                        it.x = (this.mgr.resolution.w / 2) - (it.w / 2);
                        it.y = (this.mgr.resolution.h / 2) - (it.h / 2);
                    });
                    this.mgr.renderCanvas(); this.refresh();
                });
                el.querySelector('#vea-fit')?.addEventListener('click', () => {
                    const it = this._item(); if (!it) return;
                    window.veHistory?.record('Fit Clip to Canvas', 'transform', () => {
                        it.x = 0; it.y = 0; it.w = this.mgr.resolution.w; it.h = this.mgr.resolution.h;
                    });
                    this.mgr.renderCanvas(); this.refresh();
                });
            } else if (this.activeTab === 'audio') {
                const mg = el.querySelector('#masterGain');
                if (mg) {
                    mg.value = (this.mgr.masterGain || 1) * 100;
                    el.querySelector('#masterGainVal').textContent = mg.value + '%';
                    mg.addEventListener('input', (e) => {
                        const v = +e.target.value;
                        el.querySelector('#masterGainVal').textContent = v + '%';
                        this.mgr.masterGain = v / 100;
                        if (this.mgr.syncAudio) this.mgr.syncAudio();
                    });
                }
            } else if (this.activeTab === 'project') {
                const resField = el.querySelector('#projRes');
                const fpsField = el.querySelector('#projFps');
                if (resField) {
                    const currentRes = `${this.mgr.resolution.w}x${this.mgr.resolution.h}`;
                    resField.value = currentRes === '1920x1080' ? '1080' : currentRes === '1080x1920' ? 'portrait' : '720';
                    resField.addEventListener('change', () => {
                        const map = {
                            '720': { w: 1280, h: 720 },
                            '1080': { w: 1920, h: 1080 },
                            'portrait': { w: 1080, h: 1920 }
                        };
                        this.mgr.resolution = map[resField.value] || { w: 1280, h: 720 };
                        this.mgr.canvasController?.resetView?.();
                        this.mgr.renderCanvas();
                    });
                }
                if (fpsField) {
                    fpsField.value = String(this.mgr.tl.fps || 30);
                    fpsField.addEventListener('change', () => {
                        this.mgr.tl.fps = Math.max(1, Number(fpsField.value) || 30);
                        this.mgr.renderTimeline?.();
                        this.mgr.updatePlayhead?.();
                    });
                }
            } else if (this.activeTab === 'render') {
                el.querySelector('#vea-refresh-preview')?.addEventListener('click', () => {
                    this.mgr.scheduleLayoutRefresh?.({ canvas: true, timeline: false, force: true });
                });
                el.querySelector('#vea-open-export-engine')?.addEventListener('click', () => {
                    if (window.veaExportEngine?.open) {
                        window.veaExportEngine.open();
                        return;
                    }
                    const note = document.createElement('div');
                    note.className = 'vea-note';
                    note.textContent = 'Export backend is not connected yet in this build.';
                    el.appendChild(note);
                });
            }
        }
    }

    /* ------------------------------------------------------------------ */
    /*  PROFESSIONAL COLOR PROCESSING (SVG Filters / Canvas Shader)        */
    /* ------------------------------------------------------------------ */
    function applyProfessionalColor(ctx, item) {
        const i = item || {};
        const g = i.grade || {};

        /*
         * IMPORTANT — TWO GRADE SCHEMAS EXIST IN SM ENGINE
         * -------------------------------------------------
         *
         * Legacy advanced editor:
         *   contrast   = 100
         *   saturation = 100
         *   exposure   = percentage
         *
         * New Color Studio / VideoProject clip state:
         *   contrast   = 1
         *   saturation = 1
         *   exposure   = stops
         *   wheels     = {...}
         *
         * The old renderer blindly divided every value by 100.
         * Therefore a perfectly neutral new grade:
         *
         *   contrast: 1
         *   saturation: 1
         *
         * became:
         *
         *   contrast(0.01)
         *   saturate(0.01)
         *
         * which explains the almost completely flat gray/white image/video.
         */
        const isNormalizedGrade =
            g.__smSchema === 'normalized-v1' ||
            !!g.wheels ||
            Object.prototype.hasOwnProperty.call(g, 'temperature') ||
            (
                Number.isFinite(Number(g.contrast)) &&
                Number.isFinite(Number(g.saturation)) &&
                Math.abs(Number(g.contrast)) <= 4 &&
                Math.abs(Number(g.saturation)) <= 4
            );

        const rawContrast = Number(
            g.contrast ??
            (isNormalizedGrade ? 1 : 100)
        );

        const rawSaturation = Number(
            g.saturation ??
            (isNormalizedGrade ? 1 : 100)
        );

        const rawExposure = Number(
            g.exposure ?? 0
        );

        const contrast = Math.max(
            0,
            isNormalizedGrade
                ? rawContrast
                : rawContrast / 100
        );

        const saturation = Math.max(
            0,
            isNormalizedGrade
                ? rawSaturation
                : rawSaturation / 100
        );

        /*
         * New Color Studio exposure is measured in stops.
         * Legacy exposure is a percentage brightness delta.
         */
        const brightness = Math.max(
            0.001,
            isNormalizedGrade
                ? Math.pow(2, rawExposure)
                : 1 + rawExposure / 100
        );

        let f =
            `saturate(${saturation}) ` +
            `contrast(${contrast}) ` +
            `brightness(${brightness})`;

        /*
         * Do NOT attach an SVG url() filter for an empty/default curve set.
         * Canvas 2D + SVG URL filters are unreliable in Chromium/Electron
         * and were being applied even when `item.curves = {}`.
         */
        const curveChannels = [
            i.curves?.red,
            i.curves?.green,
            i.curves?.blue
        ];

        const curveChanged = curveChannels.some(points => {
            if (!Array.isArray(points) || points.length < 2) {
                return false;
            }

            if (points.length !== 2) {
                return true;
            }

            const a = points[0];
            const b = points[1];

            return !(
                Math.abs(Number(a?.x ?? 0)) < 0.000001 &&
                Math.abs(Number(a?.y ?? 0)) < 0.000001 &&
                Math.abs(Number(b?.x ?? 1) - 1) < 0.000001 &&
                Math.abs(Number(b?.y ?? 1) - 1) < 0.000001
            );
        });

        if (curveChanged) {
            const safeId = String(i.id || 'item')
                .replace(/[^a-zA-Z0-9]/g, '_');

            updateCurveFilter(
                i.id || safeId,
                i.curves
            );

            f += ` url(#vea-filter-${safeId})`;
        }

        ctx.filter = f;

        /*
         * Keep wheel metadata available for the later GPU YRGB pass.
         * Do not paint a full-frame overlay here: color-wheel math belongs
         * to the dedicated color evaluator, not the base media draw path.
         */
    }

    /* ------------------------------------------------------------------ */
    /*  BOOTSTRAP                                                          */
    /* ------------------------------------------------------------------ */
    waitForManager(mgr => {
        const inspector = new TabbedInspector(mgr);

        // Transition preview bridge: fade/dissolve multipliers are applied
        // to active sequencer clips before the compositor draws them.
        if (!mgr.__transitionPreviewPatched && mgr.renderCompositeAt) {
            mgr.__transitionPreviewPatched = true;
            const originalComposite = mgr.renderCompositeAt.bind(mgr);
            mgr.renderCompositeAt = function(time) {
                const seq = window.sequencerManager;
                const tm = window.videoTransitionsManager;
                const touched = [];
                if (seq?.state?.clips && tm?.opacityMultiplier) {
                    seq.state.clips.forEach(clip => {
                        const item = this.items?.find?.(it => it.id === clip.mediaRef);
                        if (!item) return;
                        const m = tm.opacityMultiplier(clip, time);
                        if (m !== 1) {
                            touched.push([item, item.opacity]);
                            item.opacity = (item.opacity ?? 1) * m;
                        }
                    });
                }
                try { return originalComposite(time); }
                finally { touched.forEach(([item,opacity]) => item.opacity = opacity); }
            };
        }

        // Render Canvas Patch
        const origRender = mgr.renderCanvas.bind(mgr);
        mgr.renderCanvas = function () {
            origRender();
            if (this.active) inspector.refresh();
        };

        // Inject Color Logic into Canvas Controller.
        // Guard it because Electron hot reload / duplicate script tags can
        // otherwise wrap drawItem repeatedly.
        if (
            mgr.canvasController &&
            !mgr.canvasController.__veaColorPipelinePatched
        ) {
            const cc = mgr.canvasController;

            cc.__veaColorPipelinePatched = true;

            const origDraw = cc.drawItem.bind(cc);

            cc.drawItem = function (item) {
                const ctx = this.ctx;

                if (!ctx) {
                    return origDraw(item);
                }

                ctx.save();

                try {
                    /*
                     * Start from a known filter state for every item.
                     * A previous media/effect draw must never leak its filter
                     * into the next clip.
                     */
                    ctx.filter = 'none';

                    applyProfessionalColor(
                        ctx,
                        item
                    );

                    if (
                        window.videoEffectsManager
                            ?.buildCanvasFilter
                    ) {
                        ctx.filter =
                            window.videoEffectsManager
                                .buildCanvasFilter(
                                    item,
                                    ctx.filter
                                );
                    }

                    return origDraw(item);
                } finally {
                    ctx.restore();
                }
            };
        }

        document.getElementById('video-add-adjustment')?.addEventListener('click', () => {
            const seq = window.sequencerManager;
            if (!seq) return;
            const clip = seq.addClip?.('solid', {
                name: 'Adjustment Layer',
                start: seq.state.playhead,
                duration: 5,
                color: '#000000',
                opacity: 0,
                isAdjustmentLayer: true,
                effects: []
            });
            if (clip) {
                seq.state.selectClip?.(clip, false);
                seq.renderer?.render?.();
                inspector._activateTab('effects');
            }
        });

        console.log('[VEA] Professional Video Tool Suite Loaded');
    });

})();