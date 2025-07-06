/**
 * A player character controller that can be toggled on and off.
 * When active, it takes control of the camera for a third-person view.
 * When inactive, it relinquishes camera control back to other systems like OrbitControls.
 */

/**
 * AdvancedPlayerController for a fluid, physics-based, third-person character.
 * Features:
 * - Camera-relative strafe movement
 * - Acceleration & Deceleration for inertia
 * - Physics-based jumping with gravity
 * - Ground detection via Raycasting
 * - Advanced animation state machine (idle, walk, run, jump)
 */


class AdvancedPlayerController {
    constructor(scene, camera) {
        this.scene = scene;
        this.camera = camera;

        // Model and Animation
        this.model = null;
        this.mixer = null;
        this.actions = new Map();
        this.state = 'idle';
        this.isActive = false;

        // Input State
        this.keys = { w: false, a: false, s: false, d: false, shift: false, space: false };
        
        // Physics and Movement Properties
        this.velocity = new THREE.Vector3();
        this.gravity = -30;         // Stronger gravity for a less "floaty" feel
        this.jumpHeight = 10;
        this.isGrounded = false;

        this.moveSpeed = 4.5; // A comfortable walking pace
        this.runSpeed = 8.0;  // A brisk but not frantic run
        this.rotationSpeed = 10; // Slightly slower turn speed for a weightier feel
        
        // Tools
        this.raycaster = new THREE.Raycaster();
        this.collidableObjects = []; // We will add the ground to this
        
        // Camera
        // --- Or this for a very close view ---
this.cameraOffset = new THREE.Vector3(0.5, 1.8, 2.8); // Very close and low.
        //this.cameraOffset = new THREE.Vector3(0, 2.5, 6);
        this.cameraLookAtOffset = new THREE.Vector3(0, 1.5, 0);
        this.cameraTransitionProgress = 1; 
    }

