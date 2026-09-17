// sculpting/terrain-sculpting/TerrainPlayerPlayBridge.js
// Lets Terrain Sculpting Mode spawn/test the real SMPlayerSystem on the live
// deformable landscape. Load AFTER SMPlayerSystem.js + TerrainSurfaceQuery.js.

(() => {
    const NS = window.TerrainSculpting = window.TerrainSculpting || {};

    const state = {
        initialized: false,
        playerAdded: false,
        playing: false,
        adding: false,
        playPending: false,
        previousEnabled: false,
        previousRuntimeControl: false,
        previousCameraActive: false,
        previewOpenedByTerrain: false
    };

    let addPromise = null;
    let playPromise = null;

    async function ensurePlayerSystem() {
        let player = window.playerSystem || null;

        if (!player) {
            if (typeof window.SMPlayerSystem !== 'function') {
                throw new Error(
                    '[TerrainPlayerPlayBridge] SMPlayerSystem.js is not loaded.'
                );
            }

            player = new window.SMPlayerSystem({
                scene: NS.getScene?.() || window.scene,
                camera: NS.getCamera?.() || window.camera,
                renderer: NS.getRenderer?.() || window.renderer,
                physicsSystem: window.physicsSystem
            });

            window.playerSystem = player;
            window.player = player;
        }

        if (!player.ready) {
            await player.init();
        }

        return player;
    }

    function _getPreferredSpawnXZ() {
        const lastHit = NS.state?.lastHitPoint;

        if (lastHit) {
            return {
                x: lastHit.x,
                z: lastHit.z
            };
        }

        const terrain = window.terrain;
        const box =
            NS.surfaceQuery
                ?.getTerrainBoundsWorld?.(
                    new THREE.Box3()
                );

        if (box && !box.isEmpty()) {
            const center = box.getCenter(
                new THREE.Vector3()
            );

            return {
                x: center.x,
                z: center.z
            };
        }

        if (terrain?.position) {
            return {
                x: terrain.position.x,
                z: terrain.position.z
            };
        }

        return { x: 0, z: 0 };
    }

    function getSpawnPoint({
        x = null,
        z = null
    } = {}) {
        const preferred =
            _getPreferredSpawnXZ();

        const px =
            Number.isFinite(Number(x))
                ? Number(x)
                : preferred.x;

        const pz =
            Number.isFinite(Number(z))
                ? Number(z)
                : preferred.z;

        const bounds =
            NS.surfaceQuery
                ?.getTerrainBoundsWorld?.(
                    new THREE.Box3()
                );

        const originY =
            bounds && !bounds.isEmpty()
                ? bounds.max.y + 100
                : 1000;

        const maxDistance =
            bounds && !bounds.isEmpty()
                ? Math.max(
                    200,
                    bounds.max.y -
                        bounds.min.y +
                        200
                )
                : 2000;

        const hit =
            NS.surfaceQuery?.raycastDown?.(
                px,
                pz,
                {
                    originY,
                    maxDistance,
                    minNormalY: -1
                }
            );

        if (!hit) {
            return new THREE.Vector3(
                px,
                1,
                pz
            );
        }

        const offset =
            Number(
                window.SMPlayerConfig
                    ?.groundOffset ??
                0.025
            );

        return new THREE.Vector3(
            hit.point.x,
            hit.point.y + offset,
            hit.point.z
        );
    }

    function _hasGamePreviewPanel() {
        const panels =
            window.SMViewportSystem?.panels;

        if (!panels?.values) {
            return false;
        }

        return Array.from(
            panels.values()
        ).some(
            panel => panel?.type === 'game'
        );
    }

    function _activateTerrainPreviewCamera(player) {
        const camera =
            player?.playerCamera ||
            player?.cameraController?.camera ||
            null;

        if (!camera?.isCamera) {
            console.error(
                '[TerrainPlayerPlayBridge] Player camera is unavailable.'
            );
            return false;
        }

        // Possession gives the third-person controller ownership of this
        // camera. Publishing it through the same render globals as normal
        // PIE makes the primary viewport follow the player instead of
        // continuing to render the editor/orbit camera.
        const possessed =
            player.possessCamera?.({
                reason: 'terrain-sculpt-sim-play'
            }) === true;

        if (!possessed) {
            console.error(
                '[TerrainPlayerPlayBridge] Player camera possession failed.'
            );
            return false;
        }

        camera.userData =
            camera.userData || {};
        camera.userData.isGameplayCamera = true;
        camera.userData.cameraRole =
            'terrain-player-test';
        camera.userData.useForPlay = true;
        camera.updateMatrixWorld?.(true);

        window._activeRenderCamera = camera;
        window._gameRenderCamera = camera;
        window.gameCamera = camera;
        window._gameCameraActive = true;

        if (window.SMEngineRenderer) {
            window.SMEngineRenderer.activeRenderCamera =
                camera;
        }

        // SMViewportSystem's primary editor panel intentionally owns the
        // editor camera. Its Game Preview panel is therefore required for
        // the visible viewport to render the player camera, just as it does
        // in GAME_DEV and GAMEPLAY_SAMPLE. This changes only panel type,
        // never the active workspace.
        state.previewOpenedByTerrain =
            !_hasGamePreviewPanel();
        window.SMViewportSystem?.openGameView?.();

        return true;
    }

    function _restoreTerrainEditorCamera(player) {
        const camera =
            player?.playerCamera ||
            player?.cameraController?.camera ||
            null;

        player?.releaseCamera?.();

        if (!camera || window._gameRenderCamera === camera) {
            window._gameRenderCamera = null;
        }

        if (!camera || window.gameCamera === camera) {
            window.gameCamera = null;
        }

        if (!camera || window._activeRenderCamera === camera) {
            window._activeRenderCamera = null;
        }

        window._gameCameraActive = false;

        if (
            window.SMEngineRenderer &&
            (!camera ||
                window.SMEngineRenderer.activeRenderCamera ===
                    camera)
        ) {
            window.SMEngineRenderer.activeRenderCamera =
                null;
        }

        if (state.previewOpenedByTerrain) {
            window.SMViewportSystem?.closeGameView?.();
        }

        state.previewOpenedByTerrain = false;
    }

    async function addPlayer(options = {}) {
        if (!window.terrain) {
            throw new Error(
                '[TerrainPlayerPlayBridge] Create/select a terrain first.'
            );
        }

        // If another Add Player call is already doing initialization/model load,
        // reuse it. Double clicks must not create two player systems.
        if (addPromise) {
            return addPromise;
        }

        const existing = window.playerSystem;
        const forceRespawn =
            options.forceRespawn === true ||
            options.respawn === true;

        if (
            state.playerAdded &&
            existing?.ready &&
            !forceRespawn
        ) {
            // Add/placement mode is editor-only. Never inherit gameplay input
            // from another workspace or a previous Play session.
            state.playing = false;
            state.playPending = false;
            window.__smTerrainPlayActive = false;

            existing.setWorkspaceMode?.('TERRAIN');
            existing.setRuntimeControlActive?.(false);
            _restoreTerrainEditorCamera(existing);
            existing.setTerrainTestMode?.(true);

            if (!existing.enabled) {
                existing.setEnabled?.(true);
            }

            existing.character?.setVisible?.(true);

            window.workspaceManager
                ?._syncTerrainPlayerTestState?.(
                    true
                );

            return existing;
        }

        state.adding = true;

        addPromise = (async () => {
            NS.surfaceQuery?.registerTerrain?.(
                window.terrain
            );

            const player =
                await ensurePlayerSystem();

            const firstAdd =
                state.playerAdded !== true;

            if (firstAdd) {
                state.previousEnabled =
                    player.enabled === true;
            }

            // ADD PLAYER is placement/edit mode, NOT Play.
            // Force Terrain ownership and kill any stale runtime input/camera
            // before enabling the visible player actor.
            state.playing = false;
            state.playPending = false;
            window.__smTerrainPlayActive = false;

            player.setWorkspaceMode?.('TERRAIN');
            player.setRuntimeControlActive?.(false);
            _restoreTerrainEditorCamera(player);
            player.setSimulationPaused?.(false);

            // setTerrainTestMode(true) keeps the actor visible/physical, while
            // runtime input remains locked until play() explicitly enables it.
            player.setTerrainTestMode?.(true);

            if (!player.enabled) {
                player.setEnabled?.(true);
            }

            const spawn =
                getSpawnPoint(options);

            // teleport() only moves the player. PlayerPhysicsController's fixed
            // syncAfterTeleport() keeps the existing static-world cache instead
            // of rebuilding every collider again.
            player.teleport?.(
                spawn.x,
                spawn.y,
                spawn.z
            );

            // IMPORTANT: no refreshWorld(true) here. Enabling physics already
            // creates the cache once. Terrain changes invalidate it lazily.
            player.animation?.setEnabled?.(
                true
            );

            player.forceIdle?.();

            state.playerAdded = true;

            window.workspaceManager
                ?._syncTerrainPlayerTestState?.(
                    true
                );

            window.dispatchEvent(
                new CustomEvent(
                    'sm:terrain-player-added',
                    {
                        detail: {
                            player,
                            position:
                                spawn.clone()
                        }
                    }
                )
            );

            return player;
        })();

        try {
            return await addPromise;
        } finally {
            state.adding = false;
            addPromise = null;
        }
    }

    async function play(options = {}) {
        if (state.playing) {
            return window.playerSystem || null;
        }

        if (playPromise) {
            return playPromise;
        }

        state.playPending = true;

        playPromise = (async () => {
            // Play should not respawn/rebuild an already-added player.
            const player =
                state.playerAdded &&
                window.playerSystem?.ready
                    ? window.playerSystem
                    : await addPlayer(options);

            state.previousRuntimeControl =
                player.runtimeControlActive ===
                true;

            state.previousCameraActive =
                player.cameraController
                    ?.active === true;

            player.setTerrainTestMode?.(true);

            if (!player.enabled) {
                player.setEnabled?.(true);
            }

            player.setSimulationPaused?.(
                false
            );

            // Mark Play before workspace visibility synchronization so Terrain
            // visibility authority sees the runtime player exception.
            state.playing = true;
            window.__smTerrainPlayActive = true;

            player.setRuntimeControlActive?.(
                true
            );

            if (!_activateTerrainPreviewCamera(player)) {
                throw new Error(
                    '[TerrainPlayerPlayBridge] Could not activate the Terrain player camera.'
                );
            }

            player.animation?.setEnabled?.(
                true
            );

            if (!player.animation?.currentAction) {
                player.forceIdle?.();
            }

            window.workspaceManager
                ?._syncTerrainPlayerTestState?.(
                    true
                );

            window.dispatchEvent(
                new CustomEvent(
                    'sm:terrain-play-start',
                    {
                        detail: {
                            player
                        }
                    }
                )
            );

            return player;
        })();

        try {
            return await playPromise;
        } catch (error) {
            state.playing = false;
            window.__smTerrainPlayActive = false;
            const player = window.playerSystem || null;
            player?.setRuntimeControlActive?.(false);
            _restoreTerrainEditorCamera(player);
            window.workspaceManager?._syncRuntimePhysics?.(true);
            throw error;
        } finally {
            state.playPending = false;
            playPromise = null;
        }
    }

    function stop({
        hidePlayer = false
    } = {}) {
        const player =
            window.playerSystem;

        if (!player) {
            state.playing = false;
            window.__smTerrainPlayActive = false;
            _restoreTerrainEditorCamera(null);
            return false;
        }

        state.playing = false;
        state.playPending = false;
        window.__smTerrainPlayActive = false;

        // TERRAIN edit mode is never a gameplay-control owner. Stop must
        // always return to editor control instead of restoring a stale value
        // inherited from GAME_DEV / GAMEPLAY_SAMPLE.
        player.setRuntimeControlActive?.(false);
        _restoreTerrainEditorCamera(player);

        player.forceIdle?.();

        if (hidePlayer) {
            state.playerAdded = false;

            player.setTerrainTestMode?.(
                false
            );

            if (!state.previousEnabled) {
                player.setEnabled?.(
                    false
                );
            }
        } else {
            player.animation?.setEnabled?.(
                true
            );

            if (!player.animation?.currentAction) {
                player.forceIdle?.();
            }

            window.workspaceManager
                ?._syncTerrainPlayerTestState?.(
                    true
                );
        }

        // Terrain edit mode does not own runtime physics. Stopping from the
        // top Sim-Play button must therefore disable the Terrain test physics
        // immediately, even though the placed player remains visible/idle.
        window.workspaceManager
            ?._syncRuntimePhysics?.(
                true
            );

        window.dispatchEvent(
            new CustomEvent(
                'sm:terrain-play-stop',
                {
                    detail: {
                        player
                    }
                }
            )
        );

        return true;
    }

    function removePlayer() {
        return stop({
            hidePlayer: true
        });
    }

    function setSlopeLimit(degrees) {
        const value =
            THREE.MathUtils.clamp(
                Number(degrees) || 48,
                1,
                89
            );

        window.playerSystem
            ?.playerPhysics
            ?.setSlopeLimitDegrees?.(
                value
            );

        return value;
    }

    function setStepHeight(height) {
        const value =
            Math.max(
                0,
                Number(height) || 0
            );

        if (
            window.playerSystem
                ?.playerPhysics
        ) {
            window.playerSystem
                .playerPhysics
                .stepHeight = value;
        }

        return value;
    }

    function enterEditMode({ hideUnaddedPlayer = true } = {}) {
        const player = window.playerSystem || null;

        state.playing = false;
        state.playPending = false;
        window.__smTerrainPlayActive = false;

        if (!player) {
            return false;
        }

        player.setRuntimeControlActive?.(false);
        _restoreTerrainEditorCamera(player);

        // If the user has not explicitly pressed Add Player in this Terrain
        // session, entering Terrain must keep the global player disabled/hidden.
        if (hideUnaddedPlayer && state.playerAdded !== true) {
            player.setTerrainTestMode?.(false);
            player.setEnabled?.(false);
        }

        return true;
    }

    function getDebugState() {
        const player =
            window.playerSystem || null;

        return {
            ...state,
            playerReady: player?.ready === true,
            playerEnabled: player?.enabled === true,
            runtimeControlActive:
                player?.runtimeControlActive === true,
            cameraActive:
                player?.cameraController?.active === true,
            physics:
                player?.playerPhysics
                    ?.getDebugStats?.() ||
                null
        };
    }

    function init() {
        if (state.initialized) {
            return api;
        }

        state.initialized = true;

        window.addEventListener(
            'sm:terrain-created',
            event => {
                NS.surfaceQuery
                    ?.registerTerrain?.(
                        event.detail?.terrain ||
                        window.terrain
                    );

                window.playerSystem
                    ?.playerPhysics
                    ?.invalidateWorld?.();
            }
        );

        return api;
    }

    const api = {
        state,
        init,
        ensurePlayerSystem,
        getSpawnPoint,
        addPlayer,
        play,
        stop,
        removePlayer,
        enterEditMode,
        setSlopeLimit,
        setStepHeight,
        getDebugState
    };

    NS.playerPlay = api;
    window.TerrainPlayerPlayBridge =
        api;

    init();
})();
