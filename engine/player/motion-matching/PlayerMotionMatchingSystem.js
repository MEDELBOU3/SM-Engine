/**
 * PlayerMotionMatchingSystem.js
 * Hybrid Motion Matching v1 for SM Engine:
 * - feature-scored locomotion selection
 * - automatic obstacle traversal
 * - explicit root path driving for vault/climb/jump animations
 * - Space = jump / traversal request
 */
class SMPlayerMotionMatchingSystem {
    constructor({
        character,
        state,
        input,
        movement,
        physics,
        animation,
        camera,
        config = window.SMPlayerConfig,
        getWorld = () => window.gameplaySampleWorld || window.gameplaySampleEnvironment?.world || null
    } = {}) {
        this.character = character;
        this.state = state;
        this.input = input;
        this.movement = movement;
        this.physics = physics || movement?.collisionController || null;
        this.animation = animation;
        this.camera = camera;
        this.config = config || {};
        this.getWorld = getWorld;

        this.enabled = this.config.motionMatchingEnabled !== false;
        this.database = new SMPlayerMotionMatchingDatabase(
            window.SMPlayerAnimationManifest,
            this.config
        );
        this.traversalDetector = new SMPlayerTraversalDetector({
            character,
            movement,
            input,
            camera,
            config: this.config,
            getWorld: this.getWorld
        });
        this.traversalAnalyzer = new SMPlayerTraversalAnalyzer({
            physics: this.physics,
            config: this.config
        });
        this.traversalSelector = new SMPlayerTraversalAnimationSelector(
            window.SMPlayerAnimationManifest,
            this.config
        );
        this.motionWarper = new SMPlayerMotionWarper({
            physics: this.physics,
            config: this.config
        });

        this.traversal = null;
        this.cooldown = 0;
        this.matchAccumulator = 0;
        this.matchAge = 0;
        this.currentMatch = null;
        this.lastCandidates = [];
        this.actionLock = null;
        this.airborneStartY = null;
        this.airbornePeakY = null;
        this.airActionPlayed = false;
        this._slopeDirection = new THREE.Vector3();
        this._wasMovementEnabled = true;
        this._mixerFinished = this._onMixerFinished.bind(this);
        this.animation?.mixer?.addEventListener?.('finished', this._mixerFinished);
    }

    setEnabled(enabled) {
        this.enabled = !!enabled;
        if (!this.enabled) this.reset(false);
    }

    _workspaceAllowed() {
        const only = String(this.config.motionMatchingWorkspaceOnly || '').toUpperCase();
        if (!only) return true;
        const mode = String(
            window.playerSystem?.workspaceMode ||
            window.workspaceManager?.currentMode ||
            localStorage.getItem('sm_workspace_mode') ||
            ''
        ).toUpperCase();
        return mode === only;
    }

    _onMixerFinished(event) {
        if (!this.actionLock) return;
        const action = this.animation?.actions?.get(this.actionLock);
        if (action && event.action === action) {
            if (this.actionLock === 'FIRE' && this.state) {
                this.state.firing = false;
            }
            this.actionLock = null;
            this.currentMatch = null;
        }
    }

    _playLockedAction(key, fade = 0.07) {
        if (!this.animation?.has?.(key)) return false;
        this.actionLock = key;
        this.animation.playOneShot(key, { fade });
        this.state?.setState?.(key);
        return true;
    }

    _getDesiredDirection() {
        const f = Number(this.input?.forward || 0);
        const r = Number(this.input?.right || 0);
        const len = Math.hypot(f, r);
        if (len < 0.001) return { forward: 0, right: 0 };
        return { forward: f / len, right: r / len };
    }

