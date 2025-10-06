/*class HorseController {
    constructor(scene, camera) {
        this.scene = scene;
        this.camera = camera;
        
        // Horse state
        this.horse = null;
        this.rider = null;
        this.mounted = false;
        
        // Movement properties
        this.speed = 0;
        this.maxWalkSpeed = 2.5;
        this.maxTrotSpeed = 6;
        this.maxGallopSpeed = 12;
        this.currentGait = 'idle'; // idle, walk, trot, canter, gallop
        
        // Stamina system
        this.stamina = 100;
        this.maxStamina = 100;
        this.staminaDrainRate = 5; // per second when galloping
        this.staminaRecoveryRate = 10; // per second when not galloping
        
        // Animation
        this.animationMixer = null;
        this.animations = {};
        this.currentAnimation = null;
        
        // Physics
        this.velocity = new THREE.Vector3();
        this.acceleration = new THREE.Vector3();
        this.friction = 0.92;
        this.turnSpeed = 2.5;
        
        // IK targets for legs (keys used by code: frontLeft/frontRight/backLeft/backRight)
        this.ikTargets = {
            frontLeft: null,
            frontRight: null,
            backLeft: null,
            backRight: null
        };
        
        // Ground detection
        this.raycaster = new THREE.Raycaster();
        this.groundHeight = 0;
        
        // Input
        this.keys = {};
        this.setupInput();
        
        // Procedural animation
        this.gaitCycle = 0;
        this.headBob = 0;
        this.breathingPhase = 0;
        this.proceduralAnimations = {}; // set in setupProceduralAnimations
        
        // Jump mechanics
        this.isJumping = false;
        this.jumpForce = 8;
        this.gravity = -20;
        this.verticalVelocity = 0;
        
        // Camera system
        this.cameraOffset = new THREE.Vector3(0, 2.5, -5);
        this.cameraTarget = new THREE.Vector3();
        this.cameraLookAt = new THREE.Vector3();
        this.cameraLerp = 0.08;           // smoothing factor for position
        this.cameraLookAtLerp = 0.12;     // smoothing factor for lookAt
        
        // Camera-return management
        this._prevCameraState = null;     // saved on mount
        this.cameraReturning = false;     // true when returning after dismount
        this.cameraReturnThreshold = 0.03;
        this.lastToggleTime = 0;          // for debounce on E key
        this.savedControlsState = null;   // store controls.enabled and target if present
        
        // Footstep system
        this.lastFootstepTime = 0;
        this.footstepInterval = 0.4;
        
        // Initialize UI — will use existing #playerHorseStatus if present
        this.createUI();
    }
    
    // Primary loader - scales model to fit scene and prepares mixer/actions
    async loadHorse(modelUrl = 'https://threejs.org/examples/models/gltf/Horse.glb') {
        const loader = new THREE.GLTFLoader();
        
        return new Promise((resolve, reject) => {
            loader.load(
                modelUrl,
                (gltf) => {
                    this.horse = gltf.scene;

                    // Ensure consistent, small scale for your editor world.
                    this.horse.scale.set(0.01, 0.01, 0.01);
                    this.horse.position.set(0, this.groundHeight, 0);

                    // Setup shadows and rendering flags
                    this.horse.traverse((child) => {
                        if (child.isMesh) {
                            child.castShadow = true;
                            child.receiveShadow = true;
                            child.frustumCulled = false; // safer for small models
                        }
                    });

                    // Add to scene
                    this.scene.add(this.horse);

                    // Setup animation mixer & collect clips
                    this.animationMixer = new THREE.AnimationMixer(this.horse);
                    if (gltf.animations && gltf.animations.length > 0) {
                        gltf.animations.forEach((clip) => {
                            const key = clip.name.toLowerCase();
                            this.animations[key] = this.animationMixer.clipAction(clip);
                            this.animations[key].enabled = true;
                            this.animations[key].setEffectiveWeight(1.0);
                        });
                    }

                    // Procedural animations / IK / saddle
                    this.setupProceduralAnimations();
                    this.setupIKSystem();
                    this.findSaddlePosition();

                    // If the model provided named animations like 'idle','walk','trot','gallop',
                    // start with idle if available
                    if (this.animations['idle']) {
                        this.playAnimation('idle');
                    }

                    console.log('✅ Horse model loaded, scaled (0.01), and ready');
                    resolve(this.horse);
                },
                undefined,
                (err) => {
                    console.error('Horse load error:', err);
                    reject(err);
                }
            );
        });
    }
    
    setupProceduralAnimations() {
        // If model doesn't have animations, we'll create procedural ones
        this.proceduralAnimations = {
            idle: { speed: 0, bounce: 0.02, frequency: 1.5 },
            walk: { speed: 2.5, bounce: 0.08, frequency: 2 },
            trot: { speed: 6, bounce: 0.15, frequency: 3 },
            canter: { speed: 9, bounce: 0.25, frequency: 3.5 },
            gallop: { speed: 12, bounce: 0.35, frequency: 4.5 }
        };
    }
    
    setupIKSystem() {
        // Map user-friendly keys to expected bone name substrings.
        const legMap = [
            { key: 'frontLeft', name: 'front_left' },
            { key: 'frontRight', name: 'front_right' },
            { key: 'backLeft', name: 'back_left' },
            { key: 'backRight', name: 'back_right' }
        ];
        
        legMap.forEach(entry => {
            const bone = this.findBoneByName(entry.name);
            if (bone) {
                const target = new THREE.Object3D();
                bone.getWorldPosition(target.position);
                this.scene.add(target);
                this.ikTargets[entry.key] = { bone, target };
            } else {
                // keep null — not all models have named bones
                this.ikTargets[entry.key] = null;
            }
        });
    }
    
    findBoneByName(name) {
        if (!this.horse) return null;
        let foundBone = null;
        this.horse.traverse((child) => {
            if (child.isBone && child.name && child.name.toLowerCase().includes(name)) {
                foundBone = child;
            }
        });
        return foundBone;
    }
    
    findSaddlePosition() {
        if (!this.horse) return;
        // Try common bone names
        const spine = this.findBoneByName('spine') || this.findBoneByName('back') || this.findBoneByName('pelvis');
        
        if (spine) {
            // Convert spine bone local position to world and then to horse local
            const worldPos = new THREE.Vector3();
            spine.getWorldPosition(worldPos);
            // Convert world to horse local
            this.horse.worldToLocal(worldPos);
            this.saddlePosition = worldPos.clone();
            this.saddlePosition.y += 0.15; // small offset
        } else {
            // Estimate based on horse bounding box
            const box = new THREE.Box3().setFromObject(this.horse);
            const center = box.getCenter(new THREE.Vector3());
            this.saddlePosition = new THREE.Vector3(center.x, box.max.y * 0.7, center.z);
        }
    }
    
    // Save camera state and controls to allow smooth return later
    _saveCameraState() {
        if (!this.camera) return;
        const pos = this.camera.position.clone();
        const quat = this.camera.quaternion.clone();
        const up = this.camera.up ? this.camera.up.clone() : new THREE.Vector3(0,1,0);
        let controlsState = null;
        if (typeof window.controls !== 'undefined' && window.controls) {
            controlsState = {
                enabled: window.controls.enabled,
                target: window.controls.target ? window.controls.target.clone() : null
            };
            // disable controls while mounted to prevent user interference
            window.controls.enabled = false;
        }
        this._prevCameraState = { position: pos, quaternion: quat, up, controlsState };
    }

    // Restore controls after camera finished returning
    _restoreControls() {
        if (this._prevCameraState && this._prevCameraState.controlsState && typeof window.controls !== 'undefined' && window.controls) {
            const cs = this._prevCameraState.controlsState;
            window.controls.enabled = (typeof cs.enabled === 'boolean') ? cs.enabled : true;
            if (cs.target && window.controls.target) {
                window.controls.target.copy(cs.target);
            }
            if (window.controls.update) window.controls.update();
        }
        this._prevCameraState = null;
    }
    
    mount(riderObject) {
        if (this.mounted || !this.horse) return;
        
        this.rider = riderObject;
        this.mounted = true;

        // Save camera state for returning later
        this._saveCameraState();
        this.cameraReturning = false;
        
        // Attach rider to horse
        if (this.rider && this.saddlePosition) {
            // Place rider as child of horse, but preserve rider world transform minimal
            this.horse.add(this.rider);
            this.rider.position.copy(this.saddlePosition);
            this.rider.rotation.set(0, 0, 0);
        }
        
        console.log('Mounted horse');
        this.updateUI();
    }
    
    dismount() {
        if (!this.mounted || !this.rider) return;
        
        // Detach rider preserving world position
        const worldPos = new THREE.Vector3();
        this.rider.getWorldPosition(worldPos);
        
        this.horse.remove(this.rider);
        this.scene.add(this.rider);
        this.rider.position.copy(worldPos);
        this.rider.position.x += 0.5; // Dismount a bit to the side (small offset)

        // Mark as no longer mounted; movement will stop immediately
        this.mounted = false;
        this.rider = null;
        
        // Start smooth camera return to previously saved camera state (if exists)
        if (this._prevCameraState) {
            this.cameraReturning = true;
        } else {
            // If no saved state, ensure controls re-enabled
            if (typeof window.controls !== 'undefined' && window.controls) {
                window.controls.enabled = true;
            }
        }
        
        console.log('Dismounted (camera returning)');
        this.updateUI();
    }
    
    setupInput() {
        // debounce guard
        this.lastToggleTime = 0;

        window.addEventListener('keydown', (e) => {
            const key = e.key.toLowerCase();
            this.keys[key] = true;

            // Mount/Dismount toggle with debounce
            if (key === 'e' && this.horse) {
                const now = performance.now();
                if (now - this.lastToggleTime > 500) {
                    this.lastToggleTime = now;
                    if (this.mounted) {
                        this.dismount();
                        console.log('🧍 Exited horse mode.');
                    } else {
                        // Mount if near horse — uses global player model if present
                        this.mount(window.player?.model);
                        console.log('🐎 Mounted horse.');
                    }
                }
            }

            // Jump
            if (e.key === ' ' && this.mounted && !this.isJumping) {
                this.jump();
            }
        });
        
        window.addEventListener('keyup', (e) => {
            this.keys[e.key.toLowerCase()] = false;
        });
    }
    
    jump() {
        if (this.stamina < 20) return; // Need stamina to jump
        
        this.isJumping = true;
        this.verticalVelocity = this.jumpForce;
        this.stamina -= 20;
        this.updateUI();
        
        console.log('Horse jumping!');
    }
    
    updateMovement(delta) {
        if (!this.horse || !this.mounted) return;
        
        const moveSpeed = this.getCurrentSpeed();
        const direction = new THREE.Vector3();
        
        // Input handling
        if (this.keys['w'] || this.keys['arrowup']) {
            direction.z = 1;
        }
        if (this.keys['s'] || this.keys['arrowdown']) {
            direction.z = -0.5; // Slower backing up
        }
        if (this.keys['a'] || this.keys['arrowleft']) {
            this.horse.rotation.y += this.turnSpeed * delta;
        }
        if (this.keys['d'] || this.keys['arrowright']) {
            this.horse.rotation.y -= this.turnSpeed * delta;
        }
        
        // Sprint (gallop)
        const isGalloping = (this.keys['shift'] || this.keys['shiftleft'] || this.keys['shiftright']) && direction.z > 0;
        
        // Update gait based on speed and inputs
        if (direction.length() === 0) {
            this.currentGait = 'idle';
        } else if (isGalloping && this.stamina > 0) {
            this.currentGait = 'gallop';
            this.stamina -= this.staminaDrainRate * delta;
        } else if (direction.z > 0) {
            // Use current velocity to decide walk vs trot
            if (this.velocity.length() < (this.maxWalkSpeed + 0.5)) {
                this.currentGait = 'walk';
            } else {
                this.currentGait = 'trot';
            }
        }
        
        // Recover stamina
        if (!isGalloping && this.stamina < this.maxStamina) {
            this.stamina += this.staminaRecoveryRate * delta;
        }
        this.stamina = THREE.MathUtils.clamp(this.stamina, 0, this.maxStamina);
        
        // Apply movement
        if (direction.length() > 0) {
            direction.applyQuaternion(this.horse.quaternion);
            direction.normalize();
            
            this.acceleration.copy(direction).multiplyScalar(moveSpeed);
            this.velocity.add(this.acceleration.multiplyScalar(delta));
        }
        
        // Apply friction
        this.velocity.multiplyScalar(this.friction);
        
        // Apply velocity
        this.horse.position.add(this.velocity.clone().multiplyScalar(delta));
        
        // Gravity and jumping
        if (this.isJumping) {
            this.verticalVelocity += this.gravity * delta;
            this.horse.position.y += this.verticalVelocity * delta;
            
            // Ground check
            if (this.horse.position.y <= this.groundHeight) {
                this.horse.position.y = this.groundHeight;
                this.isJumping = false;
                this.verticalVelocity = 0;
            }
        } else {
            // Keep on ground
            this.horse.position.y = this.groundHeight;
        }
        
        // Update speed for animation
        this.speed = this.velocity.length();
        
        this.updateUI();
    }
    
    getCurrentSpeed() {
        switch (this.currentGait) {
            case 'walk': return this.maxWalkSpeed;
            case 'trot': return this.maxTrotSpeed;
            case 'gallop': return this.stamina > 0 ? this.maxGallopSpeed : this.maxTrotSpeed;
            default: return 0;
        }
    }
    
    updateAnimation(delta) {
        if (!this.horse) return;
        
        // Update animation mixer with delta scaled to playback speed if needed
        if (this.animationMixer) {
            this.animationMixer.update(delta);
        }
        
        // Play appropriate animation (with crossfade)
        this.playAnimation(this.currentGait);
        
        // Procedural animation fallback & additive
        this.updateProceduralAnimation(delta);
        
        // Update IK
        this.updateIK(delta);
    }
    
    playAnimation(animName) {
        // Prefer exact lower-case name match; also accept simple synonyms
        const name = animName ? animName.toLowerCase() : 'idle';
        let anim = this.animations[name];
        
        // Try common fallback names if model animations use different names
        if (!anim) {
            if (name === 'trot') anim = this.animations['run'] || this.animations['canter'];
            if (name === 'gallop') anim = this.animations['run'] || this.animations['gallop'];
            if (name === 'walk') anim = this.animations['walk'] || this.animations['step'];
            if (name === 'idle') anim = this.animations['idle'] || this.animations['rest'];
        }
        
        // If there's no clip for this gait, we simply skip and rely on procedural animation
        if (anim) {
            if (anim !== this.currentAnimation) {
                // Crossfade
                const fade = 0.3;
                if (this.currentAnimation) {
                    try { this.currentAnimation.crossFadeTo(anim, fade, false); } catch(e){ }
                    this.currentAnimation.fadeOut(fade);
                }
                anim.reset().fadeIn(0.3).play();
                this.currentAnimation = anim;
            }
        } else {
            // If no animation clip, ensure currentAnimation stops so procedural can be visible
            if (this.currentAnimation) {
                this.currentAnimation.fadeOut(0.2);
                this.currentAnimation = null;
            }
        }
    }
    
    updateProceduralAnimation(delta) {
        if (!this.horse) return;
        
        const gaitData = this.proceduralAnimations[this.currentGait] || this.proceduralAnimations['idle'];
        if (!gaitData) return;
        
        // Update gait cycle
        this.gaitCycle += delta * gaitData.frequency;
        
        // Head bob (small additive transform)
        const bobAmount = gaitData.bounce * Math.sin(this.gaitCycle * Math.PI * 2);
        
        // Find head bone and modulate slightly
        const head = this.findBoneByName('head');
        if (head) {
            // apply a small temporary offset (non accumulative logic intended)
            head.position.y += bobAmount * 0.06;
        }
        
        // Body bounce (tiny)
        this.horse.position.y = this.groundHeight + Math.abs(bobAmount) * 0.02;
        
        // Breathing
        this.breathingPhase += delta * 2;
        const breathAmount = Math.sin(this.breathingPhase) * 0.02;
        const chest = this.findBoneByName('chest') || this.findBoneByName('spine');
        if (chest) {
            chest.scale.y = 1 + breathAmount;
        }
        
        // Tail sway
        const tail = this.findBoneByName('tail');
        if (tail) {
            tail.rotation.x = Math.sin(this.gaitCycle * 2) * 0.08;
            tail.rotation.z = Math.sin(this.gaitCycle * 3) * 0.06;
        }
    }
    
    updateIK(delta) {
        // Update leg IK for terrain adaptation
        Object.keys(this.ikTargets).forEach(legName => {
            const ikData = this.ikTargets[legName];
            if (!ikData) return;
            
            const { bone, target } = ikData;
            if (!bone || !target) return;
            
            // Cast ray down to find ground near the bone
            const rayStart = new THREE.Vector3();
            bone.getWorldPosition(rayStart);
            rayStart.y += 0.5; // small offset above the bone
            
            this.raycaster.set(rayStart, new THREE.Vector3(0, -1, 0));
            const intersects = this.raycaster.intersectObjects(this.scene.children, true);
            
            if (intersects.length > 0) {
                const hit = intersects[0].point;
                // Convert hit to bone's parent local space for smooth lerp
                const parent = bone.parent || this.horse;
                const localTarget = parent.worldToLocal(hit.clone());
                // Smoothly move bone toward target (soft IK)
                bone.position.lerp(localTarget, Math.min(1, 5 * delta));
            }
        });
    }
    
    updateCamera(delta) {
        // If camera is returning after dismount, handle that first
        if (this.cameraReturning && this._prevCameraState) {
            // Lerp position
            const targetPos = this._prevCameraState.position;
            this.camera.position.lerp(targetPos, this.cameraLerp);
            
            // Slerp quaternion towards previous orientation
            const qCurr = this.camera.quaternion.clone();
            const qTarget = this._prevCameraState.quaternion;
            THREE.Quaternion.slerp(qCurr, qTarget, this.camera.quaternion, this.cameraLerp);
            
            // Check if we're close enough to finish
            if (this.camera.position.distanceTo(targetPos) < this.cameraReturnThreshold) {
                // Snap to exact saved state to avoid tiny remaining error
                this.camera.position.copy(targetPos);
                this.camera.quaternion.copy(qTarget);
                this.cameraReturning = false;
                // Restore controls if any
                this._restoreControls();
                console.log('Camera return complete, controls restored.');
            }
            return;
        }
        
        // Normal follow when mounted
        if (!this.horse || !this.mounted) return;
        
        // Calculate camera position behind horse
        const horsePos = new THREE.Vector3();
        this.horse.getWorldPosition(horsePos);
        const horseForward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.horse.quaternion);
        
        // Desired camera world position: slightly behind and above horse
        const desired = horsePos.clone()
            .add(horseForward.clone().multiplyScalar(this.cameraOffset.z))
            .add(new THREE.Vector3(0, this.cameraOffset.y, 0));
        
        // Smooth position lerp
        this.camera.position.lerp(desired, this.cameraLerp);
        
        // Smooth lookAt: compute target look point and lerp a stored vector to it
        const lookAtPoint = horsePos.clone().add(new THREE.Vector3(0, 1.2, 0));
        this.cameraLookAt.lerp(lookAtPoint, this.cameraLookAtLerp);
        this.camera.lookAt(this.cameraLookAt);
    }
    
    update(delta) {
        this.updateMovement(delta);
        this.updateAnimation(delta);
        // updateCamera runs even during camera-return handling
        this.updateCamera(delta);
    }
    
    createUI() {
        // Check for existing container
        const existing = document.getElementById('playerHorseStatus');
            if (existing) {
                this.uiContainer = existing;
            } else {
                // Create new container with the timeline panel as parent
                const el = document.createElement('div');
                el.id = 'playerHorseStatus';
                const timelineBody = document.getElementById('timelineBody');
                timelineBody.appendChild(el);
                this.uiContainer = el;
            }
    
            // Style adjustments to match timeline theme
            this.uiContainer.style.Width = '100%';
            this.uiContainer.style.height = 'auto'; // Reduced height to match timeline aesthetics
            this.uiContainer.style.minWidth = '200px';
            this.uiContainer.style.background = 'var(--secondary-dark, #2a2a2a)';
            this.uiContainer.style.color = 'var(--text-primary, #ffffff)';
            this.uiContainer.style.fontFamily = "'Segoe UI', 'Arial', sans-serif";
            this.uiContainer.style.fontSize = '11px';
            this.uiContainer.style.padding = '4px 8px';
            this.uiContainer.style.display = 'none';
            this.uiContainer.style.lineHeight = '1.2';
            this.uiContainer.style.overflow = 'hidden';

            // Updated HTML structure to match timeline styling
            this.uiContainer.innerHTML = `
                <div style="display:flex;align-items:center;gap:8px;height:100%;">
                   <div id="horse-gait" 
                        style="flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
                        color:var(--text-secondary, #aaaaaa);">
                   Gait: Idle
                </div>
                <div id="horse-speed" 
                    style="width:70px;text-align:right;
                        color:var(--accent-blue, #3fa9f5);">
                        0.0 m/s
                </div>
                <div id="horse-stam" 
                    style="width:50px;text-align:right;margin-left:6px;
                        color:var(--accent-green, #4CAF50);">
                     100%
                </div>
            </div>
       `;
    }
    
    
    updateUI() {
        if (!this.uiContainer) return;
        
        // Show UI only when mounted
        this.uiContainer.style.display = this.mounted ? 'block' : (this.cameraReturning ? 'block' : 'none');
        
        const gaitEl = this.uiContainer.querySelector('#horse-gait');
        const speedEl = this.uiContainer.querySelector('#horse-speed');
        const stamEl = this.uiContainer.querySelector('#horse-stam');
        
        if (gaitEl) gaitEl.textContent = `Gait: ${this.currentGait.charAt(0).toUpperCase() + this.currentGait.slice(1)}`;
        if (speedEl) speedEl.textContent = `${this.speed.toFixed(1)} m/s`;
        if (stamEl) stamEl.textContent = `${Math.round((this.stamina / this.maxStamina) * 100)}%`;
    }
    
    dispose() {
        if (this.horse) {
            this.scene.remove(this.horse);
            this.horse.traverse((c) => {
                if (c.geometry) c.geometry.dispose?.();
                if (c.material) {
                    if (Array.isArray(c.material)) c.material.forEach(m => m.dispose?.());
                    else c.material.dispose?.();
                }
            });
            this.horse = null;
        }
        
        if (this.uiContainer && !document.getElementById('playerHorseStatus')) {
            // only remove if we created it (if user had their own #playerHorseStatus keep it)
            this.uiContainer.remove();
        }
        
        if (this.animationMixer) {
            this.animationMixer.stopAllAction();
            this.animationMixer = null;
        }
    }
}*/

