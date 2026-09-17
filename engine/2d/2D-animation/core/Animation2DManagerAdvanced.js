/**
 * Animation2DManagerAdvanced - Enhanced 2D Animation with Blender Features
 * Includes: Bezier keyframes, 2D/3D mixing, lighting, shadows, advanced interpolation
 * Version: 2.0
 */

class Animation2DManagerAdvanced extends Animation2DManager {
    constructor() {
        super();

        // Enhanced keyframe system with animation curves
        this.keyframeChannels = new Map(); // channelId -> {keyframes: [], easingType, color}
        this.selectedChannel = null;

        // Lighting system
        this.lightingEnabled = true;
        this.ambientLight = { color: '#ffffff', intensity: 0.6 };
        this.directionalLights = [];
        this.pointLights = [];
        this.shadowsEnabled = true;
        this.shadowBlur = 8;

        // 2D/3D Integration
        this.render3DOverlay = false;
        this.overlayOpacity = 1;
        this.cameraLinkTo3D = true;
        this.depthLayers = new Map(); // layerId -> depth value

        // Audio & lip-sync (kuchipaku)
        this.audioState = {
            buffer: null,
            ctx: null,
            source: null,
            gain: null,
            playing: false,
            startCtxTime: 0,
            startOffset: 0,
            pausedOffset: 0,
            mouthLevels: [],   // per-frame mouth openness 0..3
            mouthLabels: [],   // per-frame shape label
            lastPlayhead: -1
        };

        // Advanced effects
        this.motionBlurEnabled = false;
        this.motionBlurSamples = 4;
        this.colorGradingEnabled = false;
        this.colorGradingLUT = null;
        this.bloomEnabled = false;
        this.bloomThreshold = 0.8;
        this.bloomStrength = 0.5;

        // Stroke enhancement
        this.strokeTexturingEnabled = true;
        // Simplification OFF by default — enables on save only, not during live render
        this.strokeSimplificationEnabled = false;
        this.strokeSimplificationTolerance = 1.5;
        this.velocityPressureEnabled = false;

        // Keyframe interpolation options
        this.interpolationModes = {
            linear: (t) => t,
            easeInQuad: (t) => t * t,
            easeOutQuad: (t) => t * (2 - t),
            easeInOutQuad: (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
            easeInCubic: (t) => t * t * t,
            easeOutCubic: (t) => (--t) * t * t + 1,
            easeInOutCubic: (t) => t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * (t - 2)) * (2 * (t - 2)) + 1,
            easeInCirc: (t) => 1 - Math.sqrt(1 - t * t),
            easeOutCirc: (t) => Math.sqrt(1 - (--t) * t),
            easeInOutCirc: (t) => t < 0.5 ? (1 - Math.sqrt(1 - 4 * t * t)) / 2 : (1 + Math.sqrt(1 - (2 * t - 2) * (2 * t - 2))) / 2
        };

        // Bezier curve cache for keyframes
        this.bezierCache = new Map();

        this.initAdvancedFeatures();

        this._strokeBaseCanvas = document.createElement('canvas');
        this._strokeBaseCtx = this._strokeBaseCanvas.getContext('2d', {
            alpha: true,
            desynchronized: true
        });
        this._strokeRenderRequest = 0;
        this._maxCoalescedSamples = 4;
    }

    initAdvancedFeatures() {
        // Initialize lighting system
        this.addDefaultLights();

        // Setup advanced UI panel
        this.setupAdvancedUIPanel();

        // Setup keyframe graph visualization
        this.setupKeyframeGraph();

        console.log("✅ Advanced 2D Animation Features Initialized");
    }

    // ==================== LIGHTING SYSTEM ====================

    addDefaultLights() {
        // Default 3-point lighting setup
        this.directionalLights = [
            { id: 'key', position: { x: 1, y: 1, z: 1 }, intensity: 1.0, color: '#ffffff' },
            { id: 'fill', position: { x: -0.5, y: 0.5, z: 0.5 }, intensity: 0.5, color: '#e8e8ff' },
            { id: 'back', position: { x: 0, y: -1, z: -1 }, intensity: 0.4, color: '#ffebe8' }
        ];
    }

    updateLighting(ctx) {
        if (!this.lightingEnabled || !ctx) return;

        // Apply shadow rendering for each light
        this.directionalLights.forEach(light => {
            this.renderLightShadow(ctx, light);
        });

        this.pointLights.forEach(light => {
            this.renderPointLightGlow(ctx, light);
        });
    }
    _captureStrokeBase() {
        const w = this.canvas.width;
        const h = this.canvas.height;

        if (this._strokeBaseCanvas.width !== w) {
            this._strokeBaseCanvas.width = w;
        }

        if (this._strokeBaseCanvas.height !== h) {
            this._strokeBaseCanvas.height = h;
        }

        const ctx = this._strokeBaseCtx;

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(this.canvas, 0, 0);
    }

    renderLightShadow(ctx, light) {
        if (!this.shadowsEnabled) return;

        // Convert light position to screen space
        const lightX = 800 + (light.position.x * 300);
        const lightY = 600 + (light.position.y * 300);

        ctx.save();
        ctx.globalCompositeOperation = 'multiply';
        ctx.globalAlpha = 0.15;
        ctx.shadowOffsetX = (lightX - 400) * 0.1;
        ctx.shadowOffsetY = (lightY - 300) * 0.1;
        ctx.shadowBlur = this.shadowBlur;
        ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
        ctx.restore();
    }

    renderPointLightGlow(ctx, light) {
        const glow = new RadialGradient(light.x, light.y, 0, light.x, light.y, light.radius);
        glow.addColorStop(0, `rgba(255, 255, 255, 0.3)`);
        glow.addColorStop(1, 'rgba(255, 255, 255, 0)');

        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        ctx.restore();
    }

