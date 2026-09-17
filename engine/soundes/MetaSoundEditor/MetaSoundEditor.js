// engine/soundes/MetaSoundEditor/MetaSoundEditor.js
// SM Engine MetaSound Editor — dockable WebAudio graph editor.
// FIXED: mounts itself into NodeEditorPanel instead of querying missing DOM at script load.

(() => {
    "use strict";

    class SMMetaSoundEditor {
        constructor() {
            this.host = null;
            this.root = null;

            this.audioCtx = null;
            this.masterAnalyser = null;
            this.audioNodeMap = new Map();
            this.activeSourceNodes = [];

            this.nodes = [];
            this.connections = [];
            this.soundAssets = new Map();

            this.draggedNode = null;
            this.activeWire = null;
            this.selectedNodeId = null;
            this.dragOffset = { x: 0, y: 0 };

            this.isPlaying = false;
            this.initialized = false;

            this.canvas = null;
            this.world = null;
            this.nodesArea = null;
            this.svgLayer = null;
            this.propPanel = null;
            this.ctxMenu = null;
            this.statusLabel = null;
            this.assetList = null;
            this.visualizerCanvas = null;

            this.resizeObserver = null;
            this.visualizerRaf = 0;

            this._idCounter = 0;
            this._styleId = "sm-metasound-editor-styles";
            this._boundKeydown = (event) => this.onKeyDown(event);
            this._boundDocumentClick = (event) => this.onDocumentClick(event);
        }

        init(host) {
            if (!host) {
                console.error("[MetaSoundEditor] Host element is missing.");
                return false;
            }

            if (this.initialized && this.host === host && this.root?.isConnected) {
                this.onVisible();
                return true;
            }

            this.disposeDOMOnly();

            this.host = host;
            this.injectStyles();
            this.buildDOM();
            this.cacheDOM();
            this.bindUI();

            if (!this.nodes.some(node => node.id === "ms-node-output")) {
                this.nodes.push({
                    id: "ms-node-output",
                    type: "output",
                    x: 1040,
                    y: 310,
                    data: {}
                });
            }

            this.renderAllNodes();
            this.refreshAssetList();
            this.renderPropertiesPlaceholder();
            this.syncAssetsFromEngine();

            this.initialized = true;

            requestAnimationFrame(() => {
                this.onVisible();
            });

            console.log("✅ MetaSoundEditor mounted");

            return true;
        }

        buildDOM() {
            this.host.innerHTML = `
                <div class="ms-editor-root" id="sm-metasound-editor">
                    <div class="ms-toolbar">
                        <div class="ms-toolbar-brand">
                            <span class="ms-badge">METASOUND</span>
                            <strong>Sound Graph</strong>
                        </div>

                        <div class="ms-toolbar-group">
                            <button type="button" data-ms-add="oscillator">Oscillator</button>
                            <button type="button" data-ms-add="wavePlayer">Wave Player</button>
                            <button type="button" data-ms-add="gain">Gain</button>
                            <button type="button" data-ms-add="filter">Filter</button>
                            <button type="button" data-ms-add="delay">Delay</button>
                        </div>

                        <div class="ms-toolbar-spacer"></div>

                        <button type="button" id="ms-play-btn" class="ms-transport-btn" title="Preview Graph">▶ Play</button>
                        <button type="button" id="ms-stop-btn" class="ms-transport-btn" title="Stop Preview">■ Stop</button>
                        <button type="button" id="ms-export-btn" title="Export graph data">Export</button>
                    </div>

                    <div class="ms-editor-main">
                        <aside class="ms-sidebar ms-assets-panel">
                            <div class="ms-panel-head">
                                <strong>Sound Assets</strong>
                                <button type="button" id="ms-import-sound-btn" title="Import Audio">+</button>
                            </div>

                            <input id="sound-file-upload" type="file" accept="audio/*" multiple hidden>

                            <div id="sound-asset-list" class="ms-asset-list"></div>

                            <div class="ms-sidebar-hint">
                                Import audio, then create a Wave Player node.
                            </div>
                        </aside>

                        <section class="ms-canvas-shell" id="ms-canvas-container">
                            <div class="ms-world" id="ms-world">
                                <div class="ms-grid"></div>

                                <svg
                                    id="ms-connections"
                                    class="ms-connections"
                                    xmlns="http://www.w3.org/2000/svg"
                                    width="1800"
                                    height="1000"
                                    viewBox="0 0 1800 1000"
                                    preserveAspectRatio="none"
                                ></svg>

                                <div id="ms-nodes-area" class="ms-nodes-area"></div>
                            </div>

                            <div id="ms-context-menu" class="ms-context-menu" hidden>
                                <button type="button" data-ms-context="delete">Delete Node</button>
                                <button type="button" data-ms-context="duplicate">Duplicate Node</button>
                            </div>
                        </section>

                        <aside class="ms-sidebar ms-properties-panel">
                            <div class="ms-panel-head">
                                <strong>Details</strong>
                            </div>

                            <div id="ms-properties" class="ms-properties"></div>
                        </aside>
                    </div>

                    <div class="ms-footer">
                        <span id="ms-status" class="ms-status">STOPPED</span>
                        <span class="ms-footer-copy">Realtime WebAudio Preview</span>
                        <div class="ms-footer-spacer"></div>
                        <canvas id="audio-visualizer" width="260" height="26"></canvas>
                    </div>
                </div>
            `;
        }

        cacheDOM() {
            const q = selector => this.root?.querySelector(selector) || null;

            this.root = this.host.querySelector("#sm-metasound-editor");

            this.canvas = q("#ms-canvas-container");
            this.world = q("#ms-world");
            this.nodesArea = q("#ms-nodes-area");
            this.svgLayer = q("#ms-connections");
            this.propPanel = q("#ms-properties");
            this.ctxMenu = q("#ms-context-menu");
            this.statusLabel = q("#ms-status");
            this.assetList = q("#sound-asset-list");
            this.visualizerCanvas = q("#audio-visualizer");
        }

        bindUI() {
            if (!this.root) return;

            this.root.addEventListener("click", event => {
                const addButton = event.target.closest("[data-ms-add]");

                if (addButton) {
                    this.addNode(addButton.dataset.msAdd);
                    return;
                }

                if (event.target.closest("#ms-play-btn")) {
                    this.playGraph();
                    return;
                }

                if (event.target.closest("#ms-stop-btn")) {
                    this.stopGraph();
                    return;
                }

                if (event.target.closest("#ms-export-btn")) {
                    this.exportCue();
                    return;
                }

                if (event.target.closest("#ms-import-sound-btn")) {
                    this.root.querySelector("#sound-file-upload")?.click();
                    return;
                }

                const contextAction = event.target.closest("[data-ms-context]");

                if (contextAction) {
                    const action = contextAction.dataset.msContext;

                    if (action === "delete") {
                        this.deleteSelectedNode();
                    }

                    if (action === "duplicate") {
                        this.duplicateSelectedNode();
                    }

                    this.hideContextMenu();
                    return;
                }

                if (
                    event.target === this.canvas ||
                    event.target.classList.contains("ms-grid") ||
                    event.target === this.world
                ) {
                    this.clearSelection();
                }
            });

            this.root
                .querySelector("#sound-file-upload")
                ?.addEventListener("change", event => {
                    this.handleAudioFiles(event.target.files);
                    event.target.value = "";
                });

            this.canvas?.addEventListener("contextmenu", event => {
                if (!event.target.closest(".ms-node")) {
                    event.preventDefault();
                    this.hideContextMenu();
                }
            });

            document.addEventListener("keydown", this._boundKeydown);
            document.addEventListener("click", this._boundDocumentClick);

            this.resizeObserver = new ResizeObserver(() => {
                this.redraw();
                this.resizeVisualizer();
            });

            this.resizeObserver.observe(this.host);
        }

        async initAudio() {
            if (this.audioCtx) {
                if (this.audioCtx.state === "suspended") {
                    try {
                        await this.audioCtx.resume();
                    } catch (_) {}
                }

                return this.audioCtx;
            }

            try {
                if (window.smAudioSystem) {
                    window.smAudioSystem.init?.();

                    const shared =
                        window.smAudioSystem.listenerManager?.context;

                    if (shared) {
                        this.audioCtx = shared;
                    }
                }
            } catch (error) {
                console.warn("[MetaSoundEditor] Could not use SMAudioSystem context:", error);
            }

            if (!this.audioCtx) {
                const AudioContextCtor =
                    window.AudioContext ||
                    window.webkitAudioContext;

                if (!AudioContextCtor) {
                    throw new Error("Web Audio API is unavailable.");
                }

                this.audioCtx = new AudioContextCtor();
            }

            if (this.audioCtx.state === "suspended") {
                try {
                    await this.audioCtx.resume();
                } catch (_) {}
            }

            this.setupVisualizer();

            return this.audioCtx;
        }

        getPreviewDestination() {
            const sfxBus =
                window.smAudioSystem?.getBus?.("SFX");

            if (
                sfxBus?.input &&
                sfxBus.input.context === this.audioCtx
            ) {
                return sfxBus.input;
            }

            return this.audioCtx?.destination || null;
        }

        async buildAndPlayGraph() {
            await this.initAudio();

            if (!this.audioCtx) return false;

            this.stopPlayback(false);

            this.audioNodeMap.clear();
            this.activeSourceNodes = [];

            for (const uiNode of this.nodes) {
                const audioObject =
                    this.createWebAudioInstance(
                        uiNode.type,
                        uiNode.data
                    );

                if (audioObject) {
                    this.audioNodeMap.set(uiNode.id, audioObject);
                }
            }

            for (const connection of this.connections) {
                const sourceObject =
                    this.audioNodeMap.get(connection.from);

                const destinationObject =
                    this.audioNodeMap.get(connection.to);

                if (!sourceObject || !destinationObject) continue;

                let output =
                    sourceObject.output ||
                    sourceObject.node;

                let input =
                    destinationObject.input ||
                    destinationObject.node;

                if (
                    connection.toSocket.includes("freq") &&
                    destinationObject.node?.frequency
                ) {
                    input = destinationObject.node.frequency;
                }

                if (
                    connection.toSocket.includes("gain") &&
                    destinationObject.node?.gain
                ) {
                    input = destinationObject.node.gain;
                }

                try {
                    output?.connect?.(input);

                    connection.svg?.classList.add("active-audio");
                } catch (error) {
                    console.warn("[MetaSoundEditor] Connection failed:", error);
                }
            }

            const outputObject =
                this.audioNodeMap.get("ms-node-output");

            const destination =
                this.getPreviewDestination();

            if (outputObject?.node && destination) {
                try {
                    outputObject.node.connect(destination);
                } catch (error) {
                    console.warn("[MetaSoundEditor] Output routing failed:", error);
                }

                if (this.masterAnalyser) {
                    try {
                        outputObject.node.connect(this.masterAnalyser);
                    } catch (_) {}
                }
            }

            for (const source of this.activeSourceNodes) {
                try {
                    source.start(this.audioCtx.currentTime);
                } catch (error) {
                    console.debug("[MetaSoundEditor] Source start skipped:", error);
                }
            }

            this.isPlaying = true;
            this.setStatus("PLAYING", true);
            this.root?.classList.add("playing-state");

            return true;
        }

        stopPlayback(updateStatus = true) {
            for (const node of this.activeSourceNodes) {
                try {
                    node.stop();
                } catch (_) {}

                try {
                    node.disconnect();
                } catch (_) {}
            }

            this.activeSourceNodes = [];
            this.isPlaying = false;

            for (const connection of this.connections) {
                connection.svg?.classList.remove("active-audio");
            }

            if (updateStatus) {
                this.setStatus("STOPPED", false);
            }

            this.root?.classList.remove("playing-state");
        }

        createWebAudioInstance(type, data = {}) {
            if (!this.audioCtx) return null;

            const object = {};

            switch (type) {
                case "oscillator": {
                    object.node = this.audioCtx.createOscillator();
                    object.node.type = data.type || "sine";
                    object.node.frequency.value =
                        Number(data.frequency) || 440;

                    object.output = object.node;

                    this.activeSourceNodes.push(object.node);
                    break;
                }

                case "wavePlayer": {
                    object.node = this.audioCtx.createBufferSource();

                    const asset =
                        this.soundAssets.get(data.assetName);

                    if (asset?.buffer) {
                        object.node.buffer = asset.buffer;
                    }

                    object.node.loop = !!data.loop;
                    object.output = object.node;

                    this.activeSourceNodes.push(object.node);
                    break;
                }

                case "gain": {
                    object.node = this.audioCtx.createGain();
                    object.node.gain.value =
                        data.gain !== undefined
                            ? Number(data.gain)
                            : 1;

                    object.input = object.node;
                    object.output = object.node;
                    break;
                }

                case "delay": {
                    object.node = this.audioCtx.createDelay(5);
                    object.node.delayTime.value =
                        Math.max(0, Number(data.delayTime) || 0.3);

                    object.input = object.node;
                    object.output = object.node;
                    break;
                }

                case "filter": {
                    object.node = this.audioCtx.createBiquadFilter();
                    object.node.type = data.filterType || "lowpass";
                    object.node.frequency.value =
                        Math.max(20, Number(data.frequency) || 1000);

                    object.input = object.node;
                    object.output = object.node;
                    break;
                }

                case "output": {
                    object.node = this.audioCtx.createGain();
                    object.input = object.node;
                    object.output = object.node;
                    break;
                }

                default:
                    return null;
            }

            return object;
        }

        addNode(type, options = {}) {
            const allowed =
                new Set([
                    "oscillator",
                    "wavePlayer",
                    "gain",
                    "delay",
                    "filter",
                    "output"
                ]);

            if (!allowed.has(type)) {
                console.warn("[MetaSoundEditor] Unknown node type:", type);
                return null;
            }

            if (type === "output" && this.nodes.some(node => node.type === "output")) {
                return this.nodes.find(node => node.type === "output");
            }

            this._idCounter += 1;

            const node = {
                id:
                    type === "output"
                        ? "ms-node-output"
                        : `ms-node-${type}-${Date.now().toString(36)}-${this._idCounter}`,
                type,
                x:
                    Number(options.x) ||
                    260 +
                        (this.nodes.length % 4) * 36,
                y:
                    Number(options.y) ||
                    180 +
                        (this.nodes.length % 6) * 42,
                data: {
                    frequency: 440,
                    gain: 1,
                    type: "sine",
                    filterType: "lowpass",
                    delayTime: 0.3,
                    loop: true,
                    assetName: "",
                    ...(options.data || {})
                }
            };

            this.nodes.push(node);
            this.renderNodeHTML(node);
            this.selectNode(node);

            this.dispatchGraphChanged("node-add", node);

            return node;
        }

        renderAllNodes() {
            if (!this.nodesArea || !this.svgLayer) return;

            this.nodesArea.innerHTML = "";
            this.svgLayer.innerHTML = "";

            for (const connection of this.connections) {
                connection.svg = this.createConnectionPath();
                this.svgLayer.appendChild(connection.svg);
            }

            for (const node of this.nodes) {
                this.renderNodeHTML(node);
            }

            requestAnimationFrame(() => this.redrawConnections());
        }

        renderNodeHTML(node) {
            if (!this.nodesArea) return;

            this.nodesArea
                .querySelector(`#${CSS.escape(node.id)}`)
                ?.remove();

            const element = document.createElement("div");

            element.className = `ms-node ms-node-${node.type}`;
            element.id = node.id;
            element.dataset.nodeId = node.id;
            element.style.left = `${node.x}px`;
            element.style.top = `${node.y}px`;

            const template = this.getNodeTemplate(node);

            element.innerHTML = `
                <div class="ms-node-header">
                    <span class="ms-node-type-dot"></span>
                    <strong>${this.escape(this.getNodeTitle(node.type))}</strong>
                    <span class="ms-node-id">${this.escape(node.type)}</span>
                </div>

                <div class="ms-node-body">
                    ${template}
                </div>
            `;

            element.addEventListener("pointerdown", event => {
                if (
                    event.target.closest(".ms-socket-input") ||
                    event.target.closest(".ms-socket-output")
                ) {
                    return;
                }

                this.startDragNode(event, element);
            });

            element.addEventListener("contextmenu", event => {
                event.preventDefault();
                event.stopPropagation();

                this.selectNode(node);
                this.showContextMenu(event);
            });

            element.addEventListener("click", event => {
                event.stopPropagation();
                this.selectNode(node);
            });

            element
                .querySelectorAll(".ms-socket-output")
                .forEach(socket => {
                    socket.addEventListener("pointerdown", event => {
                        this.startWire(
                            event,
                            node.id,
                            socket.dataset.socketId
                        );
                    });
                });

            element
                .querySelectorAll(".ms-socket-input")
                .forEach(socket => {
                    socket.addEventListener("pointerup", event => {
                        this.completeWire(
                            event,
                            node.id,
                            socket.dataset.socketId
                        );
                    });
                });

            this.nodesArea.appendChild(element);
        }

        getNodeTemplate(node) {
            const input = (name, label) => `
                <div class="ms-pin-row ms-pin-row-input">
                    <span
                        class="ms-socket-input"
                        data-socket-id="${node.id}-${name}"
                        title="${label}"
                    ></span>
                    <span>${label}</span>
                </div>
            `;

            const output = (name, label) => `
                <div class="ms-pin-row ms-pin-row-output">
                    <span>${label}</span>
                    <span
                        class="ms-socket-output"
                        data-socket-id="${node.id}-${name}"
                        title="${label}"
                    ></span>
                </div>
            `;

            switch (node.type) {
                case "oscillator":
                    return `
                        ${input("freq", "Frequency")}
                        ${output("out", "Audio")}
                    `;

                case "wavePlayer":
                    return `
                        <div class="ms-node-info">
                            ${this.escape(node.data.assetName || "No sound selected")}
                        </div>
                        ${output("out", "Audio")}
                    `;

                case "gain":
                    return `
                        ${input("in", "Audio")}
                        ${input("gain", "Gain Mod")}
                        ${output("out", "Audio")}
                    `;

                case "delay":
                    return `
                        ${input("in", "Audio")}
                        ${output("out", "Audio")}
                    `;

                case "filter":
                    return `
                        ${input("in", "Audio")}
                        ${input("freq", "Frequency")}
                        ${output("out", "Audio")}
                    `;

                case "output":
                    return `
                        ${input("in", "Audio")}
                        <div class="ms-node-info">Routes to SM Audio / SFX bus</div>
                    `;

                default:
                    return "";
            }
        }

        getNodeTitle(type) {
            const titles = {
                oscillator: "Oscillator",
                wavePlayer: "Wave Player",
                gain: "Gain",
                delay: "Delay",
                filter: "Filter",
                output: "Output"
            };

            return titles[type] || type;
        }

        createConnectionPath() {
            const path =
                document.createElementNS(
                    "http://www.w3.org/2000/svg",
                    "path"
                );

            path.classList.add("ms-connection-line");

            return path;
        }

        startWire(event, nodeId, socketId) {
            if (!this.world || !this.svgLayer) return;

            event.preventDefault();
            event.stopPropagation();

            const line = this.createConnectionPath();
            line.classList.add("preview-wire");

            this.svgLayer.appendChild(line);

            this.activeWire = {
                startNode: nodeId,
                startSocket: socketId,
                line
            };

            const move = moveEvent => this.dragWire(moveEvent);

            const up = () => {
                if (this.activeWire) {
                    this.activeWire.line?.remove();
                    this.activeWire = null;
                }

                window.removeEventListener("pointermove", move);
                window.removeEventListener("pointerup", up);
            };

            window.addEventListener("pointermove", move);
            window.addEventListener("pointerup", up, { once: true });
        }

        dragWire(event) {
            if (!this.activeWire || !this.world) return;

            const worldRect = this.world.getBoundingClientRect();

            const startElement =
                this.root.querySelector(
                    `[data-socket-id="${CSS.escape(this.activeWire.startSocket)}"]`
                );

            if (!startElement) return;

            const startRect = startElement.getBoundingClientRect();

            const x1 =
                startRect.left +
                startRect.width * 0.5 -
                worldRect.left;

            const y1 =
                startRect.top +
                startRect.height * 0.5 -
                worldRect.top;

            const x2 =
                event.clientX -
                worldRect.left;

            const y2 =
                event.clientY -
                worldRect.top;

            this.updateBezier(
                this.activeWire.line,
                x1,
                y1,
                x2,
                y2
            );
        }

        completeWire(event, nodeId, socketId) {
            if (!this.activeWire) return;

            event.preventDefault();
            event.stopPropagation();

            if (this.activeWire.startNode === nodeId) {
                return;
            }

            const existing =
                this.connections.find(connection =>
                    connection.fromSocket === this.activeWire.startSocket &&
                    connection.toSocket === socketId
                );

            if (existing) {
                this.activeWire.line?.remove();
                this.activeWire = null;
                return;
            }

            const connection = {
                id: `ms-conn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
                from: this.activeWire.startNode,
                fromSocket: this.activeWire.startSocket,
                to: nodeId,
                toSocket: socketId,
                svg: this.activeWire.line
            };

            connection.svg.classList.remove("preview-wire");

            this.connections.push(connection);
            this.activeWire = null;

            this.redrawConnections();

            if (this.isPlaying) {
                this.buildAndPlayGraph();
            }

            this.dispatchGraphChanged("connection-add", connection);
        }

        updateBezier(path, x1, y1, x2, y2) {
            if (!path) return;

            const distance =
                Math.max(
                    52,
                    Math.abs(x2 - x1) * 0.5
                );

            const cp1x = x1 + distance;
            const cp2x = x2 - distance;

            path.setAttribute(
                "d",
                `M ${x1} ${y1} C ${cp1x} ${y1}, ${cp2x} ${y2}, ${x2} ${y2}`
            );
        }

        redrawConnections() {
            if (!this.world) return;

            const worldRect =
                this.world.getBoundingClientRect();

            for (const connection of this.connections) {
                const source =
                    this.root.querySelector(
                        `[data-socket-id="${CSS.escape(connection.fromSocket)}"]`
                    );

                const destination =
                    this.root.querySelector(
                        `[data-socket-id="${CSS.escape(connection.toSocket)}"]`
                    );

                if (!source || !destination || !connection.svg) continue;

                const a = source.getBoundingClientRect();
                const b = destination.getBoundingClientRect();

                if (!a.width || !b.width) continue;

                this.updateBezier(
                    connection.svg,
                    a.left + a.width * 0.5 - worldRect.left,
                    a.top + a.height * 0.5 - worldRect.top,
                    b.left + b.width * 0.5 - worldRect.left,
                    b.top + b.height * 0.5 - worldRect.top
                );
            }
        }

        startDragNode(event, element) {
            if (!this.world) return;

            event.preventDefault();

            const node =
                this.nodes.find(item => item.id === element.id);

            if (!node) return;

            this.draggedNode = element;

            const rect = element.getBoundingClientRect();

            this.dragOffset = {
                x: event.clientX - rect.left,
                y: event.clientY - rect.top
            };

            this.selectNode(node);

            element.setPointerCapture?.(event.pointerId);

            const move = moveEvent => this.moveNode(moveEvent);

            const up = upEvent => {
                element.releasePointerCapture?.(upEvent.pointerId);

                window.removeEventListener("pointermove", move);
                window.removeEventListener("pointerup", up);

                this.draggedNode = null;
                this.dispatchGraphChanged("node-move", node);
            };

            window.addEventListener("pointermove", move);
            window.addEventListener("pointerup", up, { once: true });
        }

        moveNode(event) {
            if (!this.draggedNode || !this.world) return;

            const worldRect =
                this.world.getBoundingClientRect();

            const x =
                Math.max(
                    12,
                    Math.min(
                        1600,
                        event.clientX -
                            worldRect.left -
                            this.dragOffset.x
                    )
                );

            const y =
                Math.max(
                    12,
                    Math.min(
                        880,
                        event.clientY -
                            worldRect.top -
                            this.dragOffset.y
                    )
                );

            this.draggedNode.style.left = `${x}px`;
            this.draggedNode.style.top = `${y}px`;

            const node =
                this.nodes.find(item => item.id === this.draggedNode.id);

            if (node) {
                node.x = x;
                node.y = y;
            }

            this.redrawConnections();
        }

        selectNode(node) {
            if (!node) return;

            this.selectedNodeId = node.id;

            this.root
                ?.querySelectorAll(".ms-node")
                .forEach(element => {
                    element.classList.toggle(
                        "selected",
                        element.id === node.id
                    );
                });

            this.renderProperties(node);
        }

        clearSelection() {
            this.selectedNodeId = null;

            this.root
                ?.querySelectorAll(".ms-node.selected")
                .forEach(element => {
                    element.classList.remove("selected");
                });

            this.renderPropertiesPlaceholder();
        }

        renderPropertiesPlaceholder() {
            if (!this.propPanel) return;

            this.propPanel.innerHTML = `
                <div class="ms-empty-state">
                    <strong>No node selected</strong>
                    <span>Select a node to edit its parameters.</span>
                </div>
            `;
        }

        renderProperties(node) {
            if (!this.propPanel || !node) return;

            const row = (label, control) => `
                <label class="ms-prop-row">
                    <span>${this.escape(label)}</span>
                    ${control}
                </label>
            `;

            let html = `
                <div class="ms-properties-title">
                    <strong>${this.escape(this.getNodeTitle(node.type))}</strong>
                    <span>${this.escape(node.type)}</span>
                </div>
            `;

            if (node.type === "oscillator") {
                html += row(
                    "Frequency",
                    `<input data-ms-prop="frequency" type="number" min="1" max="24000" step="1" value="${Number(node.data.frequency) || 440}">`
                );

                html += row(
                    "Wave",
                    `<select data-ms-prop="type">
                        ${["sine", "square", "sawtooth", "triangle"]
                            .map(
                                type =>
                                    `<option value="${type}" ${node.data.type === type ? "selected" : ""}>${type}</option>`
                            )
                            .join("")}
                    </select>`
                );
            }

            if (node.type === "wavePlayer") {
                const options =
                    [...this.soundAssets.values()]
                        .map(
                            asset =>
                                `<option value="${this.escapeAttribute(asset.name)}" ${node.data.assetName === asset.name ? "selected" : ""}>${this.escape(asset.name)}</option>`
                        )
                        .join("");

                html += row(
                    "Sound",
                    `<select data-ms-prop="assetName">
                        <option value="">No Sound</option>
                        ${options}
                    </select>`
                );

                html += row(
                    "Loop",
                    `<input data-ms-prop="loop" type="checkbox" ${node.data.loop ? "checked" : ""}>`
                );
            }

            if (node.type === "gain") {
                html += row(
                    "Gain",
                    `<input data-ms-prop="gain" type="range" min="0" max="2" step="0.01" value="${Number(node.data.gain ?? 1)}">`
                );
            }

            if (node.type === "delay") {
                html += row(
                    "Delay",
                    `<input data-ms-prop="delayTime" type="range" min="0" max="5" step="0.01" value="${Number(node.data.delayTime ?? 0.3)}">`
                );
            }

            if (node.type === "filter") {
                html += row(
                    "Type",
                    `<select data-ms-prop="filterType">
                        ${["lowpass", "highpass", "bandpass", "notch"]
                            .map(
                                type =>
                                    `<option value="${type}" ${node.data.filterType === type ? "selected" : ""}>${type}</option>`
                            )
                            .join("")}
                    </select>`
                );

                html += row(
                    "Frequency",
                    `<input data-ms-prop="frequency" type="range" min="20" max="20000" step="1" value="${Number(node.data.frequency ?? 1000)}">`
                );
            }

            if (node.type === "output") {
                html += `
                    <div class="ms-detail-note">
                        Preview output routes through SM Audio Engine's SFX bus when available.
                    </div>
                `;
            }

            this.propPanel.innerHTML = html;

            this.propPanel
                .querySelectorAll("[data-ms-prop]")
                .forEach(control => {
                    const eventName =
                        control.type === "range"
                            ? "input"
                            : "change";

                    control.addEventListener(eventName, () => {
                        const key = control.dataset.msProp;

                        let value;

                        if (control.type === "checkbox") {
                            value = control.checked;
                        } else if (
                            control.type === "range" ||
                            control.type === "number"
                        ) {
                            value = Number(control.value);
                        } else {
                            value = control.value;
                        }

                        this.updateData(key, value);
                    });
                });
        }

        updateData(key, value) {
            if (!this.selectedNodeId) return;

            const node =
                this.nodes.find(item => item.id === this.selectedNodeId);

            if (!node) return;

            node.data[key] = value;

            if (this.isPlaying) {
                const audioObject =
                    this.audioNodeMap.get(this.selectedNodeId);

                if (audioObject?.node) {
                    if (key === "frequency" && audioObject.node.frequency) {
                        audioObject.node.frequency.value = Number(value);
                    }

                    if (key === "gain" && audioObject.node.gain) {
                        audioObject.node.gain.value = Number(value);
                    }

                    if (key === "delayTime" && audioObject.node.delayTime) {
                        audioObject.node.delayTime.value = Number(value);
                    }

                    if (key === "filterType" && audioObject.node.type !== undefined) {
                        audioObject.node.type = value;
                    }

                    if (key === "assetName" || key === "type" || key === "loop") {
                        this.buildAndPlayGraph();
                    }
                }
            }

            this.renderNodeHTML(node);
            this.selectNode(node);
            this.redrawConnections();

            this.dispatchGraphChanged("node-data", {
                node,
                key,
                value
            });
        }

        deleteSelectedNode() {
            if (
                !this.selectedNodeId ||
                this.selectedNodeId === "ms-node-output"
            ) {
                return false;
            }

            const nodeId = this.selectedNodeId;

            this.connections = this.connections.filter(connection => {
                const remove =
                    connection.from === nodeId ||
                    connection.to === nodeId;

                if (remove) {
                    connection.svg?.remove();
                }

                return !remove;
            });

            this.nodes =
                this.nodes.filter(node => node.id !== nodeId);

            this.root
                ?.querySelector(`#${CSS.escape(nodeId)}`)
                ?.remove();

            this.clearSelection();
            this.redrawConnections();

            if (this.isPlaying) {
                this.buildAndPlayGraph();
            }

            this.dispatchGraphChanged("node-delete", {
                id: nodeId
            });

            return true;
        }

        duplicateSelectedNode() {
            const source =
                this.nodes.find(node => node.id === this.selectedNodeId);

            if (!source || source.type === "output") return null;

            return this.addNode(source.type, {
                x: source.x + 34,
                y: source.y + 34,
                data: structuredClone(source.data)
            });
        }

        showContextMenu(event) {
            if (!this.ctxMenu) return;

            this.ctxMenu.hidden = false;

            const shellRect =
                this.canvas.getBoundingClientRect();

            this.ctxMenu.style.left =
                `${event.clientX - shellRect.left}px`;

            this.ctxMenu.style.top =
                `${event.clientY - shellRect.top}px`;
        }

        hideContextMenu() {
            if (this.ctxMenu) {
                this.ctxMenu.hidden = true;
            }
        }

        onDocumentClick(event) {
            if (
                this.ctxMenu &&
                !this.ctxMenu.hidden &&
                !event.target.closest("#ms-context-menu")
            ) {
                this.hideContextMenu();
            }
        }

        onKeyDown(event) {
            if (!this.root?.isConnected) return;

            const active =
                document.activeElement;

            if (
                active &&
                /INPUT|TEXTAREA|SELECT/.test(active.tagName)
            ) {
                return;
            }

            const editorFocused =
                this.root.matches(":hover") ||
                this.root.contains(active);

            if (!editorFocused) return;

            if (event.key === "Delete" || event.key === "Backspace") {
                event.preventDefault();
                this.deleteSelectedNode();
            }
        }

        async handleAudioFiles(fileList) {
            const files = Array.from(fileList || []);

            if (!files.length) return;

            await this.initAudio();

            for (const file of files) {
                try {
                    const buffer =
                        await this.audioCtx.decodeAudioData(
                            (await file.arrayBuffer()).slice(0)
                        );

                    const asset = {
                        id:
                            `metasound-${file.name}-${Date.now().toString(36)}`,
                        name: file.name,
                        buffer,
                        duration: Number(buffer.duration || 0),
                        file
                    };

                    this.soundAssets.set(file.name, asset);

                    if (window.smAudioSystem?.assets) {
                        try {
                            window.smAudioSystem.assets.registerDecodedBuffer(
                                asset.id,
                                buffer,
                                {
                                    name: file.name,
                                    sourceKind: "metasound-import"
                                }
                            );
                        } catch (_) {}
                    }
                } catch (error) {
                    console.error("[MetaSoundEditor] Failed to decode audio:", file.name, error);
                }
            }

            this.refreshAssetList();

            const selected =
                this.nodes.find(node => node.id === this.selectedNodeId);

            if (selected?.type === "wavePlayer") {
                this.renderProperties(selected);
            }
        }

        syncAssetsFromEngine() {
            const assets =
                window.smAudioSystem?.assets?.list?.() ||
                [];

            for (const asset of assets) {
                if (!asset?.buffer || !asset.name) continue;

                if (!this.soundAssets.has(asset.name)) {
                    this.soundAssets.set(asset.name, {
                        id: asset.id,
                        name: asset.name,
                        buffer: asset.buffer,
                        duration: asset.duration
                    });
                }
            }

            this.refreshAssetList();
        }

        refreshAssetList() {
            if (!this.assetList) return;

            if (this.soundAssets.size === 0) {
                this.assetList.innerHTML = `
                    <div class="ms-empty-assets">
                        No audio imported
                    </div>
                `;

                return;
            }

            this.assetList.innerHTML =
                [...this.soundAssets.values()]
                    .map(
                        asset => `
                            <button
                                type="button"
                                class="sound-asset-item"
                                data-ms-asset="${this.escapeAttribute(asset.name)}"
                                title="${this.escapeAttribute(asset.name)}"
                            >
                                <span class="ms-asset-icon">♪</span>
                                <span class="ms-asset-name">${this.escape(asset.name)}</span>
                                <span class="ms-asset-duration">${this.formatDuration(asset.duration)}</span>
                            </button>
                        `
                    )
                    .join("");

            this.assetList
                .querySelectorAll("[data-ms-asset]")
                .forEach(button => {
                    button.addEventListener("dblclick", () => {
                        const node =
                            this.addNode("wavePlayer");

                        if (node) {
                            node.data.assetName =
                                button.dataset.msAsset;

                            this.renderNodeHTML(node);
                            this.selectNode(node);
                        }
                    });
                });
        }

        setupVisualizer() {
            if (!this.audioCtx || this.masterAnalyser) return;

            this.masterAnalyser =
                this.audioCtx.createAnalyser();

            this.masterAnalyser.fftSize = 128;
            this.masterAnalyser.smoothingTimeConstant = 0.78;

            this.startVisualizerLoop();
        }

        startVisualizerLoop() {
            if (this.visualizerRaf) return;

            const draw = () => {
                this.visualizerRaf =
                    requestAnimationFrame(draw);

                const canvas =
                    this.visualizerCanvas;

                const analyser =
                    this.masterAnalyser;

                if (!canvas || !analyser) return;

                const context =
                    canvas.getContext("2d");

                const width =
                    canvas.width;

                const height =
                    canvas.height;

                const data =
                    new Uint8Array(
                        analyser.frequencyBinCount
                    );

                analyser.getByteFrequencyData(data);

                context.clearRect(0, 0, width, height);
                context.fillStyle = "#242424";
                context.fillRect(0, 0, width, height);

                const barWidth =
                    width / Math.max(1, data.length);

                for (let index = 0; index < data.length; index += 1) {
                    const normalized =
                        data[index] / 255;

                    const barHeight =
                        Math.max(1, normalized * height);

                    context.fillStyle =
                        `rgba(170, 185, 190, ${0.18 + normalized * 0.62})`;

                    context.fillRect(
                        index * barWidth,
                        height - barHeight,
                        Math.max(1, barWidth - 1),
                        barHeight
                    );
                }
            };

            this.visualizerRaf =
                requestAnimationFrame(draw);
        }

        resizeVisualizer() {
            if (!this.visualizerCanvas) return;

            const rect =
                this.visualizerCanvas.getBoundingClientRect();

            const dpr =
                Math.min(
                    window.devicePixelRatio || 1,
                    2
                );

            const width =
                Math.max(
                    1,
                    Math.round(rect.width * dpr)
                );

            const height =
                Math.max(
                    1,
                    Math.round(rect.height * dpr)
                );

            if (
                this.visualizerCanvas.width !== width ||
                this.visualizerCanvas.height !== height
            ) {
                this.visualizerCanvas.width = width;
                this.visualizerCanvas.height = height;
            }
        }

        onVisible() {
            if (!this.root?.isConnected) return;

            requestAnimationFrame(() => {
                this.redraw();
                this.resizeVisualizer();

                if (this.canvas) {
                    if (!this.canvas.dataset.initialScrollApplied) {
                        this.canvas.dataset.initialScrollApplied = "1";
                        this.canvas.scrollLeft = 120;
                        this.canvas.scrollTop = 120;
                    }
                }
            });
        }

        resize() {
            this.onVisible();
        }

        redraw() {
            this.redrawConnections();
        }

        playGraph() {
            return this.buildAndPlayGraph();
        }

        stopGraph() {
            this.stopPlayback(true);
        }

        exportCue() {
            const data = this.serialize();

            console.log("[MetaSoundEditor] Export:", data);

            window.dispatchEvent(
                new CustomEvent("sm:metasound-export", {
                    detail: {
                        graph: data
                    }
                })
            );

            this.setStatus("EXPORTED", false);

            setTimeout(() => {
                if (!this.isPlaying) {
                    this.setStatus("STOPPED", false);
                }
            }, 900);

            return data;
        }

        serialize() {
            return {
                format: "SM_METASOUND_GRAPH",
                version: 1,
                nodes: structuredClone(this.nodes),
                connections:
                    this.connections.map(connection => ({
                        id: connection.id,
                        from: connection.from,
                        fromSocket: connection.fromSocket,
                        to: connection.to,
                        toSocket: connection.toSocket
                    }))
            };
        }

        deserialize(data = {}) {
            this.stopPlayback(true);

            this.nodes =
                Array.isArray(data.nodes)
                    ? structuredClone(data.nodes)
                    : [];

            if (!this.nodes.some(node => node.id === "ms-node-output")) {
                this.nodes.push({
                    id: "ms-node-output",
                    type: "output",
                    x: 1040,
                    y: 310,
                    data: {}
                });
            }

            this.connections =
                Array.isArray(data.connections)
                    ? structuredClone(data.connections)
                    : [];

            this.selectedNodeId = null;

            this.renderAllNodes();
            this.renderPropertiesPlaceholder();

            this.dispatchGraphChanged("graph-load", data);

            return true;
        }

        setStatus(text, playing = false) {
            if (!this.statusLabel) return;

            this.statusLabel.textContent = text;
            this.statusLabel.classList.toggle("playing", !!playing);
        }

        dispatchGraphChanged(type, payload) {
            window.dispatchEvent(
                new CustomEvent("sm:metasound-graph-change", {
                    detail: {
                        type,
                        payload,
                        graph: this.serialize()
                    }
                })
            );
        }

        formatDuration(seconds) {
            const value =
                Math.max(0, Number(seconds) || 0);

            return `${value.toFixed(2)}s`;
        }

        escape(value) {
            return String(value ?? "")
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#039;");
        }

        escapeAttribute(value) {
            return this.escape(value);
        }

        disposeDOMOnly() {
            this.resizeObserver?.disconnect();
            this.resizeObserver = null;

            document.removeEventListener("keydown", this._boundKeydown);
            document.removeEventListener("click", this._boundDocumentClick);

            this.host = null;
            this.root = null;

            this.canvas = null;
            this.world = null;
            this.nodesArea = null;
            this.svgLayer = null;
            this.propPanel = null;
            this.ctxMenu = null;
            this.statusLabel = null;
            this.assetList = null;
            this.visualizerCanvas = null;

            this.initialized = false;
        }

        injectStyles() {
            if (document.getElementById(this._styleId)) return;

            const style = document.createElement("style");

            style.id = this._styleId;

            style.textContent = `
                #sound-graph-wrapper {
                    min-width:0!important;
                    min-height:0!important;
                    flex:1 1 auto!important;
                    overflow:hidden!important;
                    background:#272727!important;
                }

                #sound-graph-wrapper > .node-editor-loading-state {
                    display:none!important;
                }

                #sm-metasound-editor,
                #sm-metasound-editor * {
                    box-sizing:border-box;
                }

                #sm-metasound-editor {
                    width:100%;
                    height:100%;
                    min-width:0;
                    min-height:0;

                    display:flex;
                    flex-direction:column;

                    overflow:hidden;

                    background:#282828;
                    color:#d4d4d4;

                    font-family:Inter,"Segoe UI",Arial,sans-serif;
                    font-size:10px;
                }

                #sm-metasound-editor button,
                #sm-metasound-editor input,
                #sm-metasound-editor select {
                    font:inherit;
                }

                #sm-metasound-editor .ms-toolbar {
                    min-height:32px;
                    height:32px;
                    flex:0 0 32px;

                    display:flex;
                    align-items:center;
                    gap:2px;

                    padding:0 6px;

                    background:#333;
                }

                #sm-metasound-editor .ms-toolbar-brand {
                    display:flex;
                    align-items:center;
                    gap:7px;

                    min-width:150px;
                    padding-right:8px;
                }

                #sm-metasound-editor .ms-toolbar-brand strong {
                    font-size:9px;
                    font-weight:600;
                    color:#d8d8d8;
                }

                #sm-metasound-editor .ms-badge {
                    padding:2px 4px;

                    background:#3a3a3a;
                    color:#b5a16c;

                    font-size:6px;
                    font-weight:800;
                    letter-spacing:.08em;
                }

                #sm-metasound-editor .ms-toolbar-group {
                    display:flex;
                    align-items:center;
                    gap:1px;
                }

                #sm-metasound-editor .ms-toolbar button,
                #sm-metasound-editor .ms-panel-head button {
                    min-height:22px;

                    padding:0 7px;

                    background:transparent;
                    color:#a7a7a7;

                    border:0;
                    border-radius:0;

                    cursor:pointer;
                }

                #sm-metasound-editor .ms-toolbar button:hover,
                #sm-metasound-editor .ms-panel-head button:hover {
                    background:#3d3d3d;
                    color:#eee;
                }

                #sm-metasound-editor .ms-toolbar-spacer,
                #sm-metasound-editor .ms-footer-spacer {
                    flex:1 1 auto;
                }

                #sm-metasound-editor .ms-transport-btn {
                    min-width:48px;
                }

                #sm-metasound-editor .ms-editor-main {
                    min-height:0;
                    flex:1 1 auto;

                    display:grid;
                    grid-template-columns:190px minmax(0,1fr) 220px;

                    overflow:hidden;
                }

                #sm-metasound-editor .ms-sidebar {
                    min-width:0;
                    min-height:0;

                    display:flex;
                    flex-direction:column;

                    overflow:hidden;

                    background:#303030;
                }

                #sm-metasound-editor .ms-assets-panel {
                    background:#2e2e2e;
                }

                #sm-metasound-editor .ms-properties-panel {
                    background:#303030;
                }

                #sm-metasound-editor .ms-panel-head {
                    height:27px;
                    min-height:27px;

                    display:flex;
                    align-items:center;
                    justify-content:space-between;

                    padding:0 7px;

                    background:#353535;

                    color:#bcbcbc;
                }

                #sm-metasound-editor .ms-panel-head strong {
                    font-size:8px;
                    font-weight:650;
                }

                #sm-metasound-editor .ms-asset-list,
                #sm-metasound-editor .ms-properties {
                    min-height:0;
                    flex:1 1 auto;
                    overflow:auto;
                }

                #sm-metasound-editor .sound-asset-item {
                    width:100%;
                    min-height:25px;

                    display:grid;
                    grid-template-columns:18px minmax(0,1fr) auto;
                    align-items:center;
                    gap:3px;

                    padding:0 6px;

                    background:transparent;
                    color:#bdbdbd;

                    border:0;
                    border-radius:0;

                    text-align:left;

                    cursor:pointer;
                }

                #sm-metasound-editor .sound-asset-item:hover {
                    background:#373737;
                }

                #sm-metasound-editor .ms-asset-icon {
                    color:#8d9da1;
                }

                #sm-metasound-editor .ms-asset-name {
                    min-width:0;

                    overflow:hidden;

                    text-overflow:ellipsis;
                    white-space:nowrap;
                }

                #sm-metasound-editor .ms-asset-duration {
                    color:#707070;
                    font-size:7px;
                }

                #sm-metasound-editor .ms-empty-assets,
                #sm-metasound-editor .ms-sidebar-hint,
                #sm-metasound-editor .ms-empty-state {
                    padding:9px;

                    color:#686868;

                    font-size:8px;
                    line-height:1.45;
                }

                #sm-metasound-editor .ms-sidebar-hint {
                    flex:0 0 auto;

                    background:#292929;
                }

                #sm-metasound-editor .ms-canvas-shell {
                    position:relative;

                    min-width:0;
                    min-height:0;

                    overflow:auto;

                    background:#252525;

                    scrollbar-color:#444 #292929;
                    scrollbar-width:thin;
                }

                #sm-metasound-editor .ms-world {
                    position:relative;

                    width:1800px;
                    height:1000px;

                    overflow:hidden;
                }

                #sm-metasound-editor .ms-grid {
                    position:absolute;
                    inset:0;

                    pointer-events:none;

                    background-color:#252525;
                    background-image:
                        linear-gradient(rgba(255,255,255,.025) 1px,transparent 1px),
                        linear-gradient(90deg,rgba(255,255,255,.025) 1px,transparent 1px),
                        linear-gradient(rgba(255,255,255,.012) 1px,transparent 1px),
                        linear-gradient(90deg,rgba(255,255,255,.012) 1px,transparent 1px);

                    background-size:
                        64px 64px,
                        64px 64px,
                        16px 16px,
                        16px 16px;
                }

                #sm-metasound-editor .ms-connections,
                #sm-metasound-editor .ms-nodes-area {
                    position:absolute;
                    inset:0;

                    width:1800px;
                    height:1000px;
                }

                #sm-metasound-editor .ms-connections {
                    overflow:visible;

                    pointer-events:none;
                }

                #sm-metasound-editor .ms-node {
                    position:absolute;

                    width:154px;
                    min-height:68px;

                    background:#303030;
                    color:#c7c7c7;

                    border:0;
                    border-radius:0;

                    box-shadow:
                        0 4px 14px rgba(0,0,0,.24);

                    user-select:none;

                    z-index:5;
                }

                #sm-metasound-editor .ms-node.selected {
                    background:#353535;

                    box-shadow:
                        inset 2px 0 0 #73878c,
                        0 5px 17px rgba(0,0,0,.30);
                }

                #sm-metasound-editor .ms-node-header {
                    height:24px;

                    display:flex;
                    align-items:center;
                    gap:6px;

                    padding:0 6px;

                    background:#393939;

                    cursor:move;
                }

                #sm-metasound-editor .ms-node-header strong {
                    min-width:0;
                    flex:1 1 auto;

                    overflow:hidden;

                    color:#d3d3d3;

                    font-size:8px;
                    font-weight:650;

                    text-overflow:ellipsis;
                    white-space:nowrap;
                }

                #sm-metasound-editor .ms-node-id {
                    color:#696969;
                    font-size:6px;
                }

                #sm-metasound-editor .ms-node-type-dot {
                    width:6px;
                    height:6px;

                    flex:0 0 6px;

                    background:#747f82;
                }

                #sm-metasound-editor .ms-node-oscillator .ms-node-type-dot {
                    background:#687f91;
                }

                #sm-metasound-editor .ms-node-wavePlayer .ms-node-type-dot {
                    background:#9a775d;
                }

                #sm-metasound-editor .ms-node-gain .ms-node-type-dot {
                    background:#668472;
                }

                #sm-metasound-editor .ms-node-filter .ms-node-type-dot {
                    background:#826d8c;
                }

                #sm-metasound-editor .ms-node-delay .ms-node-type-dot {
                    background:#7c708a;
                }

                #sm-metasound-editor .ms-node-output .ms-node-type-dot {
                    background:#9b8d63;
                }

                #sm-metasound-editor .ms-node-body {
                    padding:5px 0 7px;
                }

                #sm-metasound-editor .ms-pin-row {
                    min-height:20px;

                    display:flex;
                    align-items:center;
                    gap:5px;

                    padding:0 6px;

                    color:#9f9f9f;

                    font-size:7px;
                }

                #sm-metasound-editor .ms-pin-row-output {
                    justify-content:flex-end;
                }

                #sm-metasound-editor .ms-socket-input,
                #sm-metasound-editor .ms-socket-output {
                    width:9px;
                    height:9px;

                    flex:0 0 9px;

                    background:#525d61;

                    border:0;

                    transform:rotate(45deg);

                    cursor:crosshair;
                }

                #sm-metasound-editor .ms-socket-input:hover,
                #sm-metasound-editor .ms-socket-output:hover {
                    background:#99abb0;

                    transform:rotate(45deg) scale(1.18);
                }

                #sm-metasound-editor .ms-node-info {
                    margin:2px 6px 4px;

                    color:#717171;

                    font-size:7px;

                    overflow:hidden;
                    text-overflow:ellipsis;
                    white-space:nowrap;
                }

                #sm-metasound-editor .ms-connection-line {
                    fill:none;

                    stroke:#5d676a;
                    stroke-width:2;

                    opacity:.76;
                }

                #sm-metasound-editor .ms-connection-line.preview-wire {
                    stroke:#87979b;
                    opacity:.72;
                }

                #sm-metasound-editor .ms-connection-line.active-audio {
                    stroke:#a9b77c;
                    opacity:1;
                }

                #sm-metasound-editor .ms-properties-title {
                    min-height:34px;

                    display:flex;
                    flex-direction:column;
                    justify-content:center;

                    padding:5px 8px;

                    background:#2c2c2c;
                }

                #sm-metasound-editor .ms-properties-title strong {
                    color:#d0d0d0;
                    font-size:9px;
                }

                #sm-metasound-editor .ms-properties-title span {
                    color:#666;
                    font-size:6px;
                }

                #sm-metasound-editor .ms-prop-row {
                    min-height:30px;

                    display:grid;
                    grid-template-columns:78px minmax(0,1fr);
                    align-items:center;
                    gap:5px;

                    padding:3px 7px;

                    color:#909090;

                    font-size:8px;
                }

                #sm-metasound-editor .ms-prop-row input,
                #sm-metasound-editor .ms-prop-row select {
                    min-width:0;
                    width:100%;
                    height:21px;

                    padding:0 5px;

                    background:#292929;
                    color:#bdbdbd;

                    border:0;
                    border-radius:0;
                    outline:0;
                }

                #sm-metasound-editor .ms-prop-row input[type="checkbox"] {
                    width:auto;
                    justify-self:start;
                }

                #sm-metasound-editor .ms-prop-row input[type="range"] {
                    padding:0;
                }

                #sm-metasound-editor .ms-detail-note {
                    padding:8px;

                    color:#737373;

                    font-size:8px;
                    line-height:1.45;
                }

                #sm-metasound-editor .ms-context-menu {
                    position:absolute;

                    z-index:100;

                    min-width:126px;

                    padding:3px;

                    background:#333;

                    box-shadow:0 8px 20px rgba(0,0,0,.38);
                }

                #sm-metasound-editor .ms-context-menu[hidden] {
                    display:none;
                }

                #sm-metasound-editor .ms-context-menu button {
                    width:100%;
                    height:24px;

                    padding:0 7px;

                    background:transparent;
                    color:#b2b2b2;

                    border:0;
                    border-radius:0;

                    text-align:left;

                    cursor:pointer;
                }

                #sm-metasound-editor .ms-context-menu button:hover {
                    background:#404040;
                    color:#eee;
                }

                #sm-metasound-editor .ms-footer {
                    height:28px;
                    min-height:28px;
                    flex:0 0 28px;

                    display:flex;
                    align-items:center;
                    gap:8px;

                    padding:0 7px;

                    background:#303030;
                }

                #sm-metasound-editor .ms-status {
                    min-width:48px;

                    color:#777;

                    font-size:7px;
                    font-weight:700;
                }

                #sm-metasound-editor .ms-status.playing {
                    color:#a9b77c;
                }

                #sm-metasound-editor .ms-footer-copy {
                    color:#666;
                    font-size:7px;
                }

                #sm-metasound-editor #audio-visualizer {
                    width:220px;
                    height:20px;

                    display:block;

                    background:#242424;
                }

                @media (max-width:1100px) {
                    #sm-metasound-editor .ms-editor-main {
                        grid-template-columns:160px minmax(0,1fr) 185px;
                    }

                    #sm-metasound-editor .ms-toolbar-brand {
                        min-width:115px;
                    }
                }
            `;

            document.head.appendChild(style);
        }
    }

    const singleton =
        window.MetaSoundEditor instanceof SMMetaSoundEditor
            ? window.MetaSoundEditor
            : new SMMetaSoundEditor();

    window.SMMetaSoundEditor = SMMetaSoundEditor;
    window.MetaSoundEditor = singleton;

    // Backward-compatible alias for older inline handlers / code.
    window.SoundGraph = {
        addNode: (...args) =>
            singleton.addNode(...args),

        playGraph: (...args) =>
            singleton.playGraph(...args),

        stopGraph: (...args) =>
            singleton.stopGraph(...args),

        redraw: (...args) =>
            singleton.redraw(...args),

        updateData: (...args) =>
            singleton.updateData(...args),

        exportCue: (...args) =>
            singleton.exportCue(...args),

        serialize: (...args) =>
            singleton.serialize(...args),

        deserialize: (...args) =>
            singleton.deserialize(...args)
    };
})();