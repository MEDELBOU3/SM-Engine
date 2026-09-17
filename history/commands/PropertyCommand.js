(function () {
    'use strict';
    const H = window.SMHistory = window.SMHistory || {};
    const BaseCommand = H.BaseCommand || window.BaseCommand;

    class PropertyCommand extends BaseCommand {
        constructor(object, path, oldVal, newVal, name = null) {
            const objName = object?.name || 'Object';
            super(name || `Change ${path} on ${objName}`, 'property');

            this.object = object;
            this.path = path;
            this.oldVal = oldVal;
            this.newVal = newVal;
            this.byteSize = 128;
        }

        applyValue(val) {
            if (!this.object || !this.path) return;
            const parts = this.path.split('.');
            let target = this.object;

            for (let i = 0; i < parts.length - 1; i++) {
                if (target == null) return;
                target = target[parts[i]];
            }

            if (target != null && parts.length > 0) {
                target[parts[parts.length - 1]] = val;

                if (this.object.material && this.path.startsWith('material')) {
                    if (Array.isArray(this.object.material)) {
                        this.object.material.forEach(m => m.needsUpdate = true);
                    } else {
                        this.object.material.needsUpdate = true;
                    }
                }
            }
        }

        execute() { this.applyValue(this.newVal); }
        undo() { this.applyValue(this.oldVal); }
        redo() { this.applyValue(this.newVal); }

        canMergeWith(nextCommand) {
            return (
                nextCommand instanceof PropertyCommand &&
                nextCommand.object === this.object &&
                nextCommand.path === this.path &&
                (Date.now() - this.timestamp.getTime()) < 600
            );
        }

        mergeWith(nextCommand) {
            this.newVal = nextCommand.newVal;
            this.timestamp = new Date();
            return true;
        }
    }

    H.PropertyCommand = PropertyCommand;
})();