    init(gltf, collidableMeshList) {
        this.model = gltf.scene;
        this.model.scale.set(0.8, 0.8, 0.8);
        this.model.position.set(0, 0, 0);

        this.model.traverse(child => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
        
        this.scene.add(this.model);
        this.collidableObjects = collidableMeshList;

        this.mixer = new THREE.AnimationMixer(this.model);
        // IMPORTANT: The names 'idle', 'walk', 'run', 'jump' must match your animation names (case-insensitive)
        const animationMap = new Map([
            ['idle', 'Idle'],
            ['walk', 'Walk'],
            ['run', 'Run'],
            ['jump', 'Run'] // <-- Using "Run" as a fallback if "Jump" doesn't exist.
        ]);

        gltf.animations.forEach(clip => {
            const clipName = clip.name.toLowerCase();
            for (const [key, value] of animationMap.entries()) {
                if (value.toLowerCase() === clipName) {
                    this.actions.set(key, this.mixer.clipAction(clip));
                }
            }
        });

        // Ensure we have a jump action, even if it's a fallback
        if (!this.actions.has('jump')) {
            console.warn("Jump animation not found. Using 'Run' as a fallback.");
            if (this.actions.has('run')) {
                this.actions.set('jump', this.actions.get('run'));
            }
        }
        
        this.switchToAction('idle');
        this.setupKeyboardControls();
        addObjectToScene(this.model, "Player Model", "player");
        // Add the player model to the collidable objects for ground detection
        console.log("Advanced Player Controller Initialized.");
    }

    activate() {
        if (!this.model) return;
        this.isActive = true;
        // Start the camera transition
        this.cameraTransitionProgress = 0; 
        
        // Store the starting position and look-at for the smooth transition
        this.cameraStartPos = this.camera.position.clone();
        
        // The target look-at is the player's head area
        const targetLookAt = new THREE.Vector3().copy(this.cameraLookAtOffset);
        targetLookAt.add(this.model.position);
        this.cameraStartLookAt = targetLookAt; // For now, we'll just store this. A more complex slerp could use the camera's current target.
    }

    deactivate() {
        this.isActive = false;
        Object.keys(this.keys).forEach(k => this.keys[k] = false);
        this.velocity.set(0, 0, 0);
        this.switchToAction('idle');
        
        // This ensures a smooth transition *back* to OrbitControls
        if(this.model) {
            controls.target.copy(this.model.position);
            controls.update();
        }
    }

    setupKeyboardControls() {
        const handleKey = (e, value) => {
            switch (e.key.toLowerCase()) {
                case 'w': this.keys.w = value; break;
                case 'a': this.keys.a = value; break;
                case 's': this.keys.s = value; break;
                case 'd': this.keys.d = value; break;
                case ' ': this.keys.space = value; break;
                case 'shift': this.keys.shift = value; break;
            }
        };
        window.addEventListener('keydown', (e) => handleKey(e, true));
        window.addEventListener('keyup', (e) => handleKey(e, false));
    }

    checkIfGrounded() {
        if (!this.model) return;
        const origin = new THREE.Vector3(this.model.position.x, this.model.position.y + 0.1, this.model.position.z);
        this.raycaster.set(origin, new THREE.Vector3(0, -1, 0));
        const intersections = this.raycaster.intersectObjects(this.collidableObjects, false);
        this.isGrounded = intersections.length > 0 && intersections[0].distance < 0.2;
    }

    handlePhysics(delta) {
        this.checkIfGrounded();

        if (this.isGrounded) {
            this.velocity.y = 0; // Stop downward velocity on ground
            if (this.keys.space) {
                this.velocity.y = this.jumpHeight; // Jump!
                this.isGrounded = false; // We are no longer on the ground
            }
        } else {
            this.velocity.y += this.gravity * delta; // Apply gravity
        }
        
        // Apply vertical velocity to position
        this.model.position.y += this.velocity.y * delta;
        
        // Failsafe to prevent falling through floor
        if (this.model.position.y < 0) {
            this.model.position.y = 0;
            this.velocity.y = 0;
            this.isGrounded = true;
        }
    }

    handleMovement(delta) {
        // Get camera direction
        const cameraForward = new THREE.Vector3();
        this.camera.getWorldDirection(cameraForward);
        cameraForward.y = 0;
        cameraForward.normalize();

        const cameraRight = new THREE.Vector3().crossVectors(this.camera.up, cameraForward).normalize();

        const moveDirection = new THREE.Vector3();
        if (this.keys.w) moveDirection.add(cameraForward);
        if (this.keys.s) moveDirection.sub(cameraForward);
        if (this.keys.d) moveDirection.add(cameraRight);
        if (this.keys.a) moveDirection.sub(cameraRight);

        const targetSpeed = this.keys.shift ? this.runSpeed : this.moveSpeed;
        
        // Lerp for smooth acceleration/deceleration
        const targetVelocity = moveDirection.clone().normalize().multiplyScalar(targetSpeed);
        
        // We only want to lerp the horizontal components of velocity
        const currentHorizontalVelocity = new THREE.Vector3(this.velocity.x, 0, this.velocity.z);
        const targetHorizontalVelocity = new THREE.Vector3(targetVelocity.x, 0, targetVelocity.z);

        if (moveDirection.lengthSq() > 0) {
            currentHorizontalVelocity.lerp(targetHorizontalVelocity, 10 * delta);
        } else {
            currentHorizontalVelocity.lerp(new THREE.Vector3(0, 0, 0), 20 * delta); // Faster deceleration
        }

        this.velocity.x = currentHorizontalVelocity.x;
        this.velocity.z = currentHorizontalVelocity.z;
        
        // Apply horizontal velocity to position
        this.model.position.x += this.velocity.x * delta;
        this.model.position.z += this.velocity.z * delta;

        // Rotate character to face movement direction
        if (moveDirection.lengthSq() > 0.01) {
            const targetQuaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), moveDirection);
            this.model.quaternion.slerp(targetQuaternion, this.rotationSpeed * delta);
        }
    }

    updateAnimationState() {
        let newState;
        if (!this.isGrounded) {
            newState = 'jump';
        } else {
            const horizontalSpeed = new THREE.Vector3(this.velocity.x, 0, this.velocity.z).length();
            if (horizontalSpeed > this.runSpeed * 0.5) {
                newState = 'run';
            } else if (horizontalSpeed > 0.1) {
                newState = 'walk';
            } else {
                newState = 'idle';
            }
        }
        
        if (this.state !== newState) {
            this.state = newState;
            this.switchToAction(this.state);
        }
    }

    switchToAction(name) {
        const action = this.actions.get(name);
        if (!action) {
            console.warn(`Animation action "${name}" not found.`);
            return;
        }

        const previousAction = this.activeAction;
        this.activeAction = action;

        if (previousAction && previousAction !== this.activeAction) {
            previousAction.fadeOut(0.2);
        }
        
        if (name === 'jump') {
            action.reset().setLoop(THREE.LoopOnce, 1).clampWhenFinished = true;
        } else {
            action.reset().setLoop(THREE.LoopRepeat);
        }

        action.setEffectiveTimeScale(1).setEffectiveWeight(1).fadeIn(0.2).play();
    }
    
    updateCamera(delta) {
        if (!this.model) return;

        // Calculate the GOAL position for the camera (behind the player)
        const goalPosition = new THREE.Vector3().copy(this.cameraOffset);
        goalPosition.add(this.model.position);

        // Calculate the GOAL look-at point (the player's torso)
        const goalLookAt = new THREE.Vector3().copy(this.cameraLookAtOffset);
        goalLookAt.add(this.model.position);

        // Check if we are in the middle of the transition "swoop"
        if (this.cameraTransitionProgress < 1) {
            this.cameraTransitionProgress += delta * 1.5; // Speed of the transition
            this.cameraTransitionProgress = Math.min(this.cameraTransitionProgress, 1); // Clamp at 1
            
            // LERP (linear interpolate) between the start and goal positions
            const transitionPosition = this.cameraStartPos.clone().lerp(goalPosition, this.cameraTransitionProgress);
            this.camera.position.copy(transitionPosition);

        } else {
            // Once the transition is done, use a faster lerp for normal follow-cam behavior
            this.camera.position.lerp(goalPosition, 10 * delta);
        }

        // Always look at the player
        this.camera.lookAt(goalLookAt);
    }
    
    // This is the main update loop, called from animate()
    update(delta) {
        if (!this.model || !this.mixer) return;
        
        // Run player physics and animation updates ONLY IF the player is fully active.
        // We can wait for the camera transition to finish if we want.
        if (this.isActive) {
            this.handlePhysics(delta);
            this.handleMovement(delta);
            this.updateAnimationState();
        }
        
        this.mixer.update(delta);
        
        // IMPORTANT: The camera is now updated *outside* the `isActive` check
        // so the transition-in animation can play.
        if (this.isActive) {
            this.updateCamera(delta);
        }
    }
}