    _buildQuery() {
        const dir = this._getDesiredDirection();
        const currentSpeed = Math.max(0, Number(this.state?.speed || 0));
        const hasInput = Math.hypot(dir.forward, dir.right) > 0.001;

        let targetSpeed = 0;
        if (hasInput) {
            if (dir.forward < -0.15) {
                targetSpeed = Number(this.config.backwardSpeed ?? 4.2);
            } else if (this.input?.sprint) {
                targetSpeed = Number(this.config.runSpeed ?? 6.2);
            } else if (Math.abs(dir.right) > 0.15 && dir.forward > 0.15) {
                targetSpeed = Number(this.config.diagonalRunSpeed ?? 5.2);
            } else {
                targetSpeed = Number(this.config.walkSpeed ?? 3.2);
            }
        }

        const response = targetSpeed > currentSpeed
            ? Number(this.config.acceleration ?? 12)
            : Number(this.config.deceleration ?? 16);
        const times = [0.20, 0.45, 0.80];
        const trajectory = times.map(time => ({
            time,
            forward: dir.forward,
            right: dir.right,
            speed: THREE.MathUtils.lerp(
                currentSpeed,
                targetSpeed,
                1 - Math.exp(-Math.max(0.01, response) * time)
            )
        }));

        return {
            speed: currentSpeed,
            targetSpeed,
            forward: dir.forward,
            right: dir.right,
            sprint: !!this.input?.sprint,
            grounded: this.state?.grounded !== false,
            trajectory
        };
    }

    _updateLocomotionPlaybackSpeed(match, delta = 0.016) {
        if (!match || match.key === 'IDLE') return;
        const action = this.animation?.actions?.get(match.key);
        if (!action) return;

        const referenceSpeed = Math.max(0.1, Number(match.speed || 1));
        const actualSpeed = Math.max(0, Number(this.state?.speed || 0));
        const scale = THREE.MathUtils.clamp(actualSpeed / referenceSpeed, 0.72, 1.22);
        const baseScale = Number(window.SMPlayerAnimationManifest?.[match.key]?.timeScale ?? 1);
        const targetScale = baseScale * scale;
        const currentScale = Number(action.getEffectiveTimeScale?.() ?? action.timeScale ?? targetScale);
        const alpha = 1 - Math.exp(-Math.max(1, Number(this.config.locomotionRateSmoothing ?? 10)) * Math.max(0, delta));
        action.setEffectiveTimeScale(THREE.MathUtils.lerp(currentScale, targetScale, alpha));
    }

    updateLocomotion(delta) {
        if (!this.enabled || !this._workspaceAllowed()) return false;
        if (this.traversal || this.actionLock) return false;
        if (this._updateAirborneAnimation()) return true;
        if (this._updateSlopeAnimation()) return true;

        this.matchAge += Math.max(0, Number(delta) || 0);
        this.matchAccumulator += delta;
        const interval = Math.max(0.016, Number(this.config.motionMatchInterval ?? 0.05));
        if (this.matchAccumulator < interval && this.currentMatch) {
            this._updateLocomotionPlaybackSpeed(this.currentMatch, delta);
            return true;
        }
        this.matchAccumulator = 0;

        const query = this._buildQuery();
        const result = this.database.select(
            query,
            key => this.animation?.has?.(key),
            this.animation?.currentKey || this.currentMatch?.key || null
        );

        this.lastCandidates = result.candidates;
        const best = result.best;
        if (!best) return false;

        let shouldSwitch = this.currentMatch?.key !== best.key || this.animation?.currentKey !== best.key;
        if (shouldSwitch && this.currentMatch) {
            const currentCandidate = result.candidates.find(item => item.key === this.currentMatch.key);
            const improvement = currentCandidate ? currentCandidate.score - best.score : Infinity;
            const minimumHold = Math.max(0, Number(this.config.motionMinimumHold ?? 0.12));
            const switchThreshold = Math.max(0, Number(this.config.motionSwitchThreshold ?? 0.07));
            shouldSwitch = this.matchAge >= minimumHold && improvement >= switchThreshold;
        }

        if (shouldSwitch) {
            this.currentMatch = best;
            this.matchAge = 0;
            this.state.motionMatch = {
                key: best.key,
                score: best.score,
                candidates: result.candidates.map(item => ({ key: item.key, score: item.score }))
            };
            this.state.setState(best.key);
            this.animation.play(best.key, {
                fade: Number(this.config.locomotionBlendTime ?? 0.16),
                syncPhase: true,
                warp: false
            });
        }

        this._updateLocomotionPlaybackSpeed(this.currentMatch || best, delta);
        return true;
    }

