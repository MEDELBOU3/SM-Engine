// SM Engine - AnimationGraphNode
(function () {
    let NODE_COUNTER = 0;
    class AnimationGraphNode {
        constructor(editor, config = {}) {
            this.editor = editor;
            this.id = config.id || `anim_node_${Date.now()}_${++NODE_COUNTER}`;
            this.type = config.type || 'clip';
            this.title = config.title || this._defaultTitle(this.type);
            this.x = Number.isFinite(config.x) ? config.x : 0;
            this.y = Number.isFinite(config.y) ? config.y : 0;
            this.width = Number.isFinite(config.width) ? config.width : 190;
            this.data = { ...(config.data || {}) };
            this.inputs = Array.isArray(config.inputs) ? config.inputs.map(p => ({ ...p })) : this._defaultInputs(this.type);
            this.outputs = Array.isArray(config.outputs) ? config.outputs.map(p => ({ ...p })) : this._defaultOutputs(this.type);
            this.element = null;
            this.pinElements = { input: new Map(), output: new Map() };
        }
        _defaultTitle(type) {
            const names = { entry: 'Entry', output: 'Output Pose', stateMachine: 'State Machine', clip: 'Animation Clip', blendSpace1D: 'Blend Space 1D', blendSpace2D: 'Blend Space 2D', blendByBool: 'Blend By Bool', blendByFloat: 'Blend By Float' };
            return names[type] || 'Animation Node';
        }
        _defaultInputs(type) {
            if (type === 'entry') return [];
            if (type === 'output') return [{ id: 'pose', label: 'Pose', kind: 'pose', required: true }];
            if (type === 'stateMachine') return [{ id: 'in', label: 'In', kind: 'exec', required: false }];
            if (type === 'clip') return [];
            if (type === 'blendSpace1D') return [{ id: 'value', label: 'Value', kind: 'float', required: false }];
            if (type === 'blendSpace2D') return [{ id: 'x', label: 'X', kind: 'float', required: false }, { id: 'y', label: 'Y', kind: 'float', required: false }];
            if (type === 'blendByBool') return [{ id: 'condition', label: 'Condition', kind: 'bool', required: false }, { id: 'falsePose', label: 'False', kind: 'pose', required: true }, { id: 'truePose', label: 'True', kind: 'pose', required: true }];
            if (type === 'blendByFloat') return [{ id: 'alpha', label: 'Alpha', kind: 'float', required: false }, { id: 'a', label: 'A', kind: 'pose', required: true }, { id: 'b', label: 'B', kind: 'pose', required: true }];
            return [{ id: 'in', label: 'In', kind: 'pose', required: false }];
        }
        _defaultOutputs(type) {
            if (type === 'output') return [];
            if (type === 'entry') return [{ id: 'next', label: '', kind: 'exec' }];
            if (type === 'stateMachine' || type === 'clip' || type === 'blendSpace1D' || type === 'blendSpace2D' || type === 'blendByBool' || type === 'blendByFloat') return [{ id: 'pose', label: 'Pose', kind: 'pose' }];
            return [{ id: 'out', label: 'Out', kind: 'pose' }];
        }
        render(parent) {
            if (this.element) this.element.remove();
            const el = document.createElement('div');
            el.className = `sm-anim-graph-node sm-anim-node-${this.type}`;
            el.dataset.nodeId = this.id;
            el.style.left = `${this.x}px`;
            el.style.top = `${this.y}px`;
            el.style.width = `${this.width}px`;
            el.innerHTML = `<div class="sm-anim-node-header"><span class="sm-anim-node-type">${this._typeBadge()}</span><span class="sm-anim-node-title"></span></div><div class="sm-anim-node-content"><div class="sm-anim-node-inputs"></div><div class="sm-anim-node-center"></div><div class="sm-anim-node-outputs"></div></div>`;
            el.querySelector('.sm-anim-node-title').textContent = this.title;
            this.element = el;
            this._renderPins();
            this._renderCenter();
            this._bindEvents();
            parent.appendChild(el);
            return el;
        }
        _typeBadge() {
            const badges = { entry: 'E', output: 'O', stateMachine: 'SM', clip: 'A', blendSpace1D: '1D', blendSpace2D: '2D', blendByBool: 'B', blendByFloat: 'F' };
            return badges[this.type] || 'N';
        }
        _renderPins() {
            this.pinElements.input.clear();
            this.pinElements.output.clear();
            const inputHost = this.element.querySelector('.sm-anim-node-inputs');
            const outputHost = this.element.querySelector('.sm-anim-node-outputs');
            this.inputs.forEach(pin => {
                const row = this._createPinRow(pin, 'input');
                inputHost.appendChild(row);
            });
            this.outputs.forEach(pin => {
                const row = this._createPinRow(pin, 'output');
                outputHost.appendChild(row);
            });
        }
        _createPinRow(pin, direction) {
            const row = document.createElement('div');
            row.className = `sm-anim-pin-row ${direction}`;
            const dot = document.createElement('button');
            dot.type = 'button';
            dot.className = `sm-anim-pin sm-anim-pin-${direction} kind-${pin.kind || 'pose'}`;
            dot.dataset.nodeId = this.id;
            dot.dataset.pinId = pin.id;
            dot.dataset.direction = direction;
            dot.dataset.kind = pin.kind || 'pose';
            dot.title = `${pin.label || pin.id} (${pin.kind || 'pose'})`;
            const label = document.createElement('span');
            label.className = 'sm-anim-pin-label';
            label.textContent = pin.label || '';
            if (direction === 'input') {
                row.appendChild(dot);
                row.appendChild(label);
            } else {
                row.appendChild(label);
                row.appendChild(dot);
            }
            this.pinElements[direction].set(pin.id, dot);
            return row;
        }
        _renderCenter() {
            const center = this.element.querySelector('.sm-anim-node-center');
            if (this.type === 'clip') {
                center.innerHTML = `<span class="sm-anim-node-caption">${this.data.clip || 'No clip selected'}</span>`;
            } else if (this.type === 'stateMachine') {
                center.innerHTML = `<span class="sm-anim-node-caption">${this.data.machine || 'Locomotion'}</span>`;
            } else if (this.type === 'blendSpace1D') {
                center.innerHTML = `<span class="sm-anim-node-caption">${this.data.parameter || 'Speed'}</span>`;
            } else if (this.type === 'blendSpace2D') {
                center.innerHTML = `<span class="sm-anim-node-caption">${this.data.parameterX || 'Direction'} / ${this.data.parameterY || 'Speed'}</span>`;
            } else if (this.type === 'blendByBool') {
                center.innerHTML = `<span class="sm-anim-node-caption">${this.data.parameter || 'Boolean'}</span>`;
            } else if (this.type === 'blendByFloat') {
                center.innerHTML = `<span class="sm-anim-node-caption">${this.data.parameter || 'Alpha'}</span>`;
            } else if (this.type === 'output') {
                center.innerHTML = '<span class="sm-anim-node-caption">Final skeletal pose</span>';
            } else if (this.type === 'entry') {
                center.innerHTML = '<span class="sm-anim-node-caption">Graph start</span>';
            }
        }
        _bindEvents() {
            const header = this.element.querySelector('.sm-anim-node-header');
            header.addEventListener('pointerdown', event => {
                if (event.button !== 0) return;
                event.stopPropagation();
                this.editor?.beginNodeDrag?.(this, event);
            });
            this.element.addEventListener('pointerdown', event => {
                if (event.target.closest('.sm-anim-pin')) return;
                this.editor?.selectNode?.(this, event.shiftKey);
            });
            this.element.addEventListener('dblclick', event => {
                if (event.target.closest('.sm-anim-pin')) return;
                event.stopPropagation();
                this.editor?.openNode?.(this);
            });
            this.element.querySelectorAll('.sm-anim-pin').forEach(pin => {
                pin.addEventListener('pointerdown', event => {
                    if (event.button !== 0) return;
                    event.preventDefault();
                    event.stopPropagation();
                    this.editor?.beginConnection?.(this, pin.dataset.pinId, pin.dataset.direction, pin.dataset.kind, event);
                });
            });
        }
        setSelected(selected) {
            this.element?.classList.toggle('selected', !!selected);
        }
        setPosition(x, y) {
            this.x = Math.round(x);
            this.y = Math.round(y);
            if (this.element) {
                this.element.style.left = `${this.x}px`;
                this.element.style.top = `${this.y}px`;
            }
            this.editor?.updateConnectionsForNode?.(this.id);
        }
        setTitle(title) {
            this.title = String(title || this.title);
            const titleEl = this.element?.querySelector('.sm-anim-node-title');
            if (titleEl) titleEl.textContent = this.title;
        }
        setData(key, value) {
            this.data[key] = value;
            this._renderCenter();
            this.editor?.markDirty?.();
        }
        getPinElement(direction, pinId) {
            return this.pinElements?.[direction]?.get(pinId) || null;
        }
        getPin(direction, pinId) {
            const list = direction === 'input' ? this.inputs : this.outputs;
            return list.find(pin => pin.id === pinId) || null;
        }
        toJSON() {
            return { id: this.id, type: this.type, title: this.title, x: this.x, y: this.y, width: this.width, data: { ...this.data }, inputs: this.inputs.map(p => ({ ...p })), outputs: this.outputs.map(p => ({ ...p })) };
        }
        destroy() {
            this.element?.remove();
            this.element = null;
            this.pinElements.input.clear();
            this.pinElements.output.clear();
        }
    }
    window.AnimationGraphNode = AnimationGraphNode;
})();