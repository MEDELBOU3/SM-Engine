class AdvancedPlayerController {
    constructor(scene, camera) {
        this.scene = scene;
        this.camera = camera;

        // Core Properties
        this.model = null;
        this.mixer = null;
        this.actions = {};
        this.activeAction = null;
        this.state = 'idle';
        this.isActive = false;

        // Debugging
        this.debug = false;
        this.boxHelper = null;
        this.lastLogTime = 0;

        // Input State (using Set for better performance)
        this.pressedKeys = new Set();

        // Physics & Movement
        this.velocity = new THREE.Vector3();
        this.gravity = -30.0;
        this.jumpForce = 14.0;
        this.isGrounded = false;
        this.acceleration = 60.0;
        this.damping = 35.0;
        this.moveSpeed = 4.5;
        this.runSpeed = 8.5;
        this.rotationSpeed = 10.0;

        // Collision Detection
        this.collidableObjects = [];
        this.playerBox = new THREE.Box3();
        this.playerBoxSize = new THREE.Vector3(0.7, 1.8, 0.7);
        this.playerBoxOffset = new THREE.Vector3(0, 0.9, 0);
        this.updatePlayerBox(new THREE.Vector3(0, 0, 5));

        // Camera
        this.cameraOffset = new THREE.Vector3(0, 2.2, 5.5);
        this.cameraLookAtOffset = new THREE.Vector3(0, 1.7, 0);
        this.cameraTargetPosition = new THREE.Vector3();
        this.cameraTargetLookAt = new THREE.Vector3();
        this.cameraLerpFactor = 0.1;


        // Performance optimization
        this.tempVectors = {
            cameraForward: new THREE.Vector3(),
            cameraRight: new THREE.Vector3(),
            moveDirection: new THREE.Vector3(),
            targetVelocity: new THREE.Vector3(),
            horizontalVelocity: new THREE.Vector3(),
            goalPosition: new THREE.Vector3(),
            goalLookAt: new THREE.Vector3()
        };

        // Initialize keyboard controls
        this.setupKeyboardControls();
    }

    init(gltf, collidableMeshList) {
        this.model = gltf.scene;
        this.model.position.set(0, 0, 5);
        
        // Setup animations
        this.mixer = new THREE.AnimationMixer(this.model);
        const animationMap = { 
            idle: 'idle', 
            walk: 'walk', 
            run: 'run', 
            jump: 'jump',
            fall: 'fall'
        };
        
        gltf.animations.forEach(clip => {
            const name = animationMap[clip.name.toLowerCase()];
            if (name) {
                this.actions[name] = this.mixer.clipAction(clip);
                this.actions[name].clampWhenFinished = true;
                this.actions[name].loop = THREE.LoopRepeat;
            }
        });

        // Setup collision objects
        this.collidableObjects = collidableMeshList.map(mesh => ({
            mesh,
            box: new THREE.Box3().setFromObject(mesh)
        }));

        this.fadeToAction('idle', 0.1);

        if (this.debug) {
            this.boxHelper = new THREE.Box3Helper(this.playerBox, 0x00ff00);
            this.scene.add(this.boxHelper);
        }
    }

    activate() {
        if (!this.model) return;
        this.isActive = true;
        this.pressedKeys.clear();
        this.velocity.set(0, 0, 0);
        if (controls) controls.enabled = false;
    }

    deactivate() {
        this.isActive = false;
        this.fadeToAction('idle', 0.2);
        if (controls) controls.enabled = true;
        this.pressedKeys.clear();
    }

    setupKeyboardControls() {
        const onKeyChange = (e, isPressed) => {
            if (!this.isActive) return;
            
            switch (e.key.toLowerCase()) {
                case 'w': case 'a': case 's': case 'd': case 'shift':
                    if (isPressed) this.pressedKeys.add(e.key.toLowerCase());
                    else this.pressedKeys.delete(e.key.toLowerCase());
                    break;
                case ' ':
                    if (isPressed && this.isGrounded) this.jump();
                    break;
            }
        };

        window.addEventListener('keydown', (e) => onKeyChange(e, true));
        window.addEventListener('keyup', (e) => onKeyChange(e, false));
    }

    jump() {
        if (this.isGrounded) {
            this.isGrounded = false;
            this.velocity.y = this.jumpForce;
            this.fadeToAction('jump', 0.1);
        }
    }

    update(delta) {
        if (!this.model || !this.mixer || !this.isActive || delta <= 0) return;

        // Clamp delta to prevent physics issues when tab is inactive
        delta = Math.min(delta, 0.033);
        
        // Get references to temporary vectors
        const {
            cameraForward, cameraRight, moveDirection,
            targetVelocity, horizontalVelocity, goalPosition, goalLookAt
        } = this.tempVectors;

        // 1. Movement Input
        const speed = this.pressedKeys.has('shift') ? this.runSpeed : this.moveSpeed;
        const isMoving = this.pressedKeys.has('w') || this.pressedKeys.has('a') || 
                         this.pressedKeys.has('s') || this.pressedKeys.has('d');

        // Get camera-relative directions
        this.camera.getWorldDirection(cameraForward);
        cameraForward.y = 0;
        cameraForward.normalize();
        cameraRight.crossVectors(this.camera.up, cameraForward).normalize();

        // Calculate movement direction
        moveDirection.set(0, 0, 0);
        if (this.pressedKeys.has('w')) moveDirection.add(cameraForward);
        if (this.pressedKeys.has('s')) moveDirection.sub(cameraForward);
        if (this.pressedKeys.has('a')) moveDirection.sub(cameraRight);
        if (this.pressedKeys.has('d')) moveDirection.add(cameraRight);
        moveDirection.normalize();

        // 2. Velocity Calculation
        targetVelocity.set(0, 0, 0);
        if (isMoving) {
            targetVelocity.copy(moveDirection).multiplyScalar(speed);
        }

        horizontalVelocity.set(this.velocity.x, 0, this.velocity.z);
        const effectiveAccel = isMoving ? this.acceleration : this.damping;
        horizontalVelocity.lerp(targetVelocity, effectiveAccel * delta);

        this.velocity.x = horizontalVelocity.x;
        this.velocity.z = horizontalVelocity.z;
        this.velocity.y += this.gravity * delta;

        // 3. Rotation
        if (isMoving) {
            const targetQuaternion = new THREE.Quaternion()
                .setFromUnitVectors(new THREE.Vector3(0, 0, 1), moveDirection);
            this.model.quaternion.slerp(targetQuaternion, this.rotationSpeed * delta);
        }

        // 4. Collision Detection & Resolution
        const moveDelta = this.velocity.clone().multiplyScalar(delta);
        this.resolveCollisions(moveDelta);

        // 5. Apply Movement
        this.model.position.add(moveDelta);

        // 6. Update Animation
        this.updateAnimationState();
        this.mixer.update(delta);

        // 7. Update Camera (smoothed)
        goalPosition.copy(this.model.position).add(this.cameraOffset);
        goalLookAt.copy(this.model.position).add(this.cameraLookAtOffset);
        
        this.cameraTargetPosition.lerp(goalPosition, this.cameraLerpFactor);
        this.cameraTargetLookAt.lerp(goalLookAt, this.cameraLerpFactor);
        
        this.camera.position.copy(this.cameraTargetPosition);
        this.camera.lookAt(this.cameraTargetLookAt);

        // 8. Debugging
        if (this.debug) {
            this.updatePlayerBox();
            if (this.boxHelper) this.boxHelper.box.copy(this.playerBox);
            
            const now = performance.now();
            if (now - this.lastLogTime > 1000) { // Log once per second
                console.log(`State: ${this.state}, Grounded: ${this.isGrounded}, Vel: [${this.velocity.x.toFixed(2)}, ${this.velocity.y.toFixed(2)}, ${this.velocity.z.toFixed(2)}]`);
                this.lastLogTime = now;
            }
        }

    }

    resolveCollisions(moveDelta) {
        this.isGrounded = false;
        this.updatePlayerBox();

        // Check vertical collision first
        const verticalBox = this.playerBox.clone().translate(new THREE.Vector3(0, moveDelta.y, 0));
        for (const { box } of this.collidableObjects) {
            if (verticalBox.intersectsBox(box)) {
                if (moveDelta.y < 0) {
                    this.isGrounded = true;
                    this.velocity.y = 0;
                    moveDelta.y = box.max.y - this.playerBox.min.y + 0.001;
                } else if (moveDelta.y > 0) {
                    this.velocity.y = 0;
                    moveDelta.y = box.min.y - this.playerBox.max.y - 0.001;
                }
                break;
            }
        }

        // Check horizontal collisions
        const horizontalBox = this.playerBox.clone().translate(new THREE.Vector3(moveDelta.x, moveDelta.y, moveDelta.z));
        for (const { box } of this.collidableObjects) {
            if (horizontalBox.intersectsBox(box)) {
                // X-axis collision
                if (moveDelta.x !== 0) {
                    const xBox = this.playerBox.clone().translate(new THREE.Vector3(moveDelta.x, 0, 0));
                    if (xBox.intersectsBox(box)) {
                        moveDelta.x = 0;
                    }
                }
                
                // Z-axis collision
                if (moveDelta.z !== 0) {
                    const zBox = this.playerBox.clone().translate(new THREE.Vector3(0, 0, moveDelta.z));
                    if (zBox.intersectsBox(box)) {
                        moveDelta.z = 0;
                    }
                }
                break;
            }
        }
    }

    updatePlayerBox(position = this.model.position) {
        const center = position.clone().add(this.playerBoxOffset);
        const halfSize = this.playerBoxSize.clone().multiplyScalar(0.5);
        this.playerBox.set(
            center.clone().sub(halfSize),
            center.clone().add(halfSize)
        );
    }

    updateAnimationState() {
        let newState;
        const horizontalSpeed = Math.sqrt(this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z);

        if (!this.isGrounded) {
            newState = this.velocity.y > 0 ? 'jump' : 'fall';
        } else {
            if (horizontalSpeed > this.runSpeed * 0.7) newState = 'run';
            else if (horizontalSpeed > 0.1) newState = 'walk';
            else newState = 'idle';
        }

        if (this.state !== newState) {
            this.state = newState;
            this.fadeToAction(this.state, 0.2);
        }
    }

    fadeToAction(name, duration) {
        const action = this.actions[name];
        if (!action) return;

        if (this.activeAction !== action) {
            if (this.activeAction) {
                this.activeAction.fadeOut(duration);
            }
            action
                .reset()
                .setEffectiveTimeScale(1)
                .setEffectiveWeight(1)
                .fadeIn(duration)
                .play();
            this.activeAction = action;
        }
    }
}



