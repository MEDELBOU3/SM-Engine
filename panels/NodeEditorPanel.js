// SM Engine Panel: NodeEditorPanel
window.NodeEditorPanel = {
    activeTab: 'animation-graph-wrapper',
    initializedEditors: new Set(),
    init() {
        const gnec = document.getElementById('global-node-editor-container');
        if (!gnec) {
            console.error('[NodeEditorPanel] #global-node-editor-container not found');
            return;
        }
        const needsRebuild = !gnec.querySelector('.node-mode-bar') || !gnec.querySelector('#animation-graph-wrapper') || !gnec.querySelector('#animation-graph-host');
        if (needsRebuild) {
            gnec.innerHTML = `
                <div class="node-mode-bar">
                    <div class="node-mode-brand">
                        <span class="mode-label">System</span>
                        <div class="node-mode-heading">
                            <strong title="Visual logic, animation, materials, VFX, terrain and audio graphs.">Graph Workspace</strong>
                            <span>Docked editor for logic, animation and visual scripting</span>
                        </div>
                    </div>
                    <div class="node-mode-tabs" role="tablist" aria-label="Node editor modes">
                        <button class="node-tab active" id="open-player-graph" data-target="animation-graph-wrapper" type="button">
                            <span class="node-tab-label">Player Animation</span>
                        </button>
                        <button class="node-tab" data-target="vfx-graph-wrapper" type="button">
                            <span class="node-tab-label">VFX Composer</span>
                        </button>
                        <button class="node-tab" data-target="terrain-graph-wrapper" type="button">
                            <span class="node-tab-label">Terrain Generator</span>
                        </button>
                        <button class="node-tab" data-target="material-graph-wrapper" type="button">
                            <span class="node-tab-label">Material Graph</span>
                        </button>
                        <button class="node-tab" data-target="geometry-graph-wrapper" type="button">
                            <span class="node-tab-label">Geometry Nodes</span>
                        </button>
                        <button class="node-tab" data-target="sound-graph-wrapper" type="button">
                            <span class="node-tab-label">MetaSound</span>
                        </button>
                    </div>
                    <div class="node-mode-actions">
                        <span class="node-toolbar-indicator">Docked Workspace</span>
                        <span class="node-toolbar-indicator">Live Preview</span>
                        <button class="node-expand-btn" id="node-editor-expand" type="button">
                            <i class="fas fa-expand"></i> Expand
                        </button>
                    </div>
                </div>
                <div class="node-editor-statusbar">
                    <span class="node-status-item"><strong>Mode</strong> <span id="node-status-mode">Animation Blueprint</span></span>
                    <span class="node-status-item"><strong>Workspace</strong> <span id="node-status-workspace">Player Animation</span></span>
                    <span class="node-status-item"><strong>Canvas</strong> Realtime Graph</span>
                </div>
                <div class="node-editor-body">
                    <div id="animation-graph-wrapper" class="node-sub-editor active" style="display:flex;">
                        <div id="animation-graph-host" style="display:flex;width:100%;height:100%;min-width:0;min-height:0;flex:1 1 auto;overflow:hidden;"></div>
                    </div>
                    <div id="vfx-graph-wrapper" class="node-sub-editor" style="display:none;">
                        <div class="node-editor-loading-state">
                            <div class="node-editor-loading-badge">VFX Composer</div>
                            <h3>Initializing graph editor</h3>
                            <p>Loading the effect canvas and simulation tools.</p>
                        </div>
                    </div>
                    <div id="terrain-graph-wrapper" class="node-sub-editor" style="display:none;">
                        <div id="terrain-editor-host" style="display:flex;width:100%;height:100%;min-height:0;flex:1 1 auto;background:#111114;"></div>
                    </div>
                    <div id="material-graph-wrapper" class="node-sub-editor" style="display:none;">
                        <div class="node-editor-loading-state">
                            <div class="node-editor-loading-badge">Material Graph</div>
                            <h3>Initializing material editor</h3>
                            <p>Building the shader canvas and material tools.</p>
                        </div>
                    </div>
                    <div id="geometry-graph-wrapper" class="node-sub-editor" style="display:none;">
                        <div class="node-editor-loading-state">
                            <div class="node-editor-loading-badge">Geometry Nodes</div>
                            <h3>Initializing geometry editor</h3>
                            <p>Preparing the procedural mesh node workspace.</p>
                        </div>
                    </div>
                    <div id="sound-graph-wrapper" class="node-sub-editor" style="display:none;">
                        <div class="node-editor-loading-state">
                            <div class="node-editor-loading-badge">MetaSound</div>
                            <h3>Initializing audio editor</h3>
                            <p>Preparing the sound node workspace.</p>
                        </div>
                    </div>
                </div>
            `;
            this.initializedEditors.clear();
        }
        const nem = document.getElementById('nodeEditorModal');
        if (nem && !nem.querySelector('.node-editor-modal-content')) {
            nem.innerHTML = `
                <div class="node-editor-modal-content">
                    <div class="node-editor-modal-header">
                        <h2>Advanced Terrain Node Editor</h2>
                        <div class="modal-controls">
                            <button id="resizeNodeEditorBtn" title="Toggle size" type="button">⤢</button>
                            <button id="closeNodeEditorBtn" title="Close" type="button">✕</button>
                        </div>
                    </div>
                    <div id="nodeEditorModalBody">
                        <div id="nodeEditorWorkspace"></div>
                    </div>
                </div>
            `;
        }
        this._bindEvents(gnec);
        window.SMEditorExpansion?.init?.();
        window.SMEditorExpansion?.prepare?.('nodesEditor');

        let initialTarget = localStorage.getItem('sm_node_editor_tab') || 'animation-graph-wrapper';
        if (initialTarget === 'player-graph-wrapper') {
            initialTarget = 'animation-graph-wrapper';
        }
        if (!document.getElementById(initialTarget)) {
            initialTarget = 'animation-graph-wrapper';
        }
        this.openTab(initialTarget, false);
        console.log('[NodeEditorPanel] initialized');
    },
    _bindEvents(container) {
        if (!container.dataset.nodeEditorTabsBound) {
            container.dataset.nodeEditorTabsBound = '1';
            container.addEventListener('click', (event) => {
                const tab = event.target.closest('.node-tab');
                if (!tab) return;
                const targetId = tab.dataset.target;
                if (!targetId) return;
                this.openTab(targetId);
            });
        }
        const expandButton = document.getElementById('node-editor-expand');
        if (expandButton && !expandButton.dataset.bound) {
            expandButton.dataset.bound = '1';
            expandButton.dataset.editorExpand = 'nodesEditor';
            expandButton.innerHTML = '<i class="fas fa-expand"></i>';
            expandButton.title = 'Expand Nodes editor';
            expandButton.setAttribute('aria-label', 'Expand Nodes editor');
        }

        // The shared SMEditorExpansion system owns document-style expansion.
        window.SMEditorExpansion?.prepare?.('nodesEditor');
        const closeButton = document.getElementById('closeNodeEditorBtn');
        if (closeButton && !closeButton.dataset.bound) {
            closeButton.dataset.bound = '1';
            closeButton.addEventListener('click', () => {
                const modal = document.getElementById('nodeEditorModal');
                if (modal) modal.style.display = 'none';
            });
        }
        const resizeButton = document.getElementById('resizeNodeEditorBtn');
        if (resizeButton && !resizeButton.dataset.bound) {
            resizeButton.dataset.bound = '1';
            resizeButton.addEventListener('click', () => {
                document.querySelector('.node-editor-modal-content')?.classList.toggle('maximized');
            });
        }
    },
    openTab(targetId, persist = true) {
        const container = document.getElementById('global-node-editor-container');
        const target = document.getElementById(targetId);
        if (!container || !target) {
            console.warn('[NodeEditorPanel] Unknown tab:', targetId);
            return;
        }
        container.querySelectorAll('.node-sub-editor').forEach((editor) => {
            const active = editor.id === targetId;
            editor.classList.toggle('active', active);
            editor.style.display = active ? 'flex' : 'none';
        });
        container.querySelectorAll('.node-tab').forEach((button) => {
            const active = button.dataset.target === targetId;
            button.classList.toggle('active', active);
            button.setAttribute('aria-selected', active ? 'true' : 'false');
        });
        this.activeTab = targetId;
        if (persist) {
            localStorage.setItem('sm_node_editor_tab', targetId);
        }
        this._updateStatus(targetId);
        this._ensureEditor(targetId);
        window.dispatchEvent(new CustomEvent('sm:node-editor-tab-changed', { detail: { target: targetId } }));
    },
    _ensureEditor(targetId) {
        if (this.initializedEditors.has(targetId)) {
            this._notifyEditorVisible(targetId);
            return;
        }
        let initialized = true;
        switch (targetId) {
            case 'animation-graph-wrapper':
                initialized = this._initializeAnimationGraph();
                break;
            case 'vfx-graph-wrapper':
                this._initializeVFXGraph();
                break;
            case 'terrain-graph-wrapper':
                this._initializeTerrainGraph();
                break;
            case 'material-graph-wrapper':
                this._initializeMaterialGraph();
                break;
            case 'geometry-graph-wrapper':
                this._initializeGeometryGraph();
                break;
            case 'sound-graph-wrapper':
                this._initializeSoundGraph();
                break;
            default:
                initialized = false;
                break;
        }
        if (initialized !== false) {
            this.initializedEditors.add(targetId);
        }
    },
    _initializeAnimationGraph() {
        console.log('[NodeEditorPanel] Opening Player Animation Graph');
        const host = document.getElementById('animation-graph-host');
        if (!host) {
            console.error('[AnimationGraph] #animation-graph-host NOT FOUND');
            return false;
        }
        if (window.AnimationGraphPanel && typeof window.AnimationGraphPanel.init === 'function') {
            try {
                window.AnimationGraphPanel.init(host);
                console.log('[AnimationGraph] AnimationGraphPanel initialized');
                return true;
            } catch (error) {
                console.error('[AnimationGraph] AnimationGraphPanel.init failed:', error);
                host.innerHTML = `<div class="node-editor-loading-state"><div class="node-editor-loading-badge">Animation Graph</div><h3>Animation Graph failed to initialize</h3><p>${String(error?.message || error)}</p></div>`;
                return false;
            }
        }
        console.error('[AnimationGraph] AnimationGraphPanel.js NOT LOADED');
        host.innerHTML = `<div class="node-editor-loading-state"><div class="node-editor-loading-badge">Animation Graph</div><h3>Animation Graph module is not loaded</h3><p>Load panels/animationGraphPanel.js before NodeEditorPanel.js.</p></div>`;
        return false;
    },
    _initializeVFXGraph() {
        window.VFXGraphEditor?.init?.(document.getElementById('vfx-graph-wrapper'));
    },
    _initializeTerrainGraph() {
        const host = document.getElementById('terrain-editor-host');
        if (!host) return;
        if (window.terrainNodeEditor?.mount) {
            window.terrainNodeEditor.mount(host);
            return;
        }
        if (window.ensureTerrainNodeEditor) {
            const editor = window.ensureTerrainNodeEditor();
            editor?.mount?.(host);
        }
    },
    _initializeMaterialGraph() {
        window.MaterialGraphEditor?.init?.(document.getElementById('material-graph-wrapper'));
    },
    _initializeGeometryGraph() {
        window.GeometryNodeEditor?.init?.(document.getElementById('geometry-graph-wrapper'));
    },
    _initializeSoundGraph() {
        const host = document.getElementById('sound-graph-wrapper');

        if (!host) {
            console.error('[MetaSound] #sound-graph-wrapper NOT FOUND');
            return false;
        }

        if (
            !window.MetaSoundEditor ||
            typeof window.MetaSoundEditor.init !== 'function'
        ) {
            console.error('[MetaSound] MetaSoundEditor.js NOT LOADED');

            host.innerHTML = `
                <div class="node-editor-loading-state">
                    <div class="node-editor-loading-badge">MetaSound</div>
                    <h3>MetaSound module is not loaded</h3>
                    <p>Load engine/soundes/MetaSoundEditor/MetaSoundEditor.js before NodeEditorPanel.js.</p>
                </div>
            `;

            return false;
        }

        try {
            const result = window.MetaSoundEditor.init(host);

            if (result === false) {
                return false;
            }

            requestAnimationFrame(() => {
                window.MetaSoundEditor?.onVisible?.();
                window.MetaSoundEditor?.resize?.();
                window.MetaSoundEditor?.redraw?.();
            });

            console.log('[MetaSound] MetaSoundEditor initialized');

            return true;
        } catch (error) {
            console.error('[MetaSound] initialization failed:', error);

            host.innerHTML = `
                <div class="node-editor-loading-state">
                    <div class="node-editor-loading-badge">MetaSound</div>
                    <h3>MetaSound failed to initialize</h3>
                    <p>${String(error?.message || error)}</p>
                </div>
            `;

            return false;
        }
    },
    _notifyEditorVisible(targetId) {
        if (targetId === 'animation-graph-wrapper') {
            window.AnimationGraphPanel?.onVisible?.();
            window.AnimationGraphEditor?.onVisible?.();
            window.AnimationGraphEditor?.resize?.();
        }
        if (targetId === 'terrain-graph-wrapper') {
            window.terrainNodeEditor?.onVisible?.();
        }

        if (targetId === 'sound-graph-wrapper') {
            requestAnimationFrame(() => {
                window.MetaSoundEditor?.onVisible?.();
                window.MetaSoundEditor?.resize?.();
                window.MetaSoundEditor?.redraw?.();
            });
        }
    },
    _updateStatus(targetId) {
        const workspace = document.getElementById('node-status-workspace');
        const mode = document.getElementById('node-status-mode');
        const labels = {
            'animation-graph-wrapper': 'Player Animation',
            'vfx-graph-wrapper': 'VFX Composer',
            'terrain-graph-wrapper': 'Terrain Generator',
            'material-graph-wrapper': 'Material Graph',
            'geometry-graph-wrapper': 'Geometry Nodes',
            'sound-graph-wrapper': 'MetaSound'
        };
        if (workspace) {
            workspace.textContent = labels[targetId] || 'Graph Editor';
        }
        if (mode) {
            if (targetId === 'animation-graph-wrapper') {
                mode.textContent = 'Animation Blueprint';
            } else if (targetId === 'sound-graph-wrapper') {
                mode.textContent = 'Audio Graph';
            } else {
                mode.textContent = 'Visual Scripting';
            }
        }
    },
    toggleExpanded() {
        // Compatibility API for older callers.
        // Physical expansion is now handled by SMEditorExpansion.
        const id = 'nodesEditor';

        if (window.SMEditorExpansion?.isExpanded?.(id)) {
            return window.SMEditorExpansion.restore(id);
        }

        return window.SMDocumentTabs?.expandEditor?.(id) ||
            window.SMEditorExpansion?.open?.(id) ||
            false;
    }
};
