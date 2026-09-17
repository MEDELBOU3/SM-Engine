(function () {
    "use strict";

    const ROOT_ID = "modelingTools";
    const DATA_TARGET_ACTIONS = {
        "options-extrude": () => window.extrudeSelection && window.extrudeSelection(),
        "options-bevel": () => unsupportedTool("Bevel"),
        "options-loopcut": () => unsupportedTool("Loop Cut"),
        "options-inset": () => unsupportedTool("Inset"),
        "options-bridge": () => unsupportedTool("Bridge"),
        "options-spin": () => unsupportedTool("Spin"),
        "options-cutsurface": () => unsupportedTool("Cut Surface"),
        "options-subdivface": () => window.applySubdivision && window.applySubdivision(1),
        "options-edgetoprofile": () => unsupportedTool("Edges To Profile"),
        "options-shell": () => unsupportedTool("Shell"),
        "options-boolean": () => unsupportedTool("Boolean"),
        "options-polypen": () => unsupportedTool("Poly Pen"),
        "arch-wall": () => window.toggleArchTool && window.toggleArchTool("wall"),
        "arch-door": () => window.toggleArchTool && window.toggleArchTool("door"),
        "arch-window": () => window.toggleArchTool && window.toggleArchTool("window"),
        "arch-stairs": () => window.toggleArchTool && window.toggleArchTool("stairs"),
        "arch-roof": () => unsupportedTool("Roof"),
        "arch-room": () => window.toggleArchTool && window.toggleArchTool("room"),
        "arch-column": () => window.toggleArchTool && window.toggleArchTool("column"),
        "arch-railing": () => unsupportedTool("Railing"),
        "arch-rectext": () => unsupportedTool("Rect Extrude"),
        "arch-curvewall": () => unsupportedTool("Curved Wall"),
        "arch-terrain": () => window.toggleArchTool && window.toggleArchTool("terrain"),
        "arch-measure": () => unsupportedTool("Measure"),
        "arch-presets": () => unsupportedTool("Window Presets"),
        "arch-synth": () => unsupportedTool("Structure Synth"),
    };

    function byId(id) {
        return document.getElementById(id);
    }

    function root() {
        return byId(ROOT_ID);
    }

    function system() {
        return window.UnifiedModelingSystem || null;
    }

    function isFn(value) {
        return typeof value === "function";
    }

    function unsupportedTool(label) {
        if (window.UnifiedModelingSystem) {
            window.UnifiedModelingSystem.architectureMessage = `${label} is not rebuilt yet in the new modeling system.`;
        }
        if (window.ModelingToolkitController) {
            window.ModelingToolkitController.refreshUI();
        }
    }

    function sectionButton(id, label, extraClass) {
        return `<button id="${id}" class="panel-button-tool ${extraClass || ""}" type="button">${label}</button>`;
    }

    function panelButton(id, label) {
        return `<button id="${id}" class="panel-button" type="button">${label}</button>`;
    }

    function renderWorkbenchMarkup() {
        return `
            <div class="tool-section">
                <div class="section-header" onclick="toggleSection(this)">
                    <span>Mode</span>
                    <i class="fas fa-chevron-down"></i>
                </div>
                <div class="section-body">
                    <div class="tool-grid" style="grid-template-columns: repeat(2, 1fr);">
                        <button id="modeling-mode-object" class="btn" type="button">Object Mode</button>
                        <button id="toggle-modeling" class="btn btn-primary" type="button">Edit Mode</button>
                    </div>
                    <button id="modeling-use-selection" class="btn" type="button" style="margin-top:8px;">Use Hierarchy Selection</button>
                    <div id="modeling-status" class="tool-instruction" style="margin-top:10px;">Select a mesh from the hierarchy, then enter Edit Mode.</div>
                </div>
            </div>

            <div class="tool-section">
                <div class="section-header" onclick="toggleSection(this)">
                    <span>Selection</span>
                    <i class="fas fa-chevron-down"></i>
                </div>
                <div class="section-body">
                    <div class="selection-strip">
                        <button id="select-vertex" class="tool-btn" type="button">V</button>
                        <button id="select-edge" class="tool-btn" type="button">E</button>
                        <button id="select-face" class="tool-btn" type="button">F</button>
                    </div>
                    <div class="form-row">
                        <label class="form-label">Vertex Size</label>
                        <input type="range" id="vertexSizeSlider" value="1" min="0.2" max="3" step="0.1">
                    </div>
                    <div class="form-row">
                        <label class="form-label">Edge Opacity</label>
                        <input type="range" id="edgeOpacitySlider" value="0.9" min="0.1" max="1" step="0.05">
                    </div>
                    <div class="form-row">
                        <label class="form-label">Face Opacity</label>
                        <input type="range" id="faceOpacitySlider" value="0.22" min="0.05" max="0.9" step="0.05">
                    </div>
                </div>
            </div>

            <div class="tool-section">
                <div class="section-header" onclick="toggleSection(this)">
                    <span>Mesh</span>
                    <i class="fas fa-chevron-down"></i>
                </div>
                <div class="section-body">
                    <div class="tool-grid" style="grid-template-columns: repeat(3, 1fr);">
                        <button id="tool-extrude" class="tool-btn" type="button">Ext</button>
                        <button id="tool-subdivide" class="tool-btn" type="button">Sub</button>
                        <button id="tool-merge" class="tool-btn" type="button">Mrg</button>
                        <button id="tool-delete-selection" class="tool-btn" type="button">Del</button>
                        <button id="delete-active-object" class="tool-btn" type="button">Mesh</button>
                    </div>
                </div>
            </div>

            <div class="tool-section">
                <div class="section-header" onclick="toggleSection(this)">
                    <span>Architecture</span>
                    <i class="fas fa-chevron-down"></i>
                </div>
                <div class="section-body">
                    <div class="tool-grid">
                        <button id="tool-wall" class="tool-btn arch-tool" type="button">Wall</button>
                        <button id="tool-room" class="tool-btn arch-tool" type="button">Room</button>
                        <button id="tool-column" class="tool-btn arch-tool" type="button">Column</button>
                        <button id="tool-stairs" class="tool-btn arch-tool" type="button">Stairs</button>
                        <button id="tool-door" class="tool-btn arch-tool" type="button">Door</button>
                        <button id="tool-window" class="tool-btn arch-tool" type="button">Window</button>
                        <button id="tool-terrain" class="tool-btn arch-tool" type="button">Terrain</button>
                        <button id="tool-arch-cancel" class="tool-btn arch-tool" type="button">Cancel</button>
                    </div>
                </div>
            </div>

            <div class="tool-section">
                <div class="section-header" onclick="toggleSection(this)">
                    <span>Tool Settings</span>
                    <i class="fas fa-chevron-down"></i>
                </div>
                <div class="section-body">
                    <div class="form-row">
                        <label for="arch-height-input" class="form-label">Height</label>
                        <input id="arch-height-input" class="form-input" type="number" value="2.8" step="0.1">
                    </div>
                    <div class="form-row">
                        <label for="arch-thickness-input" class="form-label">Thickness</label>
                        <input id="arch-thickness-input" class="form-input" type="number" value="0.2" step="0.05">
                    </div>
                    <div class="form-row">
                        <label for="arch-width-input" class="form-label">Width</label>
                        <input id="arch-width-input" class="form-input" type="number" value="1.2" step="0.1">
                    </div>
                    <div class="form-row">
                        <label for="arch-depth-input" class="form-label">Depth</label>
                        <input id="arch-depth-input" class="form-input" type="number" value="1.2" step="0.1">
                    </div>
                    <div class="form-row">
                        <label for="arch-segments-input" class="form-label">Segments / Steps</label>
                        <input id="arch-segments-input" class="form-input" type="number" value="8" min="1" step="1">
                    </div>
                    <div class="form-row">
                        <label for="arch-floor-checkbox" class="form-label">Add Floor</label>
                        <input id="arch-floor-checkbox" class="form-input" type="checkbox" checked>
                    </div>
                    <div class="form-row">
                        <label for="arch-ceiling-checkbox" class="form-label">Add Ceiling</label>
                        <input id="arch-ceiling-checkbox" class="form-input" type="checkbox">
                    </div>
                    <div id="architecture-status" class="tool-instruction" style="margin-top:8px;">Architecture tools are click-based. Pick a tool, then click in the viewport.</div>
                </div>
            </div>
        `;
    }

    function refreshStatus() {
        const editStatus = byId("modeling-status");
        const archStatus = byId("architecture-status");
        const modeler = system();

        if (!modeler) return;

        if (editStatus) {
            const activeName = modeler.activeMesh ? modeler.activeMesh.name || "Unnamed Mesh" : "No Active Mesh";
            const modeLabel = modeler.isEditMode ? `Edit Mode / ${modeler.selectMode}` : "Object Mode";
            editStatus.textContent = `${modeLabel} | ${activeName}`;
        }

        if (archStatus) {
            archStatus.textContent = modeler.architectureMessage || "Architecture tools are click-based. Pick a tool, then click in the viewport.";
        }
    }

    function refreshButtons() {
        const modeler = system();
        if (!modeler) return;

        const editEnabled = !!modeler.isEditMode;
        const hasMesh = !!modeler.activeMesh;
        const selectionCount = modeler.getSelectionCount ? modeler.getSelectionCount() : 0;

        const modeMap = {
            "select-vertex": "vertex",
            "select-edge": "edge",
            "select-face": "face",
        };

        Object.keys(modeMap).forEach((id) => {
            const button = byId(id);
            if (!button) return;
            button.disabled = !editEnabled || !hasMesh;
            button.classList.toggle("active-tool", editEnabled && modeler.selectMode === modeMap[id]);
        });

        const editButton = byId("toggle-modeling");
        if (editButton) {
            editButton.classList.toggle("active-tool", editEnabled);
        }

        const activeArchTool = modeler.activeArchitectureTool || null;
        const archMap = {
            "tool-wall": "wall",
            "tool-room": "room",
            "tool-column": "column",
            "tool-stairs": "stairs",
            "tool-door": "door",
            "tool-window": "window",
            "tool-terrain": "terrain",
        };

        Object.keys(archMap).forEach((id) => {
            const button = byId(id);
            if (!button) return;
            button.disabled = !editEnabled;
            button.classList.toggle("active-tool", activeArchTool === archMap[id]);
        });

        ["tool-extrude", "tool-subdivide", "tool-merge", "tool-delete-selection", "delete-active-object", "merge-active-geometry", "apply-subdivision"].forEach((id) => {
            const button = byId(id);
            if (!button) return;
            if (id === "delete-active-object") {
                button.disabled = !hasMesh;
                return;
            }
            const isAlwaysMeshOnly = id === "tool-subdivide" || id === "tool-merge" || id === "merge-active-geometry" || id === "apply-subdivision";
            button.disabled = !editEnabled || !hasMesh || (!isAlwaysMeshOnly && selectionCount === 0);
        });

        const cancelTool = byId("tool-arch-cancel");
        if (cancelTool) {
            cancelTool.disabled = !activeArchTool;
        }

        refreshStatus();
    }

    const Controller = {
        initialized: false,
        ownsToggleButton: true,
        buttonHandlers: new Map(),
        dataTargetHandlers: new Map(),

        init() {
            console.log("🔧 ModelingToolkitController.init() called");
            const container = root();
            if (!container) {
                console.error("❌ Container #modelingTools NOT FOUND!");
                return this;
            }
            console.log("✓ Container found:", container.id);

            const workbench = container.querySelector(".panel-content");
            if (!workbench) {
                console.error("❌ Workbench (.panel-content) NOT FOUND in container!");
                return this;
            }
            console.log("✓ Workbench found");

            if (this.initialized) {
                console.log("ℹ️  Controller already initialized, binding handlers...");
                this.bindDirectHandlers();
                this.bindDataTargetHandlers();
                this.refreshUI();
                return this;
            }

            console.log("→ Setting up initial event listeners...");

            container.addEventListener("click", (event) => {
                const button = event.target.closest("button[id]");
                if (!button) return;
                if (!container.contains(button)) {
                    console.warn("❌ Button found but not in container:", button.id);
                    return;
                }

                const modeler = system();
                if (!modeler) {
                    console.error("❌ CRITICAL: UnifiedModelingSystem not found!");
                    return;
                }

                console.log("🔷 Button clicked:", button.id);

                const handlers = {
                    "modeling-mode-object": () => {
                        console.log("→ Exiting edit mode");
                        modeler.exitEditMode();
                    },
                    "toggle-modeling": () => {
                        console.log("→ Toggling modeling mode, current state:", modeler.isEditMode);
                        modeler.toggleEditMode();
                        console.log("→ After toggle, isEditMode:", modeler.isEditMode);
                    },
                    "modeling-use-selection": () => modeler.attachSelectionTarget(),
                    "select-vertex": () => modeler.setSelectionMode("vertex"),
                    "select-edge": () => modeler.setSelectionMode("edge"),
                    "select-face": () => modeler.setSelectionMode("face"),
                    "tool-extrude": () => modeler.extrudeSelection(),
                    "tool-subdivide": () => modeler.subdivideSelection(),
                    "tool-merge": () => modeler.mergeSelection(),
                    "merge-active-geometry": () => modeler.mergeSelection(),
                    "apply-subdivision": () => modeler.subdivideSelection(),
                    "tool-delete-selection": () => modeler.deleteSelection(),
                    "delete-active-object": () => modeler.deleteActiveMesh(),
                    "tool-wall": () => modeler.setArchitectureTool("wall"),
                    "tool-room": () => modeler.setArchitectureTool("room"),
                    "tool-column": () => modeler.setArchitectureTool("column"),
                    "tool-stairs": () => modeler.setArchitectureTool("stairs"),
                    "tool-door": () => modeler.setArchitectureTool("door"),
                    "tool-place-door": () => modeler.setArchitectureTool("door"),
                    "tool-window": () => modeler.setArchitectureTool("window"),
                    "tool-place-window": () => modeler.setArchitectureTool("window"),
                    "tool-terrain": () => modeler.setArchitectureTool("terrain"),
                    "tool-arch-cancel": () => modeler.setArchitectureTool(null),
                };

                const handler = handlers[button.id];
                if (!handler) return;

                event.preventDefault();
                handler();
                this.refreshUI();
            }, true);

            container.addEventListener("input", () => {
                const modeler = system();
                if (!modeler) return;
                if (isFn(modeler.readUiSettings)) {
                    modeler.readUiSettings();
                }
                if (isFn(modeler.rebuildAllHelpers)) {
                    modeler.rebuildAllHelpers();
                }
                this.refreshUI();
            }, true);

            this.initialized = true;
            window.__modelingToolbarBridgeReady = true;
            window.__modelingControllerReady = true;
            this.bindDirectHandlers();
            this.bindDataTargetHandlers();
            this.refreshUI();
            console.log("✅ ModelingToolkitController fully initialized!");
            console.log("  - Click listeners attached to #modelingTools");
            console.log("  - Direct handlers: toggle-modeling, select-vertex, etc.");
            console.log("  - Data target handlers: .dyn-tool, .arch-tool");
            return this;
        },

        bindDirectHandlers() {
            const handlerMap = {
                "toggle-modeling": () => window.toggleModelingMode && window.toggleModelingMode(),
                "modeling-mode-object": () => window.UnifiedModelingSystem && window.UnifiedModelingSystem.exitEditMode(),
                "modeling-use-selection": () => window.UnifiedModelingSystem && window.UnifiedModelingSystem.attachSelectionTarget(),
                "select-vertex": () => window.setSelectionMode && window.setSelectionMode("vertex"),
                "select-edge": () => window.setSelectionMode && window.setSelectionMode("edge"),
                "select-face": () => window.setSelectionMode && window.setSelectionMode("face"),
                "tool-extrude": () => window.extrudeSelection && window.extrudeSelection(),
                "tool-subdivide": () => window.applySubdivision && window.applySubdivision(1),
                "tool-merge": () => window.mergeActiveGeometry && window.mergeActiveGeometry(),
                "merge-active-geometry": () => window.mergeActiveGeometry && window.mergeActiveGeometry(),
                "apply-subdivision": () => window.applySubdivision && window.applySubdivision(1),
                "tool-delete-selection": () => window.UnifiedModelingSystem && window.UnifiedModelingSystem.deleteSelection(),
                "delete-active-object": () => window.deleteSelectedObject && window.deleteSelectedObject(),
                "tool-wall": () => window.toggleArchTool && window.toggleArchTool("wall"),
                "tool-room": () => window.toggleArchTool && window.toggleArchTool("room"),
                "tool-column": () => window.toggleArchTool && window.toggleArchTool("column"),
                "tool-stairs": () => window.toggleArchTool && window.toggleArchTool("stairs"),
                "tool-door": () => window.toggleArchTool && window.toggleArchTool("door"),
                "tool-place-door": () => window.toggleArchTool && window.toggleArchTool("door"),
                "tool-window": () => window.toggleArchTool && window.toggleArchTool("window"),
                "tool-place-window": () => window.toggleArchTool && window.toggleArchTool("window"),
                "tool-terrain": () => window.toggleArchTool && window.toggleArchTool("terrain"),
                "tool-arch-cancel": () => window.deactivateCurrentArchTool && window.deactivateCurrentArchTool(),
            };

            Object.keys(handlerMap).forEach((id) => {
                const button = byId(id);
                if (!button || button.dataset.modelingBound === "1") return;

                const clickHandler = (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    const action = handlerMap[id];
                    if (isFn(action)) action();
                    this.refreshUI();
                };

                button.dataset.modelingBound = "1";
                button.addEventListener("click", clickHandler, true);
                this.buttonHandlers.set(id, clickHandler);
            });
        },

        bindDataTargetHandlers() {
            const buttons = document.querySelectorAll("#modelingTools .dyn-tool, #modelingTools .arch-tool");
            buttons.forEach((button) => {
                if (button.dataset.modelingBound === "1") return;

                const target = button.getAttribute("data-target");
                if (!target) return;

                const clickHandler = (event) => {
                    event.preventDefault();
                    event.stopPropagation();

                    const action = DATA_TARGET_ACTIONS[target];
                    if (isFn(action)) {
                        action();
                    }

                    this.refreshUI();
                };

                button.dataset.modelingBound = "1";
                button.addEventListener("click", clickHandler, true);
                this.dataTargetHandlers.set(target, clickHandler);
            });
        },

        refreshUI() {
            refreshButtons();
        },
    };

    window.ModelingToolkitController = Controller;

    function initControllerWhenReady() {
        console.log("→ initControllerWhenReady() triggered");
        if (window.ModelingToolkitController && typeof window.ModelingToolkitController.init === "function") {
            console.log("→ Calling ModelingToolkitController.init()");
            window.ModelingToolkitController.init();
        } else {
            console.error("❌ ModelingToolkitController not found or init not a function");
        }
    }

    if (document.readyState === "loading") {
        console.log("→ Document still loading, waiting for DOMContentLoaded");
        document.addEventListener("DOMContentLoaded", initControllerWhenReady, { once: true });
    } else {
        console.log("→ Document already loaded, calling initControllerWhenReady immediately");
        initControllerWhenReady();
    }

    window.addEventListener("load", initControllerWhenReady, { once: true });
})();