class HorseController {
    constructor(scene, camera) {
        this.scene = scene;
        this.camera = camera;

        // Horse state
        this.horse = null;
        this.rider = null; // Will be window.player.model
        this.mounted = false;

        // Movement properties
        this.speed = 0;
        this.maxWalkSpeed = 2.5;
        this.maxTrotSpeed = 6;
        this.maxGallopSpeed = 12;
        this.currentGait = 'idle'; // idle, walk, trot, canter, gallop

        // Stamina system
        this.stamina = 100;
        this.maxStamina = 100;
        this.staminaDrainRate = 5; // per second when galloping
        this.staminaRecoveryRate = 10; // per second when not galloping

        // Animation
        this.animationMixer = null;
        this.animations = {}; // Stores THREE.AnimationAction
        this.currentAnimation = null; // Currently playing animation action
        this.animationCrossfadeTime = 0.3; // Default crossfade duration

        // Physics
        this.velocity = new THREE.Vector3();
        this.acceleration = new THREE.Vector3();
        this.friction = 0.92;
        this.turnSpeed = 2.5; // Radians per second

        // IK targets for legs (keys used by code: frontLeft/frontRight/backLeft/backRight)
        this.ikTargets = {
            frontLeft: null, frontRight: null, backLeft: null, backRight: null
        };

        // Ground detection
        this.raycaster = new THREE.Raycaster();
        this.groundHeight = 0; // Will be set based on scene ground

        // Input
        this.keys = {};
        this.setupInput();

        // Procedural animation
        this.gaitCycle = 0;
        this.headBob = 0;
        this.breathingPhase = 0;
        this.proceduralAnimations = {}; // set in setupProceduralAnimations

        // Jump mechanics
        this.isJumping = false;
        this.jumpForce = 8;
        this.gravity = -20; // Default gravity, can be linked to global physics system
        this.verticalVelocity = 0;

        // Camera system
        this.cameraOffset = new THREE.Vector3(0, 2.5, -5); // Default behind and above
        this.cameraTarget = new THREE.Vector3(); // Target for camera position (internal use)
        this.cameraLookAt = new THREE.Vector3(); // Target for camera lookAt (internal use)
        this.cameraLerp = 0.08;           // smoothing factor for position
        this.cameraLookAtLerp = 0.12;     // smoothing factor for lookAt

        // Camera-return management
        this._prevCameraState = null;     // saved on mount
        this.cameraReturning = false;     // true when returning after dismount
        this.cameraReturnThreshold = 0.03; // Distance threshold for camera snap
        this.lastToggleTime = 0;          // for debounce on E key
        this.savedControlsState = null;   // store controls.enabled and target if present

        // Footstep system
        this.lastFootstepTime = 0;
        this.footstepInterval = 0.4; // Time between footsteps (can vary by gait)

        // Initialize UI — will use existing #playerHorseStatus if present
        this.createUI();
    }

