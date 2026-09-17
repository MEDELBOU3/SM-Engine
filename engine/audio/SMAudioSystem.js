// engine/audio/SMAudioSystem.js
// Main SM Engine Audio subsystem.
// Load LAST after all engine/audio core files.

(() => {
    "use strict";

    class SMAudioSystem {
        constructor() {
            this.initialized = false;

            this.listenerManager =
                new SMAudioListenerManager();

            this.assets =
                new SMAudioAssetManager(
                    () =>
                        this.listenerManager
                            .context
                );

            this.buses = new Map();
            this.sources = new Map();
            this.zones = new Map();

            this.masterBus = null;
            this.masterFilter = null;

            this.viewportHelper = null;

            this.activeZone = null;

            this.defaultLowpassHz = 22000;
            this.defaultMasterGain = 1;

            this._zoneCurrentLowpass =
                this.defaultLowpassHz;

            this._zoneCurrentGain =
                this.defaultMasterGain;

            this._frameCallback =
                null;

            this._fallbackRaf = 0;
            this._lastFallbackTime =
                performance.now();

            this.events =
                new EventTarget();
        }

        init({
            camera =
                window.camera ||
                null,
            runtimeCamera = null
        } = {}) {
            if (this.initialized) {
                if (camera) {
                    this.setEditorCamera(
                        camera
                    );
                }

                if (runtimeCamera) {
                    this.setRuntimeCamera(
                        runtimeCamera
                    );
                }

                return true;
            }

            if (!window.THREE) {
                throw new Error(
                    "SMAudioSystem requires THREE."
                );
            }

            this.listenerManager.init(
                camera
            );

            if (runtimeCamera) {
                this.listenerManager
                    .setRuntimeCamera(
                        runtimeCamera
                    );
            }

            this.createMasterGraph();
            this.createDefaultBuses();

            this.viewportHelper =
                new SMAudioViewportHelper(
                    this
                );

            this.bindModeEvents();
            this.attachToEngineLoop();

            this.initialized = true;

            this.emit(
                "ready",
                {
                    system: this
                }
            );

            window.dispatchEvent(
                new CustomEvent(
                    "sm:audio-ready",
                    {
                        detail: {
                            system:
                                this
                        }
                    }
                )
            );

            console.log(
                "✅ SM Audio Engine Pro ready"
            );

            return true;
        }

        createMasterGraph() {
            const context =
                this.listenerManager
                    .context;

            const listenerInput =
                this.listenerManager
                    .getInput();

            if (
                !context ||
                !listenerInput
            ) {
                throw new Error(
                    "SMAudioSystem cannot create master graph."
                );
            }

            this.masterFilter =
                context.createBiquadFilter();

            this.masterFilter.type =
                "lowpass";

            this.masterFilter.frequency.value =
                this.defaultLowpassHz;

            this.masterFilter.Q.value =
                0.0001;

            this.masterFilter.connect(
                listenerInput
            );

            this.masterBus =
                new SMAudioBus(
                    context,
                    {
                        id: "Master",
                        name: "Master",
                        volume: 1,
                        parentInput:
                            this.masterFilter
                    }
                );

            this.buses.set(
                "Master",
                this.masterBus
            );
        }

        createDefaultBuses() {
            [
                "Music",
                "SFX",
                "Dialogue",
                "UI",
                "Ambience"
            ].forEach(
                name => {
                    if (
                        !this.buses.has(
                            name
                        )
                    ) {
                        this.createBus(
                            name,
                            {
                                name,
                                parent:
                                    "Master"
                            }
                        );
                    }
                }
            );
        }

        createBus(
            id,
            {
                name = null,
                volume = 1,
                muted = false,
                parent = "Master"
            } = {}
        ) {
            if (this.buses.has(id)) {
                return this.buses.get(id);
            }

            const parentBus =
                this.buses.get(parent) ||
                this.masterBus;

            const bus =
                new SMAudioBus(
                    this.listenerManager
                        .context,
                    {
                        id,
                        name:
                            name ||
                            id,
                        volume,
                        muted,
                        parentInput:
                            parentBus
                                ?.input ||
                            this
                                .masterFilter
                    }
                );

            this.buses.set(
                id,
                bus
            );

            this.emit(
                "bus-created",
                {
                    bus
                }
            );

            return bus;
        }

        getBus(id) {
            return (
                this.buses.get(id) ||
                null
            );
        }

        setBusVolume(
            id,
            volume
        ) {
            return this
                .getBus(id)
                ?.setVolume(
                    volume
                );
        }

        setBusMuted(
            id,
            muted
        ) {
            return this
                .getBus(id)
                ?.setMuted(
                    muted
                );
        }

        async unlock() {
            return this
                .listenerManager
                .unlock();
        }

        async loadAsset(
            fileOrUrl,
            options = {}
        ) {
            return this.assets.load(
                fileOrUrl,
                options
            );
        }

        createSource(options = {}) {
            if (!this.initialized) {
                this.init();
            }

            const source =
                new SMAudioSource(
                    this,
                    options
                );

            this.sources.set(
                source.id,
                source
            );

            if (
                source.spatial &&
                source.object &&
                options.showHelper
            ) {
                this.viewportHelper
                    ?.showForSource(
                        source,
                        true
                    );
            }

            this.emit(
                "source-created",
                {
                    source
                }
            );

            if (
                source.autoplay &&
                source.assetId
            ) {
                source.play();
            }

            return source;
        }

        create2DSource(
            options = {}
        ) {
            return this.createSource({
                ...options,
                spatial: false
            });
        }

        createPositionalSource(
            options = {}
        ) {
            return this.createSource({
                ...options,
                spatial: true
            });
        }

        getSource(id) {
            return (
                this.sources.get(id) ||
                null
            );
        }

        removeSource(id) {
            const source =
                this.sources.get(id);

            if (!source) return false;

            this.viewportHelper
                ?.removeSource(id);

            source.dispose();

            this.sources.delete(id);

            this.emit(
                "source-removed",
                {
                    source
                }
            );

            return true;
        }

        async playSource(
            id,
            options = {}
        ) {
            return this
                .getSource(id)
                ?.play(
                    options
                );
        }

        stopSource(id) {
            this.getSource(id)
                ?.stop();
        }

        stopAll({
            bus = null
        } = {}) {
            this.sources.forEach(
                source => {
                    if (
                        bus &&
                        source.bus !== bus
                    ) {
                        return;
                    }

                    source.stop();
                }
            );
        }

        createZone(options = {}) {
            const zone =
                new SMAudioZone(
                    options
                );

            this.zones.set(
                zone.id,
                zone
            );

            this.emit(
                "zone-created",
                {
                    zone
                }
            );

            return zone;
        }

        removeZone(id) {
            const zone =
                this.zones.get(id);

            if (!zone) return false;

            this.zones.delete(id);

            if (
                this.activeZone?.id ===
                id
            ) {
                this.activeZone = null;
            }

            this.emit(
                "zone-removed",
                {
                    zone
                }
            );

            return true;
        }

        setEditorCamera(camera) {
            return this
                .listenerManager
                .setEditorCamera(
                    camera
                );
        }

        setRuntimeCamera(camera) {
            return this
                .listenerManager
                .setRuntimeCamera(
                    camera
                );
        }

        useEditorListener() {
            return this
                .listenerManager
                .setMode(
                    "editor"
                );
        }

        useRuntimeListener() {
            return this
                .listenerManager
                .setMode(
                    "runtime"
                );
        }

        bindModeEvents() {
            /*
             * Keep this permissive because SM Engine has multiple workspace
             * managers / game modes. External systems can also call:
             *
             * smAudioSystem.useEditorListener()
             * smAudioSystem.useRuntimeListener()
             */
            const runtimeOn = () => {
                if (
                    this.listenerManager
                        .runtimeCamera
                ) {
                    this.useRuntimeListener();
                }
            };

            const editorOn = () => {
                if (
                    this.listenerManager
                        .editorCamera
                ) {
                    this.useEditorListener();
                }
            };

            [
                "sm:gameplay-start",
                "sm:play-mode-start",
                "sm:runtime-start"
            ].forEach(
                eventName =>
                    window.addEventListener(
                        eventName,
                        runtimeOn
                    )
            );

            [
                "sm:gameplay-stop",
                "sm:play-mode-stop",
                "sm:runtime-stop"
            ].forEach(
                eventName =>
                    window.addEventListener(
                        eventName,
                        editorOn
                    )
            );
        }

        attachToEngineLoop() {
            if (
                Array.isArray(
                    window.engineFrameCallbacks
                )
            ) {
                this._frameCallback =
                    (
                        delta = 0.016
                    ) => {
                        this.update(
                            delta
                        );
                    };

                window.engineFrameCallbacks
                    .push(
                        this._frameCallback
                    );

                return;
            }

            /*
             * Fallback only when the engine does not expose frame callbacks.
             */
            const tick = now => {
                this._fallbackRaf =
                    requestAnimationFrame(
                        tick
                    );

                const delta =
                    Math.min(
                        0.05,
                        Math.max(
                            0,
                            (
                                now -
                                this
                                    ._lastFallbackTime
                            ) / 1000
                        )
                    );

                this._lastFallbackTime =
                    now;

                this.update(
                    delta
                );
            };

            this._fallbackRaf =
                requestAnimationFrame(
                    tick
                );
        }

        update(delta = 0.016) {
            if (!this.initialized) return;

            this.updateZones(
                delta
            );
        }

        updateZones(delta) {
            if (
                !this.masterFilter ||
                !this.masterBus ||
                !this.listenerManager
                    .listener
            ) {
                return;
            }

            const listenerPosition =
                this.listenerManager
                    .getWorldPosition();

            if (!listenerPosition) return;

            const inside =
                [...this.zones.values()]
                    .filter(
                        zone =>
                            zone.contains(
                                listenerPosition
                            )
                    )
                    .sort(
                        (a, b) =>
                            b.priority -
                            a.priority
                    );

            const nextZone =
                inside[0] ||
                null;

            if (
                nextZone?.id !==
                this.activeZone?.id
            ) {
                const previous =
                    this.activeZone;

                if (previous) {
                    previous.inside = false;

                    this.emit(
                        "zone-exit",
                        {
                            zone:
                                previous
                        }
                    );
                }

                this.activeZone =
                    nextZone;

                if (nextZone) {
                    nextZone.inside = true;

                    this.emit(
                        "zone-enter",
                        {
                            zone:
                                nextZone
                        }
                    );
                }
            }

            const targetLowpass =
                nextZone
                    ? nextZone.lowpassHz
                    : this
                        .defaultLowpassHz;

            const targetGain =
                nextZone
                    ? nextZone.masterGain
                    : this
                        .defaultMasterGain;

            const speed =
                nextZone
                    ? nextZone
                        .transitionSpeed
                    : 5;

            const alpha =
                1 -
                Math.exp(
                    -Math.max(
                        0.0001,
                        speed
                    ) *
                    Math.max(
                        0,
                        delta
                    )
                );

            this._zoneCurrentLowpass +=
                (
                    targetLowpass -
                    this
                        ._zoneCurrentLowpass
                ) *
                alpha;

            this._zoneCurrentGain +=
                (
                    targetGain -
                    this
                        ._zoneCurrentGain
                ) *
                alpha;

            const now =
                Number(
                    this.listenerManager
                        .context
                        ?.currentTime ||
                    0
                );

            try {
                this.masterFilter
                    .frequency
                    .setTargetAtTime(
                        this
                            ._zoneCurrentLowpass,
                        now,
                        0.018
                    );
            } catch (_) {
                this.masterFilter
                    .frequency
                    .value =
                    this
                        ._zoneCurrentLowpass;
            }

            this.masterBus
                .setVolume(
                    this
                        ._zoneCurrentGain
                );
        }

        serialize() {
            return {
                format:
                    "SM_AUDIO_ENGINE",
                version: 1,

                listenerMode:
                    this.listenerManager
                        .mode,

                buses:
                    [...this.buses.values()]
                        .map(
                            bus =>
                                bus.serialize()
                        ),

                assets:
                    this.assets
                        .serialize(),

                sources:
                    [...this.sources.values()]
                        .map(
                            source =>
                                source.serialize()
                        ),

                zones:
                    [...this.zones.values()]
                        .map(
                            zone =>
                                zone.serialize()
                        )
            };
        }

        restoreSourceObjectLinks() {
            this.sources.forEach(
                source => {
                    if (
                        source.object ||
                        !source.objectUuid
                    ) {
                        return;
                    }

                    const object =
                        window.scene
                            ?.getObjectByProperty?.(
                                "uuid",
                                source
                                    .objectUuid
                            );

                    if (object) {
                        source.attachToObject(
                            object
                        );
                    }
                }
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
                    `sm:audio-${type}`,
                    { detail }
                )
            );
        }

        dispose() {
            this.stopAll();

            [...this.sources.keys()]
                .forEach(
                    id =>
                        this.removeSource(
                            id
                        )
                );

            this.viewportHelper
                ?.dispose?.();

            if (
                this._fallbackRaf
            ) {
                cancelAnimationFrame(
                    this._fallbackRaf
                );

                this._fallbackRaf = 0;
            }

            if (
                this._frameCallback &&
                Array.isArray(
                    window.engineFrameCallbacks
                )
            ) {
                const index =
                    window.engineFrameCallbacks
                        .indexOf(
                            this
                                ._frameCallback
                        );

                if (index >= 0) {
                    window.engineFrameCallbacks
                        .splice(
                            index,
                            1
                        );
                }
            }

            this.initialized = false;
        }
    }

    window.SMAudioSystem =
        SMAudioSystem;

    window.smAudioSystem =
        window.smAudioSystem ||
        new SMAudioSystem();

    const boot = () => {
        try {
            window.smAudioSystem.init({
                camera:
                    window.camera ||
                    null
            });
        } catch (error) {
            console.warn(
                "[SMAudioSystem] Deferred init:",
                error
            );
        }
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
})();