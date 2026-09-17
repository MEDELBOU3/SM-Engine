(function () {
    'use strict';
    const H = window.SMHistory = window.SMHistory || {};
    const BaseCommand = H.BaseCommand || window.BaseCommand;

    class Animation2DCommand extends BaseCommand {
        constructor(beforeState, afterState, name = '2D Action', type = '2d_animation') {
            super(name, type);
            this.before = beforeState;
            this.after = afterState;

            this.byteSize = (JSON.stringify(beforeState || {}).length + JSON.stringify(afterState || {}).length) * 2;
        }

        getAnimationManager() {
            return window.animation2DManager || window.v2dManager?.animManager || null;
        }

        restore(state) {
            const animMgr = this.getAnimationManager();
            if (!animMgr || !state) return;

            if (animMgr.keyframes && state.keyframes) {
                animMgr.keyframes.clear();
                for (const f in state.keyframes) {
                    animMgr.keyframes.set(Number(f), JSON.parse(JSON.stringify(state.keyframes[f])));
                }
            }

            if (state.layers) {
                animMgr.layers = JSON.parse(JSON.stringify(state.layers));
            }

            if (animMgr.cameraKeyframes && state.cameraKeyframes) {
                animMgr.cameraKeyframes.clear();
                for (const f in state.cameraKeyframes) {
                    animMgr.cameraKeyframes.set(Number(f), JSON.parse(JSON.stringify(state.cameraKeyframes[f])));
                }
            }

            if (state.activeLayerId !== undefined) {
                animMgr.currentLayerId = state.activeLayerId;
                animMgr.activeLayerId = state.activeLayerId;
            }

            if (state.currentFrame !== undefined && typeof animMgr.goToFrame === 'function') {
                animMgr.goToFrame(state.currentFrame);
            } else {
                const frameIdx = typeof animMgr.getCurrentFrameIndex === 'function' ? animMgr.getCurrentFrameIndex() : 1;
                animMgr.strokes = animMgr.keyframes?.get(frameIdx) || [];
            }

            if (typeof animMgr.refreshLayerSelect === 'function') animMgr.refreshLayerSelect();
            if (typeof animMgr.syncLayerControls === 'function') animMgr.syncLayerControls();
            if (typeof animMgr.syncWithTimeline === 'function') animMgr.syncWithTimeline();
            if (typeof animMgr.updateTimelineUI === 'function') animMgr.updateTimelineUI();
            if (typeof animMgr.syncTimelineMarkers === 'function') animMgr.syncTimelineMarkers();
            if (typeof animMgr.render === 'function') animMgr.render();
        }

        execute() { this.restore(this.after); }
        undo() { this.restore(this.before); }
        redo() { this.restore(this.after); }

        dispose() {
            this.before = null;
            this.after = null;
        }
    }

    H.Animation2DCommand = Animation2DCommand;
})();