// SM Engine Modeling workspace: viewport tool rail + context inspector.
(function () {
    const TOOL_GROUPS = [
        [['select', 'mouse-pointer-2', 'Select'], ['move', 'move-3d', 'Move (G)'], ['rotate', 'rotate-3d', 'Rotate (R)'], ['scale', 'scan', 'Scale (S)']],
        [['extrude', 'box-select', 'Extrude (E)'], ['inset', 'square-dashed-bottom', 'Inset (I)'], ['bevel', 'blend', 'Bevel (Ctrl+B)'], ['loopcut', 'columns-3', 'Loop Cut (Ctrl+R)'], ['knife', 'slice', 'Knife (K)']],
        [['polybuild', 'pen-tool', 'Poly Build'], ['edgeslide', 'move-horizontal', 'Edge Slide'], ['shrinkfatten', 'scan-line', 'Shrink / Fatten'], ['shear', 'unfold-horizontal', 'Shear'], ['rip', 'split', 'Rip Region'], ['smooth', 'waves', 'Smooth']],
        [['subdivide', 'grid-3x3', 'Subdivide'], ['merge', 'combine', 'Merge'], ['delete', 'trash-2', 'Delete']]
    ];

    function icon(name) {
        return '<i data-lucide="' + name + '"></i>';
    }

    function button(action, iconName, title) {
        return '<button class="modeling-rail-btn" type="button" data-model-action="' + action + '" title="' + title + '">' + icon(iconName) + '</button>';
    }

    window.ModelingPanel = {
        active: false,
        timer: null,
        sessionMode: 'object',

        init() {
            const legacy = document.getElementById('modelingTools');
            if (legacy && legacy.parentNode === document.body) {
                legacy.style.setProperty('display', 'none', 'important');
                legacy.style.setProperty('visibility', 'hidden', 'important');
                legacy.innerHTML = '';
            }
            this.ensureViewportUI();
            this.bindEvents();
            if (window.InspectorPanel) {
                window.InspectorPanel.showModelingView = () => this.open();
            }
            window.addEventListener('objectSelected', () => this.refresh());
            window.addEventListener('sm-modeling-tools-opened', () => this.open());
            console.log('[ModelingWorkspace] Ready');
        },

        show() {
            this.open();
        },

        open() {
            this.active = true;
            document.body.classList.add('modeling-workspace-active');
            document.getElementById('modelingControls')?.classList.add('active');
            window.SidebarPanel?.showModelingTools?.(TOOL_GROUPS);
            window.setInspectorCollapsed?.(false);

            // Close Architecture Tools panel when modeling mode opens
            window.SecondarySidebar?.close?.('arch');
            document.getElementById('open-arch-tools-btn')?.classList.remove('active');
            const ap = document.getElementById('architecture-tools-panel');
            if (ap) {
                ap.style.display = 'none';
                ap.classList.remove('active');
            }

            const inspector = document.getElementById('inspector-panel');
            if (inspector) {
                inspector.classList.remove('closed', 'hidden', 'mode-hidden');
                inspector.style.display = 'flex';
            }
            this.mountInspector();
            this.ensureViewportUI();
            window.ModelingModifiersPanel?.open?.();
            this.refresh();
            clearInterval(this.timer);
            this.timer = setInterval(() => this.active && this.refresh(), 300);
        },

        close() {
            this.active = false;
            clearInterval(this.timer);
            this.timer = null;
            document.body.classList.remove('modeling-workspace-active');
            document.getElementById('modelingControls')?.classList.remove('active');
            window.ModelingModifiersPanel?.close?.();
            if (document.getElementById('3D-Controls')?.dataset.sidebarMode === 'modeling') {
                window.SidebarPanel?.showLayoutTools?.();
            }
            const panel = document.getElementById('modeling-studio-panel');
            if (panel) {
                window.PanelDockManager?.closePanel('modeling');
            }
            window.UnifiedModelingSystem?.setPolygonTool?.(null);
            window.UnifiedModelingSystem?.exitEditMode?.();
            this.sessionMode = 'object';
        },

        ensureViewportUI() {
            const host = document.getElementById('renderer-container');
            document.getElementById('modeling-viewport-toolbar')?.remove();
            if (!host || document.getElementById('modeling-viewport-header')) return;

            const header = document.createElement('div');
            header.id = 'modeling-viewport-header';
            header.innerHTML = [
                '<div class="modeling-mode-switch" role="group" aria-label="Modeling mode">',
                '<button type="button" data-model-action="object-mode">Object</button>',
                '<button type="button" data-model-action="edit-mode">Edit</button>',
                '<button type="button" data-model-action="detail-mode">Detail</button>',
                '<button type="button" data-model-action="retopo-mode">Retopo</button>',
                '</div>',
                '<div class="modeling-selection-switch" role="group" aria-label="Component selection">',
                '<button type="button" data-model-action="vertex" title="Vertex Select (1)">' + icon('circle-dot') + '</button>',
                '<button type="button" data-model-action="edge" title="Edge Select (2)">' + icon('minus') + '</button>',
                '<button type="button" data-model-action="face" title="Face Select (3)">' + icon('square') + '</button>',
                '</div>',
                '<span id="modeling-viewport-status">No mesh selected</span>'
            ].join('');
            host.appendChild(header);
            window.lucide?.createIcons?.({ attrs: { 'stroke-width': 1.6 } });
        },

        mountInspector() {
            let panel = window.PanelDockManager?.mountPanel?.({
                id: 'modeling', title: 'Modeling', icon: 'fas fa-cube',
                elementId: 'modeling-studio-panel', className: 'property-group modeling-workspace-inspector',
            });
            if (!panel) return;
            panel.className = 'property-group modeling-workspace-inspector';
            panel.innerHTML = this.inspectorHTML();
            window.PanelDockManager?.openPanel?.('modeling');
            window.lucide?.createIcons?.({ attrs: { 'stroke-width': 1.6 } });
            window.drawSoftCurvePreview?.();
        },

        inspectorHTML() {
            return [
                '<header class="modeling-inspector-header"><div><span class="modeling-eyebrow">Modeling</span><strong id="modeling-active-object">No mesh selected</strong></div>',
                '<button type="button" class="modeling-icon-command" data-model-action="close" title="Close Modeling workspace">' + icon('x') + '</button></header>',
                '<div class="modeling-mode-panel"><div class="modeling-mode-switch modeling-mode-switch-wide">',
                '<button type="button" data-model-action="object-mode">Object</button><button type="button" data-model-action="edit-mode">Edit</button>',
                '<button type="button" data-model-action="detail-mode">Detail</button><button type="button" data-model-action="retopo-mode">Retopo</button></div>',
                '<button type="button" class="modeling-primary-command" data-model-action="attach">' + icon('crosshair') + ' Use Selected Mesh</button></div>',

                '<section class="modeling-inspector-section"><div class="modeling-section-title"><span>Component Selection</span><span id="modeling-selection-count">0 selected</span></div>',
                '<div class="modeling-component-modes">',
                '<button type="button" data-model-action="vertex">' + icon('circle-dot') + '<span>Vertex</span></button>',
                '<button type="button" data-model-action="edge">' + icon('minus') + '<span>Edge</span></button>',
                '<button type="button" data-model-action="face">' + icon('square') + '<span>Face</span></button></div>',
                '<div class="modeling-command-grid modeling-command-grid-3"><button data-model-action="select-all">All</button><button data-model-action="invert">Invert</button><button data-model-action="linked">Linked</button></div></section>',

                '<!-- MAYA & 3DS MAX SOFT SELECTION ROLLOUT -->',
                '<section class="modeling-inspector-section" id="soft-selection-rollout">',
                '<div class="modeling-section-title"><span>Soft Selection</span>',
                '<label class="flag-label" style="cursor:pointer;"><input type="checkbox" id="soft-select-enable" onchange="window.toggleSoftSelection?.(this.checked)"> Enable</label></div>',
                '<div id="soft-select-controls" class="soft-select-body" style="display:none; flex-direction:column; gap:6px; margin-top:6px;">',
                '<canvas id="soft-select-curve" width="180" height="52" class="soft-select-curve" title="Soft selection falloff curve"></canvas>',
                '<label class="modeling-number-row"><span>Falloff Mode</span><select id="soft-select-mode" class="field-dropdown" style="height:22px; font-size:10px;" onchange="window.setSoftSelectionMode?.(this.value)"><option value="volume">Volume (3D Space)</option><option value="surface">Surface (Edge Distance)</option></select></label>',
                '<label class="modeling-number-row"><span>Falloff Radius</span><input id="soft-select-radius" type="number" value="3.0" min="0.01" max="200" step="0.1" oninput="window.setSoftSelectionRadius?.(this.value)" onchange="window.setSoftSelectionRadius?.(this.value)"></label>',
                '<label class="modeling-number-row"><span>Pinch (Peak)</span><input id="soft-select-pinch" type="number" value="0.0" min="-1.0" max="1.0" step="0.05" oninput="window.setSoftSelectionPinch?.(this.value)" onchange="window.setSoftSelectionPinch?.(this.value)"></label>',
                '<label class="modeling-number-row"><span>Bubble (Sides)</span><input id="soft-select-bubble" type="number" value="0.0" min="-1.0" max="1.0" step="0.05" oninput="window.setSoftSelectionBubble?.(this.value)" onchange="window.setSoftSelectionBubble?.(this.value)"></label>',
                '<div class="modeling-number-row soft-selection-options"><label class="flag-label" title="Viewport Heatmap" style="cursor:pointer;"> <input type="checkbox" id="soft-select-colors" checked onchange="window.toggleSoftSelectionColors?.(this.checked)" ><span>Heatmap</span></label>',
                '<label class="flag-label" title="Shaded Faces" style="cursor:pointer;"><input type="checkbox" id="soft-select-shaded" onchange="window.toggleSoftSelectionShadedFaces?.(this.checked)"></label></div>',
                '<div class="modeling-number-row"><label class="flag-label" style="cursor:pointer;"><input type="checkbox" id="soft-select-edge" onchange="window.toggleSoftSelectionEdgeDistance?.(this.checked)"> Edge Distance</label>',
                '<label class="modeling-inline-number"><span>Steps</span><input id="soft-select-edge-steps" type="number" value="3" min="1" max="50" step="1" style="width:42px; height:20px; font-size:10px;" oninput="window.setSoftSelectionEdgeSteps?.(this.value)" onchange="window.setSoftSelectionEdgeSteps?.(this.value)"></label></div>',
                '<div class="modeling-number-row"><label class="flag-label" style="cursor:pointer;"><input type="checkbox" id="soft-select-backfacing" checked onchange="window.toggleSoftSelectionAffectBackfacing?.(this.checked)"> Affect Backfacing</label>',
                '<label class="flag-label" style="cursor:pointer;"><input type="checkbox" id="soft-select-lock" onchange="window.toggleSoftSelectionLock?.(this.checked)"> Lock</label></div>',
                '<div class="modeling-section-title" style="margin-top:4px;"><span>Falloff Curve</span></div>',
                '<div class="modeling-component-modes">',
                '<button type="button" class="soft-curve-btn active" onclick="window.setSoftSelectionCurve?.(\'smooth\', this)">Smooth</button>',
                '<button type="button" class="soft-curve-btn" onclick="window.setSoftSelectionCurve?.(\'sphere\', this)">Sphere</button>',
                '<button type="button" class="soft-curve-btn" onclick="window.setSoftSelectionCurve?.(\'linear\', this)">Linear</button>',
                '<button type="button" class="soft-curve-btn" onclick="window.setSoftSelectionCurve?.(\'sharp\', this)">Sharp</button>',
                '</div></div></section>',

                '<!-- 3DS MAX EXTRUDE ALONG SPLINE ROLLOUT -->',
                '<section class="modeling-inspector-section" id="spline-extrude-rollout">',
                '<div class="modeling-section-title"><span>Extrude Along Spline</span>',
                '<label class="flag-label" style="cursor:pointer;"><input type="checkbox" id="spline-extrude-enable" onchange="window.toggleSplineExtrude?.(this.checked)"> Live Preview</label></div>',
                '<div id="spline-extrude-controls" style="display:none; flex-direction:column; gap:6px; margin-top:6px;">',
                '<div class="modeling-command-grid modeling-command-grid-2">',
                '<button type="button" id="spline-pick-btn" data-model-action="pick-spline">Pick Spline</button>',
                '<button type="button" data-model-action="apply-spline-extrude">' + icon('check') + ' Apply</button></div>',
                '<div id="spline-pick-hint" class="modeling-hint">Select one or more faces, then pick a spline path.</div>',
                '<label class="modeling-number-row"><span>Segments</span><input id="spline-extrude-segments" type="number" value="8" min="1" max="256" step="1" oninput="window.setSplineExtrudeSegments?.(this.value)" onchange="window.setSplineExtrudeSegments?.(this.value)"></label>',
                '<label class="modeling-number-row"><span>Taper Amount</span><input id="spline-extrude-taper" type="number" value="0" step="0.01" oninput="window.setSplineExtrudeTaper?.(this.value)" onchange="window.setSplineExtrudeTaper?.(this.value)"></label>',
                '<label class="modeling-number-row"><span>Taper Curve</span><input id="spline-extrude-taper-curve" type="number" value="1" min="0.01" step="0.05" oninput="window.setSplineExtrudeTaperCurve?.(this.value)" onchange="window.setSplineExtrudeTaperCurve?.(this.value)"></label>',
                '<label class="modeling-number-row"><span>Twist (deg)</span><input id="spline-extrude-twist" type="number" value="0" step="5" oninput="window.setSplineExtrudeTwist?.(this.value)" onchange="window.setSplineExtrudeTwist?.(this.value)"></label>',
                '<label class="modeling-number-row"><span>Rotation (deg)</span><input id="spline-extrude-rotation" type="number" value="0" min="-360" max="360" step="5" disabled oninput="window.setSplineExtrudeRotation?.(this.value)" onchange="window.setSplineExtrudeRotation?.(this.value)"></label>',
                '<div class="modeling-number-row"><label class="flag-label" style="cursor:pointer;"><input type="checkbox" id="spline-extrude-align" onchange="window.setSplineExtrudeAlign?.(this.checked)"> Align to Face Normal</label>',
                '<label class="flag-label" style="cursor:pointer;"><input type="checkbox" id="spline-extrude-reverse" onchange="window.setSplineExtrudeReverse?.(this.checked)"> Reverse Path</label></div>',
                '<div class="modeling-number-row"><label class="flag-label" style="cursor:pointer;"><input type="checkbox" id="spline-extrude-cap-start" onchange="window.setSplineExtrudeCapStart?.(this.checked)"> Start Cap</label>',
                '<label class="flag-label" style="cursor:pointer;"><input type="checkbox" id="spline-extrude-cap-end" checked onchange="window.setSplineExtrudeCapEnd?.(this.checked)"> End Cap</label></div>',
                '<div class="modeling-number-row"><label class="flag-label" style="cursor:pointer;"><input type="checkbox" id="spline-extrude-smooth" checked onchange="window.setSplineExtrudeSmoothNormals?.(this.checked)"> Smooth Normals</label>',
                '<label class="flag-label" style="cursor:pointer;"><input type="checkbox" id="spline-extrude-uvs" checked onchange="window.setSplineExtrudeUVs?.(this.checked)"> UVs</label></div>',
                '<div class="modeling-number-row"><label class="flag-label" style="cursor:pointer;"><input type="checkbox" id="spline-extrude-adaptive" onchange="window.setSplineExtrudeAdaptive?.(this.checked)"> Adaptive Sampling</label>',
                '<label class="modeling-inline-number"><span>Samples/m</span><input id="spline-extrude-per-unit" type="number" value="2" min="0.1" step="0.1" style="width:52px; height:20px; font-size:10px;" oninput="window.setSplineExtrudePerUnit?.(this.value)" onchange="window.setSplineExtrudePerUnit?.(this.value)"></label></div>',
                '</div></section>',

                '<section id="fusion-cad-section" class="modeling-inspector-section fusion-cad-section" aria-label="Fusion CAD Tools"></section>',

                '<section class="modeling-inspector-section"><div class="modeling-section-title"><span>Mesh Operations</span></div><div class="modeling-command-grid">',
                '<button data-model-action="extrude">' + icon('box-select') + ' Extrude</button><button data-model-action="inset">' + icon('square-dashed-bottom') + ' Inset</button>',
                '<button data-model-action="bevel">' + icon('blend') + ' Bevel</button><button data-model-action="loopcut">' + icon('columns-3') + ' Loop Cut</button>',
                '<button data-model-action="knife">' + icon('slice') + ' Knife</button><button data-model-action="polybuild">' + icon('pen-tool') + ' Poly Build</button>',
                '<button data-model-action="subdivide">' + icon('grid-3x3') + ' Subdivide</button><button data-model-action="extrude-spline">' + icon('route') + ' Extrude Spline</button></div></section>',

                '<section class="modeling-inspector-section"><div class="modeling-section-title"><span>Operator Settings</span></div>',
                '<label class="modeling-number-row"><span>Extrude Distance</span><input id="modeling-extrude-distance" type="number" value="0.25" step="0.05"></label>',
                '<label class="modeling-number-row"><span>Inset Amount</span><input id="modeling-inset-amount" type="number" value="0.18" min="0" max="0.95" step="0.01"></label>',
                '<label class="modeling-number-row"><span>Inset Depth</span><input id="modeling-inset-depth" type="number" value="0" step="0.05"></label>',
                '<label class="modeling-number-row"><span>Bevel Amount</span><input id="modeling-bevel-amount" type="number" value="0.12" min="0.001" max="0.9" step="0.01"></label>',
                '<label class="modeling-number-row"><span>Weld Distance</span><input id="modeling-weld-distance" type="number" value="0.001" min="0.00001" step="0.001"></label>',
                '<div class="modeling-command-grid"><button data-model-action="apply-extrude">Apply Extrude</button><button data-model-action="apply-inset">Apply Inset</button>',
                '<button data-model-action="apply-bevel">Apply Bevel</button><button data-model-action="weld">Weld</button></div></section>',

                '<section class="modeling-inspector-section"><div class="modeling-section-title"><span>Topology</span></div><div class="modeling-command-grid">',
                '<button data-model-action="triangulate">Triangulate</button><button data-model-action="quads">Tris to Quads</button><button data-model-action="poke">Poke Faces</button>',
                '<button data-model-action="bridge">Bridge Loops</button><button data-model-action="dissolve">Dissolve</button><button data-model-action="flip-normals">Flip Normals</button>',
                '<button data-model-action="solidify">Solidify</button><button data-model-action="symmetrize">Symmetrize X</button></div></section>',

                '<section class="modeling-inspector-section modeling-mesh-info"><div class="modeling-section-title"><span>Mesh Data</span></div><dl>',
                '<div><dt>Vertices</dt><dd id="modeling-stat-vertices">0</dd></div><div><dt>Edges</dt><dd id="modeling-stat-edges">0</dd></div><div><dt>Faces</dt><dd id="modeling-stat-faces">0</dd></div>',
                '</dl></section><div id="modeling-message" class="modeling-message">Select a mesh to begin.</div>'
            ].join('');
        },

        bindEvents() {
            if (this.eventsBound) return;
            this.eventsBound = true;
            document.addEventListener('click', (event) => {
                const workspaceTab = event.target.closest('.workspace-tab');
                if (this.active && workspaceTab && workspaceTab.id !== 'modelingControls') {
                    this.close();
                }

                const target = event.target.closest('[data-model-action]');
                if (!target) return;
                event.preventDefault();
                event.stopPropagation();
                this.runAction(target.dataset.modelAction);
            });

            window.addEventListener('keydown', (event) => {
                if (!this.active || /INPUT|TEXTAREA|SELECT/.test(event.target?.tagName || '')) return;
                if (event.key === 'Tab') {
                    event.preventDefault();
                    this.runAction(window.UnifiedModelingSystem?.isEditMode ? 'object-mode' : 'edit-mode');
                }
            });
        },

        number(id, fallback) {
            const value = Number(document.getElementById(id)?.value);
            return Number.isFinite(value) ? value : fallback;
        },

        setTransformMode(mode) {
            if (typeof window.setTransformMode === 'function') {
                window.setTransformMode(mode);
            } else {
                const controls = window.transformControls || (typeof transformControls !== 'undefined' ? transformControls : null);
                controls?.setMode?.(mode);
                if (window.UnifiedModelingSystem) window.UnifiedModelingSystem.currentTransformMode = mode;
            }
            window.UnifiedModelingSystem?.updateSubObjectTransformGizmo?.();
        },

        runAction(action) {
            const sys = window.UnifiedModelingSystem;
            const advanced = window.AdvancedModeling;
            if (!sys && action !== 'close') return;
            const faces = () => [...(sys.editableMesh?.selectedFaces || [])];
            const edges = () => [...(sys.editableMesh?.selectedEdges || [])];

            switch (action) {
                case 'close': this.close(); break;
                case 'add-cube': document.getElementById('addCube')?.click(); break;
                case 'add-plane': document.getElementById('addPlane')?.click(); break;
                case 'add-sphere': document.getElementById('addSphere')?.click(); break;
                case 'add-cylinder': document.getElementById('addCylinder')?.click(); break;
                case 'object-mode':
                    this.sessionMode = 'object';
                    sys.exitEditMode?.();
                    break;
                case 'edit-mode':
                    this.sessionMode = 'edit';
                    sys.enterEditMode?.();
                    break;
                case 'detail-mode':
                    this.sessionMode = 'detail';
                    if (!sys.isEditMode) sys.enterEditMode?.();
                    sys.setSelectionMode?.('face');
                    if (advanced?.ProportionalEdit) advanced.ProportionalEdit.enabled = true;
                    sys.settings.faceOpacity = 0.28;
                    sys.rebuildAllHelpers?.();
                    sys.architectureMessage = 'Detail mode: face editing and proportional tools ready.';
                    break;
                case 'retopo-mode':
                    this.sessionMode = 'retopo';
                    if (!sys.isEditMode) sys.enterEditMode?.();
                    sys.setSelectionMode?.('vertex');
                    sys.settings.vertexScale = 1.2;
                    sys.settings.faceOpacity = 0.08;
                    sys.rebuildAllHelpers?.();
                    sys.architectureMessage = 'Retopology mode: vertex editing with a lightweight surface overlay.';
                    break;
                case 'attach': sys.attachSelectionTarget?.(); if (!sys.isEditMode) sys.enterEditMode?.(); break;
                case 'vertex': sys.setSelectionMode?.('vertex'); break;
                case 'edge': sys.setSelectionMode?.('edge'); break;
                case 'face': sys.setSelectionMode?.('face'); break;
                case 'select': sys.setPolygonTool?.(null); break;
                case 'select-all': sys.selectAllElements?.(); break;
                case 'invert': sys.invertSelection?.(); break;
                case 'linked': sys.selectLinkedElements?.(); break;
                case 'move': this.setTransformMode('translate'); break;
                case 'rotate': this.setTransformMode('rotate'); break;
                case 'scale': this.setTransformMode('scale'); break;
                case 'extrude':
                case 'apply-extrude': sys.extrudeSelection?.(this.number('modeling-extrude-distance', 0.25)); break;
                case 'inset': sys.setPolygonTool?.('inset'); break;
                case 'bevel': sys.setPolygonTool?.('bevel'); break;
                case 'loopcut': sys.setPolygonTool?.('loopcut'); break;
                case 'edgeslide': sys.setPolygonTool?.('edgeslide'); break;
                case 'shrinkfatten': sys.setPolygonTool?.('shrinkfatten'); break;
                case 'shear': sys.setPolygonTool?.('shear'); break;
                case 'knife': if (advanced?.activateKnife) advanced.activateKnife(); else sys.applyKnifeCut?.(); break;
                case 'polybuild': sys.polyBuildFace?.(); break;
                case 'rip': sys.applyRipRegion?.(); break;
                case 'smooth': sys.smoothSelection?.(2, 0.45); break;
                case 'subdivide': sys.subdivideSelection?.(); break;
                case 'extrude-spline': window.toggleSplineExtrude?.(true); break;
                case 'pick-spline': window.startSplinePick?.(); break;
                case 'apply-spline-extrude': window.applySplineExtrude?.(); break;
                case 'merge': sys.mergeSelection?.(); break;
                case 'delete': sys.deleteSelection?.(); break;
                case 'apply-inset': sys.applyInsetFaces?.(faces(), this.number('modeling-inset-amount', 0.18), this.number('modeling-inset-depth', 0)); break;
                case 'apply-bevel':
                    if (sys.selectMode === 'face') sys.applyFaceBevel?.(faces(), this.number('modeling-bevel-amount', 0.12));
                    else if (sys.selectMode === 'edge') sys.applyEdgeBevel?.(edges(), this.number('modeling-bevel-amount', 0.12));
                    break;
                case 'weld': advanced?.weldByDistance?.(this.number('modeling-weld-distance', 0.001)); break;
                case 'triangulate': advanced?.triangulate?.(); break;
                case 'quads': advanced?.trisToQuads?.(20); break;
                case 'poke': advanced?.pokeFaces?.(); break;
                case 'bridge': advanced?.bridgeEdgeLoops?.(); break;
                case 'dissolve': if (sys.selectMode === 'edge') advanced?.dissolveEdges?.(); else advanced?.dissolveVertices?.(); break;
                case 'flip-normals': advanced?.flipNormals?.(); break;
                case 'solidify': advanced?.solidify?.(0.05); break;
                case 'symmetrize': advanced?.symmetrize?.('x', true, 0.0001); break;
            }
            window.ModelingToolkitController?.refreshUI?.();
            this.refresh();
        },

        refresh() {
            if (!this.active) return;
            const sys = window.UnifiedModelingSystem;
            const mesh = sys?.activeMesh || window.selectedObject;
            const data = sys?.editableMesh;
            const editing = !!sys?.isEditMode;
            const mode = sys?.selectMode || 'vertex';
            const count = sys?.getSelectionCount?.() || 0;
            const setText = (id, value) => {
                const element = document.getElementById(id);
                if (element) element.textContent = value;
            };

            const softEngine = window.SoftSelectionEngine;
            if (softEngine) {
                const enable = document.getElementById('soft-select-enable');
                const body = document.getElementById('soft-select-controls');
                if (enable && body) {
                    enable.checked = !!softEngine.enabled;
                    body.style.display = softEngine.enabled ? 'flex' : 'none';
                }
                const radius = document.getElementById('soft-select-radius');
                if (radius && radius !== document.activeElement) radius.value = String(softEngine.radius || 3.0);
                const pinch = document.getElementById('soft-select-pinch');
                if (pinch && pinch !== document.activeElement) pinch.value = String(softEngine.pinch || 0);
                const bubble = document.getElementById('soft-select-bubble');
                if (bubble && bubble !== document.activeElement) bubble.value = String(softEngine.bubble || 0);
                const modeSel = document.getElementById('soft-select-mode');
                if (modeSel) modeSel.value = softEngine.mode || 'volume';
                const edge = document.getElementById('soft-select-edge');
                if (edge) edge.checked = !!softEngine.edgeDistance;
                const edgeSteps = document.getElementById('soft-select-edge-steps');
                if (edgeSteps && edgeSteps !== document.activeElement) edgeSteps.value = String(softEngine.edgeSteps || 3);
                const back = document.getElementById('soft-select-backfacing');
                if (back) back.checked = softEngine.affectBackfacing !== false;
                const lock = document.getElementById('soft-select-lock');
                if (lock) lock.checked = !!softEngine.locked;
                const shaded = document.getElementById('soft-select-shaded');
                if (shaded) shaded.checked = !!softEngine.showShadedFaces;
                const colors = document.getElementById('soft-select-colors');
                if (colors) colors.checked = softEngine.showHeatmap !== false;
            }

            const sxe = window.SplineExtrudeEngine;
            if (sxe) {
                const enable = document.getElementById('spline-extrude-enable');
                const body = document.getElementById('spline-extrude-controls');
                if (enable && body) {
                    enable.checked = !!sxe.enabled;
                    body.style.display = sxe.enabled ? 'flex' : 'none';
                }
                const syncNumber = (id, value) => {
                    const element = document.getElementById(id);
                    if (element && element !== document.activeElement) element.value = String(value);
                };
                syncNumber('spline-extrude-segments', sxe.segments);
                syncNumber('spline-extrude-taper', sxe.taperAmount);
                syncNumber('spline-extrude-taper-curve', sxe.taperCurve);
                syncNumber('spline-extrude-twist', sxe.twistDegrees);
                syncNumber('spline-extrude-rotation', sxe.rotationDegrees);
                syncNumber('spline-extrude-per-unit', sxe.samplesPerUnit);
                const align = document.getElementById('spline-extrude-align');
                if (align) align.checked = !!sxe.alignToFaceNormal;
                const rotation = document.getElementById('spline-extrude-rotation');
                if (rotation) rotation.disabled = !sxe.alignToFaceNormal;
                const reverse = document.getElementById('spline-extrude-reverse');
                if (reverse) reverse.checked = !!sxe.reverse;
                const capStart = document.getElementById('spline-extrude-cap-start');
                if (capStart) capStart.checked = !!sxe.capStart;
                const capEnd = document.getElementById('spline-extrude-cap-end');
                if (capEnd) capEnd.checked = sxe.capEnd !== false;
                const smooth = document.getElementById('spline-extrude-smooth');
                if (smooth) smooth.checked = sxe.smoothNormals !== false;
                const uvs = document.getElementById('spline-extrude-uvs');
                if (uvs) uvs.checked = sxe.generateUVs !== false;
                const adaptive = document.getElementById('spline-extrude-adaptive');
                if (adaptive) adaptive.checked = !!sxe.adaptiveSampling;
                const pick = document.getElementById('spline-pick-btn');
                if (pick) pick.textContent = sxe.splineName ? 'Spline: ' + sxe.splineName : 'Pick Spline';
                const hint = document.getElementById('spline-pick-hint');
                if (hint) {
                    const faces = data?.selectedFaces?.size || 0;
                    const hasPath = (sxe.pathPoints?.length || 0) >= 2;
                    hint.textContent = !faces
                        ? 'Select one or more faces first (Face mode).'
                        : !hasPath
                            ? 'Pick a spline object in the viewport.'
                            : sxe.enabled
                                ? 'Preview ready — adjust settings or press Apply.'
                                : 'Enable Live Preview to see the sweep.';
                }
                sxe.refreshIfDirty?.();
            }

            setText('modeling-active-object', mesh?.name || 'No mesh selected');
            setText('modeling-selection-count', count + ' selected');
            setText('modeling-stat-vertices', data?.vertices?.length || mesh?.geometry?.attributes?.position?.count || 0);
            setText('modeling-stat-edges', data?.edges?.length || 0);
            setText('modeling-stat-faces', data?.faces?.length || 0);
            setText('modeling-viewport-status', editing ? (mesh?.name || 'Mesh') + ' · ' + mode + ' · ' + count + ' selected' : (mesh?.name || 'No mesh selected'));
            setText('modeling-message', sys?.architectureMessage || (editing ? 'Edit Mode ready.' : 'Select a mesh and enter Edit Mode.'));

            if (!editing) this.sessionMode = 'object';
            else if (this.sessionMode === 'object') this.sessionMode = 'edit';
            document.querySelectorAll('[data-model-action="object-mode"]').forEach((element) => element.classList.toggle('active', !editing));
            document.querySelectorAll('[data-model-action="edit-mode"]').forEach((element) => element.classList.toggle('active', editing && this.sessionMode === 'edit'));
            document.querySelectorAll('[data-model-action="detail-mode"]').forEach((element) => element.classList.toggle('active', editing && this.sessionMode === 'detail'));
            document.querySelectorAll('[data-model-action="retopo-mode"]').forEach((element) => element.classList.toggle('active', editing && this.sessionMode === 'retopo'));
            ['vertex', 'edge', 'face'].forEach((name) => {
                document.querySelectorAll('[data-model-action="' + name + '"]').forEach((element) => element.classList.toggle('active', editing && mode === name));
            });
            document.querySelectorAll('.modeling-rail-btn').forEach((element) => {
                const action = element.dataset.modelAction;
                const polygonActive = action === sys?.activePolygonTool;
                const transformActive = (action === 'move' && sys?.currentTransformMode === 'translate')
                    || (action === 'rotate' && sys?.currentTransformMode === 'rotate')
                    || (action === 'scale' && sys?.currentTransformMode === 'scale');
                element.classList.toggle('active', polygonActive || transformActive || (action === 'select' && !sys?.activePolygonTool));
                element.disabled = !editing && !action.startsWith('add-') && !['select', 'move', 'rotate', 'scale'].includes(action);
            });
        }
    };
})();
