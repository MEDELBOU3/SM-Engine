document.addEventListener("DOMContentLoaded", () => {

    const MENU_EDGE_GAP = 8;
    const MENU_ANCHOR_GAP = 2;

    function placeMenuAtTrigger(trigger, menu, alignRight = false) {
        const triggerRect = trigger.getBoundingClientRect();
        const menuRect = menu.getBoundingClientRect();
        const menuWidth = menuRect.width || menu.offsetWidth;
        const menuHeight = menuRect.height || menu.offsetHeight;

        let left = alignRight ? triggerRect.right - menuWidth : triggerRect.left;
        let top = triggerRect.bottom + MENU_ANCHOR_GAP;

        left = Math.max(MENU_EDGE_GAP, Math.min(left, window.innerWidth - menuWidth - MENU_EDGE_GAP));
        if (top + menuHeight > window.innerHeight - MENU_EDGE_GAP) {
            top = Math.max(MENU_EDGE_GAP, triggerRect.top - menuHeight - MENU_ANCHOR_GAP);
        }

        Object.assign(menu.style, {
            position: "fixed",
            left: `${Math.round(left)}px`,
            right: "auto",
            top: `${Math.round(top)}px`,
            marginLeft: "0"
        });
    }

    function placeSubmenuAtTrigger(trigger, submenu) {
        const triggerRect = trigger.getBoundingClientRect();
        const menuRect = submenu.getBoundingClientRect();
        const menuWidth = menuRect.width || submenu.offsetWidth;
        const menuHeight = menuRect.height || submenu.offsetHeight;

        let left = triggerRect.right + MENU_ANCHOR_GAP;
        if (left + menuWidth > window.innerWidth - MENU_EDGE_GAP) {
            left = triggerRect.left - menuWidth - MENU_ANCHOR_GAP;
        }

        const maxTop = window.innerHeight - menuHeight - MENU_EDGE_GAP;
        const top = Math.max(MENU_EDGE_GAP, Math.min(triggerRect.top - 4, maxTop));

        Object.assign(submenu.style, {
            position: "fixed",
            left: `${Math.round(left)}px`,
            right: "auto",
            top: `${Math.round(top)}px`,
            marginLeft: "0"
        });
    }

    /* =========================================================
       1. BULLETPROOF FIXED MENU SYSTEM & ACTION EXECUTION
       ========================================================= */
    function setupBlenderMenu(triggerId, menuId) {
        const trigger = document.getElementById(triggerId);
        const menu = document.getElementById(menuId);
        if (!trigger || !menu) return;

        trigger.addEventListener("click", (e) => {
            e.stopPropagation();
            const isCurrentlyOpen = menu.classList.contains("show");

            closeAllMenus();

            if (!isCurrentlyOpen) {
                menu.classList.add("show");
                trigger.classList.add("active");

                placeMenuAtTrigger(trigger, menu, menuId === "moreModesMenu");
            }
        });

        menu.addEventListener("click", (e) => e.stopPropagation());

        // Handle button clicks inside the menu
        menu.querySelectorAll("button:not(.submenu-trigger)").forEach(btn => {
            btn.addEventListener("click", (e) => {
                const hasWindowHandler = btn.id && typeof window[btn.id] === 'function';

                // Only block other listeners when we are manually routing to a window handler.
                if (hasWindowHandler) {
                    // Prevent duplicate execution when other scripts also bind to these buttons.
                    e.preventDefault();
                    e.stopImmediatePropagation();
                }

                closeAllMenus();

                // Route to your shape function (e.g., addCube)
                if (hasWindowHandler) {
                    console.log("Executing:", btn.id);
                    window[btn.id]();
                }
            });
        });
    }

    /* =========================================================
       2. SUBMENU LOGIC
       ========================================================= */
    document.querySelectorAll(".submenu-trigger").forEach(trigger => {
        trigger.addEventListener("click", (e) => {
            e.stopPropagation();
            const submenu = trigger.nextElementSibling;
            const parentMenu = trigger.closest('.menu-dropdown');

            parentMenu.querySelectorAll(".submenu-dropdown.show").forEach(sm => {
                if (sm !== submenu) sm.classList.remove("show");
            });

            submenu.classList.toggle("show");

            if (submenu.classList.contains("show")) {
                placeSubmenuAtTrigger(trigger, submenu);
            }
        });

        // Handle button clicks inside the submenu
        const submenu = trigger.nextElementSibling;
        if (!submenu) return;
        submenu.querySelectorAll("button").forEach(btn => {
            btn.addEventListener("click", (e) => {
                const hasWindowHandler = btn.id && typeof window[btn.id] === 'function';

                // Prevents the double-add bug only when we are manually routing.
                if (hasWindowHandler) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                }

                closeAllMenus();

                // Route to your shape function
                if (hasWindowHandler) {
                    console.log("Executing from Submenu:", btn.id);
                    window[btn.id]();
                }
            });
        });
    });

    /* =========================================================
       3. CLOSE MENUS HELPER
       ========================================================= */
    function closeAllMenus() {
        document.querySelectorAll(".menu-dropdown.show, .submenu-dropdown.show").forEach(m => {
            m.classList.remove("show");
        });
        document.querySelectorAll(".menu-trigger.active").forEach(t => {
            t.classList.remove("active");
        });
    }

    document.addEventListener("click", closeAllMenus);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeAllMenus(); });

    /* =========================================================
       4. WORKSPACE TABS HIGHLIGHTING LOGIC
       ========================================================= */
    const workspaceTabs = document.querySelectorAll('.workspace-tab:not(.icon-only)');
    workspaceTabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            workspaceTabs.forEach(t => t.classList.remove('active'));
            e.target.classList.add('active');
        });
    });

    /* =========================================================
       5. INITIALIZE MENUS
       ========================================================= */
    setupBlenderMenu("fileBtn", "fileMenu");
    setupBlenderMenu("addBtn", "addMenu");
    setupBlenderMenu("viewBtn", "viewMenu");
    setupBlenderMenu("cameraBtn", "cameraMenu");
    setupBlenderMenu("addMoreModesBtn", "moreModesMenu");

    /* =========================================================
       6. INSPECTOR, SIDEBAR, & UI TOGGLES (Restored)
       ========================================================= */
    const togglePanelVisibility = (elementId) => {
        const element = document.getElementById(elementId);
        if (!element) {
            console.warn(`Element with ID "${elementId}" not found for visibility toggle.`);
            return;
        }
        const current = element.style.display;
        if (current === "none" || current === "") {
            element.style.display = "block";
        } else {
            element.style.display = "none";
        }
    };

    // Ensure sidebar tool buttons always toggle their panels (even if other scripts stop propagation)
    // Note: settingsToggle, physicsControls, soundControls are handled by InspectorPanel._bindSidebarNavigation
    const panelToggleMap = {
        'materialsEditor': 'material-editor',
        'cameraControls': 'camera-editor-container',
        'lightControls': 'lighting-editor-container',
        'drawingControls': 'drawingMode',
        'snow-controls': 'snow-sittings'
    };

    const sidebarControls = document.getElementById('3D-Controls');
    if (sidebarControls) {
        sidebarControls.addEventListener('click', (e) => {
            const btn = e.target.closest('button');
            if (!btn || !btn.id) return;
            const panelId = panelToggleMap[btn.id];
            if (!panelId) return;
            e.preventDefault();
            e.stopImmediatePropagation();
            const inspectorPanel = document.getElementById('inspector-panel');
            if (inspectorPanel && inspectorPanel.classList.contains('closed')) {
                if (typeof window.setInspectorCollapsed === 'function') {
                    window.setInspectorCollapsed(false);
                } else {
                    inspectorPanel.classList.remove('closed');
                    if (typeof onWindowResize === 'function') onWindowResize();
                }
            }
            const dockPanelId = { cameraControls: 'camera', lightControls: 'lighting' }[btn.id];
            if (dockPanelId && window.PanelDockManager) {
                if (dockPanelId === 'camera') window.CameraPanel?.init?.();
                if (dockPanelId === 'lighting') window.LightingPanel?.init?.();
                const layout = window.PanelDockManager.getLayout?.();
                if (layout?.inspector?.active === dockPanelId) window.PanelDockManager.closePanel(dockPanelId);
                else window.PanelDockManager.openPanel(dockPanelId);
                return;
            }
            togglePanelVisibility(panelId);
        }, true);

        // Ensure transform mode buttons work even if other listeners block bubbling
        sidebarControls.addEventListener('click', (e) => {
            const btn = e.target.closest('button');
            if (!btn) return;
            if (btn.id === 'translate' || btn.id === 'rotate' || btn.id === 'scale') {
                e.preventDefault();
                if (typeof window.setTransformMode === 'function') {
                    window.setTransformMode(btn.id);
                }
            }
        }, true);
    }

    const sidebarToolMenuBtn = document.getElementById('sidebar-tool-menu-btn');
    const sidebarToolMenu = document.getElementById('sidebar-tool-menu');
    if (sidebarToolMenuBtn && sidebarToolMenu) {
        const closeMenu = () => {
            sidebarToolMenu.classList.remove('open');
            sidebarToolMenu.setAttribute('aria-hidden', 'true');
        };

        const closeBtn = sidebarToolMenu.querySelector('.stm-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                closeMenu();
            });
        }

        sidebarToolMenuBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const isOpen = sidebarToolMenu.classList.contains('open');
            if (isOpen) {
                closeMenu();
                return;
            }

            const rect = sidebarToolMenuBtn.getBoundingClientRect();
            sidebarToolMenu.style.left = `${rect.right + 8}px`;
            sidebarToolMenu.style.top = `${rect.top}px`;
            sidebarToolMenu.classList.add('open');
            sidebarToolMenu.setAttribute('aria-hidden', 'false');
        });

        const toggleHierarchyPanel = () => {
            const panel = document.getElementById('hierarchy-list-content');
            const panelHeader = document.getElementById('hierarchy-header')
            //the panel and header should always be shown/hidden together, so if one is missing we abort
            if (!panel || !panelHeader) {
                console.warn('Hierarchy panel or header not found for toggling.');
                return;
            }
            const isHidden = panel.style.display === 'none';
            panel.style.display = isHidden ? 'block' : 'none';
            panelHeader.style.display = isHidden ? 'block' : 'none';
            if (typeof syncDynamicLayoutVars === 'function') syncDynamicLayoutVars();
            if (typeof onWindowResize === 'function') onWindowResize();
        };

        const toggleAssetsPanelSafe = () => {
            const panel = document.getElementById('assets-panel');
            if (!panel) {
                console.warn('Assets panel not found for toggling.');
                return;
            }
            const isHidden = panel.style.display === 'none';
            panel.style.display = isHidden ? 'block' : 'none';
            if (typeof onWindowResize === 'function') onWindowResize();
        };

        sidebarToolMenu.addEventListener('click', (e) => {
            const item = e.target.closest('.stm-item');
            const row = e.target.closest('.stm-row');
            const targetEl = item || row;
            if (!targetEl) return;
            e.preventDefault();
            e.stopPropagation();
            const action = targetEl.dataset.action;
            const target = targetEl.dataset.target;
            if (action === 'panel') {
                const btn = document.getElementById(target);
                if (btn) btn.click();
            } else if (action === 'secondary') {
                if (window.SecondarySidebar?.open) {
                    window.SecondarySidebar.open(target);
                }
            } else if (action === 'transform') {
                if (typeof window.setTransformMode === 'function') {
                    window.setTransformMode(target);
                }
            } else if (action === 'call') {
                if (target === 'box-select') {
                    window.selectionSystem?.toggleBoxMode?.();
                } else if (target === 'toggle-lock') {
                    const btn = document.getElementById('toggle-lock');
                    if (btn) btn.click();
                } else if (target === 'assets') {
                    if (typeof toggleAssetsPanelSafe === 'function') toggleAssetsPanelSafe();
                } else if (target === 'outliner') {
                    toggleHierarchyPanel();
                } else if (target === 'inspector') {
                    const inspector = document.getElementById('inspector-panel');
                    if (inspector && inspector.classList.contains('closed')) {
                        inspector.classList.remove('closed');
                        if (typeof onWindowResize === 'function') onWindowResize();
                    }
                } else if (target === 'timeline-view') {
                    const btn = document.getElementById('view-timeline');
                    if (btn) btn.click();
                } else if (target === 'graph-view') {
                    const btn = document.getElementById('view-graph');
                    if (btn) btn.click();
                } else if (target) {
                    if (window.showToast) window.showToast('Feature coming soon', 'orange');
                }
            }
            closeMenu();
        });

        document.addEventListener('click', (e) => {
            if (!sidebarToolMenu.classList.contains('open')) return;
            if (sidebarToolMenu.contains(e.target) || sidebarToolMenuBtn.contains(e.target)) return;
            closeMenu();
        });
    }

    const sidebarToggle = document.getElementById('sidebar-toggle');
    if (sidebarToggle) {
        sidebarToggle.addEventListener('click', function () {
            const sidebar = document.getElementById('3D-Controls');
            if (sidebar) sidebar.style.display = (sidebar.style.display === 'none') ? 'block' : 'none';
        });
    }

    document.addEventListener('keydown', (e) => {
        const targetTag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
        const isTyping = targetTag === 'input' || targetTag === 'textarea' || e.target?.isContentEditable;
        if (isTyping) return;
        if (!e.shiftKey) return;

        if (e.code === 'F1') {
            e.preventDefault();
            if (typeof toggleAssetsPanelSafe === 'function') toggleAssetsPanelSafe();
        } else if (e.code === 'F3') {
            e.preventDefault();
            if (window.SecondarySidebar?.open) window.SecondarySidebar.open('spreadsheet');
        } else if (e.code === 'F4') {
            e.preventDefault();
            if (window.SecondarySidebar?.open) window.SecondarySidebar.open('preferences');
        } else if (e.code === 'F9') {
            e.preventDefault();
            const panel = document.getElementById('hierarchy-panel');
            if (panel) {
                panel.style.display = (panel.style.display === 'none') ? 'block' : 'none';
                if (typeof syncDynamicLayoutVars === 'function') syncDynamicLayoutVars();
                if (typeof onWindowResize === 'function') onWindowResize();
            }
        }
    });

    const columnTypeEl = document.getElementById('columnType');
    if (columnTypeEl) {
        columnTypeEl.addEventListener('change', function () {
            const cyl = document.getElementById('column-cylindrical-options');
            const sq = document.getElementById('column-square-options');
            if (this.value === 'cylindrical') {
                if (cyl) cyl.style.display = 'block';
                if (sq) sq.style.display = 'none';
            } else {
                if (cyl) cyl.style.display = 'none';
                if (sq) sq.style.display = 'block';
            }
        });
        columnTypeEl.dispatchEvent(new Event('change'));
    }

    const toggleButton = document.getElementById('toggle-inspector');
    const inspectorPanel = document.getElementById('inspector-panel');
    const editorScene = document.querySelector('.editor-scene');
    const timelinePanel = document.querySelector('.timeline');
    const navigatorContainer = document.getElementById('navigator-container');
    const subToolBar = document.getElementById('subToolBar');

    const expandableElements = [
        editorScene, timelinePanel, subToolBar, navigatorContainer,
        document.querySelector('.node-editor'), document.querySelector('.sound-controls-header'),
        document.querySelector('.site-modal-container')
    ].filter(el => el !== null);

    if (toggleButton && inspectorPanel) {
        toggleButton.addEventListener('click', () => {
            const shouldCollapse = !inspectorPanel.classList.contains('closed');
            if (typeof window.setInspectorCollapsed === 'function') {
                window.setInspectorCollapsed(shouldCollapse);
            } else {
                inspectorPanel.classList.toggle('closed', shouldCollapse);
                expandableElements.forEach(element => element.classList.toggle('expanded', shouldCollapse));
                window.dispatchEvent(new Event('sm:sync-layout'));
                if (typeof onWindowResize === 'function') onWindowResize();
            }
        });

        if (inspectorPanel.classList.contains('closed')) {
            expandableElements.forEach(element => element.classList.add('expanded'));
        } else {
            expandableElements.forEach(element => element.classList.remove('expanded'));
        }
    }

    const navToggleButton = document.getElementById("toggle-navigator");
    const updateNavigatorWidth = () => {
        if (!navigatorContainer || !inspectorPanel) return;
        const inspectorClosed = inspectorPanel.classList.contains('closed');
        navigatorContainer.classList.remove('expanded', 'with-inspector');
        if (inspectorClosed) navigatorContainer.classList.add('expanded');
        else navigatorContainer.classList.add('with-inspector');
        if (typeof onWindowResize === 'function') onWindowResize();
    };

    if (navToggleButton && navigatorContainer) {
        navToggleButton.addEventListener('click', () => {
            navigatorContainer.classList.toggle('closed');
            setTimeout(() => {
                if (!navigatorContainer.classList.contains('closed')) updateNavigatorWidth();
                else if (typeof onWindowResize === 'function') onWindowResize();
            }, 310);
        });
    }

    if (toggleButton) {
        toggleButton.addEventListener('click', () => setTimeout(updateNavigatorWidth, 200));
    }
    updateNavigatorWidth();
});