    // Primary loader - scales model to fit scene and prepares mixer/actions
    async loadHorse(modelUrl = 'https://threejs.org/examples/models/gltf/Horse.glb') {
        const loader = new THREE.GLTFLoader();

        return new Promise((resolve, reject) => {
            loader.load(
                modelUrl,
                (gltf) => {
                    this.horse = gltf.scene;

                    // Ensure consistent, small scale for your editor world.
                    // This scale MUST be consistent with how you load other models
                    // and how your movement/physics operate.
                    this.horse.scale.set(0.01, 0.01, 0.01);
                    this.horse.position.set(0, this.groundHeight, 0);
                    this.horse.name = "RideableHorse"; // Give it a recognizable name

                    // Setup shadows and rendering flags
                    this.horse.traverse((child) => {
                        if (child.isMesh) {
                            child.castShadow = true;
                            child.receiveShadow = true;
                            child.frustumCulled = false; // safer for small models
                            // If horse also needs to be part of Nanite system, add userData.static = false here
                        }
                    });

                    // Add to scene
                    this.scene.add(this.horse);

                    // Setup animation mixer & collect clips
                    this.animationMixer = new THREE.AnimationMixer(this.horse);
                    if (gltf.animations && gltf.animations.length > 0) {
                        gltf.animations.forEach((clip) => {
                            const key = clip.name.toLowerCase();
                            this.animations[key] = this.animationMixer.clipAction(clip);
                            this.animations[key].enabled = true; // Enabled by default, weight will control visibility
                            this.animations[key].setEffectiveWeight(0); // Start with 0 weight, will be faded in
                        });
                    } else {
                        console.warn('No animations found in horse GLTF model. Relying on procedural animations.');
                    }

                    // Procedural animations / IK / saddle
                    this.setupProceduralAnimations();
                    this.setupIKSystem();
                    this.findSaddlePosition();

                    // If the model provided named animations like 'idle','walk','trot','gallop',
                    // start with idle if available
                    if (this.animations['idle']) {
                        this.playAnimation('idle');
                    } else {
                        // Ensure no animation is actively set to avoid errors if no clips
                        this.currentAnimation = null;
                    }

                    // Initialize cameraLookAt to current horse position for smooth start
                    this.horse.getWorldPosition(this.cameraLookAt);

                    console.log('✅ Horse model loaded, scaled (0.01), and ready');
                    resolve(this.horse);
                },
                undefined,
                (err) => {
                    console.error('Horse load error:', err);
                    reject(err);
                }
            );
        });
    }

