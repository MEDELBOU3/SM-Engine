(function () {
    'use strict';
    const H = window.SMHistory = window.SMHistory || {};
    const BaseCommand = H.BaseCommand || window.BaseCommand;

    class CustomCallbackCommand extends BaseCommand {
        constructor(name = 'Custom Action', undoFn = null, redoFn = null, rawMeta = null) {
            super(name, rawMeta?.type || 'custom');
            this.undoFn = undoFn;
            this.redoFn = redoFn;
            this.rawMeta = rawMeta;
            this.byteSize = 256;
        }

        execute() {
            if (typeof this.redoFn === 'function') this.redoFn();
        }

        undo() {
            if (typeof this.undoFn === 'function') this.undoFn();
        }

        redo() {
            this.execute();
        }
    }

    H.CustomCallbackCommand = CustomCallbackCommand;
})();