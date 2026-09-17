// SM Engine - AnimationBlendSpaceEditor
(function () {
    const BlendSpaceEditor = {
        canvas: null,
        host: null,
        machineName: null,
        stateId: null,
        stateName: null,
        type: 'blendSpace1D',
        data: null,
        samples: [],
        selectedSampleIndex: -1,
        previewValue: 0,
        min: 0,
        max: 6,
        parameter: 'Speed',
        initialized: false,
        dirty: false,
        stateMachineSnapshot: null,
        init(canvas, options = {}) {
            if (!canvas) return false;
            this.canvas = canvas;
            this.host = canvas.parentElement;
            this.machineName = options.machineName || window.AnimationStateMachineEditor?.machineName || 'Locomotion';
            this.stateId = options.stateId || null;
            this.stateName = options.stateName || 'Locomotion';
            this.type = options.type || 'blendSpace1D';
            this.data = { ...(options.data || {}) };
            if (this.type !== 'blendSpace1D') {
                console.warn('[AnimationBlendSpaceEditor] Only Blend Space 1D is implemented in this setup.');
                return false;
            }
            this.parameter = this.data.parameter || 'Speed';
            this.min = Number.isFinite(Number(this.data.min)) ? Number(this.data.min) : 0;
            this.max = Number.isFinite(Number(this.data.max)) ? Number(this.data.max) : 6;
            if (this.max <= this.min) this.max = this.min + 1;
            this.samples = Array.isArray(this.data.samples) && this.data.samples.length ? this.data.samples.map((sample, index) => this._normalizeSample(sample, index)) : [{ id: 'sample_idle', value: 0, clip: 'Idle' }, { id: 'sample_walk', value: 2.5, clip: 'Walk' }, { id: 'sample_run', value: 6, clip: 'Run' }];
            this.previewValue = Math.max(this.min, Math.min(this.max, Number(this.data.previewValue) || this.min));
            this.selectedSampleIndex = -1;
            this.dirty = false;
            this.stateMachineSnapshot = window.AnimationStateMachineEditor?.serialize?.() || null;
            if (window.AnimationStateMachineEditor?.initialized) {
                window.AnimationStateMachineEditor.save?.();
                window.AnimationStateMachineEditor.destroy?.(false);
            }
            this._injectStyles();
            this._buildUI();
            this._bindEvents();
            this._renderSamples();
            this._renderPreview();
            this._updateBreadcrumb();
            this.initialized = true;
            console.log('[AnimationBlendSpaceEditor] opened:', this.stateName, this.parameter);
            return true;
        },
        _normalizeSample(sample, index) {
            return { id: sample.id || `blend_sample_${Date.now()}_${index}`, value: Number.isFinite(Number(sample.value)) ? Number(sample.value) : this.min, clip: String(sample.clip || `Clip ${index + 1}`), playRate: Number.isFinite(Number(sample.playRate)) ? Number(sample.playRate) : 1 };
        },
        _buildUI() {
            this.canvas.innerHTML = `<div class="sm-bs-editor"><div class="sm-bs-toolbar"><button class="sm-bs-back-btn" id="sm-bs-back" type="button"><i class="fas fa-arrow-left"></i> State Machine</button><div class="sm-bs-title"><strong>${this._escape(this.stateName)}</strong><span>Blend Space 1D</span></div><div class="sm-bs-toolbar-actions"><button id="sm-bs-save" type="button"><i class="fas fa-save"></i> Save</button><button id="sm-bs-compile" type="button"><i class="fas fa-check"></i> Compile</button></div></div><div class="sm-bs-body"><aside class="sm-bs-left"><div class="sm-bs-section"><div class="sm-bs-section-title">Axis Settings</div><label class="sm-bs-field"><span>Parameter</span><input id="sm-bs-parameter" value="${this._escape(this.parameter)}"></label><label class="sm-bs-field"><span>Minimum</span><input id="sm-bs-min" type="number" step="0.1" value="${this.min}"></label><label class="sm-bs-field"><span>Maximum</span><input id="sm-bs-max" type="number" step="0.1" value="${this.max}"></label></div><div class="sm-bs-section sm-bs-assets"><div class="sm-bs-section-title">Animation Assets</div><div class="sm-bs-asset-list" id="sm-bs-asset-list"></div></div></aside><main class="sm-bs-main"><div class="sm-bs-preview-bar"><span>${this._escape(this.parameter)}</span><input id="sm-bs-preview-slider" type="range" min="${this.min}" max="${this.max}" step="0.01" value="${this.previewValue}"><strong id="sm-bs-preview-value">${this.previewValue.toFixed(2)}</strong></div><div class="sm-bs-graph-wrap"><div class="sm-bs-axis-area" id="sm-bs-axis-area"><div class="sm-bs-axis-line"></div><div class="sm-bs-axis-ticks" id="sm-bs-axis-ticks"></div><div class="sm-bs-samples" id="sm-bs-samples"></div><div class="sm-bs-preview-marker" id="sm-bs-preview-marker"></div></div><div class="sm-bs-hint">Drag samples • Drop animation assets • Double click empty axis to add sample</div></div><div class="sm-bs-runtime-preview"><div><span>Preview Clip</span><strong id="sm-bs-preview-clip">Idle</strong></div><div><span>Blend</span><strong id="sm-bs-preview-blend">100%</strong></div></div></main><aside class="sm-bs-right"><div class="sm-bs-section"><div class="sm-bs-section-title">Sample Details</div><div id="sm-bs-sample-details" class="sm-bs-sample-details"><div class="sm-bs-empty">Select a sample</div></div></div><div class="sm-bs-section"><div class="sm-bs-section-title">Compiled Samples</div><div id="sm-bs-compiled-list" class="sm-bs-compiled-list"></div></div></aside></div></div>`;
            this._renderAssetList();
            this._renderTicks();
        },
        _bindEvents() {
            this.canvas.querySelector('#sm-bs-back')?.addEventListener('click', () => this.close());
            this.canvas.querySelector('#sm-bs-save')?.addEventListener('click', () => this.save());
            this.canvas.querySelector('#sm-bs-compile')?.addEventListener('click', () => this.compile());
            const parameter = this.canvas.querySelector('#sm-bs-parameter');
            parameter?.addEventListener('change', () => {
                this.parameter = parameter.value.trim() || 'Speed';
                this.data.parameter = this.parameter;
                this.canvas.querySelector('.sm-bs-preview-bar span').textContent = this.parameter;
                this.markDirty();
            });
            const minInput = this.canvas.querySelector('#sm-bs-min');
            const maxInput = this.canvas.querySelector('#sm-bs-max');
            const axisChanged = () => {
                const nextMin = Number(minInput.value);
                const nextMax = Number(maxInput.value);
                if (!Number.isFinite(nextMin) || !Number.isFinite(nextMax) || nextMax <= nextMin) return;
                this.min = nextMin;
                this.max = nextMax;
                this.samples.forEach(sample => sample.value = Math.max(this.min, Math.min(this.max, sample.value)));
                this.previewValue = Math.max(this.min, Math.min(this.max, this.previewValue));
                const slider = this.canvas.querySelector('#sm-bs-preview-slider');
                slider.min = this.min;
                slider.max = this.max;
                slider.value = this.previewValue;
                this._renderTicks();
                this._renderSamples();
                this._renderPreview();
                this.markDirty();
            };
            minInput?.addEventListener('change', axisChanged);
            maxInput?.addEventListener('change', axisChanged);
            const slider = this.canvas.querySelector('#sm-bs-preview-slider');
            slider?.addEventListener('input', () => {
                this.previewValue = Number(slider.value);
                this._renderPreview();
            });
            const axis = this.canvas.querySelector('#sm-bs-axis-area');
            axis?.addEventListener('dblclick', event => {
                if (event.target.closest('.sm-bs-sample')) return;
                const value = this._clientXToValue(event.clientX);
                this.addSample({ value, clip: 'Idle' });
            });
            axis?.addEventListener('dragover', event => {
                event.preventDefault();
                event.dataTransfer.dropEffect = 'copy';
            });
            axis?.addEventListener('drop', event => {
                event.preventDefault();
                const clip = event.dataTransfer.getData('text/sm-animation-clip') || event.dataTransfer.getData('text/plain');
                if (!clip) return;
                const value = this._clientXToValue(event.clientX);
                this.addSample({ value, clip });
            });
            this.canvas.querySelectorAll('.sm-bs-asset').forEach(asset => {
                asset.addEventListener('dragstart', event => {
                    const clip = asset.dataset.clip || asset.textContent.trim();
                    event.dataTransfer.setData('text/sm-animation-clip', clip);
                    event.dataTransfer.setData('text/plain', clip);
                    event.dataTransfer.effectAllowed = 'copy';
                });
                asset.addEventListener('dblclick', () => {
                    this.addSample({ value: this.previewValue, clip: asset.dataset.clip });
                });
            });
            this._onKeyDown = event => {
                const tag = document.activeElement?.tagName;
                if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
                if ((event.key === 'Delete' || event.key === 'Backspace') && this.selectedSampleIndex >= 0) {
                    event.preventDefault();
                    this.removeSample(this.selectedSampleIndex);
                }
                if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
                    event.preventDefault();
                    this.save();
                }
            };
            window.addEventListener('keydown', this._onKeyDown);
        },
        _renderAssetList() {
            const host = this.canvas.querySelector('#sm-bs-asset-list');
            if (!host) return;
            let names = [];
            document.querySelectorAll('#anim-assets-list .anim-asset').forEach(asset => {
                const name = asset.dataset.animation || asset.textContent.trim();
                if (name && !names.includes(name)) names.push(name);
            });
            if (!names.length) names = ['Idle', 'Walk', 'Run', 'Jump', 'Fall', 'Land'];
            host.innerHTML = names.map(name => `<div class="sm-bs-asset" draggable="true" data-clip="${this._escape(name)}"><i class="fas fa-film"></i><span>${this._escape(name)}</span></div>`).join('');
        },
        _renderTicks() {
            const host = this.canvas.querySelector('#sm-bs-axis-ticks');
            if (!host) return;
            const count = 6;
            let html = '';
            for (let i = 0; i <= count; i++) {
                const t = i / count;
                const value = this.min + (this.max - this.min) * t;
                html += `<div class="sm-bs-tick" style="left:${t * 100}%"><span></span><small>${this._formatValue(value)}</small></div>`;
            }
            host.innerHTML = html;
        },
        _renderSamples() {
            const host = this.canvas.querySelector('#sm-bs-samples');
            if (!host) return;
            host.innerHTML = '';
            this.samples.sort((a, b) => a.value - b.value);
            this.samples.forEach((sample, index) => {
                const el = document.createElement('button');
                el.type = 'button';
                el.className = 'sm-bs-sample';
                if (index === this.selectedSampleIndex) el.classList.add('selected');
                el.dataset.index = String(index);
                el.style.left = `${this._valueToPercent(sample.value)}%`;
                el.innerHTML = `<span class="sm-bs-sample-dot"></span><strong>${this._escape(sample.clip)}</strong><small>${this._formatValue(sample.value)}</small>`;
                el.addEventListener('pointerdown', event => {
                    if (event.button !== 0) return;
                    event.preventDefault();
                    event.stopPropagation();
                    this.selectSample(index);
                    this._beginSampleDrag(index, event);
                });
                el.addEventListener('click', event => {
                    event.stopPropagation();
                    this.selectSample(index);
                });
                host.appendChild(el);
            });
            this._renderCompiledList();
        },
        _beginSampleDrag(index, event) {
            const sample = this.samples[index];
            if (!sample) return;
            const move = e => {
                sample.value = this._clientXToValue(e.clientX);
                this._renderSamples();
                this.selectSample(this.samples.indexOf(sample));
                this._renderPreview();
                this.markDirty();
            };
            const up = () => {
                window.removeEventListener('pointermove', move);
                window.removeEventListener('pointerup', up);
                window.removeEventListener('pointercancel', up);
            };
            window.addEventListener('pointermove', move);
            window.addEventListener('pointerup', up);
            window.addEventListener('pointercancel', up);
        },
        addSample(config = {}) {
            const sample = this._normalizeSample({ id: `blend_sample_${Date.now()}_${Math.floor(Math.random() * 9999)}`, value: Number.isFinite(Number(config.value)) ? Number(config.value) : this.previewValue, clip: config.clip || 'Idle', playRate: config.playRate ?? 1 }, this.samples.length);
            sample.value = Math.max(this.min, Math.min(this.max, sample.value));
            this.samples.push(sample);
            this._renderSamples();
            this.selectSample(this.samples.indexOf(sample));
            this.markDirty();
            return sample;
        },
        removeSample(index) {
            if (index < 0 || index >= this.samples.length) return false;
            this.samples.splice(index, 1);
            this.selectedSampleIndex = -1;
            this._renderSamples();
            this._showSampleDetails(null);
            this._renderPreview();
            this.markDirty();
            return true;
        },
        selectSample(index) {
            this.selectedSampleIndex = index;
            this.canvas.querySelectorAll('.sm-bs-sample').forEach((el, i) => el.classList.toggle('selected', i === index));
            this._showSampleDetails(this.samples[index] || null);
        },
        _showSampleDetails(sample) {
            const host = this.canvas.querySelector('#sm-bs-sample-details');
            if (!host) return;
            if (!sample) {
                host.innerHTML = '<div class="sm-bs-empty">Select a sample</div>';
                return;
            }
            host.innerHTML = `<label class="sm-bs-detail-row"><span>Animation</span><input id="sm-bs-detail-clip" value="${this._escape(sample.clip)}"></label><label class="sm-bs-detail-row"><span>${this._escape(this.parameter)}</span><input id="sm-bs-detail-value" type="number" step="0.01" min="${this.min}" max="${this.max}" value="${sample.value}"></label><label class="sm-bs-detail-row"><span>Play Rate</span><input id="sm-bs-detail-rate" type="number" step="0.05" min="0.01" value="${sample.playRate}"></label><button class="sm-bs-delete-sample" id="sm-bs-delete-sample" type="button"><i class="fas fa-trash"></i> Delete Sample</button>`;
            host.querySelector('#sm-bs-detail-clip')?.addEventListener('change', event => {
                sample.clip = event.target.value.trim() || sample.clip;
                this._renderSamples();
                this.selectSample(this.samples.indexOf(sample));
                this._renderPreview();
                this.markDirty();
            });
            host.querySelector('#sm-bs-detail-value')?.addEventListener('change', event => {
                sample.value = Math.max(this.min, Math.min(this.max, Number(event.target.value) || this.min));
                this._renderSamples();
                this.selectSample(this.samples.indexOf(sample));
                this._renderPreview();
                this.markDirty();
            });
            host.querySelector('#sm-bs-detail-rate')?.addEventListener('change', event => {
                sample.playRate = Math.max(0.01, Number(event.target.value) || 1);
                this.markDirty();
            });
            host.querySelector('#sm-bs-delete-sample')?.addEventListener('click', () => this.removeSample(this.samples.indexOf(sample)));
        },
        _renderCompiledList() {
            const host = this.canvas.querySelector('#sm-bs-compiled-list');
            if (!host) return;
            const sorted = [...this.samples].sort((a, b) => a.value - b.value);
            host.innerHTML = sorted.length ? sorted.map(sample => `<div class="sm-bs-compiled-row"><span>${this._escape(sample.clip)}</span><strong>${this._formatValue(sample.value)}</strong></div>`).join('') : '<div class="sm-bs-empty">No samples</div>';
        },
        _renderPreview() {
            const slider = this.canvas.querySelector('#sm-bs-preview-slider');
            if (slider) slider.value = this.previewValue;
            const valueEl = this.canvas.querySelector('#sm-bs-preview-value');
            if (valueEl) valueEl.textContent = this._formatValue(this.previewValue);
            const marker = this.canvas.querySelector('#sm-bs-preview-marker');
            if (marker) marker.style.left = `${this._valueToPercent(this.previewValue)}%`;
            const result = this.evaluate(this.previewValue);
            const clipEl = this.canvas.querySelector('#sm-bs-preview-clip');
            const blendEl = this.canvas.querySelector('#sm-bs-preview-blend');
            if (!result) {
                if (clipEl) clipEl.textContent = 'None';
                if (blendEl) blendEl.textContent = '0%';
                return;
            }
            if (result.a && result.b && result.a.clip !== result.b.clip) {
                if (clipEl) clipEl.textContent = `${result.a.clip} ↔ ${result.b.clip}`;
                if (blendEl) blendEl.textContent = `${Math.round((1 - result.alpha) * 100)}% / ${Math.round(result.alpha * 100)}%`;
            } else {
                if (clipEl) clipEl.textContent = result.a?.clip || 'None';
                if (blendEl) blendEl.textContent = '100%';
            }
            this._applyRuntimePreview(result);
        },
        evaluate(value) {
            if (!this.samples.length) return null;
            const sorted = [...this.samples].sort((a, b) => a.value - b.value);
            if (value <= sorted[0].value) return { a: sorted[0], b: sorted[0], alpha: 0 };
            if (value >= sorted[sorted.length - 1].value) return { a: sorted[sorted.length - 1], b: sorted[sorted.length - 1], alpha: 0 };
            for (let i = 0; i < sorted.length - 1; i++) {
                const a = sorted[i];
                const b = sorted[i + 1];
                if (value >= a.value && value <= b.value) {
                    const range = Math.max(0.000001, b.value - a.value);
                    const alpha = (value - a.value) / range;
                    return { a, b, alpha };
                }
            }
            return { a: sorted[0], b: sorted[0], alpha: 0 };
        },
        _applyRuntimePreview(result) {
            const controller = window.playerAnimationController || window.playerSystem?.animationController || window.playerSystem?.animation;
            if (!controller || !result?.a) return;
            try {
                if (typeof controller.previewBlendSpace === 'function') {
                    controller.previewBlendSpace(result.a.clip, result.b?.clip || result.a.clip, result.alpha, this.previewValue);
                    return;
                }
                if (typeof controller.setFloat === 'function') controller.setFloat(this.parameter, this.previewValue);
            } catch (error) {
                console.warn('[AnimationBlendSpaceEditor] Runtime preview warning:', error);
            }
        },
        compile() {
            const errors = [];
            const warnings = [];
            if (!this.parameter) errors.push('Blend Space parameter is empty.');
            if (!Number.isFinite(this.min) || !Number.isFinite(this.max) || this.max <= this.min) errors.push('Blend Space axis range is invalid.');
            if (this.samples.length < 2) errors.push('Blend Space 1D requires at least two samples.');
            const sorted = [...this.samples].sort((a, b) => a.value - b.value);
            sorted.forEach((sample, index) => {
                if (!sample.clip) errors.push(`Sample ${index + 1} has no animation clip.`);
                if (sample.value < this.min || sample.value > this.max) errors.push(`${sample.clip}: sample value is outside the axis range.`);
                if (index > 0 && Math.abs(sample.value - sorted[index - 1].value) < 0.0001) warnings.push(`${sample.clip} and ${sorted[index - 1].clip} use the same sample value.`);
            });
            const compiled = { version: 1, type: 'SMBlendSpace1D', name: this.stateName, parameter: this.parameter, min: this.min, max: this.max, samples: sorted.map(sample => ({ value: sample.value, clip: sample.clip, playRate: sample.playRate })) };
            const result = { success: errors.length === 0, errors, warnings, compiled };
            const status = document.getElementById('anim-compile-status');
            if (status) {
                status.classList.remove('success', 'error');
                status.textContent = result.success ? 'Compiled' : `Error (${errors.length})`;
                status.classList.add(result.success ? 'success' : 'error');
            }
            if (errors.length) console.error('[AnimationBlendSpaceEditor] Compile errors:', errors);
            if (warnings.length) console.warn('[AnimationBlendSpaceEditor] Compile warnings:', warnings);
            if (result.success) {
                window.SMCompiledBlendSpaces = window.SMCompiledBlendSpaces || {};
                window.SMCompiledBlendSpaces[`${this.machineName}:${this.stateName}`] = compiled;
                localStorage.setItem('sm_player_animation_blend_spaces', JSON.stringify(window.SMCompiledBlendSpaces));
                this.dirty = false;
            }
            return result;
        },
        serialize() {
            return { version: 1, type: 'SMBlendSpace1D', machineName: this.machineName, stateId: this.stateId, stateName: this.stateName, parameter: this.parameter, min: this.min, max: this.max, previewValue: this.previewValue, samples: this.samples.map(sample => ({ ...sample })) };
        },
        save() {
            const result = this.compile();
            if (!result.success) return result;
            const data = this.serialize();
            localStorage.setItem(this._storageKey(), JSON.stringify(data));
            this._writeBackToStateMachine(data);
            this.dirty = false;
            console.log('[AnimationBlendSpaceEditor] saved:', this.stateName);
            return result;
        },
        _writeBackToStateMachine(data) {
            let machine = null;
            try {
                const raw = localStorage.getItem(`sm_animation_state_machine_${this.machineName}`);
                machine = raw ? JSON.parse(raw) : this.stateMachineSnapshot;
            } catch {
                machine = this.stateMachineSnapshot;
            }
            if (!machine || !Array.isArray(machine.states)) return false;
            const state = machine.states.find(item => item.id === this.stateId) || machine.states.find(item => item.name === this.stateName);
            if (!state) return false;
            state.data = { ...(state.data || {}), motionType: 'blendSpace1D', parameter: data.parameter, min: data.min, max: data.max, samples: data.samples.map(sample => ({ value: sample.value, clip: sample.clip, playRate: sample.playRate })) };
            localStorage.setItem(`sm_animation_state_machine_${this.machineName}`, JSON.stringify(machine));
            this.stateMachineSnapshot = machine;
            return true;
        },
        _storageKey() { return `sm_animation_blend_space_${this.machineName}_${this.stateId || this.stateName}`; },
        _loadSaved() {
            try {
                const raw = localStorage.getItem(this._storageKey());
                return raw ? JSON.parse(raw) : null;
            } catch { return null; }
        },
        close() {
            this.save();
            this.destroy(false);
            const canvas = document.getElementById('animation-node-canvas');
            if (canvas && window.AnimationStateMachineEditor?.init) {
                window.AnimationStateMachineEditor.init(canvas, { name: this.machineName, nodeId: this.stateMachineSnapshot?.nodeId || null });
            }
            const graphName = document.getElementById('anim-current-graph-name');
            if (graphName) graphName.textContent = `State Machine / ${this.machineName}`;
            console.log('[AnimationBlendSpaceEditor] closed');
        },
        markDirty() {
            this.dirty = true;
            const status = document.getElementById('anim-compile-status');
            if (status && status.textContent === 'Compiled') {
                status.textContent = 'Modified';
                status.classList.remove('success', 'error');
            }
        },
        _clientXToValue(clientX) {
            const area = this.canvas.querySelector('#sm-bs-axis-area');
            if (!area) return this.min;
            const rect = area.getBoundingClientRect();
            const padding = 34;
            const usable = Math.max(1, rect.width - padding * 2);
            const t = Math.max(0, Math.min(1, (clientX - rect.left - padding) / usable));
            return this.min + (this.max - this.min) * t;
        },
        _valueToPercent(value) {
            return ((Math.max(this.min, Math.min(this.max, value)) - this.min) / (this.max - this.min)) * 100;
        },
        _formatValue(value) {
            const n = Number(value);
            if (!Number.isFinite(n)) return '0.00';
            return Math.abs(n) >= 100 ? n.toFixed(0) : n.toFixed(2);
        },
        _updateBreadcrumb() {
            const graphName = document.getElementById('anim-current-graph-name');
            if (graphName) graphName.textContent = `Blend Space / ${this.stateName}`;
        },
        _escape(value) {
            return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
        },
        destroy(clearCanvas = true) {
            if (this._onKeyDown) window.removeEventListener('keydown', this._onKeyDown);
            if (clearCanvas && this.canvas) this.canvas.innerHTML = '';
            this.initialized = false;
            this.canvas = null;
        },
        _injectStyles() {
            if (document.getElementById('sm-animation-blend-space-styles')) return;
            const style = document.createElement('style');
            style.id = 'sm-animation-blend-space-styles';
            style.textContent = `.sm-animation-blend-space-canvas,.sm-animation-state-machine-canvas.sm-bs-active{position:absolute;inset:29px 0 24px 0;overflow:hidden}.sm-bs-editor{position:absolute;inset:0;display:flex;flex-direction:column;background:#292929;color:#ddd}.sm-bs-toolbar{height:38px;min-height:38px;display:flex;align-items:center;gap:10px;padding:0 8px;background:#363636;border-bottom:1px solid #494949}.sm-bs-back-btn,.sm-bs-toolbar-actions button{height:26px;padding:0 8px;border:0;border-radius:0;background:#484848;color:#ddd;font-size:10px;cursor:pointer}.sm-bs-back-btn:hover,.sm-bs-toolbar-actions button:hover{background:#555}.sm-bs-title{display:flex;flex-direction:column;line-height:1.05}.sm-bs-title strong{font-size:11px;color:#eee}.sm-bs-title span{margin-top:3px;font-size:9px;color:#888}.sm-bs-toolbar-actions{margin-left:auto;display:flex;gap:5px}.sm-bs-body{min-height:0;flex:1;display:grid;grid-template-columns:210px minmax(360px,1fr) 230px;overflow:hidden}.sm-bs-left,.sm-bs-right{min-width:0;overflow:auto;background:#303030}.sm-bs-left{border-right:1px solid #474747}.sm-bs-right{border-left:1px solid #474747}.sm-bs-section{border-bottom:1px solid #444}.sm-bs-section-title{height:29px;display:flex;align-items:center;padding:0 8px;background:#383838;color:#ccc;font-size:10px;font-weight:600}.sm-bs-field,.sm-bs-detail-row{min-height:31px;display:grid;grid-template-columns:72px 1fr;align-items:center;gap:5px;padding:0 7px;border-bottom:1px solid #383838;font-size:9px;color:#999}.sm-bs-field input,.sm-bs-detail-row input{width:100%;min-width:0;height:22px;padding:0 5px;border:1px solid #494949;border-radius:0;outline:none;background:#292929;color:#ddd;font-size:10px}.sm-bs-assets{min-height:180px}.sm-bs-asset-list{padding:5px}.sm-bs-asset{height:27px;display:flex;align-items:center;gap:6px;padding:0 6px;color:#bbb;font-size:10px;cursor:grab}.sm-bs-asset:hover{background:#414141;color:#eee}.sm-bs-asset i{color:#888;font-size:9px}.sm-bs-main{min-width:0;min-height:0;display:flex;flex-direction:column;background:#242424}.sm-bs-preview-bar{height:40px;min-height:40px;display:grid;grid-template-columns:80px 1fr 52px;align-items:center;gap:7px;padding:0 10px;background:#303030;border-bottom:1px solid #454545;font-size:10px}.sm-bs-preview-bar span{color:#aaa}.sm-bs-preview-bar input{width:100%}.sm-bs-preview-bar strong{text-align:right;color:#ddd;font-weight:500}.sm-bs-graph-wrap{position:relative;min-height:0;flex:1;overflow:hidden;background-color:#252525;background-image:linear-gradient(#2d2d2d 1px,transparent 1px),linear-gradient(90deg,#2d2d2d 1px,transparent 1px);background-size:20px 20px}.sm-bs-axis-area{position:absolute;left:34px;right:34px;top:46%;height:160px;transform:translateY(-50%);overflow:visible}.sm-bs-axis-line{position:absolute;left:0;right:0;top:84px;height:2px;background:#777}.sm-bs-axis-ticks{position:absolute;inset:0}.sm-bs-tick{position:absolute;top:78px;height:25px;transform:translateX(-50%)}.sm-bs-tick>span{display:block;width:1px;height:13px;background:#666}.sm-bs-tick small{position:absolute;top:17px;left:50%;transform:translateX(-50%);font-size:9px;color:#777;white-space:nowrap}.sm-bs-samples{position:absolute;inset:0}.sm-bs-sample{position:absolute;top:27px;width:80px;height:50px;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;border:1px solid #555;border-radius:0;background:#393939;color:#ddd;cursor:ew-resize}.sm-bs-sample:hover{background:#444}.sm-bs-sample.selected{outline:1px solid #aaa;border-color:#888}.sm-bs-sample-dot{position:absolute;left:50%;bottom:-15px;width:12px;height:12px;transform:translateX(-50%) rotate(45deg);background:#aaa;border:2px solid #292929}.sm-bs-sample strong{max-width:68px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10px;font-weight:600}.sm-bs-sample small{font-size:8px;color:#888}.sm-bs-preview-marker{position:absolute;top:67px;width:2px;height:40px;transform:translateX(-50%);background:#ddd;pointer-events:none}.sm-bs-preview-marker:before{content:'';position:absolute;top:-6px;left:50%;width:8px;height:8px;transform:translateX(-50%) rotate(45deg);background:#ddd}.sm-bs-hint{position:absolute;left:0;right:0;bottom:14px;text-align:center;font-size:9px;color:#686868}.sm-bs-runtime-preview{height:38px;min-height:38px;display:flex;align-items:center;gap:30px;padding:0 10px;border-top:1px solid #444;background:#303030}.sm-bs-runtime-preview>div{display:flex;align-items:center;gap:8px;font-size:9px}.sm-bs-runtime-preview span{color:#888}.sm-bs-runtime-preview strong{color:#ddd;font-weight:500}.sm-bs-sample-details{padding:5px}.sm-bs-empty{padding:16px 8px;text-align:center;color:#777;font-size:9px}.sm-bs-delete-sample{width:calc(100% - 14px);height:27px;margin:7px;border:0;border-radius:0;background:#484848;color:#ddd;font-size:10px;cursor:pointer}.sm-bs-delete-sample:hover{background:#555}.sm-bs-compiled-list{padding:5px}.sm-bs-compiled-row{height:25px;display:flex;align-items:center;justify-content:space-between;padding:0 5px;border-bottom:1px solid #393939;font-size:9px}.sm-bs-compiled-row span{color:#aaa}.sm-bs-compiled-row strong{color:#ddd;font-weight:500}`;
            document.head.appendChild(style);
        }
    };
    window.AnimationBlendSpaceEditor = BlendSpaceEditor;
    window.addEventListener('sm:animation-blend-space-open', event => {
        const detail = event.detail || {};
        if (detail.type && detail.type !== 'blendSpace1D') {
            return;
        }
        const canvas = document.getElementById('animation-node-canvas');
        if (!canvas) return;
        let saved = null;
        try {
            const key = `sm_animation_blend_space_${detail.machineName || 'Locomotion'}_${detail.stateId || detail.nodeId || detail.stateName || 'BlendSpace'}`;
            const raw = localStorage.getItem(key);
            saved = raw ? JSON.parse(raw) : null;
        } catch { }
        const options = { ...detail, data: saved ? { ...detail.data, ...saved } : detail.data };
        window.AnimationBlendSpaceEditor.init(canvas, options);
    });
})();
