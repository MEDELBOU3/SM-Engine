// js/timeline/sequencer/TimelineHistoryManager.js
// Lightweight undo/redo command history for timeline-only editing.

(() => {
    "use strict";

    class TimelineHistoryManager {
        constructor({
            maxEntries = 150
        } = {}) {
            this.maxEntries = Math.max(10, Number(maxEntries) || 150);
            this.undoStack = [];
            this.redoStack = [];
            this.executing = false;
            this.events = new EventTarget();
        }

        push(command) {
            if (!command || typeof command.undo !== "function" || typeof command.redo !== "function") {
                return false;
            }

            const entry = {
                id: command.id || `hist_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                label: command.label || "Timeline Edit",
                undo: command.undo,
                redo: command.redo,
                timestamp: Date.now()
            };

            this.undoStack.push(entry);

            if (this.undoStack.length > this.maxEntries) {
                this.undoStack.splice(0, this.undoStack.length - this.maxEntries);
            }

            this.redoStack.length = 0;
            this._emit("push", entry);

            return true;
        }

        async undo() {
            if (this.executing || this.undoStack.length === 0) return false;

            const entry = this.undoStack.pop();

            this.executing = true;

            try {
                await entry.undo();
                this.redoStack.push(entry);
                this._emit("undo", entry);
                return true;
            } catch (error) {
                console.error("[TimelineHistory] Undo failed:", error);
                this.undoStack.push(entry);
                return false;
            } finally {
                this.executing = false;
            }
        }

        async redo() {
            if (this.executing || this.redoStack.length === 0) return false;

            const entry = this.redoStack.pop();

            this.executing = true;

            try {
                await entry.redo();
                this.undoStack.push(entry);
                this._emit("redo", entry);
                return true;
            } catch (error) {
                console.error("[TimelineHistory] Redo failed:", error);
                this.redoStack.push(entry);
                return false;
            } finally {
                this.executing = false;
            }
        }

        clear() {
            this.undoStack.length = 0;
            this.redoStack.length = 0;
            this._emit("clear", null);
        }

        getState() {
            return {
                canUndo: this.undoStack.length > 0,
                canRedo: this.redoStack.length > 0,
                undoLabel: this.undoStack.at(-1)?.label || null,
                redoLabel: this.redoStack.at(-1)?.label || null,
                undoCount: this.undoStack.length,
                redoCount: this.redoStack.length
            };
        }

        _emit(type, entry) {
            const detail = {
                type,
                entry,
                state: this.getState()
            };

            this.events.dispatchEvent(
                new CustomEvent("change", { detail })
            );

            window.dispatchEvent(
                new CustomEvent("sm:timeline-history-change", { detail })
            );
        }
    }

    window.TimelineHistoryManager = TimelineHistoryManager;
    window.timelineHistoryManager =
        window.timelineHistoryManager ||
        new TimelineHistoryManager();
})();