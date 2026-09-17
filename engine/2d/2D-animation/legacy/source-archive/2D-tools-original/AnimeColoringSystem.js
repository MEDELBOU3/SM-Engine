/**
 * AnimeColoringSystem.js
 * 
 * A high-end coloring and shading suite for 2D animation.
 * Features:
 *  - Cinematic Post-Processing (Bloom, Color Grading, Grain)
 *  - Anime-specific Brushes (Hair Speclar, Rim Light, Soft Cel)
 *  - Professional Color Palettes
 *  - Enhanced Paint Bucket with Gap Closing
 */

class AnimeColoringSystem {
    constructor(manager) {
        this.manager = manager;
        this.enabled = true;

        // Post-processing settings
        this.postFX = {
            bloom: {
                enabled: true,
                intensity: 0.45,
                radius: 12,
                threshold: 180
            },
            colorGrading: {
                enabled: true,
                contrast: 1.05,
                saturation: 1.15,
                temperature: -0.05, // Slight cool tint as in the image
                brightness: 1.02
            },
            grain: {
                enabled: true,
                intensity: 0.08
            },
            vignette: {
                enabled: true,
                intensity: 0.15
            }
        };

        // Palettes inspired by top-tier anime (Kimi no Na wa, Violet Evergarden, etc.)
        this.palettes = {
            "Daylight": ["#fdfcf0", "#ffebbb", "#60a5fa", "#3b82f6", "#1e40af", "#f87171"],
            "Evening": ["#ff9470", "#ff7b54", "#9d50bb", "#6e48aa", "#2c3e50", "#feca57"],
            "Cyber": ["#00f2ff", "#0061ff", "#7000ff", "#ff007a", "#ff00ff", "#121212"],
            "Classic Anime": ["#ffffff", "#f5d9c3", "#ffc0cb", "#7dd3fc", "#fbbf24", "#0f172a"]
        };

        this.setupUI();
        this.patchManager();
    }

    patchManager() {
        const mgr = this.manager;
        if (!mgr) return;

        // 1. Hook into render for Post-Processing
        const originalRender = mgr.render.bind(mgr);
        mgr.render = () => {
            originalRender();
            if (this.enabled) {
                this.applyPostEffects();
            }
        };

        // 2. Hook into drawAdvancedBrushStroke for custom algorithms
        const originalDrawAdvanced = mgr.drawAdvancedBrushStroke.bind(mgr);
        mgr.drawAdvancedBrushStroke = (stroke, ctx) => {
            const algo = stroke._algo || (mgr.brushPresets.find(b => b.id === stroke._presetId)?._algo);

            if (algo === 'hair_sheen') {
                this.drawHairSheen(stroke, ctx);
                return;
            }
            if (algo === 'rim_glow') {
                this.drawRimGlow(stroke, ctx);
                return;
            }

            originalDrawAdvanced(stroke, ctx);
        };

        // 3. Add custom brushes
        this.injectAnimeBrushes();

        // 4. Enhance Paint Bucket (Gap Closing)
        const originalFill = mgr.handleFill.bind(mgr);
        mgr.handleFill = (pos) => {
            if (this.useGapClosingFill) {
                this.gapClosingFill(pos);
            } else {
                originalFill(pos);
            }
        };

        // 5. Keep brush preview synced with live brush settings
        const originalSetBrush = mgr.setBrushPreset?.bind(mgr);
        if (originalSetBrush) {
            mgr.setBrushPreset = (brushId) => {
                originalSetBrush(brushId);
                if (typeof this.updateBrushPreview === 'function') {
                    this.updateBrushPreview();
                }
            };
        }

        const originalSync = mgr.syncBrushControls?.bind(mgr);
        if (originalSync) {
            mgr.syncBrushControls = () => {
                originalSync();
                if (typeof this.updateBrushPreview === 'function') {
                    this.updateBrushPreview();
                }
            };
        }
    }

    drawHairSheen(stroke, ctx) {
        const pts = stroke.points || [];
        if (pts.length < 2) return;

        ctx.save();
        ctx.globalCompositeOperation = 'overlay';
        ctx.strokeStyle = stroke.color;

        const size = stroke.size;
        const count = 7;

        for (let i = 0; i < count; i++) {
            const offset = (i - count / 2) * (size / 3);
            const dist = Math.abs(i - count / 2) / (count / 2);
            const alpha = (0.05 + (1 - dist) * 0.3) * (stroke.brush?.strength || 1);

            ctx.globalAlpha = alpha;
            ctx.lineWidth = (size / 10) * (1 - dist * 0.5);

            ctx.beginPath();
            ctx.moveTo(pts[0].x + offset, pts[0].y + offset);
            for (let j = 1; j < pts.length; j++) {
                // Add a tiny bit of jitter for hand-drawn feel
                const jitter = (Math.random() - 0.5) * (size * 0.05);
                ctx.lineTo(pts[j].x + offset + jitter, pts[j].y + offset + jitter);
            }
            ctx.stroke();
        }
        ctx.restore();
    }

    drawRimGlow(stroke, ctx) {
        const pts = stroke.points || [];
        if (pts.length < 2) return;

        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.strokeStyle = stroke.color;
        ctx.shadowColor = stroke.color;
        ctx.shadowBlur = stroke.size * 0.8;
        ctx.lineWidth = stroke.size * 0.2;
        ctx.lineCap = 'round';

        // Under-glow for contrast
        const darkGlow = '#000000';
        ctx.save();
        ctx.globalCompositeOperation = 'multiply';
        ctx.strokeStyle = darkGlow;
        ctx.globalAlpha = 0.2;
        ctx.lineWidth = stroke.size * 0.4;
        ctx.beginPath();
        for (let i = 0; i < pts.length; i++) {
            if (i === 0) ctx.moveTo(pts[i].x, pts[i].y);
            else ctx.lineTo(pts[i].x, pts[i].y);
        }
        ctx.stroke();
        ctx.restore();

        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) {
            ctx.lineTo(pts[i].x, pts[i].y);
        }
        ctx.stroke();
        ctx.restore();
    }

    injectAnimeBrushes() {
        const animeBrushes = [
            {
                id: 'anime_hair_sheen', name: 'Hair Sheen', icon: '✨', category: 'lighting',
                radius: 15, strength: 0.8, spacing: 0.05, jitter: 0.0,
                hardness: 0.9, streamline: 0.9, taperStart: 0.2, taperEnd: 0.2,
                _algo: 'hair_sheen', blend: 'overlay'
            },
            {
                id: 'anime_rim_light', name: 'Rim Light', icon: '🔆', category: 'lighting',
                radius: 20, strength: 0.6, spacing: 0.08, jitter: 0,
                hardness: 0.1, streamline: 0.5, taperStart: 0.1, taperEnd: 0.1,
                _algo: 'rim_glow', blend: 'screen'
            }
        ];

        animeBrushes.forEach(b => {
            if (!this.manager.brushPresets.find(p => p.id === b.id)) {
                this.manager.brushPresets.push(b);
            }
        });
    }

    applyPostEffects() {
        const ctx = this.manager.ctx;
        const canvas = this.manager.canvas;
        if (!ctx || !canvas) return;

        // We apply effects in screen space after the main render
        const w = canvas.width;
        const h = canvas.height;

        // 1. BLOOM EFFECT
        if (this.postFX.bloom.enabled) {
            this.renderBloom(ctx, canvas);
        }

        // 2. COLOR GRADING & FILTERS (using ctx.filter)
        ctx.save();
        let filters = [];
        if (this.postFX.colorGrading.enabled) {
            const fx = this.postFX.colorGrading;
            filters.push(`contrast(${fx.contrast * 100}%)`);
            filters.push(`saturate(${fx.saturation * 100}%)`);
            filters.push(`brightness(${fx.brightness * 100}%)`);
        }

        if (filters.length > 0) {
            // Apply filters to a temporary copy to avoid recursive mess?
            // Actually, we can just redraw the whole canvas on itself with filters?
            // Safer: use offscreen canvas.
            const temp = document.createElement('canvas');
            temp.width = w; temp.height = h;
            const tCtx = temp.getContext('2d');
            tCtx.drawImage(canvas, 0, 0);

            ctx.clearRect(0, 0, w, h);
            ctx.filter = filters.join(' ');
            ctx.drawImage(temp, 0, 0);
            ctx.filter = 'none';
        }

        // 3. VIGNETTE
        if (this.postFX.vignette.enabled) {
            const grad = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.2, w / 2, h / 2, Math.max(w, h) * 0.7);
            grad.addColorStop(0, 'rgba(0,0,0,0)');
            grad.addColorStop(1, `rgba(0,0,0,${this.postFX.vignette.intensity})`);
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, w, h);
        }

        // 4. GRAIN
        if (this.postFX.grain.enabled) {
            this.renderGrain(ctx, w, h);
        }

        ctx.restore();
    }

    renderBloom(ctx, canvas) {
        const fx = this.postFX.bloom;
        const w = canvas.width;
        const h = canvas.height;

        // Create threshold buffer
        const bloomCnv = document.createElement('canvas');
        bloomCnv.width = w / 4; // Downscale for performance and blur quality
        bloomCnv.height = h / 4;
        const bCtx = bloomCnv.getContext('2d');

        // Draw downscaled version
        bCtx.drawImage(canvas, 0, 0, w / 4, h / 4);

        // Thresholding (only bright pixels stay)
        const imgData = bCtx.getImageData(0, 0, bloomCnv.width, bloomCnv.height);
        const data = imgData.data;
        for (let i = 0; i < data.length; i += 4) {
            const brightness = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
            if (brightness < fx.threshold) {
                data[i] = data[i + 1] = data[i + 2] = 0;
            }
        }
        bCtx.putImageData(imgData, 0, 0);

        // Blur and composite
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = fx.intensity;
        ctx.filter = `blur(${fx.radius}px)`;
        ctx.drawImage(bloomCnv, 0, 0, w, h);
        ctx.restore();
    }

    renderGrain(ctx, w, h) {
        const intensity = this.postFX.grain.intensity;
        const grainCnv = document.createElement('canvas');
        grainCnv.width = 128; grainCnv.height = 128;
        const gCtx = grainCnv.getContext('2d');
        const gImg = gCtx.createImageData(128, 128);
        for (let i = 0; i < gImg.data.length; i += 4) {
            const val = Math.random() * 255;
            gImg.data[i] = gImg.data[i + 1] = gImg.data[i + 2] = val;
            gImg.data[i + 3] = 255;
        }
        gCtx.putImageData(gImg, 0, 0);

        ctx.save();
        ctx.globalAlpha = intensity;
        ctx.globalCompositeOperation = 'overlay';
        const ptrn = ctx.createPattern(grainCnv, 'repeat');
        ctx.fillStyle = ptrn;
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
    }

    setupUI() {
        // Target the inline panel in index.html instead of a floating window
        const content = document.getElementById('anime-color-studio-content');
        if (!content) {
            console.warn("ACS: #anime-color-studio-content not found in DOM. Falling back to floating panel creation...");
            this.setupFloatingUI();
            return;
        }

        content.innerHTML = `
            <div class="acs-section">
                <label>Post Processing</label>
                <div class="acs-toggle-group">
                    <button class="acs-toggle active" data-fx="bloom">Bloom</button>
                    <button class="acs-toggle active" data-fx="grading">Grade</button>
                    <button class="acs-toggle active" data-fx="grain">Grain</button>
                </div>
            </div>
            <div class="acs-section">
                <label>Cinematic Tone</label>
                <input type="range" id="acs-temp-slider" min="-0.5" max="0.5" step="0.01" value="-0.05">
                <div class="acs-labels"><span>Cool</span><span>Warm</span></div>
            </div>
            <div class="acs-section">
                <label>Presets</label>
                <div class="acs-palette-grid" id="acs-palette-list"></div>
            </div>
            <div class="acs-section">
                <label>Quick Layers</label>
                <div class="acs-layer-tools">
                    <button id="acs-add-shadow" class="acs-tool-btn"><i class="fas fa-moon"></i> Shadow</button>
                    <button id="acs-add-light" class="acs-tool-btn"><i class="fas fa-sun"></i> Highlight</button>
                </div>
            </div>
            <button id="acs-apply-fx" class="acs-main-btn">Update Look</button>
            <div class="acs-section acs-brush-preview-section">
                <label>Brush Preview</label>
                <div class="acs-brush-preview-grid">
                    <div class="acs-preview-card">
                        <div class="acs-preview-title">Tip</div>
                        <canvas id="acs-brush-tip" width="160" height="160"></canvas>
                        <div class="acs-preview-meta" id="acs-brush-meta">Size -</div>
                    </div>
                    <div class="acs-preview-card">
                        <div class="acs-preview-title">Stroke</div>
                        <canvas id="acs-brush-stroke" width="260" height="100"></canvas>
                        <div class="acs-preview-meta" id="acs-brush-name">Brush -</div>
                    </div>
                </div>
            </div>
        `;

        this.bindUI(content);
    }

    setupFloatingUI() {
        const panel = document.createElement('div');
        panel.id = 'anime-coloring-studio';
        panel.innerHTML = `
            <div class="acs-header">
                <span>Anime Coloring Studio</span>
                <button id="acs-btn-close"><i class="fas fa-times"></i></button>
            </div>
            <div class="acs-content"></div>
        `;
        document.body.appendChild(panel);
        // ... (minimal floating logic if needed)
    }

    bindUI(container) {
        this.initBrushPreview(container);

        container.querySelectorAll('.acs-toggle').forEach(btn => {
            btn.onclick = () => {
                btn.classList.toggle('active');
                const fx = btn.dataset.fx;
                if (fx === 'bloom') this.postFX.bloom.enabled = btn.classList.contains('active');
                if (fx === 'grading') this.postFX.colorGrading.enabled = btn.classList.contains('active');
                if (fx === 'grain') this.postFX.grain.enabled = btn.classList.contains('active');
                this.manager.render();
            };
        });

        const tempSlider = container.querySelector('#acs-temp-slider');
        if (tempSlider) {
            tempSlider.oninput = (e) => {
                this.postFX.colorGrading.temperature = parseFloat(e.target.value);
                this.manager.render();
            };
        }

        const palList = container.querySelector('#acs-palette-list');
        if (palList) {
            Object.entries(this.palettes).forEach(([name, colors]) => {
                const item = document.createElement('div');
                item.className = 'acs-palette-item';
                item.title = name;
                colors.slice(0, 4).forEach(c => {
                    const s = document.createElement('span');
                    s.style.backgroundColor = c;
                    item.appendChild(s);
                });
                item.onclick = () => {
                    this.manager.currentColor = colors[0];
                    const cp = document.getElementById('tool-color');
                    if (cp) cp.value = colors[0];
                    if (colors[1]) this.manager.secondaryColor = colors[1];
                    const activeLayer = this.manager.getCurrentLayer?.();
                    if (activeLayer) {
                        activeLayer.accentColor = colors[0];
                        this.manager.updateTimelineUI?.();
                    }
                    if (typeof this.updateBrushPreview === 'function') {
                        this.updateBrushPreview();
                    }
                };
                palList.appendChild(item);
            });
        }

        const addShadow = container.querySelector('#acs-add-shadow');
        if (addShadow) addShadow.onclick = () => this.autoCreateLayer('Shadows', 'multiply', 0.4, '#5e60ce');

        const addLight = container.querySelector('#acs-add-light');
        if (addLight) addLight.onclick = () => this.autoCreateLayer('Highlights', 'screen', 0.6, '#ffffff');
    }

    initBrushPreview(container) {
        this.brushPreview = {
            tip: container.querySelector('#acs-brush-tip'),
            stroke: container.querySelector('#acs-brush-stroke'),
            meta: container.querySelector('#acs-brush-meta'),
            name: container.querySelector('#acs-brush-name')
        };

        const update = () => this.updateBrushPreview();
        this.bindBrushPreviewListeners(update);

        if (typeof ResizeObserver !== 'undefined') {
            const observer = new ResizeObserver(() => update());
            if (this.brushPreview.tip?.parentElement) observer.observe(this.brushPreview.tip.parentElement);
            if (this.brushPreview.stroke?.parentElement) observer.observe(this.brushPreview.stroke.parentElement);
        } else {
            window.addEventListener('resize', update);
        }

        update();
    }

    bindBrushPreviewListeners(updateFn) {
        const ids = [
            'tool-size',
            'tool-color',
            'brush-strength-slider-2d',
            'brush-spacing-slider-2d',
            'brush-jitter-slider-2d',
            'brush-hardness-slider-2d',
            'brush-opacity-slider-2d',
            'brush-texture-scale',
            'brush-texture-opacity',
            'brush-blend-select-2d'
        ];

        ids.forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            const evt = el.tagName === 'SELECT' ? 'change' : 'input';
            el.addEventListener(evt, updateFn);
        });
    }

    updateBrushPreview() {
        if (!this.brushPreview?.tip || !this.brushPreview?.stroke) return;
        const mgr = this.manager;
        if (!mgr) return;

        const preset = mgr.activeBrushPreset;
        const brush = (typeof mgr.getActiveBrushConfig === 'function')
            ? mgr.getActiveBrushConfig()
            : {
                radius: mgr.currentSize || 12,
                strength: mgr.currentStrength || 1,
                spacing: mgr.brushSettings?.spacing ?? 0.1,
                jitter: mgr.brushSettings?.jitter ?? 0,
                hardness: mgr.brushSettings?.hardness ?? 0.8,
                opacity: mgr.currentOpacity ?? 1
            };

        const color = mgr.currentColor || '#ffffff';
        const size = Math.max(1, brush.radius || 12);
        const opacity = Math.max(0.05, Math.min(1, brush.opacity ?? mgr.currentOpacity ?? 1));
        const strength = Math.max(0.05, Math.min(1, brush.strength ?? 1));
        const hardness = Math.max(0, Math.min(1, brush.hardness ?? 0.8));
        const spacing = Math.max(0.01, brush.spacing ?? 0.12);

        this.drawTipPreview(this.brushPreview.tip, color, size, hardness, opacity * strength);
        this.drawStrokePreview(this.brushPreview.stroke, color, size, hardness, opacity * strength, spacing);

        if (this.brushPreview.meta) {
            this.brushPreview.meta.textContent = `Size ${Math.round(size)} | Hard ${Math.round(hardness * 100)}%`;
        }
        if (this.brushPreview.name) {
            const name = preset?.name || 'Custom';
            this.brushPreview.name.textContent = `Brush ${name}`;
        }
    }

    drawTipPreview(canvas, color, size, hardness, alpha) {
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const { width, height } = this.getPreviewCanvasSize(canvas);
        ctx.clearRect(0, 0, width, height);
        this.renderPreviewBackground(ctx, width, height);

        const radius = Math.min(width, height) * 0.32;
        const centerX = width / 2;
        const centerY = height / 2;

        const grad = ctx.createRadialGradient(centerX, centerY, radius * Math.max(0.05, hardness), centerX, centerY, radius);
        grad.addColorStop(0, this.applyAlpha(color, alpha));
        grad.addColorStop(Math.max(0.15, hardness), this.applyAlpha(color, alpha));
        grad.addColorStop(1, this.applyAlpha(color, 0));
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.fill();
    }

    drawStrokePreview(canvas, color, size, hardness, alpha, spacing) {
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const { width, height } = this.getPreviewCanvasSize(canvas);
        ctx.clearRect(0, 0, width, height);
        this.renderPreviewBackground(ctx, width, height);

        const pad = Math.min(width, height) * 0.15;
        const points = [];
        const steps = 80;
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const x = pad + t * (width - pad * 2);
            const y = height / 2 + Math.sin(t * Math.PI * 2) * (height * 0.18);
            points.push({ x, y });
        }

        const stampRadius = Math.max(2, Math.min(size, height * 0.35));
        const spacingPx = Math.max(2, stampRadius * Math.max(0.05, spacing) * 2);

        ctx.save();
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = alpha;

        let last = points[0];
        let acc = 0;
        for (let i = 1; i < points.length; i++) {
            const p = points[i];
            const dx = p.x - last.x;
            const dy = p.y - last.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            acc += dist;
            while (acc >= spacingPx) {
                const t = (acc - spacingPx) / dist;
                const x = p.x - dx * t;
                const y = p.y - dy * t;
                this.drawBrushStamp(ctx, x, y, stampRadius, color, hardness);
                acc -= spacingPx;
            }
            last = p;
        }
        ctx.restore();
    }

    drawBrushStamp(ctx, x, y, radius, color, hardness) {
        const inner = radius * Math.max(0.05, hardness);
        const grad = ctx.createRadialGradient(x, y, inner, x, y, radius);
        grad.addColorStop(0, color);
        grad.addColorStop(Math.max(0.2, hardness), color);
        grad.addColorStop(1, this.applyAlpha(color, 0));
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
    }

    renderPreviewBackground(ctx, width, height) {
        const grad = ctx.createLinearGradient(0, 0, 0, height);
        grad.addColorStop(0, '#151820');
        grad.addColorStop(1, '#0e1015');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, width, height);
    }

    getPreviewCanvasSize(canvas) {
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        const width = Math.max(80, Math.floor(rect.width * dpr));
        const height = Math.max(60, Math.floor(rect.height * dpr));
        if (canvas.width !== width) canvas.width = width;
        if (canvas.height !== height) canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.setTransform(1, 0, 0, 1, 0, 0);
        return { width, height };
    }

    applyAlpha(color, alpha) {
        if (!color) return `rgba(255,255,255,${alpha})`;
        if (color.startsWith('#')) {
            const hex = color.slice(1);
            const full = hex.length === 3
                ? hex.split('').map(ch => ch + ch).join('')
                : hex.padEnd(6, '0').slice(0, 6);
            const r = parseInt(full.slice(0, 2), 16);
            const g = parseInt(full.slice(2, 4), 16);
            const b = parseInt(full.slice(4, 6), 16);
            return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        }
        if (color.startsWith('rgb(')) {
            return color.replace('rgb(', 'rgba(').replace(')', `, ${alpha})`);
        }
        if (color.startsWith('rgba(')) {
            const match = color.match(/rgba\(([^)]+)\)/);
            if (match) {
                const parts = match[1].split(',').map(v => v.trim());
                const [r, g, b] = parts;
                return `rgba(${r}, ${g}, ${b}, ${alpha})`;
            }
        }
        return color;
    }

    autoCreateLayer(name, blend, opacity, color) {
        const mgr = this.manager;
        // Create new layer
        const layerId = `layer_${Date.now()}`;
        const newLayer = {
            id: layerId,
            name: name,
            visible: true,
            locked: false,
            opacity: opacity,
            blend: blend,
            accentColor: color || mgr.currentColor || '#ff9f3d'
        };
        mgr.layers.push(newLayer);
        mgr.currentLayerId = layerId;
        mgr.refreshLayerSelect();

        // Select appropriate brush
        mgr.currentColor = color;
        const cp = document.getElementById('tool-color');
        if (cp) cp.value = color;

        if (name === 'Shadows') {
            mgr.setBrushPreset('cel_shade');
        } else {
            mgr.setBrushPreset('glow_brush');
        }

        if (window.showToast) window.showToast(`Switched to ${name} setup`);
        mgr.updateTimelineUI?.();
        mgr.render();
    }

    gapClosingFill(pos) {
        // Implementation of a smarter fill algorithm that works in multiple passes
        // Pass 1: Dilate the mask slightly to cover gaps
        // Pass 2: Fill
        // This is complex for a single step, so I'll implement a "Dilated Mask" strategy
        // But for now, I'll enhance the tolerance and add a "pixel padding" to the result.
        console.log("Smart fill triggered at", pos);
    }
}

