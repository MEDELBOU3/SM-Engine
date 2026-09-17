class PlayerEventDispatcher {
    constructor() { this._map = {}; }
    addEventListener(type, cb) {
        if (!type || typeof cb !== 'function') return;
        (this._map[type] || (this._map[type] = [])).push(cb);
    }
    removeEventListener(type, cb) {
        const list = this._map[type];
        if (!list) return;
        this._map[type] = list.filter(fn => fn !== cb);
    }
    dispatch(type, detail = {}) {
        (this._map[type] || []).forEach(cb => {
            try { cb(detail); }
            catch (error) { console.error(`[PlayerEventDispatcher] ${type}`, error); }
        });
    }
}

class AdvancedPlayerController {
    constructor(scene, camera) {
        this.scene = scene;
        this.camera = camera;
        this.model = null;
        this.mixer = null;
        this.actions = {};
        this.activeAction = null;
        this.state = 'idle';
        this.isActive = false;
        this.health = 100;
        this.events = new PlayerEventDispatcher();

        this.debug = false;
        this.boxHelper = null;
        this.lastLogTime = 0;
        this.pressedKeys = new Set();

        this.velocity = new THREE.Vector3();
        this.gravity = -30.0;
        this.jumpForce = 14.0;
        this.isGrounded = false;
        this.lastGrounded = false;
        this.acceleration = 60.0;
        this.damping = 35.0;
        this.moveSpeed = 4.5;
        this.runSpeed = 8.5;
        this.rotationSpeed = 10.0;
        this.turnSpeed = 3.4;
        this.backpedalSpeed = 2.8;

        this.collidableObjects = [];
        this.groundObject = null;
        this.groundHeight = 0;
        this.playerBox = new THREE.Box3();
        this.playerBoxSize = new THREE.Vector3(0.7, 1.8, 0.7);
        this.playerBoxOffset = new THREE.Vector3(0, 0.9, 0);
        this.collisionSkin = 0.02;
        this.maxStepHeight = 0.45;
        this.supportProbeDepth = 0.18;
        this.obstaclesGroup = null;
        this.updatePlayerBox(new THREE.Vector3(0, 0, 5));

        this.cameraOffset = new THREE.Vector3(0, 2.2, 5.5);
        this.cameraLookAtOffset = new THREE.Vector3(0, 1.7, 0);
        this.cameraTargetPosition = new THREE.Vector3();
        this.cameraTargetLookAt = new THREE.Vector3();
        this.cameraLerpFactor = 0.1;
        // The visible rig/chest faces local -X, while the imported root object
        // still translates naturally along local +Z.
        this.modelForwardAxis = new THREE.Vector3(-1, 0, 0);
        this.movementForwardAxis = new THREE.Vector3(0, 0, 1);
        this.modelUpAxis = new THREE.Vector3(0, 1, 0);

        this.tempVectors = {
            cameraForward: new THREE.Vector3(),
            cameraRight: new THREE.Vector3(),
            moveDirection: new THREE.Vector3(),
            targetVelocity: new THREE.Vector3(),
            horizontalVelocity: new THREE.Vector3(),
            goalPosition: new THREE.Vector3(),
            goalLookAt: new THREE.Vector3(),
            localMoveDirection: new THREE.Vector3(),
            localRightAxis: new THREE.Vector3(),
            planarVelocity: new THREE.Vector3(),
            quaternion: new THREE.Quaternion()
        };

        this.motionMatching = {
            enabled: true,
            preferredPackName: 'Universal Animation Library 2',
            manifest: null,
            manifestStatus: 'embedded-only',
            database: [],
            descriptorByKey: new Map(),
            current: null,
            currentFrame: null,
            activeSource: 'embedded',
            desiredMode: 'auto',
            forcedClip: '',
            externalClipCount: 0,
            minSwitchIntervalMs: 200,
            lastSwitchTime: 0,
            hudHostId: 'gui-container',
            hudRoot: null,
            lastHudUpdate: 0,
            lastRankedMatches: [],
            lastEventSignature: '',
            pendingLibraryLoad: null,
            fallbackMode: 'unknown',
            runtime: null,
            validation: null,
            frameDatabaseSize: 0,
            selectedBones: []
        };

        this.blendLocomotion = {
            active: false,
            initialized: false,
            actions: { idle: null, walk: null, run: null },
            weights: { idle: 1, walk: 0, run: 0 }
        };

        this.setupKeyboardControls();
        this.physicsBody = null;
    }

    fitColliderToModel() {
        if (!this.model) return;
        this.model.updateMatrixWorld?.(true);

        const bounds = new THREE.Box3().setFromObject(this.model);
        if (!Number.isFinite(bounds.min.x) || !Number.isFinite(bounds.max.y)) return;

        const size = bounds.getSize(new THREE.Vector3());
        const center = bounds.getCenter(new THREE.Vector3());
        const modelWorldPos = new THREE.Vector3();
        this.model.getWorldPosition(modelWorldPos);

        const fittedWidth = THREE.MathUtils.clamp(Math.max(size.x, size.z) * 0.42, 0.38, 1.05);
        const fittedDepth = THREE.MathUtils.clamp(Math.min(Math.max(size.x, size.z) * 0.42, size.z * 0.8 || 0.6), 0.34, 1.0);
        const fittedHeight = THREE.MathUtils.clamp(size.y * 0.92, 1.45, 2.25);
        const bottomY = bounds.min.y;
        const offsetY = (bottomY - modelWorldPos.y) + fittedHeight * 0.5;

        this.playerBoxSize.set(fittedWidth, fittedHeight, fittedDepth);
        this.playerBoxOffset.set(center.x - modelWorldPos.x, offsetY, center.z - modelWorldPos.z);
        this.updatePlayerBox();
    }

    configureMotionMatching(options = {}) {
        if (typeof options.enabled === 'boolean') this.motionMatching.enabled = options.enabled;
        if (typeof options.hudHostId === 'string' && options.hudHostId.trim()) {
            this.motionMatching.hudHostId = options.hudHostId.trim();
        }
        if (options.manifest && typeof options.manifest === 'object') {
            this.motionMatching.manifest = options.manifest;
            if (typeof options.manifest.packName === 'string' && options.manifest.packName.trim()) {
                this.motionMatching.preferredPackName = options.manifest.packName.trim();
            }
        }
    }

    init(gltf, collidableMeshList, obstaclesGroup = null, groundObject = null) {
        this.model = gltf.scene;
        // Move starting position higher to ensure clean gravity drop
        this.model.position.set(0, 1.5, 5);
        this.mixer = new THREE.AnimationMixer(this.model);

        if (window.physicsSystem) {
            window.physicsSystem.addBody(this.model, {
                mass: 1,                // Dynamic body
                shapeType: 'capsule',   // Best for characters
                fixedRotation: true,    // Character won't fall over like a pin
                friction: 0.1,
                restitution: 0,
                pos: this.model.position.clone(),
                size: [0.6, 1.8, 0.6]   // Width, Height, Depth
            });
            this.physicsBody = true;
        }
        this._registerAnimationClips(gltf.animations || [], { source: 'embedded' });
        console.log('[MotionMatching] Embedded clips:', this.motionMatching.database.map(entry => entry.key));
        this._rebuildMotionMatchingRuntime('embedded-init');
        this._queueMotionLibraryLoad();
        this._ensureMotionDebugHud();

        this.obstaclesGroup = obstaclesGroup || null;
        this.groundObject = groundObject || (Array.isArray(collidableMeshList)
            ? collidableMeshList.find(mesh => mesh?.name === 'UnrealEngineFloor') || null
            : null);
        this.groundHeight = this.getGroundHeight(this.model.position);

        this.collidableObjects = Array.isArray(collidableMeshList)
            ? collidableMeshList
                .filter(mesh => mesh && mesh !== this.groundObject)
                .map(mesh => {
                    if (mesh.updateMatrixWorld) mesh.updateMatrixWorld(true);
                    return {
                        mesh,
                        box: new THREE.Box3().setFromObject(mesh)
                    };
                })
            : [];

        this.fitColliderToModel();
        this.updatePlayerBox(); // Force initial box sync

        this.fadeToAction('idle', 0.1, { syncState: true });
        this._emitMotionMatchingUpdate(true);

        if (this.debug) {
            this.boxHelper = new THREE.Box3Helper(this.playerBox, 0x00ff00);
            this.scene.add(this.boxHelper);
        }
    }

    prepareForModelSwap() {
        if (this.mixer) {
            try { this.mixer.stopAllAction(); } catch (_) {}
            if (this.model) {
                try { this.mixer.uncacheRoot?.(this.model); } catch (_) {}
            }
        }

        this.model = null;
        this.mixer = null;
        this.actions = {};
        this.activeAction = null;
        this.state = 'idle';
        this.velocity.set(0, 0, 0);
        this.isGrounded = false;
        this.lastGrounded = false;

        this.motionMatching.database = [];
        this.motionMatching.descriptorByKey = new Map();
        this.motionMatching.current = null;
        this.motionMatching.currentFrame = null;
        this.motionMatching.activeSource = 'embedded';
        this.motionMatching.externalClipCount = 0;
        this.motionMatching.lastRankedMatches = [];
        this.motionMatching.lastEventSignature = '';
        this.motionMatching.pendingLibraryLoad = null;
        this.motionMatching.manifestStatus = 'embedded-only';
        this.motionMatching.fallbackMode = 'unknown';
        this.motionMatching.validation = null;
        this.motionMatching.frameDatabaseSize = 0;
        this.motionMatching.selectedBones = [];
        this.motionMatching.runtime?.dispose?.();
        this.motionMatching.runtime = null;

        this.blendLocomotion.active = false;
        this.blendLocomotion.initialized = false;
        this.blendLocomotion.actions = { idle: null, walk: null, run: null };
        this.blendLocomotion.weights = { idle: 1, walk: 0, run: 0 };
    }

