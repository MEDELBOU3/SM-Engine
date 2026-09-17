// engine/audio/graph/SMMetaSoundRuntimeCompiler.js
// Runtime compiler for serialized SM MetaSound graphs.
//
// Compiles MetaSound nodes into WebAudio nodes and routes them through
// SMAudioSystem's 2D/3D endpoint + buses.

(() => {
    "use strict";

    class SMMetaSoundRuntimeInstance {
        constructor(
            compiler,
            {
                graph,
                actor = null,
                spatial = true,
                bus = "SFX",
                volume = 1,
                pitch = 1,
                refDistance = 5,
                maxDistance = 250,
                rolloffFactor = 1,
                distanceModel = "inverse"
            } = {}
        ) {
            this.compiler = compiler;
            this.engine =
                compiler.engine;

            this.graph =
                structuredClone(
                    graph || {}
                );

            this.actor = actor;

            this.spatial =
                spatial !== false;

            this.bus =
                bus || "SFX";

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

            this.endpoint = null;
            this.audioNodes =
                new Map();

            this.sourceNodes = [];
            this.started = false;
            this.disposed = false;

            this.id =
                `metasound-runtime-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
        }

        async build() {
            if (this.disposed) {
                throw new Error(
                    "MetaSound runtime instance is disposed."
                );
            }

            await this.engine.unlock();

            this.stop();

            this.endpoint =
                this.engine.createSource({
                    id:
                        `metasound-endpoint::${this.id}`,

                    name:
                        this.actor?.name ||
                        "MetaSound Runtime",

                    spatial:
                        this.spatial,

                    object:
                        this.actor ||
                        null,

                    bus:
                        this.bus,

                    volume:
                        this.volume,

                    pitch:
                        this.pitch,

                    refDistance:
                        this.refDistance,

                    maxDistance:
                        this.maxDistance,

                    rolloffFactor:
                        this.rolloffFactor,

                    distanceModel:
                        this.distanceModel
                });

            const nodes =
                Array.isArray(
                    this.graph.nodes
                )
                    ? this.graph.nodes
                    : [];

            for (const node of nodes) {
                const runtime =
                    await this.createNode(
                        node
                    );

                if (runtime) {
                    this.audioNodes.set(
                        node.id,
                        runtime
                    );
                }
            }

            const connections =
                Array.isArray(
                    this.graph.connections
                )
                    ? this.graph.connections
                    : [];

            for (const connection of connections) {
                this.connectGraphEdge(
                    connection
                );
            }

            this.connectOutput();

            return this;
        }

        async createNode(node) {
            const context =
                this.engine
                    .listenerManager
                    .context;

            if (!context || !node) {
                return null;
            }

            const data =
                node.data || {};

            const runtime = {
                id: node.id,
                type: node.type,
                node: null,
                input: null,
                output: null
            };

            switch (node.type) {
                case "oscillator": {
                    const oscillator =
                        context.createOscillator();

                    oscillator.type =
                        data.type ||
                        "sine";

                    oscillator.frequency.value =
                        Math.max(
                            1,
                            Number(
                                data.frequency
                            ) || 440
                        );

                    runtime.node =
                        oscillator;

                    runtime.output =
                        oscillator;

                    runtime.source =
                        oscillator;

                    this.sourceNodes.push(
                        oscillator
                    );

                    break;
                }

                case "wavePlayer": {
                    const source =
                        context.createBufferSource();

                    const asset =
                        await this.compiler
                            .resolveAudioAsset(
                                data
                            );

                    if (asset?.buffer) {
                        source.buffer =
                            asset.buffer;
                    }

                    source.loop =
                        !!data.loop;

                    source.playbackRate.value =
                        this.pitch *
                        Math.max(
                            0.01,
                            Number(
                                data.playRate
                            ) || 1
                        );

                    runtime.node =
                        source;

                    runtime.output =
                        source;

                    runtime.source =
                        source;

                    runtime.asset =
                        asset ||
                        null;

                    this.sourceNodes.push(
                        source
                    );

                    break;
                }

                case "gain": {
                    const gain =
                        context.createGain();

                    gain.gain.value =
                        data.gain !==
                        undefined
                            ? Number(
                                data.gain
                            )
                            : 1;

                    runtime.node =
                        gain;

                    runtime.input =
                        gain;

                    runtime.output =
                        gain;

                    break;
                }

                case "delay": {
                    const delay =
                        context.createDelay(
                            5
                        );

                    delay.delayTime.value =
                        Math.max(
                            0,
                            Number(
                                data.delayTime
                            ) || 0.3
                        );

                    runtime.node =
                        delay;

                    runtime.input =
                        delay;

                    runtime.output =
                        delay;

                    break;
                }

                case "filter": {
                    const filter =
                        context
                            .createBiquadFilter();

                    filter.type =
                        data.filterType ||
                        "lowpass";

                    filter.frequency.value =
                        Math.max(
                            20,
                            Number(
                                data.frequency
                            ) || 1000
                        );

                    runtime.node =
                        filter;

                    runtime.input =
                        filter;

                    runtime.output =
                        filter;

                    break;
                }

                case "output": {
                    const gain =
                        context.createGain();

                    gain.gain.value = 1;

                    runtime.node =
                        gain;

                    runtime.input =
                        gain;

                    runtime.output =
                        gain;

                    break;
                }

                default:
                    return null;
            }

            return runtime;
        }

        connectGraphEdge(
            connection
        ) {
            const from =
                this.audioNodes.get(
                    connection.from
                );

            const to =
                this.audioNodes.get(
                    connection.to
                );

            if (!from || !to) return;

            let output =
                from.output ||
                from.node;

            let input =
                to.input ||
                to.node;

            if (
                String(
                    connection.toSocket ||
                    ""
                ).includes("freq") &&
                to.node?.frequency
            ) {
                input =
                    to.node.frequency;
            }

            if (
                String(
                    connection.toSocket ||
                    ""
                ).includes("gain") &&
                to.node?.gain
            ) {
                input =
                    to.node.gain;
            }

            try {
                output?.connect?.(
                    input
                );
            } catch (error) {
                console.warn(
                    "[MetaSoundRuntime] Connection failed:",
                    connection,
                    error
                );
            }
        }

        connectOutput() {
            if (!this.endpoint?.audio) {
                return false;
            }

            const output =
                this.audioNodes.get(
                    "ms-node-output"
                ) ||
                [...this.audioNodes.values()]
                    .find(
                        node =>
                            node.type ===
                            "output"
                    );

            if (!output?.output) {
                console.warn(
                    "[MetaSoundRuntime] Graph has no Output node."
                );

                return false;
            }

            const endpointInput =
                this.endpoint.audio
                    .getOutput?.() ||
                this.endpoint.audio
                    .gain ||
                null;

            if (!endpointInput) {
                return false;
            }

            output.output.connect(
                endpointInput
            );

            return true;
        }

        async play() {
            if (this.disposed) {
                return false;
            }

            await this.build();

            const context =
                this.engine
                    .listenerManager
                    .context;

            for (
                const source of
                this.sourceNodes
            ) {
                try {
                    source.start(
                        context.currentTime
                    );
                } catch (error) {
                    console.debug(
                        "[MetaSoundRuntime] Source start skipped:",
                        error
                    );
                }
            }

            this.started = true;

            this.compiler.emit(
                "runtime-play",
                {
                    instance: this
                }
            );

            return true;
        }

        stop() {
            for (
                const source of
                this.sourceNodes
            ) {
                try {
                    source.stop();
                } catch (_) {}

                try {
                    source.disconnect();
                } catch (_) {}
            }

            for (
                const runtime of
                this.audioNodes.values()
            ) {
                try {
                    runtime.output
                        ?.disconnect?.();
                } catch (_) {}
            }

            this.sourceNodes = [];
            this.audioNodes.clear();

            if (this.endpoint) {
                this.engine.removeSource(
                    this.endpoint.id
                );

                this.endpoint = null;
            }

            this.started = false;
        }

        dispose() {
            this.stop();
            this.disposed = true;
        }
    }

    class SMMetaSoundRuntimeCompiler {
        constructor(
            engine = null
        ) {
            this.engine =
                engine ||
                window.smAudioSystem ||
                null;

            this.instances =
                new Map();

            this.events =
                new EventTarget();
        }

        setEngine(engine) {
            this.engine = engine;

            return this;
        }

        async resolveAudioAsset(
            nodeData = {}
        ) {
            if (!this.engine) {
                return null;
            }

            const directId =
                nodeData.assetId ||
                nodeData.audioAssetId ||
                null;

            if (
                directId &&
                this.engine.assets
                    .has(
                        directId
                    )
            ) {
                return this.engine
                    .assets.get(
                        directId
                    );
            }

            const name =
                nodeData.assetName ||
                null;

            if (name) {
                const byName =
                    this.engine.assets
                        .list()
                        .find(
                            asset =>
                                asset.name ===
                                name
                        );

                if (byName) {
                    return byName;
                }
            }

            if (
                directId &&
                window.AssetsPanel
            ) {
                const asset =
                    window.AssetsPanel
                        ._findById?.(
                            directId
                        );

                if (
                    asset?.type ===
                    "audio"
                ) {
                    return this.loadAssetsPanelAudio(
                        asset
                    );
                }
            }

            return null;
        }

        async loadAssetsPanelAudio(
            asset
        ) {
            if (!asset || !this.engine) {
                return null;
            }

            if (
                this.engine.assets.has(
                    asset.id
                )
            ) {
                return this.engine.assets.get(
                    asset.id
                );
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

            return this.engine.loadAsset(
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

        createInstance(
            graph,
            options = {}
        ) {
            if (!this.engine) {
                this.engine =
                    window.smAudioSystem ||
                    null;
            }

            if (!this.engine) {
                throw new Error(
                    "SMMetaSoundRuntimeCompiler requires SMAudioSystem."
                );
            }

            const instance =
                new SMMetaSoundRuntimeInstance(
                    this,
                    {
                        graph,
                        ...options
                    }
                );

            this.instances.set(
                instance.id,
                instance
            );

            return instance;
        }

        async playGraph(
            graph,
            options = {}
        ) {
            const instance =
                this.createInstance(
                    graph,
                    options
                );

            await instance.play();

            return instance;
        }

        stopInstance(id) {
            const instance =
                this.instances.get(
                    id
                );

            if (!instance) {
                return false;
            }

            instance.stop();

            return true;
        }

        disposeInstance(id) {
            const instance =
                this.instances.get(
                    id
                );

            if (!instance) {
                return false;
            }

            instance.dispose();

            this.instances.delete(id);

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
                    `sm:metasound-runtime-${type}`,
                    { detail }
                )
            );
        }
    }

    window.SMMetaSoundRuntimeInstance =
        SMMetaSoundRuntimeInstance;

    window.SMMetaSoundRuntimeCompiler =
        SMMetaSoundRuntimeCompiler;

    window.smMetaSoundRuntimeCompiler =
        window.smMetaSoundRuntimeCompiler ||
        new SMMetaSoundRuntimeCompiler(
            window.smAudioSystem ||
            null
        );

    window.addEventListener(
        "sm:audio-ready",
        () => {
            window.smMetaSoundRuntimeCompiler
                ?.setEngine?.(
                    window.smAudioSystem
                );
        }
    );
})();