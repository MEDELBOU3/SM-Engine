// SM Engine - Blend Space 2D authoring surface.
(function () {
    const Editor = {
        canvas: null, machineName: 'Locomotion', stateId: null, stateName: 'Blend Space 2D', data: null,
        parameterX: 'Direction', parameterY: 'Speed', minX: -180, maxX: 180, minY: 0, maxY: 6,
        previewX: 0, previewY: 0, samples: [], selected: -1, snapshot: null, initialized: false,
        init(canvas, options = {}) {
            if (!canvas) return false;
            this.canvas = canvas;
            this.machineName = options.machineName || window.AnimationStateMachineEditor?.machineName || 'Locomotion';
            this.stateId = options.stateId || options.nodeId || null;
            this.stateName = options.stateName || 'Blend Space 2D';
            this.data = { ...(options.data || {}) };
            this.parameterX = this.data.parameterX || 'Direction'; this.parameterY = this.data.parameterY || 'Speed';
            this.minX = this._number(this.data.minX, -180); this.maxX = this._number(this.data.maxX, 180);
            this.minY = this._number(this.data.minY, 0); this.maxY = this._number(this.data.maxY, 6);
            if (this.maxX <= this.minX) this.maxX = this.minX + 1;
            if (this.maxY <= this.minY) this.maxY = this.minY + 1;
            this.samples = (Array.isArray(this.data.samples) ? this.data.samples : []).map((sample, index) => this._sample(sample, index));
            this.previewX = this._clamp(this._number(this.data.previewX, 0), this.minX, this.maxX);
            this.previewY = this._clamp(this._number(this.data.previewY, 0), this.minY, this.maxY);
            this.snapshot = window.AnimationStateMachineEditor?.serialize?.() || null;
            if (window.AnimationStateMachineEditor?.initialized) { window.AnimationStateMachineEditor.save?.(); window.AnimationStateMachineEditor.destroy?.(false); }
            this._style(); this._build(); this._render(); this.initialized = true;
            return true;
        },
        _number(value, fallback) { const n = Number(value); return Number.isFinite(n) ? n : fallback; },
        _clamp(value, min, max) { return Math.max(min, Math.min(max, value)); },
        _sample(value, index) { return { id: value?.id || `blend2d_${Date.now()}_${index}`, x: this._clamp(this._number(value?.x ?? value?.valueX, 0), this.minX, this.maxX), y: this._clamp(this._number(value?.y ?? value?.valueY, 0), this.minY, this.maxY), clip: String(value?.clip || 'Idle'), playRate: this._number(value?.playRate, 1), loop: value?.loop !== false }; },
        _build() {
            this.canvas.innerHTML = `<div class="sm-bs2"><header><button type="button" data-action="back">← State Machine</button><div><strong>${this._escape(this.stateName)}</strong><small>Blend Space 2D</small></div><span></span><button type="button" data-action="save">Save</button><button type="button" data-action="compile">Compile</button></header><div class="sm-bs2-body"><aside class="sm-bs2-settings"><h4>Axis Settings</h4><label>X Parameter<input data-field="parameterX" value="${this._escape(this.parameterX)}"></label><label>X Minimum<input data-field="minX" type="number" step="0.1" value="${this.minX}"></label><label>X Maximum<input data-field="maxX" type="number" step="0.1" value="${this.maxX}"></label><label>Y Parameter<input data-field="parameterY" value="${this._escape(this.parameterY)}"></label><label>Y Minimum<input data-field="minY" type="number" step="0.1" value="${this.minY}"></label><label>Y Maximum<input data-field="maxY" type="number" step="0.1" value="${this.maxY}"></label><h4>Add Sample</h4><label>Animation<select data-field="newClip">${this._assets().map(name => `<option>${this._escape(name)}</option>`).join('')}</select></label><button type="button" data-action="add">Add at Preview</button></aside><main><div class="sm-bs2-preview"><label>${this._escape(this.parameterX)}<input data-field="previewX" type="number" step="0.01" value="${this.previewX}"></label><label>${this._escape(this.parameterY)}<input data-field="previewY" type="number" step="0.01" value="${this.previewY}"></label><strong data-role="blend">No samples</strong></div><div class="sm-bs2-plane" data-role="plane"><div class="sm-bs2-grid"></div><div class="sm-bs2-origin"></div><div class="sm-bs2-cursor"></div><div class="sm-bs2-samples"></div><div class="sm-bs2-hint">Double click to create sample • Drag samples to position</div></div></main><aside class="sm-bs2-details"><h4>Sample Details</h4><div data-role="details">Select a sample</div><h4>Compiled Samples</h4><div data-role="list"></div></aside></div></div>`;
            this.canvas.querySelectorAll('[data-action]').forEach(button => button.addEventListener('click', () => this[button.dataset.action === 'back' ? 'close' : button.dataset.action]()));
            this.canvas.querySelectorAll('[data-field]').forEach(input => input.addEventListener('change', () => this._fieldChanged(input)));
            const plane = this.canvas.querySelector('[data-role="plane"]');
            plane?.addEventListener('dblclick', event => { if (!event.target.closest('.sm-bs2-sample')) this.addAt(event.clientX, event.clientY); });
        },
        _assets() { const names = [...document.querySelectorAll('#anim-assets-list .anim-asset')].map(el => el.dataset.animation || el.textContent.trim()).filter(Boolean); return names.length ? [...new Set(names)] : ['Idle', 'Walk', 'Run', 'Strafe Left', 'Strafe Right']; },
        _fieldChanged(input) {
            const key = input.dataset.field, value = input.value;
            if (key === 'parameterX' || key === 'parameterY') this[key] = value.trim() || (key === 'parameterX' ? 'Direction' : 'Speed');
            else if (key === 'previewX' || key === 'previewY') this[key] = this._clamp(this._number(value, 0), key === 'previewX' ? this.minX : this.minY, key === 'previewX' ? this.maxX : this.maxY);
            else if (key !== 'newClip') { this[key] = this._number(value, this[key]); if (this.maxX <= this.minX) this.maxX = this.minX + 1; if (this.maxY <= this.minY) this.maxY = this.minY + 1; this.samples.forEach(sample => { sample.x = this._clamp(sample.x, this.minX, this.maxX); sample.y = this._clamp(sample.y, this.minY, this.maxY); }); }
            this._render();
        },
        _position(x, y) { const plane = this.canvas.querySelector('[data-role="plane"]'), rect = plane.getBoundingClientRect(); return { x: this._clamp(this.minX + ((x - rect.left) / rect.width) * (this.maxX - this.minX), this.minX, this.maxX), y: this._clamp(this.maxY - ((y - rect.top) / rect.height) * (this.maxY - this.minY), this.minY, this.maxY) }; },
        _point(sample) { return { left: ((sample.x - this.minX) / (this.maxX - this.minX)) * 100, top: ((this.maxY - sample.y) / (this.maxY - this.minY)) * 100 }; },
        add() { const clip = this.canvas.querySelector('[data-field="newClip"]')?.value || 'Idle'; this.samples.push(this._sample({ x: this.previewX, y: this.previewY, clip }, this.samples.length)); this.selected = this.samples.length - 1; this._render(); },
        addAt(x, y) { const point = this._position(x, y); this.previewX = point.x; this.previewY = point.y; this.add(); },
        _drag(index, event) { const move = e => { const point = this._position(e.clientX, e.clientY); Object.assign(this.samples[index], point); this._render(); }; const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); }; window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); },
        _render() {
            if (!this.canvas) return;
            const sampleHost = this.canvas.querySelector('[data-role="samples"]');
            if (sampleHost) { sampleHost.innerHTML = ''; this.samples.forEach((sample, index) => { const point = this._point(sample), dot = document.createElement('button'); dot.type = 'button'; dot.className = `sm-bs2-sample${index === this.selected ? ' active' : ''}`; dot.style.left = `${point.left}%`; dot.style.top = `${point.top}%`; dot.textContent = sample.clip; dot.title = `${sample.clip} (${sample.x.toFixed(2)}, ${sample.y.toFixed(2)})`; dot.addEventListener('pointerdown', event => { event.preventDefault(); this.selected = index; this._drag(index, event); }); dot.addEventListener('click', () => { this.selected = index; this._render(); }); sampleHost.appendChild(dot); }); }
            const cursor = this.canvas.querySelector('.sm-bs2-cursor'); if (cursor) { const point = this._point({ x: this.previewX, y: this.previewY }); cursor.style.left = `${point.left}%`; cursor.style.top = `${point.top}%`; }
            const blend = window.PlayerBlendSpace2D ? new window.PlayerBlendSpace2D(this.serialize()).evaluate(this.previewX, this.previewY) : null; const blendEl = this.canvas.querySelector('[data-role="blend"]'); if (blendEl) blendEl.textContent = blend?.targets?.length ? blend.targets.map(target => `${target.clip} ${Math.round(target.weight * 100)}%`).join(' • ') : 'No samples';
            const details = this.canvas.querySelector('[data-role="details"]'), sample = this.samples[this.selected]; if (details) { details.innerHTML = sample ? `<label>Clip<input data-detail="clip" value="${this._escape(sample.clip)}"></label><label>X<input data-detail="x" type="number" step="0.01" value="${sample.x}"></label><label>Y<input data-detail="y" type="number" step="0.01" value="${sample.y}"></label><label>Play Rate<input data-detail="playRate" type="number" step="0.05" value="${sample.playRate}"></label><button type="button" data-action="remove">Delete Sample</button>` : 'Select a sample'; details.querySelectorAll('[data-detail]').forEach(input => input.addEventListener('change', () => { const key = input.dataset.detail; sample[key] = key === 'clip' ? input.value : this._number(input.value, sample[key]); if (key === 'x') sample.x = this._clamp(sample.x, this.minX, this.maxX); if (key === 'y') sample.y = this._clamp(sample.y, this.minY, this.maxY); this._render(); })); details.querySelector('[data-action="remove"]')?.addEventListener('click', () => this.remove()); }
            const list = this.canvas.querySelector('[data-role="list"]'); if (list) list.innerHTML = this.samples.map(sample => `<div>${this._escape(sample.clip)}<small>${sample.x.toFixed(2)}, ${sample.y.toFixed(2)}</small></div>`).join('');
        },
        remove() { if (this.selected < 0) return; this.samples.splice(this.selected, 1); this.selected = -1; this._render(); },
        serialize() { return { version: 1, type: 'SMBlendSpace2D', machineName: this.machineName, stateId: this.stateId, stateName: this.stateName, parameterX: this.parameterX, parameterY: this.parameterY, minX: this.minX, maxX: this.maxX, minY: this.minY, maxY: this.maxY, previewX: this.previewX, previewY: this.previewY, samples: this.samples.map(sample => ({ ...sample })) }; },
        compile() { const errors = []; if (this.samples.length < 2) errors.push('Blend Space 2D needs at least two samples.'); if (this.samples.some(sample => !sample.clip)) errors.push('Every sample needs an animation clip.'); const compiled = this.serialize(); const result = { success: !errors.length, errors, compiled }; if (result.success) { window.SMCompiledBlendSpaces = window.SMCompiledBlendSpaces || {}; window.SMCompiledBlendSpaces[`${this.machineName}:${this.stateName}`] = compiled; localStorage.setItem('sm_player_animation_blend_spaces', JSON.stringify(window.SMCompiledBlendSpaces)); } return result; },
        save() { const result = this.compile(); if (!result.success) { console.warn('[AnimationBlendSpace2DEditor]', result.errors); return result; } localStorage.setItem(this._storageKey(), JSON.stringify(this.serialize())); let machine = null; try { machine = JSON.parse(localStorage.getItem(`sm_animation_state_machine_${this.machineName}`) || 'null'); } catch { } machine ||= this.snapshot; const state = machine?.states?.find(item => item.id === this.stateId) || machine?.states?.find(item => item.name === this.stateName); if (state) { state.data = { ...(state.data || {}), motionType: 'blendSpace2D', ...this.serialize() }; localStorage.setItem(`sm_animation_state_machine_${this.machineName}`, JSON.stringify(machine)); } window.dispatchEvent(new CustomEvent('sm:player-animation-reload')); return result; },
        _storageKey() { return `sm_animation_blend_space_${this.machineName}_${this.stateId || this.stateName}`; },
        close() { this.save(); this.canvas.innerHTML = ''; this.initialized = false; const canvas = document.getElementById('animation-node-canvas'); if (canvas && window.AnimationStateMachineEditor?.init) window.AnimationStateMachineEditor.init(canvas, { name: this.machineName, nodeId: this.snapshot?.nodeId || null }); },
        _escape(value) { return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])); },
        _style() { if (document.getElementById('sm-bs2-styles')) return; const style = document.createElement('style'); style.id = 'sm-bs2-styles'; style.textContent = `.sm-bs2{position:absolute;inset:0;background:#252525;color:#ddd;font:10px Arial}.sm-bs2 header{height:38px;display:flex;align-items:center;gap:7px;padding:0 8px;background:#333;border-bottom:1px solid #484848}.sm-bs2 header span{flex:1}.sm-bs2 header div{display:flex;flex-direction:column}.sm-bs2 header small{color:#888}.sm-bs2 button{height:25px;border:1px solid #555;background:#444;color:#ddd;cursor:pointer}.sm-bs2-body{height:calc(100% - 39px);display:grid;grid-template-columns:190px minmax(350px,1fr) 210px}.sm-bs2 aside{overflow:auto;background:#303030;padding:8px;border-right:1px solid #454545}.sm-bs2-details{border-left:1px solid #454545;border-right:0!important}.sm-bs2 h4{margin:3px 0 8px;font-size:10px;color:#aaa}.sm-bs2 label{display:grid;grid-template-columns:78px 1fr;align-items:center;gap:4px;margin:4px 0;color:#999}.sm-bs2 input,.sm-bs2 select{min-width:0;height:22px;border:1px solid #505050;background:#262626;color:#ddd;font-size:10px}.sm-bs2 main{min-width:0;display:flex;flex-direction:column;background:#242424}.sm-bs2-preview{display:flex;align-items:center;gap:10px;padding:8px;background:#303030;border-bottom:1px solid #444}.sm-bs2-preview label{margin:0}.sm-bs2-preview strong{margin-left:auto;color:#b9d6ff}.sm-bs2-plane{position:relative;flex:1;min-height:240px;margin:14px;background:#202020;border:1px solid #484848;overflow:hidden}.sm-bs2-grid{position:absolute;inset:0;background-image:linear-gradient(#303030 1px,transparent 1px),linear-gradient(90deg,#303030 1px,transparent 1px);background-size:10% 10%}.sm-bs2-origin{position:absolute;left:50%;top:50%;width:1px;height:100%;background:#5a5a5a}.sm-bs2-origin:after{content:'';position:absolute;top:50%;left:-100vw;width:200vw;height:1px;background:#5a5a5a}.sm-bs2-samples,.sm-bs2-cursor{position:absolute;inset:0;pointer-events:none}.sm-bs2-sample{position:absolute;z-index:2;transform:translate(-50%,-50%);min-width:52px;max-width:95px;height:25px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;border:1px solid #888;background:#3e5f86;color:#fff;font-size:9px;cursor:move;pointer-events:auto}.sm-bs2-sample.active{outline:2px solid #a9d4ff}.sm-bs2-cursor{width:12px;height:12px;inset:auto;z-index:3;transform:translate(-50%,-50%) rotate(45deg);border:2px solid #eee;box-sizing:border-box}.sm-bs2-hint{position:absolute;bottom:7px;left:0;right:0;text-align:center;color:#777}.sm-bs2-details [data-role=list] div{display:flex;justify-content:space-between;border-bottom:1px solid #414141;padding:5px 2px}.sm-bs2-details small{color:#777}`; document.head.appendChild(style); }
    };
    window.AnimationBlendSpace2DEditor = Editor;
    window.addEventListener('sm:animation-blend-space-open', event => {
        const detail = event.detail || {};
        if (detail.type !== 'blendSpace2D') return;
        const canvas = document.getElementById('animation-node-canvas');
        if (!canvas) return;
        let saved = null;
        try {
            const key = `sm_animation_blend_space_${detail.machineName || 'Locomotion'}_${detail.stateId || detail.nodeId || detail.stateName || 'BlendSpace2D'}`;
            const raw = localStorage.getItem(key);
            saved = raw ? JSON.parse(raw) : null;
        } catch { }
        Editor.init(canvas, { ...detail, data: saved ? { ...detail.data, ...saved } : detail.data });
    });
})();