    setupProceduralAnimations() {
        // If model doesn't have animations, we'll create procedural ones
        this.proceduralAnimations = {
            idle: { speed: 0, bounce: 0.02, frequency: 1.5 },
            walk: { speed: 2.5, bounce: 0.08, frequency: 2 },
            trot: { speed: 6, bounce: 0.15, frequency: 3 },
            canter: { speed: 9, bounce: 0.25, frequency: 3.5 },
            gallop: { speed: 12, bounce: 0.35, frequency: 4.5 }
        };
    }

    setupIKSystem() {
        // Map user-friendly keys to expected bone name substrings.
        const legMap = [
            { key: 'frontLeft', name: 'front_left' },
            { key: 'frontRight', name: 'front_right' },
            { key: 'backLeft', name: 'back_left' },
            { key: 'backRight', name: 'back_right' }
        ];

        legMap.forEach(entry => {
            const bone = this.findBoneByName(entry.name);
            if (bone) {
                const target = new THREE.Object3D();
                target.name = `IK_Target_${entry.key}`;
                bone.getWorldPosition(target.position);
                this.scene.add(target); // Add IK target to scene or a debug group
                this.ikTargets[entry.key] = { bone, target };
                // Optionally: this.scene.add(new THREE.AxesHelper(0.1)); // visualize target
            } else {
                console.warn(`IK bone for ${entry.key} (matching '${entry.name}') not found.`);
                this.ikTargets[entry.key] = null;
            }
        });
    }

