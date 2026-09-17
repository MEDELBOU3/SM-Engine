/**
 * AdvancedKeyframeEditor - Professional F-Curve Graph Editor
 * Features: Bezier keyframes with draggable tangent handles, frame grid,
 * click-to-scrub playhead, channel/easing management, camera-channel baking.
 *
 * Coordinate mapping:
 *   x = offsetX + frame * zoomX
 *   y = offsetY + (vMax - value) * zoomY   (auto-fitted to channel value range)
 */

class AdvancedKeyframeEditor {
    constructor(canvasEl) {
        this.canvas = canvasEl;
        this.ctx = this.canvas.getContext('2d');
        this.isActive = false;

        // Editing state
        this.selectedKeyframes = [];
        this.draggedKeyframe = null;
        this.isDragging = false;
        this.selectedHandle = null; // 'in' | 'out'
        this.isScrubbing = false;

        // View settings
        this.view = {
            offsetX: 40,
            offsetY: 14,
            zoomX: 5,
            zoomY: 50,
            isPanning: false,
            panStartX: 0,
            panStartY: 0
        };

        // Keyframe data
        this.channels = [];
        this.currentChannel = null;

        // Grid and scale
        this.gridEnabled = true;

        // Callbacks
        this.onEdit = null;    // keyframe/tangent changed
        this.onScrub = null;   // playhead scrubbed (frame)

        this.setupEventListeners();
    }

    setupEventListeners() {
        this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
        this.canvas.addEventListener('mouseup', (e) => this.onMouseUp(e));
        this.canvas.addEventListener('dblclick', (e) => this.onDoubleClick(e));
        this.canvas.addEventListener('wheel', (e) => this.onMouseWheel(e), { passive: false });
        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

        this.canvas.tabIndex = 0;
        this.canvas.addEventListener('keydown', (e) => {
            if (e.key === 'Delete' || e.key === 'Backspace') {
                e.preventDefault();
                this.deleteSelectedKeyframes();
            }
        });
    }

    // ==================== COORDINATE MAPPING ====================

    _xForFrame(f) { return this.view.offsetX + f * this.view.zoomX; }

    _yForValue(v) { return this.view.offsetY + (this._vMax - v) * this.view.zoomY; }

    _frameForX(x) { return (x - this.view.offsetX) / this.view.zoomX; }

    _valueForY(y) { return this._vMax - (y - this.view.offsetY) / this.view.zoomY; }

    /** Auto-fit the value scale to the current channel (pad 20%) */
    fitView() {
        const ch = this.currentChannel;
        if (!ch || !ch.keyframes.length) {
            this._vMin = 0; this._vMax = 100;
            this.view.zoomY = 50;
            return;
        }
        let lo = Infinity, hi = -Infinity;
        ch.keyframes.forEach(kf => {
            lo = Math.min(lo, kf.value, kf.timingHandle ? kf.timingHandle.inY : kf.value, kf.timingHandle ? kf.timingHandle.outY : kf.value);
            hi = Math.max(hi, kf.value, kf.timingHandle ? kf.timingHandle.inY : kf.value, kf.timingHandle ? kf.timingHandle.outY : kf.value);
        });
        if (!Number.isFinite(lo) || !Number.isFinite(hi)) { lo = 0; hi = 100; }
        if (hi - lo < 1e-6) { lo -= 5; hi += 5; }
        const pad = (hi - lo) * 0.2;
        this._vMin = lo - pad;
        this._vMax = hi + pad;
        this.view.zoomY = Math.max(1, this.canvas.height / (this._vMax - this._vMin));
    }

