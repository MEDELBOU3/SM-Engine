/*
 * Mesh Sculpt history is intentionally independent from TerrainHistory.
 * It records complete mesh states so undo remains valid after subdivision or
 * remeshing, not just after simple vertex displacement.
 */
(function () {
    'use strict';

    class SMAdvancedSculptHistory {
        constructor(limit = 18) {
            this.limit = Math.max(1, Math.min(Number(limit) || 18, 48));
            this.entries = [];
            this.index = -1;
        }

        capture(mesh, mask, label = 'Sculpt stroke') {
            if (!mesh?.geometry) return null;

            return {
                label,
                geometry: mesh.geometry.clone(),
                mask: mask ? new Float32Array(mask) : null,
                timestamp: Date.now()
            };
        }

        commit(before, after, label = 'Sculpt stroke') {
            if (!before || !after || this._matches(before, after)) {
                this._dispose(before);
                this._dispose(after);
                return false;
            }

            const discarded = this.entries.splice(this.index + 1);
            discarded.forEach(entry => this._dispose(entry.before));
            discarded.forEach(entry => this._dispose(entry.after));

            this.entries.push({ before, after, label, timestamp: Date.now() });
            this.index = this.entries.length - 1;

            while (this.entries.length > this.limit) {
                const oldest = this.entries.shift();
                this._dispose(oldest.before);
                this._dispose(oldest.after);
                this.index -= 1;
            }

            return true;
        }

        undo(workspace) {
            if (!workspace || this.index < 0) return false;
            const entry = this.entries[this.index--];
            workspace.restoreHistoryState(entry.before);
            return true;
        }

        redo(workspace) {
            if (!workspace || this.index >= this.entries.length - 1) return false;
            const entry = this.entries[++this.index];
            workspace.restoreHistoryState(entry.after);
            return true;
        }

        clear() {
            this.entries.forEach(entry => {
                this._dispose(entry.before);
                this._dispose(entry.after);
            });
            this.entries = [];
            this.index = -1;
        }

        get status() {
            return {
                position: this.index + 1,
                length: this.entries.length,
                canUndo: this.index >= 0,
                canRedo: this.index < this.entries.length - 1
            };
        }

        _matches(first, second) {
            const firstPosition = first.geometry?.getAttribute?.('position')?.array;
            const secondPosition = second.geometry?.getAttribute?.('position')?.array;
            if (!firstPosition || !secondPosition || firstPosition.length !== secondPosition.length) return false;
            if ((first.geometry.index?.count || 0) !== (second.geometry.index?.count || 0)) return false;
            if ((first.mask?.length || 0) !== (second.mask?.length || 0)) return false;
            for (let index = 0; index < firstPosition.length; index += 1) {
                if (firstPosition[index] !== secondPosition[index]) return false;
            }
            if (first.mask) {
                for (let index = 0; index < first.mask.length; index += 1) {
                    if (first.mask[index] !== second.mask[index]) return false;
                }
            }
            return true;
        }

        _dispose(state) {
            state?.geometry?.dispose?.();
        }
    }

    window.SMAdvancedSculptHistory = SMAdvancedSculptHistory;
}());
