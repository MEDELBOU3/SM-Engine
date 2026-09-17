// ============================================================================
// engine/game-play/SMGameCameraManager.js
// SM Engine - Gameplay Camera Manager
// ============================================================================
(function () {
    'use strict';
    class SMGameCameraManager {
        constructor({
            scene = window.scene,
            playerSystem = window.playerSystem
        } = {}) {
            this.scene = scene;
            this.playerSystem = playerSystem;
            this.gameCamera = null;
            this.previousRenderCamera = null;
            this.active = false;
            this._previousControlsEnabled = true;
            this._onPIEStart = this._onPIEStart.bind(this);
            this._onPIEStop = this._onPIEStop.bind(this);
            this._onPIEPause = this._onPIEPause.bind(this);
            this._onPIEResume = this._onPIEResume.bind(this);
            window.addEventListener('sm:pie-start', this._onPIEStart);
            window.addEventListener('sm:pie-stop', this._onPIEStop);
            window.addEventListener('sm:pie-pause', this._onPIEPause);
            window.addEventListener('sm:pie-resume', this._onPIEResume);
            window.SMGameCameraManager = this;
            console.log('[GameCamera] Manager ready.');
        }
        _resolvePlayer() {
            this.playerSystem = window.playerSystem || this.playerSystem;
            return this.playerSystem?.model || this.playerSystem?.character?.model || null;
        }
        _getScene() {
            this.scene = window.scene || this.scene;
            return this.scene || null;
        }
        _getRuntimePlayerCamera() {
            this.playerSystem = window.playerSystem || this.playerSystem;
            return this.playerSystem?.playerCamera || window.playerSystem?.playerCamera || null;
        }
        _isEditorCamera(camera) {
            if (!camera?.isCamera) return false;
            return new Set([
                window.camera,
                window.cameraSystem?.camera,
                window.cameraSystem?.orthographicCamera,
                window.orthographicCamera
            ].filter(Boolean)).has(camera);
        }
        _cameraTargetsPlayer(camera) {
            if (!camera?.isCamera) return false;
            const player = this._resolvePlayer();
            if (!player) return false;
            const data = camera.userData || {};
            const targets = [
                camera.target,
                data.target,
                data.cameraTarget,
                data.followTarget,
                data.lookAtTarget,
                data.targetObject,
                data.targetObjectUuid,
                data.targetUuid,
                data.targetId,
                data.targetName
            ];
            const playerTokens = new Set([
                String(player.uuid || '').toLowerCase(),
                String(player.name || '').toLowerCase(),
                'player'
            ].filter(Boolean));
            return targets.some(target => {
                if (!target) return false;
                if (target === player) return true;
                if (target?.isObject3D) {
                    let current = target;
                    while (current) {
                        if (current === player) return true;
                        current = current.parent;
                    }
                    return false;
                }
                return playerTokens.has(String(target).trim().toLowerCase());
            });
        }
        _findAuthoredGameplayCamera() {
            const scene = this._getScene();
            if (!scene?.traverse) return null;
            const runtimeCamera = this._getRuntimePlayerCamera();
            const cameras = [];
            scene.traverse(object => {
                if (!object?.isCamera || object === runtimeCamera) return;
                if (object.userData?.isRuntimeCamera) return;
                if (this._isEditorCamera(object)) return;
                cameras.push(object);
            });
            if (!cameras.length) return null;

            const selected =
                window.selectedObject ||
                window.currentSelectedObject ||
                window.selectionManager?.selectedObject ||
                null;
            if (selected?.isCamera && cameras.includes(selected)) {
                return selected;
            }

            const targeted = cameras.find(camera =>
                this._cameraTargetsPlayer(camera)
            );
            if (targeted) return targeted;

            const marked = cameras.find(camera => {
                const data = camera.userData || {};
                return data.isGameplayCamera === true ||
                    data.cameraRole === 'gameplay' ||
                    data.cameraRole === 'player' ||
                    data.useForPlay === true;
            });
            if (marked) return marked;

            const named = cameras.find(camera =>
                /(^|[_\- ])(game|gameplay|player|main|play)([_\- ]|$)/i.test(
                    String(camera.name || '')
                )
            );
            return named || cameras[0];
        }
        _findGameplayCamera(preferredCamera = null) {
            this.playerSystem = window.playerSystem || this.playerSystem;

            // The PIE orchestrator already resolved the camera before firing
            // sm:pie-start. Never throw that decision away and switch back to
            // SMPlayerSystem.playerCamera.
            if (preferredCamera?.isCamera) {
                return preferredCamera;
            }
            if (window._smGameplayCamera?.isCamera) {
                return window._smGameplayCamera;
            }
            if (window._gameRenderCamera?.isCamera) {
                return window._gameRenderCamera;
            }

            const authored = this._findAuthoredGameplayCamera();
            if (authored?.isCamera) {
                return authored;
            }

            const runtimePlayerCamera = this._getRuntimePlayerCamera();
            if (runtimePlayerCamera?.isCamera) {
                return runtimePlayerCamera;
            }

            const player = this._resolvePlayer();
            if (!player) {
                console.warn('[GameCamera] Player root was not found.');
                return null;
            }
            let explicitCamera = null;
            let firstCamera = null;
            player.traverse(object => {
                if (!object?.isCamera) return;
                if (!firstCamera) firstCamera = object;
                if (
                    object.userData?.isGameplayCamera === true ||
                    object.userData?.cameraRole === 'gameplay' ||
                    object.userData?.cameraRole === 'player'
                ) {
                    explicitCamera = object;
                }
            });
            return explicitCamera || firstCamera;
        }
        _prepareGameCamera(camera) {
            if (!camera) return;
            const runtimePlayerCamera = this._getRuntimePlayerCamera();
            camera.userData = camera.userData || {};
            const isEditorFallback = this._isEditorCamera(camera);
            if (!isEditorFallback) {
                camera.userData.isGameplayCamera = true;
                camera.userData.cameraRole = 'gameplay';
                camera.userData.useForPlay = true;
                camera.userData.ignoreInTimeline = true;
            }
            camera.userData.isRuntimeGameCamera = camera === runtimePlayerCamera;
            if (camera.isPerspectiveCamera) {
                const renderer = window.renderer || window.SMEngineRenderer?.renderer || null;
                const container =
                    renderer?.domElement?.parentElement ||
                    document.getElementById('game-view') ||
                    document.getElementById('game-view-content') ||
                    document.getElementById('game-viewport') ||
                    document.getElementById('renderer-container') ||
                    document.getElementById('editor-scene');
                const width = Math.max(1, container?.clientWidth || window.innerWidth);
                const height = Math.max(1, container?.clientHeight || window.innerHeight);
                camera.aspect = width / height;
                camera.updateProjectionMatrix();
            }
            camera.updateMatrixWorld(true);
        }
        _hideCameraHelper(camera) {
            if (!camera) return;
            const helper = camera.userData?.helper;
            if (helper) {
                helper.userData = helper.userData || {};
                if (helper.userData.__smGamePreviousVisible === undefined) {
                    helper.userData.__smGamePreviousVisible = helper.visible;
                }
                helper.visible = false;
            }
            if (!this.scene) return;
            this.scene.traverse(object => {
                if (
                    object?.isCameraHelper ||
                    object?.type === 'CameraHelper' ||
                    object?.userData?.isCameraHelper
                ) {
                    const belongsToCamera =
                        object.camera === camera ||
                        object.userData?.primaryCamera === camera ||
                        object.userData?.cameraOwnerUuid === camera.uuid;
                    if (!belongsToCamera) return;
                    object.userData = object.userData || {};
                    if (object.userData.__smGamePreviousVisible === undefined) {
                        object.userData.__smGamePreviousVisible = object.visible;
                    }
                    object.visible = false;
                }
            });
        }
        _restoreCameraHelper(camera) {
            if (!camera || !this.scene) return;
            const restoreObject = object => {
                if (object?.userData?.__smGamePreviousVisible === undefined) return;
                object.visible = object.userData.__smGamePreviousVisible;
                delete object.userData.__smGamePreviousVisible;
            };
            restoreObject(camera.userData?.helper);
            this.scene.traverse(object => {
                const belongsToCamera =
                    object?.camera === camera ||
                    object?.userData?.primaryCamera === camera ||
                    object?.userData?.cameraOwnerUuid === camera.uuid;
                if (belongsToCamera) {
                    restoreObject(object);
                }
            });
        }
        _setRenderCamera(camera) {
            const next = camera || null;
            window._activeRenderCamera = next;
            window._gameRenderCamera = next;
            window.gameCamera = next;
            window._gameCameraActive = !!next;
            if (
                next &&
                next !== this._getRuntimePlayerCamera() &&
                !this._isEditorCamera(next)
            ) {
                window._smGameplayCamera = next;
            }
            if (window.SMEngineRenderer) {
                window.SMEngineRenderer.activeRenderCamera = next;
            }
        }
        activate(preferredCamera = null) {
            const camera = this._findGameplayCamera(preferredCamera);
            if (!camera) {
                console.error('[GameCamera] No gameplay camera could be resolved.');
                return false;
            }
            if (this.active && this.gameCamera === camera) {
                this._prepareGameCamera(camera);
                this._setRenderCamera(camera);
                return true;
            }
            if (this.active && this.gameCamera !== camera) {
                this.deactivate();
            }

            this.gameCamera = camera;
            const runtimePlayerCamera = this._getRuntimePlayerCamera();
            if (camera === runtimePlayerCamera) {
                const possessed = this.playerSystem?.possessCamera?.() === true;
                if (!possessed) {
                    console.warn('[GameCamera] Runtime player camera is not ready; keeping the PIE-selected camera unchanged.');
                    this.gameCamera = null;
                    return false;
                }
            } else if (this.playerSystem?.movement) {
                // Camera-relative player movement must use the same authored
                // camera that the renderer uses.
                this.playerSystem.movement.camera = camera;
            }

            const editorSnapshot =
                window.PlayOrchestrator?.editorState ||
                window.gamePlayOrchestrator?.editorState ||
                null;
            this.previousRenderCamera =
                editorSnapshot?.activeRenderCamera ||
                window._viewedCamera ||
                window.cameraSystem?.activeCamera ||
                window.cameraSystem?.camera ||
                window.camera ||
                null;
            this._previousControlsEnabled =
                typeof editorSnapshot?.controlsEnabled === 'boolean'
                    ? editorSnapshot.controlsEnabled
                    : (window.controls?.enabled ?? true);

            this._prepareGameCamera(camera);
            if (window.controls) {
                window.controls.enabled = false;
            }
            const transformControls =
                window.transformControls ||
                window.transformControl ||
                window.gizmoManager?.transformControls ||
                null;
            if (transformControls) {
                transformControls.detach?.();
                transformControls.enabled = false;
                transformControls.visible = false;
            }
            this._hideCameraHelper(camera);
            this._setRenderCamera(camera);
            this.active = true;
            window.dispatchEvent(
                new CustomEvent('sm:game-camera-activated', {
                    detail: {
                        camera,
                        player: this._resolvePlayer()
                    }
                })
            );
            console.log('[GameCamera] Activated:', camera.name, {
                uuid: camera.uuid,
                source: camera === runtimePlayerCamera ? 'runtime-player' : 'authored-scene',
                parent: camera.parent?.name,
                position: camera.position.toArray(),
                worldPosition: camera.getWorldPosition(new THREE.Vector3()).toArray()
            });
            return true;
        }
        deactivate() {
            if (!this.active) {
                // Do not publish null as the editor render camera on PIE stop.
                // The orchestrator owns the final editor-camera restoration.
                window._gameRenderCamera = null;
                window.gameCamera = null;
                window._gameCameraActive = false;
                return true;
            }

            const previousCamera = this.gameCamera;
            const runtimePlayerCamera =
                this.playerSystem?.playerCamera ||
                window.playerSystem?.playerCamera ||
                null;

            if (previousCamera === runtimePlayerCamera) {
                this.playerSystem?.releaseCamera?.();
            } else if (this.playerSystem?.movement?.camera === previousCamera) {
                this.playerSystem.movement.camera =
                    this.playerSystem?.cameraController?.camera ||
                    runtimePlayerCamera ||
                    null;
            }

            if (window._smGameplayCamera === previousCamera) {
                window._smGameplayCamera = null;
            }

            this._restoreCameraHelper(previousCamera);
            this.active = false;
            this.gameCamera = null;

            const editorSnapshot =
                window.PlayOrchestrator?.editorState ||
                window.gamePlayOrchestrator?.editorState ||
                null;

            // IMPORTANT:
            // previousRenderCamera / editor snapshot must win over
            // cameraSystem.activeCamera. During PIE that property can still
            // point at the gameplay camera, which was the reason Edit Mode
            // sometimes kept the Play camera after Stop.
            const editorCamera =
                this.previousRenderCamera ||
                editorSnapshot?.activeRenderCamera ||
                editorSnapshot?.viewedCamera ||
                editorSnapshot?.controlsObject ||
                editorSnapshot?.cameraSystemActiveCamera ||
                editorSnapshot?.cameraSystemCamera ||
                editorSnapshot?.windowCamera ||
                window.cameraSystem?.camera ||
                window.camera ||
                null;

            window._gameRenderCamera = null;
            window.gameCamera = null;
            window._gameCameraActive = false;
            window._activeRenderCamera = editorCamera || null;
            window._viewedCamera =
                editorSnapshot?.viewedCamera ||
                editorCamera ||
                null;

            if (window.SMEngineRenderer) {
                window.SMEngineRenderer.activeRenderCamera =
                    editorCamera || null;
            }

            if (window.controls) {
                if (editorCamera && window.controls.object !== editorCamera) {
                    window.controls.object = editorCamera;
                }
                if (
                    editorSnapshot?.controlsTarget &&
                    window.controls.target
                ) {
                    window.controls.target.copy(
                        editorSnapshot.controlsTarget
                    );
                }
                window.controls.enabled =
                    typeof editorSnapshot?.controlsEnabled === 'boolean'
                        ? editorSnapshot.controlsEnabled
                        : this._previousControlsEnabled;
                window.controls.update?.();
            }

            const transformControls =
                window.transformControls ||
                window.transformControl ||
                window.gizmoManager?.transformControls ||
                null;
            if (transformControls) {
                transformControls.enabled = true;
            }

            this.previousRenderCamera = null;

            window.dispatchEvent(
                new CustomEvent('sm:game-camera-deactivated', {
                    detail: {
                        camera: previousCamera,
                        editorCamera
                    }
                })
            );

            console.log('[GameCamera] Returned to Editor Camera:', {
                name: editorCamera?.name || null,
                uuid: editorCamera?.uuid || null
            });
            return true;
        }
        _onPIEStart(event) {
            const preferredCamera =
                event?.detail?.camera ||
                window._gameRenderCamera ||
                window.gameCamera ||
                null;
            this.activate(preferredCamera);
        }
        _onPIEStop() {
            this.deactivate();
        }
        _onPIEPause() {
        }
        _onPIEResume() {
        }
        getActiveCamera() {
            return this.active ? this.gameCamera : null;
        }
        getDebugState() {
            return {
                active: this.active,
                camera: this.gameCamera?.name || null,
                cameraParent: this.gameCamera?.parent?.name || null,
                renderCamera: window._activeRenderCamera?.name || null,
                player: this._resolvePlayer()?.name || null
            };
        }
        dispose() {
            this.deactivate();
            window.removeEventListener('sm:pie-start', this._onPIEStart);
            window.removeEventListener('sm:pie-stop', this._onPIEStop);
            window.removeEventListener('sm:pie-pause', this._onPIEPause);
            window.removeEventListener('sm:pie-resume', this._onPIEResume);
            if (window.SMGameCameraManager === this) {
                window.SMGameCameraManager = null;
            }
        }
    }
    function bootstrapSMGameCameraManager() {
        if (window.SMGameCameraManager instanceof SMGameCameraManager) {
            return window.SMGameCameraManager;
        }
        return new SMGameCameraManager({
            scene: window.scene,
            playerSystem: window.playerSystem
        });
    }
    window.SMGameCameraManagerClass = SMGameCameraManager;
    window.bootstrapSMGameCameraManager = bootstrapSMGameCameraManager;
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            bootstrapSMGameCameraManager();
        }, { once: true });
    } else {
        bootstrapSMGameCameraManager();
    }
})();