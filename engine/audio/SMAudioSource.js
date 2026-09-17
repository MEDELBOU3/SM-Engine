// engine/audio/SMAudioSource.js
// Unified 2D and 3D positional source wrapper around THREE.Audio / THREE.PositionalAudio.

(() => {
    "use strict";

    class SMAudioSource {
        constructor(
            engine,
            {
                id = null,
                name = "Audio Source",
                spatial = true,
                assetId = null,
                object = null,
                objectUuid = null,
                bus = "SFX",
                loop = false,
                volume = 1,
                pitch = 1,
                autoplay = false,

                refDistance = 5,
                maxDistance = 250,
                rolloffFactor = 1,
                distanceModel = "inverse",

                coneInnerAngle = 360,
                coneOuterAngle = 360,
                coneOuterGain = 0,

                enabled = true,
                metadata = {}
            } = {}
        ) {
            if (!engine?.listenerManager?.listener) {
                throw new Error(
                    "SMAudioSource requires initialized SMAudioSystem."
                );
            }

            this.engine = engine;

            this.id =
                id ||
                `audio-source-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

            this.name = name;

            this.spatial = !!spatial;
            this.assetId = assetId;

            this.object = object || null;
            this.objectUuid =
                objectUuid ||
                object?.uuid ||
                null;

            this.bus = bus || "SFX";

            this.loop = !!loop;
            this.volume =
                Math.max(
                    0,
                    Number(volume) || 0
                );

            this.pitch =
                Math.max(
                    0.01,
                    Number(pitch) || 1
                );

            this.autoplay = !!autoplay;
            this.enabled = enabled !== false;

            this.refDistance =
                Math.max(
                    0.001,
                    Number(refDistance) || 5
                );

            this.maxDistance =
                Math.max(
                    this.refDistance,
                    Number(maxDistance) || 250
                );

            this.rolloffFactor =
                Math.max(
                    0,
                    Number(rolloffFactor) || 0
                );

            this.distanceModel =
                ["linear", "inverse", "exponential"]
                    .includes(distanceModel)
                    ? distanceModel
                    : "inverse";

            this.coneInnerAngle =
                Number(coneInnerAngle) || 360;

            this.coneOuterAngle =
                Number(coneOuterAngle) || 360;

            this.coneOuterGain =
                Math.max(
                    0,
                    Math.min(
                        1,
                        Number(coneOuterGain) || 0
                    )
                );

            this.metadata =
                structuredClone(
                    metadata || {}
                );

            this.audio = null;
            this.buffer = null;

            this.startedAtContextTime = 0;
            this.startedAtOffset = 0;
            this.startedPlaybackRate = 1;

            this.createAudioNode();
        }

        createAudioNode() {
            const listener =
                this.engine
                    .listenerManager
                    .listener;

            this.audio =
                this.spatial
                    ? new THREE.PositionalAudio(
                        listener
                    )
                    : new THREE.Audio(
                        listener
                    );

            this.audio.name =
                `SM_AUDIO_NODE::${this.name}`;

            this.audio.userData ||= {};

            Object.assign(
                this.audio.userData,
                {
                    isSystemObject: true,
                    ignoreInHierarchy: true,
                    ignoreInTimeline: true,
                    smAudioSourceId:
                        this.id
                }
            );

            this.applyProperties();

            this.routeToBus(
                this.bus
            );

            if (this.object) {
                this.attachToObject(
                    this.object
                );
            }

            if (this.assetId) {
                this.setAsset(
                    this.assetId
                );
            }

            return this.audio;
        }

        applyProperties() {
            if (!this.audio) return;

            this.audio.setLoop(
                this.loop
            );

            this.audio.setVolume(
                this.volume
            );

            this.audio.setPlaybackRate(
                this.pitch
            );

            if (
                this.spatial &&
                this.audio.isPositionalAudio
            ) {
                this.audio.setRefDistance(
                    this.refDistance
                );

                this.audio.setMaxDistance(
                    this.maxDistance
                );

                this.audio.setRolloffFactor(
                    this.rolloffFactor
                );

                this.audio.setDistanceModel(
                    this.distanceModel
                );

                this.audio.setDirectionalCone(
                    this.coneInnerAngle,
                    this.coneOuterAngle,
                    this.coneOuterGain
                );
            }
        }

        setAsset(assetOrId) {
            const asset =
                typeof assetOrId === "string"
                    ? this.engine.assets.get(
                        assetOrId
                    )
                    : assetOrId;

            if (!asset?.buffer) {
                return false;
            }

            this.assetId = asset.id;
            this.buffer = asset.buffer;

            if (this.audio.isPlaying) {
                this.stop();
            }

            this.audio.setBuffer(
                this.buffer
            );

            return true;
        }

        attachToObject(object) {
            if (!object?.add || !this.audio) {
                return false;
            }

            if (
                this.audio.parent &&
                this.audio.parent !== object
            ) {
                this.audio.parent.remove(
                    this.audio
                );
            }

            object.add(
                this.audio
            );

            this.object = object;
            this.objectUuid = object.uuid;

            return true;
        }

        detach() {
            if (this.audio?.parent) {
                this.audio.parent.remove(
                    this.audio
                );
            }

            this.object = null;
            this.objectUuid = null;
        }

        routeToBus(busId) {
            const bus =
                this.engine.getBus(
                    busId
                ) ||
                this.engine.getBus(
                    "SFX"
                ) ||
                this.engine.masterBus;

            if (!bus || !this.audio?.gain) {
                return false;
            }

            try {
                this.audio.gain.disconnect();
            } catch (_) {}

            this.audio.gain.connect(
                bus.input
            );

            this.bus = bus.id;

            return true;
        }

        setSpatial(spatial) {
            spatial = !!spatial;

            if (spatial === this.spatial) {
                return this;
            }

            const wasPlaying =
                !!this.audio?.isPlaying;

            const offset =
                this.getCurrentSourceTime();

            const object =
                this.object;

            try {
                this.stop();
            } catch (_) {}

            if (this.audio?.parent) {
                this.audio.parent.remove(
                    this.audio
                );
            }

            this.spatial = spatial;

            this.createAudioNode();

            if (object) {
                this.attachToObject(object);
            }

            if (wasPlaying) {
                this.play({
                    offset
                });
            }

            return this;
        }

        async play({
            offset = 0,
            loop = this.loop,
            playbackRate = this.pitch,
            volume = this.volume
        } = {}) {
            if (
                !this.enabled ||
                !this.audio ||
                !this.buffer
            ) {
                return false;
            }

            await this.engine.unlock();

            if (this.audio.isPlaying) {
                this.audio.stop();
            }

            const duration =
                Math.max(
                    0.001,
                    Number(
                        this.buffer.duration ||
                        0.001
                    )
                );

            const safeOffset =
                loop
                    ? (
                        Math.max(
                            0,
                            Number(offset) || 0
                        ) %
                        duration
                    )
                    : Math.max(
                        0,
                        Math.min(
                            duration - 0.0001,
                            Number(offset) || 0
                        )
                    );

            this.loop = !!loop;
            this.pitch =
                Math.max(
                    0.01,
                    Number(playbackRate) || 1
                );

            this.volume =
                Math.max(
                    0,
                    Number(volume) || 0
                );

            this.audio.setLoop(
                this.loop
            );

            this.audio.setPlaybackRate(
                this.pitch
            );

            this.audio.setVolume(
                this.volume
            );

            this.audio.offset =
                safeOffset;

            this.audio.play();

            this.startedAtContextTime =
                Number(
                    this.engine
                        .listenerManager
                        .context
                        ?.currentTime ||
                    0
                );

            this.startedAtOffset =
                safeOffset;

            this.startedPlaybackRate =
                this.pitch;

            this.engine.emit(
                "source-play",
                {
                    source: this,
                    offset:
                        safeOffset
                }
            );

            return true;
        }

        stop() {
            if (!this.audio) return;

            if (this.audio.isPlaying) {
                try {
                    this.audio.stop();
                } catch (_) {}
            }

            this.engine.emit(
                "source-stop",
                {
                    source: this
                }
            );
        }

        setVolume(value) {
            this.volume =
                Math.max(
                    0,
                    Number(value) || 0
                );

            this.audio?.setVolume(
                this.volume
            );

            return this.volume;
        }

        setPitch(value) {
            this.pitch =
                Math.max(
                    0.01,
                    Number(value) || 1
                );

            this.audio?.setPlaybackRate(
                this.pitch
            );

            return this.pitch;
        }

        getCurrentSourceTime() {
            if (
                !this.audio?.isPlaying ||
                !this.buffer
            ) {
                return this.startedAtOffset || 0;
            }

            const contextTime =
                Number(
                    this.engine
                        .listenerManager
                        .context
                        ?.currentTime ||
                    0
                );

            let value =
                this.startedAtOffset +
                Math.max(
                    0,
                    contextTime -
                        this
                            .startedAtContextTime
                ) *
                    this
                        .startedPlaybackRate;

            const duration =
                Math.max(
                    0.001,
                    Number(
                        this.buffer.duration ||
                        0.001
                    )
                );

            if (this.loop) {
                value %= duration;
            }

            return value;
        }

        setEnabled(enabled) {
            this.enabled = !!enabled;

            if (!this.enabled) {
                this.stop();
            }

            return this.enabled;
        }

        serialize() {
            return {
                id: this.id,
                name: this.name,
                spatial: this.spatial,
                assetId: this.assetId,
                objectUuid: this.objectUuid,
                bus: this.bus,
                loop: this.loop,
                volume: this.volume,
                pitch: this.pitch,
                autoplay: this.autoplay,
                enabled: this.enabled,

                refDistance: this.refDistance,
                maxDistance: this.maxDistance,
                rolloffFactor: this.rolloffFactor,
                distanceModel: this.distanceModel,

                coneInnerAngle: this.coneInnerAngle,
                coneOuterAngle: this.coneOuterAngle,
                coneOuterGain: this.coneOuterGain,

                metadata:
                    structuredClone(
                        this.metadata
                    )
            };
        }

        dispose() {
            this.stop();

            try {
                this.audio?.gain?.disconnect();
            } catch (_) {}

            this.detach();

            this.audio = null;
            this.buffer = null;
        }
    }

    window.SMAudioSource =
        SMAudioSource;
})();