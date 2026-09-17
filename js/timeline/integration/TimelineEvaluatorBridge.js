// js/timeline/integration/TimelineEvaluatorBridge.js
// Sequencer-local time bridge for TimelineBinaryEvaluator.
//
// Requires:
// - timeline-binary-evaluator.js
// - TimelineSequencerModel.js
// - TimelineAnimationClipBridge.js (recommended)
//
// Layering:
// 1. timeline-data.js applies native/global timeline state.
// 2. TimelineAnimationClipBridge samples active native clip section.
// 3. THIS bridge applies manual/custom keyframe overrides last.

(() => {
    "use strict";

    class TimelineEvaluatorBridge {
        constructor() {
            this.initialized = false;

            this.keyframeSectionSource =
                "timelineKeys";

            this.events =
                new EventTarget();
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

                    this.evaluateAtTime(time);
                }
            );

            window.addEventListener(
                "sm:sequencer-model-change",
                event => {
                    const type =
                        event.detail?.type ||
                        "";

                    if (
                        String(type)
                            .includes("key") ||
                        String(type)
                            .includes("section")
                    ) {
                        /*
                         * Section edits do not change the sorted key data, but
                         * key-edit integrations may use the same event path.
                         * Invalidating globally is safe and keeps preview exact.
                         */
                        window.TimelineBinaryEvaluator
                            ?.invalidateCache?.();
                    }
                }
            );

            console.log("✅ Timeline Evaluator Bridge ready");

            return true;
        }

        getSceneObject(uuid) {
            return (
                window.scene
                    ?.getObjectByProperty?.(
                        "uuid",
                        uuid
                    ) ||
                null
            );
        }

        getRootModelForObject(object) {
            if (!object) return null;

            const explicitRootUuid =
                object.userData
                    ?.rootModelUuid;

            if (explicitRootUuid) {
                return (
                    this.getSceneObject(
                        explicitRootUuid
                    ) ||
                    null
                );
            }

            let current = object;

            while (current) {
                if (
                    current.userData
                        ?.mixer &&
                    current.animations
                        ?.length
                ) {
                    return current;
                }

                current =
                    current.parent;
            }

            return null;
        }

        getTrackForUuid(
            uuid,
            parentUuid = null
        ) {
            const model =
                window.timelineSequencerModel;

            if (!model) return null;

            if (parentUuid) {
                const child =
                    model.getTrackByRowKey(
                        `child::${parentUuid}::${uuid}`
                    );

                if (child) return child;
            }

            return (
                model.getTrackByRowKey(
                    `root::${uuid}`
                ) ||
                model.sequence
                    .tracks.find(
                        track =>
                            track.ownerUuid ===
                            uuid
                    ) ||
                null
            );
        }

        getActiveKeyframeSection(
            track,
            timelineTime
        ) {
            if (!track) return null;

            return (
                track.sections
                    .filter(
                        section => {
                            const sourceKind =
                                section.metadata
                                    ?.sourceKind;

                            if (
                                sourceKind !==
                                this
                                    .keyframeSectionSource
                            ) {
                                return false;
                            }

                            return (
                                timelineTime >=
                                    section.start &&
                                timelineTime <=
                                    section.end
                            );
                        }
                    )
                    .sort(
                        (a, b) =>
                            a.start - b.start
                    )
                    .at(-1) ||
                null
            );
        }

        getSectionLocalTime(
            section,
            timelineTime
        ) {
            if (!section) {
                return timelineTime;
            }

            const sourceStart =
                Math.max(
                    0,
                    Number(
                        section.sourceStart
                    ) || 0
                );

            const playRate =
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
                        section.sourceDuration
                    ) ||
                        (
                            section.end -
                            section.start
                        ) *
                            playRate
                );

            let local =
                sourceStart +
                Math.max(
                    0,
                    timelineTime -
                        section.start
                ) *
                    playRate;

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

        filterManualKeyframes(
            keyframeMap
        ) {
            if (!keyframeMap) return null;

            const entries =
                Object.entries(
                    keyframeMap
                ).filter(
                    ([, data]) => {
                        if (!data) return false;

                        if (
                            data.isImportedTrack ===
                            true
                        ) {
                            return false;
                        }

                        if (
                            data.source ===
                            "imported"
                        ) {
                            return false;
                        }

                        return true;
                    }
                );

            if (!entries.length) {
                return null;
            }

            return Object.fromEntries(
                entries
            );
        }

        invalidate(uuid = null) {
            window.TimelineBinaryEvaluator
                ?.invalidateCache?.(
                    uuid || undefined
                );
        }

        bindKeyframeSection(
            rowKey,
            {
                start = Number(window.currentTime || 0),
                end = null,
                sourceStart = 0,
                sourceDuration = null,
                playRate = 1,
                loop = false,
                name = "Keyframe Section"
            } = {}
        ) {
            const model =
                window.timelineSequencerModel;

            const track =
                model?.getTrackByRowKey(
                    rowKey
                );

            if (!track) return null;

            const duration =
                Math.max(
                    0.001,
                    Number(
                        window.timelineDuration ||
                        30
                    )
                );

            const finalEnd =
                end == null
                    ? duration
                    : end;

            return model.addSection(
                track.id,
                {
                    name,
                    type:
                        "transform",
                    start,
                    end:
                        Math.max(
                            start + 0.001,
                            finalEnd
                        ),
                    sourceStart,
                    sourceDuration:
                        sourceDuration == null
                            ? Math.max(
                                0.001,
                                finalEnd -
                                    start
                            )
                            : sourceDuration,
                    playRate,
                    loop,
                    metadata: {
                        sourceKind:
                            this
                                .keyframeSectionSource,
                        ownerUuid:
                            track.ownerUuid,
                        parentUuid:
                            track.parentUuid ||
                            null
                    }
                }
            );
        }

        evaluateAtTime(timelineTime) {
            const evaluator =
                window.TimelineBinaryEvaluator;

            const scene =
                window.scene;

            if (
                !evaluator ||
                !scene?.traverse
            ) {
                return;
            }

            const nativeBridge =
                window
                    .timelineAnimationClipBridge;

            scene.traverse(object => {
                if (
                    !object?.isObject3D ||
                    !object.uuid
                ) {
                    return;
                }

                const root =
                    this.getRootModelForObject(
                        object
                    );

                const parentUuid =
                    object.userData
                        ?.rootModelUuid ||
                    root?.uuid ||
                    null;

                const track =
                    this.getTrackForUuid(
                        object.uuid,
                        object === root
                            ? null
                            : parentUuid
                    );

                const section =
                    this
                        .getActiveKeyframeSection(
                            track,
                            timelineTime
                        );

                const hasActiveNativeClip =
                    !!(
                        root &&
                        nativeBridge
                            ?.getActiveSection?.(
                                root.uuid,
                                timelineTime
                            )
                    );

                let map =
                    window.keyframes
                        ?.get(
                            object.uuid
                        );

                /*
                 * When a native clip section is active, imported converter
                 * keys represent the same source animation and MUST NOT
                 * override the correctly sampled native clip pose again.
                 *
                 * Only user/manual keys are layered over that pose.
                 */
                if (
                    hasActiveNativeClip &&
                    map
                ) {
                    map =
                        this
                            .filterManualKeyframes(
                                map
                            );
                }

                if (map) {
                    const time =
                        section
                            ? this
                                .getSectionLocalTime(
                                    section,
                                    timelineTime
                                )
                            : timelineTime;

                    const target =
                        object.userData
                            ?.animationTarget ||
                        object;

                    evaluator
                        .evaluateObject(
                            target,
                            map,
                            time
                        );
                }

                /*
                 * Some older SM Engine workflows store nested bone maps on the
                 * root model in window.boneKeyframes.
                 */
                const boneMaps =
                    window.boneKeyframes
                        ?.get(
                            object.uuid
                        );

                if (
                    boneMaps instanceof
                    Map
                ) {
                    boneMaps.forEach(
                        (
                            boneMap,
                            boneName
                        ) => {
                            const bone =
                                object
                                    .getObjectByName?.(
                                        boneName
                                    );

                            if (!bone) return;

                            let runtimeMap =
                                boneMap;

                            if (
                                hasActiveNativeClip
                            ) {
                                runtimeMap =
                                    this
                                        .filterManualKeyframes(
                                            boneMap
                                        );
                            }

                            if (!runtimeMap) return;

                            const boneTrack =
                                this.getTrackForUuid(
                                    bone.uuid,
                                    object.uuid
                                );

                            const boneSection =
                                this
                                    .getActiveKeyframeSection(
                                        boneTrack,
                                        timelineTime
                                    );

                            evaluator
                                .evaluateObject(
                                    bone,
                                    runtimeMap,
                                    boneSection
                                        ? this
                                            .getSectionLocalTime(
                                                boneSection,
                                                timelineTime
                                            )
                                        : timelineTime
                                );
                        }
                    );
                }
            });
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
                    `sm:timeline-evaluator-${type}`,
                    { detail }
                )
            );
        }
    }

    window.TimelineEvaluatorBridge =
        TimelineEvaluatorBridge;

    window.timelineEvaluatorBridge =
        window.timelineEvaluatorBridge ||
        new TimelineEvaluatorBridge();

    const boot = () => {
        window.timelineEvaluatorBridge
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