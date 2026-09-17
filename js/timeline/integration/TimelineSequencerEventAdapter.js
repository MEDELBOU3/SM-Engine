// js/timeline/integration/TimelineSequencerEventAdapter.js
// Bridges Sequencer Event sections to TimelineEventsAudio frame notifications.
//
// Reuses TimelineEventsAudio.addEventNotify() and checkFrameEvents().
// Event definitions stay serializable in Sequencer section metadata.

(() => {
    "use strict";

    class TimelineSequencerEventAdapter {
        constructor() {
            this.initialized = false;

            this.registeredEventIds =
                new Set();

            this._rebuildTimer = 0;

            this.events =
                new EventTarget();
        }

        init() {
            if (this.initialized) return true;

            this.initialized = true;

            window.addEventListener(
                "sm:sequencer-model-change",
                () => this.scheduleRebuild()
            );

            window.addEventListener(
                "sm:sequencer-ready",
                () => this.scheduleRebuild()
            );

            this.scheduleRebuild();

            console.log("✅ Timeline Sequencer Event Adapter ready");

            return true;
        }

        getFps() {
            return Math.max(
                1,
                Number(
                    window.fps ||
                    30
                )
            );
        }

        createEvent(
            trackId,
            {
                time = Number(window.currentTime || 0),
                name = "Event",
                payload = {},
                eventType = "custom"
            } = {}
        ) {
            const model =
                window.timelineSequencerModel;

            const track =
                model?.getTrack(
                    trackId
                );

            if (!track) return null;

            track.type = "event";

            const frameDuration =
                1 / this.getFps();

            return model.addSection(
                track.id,
                {
                    name,
                    type:
                        "event",
                    start:
                        Math.max(
                            0,
                            time
                        ),
                    end:
                        Math.max(
                            0,
                            time
                        ) +
                        frameDuration,
                    sourceStart: 0,
                    sourceDuration:
                        frameDuration,
                    playRate: 1,
                    loop: false,
                    metadata: {
                        sourceKind:
                            "event",
                        eventName:
                            name,
                        eventType,
                        payload:
                            structuredClone(
                                payload
                            )
                    }
                }
            );
        }

        getEventSections() {
            const tracks =
                window.timelineSequencerModel
                    ?.sequence
                    ?.tracks ||
                [];

            const result = [];

            tracks.forEach(track => {
                track.sections.forEach(
                    section => {
                        if (
                            section.type ===
                                "event" ||
                            section.metadata
                                ?.sourceKind ===
                                "event"
                        ) {
                            result.push({
                                track,
                                section
                            });
                        }
                    }
                );
            });

            return result;
        }

        scheduleRebuild() {
            clearTimeout(
                this._rebuildTimer
            );

            this._rebuildTimer =
                setTimeout(
                    () => this.rebuild(),
                    40
                );
        }

        clearRegisteredNotifications() {
            const engine =
                window.TimelineEventsAudio;

            const map =
                engine?.eventsMap;

            if (!(map instanceof Map)) {
                return;
            }

            map.forEach(
                (events, frame) => {
                    if (
                        !Array.isArray(events)
                    ) {
                        return;
                    }

                    const filtered =
                        events.filter(
                            event =>
                                !event
                                    ?.action
                                    ?.__smSequencerEvent
                        );

                    if (filtered.length) {
                        map.set(
                            frame,
                            filtered
                        );
                    } else {
                        map.delete(frame);
                    }
                }
            );

            this.registeredEventIds
                .clear();
        }

        rebuild() {
            const engine =
                window.TimelineEventsAudio;

            if (
                !engine?.addEventNotify
            ) {
                return false;
            }

            this.clearRegisteredNotifications();

            const fps =
                this.getFps();

            this.getEventSections()
                .forEach(
                    ({
                        track,
                        section
                    }) => {
                        if (
                            track.muted ||
                            section.muted
                        ) {
                            return;
                        }

                        const frame =
                            Math.max(
                                0,
                                Math.round(
                                    section.start *
                                    fps
                                )
                            );

                        const eventId =
                            section.id;

                        const eventName =
                            section.metadata
                                ?.eventName ||
                            section.name ||
                            "Event";

                        const cleanPayload =
                            structuredClone(
                                section.metadata
                                    ?.payload ||
                                {}
                            );

                        const callback =
                            currentFrame => {
                                const detail = {
                                    id:
                                        eventId,
                                    name:
                                        eventName,
                                    type:
                                        section
                                            .metadata
                                            ?.eventType ||
                                        "custom",
                                    frame:
                                        currentFrame,
                                    time:
                                        currentFrame /
                                        fps,
                                    payload:
                                        cleanPayload,
                                    trackId:
                                        track.id,
                                    sectionId:
                                        section.id
                                };

                                window.dispatchEvent(
                                    new CustomEvent(
                                        "sm:sequencer-event-trigger",
                                        { detail }
                                    )
                                );

                                this.events
                                    .dispatchEvent(
                                        new CustomEvent(
                                            "trigger",
                                            { detail }
                                        )
                                    );
                            };

                        callback.__smSequencerEvent =
                            true;

                        callback.__smSequencerEventId =
                            eventId;

                        /*
                         * Reuse the existing frame notify engine.
                         */
                        engine.addEventNotify(
                            frame,
                            eventName,
                            callback
                        );

                        this.registeredEventIds
                            .add(
                                eventId
                            );
                    }
                );

            this.emit(
                "rebuild",
                {
                    count:
                        this
                            .registeredEventIds
                            .size
                }
            );

            return true;
        }

        serializeEvents() {
            return this.getEventSections()
                .map(
                    ({
                        track,
                        section
                    }) => ({
                        trackId:
                            track.id,
                        sectionId:
                            section.id,
                        time:
                            section.start,
                        name:
                            section
                                .metadata
                                ?.eventName ||
                            section.name,
                        eventType:
                            section
                                .metadata
                                ?.eventType ||
                            "custom",
                        payload:
                            structuredClone(
                                section
                                    .metadata
                                    ?.payload ||
                                {}
                            )
                    })
                );
        }

        emit(type, payload) {
            const detail = {
                type,
                payload
            };

            this.events.dispatchEvent(
                new CustomEvent(
                    type,
                    { detail }
                )
            );

            window.dispatchEvent(
                new CustomEvent(
                    `sm:timeline-events-${type}`,
                    { detail }
                )
            );
        }
    }

    window.TimelineSequencerEventAdapter =
        TimelineSequencerEventAdapter;

    window.timelineSequencerEventAdapter =
        window.timelineSequencerEventAdapter ||
        new TimelineSequencerEventAdapter();

    const boot = () => {
        window.timelineSequencerEventAdapter
            ?.init?.();
    };

    if (
        document.readyState ===
        "loading"
    ) {
        document.addEventListener(
            "DOMContentLoaded",
            () => setTimeout(boot, 0),
            { once: true }
        );
    } else {
        setTimeout(boot, 0);
    }

    window.addEventListener(
        "sm:sequencer-ready",
        boot
    );
})();