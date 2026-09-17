(function () {
    'use strict';
    const H = window.SMHistory = window.SMHistory || {};

    class TransformControlsAdapter {
        constructor(historyManager, transformControls, controls) {
            this.historyManager = historyManager;
            this.transformControls = transformControls || window.transformControls;
            this.controls = controls || window.controls;
            this.dragStartState = null;

            if (this.transformControls) {
                this.bind(this.transformControls, this.controls);
            }
        }

        bind(transformControls, controls) {
            if (!transformControls || transformControls._smAdapterBound) return;
            transformControls._smAdapterBound = true;

            this.transformControls = transformControls;
            if (controls) this.controls = controls;

            // Mouse Down: freeze camera controls and capture initial transform snapshot
            transformControls.addEventListener('mouseDown', () => {
                const activeControls = this.controls || window.controls;
                if (activeControls) activeControls.enabled = false;

                if (this.historyManager && this.historyManager.isExecuting) return;

                // Sub-object pivot moves in edit mode are handled by ModelingSystemAdapter
                const modelingSystem = window.UnifiedModelingSystem;
                if (modelingSystem && modelingSystem.isEditMode && transformControls.object === modelingSystem.subObjectPivot) {
                    this.dragStartState = null;
                    return;
                }

                const object = transformControls.object;
                if (object) {
                    this.dragStartState = {
                        position: object.position.clone(),
                        rotation: object.rotation.clone(),
                        scale: object.scale.clone()
                    };
                }
            });

            // Mouse Up: re-enable camera and record command if transform actually changed
            transformControls.addEventListener('mouseUp', () => {
                const activeControls = this.controls || window.controls;
                if (activeControls) activeControls.enabled = true;

                if (!this.historyManager || this.historyManager.isExecuting || !this.dragStartState) return;

                const object = transformControls.object;
                if (object) {
                    const hasMoved = !object.position.equals(this.dragStartState.position);
                    const hasRotated = !object.rotation.equals(this.dragStartState.rotation);
                    const hasScaled = !object.scale.equals(this.dragStartState.scale);

                    if (hasMoved || hasRotated || hasScaled) {
                        const modeLabel = transformControls.mode ? transformControls.mode.toUpperCase() : 'Transform';
                        const TransformCommand = H.TransformCommand;

                        if (TransformCommand) {
                            this.historyManager.recordCommand(new TransformCommand(
                                object,
                                this.dragStartState,
                                {
                                    position: object.position.clone(),
                                    rotation: object.rotation.clone(),
                                    scale: object.scale.clone()
                                },
                                `${modeLabel} ${object.name || 'Object'}`
                            ));
                        }
                    }
                }
                this.dragStartState = null;
            });
        }
    }

    H.TransformControlsAdapter = TransformControlsAdapter;
})();