    _durationForClip(key, fallback, playRate = null) {
        const action = this.animation?.actions?.get(key);
        const clipDuration = Number(action?.getClip?.()?.duration || 0);
        const timeScale = Math.max(0.05, Number(
            playRate ?? window.SMPlayerAnimationManifest?.[key]?.timeScale ?? 1
        ));
        if (clipDuration > 0.05) {
            return THREE.MathUtils.clamp(
                clipDuration / timeScale,
                Number(this.config.traversalMinDuration ?? 0.45),
                Number(this.config.traversalMaxDuration ?? 3.4)
            );
        }
        return fallback;
    }

    _beginTraversal(plan) {
        if (!plan || this.traversal || this.cooldown > 0) return false;
        const selection = plan.selection || this.traversalSelector.select(
            plan,
            key => this.animation?.has?.(key)
        );
        if (!selection?.clip || !this.animation?.has?.(selection.clip)) return false;

        const root = this.character?.model;
        if (!root) return false;

        let fallbackDuration = 0.9;
        if (plan.type === 'CLIMB') fallbackDuration = 1.15;
        if (plan.type === 'CLIMB_WALL') fallbackDuration = 1.45;
        if (plan.type === 'BIG_JUMP') fallbackDuration = 1.05;
        if (plan.type === 'JUMP') fallbackDuration = 0.90;

        const duration = this._durationForClip(selection.clip, fallbackDuration, selection.playRate);
        const forward = plan.forward?.clone?.() || new THREE.Vector3(0, 0, -1);

        this._wasMovementEnabled = !!this.movement?.enabled;
        this.movement?.setEnabled?.(false);
        this.movement?.velocity?.set?.(0, 0, 0);
        this.movement?.desiredVelocity?.set?.(0, 0, 0);
        this.movement?.rotation?.snapToDirection?.(forward);

        this.traversal = this.motionWarper.begin(
            { ...plan, forward },
            selection,
            duration
        );

        this.state.grounded = false;
        this.state.airborne = true;
        this.state.speed = 0;
        this.state.setTraversal(plan.type, plan.obstacle || null);
        this.state.traversalAnchors = this.traversal.anchors || null;
        this.state.setState(plan.type);
        this.currentMatch = null;

        this.animation.playOneShot(selection.clip, {
            fade: selection.blendIn,
            timeScale: selection.playRate,
            warp: false
        });

        if (this.config.motionMatchingDebug) {
            console.log('[MotionMatching] Traversal start', {
                type: plan.type,
                clip: selection.clip,
                obstacle: plan.obstacle?.name,
                topHeight: plan.topHeight,
                duration
            });
        }
        return true;
    }

    _makeManualJumpPlan(big = false) {
        const root = this.character?.model;
        if (!root) return null;

        const forward = this.traversalDetector._getForward().clone();
        const distance = big
            ? Number(this.config.bigJumpDistance ?? 5.2)
            : Number(this.config.jumpDistance ?? 3.4);

        const start = root.position.clone();
        const end = start.clone().addScaledVector(forward, distance);

        return {
            type: big ? 'BIG_JUMP' : 'JUMP',
            obstacle: null,
            ignoreObjects: [],
            collider: new THREE.Box3(start.clone(), start.clone()),
            topHeight: 0,
            depth: distance,
            approachSpeed: Number(this.state?.speed || 0),
            forward,
            start,
            end,
            anchors: {
                approach: start.clone(),
                contact: start.clone().lerp(end, 0.25),
                top: start.clone().lerp(end, 0.5),
                apex: start.clone().lerp(end, 0.5).add(new THREE.Vector3(
                    0,
                    big ? Number(this.config.bigJumpArcHeight ?? 1.55) : Number(this.config.jumpArcHeight ?? 1.0),
                    0
                )),
                landing: end.clone()
            }
        };
    }