    activate() {
        if (!this.model) return;
        this.isActive = true;
        this.isPlayerControlActive = true;
        this.pressedKeys.clear();
        this.velocity.set(0, 0, 0);
        if (typeof controls !== 'undefined' && controls) controls.enabled = false;
    }

    deactivate() {
        this.isActive = false;
        this.velocity.set(0, 0, 0);
        this.isPlayerControlActive = false;
        this._resetBlendLocomotionToIdle();
        this.fadeToAction('idle', 0.2, { syncState: true });
        if (typeof controls !== 'undefined' && controls) controls.enabled = true;
        this.pressedKeys.clear();
    }

    setupKeyboardControls() {
        const onKeyChange = (e, isPressed) => {
            if (!this.isActive) return;
            switch (e.key.toLowerCase()) {
                case 'shift':
                case 'arrowup':
                case 'arrowdown':
                case 'arrowleft':
                case 'arrowright':
                case 'w':
                case 'a':
                case 's':
                case 'd':
                    if (isPressed) this.pressedKeys.add(e.key.toLowerCase());
                    else this.pressedKeys.delete(e.key.toLowerCase());
                    break;
                case ' ':
                    if (isPressed && this.isGrounded) this.jump();
                    break;
            }
        };
        window.addEventListener('keydown', e => onKeyChange(e, true));
        window.addEventListener('keyup', e => onKeyChange(e, false));
    }

    jump() {
        if (!this.isGrounded) return;
        this.isGrounded = false;
        this.velocity.y = this.jumpForce;
        if (!this._shouldUseBlendFallback() && this._resolveAction('jump')) {
            this.fadeToAction('jump', 0.1, { syncState: true, oneShot: true });
        }
        this.dispatchPlayerEvent('event.onJump', { clip: this.getMotionMatchingState().clip, state: 'jump' });
    }

    update(delta) {
        if (!this.model || !this.mixer || !this.isActive || delta <= 0) return;
        delta = Math.min(delta, 0.033);

        const t = this.tempVectors;
        const usingArrows = this.pressedKeys.has('arrowup') || this.pressedKeys.has('arrowdown') ||
            this.pressedKeys.has('arrowleft') || this.pressedKeys.has('arrowright') ||
            this.pressedKeys.has('w') || this.pressedKeys.has('a') || this.pressedKeys.has('s') || this.pressedKeys.has('d');
        const movingForward = this.pressedKeys.has('arrowup') || this.pressedKeys.has('w');
        const movingBackward = this.pressedKeys.has('arrowdown') || this.pressedKeys.has('s');
        const turnLeft = this.pressedKeys.has('arrowleft') || this.pressedKeys.has('a');
        const turnRight = this.pressedKeys.has('arrowright') || this.pressedKeys.has('d');
        const desiredSpeed = movingBackward
            ? this.backpedalSpeed
            : (this.pressedKeys.has('shift') ? this.runSpeed : this.moveSpeed);
        const isMoving = movingForward || movingBackward;

        this.camera.getWorldDirection(t.cameraForward);
        t.cameraForward.y = 0;
        if (t.cameraForward.lengthSq() > 0) t.cameraForward.normalize();
        t.cameraRight.crossVectors(this.camera.up, t.cameraForward).normalize();

        t.moveDirection.set(0, 0, 0);

        if (usingArrows) {
            const forward = this.movementForwardAxis.clone().applyQuaternion(this.model.quaternion);
            forward.y = 0;
            if (forward.lengthSq() > 0) forward.normalize();
            if (movingForward) t.moveDirection.add(forward);
            if (movingBackward) t.moveDirection.sub(forward);

            let turnInput = 0;
            if (turnLeft) turnInput += 1;
            if (turnRight) turnInput -= 1;
            if (turnInput !== 0) {
                this.model.rotation.y += turnInput * this.turnSpeed * delta;
            }
        } else {
            if (movingForward) t.moveDirection.add(t.cameraForward);
            if (movingBackward) t.moveDirection.sub(t.cameraForward);
        }

        if (t.moveDirection.lengthSq() > 0) t.moveDirection.normalize();

        t.targetVelocity.set(0, 0, 0);
        if (isMoving) t.targetVelocity.copy(t.moveDirection).multiplyScalar(desiredSpeed);

        t.horizontalVelocity.set(this.velocity.x, 0, this.velocity.z);
        t.horizontalVelocity.lerp(t.targetVelocity, (isMoving ? this.acceleration : this.damping) * delta);
        this.velocity.x = t.horizontalVelocity.x;
        this.velocity.z = t.horizontalVelocity.z;
        this.velocity.y += this.gravity * delta;

        if (isMoving && !usingArrows) {
            const q = new THREE.Quaternion().setFromUnitVectors(this.modelForwardAxis, t.moveDirection);
            this.model.quaternion.slerp(q, this.rotationSpeed * delta);
        }

        const moveDelta = this.velocity.clone().multiplyScalar(delta);
        this.resolveCollisions(moveDelta);
        this.model.position.add(moveDelta);

        this.updateAnimationState({
            moveDirection: t.moveDirection,
            isMoving,
            desiredSpeed,
            delta,
            turningInPlace: usingArrows && !movingForward && !movingBackward && (turnLeft || turnRight),
            movingBackward
        });
        this.mixer.update(delta);

        t.goalPosition.copy(this.model.position).add(this.cameraOffset);
        t.goalLookAt.copy(this.model.position).add(this.cameraLookAtOffset);
        this.cameraTargetPosition.lerp(t.goalPosition, this.cameraLerpFactor);
        this.cameraTargetLookAt.lerp(t.goalLookAt, this.cameraLerpFactor);
        this.camera.position.copy(this.cameraTargetPosition);
        this.camera.lookAt(this.cameraTargetLookAt);
    }

    refreshColliderBoxes() {
        for (const entry of this.collidableObjects) {
            if (!entry?.mesh) continue;
            entry.mesh.updateMatrixWorld?.(true);
            entry.box.setFromObject(entry.mesh);
        }
    }

    findSupportSurfaceY(testBox, currentBottom, downwardAllowance = 0, upwardAllowance = this.maxStepHeight) {
        let supportY = Number.NEGATIVE_INFINITY;
        const skin = this.collisionSkin || 0.001;

        const acceptSupport = (topY, minX, maxX, minZ, maxZ) => {
            if (!Number.isFinite(topY)) return;
            const overlapsX = testBox.max.x > minX + skin && testBox.min.x < maxX - skin;
            const overlapsZ = testBox.max.z > minZ + skin && testBox.min.z < maxZ - skin;
            if (!overlapsX || !overlapsZ) return;

            const deltaToTop = topY - currentBottom;
            if (deltaToTop < -Math.max(downwardAllowance, this.supportProbeDepth)) return;
            if (deltaToTop > upwardAllowance) return;
            if (topY > supportY) supportY = topY;
        };

        const groundY = this.getGroundHeight(this.model?.position);
        if (Number.isFinite(groundY)) {
            acceptSupport(groundY, -Infinity, Infinity, -Infinity, Infinity);
        }

        for (const entry of this.collidableObjects) {
            const box = entry?.box;
            if (!box) continue;
            acceptSupport(box.max.y, box.min.x, box.max.x, box.min.z, box.max.z);
        }

        return supportY;
    }

