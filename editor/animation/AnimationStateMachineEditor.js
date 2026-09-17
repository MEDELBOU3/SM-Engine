// SM Engine - AnimationStateMachineEditor
(function () {
    const StateMachineEditor = {
        canvas: null,
        viewport: null,
        stage: null,
        svg: null,
        labelLayer: null,
        states: new Map(),
        transitions: new Map(),
        selectedStates: new Set(),
        selectedTransition: null,
        zoom: 1,
        panX: 0,
        panY: 0,
        minZoom: 0.3,
        maxZoom: 2.2,
        machineName: 'Locomotion',
        machineNodeId: null,
        dragState: null,
        panState: null,
        transitionState: null,
        tempPath: null,
        contextMenu: null,
        initialized: false,
        dirty: false,
        graphSnapshot: null,
        init(canvas, options = {}) {
            if (!canvas) return false;
            if (typeof window.AnimationStateNode !== 'function' || typeof window.AnimationTransition !== 'function') {
                console.error('[AnimationStateMachineEditor] Required state node files are not loaded.');
                return false;
            }
            this.canvas = canvas;
            this.machineName = options.name || 'Locomotion';
            this.machineNodeId = options.nodeId || null;
            this.graphSnapshot = window.AnimationGraphEditor?.serialize?.() || null;
            window.AnimationGraphEditor?.save?.();
            window.AnimationGraphEditor?.destroy?.();
            this.states = new Map();
            this.transitions = new Map();
            this.selectedStates = new Set();
            this.selectedTransition = null;
            this.zoom = 1;
            this.panX = 0;
            this.panY = 0;
            this._injectStyles();
            this._buildCanvas();
            this._bindEvents();
            const saved = this._loadMachine();
            if (saved) this.deserialize(saved); else this._createDefaultLocomotionMachine();
            this._applyTransform();
            this._updateBreadcrumb();
            this.initialized = true;
            this.resize();
            console.log('[AnimationStateMachineEditor] opened:', this.machineName);
            return true;
        },
        _buildCanvas() {
            this.canvas.innerHTML = '';
            this.canvas.classList.add('sm-animation-state-machine-canvas');
            this.viewport = document.createElement('div');
            this.viewport.className = 'sm-sm-viewport';
            this.stage = document.createElement('div');
            this.stage.className = 'sm-sm-stage';
            this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            this.svg.setAttribute('class', 'sm-sm-svg');
            this.svg.setAttribute('width', '6000');
            this.svg.setAttribute('height', '4000');
            this.svg.setAttribute('viewBox', '0 0 6000 4000');
            this.labelLayer = document.createElement('div');
            this.labelLayer.className = 'sm-sm-label-layer';
            this.stage.appendChild(this.svg);
            this.stage.appendChild(this.labelLayer);
            this.viewport.appendChild(this.stage);
            this.canvas.appendChild(this.viewport);
            this.backButton = document.createElement('button');
            this.backButton.type = 'button';
            this.backButton.className = 'sm-sm-back-btn';
            this.backButton.innerHTML = '<i class="fas fa-arrow-left"></i> Anim Graph';
            this.backButton.addEventListener('click', () => this.close());
            this.canvas.appendChild(this.backButton);
        },
        _bindEvents() {
            this._onPointerDown = event => {
                if (event.target.closest('.sm-anim-state-node') || event.target.closest('.sm-anim-transition-label') || event.target.closest('.sm-sm-back-btn') || event.target.closest('.sm-sm-context-menu')) return;
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
                if (event.target.closest('.sm-anim-state-node')) return;
                this._openContextMenu(event);
            };
            this._onWheel = event => {
                event.preventDefault();
                const rect = this.canvas.getBoundingClientRect();
                const mouseX = event.clientX - rect.left;
                const mouseY = event.clientY - rect.top;
                const before = this.screenToGraph(mouseX, mouseY);
                this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom * (event.deltaY < 0 ? 1.1 : 0.9)));
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
                if (event.key === 'Escape' && this.transitionState) this._cancelTransition();
            };
            this.canvas.addEventListener('pointerdown', this._onPointerDown);
            this.canvas.addEventListener('contextmenu', this._onContextMenu);
            this.canvas.addEventListener('wheel', this._onWheel, { passive: false });
            window.addEventListener('keydown', this._onKeyDown);
        },
        _createDefaultLocomotionMachine() {
            const entry = this.addState({ type: 'entry', name: 'Entry', x: 80, y: 250 });
            const locomotion = this.addState({ name: 'Locomotion', x: 360, y: 220, data: { motionType: 'blendSpace1D', parameter: 'Speed', samples: [{ value: 0, clip: 'Idle' }, { value: 2.5, clip: 'Walk' }, { value: 6, clip: 'Run' }] } });
            const jump = this.addState({ name: 'Jump', x: 700, y: 110, data: { motionType: 'clip', clip: 'Jump' } });
            const fall = this.addState({ name: 'Fall', x: 980, y: 210, data: { motionType: 'clip', clip: 'Fall' } });
            const land = this.addState({ name: 'Land', x: 720, y: 390, data: { motionType: 'clip', clip: 'Land' } });
            this.addTransition({ fromStateId: entry.id, toStateId: locomotion.id, duration: 0, conditions: [] });
            this.addTransition({ fromStateId: locomotion.id, toStateId: jump.id, duration: 0.12, conditions: [{ parameter: 'IsGrounded', operator: '==', value: false }, { parameter: 'VerticalSpeed', operator: '>', value: 0.05 }] });
            this.addTransition({ fromStateId: jump.id, toStateId: fall.id, duration: 0.12, conditions: [{ parameter: 'VerticalSpeed', operator: '<=', value: 0 }] });
            this.addTransition({ fromStateId: fall.id, toStateId: land.id, duration: 0.08, conditions: [{ parameter: 'IsGrounded', operator: '==', value: true }] });
            this.addTransition({ fromStateId: land.id, toStateId: locomotion.id, duration: 0.16, conditions: [{ parameter: 'IsGrounded', operator: '==', value: true }] });
            this.dirty = false;
        },
        addState(config = {}) {
            if (config.type === 'entry') {
                const existing = [...this.states.values()].find(s => s.type === 'entry');
                if (existing) return existing;
            }
            const state = new window.AnimationStateNode(this, config);
            this.states.set(state.id, state);
            state.render(this.stage);
            this.markDirty();
            return state;
        },
        removeState(stateId) {
            const state = this.states.get(stateId);
            if (!state || state.type === 'entry') return false;
            [...this.transitions.values()].forEach(t => {
                if (t.fromStateId === stateId || t.toStateId === stateId) this.removeTransition(t.id);
            });
            this.selectedStates.delete(stateId);
            state.destroy();
            this.states.delete(stateId);
            this.markDirty();
            return true;
        },
        addTransition(config = {}) {
            if (!this.states.has(config.fromStateId) || !this.states.has(config.toStateId) || config.fromStateId === config.toStateId) return null;
            const duplicate = [...this.transitions.values()].find(t => t.fromStateId === config.fromStateId && t.toStateId === config.toStateId);
            if (duplicate) return duplicate;
            const transition = new window.AnimationTransition(this, config);
            this.transitions.set(transition.id, transition);
            transition.render(this.svg, this.labelLayer);
            this.markDirty();
            return transition;
        },
        removeTransition(id) {
            const transition = this.transitions.get(id);
            if (!transition) return false;
            transition.destroy();
            this.transitions.delete(id);
            if (this.selectedTransition === transition) this.selectedTransition = null;
            this.markDirty();
            return true;
        },
        beginStateDrag(state, event) {
            this.selectState(state, event.shiftKey);
            const start = this.clientToGraph(event.clientX, event.clientY);
            const starts = new Map();
            this.selectedStates.forEach(id => {
                const s = this.states.get(id);
                if (s) starts.set(id, { x: s.x, y: s.y });
            });
            this.dragState = { pointerId: event.pointerId, start, starts };
            const move = e => {
                if (!this.dragState || e.pointerId !== this.dragState.pointerId) return;
                const p = this.clientToGraph(e.clientX, e.clientY);
                const dx = p.x - this.dragState.start.x;
                const dy = p.y - this.dragState.start.y;
                this.dragState.starts.forEach((pos, id) => {
                    const s = this.states.get(id);
                    if (s) s.setPosition(pos.x + dx, pos.y + dy);
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
            const baseX = this.panX;
            const baseY = this.panY;
            this.panState = { pointerId: event.pointerId };
            const move = e => {
                if (!this.panState || e.pointerId !== this.panState.pointerId) return;
                this.panX = baseX + (e.clientX - startX);
                this.panY = baseY + (e.clientY - startY);
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
        beginTransition(fromState, event) {
            if (this.transitionState) this._cancelTransition();
            const start = fromState.getOutputPoint();
            this.transitionState = { fromStateId: fromState.id, start };
            this.tempPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            this.tempPath.setAttribute('class', 'sm-anim-transition temp');
            this.tempPath.setAttribute('fill', 'none');
            this.tempPath.setAttribute('stroke-width', '2');
            this.tempPath.setAttribute('vector-effect', 'non-scaling-stroke');
            this.svg.appendChild(this.tempPath);
            const move = e => {
                if (!this.transitionState) return;
                const p = this.clientToGraph(e.clientX, e.clientY);
                const dx = p.x - start.x;
                const control = Math.max(50, Math.min(180, Math.abs(dx) * 0.4));
                const sign = dx >= 0 ? 1 : -1;
                this.tempPath?.setAttribute('d', `M ${start.x} ${start.y} C ${start.x + control * sign} ${start.y}, ${p.x - control * sign} ${p.y}, ${p.x} ${p.y}`);
            };
            const up = e => {
                if (!this.transitionState) return;
                const targetEl = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('.sm-anim-state-node');
                const toStateId = targetEl?.dataset?.stateId;
                if (toStateId && toStateId !== this.transitionState.fromStateId) this.addTransition({ fromStateId: this.transitionState.fromStateId, toStateId, duration: 0.2, conditions: [] });
                this._cancelTransition();
                window.removeEventListener('pointermove', move);
                window.removeEventListener('pointerup', up);
                window.removeEventListener('pointercancel', up);
            };
            this._transitionMove = move;
            this._transitionUp = up;
            window.addEventListener('pointermove', move);
            window.addEventListener('pointerup', up);
            window.addEventListener('pointercancel', up);
        },
        _cancelTransition() {
            this.tempPath?.remove();
            this.tempPath = null;
            this.transitionState = null;
            if (this._transitionMove) window.removeEventListener('pointermove', this._transitionMove);
            if (this._transitionUp) {
                window.removeEventListener('pointerup', this._transitionUp);
                window.removeEventListener('pointercancel', this._transitionUp);
            }
            this._transitionMove = null;
            this._transitionUp = null;
        },
        selectState(state, additive = false) {
            if (!additive) this.clearSelection(false);
            if (additive && this.selectedStates.has(state.id)) {
                this.selectedStates.delete(state.id);
                state.setSelected(false);
                return;
            }
            this.selectedStates.add(state.id);
            state.setSelected(true);
            this.selectedTransition?.setSelected(false);
            this.selectedTransition = null;
            this._showStateDetails(state);
        },
        selectTransition(transition) {
            this.clearSelection(false);
            this.selectedTransition?.setSelected(false);
            this.selectedTransition = transition;
            transition.setSelected(true);
            this._showTransitionDetails(transition);
        },
        clearSelection(clearDetails = true) {
            this.selectedStates.forEach(id => this.states.get(id)?.setSelected(false));
            this.selectedStates.clear();
            this.selectedTransition?.setSelected(false);
            this.selectedTransition = null;
            if (clearDetails) this._clearDetails();
        },
        deleteSelection() {
            if (this.selectedTransition) {
                this.removeTransition(this.selectedTransition.id);
                this.selectedTransition = null;
                this._clearDetails();
                return;
            }
            [...this.selectedStates].forEach(id => this.removeState(id));
            this.clearSelection();
        },
        updateTransitionsForState(stateId) {
            this.transitions.forEach(t => {
                if (t.fromStateId === stateId || t.toStateId === stateId) t.update();
            });
        },
        openState(state) {
            if (state.type === 'entry') return;
            if (state.data.motionType === 'blendSpace1D' || state.data.motionType === 'blendSpace2D') {
                window.dispatchEvent(new CustomEvent('sm:animation-blend-space-open', { detail: { machineName: this.machineName, stateId: state.id, stateName: state.name, type: state.data.motionType, data: { ...state.data } } }));
                console.log('[AnimationStateMachineEditor] Open Blend Space:', state.name);
            } else {
                this.selectState(state);
            }
        },
        _showStateDetails(state) {
            const host = document.getElementById('anim-node-details');
            if (!host) return;
            host.innerHTML = '';
            const form = document.createElement('div');
            form.className = 'sm-sm-details';
            const field = (label, value, onChange, type = 'text') => {
                const row = document.createElement('label');
                row.className = 'sm-sm-detail-row';
                const title = document.createElement('span');
                title.textContent = label;
                const input = document.createElement('input');
                input.type = type;
                input.value = value ?? '';
                input.addEventListener('change', () => onChange(input.value));
                row.appendChild(title);
                row.appendChild(input);
                return row;
            };
            form.appendChild(field('State', state.name, value => { state.setName(value); this.markDirty(); }));
            if (state.type !== 'entry') {
                const motion = document.createElement('label');
                motion.className = 'sm-sm-detail-row';
                const title = document.createElement('span');
                title.textContent = 'Motion';
                const select = document.createElement('select');
                ['clip', 'blendSpace1D', 'blendSpace2D'].forEach(value => {
                    const option = document.createElement('option');
                    option.value = value;
                    option.textContent = value === 'clip' ? 'Animation Clip' : value === 'blendSpace1D' ? 'Blend Space 1D' : 'Blend Space 2D';
                    select.appendChild(option);
                });
                select.value = state.data.motionType || 'clip';
                select.addEventListener('change', () => {
                    state.setData('motionType', select.value);
                    this._showStateDetails(state);
                });
                motion.appendChild(title);
                motion.appendChild(select);
                form.appendChild(motion);
                if ((state.data.motionType || 'clip') === 'clip') form.appendChild(field('Clip', state.data.clip || state.name, value => state.setData('clip', value)));
                if (state.data.motionType === 'blendSpace1D') form.appendChild(field('Parameter', state.data.parameter || 'Speed', value => state.setData('parameter', value)));
                if (state.data.motionType === 'blendSpace2D') {
                    form.appendChild(field('X Parameter', state.data.parameterX || 'Direction', value => state.setData('parameterX', value)));
                    form.appendChild(field('Y Parameter', state.data.parameterY || 'Speed', value => state.setData('parameterY', value)));
                }
            }
            host.appendChild(form);
        },
        _showTransitionDetails(transition) {
            const host = document.getElementById('anim-node-details');
            if (!host) return;
            host.innerHTML = '';
            const from = this.states.get(transition.fromStateId);
            const to = this.states.get(transition.toStateId);
            const form = document.createElement('div');
            form.className = 'sm-sm-details';
            const heading = document.createElement('div');
            heading.className = 'sm-sm-transition-heading';
            heading.textContent = `${from?.name || '?'} → ${to?.name || '?'}`;
            form.appendChild(heading);
            const durationRow = document.createElement('label');
            durationRow.className = 'sm-sm-detail-row';
            durationRow.innerHTML = '<span>Blend Time</span>';
            const duration = document.createElement('input');
            duration.type = 'number';
            duration.min = '0';
            duration.step = '0.01';
            duration.value = transition.duration;
            duration.addEventListener('change', () => {
                transition.duration = Math.max(0, Number(duration.value) || 0);
                this.markDirty();
            });
            durationRow.appendChild(duration);
            form.appendChild(durationRow);
            const conditionsTitle = document.createElement('div');
            conditionsTitle.className = 'sm-sm-subtitle';
            conditionsTitle.innerHTML = '<span>Conditions</span>';
            const addBtn = document.createElement('button');
            addBtn.type = 'button';
            addBtn.textContent = '+';
            addBtn.addEventListener('click', () => {
                transition.conditions.push({ parameter: 'Speed', operator: '>', value: 0 });
                transition.update();
                this._showTransitionDetails(transition);
                this.markDirty();
            });
            conditionsTitle.appendChild(addBtn);
            form.appendChild(conditionsTitle);
            transition.conditions.forEach((condition, index) => {
                const row = document.createElement('div');
                row.className = 'sm-sm-condition';
                const parameter = document.createElement('input');
                parameter.value = condition.parameter || '';
                parameter.placeholder = 'Parameter';
                const operator = document.createElement('select');
                ['==', '!=', '>', '>=', '<', '<='].forEach(op => {
                    const option = document.createElement('option');
                    option.value = op;
                    option.textContent = op;
                    operator.appendChild(option);
                });
                operator.value = condition.operator || '==';
                const value = document.createElement('input');
                value.value = String(condition.value ?? '');
                value.placeholder = 'Value';
                const remove = document.createElement('button');
                remove.type = 'button';
                remove.textContent = '×';
                parameter.addEventListener('change', () => {
                    condition.parameter = parameter.value.trim();
                    transition.update();
                    this.markDirty();
                });
                operator.addEventListener('change', () => {
                    condition.operator = operator.value;
                    transition.update();
                    this.markDirty();
                });
                value.addEventListener('change', () => {
                    condition.value = this._parseConditionValue(value.value);
                    transition.update();
                    this.markDirty();
                });
                remove.addEventListener('click', () => {
                    transition.conditions.splice(index, 1);
                    transition.update();
                    this._showTransitionDetails(transition);
                    this.markDirty();
                });
                row.appendChild(parameter);
                row.appendChild(operator);
                row.appendChild(value);
                row.appendChild(remove);
                form.appendChild(row);
            });
            host.appendChild(form);
        },
        _parseConditionValue(raw) {
            const value = String(raw).trim();
            if (value === 'true') return true;
            if (value === 'false') return false;
            if (value !== '' && !Number.isNaN(Number(value))) return Number(value);
            return value;
        },
        _clearDetails() {
            const host = document.getElementById('anim-node-details');
            if (host) host.innerHTML = '<div class="anim-empty-details"><i class="fas fa-mouse-pointer"></i><span>Select a state or transition</span></div>';
        },
        _openContextMenu(event) {
            this._closeContextMenu();
            const pos = this.clientToGraph(event.clientX, event.clientY);
            const menu = document.createElement('div');
            menu.className = 'sm-sm-context-menu';
            menu.style.left = `${event.clientX}px`;
            menu.style.top = `${event.clientY}px`;
            [['State', 'clip'], ['Blend Space 1D State', 'blendSpace1D'], ['Blend Space 2D State', 'blendSpace2D']].forEach(([label, motionType]) => {
                const button = document.createElement('button');
                button.type = 'button';
                button.textContent = label;
                button.addEventListener('click', () => {
                    const index = this.states.size;
                    const state = this.addState({ name: motionType === 'clip' ? `State ${index}` : label.replace(' State', ''), x: pos.x, y: pos.y, data: { motionType, clip: 'Idle', parameter: 'Speed', parameterX: 'Direction', parameterY: 'Speed' } });
                    this.selectState(state);
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
        _closeContextMenu() { this.contextMenu?.remove(); this.contextMenu = null; },
        serialize() {
            return { version: 1, type: 'SMAnimationStateMachine', name: this.machineName, nodeId: this.machineNodeId, view: { zoom: this.zoom, panX: this.panX, panY: this.panY }, states: [...this.states.values()].map(s => s.toJSON()), transitions: [...this.transitions.values()].map(t => t.toJSON()) };
        },
        deserialize(data) {
            if (!data || !Array.isArray(data.states)) return false;
            this.states.forEach(s => s.destroy());
            this.transitions.forEach(t => t.destroy());
            this.states.clear();
            this.transitions.clear();
            data.states.forEach(config => this.addState(config));
            (data.transitions || []).forEach(config => {
                const transition = new window.AnimationTransition(this, config);
                this.transitions.set(transition.id, transition);
                transition.render(this.svg, this.labelLayer);
            });
            if (data.view) {
                this.zoom = Number.isFinite(data.view.zoom) ? Math.max(this.minZoom, Math.min(this.maxZoom, data.view.zoom)) : 1;
                this.panX = Number.isFinite(data.view.panX) ? data.view.panX : 0;
                this.panY = Number.isFinite(data.view.panY) ? data.view.panY : 0;
            }
            this.dirty = false;
            this._applyTransform();
            return true;
        },
        compile() {
            const errors = [];
            const warnings = [];
            const entries = [...this.states.values()].filter(s => s.type === 'entry');
            if (entries.length !== 1) errors.push(`State Machine requires exactly one Entry state. Found ${entries.length}.`);
            if (entries.length === 1) {
                const outgoing = [...this.transitions.values()].filter(t => t.fromStateId === entries[0].id);
                if (outgoing.length !== 1) errors.push('Entry must connect to exactly one initial state.');
            }
            this.transitions.forEach(t => {
                if (!this.states.has(t.fromStateId) || !this.states.has(t.toStateId)) errors.push(`Transition ${t.id} references a missing state.`);
                t.conditions.forEach((c, index) => {
                    if (!c.parameter) errors.push(`Transition ${t.id}, condition ${index + 1}: parameter is empty.`);
                    if (!['==', '!=', '>', '>=', '<', '<='].includes(c.operator)) errors.push(`Transition ${t.id}, condition ${index + 1}: invalid operator.`);
                });
            });
            this.states.forEach(state => {
                if (state.type === 'entry') return;
                const motionType = state.data.motionType || 'clip';
                if (motionType === 'clip' && !state.data.clip) warnings.push(`${state.name}: no animation clip selected.`);
                if (motionType === 'blendSpace1D' && !state.data.parameter) errors.push(`${state.name}: Blend Space parameter is empty.`);
            });
            const compiled = { version: 1, name: this.machineName, entryStateId: entries[0]?.id || null, states: [...this.states.values()].filter(s => s.type !== 'entry').map(s => ({ id: s.id, name: s.name, motion: { type: s.data.motionType || 'clip', ...s.data } })), transitions: [...this.transitions.values()].map(t => ({ from: t.fromStateId, to: t.toStateId, duration: t.duration, priority: t.priority, conditions: t.conditions.map(c => ({ ...c })) })) };
            return { success: errors.length === 0, errors, warnings, compiled };
        },
        save() {
            const data = this.serialize();
            localStorage.setItem(this._storageKey(), JSON.stringify(data));
            const result = this.compile();
            if (result.success) {
                window.SMCompiledAnimationStateMachines = window.SMCompiledAnimationStateMachines || {};
                window.SMCompiledAnimationStateMachines[this.machineName] = result.compiled;
                localStorage.setItem('sm_player_animation_state_machines', JSON.stringify(window.SMCompiledAnimationStateMachines));
                this.dirty = false;
            }
            this._setCompileStatus(result);
            return result;
        },
        _loadMachine() {
            try {
                const raw = localStorage.getItem(this._storageKey());
                return raw ? JSON.parse(raw) : null;
            } catch (error) {
                console.warn('[AnimationStateMachineEditor] Invalid saved machine:', error);
                return null;
            }
        },
        _storageKey() { return `sm_animation_state_machine_${this.machineName}`; },
        _setCompileStatus(result) {
            const status = document.getElementById('anim-compile-status');
            if (status) {
                status.classList.remove('success', 'error');
                status.textContent = result.success ? 'Compiled' : `Error (${result.errors.length})`;
                status.classList.add(result.success ? 'success' : 'error');
            }
            if (result.errors?.length) console.error('[AnimationStateMachineEditor] Compile errors:', result.errors);
            if (result.warnings?.length) console.warn('[AnimationStateMachineEditor] Compile warnings:', result.warnings);
        },
        markDirty() {
            this.dirty = true;
            const status = document.getElementById('anim-compile-status');
            if (status && status.textContent === 'Compiled') {
                status.textContent = 'Modified';
                status.classList.remove('success', 'error');
            }
        },
        close() {
            this.save();
            this.destroy(false);
            const canvas = document.getElementById('animation-node-canvas');
            if (canvas && window.AnimationGraphEditor?.init) {
                window.AnimationGraphEditor.init(canvas);
            }
            const graphName = document.getElementById('anim-current-graph-name');
            if (graphName) graphName.textContent = 'Anim Graph';
            console.log('[AnimationStateMachineEditor] closed');
        },
        _updateBreadcrumb() {
            const graphName = document.getElementById('anim-current-graph-name');
            if (graphName) graphName.textContent = `State Machine / ${this.machineName}`;
        },
        clientToGraph(clientX, clientY) {
            const rect = this.canvas.getBoundingClientRect();
            return { x: (clientX - rect.left - this.panX) / this.zoom, y: (clientY - rect.top - this.panY) / this.zoom };
        },
        screenToGraph(x, y) { return { x: (x - this.panX) / this.zoom, y: (y - this.panY) / this.zoom }; },
        _applyTransform() {
            if (this.stage) this.stage.style.transform = `translate(${this.panX}px,${this.panY}px) scale(${this.zoom})`;
        },
        resize() { this.transitions.forEach(t => t.update()); },
        destroy(clearCanvas = true) {
            this._cancelTransition();
            this._closeContextMenu();
            if (this.canvas) {
                if (this._onPointerDown) this.canvas.removeEventListener('pointerdown', this._onPointerDown);
                if (this._onContextMenu) this.canvas.removeEventListener('contextmenu', this._onContextMenu);
                if (this._onWheel) this.canvas.removeEventListener('wheel', this._onWheel);
                if (clearCanvas) this.canvas.innerHTML = '';
            }
            if (this._onKeyDown) window.removeEventListener('keydown', this._onKeyDown);
            this.states.forEach(s => s.destroy());
            this.transitions.forEach(t => t.destroy());
            this.states.clear();
            this.transitions.clear();
            this.selectedStates.clear();
            this.selectedTransition = null;
            this.initialized = false;
        },
        _injectStyles() {
            if (document.getElementById('sm-animation-state-machine-styles')) return;
            const style = document.createElement('style');
            style.id = 'sm-animation-state-machine-styles';
            style.textContent = `.sm-animation-state-machine-canvas{position:absolute;inset:29px 0 24px 0;overflow:hidden;background-color:#242424;background-image:linear-gradient(#303030 1px,transparent 1px),linear-gradient(90deg,#303030 1px,transparent 1px);background-size:20px 20px;touch-action:none}.sm-sm-viewport{position:absolute;inset:0;overflow:hidden}.sm-sm-stage{position:absolute;left:0;top:0;width:6000px;height:4000px;transform-origin:0 0}.sm-sm-svg{position:absolute;left:0;top:0;width:6000px;height:4000px;overflow:visible;pointer-events:none}.sm-sm-label-layer{position:absolute;left:0;top:0;width:6000px;height:4000px;pointer-events:none}.sm-anim-state-node{position:absolute;min-height:88px;background:#343434;border:1px solid #555;box-shadow:0 5px 18px rgba(0,0,0,.26);z-index:3;user-select:none}.sm-anim-state-node.selected{outline:1px solid #aaa;box-shadow:0 0 0 1px #727272,0 7px 22px rgba(0,0,0,.35)}.sm-anim-state-header{height:30px;display:flex;align-items:center;gap:7px;padding:0 8px;background:#484848;cursor:move}.sm-anim-state-node.type-entry .sm-anim-state-header{background:#3f4b42}.sm-anim-state-badge{min-width:20px;height:18px;display:grid;place-items:center;background:#292929;color:#ccc;font-size:9px}.sm-anim-state-name{font-size:11px;font-weight:600;color:#eee;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sm-anim-state-body{min-height:52px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;padding:5px;color:#aaa;font-size:10px}.sm-anim-state-body small{color:#797979;font-size:9px}.sm-anim-state-output{position:absolute;right:-7px;top:39px;width:12px;height:12px;padding:0;border:2px solid #2a2a2a;background:#b4b4b4;transform:rotate(45deg);cursor:crosshair}.sm-anim-transition,.sm-anim-transition.temp{stroke:#b0b0b0;pointer-events:stroke}.sm-anim-transition.selected{stroke:#e1e1e1;stroke-width:4}.sm-anim-transition-label{position:absolute;transform:translate(-50%,-50%) scale(var(--sm-label-scale,1));transform-origin:center;min-width:52px;max-width:150px;height:22px;padding:0 6px;border:1px solid #555;border-radius:0;background:#333;color:#aaa;font-size:9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;pointer-events:auto;cursor:pointer}.sm-anim-transition-label.selected{background:#4d4d4d;color:#fff;border-color:#888}.sm-sm-back-btn{position:absolute;left:8px;top:8px;z-index:20;height:27px;padding:0 9px;border:1px solid #505050;border-radius:0;background:#373737;color:#ddd;font-size:10px;cursor:pointer}.sm-sm-back-btn:hover{background:#484848}.sm-sm-context-menu{position:fixed;z-index:999999;width:200px;padding:4px;background:#2d2d2d;border:1px solid #555;box-shadow:0 10px 28px rgba(0,0,0,.4)}.sm-sm-context-menu button{width:100%;height:29px;padding:0 9px;border:0;border-radius:0;background:transparent;color:#ddd;text-align:left;font-size:11px;cursor:pointer}.sm-sm-context-menu button:hover{background:#474747;color:#fff}.sm-sm-details{padding:7px}.sm-sm-detail-row{min-height:32px;display:grid;grid-template-columns:78px 1fr;align-items:center;gap:6px;border-bottom:1px solid #3c3c3c;color:#aaa;font-size:10px}.sm-sm-detail-row input,.sm-sm-detail-row select{width:100%;min-width:0;height:23px;padding:0 5px;border:1px solid #4a4a4a;border-radius:0;background:#292929;color:#e5e5e5;outline:none}.sm-sm-transition-heading{min-height:30px;display:flex;align-items:center;padding:0 5px;border-bottom:1px solid #444;color:#ddd;font-size:11px;font-weight:600}.sm-sm-subtitle{height:29px;display:flex;align-items:center;justify-content:space-between;margin-top:5px;color:#bbb;font-size:10px}.sm-sm-subtitle button{width:22px;height:22px;border:0;background:#484848;color:#ddd;cursor:pointer}.sm-sm-condition{display:grid;grid-template-columns:1fr 52px 62px 24px;gap:3px;margin-bottom:4px}.sm-sm-condition input,.sm-sm-condition select{min-width:0;height:24px;padding:0 4px;border:1px solid #494949;border-radius:0;background:#292929;color:#ddd;font-size:9px}.sm-sm-condition button{height:24px;border:0;background:#464646;color:#ddd;cursor:pointer}`;
            document.head.appendChild(style);
        }
    };
    window.AnimationStateMachineEditor = StateMachineEditor;
    window.addEventListener('sm:animation-state-machine-open', event => {
        const canvas = document.getElementById('animation-node-canvas');
        if (!canvas) return;
        const detail = event.detail || {};
        window.AnimationStateMachineEditor.init(canvas, { nodeId: detail.nodeId, name: detail.name || 'Locomotion' });
    });
})();