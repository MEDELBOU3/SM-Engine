/**
 * SM Architecture Studio
 * Professional architecture and structural-concept workflow for SM Engine.
 * Extends UnifiedModelingSystem without replacing its modeling implementation.
 */
(function () {
    "use strict";

    const REFERENCE_BLUEPRINT = "assets/examples/atrium-blueprint.png";
    const PRESET_ID = "atrium-reference-2026";
    const TOOL_GROUPS = [
        {
            title: "Plan & Envelope",
            hint: "draw the building shell",
            tools: [
                ["cad-polyline", "fa-draw-polygon", "Plan trace"],
                ["wall", "fa-grip-lines-vertical", "Wall"],
                ["room", "fa-vector-square", "Room"],
                ["door", "fa-door-open", "Door"],
                ["window", "fa-window-maximize", "Window"],
                ["slab", "fa-square", "Slab"],
                ["roof", "fa-house", "Roof"],
                ["curved-wall", "fa-bezier-curve", "Curve wall"],
                ["facade", "fa-building", "Facade"],
            ],
        },
        {
            title: "Structure",
            hint: "concept framing",
            tools: [
                ["column", "fa-grip-lines", "Column"],
                ["beam", "fa-minus", "Beam"],
                ["foundation", "fa-layer-group", "Foundation"],
                ["stairs", "fa-stairs", "Stairs"],
                ["railing", "fa-bars-staggered", "Railing"],
                ["rect-extrude", "fa-cube", "Mass"],
                ["terrain", "fa-mountain-sun", "Terrain"],
                ["measure", "fa-ruler-combined", "Measure"],
            ],
        },
        {
            title: "Modify & Populate",
            hint: "repeat, offset, furnish",
            tools: [
                ["offset", "fa-arrows-left-right", "Offset"],
                ["array-linear", "fa-ellipsis", "Array"],
                ["table", "fa-table", "Table"],
                ["chair", "fa-chair", "Chair"],
            ],
        },
    ];

    const state = {
        initialized: false,
        panel: null,
        activeTab: "build",
        lastUiTool: null,
        refreshTimer: null,
        cadPlanActive: false,
        cadGridEnabled: true,
        cadGrid: null,
        viewportOverlay: null,
        panelObserver: null,
        pointerTarget: null,
        pointerHandler: null,
        cameraChangeHandler: null,
        savedEnvironment: null,
        savedControls: null,
        pendingUnderlay: null,
        pendingUnderlayFile: null,
        underlayAspect: 1024 / 540,

        // Architecture Vision / procedural building bridge.
        aiPlanMap: null,
        aiGeneratedRoot: null,
        aiBusy: false,

        constraints: {
            enabled: true,
            snapStep: 0.25,
            angleStep: 15,
            ortho: false,
            polar: true,
            objectSnap: true,
        },
        units: "m",
    };

    function system() {
        return window.UnifiedModelingSystem || null;
    }

    function finite(value, fallback) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : fallback;
    }

    function escapeHtml(value) {
        return String(value == null ? "" : value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function cssColor(variable, fallback) {
        const probe = document.createElement("span");
        probe.style.color = `var(${variable}, ${fallback})`;
        probe.style.position = "fixed";
        probe.style.pointerEvents = "none";
        probe.style.opacity = "0";
        document.body.appendChild(probe);
        const resolved = getComputedStyle(probe).color || fallback;
        probe.remove();
        const color = new THREE.Color();
        try { color.setStyle(resolved); } catch (_) { color.setStyle(fallback); }
        return color;
    }

    function getViewGeometry() {
        const elements = architectureElements().filter((object) => object.userData?.archType !== "blueprint-underlay");
        const box = new THREE.Box3();
        elements.forEach((object) => box.expandByObject(object));
        const center = box.isEmpty() ? new THREE.Vector3() : box.getCenter(new THREE.Vector3());
        const size = box.isEmpty() ? new THREE.Vector3(12, 6, 12) : box.getSize(new THREE.Vector3());
        const distance = Math.max(size.x, size.z, size.y * 2, 12) * 1.25;
        return { elements, box, center, size, distance };
    }

    function currentStoryElevation() {
        const modeler = system();
        if (typeof modeler?.getCurrentStoryElevation === "function") return modeler.getCurrentStoryElevation();
        return (Number(modeler?.settings?.archCurrentStory) || 0) * (Number(modeler?.settings?.archStoryHeight) || 3.2);
    }

    function ensureCadGrid() {
        if (state.cadGrid?.parent) return state.cadGrid;
        const existing = window.scene?.getObjectByName?.("SMArchitectureCadGrid");
        if (existing) {
            state.cadGrid = existing;
            return existing;
        }
        if (!window.scene || !window.THREE) return null;

        const size = 200;
        const fine = new THREE.GridHelper(
            size,
            800,
            cssColor("--cad-drafting-grid-major", "#2a3b4b").getHex(),
            cssColor("--cad-drafting-grid-minor", "#17212b").getHex(),
        );
        fine.name = "SMArchitectureCadFineGrid";
        fine.material.transparent = true;
        fine.material.opacity = 0.34;
        fine.material.depthWrite = false;
        fine.renderOrder = -20;

        const major = new THREE.GridHelper(
            size,
            200,
            cssColor("--cad-drafting-grid-major", "#2a3b4b").getHex(),
            cssColor("--cad-drafting-grid-major", "#2a3b4b").getHex(),
        );
        major.name = "SMArchitectureCadMajorGrid";
        major.material.transparent = true;
        major.material.opacity = 0.42;
        major.material.depthWrite = false;
        major.renderOrder = -19;

        const half = size / 2;
        const axisGeometry = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(-half, 0, 0), new THREE.Vector3(half, 0, 0),
            new THREE.Vector3(0, 0, -half), new THREE.Vector3(0, 0, half),
        ]);
        const axisMaterial = new THREE.LineBasicMaterial({
            color: cssColor("--cad-drafting-crosshair", "#d7e6f4"),
            transparent: true,
            opacity: 0.52,
            depthWrite: false,
        });
        const axes = new THREE.LineSegments(axisGeometry, axisMaterial);
        axes.name = "SMArchitectureCadAxes";
        axes.renderOrder = -18;

        const group = new THREE.Group();
        group.name = "SMArchitectureCadGrid";
        group.userData = {
            isSystemObject: true,
            ignoreInHierarchy: true,
            selectable: false,
            isViewportGrid: true,
            cadGridEnabled: true,
        };
        group.add(fine, major, axes);
        window.scene.add(group);
        state.cadGrid = group;
        return group;
    }

    function updateCadGridElevation() {
        const grid = ensureCadGrid();
        if (!grid) return;
        grid.position.y = currentStoryElevation() - 0.006;
        grid.userData.cadGridEnabled = state.cadGridEnabled;
        grid.visible = state.cadPlanActive && state.cadGridEnabled;
        grid.traverse?.((child) => { child.visible = grid.visible; });
    }

    function configureCadControls() {
        const controls = window.cameraSystem?.controls || window.controls;
        if (!controls) return;
        if (!state.savedControls) {
            state.savedControls = {
                navigationProfile: window.cameraSystem?.navigationProfile || "default",
                enableRotate: controls.enableRotate,
                enablePan: controls.enablePan,
                enableZoom: controls.enableZoom,
                screenSpacePanning: controls.screenSpacePanning,
                panSpeed: controls.panSpeed,
                zoomSpeed: controls.zoomSpeed,
                mouseButtons: { ...(controls.mouseButtons || {}) },
            };
        }
        window.cameraSystem?.setNavigationProfile?.("modeling");
        controls.enableRotate = false;
        controls.enablePan = true;
        controls.enableZoom = true;
        controls.screenSpacePanning = true;
        controls.panSpeed = 0.92;
        controls.zoomSpeed = 1.05;
        controls.mouseButtons = {
            ...(controls.mouseButtons || {}),
            LEFT: Number.isFinite(THREE.MOUSE.NONE) ? THREE.MOUSE.NONE : -1,
            MIDDLE: THREE.MOUSE.PAN,
            RIGHT: THREE.MOUSE.PAN,
        };
        controls.update?.();
    }

    function restoreControls() {
        const controls = window.cameraSystem?.controls || window.controls;
        const saved = state.savedControls;
        if (!controls || !saved) return;
        window.cameraSystem?.setNavigationProfile?.(saved.navigationProfile || "default");
        controls.enableRotate = saved.enableRotate;
        controls.enablePan = saved.enablePan;
        controls.enableZoom = saved.enableZoom;
        controls.screenSpacePanning = saved.screenSpacePanning;
        controls.panSpeed = saved.panSpeed;
        controls.zoomSpeed = saved.zoomSpeed;
        controls.mouseButtons = { ...saved.mouseButtons };
        controls.update?.();
        state.savedControls = null;
    }

    function zoomCad(factor) {
        const camera = window.cameraSystem?.activeCamera || window.camera;
        if (!camera?.isOrthographicCamera) return;
        camera.zoom = THREE.MathUtils.clamp((Number(camera.zoom) || 1) * factor, 0.05, 500);
        camera.updateProjectionMatrix();
        window.cameraSystem?.controls?.update?.();
        updateCadOverlay();
    }

    function toggleCadGrid(force = null) {
        state.cadGridEnabled = typeof force === "boolean" ? force : !state.cadGridEnabled;
        updateCadGridElevation();
        updateCadOverlay();
        setStatus(`Drafting grid ${state.cadGridEnabled ? "enabled" : "hidden"}.`);
    }

    function handleCadCommand(rawCommand) {
        const command = String(rawCommand || "").trim().toUpperCase().replace(/\s+/g, " ");
        if (!command) return;
        const tools = {
            L: "wall", LINE: "wall", WALL: "wall",
            PL: "cad-polyline", PLINE: "cad-polyline", POLYLINE: "cad-polyline", TRACE: "cad-polyline",
            ROOM: "room", SLAB: "slab", COLUMN: "column", COL: "column",
            BEAM: "beam", DOOR: "door", WINDOW: "window", ROOF: "roof",
            STAIRS: "stairs", RAILING: "railing", OFFSET: "offset", O: "offset",
            ARRAY: "array-linear", MEASURE: "measure", DIST: "measure",
        };
        if (tools[command]) {
            activateTool(tools[command]);
            return;
        }
        if (["PLAN", "TOP", "2D"].includes(command)) setView("top");
        else if (["CLOSE", "FINISH", "FINISH PLAN"].includes(command)) finishPlanDraft();
        else if (["GENERATE 3D", "BUILD 3D", "PLAN TO 3D", "CONVERT 3D"].includes(command)) generatePlanDraft3D();
        else if (["CLEAR PLAN", "CLEAR DRAFT"].includes(command)) clearPlanDraft();
        else if (["3D", "ISO", "ISOMETRIC"].includes(command)) setView("iso");
        else if (["Z", "ZE", "ZOOM EXTENTS", "EXTENTS"].includes(command)) setView("frame");
        else if (["ZOOM IN", "ZI"].includes(command)) zoomCad(1.25);
        else if (["ZOOM OUT", "ZO"].includes(command)) zoomCad(0.8);
        else if (["GRID", "GRID ON"].includes(command)) toggleCadGrid(true);
        else if (command === "GRID OFF") toggleCadGrid(false);
        else if (["ESC", "ESCAPE", "CANCEL"].includes(command)) {
            state.lastUiTool = null;
            system()?.setArchitectureTool?.(null);
            refreshUi();
        } else {
            setStatus(`Unknown command: ${command}. Try PLINE, WALL, FINISH, GENERATE 3D, PLAN, or ZOOM EXTENTS.`, "warning");
        }
    }

    function updateCadOverlay(point = null) {
        const overlay = state.viewportOverlay;
        if (!overlay) return;
        const modeler = system();
        const level = Number(modeler?.settings?.archCurrentStory) || 0;
        const elevation = currentStoryElevation();
        const camera = window.cameraSystem?.activeCamera || window.camera;
        const coordinate = overlay.querySelector("[data-arch-cad-coordinates]");
        const levelLabel = overlay.querySelector("[data-arch-cad-level]");
        const zoomLabel = overlay.querySelector("[data-arch-cad-zoom]");
        const gridLabel = overlay.querySelector("[data-arch-cad-grid-state]");
        if (coordinate && point) coordinate.textContent = `X ${point.x.toFixed(3)}   Y ${point.z.toFixed(3)}   Z ${elevation.toFixed(3)}`;
        if (levelLabel) levelLabel.textContent = `LEVEL ${level + 1}  +${elevation.toFixed(2)} m`;
        if (zoomLabel) zoomLabel.textContent = `ZOOM ${Math.round((Number(camera?.zoom) || 1) * 100)}%`;
        if (gridLabel) {
            gridLabel.textContent = state.cadGridEnabled ? "GRID ON" : "GRID OFF";
            gridLabel.classList.toggle("is-on", state.cadGridEnabled);
        }
        overlay.querySelector("[data-arch-cad-action='toggle-grid']")?.classList.toggle("is-active", state.cadGridEnabled);
    }

    function mountCadOverlay() {
        const host = document.getElementById("renderer-container");
        if (!host) return null;
        let overlay = document.getElementById("sm-architecture-cad-overlay");
        if (!overlay) {
            overlay = document.createElement("div");
            overlay.id = "sm-architecture-cad-overlay";
            overlay.className = "arch-cad-overlay";
            overlay.innerHTML = `
                <div class="arch-cad-toolbar" aria-label="CAD plan navigation">
                    <span class="arch-cad-mode-label"><i class="fa-solid fa-map"></i> PLAN 2D</span>
                    <button type="button" data-arch-cad-action="plan-trace" title="Trace a closed 2D building plan"><i class="fa-solid fa-draw-polygon"></i></button>
                    <button type="button" data-arch-cad-action="finish-plan" title="Close the current plan outline"><i class="fa-solid fa-check"></i></button>
                    <button type="button" data-arch-cad-action="generate-plan" title="Generate walls and slab in 3D"><i class="fa-solid fa-cubes"></i></button>
                    <button type="button" data-arch-cad-action="zoom-in" title="Zoom in"><i class="fa-solid fa-magnifying-glass-plus"></i></button>
                    <button type="button" data-arch-cad-action="zoom-out" title="Zoom out"><i class="fa-solid fa-magnifying-glass-minus"></i></button>
                    <button type="button" data-arch-cad-action="extents" title="Zoom extents"><i class="fa-solid fa-expand"></i></button>
                    <button type="button" data-arch-cad-action="toggle-grid" title="Toggle drafting grid"><i class="fa-solid fa-border-all"></i></button>
                    <span class="arch-cad-level" data-arch-cad-level>LEVEL 1 +0.00 m</span>
                </div>
                <div class="arch-cad-commandbar">
                    <div class="arch-cad-command">
                        <label for="arch-cad-command-input">COMMAND</label>
                        <input id="arch-cad-command-input" type="text" autocomplete="off" spellcheck="false" placeholder="PLINE, WALL, FINISH, GENERATE 3D, PLAN…">
                    </div>
                    <div class="arch-cad-help">Wheel: zoom · Middle/right drag: pan · Left click: draw · Esc: cancel</div>
                </div>
                <div class="arch-cad-statusbar">
                    <span class="arch-cad-coordinates" data-arch-cad-coordinates>X 0.000   Y 0.000   Z 0.000</span>
                    <span class="arch-cad-status-items"><span data-arch-cad-grid-state class="is-on">GRID ON</span><span class="is-on">SNAP</span><span class="is-on">POLAR</span><span data-arch-cad-zoom>ZOOM 100%</span></span>
                </div>`;
            host.appendChild(overlay);
            overlay.addEventListener("pointerdown", (event) => event.stopPropagation());
            overlay.addEventListener("click", (event) => {
                const action = event.target.closest("[data-arch-cad-action]")?.dataset.archCadAction;
                if (action === "zoom-in") zoomCad(1.25);
                else if (action === "zoom-out") zoomCad(0.8);
                else if (action === "extents") setView("frame");
                else if (action === "toggle-grid") toggleCadGrid();
                else if (action === "plan-trace") activateTool("cad-polyline");
                else if (action === "finish-plan") finishPlanDraft();
                else if (action === "generate-plan") generatePlanDraft3D();
            });
            const commandInput = overlay.querySelector("#arch-cad-command-input");
            commandInput?.addEventListener("keydown", (event) => {
                event.stopPropagation();
                if (event.key === "Enter") {
                    event.preventDefault();
                    const command = commandInput.value;
                    commandInput.value = "";
                    handleCadCommand(command);
                } else if (event.key === "Escape") {
                    event.preventDefault();
                    commandInput.value = "";
                    handleCadCommand("CANCEL");
                    commandInput.blur();
                }
            });
        }
        state.viewportOverlay = overlay;
        if (state.pointerTarget !== host) {
            if (state.pointerTarget && state.pointerHandler) state.pointerTarget.removeEventListener("pointermove", state.pointerHandler);
            state.pointerHandler = (event) => {
                if (!state.cadPlanActive || event.target.closest?.(".arch-cad-toolbar, .arch-cad-commandbar")) return;
                const point = system()?.getRectDraftPoint?.(event) || null;
                if (point) updateCadOverlay(point);
            };
            host.addEventListener("pointermove", state.pointerHandler);
            state.pointerTarget = host;
        }
        if (!state.cameraChangeHandler) {
            state.cameraChangeHandler = () => state.cadPlanActive && updateCadOverlay();
            window.addEventListener("sm:camera-changed", state.cameraChangeHandler);
        }
        updateCadOverlay();
        return overlay;
    }

    function applyTopPlanView() {
        const { center, distance } = getViewGeometry();
        center.y = currentStoryElevation();
        const cameraSystem = window.cameraSystem;
        if (cameraSystem?.setAxisView) {
            cameraSystem.setAxisView("y", { orthographic: true, distance, target: center, animate: false });
            const camera = cameraSystem.activeCamera;
            if (camera?.isOrthographicCamera) {
                const frustum = Number(cameraSystem.orthoFrustumSize) || Math.abs(camera.top - camera.bottom) || 20;
                camera.zoom = THREE.MathUtils.clamp(frustum / Math.max(distance, 0.1), 0.05, 500);
                camera.updateProjectionMatrix();
                cameraSystem.controls?.update?.();
            }
        } else {
            window.setCameraView?.("top");
        }
        updateCadGridElevation();
        updateCadOverlay();
    }

    function applyIsometric3DView() {
        const { center, distance } = getViewGeometry();
        const cameraSystem = window.cameraSystem;
        cameraSystem?.unlockAxisView?.({ switchToPerspective: false, preserveView: false });
        cameraSystem?.switchToPerspective?.({ preserveView: false });
        const camera = cameraSystem?.activeCamera || window.camera;
        if (camera) {
            camera.up.set(0, 1, 0);
            camera.position.copy(center.clone().add(new THREE.Vector3(distance * 0.85, distance * 0.62, distance * 0.85)));
            camera.lookAt(center);
            camera.updateProjectionMatrix?.();
            camera.updateMatrixWorld?.(true);
        }
        const controls = cameraSystem?.controls || window.controls;
        if (controls?.target) controls.target.copy(center);
        if (controls) controls.enableRotate = true;
        controls?.update?.();
    }

    function enterCadPlanMode() {
        if (!window.THREE || !window.scene) return false;
        if (!state.cadPlanActive) {
            const clearColor = window.renderer?.getClearColor?.(new THREE.Color())?.clone?.() || new THREE.Color(0x393939);
            state.savedEnvironment = {
                background: window.scene.background,
                fog: window.scene.fog,
                clearColor,
                clearAlpha: window.renderer?.getClearAlpha?.() ?? 1,
            };
            state.cadPlanActive = true;
            document.body.classList.add("arch-cad-plan-mode");
            document.body.dataset.archViewportMode = "plan-2d";
            window.__smArchitecturePlanMode = true;
            const background = cssColor("--cad-drafting-bg", "#080a0d");
            window.__smArchitecturePlanColor = background.getHex();
            window.scene.background = background;
            window.scene.fog = null;
            window.renderer?.setClearColor?.(background, 1);
            configureCadControls();
            mountCadOverlay();
        }
        ensureCadGrid();
        applyTopPlanView();
        setStatus("CAD Plan active. Wheel zooms, middle/right drag pans, left click draws with grid, polar and object snaps.");
        refreshUi();
        return true;
    }

    function exitCadPlanMode({ restore3D = true } = {}) {
        const wasActive = state.cadPlanActive;
        state.cadPlanActive = false;
        document.body.classList.remove("arch-cad-plan-mode");
        document.body.dataset.archViewportMode = "perspective-3d";
        window.__smArchitecturePlanMode = false;
        if (state.cadGrid) {
            state.cadGrid.visible = false;
            state.cadGrid.traverse?.((child) => { child.visible = false; });
        }
        if (wasActive) {
            const saved = state.savedEnvironment;
            if (saved && window.scene) {
                window.scene.background = saved.background;
                window.scene.fog = saved.fog;
                window.renderer?.setClearColor?.(saved.clearColor, saved.clearAlpha);
            }
            state.savedEnvironment = null;
            restoreControls();
        }
        if (restore3D) applyIsometric3DView();
        refreshUi();
    }

    function closeArchitectureStudio() {
        state.lastUiTool = null;
        const modeler = system();
        modeler?.setArchitectureTool?.(null);
        if (modeler?.isEditMode && !modeler.activeMesh) modeler.exitEditMode?.();
        exitCadPlanMode({ restore3D: true });
        window.SecondarySidebar?.close?.("arch");
        syncViewportLayout();
    }

    function installPanelLifecycle() {
        if (!state.panel || state.panelObserver || typeof MutationObserver === "undefined") return;
        state.panelObserver = new MutationObserver(() => {
            const visible = state.panel.classList.contains("active") && !state.panel.hidden && state.panel.style.display !== "none";
            if (visible && !state.cadPlanActive) enterCadPlanMode();
            else if (!visible && state.cadPlanActive) exitCadPlanMode({ restore3D: true });
        });
        state.panelObserver.observe(state.panel, { attributes: true, attributeFilter: ["class", "hidden", "style"] });
    }

    function toolMarkup(tool) {
        const [name, icon, label] = tool;
        return `<button class="arch-tool" type="button" data-arch-tool="${name}" title="${label}">
            <i class="fa-solid ${icon}" aria-hidden="true"></i><span>${label}</span>
        </button>`;
    }

    function sectionMarkup(group) {
        return `<section class="arch-section">
            <div class="arch-section-title"><span>${group.title}</span><span>${group.hint}</span></div>
            <div class="arch-section-content"><div class="arch-tool-grid">${group.tools.map(toolMarkup).join("")}</div></div>
        </section>`;
    }

    function panelMarkup() {
        return `
            <div class="arch-suite-header">
                <div class="arch-suite-brand">
                    <div class="arch-suite-mark"><i class="fa-solid fa-compass-drafting"></i></div>
                    <div><span class="arch-suite-title">Architecture Studio</span><span class="arch-suite-subtitle">BIM concept tools · SM Engine</span></div>
                </div>
                <button class="arch-suite-close" type="button" data-arch-action="close" title="Close Architecture Studio"><i class="fa-solid fa-xmark"></i></button>
            </div>
            <div class="arch-suite-tabs" role="tablist">
                <button class="arch-suite-tab is-active" type="button" data-arch-tab="build">Build</button>
                <button class="arch-suite-tab" type="button" data-arch-tab="blueprint">Blueprint</button>
                <button class="arch-suite-tab" type="button" data-arch-tab="data">Data</button>
            </div>
            <div class="arch-suite-body">
                <div class="arch-suite-pane is-active" data-arch-pane="build">
                    <div class="arch-project-card">
                        <div class="arch-project-kicker">Active concept</div>
                        <div class="arch-project-name">New Architecture Project</div>
                        <div class="arch-project-meta"><span data-arch-project-summary>0 elements · Level 1 · meters</span></div>
                        <div class="arch-view-actions">
                            <button class="arch-btn" type="button" data-arch-view="top"><i class="fa-solid fa-map"></i> Plan</button>
                            <button class="arch-btn" type="button" data-arch-view="iso" title="Open the generated 3D building model"><i class="fa-solid fa-cube"></i> 3D Model</button>
                            <button class="arch-btn" type="button" data-arch-view="frame"><i class="fa-solid fa-expand"></i> Frame</button>
                        </div>
                    </div>
                    <section class="arch-section">
                        <div class="arch-section-title"><span>CAD Plan → 3D</span><span>trace then build</span></div>
                        <div class="arch-section-content">
                            <div class="arch-note">Use <strong>Plan trace</strong> to click every footprint corner on the dark 2D grid. Close it, then generate coordinated 3D perimeter walls and a slab.</div>
                            <div class="arch-project-actions" style="margin-top:8px;">
                                <button class="arch-btn is-blue" type="button" data-arch-action="start-plan-draft"><i class="fa-solid fa-draw-polygon"></i> Plan trace</button>
                                <button class="arch-btn" type="button" data-arch-action="finish-plan-draft"><i class="fa-solid fa-check"></i> Finish plan</button>
                            </div>
                            <div class="arch-project-actions" style="margin-top:6px;">
                                <button class="arch-btn is-primary" type="button" data-arch-action="generate-plan-3d"><i class="fa-solid fa-cubes"></i> Generate 3D</button>
                                <button class="arch-btn" type="button" data-arch-action="clear-plan-draft">Clear plan</button>
                            </div>
                        </div>
                    </section>
                    ${TOOL_GROUPS.map(sectionMarkup).join("")}
                    <section class="arch-section">
                        <div class="arch-section-title"><span>Element Parameters</span><span>meters</span></div>
                        <div class="arch-section-content">
                            <div class="arch-form-grid">
                                <div class="arch-field"><label>Height <span>H</span></label><input id="arch-suite-height" data-arch-setting="archHeight" type="number" value="2.80" min="0.10" step="0.10"></div>
                                <div class="arch-field"><label>Thickness <span>T</span></label><input id="arch-suite-thickness" data-arch-setting="archThickness" type="number" value="0.20" min="0.03" step="0.05"></div>
                                <div class="arch-field"><label>Width <span>W</span></label><input id="arch-suite-width" data-arch-setting="archWidth" type="number" value="1.20" min="0.10" step="0.10"></div>
                                <div class="arch-field"><label>Depth / rise <span>D</span></label><input id="arch-suite-depth" data-arch-setting="archDepth" type="number" value="1.20" min="0.10" step="0.10"></div>
                                <div class="arch-field"><label>Segments / steps</label><input id="arch-suite-segments" data-arch-setting="archSegments" type="number" value="12" min="2" step="1"></div>
                                <div class="arch-field"><label>Material</label><select id="arch-suite-material"><option value="concrete">Concrete</option><option value="masonry">Masonry</option><option value="steel">Steel</option><option value="timber">Timber</option><option value="glass">Glass</option></select></div>
                            </div>
                        </div>
                    </section>
                    <section class="arch-section">
                        <div class="arch-section-title"><span>Stories</span><span data-arch-elevation>+0.00 m</span></div>
                        <div class="arch-section-content">
                            <div class="arch-story-row">
                                <button class="arch-story-btn" type="button" data-arch-action="story-down" title="Previous story"><i class="fa-solid fa-chevron-down"></i></button>
                                <div class="arch-story-display" data-arch-story>Level 1</div>
                                <button class="arch-story-btn" type="button" data-arch-action="story-up" title="Next story"><i class="fa-solid fa-chevron-up"></i></button>
                            </div>
                            <div class="arch-form-grid" style="margin-top:8px;">
                                <div class="arch-field"><label>Floor-to-floor</label><input data-arch-setting="archStoryHeight" type="number" value="3.20" min="1" step="0.10"></div>
                                <div class="arch-field"><label>Visibility</label><select id="arch-suite-story-visibility"><option value="all">All stories</option><option value="active">Active only</option><option value="ghost">Ghost others</option></select></div>
                            </div>
                            <div class="arch-project-actions">
                                <button class="arch-btn is-blue" type="button" data-arch-action="duplicate-story"><i class="fa-solid fa-copy"></i> Duplicate level</button>
                                <button class="arch-btn" type="button" data-arch-action="cancel-tool">Cancel tool</button>
                            </div>
                        </div>
                    </section>
                    <section class="arch-section">
                        <div class="arch-section-title"><span>CAD Precision</span><span>snap & constraints</span></div>
                        <div class="arch-section-content">
                            <div class="arch-form-grid">
                                <div class="arch-field"><label>Grid step</label><input id="arch-suite-snap" type="number" value="0.25" min="0.01" step="0.01"></div>
                                <div class="arch-field"><label>Polar angle</label><input id="arch-suite-angle" type="number" value="15" min="1" max="90" step="1"></div>
                            </div>
                            <div class="arch-toggle-grid">
                                <button class="arch-toggle is-active" type="button" data-arch-constraint="enabled">Snap</button>
                                <button class="arch-toggle" type="button" data-arch-constraint="ortho">Ortho</button>
                                <button class="arch-toggle is-active" type="button" data-arch-constraint="polar">Polar</button>
                                <button class="arch-toggle is-active" type="button" data-arch-constraint="objectSnap">Osnap</button>
                            </div>
                        </div>
                    </section>
                    <div class="arch-status"><span class="arch-status-dot"></span><span data-arch-status>Ready. Choose a tool, then click in the viewport.</span></div>
                </div>

                <div class="arch-suite-pane" data-arch-pane="blueprint">
                    <div class="arch-blueprint-preview">
                        <img src="${REFERENCE_BLUEPRINT}" alt="Atrium floor plan reference">
                        <span class="arch-blueprint-badge">Reference: Ground-floor atrium</span>
                    </div>
                    <section class="arch-section" style="margin-top:9px;">
                        <div class="arch-section-title"><span>Blueprint Underlay</span><span>PNG / JPG</span></div>
                        <div class="arch-section-content">
                            <label class="arch-dropzone" for="arch-suite-file"><span><i class="fa-solid fa-cloud-arrow-up"></i><span data-arch-file-label>Choose a floor-plan image</span></span><input id="arch-suite-file" type="file" accept="image/png,image/jpeg,image/webp"></label>
                            <div class="arch-form-grid" style="margin-top:8px;">
                                <div class="arch-field"><label>Known width (m)</label><input id="arch-suite-blueprint-width" type="number" value="32" min="1" step="0.1"></div>
                                <div class="arch-field"><label>Opacity <span data-arch-opacity-label>45%</span></label><input id="arch-suite-blueprint-opacity" type="range" min="5" max="90" value="45"></div>
                            </div>
                            <div class="arch-project-actions">
                                <button class="arch-btn is-blue" type="button" data-arch-action="add-underlay"><i class="fa-solid fa-layer-group"></i> Place underlay</button>
                                <button class="arch-btn" type="button" data-arch-action="toggle-underlay">Hide / show</button>
                            </div>
                        </div>
                    </section>
                    <section class="arch-section">
                        <div class="arch-section-title"><span>AI Plan → 3D</span><span>automatic building</span></div>
                        <div class="arch-section-content">
                            <div class="arch-note">
                                Upload a real floor-plan image above, then let Architecture Vision detect walls,
                                rooms, doors, windows and dimensions. The result is validated as
                                <strong>SM_BUILDING_MAP</strong> before procedural mesh generation.
                            </div>

                            <div class="arch-form-grid" style="margin-top:8px;">
                                <div class="arch-field">
                                    <label>Default wall height</label>
                                    <input id="arch-suite-ai-wall-height" type="number" value="3.20" min="1" step="0.10">
                                </div>
                                <div class="arch-field">
                                    <label>Default thickness</label>
                                    <input id="arch-suite-ai-wall-thickness" type="number" value="0.22" min="0.05" step="0.01">
                                </div>
                            </div>

                            <div class="arch-project-actions" style="margin-top:8px;">
                                <button class="arch-btn is-primary" type="button" data-arch-action="ai-analyze-generate">
                                    <i class="fa-solid fa-wand-magic-sparkles"></i> Analyze & Generate 3D
                                </button>
                                <button class="arch-btn" type="button" data-arch-action="ai-generate-again">
                                    <i class="fa-solid fa-cubes"></i> Generate again
                                </button>
                            </div>

                            <div class="arch-project-actions" style="margin-top:6px;">
                                <button class="arch-btn" type="button" data-arch-action="ai-export-map">
                                    <i class="fa-solid fa-file-code"></i> Export SM map
                                </button>
                                <button class="arch-btn is-danger" type="button" data-arch-action="ai-remove-building">
                                    <i class="fa-solid fa-trash"></i> Remove AI model
                                </button>
                            </div>

                            <div class="arch-progress" style="margin-top:9px;">
                                <span data-arch-ai-progress style="width:0%"></span>
                            </div>
                            <div class="arch-note" data-arch-ai-status style="margin-top:7px;">
                                Waiting for a floor-plan image.
                            </div>
                        </div>
                    </section>

                    <section class="arch-section">
                        <div class="arch-section-title"><span>Reference-to-3D</span><span>starter model</span></div>
                        <div class="arch-section-content">
                            <div class="arch-note">The preset interprets the attached plan as a 32 × 18 m public atrium with perimeter rooms, hosted openings, columns, beams, a skylight, café furniture, garden pods, and entrance circulation.</div>
                            <button class="arch-btn is-primary" style="width:100%;margin-top:8px;" type="button" data-arch-action="generate-sample"><i class="fa-solid fa-wand-magic-sparkles"></i> Build reference in 3D</button>
                            <div class="arch-progress"><span data-arch-progress></span></div>
                            <div class="arch-project-actions">
                                <button class="arch-btn" type="button" data-arch-action="add-reference-underlay">Add reference plan</button>
                                <button class="arch-btn is-danger" type="button" data-arch-action="clear-sample">Remove preset</button>
                            </div>
                        </div>
                    </section>
                    <section class="arch-section">
                        <div class="arch-section-title"><span>Recommended Workflow</span><span>4 steps</span></div>
                        <div class="arch-section-content arch-validation-list">
                            <div class="arch-check"><i class="fa-solid fa-1"></i><span>Place and scale the underlay from one known dimension.</span></div>
                            <div class="arch-check"><i class="fa-solid fa-2"></i><span>Trace exterior and interior walls with Snap + Ortho.</span></div>
                            <div class="arch-check"><i class="fa-solid fa-3"></i><span>Host doors/windows, then add slabs, columns, beams and stairs.</span></div>
                            <div class="arch-check"><i class="fa-solid fa-4"></i><span>Review stories and export the concept model and element schedule.</span></div>
                        </div>
                    </section>
                </div>

                <div class="arch-suite-pane" data-arch-pane="data">
                    <section class="arch-section">
                        <div class="arch-section-title"><span>Model Dashboard</span><span data-arch-data-time>live</span></div>
                        <div class="arch-section-content"><div class="arch-stat-grid" data-arch-stats></div></div>
                    </section>
                    <section class="arch-section">
                        <div class="arch-section-title"><span>Concept Checks</span><span>advisory</span></div>
                        <div class="arch-section-content">
                            <div class="arch-validation-list" data-arch-validation></div>
                            <button class="arch-btn is-blue" style="width:100%;margin-top:8px;" type="button" data-arch-action="validate"><i class="fa-solid fa-list-check"></i> Run model checks</button>
                        </div>
                    </section>
                    <section class="arch-section">
                        <div class="arch-section-title"><span>Element Schedule</span><span>live quantities</span></div>
                        <div class="arch-section-content" style="overflow:auto;"><table class="arch-schedule"><thead><tr><th>Category</th><th>Qty.</th></tr></thead><tbody data-arch-schedule></tbody></table></div>
                    </section>
                    <section class="arch-section">
                        <div class="arch-section-title"><span>Exchange</span><span>project deliverables</span></div>
                        <div class="arch-section-content">
                            <div class="arch-export-actions">
                                <button class="arch-btn" type="button" data-arch-action="export-json"><i class="fa-solid fa-code"></i> Project JSON</button>
                                <button class="arch-btn" type="button" data-arch-action="import-json"><i class="fa-solid fa-file-import"></i> Import JSON</button>
                                <button class="arch-btn" type="button" data-arch-action="export-gltf"><i class="fa-solid fa-cubes"></i> glTF model</button>
                                <button class="arch-btn" type="button" data-arch-action="export-schedule"><i class="fa-solid fa-table-list"></i> Schedule CSV</button>
                            </div>
                            <input id="arch-suite-import" type="file" accept="application/json,.json" hidden>
                        </div>
                    </section>
                    <div class="arch-note">Concept checks and quantities support early design coordination only. A licensed structural engineer must verify loads, member sizes, soil, connections, fire safety, and local building-code compliance.</div>
                </div>
            </div>`;
    }

    function setStatus(message, tone) {
        const status = state.panel?.querySelector("[data-arch-status]");
        const dot = state.panel?.querySelector(".arch-status-dot");
        if (status) status.textContent = message;
        if (dot) {
            dot.style.background = tone === "warning"
                ? "var(--accent-warning)"
                : tone === "error"
                    ? "var(--accent-danger)"
                    : "var(--accent-success)";
        }
    }

    function syncViewportLayout() {
        const sync = () => {
            window.dispatchEvent(new Event("resize"));
            window.dispatchEvent(new Event("sm:layout-resized"));
            window.dispatchEvent(new Event("sm:sync-layout"));
        };
        window.requestAnimationFrame(sync);
        window.setTimeout(sync, 160);
    }

    function switchTab(tabName) {
        state.activeTab = tabName;
        state.panel?.querySelectorAll("[data-arch-tab]").forEach((button) => button.classList.toggle("is-active", button.dataset.archTab === tabName));
        state.panel?.querySelectorAll("[data-arch-pane]").forEach((pane) => pane.classList.toggle("is-active", pane.dataset.archPane === tabName));
        if (tabName === "data") refreshData();
    }

    function syncSettings() {
        const modeler = system();
        if (!modeler) return;
        state.panel.querySelectorAll("[data-arch-setting]").forEach((input) => {
            const key = input.dataset.archSetting;
            modeler.settings[key] = key === "archSegments"
                ? Math.max(2, Math.round(finite(input.value, modeler.settings[key])))
                : Math.max(0.01, finite(input.value, modeler.settings[key]));
        });
        state.constraints.snapStep = Math.max(0.01, finite(state.panel.querySelector("#arch-suite-snap")?.value, 0.25));
        state.constraints.angleStep = Math.max(1, finite(state.panel.querySelector("#arch-suite-angle")?.value, 15));
    }

    function activateTool(toolName) {
        const modeler = system();
        if (!modeler) {
            setStatus("The modeling system is still starting. Try again in a moment.", "warning");
            return;
        }
        enterCadPlanMode();
        syncSettings();
        let engineTool = toolName;
        if (toolName === "foundation") {
            engineTool = "slab";
            modeler.settings.archThickness = Math.max(modeler.settings.archThickness, 0.4);
            const thicknessInput = state.panel.querySelector("#arch-suite-thickness");
            if (thicknessInput) thicknessInput.value = modeler.settings.archThickness.toFixed(2);
        }
        state.lastUiTool = toolName;
        modeler.setArchitectureTool(engineTool);
        if (toolName === "foundation") modeler.architectureMessage = "Foundation pad: click the first corner, then the opposite corner.";
        refreshUi();
    }

    function finishPlanDraft() {
        const modeler = system();
        if (!modeler?.finishArchitecturePlanDraft) {
            setStatus("The CAD plan tool is still initializing.", "warning");
            return false;
        }
        const finished = modeler.finishArchitecturePlanDraft();
        refreshUi();
        if (finished) setStatus(modeler.architectureMessage);
        else setStatus(modeler.architectureMessage || "Plan needs at least three corners.", "warning");
        return finished;
    }

    function clearPlanDraft() {
        const modeler = system();
        modeler?.clearArchitecturePlanDraft?.();
        state.lastUiTool = "cad-polyline";
        activateTool("cad-polyline");
        setStatus("2D plan cleared. Click the first corner to start a new footprint.");
    }

    function generatePlanDraft3D() {
        const modeler = system();
        if (!modeler?.convertArchitecturePlanTo3D) {
            setStatus("The plan-to-3D converter is still initializing.", "warning");
            return;
        }
        syncSettings();
        const result = modeler.convertArchitecturePlanTo3D();
        refreshUi();
        if (!result?.created) {
            setStatus(modeler.architectureMessage || "Draw and close a plan before generating 3D.", "warning");
            return;
        }
        setView("iso");
        setStatus(`${modeler.architectureMessage} Switched to the generated 3D model.`);
    }

    function installBridges() {
        window.ArchitectCadWorkbench = {
            getConstraintContext() {
                return { ...state.constraints };
            },
        };
        window.ArchitectPrecisionBridge = {
            snapValue(value, step) {
                if (!state.constraints.enabled) return Number(value) || 0;
                const safeStep = Math.max(0.001, finite(step, state.constraints.snapStep));
                return Math.round((Number(value) || 0) / safeStep) * safeStep;
            },
            formatDistance(meters, precision) {
                const value = Number(meters) || 0;
                if (state.units === "mm") return `${(value * 1000).toFixed(0)} mm`;
                if (state.units === "cm") return `${(value * 100).toFixed(1)} cm`;
                if (state.units === "ft") return `${(value * 3.28084).toFixed(2)} ft`;
                return `${value.toFixed(Number.isFinite(precision) ? precision : 2)} m`;
            },
        };

        const modeler = system();
        if (!modeler || modeler._smArchitectureSuiteWrapped) return;
        const originalAdd = modeler.addArchitectureElement.bind(modeler);
        modeler.addArchitectureElement = function (object, type) {
            if (object) {
                object.userData = object.userData || {};
                if (!Number.isFinite(object.userData.story)) object.userData.story = Number(this.settings.archCurrentStory) || 0;
                object.userData.materialClass = state.panel?.querySelector("#arch-suite-material")?.value || object.userData.materialClass || "concrete";
                object.traverse?.((node) => {
                    if (node.isMesh) {
                        node.castShadow = true;
                        node.receiveShadow = true;
                    }
                });
            }
            const result = originalAdd(object, type);
            window.dispatchEvent(new CustomEvent("sm:architecture-changed", { detail: { object, type } }));
            return result;
        };
        modeler._smArchitectureSuiteWrapped = true;
    }

    function handleConstraint(button) {
        const key = button.dataset.archConstraint;
        state.constraints[key] = !state.constraints[key];
        if (key === "ortho" && state.constraints.ortho) state.constraints.polar = false;
        if (key === "polar" && state.constraints.polar) state.constraints.ortho = false;
        state.panel.querySelectorAll("[data-arch-constraint]").forEach((item) => {
            const active = !!state.constraints[item.dataset.archConstraint];
            item.classList.toggle("is-active", active);
            item.setAttribute("aria-pressed", String(active));
        });
        setStatus(`CAD constraints updated: ${state.constraints.ortho ? "Ortho" : state.constraints.polar ? `Polar ${state.constraints.angleStep}°` : "free angle"}, ${state.constraints.objectSnap ? "object snap on" : "object snap off"}.`);
    }

    function bindPanel() {
        state.panel.addEventListener("click", (event) => {
            const tab = event.target.closest("[data-arch-tab]");
            if (tab) {
                switchTab(tab.dataset.archTab);
                return;
            }
            const tool = event.target.closest("[data-arch-tool]");
            if (tool) {
                activateTool(tool.dataset.archTool);
                return;
            }
            const constraint = event.target.closest("[data-arch-constraint]");
            if (constraint) {
                handleConstraint(constraint);
                return;
            }
            const view = event.target.closest("[data-arch-view]");
            if (view) {
                setView(view.dataset.archView);
                return;
            }
            const action = event.target.closest("[data-arch-action]")?.dataset.archAction;
            if (!action) return;
            const actions = {
                close: closeArchitectureStudio,
                "cancel-tool": () => { state.lastUiTool = null; system()?.setArchitectureTool?.(null); refreshUi(); },
                "start-plan-draft": () => activateTool("cad-polyline"),
                "finish-plan-draft": finishPlanDraft,
                "generate-plan-3d": generatePlanDraft3D,
                "clear-plan-draft": clearPlanDraft,
                "story-down": () => stepStory(-1),
                "story-up": () => stepStory(1),
                "duplicate-story": duplicateStory,
                "add-underlay": addUploadedUnderlay,
                "add-reference-underlay": addReferenceUnderlay,
                "toggle-underlay": toggleUnderlays,

                // Architecture Vision → deterministic SM building map → 3D.
                "ai-analyze-generate": () => generateArchitectureAIMap3D(true),
                "ai-generate-again": () => generateArchitectureAIMap3D(false),
                "ai-export-map": exportArchitectureAIMap,
                "ai-remove-building": () => removeAIGeneratedBuilding(false),

                "generate-sample": generateReferenceBuilding,
                "clear-sample": clearReferenceBuilding,
                validate: () => refreshValidation(true),
                "export-json": exportProjectJson,
                "import-json": () => state.panel.querySelector("#arch-suite-import")?.click(),
                "export-gltf": exportGltf,
                "export-schedule": exportSchedule,
            };
            actions[action]?.();
        });

        state.panel.addEventListener("input", (event) => {
            if (event.target.matches("[data-arch-setting], #arch-suite-snap, #arch-suite-angle")) syncSettings();
            if (event.target.id === "arch-suite-blueprint-opacity") {
                const value = finite(event.target.value, 45);
                const label = state.panel.querySelector("[data-arch-opacity-label]");
                if (label) label.textContent = `${Math.round(value)}%`;
                underlays().forEach((mesh) => { if (mesh.material) mesh.material.opacity = value / 100; });
            }
        });

        state.panel.querySelector("#arch-suite-story-visibility")?.addEventListener("change", applyStoryVisibility);
        state.panel.querySelector("#arch-suite-file")?.addEventListener("change", loadUnderlayFile);
        state.panel.querySelector("#arch-suite-import")?.addEventListener("change", importProjectJson);
    }

    function stepStory(delta) {
        syncSettings();
        const level = system()?.stepStory?.(delta);
        applyStoryVisibility();
        if (state.cadPlanActive) applyTopPlanView();
        refreshUi();
        if (Number.isFinite(level)) setStatus(`Level ${level + 1} is active. New elements will be placed at this elevation.`);
    }

    function architectureElements() {
        return (Array.isArray(window.architecturalElements) ? window.architecturalElements : []).filter((object) => object && object.parent);
    }

    function underlays() {
        return architectureElements().filter((object) => object.userData?.archType === "blueprint-underlay");
    }

    function applyStoryVisibility() {
        const mode = state.panel.querySelector("#arch-suite-story-visibility")?.value || "all";
        const current = Number(system()?.settings?.archCurrentStory) || 0;
        architectureElements().forEach((object) => {
            if (object.userData?.archType === "blueprint-underlay") return;
            const isCurrent = (Number(object.userData?.story) || 0) === current;
            object.visible = mode === "all" || isCurrent || mode === "ghost";
            object.traverse?.((node) => {
                if (!node.isMesh || !node.material) return;
                const materials = Array.isArray(node.material) ? node.material : [node.material];
                materials.forEach((material) => {
                    if (!material) return;
                    if (mode === "ghost" && !isCurrent) {
                        material.userData = material.userData || {};
                        if (!Number.isFinite(material.userData.archOriginalOpacity)) material.userData.archOriginalOpacity = material.opacity;
                        material.transparent = true;
                        material.opacity = 0.16;
                    } else if (Number.isFinite(material.userData?.archOriginalOpacity)) {
                        material.opacity = material.userData.archOriginalOpacity;
                        material.transparent = material.opacity < 1;
                    }
                });
            });
        });
    }

    function duplicateStory() {
        const modeler = system();
        if (!modeler) return;
        const current = Number(modeler.settings.archCurrentStory) || 0;
        const source = architectureElements().filter((object) => (Number(object.userData?.story) || 0) === current && !["measure", "blueprint-underlay", "annotation"].includes(object.userData?.archType));
        if (!source.length) {
            setStatus("There are no elements on the active level to duplicate.", "warning");
            return;
        }
        const height = Math.max(0.1, Number(modeler.settings.archStoryHeight) || 3.2);
        modeler.settings.archCurrentStory = current + 1;
        let created = 0;
        source.forEach((object) => {
            const clone = modeler.duplicateArchitectureElement?.(object, new THREE.Vector3(0, height, 0));
            if (clone) {
                clone.userData.story = current + 1;
                if (clone.userData.wallData) {
                    clone.userData.wallData.story = current + 1;
                    clone.userData.wallData.baseY = (Number(clone.userData.wallData.baseY) || 0);
                }
                created += 1;
            }
        });
        refreshUi();
        setStatus(`Level ${current + 1} duplicated to Level ${current + 2}: ${created} elements created.`);
    }

    function setView(mode) {
        const { elements } = getViewGeometry();

        if (mode === "top") {
            enterCadPlanMode();
            return;
        }
        if (mode === "iso") {
            exitCadPlanMode({ restore3D: true });
            setStatus("3D isometric view active.");
            return;
        }
        if (mode === "frame") {
            const cameraSystem = window.cameraSystem;
            if (cameraSystem?.frameObjects && elements.length) cameraSystem.frameObjects(elements, { animate: true });
            else if (elements[0]) {
                window.selectedObject = elements[0];
                window.frameSelectedObject?.();
            }
            setStatus("Architecture model framed in the viewport.");
        }
    }

    function loadUnderlayFile(event) {
        const file = event.target.files?.[0];
        if (!file) return;

        state.pendingUnderlayFile = file;
        state.aiPlanMap = null;

        const aiStatus = state.panel?.querySelector("[data-arch-ai-status]");
        const aiProgress = state.panel?.querySelector("[data-arch-ai-progress]");
        if (aiProgress) aiProgress.style.width = "0%";
        if (aiStatus) {
            aiStatus.textContent = `${file.name} is ready for Architecture Vision.`;
        }

        const reader = new FileReader();
        reader.onload = () => {
            const source = String(reader.result || "");
            state.pendingUnderlay = source;

            const image = new Image();
            image.onload = () => {
                state.underlayAspect =
                    image.naturalWidth /
                    Math.max(1, image.naturalHeight);

                const label =
                    state.panel.querySelector(
                        "[data-arch-file-label]"
                    );

                if (label) {
                    label.textContent =
                        `${file.name} · ` +
                        `${image.naturalWidth} × ${image.naturalHeight}`;
                }

                const preview =
                    state.panel.querySelector(
                        ".arch-blueprint-preview img"
                    );

                if (preview) {
                    preview.src = source;
                    preview.alt = file.name;
                }

                const badge =
                    state.panel.querySelector(
                        ".arch-blueprint-badge"
                    );

                if (badge) {
                    badge.textContent =
                        `Uploaded plan: ${file.name}`;
                }

                setStatus(
                    "Blueprint loaded. You can place it as an underlay or use Analyze & Generate 3D."
                );
            };

            image.onerror = () => {
                const label =
                    state.panel.querySelector(
                        "[data-arch-file-label]"
                    );

                if (label) {
                    label.textContent = file.name;
                }

                setStatus(
                    "Plan file loaded. Architecture Vision can analyze it.",
                    "warning"
                );
            };

            image.src = source;
        };

        reader.onerror = () => {
            setStatus(
                "The blueprint file could not be read.",
                "error"
            );
        };

        reader.readAsDataURL(file);
    }


    function setArchitectureAIProgress(
        value,
        message = null,
        tone = null
    ) {
        const progress =
            state.panel?.querySelector(
                "[data-arch-ai-progress]"
            );

        const status =
            state.panel?.querySelector(
                "[data-arch-ai-status]"
            );

        const safe =
            THREE?.MathUtils?.clamp
                ? THREE.MathUtils.clamp(
                    Number(value) || 0,
                    0,
                    100
                )
                : Math.max(
                    0,
                    Math.min(
                        100,
                        Number(value) || 0
                    )
                );

        if (progress) {
            progress.style.width = `${safe}%`;
        }

        if (status && message != null) {
            status.textContent = String(message);
            status.dataset.tone =
                tone ||
                (
                    safe >= 100
                        ? "success"
                        : "working"
                );
        }
    }


    function getArchitectureAIDefaults() {
        const modeler = system();

        return {
            knownWidthMeters:
                Math.max(
                    0.1,
                    finite(
                        state.panel?.querySelector(
                            "#arch-suite-blueprint-width"
                        )?.value,
                        32
                    )
                ),

            wallHeight:
                Math.max(
                    1,
                    finite(
                        state.panel?.querySelector(
                            "#arch-suite-ai-wall-height"
                        )?.value,
                        modeler?.settings
                            ?.archHeight ||
                        3.2
                    )
                ),

            wallThickness:
                Math.max(
                    0.05,
                    finite(
                        state.panel?.querySelector(
                            "#arch-suite-ai-wall-thickness"
                        )?.value,
                        modeler?.settings
                            ?.archThickness ||
                        0.22
                    )
                ),

            floorHeight:
                Math.max(
                    1,
                    finite(
                        modeler?.settings
                            ?.archStoryHeight,
                        3.2
                    )
                )
        };
    }


    async function analyzeArchitecturePlanWithAI() {
        if (state.aiBusy) {
            setStatus(
                "Architecture Vision is already processing a plan.",
                "warning"
            );
            return null;
        }

        if (!state.pendingUnderlayFile) {
            setStatus(
                "Choose a floor-plan image first.",
                "warning"
            );

            switchTab("blueprint");
            state.panel
                ?.querySelector(
                    "#arch-suite-file"
                )
                ?.click();

            return null;
        }

        if (!window.smPlanVisionBridge) {
            setStatus(
                "SMPlanVisionBridge is not loaded. Load engine/architecture/importers/SMPlanVisionBridge.js first.",
                "error"
            );

            setArchitectureAIProgress(
                0,
                "Architecture Vision bridge is missing.",
                "error"
            );

            return null;
        }

        // Try to bind the engine's existing AI service when the optional
        // architecture adapter is present.
        try {
            window
                .smArchitectureVisionAdapter
                ?.install?.();
        } catch (_) {}

        if (
            typeof window.smPlanVisionBridge
                .analyze !==
            "function"
        ) {
            setStatus(
                "Architecture Vision is not connected to the engine AI service yet.",
                "warning"
            );

            setArchitectureAIProgress(
                0,
                "AI adapter not connected. Configure smArchitectureVisionAdapter or smPlanVisionBridge.setAnalyzer(...).",
                "error"
            );

            return null;
        }

        state.aiBusy = true;

        const defaults =
            getArchitectureAIDefaults();

        try {
            setArchitectureAIProgress(
                8,
                "Reading floor plan…"
            );

            setStatus(
                "Architecture Vision is analyzing the uploaded floor plan…"
            );

            setArchitectureAIProgress(
                22,
                "Detecting plan geometry and semantics…"
            );

            const result =
                await window
                    .smPlanVisionBridge
                    .convert(
                        state.pendingUnderlayFile,
                        {
                            defaults,

                            knownWidthMeters:
                                defaults
                                    .knownWidthMeters,

                            architectureMode:
                                "existing-sm-architecture-studio"
                        }
                    );

            const map =
                result?.map ||
                result;

            if (!map) {
                throw new Error(
                    "Architecture Vision returned no building map."
                );
            }

            setArchitectureAIProgress(
                66,
                "Validating SM building map…"
            );

            const validation =
                window.SMBuildingSchema
                    ?.validate?.(
                        map
                    ) ||
                {
                    valid: true,
                    errors: [],
                    warnings: []
                };

            if (!validation.valid) {
                throw new Error(
                    `Building map validation failed: ${
                        validation.errors
                            ?.join("; ") ||
                        "unknown schema error"
                    }`
                );
            }

            state.aiPlanMap = map;

            const floorCount =
                map.floors?.length ||
                0;

            const graph =
                window.SMBuildingGraph
                    ? new window
                        .SMBuildingGraph(
                            map
                        )
                    : null;

            const stats =
                graph?.getStats?.() ||
                {};

            setArchitectureAIProgress(
                78,
                `Plan understood: ${floorCount} floor(s), ${stats.walls || 0} walls, ${stats.rooms || 0} rooms, ${stats.openings || 0} openings.`
            );

            return map;
        } catch (error) {
            console.error(
                "[SM Architecture Vision]",
                error
            );

            setArchitectureAIProgress(
                0,
                error?.message ||
                    String(error),
                "error"
            );

            setStatus(
                `Architecture Vision failed: ${
                    error?.message ||
                    String(error)
                }`,
                "error"
            );

            return null;
        } finally {
            state.aiBusy = false;
        }
    }


    function removeAIGeneratedBuilding(
        silent = false
    ) {
        const root =
            state.aiGeneratedRoot;

        if (!root) {
            if (!silent) {
                setStatus(
                    "No AI-generated architecture model is active.",
                    "warning"
                );
            }
            return false;
        }

        try {
            root.parent?.remove?.(
                root
            );

            disposeObject(
                root
            );
        } catch (error) {
            console.warn(
                "[SM Architecture] AI model cleanup:",
                error
            );
        }

        window.architecturalElements =
            (
                window.architecturalElements ||
                []
            ).filter(
                object =>
                    object !== root
            );

        state.aiGeneratedRoot =
            null;

        if (!silent) {
            setArchitectureAIProgress(
                state.aiPlanMap
                    ? 78
                    : 0,
                state.aiPlanMap
                    ? "AI map preserved. Generate again when ready."
                    : "Waiting for a floor-plan image."
            );

            setStatus(
                "AI-generated building removed."
            );
        }

        refreshUi();
        return true;
    }


    async function generateArchitectureAIMap3D(
        analyzeFirst = false
    ) {
        let map =
            state.aiPlanMap;

        if (
            analyzeFirst ||
            !map
        ) {
            map =
                await analyzeArchitecturePlanWithAI();
        }

        if (!map) {
            return null;
        }

        if (
            typeof window.SMBuildingGenerator !==
                "function"
        ) {
            setStatus(
                "SMBuildingGenerator is not loaded.",
                "error"
            );

            setArchitectureAIProgress(
                0,
                "Procedural building generator is missing.",
                "error"
            );

            return null;
        }

        try {
            state.aiBusy = true;

            setArchitectureAIProgress(
                84,
                "Generating procedural 3D building…"
            );

            removeAIGeneratedBuilding(
                true
            );

            const generator =
                window.smBuildingGenerator ||
                new window
                    .SMBuildingGenerator();

            window.smBuildingGenerator =
                generator;

            const root =
                generator.generate(
                    map,
                    {
                        generateWalls:
                            true,
                        generateFloors:
                            true,
                        generateRooms:
                            true,
                        generateDoors:
                            true,
                        generateWindows:
                            true,
                        generateColumns:
                            true,
                        generateStairs:
                            true,
                        generateRoof:
                            true,
                        optimize:
                            false,
                        markStatic:
                            false
                    }
                );

            root.name =
                map.building?.name ||
                "AI_Architecture_Building";

            root.userData =
                root.userData ||
                {};

            Object.assign(
                root.userData,
                {
                    archType:
                        "ai-generated-building",

                    architectureSource:
                        "vision",

                    sourcePlanName:
                        state
                            .pendingUnderlayFile
                            ?.name ||
                        null,

                    smArchitectureAI:
                        true,

                    story:
                        0
                }
            );

            const modeler =
                system();

            if (
                typeof modeler
                    ?.addArchitectureElement ===
                "function"
            ) {
                modeler.addArchitectureElement(
                    root,
                    "ai-generated-building"
                );
            } else if (
                typeof window
                    .addObjectToScene ===
                "function"
            ) {
                window.addObjectToScene(
                    root,
                    root.name
                );
            } else {
                window.scene
                    ?.add?.(
                        root
                    );

                window
                    .updateHierarchy
                    ?.();
            }

            state.aiGeneratedRoot =
                root;

            const stats =
                root.userData
                    ?.smBuildingStats ||
                {};

            setArchitectureAIProgress(
                100,
                `3D building generated — ${stats.walls || 0} walls, ${stats.rooms || 0} rooms, ${stats.openings || 0} openings.`,
                "success"
            );

            setStatus(
                `Architecture Vision generated "${root.name}".`
            );

            setView(
                "iso"
            );

            refreshUi();

            window.dispatchEvent(
                new CustomEvent(
                    "sm:architecture-ai-generated",
                    {
                        detail: {
                            root,
                            map,
                            sourceFile:
                                state
                                    .pendingUnderlayFile
                                    ?.name ||
                                null
                        }
                    }
                )
            );

            return root;
        } catch (error) {
            console.error(
                "[SM Architecture] AI building generation failed",
                error
            );

            setArchitectureAIProgress(
                0,
                error?.message ||
                    String(error),
                "error"
            );

            setStatus(
                `3D generation failed: ${
                    error?.message ||
                    String(error)
                }`,
                "error"
            );

            return null;
        } finally {
            state.aiBusy =
                false;
        }
    }


    function exportArchitectureAIMap() {
        if (!state.aiPlanMap) {
            setStatus(
                "Analyze a floor plan before exporting an SM map.",
                "warning"
            );
            return;
        }

        const safeName =
            String(
                state.aiPlanMap
                    .building
                    ?.name ||
                "Architecture-Vision"
            )
                .replace(
                    /[^a-z0-9_\-]+/gi,
                    "_"
                )
                .replace(
                    /^_+|_+$/g,
                    ""
                ) ||
            "Architecture-Vision";

        downloadBlob(
            new Blob(
                [
                    JSON.stringify(
                        state.aiPlanMap,
                        null,
                        2
                    )
                ],
                {
                    type:
                        "application/json"
                }
            ),
            `${safeName}.smbuilding.json`
        );

        setStatus(
            "Architecture Vision map exported."
        );
    }


    function createUnderlay(source, aspect, name) {
        const modeler = system();
        if (!modeler || !window.THREE) return;
        const width = Math.max(1, finite(state.panel.querySelector("#arch-suite-blueprint-width")?.value, 32));
        const depth = width / Math.max(0.1, aspect || 1);
        const opacity = finite(state.panel.querySelector("#arch-suite-blueprint-opacity")?.value, 45) / 100;
        new THREE.TextureLoader().load(source, (texture) => {
            texture.colorSpace = THREE.SRGBColorSpace || texture.colorSpace;
            const underlay = new THREE.Mesh(
                new THREE.PlaneGeometry(width, depth),
                new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false })
            );
            underlay.rotation.x = -Math.PI / 2;
            underlay.position.y = modeler.getCurrentStoryElevation?.() + 0.015 || 0.015;
            underlay.name = name || `Blueprint_Underlay_${Date.now()}`;
            underlay.renderOrder = -2;
            underlay.userData = { archType: "blueprint-underlay", story: Number(modeler.settings.archCurrentStory) || 0, sourceName: name || "Blueprint" };
            modeler.addArchitectureElement(underlay, "blueprint-underlay");
            setView("top");
            setStatus(`Blueprint underlay placed at ${width.toFixed(2)} × ${depth.toFixed(2)} m.`);
            refreshUi();
        }, undefined, () => setStatus("The blueprint image could not be loaded.", "error"));
    }

    function addUploadedUnderlay() {
        if (!state.pendingUnderlay) {
            addReferenceUnderlay();
            return;
        }
        createUnderlay(state.pendingUnderlay, state.underlayAspect, "Imported_Blueprint");
    }

    function addReferenceUnderlay() {
        createUnderlay(REFERENCE_BLUEPRINT, 1024 / 540, "Atrium_Reference_Blueprint");
    }

    function toggleUnderlays() {
        const items = underlays();
        if (!items.length) {
            setStatus("No blueprint underlay has been placed yet.", "warning");
            return;
        }
        const show = items.some((item) => !item.visible);
        items.forEach((item) => { item.visible = show; });
        setStatus(`Blueprint underlay ${show ? "shown" : "hidden"}.`);
    }

    function disposeObject(object) {
        object?.traverse?.((node) => {
            node.geometry?.dispose?.();
            const materials = Array.isArray(node.material) ? node.material : [node.material];
            materials.forEach((material) => {
                material?.map?.dispose?.();
                material?.dispose?.();
            });
        });
    }

    function clearReferenceBuilding(silent) {
        const remove = architectureElements().filter((object) => object.userData?.suitePreset === PRESET_ID);
        remove.forEach((object) => {
            object.parent?.remove(object);
            disposeObject(object);
        });
        window.architecturalElements = (window.architecturalElements || []).filter((object) => !remove.includes(object));
        if (!silent) setStatus(`Reference preset removed (${remove.length} elements).`);
        refreshUi();
    }

    function tagPreset(object, type, name) {
        object.name = name || object.name || `${type}_${Date.now()}`;
        object.userData = { ...(object.userData || {}), archType: type, suitePreset: PRESET_ID, story: 0 };
        return object;
    }

    function generateReferenceBuilding() {
        const modeler = system();
        if (!modeler || !window.THREE) {
            setStatus("The 3D engine is not ready yet.", "warning");
            return;
        }
        clearReferenceBuilding(true);
        modeler.settings.archCurrentStory = 0;
        modeler.settings.archStoryHeight = 3.4;
        modeler.settings.archHeight = 3.2;
        modeler.settings.archThickness = 0.24;
        modeler.settings.archWidth = 1.2;
        modeler.settings.archDepth = 1.2;
        modeler.settings.archSegments = 12;

        const progress = state.panel.querySelector("[data-arch-progress]");
        if (progress) progress.style.width = "15%";
        setStatus("Building the reference atrium: envelope and hosted openings…");

        const wallMaterialOpenings = {
            west: [{ type: "door", center: 0, width: 2.8, bottom: 0, height: 2.55 }],
            north: [
                { type: "window", center: -8, width: 2.4, bottom: 1.0, height: 1.25 },
                { type: "window", center: 0, width: 2.8, bottom: 1.0, height: 1.25 },
                { type: "window", center: 8, width: 2.4, bottom: 1.0, height: 1.25 },
            ],
            south: [
                { type: "window", center: -7, width: 2.2, bottom: 0.95, height: 1.3 },
                { type: "window", center: 7, width: 2.2, bottom: 0.95, height: 1.3 },
            ],
        };

        const add = (object, type, name) => {
            if (!object) return null;
            tagPreset(object, type, name);
            modeler.addArchitectureElement(object, type);
            return object;
        };
        const point = (x, z, y = 0) => new THREE.Vector3(x, y, z);
        const wall = (x1, z1, x2, z2, name, openings, options) => {
            const object = modeler.createHostedWall(point(x1, z1), point(x2, z2), {
                height: options?.height || 3.2,
                thickness: options?.thickness || 0.24,
                baseY: options?.baseY || 0,
                story: options?.story || 0,
                openings: openings || [],
                name,
            });
            return add(object, "wall", name);
        };
        const box = (name, size, position, color, type, materialOptions) => {
            const mesh = new THREE.Mesh(
                new THREE.BoxGeometry(size[0], size[1], size[2]),
                new THREE.MeshStandardMaterial({ color, roughness: 0.82, ...(materialOptions || {}) })
            );
            mesh.position.set(position[0], position[1], position[2]);
            return add(mesh, type || "architecture", name);
        };

        box("Ground_Floor_Slab", [32, 0.18, 18], [0, -0.09, 0], 0x6f7780, "slab");
        wall(-16, -9, -16, 9, "Exterior_West_Entrance", wallMaterialOpenings.west);
        wall(-16, 9, 16, 9, "Exterior_North", wallMaterialOpenings.north);
        wall(16, 9, 16, -9, "Exterior_East", [{ type: "door", center: -5.5, width: 1.2, bottom: 0, height: 2.3 }]);
        wall(16, -9, -16, -9, "Exterior_South", wallMaterialOpenings.south);

        wall(-10.2, -9, -10.2, 9, "West_Service_Spine", [
            { type: "door", center: -5.6, width: 1.0, bottom: 0, height: 2.25 },
            { type: "door", center: 5.6, width: 1.0, bottom: 0, height: 2.25 },
        ]);
        wall(-16, 4.0, -10.2, 4.0, "Security_North_Partition", [{ type: "door", center: 1.6, width: 0.95, bottom: 0, height: 2.2 }]);
        wall(-16, -4.0, -10.2, -4.0, "Security_South_Partition", [{ type: "door", center: -1.6, width: 0.95, bottom: 0, height: 2.2 }]);
        wall(-13.1, 4.0, -13.1, 9, "Security_Office_Divider", [{ type: "door", center: 0.5, width: 0.9, bottom: 0, height: 2.2 }]);

        wall(10.2, -9, 10.2, 9, "East_Amenity_Spine", [
            { type: "door", center: -6.0, width: 1.0, bottom: 0, height: 2.25 },
            { type: "door", center: -1.5, width: 1.0, bottom: 0, height: 2.25 },
            { type: "door", center: 3.0, width: 1.0, bottom: 0, height: 2.25 },
            { type: "door", center: 6.8, width: 1.0, bottom: 0, height: 2.25 },
        ]);
        wall(10.2, 5.7, 16, 5.7, "Corridor_Partition", [{ type: "door", center: 0.8, width: 1.0, bottom: 0, height: 2.25 }]);
        wall(10.2, 2.8, 16, 2.8, "Mens_WC_North", [{ type: "door", center: -1.6, width: 0.9, bottom: 0, height: 2.2 }]);
        wall(10.2, 0.0, 16, 0.0, "Mens_WC_South", [{ type: "door", center: 1.5, width: 0.9, bottom: 0, height: 2.2 }]);
        wall(10.2, -3.0, 16, -3.0, "Womens_WC", [{ type: "door", center: -1.5, width: 0.9, bottom: 0, height: 2.2 }]);

        if (progress) progress.style.width = "42%";

        const columnPositions = [];
        [-10, -5, 0, 5, 10].forEach((x) => [-6, 0, 6].forEach((z) => columnPositions.push([x, z])));
        columnPositions.forEach(([x, z], index) => {
            const column = new THREE.Mesh(
                new THREE.BoxGeometry(0.42, 3.35, 0.42),
                new THREE.MeshStandardMaterial({ color: 0xd7d9dc, roughness: 0.68 })
            );
            column.position.set(x, 1.675, z);
            add(column, "column", `Structural_Column_${String(index + 1).padStart(2, "0")}`);
        });

        [-6, 0, 6].forEach((z, row) => box(`Longitudinal_Beam_${row + 1}`, [20.5, 0.28, 0.34], [0, 3.18, z], 0x8e969f, "beam"));
        [-10, -5, 0, 5, 10].forEach((x, col) => box(`Cross_Beam_${col + 1}`, [0.34, 0.28, 12.4], [x, 3.18, 0], 0x8e969f, "beam"));

        const skylight = new THREE.Group();
        const frameMat = new THREE.MeshStandardMaterial({ color: 0x3a4653, metalness: 0.55, roughness: 0.4 });
        const glassMat = new THREE.MeshStandardMaterial({ color: 0x9dd6ef, transparent: true, opacity: 0.32, roughness: 0.08, metalness: 0.1, side: THREE.DoubleSide });
        [[7, 0.15, 0.16, 0, 0, -2.1], [7, 0.15, 0.16, 0, 0, 2.1], [0.16, 0.15, 4.2, -3.5, 0, 0], [0.16, 0.15, 4.2, 3.5, 0, 0]].forEach((item) => {
            const member = new THREE.Mesh(new THREE.BoxGeometry(item[0], item[1], item[2]), frameMat.clone());
            member.position.set(item[3], item[4], item[5]);
            skylight.add(member);
        });
        [-1.75, 0, 1.75].forEach((x) => {
            const member = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.11, 4.1), frameMat.clone());
            member.position.x = x;
            skylight.add(member);
        });
        const glass = new THREE.Mesh(new THREE.BoxGeometry(6.8, 0.05, 4.0), glassMat);
        skylight.add(glass);
        skylight.position.set(0, 3.42, 0);
        add(skylight, "skylight", "Central_Atrium_Skylight");

        if (progress) progress.style.width = "65%";

        const stair = new THREE.Group();
        const stairMat = new THREE.MeshStandardMaterial({ color: 0xc0a886, roughness: 0.8 });
        for (let i = 0; i < 12; i++) {
            const tread = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.16, 0.32), stairMat.clone());
            tread.position.set(0, 0.08 + i * 0.22, i * 0.32);
            stair.add(tread);
        }
        stair.position.set(4.8, 0, -1.7);
        stair.rotation.y = -0.56;
        add(stair, "stairs", "Atrium_Stair");

        const planterMat = new THREE.MeshStandardMaterial({ color: 0x53695a, roughness: 0.95 });
        const soilMat = new THREE.MeshStandardMaterial({ color: 0x313d2e, roughness: 1 });
        const foliageMat = new THREE.MeshStandardMaterial({ color: 0x5d8a68, roughness: 0.95 });
        [[-5.5, 4.2, 1.75], [-5.4, -4.3, 1.6], [5.6, -4.0, 1.9], [5.7, 4.4, 1.5]].forEach(([x, z, radius], index) => {
            const garden = new THREE.Group();
            const rim = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 0.38, 48), planterMat.clone());
            rim.position.y = 0.19;
            const soil = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.88, radius * 0.88, 0.4, 48), soilMat.clone());
            soil.position.y = 0.23;
            const tree = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.15, 1.8, 12), new THREE.MeshStandardMaterial({ color: 0x6b4f35, roughness: 1 }));
            tree.position.y = 1.25;
            const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(0.72, 2), foliageMat.clone());
            crown.position.y = 2.15;
            garden.add(rim, soil, tree, crown);
            garden.position.set(x, 0, z);
            add(garden, "landscape", `Atrium_Garden_${index + 1}`);
        });

        [[0, 5.5, 3.2, Math.PI * 0.82], [0, -5.3, 3.5, Math.PI * 0.78]].forEach(([x, z, radius, arc], index) => {
            const bench = new THREE.Mesh(
                new THREE.TorusGeometry(radius, 0.24, 10, 48, arc),
                new THREE.MeshStandardMaterial({ color: 0x8d7458, roughness: 0.8 })
            );
            bench.rotation.x = Math.PI / 2;
            bench.rotation.z = index ? Math.PI : 0;
            bench.position.set(x, 0.38, z);
            add(bench, "furniture", `Curved_Atrium_Seat_${index + 1}`);
        });

        for (let i = 0; i < 4; i++) {
            const table = new THREE.Group();
            const top = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.08, 28), new THREE.MeshStandardMaterial({ color: 0x8d6d4f, roughness: 0.72 }));
            top.position.y = 0.74;
            const base = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.15, 0.7, 16), new THREE.MeshStandardMaterial({ color: 0x39414a, metalness: 0.45, roughness: 0.45 }));
            base.position.y = 0.36;
            table.add(top, base);
            table.position.set(12.2 + (i % 2) * 2.0, 0, -5.4 - Math.floor(i / 2) * 2.0);
            add(table, "table", `Cafe_Table_${i + 1}`);
        }

        box("Reception_Desk", [2.6, 1.05, 0.75], [-7.2, 0.525, 0], 0x7b654f, "furniture");
        box("Entrance_Canopy", [2.7, 0.18, 4.5], [-16.7, 2.75, 0], 0x3f4b58, "canopy", { metalness: 0.28, roughness: 0.48 });

        if (progress) progress.style.width = "100%";
        setTimeout(() => { if (progress) progress.style.width = "0"; }, 800);
        refreshUi();
        refreshValidation(false);
        setView("iso");
        setStatus("Reference atrium complete: envelope, rooms, hosted openings, structure, skylight, landscape and café created.");
        window.dispatchEvent(new CustomEvent("sm:architecture-preset-created", { detail: { id: PRESET_ID } }));
    }

    function collectStats() {
        const elements = architectureElements().filter((object) => !["blueprint-underlay", "measure", "annotation"].includes(object.userData?.archType));
        const counts = {};
        let wallLength = 0;
        let openingCount = 0;
        let floorArea = 0;
        const stories = new Set();
        elements.forEach((object) => {
            const type = object.userData?.archType || "other";
            counts[type] = (counts[type] || 0) + 1;
            stories.add(Number(object.userData?.story) || 0);
            if (object.userData?.wallData) {
                wallLength += Number(object.userData.wallData.length) || 0;
                openingCount += (object.userData.wallData.openings || []).length;
            }
            if (["slab", "foundation"].includes(type)) {
                const box = new THREE.Box3().setFromObject(object);
                if (!box.isEmpty()) {
                    const size = box.getSize(new THREE.Vector3());
                    floorArea += Math.max(0, size.x * size.z);
                }
            }
        });
        return { elements, counts, wallLength, openingCount, floorArea, stories: stories.size || 1 };
    }

    function refreshData() {
        if (!state.panel || !window.THREE) return;
        const stats = collectStats();
        const cards = [
            [stats.elements.length, "Model elements"],
            [`${stats.wallLength.toFixed(1)} m`, "Wall length"],
            [stats.openingCount, "Hosted openings"],
            [`${stats.floorArea.toFixed(1)} m²`, "Slab footprint"],
        ];
        const grid = state.panel.querySelector("[data-arch-stats]");
        if (grid) grid.innerHTML = cards.map(([value, label]) => `<div class="arch-stat"><div class="arch-stat-value">${escapeHtml(value)}</div><div class="arch-stat-label">${escapeHtml(label)}</div></div>`).join("");
        const schedule = state.panel.querySelector("[data-arch-schedule]");
        if (schedule) {
            const rows = Object.entries(stats.counts).sort((a, b) => b[1] - a[1]);
            schedule.innerHTML = rows.length ? rows.map(([type, count]) => `<tr><td>${escapeHtml(type.replace(/-/g, " "))}</td><td>${count}</td></tr>`).join("") : '<tr><td>No elements</td><td>0</td></tr>';
        }
        const time = state.panel.querySelector("[data-arch-data-time]");
        if (time) time.textContent = `updated ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
        refreshValidation(false);
    }

    function validationResults() {
        const stats = collectStats();
        const results = [];
        const wallCount = stats.counts.wall || 0;
        const columnCount = stats.counts.column || 0;
        const beamCount = stats.counts.beam || 0;
        const slabCount = stats.counts.slab || 0;
        if (!stats.elements.length) return [{ tone: "warning", text: "The architecture model is empty. Draw elements or generate the reference preset." }];
        results.push({ tone: wallCount >= 4 ? "ok" : "warning", text: wallCount >= 4 ? `${wallCount} walls form the current architectural envelope.` : "Fewer than four hosted walls were found; review enclosure continuity." });
        results.push({ tone: stats.openingCount > 0 ? "ok" : "warning", text: stats.openingCount > 0 ? `${stats.openingCount} hosted door/window openings are coordinated with walls.` : "No hosted door or window openings were found." });
        results.push({ tone: slabCount > 0 ? "ok" : "warning", text: slabCount > 0 ? `${slabCount} slab element${slabCount === 1 ? "" : "s"} provide a modeled floor plate.` : "No slab is present; add a floor or foundation plate." });
        results.push({ tone: columnCount >= 4 ? "ok" : "warning", text: columnCount >= 4 ? `${columnCount} columns define a preliminary support grid.` : "The structural concept has fewer than four columns." });
        results.push({ tone: !beamCount || columnCount ? "ok" : "error", text: !beamCount ? "No explicit beams are modeled; this may be appropriate for a wall-bearing concept." : columnCount ? `${beamCount} beams and ${columnCount} columns require engineering sizing.` : "Beams are present without modeled columns; review their supports." });
        const shortWalls = stats.elements.filter((object) => object.userData?.wallData && Number(object.userData.wallData.length) < 0.3).length;
        if (shortWalls) results.push({ tone: "warning", text: `${shortWalls} wall segment${shortWalls === 1 ? " is" : "s are"} shorter than 0.30 m and may be accidental.` });
        results.push({ tone: "warning", text: "Concept-only review: gravity/lateral loads, reinforcement, connections, foundations, fire egress and local codes are not calculated." });
        return results;
    }

    function refreshValidation(announce) {
        const host = state.panel?.querySelector("[data-arch-validation]");
        if (!host) return;
        const results = validationResults();
        host.innerHTML = results.map((result) => `<div class="arch-check ${result.tone === "warning" ? "is-warning" : result.tone === "error" ? "is-error" : ""}"><i class="fa-solid ${result.tone === "warning" ? "fa-triangle-exclamation" : result.tone === "error" ? "fa-circle-xmark" : "fa-circle-check"}"></i><span>${escapeHtml(result.text)}</span></div>`).join("");
        if (announce) {
            const warnings = results.filter((result) => result.tone !== "ok").length;
            setStatus(`Model checks complete: ${results.length - warnings} passed, ${warnings} advisory item${warnings === 1 ? "" : "s"}.`, warnings ? "warning" : "ok");
        }
    }

    function wallRecord(object) {
        const modeler = system();
        const endpoints = modeler?.getWallWorldEndpoints?.(object);
        return endpoints ? {
            start: endpoints.start.toArray(),
            end: endpoints.end.toArray(),
            wallData: JSON.parse(JSON.stringify(object.userData.wallData || {})),
        } : null;
    }

    function serializeProject() {
        return {
            format: "sm-architecture-project",
            version: 1,
            units: state.units,
            exportedAt: new Date().toISOString(),
            settings: { ...(system()?.settings || {}) },
            elements: architectureElements().filter((object) => !["blueprint-underlay", "measure", "annotation"].includes(object.userData?.archType)).map((object) => {
                const box = new THREE.Box3().setFromObject(object);
                const size = box.isEmpty() ? new THREE.Vector3(1, 1, 1) : box.getSize(new THREE.Vector3());
                return {
                    name: object.name,
                    type: object.userData?.archType || "architecture",
                    story: Number(object.userData?.story) || 0,
                    materialClass: object.userData?.materialClass || "concrete",
                    position: object.position.toArray(),
                    quaternion: object.quaternion.toArray(),
                    scale: object.scale.toArray(),
                    dimensions: size.toArray(),
                    hostedWall: wallRecord(object),
                };
            }),
        };
    }

    function downloadBlob(blob, filename) {
        if (typeof window.saveAs === "function") {
            window.saveAs(blob, filename);
            return;
        }
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        link.click();
        setTimeout(() => URL.revokeObjectURL(link.href), 500);
    }

    function exportProjectJson() {
        const data = serializeProject();
        downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }), "SM-Architecture-Project.json");
        setStatus(`Architecture project exported: ${data.elements.length} elements.`);
    }

    function importProjectJson(event) {
        const file = event.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const data = JSON.parse(String(reader.result));
                if (data.format !== "sm-architecture-project" || !Array.isArray(data.elements)) throw new Error("Unsupported project format");
                const modeler = system();
                if (data.settings) Object.assign(modeler.settings, data.settings);
                let created = 0;
                data.elements.forEach((record) => {
                    let object = null;
                    if (record.hostedWall?.start && record.hostedWall?.end) {
                        const wallData = record.hostedWall.wallData || {};
                        object = modeler.createHostedWall(
                            new THREE.Vector3().fromArray(record.hostedWall.start),
                            new THREE.Vector3().fromArray(record.hostedWall.end),
                            { ...wallData, openings: wallData.openings || [], name: record.name }
                        );
                    } else {
                        const dimensions = (record.dimensions || [1, 1, 1]).map((value) => Math.max(0.02, finite(value, 1)));
                        object = new THREE.Mesh(
                            new THREE.BoxGeometry(dimensions[0], dimensions[1], dimensions[2]),
                            new THREE.MeshStandardMaterial({ color: record.type === "column" ? 0xd5d8dc : record.type === "beam" ? 0x8f98a2 : 0xb6aa9b, roughness: 0.78 })
                        );
                        object.position.fromArray(record.position || [0, dimensions[1] / 2, 0]);
                        if (record.quaternion) object.quaternion.fromArray(record.quaternion);
                    }
                    if (!object) return;
                    object.name = record.name || `${record.type}_${Date.now()}`;
                    object.userData = { ...(object.userData || {}), archType: record.type, story: Number(record.story) || 0, materialClass: record.materialClass || "concrete" };
                    modeler.addArchitectureElement(object, record.type);
                    created += 1;
                });
                refreshUi();
                setView("iso");
                setStatus(`Imported ${created} architecture elements from ${file.name}.`);
            } catch (error) {
                console.error("[ArchitectureStudio] Import failed", error);
                setStatus(`Import failed: ${error.message}`, "error");
            }
        };
        reader.readAsText(file);
        event.target.value = "";
    }

    function exportSchedule() {
        const stats = collectStats();
        const rows = [["Category", "Quantity"]].concat(Object.entries(stats.counts).sort((a, b) => a[0].localeCompare(b[0])));
        rows.push(["Wall length (m)", stats.wallLength.toFixed(2)]);
        rows.push(["Hosted openings", stats.openingCount]);
        rows.push(["Slab footprint (m2)", stats.floorArea.toFixed(2)]);
        downloadBlob(new Blob([rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" }), "SM-Architecture-Schedule.csv");
        setStatus("Element schedule exported as CSV.");
    }

    function exportGltf() {
        if (typeof THREE.GLTFExporter !== "function") {
            setStatus("The glTF exporter is not available in this session.", "warning");
            return;
        }
        const group = new THREE.Group();
        architectureElements().filter((object) => !["blueprint-underlay", "measure", "annotation"].includes(object.userData?.archType)).forEach((object) => group.add(object.clone(true)));
        if (!group.children.length) {
            setStatus("There is no architecture model to export.", "warning");
            return;
        }
        const exporter = new THREE.GLTFExporter();
        exporter.parse(group, (result) => {
            downloadBlob(new Blob([JSON.stringify(result, null, 2)], { type: "model/gltf+json" }), "SM-Architecture-Model.gltf");
            setStatus(`glTF exported with ${group.children.length} top-level elements.`);
        }, (error) => {
            console.error("[ArchitectureStudio] glTF export failed", error);
            setStatus("glTF export failed. See the console for details.", "error");
        }, { binary: false, onlyVisible: true });
    }

    function refreshUi() {
        const modeler = system();
        if (!state.panel || !modeler) return;
        const currentStory = Number(modeler.settings.archCurrentStory) || 0;
        const story = state.panel.querySelector("[data-arch-story]");
        const elevation = state.panel.querySelector("[data-arch-elevation]");
        if (story) story.textContent = `Level ${currentStory + 1}`;
        if (elevation) elevation.textContent = `+${(currentStory * (Number(modeler.settings.archStoryHeight) || 3.2)).toFixed(2)} m`;
        const summary = state.panel.querySelector("[data-arch-project-summary]");
        if (summary) summary.textContent = `${collectStats().elements.length} elements · Level ${currentStory + 1} · meters`;
        state.panel.querySelectorAll("[data-arch-tool]").forEach((button) => {
            const alias = button.dataset.archTool === "foundation" ? "slab" : button.dataset.archTool;
            const active = modeler.activeArchitectureTool === alias && (state.lastUiTool === button.dataset.archTool || state.lastUiTool == null);
            button.classList.toggle("is-active", active);
            button.setAttribute("aria-pressed", String(active));
        });
        state.panel.querySelectorAll("[data-arch-constraint]").forEach((button) => {
            button.setAttribute("aria-pressed", String(!!state.constraints[button.dataset.archConstraint]));
        });
        state.panel.querySelectorAll("[data-arch-view]").forEach((button) => {
            const active = button.dataset.archView === "top"
                ? state.cadPlanActive
                : button.dataset.archView === "iso" && !state.cadPlanActive;
            button.classList.toggle("is-active", active);
            if (button.dataset.archView !== "frame") button.setAttribute("aria-pressed", String(active));
        });
        if (modeler.architectureMessage && state.activeTab === "build") setStatus(modeler.architectureMessage);
        if (state.activeTab === "data") refreshData();
    }

    function mountPanel() {
        const panel = document.getElementById("architecture-tools-panel");
        if (!panel) return false;
        state.panel = panel;
        panel.classList.add("sm-architecture-suite");
        panel.innerHTML = panelMarkup();
        bindPanel();
        installBridges();
        mountCadOverlay();
        installPanelLifecycle();
        syncSettings();
        refreshUi();
        refreshValidation(false);
        syncViewportLayout();
        return true;
    }

    function init() {
        if (state.initialized) return true;
        if (!mountPanel()) return false;
        state.initialized = true;
        window.addEventListener("sm:architecture-changed", refreshUi);
        window.addEventListener("sm:object-added", refreshUi);
        state.refreshTimer = window.setInterval(refreshUi, 500);
        console.log("[SM Architecture Studio] Ready");
        return true;
    }

    window.SMArchitectureSuite = {
        init,
        open() {
            if (!state.panel && !init()) return false;
            window.SecondarySidebar?.open?.("arch");
            state.panel.style.display = "flex";
            enterCadPlanMode();
            refreshUi();
            syncViewportLayout();
            return true;
        },
        close: closeArchitectureStudio,
        setView,
        setTool: activateTool,
        generateReferenceBuilding,
        addReferenceUnderlay,

        // Architecture Vision API exposed through the existing Architecture mode.
        analyzePlanWithAI: analyzeArchitecturePlanWithAI,
        generateAIPlan3D: generateArchitectureAIMap3D,
        removeAIGeneratedBuilding,
        getAIPlanMap: () => state.aiPlanMap,

        exportProject: serializeProject,
        validate: validationResults,
        refresh: refreshUi,
    };

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
    else init();
    window.addEventListener("load", init, { once: true });
}());