function toggleControlMode() {
    isPlayerControlActive = !isPlayerControlActive;
    const hint = document.getElementById('control-hint');
    
    if (isPlayerControlActive) {
        // ENTERING PLAYER MODE
        // This now triggers the camera transition inside the player controller
        player.activate(); 
        
        controls.enabled = false;
        hint.textContent = "Player Mode ACTIVE | W/A/S/D to move, SPACE to jump, SHIFT to run | Press 'P' to exit";

    } else {
        // ENTERING ORBIT (EDITOR) MODE
        player.deactivate();
        controls.enabled = true;
        hint.textContent = "Orbit Mode ACTIVE | Press 'P' to enter Player Mode";
    }
}

function setupPlayerLighting(camera, scene) {
    // 1. KEY LIGHT (Main light source)
    // Stronger, positioned to one side to create distinct highlights and shadows.
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.5);
    keyLight.position.set(-3, 4, 5); // Positioned above, to the side, and in front
    keyLight.castShadow = true; // The main light casts the primary shadows
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = 50;
    
    // 2. FILL LIGHT
    // Softer, opposite the key light, to soften harsh shadows.
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.4);
    fillLight.position.set(3, 2, 5); // Opposite side of the key light

    // 3. RIM LIGHT (Back light)
    // Positioned behind the character to create a bright outline (rim).
    // This separates the character from the background.
    const rimLight = new THREE.DirectionalLight(0xffddaa, 1.8); // A warm color for a nice effect
    rimLight.position.set(0, 3, -5); // Directly behind and above

    // 4. AMBIENT LIGHT
    // Provides a base level of light to the whole scene, so shadows aren't pure black.
    const ambientLight = new THREE.AmbientLight(0xaaaaaa, 0.3);

    // Parent the lights to the camera. This is the magic part!
    // They will now move with the camera, always lighting the subject correctly.
    camera.add(keyLight);
    camera.add(fillLight);
    camera.add(rimLight);
    
    // The ambient light is global, so it's added to the scene directly.
    scene.add(ambientLight);
    
    console.log("Player lighting setup complete and attached to camera.");
}

