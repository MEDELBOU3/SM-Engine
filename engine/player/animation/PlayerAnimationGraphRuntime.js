// SM Engine - PlayerAnimationGraphRuntime
(function () {
    class PlayerAnimationGraphRuntime {
        constructor(options = {}) {
            this.parameters = options.parameters || new window.PlayerAnimationParameters();
            this.controller = options.controller || null;
            this.machineName = options.machineName || 'Locomotion';
            this.machine = null;
            this.states = new Map();
            this.transitions = [];
            this.currentStateId = null;
            this.previousStateId = null;
            this.stateTime = 0;
            this.lastTransition = null;
            this.blendSpaces = new Map();
            this.enabled = true;
            this.loaded = false;
            this.lastError = null;
        }
        setController(controller) {
            this.controller = controller;
            return this;
        }
        setParameter(name, value) {
            this.parameters.set(name, value);
            return this;
        }
        setFloat(name, value) {
            this.parameters.setFloat(name, value);
            return this;
        }
        setBool(name, value) {
            this.parameters.setBool(name, value);
            return this;
        }
        getParameter(name, fallback = 0) {
            if (name === 'StateTime') return this.stateTime;
            return this.parameters.get(name, fallback);
        }
        load(machineConfig) {
            if (!machineConfig) return false;
            this.machine = machineConfig;
            this.machineName = machineConfig.name || this.machineName;
            this.states.clear();
            (machineConfig.states || []).forEach(state => this.states.set(state.id, state));
            this.transitions = Array.isArray(machineConfig.transitions) ? machineConfig.transitions.map(t => ({ ...t, conditions: Array.isArray(t.conditions) ? t.conditions.map(c => ({ ...c })) : [] })) : [];
            this.currentStateId = null;
            this.previousStateId = null;
            this.stateTime = 0;
            this.lastTransition = null;
            this.blendSpaces.clear();
            this.loaded = true;
            this._enterInitialState();
            console.log('[PlayerAnimationGraphRuntime] loaded machine:', this.machineName);
            return true;
        }
        loadFromStorage(machineName = this.machineName) {
            let all = null;
            try {
                const raw = localStorage.getItem('sm_player_animation_state_machines');
                all = raw ? JSON.parse(raw) : null;
            } catch (error) {
                console.warn('[PlayerAnimationGraphRuntime] Could not parse state machines:', error);
            }
            if (!all || typeof all !== 'object') {
                all = window.SMCompiledAnimationStateMachines || null;
            }
            if (all) {
                const machine = all[machineName] || Object.values(all)[0] || null;
                if (machine) return this.load(machine);
            }
            try {
                const raw = localStorage.getItem(`sm_animation_state_machine_${machineName}`);
                if (raw) {
                    const editorData = JSON.parse(raw);
                    const compiled = window.PlayerAnimationGraphCompiler?.compileStateMachine?.(editorData)?.machine || this._compileEditorMachine(editorData);
                    if (compiled) return this.load(compiled);
                }
            } catch (error) {
                console.warn('[PlayerAnimationGraphRuntime] Could not load editor machine:', error);
            }
            console.warn('[PlayerAnimationGraphRuntime] No compiled State Machine found.');
            return false;
        }
        _compileEditorMachine(data) {
            if (!data || !Array.isArray(data.states)) return null;
            const entry = data.states.find(state => state.type === 'entry');
            return { version: 1, name: data.name || this.machineName, entryStateId: entry?.id || null, states: data.states.filter(state => state.type !== 'entry').map(state => ({ id: state.id, name: state.name, motion: { type: state.data?.motionType || 'clip', ...(state.data || {}) } })), transitions: (data.transitions || []).map(t => ({ from: t.fromStateId, to: t.toStateId, duration: Number(t.duration) || 0, priority: Number(t.priority) || 0, conditions: Array.isArray(t.conditions) ? t.conditions.map(c => ({ ...c })) : [] })) };
        }
        _enterInitialState() {
            if (!this.machine) return false;
            const entryId = this.machine.entryStateId;
            const initialTransition = this.transitions.find(t => t.from === entryId);
            const initialId = initialTransition?.to || this.machine.states?.[0]?.id || null;
            if (!initialId || !this.states.has(initialId)) {
                this.lastError = 'No valid initial animation state.';
                console.error('[PlayerAnimationGraphRuntime]', this.lastError);
                return false;
            }
            this._enterState(initialId, { duration: 0, reason: 'entry' });
            return true;
        }
        _enterState(stateId, transition = null) {
            const next = this.states.get(stateId);
            if (!next) return false;
            this.previousStateId = this.currentStateId;
            this.currentStateId = stateId;
            this.stateTime = 0;
            this.lastTransition = transition || null;
            // Loading an authored graph must not alter the live player before
            // the bridge explicitly enables graph ownership.  This keeps an
            // inactive/stored graph from forcing its Entry (often Idle) pose
            // onto the shared player mixer.
            if (this.enabled) {
                this._applyStateMotion(next, transition?.duration ?? 0.08, true);
            }
            window.dispatchEvent(new CustomEvent('sm:player-animation-state-changed', { detail: { machine: this.machineName, stateId: next.id, stateName: next.name, previousStateId: this.previousStateId, transition: transition || null } }));
            return true;
        }
        update(delta) {
            if (!this.enabled || !this.loaded || !this.controller) return;
            const dt = Math.max(0, Math.min(0.1, Number(delta) || 0));
            this.stateTime += dt;
            const current = this.states.get(this.currentStateId);
            if (!current) {
                this._enterInitialState();
                return;
            }
            const transition = this._findValidTransition(current.id);
            if (transition && this._canLeaveState(transition)) {
                if (this._enterState(transition.to, transition)) {
                    const next = this.states.get(this.currentStateId);
                    if (next) this._applyStateMotion(next, transition.duration ?? 0.12, true);
                }
            } else {
                this._applyStateMotion(current, 0.05, false);
            }
            this.controller.update?.(dt);
            this._updatePreviewUI();
        }
        _canLeaveState(transition) {
            const minStateTime = Number.isFinite(Number(transition.minStateTime)) ? Number(transition.minStateTime) : 0.035;
            return this.stateTime >= Math.max(0, minStateTime);
        }
        _findValidTransition(stateId) {
            const candidates = this.transitions.filter(t => t.from === stateId && this.states.has(t.to)).sort((a, b) => (Number(b.priority) || 0) - (Number(a.priority) || 0));
            return candidates.find(t => this._conditionsPass(t.conditions || [])) || null;
        }
        _conditionsPass(conditions) {
            if (!conditions.length) return true;
            return conditions.every(condition => {
                const left = this._resolveConditionValue(condition.parameter);
                const right = condition.value;
                return this._compare(left, condition.operator || '==', right);
            });
        }
        _resolveConditionValue(parameter) {
            if (parameter === 'StateTime') return this.stateTime;
            return this.parameters.get(parameter, undefined);
        }
        _compare(left, operator, right) {
            const bothNumeric = typeof left === 'number' && typeof right === 'number';
            switch (operator) {
                case '==': return bothNumeric ? Math.abs(left - right) < 0.0001 : left === right;
                case '!=': return bothNumeric ? Math.abs(left - right) >= 0.0001 : left !== right;
                case '>': return Number(left) > Number(right);
                case '>=': return Number(left) >= Number(right);
                case '<': return Number(left) < Number(right);
                case '<=': return Number(left) <= Number(right);
                default: return false;
            }
        }
        _applyStateMotion(state, blendDuration = 0.08, onEnter = false) {
            const motion = state.motion || {};
            const type = motion.type || motion.motionType || 'clip';
            if (type === 'blendSpace1D') {
                const blend = this._getBlendSpace(state, type);
                if (!blend) return;
                const value = this.parameters.getFloat(blend.parameter, 0);
                const result = blend.evaluate(value);
                if (!result?.a) return;
                this.controller.applyBlendSpace1D?.(result.a, result.b, result.alpha, { fadeDuration: onEnter ? Math.max(0.08, blendDuration) : 0.045 });
                return;
            }
            if (type === 'clip') {
                const clip = motion.clip || state.name;
                if (!clip) return;
                this.controller.playSingle?.(clip, onEnter ? Math.max(0.02, blendDuration) : 0.05, { playRate: motion.playRate ?? 1, loop: motion.loop !== false });
                return;
            }
            if (type === 'blendSpace2D') {
                const blend = this._getBlendSpace(state, type);
                if (!blend) return;
                const x = this.parameters.getFloat(blend.parameterX, 0);
                const y = this.parameters.getFloat(blend.parameterY, 0);
                const result = blend.evaluate(x, y);
                if (!result?.targets?.length) return;
                this.controller.applyBlendSpace2D?.(result.targets, { fadeDuration: onEnter ? Math.max(0.08, blendDuration) : 0.045 });
            }
        }
        _getBlendSpace(state, type = 'blendSpace1D') {
            if (this.blendSpaces.has(state.id)) return this.blendSpaces.get(state.id);
            const motion = state.motion || {};
            const is2D = type === 'blendSpace2D';
            let config = is2D
                ? { name: state.name, parameterX: motion.parameterX || 'Direction', parameterY: motion.parameterY || 'Speed', minX: Number(motion.minX ?? -1), maxX: Number(motion.maxX ?? 1), minY: Number(motion.minY ?? 0), maxY: Number(motion.maxY ?? 6), samples: Array.isArray(motion.samples) ? motion.samples : [] }
                : { name: state.name, parameter: motion.parameter || 'Speed', min: Number(motion.min ?? 0), max: Number(motion.max ?? 6), samples: Array.isArray(motion.samples) ? motion.samples : [] };
            try {
                const raw = localStorage.getItem(`sm_animation_blend_space_${this.machineName}_${state.id}`);
                if (raw) {
                    const saved = JSON.parse(raw);
                    config = { ...config, ...saved };
                }
            } catch { }
            if (!config.samples?.length) {
                try {
                    const raw = localStorage.getItem('sm_player_animation_blend_spaces');
                    const all = raw ? JSON.parse(raw) : window.SMCompiledBlendSpaces;
                    const saved = all?.[`${this.machineName}:${state.name}`];
                    if (saved) config = { ...config, ...saved };
                } catch { }
            }
            const BlendSpace = is2D ? window.PlayerBlendSpace2D : window.PlayerBlendSpace1D;
            if (typeof BlendSpace !== 'function') {
                console.error(`[PlayerAnimationGraphRuntime] ${is2D ? 'PlayerBlendSpace2D' : 'PlayerBlendSpace1D'}.js is not loaded.`);
                return null;
            }
            const blend = new BlendSpace(config);
            this.blendSpaces.set(state.id, blend);
            return blend;
        }
        reload() {
            const currentName = this.machineName;
            const success = this.loadFromStorage(currentName);
            if (success) console.log('[PlayerAnimationGraphRuntime] reloaded');
            return success;
        }
        getCurrentState() {
            return this.states.get(this.currentStateId) || null;
        }
        getDebugState() {
            const state = this.getCurrentState();
            return { enabled: this.enabled, loaded: this.loaded, machine: this.machineName, currentState: state?.name || null, currentStateId: this.currentStateId, stateTime: this.stateTime, parameters: this.parameters.snapshot(), lastTransition: this.lastTransition, controller: this.controller?.debug?.() || null };
        }
        _updatePreviewUI() {
            const state = this.getCurrentState();
            const speed = document.getElementById('anim-preview-speed');
            const stateEl = document.getElementById('anim-preview-state');
            const grounded = document.getElementById('anim-preview-grounded');
            if (speed) speed.textContent = this.parameters.getFloat('Speed', 0).toFixed(2);
            if (stateEl) stateEl.textContent = state?.name || 'None';
            if (grounded) grounded.textContent = this.parameters.getBool('IsGrounded', false) ? 'Yes' : 'No';
        }
    }
    window.PlayerAnimationGraphRuntime = PlayerAnimationGraphRuntime;
})();