// =========================================================
// GLOBAL FUNCTIONS
// =========================================================
let currentWindowPreset = null;
function applyWindowPreset(preset) {
    currentWindowPreset = preset;
    const doorWidthInput = document.getElementById('windowWidthInput');
    const doorHeightInput = document.getElementById('windowHeightInput');
    const doorDepthInput = document.getElementById('windowDepthInput');
    const sillHeightInput = document.getElementById('windowSillHeightInput');

    if (doorWidthInput) doorWidthInput.value = preset.width;
    if (doorHeightInput) doorHeightInput.value = preset.height;
    if (doorDepthInput) doorDepthInput.value = preset.depth;
    if (sillHeightInput) sillHeightInput.value = preset.sill;

    alert(`Preset selected: ${preset.width}x${preset.height}. Activate Window tool to place.`);
    document.getElementById('window-presets-panel').style.display = 'none';
}

function switchMatMode(mode) {
    document.querySelectorAll('.mat-tab').forEach(t => t.classList.remove('active'));
    event.target.classList.add('active');
    document.getElementById('mat-section-basic').style.display = (mode === 'basic') ? 'block' : 'none';
    document.getElementById('mat-section-advanced').style.display = (mode === 'advanced') ? 'block' : 'none';
}

function updatePhysicalMat(prop, val) {
    if (!selectedObject || !selectedObject.isMesh) return;
    if (selectedObject.material.type !== 'MeshPhysicalMaterial') {
        const oldMat = selectedObject.material;
        selectedObject.material = new THREE.MeshPhysicalMaterial().copy(oldMat);
    }
    selectedObject.material[prop] = parseFloat(val);
    selectedObject.material.needsUpdate = true;
}

