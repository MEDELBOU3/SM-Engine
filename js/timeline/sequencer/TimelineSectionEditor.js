// js/timeline/sequencer/TimelineSectionEditor.js
// Move / trim / split / duplicate / delete / loop sections.

(() => {
    "use strict";

    class TimelineSectionEditor {
        constructor() {
            this.selected = new Set();
            this.activeSectionId = null;
            this.drag = null;
            this.events = new EventTarget();

            this._bound = false;
        }

        init() {
            if (this._bound) return;

            this._bound = true;

            document.addEventListener(
                "pointerdown",
                event => this._onPointerDown(event),
                true
            );

            document.addEventListener(
                "keydown",
                event => this._onKeyDown(event)
            );
        }

        clearSelection() {
            this.selected.clear();
            this.activeSectionId = null;
            this._refreshSelectionUI();
        }

        select(sectionId, {
            additive = false,
            toggle = false
        } = {}) {
            if (!additive && !toggle) {
                this.selected.clear();
            }

            if (toggle && this.selected.has(sectionId)) {
                this.selected.delete(sectionId);
            } else {
                this.selected.add(sectionId);
                this.activeSectionId = sectionId;
            }

            this._refreshSelectionUI();
            this._emit("selection");
        }

        deleteSelected() {
            if (!this.selected.size) return false;

            const model = window.timelineSequencerModel;
            const history = window.timelineHistoryManager;

            if (!model) return false;

            const snapshots = [];

            this.selected.forEach(sectionId => {
                const found = model.getSection(sectionId);
                if (!found) return;

                snapshots.push({
                    trackId: found.track.id,
                    section: structuredClone(found.section)
                });
            });

            const remove = () => {
                snapshots.forEach(item => {
                    model.removeSection(item.section.id);
                });

                this.clearSelection();
            };

            const restore = () => {
                snapshots.forEach(item => {
                    const track = model.getTrack(item.trackId);
                    if (!track) return;

                    track.sections.push(
                        structuredClone(item.section)
                    );

                    track.sections.sort((a, b) => a.start - b.start);
                });

                model._changed?.("section-restore", snapshots);
            };

            remove();

            history?.push({
                label: `Delete ${snapshots.length} Section${snapshots.length === 1 ? "" : "s"}`,
                undo: restore,
                redo: remove
            });

            return true;
        }

        duplicateSelected() {
            const model = window.timelineSequencerModel;
            if (!model || !this.selected.size) return [];

            const created = [];

            [...this.selected].forEach(sectionId => {
                const copy =
                    model.duplicateSection(sectionId);

                if (copy) created.push(copy.id);
            });

            this.selected =
                new Set(created);

            this.activeSectionId =
                created.at(-1) || null;

            this._refreshSelectionUI();

            return created;
        }

        splitSelectedAtPlayhead() {
            const model = window.timelineSequencerModel;
            if (!model || !this.selected.size) return [];

            const time =
                Number(window.currentTime || 0);

            const created = [];

            [...this.selected].forEach(sectionId => {
                const result =
                    model.splitSection(sectionId, time);

                if (result?.right) {
                    created.push(result.right.id);
                }
            });

            return created;
        }

        toggleLoopSelected() {
            const model = window.timelineSequencerModel;
            if (!model) return;

            this.selected.forEach(sectionId => {
                const found = model.getSection(sectionId);
                if (!found) return;

                model.updateSection(
                    sectionId,
                    { loop: !found.section.loop }
                );
            });
        }

        _onPointerDown(event) {
            const sectionEl =
                event.target.closest(".sm-sequencer-section");

            if (!sectionEl) return;

            const sectionId =
                sectionEl.dataset.sectionId;

            const found =
                window.timelineSequencerModel?.getSection(sectionId);

            if (!found || found.section.locked || found.track.locked) {
                return;
            }

            event.preventDefault();
            event.stopPropagation();

            this.select(sectionId, {
                additive:
                    event.shiftKey ||
                    event.ctrlKey ||
                    event.metaKey,
                toggle:
                    event.ctrlKey ||
                    event.metaKey
            });

            const mode =
                event.target.closest(".sm-section-trim-start")
                    ? "trim-start"
                    : event.target.closest(".sm-section-trim-end")
                        ? "trim-end"
                        : event.altKey
                            ? "slip"
                            : "move";

            const initial =
                structuredClone(found.section);

            this.drag = {
                pointerId: event.pointerId,
                mode,
                sectionId,
                trackId: found.track.id,
                startClientX: event.clientX,
                initial,
                latest: structuredClone(initial)
            };

            sectionEl.setPointerCapture?.(event.pointerId);

            const move = moveEvent =>
                this._onPointerMove(moveEvent);

            const up = upEvent => {
                window.removeEventListener("pointermove", move);
                window.removeEventListener("pointerup", up);

                sectionEl.releasePointerCapture?.(upEvent.pointerId);

                this._finishDrag();
            };

            window.addEventListener("pointermove", move);
            window.addEventListener("pointerup", up);
        }

        _onPointerMove(event) {
            if (!this.drag) return;

            const model = window.timelineSequencerModel;
            const snap = window.timelineSnapManager;
            const found = model?.getSection(this.drag.sectionId);

            if (!found) return;

            const pps =
                snap?.pixelsPerSecond?.() ||
                this._pixelsPerSecond();

            const deltaTime =
                (event.clientX - this.drag.startClientX) /
                Math.max(1, pps);

            const initial = this.drag.initial;
            const length =
                initial.end - initial.start;

            let patch = {};

            if (this.drag.mode === "move") {
                let start =
                    initial.start + deltaTime;

                start = snap
                    ? snap.snapTime(start, {
                        excludeSectionId: found.section.id,
                        pixelsPerSecond: pps
                    }).time
                    : start;

                const duration =
                    Math.max(
                        0.001,
                        Number(window.timelineDuration || 30)
                    );

                start = Math.max(
                    0,
                    Math.min(duration - length, start)
                );

                patch = {
                    start,
                    end: start + length
                };
            }

            if (this.drag.mode === "trim-start") {
                let start =
                    initial.start + deltaTime;

                start = snap
                    ? snap.snapTime(start, {
                        excludeSectionId: found.section.id,
                        pixelsPerSecond: pps
                    }).time
                    : start;

                start = Math.max(
                    0,
                    Math.min(initial.end - 0.001, start)
                );

                patch = {
                    start,
                    sourceStart:
                        initial.sourceStart +
                        (start - initial.start) *
                        initial.playRate
                };
            }

            if (this.drag.mode === "trim-end") {
                let end =
                    initial.end + deltaTime;

                end = snap
                    ? snap.snapTime(end, {
                        excludeSectionId: found.section.id,
                        pixelsPerSecond: pps
                    }).time
                    : end;

                end = Math.max(
                    initial.start + 0.001,
                    Math.min(
                        Number(window.timelineDuration || 30),
                        end
                    )
                );

                patch = { end };
            }

            if (this.drag.mode === "slip") {
                patch = {
                    sourceStart:
                        Math.max(
                            0,
                            initial.sourceStart +
                            deltaTime *
                            initial.playRate
                        )
                };
            }

            model.updateSection(
                found.section.id,
                patch
            );

            this.drag.latest =
                structuredClone(found.section);
        }

        _finishDrag() {
            if (!this.drag) return;

            const model = window.timelineSequencerModel;
            const history = window.timelineHistoryManager;

            const {
                sectionId,
                initial,
                latest,
                mode
            } = this.drag;

            this.drag = null;

            if (
                JSON.stringify(initial) ===
                JSON.stringify(latest)
            ) {
                return;
            }

            history?.push({
                label:
                    mode === "move"
                        ? "Move Section"
                        : mode === "trim-start" || mode === "trim-end"
                            ? "Trim Section"
                            : "Slip Section",
                undo: () => {
                    model?.updateSection(
                        sectionId,
                        structuredClone(initial)
                    );
                },
                redo: () => {
                    model?.updateSection(
                        sectionId,
                        structuredClone(latest)
                    );
                }
            });
        }

        _onKeyDown(event) {
            const root =
                document.getElementById("timelineBody");

            if (!root) return;

            const active =
                document.activeElement;

            const typing =
                active &&
                /INPUT|TEXTAREA|SELECT/.test(active.tagName);

            if (typing) return;

            const timelineFocused =
                root.matches(":hover") ||
                root.contains(active);

            if (!timelineFocused) return;

            const ctrl =
                event.ctrlKey ||
                event.metaKey;

            if (ctrl && event.key.toLowerCase() === "z") {
                event.preventDefault();

                if (event.shiftKey) {
                    window.timelineHistoryManager?.redo();
                } else {
                    window.timelineHistoryManager?.undo();
                }

                return;
            }

            if (ctrl && event.key.toLowerCase() === "d") {
                event.preventDefault();
                this.duplicateSelected();
                return;
            }

            if (event.key === "Delete" || event.key === "Backspace") {
                event.preventDefault();
                this.deleteSelected();
                return;
            }

            if (event.key.toLowerCase() === "s") {
                if (event.shiftKey) {
                    event.preventDefault();
                    this.splitSelectedAtPlayhead();
                }
            }

            if (event.key.toLowerCase() === "l") {
                event.preventDefault();
                this.toggleLoopSelected();
            }
        }

        _pixelsPerSecond() {
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
                    Number(container?.scrollWidth || 0),
                    Number(content?.scrollWidth || content?.clientWidth || 900),
                    1
                );

            return width / duration;
        }

        _refreshSelectionUI() {
            document
                .querySelectorAll(".sm-sequencer-section")
                .forEach(el => {
                    el.classList.toggle(
                        "selected",
                        this.selected.has(
                            el.dataset.sectionId
                        )
                    );
                });
        }

        _emit(type) {
            const detail = {
                type,
                selected: [...this.selected],
                activeSectionId: this.activeSectionId
            };

            this.events.dispatchEvent(
                new CustomEvent("change", { detail })
            );

            window.dispatchEvent(
                new CustomEvent("sm:sequencer-selection-change", { detail })
            );
        }
    }

    window.TimelineSectionEditor =
        TimelineSectionEditor;

    window.timelineSectionEditor =
        window.timelineSectionEditor ||
        new TimelineSectionEditor();
})();