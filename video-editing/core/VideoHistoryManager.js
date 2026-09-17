/**
 * VideoHistoryManager.js
 * Snapshot undo/redo for SM Engine Video Editing.
 * Public API: window.veHistory
 */
(function (global) {
    'use strict';

    class VideoHistoryManager {
        constructor(limit = 80) {
            this.limit = Math.max(10, limit | 0);
            this.undoStack = [];
            this.redoStack = [];
            this.pending = new Map();
            this.listeners = new Set();
            this._bindKeyboard();
        }

        _manager() { return global.videoEditingManager || null; }
        _sequencer() { return global.sequencerManager || null; }

        _clonePlain(value) {
            if (value == null) return value;
            try { return structuredClone(value); }
            catch (_) { return JSON.parse(JSON.stringify(value)); }
        }

        _sanitizeItem(item) {
            if (!item) return null;
            const skip = new Set([
                'image','_image','_video','video','audioElement','element','dom','canvas','ctx',
                '_videoPlayPending','_videoPendingTime','_videoSeekingTo','_videoFrameReady'
            ]);
            const out = {};
            Object.keys(item).forEach(key => {
                if (skip.has(key)) return;
                const v = item[key];
                if (typeof v === 'function') return;
                if (v && (v instanceof HTMLMediaElement || v instanceof HTMLImageElement || v instanceof HTMLCanvasElement)) return;
                try { out[key] = this._clonePlain(v); } catch (_) {}
            });
            return out;
        }

        capture() {
            const mgr = this._manager();
            const seq = this._sequencer();
            return {
                items: (mgr?.items || []).map(item => this._sanitizeItem(item)).filter(Boolean),
                selectedItemId: mgr?.selectedItem?.id || null,
                resolution: mgr?.resolution ? { ...mgr.resolution } : null,
                masterGain: Number(mgr?.masterGain ?? 1),
                sequencer: seq?.state ? {
                    clips: this._clonePlain(seq.state.clips || []),
                    tracks: this._clonePlain(seq.state.tracks || []),
                    playhead: Number(seq.state.playhead || 0),
                    selectedIds: this._clonePlain(seq.state.selectedIds || []),
                    fps: Number(seq.state.fps || 30),
                    workStart: Number(seq.state.workStart || 0),
                    workEnd: Number(seq.state.workEnd || 0)
                } : null
            };
        }

        async restore(snapshot) {
            if (!snapshot) return false;
            const mgr = this._manager();
            const seq = this._sequencer();
            if (!mgr) return false;

            const existingById = new Map((mgr.items || []).map(i => [i.id, i]));
            const restoredItems = [];
            for (const data of snapshot.items || []) {
                let live = existingById.get(data.id) || null;
                if (!live) {
                    live = { ...this._clonePlain(data) };
                    // Rehydrate media lazily from source URLs.
                    if (live.type === 'media') {
                        live._image = null;
                        live._video = null;
                    }
                } else {
                    Object.keys(live).forEach(k => {
                        if (k.startsWith('_') && ['_image','_video'].includes(k)) return;
                    });
                    Object.assign(live, this._clonePlain(data));
                }
                restoredItems.push(live);
            }
            mgr.items = restoredItems;
            mgr.resolution = snapshot.resolution ? { ...snapshot.resolution } : mgr.resolution;
            mgr.masterGain = Number(snapshot.masterGain ?? mgr.masterGain ?? 1);
            mgr.selectedItem = mgr.items.find(i => i.id === snapshot.selectedItemId) || null;
            mgr.items.forEach(i => i.selected = i === mgr.selectedItem);

            if (seq?.state && snapshot.sequencer) {
                seq.state.clips = this._clonePlain(snapshot.sequencer.clips || []);
                seq.state.tracks = this._clonePlain(snapshot.sequencer.tracks || seq.state.tracks || []);
                seq.state.playhead = Number(snapshot.sequencer.playhead || 0);
                seq.state.selectedIds = this._clonePlain(snapshot.sequencer.selectedIds || []);
                seq.state.fps = Number(snapshot.sequencer.fps || seq.state.fps || 30);
                seq.state.workStart = Number(snapshot.sequencer.workStart || 0);
                seq.state.workEnd = Number(snapshot.sequencer.workEnd || seq.state.workEnd || 0);
                seq.state.clips.forEach(c => c.selected = seq.state.selectedIds.includes(c.id));
                seq.renderer?.render?.();
                seq.renderer?.updatePlayhead?.();
                seq.inspector?.refresh?.();
            }

            mgr.canvasController?.resetView?.(false);
            mgr.renderCompositeAt?.(seq?.state?.playhead || 0);
            mgr._syncHierarchy?.();
            this._emit();
            return true;
        }

        begin(label = 'Change', category = 'edit') {
            const token = `veh-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
            this.pending.set(token, { label, category, before: this.capture() });
            return token;
        }

        commit(token) {
            const p = this.pending.get(token);
            if (!p) return false;
            this.pending.delete(token);
            const after = this.capture();
            const beforeJSON = JSON.stringify(p.before);
            const afterJSON = JSON.stringify(after);
            if (beforeJSON === afterJSON) return false;
            this.undoStack.push({ ...p, after, time: Date.now() });
            if (this.undoStack.length > this.limit) this.undoStack.shift();
            this.redoStack.length = 0;
            this._emit();
            return true;
        }

        cancel(token) { return this.pending.delete(token); }

        record(label, category, mutator) {
            const token = this.begin(label, category);
            try { mutator?.(); }
            finally { this.commit(token); }
        }

        async undo() {
            const cmd = this.undoStack.pop();
            if (!cmd) return false;
            const current = this.capture();
            this.redoStack.push({ ...cmd, before: cmd.before, after: current });
            await this.restore(cmd.before);
            return true;
        }

        async redo() {
            const cmd = this.redoStack.pop();
            if (!cmd) return false;
            const current = this.capture();
            this.undoStack.push({ ...cmd, before: current });
            await this.restore(cmd.after);
            return true;
        }

        canUndo() { return this.undoStack.length > 0; }
        canRedo() { return this.redoStack.length > 0; }
        clear() { this.undoStack.length = 0; this.redoStack.length = 0; this.pending.clear(); this._emit(); }

        onChange(fn) { if (typeof fn === 'function') this.listeners.add(fn); return () => this.listeners.delete(fn); }
        _emit() {
            const state = { canUndo: this.canUndo(), canRedo: this.canRedo(), undo: this.undoStack.at(-1)?.label || '', redo: this.redoStack.at(-1)?.label || '' };
            this.listeners.forEach(fn => { try { fn(state); } catch (_) {} });
            global.dispatchEvent?.(new CustomEvent('veHistoryChanged', { detail: state }));
        }

        _bindKeyboard() {
            window.addEventListener('keydown', e => {
                if (!document.body.classList.contains('video-editing-mode')) return;
                const tag = e.target?.tagName?.toLowerCase();
                if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target?.isContentEditable) return;
                const mod = e.ctrlKey || e.metaKey;
                if (!mod || e.key.toLowerCase() !== 'z') return;
                e.preventDefault();
                if (e.shiftKey) this.redo(); else this.undo();
            });
        }
    }

    global.VideoHistoryManager = VideoHistoryManager;
    global.veHistory = global.veHistory || new VideoHistoryManager(100);
})(window);