    findBoneByName(name) {
        if (!this.horse) return null;
        let foundBone = null;
        // Case-insensitive search
        const lowerName = name.toLowerCase();
        this.horse.traverse((child) => {
            if (child.isBone && child.name && child.name.toLowerCase().includes(lowerName)) {
                foundBone = child;
            }
        });
        return foundBone;
    }

    findSaddlePosition() {
        if (!this.horse) return;
        // Try common bone names
        const spine = this.findBoneByName('spine') || this.findBoneByName('back') || this.findBoneByName('pelvis') || this.findBoneByName('hip');

        if (spine) {
            // Convert spine bone local position to world and then to horse local
            const worldPos = new THREE.Vector3();
            spine.getWorldPosition(worldPos);
            // Convert world to horse local
            this.horse.worldToLocal(worldPos);
            this.saddlePosition = worldPos.clone();
            this.saddlePosition.y += 0.15; // small offset
            console.log("Saddle position found relative to spine:", this.saddlePosition);
        } else {
            // Estimate based on horse bounding box if no spine bone is found
            const box = new THREE.Box3().setFromObject(this.horse);
            box.getSize(new THREE.Vector3()); // Recalculate if not fresh
            const center = box.getCenter(new THREE.Vector3());
            this.saddlePosition = new THREE.Vector3(center.x, box.max.y * 0.7, center.z);
            console.warn("Could not find spine bone for saddle. Estimating position:", this.saddlePosition);
        }
    }

    // Save camera state and controls to allow smooth return later
    _saveCameraState() {
        if (!this.camera) return;
        const pos = this.camera.position.clone();
        const quat = this.camera.quaternion.clone();
        // window.controls (OrbitControls) usually manages camera.up
        const up = this.camera.up ? this.camera.up.clone() : new THREE.Vector3(0, 1, 0);

        // Save OrbitControls state if it exists
        let controlsState = null;
        if (typeof window.controls !== 'undefined' && window.controls) {
            controlsState = {
                enabled: window.controls.enabled,
                target: window.controls.target ? window.controls.target.clone() : null,
                autoRotate: window.controls.autoRotate, // Save auto-rotate state
                autoRotateSpeed: window.controls.autoRotateSpeed
            };
            // Disable controls while mounted to prevent user interference
            window.controls.enabled = false;
        }
        this._prevCameraState = { position: pos, quaternion: quat, up, controlsState };
    }

    // Restore controls after camera finished returning
    _restoreControls() {
        if (this.savedControlsState && typeof window.controls !== 'undefined' && window.controls) {
            const cs = this.savedControlsState;
            window.controls.enabled = cs.enabled;
            if (cs.target) {
                window.controls.target.copy(cs.target);
            }
            window.controls.autoRotate = cs.autoRotate;
            window.controls.autoRotateSpeed = cs.autoRotateSpeed;
            if (window.controls.update) window.controls.update(); // Update controls to apply changes
        }
        this.savedControlsState = null; // Clear saved state
        this._prevCameraState = null;   // Clear camera state
    }

    // New helper to set player to idle and disable its controls
    _disablePlayerControlsAndAnimateIdle() {
        if (window.player) {
            window.player.isPlayerControlActive = false; // Disable player input
            window.player.playAnimation('idle');         // Set player to idle animation
            window.player.updateAnimationState('idle');  // Update internal state
        }
        if (window.controls) {
            window.controls.enabled = false; // Disable OrbitControls
        }
    }

    // New helper to restore player controls and set to walk/run
    _enablePlayerControlsAndAnimateWalk() {
        if (window.player) {
            window.player.isPlayerControlActive = true; // Re-enable player input
            // Player will start walking/running based on input
            window.player.playAnimation('idle'); // Start with idle, input will change
            window.player.updateAnimationState('idle');
        }
        if (window.controls) {
            window.controls.enabled = true; // Re-enable OrbitControls
        }
    }

    // The main entry point to "horse mode"
    enterHorseMode(playerModel) {
        if (!this.horse) {
            console.error("Horse model not loaded, cannot enter horse mode.");
            return;
        }
        if (this.mounted) {
            console.warn("Already in horse mode, cannot re-enter.");
            return;
        }

        // Save the current state of player controls and camera
        this._saveCameraState();
        this._disablePlayerControlsAndAnimateIdle(); // Player sits idle and still

        this.mount(playerModel); // Call the actual mount logic
        console.log('🐎 Entered horse mode!');

        // If you have a global state manager for editor modes:
        if (typeof window.setEditorMode === 'function') {
            window.setEditorMode('horseMode'); // Or similar
        }
    }

    // The main exit point from "horse mode"
    exitHorseMode() {
        if (!this.mounted) {
            console.warn("Not currently in horse mode, cannot exit.");
            return;
        }

        this.dismount(); // Call the actual dismount logic
        console.log('🧍 Exited horse mode.');

        this._enablePlayerControlsAndAnimateWalk(); // Restore player controls and animation

        // If you have a global state manager for editor modes:
        if (typeof window.setEditorMode === 'function') {
            window.setEditorMode('idle'); // Or back to a default mode
        }
    }

    mount(riderObject) {
        if (this.mounted || !this.horse || !riderObject) return;

        this.rider = riderObject;
        this.mounted = true;

        // Save window.controls state here before disabling (only if not already returning)
        if (typeof window.controls !== 'undefined' && window.controls) {
            this.savedControlsState = {
                enabled: window.controls.enabled,
                target: window.controls.target ? window.controls.target.clone() : null,
                autoRotate: window.controls.autoRotate,
                autoRotateSpeed: window.controls.autoRotateSpeed
            };
            window.controls.enabled = false; // Disable OrbitControls
        }

        this.cameraReturning = false; // Reset camera return flag
        this.horse.getWorldPosition(this.cameraLookAt); // Initialize camera lookAt for smooth start

        // Attach rider to horse
        if (this.rider && this.saddlePosition) {
            // Detach rider from its current parent (scene or player's internal container)
            if (this.rider.parent) {
                this.rider.parent.remove(this.rider);
            }
            this.horse.add(this.rider);
            this.rider.position.copy(this.saddlePosition);
            this.rider.rotation.set(0, 0, 0); // Reset rider's local rotation
            this.rider.visible = true; // Ensure rider is visible
            // If rider has its own mixer, stop its animations
            if (this.rider.userData?.mixer) {
                this.rider.userData.mixer.stopAllAction();
            }
        }

        console.log('Mounted horse');
        this.updateUI();
    }

    dismount() {
        if (!this.mounted || !this.rider) return;

        // Detach rider preserving world position
        const worldPos = new THREE.Vector3();
        this.rider.getWorldPosition(worldPos);

        this.horse.remove(this.rider);
        // Add rider back to its original parent (likely `scene` if it was player.model)
        this.scene.add(this.rider); // Assuming window.player.model is a direct child of scene
        this.rider.position.copy(worldPos);
        this.rider.position.x += 0.5; // Dismount a bit to the side (small offset)
        this.rider.visible = true; // Ensure rider is visible

        // Mark as no longer mounted; movement will stop immediately
        this.mounted = false;
        this.rider = null;

        // Start smooth camera return to previously saved camera state
        if (this._prevCameraState) {
            this.cameraReturning = true;
        } else {
            // If no saved state, ensure controls re-enabled
            this._restoreControls(); // Directly call restore if no camera return needed
        }

        console.log('Dismounted (camera returning)');
        this.updateUI();
    }

