// ============================================================================
// 2D-editor/runtime/SM2DGameRuntime.js
// SM Engine - isolated 2D play runtime (sprites, orthographic camera, input)
// ============================================================================
(function (root) {
    'use strict';

    class SM2DGameRuntime {
        constructor() {
            this.active = false;
            this.paused = false;
            this.scene = null;
            this.camera = null;
            this.player = null;
            this.keys = { left: false, right: false, up: false, down: false, jump: false };
            this.settings = { moveSpeed: 6, followLerp: 0.16, cameraDistance: 50 };
            this._raf = 0;
            this._lastTime = 0;
            this._onKeyDown = this._onKeyDown.bind(this);
            this._onKeyUp = this._onKeyUp.bind(this);
            this._loop = this._loop.bind(this);
            window.addEventListener('keydown', this._onKeyDown);
            window.addEventListener('keyup', this._onKeyUp);
        }

        enter({ scene = root.scene, camera = null } = {}) {
            if (!root.THREE || !scene) return false;
            this.exit({ preserveCamera: true });
            this.active = true;
            this.paused = false;
            this.scene = scene;
            this.camera = camera || root.cameraSystem?.orthographicCamera || root.cameraSystem?.activeCamera || root.camera;
            this.player = this._findPlayerActor();
            this._prepareActors();
            this._configureCamera();
            this._lastTime = performance.now();
            this._raf = requestAnimationFrame(this._loop);
            window.dispatchEvent(new CustomEvent('sm:2d-runtime-start', {
                detail: { runtime: this, player: this.player, camera: this.camera }
            }));
            return true;
        }

        exit({ preserveCamera = false } = {}) {
            const wasActive = this.active;
            this.active = false;
            this.paused = false;
            cancelAnimationFrame(this._raf);
            this._raf = 0;
            this.keys = { left: false, right: false, up: false, down: false, jump: false };
            if (wasActive) window.dispatchEvent(new CustomEvent('sm:2d-runtime-stop', { detail: { runtime: this } }));
            if (!preserveCamera) this.camera = null;
            this.player = null;
        }

        setPaused(value) {
            this.paused = !!value;
        }

        step(delta = 1 / 60) {
            if (!this.active || this.paused) return;
            const safeDelta = Math.min(0.05, Math.max(0.001, Number(delta) || 1 / 60));
            this._updatePlayer(safeDelta);
            this._updateSpriteAnimations(safeDelta);
            if (root.SM2DCollisionSystem) {
                root.SM2DCollisionSystem.update(this.scene);
            }
            this._updateCamera();
        }

        _loop(now) {
            if (!this.active) return;
            const delta = Math.min(0.05, Math.max(0.001, (now - this._lastTime) / 1000));
            this._lastTime = now;
            this.step(delta);
            this._raf = requestAnimationFrame(this._loop);
        }

        _onKeyDown(event) {
            if (!this.active || this._isTextInput(event.target)) return;
            const code = event.code;
            if (code === 'KeyA' || code === 'ArrowLeft') this.keys.left = true;
            if (code === 'KeyD' || code === 'ArrowRight') this.keys.right = true;
            if (code === 'KeyW' || code === 'ArrowUp') this.keys.up = true;
            if (code === 'KeyS' || code === 'ArrowDown') this.keys.down = true;
            if (code === 'Space') {
                this.keys.jump = true;
                event.preventDefault();
            }
        }

        _onKeyUp(event) {
            if (!this.active) return;
            const code = event.code;
            if (code === 'KeyA' || code === 'ArrowLeft') this.keys.left = false;
            if (code === 'KeyD' || code === 'ArrowRight') this.keys.right = false;
            if (code === 'KeyW' || code === 'ArrowUp') this.keys.up = false;
            if (code === 'KeyS' || code === 'ArrowDown') this.keys.down = false;
            if (code === 'Space') this.keys.jump = false;
        }

        _isTextInput(target) {
            return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target?.isContentEditable;
        }

        _actors() {
            if (!this.scene?.traverse) return [];
            const actors = [];
            this.scene.traverse((object) => {
                if (object?.userData?.is2DSprite || object?.userData?.is2DActor) actors.push(object);
            });
            return actors;
        }

        _findPlayerActor() {
            const actors = this._actors();
            return actors.find((actor) => actor.userData?.sprite2D?.isPlayer || actor.userData?.is2DPlayer) || actors[0] || null;
        }

        _prepareActors() {
            this._actors().forEach((actor) => {
                actor.userData.sprite2D =
                    actor.userData.sprite2D || {};

                const state = actor.userData.sprite2D;

                const clips = Array.isArray(actor.userData.clips)
                    ? actor.userData.clips
                    : [];

                // Clip actif par défaut
                if (!state.activeClipId && clips.length > 0) {
                    state.activeClipId = clips[0].id;
                }

                state.frameIndex =
                    Math.max(0, Number(state.frameIndex) || 0);

                state.frameElapsed = 0;

                state.pixelsPerUnit =
                    Math.max(1, Number(state.pixelsPerUnit) || 64);

                state.playing =
                    state.playing !== false;

                actor.position.z =
                    Number(state.depth) || 0;

                if (actor === this.player) {
                    state.isPlayer = true;
                }

                // Appliquer immédiatement le premier frame
                if (clips.length > 0) {
                    const clip =
                        clips.find(c => c.id === state.activeClipId)
                        || clips[0];

                    const frameIds =
                        Array.isArray(clip.frameSliceIds)
                            ? clip.frameSliceIds
                            : [];

                    if (frameIds.length > 0) {
                        const frame =
                            (actor.userData.slices || [])
                                .find(slice => slice.id === frameIds[0]);

                        if (frame) {
                            this._applyFrameUV(
                                actor,
                                frame,
                                actor.userData.spriteSheetSize
                            );
                        }
                    }
                }
            });
        }

        _configureCamera() {
            const camera = this.camera;
            if (!camera) return;
            const playerPosition = this.player?.position || new root.THREE.Vector3();
            camera.position.set(playerPosition.x, playerPosition.y, this.settings.cameraDistance);
            camera.up.set(0, 1, 0);
            camera.lookAt(playerPosition.x, playerPosition.y, 0);
            camera.updateProjectionMatrix?.();
            camera.updateMatrixWorld?.(true);
        }

        _updatePlayer(delta) {
            const actor = this.player;
            if (!actor) return;
            const state = actor.userData.sprite2D || (actor.userData.sprite2D = {});
            const speed = Math.max(0.01, Number(state.moveSpeed) || this.settings.moveSpeed);
            const platformer = state.movementMode === 'platformer';
            const directionX = (this.keys.right ? 1 : 0) - (this.keys.left ? 1 : 0);
            const directionY = (this.keys.up ? 1 : 0) - (this.keys.down ? 1 : 0);
            actor.position.x += directionX * speed * delta;
            if (platformer) {
                const physics = state.physics || (state.physics = { velocityY: 0, grounded: true, groundY: actor.position.y, gravity: 28, jumpForce: 11 });
                if (this.keys.jump && physics.grounded) {
                    physics.velocityY = Number(physics.jumpForce) || 11;
                    physics.grounded = false;
                }
                physics.velocityY -= (Number(physics.gravity) || 28) * delta;
                actor.position.y += physics.velocityY * delta;
                if (actor.position.y <= physics.groundY) {
                    actor.position.y = physics.groundY;
                    physics.velocityY = 0;
                    physics.grounded = true;
                }
            } else {
                actor.position.y += directionY * speed * delta;
            }

            if (root.SM2DCollisionSystem && this.scene) {
                const overlaps = root.SM2DCollisionSystem.queryOverlaps(actor, this.scene);
                for (const col of overlaps) {
                    if (col.otherBox.type === 'solid' || col.otherBox.type === 'platform') {
                        if (col.separation.y > 0) {
                            actor.position.y += col.separation.y;
                            if (platformer && state.physics) {
                                state.physics.velocityY = 0;
                                state.physics.grounded = true;
                            }
                        } else if (col.separation.y < 0) {
                            actor.position.y += col.separation.y;
                            if (platformer && state.physics) {
                                state.physics.velocityY = 0;
                            }
                        } else if (col.separation.x !== 0) {
                            actor.position.x += col.separation.x;
                        }
                    }
                }
            }

            actor.position.z = Number(state.depth) || 0;
            if (directionX !== 0) actor.scale.x = Math.abs(actor.scale.x || 1) * Math.sign(directionX);
        }

        _updateCamera() {
            if (!this.camera || !this.player) return;
            const blend = this.settings.followLerp;
            this.camera.position.x = root.THREE.MathUtils.lerp(this.camera.position.x, this.player.position.x, blend);
            this.camera.position.y = root.THREE.MathUtils.lerp(this.camera.position.y, this.player.position.y, blend);
            this.camera.position.z = this.settings.cameraDistance;
            this.camera.lookAt(this.camera.position.x, this.camera.position.y, 0);
            this.camera.updateMatrixWorld?.(true);
        }

        _updateSpriteAnimations(delta) {
            this._actors().forEach((actor) => {
                const data = actor.userData || {};
                const state = data.sprite2D;
                const clips = Array.isArray(data.clips) ? data.clips : [];
                if (!state || !state.playing || clips.length === 0) return;
                const clip = clips.find((item) => item.id === state.activeClipId) || clips[0];
                const frameIds = Array.isArray(clip.frameSliceIds) ? clip.frameSliceIds : [];
                if (frameIds.length === 0) return;
                state.frameElapsed += delta;
                const frameDuration = 1 / Math.max(1, Number(clip.fps) || 12);
                if (state.frameElapsed < frameDuration) return;
                state.frameElapsed %= frameDuration;
                state.frameIndex = (state.frameIndex + 1) % frameIds.length;
                if (clip.loop === false && state.frameIndex === 0) state.frameIndex = frameIds.length - 1;
                const frame = (data.slices || []).find((slice) => slice.id === frameIds[state.frameIndex]);
                if (frame) this._applyFrameUV(actor, frame, data.spriteSheetSize);
            });
        }

        _applyFrameUV(actor, frame, sheetSize) {
            const uv = actor.geometry?.attributes?.uv;
            const size = sheetSize || actor.userData?.spriteSheetSize;
            if (!uv || !size?.width || !size?.height) return;
            const u0 = frame.x / size.width;
            const v0 = 1 - (frame.y + frame.height) / size.height;
            const u1 = (frame.x + frame.width) / size.width;
            const v1 = 1 - frame.y / size.height;
            uv.setXY(0, u0, v1);
            uv.setXY(1, u1, v1);
            uv.setXY(2, u0, v0);
            uv.setXY(3, u1, v0);
            uv.needsUpdate = true;
        }
    }

    root.SM2DGameRuntime = root.SM2DGameRuntime || new SM2DGameRuntime();
}(window));
