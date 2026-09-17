(function () {
    'use strict';
    window.SMHistory = window.SMHistory || {};

    class HistoryStack {
        constructor(maxHistory = 100, memoryBudget = null) {
            this.undoList = [];
            this.redoList = [];
            this.maxHistory = maxHistory;
            this.memoryBudget = memoryBudget;
        }

        push(command) {
            this.clearRedo();
            this.undoList.push(command);
            if (this.memoryBudget) this.memoryBudget.track(command);
            this.trim();
        }

        popUndo() {
            const cmd = this.undoList.pop();
            if (cmd) this.redoList.push(cmd);
            return cmd || null;
        }

        popRedo() {
            const cmd = this.redoList.pop();
            if (cmd) this.undoList.push(cmd);
            return cmd || null;
        }

        clearRedo() {
            while (this.redoList.length > 0) {
                const cmd = this.redoList.pop();
                if (this.memoryBudget) this.memoryBudget.release(cmd);
                else if (typeof cmd.dispose === 'function') cmd.dispose();
            }
        }

        clear() {
            while (this.undoList.length > 0) {
                const cmd = this.undoList.pop();
                if (this.memoryBudget) this.memoryBudget.release(cmd);
                else if (typeof cmd.dispose === 'function') cmd.dispose();
            }
            this.clearRedo();
        }

        trim() {
            while (this.undoList.length > this.maxHistory || (this.memoryBudget && this.memoryBudget.isOverBudget())) {
                const cmd = this.undoList.shift();
                if (cmd) {
                    if (this.memoryBudget) this.memoryBudget.release(cmd);
                    else if (typeof cmd.dispose === 'function') cmd.dispose();
                }
            }
        }

        get topUndo() {
            return this.undoList.length > 0 ? this.undoList[this.undoList.length - 1] : null;
        }

        get topRedo() {
            return this.redoList.length > 0 ? this.redoList[this.redoList.length - 1] : null;
        }
    }

    window.SMHistory.HistoryStack = HistoryStack;
})();