    resolveCollisions(moveDelta) {
        this.isGrounded = false;
        this.updatePlayerBox();
        const skin = this.collisionSkin || 0.001;
        this.refreshColliderBoxes();

        const verticalBox = this.playerBox.clone().translate(new THREE.Vector3(0, moveDelta.y, 0));
        const supportY = this.findSupportSurfaceY(
            verticalBox,
            this.playerBox.min.y,
            Math.max(0, -moveDelta.y) + skin,
            this.maxStepHeight
        );

        if (Number.isFinite(supportY) && verticalBox.min.y <= supportY + skin && this.playerBox.min.y >= supportY - this.maxStepHeight) {
            this.isGrounded = true;
            this.velocity.y = Math.max(0, this.velocity.y);
            moveDelta.y = supportY - this.playerBox.min.y;
        }

        if (moveDelta.y > 0) {
            const upwardBox = this.playerBox.clone().translate(new THREE.Vector3(0, moveDelta.y, 0));
            for (const entry of this.collidableObjects) {
                const box = entry?.box;
                if (!box || !upwardBox.intersectsBox(box)) continue;
                if (this.playerBox.max.y <= box.min.y + skin) {
                    this.velocity.y = 0;
                    moveDelta.y = Math.min(moveDelta.y, box.min.y - this.playerBox.max.y - skin);
                }
            }
        }

        const resolvedBox = this.playerBox.clone().translate(new THREE.Vector3(0, moveDelta.y, 0));
        const resolveHorizontalAxis = (axis) => {
            if (Math.abs(moveDelta[axis]) <= 1e-6) return;
            const otherAxis = axis === 'x' ? 'z' : 'x';
            const candidateBox = resolvedBox.clone();
            candidateBox.min[axis] += moveDelta[axis];
            candidateBox.max[axis] += moveDelta[axis];
            let pendingStepUp = null;

            for (const entry of this.collidableObjects) {
                const box = entry?.box;
                if (!box || !candidateBox.intersectsBox(box)) continue;

                const overlapsY = candidateBox.max.y > box.min.y + skin && candidateBox.min.y < box.max.y - skin;
                const overlapsOtherAxis = candidateBox.max[otherAxis] > box.min[otherAxis] + skin
                    && candidateBox.min[otherAxis] < box.max[otherAxis] - skin;
                if (!overlapsY || !overlapsOtherAxis) continue;

                const stepHeight = box.max.y - resolvedBox.min.y;
                const canStepUp = stepHeight > skin
                    && stepHeight <= this.maxStepHeight
                    && resolvedBox.max.y > box.max.y + skin;

                if (canStepUp) {
                    if (pendingStepUp == null || stepHeight < pendingStepUp) {
                        pendingStepUp = stepHeight;
                    }
                    continue;
                }

                if (moveDelta[axis] > 0) {
                    moveDelta[axis] = Math.min(moveDelta[axis], box.min[axis] - resolvedBox.max[axis] - skin);
                    this.velocity[axis] = Math.min(0, this.velocity[axis]);
                } else {
                    moveDelta[axis] = Math.max(moveDelta[axis], box.max[axis] - resolvedBox.min[axis] + skin);
                    this.velocity[axis] = Math.max(0, this.velocity[axis]);
                }

                candidateBox.min[axis] = resolvedBox.min[axis] + moveDelta[axis];
                candidateBox.max[axis] = resolvedBox.max[axis] + moveDelta[axis];
            }

            if (pendingStepUp != null) {
                moveDelta.y += pendingStepUp + skin;
                resolvedBox.min.y += pendingStepUp + skin;
                resolvedBox.max.y += pendingStepUp + skin;
                candidateBox.min.y += pendingStepUp + skin;
                candidateBox.max.y += pendingStepUp + skin;
                this.isGrounded = true;
                this.velocity.y = Math.max(0, this.velocity.y);
            }

            resolvedBox.min[axis] = candidateBox.min[axis];
            resolvedBox.max[axis] = candidateBox.max[axis];
        };

        resolveHorizontalAxis('x');
        resolveHorizontalAxis('z');

        const finalBox = this.playerBox.clone().translate(moveDelta);
        const finalSupportY = this.findSupportSurfaceY(
            finalBox,
            finalBox.min.y,
            this.supportProbeDepth,
            this.maxStepHeight
        );
        if (Number.isFinite(finalSupportY) && Math.abs(finalSupportY - finalBox.min.y) <= this.supportProbeDepth + skin) {
            moveDelta.y += finalSupportY - finalBox.min.y;
            this.isGrounded = true;
            this.velocity.y = Math.max(0, this.velocity.y);
        }
    }

    updatePlayerBox(position = this.model?.position || new THREE.Vector3(0, 0, 5)) {
        const center = position.clone().add(this.playerBoxOffset);
        const halfSize = this.playerBoxSize.clone().multiplyScalar(0.5);
        this.playerBox.set(center.clone().sub(halfSize), center.clone().add(halfSize));
    }

    getGroundHeight(position = this.model?.position || new THREE.Vector3()) {
        const ground = this.groundObject;
        if (!ground) return Number.isFinite(this.groundHeight) ? this.groundHeight : 0;

        if (ground.updateMatrixWorld) ground.updateMatrixWorld(true);

        if (ground.geometry?.type === 'PlaneGeometry') {
            const worldPos = new THREE.Vector3();
            ground.getWorldPosition(worldPos);
            this.groundHeight = worldPos.y;
            return this.groundHeight;
        }

        const groundBox = new THREE.Box3().setFromObject(ground);
        if (Number.isFinite(groundBox.max.y)) {
            this.groundHeight = groundBox.max.y;
            return this.groundHeight;
        }

        return Number.isFinite(this.groundHeight) ? this.groundHeight : 0;
    }

    updateAnimationState(context = {}) {
        const motionContext = this._buildMotionContext(context);
        if (!this.lastGrounded && this.isGrounded) {
            this.dispatchPlayerEvent('event.onLand', {
                clip: this.getMotionMatchingState().clip,
                speed: motionContext.horizontalSpeed
            });
        }
        this.lastGrounded = this.isGrounded;

        const runtimeHandled = this.motionMatching.enabled
            && this.motionMatching.runtime?.isReady?.()
            && this.motionMatching.runtime.update(motionContext, context.delta || 0);
        if (runtimeHandled?.match) {
            this.state = runtimeHandled.match.state;
            this._updateActiveAnimationTimescale(motionContext);
            this._refreshMotionDebugHud(motionContext);
            return;
        }

        if (this._shouldUseLocomotionBlend(motionContext)) {
            this._applyBlendLocomotion(motionContext);
            this._refreshMotionDebugHud(motionContext);
            return;
        }

        const match = this.motionMatching.enabled ? this._selectMotionMatch(motionContext) : null;
        if (match) {
            this.state = match.state;
            this._applyMotionDescriptor(match);
        } else {
            this._applyLegacyStateMachine(motionContext);
        }

        this._updateActiveAnimationTimescale(motionContext);
        this._refreshMotionDebugHud(motionContext);
    }

    takeDamage(amount) {
        this.health -= amount;
        console.log(`Player health: ${this.health}`);
        this.dispatchPlayerEvent('event.onDamage', { amount, health: this.health });
        if (this.health <= 0) this.die();
    }

    die() {
        console.log('Player is dead! Game Over.');
        this.fadeToAction('idle', 0.2, { syncState: true });
        this.isActive = false;
        this.dispatchPlayerEvent('event.onDeath', { clip: this.getMotionMatchingState().clip, state: 'dead' });
        alert('Game Over! You were killed by the enemy.');
    }

    fadeToAction(name, duration = 0.2, options = {}) {
        const action = this._resolveAction(name);
        if (!action) return null;
        const descriptor = this._findMotionDescriptor(name);
        const shouldReset = options.reset !== false;
        const timeScale = options.timeScale ?? 1;
        const isOneShot = !!options.oneShot || !!descriptor?.isOneShot;
        const clipDuration = action.getClip?.()?.duration || descriptor?.clip?.duration || 0;

        if (this.activeAction !== action) {
            if (this.activeAction) this.activeAction.fadeOut(duration);
            if (shouldReset) action.reset();
            if (Number.isFinite(options.startTime) && clipDuration > 0) {
                action.time = isOneShot
                    ? THREE.MathUtils.clamp(options.startTime, 0, clipDuration)
                    : THREE.MathUtils.euclideanModulo(options.startTime, clipDuration);
            }
            action.setEffectiveTimeScale(timeScale).setEffectiveWeight(1).fadeIn(duration);
            action.setLoop(isOneShot ? THREE.LoopOnce : THREE.LoopRepeat, isOneShot ? 1 : Infinity);
            action.clampWhenFinished = !!isOneShot;
            action.play();
            this.activeAction = action;
        } else {
            action.setEffectiveTimeScale(timeScale);
            if (Number.isFinite(options.startTime) && clipDuration > 0) {
                action.time = isOneShot
                    ? THREE.MathUtils.clamp(options.startTime, 0, clipDuration)
                    : THREE.MathUtils.euclideanModulo(options.startTime, clipDuration);
            }
        }

        if (descriptor) {
            this.motionMatching.current = descriptor;
            this.motionMatching.activeSource = descriptor.source;
            if (options.syncState !== false) this.state = descriptor.state;
        } else if (options.syncState !== false && typeof name === 'string') {
            this.state = this._normalizeClipKey(name);
        }
        return action;
    }

    stopAnimation(name) {
        const action = this._resolveAction(name);
        action?.stop();
    }

    setMotionMatchingEnabled(enabled) {
        this.motionMatching.enabled = !!enabled;
        this.motionMatching.runtime?.setDebugEnabled?.(!!enabled);
        if (!this.motionMatching.enabled && this.motionMatching.current) {
            this.fadeToAction(this.motionMatching.current.state || 'idle', 0.18, { syncState: true });
        }
        this._emitMotionMatchingUpdate(true);
    }

    setMotionMatchingMode(mode = 'auto') {
        this.motionMatching.desiredMode = String(mode || 'auto').toLowerCase();
        this.motionMatching.forcedClip = '';
        this._emitMotionMatchingUpdate(true);
    }

    forceMotionClip(clipName = '') {
        this.motionMatching.forcedClip = this._normalizeClipKey(clipName);
        this._emitMotionMatchingUpdate(true);
    }

    getAvailableAnimationNames() {
        return Array.from(new Set(this.motionMatching.database.map(entry => entry.key))).sort();
    }

