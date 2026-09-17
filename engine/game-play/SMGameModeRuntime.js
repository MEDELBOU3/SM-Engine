// ============================================================================
// engine/game-play/SMGameModeRuntime.js
// Complete 2D, 2.5D & 3D Gameplay Controller & Camera Follow System
// ============================================================================
(function (root) {
    'use strict';

    class SMGameModeRuntimeController {
        constructor() {
            this.active = false;
            this.currentMode = '3D';
            this.player = null;
            this.playerModel = null;
            this.camera = null;

            // 2D / 2.5D Physics & Movement State
            this.keys = { left: false, right: false, up: false, down: false, jump: false, sprint: false };
            this.velocity = new THREE.Vector3(0, 0, 0);
            this.isGrounded = true;
            this.groundY = 0; // Baseline floor height
            
            this.speed = 8.0;
            this.sprintMultiplier = 1.5;
            this.jumpForce = 12.0;
            this.gravity = 28.0;

            this._raf = 0;
            this._lastTime = performance.now();

            this._onKeyDown = this._onKeyDown.bind(this);
            this._onKeyUp = this._onKeyUp.bind(this);
            this._loop = this._loop.bind(this);

            this._bindEvents();
        }

        _bindEvents() {
            window.addEventListener('keydown', this._onKeyDown);
            window.addEventListener('keyup', this._onKeyUp);

            window.addEventListener('sm:pie-start', (e) => {
                const subMode = String(
                    window.workspaceManager?.currentGameMode ||
                    localStorage.getItem('sm_game_dev_mode') ||
                    '3D'
                ).toUpperCase();

                // 2D uses the sprite-only runtime. This legacy controller is
                // intentionally reserved for 2.5D character side-scrollers.
                if (subMode === '2.5D') {
                    this.start(subMode);
                } else if (subMode === '2D') {
                    this.stop();
                }
            });

            window.addEventListener('sm:pie-stop', () => {
                this.stop();
            });
        }

        _onKeyDown(e) {
            if (!this.active) return;
            const code = e.code;
            if (code === 'KeyA' || code === 'ArrowLeft') this.keys.left = true;
            if (code === 'KeyD' || code === 'ArrowRight') this.keys.right = true;
            if (code === 'KeyW' || code === 'ArrowUp') this.keys.up = true;
            if (code === 'KeyS' || code === 'ArrowDown') this.keys.down = true;
            if (code === 'Space') {
                this.keys.jump = true;
                e.preventDefault();
            }
            if (code === 'ShiftLeft' || code === 'ShiftRight') this.keys.sprint = true;
        }

        _onKeyUp(e) {
            if (!this.active) return;
            const code = e.code;
            if (code === 'KeyA' || code === 'ArrowLeft') this.keys.left = false;
            if (code === 'KeyD' || code === 'ArrowRight') this.keys.right = false;
            if (code === 'KeyW' || code === 'ArrowUp') this.keys.up = false;
            if (code === 'KeyS' || code === 'ArrowDown') this.keys.down = false;
            if (code === 'Space') this.keys.jump = false;
            if (code === 'ShiftLeft' || code === 'ShiftRight') this.keys.sprint = false;
        }

        start(mode = '2.5D') {
            if (mode === '2D' && root.SM2DGameRuntime) {
                this.stop();
                return;
            }
            this.currentMode = mode;
            this.active = true;
            this.player = window.playerSystem || window.player;
            this.playerModel = this.player?.character?.model || this.player?.model;
            this.camera = window._gameRenderCamera || window.camera;

            if (!this.playerModel) {
                console.warn('[SMGameModeRuntime] Player model not found for 2D/2.5D runtime.');
                return;
            }

            // Lock Z position to 0
            this.playerModel.position.z = 0;
            this.velocity.set(0, 0, 0);
            this.isGrounded = true;

            // Set ground baseline to current player Y or 0
            this.groundY = Math.max(0, this.playerModel.position.y);

            // Disable 3D mouse look / rotation
            if (this.player?.cameraController) {
                this.player.cameraController.enabled = false;
            }

            // Setup camera initial framing
            if (this.camera) {
                if (mode === '2D') {
                    this.camera.position.set(this.playerModel.position.x, this.playerModel.position.y + 2, 40);
                    this.camera.lookAt(this.playerModel.position.x, this.playerModel.position.y + 2, 0);
                } else if (mode === '2.5D') {
                    this.camera.position.set(this.playerModel.position.x, this.playerModel.position.y + 3, 18);
                    this.camera.lookAt(this.playerModel.position.x, this.playerModel.position.y + 2, 0);
                }
                this.camera.updateProjectionMatrix?.();
            }

            this._lastTime = performance.now();
            cancelAnimationFrame(this._raf);
            this._raf = requestAnimationFrame(this._loop);

            console.log(`[SMGameModeRuntime] 2D/2.5D Active Mode: ${mode}`);
        }

        stop() {
            this.active = false;
            cancelAnimationFrame(this._raf);
            this._raf = 0;
            this.keys = { left: false, right: false, up: false, down: false, jump: false, sprint: false };

            if (this.player?.cameraController) {
                this.player.cameraController.enabled = true;
            }
        }

        _loop(now) {
            if (!this.active || window.__smGamePaused) {
                if (this.active) this._raf = requestAnimationFrame(this._loop);
                return;
            }

            const delta = Math.min(0.05, Math.max(0.001, (now - this._lastTime) / 1000));
            this._lastTime = now;

            if (this.playerModel) {
                this._updatePlayerPhysicsAndMovement(delta);
                this._updateCameraFollow(delta);
                this._updateAnimations();
            }

            this._raf = requestAnimationFrame(this._loop);
        }

        _updatePlayerPhysicsAndMovement(delta) {
            const currentSpeed = this.speed * (this.keys.sprint ? this.sprintMultiplier : 1.0);

            // 1. Horizontal Movement (X Axis)
            let moveX = 0;
            if (this.keys.left) moveX -= 1;
            if (this.keys.right) moveX += 1;

            this.velocity.x = moveX * currentSpeed;
            this.playerModel.position.x += this.velocity.x * delta;

            // Rotate character to face left (-90 deg) or right (+90 deg)
            if (moveX > 0) {
                this.playerModel.rotation.y = THREE.MathUtils.lerp(this.playerModel.rotation.y, Math.PI / 2, 0.25);
            } else if (moveX < 0) {
                this.playerModel.rotation.y = THREE.MathUtils.lerp(this.playerModel.rotation.y, -Math.PI / 2, 0.25);
            }

            // 2. Vertical Jump & Gravity (Y Axis)
            if (this.isGrounded) {
                if (this.keys.jump || (this.currentMode === '2D' && this.keys.up)) {
                    this.velocity.y = this.jumpForce;
                    this.isGrounded = false;
                } else {
                    this.velocity.y = 0;
                }
            } else {
                // Apply Gravity
                this.velocity.y -= this.gravity * delta;
            }

            this.playerModel.position.y += this.velocity.y * delta;

            // 3. Ground Collision Clamp (Baseline floor)
            if (this.playerModel.position.y <= this.groundY) {
                this.playerModel.position.y = this.groundY;
                this.velocity.y = 0;
                this.isGrounded = true;
            }

            // 4. Hard Lock Z Axis to 0
            this.playerModel.position.z = 0;
        }

        _updateCameraFollow(delta) {
            if (!this.camera || !this.playerModel) return;

            const targetX = this.playerModel.position.x;
            const targetY = this.playerModel.position.y + (this.currentMode === '2.5D' ? 3.0 : 2.0);

            // Smooth horizontal and vertical camera tracking
            this.camera.position.x = THREE.MathUtils.lerp(this.camera.position.x, targetX, 0.1);
            this.camera.position.y = THREE.MathUtils.lerp(this.camera.position.y, targetY, 0.1);

            if (this.currentMode === '2.5D') {
                this.camera.position.z = 18;
                this.camera.lookAt(this.camera.position.x, this.camera.position.y - 1.0, 0);
            } else {
                this.camera.position.z = 40;
                this.camera.lookAt(this.camera.position.x, this.camera.position.y, 0);
            }
        }

        _updateAnimations() {
            const anim = this.player?.animation;
            if (!anim) return;

            const isMoving = Math.abs(this.velocity.x) > 0.1;
            const isJumping = !this.isGrounded;

            if (isJumping) {
                if (typeof anim.playJump === 'function') anim.playJump();
            } else if (isMoving) {
                if (this.keys.sprint && typeof anim.playRun === 'function') {
                    anim.playRun();
                } else if (typeof anim.playWalk === 'function') {
                    anim.playWalk();
                }
            } else {
                if (typeof anim.playIdle === 'function') anim.playIdle();
            }
        }
    }

    // Auto-instantiate
    root.SMGameModeRuntime = new SMGameModeRuntimeController();

})(window);