    getMousePos(e) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: (e.clientX - rect.left) * (this.canvas.width / rect.width),
            y: (e.clientY - rect.top) * (this.canvas.height / rect.height)
        };
    }

    // ==================== CHANNEL LOADING ====================

    /** Load channels from a Map (or array) of channels; keep current selection */
    loadChannels(channelMap, currentId) {
        this.channels = channelMap instanceof Map ? [...channelMap.values()] : [...channelMap];
        if (currentId) {
            this.currentChannel = this.channels.find(c => c.id === currentId) || null;
        } else if (!this.currentChannel || !this.channels.includes(this.currentChannel)) {
            this.currentChannel = this.channels[0] || null;
        }
        if (this.currentChannel) this.currentChannel.keyframes.sort((a, b) => a.frame - b.frame);
        this.fitView();
        this.render();
    }

    // ==================== INTERACTION ====================

    _handleAtPos(pos, kf) {
        if (!kf || !kf.timingHandle) return null;
        const h = kf.timingHandle;
        const px = this._xForFrame(kf.frame);
        const py = this._yForValue(kf.value);
        const pts = {
            in: { x: this._xForFrame(h.inX), y: this._yForValue(h.inY) },
            out: { x: this._xForFrame(h.outX), y: this._yForValue(h.outY) }
        };
        for (const side of ['in', 'out']) {
            if (Math.hypot(pos.x - pts[side].x, pos.y - pts[side].y) < 9) {
                return { side, ...pts[side], px, py };
            }
        }
        return null;
    }

    _keyframeAtPos(pos) {
        if (!this.currentChannel) return null;
        for (const kf of this.currentChannel.keyframes) {
            const px = this._xForFrame(kf.frame);
            const py = this._yForValue(kf.value);
            if (Math.hypot(pos.x - px, pos.y - py) < 8) return kf;
        }
        return null;
    }

    onMouseDown(e) {
        const pos = this.getMousePos(e);

        if (e.button === 2) {
            this.view.isPanning = true;
            this.view.panStartX = pos.x;
            this.view.panStartY = pos.y;
            this.canvas.style.cursor = 'grabbing';
            return;
        }
        if (e.button !== 0) return;

        // 1. Tangent handles
        const sel = this.selectedKeyframes[this.selectedKeyframes.length - 1];
        const handle = sel ? this._handleAtPos(pos, sel) : null;
        if (handle) {
            this.selectedHandle = handle.side;
            this.isDragging = true;
            this.canvas.style.cursor = 'crosshair';
            return;
        }

        // 2. Keyframe point
        const kf = this._keyframeAtPos(pos);
        if (kf) {
            this.isDragging = true;
            this.draggedKeyframe = kf;
            if (e.shiftKey) {
                if (this.selectedKeyframes.includes(kf)) {
                    this.selectedKeyframes = this.selectedKeyframes.filter(k => k !== kf);
                } else {
                    this.selectedKeyframes.push(kf);
                }
            } else {
                this.selectedKeyframes = [kf];
            }
            this.canvas.style.cursor = 'grabbing';
            this.render();
            return;
        }

        // 3. Empty area -> scrub the playhead
        this.selectedKeyframes = [];
        this.isScrubbing = true;
        this._applyScrub(pos);
    }

    onMouseMove(e) {
        const pos = this.getMousePos(e);

        if (this.view.isPanning) {
            const dx = pos.x - this.view.panStartX;
            const dy = pos.y - this.view.panStartY;
            this.view.panStartX = pos.x;
            this.view.panStartY = pos.y;
            this.view.offsetX += dx;
            this.view.offsetY += dy;
            this.render();
            return;
        }

        if (this.isScrubbing) {
            this._applyScrub(pos);
            return;
        }

        if (this.isDragging && this.selectedHandle && this.draggedKeyframe) {
            // Tangent handle drag
            const kf = this.draggedKeyframe;
            const h = kf.timingHandle || { inX: kf.frame - 5, inY: kf.value, outX: kf.frame + 5, outY: kf.value };
            kf.timingHandle = h;
            if (this.selectedHandle === 'out') {
                h.outX = this._frameForX(pos.x);
                h.outY = this._valueForY(pos.y);
            } else {
                h.inX = this._frameForX(pos.x);
                h.inY = this._valueForY(pos.y);
            }
            this.render();
            if (this.onEdit) this.onEdit();
            return;
        }

        if (this.isDragging && this.draggedKeyframe) {
            const kf = this.draggedKeyframe;
            const newFrame = Math.max(0, Math.round(this._frameForX(pos.x)));
            kf.frame = newFrame;
            kf.value = this._valueForY(pos.y);
            if (kf.timingHandle) {
                const dFrame = kf.timingHandle.outX - kf.timingHandle.inX;
                kf.timingHandle.inX = newFrame - dFrame / 2;
                kf.timingHandle.outX = newFrame + dFrame / 2;
            }
            this.currentChannel.keyframes.sort((a, b) => a.frame - b.frame);
            this.render();
            if (this.onEdit) this.onEdit();
            return;
        }

        this.canvas.style.cursor = this._keyframeAtPos(pos) || this._handleAtPos(pos, this.selectedKeyframes[this.selectedKeyframes.length - 1]) ? 'pointer' : 'default';
    }

    onMouseUp() {
        this.isDragging = false;
        this.draggedKeyframe = null;
        this.selectedHandle = null;
        this.isScrubbing = false;
        this.view.isPanning = false;
        this.canvas.style.cursor = 'default';
    }

    onMouseWheel(e) {
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.15 : 0.87;
        this.view.zoomX = Math.max(0.5, Math.min(60, this.view.zoomX * factor));
        this.render();
    }

    onDoubleClick(e) {
        const pos = this.getMousePos(e);
        if (!this.currentChannel) return;
        const frame = Math.max(0, Math.round(this._frameForX(pos.x)));
        if (this.currentChannel.keyframes.some(kf => kf.frame === frame)) return;
        const value = this._valueForY(pos.y);
        this.currentChannel.keyframes.push({
            frame,
            value,
            timingHandle: { inX: frame - 5, inY: value, outX: frame + 5, outY: value },
            interpolation: 'bezier'
        });
        this.currentChannel.keyframes.sort((a, b) => a.frame - b.frame);
        this.fitView();
        this.render();
        if (this.onEdit) this.onEdit();
    }

    _applyScrub(pos) {
        const frame = Math.max(0, Math.round(this._frameForX(pos.x)));
        if (this.onScrub) this.onScrub(frame);
        this.render();
    }

    // ==================== EDITING ====================

    deleteSelectedKeyframes() {
        if (!this.currentChannel || !this.selectedKeyframes.length) return;
        this.currentChannel.keyframes = this.currentChannel.keyframes.filter(
            kf => !this.selectedKeyframes.includes(kf)
        );
        this.selectedKeyframes = [];
        this.fitView();
        this.render();
        if (this.onEdit) this.onEdit();
    }

    addKeyframeAtPlayhead() {
        if (!this.currentChannel) return;
        const frame = Math.round((window.currentTime || 0) * (window.fps || 24));
        const existing = this.currentChannel.keyframes.find(kf => kf.frame === frame);
        if (existing) {
            this.selectedKeyframes = [existing];
            this.render();
            return;
        }
        const value = 0;
        this.currentChannel.keyframes.push({
            frame,
            value,
            timingHandle: { inX: frame - 5, inY: value, outX: frame + 5, outY: value },
            interpolation: 'bezier'
        });
        this.currentChannel.keyframes.sort((a, b) => a.frame - b.frame);
        this.selectedKeyframes = [this.currentChannel.keyframes.find(kf => kf.frame === frame)];
        this.fitView();
        this.render();
        if (this.onEdit) this.onEdit();
    }

    setEasing(easingType) {
        if (!this.currentChannel) return;
        this.currentChannel.easingType = easingType;
        this.render();
    }

    copyKeyframes() {
        return JSON.parse(JSON.stringify(this.selectedKeyframes));
    }

    pasteKeyframes(data, offset = 0) {
        if (!this.currentChannel) return;
        const pasted = data.map(kf => ({
            ...kf,
            frame: Math.max(0, kf.frame + offset)
        }));
        this.currentChannel.keyframes.push(...pasted);
        this.currentChannel.keyframes.sort((a, b) => a.frame - b.frame);
        this.fitView();
        this.render();
        if (this.onEdit) this.onEdit();
    }

    // ==================== RENDERING ====================

    render() {
        if (!this.isActive) return;

        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.fillStyle = '#14161a';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        this.drawGrid();

        if (this.currentChannel) {
            this.drawChannel(this.currentChannel);
        }

        this.drawPlayhead();
    }

    drawGrid() {
        const ctx = this.ctx;

        // Value gridlines
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.lineWidth = 1;
        const stepV = (this._vMax - this._vMin) / 10;
        for (let i = 0; i <= 10; i++) {
            const v = this._vMin + i * stepV;
            const y = Math.round(this._yForValue(v)) + 0.5;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(this.canvas.width, y);
            ctx.stroke();
        }

        // Frame gridlines + labels
        const firstFrame = Math.max(0, Math.floor(this._frameForX(0)));
        const lastFrame = Math.ceil(this._frameForX(this.canvas.width));
        for (let f = firstFrame; f <= lastFrame; f++) {
            const x = Math.round(this._xForFrame(f)) + 0.5;
            ctx.strokeStyle = f % 10 === 0 ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)';
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, this.canvas.height);
            ctx.stroke();
            if (f % 10 === 0) {
                ctx.fillStyle = 'rgba(255,255,255,0.35)';
                ctx.font = '9px Inter, sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(String(f), x, this.canvas.height - 3);
            }
        }

        // Zero axis if in range
        if (this._vMin <= 0 && this._vMax >= 0) {
            const y = Math.round(this._yForValue(0)) + 0.5;
            ctx.strokeStyle = 'rgba(255,255,255,0.25)';
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(this.canvas.width, y);
            ctx.stroke();
        }
    }

    drawChannel(channel) {
        if (!channel.keyframes || !channel.keyframes.length) return;

        const keyframes = [...channel.keyframes].sort((a, b) => a.frame - b.frame);

        this.drawBezierCurve(keyframes, channel.color);

        keyframes.forEach((kf) => {
            const isSelected = this.selectedKeyframes.includes(kf);
            this.drawKeyframePoint(kf, isSelected);
            if (isSelected && kf.timingHandle) {
                this.drawBezierHandles(kf);
            }
        });
    }

    drawBezierCurve(keyframes, color) {
        const ctx = this.ctx;
        ctx.strokeStyle = color || '#00ff88';
        ctx.lineWidth = 2;
        ctx.beginPath();

        keyframes.forEach((kf, i) => {
            const x = this._xForFrame(kf.frame);
            const y = this._yForValue(kf.value);
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                const prev = keyframes[i - 1];
                const hOut = prev.timingHandle || { outX: prev.frame + 5, outY: prev.value };
                const hIn = kf.timingHandle || { inX: kf.frame - 5, inY: kf.value };
                ctx.bezierCurveTo(
                    this._xForFrame(hOut.outX), this._yForValue(hOut.outY),
                    this._xForFrame(hIn.inX), this._yForValue(hIn.inY),
                    x, y
                );
            }
        });

        ctx.stroke();
    }

    drawKeyframePoint(kf, isSelected) {
        const ctx = this.ctx;
        const x = this._xForFrame(kf.frame);
        const y = this._yForValue(kf.value);

        ctx.fillStyle = isSelected ? '#ffd166' : '#00ff88';
        ctx.beginPath();
        ctx.arc(x, y, isSelected ? 5.5 : 4, 0, Math.PI * 2);
        ctx.fill();

        if (isSelected) {
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.5;
            ctx.stroke();
        }
    }

    drawBezierHandles(kf) {
        const ctx = this.ctx;
        const h = kf.timingHandle;
        const kfX = this._xForFrame(kf.frame);
        const kfY = this._yForValue(kf.value);
        const inX = this._xForFrame(h.inX);
        const inY = this._yForValue(h.inY);
        const outX = this._xForFrame(h.outX);
        const outY = this._yForValue(h.outY);

        ctx.strokeStyle = 'rgba(255,153,0,0.8)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(inX, inY);
        ctx.lineTo(kfX, kfY);
        ctx.lineTo(outX, outY);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = '#ff9900';
        for (const p of [[inX, inY], [outX, outY]]) {
            ctx.beginPath();
            ctx.arc(p[0], p[1], 3.5, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    drawPlayhead() {
        if (typeof window.currentTime !== 'number') return;
        const frame = Math.round(window.currentTime * (window.fps || 24));
        const x = Math.round(this._xForFrame(frame)) + 0.5;
        const ctx = this.ctx;
        ctx.strokeStyle = 'rgba(255,107,53,0.9)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, this.canvas.height);
        ctx.stroke();
    }
}

window.AdvancedKeyframeEditor = AdvancedKeyframeEditor;
