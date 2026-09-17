(function () {
    'use strict';
    window.SMHistory = window.SMHistory || {};

    class BaseCommand {
        constructor(name = 'Action', type = 'custom') {
            this.id = `${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
            this.timestamp = new Date();
            this.name = name;
            this.type = type;
            this.byteSize = 0;
        }

        execute() {
            throw new Error(`[BaseCommand] execute() not implemented on ${this.constructor.name}`);
        }

        undo() {
            throw new Error(`[BaseCommand] undo() not implemented on ${this.constructor.name}`);
        }

        redo() {
            this.execute();
        }

        canMergeWith(nextCommand) {
            return false;
        }

        mergeWith(nextCommand) {
            return false;
        }

        dispose() {
            // Override to release GPU / typed array memory
        }
    }

    window.SMHistory.BaseCommand = BaseCommand;
    window.BaseCommand = BaseCommand;
})();