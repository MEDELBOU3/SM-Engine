// js/timeline/integration/TimelineSequencerAudioAdapter.js
// Adapts Sequencer audio Sections to the existing TimelineEventsAudio engine.
//
// Reuses:
// - TimelineEventsAudio.initAudioContext()
// - TimelineEventsAudio.loadAudioTrack()
// - TimelineEventsAudio.playAudioFrom()
// - TimelineEventsAudio.stopAudio()
//
// v1 supports one audible Sequencer audio section at a time because the
// existing TimelineEventsAudio engine owns one AudioBufferSourceNode.

(() => {
    "use strict";

    class TimelineSequencerAudioAdapter {
        constructor() {
            this.initialized = false;

            this.assets = new Map();

            this.activeSectionId = null;
            this.activeAssetId = null;

            this.startedAtContextTime = 0;
            this.startedAtSourceTime = 0;
            this.lastIsPlaying = false;

            this._watchRaf = 0;

            this.events = new EventTarget();
        }

        init() {
            if (this.initialized) return true;

            this.initialized = true;

            window.addEventListener(
                "timeUpdate",
                event => {
                    const time =
                        Number(
                            event.detail?.time ??
                            window.currentTime ??
                            0
                        );

                    this.syncAtTime(time);
                }
            );

            window.addEventListener(
                "sm:sequencer-model-change",
                () => {
                    this.syncAtTime(
                        Number(
                            window.currentTime ||
                            0
                        )
                    );
                }
            );

            this.startPlaybackWatcher();

            console.log("✅ Timeline Sequencer Audio Adapter ready");

            return true;
        }

        async registerAudioAsset(
            fileOrUrl,
            {
                id = null,
                name = null,
                assetRef = null
            } = {}
        ) {
            const engine =
                window.TimelineEventsAudio;

            if (!engine) {
                throw new Error(
                    "TimelineEventsAudio is not loaded."
                );
            }

            await engine.loadAudioTrack(
                fileOrUrl
            );

            const buffer =
                engine.audioBuffer;

            if (!buffer) {
                throw new Error(
                    "Audio decode produced no buffer."
                );
            }

            const assetId =
                id ||
                `audio_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

            const sourceKind =
                typeof fileOrUrl ===
                "string"
                    ? "url"
                    : "volatile-file";

            const descriptor = {
                id: assetId,
                name:
                    name ||
                    (
                        typeof fileOrUrl ===
                        "string"
                            ? fileOrUrl
                                .split("/")
                                .pop()
                            : fileOrUrl
                                ?.name
                    ) ||
                    "Audio",
                buffer,
                duration:
                    Number(
                        buffer.duration
                    ) || 0,
                sourceKind,
                source:
                    typeof fileOrUrl ===
                    "string"
                        ? fileOrUrl
                        : null,
                assetRef:
                    assetRef ||
                    null
            };

            this.assets.set(
                assetId,
                descriptor
            );

            this.emit(
                "asset-register",
                descriptor
            );

            return descriptor;
        }

        getTrack(trackId) {
            return (
                window.timelineSequencerModel
                    ?.getTrack?.(
                        trackId
                    ) ||
                null
            );
        }

        createAudioSection(
            trackId,
            assetId,
            {
                start = Number(window.currentTime || 0),
                sourceStart = 0,
                playRate = 1,
                loop = false,
                name = null
            } = {}
        ) {
            const asset =
                this.assets.get(
                    assetId
                );

            if (!asset) {
                console.warn(
                    "[SequencerAudio] Unknown asset:",
                    assetId
                );

                return null;
            }

            const model =
                window.timelineSequencerModel;

            const track =
                model?.getTrack(
                    trackId
                );

            if (!track) return null;

            track.type = "audio";

            const rate =
                Math.max(
                    0.001,
                    Math.abs(
                        Number(playRate) ||
                        1
                    )
                );

            const usableSource =
                Math.max(
                    0.001,
                    asset.duration -
                        Math.max(
                            0,
                            sourceStart
                        )
                );

            const timelineLength =
                usableSource /
                rate;

            if (
                Number(window.timelineDuration || 0) <
                start + timelineLength
            ) {
                window.timelineDuration =
                    start +
                    timelineLength;

                window.setTimelineDuration?.(
                    window.timelineDuration
                );
            }

            return model.addSection(
                track.id,
                {
                    name:
                        name ||
                        asset.name,
                    type:
                        "audio",
                    start,
                    end:
                        start +
                        timelineLength,
                    sourceStart:
                        Math.max(
                            0,
                            sourceStart
                        ),
                    sourceDuration:
                        usableSource,
                    playRate:
                        rate,
                    loop,
                    metadata: {
                        sourceKind:
                            "audio",
                        audioAssetId:
                            assetId,
                        audioName:
                            asset.name,
                        audioDuration:
                            asset.duration,
                        assetRef:
                            asset.assetRef,
                        source:
                            asset.source
                    }
                }
            );
        }

        getAudioSections() {
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
                                "audio" ||
                            section.metadata
                                ?.sourceKind ===
                                "audio"
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

        getActiveAudio(
            timelineTime
        ) {
            return (
                this.getAudioSections()
                    .filter(
                        item => {
                            if (
                                item.track
                                    .muted ||
                                item.section
                                    .muted
                            ) {
                                return false;
                            }

                            return (
                                timelineTime >=
                                    item.section
                                        .start &&
                                timelineTime <=
                                    item.section
                                        .end
                            );
                        }
                    )
                    .sort(
                        (a, b) =>
                            a.section.start -
                            b.section.start
                    )
                    .at(-1) ||
                null
            );
        }

        sectionLocalTime(
            section,
            timelineTime
        ) {
            const sourceStart =
                Math.max(
                    0,
                    Number(
                        section.sourceStart
                    ) || 0
                );

            const rate =
                Math.max(
                    0.001,
                    Math.abs(
                        Number(
                            section.playRate
                        ) || 1
                    )
                );

            const sourceDuration =
                Math.max(
                    0.001,
                    Number(
                        section.sourceDuration ||
                        section.metadata
                            ?.audioDuration ||
                        section.end -
                            section.start
                    )
                );

            let local =
                sourceStart +
                Math.max(
                    0,
                    timelineTime -
                        section.start
                ) *
                    rate;

            if (section.loop) {
                local =
                    sourceStart +
                    (
                        Math.max(
                            0,
                            local -
                                sourceStart
                        ) %
                        sourceDuration
                    );
            } else {
                local =
                    Math.min(
                        sourceStart +
                            sourceDuration,
                        local
                    );
            }

            return local;
        }

        async ensureAssetForSection(
            section
        ) {
            const assetId =
                section.metadata
                    ?.audioAssetId;

            if (
                assetId &&
                this.assets.has(
                    assetId
                )
            ) {
                return this.assets.get(
                    assetId
                );
            }

            const source =
                section.metadata
                    ?.source;

            if (!source) {
                return null;
            }

            try {
                return await this
                    .registerAudioAsset(
                        source,
                        {
                            id:
                                assetId ||
                                undefined,
                            name:
                                section.metadata
                                    ?.audioName ||
                                section.name,
                            assetRef:
                                section.metadata
                                    ?.assetRef ||
                                null
                        }
                    );
            } catch (error) {
                console.warn(
                    "[SequencerAudio] Unable to restore source:",
                    error
                );

                return null;
            }
        }

        async startSection(
            item,
            timelineTime
        ) {
            const engine =
                window.TimelineEventsAudio;

            if (!engine) return false;

            const asset =
                await this
                    .ensureAssetForSection(
                        item.section
                    );

            if (!asset?.buffer) {
                return false;
            }

            engine.initAudioContext?.();
            engine.stopAudio?.();

            engine.audioBuffer =
                asset.buffer;

            const local =
                this.sectionLocalTime(
                    item.section,
                    timelineTime
                );

            engine.playAudioFrom(
                local
            );

            if (
                engine.audioSource
                    ?.playbackRate
            ) {
                engine.audioSource
                    .playbackRate
                    .value =
                    Math.max(
                        0.001,
                        Number(
                            item.section
                                .playRate
                        ) || 1
                    );
            }

            this.activeSectionId =
                item.section.id;

            this.activeAssetId =
                asset.id;

            this.startedAtContextTime =
                Number(
                    engine.audioCtx
                        ?.currentTime ||
                    0
                );

            this.startedAtSourceTime =
                local;

            this.emit(
                "section-start",
                {
                    track:
                        item.track,
                    section:
                        item.section,
                    asset,
                    localTime:
                        local
                }
            );

            return true;
        }

        stop() {
            window.TimelineEventsAudio
                ?.stopAudio?.();

            if (
                this.activeSectionId
            ) {
                this.emit(
                    "section-stop",
                    {
                        sectionId:
                            this
                                .activeSectionId
                    }
                );
            }

            this.activeSectionId =
                null;

            this.activeAssetId =
                null;
        }

        async syncAtTime(
            timelineTime
        ) {
            const item =
                this.getActiveAudio(
                    timelineTime
                );

            if (!window.isPlaying) {
                if (
                    window
                        .TimelineEventsAudio
                        ?.isAudioPlaying
                ) {
                    this.stop();
                }

                return;
            }

            if (!item) {
                this.stop();
                return;
            }

            if (
                item.section.id !==
                this.activeSectionId
            ) {
                await this.startSection(
                    item,
                    timelineTime
                );

                return;
            }

            const engine =
                window.TimelineEventsAudio;

            if (
                !engine?.isAudioPlaying
            ) {
                await this.startSection(
                    item,
                    timelineTime
                );

                return;
            }

            /*
             * Periodic drift correction. Do NOT restart audio every frame.
             */
            const ctxTime =
                Number(
                    engine.audioCtx
                        ?.currentTime ||
                    0
                );

            const elapsed =
                Math.max(
                    0,
                    ctxTime -
                        this
                            .startedAtContextTime
                );

            const rate =
                Math.max(
                    0.001,
                    Number(
                        item.section
                            .playRate
                    ) || 1
                );

            const actual =
                this
                    .startedAtSourceTime +
                elapsed * rate;

            const expected =
                this.sectionLocalTime(
                    item.section,
                    timelineTime
                );

            if (
                Math.abs(
                    actual -
                    expected
                ) > 0.18
            ) {
                await this.startSection(
                    item,
                    timelineTime
                );
            }
        }

        startPlaybackWatcher() {
            if (this._watchRaf) return;

            const tick = () => {
                this._watchRaf =
                    requestAnimationFrame(
                        tick
                    );

                const playing =
                    !!window.isPlaying;

                if (
                    playing !==
                    this.lastIsPlaying
                ) {
                    this.lastIsPlaying =
                        playing;

                    if (!playing) {
                        this.stop();
                    } else {
                        this.syncAtTime(
                            Number(
                                window.currentTime ||
                                0
                            )
                        );
                    }
                }
            };

            this._watchRaf =
                requestAnimationFrame(
                    tick
                );
        }

        serializeAssets() {
            return [...this.assets.values()]
                .map(asset => ({
                    id:
                        asset.id,
                    name:
                        asset.name,
                    duration:
                        asset.duration,
                    sourceKind:
                        asset.sourceKind,
                    source:
                        asset.source,
                    assetRef:
                        asset.assetRef
                }));
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
                    `sm:timeline-audio-${type}`,
                    { detail }
                )
            );
        }
    }

    window.TimelineSequencerAudioAdapter =
        TimelineSequencerAudioAdapter;

    window.timelineSequencerAudioAdapter =
        window.timelineSequencerAudioAdapter ||
        new TimelineSequencerAudioAdapter();

    const boot = () => {
        window.timelineSequencerAudioAdapter
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