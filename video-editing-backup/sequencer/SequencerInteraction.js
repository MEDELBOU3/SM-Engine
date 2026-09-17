/**
 * SequencerInteraction.js
 * Pointer / wheel / keyboard handling for the SM Engine video sequencer.
 * Mutates SequencerState (via the manager callbacks) and asks the renderer
 * to repaint. All hit-testing happens in content coordinates:
 *   time = (scrollLeft + clientX - contentRect.left - trackHeaderWidth) / pixelsPerSecond
 */

(function () {
    const DRAG_THRESHOLD = 3;
    const EDGE_PX = 6;

    class SequencerInteraction {
        constructor(state, snap, renderer, cb) {
            this.state = state;
            this.snap = snap;
            this.renderer = renderer;
            this.cb = cb || {};
            this.drag = null;
            this._bound = false;
        }

        bind() {
            if (this._bound) return;
            this._bound = true;
            const el = this.renderer.el;
            el.lanes.addEventListener('pointerdown', this._onPointerDown = e => this._pointerDown(e));
            el.rulerCanvas.addEventListener('pointerdown', this._onRulerDown = e => this._pointerDown(e));
            el.rulerHandle.addEventListener('pointerdown', this._onRulerDown);
            window.addEventListener('pointermove', this._onPointerMove = e => this._pointerMove(e));
            window.addEventListener('pointerup', this._onPointerUp = e => this._pointerUp(e));
            el.root.addEventListener('wheel', this._onWheel = e => this._wheel(e), { passive: false });
            el.scroll.addEventListener('scroll', this._onScroll = () => {
                this.renderer.syncScrollFromElement();
                this.renderer.scheduleRulerUpdate();
            });
            el.lanes.addEventListener('click', this._onLaneClick = e => this._laneClick(e));
            el.lanes.addEventListener('dblclick', this._onDblClick = e => this._dblClick(e));
            window.addEventListener('keydown', this._onKeyDown = e => this._keyDown(e));
        }

        unbind() {
            if (!this._bound) return;
            this._bound = false;
            const el = this.renderer.el;
            el.lanes.removeEventListener('pointerdown', this._onPointerDown);
            el.rulerCanvas.removeEventListener('pointerdown', this._onRulerDown);
            el.rulerHandle.removeEventListener('pointerdown', this._onRulerDown);
            window.removeEventListener('pointermove', this._onPointerMove);
            window.removeEventListener('pointerup', this._onPointerUp);
            el.root.removeEventListener('wheel', this._onWheel);
            el.scroll.removeEventListener('scroll', this._onScroll);
            el.lanes.removeEventListener('click', this._onLaneClick);
            el.lanes.removeEventListener('dblclick', this._onDblClick);
            window.removeEventListener('keydown', this._onKeyDown);
            this.drag = null;
        }

        _fire(name) {
            if (this.cb[name]) {
                const args = Array.prototype.slice.call(arguments, 1);
                this.cb[name].apply(null, args);
            }
        }

        _timeAtX(clientX) {
            const s = this.state;
            const rect = this.renderer.el.scroll.getBoundingClientRect();
            const contentX = this.renderer.el.scroll.scrollLeft + (clientX - rect.left) - s.trackHeaderWidth;
            return Math.max(0, contentX / s.pixelsPerSecond);
        }

        _trackIndexAt(clientY) {
            const s = this.state;
            const rect = this.renderer.el.lanes.getBoundingClientRect();
            const y = clientY - rect.top;
            const idx = Math.floor(y / s.trackHeight);
            return Math.max(0, Math.min(s.tracks.length - 1, idx));
        }

        _canPlace(clip, track) {
            if (!track) return false;
            if (track.locked) return false;
            if (clip.mediaType === 'audio') return track.type === 'audio';
            return track.type === 'video';
        }

        _seekAt(clientX, snapEnabled) {
            const s = this.state;
            let t = this._timeAtX(clientX);
            if (snapEnabled !== false) {
                t = this.snap.snap(t).time;
            }
            s.playhead = Math.max(0, t);
            this.renderer.updatePlayhead();
            this._fire('onSeek', s.playhead);
        }

        _pointerDown(e) {
            const s = this.state;
            const el = this.renderer.el;

            if (e.target === el.rulerHandle || e.target === el.rulerCanvas) {
                this._seekAt(e.clientX, true);
                this.drag = { type: 'seek' };
                e.preventDefault();
                return;
            }

            const clipEl = e.target.closest ? e.target.closest('.sequencer-clip') : null;
            if (clipEl) {
                const clip = s.getClip(clipEl.dataset.clipId);
                if (!clip) return;
                if (s.activeTool === 'razor') {
                    this._fire('onSplitAt', this._timeAtX(e.clientX));
                    return;
                }
                const track = s.getTrack(clip.trackId);
                if (clip.locked || (track && track.locked)) return;

                const rect = clipEl.getBoundingClientRect();
                const dx = e.clientX - rect.left;
                const trimHandle = e.target.closest ? e.target.closest('.sq-trim-handle') : null;
                const edge = trimHandle
                    ? (trimHandle.classList.contains('left') ? 'left' : 'right')
                    : (dx <= EDGE_PX ? 'left' : (rect.width - dx <= EDGE_PX ? 'right' : null));

                if (!s.selectedIds.includes(clip.id)) {
                    s.selectClip(clip, e.ctrlKey || e.metaKey || e.shiftKey);
                    this._fire('onSelectionChange');
                } else if (e.ctrlKey || e.metaKey) {
                    s.selectClip(clip, true);
                    this._fire('onSelectionChange');
                }
                s.selectedClips.forEach(c => this.renderer.updateClip(c));

                const group = edge ? [clip] : s.selectedClips;
                this.drag = {
                    type: edge ? (edge === 'left' ? 'trimL' : 'trimR') : 'move',
                    pointerStartX: e.clientX,
                    pointerStartY: e.clientY,
                    originals: group.map(c => ({
                        id: c.id, start: c.start, duration: c.duration,
                        trackId: c.trackId, sourceIn: c.sourceIn, sourceOut: c.sourceOut
                    })),
                    started: false
                };
                e.preventDefault();
                return;
            }

            const laneBody = e.target.closest ? e.target.closest('.sequencer-lane-body') : null;
            if (laneBody) {
                this._seekAt(e.clientX, true);
                if (s.activeTool === 'select' && !e.ctrlKey && !e.metaKey) {
                    s.clearSelection();
                    this._fire('onSelectionChange');
                    s.clips.forEach(c => this.renderer.updateClip(c));
                }
                this.drag = { type: 'seek' };
                e.preventDefault();
            }
        }

        _pointerMove(e) {
            if (!this.drag) return;
            const d = this.drag;
            const s = this.state;

            if (d.type === 'seek') {
                this._seekAt(e.clientX, true);
                return;
            }

            if (d.type === 'move') {
                if (!d.started &&
                    Math.abs(e.clientX - d.pointerStartX) < DRAG_THRESHOLD &&
                    Math.abs(e.clientY - d.pointerStartY) < DRAG_THRESHOLD) {
                    return;
                }
                d.started = true;
                const dt = (e.clientX - d.pointerStartX) / s.pixelsPerSecond;
                const refs = d.originals.map(o => ({ start: o.start }));
                const snapR = this.snap.snapGroupDelta(dt, refs, {});
                let delta = snapR.delta;
                const minStart = Math.min.apply(null, d.originals.map(o => o.start));
                if (minStart + delta < 0) delta = -minStart;
                const track = s.tracks[this._trackIndexAt(e.clientY)] || s.tracks[0];
                d.originals.forEach(o => {
                    const clip = s.getClip(o.id);
                    if (!clip) return;
                    clip.start = o.start + delta;
                    if (this._canPlace(clip, track)) clip.trackId = track.id;
                    this.renderer.updateClip(clip);
                });
                s.selectedClips.forEach(c => this.renderer.moveClipToTrack(c));
                this._fire('onClipsMoved');
                return;
            }

            if (d.type === 'trimL' || d.type === 'trimR') {
                const o = d.originals[0];
                const clip = s.getClip(o.id);
                if (!clip) return;
                const dt = (e.clientX - d.pointerStartX) / s.pixelsPerSecond;
                const minDur = 1 / s.fps;
                if (d.type === 'trimL') {
                    let newStart = o.start + dt;
                    newStart = Math.min(newStart, o.start + o.duration - minDur);
                    newStart = Math.max(0, this.snap.snap(newStart, {
                        excludeClipId: clip.id,
                        edges: { left: true, right: false }
                    }).time);
                    newStart = Math.min(newStart, o.start + o.duration - minDur);
                    const shift = newStart - o.start;
                    clip.start = newStart;
                    clip.duration = o.duration - shift;
                    clip.sourceIn = Math.max(0, o.sourceIn + shift);
                    clip.sourceOut = clip.sourceIn + clip.duration;
                } else {
                    let newEnd = o.start + o.duration + dt;
                    newEnd = Math.max(newEnd, o.start + minDur);
                    newEnd = this.snap.snap(newEnd, {
                        excludeClipId: clip.id,
                        edges: { left: false, right: true }
                    }).time;
                    newEnd = Math.max(newEnd, o.start + minDur);
                    clip.duration = newEnd - o.start;
                    clip.sourceOut = clip.sourceIn + clip.duration;
                }
                this.renderer.updateClip(clip);
                this._fire('onClipTrimmed', clip);
            }
        }

        _pointerUp() {
            this.drag = null;
            this._fire('onInteractionEnd');
        }

        _laneClick(e) {
            const btn = e.target.closest ? e.target.closest('.sequencer-track-btn') : null;
            if (!btn) return;
            const row = e.target.closest ? e.target.closest('.sequencer-lane') : null;
            if (!row) return;
            const s = this.state;
            const track = s.getTrack(row.dataset.trackId);
            if (!track) return;
            if (btn.classList.contains('btn-vis')) track.visible = !track.visible;
            else if (btn.classList.contains('btn-mute')) track.muted = !track.muted;
            else if (btn.classList.contains('btn-solo')) track.solo = !track.solo;
            else if (btn.classList.contains('btn-lock')) track.locked = !track.locked;
            this.renderer.syncTrack(track);
            this._fire('onTracksChanged');
        }

        _dblClick(e) {
            const clipEl = e.target.closest ? e.target.closest('.sequencer-clip') : null;
            if (clipEl) {
                const clip = this.state.getClip(clipEl.dataset.clipId);
                if (clip) this._fire('onOpenClip', clip);
                return;
            }
            const laneBody = e.target.closest ? e.target.closest('.sequencer-lane-body') : null;
            if (laneBody) {
                this._fire('onAddMarkerAt', this._timeAtX(e.clientX));
            }
        }

        _wheel(e) {
            const s = this.state;
            const scroll = this.renderer.el.scroll;
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                const rect = scroll.getBoundingClientRect();
                const cx = e.clientX - rect.left;
                const timelineCx = Math.max(0, cx - s.trackHeaderWidth);
                const anchorX = timelineCx + scroll.scrollLeft;
                const anchorT = anchorX / s.pixelsPerSecond;
                s.pixelsPerSecond = Math.max(8, Math.min(600, s.pixelsPerSecond * Math.pow(1.0015, -e.deltaY)));
                scroll.scrollLeft = Math.max(0, anchorT * s.pixelsPerSecond - timelineCx);
                s.scrollTime = scroll.scrollLeft / s.pixelsPerSecond;
                this.renderer.render();
                this._fire('onViewChanged');
                return;
            }
            if (e.shiftKey) return;
            e.preventDefault();
            scroll.scrollLeft += e.deltaY || e.deltaX;
            this.renderer.syncScrollFromElement();
            this.renderer.scheduleRulerUpdate();
        }

        _keyDown(e) {
            const s = this.state;
            const t = e.target;
            if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
            const key = e.key;
            const ctrl = e.ctrlKey || e.metaKey;
            if (key === 'Delete' || key === 'Backspace') {
                e.preventDefault();
                this._fire('onDelete');
            } else if (ctrl && key.toLowerCase() === 'd') {
                e.preventDefault();
                this._fire('onDuplicate');
            } else if (!ctrl && key.toLowerCase() === 's') {
                e.preventDefault();
                this._fire('onSplitAt', s.playhead);
            } else if (!ctrl && key.toLowerCase() === 'v') {
                e.preventDefault();
                this._fire('onTool', 'select');
            } else if (!ctrl && key.toLowerCase() === 'c') {
                e.preventDefault();
                this._fire('onTool', 'razor');
            } else if (key === ' ') {
                e.preventDefault();
                this._fire('onPlay');
            } else if (key === 'Home') {
                e.preventDefault();
                this._fire('onHome');
            } else if (key === 'End') {
                e.preventDefault();
                this._fire('onEnd');
            } else if (key === 'ArrowLeft' || key === 'ArrowRight') {
                e.preventDefault();
                const dir = key === 'ArrowRight' ? 1 : -1;
                const dt = e.shiftKey ? 1 : 1 / s.fps;
                s.selectedClips.forEach(c => {
                    c.start = Math.max(0, c.start + dir * dt);
                    this.renderer.updateClip(c);
                });
                this._fire('onClipsMoved');
            } else if (key === '+' || key === '=') {
                e.preventDefault();
                this._fire('onZoomIn');
            } else if (key === '-') {
                e.preventDefault();
                this._fire('onZoomOut');
            }
        }
    }

    window.SequencerInteraction = SequencerInteraction;
})();