    setupInput() {
        this.lastToggleTime = 0; // Debounce timer

        window.addEventListener('keydown', (e) => {
            const key = e.key.toLowerCase();
            this.keys[key] = true;

            // Mount/Dismount toggle with debounce
            if (key === 'e' && this.horse) {
                const now = performance.now();
                if (now - this.lastToggleTime > 500) { // 500ms debounce
                    this.lastToggleTime = now;
                    if (this.mounted) {
                        this.exitHorseMode(); // Use the new exit method
                    } else {
                        // Check if a player exists and is close enough
                        const playerModel = window.player?.model;
                        if (playerModel) {
                            const horseWorldPos = new THREE.Vector3();
                            this.horse.getWorldPosition(horseWorldPos);
                            const playerWorldPos = new THREE.Vector3();
                            playerModel.getWorldPosition(playerWorldPos);

                            if (horseWorldPos.distanceTo(playerWorldPos) < 2.0) { // Arbitrary proximity check
                                this.enterHorseMode(playerModel); // Use the new enter method
                            } else {
                                console.log("Too far from horse to mount.");
                            }
                        } else {
                            console.warn("No global player.model found to mount.");
                        }
                    }
                }
            }

            // Jump (only when mounted)
            if (key === ' ' && this.mounted && !this.isJumping) {
                this.jump();
            }
        });

        window.addEventListener('keyup', (e) => {
            this.keys[e.key.toLowerCase()] = false;
        });
    }

    jump() {
        if (!this.mounted || this.isJumping || this.stamina < 20) return;

        this.isJumping = true;
        this.verticalVelocity = this.jumpForce;
        this.stamina -= 20;
        this.updateUI();

        console.log('Horse jumping!');
        // Trigger a jump animation if available
        this.playAnimation('jump');
    }

    updateMovement(delta) {
        if (!this.horse || !this.mounted) {
            // Ensure horse stops completely if dismounted or not present
            this.velocity.set(0, 0, 0);
            this.acceleration.set(0, 0, 0);
            this.speed = 0;
            this.currentGait = 'idle';
            this.playAnimation('idle'); // Ensure idle animation plays
            this.updateUI();
            return;
        }

        const moveSpeed = this.getCurrentSpeed();
        const direction = new THREE.Vector3();

        // Input handling
        let movingForward = false;
        if (this.keys['w'] || this.keys['arrowup']) {
            direction.z = 1;
            movingForward = true;
        }
        if (this.keys['s'] || this.keys['arrowdown']) {
            direction.z = -0.5; // Slower backing up
        }
        if (this.keys['a'] || this.keys['arrowleft']) {
            this.horse.rotation.y += this.turnSpeed * delta;
        }
        if (this.keys['d'] || this.keys['arrowright']) {
            this.horse.rotation.y -= this.turnSpeed * delta;
        }

        // Sprint (gallop)
        const isGalloping = (this.keys['shift'] || this.keys['shiftleft'] || this.keys['shiftright']) && movingForward && this.stamina > 0;

        // Update gait based on speed and inputs
        if (direction.length() === 0) {
            this.currentGait = 'idle';
        } else if (isGalloping) { // If actively trying to gallop AND stamina is > 0
            this.currentGait = 'gallop';
            this.stamina -= this.staminaDrainRate * delta;
        } else if (movingForward) { // Moving forward but not galloping
            if (this.speed < (this.maxWalkSpeed + this.maxTrotSpeed) / 2) { // Use average of current speed and gait thresholds
                this.currentGait = 'walk';
            } else {
                this.currentGait = 'trot';
            }
        } else if (direction.z < 0) { // Moving backward
            this.currentGait = 'idle'; // Or a specific 'backwards' animation if available
        }

        // Recover stamina
        if (!isGalloping && this.stamina < this.maxStamina) {
            this.stamina += this.staminaRecoveryRate * delta;
        }
        this.stamina = THREE.MathUtils.clamp(this.stamina, 0, this.maxStamina);
        // If stamina hits 0, force trot gait
        if (this.stamina <= 0 && this.currentGait === 'gallop') {
             this.currentGait = 'trot';
        }


        // Apply movement
        if (direction.z !== 0) { // Only apply acceleration if moving forward/backward
            const horseForwardVector = new THREE.Vector3(0, 0, 1).applyQuaternion(this.horse.quaternion);
            this.acceleration.copy(horseForwardVector).multiplyScalar(moveSpeed * direction.z);
            this.velocity.add(this.acceleration.multiplyScalar(delta));
        }


        // Apply friction
        this.velocity.multiplyScalar(Math.pow(this.friction, delta * 60)); // Apply friction more consistently per second
        // Stop completely if velocity is very small to prevent "sliding"
        if (this.velocity.lengthSq() < 0.01) {
             this.velocity.set(0,0,0);
        }

        // Apply velocity
        this.horse.position.add(this.velocity.clone().multiplyScalar(delta));

        // Gravity and jumping
        if (this.isJumping) {
            this.verticalVelocity += this.gravity * delta;
            this.horse.position.y += this.verticalVelocity * delta;

            // Ground check
            if (this.horse.position.y <= this.groundHeight) {
                this.horse.position.y = this.groundHeight;
                this.isJumping = false;
                this.verticalVelocity = 0;
                this.playAnimation(this.currentGait); // Resume ground animation
            }
        } else {
            // Keep on ground
            this.horse.position.y = this.groundHeight;
        }

        // Update speed for animation
        this.speed = this.velocity.length();

        this.updateUI();
    }

    getCurrentSpeed() {
        switch (this.currentGait) {
            case 'walk': return this.maxWalkSpeed;
            case 'trot': return this.maxTrotSpeed;
            case 'gallop': return this.stamina > 0 ? this.maxGallopSpeed : this.maxTrotSpeed; // Can't gallop without stamina
            default: return 0;
        }
    }

    updateAnimation(delta) {
        if (!this.horse || !this.animationMixer) return;

        // Scale delta for animation speed if the horse is moving faster
        // The `playAnimation` method manages crossfades, here we just update
        let animationDelta = delta;
        if (this.currentGait !== 'idle' && this.currentGait !== 'jump') {
            // Speed up animation proportional to actual speed relative to gait's max speed
            const gaitMaxSpeed = this.proceduralAnimations[this.currentGait]?.speed || this.maxWalkSpeed;
            if (gaitMaxSpeed > 0) {
                animationDelta *= (this.speed / gaitMaxSpeed) * 1.5; // Scale animation playback speed
                animationDelta = THREE.MathUtils.clamp(animationDelta, 0.5 * delta, 2.0 * delta); // Clamp to prevent extreme speeds
            }
        }

        this.animationMixer.update(animationDelta);


        // Play appropriate animation (with crossfade) - this should ideally be called once per gait change
        // But for robustness, we call it every frame to ensure the right animation is playing.
        // The `playAnimation` function itself handles the actual crossfade logic.
        this.playAnimation(this.currentGait);

        // Procedural animation fallback & additive
        this.updateProceduralAnimation(delta);

        // Update IK
        this.updateIK(delta);
    }

