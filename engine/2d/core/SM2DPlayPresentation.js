// ============================================================================
// 2D-editor/advanced/SM2DPlayPresentation.js
// SM Engine - editor-only presentation guard for Play In Editor
// ============================================================================
(function (root) {
    'use strict';

    class SM2DPlayPresentation {
        constructor() {
            this.active = false;
            this.visibilityBeforePlay = new Map();
            this.axisOverlayDisplay = null;
            this._repairTimers = [];
            this._onPlayStart = this._onPlayStart.bind(this);
            this._onPlayStop = this._onPlayStop.bind(this);
        }

        install() {
            root.addEventListener('sm:pie-start', this._onPlayStart);
            root.addEventListener('sm:pie-stop', this._onPlayStop);
            root.addEventListener('sm:2d-runtime-start', this._onPlayStart);
            root.addEventListener('sm:2d-runtime-stop', this._onPlayStop);
            return this;
        }

        _onPlayStart() {
            this.active = true;
            this.hideEditorHelpers();

            // Workspace setup can complete a frame after Play starts. Recheck
            // briefly so an editor grid can never leak into the game render.
            this._clearRepairTimers();
            [0, 80, 300].forEach((delay) => {
                const timer = root.setTimeout(() => {
                    if (this.active) this.hideEditorHelpers();
                }, delay);
                this._repairTimers.push(timer);
            });
        }

        _onPlayStop() {
            this.active = false;
            this._clearRepairTimers();
            this.restoreEditorHelpers();
        }

        _clearRepairTimers() {
            this._repairTimers.forEach((timer) => root.clearTimeout(timer));
            this._repairTimers = [];
        }

        _isEditorOnlyHelper(object) {
            if (!object) return false;
            const data = object.userData || {};
            const name = String(object.name || '').toLowerCase();
            return data.editorOnly === true ||
                data.hideInPlay === true ||
                data.ws_workspaceGrid === true ||
                object.isGridHelper === true ||
                name === 'gamemodegrid2d' ||
                name === 'advancedgrid' ||
                name === 'blendergrid' ||
                name === 'infinitegrid';
        }

        hideEditorHelpers(scene = root.scene) {
            if (!scene?.traverse) return;
            scene.traverse((object) => {
                if (!this._isEditorOnlyHelper(object)) return;
                if (!this.visibilityBeforePlay.has(object)) {
                    this.visibilityBeforePlay.set(object, object.visible);
                }
                object.visible = false;
            });

            const axisOverlay = document.getElementById('sm-2d-axis-overlay');
            if (axisOverlay) {
                if (this.axisOverlayDisplay === null) this.axisOverlayDisplay = axisOverlay.style.display;
                axisOverlay.style.display = 'none';
            }
        }

        restoreEditorHelpers() {
            this.visibilityBeforePlay.forEach((visible, object) => {
                if (object?.parent || object === root.scene) object.visible = visible;
            });
            this.visibilityBeforePlay.clear();

            const axisOverlay = document.getElementById('sm-2d-axis-overlay');
            if (axisOverlay && this.axisOverlayDisplay !== null) {
                axisOverlay.style.display = this.axisOverlayDisplay;
            }
            this.axisOverlayDisplay = null;
        }

        dispose() {
            this._onPlayStop();
            root.removeEventListener('sm:pie-start', this._onPlayStart);
            root.removeEventListener('sm:pie-stop', this._onPlayStop);
            root.removeEventListener('sm:2d-runtime-start', this._onPlayStart);
            root.removeEventListener('sm:2d-runtime-stop', this._onPlayStop);
        }
    }

    if (!root.SM2DPlayPresentation) {
        root.SM2DPlayPresentation = new SM2DPlayPresentation().install();
    }
}(window));
