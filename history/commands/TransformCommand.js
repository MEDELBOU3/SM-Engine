(function () {
    'use strict';
    const H = window.SMHistory = window.SMHistory || {};
    const BaseCommand = H.BaseCommand || window.BaseCommand;

    class TransformCommand extends BaseCommand {
        constructor(object, beforeState, afterState, name = null) {
            const objName = object?.name || 'Object';
            super(name || `Transform ${objName}`, 'transform');

            this.object = object;
            this.objectUuid = object?.uuid;
            this.before = this.cloneTransform(beforeState);
            this.after = this.cloneTransform(afterState);
            this.byteSize = 192;
        }

        cloneTransform(state) {
            if (!state) return null;
            return {
                position: state.position ? state.position.clone() : null,
                rotation: state.rotation ? state.rotation.clone() : null,
                scale: state.scale ? state.scale.clone() : null
            };
        }

        apply(state) {
            if (!this.object || !state) return;
            if (state.position && this.object.position) this.object.position.copy(state.position);
            if (state.rotation && this.object.rotation) this.object.rotation.copy(state.rotation);
            if (state.scale && this.object.scale) this.object.scale.copy(state.scale);

            this.object.updateMatrixWorld(true);

            const gizmo = window.transformControls || window.historyManager?.transformControls;
            if (gizmo && gizmo.object === this.object && typeof gizmo.updateMatrix === 'function') {
                gizmo.updateMatrix();
            }
        }

        execute() { this.apply(this.after); }
        undo() { this.apply(this.before); }
        redo() { this.apply(this.after); }

        canMergeWith(nextCommand) {
            return (
                nextCommand instanceof TransformCommand &&
                nextCommand.object === this.object &&
                (Date.now() - this.timestamp.getTime()) < 500
            );
        }

        mergeWith(nextCommand) {
            this.after = this.cloneTransform(nextCommand.after);
            this.timestamp = new Date();
            return true;
        }
    }

    H.TransformCommand = TransformCommand;
})();