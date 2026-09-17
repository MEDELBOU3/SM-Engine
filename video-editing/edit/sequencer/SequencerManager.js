/**
 * SequencerManager.js — PHASE 2
 * SM Engine Video Editing.
 *
 * Timeline authority:
 *   window.videoProject.timeline
 *
 * SequencerState is now a project-backed adapter, so Renderer/Interaction keep
 * their existing API while every clip/track/playhead mutation lives directly
 * in VideoProjectState.
 */
(function (global) {
    'use strict';

    const ZOOM_MIN = 8;
    const ZOOM_MAX = 600;
    const SPLITTER_MIN = 120;

    class SequencerManager {
        constructor(vem, project = null) {
            this.vem = vem || null;

            this.project =
                project ||
                global.ensureVideoProjectState?.() ||
                global.videoProject ||
                null;

            this.state = new SequencerState(this.project);
            this.snap = new SequencerSnapManager(this.state);
            this.renderer = new SequencerRenderer(this.state, this.snap);
            this.inspector = null;

            this._sequencerCallbacks = this._callbacks();

            this.renderer.setActions?.(this._sequencerCallbacks);

            this.interaction = new SequencerInteraction(
                this.state,
                this.snap,
                this.renderer,
                this._sequencerCallbacks
            );

            this.mounted = false;
            this._playing = false;
            this._lastFrame = 0;
            this._rafId = 0;
            this._splitterEl = null;
            this._splitterDrag = null;
            this._resizeRaf = 0;
            this._resizeCanvasRaf = 0;
            this._onLayoutResize = null;

            this._bindProject();
        }

        setInspector(inspector) {
            this.inspector = inspector;
        }

        _bindProject() {
            if (!this.project) return;

            this.project.attachLegacySystems?.({
                manager: this.vem || global.videoEditingManager || null,
                sequencer: this,
                mediaPool: global.mediaPoolManager || null,
                capture: false,
                bindEvents: false
            });

            // Renderer refresh when another workspace changes canonical
            // timeline state (Audio/Fusion/Color can do this later).
            this._unsubscribeProject =
                this.project.subscribe?.('timeline.*', event => {
                    if (!this.mounted) return;

                    const path = event?.path || '';

                    if (path === 'timeline.playhead') {
                        this.renderer.updatePlayhead?.();
                        this._compositeRefresh();
                        return;
                    }

                    if (path === 'timeline.view') {
                        this.renderer.scheduleRulerUpdate?.();
                        return;
                    }

                    this.renderer.render?.();
                    this.renderer.updatePlayhead?.();
                }) || null;
        }

        _callbacks() {
            const self = this;

            return {
                onSeek: time => self._seek(time),
                onSelectionChange: () => self._selectionChanged(),
                onClipsMoved: () => self._clipsChanged('move'),
                onClipTrimmed: () => self._clipsChanged('trim'),
                onInteractionEnd: () => self._interactionEnded(),
                onSplitAt: time => self.splitAt(time),
                onDelete: () => self.deleteSelected(),
                onDuplicate: () => self.duplicateSelected(),
                onTool: tool => self.setTool(tool),
                onPlay: () => self.togglePlay(),
                onHome: () => self.seekTo(0),
                onEnd: () => self.seekTo(self.state.maxEnd()),
                onZoomIn: () => self.zoomAt(1.25, null),
                onZoomOut: () => self.zoomAt(0.8, null),
                onViewChanged: () => self._viewChanged(),
                onViewChange: value => self._applyViewPreset(value),
                onMarker: () => self.addMarkerAtPlayhead(),
                onText: () => self.addTextClip(),
                onSolid: () => self.addSolidClip(),
                onMedia: () => self.importMedia(),
                onToggle: (name, checked) => self._toggle(name, checked),
                onOpenClip: clip => self.openClip(clip),
                onAddMarkerAt: time => self.addMarker(time),
                onTracksChanged: () => self._tracksChanged('interaction')
            };
        }

        /* ==============================================================
           MOUNT / UNMOUNT
           ============================================================== */

        mount(host) {
            if (this.mounted) return;
            if (!host) return;

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
            this._selectionChanged(false);
            this.renderer.render();
            this.renderer.updatePlayhead();
            this._compositeRefresh();
        }

        unmount() {
            if (!this.mounted) return;

            this.pause();
            this.interaction.unbind();
            this.renderer.destroy();
            this.inspector?.close?.();
            this._unbindLayoutResize();
            this._removeSplitter();

            this._rootEl?.remove?.();
            this._rootEl = null;
            this.mounted = false;
        }

        _bindLayoutResize() {
            if (this._onLayoutResize) return;

            this._onLayoutResize = () => {
                if (this._resizeRaf) {
                    cancelAnimationFrame(this._resizeRaf);
                }

                this._resizeRaf = requestAnimationFrame(() => {
                    this._resizeRaf = 0;
                    this.renderer.render();
                    this._resizeCanvasSoon();
                });
            };

            global.addEventListener('resize', this._onLayoutResize);
            global.addEventListener('sm:layout-resized', this._onLayoutResize);
        }

        _unbindLayoutResize() {
            if (!this._onLayoutResize) return;

            global.removeEventListener('resize', this._onLayoutResize);
            global.removeEventListener('sm:layout-resized', this._onLayoutResize);

            this._onLayoutResize = null;

            if (this._resizeRaf) cancelAnimationFrame(this._resizeRaf);
            if (this._resizeCanvasRaf) cancelAnimationFrame(this._resizeCanvasRaf);

            this._resizeRaf = 0;
            this._resizeCanvasRaf = 0;
        }

        _resizeCanvasSoon() {
            if (this._resizeCanvasRaf) return;

            this._resizeCanvasRaf = requestAnimationFrame(() => {
                this._resizeCanvasRaf = 0;
                this.vem?.resizeCanvas?.();
            });
        }

        _ensureSplitter(host) {
            if (this._splitterEl) return;

            const splitter = document.createElement('div');
            splitter.className = 'sequencer-splitter';
            splitter.title = 'Drag to resize timeline';

            /*
             * IMPORTANT:
             * SequencerRenderer's current CSS styles:
             *
             *   #sequencer-root .sequencer-splitter
             *
             * so the splitter MUST live inside #sequencer-root.
             *
             * Phase 2 accidentally appended it to editor-scene/host,
             * which made the visible border disappear.
             */
            const splitterHost =
                this._rootEl ||
                host;

            splitterHost.appendChild(
                splitter
            );

            this._splitterEl =
                splitter;

            splitter.addEventListener(
                'pointerdown',
                event => {
                    if (
                        event.button !== 0
                    ) {
                        return;
                    }

                    event.preventDefault();
                    event.stopPropagation();

                    const hostRect =
                        host.getBoundingClientRect();

                    this._splitterDrag = {
                        startY:
                            event.clientY,

                        hostBottom:
                            hostRect.bottom,

                        hostHeight:
                            hostRect.height
                    };

                    splitter.classList.add(
                        'dragging'
                    );

                    document.body
                        .classList
                        .add(
                            'sequencer-resizing'
                        );

                    try {
                        splitter
                            .setPointerCapture?.(
                                event.pointerId
                            );
                    } catch (_) {}

                    this._splitterMove =
                        moveEvent =>
                            this
                                ._splitterDragMove(
                                    moveEvent
                                );

                    this._splitterUp =
                        upEvent => {
                            global
                                .removeEventListener(
                                    'pointermove',
                                    this
                                        ._splitterMove
                                );

                            global
                                .removeEventListener(
                                    'pointerup',
                                    this
                                        ._splitterUp
                                );

                            global
                                .removeEventListener(
                                    'pointercancel',
                                    this
                                        ._splitterUp
                                );

                            splitter
                                .classList
                                .remove(
                                    'dragging'
                                );

                            document.body
                                .classList
                                .remove(
                                    'sequencer-resizing'
                                );

                            try {
                                if (
                                    upEvent
                                        ?.pointerId !=
                                    null
                                ) {
                                    splitter
                                        .releasePointerCapture?.(
                                            upEvent
                                                .pointerId
                                        );
                                }
                            } catch (_) {}

                            this._splitterDrag =
                                null;

                            const heightValue =
                                getComputedStyle(
                                    document
                                        .documentElement
                                )
                                    .getPropertyValue(
                                        '--sequencer-live-height'
                                    )
                                    .trim();

                            this.project
                                ?.setWorkspaceState?.(
                                    'edit',
                                    {
                                        sequencerHeight:
                                            heightValue
                                    },
                                    {
                                        dirty: false
                                    }
                                );
                        };

                    global.addEventListener(
                        'pointermove',
                        this._splitterMove
                    );

                    global.addEventListener(
                        'pointerup',
                        this._splitterUp
                    );

                    global.addEventListener(
                        'pointercancel',
                        this._splitterUp
                    );
                }
            );

            splitter.addEventListener(
                'dblclick',
                event => {
                    event.preventDefault();
                    event.stopPropagation();

                    const height = 260;

                    document
                        .documentElement
                        .style
                        .setProperty(
                            '--sequencer-live-height',
                            `${height}px`
                        );

                    this.renderer
                        .refreshLayout?.();

                    this
                        ._resizeCanvasSoon();

                    global.dispatchEvent(
                        new CustomEvent(
                            'sm:layout-resized',
                            {
                                detail: {
                                    source:
                                        'video-sequencer',

                                    height
                                }
                            }
                        )
                    );

                    this.project
                        ?.setWorkspaceState?.(
                            'edit',
                            {
                                sequencerHeight:
                                    `${height}px`
                            },
                            {
                                dirty: false
                            }
                        );
                }
            );
        }

        _splitterDragMove(event) {
            if (!this._splitterDrag) {
                return;
            }

            const drag =
                this._splitterDrag;

            const height =
                Math.max(
                    SPLITTER_MIN,
                    Math.min(
                        drag.hostHeight *
                            0.75,

                        drag.hostBottom -
                            event.clientY
                    )
                );

            const roundedHeight =
                Math.round(height);

            document
                .documentElement
                .style
                .setProperty(
                    '--sequencer-live-height',
                    `${roundedHeight}px`
                );

            this.renderer
                .refreshLayout?.();

            this
                ._resizeCanvasSoon();

            global.dispatchEvent(
                new CustomEvent(
                    'sm:layout-resized',
                    {
                        detail: {
                            source:
                                'video-sequencer',

                            height:
                                roundedHeight
                        }
                    }
                )
            );
        }

        _removeSplitter() {
            document.body
                .classList
                .remove(
                    'sequencer-resizing'
                );

            if (this._splitterMove) {
                global
                    .removeEventListener(
                        'pointermove',
                        this._splitterMove
                    );
            }

            if (this._splitterUp) {
                global
                    .removeEventListener(
                        'pointerup',
                        this._splitterUp
                    );

                global
                    .removeEventListener(
                        'pointercancel',
                        this._splitterUp
                    );
            }

            this._splitterDrag =
                null;

            if (this._splitterEl) {
                this._splitterEl
                    .classList
                    .remove(
                        'dragging'
                    );

                this._splitterEl
                    .remove();

                this._splitterEl =
                    null;
            }

            this._splitterMove =
                null;

            this._splitterUp =
                null;
        }

        /* ==============================================================
           PLAYBACK
           ============================================================== */

        play() {
            if (this._playing) return;

            this._playing = true;
            this.state.playing = true;

            this.project?.touch?.(
                'timeline.playback',
                { playing: true },
                { dirty: false, autosave: false }
            );

            this.renderer.setPlaying(true);
            this.vem?.setPlaybackState?.(true);

            this._lastFrame = performance.now();

            const step = now => {
                if (!this._playing) return;

                const delta =
                    (now - this._lastFrame) /
                    1000 *
                    this.state.playbackRate;

                this._lastFrame = now;

                const end = Math.max(
                    this.state.workAreaEnd > this.state.workAreaStart
                        ? this.state.workAreaEnd
                        : this.state.maxEnd(),
                    0.1
                );

                const start =
                    this.state.workAreaEnd > this.state.workAreaStart
                        ? this.state.workAreaStart
                        : 0;

                this.state.playhead =
                    Math.min(
                        this.state.playhead + delta,
                        end
                    );

                this._playheadChanged(false);

                if (this.state.playhead >= end) {
                    this.pause();
                    this.seekTo(start);
                    return;
                }

                this._rafId =
                    requestAnimationFrame(step);
            };

            this._rafId =
                requestAnimationFrame(step);
        }

        pause() {
            if (!this._playing && !this.state.playing) {
                this.vem?.setPlaybackState?.(false);
                return;
            }

            this._playing = false;
            this.state.playing = false;

            this.project?.touch?.(
                'timeline.playback',
                { playing: false },
                { dirty: false, autosave: false }
            );

            this.renderer.setPlaying(false);
            this.vem?.setPlaybackState?.(false);

            if (this._rafId) {
                cancelAnimationFrame(this._rafId);
            }

            this._rafId = 0;
        }

        togglePlay() {
            if (this._playing) this.pause();
            else this.play();
        }

        _seek(time) {
            const value = Math.max(0, Number(time || 0));

            if (this.project?.setPlayhead) {
                this.project.setPlayhead(value, {
                    dirty: false,
                    autosave: false
                });
            } else {
                this.state.playhead = value;
            }

            this._playheadChanged(false);
        }

        seekTo(time) {
            this._seek(time);
        }

        _playheadChanged(writeProject = true) {
            if (writeProject && this.project?.setPlayhead) {
                this.project.setPlayhead(
                    this.state.playhead,
                    { dirty: false, autosave: false }
                );
            }

            this.renderer.updatePlayhead();
            this._compositeRefresh();
        }

        _compositeRefresh() {
            this.vem?.renderCompositeAt?.(
                this.state.playhead
            );
        }

        /* ==============================================================
           ZOOM / VIEW
           ============================================================== */

        zoomAt(factor, clientX) {
            const state = this.state;
            const scroll = this.renderer.el.scroll;

            if (!scroll) return;

            const rect = scroll.getBoundingClientRect();

            const client =
                clientX != null
                    ? clientX - rect.left
                    : rect.width / 2;

            const timelineClient =
                Math.max(
                    0,
                    client -
                    state.trackHeaderWidth
                );

            const anchorX =
                timelineClient +
                scroll.scrollLeft;

            const anchorTime =
                anchorX /
                state.pixelsPerSecond;

            state.pixelsPerSecond =
                Math.max(
                    ZOOM_MIN,
                    Math.min(
                        ZOOM_MAX,
                        state.pixelsPerSecond *
                        factor
                    )
                );

            scroll.scrollLeft =
                Math.max(
                    0,
                    anchorTime *
                    state.pixelsPerSecond -
                    timelineClient
                );

            state.scrollTime =
                scroll.scrollLeft /
                state.pixelsPerSecond;

            this.renderer.render();
            this._viewChanged();
        }

        _applyViewPreset(value) {
            const state = this.state;

            if (value === 'fit') {
                const end = state.maxEnd();
                const scroll = this.renderer.el.scroll;

                if (!scroll) return;

                const available =
                    scroll.clientWidth -
                    state.trackHeaderWidth -
                    40;

                state.pixelsPerSecond =
                    Math.max(
                        ZOOM_MIN,
                        Math.min(
                            ZOOM_MAX,
                            end > 0
                                ? available / end
                                : 60
                        )
                    );
            } else {
                const base = {
                    '25': 15,
                    '50': 30,
                    '100': 60,
                    '200': 120
                }[value];

                if (base) {
                    state.pixelsPerSecond = base;
                }
            }

            state.scrollTime = 0;
            this.renderer.render();
            this._viewChanged();
        }

        _viewChanged() {
            this.renderer.syncScrollFromElement?.();
            this.renderer.scheduleRulerUpdate?.();
            this.state.notifyViewChanged?.();
        }

        /* ==============================================================
           TOOLS / DISPLAY
           ============================================================== */

        setTool(tool) {
            this.state.activeTool = tool;

            this.project?.touch?.(
                'timeline.activeTool',
                { tool },
                { dirty: false }
            );

            this.renderer._syncToolbar?.();
        }

        _toggle(name, checked) {
            if (name === 'snap') {
                this.state.snapEnabled = checked;
            }

            if (name === 'waveforms') {
                this.state.showWaveforms = checked;
            }

            if (name === 'thumbnails') {
                this.state.showThumbnails = checked;
            }

            this.project?.touch?.(
                'timeline.display',
                {
                    name,
                    checked: !!checked
                },
                { dirty: false }
            );

            this.renderer.render();
        }

        /* ==============================================================
           CLIP OPERATIONS
           ============================================================== */

        splitAt(time) {
            const state = this.state;
            const minDuration = 1 / state.fps;

            const hits = state.clips.filter(clip =>
                clip.visible !== false &&
                !clip.locked &&
                time > clip.start + minDuration / 2 &&
                time < clip.start + clip.duration - minDuration / 2
            );

            if (!hits.length) return;

            this.project?.beginTransaction?.('Split Clip');

            try {
                const selected = [];

                hits.forEach(clip => {
                    const delta = time - clip.start;

                    const right = state.newClip({
                        ...this._copyClipData(clip),
                        id: undefined,
                        start: time,
                        duration:
                            clip.duration -
                            delta,
                        sourceIn:
                            clip.sourceIn +
                            delta,
                        sourceOut:
                            clip.sourceOut
                    });

                    clip.duration = delta;
                    clip.sourceOut =
                        clip.sourceIn +
                        delta;

                    state.clips.push(right);
                    selected.push(right.id);
                });

                state._setSelection?.(selected);

                this.project?.touch?.(
                    'timeline.clips',
                    {
                        reason: 'split',
                        time
                    }
                );

                this.project?.commitTransaction?.();
            } catch (error) {
                this.project?.rollbackTransaction?.();
                throw error;
            }

            this.renderer.render();
            this._clipsChanged('split', false);
        }

        duplicateSelected() {
            const state = this.state;

            if (!state.selectedClips.length) return;

            const copies = [];

            this.project?.beginTransaction?.(
                'Duplicate Clips'
            );

            try {
                state.selectedClips.forEach(clip => {
                    const copy = state.newClip({
                        ...this._copyClipData(clip),
                        id: undefined,
                        start:
                            clip.start +
                            clip.duration +
                            0.1,
                        selected: false
                    });

                    copy.sourceOut =
                        copy.sourceIn +
                        copy.duration;

                    state.clips.push(copy);
                    copies.push(copy);
                });

                state._setSelection?.(
                    copies.map(clip => clip.id)
                );

                this.project?.touch?.(
                    'timeline.clips',
                    {
                        reason: 'duplicate',
                        ids: copies.map(clip => clip.id)
                    }
                );

                this.project?.commitTransaction?.();
            } catch (error) {
                this.project?.rollbackTransaction?.();
                throw error;
            }

            this.renderer.render();
            this._clipsChanged(
                'duplicate',
                false
            );
        }

        deleteSelected() {
            const state = this.state;

            if (!state.selectedClips.length) return;

            const ids =
                state.selectedClips.map(
                    clip => clip.id
                );

            this.project?.beginTransaction?.(
                'Delete Clips'
            );

            try {
                ids.forEach(id => {
                    state.removeClip(id);
                });

                this.project?.commitTransaction?.();
            } catch (error) {
                this.project?.rollbackTransaction?.();
                throw error;
            }

            this.renderer.render();
            this._clipsChanged(
                'delete',
                false
            );

            this._compositeRefresh();
        }

        addClip(mediaType, options = {}) {
            const state = this.state;

            const clip = state.createClip(
                mediaType,
                {
                    ...options,
                    start:
                        options.start != null
                            ? options.start
                            : state.playhead
                }
            );

            if (mediaType === 'audio') {
                const audioTrack =
                    state.firstAudioTrack();

                if (audioTrack) {
                    clip.trackId =
                        options.trackId ||
                        audioTrack.id;
                }
            } else {
                const videoTrack =
                    state.firstVideoTrack();

                if (videoTrack) {
                    clip.trackId =
                        options.trackId ||
                        videoTrack.id;
                }
            }

            this.renderer.render();
            this._clipsChanged(
                'add',
                false
            );

            return clip;
        }

        addTextClip() {
            return this.addClip(
                'text',
                {
                    name: 'Text',
                    text: 'Text',
                    color: '#ffcc55',
                    duration: 5
                }
            );
        }

        addSolidClip() {
            return this.addClip(
                'solid',
                {
                    name: 'Solid',
                    color: '#4778ff',
                    duration: 5
                }
            );
        }

        addMediaClip(item, options = {}) {
            if (!item) return null;

            // IMPORTANT FIX:
            // VEM items use type='media'. The timeline must use the actual
            // mediaType: video / image / audio.
            const mediaType =
                item.mediaType ||
                item.type ||
                'video';

            const duration =
                Number(
                    options.duration ??
                    item.duration ??
                    item.sourceDuration ??
                    4
                ) || 4;

            const clip = this.addClip(
                mediaType,
                {
                    name: item.name,
                    src: item.src,
                    mediaRef: item.id,
                    sourceMediaId:
                        item.sourceMediaId ||
                        (
                            global.videoProject?.getMedia?.(item.id)
                                ? item.id
                                : null
                        ),
                    mediaWidth:
                        item.mediaWidth || 0,
                    mediaHeight:
                        item.mediaHeight || 0,
                    duration,
                    sourceDuration:
                        Number(
                            item.sourceDuration ??
                            item.duration ??
                            duration
                        ) || duration,
                    sourceIn:
                        Number(
                            options.sourceIn ||
                            0
                        ),
                    thumb:
                        item.thumb ||
                        null,
                    thumbnails:
                        Array.isArray(item.thumbnails)
                            ? item.thumbnails.slice()
                            : [],
                    audioPeaks:
                        item.audioPeaks
                            ? (
                                ArrayBuffer.isView(item.audioPeaks)
                                    ? Array.from(item.audioPeaks)
                                    : item.audioPeaks
                            )
                            : null,
                    trackId:
                        options.trackId ||
                        null
                }
            );

            return clip;
        }

        importMedia() {
            if (
                global.mediaPoolManager
                    ?.triggerImport
            ) {
                global.mediaPoolManager
                    .triggerImport();
                return;
            }

            this.vem?.openMediaImport?.();
        }

        addMarker(time) {
            const marker =
                this.state.addMarker(time);

            this.renderer.render();
            return marker;
        }

        addMarkerAtPlayhead() {
            return this.addMarker(
                this.state.playhead
            );
        }

        /* ==============================================================
           SELECTION / INSPECTOR
           ============================================================== */

        _selectionChanged(writeProject = true) {
            const primary =
                this.state.primarySelection;

            if (this.inspector) {
                if (primary) {
                    this.inspector.open(primary);
                } else {
                    this.inspector.close();
                }
            }

            if (
                writeProject &&
                this.project?.setTimelineSelection
            ) {
                this.project.setTimelineSelection(
                    this.state.selectedIds,
                    {
                        dirty: false,
                        autosave: false
                    }
                );
            }

            this.vem?.setSequencerSelection?.(
                this.state.selectedIds
            );
        }

        openClip(clip) {
            this.inspector?.open?.(clip);
        }

        selectItem(itemId) {
            const clip =
                this.state.clips.find(
                    current =>
                        current.mediaRef ===
                        itemId
                );

            if (!clip) return;

            this.state.selectClip(
                clip,
                false
            );

            this.state.clips.forEach(
                current =>
                    this.renderer.updateClip(
                        current
                    )
            );

            this._selectionChanged(false);
        }

        removeClipsByItem(itemId) {
            const toRemove =
                this.state.clips.filter(
                    clip =>
                        clip.mediaRef ===
                        itemId
                );

            if (!toRemove.length) return;

            this.project?.beginTransaction?.(
                'Remove Media Clips'
            );

            try {
                toRemove.forEach(
                    clip =>
                        this.state.removeClip(
                            clip.id
                        )
                );

                this.project?.commitTransaction?.();
            } catch (error) {
                this.project?.rollbackTransaction?.();
                throw error;
            }

            this.renderer.render();
            this._clipsChanged(
                'remove-media',
                false
            );

            this._compositeRefresh();
        }

        renameClipsForItem(
            itemId,
            name
        ) {
            const clean =
                String(name || '')
                    .trim();

            if (!clean) return;

            let changed = false;

            this.state.clips.forEach(
                clip => {
                    if (
                        clip.mediaRef !==
                        itemId
                    ) {
                        return;
                    }

                    clip.name = clean;
                    changed = true;

                    const element =
                        this.renderer
                            .clipEls
                            .get(
                                clip.id
                            );

                    const label =
                        element
                            ?.querySelector(
                                '.sequencer-clip-name'
                            );

                    if (label) {
                        label.textContent =
                            clean;
                    }
                }
            );

            if (changed) {
                this.project?.touch?.(
                    'timeline.clips',
                    {
                        reason: 'rename',
                        itemId,
                        name: clean
                    }
                );
            }
        }

        /* ==============================================================
           VEM RUNTIME BRIDGE
           ============================================================== */

        _adoptVemItems() {
            if (!this.vem?.items) return;

            let changed = false;

            this.vem.items.forEach(item => {
                const exists =
                    this.state.clips.some(
                        clip =>
                            clip.mediaRef ===
                            item.id
                    );

                if (!exists) {
                    this.addMediaClip(
                        item,
                        {}
                    );

                    changed = true;
                }
            });

            if (changed) {
                this.renderer.render();
            }
        }

        _clipsChanged(
            reason = 'edit',
            writeProject = true
        ) {
            // SequencerInteraction can modify clip objects directly.
            // Because clips are project-backed, the data is already inside
            // videoProject; touch() records revision/autosave/history intent.
            if (writeProject) {
                this.project?.touch?.(
                    'timeline.clips',
                    { reason }
                );
            }

            this.vem
                ?.syncFromSequencer?.();

            this.renderer
                .updatePlayhead?.();

            this.inspector
                ?.refresh?.();

            this._compositeRefresh();
        }

        _tracksChanged(
            reason = 'edit'
        ) {
            this.project?.touch?.(
                'timeline.tracks',
                { reason }
            );

            this.renderer.render();
            this._compositeRefresh();
        }

        _interactionEnded() {
            this.project?.touch?.(
                'timeline.interaction',
                {
                    selectedIds:
                        this.state
                            .selectedIds
                            .slice()
                }
            );

            this._compositeRefresh();
        }

        _copyClipData(clip) {
            const copy = {};

            Object.keys(clip || {}).forEach(
                key => {
                    if (
                        key === 'id' ||
                        key === 'selected'
                    ) {
                        return;
                    }

                    const value =
                        clip[key];

                    if (
                        ArrayBuffer.isView(
                            value
                        )
                    ) {
                        copy[key] =
                            Array.from(value);
                        return;
                    }

                    if (
                        value &&
                        typeof value ===
                            'object'
                    ) {
                        if (
                            global.structuredClone
                        ) {
                            try {
                                copy[key] =
                                    global
                                        .structuredClone(
                                            value
                                        );

                                return;
                            } catch (_) {}
                        }

                        copy[key] =
                            JSON.parse(
                                JSON.stringify(
                                    value
                                )
                            );

                        return;
                    }

                    copy[key] = value;
                }
            );

            return copy;
        }

        /* ==============================================================
           PROJECT RELOAD / REBIND
           ============================================================== */

        bindProject(project) {
            if (!project) return false;

            this._unsubscribeProject?.();
            this.project = project;
            this.state.project = project;
            this.state._ensureTimelineShape?.();
            this._bindProject();

            this.renderer.render?.();
            this.renderer.updatePlayhead?.();
            this._selectionChanged(false);
            this._compositeRefresh();

            return true;
        }

        refreshFromProject() {
            this.state._ensureTimelineShape?.();
            this.renderer.render?.();
            this.renderer.updatePlayhead?.();
            this._selectionChanged(false);
            this._compositeRefresh();
        }

        destroy() {
            this.unmount();
            this._unsubscribeProject?.();
            this._unsubscribeProject = null;
        }
    }

    global.SequencerManager =
        SequencerManager;

    global.ensureSequencerManager =
        function ensureSequencerManager(
            vem,
            project
        ) {
            if (!global.sequencerManager) {
                global.sequencerManager =
                    new SequencerManager(
                        vem ||
                        global.videoEditingManager ||
                        null,
                        project ||
                        global.videoProject ||
                        null
                    );
            } else {
                if (vem) {
                    global.sequencerManager.vem =
                        vem;
                }

                if (
                    project &&
                    global.sequencerManager.project !==
                        project
                ) {
                    global.sequencerManager
                        .bindProject(project);
                }
            }

            return global.sequencerManager;
        };

})(window);