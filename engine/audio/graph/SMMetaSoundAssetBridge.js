// engine/audio/graph/SMMetaSoundAssetBridge.js
// Unreal-like AssetsPanel <-> MetaSound Editor asset workflow.
//
// Raw audio asset    = Sound Wave equivalent.
// MetaSound asset    = MetaSound Source/Graph equivalent.
//
// Features:
// - Drag audio from AssetsPanel into MetaSound canvas -> Wave Player node.
// - Save graph into AssetsPanel as a "metasound" asset.
// - Open MetaSound asset in Node Editor.
// - Preserve raw audio references inside the graph.

(() => {
    "use strict";

    class SMMetaSoundAssetBridge {
        constructor() {
            this.installed = false;

            this.activeGraphAssetId =
                null;

            this._dropBoundHost =
                null;

            this._toolbarPatched =
                false;

            this.events =
                new EventTarget();
        }

        install() {
            if (this.installed) {
                this.patchEditorUI();
                this.bindCanvasDrop();
                return true;
            }

            if (
                !window.AssetsPanel ||
                !window.MetaSoundEditor
            ) {
                setTimeout(
                    () => this.install(),
                    120
                );

                return false;
            }

            this.installed = true;

            this.patchEditorUI();
            this.bindCanvasDrop();
            this.patchMetaSoundVisibility();

            window.addEventListener(
                "sm:node-editor-tab-changed",
                event => {
                    if (
                        event.detail?.target ===
                        "sound-graph-wrapper"
                    ) {
                        requestAnimationFrame(
                            () => {
                                this.patchEditorUI();
                                this.bindCanvasDrop();
                            }
                        );
                    }
                }
            );

            window.addEventListener(
                "sm:metasound-graph-change",
                () => {
                    this.updateDirtyState(
                        true
                    );
                }
            );

            console.log(
                "✅ AssetsPanel ↔ MetaSound Asset Bridge ready"
            );

            return true;
        }

        getAP() {
            return window.AssetsPanel;
        }

        getEditor() {
            return window.MetaSoundEditor;
        }

        patchMetaSoundVisibility() {
            const editor =
                this.getEditor();

            if (!editor) return;

            if (
                editor.__smAssetsBridgeOnVisible
            ) {
                return;
            }

            editor.__smAssetsBridgeOnVisible =
                editor.onVisible
                    ?.bind(
                        editor
                    ) ||
                (() => {});

            editor.onVisible = (...args) => {
                const result =
                    editor
                        .__smAssetsBridgeOnVisible(
                            ...args
                        );

                requestAnimationFrame(
                    () => {
                        this.patchEditorUI();
                        this.bindCanvasDrop();
                    }
                );

                return result;
            };
        }

        patchEditorUI() {
            const editor =
                this.getEditor();

            const root =
                editor?.root;

            if (!root) return false;

            const toolbar =
                root.querySelector(
                    ".ms-toolbar"
                );

            if (!toolbar) return false;

            if (
                !toolbar.querySelector(
                    "#ms-save-asset-btn"
                )
            ) {
                const save =
                    document.createElement(
                        "button"
                    );

                save.id =
                    "ms-save-asset-btn";

                save.type =
                    "button";

                save.textContent =
                    "Save Asset";

                save.title =
                    "Save this MetaSound graph into AssetsPanel";

                const exportButton =
                    toolbar.querySelector(
                        "#ms-export-btn"
                    );

                toolbar.insertBefore(
                    save,
                    exportButton ||
                    null
                );

                save.addEventListener(
                    "click",
                    () =>
                        this.saveCurrentGraph()
                );
            }

            if (
                !toolbar.querySelector(
                    "#ms-current-asset-label"
                )
            ) {
                const label =
                    document.createElement(
                        "span"
                    );

                label.id =
                    "ms-current-asset-label";

                label.className =
                    "ms-current-asset-label";

                label.textContent =
                    "Untitled MetaSound";

                const spacer =
                    toolbar.querySelector(
                        ".ms-toolbar-spacer"
                    );

                toolbar.insertBefore(
                    label,
                    spacer ||
                    null
                );
            }

            this.updateAssetLabel();

            if (
                !document.getElementById(
                    "sm-metasound-assets-bridge-style"
                )
            ) {
                const style =
                    document.createElement(
                        "style"
                    );

                style.id =
                    "sm-metasound-assets-bridge-style";

                style.textContent = `
                    #sm-metasound-editor .ms-current-asset-label {
                        max-width:190px;
                        overflow:hidden;
                        text-overflow:ellipsis;
                        white-space:nowrap;
                        padding:0 6px;
                        color:#777;
                        font-size:7px;
                    }

                    #sm-metasound-editor .ms-current-asset-label.dirty::after {
                        content:" •";
                        color:#b79c67;
                    }

                    #sm-metasound-editor .ms-canvas-shell.ms-audio-asset-dragover {
                        box-shadow:
                            inset 0 0 0 2px
                            rgba(129,155,162,.62);
                    }

                    #sm-metasound-editor .ms-canvas-shell.ms-audio-asset-dragover::after {
                        content:"Drop Sound Wave → Create Wave Player";
                        position:sticky;
                        left:50%;
                        top:16px;
                        z-index:90;
                        display:block;
                        width:max-content;
                        transform:translateX(-50%);
                        padding:6px 9px;
                        background:#343a3c;
                        color:#b9c4c7;
                        font-size:8px;
                        pointer-events:none;
                    }
                `;

                document.head.appendChild(
                    style
                );
            }

            return true;
        }

        bindCanvasDrop() {
            const editor =
                this.getEditor();

            const canvas =
                editor?.canvas;

            if (!canvas) return false;

            if (
                canvas ===
                this._dropBoundHost
            ) {
                return true;
            }

            this._dropBoundHost =
                canvas;

            canvas.addEventListener(
                "dragover",
                event => {
                    const data =
                        this.readDragData(
                            event
                        );

                    if (
                        data?.assetType !==
                        "audio"
                    ) {
                        return;
                    }

                    event.preventDefault();

                    event.dataTransfer
                        .dropEffect =
                        "copy";

                    canvas.classList.add(
                        "ms-audio-asset-dragover"
                    );
                }
            );

            canvas.addEventListener(
                "dragleave",
                event => {
                    if (
                        !canvas.contains(
                            event.relatedTarget
                        )
                    ) {
                        canvas.classList.remove(
                            "ms-audio-asset-dragover"
                        );
                    }
                }
            );

            canvas.addEventListener(
                "drop",
                async event => {
                    canvas.classList.remove(
                        "ms-audio-asset-dragover"
                    );

                    const data =
                        this.readDragData(
                            event
                        );

                    if (
                        data?.assetType !==
                            "audio" ||
                        !data.assetId
                    ) {
                        return;
                    }

                    event.preventDefault();
                    event.stopPropagation();

                    const asset =
                        this.getAP()
                            ?._findById?.(
                                data.assetId
                            );

                    if (!asset) {
                        return;
                    }

                    await this.addAudioAssetNode(
                        asset,
                        event
                    );
                },
                true
            );

            return true;
        }

        readDragData(event) {
            try {
                const raw =
                    event.dataTransfer
                        ?.getData(
                            "application/json"
                        );

                if (!raw) return null;

                return JSON.parse(raw);
            } catch {
                return null;
            }
        }

        async ensureAudioAssetLoaded(
            asset
        ) {
            const engine =
                window.smAudioSystem;

            if (!engine || !asset) {
                return null;
            }

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
                this.getAP();

            const source =
                AP?._getAssetSourceUrl?.(
                    asset
                ) ||
                asset.url ||
                asset.data ||
                null;

            if (!source) {
                throw new Error(
                    `Audio asset "${asset.name}" has no runtime source.`
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

        async addAudioAssetNode(
            asset,
            dropEvent = null
        ) {
            if (
                !asset ||
                asset.type !==
                "audio"
            ) {
                return null;
            }

            const editor =
                this.getEditor();

            if (!editor?.root) {
                await this.openMetaSoundWorkspace();
            }

            const loaded =
                await this
                    .ensureAudioAssetLoaded(
                        asset
                    );

            if (!loaded) return null;

            /*
             * Make the existing MetaSound preview engine aware of this
             * AssetsPanel Sound Wave as well.
             */
            editor.soundAssets.set(
                asset.name,
                {
                    id: asset.id,
                    name: asset.name,
                    buffer:
                        loaded.buffer,
                    duration:
                        loaded.duration,
                    assetId:
                        asset.id
                }
            );

            editor.refreshAssetList?.();

            let x = 320;
            let y = 200;

            if (
                dropEvent &&
                editor.canvas
            ) {
                const rect =
                    editor.canvas
                        .getBoundingClientRect();

                x =
                    dropEvent.clientX -
                    rect.left +
                    editor.canvas
                        .scrollLeft -
                    70;

                y =
                    dropEvent.clientY -
                    rect.top +
                    editor.canvas
                        .scrollTop -
                    30;
            }

            const node =
                editor.addNode(
                    "wavePlayer",
                    {
                        x:
                            Math.max(
                                16,
                                x
                            ),

                        y:
                            Math.max(
                                16,
                                y
                            ),

                        data: {
                            assetId:
                                asset.id,
                            audioAssetId:
                                asset.id,
                            assetName:
                                asset.name,
                            loop:
                                false
                        }
                    }
                );

            if (node) {
                editor.renderNodeHTML?.(
                    node
                );

                editor.selectNode?.(
                    node
                );

                editor.redraw?.();

                this.updateDirtyState(
                    true
                );

                this.emit(
                    "sound-wave-node-added",
                    {
                        asset,
                        node
                    }
                );
            }

            return node;
        }

        async openAudioAssetInMetaSound(
            asset
        ) {
            await this
                .openMetaSoundWorkspace();

            return this
                .addAudioAssetNode(
                    asset
                );
        }

        async openMetaSoundWorkspace() {
            window.NodeEditorPanel
                ?.init?.();

            window.NodeEditorPanel
                ?.openTab?.(
                    "sound-graph-wrapper"
                );

            await new Promise(
                resolve =>
                    requestAnimationFrame(
                        () =>
                            requestAnimationFrame(
                                resolve
                            )
                    )
            );

            this.patchEditorUI();
            this.bindCanvasDrop();

            return !!this
                .getEditor()
                ?.root;
        }

        getDefaultFolderId() {
            const AP =
                this.getAP();

            if (!AP) return null;

            if (AP.openFolderId) {
                return AP.openFolderId;
            }

            const audioFolder =
                Object.values(
                    AP.folders ||
                    {}
                ).find(
                    folder =>
                        String(
                            folder.name ||
                            ""
                        ).toLowerCase() ===
                        "audio"
                );

            return (
                audioFolder?.id ||
                null
            );
        }

        makeMetaSoundThumbnail() {
            return `
                <svg class="svg-icon" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" stroke-width="1.5"
                    stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="5" cy="12" r="2"/>
                    <circle cx="12" cy="6" r="2"/>
                    <circle cx="19" cy="12" r="2"/>
                    <circle cx="12" cy="18" r="2"/>
                    <path d="M6.7 10.9 10.3 7.2M13.7 7.2l3.6 3.7M17.3 13.1l-3.6 3.7M10.3 16.8l-3.6-3.7"/>
                </svg>
            `;
        }

        collectGraphReferences(
            graph
        ) {
            const ids =
                new Set();

            (
                graph?.nodes ||
                []
            ).forEach(
                node => {
                    if (
                        node.type !==
                        "wavePlayer"
                    ) {
                        return;
                    }

                    const id =
                        node.data
                            ?.assetId ||
                        node.data
                            ?.audioAssetId;

                    if (id) {
                        ids.add(id);
                    }
                }
            );

            return [...ids];
        }

        createGraphAsset(
            name,
            graph,
            folderId = null
        ) {
            const AP =
                this.getAP();

            if (!AP) return null;

            const finalName =
                /\.smetaudio$/i.test(
                    name
                )
                    ? name
                    : `${name}.smetaudio`;

            const id =
                crypto.randomUUID
                    ? `metasound_${crypto.randomUUID()}`
                    : `metasound_${Date.now()}_${Math.floor(Math.random() * 100000)}`;

            const asset = {
                id,
                name:
                    finalName,
                type:
                    "metasound",
                data:
                    JSON.stringify(
                        graph
                    ),
                definition:
                    structuredClone(
                        graph
                    ),
                thumbnail:
                    this
                        .makeMetaSoundThumbnail(),
                isFavorite:
                    false,
                isBuiltIn:
                    false,
                folderId:
                    folderId ||
                    this
                        .getDefaultFolderId(),
                tags: [
                    "audio",
                    "metasound",
                    "sound-graph"
                ],
                history: [],
                references:
                    this
                        .collectGraphReferences(
                            graph
                        ),
                sourceType:
                    "metasound-graph",
                createdAt:
                    Date.now(),
                modifiedAt:
                    Date.now()
            };

            AP.assets.push(
                asset
            );

            AP._saveToStorage?.();

            AP.onAssetAdded?.(
                asset
            );

            AP.render?.();

            return asset;
        }

        updateGraphAsset(
            asset,
            graph
        ) {
            if (
                !asset ||
                asset.type !==
                "metasound"
            ) {
                return null;
            }

            asset.definition =
                structuredClone(
                    graph
                );

            asset.data =
                JSON.stringify(
                    graph
                );

            asset.references =
                this
                    .collectGraphReferences(
                        graph
                    );

            asset.modifiedAt =
                Date.now();

            const AP =
                this.getAP();

            AP?._saveToStorage?.();
            AP?.render?.();

            return asset;
        }

        async saveCurrentGraph() {
            const editor =
                this.getEditor();

            if (!editor) return null;

            const graph =
                editor.serialize();

            let asset =
                this.activeGraphAssetId
                    ? this.getAP()
                        ?._findById?.(
                            this
                                .activeGraphAssetId
                        )
                    : null;

            if (asset) {
                this.updateGraphAsset(
                    asset,
                    graph
                );
            } else {
                const requested =
                    window.prompt(
                        "MetaSound asset name:",
                        "NewMetaSound"
                    );

                if (!requested) {
                    return null;
                }

                asset =
                    this.createGraphAsset(
                        requested,
                        graph
                    );

                this.activeGraphAssetId =
                    asset?.id ||
                    null;
            }

            this.updateDirtyState(
                false
            );

            this.updateAssetLabel();

            this.emit(
                "graph-saved",
                {
                    asset,
                    graph
                }
            );

            return asset;
        }

        async openGraphAsset(
            assetOrId
        ) {
            const AP =
                this.getAP();

            const asset =
                typeof assetOrId ===
                "string"
                    ? AP?._findById?.(
                        assetOrId
                    )
                    : assetOrId;

            if (
                !asset ||
                asset.type !==
                "metasound"
            ) {
                return false;
            }

            await this
                .openMetaSoundWorkspace();

            let graph =
                asset.definition;

            if (!graph) {
                try {
                    graph =
                        JSON.parse(
                            asset.data ||
                            "{}"
                        );
                } catch {
                    graph = null;
                }
            }

            if (!graph) {
                return false;
            }

            /*
             * Preload referenced Sound Waves so Wave Player preview works.
             */
            for (
                const audioId of
                asset.references ||
                []
            ) {
                const audioAsset =
                    AP?._findById?.(
                        audioId
                    );

                if (
                    audioAsset?.type ===
                    "audio"
                ) {
                    try {
                        const loaded =
                            await this
                                .ensureAudioAssetLoaded(
                                    audioAsset
                                );

                        if (loaded) {
                            this.getEditor()
                                .soundAssets
                                .set(
                                    audioAsset.name,
                                    {
                                        id:
                                            audioAsset.id,
                                        name:
                                            audioAsset.name,
                                        buffer:
                                            loaded.buffer,
                                        duration:
                                            loaded.duration,
                                        assetId:
                                            audioAsset.id
                                    }
                                );
                        }
                    } catch (error) {
                        console.warn(
                            "[MetaSoundAssets] Referenced audio could not load:",
                            audioAsset.name,
                            error
                        );
                    }
                }
            }

            this.getEditor()
                .refreshAssetList?.();

            this.getEditor()
                .deserialize(
                    graph
                );

            this.activeGraphAssetId =
                asset.id;

            this.updateDirtyState(
                false
            );

            this.updateAssetLabel();

            this.emit(
                "graph-opened",
                {
                    asset
                }
            );

            return true;
        }

        updateDirtyState(
            dirty
        ) {
            const label =
                this.getEditor()
                    ?.root
                    ?.querySelector(
                        "#ms-current-asset-label"
                    );

            label?.classList.toggle(
                "dirty",
                !!dirty
            );
        }

        updateAssetLabel() {
            const editor =
                this.getEditor();

            const label =
                editor?.root
                    ?.querySelector(
                        "#ms-current-asset-label"
                    );

            if (!label) return;

            const asset =
                this.activeGraphAssetId
                    ? this.getAP()
                        ?._findById?.(
                            this
                                .activeGraphAssetId
                        )
                    : null;

            label.textContent =
                asset?.name ||
                "Untitled MetaSound";
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
                    `sm:metasound-assets-${type}`,
                    { detail }
                )
            );
        }
    }

    window.SMMetaSoundAssetBridge =
        SMMetaSoundAssetBridge;

    window.smMetaSoundAssetBridge =
        window.smMetaSoundAssetBridge ||
        new SMMetaSoundAssetBridge();

    const boot = () => {
        window.smMetaSoundAssetBridge
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