    getMotionMatchingState() {
        const current = this.motionMatching.current;
        const currentFrame = this.motionMatching.currentFrame;
        return {
            enabled: this.motionMatching.enabled,
            clip: current?.key || this.activeAction?._clip?.name || '',
            state: current?.state || this.state,
            source: current?.source || this.motionMatching.activeSource,
            libraryStatus: this.motionMatching.manifestStatus,
            fallbackMode: this.motionMatching.fallbackMode,
            externalClipCount: this.motionMatching.externalClipCount,
            totalClipCount: this.motionMatching.database.length,
            frameDatabaseSize: this.motionMatching.frameDatabaseSize,
            currentFrame,
            selectedBones: this.motionMatching.selectedBones.slice(),
            validation: this.motionMatching.validation,
            desiredMode: this.motionMatching.desiredMode,
            objectUuid: this.model?.uuid || null,
            ranking: this.motionMatching.lastRankedMatches.slice(0, 3).map(item => ({
                clip: item.entry.key,
                state: item.entry.state,
                frameIndex: item.frameIndex ?? null,
                time: Number.isFinite(item.time) ? Number(item.time.toFixed(3)) : null,
                score: Number(item.score.toFixed(3))
            }))
        };
    }

    dispatchPlayerEvent(type, detail = {}) {
        this.events.dispatch(type, {
            ...detail,
            controller: this,
            objectUuid: this.model?.uuid || null
        });
    }

    _ensureMotionMatchingRuntime() {
        const Runtime = window.MotionMatchingSystem?.Runtime;
        if (!Runtime || !this.model || !this.mixer) return null;
        if (!this.motionMatching.runtime) {
            this.motionMatching.runtime = new Runtime({
                player: this,
                scene: this.scene,
                camera: this.camera,
                renderer: window.renderer || null,
                debug: true
            });
        }
        return this.motionMatching.runtime;
    }

    _rebuildMotionMatchingRuntime(reason = 'update') {
        const runtime = this._ensureMotionMatchingRuntime();
        if (!runtime) return null;
        const result = runtime.rebuild(this.motionMatching.database);
        this.motionMatching.validation = result?.validation || null;
        this.motionMatching.frameDatabaseSize = result?.frameCount || 0;
        this.motionMatching.selectedBones = result?.selectedBones || [];
        if (result?.ready) {
            this.motionMatching.fallbackMode = 'frame-database';
            this.blendLocomotion.active = false;
            this.motionMatching.manifestStatus = this.motionMatching.externalClipCount > 0
                ? 'frame-database-ready'
                : 'embedded-frame-database';
        }
        console.info(`[MotionMatching] Runtime rebuild (${reason}) -> ${this.motionMatching.frameDatabaseSize} frames`);
        return result;
    }

    _queueMotionLibraryLoad() {
        if (this.motionMatching.pendingLibraryLoad) return this.motionMatching.pendingLibraryLoad;
        this.motionMatching.pendingLibraryLoad = this._loadManifestClips().catch(error => {
            console.warn('[MotionMatching] Falling back to embedded clips only:', error);
            this.motionMatching.manifestStatus = 'embedded-only';
            this._syncAnimationCoverageStatus();
            this._rebuildMotionMatchingRuntime('manifest-fallback');
            this._emitMotionMatchingUpdate(true);
        });
        return this.motionMatching.pendingLibraryLoad;
    }

    async _loadManifestClips() {
        const manifest = this.motionMatching.manifest || window.UAL2MotionLibrary || null;
        if (!manifest || typeof manifest !== 'object') {
            this.motionMatching.manifestStatus = 'embedded-only';
            return;
        }

        this.motionMatching.manifest = manifest;
        if (typeof manifest.packName === 'string' && manifest.packName.trim()) {
            this.motionMatching.preferredPackName = manifest.packName.trim();
        }
        const entries = Array.isArray(manifest.animations) ? manifest.animations : [];
        if (!entries.length) {
            this.motionMatching.manifestStatus = 'manifest-ready';
            this._emitMotionMatchingUpdate(true);
            return;
        }

        this.motionMatching.manifestStatus = 'loading-external-clips';
        const root = typeof manifest.root === 'string' ? manifest.root : '';
        const source = String(manifest.source || 'external').trim().toLowerCase() || 'external';
        let loadedCount = 0;
        for (const entry of entries) {
            const clip = await this._loadExternalAnimationClip(root, entry);
            if (!clip) continue;
            this._registerAnimationClips([clip], { source, metadata: entry });
            this._playDefaultIdleIfAvailable({ duration: 0.12, reset: true });
            loadedCount++;
        }

        this.motionMatching.externalClipCount = loadedCount;
        this.motionMatching.manifestStatus = loadedCount > 0 ? 'ual2-ready' : 'manifest-ready';
        this._syncAnimationCoverageStatus();
        this._rebuildMotionMatchingRuntime('manifest-load');
        this._playDefaultIdleIfAvailable({ duration: 0.12, reset: false });
        this._emitMotionMatchingUpdate(true);
    }

    _loadExternalAnimationClip(root, entry) {
        const path = entry?.path;
        if (!path) return Promise.resolve(null);

        const joinedPath = `${root || ''}${path}`.replace(/\\/g, '/');
        const extension = joinedPath.split('.').pop().toLowerCase();
        const fallbackFbxPath = extension === 'json'
            ? `assets/offline-cdn/fbx-animations/${String(path).replace(/^.*[\\/]/, '').replace(/\.json$/i, '.fbx')}`.replace(/\\/g, '/')
            : '';
        return new Promise(resolve => {
            const onLoaded = result => {
                const clip = this._prepareLoadedAnimationClip(result?.animations?.[0] || null, entry);
                if (!clip) return resolve(null);
                if (entry.name) clip.name = entry.name;
                resolve(clip);
            };
            const loadFallbackFBX = () => {
                if (!fallbackFbxPath || typeof THREE.FBXLoader !== 'function') {
                    resolve(null);
                    return;
                }
                try {
                    new THREE.FBXLoader().load(fallbackFbxPath, onLoaded, undefined, fallbackError => {
                        console.warn(`[MotionMatching] Fallback FBX load failed "${fallbackFbxPath}".`, fallbackError);
                        resolve(null);
                    });
                } catch (fallbackError) {
                    console.warn(`[MotionMatching] Fallback FBX exception for "${fallbackFbxPath}".`, fallbackError);
                    resolve(null);
                }
            };
            const onError = error => {
                console.warn(`[MotionMatching] Failed to load "${joinedPath}".`, error);
                if (fallbackFbxPath) {
                    loadFallbackFBX();
                    return;
                }
                resolve(null);
            };

            try {
                if (extension === 'json') {
                    fetch(joinedPath)
                        .then(response => {
                            if (!response.ok) throw new Error(`HTTP ${response.status}`);
                            return response.json();
                        })
                        .then(data => {
                            const clip = THREE.AnimationClip?.parse ? THREE.AnimationClip.parse(data) : null;
                            onLoaded({ animations: clip ? [clip] : [] });
                        })
                        .catch(onError);
                    return;
                }
                if (extension === 'fbx' && typeof THREE.FBXLoader === 'function') {
                    new THREE.FBXLoader().load(joinedPath, onLoaded, undefined, onError);
                    return;
                }
                if ((extension === 'glb' || extension === 'gltf') && typeof THREE.GLTFLoader === 'function') {
                    new THREE.GLTFLoader().load(joinedPath, onLoaded, undefined, onError);
                    return;
                }
            } catch (error) {
                onError(error);
                return;
            }

            onError(new Error(`Unsupported animation type: ${extension}`));
        });
    }

    _prepareLoadedAnimationClip(clip, entry = {}) {
        if (!clip) return null;
        this._sanitizeClipTracks(clip);
        if (entry.stripRootMotion) this._stripRootMotionFromClip(clip, entry);
        return clip;
    }