    preUpdate(delta) {
        if (!this.enabled || !this._workspaceAllowed()) return false;
        if (this.cooldown > 0) this.cooldown = Math.max(0, this.cooldown - delta);

        if (this.traversal) {
            this._updateTraversal(delta);
            return true;
        }

        if (this.input?.consumeJustFired?.() && !this.actionLock && this.animation?.has?.('FIRE')) {
            this.state.firing = true;
            this._playLockedAction('FIRE', 0.07);
        }

        const jumpPressed = !!this.input?.consumeJumpPressed?.();
        const movingForward = Number(this.input?.forward || 0) > 0.2;
        const autoTraversal =
            this.config.autoTraversal !== false &&
            movingForward &&
            Number(this.state?.speed || 0) >= Number(this.config.traversalMinAutoSpeed ?? 1.1);

        if (this.cooldown <= 0 && (jumpPressed || autoTraversal)) {
            this.physics?.refreshWorld?.(true);
            const measurement = this.traversalDetector.detect();
            const plan = this.traversalAnalyzer.analyze(measurement);
            if (plan) {
                plan.selection = this.traversalSelector.select(
                    plan,
                    key => this.animation?.has?.(key)
                );
                if (plan.selection && this._beginTraversal(plan)) return true;
            }
        }

        if (jumpPressed && this.cooldown <= 0) {
            const big = !!this.input?.sprint || Number(this.state?.speed || 0) > 4.5;
            const jumpPlan = this._makeManualJumpPlan(big);
            if (jumpPlan) {
                jumpPlan.selection = this.traversalSelector.select(
                    jumpPlan,
                    key => this.animation?.has?.(key)
                );
                if (jumpPlan.selection && this._beginTraversal(jumpPlan)) return true;
            }
        }

        return false;
    }

    _updateAirborneAnimation() {
        const root = this.character?.model;
        if (!root) return false;

        if (this.state?.grounded === false) {
            if (this.airborneStartY == null) {
                this.airborneStartY = root.position.y;
                this.airbornePeakY = root.position.y;
                this.airActionPlayed = false;
            }
            this.airbornePeakY = Math.max(this.airbornePeakY ?? root.position.y, root.position.y);
            if (!this.airActionPlayed && !this.actionLock && this.animation?.has?.('RUNNING_JUMP')) {
                this.animation.playOneShot('RUNNING_JUMP', { fade: 0.06 });
                this.state?.setState?.('RUNNING_JUMP');
                this.airActionPlayed = true;
            }
            return true;
        }

        if (this.airborneStartY != null) {
            const drop = Math.max(0, Number(this.airbornePeakY || 0) - root.position.y);
            const rollThreshold = Math.max(0.25, Number(this.config.landingRollMinDrop ?? 1.15));
            this.airborneStartY = null;
            this.airbornePeakY = null;
            this.airActionPlayed = false;
            if (drop >= rollThreshold && !this.actionLock && this.animation?.has?.('FALL_ROLL')) {
                this._playLockedAction('FALL_ROLL', 0.05);
                return true;
            }
        }
        return false;
    }

    _updateSlopeAnimation() {
        if (this.state?.grounded === false || !this.animation?.has?.('UPHILL_SKIING')) return false;
        const physics = this.movement?.collisionController;
        const normal = physics?.groundNormal;
        const moveDirection = this.movement?.moveDirection;
        if (!normal?.isVector3 || !moveDirection?.isVector3 || moveDirection.lengthSq() < 0.01) return false;

        const minAngle = THREE.MathUtils.degToRad(Number(this.config.uphillAnimationMinAngle ?? 11));
        if (normal.y >= Math.cos(minAngle)) return false;

        this._slopeDirection.set(-normal.x, 0, -normal.z);
        if (this._slopeDirection.lengthSq() < 0.0001) return false;
        this._slopeDirection.normalize();
        const uphillAmount = moveDirection.dot(this._slopeDirection);
        if (uphillAmount < Number(this.config.uphillAnimationMinDot ?? 0.20)) return false;

        if (this.animation.currentKey !== 'UPHILL_SKIING') {
            this.currentMatch = { key: 'UPHILL_SKIING', score: 0, category: 'slope' };
            this.state?.setState?.('UPHILL_SKIING');
            this.animation.play('UPHILL_SKIING', { fade: 0.10 });
        }
        return true;
    }

