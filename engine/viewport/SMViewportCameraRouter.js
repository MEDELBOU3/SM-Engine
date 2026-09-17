// ============================================================================
// engine/viewport/SMViewportCameraRouter.js
// SM Engine — One authoritative route from editor/game/preview to render camera.
// ============================================================================
(function (root) {
    'use strict';

    if (root.SMViewportCameraRouterClass) return;

    class SMViewportCameraRouter {
        constructor(options = {}) {
            this.viewport = options.viewport || null;
            this.cameras = new Map();
            this.activeRole = 'editor';
            this.previousRole = null;
            this.lastReason = 'bootstrap';
        }

        _isCamera(camera) {
            return Boolean(camera?.isCamera);
        }

        resolveEditorCamera() {
            const viewportPanelCamera =
                root.SMViewportSystem?.getActivePanel?.()?.camera ||
                null;

            return (
                viewportPanelCamera ||
                root.cameraSystem?.activeCamera ||
                root.cameraSystem?.camera ||
                root._viewedCamera ||
                root.camera ||
                root.perspectiveCamera ||
                null
            );
        }

        refreshEditorCamera(options = {}) {
            const camera = this.resolveEditorCamera();
            if (!this._isCamera(camera)) return null;

            // Registering the editor camera must not activate the editor role
            // again. setActiveRole('editor') refreshes the camera first, so
            // using activate:true here creates an infinite recursion during
            // bootstrap and aborts init before Player/Assets/Transform setup.
            this.registerCamera('editor', camera, {
                activate: false,
                reason: options.reason || 'editor-refresh',
                syncLegacy: options.syncLegacy !== false
            });
            return camera;
        }

        registerCamera(role, camera, options = {}) {
            const key = String(role || '').trim().toLowerCase();
            if (!key || !this._isCamera(camera)) return false;

            this.cameras.set(key, camera);

            if (options.activate === true) {
                this.setActiveRole(key, {
                    reason: options.reason || 'register-camera',
                    syncLegacy: options.syncLegacy !== false
                });
            } else if (options.syncLegacy === true && key === this.activeRole) {
                this._syncLegacyBindings(camera, key);
            }

            return camera;
        }

        unregisterCamera(role, camera = null) {
            const key = String(role || '').trim().toLowerCase();
            if (!key || !this.cameras.has(key)) return false;

            if (camera && this.cameras.get(key) !== camera) return false;
            this.cameras.delete(key);

            if (this.activeRole === key) {
                this.setActiveRole('editor', {
                    reason: `unregister-${key}`
                });
            }

            return true;
        }

        setEditorCamera(camera, options = {}) {
            return this.registerCamera('editor', camera, {
                activate: options.activate ?? (this.activeRole === 'editor'),
                reason: options.reason || 'set-editor-camera',
                syncLegacy: options.syncLegacy !== false
            });
        }

        setGameplayCamera(camera, options = {}) {
            if (!this._isCamera(camera)) return false;

            this.registerCamera('gameplay', camera);
            root._gameRenderCamera = camera;
            root.gameCamera = camera;
            root._gameCameraActive = true;

            if (options.activate !== false) {
                this.setActiveRole('gameplay', {
                    reason: options.reason || 'set-gameplay-camera'
                });
            }

            return camera;
        }

        clearGameplayCamera(options = {}) {
            const previous = this.cameras.get('gameplay') || null;
            this.cameras.delete('gameplay');

            if (root._gameRenderCamera === previous || options.force === true) {
                root._gameRenderCamera = null;
            }
            if (root.gameCamera === previous || options.force === true) {
                root.gameCamera = null;
            }
            root._gameCameraActive = false;

            if (this.activeRole === 'gameplay' && options.keepRole !== true) {
                this.setActiveRole('editor', {
                    reason: options.reason || 'clear-gameplay-camera'
                });
            }

            return previous;
        }

        setPreviewCamera(camera, options = {}) {
            if (!this._isCamera(camera)) return false;
            this.registerCamera('preview', camera);
            if (options.activate !== false) {
                this.setActiveRole('preview', {
                    reason: options.reason || 'set-preview-camera'
                });
            }
            return camera;
        }

        clearPreviewCamera(options = {}) {
            const previous = this.cameras.get('preview') || null;
            this.cameras.delete('preview');
            if (this.activeRole === 'preview' && options.keepRole !== true) {
                this.setActiveRole('editor', {
                    reason: options.reason || 'clear-preview-camera'
                });
            }
            return previous;
        }

        getCamera(role) {
            const key = String(role || '').trim().toLowerCase();
            if (!key) return null;

            if (key === 'editor') {
                const stored = this.cameras.get('editor');
                if (this._isCamera(stored)) return stored;
                return this.refreshEditorCamera({ syncLegacy: false });
            }

            return this.cameras.get(key) || null;
        }

        getActiveCamera() {
            let camera = this.getCamera(this.activeRole);

            if (!this._isCamera(camera) && this.activeRole !== 'editor') {
                camera = this.getCamera('editor');
            }

            if (!this._isCamera(camera)) {
                camera = this.resolveEditorCamera();
            }

            return this._isCamera(camera) ? camera : null;
        }

        setActiveRole(role, options = {}) {
            let key = String(role || 'editor').trim().toLowerCase();
            if (!['editor', 'gameplay', 'preview'].includes(key)) {
                key = 'editor';
            }

            if (key === 'editor') {
                this.refreshEditorCamera({ syncLegacy: false });
            }

            const requestedCamera = options.camera;
            if (this._isCamera(requestedCamera)) {
                this.cameras.set(key, requestedCamera);
            }

            const camera = this.getCamera(key);
            if (!this._isCamera(camera) && key !== 'editor') {
                key = 'editor';
            }

            const previousRole = this.activeRole;
            const previousCamera = this.getActiveCamera();

            this.previousRole = previousRole;
            this.activeRole = key;
            this.lastReason = options.reason || 'set-active-role';

            const activeCamera = this.getActiveCamera();
            if (options.syncLegacy !== false) {
                this._syncLegacyBindings(activeCamera, this.activeRole);
            }

            this.viewport?.layout?.syncCamera?.(activeCamera);

            root.dispatchEvent?.(new CustomEvent('sm:viewport-camera-changed', {
                detail: {
                    role: this.activeRole,
                    previousRole,
                    camera: activeCamera,
                    previousCamera,
                    reason: this.lastReason
                }
            }));

            return activeCamera;
        }

        _syncLegacyBindings(camera, role) {
            if (!this._isCamera(camera)) return;

            // Compatibility globals remain mirrors of the router. They are no
            // longer allowed to be independent authorities.
            root._activeRenderCamera = camera;

            if (role === 'editor') {
                root._viewedCamera = camera;
            }

            if (role === 'gameplay') {
                root._gameRenderCamera = camera;
                root.gameCamera = camera;
                root._gameCameraActive = true;
            }

            if (root.SMEngineRenderer) {
                root.SMEngineRenderer.activeRenderCamera = camera;
            }
        }

        syncEditorControls() {
            if (this.activeRole !== 'editor') return false;
            const camera = this.getActiveCamera();
            if (!camera) return false;

            if (root.controls && root.controls.object !== camera) {
                root.controls.object = camera;
                root.controls.update?.();
            }

            if (root.transformControls && root.transformControls.camera !== camera) {
                root.transformControls.camera = camera;
                root.transformControls.update?.();
            }

            return true;
        }

        getDebugState() {
            const result = {};
            for (const [role, camera] of this.cameras) {
                result[role] = {
                    name: camera?.name || null,
                    uuid: camera?.uuid || null,
                    type: camera?.type || null
                };
            }

            return {
                activeRole: this.activeRole,
                previousRole: this.previousRole,
                lastReason: this.lastReason,
                activeCamera: this.getActiveCamera()?.name || null,
                cameras: result
            };
        }
    }

    root.SMViewportCameraRouterClass = SMViewportCameraRouter;
})(window);
