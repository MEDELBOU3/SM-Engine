class GlobalNodeEditorManager {
    constructor() {
        this.timelineBody = document.getElementById('timelineBody');
        this.controlsWrapper = document.getElementById('timeline-controls-wrapper');
        this.nodeContainer = document.getElementById('global-node-editor-container');
        this.spreadsheetContainer = document.getElementById('spreadsheet-editor-container');

        // Initialize UI Logic
        this.dockLooseNodeWrappers();
        this.initTabs();
        this.initModeSwitcher();
        this.integrateExistingEditors();
        this.initHistory();
    }


    dockLooseNodeWrappers() {
        if (!this.nodeContainer) return;
        ['material-graph-wrapper', 'geometry-graph-wrapper', 'sound-graph-wrapper'].forEach(id => {
            const wrapper = document.getElementById(id);
            if (wrapper && wrapper.parentElement !== this.nodeContainer) {
                this.nodeContainer.appendChild(wrapper);
            }
        });
    }
    initHistory() {
        const historyBtn = document.getElementById('historyBtn');
        if (historyBtn) {
            historyBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                // REPLACED OLD toggleHistory WITH NEW UNIFIED LOGIC
                SecondarySidebar.open('history');
            });
        }
    }


    initTabs() {
        const tabIds = ['animationLibrary', 'statsToggle', 'view-spreadsheet'];
        const animLib = document.getElementById('animation-library');
        const spreadsheetContainer = this.spreadsheetContainer;

        const hideAllExtras = () => {
            if (animLib) animLib.style.display = 'none';
            if (spreadsheetContainer) spreadsheetContainer.style.display = 'none';
            if (window.spreadsheetEditor) window.spreadsheetEditor.hide?.();
            document.body.classList.remove('spreadsheet-active');
        };

        const activateAnimationLibrary = () => {
            hideAllExtras();
            if (animLib) animLib.style.display = 'block';
        };


        tabIds.forEach(id => {
            const tab = document.getElementById(id);
            if (!tab) return;

            tab.addEventListener('click', () => {
                switch (id) {
                    case 'animationLibrary':
                        activateAnimationLibrary();
                        break;
                    case 'statsToggle':
                        if (animLib) {
                            animLib.style.display = animLib.style.display === 'block' ? 'none' : 'block';
                        }
                        break;
                }

                this.triggerResize();
            });
        });
    }

    refreshActiveNodeTab() {
        const activeSubTab = document.querySelector('.node-mode-tabs .node-tab.active');
        if (activeSubTab) {
            activeSubTab.click();
        } else {
            const firstTab = document.querySelector('.node-mode-tabs .node-tab');
            if (firstTab) firstTab.click();
        }
    }

    initModeSwitcher() {
        const modeTabs = document.querySelectorAll('.node-mode-tabs .node-tab');

        // <--- ADDED THIS: Added 'sound-graph-wrapper' to this list
        const wrappers = {
            'player-graph-wrapper': document.getElementById('player-graph-wrapper'),
            'vfx-graph-wrapper': document.getElementById('vfx-graph-wrapper'),
            'terrain-graph-wrapper': document.getElementById('terrain-graph-wrapper'),
            'material-graph-wrapper': document.getElementById('material-graph-wrapper'),
            'geometry-graph-wrapper': document.getElementById('geometry-graph-wrapper'),
            'sound-graph-wrapper': document.getElementById('sound-graph-wrapper')
        };

        modeTabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                // Remove active from all tabs
                document.querySelectorAll('.node-mode-tabs .node-tab').forEach(t => t.classList.remove('active'));

                // Add active to clicked tab
                tab.classList.add('active');

                // Hide all wrappers
                Object.values(wrappers).forEach(el => {
                    if (el) {
                        el.style.display = 'none';
                        el.classList.remove('active');
                    }
                });

                const targetId = tab.getAttribute('data-target');
                const targetEl = wrappers[targetId];

                if (targetEl) {
                    targetEl.style.display = 'flex';
                    targetEl.classList.add('active');

                    // Resize logic per editor
                    if (targetId === 'material-graph-wrapper') {
                        if (!window.materialNodeEditor) {
                            window.materialNodeEditor = new MaterialNodeEditor('material-graph-wrapper');
                        }
                        window.materialNodeEditor.resize();
                    }
                    if (targetId === 'terrain-graph-wrapper') {
                        setTimeout(() => {
                            const editor = window.ensureTerrainNodeEditor?.() || window.nodeEditor;
                            if (window.terrain) editor?.setTarget?.(window.terrain);
                            editor?.resizeCanvas?.();
                        }, 50);
                    }
                    if (targetId === 'geometry-graph-wrapper') {
                        setTimeout(() => {
                            const editor = window.ensureGeometryNodeEditor?.();
                            editor?.refreshDOMReferences?.();
                            editor?.evaluateGraph?.(true);
                            if (editor) window.geometryNodeEditor = editor;
                        }, 50);
                    }
                    if (targetId === 'player-graph-wrapper' && window.playerGraphEditor) {
                        setTimeout(() => window.playerGraphEditor.resizeCanvas(), 50);
                    }
                    // <--- ADDED THIS: Initialize/Redraw Sound Graph
                    if (targetId === 'sound-graph-wrapper' && typeof SoundGraph !== 'undefined') {
                        setTimeout(() => SoundGraph.redraw(), 50);
                    }
                }

                this.triggerResize();
            });
        });
    }

    integrateExistingEditors() {
        const attemptIntegration = () => {
            const playerWrapper = document.getElementById('player-graph-wrapper');
            const existingPlayerPanel = document.getElementById('player-graph-panel');

            if (existingPlayerPanel && playerWrapper) {
                if (existingPlayerPanel.parentElement !== playerWrapper) {
                    playerWrapper.innerHTML = '';
                    playerWrapper.appendChild(existingPlayerPanel);
                    existingPlayerPanel.style.cssText = "display: flex !important; position: relative; width: 100%; height: 100%; top: 0; left: 0; z-index: 1; opacity: 1; transform: none;";
                }
            }

            const vfxWrapper = document.getElementById('vfx-graph-wrapper');
            const existingVfxPanel = document.getElementById('node-editor-container');

            if (existingVfxPanel && vfxWrapper) {
                if (existingVfxPanel.parentElement !== vfxWrapper) {
                    vfxWrapper.innerHTML = '';
                    vfxWrapper.appendChild(existingVfxPanel);
                }

                // The legacy VFX panel is a floating CSS grid. Keep that grid when
                // docking it; changing it to flex puts its title bar beside the canvas.
                existingVfxPanel.classList.add('vfx-editor-docked');
                existingVfxPanel.classList.remove('expanded');
                existingVfxPanel.style.cssText = "position:relative; inset:auto; top:0; left:0; width:100%; height:100%; min-width:0; min-height:0; display:grid; flex:1 1 0; resize:none; transform:none;";
            }

            const matWrapper = document.getElementById('material-graph-wrapper');
            const existingMatPanel = document.getElementById('material-node-panel');

            if (existingMatPanel && matWrapper) {
                if (existingMatPanel.parentElement !== matWrapper) {
                    matWrapper.innerHTML = '';
                    matWrapper.appendChild(existingMatPanel);
                    existingMatPanel.style.cssText = "position: relative; top: 0; left: 0; width: 100%; height: 100%; display: flex; flex: 1 1 auto;";
                }
            }

            const terrainWrapper = document.getElementById('terrain-graph-wrapper');
            const terrainHost = document.getElementById('terrain-editor-host');
            const existingTerrainPanel = document.getElementById('terrain-node-panel');
            const existingTerrainGraph = document.getElementById('node-graph-container');

            if (terrainWrapper && existingTerrainPanel && existingTerrainGraph) {
                terrainWrapper.style.cssText = 'display:flex; flex:1 1 0; width:100%; height:100%; min-width:0; min-height:0; max-height:none; margin:0; padding:0; overflow:hidden;';
                const host = terrainHost || document.createElement('div');
                if (!host.id) host.id = 'terrain-editor-host';
                host.style.cssText = 'display:flex; align-items:stretch; width:100%; height:100%; min-width:0; min-height:0; max-height:none; flex:1 1 0; overflow:hidden; margin:0; padding:0; background:#111114;';

                if (host.parentElement !== terrainWrapper) {
                    terrainWrapper.innerHTML = '';
                    terrainWrapper.appendChild(host);
                }

                if (existingTerrainPanel.parentElement !== host) {
                    host.appendChild(existingTerrainPanel);
                    existingTerrainPanel.style.cssText = "width: 230px; min-width: 230px; background:#1c1c21; border-right:1px solid #282830; display:flex; flex-direction:column; overflow:hidden; flex-shrink:0; height: 100%;";
                }

                if (existingTerrainGraph.parentElement !== host) {
                    host.appendChild(existingTerrainGraph);
                    existingTerrainGraph.style.cssText = "flex:1 1 0; align-self:stretch; position:relative; overflow:hidden; display:block; min-width:0; min-height:0; max-height:none; width:auto; height:100%; margin:0; padding:0; border:0; border-radius:0; background-color:#111114; background-image:radial-gradient(circle,#2a2a35 1px,transparent 1px),radial-gradient(circle,#1a1a20 1px,transparent 1px); background-size:20px 20px,100px 100px; background-position:0 0,0 0; background-repeat:repeat; box-shadow:inset 10px 10px 40px rgba(0,0,0,0.3);";
                }
            }

            const soundWrapper = document.getElementById('sound-graph-wrapper');
            const existingSoundPanel = document.getElementById('sound-graph-panel') || document.getElementById('meta-sound-panel') || document.getElementById('sound-editor-panel');

            if (existingSoundPanel && soundWrapper) {
                if (existingSoundPanel.parentElement !== soundWrapper) {
                    soundWrapper.innerHTML = '';
                    soundWrapper.appendChild(existingSoundPanel);
                    existingSoundPanel.style.cssText = "position: relative; width: 100%; height: 100%; display: flex; flex: 1 1 auto;";
                }
            }
        };

        attemptIntegration();
        setTimeout(attemptIntegration, 1000);
    }

    triggerResize() {
        window.dispatchEvent(new Event('resize'));
    }
}

// Ensure it loads after DOM
window.addEventListener('load', () => {
    window.globalNodeManager = new GlobalNodeEditorManager();
});

