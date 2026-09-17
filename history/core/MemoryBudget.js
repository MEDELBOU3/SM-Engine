(function () {
    'use strict';
    window.SMHistory = window.SMHistory || {};

    class MemoryBudget {
        constructor(maxBytes = 150 * 1024 * 1024) { // 150 MB safety budget
            this.maxBytes = maxBytes;
            this.currentBytes = 0;
        }

        track(command) {
            if (!command) return;
            this.currentBytes += (command.byteSize || 0);
        }

        release(command) {
            if (!command) return;
            this.currentBytes = Math.max(0, this.currentBytes - (command.byteSize || 0));
            if (typeof command.dispose === 'function') {
                try {
                    command.dispose();
                } catch (e) {
                    console.warn('[MemoryBudget] Failed to dispose command:', e);
                }
            }
        }

        isOverBudget() {
            return this.currentBytes > this.maxBytes;
        }

        reset() {
            this.currentBytes = 0;
        }
    }

    window.SMHistory.MemoryBudget = MemoryBudget;
})();