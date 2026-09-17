// SM Engine - AnimationGraphEditor
(function () {
    const Editor = {
        canvas: null,
        viewport: null,
        stage: null,
        svg: null,
        nodes: new Map(),
        connections: new Map(),
        selectedNodes: new Set(),
        selectedConnection: null,
        zoom: 1,
        panX: 0,
        panY: 0,
        minZoom: 0.25,
        maxZoom: 2.5,
        dragState: null,
        panState: null,
        connectionState: null,
        tempPath: null,
        contextMenu: null,
        initialized: false,
        dirty: false,
        workspace: 'anim-graph',
        init(canvas) {
            if (!canvas) return false;
            if (typeof window.AnimationGraphNode !== 'function' || typeof window.AnimationGraphConnection !== 'function') {
                console.error('[AnimationGraphEditor] AnimationGraphNode.js and AnimationGraphConnection.js must load first.');
                return false;
            }
            if (this.canvas === canvas && this.initialized) {
                this.resize();
                return true;
            }
            this.destroy();
            this.canvas = canvas;
            this.nodes = new Map();
            this.connections = new Map();
            this.selectedNodes = new Set();
            this.selectedConnection = null;
            this.zoom = 1;
            this.panX = 0;
            this.panY = 0;
            this._injectStyles();
            this._buildCanvas();
            this._bindCanvasEvents();
            const saved = this._loadSavedGraph();
            if (saved) {
                this.deserialize(saved);
            } else {
                this._createDefaultGraph();
            }
            this._applyTransform();
            this.initialized = true;
            this.resize();
            console.log('[AnimationGraphEditor] initialized');
            return true;
        },
        _buildCanvas() {
            this.canvas.innerHTML = '';
            this.canvas.classList.add('sm-animation-graph-canvas');
            this.viewport = document.createElement('div');
            this.viewport.className = 'sm-anim-viewport';
            this.stage = document.createElement('div');
            this.stage.className = 'sm-anim-stage';
            this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            this.svg.setAttribute('class', 'sm-anim-svg');
            this.svg.setAttribute('width', '6000');
            this.svg.setAttribute('height', '4000');
            this.svg.setAttribute('viewBox', '0 0 6000 4000');
            this.stage.appendChild(this.svg);
            this.viewport.appendChild(this.stage);
            this.canvas.appendChild(this.viewport);
        },
        _bindCanvasEvents() {
            this._onPointerDown = event => {
                if (event.target.closest('.sm-anim-graph-node') || event.target.closest('.sm-anim-context-menu')) return;
                if (event.button === 1 || (event.button === 0 && event.altKey)) {
                    event.preventDefault();
                    this.beginPan(event);
                    return;
                }
                if (event.button === 0) {
                    this.clearSelection();
                    this._closeContextMenu();
                }
            };
            this._onContextMenu = event => {
                event.preventDefault();
                if (event.target.closest('.sm-anim-graph-node')) return;
                this._openContextMenu(event);
            };
            this._onWheel = event => {
                event.preventDefault();
                const rect = this.canvas.getBoundingClientRect();
                const mouseX = event.clientX - rect.left;
                const mouseY = event.clientY - rect.top;
                const before = this.screenToGraph(mouseX, mouseY);
                const factor = event.deltaY < 0 ? 1.1 : 0.9;
                this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom * factor));
                this.panX = mouseX - before.x * this.zoom;
                this.panY = mouseY - before.y * this.zoom;
                this._applyTransform();
            };
            this._onKeyDown = event => {
                const tag = document.activeElement?.tagName;
                if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
                if (event.key === 'Delete' || event.key === 'Backspace') {
                    event.preventDefault();
                    this.deleteSelection();
                }
                if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
                    event.preventDefault();
                    this.save();
                }
                if ((event.ctrlKey || event.metaKey) && event.key === '0') {
                    event.preventDefault();
                    this.frameAll();
                }
            };
            this.canvas.addEventListener('pointerdown', this._onPointerDown);
            this.canvas.addEventListener('contextmenu', this._onContextMenu);
            this.canvas.addEventListener('wheel', this._onWheel, { passive: false });
            window.addEventListener('keydown', this._onKeyDown);
        },
        _createDefaultGraph() {
            const entry = this.addNode({ type: 'entry', title: 'Entry', x: 100, y: 240 });
            const locomotion = this.addNode({ type: 'stateMachine', title: 'Locomotion', x: 430, y: 220, data: { machine: 'Locomotion' } });
            const output = this.addNode({ type: 'output', title: 'Output Pose', x: 790, y: 240 });
            this.connect(entry.id, 'next', locomotion.id, 'in', 'exec', { skipCompatibility: true });
            this.connect(locomotion.id, 'pose', output.id, 'pose', 'pose');
            this.dirty = false;
        },
        addNode(config = {}) {
            if (!this.stage) return null;
            if (config.type === 'entry' && [...this.nodes.values()].some(n => n.type === 'entry')) return [...this.nodes.values()].find(n => n.type === 'entry');
            if (config.type === 'output' && [...this.nodes.values()].some(n => n.type === 'output')) return [...this.nodes.values()].find(n => n.type === 'output');
            const node = new window.AnimationGraphNode(this, config);
            this.nodes.set(node.id, node);
            node.render(this.stage);
            this.markDirty();
            return node;
        },
        removeNode(nodeId) {
            const node = this.nodes.get(nodeId);
            if (!node) return false;
            [...this.connections.values()].forEach(connection => {
                if (connection.fromNodeId === nodeId || connection.toNodeId === nodeId) this.removeConnection(connection.id);
            });
            this.selectedNodes.delete(nodeId);
            node.destroy();
            this.nodes.delete(nodeId);
            this.markDirty();
            return true;
        },
        connect(fromNodeId, fromPinId, toNodeId, toPinId, kind = null, options = {}) {
            const fromNode = this.nodes.get(fromNodeId);
            const toNode = this.nodes.get(toNodeId);
            if (!fromNode || !toNode || fromNodeId === toNodeId) return null;
            const fromPin = fromNode.getPin('output', fromPinId);
            const toPin = toNode.getPin('input', toPinId);
            if (!fromPin || !toPin) return null;
            const connectionKind = kind || fromPin.kind || toPin.kind || 'pose';
            if (!options.skipCompatibility && !this._pinsCompatible(fromPin, toPin)) return null;
            const duplicate = [...this.connections.values()].find(c => c.fromNodeId === fromNodeId && c.fromPinId === fromPinId && c.toNodeId === toNodeId && c.toPinId === toPinId);
            if (duplicate) return duplicate;
            if (toPin.kind !== 'exec') {
                [...this.connections.values()].forEach(c => {
                    if (c.toNodeId === toNodeId && c.toPinId === toPinId) this.removeConnection(c.id);
                });
            }
            const connection = new window.AnimationGraphConnection(this, { fromNodeId, fromPinId, toNodeId, toPinId, kind: connectionKind });
            this.connections.set(connection.id, connection);
            connection.render(this.svg);
            this.markDirty();
            return connection;
        },
        removeConnection(connectionId) {
            const connection = this.connections.get(connectionId);
            if (!connection) return false;
            if (this.selectedConnection === connection) this.selectedConnection = null;
            connection.destroy();
            this.connections.delete(connectionId);
            this.markDirty();
            return true;
        },
        _pinsCompatible(a, b) {
            if (!a || !b) return false;
            if (a.kind === b.kind) return true;
            if (a.kind === 'exec' || b.kind === 'exec') return a.kind === b.kind;
            if (a.kind === 'number' && (b.kind === 'float' || b.kind === 'integer')) return true;
            if (b.kind === 'number' && (a.kind === 'float' || a.kind === 'integer')) return true;
            return false;
        },
        beginNodeDrag(node, event) {
            this.selectNode(node, event.shiftKey);
            const start = this.clientToGraph(event.clientX, event.clientY);
            const starts = new Map();
            this.selectedNodes.forEach(id => {
                const n = this.nodes.get(id);
                if (n) starts.set(id, { x: n.x, y: n.y });
            });
            this.dragState = { pointerId: event.pointerId, start, starts };
            const move = e => {
                if (!this.dragState || e.pointerId !== this.dragState.pointerId) return;
                const current = this.clientToGraph(e.clientX, e.clientY);
                const dx = current.x - this.dragState.start.x;
                const dy = current.y - this.dragState.start.y;
                this.dragState.starts.forEach((pos, id) => {
                    const n = this.nodes.get(id);
                    if (n) n.setPosition(pos.x + dx, pos.y + dy);
                });
            };
            const up = e => {
                if (!this.dragState || e.pointerId !== this.dragState.pointerId) return;
                window.removeEventListener('pointermove', move);
                window.removeEventListener('pointerup', up);
                window.removeEventListener('pointercancel', up);
                this.dragState = null;
                this.markDirty();
            };
            window.addEventListener('pointermove', move);
            window.addEventListener('pointerup', up);
            window.addEventListener('pointercancel', up);
        },
        beginPan(event) {
            const startX = event.clientX;
            const startY = event.clientY;
            const panX = this.panX;
            const panY = this.panY;
            this.panState = { pointerId: event.pointerId };
            const move = e => {
                if (!this.panState || e.pointerId !== this.panState.pointerId) return;
                this.panX = panX + (e.clientX - startX);
                this.panY = panY + (e.clientY - startY);
                this._applyTransform();
            };
            const up = e => {
                if (!this.panState || e.pointerId !== this.panState.pointerId) return;
                window.removeEventListener('pointermove', move);
                window.removeEventListener('pointerup', up);
                window.removeEventListener('pointercancel', up);
                this.panState = null;
            };
            window.addEventListener('pointermove', move);
            window.addEventListener('pointerup', up);
            window.addEventListener('pointercancel', up);
        },
        beginConnection(node, pinId, direction, kind, event) {
            if (direction === 'input') {
                const existing = [...this.connections.values()].find(c => c.toNodeId === node.id && c.toPinId === pinId);
                if (existing) {
                    const sourceNode = this.nodes.get(existing.fromNodeId);
                    const sourcePin = existing.fromPinId;
                    const sourceKind = existing.kind;
                    this.removeConnection(existing.id);
                    if (sourceNode) {
                        const sourceEl = sourceNode.getPinElement('output', sourcePin);
                        const fakeEvent = { clientX: event.clientX, clientY: event.clientY };
                        this.beginConnection(sourceNode, sourcePin, 'output', sourceKind, fakeEvent);
                    }
                }
                return;
            }
            const sourcePinEl = node.getPinElement('output', pinId);
            if (!sourcePinEl) return;
            const start = this.getPinGraphPosition(sourcePinEl);
            this.connectionState = { fromNodeId: node.id, fromPinId: pinId, kind: kind || 'pose', start };
            this.tempPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            this.tempPath.setAttribute('class', `sm-anim-temp-connection kind-${this.connectionState.kind}`);
            this.tempPath.setAttribute('fill', 'none');
            this.tempPath.setAttribute('stroke-width', '2');
            this.tempPath.setAttribute('vector-effect', 'non-scaling-stroke');
            this.svg.appendChild(this.tempPath);
            const move = e => {
                if (!this.connectionState) return;
                const p = this.clientToGraph(e.clientX, e.clientY);
                this.tempPath?.setAttribute('d', window.AnimationGraphConnection.makeBezierPath(start.x, start.y, p.x, p.y));
            };
            const up = e => {
                if (!this.connectionState) return;
                const target = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('.sm-anim-pin-input');
                if (target) {
                    const toNodeId = target.dataset.nodeId;
                    const toPinId = target.dataset.pinId;
                    this.connect(this.connectionState.fromNodeId, this.connectionState.fromPinId, toNodeId, toPinId, this.connectionState.kind);
                }
                this.tempPath?.remove();
                this.tempPath = null;
                this.connectionState = null;
                window.removeEventListener('pointermove', move);
                window.removeEventListener('pointerup', up);
                window.removeEventListener('pointercancel', up);
            };
            window.addEventListener('pointermove', move);
            window.addEventListener('pointerup', up);
            window.addEventListener('pointercancel', up);
        },
        selectNode(node, additive = false) {
            if (!additive) this.clearSelection(false);
            if (additive && this.selectedNodes.has(node.id)) {
                this.selectedNodes.delete(node.id);
                node.setSelected(false);
                return;
            }
            this.selectedNodes.add(node.id);
            node.setSelected(true);
            this.selectedConnection?.setSelected(false);
            this.selectedConnection = null;
            this._showNodeDetails(node);
        },
        selectConnection(connection) {
            this.clearSelection(false);
            this.selectedConnection?.setSelected(false);
            this.selectedConnection = connection;
            connection.setSelected(true);
        },
        clearSelection(clearDetails = true) {
            this.selectedNodes.forEach(id => this.nodes.get(id)?.setSelected(false));
            this.selectedNodes.clear();
            this.selectedConnection?.setSelected(false);
            this.selectedConnection = null;
            if (clearDetails) this._clearDetails();
        },
        deleteSelection() {
            if (this.selectedConnection) {
                this.removeConnection(this.selectedConnection.id);
                this.selectedConnection = null;
                return;
            }
            const ids = [...this.selectedNodes];
            ids.forEach(id => {
                const node = this.nodes.get(id);
                if (node?.type === 'entry' || node?.type === 'output') return;
                this.removeNode(id);
            });
            this.clearSelection();
        },
        updateConnectionsForNode(nodeId) {
            this.connections.forEach(connection => {
                if (connection.fromNodeId === nodeId || connection.toNodeId === nodeId) connection.update();
            });
        },
        getPinGraphPosition(pinElement) {
            if (!pinElement || !this.canvas) return null;

            const pinRect = pinElement.getBoundingClientRect();
            const containerRect = this.canvas.getBoundingClientRect();

            // 1. Kanakhdo l-centre dial l-pin (Diamond icon)
            const pinCenterX = pinRect.left + pinRect.width / 2;
            const pinCenterY = pinRect.top + pinRect.height / 2;

            // 2. Kan-convertiw mn screen space l-graph space (m3a Zoom w Pan)
            const zoom = this.zoom || 1;
            const panX = this.panX || 0;
            const panY = this.panY || 0;

            return {
                x: (pinCenterX - containerRect.left - panX) / zoom,
                y: (pinCenterY - containerRect.top - panY) / zoom
            };
        },
        clientToGraph(clientX, clientY) {
            const rect = this.canvas.getBoundingClientRect();
            return { x: (clientX - rect.left - this.panX) / this.zoom, y: (clientY - rect.top - this.panY) / this.zoom };
        },
        screenToGraph(screenX, screenY) {
            return { x: (screenX - this.panX) / this.zoom, y: (screenY - this.panY) / this.zoom };
        },
        _applyTransform() {
            if (!this.stage) return;
            this.stage.style.transform = `translate(${this.panX}px,${this.panY}px) scale(${this.zoom})`;
            this.canvas?.style.setProperty('--anim-grid-size', `${20 * this.zoom}px`);
            this.canvas?.style.setProperty('--anim-grid-x', `${this.panX}px`);
            this.canvas?.style.setProperty('--anim-grid-y', `${this.panY}px`);
        },
        _openContextMenu(event) {
            this._closeContextMenu();
            const graphPos = this.clientToGraph(event.clientX, event.clientY);
            const menu = document.createElement('div');
            menu.className = 'sm-anim-context-menu';
            menu.style.left = `${event.clientX}px`;
            menu.style.top = `${event.clientY}px`;
            const items = [
                ['clip', 'Animation Clip'],
                ['stateMachine', 'State Machine'],
                ['blendSpace1D', 'Blend Space 1D'],
                ['blendSpace2D', 'Blend Space 2D'],
                ['blendByBool', 'Blend By Bool'],
                ['blendByFloat', 'Blend By Float']
            ];
            items.forEach(([type, label]) => {
                const button = document.createElement('button');
                button.type = 'button';
                button.textContent = label;
                button.addEventListener('click', () => {
                    const node = this.addNode({ type, title: label, x: graphPos.x, y: graphPos.y, data: this._defaultDataForType(type) });
                    this.selectNode(node);
                    this._closeContextMenu();
                });
                menu.appendChild(button);
            });
            document.body.appendChild(menu);
            this.contextMenu = menu;
            setTimeout(() => {
                const close = e => {
                    if (!menu.contains(e.target)) {
                        this._closeContextMenu();
                        window.removeEventListener('pointerdown', close, true);
                    }
                };
                window.addEventListener('pointerdown', close, true);
            }, 0);
        },
        _defaultDataForType(type) {
            if (type === 'clip') return { clip: 'Idle', loop: true, playRate: 1 };
            if (type === 'stateMachine') return { machine: 'Locomotion' };
            if (type === 'blendSpace1D') return { parameter: 'Speed', min: 0, max: 6, samples: [{ value: 0, clip: 'Idle' }, { value: 2.5, clip: 'Walk' }, { value: 6, clip: 'Run' }] };
            if (type === 'blendSpace2D') return { parameterX: 'Direction', parameterY: 'Speed', minX: -180, maxX: 180, minY: 0, maxY: 6, samples: [] };
            if (type === 'blendByBool') return { parameter: 'IsGrounded' };
            if (type === 'blendByFloat') return { parameter: 'BlendAlpha' };
            return {};
        },
        _closeContextMenu() {
            this.contextMenu?.remove();
            this.contextMenu = null;
        },
        _showNodeDetails(node) {
            const host = document.getElementById('anim-node-details');
            if (!host) return;
            host.innerHTML = '';
            const wrapper = document.createElement('div');
            wrapper.className = 'sm-anim-details-form';
            const makeField = (label, value, onChange, type = 'text') => {
                const row = document.createElement('label');
                row.className = 'sm-anim-detail-row';
                const name = document.createElement('span');
                name.textContent = label;
                const input = document.createElement('input');
                input.type = type;
                input.value = value ?? '';
                input.addEventListener('change', () => onChange(input.value));
                row.appendChild(name);
                row.appendChild(input);
                return row;
            };
            wrapper.appendChild(makeField('Name', node.title, value => { node.setTitle(value); this.markDirty(); }));
            if (node.type === 'clip') wrapper.appendChild(makeField('Clip', node.data.clip || '', value => node.setData('clip', value)));
            if (node.type === 'stateMachine') wrapper.appendChild(makeField('Machine', node.data.machine || '', value => node.setData('machine', value)));
            if (node.type === 'blendSpace1D') wrapper.appendChild(makeField('Parameter', node.data.parameter || 'Speed', value => node.setData('parameter', value)));
            if (node.type === 'blendSpace2D') {
                wrapper.appendChild(makeField('X Parameter', node.data.parameterX || 'Direction', value => node.setData('parameterX', value)));
                wrapper.appendChild(makeField('Y Parameter', node.data.parameterY || 'Speed', value => node.setData('parameterY', value)));
            }
            if (node.type === 'blendByBool' || node.type === 'blendByFloat') wrapper.appendChild(makeField('Parameter', node.data.parameter || '', value => node.setData('parameter', value)));
            host.appendChild(wrapper);
        },
        _clearDetails() {
            const host = document.getElementById('anim-node-details');
            if (!host) return;
            host.innerHTML = '<div class="anim-empty-details"><i class="fas fa-mouse-pointer"></i><span>Select a node to edit its properties</span></div>';
        },
        openNode(node) {
            if (node.type === 'stateMachine') {
                window.dispatchEvent(new CustomEvent('sm:animation-state-machine-open', { detail: { nodeId: node.id, name: node.data.machine || node.title } }));
                console.log('[AnimationGraphEditor] Open State Machine:', node.data.machine || node.title);
                return;
            }
            if (node.type === 'blendSpace1D' || node.type === 'blendSpace2D') {
                window.dispatchEvent(new CustomEvent('sm:animation-blend-space-open', { detail: { nodeId: node.id, type: node.type, data: { ...node.data } } }));
                console.log('[AnimationGraphEditor] Open Blend Space:', node.title);
            }
        },
        serialize() {
            return { version: 1, workspace: this.workspace, view: { zoom: this.zoom, panX: this.panX, panY: this.panY }, nodes: [...this.nodes.values()].map(n => n.toJSON()), connections: [...this.connections.values()].map(c => c.toJSON()) };
        },
        deserialize(data) {
            if (!data || !Array.isArray(data.nodes)) return false;
            this.nodes.forEach(node => node.destroy());
            this.connections.forEach(connection => connection.destroy());
            this.nodes.clear();
            this.connections.clear();
            (data.nodes || []).forEach(config => this.addNode(config));
            (data.connections || []).forEach(config => {
                const connection = new window.AnimationGraphConnection(this, config);
                this.connections.set(connection.id, connection);
                connection.render(this.svg);
            });
            if (data.view) {
                this.zoom = Number.isFinite(data.view.zoom) ? Math.max(this.minZoom, Math.min(this.maxZoom, data.view.zoom)) : 1;
                this.panX = Number.isFinite(data.view.panX) ? data.view.panX : 0;
                this.panY = Number.isFinite(data.view.panY) ? data.view.panY : 0;
            }
            this.workspace = data.workspace || 'anim-graph';
            this._applyTransform();
            this.dirty = false;
            return true;
        },
        compile() {
            const errors = [];
            const warnings = [];
            const entryNodes = [...this.nodes.values()].filter(n => n.type === 'entry');
            const outputNodes = [...this.nodes.values()].filter(n => n.type === 'output');
            if (entryNodes.length !== 1) errors.push(`Animation Graph requires exactly one Entry node. Found ${entryNodes.length}.`);
            if (outputNodes.length !== 1) errors.push(`Animation Graph requires exactly one Output Pose node. Found ${outputNodes.length}.`);
            if (outputNodes.length === 1) {
                const output = outputNodes[0];
                const incoming = [...this.connections.values()].filter(c => c.toNodeId === output.id && c.toPinId === 'pose');
                if (incoming.length !== 1) errors.push('Output Pose must have exactly one pose connection.');
            }
            this.nodes.forEach(node => {
                node.inputs.filter(pin => pin.required).forEach(pin => {
                    const linked = [...this.connections.values()].some(c => c.toNodeId === node.id && c.toPinId === pin.id);
                    if (!linked && node.type !== 'output') warnings.push(`${node.title}: input "${pin.label || pin.id}" is not connected.`);
                });
                if (node.type === 'clip' && !node.data.clip) errors.push(`${node.title}: no animation clip is assigned.`);
                if (node.type === 'blendSpace1D' && (!Array.isArray(node.data.samples) || node.data.samples.length < 2)) warnings.push(`${node.title}: Blend Space 1D should contain at least two samples.`);
            });
            const serialized = this.serialize();
            if (errors.length) {
                const result = { success: false, errors, warnings, graph: serialized };
                this._setCompileStatus(result);
                return result;
            }
            let compiled = { version: 1, type: 'SMAnimationGraph', parameters: this._collectParameters(), nodes: serialized.nodes, connections: serialized.connections, outputNodeId: outputNodes[0]?.id || null };
            try {
                if (window.PlayerAnimationGraphCompiler) {
                    if (typeof window.PlayerAnimationGraphCompiler.compile === 'function') compiled = window.PlayerAnimationGraphCompiler.compile(serialized) || compiled;
                    else if (typeof window.PlayerAnimationGraphCompiler === 'function') {
                        const compiler = new window.PlayerAnimationGraphCompiler();
                        compiled = compiler.compile?.(serialized) || compiled;
                    }
                }
            } catch (error) {
                errors.push(error?.message || String(error));
            }
            const result = { success: errors.length === 0, errors, warnings, graph: serialized, compiled };
            if (result.success) {
                window.SMCompiledPlayerAnimationGraph = compiled;
                localStorage.setItem('sm_player_animation_graph_compiled', JSON.stringify(compiled));
                this.dirty = false;
            }
            this._setCompileStatus(result);
            return result;
        },
        _collectParameters() {
            const parameters = { Speed: { type: 'float', default: 0 }, Direction: { type: 'float', default: 0 }, IsGrounded: { type: 'bool', default: true }, IsRunning: { type: 'bool', default: false } };
            this.nodes.forEach(node => {
                if (node.data?.parameter && !parameters[node.data.parameter]) {
                    parameters[node.data.parameter] = { type: node.type === 'blendByBool' ? 'bool' : 'float', default: node.type === 'blendByBool' ? false : 0 };
                }
                if (node.data?.parameterX && !parameters[node.data.parameterX]) parameters[node.data.parameterX] = { type: 'float', default: 0 };
                if (node.data?.parameterY && !parameters[node.data.parameterY]) parameters[node.data.parameterY] = { type: 'float', default: 0 };
            });
            return parameters;
        },
        _setCompileStatus(result) {
            const status = document.getElementById('anim-compile-status');
            if (status) {
                status.classList.remove('success', 'error');
                status.textContent = result.success ? 'Compiled' : `Error (${result.errors.length})`;
                status.classList.add(result.success ? 'success' : 'error');
            }
            if (result.errors?.length) console.error('[AnimationGraphEditor] Compile errors:', result.errors);
            if (result.warnings?.length) console.warn('[AnimationGraphEditor] Compile warnings:', result.warnings);
        },
        save() {
            try {
                const data = this.serialize();
                localStorage.setItem('sm_player_animation_graph', JSON.stringify(data));
                this.dirty = false;
                console.log('[AnimationGraphEditor] saved');
                return data;
            } catch (error) {
                console.error('[AnimationGraphEditor] save failed:', error);
                return null;
            }
        },
        _loadSavedGraph() {
            try {
                const raw = localStorage.getItem('sm_player_animation_graph');
                return raw ? JSON.parse(raw) : null;
            } catch (error) {
                console.warn('[AnimationGraphEditor] Saved graph is invalid:', error);
                return null;
            }
        },
        markDirty() {
            this.dirty = true;
            const status = document.getElementById('anim-compile-status');
            if (status && status.textContent === 'Compiled') {
                status.textContent = 'Modified';
                status.classList.remove('success', 'error');
            }
        },
        setWorkspace(section) {
            this.workspace = section || 'anim-graph';
            if (this.workspace === 'anim-graph') return;
            console.log(`[AnimationGraphEditor] Workspace requested: ${this.workspace}`);
        },
        playPreview() {
            window.playerAnimationController?.play?.();
            window.playerAnimationController?.resume?.();
        },
        stopPreview() {
            window.playerAnimationController?.stop?.();
            window.playerAnimationController?.stopAll?.();
        },
        resize() {
            this.connections.forEach(connection => connection.update());
        },
        frameAll() {
            if (!this.canvas || !this.nodes.size) return;
            const nodes = [...this.nodes.values()];
            const minX = Math.min(...nodes.map(n => n.x));
            const minY = Math.min(...nodes.map(n => n.y));
            const maxX = Math.max(...nodes.map(n => n.x + n.width));
            const maxY = Math.max(...nodes.map(n => n.y + 120));
            const rect = this.canvas.getBoundingClientRect();
            const graphW = Math.max(1, maxX - minX);
            const graphH = Math.max(1, maxY - minY);
            this.zoom = Math.max(this.minZoom, Math.min(1.25, Math.min((rect.width - 120) / graphW, (rect.height - 120) / graphH)));
            this.panX = rect.width / 2 - (minX + graphW / 2) * this.zoom;
            this.panY = rect.height / 2 - (minY + graphH / 2) * this.zoom;
            this._applyTransform();
        },
        destroy() {
            this._closeContextMenu?.();
            if (this.canvas) {
                if (this._onPointerDown) this.canvas.removeEventListener('pointerdown', this._onPointerDown);
                if (this._onContextMenu) this.canvas.removeEventListener('contextmenu', this._onContextMenu);
                if (this._onWheel) this.canvas.removeEventListener('wheel', this._onWheel);
            }
            if (this._onKeyDown) window.removeEventListener('keydown', this._onKeyDown);
            this.nodes?.forEach?.(node => node.destroy());
            this.connections?.forEach?.(connection => connection.destroy());
            this.canvas = null;
            this.viewport = null;
            this.stage = null;
            this.svg = null;
            this.nodes = new Map();
            this.connections = new Map();
            this.selectedNodes = new Set();
            this.initialized = false;
        },
        _injectStyles() {
            if (document.getElementById('sm-animation-graph-editor-styles')) return;
            const style = document.createElement('style');
            style.id = 'sm-animation-graph-editor-styles';
            style.textContent = `.sm-animation-graph-canvas{--anim-grid-size:20px;--anim-grid-x:0px;--anim-grid-y:0px;position:absolute;inset:29px 0 24px 0;overflow:hidden;background-color:#242424;background-image:linear-gradient(#303030 1px,transparent 1px),linear-gradient(90deg,#303030 1px,transparent 1px);background-size:var(--anim-grid-size) var(--anim-grid-size);background-position:var(--anim-grid-x) var(--anim-grid-y);touch-action:none}.sm-anim-viewport{position:absolute;inset:0;overflow:hidden}.sm-anim-stage{position:absolute;left:0;top:0;width:6000px;height:4000px;transform-origin:0 0}.sm-anim-svg{position:absolute;left:0;top:0;width:6000px;height:4000px;overflow:visible;pointer-events:none}.sm-anim-connection,.sm-anim-temp-connection{stroke:#aaa;pointer-events:stroke}.sm-anim-connection.kind-exec,.sm-anim-temp-connection.kind-exec{stroke:#d8d8d8}.sm-anim-connection.kind-float,.sm-anim-temp-connection.kind-float,.sm-anim-connection.kind-number,.sm-anim-temp-connection.kind-number{stroke:#9db9a1}.sm-anim-connection.kind-bool,.sm-anim-temp-connection.kind-bool{stroke:#b49aad}.sm-anim-connection.selected{stroke-width:4}.sm-anim-graph-node{position:absolute;min-height:78px;background:#343434;border:1px solid #515151;box-shadow:0 5px 18px rgba(0,0,0,.25);user-select:none;z-index:2}.sm-anim-graph-node.selected{outline:1px solid #a7a7a7;box-shadow:0 0 0 1px #777,0 6px 20px rgba(0,0,0,.32)}.sm-anim-node-header{height:29px;display:flex;align-items:center;gap:7px;padding:0 8px;background:#454545;cursor:move}.sm-anim-node-stateMachine .sm-anim-node-header{background:#4b4b4b}.sm-anim-node-entry .sm-anim-node-header{background:#3f4a42}.sm-anim-node-output .sm-anim-node-header{background:#514344}.sm-anim-node-type{min-width:20px;height:18px;padding:0 4px;display:grid;place-items:center;background:#2c2c2c;font-size:9px;color:#ccc}.sm-anim-node-title{font-size:11px;font-weight:600;color:#eee;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.sm-anim-node-content{min-height:54px;display:grid;grid-template-columns:minmax(42px,auto) 1fr minmax(42px,auto);align-items:center;padding:6px 0}.sm-anim-node-inputs,.sm-anim-node-outputs{display:flex;flex-direction:column;gap:5px}.sm-anim-node-center{min-width:0;padding:0 5px;text-align:center}.sm-anim-node-caption{font-size:9px;color:#a5a5a5;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.sm-anim-pin-row{height:18px;display:flex;align-items:center;gap:4px}.sm-anim-pin-row.input{justify-content:flex-start}.sm-anim-pin-row.output{justify-content:flex-end}.sm-anim-pin{width:10px;height:10px;min-width:10px;padding:0;border:1px solid #202020;background:#b0b0b0;transform:rotate(45deg);cursor:crosshair}.sm-anim-pin.kind-exec{background:#dedede}.sm-anim-pin.kind-pose{background:#a9a9a9}.sm-anim-pin.kind-float,.sm-anim-pin.kind-number{background:#91ad96}.sm-anim-pin.kind-bool{background:#ad8ea3}.sm-anim-pin-label{font-size:9px;color:#aaa;white-space:nowrap}.sm-anim-context-menu{position:fixed;z-index:999999;width:190px;padding:4px;background:#2d2d2d;border:1px solid #555;box-shadow:0 10px 28px rgba(0,0,0,.4)}.sm-anim-context-menu button{width:100%;height:29px;padding:0 9px;border:0;background:transparent;color:#ddd;text-align:left;font-size:11px;cursor:pointer}.sm-anim-context-menu button:hover{background:#474747;color:#fff}.sm-anim-details-form{padding:7px}.sm-anim-detail-row{min-height:31px;display:grid;grid-template-columns:80px 1fr;align-items:center;gap:6px;border-bottom:1px solid #3c3c3c;font-size:10px;color:#aaa}.sm-anim-detail-row input{width:100%;min-width:0;height:23px;padding:0 5px;border:1px solid #4a4a4a;border-radius:0;background:#292929;color:#e5e5e5;outline:none}.sm-anim-detail-row input:focus{border-color:#707070}`;
            document.head.appendChild(style);
        }
    };
    window.AnimationGraphEditor = Editor;
})();
