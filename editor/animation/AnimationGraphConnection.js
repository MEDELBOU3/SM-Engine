// SM Engine - AnimationGraphConnection
(function () {
    let CONNECTION_COUNTER = 0;
    class AnimationGraphConnection {
        constructor(editor, config = {}) {
            this.editor = editor;
            this.id = config.id || `anim_connection_${Date.now()}_${++CONNECTION_COUNTER}`;
            this.fromNodeId = config.fromNodeId;
            this.fromPinId = config.fromPinId;
            this.toNodeId = config.toNodeId;
            this.toPinId = config.toPinId;
            this.kind = config.kind || 'pose';
            this.path = null;
        }
        render(svgLayer) {
            if (!svgLayer) return null;
            if (this.path) this.path.remove();
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('class', `sm-anim-connection kind-${this.kind}`);
            path.dataset.connectionId = this.id;
            path.setAttribute('fill', 'none');
            path.setAttribute('stroke-width', '2');
            path.setAttribute('vector-effect', 'non-scaling-stroke');
            path.addEventListener('pointerdown', event => {
                event.stopPropagation();
                this.editor?.selectConnection?.(this);
            });
            this.path = path;
            svgLayer.appendChild(path);
            this.update();
            return path;
        }
        update() {
            if (!this.path) return;
            const fromNode = this.editor?.nodes?.get(this.fromNodeId);
            const toNode = this.editor?.nodes?.get(this.toNodeId);
            if (!fromNode || !toNode) return;
            const fromPin = fromNode.getPinElement('output', this.fromPinId);
            const toPin = toNode.getPinElement('input', this.toPinId);
            if (!fromPin || !toPin) return;
            const a = this.editor.getPinGraphPosition(fromPin);
            const b = this.editor.getPinGraphPosition(toPin);
            if (!a || !b) return;
            this.path.setAttribute('d', AnimationGraphConnection.makeBezierPath(a.x, a.y, b.x, b.y));
        }
        setSelected(selected) {
            this.path?.classList.toggle('selected', !!selected);
        }
        toJSON() {
            return { id: this.id, fromNodeId: this.fromNodeId, fromPinId: this.fromPinId, toNodeId: this.toNodeId, toPinId: this.toPinId, kind: this.kind };
        }
        destroy() {
            this.path?.remove();
            this.path = null;
        }
        static makeBezierPath(x1, y1, x2, y2) {
            const distance = Math.abs(x2 - x1);
            const control = Math.max(60, Math.min(260, distance * 0.5));
            return `M ${x1} ${y1} C ${x1 + control} ${y1}, ${x2 - control} ${y2}, ${x2} ${y2}`;
        }
    }
    window.AnimationGraphConnection = AnimationGraphConnection;
})();