    // ==================== 2D/3D INTEGRATION ====================

    _use3DUnderlay() {
        return !!this.render3DOverlay;
    }

    _get3DRendererCanvas() {
        if (window.renderer && window.renderer.domElement) return window.renderer.domElement;
        const inContainer = document.querySelector('#renderer-container canvas');
        if (inContainer) return inContainer;
        return document.querySelector('#canvas') || document.querySelector('canvas.renderer');
    }

    /**
     * 3D underlay: the live 3D viewport stays behind the transparent 2D canvas.
     * Opacity of the 3D canvas controls how strongly the drawing pops out.
     */
    update3DUnderlay() {
        if (this.isActive) this._applyWhiteWorkspaceBackground?.();
        const rCanvas = this._get3DRendererCanvas();
        if (!rCanvas) return;
        if (this.render3DOverlay && this.isActive) {
            const opacity = Math.max(0.05, Math.min(1, Number(this.overlayOpacity) || 1));
            rCanvas.style.opacity = String(opacity);
        } else {
            rCanvas.style.opacity = '';
        }
    }

    onAdvancedSettingChange() {
        if (!this.isActive) return;
        document.body.classList.toggle('animation-2d-3d-underlay', this._use3DUnderlay());
        document.getElementById('tool-3d-underlay')?.classList.toggle('active', this._use3DUnderlay());
        document.querySelector('[data-anime2d-action="3d-underlay"]')?.classList.toggle('active', this._use3DUnderlay());
        if (this._use3DUnderlay()) {
            const ctl = window.orbitControls || window.controls;
            if (ctl) {
                ctl.enabled = this.cameraLinkTo3D !== false;
                ctl.update?.();
            }
        }
        this.update3DUnderlay();
    }

    linkToScene() {
        if (!window.scene || !window.camera) return;

        // Sync 2D canvas camera to 3D camera
        if (this.cameraLinkTo3D && !this._use3DUnderlay()) {
            const camPosition = window.camera.position;
            this.view2D.offsetX = (camPosition.x * 100) + (this.canvas.width / 2);
            this.view2D.offsetY = (camPosition.y * 100) + (this.canvas.height / 2);
            this.view2D.scale = Math.max(0.5, Math.min(2, camPosition.z * 0.5));
        }
    }

    render3DBackgroundLayer(ctx) {
        // Legacy drawImage capture — replaced by update3DUnderlay() (live DOM opacity)
        this.update3DUnderlay();
    }

    // ==================== ADVANCED KEYFRAME SYSTEM ====================

    createKeyframeChannel(id, name, easingType = 'easeInOutQuad', color = '#00ff00') {
        const channel = {
            id,
            name,
            keyframes: [],
            easingType,
            color,
            _curve: null
        };
        this.keyframeChannels.set(id, channel);
        return channel;
    }

    addKeyframeToChannel(channelId, frame, value, timingHandle = null) {
        const channel = this.keyframeChannels.get(channelId);
        if (!channel) return;

        const keyframe = {
            frame,
            value,
            timingHandle: timingHandle || { inX: frame - 5, inY: value, outX: frame + 5, outY: value },
            interpolation: 'bezier'
        };

        // Insert in sorted order
        const insertIdx = channel.keyframes.findIndex(kf => kf.frame > frame);
        if (insertIdx === -1) {
            channel.keyframes.push(keyframe);
        } else {
            channel.keyframes.splice(insertIdx, 0, keyframe);
        }

        // Invalidate curve cache
        this.bezierCache.delete(channelId);
        this.render();
    }

    evaluateChannel(channelId, frame) {
        const channel = this.keyframeChannels.get(channelId);
        if (!channel || channel.keyframes.length === 0) return 0;

        const keyframes = channel.keyframes;
        if (frame <= keyframes[0].frame) return keyframes[0].value;
        if (frame >= keyframes[keyframes.length - 1].frame) return keyframes[keyframes.length - 1].value;

        // Find surrounding keyframes
        let idx = 0;
        for (let i = 0; i < keyframes.length - 1; i++) {
            if (keyframes[i].frame <= frame && frame <= keyframes[i + 1].frame) {
                idx = i;
                break;
            }
        }

        const kf0 = keyframes[idx];
        const kf1 = keyframes[idx + 1];
        const t = (frame - kf0.frame) / (kf1.frame - kf0.frame);

        // Apply easing
        const easing = this.interpolationModes[channel.easingType] || this.interpolationModes.linear;
        const easedT = easing(t);

        return kf0.value + (kf1.value - kf0.value) * easedT;
    }

    // ==================== ADVANCED STROKE EFFECTS ====================

    simplifyStroke(points, tolerance = 2) {
        if (!this.strokeSimplificationEnabled || points.length < 3) return points;

        // Ramer-Douglas-Peucker algorithm
        const rdp = (points, epsilon) => {
            let dmax = 0;
            let index = 0;
            const start = points[0];
            const end = points[points.length - 1];
            const dx = end.x - start.x;
            const dy = end.y - start.y;
            const len = Math.sqrt(dx * dx + dy * dy);

            for (let i = 1; i < points.length - 1; i++) {
                const d = Math.abs((dy * points[i].x - dx * points[i].y + end.x * start.y - end.y * start.x) / len);
                if (d > dmax) {
                    index = i;
                    dmax = d;
                }
            }

            if (dmax > epsilon) {
                const left = rdp(points.slice(0, index + 1), epsilon);
                const right = rdp(points.slice(index), epsilon);
                return left.slice(0, left.length - 1).concat(right);
            } else {
                return [start, end];
            }
        };

        return rdp(points, tolerance);
    }