    _updateTraversal(delta) {
        const tr = this.traversal;
        const root = this.character?.model;
        if (!tr || !root) return;
        const result = this.motionWarper.update(tr, delta, root);
        this.state.traversalProgress = result.progress;
        this.state.velocity.set(0, 0, 0);
        if (result.aborted) {
            this._cancelTraversal(`blocked:${result.hitObject?.name || 'world'}`);
            return;
        }
        if (result.finished) this._finishTraversal();
    }

    _cancelTraversal(reason = 'cancelled') {
        const tr = this.traversal;
        const root = this.character?.model;
        if (!tr || !root) return;

        const safe = tr.lastSafe?.clone?.() || tr.start.clone();
        if (!this.physics?.isCapsulePositionFree?.(safe)) safe.copy(tr.start);
        const ground = this.physics?.probeGround?.(safe, safe.y + 0.5, this.physics.height + 1.0);
        if (ground) safe.y = ground.point.y + this.physics.groundOffset;
        root.position.copy(safe);
        root.updateMatrixWorld(true);
        this._releaseTraversalControl();
        this.cooldown = Math.max(0.1, Number(this.config.traversalCooldown ?? 0.24));
        if (this.config.motionMatchingDebug) console.warn('[MotionMatching] Traversal cancelled:', reason);
    }

    _releaseTraversalControl() {
        const root = this.character?.model;
        this.movement?.setGroundHeight?.(root?.position?.y ?? 0);
        this.movement?.velocity?.set?.(0, 0, 0);
        this.movement?.desiredVelocity?.set?.(0, 0, 0);
        this.movement?.setEnabled?.(this._wasMovementEnabled);
        this.physics?.syncAfterTeleport?.();
        this.traversal = null;
        this.state.grounded = true;
        this.state.airborne = false;
        this.state.clearTraversal?.();
        this.state.speed = 0;
        this.currentMatch = null;
        this.actionLock = null;
        this.matchAccumulator = Number(this.config.motionMatchInterval ?? 0.05);
    }

    _finishTraversal() {
        const tr = this.traversal;
        const root = this.character?.model;
        if (!tr || !root) return;

        if (!this.motionWarper.validateFinish(tr)) {
            this._cancelTraversal('unsafe-landing');
            return;
        }
        root.position.copy(tr.end);
        root.updateMatrixWorld(true);

        const finishedType = tr.type;
        this.cooldown = Math.max(0, Number(this.config.traversalCooldown ?? 0.24));
        this._releaseTraversalControl();

        if (this.config.motionMatchingDebug) {
            console.log('[MotionMatching] Traversal finished:', finishedType);
        }
    }

    reset(restoreMovement = true) {
        // Cancel from the current transform. Workspace changes or pause should
        // never teleport the player to a traversal's planned landing point.
        if (this.traversal && this.character?.model) {
            this.movement?.setGroundHeight?.(this.character.model.position.y);
            if (restoreMovement) {
                this.movement?.setEnabled?.(this._wasMovementEnabled);
            }
        }
        this.traversal = null;
        this.cooldown = 0;
        this.matchAccumulator = 0;
        this.matchAge = 0;
        this.currentMatch = null;
        this.lastCandidates = [];
        this.actionLock = null;
        this.airborneStartY = null;
        this.airbornePeakY = null;
        this.airActionPlayed = false;
        this.state?.clearTraversal?.();
        if (this.state) {
            this.state.airborne = false;
            this.state.motionMatch = null;
        }
    }

    getDebugState() {
        return {
            enabled: this.enabled,
            workspaceAllowed: this._workspaceAllowed(),
            current: this.currentMatch?.key || this.animation?.currentKey || null,
            actionLock: this.actionLock,
            traversal: this.traversal ? {
                type: this.traversal.type,
                clip: this.traversal.clip,
                obstacle: this.traversal.obstacle?.name || null,
                progress: this.state?.traversalProgress || 0
            } : null,
            candidates: this.lastCandidates.map(item => ({
                key: item.key,
                score: Number(item.score.toFixed(3))
            }))
        };
    }

    dispose() {
        this.animation?.mixer?.removeEventListener?.('finished', this._mixerFinished);
        this.reset(false);
    }
}
window.SMPlayerMotionMatchingSystem = SMPlayerMotionMatchingSystem;