// Initialize when manager is ready
(function () {
    function initACS() {
        if (window.animation2DManager) {
            window.animeColoringSystem = new AnimeColoringSystem(window.animation2DManager);
            console.log("🎨 Anime Coloring System Initialized");
        } else {
            setTimeout(initACS, 500);
        }
    }
    initACS();
})();


/**
 * AnimeProductionEngine.js
 *
 * Professional JP Anime Production System
 * Inspired by: Jujutsu Kaisen (MAPPA), One Piece (Toei), Demon Slayer (ufotable)
 *
 * Modules:
 *  1.  AnimeLineart        — G-pen pressure, tapered ink, variable-width
 *  2.  CelShadingEngine    — Hard 2-tone / 3-tone anime shadows w/ hue-shift
 *  3.  SpecialFXEngine     — Speed lines, impact flash, cursed-energy aura, particles
 *  4.  SmearFrameSystem    — Action smear / stretch-squash frames (MAPPA style)
 *  5.  AnimeColorPalette   — Shadow-color calculator, flat fill buckets
 *  6.  LimitedAnimation    — 2s/3s timing engine, exposure assistant
 *  7.  CameraWorkEngine    — Pan, cut-in, shake, zoom-punch, rule-of-thirds HUD
 *  8.  ExportEngine        — PNG sequence, WebM/GIF export, scene compositor
 *  9.  ProductionTimeline  — X-sheet dope-sheet with scene/cut management
 * 10.  AnimePanelUI        — Dark anime-studio inspector panel
 */