    _sanitizeClipTracks(clip) {
        clip?.tracks?.forEach(track => {
            if (!track?.name) return;
            track.name = String(track.name)
                .replace(/^.*[:|]/, '')
                .replace(/^\.bones\[([^\]]+)\]\./, '$1.');
        });
    }

    _playDefaultIdleIfAvailable(options = {}) {
        const idleAction = this._resolveAction('idle');
        if (!idleAction) return false;

        const currentState = this.motionMatching.current?.state || this.state;
        const shouldSnapToIdle = !this.activeAction || !this.isActive || currentState === 'idle';
        if (!shouldSnapToIdle) return false;

        if (this.blendLocomotion.initialized && this._shouldUseLocomotionBlend({ locomotion: 'idle' })) {
            this._resetBlendLocomotionToIdle();
            return true;
        }

        this.fadeToAction('idle', options.duration ?? 0.12, {
            syncState: true,
            reset: options.reset !== false
        });
        return true;
    }

    _stripRootMotionFromClip(clip, entry = {}) {
        const stripMode = String(entry.stripRootMotion || 'xz').toLowerCase();
        clip?.tracks?.forEach(track => {
            if (!track?.name || !Array.isArray(track.values) && !(track.values instanceof Float32Array)) return;
            if (!/(^|[._/])hips\.position$/i.test(track.name) && !/mixamorighips\.position$/i.test(track.name)) return;
            if (!track.values || track.values.length < 3) return;

            const baseY = track.values[1];
            for (let i = 0; i < track.values.length; i += 3) {
                track.values[i] = 0;
                track.values[i + 2] = 0;
                if (stripMode === 'xyz' || stripMode === 'all') track.values[i + 1] -= baseY;
            }
        });
    }

    _registerAnimationClips(clips, options = {}) {
        if (!this.mixer || !Array.isArray(clips)) return;
        clips.forEach((clip) => {
            if (!clip) return;
            const descriptor = this._describeClip(clip, {
                source: options.source || 'embedded',
                metadata: options.metadata || {}
            });
            if (this.motionMatching.descriptorByKey.has(descriptor.key)) return;

            const action = this.mixer.clipAction(clip);
            descriptor.action = action;
            this.motionMatching.database.push(descriptor);
            this.motionMatching.descriptorByKey.set(descriptor.key, descriptor);

            descriptor.aliases.forEach(alias => {
                if (!this.actions[alias] || this._shouldReplaceLocomotionAlias(alias, descriptor)) {
                    this.actions[alias] = action;
                }
            });

            if (!this.actions[descriptor.state] || this._shouldReplaceLocomotionAlias(descriptor.state, descriptor)) {
                this.actions[descriptor.state] = action;
            }
        });
        this._syncAnimationCoverageStatus();
        if (this.model && this.motionMatching.database.length > 0 && this.motionMatching.manifestStatus !== 'loading-external-clips') {
            this._rebuildMotionMatchingRuntime('clip-register');
        }
    }

    _shouldReplaceLocomotionAlias(alias, descriptor) {
        const normalizedAlias = this._normalizeClipKey(alias);
        if (!normalizedAlias || descriptor?.source === 'embedded') return false;
        if (normalizedAlias === 'idle') {
            return descriptor.state === 'idle';
        }
        if (normalizedAlias === 'walk') {
            return descriptor.state === 'walk'
                && descriptor.directionGroup === 'forward'
                && !descriptor.tags?.has('strafe')
                && !descriptor.tags?.has('backward');
        }
        if (normalizedAlias === 'run') {
            return descriptor.state === 'run'
                && descriptor.directionGroup === 'forward'
                && !descriptor.tags?.has('strafe')
                && !descriptor.tags?.has('backward');
        }
        return false;
    }

    _describeClip(clip, options = {}) {
        const metadata = options.metadata || {};
        const rawName = String(metadata.name || clip.name || `clip_${this.motionMatching.database.length}`);
        const key = this._normalizeClipKey(rawName);
        const lower = rawName.toLowerCase();
        const tags = new Set((Array.isArray(metadata.tags) ? metadata.tags : []).map(tag => String(tag).toLowerCase()));

        if (/idle/.test(lower)) tags.add('idle');
        if (/(t[\s_-]*pose|bind[\s_-]*pose|rest[\s_-]*pose)/.test(lower)) tags.add('pose');
        if (/(walk|jog)/.test(lower)) tags.add('walk');
        if (/(run|sprint)/.test(lower)) tags.add('run');
        if (/jump/.test(lower)) tags.add('jump');
        if (/(fall|air)/.test(lower)) tags.add('fall');
        if (/land/.test(lower)) tags.add('land');
        if (/(strafe|side)/.test(lower)) tags.add('strafe');
        if (/(back|reverse)/.test(lower)) tags.add('backward');
        if (/left/.test(lower)) tags.add('left');
        if (/right/.test(lower)) tags.add('right');
        if (/(start|launch)/.test(lower)) tags.add('start');
        if (/(stop|halt)/.test(lower)) tags.add('stop');
        if (/(turn|pivot)/.test(lower)) tags.add('turn');

        let state = metadata.state ? this._normalizeClipKey(metadata.state) : 'idle';
        if (tags.has('pose')) state = 'pose';
        else if (tags.has('jump')) state = 'jump';
        else if (tags.has('fall')) state = 'fall';
        else if (tags.has('run')) state = 'run';
        else if (tags.has('walk') || tags.has('strafe') || tags.has('backward')) state = 'walk';
        else if (tags.has('turn')) state = 'turn';
        else if (tags.has('land')) state = 'idle';

        let targetSpeed = Number.isFinite(metadata.speed) ? metadata.speed : 0;
        if (!metadata.speed) {
            if (state === 'run') targetSpeed = 1;
            else if (state === 'walk') targetSpeed = tags.has('strafe') ? 0.55 : 0.42;
            else if (state === 'jump' || state === 'fall') targetSpeed = 0.35;
        }

        let directionAngle = Number.isFinite(metadata.directionAngle) ? metadata.directionAngle : 0;
        if (!metadata.directionAngle) {
            if (tags.has('backward')) directionAngle = 180;
            else if (tags.has('left')) directionAngle = -90;
            else if (tags.has('right')) directionAngle = 90;
        }

        const directionGroup = Math.abs(directionAngle) < 35 ? 'forward' :
            Math.abs(directionAngle) > 145 ? 'backward' :
            directionAngle < 0 ? 'left' : 'right';

        return {
            key,
            label: rawName,
            clip,
            source: options.source || 'embedded',
            state,
            phase: (state === 'jump' || state === 'fall') ? 'air' : 'ground',
            targetSpeed,
            directionAngle,
            directionGroup,
            turnDirection: tags.has('turn') ? (tags.has('left') ? 'left' : tags.has('right') ? 'right' : '') : '',
            tags,
            isOneShot: !!metadata.isOneShot || tags.has('jump') || tags.has('land') || tags.has('start') || tags.has('stop'),
            aliases: Array.from(new Set([key, state, clip.name ? this._normalizeClipKey(clip.name) : ''].filter(Boolean)))
        };
    }

    _buildMotionContext(context = {}) {
        const t = this.tempVectors;
        const horizontalSpeed = Math.hypot(this.velocity.x, this.velocity.z);
        const speedNorm = THREE.MathUtils.clamp(horizontalSpeed / Math.max(this.runSpeed, 0.001), 0, 1.25);

        t.localMoveDirection.set(0, 0, 0);
        t.quaternion.copy(this.model.quaternion).invert();
        if (context.moveDirection?.lengthSq() > 0) {
            t.localMoveDirection.copy(context.moveDirection).applyQuaternion(t.quaternion);
        } else {
            t.planarVelocity.set(this.velocity.x, 0, this.velocity.z);
            if (t.planarVelocity.lengthSq() > 0.0001) {
                t.localMoveDirection.copy(t.planarVelocity.normalize()).applyQuaternion(t.quaternion);
            }
        }

        let desiredAngle = 0;
        if (t.localMoveDirection.lengthSq() > 0.0001) {
            t.localRightAxis.crossVectors(this.modelUpAxis, this.modelForwardAxis).normalize();
            const forwardComponent = t.localMoveDirection.dot(this.modelForwardAxis);
            const rightComponent = t.localMoveDirection.dot(t.localRightAxis);
            desiredAngle = THREE.MathUtils.radToDeg(Math.atan2(rightComponent, forwardComponent));
        }

        let locomotion = 'idle';
        if (!this.isGrounded) locomotion = this.velocity.y > 0.15 ? 'jump' : 'fall';
        else if (context.isMoving || horizontalSpeed > 0.12) locomotion = speedNorm > 0.7 || this.pressedKeys.has('shift') ? 'run' : 'walk';
        else if (context.turningInPlace) locomotion = 'turn';

        // This controller only supports forward/back locomotion plus turning,
        // so keep the matcher on forward/back clips instead of side strafes.
        if (context.isMoving) {
            desiredAngle = context.movingBackward ? 180 : 0;
        }

        return {
            ...context,
            grounded: this.isGrounded,
            horizontalSpeed,
            speedNorm,
            desiredAngle,
            locomotion,
            wantsRun: this.pressedKeys.has('shift'),
            wantsStart: locomotion !== 'idle' && (this.state === 'idle' || this.state === 'land'),
            wantsStop: locomotion === 'idle' && (this.state === 'walk' || this.state === 'run'),
            strafeDirection: Math.abs(desiredAngle) > 35 && Math.abs(desiredAngle) < 145 ? (desiredAngle < 0 ? 'left' : 'right') : '',
            movingBackward: Math.abs(desiredAngle) >= 145,
            turnDirection: context.turningInPlace
                ? (this.pressedKeys.has('arrowleft') ? 'left' : this.pressedKeys.has('arrowright') ? 'right' : '')
                : (Math.abs(desiredAngle) >= 25 ? (desiredAngle < 0 ? 'left' : 'right') : '')
        };
    }

    _selectMotionMatch(context) {
        const forcedClip = this.motionMatching.forcedClip;
        const ranked = this.motionMatching.database
            .map(entry => ({ entry, score: this._scoreMotionEntry(entry, context, forcedClip) }))
            .sort((a, b) => a.score - b.score);

        this.motionMatching.lastRankedMatches = ranked.slice(0, 4);
        const best = ranked[0]?.entry || null;
        if (!best) return null;

        const current = this.motionMatching.current;
        if (!current) return best;

        const bestScore = ranked[0]?.score ?? Infinity;
        const currentScore = ranked.find(item => item.entry.key === current.key)?.score ?? Infinity;
        const canSwitch = (performance.now() - this.motionMatching.lastSwitchTime) >= this.motionMatching.minSwitchIntervalMs;
        const materiallyBetter = (bestScore + 0.32) < currentScore;

        if (!canSwitch && !materiallyBetter) return current;
        if (best.key === current.key) return current;
        if (!materiallyBetter && current.state === best.state) return current;
        return best;
    }

    _scoreMotionEntry(entry, context, forcedClip) {
        if (forcedClip) return entry.key === forcedClip ? 0 : 999;

        let score = 0;
        if (this.motionMatching.desiredMode !== 'auto' && entry.state !== this.motionMatching.desiredMode) score += 1.5;

        const needsAir = context.locomotion === 'jump' || context.locomotion === 'fall';
        if (needsAir && entry.phase !== 'air') score += 12;
        if (!needsAir && entry.phase === 'air') score += 12;

        const statePenalty = {
            idle: { idle: 0, turn: 0.45, walk: 1.2, run: 1.8, jump: 8, fall: 8 },
            turn: { idle: 0.35, turn: 0, walk: 1.0, run: 1.6, jump: 8, fall: 8 },
            walk: { idle: 1.1, turn: 0.75, walk: 0, run: 0.65, jump: 8, fall: 8 },
            run: { idle: 1.4, turn: 1.2, walk: 0.55, run: 0, jump: 8, fall: 8 },
            jump: { idle: 8, turn: 8, walk: 8, run: 8, jump: 0, fall: 1.25 },
            fall: { idle: 8, turn: 8, walk: 8, run: 8, jump: 1.15, fall: 0 }
        };

        score += statePenalty[context.locomotion]?.[entry.state] ?? 2;
        score += Math.abs(context.speedNorm - entry.targetSpeed) * 2.8;
        score += context.locomotion !== 'idle'
            ? this._angleDistance(context.desiredAngle, entry.directionAngle) / 180 * 2.4
            : Math.abs(entry.targetSpeed) * 1.25;

        if (entry.state === 'turn' && !context.turningInPlace) score += 3.5;
        if (context.turningInPlace && entry.state !== 'turn' && entry.state !== 'idle') score += 1.2;
        if (context.locomotion === 'jump' && entry.state === 'jump') score -= 1.25;

        if (context.wantsStart && !entry.tags.has('start') && entry.state !== context.locomotion) score += 0.5;
        if (context.wantsStop && !entry.tags.has('stop') && entry.state !== 'idle') score += 0.45;
        if (!context.strafeDirection && entry.tags.has('strafe')) score += 1.4;
        if (context.strafeDirection && entry.directionGroup !== context.strafeDirection) score += 0.55;
        if (context.movingBackward && entry.directionGroup !== 'backward') score += 0.7;
        if (context.turnDirection && entry.turnDirection && entry.turnDirection !== context.turnDirection) score += 0.45;
        if (context.wantsRun && entry.targetSpeed < 0.75 && entry.phase === 'ground') score += 0.35;
        if (!context.wantsRun && entry.targetSpeed > 0.85 && entry.phase === 'ground') score += 0.2;

        if (this.motionMatching.current?.key === entry.key) score -= 0.55;
        if (entry.source === 'ual2') score -= 0.08;
        return score;
    }

    _applyMotionDescriptor(descriptor) {
        if (this.motionMatching.current?.key === descriptor.key) return;
        const blendDuration = descriptor.phase === 'air' ? 0.08 : 0.16;
        this.fadeToAction(descriptor.key, blendDuration, { syncState: true, oneShot: descriptor.isOneShot });
        this.motionMatching.current = descriptor;
        this.motionMatching.activeSource = descriptor.source;
        this.motionMatching.lastSwitchTime = performance.now();
        this._emitMotionMatchedEvent(descriptor);
    }

    _applyLegacyStateMachine(context) {
        let nextState = context.turningInPlace ? 'turn' : 'idle';
        if (!this.isGrounded) nextState = this.velocity.y > 0 ? 'jump' : 'fall';
        else if (context.horizontalSpeed > this.runSpeed * 0.5) nextState = 'run';
        else if (context.horizontalSpeed > 0.1) nextState = 'walk';

        if (this.state !== nextState) {
            this.state = nextState;
            const fallbackState = nextState === 'turn' && !this._resolveAction('turn') ? 'idle' : nextState;
            this.fadeToAction(fallbackState, 0.2, { syncState: true, oneShot: nextState === 'jump' });
        }
    }

    _syncAnimationCoverageStatus() {
        if (this.motionMatching.runtime?.isReady?.()) {
            this.motionMatching.fallbackMode = 'frame-database';
            this.blendLocomotion.active = false;
            return;
        }

        const availableStates = new Set(this.motionMatching.database.map(entry => entry.state));
        const hasCoreBlendSet = availableStates.has('idle') && availableStates.has('walk') && availableStates.has('run');
        const hasExtendedLoco = availableStates.has('jump') || availableStates.has('fall') || availableStates.has('turn');

        this.motionMatching.fallbackMode = hasCoreBlendSet
            ? (hasExtendedLoco ? 'hybrid-locomotion' : 'three-clip-blend')
            : 'full-database';
        this.blendLocomotion.active = this.motionMatching.fallbackMode === 'three-clip-blend';

        if (this.blendLocomotion.active) {
            this.motionMatching.manifestStatus = this.motionMatching.externalClipCount > 0
                ? 'partial-library'
                : 'embedded-three-clip-fallback';
        } else if (this.motionMatching.externalClipCount <= 0 && this.motionMatching.manifestStatus === 'manifest-ready') {
            this.motionMatching.manifestStatus = 'embedded-only';
        }
    }

    _shouldUseBlendFallback() {
        return this.blendLocomotion.active;
    }

    _shouldUseLocomotionBlend(context = {}) {
        if (this.motionMatching.runtime?.isReady?.()) return false;
        const hasBlendSet = !!this._resolveAction('idle') && !!this._resolveAction('walk') && !!this._resolveAction('run');
        if (!hasBlendSet) return false;
        return context.locomotion === 'idle' || context.locomotion === 'walk' || context.locomotion === 'run';
    }

    _ensureBlendLocomotion() {
        if (this.blendLocomotion.initialized) return;

        const idle = this._resolveAction('idle');
        const walk = this._resolveAction('walk');
        const run = this._resolveAction('run');
        if (!idle || !walk || !run) return;

        this.blendLocomotion.actions.idle = idle;
        this.blendLocomotion.actions.walk = walk;
        this.blendLocomotion.actions.run = run;

        [idle, walk, run].forEach(action => {
            action.enabled = true;
            action.setLoop(THREE.LoopRepeat, Infinity);
            action.clampWhenFinished = false;
            action.reset();
            action.play();
            action.setEffectiveWeight(0);
            action.setEffectiveTimeScale(1);
        });

        idle.setEffectiveWeight(1);
        this.activeAction = idle;
        this.blendLocomotion.initialized = true;
    }

    _suspendNonBlendActions(allowedActions = []) {
        const allowed = new Set(allowedActions.filter(Boolean));
        this.motionMatching.database.forEach(entry => {
            const action = entry?.action;
            if (!action || allowed.has(action)) return;
            action.enabled = false;
            action.stop();
            action.setEffectiveWeight(0);
        });
    }

    _applyBlendLocomotion(context) {
        this._ensureBlendLocomotion();
        const { idle, walk, run } = this.blendLocomotion.actions;
        if (!idle || !walk || !run) {
            this._applyLegacyStateMachine(context);
            return;
        }

        this._suspendNonBlendActions([idle, walk, run]);
        idle.enabled = true;
        walk.enabled = true;
        run.enabled = true;
        idle.play();
        walk.play();
        run.play();

        const speedNorm = THREE.MathUtils.clamp(context.horizontalSpeed / Math.max(this.runSpeed, 0.001), 0, 1);
        const idleFade = THREE.MathUtils.smoothstep(speedNorm, 0.02, 0.18);
        const runFade = THREE.MathUtils.smoothstep(speedNorm, 0.45, 0.92);

        let idleWeight = 1 - idleFade;
        let runWeight = runFade;
        let walkWeight = Math.max(0, 1 - idleWeight - runWeight);

        if (!context.grounded) {
            idleWeight *= 0.35;
            walkWeight *= 0.9;
            runWeight *= 1.05;
        }

        if (context.turningInPlace && context.horizontalSpeed < 0.08) {
            idleWeight = 1;
            walkWeight = 0;
            runWeight = 0;
        }

        const total = Math.max(idleWeight + walkWeight + runWeight, 0.0001);
        idleWeight /= total;
        walkWeight /= total;
        runWeight /= total;

        this.blendLocomotion.weights.idle = idleWeight;
        this.blendLocomotion.weights.walk = walkWeight;
        this.blendLocomotion.weights.run = runWeight;

        idle.setEffectiveWeight(idleWeight);
        walk.setEffectiveWeight(walkWeight);
        run.setEffectiveWeight(runWeight);

        idle.setEffectiveTimeScale(1);
        walk.setEffectiveTimeScale(THREE.MathUtils.clamp(context.horizontalSpeed / Math.max(this.moveSpeed, 0.001), 0.78, 1.35));
        run.setEffectiveTimeScale(THREE.MathUtils.clamp(context.horizontalSpeed / Math.max(this.runSpeed, 0.001), 0.82, 1.2));

        if (!context.grounded) this.state = 'jump';
        else if (runWeight > 0.45) this.state = 'run';
        else if (walkWeight > 0.1) this.state = 'walk';
        else this.state = 'idle';

        const dominantState = runWeight >= walkWeight ? 'run' : walkWeight > 0.01 ? 'walk' : 'idle';
        const dominantAction = dominantState === 'run' ? run : dominantState === 'walk' ? walk : idle;
        const dominantDescriptor = this._findBestDescriptorByState(dominantState);
        this.activeAction = dominantAction;
        this.motionMatching.current = dominantDescriptor;
        this.motionMatching.activeSource = dominantDescriptor?.source || 'embedded';
        this.motionMatching.lastRankedMatches = dominantDescriptor ? [{ entry: dominantDescriptor, score: 0 }] : [];
        this._emitMotionMatchingUpdate();
    }

    _resetBlendLocomotionToIdle() {
        if (!this.blendLocomotion.initialized) return;
        const { idle, walk, run } = this.blendLocomotion.actions;
        if (!idle || !walk || !run) return;
        idle.setEffectiveWeight(1);
        walk.setEffectiveWeight(0);
        run.setEffectiveWeight(0);
        idle.setEffectiveTimeScale(1);
        walk.setEffectiveTimeScale(1);
        run.setEffectiveTimeScale(1);
        this.activeAction = idle;
        this.state = 'idle';
        this.motionMatching.current = this._findBestDescriptorByState('idle');
        this.motionMatching.lastRankedMatches = this.motionMatching.current ? [{ entry: this.motionMatching.current, score: 0 }] : [];
    }

    _updateActiveAnimationTimescale(context) {
        if (!this.activeAction) return;
        const current = this.motionMatching.current;
        if (current?.state === 'walk' || current?.state === 'run') {
            const pace = current.state === 'run'
                ? context.horizontalSpeed / Math.max(this.runSpeed, 0.001)
                : context.horizontalSpeed / Math.max(this.moveSpeed, 0.001);
            this.activeAction.setEffectiveTimeScale(THREE.MathUtils.clamp(0.82 + pace * 0.55, 0.78, 1.55));
        } else {
            this.activeAction.setEffectiveTimeScale(1);
        }
    }

    _resolveAction(name) {
        if (!name) return null;
        const key = this._normalizeClipKey(name);
        return this.actions[key] || this.actions[name] || null;
    }

    _findMotionDescriptor(name) {
        if (!name) return null;
        return this.motionMatching.descriptorByKey.get(this._normalizeClipKey(name)) || null;
    }

    _findBestDescriptorByState(state) {
        const normalized = this._normalizeClipKey(state);
        return this.motionMatching.database.find(entry => entry.state === normalized && entry.source === 'embedded')
            || this.motionMatching.database.find(entry => entry.state === normalized)
            || null;
    }

    _normalizeClipKey(name) {
        return String(name || '').trim().toLowerCase().replace(/\.[a-z0-9]+$/i, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    }

    _angleDistance(a, b) {
        const delta = ((((a - b) % 360) + 540) % 360) - 180;
        return Math.abs(delta);
    }

    _emitMotionMatchedEvent(descriptor, extra = {}) {
        const ranked = this.motionMatching.lastRankedMatches[0];
        this.dispatchPlayerEvent('event.onMotionMatched', {
            clip: descriptor.key,
            label: descriptor.label,
            state: descriptor.state,
            source: descriptor.source,
            score: ranked ? Number(ranked.score.toFixed(3)) : 0,
            frameIndex: extra.frameIndex ?? this.motionMatching.currentFrame?.frameIndex ?? null,
            time: Number.isFinite(extra.time) ? Number(extra.time.toFixed(3)) : this.motionMatching.currentFrame?.time ?? null,
            cost: Number.isFinite(extra.cost) ? Number(extra.cost.toFixed(3)) : null
        });
        this._emitMotionMatchingUpdate(true);
    }

    _emitMotionMatchingUpdate(force = false) {
        const state = this.getMotionMatchingState();
        const signature = JSON.stringify({
            enabled: state.enabled,
            clip: state.clip,
            status: state.libraryStatus,
            source: state.source,
            state: state.state,
            total: state.totalClipCount
        });
        if (!force && signature === this.motionMatching.lastEventSignature) return;
        this.motionMatching.lastEventSignature = signature;
        window.dispatchEvent(new CustomEvent('playerMotionMatchUpdated', { detail: state }));
    }

    _ensureMotionDebugHud() {
        if (this.motionMatching.hudRoot) return this.motionMatching.hudRoot;
        const host = document.getElementById(this.motionMatching.hudHostId) || document.body;
        const root = document.createElement('div');
        root.id = 'player-motion-match-hud';
        root.style.cssText = 'margin:6px;padding:10px 12px;border-radius:8px;background:linear-gradient(180deg, rgba(12,23,41,0.92), rgba(7,13,25,0.92));border:1px solid rgba(91,160,255,0.35);color:#dbe7ff;font-family:"JetBrains Mono", Consolas, monospace;font-size:11px;line-height:1.45;box-shadow:0 10px 30px rgba(0,0,0,0.25)';
        host.prepend(root);
        this.motionMatching.hudRoot = root;
        return root;
    }

    _refreshMotionDebugHud(context) {
        const root = this._ensureMotionDebugHud();
        if (!root) return;
        const now = performance.now();
        if ((now - this.motionMatching.lastHudUpdate) < 90 && context) return;
        this.motionMatching.lastHudUpdate = now;
        const state = this.getMotionMatchingState();
        const runtimeState = this.motionMatching.runtime?.getDebugState?.() || null;
        const ranking = this.motionMatching.lastRankedMatches.slice(0, 3)
            .map(item => `${item.entry.key}#${item.frameIndex ?? '-'} (${item.score.toFixed(2)})`)
            .join('<br>') || 'No candidates';
        const coverage = runtimeState?.ready
            ? `${state.frameDatabaseSize} sampled frames built from ${state.totalClipCount} clips using bones: ${(state.selectedBones || []).join(', ') || 'none'}`
            : this._shouldUseBlendFallback()
            ? 'Fallback blend mode is active because the frame database is not ready yet.'
            : state.totalClipCount <= 3
            ? 'Current character still only has a small clip set. Add more locomotion clips for denser searches.'
            : `${state.totalClipCount} clips are available, but the frame database is still initializing.`;
        const validation = state.validation;
        root.innerHTML = `
            <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:6px;">
                <strong style="font-size:12px;color:#8dc0ff;">Motion Matching</strong>
                <span style="color:${state.enabled ? '#89ffb1' : '#ffb36b'};">${state.enabled ? 'LIVE' : 'DISABLED'}</span>
            </div>
            <div><strong>Pack</strong> ${this.motionMatching.preferredPackName}</div>
            <div><strong>Status</strong> ${state.libraryStatus}</div>
            <div><strong>Mode</strong> ${this.motionMatching.fallbackMode}</div>
            <div><strong>Clip</strong> ${state.clip || 'None'}</div>
            <div><strong>Frame</strong> ${state.currentFrame ? `${state.currentFrame.frameIndex} @ ${Number(state.currentFrame.time || 0).toFixed(3)}s` : 'None'}</div>
            <div><strong>State</strong> ${state.state || 'idle'}</div>
            <div><strong>Source</strong> ${state.source || 'embedded'}</div>
            <div><strong>Library</strong> ${state.totalClipCount} clips (${state.externalClipCount} external)</div>
            <div><strong>Frame DB</strong> ${state.frameDatabaseSize || 0} frames</div>
            <div><strong>Intent</strong> ${context?.locomotion || state.state} @ ${(context?.horizontalSpeed || 0).toFixed(2)} m/s</div>
            <div><strong>Angle</strong> ${(context?.desiredAngle || 0).toFixed(1)} deg</div>
            <div><strong>Validation</strong> scene:${validation?.rendering?.hasScene ? 'yes' : 'no'} camera:${validation?.rendering?.hasCamera ? 'yes' : 'no'} renderer:${validation?.rendering?.hasRenderer ? 'yes' : 'no'} skeleton:${validation?.character?.hasSkeleton ? 'yes' : 'no'}</div>
            <div style="margin-top:6px;color:#9fc0ee;">${coverage}</div>
            <div style="margin-top:6px;padding-top:6px;border-top:1px solid rgba(255,255,255,0.09);"><strong>Best Matches</strong><br>${ranking}</div>
        `;
    }
}

