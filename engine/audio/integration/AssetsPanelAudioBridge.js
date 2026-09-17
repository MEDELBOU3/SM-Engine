// engine/audio/integration/AssetsPanelAudioBridge.js
// Unreal-like AssetsPanel audio workflow.
//
// Sound Wave (audio asset) dragged/double-clicked to viewport
// -> creates an SM Audio Actor.
//
// MetaSound asset dragged/double-clicked to viewport
// -> creates an Audio Actor whose runtime is compiled from the graph.
//
// Raw audio dragged into MetaSound canvas is handled by
// SMMetaSoundAssetBridge.

(() => {
    "use strict";

    class AssetsPanelAudioBridge {
        constructor() {
            this.installed = false;

            this.originalAddToScene =
                null;

            this.originalAddAssetFromFile =
                null;

            this.actorRuntime =
                new Map();

            this.events =
                new EventTarget();
        }

        install() {
            if (this.installed) {
                return true;
            }

            const AP =
                window.AssetsPanel;

            if (
                !AP ||
                !window.smAudioSystem ||
                !window.SMAudioSceneActor
            ) {
                setTimeout(
                    () => this.install(),
                    120
                );

                return false;
            }

            this.installed = true;

            this.patchAddToScene(AP);
            this.patchMetaSoundImport(AP);

            console.log(
                "✅ AssetsPanel Audio Bridge ready"
            );

            return true;
        }

        patchAddToScene(AP) {
            if (
                AP._addToScene
                    ?.__smAudioBridgeWrapped
            ) {
                return;
            }

            this.originalAddToScene =
                AP._addToScene
                    ?.bind(
                        AP
                    );

            const bridge = this;

            const wrapped =
                async function(
                    assetId,
                    event = null,
                    options = {}
                ) {
                    const asset =
                        this._findById?.(
                            assetId
                        );

                    if (
                        asset?.type ===
                        "audio"
                    ) {
                        return bridge
                            .addSoundWaveToScene(
                                asset,
                                event,
                                options
                            );
                    }

                    if (
                        asset?.type ===
                        "metasound"
                    ) {
                        return bridge
                            .addMetaSoundToScene(
                                asset,
                                event,
                                options
                            );
                    }

                    return bridge
                        .originalAddToScene?.(
                            assetId,
                            event,
                            options
                        );
                };

            wrapped.__smAudioBridgeWrapped =
                true;

            AP._addToScene =
                wrapped;
        }

        patchMetaSoundImport(AP) {
            if (
                AP._addAssetFromFile
                    ?.__smMetaSoundImportWrapped
            ) {
                return;
            }

            this.originalAddAssetFromFile =
                AP._addAssetFromFile
                    ?.bind(
                        AP
                    );

            const bridge = this;

            const wrapped =
                async function(
                    file,
                    folderId = null
                ) {
                    if (
                        /\.(smetaudio|metasound)$/i.test(
                            file?.name ||
                            ""
                        )
                    ) {
                        return bridge
                            .importMetaSoundFile(
                                file,
                                folderId
                            );
                    }

                    return bridge
                        .originalAddAssetFromFile?.(
                            file,
                            folderId
                        );
                };

            wrapped.__smMetaSoundImportWrapped =
                true;

            AP._addAssetFromFile =
                wrapped;
        }

        async loadSoundWaveAsset(
            asset
        ) {
            const engine =
                window.smAudioSystem;

            if (
                engine.assets.has(
                    asset.id
                )
            ) {
                return engine.assets.get(
                    asset.id
                );
            }

            const AP =
                window.AssetsPanel;

            const source =
                AP?._getAssetSourceUrl?.(
                    asset
                ) ||
                asset.url ||
                asset.data ||
                null;

            if (!source) {
                throw new Error(
                    `Audio asset "${asset.name}" has no source.`
                );
            }

            return engine.loadAsset(
                source,
                {
                    id: asset.id,
                    name: asset.name,
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

        resolveDropPosition(
            event
        ) {
            const AP =
                window.AssetsPanel;

            try {
                const value =
                    AP?._resolveDropPosition?.(
                        event
                    );

                if (value?.isVector3) {
                    return value.clone();
                }
            } catch (_) {}

            const camera =
                window
                    .getActiveViewportCamera
                    ?.() ||
                window.camera ||
                null;

            if (camera) {
                const direction =
                    new THREE.Vector3();

                camera.getWorldDirection(
                    direction
                );

                return camera.position
                    .clone()
                    .add(
                        direction
                            .multiplyScalar(
                                4
                            )
                    );
            }

            return new THREE.Vector3();
        }

        addActorToScene(
            actor,
            event
        ) {
            actor.position.copy(
                this.resolveDropPosition(
                    event
                )
            );

            if (
                typeof window
                    .addObjectToScene ===
                "function"
            ) {
                window.addObjectToScene(
                    actor,
                    actor.name
                );
            } else {
                window.scene?.add(
                    actor
                );
            }

            window.selectedObject =
                actor;

            window.SelectionManager
                ?.select?.(
                    actor
                );

            window.updateHierarchy?.();

            return actor;
        }

        async addSoundWaveToScene(
            asset,
            event = null,
            options = {}
        ) {
            /*
             * EDITOR BEHAVIOR:
             * - Create Audio Actor only.
             * - DO NOT play audio on drop.
             * - DO NOT create a second runtime source here.
             *
             * SMAudioSceneRuntime is the single owner of runtime playback.
             * It restores the source and starts it when Game Play begins.
             */
            const decoded =
                await this
                    .loadSoundWaveAsset(
                        asset
                    );

            if (!decoded) {
                return null;
            }

            const componentConfig = {
                name:
                    options.name ||
                    asset.name
                        .replace(
                            /\.[^.]+$/,
                            ""
                        ),

                assetId:
                    asset.id,

                sourceType:
                    "sound-wave",

                spatial:
                    options.spatial !==
                    false,

                bus:
                    options.bus ||
                    "SFX",

                volume:
                    options.volume ??
                    1,

                pitch:
                    options.pitch ??
                    1,

                loop:
                    options.loop ??
                    false,

                /*
                 * Unreal-like Auto Activate:
                 * true means "start when entering game/runtime",
                 * NOT "play immediately in the editor".
                 */
                playOnStart:
                    options.playOnStart !==
                    false,

                refDistance:
                    options.refDistance ??
                    5,

                maxDistance:
                    options.maxDistance ??
                    250,

                rolloffFactor:
                    options.rolloffFactor ??
                    1,

                distanceModel:
                    options.distanceModel ||
                    "inverse"
            };

            const actor =
                SMAudioSceneActor.create(
                    componentConfig
                );

            actor.userData
                .assetsPanelAudioAssetId =
                asset.id;

            this.addActorToScene(
                actor,
                event
            );

            /*
             * Prepare runtime silently.
             * ensureActor() creates/binds the source but DOES NOT play it.
             */
            if (
                window.smAudioSceneRuntime
                    ?.ensureActor
            ) {
                try {
                    await window
                        .smAudioSceneRuntime
                        .ensureActor(
                            actor
                        );
                } catch (error) {
                    console.warn(
                        "[AssetsPanelAudioBridge] Audio actor runtime prepare failed:",
                        error
                    );
                }
            } else {
                window.smAudioSceneRuntime
                    ?.scheduleScan?.();
            }

            /*
             * Explicit editor preview remains possible, but it is opt-in.
             * Normal drag/drop NEVER plays.
             */
            if (
                options.previewOnDrop ===
                true
            ) {
                await window
                    .smAudioSceneRuntime
                    ?.previewActor?.(
                        actor
                    );
            }

            this.actorRuntime.set(
                actor.uuid,
                {
                    type:
                        "sound-wave",
                    actor,
                    assetId:
                        asset.id,
                    ownedBySceneRuntime:
                        true
                }
            );

            this.emit(
                "sound-wave-actor-created",
                {
                    asset,
                    actor
                }
            );

            return actor;
        }

        async addMetaSoundToScene(
            asset,
            event = null,
            options = {}
        ) {
            const graph =
                asset.definition ||
                this.parseGraph(
                    asset.data
                );

            if (!graph) {
                console.error(
                    `MetaSound asset "${asset.name}" has invalid graph data.`
                );

                return null;
            }

            const actor =
                SMAudioSceneActor.create({
                    name:
                        options.name ||
                        asset.name
                            .replace(
                                /\.smetaudio$/i,
                                ""
                            ),

                    metaSoundAssetId:
                        asset.id,

                    sourceType:
                        "metasound",

                    spatial:
                        options.spatial !==
                        false,

                    bus:
                        options.bus ||
                        "SFX",

                    volume:
                        options.volume ??
                        1,

                    pitch:
                        options.pitch ??
                        1,

                    loop:
                        false,

                    /*
                     * Auto Activate in GAME PLAY only.
                     */
                    playOnStart:
                        options.playOnStart !==
                        false,

                    refDistance:
                        options.refDistance ??
                        5,

                    maxDistance:
                        options.maxDistance ??
                        250,

                    rolloffFactor:
                        options.rolloffFactor ??
                        1,

                    distanceModel:
                        options.distanceModel ||
                        "inverse"
                });

            actor.userData
                .assetsPanelMetaSoundAssetId =
                asset.id;

            this.addActorToScene(
                actor,
                event
            );

            /*
             * SceneRuntime owns compiler instances too.
             * Prepare silently; do not start graph in editor.
             */
            if (
                window.smAudioSceneRuntime
                    ?.ensureActor
            ) {
                try {
                    await window
                        .smAudioSceneRuntime
                        .ensureActor(
                            actor
                        );
                } catch (error) {
                    console.warn(
                        "[AssetsPanelAudioBridge] MetaSound runtime prepare failed:",
                        error
                    );
                }
            } else {
                window.smAudioSceneRuntime
                    ?.scheduleScan?.();
            }

            if (
                options.previewOnDrop ===
                true
            ) {
                await window
                    .smAudioSceneRuntime
                    ?.previewActor?.(
                        actor
                    );
            }

            this.actorRuntime.set(
                actor.uuid,
                {
                    type:
                        "metasound",
                    actor,
                    assetId:
                        asset.id,
                    ownedBySceneRuntime:
                        true
                }
            );

            this.emit(
                "metasound-actor-created",
                {
                    asset,
                    actor
                }
            );

            return actor;
        }

        async openAssetInMetaSound(
            assetOrId
        ) {
            const AP =
                window.AssetsPanel;

            const asset =
                typeof assetOrId ===
                "string"
                    ? AP?._findById?.(
                        assetOrId
                    )
                    : assetOrId;

            if (!asset) return false;

            if (
                asset.type ===
                "audio"
            ) {
                return window
                    .smMetaSoundAssetBridge
                    ?.openAudioAssetInMetaSound?.(
                        asset
                    );
            }

            if (
                asset.type ===
                "metasound"
            ) {
                return window
                    .smMetaSoundAssetBridge
                    ?.openGraphAsset?.(
                        asset
                    );
            }

            return false;
        }

        async importMetaSoundFile(
            file,
            folderId = null
        ) {
            const AP =
                window.AssetsPanel;

            if (!AP || !file) {
                return null;
            }

            let graph;

            try {
                graph =
                    JSON.parse(
                        await file.text()
                    );
            } catch (error) {
                console.error(
                    `Could not import MetaSound "${file.name}".`,
                    error
                );

                return null;
            }

            if (
                graph?.format !==
                "SM_METASOUND_GRAPH"
            ) {
                console.warn(
                    `"${file.name}" is not an SM MetaSound graph.`
                );
            }

            const asset =
                window
                    .smMetaSoundAssetBridge
                    ?.createGraphAsset?.(
                        file.name
                            .replace(
                                /\.(smetaudio|metasound)$/i,
                                ""
                            ),
                        graph,
                        folderId
                    );

            return asset ||
                null;
        }

        playActor(
            actorOrUuid
        ) {
            return window
                .smAudioSceneRuntime
                ?.previewActor?.(
                    actorOrUuid
                ) ||
                false;
        }

        stopActor(
            actorOrUuid
        ) {
            return window
                .smAudioSceneRuntime
                ?.stopActor?.(
                    actorOrUuid
                ) ||
                false;
        }

        parseGraph(data) {
            if (
                data &&
                typeof data ===
                "object"
            ) {
                return data;
            }

            try {
                return JSON.parse(
                    data ||
                    "{}"
                );
            } catch {
                return null;
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
                    `sm:assets-audio-${type}`,
                    { detail }
                )
            );
        }
    }

    window.AssetsPanelAudioBridge =
        AssetsPanelAudioBridge;

    window.assetsPanelAudioBridge =
        window.assetsPanelAudioBridge ||
        new AssetsPanelAudioBridge();

    const boot = () => {
        window.assetsPanelAudioBridge
            ?.install?.();
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