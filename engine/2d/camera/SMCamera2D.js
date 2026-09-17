// ============================================================================
// engine/2d/camera/SMCamera2D.js
// SM Engine - Professional 2D Orthographic Game Camera with Bounds & Deadzone
// ============================================================================
(function (root) {
    'use strict';

    class SMCamera2D {
        constructor(camera = root.camera) {
            this.camera = camera || root.camera;
            this.target = null;

            // Smooth Follow Settings
            this.smoothSpeed = 8.0;
            this.offset = new THREE.Vector2(0, 1.5);
            this.currentPosition = new THREE.Vector2(0, 0);
            this.targetPosition = new THREE.Vector2(0, 0);

            // Lookahead (Camera shifts ahead in facing direction)
            this.lookaheadDistance = 2.5;
            this.lookaheadSpeed = 3.0;
            this.currentLookaheadX = 0;

            // Deadzone (Box where target can move without camera moving)
            this.useDeadzone = true;
            this.deadzone = new THREE.Vector2(1.2, 0.8);

            // Map Bounds Clamping (Limits camera from seeing outside the level)
            this.useBounds = false;
            this.bounds = {
                minX: -50,
                maxX: 50,
                minY: 0,
                maxY: 30
            };

            // Screen Shake System
            this.shake = root.SMCamera2DShake ? new root.SMCamera2DShake() : null;
        }

        setCamera(camera) {
            this.camera = camera;
        }

        setTarget(targetObject) {
            this.target = targetObject;
            if (this.target) {
                const pos = this.target.position;
                this.currentPosition.set(pos.x + this.offset.x, pos.y + this.offset.y);
            }
        }

        setBounds(minX, maxX, minY, maxY) {
            this.useBounds = true;
            this.bounds = { minX, maxX, minY, maxY };
        }

        clearBounds() {
            this.useBounds = false;
        }

        snapToCenter(x = 0, y = 0) {
            this.currentPosition.set(x, y);
            this.targetPosition.set(x, y);
            if (this.camera) {
                this.camera.position.set(x, y, 50);
                this.camera.lookAt(x, y, 0);
            }
        }

        triggerShake(intensity = 0.5, duration = 0.3) {
            this.shake?.addTrauma?.(intensity, duration);
        }

        update(delta = 1 / 60) {
            if (!this.camera) return;

            // 1. Calculate Target Position
            if (this.target) {
                const tx = this.target.position.x + this.offset.x;
                const ty = this.target.position.y + this.offset.y;

                // Deadzone logic
                if (this.useDeadzone) {
                    const dx = tx - this.targetPosition.x;
                    const dy = ty - this.targetPosition.y;

                    if (Math.abs(dx) > this.deadzone.x) {
                        this.targetPosition.x = tx - Math.sign(dx) * this.deadzone.x;
                    }
                    if (Math.abs(dy) > this.deadzone.y) {
                        this.targetPosition.y = ty - Math.sign(dy) * this.deadzone.y;
                    }
                } else {
                    this.targetPosition.set(tx, ty);
                }

                // Lookahead based on character rotation
                let facingDir = 0;
                if (this.target.rotation) {
                    facingDir = Math.sin(this.target.rotation.y) > 0 ? 1 : -1;
                }
                const targetLookahead = facingDir * this.lookaheadDistance;
                this.currentLookaheadX = THREE.MathUtils.lerp(
                    this.currentLookaheadX,
                    targetLookahead,
                    this.lookaheadSpeed * delta
                );

                this.targetPosition.x += this.currentLookaheadX;
            }

            // 2. Smooth Lerp Follow
            const t = 1.0 - Math.exp(-this.smoothSpeed * delta);
            this.currentPosition.lerp(this.targetPosition, t);

            // 3. Apply Map Bounds Clamping
            let finalX = this.currentPosition.x;
            let finalY = this.currentPosition.y;

            if (this.useBounds) {
                finalX = THREE.MathUtils.clamp(finalX, this.bounds.minX, this.bounds.maxX);
                finalY = THREE.MathUtils.clamp(finalY, this.bounds.minY, this.bounds.maxY);
            }

            // 4. Apply Procedural Screen Shake
            let shakeOffset = { x: 0, y: 0 };
            if (this.shake) {
                shakeOffset = this.shake.update(delta);
            }

            // 5. Update Camera Transform
            this.camera.position.x = finalX + shakeOffset.x;
            this.camera.position.y = finalY + shakeOffset.y;
            this.camera.position.z = 50; // Orthographic depth distance
            this.camera.lookAt(finalX, finalY, 0);
        }
    }

    root.SMCamera2D = SMCamera2D;

})(window);