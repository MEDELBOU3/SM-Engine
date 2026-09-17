// ============================================================================
// engine/SMViewportSystem.js
// Unreal/Unity style tabbed viewport document manager.
// ============================================================================

(function () {
    'use strict';

    // Inject CSS styles for the Viewport system
    const injectViewportStyles = () => {
        if (document.getElementById('sm-viewport-styles')) return;

        const style = document.createElement('style');
        style.id = 'sm-viewport-styles';
        style.textContent = `
            .sm-viewport-container {
                position: absolute;
                inset: 0;
                width: 100%;
                height: 100%; /* FIX: Force explicit 100% height bounds */
                display: flex;
                flex-direction: column;
                background: transparent; 
                font-family: 'Inter', sans-serif;
                z-index: 2;
                pointer-events: none;
            }

            .sm-viewport-panel {
                display: flex;
                flex-direction: column;
                background: transparent;
                border: 1px solid rgba(255, 255, 255, 0.04);
                box-sizing: border-box;
                min-width: 100px;
                min-height: 100px;
                pointer-events: none;
                position: relative;
            }

            /* One document viewport fills the editor workspace. */
            .sm-viewport-container > .sm-viewport-panel {
                width: 100%;
                height: 100%;
            }

            .sm-viewport-panel.active {
                border: 1px solid #b3aa4771;
                box-shadow: inset 0 0 8px rgba(58, 134, 255, 0.1);
            }

            .sm-panel-header {
                height: 28px;
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 0 8px;
                box-sizing: border-box;
                z-index: 6;
                pointer-events: auto;
                user-select: none;
            }

            .sm-panel-header-left,
            .sm-panel-header-right {
                display: flex;
                align-items: center;
                gap: 6px;
            }

            .sm-panel-type-select {
                background: transparent;
                border: none;
                color: #b5c2d5;
                font-size: 11px;
                font-weight: 600;
                cursor: pointer;
                outline: none;
                padding: 2px 4px;
                border-radius: 4px;
                transition: background 0.12s;
            }

            .sm-panel-type-select:hover {
                background: rgba(255, 255, 255, 0.06);
                color: #ffffff;
            }

            .sm-panel-type-select option {
                background: #16181d;
                color: #b5c2d5;
            }

            .sm-panel-btn {
                background: transparent;
                border: none;
                color: #8892b0;
                font-size: 10px;
                width: 20px;
                height: 20px;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                border-radius: 4px;
                transition: all 0.12s;
            }

            .sm-panel-btn:hover {
                background: rgba(255, 255, 255, 0.08);
                color: #ffffff;
            }

            .sm-panel-btn.close:hover {
                background: rgba(239, 68, 68, 0.2);
                color: #ef4444;
            }

            .sm-panel-content {
                flex: 1;
                position: relative;
                min-width: 0;
                min-height: 0;
                background: transparent;
                pointer-events: none;
            }

            /* Jump elements overlay positioning */
            .sm-panel-content #axis-controls {
                position: absolute !important;
                top: 10px !important;
                right: 10px !important;
                z-index: 800 !important;
                display: block !important;
            }

            /* The viewport stays mounted behind the video workspace. Do not
               let the generic panel rule above revive its navigation gizmo. */
            body.video-editing-mode .sm-panel-content #axis-controls {
                display: none !important;
                pointer-events: none !important;
            }

            .sm-viewport-shading {
                display: flex;
                align-items: center;
                margin-right: 6px;
                gap: 1px;
                padding: 2px 3px;
                background: rgba(255, 255, 255, 0.04);
                border: 1px solid rgba(255, 255, 255, 0.08);
                border-radius: 4px;
                backdrop-filter: blur(4px);
            }

            .sm-viewport-shading .shading-mode-btn {
                display: flex;
                align-items: center;
                justify-content: center;
                width: 24px;
                height: 22px;
                border: none;
                background: transparent;
                color: #b5c2d5;
                font-size: 11px;
                cursor: pointer;
                border-radius: 3px;
                transition: all 0.12s;
                padding: 0;
            }

            .sm-viewport-shading .shading-mode-btn:hover {
                background: rgba(255, 255, 255, 0.1);
                color: #ffffff;
            }

            .sm-viewport-shading .shading-mode-btn.active {
                background: #4772b3;
                color: #ffffff;
            }

            .sm-panel-label {
                position: absolute;
                left: 35px;
                bottom: 10px;
                background: rgba(22, 24, 29, 0.85);
                border: 1px solid rgba(255, 255, 255, 0.08);
                color: #ffffff;
                font-size: 10px;
                font-weight: 700;
                font-family: monospace;
                padding: 4px 8px;
                border-radius: 4px;
                pointer-events: none;
                backdrop-filter: blur(4px);
                z-index: 8;
            }

            .sm-game-camera-indicator {
                color: #10b981;
                font-size: 10px;
                display: flex;
                align-items: center;
                gap: 4px;
                margin-left: 6px;
            }
        `;
        document.head.appendChild(style);
    };

    class SMPanel {
        constructor(id, type = 'viewport', isPrimary = false) {
            this.id = id;
            this.type = type;       // 'viewport' | 'game'
            this.viewMode = 'perspective';
            this.shadingMode = 'solid';
            this.isPrimary = isPrimary; // primary panel uses window.camera directly
            // A viewport is an editor document, so its workspace choice must
            // survive while another document switches the global scene.
            this.workspaceMode = window.workspaceManager?.currentMode || 'FILM';
            this.gameMode = window.workspaceManager?.currentGameMode || '3D';
            this.axisView = null;
            this.axisViewLocked = false;

            // Primary panel: we do NOT create a new camera.
            // It delegates to window.camera so OrbitControls always works.
            if (!isPrimary) {
                // Secondary panels get their own independent cameras
                const aspect = window.innerWidth / window.innerHeight;
                this._perspectiveCamera = new THREE.PerspectiveCamera(45, aspect, 0.02, 3000);

                // Copy position + quaternion (NOT euler rotation — avoids gimbal issues)
                if (window.camera) {
                    this._perspectiveCamera.position.copy(window.camera.position);
                    this._perspectiveCamera.quaternion.copy(window.camera.quaternion);
                } else {
                    this._perspectiveCamera.position.set(-10, 9, -6);
                    this._perspectiveCamera.lookAt(0, 0, 0);
                }

                const s = 20;
                this._orthographicCamera = new THREE.OrthographicCamera(
                    (s * aspect) / -2, (s * aspect) / 2,
                    s / 2, s / -2,
                    0.1, 1000
                );
                this._orthographicCamera.position.set(0, 50, 0);
                this._orthographicCamera.lookAt(0, 0, 0);
            } else {
                this._perspectiveCamera = null;
                this._orthographicCamera = null;
            }

            this.controlsTarget = new THREE.Vector3();
            if (window.controls) {
                this.controlsTarget.copy(window.controls.target);
            }
        }

        get camera() {
            if (this.type === 'game') {
                return (
                    window._gameRenderCamera ||
                    window.gameCamera ||
                    window.SMGameCameraManager?.getActiveCamera?.() ||
                    window.cameraSystem?.camera ||
                    window.camera ||
                    null
                );
            }
            if (this.isPrimary) {
                return (
                    window.cameraSystem?.activeCamera ||
                    (
                        this.viewMode === 'orthographic'
                            ? (window.cameraSystem?.orthographicCamera || window.orthographicCamera)
                            : (window.cameraSystem?.camera || window.perspectiveCamera || window.camera)
                    ) ||
                    null
                );
            }
            return this.viewMode === 'orthographic'
                ? this._orthographicCamera
                : this._perspectiveCamera;
        }

        updateAspect(width, height) {
            const aspect = width / Math.max(1, height);

            if (this.isPrimary) {
                // The global camera's aspect is managed by the main resize handler
                return;
            }

            // Update Perspective
            this._perspectiveCamera.aspect = aspect;
            this._perspectiveCamera.updateProjectionMatrix();

            // Update Orthographic
            const s = 20;
            this._orthographicCamera.left = (s * aspect) / -2;
            this._orthographicCamera.right = (s * aspect) / 2;
            this._orthographicCamera.top = s / 2;
            this._orthographicCamera.bottom = s / -2;
            this._orthographicCamera.updateProjectionMatrix();
        }
    }

    class SMViewportSystem {
        constructor() {
            this.container = null;
            this.primaryPanelId = null;
            this.panels = new Map(); // id -> SMPanel
            this.activePanelId = null;
            this.nextIdNum = 1;
            this.isInitialized = false;

            // Automatically open a game view cache
            this.autoGamePanelId = null;
            this._playViewState = null;
            this._cameraModeListener = null;
            this._controlsChangeListener = null;
            this._boundControls = null;
            this._workspaceRestoreTimers = [];
            // Play Mode temporarily replaces the viewport panel with Game
            // View. Keep the one real gizmo node alive while it is detached so
            // Stop can reattach it instead of permanently losing it.
            this._axisControlsNode = null;
            // The rig viewport is a dedicated editor document, not a second
            // timeline panel. Keep one reusable document so repeatedly
            // opening Bone Rig focuses the character instead of spawning
            // endless duplicate tabs.
            this.rigViewportId = null;
        }

        _getDefaultShadingForWorkspace(workspaceMode = null, gameMode = null) {
            const workspace = String(
                workspaceMode ||
                window.workspaceManager?.currentMode ||
                ''
            ).toUpperCase();

            const game = String(
                gameMode ||
                window.workspaceManager?.currentGameMode ||
                ''
            ).toUpperCase();

            if (
                workspace === 'FILM' ||
                workspace === 'FILMING' ||
                workspace === 'CONTENT'
            ) {
                return 'solid';
            }

            if (
                workspace.includes('TERRAIN') ||
                workspace.includes('SCULPT') ||
                game.includes('TERRAIN') ||
                game.includes('SCULPT')
            ) {
                return 'lookdev';
            }

            if (
                workspace === 'GAME_DEV' ||
                workspace.includes('GAME') ||
                game.includes('GAMEPLAY') ||
                game.includes('SAMPLE')
            ) {
                return 'rendered';
            }

            return 'solid';
        }

        _applyPanelShading(panel, mode = null) {
            if (!panel || panel.type !== 'viewport') return false;

            const shadingMode =
                mode ||
                panel.shadingMode ||
                this._getDefaultShadingForWorkspace(
                    panel.workspaceMode,
                    panel.gameMode
                );

            panel.shadingMode = shadingMode;

            if (
                window.SMViewportShading &&
                typeof window.SMViewportShading.setMode === 'function'
            ) {
                window.SMViewportShading.setMode(shadingMode);
            }

            document
                .querySelectorAll('.shading-mode-btn')
                .forEach(button => {
                    button.classList.toggle(
                        'active',
                        button.dataset.mode === shadingMode
                    );
                });

            return true;
        }
        init(containerEl) {
            if (this.isInitialized) return;
            this.container = containerEl;
            injectViewportStyles();
            this._axisControlsNode =
                document.getElementById('axis-controls') ||
                this._axisControlsNode;

            // Setup container styles
            this.container.classList.add('sm-viewport-container');
            this.container.style.pointerEvents = 'none';

            // Create initial main viewport panel — isPrimary=true so it uses
            // window.camera directly and never breaks OrbitControls.
            const firstPanel = new SMPanel('viewport_' + this.nextId(), 'viewport', true);
            firstPanel.shadingMode =
                this._getDefaultShadingForWorkspace(
                    firstPanel.workspaceMode,
                    firstPanel.gameMode
                );
            firstPanel.viewMode = window.cameraSystem?.currentViewMode === 'orthographic'
                ? 'orthographic'
                : 'perspective';
            this.panels.set(firstPanel.id, firstPanel);
            this.primaryPanelId = firstPanel.id;
            this.activePanelId = firstPanel.id;

            this.renderLayout();
            this.isInitialized = true;

            // CameraSystem owns the editor cameras while this system owns which
            // camera each viewport renders. Keep both states in lock-step so an
            // axis-gizmo click changes the actual rendered camera, not only the
            // OrbitControls camera.
            this._cameraModeListener = (event) => {
                this.syncPrimaryCameraMode(event?.detail?.mode, {
                    render: false,
                    preserveAxisGizmo: true
                });
                window.updateAxisGizmo?.();
            };
            window.addEventListener('sm:camera-view-changed', this._cameraModeListener);
            this._bindOrbitStatePersistence();

            // Global pointermove tracker for active-panel detection.
            // Because panel bodies have pointer-events:none (so the canvas
            // underneath can receive mouse events), we need to manually hit-test
            // panels using their bounding rects on every mouse move.
            window.addEventListener('pointermove', (e) => {
                if (!this.panels || this.panels.size < 2) return;
                for (const [id, panel] of this.panels) {
                    if (!panel.dom) continue;
                    const r = panel.dom.getBoundingClientRect();
                    if (e.clientX >= r.left && e.clientX <= r.right &&
                        e.clientY >= r.top && e.clientY <= r.bottom) {
                        if (this.activePanelId !== id) {
                            this.setActivePanel(id);
                        }
                        break;
                    }
                }
            }, { passive: true });

            console.log("SMViewportSystem Initialized.");
        }

        nextId() {
            return this.nextIdNum++;
        }

        getActivePanel() {
            return this.panels.get(this.activePanelId);
        }

        setActivePanel(panelId) {
            if (!this.panels.has(panelId)) return false;
            const prevPanel = this.panels.get(this.activePanelId);
            if (prevPanel && window.controls && !prevPanel.isPrimary && prevPanel.type === 'viewport') {
                prevPanel.controlsTarget.copy(window.controls.target);
            }

            this.activePanelId = panelId;
            this.renderLayout();

            const applied = this._applyActivePanelCamera();
            const activePanel = this.getActivePanel();

            /*
             * IMPORTANT:
             * Game View is a temporary PIE render surface. Activating it must
             * never run editor workspace restoration because that path schedules
             * delayed callbacks (0/180/650/1900 ms) that can re-apply viewport
             * shading/lighting after Play has already stopped.
             */
            if (
                activePanel?.type !== 'game' &&
                window.__smPIEMode !== 'play'
            ) {
                this._restoreWorkspaceForPanel(activePanel);
            }

            return applied;
        }

        _applyActivePanelCamera() {
            const nextPanel = this.getActivePanel();
            if (!nextPanel) return false;

            if (
                nextPanel.isPrimary &&
                nextPanel.type === 'viewport' &&
                window.cameraSystem?.currentViewMode
            ) {
                nextPanel.viewMode = window.cameraSystem.currentViewMode;
            }

            const cam = nextPanel.camera;
            if (nextPanel.type === 'viewport') {
                if (window.controls && cam) {
                    window.controls.object = cam;
                    if (!nextPanel.isPrimary) {
                        window.controls.target.copy(nextPanel.controlsTarget);
                        // A previously opened 2D/2.5D workspace can leave
                        // the shared control instance constrained. Secondary
                        // viewport documents must always be orbitable again.
                        window.controls.enableRotate = nextPanel.viewMode === 'perspective';
                        window.controls.enableZoom = true;
                        window.controls.enablePan = true;
                        if (nextPanel.viewMode === 'perspective' && window.THREE?.MOUSE) {
                            window.controls.mouseButtons = {
                                LEFT: THREE.MOUSE.ROTATE,
                                MIDDLE: THREE.MOUSE.DOLLY,
                                RIGHT: THREE.MOUSE.PAN
                            };
                            window.controls.minPolarAngle = 0;
                            window.controls.maxPolarAngle = Math.PI;
                            window.controls.minAzimuthAngle = -Infinity;
                            window.controls.maxAzimuthAngle = Infinity;
                        }
                    }
                    // Before CameraSystem finishes booting the optional chain
                    // above evaluates to `undefined === 0` (false), leaving a
                    // newly created viewport permanently non-orbitable. Only
                    // an actual positive lock may disable editor navigation.
                    const inputLockCount = Number(
                        window.cameraSystem?._inputLockCount || 0
                    );
                    window.controls.enabled = inputLockCount === 0;
                    window.controls.update?.();
                }
                if (window.transformControls && cam) {
                    window.transformControls.camera = cam;
                    window.transformControls.update?.();
                }
                if (nextPanel.isRiggingViewport && window.rigManager) {
                    // Bone placement and rig-control picking must raycast
                    // through Rig View's independent camera, not the hidden
                    // primary editor camera.
                    window.rigManager.camera = cam;
                    window.rigManager.transformControls = window.transformControls || window.rigManager.transformControls;
                }
                const gridAxis = nextPanel.isPrimary
                    ? (window.cameraSystem?.axisViewLocked
                        ? window.cameraSystem.currentAxisView
                        : 'perspective')
                    : (nextPanel.axisViewLocked
                        ? nextPanel.axisView
                        : 'perspective');
                window.updateViewportGridForAxis?.(gridAxis);
            } else if (nextPanel.type === 'game') {
                if (window.controls) {
                    window.controls.enabled = false;
                }
            }
            const contentEl = document.getElementById(`panel-content-${nextPanel.id}`);
            if (contentEl && nextPanel.type === 'viewport') {
                const axisControls = this._getAxisControlsNode();
                if (axisControls) {
                    contentEl.appendChild(axisControls);
                    this._restoreAxisControlsPresentation(axisControls);
                    requestAnimationFrame(() => window.updateAxisGizmo?.());
                }
            }
            document.querySelectorAll('.sm-viewport-panel').forEach(el => {
                el.classList.toggle(
                    'active',
                    el.dataset.panelId === nextPanel.id
                );
            });
            // Keep all consumers (raycasting, outline, post-process and
            // TransformControls) tied to the same camera as the active tab.
            if (
                nextPanel.type === 'viewport'
            ) {
                this._applyPanelShading(
                    nextPanel
                );
            }
            return true;
        }

        createViewportWindow(options = {}) {
            const source = this.getActivePanel();
            const panel = new SMPanel(
                options.id || ('viewport_' + this.nextId()),
                'viewport'
            );
            panel.isRiggingViewport = options.rigging === true;
            panel.documentLabel = options.label || '';
            panel.viewMode = source?.viewMode || 'perspective';
            panel.shadingMode = source?.shadingMode || 'solid';
            panel.workspaceMode = source?.workspaceMode || window.workspaceManager?.currentMode || 'FILM';
            panel.gameMode = source?.gameMode || window.workspaceManager?.currentGameMode || '3D';
            panel.axisView = source?.axisView || null;
            panel.axisViewLocked = source?.axisViewLocked === true;
            // A new viewport begins as a real duplicate of the focused view,
            // not a copy of a stale global/editor camera. This prevents a new
            // tab from opening inside the scene after its source was in an
            // axis view or a custom orbit position.
            const sourceCamera = source?.camera || null;
            if (sourceCamera?.isCamera) {
                const destination = panel.viewMode === 'orthographic'
                    ? panel._orthographicCamera
                    : panel._perspectiveCamera;
                if (destination) {
                    destination.position.copy(sourceCamera.position);
                    destination.quaternion.copy(sourceCamera.quaternion);
                    destination.up.copy(sourceCamera.up);
                    destination.near = sourceCamera.near;
                    destination.far = sourceCamera.far;
                    if (destination.isPerspectiveCamera && sourceCamera.isPerspectiveCamera) {
                        destination.fov = sourceCamera.fov;
                    }
                    if (destination.isOrthographicCamera && sourceCamera.isOrthographicCamera) {
                        destination.zoom = sourceCamera.zoom;
                    }
                    destination.updateProjectionMatrix?.();
                    destination.updateMatrixWorld?.(true);
                }
            }
            panel.controlsTarget.copy(
                source?.controlsTarget || window.controls?.target || panel.controlsTarget
            );
            this.panels.set(panel.id, panel);

            const number = this.panels.size;
            window.SMDocumentTabs?.register?.(panel.id, {
                label: options.label || `Viewport ${number}`,
                icon: options.icon || (panel.isRiggingViewport ? 'fa-bone' : 'fa-cube'),
                onActivate: () => this.activateViewportWindow(panel.id),
                onClose: () => this.closeViewportWindow(panel.id)
            });
            window.SMDocumentTabs?.open?.(panel.id);
            return panel.id;
        }

        _resolveRigOwner(selection) {
            let candidate = selection || window.selectedBone || window.selectedObject || null;
            if (!candidate && Array.isArray(window.selectedObjects)) {
                candidate = window.selectedObjects[window.selectedObjects.length - 1] || null;
            }
            if (!candidate) return null;

            const containsBones = object => {
                if (!object) return false;
                if (object.isBone || object.skeleton?.bones?.length) return true;
                let found = false;
                object.traverse?.(node => {
                    if (node.isBone || node.skeleton?.bones?.length) found = true;
                });
                return found;
            };

            // A selected bone normally lives beside the skinned mesh in a
            // GLTF hierarchy. Locate the owning skin so rig setup can show a
            // SkeletonHelper and controller shapes for the whole character.
            if (candidate.isBone && window.scene?.traverse) {
                let owner = null;
                window.scene.traverse(node => {
                    if (!owner && node.isSkinnedMesh && node.skeleton?.bones?.includes(candidate)) {
                        owner = node.parent || node;
                    }
                });
                if (owner) return owner;
            }

            // Prefer the character root when a SkinnedMesh is selected. In
            // many GLTF files the mesh references its skeleton, but the bone
            // hierarchy is a sibling under the imported character root.
            if (candidate.skeleton?.bones?.length) {
                let hierarchyOwner = candidate.parent;
                while (hierarchyOwner) {
                    let hasChildBone = false;
                    hierarchyOwner.traverse?.(node => {
                        if (node.isBone) hasChildBone = true;
                    });
                    if (hasChildBone) return hierarchyOwner;
                    hierarchyOwner = hierarchyOwner.parent;
                }
            }

            let cursor = candidate;
            while (cursor) {
                if (containsBones(cursor)) return cursor;
                cursor = cursor.parent;
            }
            // A plain mesh/object is valid too: RigManager will author a
            // generated Root_CTRL for it, then artists can build child bones
            // and bind separate mechanical parts.
            return candidate.isObject3D ? candidate : null;
        }

        _frameRigViewport(panel, owner) {
            const camera = panel?._perspectiveCamera;
            if (!camera || !owner || !window.THREE) return false;

            owner.updateMatrixWorld?.(true);
            const bounds = new THREE.Box3().setFromObject(owner);
            const center = bounds.isEmpty() ? new THREE.Vector3() : bounds.getCenter(new THREE.Vector3());
            const size = bounds.isEmpty() ? new THREE.Vector3(2, 2, 2) : bounds.getSize(new THREE.Vector3());
            const radius = Math.max(2.5, size.length() * 0.68);

            camera.position.copy(center).add(new THREE.Vector3(radius * 1.15, radius * 0.72, radius * 1.4));
            camera.up.set(0, 1, 0);
            camera.lookAt(center);
            camera.near = Math.max(0.01, radius / 250);
            camera.far = Math.max(1000, radius * 80);
            camera.updateProjectionMatrix();
            camera.updateMatrixWorld?.(true);

            panel.viewMode = 'perspective';
            panel.axisView = null;
            panel.axisViewLocked = false;
            panel.controlsTarget.copy(center);
            return true;
        }

        openRiggingViewport(selection = null) {
            const owner = this._resolveRigOwner(selection);
            if (!owner) {
                window.alert?.('Select a character or object that contains bones before opening Bone Rig.');
                return false;
            }

            // RigManager prepares the skeleton helper and interactive bone
            // controls. The Bone Rig panel continues to provide hierarchy and
            // properties in the timeline while this document is the 3D view.
            window.rigManager?.setupRigForObject?.(owner);
            window.advancedControlRig?.setActiveObject?.(owner);

            let panel = this.rigViewportId ? this.panels.get(this.rigViewportId) : null;
            if (!panel) {
                const id = this.createViewportWindow({
                    id: 'rig_viewport',
                    label: 'Rig View',
                    icon: 'fa-bone',
                    rigging: true
                });
                this.rigViewportId = id;
                panel = this.panels.get(id);
            }
            if (!panel) return false;

            panel.rigOwner = owner;
            this._frameRigViewport(panel, owner);
            this.setActivePanel(panel.id);

            window.rigManager?.showRigForObject?.(owner);
            window.updateViewportGridForAxis?.('perspective');
            window.dispatchEvent(new CustomEvent('sm:rigging-viewport-opened', {
                detail: { panelId: panel.id, owner }
            }));
            return panel.id;
        }

        activateViewportWindow(panelId) {
            if (!this.panels.has(panelId)) return false;
            return this.setActivePanel(panelId);
        }

        activatePrimaryViewport() {
            return this.primaryPanelId
                ? this.activateViewportWindow(this.primaryPanelId)
                : false;
        }

        closeViewportWindow(panelId) {
            const panel = this.panels.get(panelId);
            if (!panel || panel.isPrimary) return false;
            const wasActive = this.activePanelId === panelId;
            this.panels.delete(panelId);
            if (panelId === this.rigViewportId) this.rigViewportId = null;
            if (wasActive) {
                const fallbackId = this.primaryPanelId || Array.from(this.panels.keys())[0] || null;
                if (fallbackId) return this.setActivePanel(fallbackId);
            }
            this.renderLayout();
            return true;
        }

                rememberWorkspaceForActiveViewport(
            workspaceMode,
            gameMode,
            options = {}
        ) {
            const panel = this.getActivePanel();
            if (!panel) return false;

            const previousWorkspace =
                panel.workspaceMode;

            const previousGameMode =
                panel.gameMode;

            if (workspaceMode) {
                panel.workspaceMode =
                    workspaceMode;
            }

            if (gameMode) {
                panel.gameMode =
                    gameMode;
            }

            const workspaceChanged =
                previousWorkspace !== panel.workspaceMode ||
                previousGameMode !== panel.gameMode;

            if (workspaceChanged) {
                panel.shadingMode =
                    this._getDefaultShadingForWorkspace(
                        panel.workspaceMode,
                        panel.gameMode
                    );

                this._applyPanelShading(
                    panel,
                    panel.shadingMode
                );
            }

            if (
                options.captureCamera &&
                !panel.isPrimary
            ) {
                this._captureWorkspaceCamera(panel);
            }

            this._restoreActivePanelAfterWorkspaceChange(
                panel.id
            );

            return true;
        }

        _captureWorkspaceCamera(panel) {
            const source = window.cameraSystem?.activeCamera || window.camera;
            if (!panel || panel.isPrimary || !source?.isCamera) return false;

            const destination = source.isOrthographicCamera
                ? panel._orthographicCamera
                : panel._perspectiveCamera;
            if (!destination) return false;

            destination.position.copy(source.position);
            destination.quaternion.copy(source.quaternion);
            destination.up.copy(source.up);
            destination.near = source.near;
            destination.far = source.far;
            if (destination.isPerspectiveCamera && source.isPerspectiveCamera) {
                destination.fov = source.fov;
            }
            if (destination.isOrthographicCamera && source.isOrthographicCamera) {
                destination.zoom = source.zoom;
            }
            destination.updateProjectionMatrix();
            destination.updateMatrixWorld?.(true);
            panel.viewMode = source.isOrthographicCamera ? 'orthographic' : 'perspective';
            if (window.controls?.target) panel.controlsTarget.copy(window.controls.target);
            return true;
        }

        _restoreWorkspaceForPanel(panel) {
            if (!panel || !window.workspaceManager) return false;
            const manager = window.workspaceManager;
            const desiredWorkspace = panel.workspaceMode || manager.currentMode || 'FILM';
            const desiredGameMode = panel.gameMode || manager.currentGameMode || '3D';
            const needsGameMode = desiredWorkspace === 'GAME_DEV' &&
                manager.currentGameMode !== desiredGameMode;

            if (needsGameMode) {
                manager.setGameMode?.(desiredGameMode, {
                    applyViewport: false,
                    persist: false,
                    showToast: false
                });
            }

            if (manager.currentMode !== desiredWorkspace) {
                manager.setMode?.(desiredWorkspace);
            } else if (needsGameMode) {
                manager.setGameMode?.(desiredGameMode, {
                    applyViewport: true,
                    persist: false,
                    showToast: false
                });
            }

            this._restoreActivePanelAfterWorkspaceChange(panel.id);
            return true;
        }

        _restoreActivePanelAfterWorkspaceChange(panelId) {
            this._workspaceRestoreTimers.forEach(timer => clearTimeout(timer));
            this._workspaceRestoreTimers = [];
            const restore = () => {
                if (this.activePanelId !== panelId) return;
                this._applyActivePanelCamera();
            };
            restore();
            [0, 180, 650, 1900].forEach(delay => {
                this._workspaceRestoreTimers.push(setTimeout(restore, delay));
            });
        }

        _bindOrbitStatePersistence() {
            const controls = window.controls;
            if (!controls || controls === this._boundControls) return;
            if (this._boundControls && this._controlsChangeListener) {
                this._boundControls.removeEventListener?.('change', this._controlsChangeListener);
            }
            this._controlsChangeListener = () => {
                const panel = this.getActivePanel();
                if (panel?.type === 'viewport' && !panel.isPrimary && window.controls?.target) {
                    panel.controlsTarget.copy(window.controls.target);
                }
            };
            controls.addEventListener?.('change', this._controlsChangeListener);
            this._boundControls = controls;
        }

        setPanelType(panelId, type) {
            const panel = this.panels.get(panelId);
            if (!panel) return;
            panel.type = type;

            this.renderLayout();
            if (this.activePanelId === panelId) {
                this.activePanelId = null;
                this.setActivePanel(panelId);
            }
        }

        setPanelCamera(panelId, viewMode) {
            const panel = this.panels.get(panelId);
            if (!panel) return;
            const mode = viewMode === 'orthographic' ? 'orthographic' : 'perspective';
            panel.viewMode = mode;
            if (!panel.isPrimary && mode === 'perspective') {
                panel.axisView = null;
                panel.axisViewLocked = false;
            }

            // The primary viewport uses CameraSystem's real editor cameras.
            // Changing its header selector must therefore update CameraSystem
            // too; otherwise the header/render camera and controls diverge.
            if (panel.isPrimary && panel.type === 'viewport' && window.cameraSystem) {
                if (mode === 'orthographic') {
                    window.cameraSystem.switchToOrthographic?.({ preserveView: true });
                } else {
                    window.cameraSystem.switchToPerspective?.({ preserveView: true });
                }
            }
            if (this.activePanelId === panelId && panel.type === 'viewport') {
                const cam = panel.camera;
                if (window.controls && cam) {
                    window.controls.object = cam;
                    window.controls.update();
                }
                if (window.transformControls && cam) {
                    window.transformControls.camera = cam;
                    window.transformControls.update?.();
                }
            }
            this.renderLayout();
            if (this.activePanelId === panelId) {
                this._applyActivePanelCamera();
            }
        }

        syncPrimaryCameraMode(viewMode, options = {}) {
            if (viewMode !== 'orthographic' && viewMode !== 'perspective') return false;

            let changed = false;

            this.panels.forEach(panel => {
                if (!panel.isPrimary || panel.type !== 'viewport') return;

                if (panel.viewMode !== viewMode) {
                    panel.viewMode = viewMode;
                    changed = true;
                }

                const panelEl = panel.dom || this.container?.querySelector?.(
                    `.sm-viewport-panel[data-panel-id="${panel.id}"]`
                );

                const camSelect = panelEl?.querySelector?.('.sm-panel-camera-select');
                if (camSelect && camSelect.value !== viewMode) camSelect.value = viewMode;

                const label = panelEl?.querySelector?.('.sm-panel-label');
                if (label) {
                    const architectureMode =
                        window.__smArchitecturePlanMode === true ||
                        document.body.classList.contains('arch-cad-plan-mode');
                    label.hidden = architectureMode;
                    if (architectureMode) {
                        label.textContent = '';
                    } else {
                        const axis = window.cameraSystem?.currentAxisView;
                        const axisText =
                            (window.cameraSystem?.axisViewLocked && axis)
                                ? ` • ${String(axis).toUpperCase()}`
                                : '';
                        label.textContent = `VIEWPORT: ${viewMode.toUpperCase()}${axisText}`;
                    }
                }
            });

            if (changed && this.isInitialized && options.render === true) {
                this.renderLayout();
            }

            if (options.preserveAxisGizmo !== false) {
                this.attachAxisControlsToActivePanel();
            }

            return changed;
        }

        attachAxisControlsToActivePanel() {
            const panel = this.getActivePanel();
            if (!panel || panel.type !== 'viewport') return false;

            const axisControls = this._getAxisControlsNode();
            const contentEl = document.getElementById(`panel-content-${panel.id}`);
            if (!axisControls || !contentEl) return false;

            if (axisControls.parentElement !== contentEl) {
                contentEl.appendChild(axisControls);
            }

            this._restoreAxisControlsPresentation(axisControls);
            requestAnimationFrame(() => window.updateAxisGizmo?.());
            return true;
        }

        _getAxisControlsNode() {
            const liveNode = document.getElementById('axis-controls');
            if (liveNode) this._axisControlsNode = liveNode;
            return this._axisControlsNode || null;
        }

        _restoreAxisControlsPresentation(axisControls = this._getAxisControlsNode()) {
            if (!axisControls) return false;

            // Video Editing uses its own preview controls. The viewport can
            // rebuild while this mode is active, so keep the shared 3D gizmo
            // hidden until the editor returns to a viewport workspace.
            if (document.body?.classList.contains('video-editing-mode')) {
                axisControls.hidden = true;
                axisControls.setAttribute('aria-hidden', 'true');
                axisControls.style.setProperty('display', 'none', 'important');
                axisControls.style.pointerEvents = 'none';
                return true;
            }

            axisControls.hidden = false;
            axisControls.removeAttribute('aria-hidden');
            axisControls.style.removeProperty('display');
            axisControls.style.removeProperty('visibility');
            axisControls.style.removeProperty('opacity');
            axisControls.style.pointerEvents = 'auto';
            return true;
        }

        renderLayout() {
            if (!this.container) return;

            const axisControls = this._getAxisControlsNode();

            // Preserve the original axis-controls DOM node before clearing.
            if (axisControls && this.container.contains(axisControls)) {
                axisControls.remove();
            }

            this.container.innerHTML = '';

            // Viewports are editor documents now: render only the active
            // window full-size rather than tiling several cameras together.
            this.panels.forEach(panel => { panel.dom = null; });
            const activePanel = this.getActivePanel();
            const dom = activePanel
                ? this.buildDOM({ type: 'panel', panelId: activePanel.id })
                : null;
            if (dom) this.container.appendChild(dom);

            this.triggerResize();

            if (axisControls) {
                const contentEl =
                    activePanel?.type === 'viewport'
                        ? document.getElementById(`panel-content-${activePanel.id}`)
                        : null;

                if (contentEl) {
                    contentEl.appendChild(axisControls);
                    this._restoreAxisControlsPresentation(axisControls);
                }
            }

            requestAnimationFrame(() => window.updateAxisGizmo?.());
        }

        buildDOM(node) {
            if (!node) return null;

            if (node.type === 'panel') {
                const panel = this.panels.get(node.panelId);
                if (!panel) return null;

                const panelEl = document.createElement('div');
                panelEl.className = 'sm-viewport-panel';
                panelEl.dataset.panelId = panel.id;
                // IMPORTANT: keep pointer-events NONE on the panel body so mouse
                // events fall through to the WebGL canvas underneath.
                // Only the header bar captures events for its UI controls.
                panelEl.style.pointerEvents = 'none';

                if (panel.id === this.activePanelId) {
                    panelEl.classList.add('active');
                }

                // Active panel detection is handled by the global pointermove
                // tracker registered in init() — not here.

                const header = document.createElement('div');
                header.className = 'sm-panel-header';
                // The header DOES capture pointer events (for buttons/selects)
                header.style.pointerEvents = 'auto';

                const left = document.createElement('div');
                left.className = 'sm-panel-header-left';

                const select = document.createElement('select');
                select.className = 'sm-panel-type-select';
                select.innerHTML = `
                    <option value="viewport" ${panel.type === 'viewport' ? 'selected' : ''}>3D Viewport</option>
                    <option value="game" ${panel.type === 'game' ? 'selected' : ''}>Game View</option>
                `;
                select.addEventListener('change', (e) => {
                    this.setPanelType(panel.id, e.target.value);
                });
                left.appendChild(select);

                if (panel.type === 'viewport') {
                    const camSelect = document.createElement('select');
                    camSelect.className = 'sm-panel-type-select sm-panel-camera-select';
                    camSelect.innerHTML = `
                        <option value="perspective" ${panel.viewMode === 'perspective' ? 'selected' : ''}>Perspective</option>
                        <option value="orthographic" ${panel.viewMode === 'orthographic' ? 'selected' : ''}>Ortho (Top-Down)</option>
                    `;
                    camSelect.addEventListener('change', (e) => {
                        this.setPanelCamera(panel.id, e.target.value);
                    });
                    left.appendChild(camSelect);
                } else if (panel.type === 'game') {
                    const gameCam =
                        window._gameRenderCamera ||
                        window.SMGameCameraManager?.getActiveCamera?.() ||
                        null;
                    if (gameCam) {
                        const camName = document.createElement('span');
                        camName.className = 'sm-game-camera-indicator';
                        camName.innerHTML = `<i class="fas fa-video"></i> ${gameCam.name || 'Game Camera'}`;
                        left.appendChild(camName);
                    }
                }

                header.appendChild(left);

                const right = document.createElement('div');
                right.className = 'sm-panel-header-right';

                // Blender-style viewport shading bar in the panel header
                if (panel.type === 'viewport') {
                    const shading = document.createElement('div');
                    shading.className = 'sm-viewport-shading';
                    shading.title = 'Viewport Shading';

                    const modes = [
                        { mode: 'wireframe', icon: 'fa-border-none', title: 'Wireframe' },
                        { mode: 'solid', icon: 'fa-circle', title: 'Solid: studio lighting and shadows' },
                        { mode: 'lookdev', icon: 'fa-adjust', title: 'Material Preview: textures, shadows and HDRI' },
                        { mode: 'rendered', icon: 'fa-sun', title: 'Rendered: scene lights, textures, HDRI and post-processing' },
                    ];

                      const activeMode =
                        panel.shadingMode ||
                        window.SMViewportShading?.getMode?.() ||
                        this._getDefaultShadingForWorkspace(
                            panel.workspaceMode,
                            panel.gameMode
                        );
                    modes.forEach(({ mode, icon, title }) => {
                        const btn = document.createElement('button');
                        btn.className = 'shading-mode-btn' + (mode === activeMode ? ' active' : '');
                        btn.dataset.mode = mode;
                        btn.title = title;
                        btn.innerHTML = `<i class="fas ${icon}"></i>`;
                        shading.appendChild(btn);
                    });

                    right.appendChild(shading);
                }

                const btnNewViewport = document.createElement('button');
                btnNewViewport.className = 'sm-panel-btn';
                btnNewViewport.title = 'Open New Viewport Window';
                btnNewViewport.innerHTML = '<i class="fas fa-plus"></i>';
                btnNewViewport.addEventListener('click', () => this.createViewportWindow());
                right.appendChild(btnNewViewport);

                header.appendChild(right);
                panelEl.appendChild(header);

                const content = document.createElement('div');
                content.className = 'sm-panel-content';
                content.id = `panel-content-${panel.id}`;
                content.style.pointerEvents = 'none'; // transparent to mouse

                const label = document.createElement('span');
                label.className = 'sm-panel-label';
                const architectureMode =
                    window.__smArchitecturePlanMode === true ||
                    document.body.classList.contains('arch-cad-plan-mode');
                label.hidden = architectureMode;
                label.textContent = architectureMode
                    ? ''
                    : (panel.type === 'game'
                        ? 'GAME PREVIEW'
                        : (panel.isRiggingViewport
                            ? 'RIG VIEW • SKELETON + CONTROLLERS'
                            : `VIEWPORT: ${panel.viewMode.toUpperCase()}`));
                content.appendChild(label);

                panelEl.appendChild(content);

                panelEl.style.flex = '1 1 0%';

                // panel.dom = panelEl so animate-loop uses the full panel rect
                // for scissor/viewport bounds calculation.
                panel.dom = panelEl;
                return panelEl;
            }

            return null;
        }

        triggerResize() {
            this.panels.forEach(panel => {
                if (panel.dom) {
                    const rect = panel.dom.getBoundingClientRect();
                    panel.updateAspect(rect.width, rect.height);
                }
            });

            window.dispatchEvent(new Event('resize'));
        }

        openGameView() {
            /*
             * PIE must not inherit delayed editor-workspace restoration jobs.
             * Those jobs call _applyActivePanelCamera(), which also reapplies
             * viewport shading and can visually switch the editor back to the
             * rendered/game look after Stop.
             */
            this._workspaceRestoreTimers.forEach(timer => clearTimeout(timer));
            this._workspaceRestoreTimers = [];

            const activeId = this.activePanelId;
            const activePanel = this.panels.get(activeId);
            if (!activePanel) return false;

            const liveShadingMode =
                window.SMViewportShading?.getMode?.() ||
                activePanel.shadingMode ||
                this._getDefaultShadingForWorkspace(
                    activePanel.workspaceMode,
                    activePanel.gameMode
                );

            // If the user already has a dedicated Game View document, remember
            // the editor document that was focused so Stop can return to it.
            const existingGamePanel = Array.from(this.panels.values()).find(
                panel => panel.type === 'game' && panel.id !== activeId
            );

            if (existingGamePanel) {
                this._playViewState = {
                    usedExistingGamePanel: true,
                    panelId: existingGamePanel.id,
                    previousActivePanelId: activeId,
                    previousShadingMode: liveShadingMode,
                    previousViewMode: activePanel.viewMode,
                    previousWorkspaceMode: activePanel.workspaceMode,
                    previousGameMode: activePanel.gameMode,
                    previousAxisView: activePanel.axisView,
                    previousAxisViewLocked: activePanel.axisViewLocked === true,
                    previousControlsTarget:
                        activePanel.controlsTarget?.clone?.() ||
                        window.controls?.target?.clone?.() ||
                        null
                };

                // Do not use setActivePanel() here: a Game View must not trigger
                // editor workspace restoration or its delayed repair timers.
                this.activePanelId = existingGamePanel.id;
                this.renderLayout();
                this._applyActivePanelCamera();
                this.autoGamePanelId = null;
                return true;
            }

            // Capture the exact editor visual state before turning this document
            // into Game View. In particular, capture the live shading mode rather
            // than trusting panel.shadingMode, which can be stale after a manual
            // Solid/LookDev/Rendered switch.
            this._playViewState = {
                usedExistingGamePanel: false,
                panelId: activeId,
                type: activePanel.type,
                viewMode: activePanel.viewMode,
                shadingMode: liveShadingMode,
                workspaceMode: activePanel.workspaceMode,
                gameMode: activePanel.gameMode,
                axisView: activePanel.axisView,
                axisViewLocked: activePanel.axisViewLocked === true,
                controlsTarget:
                    activePanel.controlsTarget?.clone?.() ||
                    window.controls?.target?.clone?.() ||
                    null
            };

            activePanel.shadingMode = liveShadingMode;
            activePanel.type = 'game';

            // Avoid setPanelType()/setActivePanel() here. Both are general editor
            // navigation paths and can schedule workspace restoration. PIE only
            // needs to rebuild this panel and bind the game camera.
            this.renderLayout();
            this._applyActivePanelCamera();

            this.autoGamePanelId = null;
            return true;
        }

        closeGameView() {
            /*
             * Stop must be deterministic. Cancel every delayed panel/workspace
             * restore before rebuilding the editor view; otherwise a callback
             * can fire hundreds of milliseconds later and re-apply the game-like
             * rendered shading after the editor briefly looked correct.
             */
            this._workspaceRestoreTimers.forEach(timer => clearTimeout(timer));
            this._workspaceRestoreTimers = [];

            if (this._playViewState) {
                const state = this._playViewState;
                this._playViewState = null;

                if (state.usedExistingGamePanel) {
                    const editorPanel = this.panels.get(state.previousActivePanelId);
                    if (editorPanel) {
                        editorPanel.viewMode =
                            state.previousViewMode ||
                            editorPanel.viewMode ||
                            'perspective';
                        editorPanel.workspaceMode =
                            state.previousWorkspaceMode ||
                            editorPanel.workspaceMode;
                        editorPanel.gameMode =
                            state.previousGameMode ||
                            editorPanel.gameMode;
                        editorPanel.axisView =
                            state.previousAxisView ?? editorPanel.axisView;
                        editorPanel.axisViewLocked =
                            state.previousAxisViewLocked === true;

                        if (state.previousShadingMode) {
                            editorPanel.shadingMode = state.previousShadingMode;
                        }
                        if (state.previousControlsTarget && editorPanel.controlsTarget) {
                            editorPanel.controlsTarget.copy(state.previousControlsTarget);
                        }

                        this.activePanelId = editorPanel.id;
                        this.renderLayout();
                        this._applyActivePanelCamera();

                        if (state.previousShadingMode) {
                            this._applyPanelShading(
                                editorPanel,
                                state.previousShadingMode
                            );
                        }

                        requestAnimationFrame(() => {
                            this.attachAxisControlsToActivePanel();
                            window.updateAxisGizmo?.();
                        });
                    }
                    return true;
                }

                const panel = this.panels.get(state.panelId);
                if (panel) {
                    panel.type = state.type || 'viewport';
                    panel.viewMode = state.viewMode || 'perspective';
                    panel.workspaceMode = state.workspaceMode || panel.workspaceMode;
                    panel.gameMode = state.gameMode || panel.gameMode;
                    panel.axisView = state.axisView ?? panel.axisView;
                    panel.axisViewLocked = state.axisViewLocked === true;

                    if (state.shadingMode) {
                        panel.shadingMode = state.shadingMode;
                    }
                    if (state.controlsTarget && panel.controlsTarget) {
                        panel.controlsTarget.copy(state.controlsTarget);
                    }

                    this.activePanelId = panel.id;
                    this.renderLayout();

                    /*
                     * Apply camera + the exact pre-Play shading directly.
                     * Deliberately do NOT call setActivePanel() here because it
                     * routes through _restoreWorkspaceForPanel(), which schedules
                     * delayed visual changes.
                     */
                    this._applyActivePanelCamera();

                    if (state.shadingMode) {
                        this._applyPanelShading(panel, state.shadingMode);
                    }

                    requestAnimationFrame(() => {
                        // One DOM-frame later only restore the gizmo. Do not
                        // re-run workspace/shading synchronization.
                        this.attachAxisControlsToActivePanel();
                        window.updateAxisGizmo?.();
                    });
                }

                return true;
            }

            if (this.autoGamePanelId && this.panels.has(this.autoGamePanelId)) {
                this.closeViewportWindow(this.autoGamePanelId);
                this.autoGamePanelId = null;
                return true;
            }

            return false;
        }

        /**
         * Route the active (focused) viewport to render through the given camera.
         * Also updates the global window.camera + controls so all editor tools
         * continue to work with the new camera perspective.
         * @param {THREE.Camera} camObj
         */
        setActiveCamera(camObj) {
            if (!camObj || !camObj.isCamera) return false;
            const panel = this.panels.get(this.activePanelId);
            if (!panel) return false;
            if (panel.type === 'game') {
                window._gameRenderCamera = camObj;
                window._gameCameraActive = true;
                return true;
            }
            if (panel.isPrimary) {
                console.warn('[SMViewportSystem] Primary editor camera is owned by CameraSystem and cannot be replaced by setActiveCamera().');
                return false;
            }
            if (camObj.isOrthographicCamera) {
                panel._orthographicCamera = camObj;
                panel.viewMode = 'orthographic';
            } else {
                panel._perspectiveCamera = camObj;
                panel.viewMode = 'perspective';
            }
            if (window.controls) {
                window.controls.object = camObj;
                window.controls.update();
            }
            if (window.transformControls) {
                window.transformControls.camera = camObj;
                window.transformControls.update?.();
            }
            return true;
        }
    }

    window.SMViewportSystem = new SMViewportSystem();

})();