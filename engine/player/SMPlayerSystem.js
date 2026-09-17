class SMPlayerSystem {
    constructor({
        scene = window.scene,
        camera = window.camera,
        renderer = window.renderer,
        physicsSystem = window.physicsSystem
    } = {}) {
        this.scene = scene;
        this.camera = camera;
        this.renderer = renderer;
        this.physicsSystem = physicsSystem || null;
        this.config = window.SMPlayerConfig || {};
        this.ready = false;
        this.loading = false;
        this.enabled = false;
        this.desiredEnabled = false;
        this.workspaceMode = null;
        this._loadingPromise = null;
        this._disposed = false;
        this.character = null;
        this.state = null;
        this.input = null;
        this.rotation = null;
        this.movement = null;
        this.cameraController = null;
        this.animationLoader = null;
        this.animation = null;
        this.animationStateMachine = null;
        this.motionMatching = null;
        this.playerPhysics = null;
        this.grounding = null;
        this.terrainTestModeActive = false;
        this.events = new EventTarget();
        this._lastUpdateWarning = 0;
        this.runtimeControlActive = false;
        this.simulationPaused = false;
        this.animationGraphRuntimeActive = false;
        this.animationGraphFallbackToLocomotion = false;
    }
    async init() {
        if (this._disposed) {
            throw new Error('[SMPlayerSystem] Cannot initialize a disposed player system.');
        }
        if (this.ready) {
            return this;
        }
        if (this.loading && this._loadingPromise) {
            return this._loadingPromise;
        }
        this.loading = true;
        this._loadingPromise = this._initInternal();
        return this._loadingPromise;
    }
    async _initInternal() {
        try {
            if (!this.scene) {
                throw new Error('Scene is missing.');
            }
            if (!this.camera) {
                throw new Error('Camera is missing.');
            }
            if (typeof SMPlayerState === 'undefined') {
                throw new Error('SMPlayerState is not loaded.');
            }
            if (typeof SMPlayerInputController === 'undefined') {
                throw new Error('SMPlayerInputController is not loaded.');
            }
            if (typeof SMPlayerCharacter === 'undefined') {
                throw new Error('SMPlayerCharacter is not loaded.');
            }
            if (typeof SMPlayerAnimationLoader === 'undefined') {
                throw new Error('SMPlayerAnimationLoader is not loaded.');
            }
            if (typeof SMPlayerAnimationController === 'undefined') {
                throw new Error('SMPlayerAnimationController is not loaded.');
            }
            if (typeof SMPlayerRotationController === 'undefined') {
                throw new Error('SMPlayerRotationController is not loaded.');
            }
            if (typeof SMPlayerMovementController === 'undefined') {
                throw new Error('SMPlayerMovementController is not loaded.');
            }
            if (typeof SMPlayerAnimationStateMachine === 'undefined') {
                throw new Error('SMPlayerAnimationStateMachine is not loaded.');
            }
            this.state = new SMPlayerState();
            this.input = new SMPlayerInputController();
            this.character = new SMPlayerCharacter(
                this.scene,
                this.config
            );
            await this.character.load();
            if (!this.character.model) {
                throw new Error('Player character root was not created.');
            }
            if (!this.character.visual) {
                throw new Error('Player FBX visual was not created.');
            }
            this.animationLoader = new SMPlayerAnimationLoader(
                window.SMPlayerAnimationManifest,
                this.character
            );
            await this.animationLoader.loadAll();
            this.animationLoader.registerEmbeddedIdle?.(
                this.character
            );
            this.animation = new SMPlayerAnimationController(
                this.character.visual,
                this.animationLoader,
                this.config
            );
            this.rotation = new SMPlayerRotationController(
                this.character,
                this.config
            );
            if (typeof SMPlayerCameraController === 'undefined') {
                throw new Error(
                    'SMPlayerCameraController is not loaded. Check PlayerCameraController.js script order.'
                );
            }
            this.cameraController = new SMPlayerCameraController({
                scene: this.scene,
                character: this.character,
                renderer: this.renderer,
                editorCamera: this.camera,
                config: this.config
            });
            if (!this.cameraController.camera) {
                throw new Error(
                    'PlayerCameraController failed to create SMPlayerCamera.'
                );
            }
            this.movement = new SMPlayerMovementController(
                this.character,
                this.input,
                this.state,
                this.rotation,
                this.cameraController.camera,
                this.config
            );

            if (typeof SMPlayerPhysicsController !== 'undefined') {
                this.playerPhysics = new SMPlayerPhysicsController({
                    scene: this.scene,
                    character: this.character,
                    state: this.state,
                    config: this.config,
                    getWorld: () =>
                        window.gameplaySampleWorld ||
                        window.gameplaySampleEnvironment?.world ||
                        null
                });

                this.playerPhysics.setEnabled(false);
                this.movement.setPhysicsController?.(
                    this.playerPhysics
                );
            } else {
                console.warn(
                    '[SMPlayerSystem] PlayerPhysicsController.js is not loaded; using legacy fixed-height movement.'
                );
            }

            if (typeof SMPlayerGrounding !== 'undefined') {
                this.grounding = new SMPlayerGrounding(
                    this.scene,
                    this.character,
                    this.config
                );
            }

            this.animationStateMachine = new SMPlayerAnimationStateMachine(
                this.state,
                this.input,
                this.animation
            );

            // Gameplay Sample Motion Matching / traversal layer.  It deliberately
            // sits above the existing locomotion state machine so GAME_DEV keeps
            // the old behaviour while GAMEPLAY_SAMPLE can use feature matching,
            // jump, vault and climb actions.
            if (typeof SMPlayerMotionMatchingSystem !== 'undefined') {
                this.motionMatching = new SMPlayerMotionMatchingSystem({
                    character: this.character,
                    state: this.state,
                    input: this.input,
                    movement: this.movement,
                    animation: this.animation,
                    camera: this.cameraController.camera,
                    config: this.config,
                    getWorld: () =>
                        window.gameplaySampleWorld ||
                        window.gameplaySampleEnvironment?.world ||
                        null
                });
            } else {
                console.warn('[SMPlayerSystem] SMPlayerMotionMatchingSystem is not loaded; using legacy animation state machine.');
            }
            this.character.setVisible(false);
            this.input.setEnabled(false);
            this.movement.setEnabled(false);
            this.animation.setEnabled(false);
            this.state.enabled = false;
            this.enabled = false;
            this.ready = true;
            this.loading = false;
            window.playerSystem = this;
            window.player = this;
            const startupMode = String(
                this.workspaceMode ||
                window.workspaceManager?.currentMode ||
                localStorage.getItem('sm_workspace_mode') ||
                'FILM'
            ).toUpperCase();
            this.workspaceMode = startupMode;
            this.desiredEnabled = this._isWorkspaceAllowed(startupMode);
            this._applyEnabledState(
                this.desiredEnabled,
                {
                    force: true,
                    reason: 'initialization'
                }
            );
            console.log('[SMPlayerSystem] Ready', {
                workspace: this.workspaceMode,
                enabled: this.enabled,
                model: this.character.model?.name || null,
                visual: this.character.visual?.name || null,
                height: this.character.height,
                animations: Array.from(this.animation.actions.keys()),
                currentAnimation: this.animation.currentKey || null
            });
            this._emit('ready', {
                workspace: this.workspaceMode,
                enabled: this.enabled,
                model: this.character.model
            });
            return this;
        } catch (error) {
            this.loading = false;
            this.ready = false;
            console.error('[SMPlayerSystem] Initialization failed:', error);
            throw error;
        }
    }
    _isWorkspaceAllowed(modeKey) {
        const mode = String(modeKey || '').toUpperCase();
        // The player visual is a scene asset, not a Play-only object. Keep it
        // available in Film, Content and the other editor workspaces; only
        // Terrain remains explicitly placement/test controlled below.
        return mode !== 'TERRAIN';
    }
    setWorkspaceMode(modeKey) {
        const mode = String(modeKey || 'FILM').toUpperCase();
        this.workspaceMode = mode;

        // TERRAIN is editor-first. Merely entering the Terrain workspace must
        // NEVER activate the player. The TerrainPlayerPlayBridge is the only
        // authority allowed to opt the player into Terrain test mode.
        if (mode === 'TERRAIN') {
            const terrainBridge =
                window.TerrainPlayerPlayBridge ||
                window.TerrainSculpting?.playerPlay ||
                null;

            const playerAdded =
                terrainBridge?.state?.playerAdded === true;
            const terrainPlaying =
                terrainBridge?.state?.playing === true ||
                window.__smTerrainPlayActive === true;

            this.terrainTestModeActive = playerAdded;
            this.desiredEnabled = playerAdded;

            // Edit/placement mode must never inherit runtime input or the
            // player camera from GAME_DEV / GAMEPLAY_SAMPLE.
            if (!terrainPlaying) {
                this.runtimeControlActive = false;

                if (this.ready) {
                    this.input?.setEnabled?.(false);
                    this.movement?.setEnabled?.(false);

                    if (this.cameraController?.active) {
                        this.releaseCamera?.();
                    }
                }
            }

            if (!this.ready) {
                console.log('[SMPlayerSystem] Terrain workspace queued:', {
                    playerAdded,
                    terrainPlaying,
                    desiredEnabled: this.desiredEnabled
                });
                return this.desiredEnabled;
            }

            this._applyEnabledState(
                this.desiredEnabled,
                {
                    reason: terrainPlaying
                        ? 'workspace:TERRAIN:play'
                        : 'workspace:TERRAIN:edit'
                }
            );

            return this.desiredEnabled;
        }

        // Outside Terrain, Terrain test state must not keep the player alive.
        this.terrainTestModeActive = false;
        this.desiredEnabled =
            this._isWorkspaceAllowed(mode);

        if (!this.ready) {
            console.log('[SMPlayerSystem] Workspace queued until player is ready:', {
                workspace: mode,
                desiredEnabled: this.desiredEnabled
            });
            return this.desiredEnabled;
        }

        this._applyEnabledState(
            this.desiredEnabled,
            {
                reason: `workspace:${mode}`
            }
        );
        return this.desiredEnabled;
    }
    setTerrainTestMode(active) {
        this.terrainTestModeActive = !!active;

        if (!this.ready) {
            this.desiredEnabled =
                this.terrainTestModeActive ||
                this._isWorkspaceAllowed(
                    this.workspaceMode
                );
            return this.terrainTestModeActive;
        }

        if (this.terrainTestModeActive) {
            this.setEnabled(true);
        } else {
            this.setEnabled(
                this._isWorkspaceAllowed(
                    this.workspaceMode
                )
            );
        }

        return this.terrainTestModeActive;
    }

    _isRuntimeControlAllowed() {
        const mode = String(
            this.workspaceMode ||
            window.workspaceManager?.currentMode ||
            ''
        ).toUpperCase();

        if (mode !== 'TERRAIN') {
            return true;
        }

        const bridge =
            window.TerrainPlayerPlayBridge ||
            window.TerrainSculpting?.playerPlay ||
            null;

        // HARD TERRAIN RULE:
        // A visible/placed player is NOT a running game. Only the Terrain Play
        // command may own keyboard/mouse input and locomotion.
        return !!(
            bridge?.state?.playing === true ||
            window.__smTerrainPlayActive === true
        );
    }

    setRuntimeControlActive(active) {
        const requested = !!active;
        const allowed = !requested || this._isRuntimeControlAllowed();

        this.runtimeControlActive = requested && allowed;

        if (!this.ready) {
            return this.runtimeControlActive;
        }

        const canControl =
            this.enabled &&
            this.runtimeControlActive &&
            !this.simulationPaused &&
            this._isRuntimeControlAllowed();

        this.input?.setEnabled?.(canControl);
        this.movement?.setEnabled?.(canControl);

        if (canControl) {
            this.movement?.syncGroundHeight?.();
        }

        if (requested && !allowed) {
            console.log(
                '[SMPlayerSystem] Runtime input blocked: Terrain Play is not active.'
            );
        } else {
            console.log('[SMPlayerSystem] Runtime control:', {
                active: this.runtimeControlActive,
                canControl
            });
        }

        return this.runtimeControlActive;
    }
    setSimulationPaused(paused) {
        this.simulationPaused = !!paused;
        if (!this.ready) return this.simulationPaused;
        const canControl =
            this.enabled &&
            this.runtimeControlActive &&
            !this.simulationPaused &&
            this._isRuntimeControlAllowed();
        this.input?.setEnabled?.(canControl);
        this.movement?.setEnabled?.(canControl);
        this.animation?.setEnabled?.(
            this.enabled && !this.simulationPaused
        );
        this.motionMatching?.setEnabled?.(
            this.enabled && !this.simulationPaused
        );
        console.log('[SMPlayerSystem] Simulation pause:', this.simulationPaused);
        return this.simulationPaused;
    }
    setEnabled(enabled) {
        this.desiredEnabled = !!enabled;
        if (!this.ready) {
            return this.desiredEnabled;
        }
        this._applyEnabledState(
            this.desiredEnabled,
            {
                reason: 'manual'
            }
        );
        return this.enabled;
    }
    _applyEnabledState(enabled, {
        force = false,
        reason = 'unknown'
    } = {}) {
        if (!this.ready) {
            return false;
        }
        const nextState = !!enabled;
        const previousState = this.enabled;
        const stateChanged = previousState !== nextState;
        // Input/movement are intentionally disabled while runtime control is
        // inactive (for example when the player is only placed in Terrain edit
        // mode). Do not treat that intentional state as a broken subsystem:
        // doing so made repeated setEnabled(true) calls rebuild player physics.
        const shouldControl =
            nextState &&
            this.runtimeControlActive &&
            !this.simulationPaused &&
            this._isRuntimeControlAllowed();
        const shouldAnimate =
            nextState &&
            !this.simulationPaused;
        const subsystemsNeedRepair =
            nextState && (
                this.input?.enabled !== shouldControl ||
                this.movement?.enabled !== shouldControl ||
                this.animation?.enabled !== shouldAnimate ||
                this.playerPhysics?.enabled !== nextState
            );
        if (
            !force &&
            !stateChanged &&
            !subsystemsNeedRepair
        ) {
            if (this.character?.model) {
                this.character.setVisible(nextState);
            }
            return this.enabled;
        }
        this.enabled = nextState;
        if (this.state) {
            this.state.enabled = nextState;
        }
        this.character?.setVisible(nextState);
        const canControl = shouldControl;
        this.input?.setEnabled(canControl);
        this.movement?.setEnabled(canControl);

        // PlayerPhysicsController.setEnabled() is idempotent after the Terrain
        // fix, but avoid touching it at all when the requested state is already
        // active. This prevents accidental collision-cache rebuilds from
        // workspace/player visibility repair calls.
        if (this.playerPhysics?.enabled !== nextState) {
            this.playerPhysics?.setEnabled?.(nextState);
        }

        this.animation?.setEnabled(shouldAnimate);
        this.motionMatching?.setEnabled?.(
            nextState && !this.simulationPaused
        );
        if (nextState) {
            if (this.state) {
                this.state.grounded = true;
            }
            this.movement?.syncGroundHeight?.();
            if (
                stateChanged ||
                force ||
                subsystemsNeedRepair ||
                !this.animation?.currentAction
            ) {
                this.animationStateMachine?.reset?.();
                const idleStarted =
                    this.animationStateMachine?.forceIdle?.() ||
                    false;
                console.log('[SMPlayerSystem] Runtime enabled', {
                    reason,
                    workspace: this.workspaceMode,
                    idleStarted,
                    currentAnimation: this.animation?.currentKey || null,
                    inputEnabled: this.input?.enabled,
                    movementEnabled: this.movement?.enabled,
                    animationEnabled: this.animation?.enabled
                });
            }
        } else {
            this.animationStateMachine?.reset?.();
            this.animation?.stopAll?.();
            this.state?.reset?.();
            console.log('[SMPlayerSystem] Runtime disabled', {
                reason,
                workspace: this.workspaceMode
            });
        }
        if (
            stateChanged ||
            force
        ) {
            this._emit('enabledchange', {
                enabled: this.enabled,
                workspaceMode: this.workspaceMode,
                reason
            });
        }
        return this.enabled;
    }
    update(delta) {
        if (!this.ready || !this.enabled || this._disposed) return;
        if (!Number.isFinite(delta) || delta <= 0) return;
        if (!this.character?.model || !this.character?.visual) return;
        if (this.simulationPaused) return;
        // A workspace repair or Play transition can stop the action after the
        // player was enabled. Keep a valid loop running so the character is
        // never rendered in a frozen bind pose.
        if (
            this.animation?.enabled &&
            !this.animation.currentAction
        ) {
            this.animationStateMachine?.forceIdle?.();
            if (!this.animation.currentAction && this.animation.has?.('WALK_FORWARD')) {
                this.animation.play('WALK_FORWARD', { fade: 0.08 });
            }
        }
        const canControl =
            this.runtimeControlActive === true &&
            this._isRuntimeControlAllowed();
        if (canControl) {
            this.input?.update?.(delta);

            const graphOwnsLocomotion =
                this.animationGraphRuntimeActive === true &&
                this.animationGraphFallbackToLocomotion !== true;
            const useMotionMatching = !!(
                this.motionMatching?.enabled &&
                this.motionMatching?._workspaceAllowed?.() &&
                !graphOwnsLocomotion
            );

            // preUpdate may take ownership of the character root for a vault,
            // climb or jump.  While it owns the root, normal movement must not
            // also translate the player in the same frame.
            const traversalOwnsMovement = useMotionMatching
                ? !!this.motionMatching.preUpdate?.(delta)
                : false;

            if (!traversalOwnsMovement) {
                this.movement?.update?.(delta);

                if (useMotionMatching) {
                    this.motionMatching.updateLocomotion?.(delta);
                } else if (!graphOwnsLocomotion) {
                    this.animationStateMachine?.update?.(delta);
                }
            }
        } else {
            if (this.input) {
                this.input.forward = 0;
                this.input.right = 0;
                this.input.fire = false;
                this.input.jump = false;
            }

            if (this.state?.speed > 0) {
                this.state.speed = 0;
            }

            // Keep a placed player physically attached to a deforming terrain
            // even when the editor is not currently giving it movement input.
            this.movement?.updatePassivePhysics?.(delta);
        }

        this.animation?.update?.(delta);
        this.cameraController?.update?.(delta);
    }
    teleport(x, y, z) {
        if (!this.ready || !this.character?.model) {
            return false;
        }
        if (
            !Number.isFinite(x) ||
            !Number.isFinite(y) ||
            !Number.isFinite(z)
        ) {
            console.warn('[SMPlayerSystem] teleport() received invalid coordinates.', {
                x,
                y,
                z
            });
            return false;
        }
        this.character.model.position.set(
            x,
            y,
            z
        );
        if (this.movement?.velocity) {
            this.movement.velocity.set(
                0,
                0,
                0
            );
        }
        if (this.movement?.desiredVelocity) {
            this.movement.desiredVelocity.set(
                0,
                0,
                0
            );
        }
        this.movement?.setGroundHeight?.(y);
        this.playerPhysics?.syncAfterTeleport?.();
        this.character.model.updateMatrixWorld(true);
        this._emit('teleport', {
            position: this.character.model.position.clone()
        });
        return true;
    }
    resetToSpawn() {
        const spawn = this.config.spawnPosition || [0, 0, 0];
        return this.teleport(
            Number(spawn[0] || 0),
            Number(spawn[1] || 0),
            Number(spawn[2] || 0)
        );
    }
    playAnimation(name, options = {}) {
        if (!this.ready || !this.animation) {
            return null;
        }
        const key = String(name || '').toUpperCase();
        if (!this.animation.has?.(key)) {
            console.warn(`[SMPlayerSystem] Animation "${key}" does not exist.`);
            return null;
        }
        return this.animation.play(
            key,
            options
        );
    }
    possessCamera(options = {}) {
        if (!this.ready) {
            console.warn('[SMPlayerSystem] Cannot possess Player Camera: player is not ready.');
            return false;
        }
        if (!this.enabled) {
            console.warn('[SMPlayerSystem] Cannot possess Player Camera: player is disabled.');
            return false;
        }
        if (!this.cameraController) {
            console.error('[SMPlayerSystem] Cannot possess Player Camera: cameraController does not exist.');
            return false;
        }
        if (!this.cameraController.camera) {
            console.error('[SMPlayerSystem] Cannot possess Player Camera: runtime camera does not exist.');
            return false;
        }
        if (typeof this.cameraController.activate !== 'function') {
            console.error('[SMPlayerSystem] Cannot possess Player Camera: activate() is missing.');
            return false;
        }
        this.cameraController.activate(options);
        // Build the initial third-person transform before the first render so
        // Play Mode never shows the camera at the origin for one frame.
        this.cameraController.update?.(0);
        const success =
            this.cameraController.active === true &&
            window._playerCameraActive === true &&
            window._playerCamera === this.cameraController.camera;
        console.log('[SMPlayerSystem] Player Camera possess result:', {
            success,
            controllerActive: this.cameraController.active,
            globalActive: window._playerCameraActive,
            cameraName: this.cameraController.camera?.name,
            renderCamera: window._activeRenderCamera?.name
        });
        return success;
    }
    releaseCamera() {
        if (!this.cameraController) {
            return false;
        }
        this.cameraController.deactivate?.();
        return true;
    }
    get playerCamera() {
        return this.cameraController?.camera || null;
    }
    forceIdle() {
        if (!this.ready || !this.enabled) {
            return false;
        }
        this.motionMatching?.reset?.();
        this.animationStateMachine?.reset?.();
        return this.animationStateMachine?.forceIdle?.() || false;
    }
    stopAnimations() {
        this.motionMatching?.reset?.();
        this.animationStateMachine?.reset?.();
        this.animation?.stopAll?.();
    }
    getAnimationState() {
        return {
            state: this.state?.current || null,
            previous: this.state?.previous || null,
            animation: this.animation?.currentKey || null,
            enabled: this.animation?.enabled || false,
            actions: this.animation
                ? Array.from(this.animation.actions.keys())
                : []
        };
    }
    getDebugState() {
        return {
            ready: this.ready,
            loading: this.loading,
            enabled: this.enabled,
            desiredEnabled: this.desiredEnabled,
            workspace: this.workspaceMode,
            character: {
                root: this.character?.model?.name || null,
                visual: this.character?.visual?.name || null,
                height: this.character?.height || null,
                position: this.character?.model?.position?.toArray?.() || null
            },
            input: {
                enabled: this.input?.enabled || false,
                forward: this.input?.forward || 0,
                right: this.input?.right || 0,
                fire: this.input?.fire || false
            },
            movement: {
                enabled: this.movement?.enabled || false,
                speed: this.state?.speed || 0,
                grounded: this.state?.grounded ?? false,
                velocity: this.movement?.velocity?.toArray?.() || null
            },
            animation: {
                enabled: this.animation?.enabled || false,
                current: this.animation?.currentKey || null,
                state: this.state?.current || null,
                actions: this.animation
                    ? Array.from(this.animation.actions.keys())
                    : []
            },
            physics: {
                enabled: this.playerPhysics?.enabled || false,
                grounded: this.playerPhysics?.grounded ?? null,
                verticalVelocity: this.playerPhysics?.verticalVelocity ?? 0,
                groundObject: this.playerPhysics?.groundObject?.name || null,
                groundNormal: this.playerPhysics?.groundNormal?.toArray?.() || null,
                terrainTestMode: this.terrainTestModeActive
            },
            motionMatching: this.motionMatching?.getDebugState?.() || null
        };
    }
    get model() {
        return this.character?.model || null;
    }
    get visual() {
        return this.character?.visual || null;
    }
    get mixer() {
        return this.animation?.mixer || null;
    }
    get position() {
        return this.character?.model?.position || null;
    }
    get isActive() {
        return (
            this.ready &&
            this.enabled
        );
    }
    activate() {
        this.setEnabled(true);
        return this;
    }
    deactivate() {
        this.setEnabled(false);
        return this;
    }
    addEventListener(type, listener, options) {
        this.events.addEventListener(
            type,
            listener,
            options
        );
    }
    removeEventListener(type, listener, options) {
        this.events.removeEventListener(
            type,
            listener,
            options
        );
    }
    dispatchEvent(event) {
        return this.events.dispatchEvent(event);
    }
    _emit(type, detail = {}) {
        try {
            this.events.dispatchEvent(
                new CustomEvent(
                    type,
                    {
                        detail
                    }
                )
            );
        } catch (error) {
            console.warn(`[SMPlayerSystem] Event "${type}" failed:`, error);
        }
    }
    dispose() {
        if (this._disposed) {
            return;
        }
        this._disposed = true;
        this.desiredEnabled = false;
        if (this.ready) {
            this._applyEnabledState(
                false,
                {
                    force: true,
                    reason: 'dispose'
                }
            );
        }
        this.motionMatching?.dispose?.();
        this.playerPhysics?.dispose?.();
        this.animationStateMachine?.dispose?.();
        this.animation?.dispose?.();
        this.input?.dispose?.();
        this.character?.dispose?.();
        this.motionMatching = null;
        this.playerPhysics = null;
        this.grounding = null;
        this.animationStateMachine = null;
        this.animation = null;
        this.animationLoader = null;
        this.movement = null;
        this.rotation = null;
        this.cameraController?.dispose?.();
        this.cameraController = null;
        this.input = null;
        this.state = null;
        this.character = null;
        this.ready = false;
        this.loading = false;
        this.enabled = false;
        this._loadingPromise = null;
        if (window.playerSystem === this) {
            window.playerSystem = null;
        }
        if (window.player === this) {
            window.player = null;
        }
        this._emit('disposed', {});
        console.log('[SMPlayerSystem] Disposed');
    }
}
window.SMPlayerSystem = SMPlayerSystem;
window.debugPlayerMotionMatching = function () {
    const state = window.playerSystem?.motionMatching?.getDebugState?.() || null;
    if (state) console.table?.(state);
    return state;
};