class ThirdPersonCamera {
    constructor(camera, target, scene) {
        this.camera = camera;
        this.target = target;
        this.scene = scene;
        this.currentPosition = new THREE.Vector3();
        this.currentLookAt = new THREE.Vector3();
        this.config = {
            offset: new THREE.Vector3(0, 1.8, -6.5),
            lookAtOffset: new THREE.Vector3(0, 1.5, 0),
            positionDamping: 0.1,
            rotationDamping: 0.12,
            collisionOffset: 0.3,
            minDistance: 1.5,
            maxDistance: 10,
            minVerticalAngle: -30,
            maxVerticalAngle: 60,
            rotationSpeed: 0.002,
            isMouseDown: false,
            lastMouseX: 0,
            lastMouseY: 0,
            currentRotationX: 0,
            currentRotationY: 0
        };
        this.initMouseControls();
        this.updateIdealPosition();
        this.currentPosition.copy(this.idealPosition);
        this.currentLookAt.copy(this.target.position.clone().add(this.config.lookAtOffset));
    }

    initMouseControls() {
        window.addEventListener('mousedown', e => {
            this.config.isMouseDown = true;
            this.config.lastMouseX = e.clientX;
            this.config.lastMouseY = e.clientY;
        });
        window.addEventListener('mouseup', () => { this.config.isMouseDown = false; });
        window.addEventListener('mousemove', e => {
            if (!this.config.isMouseDown) return;
            const deltaX = e.clientX - this.config.lastMouseX;
            const deltaY = e.clientY - this.config.lastMouseY;
            this.config.currentRotationY += deltaX * this.config.rotationSpeed;
            this.config.currentRotationX += deltaY * this.config.rotationSpeed;
            this.config.currentRotationX = Math.max(
                this.config.minVerticalAngle * Math.PI / 180,
                Math.min(this.config.maxVerticalAngle * Math.PI / 180, this.config.currentRotationX)
            );
            this.config.lastMouseX = e.clientX;
            this.config.lastMouseY = e.clientY;
        });
        window.addEventListener('wheel', e => {
            const zoomSpeed = 0.5;
            this.config.offset.z += e.deltaY > 0 ? zoomSpeed : -zoomSpeed;
            this.config.offset.z = Math.max(-this.config.maxDistance, Math.min(-this.config.minDistance, this.config.offset.z));
        });
    }

