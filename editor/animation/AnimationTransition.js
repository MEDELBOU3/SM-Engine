// SM Engine - AnimationTransition
(function () {
    let TRANSITION_COUNTER = 0;
    class AnimationTransition {
        constructor(editor, config = {}) {
            this.editor = editor;
            this.id = config.id || `anim_transition_${Date.now()}_${++TRANSITION_COUNTER}`;
            this.fromStateId = config.fromStateId;
            this.toStateId = config.toStateId;
            this.duration = Number.isFinite(config.duration) ? config.duration : 0.2;
            this.priority = Number.isFinite(config.priority) ? config.priority : 0;
            this.conditions = Array.isArray(config.conditions) ? config.conditions.map(c => ({ ...c })) : [];
            this.path = null;
            this.label = null;
        }
        render(svgLayer, labelLayer) {
            if (!svgLayer) return null;
            this.path?.remove();
            this.label?.remove();
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('class', 'sm-anim-transition');
            path.dataset.transitionId = this.id;
            path.setAttribute('fill', 'none');
            path.setAttribute('stroke-width', '2');
            path.setAttribute('vector-effect', 'non-scaling-stroke');
            path.addEventListener('pointerdown', event => {
                event.stopPropagation();
                this.editor?.selectTransition?.(this);
            });
            this.path = path;
            svgLayer.appendChild(path);
            if (labelLayer) {
                const label = document.createElement('button');
                label.type = 'button';
                label.className = 'sm-anim-transition-label';
                label.dataset.transitionId = this.id;
                label.addEventListener('pointerdown', event => {
                    event.stopPropagation();
                    this.editor?.selectTransition?.(this);
                });
                labelLayer.appendChild(label);
                this.label = label;
            }
            this.update();
            return path;
        }
        update() {
            if (!this.path) return;
            const from = this.editor?.states?.get(this.fromStateId);
            const to = this.editor?.states?.get(this.toStateId);
            if (!from || !to) return;
            const a = from.getCenter();
            const b = to.getCenter();
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const len = Math.max(1, Math.sqrt(dx * dx + dy * dy));
            const nx = dx / len;
            const ny = dy / len;
            const start = { x: a.x + nx * (from.width / 2), y: a.y + ny * 28 };
            const end = { x: b.x - nx * (to.width / 2), y: b.y - ny * 28 };
            const curve = Math.min(140, Math.max(50, Math.abs(end.x - start.x) * 0.35));
            const sign = end.x >= start.x ? 1 : -1;
            this.path.setAttribute('d', `M ${start.x} ${start.y} C ${start.x + curve * sign} ${start.y}, ${end.x - curve * sign} ${end.y}, ${end.x} ${end.y}`);
            if (this.label) {
                const mx = (start.x + end.x) / 2;
                const my = (start.y + end.y) / 2;
                this.label.style.left = `${mx}px`;
                this.label.style.top = `${my}px`;
                this.label.textContent = this._conditionSummary();
            }
        }
        _conditionSummary() {
            if (!this.conditions.length) return 'Always';
            const first = this.conditions[0];
            const text = `${first.parameter || '?'} ${first.operator || '=='} ${String(first.value)}`;
            return this.conditions.length > 1 ? `${text} +${this.conditions.length - 1}` : text;
        }
        setSelected(selected) {
            this.path?.classList.toggle('selected', !!selected);
            this.label?.classList.toggle('selected', !!selected);
        }
        toJSON() {
            return { id: this.id, fromStateId: this.fromStateId, toStateId: this.toStateId, duration: this.duration, priority: this.priority, conditions: this.conditions.map(c => ({ ...c })) };
        }
        destroy() { this.path?.remove(); this.label?.remove(); this.path = null; this.label = null; }
    }
    window.AnimationTransition = AnimationTransition;
})();