    playAnimation(animName) {
        // Prefer exact lower-case name match; also accept simple synonyms
        const name = animName ? animName.toLowerCase() : 'idle';
        let anim = this.animations[name];

        // Try common fallback names if model animations use different names
        if (!anim) {
            if (name === 'trot') anim = this.animations['run'] || this.animations['canter'] || this.animations['trot_loop'];
            if (name === 'gallop') anim = this.animations['run'] || this.animations['gallop'] || this.animations['gallop_loop'];
            if (name === 'walk') anim = this.animations['walk'] || this.animations['step'] || this.animations['walk_loop'];
            if (name === 'idle') anim = this.animations['idle'] || this.animations['rest'] || this.animations['idle_loop'];
            if (name === 'jump') anim = this.animations['jump'] || this.animations['takeoff'] || this.animations['leap'];
        }

        // If no clip found at all, just return, procedural animations will handle some visual feedback
        if (!anim) {
            if (this.currentAnimation) {
                this.currentAnimation.fadeOut(this.animationCrossfadeTime).stop();
                this.currentAnimation = null;
            }
            return;
        }

        // Only switch animation if it's different from the current one
        if (anim !== this.currentAnimation) {
            const fadeTime = this.animationCrossfadeTime;
            if (this.currentAnimation) {
                // Ensure previous animation gracefully fades out
                try {
                    this.currentAnimation.crossFadeTo(anim, fadeTime, false);
                    this.currentAnimation.fadeOut(fadeTime);
                } catch (e) {
                    console.error("Crossfade failed, likely due to actions being stopped:", e);
                    // Fallback: forcefully stop old, start new
                    this.currentAnimation.stop();
                    anim.reset().fadeIn(fadeTime).play();
                }
            } else {
                // No current animation, just start the new one
                anim.reset().fadeIn(fadeTime).play();
            }
            this.currentAnimation = anim;
        }
        // Special handling for jump: it's usually a one-shot animation
        if (name === 'jump' && this.currentAnimation) {
            this.currentAnimation.loop = THREE.LoopOnce;
            this.currentAnimation.clampWhenFinished = true;
            // When jump finishes, transition back to appropriate gait
            this.animationMixer.addEventListener('finished', (e) => {
                if (e.action === anim) {
                    this.isJumping = false; // Ensure jump state is cleared
                    this.playAnimation(this.currentGait); // Resume current gait animation
                }
            });
        } else if (this.currentAnimation) {
            this.currentAnimation.loop = THREE.LoopRepeat; // Ensure other animations loop
            this.currentAnimation.clampWhenFinished = false;
        }
    }

    updateProceduralAnimation(delta) {
        if (!this.horse) return;

        const gaitData = this.proceduralAnimations[this.currentGait] || this.proceduralAnimations['idle'];
        if (!gaitData) return;

        // Update gait cycle based on actual speed for more realistic procedural feedback
        this.gaitCycle += delta * (gaitData.frequency * (this.speed / (gaitData.speed || 1) || 1));
        this.gaitCycle %= (2 * Math.PI); // Keep gait cycle within a reasonable range for sine waves

        // Head bob (small additive transform)
        const bobAmount = gaitData.bounce * Math.sin(this.gaitCycle);

        // Find head bone and modulate slightly
        const head = this.findBoneByName('head');
        if (head) {
            head.position.y += bobAmount * 0.06; // Apply a small temporary offset
        }

        // Body bounce (tiny) - this modifies horse's root position directly
        this.horse.position.y = this.groundHeight + Math.abs(bobAmount) * 0.02;

        // Breathing
        this.breathingPhase += delta * 2;
        const breathAmount = Math.sin(this.breathingPhase) * 0.02;
        const chest = this.findBoneByName('chest') || this.findBoneByName('spine');
        if (chest) {
            // Apply only if chest scale isn't 0
            if (chest.scale.y !== 0) {
                 chest.scale.y = 1 + breathAmount;
                 chest.scale.x = 1 - breathAmount * 0.5; // Slight expansion/contraction
            }
        }

        // Tail sway
        const tail = this.findBoneByName('tail');
        if (tail) {
            tail.rotation.x = Math.sin(this.gaitCycle * 2) * 0.08;
            tail.rotation.z = Math.sin(this.gaitCycle * 3) * 0.06;
        }
    }

    updateIK(delta) {
        // Update leg IK for terrain adaptation
        // IK should only apply if there's no animation playing, or as an additive layer
        // For simplicity, we apply it always, but it might override explicit animation bone positions
        if (this.currentAnimation && this.currentAnimation.weight > 0.5) {
            return; // Don't apply simple IK if a full animation is heavily weighted
        }

        Object.keys(this.ikTargets).forEach(legName => {
            const ikData = this.ikTargets[legName];
            if (!ikData) return;

            const { bone, target } = ikData;
            if (!bone || !target) return;

            // Cast ray down to find ground near the bone
            const rayOriginWorld = new THREE.Vector3();
            bone.getWorldPosition(rayOriginWorld);
            rayOriginWorld.y += 0.5; // small offset above the bone

            this.raycaster.set(rayOriginWorld, new THREE.Vector3(0, -1, 0));
            // Only intersect with the ground and obstacles, not the horse itself
            const collidableObjects = [window.ground, window.obstaclesGroup].filter(obj => obj);
            const intersects = this.raycaster.intersectObjects(collidableObjects, true);

            if (intersects.length > 0) {
                const hit = intersects[0].point;
                // Determine target local position for the bone to adapt to ground
                const parent = bone.parent || this.horse; // Parent to convert to local space
                const localHitTarget = parent.worldToLocal(hit.clone());

                // Calculate the desired foot position in the parent's local space
                // This is an oversimplification for a real IK system but provides basic ground adaptation
                const desiredLocalBonePos = new THREE.Vector3(bone.position.x, localHitTarget.y, bone.position.z);

                // Smoothly move bone toward this adapted target
                bone.position.lerp(desiredLocalBonePos, Math.min(1, 5 * delta)); // Lerp factor (5*delta)
            }
        });
    }

    updateCamera(delta) {
        // If camera is returning after dismount, handle that first
        if (this.cameraReturning && this._prevCameraState) {
            const targetPos = this._prevCameraState.position;
            const targetQuat = this._prevCameraState.quaternion;

            // Lerp position
            this.camera.position.lerp(targetPos, this.cameraLerp);

            // Slerp quaternion
            this.camera.quaternion.slerp(targetQuat, this.cameraLerp);

            // Check if we're close enough to finish
            if (this.camera.position.distanceTo(targetPos) < this.cameraReturnThreshold &&
                this.camera.quaternion.angleTo(targetQuat) < this.cameraReturnThreshold) { // Also check quaternion angle
                // Snap to exact saved state to avoid tiny remaining error
                this.camera.position.copy(targetPos);
                this.camera.quaternion.copy(targetQuat);
                this.cameraReturning = false;
                // Restore controls
                this._restoreControls();
                console.log('Camera return complete, controls restored.');
            }
            return; // Do not proceed to normal follow logic
        }

        // Normal follow when mounted
        if (!this.horse || !this.mounted) return;

        // Calculate camera position behind horse
        const horsePos = new THREE.Vector3();
        this.horse.getWorldPosition(horsePos);
        const horseForward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.horse.quaternion);

        // Desired camera world position: slightly behind and above horse
        // This is relative to the horse, so horseForward should be inverted for Z offset
        const desiredCameraWorldPos = horsePos.clone()
            .add(horseForward.clone().multiplyScalar(this.cameraOffset.z)) // cameraOffset.z is negative
            .add(new THREE.Vector3(0, this.cameraOffset.y, 0));

        // Smooth position lerp
        this.camera.position.lerp(desiredCameraWorldPos, this.cameraLerp);

