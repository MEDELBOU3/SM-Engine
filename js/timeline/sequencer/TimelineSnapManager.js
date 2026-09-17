// js/timeline/sequencer/TimelineSnapManager.js
// Frame/key/playhead/marker/section snapping for timeline edits.

(() => {
    "use strict";

    class TimelineSnapManager {
        constructor() {
            this.enabled = true;
            this.thresholdPx = 8;

            this.targets = {
                frames: true,
                playhead: true,
                keys: true,
                markers: true,
                sectionEdges: true
            };

            this.events = new EventTarget();
        }

        setEnabled(enabled) {
            this.enabled = !!enabled;
            this._emit();
        }

        setTarget(name, enabled) {
            if (!(name in this.targets)) return false;

            this.targets[name] = !!enabled;
            this._emit();

            return true;
        }

        toggle() {
            this.setEnabled(!this.enabled);
            return this.enabled;
        }

        getFps() {
            return Math.max(1, Number(window.fps || 30));
        }

        getDuration() {
            return Math.max(
                0.001,
                Number(window.timelineDuration || 30)
            );
        }

        pixelsPerSecond() {
            const content = document.getElementById("timeline-content");
            const container = document.getElementById("keyframes-container");

            const width = Math.max(
                Number(container?.scrollWidth || container?.offsetWidth || 0),
                Number(content?.scrollWidth || content?.clientWidth || 900),
                1
            );

            return width / this.getDuration();
        }

        collectCandidates({
            excludeSectionId = null
        } = {}) {
            const candidates = [];

            if (this.targets.playhead) {
                candidates.push({
                    type: "playhead",
                    time: Number(window.currentTime || 0),
                    priority: 5
                });
            }

            if (this.targets.keys) {
                const addKeyMap = map => {
                    if (!(map instanceof Map)) return;

                    map.forEach(value => {
                        if (!value) return;

                        if (value instanceof Map) {
                            value.forEach(inner => this._collectKeyObject(inner, candidates));
                            return;
                        }

                        this._collectKeyObject(value, candidates);
                    });
                };

                addKeyMap(window.keyframes);
                addKeyMap(window.boneKeyframes);
            }

            if (this.targets.markers) {
                const markers =
                    window.timelineMarkerRegionSystem?.markers ||
                    [];

                markers.forEach(marker => {
                    candidates.push({
                        type: "marker",
                        time: Number(marker.time) || 0,
                        id: marker.id,
                        priority: 4
                    });
                });

                const regions =
                    window.timelineMarkerRegionSystem?.regions ||
                    [];

                regions.forEach(region => {
                    candidates.push({
                        type: "region-start",
                        time: Number(region.start) || 0,
                        id: region.id,
                        priority: 4
                    });

                    candidates.push({
                        type: "region-end",
                        time: Number(region.end) || 0,
                        id: region.id,
                        priority: 4
                    });
                });
            }

            if (this.targets.sectionEdges) {
                const tracks =
                    window.timelineSequencerModel?.sequence?.tracks ||
                    [];

                tracks.forEach(track => {
                    track.sections.forEach(section => {
                        if (section.id === excludeSectionId) return;

                        candidates.push({
                            type: "section-start",
                            time: Number(section.start) || 0,
                            id: section.id,
                            priority: 3
                        });

                        candidates.push({
                            type: "section-end",
                            time: Number(section.end) || 0,
                            id: section.id,
                            priority: 3
                        });
                    });
                });
            }

            return candidates;
        }

        snapTime(time, {
            excludeSectionId = null,
            pixelsPerSecond = this.pixelsPerSecond()
        } = {}) {
            const duration = this.getDuration();
            const original = Math.max(
                0,
                Math.min(duration, Number(time) || 0)
            );

            if (!this.enabled) {
                return {
                    time: original,
                    snapped: false,
                    type: null,
                    targetTime: null
                };
            }

            let best = null;
            const thresholdSeconds =
                this.thresholdPx /
                Math.max(1, Number(pixelsPerSecond) || 1);

            if (this.targets.frames) {
                const fps = this.getFps();
                const frameTime =
                    Math.round(original * fps) / fps;

                best = {
                    type: "frame",
                    time: frameTime,
                    distance: Math.abs(frameTime - original),
                    priority: 1
                };
            }

            const candidates =
                this.collectCandidates({ excludeSectionId });

            for (const candidate of candidates) {
                const distance =
                    Math.abs(candidate.time - original);

                if (distance > thresholdSeconds) continue;

                if (
                    !best ||
                    distance < best.distance - 0.000001 ||
                    (
                        Math.abs(distance - best.distance) < 0.000001 &&
                        (candidate.priority || 0) > (best.priority || 0)
                    )
                ) {
                    best = {
                        ...candidate,
                        distance
                    };
                }
            }

            if (!best) {
                return {
                    time: original,
                    snapped: false,
                    type: null,
                    targetTime: null
                };
            }

            return {
                time: Math.max(0, Math.min(duration, best.time)),
                snapped: true,
                type: best.type,
                targetTime: best.time,
                distance: best.distance
            };
        }

        _collectKeyObject(value, candidates) {
            if (!value) return;

            if (value instanceof Map) {
                value.forEach(inner => this._collectKeyObject(inner, candidates));
                return;
            }

            if (Array.isArray(value)) {
                value.forEach(inner => this._collectKeyObject(inner, candidates));
                return;
            }

            if (typeof value !== "object") return;

            Object.entries(value).forEach(([frameKey, key]) => {
                const fps = this.getFps();

                const time =
                    Number(key?.time);

                if (Number.isFinite(time)) {
                    candidates.push({
                        type: "key",
                        time,
                        priority: 2
                    });
                    return;
                }

                const frame = Number(frameKey);

                if (Number.isFinite(frame)) {
                    candidates.push({
                        type: "key",
                        time: frame / fps,
                        priority: 2
                    });
                }
            });
        }

        _emit() {
            const detail = {
                enabled: this.enabled,
                targets: { ...this.targets },
                thresholdPx: this.thresholdPx
            };

            this.events.dispatchEvent(
                new CustomEvent("change", { detail })
            );

            window.dispatchEvent(
                new CustomEvent("sm:timeline-snap-change", { detail })
            );
        }
    }

    window.TimelineSnapManager = TimelineSnapManager;
    window.timelineSnapManager =
        window.timelineSnapManager ||
        new TimelineSnapManager();
})();