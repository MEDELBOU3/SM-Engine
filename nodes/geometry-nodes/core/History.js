// ============================================================================
// History v2 — snapshot-based undo/redo for Geometry Nodes.
// ============================================================================
(function (global) {
    'use strict';

    class HistoryCommand {
        constructor(label, before, after) {
            this.label = label || 'Change';
            this.before = before;
            this.after = after;
            this.timestamp = Date.now();
        }

        apply(graph, registry) {
            global.NodeSerializer.fromJSON(this.after, registry, graph);
        }

        revert(graph, registry) {
            global.NodeSerializer.fromJSON(this.before, registry, graph);
        }
    }

    class History {
        constructor(graph, registry, limit = 100) {
            this.graph = graph;
            this.registry = registry;
            this.limit = Math.max(1, limit);
            this._undo = [];
            this._redo = [];
            this.listeners = Object.create(null);
        }

        on(event, fn) {
            if (typeof fn !== 'function') return () => {};
            (this.listeners[event] = this.listeners[event] || new Set()).add(fn);
            return () => this.listeners[event]?.delete(fn);
        }

        _emit(event, command = null) {
            this.listeners[event]?.forEach(fn => {
                try { fn(command); } catch (_) {}
            });
        }

        pushSnapshot(label, before, after) {
            const b = typeof before === 'function' ? before() : before;
            const a = typeof after === 'function' ? after() : after;
            if (!b || !a) return null;

            if (JSON.stringify(b) === JSON.stringify(a)) return null;

            const command = new HistoryCommand(label, b, a);
            this._undo.push(command);
            if (this._undo.length > this.limit) this._undo.shift();
            this._redo.length = 0;
            this._emit('push', command);
            return command;
        }

        canUndo() { return this._undo.length > 0; }
        canRedo() { return this._redo.length > 0; }

        undo() {
            const command = this._undo.pop();
            if (!command) return false;
            command.revert(this.graph, this.registry);
            this._redo.push(command);
            this._emit('undo', command);
            return true;
        }

        redo() {
            const command = this._redo.pop();
            if (!command) return false;
            command.apply(this.graph, this.registry);
            this._undo.push(command);
            this._emit('redo', command);
            return true;
        }

        clear() {
            this._undo.length = 0;
            this._redo.length = 0;
            this._emit('clear', null);
        }
    }

    global.History = History;
    global.HistoryCommand = HistoryCommand;
})(typeof window !== 'undefined' ? window : globalThis);