// =======================================================================
// --- Your Global Functions (toggleControlMode & animate) ---
// =======================================================================
function toggleControlMode() {
    isPlayerControlActive = !isPlayerControlActive;
    const hint = document.getElementById('control-hint');
    if (isPlayerControlActive) {
        player.activate();
        hint.textContent = "Player Mode ACTIVE | W/A/S/D to move, SPACE to jump, SHIFT to run | Press 'P' to exit";
    } else {
        player.deactivate();
        hint.textContent = "Orbit Mode ACTIVE | Press 'P' to enter Player Mode";
    }
}


// =======================================================================
// ▼▼▼ THE NEW, FULLY REVISED AND DEBUGGABLE PLAYER CONTROLLER ▼▼▼
// =======================================================================
/*class AdvancedPlayerController {
    constructor(scene, camera) {
        this.scene = scene;
        this.camera = camera;

        // Core Properties
        this.model = null;
        this.mixer = null;
        this.actions = {};
        this.activeAction = null;
        this.state = 'idle';
        this.isActive = false;

        // Debugging
        this.debug = false;
        this.boxHelper = null;
        this.lastLogTime = 0;

        // Input State (using Set for better performance)
        this.pressedKeys = new Set();

        // Physics & Movement
        this.velocity = new THREE.Vector3();
        this.gravity = -30.0;
        this.jumpForce = 14.0;
        this.isGrounded = false;
        this.acceleration = 60.0;
        this.damping = 35.0;
        this.moveSpeed = 4.5;
        this.runSpeed = 8.5;
        this.rotationSpeed = 10.0;

        // Collision Detection
        this.collidableObjects = [];
        this.playerBox = new THREE.Box3();
        this.playerBoxSize = new THREE.Vector3(0.7, 1.8, 0.7);
        this.playerBoxOffset = new THREE.Vector3(0, 0.9, 0);
        this.updatePlayerBox(new THREE.Vector3(0, 0, 5));

        // Camera
        this.cameraOffset = new THREE.Vector3(0, 2.2, 5.5);
        this.cameraLookAtOffset = new THREE.Vector3(0, 1.7, 0);
        this.cameraTargetPosition = new THREE.Vector3();
        this.cameraTargetLookAt = new THREE.Vector3();
        this.cameraLerpFactor = 0.1;


        // Performance optimization
        this.tempVectors = {
            cameraForward: new THREE.Vector3(),
            cameraRight: new THREE.Vector3(),
            moveDirection: new THREE.Vector3(),
            targetVelocity: new THREE.Vector3(),
            horizontalVelocity: new THREE.Vector3(),
            goalPosition: new THREE.Vector3(),
            goalLookAt: new THREE.Vector3()
        };

        // Initialize keyboard controls
        this.setupKeyboardControls();
    }

    init(gltf, collidableMeshList) {
        this.model = gltf.scene;
        this.model.position.set(0, 0, 5);
        
        // Setup animations
        this.mixer = new THREE.AnimationMixer(this.model);
        const animationMap = { 
            idle: 'idle', 
            walk: 'walk', 
            run: 'run', 
            jump: 'jump',
            fall: 'fall'
        };
        
        gltf.animations.forEach(clip => {
            const name = animationMap[clip.name.toLowerCase()];
            if (name) {
                this.actions[name] = this.mixer.clipAction(clip);
                this.actions[name].clampWhenFinished = true;
                this.actions[name].loop = THREE.LoopRepeat;
            }
        });

        // Setup collision objects
        this.collidableObjects = collidableMeshList.map(mesh => ({
            mesh,
            box: new THREE.Box3().setFromObject(mesh)
        }));

        this.fadeToAction('idle', 0.1);

        if (this.debug) {
            this.boxHelper = new THREE.Box3Helper(this.playerBox, 0x00ff00);
            this.scene.add(this.boxHelper);
        }
    }

    activate() {
        if (!this.model) return;
        this.isActive = true;
        this.pressedKeys.clear();
        this.velocity.set(0, 0, 0);
        if (controls) controls.enabled = false;
    }

    deactivate() {
        this.isActive = false;
        this.fadeToAction('idle', 0.2);
        if (controls) controls.enabled = true;
        this.pressedKeys.clear();
    }

    setupKeyboardControls() {
        const onKeyChange = (e, isPressed) => {
            if (!this.isActive) return;
            
            switch (e.key.toLowerCase()) {
                case 'w': case 'a': case 's': case 'd': case 'shift':
                    if (isPressed) this.pressedKeys.add(e.key.toLowerCase());
                    else this.pressedKeys.delete(e.key.toLowerCase());
                    break;
                case ' ':
                    if (isPressed && this.isGrounded) this.jump();
                    break;
            }
        };

        window.addEventListener('keydown', (e) => onKeyChange(e, true));
        window.addEventListener('keyup', (e) => onKeyChange(e, false));
    }

    jump() {
        if (this.isGrounded) {
            this.isGrounded = false;
            this.velocity.y = this.jumpForce;
            this.fadeToAction('jump', 0.1);
        }
    }

    update(delta) {
        if (!this.model || !this.mixer || !this.isActive || delta <= 0) return;

        // Clamp delta to prevent physics issues when tab is inactive
        delta = Math.min(delta, 0.033);
        
        // Get references to temporary vectors
        const {
            cameraForward, cameraRight, moveDirection,
            targetVelocity, horizontalVelocity, goalPosition, goalLookAt
        } = this.tempVectors;

        // 1. Movement Input
        const speed = this.pressedKeys.has('shift') ? this.runSpeed : this.moveSpeed;
        const isMoving = this.pressedKeys.has('w') || this.pressedKeys.has('a') || 
                         this.pressedKeys.has('s') || this.pressedKeys.has('d');

        // Get camera-relative directions
        this.camera.getWorldDirection(cameraForward);
        cameraForward.y = 0;
        cameraForward.normalize();
        cameraRight.crossVectors(this.camera.up, cameraForward).normalize();

        // Calculate movement direction
        moveDirection.set(0, 0, 0);
        if (this.pressedKeys.has('w')) moveDirection.add(cameraForward);
        if (this.pressedKeys.has('s')) moveDirection.sub(cameraForward);
        if (this.pressedKeys.has('a')) moveDirection.sub(cameraRight);
        if (this.pressedKeys.has('d')) moveDirection.add(cameraRight);
        moveDirection.normalize();

        // 2. Velocity Calculation
        targetVelocity.set(0, 0, 0);
        if (isMoving) {
            targetVelocity.copy(moveDirection).multiplyScalar(speed);
        }

        horizontalVelocity.set(this.velocity.x, 0, this.velocity.z);
        const effectiveAccel = isMoving ? this.acceleration : this.damping;
        horizontalVelocity.lerp(targetVelocity, effectiveAccel * delta);

        this.velocity.x = horizontalVelocity.x;
        this.velocity.z = horizontalVelocity.z;
        this.velocity.y += this.gravity * delta;

        // 3. Rotation
        if (isMoving) {
            const targetQuaternion = new THREE.Quaternion()
                .setFromUnitVectors(new THREE.Vector3(0, 0, 1), moveDirection);
            this.model.quaternion.slerp(targetQuaternion, this.rotationSpeed * delta);
        }

        // 4. Collision Detection & Resolution
        const moveDelta = this.velocity.clone().multiplyScalar(delta);
        this.resolveCollisions(moveDelta);

        // 5. Apply Movement
        this.model.position.add(moveDelta);

        // 6. Update Animation
        this.updateAnimationState();
        this.mixer.update(delta);

        // 7. Update Camera (smoothed)
        goalPosition.copy(this.model.position).add(this.cameraOffset);
        goalLookAt.copy(this.model.position).add(this.cameraLookAtOffset);
        
        this.cameraTargetPosition.lerp(goalPosition, this.cameraLerpFactor);
        this.cameraTargetLookAt.lerp(goalLookAt, this.cameraLerpFactor);
        
        this.camera.position.copy(this.cameraTargetPosition);
        this.camera.lookAt(this.cameraTargetLookAt);

        // 8. Debugging
        if (this.debug) {
            this.updatePlayerBox();
            if (this.boxHelper) this.boxHelper.box.copy(this.playerBox);
            
            const now = performance.now();
            if (now - this.lastLogTime > 1000) { // Log once per second
                console.log(`State: ${this.state}, Grounded: ${this.isGrounded}, Vel: [${this.velocity.x.toFixed(2)}, ${this.velocity.y.toFixed(2)}, ${this.velocity.z.toFixed(2)}]`);
                this.lastLogTime = now;
            }
        }

    }

    resolveCollisions(moveDelta) {
        this.isGrounded = false;
        this.updatePlayerBox();

        // Check vertical collision first
        const verticalBox = this.playerBox.clone().translate(new THREE.Vector3(0, moveDelta.y, 0));
        for (const { box } of this.collidableObjects) {
            if (verticalBox.intersectsBox(box)) {
                if (moveDelta.y < 0) {
                    this.isGrounded = true;
                    this.velocity.y = 0;
                    moveDelta.y = box.max.y - this.playerBox.min.y + 0.001;
                } else if (moveDelta.y > 0) {
                    this.velocity.y = 0;
                    moveDelta.y = box.min.y - this.playerBox.max.y - 0.001;
                }
                break;
            }
        }

        // Check horizontal collisions
        const horizontalBox = this.playerBox.clone().translate(new THREE.Vector3(moveDelta.x, moveDelta.y, moveDelta.z));
        for (const { box } of this.collidableObjects) {
            if (horizontalBox.intersectsBox(box)) {
                // X-axis collision
                if (moveDelta.x !== 0) {
                    const xBox = this.playerBox.clone().translate(new THREE.Vector3(moveDelta.x, 0, 0));
                    if (xBox.intersectsBox(box)) {
                        moveDelta.x = 0;
                    }
                }
                
                // Z-axis collision
                if (moveDelta.z !== 0) {
                    const zBox = this.playerBox.clone().translate(new THREE.Vector3(0, 0, moveDelta.z));
                    if (zBox.intersectsBox(box)) {
                        moveDelta.z = 0;
                    }
                }
                break;
            }
        }
    }

    updatePlayerBox(position = this.model.position) {
        const center = position.clone().add(this.playerBoxOffset);
        const halfSize = this.playerBoxSize.clone().multiplyScalar(0.5);
        this.playerBox.set(
            center.clone().sub(halfSize),
            center.clone().add(halfSize)
        );
    }

    updateAnimationState() {
        let newState;
        const horizontalSpeed = Math.sqrt(this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z);

        if (!this.isGrounded) {
            newState = this.velocity.y > 0 ? 'jump' : 'fall';
        } else {
            if (horizontalSpeed > this.runSpeed * 0.7) newState = 'run';
            else if (horizontalSpeed > 0.1) newState = 'walk';
            else newState = 'idle';
        }

        if (this.state !== newState) {
            this.state = newState;
            this.fadeToAction(this.state, 0.2);
        }
    }

    fadeToAction(name, duration) {
        const action = this.actions[name];
        if (!action) return;

        if (this.activeAction !== action) {
            if (this.activeAction) {
                this.activeAction.fadeOut(duration);
            }
            action
                .reset()
                .setEffectiveTimeScale(1)
                .setEffectiveWeight(1)
                .fadeIn(duration)
                .play();
            this.activeAction = action;
        }
    }
}



// =======================================================================
// --- Your Global Functions (toggleControlMode & animate) ---
// =======================================================================
function toggleControlMode() {
    isPlayerControlActive = !isPlayerControlActive;
    const hint = document.getElementById('control-hint');
    if (isPlayerControlActive) {
        player.activate();
        hint.textContent = "Player Mode ACTIVE | W/A/S/D to move, SPACE to jump, SHIFT to run | Press 'P' to exit";
    } else {
        player.deactivate();
        hint.textContent = "Orbit Mode ACTIVE | Press 'P' to enter Player Mode";
    }
}*/


//=======================================================================
//================== ▼▼▼ Motion matching ▼▼▼ ===========================
//=======================================================================
// This is a placeholder for the motion matching system.
// =================== ▼▼▼ Motion Matching ▼▼▼ ===========================