    applyMotionBlur(ctx, stroke, previousStroke) {
        if (!this.motionBlurEnabled || !previousStroke) return;

        ctx.save();
        ctx.globalAlpha *= 0.3;
        for (let i = 1; i < this.motionBlurSamples; i++) {
            const alpha = i / this.motionBlurSamples;
            const blend = 1 - alpha;
            ctx.globalAlpha = (0.3 / this.motionBlurSamples);

            // Blend between previous and current
            const blendedPoints = previousStroke.points.map((p, idx) => ({
                x: p.x * blend + (stroke.points[idx]?.x || p.x) * alpha,
                y: p.y * blend + (stroke.points[idx]?.y || p.y) * alpha,
                p: p.p * blend + (stroke.points[idx]?.p || p.p) * alpha
            }));

            this.drawStroke({ ...stroke, points: blendedPoints }, ctx);
        }
        ctx.restore();
    }

    applyVelocityPressure(stroke) {
        if (!this.velocityPressureEnabled || !stroke.points || stroke.points.length < 2) return stroke;

        const enhanced = { ...stroke };
        enhanced.points = enhanced.points.map((p, i) => {
            if (i === 0 || i === enhanced.points.length - 1) return p;

            const dx = enhanced.points[i + 1].x - enhanced.points[i - 1].x;
            const dy = enhanced.points[i + 1].y - enhanced.points[i - 1].y;
            const velocity = Math.sqrt(dx * dx + dy * dy);
            const velocityPressure = Math.min(1, velocity / 50);

            return { ...p, p: p.p * (0.5 + velocityPressure * 0.5) };
        });

        return enhanced;
    }

    // ==================== COLOR & EFFECTS ====================

    applyColorGrading(ctx) {
        if (!this.colorGradingEnabled || !this.colorGradingLUT) return;

        const imageData = ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
        const data = imageData.data;

        for (let i = 0; i < data.length; i += 4) {
            const r = Math.floor(data[i] / 256 * this.colorGradingLUT.length);
            const g = Math.floor(data[i + 1] / 256 * this.colorGradingLUT.length);
            const b = Math.floor(data[i + 2] / 256 * this.colorGradingLUT.length);

            const idx = r + g * this.colorGradingLUT.length + b * this.colorGradingLUT.length * this.colorGradingLUT.length;
            if (idx < this.colorGradingLUT.length) {
                const graded = this.colorGradingLUT[idx];
                data[i] = graded.r;
                data[i + 1] = graded.g;
                data[i + 2] = graded.b;
            }
        }

        ctx.putImageData(imageData, 0, 0);
    }

    applyBloom(ctx) {
        if (!this.bloomEnabled) return;

        ctx.save();
        ctx.filter = `blur(${Math.max(1, this.bloomStrength * 20)}px)`;
        ctx.globalAlpha = this.bloomStrength * 0.3;
        ctx.drawImage(this.canvas, 0, 0);
        ctx.restore();
    }

    // ==================== KEYFRAME GRAPH VISUALIZATION ====================

    drawKeyframeGraph(ctx, channelId) {
        const channel = this.keyframeChannels.get(channelId);
        if (!channel || channel.keyframes.length < 2) return;

        const graphWidth = Math.min(400, this.canvas.width * 0.4);
        const graphHeight = 150;
        const graphX = 10;
        const graphY = 10;

        ctx.save();
        ctx.strokeStyle = channel.color;
        ctx.lineWidth = 2;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';

        // Draw background
        ctx.fillRect(graphX, graphY, graphWidth, graphHeight);
        ctx.strokeRect(graphX, graphY, graphWidth, graphHeight);

        // Draw curve
        const minVal = Math.min(...channel.keyframes.map(kf => kf.value));
        const maxVal = Math.max(...channel.keyframes.map(kf => kf.value));
        const valRange = maxVal - minVal || 1;

        ctx.beginPath();
        channel.keyframes.forEach((kf, i) => {
            const px = graphX + (kf.frame / 100) * graphWidth;
            const py = graphY + graphHeight - ((kf.value - minVal) / valRange) * graphHeight;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        });
        ctx.stroke();

        // Draw keyframe markers
        ctx.fillStyle = channel.color;
        channel.keyframes.forEach(kf => {
            const px = graphX + (kf.frame / 100) * graphWidth;
            const py = graphY + graphHeight - ((kf.value - minVal) / valRange) * graphHeight;
            ctx.beginPath();
            ctx.arc(px, py, 4, 0, Math.PI * 2);
            ctx.fill();
        });

        ctx.restore();
    }

    // ==================== UI SETUP ====================

    setupAdvancedUIPanel() {
        // Panel lives in the inspector DOM — just bind controls
        this.bindAdvancedUIControls();
    }

