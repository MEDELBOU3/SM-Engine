// engine/camera/SMCameraViewportBridge.js
// Connects the professional CameraSystem with the rest of the editor.
(function () {
    'use strict';

    class SMCameraViewportBridge {
        constructor() {
            this.system = null;
            this.initialized = false;
        }

        init(
            system =
                window.cameraSystem ||
                null
        ) {
            if (!system) {
                return false;
            }

            this.system =
                system;

            // selection-viewport-utils installs the per-document axis handler
            // before this bridge. Preserve it: CameraSystem owns only the
            // primary editor camera, while Viewport 2/3 have their own cameras.
            this.viewportAxisHandler =
                this.viewportAxisHandler ||
                window.setCameraView ||
                null;

            window.smCameraInputBridge
                ?.init?.(
                    system
                );

            this._installLegacyGlobals();

            this.initialized =
                true;

            return true;
        }

        _installLegacyGlobals() {
            const system =
                this.system;

            /*
             * Preserve old axis UI buttons.
             */
            const normalizeAxis = value => {
                const key =
                    String(value || '')
                        .trim()
                        .toLowerCase();

                const aliases = {
                    right: 'x',
                    left: '-x',
                    top: 'y',
                    bottom: '-y',
                    front: 'z',
                    back: '-z',

                    '+x': 'x',
                    '+y': 'y',
                    '+z': 'z'
                };

                return aliases[key] || key;
            };

            window.setCameraView = axis => {
                const activePanel =
                    window.SMViewportSystem?.getActivePanel?.() ||
                    null;
                if (
                    activePanel?.type === 'viewport' &&
                    activePanel.isPrimary !== true
                ) {
                    // Never route a secondary tab through CameraSystem. Doing
                    // that made the gizmo move the hidden primary camera while
                    // OrbitControls kept rendering the secondary one.
                    return this.viewportAxisHandler?.(axis) || false;
                }
                const normalizedAxis = normalizeAxis(axis);
                const previousCamera = system.activeCamera;
                const target =
                    system.controls?.target?.clone?.() ||
                    new THREE.Vector3();
                const distance = Math.max(
                    1,
                    previousCamera?.position?.distanceTo?.(target) || 15
                );
                const applied = system.setAxisView(normalizedAxis, {
                    orthographic: true,
                    distance,
                    target,
                    animate: false
                });

                if (!applied) return false;

                /*
                 * This bridge is loaded after the original viewport utility,
                 * so it replaces window.setCameraView. Keep its direct gizmo
                 * path fully equivalent: in GAME_DEV the old bridge changed
                 * CameraSystem state but skipped the bindings consumed by the
                 * active viewport/render path until a projection toggle forced
                 * them to refresh.
                 */
                const activeCamera = system.activeCamera;
                window.SMViewportSystem?.syncPrimaryCameraMode?.(
                    'orthographic',
                    { render: false, preserveAxisGizmo: true }
                );
                window.syncActiveViewportCameraBindings?.();
                window.syncViewportComposerCamera?.(activeCamera);
                window.updateTransformControlsForActiveView?.();

                if (activeCamera) {
                    window.camera = activeCamera;
                    window.activeCamera = activeCamera;
                }

                window.dispatchEvent(new CustomEvent('sm:axis-view-changed', {
                    detail: {
                        axis: normalizedAxis,
                        mode: 'orthographic',
                        camera: activeCamera,
                        target: target.clone()
                    }
                }));
                window.updateAxisGizmo?.();
                return true;
            };

            window.setCameraAxisView =
                window.setCameraView;

            window.unlockCameraAxisView =
                () =>
                    system.unlockAxisView({
                        switchToPerspective:
                            true,
                        preserveView:
                            true
                    });

            window.resetCameraView =
                () =>
                    system.unlockAxisView({
                        switchToPerspective:
                            true,
                        preserveView:
                            true
                    });

            window.switchToPerspective =
                options =>
                    system
                        .switchToPerspective(
                            options ||
                            {}
                        );

            window.switchToOrthographic =
                options =>
                    system
                        .switchToOrthographic(
                            options ||
                            {}
                        );

            window.getActiveEditorCamera =
                () =>
                    system.activeCamera;

            window.syncActiveEditorCamera =
                () =>
                    system._syncActiveCameraGlobals?.();

            window.frameSelectedObject =
                () =>
                    system.frameSelection({
                        animate: true,
                        duration: 0.35
                    });

            /*
             * Professional possession API.
             * Existing camera-objects.js can call this instead of manually
             * rebinding OrbitControls.
             */
            window.possessCamera =
                camera => {
                    if (
                        system.pilotedCamera ===
                        camera
                    ) {
                        return system
                            .releasePilotedCamera();
                    }

                    return system
                        .pilotCamera(
                            camera
                        );
                };
        }

        applyWorkspaceProfile(
            mode
        ) {
            const key =
                String(
                    mode ||
                    'FILM'
                ).toUpperCase();

            if (
                key ===
                    'FILM'
            ) {
                return this.system
                    .setNavigationProfile(
                        'cinematic'
                    );
            }

            if (
                key ===
                    'GAME_DEV' ||
                key ===
                    'TERRAIN'
            ) {
                return this.system
                    .setNavigationProfile(
                        'modeling'
                    );
            }

            return this.system
                .setNavigationProfile(
                    'default'
                );
        }
    }

    window.SMCameraViewportBridge =
        SMCameraViewportBridge;

    window.smCameraViewportBridge =
        window.smCameraViewportBridge ||
        new SMCameraViewportBridge();

    [
        'sm:workspace-mode-changed',
        'sm:workspace-manager-mode-applied'
    ].forEach(
        eventName => {
            window.addEventListener(
                eventName,
                event => {
                    const mode =
                        event.detail
                            ?.mode;

                    if (mode) {
                        window
                            .smCameraViewportBridge
                            ?.applyWorkspaceProfile?.(
                                mode
                            );
                    }
                }
            );
        }
    );
})();
