// js/timeline/sequencer/TimelineTrackStateManager.js
// Mute / Solo / Lock / Visibility + track state logic.

(() => {
    "use strict";

    class TimelineTrackStateManager {
        constructor() {
            this.events = new EventTarget();
        }

        setMuted(trackId, muted) {
            return this._patch(
                trackId,
                { muted: !!muted },
                "mute"
            );
        }

        setSolo(trackId, solo) {
            return this._patch(
                trackId,
                { solo: !!solo },
                "solo"
            );
        }

        setLocked(trackId, locked) {
            return this._patch(
                trackId,
                { locked: !!locked },
                "lock"
            );
        }

        setVisible(trackId, visible) {
            return this._patch(
                trackId,
                { visible: !!visible },
                "visible"
            );
        }

        toggle(trackId, property) {
            const track =
                window.timelineSequencerModel?.getTrack(trackId);

            if (!track || !(property in track)) return false;

            return !!this._patch(
                trackId,
                {
                    [property]:
                        !track[property]
                },
                property
            );
        }

        isTrackAudible(track) {
            if (!track || track.muted) return false;

            const tracks =
                window.timelineSequencerModel?.sequence?.tracks ||
                [];

            const hasSolo =
                tracks.some(item => item.solo);

            if (hasSolo && !track.solo) return false;

            return true;
        }

        getEffectiveStates() {
            const tracks =
                window.timelineSequencerModel?.sequence?.tracks ||
                [];

            return tracks.map(track => ({
                id: track.id,
                rowKey: track.rowKey,
                audible: this.isTrackAudible(track),
                locked: !!track.locked,
                visible: track.visible !== false
            }));
        }

        _patch(trackId, patch, reason) {
            const model =
                window.timelineSequencerModel;

            const track =
                model?.updateTrack(trackId, patch);

            if (!track) return null;

            const detail = {
                reason,
                track
            };

            this.events.dispatchEvent(
                new CustomEvent("change", { detail })
            );

            window.dispatchEvent(
                new CustomEvent("sm:sequencer-track-state-change", { detail })
            );

            return track;
        }
    }

    window.TimelineTrackStateManager =
        TimelineTrackStateManager;

    window.timelineTrackStateManager =
        window.timelineTrackStateManager ||
        new TimelineTrackStateManager();
})();