    bindAdvancedUIControls() {
        const bind = (id, property, type = 'checkbox') => {
            const el = document.getElementById(id);
            if (!el) return;

            if (type === 'checkbox') {
                el.checked = this[property];
                el.addEventListener('change', (e) => {
                    this[property] = e.target.checked;
                    this.onAdvancedSettingChange?.();
                    this.render();
                });
            } else if (type === 'range') {
                el.value = this[property];
                const valEl = document.getElementById(id + '-val');
                const fmt = (v) => {
                    if (valEl) valEl.textContent = Math.round(parseFloat(v) * 100) + '%';
                };
                fmt(el.value);
                el.addEventListener('input', (e) => {
                    this[property] = parseFloat(e.target.value);
                    fmt(e.target.value);
                    this.render();
                });
            }
        };

        bind('adv-lighting-toggle', 'lightingEnabled', 'checkbox');
        bind('adv-shadow-blur', 'shadowBlur', 'range');
        bind('adv-shadows-toggle', 'shadowsEnabled', 'checkbox');
        bind('adv-render-3d-toggle', 'render3DOverlay', 'checkbox');
        bind('adv-overlay-opacity', 'overlayOpacity', 'range');
        bind('adv-camera-link-toggle', 'cameraLinkTo3D', 'checkbox');
        bind('adv-motion-blur-toggle', 'motionBlurEnabled', 'checkbox');
        bind('adv-color-grade-toggle', 'colorGradingEnabled', 'checkbox');
        bind('adv-bloom-toggle', 'bloomEnabled', 'checkbox');
        bind('adv-bloom-strength', 'bloomStrength', 'range');
        bind('adv-stroke-simplify-toggle', 'strokeSimplificationEnabled', 'checkbox');
        bind('adv-velocity-pressure-toggle', 'velocityPressureEnabled', 'checkbox');
        bind('adv-stroke-texture-toggle', 'strokeTexturingEnabled', 'checkbox');
        bind('adv-onion-toggle', 'onionSkinning', 'checkbox');

        const bindCount = (id, prop) => {
            const el = document.getElementById(id);
            if (!el) return;
            el.addEventListener('input', () => {
                this[prop] = parseInt(el.value, 10) || 0;
                const valEl = document.getElementById(id + '-val');
                if (valEl) valEl.textContent = String(this[prop]);
                this.render();
            });
        };
        bindCount('adv-onion-prev', 'onionSkinPrev');
        bindCount('adv-onion-next', 'onionSkinNext');

        const onionAlpha = document.getElementById('adv-onion-alpha');
        if (onionAlpha) {
            onionAlpha.addEventListener('input', () => {
                this.onionSkinAlpha = parseFloat(onionAlpha.value);
                const valEl = document.getElementById('adv-onion-alpha-val');
                if (valEl) valEl.textContent = Math.round(this.onionSkinAlpha * 100) + '%';
                this.render();
            });
        }

        const bindColor = (id, prop) => {
            const el = document.getElementById(id);
            if (!el) return;
            el.addEventListener('input', () => {
                this[prop] = el.value;
                this.render();
            });
        };
        bindColor('adv-onion-prev-color', 'onionSkinPrevColor');
        bindColor('adv-onion-next-color', 'onionSkinNextColor');

        document.getElementById('adv-export-keyframes')?.addEventListener('click', () => this.exportKeyframeData());
        document.getElementById('adv-import-keyframes')?.addEventListener('click', () => this.importKeyframeData());

        this.bindExportControls();
        this.bindCameraInspectorControls();
        this.bindAudioControls();
        this.bindFCurveControls();
    }

    // ==================== F-CURVE CHANNELS ====================

    _cubic(p0, p1, p2, p3, t) {
        const u = 1 - t;
        return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
    }

    /** Evaluate a channel's bezier curve at a frame (bisection on the x-axis) */
    _evaluateChannelBezier(channel, frame) {
        const kfs = [...channel.keyframes].sort((a, b) => a.frame - b.frame);
        if (!kfs.length) return 0;
        if (kfs.length === 1) return kfs[0].value;
        if (frame <= kfs[0].frame) return kfs[0].value;
        if (frame >= kfs[kfs.length - 1].frame) return kfs[kfs.length - 1].value;

        for (let i = 0; i < kfs.length - 1; i++) {
            const a = kfs[i];
            const b = kfs[i + 1];
            if (frame < a.frame || frame > b.frame) continue;

            const hA = a.timingHandle || { inX: a.frame - 5, inY: a.value, outX: a.frame + 5, outY: a.value };
            const hB = b.timingHandle || { inX: b.frame - 5, inY: b.value, outX: b.frame + 5, outY: b.value };

            let lo = 0, hi = 1;
            for (let it = 0; it < 32; it++) {
                const t = (lo + hi) / 2;
                const x = this._cubic(a.frame, hA.outX, hB.inX, b.frame, t);
                if (x < frame) lo = t; else hi = t;
            }
            const t = (lo + hi) / 2;
            return this._cubic(a.value, hA.outY, hB.inY, b.value, t);
        }
        return kfs[kfs.length - 1].value;
    }

    _hasCameraChannels() {
        return this.keyframeChannels.has('camX') || this.keyframeChannels.has('camY') ||
            this.keyframeChannels.has('camZoom') || this.keyframeChannels.has('camRot');
    }

    /** When F-curve channels exist, they are the authoritative camera driver */
    _applyCameraChannels() {
        if (!this._hasCameraChannels()) return;
        // Let the user frame live in camera tool; keyframe writes stick below
        if (this.currentTool === 'camera') return;
        const frame = this.getCurrentFrameIndex();
        const v = (id, def) => {
            const ch = this.keyframeChannels.get(id);
            if (ch && ch.keyframes.length) return this._evaluateChannelBezier(ch, frame);
            return def;
        };
        this.camera2D = {
            x: v('camX', this.camera2D.x),
            y: v('camY', this.camera2D.y),
            zoom: Math.max(0.05, v('camZoom', this.camera2D.zoom)),
            rotation: v('camRot', this.camera2D.rotation)
        };
    }

    _writeCameraChannelKey(id, frame, value) {
        const ch = this.keyframeChannels.get(id);
        if (!ch) return;
        const existing = ch.keyframes.find(kf => kf.frame === frame);
        if (existing) {
            existing.value = value;
        } else {
            ch.keyframes.push({
                frame, value, interpolation: 'bezier',
                timingHandle: { inX: frame - 5, inY: value, outX: frame + 5, outY: value }
            });
            ch.keyframes.sort((a, b) => a.frame - b.frame);
        }
        this.bezierCache.delete(id);
    }

    /** Keep the camera tool workflow coherent with F-curve channels when present */
    insertCameraKeyframe() {
        super.insertCameraKeyframe();
        if (this._hasCameraChannels()) {
            const frame = this.getCurrentFrameIndex();
            const cam = this.camera2D;
            this._writeCameraChannelKey('camX', frame, cam.x);
            this._writeCameraChannelKey('camY', frame, cam.y);
            this._writeCameraChannelKey('camZoom', frame, cam.zoom);
            this._writeCameraChannelKey('camRot', frame, cam.rotation);
            this.refreshFCurveChannels();
        }
    }

