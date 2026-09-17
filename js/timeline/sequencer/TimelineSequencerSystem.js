// js/timeline/sequencer/TimelineSequencerSystem.js
// Main orchestrator. Load LAST after all Sequencer files.

(() => {
    "use strict";

    class TimelineSequencerSystem {
        constructor() {
            this.initialized = false;
            this.selectedRowKey = null;
            this.events = new EventTarget();

            this._panelRetry = 0;
        }

        init() {
            if (this.initialized) return true;

            if (!document.getElementById("timelineBody")) {
                if (this._panelRetry < 20) {
                    this._panelRetry += 1;
                    setTimeout(() => this.init(), 120);
                }

                return false;
            }

            this.initialized = true;

            window.timelineSectionEditor?.init?.();
            window.timelineMarkerRegionSystem?.init?.();
            window.timelineSequencerUI?.init?.();

            window.timelineSequencerModel
                ?.syncFromTimelineRows?.();

            this.bindEvents();

            this.dispatch("ready", {
                sequence:
                    window.timelineSequencerModel?.sequence ||
                    null
            });

            console.log("✅ SM Timeline Sequencer Pro ready");

            return true;
        }

        bindEvents() {
            window.addEventListener(
                "sm:timeline-row-selected",
                event => {
                    this.selectedRowKey =
                        event.detail?.rowKey ||
                        null;

                    const track =
                        window.timelineSequencerModel
                            ?.getTrackByRowKey?.(
                                this.selectedRowKey
                            );

                    if (track) {
                        this.dispatch(
                            "track-selected",
                            { track }
                        );
                    }
                }
            );

            window.addEventListener(
                "sm:timeline-panel-ready",
                () => {
                    window.timelineSequencerUI
                        ?.installToolbar?.();

                    this.refresh();
                }
            );

            window.addEventListener(
                "sm:sequencer-model-change",
                () => {
                    window.timelineSequencerUI
                        ?.scheduleRender?.();
                }
            );

            window.addEventListener(
                "sm:timeline-snap-change",
                event => {
                    this.dispatch(
                        "snap-change",
                        event.detail
                    );
                }
            );
        }

        refresh() {
            window.timelineSequencerModel
                ?.syncFromTimelineRows?.();

            window.timelineSequencerUI
                ?.scheduleRender?.();

            window.timelineMarkerRegionSystem
                ?.scheduleRender?.();
        }

        createSection({
            rowKey = this.selectedRowKey,
            name = "Section",
            type = "animation",
            start = Number(window.currentTime || 0),
            end = null
        } = {}) {
            const model =
                window.timelineSequencerModel;

            if (!model) return null;

            let track =
                rowKey
                    ? model.getTrackByRowKey(rowKey)
                    : null;

            if (!track) {
                const rows =
                    window.SMTimeline
                        ?.buildTimelineVisibleRows?.() ||
                    [];

                const row =
                    rows.find(item =>
                        item.rowKey === rowKey
                    ) ||
                    rows[0];

                if (row) {
                    track =
                        model.ensureTrackForTimelineRow(row);
                }
            }

            if (!track) return null;

            const duration =
                Math.max(
                    0.001,
                    Number(window.timelineDuration || 30)
                );

            const section =
                model.addSection(track.id, {
                    name,
                    type,
                    start,
                    end:
                        end == null
                            ? Math.min(
                                duration,
                                start +
                                Math.max(
                                    1,
                                    duration * 0.1
                                )
                            )
                            : end
                });

            if (section) {
                window.timelineSectionEditor
                    ?.select?.(section.id);
            }

            return section;
        }

        addMarker(name = null) {
            const markers =
                window.timelineMarkerRegionSystem;

            if (!markers) return null;

            return markers.addMarker({
                time:
                    Number(window.currentTime || 0),
                name:
                    name ||
                    `Marker ${markers.markers.length + 1}`
            });
        }

        addRegion(name = null) {
            const regions =
                window.timelineMarkerRegionSystem;

            if (!regions) return null;

            const time =
                Number(window.currentTime || 0);

            return regions.addRegion({
                start: time,
                end:
                    time +
                    Math.max(
                        1,
                        Number(window.timelineDuration || 30) * 0.08
                    ),
                name:
                    name ||
                    `Region ${regions.regions.length + 1}`
            });
        }

        serialize() {
            return {
                format: "SM_TIMELINE_SEQUENCER",
                version: 1,
                sequence:
                    window.timelineSequencerModel?.serialize?.() ||
                    null,
                markers:
                    window.timelineMarkerRegionSystem?.serialize?.() ||
                    null,
                snap: {
                    enabled:
                        window.timelineSnapManager?.enabled !== false,
                    targets:
                        structuredClone(
                            window.timelineSnapManager?.targets ||
                            {}
                        ),
                    thresholdPx:
                        Number(
                            window.timelineSnapManager?.thresholdPx ||
                            8
                        )
                }
            };
        }

        deserialize(data = {}) {
            if (data.sequence) {
                window.timelineSequencerModel
                    ?.deserialize?.(data.sequence);
            }

            if (data.markers) {
                window.timelineMarkerRegionSystem
                    ?.deserialize?.(data.markers);
            }

            if (data.snap) {
                const snap =
                    window.timelineSnapManager;

                if (snap) {
                    snap.enabled =
                        data.snap.enabled !== false;

                    if (data.snap.targets) {
                        Object.assign(
                            snap.targets,
                            data.snap.targets
                        );
                    }

                    snap.thresholdPx =
                        Number(
                            data.snap.thresholdPx ||
                            snap.thresholdPx
                        );
                }
            }

            this.refresh();

            return true;
        }

        dispatch(type, payload) {
            const detail = {
                type,
                payload
            };

            this.events.dispatchEvent(
                new CustomEvent(type, { detail })
            );

            window.dispatchEvent(
                new CustomEvent(
                    `sm:sequencer-${type}`,
                    { detail }
                )
            );
        }
    }

    window.TimelineSequencerSystem =
        TimelineSequencerSystem;

    window.SMSequencer =
        window.SMSequencer ||
        new TimelineSequencerSystem();

    window.timelineSequencerSystem =
        window.SMSequencer;

    const boot = () => {
        window.SMSequencer.init();
    };

    if (document.readyState === "loading") {
        document.addEventListener(
            "DOMContentLoaded",
            boot,
            { once: true }
        );
    } else {
        setTimeout(boot, 0);
    }

    window.addEventListener(
        "sm:timeline-panel-ready",
        boot
    );
})();