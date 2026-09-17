// engine/audio/SMAudioSceneRuntime.js
// Restores and manages scene Audio Actors after scene/project load.
//
// This file is intentionally engine-level. It does not own AssetsPanel UI.
// It reads SMAudioSceneActor-compatible userData and creates the correct
// SMAudioSource / MetaSound runtime when an Audio Actor already exists in scene.

(() => {
    "use strict";

    class SMAudioSceneRuntime {
        constructor() {
            this.initialized = false;

            this.records = new Map();

            this.scanTimer = 0;
            this.events = new EventTarget();

            this.runtimeActive = false;
        }

        init() {
            if (this.initialized) {
                this.scheduleScan();
                return true;
            }

            if (
                !window.smAudioSystem ||
                !window.SMAudioSceneActor
            ) {
                setTimeout(
                    () => this.init(),
                    120
                );

                return false;
            }

            this.initialized = true;

            this.bindEvents();
            this.scheduleScan();

            console.log(
                "✅ SM Audio Scene Runtime ready"
            );

            return true;
        }

        bindEvents() {
            const rescan = () =>
                this.scheduleScan();

            [
                "sm:project-loaded",
                "sm:scene-loaded",
                "sm:audio-ready",
                "sm-assets-panel-ui-ready"
            ].forEach(
                eventName =>
                    window.addEventListener(
                        eventName,
                        rescan
                    )
            );

            const runtimeStart = () => {
                this.enterPlayMode();
            };

            const runtimeStop = () => {
                this.exitPlayMode();
            };

            /*
             * Support the common event names used by different SM Engine
             * workspaces. Only one needs to fire.
             */
            [
                "sm:gameplay-start",
                "sm:play-mode-start",
                "sm:runtime-start",
                "sm:game-start",
                "gameplayStarted",
                "gameStarted",
                "playModeStarted"
            ].forEach(
                eventName =>
                    window.addEventListener(
                        eventName,
                        runtimeStart
                    )
            );

            [
                "sm:gameplay-stop",
                "sm:play-mode-stop",
                "sm:runtime-stop",
                "sm:game-stop",
                "gameplayStopped",
                "gameStopped",
                "playModeStopped"
            ].forEach(
                eventName =>
                    window.addEventListener(
                        eventName,
                        runtimeStop
                    )
            );

            /*
             * Explicit bridge events are useful if the existing Play button
             * does not dispatch one of the events above.
             */
            window.addEventListener(
                "sm:audio-enter-play-mode",
                runtimeStart
            );

            window.addEventListener(
                "sm:audio-exit-play-mode",
                runtimeStop
            );

            /*
             * GamePlayOrchestrator's real Play-In-Editor events.
             * This makes audio work even when another integration path calls
             * start/stop without the aliases above.
             */
            window.addEventListener(
                "sm:pie-start",
                event => {
                    const camera =
                        event.detail?.camera ||
                        window._gameRenderCamera ||
                        window.gameCamera ||
                        null;

                    if (camera?.isCamera) {
                        window.smAudioSystem
                            ?.setRuntimeCamera?.(
                                camera
                            );
                    }

                    this.enterPlayMode();
                }
            );

            window.addEventListener(
                "sm:pie-stop",
                () => {
                    this.exitPlayMode();
                }
            );
        }

        async enterPlayMode() {
            /*
             * Make sure WebAudio is running. The orchestrator also does this
             * synchronously on the Play button user gesture.
             */
            try {
                await window.smAudioSystem
                    ?.unlock?.();
            } catch (error) {
                console.warn(
                    "[SMAudioSceneRuntime] AudioContext unlock failed:",
                    error
                );
            }

            if (
                window.smAudioSystem
                    ?.listenerManager
                    ?.runtimeCamera
            ) {
                window.smAudioSystem
                    .useRuntimeListener?.();
            }

            if (this.runtimeActive) {
                return true;
            }

            this.runtimeActive = true;

            const actors =
                await this.scanScene();

            console.log(
                "[SMAudioSceneRuntime] PIE audio scan:",
                {
                    actors:
                        actors.length,
                    records:
                        this.records.size,
                    contextState:
                        window.smAudioSystem
                            ?.listenerManager
                            ?.context
                            ?.state ||
                        null,
                    listenerCamera:
                        window.smAudioSystem
                            ?.listenerManager
                            ?.activeCamera
                            ?.name ||
                        null
                }
            );

            await this
                .playAutoStartActors();

            this.emit(
                "play-mode-enter",
                {
                    actorCount:
                        this.records.size
                }
            );

            return true;
        }

        exitPlayMode() {
            if (!this.runtimeActive) {
                this.stopAll();
                return true;
            }

            this.runtimeActive = false;

            this.stopAll();

            /*
             * Return listener to editor camera.
             */
            window.smAudioSystem
                ?.useEditorListener?.();

            this.emit(
                "play-mode-exit",
                {
                    actorCount:
                        this.records.size
                }
            );

            return true;
        }

        scheduleScan(delay = 80) {
            clearTimeout(
                this.scanTimer
            );

            this.scanTimer =
                setTimeout(
                    () =>
                        this.scanScene(),
                    delay
                );
        }

        async scanScene() {
            const scene =
                window.scene;

            if (!scene?.traverse) {
                return [];
            }

            const actors = [];

            scene.traverse(
                object => {
                    if (
                        window.SMAudioSceneActor
                            ?.isAudioActor?.(
                                object
                            )
                    ) {
                        actors.push(
                            object
                        );
                    }
                }
            );

            const alive =
                new Set(
                    actors.map(
                        actor =>
                            actor.uuid
                    )
                );

            for (
                const [
                    uuid,
                    record
                ] of this.records
            ) {
                if (
                    alive.has(uuid)
                ) {
                    continue;
                }

                this.disposeRecord(
                    record
                );

                this.records.delete(
                    uuid
                );
            }

            for (const actor of actors) {
                try {
                    await this.ensureActor(
                        actor
                    );
                } catch (error) {
                    console.warn(
                        `[SMAudioSceneRuntime] Failed to restore "${actor.name}":`,
                        error
                    );
                }
            }

            this.emit(
                "scan",
                {
                    count:
                        actors.length
                }
            );

            return actors;
        }

        async ensureActor(actor) {
            if (
                !window.SMAudioSceneActor
                    ?.isAudioActor?.(
                        actor
                    )
            ) {
                return null;
            }

            const component =
                window.SMAudioSceneActor
                    .getComponent(
                        actor
                    );

            if (!component) {
                return null;
            }

            const existing =
                this.records.get(
                    actor.uuid
                );

            if (
                existing &&
                this.recordMatchesComponent(
                    existing,
                    component
                )
            ) {
                return existing;
            }

            if (existing) {
                this.disposeRecord(
                    existing
                );

                this.records.delete(
                    actor.uuid
                );
            }

            if (
                component.sourceType ===
                "metasound"
            ) {
                return this
                    .createMetaSoundRecord(
                        actor,
                        component
                    );
            }

            return this
                .createSoundWaveRecord(
                    actor,
                    component
                );
        }

        recordMatchesComponent(
            record,
            component
        ) {
            if (!record || !component) {
                return false;
            }

            if (
                record.type !==
                component.sourceType
            ) {
                return false;
            }

            if (
                record.type ===
                "sound-wave"
            ) {
                return (
                    record.assetId ===
                    component.assetId
                );
            }

            if (
                record.type ===
                "metasound"
            ) {
                return (
                    record.assetId ===
                    component.metaSoundAssetId
                );
            }

            return false;
        }

        async resolveAssetsPanelAsset(
            assetId
        ) {
            if (!assetId) return null;

            const AP =
                window.AssetsPanel;

            if (!AP) return null;

            return (
                AP._findById?.(
                    assetId
                ) ||
                AP.assets?.find?.(
                    asset =>
                        asset.id ===
                        assetId
                ) ||
                null
            );
        }

        async ensureDecodedAudioAsset(
            assetId
        ) {
            const engine =
                window.smAudioSystem;

            if (!assetId || !engine) {
                return null;
            }

            if (
                engine.assets.has(
                    assetId
                )
            ) {
                return engine.assets.get(
                    assetId
                );
            }

            const asset =
                await this
                    .resolveAssetsPanelAsset(
                        assetId
                    );

            if (
                !asset ||
                asset.type !==
                "audio"
            ) {
                return null;
            }

            const source =
                window.AssetsPanel
                    ?._getAssetSourceUrl?.(
                        asset
                    ) ||
                asset.url ||
                asset.data ||
                null;

            if (!source) {
                return null;
            }

            return engine.loadAsset(
                source,
                {
                    id:
                        asset.id,
                    name:
                        asset.name,
                    assetRef: {
                        provider:
                            "AssetsPanel",
                        assetId:
                            asset.id
                    },
                    tags:
                        Array.isArray(
                            asset.tags
                        )
                            ? asset.tags
                            : []
                }
            );
        }

        async createSoundWaveRecord(
            actor,
            component
        ) {
            const decoded =
                await this
                    .ensureDecodedAudioAsset(
                        component.assetId
                    );

            if (!decoded) {
                console.warn(
                    `[SMAudioSceneRuntime] Sound Wave asset missing for "${actor.name}".`
                );

                return null;
            }

            const source =
                window.smAudioSystem
                    .createSource({
                        id:
                            `scene-audio::${actor.uuid}`,

                        name:
                            actor.name,

                        spatial:
                            component.spatial !==
                            false,

                        assetId:
                            decoded.id,

                        object:
                            actor,

                        bus:
                            component.bus ||
                            "SFX",

                        loop:
                            !!component.loop,

                        volume:
                            Number(
                                component.volume ??
                                1
                            ),

                        pitch:
                            Number(
                                component.pitch ??
                                1
                            ),

                        refDistance:
                            Number(
                                component.refDistance ??
                                5
                            ),

                        maxDistance:
                            Number(
                                component.maxDistance ??
                                250
                            ),

                        rolloffFactor:
                            Number(
                                component.rolloffFactor ??
                                1
                            ),

                        distanceModel:
                            component.distanceModel ||
                            "inverse"
                    });

            actor.userData
                .smAudioSourceId =
                source.id;

            const record = {
                type:
                    "sound-wave",
                actor,
                assetId:
                    component.assetId,
                source
            };

            this.records.set(
                actor.uuid,
                record
            );

            return record;
        }

        parseMetaSoundGraph(
            asset
        ) {
            if (!asset) return null;

            if (
                asset.definition &&
                typeof asset.definition ===
                "object"
            ) {
                return structuredClone(
                    asset.definition
                );
            }

            try {
                return JSON.parse(
                    asset.data ||
                    "{}"
                );
            } catch {
                return null;
            }
        }

        async createMetaSoundRecord(
            actor,
            component
        ) {
            const compiler =
                window
                    .smMetaSoundRuntimeCompiler;

            if (!compiler) {
                console.warn(
                    "[SMAudioSceneRuntime] MetaSound runtime compiler is not loaded."
                );

                return null;
            }

            const asset =
                await this
                    .resolveAssetsPanelAsset(
                        component
                            .metaSoundAssetId
                    );

            if (
                !asset ||
                asset.type !==
                "metasound"
            ) {
                console.warn(
                    `[SMAudioSceneRuntime] MetaSound asset missing for "${actor.name}".`
                );

                return null;
            }

            const graph =
                this.parseMetaSoundGraph(
                    asset
                );

            if (!graph) {
                return null;
            }

            const instance =
                compiler.createInstance(
                    graph,
                    {
                        actor,

                        spatial:
                            component.spatial !==
                            false,

                        bus:
                            component.bus ||
                            "SFX",

                        volume:
                            Number(
                                component.volume ??
                                1
                            ),

                        pitch:
                            Number(
                                component.pitch ??
                                1
                            ),

                        refDistance:
                            Number(
                                component.refDistance ??
                                5
                            ),

                        maxDistance:
                            Number(
                                component.maxDistance ??
                                250
                            ),

                        rolloffFactor:
                            Number(
                                component.rolloffFactor ??
                                1
                            ),

                        distanceModel:
                            component.distanceModel ||
                            "inverse"
                    }
                );

            actor.userData
                .smMetaSoundRuntimeId =
                instance.id;

            const record = {
                type:
                    "metasound",
                actor,
                assetId:
                    component
                        .metaSoundAssetId,
                instance
            };

            this.records.set(
                actor.uuid,
                record
            );

            return record;
        }

        async previewActor(
            actorOrUuid
        ) {
            const actor =
                this.resolveActor(
                    actorOrUuid
                );

            if (!actor) {
                return false;
            }

            const record =
                await this.ensureActor(
                    actor
                );

            if (!record) {
                return false;
            }

            if (
                record.type ===
                "sound-wave"
            ) {
                return record.source
                    ?.play?.();
            }

            if (
                record.type ===
                "metasound"
            ) {
                return record.instance
                    ?.play?.();
            }

            return false;
        }

        stopActor(
            actorOrUuid
        ) {
            const actor =
                this.resolveActor(
                    actorOrUuid
                );

            if (!actor) {
                return false;
            }

            const record =
                this.records.get(
                    actor.uuid
                );

            if (!record) {
                return false;
            }

            if (
                record.type ===
                "sound-wave"
            ) {
                record.source
                    ?.stop?.();

                return true;
            }

            if (
                record.type ===
                "metasound"
            ) {
                record.instance
                    ?.stop?.();

                return true;
            }

            return false;
        }

        async refreshActor(
            actorOrUuid
        ) {
            const actor =
                this.resolveActor(
                    actorOrUuid
                );

            if (!actor) {
                return null;
            }

            const current =
                this.records.get(
                    actor.uuid
                );

            if (current) {
                this.disposeRecord(
                    current
                );

                this.records.delete(
                    actor.uuid
                );
            }

            return this.ensureActor(
                actor
            );
        }

        async playAutoStartActors() {
            if (!this.runtimeActive) {
                return false;
            }

            for (
                const actor of
                this.getSceneActors()
            ) {
                const component =
                    window.SMAudioSceneActor
                        ?.getComponent?.(
                            actor
                        );

                if (
                    component
                        ?.playOnStart ===
                    false
                ) {
                    continue;
                }

                try {
                    const played =
                        await this.previewActor(
                            actor
                        );

                    if (!played) {
                        console.warn(
                            `[SMAudioSceneRuntime] "${actor.name}" did not start.`,
                            {
                                sourceType:
                                    component?.sourceType ||
                                    null,
                                assetId:
                                    component?.assetId ||
                                    component?.metaSoundAssetId ||
                                    null,
                                spatial:
                                    component?.spatial !== false,
                                volume:
                                    component?.volume,
                                bus:
                                    component?.bus
                            }
                        );
                    }
                } catch (error) {
                    console.warn(
                        `[SMAudioSceneRuntime] Auto-start failed for "${actor.name}":`,
                        error
                    );
                }
            }
        }

        getSceneActors() {
            const scene =
                window.scene;

            if (!scene?.traverse) {
                return [];
            }

            const result = [];

            scene.traverse(
                object => {
                    if (
                        window.SMAudioSceneActor
                            ?.isAudioActor?.(
                                object
                            )
                    ) {
                        result.push(
                            object
                        );
                    }
                }
            );

            return result;
        }

        resolveActor(
            actorOrUuid
        ) {
            if (
                actorOrUuid?.isObject3D
            ) {
                return actorOrUuid;
            }

            if (
                typeof actorOrUuid ===
                "string"
            ) {
                return window.scene
                    ?.getObjectByProperty?.(
                        "uuid",
                        actorOrUuid
                    ) ||
                    null;
            }

            return null;
        }

        stopAll() {
            this.records.forEach(
                record => {
                    if (
                        record.type ===
                        "sound-wave"
                    ) {
                        record.source
                            ?.stop?.();
                    }

                    if (
                        record.type ===
                        "metasound"
                    ) {
                        record.instance
                            ?.stop?.();
                    }
                }
            );
        }

        disposeRecord(record) {
            if (!record) return;

            if (
                record.type ===
                "sound-wave"
            ) {
                const id =
                    record.source?.id;

                if (id) {
                    window.smAudioSystem
                        ?.removeSource?.(
                            id
                        );
                }

                return;
            }

            if (
                record.type ===
                "metasound"
            ) {
                const instance =
                    record.instance;

                if (instance) {
                    window
                        .smMetaSoundRuntimeCompiler
                        ?.disposeInstance?.(
                            instance.id
                        );
                }
            }
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
                    `sm:audio-scene-${type}`,
                    { detail }
                )
            );
        }

        dispose() {
            clearTimeout(
                this.scanTimer
            );

            this.stopAll();

            this.records.forEach(
                record =>
                    this.disposeRecord(
                        record
                    )
            );

            this.records.clear();
            this.initialized = false;
        }
    }

    window.SMAudioSceneRuntime =
        SMAudioSceneRuntime;

    window.smAudioSceneRuntime =
        window.smAudioSceneRuntime ||
        new SMAudioSceneRuntime();

    /*
     * Simple integration API for the engine's existing Play / Stop buttons.
     *
     * If your gameplay system already dispatches sm:gameplay-start/stop,
     * you do not need to call these manually.
     */
    window.enterSMGameAudio =
        function () {
            return window
                .smAudioSceneRuntime
                ?.enterPlayMode?.();
        };

    window.exitSMGameAudio =
        function () {
            return window
                .smAudioSceneRuntime
                ?.exitPlayMode?.();
        };

    const boot = () => {
        window.smAudioSceneRuntime
            ?.init?.();
    };

    if (
        document.readyState ===
        "loading"
    ) {
        document.addEventListener(
            "DOMContentLoaded",
            () =>
                setTimeout(
                    boot,
                    0
                ),
            { once: true }
        );
    } else {
        setTimeout(
            boot,
            0
        );
    }

    window.addEventListener(
        "sm:audio-ready",
        boot
    );
})();