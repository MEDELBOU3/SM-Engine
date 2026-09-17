/**
 * VideoProjectState.js
 * SM Engine — canonical project state for the complete Video Editing system.
 *
 * Shared by Edit / Sequencer / Media / Audio / Fusion / Color / Deliver.
 * Phase 1 is non-destructive: current runtime managers keep working while
 * this file provides the project model + a compatibility bridge.
 */
(function (global) {
    'use strict';
    const SCHEMA_VERSION = 1;
    const DEFAULT_FPS = 30;
    const DEFAULT_WIDTH = 1280;
    const DEFAULT_HEIGHT = 720;
    const AUTOSAVE_KEY = 'sm-engine.video-project.autosave.v1';
    const nowISO = () => new Date().toISOString();
    const isPlainObject = value => {
        if (!value || typeof value !== 'object') return false;
        const proto = Object.getPrototypeOf(value);
        return proto === Object.prototype || proto === null;
    };
    class VideoProjectState {
        constructor(options = {}) {
            this._listeners = new Map();
            this._wildcardListeners = new Set();
            this._transaction = null;
            this._transactionDepth = 0;
            this._dirty = false;
            this._revision = 0;
            this._autosaveTimer = 0;
            this._autosaveDelay = 1200;
            this._autosaveKey = AUTOSAVE_KEY;
            this._autosaveEnabled = false;
            this._legacyBindingsInstalled = false;
            this._legacyHandlers = [];
            this._legacy = { manager: null, sequencer: null, mediaPool: null };
            this.state = this._createDefaultProject(options);
        }
        get schemaVersion() { return this.state.schemaVersion; }
        get project() { return this.state.project; }
        get settings() { return this.state.settings; }
        get media() { return this.state.media; }
        get edit() { return this.state.edit; }
        get timeline() { return this.state.timeline; }
        get audio() { return this.state.audio; }
        get color() { return this.state.color; }
        get fusion() { return this.state.fusion; }
        get exportSettings() { return this.state.export; }
        get workspace() { return this.state.workspace; }
        get selection() { return this.state.selection; }
        get dirty() { return this._dirty; }
        get revision() { return this._revision; }
        _createDefaultProject(options = {}) {
            const created = nowISO();
            const width = Math.max(1, Number(options.width || DEFAULT_WIDTH));
            const height = Math.max(1, Number(options.height || DEFAULT_HEIGHT));
            const fps = Math.max(1, Number(options.fps || DEFAULT_FPS));
            return {
                schemaVersion: SCHEMA_VERSION,
                project: {
                    id: options.id || this.makeId('project'),
                    name: options.name || 'Untitled Video Project',
                    createdAt: created,
                    modifiedAt: created,
                    application: 'SM Engine',
                    notes: '',
                    tags: []
                },
                settings: {
                    resolution: { w: width, h: height },
                    fps,
                    pixelAspect: 1,
                    background: 'transparent',
                    colorSpace: 'sRGB',
                    workingColorSpace: 'sRGB',
                    sampleRate: 48000,
                    audioChannels: 2
                },
                media: [],
                edit: {
                    canvasItems: [],
                    activeTool: 'select',
                    inspectorPanel: 'clip',
                    viewer: {
                        zoom: 1,
                        fitMode: true,
                        panX: 0,
                        panY: 0,
                        showCenterGuides: false,
                        showSafeAreas: false,
                        showGrid: false,
                        showThirds: false,
                        snapEnabled: true
                    }
                },
                timeline: {
                    tracks: this._defaultTracks(),
                    clips: [],
                    markers: [],
                    playhead: 0,
                    selectedIds: [],
                    playbackRate: 1,
                    playing: false,
                    workAreaStart: 0,
                    workAreaEnd: 0,
                    pixelsPerSecond: 60,
                    scrollTime: 0,
                    activeTool: 'select',
                    trackHeaderWidth: 390,
                    trackHeight: 44,
                    rulerHeight: 34,
                    snapEnabled: true,
                    showWaveforms: true,
                    showThumbnails: true
                },
                audio: {
                    master: { gain: 1, muted: false, limiterEnabled: true },
                    buses: [{ id: 'master', name: 'Master', type: 'master', gain: 1, pan: 0, muted: false, solo: false, effects: [] }],
                    trackStates: {},
                    monitoring: { enabled: true, peakHoldMs: 900 }
                },
                color: {
                    enabled: true,
                    globalGrade: this._defaultGrade(),
                    clips: {},
                    scopes: { waveform: true, vectorscope: false, histogram: false, parade: false }
                },
                fusion: {
                    activeGraphId: null,
                    graphs: {},
                    settings: { cacheEnabled: true, previewQuality: 'full' }
                },
                export: {
                    format: 'webm',
                    codec: 'vp9',
                    width,
                    height,
                    fps,
                    videoBitrate: 8000000,
                    audioBitrate: 192000,
                    includeAudio: true,
                    range: 'timeline',
                    fileName: 'SM-Engine-Render',
                    queue: []
                },
                workspace: {
                    active: 'edit',
                    previous: null,
                    perWorkspace: { edit: {}, fusion: {}, color: {}, audio: {}, deliver: {} }
                },
                selection: {
                    mediaId: null,
                    clipIds: [],
                    primaryClipId: null,
                    canvasItemId: null,
                    nodeIds: [],
                    audioTrackId: null
                },
                runtimeHints: { requiresMediaRelink: false, lastWorkspace: 'edit' }
            };
        }
        _defaultTracks() {
            return ['V4', 'V3', 'V2', 'V1', 'A2', 'A1'].map((name, index) => ({
                id: `track-${index + 1}`,
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
        _defaultGrade() {
            return {
                exposure: 0,
                contrast: 1,
                saturation: 1,
                temperature: 0,
                tint: 0,
                lift: [0, 0, 0],
                gamma: [1, 1, 1],
                gain: [1, 1, 1],
                offset: [0, 0, 0],
                curves: {},
                lut: null
            };
        }
        createProject(options = {}) {
            this.state = this._createDefaultProject(options);
            this._dirty = false;
            this._revision = 0;
            this._emit('project:created', { project: this.snapshot() });
            return this.state;
        }
        reset(options = {}) { return this.createProject(options); }
        renameProject(name) {
            const clean = String(name || '').trim();
            if (!clean) return false;
            this.state.project.name = clean;
            this.touch('project.name', { value: clean });
            return true;
        }
        makeId(prefix = 'id') {
            if (global.crypto?.randomUUID) return `${prefix}-${global.crypto.randomUUID()}`;
            return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        }
        subscribe(path, callback) {
            if (typeof callback !== 'function') return () => {};
            const key = String(path || '*');
            if (key === '*') {
                this._wildcardListeners.add(callback);
                return () => this._wildcardListeners.delete(callback);
            }
            if (!this._listeners.has(key)) this._listeners.set(key, new Set());
            const set = this._listeners.get(key);
            set.add(callback);
            return () => {
                set.delete(callback);
                if (!set.size) this._listeners.delete(key);
            };
        }
        _emit(path, detail = {}) {
            const event = { path, detail, revision: this._revision, project: this, timestamp: global.performance?.now?.() ?? Date.now() };
            this._listeners.get(path)?.forEach(fn => {
                try { fn(event); } catch (error) { console.error('[VideoProjectState] listener error:', error); }
            });
            for (const [key, listeners] of this._listeners.entries()) {
                if (!key.endsWith('.*')) continue;
                const prefix = key.slice(0, -1);
                if (!path.startsWith(prefix)) continue;
                listeners.forEach(fn => {
                    try { fn(event); } catch (error) { console.error('[VideoProjectState] listener error:', error); }
                });
            }
            this._wildcardListeners.forEach(fn => {
                try { fn(event); } catch (error) { console.error('[VideoProjectState] wildcard listener error:', error); }
            });
            try { global.dispatchEvent(new CustomEvent('videoProjectChanged', { detail: event })); } catch (_) {}
        }
        touch(path = 'project', detail = {}, options = {}) {
            this._revision += 1;
            this.state.project.modifiedAt = nowISO();
            if (options.dirty !== false) this._dirty = true;
            if (this._transaction) {
                this._transaction.paths.add(path);
                this._transaction.events.push({ path, detail });
            } else if (options.silent !== true) {
                this._emit(path, detail);
            }
            if (this._autosaveEnabled && options.autosave !== false) this._scheduleAutosave();
        }
        markClean() {
            this._dirty = false;
            this._emit('project:clean', {});
        }
        beginTransaction(label = 'Video Project Change') {
            if (this._transactionDepth === 0) {
                this._transaction = { label, before: this.snapshot(), paths: new Set(), events: [] };
            }
            this._transactionDepth += 1;
            return this._transaction;
        }
        commitTransaction() {
            if (!this._transactionDepth) return false;
            this._transactionDepth -= 1;
            if (this._transactionDepth > 0) return true;
            const tx = this._transaction;
            this._transaction = null;
            if (!tx) return false;
            this._emit('transaction:commit', { label: tx.label, paths: Array.from(tx.paths), events: tx.events });
            return true;
        }
        rollbackTransaction() {
            const tx = this._transaction;
            this._transaction = null;
            this._transactionDepth = 0;
            if (!tx) return false;
            this.loadProject(tx.before, { silent: true, markClean: false });
            this._emit('transaction:rollback', { label: tx.label });
            return true;
        }
        transaction(label, mutator) {
            this.beginTransaction(label);
            try {
                const result = mutator?.(this);
                if (result && typeof result.then === 'function') {
                    return result.then(value => { this.commitTransaction(); return value; }).catch(error => { this.rollbackTransaction(); throw error; });
                }
                this.commitTransaction();
                return result;
            } catch (error) {
                this.rollbackTransaction();
                throw error;
            }
        }
        get(path, fallback = undefined) {
            if (!path) return this.state;
            const parts = Array.isArray(path) ? path : String(path).split('.').filter(Boolean);
            let node = this.state;
            for (const part of parts) {
                if (node == null || !(part in Object(node))) return fallback;
                node = node[part];
            }
            return node;
        }
        set(path, value, options = {}) {
            const parts = Array.isArray(path) ? path.slice() : String(path).split('.').filter(Boolean);
            if (!parts.length) return false;
            let node = this.state;
            while (parts.length > 1) {
                const key = parts.shift();
                if (!isPlainObject(node[key]) && !Array.isArray(node[key])) node[key] = {};
                node = node[key];
            }
            node[parts[0]] = value;
            this.touch(String(path), { value }, options);
            return true;
        }
        patch(path, partial, options = {}) {
            const target = this.get(path);
            if (!isPlainObject(target) || !isPlainObject(partial)) return false;
            Object.assign(target, partial);
            this.touch(path, { patch: this._clone(partial) }, options);
            return true;
        }
        addMedia(entry = {}, options = {}) {
            const media = this._normalizeMedia(entry);
            const existing = this.state.media.find(m => m.id === media.id);
            if (existing) {
                Object.assign(existing, media);
                this.touch('media.updated', { media: this._clone(existing) }, options);
                return existing;
            }
            this.state.media.push(media);
            this.touch('media.added', { media: this._clone(media) }, options);
            return media;
        }
        updateMedia(id, patch = {}, options = {}) {
            const media = this.getMedia(id);
            if (!media) return null;
            Object.assign(media, this._cleanRuntimeValues(patch));
            this._refreshMediaPersistence(media);
            this.touch('media.updated', { id, patch: this._clone(patch) }, options);
            return media;
        }
        removeMedia(id, options = {}) {
            const index = this.state.media.findIndex(m => m.id === id);
            if (index < 0) return null;
            const [removed] = this.state.media.splice(index, 1);
            if (options.removeClips === true) this.state.timeline.clips = this.state.timeline.clips.filter(c => c.sourceMediaId !== id);
            if (this.state.selection.mediaId === id) this.state.selection.mediaId = null;
            this.touch('media.removed', { media: this._clone(removed) }, options);
            return removed;
        }
        getMedia(id) { return this.state.media.find(m => m.id === id) || null; }
        _normalizeMedia(entry = {}) {
            const clean = this._cleanRuntimeValues(entry);
            const media = {
                id: clean.id || this.makeId('media'),
                name: clean.name || 'Media',
                mediaType: clean.mediaType || 'unknown',
                type: 'media',
                mimeType: clean.mimeType || '',
                src: clean.src || '',
                duration: Math.max(0, Number(clean.duration || 0)),
                mediaWidth: Math.max(0, Number(clean.mediaWidth || 0)),
                mediaHeight: Math.max(0, Number(clean.mediaHeight || 0)),
                thumb: clean.thumb || null,
                thumbnails: Array.isArray(clean.thumbnails) ? clean.thumbnails.slice() : [],
                audioPeaks: clean.audioPeaks ? this._serializableArray(clean.audioPeaks) : null,
                status: clean.status || 'ready',
                codecWarning: clean.codecWarning || null,
                metadata: isPlainObject(clean.metadata) ? clean.metadata : {},
                createdAt: clean.createdAt || nowISO(),
                persistence: clean.persistence || {}
            };
            this._refreshMediaPersistence(media);
            return media;
        }
        _refreshMediaPersistence(media) {
            const transient = /^(blob:|data:)/i.test(media.src || '');
            media.persistence = { ...media.persistence, sourceKind: transient ? 'session-url' : (media.src ? 'url' : 'missing'), requiresRelink: transient || !media.src };
            this.state.runtimeHints.requiresMediaRelink = this.state.media.some(m => m.persistence?.requiresRelink);
        }
        addTrack(data = {}, options = {}) {
            const type = data.type === 'audio' ? 'audio' : 'video';
            const track = {
                id: data.id || this.makeId('track'),
                name: data.name || (type === 'audio' ? 'Audio' : 'Video'),
                type,
                order: Number.isFinite(Number(data.order)) ? Number(data.order) : this.state.timeline.tracks.length,
                muted: !!data.muted,
                solo: !!data.solo,
                locked: !!data.locked,
                visible: data.visible !== false,
                color: data.color ?? null,
                mode: data.mode || 'Normal',
                matte: data.matte || 'None',
                parent: data.parent || 'None',
                gain: Number.isFinite(Number(data.gain)) ? Number(data.gain) : 1,
                pan: Number.isFinite(Number(data.pan)) ? Number(data.pan) : 0,
                effects: Array.isArray(data.effects) ? this._clone(data.effects) : []
            };
            this.state.timeline.tracks.push(track);
            this._sortTracks();
            this.touch('timeline.track.added', { track: this._clone(track) }, options);
            return track;
        }
        updateTrack(id, patch = {}, options = {}) {
            const track = this.getTrack(id);
            if (!track) return null;
            Object.assign(track, this._cleanRuntimeValues(patch));
            this._sortTracks();
            this.touch('timeline.track.updated', { id, patch: this._clone(patch) }, options);
            return track;
        }
        removeTrack(id, options = {}) {
            const index = this.state.timeline.tracks.findIndex(t => t.id === id);
            if (index < 0) return null;
            const [track] = this.state.timeline.tracks.splice(index, 1);
            if (options.removeClips !== false) {
                const clipIds = this.state.timeline.clips.filter(c => c.trackId === id).map(c => c.id);
                this.state.timeline.clips = this.state.timeline.clips.filter(c => c.trackId !== id);
                this.state.timeline.selectedIds = this.state.timeline.selectedIds.filter(id2 => !clipIds.includes(id2));
            }
            this.touch('timeline.track.removed', { track: this._clone(track) }, options);
            return track;
        }
        getTrack(id) { return this.state.timeline.tracks.find(t => t.id === id) || null; }
        addClip(data = {}, options = {}) {
            const clip = this._normalizeClip(data);
            if (!clip.trackId) {
                const track = this.state.timeline.tracks.find(t => t.type === (clip.mediaType === 'audio' ? 'audio' : 'video'));
                clip.trackId = track?.id || null;
            }
            this.state.timeline.clips.push(clip);
            this.touch('timeline.clip.added', { clip: this._clone(clip) }, options);
            return clip;
        }
        updateClip(id, patch = {}, options = {}) {
            const clip = this.getClip(id);
            if (!clip) return null;
            Object.assign(clip, this._cleanRuntimeValues(patch));
            clip.start = Math.max(0, Number(clip.start || 0));
            clip.duration = Math.max(1 / this.state.settings.fps, Number(clip.duration || 0));
            clip.sourceIn = Math.max(0, Number(clip.sourceIn || 0));
            clip.sourceOut = Math.max(clip.sourceIn, Number(clip.sourceOut ?? (clip.sourceIn + clip.duration)));
            this.touch('timeline.clip.updated', { id, patch: this._clone(patch) }, options);
            return clip;
        }
        removeClip(id, options = {}) {
            const index = this.state.timeline.clips.findIndex(c => c.id === id);
            if (index < 0) return null;
            const [clip] = this.state.timeline.clips.splice(index, 1);
            this.state.timeline.selectedIds = this.state.timeline.selectedIds.filter(x => x !== id);
            this.state.selection.clipIds = this.state.selection.clipIds.filter(x => x !== id);
            if (this.state.selection.primaryClipId === id) this.state.selection.primaryClipId = null;
            this.touch('timeline.clip.removed', { clip: this._clone(clip) }, options);
            return clip;
        }
        getClip(id) { return this.state.timeline.clips.find(c => c.id === id) || null; }
        clipsOnTrack(trackId) { return this.state.timeline.clips.filter(c => c.trackId === trackId); }
        clipsAtTime(time) {
            const t = Math.max(0, Number(time || 0));
            return this.state.timeline.clips.filter(c => c.visible !== false && t >= c.start && t < c.start + c.duration);
        }
        maxEnd() { return this.state.timeline.clips.reduce((max, clip) => Math.max(max, Number(clip.start || 0) + Number(clip.duration || 0)), 0); }
        setPlayhead(time, options = {}) {
            const fps = this.state.settings.fps || DEFAULT_FPS;
            let value = Math.max(0, Number(time || 0));
            if (options.snapToFrame === true) value = Math.round(value * fps) / fps;
            this.state.timeline.playhead = value;
            this.touch('timeline.playhead', { time: value }, { ...options, dirty: options.dirty ?? false });
            return value;
        }
        setTimelineSelection(ids = [], options = {}) {
            const valid = Array.from(new Set(ids)).filter(id => !!this.getClip(id));
            this.state.timeline.selectedIds = valid;
            this.state.selection.clipIds = valid.slice();
            this.state.selection.primaryClipId = valid.at(-1) || null;
            this.state.timeline.clips.forEach(c => c.selected = valid.includes(c.id));
            this.touch('selection.clips', { ids: valid.slice() }, { ...options, dirty: options.dirty ?? false });
            return valid;
        }
        _normalizeClip(data = {}) {
            const fps = Math.max(1, Number(this.state.settings.fps || DEFAULT_FPS));
            const minDuration = 1 / fps;
            const mediaType = data.mediaType || data.type || 'video';
            const duration = Math.max(minDuration, Number(data.duration || 4));
            const sourceIn = Math.max(0, Number(data.sourceIn || 0));
            const channels = ['positionX','positionY','scaleX','scaleY','rotation','anchorX','anchorY','opacity','volume'];
            const keyframeEnabled = isPlainObject(data.keyframeEnabled) ? this._clone(data.keyframeEnabled) : {};
            const keyframes = isPlainObject(data.keyframes) ? this._clone(data.keyframes) : {};
            channels.forEach(channel => {
                if (typeof keyframeEnabled[channel] !== 'boolean') keyframeEnabled[channel] = false;
                if (!Array.isArray(keyframes[channel])) keyframes[channel] = [];
            });
            return {
                id: data.id || this.makeId('clip'),
                name: data.name || 'Clip',
                mediaType,
                mediaRef: data.mediaRef || null,
                sourceMediaId: data.sourceMediaId || null,
                src: data.src || '',
                trackId: data.trackId || null,
                start: Math.max(0, Number(data.start || 0)),
                duration,
                sourceIn,
                sourceOut: Math.max(sourceIn, Number(data.sourceOut ?? (sourceIn + duration))),
                sourceDuration: Math.max(0, Number(data.sourceDuration || 0)),
                playbackRate: Math.max(0.001, Number(data.playbackRate || 1)),
                opacity: Number.isFinite(Number(data.opacity)) ? Number(data.opacity) : 1,
                volume: Number.isFinite(Number(data.volume)) ? Number(data.volume) : 1,
                visible: data.visible !== false,
                muted: !!data.muted,
                locked: !!data.locked,
                selected: !!data.selected,
                blendMode: data.blendMode || 'source-over',
                color: data.color ?? null,
                text: data.text ?? null,
                x: data.x ?? null,
                y: data.y ?? null,
                w: data.w ?? null,
                h: data.h ?? null,
                scaleX: Number.isFinite(Number(data.scaleX)) ? Number(data.scaleX) : 1,
                scaleY: Number.isFinite(Number(data.scaleY)) ? Number(data.scaleY) : 1,
                rotation: Number(data.rotation || 0),
                anchorX: Number.isFinite(Number(data.anchorX)) ? Number(data.anchorX) : 0.5,
                anchorY: Number.isFinite(Number(data.anchorY)) ? Number(data.anchorY) : 0.5,
                keyframeEnabled,
                keyframes,
                effects: Array.isArray(data.effects) ? this._clone(data.effects) : [],
                transitions: isPlainObject(data.transitions) ? this._clone(data.transitions) : { in: null, out: null },
                grade: isPlainObject(data.grade) ? this._clone(data.grade) : {},
                curves: isPlainObject(data.curves) ? this._clone(data.curves) : {},
                fx: isPlainObject(data.fx) ? this._clone(data.fx) : {},
                thumb: data.thumb || null,
                thumbnails: Array.isArray(data.thumbnails) ? data.thumbnails.slice() : [],
                audioPeaks: data.audioPeaks ? this._serializableArray(data.audioPeaks) : null,
                mediaWidth: Math.max(0, Number(data.mediaWidth || 0)),
                mediaHeight: Math.max(0, Number(data.mediaHeight || 0)),
                metadata: isPlainObject(data.metadata) ? this._clone(data.metadata) : {}
            };
        }
        _sortTracks() { this.state.timeline.tracks.sort((a, b) => Number(a.order || 0) - Number(b.order || 0)); }
        setMasterGain(gain, options = {}) {
            const value = Math.max(0, Number(gain || 0));
            this.state.audio.master.gain = value;
            this.touch('audio.master.gain', { value }, options);
            this._legacy.manager?.setMasterGain?.(value);
            return value;
        }
        setMasterMuted(muted, options = {}) {
            const value = !!muted;
            this.state.audio.master.muted = value;
            this.touch('audio.master.muted', { value }, options);
            return value;
        }
        setAudioTrackState(trackId, patch = {}, options = {}) {
            const current = this.state.audio.trackStates[trackId] || { gain: 1, pan: 0, muted: false, solo: false, effects: [] };
            Object.assign(current, this._cleanRuntimeValues(patch));
            this.state.audio.trackStates[trackId] = current;
            this.touch('audio.track.updated', { trackId, patch: this._clone(patch) }, options);
            return current;
        }
        setGlobalGrade(patch = {}, options = {}) {
            Object.assign(this.state.color.globalGrade, this._cleanRuntimeValues(patch));
            this.touch('color.globalGrade', { patch: this._clone(patch) }, options);
            return this.state.color.globalGrade;
        }
        setClipGrade(clipId, grade = {}, options = {}) {
            this.state.color.clips[clipId] = this._clone(grade);
            this.touch('color.clipGrade', { clipId, grade: this._clone(grade) }, options);
            return this.state.color.clips[clipId];
        }
        createFusionGraph(options = {}) {
            const id = options.id || this.makeId('graph');
            const graph = {
                id,
                name: options.name || 'Composition',
                clipId: options.clipId || null,
                nodes: Array.isArray(options.nodes) ? this._clone(options.nodes) : [],
                links: Array.isArray(options.links) ? this._clone(options.links) : [],
                viewport: isPlainObject(options.viewport) ? this._clone(options.viewport) : { x: 0, y: 0, zoom: 1 },
                createdAt: options.createdAt || nowISO(),
                modifiedAt: nowISO()
            };
            this.state.fusion.graphs[id] = graph;
            this.state.fusion.activeGraphId = id;
            this.touch('fusion.graph.added', { graph: this._clone(graph) });
            return graph;
        }
        updateFusionGraph(id, patch = {}, options = {}) {
            const graph = this.state.fusion.graphs[id];
            if (!graph) return null;
            Object.assign(graph, this._cleanRuntimeValues(patch));
            graph.modifiedAt = nowISO();
            this.touch('fusion.graph.updated', { id, patch: this._clone(patch) }, options);
            return graph;
        }
        removeFusionGraph(id, options = {}) {
            const graph = this.state.fusion.graphs[id];
            if (!graph) return null;
            delete this.state.fusion.graphs[id];
            if (this.state.fusion.activeGraphId === id) this.state.fusion.activeGraphId = Object.keys(this.state.fusion.graphs)[0] || null;
            this.touch('fusion.graph.removed', { graph: this._clone(graph) }, options);
            return graph;
        }
        setWorkspace(id, options = {}) {
            const clean = String(id || 'edit').toLowerCase();
            const previous = this.state.workspace.active;
            if (clean === previous && options.force !== true) return clean;
            this.state.workspace.previous = previous;
            this.state.workspace.active = clean;
            this.state.runtimeHints.lastWorkspace = clean;
            if (!isPlainObject(this.state.workspace.perWorkspace[clean])) this.state.workspace.perWorkspace[clean] = {};
            this.touch('workspace.active', { active: clean, previous }, { ...options, dirty: options.dirty ?? false });
            return clean;
        }
        setWorkspaceState(id, patch = {}, options = {}) {
            const key = String(id || this.state.workspace.active || 'edit');
            const current = this.state.workspace.perWorkspace[key] || {};
            Object.assign(current, this._cleanRuntimeValues(patch));
            this.state.workspace.perWorkspace[key] = current;
            this.touch(`workspace.${key}`, { patch: this._clone(patch) }, { ...options, dirty: options.dirty ?? false });
            return current;
        }
        setExportSettings(patch = {}, options = {}) {
            Object.assign(this.state.export, this._cleanRuntimeValues(patch));
            this.touch('export.settings', { patch: this._clone(patch) }, options);
            return this.state.export;
        }
        snapshot() { return this._clone(this.state); }
        toJSON() { return this.snapshot(); }
        serialize(options = {}) {
            const pretty = options.pretty !== false;
            return JSON.stringify(this._sanitizeForSerialization(this.state), null, pretty ? 2 : 0);
        }
        deserialize(input, options = {}) {
            const raw = typeof input === 'string' ? JSON.parse(input) : input;
            return this.loadProject(raw, options);
        }
        loadProject(rawProject, options = {}) {
            if (!rawProject || typeof rawProject !== 'object') throw new TypeError('VideoProjectState.loadProject expected an object.');
            const migrated = this._migrate(this._clone(rawProject));
            this.state = this._normalizeProject(migrated);
            this._revision += 1;
            this._dirty = options.markClean === false ? this._dirty : false;
            if (options.silent !== true) this._emit('project:loaded', { project: this.snapshot() });
            return this.state;
        }
        _migrate(project) {
            const version = Number(project.schemaVersion || 0);
            if (version > SCHEMA_VERSION) console.warn(`[VideoProjectState] Project schema ${version} is newer than engine schema ${SCHEMA_VERSION}.`);
            project.schemaVersion = SCHEMA_VERSION;
            return project;
        }
        _normalizeProject(project) {
            const defaults = this._createDefaultProject({
                id: project.project?.id,
                name: project.project?.name,
                width: project.settings?.resolution?.w,
                height: project.settings?.resolution?.h,
                fps: project.settings?.fps
            });
            const merged = this._deepMerge(defaults, project);
            merged.schemaVersion = SCHEMA_VERSION;
            merged.media = (merged.media || []).map(m => this._normalizeMedia(m));
            merged.timeline.tracks = Array.isArray(merged.timeline.tracks) && merged.timeline.tracks.length ? merged.timeline.tracks : this._defaultTracks();
            merged.timeline.clips = (merged.timeline.clips || []).map(c => this._normalizeClip(c));
            merged.timeline.selectedIds = (merged.timeline.selectedIds || []).filter(id => merged.timeline.clips.some(c => c.id === id));
            merged.timeline.clips.forEach(c => c.selected = merged.timeline.selectedIds.includes(c.id));
            return merged;
        }
        _deepMerge(base, incoming) {
            if (Array.isArray(incoming)) return this._clone(incoming);
            if (!isPlainObject(incoming)) return incoming === undefined ? this._clone(base) : incoming;
            const out = isPlainObject(base) ? this._clone(base) : {};
            Object.keys(incoming).forEach(key => {
                if (isPlainObject(incoming[key]) && isPlainObject(out[key])) out[key] = this._deepMerge(out[key], incoming[key]);
                else out[key] = this._clone(incoming[key]);
            });
            return out;
        }
        enableAutosave(options = {}) {
            this._autosaveEnabled = true;
            this._autosaveKey = options.key || this._autosaveKey || AUTOSAVE_KEY;
            this._autosaveDelay = Math.max(250, Number(options.delay || this._autosaveDelay || 1200));
            return true;
        }
        disableAutosave() {
            this._autosaveEnabled = false;
            if (this._autosaveTimer) clearTimeout(this._autosaveTimer);
            this._autosaveTimer = 0;
        }
        _scheduleAutosave() {
            if (!this._autosaveEnabled || !global.localStorage) return;
            if (this._autosaveTimer) clearTimeout(this._autosaveTimer);
            this._autosaveTimer = setTimeout(() => {
                this._autosaveTimer = 0;
                this.saveAutosave();
            }, this._autosaveDelay);
        }
        saveAutosave() {
            if (!global.localStorage) return false;
            try {
                global.localStorage.setItem(this._autosaveKey, this.serialize({ pretty: false }));
                this._emit('project:autosaved', { key: this._autosaveKey });
                return true;
            } catch (error) {
                console.warn('[VideoProjectState] Autosave failed:', error);
                return false;
            }
        }
        restoreAutosave(options = {}) {
            if (!global.localStorage) return false;
            const raw = global.localStorage.getItem(options.key || this._autosaveKey);
            if (!raw) return false;
            try {
                this.deserialize(raw, { markClean: true });
                return true;
            } catch (error) {
                console.warn('[VideoProjectState] Autosave restore failed:', error);
                return false;
            }
        }
        clearAutosave() {
            try { global.localStorage?.removeItem(this._autosaveKey); } catch (_) {}
        }
        attachLegacySystems(options = {}) {
            this._legacy.manager = options.manager || global.videoEditingManager || this._legacy.manager || null;
            this._legacy.sequencer = options.sequencer || global.sequencerManager || this._legacy.sequencer || null;
            this._legacy.mediaPool = options.mediaPool || global.mediaPoolManager || this._legacy.mediaPool || null;
            if (options.capture !== false) this.captureFromLegacy({ markDirty: false });
            if (options.bindEvents !== false) this.bindLegacyEvents();
            return { ...this._legacy };
        }
        captureFromLegacy(options = {}) {
            const manager = options.manager || this._legacy.manager || global.videoEditingManager;
            const sequencer = options.sequencer || this._legacy.sequencer || global.sequencerManager;
            const mediaPool = options.mediaPool || this._legacy.mediaPool || global.mediaPoolManager;
            if (!manager && !sequencer && !mediaPool) return false;
            this.beginTransaction('Capture legacy video project');
            try {
                if (manager) {
                    this.state.settings.resolution = {
                        w: Math.max(1, Number(manager.resolution?.w || this.state.settings.resolution.w)),
                        h: Math.max(1, Number(manager.resolution?.h || this.state.settings.resolution.h))
                    };
                    this.state.audio.master.gain = Math.max(0, Number(manager.masterGain ?? this.state.audio.master.gain ?? 1));

                    /*
                     * PHASE 3:
                     * manager.items contains runtime/native compositor objects.
                     * Persistent composition data already lives in timeline.clips.
                     */
                    this.state.edit.canvasItems = [];
                    this.state.selection.canvasItemId = manager.selectedItem?.id || null;
                    const viewer = manager.canvasController;
                    if (viewer) {
                        Object.assign(this.state.edit.viewer, {
                            zoom: Number(viewer.zoom || 1),
                            fitMode: viewer.fitMode !== false,
                            panX: Number(viewer.panX || 0),
                            panY: Number(viewer.panY || 0),
                            showCenterGuides: !!viewer.showCenterGuides,
                            showSafeAreas: !!viewer.showSafeAreas,
                            showGrid: !!viewer.showGrid,
                            showThirds: !!viewer.showThirds,
                            snapEnabled: viewer.snapEnabled !== false
                        });
                    }
                }
                if (mediaPool?.media) this.state.media = mediaPool.media.map(entry => this._normalizeMedia(entry));
                const s = sequencer?.state;
                if (s) {
                    this.state.settings.fps = Math.max(1, Number(s.fps || this.state.settings.fps));
                    this.state.timeline.tracks = this._clone(s.tracks || []);
                    this.state.timeline.clips = (s.clips || []).map(c => this._normalizeClip(c));
                    this.state.timeline.markers = this._clone(s.markers || []);
                    this.state.timeline.playhead = Math.max(0, Number(s.playhead || 0));
                    this.state.timeline.selectedIds = this._clone(s.selectedIds || []);
                    this.state.timeline.playbackRate = Number(s.playbackRate || 1);
                    this.state.timeline.playing = !!s.playing;
                    this.state.timeline.workAreaStart = Number(s.workAreaStart ?? s.workStart ?? 0);
                    this.state.timeline.workAreaEnd = Number(s.workAreaEnd ?? s.workEnd ?? 0);
                    this.state.timeline.pixelsPerSecond = Number(s.pixelsPerSecond || 60);
                    this.state.timeline.scrollTime = Number(s.scrollTime || 0);
                    this.state.timeline.activeTool = s.activeTool || 'select';
                    this.state.timeline.trackHeaderWidth = Number(s.trackHeaderWidth || 390);
                    this.state.timeline.trackHeight = Number(s.trackHeight || 44);
                    this.state.timeline.rulerHeight = Number(s.rulerHeight || 34);
                    this.state.timeline.snapEnabled = s.snapEnabled !== false;
                    this.state.timeline.showWaveforms = s.showWaveforms !== false;
                    this.state.timeline.showThumbnails = s.showThumbnails !== false;
                    this.state.selection.clipIds = this.state.timeline.selectedIds.slice();
                    this.state.selection.primaryClipId = this.state.timeline.selectedIds.at(-1) || null;
                }
                this.touch('legacy.capture', {}, { dirty: options.markDirty === true, autosave: options.markDirty === true });
                this.commitTransaction();
                if (options.markDirty !== true) this._dirty = false;
                return true;
            } catch (error) {
                this.rollbackTransaction();
                throw error;
            }
        }
        applyToLegacy(options = {}) {
            const manager = options.manager || this._legacy.manager || global.videoEditingManager;
            const sequencer = options.sequencer || this._legacy.sequencer || global.sequencerManager;
            const mediaPool = options.mediaPool || this._legacy.mediaPool || global.mediaPoolManager;
            if (manager) {
                manager.resolution = {
                    ...this.state.settings.resolution
                };

                manager.masterGain =
                    Number(
                        this.state.audio.master.gain ??
                        1
                    );

                /*
                 * PHASE 3:
                 * Never deserialize native compositor items.
                 * Regenerate them from canonical clips/media instead.
                 */
                manager.compositionRuntime
                    ?.syncFromProject?.({
                        force: true,
                        hierarchy: false
                    });

                const primaryClipId =
                    this.state.selection
                        .primaryClipId;

                manager.selectedItem =
                    primaryClipId
                        ? manager
                            .compositionRuntime
                            ?.resolveClipId?.(
                                primaryClipId
                            ) ||
                            null
                        : null;
            }
            if (mediaPool) mediaPool.media = this.state.media.map(media => this._clone(media));
            const s = sequencer?.state;
            if (s) {
                s.fps = this.state.settings.fps;
                s.tracks = this._clone(this.state.timeline.tracks);
                s.clips = this._clone(this.state.timeline.clips);
                s.markers = this._clone(this.state.timeline.markers);
                s.playhead = this.state.timeline.playhead;
                s.selectedIds = this._clone(this.state.timeline.selectedIds);
                s.playbackRate = this.state.timeline.playbackRate;
                s.playing = false;
                s.workAreaStart = this.state.timeline.workAreaStart;
                s.workAreaEnd = this.state.timeline.workAreaEnd;
                s.pixelsPerSecond = this.state.timeline.pixelsPerSecond;
                s.scrollTime = this.state.timeline.scrollTime;
                s.activeTool = this.state.timeline.activeTool || 'select';
                s.trackHeaderWidth = Number(this.state.timeline.trackHeaderWidth || 390);
                s.trackHeight = Number(this.state.timeline.trackHeight || 44);
                s.rulerHeight = Number(this.state.timeline.rulerHeight || 34);
                s.snapEnabled = this.state.timeline.snapEnabled;
                s.showWaveforms = this.state.timeline.showWaveforms;
                s.showThumbnails = this.state.timeline.showThumbnails;
                s.clips.forEach(c => c.selected = s.selectedIds.includes(c.id));
            }
            if (options.render !== false) {
                mediaPool?.render?.();
                sequencer?.renderer?.render?.();
                sequencer?.renderer?.updatePlayhead?.();
                sequencer?.inspector?.refresh?.();
                manager?._syncHierarchy?.();
                manager?.resizeCanvas?.();
                manager?.renderCompositeAt?.(this.state.timeline.playhead);
            }
            this._emit('legacy.applied', {});
            return true;
        }
        bindLegacyEvents() {
            if (this._legacyBindingsInstalled) return;
            this._legacyBindingsInstalled = true;
            const capture = () => {
                if (!document.body.classList.contains('video-editing-mode')) return;
                this.captureFromLegacy({ markDirty: true });
            };
            ['videoCanvasTransformChanged', 'videoInspectorPanelChanged', 'videoToolPanelRequest'].forEach(name => {
                const handler = () => capture();
                global.addEventListener(name, handler);
                this._legacyHandlers.push([name, handler]);
            });
            const modeHandler = event => {
                if (event?.detail?.active === false) this.captureFromLegacy({ markDirty: false });
            };
            global.addEventListener('sm:video-mode', modeHandler);
            this._legacyHandlers.push(['sm:video-mode', modeHandler]);
        }
        unbindLegacyEvents() {
            this._legacyHandlers.forEach(([name, handler]) => global.removeEventListener(name, handler));
            this._legacyHandlers.length = 0;
            this._legacyBindingsInstalled = false;
        }
        connectLegacyWhenReady(options = {}) {
            const timeout = Math.max(1000, Number(options.timeout || 15000));
            const interval = Math.max(50, Number(options.interval || 100));
            const started = Date.now();
            return new Promise(resolve => {
                const check = () => {
                    const manager = global.videoEditingManager || null;
                    const sequencer = global.sequencerManager || null;
                    const mediaPool = global.mediaPoolManager || null;
                    if (manager && sequencer) {
                        this.attachLegacySystems({ manager, sequencer, mediaPool, capture: true, bindEvents: true });
                        resolve(true);
                        return;
                    }
                    if (Date.now() - started >= timeout) { resolve(false); return; }
                    setTimeout(check, interval);
                };
                check();
            });
        }
        _serializableArray(value) {
            if (Array.isArray(value)) return value.slice();
            if (ArrayBuffer.isView(value)) return Array.from(value);
            return value;
        }
        _cleanRuntimeValues(value, seen = new WeakMap()) {
            if (value == null || typeof value !== 'object') return value;
            if (value instanceof Date) return value.toISOString();
            if (ArrayBuffer.isView(value)) return Array.from(value);
            if (value instanceof ArrayBuffer) return Array.from(new Uint8Array(value));
            if (typeof File !== 'undefined' && value instanceof File) return undefined;
            if (typeof Blob !== 'undefined' && value instanceof Blob) return undefined;
            if (typeof HTMLElement !== 'undefined' && value instanceof HTMLElement) return undefined;
            if (typeof HTMLMediaElement !== 'undefined' && value instanceof HTMLMediaElement) return undefined;
            if (typeof HTMLImageElement !== 'undefined' && value instanceof HTMLImageElement) return undefined;
            if (typeof HTMLCanvasElement !== 'undefined' && value instanceof HTMLCanvasElement) return undefined;
            if (seen.has(value)) return seen.get(value);
            if (Array.isArray(value)) {
                const arr = [];
                seen.set(value, arr);
                value.forEach(item => {
                    const clean = this._cleanRuntimeValues(item, seen);
                    if (clean !== undefined) arr.push(clean);
                });
                return arr;
            }
            const out = {};
            seen.set(value, out);
            Object.keys(value).forEach(key => {
                if (typeof value[key] === 'function') return;
                if (key.startsWith('_')) return;
                if (['file','image','video','audioElement','element','dom','canvas','ctx'].includes(key)) return;
                const clean = this._cleanRuntimeValues(value[key], seen);
                if (clean !== undefined) out[key] = clean;
            });
            return out;
        }
        _sanitizeForSerialization(value) { return this._cleanRuntimeValues(value); }
        _clone(value) {
            if (value === undefined) return undefined;
            const clean = this._cleanRuntimeValues(value);
            if (global.structuredClone) {
                try { return global.structuredClone(clean); } catch (_) {}
            }
            return JSON.parse(JSON.stringify(clean));
        }
    }
    global.VideoProjectState = VideoProjectState;
    global.ensureVideoProjectState = function ensureVideoProjectState(options) {
        if (!global.videoProject) global.videoProject = new VideoProjectState(options || {});
        return global.videoProject;
    };
    global.ensureVideoProjectState();
})(window);