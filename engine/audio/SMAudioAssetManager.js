// engine/audio/SMAudioAssetManager.js
// Shared decoded-audio asset cache for SM Engine.

(() => {
    "use strict";

    class SMAudioAssetManager {
        constructor(contextProvider = null) {
            this.contextProvider = contextProvider;

            this.assets = new Map();
            this.pending = new Map();

            this.events = new EventTarget();
        }

        setContextProvider(provider) {
            this.contextProvider = provider;
        }

        getContext() {
            if (typeof this.contextProvider === "function") {
                return this.contextProvider();
            }

            return (
                window.smAudioSystem
                    ?.listenerManager
                    ?.context ||
                null
            );
        }

        get(id) {
            return this.assets.get(id) || null;
        }

        has(id) {
            return this.assets.has(id);
        }

        list() {
            return [...this.assets.values()];
        }

        async load(
            fileOrUrl,
            {
                id = null,
                name = null,
                assetRef = null,
                tags = []
            } = {}
        ) {
            const context = this.getContext();

            if (!context) {
                throw new Error(
                    "SMAudioAssetManager: AudioContext is unavailable."
                );
            }

            const inferredId =
                id ||
                this.makeId(
                    typeof fileOrUrl === "string"
                        ? fileOrUrl
                        : fileOrUrl?.name || "audio"
                );

            if (this.assets.has(inferredId)) {
                return this.assets.get(inferredId);
            }

            if (this.pending.has(inferredId)) {
                return this.pending.get(inferredId);
            }

            const job = (async () => {
                let arrayBuffer;
                let source = null;
                let sourceKind = "memory";

                if (
                    typeof File !== "undefined" &&
                    fileOrUrl instanceof File
                ) {
                    arrayBuffer = await fileOrUrl.arrayBuffer();
                    sourceKind = "file";
                } else if (
                    typeof Blob !== "undefined" &&
                    fileOrUrl instanceof Blob
                ) {
                    arrayBuffer = await fileOrUrl.arrayBuffer();
                    sourceKind = "blob";
                } else if (typeof fileOrUrl === "string") {
                    source = fileOrUrl;
                    sourceKind = "url";

                    const response = await fetch(fileOrUrl);

                    if (!response.ok) {
                        throw new Error(
                            `Audio fetch failed: ${response.status} ${response.statusText}`
                        );
                    }

                    arrayBuffer = await response.arrayBuffer();
                } else if (fileOrUrl instanceof ArrayBuffer) {
                    arrayBuffer = fileOrUrl.slice(0);
                    sourceKind = "array-buffer";
                } else {
                    throw new TypeError(
                        "SMAudioAssetManager.load expects File, Blob, URL, or ArrayBuffer."
                    );
                }

                const decoded =
                    await context.decodeAudioData(
                        arrayBuffer.slice(0)
                    );

                return this.registerDecodedBuffer(
                    inferredId,
                    decoded,
                    {
                        name:
                            name ||
                            fileOrUrl?.name ||
                            (
                                typeof fileOrUrl === "string"
                                    ? fileOrUrl.split("/").pop()
                                    : null
                            ) ||
                            inferredId,
                        source,
                        sourceKind,
                        assetRef,
                        tags
                    }
                );
            })();

            this.pending.set(inferredId, job);

            try {
                return await job;
            } finally {
                this.pending.delete(inferredId);
            }
        }

        registerDecodedBuffer(
            id,
            buffer,
            {
                name = null,
                source = null,
                sourceKind = "decoded",
                assetRef = null,
                tags = []
            } = {}
        ) {
            if (!id || !buffer) return null;

            const descriptor = {
                id,
                name: name || id,
                buffer,
                duration: Number(buffer.duration || 0),
                channels: Number(buffer.numberOfChannels || 0),
                sampleRate: Number(buffer.sampleRate || 0),
                source,
                sourceKind,
                assetRef,
                tags: Array.isArray(tags) ? [...tags] : [],
                createdAt: Date.now()
            };

            this.assets.set(id, descriptor);

            this.emit("asset-added", descriptor);

            return descriptor;
        }

        remove(id) {
            const asset = this.assets.get(id);

            if (!asset) return false;

            this.assets.delete(id);

            this.emit("asset-removed", asset);

            return true;
        }

        clear() {
            this.assets.clear();
            this.pending.clear();

            this.emit("clear", null);
        }

        serialize() {
            return this.list().map(asset => ({
                id: asset.id,
                name: asset.name,
                duration: asset.duration,
                channels: asset.channels,
                sampleRate: asset.sampleRate,
                source: asset.source,
                sourceKind: asset.sourceKind,
                assetRef: asset.assetRef,
                tags: [...asset.tags]
            }));
        }

        makeId(value = "audio") {
            const safe =
                String(value)
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, "-")
                    .replace(/^-+|-+$/g, "")
                    .slice(0, 46) ||
                "audio";

            return `sm-audio-${safe}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
        }

        emit(type, payload) {
            const detail = {
                type,
                payload
            };

            this.events.dispatchEvent(
                new CustomEvent(type, { detail })
            );

            window.dispatchEvent(
                new CustomEvent(
                    `sm:audio-asset-${type}`,
                    { detail }
                )
            );
        }
    }

    window.SMAudioAssetManager =
        SMAudioAssetManager;
})();