    deleteCameraKeyframeAtCurrent() {
        super.deleteCameraKeyframeAtCurrent();
        const frame = this.getCurrentFrameIndex();
        ['camX', 'camY', 'camZoom', 'camRot'].forEach(id => {
            const ch = this.keyframeChannels.get(id);
            if (!ch) return;
            ch.keyframes = ch.keyframes.filter(kf => kf.frame !== frame);
            this.bezierCache.delete(id);
        });
        this.refreshFCurveChannels();
    }

    clearCameraKeyframes() {
        super.clearCameraKeyframes();
        ['camX', 'camY', 'camZoom', 'camRot'].forEach(id => this.keyframeChannels.delete(id));
        this.bezierCache.clear();
        this.refreshFCurveChannels();
    }

    /** Convert camera keyframes into bezier channels (camX/camY/camZoom/camRot) */
    bakeCameraChannels() {
        if (!this.cameraKeyframes.size) { alert('No camera keyframes to bake — use the camera tool + Key button first.'); return; }

        const props = [
            ['camX', 'Camera X', '#ff6b6b'],
            ['camY', 'Camera Y', '#4ecdc4'],
            ['camZoom', 'Camera Zoom', '#ffd166'],
            ['camRot', 'Camera Rotation', '#a29bfe']
        ];

        props.forEach(([id, name, color]) => {
            if (!this.keyframeChannels.has(id)) {
                this.createKeyframeChannel(id, name, 'easeInOutQuad', color);
            }
            const ch = this.keyframeChannels.get(id);
            const kfs = [];
            this.cameraKeyframes.forEach((cam, frame) => {
                const val = id === 'camX' ? cam.x : id === 'camY' ? cam.y : id === 'camZoom' ? cam.zoom : cam.rotation;
                kfs.push({ frame, value: val, interpolation: 'bezier' });
            });
            kfs.forEach((kf, i) => {
                const prev = kfs[i - 1];
                const next = kfs[i + 1];
                const dIn = prev ? (kf.frame - prev.frame) / 3 : 5;
                const dOut = next ? (next.frame - kf.frame) / 3 : 5;
                kf.timingHandle = {
                    inX: kf.frame - dIn, inY: kf.value,
                    outX: kf.frame + dOut, outY: kf.value
                };
            });
            ch.keyframes = kfs;
            this.bezierCache.delete(id);
        });

        this.refreshFCurveChannels('camX');
        this.render();
        console.log('[2D] Camera baked into F-curve channels (camX/camY/camZoom/camRot)');
    }

    // ==================== F-CURVE UI ====================

    refreshFCurveChannels(selectId) {
        if (!this.fcurveEditor) return;
        this.fcurveEditor.loadChannels(this.keyframeChannels, selectId);

        const sel = document.getElementById('fcurve-channel');
        if (!sel) return;
        sel.innerHTML = '';
        if (!this.keyframeChannels.size) {
            const opt = document.createElement('option');
            opt.value = '';
            opt.textContent = '— no channels —';
            sel.appendChild(opt);
            return;
        }
        this.keyframeChannels.forEach((ch, id) => {
            const opt = document.createElement('option');
            opt.value = id;
            opt.textContent = `${ch.name} (${ch.keyframes.length})`;
            if (id === selectId) opt.selected = true;
            sel.appendChild(opt);
        });

        const easeSel = document.getElementById('fcurve-easing');
        const cur = this.fcurveEditor.currentChannel;
        if (easeSel && cur) easeSel.value = cur.easingType || 'easeInOutQuad';
    }

    bindFCurveControls() {
        const canvas = document.getElementById('fcurve-canvas');
        if (!canvas || this.fcurveEditor) return;

        const editor = new window.AdvancedKeyframeEditor(canvas);
        editor.isActive = true;
        editor.onEdit = () => {
            this._applyCameraChannels();
            this.render();
        };
        editor.onScrub = (frame) => {
            const st = this.getTimelineState();
            window.currentTime = frame / st.fps;
            this.onTimeUpdate();
        };
        this.fcurveEditor = editor;

        document.getElementById('fcurve-channel')?.addEventListener('change', (e) => {
            const id = e.target.value;
            const ch = this.keyframeChannels.get(id) || null;
            editor.currentChannel = ch;
            editor.selectedKeyframes = [];
            editor.fitView();
            editor.render();
            const easeSel = document.getElementById('fcurve-easing');
            if (easeSel && ch) easeSel.value = ch.easingType || 'easeInOutQuad';
        });

        document.getElementById('fcurve-easing')?.addEventListener('change', (e) => {
            editor.setEasing(e.target.value);
            this._applyCameraChannels();
            this.render();
        });

        document.getElementById('fcurve-add-key')?.addEventListener('click', () => editor.addKeyframeAtPlayhead());
        document.getElementById('fcurve-del-key')?.addEventListener('click', () => editor.deleteSelectedKeyframes());
        document.getElementById('fcurve-bake-cam')?.addEventListener('click', () => this.bakeCameraChannels());
        document.getElementById('fcurve-new-channel')?.addEventListener('click', () => {
            const name = prompt('Channel name:', 'My Channel');
            if (!name) return;
            const id = 'ch_' + Date.now();
            const colors = ['#00ff88', '#4a9eff', '#ff6b6b', '#ffd166', '#a29bfe', '#ff9f43'];
            this.createKeyframeChannel(id, name, 'easeInOutQuad', colors[this.keyframeChannels.size % colors.length]);
            this.refreshFCurveChannels(id);
        });

        // Keep the graph playhead + curves in sync with the manager's render loop
        const origRender = this.render.bind(this);
        this.render = () => {
            origRender();
            if (this.fcurveEditor && this.fcurveEditor.isActive) {
                this.fcurveEditor.render();
            }
        };

        this.refreshFCurveChannels();
    }

