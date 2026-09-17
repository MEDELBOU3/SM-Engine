/**
 * SequencerState.js — Pure data layer for the SM Engine video sequencer.
 *
 * Owns ALL editing data (tracks, clips, markers, playhead, selection, zoom,
 * scroll). No DOM, no rendering, no playback. Rendering/interaction/playback
 * read and mutate this state through SequencerManager so undo/redo and
 * serialization can be layered on later.
 *
 * Coordinate system (screen x is measured from the sequencer's content origin,
 * i.e. the left edge of the track-header column):
 *
 *   screenX = trackHeaderWidth + (time - scrollTime) * pixelsPerSecond
 *   time    = scrollTime + (mouseX - trackHeaderWidth) / pixelsPerSecond
 *
 * DOM content coordinates (inside the horizontally scrolling strip):
 *
 *   contentX = trackHeaderWidth + time * pixelsPerSecond
 */

class SequencerState {
    constructor() {
        this.fps = 30;
        this.pixelsPerSecond = 60;
        this.scrollTime = 0;
        this.trackHeaderWidth = 360;
        this.trackHeight = 38;
        this.rulerHeight = 30;
        this.workAreaStart = 0;
        this.workAreaEnd = 0;

        this.tracks = [];
        this.clips = [];
        this.markers = [];

        this.playhead = 0;
        this.selectedIds = [];

        this.activeTool = 'select';      // 'select' | 'razor'
        this.snapEnabled = true;
        this.showWaveforms = true;
        this.showThumbnails = true;

        this.playing = false;
        this.playbackRate = 1;

        this._idCounter = 1;
        this.defaultTimeline();
    }

    /* ─── Timeline structure ─────────────────────────────────────────── */
    defaultTimeline() {
        this.tracks = ['V4', 'V3', 'V2', 'V1', 'A2', 'A1'].map((name, index) => ({
            id: 'track-' + (index + 1),
            name,
            type: name.startsWith('A') ? 'audio' : 'video',
            order: index,
            muted: false,
            solo: false,
            locked: false,
            visible: true,
            color: null, // null = use roots.css video track color tokens
            mode: 'Normal',
            matte: 'None',
            parent: 'None'
        }));
        this.clips = [];
        this.markers = [];
        this.selectedIds = [];
        this.playhead = 0;
        this.scrollTime = 0;
    }

    nextId(prefix) {
        return (prefix || 'item') + '-' + (this._idCounter++);
    }

    getTrack(id) {
        return this.tracks.find(t => t.id === id) || null;
    }

    getClip(id) {
        return this.clips.find(c => c.id === id) || null;
    }

    videoTracks() {
        return this.tracks.filter(t => t.type === 'video').sort((a, b) => a.order - b.order);
    }

    audioTracks() {
        return this.tracks.filter(t => t.type === 'audio').sort((a, b) => a.order - b.order);
    }

    firstVideoTrack() {
        return this.videoTracks()[0] || null;
    }

    firstAudioTrack() {
        return this.audioTracks()[0] || null;
    }

    clipsOnTrack(trackId) {
        return this.clips.filter(c => c.trackId === trackId);
    }

    clipsAtTime(time, trackId) {
        return this.clips.filter(c =>
            (trackId === undefined || c.trackId === trackId) &&
            c.visible !== false &&
            time >= c.start && time < c.start + c.duration);
    }

    clipContaining(time) {
        return this.clips.find(c => time >= c.start && time < c.start + c.duration) || null;
    }

    maxEnd() {
        return this.clips.reduce((m, c) => Math.max(m, c.start + c.duration), 0);
    }

    /* ─── Clips ──────────────────────────────────────────────────────── */
    newClip(props) {
        const clip = {
            id: this.nextId('clip'),
            name: 'Clip',
            mediaType: 'solid',       // 'video' | 'image' | 'audio' | 'text' | 'solid'
            src: null,                // object URL / path for media clips
            trackId: this.firstVideoTrack()?.id || null,
            start: 0,
            duration: 2,
            sourceIn: 0,
            sourceOut: 2,
            opacity: 1,
            volume: 1,
            visible: true,
            muted: false,
            locked: false,
            blendMode: 'source-over',
            color: '#4778ff',
            text: null,               // text clip content
            x: null, y: null, w: null, h: null,   // canvas-space base rectangle (resolution px)
            scaleX: 1,
            scaleY: 1,
            rotation: 0,              // degrees
            anchorX: 0.5,             // normalized 0..1 inside layer bounds
            anchorY: 0.5,
            grade: {},                // color grade (VEA wheels/curves)
            curves: {},
            fx: {},
            audioPeaks: null,         // Float32Array of peak levels
            thumb: null,              // primary thumbnail
            thumbnails: [],           // sampled video thumbnails
            sourceDuration: 0,
            keyframeEnabled: {
                positionX: false,
                positionY: false,
                scaleX: false,
                scaleY: false,
                rotation: false,
                anchorX: false,
                anchorY: false,
                opacity: false,
                volume: false
            },
            keyframes: {
                positionX: [],
                positionY: [],
                scaleX: [],
                scaleY: [],
                rotation: [],
                anchorX: [],
                anchorY: [],
                opacity: [],
                volume: []
            },
            mediaWidth: 0,
            mediaHeight: 0,
            selected: false
        };
        return Object.assign(clip, props || {});
    }