        // Smooth lookAt: compute target look point and lerp a stored vector to it
        const lookAtPoint = horsePos.clone().add(new THREE.Vector3(0, 1.2, 0)); // Look slightly above horse's center
        this.cameraLookAt.lerp(lookAtPoint, this.cameraLookAtLerp);
        this.camera.lookAt(this.cameraLookAt);
    }

    update(delta) {
        this.updateMovement(delta);
        this.updateAnimation(delta);
        this.updateCamera(delta);
    }

    createUI() {
        const uiId = 'playerHorseStatus';
        let existing = document.getElementById(uiId);

        if (!existing) {
            // If UI doesn't exist, create it and append to timelineBody (or another suitable parent)
            const el = document.createElement('div');
            el.id = uiId;
            const timelineBody = document.getElementById('timelineBody'); // Assuming timelineBody exists
            if (timelineBody) {
                timelineBody.appendChild(el);
            } else {
                document.body.appendChild(el); // Fallback to body
                console.warn("timelineBody not found for HorseController UI, appending to body.");
            }
            this.uiContainer = el;
        } else {
            this.uiContainer = existing;
        }

        // Apply consistent styling
        Object.assign(this.uiContainer.style, {
            width: '100%',
            height: 'auto',
            minWidth: '200px',
            background: 'var(--secondary-dark, #2a2a2a)',
            color: 'var(--text-primary, #ffffff)',
            fontFamily: "'Segoe UI', 'Arial', sans-serif",
            fontSize: '11px',
            padding: '4px 8px',
            display: 'none', // Hidden by default, shown when mounted
            lineHeight: '1.2',
            overflow: 'hidden',
        });

        this.uiContainer.innerHTML = `
            <div style="display:flex;align-items:center;gap:8px;height:100%;">
               <div id="horse-gait"
                    style="flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
                    color:var(--text-secondary, #aaaaaa);">
               Gait: Idle
            </div>
            <div id="horse-speed"
                style="width:70px;text-align:right;
                    color:var(--accent-blue, #3fa9f5);">
                    0.0 m/s
            </div>
            <div id="horse-stam"
                style="width:50px;text-align:right;margin-left:6px;
                    color:var(--accent-green, #4CAF50);">
                 100%
            </div>
        </div>
        `;
    }


    updateUI() {
        if (!this.uiContainer) return;

        // Show UI only when mounted or when camera is returning (during dismount transition)
        this.uiContainer.style.display = (this.mounted || this.cameraReturning) ? 'block' : 'none';

        const gaitEl = this.uiContainer.querySelector('#horse-gait');
        const speedEl = this.uiContainer.querySelector('#horse-speed');
        const stamEl = this.uiContainer.querySelector('#horse-stam');

        if (gaitEl) gaitEl.textContent = `Gait: ${this.currentGait.charAt(0).toUpperCase() + this.currentGait.slice(1)}`;
        if (speedEl) speedEl.textContent = `${this.speed.toFixed(1)} m/s`;
        if (stamEl) {
            const stamPercentage = Math.round((this.stamina / this.maxStamina) * 100);
            stamEl.textContent = `${stamPercentage}%`;
            // Change color based on stamina
            if (stamPercentage < 20) stamEl.style.color = 'var(--accent-red, #f44336)';
            else if (stamPercentage < 50) stamEl.style.color = 'var(--accent-orange, #ff9800)';
            else stamEl.style.color = 'var(--accent-green, #4CAF50)';
        }
    }

    dispose() {
        if (this.horse) {
            this.scene.remove(this.horse);
            this.horse.traverse((c) => {
                if (c.geometry) c.geometry.dispose?.();
                if (c.material) {
                    if (Array.isArray(c.material)) c.material.forEach(m => m.dispose?.());
                    else c.material.dispose?.();
                }
            });
            this.horse = null;
        }

        // Dispose IK targets
        Object.values(this.ikTargets).forEach(ikData => {
            if (ikData && ikData.target && ikData.target.parent) {
                ikData.target.parent.remove(ikData.target);
            }
        });

        if (this.uiContainer && this.uiContainer.parentNode) {
            this.uiContainer.parentNode.removeChild(this.uiContainer);
        }

        if (this.animationMixer) {
            this.animationMixer.stopAllAction();
            this.animationMixer.uncacheRoot(this.horse); // Clear mixer's cache
            this.animationMixer = null;
        }

        // Remove event listeners
        window.removeEventListener('keydown', this.setupInput.bind(this)); // Need to store bound function for removal
        window.removeEventListener('keyup', this.setupInput.bind(this));
    }
}
/*
// Integration function for your existing system
function initHorseSystem(scene, camera) {
    const horseController = new HorseController(scene, camera);

    try {
        // Try to load a horse model - replace with your actual horse model URL
        horseController.loadHorse('https://threejs.org/examples/models/gltf/Horse.glb', function (model) {
            // ✅ Ensure the horse is scaled appropriately for your scene
            model.scale.set(0.01, 0.01, 0.01);
            model.position.set(0, 0, 0);
            model.traverse(obj => {
                if (obj.isMesh) {
                    obj.castShadow = true;
                    obj.receiveShadow = true;
                }
            });
            console.log('✅ Horse model loaded and scaled:', model);
        });

    

        console.log('✅ Horse system initialized');
        window.horseController = horseController;
        return horseController;

    } catch (error) {
        console.error('Failed to load horse model:', error);
        console.log('Creating placeholder horse...');

        // === Simple placeholder horse ===
        const horseGroup = new THREE.Group();

        // Body
        const bodyGeom = new THREE.BoxGeometry(2, 1.2, 3);
        const bodyMat = new THREE.MeshStandardMaterial({ color: 0x8B4513 });
        const body = new THREE.Mesh(bodyGeom, bodyMat);
        body.position.y = 1.5;
        body.castShadow = true;
        horseGroup.add(body);

        // Neck
        const neckGeom = new THREE.CylinderGeometry(0.3, 0.4, 1.5);
        const neck = new THREE.Mesh(neckGeom, bodyMat);
        neck.position.set(0, 2.2, 1);
        neck.rotation.z = Math.PI / 6;
        neck.castShadow = true;
        horseGroup.add(neck);

        // Head
        const headGeom = new THREE.BoxGeometry(0.4, 0.6, 0.8);
        const head = new THREE.Mesh(headGeom, bodyMat);
        head.position.set(0, 2.8, 1.5);
        head.castShadow = true;
        horseGroup.add(head);

        // Legs
        const legGeom = new THREE.CylinderGeometry(0.15, 0.15, 1.5);
        const legPositions = [
            [0.6, 0.75, 1], [0.6, 0.75, -1],
            [-0.6, 0.75, 1], [-0.6, 0.75, -1]
        ];
        legPositions.forEach(pos => {
            const leg = new THREE.Mesh(legGeom, bodyMat);
            leg.position.set(...pos);
            leg.castShadow = true;
            horseGroup.add(leg);
        });

        // ✅ Adjust placeholder to same approximate scale as real model
        horseGroup.scale.set(0.01, 0.01, 0.01);

        scene.add(horseGroup);
        horseController.horse = horseGroup;
        horseController.saddlePosition = new THREE.Vector3(0, 2.2, 0);

        window.horseController = horseController;
        return horseController;
    }
}
    function initHorseSystem(scene, camera) {
    const horseController = new HorseController(scene, camera);
    horseController.loadHorse(); // scale is handled inside the class
    window.horseController = horseController;
    return horseController;
}


if (typeof module !== 'undefined' && module.exports) {
    module.exports = { HorseController, initHorseSystem };
}

if (window.horseController && window.horseController.mounted) {
        window.horseController.update(delta);
    }
*/