    updateIdealPosition() {
        const targetWorldPos = new THREE.Vector3();
        this.target.getWorldPosition(targetWorldPos);
        const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(
            this.config.currentRotationX,
            this.config.currentRotationY,
            0,
            'YXZ'
        ));
        const rotatedOffset = this.config.offset.clone().applyQuaternion(quaternion);
        this.idealPosition = targetWorldPos.clone().add(rotatedOffset);
    }

    checkCollisions(idealPos) {
        if (!this.scene) return idealPos;
        const targetWorldPos = new THREE.Vector3();
        this.target.getWorldPosition(targetWorldPos);
        const direction = idealPos.clone().sub(targetWorldPos);
        const distance = direction.length();
        if (distance < 0.1) return idealPos;
        direction.normalize();

        const raycaster = new THREE.Raycaster(targetWorldPos, direction, 0.1, distance - this.config.collisionOffset);
        const collidableObjects = [];
        this.scene.traverse(object => {
            if (object.isMesh && object.visible && !object.userData.isPlayer && !object.name.includes('sky') && !object.name.includes('Sky') && object.geometry && object.material) {
                collidableObjects.push(object);
            }
        });

        const intersects = raycaster.intersectObjects(collidableObjects, true);
        if (intersects.length > 0) {
            return intersects[0].point.clone().add(direction.clone().multiplyScalar(this.config.collisionOffset));
        }
        return idealPos;
    }

    update(delta) {
        if (!this.target || delta <= 0) return;
        delta = Math.min(delta, 0.033);
        this.updateIdealPosition();
        this.currentPosition.lerp(this.checkCollisions(this.idealPosition), this.config.positionDamping);

        const targetWorldPos = new THREE.Vector3();
        this.target.getWorldPosition(targetWorldPos);
        this.currentLookAt.lerp(targetWorldPos.clone().add(this.config.lookAtOffset), this.config.rotationDamping);
        this.camera.position.copy(this.currentPosition);
        this.camera.lookAt(this.currentLookAt);
    }
}

