// SM Engine - AnimationStateNode
(function () {
    let STATE_NODE_COUNTER = 0;
    class AnimationStateNode {
        constructor(editor, config = {}) {
            this.editor = editor;
            this.id = config.id || `anim_state_${Date.now()}_${++STATE_NODE_COUNTER}`;
            this.type = config.type || 'state';
            this.name = config.name || this._defaultName();
            this.x = Number.isFinite(config.x) ? config.x : 0;
            this.y = Number.isFinite(config.y) ? config.y : 0;
            this.width = Number.isFinite(config.width) ? config.width : (this.type === 'entry' ? 120 : 170);
            this.data = { ...(config.data || {}) };
            this.element = null;
        }
        _defaultName() { return this.type === 'entry' ? 'Entry' : 'State'; }
        render(parent) {
            if (this.element) this.element.remove();
            const el = document.createElement('div');
            el.className = `sm-anim-state-node type-${this.type}`;
            el.dataset.stateId = this.id;
            el.style.left = `${this.x}px`;
            el.style.top = `${this.y}px`;
            el.style.width = `${this.width}px`;
            el.innerHTML = `<div class="sm-anim-state-header"><span class="sm-anim-state-badge">${this.type === 'entry' ? 'E' : 'S'}</span><span class="sm-anim-state-name"></span></div><div class="sm-anim-state-body"></div><button class="sm-anim-state-output" type="button" title="Create transition"></button>`;
            el.querySelector('.sm-anim-state-name').textContent = this.name;
            this.element = el;
            this._renderBody();
            this._bindEvents();
            parent.appendChild(el);
            return el;
        }
        _renderBody() {
            const body = this.element?.querySelector('.sm-anim-state-body');
            if (!body) return;
            if (this.type === 'entry') {
                body.textContent = 'State Machine Start';
                return;
            }
            const motionType = this.data.motionType || 'clip';
            if (motionType === 'blendSpace1D') {
                body.innerHTML = `<span>Blend Space 1D</span><small>${this.data.parameter || 'Speed'}</small>`;
            } else if (motionType === 'blendSpace2D') {
                body.innerHTML = `<span>Blend Space 2D</span><small>${this.data.parameterX || 'Direction'} / ${this.data.parameterY || 'Speed'}</small>`;
            } else {
                body.innerHTML = `<span>Animation Clip</span><small>${this.data.clip || this.name}</small>`;
            }
        }
        _bindEvents() {
            const header = this.element.querySelector('.sm-anim-state-header');
            header.addEventListener('pointerdown', event => {
                if (event.button !== 0) return;
                event.stopPropagation();
                this.editor?.beginStateDrag?.(this, event);
            });
            this.element.addEventListener('pointerdown', event => {
                if (event.target.closest('.sm-anim-state-output')) return;
                this.editor?.selectState?.(this, event.shiftKey);
            });
            this.element.addEventListener('dblclick', event => {
                if (event.target.closest('.sm-anim-state-output')) return;
                event.stopPropagation();
                this.editor?.openState?.(this);
            });
            this.element.querySelector('.sm-anim-state-output')?.addEventListener('pointerdown', event => {
                if (event.button !== 0) return;
                event.preventDefault();
                event.stopPropagation();
                this.editor?.beginTransition?.(this, event);
            });
        }
        setSelected(selected) { this.element?.classList.toggle('selected', !!selected); }
        setPosition(x, y) {
            this.x = Math.round(x);
            this.y = Math.round(y);
            if (this.element) {
                this.element.style.left = `${this.x}px`;
                this.element.style.top = `${this.y}px`;
            }
            this.editor?.updateTransitionsForState?.(this.id);
        }
        setName(name) {
            this.name = String(name || this.name);
            const el = this.element?.querySelector('.sm-anim-state-name');
            if (el) el.textContent = this.name;
        }
        setData(key, value) {
            this.data[key] = value;
            this._renderBody();
            this.editor?.markDirty?.();
        }
        getCenter() {
            return { x: this.x + this.width / 2, y: this.y + 45 };
        }
        getOutputPoint() {
            return { x: this.x + this.width, y: this.y + 45 };
        }
        getInputPoint() {
            return { x: this.x, y: this.y + 45 };
        }
        toJSON() { return { id: this.id, type: this.type, name: this.name, x: this.x, y: this.y, width: this.width, data: { ...this.data } }; }
        destroy() { this.element?.remove(); this.element = null; }
    }
    window.AnimationStateNode = AnimationStateNode;
})();