//js/timeline/sm-timeline-core.js
(function () {
    const channels = [
        ['position.x', '#ef5350'], ['position.y', '#66bb6a'], ['position.z', '#42a5f5'],
        ['rotation.x', '#ffb74d'], ['rotation.y', '#ab47bc'], ['rotation.z', '#26c6da'],
        ['scale.x', '#ef9a9a'], ['scale.y', '#a5d6a7'], ['scale.z', '#90caf9']
    ];

    const state = {
        duration: 30,
        zoom: 1,
        selectedKeyframes: new Map(), // key: "uuid::frame" -> live keyframe element
        activeView: 'timeline',
        lastTick: performance.now(),
        tickerStarted: false,
        graphZoomX: 1,
        graphZoomY: 1,
        graphPanX: 56,
        graphPanY: 0,
        graphDragging: false,
        graphDragMode: null,
        graphPixelsPerSecond: 90,
        graphValueScale: 140,
        graphMinPixelsPerSecond: 6,
        graphMaxPixelsPerSecond: 12000,
        graphMinValueScale: 12,
        graphMaxValueScale: 6000,
        graphHeaderHeight: 22,
        graphPanning: false,
        graphLastMouseX: 0,
        graphLastMouseY: 0,
        selectedGraphHandle: null,
        graphHitItems: [],
        graphHiddenChannels: new Set(),
        graphLockedChannels: new Set(),
        graphMutedChannels: new Set(),
        activeGraphChannel: null,
        graphSearchQuery: '',
        graphNativeTargetName: null,
        nativeGraphCache: new Map(),

        //optimization keyframes
        timelineDenseThreshold: 3500,
        timelineDenseMode: false,
        timelineDenseCanvas: null,
        timelineUIRaf: 0,
        timelineLastKeyCount: 0,
        timelineVisibleRows: [],
        timelineRowMetrics: [],
        timelineSearchQuery: '',
        timelineDefaultRowHeight: 26,
        timelineScrollSyncBound: false,
        timelineProfessionalUIBound: false,
        timelineAlignmentRaf: 0,
        timelineSelectedRowKey: null,
        timelineSelectedUuid: null,
        timelineSelectedParentUuid: null,
        timelineLoopVisualBound: false,
    };

    window.currentTime = Number(window.currentTime || 0);
    window.timelineDuration = Number(window.timelineDuration || state.duration);
    window.playbackSpeed = Number(window.playbackSpeed || 1);
    window.isPlaying = !!window.isPlaying;
    window.loopEnabled = window.loopEnabled !== false;
    window.loopStart = Number(window.loopStart || 0);
    window.loopEnd = Number(window.loopEnd || window.timelineDuration * 1000);

    const $ = (id) => document.getElementById(id);
    const q = (selector) => document.querySelector(selector);


    // ---------------------------------------------------------------------
    // Blender-style timeline body / grid skin
    // ---------------------------------------------------------------------
    function injectBlenderTimelineGridStyles() {
        if (document.getElementById('sm-blender-timeline-grid-styles')) return;

        const style = document.createElement('style');
        style.id = 'sm-blender-timeline-grid-styles';
        style.textContent = `
            .timeline-body {
                --sm-tl-bg: #2f2f2f;
                --sm-tl-bg-deep: #2b2b2b;
                --sm-tl-row-line: rgba(0, 0, 0, 0.24);
                --sm-tl-minor-grid: rgba(0, 0, 0, 0.24);
                --sm-tl-medium-grid: rgba(0, 0, 0, 0.36);
                --sm-tl-major-grid: rgba(0, 0, 0, 0.52);
                --sm-tl-zero-grid: rgba(0, 0, 0, 0.68);

                background: var(--sm-tl-bg-deep) !important;
                min-height: 0;
            }

            .timeline-track {
                position: relative;
                min-width: 0;
                min-height: 0;
                background: var(--sm-tl-bg) !important;
                overflow: hidden;
            }

            #timeline-content,
            .timeline-content {
                position: relative !important;
                min-height: 100% !important;
                background: var(--sm-tl-bg) !important;
                overflow: visible;
                isolation: isolate;
            }

            #timeline-grid-canvas {
                position: absolute !important;
                inset: 0 auto auto 0 !important;
                pointer-events: none !important;
                z-index: 0 !important;
                image-rendering: auto;
            }

            #keyframes-container,
            .keyframes-container {
                position: relative;
                z-index: 2;
                background: transparent !important;
            }

            #timeline-markers-container,
            .timeline-markers-container,
            .loop-zone,
            .keyframe-lines,
            .playhead,
            .selection-box {
                z-index: 4;
            }

            .timeline-track-row {
                background: transparent !important;
                border: 0;
            }

            .timeline-track-line {
                border: 0 !important;
                background: transparent !important;
            }

            .timeline-scale {
                position: relative;
                z-index: 6;
                background: #303030 !important;
                border: 0;
            }

            .timeline-scale-marker {
                position: absolute;
                top: 0;
                bottom: 0;
                pointer-events: none;
            }

            .timeline-scale-label {
                color: rgba(220, 220, 220, 0.72) !important;
                font-size: 10px;
                font-weight: 400;
                transform: translateX(4px);
            }
        `;
        document.head.appendChild(style);
    }

    function getScene() {
        return window.scene || null;
    }

    function getSelectedObject() {
        return window.selectedObject || window.activeObject || null;
    }

    function getFps() {
        return Number(window.fps || 30);
    }

    function getCurrentTime() {
        return Number(window.currentTime || 0);
    }

    function setCurrentTime(value) {
        const duration = Math.max(0.001, Number(window.timelineDuration || state.duration || 30));
        state.duration = duration;
        const newTime = Math.max(0, Math.min(duration, Number(value) || 0));
        window.currentTime = newTime;
        const currentFrame = Math.round(newTime * getFps());
        try {
            updatePlayhead();
        } catch (error) {
            console.error('[Timeline] updatePlayhead failed:', error);
        }
        try {
            updateSceneFromTimeline();
        } catch (error) {
            console.error('[Timeline] updateSceneFromTimeline failed:', error);
        }
        if (state.activeView === 'graph') {
            const graph = $('graph-editor-container');
            if (graph && graph.offsetParent !== null) {
                try {
                    renderGraph();
                } catch (error) {
                    console.error('[Timeline] renderGraph failed:', error);
                }
            }
        }
        try {
            window.TimelineEventsAudio?.checkFrameEvents?.(currentFrame);
        } catch (error) {
            console.error('[Timeline] TimelineEventsAudio failed:', error);
        }
        try {
            window.dispatchEvent(new CustomEvent('timeUpdate', {
                detail: {
                    time: newTime,
                    frame: currentFrame
                }
            }));
        } catch (error) {
            console.error('[Timeline] timeUpdate dispatch failed:', error);
        }
    }
    function ensureMaps() {
        window.keyframes = window.keyframes instanceof Map ? window.keyframes : new Map();
        window.boneKeyframes = window.boneKeyframes instanceof Map ? window.boneKeyframes : new Map();
    }

    function frameForTime(time = getCurrentTime()) {
        return Math.round(time * getFps());
    }

    // --- Multi-keyframe selection helpers ---
    function keyframeKey(uuid, frame) {
        return `${uuid}::${frame}`;
    }

    function clearKeyframeSelection() {
        state.selectedKeyframes.forEach((el) => el.classList.remove('selected'));
        state.selectedKeyframes.clear();
    }

    function setKeyframeSelected(el, selected) {
        if (!el) return;
        const key = keyframeKey(el.dataset.uuid, el.dataset.frame);
        if (selected) {
            el.classList.add('selected');
            state.selectedKeyframes.set(key, el);
        } else {
            el.classList.remove('selected');
            state.selectedKeyframes.delete(key);
        }
    }

    function toggleKeyframeSelected(el) {
        const key = keyframeKey(el.dataset.uuid, el.dataset.frame);
        setKeyframeSelected(el, !state.selectedKeyframes.has(key));
    }

    function selectOnlyKeyframe(el) {
        clearKeyframeSelection();
        setKeyframeSelected(el, true);
    }

    function getPrimarySelectedKeyframeEl() {
        if (!state.selectedKeyframes.size) return null;
        // Last one inserted into the Map = most recently interacted with
        return Array.from(state.selectedKeyframes.values()).pop();
    }

    function selectAllVisibleKeyframes() {
        document.querySelectorAll('#keyframes-container .keyframe').forEach((el) => {
            setKeyframeSelected(el, true);
        });
    }

    function makeKeyframe(object) {
        const euler = new THREE.Euler().setFromQuaternion(object.quaternion, 'XYZ');
        return {
            time: getCurrentTime(),
            position: object.position.clone(),
            rotation: object.quaternion.clone(),
            rotationEuler: { x: euler.x, y: euler.y, z: euler.z },
            scale: object.scale.clone(),
            interpolation: $('interpolation-type-select')?.value || 'bezier',
            source: 'manual',
            isImportedTrack: false
        };
    }

    function isSystemOrHelperObject(obj) {
        if (!obj || !obj.isObject3D) return true;
        if (obj.userData?.ignoreInTimeline || obj.userData?.ignoreInHierarchy || obj.userData?.isSystemObject) return true;
        if (obj.isHelper || obj.type?.includes('Helper')) return true;

        const name = (obj.name || '').toLowerCase();
        const type = (obj.type || '').toLowerCase();

        if (
            name.includes('helper') ||
            name.includes('debug') ||
            name.includes('lod') ||
            name.includes('waterbodies') ||
            name.includes('unrealenginefloor') ||
            name.includes('animation paths') ||
            name.includes('animationpaths') ||
            name.includes('grid') ||
            name.includes('gizmo') ||
            name.includes('transformcontrols') ||
            name.includes('nanite') ||
            name.includes('vertex') ||
            name.includes('edge') ||
            name.includes('face') ||
            type.includes('helper') ||
            type.includes('grid')
        ) {
            return true;
        }

        let curr = obj.parent;
        while (curr) {
            const pName = (curr.name || '').toLowerCase();
            if (curr.userData?.ignoreInTimeline || curr.userData?.ignoreInHierarchy || curr.userData?.isSystemObject) return true;
            if (pName.includes('debug') || pName.includes('helper') || pName.includes('gizmo') || pName.includes('nanite') || pName.includes('waterbodies')) return true;
            curr = curr.parent;
        }

        return false;
    }

    function addObjectToTimeline(object) {
        ensureMaps();
        if (!object?.isObject3D || isSystemOrHelperObject(object)) return;
        if (!window.keyframes.has(object.uuid)) window.keyframes.set(object.uuid, {});
        if (object.animations && object.animations.length > 0) {
            if (typeof extractAnimationsToTimeline === 'function') {
                extractAnimationsToTimeline(object, object.animations);
            }
        }
        updateLayersUI();
        updateKeyframesUI();
    }

    function addKeyframe() {
        // If 2D animation mode is active, use the explicit commit (shows diamond)
        if (window.animation2DManager?.isActive) {
            window.animation2DManager.commitKeyframe();
            return;
        }
        ensureMaps();
        const object = getSelectedObject();
        if (!object?.isObject3D) {
            console.warn('[Timeline] Select an object or bone before adding a keyframe.');
            return;
        }

        // If a bone is selected, link it to its parent character model so it appears in the hierarchy & timeline tracks
        if (object.isBone) {
            let rootModel = object.parent;
            while (rootModel && rootModel.parent && rootModel.parent !== getScene() && !rootModel.userData?.hasRig) {
                rootModel = rootModel.parent;
            }
            if (rootModel && rootModel !== object) {
                rootModel.userData.animatedChildUuids = rootModel.userData.animatedChildUuids || new Set();
                rootModel.userData.animatedChildUuids.add(object.uuid);
                object.userData.rootModelUuid = rootModel.uuid;
            }
        }

        const map = window.keyframes.get(object.uuid) || {};
        map[frameForTime()] = makeKeyframe(object);
        window.keyframes.set(object.uuid, map);
        // Invalidate evaluator cache so new keyframe is picked up immediately
        window.TimelineBinaryEvaluator?.invalidateCache(object.uuid);
        addObjectToTimeline(object);
        updateKeyframesUI();
        updateLayersUI();
        renderGraph();
    }

    function deleteKeyframe() {
        // If 2D animation mode is active, delegate to the 2D manager
        if (window.animation2DManager?.isActive) {
            window.animation2DManager.deleteCurrentFrameKeyframe();
            return;
        }
        ensureMaps();
        if (!state.selectedKeyframes?.size) return;
        state.selectedKeyframes.forEach((el) => {
            const uuid = el.dataset?.uuid;
            const frame = Number(el.dataset?.frame);
            const map = window.keyframes.get(uuid);
            if (map) {
                delete map[frame];
                if (Object.keys(map).length === 0) window.keyframes.delete(uuid);
            }
        });
        state.selectedKeyframes.clear();
        updateKeyframesUI();
        updateLayersUI();
        renderGraph();
    }

    function formatTime(seconds = getCurrentTime()) {
        const total = Math.floor(seconds);
        const minutes = Math.floor(total / 60);
        const secs = total % 60;
        const ms = Math.floor((seconds - total) * 1000);
        return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}:${String(ms).padStart(3, '0')}`;
    }

    function parseTime(text) {
        const parts = String(text || '').split(':').map(Number);
        if (parts.length === 3) return (parts[0] || 0) * 60 + (parts[1] || 0) + (parts[2] || 0) / 1000;
        return Number(text) || 0;
    }

    function timelineWidth() {
        const content = $('timeline-content');
        return Math.max(content?.clientWidth || 900, state.duration * 80 * state.zoom);
    }

    function timeToX(time) {
        return (time / state.duration) * timelineWidth();
    }

    function xToTime(x) {
        return (x / timelineWidth()) * state.duration;
    }

    function hasActualKeyframes(uuid) {
        const map = window.keyframes?.get(uuid);
        if (map && Object.keys(map).length > 0) return true;
        const boneMap = window.boneKeyframes?.get(uuid);
        if (boneMap && boneMap.size > 0) {
            for (const [_, kfMap] of boneMap) {
                if (kfMap && Object.keys(kfMap).length > 0) return true;
            }
        }
        return false;
    }

    // ---------- Hierarchy helpers ----------

    /**
     * Build a flat list of timeline "root" objects (models, lights, cameras, etc.)
     * Only displays objects that have keyframes/animations or are selected, like Blender.
     */
    function collectTimelineObjects() {
        ensureMaps();
        const scene = getScene();
        const selected = getSelectedObject();
        const rootMap = new Map(); // uuid -> obj
        const childSet = new Set(); // uuids that are animated children of a root

        // Clean up empty keyframes map entries for helper objects or objects with 0 keyframes
        window.keyframes.forEach((map, uuid) => {
            const obj = scene?.getObjectByProperty?.('uuid', uuid);
            if (!obj) return;
            if (isSystemOrHelperObject(obj) || (Object.keys(map || {}).length === 0 && !obj.animations?.length && !obj.userData?.is2DAnimation)) {
                if (Object.keys(map || {}).length === 0) {
                    window.keyframes.delete(uuid);
                }
            }
        });

        // 1. Find all objects with keyframes, native animations, or 2D animation layer
        window.keyframes.forEach((map, uuid) => {
            let obj = scene?.getObjectByProperty?.('uuid', uuid);
            if (!obj) {
                const mgr = window.animation2DManager;
                if (mgr?.timelineObject?.uuid === uuid) obj = mgr.timelineObject;
            }
            if (!obj || isSystemOrHelperObject(obj)) return;
            if (hasActualKeyframes(uuid) || obj.animations?.length > 0 || obj.userData?.is2DAnimation) {
                rootMap.set(uuid, obj);
            }
        });

        // 2. Scene traversal fallback for animated models or 2D layers not yet in keyframes map
        scene?.traverse?.((obj) => {
            if (!obj || !obj.uuid || isSystemOrHelperObject(obj)) return;
            if ((obj.animations && obj.animations.length > 0) || obj.userData?.is2DAnimation || hasActualKeyframes(obj.uuid)) {
                rootMap.set(obj.uuid, obj);
            }
        });

        // 3. Always include the currently selected user object (if valid & not a system helper)
        if (selected?.isObject3D && !isSystemOrHelperObject(selected)) {
            rootMap.set(selected.uuid, selected);
        }

        // 4. Collect animated children for root models
        rootMap.forEach((obj) => {
            const childUuids = obj.userData?.animatedChildUuids;
            if (childUuids && childUuids.size > 0) {
                obj._animatedChildren = [];
                childUuids.forEach(cUuid => {
                    if (cUuid === obj.uuid) return;
                    const child = scene?.getObjectByProperty?.('uuid', cUuid);
                    if (!child || isSystemOrHelperObject(child)) return;
                    childSet.add(cUuid);
                    obj._animatedChildren.push(child);
                });
                obj._animatedChildren.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            } else {
                obj._animatedChildren = [];
            }
        });

        // Remove children from root-level entries so they only appear as sub-rows
        childSet.forEach(uuid => rootMap.delete(uuid));

        return Array.from(rootMap.values()).filter(obj => !isSystemOrHelperObject(obj));
    }

    // Expanded state store: persists across re-renders
    const _expandedRoots = new Set();

    function getTimelineSearchQuery() {
        return String(
            state.timelineSearchQuery ||
            document.getElementById('timeline-track-search')?.value ||
            ''
        ).trim().toLowerCase();
    }

    function buildTimelineVisibleRows() {
        ensureMaps();

        const objects = collectTimelineObjects();
        const query = getTimelineSearchQuery();
        const rows = [];

        objects.forEach(obj => {
            const children = Array.isArray(obj._animatedChildren) ? obj._animatedChildren : [];
            const hasChildren = children.length > 0;
            const isExpanded = hasChildren && _expandedRoots.has(obj.uuid);
            const rootLabel = obj.name || obj.type || 'Object';
            const rootSearchText = `${rootLabel} ${obj.type || ''}`.toLowerCase();

            const childMatches = new Set();
            children.forEach(child => {
                const text = `${child.name || child.type || ''} ${child.type || ''}`.toLowerCase();
                if (!query || text.includes(query)) childMatches.add(child.uuid);
            });

            const rootMatches = !query || rootSearchText.includes(query);
            const includeRoot = rootMatches || childMatches.size > 0;
            if (!includeRoot) return;

            const is2DLayer = !!obj.userData?.is2DAnimation;
            const rootEntries = getTimelineMapEntries(window.keyframes.get(obj.uuid) || {})
                .map(item => ({ ...item, kind: 'key' }));

            const rootKeys = [...rootEntries];

            // When children are collapsed, keep their keys visible as summary
            // keys on the root row. This is the same visual row represented on
            // both the LEFT and RIGHT sides.
            if (!isExpanded && hasChildren) {
                const summaryFrames = new Map();

                children.forEach(child => {
                    const childEntries = getTimelineMapEntries(window.keyframes.get(child.uuid) || {});

                    childEntries.forEach(item => {
                        const frame = Math.round(item.time * getFps());

                        if (!summaryFrames.has(frame)) {
                            summaryFrames.set(frame, {
                                ...item,
                                uuid: child.uuid,
                                kind: 'summary'
                            });
                        }
                    });
                });

                summaryFrames.forEach(item => {
                    const duplicate = rootKeys.some(
                        existing => Math.abs(existing.time - item.time) < 0.000001
                    );

                    if (!duplicate) rootKeys.push(item);
                });

                rootKeys.sort((a, b) => a.time - b.time);
            }

            rows.push({
                rowKey: `root::${obj.uuid}`,
                uuid: obj.uuid,
                object: obj,
                parentObject: null,
                parentUuid: null,
                isChild: false,
                is2DLayer,
                labelName: rootLabel,
                hasChildren,
                isExpanded,
                keys: rootKeys,
                clipCount: obj.animations?.length || 0
            });

            if (isExpanded) {
                children.forEach(child => {
                    const childLabel = child.name || child.type || 'Track';

                    if (query && !rootMatches && !childMatches.has(child.uuid)) {
                        return;
                    }

                    rows.push({
                        rowKey: `child::${obj.uuid}::${child.uuid}`,
                        uuid: child.uuid,
                        object: child,
                        parentObject: obj,
                        parentUuid: obj.uuid,
                        isChild: true,
                        is2DLayer: false,
                        labelName: childLabel,
                        hasChildren: false,
                        isExpanded: false,
                        keys: getTimelineMapEntries(window.keyframes.get(child.uuid) || {})
                            .map(item => ({ ...item, kind: 'key' })),
                        clipCount: 0
                    });
                });
            }
        });

        state.timelineVisibleRows = rows;

        return rows;
    }

    function timelineLayerDOMMatchesRows(rows) {
        const list = $('layers-list');
        if (!list) return false;

        const existing = Array.from(
            list.querySelectorAll('.timeline-layer-item[data-row-key]')
        );

        if (existing.length !== rows.length) return false;

        for (let i = 0; i < rows.length; i++) {
            if (existing[i]?.dataset?.rowKey !== rows[i].rowKey) {
                return false;
            }
        }

        return true;
    }

    function updateProfessionalTimelineStatus(rows = state.timelineVisibleRows) {
        const visibleRowsEl = $('timeline-status-visible-rows');
        const keyCountEl = $('timeline-status-key-count');
        const frameEl = $('timeline-status-frame');
        const endFrameEl = $('timeline-status-end-frame');
        const zoomEl = $('timeline-status-zoom');

        const keyCount = (rows || []).reduce(
            (total, row) => total + (row.keys?.length || 0),
            0
        );

        if (visibleRowsEl) visibleRowsEl.textContent = String(rows?.length || 0);
        if (keyCountEl) keyCountEl.textContent = keyCount >= 1000
            ? `${(keyCount / 1000).toFixed(keyCount >= 10000 ? 0 : 1)}k`
            : String(keyCount);
        if (frameEl) frameEl.textContent = String(frameForTime());
        if (endFrameEl) endFrameEl.textContent = String(
            Math.round(Math.max(0, state.duration) * getFps())
        );
        if (zoomEl) zoomEl.textContent = `${Math.round(state.zoom * 100)}%`;
    }


    function isTimelineRowSelected(row) {
        if (!row) return false;

        if (state.timelineSelectedRowKey) {
            return state.timelineSelectedRowKey === row.rowKey;
        }

        const selected = getSelectedObject();

        return !!(
            selected &&
            !row.isChild &&
            selected.uuid === row.uuid
        );
    }

    function updateTimelineRowSelectionVisuals() {
        const selectedRowKey = state.timelineSelectedRowKey;

        document
            .querySelectorAll('#layers-list .timeline-layer-item[data-row-key]')
            .forEach(row => {
                const selected =
                    !!selectedRowKey &&
                    row.dataset.rowKey === selectedRowKey;

                row.classList.toggle('selected', selected);
                row.classList.toggle('timeline-row-selected', selected);
            });

        document
            .querySelectorAll('#keyframes-container .timeline-track-row[data-row-key]')
            .forEach(row => {
                const selected =
                    !!selectedRowKey &&
                    row.dataset.rowKey === selectedRowKey;

                row.classList.toggle('selected-object-track', selected);
                row.classList.toggle('timeline-row-selected', selected);
            });
    }

    function selectTimelineRow(timelineRow, {
        syncSceneSelection = false
    } = {}) {
        if (!timelineRow) return;

        /*
         * Timeline row selection is intentionally independent from viewport
         * focus/selection. In the previous build, clicking a child row called
         * window.selectObject(parentModel), which could trigger external
         * selection/focus/zoom behavior.
         */
        state.timelineSelectedRowKey = timelineRow.rowKey;
        state.timelineSelectedUuid = timelineRow.uuid;
        state.timelineSelectedParentUuid =
            timelineRow.parentUuid ||
            timelineRow.parentObject?.uuid ||
            null;

        updateTimelineRowSelectionVisuals();

        if (
            syncSceneSelection &&
            !timelineRow.isChild
        ) {
            const object = timelineRow.object;

            if (object) {
                if (typeof window.selectObject === 'function') {
                    window.selectObject(object);
                } else {
                    window.selectedObject = object;
                }
            }
        }

        if (
            state.timelineDenseMode &&
            state.timelineDenseCanvas
        ) {
            drawDenseTimelineKeys(
                state.timelineDenseCanvas,
                state.timelineVisibleRows,
                timelineWidth(),
                state.timelineRowMetrics
            );
        }

        window.dispatchEvent(
            new CustomEvent('sm:timeline-row-selected', {
                detail: {
                    rowKey: timelineRow.rowKey,
                    uuid: timelineRow.uuid,
                    parentUuid: state.timelineSelectedParentUuid,
                    isChild: !!timelineRow.isChild,
                    object: timelineRow.object || null
                }
            })
        );
    }

    function ensureTimelineLoopVisual() {
        const container = $('keyframes-container');

        if (!container) return null;

        let zone = container.querySelector('#sm-timeline-loop-zone');

        if (!zone) {
            zone = document.createElement('div');
            zone.id = 'sm-timeline-loop-zone';
            zone.className = 'sm-timeline-loop-zone';

            const startHandle = document.createElement('div');
            startHandle.className = 'sm-timeline-loop-handle sm-timeline-loop-start';
            startHandle.title = 'Loop Start';

            const endHandle = document.createElement('div');
            endHandle.className = 'sm-timeline-loop-handle sm-timeline-loop-end';
            endHandle.title = 'Loop End';

            zone.appendChild(startHandle);
            zone.appendChild(endHandle);

            container.prepend(zone);

            const bindDrag = (handle, edge) => {
                if (handle.dataset.smLoopDragBound === '1') return;
                handle.dataset.smLoopDragBound = '1';

                handle.addEventListener('pointerdown', event => {
                    event.preventDefault();
                    event.stopPropagation();

                    const content = $('timeline-content');
                    if (!content) return;

                    handle.setPointerCapture?.(event.pointerId);

                    const move = moveEvent => {
                        const rect = content.getBoundingClientRect();
                        const x =
                            moveEvent.clientX -
                            rect.left +
                            (content.scrollLeft || 0);

                        const seconds = Math.max(
                            0,
                            Math.min(
                                state.duration,
                                xToTime(x)
                            )
                        );

                        if (edge === 'start') {
                            const endSeconds = Math.max(
                                seconds + 0.001,
                                Number(window.loopEnd || state.duration * 1000) / 1000
                            );

                            window.loopStart = Math.min(
                                seconds,
                                endSeconds - 0.001
                            ) * 1000;

                            if ($('loop-start-time')) {
                                $('loop-start-time').value =
                                    formatTime(window.loopStart / 1000);
                            }
                        } else {
                            const startSeconds = Math.max(
                                0,
                                Number(window.loopStart || 0) / 1000
                            );

                            window.loopEnd = Math.max(
                                startSeconds + 0.001,
                                seconds
                            ) * 1000;

                            if ($('loop-end-time')) {
                                $('loop-end-time').value =
                                    formatTime(window.loopEnd / 1000);
                            }
                        }

                        updateTimelineLoopVisual();
                    };

                    const up = upEvent => {
                        handle.releasePointerCapture?.(upEvent.pointerId);
                        window.removeEventListener('pointermove', move);
                        window.removeEventListener('pointerup', up);
                    };

                    window.addEventListener('pointermove', move);
                    window.addEventListener('pointerup', up);
                });
            };

            bindDrag(startHandle, 'start');
            bindDrag(endHandle, 'end');
        }

        return zone;
    }

    function updateTimelineLoopVisual() {
        const container = $('keyframes-container');
        const zone = ensureTimelineLoopVisual();

        if (!container || !zone) return;

        const duration = Math.max(
            0.001,
            Number(window.timelineDuration || state.duration || 30)
        );

        const rawStart = Math.max(
            0,
            Number(window.loopStart || 0) / 1000
        );

        const rawEnd = Number(window.loopEnd || 0) > 0
            ? Number(window.loopEnd) / 1000
            : duration;

        const start = Math.min(duration, rawStart);
        const end = Math.min(
            duration,
            Math.max(start + 0.001, rawEnd)
        );

        const startX = timeToX(start);
        const endX = timeToX(end);

        zone.style.left = `${startX}px`;
        zone.style.width = `${Math.max(1, endX - startX)}px`;
        zone.style.height = `${Math.max(
            container.scrollHeight,
            container.offsetHeight,
            1
        )}px`;

        zone.classList.toggle(
            'loop-disabled',
            !window.loopEnabled
        );

        zone.dataset.startFrame =
            String(Math.round(start * getFps()));

        zone.dataset.endFrame =
            String(Math.round(end * getFps()));
    }

    function renderTimelineLayersFromRows(rows) {
        const list = $('layers-list');
        if (!list) return;

        list.innerHTML = '';

        if (!rows.length) {
            const empty = document.createElement('div');
            empty.className = 'timeline-layer-item empty';
            empty.textContent = getTimelineSearchQuery()
                ? 'No animation tracks match the search'
                : 'Select an object and press ◆ to add keyframes';
            list.appendChild(empty);
            updateProfessionalTimelineStatus(rows);
            return;
        }

        // Keep a valid timeline selection after filters / collapse changes.
        if (
            state.timelineSelectedRowKey &&
            !rows.some(row => row.rowKey === state.timelineSelectedRowKey)
        ) {
            state.timelineSelectedRowKey = null;
            state.timelineSelectedUuid = null;
            state.timelineSelectedParentUuid = null;
        }

        rows.forEach((timelineRow, rowIndex) => {
            const obj = timelineRow.object;
            const row = document.createElement('div');

            row.className = 'timeline-layer-item ' + (
                timelineRow.isChild ? 'tl-bone-row' : 'tl-root-row'
            );

            row.dataset.uuid = timelineRow.uuid;
            row.dataset.rowKey = timelineRow.rowKey;
            row.dataset.rowIndex = String(rowIndex);

            if (timelineRow.parentUuid) {
                row.dataset.parentUuid = timelineRow.parentUuid;
            }

            if (isTimelineRowSelected(timelineRow)) {
                row.classList.add('selected', 'timeline-row-selected');
            }

            if (!timelineRow.isChild) {
                const expandHTML = timelineRow.hasChildren
                    ? `<span class="tl-expand-arrow${timelineRow.isExpanded ? ' open' : ''}" data-uuid="${timelineRow.uuid}">&#9654;</span>`
                    : `<span class="tl-expand-arrow empty"></span>`;

                let icon = '&#9679;';

                if (timelineRow.is2DLayer) icon = '&#9670;';
                else if (obj?.animations?.length) icon = '&#127987;';
                else if (obj?.isCamera) icon = '&#128247;';
                else if (obj?.isLight) icon = '&#128161;';
                else if (obj?.isBone) icon = '&#129460;';

                const clipBadge = timelineRow.clipCount > 0
                    ? `<span class="tl-layer-badge tl-clip-badge">${timelineRow.clipCount} clip${timelineRow.clipCount !== 1 ? 's' : ''}</span>`
                    : '';

                const trackBadge = timelineRow.hasChildren
                    ? `<span class="tl-layer-badge tl-bone-badge">${obj._animatedChildren.length} tracks</span>`
                    : '';

                row.innerHTML = `
                    ${expandHTML}
                    <span class="tl-layer-icon">${icon}</span>
                    <span class="layer-name">${timelineRow.is2DLayer ? '2D Animation' : timelineRow.labelName}</span>
                    ${clipBadge}
                    ${trackBadge}
                    <button class="sm-timeline-row-action" data-row-action="mute" title="Mute Track">M</button>
                    <button class="sm-timeline-row-action" data-row-action="lock" title="Lock Track">⌑</button>
                `;

                row.addEventListener('click', event => {
                    if (
                        event.target.closest('.tl-expand-arrow') ||
                        event.target.closest('.sm-timeline-row-action')
                    ) {
                        return;
                    }

                    event.stopPropagation();

                    // Root rows may synchronize with the viewport selection.
                    selectTimelineRow(
                        timelineRow,
                        { syncSceneSelection: true }
                    );
                });

                if (timelineRow.hasChildren) {
                    row.querySelector('.tl-expand-arrow')?.addEventListener('click', event => {
                        event.stopPropagation();

                        if (_expandedRoots.has(obj.uuid)) {
                            _expandedRoots.delete(obj.uuid);
                        } else {
                            _expandedRoots.add(obj.uuid);
                        }

                        updateLayersUI();
                        updateKeyframesUI();
                    });
                }
            } else {
                const child = timelineRow.object;
                const boneIcon = child?.isBone ? '&#129460;' : '&#128279;';

                row.innerHTML = `
                    <span class="tl-bone-indent"></span>
                    <span class="tl-layer-icon tl-bone-icon">${boneIcon}</span>
                    <span class="layer-name tl-bone-name">${timelineRow.labelName}</span>
                    <span class="tl-kf-count">${timelineRow.keys.length}◆</span>
                    <button class="sm-timeline-row-action" data-row-action="mute" title="Mute Track">M</button>
                    <button class="sm-timeline-row-action" data-row-action="lock" title="Lock Track">⌑</button>
                `;

                row.addEventListener('click', event => {
                    if (event.target.closest('.sm-timeline-row-action')) return;

                    event.preventDefault();
                    event.stopPropagation();

                    /*
                     * IMPORTANT:
                     * Do NOT call window.selectObject(parentModel) for sub-items.
                     * That global scene-selection path can trigger camera/focus
                     * or timeline re-framing in other SM Engine systems.
                     *
                     * A Dope Sheet channel selection is a timeline selection.
                     */
                    selectTimelineRow(
                        timelineRow,
                        { syncSceneSelection: false }
                    );
                });
            }

            row.querySelectorAll('.sm-timeline-row-action').forEach(button => {
                button.addEventListener('click', event => {
                    event.stopPropagation();
                    button.classList.toggle('active');

                    window.dispatchEvent(new CustomEvent('sm:timeline-ui-row-action', {
                        detail: {
                            action: button.dataset.rowAction,
                            rowKey: timelineRow.rowKey,
                            uuid: timelineRow.uuid,
                            active: button.classList.contains('active')
                        }
                    }));
                });
            });

            list.appendChild(row);
        });

        updateTimelineRowSelectionVisuals();
        updateProfessionalTimelineStatus(rows);
    }

    function updateLayersUI() {
        const rows = buildTimelineVisibleRows();
        renderTimelineLayersFromRows(rows);
        requestTimelineRowAlignment();
    }


    function measureTimelineRowMetrics(rows = state.timelineVisibleRows) {
        const list = $('layers-list');
        const fallbackHeight = Math.max(
            22,
            Number(state.timelineDefaultRowHeight) || 26
        );

        let fallbackTop = 0;

        const metrics = (rows || []).map((row, index) => {
            const selector = `.timeline-layer-item[data-row-key="${CSS.escape(row.rowKey)}"]`;
            const element = list?.querySelector(selector) || null;

            const measuredHeight = element
                ? Math.round(element.getBoundingClientRect().height)
                : fallbackHeight;

            const height = Math.max(22, measuredHeight || fallbackHeight);

            // offsetTop is relative to #layers-list. This is exactly what we
            // need because the right #keyframes-container also starts below
            // its ruler at local top 0.
            let top = element ? Math.round(element.offsetTop) : fallbackTop;

            if (!Number.isFinite(top) || top < fallbackTop - 2) {
                top = fallbackTop;
            }

            const metric = {
                rowKey: row.rowKey,
                uuid: row.uuid,
                index,
                top,
                height,
                bottom: top + height
            };

            fallbackTop = metric.bottom;

            return metric;
        });

        state.timelineRowMetrics = metrics;

        return metrics;
    }

    function requestTimelineRowAlignment() {
        if (state.timelineAlignmentRaf) {
            cancelAnimationFrame(state.timelineAlignmentRaf);
        }

        state.timelineAlignmentRaf = requestAnimationFrame(() => {
            state.timelineAlignmentRaf = 0;
            alignTimelineRowsToLayers();
        });
    }

    function alignTimelineRowsToLayers() {
        const container = $('keyframes-container');
        if (!container) return;

        const rows = state.timelineVisibleRows?.length
            ? state.timelineVisibleRows
            : buildTimelineVisibleRows();

        const metrics = measureTimelineRowMetrics(rows);
        const trackByRowKey = new Map();

        container
            .querySelectorAll('.timeline-track-row[data-row-key]')
            .forEach(track => {
                trackByRowKey.set(track.dataset.rowKey, track);
            });

        metrics.forEach(metric => {
            const track = trackByRowKey.get(metric.rowKey);
            if (!track) return;

            track.style.top = `${metric.top}px`;
            track.style.height = `${metric.height}px`;
            track.style.minHeight = `${metric.height}px`;
            track.style.maxHeight = `${metric.height}px`;
        });

        const totalHeight = metrics.length
            ? metrics[metrics.length - 1].bottom
            : Math.max(1, Number(state.timelineDefaultRowHeight) || 26);

        container.style.height = `${totalHeight}px`;
        container.style.minHeight = `${totalHeight}px`;

        if (state.timelineDenseMode && state.timelineDenseCanvas) {
            drawDenseTimelineKeys(
                state.timelineDenseCanvas,
                rows,
                timelineWidth(),
                metrics
            );
        }

        renderTimelineScale();
        updateTimelineLoopVisual();
    }

    function syncProfessionalTimelineViewTabs(view = state.activeView) {
        document
            .querySelectorAll('#timelineBody [data-timeline-pro-view]')
            .forEach(button => {
                button.classList.toggle(
                    'active',
                    button.dataset.timelineProView === view
                );
            });
    }

    function bindTimelineScrollSync() {
        const layers = document.querySelector('#timelineBody .timeline-layers') || q('.timeline-layers');
        const content = $('timeline-content');

        if (!layers || !content) return;

        if (
            layers.dataset.timelineSyncBound === '1' &&
            content.dataset.timelineSyncBound === '1'
        ) {
            return;
        }

        layers.dataset.timelineSyncBound = '1';
        content.dataset.timelineSyncBound = '1';

        let syncLock = false;

        layers.addEventListener('scroll', () => {
            if (syncLock) return;

            syncLock = true;
            content.scrollTop = layers.scrollTop;

            requestAnimationFrame(() => {
                syncLock = false;
            });
        }, { passive: true });

        content.addEventListener('scroll', () => {
            const scale = q('.timeline-scale');

            if (scale) {
                scale.style.transform = `translateX(${-content.scrollLeft}px)`;
            }

            if (syncLock) return;

            syncLock = true;
            layers.scrollTop = content.scrollTop;

            requestAnimationFrame(() => {
                syncLock = false;
            });
        }, { passive: true });
    }

    function bindProfessionalTimelineUI() {
        const root = $('timelineBody');

        if (!root) return;
        if (root.dataset.timelineProfessionalBound === '1') return;

        root.dataset.timelineProfessionalBound = '1';

        root.addEventListener('click', event => {
            const viewButton = event.target.closest('[data-timeline-pro-view]');

            if (viewButton) {
                setTimelineView(viewButton.dataset.timelineProView);
                return;
            }

            const tool = event.target.closest('[data-timeline-ui-tool]');

            if (tool) {
                tool
                    .parentElement
                    ?.querySelectorAll('[data-timeline-ui-tool]')
                    .forEach(button => {
                        button.classList.toggle('active', button === tool);
                    });

                window.dispatchEvent(new CustomEvent('sm:timeline-ui-tool', {
                    detail: {
                        tool: tool.dataset.timelineUiTool
                    }
                }));

                return;
            }

            const toggle = event.target.closest('[data-timeline-ui-toggle]');

            if (toggle) {
                toggle.classList.toggle('active');

                window.dispatchEvent(new CustomEvent('sm:timeline-ui-toggle', {
                    detail: {
                        toggle: toggle.dataset.timelineUiToggle,
                        active: toggle.classList.contains('active')
                    }
                }));

                return;
            }

            const action = event.target.closest('[data-timeline-ui-action]');

            if (action) {
                window.dispatchEvent(new CustomEvent('sm:timeline-ui-action', {
                    detail: {
                        action: action.dataset.timelineUiAction
                    }
                }));
            }
        });

        const search = $('timeline-track-search');

        search?.addEventListener('input', () => {
            state.timelineSearchQuery = String(search.value || '').trim();
            updateLayersUI();
            updateKeyframesUI();
        });

        $('timeline-track-search-clear')?.addEventListener('click', () => {
            if (search) search.value = '';
            state.timelineSearchQuery = '';
            updateLayersUI();
            updateKeyframesUI();
            search?.focus();
        });

        $('timeline-collapse-all')?.addEventListener('click', () => {
            _expandedRoots.clear();
            updateLayersUI();
            updateKeyframesUI();
        });

        $('timeline-expand-all')?.addEventListener('click', () => {
            collectTimelineObjects().forEach(obj => {
                if (obj._animatedChildren?.length) {
                    _expandedRoots.add(obj.uuid);
                }
            });

            updateLayersUI();
            updateKeyframesUI();
        });

        $('timeline-pro-interpolation')?.addEventListener('change', event => {
            const existing = $('interpolation-type-select');

            if (existing) {
                existing.value = event.target.value;
                existing.dispatchEvent(new Event('change', { bubbles: true }));
            }
        });

        $('timeline-pro-fps')?.addEventListener('change', event => {
            // Frontend control is allowed to update the common FPS display/state
            // only when the engine exposes writable window.fps.
            const value = Number(event.target.value);

            if (Number.isFinite(value) && value > 0) {
                window.fps = value;
                updateKeyframesUI();
                renderGraph();
            }
        });

        bindTimelineScrollSync();
        syncProfessionalTimelineViewTabs();

        requestTimelineRowAlignment();
    }

    function renderTimelineScale() {
        const scale = q('.timeline-scale');
        const content = $('timeline-content');
        if (!scale || !content) return;

        injectBlenderTimelineGridStyles();

        // Keep one full-height canvas behind the keyframes. This is deliberately
        // canvas-based instead of hundreds of DOM lines so zooming stays cheap.
        let canvas = $('timeline-grid-canvas');
        if (!canvas) {
            canvas = document.createElement('canvas');
            canvas.id = 'timeline-grid-canvas';
            content.prepend(canvas);
        }

        const fps = Math.max(1, getFps());
        const duration = Math.max(1, Number(window.timelineDuration || state.duration || 30));
        state.duration = duration;

        const totalFrames = Math.max(1, Math.round(duration * fps));
        const width = Math.max(1, timelineWidth());
        const viewportHeight = Math.max(
            content.clientHeight || 0,
            content.parentElement?.clientHeight || 0,
            240
        );
        const keyHeight = Math.max(
            $('keyframes-container')?.scrollHeight || 0,
            $('keyframes-container')?.offsetHeight || 0
        );
        const height = Math.max(viewportHeight, keyHeight);

        // Make the timeline content physically cover the whole visible body so
        // the grid is still visible when there are zero tracks/keyframes.
        content.style.minHeight = `${viewportHeight}px`;
        content.style.width = `${width}px`;

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.max(1, Math.floor(width * dpr));
        canvas.height = Math.max(1, Math.floor(height * dpr));
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;

        scale.style.width = `${width}px`;
        scale.innerHTML = '';

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, width, height);

        // Blender-like flat dark body.
        ctx.fillStyle = '#2f2f2f';
        ctx.fillRect(0, 0, width, height);

        const pxPerFrame = width / totalFrames;

        // We only draw a minor line when it is separated enough to remain
        // readable. Medium/major lines stay visible at wider zoom ranges.
        let minorStep = 1;
        if (pxPerFrame < 3.5) minorStep = 5;
        else if (pxPerFrame < 7) minorStep = 2;

        let mediumStep = Math.max(5, minorStep * 5);
        let majorStep = Math.max(10, mediumStep * 2);

        // On a very zoomed-out timeline make the groups wider, like Blender.
        if (pxPerFrame * majorStep < 34) {
            majorStep = Math.ceil(34 / Math.max(pxPerFrame, 0.001));
            majorStep = Math.max(10, Math.ceil(majorStep / 5) * 5);
            mediumStep = Math.max(5, Math.floor(majorStep / 2 / 5) * 5);
        }

        const drawVerticalGroup = (step, color, widthPx = 1, skip = null) => {
            ctx.strokeStyle = color;
            ctx.lineWidth = widthPx;
            ctx.beginPath();
            for (let frame = 0; frame <= totalFrames; frame += step) {
                if (skip && skip(frame)) continue;
                const x = Math.round(timeToX(frame / fps)) + 0.5;
                ctx.moveTo(x, 0);
                ctx.lineTo(x, height);
            }
            ctx.stroke();
        };

        // Subtle frame subdivisions.
        drawVerticalGroup(
            minorStep,
            'rgba(0, 0, 0, 0.22)',
            1,
            frame => frame % mediumStep === 0
        );

        // Mid grid columns.
        drawVerticalGroup(
            mediumStep,
            'rgba(0, 0, 0, 0.34)',
            1,
            frame => frame % majorStep === 0
        );

        // Strong Blender-style major columns.
        drawVerticalGroup(
            majorStep,
            'rgba(0, 0, 0, 0.52)',
            1
        );

        // Frame zero gets a slightly stronger separator.
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.72)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0.5, 0);
        ctx.lineTo(0.5, height);
        ctx.stroke();

        // Horizontal row separators use the SAME measured row metrics as the
        // left layer list. This prevents the visual grid from drifting away
        // from clips/keyframes when the UI row height changes.
        const metrics = state.timelineRowMetrics || [];
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.20)';
        ctx.lineWidth = 1;
        ctx.beginPath();

        if (metrics.length) {
            metrics.forEach(metric => {
                const y = Number(metric.bottom);
                if (!Number.isFinite(y) || y <= 0 || y >= height) return;
                const py = Math.round(y) + 0.5;
                ctx.moveTo(0, py);
                ctx.lineTo(width, py);
            });
        } else {
            const rowHeight = Number(state.timelineDefaultRowHeight) || 26;
            for (let y = rowHeight; y < height; y += rowHeight) {
                const py = Math.round(y) + 0.5;
                ctx.moveTo(0, py);
                ctx.lineTo(width, py);
            }
        }

        ctx.stroke();

        // Ruler labels: only major groups, plus medium groups when there is
        // enough visual room. This prevents the ruler from looking crowded.
        const fragment = document.createDocumentFragment();
        const labelEvery = majorStep;
        const mediumLabelsAllowed = pxPerFrame * mediumStep >= 58;

        for (let frame = 0; frame <= totalFrames; frame += mediumStep) {
            const isMajor = frame % labelEvery === 0;
            if (!isMajor && !mediumLabelsAllowed) continue;

            const x = timeToX(frame / fps);
            const marker = document.createElement('div');
            marker.className = `timeline-scale-marker${isMajor ? ' major' : ' medium'}`;
            marker.style.left = `${x}px`;

            const label = document.createElement('span');
            label.className = 'timeline-scale-label';
            label.textContent = String(frame);
            marker.appendChild(label);
            fragment.appendChild(marker);
        }

        scale.appendChild(fragment);
    }

    function getTimelineThemeColor(name, fallback) {
        const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
        return value || fallback;
    }
    function getTimelineMapEntries(map) {
        return Object.entries(map || {}).map(([frame, data]) => {
            const numericFrame = Number(frame);
            const time = Number(data?.time ?? (numericFrame / getFps()));
            return { frame: numericFrame, data, time };
        }).filter(item => Number.isFinite(item.time)).sort((a, b) => a.time - b.time);
    }
    function createDenseTimelineCanvas(container, width, height) {
        let canvas = document.getElementById('timeline-dense-keyframe-canvas');
        if (!canvas) {
            canvas = document.createElement('canvas');
            canvas.id = 'timeline-dense-keyframe-canvas';
            canvas.style.position = 'absolute';
            canvas.style.left = '0';
            canvas.style.top = '0';
            canvas.style.pointerEvents = 'none';
            canvas.style.zIndex = '3';
            container.prepend(canvas);
        }
        const maxCanvasWidth = 16384;
        const maxCanvasHeight = 8192;
        const renderWidth = Math.max(1, Math.min(maxCanvasWidth, Math.ceil(width)));
        const renderHeight = Math.max(1, Math.min(maxCanvasHeight, Math.ceil(height)));
        canvas.width = renderWidth;
        canvas.height = renderHeight;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        canvas._timelineScaleX = renderWidth / Math.max(1, width);
        canvas._timelineScaleY = renderHeight / Math.max(1, height);
        return canvas;
    }

    function drawDenseTimelineKeys(canvas, rows, width, rowMetrics = state.timelineRowMetrics) {
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const metrics = Array.isArray(rowMetrics) && rowMetrics.length === rows.length
            ? rowMetrics
            : rows.map((row, index) => ({
                top: index * (Number(state.timelineDefaultRowHeight) || 26),
                height: Number(state.timelineDefaultRowHeight) || 26
            }));

        const totalHeight = metrics.length
            ? metrics[metrics.length - 1].top + metrics[metrics.length - 1].height
            : Number(state.timelineDefaultRowHeight) || 26;

        const scaleX = canvas._timelineScaleX || 1;
        const scaleY = canvas._timelineScaleY || 1;

        ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);
        ctx.clearRect(0, 0, width, totalHeight);

        const rootColor = getTimelineThemeColor('--accent-cyan-light', '#73c5d2');
        const childColor = getTimelineThemeColor('--accent-cyan', '#4aa8b8');
        const summaryColor = getTimelineThemeColor('--text-secondary', '#b0b0b0');

        rows.forEach((row, rowIndex) => {
            const metric = metrics[rowIndex];
            if (!metric) return;

            const centerY = metric.top + metric.height * 0.5;
            const keys = row.keys || [];

            if (!keys.length) return;

            const selectedRow =
                state.timelineSelectedRowKey === row.rowKey;

            ctx.fillStyle = selectedRow
                ? '#f2f2f2'
                : row.isSummary
                    ? summaryColor
                    : row.isChild
                        ? childColor
                        : rootColor;

            ctx.beginPath();

            let lastPixel = -Infinity;

            for (let i = 0; i < keys.length; i++) {
                const item = keys[i];
                const x = timeToX(item.time);

                if (!Number.isFinite(x) || x < -10 || x > width + 10) {
                    continue;
                }

                const pixel = Math.round(x);

                if (pixel - lastPixel < 2 && i !== keys.length - 1) {
                    continue;
                }

                lastPixel = pixel;

                const size = row.isSummary ? 2.4 : 3;

                ctx.moveTo(x, centerY - size);
                ctx.lineTo(x + size, centerY);
                ctx.lineTo(x, centerY + size);
                ctx.lineTo(x - size, centerY);
                ctx.closePath();
            }

            ctx.fill();
        });
    }
    function removeDenseTimelineCanvas() {
        const canvas = document.getElementById('timeline-dense-keyframe-canvas');
        if (canvas) canvas.remove();
        state.timelineDenseCanvas = null;
    }
    function scheduleTimelineUIRefresh() {
        if (state.timelineUIRaf) return;
        state.timelineUIRaf = requestAnimationFrame(() => {
            state.timelineUIRaf = 0;
            updateKeyframesUI();
        });
    }

    function updateTimelineGridTheme() {
        const root = document.documentElement;
        const stateRef = window.timelineState || window.state || {};
        const zoomX = Number(stateRef.zoomX || stateRef.timelineZoomX || 1);
        let framePx = Math.max(6, Math.min(28, 12 * zoomX));
        let minorStep = 1;
        let mediumStep = 5;
        let majorStep = 10;

        if (framePx < 8) {
            minorStep = 2;
            mediumStep = 10;
            majorStep = 20;
        }
        if (framePx < 6.8) {
            minorStep = 5;
            mediumStep = 10;
            majorStep = 20;
        }
        if (framePx > 18) {
            minorStep = 1;
            mediumStep = 5;
            majorStep = 10;
        }
        if (framePx > 24) {
            minorStep = 1;
            mediumStep = 5;
            majorStep = 20;
        }

        root.style.setProperty('--tl-frame-px', framePx + 'px');
        root.style.setProperty('--tl-minor-step', String(minorStep));
        root.style.setProperty('--tl-medium-step', String(mediumStep));
        root.style.setProperty('--tl-major-step', String(majorStep));
    }

    function renderTimelineRuler() {
        const ruler = document.getElementById('timeline-ruler');
        if (!ruler) return;

        const stateRef = window.timelineState || window.state || {};
        const scrollLeft = Number(stateRef.scrollLeft || 0);
        const totalFrames = Number(stateRef.totalFrames || 300);
        const currentFrame = Number(stateRef.currentFrame || 0);

        const framePx = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tl-frame-px')) || 12;
        const minorStep = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--tl-minor-step')) || 1;
        const mediumStep = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--tl-medium-step')) || 5;
        const majorStep = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--tl-major-step')) || 10;

        const width = ruler.clientWidth;
        ruler.innerHTML = '';

        const startFrame = Math.floor(scrollLeft / framePx);
        const endFrame = Math.ceil((scrollLeft + width) / framePx) + 1;

        for (let frame = startFrame; frame <= Math.min(totalFrames, endFrame); frame += minorStep) {
            const x = Math.round(frame * framePx - scrollLeft);
            if (x < 0 || x > width) continue;

            const tick = document.createElement('div');
            tick.className = 'timeline-ruler-tick';

            if (frame % majorStep === 0) {
                tick.classList.add('major');
            } else if (frame % mediumStep === 0) {
                tick.classList.add('medium');
            } else {
                tick.classList.add('minor');
            }

            tick.style.left = x + 'px';
            ruler.appendChild(tick);

            if (frame % majorStep === 0) {
                const label = document.createElement('div');
                label.className = 'timeline-ruler-label major';
                label.style.left = (x + 4) + 'px';
                label.textContent = String(frame);
                ruler.appendChild(label);
            } else if (frame % mediumStep === 0 && framePx >= 14) {
                const label = document.createElement('div');
                label.className = 'timeline-ruler-label medium';
                label.style.left = (x + 3) + 'px';
                label.textContent = String(frame);
                ruler.appendChild(label);
            }
        }

        let playhead = document.getElementById('timeline-playhead');
        if (!playhead) {
            playhead = document.createElement('div');
            playhead.id = 'timeline-playhead';
            playhead.className = 'timeline-playhead-line';
            ruler.parentElement?.appendChild(playhead);

            const head = document.createElement('div');
            head.className = 'timeline-playhead-head';
            head.id = 'timeline-playhead-head';
            playhead.appendChild(head);
        }

        const playheadX = Math.round(currentFrame * framePx - scrollLeft);
        playhead.style.left = playheadX + 'px';
        playhead.style.display = (playheadX >= -10 && playheadX <= width + 10) ? 'block' : 'none';
    }

    function refreshTimelineRowStyling() {
        const rows = document.querySelectorAll('.timeline-track-row,.timeline-row');
        rows.forEach((row, index) => {
            row.classList.remove('group-separator');
            if (index % 2 === 0) {
                row.style.backgroundColor = 'var(--tl-bg-row-a)';
            } else {
                row.style.backgroundColor = 'var(--tl-bg-row-b)';
            }
            const isGroupStart = row.dataset.groupStart === '1' || row.classList.contains('track-group-start');
            if (isGroupStart) {
                row.classList.add('group-separator');
            }
        });
    }

    function updateKeyframesUI() {
        ensureMaps();

        const container = $('keyframes-container');
        const content = $('timeline-content');

        if (!container || !content) return;

        state.duration = Math.max(
            1,
            Number(window.timelineDuration || state.duration || 30)
        );

        const width = timelineWidth();

        /*
         * SINGLE SOURCE OF TRUTH
         * ----------------------
         * Both left layer items and right tracks use this exact row array.
         */
        const rows = buildTimelineVisibleRows();

        if (!timelineLayerDOMMatchesRows(rows)) {
            renderTimelineLayersFromRows(rows);
        }

        const metrics = measureTimelineRowMetrics(rows);

        content.style.width = `${width}px`;

        container.innerHTML = '';
        container.style.position = 'relative';
        container.style.width = `${width}px`;

        const totalHeight = metrics.length
            ? metrics[metrics.length - 1].bottom
            : Math.max(1, Number(state.timelineDefaultRowHeight) || 26);

        const totalKeyCount = rows.reduce(
            (total, row) => total + (row.keys?.length || 0),
            0
        );

        state.timelineLastKeyCount = totalKeyCount;
        state.timelineDenseMode =
            totalKeyCount >= Math.max(
                500,
                Number(state.timelineDenseThreshold) || 3500
            );

        const makeRow = (row, rowIndex) => {
            const metric = metrics[rowIndex] || {
                top: rowIndex * (Number(state.timelineDefaultRowHeight) || 26),
                height: Number(state.timelineDefaultRowHeight) || 26
            };

            const element = document.createElement('div');

            element.className =
                'timeline-track-row' +
                (row.isChild ? ' tl-bone-track' : ' tl-root-track');

            element.dataset.uuid = row.uuid;
            element.dataset.rowKey = row.rowKey;
            element.dataset.rowIndex = String(rowIndex);

            if (row.parentUuid) {
                element.dataset.parentUuid = row.parentUuid;
            }

            element.style.top = `${metric.top}px`;
            element.style.height = `${metric.height}px`;
            element.style.minHeight = `${metric.height}px`;
            element.style.maxHeight = `${metric.height}px`;
            element.style.width = `${width}px`;

            const line = document.createElement('div');
            line.className = 'timeline-track-line';
            element.appendChild(line);

            if (isTimelineRowSelected(row)) {
                element.classList.add(
                    'selected-object-track',
                    'timeline-row-selected'
                );
            }

            /*
             * Frontend visual AnimationClip bar. This does NOT change or play
             * the THREE.AnimationClip; it only shows which root item owns it.
             */
            if (!row.isChild && row.object?.animations?.length) {
                const clips = row.object.animations;
                const activeClip =
                    clips.find(clip =>
                        clip === row.object.userData?.activeAnimationClip ||
                        clip?.name === row.object.userData?.activeAnimationClip
                    ) ||
                    clips[0];

                if (activeClip) {
                    const clipDuration = Math.max(
                        0,
                        Math.min(
                            state.duration,
                            Number(activeClip.duration) || state.duration
                        )
                    );

                    const clipVisual = document.createElement('div');
                    clipVisual.className = 'timeline-native-clip-visual active';
                    clipVisual.style.left = '0px';
                    clipVisual.style.width = `${Math.max(18, timeToX(clipDuration))}px`;

                    const extra = clips.length > 1
                        ? `<span class="timeline-native-clip-visual-count">+${clips.length - 1}</span>`
                        : '';

                    clipVisual.innerHTML = `
                        <span>${activeClip.name || 'Animation Clip'}</span>
                        ${extra}
                    `;

                    element.appendChild(clipVisual);
                }
            }

            if (!row.isChild) {
                element.addEventListener('dblclick', event => {
                    const rect = element.getBoundingClientRect();
                    const scrollLeft = content.scrollLeft || 0;

                    setCurrentTime(
                        xToTime(event.clientX - rect.left + scrollLeft)
                    );

                    if (typeof window.selectObject === 'function') {
                        window.selectObject(row.object);
                    } else {
                        window.selectedObject = row.object;
                    }

                    addKeyframe();
                });
            }

            return element;
        };

        rows.forEach((row, rowIndex) => {
            container.appendChild(
                makeRow(row, rowIndex)
            );
        });

        container.style.height = `${totalHeight}px`;
        container.style.minHeight = `${totalHeight}px`;

        /*
         * Render ruler/grid AFTER the correct container height and row metrics
         * are known.
         */
        renderTimelineScale();
        updateTimelineLoopVisual();

        if (state.timelineDenseMode) {
            state.selectedKeyframes.clear();

            const canvas = createDenseTimelineCanvas(
                container,
                width,
                totalHeight
            );

            state.timelineDenseCanvas = canvas;

            drawDenseTimelineKeys(
                canvas,
                rows,
                width,
                metrics
            );

            container.classList.add('timeline-dense-mode');
        } else {
            removeDenseTimelineCanvas();
            container.classList.remove('timeline-dense-mode');

            const makeKeyElement = (row, item) => {
                if (item.kind === 'summary') {
                    const key = document.createElement('div');

                    key.className =
                        'keyframe keyframe-summary';

                    key.dataset.uuid =
                        item.uuid || row.uuid;

                    key.dataset.frame =
                        item.frame;

                    key.dataset.time =
                        item.time;

                    key.style.left =
                        `${timeToX(item.time)}px`;

                    key.title =
                        `Animation keyframe @ ${formatTime(item.time)}`;

                    key.addEventListener('click', event => {
                        event.stopPropagation();
                        setCurrentTime(item.time);
                    });

                    return key;
                }

                const key =
                    document.createElement('div');

                key.className =
                    'keyframe' +
                    (row.is2DLayer ? ' keyframe-2d' : '') +
                    (row.isChild ? ' keyframe-bone' : '');

                key.dataset.uuid =
                    row.uuid;

                key.dataset.frame =
                    item.frame;

                key.dataset.time =
                    item.time;

                key.title =
                    `${row.labelName} @ ${formatTime(item.time)}`;

                key.style.left =
                    `${timeToX(item.time)}px`;

                const selectionKey =
                    keyframeKey(
                        row.uuid,
                        item.frame
                    );

                if (
                    state.selectedKeyframes.has(
                        selectionKey
                    )
                ) {
                    key.classList.add(
                        'selected'
                    );

                    state.selectedKeyframes.set(
                        selectionKey,
                        key
                    );
                }

                key.addEventListener(
                    'click',
                    event => {
                        event.stopPropagation();

                        const additive =
                            event.shiftKey ||
                            event.ctrlKey ||
                            event.metaKey;

                        if (additive) {
                            toggleKeyframeSelected(key);
                        } else {
                            selectOnlyKeyframe(key);
                        }

                        setCurrentTime(item.time);

                        if (
                            row.is2DLayer &&
                            window.animation2DManager
                                ?.isActive
                        ) {
                            window.animation2DManager
                                .onTimeUpdate();
                        }
                    }
                );

                return key;
            };

            rows.forEach(row => {
                const rowElement =
                    container.querySelector(
                        `.timeline-track-row[data-row-key="${CSS.escape(row.rowKey)}"]`
                    );

                if (!rowElement) return;

                row.keys.forEach(item => {
                    rowElement.appendChild(
                        makeKeyElement(
                            row,
                            item
                        )
                    );
                });
            });
        }

        updateProfessionalTimelineStatus(rows);
        updatePlayhead();
        bindTimelineScrollSync();

        // A final frame catches font/layout changes and guarantees perfect
        // left/right parallel alignment.
        requestTimelineRowAlignment();
        updateTimelineRowSelectionVisuals();
        updateTimelineLoopVisual();
    }


    function updateTimeDisplay() {
        const display = $('time-display');
        if (!display) return;
        const value = formatTime(getCurrentTime());
        if (display.tagName === 'INPUT') {
            display.value = value;
        } else {
            display.textContent = value;
        }
    }

    function updatePlayhead() {
        const current = getCurrentTime();
        const playhead = $('playhead');

        if (playhead) {
            const x = timeToX(current);
            playhead.style.transform = 'none';
            playhead.style.left = `${x}px`;
        }

        updateTimeDisplay();

        const statusFrame = $('timeline-status-frame');

        if (statusFrame) {
            statusFrame.textContent = String(frameForTime(current));
        }
    }

    function clampGraph(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }
    function graphTimeToX(time, canvas) {
        return state.graphPanX + Number(time || 0) * state.graphPixelsPerSecond;
    }
    function graphXToTime(x, canvas) {
        return (Number(x || 0) - state.graphPanX) / Math.max(0.0001, state.graphPixelsPerSecond);
    }
    function graphValueToY(value, canvas) {
        const header = state.graphHeaderHeight || 24;
        const mid = (canvas.height + header) * 0.5;
        return mid - (Number(value || 0) * state.graphValueScale) + state.graphPanY;
    }
    function graphYToValue(y, canvas) {
        const header = state.graphHeaderHeight || 24;
        const mid = (canvas.height + header) * 0.5;
        return (mid + state.graphPanY - Number(y || 0)) / Math.max(0.0001, state.graphValueScale);
    }
    function niceGraphStep(rawStep) {
        if (!Number.isFinite(rawStep) || rawStep <= 0) return 1;
        const exponent = Math.floor(Math.log10(rawStep));
        const fraction = rawStep / Math.pow(10, exponent);
        let niceFraction = 1;
        if (fraction <= 1) niceFraction = 1;
        else if (fraction <= 2) niceFraction = 2;
        else if (fraction <= 5) niceFraction = 5;
        else niceFraction = 10;
        return niceFraction * Math.pow(10, exponent);
    }
    function getGraphTimeMajorStep() {
        const targetPx = 90;
        const rawStep = targetPx / Math.max(0.0001, state.graphPixelsPerSecond);
        return niceGraphStep(rawStep);
    }
    function getGraphTimeMinorStep(majorStep) {
        if (majorStep >= 10) return majorStep / 5;
        if (majorStep >= 1) return majorStep / 5;
        return majorStep / 4;
    }
    function getGraphValueMajorStep() {
        const targetPx = 72;
        const rawStep = targetPx / Math.max(0.0001, state.graphValueScale);
        return niceGraphStep(rawStep);
    }
    function getGraphValueMinorStep(majorStep) {
        return majorStep / 4;
    }
    function zoomGraphXAt(canvas, anchorX, zoomFactor) {
        const before = graphXToTime(anchorX, canvas);
        state.graphPixelsPerSecond = clampGraph(state.graphPixelsPerSecond * zoomFactor, state.graphMinPixelsPerSecond || 6, state.graphMaxPixelsPerSecond || 12000);
        const afterX = graphTimeToX(before, canvas);
        state.graphPanX += anchorX - afterX;
    }
    function zoomGraphYAt(canvas, anchorY, zoomFactor) {
        const before = graphYToValue(anchorY, canvas);
        state.graphValueScale = clampGraph(state.graphValueScale * zoomFactor, state.graphMinValueScale || 12, state.graphMaxValueScale || 6000);
        const afterY = graphValueToY(before, canvas);
        state.graphPanY += anchorY - afterY;
    }
    function frameGraphAllCurves() {
        const graphTarget = state.activeGraphObject || getSelectedObject();
        const graphData = getGraphEntriesForTarget(graphTarget);
        const entries = graphData?.entries || [];
        if (!entries.length) return;
        fitGraphToKeyframes(entries);
        renderGraph();
    }
    function setKeyframeValue(data, channel, value) {
        const [prop, axis] = channel.split('.');
        if (prop === 'rotation') {
            data.rotationEuler = data.rotationEuler || { x: 0, y: 0, z: 0 };
            data.rotationEuler[axis] = value;
            const e = new THREE.Euler(data.rotationEuler.x || 0, data.rotationEuler.y || 0, data.rotationEuler.z || 0, 'XYZ');
            data.rotation = new THREE.Quaternion().setFromEuler(e);
            return;
        }
        if (!data[prop]) data[prop] = new THREE.Vector3(1, 1, 1);
        data[prop][axis] = value;
    }

    function getKeyframeValue(data, channel) {
        if (!data || !channel) return 0;
        const [prop, axis] = channel.split('.');
        if (prop === 'rotation') {
            // Convert stored Quaternion back to Euler for display in the graph
            if (data.rotationEuler) return Number(data.rotationEuler[axis] || 0);
            if (data.rotation) {
                const q = data.rotation;
                const e = new THREE.Euler().setFromQuaternion(
                    new THREE.Quaternion(q.x || 0, q.y || 0, q.z || 0, q.w != null ? q.w : 1), 'XYZ'
                );
                return Number(e[axis] || 0);
            }
            return 0;
        }
        const vec = data[prop];
        if (!vec) return 0;
        return Number(vec[axis] != null ? vec[axis] : (typeof vec === 'number' ? vec : 0));
    }

    function ensureTangents(data, channel) {
        data.graphTangents = data.graphTangents || {};
        data.graphTangents[channel] = data.graphTangents[channel] || {
            in: { dx: -0.35, dy: 0 },
            out: { dx: 0.35, dy: 0 }
        };
        return data.graphTangents[channel];
    }

    function graphThemeColor(name, fallback) {
        const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
        return value || fallback;
    }
    function graphThemeRGBA(name, alpha, fallback = '255,255,255') {
        const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
        return `rgba(${value || fallback},${alpha})`;
    }
    function getGraphChannelColor(channel) {
        switch (channel) {
            case 'position.x': return graphThemeColor('--axis-x-color', '#ff455b');
            case 'position.y': return graphThemeColor('--axis-y-color', '#4caf50');
            case 'position.z': return graphThemeColor('--axis-z-color', '#2b8cee');
            case 'rotation.x': return graphThemeColor('--accent-orange-light', '#e6c27a');
            case 'rotation.y': return graphThemeColor('--accent-purple', '#8b5cf6');
            case 'rotation.z': return graphThemeColor('--accent-info', '#00bcd4');
            case 'scale.x': return graphThemeColor('--accent-danger', '#e74c3c');
            case 'scale.y': return graphThemeColor('--accent-success', '#4caf50');
            case 'scale.z': return graphThemeColor('--accent-blue', '#5f5f5f');
            default: return graphThemeColor('--text-secondary', '#b0b0b0');
        }
    }
    function parseGraphTrackBinding(trackName) {
        const text = String(trackName || '');
        const match = text.match(/^(.*)\.(position|quaternion|scale)$/);
        if (!match) return null;
        let targetPath = match[1] || '';
        const property = match[2];
        let targetName = '__ROOT__';
        const boneMatch = targetPath.match(/bones\[(?:["']?)(.+?)(?:["']?)\]$/);
        if (boneMatch) {
            targetName = boneMatch[1];
        } else {
            targetPath = targetPath.replace(/^\./, '');
            const parts = targetPath.split(/[/.]/).filter(Boolean);
            if (parts.length) targetName = parts[parts.length - 1];
        }
        return { targetName, property };
    }
    function findGraphAnimationOwner(object) {
        let current = object;
        while (current) {
            if (Array.isArray(current.animations) && current.animations.length) return current;
            current = current.parent;
        }
        return null;
    }
    function resolveGraphAnimationClip(owner) {
        if (!owner?.animations?.length) return null;
        const candidates = [
            owner.userData?.activeAnimationClip,
            owner.userData?.currentAnimationClip,
            owner.userData?.activeClip,
            owner.userData?.animationClip,
            window.activeAnimationClip,
            window.currentAnimationClip
        ];
        for (const candidate of candidates) {
            if (!candidate) continue;
            if (typeof candidate === 'string') {
                const found = owner.animations.find(clip => clip?.name === candidate);
                if (found) return found;
            } else if (owner.animations.includes(candidate)) {
                return candidate;
            } else if (candidate?.name) {
                const found = owner.animations.find(clip => clip?.name === candidate.name);
                if (found) return found;
            }
        }
        return owner.animations[0] || null;
    }
    function createGraphTrackInterpolant(track) {
        if (!track?.times?.length || !track?.values?.length) return null;
        try {
            const size = typeof track.getValueSize === 'function' ? track.getValueSize() : Math.max(1, Math.floor(track.values.length / track.times.length));
            const buffer = new Float32Array(size);
            const interpolant = track.createInterpolant(buffer);
            return { track, size, buffer, interpolant };
        } catch (error) {
            console.warn('[GraphEditor] Unable to create track interpolant:', track?.name, error);
            return null;
        }
    }
    function evaluateGraphTrack(interpolant, time) {
        if (!interpolant?.interpolant) return null;
        try {
            const result = interpolant.interpolant.evaluate(time);
            return Array.from(result);
        } catch (error) {
            return null;
        }
    }
    function findNativeTrackKeyIndex(track, time, epsilon = 0.00001) {
        if (!track?.times?.length) return -1;
        for (let i = 0; i < track.times.length; i++) {
            if (Math.abs(Number(track.times[i]) - Number(time)) <= epsilon) return i;
        }
        return -1;
    }
    function createNativeGraphRef(owner, clip, track, keyIndex, property, targetName) {
        return { sourceType: 'native', owner, clip, track, keyIndex, property, targetName };
    }
    function isSameGraphHandle(a, b) {
        if (!a || !b) return false;
        if (a.sourceType === 'native' || b.sourceType === 'native') {
            return a.sourceType === 'native' && b.sourceType === 'native' && a.channel === b.channel && a.nativeRef?.track === b.nativeRef?.track && a.nativeRef?.keyIndex === b.nativeRef?.keyIndex;
        }
        return a.sourceType === b.sourceType && a.channel === b.channel && a.key === b.key;
    }
    function getNativeGraphData(targetObject) {
        if (!targetObject) return null;
        const owner = findGraphAnimationOwner(targetObject);
        if (!owner) return null;
        const clip = resolveGraphAnimationClip(owner);
        if (!clip?.tracks?.length) return null;
        const groups = new Map();
        clip.tracks.forEach(track => {
            const binding = parseGraphTrackBinding(track.name);
            if (!binding) return;
            if (!groups.has(binding.targetName)) groups.set(binding.targetName, []);
            groups.get(binding.targetName).push({ track, binding });
        });
        if (!groups.size) return null;
        const preferredNames = [];
        if (state.graphNativeTargetName) preferredNames.push(state.graphNativeTargetName);
        if (targetObject?.name) preferredNames.push(targetObject.name);
        if (owner.userData?.animationTarget?.name) preferredNames.push(owner.userData.animationTarget.name);
        if (owner?.name) preferredNames.push(owner.name);
        preferredNames.push('__ROOT__');
        let targetName = null;
        for (const name of preferredNames) {
            if (name && groups.has(name)) {
                targetName = name;
                break;
            }
        }
        if (!targetName) {
            let bestCount = -1;
            groups.forEach((items, name) => {
                if (items.length > bestCount) {
                    bestCount = items.length;
                    targetName = name;
                }
            });
        }
        if (!targetName) return null;
        state.graphNativeTargetName = targetName;
        const targetTracks = groups.get(targetName) || [];
        const propertyTracks = { position: null, quaternion: null, scale: null };
        targetTracks.forEach(({ track, binding }) => {
            if (!propertyTracks[binding.property]) propertyTracks[binding.property] = track;
        });
        const positionTrack = propertyTracks.position;
        const quaternionTrack = propertyTracks.quaternion;
        const scaleTrack = propertyTracks.scale;
        const interpolants = {
            position: createGraphTrackInterpolant(positionTrack),
            quaternion: createGraphTrackInterpolant(quaternionTrack),
            scale: createGraphTrackInterpolant(scaleTrack)
        };
        const timeSet = new Set();
        targetTracks.forEach(({ track }) => {
            Array.from(track.times || []).forEach(time => {
                const value = Number(time);
                if (Number.isFinite(value)) timeSet.add(value);
            });
        });
        if (!timeSet.size) return null;
        const times = Array.from(timeSet).sort((a, b) => a - b);
        const targetNode = targetName === '__ROOT__' ? owner : owner.getObjectByName?.(targetName) || owner;
        const defaultPosition = targetNode?.position || { x: 0, y: 0, z: 0 };
        const defaultScale = targetNode?.scale || { x: 1, y: 1, z: 1 };
        const defaultQuaternion = targetNode?.quaternion || { x: 0, y: 0, z: 0, w: 1 };
        const entries = [];
        times.forEach(time => {
            const p = evaluateGraphTrack(interpolants.position, time);
            const s = evaluateGraphTrack(interpolants.scale, time);
            const qv = evaluateGraphTrack(interpolants.quaternion, time);
            const position = { x: Number(p?.[0] ?? defaultPosition.x ?? 0), y: Number(p?.[1] ?? defaultPosition.y ?? 0), z: Number(p?.[2] ?? defaultPosition.z ?? 0) };
            const scale = { x: Number(s?.[0] ?? defaultScale.x ?? 1), y: Number(s?.[1] ?? defaultScale.y ?? 1), z: Number(s?.[2] ?? defaultScale.z ?? 1) };
            const quaternion = new THREE.Quaternion(Number(qv?.[0] ?? defaultQuaternion.x ?? 0), Number(qv?.[1] ?? defaultQuaternion.y ?? 0), Number(qv?.[2] ?? defaultQuaternion.z ?? 0), Number(qv?.[3] ?? defaultQuaternion.w ?? 1));
            if (quaternion.lengthSq() < 0.000001) quaternion.set(0, 0, 0, 1);
            else quaternion.normalize();
            const euler = new THREE.Euler().setFromQuaternion(quaternion, 'XYZ');
            const nativeRefs = {};
            const positionIndex = findNativeTrackKeyIndex(positionTrack, time);
            const rotationIndex = findNativeTrackKeyIndex(quaternionTrack, time);
            const scaleIndex = findNativeTrackKeyIndex(scaleTrack, time);
            if (positionIndex >= 0) {
                nativeRefs['position.x'] = createNativeGraphRef(owner, clip, positionTrack, positionIndex, 'position', targetName);
                nativeRefs['position.y'] = createNativeGraphRef(owner, clip, positionTrack, positionIndex, 'position', targetName);
                nativeRefs['position.z'] = createNativeGraphRef(owner, clip, positionTrack, positionIndex, 'position', targetName);
            }
            if (rotationIndex >= 0) {
                nativeRefs['rotation.x'] = createNativeGraphRef(owner, clip, quaternionTrack, rotationIndex, 'quaternion', targetName);
                nativeRefs['rotation.y'] = createNativeGraphRef(owner, clip, quaternionTrack, rotationIndex, 'quaternion', targetName);
                nativeRefs['rotation.z'] = createNativeGraphRef(owner, clip, quaternionTrack, rotationIndex, 'quaternion', targetName);
            }
            if (scaleIndex >= 0) {
                nativeRefs['scale.x'] = createNativeGraphRef(owner, clip, scaleTrack, scaleIndex, 'scale', targetName);
                nativeRefs['scale.y'] = createNativeGraphRef(owner, clip, scaleTrack, scaleIndex, 'scale', targetName);
                nativeRefs['scale.z'] = createNativeGraphRef(owner, clip, scaleTrack, scaleIndex, 'scale', targetName);
            }
            entries.push({ time, position, scale, rotation: { x: quaternion.x, y: quaternion.y, z: quaternion.z, w: quaternion.w }, rotationEuler: { x: euler.x, y: euler.y, z: euler.z }, interpolation: 'linear', source: 'native-animation-clip', isImportedTrack: true, isNativeGraphSample: true, nativeRefs, graphTargetName: targetName, graphClipName: clip.name || 'Animation' });
        });
        ['x', 'y', 'z'].forEach(axis => {
            if (!entries.length) return;
            let previous = entries[0].rotationEuler[axis];
            for (let i = 1; i < entries.length; i++) {
                let value = entries[i].rotationEuler[axis];
                while (value - previous > Math.PI) value -= Math.PI * 2;
                while (value - previous < -Math.PI) value += Math.PI * 2;
                entries[i].rotationEuler[axis] = value;
                previous = value;
            }
        });
        return { owner, clip, targetName, entries, propertyTracks };
    }
    function getGraphEntriesForTarget(targetObject) {
        if (!targetObject) return { entries: [], native: null, source: 'none', context: null };
        const directMap = window.keyframes?.get(targetObject.uuid);
        const directEntries = Object.values(directMap || {}).filter(Boolean).sort((a, b) => (a.time || 0) - (b.time || 0));
        const manualEntries = directEntries.filter(entry => !entry?.isImportedTrack);
        if (manualEntries.length) {
            return { entries: manualEntries, native: null, source: 'manual', context: { object: targetObject, map: directMap } };
        }
        const native = getNativeGraphData(targetObject);
        if (native?.entries?.length) {
            return { entries: native.entries, native, source: 'native', context: { object: targetObject, owner: native.owner, clip: native.clip } };
        }
        if (directEntries.length) {
            return { entries: directEntries, native: null, source: 'imported', context: { object: targetObject, map: directMap } };
        }
        const selectedBone = window.selectedBone || null;
        const boneMap = window.boneKeyframes?.get(targetObject.uuid);
        if (boneMap instanceof Map && boneMap.size) {
            if (selectedBone?.name && boneMap.has(selectedBone.name)) {
                const map = boneMap.get(selectedBone.name);
                const entries = Object.values(map || {}).filter(Boolean).sort((a, b) => (a.time || 0) - (b.time || 0));
                if (entries.length) return { entries, native: null, source: 'bone', context: { object: targetObject, boneName: selectedBone.name, boneMap, map } };
            }
            for (const [boneName, map] of boneMap) {
                const entries = Object.values(map || {}).filter(Boolean).sort((a, b) => (a.time || 0) - (b.time || 0));
                if (entries.length) return { entries, native: null, source: 'bone', context: { object: targetObject, boneName, boneMap, map } };
            }
        }
        const childUuids = targetObject.userData?.animatedChildUuids;
        if (childUuids && childUuids.size) {
            for (const childUuid of childUuids) {
                const childMap = window.keyframes?.get(childUuid);
                const entries = Object.values(childMap || {}).filter(Boolean).sort((a, b) => (a.time || 0) - (b.time || 0));
                if (entries.length) {
                    const child = getScene()?.getObjectByProperty?.('uuid', childUuid) || null;
                    return { entries, native: null, source: 'child', context: { object: child || targetObject, map: childMap, parent: targetObject } };
                }
            }
        }
        return { entries: [], native: null, source: 'none', context: null };
    }
    function renderGraphChannelsTree() {
        const sidebar = $('graph-channels-list');
        if (!sidebar) return;
        let searchInput = sidebar.querySelector('#graph-channel-search');
        if (!sidebar.querySelector('.graph-sidebar-search')) {
            sidebar.innerHTML = `<div class="graph-sidebar-search"><i class="fas fa-search"></i><input type="text" id="graph-channel-search" placeholder="Filter channels..." value="${state.graphSearchQuery || ''}"/></div><div class="graph-channels-tree" id="graph-channels-tree"></div>`;
            searchInput = sidebar.querySelector('#graph-channel-search');
            searchInput?.addEventListener('input', event => {
                state.graphSearchQuery = String(event.target.value || '').toLowerCase().trim();
                renderGraphChannelsTree();
            });
        }
        const treeContainer = sidebar.querySelector('#graph-channels-tree');
        if (!treeContainer) return;
        treeContainer.innerHTML = '';
        const selectedObj = getSelectedObject();
        const timelineObjs = typeof collectTimelineObjects === 'function' ? collectTimelineObjects() : [];
        const targetObjs = selectedObj && !timelineObjs.includes(selectedObj) ? [selectedObj, ...timelineObjs] : timelineObjs.length ? timelineObjs : selectedObj ? [selectedObj] : [];
        const query = state.graphSearchQuery || '';
        if (!targetObjs.length) {
            const empty = document.createElement('div');
            empty.className = 'graph-tree-row';
            empty.style.paddingLeft = '10px';
            empty.style.color = graphThemeColor('--text-muted', '#8e8e96');
            empty.textContent = 'Select an object to edit curves';
            treeContainer.appendChild(empty);
            return;
        }
        targetObjs.forEach(obj => {
            const objName = obj.name || obj.type || 'Object';
            const graphData = getGraphEntriesForTarget(obj);
            const nativeInfo = graphData.native;
            const searchText = `${objName} ${nativeInfo?.clip?.name || ''} ${nativeInfo?.targetName || ''}`.toLowerCase();
            if (query && !searchText.includes(query)) return;
            const objRow = document.createElement('div');
            objRow.className = 'graph-tree-row graph-tree-object' + (selectedObj?.uuid === obj.uuid ? ' selected' : '');
            objRow.innerHTML = `<span class="graph-row-toggle"><i class="fas fa-chevron-down"></i></span><i class="fas fa-cube graph-row-icon"></i><span class="graph-row-name">${objName}</span>`;
            objRow.addEventListener('click', () => {
                state.activeGraphObject = obj;
                if (typeof window.selectObject === 'function') window.selectObject(obj);
                else window.selectedObject = obj;
                state._graphAutoFitted = false;
                renderGraph();
            });
            treeContainer.appendChild(objRow);
            const actionRow = document.createElement('div');
            actionRow.className = 'graph-tree-row graph-tree-action';
            const actionName = nativeInfo ? `${nativeInfo.clip?.name || 'Animation'} · ${nativeInfo.targetName === '__ROOT__' ? objName : nativeInfo.targetName}` : `Animation_${objName}`;
            actionRow.innerHTML = `<span class="graph-row-toggle"><i class="fas fa-chevron-down"></i></span><i class="fas fa-running graph-row-icon"></i><span class="graph-row-name">${actionName}</span>`;
            treeContainer.appendChild(actionRow);
            const groups = [
                { name: 'Location', icon: 'fa-arrows-alt', channels: ['position.x', 'position.y', 'position.z'] },
                { name: 'Rotation', icon: 'fa-sync-alt', channels: ['rotation.x', 'rotation.y', 'rotation.z'] },
                { name: 'Scale', icon: 'fa-expand-alt', channels: ['scale.x', 'scale.y', 'scale.z'] }
            ];
            groups.forEach(group => {
                const groupRow = document.createElement('div');
                groupRow.className = 'graph-tree-row graph-tree-group';
                groupRow.innerHTML = `<span class="graph-row-toggle"><i class="fas fa-chevron-down"></i></span><i class="fas ${group.icon} graph-row-icon"></i><span class="graph-row-name">${group.name}</span>`;
                treeContainer.appendChild(groupRow);
                group.channels.forEach(channel => {
                    const label = `${channel.split('.')[1].toUpperCase()} ${group.name}`;
                    const hidden = state.graphHiddenChannels.has(channel);
                    const locked = state.graphLockedChannels.has(channel);
                    const selected = state.activeGraphChannel === channel;
                    const row = document.createElement('div');
                    row.className = 'graph-tree-row graph-tree-channel' + (selected ? ' selected' : '') + (hidden ? ' dimmed' : '');
                    row.innerHTML = `<span class="graph-channel-dot" style="background:${getGraphChannelColor(channel)}"></span><span class="graph-row-name">${label}</span><div class="graph-row-actions"><button class="graph-action-btn eye-btn${hidden ? ' hidden-chan' : ''}" title="Toggle Curve Visibility"><i class="fas ${hidden ? 'fa-eye-slash' : 'fa-eye'}"></i></button><button class="graph-action-btn lock-btn${locked ? ' locked-chan' : ''}" title="Lock Channel"><i class="fas ${locked ? 'fa-lock' : 'fa-lock-open'}"></i></button></div>`;
                    row.querySelector('.eye-btn')?.addEventListener('click', event => {
                        event.stopPropagation();
                        if (state.graphHiddenChannels.has(channel)) state.graphHiddenChannels.delete(channel);
                        else state.graphHiddenChannels.add(channel);
                        state._graphAutoFitted = false;
                        renderGraph();
                    });
                    row.querySelector('.lock-btn')?.addEventListener('click', event => {
                        event.stopPropagation();
                        if (state.graphLockedChannels.has(channel)) state.graphLockedChannels.delete(channel);
                        else state.graphLockedChannels.add(channel);
                        renderGraphChannelsTree();
                    });
                    row.addEventListener('click', () => {
                        state.activeGraphChannel = state.activeGraphChannel === channel ? null : channel;
                        state._graphAutoFitted = false;
                        renderGraph();
                    });
                    treeContainer.appendChild(row);
                });
            });
        });
    }

    function getGraphMajorFrameStep() {
        const pixelsPerFrame = Math.max(0.0001, state.graphPixelsPerSecond / Math.max(1, getFps()));
        const targetPx = 70;
        const rawFrames = targetPx / pixelsPerFrame;
        const steps = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000];
        for (const step of steps) {
            if (step >= rawFrames) return step;
        }
        return Math.ceil(rawFrames);
    }
    function getGraphMinorFrameStep(majorStep) {
        if (majorStep <= 2) return 1;
        if (majorStep <= 10) return majorStep / 2;
        if (majorStep <= 50) return majorStep / 5;
        return majorStep / 10;
    }

    function drawGraphGrid(ctx, view) {
        const width = view.width;
        const height = view.height;
        const header = state.graphHeaderHeight || 22;
        const fps = Math.max(1, getFps());
        const zeroY = graphValueToY(0, view);
        const bg = graphThemeColor?.('--panel-bg', '#333333') || '#333333';
        const majorGrid = 'rgba(0,0,0,.28)';
        const minorGrid = 'rgba(0,0,0,.12)';
        const zeroGrid = 'rgba(0,0,0,.45)';
        const labelColor = graphThemeColor?.('--text-muted', '#b7b7b7') || '#b7b7b7';
        ctx.fillStyle = '#333';
        ctx.fillRect(0, 0, width, height);
        const niceStep = raw => {
            if (!Number.isFinite(raw) || raw <= 0) return 1;
            const exponent = Math.floor(Math.log10(raw));
            const fraction = raw / Math.pow(10, exponent);
            let nice = 1;
            if (fraction <= 1) nice = 1;
            else if (fraction <= 2) nice = 2;
            else if (fraction <= 5) nice = 5;
            else nice = 10;
            return nice * Math.pow(10, exponent);
        };
        const topValue = graphYToValue(header, view);
        const bottomValue = graphYToValue(height, view);
        const minValue = Math.min(topValue, bottomValue);
        const maxValue = Math.max(topValue, bottomValue);
        const visibleValueRange = Math.abs(maxValue - minValue) || 1;
        const approxMajorYStep = visibleValueRange / Math.max(1, (height - header) / 58);
        const majorYStep = niceStep(approxMajorYStep);
        const minorYStep = majorYStep / 5;
        const startTime = graphXToTime(0, view);
        const endTime = graphXToTime(width, view);
        const minTime = Math.min(startTime, endTime);
        const maxTime = Math.max(startTime, endTime);
        const majorFrameStep = getGraphMajorFrameStep();
        const minorFrameStep = getGraphMinorFrameStep(majorFrameStep);
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, header, width, height - header);
        ctx.clip();
        const firstMinorValue = Math.floor(minValue / minorYStep) * minorYStep;
        ctx.strokeStyle = minorGrid;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let value = firstMinorValue; value <= maxValue + minorYStep; value += minorYStep) {
            const ratio = value / majorYStep;
            const isMajor = Math.abs(ratio - Math.round(ratio)) < 0.0001;
            if (isMajor) continue;
            const y = Math.round(graphValueToY(value, view)) + .5;
            if (y < header || y > height) continue;
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
        }
        ctx.stroke();
        const firstMajorValue = Math.floor(minValue / majorYStep) * majorYStep;
        ctx.strokeStyle = majorGrid;
        ctx.beginPath();
        for (let value = firstMajorValue; value <= maxValue + majorYStep; value += majorYStep) {
            const y = Math.round(graphValueToY(value, view)) + .5;
            if (y < header || y > height) continue;
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
        }
        ctx.stroke();
        const firstMinorFrame = Math.floor((minTime * fps) / minorFrameStep) * minorFrameStep;
        const lastMinorFrame = Math.ceil((maxTime * fps) / minorFrameStep) * minorFrameStep;
        ctx.strokeStyle = minorGrid;
        ctx.beginPath();
        for (let frame = firstMinorFrame; frame <= lastMinorFrame + .0001; frame += minorFrameStep) {
            const ratio = frame / majorFrameStep;
            const isMajor = Math.abs(ratio - Math.round(ratio)) < 0.0001;
            if (isMajor) continue;
            const x = Math.round(graphTimeToX(frame / fps, view)) + .5;
            if (x < 0 || x > width) continue;
            ctx.moveTo(x, header);
            ctx.lineTo(x, height);
        }
        ctx.stroke();
        const firstMajorFrame = Math.floor((minTime * fps) / majorFrameStep) * majorFrameStep;
        const lastMajorFrame = Math.ceil((maxTime * fps) / majorFrameStep) * majorFrameStep;
        ctx.strokeStyle = majorGrid;
        ctx.beginPath();
        for (let frame = firstMajorFrame; frame <= lastMajorFrame + .0001; frame += majorFrameStep) {
            const x = Math.round(graphTimeToX(frame / fps, view)) + .5;
            if (x < 0 || x > width) continue;
            ctx.moveTo(x, header);
            ctx.lineTo(x, height);
        }
        ctx.stroke();
        if (zeroY >= header && zeroY <= height) {
            ctx.strokeStyle = zeroGrid;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(0, Math.round(zeroY) + .5);
            ctx.lineTo(width, Math.round(zeroY) + .5);
            ctx.stroke();
        }
        const zeroX = graphTimeToX(0, view);
        if (zeroX >= 0 && zeroX <= width) {
            ctx.strokeStyle = 'rgba(0,0,0,.32)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(Math.round(zeroX) + .5, header);
            ctx.lineTo(Math.round(zeroX) + .5, height);
            ctx.stroke();
        }
        ctx.restore();
        if (Math.abs(majorYStep * state.graphValueScale) >= 32) {
            ctx.save();
            ctx.beginPath();
            ctx.rect(0, header, width, height - header);
            ctx.clip();
            ctx.font = '10px "Segoe UI",monospace';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = labelColor;
            for (let value = firstMajorValue; value <= maxValue + majorYStep; value += majorYStep) {
                const y = graphValueToY(value, view);
                if (y < header + 10 || y > height - 8) continue;
                let decimals = 0;
                if (Math.abs(majorYStep) < .01) decimals = 3;
                else if (Math.abs(majorYStep) < 1) decimals = 2;
                else if (Math.abs(majorYStep) < 10) decimals = 1;
                const text = Math.abs(value) < 1e-8 ? '0.00' : Number(value).toFixed(decimals);
                ctx.fillText(text, 10, y - 1);
            }
            ctx.restore();
        }
    }

    /* ─── GRAPH EDITOR TIMELINE RULER (Blender Style) ───────────────── */
    function drawGraphRuler(ctx, view) {
        const width = view.width;
        const height = view.height;
        const rulerHeight = state.graphHeaderHeight || 24;
        const fps = Math.max(1, getFps());
        const pxPerFrame = Math.max(0.0001, state.graphPixelsPerSecond / fps);

        // 1. Calculate major & minor frame step intervals
        const desiredLabelSpacing = 70;
        const rawStep = desiredLabelSpacing / pxPerFrame;
        const steps = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000];
        let majorFrameStep = steps.find(step => step >= rawStep) || Math.ceil(rawStep);
        let minorFrameStep = majorFrameStep <= 2 ? 1 : (majorFrameStep <= 10 ? 2 : majorFrameStep / 5);

        const startTime = graphXToTime(0, view);
        const endTime = graphXToTime(width, view);
        const minFrame = Math.floor(Math.min(startTime, endTime) * fps);
        const maxFrame = Math.ceil(Math.max(startTime, endTime) * fps);

        const firstMinorFrame = Math.floor(minFrame / minorFrameStep) * minorFrameStep;
        const lastMinorFrame = Math.ceil(maxFrame / minorFrameStep) * minorFrameStep;

        ctx.save();
        ctx.globalAlpha = 1;
        ctx.setLineDash([]);

        // 2. Dark Ruler Header Bar
        ctx.fillStyle = '#181818';
        ctx.fillRect(0, 0, width, rulerHeight);

        // Bottom Border Line
        ctx.strokeStyle = '#2a2a2a';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, rulerHeight - 0.5);
        ctx.lineTo(width, rulerHeight - 0.5);
        ctx.stroke();

        // 3. Draw Minor & Major Frame Ticks
        for (let frame = firstMinorFrame; frame <= lastMinorFrame; frame += minorFrameStep) {
            const x = graphTimeToX(frame / fps, view);
            if (x < -20 || x > width + 20) continue;

            const isMajor = Math.abs(frame / majorFrameStep - Math.round(frame / majorFrameStep)) < 0.0001;

            ctx.strokeStyle = isMajor ? 'rgba(255, 255, 255, 0.35)' : 'rgba(255, 255, 255, 0.12)';
            ctx.lineWidth = 1;

            ctx.beginPath();
            ctx.moveTo(Math.round(x) + 0.5, rulerHeight);
            ctx.lineTo(Math.round(x) + 0.5, isMajor ? rulerHeight - 9 : rulerHeight - 5);
            ctx.stroke();

            // Frame Number Text on Major Ticks
            if (isMajor) {
                ctx.fillStyle = '#a0a0a0';
                ctx.font = '10px "Segoe UI", Arial, sans-serif';
                ctx.textAlign = 'left';
                ctx.textBaseline = 'middle';
                ctx.fillText(String(Math.round(frame)), Math.round(x) + 4, rulerHeight * 0.45);
            }
        }

        // 4. Current Frame Indicator Badge (Blue)
        const currentFrame = Math.round(getCurrentTime() * fps);
        const currentX = graphTimeToX(getCurrentTime(), view);

        if (currentX >= 0 && currentX <= width) {
            const text = String(currentFrame);
            ctx.font = 'bold 10px "Segoe UI", Arial, sans-serif';
            const textWidth = ctx.measureText(text).width;
            const badgeWidth = Math.max(24, textWidth + 10);
            const badgeHeight = 18;
            const bx = Math.max(2, Math.min(width - badgeWidth - 2, currentX - badgeWidth * 0.5));
            const by = 3;

            // Blue Badge Background
            ctx.fillStyle = '#2b8cee';
            ctx.beginPath();
            ctx.rect(bx, by, badgeWidth, badgeHeight);
            ctx.fill();

            // Frame Number Text
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(text, bx + badgeWidth * 0.5, by + badgeHeight * 0.5);
        }

        ctx.restore();
    }
    function fitGraphToKeyframes(entries) {
        const canvas = $('graph-canvas');
        if (!canvas || !entries?.length) return;
        const rect = canvas.getBoundingClientRect();
        const width = Math.max(100, rect.width || 750);
        const height = Math.max(120, rect.height || 350);
        let minY = Infinity;
        let maxY = -Infinity;
        let minT = Infinity;
        let maxT = -Infinity;
        const activeChannel = state.activeGraphChannel;
        entries.forEach(entry => {
            const time = Number(entry?.time);
            if (Number.isFinite(time)) {
                minT = Math.min(minT, time);
                maxT = Math.max(maxT, time);
            }
            channels.forEach(([channel]) => {
                if (state.graphHiddenChannels.has(channel)) return;
                if (activeChannel && activeChannel !== channel) return;
                const value = getKeyframeValue(entry, channel);
                if (Number.isFinite(value)) {
                    minY = Math.min(minY, value);
                    maxY = Math.max(maxY, value);
                }
            });
        });
        if (!Number.isFinite(minY) || !Number.isFinite(maxY)) {
            minY = -1;
            maxY = 1;
        }
        if (Math.abs(maxY - minY) < 0.00001) {
            const pad = Math.max(1, Math.abs(maxY) * 0.25);
            minY -= pad;
            maxY += pad;
        }
        const timePadding = Math.max(0.05, (maxT - minT) * 0.08);
        const valuePadding = Math.max(0.05, (maxY - minY) * 0.12);
        minT -= timePadding;
        maxT += timePadding;
        minY -= valuePadding;
        maxY += valuePadding;
        const header = state.graphHeaderHeight || 24;
        const usableWidth = Math.max(120, width - 80);
        const usableHeight = Math.max(80, height - header - 30);
        state.graphPixelsPerSecond = clampGraph(usableWidth / Math.max(0.001, maxT - minT), state.graphMinPixelsPerSecond || 6, state.graphMaxPixelsPerSecond || 12000);
        state.graphValueScale = clampGraph(usableHeight / Math.max(0.001, maxY - minY), state.graphMinValueScale || 12, state.graphMaxValueScale || 6000);
        state.graphPanX = 48 - (minT * state.graphPixelsPerSecond);
        const midValue = (minY + maxY) * 0.5;
        state.graphPanY = midValue * state.graphValueScale;
    }

    function renderGraph() {
        const canvas = $('graph-canvas');
        const container = $('graph-editor-container');
        if (!canvas || !container) return;
        if (container.offsetParent === null && state.activeView !== 'graph') return;
        const rect = canvas.getBoundingClientRect();
        if (rect.width < 2 || rect.height < 2) return;
        state.duration = Math.max(1, Number(window.timelineDuration || state.duration || 30));
        const graphTarget = state.activeGraphObject || getSelectedObject();
        const graphData = getGraphEntriesForTarget(graphTarget);
        const entries = graphData?.entries || [];
        const graphSource = graphData?.source || 'none';
        const isNativeGraph = graphSource === 'native';
        if (!state._graphAutoFitted) {
            if (entries.length) {
                fitGraphToKeyframes(entries);
            } else {
                state.graphZoomX = 1;
                state.graphZoomY = 1;
                state.graphPanX = 36;
                state.graphPanY = 0;
                state.graphValueScale = 34;
                state.graphPixelsPerSecond = Math.max(8, (rect.width - 72) / Math.max(1, state.duration));
            }
            state._graphAutoFitted = true;
        }
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
        const pixelWidth = Math.max(1, Math.round(rect.width * dpr));
        const pixelHeight = Math.max(1, Math.round(rect.height * dpr));
        if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
        if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const view = { width: rect.width, height: rect.height };
        ctx.clearRect(0, 0, view.width, view.height);
        ctx.fillStyle = graphThemeColor('--primary-dark', '#333333');
        ctx.fillRect(0, 0, view.width, view.height);
        drawGraphGrid(ctx, view);
        renderGraphChannelsTree();
        state.graphHitItems = [];
        if (!entries.length) {
            ctx.fillStyle = graphThemeColor('--text-muted', '#0e0e0f');
            ctx.font = '12px Segoe UI,Arial';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'alphabetic';

            drawGraphPlayhead(ctx, view);
            return;
        }
        channels.forEach(([channel]) => {
            if (state.graphHiddenChannels.has(channel)) return;
            if (isNativeGraph) {
                const hasNativeChannel = entries.some(entry => !!entry.nativeRefs?.[channel]);
                if (!hasNativeChannel) return;
            }
            const focused = !state.activeGraphChannel || state.activeGraphChannel === channel;
            const locked = state.graphLockedChannels.has(channel);
            const color = getGraphChannelColor(channel);
            ctx.save();
            ctx.strokeStyle = color;
            ctx.lineWidth = focused ? (channel.startsWith('position') ? 2.2 : 1.8) : 1;
            ctx.globalAlpha = locked ? .45 : focused ? 1 : .18;
            const first = entries[0];
            const last = entries[entries.length - 1];
            const firstValue = getKeyframeValue(first, channel);
            const lastValue = getKeyframeValue(last, channel);
            const firstX = graphTimeToX(first.time, view);
            const firstY = graphValueToY(firstValue, view);
            const lastX = graphTimeToX(last.time, view);
            const lastY = graphValueToY(lastValue, view);
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.moveTo(0, firstY);
            ctx.lineTo(firstX, firstY);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(lastX, lastY);
            ctx.lineTo(view.width, lastY);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.beginPath();
            entries.forEach((entry, index) => {
                const value = getKeyframeValue(entry, channel);
                const x = graphTimeToX(entry.time, view);
                const y = graphValueToY(value, view);
                if (index === 0) {
                    ctx.moveTo(x, y);
                    return;
                }
                const previous = entries[index - 1];
                const previousValue = getKeyframeValue(previous, channel);
                let interpolation = entry.interpolation || 'bezier';
                if (isNativeGraph) {
                    const nativeRef = entry.nativeRefs?.[channel] || previous.nativeRefs?.[channel] || null;
                    const track = nativeRef?.track || null;
                    if (track && typeof track.getInterpolation === 'function') {
                        const trackInterpolation = track.getInterpolation();
                        if (trackInterpolation === THREE.InterpolateDiscrete) interpolation = 'constant';
                        else if (trackInterpolation === THREE.InterpolateSmooth) interpolation = 'smooth';
                        else interpolation = 'linear';
                    } else {
                        interpolation = 'linear';
                    }
                }
                if (interpolation === 'constant') {
                    const previousY = graphValueToY(previousValue, view);
                    ctx.lineTo(x, previousY);
                    ctx.lineTo(x, y);
                } else if (interpolation === 'linear' || interpolation === 'smooth' || isNativeGraph) {
                    ctx.lineTo(x, y);
                } else {
                    const previousTangents = ensureTangents(previous, channel);
                    const currentTangents = ensureTangents(entry, channel);
                    const previousX = graphTimeToX(previous.time, view);
                    const previousY = graphValueToY(previousValue, view);
                    const c1x = graphTimeToX(previous.time + previousTangents.out.dx, view);
                    const c1y = graphValueToY(previousValue + previousTangents.out.dy, view);
                    const c2x = graphTimeToX(entry.time + currentTangents.in.dx, view);
                    const c2y = graphValueToY(value + currentTangents.in.dy, view);
                    if (Math.abs(c1x - previousX) < 1 && Math.abs(c2x - x) < 1) {
                        ctx.lineTo(x, y);
                    } else {
                        ctx.bezierCurveTo(c1x, c1y, c2x, c2y, x, y);
                    }
                }
            });
            ctx.stroke();
            entries.forEach((entry, index) => {
                const nativeRef = isNativeGraph ? entry.nativeRefs?.[channel] || null : null;
                if (isNativeGraph && !nativeRef) return;
                const value = getKeyframeValue(entry, channel);
                const x = graphTimeToX(entry.time, view);
                const y = graphValueToY(value, view);
                if (x < -12 || x > view.width + 12 || y < -12 || y > view.height + 12) return;
                const frame = frameForTime(entry.time);
                const handle = {
                    type: 'key',
                    sourceType: graphSource,
                    channel,
                    frame,
                    index,
                    key: entry,
                    time: entry.time,
                    value,
                    x,
                    y,
                    context: graphData.context || null,
                    nativeRef
                };
                const selected = isSameGraphHandle(state.selectedGraphHandle, handle);
                const pointRadius = selected ? 5 : focused ? 3.5 : 3;
                ctx.save();
                ctx.globalAlpha = locked ? .5 : focused ? 1 : .45;
                ctx.fillStyle = selected ? graphThemeColor('--accent-warning', '#ffcc00') : color;
                ctx.strokeStyle = selected ? graphThemeColor('--text-primary', '#ffffff') : graphThemeRGBA('--primary-dark-rgb', .85, '51,51,51');
                ctx.lineWidth = selected ? 1.5 : 1;
                ctx.beginPath();
                ctx.arc(x, y, pointRadius, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
                ctx.restore();
                if (selected && focused && !isNativeGraph && !locked) {
                    drawTangentHandles(ctx, view, entry, channel, color, frame);
                }
                state.graphHitItems.push(handle);
            });
            ctx.restore();
        });
        ctx.globalAlpha = 1;
        ctx.setLineDash([]);
        drawGraphRuler(ctx, view);
        drawGraphPlayhead(ctx, view);
    }
    function drawTangentHandles(ctx, canvas, key, channel, color, frame) {
        const tangents = ensureTangents(key, channel);
        const value = getKeyframeValue(key, channel);
        const keyX = graphTimeToX(key.time, canvas);
        const keyY = graphValueToY(value, canvas);
        [['in', tangents.in], ['out', tangents.out]].forEach(([side, tangent]) => {
            const hx = graphTimeToX(key.time + tangent.dx, canvas);
            const hy = graphValueToY(value + tangent.dy, canvas);
            ctx.strokeStyle = graphThemeRGBA('--text-primary-rgb', .7);
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(keyX, keyY);
            ctx.lineTo(hx, hy);
            ctx.stroke();
            ctx.fillStyle = color;
            ctx.strokeStyle = graphThemeColor('--text-primary', '#ffffff');
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.rect(hx - 4, hy - 4, 8, 8);
            ctx.fill();
            ctx.stroke();
            state.graphHitItems.push({ type: 'tangent', side, channel, frame, key, x: hx, y: hy });
        });
    }
    function drawGraphPlayhead(ctx, canvas) {
        const rawX = graphTimeToX(getCurrentTime(), canvas);
        const x = Math.max(1, Math.min(canvas.width - 1, rawX));
        ctx.save();
        ctx.globalAlpha = 1;
        ctx.setLineDash([]);
        ctx.strokeStyle = graphThemeColor('--accent-info', '#00bcd4');
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(Math.round(x) + .5, 0);
        ctx.lineTo(Math.round(x) + .5, canvas.height);
        ctx.stroke();
        ctx.fillStyle = graphThemeColor('--accent-blue', '#5f5f5f');
        ctx.beginPath();
        ctx.moveTo(x - 7, 0);
        ctx.lineTo(x + 7, 0);
        ctx.lineTo(x + 7, 19);
        ctx.lineTo(x, 25);
        ctx.lineTo(x - 7, 19);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = graphThemeColor('--text-primary', '#ffffff');
        ctx.lineWidth = 1;
        ctx.stroke();
        const frame = Math.round(getCurrentTime() * getFps());
        ctx.fillStyle = graphThemeColor('--text-primary', '#ffffff');
        ctx.font = 'bold 9px Segoe UI,Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(frame), x, 11);
        ctx.restore();
    }
    function refreshGraphCanvas() {
        const canvas = $('graph-canvas');
        const graphContainer = $('graph-editor-container');
        if (!canvas || !graphContainer || graphContainer.offsetParent === null) return;
        renderGraph();
    }

    function setTimelineView(view) {
        state.activeView = view;
        const controlsWrapper = $('timeline-controls-wrapper');
        const timelineBody = controlsWrapper?.querySelector('.timeline-body') || q('.timeline-body');
        const timelineControls = controlsWrapper?.querySelector('.timeline-controls') || q('.timeline-controls');
        const graph = $('graph-editor-container');
        const nodes = $('global-node-editor-container');
        const bone = $('bone-editor');
        const brushPanel = $('timeline-2d-brush-panel');
        if (view === 'graph') {
            document.body.classList.remove('graph-editor-expanded');
            state._graphAutoFitted = false;
            state.graphNativeTargetName = null;
            state.nativeGraphCache?.clear();
        }
        if (controlsWrapper) {
            controlsWrapper.style.setProperty('display', (view === 'timeline' || view === 'graph') ? 'flex' : 'none', 'important');
            controlsWrapper.style.setProperty('flex-direction', 'column', 'important');
            controlsWrapper.style.setProperty('flex', '1 1 0', 'important');
            controlsWrapper.style.setProperty('min-height', '0', 'important');
            controlsWrapper.style.setProperty('width', '100%', 'important');
            controlsWrapper.style.setProperty('overflow', 'hidden', 'important');
        }
        if (timelineControls) {
            timelineControls.style.setProperty('display', (view === 'timeline' || view === 'graph') ? 'flex' : 'none', 'important');
            timelineControls.style.setProperty('flex', '0 0 auto', 'important');
            timelineControls.style.setProperty('width', '100%', 'important');
        }
        if (timelineBody) {
            if (view === 'timeline') {
                timelineBody.style.setProperty('display', 'grid', 'important');
                timelineBody.style.setProperty('flex', '1 1 0', 'important');
                timelineBody.style.setProperty('min-height', '0', 'important');
            } else {
                timelineBody.style.setProperty('display', 'none', 'important');
                timelineBody.style.setProperty('flex', '0 0 0', 'important');
                timelineBody.style.setProperty('height', '0', 'important');
                timelineBody.style.setProperty('min-height', '0', 'important');
            }
        }
        if (graph) {
            if (view === 'graph') {
                graph.style.setProperty('display', 'flex', 'important');
                graph.style.setProperty('position', 'relative', 'important');
                graph.style.setProperty('flex', '1 1 0', 'important');
                graph.style.setProperty('width', '100%', 'important');
                graph.style.setProperty('height', '0', 'important');
                graph.style.setProperty('min-height', '0', 'important');
                graph.style.setProperty('inset', 'auto', 'important');
            } else {
                graph.style.setProperty('display', 'none', 'important');
            }
        }
        if (nodes) {
            nodes.style.setProperty('display', view === 'nodes' ? 'flex' : 'none', 'important');
        }
        if (bone) {
            bone.style.setProperty('display', view === 'bone' ? 'flex' : 'none', 'important');
        }
        if (brushPanel) {
            brushPanel.style.setProperty('display', 'none', 'important');
        }
        document.querySelectorAll('.timeline-view-tabs .view-tab').forEach(btn => btn.classList.remove('active'));
        const activeId = view === 'timeline' ? 'view-timeline' : view === 'graph' ? 'view-graph' : view === 'nodes' ? 'view-nodes-global' : view === 'bone' ? 'boneRigButton' : '';
        if (activeId) $(activeId)?.classList.add('active');
        syncProfessionalTimelineViewTabs(view);
        if (view === 'graph') {
            state._graphAutoFitted = false;
            requestAnimationFrame(() => {
                refreshGraphCanvas();
                requestAnimationFrame(() => {
                    refreshGraphCanvas();
                });
            });
            setTimeout(() => {
                refreshGraphCanvas();
            }, 80);
        }
        if (view === 'nodes') {
            ensurePlayerGraphEditor();
            if (window.globalNodeManager?.refreshActiveNodeTab) {
                window.globalNodeManager.refreshActiveNodeTab();
            }
        }
        if (view === 'bone') {
            requestAnimationFrame(() => {
                window.advancedControlRig?.activateFromSceneSelection?.();
                window.advancedControlRig?.refresh?.();
                // Bone Rig has both a control/property editor (timeline
                // region) and a dedicated 3D document. Opening this view
                // focuses the selected skeletal character in Rig View, whose
                // tab lives beside the other viewport documents.
                window.SMViewportSystem?.openRiggingViewport?.(
                    window.selectedBone || window.selectedObject || null
                );
                window.dispatchEvent(new Event('resize'));
            });
        }
    }

    function ensurePlayerGraphEditor() {
        const wrapper = $('player-graph-wrapper');
        if (!wrapper || window.playerGraphEditor?.isValid) return window.playerGraphEditor || null;
        const GraphEditorCtor = window.PlayerGraphEditor || (typeof PlayerGraphEditor !== 'undefined' ? PlayerGraphEditor : null);
        if (!GraphEditorCtor) {
            wrapper.innerHTML = '<div class="node-editor-empty">Player graph is loading...</div>';
            setTimeout(() => {
                if (state.activeView === 'nodes') ensurePlayerGraphEditor();
            }, 150);
            return null;
        }
        try {
            const playerStub = window.player || {
                model: getSelectedObject(),
                update() { },
                addEventListener() { },
                removeEventListener() { }
            };
            window.playerGraphEditor = new GraphEditorCtor(playerStub, 'open-player-graph');
            const panel = document.getElementById('player-graph-panel');
            if (panel && wrapper && panel.parentElement !== wrapper) {
                wrapper.innerHTML = '';
                wrapper.appendChild(panel);
                panel.style.cssText = 'display:flex; position:absolute; inset:0; width:100%; height:100%; opacity:1; transform:none; z-index:1;';
                window.playerGraphEditor.isVisible = true;
                window.playerGraphEditor.resizePreview?.();
                window.playerGraphEditor.graphCanvas?.resize?.();
            }
            if (!window.playerGraphEditor?.isValid) {
                wrapper.innerHTML = '<div class="node-editor-empty">Player graph wrapper was not available.</div>';
            }
            return window.playerGraphEditor;
        } catch (error) {
            console.error('[Timeline] Player graph failed to initialize:', error);
            wrapper.innerHTML = `<div class="node-editor-empty">Player graph failed to initialize: ${error.message}</div>`;
            return null;
        }
    }

    function syncPlaybackButtonState() {
        $('play')?.classList.toggle('active', !!window.isPlaying);
        $('pause')?.classList.toggle('active', !window.isPlaying);
    }

    function tickTimeline(now) {
        state.tickerRaf = requestAnimationFrame(tickTimeline);
        const currentNow = Number.isFinite(now) ? now : performance.now();
        let delta = (currentNow - state.lastTick) / 1000;
        state.lastTick = currentNow;
        if (!Number.isFinite(delta) || delta < 0) delta = 0;
        delta = Math.min(delta, 0.05);
        if (!window.isPlaying) {
            syncPlaybackButtonState();
            return;
        }
        try {
            const speed = Math.max(0.01, Number(window.playbackSpeed) || 1);
            const duration = Math.max(0.001, Number(window.timelineDuration || state.duration || 30));
            state.duration = duration;
            let next = getCurrentTime() + delta * speed;
            if (window.loopEnabled) {
                const loopStartSeconds = Math.max(0, Number(window.loopStart || 0) / 1000);
                const rawLoopEndMs = Number(window.loopEnd || 0);
                let loopEndSeconds = rawLoopEndMs > 0 ? rawLoopEndMs / 1000 : duration;
                loopEndSeconds = Math.min(duration, Math.max(loopStartSeconds + 0.001, loopEndSeconds));
                if (next >= loopEndSeconds) {
                    const span = Math.max(0.001, loopEndSeconds - loopStartSeconds);
                    next = loopStartSeconds + ((next - loopStartSeconds) % span);
                }
            } else if (next >= duration) {
                next = duration;
                window.isPlaying = false;
            }
            setCurrentTime(next);
        } catch (error) {
            console.error('[Timeline] Playback frame failed:', error);
        }
        syncPlaybackButtonState();
    }
    function startTimelineTicker() {
        if (state.tickerRaf) {
            cancelAnimationFrame(state.tickerRaf);
            state.tickerRaf = 0;
        }
        state.tickerStarted = true;
        state.lastTick = performance.now();
        state.tickerRaf = requestAnimationFrame(tickTimeline);
    }

    function bindButton(id, fn) {
        const el = $(id);
        if (!el || el.dataset.smTimelineBound) return;
        el.dataset.smTimelineBound = '1';
        el.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopImmediatePropagation();
            fn(event);
        }, true);
    }

    function setNativeTrackChannelValue(ref, channel, value) {
        const track = ref?.track;
        if (!track || ref.keyIndex < 0) return false;
        const size = typeof track.getValueSize === 'function' ? track.getValueSize() : 0;
        if (!size) return false;
        const base = ref.keyIndex * size;
        const axis = channel.split('.')[1];
        if (ref.property === 'position' || ref.property === 'scale') {
            const component = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
            if (component >= size) return false;
            track.values[base + component] = Number(value);
            return true;
        }
        if (ref.property === 'quaternion' && size >= 4) {
            const quaternion = new THREE.Quaternion(Number(track.values[base] || 0), Number(track.values[base + 1] || 0), Number(track.values[base + 2] || 0), Number(track.values[base + 3] ?? 1));
            if (quaternion.lengthSq() < 0.000001) quaternion.set(0, 0, 0, 1);
            else quaternion.normalize();
            const euler = new THREE.Euler().setFromQuaternion(quaternion, 'XYZ');
            euler[axis] = Number(value);
            quaternion.setFromEuler(euler).normalize();
            track.values[base] = quaternion.x;
            track.values[base + 1] = quaternion.y;
            track.values[base + 2] = quaternion.z;
            track.values[base + 3] = quaternion.w;
            return true;
        }
        return false;
    }
    function moveNativeTrackKeyTime(ref, newTime) {
        const track = ref?.track;
        if (!track?.times?.length) return ref?.keyIndex ?? -1;
        const size = track.getValueSize();
        const originalIndex = ref.keyIndex;
        if (originalIndex < 0 || originalIndex >= track.times.length) return originalIndex;
        const rows = [];
        for (let i = 0; i < track.times.length; i++) {
            const values = [];
            for (let j = 0; j < size; j++)values.push(track.values[i * size + j]);
            rows.push({ time: i === originalIndex ? newTime : Number(track.times[i]), values, originalIndex: i });
        }
        rows.sort((a, b) => a.time - b.time || a.originalIndex - b.originalIndex);
        const newTimes = rows.map(row => row.time);
        const newValues = [];
        rows.forEach(row => newValues.push(...row.values));
        if (typeof track.times.set === 'function') track.times.set(newTimes);
        else track.times = newTimes;
        if (typeof track.values.set === 'function') track.values.set(newValues);
        else track.values = newValues;
        return rows.findIndex(row => row.originalIndex === originalIndex);
    }
    function rebuildNativeMixer(owner) {
        const mixer = owner?.userData?.mixer;
        if (!mixer) return;
        try {
            mixer.stopAllAction();
            (owner.animations || []).forEach(clip => {
                try { mixer.uncacheClip(clip); } catch (error) { }
            });
            configureTimelineMixerActions(owner);
            sampleTimelineMixerAtTime(owner, getCurrentTime());
        } catch (error) {
            console.warn('[GraphEditor] Mixer rebuild failed:', error);
        }
    }
    function commitGraphKeyEdit(handle, time, value) {
        if (!handle?.key) return;
        if (state.graphLockedChannels.has(handle.channel)) return;
        const newTime = Math.max(0, Math.min(state.duration, Number(time) || 0));
        if (handle.sourceType === 'native') {
            const ref = handle.nativeRef;
            if (!ref?.track) return;
            setNativeTrackChannelValue(ref, handle.channel, value);
            const newIndex = moveNativeTrackKeyTime(ref, newTime);
            ref.keyIndex = newIndex;
            ref.clip?.resetDuration?.();
            handle.frame = frameForTime(newTime);
            handle.time = newTime;
            state.nativeGraphCache?.clear();
            setCurrentTime(newTime);
            renderGraph();
            return;
        }
        const context = handle.context;
        const map = context?.map;
        if (!map) return;
        const oldFrame = handle.frame;
        const newFrame = frameForTime(newTime);
        handle.key.time = newTime;
        setKeyframeValue(handle.key, handle.channel, value);
        if (newFrame !== oldFrame) {
            delete map[oldFrame];
            map[newFrame] = handle.key;
            handle.frame = newFrame;
        } else {
            map[oldFrame] = handle.key;
        }
        if (handle.sourceType === 'bone') {
            context.boneMap?.set(context.boneName, map);
            if (context.object?.uuid) window.boneKeyframes?.set(context.object.uuid, context.boneMap);
            if (context.object?.uuid) window.TimelineBinaryEvaluator?.invalidateCache?.(context.object.uuid);
        } else {
            if (context.object?.uuid) window.keyframes?.set(context.object.uuid, map);
            if (context.object?.uuid) window.TimelineBinaryEvaluator?.invalidateCache?.(context.object.uuid);
        }
        handle.time = newTime;
        setCurrentTime(newTime);
        updateKeyframesUI();
        renderGraph();
    }

    function bindGraphInteractions() {
        const canvas = $('graph-canvas');
        if (!canvas || canvas.dataset.smGraphBound) return;
        canvas.dataset.smGraphBound = '1';
        const viewSize = () => {
            const rect = canvas.getBoundingClientRect();
            return { width: Math.max(1, rect.width), height: Math.max(1, rect.height), rect };
        };
        const pointerPosition = event => {
            const { rect } = viewSize();
            return { x: event.clientX - rect.left, y: event.clientY - rect.top, rect };
        };
        const hitTest = (x, y) => {
            let best = null;
            let bestDist = 24;
            for (const item of state.graphHitItems || []) {
                if (!item) continue;
                const distance = Math.hypot(item.x - x, item.y - y);
                const weightedDistance = item.type === 'key' ? distance - 6 : distance;
                if (weightedDistance < bestDist) {
                    best = item;
                    bestDist = weightedDistance;
                }
            }
            return best;
        };
        const updateGraphCursor = event => {
            if (state.graphDragging) return;
            const { x, y } = pointerPosition(event);
            const hit = hitTest(x, y);
            const playheadX = graphTimeToX(getCurrentTime());
            const headerHeight = state.graphHeaderHeight || 24;
            if (hit?.type === 'key') {
                canvas.style.cursor = state.graphLockedChannels.has(hit.channel) ? 'not-allowed' : 'move';
                return;
            }
            if (hit?.type === 'tangent') {
                canvas.style.cursor = state.graphLockedChannels.has(hit.channel) ? 'not-allowed' : 'crosshair';
                return;
            }
            if (y <= headerHeight) {
                canvas.style.cursor = 'ew-resize';
                return;
            }
            if (Math.abs(x - playheadX) <= 8) {
                canvas.style.cursor = 'ew-resize';
                return;
            }
            canvas.style.cursor = 'grab';
        };
        const commitGraphKeyMove = (handle, time, value) => {
            if (!handle) return;
            if (state.graphLockedChannels.has(handle.channel)) return;
            commitGraphKeyEdit(handle, time, value);
        };
        canvas.addEventListener('wheel', event => {
            event.preventDefault();
            const { rect } = viewSize();
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;
            const view = { width: rect.width, height: rect.height };
            if (Math.abs(event.deltaX) > Math.abs(event.deltaY) && !event.ctrlKey && !event.metaKey && !event.altKey) {
                state.graphPanX -= event.deltaX;
                renderGraph();
                return;
            }
            if (event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey) {
                const panAmount = Math.abs(event.deltaX) > 0 ? event.deltaX : event.deltaY;
                state.graphPanX -= panAmount;
                renderGraph();
                return;
            }
            const zoomFactor = Math.exp(-event.deltaY * 0.0015);
            if (event.altKey && !event.ctrlKey && !event.metaKey) {
                zoomGraphYAt(view, y, zoomFactor);
            } else if (event.ctrlKey || event.metaKey) {
                zoomGraphXAt(view, x, zoomFactor);
                zoomGraphYAt(view, y, zoomFactor);
            } else {
                zoomGraphXAt(view, x, zoomFactor);
            }
            renderGraph();
        }, { passive: false });
        canvas.addEventListener('pointerdown', event => {
            if (event.button > 2) return;
            const { rect } = viewSize();
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;
            const headerHeight = state.graphHeaderHeight || 24;
            event.preventDefault();
            canvas.focus?.();
            canvas.setPointerCapture?.(event.pointerId);
            const forcePan = event.button === 1 || event.button === 2 || (event.altKey && event.button === 0) || (event.ctrlKey && event.button === 0) || (event.metaKey && event.button === 0);
            state.graphDragging = true;
            state.graphDragStart = {
                x: event.clientX,
                y: event.clientY,
                localX: x,
                localY: y,
                panX: state.graphPanX,
                panY: state.graphPanY,
                time: getCurrentTime(),
                hit: null
            };
            if (forcePan) {
                state.graphDragMode = 'pan';
                state.graphPanning = true;
                state.graphLastMouseX = event.clientX;
                state.graphLastMouseY = event.clientY;
                canvas.style.cursor = 'grabbing';
                return;
            }
            const hit = hitTest(x, y);
            state.graphDragStart.hit = hit;
            if (hit) {
                state.selectedGraphHandle = hit;
                if (state.graphLockedChannels.has(hit.channel)) {
                    state.graphDragging = false;
                    state.graphDragMode = null;
                    canvas.style.cursor = 'not-allowed';
                    renderGraph();
                    return;
                }
                state.graphDragMode = hit.type;
                canvas.style.cursor = hit.type === 'key' ? 'move' : 'crosshair';
                if (Number.isFinite(hit.time)) setCurrentTime(hit.time);
                renderGraph();
                return;
            }
            const playheadX = graphTimeToX(getCurrentTime());
            const clickedHeader = y <= headerHeight;
            const nearPlayhead = Math.abs(x - playheadX) <= 10;
            const wantsScrub = clickedHeader || nearPlayhead || event.shiftKey;
            if (wantsScrub) {
                state.graphDragMode = 'scrub';
                const time = Math.max(0, Math.min(state.duration, graphXToTime(x)));
                setCurrentTime(time);
                canvas.style.cursor = 'ew-resize';
                return;
            }
            state.graphDragMode = 'pan';
            state.graphPanning = true;
            state.graphLastMouseX = event.clientX;
            state.graphLastMouseY = event.clientY;
            canvas.style.cursor = 'grabbing';
        });
        canvas.addEventListener('pointermove', event => {
            if (!state.graphDragging) return;
            const { rect, height } = viewSize();
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;
            if (state.graphDragMode === 'pan') {
                const dx = event.clientX - state.graphDragStart.x;
                const dy = event.clientY - state.graphDragStart.y;
                state.graphPanX = state.graphDragStart.panX + dx;
                state.graphPanY = state.graphDragStart.panY + dy;
                state.graphLastMouseX = event.clientX;
                state.graphLastMouseY = event.clientY;
                renderGraph();
                return;
            }
            if (state.graphDragMode === 'key') {
                const handle = state.selectedGraphHandle;
                if (!handle) return;
                if (state.graphLockedChannels.has(handle.channel)) return;
                let time = graphXToTime(x);
                let value = graphYToValue(y, { height });
                time = Math.max(0, Math.min(state.duration, time));
                if (event.shiftKey) {
                    const fps = Math.max(1, getFps());
                    time = Math.round(time * fps) / fps;
                }
                if (event.ctrlKey || event.metaKey) {
                    const valueStep = getGraphValueMajorStep?.() || 0.1;
                    value = Math.round(value / valueStep) * valueStep;
                }
                commitGraphKeyMove(handle, time, value);
                return;
            }
            if (state.graphDragMode === 'tangent') {
                const handle = state.selectedGraphHandle;
                if (!handle?.key) return;
                if (state.graphLockedChannels.has(handle.channel)) return;
                const tangents = ensureTangents(handle.key, handle.channel);
                const keyValue = getKeyframeValue(handle.key, handle.channel);
                const keyTime = handle.key.time;
                let tangentTime = graphXToTime(x);
                let tangentValue = graphYToValue(y, { height });
                if (event.shiftKey) {
                    const fps = Math.max(1, getFps());
                    tangentTime = Math.round(tangentTime * fps) / fps;
                }
                tangents[handle.side].dx = tangentTime - keyTime;
                tangents[handle.side].dy = tangentValue - keyValue;
                if (handle.side === 'in') tangents.in.dx = Math.min(-0.001, tangents.in.dx);
                if (handle.side === 'out') tangents.out.dx = Math.max(0.001, tangents.out.dx);
                if (handle.context?.object?.uuid) window.TimelineBinaryEvaluator?.invalidateCache?.(handle.context.object.uuid);
                renderGraph();
                return;
            }
            if (state.graphDragMode === 'scrub') {
                const time = Math.max(0, Math.min(state.duration, graphXToTime(x)));
                setCurrentTime(time);
            }
        });
        const stopDrag = event => {
            if (!state.graphDragging) return;
            state.graphDragging = false;
            state.graphPanning = false;
            state.graphDragMode = null;
            state.graphDragStart = null;
            try {
                canvas.releasePointerCapture?.(event.pointerId);
            } catch (error) { }
            updateGraphCursor(event);
        };
        canvas.addEventListener('pointerup', stopDrag);
        canvas.addEventListener('pointercancel', stopDrag);
        canvas.addEventListener('lostpointercapture', event => {
            state.graphDragging = false;
            state.graphPanning = false;
            state.graphDragMode = null;
            state.graphDragStart = null;
            canvas.style.cursor = 'grab';
        });
        canvas.addEventListener('pointermove', updateGraphCursor);
        canvas.addEventListener('pointerleave', () => {
            if (!state.graphDragging) canvas.style.cursor = 'grab';
        });
        canvas.addEventListener('contextmenu', event => {
            event.preventDefault();
        });
        canvas.addEventListener('dblclick', event => {
            event.preventDefault();
            const { x, y } = pointerPosition(event);
            const hit = hitTest(x, y);
            if (hit) {
                state.selectedGraphHandle = hit;
                if (Number.isFinite(hit.time)) setCurrentTime(hit.time);
                renderGraph();
                return;
            }
            frameGraphAllCurves();
        });
    }

    function bindTimeline() {
        injectBlenderTimelineGridStyles();
        ensureMaps();
        bindProfessionalTimelineUI();
        bindTimelineScrollSync();
        bindButton('play', () => { window.isPlaying = true; syncPlaybackButtonState(); });
        bindButton('pause', () => { window.isPlaying = false; syncPlaybackButtonState(); });
        bindButton('stop', () => { window.isPlaying = false; setCurrentTime(0); syncPlaybackButtonState(); });
        bindButton('step-forward', () => setCurrentTime(getCurrentTime() + 1 / getFps()));
        bindButton('step-backward', () => setCurrentTime(getCurrentTime() - 1 / getFps()));
        bindButton('step-forward-sec', () => setCurrentTime(getCurrentTime() + 1));
        bindButton('step-backward-sec', () => setCurrentTime(getCurrentTime() - 1));
        bindButton('add-keyframe', addKeyframe);
        bindButton('delete-keyframe', deleteKeyframe);
        bindButton('zoom-in', () => {
            if (state.activeView === 'graph') {
                state.graphZoomX = Math.min(12, state.graphZoomX * 1.25);
                renderGraph();
            } else {
                state.zoom = Math.min(4, state.zoom * 1.25);
                updateKeyframesUI();
            }
        });
        bindButton('zoom-out', () => {
            if (state.activeView === 'graph') {
                state.graphZoomX = Math.max(0.25, state.graphZoomX / 1.25);
                renderGraph();
            } else {
                state.zoom = Math.max(0.4, state.zoom / 1.25);
                updateKeyframesUI();
            }
        });
        bindButton('view-timeline', () => setTimelineView('timeline'));
        bindButton('view-graph', () => setTimelineView('graph'));
        bindButton('view-nodes-global', () => setTimelineView('nodes'));
        bindButton('boneRigButton', () => setTimelineView('bone'));
        // Graph Editor toolbar buttons
        bindButton('graph-view-all', () => {
            state._graphAutoFitted = false;
            renderGraph();
        });
        bindButton('graph-auto-frame', () => {
            state._graphAutoFitted = false;
            renderGraph();
        });
        bindButton('graph-normalize', () => {
            state.graphZoomY = 1;
            state.graphZoomX = 1;
            state.graphPanX = 0;
            state.graphPanY = 0;
            state._graphAutoFitted = false;
            renderGraph();
        });
        $('playback-speed')?.addEventListener('change', e => {
            window.playbackSpeed = Number(e.target.value) || 1;
        });

        $('loop-toggle')?.addEventListener('change', e => {
            window.loopEnabled = !!e.target.checked;
            updateTimelineLoopVisual();
        });

        bindButton('set-loop-start', () => {
            window.loopStart = getCurrentTime() * 1000;

            if ($('loop-start-time')) {
                $('loop-start-time').value =
                    formatTime(window.loopStart / 1000);
            }

            updateTimelineLoopVisual();
        });

        bindButton('set-loop-end', () => {
            window.loopEnd = getCurrentTime() * 1000;

            if ($('loop-end-time')) {
                $('loop-end-time').value =
                    formatTime(window.loopEnd / 1000);
            }

            updateTimelineLoopVisual();
        });

        $('loop-start-time')?.addEventListener('change', e => {
            window.loopStart =
                parseTime(e.target.value) * 1000;

            updateTimelineLoopVisual();
        });

        $('loop-end-time')?.addEventListener('change', e => {
            window.loopEnd =
                parseTime(e.target.value) * 1000;

            updateTimelineLoopVisual();
        });
        $('interpolation-type-select')?.addEventListener('change', e => {
            const interpolation = e.target.value;
            const handle = state.selectedGraphHandle;
            if (state.activeView === 'graph' && handle?.type === 'key') {
                if (handle.sourceType === 'native') {
                    const ref = handle.nativeRef;
                    if (ref?.track) {
                        let mode = THREE.InterpolateLinear;
                        if (interpolation === 'constant') mode = THREE.InterpolateDiscrete;
                        else if (interpolation === 'bezier') mode = THREE.InterpolateSmooth;
                        try {
                            ref.track.setInterpolation(mode);
                            rebuildNativeMixer(ref.owner);
                            state.nativeGraphCache?.clear();
                            renderGraph();
                        } catch (error) {
                            console.warn('[GraphEditor] Unable to change native interpolation:', error);
                        }
                    }
                } else if (handle.key) {
                    handle.key.interpolation = interpolation;
                    if (handle.context?.object?.uuid) window.TimelineBinaryEvaluator?.invalidateCache?.(handle.context.object.uuid);
                    renderGraph();
                    updateKeyframesUI();
                }
                return;
            }
            const obj = getSelectedObject();
            if (!obj) return;
            const map = window.keyframes?.get(obj.uuid);
            if (!map) return;
            if (state.selectedKeyframes.size) {
                state.selectedKeyframes.forEach(el => {
                    if (el.dataset.uuid !== obj.uuid) return;
                    const key = map[Number(el.dataset.frame)];
                    if (key) key.interpolation = interpolation;
                });
            } else {
                Object.values(map).forEach(key => key.interpolation = interpolation);
            }
            window.TimelineBinaryEvaluator?.invalidateCache?.(obj.uuid);
            renderGraph();
            updateKeyframesUI();
        });

        // 2D Animation Mode Toggle
        bindButton('toggle-2d-animation-btn', () => {
            const btn = document.getElementById('toggle-2d-animation-btn');
            const ctrlGroup = document.getElementById('anim-2d-controls-group');

            // Use the safe entry function that sets up toolbar + inspector + white background
            if (typeof window.enter2DAnimationModeSafe === 'function') {
                window.enter2DAnimationModeSafe();
            } else if (window.animation2DManager) {
                if (window.animation2DManager.isActive) {
                    window.animation2DManager.exitMode();
                    window._apply2DUI?.(false);
                } else {
                    window._apply2DUI?.(true);
                    window.animation2DManager.enterMode();
                }
            }

            const isNowActive = window.animation2DManager?.isActive ??
                document.body.classList.contains('animation-2d-mode-active');
            btn?.classList.toggle('active', isNowActive);
            if (ctrlGroup) ctrlGroup.style.display = isNowActive ? 'flex' : '';

            if (isNowActive) {
                setTimeout(() => {
                    window.animation2DManager?.syncWithTimeline?.();
                    updateLayersUI?.();
                    updateKeyframesUI?.();
                }, 100);
            }
        });


        // Onion skin toggle
        bindButton('toggle-onion-skin', () => {
            const btn = document.getElementById('toggle-onion-skin');
            if (window.animation2DManager) {
                window.animation2DManager.onionSkinning = !window.animation2DManager.onionSkinning;
                btn?.classList.toggle('active', window.animation2DManager.onionSkinning);
                window.animation2DManager.render();
            }
        });

        bindTimelineInteraction();
        bindGraphInteractions();
        bindTimelineKeyboardShortcuts();

        window.addEventListener('resize', () => {
            if (state.activeView === 'graph') {
                requestAnimationFrame(refreshGraphCanvas);
            }
        });

        updateLayersUI();
        updateKeyframesUI();
        setTimelineView('timeline');
        requestTimelineRowAlignment();
        updateProfessionalTimelineStatus();
        startTimelineTicker();
        syncPlaybackButtonState();
    }

    /**
     * Unified timeline-content interaction:
     * - Plain click on empty space (no drag): scrub the playhead there, clear keyframe selection.
     * - Click-drag on empty space: marquee/box-select keyframes under the box (Blender-style).
     *   Hold Shift while dragging to ADD to the existing selection instead of replacing it.
     * - Clicking directly on a keyframe is handled by its own listener (see updateKeyframesUI)
     *   and is ignored here.
     */
    function bindTimelineInteraction() {
        const content = $('timeline-content');
        const selectionBox = $('selection-box');
        if (!content || content.dataset.smScrubBound) return;
        content.dataset.smScrubBound = '1';

        const DRAG_THRESHOLD = 4; // px of movement before a click becomes a drag

        let pointerDown = false;
        let dragging = false;
        let additive = false;
        let startClientX = 0;
        let startClientY = 0;
        let startLeft = 0; // box-relative coords (content space, includes scroll)
        let startTop = 0;

        const timeFromClientX = (clientX) => {
            const rect = content.getBoundingClientRect();
            return xToTime(clientX - rect.left + content.scrollLeft);
        };

        const applyMarqueeHitTest = (cx1, cy1, cx2, cy2) => {
            if (!additive) clearKeyframeSelection();
            const left = Math.min(cx1, cx2);
            const right = Math.max(cx1, cx2);
            const top = Math.min(cy1, cy2);
            const bottom = Math.max(cy1, cy2);
            document.querySelectorAll('#keyframes-container .keyframe').forEach((el) => {
                const r = el.getBoundingClientRect();
                const cx = r.left + r.width / 2;
                const cy = r.top + r.height / 2;
                if (cx >= left && cx <= right && cy >= top && cy <= bottom) {
                    setKeyframeSelected(el, true);
                }
            });
        };

        const updateSelectionBox = (clientX, clientY) => {
            if (selectionBox) {
                const rect = content.getBoundingClientRect();
                const curLeft = clientX - rect.left + content.scrollLeft;
                const curTop = clientY - rect.top + content.scrollTop;
                const x1 = Math.min(startLeft, curLeft);
                const x2 = Math.max(startLeft, curLeft);
                const y1 = Math.min(startTop, curTop);
                const y2 = Math.max(startTop, curTop);
                selectionBox.style.display = 'block';
                selectionBox.style.left = `${x1}px`;
                selectionBox.style.top = `${y1}px`;
                selectionBox.style.width = `${Math.max(1, x2 - x1)}px`;
                selectionBox.style.height = `${Math.max(1, y2 - y1)}px`;
            }
            applyMarqueeHitTest(startClientX, startClientY, clientX, clientY);
        };

        content.addEventListener('pointerdown', (event) => {
            if (event.button !== 0) return; // left button only
            if (event.target.closest('.keyframe')) return; // let the keyframe's own click handler run
            pointerDown = true;
            dragging = false;
            additive = event.shiftKey;
            startClientX = event.clientX;
            startClientY = event.clientY;
            const rect = content.getBoundingClientRect();
            startLeft = event.clientX - rect.left + content.scrollLeft;
            startTop = event.clientY - rect.top + content.scrollTop;
            content.setPointerCapture?.(event.pointerId);
        });

        content.addEventListener('pointermove', (event) => {
            if (!pointerDown) return;
            const dx = event.clientX - startClientX;
            const dy = event.clientY - startClientY;
            if (!dragging && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
                dragging = true;
            }
            if (dragging) updateSelectionBox(event.clientX, event.clientY);
        });

        const endInteraction = (event) => {
            if (!pointerDown) return;
            pointerDown = false;
            content.releasePointerCapture?.(event.pointerId);
            if (dragging) {
                dragging = false;
                if (selectionBox) selectionBox.style.display = 'none';
            } else {
                // Plain click (no drag): scrub, and clear selection unless a modifier is held
                if (!event.shiftKey && !event.ctrlKey && !event.metaKey) clearKeyframeSelection();
                setCurrentTime(timeFromClientX(event.clientX));
            }
        };

        const scale = q('.timeline-scale');
        if (content && scale) {
            content.addEventListener('scroll', () => {
                scale.scrollLeft = content.scrollLeft;
            });
        }

        content.addEventListener('pointerup', endInteraction);
        content.addEventListener('pointercancel', endInteraction);
    }

    function removeNativeTrackKey(ref) {
        const track = ref?.track;
        if (!track?.times?.length || track.times.length <= 1) return false;
        const size = track.getValueSize();
        const times = [];
        const values = [];
        for (let i = 0; i < track.times.length; i++) {
            if (i === ref.keyIndex) continue;
            times.push(Number(track.times[i]));
            for (let j = 0; j < size; j++)values.push(track.values[i * size + j]);
        }
        const TimesConstructor = track.times.constructor;
        const ValuesConstructor = track.values.constructor;
        track.times = ArrayBuffer.isView(track.times) ? new TimesConstructor(times) : times;
        track.values = ArrayBuffer.isView(track.values) ? new ValuesConstructor(values) : values;
        ref.clip?.resetDuration?.();
        rebuildNativeMixer(ref.owner);
        state.nativeGraphCache?.clear();
        return true;
    }
    function deleteSelectedGraphKey() {
        const handle = state.selectedGraphHandle;
        if (!handle?.key) return;
        if (state.graphLockedChannels.has(handle.channel)) return;
        if (handle.sourceType === 'native') {
            if (removeNativeTrackKey(handle.nativeRef)) {
                state.selectedGraphHandle = null;
                state._graphAutoFitted = false;
                setCurrentTime(Math.min(getCurrentTime(), state.duration));
                renderGraph();
            }
            return;
        }
        const context = handle.context;
        const map = context?.map;
        if (!map) return;
        delete map[handle.frame];
        if (handle.sourceType === 'bone') {
            context.boneMap?.set(context.boneName, map);
            if (context.object?.uuid) {
                window.boneKeyframes?.set(context.object.uuid, context.boneMap);
                window.TimelineBinaryEvaluator?.invalidateCache?.(context.object.uuid);
            }
        } else if (context.object?.uuid) {
            window.keyframes?.set(context.object.uuid, map);
            window.TimelineBinaryEvaluator?.invalidateCache?.(context.object.uuid);
        }
        state.selectedGraphHandle = null;
        updateKeyframesUI();
        renderGraph();
    }

    /**
     * Keyboard shortcuts for the timeline: Delete/Backspace removes the current
     * keyframe selection, Ctrl/Cmd+A selects every visible keyframe, Escape clears it.
     * Ignored while the user is typing in an input/textarea/select.
     */
    function bindTimelineKeyboardShortcuts() {
        if (window.__smTimelineKeysBound) return;
        window.__smTimelineKeysBound = true;
        document.addEventListener('keydown', event => {
            const active = document.activeElement;
            const tag = active?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || active?.isContentEditable) return;
            if (state.activeView === 'graph') {
                const key = String(event.key || '').toLowerCase();
                if (key === 'f' || key === 'home') {
                    event.preventDefault();
                    state._graphAutoFitted = false;
                    frameGraphAllCurves();
                    return;
                }
                if ((event.key === 'Delete' || event.key === 'Backspace') && state.selectedGraphHandle) {
                    event.preventDefault();
                    deleteSelectedGraphKey();
                    return;
                }
                if (key === 'escape') {
                    event.preventDefault();
                    state.selectedGraphHandle = null;
                    state.graphDragging = false;
                    state.graphPanning = false;
                    state.graphDragMode = null;
                    state.graphDragStart = null;
                    const canvas = $('graph-canvas');
                    if (canvas) canvas.style.cursor = 'grab';
                    renderGraph();
                    return;
                }
                if (key === 'arrowleft') {
                    event.preventDefault();
                    setCurrentTime(getCurrentTime() - 1 / getFps());
                    return;
                }
                if (key === 'arrowright') {
                    event.preventDefault();
                    setCurrentTime(getCurrentTime() + 1 / getFps());
                    return;
                }
                if (key === ' ') {
                    event.preventDefault();
                    window.isPlaying = !window.isPlaying;
                    state.lastTick = performance.now();
                    if (window.isPlaying && !state.tickerRaf && typeof startTimelineTicker === 'function') startTimelineTicker();
                    syncPlaybackButtonState();
                    return;
                }
                return;
            }
            if (state.activeView !== 'timeline') return;
            if ((event.key === 'Delete' || event.key === 'Backspace') && state.selectedKeyframes.size) {
                event.preventDefault();
                deleteKeyframe();
                return;
            }
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
                event.preventDefault();
                selectAllVisibleKeyframes();
                return;
            }
            if (event.key === 'Escape' && state.selectedKeyframes.size) {
                event.preventDefault();
                clearKeyframeSelection();
                return;
            }
            if (event.key === 'ArrowLeft') {
                event.preventDefault();
                setCurrentTime(getCurrentTime() - 1 / getFps());
                return;
            }
            if (event.key === 'ArrowRight') {
                event.preventDefault();
                setCurrentTime(getCurrentTime() + 1 / getFps());
            }
        });
    }


    window.addEventListener('sm:timeline-panel-ready', () => {
        bindProfessionalTimelineUI();
        bindTimelineScrollSync();

        requestAnimationFrame(() => {
            updateLayersUI();
            updateKeyframesUI();
            requestTimelineRowAlignment();
        });
    });

    window.SMTimeline = {
        ownsPlayback: true,
        _expandedRoots,          // exposed so animation-converter can auto-expand on import
        addObjectToTimeline,
        addKeyframe,
        deleteKeyframe,
        updateLayersUI,
        updateKeyframesUI,
        updatePlayhead,
        updateTimeDisplay,
        updateSceneFromTimeline,
        renderGraph,
        setTimelineView,
        ensurePlayerGraphEditor,
        buildTimelineVisibleRows,
        measureTimelineRowMetrics,
        alignTimelineRowsToLayers,
        requestTimelineRowAlignment,
        bindTimelineScrollSync,
        bindProfessionalTimelineUI,
        selectTimelineRow,
        updateTimelineRowSelectionVisuals,
        updateTimelineLoopVisual
    };

    Object.assign(window, {
        addObjectToTimeline,
        addKeyframe,
        deleteKeyframe,
        updateLayersUI,
        updateKeyframesUI,
        updatePlayhead,
        updateTimeDisplay,
        updateSceneFromTimeline,
        renderGraph,
        initGraphEditor: renderGraph,
        resizeGraphCanvas: renderGraph,
        alignTimelineRowsToLayers,
        refreshTimelineRows: requestTimelineRowAlignment
    });

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindTimeline);
    else bindTimeline();
})();