    // ==================== AUDIO & LIP SYNC ====================

    _getAudioCtx() {
        if (!this.audioState.ctx) {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return null;
            this.audioState.ctx = new AC();
        }
        if (this.audioState.ctx.state === 'suspended') {
            this.audioState.ctx.resume().catch(() => { });
        }
        return this.audioState.ctx;
    }

    _stopAudioSource() {
        const a = this.audioState;
        if (a.source) {
            try { a.source.stop(); } catch (e) { /* already stopped */ }
            try { a.source.disconnect(); } catch (e) { /* ignore */ }
            a.source = null;
        }
        if (a.gain) {
            try { a.gain.disconnect(); } catch (e) { /* ignore */ }
            a.gain = null;
        }
    }

    async importAudioFile(file) {
        const a = this.audioState;
        const ctx = this._getAudioCtx();
        if (!ctx) { alert('Web Audio API not supported in this browser.'); return; }

        const arrayBuf = await file.arrayBuffer();
        a.buffer = await ctx.decodeAudioData(arrayBuf);

        this._computeMouthTrack();
        this.drawWaveform();
        this._setAudioStatus('Audio: ' + file.name);
        console.log('[2D] Audio loaded:', file.name, 'duration', a.buffer.duration.toFixed(2) + 's');
    }

    /** Amplitude analysis per animation frame -> mouth openness levels (0..3) */
    _computeMouthTrack() {
        const a = this.audioState;
        const state = this.getTimelineState();
        const fps = state.fps;
        const data = a.buffer.getChannelData(0);
        const totalFrames = Math.ceil(a.buffer.duration * fps) + 1;

        a.mouthLevels = [];
        a.mouthLabels = [];

        for (let f = 0; f < totalFrames; f++) {
            const t0 = f / fps;
            const t1 = (f + 1) / fps;
            const s0 = Math.floor(t0 * a.buffer.sampleRate);
            const s1 = Math.min(data.length, Math.floor(t1 * a.buffer.sampleRate));
            let peak = 0;
            for (let s = s0; s < s1; s++) {
                const v = Math.abs(data[s]);
                if (v > peak) peak = v;
            }
            a.mouthLevels.push(peak);
        }

        // Smooth + classify (median of 3 to kill flicker)
        const levels = a.mouthLevels.map((p, i) => {
            const prev = a.mouthLevels[i - 1] ?? p;
            const next = a.mouthLevels[i + 1] ?? p;
            const arr = [prev, p, next].sort((x, y) => x - y);
            return arr[1];
        });

        const shape = (lvl) => lvl < 0.06 ? 'm' : lvl < 0.18 ? 'i/u' : lvl < 0.38 ? 'e' : 'a/o';
        a.mouthLabels = levels.map((p) => {
            if (p < 0.06) return { level: 0, label: 'm' };
            if (p < 0.18) return { level: 1, label: 'i/u' };
            if (p < 0.38) return { level: 2, label: 'e' };
            return { level: 3, label: 'a/o' };
        });
    }

    /** Current mouth openness (0..1) at the timeline playhead — for rigging */
    get mouthOpen() {
        const a = this.audioState;
        if (!a.buffer || !a.mouthLevels.length) return 0;
        const state = this.getTimelineState();
        const frame = Math.round(state.currentTime * state.fps);
        const peak = a.mouthLevels[frame] ?? 0;
        return Math.min(1, peak * 4);
    }

    _drawAudioWaveform() {
        const canvas = document.getElementById('aud2d-wave');
        if (!canvas || !this.audioState.buffer) return;
        const a = this.audioState;
        const ctx = canvas.getContext('2d');
        const W = canvas.width;
        const H = canvas.height;
        const state = this.getTimelineState();
        const fps = state.fps;

        ctx.clearRect(0, 0, W, H);

        // Background
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(0, 0, W, H);

        // Frame gridlines
        ctx.strokeStyle = 'rgba(120,180,255,0.12)';
        ctx.lineWidth = 1;
        const frameW = W / (a.buffer.duration * fps);
        for (let f = 1; f < a.buffer.duration * fps; f++) {
            const x = Math.round(f * frameW) + 0.5;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, H);
            ctx.stroke();
        }