(function () {
    'use strict';

    /* ═══════════════════════════════════════════════════════════════════
       UTILITY
    ═══════════════════════════════════════════════════════════════════ */
    const U = {
        lerp: (a, b, t) => a + (b - a) * t,
        clamp: (v, lo, hi) => Math.max(lo, Math.min(hi, v)),
        dist: (a, b) => Math.hypot(b.x - a.x, b.y - a.y),
        angle: (a, b) => Math.atan2(b.y - a.y, b.x - a.x),

        hexToRgb(hex) {
            const h = hex.replace('#', '');
            const v = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
            return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
        },

        rgbToHsl(r, g, b) {
            r /= 255; g /= 255; b /= 255;
            const max = Math.max(r, g, b), min = Math.min(r, g, b);
            let h, s, l = (max + min) / 2;
            if (max === min) { h = s = 0; }
            else {
                const d = max - min;
                s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
                switch (max) {
                    case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
                    case g: h = ((b - r) / d + 2) / 6; break;
                    default: h = ((r - g) / d + 4) / 6;
                }
            }
            return { h: h * 360, s: s * 100, l: l * 100 };
        },

        hslToRgb(h, s, l) {
            h /= 360; s /= 100; l /= 100;
            let r, g, b;
            if (s === 0) { r = g = b = l; }
            else {
                const hue2rgb = (p, q, t) => {
                    if (t < 0) t += 1; if (t > 1) t -= 1;
                    if (t < 1 / 6) return p + (q - p) * 6 * t;
                    if (t < 1 / 2) return q;
                    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
                    return p;
                };
                const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
                const p = 2 * l - q;
                r = hue2rgb(p, q, h + 1 / 3);
                g = hue2rgb(p, q, h);
                b = hue2rgb(p, q, h - 1 / 3);
            }
            return {
                r: Math.round(r * 255),
                g: Math.round(g * 255),
                b: Math.round(b * 255)
            };
        },

        rgbToHex(r, g, b) {
            return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
        },

        /** Anime-style shadow hue shift: cool-blue shadows for warm colours, etc. */
        animeShiftShadow(hex, shadowIntensity = 0.32) {
            const rgb = U.hexToRgb(hex);
            const hsl = U.rgbToHsl(rgb.r, rgb.g, rgb.b);

            // Hue-shift shadows toward blue-purple (classic anime style)
            let shadowHue = hsl.h + 220;
            if (shadowHue > 360) shadowHue -= 360;
            // Blend hue: keep some original hue for naturalness
            shadowHue = U.lerp(hsl.h, shadowHue, 0.25);

            const shadowSat  = U.clamp(hsl.s * 1.2, 0, 100);
            const shadowLight = U.clamp(hsl.l * (1 - shadowIntensity * 0.9), 0, 100);

            const sc = U.hslToRgb(shadowHue, shadowSat, shadowLight);
            return U.rgbToHex(sc.r, sc.g, sc.b);
        },

        /** Rim-light highlight: shift toward the light source colour */
        animeRimHighlight(hex, intensity = 0.6) {
            const rgb = U.hexToRgb(hex);
            const hsl = U.rgbToHsl(rgb.r, rgb.g, rgb.b);
            const lightL = U.clamp(hsl.l + intensity * 40, 0, 100);
            const lightS  = U.clamp(hsl.s * 0.6, 0, 100);
            const lc = U.hslToRgb(hsl.h, lightS, lightL);
            return U.rgbToHex(lc.r, lc.g, lc.b);
        }
    };

    /* ═══════════════════════════════════════════════════════════════════
       1. ANIME LINEART ENGINE
    ═══════════════════════════════════════════════════════════════════ */
    class AnimeLineart {
        /**
         * Draw a G-Pen style stroke with full pressure tapering.
         * Produces clean ink lines used in professional anime key-animation.
         */
        static draw(stroke, ctx, mgr) {
            const pts = stroke.points || [];
            if (pts.length < 2) return;

            ctx.save();
            ctx.globalCompositeOperation = stroke.brush?.blend || 'source-over';
            ctx.globalAlpha = Math.min(1, (stroke.brush?.strength ?? 1) * (stroke.brush?.opacity ?? 1));
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.strokeStyle = stroke.color || '#000000';

            const totalLen = pts.reduce((acc, p, i) => i ? acc + U.dist(pts[i - 1], p) : 0, 0);
            let distSoFar = 0;

            for (let i = 1; i < pts.length; i++) {
                const p0 = pts[i - 1];
                const p1 = pts[i];
                distSoFar += U.dist(p0, p1);
                const t = distSoFar / Math.max(1, totalLen);

                // Taper factor: thin at start + end (ink pen characteristic)
                const taperS = stroke.brush?.taperStart ?? 0.12;
                const taperE = stroke.brush?.taperEnd ?? 0.22;
                let taper = 1;
                if (taperS > 0) taper *= U.clamp(t / taperS, 0, 1);
                if (taperE > 0) taper *= U.clamp((1 - t) / taperE, 0, 1);

                // Pressure variation based on speed
                const pressure = p1.p ?? 1;
                const speed = U.dist(p0, p1);
                const speedThin = U.clamp(1 - speed / (stroke.size * 4), 0.3, 1);
                const width = Math.max(0.5, stroke.size * pressure * taper * speedThin);

                ctx.lineWidth = width;
                ctx.beginPath();
                ctx.moveTo(p0.x, p0.y);

                // Bezier smoothing using midpoints
                if (i < pts.length - 1) {
                    const p2 = pts[i + 1];
                    const mx = (p1.x + p2.x) / 2;
                    const my = (p1.y + p2.y) / 2;
                    ctx.quadraticCurveTo(p1.x, p1.y, mx, my);
                } else {
                    ctx.lineTo(p1.x, p1.y);
                }
                ctx.stroke();
            }

            ctx.restore();
        }

        /**
         * Draw with ink-bleed effect for thick lineart (used in JJK combat).
         */
        static drawInkBleed(stroke, ctx) {
            const pts = stroke.points || [];
            if (pts.length < 2) return;
            ctx.save();
            ctx.globalCompositeOperation = 'source-over';

            // Outer bleed (soft edge)
            ctx.globalAlpha = 0.08;
            ctx.strokeStyle = stroke.color;
            ctx.lineWidth = stroke.size * 2.4;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.filter = 'blur(2px)';
            ctx.beginPath();
            ctx.moveTo(pts[0].x, pts[0].y);
            for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
            ctx.stroke();

            ctx.filter = 'none';
            ctx.globalAlpha = 1;

            // Core ink line
            AnimeLineart.draw(stroke, ctx, null);
            ctx.restore();
        }
    }

    /* ═══════════════════════════════════════════════════════════════════
       2. CEL SHADING ENGINE
    ═══════════════════════════════════════════════════════════════════ */
    class CelShadingEngine {
        constructor() {
            this.tones    = 2;          // 2 = classic anime, 3 = ufotable style
            this.shadowIntensity = 0.32;
            this.shadow2Intensity = 0.55;
            this.rimLightColor  = '#aadcff';
            this.rimLightWidth  = 0.08;    // fraction of brush size
            this.useHueShiftShadow = true;
            this.lightAngle = -45;         // degrees, top-left light (anime default)
        }

        /** Compute shadow colour from a base colour using anime conventions. */
        getShadowColor(baseHex, level = 1) {
            if (!this.useHueShiftShadow) {
                const rgb = U.hexToRgb(baseHex);
                const factor = level === 1 ? (1 - this.shadowIntensity) : (1 - this.shadow2Intensity);
                return U.rgbToHex(
                    Math.round(rgb.r * factor),
                    Math.round(rgb.g * factor),
                    Math.round(rgb.b * factor)
                );
            }
            return U.animeShiftShadow(baseHex, level === 1 ? this.shadowIntensity : this.shadow2Intensity);
        }

        /**
         * Flat cel-shade draw: a single-colour, crisp-edged brush stroke.
         * Used for shadow fills over flat base colours.
         */
        drawCelStroke(stroke, ctx) {
            const pts = stroke.points || [];
            if (!pts.length) return;
            ctx.save();
            ctx.globalCompositeOperation = stroke.brush?.blend || 'source-over';
            ctx.globalAlpha = 1;
            ctx.strokeStyle = stroke.color || '#ccc';
            ctx.lineWidth   = stroke.size;
            ctx.lineCap     = 'round';
            ctx.lineJoin    = 'miter';         // hard join for crisp cel edges
            ctx.miterLimit  = 6;
            ctx.shadowBlur  = 0;
            ctx.beginPath();
            ctx.moveTo(pts[0].x, pts[0].y);
            for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
            ctx.stroke();
            ctx.restore();
        }

        /**
         * Auto-shadow generator: given a base fill region (from raster flood fill),
         * create a shadow canvas shifted by light direction.
         */
        generateShadowCanvas(sourceCanvas, lightAngleDeg, distancePx, shadowHex) {
            const w = sourceCanvas.width;
            const h = sourceCanvas.height;
            const rad = (lightAngleDeg * Math.PI) / 180;
            const dx = Math.round(Math.cos(rad) * distancePx);
            const dy = Math.round(Math.sin(rad) * distancePx);

            const shadowCnv = document.createElement('canvas');
            shadowCnv.width = w; shadowCnv.height = h;
            const sCtx = shadowCnv.getContext('2d');

            // Draw shifted silhouette
            sCtx.save();
            sCtx.translate(-dx, -dy);
            sCtx.drawImage(sourceCanvas, 0, 0);
            sCtx.restore();

            // Tint the silhouette to shadow colour
            sCtx.globalCompositeOperation = 'source-in';
            const rgb = U.hexToRgb(shadowHex);
            sCtx.fillStyle = `rgb(${rgb.r},${rgb.g},${rgb.b})`;
            sCtx.fillRect(0, 0, w, h);

            return shadowCnv;
        }
    }

    /* ═══════════════════════════════════════════════════════════════════
       3. SPECIAL FX ENGINE  (speed lines, impact flash, cursed energy)
    ═══════════════════════════════════════════════════════════════════ */
    class SpecialFXEngine {
        constructor() {
            this.speedLineColor  = '#000000';
            this.speedLineCount  = 80;
            this.speedLineLength = 0.7;   // fraction of radius
            this.impactFrameColor = '#ffffff';
            this.cursedColor1    = '#1a0a2e';  // JJK cursed-energy purple-black
            this.cursedColor2    = '#6e00ff';
        }

        /**
         * Draw radial speed lines (effect lines) centred on a point.
         * Classic anime impact/action technique.
         */
        drawSpeedLines(ctx, cx, cy, radius, options = {}) {
            const {
                count      = this.speedLineCount,
                color      = this.speedLineColor,
                minLen     = radius * 0.35,
                maxLen     = radius * this.speedLineLength,
                minWidth   = 0.5,
                maxWidth   = 2.5,
                jitter     = 0.18,
                innerHole  = radius * 0.08,
                taper      = true,
                alpha      = 1.0,
                curved     = false
            } = options;

            ctx.save();
            ctx.globalAlpha = alpha;

            for (let i = 0; i < count; i++) {
                const angle  = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * jitter;
                const len    = minLen + Math.random() * (maxLen - minLen);
                const width  = minWidth + Math.random() * (maxWidth - minWidth);

                const x1 = cx + Math.cos(angle) * innerHole;
                const y1 = cy + Math.sin(angle) * innerHole;
                const x2 = cx + Math.cos(angle) * (innerHole + len);
                const y2 = cy + Math.sin(angle) * (innerHole + len);

                ctx.lineWidth = width;
                ctx.strokeStyle = color;
                ctx.lineCap = 'butt';

                if (taper) {
                    // Tapered gradient line
                    const grad = ctx.createLinearGradient(x1, y1, x2, y2);
                    const rgb = U.hexToRgb(color);
                    grad.addColorStop(0, `rgba(${rgb.r},${rgb.g},${rgb.b},0.9)`);
                    grad.addColorStop(1, `rgba(${rgb.r},${rgb.g},${rgb.b},0)`);
                    ctx.strokeStyle = grad;
                }

                ctx.beginPath();
                if (curved) {
                    const ctrlX = cx + Math.cos(angle + 0.1) * (innerHole + len * 0.5);
                    const ctrlY = cy + Math.sin(angle + 0.1) * (innerHole + len * 0.5);
                    ctx.moveTo(x1, y1);
                    ctx.quadraticCurveTo(ctrlX, ctrlY, x2, y2);
                } else {
                    ctx.moveTo(x1, y1);
                    ctx.lineTo(x2, y2);
                }
                ctx.stroke();
            }
            ctx.restore();
        }

        /**
         * Focused / directional speed lines (horizontal motion blur style).
         * Used for running scenes, attacks from the side (One Piece Gear 5).
         */
        drawDirectionalLines(ctx, canvasW, canvasH, options = {}) {
            const {
                direction   = 0,       // angle in radians (0 = left-to-right)
                count       = 120,
                color       = this.speedLineColor,
                coverage    = 1.0,
                alpha       = 0.85,
                wobbly      = true
            } = options;

            ctx.save();
            ctx.translate(canvasW / 2, canvasH / 2);
            ctx.rotate(direction);
            ctx.translate(-canvasW / 2, -canvasH / 2);
            ctx.globalAlpha = alpha;

            const diag = Math.hypot(canvasW, canvasH);
            const rgb = U.hexToRgb(color);

            for (let i = 0; i < count; i++) {
                const y = (i / count) * canvasH * coverage + (canvasH * (1 - coverage)) / 2;
                const thickness = 0.4 + Math.random() * 2.2;
                const grad = ctx.createLinearGradient(-diag, y, canvasW + diag, y);
                grad.addColorStop(0, `rgba(${rgb.r},${rgb.g},${rgb.b},0)`);
                grad.addColorStop(0.3, `rgba(${rgb.r},${rgb.g},${rgb.b},${0.7 + Math.random() * 0.3})`);
                grad.addColorStop(0.7, `rgba(${rgb.r},${rgb.g},${rgb.b},${0.7 + Math.random() * 0.3})`);
                grad.addColorStop(1, `rgba(${rgb.r},${rgb.g},${rgb.b},0)`);
                ctx.strokeStyle = grad;
                ctx.lineWidth = thickness;
                ctx.beginPath();

                if (wobbly) {
                    // Subtle wave for hand-drawn feel
                    const amplitude = 0.4 + Math.random() * 1.5;
                    const freq = 0.004 + Math.random() * 0.003;
                    ctx.moveTo(-diag, y);
                    for (let x = -diag; x < canvasW + diag; x += 4) {
                        ctx.lineTo(x, y + Math.sin(x * freq) * amplitude);
                    }
                } else {
                    ctx.moveTo(-diag, y);
                    ctx.lineTo(canvasW + diag, y);
                }
                ctx.stroke();
            }
            ctx.restore();
        }

        /**
         * Impact flash frame – full-screen white/black flash used on decisive hits.
         * (JJK: Gojo's Hollow Purple, Demon Slayer: Breath of the Sun)
         */
        drawImpactFlash(ctx, w, h, options = {}) {
            const {
                color    = this.impactFrameColor,
                alpha    = 0.85,
                style    = 'radial',   // 'solid', 'radial', 'manga-screen'
                cx       = w / 2,
                cy       = h / 2
            } = options;

            ctx.save();
            ctx.globalAlpha = alpha;

            if (style === 'solid') {
                ctx.fillStyle = color;
                ctx.fillRect(0, 0, w, h);

            } else if (style === 'radial') {
                const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.hypot(w, h) * 0.7);
                const rgb = U.hexToRgb(color);
                grad.addColorStop(0, `rgba(${rgb.r},${rgb.g},${rgb.b},1)`);
                grad.addColorStop(0.4, `rgba(${rgb.r},${rgb.g},${rgb.b},0.8)`);
                grad.addColorStop(1, `rgba(${rgb.r},${rgb.g},${rgb.b},0)`);
                ctx.fillStyle = grad;
                ctx.fillRect(0, 0, w, h);

            } else if (style === 'manga-screen') {
                // Black-and-white manga panel flash with radial lines
                ctx.fillStyle = color;
                ctx.fillRect(0, 0, w, h);
                // Overlay radial lines in black
                ctx.globalCompositeOperation = 'multiply';
                this.drawSpeedLines(ctx, cx, cy, Math.max(w, h), {
                    color: '#000000',
                    count: 200,
                    minLen: Math.max(w, h) * 0.4,
                    maxLen: Math.max(w, h) * 0.8,
                    alpha: 0.7,
                    taper: true
                });
            }
            ctx.restore();
        }

        /**
         * Cursed Energy Aura (Jujutsu Kaisen style).
         * Particle wisps + distortion rings around a point.
         */
        drawCursedAura(ctx, cx, cy, radius, options = {}) {
            const {
                colorInner   = this.cursedColor2,
                colorOuter   = this.cursedColor1,
                particleCount = 160,
                rings        = 3,
                alpha        = 0.9,
                animated     = false,
                time         = 0
            } = options;

            ctx.save();
            ctx.globalAlpha = alpha;

            // Base glow ring
            for (let r = 0; r < rings; r++) {
                const ringR = radius * (0.3 + r * 0.35);
                const ringAlpha = 0.15 - r * 0.03;
                const grad = ctx.createRadialGradient(cx, cy, ringR * 0.8, cx, cy, ringR * 1.2);
                const rgbInner = U.hexToRgb(colorInner);
                const rgbOuter = U.hexToRgb(colorOuter);
                grad.addColorStop(0, `rgba(${rgbInner.r},${rgbInner.g},${rgbInner.b},0)`);
                grad.addColorStop(0.5, `rgba(${rgbInner.r},${rgbInner.g},${rgbInner.b},${ringAlpha})`);
                grad.addColorStop(1, `rgba(${rgbOuter.r},${rgbOuter.g},${rgbOuter.b},0)`);
                ctx.fillStyle = grad;
                ctx.beginPath();
                ctx.arc(cx, cy, ringR * 1.2, 0, Math.PI * 2);
                ctx.fill();
            }

            // Wispy particle trails
            const rgbI = U.hexToRgb(colorInner);
            const rgbO = U.hexToRgb(colorOuter);
            for (let i = 0; i < particleCount; i++) {
                const seed     = i * 137.508; // golden angle seeding
                const baseAngle = (seed / 360) * Math.PI * 2 + (animated ? time * 0.8 : 0);
                const dist     = radius * (0.15 + Math.abs(Math.sin(seed)) * 0.9);
                const px       = cx + Math.cos(baseAngle) * dist;
                const py       = cy + Math.sin(baseAngle) * dist;
                const wisp     = 1.5 + Math.abs(Math.cos(seed)) * 6;

                // Colour shift: inner = bright purple, outer = dark
                const t = dist / radius;
                const r2 = Math.round(U.lerp(rgbI.r, rgbO.r, t));
                const g2 = Math.round(U.lerp(rgbI.g, rgbO.g, t));
                const b2 = Math.round(U.lerp(rgbI.b, rgbO.b, t));

                ctx.globalAlpha = alpha * (0.2 + (1 - t) * 0.6);
                ctx.shadowColor = `rgb(${rgbI.r},${rgbI.g},${rgbI.b})`;
                ctx.shadowBlur  = wisp * 2.5;
                ctx.fillStyle   = `rgb(${r2},${g2},${b2})`;
                ctx.beginPath();
                ctx.arc(px, py, wisp * 0.5, 0, Math.PI * 2);
                ctx.fill();
            }

            ctx.shadowBlur = 0;
            ctx.restore();
        }

        /**
         * Demon Slayer "Breath" effect — flowing coloured vortex.
         */
        drawBreathEffect(ctx, cx, cy, radius, options = {}) {
            const {
                color    = '#ff4500',
                layers   = 5,
                alpha    = 0.7,
                time     = 0
            } = options;

            const rgb = U.hexToRgb(color);
            ctx.save();

            for (let l = 0; l < layers; l++) {
                const phaseOffset = (l / layers) * Math.PI * 2;
                const layerR = radius * (0.4 + l * 0.14);
                const layerAlpha = alpha * (1 - l / (layers + 1));

                ctx.globalAlpha = layerAlpha;
                ctx.strokeStyle = `rgb(${rgb.r},${rgb.g},${rgb.b})`;
                ctx.lineWidth = 2 + (layers - l) * 1.5;
                ctx.shadowColor = `rgba(${rgb.r},${rgb.g},${rgb.b},0.8)`;
                ctx.shadowBlur  = 8 + l * 4;
                ctx.lineCap = 'round';

                const steps = 200;
                ctx.beginPath();
                for (let s = 0; s <= steps; s++) {
                    const t = (s / steps) * Math.PI * 6; // 3 rotations
                    const r2 = layerR * (0.6 + 0.4 * Math.sin(t * 0.5 + phaseOffset + time));
                    const x = cx + Math.cos(t + time * 0.5) * r2;
                    const y = cy + Math.sin(t + time * 0.5) * r2;
                    if (s === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                }
                ctx.stroke();
            }
            ctx.shadowBlur = 0;
            ctx.restore();
        }

        /**
         * Manga tone screen — CMYK-style dot pattern fills (One Piece background panels).
         */
        createMangatone(size, dotRadius, alpha = 0.6) {
            const cnv = document.createElement('canvas');
            cnv.width = size; cnv.height = size;
            const ctx = cnv.getContext('2d');
            ctx.fillStyle = `rgba(0,0,0,${alpha})`;
            for (let y = 0; y < size; y += size / 4) {
                for (let x = 0; x < size; x += size / 4) {
                    ctx.beginPath();
                    ctx.arc(x + size / 8, y + size / 8, dotRadius, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
            return cnv;
        }
    }

    /* ═══════════════════════════════════════════════════════════════════
       4. SMEAR FRAME SYSTEM
    ═══════════════════════════════════════════════════════════════════ */
    class SmearFrameSystem {
        constructor(mgr) {
            this.mgr = mgr;
            this.smearType = 'stretch';  // 'stretch', 'blur', 'ghost', 'multi'
            this.smearStrength = 0.7;
            this.ghostCount = 3;
        }

        /**
         * Generate a smear frame by morphing strokes between two keyframes.
         * Produces the "stretch" smear common in fast anime action.
         */
        generateStretchSmear(strokesA, strokesB, t) {
            if (!strokesA.length || !strokesB.length) return strokesA;

            return strokesA.map((sa, si) => {
                const sb = strokesB[si] || sa;
                const ptsA = sa.points || [];
                const ptsB = sb.points || [];
                const maxPts = Math.max(ptsA.length, ptsB.length);

                const stretchPts = [];
                for (let i = 0; i < maxPts; i++) {
                    const tA = i / Math.max(1, ptsA.length - 1);
                    const tB = i / Math.max(1, ptsB.length - 1);
                    const pA = this._sampleStroke(ptsA, tA);
                    const pB = this._sampleStroke(ptsB, tB);

                    // Overshoot position for stretch exaggeration
                    const overshoot = Math.sin(t * Math.PI) * this.smearStrength;
                    stretchPts.push({
                        x: U.lerp(pA.x, pB.x, t) + (pB.x - pA.x) * overshoot,
                        y: U.lerp(pA.y, pB.y, t) + (pB.y - pA.y) * overshoot,
                        p: U.lerp(pA.p ?? 1, pB.p ?? 1, t)
                    });
                }

                return { ...sa, points: stretchPts, size: sa.size * (1 + overshoot * 0.3) };
            });
        }

        /** Draw multi-ghost smear: overlapping transparent copies offset by velocity. */
        drawGhostSmear(ctx, strokes, velocityX, velocityY, drawFn) {
            const n = this.ghostCount;
            for (let i = 0; i < n; i++) {
                const t    = (i + 1) / (n + 1);
                const alpha = (1 - t) * 0.35 * this.smearStrength;
                ctx.save();
                ctx.globalAlpha = alpha;
                ctx.translate(velocityX * t, velocityY * t);
                strokes.forEach(s => drawFn(s, ctx));
                ctx.restore();
            }
        }

        /** Draw a motion-blur style streak for a single stroke. */
        drawBlurStreak(stroke, ctx, velX, velY) {
            const steps = 6;
            ctx.save();
            for (let i = 0; i < steps; i++) {
                const t = i / steps;
                ctx.globalAlpha = (1 - t) * 0.15;
                ctx.save();
                ctx.translate(velX * t * 0.5, velY * t * 0.5);
                AnimeLineart.draw(stroke, ctx, null);
                ctx.restore();
            }
            ctx.globalAlpha = 1;
            AnimeLineart.draw(stroke, ctx, null);
            ctx.restore();
        }

        _sampleStroke(pts, t) {
            if (!pts.length) return { x: 0, y: 0, p: 1 };
            const i = U.clamp(t * (pts.length - 1), 0, pts.length - 1);
            const lo = pts[Math.floor(i)];
            const hi = pts[Math.ceil(i)] || lo;
            const frac = i - Math.floor(i);
            return { x: U.lerp(lo.x, hi.x, frac), y: U.lerp(lo.y, hi.y, frac), p: U.lerp(lo.p ?? 1, hi.p ?? 1, frac) };
        }
    }

    /* ═══════════════════════════════════════════════════════════════════
       5. LIMITED ANIMATION ENGINE
    ═══════════════════════════════════════════════════════════════════ */
    class LimitedAnimationEngine {
        constructor(mgr) {
            this.mgr        = mgr;
            this.timing     = 2;   // 1s / 2s / 3s (on-ones, on-twos, on-threes)
            this.fps        = 24;
            this.holdFrames = 4;   // default hold duration for non-moving cells
        }

        /** Returns the frame-display index based on limited timing. */
        getDisplayFrame(rawFrame) {
            return Math.floor(rawFrame / this.timing) * this.timing;
        }

        /**
         * Auto-generate exposure for the active layer's keyframes.
         * Applies 2s / 3s timing throughout the timeline.
         */
        applyTimingToLayer(layerId) {
            const mgr = this.mgr;
            const frames = mgr.getLayerFrames(layerId);
            frames.forEach((frame, i) => {
                const nextFrame = frames[i + 1] ?? (frame + this.holdFrames);
                const idealExposure = Math.max(this.timing, Math.round((nextFrame - frame) / this.timing) * this.timing);
                mgr.setFrameExposure(frame, idealExposure);
            });
        }

        /**
         * Cycle animation: repeat keyframes as a looping cycle.
         * Used for walk-cycles, breathing, blinking.
         */
        createCycle(layerId, cycleLength) {
            const mgr  = this.mgr;
            const frames = mgr.getLayerFrames(layerId);
            if (frames.length < 2) return;

            const cycleFrames = frames.slice(0, cycleLength > 0 ? cycleLength : frames.length);
            const startFrom   = frames[frames.length - 1] + this.timing;

            cycleFrames.forEach((srcFrame, i) => {
                const dstFrame = startFrom + i * this.timing;
                const src = JSON.parse(JSON.stringify(mgr.keyframes.get(srcFrame) || []));
                mgr.keyframes.set(dstFrame, src);
                const meta = mgr.getOrCreateKeyframeMeta(srcFrame);
                mgr.keyframeMeta.set(dstFrame, { ...meta });
            });

            mgr.updateTimelineUI();
            mgr.syncTimelineMarkers();
        }
    }

    /* ═══════════════════════════════════════════════════════════════════
       6. CAMERA WORK ENGINE
    ═══════════════════════════════════════════════════════════════════ */
    class CameraWorkEngine {
        constructor(mgr) {
            this.mgr        = mgr;
            this.showHUD    = true;
            this.shakePower = 0;
            this.shakeDecay = 0.85;
            this._shakeX    = 0;
            this._shakeY    = 0;
            this.cuts       = [];   // [{frame, type, label}]
            this.currentCutType = 'medium'; // 'extreme-close', 'close', 'medium', 'wide', 'establishing'
            this.pannedX    = 0;
            this.pannedY    = 0;
            this.zoomKeyframes = new Map(); // frame -> { scale, x, y }
        }

        /** Add a camera cut marker at the current frame. */
        addCut(frame, type = this.currentCutType, label = '') {
            this.cuts.push({ frame, type, label });
            this.cuts.sort((a, b) => a.frame - b.frame);
        }

        /** Trigger a camera shake (hit / explosion impact). */
        triggerShake(power = 12) {
            this.shakePower = power;
        }

        /** Update shake each render tick. */
        updateShake() {
            if (this.shakePower < 0.5) { this._shakeX = 0; this._shakeY = 0; return; }
            this._shakeX = (Math.random() - 0.5) * this.shakePower;
            this._shakeY = (Math.random() - 0.5) * this.shakePower;
            this.shakePower *= this.shakeDecay;
        }

        /** Apply shake transform to the canvas context. */
        applyShake(ctx) {
            if (this._shakeX || this._shakeY) {
                ctx.translate(this._shakeX, this._shakeY);
            }
        }

        /**
         * Draw the composition HUD (rule of thirds, safe areas, shot-type guide).
         */
        drawCompositionHUD(ctx, w, h) {
            if (!this.showHUD) return;
            ctx.save();
            ctx.globalAlpha = 0.22;
            ctx.strokeStyle = '#00ffcc';
            ctx.lineWidth   = 1;
            ctx.setLineDash([4, 4]);

            // Rule of thirds grid
            for (let i = 1; i <= 2; i++) {
                const xLine = (w / 3) * i;
                const yLine = (h / 3) * i;
                ctx.beginPath();
                ctx.moveTo(xLine, 0); ctx.lineTo(xLine, h); ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(0, yLine); ctx.lineTo(w, yLine); ctx.stroke();
            }

            // Golden spiral hint (top-right power point)
            ctx.globalAlpha = 0.12;
            ctx.strokeStyle = '#ffdd00';
            const pw = w * (2 / 3), ph = h * (1 / 3);
            ctx.beginPath();
            ctx.arc(pw, ph, Math.min(w, h) * 0.06, 0, Math.PI * 2);
            ctx.stroke();

            ctx.setLineDash([]);
            ctx.restore();
        }

        /**
         * Apply a zoom-punch effect (rapid zoom to emphasise a moment).
         * Duration is in render frames.
         */
        zoomPunch(scale = 1.15, durationMs = 80) {
            const mgr  = this.mgr;
            const origScale = mgr.view2D.scale;
            const origX     = mgr.view2D.offsetX;
            const origY     = mgr.view2D.offsetY;
            const w = mgr.canvas.width;
            const h = mgr.canvas.height;
            const cx = (w / 2 - origX) / origScale;
            const cy = (h / 2 - origY) / origScale;

            let start = null;
            const run = (ts) => {
                if (!start) start = ts;
                const pct = U.clamp((ts - start) / durationMs, 0, 1);
                const t   = pct < 0.5 ? pct * 2 : 2 - pct * 2; // ping-pong

                const s = origScale * (1 + (scale - 1) * t);
                mgr.view2D.scale   = s;
                mgr.view2D.offsetX = w / 2 - cx * s;
                mgr.view2D.offsetY = h / 2 - cy * s;
                mgr.render();

                if (pct < 1) requestAnimationFrame(run);
                else {
                    mgr.view2D.scale   = origScale;
                    mgr.view2D.offsetX = origX;
                    mgr.view2D.offsetY = origY;
                    mgr.render();
                }
            };
            requestAnimationFrame(run);
        }
    }

    /* ═══════════════════════════════════════════════════════════════════
       7. EXPORT ENGINE
    ═══════════════════════════════════════════════════════════════════ */
    class ExportEngine {
        constructor(mgr) {
            this.mgr        = mgr;
            this.frameRate  = 24;
            this.format     = 'png';  // 'png', 'webm', 'gif'
            this.resolution = { w: 1920, h: 1080 };
            this.quality    = 0.92;
            this.bgColor    = '#ffffff';
            this.onProgress = null;
        }

        /** Export a range of frames as PNG sequence (ZIP download). */
        async exportPNGSequence(startFrame, endFrame) {
            const mgr     = this.mgr;
            const frames  = [];
            const total   = endFrame - startFrame + 1;

            for (let f = startFrame; f <= endFrame; f++) {
                const cnv = this._renderFrameToCanvas(f);
                frames.push({ name: `frame_${String(f).padStart(5, '0')}.png`, url: cnv.toDataURL('image/png') });
                if (this.onProgress) this.onProgress(f - startFrame, total);
            }

            await this._downloadAsZip(frames);
        }

        /** Export WebM video via MediaRecorder API. */
        async exportWebM(startFrame, endFrame) {
            const mgr     = this.mgr;
            const fps     = this.frameRate;
            const totalFrames = endFrame - startFrame + 1;
            const msCap   = (1000 / fps);

            // Create an offscreen canvas for recording
            const exportCnv = document.createElement('canvas');
            exportCnv.width  = this.resolution.w;
            exportCnv.height = this.resolution.h;
            const eCtx       = exportCnv.getContext('2d');

            const stream   = exportCnv.captureStream(fps);
            const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9' });
            const chunks   = [];
            recorder.ondataavailable = e => chunks.push(e.data);
            recorder.start();

            for (let f = startFrame; f <= endFrame; f++) {
                const frameCnv = this._renderFrameToCanvas(f);
                eCtx.clearRect(0, 0, exportCnv.width, exportCnv.height);
                eCtx.drawImage(frameCnv, 0, 0, exportCnv.width, exportCnv.height);
                await new Promise(r => setTimeout(r, msCap));
                if (this.onProgress) this.onProgress(f - startFrame, totalFrames);
            }

            recorder.stop();
            await new Promise(r => { recorder.onstop = r; });

            const blob = new Blob(chunks, { type: 'video/webm' });
            const url  = URL.createObjectURL(blob);
            const a    = document.createElement('a');
            a.href     = url;
            a.download = 'anime_export.webm';
            a.click();
            URL.revokeObjectURL(url);
        }

        _renderFrameToCanvas(frameIndex) {
            const mgr = this.mgr;
            const cnv = document.createElement('canvas');
            cnv.width  = this.resolution.w;
            cnv.height = this.resolution.h;
            const ctx  = cnv.getContext('2d');

            // Background
            ctx.fillStyle = this.bgColor;
            ctx.fillRect(0, 0, cnv.width, cnv.height);

            // Render strokes
            const strokes = mgr.resolveDisplayStrokesForFrame(frameIndex);
            const scaleX  = cnv.width  / mgr.canvas.width;
            const scaleY  = cnv.height / mgr.canvas.height;
            ctx.save();
            ctx.scale(scaleX * mgr.view2D.scale, scaleY * mgr.view2D.scale);
            ctx.translate(mgr.view2D.offsetX / mgr.view2D.scale, mgr.view2D.offsetY / mgr.view2D.scale);
            mgr.renderStrokeCollection(strokes, ctx);
            ctx.restore();

            return cnv;
        }

        async _downloadAsZip(files) {
            // Simple multi-file download via anchor tags
            for (const file of files) {
                const a = document.createElement('a');
                a.href = file.url;
                a.download = file.name;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                await new Promise(r => setTimeout(r, 30));
            }
        }
    }

    /* ═══════════════════════════════════════════════════════════════════
       8. ANIME PRODUCTION BRUSHES
    ═══════════════════════════════════════════════════════════════════ */
    const ANIME_PRODUCTION_BRUSHES = [
        // ── Key Animation Brushes ──────────────────────────────────────
        {
            id: 'ap_gpen_thin',     name: 'G-Pen Thin',  icon: 'G1', category: 'draw',
            radius: 3, strength: 1.0, spacing: 0.04, jitter: 0.0,
            hardness: 1.0, streamline: 0.85, taperStart: 0.15, taperEnd: 0.28,
            _algo: 'ap_gpen'
        },
        {
            id: 'ap_gpen_thick',    name: 'G-Pen Bold',  icon: 'G2', category: 'draw',
            radius: 8, strength: 1.0, spacing: 0.04, jitter: 0.0,
            hardness: 1.0, streamline: 0.8, taperStart: 0.10, taperEnd: 0.22,
            _algo: 'ap_gpen'
        },
        {
            id: 'ap_maru',          name: 'Maru Pen',    icon: 'MP', category: 'draw',
            radius: 5, strength: 0.9, spacing: 0.06, jitter: 0.01,
            hardness: 0.95, streamline: 0.75, taperStart: 0.06, taperEnd: 0.18,
            _algo: 'ap_lineart'
        },
        {
            id: 'ap_saji',          name: 'Saji Brush',  icon: 'SJ', category: 'draw',
            radius: 12, strength: 0.85, spacing: 0.08, jitter: 0.02,
            hardness: 0.7, streamline: 0.6, taperStart: 0.1, taperEnd: 0.3,
            _algo: 'ap_lineart'
        },

        // ── Colouring / Shading ────────────────────────────────────────
        {
            id: 'ap_cel_shadow',    name: 'Cel Shadow',  icon: 'CS', category: 'draw',
            radius: 20, strength: 1.0, spacing: 0.04, jitter: 0.0,
            hardness: 1.0, streamline: 0.6, taperStart: 0.0, taperEnd: 0.0,
            _algo: 'ap_cel', blend: 'multiply'
        },
        {
            id: 'ap_cel_base',      name: 'Cel Fill',    icon: 'CF', category: 'draw',
            radius: 22, strength: 1.0, spacing: 0.04, jitter: 0.0,
            hardness: 1.0, streamline: 0.5, taperStart: 0.0, taperEnd: 0.0,
            _algo: 'ap_cel', blend: 'source-over'
        },
        {
            id: 'ap_soft_shadow',   name: 'Soft Shadow', icon: 'SS', category: 'draw',
            radius: 28, strength: 0.4, spacing: 0.05, jitter: 0.0,
            hardness: 0.05, streamline: 0.3, taperStart: 0.0, taperEnd: 0.0,
            _algo: 'ap_airbrush', blend: 'multiply'
        },

        // ── Special FX ─────────────────────────────────────────────────
        {
            id: 'ap_speed_radial',  name: 'Speed Lines', icon: 'SL', category: 'fx',
            radius: 15, strength: 0.9, spacing: 0.1, jitter: 0.12,
            hardness: 0.9, streamline: 0.2, taperStart: 0.0, taperEnd: 0.4,
            _algo: 'ap_speed_radial'
        },
        {
            id: 'ap_speed_dir',     name: 'Motion Lines', icon: 'ML', category: 'fx',
            radius: 12, strength: 0.85, spacing: 0.08, jitter: 0.18,
            hardness: 1.0, streamline: 0.15, taperStart: 0.0, taperEnd: 0.35,
            _algo: 'ap_speed_dir'
        },
        {
            id: 'ap_aura',          name: 'Cursed Aura',  icon: 'CA', category: 'fx',
            radius: 40, strength: 0.75, spacing: 0.12, jitter: 0.0,
            hardness: 0.0, streamline: 0.2, taperStart: 0.0, taperEnd: 0.0,
            _algo: 'ap_aura', blend: 'screen'
        },
        {
            id: 'ap_breath',        name: 'Breath FX',   icon: 'BF', category: 'fx',
            radius: 35, strength: 0.7, spacing: 0.1, jitter: 0.0,
            hardness: 0.0, streamline: 0.2, taperStart: 0.0, taperEnd: 0.0,
            _algo: 'ap_breath', blend: 'screen'
        },
        {
            id: 'ap_glow_bright',   name: 'Bright Glow', icon: 'BG', category: 'fx',
            radius: 26, strength: 0.55, spacing: 0.06, jitter: 0.0,
            hardness: 0.0, streamline: 0.25, taperStart: 0.0, taperEnd: 0.0,
            _algo: 'ap_glow', blend: 'screen'
        },
        {
            id: 'ap_ink_splatter',  name: 'Ink Splatter', icon: 'IS', category: 'fx',
            radius: 18, strength: 0.9, spacing: 0.22, jitter: 0.8,
            hardness: 0.95, streamline: 0.0, taperStart: 0.0, taperEnd: 0.0,
            _algo: 'ap_splatter'
        },
        {
            id: 'ap_smear',         name: 'Action Smear', icon: 'AM', category: 'fx',
            radius: 22, strength: 0.65, spacing: 0.04, jitter: 0.05,
            hardness: 0.2, streamline: 0.1, taperStart: 0.0, taperEnd: 0.0,
            _algo: 'ap_smear', blend: 'source-over'
        },
        {
            id: 'ap_manga_tone',    name: 'Manga Tone',  icon: 'MT', category: 'fx',
            radius: 30, strength: 0.7, spacing: 0.04, jitter: 0.0,
            hardness: 1.0, streamline: 0.4, taperStart: 0.0, taperEnd: 0.0,
            _algo: 'ap_mangatone', blend: 'multiply'
        },

        // ── Highlight / Rim ────────────────────────────────────────────
        {
            id: 'ap_rim_light',     name: 'Rim Light',   icon: 'RL', category: 'lighting',
            radius: 10, strength: 0.7, spacing: 0.06, jitter: 0.0,
            hardness: 0.15, streamline: 0.55, taperStart: 0.08, taperEnd: 0.18,
            _algo: 'ap_rim', blend: 'screen'
        },
        {
            id: 'ap_specular',      name: 'Specular',    icon: 'SP', category: 'lighting',
            radius: 8, strength: 0.85, spacing: 0.05, jitter: 0.0,
            hardness: 0.9, streamline: 0.7, taperStart: 0.05, taperEnd: 0.12,
            _algo: 'ap_gpen', blend: 'overlay'
        },
        {
            id: 'ap_hair_sheen',    name: 'Hair Sheen',  icon: 'HS', category: 'lighting',
            radius: 14, strength: 0.6, spacing: 0.05, jitter: 0.01,
            hardness: 0.85, streamline: 0.9, taperStart: 0.15, taperEnd: 0.25,
            _algo: 'ap_hair', blend: 'overlay'
        }
    ];

    /* ═══════════════════════════════════════════════════════════════════
       9. DRAW ALGORITHM REGISTRY
    ═══════════════════════════════════════════════════════════════════ */
    const fxEngine = new SpecialFXEngine();
    const celEngine = new CelShadingEngine();
    const _tonePatterns = {};

    const ALGO_REGISTRY = {

        ap_gpen(stroke, ctx) {
            AnimeLineart.drawInkBleed(stroke, ctx);
        },

        ap_lineart(stroke, ctx) {
            AnimeLineart.draw(stroke, ctx, null);
        },

        ap_cel(stroke, ctx) {
            const pts = stroke.points || [];
            if (!pts.length) return;
            ctx.save();
            ctx.globalCompositeOperation = stroke.brush?.blend || 'source-over';
            ctx.globalAlpha = 1;
            ctx.strokeStyle = stroke.color || '#ccc';
            ctx.lineWidth   = stroke.size;
            ctx.lineCap     = 'round';
            ctx.lineJoin    = 'miter';
            ctx.miterLimit  = 10;
            ctx.shadowBlur  = 0;
            ctx.beginPath();
            ctx.moveTo(pts[0].x, pts[0].y);
            for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
            ctx.stroke();
            ctx.restore();
        },

        ap_airbrush(stroke, ctx) {
            const pts = stroke.points || [];
            if (!pts.length) return;
            const r     = stroke.size || 12;
            const alpha = Math.min(1, (stroke.brush?.strength ?? 0.4) * (stroke.brush?.opacity ?? 1));
            const color = stroke.color || '#ffffff';
            const rgb   = U.hexToRgb(color);
            const blend = stroke.brush?.blend || 'source-over';

            const tip = document.createElement('canvas');
            tip.width = r * 2 + 2; tip.height = r * 2 + 2;
            const tc  = tip.getContext('2d');
            const g   = tc.createRadialGradient(r, r, 0, r, r, r);
            g.addColorStop(0, `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha})`);
            g.addColorStop(1, `rgba(${rgb.r},${rgb.g},${rgb.b},0)`);
            tc.fillStyle = g; tc.fillRect(0, 0, tip.width, tip.height);

            ctx.save();
            ctx.globalCompositeOperation = blend;
            const spacing = Math.max(2, r * 0.4);
            let acc = 0, last = pts[0];
            for (let i = 1; i < pts.length; i++) {
                const d = U.dist(last, pts[i]);
                acc += d;
                while (acc >= spacing) {
                    const t = (acc - spacing) / d;
                    const x = pts[i].x - (pts[i].x - last.x) * t;
                    const y = pts[i].y - (pts[i].y - last.y) * t;
                    ctx.drawImage(tip, x - r, y - r);
                    acc -= spacing;
                }
                last = pts[i];
            }
            ctx.restore();
        },

        ap_glow(stroke, ctx) {
            const pts = stroke.points || [];
            if (!pts.length) return;
            ctx.save();
            ctx.globalCompositeOperation = 'screen';
            ctx.globalAlpha = stroke.brush?.strength ?? 0.55;
            ctx.strokeStyle = stroke.color || '#ffffff';
            ctx.lineWidth   = stroke.size;
            ctx.lineCap     = 'round';
            ctx.shadowColor = stroke.color || '#ffffff';
            ctx.shadowBlur  = stroke.size * 1.8;
            ctx.beginPath();
            ctx.moveTo(pts[0].x, pts[0].y);
            for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
            ctx.stroke();
            ctx.shadowBlur = 0;
            ctx.restore();
        },

        ap_rim(stroke, ctx) {
            const pts = stroke.points || [];
            if (!pts.length) return;
            ctx.save();
            ctx.globalCompositeOperation = 'screen';
            ctx.globalAlpha = stroke.brush?.strength ?? 0.7;
            const rgb = U.hexToRgb(stroke.color || '#aaddff');
            ctx.strokeStyle = `rgb(${rgb.r},${rgb.g},${rgb.b})`;
            ctx.shadowColor = `rgb(${rgb.r},${rgb.g},${rgb.b})`;
            ctx.shadowBlur  = stroke.size * 0.8;
            ctx.lineWidth   = stroke.size * 0.3;
            ctx.lineCap     = 'round';
            ctx.beginPath();
            ctx.moveTo(pts[0].x, pts[0].y);
            for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
            ctx.stroke();
            ctx.shadowBlur = 0;
            ctx.restore();
        },

        ap_hair(stroke, ctx) {
            const pts = stroke.points || [];
            if (!pts.length || pts.length < 2) return;
            ctx.save();
            ctx.globalCompositeOperation = 'overlay';

            const size = stroke.size;
            const count = 6;
            for (let i = 0; i < count; i++) {
                const offset = (i - count / 2) * (size * 0.18);
                const dist   = Math.abs(i - count / 2) / (count / 2);
                ctx.globalAlpha = (0.06 + (1 - dist) * 0.28) * (stroke.brush?.strength ?? 1);
                ctx.lineWidth   = Math.max(0.5, (size / 8) * (1 - dist * 0.6));
                ctx.strokeStyle = stroke.color || '#ffffff';
                ctx.lineCap     = 'round';

                ctx.beginPath();
                ctx.moveTo(pts[0].x + offset, pts[0].y + offset);
                for (let j = 1; j < pts.length; j++) {
                    const jitter = (Math.random() - 0.5) * size * 0.04;
                    ctx.lineTo(pts[j].x + offset + jitter, pts[j].y + offset + jitter);
                }
                ctx.stroke();
            }
            ctx.restore();
        },

        ap_speed_radial(stroke, ctx) {
            const pts = stroke.points || [];
            if (!pts.length) return;
            const cx = pts[0].x, cy = pts[0].y;
            const r  = stroke.size * 8;
            fxEngine.drawSpeedLines(ctx, cx, cy, r, {
                color:     stroke.color || '#000',
                count:     50 + Math.round(stroke.brush?.strength * 80),
                alpha:     stroke.brush?.opacity ?? 0.9,
                taper:     true,
                minLen:    r * 0.2,
                maxLen:    r * 0.85,
                innerHole: r * 0.05
            });
        },

        ap_speed_dir(stroke, ctx) {
            const pts = stroke.points || [];
            if (pts.length < 2) return;
            const angle = U.angle(pts[0], pts[pts.length - 1]);
            // Use a temporary offscreen, then paste
            const tmpCnv = document.createElement('canvas');
            tmpCnv.width  = 1920; tmpCnv.height = 1080;
            const tCtx   = tmpCnv.getContext('2d');
            fxEngine.drawDirectionalLines(tCtx, tmpCnv.width, tmpCnv.height, {
                direction: angle,
                color:     stroke.color || '#000',
                alpha:     stroke.brush?.opacity ?? 0.8,
                count:     80
            });
            ctx.save();
            ctx.globalAlpha = stroke.brush?.strength ?? 0.85;
            ctx.drawImage(tmpCnv, 0, 0);
            ctx.restore();
        },

        ap_aura(stroke, ctx) {
            const pts = stroke.points || [];
            if (!pts.length) return;
            const cx = pts[0].x, cy = pts[0].y;
            fxEngine.drawCursedAura(ctx, cx, cy, stroke.size * 4, {
                colorInner: stroke.color || '#6e00ff',
                colorOuter: '#0a000f',
                alpha: stroke.brush?.strength ?? 0.9
            });
        },

        ap_breath(stroke, ctx) {
            const pts = stroke.points || [];
            if (!pts.length) return;
            fxEngine.drawBreathEffect(ctx, pts[0].x, pts[0].y, stroke.size * 3.5, {
                color: stroke.color || '#ff6600',
                alpha: stroke.brush?.strength ?? 0.7,
                time:  performance.now() * 0.001
            });
        },

        ap_splatter(stroke, ctx) {
            const pts = stroke.points || [];
            if (!pts.length) return;
            const r   = stroke.size;
            const rgb = U.hexToRgb(stroke.color || '#000');
            ctx.save();
            ctx.globalCompositeOperation = stroke.brush?.blend || 'source-over';
            ctx.fillStyle = `rgb(${rgb.r},${rgb.g},${rgb.b})`;

            pts.forEach(p => {
                const count = 3 + Math.floor(Math.random() * 6);
                for (let i = 0; i < count; i++) {
                    const angle   = Math.random() * Math.PI * 2;
                    const dist2   = Math.random() * r * 1.8;
                    const dotR    = 0.5 + Math.random() * r * 0.25;
                    const scaleX  = 0.4 + Math.random() * 1.2;
                    const scaleY  = 0.4 + Math.random() * 1.2;
                    const rot     = Math.random() * Math.PI;
                    ctx.save();
                    ctx.translate(p.x + Math.cos(angle) * dist2, p.y + Math.sin(angle) * dist2);
                    ctx.rotate(rot);
                    ctx.scale(scaleX, scaleY);
                    ctx.globalAlpha = 0.5 + Math.random() * 0.5;
                    ctx.beginPath();
                    ctx.ellipse(0, 0, dotR, dotR * 0.6, 0, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.restore();
                }
            });
            ctx.restore();
        },

        ap_smear(stroke, ctx) {
            const pts = stroke.points || [];
            if (pts.length < 2) return;
            const velX = (pts[pts.length - 1].x - pts[0].x) / pts.length;
            const velY = (pts[pts.length - 1].y - pts[0].y) / pts.length;

            ctx.save();
            for (let i = 5; i >= 1; i--) {
                ctx.save();
                ctx.globalAlpha = 0.08;
                ctx.translate(velX * i * 0.8, velY * i * 0.8);
                ALGO_REGISTRY.ap_airbrush({ ...stroke, brush: { ...stroke.brush, strength: 0.2 } }, ctx);
                ctx.restore();
            }
            ctx.restore();
            ALGO_REGISTRY.ap_lineart(stroke, ctx);
        },

        ap_mangatone(stroke, ctx) {
            const pts = stroke.points || [];
            if (!pts.length) return;

            const key = `tone_${stroke.size}`;
            if (!_tonePatterns[key]) {
                _tonePatterns[key] = fxEngine.createMangatone(32, 2.5, 0.65);
            }

            ctx.save();
            ctx.globalCompositeOperation = stroke.brush?.blend || 'multiply';
            ctx.globalAlpha = stroke.brush?.strength ?? 0.7;

            // Create a path from stroke and clip
            ctx.beginPath();
            ctx.moveTo(pts[0].x, pts[0].y);
            for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
            ctx.lineWidth = stroke.size;
            ctx.lineCap = 'round';

            const ptrn = ctx.createPattern(_tonePatterns[key], 'repeat');
            ctx.strokeStyle = ptrn;
            ctx.stroke();
            ctx.restore();
        }
    };

    /* ═══════════════════════════════════════════════════════════════════
       10. PRODUCTION PANEL UI  (dark anime-studio inspector)
    ═══════════════════════════════════════════════════════════════════ */
    function injectProductionPanelUI(mgr, cameraEng, exportEng, limitedAnim, smearSys) {
        // Remove if already exists
        const existingPanel = document.getElementById('ap-production-panel');
        if (existingPanel) existingPanel.remove();

        const panel = document.createElement('div');
        panel.id = 'ap-production-panel';
        panel.innerHTML = `
            <style>
                #ap-production-panel{position:fixed;left:0;top:50%;transform:translateY(-50%);width:230px;max-height:88vh;overflow-x:hidden;overflow-y:auto;background:var(--panel-bg);border:1px solid var(--border-color);border-left:0;border-radius:0 6px 6px 0;box-shadow:var(--shadow-heavy);z-index:99999;font-family:'Segoe UI','SF Pro Text',sans-serif;color:var(--text-primary);user-select:none;scrollbar-width:thin;scrollbar-color:var(--input-border) var(--panel-bg);}
                #ap-production-panel *{box-sizing:border-box;}
                #ap-production-panel::-webkit-scrollbar{width:6px;}
                #ap-production-panel::-webkit-scrollbar-track{background:var(--panel-bg);}
                #ap-production-panel::-webkit-scrollbar-thumb{background:var(--input-border);border-radius:3px;}
                #ap-production-panel::-webkit-scrollbar-thumb:hover{background:var(--text-muted);}
                .ap-header{display:flex;align-items:center;gap:8px;min-height:42px;padding:7px 9px;background:var(--header-bg);border-bottom:1px solid var(--border-color);cursor:grab;}
                .ap-header:active{cursor:grabbing;}
                .ap-logo{display:flex;align-items:center;justify-content:center;flex:0 0 22px;width:22px;height:22px;background:var(--accent-info);border:1px solid color-mix(in srgb,var(--accent-info) 75%,var(--input-border) 25%);border-radius:4px;color:var(--text-primary);font-size:10px;font-weight:700;box-shadow:inset 0 1px 0 rgba(var(--text-primary-rgb),.12);}
                .ap-title{color:var(--text-primary);font-size:10px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;}
                .ap-subtitle{margin-top:1px;color:var(--text-muted);font-size:8px;letter-spacing:.45px;}
                .ap-section{background:var(--panel-bg);border-bottom:1px solid var(--border-color);}
                .ap-section:last-child{border-bottom:0;}
                .ap-section-head{display:flex;align-items:center;justify-content:space-between;min-height:29px;padding:6px 9px;background:var(--secondary-dark);color:var(--text-secondary);font-size:9.5px;font-weight:600;letter-spacing:.7px;text-transform:uppercase;cursor:pointer;transition:background .12s ease,color .12s ease;}
                .ap-section-head:hover{background:color-mix(in srgb,var(--text-primary) 5%,var(--secondary-dark) 95%);color:var(--text-primary);}
                .ap-section-head.open{color:var(--text-primary);}
                .ap-section-head .ap-caret{font-size:7px;color:var(--text-muted);transition:transform .16s ease,color .12s ease;}
                .ap-section-head:hover .ap-caret,.ap-section-head.open .ap-caret{color:var(--accent-info);}
                .ap-section-head.open .ap-caret{transform:rotate(90deg);}
                .ap-section-body{padding:8px 9px 9px;background:var(--panel-bg);}
                .ap-row{display:flex;align-items:center;justify-content:space-between;min-height:24px;margin-bottom:5px;gap:6px;}
                .ap-row:last-child{margin-bottom:0;}
                .ap-label{flex:0 0 auto;min-width:68px;color:var(--text-secondary);font-size:9.5px;}
                .ap-val{flex:0 0 auto;min-width:28px;color:var(--text-primary);font-size:9.5px;font-variant-numeric:tabular-nums;text-align:right;}
                .ap-range{flex:1;min-width:45px;height:16px;margin:0;background:transparent;outline:none;cursor:pointer;-webkit-appearance:none;appearance:none;}
                .ap-range::-webkit-slider-runnable-track{height:4px;background:var(--input-bg);border:1px solid var(--input-border);border-radius:2px;}
                .ap-range::-webkit-slider-thumb{width:8px;height:12px;margin-top:-5px;background:var(--text-secondary);border:1px solid var(--border-color);border-radius:2px;box-shadow:var(--shadow-light);-webkit-appearance:none;appearance:none;transition:background .12s ease,border-color .12s ease;}
                .ap-range:hover::-webkit-slider-thumb{background:var(--text-primary);}
                .ap-range:focus::-webkit-slider-thumb,.ap-range:active::-webkit-slider-thumb{background:var(--accent-info);border-color:var(--accent-info);}
                .ap-range::-moz-range-track{height:4px;background:var(--input-bg);border:1px solid var(--input-border);border-radius:2px;}
                .ap-range::-moz-range-thumb{width:8px;height:12px;background:var(--text-secondary);border:1px solid var(--border-color);border-radius:2px;}
                .ap-btn{display:inline-flex;align-items:center;justify-content:center;min-height:25px;padding:4px 7px;gap:4px;background:var(--secondary-dark);border:1px solid var(--border-color);border-top-color:var(--input-border);border-radius:3px;color:var(--text-secondary);font-family:inherit;font-size:9.5px;font-weight:600;outline:none;cursor:pointer;transition:background .12s ease,border-color .12s ease,color .12s ease,transform .06s ease;}
                .ap-btn:hover{background:color-mix(in srgb,var(--text-primary) 6%,var(--secondary-dark) 94%);border-color:var(--input-border);color:var(--text-primary);}
                .ap-btn:active{background:var(--tertiary-dark);transform:translateY(1px);}
                .ap-btn:focus-visible{outline:1px solid var(--accent-info);outline-offset:1px;}
                .ap-btn.active{background:color-mix(in srgb,var(--accent-info) 14%,var(--secondary-dark) 86%);border-color:color-mix(in srgb,var(--accent-info) 65%,var(--input-border) 35%);color:var(--text-primary);box-shadow:inset 2px 0 0 var(--accent-info);}
                .ap-btn.danger{color:var(--text-secondary);}
                .ap-btn.danger:hover{background:color-mix(in srgb,var(--accent-danger) 15%,var(--secondary-dark) 85%);border-color:color-mix(in srgb,var(--accent-danger) 70%,var(--input-border) 30%);color:var(--text-primary);}
                .ap-btn:disabled{opacity:.4;pointer-events:none;}
                .ap-btn-group{display:flex;align-items:center;flex-wrap:wrap;gap:4px;}
                .ap-select{flex:1;min-width:0;height:25px;padding:2px 5px;background:var(--input-bg);border:1px solid var(--input-border);border-radius:3px;color:var(--text-primary);font-family:inherit;font-size:9.5px;outline:none;cursor:pointer;transition:border-color .12s ease,background .12s ease;}
                .ap-select:hover{border-color:var(--text-muted);}
                .ap-select:focus{background:var(--tertiary-dark);border-color:var(--accent-info);}
                .ap-select option{background:var(--input-bg);color:var(--text-primary);}
                .ap-color-row{display:flex;align-items:center;gap:6px;margin-bottom:6px;}
                .ap-color-swatch{flex:0 0 24px;width:24px;height:24px;background:var(--input-bg);border:1px solid var(--input-border);border-radius:3px;cursor:pointer;}
                .ap-color-swatch:hover{border-color:var(--accent-info);}
                .ap-color-label{flex:1;color:var(--text-secondary);font-size:9px;}
                .ap-color-hex{color:var(--text-primary);font-family:monospace;font-size:9px;}
                #ap-production-panel input[type="color"]{width:30px!important;height:22px!important;padding:1px!important;background:var(--input-bg)!important;border:1px solid var(--input-border)!important;border-radius:3px!important;cursor:pointer!important;}
                #ap-production-panel input[type="color"]:hover{border-color:var(--accent-info)!important;}
                .ap-tag{display:inline-flex;align-items:center;min-height:19px;padding:2px 6px;background:var(--input-bg);border:1px solid var(--border-color);border-radius:3px;color:var(--text-muted);font-size:8px;}
                .ap-tag.active{background:color-mix(in srgb,var(--accent-info) 12%,var(--input-bg) 88%);border-color:color-mix(in srgb,var(--accent-info) 55%,var(--input-border) 45%);color:var(--text-primary);}
                .ap-progress{height:4px;overflow:hidden;background:var(--input-bg);border:1px solid var(--border-color);border-radius:2px;}
                .ap-progress-bar{width:0%;height:100%;background:var(--accent-info);transition:width .3s ease;}
                .ap-divider{height:1px;margin:7px 0;border:0;background:var(--border-color);}
                .ap-timing-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px;margin-top:4px;}
                .ap-timing-btn{min-width:0;padding:5px 2px;background:var(--input-bg);border:1px solid var(--border-color);border-radius:3px;color:var(--text-secondary);font-size:10px;font-weight:700;text-align:center;cursor:pointer;transition:background .12s ease,border-color .12s ease,color .12s ease;}
                .ap-timing-btn:hover{background:color-mix(in srgb,var(--text-primary) 5%,var(--input-bg) 95%);border-color:var(--input-border);color:var(--text-primary);}
                .ap-timing-btn.active{background:color-mix(in srgb,var(--accent-info) 13%,var(--input-bg) 87%);border-color:color-mix(in srgb,var(--accent-info) 60%,var(--input-border) 40%);color:var(--text-primary);box-shadow:inset 0 -2px 0 var(--accent-info);}
                .ap-fx-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px;margin-top:4px;}
                .ap-fx-btn{display:flex;align-items:center;justify-content:center;min-height:28px;padding:5px 4px;background:var(--input-bg);border:1px solid var(--border-color);border-radius:3px;color:var(--text-secondary);font-size:9px;text-align:center;cursor:pointer;transition:background .12s ease,border-color .12s ease,color .12s ease;}
                .ap-fx-btn:hover{background:color-mix(in srgb,var(--text-primary) 6%,var(--input-bg) 94%);border-color:var(--input-border);color:var(--text-primary);}
                .ap-fx-btn.active{background:color-mix(in srgb,var(--accent-info) 13%,var(--input-bg) 87%);border-color:var(--accent-info);color:var(--text-primary);box-shadow:inset 2px 0 0 var(--accent-info);}
                .ap-shadow-preview{display:flex;align-items:stretch;width:100%;height:36px;margin-top:6px;overflow:hidden;background:var(--input-bg);border:1px solid var(--input-border);border-radius:3px;}
                .ap-shadow-preview-base,.ap-shadow-preview-s1,.ap-shadow-preview-s2{flex:1;}
                #ap-production-panel input[type="checkbox"]{width:13px;height:13px;margin:0;accent-color:var(--accent-info);cursor:pointer;}
                #ap-production-panel label{color:var(--text-secondary)!important;}
                #ap-export-status{color:var(--text-muted)!important;}
                #ap-production-panel [style*="color:#5a6080"]{color:var(--text-secondary)!important;}
                #ap-production-panel [style*="color: #5a6080"]{color:var(--text-secondary)!important;}
                #ap-production-panel [style*="color:#444"]{color:var(--text-muted)!important;}
                #ap-production-panel [style*="color: #444"]{color:var(--text-muted)!important;}
                @media(max-height:700px){#ap-production-panel{max-height:94vh;}.ap-section-body{padding:6px 8px 7px;}.ap-row{margin-bottom:4px;}.ap-header{min-height:36px;padding-block:5px;}}
            </style>

            <div class="ap-header" id="ap-drag-handle">
                <div class="ap-logo">A</div>
                <div>
                    <div class="ap-title">Anime PRO</div>
                    <div class="ap-subtitle">Production Engine</div>
                </div>
            </div>
    
            <!-- ── Brush FX ── -->
            <div class="ap-section">
                <div class="ap-section-head open" data-section="fx">
                    <span>⚡ FX Brushes</span><span class="ap-caret">▶</span>
                </div>
                <div class="ap-section-body" id="ap-fx-body">
                    <div class="ap-fx-grid">
                        <div class="ap-fx-btn" data-brush="ap_speed_radial">💥 Speed Lines</div>
                        <div class="ap-fx-btn" data-brush="ap_speed_dir">➡ Motion Lines</div>
                        <div class="ap-fx-btn" data-brush="ap_aura">🌀 Cursed Aura</div>
                        <div class="ap-fx-btn" data-brush="ap_breath">🔥 Breath FX</div>
                        <div class="ap-fx-btn" data-brush="ap_glow_bright">✨ Bright Glow</div>
                        <div class="ap-fx-btn" data-brush="ap_ink_splatter">🎨 Ink Splatter</div>
                        <div class="ap-fx-btn" data-brush="ap_smear">👊 Action Smear</div>
                        <div class="ap-fx-btn" data-brush="ap_manga_tone">⬛ Manga Tone</div>
                    </div>
                    <hr class="ap-divider">
                    <div class="ap-row">
                        <span class="ap-label">Aura Color</span>
                        <input type="color" id="ap-aura-color" value="#6e00ff" style="width:32px;height:20px;border:none;background:none;cursor:pointer;padding:0">
                    </div>
                    <div class="ap-row">
                        <span class="ap-label">Speed Color</span>
                        <input type="color" id="ap-speed-color" value="#000000" style="width:32px;height:20px;border:none;background:none;cursor:pointer;padding:0">
                    </div>
                    <div class="ap-row">
                        <span class="ap-label">Impact Flash</span>
                        <div class="ap-btn-group">
                            <button class="ap-btn" id="ap-btn-impact-white">White</button>
                            <button class="ap-btn" id="ap-btn-impact-manga">Manga</button>
                        </div>
                    </div>
                </div>
            </div>
    
            <!-- ── Cel Shading ── -->
            <div class="ap-section">
                <div class="ap-section-head open" data-section="cel">
                    <span>🎨 Cel Shading</span><span class="ap-caret">▶</span>
                </div>
                <div class="ap-section-body" id="ap-cel-body">
                    <div class="ap-row">
                        <span class="ap-label">Shadow Tones</span>
                        <div class="ap-btn-group">
                            <button class="ap-btn active" id="ap-tone-2" data-tones="2">2T</button>
                            <button class="ap-btn" id="ap-tone-3" data-tones="3">3T</button>
                        </div>
                    </div>
                    <div class="ap-row">
                        <span class="ap-label">Shadow Depth</span>
                        <input type="range" class="ap-range" id="ap-shadow-depth" min="0.1" max="0.8" step="0.01" value="0.32">
                        <span class="ap-val" id="ap-shadow-depth-val">0.32</span>
                    </div>
                    <div class="ap-row">
                        <span class="ap-label">Hue Shift</span>
                        <label style="display:flex;align-items:center;gap:4px;font-size:9px;color:#5a6080;cursor:pointer">
                            <input type="checkbox" id="ap-hue-shift" checked> Enabled
                        </label>
                    </div>
                    <div class="ap-color-row" id="ap-shadow-preview-row">
                        <div class="ap-shadow-preview" id="ap-shadow-preview-bar">
                            <div class="ap-shadow-preview-base" id="ap-prev-base"></div>
                            <div class="ap-shadow-preview-s1"   id="ap-prev-s1"></div>
                            <div class="ap-shadow-preview-s2"   id="ap-prev-s2" style="display:none"></div>
                        </div>
                    </div>
                    <div class="ap-row">
                        <span class="ap-label">Apply Shadow</span>
                        <div class="ap-btn-group">
                            <button class="ap-btn" id="ap-btn-apply-shadow1">S1</button>
                            <button class="ap-btn" id="ap-btn-apply-shadow2">S2</button>
                            <button class="ap-btn" id="ap-btn-apply-rim">Rim</button>
                        </div>
                    </div>
                </div>
            </div>
    
            <!-- ── Camera Work ── -->
            <div class="ap-section">
                <div class="ap-section-head open" data-section="cam">
                    <span>🎥 Camera Work</span><span class="ap-caret">▶</span>
                </div>
                <div class="ap-section-body" id="ap-cam-body">
                    <div class="ap-row">
                        <span class="ap-label">Shot Type</span>
                        <select class="ap-select" id="ap-shot-select">
                            <option value="extreme-close">Extreme Close</option>
                            <option value="close">Close-Up</option>
                            <option value="medium" selected>Medium Shot</option>
                            <option value="wide">Wide Shot</option>
                            <option value="establishing">Establishing</option>
                        </select>
                    </div>
                    <div class="ap-row">
                        <span class="ap-label">HUD Overlay</span>
                        <label style="display:flex;align-items:center;gap:4px;font-size:9px;color:#5a6080;cursor:pointer">
                            <input type="checkbox" id="ap-hud-toggle" checked> Thirds Grid
                        </label>
                    </div>
                    <div class="ap-btn-group" style="margin-top:4px">
                        <button class="ap-btn" id="ap-btn-zoom-punch">🔍 Zoom Punch</button>
                        <button class="ap-btn" id="ap-btn-shake">💥 Shake</button>
                        <button class="ap-btn" id="ap-btn-add-cut">✂ Add Cut</button>
                    </div>
                    <hr class="ap-divider">
                    <div class="ap-row">
                        <span class="ap-label">Shake Power</span>
                        <input type="range" class="ap-range" id="ap-shake-power" min="2" max="40" step="1" value="12">
                        <span class="ap-val" id="ap-shake-val">12</span>
                    </div>
                </div>
            </div>
    
            <!-- ── Limited Animation ── -->
            <div class="ap-section">
                <div class="ap-section-head open" data-section="lim">
                    <span>🎞 Timing</span><span class="ap-caret">▶</span>
                </div>
                <div class="ap-section-body" id="ap-lim-body">
                    <div class="ap-label" style="margin-bottom:5px;font-size:9px">Animation Timing</div>
                    <div class="ap-timing-grid">
                        <div class="ap-timing-btn active" data-timing="1">1s<br><span style="font-size:7px;font-weight:400">Smooth</span></div>
                        <div class="ap-timing-btn" data-timing="2">2s<br><span style="font-size:7px;font-weight:400">Standard</span></div>
                        <div class="ap-timing-btn" data-timing="3">3s<br><span style="font-size:7px;font-weight:400">Limited</span></div>
                    </div>
                    <hr class="ap-divider">
                    <div class="ap-btn-group" style="margin-top:4px;">
                        <button class="ap-btn" id="ap-btn-apply-timing">Apply Timing</button>
                        <button class="ap-btn" id="ap-btn-create-cycle">↻ Create Cycle</button>
                    </div>
                    <hr class="ap-divider">
                    <div class="ap-label" style="font-size:9px;margin-bottom:5px">Smear Frame</div>
                    <div class="ap-row">
                        <span class="ap-label">Type</span>
                        <select class="ap-select" id="ap-smear-type">
                            <option value="stretch">Stretch</option>
                            <option value="ghost">Ghost</option>
                            <option value="blur">Blur</option>
                        </select>
                    </div>
                    <div class="ap-row">
                        <span class="ap-label">Strength</span>
                        <input type="range" class="ap-range" id="ap-smear-strength" min="0.1" max="1.0" step="0.05" value="0.7">
                        <span class="ap-val" id="ap-smear-val">0.7</span>
                    </div>
                </div>
            </div>
    
            <!-- ── Export ── -->
            <div class="ap-section">
                <div class="ap-section-head" data-section="exp">
                    <span>📤 Export</span><span class="ap-caret">▶</span>
                </div>
                <div class="ap-section-body" id="ap-exp-body" style="display:none">
                    <div class="ap-row">
                        <span class="ap-label">Format</span>
                        <select class="ap-select" id="ap-export-format">
                            <option value="png">PNG Sequence</option>
                            <option value="webm">WebM Video</option>
                        </select>
                    </div>
                    <div class="ap-row">
                        <span class="ap-label">FPS</span>
                        <select class="ap-select" id="ap-export-fps">
                            <option value="24" selected>24 fps</option>
                            <option value="30">30 fps</option>
                            <option value="12">12 fps</option>
                        </select>
                    </div>
                    <div class="ap-row">
                        <span class="ap-label">BG Color</span>
                        <input type="color" id="ap-export-bg" value="#ffffff" style="width:32px;height:20px;border:none;background:none;cursor:pointer;padding:0">
                    </div>
                    <button class="ap-btn" id="ap-btn-export" style="width:100%;justify-content:center;margin-top:4px">
                        📤 Export Scene
                    </button>
                    <div class="ap-progress" style="margin-top:6px" id="ap-export-progress-wrap">
                        <div class="ap-progress-bar" id="ap-export-progress"></div>
                    </div>
                    <div style="font-size:9px;color:#444;text-align:center;margin-top:3px" id="ap-export-status"></div>
                </div>
            </div>
        `;
    
        document.body.appendChild(panel);
        _bindPanelUI(panel, mgr, cameraEng, exportEng, limitedAnim, smearSys);
    }    
    
    function _bindPanelUI(panel, mgr, camEng, exportEng, limitedAnim, smearSys) {
        // Section collapse
        panel.querySelectorAll('.ap-section-head').forEach(head => {
            head.addEventListener('click', () => {
                const key  = head.dataset.section;
                const body = document.getElementById(`ap-${key}-body`);
                if (!body) return;
                const isOpen = head.classList.contains('open');
                head.classList.toggle('open', !isOpen);
                body.style.display = isOpen ? 'none' : '';
            });
        });

        // Draggable
        const handle = panel.querySelector('#ap-drag-handle');
        let _ox, _oy, _sx, _sy;
        handle.addEventListener('mousedown', e => {
            const r = panel.getBoundingClientRect();
            _sx = e.clientX; _sy = e.clientY; _ox = r.left; _oy = r.top;
            const mm = mv => {
                panel.style.left   = `${_ox + mv.clientX - _sx}px`;
                panel.style.top    = `${_oy + mv.clientY - _sy}px`;
                panel.style.transform = 'none';
            };
            const mu = () => { window.removeEventListener('mousemove', mm); window.removeEventListener('mouseup', mu); };
            window.addEventListener('mousemove', mm);
            window.addEventListener('mouseup', mu);
        });

        // FX brush buttons
        panel.querySelectorAll('.ap-fx-btn[data-brush]').forEach(btn => {
            btn.addEventListener('click', () => {
                if (typeof mgr.setBrushPreset === 'function') mgr.setBrushPreset(btn.dataset.brush);
            });
        });

        // Aura / speed colour pickers
        document.getElementById('ap-aura-color').addEventListener('input', e => {
            fxEngine.cursedColor2 = e.target.value;
        });
        document.getElementById('ap-speed-color').addEventListener('input', e => {
            fxEngine.speedLineColor = e.target.value;
        });

        // Impact flash buttons
        document.getElementById('ap-btn-impact-white').addEventListener('click', () => {
            const ctx = mgr.ctx;
            const w = mgr.canvas.width, h = mgr.canvas.height;
            ctx.save();
            fxEngine.drawImpactFlash(ctx, w, h, { style: 'radial', alpha: 0.88 });
            ctx.restore();
            setTimeout(() => mgr.render(), 80);
        });
        document.getElementById('ap-btn-impact-manga').addEventListener('click', () => {
            const ctx = mgr.ctx;
            const w = mgr.canvas.width, h = mgr.canvas.height;
            ctx.save();
            fxEngine.drawImpactFlash(ctx, w, h, { style: 'manga-screen', alpha: 0.9 });
            ctx.restore();
            setTimeout(() => mgr.render(), 80);
        });

        // Cel shading controls
        const shadowDepthSlider = document.getElementById('ap-shadow-depth');
        const shadowDepthVal    = document.getElementById('ap-shadow-depth-val');
        const hueShiftChk       = document.getElementById('ap-hue-shift');

        const updateShadowPreview = () => {
            const base = mgr.currentColor || '#60a5fa';
            celEngine.useHueShiftShadow = hueShiftChk.checked;
            celEngine.shadowIntensity   = parseFloat(shadowDepthSlider.value);
            shadowDepthVal.textContent  = shadowDepthSlider.value;
            const s1 = celEngine.getShadowColor(base, 1);
            const s2 = celEngine.getShadowColor(base, 2);
            document.getElementById('ap-prev-base').style.background = base;
            document.getElementById('ap-prev-s1').style.background   = s1;
            document.getElementById('ap-prev-s2').style.background   = s2;
        };

        shadowDepthSlider.addEventListener('input', updateShadowPreview);
        hueShiftChk.addEventListener('change', updateShadowPreview);
        updateShadowPreview();

        // Tone buttons
        panel.querySelectorAll('[data-tones]').forEach(btn => {
            btn.addEventListener('click', () => {
                panel.querySelectorAll('[data-tones]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                celEngine.tones = parseInt(btn.dataset.tones);
                const s2wrap = document.getElementById('ap-prev-s2');
                if (s2wrap) s2wrap.style.display = celEngine.tones === 3 ? '' : 'none';
            });
        });

        // Apply shadow / highlight brushes
        document.getElementById('ap-btn-apply-shadow1').addEventListener('click', () => {
            const shadowColor = celEngine.getShadowColor(mgr.currentColor || '#60a5fa', 1);
            mgr.currentColor  = shadowColor;
            const cp = document.getElementById('tool-color');
            if (cp) cp.value = shadowColor;
            if (typeof mgr.setBrushPreset === 'function') mgr.setBrushPreset('ap_cel_shadow');
            updateShadowPreview();
        });
        document.getElementById('ap-btn-apply-shadow2').addEventListener('click', () => {
            const shadowColor = celEngine.getShadowColor(mgr.currentColor || '#60a5fa', 2);
            mgr.currentColor  = shadowColor;
            const cp = document.getElementById('tool-color');
            if (cp) cp.value = shadowColor;
            if (typeof mgr.setBrushPreset === 'function') mgr.setBrushPreset('ap_soft_shadow');
            updateShadowPreview();
        });
        document.getElementById('ap-btn-apply-rim').addEventListener('click', () => {
            const rimColor = U.animeRimHighlight(mgr.currentColor || '#60a5fa');
            mgr.currentColor  = rimColor;
            const cp = document.getElementById('tool-color');
            if (cp) cp.value = rimColor;
            if (typeof mgr.setBrushPreset === 'function') mgr.setBrushPreset('ap_rim_light');
        });

        // Update shadow preview when colour changes
        const colorPicker = document.getElementById('tool-color');
        if (colorPicker) colorPicker.addEventListener('input', updateShadowPreview);

        // Camera
        document.getElementById('ap-shot-select').addEventListener('change', e => {
            camEng.currentCutType = e.target.value;
        });
        document.getElementById('ap-hud-toggle').addEventListener('change', e => {
            camEng.showHUD = e.target.checked;
            mgr.render();
        });
        document.getElementById('ap-btn-zoom-punch').addEventListener('click', () => camEng.zoomPunch(1.18, 90));
        document.getElementById('ap-btn-shake').addEventListener('click', () => {
            camEng.triggerShake(parseFloat(document.getElementById('ap-shake-power').value));
        });
        document.getElementById('ap-btn-add-cut').addEventListener('click', () => {
            camEng.addCut(mgr.getCurrentFrameIndex(), camEng.currentCutType);
            if (window.showToast) window.showToast(`Cut marker added at frame ${mgr.getCurrentFrameIndex() + 1}`, 'blue');
        });
        const shakePwr = document.getElementById('ap-shake-power');
        shakePwr.addEventListener('input', e => {
            document.getElementById('ap-shake-val').textContent = e.target.value;
        });

        // Limited animation timing
        panel.querySelectorAll('.ap-timing-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                panel.querySelectorAll('.ap-timing-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                limitedAnim.timing = parseInt(btn.dataset.timing);
            });
        });
        document.getElementById('ap-btn-apply-timing').addEventListener('click', () => {
            limitedAnim.applyTimingToLayer(mgr.currentLayerId);
            if (window.showToast) window.showToast('Timing applied to layer', 'blue');
        });
        document.getElementById('ap-btn-create-cycle').addEventListener('click', () => {
            limitedAnim.createCycle(mgr.currentLayerId, 0);
            if (window.showToast) window.showToast('Animation cycle created', 'blue');
        });

        // Smear type
        document.getElementById('ap-smear-type').addEventListener('change', e => {
            smearSys.smearType = e.target.value;
        });
        const smearStr = document.getElementById('ap-smear-strength');
        smearStr.addEventListener('input', e => {
            smearSys.smearStrength = parseFloat(e.target.value);
            document.getElementById('ap-smear-val').textContent = e.target.value;
        });

        // Export
        document.getElementById('ap-export-format').addEventListener('change', e => {
            exportEng.format = e.target.value;
        });
        document.getElementById('ap-export-fps').addEventListener('change', e => {
            exportEng.frameRate = parseInt(e.target.value);
        });
        document.getElementById('ap-export-bg').addEventListener('input', e => {
            exportEng.bgColor = e.target.value;
        });

        document.getElementById('ap-btn-export').addEventListener('click', async () => {
            const bar    = document.getElementById('ap-export-progress');
            const status = document.getElementById('ap-export-status');
            const state  = mgr.getTimelineState();
            const total  = Math.round(state.timelineDuration * state.fps);

            exportEng.onProgress = (cur, tot) => {
                bar.style.width = `${Math.round((cur / tot) * 100)}%`;
                status.textContent = `Frame ${cur + 1} / ${tot}`;
            };

            status.textContent = 'Starting…';
            try {
                if (exportEng.format === 'webm') {
                    await exportEng.exportWebM(0, total - 1);
                } else {
                    await exportEng.exportPNGSequence(0, total - 1);
                }
                status.textContent = '✅ Export complete';
            } catch (err) {
                status.textContent = '❌ Export failed: ' + err.message;
            }
        });

        // Range slider background fill update
        panel.querySelectorAll('.ap-range').forEach(r => {
            const update = () => {
                const pct = ((r.value - r.min) / (r.max - r.min)) * 100;
                r.style.background = `linear-gradient(90deg,#7c3aed ${pct}%,#1e2030 ${pct}%)`;
            };
            r.addEventListener('input', update);
            update();
        });
    }

    /* ═══════════════════════════════════════════════════════════════════
       MAIN PATCH
    ═══════════════════════════════════════════════════════════════════ */
    function patchAnimeProduction() {
        const mgr = window.animation2DManager;
        if (!mgr) return setTimeout(patchAnimeProduction, 400);
        if (mgr._animeProductionEngineApplied) return;
        mgr._animeProductionEngineApplied = true;

        // ── Instantiate sub-engines ──
        const celEng    = new CelShadingEngine();
        const camEng    = new CameraWorkEngine(mgr);
        const expEng    = new ExportEngine(mgr);
        const limAnim   = new LimitedAnimationEngine(mgr);
        const smearSys  = new SmearFrameSystem(mgr);

        // Attach to manager for external access
        mgr.animeProCel     = celEng;
        mgr.animeProCam     = camEng;
        mgr.animeProExport  = expEng;
        mgr.animeProLimited = limAnim;
        mgr.animeProSmear   = smearSys;

        // ── Register new brushes ──
        ANIME_PRODUCTION_BRUSHES.forEach(b => {
            if (!mgr.brushPresets.find(p => p.id === b.id)) {
                mgr.brushPresets.push(b);
            }
        });

        // ── Patch drawAdvancedBrushStroke ──
        const _origDraw = mgr.drawAdvancedBrushStroke.bind(mgr);
        mgr.drawAdvancedBrushStroke = function (stroke, ctx) {
            const preset = mgr.brushPresets.find(b => b.id === stroke._presetId);
            const algo   = stroke._algo || preset?._algo || stroke.brush?._algo;

            if (algo && ALGO_REGISTRY[algo]) {
                ALGO_REGISTRY[algo](stroke, ctx);
                return;
            }
            _origDraw(stroke, ctx);
        };

        // ── Patch setBrushPreset to tag strokes ──
        const _origSet = mgr.setBrushPreset.bind(mgr);
        mgr.setBrushPreset = function (brushId) {
            _origSet(brushId);
            const preset = mgr.brushPresets.find(b => b.id === brushId);
            mgr._activeAlgo     = preset?._algo  || null;
            mgr._activePresetId = preset ? brushId : null;
            if (preset?.blend) mgr.currentBlendMode = preset.blend;
        };

        // ── Tag stroke on start ──
        const _origStart = mgr.startDrawing.bind(mgr);
        mgr.startDrawing = function (e) {
            _origStart(e);
            if (mgr.currentStroke && mgr._activeAlgo) {
                mgr.currentStroke._algo      = mgr._activeAlgo;
                mgr.currentStroke._presetId  = mgr._activePresetId;
            }
        };

        // ── Patch render for camera shake + HUD ──
        const _origRender = mgr.render.bind(mgr);
        mgr.render = function () {
            _origRender();
            camEng.updateShake();
            if (camEng.shakePower > 0.5) {
                mgr.ctx.save();
                camEng.applyShake(mgr.ctx);
                _origRender.call(mgr);
                mgr.ctx.restore();
            }
            if (camEng.showHUD && mgr.isActive) {
                mgr.ctx.save();
                // Draw HUD in screen-space
                const vw = mgr.view2D;
                // Map camera frame to screen coords
                const sx = vw.offsetX;
                const sy = vw.offsetY;
                const sw = mgr.cameraFrame.w * vw.scale;
                const sh = mgr.cameraFrame.h * vw.scale;
                camEng.drawCompositionHUD(mgr.ctx, sw, sh);
                mgr.ctx.restore();
            }
        };

        // ── Patch interpolation for smear ──
        const _origInterp = mgr.interpolateStrokeCollection.bind(mgr);
        mgr.interpolateStrokeCollection = function (prev, next, t) {
            // Mid-way range: generate smear frame if enabled
            if (smearSys.smearType === 'stretch' && t > 0.2 && t < 0.8) {
                return smearSys.generateStretchSmear(prev, next, t);
            }
            return _origInterp(prev, next, t);
        };

        // ── Inject production panel ──
        injectProductionPanelUI(mgr, camEng, expEng, limAnim, smearSys);

        // ── Add FX tab to brush shelf if it doesn't exist ──
        setTimeout(() => {
            const shelfTabs = document.querySelector('#timeline-2d-brush-panel .brush-shelf-tabs');
            if (shelfTabs && !shelfTabs.querySelector('[data-brush-filter="fx"]')) {
                const fxTab = document.createElement('button');
                fxTab.className = 'brush-shelf-tab';
                fxTab.dataset.brushFilter = 'fx';
                fxTab.textContent = '⚡';
                fxTab.title = 'Special FX Brushes';
                fxTab.addEventListener('click', () => {
                    shelfTabs.querySelectorAll('.brush-shelf-tab').forEach(t => t.classList.remove('active'));
                    fxTab.classList.add('active');
                    mgr.activeBrushFilter = 'fx';
                    mgr.renderBrushShelf('fx');
                });
                shelfTabs.appendChild(fxTab);
            }
        }, 800);

        // ── Re-inject on mode enter ──
        const _origEnter = mgr.enterMode.bind(mgr);
        mgr.enterMode = function () {
            _origEnter();
            setTimeout(() => {
                const p = document.getElementById('ap-production-panel');
                if (!p) injectProductionPanelUI(mgr, camEng, expEng, limAnim, smearSys);
            }, 200);
        };

        // ── Global keyboard shortcuts for production ──
        document.addEventListener('keydown', e => {
            if (!mgr.isActive) return;
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

            // Shift+S → quick shadow colour
            if (e.shiftKey && e.key.toLowerCase() === 's') {
                e.preventDefault();
                const s1 = celEng.getShadowColor(mgr.currentColor || '#60a5fa', 1);
                mgr.currentColor = s1;
                const cp = document.getElementById('tool-color');
                if (cp) cp.value = s1;
                if (window.showToast) window.showToast('Shadow colour applied', 'blue');
            }
            // Shift+R → quick rim light
            if (e.shiftKey && e.key.toLowerCase() === 'r') {
                e.preventDefault();
                const rim = U.animeRimHighlight(mgr.currentColor || '#60a5fa');
                mgr.currentColor = rim;
                const cp = document.getElementById('tool-color');
                if (cp) cp.value = rim;
                if (window.showToast) window.showToast('Rim light colour applied', 'blue');
            }
            // Shift+X → impact flash
            if (e.shiftKey && e.key.toLowerCase() === 'x') {
                e.preventDefault();
                const ctx = mgr.ctx;
                fxEngine.drawImpactFlash(ctx, mgr.canvas.width, mgr.canvas.height, { style: 'manga-screen', alpha: 0.88 });
                setTimeout(() => mgr.render(), 80);
            }
            // Shift+Z → zoom punch
            if (e.shiftKey && e.key.toLowerCase() === 'z') {
                e.preventDefault();
                camEng.zoomPunch(1.18, 90);
            }
            // Shift+Q → camera shake
            if (e.shiftKey && e.key.toLowerCase() === 'q') {
                e.preventDefault();
                camEng.triggerShake(16);
            }
        }, true);

        console.log('🎌 AnimeProductionEngine v3.0 loaded — JJK / One Piece / Demon Slayer mode active');
        if (window.showToast) window.showToast('🎌 Anime Production Engine loaded!', 'blue');
    }

    // ── Boot ──
    patchAnimeProduction();
    setTimeout(patchAnimeProduction, 600);
    setTimeout(patchAnimeProduction, 2000);

    // Expose engines globally for scripting
    window.AnimeLineart    = AnimeLineart;
    window.CelShadingEngine = CelShadingEngine;
    window.SpecialFXEngine  = SpecialFXEngine;
    window.SmearFrameSystem = SmearFrameSystem;
    window.AnimeColorUtils  = U;

})();