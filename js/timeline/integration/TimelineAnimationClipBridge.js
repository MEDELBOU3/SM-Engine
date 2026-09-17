// js/timeline/integration/TimelineAnimationClipBridge.js
// Bridges imported THREE.AnimationClip data to Sequencer Sections.
//
// Requires:
// - timeline-data.js
// - animation-converter.js
// - TimelineSequencerModel.js
//
// Purpose:
// Native THREE.AnimationClip = high-level Sequencer section.
// Imported/baked keyframes remain available to Dope Sheet / Graph Editor.

(() => {
    "use strict";

    class TimelineAnimationClipBridge {
        constructor() {
            this.initialized = false;

            this.models = new Map();
            this.activeByModel = new Map();

            this._patchedConverter = false;
            this._patchedSetupModel = false;
            this._scanTimer = 0;

            this.events = new EventTarget();
        }

        init() {
            if (this.initialized) {
                this.patchExistingFunctions();
                this.scanScene();
                return true;
            }

            this.initialized = true;

            this.patchExistingFunctions();
            this.bindEvents();

            this.scanScene();

            console.log("✅ Timeline AnimationClip Bridge ready");

            return true;
        }

        bindEvents() {
            window.addEventListener(
                "sm:sequencer-ready",
                () => this.scanScene()
            );

            window.addEventListener(
                "sm:timeline-panel-ready",
                () => this.scanScene()
            );

            window.addEventListener(
                "sm:sequencer-model-change",
                () => this.scheduleScan()
            );

            /*
             * sm-timeline-core dispatches timeUpdate AFTER the normal
             * updateSceneFromTimeline() pass. We can therefore correct the
             * native mixer to the Sequencer section-local time here.
             *
             * TimelineEvaluatorBridge should load AFTER this file so manual
             * keyframe overrides are applied after this native clip pose.
             */
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
        }

        patchExistingFunctions() {
            this.patchAnimationConverter();
            this.patchSetupModelInScene();
        }

        patchAnimationConverter() {
            if (this._patchedConverter) return;

            const original =
                window.extractAnimationsToTimeline;

            if (typeof original !== "function") return;

            if (original.__smSequencerWrapped) {
                this._patchedConverter = true;
                return;
            }

            const bridge = this;

            function wrappedExtractAnimationsToTimeline(model, animations) {
                const result =
                    original.apply(
                        this,
                        arguments
                    );

                try {
                    bridge.registerModel(model);
                    bridge.syncModel(model, {
                        createDefaultSection: true
                    });
                } catch (error) {
                    console.warn(
                        "[AnimationClipBridge] Post-convert sync failed:",
                        error
                    );
                }

                return result;
            }

            wrappedExtractAnimationsToTimeline.__smSequencerWrapped = true;
            wrappedExtractAnimationsToTimeline.__smOriginal = original;

            window.extractAnimationsToTimeline =
                wrappedExtractAnimationsToTimeline;

            this._patchedConverter = true;
        }

        patchSetupModelInScene() {
            if (this._patchedSetupModel) return;

            const original =
                window.setupModelInScene;

            if (typeof original !== "function") return;

            if (original.__smSequencerWrapped) {
                this._patchedSetupModel = true;
                return;
            }

            const bridge = this;

            function wrappedSetupModelInScene(object, name) {
                const result =
                    original.apply(
                        this,
                        arguments
                    );

                try {
                    bridge.registerModel(object);
                    bridge.syncModel(object, {
                        createDefaultSection: true
                    });
                } catch (error) {
                    console.warn(
                        "[AnimationClipBridge] Model setup sync failed:",
                        error
                    );
                }

                return result;
            }

            wrappedSetupModelInScene.__smSequencerWrapped = true;
            wrappedSetupModelInScene.__smOriginal = original;

            window.setupModelInScene =
                wrappedSetupModelInScene;

            this._patchedSetupModel = true;
        }

        scheduleScan() {
            clearTimeout(this._scanTimer);

            this._scanTimer =
                setTimeout(
                    () => this.scanScene(),
                    80
                );
        }

        scanScene() {
            this.patchExistingFunctions();

            const scene =
                window.scene;

            if (!scene?.traverse) return [];

            const found = [];

            scene.traverse(object => {
                if (
                    !object?.isObject3D ||
                    !Array.isArray(object.animations) ||
                    object.animations.length === 0
                ) {
                    return;
                }

                /*
                 * Child nodes may inherit/receive animation arrays in some
                 * loaders. Prefer model roots and avoid duplicate registration.
                 */
                const rootModelUuid =
                    object.userData?.rootModelUuid;

                if (rootModelUuid) return;

                this.registerModel(object);
                this.syncModel(object, {
                    createDefaultSection: true
                });

                found.push(object);
            });

            return found;
        }

        registerModel(model) {
            if (
                !model?.isObject3D ||
                !Array.isArray(model.animations) ||
                model.animations.length === 0
            ) {
                return null;
            }

            const entry = {
                model,
                modelUuid: model.uuid,
                clips: model.animations
            };

            this.models.set(
                model.uuid,
                entry
            );

            return entry;
        }

        syncModel(model, {
            createDefaultSection = true
        } = {}) {
            if (
                !model?.isObject3D ||
                !Array.isArray(model.animations) ||
                model.animations.length === 0
            ) {
                return null;
            }

            const sequencer =
                window.timelineSequencerModel;

            if (!sequencer) return null;

            this.registerModel(model);

            const row = {
                rowKey: `root::${model.uuid}`,
                uuid: model.uuid,
                object: model,
                parentUuid: null,
                isChild: false,
                is2DLayer: false,
                labelName:
                    model.name ||
                    "Animated Object"
            };

            const track =
                sequencer.ensureTrackForTimelineRow(row);

            if (!track) return null;

            track.type = "animation";
            track.metadata ||= {};

            track.metadata.sourceKind =
                "nativeAnimationLibrary";

            track.metadata.modelUuid =
                model.uuid;

            track.metadata.availableClips =
                model.animations.map(
                    (clip, index) => ({
                        index,
                        name:
                            clip.name ||
                            `Clip ${index + 1}`,
                        duration:
                            Number(clip.duration) ||
                            0
                    })
                );

            const nativeSections =
                track.sections.filter(
                    section =>
                        section.metadata?.sourceKind ===
                        "nativeClip"
                );

            /*
             * Do not automatically place every imported clip on top of every
             * other clip. Professional editors treat clips as a library.
             *
             * Auto-place only the first/default clip when no native section
             * exists yet. Other clips can be inserted with addClipSection().
             */
            if (
                createDefaultSection &&
                nativeSections.length === 0 &&
                model.animations.length > 0
            ) {
                const preferred =
                    this.getPreferredClip(model) ||
                    model.animations[0];

                if (preferred) {
                    this.addClipSection(
                        model,
                        preferred,
                        {
                            start: 0,
                            name:
                                preferred.name ||
                                "Animation"
                        }
                    );
                }
            }

            this.emit(
                "model-sync",
                {
                    model,
                    track
                }
            );

            return track;
        }

        getPreferredClip(model) {
            if (!model?.animations?.length) return null;

            const active =
                model.userData?.activeAnimationClip;

            if (!active) {
                return model.animations[0];
            }

            if (
                typeof active === "object" &&
                model.animations.includes(active)
            ) {
                return active;
            }

            return (
                model.animations.find(
                    clip =>
                        clip.name === active
                ) ||
                model.animations[0]
            );
        }

        resolveClip(model, clipOrNameOrIndex) {
            if (!model?.animations?.length) return null;

            if (
                clipOrNameOrIndex &&
                typeof clipOrNameOrIndex === "object"
            ) {
                const index =
                    model.animations.indexOf(
                        clipOrNameOrIndex
                    );

                if (index >= 0) {
                    return {
                        clip: clipOrNameOrIndex,
                        index
                    };
                }
            }

            if (
                Number.isInteger(
                    Number(clipOrNameOrIndex)
                )
            ) {
                const index =
                    Number(clipOrNameOrIndex);

                const clip =
                    model.animations[index];

                if (clip) {
                    return {
                        clip,
                        index
                    };
                }
            }

            const name =
                String(
                    clipOrNameOrIndex ??
                    ""
                );

            const index =
                model.animations.findIndex(
                    clip =>
                        clip.name === name
                );

            if (index >= 0) {
                return {
                    clip:
                        model.animations[index],
                    index
                };
            }

            return null;
        }

        addClipSection(
            modelOrUuid,
            clipOrNameOrIndex,
            {
                start = Number(window.currentTime || 0),
                name = null,
                playRate = 1,
                loop = false,
                blendIn = 0,
                blendOut = 0
            } = {}
        ) {
            const model =
                typeof modelOrUuid === "string"
                    ? this.getModelByUuid(
                        modelOrUuid
                    )
                    : modelOrUuid;

            if (!model) return null;

            const resolved =
                this.resolveClip(
                    model,
                    clipOrNameOrIndex
                );

            if (!resolved) {
                console.warn(
                    "[AnimationClipBridge] Clip not found:",
                    clipOrNameOrIndex
                );

                return null;
            }

            const track =
                this.syncModel(
                    model,
                    {
                        createDefaultSection: false
                    }
                );

            if (!track) return null;

            const clip =
                resolved.clip;

            const rate =
                Math.max(
                    0.001,
                    Math.abs(
                        Number(playRate) || 1
                    )
                );

            const sourceDuration =
                Math.max(
                    0.001,
                    Number(clip.duration) || 0.001
                );

            const timelineLength =
                sourceDuration / rate;

            const duration =
                Math.max(
                    timelineLength,
                    Number(
                        window.timelineDuration ||
                        timelineLength
                    )
                );

            if (
                Number(window.timelineDuration || 0) <
                start + timelineLength
            ) {
                window.timelineDuration =
                    start + timelineLength;

                window.setTimelineDuration?.(
                    window.timelineDuration
                );
            }

            const section =
                window.timelineSequencerModel
                    ?.addSection(
                        track.id,
                        {
                            name:
                                name ||
                                clip.name ||
                                "Animation",
                            type:
                                "animation",
                            start,
                            end:
                                start +
                                timelineLength,
                            sourceStart: 0,
                            sourceDuration,
                            playRate: rate,
                            loop,
                            blendIn,
                            blendOut,
                            metadata: {
                                sourceKind:
                                    "nativeClip",
                                modelUuid:
                                    model.uuid,
                                clipIndex:
                                    resolved.index,
                                clipName:
                                    clip.name ||
                                    `Clip ${resolved.index + 1}`,
                                clipDuration:
                                    sourceDuration
                            }
                        }
                    );

            if (section) {
                this.emit(
                    "clip-section-add",
                    {
                        model,
                        clip,
                        track,
                        section
                    }
                );
            }

            return section;
        }

        getModelByUuid(uuid) {
            const cached =
                this.models.get(uuid)?.model;

            if (cached) return cached;

            const model =
                window.scene
                    ?.getObjectByProperty?.(
                        "uuid",
                        uuid
                    ) ||
                null;

            if (
                model?.animations?.length
            ) {
                this.registerModel(model);
            }

            return model;
        }

        getNativeSectionsForModel(modelUuid) {
            const sequencer =
                window.timelineSequencerModel;

            if (!sequencer) return [];

            const track =
                sequencer.getTrackByRowKey(
                    `root::${modelUuid}`
                );

            if (!track) return [];

            return track.sections.filter(
                section =>
                    section.metadata?.sourceKind ===
                    "nativeClip"
            );
        }

        getActiveSection(modelUuid, timelineTime) {
            const sections =
                this.getNativeSectionsForModel(
                    modelUuid
                );

            /*
             * Later section wins when sections overlap, similar to layer
             * priority in many sequencers.
             */
            return (
                sections
                    .filter(
                        section =>
                            timelineTime >=
                                section.start &&
                            timelineTime <=
                                section.end
                    )
                    .sort(
                        (a, b) =>
                            a.start - b.start
                    )
                    .at(-1) ||
                null
            );
        }

        getSectionLocalTime(section, timelineTime) {
            if (!section) return 0;

            const sourceStart =
                Math.max(
                    0,
                    Number(section.sourceStart) ||
                    0
                );

            const playRate =
                Math.max(
                    0.001,
                    Math.abs(
                        Number(section.playRate) ||
                        1
                    )
                );

            const sourceDuration =
                Math.max(
                    0.001,
                    Number(
                        section.sourceDuration ||
                        section.metadata
                            ?.clipDuration ||
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
                    playRate;

            if (section.loop) {
                const relative =
                    Math.max(
                        0,
                        local -
                            sourceStart
                    );

                local =
                    sourceStart +
                    (
                        relative %
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

        evaluateAtTime(timelineTime) {
            if (!window.timelineSequencerModel) return;

            for (const [modelUuid, entry] of this.models) {
                const model =
                    entry.model;

                if (
                    !model?.userData?.mixer ||
                    !model.animations?.length
                ) {
                    continue;
                }

                const section =
                    this.getActiveSection(
                        modelUuid,
                        timelineTime
                    );

                if (!section) {
                    this.activeByModel.delete(
                        modelUuid
                    );

                    continue;
                }

                const clipIndex =
                    Number(
                        section.metadata
                            ?.clipIndex
                    );

                const clip =
                    model.animations[
                        clipIndex
                    ] ||
                    model.animations.find(
                        item =>
                            item.name ===
                            section.metadata
                                ?.clipName
                    );

                if (!clip) continue;

                const mixer =
                    model.userData.mixer;

                const activeId =
                    this.activeByModel.get(
                        modelUuid
                    );

                if (
                    activeId !==
                    section.id
                ) {
                    model.animations.forEach(
                        otherClip => {
                            const action =
                                mixer.clipAction(
                                    otherClip
                                );

                            action.enabled =
                                otherClip === clip;

                            action.setEffectiveWeight?.(
                                otherClip === clip
                                    ? 1
                                    : 0
                            );

                            if (
                                otherClip ===
                                clip
                            ) {
                                action.reset();
                                action.enabled =
                                    true;

                                action.paused =
                                    false;

                                action.clampWhenFinished =
                                    true;

                                action.setLoop(
                                    section.loop
                                        ? THREE.LoopRepeat
                                        : THREE.LoopOnce,
                                    section.loop
                                        ? Infinity
                                        : 1
                                );

                                action.setEffectiveTimeScale?.(
                                    Math.max(
                                        0.001,
                                        Number(
                                            section.playRate
                                        ) || 1
                                    )
                                );

                                action.play();
                            }
                        }
                    );

                    this.activeByModel.set(
                        modelUuid,
                        section.id
                    );
                }

                const localTime =
                    this.getSectionLocalTime(
                        section,
                        timelineTime
                    );

                /*
                 * mixer.setTime() evaluates the enabled native clip pose.
                 * Manual/custom keyframe overrides are intentionally handled
                 * by TimelineEvaluatorBridge after this listener.
                 */
                mixer.setTime(localTime);
                mixer.update(0);

                model.userData
                    .sequencerActiveSectionId =
                    section.id;

                model.userData
                    .sequencerActiveClipName =
                    clip.name;

                model.userData
                    .sequencerClipLocalTime =
                    localTime;
            }
        }

        serializeModelMetadata(model) {
            if (!model) return null;

            const childUuids =
                model.userData
                    ?.animatedChildUuids;

            return {
                modelUuid:
                    model.uuid,
                animatedChildUuids:
                    childUuids instanceof Set
                        ? [...childUuids]
                        : Array.isArray(
                            childUuids
                        )
                            ? [...childUuids]
                            : [],
                availableClips:
                    model.animations?.map(
                        (clip, index) => ({
                            index,
                            name:
                                clip.name ||
                                `Clip ${index + 1}`,
                            duration:
                                Number(
                                    clip.duration
                                ) || 0
                        })
                    ) || []
            };
        }

        restoreAnimatedChildSet(model, data) {
            if (!model || !data) return false;

            model.userData ||= {};

            model.userData.animatedChildUuids =
                new Set(
                    Array.isArray(
                        data.animatedChildUuids
                    )
                        ? data.animatedChildUuids
                        : []
                );

            return true;
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
                    `sm:timeline-clip-${type}`,
                    { detail }
                )
            );
        }
    }

    window.TimelineAnimationClipBridge =
        TimelineAnimationClipBridge;

    window.timelineAnimationClipBridge =
        window.timelineAnimationClipBridge ||
        new TimelineAnimationClipBridge();

    const boot = () => {
        window.timelineAnimationClipBridge
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