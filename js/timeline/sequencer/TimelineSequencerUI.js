// js/timeline/sequencer/TimelineSequencerUI.js
// Professional Sequencer sections UI rendered into existing timeline rows.

(() => {
    "use strict";

    class TimelineSequencerUI {
        constructor() {
            this._bound = false;
            this._renderRaf = 0;
            this._styleId = "sm-sequencer-pro-styles";
        }

        init() {
            this.injectStyles();
            this.installToolbar();

            if (this._bound) return;

            this._bound = true;

            const rerender = () => this.scheduleRender();

            window.addEventListener("sm:sequencer-model-change", rerender);
            window.addEventListener("sm:timeline-row-selected", rerender);
            window.addEventListener("sm:sequencer-selection-change", rerender);
            window.addEventListener("sm:timeline-panel-ready", rerender);
            window.addEventListener("resize", rerender);
            window.addEventListener("timeUpdate", rerender);

            document
                .getElementById("timeline-content")
                ?.addEventListener(
                    "scroll",
                    rerender,
                    { passive: true }
                );

            this.scheduleRender();
        }

        installToolbar() {
            const commandbar =
                document.querySelector(
                    "#timelineBody .sm-timeline-commandbar"
                );

            if (!commandbar) return;

            if (
                commandbar.querySelector(
                    ".sm-sequencer-command-group"
                )
            ) {
                return;
            }

            const group =
                document.createElement("div");

            group.className =
                "sm-timeline-command-group sm-sequencer-command-group";

            group.innerHTML = `
                <button class="sm-timeline-command-text" data-seq-action="add-section">
                    + Section
                </button>

                <button class="sm-timeline-command-tool" data-seq-action="split" title="Split Selected at Playhead">
                    ╱
                </button>

                <button class="sm-timeline-command-tool" data-seq-action="duplicate" title="Duplicate Selected">
                    ⧉
                </button>

                <button class="sm-timeline-command-tool" data-seq-action="loop" title="Loop Selected Section">
                    ↻
                </button>

                <button class="sm-timeline-command-tool" data-seq-action="marker" title="Add Marker">
                    ◆
                </button>

                <button class="sm-timeline-command-tool" data-seq-action="region" title="Add Region">
                    ▭
                </button>

                <button class="sm-timeline-command-text active" data-seq-action="snap">
                    ⌁ Snap
                </button>
            `;

            const spacer =
                commandbar.querySelector(
                    ".sm-timeline-command-spacer"
                );

            commandbar.insertBefore(
                group,
                spacer || null
            );

            group.addEventListener("click", event => {
                const button =
                    event.target.closest("[data-seq-action]");

                if (!button) return;

                const action =
                    button.dataset.seqAction;

                this.executeAction(action, button);
            });
        }

        executeAction(action, button = null) {
            const editor =
                window.timelineSectionEditor;

            if (action === "add-section") {
                this.addSectionToSelectedTrack();
                return;
            }

            if (action === "split") {
                editor?.splitSelectedAtPlayhead();
                return;
            }

            if (action === "duplicate") {
                editor?.duplicateSelected();
                return;
            }

            if (action === "loop") {
                editor?.toggleLoopSelected();
                return;
            }

            if (action === "marker") {
                window.timelineMarkerRegionSystem
                    ?.addMarker({
                        time: Number(window.currentTime || 0),
                        name: `Marker ${window.timelineMarkerRegionSystem.markers.length + 1}`
                    });
                return;
            }

            if (action === "region") {
                const time =
                    Number(window.currentTime || 0);

                window.timelineMarkerRegionSystem
                    ?.addRegion({
                        start: time,
                        end:
                            time +
                            Math.max(
                                1,
                                Number(window.timelineDuration || 30) * 0.08
                            ),
                        name:
                            `Region ${window.timelineMarkerRegionSystem.regions.length + 1}`
                    });
                return;
            }

            if (action === "snap") {
                const enabled =
                    window.timelineSnapManager?.toggle();

                button?.classList.toggle(
                    "active",
                    !!enabled
                );
            }
        }

        addSectionToSelectedTrack() {
            const model =
                window.timelineSequencerModel;

            const selectedRowKey =
                window.SMTimeline?.state?.timelineSelectedRowKey ||
                null;

            let track =
                selectedRowKey
                    ? model?.getTrackByRowKey(selectedRowKey)
                    : null;

            if (!track) {
                const rows =
                    window.SMTimeline?.buildTimelineVisibleRows?.() ||
                    [];

                const selectedUuid =
                    window.selectedObject?.uuid;

                const row =
                    rows.find(item =>
                        item.rowKey ===
                        window.timelineSequencerSystem?.selectedRowKey
                    ) ||
                    rows.find(item =>
                        item.uuid === selectedUuid
                    ) ||
                    rows[0];

                if (row) {
                    track =
                        model?.ensureTrackForTimelineRow(row);
                }
            }

            if (!track) {
                console.warn("[SequencerUI] Select a timeline row first.");
                return null;
            }

            const start =
                Number(window.currentTime || 0);

            const duration =
                Math.max(
                    0.001,
                    Number(window.timelineDuration || 30)
                );

            const section =
                model.addSection(track.id, {
                    name: "Section",
                    start,
                    end:
                        Math.min(
                            duration,
                            start +
                            Math.max(
                                1,
                                duration * 0.1
                            )
                        )
                });

            if (section) {
                window.timelineSectionEditor?.select(
                    section.id
                );
            }

            return section;
        }

        scheduleRender() {
            if (this._renderRaf) {
                cancelAnimationFrame(this._renderRaf);
            }

            this._renderRaf =
                requestAnimationFrame(() => {
                    this._renderRaf = 0;
                    this.render();
                });
        }

        render() {
            const model =
                window.timelineSequencerModel;

            if (!model) return;

            model.syncFromTimelineRows();

            const rowMap =
                new Map();

            document
                .querySelectorAll(
                    "#keyframes-container .timeline-track-row[data-row-key]"
                )
                .forEach(row => {
                    rowMap.set(
                        row.dataset.rowKey,
                        row
                    );

                    row
                        .querySelectorAll(
                            ":scope > .sm-sequencer-section"
                        )
                        .forEach(el => el.remove());
                });

            model.sequence.tracks.forEach(track => {
                if (!track.rowKey || track.visible === false) return;

                const row =
                    rowMap.get(track.rowKey);

                if (!row) return;

                row.classList.toggle(
                    "sm-sequencer-track-muted",
                    !!track.muted
                );

                row.classList.toggle(
                    "sm-sequencer-track-locked",
                    !!track.locked
                );

                track.sections.forEach(section => {
                    const el =
                        this.createSectionElement(
                            track,
                            section
                        );

                    row.appendChild(el);
                });

                this.decorateLeftRow(track);
            });

            window.timelineSectionEditor
                ?._refreshSelectionUI?.();

            window.timelineMarkerRegionSystem
                ?.scheduleRender?.();
        }

        createSectionElement(track, section) {
            const el =
                document.createElement("div");

            el.className =
                "sm-sequencer-section";

            if (section.loop) {
                el.classList.add("looped");
            }

            if (section.muted) {
                el.classList.add("muted");
            }

            if (section.locked || track.locked) {
                el.classList.add("locked");
            }

            el.dataset.sectionId =
                section.id;

            el.dataset.trackId =
                track.id;

            const startX =
                this.timeToX(section.start);

            const endX =
                this.timeToX(section.end);

            el.style.left =
                `${startX}px`;

            el.style.width =
                `${Math.max(10, endX - startX)}px`;

            const sourceOffset =
                Math.max(
                    0,
                    Number(section.sourceStart || 0)
                );

            el.innerHTML = `
                <span class="sm-section-trim-start"></span>

                <span class="sm-section-body">
                    <span class="sm-section-type-icon">
                        ${this.iconForType(section.type)}
                    </span>

                    <span class="sm-section-name">
                        ${this.escape(section.name)}
                    </span>

                    ${
                        section.loop
                            ? `<span class="sm-section-loop-badge">LOOP</span>`
                            : ""
                    }

                    ${
                        sourceOffset > 0
                            ? `<span class="sm-section-source-offset">+${sourceOffset.toFixed(2)}s</span>`
                            : ""
                    }
                </span>

                <span class="sm-section-trim-end"></span>

                <span
                    class="sm-section-blend-in"
                    style="width:${this.blendPx(section.blendIn)}px"
                ></span>

                <span
                    class="sm-section-blend-out"
                    style="width:${this.blendPx(section.blendOut)}px"
                ></span>
            `;

            return el;
        }

        decorateLeftRow(track) {
            const row =
                document.querySelector(
                    `#layers-list .timeline-layer-item[data-row-key="${CSS.escape(track.rowKey)}"]`
                );

            if (!row) return;

            row.dataset.sequencerTrackId =
                track.id;

            let controls =
                row.querySelector(
                    ".sm-sequencer-track-controls"
                );

            if (!controls) {
                controls =
                    document.createElement("span");

                controls.className =
                    "sm-sequencer-track-controls";

                controls.innerHTML = `
                    <button data-track-state="solo" title="Solo">S</button>
                    <button data-track-state="mute" title="Mute">M</button>
                    <button data-track-state="locked" title="Lock">⌑</button>
                `;

                row.appendChild(controls);

                controls.addEventListener("click", event => {
                    const button =
                        event.target.closest("[data-track-state]");

                    if (!button) return;

                    event.stopPropagation();

                    const property =
                        button.dataset.trackState;

                    if (property === "mute") {
                        window.timelineTrackStateManager
                            ?.toggle(track.id, "muted");
                    } else {
                        window.timelineTrackStateManager
                            ?.toggle(track.id, property);
                    }

                    this.scheduleRender();
                });
            }

            controls
                .querySelector('[data-track-state="solo"]')
                ?.classList.toggle(
                    "active",
                    !!track.solo
                );

            controls
                .querySelector('[data-track-state="mute"]')
                ?.classList.toggle(
                    "active",
                    !!track.muted
                );

            controls
                .querySelector('[data-track-state="locked"]')
                ?.classList.toggle(
                    "active",
                    !!track.locked
                );
        }

        timeToX(time) {
            const content =
                document.getElementById("timeline-content");

            const container =
                document.getElementById("keyframes-container");

            const duration =
                Math.max(
                    0.001,
                    Number(window.timelineDuration || 30)
                );

            const width =
                Math.max(
                    Number(container?.scrollWidth || container?.offsetWidth || 0),
                    Number(content?.scrollWidth || content?.clientWidth || 900),
                    1
                );

            return Math.max(
                0,
                Math.min(duration, Number(time) || 0)
            ) / duration * width;
        }

        blendPx(seconds) {
            const pps =
                window.timelineSnapManager
                    ?.pixelsPerSecond?.() ||
                30;

            return Math.max(
                0,
                Number(seconds || 0) * pps
            );
        }

        iconForType(type) {
            const icons = {
                animation: "▶",
                camera: "◉",
                audio: "♪",
                event: "◆",
                transform: "↗",
                visibility: "◐",
                material: "◫",
                custom: "•"
            };

            return icons[type] || icons.custom;
        }

        escape(value) {
            return String(value ?? "")
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#039;");
        }

        injectStyles() {
            if (document.getElementById(this._styleId)) return;

            const style =
                document.createElement("style");

            style.id = this._styleId;

            style.textContent = `
                #timelineBody {
                    --sm-seq-section:#47525a;
                    --sm-seq-section-hover:#52616a;
                    --sm-seq-section-selected:#657780;
                    --sm-seq-marker:#b8965d;
                    --sm-seq-region:rgba(92,124,132,.09);
                }

                #timelineBody .sm-sequencer-command-group {
                    display:flex;
                    align-items:center;
                    gap:1px;
                }

                #timelineBody .sm-sequencer-section {
                    position:absolute;
                    top:4px;
                    height:calc(100% - 8px);
                    min-width:10px;

                    display:flex;
                    align-items:stretch;

                    overflow:hidden;

                    background:
                        linear-gradient(
                            180deg,
                            rgba(255,255,255,.035),
                            transparent 48%
                        ),
                        var(--sm-seq-section);

                    color:#c1c8cb;

                    border:0;
                    border-radius:0;

                    box-shadow:
                        inset 0 1px 0 rgba(255,255,255,.035);

                    z-index:4;

                    cursor:grab;

                    user-select:none;
                }

                #timelineBody .sm-sequencer-section:hover {
                    background:
                        linear-gradient(
                            180deg,
                            rgba(255,255,255,.05),
                            transparent 48%
                        ),
                        var(--sm-seq-section-hover);
                }

                #timelineBody .sm-sequencer-section.selected {
                    background:
                        linear-gradient(
                            180deg,
                            rgba(255,255,255,.07),
                            transparent 48%
                        ),
                        var(--sm-seq-section-selected);

                    box-shadow:
                        inset 2px 0 0 rgba(185,210,216,.72),
                        inset -1px 0 0 rgba(185,210,216,.34);
                }

                #timelineBody .sm-sequencer-section.looped {
                    background-image:
                        repeating-linear-gradient(
                            135deg,
                            rgba(255,255,255,.035) 0 6px,
                            transparent 6px 12px
                        ),
                        linear-gradient(
                            180deg,
                            rgba(255,255,255,.035),
                            transparent 48%
                        );
                }

                #timelineBody .sm-sequencer-section.muted {
                    opacity:.38;
                }

                #timelineBody .sm-sequencer-section.locked {
                    cursor:not-allowed;
                    filter:saturate(.45);
                }

                #timelineBody .sm-section-body {
                    min-width:0;
                    flex:1 1 auto;

                    display:flex;
                    align-items:center;
                    gap:5px;

                    padding:0 6px;

                    overflow:hidden;
                }

                #timelineBody .sm-section-type-icon {
                    flex:0 0 auto;
                    color:#9eb2b7;
                    font-size:8px;
                }

                #timelineBody .sm-section-name {
                    min-width:0;
                    overflow:hidden;

                    color:#c8ced1;

                    text-overflow:ellipsis;
                    white-space:nowrap;

                    font-size:8px;
                    font-weight:600;
                }

                #timelineBody .sm-section-loop-badge,
                #timelineBody .sm-section-source-offset {
                    flex:0 0 auto;

                    color:#87959a;

                    font-size:6.5px;
                    letter-spacing:.2px;
                }

                #timelineBody .sm-section-trim-start,
                #timelineBody .sm-section-trim-end {
                    width:5px;
                    flex:0 0 5px;

                    background:transparent;

                    cursor:ew-resize;

                    z-index:10;
                }

                #timelineBody .sm-section-trim-start:hover,
                #timelineBody .sm-section-trim-end:hover {
                    background:rgba(220,235,239,.18);
                }

                #timelineBody .sm-section-blend-in,
                #timelineBody .sm-section-blend-out {
                    position:absolute;
                    top:0;
                    bottom:0;

                    pointer-events:none;

                    opacity:.38;
                }

                #timelineBody .sm-section-blend-in {
                    left:0;
                    background:
                        linear-gradient(
                            135deg,
                            rgba(255,255,255,.18),
                            transparent
                        );
                }

                #timelineBody .sm-section-blend-out {
                    right:0;
                    background:
                        linear-gradient(
                            225deg,
                            rgba(255,255,255,.18),
                            transparent
                        );
                }

                #timelineBody .sm-sequencer-track-controls {
                    margin-left:auto;

                    display:inline-flex;
                    align-items:center;
                    gap:1px;
                }

                #timelineBody .sm-sequencer-track-controls button {
                    width:16px!important;
                    min-width:16px!important;
                    height:16px!important;
                    min-height:16px!important;

                    display:grid!important;
                    place-items:center!important;

                    padding:0!important;

                    background:transparent!important;
                    color:#606060!important;

                    border:0!important;
                    border-radius:0!important;

                    font-size:6.5px!important;

                    cursor:pointer!important;
                }

                #timelineBody .sm-sequencer-track-controls button:hover {
                    background:rgba(255,255,255,.05)!important;
                    color:#bbb!important;
                }

                #timelineBody .sm-sequencer-track-controls button.active {
                    background:rgba(255,255,255,.08)!important;
                    color:#e4e4e4!important;
                }

                #timelineBody .sm-sequencer-track-muted {
                    opacity:.48;
                }

                #timelineBody .sm-marker-region-layer {
                    position:absolute;
                    top:0;
                    left:0;
                    bottom:0;

                    min-height:100%;

                    pointer-events:none;

                    z-index:12;
                }

                #timelineBody .sm-sequencer-region {
                    position:absolute;
                    top:0;
                    bottom:0;

                    background:var(--sm-seq-region);

                    box-shadow:
                        inset 1px 0 0 rgba(115,157,166,.35),
                        inset -1px 0 0 rgba(115,157,166,.35);

                    pointer-events:none;
                }

                #timelineBody .sm-sequencer-region-label {
                    position:absolute;
                    top:3px;
                    left:4px;

                    padding:2px 4px;

                    background:rgba(37,37,37,.7);
                    color:#809399;

                    font-size:7px;

                    white-space:nowrap;
                }

                #timelineBody .sm-sequencer-marker {
                    position:absolute;
                    top:0;
                    bottom:0;

                    width:1px;

                    padding:0;

                    background:rgba(184,150,93,.52);

                    border:0;
                    border-radius:0;

                    pointer-events:auto;

                    cursor:pointer;

                    z-index:18;
                }

                #timelineBody .sm-sequencer-marker-head {
                    position:absolute;
                    top:1px;
                    left:-6px;

                    width:12px;
                    height:10px;

                    display:grid;
                    place-items:center;

                    background:#786a50;
                    color:#d8c99e;

                    clip-path:
                        polygon(
                            0 0,
                            100% 0,
                            100% 60%,
                            50% 100%,
                            0 60%
                        );

                    font-size:6px;
                }

                #timelineBody .sm-sequencer-marker-label {
                    position:absolute;
                    top:2px;
                    left:8px;

                    color:#9c8a69;

                    font-size:7px;

                    white-space:nowrap;
                }

                #timelineBody .timeline-track-row > .keyframe {
                    z-index:8!important;
                }

                #timelineBody .timeline-track-row > .sm-sequencer-section {
                    z-index:4!important;
                }
            `;

            document.head.appendChild(style);
        }
    }

    window.TimelineSequencerUI =
        TimelineSequencerUI;

    window.timelineSequencerUI =
        window.timelineSequencerUI ||
        new TimelineSequencerUI();
})();