    createClip(mediaType, opts) {
        const base = Object.assign({}, opts || {});
        let duration = base.duration;
        if (!duration || duration <= 0) {
            duration = (mediaType === 'text' || mediaType === 'solid') ? 5 : 4;
        }
        const clip = this.newClip(Object.assign({ mediaType, duration, sourceIn: base.sourceIn ?? 0, sourceOut: (base.sourceIn ?? 0) + duration }, base));
        clip.sourceOut = clip.sourceIn + clip.duration;
        this.ensureClipAnimationData(clip);
        this.clips.push(clip);
        return clip;
    }

    ensureClipAnimationData(clip) {
        if (!clip) return null;
        const channels = ['positionX','positionY','scaleX','scaleY','rotation','anchorX','anchorY','opacity','volume'];
        if (!clip.keyframeEnabled || typeof clip.keyframeEnabled !== 'object') clip.keyframeEnabled = {};
        if (!clip.keyframes || typeof clip.keyframes !== 'object') clip.keyframes = {};
        channels.forEach(channel => {
            if (typeof clip.keyframeEnabled[channel] !== 'boolean') clip.keyframeEnabled[channel] = false;
            if (!Array.isArray(clip.keyframes[channel])) clip.keyframes[channel] = [];
        });
        return clip;
    }

    removeClip(id) {
        const idx = this.clips.findIndex(c => c.id === id);
        if (idx === -1) return null;
        const removed = this.clips.splice(idx, 1)[0];
        this.selectedIds = this.selectedIds.filter(s => s !== id);
        return removed;
    }

    /* ─── Markers ────────────────────────────────────────────────────── */
    addMarker(time, name) {
        const marker = { id: this.nextId('marker'), time: Math.max(0, time), name: name || 'Marker', color: '#ffcc55' };
        this.markers.push(marker);
        return marker;
    }

    removeMarker(id) {
        const idx = this.markers.findIndex(m => m.id === id);
        if (idx === -1) return null;
        return this.markers.splice(idx, 1)[0];
    }

    /* ─── Selection ──────────────────────────────────────────────────── */
    selectClip(clip, additive) {
        if (!clip) { this.clearSelection(); return; }
        if (additive) {
            if (this.selectedIds.includes(clip.id)) {
                this.selectedIds = this.selectedIds.filter(s => s !== clip.id);
            } else {
                this.selectedIds.push(clip.id);
            }
        } else {
            this.selectedIds = [clip.id];
        }
        this.clips.forEach(c => c.selected = this.selectedIds.includes(c.id));
    }

    clearSelection() {
        this.selectedIds = [];
        this.clips.forEach(c => c.selected = false);
    }

    get selectedClips() {
        return this.selectedIds.map(id => this.getClip(id)).filter(Boolean);
    }

    get primarySelection() {
        const clip = this.getClip(this.selectedIds[this.selectedIds.length - 1]);
        return clip || null;
    }
}

/* ─── Pure coordinate + time helpers ────────────────────────────────── */
const SequencerMath = {
    timeToScreen(state, time) {
        return state.trackHeaderWidth + (time - state.scrollTime) * state.pixelsPerSecond;
    },

    screenToTime(state, screenX) {
        return state.scrollTime + (screenX - state.trackHeaderWidth) / state.pixelsPerSecond;
    },

    contentX(state, time) {
        return state.trackHeaderWidth + time * state.pixelsPerSecond;
    },

    timeAtContentX(state, contentX) {
        return (contentX - state.trackHeaderWidth) / state.pixelsPerSecond;
    },

    frameOf(state, time) {
        return Math.max(0, Math.round(time * state.fps));
    },

    timeAtFrame(state, frame) {
        return Math.max(0, frame / state.fps);
    },

    clampFrame(state, time) {
        return this.timeAtFrame(state, this.frameOf(state, time));
    },

    clamp(v, min, max) {
        return Math.min(max, Math.max(min, v));
    },

    timecode(time, fps) {
        const t = Math.max(0, time || 0);
        const frame = Math.round((t % 1) * (fps || 30));
        const seconds = Math.floor(t);
        const pad = n => String(n).padStart(2, '0');
        const hh = Math.floor(seconds / 3600);
        const mm = Math.floor((seconds % 3600) / 60);
        const ss = seconds % 60;
        const ff = pad(frame);
        return hh > 0
            ? `${pad(hh)}:${pad(mm)}:${pad(ss)}+${ff}`
            : `${pad(mm)}:${pad(ss)}+${ff}`;
    }
};

window.SequencerState = SequencerState;
window.SequencerMath = SequencerMath;