        // Waveform
        const data = a.buffer.getChannelData(0);
        const step = Math.max(1, Math.floor(data.length / W));
        ctx.strokeStyle = '#8fd0ff';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = 0; x < W; x++) {
            let min = 1, max = -1;
            const s0 = x * step;
            const s1 = Math.min(data.length, s0 + step);
            for (let s = s0; s < s1; s++) {
                const v = data[s];
                if (v < min) min = v;
                if (v > max) max = v;
            }
            const y0 = H / 2 + min * (H / 2 - 8);
            const y1 = H / 2 + max * (H / 2 - 8);
            ctx.moveTo(x + 0.5, y0);
            ctx.lineTo(x + 0.5, y1);
        }
        ctx.stroke();

        // Mouth-shape markers strip (bottom)
        const mouthOn = document.getElementById('aud2d-mouth-toggle')?.checked !== false;
        if (mouthOn && a.mouthLabels.length) {
            const stripY = H - 8;
            const colors = ['#7a7a7a', '#ffd166', '#ff9f43', '#ff6b6b'];
            a.mouthLabels.forEach((ms, f) => {
                if (ms.level === 0) return;
                const x = f * frameW;
                ctx.fillStyle = colors[ms.level];
                ctx.fillRect(x, stripY, Math.max(1, frameW), 6);
            });
        }

        // Playhead
        const px = Math.round(state.currentTime / a.buffer.duration * W);
        ctx.strokeStyle = '#ff6b35';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(px + 0.5, 0);
        ctx.lineTo(px + 0.5, H);
        ctx.stroke();
    }

    _setAudioStatus(text) {
        const el = document.getElementById('aud2d-shape-label');
        if (el) el.textContent = text || 'Mouth: —';
    }

    /** Keep audio in sync with the timeline playhead; run from render() */
    audioSyncCheck() {
        const a = this.audioState;
        if (!a.buffer) return;

        // External pause (play/pause button pressed elsewhere)
        if (a.playing && !window.isPlaying) {
            a.pausedOffset = Math.min(a.buffer.duration, Math.max(0, window.currentTime));
            this._stopAudioSource();
            a.playing = false;
            this._setAudioStatus('Audio paused');
            return;
        }

        if (!a.playing) return;

        const expected = a.startOffset + (a.ctx.currentTime - a.startCtxTime);
        const drift = window.currentTime - expected;

        // User scrubbed / jumped: re-sync
        if (Math.abs(drift) > 0.2) {
            if (window.currentTime >= a.buffer.duration) {
                this.stopAudio();
                return;
            }
            this._restartAudioSource(Math.max(0, window.currentTime));
        }

        a.lastPlayhead = window.currentTime;
    }

    _restartAudioSource(offset) {
        const a = this.audioState;
        const ctx = a.ctx;
        this._stopAudioSource();
        a.gain = ctx.createGain();
        a.gain.gain.value = 0.9;
        a.gain.connect(ctx.destination);
        a.source = ctx.createBufferSource();
        a.source.buffer = a.buffer;
        a.source.connect(a.gain);
        a.startOffset = offset;
        a.startCtxTime = ctx.currentTime;
        a.source.start(0, Math.max(0, Math.min(a.buffer.duration - 0.02, offset)));
    }

    playAudio() {
        const a = this.audioState;
        if (!a.buffer) { alert('Import an audio file first.'); return; }
        const ctx = this._getAudioCtx();
        if (!ctx) return;

        if (a.playing) return;

        const offset = a.pausedOffset > 0
            ? a.pausedOffset
            : Math.max(0, Math.min(a.buffer.duration - 0.02, window.currentTime));
        a.pausedOffset = 0;

        this._restartAudioSource(offset);
        a.playing = true;
        window.isPlaying = true;
        this._setAudioStatus('Audio playing');
        console.log('[2D] Audio playing from', offset.toFixed(2) + 's');
    }

    stopAudio() {
        const a = this.audioState;
        this._stopAudioSource();
        a.playing = false;
        a.pausedOffset = 0;
        if (window.isPlaying) window.isPlaying = false;
        this._setAudioStatus('Audio stopped');
    }

    exportMouthTrack() {
        const a = this.audioState;
        if (!a.buffer || !a.mouthLabels.length) { alert('Import audio first.'); return; }
        const state = this.getTimelineState();
        const frames = {};
        a.mouthLabels.forEach((ms, f) => { frames[f] = ms.label; });
        const json = JSON.stringify({ fps: state.fps, duration: a.buffer.duration, frames }, null, 2);
        this._downloadBlob(new Blob([json], { type: 'application/json' }), `mouth-track-${Date.now()}.json`);
    }

    bindAudioControls() {
        document.getElementById('aud2d-play')?.addEventListener('click', () => this.playAudio());
        document.getElementById('aud2d-stop')?.addEventListener('click', () => this.stopAudio());
        document.getElementById('aud2d-export-mouth')?.addEventListener('click', () => this.exportMouthTrack());
        document.getElementById('aud2d-mouth-toggle')?.addEventListener('change', () => this._drawAudioWaveform());

        const importBtn = document.getElementById('aud2d-import');
        if (importBtn) {
            importBtn.addEventListener('click', () => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = 'audio/*';
                input.onchange = (e) => {
                    const file = e.target.files && e.target.files[0];
                    if (file) this.importAudioFile(file);
                };
                input.click();
            });
        }

        // Resize waveform canvas to fit the panel
        const canvas = document.getElementById('aud2d-wave');
        if (canvas) {
            const resizeWave = () => {
                const rect = canvas.parentElement.getBoundingClientRect();
                if (rect.width > 50) canvas.width = Math.floor(rect.width);
            };
            resizeWave();
            setTimeout(resizeWave, 300);
            window.addEventListener('resize', resizeWave);
        }
    }

    // ==================== EXPORT CONTROLS ====================

    bindExportControls() {
        const progressRow = document.getElementById('exp2d-progress-row');
        const progressBar = document.getElementById('exp2d-progress-bar');
        const progressVal = document.getElementById('exp2d-progress-val');

        const showProgress = (enabled) => {
            if (progressRow) progressRow.style.display = enabled ? 'flex' : 'none';
        };
        const setProgress = (frac) => {
            const pct = Math.round(frac * 100);
            if (progressBar) progressBar.style.width = pct + '%';
            if (progressVal) progressVal.textContent = pct + '%';
        };

        const getOptions = () => ({
            scale: parseFloat(document.getElementById('exp2d-res')?.value || '1') || 1,
            fps: parseInt(document.getElementById('exp2d-fps')?.value || '24', 10) || 24,
            background: document.getElementById('exp2d-bg')?.value || '#ffffff',
            durationMode: document.getElementById('exp2d-dur')?.value || 'lastKey'
        });

        document.getElementById('exp2d-video')?.addEventListener('click', async () => {
            const btn = document.getElementById('exp2d-video');
            if (btn) btn.disabled = true;
            showProgress(true);
            setProgress(0);
            try {
                await this.exportVideo2D({ ...getOptions(), onProgress: setProgress });
            } catch (err) {
                console.error('[2D] Video export failed:', err);
                alert('Video export failed: ' + err.message);
            } finally {
                if (btn) btn.disabled = false;
                setTimeout(() => showProgress(false), 800);
            }
        });

        document.getElementById('exp2d-pngseq')?.addEventListener('click', async () => {
            const btn = document.getElementById('exp2d-pngseq');
            if (btn) btn.disabled = true;
            showProgress(true);
            setProgress(0);
            try {
                await this.exportPNGSequence2D({ ...getOptions(), onProgress: setProgress });
            } catch (err) {
                console.error('[2D] PNG sequence export failed:', err);
                alert('PNG sequence export failed: ' + err.message);
            } finally {
                if (btn) btn.disabled = false;
                setTimeout(() => showProgress(false), 800);
            }
        });

        document.getElementById('exp2d-frame')?.addEventListener('click', () => this.exportCurrentFramePNG());
    }

    setupKeyframeGraph() {
        // Keyframe graph is rendered inline in inspector — no floating DOM injection needed
    }

    // ==================== 2D CAMERA INSPECTOR ====================

    syncCameraInspector() {
        if (!this.isActive) return;
        const shown = this._currentCameraState();
        const sync = (id, val, isRad) => {
            const el = document.getElementById(id);
            if (!el || document.activeElement === el) return;
            el.value = isRad
                ? String(Math.round((val * 180 / Math.PI) * 10) / 10)
                : String(Math.round(val * 100) / 100);
        };
        sync('cam2d-x', shown.x);
        sync('cam2d-y', shown.y);
        sync('cam2d-zoom', shown.zoom);
        sync('cam2d-rotation', shown.rotation, true);

        const countEl = document.getElementById('cam2d-key-count');
        if (countEl) countEl.textContent = this.cameraKeyframes.size;
    }

    bindCameraInspectorControls() {
        const camInputs = [
            ['cam2d-x', 'x', false],
            ['cam2d-y', 'y', false],
            ['cam2d-zoom', 'zoom', false],
            ['cam2d-rotation', 'rotation', true]
        ];
        camInputs.forEach(([id, prop, isRad]) => {
            const el = document.getElementById(id);
            if (!el) return;
            el.addEventListener('input', () => {
                const v = parseFloat(el.value);
                if (!Number.isFinite(v)) return;
                if (isRad) this.camera2D.rotation = v * Math.PI / 180;
                else if (prop === 'zoom') this.camera2D.zoom = Math.max(0.05, v);
                else this.camera2D[prop] = v;
                this._syncViewFromCamera?.();
                this.render();
            });
        });

        document.getElementById('cam2d-add-key')?.addEventListener('click', () => this.insertCameraKeyframe());
        document.getElementById('cam2d-del-key')?.addEventListener('click', () => this.deleteCameraKeyframeAtCurrent());
        document.getElementById('cam2d-clear')?.addEventListener('click', () => this.clearCameraKeyframes());
        document.getElementById('cam2d-path-toggle')?.addEventListener('change', (e) => {
            this.cameraTrackVisible = e.target.checked;
            this.render();
        });
    }

    // ==================== IMPORT/EXPORT ====================

    exportKeyframeData() {
        const data = {
            version: '2.0',
            timestamp: Date.now(),
            channels: Array.from(this.keyframeChannels.entries()).map(([id, ch]) => ({
                id: ch.id,
                name: ch.name,
                easing: ch.easingType,
                keyframes: ch.keyframes
            })),
            keyframes: Array.from(this.keyframes.entries()).map(([frame, strokes]) => ({
                frame,
                strokes
            }))
        };

        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `2d-animation-keyframes-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);

        console.log('✅ Keyframe data exported');
    }

    importKeyframeData() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e) => {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.onload = (evt) => {
                try {
                    const data = JSON.parse(evt.target.result);

                    // Import channels
                    (data.channels || []).forEach(ch => {
                        this.createKeyframeChannel(ch.id, ch.name, ch.easing);
                        const channel = this.keyframeChannels.get(ch.id);
                        if (channel) channel.keyframes = ch.keyframes;
                    });

                    // Import keyframes
                    (data.keyframes || []).forEach(({ frame, strokes }) => {
                        this.keyframes.set(frame, strokes);
                    });

                    this.render();
                    console.log('✅ Keyframe data imported');
                } catch (err) {
                    console.error('Failed to import keyframe data:', err);
                }
            };
            reader.readAsText(file);
        };
        input.click();
    }

    // ==================== ENHANCED RENDER ====================

    render() {
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.update3DUnderlay();

        if (!this.isActive) return;

        // Drive the view from the 2D camera when in camera mode, keyframed, or channel-driven
        this._applyCameraChannels();
        if (this.currentTool === 'camera' || this.cameraKeyframes.size || this._hasCameraChannels()) {
            this._syncViewFromCamera(this._currentCameraState());
        }
        this.syncCameraInspector();
        this.audioSyncCheck();
        if (this.audioState.buffer) {
            this._drawAudioWaveform();
        }

        this.ctx.save();
        this._applyViewTransform(this.ctx);

        // Render lighting shadows
        this.updateLighting(this.ctx);

        // Reference image
        this.drawReferenceImage(this.ctx);

        // Onion skinning (color-coded, alpha falloff)
        this.renderOnionSkinning(this.ctx);

        // Current strokes - preserve layer visibility, opacity, and blend ordering.
        this.renderStrokeCollection(this.strokes, this.ctx);
        this.renderSelectionOverlay(this.ctx);

        // 2D camera framing overlay (keyframed rects + path)
        this.drawCameraOverlay(this.ctx);

        this.ctx.restore();

        // Apply post-processing (only when not drawing to avoid performance hit)
        if (!this.isDrawing) {
            this.applyColorGrading(this.ctx);
            this.applyBloom(this.ctx);
        }
    }
}

// Initialize advanced manager
window.animation2DManagerAdvanced = new Animation2DManagerAdvanced();

// Override global instance if advanced is enabled
const useAdvanced = true;
if (useAdvanced) {
    window.animation2DManager = window.animation2DManagerAdvanced;
}
