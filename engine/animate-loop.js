// SM ENGINE — CENTRAL RENDER AUTHORITY MIGRATION (FIXED)
// Main engine loop now routes primary scene draws through SMRenderer.

// ============================================================
// engine/animate-loop.js
//
// The per-frame render/update loop. Depends on 00-globals.js
// and is started once from index.js's init() (via animate()).
// ============================================================
// Keep the render loop alive when an optional editor subsystem throws during
// Play. A stale physics body or panel callback must not blank the WebGL canvas.
let smFrameErrorLogged = false;
let smCaptureFrameErrorLogged = false;
let smFXFrameErrorLogged = false;

function smWaterAwareRender(sceneArg, cameraArg) {
    const water = window.waterSystem;
    if (!water?.render || !sceneArg || !cameraArg) return false;
    try {
        return water.render(sceneArg, cameraArg) !== false;
    } catch (error) {
        if (!smFrameErrorLogged) {
            console.error('[SM Water] Underwater render failed; using normal render:', error);
        }
        return false;
    }
}

function smRenderUnderwaterFrame(sceneArg, cameraArg) {
    const water = window.waterSystem;
    if (!water?.isCameraUnderwater?.(cameraArg)) return false;
    return smWaterAwareRender(sceneArg, cameraArg);
}

// ============================================================
// CENTRAL RENDER AUTHORITY BRIDGE
// ============================================================
// SMRenderer owns modern scene rendering. During migration the old editor
// selection composer remains available only for Solid/Wireframe/LookDev so
// object outlines do not disappear. Rendered mode and gameplay use SMRenderer.
function smRenderViewportWithAuthority(
    sceneArg,
    cameraArg,
    options = {}
) {
    if (!sceneArg || !cameraArg || !renderer) {
        return false;
    }

    const shadingMode =
        window.SMViewportShading?.getMode?.() ||
        'solid';

    const isRenderedMode =
        shadingMode === 'rendered';

    const viewport = options.viewport || {
        x: 0,
        y: 0,
        width:
            renderer.domElement.clientWidth ||
            renderer.domElement.width ||
            1,
        height:
            renderer.domElement.clientHeight ||
            renderer.domElement.height ||
            1
    };

    const scissor =
        options.scissor === undefined
            ? viewport
            : options.scissor;

    // Transitional editor compatibility: the existing selection composer owns
    // outlines in non-Rendered editor modes. It is intentionally kept separate
    // from the new cinematic post-processing stack.
    if (
        options.allowSelectionComposer !== false &&
        !options.gameView &&
        !isRenderedMode &&
        window.__smSelectionComposer?.render
    ) {
        window.syncViewportComposerCamera?.(
            cameraArg
        );

        if (
            typeof selectionRenderPass !== 'undefined' &&
            selectionRenderPass
        ) {
            selectionRenderPass.camera =
                cameraArg;
        }

        if (window.outlinePass) {
            window.outlinePass.renderCamera =
                cameraArg;
        }

        try {
            window.__smSelectionComposer.render();
            return true;
        } catch (selectionComposerError) {
            if (!smFrameErrorLogged) {
                console.warn(
                    '[SM Rendering] Selection composer failed; using SMRenderer:',
                    selectionComposerError
                );
            }
        }
    }

    if (window.smRenderer?.renderFrame) {
        try {
            const renderMode =
                options.forceRaw === true
                    ? 'raw'
                    : (
                        options.allowPostProcess === false
                            ? 'raw'
                            : (
                                isRenderedMode ||
                                    options.gameView === true
                                    ? 'rendered'
                                    : 'raw'
                            )
                    );

            return window.smRenderer.renderFrame({
                camera: cameraArg,
                delta: options.delta ?? 0,
                time:
                    options.time ??
                    performance.now() * 0.001,
                viewport,
                scissor,
                workspaceMode:
                    options.workspaceMode,
                renderMode
            }) !== false;
        } catch (centralRenderError) {
            if (!smFrameErrorLogged) {
                console.warn(
                    '[SM Rendering] SMRenderer frame failed; using compatibility fallback:',
                    centralRenderError
                );
            }
        }
    }

    // Compatibility fallback while migration is incomplete.
    if (
        options.allowPostProcess !== false &&
        isRenderedMode &&
        window.smRender?.render
    ) {
        try {
            return window.smRender.render(
                cameraArg,
                options.delta ?? 0
            ) !== false;
        } catch { }
    }

    if (
        smRenderUnderwaterFrame(
            sceneArg,
            cameraArg
        )
    ) {
        return true;
    }

    renderer.render(
        sceneArg,
        cameraArg
    );

    return true;
}

window.smRenderViewportWithAuthority = smRenderViewportWithAuthority;

function smRenderPlayFallback() {
    if (!renderer || !scene) return;
    const canvas = renderer.domElement;
    const width = Math.max(1, canvas.clientWidth || canvas.width || 1);
    const height = Math.max(1, canvas.clientHeight || canvas.height || 1);
    const fallbackCamera =
        window._gameRenderCamera ||
        window.gameCamera ||
        window.SMGameCameraManager?.getActiveCamera?.() ||
        window.cameraSystem?.camera ||
        window.camera;
    if (!fallbackCamera) return;
    try {
        renderer.setRenderTarget?.(null);
        renderer.setViewport(0, 0, width, height);
        renderer.setScissorTest(false);
        renderer.autoClear = true;
        const fallbackMode = String(
            window.playerSystem?.workspaceMode ||
            window.workspaceManager?.currentMode ||
            ''
        ).toUpperCase();
        renderer.setClearColor(
            fallbackMode === 'GAMEPLAY_SAMPLE'
                ? 0x8177ad
                : fallbackMode === 'GAME_DEV'
                    ? 0x9fb6c8
                    : 0x393939,
            1
        );
        renderer.render(scene, fallbackCamera);
    } catch (fallbackError) {
        if (!smFrameErrorLogged) {
            console.error('[SM] Play fallback render failed:', fallbackError);
        }
    }
}

// ============================================================
// SM 2D GRAPH GRID — ADAPTIVE CAMERA SYNC
// ============================================================

function smUpdate2DGraphGrid(camera, viewport = null) {
    const grid =
        scene?.getObjectByName?.('gameModeGrid2D') ||
        window.gameModeGrid2D ||
        null;

    if (!grid || !camera) return;

    // Only operate on the 2D graph/canvas camera.
    const is2DCamera =
        camera === window.camera2D ||
        camera.userData?.is2DCamera === true ||
        camera.userData?.workspaceCamera === '2D' ||
        window.v2dManager?.camera === camera;

    if (!is2DCamera) return;

    try {
        const width = Math.max(
            1,
            viewport?.width ||
            renderer?.domElement?.clientWidth ||
            window.innerWidth
        );

        const height = Math.max(
            1,
            viewport?.height ||
            renderer?.domElement?.clientHeight ||
            window.innerHeight
        );

        if (typeof grid.updateGrid === 'function') {
            grid.updateGrid({
                camera,
                width,
                height
            });
        }
    } catch (error) {
        if (!window.__sm2DGridErrorLogged) {
            window.__sm2DGridErrorLogged = true;
            console.warn(
                '[SM 2D Grid] Adaptive grid update failed:',
                error
            );
        }
    }
}