/*class Player {
    constructor(scene) {
        this.scene = scene;
        this.model = null;
        this.mixer = null;
        this.actions = new Map();
        this.activeAction = null;

        // Player state
        this.state = 'idle';
        this.isActive = false; // Is the player currently being controlled?

        // Movement properties
        this.moveSpeed = 4;
        this.runSpeed = 8;
        this.turnSpeed = Math.PI * 1.5;

        // Input state
        this.keys = { w: false, a: false, s: false, d: false, shift: false };

        // Camera properties
        this.cameraOffset = new THREE.Vector3(0, 2, 5);
        this.lookAtOffset = new THREE.Vector3(0, 1.5, 0); // Point camera looks at, relative to player
    }

    
    init(gltf) {
        this.model = gltf.scene;
        this.model.scale.set(0.8, 0.8, 0.8);
        this.model.position.set(0, 0, 0);

        this.model.traverse(child => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
        
        this.scene.add(this.model);
        console.log("Player model added to the scene.");

        this.mixer = new THREE.AnimationMixer(this.model);
        gltf.animations.forEach(clip => {
            const action = this.mixer.clipAction(clip);
            this.actions.set(clip.name.toLowerCase(), action);
        });

        this.switchToAction('idle'); // Start with idle animation
        this.setupKeyboardControls();
        addObjectToScene(this.model, "Player Model", "player");
    }
    

    activate() {
        this.isActive = true;
        console.log("Player control ACTIVATED.");
    }
    
   
    deactivate() {
        this.isActive = false;
        // Reset movement keys to prevent running off
        Object.keys(this.keys).forEach(k => this.keys[k] = false);
        // Go back to idle animation when not in control
        this.switchToAction('idle'); 
        console.log("Player control DEACTIVATED. OrbitControls are back.");
    }

    setupKeyboardControls() {
        // We listen for keys regardless of active state,
        // but only act on them in the update loop if active.
        window.addEventListener('keydown', (event) => {
            switch (event.key.toLowerCase()) {
                case 'w': this.keys.w = true; break;
                case 'a': this.keys.a = true; break;
                case 's': this.keys.s = true; break;
                case 'd': this.keys.d = true; break;
                case 'shift': this.keys.shift = true; break;
            }
        });
        window.addEventListener('keyup', (event) => {
            switch (event.key.toLowerCase()) {
                case 'w': this.keys.w = false; break;
                case 'a': this.keys.a = false; break;
                case 's': this.keys.s = false; break;
                case 'd': this.keys.d = false; break;
                case 'shift': this.keys.shift = false; break;
            }
        });
    }

   
    update(delta) {
        if (!this.model || !this.mixer) return;

        // Only process movement and state changes if the player control is active
        if (this.isActive) {
            const isMoving = this.keys.w || this.keys.a || this.keys.s || this.keys.d;
            let newState = isMoving ? (this.keys.shift ? 'running' : 'walking') : 'idle';

            if (this.state !== newState) {
                this.switchToAction(newState);
                this.state = newState;
            }
            this.updateMovement(delta);
        }

        this.mixer.update(delta);
    }
    
  
    updateCamera(camera) {
        if (!this.model) return;

        const desiredPosition = new THREE.Vector3().copy(this.cameraOffset);
        desiredPosition.applyQuaternion(this.model.quaternion);
        desiredPosition.add(this.model.position);
        
        const lookAtPosition = new THREE.Vector3().copy(this.lookAtOffset);
        lookAtPosition.add(this.model.position);

        // Use a lerp for smooth camera movement
        camera.position.lerp(desiredPosition, 0.1);
        // To avoid OrbitControls conflicts, we can't just call lookAt.
        // Instead, we set the target for the next frame's lookAt.
        camera.lookAt(lookAtPosition);
    }

    updateMovement(delta) {
        const currentSpeed = (this.state === 'running') ? this.runSpeed : this.moveSpeed;
        if (this.keys.w) this.model.translateZ(-currentSpeed * delta);
        if (this.keys.s) this.model.translateZ(currentSpeed * delta * 0.5);
        if (this.keys.a) this.model.rotateY(this.turnSpeed * delta);
        if (this.keys.d) this.model.rotateY(-this.turnSpeed * delta);
    }

    switchToAction(name) {
        const newAction = this.actions.get(name);
        if (!newAction || newAction === this.activeAction) return;

        const previousAction = this.activeAction;
        this.activeAction = newAction;

        if (previousAction) {
            previousAction.fadeOut(0.2);
        }

        this.activeAction.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).fadeIn(0.2).play();
    }
}

function toggleControlMode() {
    isPlayerControlActive = !isPlayerControlActive;
    const hint = document.getElementById('control-hint');
    
    if (isPlayerControlActive) {
        // ENTERING PLAYER MODE
        player.activate();
        controls.enabled = false; // Disable OrbitControls
        transformControls.enabled = false; // Disable TransformControls
        hint.textContent = "Player Mode ACTIVE | Press 'P' to return to Orbit Mode";
        
        // When entering player mode, make the OrbitControls target the player
        // so the transition back is smooth.
        controls.target.copy(player.model.position);

    } else {
        // ENTERING ORBIT (EDITOR) MODE
        player.deactivate();
        controls.enabled = true; // Re-enable OrbitControls
        transformControls.enabled = true; // Optional: re-enable transform controls
        hint.textContent = "Orbit Mode ACTIVE | Press 'P' to enter Player Mode";
    }
}*/
