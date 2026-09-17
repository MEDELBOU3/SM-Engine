// Shared controller for the docked secondary sidebar between Hierarchy and the viewport controls.
window.SecondarySidebar = window.SecondarySidebar || {
    activePanelId: null,
    panelMap: {
        '2d': 'editor-2d-sidebar',
        curve: 'curve-modifier-panel',
        filebrowser: 'file-browser-panel',
        'file-browser': 'file-browser-panel',
        files: 'file-browser-panel',
        history: 'historyPanel',
        info: 'info-panel',
        mesh: 'mesh-data-inspector',
        spreadsheet: 'mesh-data-inspector',
        water: 'water-system-panel',
        path: 'path-tools-sidebar-panel',
        vfx: 'vfx-studio-panel',
        snow: 'snow-sittings',
        particles: 'snow-sittings',
        fx: 'snow-sittings',
        'snow-sittings': 'snow-sittings',
        arch: 'architecture-tools-panel',
        architecture: 'architecture-tools-panel'
    },

    resolvePanel(target) {
        if (!target) return null;
        const id = this.panelMap[target] || target;
        return document.getElementById(id);
    },

    open(target) {
        const panel = this.resolvePanel(target);
        if (!panel) {
            console.warn('[SecondarySidebar] Panel not found:', target);
            return null;
        }

        document.querySelectorAll('.secondary-sidebar-panel').forEach((item) => {
            item.classList.remove('active');
            item.hidden = true;
            item.style.display = 'none';
        });

        panel.hidden = false;
        panel.style.display = 'flex';
        panel.classList.add('active');
        document.body.classList.add('side-panel-open');
        if (panel.id === 'historyPanel') {
            document.body.classList.add('history-active');
        }
        this.activePanelId = panel.id;

        window.dispatchEvent(new Event('resize'));
        window.dispatchEvent(new Event('sm:sync-layout'));
        return panel;
    },

    close(target = null) {
        const panel = target ? this.resolvePanel(target) : document.getElementById(this.activePanelId);
        const panels = panel ? [panel] : Array.from(document.querySelectorAll('.secondary-sidebar-panel.active'));

        panels.forEach((item) => {
            item.classList.remove('active');
            item.hidden = true;
            item.style.display = 'none';
        });

        this.activePanelId = null;
        document.body.classList.remove('side-panel-open');
        if (panel && panel.id === 'historyPanel') {
            document.body.classList.remove('history-active');
        }
        window.dispatchEvent(new Event('resize'));
        window.dispatchEvent(new Event('sm:sync-layout'));
    },

    toggle(target) {
        const panel = this.resolvePanel(target);
        if (panel && panel.classList.contains('active')) {
            this.close(target);
        } else {
            this.open(target);
        }
    }
};

