// ============================================================================
// engine/viewport/SMViewportModeBridge.js
// SM Engine — Converts workspace/PIE/layout events into viewport state changes.
// ============================================================================
(function (root) {
    'use strict';

    if (root.SMViewportModeBridgeClass) return;

    class SMViewportModeBridge {
        constructor(options = {}) {
            this.viewport = options.viewport || null;
            this.started = false;
            this.listeners = [];
            this.workspaceMode = this.getWorkspaceMode();
            this.pieMode = 'edit';
        }

        getWorkspaceMode() {
            return String(
                root.workspaceManager?.currentMode ||
                root.currentWorkspaceMode ||
                localStorage.getItem('sm_workspace_mode') ||
                'FILM'
            ).toUpperCase();
        }

        _on(target, type, handler, options) {
            if (!target?.addEventListener) return;
            target.addEventListener(type, handler, options);
            this.listeners.push(() => target.removeEventListener(type, handler, options));
        }

        start() {
            if (this.started) return true;
            this.started = true;

            this._on(root, 'sm:pie-start', event => this._onPIEStart(event));
            this._on(root, 'sm:pie-stop', event => this._onPIEStop(event));
            this._on(root, 'sm:pie-pause', () => { this.pieMode = 'pause'; });
            this._on(root, 'sm:pie-resume', () => { this.pieMode = 'play'; });

            this._on(root, 'sm:game-camera-activated', event => {
                const camera = event?.detail?.camera;
                if (camera?.isCamera) {
                    this.viewport?.cameraRouter?.setGameplayCamera?.(camera, {
                        reason: 'game-camera-activated'
                    });
                }
            });

            this._on(root, 'sm:game-camera-deactivated', () => {
                if (this.pieMode !== 'play' && this.pieMode !== 'pause') {
                    this.viewport?.cameraRouter?.clearGameplayCamera?.({
                        reason: 'game-camera-deactivated'
                    });
                }
            });

            this._on(root, 'sm:camera-view-changed', () => {
                this.viewport?.cameraRouter?.refreshEditorCamera?.({
                    reason: 'camera-view-changed'
                });
                this.viewport?.cameraRouter?.syncEditorControls?.();
                this.viewport?.layout?.invalidate?.('camera-view-changed');
            });

            for (const eventName of [
                'sm:layout-resized',
                'sm:sync-layout',
                'sm:scripting-mode-changed',
                'fullscreenchange'
            ]) {
                this._on(root, eventName, () => {
                    this.viewport?.layout?.invalidate?.(eventName);
                });
            }

            for (const eventName of [
                'sm:workspace-changed',
                'sm:workspace-mode-changed',
                'workspaceChanged'
            ]) {
                this._on(root, eventName, event => this._onWorkspaceChange(event));
            }

            return true;
        }

        _onPIEStart(event) {
            this.pieMode = 'play';

            const camera =
                event?.detail?.camera ||
                root._gameRenderCamera ||
                root.gameCamera ||
                root.playerSystem?.playerCamera ||
                null;

            if (camera?.isCamera) {
                this.viewport?.cameraRouter?.setGameplayCamera?.(camera, {
                    reason: 'pie-start'
                });
            } else {
                // Keep editor camera until gameplay publishes a real camera.
                this.viewport?.cameraRouter?.setActiveRole?.('editor', {
                    reason: 'pie-start-no-camera'
                });
            }

            this.viewport?.layout?.invalidate?.('pie-start');
        }

        _onPIEStop() {
            this.pieMode = 'edit';
            this.viewport?.cameraRouter?.clearGameplayCamera?.({
                force: true,
                reason: 'pie-stop'
            });
            this.viewport?.cameraRouter?.refreshEditorCamera?.({
                reason: 'pie-stop'
            });
            this.viewport?.cameraRouter?.setActiveRole?.('editor', {
                reason: 'pie-stop'
            });
            this.viewport?.cameraRouter?.syncEditorControls?.();
            this.viewport?.layout?.invalidate?.('pie-stop');
        }

        _onWorkspaceChange(event) {
            this.workspaceMode = String(
                event?.detail?.mode ||
                event?.detail?.workspaceMode ||
                this.getWorkspaceMode()
            ).toUpperCase();

            if (this.pieMode === 'edit') {
                this.viewport?.cameraRouter?.refreshEditorCamera?.({
                    reason: `workspace-${this.workspaceMode}`
                });
                this.viewport?.cameraRouter?.setActiveRole?.('editor', {
                    reason: `workspace-${this.workspaceMode}`
                });
                this.viewport?.cameraRouter?.syncEditorControls?.();
            }

            this.viewport?.layout?.invalidate?.(`workspace-${this.workspaceMode}`);
        }

        stop() {
            this.listeners.splice(0).forEach(dispose => {
                try { dispose(); } catch (_) {}
            });
            this.started = false;
        }

        getDebugState() {
            return {
                started: this.started,
                workspaceMode: this.workspaceMode,
                pieMode: this.pieMode,
                listenerCount: this.listeners.length
            };
        }

        dispose() {
            this.stop();
            this.viewport = null;
        }
    }

    root.SMViewportModeBridgeClass = SMViewportModeBridge;
})(window);