function openNodeEditor() {
    if (window.navigatorSystem) {
        window.navigatorSystem.open('material-editor', 'Material Editor');
    } else {
        alert("Initializing Node Editor Workspace...");
        const globalContainer = document.getElementById('global-node-editor-container');
        if (globalContainer) globalContainer.style.display = 'flex';
    }
}

function openMaterialNodeEditor() {
    const globalContainer = document.getElementById('global-node-editor-container');
    if (!globalContainer) return;
    globalContainer.style.display = 'flex';
    document.querySelectorAll('.node-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.node-sub-editor').forEach(s => { s.classList.remove('active'); s.style.display = 'none'; });

    const matTab = document.getElementById('tab-mat-nodes');
    const matWrapper = document.getElementById('material-graph-wrapper');
    if (matTab) matTab.classList.add('active');
    if (matWrapper) {
        matWrapper.style.display = 'flex';
        matWrapper.classList.add('active');
    }
    initMaterialCanvas();
}

function initMaterialCanvas() {
    const canvas = document.getElementById('material-node-canvas');
    const container = document.getElementById('mat-canvas-container');
    if (!canvas || !container) return;
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    drawMaterialGrid(canvas);
}

function drawMaterialGrid(canvas) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#222";
    ctx.lineWidth = 1;
    for (let x = 0; x < canvas.width; x += 20) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += 20) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
    }
    ctx.fillStyle = "#333";
    ctx.roundRect(50, 50, 150, 100, 5).fill();
    ctx.fillStyle = "#fff";
    ctx.fillText("Output Material", 60, 70);
}

function addMatNode(type) { console.log("Adding material node of type:", type); }
function applyNodeMaterial() {
    if (!selectedObject) return alert("Select an object in the scene first!");
    alert("Compiling Node Graph to ShaderMaterial...");
}
