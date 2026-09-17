// js/timeline/sequencer/TimelineSequencerModel.js
// UE5/Blender-style sequence -> track -> section data model.

(() => {
    "use strict";

    class TimelineSequencerModel {
        constructor() {
            this.sequence = this.createSequence({
                name: "Main Sequence"
            });

            this.events = new EventTarget();
        }

        createSequence({
            id = this._id("seq"),
            name = "Sequence",
            fps = Number(window.fps || 30),
            start = 0,
            end = Number(window.timelineDuration || 30)
        } = {}) {
            return {
                format: "SM_TIMELINE_SEQUENCE",
                version: 1,
                id,
                name,
                fps,
                start,
                end,
                tracks: [],
                metadata: {}
            };
        }

        setSequence(sequence) {
            this.sequence =
                this._normalizeSequence(sequence);

            this._changed("sequence-set", this.sequence);

            return this.sequence;
        }

        getTrack(trackId) {
            return this.sequence.tracks.find(track => track.id === trackId) || null;
        }

        getTrackByRowKey(rowKey) {
            return this.sequence.tracks.find(track => track.rowKey === rowKey) || null;
        }

        getSection(sectionId) {
            for (const track of this.sequence.tracks) {
                const section =
                    track.sections.find(item => item.id === sectionId);

                if (section) {
                    return {
                        track,
                        section
                    };
                }
            }

            return null;
        }

        addTrack({
            id = this._id("track"),
            rowKey = null,
            ownerUuid = null,
            parentUuid = null,
            name = "Track",
            type = "object",
            muted = false,
            solo = false,
            locked = false,
            visible = true,
            height = 26,
            sections = [],
            metadata = {}
        } = {}) {
            const existing =
                rowKey
                    ? this.getTrackByRowKey(rowKey)
                    : null;

            if (existing) return existing;

            const track = {
                id,
                rowKey,
                ownerUuid,
                parentUuid,
                name,
                type,
                muted,
                solo,
                locked,
                visible,
                height,
                sections: sections.map(section =>
                    this._normalizeSection(section)
                ),
                metadata
            };

            this.sequence.tracks.push(track);
            this._changed("track-add", track);

            return track;
        }

        updateTrack(trackId, patch = {}) {
            const track = this.getTrack(trackId);
            if (!track) return null;

            Object.assign(track, patch);

            this._changed("track-update", track);

            return track;
        }

        removeTrack(trackId) {
            const index =
                this.sequence.tracks.findIndex(track => track.id === trackId);

            if (index < 0) return false;

            const [track] =
                this.sequence.tracks.splice(index, 1);

            this._changed("track-remove", track);

            return true;
        }

        ensureTrackForTimelineRow(row) {
            if (!row?.rowKey) return null;

            let track = this.getTrackByRowKey(row.rowKey);

            if (track) {
                track.name = row.labelName || track.name;
                track.ownerUuid = row.uuid || track.ownerUuid;
                track.parentUuid = row.parentUuid || null;
                track.type = row.isChild
                    ? "channel"
                    : row.is2DLayer
                        ? "2d"
                        : row.object?.isCamera
                            ? "camera"
                            : row.object?.isLight
                                ? "light"
                                : "object";

                return track;
            }

            track = this.addTrack({
                rowKey: row.rowKey,
                ownerUuid: row.uuid,
                parentUuid: row.parentUuid || null,
                name: row.labelName || "Track",
                type: row.isChild
                    ? "channel"
                    : row.is2DLayer
                        ? "2d"
                        : row.object?.isCamera
                            ? "camera"
                            : row.object?.isLight
                                ? "light"
                                : "object"
            });

            return track;
        }

        syncFromTimelineRows() {
            const rows =
                window.SMTimeline?.buildTimelineVisibleRows?.() ||
                [];

            const aliveRowKeys = new Set();

            rows.forEach(row => {
                aliveRowKeys.add(row.rowKey);
                this.ensureTrackForTimelineRow(row);
            });

            this.sequence.tracks.forEach(track => {
                if (track.rowKey) {
                    track.visible =
                        aliveRowKeys.has(track.rowKey);
                }
            });

            this._changed("rows-sync", rows);

            return rows;
        }

        addSection(trackId, {
            id = this._id("section"),
            name = "Section",
            type = "animation",
            start = Number(window.currentTime || 0),
            end = null,
            sourceStart = 0,
            sourceDuration = null,
            playRate = 1,
            loop = false,
            muted = false,
            locked = false,
            blendIn = 0,
            blendOut = 0,
            colorTag = "slate",
            metadata = {}
        } = {}) {
            const track = this.getTrack(trackId);
            if (!track) return null;

            const duration =
                Math.max(
                    0.001,
                    Number(window.timelineDuration || 30)
                );

            const sectionStart =
                this._clamp(start, 0, duration);

            const sectionEnd =
                this._clamp(
                    end == null
                        ? sectionStart + Math.max(1, duration * 0.1)
                        : end,
                    sectionStart + 0.001,
                    duration
                );

            const section =
                this._normalizeSection({
                    id,
                    name,
                    type,
                    start: sectionStart,
                    end: sectionEnd,
                    sourceStart,
                    sourceDuration:
                        sourceDuration == null
                            ? sectionEnd - sectionStart
                            : sourceDuration,
                    playRate,
                    loop,
                    muted,
                    locked,
                    blendIn,
                    blendOut,
                    colorTag,
                    metadata
                });

            track.sections.push(section);
            track.sections.sort((a, b) => a.start - b.start);

            this._changed("section-add", {
                track,
                section
            });

            return section;
        }

        updateSection(sectionId, patch = {}) {
            const found = this.getSection(sectionId);
            if (!found) return null;

            Object.assign(found.section, patch);

            const duration =
                Math.max(
                    0.001,
                    Number(window.timelineDuration || 30)
                );

            found.section.start =
                this._clamp(found.section.start, 0, duration);

            found.section.end =
                this._clamp(
                    found.section.end,
                    found.section.start + 0.001,
                    duration
                );

            found.track.sections.sort((a, b) => a.start - b.start);

            this._changed("section-update", found);

            return found.section;
        }

        removeSection(sectionId) {
            const found = this.getSection(sectionId);
            if (!found) return false;

            const index =
                found.track.sections.findIndex(
                    section => section.id === sectionId
                );

            const [section] =
                found.track.sections.splice(index, 1);

            this._changed("section-remove", {
                track: found.track,
                section
            });

            return true;
        }

        duplicateSection(sectionId, {
            offset = null
        } = {}) {
            const found = this.getSection(sectionId);
            if (!found) return null;

            const section = found.section;
            const length = section.end - section.start;

            const copyStart =
                offset == null
                    ? section.end
                    : section.start + offset;

            return this.addSection(found.track.id, {
                ...structuredClone(section),
                id: undefined,
                name: `${section.name} Copy`,
                start: copyStart,
                end: copyStart + length
            });
        }

        splitSection(sectionId, time) {
            const found = this.getSection(sectionId);
            if (!found) return null;

            const section = found.section;
            const splitTime = Number(time);

            if (
                !Number.isFinite(splitTime) ||
                splitTime <= section.start + 0.001 ||
                splitTime >= section.end - 0.001
            ) {
                return null;
            }

            const right =
                this.addSection(found.track.id, {
                    ...structuredClone(section),
                    id: undefined,
                    name: `${section.name} B`,
                    start: splitTime,
                    end: section.end,
                    sourceStart:
                        section.sourceStart +
                        (splitTime - section.start) *
                        section.playRate
                });

            section.end = splitTime;
            section.name = `${section.name.replace(/\s+[AB]$/, "")} A`;

            this._changed("section-split", {
                left: section,
                right,
                track: found.track
            });

            return {
                left: section,
                right
            };
        }

        serialize() {
            return structuredClone(this.sequence);
        }

        deserialize(data) {
            return this.setSequence(data);
        }

        _normalizeSequence(sequence = {}) {
            const normalized =
                this.createSequence(sequence);

            normalized.metadata =
                structuredClone(sequence.metadata || {});

            normalized.tracks =
                Array.isArray(sequence.tracks)
                    ? sequence.tracks.map(track => ({
                        ...track,
                        sections:
                            Array.isArray(track.sections)
                                ? track.sections.map(section =>
                                    this._normalizeSection(section)
                                )
                                : []
                    }))
                    : [];

            return normalized;
        }

        _normalizeSection(section = {}) {
            return {
                id: section.id || this._id("section"),
                name: section.name || "Section",
                type: section.type || "animation",
                start: Number(section.start || 0),
                end: Math.max(
                    Number(section.start || 0) + 0.001,
                    Number(section.end || 1)
                ),
                sourceStart: Number(section.sourceStart || 0),
                sourceDuration:
                    Number.isFinite(Number(section.sourceDuration))
                        ? Number(section.sourceDuration)
                        : null,
                playRate: Number(section.playRate || 1),
                loop: !!section.loop,
                muted: !!section.muted,
                locked: !!section.locked,
                blendIn: Math.max(0, Number(section.blendIn || 0)),
                blendOut: Math.max(0, Number(section.blendOut || 0)),
                colorTag: section.colorTag || "slate",
                metadata: structuredClone(section.metadata || {})
            };
        }

        _clamp(value, min, max) {
            return Math.max(min, Math.min(max, Number(value) || 0));
        }

        _id(prefix) {
            return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        }

        _changed(type, payload) {
            const detail = {
                type,
                payload,
                sequence: this.sequence
            };

            this.events.dispatchEvent(
                new CustomEvent("change", { detail })
            );

            window.dispatchEvent(
                new CustomEvent("sm:sequencer-model-change", { detail })
            );
        }
    }

    window.TimelineSequencerModel =
        TimelineSequencerModel;

    window.timelineSequencerModel =
        window.timelineSequencerModel ||
        new TimelineSequencerModel();
})();