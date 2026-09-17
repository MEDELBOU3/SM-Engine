// engine/environment/sun/SMSunViewportBridge.js
// Connects the Sun system to editor selection, hierarchy and engine lifecycle.
(function () {
    'use strict';

    class SMSunViewportBridge {
        constructor() {
            this.initialized = false;
            this.lastSelection = null;
            this._frameCallback = null;
        }

        get selectedObject() {
            return (
                window.selectedObject ||
                window.currentSelectedObject ||
                window.selectionManager
                    ?.selectedObject ||
                window.SelectionManager
                    ?.selectedObject ||
                null
            );
        }

        async init() {
            if (this.initialized) {
                this.syncSelection();
                return true;
            }

            const controller =
                window.smSunController;

            if (!controller) {
                return false;
            }

            const ready =
                await controller.init();

            if (!ready) {
                return false;
            }

            window.smSunTimeOfDay
                ?.init?.(
                    controller
                );

            window.smSunEnvironmentBridge
                ?.init?.();

            window.smSunGizmo
                ?.init?.(
                    controller
                );

            window.smSunEffectsBridge
                ?.init?.(
                    controller
                );

            this._bindSelectionEvents();
            this._installFrameCheck();

            /*
             * Apply a readable default time only when no persisted Sun Rig
             * state exists.
             */
            if (
                !localStorage.getItem(
                    'sm_sun_rig_state'
                )
            ) {
                window.smSunTimeOfDay
                    ?.setTime?.(
                        14.0
                    );
            }

            this.syncSelection();

            // The controller becomes ready after the workspace may already
            // have applied its mode. Run one final authoritative pass so an
            // old/default Sun state cannot overwrite the calibrated rig.
            const activeMode = String(
                window.workspaceManager?.currentMode ||
                localStorage.getItem('sm_workspace_mode') ||
                'FILM'
            ).toUpperCase();
            window.smWorkspaceEnvironmentAdapter
                ?.apply?.(activeMode, window.scene);

            this.initialized =
                true;

            window.dispatchEvent(
                new CustomEvent(
                    'sm:sun-system-ready',
                    {
                        detail: {
                            controller,
                            time:
                                window.smSunTimeOfDay,
                            gizmo:
                                window.smSunGizmo,
                            environment:
                                window.smSunEnvironmentBridge,

                            effects:
                                window.smSunEffectsBridge,

                            glare:
                                window.smSunGlare,

                            lensFlare:
                                window.smSunLensFlare,

                            occlusion:
                                window.smSunOcclusion
                        }
                    }
                )
            );

            console.log(
                '✅ SM Sun Rig Pro ready'
            );

            return true;
        }

        _bindSelectionEvents() {
            [
                'selectionChanged',
                'objectSelected',
                'sm:selection-changed',
                'sm:object-selected'
            ].forEach(
                eventName => {
                    window.addEventListener(
                        eventName,
                        event => {
                            const object =
                                event.detail
                                    ?.object ||
                                event.detail
                                    ?.activeObject ||
                                event.detail
                                    ?.selectedObject ||
                                event.detail
                                    ?.selected ||
                                this
                                    .selectedObject;

                            this.syncSelection(
                                object
                            );
                        }
                    );
                }
            );

            window.addEventListener(
                'sm:pie-start',
                () => {
                    window.smSunGizmo
                        ?.setVisible?.(
                            false
                        );
                }
            );

            window.addEventListener(
                'sm:pie-stop',
                () => {
                    setTimeout(
                        () =>
                            this.syncSelection(),
                        0
                    );
                }
            );
        }

        _installFrameCheck() {
            if (this._frameCallback) {
                return;
            }

            let frameCounter = 0;

            const callback = () => {
                frameCounter += 1;

                // Very cheap fallback for selection systems that emit no event.
                if (
                    frameCounter %
                        12 !==
                    0
                ) {
                    return;
                }

                const selected =
                    this.selectedObject;

                if (
                    selected !==
                    this.lastSelection
                ) {
                    this.syncSelection(
                        selected
                    );
                }
            };

            this._frameCallback =
                callback;

            if (
                Array.isArray(
                    window.engineFrameCallbacks
                )
            ) {
                window.engineFrameCallbacks
                    .push(
                        callback
                    );
                return;
            }

            const raf = () => {
                callback();
                requestAnimationFrame(
                    raf
                );
            };

            requestAnimationFrame(
                raf
            );
        }

        syncSelection(
            object =
                this.selectedObject
        ) {
            this.lastSelection =
                object ||
                null;

            window.smSunGizmo
                ?.syncSelection?.(
                    object
                );

            return object;
        }

        selectSunRig() {
            const controller =
                window.smSunController;

            const object =
                controller?.rigProxy ||
                controller?.light;

            if (!object) {
                return false;
            }

            window.selectedObject =
                object;

            window.currentSelectedObject =
                object;

            try {
                window.selectionManager
                    ?.select?.(
                        object
                    );
            } catch (_) {}

            try {
                window.SelectionManager
                    ?.select?.(
                        object
                    );
            } catch (_) {}

            window.hierarchyManager
                ?.renderAll?.();

            window.updateHierarchy?.();

            this.syncSelection(
                object
            );

            return true;
        }

        setTime(value) {
            return window
                .smSunTimeOfDay
                ?.setTime?.(
                    value
                );
        }

        applyPreset(name) {
            return window
                .SMSunPresets
                ?.apply?.(
                    name
                );
        }

        debug() {
            window.smSunController
                ?.debug?.();

            console.table({
                'Time':
                    window.smSunTimeOfDay
                        ?.formatTime?.() ||
                    'n/a',

                'Period':
                    window.smSunTimeOfDay
                        ?.getPeriodName?.() ||
                    'n/a',

                'Cycle playing':
                    window.smSunTimeOfDay
                        ?.playing ||
                    false,

                'Gizmo visible':
                    window.smSunGizmo
                        ?.visible ||
                    false,

                'HDRI rotation sync':
                    window.smSunEnvironmentBridge
                        ?.options
                        ?.syncHDRIRotation ||
                    false,

                'Sun glare':
                    window.smSunGlare
                        ?.options
                        ?.enabled !== false,

                'Lens flare':
                    window.smSunLensFlare
                        ?.options
                        ?.enabled !== false,

                'Sun effects visible':
                    window.smSunEffectsBridge
                        ?.getState?.()
                        ?.visible ||
                    false,

                'Sun occluded':
                    window.smSunOcclusion
                        ?.blocked ||
                    false
            });

            window.smSunEffectsBridge
                ?.debug?.();
        }
    }

    window.SMSunViewportBridge =
        SMSunViewportBridge;

    window.smSunViewportBridge =
        window.smSunViewportBridge ||
        new SMSunViewportBridge();

    const boot = () => {
        const tryInit = async () => {
            const ready =
                await window
                    .smSunViewportBridge
                    ?.init?.();

            if (!ready) {
                setTimeout(
                    tryInit,
                    120
                );
            }
        };

        tryInit();
    };

    if (
        document.readyState ===
        'loading'
    ) {
        document.addEventListener(
            'DOMContentLoaded',
            boot,
            {
                once: true
            }
        );
    } else {
        boot();
    }
})();
