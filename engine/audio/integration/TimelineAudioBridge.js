// engine/audio/integration/TimelineAudioBridge.js
// Routes Sequencer audio sections through SMAudioSystem.
//
// This supersedes the old single-source TimelineEventsAudio playback path for
// Sequencer audio sections while keeping TimelineEventsAudio available for
// legacy waveform / event-notify workflows.
//
// Supports multiple overlapping audio sections because SMAudioSystem owns
// multiple independent THREE.Audio / THREE.PositionalAudio sources.

(() => {
    "use strict";

    class TimelineAudioBridge {
        constructor() {
            this.initialized = false;

            this.sectionSources =
                new Map();

            this.pendingSections =
                new Map();

            this.lastPlaying =
                !!window.isPlaying;

            this._watchRaf = 0;

            this.events =
                new EventTarget();
        }

        init() {
            if (this.initialized) return true;

            if (
                !window.smAudioSystem ||
                !window.timelineSequencerModel
            ) {
                return false;
            }

            this.initialized = true;

            this.migrateLegacyAssets();

            window.addEventListener(
                "timeUpdate",
                event => {
                    const time =
                        Number(
                            event.detail?.time ??
                            window.currentTime ??
                            0
                        );

                    this.syncAtTime(
                        time
                    );
                }
            );

            window.addEventListener(
                "sm:sequencer-model-change",
                () => {
                    this.cleanupDeadSections();

                    this.syncAtTime(
                        Number(
                            window.currentTime ||
                            0
                        )
                    );
                }
            );

            window.addEventListener(
                "sm:audio-ready",
                () => {
                    this.migrateLegacyAssets();
                }
            );

            this.takeOverLegacyAdapter();
            this.startPlaybackWatcher();

            console.log(
                "✅ Timeline → SM Audio Bridge ready"
            );

            return true;
        }

        takeOverLegacyAdapter() {
            const legacy =
                window
                    .timelineSequencerAudioAdapter;

            if (
                !legacy ||
                legacy.__smAudioEngineTakenOver
            ) {
                return;
            }

            legacy.__smAudioEngineTakenOver =
                true;

            legacy.__smOriginalSyncAtTime =
                legacy.syncAtTime
                    ?.bind(
                        legacy
                    );

            legacy.__smOriginalStop =
                legacy.stop
                    ?.bind(
                        legacy
                    );

            legacy.syncAtTime =
                time =>
                    this.syncAtTime(
                        Number(time) || 0
                    );

            legacy.stop =
                () =>
                    this.stopAllTimelineSources();

            this.migrateLegacyAssets();
        }

        migrateLegacyAssets() {
            const legacy =
                window
                    .timelineSequencerAudioAdapter;

            const engine =
                window.smAudioSystem;

            if (
                !legacy?.assets ||
                !engine?.assets
            ) {
                return;
            }

            legacy.assets.forEach(
                asset => {
                    if (
                        !asset?.id ||
                        !asset.buffer ||
                        engine.assets.has(
                            asset.id
                        )
                    ) {
                        return;
                    }

                    engine.assets
                        .registerDecodedBuffer(
                            asset.id,
                            asset.buffer,
                            {
                                name:
                                    asset.name,
                                source:
                                    asset.source,
                                sourceKind:
                                    asset
                                        .sourceKind ||
                                    "legacy",
                                assetRef:
                                    asset.assetRef
                            }
                        );
                }
            );
        }

        getAudioSections() {
            const model =
                window
                    .timelineSequencerModel;

            if (!model) return [];

            const tracks =
                model.sequence
                    ?.tracks ||
                [];

            const hasSolo =
                tracks.some(
                    track =>
                        track.solo
                );

            const result = [];

            tracks.forEach(track => {
                const audible =
                    !track.muted &&
                    (
                        !hasSolo ||
                        track.solo
                    );

                if (!audible) return;

                track.sections.forEach(
                    section => {
                        if (
                            section.muted
                        ) {
                            return;
                        }

                        if (
                            section.type !==
                                "audio" &&
                            section.metadata
                                ?.sourceKind !==
                                "audio"
                        ) {
                            return;
                        }

                        result.push({
                            track,
                            section
                        });
                    }
                );
            });

            return result;
        }

        getActiveItems(
            timelineTime
        ) {
            return this
                .getAudioSections()
                .filter(
                    item =>
                        timelineTime >=
                            item.section
                                .start &&
                        timelineTime <=
                            item.section
                                .end
                );
        }

        getSectionLocalTime(
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

        inferBus(item) {
            const explicit =
                item.section
                    .metadata
                    ?.audioBus;

            if (explicit) {
                return explicit;
            }

            const lower =
                `${item.track.name || ""} ${item.section.name || ""}`
                    .toLowerCase();

            if (
                lower.includes(
                    "music"
                )
            ) {
                return "Music";
            }

            if (
                lower.includes(
                    "dialog"
                ) ||
                lower.includes(
                    "voice"
                )
            ) {
                return "Dialogue";
            }

            if (
                lower.includes(
                    "ambient"
                ) ||
                lower.includes(
                    "wind"
                ) ||
                lower.includes(
                    "forest"
                ) ||
                lower.includes(
                    "river"
                )
            ) {
                return "Ambience";
            }

            return "SFX";
        }

        async ensureAsset(
            item
        ) {
            const engine =
                window.smAudioSystem;

            const meta =
                item.section
                    .metadata ||
                {};

            const assetId =
                meta.engineAudioAssetId ||
                meta.audioAssetId ||
                null;

            if (
                assetId &&
                engine.assets.has(
                    assetId
                )
            ) {
                return engine.assets.get(
                    assetId
                );
            }

            this.migrateLegacyAssets();

            if (
                assetId &&
                engine.assets.has(
                    assetId
                )
            ) {
                return engine.assets.get(
                    assetId
                );
            }

            if (!meta.source) {
                return null;
            }

            const asset =
                await engine.loadAsset(
                    meta.source,
                    {
                        id:
                            assetId ||
                            undefined,
                        name:
                            meta.audioName ||
                            item.section
                                .name,
                        assetRef:
                            meta.assetRef ||
                            null
                    }
                );

            item.section.metadata ||= {};

            item.section.metadata
                .engineAudioAssetId =
                asset.id;

            return asset;
        }

        async ensureSectionSource(
            item
        ) {
            const section =
                item.section;

            if (
                this.sectionSources.has(
                    section.id
                )
            ) {
                return this
                    .sectionSources
                    .get(
                        section.id
                    );
            }

            if (
                this.pendingSections.has(
                    section.id
                )
            ) {
                return this
                    .pendingSections
                    .get(
                        section.id
                    );
            }

            const job =
                (async () => {
                    const engine =
                        window.smAudioSystem;

                    const asset =
                        await this
                            .ensureAsset(
                                item
                            );

                    if (!asset) {
                        return null;
                    }

                    const meta =
                        section.metadata ||
                        {};

                    const spatial =
                        meta.spatial ===
                            true ||
                        !!meta
                            .sourceObjectUuid;

                    const object =
                        meta.sourceObjectUuid
                            ? window.scene
                                ?.getObjectByProperty?.(
                                    "uuid",
                                    meta
                                        .sourceObjectUuid
                                )
                            : null;

                    const source =
                        engine.createSource({
                            id:
                                `timeline-audio::${section.id}`,
                            name:
                                section.name ||
                                asset.name,
                            spatial,
                            assetId:
                                asset.id,
                            object:
                                object ||
                                null,
                            objectUuid:
                                meta
                                    .sourceObjectUuid ||
                                null,
                            bus:
                                this.inferBus(
                                    item
                                ),
                            loop:
                                !!section.loop,
                            volume:
                                Number(
                                    meta.volume ??
                                    1
                                ),
                            pitch:
                                Math.max(
                                    0.01,
                                    Number(
                                        section
                                            .playRate ||
                                        1
                                    )
                                ),

                            refDistance:
                                Number(
                                    meta
                                        .refDistance ??
                                    5
                                ),

                            maxDistance:
                                Number(
                                    meta
                                        .maxDistance ??
                                    250
                                ),

                            rolloffFactor:
                                Number(
                                    meta
                                        .rolloffFactor ??
                                    1
                                ),

                            distanceModel:
                                meta
                                    .distanceModel ||
                                "inverse",

                            coneInnerAngle:
                                Number(
                                    meta
                                        .coneInnerAngle ??
                                    360
                                ),

                            coneOuterAngle:
                                Number(
                                    meta
                                        .coneOuterAngle ??
                                    360
                                ),

                            coneOuterGain:
                                Number(
                                    meta
                                        .coneOuterGain ??
                                    0
                                )
                        });

                    this.sectionSources
                        .set(
                            section.id,
                            source
                        );

                    return source;
                })();

            this.pendingSections.set(
                section.id,
                job
            );

            try {
                return await job;
            } finally {
                this.pendingSections
                    .delete(
                        section.id
                    );
            }
        }

        async syncAtTime(
            timelineTime
        ) {
            if (!this.initialized) return;

            if (!window.isPlaying) {
                this.stopAllTimelineSources();

                return;
            }

            const active =
                this.getActiveItems(
                    timelineTime
                );

            const activeIds =
                new Set(
                    active.map(
                        item =>
                            item.section.id
                    )
                );

            /*
             * Stop timeline voices that are no longer inside an active section.
             */
            this.sectionSources.forEach(
                (
                    source,
                    sectionId
                ) => {
                    if (
                        !activeIds.has(
                            sectionId
                        )
                    ) {
                        source.stop();
                    }
                }
            );

            for (const item of active) {
                const source =
                    await this
                        .ensureSectionSource(
                            item
                        );

                if (!source) continue;

                const expected =
                    this.getSectionLocalTime(
                        item.section,
                        timelineTime
                    );

                const rate =
                    Math.max(
                        0.01,
                        Number(
                            item.section
                                .playRate ||
                            1
                        )
                    );

                const current =
                    source.getCurrentSourceTime();

                const needsStart =
                    !source.audio
                        ?.isPlaying;

                const drift =
                    Math.abs(
                        current -
                        expected
                    );

                if (
                    needsStart ||
                    drift > 0.18
                ) {
                    await source.play({
                        offset:
                            expected,
                        loop:
                            !!item
                                .section
                                .loop,
                        playbackRate:
                            rate,
                        volume:
                            Number(
                                item.section
                                    .metadata
                                    ?.volume ??
                                source.volume
                            )
                    });
                }
            }
        }

        stopAllTimelineSources() {
            this.sectionSources
                .forEach(
                    source =>
                        source.stop()
                );
        }

        cleanupDeadSections() {
            const alive =
                new Set(
                    this
                        .getAudioSections()
                        .map(
                            item =>
                                item.section
                                    .id
                        )
                );

            for (
                const [
                    sectionId,
                    source
                ] of this
                    .sectionSources
            ) {
                if (
                    alive.has(
                        sectionId
                    )
                ) {
                    continue;
                }

                window.smAudioSystem
                    ?.removeSource?.(
                        source.id
                    );

                this.sectionSources
                    .delete(
                        sectionId
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
                    this.lastPlaying
                ) {
                    this.lastPlaying =
                        playing;

                    if (!playing) {
                        this
                            .stopAllTimelineSources();
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
                    `sm:timeline-audio-bridge-${type}`,
                    { detail }
                )
            );
        }
    }

    window.TimelineAudioBridge =
        TimelineAudioBridge;

    window.timelineAudioBridge =
        window.timelineAudioBridge ||
        new TimelineAudioBridge();

    const boot = () => {
        if (
            window.timelineAudioBridge
                ?.init?.()
        ) {
            return;
        }

        setTimeout(
            boot,
            180
        );
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
        "sm:audio-ready",
        boot
    );

    window.addEventListener(
        "sm:sequencer-ready",
        boot
    );
})();