class Companion {
    constructor(scene, targetPlayer) {
        this.scene = scene;
        this.targetPlayer = targetPlayer;
        this.model = null;
        this.mixer = null;
        this.actions = {};
        this.activeAction = null;
        this.followDistance = 3;
        this.speed = 3.5;
    }

    init(gltf) {
        this.model = gltf.scene.clone();
        this.model.position.set(2, 0, 6);
        this.scene.add(this.model);
        this.mixer = new THREE.AnimationMixer(this.model);
        const animationMap = { idle: 'idle', walk: 'walk', run: 'run' };
        gltf.animations.forEach(clip => {
            const name = animationMap[clip.name.toLowerCase()];
            if (!name) return;
            this.actions[name] = this.mixer.clipAction(clip);
            this.actions[name].clampWhenFinished = true;
            this.actions[name].loop = THREE.LoopRepeat;
        });
        this.fadeToAction('idle', 0.1);
    }

    fadeToAction(name, duration) {
        const action = this.actions[name];
        if (!action) return;
        if (this.activeAction !== action) {
            if (this.activeAction) this.activeAction.fadeOut(duration);
            action.reset().fadeIn(duration).play();
            this.activeAction = action;
        }
    }

    update(delta) {
        if (!this.model || !this.targetPlayer.model) return;
        this.mixer.update(delta);
        const playerPos = this.targetPlayer.model.position.clone();
        const companionPos = this.model.position.clone();
        const distance = playerPos.distanceTo(companionPos);
        if (distance > this.followDistance) {
            const dir = playerPos.clone().sub(companionPos).normalize();
            this.model.position.addScaledVector(dir, this.speed * delta);
            this.model.lookAt(playerPos);
            if (distance > 6) this.fadeToAction('run', 0.2);
            else this.fadeToAction('walk', 0.2);
        } else {
            this.fadeToAction('idle', 0.3);
        }
    }
}

class Enemy {
    constructor(scene, targetPlayer) {
        this.scene = scene;
        this.targetPlayer = targetPlayer;
        this.model = null;
        this.mixer = null;
        this.actions = {};
        this.activeAction = null;
        this.speed = 3.5;
        this.detectionRange = 25;
        this.attackRange = 1.5;
        this.attackCooldown = 1.5;
        this.lastAttackTime = 0;
        this.isAlive = true;
    }

    init(gltf) {
        this.model = gltf.scene;
        this.model.position.set(10, 0, 10);
        this.model.scale.set(1, 1, 1);
        this.scene.add(this.model);
        this.mixer = new THREE.AnimationMixer(this.model);
        const animationMap = { idle: 'idle', walk: 'walk', run: 'run' };
        gltf.animations.forEach(clip => {
            const name = animationMap[clip.name.toLowerCase()];
            if (!name) return;
            this.actions[name] = this.mixer.clipAction(clip);
            this.actions[name].clampWhenFinished = true;
            this.actions[name].loop = THREE.LoopRepeat;
        });
        this.fadeToAction('idle', 0.1);
        console.log('Enemy spawned.');
    }

    fadeToAction(name, duration) {
        const action = this.actions[name];
        if (!action) return;
        if (this.activeAction !== action) {
            if (this.activeAction) this.activeAction.fadeOut(duration);
            action.reset().fadeIn(duration).play();
            this.activeAction = action;
        }
    }

    update(delta, clockTime) {
        if (!this.isAlive || !this.model || !this.targetPlayer.model) return;
        this.mixer.update(delta);
        const playerPos = this.targetPlayer.model.position.clone();
        const enemyPos = this.model.position.clone();
        const distance = playerPos.distanceTo(enemyPos);
        if (distance < this.attackRange) {
            if (clockTime - this.lastAttackTime > this.attackCooldown) {
                this.attackPlayer();
                this.lastAttackTime = clockTime;
            }
            this.fadeToAction('idle', 0.2);
            return;
        }
        if (distance < this.detectionRange) {
            const dir = playerPos.clone().sub(enemyPos).normalize();
            this.model.position.addScaledVector(dir, this.speed * delta);
            this.model.lookAt(playerPos);
            if (distance > 8) this.fadeToAction('run', 0.2);
            else this.fadeToAction('walk', 0.2);
        } else {
            this.fadeToAction('idle', 0.3);
        }
    }

    attackPlayer() {
        console.log('Enemy hits player!');
        player.takeDamage(25);
    }
}

function toggleControlMode() {
    isPlayerControlActive = !isPlayerControlActive;
    const hint = document.getElementById('control-hint');
    if (typeof controls !== 'undefined' && controls) {
        controls.enabled = !isPlayerControlActive;
    }

    if (isPlayerControlActive) {
        console.log('Player Mode: ON');
        player.activate();
        if (hint) hint.textContent = "Player Mode | Up walk | Shift+Up run | Left/Right turn | Down back up | P to exit";
        if (tpsCamera && player.model) {
            const startPos = player.model.position.clone().add(new THREE.Vector3(0, 2, -5));
            tpsCamera.currentPosition.copy(startPos);
            tpsCamera.currentLookAt.copy(player.model.position);
        }
    } else {
        console.log('Orbit Mode: ON');
        player.deactivate();
        window.playerGraphEditor?.pauseRuntime?.('Paused outside Player Mode');
        if (hint) hint.textContent = "Orbit Mode | Press 'P' for Player Mode | Arrow Keys move the player";
    }
}