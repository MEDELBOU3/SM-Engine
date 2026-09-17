/**
 * SequencerState.js — PHASE 2
 * Project-backed timeline adapter for SM Engine Video Editing.
 *
 * IMPORTANT:
 * `window.videoProject.timeline` is now the real timeline data store.
 * SequencerRenderer / SequencerInteraction can keep using the old direct
 * properties (`state.clips`, `state.playhead`, etc.) because this class maps
 * those properties directly to VideoProjectState.
 *
 * This lets the existing editor continue working while Audio/Fusion/Color
 * read the exact same timeline.
 */
(function (global) {
    'use strict';

    class SequencerState {
        constructor(project = null) {
            this.project =
                project ||
                global.ensureVideoProjectState?.() ||
                global.videoProject ||
                null;

            this._idCounter = 1;

            // Fallback storage keeps this class usable even if ProjectState
            // was not loaded yet. In the recommended load order it is loaded.
            this._fallback = {
                fps: 30,
                pixelsPerSecond: 60,
                scrollTime: 0,
                trackHeaderWidth: 390,
                trackHeight: 44,
                rulerHeight: 34,
                workAreaStart: 0,
                workAreaEnd: 0,
                tracks: [],
                clips: [],
                markers: [],
                playhead: 0,
                selectedIds: [],
                activeTool: 'select',
                snapEnabled: true,
                showWaveforms: true,
                showThumbnails: true,
                playing: false,
                playbackRate: 1
            };

            this._installProjectBackedProperties();
            this._ensureTimelineShape();
        }

        /* ==============================================================
           PROJECT-BACKED PROPERTY MAP
           ============================================================== */

        _installProjectBackedProperties() {
            const descriptors = {
                fps: {
                    get: () => this.project?.settings?.fps ?? this._fallback.fps,
                    set: value => {
                        const v = Math.max(1, Number(value || 30));
                        if (this.project) this.project.state.settings.fps = v;
                        else this._fallback.fps = v;
                    }
                },

                pixelsPerSecond: this._timelineProperty('pixelsPerSecond', 60, value =>
                    Math.max(8, Number(value || 60))
                ),

                scrollTime: this._timelineProperty('scrollTime', 0, value =>
                    Math.max(0, Number(value || 0))
                ),

                trackHeaderWidth: this._timelineProperty('trackHeaderWidth', 390, value =>
                    Math.max(60, Number(value || 390))
                ),

                trackHeight: this._timelineProperty('trackHeight', 44, value =>
                    Math.max(20, Number(value || 44))
                ),

                rulerHeight: this._timelineProperty('rulerHeight', 34, value =>
                    Math.max(20, Number(value || 34))
                ),

                workAreaStart: this._timelineProperty('workAreaStart', 0, value =>
                    Math.max(0, Number(value || 0))
                ),

                workAreaEnd: this._timelineProperty('workAreaEnd', 0, value =>
                    Math.max(0, Number(value || 0))
                ),

                // Compatibility with older history/export code.
                workStart: {
                    get: () => this.workAreaStart,
                    set: value => { this.workAreaStart = value; }
                },

                workEnd: {
                    get: () => this.workAreaEnd,
                    set: value => { this.workAreaEnd = value; }
                },

                tracks: this._timelineArrayProperty('tracks'),
                clips: this._timelineArrayProperty('clips'),
                markers: this._timelineArrayProperty('markers'),

                playhead: this._timelineProperty('playhead', 0, value =>
                    Math.max(0, Number(value || 0))
                ),

                selectedIds: this._timelineArrayProperty('selectedIds'),

                activeTool: {
                    get: () => {
                        if (this.project) {
                            return this.project.timeline.activeTool ||
                                this.project.edit?.activeTool ||
                                'select';
                        }
                        return this._fallback.activeTool;
                    },
                    set: value => {
                        const tool = String(value || 'select');
                        if (this.project) {
                            this.project.state.timeline.activeTool = tool;
                            if (this.project.state.edit) {
                                this.project.state.edit.activeTool = tool;
                            }
                        } else {
                            this._fallback.activeTool = tool;
                        }
                    }
                },

                snapEnabled: this._timelineProperty('snapEnabled', true, value => value !== false),
                showWaveforms: this._timelineProperty('showWaveforms', true, value => value !== false),
                showThumbnails: this._timelineProperty('showThumbnails', true, value => value !== false),
                playing: this._timelineProperty('playing', false, value => !!value),
                playbackRate: this._timelineProperty('playbackRate', 1, value =>
                    Math.max(0.01, Number(value || 1))
                )
            };

            Object.defineProperties(this, Object.fromEntries(
                Object.entries(descriptors).map(([name, descriptor]) => [
                    name,
                    {
                        configurable: true,
                        enumerable: true,
                        ...descriptor
                    }
                ])
            ));
        }

        _timelineProperty(key, fallback, normalize = value => value) {
            return {
                get: () => {
                    if (this.project?.timeline && this.project.timeline[key] !== undefined) {
                        return this.project.timeline[key];
                    }
                    return this._fallback[key] ?? fallback;
                },
                set: value => {
                    const normalized = normalize(value);
                    if (this.project?.timeline) {
                        this.project.state.timeline[key] = normalized;
                    } else {
                        this._fallback[key] = normalized;
                    }
                }
            };
        }

        _timelineArrayProperty(key) {
            return {
                get: () => {
                    if (this.project?.timeline) {
                        if (!Array.isArray(this.project.state.timeline[key])) {
                            this.project.state.timeline[key] = [];
                        }
                        return this.project.state.timeline[key];
                    }
                    if (!Array.isArray(this._fallback[key])) this._fallback[key] = [];
                    return this._fallback[key];
                },
                set: value => {
                    const arr = Array.isArray(value) ? value : [];
                    if (this.project?.timeline) this.project.state.timeline[key] = arr;
                    else this._fallback[key] = arr;
                }
            };
        }

        _ensureTimelineShape() {
            if (this.project?.timeline) {
                const timeline = this.project.state.timeline;

                if (!Array.isArray(timeline.tracks) || !timeline.tracks.length) {
                    timeline.tracks = this._createDefaultTracks();
                }

                if (!Array.isArray(timeline.clips)) timeline.clips = [];
                if (!Array.isArray(timeline.markers)) timeline.markers = [];
                if (!Array.isArray(timeline.selectedIds)) timeline.selectedIds = [];

                timeline.trackHeaderWidth ??= 390;
                timeline.trackHeight ??= 44;
                timeline.rulerHeight ??= 34;
                timeline.workAreaStart ??= 0;
                timeline.workAreaEnd ??= 0;
                timeline.activeTool ??= 'select';
                timeline.snapEnabled ??= true;
                timeline.showWaveforms ??= true;
                timeline.showThumbnails ??= true;
                timeline.playbackRate ??= 1;
                timeline.playing = false;

                this.fps = this.project.settings?.fps || 30;
                this._syncSelectionFlags();
                return;
            }

            if (!this.tracks.length) this.defaultTimeline();
        }

        /* ==============================================================
           CHANGE NOTIFICATION
           ============================================================== */

        notify(path, detail = {}, options = {}) {
            if (!this.project?.touch) return;

            this.project.touch(path, detail, {
                dirty: options.dirty !== false,
                autosave: options.autosave !== false,
                silent: options.silent === true
            });
        }

        notifyClipsChanged(reason = 'edit') {
            this.notify('timeline.clips', { reason });
        }

        notifyTracksChanged(reason = 'edit') {
            this.notify('timeline.tracks', { reason });
        }

        notifyViewChanged() {
            this.notify('timeline.view', {
                pixelsPerSecond: this.pixelsPerSecond,
                scrollTime: this.scrollTime
            }, { dirty: false });
        }

        /* ==============================================================
           TIMELINE STRUCTURE
           ============================================================== */

        defaultTimeline(options = {}) {
            this.tracks = this._createDefaultTracks();
            this.clips = [];
            this.markers = [];
            this.selectedIds = [];
            this.playhead = 0;
            this.scrollTime = 0;
            this.workAreaStart = 0;
            this.workAreaEnd = 0;

            this.notify('timeline.reset', {}, {
                dirty: options.dirty === true
            });
        }

        _createDefaultTracks() {
            return ['V4', 'V3', 'V2', 'V1', 'A2', 'A1'].map((name, index) => ({
                id: 'track-' + (index + 1),
                name,
                type: name.startsWith('A') ? 'audio' : 'video',
                order: index,
                muted: false,
                solo: false,
                locked: false,
                visible: true,
                color: null,
                mode: 'Normal',
                matte: 'None',
                parent: 'None',
                gain: 1,
                pan: 0,
                effects: []
            }));
        }

        nextId(prefix = 'item') {
            if (this.project?.makeId) return this.project.makeId(prefix);
            return `${prefix}-${this._idCounter++}`;
        }

        getTrack(id) {
            return this.tracks.find(track => track.id === id) || null;
        }

        getClip(id) {
            return this.clips.find(clip => clip.id === id) || null;
        }

        videoTracks() {
            return this.tracks
                .filter(track => track.type === 'video')
                .sort((a, b) => a.order - b.order);
        }

        audioTracks() {
            return this.tracks
                .filter(track => track.type === 'audio')
                .sort((a, b) => a.order - b.order);
        }

        firstVideoTrack() {
            return this.videoTracks()[0] || null;
        }

        firstAudioTrack() {
            return this.audioTracks()[0] || null;
        }

        clipsOnTrack(trackId) {
            return this.clips.filter(clip => clip.trackId === trackId);
        }

        clipsAtTime(time, trackId) {
            const t = Math.max(0, Number(time || 0));
            return this.clips.filter(clip =>
                (trackId === undefined || clip.trackId === trackId) &&
                clip.visible !== false &&
                t >= clip.start &&
                t < clip.start + clip.duration
            );
        }

        clipContaining(time) {
            const t = Math.max(0, Number(time || 0));
            return this.clips.find(
                clip => t >= clip.start && t < clip.start + clip.duration
            ) || null;
        }

        maxEnd() {
            return this.clips.reduce(
                (max, clip) => Math.max(max, Number(clip.start || 0) + Number(clip.duration || 0)),
                0
            );
        }

        /* ==============================================================
           CLIPS
           ============================================================== */

        newClip(props = {}) {
            const fps = Math.max(1, Number(this.fps || 30));
            const minDuration = 1 / fps;
            const mediaType = props.mediaType || props.type || 'solid';
            const duration = Math.max(
                minDuration,
                Number(
                    props.duration ??
                    ((mediaType === 'text' || mediaType === 'solid') ? 5 : 4)
                )
            );
            const sourceIn = Math.max(0, Number(props.sourceIn || 0));

            const clip = {
                id: props.id || this.nextId('clip'),
                name: props.name || 'Clip',
                mediaType,
                src: props.src || null,
                mediaRef: props.mediaRef || null,
                sourceMediaId: props.sourceMediaId || null,
                trackId:
                    props.trackId ||
                    (mediaType === 'audio'
                        ? this.firstAudioTrack()?.id
                        : this.firstVideoTrack()?.id) ||
                    null,
                start: Math.max(0, Number(props.start || 0)),
                duration,
                sourceIn,
                sourceOut: Math.max(
                    sourceIn,
                    Number(props.sourceOut ?? (sourceIn + duration))
                ),
                sourceDuration: Math.max(0, Number(props.sourceDuration || 0)),
                playbackRate: Math.max(0.001, Number(props.playbackRate || 1)),
                opacity: Number.isFinite(Number(props.opacity)) ? Number(props.opacity) : 1,
                volume: Number.isFinite(Number(props.volume)) ? Number(props.volume) : 1,
                visible: props.visible !== false,
                muted: !!props.muted,
                locked: !!props.locked,
                blendMode: props.blendMode || 'source-over',
                color: props.color ?? '#4778ff',
                text: props.text ?? null,
                x: props.x ?? null,
                y: props.y ?? null,
                w: props.w ?? null,
                h: props.h ?? null,
                scaleX: Number.isFinite(Number(props.scaleX)) ? Number(props.scaleX) : 1,
                scaleY: Number.isFinite(Number(props.scaleY)) ? Number(props.scaleY) : 1,
                rotation: Number(props.rotation || 0),
                anchorX: Number.isFinite(Number(props.anchorX)) ? Number(props.anchorX) : 0.5,
                anchorY: Number.isFinite(Number(props.anchorY)) ? Number(props.anchorY) : 0.5,
                grade: this._clone(props.grade || {}),
                curves: this._clone(props.curves || {}),
                fx: this._clone(props.fx || {}),
                effects: this._clone(props.effects || []),
                transitions: this._clone(props.transitions || { in: null, out: null }),
                audioPeaks: props.audioPeaks
                    ? (ArrayBuffer.isView(props.audioPeaks) ? Array.from(props.audioPeaks) : this._clone(props.audioPeaks))
                    : null,
                thumb: props.thumb || null,
                thumbnails: Array.isArray(props.thumbnails) ? props.thumbnails.slice() : [],
                mediaWidth: Math.max(0, Number(props.mediaWidth || 0)),
                mediaHeight: Math.max(0, Number(props.mediaHeight || 0)),
                keyframeEnabled: this._clone(props.keyframeEnabled || {}),
                keyframes: this._normalizeKeyframes(props.keyframes),
                selected: !!props.selected,
                metadata: this._clone(props.metadata || {})
            };

            return clip;
        }

        createClip(mediaType, options = {}) {
            const clip = this.newClip({
                ...options,
                mediaType
            });

            if (options.start == null) clip.start = this.playhead;

            this.clips.push(clip);
            this.notify('timeline.clip.added', {
                clipId: clip.id,
                mediaType: clip.mediaType
            });
            return clip;
        }

        removeClip(id) {
            const index = this.clips.findIndex(clip => clip.id === id);
            if (index < 0) return null;

            const [removed] = this.clips.splice(index, 1);
            this.selectedIds = this.selectedIds.filter(selectedId => selectedId !== id);
            this._syncSelectionFlags();

            this.notify('timeline.clip.removed', {
                clipId: id
            });

            return removed;
        }

        /* ==============================================================
           MARKERS
           ============================================================== */

        addMarker(time, name = 'Marker') {
            if (this.project?.addMarker) {
                return this.project.addMarker(time, name);
            }

            const marker = {
                id: this.nextId('marker'),
                time: Math.max(0, Number(time || 0)),
                name,
                color: '#ffcc55'
            };

            this.markers.push(marker);
            return marker;
        }

        removeMarker(id) {
            if (this.project?.removeMarker) {
                return this.project.removeMarker(id);
            }

            const index = this.markers.findIndex(marker => marker.id === id);
            if (index < 0) return null;
            return this.markers.splice(index, 1)[0];
        }

        /* ==============================================================
           SELECTION
           ============================================================== */

        selectClip(clip, additive = false) {
            if (!clip) {
                this.clearSelection();
                return;
            }

            let next;

            if (additive) {
                next = this.selectedIds.slice();

                if (next.includes(clip.id)) {
                    next = next.filter(id => id !== clip.id);
                } else {
                    next.push(clip.id);
                }
            } else {
                next = [clip.id];
            }

            this._setSelection(next);
        }

        clearSelection() {
            this._setSelection([]);
        }

        _setSelection(ids) {
            const valid = Array.from(new Set(ids))
                .filter(id => !!this.getClip(id));

            if (this.project?.setTimelineSelection) {
                this.project.setTimelineSelection(valid, {
                    dirty: false,
                    autosave: false
                });
            } else {
                this.selectedIds = valid;
                this._syncSelectionFlags();
            }
        }

        _syncSelectionFlags() {
            const selected = new Set(this.selectedIds);
            this.clips.forEach(clip => {
                clip.selected = selected.has(clip.id);
            });
        }

        get selectedClips() {
            return this.selectedIds
                .map(id => this.getClip(id))
                .filter(Boolean);
        }

        get primarySelection() {
            return this.getClip(this.selectedIds[this.selectedIds.length - 1]) || null;
        }

        /* ==============================================================
           HELPERS
           ============================================================== */

        _normalizeKeyframes(source) {
            const result = this._clone(source || {});
            ['positionX','positionY','scaleX','scaleY','rotation','anchorX','anchorY','opacity','volume']
                .forEach(channel => {
                    if (!Array.isArray(result[channel])) result[channel] = [];
                });
            return result;
        }

        _clone(value) {
            if (value == null) return value;
            if (ArrayBuffer.isView(value)) return Array.from(value);
            if (global.structuredClone) {
                try { return global.structuredClone(value); } catch (_) {}
            }
            return JSON.parse(JSON.stringify(value));
        }
    }

    /* ==============================================================
       PURE COORDINATE + TIME HELPERS
       ============================================================== */

    const SequencerMath = {
        timeToScreen(state, time) {
            return state.trackHeaderWidth +
                (time - state.scrollTime) *
                state.pixelsPerSecond;
        },

        screenToTime(state, screenX) {
            return state.scrollTime +
                (screenX - state.trackHeaderWidth) /
                state.pixelsPerSecond;
        },

        contentX(state, time) {
            return state.trackHeaderWidth +
                time *
                state.pixelsPerSecond;
        },

        timeAtContentX(state, contentX) {
            return (contentX - state.trackHeaderWidth) /
                state.pixelsPerSecond;
        },

        frameOf(state, time) {
            return Math.max(0, Math.round(time * state.fps));
        },

        timeAtFrame(state, frame) {
            return Math.max(0, frame / state.fps);
        },

        clampFrame(state, time) {
            return this.timeAtFrame(
                state,
                this.frameOf(state, time)
            );
        },

        clamp(value, min, max) {
            return Math.min(max, Math.max(min, value));
        },

        timecode(time, fps) {
            const t = Math.max(0, time || 0);
            const safeFps = Math.max(1, Number(fps || 30));
            let frame = Math.floor((t % 1) * safeFps);

            if (frame >= safeFps) frame = safeFps - 1;

            const seconds = Math.floor(t);
            const pad = number => String(number).padStart(2, '0');
            const hh = Math.floor(seconds / 3600);
            const mm = Math.floor((seconds % 3600) / 60);
            const ss = seconds % 60;
            const ff = pad(frame);

            return hh > 0
                ? `${pad(hh)}:${pad(mm)}:${pad(ss)}+${ff}`
                : `${pad(mm)}:${pad(ss)}+${ff}`;
        }
    };

    global.SequencerState = SequencerState;
    global.SequencerMath = SequencerMath;

})(window);