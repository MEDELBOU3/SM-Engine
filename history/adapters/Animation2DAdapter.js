(function () {
    'use strict';
    const H = window.SMHistory = window.SMHistory || {};

    class Animation2DAdapter {
        constructor(historyManager) {
            this.historyManager = historyManager;
            this.activeBeforeState = null;
            this.init();
        }

        getManager() {
            return window.animation2DManager || window.v2dManager?.animManager || null;
        }

        captureState() {
            const animMgr = this.getManager();
            if (!animMgr) return null;

            const keyframesObj = {};
            if (animMgr.keyframes) {
                for (const [frame, strokes] of animMgr.keyframes.entries()) {
                    keyframesObj[frame] = JSON.parse(JSON.stringify(strokes || []));
                }
            }

            const layersArr = animMgr.layers ? JSON.parse(JSON.stringify(animMgr.layers)) : [];

            const cameraKfObj = {};
            if (animMgr.cameraKeyframes) {
                for (const [frame, camData] of animMgr.cameraKeyframes.entries()) {
                    cameraKfObj[frame] = JSON.parse(JSON.stringify(camData));
                }
            }

            return {
                keyframes: keyframesObj,
                layers: layersArr,
                cameraKeyframes: cameraKfObj,
                currentFrame: typeof animMgr.getCurrentFrameIndex === 'function' ? animMgr.getCurrentFrameIndex() : 1,
                activeLayerId: animMgr.currentLayerId || animMgr.activeLayerId
            };
        }

        init() {
            // Stroke stroke/draw start
            window.addEventListener('animation2d:stroke-start', () => {
                if (this.historyManager && this.historyManager.isExecuting) return;
                this.activeBeforeState = this.captureState();
            });

            // Stroke stroke/draw end
            window.addEventListener('animation2d:stroke-end', (e) => {
                if (this.historyManager && this.historyManager.isExecuting || !this.activeBeforeState) return;

                const afterState = this.captureState();
                const label = e.detail?.name || 'Draw Stroke';

                if (H.Animation2DCommand) {
                    this.historyManager.recordCommand(new H.Animation2DCommand(
                        this.activeBeforeState,
                        afterState,
                        label,
                        '2d_stroke'
                    ));
                }
                this.activeBeforeState = null;
            });

            // Generic keyframe / layer changes recorded
            window.addEventListener('animation2d:keyframe-recorded', (e) => {
                if (this.historyManager && this.historyManager.isExecuting) return;

                const before = e.detail?.before || this.activeBeforeState;
                const after = e.detail?.after || this.captureState();
                const name = e.detail?.name || '2D Keyframe Change';

                if (before && after && H.Animation2DCommand) {
                    this.historyManager.recordCommand(new H.Animation2DCommand(
                        before,
                        after,
                        name,
                        '2d_keyframe'
                    ));
                }
                this.activeBeforeState = null;
            });
        }
    }

    H.Animation2DAdapter = Animation2DAdapter;
})();