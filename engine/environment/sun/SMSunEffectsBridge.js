// engine/environment/sun/SMSunEffectsBridge.js
// SM Engine — Sun camera-effects coordinator.
//
// Pipeline:
//
// SMSunController
//      ↓
// virtual directional sun position
//      ↓
// active camera projection
//      ↓
// facing + viewport edge + horizon
//      ↓
// SMSunOcclusion
//      ↓
// SMSunGlare + SMSunLensFlare
//
// No procedural sky dependency.
(function () {
    'use strict';

    const DEFAULTS = {
    enabled: true,
    virtualSunDistance: 2500,

    // Wide cinematic activation angle b7al UE5
    facingStart: 0.40,  // kaybda l-flare yban wnta 3ad kat-dor jiht chams
    facingFull: 0.92,   // qowwa kamla fach katkon camera direct مقابلaha

    edgeFadeStart: 0.80,
    edgeFadeEnd: 1.15,

    horizonFadeStart: -1.5,
    horizonFadeEnd: 3.5,

    glareStrength: 1.15,
    lensFlareStrength: 0.95,
    maxIntensity: 1.0,
    occlusionEnabled: true,
    viewportRectRefreshFrames: 10
};

    function clamp01(value) {
        return Math.min(
            1,
            Math.max(
                0,
                Number(value) || 0
            )
        );
    }

    function smoothstep(
        edge0,
        edge1,
        value
    ) {
        if (
            Math.abs(
                edge1 -
                edge0
            ) <
            1e-6
        ) {
            return value >= edge1
                ? 1
                : 0;
        }

        const t =
            clamp01(
                (
                    value -
                    edge0
                ) /
                (
                    edge1 -
                    edge0
                )
            );

        return (
            t *
            t *
            (
                3 -
                2 *
                t
            )
        );
    }

    class SMSunEffectsBridge {
        constructor(options = {}) {
            this.options = {
                ...DEFAULTS,
                ...options
            };

            this.controller = null;

            this.initialized = false;
            this.running = false;

            this._frame = 0;
            this._frameCallback = null;
            this._lastTime =
                performance.now();

            this._viewportRect = null;
            this._lastCamera = null;

            this._tmpForward =
                new THREE.Vector3();

            this._tmpDirection =
                new THREE.Vector3();

            this._tmpVirtualSun =
                new THREE.Vector3();

            this._tmpProjected =
                new THREE.Vector3();

            this._lastState = {
                visible: false,
                intensity: 0,
                facing: 0,
                edge: 0,
                horizon: 0,
                occlusion: 1,
                x: 0,
                y: 0
            };
        }

        get camera() {
            /*
             * IMPORTANT:
             * CameraSystem keeps owning the EDITOR camera during PIE. The game
             * renderer, however, renders through _gameRenderCamera/gameCamera.
             * Using cameraSystem.activeCamera here makes the flare appear only
             * where the editor camera was looking before Play and then look
             * "stuck" while the player camera moves.
             */
            const pieActive =
                window.__smPIEMode === 'play' ||
                window.__smGameRunning === true ||
                window._gameCameraActive === true;

            if (pieActive) {
                return (
                    window._gameRenderCamera ||
                    window.gameCamera ||
                    window.SMGameCameraManager
                        ?.getActiveCamera?.() ||
                    window.playerSystem
                        ?.playerCamera ||
                    window.playerSystem
                        ?.camera ||
                    null
                );
            }

            /*
             * Outside PIE, prefer the camera of the focused viewport document.
             * This also keeps Sun FX correct in secondary/editor viewport tabs.
             */
            return (
                window.SMViewportSystem
                    ?.getActivePanel?.()
                    ?.camera ||
                window.cameraSystem
                    ?.activeCamera ||
                window.activeCamera ||
                window.camera ||
                null
            );
        }

        get canvas() {
            return (
                window.renderer
                    ?.domElement ||
                null
            );
        }

        get glare() {
            return (
                window.smSunGlare ||
                null
            );
        }

        get lensFlare() {
            return (
                window.smSunLensFlare ||
                null
            );
        }

        get occlusion() {
            return (
                window.smSunOcclusion ||
                null
            );
        }

        init(
            controller =
                window.smSunController
        ) {
            if (this.initialized) {
                this.controller =
                    controller ||
                    this.controller;

                this.start();

                return true;
            }

            if (!controller) {
                return false;
            }

            this.controller =
                controller;

            this.glare?.init?.();
            this.lensFlare?.init?.();

            this.occlusion?.init?.({
                scene:
                    window.scene,
                controller
            });

            this.occlusion?.setEnabled?.(
                this.options
                    .occlusionEnabled
            );

            this.glare?.setStrength?.(
                this.options
                    .glareStrength
            );

            this.lensFlare?.setStrength?.(
                this.options
                    .lensFlareStrength
            );

            window.addEventListener(
                'resize',
                () => {
                    this._viewportRect =
                        null;
                }
            );

            window.addEventListener(
                'sm:camera-view-changed',
                () => {
                    this._viewportRect =
                        null;
                }
            );

            /*
             * Game View changes both the active render camera and the canvas
             * layout. Drop cached screen-space state immediately so the first
             * PIE frame is projected with the real gameplay camera.
             */
            window.addEventListener(
                'sm:pie-start',
                () => {
                    this._viewportRect = null;
                    this._lastCamera = null;
                    this.hide();
                }
            );

            window.addEventListener(
                'sm:pie-stop',
                () => {
                    this._viewportRect = null;
                    this._lastCamera = null;
                    this.hide();
                }
            );

            window.addEventListener(
                'sm:scene-loaded',
                () => {
                    this.occlusion
                        ?.refreshCandidates?.(
                            true
                        );
                }
            );

            window.addEventListener(
                'sm:project-loaded',
                () => {
                    this.occlusion
                        ?.refreshCandidates?.(
                            true
                        );
                }
            );

            window.addEventListener(
                'sm:world-collision-changed',
                () => {
                    this.occlusion
                        ?.refreshCandidates?.(
                            true
                        );
                }
            );

            this.initialized = true;

            this.start();

            window.dispatchEvent(
                new CustomEvent(
                    'sm:sun-effects-ready',
                    {
                        detail: {
                            bridge: this,
                            glare:
                                this.glare,
                            lensFlare:
                                this.lensFlare,
                            occlusion:
                                this.occlusion
                        }
                    }
                )
            );

            return true;
        }

        start() {
            if (this.running) {
                return;
            }

            this.running = true;

            if (
                this._frameCallback
            ) {
                return;
            }

            const callback =
                delta => {
                    if (
                        !this.running
                    ) {
                        return;
                    }

                    const safeDelta =
                        Number.isFinite(
                            Number(delta)
                        )
                            ? Number(delta)
                            : 1 / 60;

                    this.update(
                        safeDelta
                    );
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

            const raf = now => {
                if (!this.running) {
                    requestAnimationFrame(
                        raf
                    );
                    return;
                }

                const delta =
                    Math.min(
                        0.05,
                        Math.max(
                            0,
                            (
                                now -
                                this._lastTime
                            ) /
                            1000
                        )
                    );

                this._lastTime =
                    now;

                callback(delta);

                requestAnimationFrame(
                    raf
                );
            };

            requestAnimationFrame(
                raf
            );
        }

        stop() {
            this.running = false;
            this.hide();
        }

        setEnabled(enabled) {
            this.options.enabled =
                !!enabled;

            if (!enabled) {
                this.hide();
            }

            return this.options.enabled;
        }

        setGlareStrength(value) {
            this.options.glareStrength =
                Math.max(
                    0,
                    Number(value) || 0
                );

            this.glare?.setStrength?.(
                this.options
                    .glareStrength
            );

            return this.options
                .glareStrength;
        }

        setLensFlareStrength(value) {
            this.options.lensFlareStrength =
                Math.max(
                    0,
                    Number(value) || 0
                );

            this.lensFlare?.setStrength?.(
                this.options
                    .lensFlareStrength
            );

            return this.options
                .lensFlareStrength;
        }

        setOcclusionEnabled(enabled) {
            this.options.occlusionEnabled =
                !!enabled;

            this.occlusion?.setEnabled?.(
                enabled
            );

            return this.options
                .occlusionEnabled;
        }

        _getViewportRect() {
            const canvas =
                this.canvas;

            if (!canvas) {
                return null;
            }

            const shouldRefresh =
                !this._viewportRect ||
                this._frame %
                    Math.max(
                        1,
                        this.options
                            .viewportRectRefreshFrames
                    ) ===
                    0;

            if (shouldRefresh) {
                this._viewportRect =
                    canvas
                        .getBoundingClientRect();
            }

            return this._viewportRect;
        }

        _sunDirection() {
            if (
                this.controller
                    ?.getSunDirection
            ) {
                return this.controller
                    .getSunDirection(
                        this._tmpDirection
                    );
            }

            if (
                this.controller
                    ?.directionFromAngles
            ) {
                this._tmpDirection
                    .copy(
                        this.controller
                            .directionFromAngles()
                    );

                return this._tmpDirection;
            }

            const light =
                this.controller
                    ?.light;

            const target =
                this.controller
                    ?.targetObject;

            if (
                light &&
                target
            ) {
                return this._tmpDirection
                    .copy(
                        light.position
                    )
                    .sub(
                        target.position
                    )
                    .normalize();
            }

            return null;
        }

        _projectSun(
            camera,
            direction,
            viewportRect
        ) {
            this._tmpVirtualSun
                .copy(
                    camera.position
                )
                .addScaledVector(
                    direction,
                    this.options
                        .virtualSunDistance
                );

            this._tmpProjected
                .copy(
                    this._tmpVirtualSun
                )
                .project(
                    camera
                );

            const ndc =
                this._tmpProjected;

            const x =
                viewportRect.left +
                (
                    ndc.x +
                    1
                ) *
                0.5 *
                viewportRect.width;

            const y =
                viewportRect.top +
                (
                    1 -
                    (
                        ndc.y +
                        1
                    ) *
                    0.5
                ) *
                viewportRect.height;

            return {
                x,
                y,
                ndcX:
                    ndc.x,
                ndcY:
                    ndc.y,
                ndcZ:
                    ndc.z
            };
        }

        update(delta = 1 / 60) {
            this._frame += 1;

            if (
                !this.options.enabled
            ) {
                this.hide();
                return false;
            }

            const camera =
                this.camera;

            /*
             * Gameplay cameras are commonly parented to a moving player rig.
             * The Sun FX callback can run before the renderer performs its own
             * matrix update, so update the camera hierarchy before projection.
             */
            if (camera) {
                if (camera !== this._lastCamera) {
                    this._lastCamera = camera;
                    this._viewportRect = null;
                    this.hide();
                }

                camera.updateWorldMatrix?.(
                    true,
                    false
                );

                camera.updateMatrixWorld?.(
                    true
                );
            }

            const viewportRect =
                this._getViewportRect();

            const direction =
                this._sunDirection();

            if (
                !camera ||
                !viewportRect ||
                !direction ||
                this.controller
                    ?.light
                    ?.visible ===
                    false ||
                (
                    this.controller
                        ?.intensity ??
                    this.controller
                        ?.light
                        ?.intensity ??
                    0
                ) <=
                    0.001
            ) {
                this.hide();
                return false;
            }

            camera.getWorldDirection(
                this._tmpForward
            );

            this._tmpForward
                .normalize();

            const facingDot =
                this._tmpForward
                    .dot(
                        direction
                    );

            const facing =
                smoothstep(
                    this.options
                        .facingStart,
                    this.options
                        .facingFull,
                    facingDot
                );

            if (
                facing <=
                0.0001
            ) {
                this.hide();

                this._lastState = {
                    ...this._lastState,
                    visible: false,
                    intensity: 0,
                    facing
                };

                return false;
            }

            const projected =
                this._projectSun(
                    camera,
                    direction,
                    viewportRect
                );

            /*
             * max(|x|, |y|) gives a cheap rectangular viewport-edge metric.
             */
            const edgeDistance =
                Math.max(
                    Math.abs(
                        projected.ndcX
                    ),
                    Math.abs(
                        projected.ndcY
                    )
                );

            const edge =
                1 -
                smoothstep(
                    this.options
                        .edgeFadeStart,
                    this.options
                        .edgeFadeEnd,
                    edgeDistance
                );

            const elevation =
                Number(
                    this.controller
                        ?.elevation ??
                    30
                );

            const horizon =
                smoothstep(
                    this.options
                        .horizonFadeStart,
                    this.options
                        .horizonFadeEnd,
                    elevation
                );

            const occlusionState =
                this.occlusion?.update?.(
                    camera,
                    direction,
                    delta
                ) ||
                {
                    visibility: 1,
                    blocked: false
                };

            const sunIntensity =
                Math.max(
                    0,
                    Number(
                        this.controller
                            ?.intensity ??
                        this.controller
                            ?.light
                            ?.intensity ??
                        1
                    ) ||
                    0
                );

            /*
             * Sun intensity contributes, but does NOT scale linearly forever.
             * This prevents a bright light value from creating a giant flare.
             */
            const lightFactor =
                clamp01(
                    Math.sqrt(
                        sunIntensity /
                        0.82
                    ) *
                    0.82
                );

            const finalIntensity =
                Math.min(
                    this.options
                        .maxIntensity,
                    facing *
                    edge *
                    horizon *
                    occlusionState
                        .visibility *
                    lightFactor
                );

            const onScreen =
                projected.ndcZ >=
                    -1.2 &&
                projected.ndcZ <=
                    1.2 &&
                projected.ndcX >=
                    -1.08 &&
                projected.ndcX <=
                    1.08 &&
                projected.ndcY >=
                    -1.08 &&
                projected.ndcY <=
                    1.08;

            if (
                !onScreen ||
                finalIntensity <=
                    0.002
            ) {
                this.hide();

                this._lastState = {
                    ...this._lastState,
                    visible: false,
                    intensity:
                        finalIntensity,
                    facing,
                    edge,
                    horizon,
                    occlusion:
                        occlusionState
                            .visibility
                };

                return false;
            }

            const minDimension =
                Math.max(
                    1,
                    Math.min(
                        viewportRect.width,
                        viewportRect.height
                    )
                );

            const scale =
                THREE.MathUtils.clamp(
                    minDimension /
                    900,
                    0.72,
                    1.55
                );

            const sunColor =
                this.controller
                    ?.light
                    ?.color ||
                new THREE.Color(
                    0xffd69a
                );

            this.glare?.update?.({
                x:
                    projected.x,
                y:
                    projected.y,
                intensity:
                    finalIntensity,
                color:
                    sunColor,
                scale,
                visible:
                    true
            });

            this.lensFlare?.update?.({
                x:
                    projected.x,
                y:
                    projected.y,
                intensity:
                    finalIntensity,
                color:
                    sunColor,
                viewportRect,
                scale,
                visible:
                    true
            });

            this._lastState = {
                visible: true,
                intensity:
                    finalIntensity,
                facing,
                facingDot,
                edge,
                horizon,
                occlusion:
                    occlusionState
                        .visibility,
                blocked:
                    occlusionState
                        .blocked,
                x:
                    projected.x,
                y:
                    projected.y,
                ndcX:
                    projected.ndcX,
                ndcY:
                    projected.ndcY
            };

            if (
                this._frame %
                    30 ===
                0
            ) {
                window.dispatchEvent(
                    new CustomEvent(
                        'sm:sun-camera-effects-updated',
                        {
                            detail: {
                                ...this._lastState
                            }
                        }
                    )
                );
            }

            return true;
        }

        hide() {
            this.glare?.hide?.();
            this.lensFlare?.hide?.();

            this._lastState.visible =
                false;
        }

        getState() {
            return {
                enabled:
                    this.options.enabled,
                glareStrength:
                    this.options
                        .glareStrength,
                lensFlareStrength:
                    this.options
                        .lensFlareStrength,
                occlusionEnabled:
                    this.options
                        .occlusionEnabled,
                ...this._lastState
            };
        }

        debug() {
            const state =
                this.getState();

            console.table({
                Enabled:
                    state.enabled,

                Visible:
                    state.visible,

                Intensity:
                    Number(
                        (
                            state.intensity ||
                            0
                        ).toFixed(3)
                    ),

                Facing:
                    Number(
                        (
                            state.facing ||
                            0
                        ).toFixed(3)
                    ),

                Edge:
                    Number(
                        (
                            state.edge ||
                            0
                        ).toFixed(3)
                    ),

                Horizon:
                    Number(
                        (
                            state.horizon ||
                            0
                        ).toFixed(3)
                    ),

                Occlusion:
                    Number(
                        (
                            state.occlusion ??
                            1
                        ).toFixed(3)
                    ),

                Blocked:
                    !!state.blocked,

                Camera:
                    this.camera
                        ?.name ||
                    this.camera
                        ?.type ||
                    'none'
            });

            this.occlusion
                ?.debug?.();

            return state;
        }
    }

    window.SMSunEffectsBridge =
        SMSunEffectsBridge;

    window.smSunEffectsBridge =
        window.smSunEffectsBridge ||
        new SMSunEffectsBridge();
})();