// SM Engine Panel: SidebarPanel
window.SidebarPanel = {
    _currentMode: 'layout',
    _modelingGroups: null,
    _viewportObserver: null,

    init() {
        this._ensureControls();
        this.showLayoutTools();
        this._observeViewportHost();

        // Listen for video mode toggle
        window.addEventListener('sm:video-mode', (e) => {
            const isVideo = !!e?.detail?.active || document.body.classList.contains('video-editing-mode');
            const controls = document.getElementById('3D-Controls');
            const menu = document.getElementById('sidebar-tool-menu');

            if (controls) {
                if (isVideo) {
                    controls.style.setProperty('display', 'none', 'important');
                    controls.hidden = true;
                } else {
                    this.mountIntoViewport();
                }
            }

            if (isVideo && menu) {
                menu.classList.remove('open', 'show');
                menu.setAttribute('aria-hidden', 'true');
            }
        });

        const menu = document.getElementById('sidebar-tool-menu');
        if (menu) {
            menu.innerHTML = `            <div class="stm-header">
                <div class="stm-tabs">
                    <button class="stm-tab active">General</button>
                    <button class="stm-tab">Animation</button>
                    <button class="stm-tab">Scripting</button>
                    <button class="stm-tab">Data</button>
                </div>
                <button class="stm-close" aria-label="Close" style="background: none; border: none; padding: 0; color: inherit; cursor: pointer;">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>
            <div class="stm-columns">
                <div class="stm-col">
                    <button class="stm-row" data-action="panel" data-target="materialsEditor">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
                            <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
                            <line x1="12" y1="22.08" x2="12" y2="12"></line>
                        </svg>
                        <span class="stm-label">3D Viewport</span>
                        <span class="stm-shortcut">Shift F5</span>
                    </button>
                    <button class="stm-row" data-action="panel" data-target="guiControls">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                            <circle cx="8.5" cy="8.5" r="1.5"></circle>
                            <polyline points="21 15 16 10 5 21"></polyline>
                        </svg>
                        <span class="stm-label">Image Editor</span>
                        <span class="stm-shortcut">Shift F10</span>
                    </button>
                    <button class="stm-row" data-action="panel" data-target="cameraControls">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <rect x="3" y="3" width="18" height="18" rx="2" stroke-dasharray="3 3"></rect>
                            <path d="M3 12h18M12 3v18"></path>
                        </svg>
                        <span class="stm-label">UV Editor</span>
                        <span class="stm-shortcut">Shift F10</span>
                    </button>
                    <button class="stm-row" data-action="panel" data-target="lightControls">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M3 20c8-16 10-16 18 0"></path>
                            <circle cx="3" cy="20" r="2"></circle>
                            <circle cx="21" cy="20" r="2"></circle>
                            <circle cx="12" cy="12" r="2"></circle>
                        </svg>
                        <span class="stm-label">Compositor</span>
                        <span class="stm-shortcut">Shift F3</span>
                    </button>
                    
                    <button class="stm-row" data-action="panel" data-target="snow-controls">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <rect x="3" y="11" width="10" height="10" rx="1"></rect>
                            <circle cx="15" cy="9" r="6"></circle>
                        </svg>
                        <span class="stm-label">Geometry Node Editor</span>
                        <span class="stm-shortcut">Shift F3</span>
                    </button>
                    <button class="stm-row" data-action="panel" data-target="materialsEditor">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="12" cy="12" r="10"></circle>
                            <path d="M12 2a10 10 0 0 0 0 20V2z" fill="currentColor"></path>
                        </svg>
                        <span class="stm-label">Shader Editor</span>
                        <span class="stm-shortcut">Shift F3</span>
                    </button>
                    <button class="stm-row" data-action="panel" data-target="guiControls">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect>
                            <line x1="7" y1="2" x2="7" y2="22"></line>
                            <line x1="17" y1="2" x2="17" y2="22"></line>
                            <line x1="2" y1="12" x2="22" y2="12"></line>
                            <line x1="2" y1="7" x2="7" y2="7"></line>
                            <line x1="2" y1="17" x2="7" y2="17"></line>
                            <line x1="17" y1="17" x2="22" y2="17"></line>
                            <line x1="17" y1="7" x2="22" y2="7"></line>
                        </svg>
                        <span class="stm-label">Video Sequencer</span>
                        <span class="stm-shortcut">Shift F8</span>
                    </button>
                    <button class="stm-row" data-action="panel" data-target="guiControls">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect>
                            <path d="M2 7l10-4 10 4"></path>
                            <line x1="6" y1="3.5" x2="6" y2="7"></line>
                            <line x1="12" y1="3" x2="12" y2="7"></line>
                            <line x1="18" y1="3.5" x2="18" y2="7"></line>
                        </svg>
                        <span class="stm-label">Movie Clip Editor</span>
                        <span class="stm-shortcut">Shift F2</span>
                    </button>
                    <button class="stm-row" data-action="panel" data-target="vegetationPainter">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M12 2L2 22h20L12 2z"/>
                        </svg>
                        <span class="stm-label">Vegetation Painter</span>
                        <span class="stm-shortcut">Shift F6</span>
                    </button>
                </div>
                <div class="stm-col">
                    <button class="stm-row" data-action="call" data-target="dope-sheet">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="4" y1="6" x2="20" y2="6"></line>
                            <line x1="4" y1="12" x2="20" y2="12"></line>
                            <line x1="4" y1="18" x2="20" y2="18"></line>
                            <circle cx="12" cy="6" r="2" fill="currentColor"></circle>
                            <circle cx="8" cy="12" r="2" fill="currentColor"></circle>
                            <circle cx="16" cy="18" r="2" fill="currentColor"></circle>
                        </svg>
                        <span class="stm-label">Dope Sheet</span>
                        <span class="stm-shortcut">Shift F12</span>
                    </button>
                    <button class="stm-row active" data-action="call" data-target="timeline-view">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="12" cy="12" r="10"></circle>
                            <polyline points="12 6 12 12 16 14"></polyline>
                        </svg>
                        <span class="stm-label">Timeline</span>
                        <span class="stm-shortcut">Shift F12</span>
                    </button>
                    <button class="stm-row" data-action="call" data-target="graph-view">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
                        </svg>
                        <span class="stm-label">Graph Editor</span>
                        <span class="stm-shortcut">Shift F6</span>
                    </button>
                    <button class="stm-row" data-action="call" data-target="drivers">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="3 17 9 17 9 7 15 7 15 17 21 17"></polyline>
                        </svg>
                        <span class="stm-label">Drivers</span>
                        <span class="stm-shortcut">Shift F6</span>
                    </button>
                    <button class="stm-row" data-action="call" data-target="nla">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
                            <polyline points="2 17 12 22 22 17"></polyline>
                            <polyline points="2 12 12 17 22 12"></polyline>
                        </svg>
                        <span class="stm-label">Nonlinear Animation</span>
                        <span class="stm-shortcut">Shift F6</span>
                    </button>
                </div>
                <div class="stm-col">
                    <button class="stm-row" data-action="call" data-target="text-editor">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="16 18 22 12 16 6"></polyline>
                            <polyline points="8 6 2 12 8 18"></polyline>
                        </svg>
                        <span class="stm-label">Text Editor</span>
                        <span class="stm-shortcut">Shift F11</span>
                    </button>
                    <button class="stm-row" data-action="secondary" data-target="console">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="4 17 10 11 4 5"></polyline>
                            <line x1="12" y1="19" x2="20" y2="19"></line>
                        </svg>
                        <span class="stm-label">JavaScript Console</span>
                        <span class="stm-shortcut"></span>
                    </button>
                    <button class="stm-row" data-action="secondary" data-target="info">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="12" cy="12" r="10"></circle>
                            <line x1="12" y1="16" x2="12" y2="12"></line>
                            <line x1="12" y1="8" x2="12.01" y2="8"></line>
                        </svg>
                        <span class="stm-label">Info</span>
                        <span class="stm-shortcut"></span>
                    </button>
                </div>
                <div class="stm-col">
                    <button class="stm-row" data-action="call" data-target="outliner">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <rect x="3" y="3" width="6" height="6" rx="1"></rect>
                            <rect x="13" y="15" width="8" height="6" rx="1"></rect>
                            <rect x="13" y="6" width="8" height="6" rx="1"></rect>
                            <path d="M6 9v9h7m0-6H9"></path>
                        </svg>
                        <span class="stm-label">Outliner</span>
                        <span class="stm-shortcut">Shift F9</span>
                    </button>
                    <button class="stm-row" data-action="panel" data-target="guiControls">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="4" y1="21" x2="4" y2="14" />
                            <line x1="4" y1="10" x2="4" y2="3" />
                            <line x1="12" y1="21" x2="12" y2="12" />
                            <line x1="12" y1="8" x2="12" y2="3" />
                            <line x1="20" y1="21" x2="20" y2="16" />
                            <line x1="20" y1="12" x2="20" y2="3" />
                            <line x1="1" y1="14" x2="7" y2="14" />
                            <line x1="9" y1="8" x2="15" y2="8" />
                            <line x1="17" y1="16" x2="23" y2="16" />
                        </svg>
                        <span class="stm-label">Properties</span>
                        <span class="stm-shortcut">Shift F7</span>
                    </button>
                    <button class="stm-row" data-action="call" data-target="assets">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="22 12 16 12 14 15 10 15 8 12 2 12"></polyline>
                            <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"></path>
                        </svg>
                        <span class="stm-label">Asset Browser</span>
                        <span class="stm-shortcut">Shift F1</span>
                    </button>
                    <button class="stm-row" data-action="secondary" data-target="spreadsheet">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                            <line x1="3" y1="9" x2="21" y2="9"></line>
                            <line x1="3" y1="15" x2="21" y2="15"></line>
                            <line x1="10" y1="3" x2="10" y2="21"></line>
                        </svg>
                        <span class="stm-label">Spreadsheet</span>
                        <span class="stm-shortcut">Shift F3</span>
                    </button>
                    <button class="stm-row" data-action="secondary" data-target="filebrowser">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                            <path d="M2 10h20" opacity="0.6"></path>
                        </svg>
                        <span class="stm-label">File Browser</span>
                        <span class="stm-shortcut">Shift F1</span>
                    </button>
                    <button class="stm-row" data-action="secondary" data-target="preferences"  onclick="window.openSettingsPanel?.()">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="12" cy="12" r="3"></circle>
                            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1 2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                        </svg>
                        <span class="stm-label">Preferences</span>
                        <span class="stm-shortcut">Shift F4</span>
                    </button>
                </div>
            </div>
`;
        }

        // Setup Sidebar Button Actions
        const vegBtn = document.getElementById('vegetationPainterBtn');
        if (vegBtn) {
            vegBtn.addEventListener('click', () => {
                const inspectorPanel = document.getElementById('inspector-panel');
                if (inspectorPanel) {
                    inspectorPanel.style.display = 'block';
                }

                if (window.VegetationPanel && typeof window.VegetationPanel.open === 'function') {
                    window.VegetationPanel.open();
                }

                document.querySelectorAll('#3D-Controls .tool-btn').forEach(btn => btn.classList.remove('active'));
                vegBtn.classList.add('active');
            });
        }

        // Setup Tool Menu Popover Event Delegates
        if (menu) {
            menu.addEventListener('click', (e) => {
                const row = e.target.closest('.stm-row');
                if (!row) return;
                const action = row.dataset.action;
                const target = row.dataset.target;

                if (action === 'secondary') {
                    e.preventDefault();
                    e.stopPropagation();
                    window.SecondarySidebar?.toggle(target);
                    menu.setAttribute('aria-hidden', 'true');
                    menu.classList.remove('open', 'show');
                    return;
                }
                if (action === 'panel' && target === 'vegetationPainter') {
                    const inspectorPanel = document.getElementById('inspector-panel');
                    if (inspectorPanel) {
                        inspectorPanel.style.display = 'block';
                    }
                    if (window.VegetationPanel && typeof window.VegetationPanel.open === 'function') {
                        window.VegetationPanel.open();
                    }
                    menu.setAttribute('aria-hidden', 'true');
                }
            });
        }

        document.getElementById('sculptinCharacterMode')?.addEventListener('click', () => {
            window.requestGlobalSculptingWorkspace?.();
        });
        this.mountIntoViewport();
        window.InspectorPanel?._bindSidebarNavigation?.();

        console.log('SidebarPanel initialized in #renderer-container');
    },

    _layoutToolsHTML() {
        return `
            <button class="tool-btn" id="sidebar-editor-type-btn" type="button" data-sidebar-action="editor-type" title="Editor Type (Shift+F5)">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="3" width="7" height="7" rx="1"></rect>
                    <rect x="14" y="3" width="7" height="7" rx="1"></rect>
                    <rect x="14" y="14" width="7" height="7" rx="1"></rect>
                    <rect x="3" y="14" width="7" height="7" rx="1"></rect>
                </svg>
            </button>
            <div class="tool-separator"></div>
            <button class="tool-btn active" id="sidebar-select" type="button" data-sidebar-action="select" title="Select (W)">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M3 3l7.1 17 2.5-7.4L20 10.1 3 3z"></path>
                </svg>
            </button>
            <button class="tool-btn" id="sidebar-translate" type="button" data-transform-mode="translate" title="Move (G)">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 2v20M2 12h20"></path><path d="M9 5l3-3 3 3M19 9l3 3-3 3M9 19l3 3 3-3M5 9l-3 3 3 3"></path>
                </svg>
            </button>
            <button class="tool-btn" id="sidebar-rotate" type="button" data-transform-mode="rotate" title="Rotate (R)">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 12a9 9 0 1 1-2.64-6.36"></path><path d="M21 3v6h-6"></path>
                </svg>
            </button>
            <button class="tool-btn" id="sidebar-scale" type="button" data-transform-mode="scale" title="Scale (S)">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"></path><rect x="10" y="10" width="4" height="4"></rect>
                </svg>
            </button>`;
    },

    _bindModeToolEvents(controls) {
        if (!controls || controls.dataset.modeToolsBound === '1') return;
        controls.dataset.modeToolsBound = '1';

        controls.addEventListener('click', (event) => {
            const button = event.target.closest('button');
            if (!button || !controls.contains(button)) return;

            // Toggle Editor Type Menu
            if (button.dataset.sidebarAction === 'editor-type') {
                event.stopPropagation();
                const menu = document.getElementById('sidebar-tool-menu');
                if (menu) {
                    const isOpen = menu.classList.contains('open');
                    menu.classList.toggle('open', !isOpen);
                    menu.classList.toggle('show', !isOpen);
                }
                return;
            }

            if (button.dataset.sidebarAction === 'select') {
                window.currentTool = 'select';
                window.UnifiedModelingSystem?.setPolygonTool?.(null);
                controls.querySelectorAll('.tool-btn').forEach((item) => item.classList.toggle('active', item === button));
                return;
            }

            const mode = button.dataset.transformMode;
            if (mode) {
                window.setTransformMode?.(mode);
                controls.querySelectorAll('.tool-btn').forEach((item) => item.classList.toggle('active', item === button));
            }
        });

        // Close menu when clicking outside or on close button
        document.addEventListener('click', (e) => {
            const menu = document.getElementById('sidebar-tool-menu');
            const btn = document.getElementById('sidebar-editor-type-btn');
            const closeBtn = e.target.closest('.stm-close');

            if (menu && (menu.classList.contains('open') || menu.classList.contains('show'))) {
                if (closeBtn || (!menu.contains(e.target) && !btn?.contains(e.target))) {
                    menu.classList.remove('open', 'show');
                }
            }
        });
    },

    _ensureControls() {
        let controls = document.getElementById('3D-Controls');
        if (!controls) {
            controls = document.createElement('div');
            controls.id = '3D-Controls';
            document.body.appendChild(controls);
        }
        return controls;
    },

    _modelingToolsHTML(groups) {
        return groups.map((group, index) => {
            const tools = group.map(([action, iconName, title]) =>
                `<button class="tool-btn modeling-rail-btn" type="button" data-model-action="${action}" title="${title}"><i data-lucide="${iconName}"></i></button>`
            ).join('');
            return tools + (index < groups.length - 1 ? '<div class="tool-separator"></div>' : '');
        }).join('');
    },

    _renderCurrentTools(controls) {
        if (!controls) return false;
        const modeling = this._currentMode === 'modeling' && Array.isArray(this._modelingGroups);
        controls.dataset.sidebarMode = modeling ? 'modeling' : 'layout';
        controls.innerHTML = modeling
            ? this._modelingToolsHTML(this._modelingGroups)
            : this._layoutToolsHTML();
        this._bindModeToolEvents(controls);
        if (modeling) window.lucide?.createIcons?.({ attrs: { 'stroke-width': 1.6 } });
        return true;
    },

    showLayoutTools() {
        this._currentMode = 'layout';
        this._modelingGroups = null;
        const controls = this._ensureControls();
        this._renderCurrentTools(controls);
        this.mountIntoViewport();
        return true;
    },

    showModelingTools(groups) {
        if (!Array.isArray(groups)) return false;
        this._currentMode = 'modeling';
        this._modelingGroups = groups;
        const controls = this._ensureControls();
        this._renderCurrentTools(controls);
        this.mountIntoViewport();
        return true;
    },

    _observeViewportHost() {
        if (this._viewportObserver || typeof MutationObserver === 'undefined') return;
        const layoutRoot = document.getElementById('editor-scene') || document.body;
        let scheduled = false;
        this._viewportObserver = new MutationObserver(() => {
            if (scheduled) return;
            scheduled = true;
            Promise.resolve().then(() => {
                scheduled = false;
                const host = document.getElementById('renderer-container');
                const controls = document.getElementById('3D-Controls');
                if (host && (!controls || !host.contains(controls))) this.mountIntoViewport();
            });
        });
        this._viewportObserver.observe(layoutRoot, { childList: true, subtree: true });
    },

    mountIntoViewport() {
        const controls = this._ensureControls();
        
        // If we are in Video Editing mode, DO NOT display this 3D sidebar
        if (document.body.classList.contains('video-editing-mode')) {
            if (controls) {
                controls.style.setProperty('display', 'none', 'important');
                controls.hidden = true;
            }
            return false;
        }

        const host = document.getElementById('renderer-container');
        if (!host || !controls) return false;

        if (controls.dataset.sidebarMode !== this._currentMode || !controls.childElementCount) {
            this._renderCurrentTools(controls);
        }

        controls.hidden = false;
        controls.removeAttribute('aria-hidden');
        controls.classList.remove('sidebar', 'sidebar-panel-controls');
        controls.classList.add('viewport-tool-rail');
        controls.style.setProperty('display', 'flex', 'important');
        controls.style.setProperty('visibility', 'visible', 'important');
        controls.style.setProperty('opacity', '1', 'important');
        controls.style.setProperty('position', 'absolute', 'important');
        controls.style.setProperty('left', '10px', 'important');
        controls.style.setProperty('top', '40px', 'important');
        controls.style.setProperty('right', 'auto', 'important');
        controls.style.setProperty('bottom', 'auto', 'important');
        controls.style.setProperty('transform', 'none', 'important');
        controls.style.setProperty('z-index', '25', 'important');
        controls.style.flexDirection = 'column';
        controls.style.alignItems = 'center';
        controls.style.gap = '3px';
        controls.style.width = '40px';
        controls.style.maxHeight = 'calc(100% - 50px)';
        controls.style.overflowX = 'hidden';
        controls.style.overflowY = 'auto';
        controls.style.padding = '4px 3px';
        controls.style.boxSizing = 'border-box';
        controls.style.background = 'rgba(35, 37, 41, 0.96)';
        controls.style.border = '1px solid rgba(255, 255, 255, 0.1)';
        controls.style.borderRadius = '6px';
        controls.style.boxShadow = '0 3px 10px rgba(0, 0, 0, 0.35)';
        controls.style.pointerEvents = 'auto';
        host.appendChild(controls);
        return true;
    },

    // Compatibility for older inspector callers; ownership remains with the viewport.
    mountIntoInspector() {
        return this.mountIntoViewport();
    }
};