function smRenderFrame(frameContext = null, options = {}) {
    if (!scene || !camera || !renderer || !clock) return;
    smFrameCounter++;
    smFramesSinceFpsUpdate++;
    // Keep THREE.Clock.elapsedTime advancing even when the clean viewport
    // supplies the authoritative frame timestamp and delta.
    const clockDelta = clock.getDelta();
    const rawDelta = Number.isFinite(frameContext?.rawDelta)
        ? frameContext.rawDelta
        : clockDelta;
    const delta = Number.isFinite(frameContext?.delta)
        ? frameContext.delta
        : Math.min(rawDelta, 0.033);
    const time = Number.isFinite(frameContext?.time)
        ? frameContext.time
        : clock.elapsedTime;
    const shouldRender = options.render !== false;
    if (window.engineFrameCallbacks) {
        window.engineFrameCallbacks.forEach(cb => {
            try {
                // Every live runtime callback needs the same frame delta.
                // In particular, Animation Graph was receiving `undefined`,
                // which becomes 0 and permanently kept its player in Idle.
                cb?.(delta, time);
            } catch (callbackError) {
                if (!smFrameErrorLogged) {
                    console.error('[SM] Frame callback failed:', callbackError);
                }
            }
        });
    }
    if (window.isOfflineRendering) return;
    let smWorkspaceMode = String(
        window.workspaceManager?.currentMode ||
        localStorage.getItem('sm_workspace_mode') ||
        window.playerSystem?.workspaceMode ||
        'FILM'
    ).toUpperCase();
    // Single source of truth for "are we in the 2D game workspace" this frame.
    // Previously this was re-derived ad hoc in a couple of places (and in one
    // spot referenced an out-of-scope `activeCam`, throwing every frame and
    // silently diverting rendering to the crude play fallback). Compute it
    // once here and reuse it below.
    const smIs2D =
        window.v2dManager?.is2D === true ||
        window.SM2DGameRuntime?.active === true ||
        (
            smWorkspaceMode === 'GAME_DEV' &&
            window.workspaceManager?._normalizeGameMode?.(
                window.workspaceManager.currentGameMode
            ) === '2D'
        );
    const smIsPlayerRuntimeObject = (obj) => {
        if (!obj) return false;
        if (obj.userData?.isPlayer) return true;
        if (obj.userData?.isPlayerRoot) return true;
        if (obj.userData?.isPlayerVisual) return true;
        if (obj.userData?.workspaceOnly === 'PLAYER') return true;
        let parent = obj.parent;
        while (parent) {
            if (
                parent.userData?.isPlayer ||
                parent.userData?.isPlayerRoot ||
                parent.userData?.isPlayerVisual ||
                parent.userData?.workspaceOnly === 'PLAYER'
            ) {
                return true;
            }
            parent = parent.parent;
        }
        return false;
    };
    if (window.cameraSystem) window.cameraSystem.update(delta);
    const naniteStats = naniteSystem ? naniteSystem.update() : null;
    if (typeof scriptManager !== 'undefined' && scriptManager) {
        scriptManager.update(delta, time);
    }
    if (
        typeof physicsEnabled !== 'undefined' &&
        physicsEnabled &&
        typeof updateHairPhysics === 'function'
    ) {
        updateHairPhysics();
    }
    const smTerrainPlayActive =
        smWorkspaceMode === 'TERRAIN' &&
        window.TerrainPlayerPlayBridge?.state?.playing === true;

    // Terrain Sculpting has its own lightweight PIE bridge and intentionally
    // does not switch the whole editor into GAME_DEV. Treat it as Play for
    // rendering/camera purposes without requiring PlayOrchestrator ownership.
    const smPIEMode =
        smTerrainPlayActive
            ? 'play'
            : (window.PlayOrchestrator?.mode || 'edit');

    const runtimeWorkspaceMode = String(
        window.playerSystem?.workspaceMode || ''
    ).toUpperCase();
    if (
        smPIEMode === 'play' &&
        smWorkspaceMode !== 'GAME_DEV' &&
        smWorkspaceMode !== 'GAMEPLAY_SAMPLE' &&
        (runtimeWorkspaceMode === 'GAME_DEV' ||
            runtimeWorkspaceMode === 'GAMEPLAY_SAMPLE')
    ) {
        smWorkspaceMode = runtimeWorkspaceMode;
    }
    if (
        physicsSystem &&
        physicsSystem.isReady &&
        smPIEMode === 'play'
    ) {
        try {
            physicsSystem.update(delta);
        } catch (physicsError) {
            // A stale Ammo body must not abort the editor render loop.
            physicsSystem.simulationRunning = false;
            console.error('[SM] Physics update failed; rendering continues:', physicsError);
        }
    }
    // A delayed workspace repair must never hide the runtime actor after Play
    // has possessed the camera. Keep the player visual and its mixer enabled
    // for the two workspaces that own gameplay, then let SMPlayerSystem handle
    // movement/input/animation state for the frame.
    if (
        smPIEMode === 'play' &&
        (
            smWorkspaceMode === 'GAME_DEV' ||
            smWorkspaceMode === 'GAMEPLAY_SAMPLE' ||
            smWorkspaceMode === 'TERRAIN'
        )
    ) {
        const runtimePlayer = window.playerSystem;
        if (runtimePlayer?.ready) {
            // Do not call setEnabled(true) every frame. In older builds that
            // could cascade into PlayerPhysics.refreshWorld(true) and create a
            // full collision rebuild loop.
            if (!runtimePlayer.enabled) {
                runtimePlayer.setEnabled?.(true);
            }

            if (runtimePlayer.character?.model?.visible === false) {
                runtimePlayer.character?.setVisible?.(true);
            }

            const shouldAnimate = !runtimePlayer.simulationPaused;
            if (runtimePlayer.animation?.enabled !== shouldAnimate) {
                runtimePlayer.animation?.setEnabled?.(shouldAnimate);
            }

            if (
                runtimePlayer.animation?.enabled &&
                !runtimePlayer.animation.currentAction
            ) {
                runtimePlayer.forceIdle?.();
            }
        }
    }
    try {
        window.playerSystem?.update?.(delta);
    } catch (playerError) {
        if (!smFrameErrorLogged) {
            console.error('[SM] Player update failed; render continues:', playerError);
        }
    }
    if (window.isModelingMode && typeof updateMeshGeometry === 'function') {
        updateMeshGeometry();
    }
    if (window.vegetationSystem) {
        window.vegetationSystem.updateWindUniforms(time);
    }
    try {
        window.captureSystem?.update?.();
        window.smUSBPhoneBridge?.update?.(delta);
        smCaptureFrameErrorLogged = false;
    } catch (captureError) {
        if (!smCaptureFrameErrorLogged) {
            smCaptureFrameErrorLogged = true;
            console.error('[SM Capture] Video texture update failed; rendering continues:', captureError);
        }
    }
    if (controls && !window._isInsideCamera) {
        controls.update();
    }

    // Gameplay Sample owns its own sky dome, sun direction, shadow focus and
    // FogExp2 atmosphere. Update it AFTER player + camera/controls so the sky
    // stays centered on the current camera and the shadow camera follows the
    // current runtime actor instead of lagging one frame behind.
    if (
        smWorkspaceMode === 'GAMEPLAY_SAMPLE' &&
        window.gameplaySampleEnvironment?.active
    ) {
        try {
            window.gameplaySampleEnvironment.update?.(delta);
        } catch (gameplayEnvironmentError) {
            if (!smFrameErrorLogged) {
                console.warn(
                    '[Gameplay Sample] Environment update warning:',
                    gameplayEnvironmentError
                );
            }
        }
    }

    if (window.rigManager && typeof window.rigManager.update === 'function') {
        try {
            window.rigManager.update(delta);
        } catch (e) {
            console.warn('[RigManager] Update warning:', e);
        }
    }
    window.waterSystem?.update(delta);
    const timelineOwnsPlayback = !!window.SMTimeline?.ownsPlayback;
    const timelineIsPlaying = !!window.isPlaying;
    const timelineNow = Number(window.currentTime || 0);
    if (!timelineOwnsPlayback && timelineIsPlaying) {
        window.currentTime = timelineNow + delta * Number(window.playbackSpeed || 1);
        if (window.loopEnabled) {
            const loopStartSeconds = Number(window.loopStart || 0) / 1000;
            const loopEndSeconds = Number(
                window.loopEnd ||
                (window.timelineDuration || 30) * 1000
            ) / 1000;
            if (window.currentTime >= loopEndSeconds) {
                window.currentTime =
                    loopStartSeconds +
                    (window.currentTime - loopEndSeconds);
            }
        } else {
            if (window.currentTime >= Number(window.timelineDuration || 30)) {
                if (typeof stopAnimation === 'function') {
                    stopAnimation();
                } else {
                    window.isPlaying = false;
                }
                return;
            }
        }
        updatePlayhead();
        scene.traverse(obj => {
            if (smIsPlayerRuntimeObject(obj)) {
                return;
            }
            const mixer = obj.userData?.mixer;
            if (!mixer) return;
            if (obj.userData?.ragdoll) return;
            const hasRootTimelineKeys =
                keyframes.has(obj.uuid) &&
                Object.keys(keyframes.get(obj.uuid)).length > 0;
            const hasBoneTimelineKeys =
                boneKeyframes.has(obj.uuid) &&
                Array.from(boneKeyframes.get(obj.uuid).values()).some(
                    map => Object.keys(map).length > 0
                );
            if (hasRootTimelineKeys || hasBoneTimelineKeys) {
                if (typeof sampleTimelineMixerAtTime === 'function') {
                    sampleTimelineMixerAtTime(
                        obj,
                        window.currentTime
                    );
                } else {
                    const sampleTime =
                        typeof getClampedTimelineSampleTime === 'function'
                            ? getClampedTimelineSampleTime(
                                obj,
                                window.currentTime
                            )
                            : window.currentTime;
                    mixer.setTime(sampleTime);
                    mixer.update(0);
                }
            } else {
                mixer.update(
                    delta * Number(window.playbackSpeed || 1)
                );
            }
        });
        updateSceneFromTimeline();
    } else if (typeof scene !== 'undefined' && scene) {
        scene.traverse(obj => {
            if (smIsPlayerRuntimeObject(obj)) {
                return;
            }
            if (obj.userData?.mixer) {
                if (obj.userData?.ragdoll) return;
                if (typeof sampleTimelineMixerAtTime === 'function') {
                    sampleTimelineMixerAtTime(
                        obj,
                        timelineNow
                    );
                } else {
                    const sampleTime =
                        typeof getClampedTimelineSampleTime === 'function'
                            ? getClampedTimelineSampleTime(
                                obj,
                                timelineNow
                            )
                            : timelineNow;
                    obj.userData.mixer.setTime(sampleTime);
                    obj.userData.mixer.update(0);
                }
            }
        });
        if (
            timelineOwnsPlayback &&
            timelineIsPlaying &&
            typeof updateSceneFromTimeline === 'function'
        ) {
            updateSceneFromTimeline();
        }
    }
    if (typeof updateAnimationDetection === 'function') {
        updateAnimationDetection(delta);
    }
    if (window.ragdollSystem) {
        try {
            window.ragdollSystem.update();
        } catch (e) {
            console.warn('[Ragdoll] Update warning:', e);
        }
    }
    if (window.pathAnimator) {
        window.pathAnimator.update(delta);
    }
    // ============================================================
    // SM FX RUNTIME
    // Snow / Explosions / Generic Particle Emitters
    //
    // FX is real-time editor simulation and must NOT depend on the
    // timeline play state. The central FX manager distributes this
    // frame delta to SnowSystem, ExplosionSystem and ParticleSystem.
    // ============================================================
    try {
        window.SMFX?.update?.(delta);

        // Lightweight panel statistics/state refresh only.
        // This does NOT run another simulation loop.
        window.SMFXParticlesPanel?.update?.();

        smFXFrameErrorLogged = false;
    } catch (fxError) {
        if (!smFXFrameErrorLogged) {
            smFXFrameErrorLogged = true;
            console.error(
                '[SM FX] Frame update failed; FX simulation paused for this frame:',
                fxError
            );
        }
    }
    if (window.animatedMaterials) {
        const globalTime = performance.now() * 0.001;
        window.animatedMaterials.forEach(uniforms => {
            if (uniforms.uGlobalTime) {
                uniforms.uGlobalTime.value = globalTime;
            }
        });
    }
    const smSkyAllowed =
        smWorkspaceMode === 'GAME_DEV' ||
        smWorkspaceMode === 'TERRAIN';
    if (window.skyLightingSystem && smSkyAllowed) {
        if (
            !window.__sm2DWhiteViewport &&
            scene.background?.isColor
        ) {
            scene.background = null;
        }
        const activePlayerPosition =
            window.playerSystem?.model?.position ||
            window.playerSystem?.character?.model?.position ||
            null;
        window.skyLightingSystem.update(
            delta,
            activePlayerPosition
        );
    } else if (window.skyLightingSystem && !smSkyAllowed) {
        window.skyLightingSystem.setVisible?.(false);
        if (smWorkspaceMode === 'FILM') {
            const architecturePlanColor = window.__smArchitecturePlanMode === true
                ? (Number(window.__smArchitecturePlanColor) || 0x080a0d)
                : 0x393939;
            if (!scene.background?.isColor) {
                scene.background = new THREE.Color(architecturePlanColor);
            } else {
                scene.background.setHex(architecturePlanColor);
            }
            scene.fog = null;
        } else if (smWorkspaceMode === 'GAMEPLAY_SAMPLE') {
            const gameplayEnv = window.gameplaySampleEnvironment;
            const projectOwnsWorld =
                window.SMGameProjectRuntime?.replacesGameplaySampleWorld === true &&
                !!window.SMGameProjectRuntime?.activeProject;

            if (projectOwnsWorld) {
                // A loaded Game Project owns its serialized background/fog.
                // Never replace them with the purple sample fallback per frame.
                if (!scene.background?.isColor) {
                    scene.background = new THREE.Color(0x071426);
                }
                if (!scene.fog) {
                    scene.fog = new THREE.Fog(0x0b2138, 35, 115);
                }
            } else if (gameplayEnv?.active) {
                // The Gameplay Sample SkyDome is the visible background.
                // Never replace it every frame with a flat scene.background;
                // doing so exposes the dome boundary as a bright moving disc.
                scene.background = null;

                // The Gameplay Sample owns FogExp2. WorkspaceManager / this
                // loop must not replace it with THREE.Fog linear fog.
                const fogColor = new THREE.Color(
                    gameplayEnv.CONFIG?.horizonFogColor || '#9f92ca'
                );
                const fogDensity =
                    gameplayEnv.CONFIG?.fogDensity ?? 0.028;

                if (!(scene.fog instanceof THREE.FogExp2)) {
                    scene.fog = new THREE.FogExp2(
                        fogColor,
                        fogDensity
                    );
                } else {
                    scene.fog.color.copy(fogColor);
                    scene.fog.density = fogDensity;
                }
            } else {
                // Safe startup fallback while the Gameplay Sample environment
                // is not active yet. Keep it compatible with the same palette
                // and fog model so activation does not visibly pop.
                if (!scene.background?.isColor) {
                    scene.background = new THREE.Color(0x9f92ca);
                } else {
                    scene.background.setHex(0x9f92ca);
                }

                if (!(scene.fog instanceof THREE.FogExp2)) {
                    scene.fog = new THREE.FogExp2(
                        0x9f92ca,
                        0.028
                    );
                } else {
                    scene.fog.color.setHex(0x9f92ca);
                    scene.fog.density = 0.028;
                }
            }
        }
    } else if (
        scene.fog &&
        scene.background?.isColor
    ) {
        scene.fog.color.copy(
            scene.background
        );
    }
    if (window.lumenSystem) {
        window.lumenSystem.update(delta);
    }
    if (window.nodeEditor) {
        window.nodeEditor.update(delta);
    }
    if (window.materialSettings?.enableTextureAnimation) {
        window.materialSettings.updateMaterialAnimation();
    }
    if (horseController && horseController.horse) {
        horseController.update(delta);
    }
    if (
        typeof modifierManager !== 'undefined' &&
        modifierManager?.update
    ) {
        modifierManager.update(currentTime);
    }
    scene.traverse(object => {
        if (typeof object.animate === 'function') {
            object.animate();
        }
    });
    if (typeof updateAxisGizmo === 'function') {
        updateAxisGizmo();
    }
    // ============================================================
    // SM 2D ADAPTIVE GRAPH GRID
    // Rebuilds only when orthographic zoom changes enough.
    // ============================================================

    if (
        smWorkspaceMode === 'GAME_DEV' &&
        window._normalizeGameMode?.(
            window.currentGameMode
        ) === '2D'
    ) {
        const graphGrid =
            scene.getObjectByName('gameModeGrid2D');

        if (
            graphGrid &&
            window.SM2DGraphGrid?.update
        ) {
            const gridCamera =
                smIs2D
                    ? (
                        window.cameraSystem?.orthographicCamera ||
                        window.orthographicCamera ||
                        camera
                    )
                    : typeof window.getSMActiveRenderCamera === 'function'
                    ? window.getSMActiveRenderCamera()
                    : (
                        window._isInsideCamera &&
                            window._viewedCamera
                            ? window._viewedCamera
                            : camera
                    );

            const canvas =
                renderer?.domElement;

            window.SM2DGraphGrid.update(
                graphGrid,
                gridCamera,
                canvas?.clientWidth || window.innerWidth,
                canvas?.clientHeight || window.innerHeight
            );
        }
    }
    if (typeof recordSceneData === 'function') {
        recordSceneData();
    }
    if (
        typeof isGraphView !== 'undefined' &&
        isGraphView &&
        typeof renderGraph === 'function'
    ) {
        renderGraph();
    }
    if (
        window.advancedAnimator?.isOpen &&
        window.advancedAnimator.animRenderer
    ) {
        window.advancedAnimator.animRenderer.render(
            window.advancedAnimator.animScene,
            window.advancedAnimator.animCamera
        );
    }
    if (
        typeof isMinimapVisible !== 'undefined' &&
        isMinimapVisible &&
        typeof minimapContainer !== 'undefined' &&
        typeof minimapCamera !== 'undefined' &&
        minimapCamera
    ) {
        renderer.autoClear = false;
        renderer.clearDepth();
        const rect = minimapContainer.getBoundingClientRect();
        const width = rect.right - rect.left;
        const height = rect.bottom - rect.top;
        const left = rect.left;
        const bottom =
            renderer.domElement.clientHeight -
            rect.bottom;
        renderer.setViewport(
            left,
            bottom,
            width,
            height
        );
        renderer.setScissor(
            left,
            bottom,
            width,
            height
        );
        renderer.setScissorTest(true);
        renderer.render(
            scene,
            minimapCamera
        );
        renderer.autoClear = true;
    }
    const renderWidth =
        mainRendererContainer?.clientWidth ||
        window.innerWidth;
    const renderHeight =
        mainRendererContainer?.clientHeight ||
        window.innerHeight;
    const expectedBufferWidth = Math.floor(
        renderWidth * renderer.getPixelRatio()
    );
    const expectedBufferHeight = Math.floor(
        renderHeight * renderer.getPixelRatio()
    );
    if (
        renderer.domElement.width !== expectedBufferWidth ||
        renderer.domElement.height !== expectedBufferHeight
    ) {
        renderer.setSize(
            renderWidth,
            renderHeight,
            false
        );
        if (window.composer?.setSize) {
            window.composer.setSize(
                renderWidth,
                renderHeight
            );
        }

        window.__smSelectionComposer?.setSize?.(
            renderWidth,
            renderHeight
        );

        window.smPostProcessStack?.setSize?.(
            renderWidth,
            renderHeight
        );
    }
    renderer.setViewport(
        0,
        0,
        renderWidth,
        renderHeight
    );
    renderer.setScissor(
        0,
        0,
        renderWidth,
        renderHeight
    );
    renderer.setScissorTest(false);
    renderer.autoClear = true;
    scene.traverse(obj => {
        if (!obj.isCamera || obj === camera) return;
        if (
            obj.helper &&
            typeof obj.helper.update === 'function'
        ) {
            obj.helper.update();
        }
        if (
            obj.userData.mode === 'cinematic' &&
            obj.userData.lookAtTarget
        ) {
            const targetPos = new THREE.Vector3();
            obj.userData.lookAtTarget.getWorldPosition(
                targetPos
            );
            obj.lookAt(targetPos);
        }
    });
    window.workspaceManager?.enforceWorkspaceVisibility?.(
        smWorkspaceMode,
        scene
    );
    // Play can race the delayed workspace repair that follows a Terrain
    // transition. If that race leaves every mesh hidden, repair the active
    // gameplay environment before rendering instead of presenting a blank
    // Game View. This check is cheap (and only calls the repair path when the
    // scene is actually empty).
    if (
        smPIEMode === 'play' &&
        (smWorkspaceMode === 'GAME_DEV' ||
            smWorkspaceMode === 'GAMEPLAY_SAMPLE')
    ) {
        let hasVisibleMesh = false;
        scene.traverse(object => {
            if (hasVisibleMesh || !object?.isMesh || object.visible === false) {
                return;
            }
            if (
                object.userData?.workspaceOnly === 'PLAYER' ||
                object.userData?.isPlayer ||
                object.userData?.isPlayerVisual
            ) {
                return;
            }
            let parent = object.parent;
            while (parent && parent !== scene) {
                if (parent.visible === false) return;
                parent = parent.parent;
            }
            hasVisibleMesh = true;
        });
        if (!hasVisibleMesh) {
            if (smWorkspaceMode === 'GAMEPLAY_SAMPLE') {
                // This is an exceptional repair path. activate() can happen
                // after the normal per-frame environment update above, so run
                // one immediate synchronization before rendering the repaired
                // scene.
                const projectOwnsWorld =
                    window.SMGameProjectRuntime?.replacesGameplaySampleWorld === true &&
                    !!window.SMGameProjectRuntime?.activeProject;
                if (!projectOwnsWorld) {
                    window.gameplaySampleEnvironment?.activate?.();
                    window.gameplaySampleEnvironment?.update?.(delta);
                }
            } else {
                window.ensureGameDevelopmentEnvironment?.(scene);
                window.SMUE5Environment?.show?.();
                window.SMUE5Environment?.syncVisibility?.('GAME_DEV');
            }
            window.workspaceManager?.enforceWorkspaceVisibility?.(
                smWorkspaceMode,
                scene
            );
            scene.updateMatrixWorld?.(true);
            if (!window.__smEmptyGameplayRepairLogged) {
                window.__smEmptyGameplayRepairLogged = true;
                console.warn('[PIE] Repaired an empty gameplay scene before render:', smWorkspaceMode);
            }
        }
    }
    // ==========================================
    // SM ENGINE OPTIMIZATION
    // Run after workspace visibility has been enforced so view-dependent
    // culling is not overwritten before the frame is rendered.
    // ==========================================
    const smPerformanceManager =
        window.performanceManager ||
        (typeof performanceManager !== 'undefined' ? performanceManager : null);
    if (smPerformanceManager) {
        try {
            const smViewportPanels =
                window.SMViewportSystem?.panels?.size > 0
                    ? Array.from(window.SMViewportSystem.panels.values()).filter(
                        panel => panel?.camera && panel?.dom
                    )
                    : [];
            const smSplitPaneCount =
                window.sceneSplitViewManager?.activeMode !== 'none' &&
                    window.sceneSplitViewManager?.getLayoutPaneCount
                    ? window.sceneSplitViewManager.getLayoutPaneCount(
                        window.sceneSplitViewManager.layout
                    )
                    : 1;
            const smHasMultipleRenderCameras =
                smViewportPanels.length > 1 ||
                smSplitPaneCount > 1;
            const smOptimizationCamera =
                smViewportPanels.length === 1
                    ? smViewportPanels[0].camera
                    : (
                        typeof window.getSMActiveRenderCamera === 'function'
                            ? window.getSMActiveRenderCamera()
                            : (
                                window._gameRenderCamera ||
                                window.gameCamera ||
                                window.SMGameCameraManager?.getActiveCamera?.() ||
                                window.cameraSystem?.camera ||
                                window.camera ||
                                camera
                            )
                    );
            if (smOptimizationCamera) {
                if (typeof smPerformanceManager.setCamera === 'function') {
                    smPerformanceManager.setCamera(smOptimizationCamera);
                } else {
                    smPerformanceManager.camera = smOptimizationCamera;
                    if (smPerformanceManager.visibility) {
                        smPerformanceManager.visibility.camera = smOptimizationCamera;
                    }
                    if (smPerformanceManager.occlusion) {
                        smPerformanceManager.occlusion.camera = smOptimizationCamera;
                    }
                    if (smPerformanceManager.lod) {
                        smPerformanceManager.lod.camera = smOptimizationCamera;
                    }
                    smPerformanceManager.shadows?.setCamera?.(smOptimizationCamera);
                }
            }
            const smViewCullingSafe =
                !smHasMultipleRenderCameras &&
                !window.isModelingMode &&
                !smIs2D &&
                !window.SMEngineRenderer?._isRenderingVideo;
            if (typeof smPerformanceManager.setViewCullingEnabled === 'function') {
                smPerformanceManager.setViewCullingEnabled(smViewCullingSafe);
            } else {
                if (
                    smPerformanceManager.visibility?.options?.enabled !==
                    smViewCullingSafe
                ) {
                    smPerformanceManager.visibility?.setEnabled?.(smViewCullingSafe);
                }
                if (
                    smPerformanceManager.occlusion?.options?.enabled !==
                    smViewCullingSafe
                ) {
                    smPerformanceManager.occlusion?.setEnabled?.(smViewCullingSafe);
                }
            }
            const smDynamicResolutionSafe =
                !window.SMEngineRenderer?._isRenderingVideo &&
                !window.isOfflineRendering;
            if (
                smPerformanceManager.dynamicResolution?.options?.enabled !==
                smDynamicResolutionSafe
            ) {
                smPerformanceManager.dynamicResolution?.setEnabled?.(
                    smDynamicResolutionSafe
                );
            }
            // Use the real, unclamped frame delta for accurate FPS/pressure
            // measurements. The clamped `delta` above remains for simulation.
            smPerformanceManager.update(rawDelta);
        } catch (optimizationError) {
            if (!smFrameErrorLogged) {
                console.warn(
                    '[SM Optimization] Update warning:',
                    optimizationError
                );
            }
        }
    }

    // ========================================================================
    // EXTERNAL GAME WINDOW RENDER PATH
    // ========================================================================
    // The editor viewport panels live in the editor document. Once the WebGL
    // canvas is moved to the native Game Window, those panel DOM rectangles
    // are no longer valid render coordinates. The normal panel renderer would
    // therefore clear the popup canvas and render using off-screen/scissored
    // editor coordinates, which produces a black Game Window.
    //
    // Play in the external window is a single full-screen render target.
    function smRenderExternalGameWindowFrame() {
    if (!renderer || !scene) return false;

    const canvas = renderer.domElement;
    const gameWindowActive =
        window.__smGameWindowOpen === true &&
        window.__smGameWindowCanvas === canvas &&
        canvas?.dataset?.smGameWindowCanvas === '1' &&
        window.PlayOrchestrator?.mode === 'play';

    if (!gameWindowActive) return false;

    const gameCamera =
        window._gameRenderCamera ||
        window.gameCamera ||
        window.SMGameCameraManager?.getActiveCamera?.() ||
        window.cameraSystem?.camera ||
        window.camera;

    if (!gameCamera?.isCamera) return false;

    const width = Math.max(1, canvas.clientWidth || canvas.width || 1);
    const height = Math.max(1, canvas.clientHeight || canvas.height || 1);

    // ...keep your existing resize/aspect sync block as-is...

    scene.updateMatrixWorld?.(true);
    gameCamera.updateMatrixWorld?.(true);

    window._activeRenderCamera = gameCamera;
    window._viewedCamera = gameCamera;
    if (window.SMEngineRenderer) window.SMEngineRenderer.activeRenderCamera = gameCamera;

    const gameMode = String(
        window.workspaceManager?.currentMode ||
        window.playerSystem?.workspaceMode ||
        'GAME_DEV'
    ).toUpperCase();

    // Route through the same authority the "Rendered" editor mode uses,
    // instead of a raw renderer.render() bypass.
    const handled = window.smRenderViewportWithAuthority?.(scene, gameCamera, {
        viewport: { x: 0, y: 0, width, height },
        scissor: null,
        gameView: true,
        allowPostProcess: true,      // <-- bloom/tonemap/AA stack now runs
        allowSelectionComposer: false,
        forceRaw: false,
        delta: window.PlayOrchestrator?._lastFrameDelta ?? 0,
        time: performance.now() * 0.001,
        workspaceMode: gameMode
    });

    if (handled) return true;

    // fallback to raw render only if the central renderer failed
    renderer.setRenderTarget?.(null);
    renderer.setViewport?.(0, 0, width, height);
    renderer.setScissorTest?.(false);
    renderer.autoClear = true;
    renderer.render(scene, gameCamera);
    return true;
}

    if (shouldRender) {
        // The native Game Window is one full-screen render surface. Render it
        // before the editor viewport/panel pipeline so editor DOM coordinates
        // can never overwrite the popup canvas.
        if (smRenderExternalGameWindowFrame()) {
            return;
        }

        // EffectComposer/post-processing can leave a write buffer selected. Play
        // View is a direct render path, so explicitly return to the canvas before
        // clearing/rendering; otherwise the scene is rendered off-screen and the
        // user sees only the blue clear color.
        renderer.setRenderTarget?.(null);
        renderer.autoClear = true;
        if (smPIEMode === 'play') {
            // Gameplay workspaces can temporarily remove scene.background while
            // their sky rig is synchronized. With an alpha renderer that would
            // expose the CSS navy backdrop instead of a real game clear.
            const customGameClear =
                window.SMGameProjectRuntime?.replacesGameplaySampleWorld === true &&
                !!window.SMGameProjectRuntime?.activeProject;
            const playClearColor =
                smWorkspaceMode === 'GAMEPLAY_SAMPLE'
                    ? (customGameClear
                        ? (scene.background?.isColor ? scene.background.getHex() : 0x071426)
                        : 0x9f92ad)
                    : smWorkspaceMode === 'GAME_DEV'
                        ? 0x9fb6c8
                        : 0x393939;
            renderer.setClearColor(playClearColor, 1);
        }
        renderer.clear();
        const activePanels =
            window.SMViewportSystem &&
                window.SMViewportSystem.panels.size > 0
                ? Array.from(
                    window.SMViewportSystem.panels.values()
                )
                : null;
        if (
            activePanels &&
            !(
                window.SMEngineRenderer &&
                window.SMEngineRenderer._isRenderingVideo
            )
        ) {
            const canvasEl = renderer.domElement;
            const canvasRect = canvasEl.getBoundingClientRect();
            const showEditorOverlays = () => {
                if (window.transformControls) {
                    window.transformControls.visible =
                        !!window.transformControls.object;
                }
                const architecturePlanActive = window.__smArchitecturePlanMode === true;
                const showWorkspaceGrid = smWorkspaceMode === 'FILM' && !architecturePlanActive;
                [
                    window.grid,
                    window.infiniteGrid,
                    scene.getObjectByName('advancedGrid'),
                    scene.getObjectByName('blenderGrid'),
                ].filter(Boolean).forEach((grid) => {
                    grid.visible = showWorkspaceGrid;
                    grid.traverse?.((child) => { child.visible = showWorkspaceGrid; });
                });
                const architectureGrid = scene.getObjectByName('SMArchitectureCadGrid');
                if (architectureGrid) {
                    const showArchitectureGrid = architecturePlanActive && architectureGrid.userData?.cadGridEnabled !== false;
                    architectureGrid.visible = showArchitectureGrid;
                    architectureGrid.traverse?.((child) => { child.visible = showArchitectureGrid; });
                }
            };
            const hideEditorOverlays = () => {
                if (window.transformControls) {
                    window.transformControls.visible = false;
                }
                [
                    window.grid,
                    window.infiniteGrid,
                    scene.getObjectByName('advancedGrid'),
                    scene.getObjectByName('blenderGrid'),
                    scene.getObjectByName('SMArchitectureCadGrid'),
                ].filter(Boolean).forEach((grid) => {
                    grid.visible = false;
                    grid.traverse?.((child) => { child.visible = false; });
                });
            };
            activePanels.forEach(panel => {
                if (!panel.dom) return;
                const panelRect =
                    panel.dom.getBoundingClientRect();
                const left =
                    panelRect.left -
                    canvasRect.left;
                const top =
                    panelRect.top -
                    canvasRect.top;
                const width = panelRect.width;
                const height = panelRect.height;
                const bottom =
                    canvasRect.height -
                    (top + height);
                const sLeft = Math.round(left);
                const sBottom = Math.round(bottom);
                const sWidth = Math.round(width);
                const sHeight = Math.round(height);
                if (sWidth <= 0 || sHeight <= 0) {
                    // A just-created Game View can report a zero rect for one
                    // layout tick. Render the game camera full-canvas instead of
                    // leaving the transparent canvas over the dark CSS backdrop.
                    if (panel.type === 'game' && smPIEMode === 'play') {
                        smRenderPlayFallback();
                    }
                    return;
                }
                renderer.setViewport(
                    sLeft,
                    sBottom,
                    sWidth,
                    sHeight
                );
                renderer.setScissor(
                    sLeft,
                    sBottom,
                    sWidth,
                    sHeight
                );
                renderer.setScissorTest(true);
                panel.updateAspect?.(
                    width,
                    height
                );
                const activeCam = smIs2D
                    ? (
                        window.cameraSystem?.orthographicCamera ||
                        window.orthographicCamera ||
                        panel.camera
                    )
                    : panel.camera;
                if (!activeCam) {
                    if (panel.type === 'game' && smPIEMode === 'play') {
                        smRenderPlayFallback();
                    }
                    return;
                }
                const panelViewport = {
                    x: sLeft,
                    y: sBottom,
                    width: sWidth,
                    height: sHeight
                };

                if (panel.type === 'game') {
                    hideEditorOverlays();

                    renderer.setRenderTarget?.(null);
                    renderer.autoClear = true;

                    smRenderViewportWithAuthority(
                        scene,
                        activeCam,
                        {
                            viewport: panelViewport,
                            scissor: panelViewport,
                            gameView: true,
                            // Multi-panel post processing still needs a per-panel
                            // composer target. Keep this path raw until that pass is
                            // migrated.
                            allowPostProcess: false,
                            allowSelectionComposer: false,
                            delta,
                            time,
                            workspaceMode: smWorkspaceMode
                        }
                    );

                    showEditorOverlays();
                } else {
                    showEditorOverlays();

                    if (
                        typeof updateAdaptiveClipPlanes === 'function' &&
                        !window.v2dManager?.is2D &&
                        !activeCam?.userData?.is2DCamera &&
                        activeCam?.isPerspectiveCamera
                    ) {
                        updateAdaptiveClipPlanes(
                            activeCam,
                            time
                        );
                    }

                    smRenderViewportWithAuthority(
                        scene,
                        activeCam,
                        {
                            viewport: panelViewport,
                            scissor: panelViewport,
                            allowPostProcess: false,
                            allowSelectionComposer: true,
                            delta,
                            time,
                            workspaceMode: smWorkspaceMode
                        }
                    );
                }
            });
            showEditorOverlays();
            renderer.setScissorTest(false);
            renderer.setViewport(
                0,
                0,
                canvasEl.clientWidth,
                canvasEl.clientHeight
            );
        } else {
            //let mainRenderCamera;
            const mainRenderCamera =
                smIs2D
                    ? (
                        window.cameraSystem?.orthographicCamera ||
                        window.orthographicCamera ||
                        window.camera
                    )
                    : typeof window.getSMActiveRenderCamera === 'function'
                    ? window.getSMActiveRenderCamera()
                    : (
                        window._isInsideCamera && window._viewedCamera
                            ? window._viewedCamera
                            : (
                                typeof currentViewMode !== 'undefined' &&
                                    currentViewMode === 'orthographic'
                                    ? orthographicCamera
                                    : camera
                            )
                    );

            if (
                typeof updateAdaptiveClipPlanes === 'function' &&
                !smIs2D &&
                mainRenderCamera?.isPerspectiveCamera
            ) {
                updateAdaptiveClipPlanes(
                    mainRenderCamera,
                    time
                );
            }
            const isMirrorSplitRunning =
                window.sceneSplitViewManager &&
                window.sceneSplitViewManager.activeMode !== 'none' &&
                window.sceneSplitViewManager.getLayoutPaneCount(
                    window.sceneSplitViewManager.layout
                ) > 1;
            if (isMirrorSplitRunning) {
                const smRoot =
                    document.getElementById(
                        'sm-viewport-root'
                    );
                if (smRoot) {
                    smRoot.style.display = 'none';
                }
                renderer.setViewport(
                    0,
                    0,
                    renderer.domElement.clientWidth,
                    renderer.domElement.clientHeight
                );
                renderer.setScissor(
                    0,
                    0,
                    renderer.domElement.clientWidth,
                    renderer.domElement.clientHeight
                );
                renderer.setScissorTest(false);
                renderer.autoClear = true;
                if (
                    window.SMEngineRenderer &&
                    window.SMEngineRenderer._isRenderingVideo
                ) {
                    // Offline renderer owns this frame.
                } else {
                    const fullViewport = {
                        x: 0,
                        y: 0,
                        width: renderer.domElement.clientWidth,
                        height: renderer.domElement.clientHeight
                    };

                    smRenderViewportWithAuthority(
                        scene,
                        mainRenderCamera,
                        {
                            viewport: fullViewport,
                            scissor: null,
                            allowPostProcess: true,
                            allowSelectionComposer: true,
                            delta,
                            time,
                            workspaceMode: smWorkspaceMode
                        }
                    );
                }
            } else {
                const smRoot =
                    document.getElementById(
                        'sm-viewport-root'
                    );
                if (smRoot) {
                    smRoot.style.display = 'block';
                }
                const secondaryActivePanels =
                    window.SMViewportSystem &&
                        window.SMViewportSystem.panels.size > 0
                        ? Array.from(
                            window.SMViewportSystem.panels.values()
                        )
                        : null;
                if (
                    secondaryActivePanels &&
                    !(
                        window.SMEngineRenderer &&
                        window.SMEngineRenderer._isRenderingVideo
                    )
                ) {
                    const canvasEl = renderer.domElement;
                    const canvasRect =
                        canvasEl.getBoundingClientRect();
                    const toggleEditorHelpers = (visible) => {
                        if (window.transformControls) {
                            window.transformControls.visible =
                                visible &&
                                !!window.transformControls.object;
                        }
                        const showWorkspaceGrid = visible && smWorkspaceMode === 'FILM';
                        [
                            window.grid,
                            window.infiniteGrid,
                            scene.getObjectByName('advancedGrid'),
                            scene.getObjectByName('blenderGrid'),
                        ].filter(Boolean).forEach((grid) => {
                            grid.visible = showWorkspaceGrid;
                            grid.traverse?.((child) => { child.visible = showWorkspaceGrid; });
                        });
                        const axesHelper =
                            scene.getObjectByName(
                                'axesHelper'
                            );
                        if (axesHelper) {
                            axesHelper.visible = false;
                        }
                    };
                    secondaryActivePanels.forEach(panel => {
                        if (!panel.dom) return;
                        const panelRect =
                            panel.dom.getBoundingClientRect();
                        const left =
                            panelRect.left -
                            canvasRect.left;
                        const top =
                            panelRect.top -
                            canvasRect.top;
                        const width = panelRect.width;
                        const height = panelRect.height;
                        const bottom =
                            canvasRect.height -
                            (top + height);
                        const sLeft = Math.round(left);
                        const sBottom = Math.round(bottom);
                        const sWidth = Math.round(width);
                        const sHeight = Math.round(height);
                        if (sWidth <= 0 || sHeight <= 0) {
                            if (panel.type === 'game' && smPIEMode === 'play') {
                                smRenderPlayFallback();
                            }
                            return;
                        }
                        renderer.setViewport(
                            sLeft,
                            sBottom,
                            sWidth,
                            sHeight
                        );
                        renderer.setScissor(
                            sLeft,
                            sBottom,
                            sWidth,
                            sHeight
                        );
                        renderer.setScissorTest(true);
                        panel.updateAspect?.(
                            width,
                            height
                        );
                        const activeCam = smIs2D
                            ? (
                                window.cameraSystem?.orthographicCamera ||
                                window.orthographicCamera ||
                                panel.camera
                            )
                            : panel.camera;
                        if (!activeCam) {
                            if (panel.type === 'game' && smPIEMode === 'play') {
                                smRenderPlayFallback();
                            }
                            return;
                        }
                        const panelViewport = {
                            x: sLeft,
                            y: sBottom,
                            width: sWidth,
                            height: sHeight
                        };

                        if (panel.type === 'game') {
                            toggleEditorHelpers(false);

                            renderer.setRenderTarget?.(null);
                            renderer.autoClear = true;

                            smRenderViewportWithAuthority(
                                scene,
                                activeCam,
                                {
                                    viewport: panelViewport,
                                    scissor: panelViewport,
                                    gameView: true,
                                    allowPostProcess: false,
                                    allowSelectionComposer: false,
                                    delta,
                                    time,
                                    workspaceMode: smWorkspaceMode
                                }
                            );

                            toggleEditorHelpers(true);
                        } else {
                            toggleEditorHelpers(true);

                            if (
                                typeof updateAdaptiveClipPlanes === 'function'
                            ) {
                                updateAdaptiveClipPlanes(
                                    activeCam,
                                    time
                                );
                            }

                            smRenderViewportWithAuthority(
                                scene,
                                activeCam,
                                {
                                    viewport: panelViewport,
                                    scissor: panelViewport,
                                    allowPostProcess: false,
                                    allowSelectionComposer: true,
                                    delta,
                                    time,
                                    workspaceMode: smWorkspaceMode
                                }
                            );
                        }
                    });
                    toggleEditorHelpers(true);
                    renderer.setScissorTest(false);
                    renderer.setViewport(
                        0,
                        0,
                        canvasEl.clientWidth,
                        canvasEl.clientHeight
                    );
                } else {
                    renderer.setViewport(
                        0,
                        0,
                        renderer.domElement.clientWidth,
                        renderer.domElement.clientHeight
                    );
                    renderer.setScissor(
                        0,
                        0,
                        renderer.domElement.clientWidth,
                        renderer.domElement.clientHeight
                    );
                    renderer.setScissorTest(false);
                    renderer.autoClear = true;
                    if (
                        window.SMEngineRenderer &&
                        window.SMEngineRenderer._isRenderingVideo
                    ) {
                        // Offline renderer owns this frame.
                    } else {
                        const fullViewport = {
                            x: 0,
                            y: 0,
                            width: renderer.domElement.clientWidth,
                            height: renderer.domElement.clientHeight
                        };

                        smRenderViewportWithAuthority(
                            scene,
                            mainRenderCamera,
                            {
                                viewport: fullViewport,
                                scissor: null,
                                // Single viewport can use the new cinematic stack.
                                allowPostProcess: true,
                                allowSelectionComposer: true,
                                gameView: smPIEMode === 'play',
                                delta,
                                time,
                                workspaceMode: smWorkspaceMode
                            }
                        );
                    }
                }
            }
            scene.traverse(obj => {
                if (!obj.isCamera || obj === camera) return;
                if (
                    obj.helper &&
                    typeof obj.helper.update === 'function'
                ) {
                    obj.helper.update();
                }
                if (
                    obj.userData.mode === 'cinematic' &&
                    obj.userData.lookAtTarget
                ) {
                    const targetPos = new THREE.Vector3();
                    obj.userData.lookAtTarget.getWorldPosition(
                        targetPos
                    );
                    obj.lookAt(targetPos);
                }
            });
        }
    }
    window.smRenderDebugger?.stats?.update?.(
        rawDelta
    );

    if (typeof updateStats === 'function') {
        updateStats(naniteStats);
    }
    updateEditorStatusCounters(naniteStats);
    if (
        smFrameCounter % 30 === 0 &&
        typeof window.dedupeHemisphereLights === 'function'
    ) {
        if (
            smWorkspaceMode === 'GAME_DEV' ||
            smWorkspaceMode === 'TERRAIN'
        ) {
            window.dedupeHemisphereLights({
                preserveCustomLights: false
            });
        } else if (smWorkspaceMode === 'GAMEPLAY_SAMPLE') {
            window.dedupeHemisphereLights({
                preserveCustomLights: true
            });
        }
    }
    if (typeof updateHelpers === 'function') {
        updateHelpers();
    }
}

function animate() {
    requestAnimationFrame(animate);

    // When Play owns an external Game Window, the GamePlayOrchestrator owns
    // the authoritative runtime frame. Do NOT also advance SMViewport/
    // smRenderFrame here, otherwise physics, movement and animation would be
    // updated twice per browser frame. The editor remains responsive because
    // its UI thread is still alive; only the 3D runtime frame is transferred to
    // the dedicated Game Window loop.
    if (window.__smExternalGameWindowOwnsFrameLoop === true) {
        return;
    }

    try {
        if (window.smViewport?.initialized) {
            // The legacy RAF remains the only browser frame owner while the
            // new viewport owns frame ordering and dispatches update/render.
            window.smViewport.stepFromLegacyFrame(performance.now());
        } else {
            smRenderFrame();
        }
        smFrameErrorLogged = false;
    } catch (frameError) {
        if (!smFrameErrorLogged) {
            smFrameErrorLogged = true;
            console.error('[SM] Frame update failed; using render fallback:', frameError);
        }
        smRenderPlayFallback();
    }
}

// Explicit references make the clean viewport usable even when engine files
// are evaluated by a loader instead of ordinary classic script tags.
window.smRenderFrame = smRenderFrame;
window.animate = animate;