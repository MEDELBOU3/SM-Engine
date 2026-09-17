// SM Engine - PlayerAnimationRuntimeBridge
(function () {
    const Bridge = {
        installed: false,
        runtime: null,
        parameters: null,
        adapter: null,
        playerSystem: null,
        player: null,
        controller: null,
        frameCallback: null,
        wrappedPlayerUpdate: false,
        attempts: 0,
        maxAttempts: 120,
        install() {
            if (this.installed && this.runtime) return true;
            if (typeof window.PlayerAnimationParameters !== 'function' || typeof window.PlayerAnimationActionAdapter !== 'function' || typeof window.PlayerAnimationGraphRuntime !== 'function') {
                console.warn('[PlayerAnimationRuntimeBridge] Runtime files are not loaded yet.');
                return false;
            }
            this.playerSystem = window.playerSystem || null;
            this.player = window.player || this.playerSystem?.player || this.playerSystem?.character || null;
            this.controller = this._resolveController();
            if (!this.controller && !this.player && !this.playerSystem) {
                return false;
            }
            this.parameters = new window.PlayerAnimationParameters();
            this.adapter = new window.PlayerAnimationActionAdapter(this.controller, { playerSystem: this.playerSystem, player: this.player });
            this.runtime = new window.PlayerAnimationGraphRuntime({ parameters: this.parameters, controller: this.adapter, machineName: 'Locomotion' });
            // A saved graph is an editor asset, not permission to take over
            // the live character.  Loading it used to immediately play its
            // Entry/Idle state onto the same mixer as the normal locomotion
            // controller, leaving a moving player visually frozen in Idle.
            // The graph is now loaded for editing/preview but only owns the
            // player after an explicit setPlayerAnimationGraphEnabled(true).
            this.runtime.enabled = false;
            this.runtime.loadFromStorage('Locomotion');
            this._setGraphRuntimeActive(false);
            window.playerAnimationParameters = this.parameters;
            window.playerAnimationActionAdapter = this.adapter;
            window.playerAnimationRuntime = this.runtime;
            window.reloadPlayerAnimationRuntime = () => {
                const loaded = this.runtime?.reload?.();
                const wasEnabled = window.playerAnimationGraphActive === true;
                this._setGraphRuntimeActive(wasEnabled && loaded);
                return loaded;
            };
            window.setPlayerAnimationGraphEnabled = enabled => this._setGraphRuntimeActive(enabled);
            window.debugPlayerAnimationRuntime = () => this.runtime?.getDebugState?.();
            window.setPlayerAnimationFloat = (name, value) => this.parameters?.setFloat?.(name, value);
            window.setPlayerAnimationBool = (name, value) => this.parameters?.setBool?.(name, value);
            this._bindFrame();
            this._bindEvents();
            this.installed = true;
            console.log('[PlayerAnimationRuntimeBridge] installed');
            return true;
        },
        _resolveController() {
            return window.playerAnimationController || window.playerSystem?.animationController || window.playerSystem?.animation || window.player?.animationController || window.player?.animation || null;
        },
        _setGraphRuntimeActive(active) {
            const playerSystem = window.playerSystem || this.playerSystem;
            const enabled = active === true && this.runtime?.loaded === true;
            // Runtime.update() is the only graph operation allowed to alter
            // controller actions. Keep this flag and runtime.enabled in lock
            // step so an inactive graph can never override player clips.
            if (this.runtime) this.runtime.enabled = enabled;
            if (playerSystem) {
                playerSystem.animationGraphRuntimeActive = enabled;
                playerSystem.animationGraphFallbackToLocomotion = false;
            }
            window.playerAnimationGraphActive = enabled;
            return enabled;
        },
        _bindFrame() {
            if (Array.isArray(window.engineFrameCallbacks)) {
                if (this.frameCallback && !window.engineFrameCallbacks.includes(this.frameCallback)) window.engineFrameCallbacks.push(this.frameCallback);
                if (!this.frameCallback) {
                    this.frameCallback = (delta) => this.update(delta);
                    this.frameCallback.__smPlayerAnimationRuntime = true;
                    window.engineFrameCallbacks.push(this.frameCallback);
                }
                console.log('[PlayerAnimationRuntimeBridge] attached to engineFrameCallbacks');
                return;
            }
            const ps = this.playerSystem;
            if (ps && typeof ps.update === 'function' && !ps.update.__smAnimationRuntimeWrapped) {
                const original = ps.update.bind(ps);
                const bridge = this;
                const wrapped = function (delta, ...args) {
                    const result = original(delta, ...args);
                    bridge.update(delta);
                    return result;
                };
                wrapped.__smAnimationRuntimeWrapped = true;
                wrapped.__smOriginalUpdate = original;
                ps.update = wrapped;
                this.wrappedPlayerUpdate = true;
                console.log('[PlayerAnimationRuntimeBridge] attached to playerSystem.update');
                return;
            }
            console.warn('[PlayerAnimationRuntimeBridge] No frame hook found. Call window.updatePlayerAnimationRuntime(delta) inside animate().');
            window.updatePlayerAnimationRuntime = (delta) => this.update(delta);
        },
        _bindEvents() {
            if (this.__eventsBound) return;
            this.__eventsBound = true;
            const reload = () => {
                const wasEnabled = window.playerAnimationGraphActive === true;
                const loaded = this.runtime?.reload?.();
                this._setGraphRuntimeActive(wasEnabled && loaded);
            };
            window.addEventListener('sm:animation-graph-compiled', () => setTimeout(reload, 0));
            window.addEventListener('sm:player-animation-reload', reload);
            window.addEventListener('sm:player-model-changed', () => this.rebind());
        },
        rebind() {
            if (!this.installed) return this.install();
            this.playerSystem = window.playerSystem || this.playerSystem;
            this.player = window.player || this.playerSystem?.player || this.player;
            this.controller = this._resolveController() || this.controller;
            this.adapter = new window.PlayerAnimationActionAdapter(this.controller, { playerSystem: this.playerSystem, player: this.player });
            this.runtime?.setController?.(this.adapter);
            window.playerAnimationActionAdapter = this.adapter;
            console.log('[PlayerAnimationRuntimeBridge] rebound animation target');
            return true;
        },
        update(delta) {
            if (!this.runtime || !this.parameters) return;
            const playerSystem = window.playerSystem || this.playerSystem;
            // Do not touch the shared AnimationMixer unless the user has
            // deliberately enabled this graph.  The standard player state
            // machine then remains the single owner of Idle/Walk/Run clips.
            if (
                this.runtime.enabled !== true ||
                playerSystem?.animationGraphRuntimeActive !== true
            ) return;
            // The Gameplay Sample motion-matching system owns the same mixer
            // while Play is active. Running the graph runtime at the same time
            // makes two state machines cross-fade the same actions and produces
            // pose popping / broken blends.
            if (
                playerSystem?.runtimeControlActive === true &&
                playerSystem?.simulationPaused !== true &&
                playerSystem?.motionMatching?.enabled === true &&
                playerSystem.motionMatching._workspaceAllowed?.() &&
                playerSystem.animationGraphRuntimeActive !== true
            ) return;
            this._syncParameters();
            if (this._shouldYieldToLocomotion(playerSystem)) {
                // A graph that only contains Idle (or has no valid outgoing
                // movement transition) must never freeze the playable
                // character. Let the proven locomotion state machine own the
                // mixer until the graph has a non-idle state to play.
                playerSystem.animationGraphFallbackToLocomotion = true;
                return;
            }
            if (playerSystem) playerSystem.animationGraphFallbackToLocomotion = false;
            this.runtime.update(delta);
        },
        _shouldYieldToLocomotion(playerSystem) {
            if (playerSystem?.animationGraphRuntimeActive !== true) return false;
            const speed = this.parameters?.getFloat?.('Speed', 0) || 0;
            const forward = Math.abs(Number(playerSystem?.input?.forward || 0));
            const right = Math.abs(Number(playerSystem?.input?.right || 0));
            if (speed < 0.08 && forward < 0.01 && right < 0.01) return false;

            const state = this.runtime?.getCurrentState?.();
            const motion = state?.motion || {};
            const type = motion.type || motion.motionType || 'clip';
            const clip = String(motion.clip || state?.name || '').trim().toUpperCase();
            // A valid graph transition means the authored graph is healthy;
            // give it a frame to leave Idle before using the fallback.
            if (state && this.runtime?._findValidTransition?.(state.id)) {
                return false;
            }
            return type === 'clip' && (!clip || /(^|[_\s-])IDLE($|[_\s-])/.test(clip));
        },
        _syncParameters() {
            const source = this.player || this.playerSystem?.player || this.playerSystem || {};
            const movement = source.movement || source.characterMovement || this.playerSystem?.movement || this.playerSystem?.characterMovement || {};
            const velocity = this._resolveVelocity(source, movement);
            const vx = Number(velocity?.x) || 0;
            const vy = Number(velocity?.y) || 0;
            const vz = Number(velocity?.z) || 0;
            let speed = Math.sqrt(vx * vx + vz * vz);
            if (speed < 0.0001) {
                const candidates = [movement.horizontalSpeed, movement.currentSpeed, movement.speed, source.horizontalSpeed, source.currentSpeed, source.speed, this.playerSystem?.currentSpeed];
                for (const value of candidates) {
                    const n = Number(value);
                    if (Number.isFinite(n) && Math.abs(n) > speed) { speed = Math.abs(n); break; }
                }
            }
            const grounded = this._resolveGrounded(source, movement);
            const running = this._resolveRunning(source, movement, speed);
            const moving = speed > 0.03;
            const direction = moving ? Math.atan2(vx, vz) * 180 / Math.PI : 0;
            this.parameters.setFloat('Speed', speed);
            this.parameters.setFloat('Direction', direction);
            this.parameters.setFloat('VerticalSpeed', vy);
            this.parameters.setBool('IsGrounded', grounded);
            this.parameters.setBool('IsRunning', running);
            this.parameters.setBool('IsMoving', moving);
            if (typeof this.controller?.setFloat === 'function') {
                try {
                    this.controller.setFloat('Speed', speed);
                    this.controller.setFloat('Direction', direction);
                    this.controller.setFloat('VerticalSpeed', vy);
                } catch { }
            }
            if (typeof this.controller?.setBool === 'function') {
                try {
                    this.controller.setBool('IsGrounded', grounded);
                    this.controller.setBool('IsRunning', running);
                } catch { }
            }
        },
        _resolveVelocity(source, movement) {
            const candidates = [source.velocity, movement.velocity, movement.linearVelocity, source.linearVelocity, this.playerSystem?.velocity, this.playerSystem?.linearVelocity, source.body?.velocity, source.physicsBody?.velocity, source.rigidBody?.velocity];
            for (const value of candidates) {
                if (value && Number.isFinite(Number(value.x)) && Number.isFinite(Number(value.y)) && Number.isFinite(Number(value.z))) return value;
            }
            if (typeof source.getVelocity === 'function') {
                try {
                    const value = source.getVelocity();
                    if (value) return value;
                } catch { }
            }
            if (typeof movement.getVelocity === 'function') {
                try {
                    const value = movement.getVelocity();
                    if (value) return value;
                } catch { }
            }
            return { x: 0, y: 0, z: 0 };
        },
        _resolveGrounded(source, movement) {
            const candidates = [source.isGrounded, source.grounded, movement.isGrounded, movement.grounded, this.playerSystem?.isGrounded, this.playerSystem?.grounded, source.characterController?.isGrounded, source.controller?.isGrounded];
            for (const value of candidates) {
                if (typeof value === 'boolean') return value;
            }
            if (typeof source.isOnGround === 'function') {
                try { return !!source.isOnGround(); } catch { }
            }
            return true;
        },
        _resolveRunning(source, movement, speed) {
            const candidates = [source.isRunning, source.running, source.isSprinting, source.sprinting, movement.isRunning, movement.running, movement.isSprinting, movement.sprinting, this.playerSystem?.isRunning, this.playerSystem?.isSprinting];
            for (const value of candidates) {
                if (typeof value === 'boolean') return value;
            }
            return speed > 4.25;
        }
    };
    window.PlayerAnimationRuntimeBridge = Bridge;
    function tryInstall() {
        if (Bridge.install()) return;
        Bridge.attempts++;
        if (Bridge.attempts < Bridge.maxAttempts) setTimeout(tryInstall, 250);
        else console.warn('[PlayerAnimationRuntimeBridge] Player was not available after startup retries.');
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(tryInstall, 0), { once: true });
    else setTimeout(tryInstall, 0);
})();
