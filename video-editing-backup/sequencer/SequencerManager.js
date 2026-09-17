/**
 * SequencerManager.js
 * Orchestrator for the SM Engine video sequencer: owns SequencerState,
 * SnapManager, SequencerRenderer, SequencerInteraction, and the video
 * preview splitter. Bridges sequencer data to VideoEditingManager
 * (composite preview + hierarchy) and to the clip inspector.
 *
 *   window.SequencerManager       - the class
 *   window.sequencerManager       - singleton
 *   window.ensureSequencerManager - lazy factory (takes the VEM instance)
 */

(function () {
    const ZOOM_MIN = 8;
    const ZOOM_MAX = 600;
    const SPLITTER_MIN = 120;

    class SequencerManager {
        constructor(vem) {
            this.vem = vem || null;
            this.state = new SequencerState();
            this.snap = new SequencerSnapManager(this.state);
            this.renderer = new SequencerRenderer(this.state, this.snap);
            this.inspector = null;
            this._sequencerCallbacks = this._callbacks();
            this.renderer.setActions?.(this._sequencerCallbacks);
            this.interaction = new SequencerInteraction(this.state, this.snap, this.renderer, this._sequencerCallbacks);
            this.mounted = false;
            this._playing = false;
            this._lastFrame = 0;
            this._rafId = 0;
            this._splitterEl = null;
            this._splitterDrag = null;
            this._resizeRaf = 0;
            this._resizeCanvasRaf = 0;
            this._onLayoutResize = null;
        }

        setInspector(inspector) {
            this.inspector = inspector;
        }

        _callbacks() {
            const self = this;
            return {
                onSeek: t => self._seek(t),
                onSelectionChange: () => self._selectionChanged(),
                onClipsMoved: () => self._clipsChanged(),
                onClipTrimmed: () => self._clipsChanged(),
                onInteractionEnd: () => self._compositeRefresh(),
                onSplitAt: t => self.splitAt(t),
                onDelete: () => self.deleteSelected(),
                onDuplicate: () => self.duplicateSelected(),
                onTool: tool => self.setTool(tool),
                onPlay: () => self.togglePlay(),
                onHome: () => self.seekTo(0),
                onEnd: () => self.seekTo(self.state.maxEnd()),
                onZoomIn: () => self.zoomAt(1.25, null),
                onZoomOut: () => self.zoomAt(0.8, null),
                onViewChanged: () => this._viewChanged(),
                onViewChange: v => self._applyViewPreset(v),
                onMarker: () => self.addMarkerAtPlayhead(),
                onText: () => self.addTextClip(),
                onSolid: () => self.addSolidClip(),
                onMedia: () => self.importMedia(),
                onToggle: (name, checked) => self._toggle(name, checked),
                onOpenClip: clip => self.openClip(clip),
                onAddMarkerAt: t => self.addMarker(t),
                onTracksChanged: () => self._tracksChanged()
            };
        }

        /* ─── Mount / unmount ─────────────────────────────────────────── */
        mount(host) {
            if (this.mounted) return;
            this.mounted = true;
            if (!this._rootEl) {
                this._rootEl = document.createElement('div');
                this._rootEl.id = 'sequencer-root';
                host.appendChild(this._rootEl);
            }
            this.renderer.build(this._rootEl);
            this.interaction.bind();
            this._ensureSplitter(host);
            this._bindLayoutResize();
            this._adoptVemItems();
            this._compositeRefresh();
        }

        _bindLayoutResize() {
            if (this._onLayoutResize) return;
            const self = this;
            this._onLayoutResize = function () {
                if (self._resizeRaf) cancelAnimationFrame(self._resizeRaf);
                self._resizeRaf = requestAnimationFrame(function () {
                    self._resizeRaf = 0;
                    self.renderer.render();
                    self._resizeCanvasSoon();
                });
            };
            window.addEventListener('resize', this._onLayoutResize);
            window.addEventListener('sm:layout-resized', this._onLayoutResize);
        }

        _unbindLayoutResize() {
            if (!this._onLayoutResize) return;
            window.removeEventListener('resize', this._onLayoutResize);
            window.removeEventListener('sm:layout-resized', this._onLayoutResize);
            this._onLayoutResize = null;
            if (this._resizeRaf) cancelAnimationFrame(this._resizeRaf);
            if (this._resizeCanvasRaf) cancelAnimationFrame(this._resizeCanvasRaf);
            this._resizeRaf = 0;
            this._resizeCanvasRaf = 0;
        }

        _resizeCanvasSoon() {
            const self = this;
            if (this._resizeCanvasRaf) return;
            this._resizeCanvasRaf = requestAnimationFrame(function () {
                self._resizeCanvasRaf = 0;
                if (self.vem && self.vem.resizeCanvas) self.vem.resizeCanvas();
            });
        }

        unmount() {
            if (!this.mounted) return;
            this.pause();
            this.interaction.unbind();
            this.renderer.destroy();
            if (this.inspector) this.inspector.close();
            this._unbindLayoutResize();
            this._removeSplitter();
            if (this._rootEl) {
                this._rootEl.remove();
                this._rootEl = null;
            }
            this.mounted = false;
        }

        _ensureSplitter(host) {
            if (this._splitterEl) return;
            const sp = document.createElement('div');
            sp.className = 'sequencer-splitter';
            sp.title = 'Drag to resize timeline';
            const splitterHost = this._rootEl || host;
            splitterHost.appendChild(sp);
            this._splitterEl = sp;
            const self = this;
            sp.addEventListener('pointerdown', function (e) {
                if (e.button !== 0) return;
                e.preventDefault();
                e.stopPropagation();
                const hostRect = host.getBoundingClientRect();
                self._splitterDrag = { startY: e.clientY, hostBottom: hostRect.bottom, hostHeight: hostRect.height };
                sp.classList.add('dragging');
                document.body.classList.add('sequencer-resizing');
                try { sp.setPointerCapture?.(e.pointerId); } catch (_) {}
                self._splitterMove = ev => self._splitterDragMove(ev);
                self._splitterUp = ev => {
                    window.removeEventListener('pointermove', self._splitterMove);
                    window.removeEventListener('pointerup', self._splitterUp);
                    window.removeEventListener('pointercancel', self._splitterUp);
                    sp.classList.remove('dragging');
                    document.body.classList.remove('sequencer-resizing');
                    try { if (ev?.pointerId != null) sp.releasePointerCapture?.(ev.pointerId); } catch (_) {}
                    self._splitterDrag = null;
                };
                window.addEventListener('pointermove', self._splitterMove);
                window.addEventListener('pointerup', self._splitterUp);
                window.addEventListener('pointercancel', self._splitterUp);
            });
            sp.addEventListener('dblclick', function () {
                document.documentElement.style.setProperty('--sequencer-live-height', '260px');
                self.renderer.refreshLayout();
                self._resizeCanvasSoon();
                window.dispatchEvent(new CustomEvent('sm:layout-resized', { detail: { source: 'video-sequencer', height: 260 } }));
            });
        }

        _splitterDragMove(e) {
            if (!this._splitterDrag) return;
            const d = this._splitterDrag;
            const h = Math.max(SPLITTER_MIN, Math.min(d.hostHeight * 0.75, d.hostBottom - e.clientY));
            document.documentElement.style.setProperty('--sequencer-live-height', Math.round(h) + 'px');
            this.renderer.refreshLayout();
            this._resizeCanvasSoon();
            window.dispatchEvent(new CustomEvent('sm:layout-resized', { detail: { source: 'video-sequencer', height: Math.round(h) } }));
        }

        _removeSplitter() {
            document.body.classList.remove('sequencer-resizing');
            if (this._splitterMove) window.removeEventListener('pointermove', this._splitterMove);
            if (this._splitterUp) {
                window.removeEventListener('pointerup', this._splitterUp);
                window.removeEventListener('pointercancel', this._splitterUp);
            }
            this._splitterDrag = null;
            if (this._splitterEl) {
                this._splitterEl.classList.remove('dragging');
                this._splitterEl.remove();
                this._splitterEl = null;
            }
        }

        /* ─── Playback ────────────────────────────────────────────────── */
        play() {
            if (this._playing) return;
            this._playing = true;
            this.state.playing = true;
            this.renderer.setPlaying(true);
            this.vem?.setPlaybackState?.(true);
            const self = this;
            this._lastFrame = performance.now();
            const step = function (now) {
                if (!self._playing) return;
                const dt = (now - self._lastFrame) / 1000 * self.state.playbackRate;
                self._lastFrame = now;
                const end = Math.max(self.state.maxEnd(), 0.1);
                self.state.playhead = Math.min(self.state.playhead + dt, end);
                self._playheadChanged();
                if (self.state.playhead >= end) {
                    self.pause();
                    self.seekTo(0);
                    return;
                }
                self._rafId = requestAnimationFrame(step);
            };
            this._rafId = requestAnimationFrame(step);
        }

        pause() {
            if (!this._playing) {
                // Keep VEM/native video state consistent even if pause() is called
                // redundantly by unmount/end-of-timeline code.
                this.state.playing = false;
                this.vem?.setPlaybackState?.(false);
                return;
            }
            this._playing = false;
            this.state.playing = false;
            this.renderer.setPlaying(false);
            if (this._rafId) cancelAnimationFrame(this._rafId);
            this._rafId = 0;
            this.vem?.setPlaybackState?.(false);
            this._compositeRefresh();
        }

        togglePlay() {
            if (this._playing) this.pause();
            else this.play();
        }

        _seek(t) {
            this.state.playhead = Math.max(0, t);
            this._playheadChanged();
        }

        seekTo(t) {
            this._seek(t);
        }

        _playheadChanged() {
            this.renderer.updatePlayhead();
            if (!this.state.playing && this.inspector) this.inspector.refresh();
            this._compositeRefresh();
        }

        _compositeRefresh() {
            if (this.vem && this.vem.renderCompositeAt) {
                this.vem.renderCompositeAt(this.state.playhead);
            }
        }

        /* ─── Zoom / view ─────────────────────────────────────────────── */
        zoomAt(factor, clientX) {
            const s = this.state;
            const scroll = this.renderer.el.scroll;
            const rect = scroll.getBoundingClientRect();
            const cx = clientX != null ? clientX - rect.left : rect.width / 2;
            const timelineCx = Math.max(0, cx - s.trackHeaderWidth);
            const anchorX = timelineCx + scroll.scrollLeft;
            const anchorT = anchorX / s.pixelsPerSecond;
            s.pixelsPerSecond = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, s.pixelsPerSecond * factor));
            scroll.scrollLeft = Math.max(0, anchorT * s.pixelsPerSecond - timelineCx);
            s.scrollTime = scroll.scrollLeft / s.pixelsPerSecond;
            this.renderer.render();
            this._viewChanged();
        }

        _applyViewPreset(v) {
            const s = this.state;
            if (v === 'fit') {
                const end = s.maxEnd();
                const avail = this.renderer.el.scroll.clientWidth - s.trackHeaderWidth - 40;
                s.pixelsPerSecond = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, end > 0 ? avail / end : 60));
            } else {
                const base = { '25': 15, '50': 30, '100': 60, '200': 120 }[v];
                if (base) s.pixelsPerSecond = base;
            }
            s.scrollTime = 0;
            this.renderer.render();
            this._viewChanged();
        }

        _viewChanged() {
            this.renderer.syncScrollFromElement();
            this.renderer.scheduleRulerUpdate();
        }

        /* ─── Tools ───────────────────────────────────────────────────── */
        setTool(tool) {
            this.state.activeTool = tool;
            this.renderer._syncToolbar();
        }

        _toggle(name, checked) {
            const s = this.state;
            if (name === 'snap') s.snapEnabled = checked;
            if (name === 'waveforms') s.showWaveforms = checked;
            if (name === 'thumbnails') s.showThumbnails = checked;
            this.renderer.render();
        }

        /* ─── Transform / keyframe animation ───────────────────────────── */
        _ensureClipAnimation(clip) {
            if (!clip) return null;
            this.state.ensureClipAnimationData?.(clip);
            return clip;
        }

        _localClipTime(clip, globalTime = this.state.playhead) {
            if (!clip) return 0;
            return Math.max(0, Math.min(Math.max(0, clip.duration || 0), Number(globalTime || 0) - Number(clip.start || 0)));
        }

        _frameTolerance() {
            return Math.max(0.0001, 0.45 / Math.max(1, this.state.fps || 30));
        }

        _channelToProp(channel) {
            return ({
                positionX: 'x', positionY: 'y', scaleX: 'scaleX', scaleY: 'scaleY',
                rotation: 'rotation', anchorX: 'anchorX', anchorY: 'anchorY',
                opacity: 'opacity', volume: 'volume'
            })[channel] || channel;
        }

        getClipBaseValue(clip, channel) {
            if (!clip) return 0;
            const W = this.vem?.resolution?.w || 1280;
            const H = this.vem?.resolution?.h || 720;
            const prop = this._channelToProp(channel);
            if (channel === 'positionX') {
                if (clip.x != null) return Number(clip.x) || 0;
                return clip.mediaType === 'text' ? W * 0.5 : (clip.mediaType === 'solid' ? W * 0.2 : 0);
            }
            if (channel === 'positionY') {
                if (clip.y != null) return Number(clip.y) || 0;
                return clip.mediaType === 'text' ? H * 0.5 : (clip.mediaType === 'solid' ? H * 0.24 : 0);
            }
            if (channel === 'scaleX' || channel === 'scaleY') return Number(clip[prop] ?? 1) || 0;
            if (channel === 'rotation') return Number(clip.rotation ?? 0) || 0;
            if (channel === 'anchorX' || channel === 'anchorY') return Number(clip[prop] ?? 0.5);
            if (channel === 'opacity') return Number(clip.opacity ?? 1);
            if (channel === 'volume') return Number(clip.volume ?? 1);
            return Number(clip[prop] ?? 0);
        }

        isPropertyAnimated(clip, channel) {
            this._ensureClipAnimation(clip);
            return !!clip?.keyframeEnabled?.[channel];
        }

        hasKeyframeAt(clip, channel, globalTime = this.state.playhead) {
            this._ensureClipAnimation(clip);
            const t = this._localClipTime(clip, globalTime);
            const eps = this._frameTolerance();
            return !!clip?.keyframes?.[channel]?.some(k => Math.abs(Number(k.time || 0) - t) <= eps);
        }

        setKeyframeValue(clip, channel, value, globalTime = this.state.playhead, options = {}) {
            if (!clip || !Number.isFinite(Number(value))) return null;
            this._ensureClipAnimation(clip);
            const keys = clip.keyframes[channel];
            const t = this._localClipTime(clip, globalTime);
            const eps = this._frameTolerance();
            const numeric = Number(value);
            let key = keys.find(k => Math.abs(Number(k.time || 0) - t) <= eps);
            if (key) {
                key.time = t;
                key.value = numeric;
            } else {
                key = { time: t, value: numeric, interpolation: 'linear' };
                keys.push(key);
                keys.sort((a, b) => Number(a.time || 0) - Number(b.time || 0));
            }
            clip.keyframeEnabled[channel] = true;
            if (options.refresh !== false) this._animationChanged(clip);
            return key;
        }

        removeKeyframeAt(clip, channel, globalTime = this.state.playhead, options = {}) {
            if (!clip) return false;
            this._ensureClipAnimation(clip);
            const t = this._localClipTime(clip, globalTime);
            const eps = this._frameTolerance();
            const before = clip.keyframes[channel].length;
            clip.keyframes[channel] = clip.keyframes[channel].filter(k => Math.abs(Number(k.time || 0) - t) > eps);
            const changed = before !== clip.keyframes[channel].length;
            if (changed && options.refresh !== false) this._animationChanged(clip);
            return changed;
        }

        toggleKeyframeAt(clip, channel, value = null) {
            if (!clip) return;
            this._ensureClipAnimation(clip);
            if (this.hasKeyframeAt(clip, channel)) {
                this.removeKeyframeAt(clip, channel);
            } else {
                const v = value == null ? this.evaluateClipProperty(clip, channel, this.state.playhead) : Number(value);
                this.setKeyframeValue(clip, channel, v);
            }
        }

        togglePropertyAnimation(clip, channel) {
            if (!clip) return false;
            this._ensureClipAnimation(clip);
            const enabled = !!clip.keyframeEnabled[channel];
            if (enabled) {
                const value = this.evaluateClipProperty(clip, channel, this.state.playhead);
                clip.keyframeEnabled[channel] = false;
                clip.keyframes[channel] = [];
                clip[this._channelToProp(channel)] = value;
            } else {
                clip.keyframeEnabled[channel] = true;
                this.setKeyframeValue(clip, channel, this.getClipBaseValue(clip, channel), this.state.playhead, { refresh: false });
            }
            this._animationChanged(clip);
            return !enabled;
        }

        setAnimatedProperty(clip, channel, value, options = {}) {
            if (!clip || !Number.isFinite(Number(value))) return;
            this._ensureClipAnimation(clip);
            const numeric = Number(value);
            if (clip.keyframeEnabled[channel]) {
                this.setKeyframeValue(clip, channel, numeric, options.time ?? this.state.playhead, { refresh: false });
            } else {
                clip[this._channelToProp(channel)] = numeric;
            }
            if (options.refresh !== false) this._animationChanged(clip, options.fullRender === true);
        }

        evaluateClipProperty(clip, channel, globalTime = this.state.playhead) {
            if (!clip) return 0;
            this._ensureClipAnimation(clip);
            const keys = clip.keyframes[channel] || [];
            if (!clip.keyframeEnabled[channel] || !keys.length) return this.getClipBaseValue(clip, channel);
            const t = this._localClipTime(clip, globalTime);
            if (keys.length === 1) return Number(keys[0].value) || 0;
            if (t <= Number(keys[0].time || 0)) return Number(keys[0].value) || 0;
            const last = keys[keys.length - 1];
            if (t >= Number(last.time || 0)) return Number(last.value) || 0;
            for (let i = 0; i < keys.length - 1; i++) {
                const a = keys[i], b = keys[i + 1];
                const at = Number(a.time || 0), bt = Number(b.time || 0);
                if (t < at || t > bt) continue;
                const span = Math.max(1e-9, bt - at);
                let u = Math.max(0, Math.min(1, (t - at) / span));
                if (a.interpolation === 'hold') u = 0;
                else if (a.interpolation === 'ease') u = u * u * (3 - 2 * u);
                return Number(a.value || 0) + (Number(b.value || 0) - Number(a.value || 0)) * u;
            }
            return this.getClipBaseValue(clip, channel);
        }

        evaluateClipAt(clip, globalTime = this.state.playhead) {
            if (!clip) return null;
            return {
                x: this.evaluateClipProperty(clip, 'positionX', globalTime),
                y: this.evaluateClipProperty(clip, 'positionY', globalTime),
                scaleX: this.evaluateClipProperty(clip, 'scaleX', globalTime),
                scaleY: this.evaluateClipProperty(clip, 'scaleY', globalTime),
                rotation: this.evaluateClipProperty(clip, 'rotation', globalTime),
                anchorX: this.evaluateClipProperty(clip, 'anchorX', globalTime),
                anchorY: this.evaluateClipProperty(clip, 'anchorY', globalTime),
                opacity: this.evaluateClipProperty(clip, 'opacity', globalTime),
                volume: this.evaluateClipProperty(clip, 'volume', globalTime),
                w: clip.w,
                h: clip.h
            };
        }

        _animationChanged(clip, fullRender = false) {
            if (clip) this.renderer.updateClip?.(clip);
            if (fullRender) this.renderer.render();
            if (this.inspector) this.inspector.refresh();
            this._compositeRefresh();
        }

        /* ─── Clip operations ─────────────────────────────────────────── */
        splitAt(t) {
            const s = this.state;
            const minDur = 1 / s.fps;
            const hits = s.clips.filter(c =>
                c.visible !== false && !c.locked &&
                t > c.start + minDur / 2 && t < c.start + c.duration - minDur / 2);
            if (!hits.length) return;
            s.selectedIds = [];
            hits.forEach(c => {
                const dt = t - c.start;
                const right = s.newClip({
                    name: c.name,
                    mediaType: c.mediaType,
                    src: c.src,
                    trackId: c.trackId,
                    start: t,
                    duration: c.duration - dt,
                    sourceIn: c.sourceIn + dt,
                    sourceOut: c.sourceOut,
                    opacity: c.opacity,
                    volume: c.volume,
                    visible: c.visible,
                    muted: c.muted,
                    locked: c.locked,
                    blendMode: c.blendMode,
                    color: c.color,
                    text: c.text,
                    x: c.x, y: c.y, w: c.w, h: c.h,
                    scaleX: c.scaleX, scaleY: c.scaleY, rotation: c.rotation,
                    anchorX: c.anchorX, anchorY: c.anchorY,
                    grade: c.grade, curves: c.curves, fx: c.fx,
                    audioPeaks: c.audioPeaks,
                    thumb: c.thumb,
                    thumbnails: Array.isArray(c.thumbnails) ? c.thumbnails.slice() : [],
                    sourceDuration: c.sourceDuration || 0,
                    keyframeEnabled: c.keyframeEnabled ? JSON.parse(JSON.stringify(c.keyframeEnabled)) : undefined,
                    keyframes: c.keyframes ? JSON.parse(JSON.stringify(c.keyframes)) : undefined,
                    mediaWidth: c.mediaWidth,
                    mediaHeight: c.mediaHeight,
                    mediaRef: c.mediaRef
                });
                c.duration = dt;
                c.sourceOut = c.sourceIn + dt;
                s.clips.push(right);
                s.selectedIds.push(right.id);
            });
            s.clips.forEach(c => c.selected = s.selectedIds.includes(c.id));
            this.renderer.render();
            this._clipsChanged();
        }

        duplicateSelected() {
            const s = this.state;
            if (!s.selectedClips.length) return;
            const copies = [];
            s.selectedClips.forEach(c => {
                const copy = s.newClip({
                    name: c.name,
                    mediaType: c.mediaType,
                    src: c.src,
                    trackId: c.trackId,
                    duration: c.duration,
                    sourceIn: c.sourceIn,
                    sourceOut: c.sourceOut,
                    opacity: c.opacity,
                    volume: c.volume,
                    visible: c.visible,
                    muted: c.muted,
                    locked: c.locked,
                    blendMode: c.blendMode,
                    color: c.color,
                    text: c.text,
                    x: c.x, y: c.y, w: c.w, h: c.h,
                    scaleX: c.scaleX, scaleY: c.scaleY, rotation: c.rotation,
                    anchorX: c.anchorX, anchorY: c.anchorY,
                    grade: c.grade, curves: c.curves, fx: c.fx,
                    audioPeaks: c.audioPeaks,
                    thumb: c.thumb,
                    thumbnails: Array.isArray(c.thumbnails) ? c.thumbnails.slice() : [],
                    sourceDuration: c.sourceDuration || 0,
                    keyframeEnabled: c.keyframeEnabled ? JSON.parse(JSON.stringify(c.keyframeEnabled)) : undefined,
                    keyframes: c.keyframes ? JSON.parse(JSON.stringify(c.keyframes)) : undefined,
                    mediaWidth: c.mediaWidth,
                    mediaHeight: c.mediaHeight,
                    mediaRef: c.mediaRef
                });
                copy.start = c.start + c.duration + 0.1;
                copy.sourceOut = copy.sourceIn + copy.duration;
                s.clips.push(copy);
                copies.push(copy);
            });
            s.selectedIds = copies.map(c => c.id);
            s.clips.forEach(c => c.selected = s.selectedIds.includes(c.id));
            this.renderer.render();
            this._clipsChanged();
        }

        deleteSelected() {
            const s = this.state;
            if (!s.selectedClips.length) return;
            const removed = s.selectedClips.slice();
            removed.forEach(c => s.removeClip(c.id));
            this.renderer.render();
            this._clipsChanged();
            this._compositeRefresh();
        }

        addClip(mediaType, opts) {
            const s = this.state;
            const clip = s.createClip(mediaType, opts);
            if (opts && opts.start != null) clip.start = opts.start;
            else clip.start = s.playhead;
            if (mediaType === 'audio') {
                const at = s.firstAudioTrack();
                if (at) clip.trackId = at.id;
            } else if (opts && opts.trackId) {
                clip.trackId = opts.trackId;
            } else {
                const vt = s.firstVideoTrack();
                if (vt) clip.trackId = vt.id;
            }
            this.renderer.render();
            this._clipsChanged();
            this._compositeRefresh();
            return clip;
        }

        addTextClip() {
            return this.addClip('text', {
                name: 'Text',
                text: 'Text',
                color: '#ffcc55',
                duration: 5
            });
        }

        addSolidClip() {
            return this.addClip('solid', {
                name: 'Solid',
                color: '#4778ff',
                duration: 5
            });
        }

        addMediaClip(item, opts) {
            opts = opts || {};
            const mediaType = item.mediaType || (item.type && item.type !== 'media' ? item.type : 'video');
            const sourceDuration = Number(item.duration || item.sourceDuration || 0);
            const defaultDuration = mediaType === 'image' ? 5 : (sourceDuration > 0 ? sourceDuration : 4);
            const clip = this.addClip(mediaType, {
                name: item.name,
                src: item.src,
                mediaRef: item.id,
                mediaWidth: item.mediaWidth || 0,
                mediaHeight: item.mediaHeight || 0,
                sourceDuration,
                duration: Number(opts.duration || defaultDuration),
                sourceIn: Number(opts.sourceIn || 0)
            });
            clip.sourceOut = clip.sourceIn + clip.duration;
            if (item.audioPeaks) clip.audioPeaks = item.audioPeaks;
            if (item.thumb) clip.thumb = item.thumb;
            if (Array.isArray(item.thumbnails)) clip.thumbnails = item.thumbnails.slice();
            this.renderer.updateClip?.(clip);
            return clip;
        }

        importMedia() {
            if (window.mediaPoolManager && window.mediaPoolManager.triggerImport) {
                window.mediaPoolManager.triggerImport();
            } else if (this.vem && this.vem.openMediaImport) {
                this.vem.openMediaImport();
            }
        }

        addMarker(time) {
            const m = this.state.addMarker(time);
            this.renderer.render();
            return m;
        }

        addMarkerAtPlayhead() {
            return this.addMarker(this.state.playhead);
        }

        /* ─── Selection / inspector ───────────────────────────────────── */
        _selectionChanged() {
            if (this.inspector) {
                const primary = this.state.primarySelection;
                if (primary) this.inspector.open(primary);
                else this.inspector.close();
            }
            if (this.vem && this.vem.setSequencerSelection) {
                this.vem.setSequencerSelection(this.state.selectedIds);
            }
        }

        openClip(clip) {
            if (this.inspector) this.inspector.open(clip);
        }

        selectItem(itemId) {
            const clip = this.state.clips.find(c => c.mediaRef === itemId);
            if (!clip) return;
            this.state.selectClip(clip, false);
            this.state.clips.forEach(c => this.renderer.updateClip(c));
            this._selectionChanged();
        }

        removeClipsByItem(itemId) {
            const s = this.state;
            const toRemove = s.clips.filter(c => c.mediaRef === itemId);
            if (!toRemove.length) return;
            toRemove.forEach(c => s.removeClip(c.id));
            this.renderer.render();
            this._clipsChanged();
            this._compositeRefresh();
        }

        renameClipsForItem(itemId, name) {
            const clean = String(name || '').trim();
            if (!clean) return;
            this.state.clips.forEach(c => {
                if (c.mediaRef !== itemId) return;
                c.name = clean;
                const el = this.renderer.clipEls.get(c.id);
                if (el) {
                    const n = el.querySelector('.sequencer-clip-name');
                    if (n) n.textContent = clean;
                }
            });
        }

        /* ─── VEM bridge ──────────────────────────────────────────────── */
        _adoptVemItems() {
            if (!this.vem || !this.vem.items) return;
            this.vem.items.forEach(item => {
                const exists = this.state.clips.some(c => c.mediaRef === item.id);
                if (!exists) {
                    this.addMediaClip(item, {});
                }
            });
            this.renderer.render();
        }

        _clipsChanged() {
            if (this.vem && this.vem.syncFromSequencer) this.vem.syncFromSequencer();
            this.renderer.updatePlayhead();
            if (this.inspector) this.inspector.refresh();
            this._compositeRefresh();
        }

        _tracksChanged() {
            this.renderer.render();
            this._compositeRefresh();
        }

        destroy() {
            this.unmount();
        }
    }

    window.SequencerManager = SequencerManager;

    window.ensureSequencerManager = function (vem) {
        if (!window.sequencerManager) {
            window.sequencerManager = new SequencerManager(vem || (window.videoEditingManager || null));
        }
        return window.sequencerManager;
    };
})();