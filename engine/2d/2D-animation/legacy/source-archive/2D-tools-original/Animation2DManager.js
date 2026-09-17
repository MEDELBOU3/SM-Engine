/**
 * Animation2DManager - Handles 2D Animation (Blender Grease Pencil style)
 * Integrates a 2D drawing canvas with the existing 3D timeline.
 */

class Animation2DManager {
    constructor() {
        this.container = document.getElementById('animation-2d-container');
        this.canvas = document.getElementById('animation-2d-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.toolbar = document.getElementById('animation-2d-toolbar');

        this.isActive = false;
        this.isDrawing = false;
        this.currentTool = 'pencil';
        this.currentColor = '#000000';
        this.currentSize = 12;
        this.currentStrength = 0.7;
        this.currentOpacity = 1;
        this.currentBlendMode = 'source-over';
        this.brushSettings = {
            radius: 12,
            strength: 0.7,
            spacing: 0.16,
            jitter: 0.04,
            hardness: 0.82,
            streamline: 0.5,
            taperStart: 0.03,
            taperEnd: 0.18
        };
        this.brushPresets = [
            { id: 'pencil_hb', name: 'HB', icon: 'HB', category: 'draw', radius: 8, strength: 0.78, spacing: 0.14, jitter: 0.02, hardness: 0.9, streamline: 0.45, taperStart: 0.02, taperEnd: 0.16 },
            { id: 'ink_pen', name: 'Ink', icon: 'INK', thumb: 'assets/brushes/ink-brush.png', category: 'draw', radius: 5, strength: 0.95, spacing: 0.08, jitter: 0.01, hardness: 0.98, streamline: 0.75, taperStart: 0.08, taperEnd: 0.3 },
            { id: 'marker_soft', name: 'Marker', icon: 'M', thumb: 'assets/brushes/marker-brush.png', category: 'draw', radius: 16, strength: 0.65, spacing: 0.22, jitter: 0.05, hardness: 0.55, streamline: 0.35, taperStart: 0.0, taperEnd: 0.0 },
            { id: 'calligraphy', name: 'Callig', icon: 'S', thumb: 'assets/brushes/callig.png', category: 'draw', radius: 13, strength: 0.85, spacing: 0.12, jitter: 0.01, hardness: 0.92, streamline: 0.6, taperStart: 0.06, taperEnd: 0.26 },
            { id: 'hatch', name: 'Hatch', icon: '///', thumb: 'assets/brushes/hatch-brush.png', category: 'draw', radius: 4, strength: 0.72, spacing: 0.32, jitter: 0.03, hardness: 0.95, streamline: 0.4, taperStart: 0.0, taperEnd: 0.1 },
            { id: 'spray', name: 'Spray', icon: 'SP', thumb: 'assets/brushes/spray-brush.png', category: 'draw', radius: 20, strength: 0.5, spacing: 0.08, jitter: 0.1, hardness: 0.4, streamline: 0.25, taperStart: 0.0, taperEnd: 0.0, forceTool: 'spray' },
            { id: 'smudge_soft', name: 'Soft', icon: '~', thumb: 'assets/brushes/soft-brush.png', category: 'utility', radius: 20, strength: 0.35, spacing: 0.24, jitter: 0.08, hardness: 0.25, streamline: 0.2, taperStart: 0.0, taperEnd: 0.0 },
            { id: 'eraser_hard', name: 'Erase', icon: 'E', thumb: 'assets/brushes/erase-brush.png', category: 'erase', radius: 18, strength: 1, spacing: 0.18, jitter: 0.0, hardness: 0.98, streamline: 0.55, taperStart: 0.0, taperEnd: 0.0, forceTool: 'eraser' },
            { id: 'eraser_soft', name: 'E-Soft', icon: 'ES', thumb: 'assets/brushes/e-soft-brush.png', category: 'erase', radius: 26, strength: 0.7, spacing: 0.2, jitter: 0.02, hardness: 0.45, streamline: 0.35, taperStart: 0.0, taperEnd: 0.0, forceTool: 'eraser' },
            { id: 'fill_util', name: 'Fill', icon: 'F', thumb: 'assets/brushes/fill.png', category: 'utility', radius: 12, strength: 1, spacing: 0.1, jitter: 0.0, hardness: 1.0, streamline: 0.5, taperStart: 0.0, taperEnd: 0.0, forceTool: 'fill' }
        ];
        this.activeBrushPreset = this.brushPresets[0];
        this.activeBrushFilter = 'all';
        this.referenceImage = null;
        this.referenceImageOpacity = 0.45;
        this.referenceFitMode = 'fit';
        this.frameClipboard = null;
        this.layers = [{ id: 'layer_0', name: 'Layer 1', visible: true, locked: false, opacity: 1, blend: 'source-over' }];
        this.currentLayerId = 'layer_0';
        this.symmetryXEnabled = false;
        this.stabilizerEnabled = true;

        this.strokes = []; // Current strokes on the current frame
        this.currentStroke = null;
        this.keyframes = new Map(); // frameIndex -> strokes array

        this.onionSkinning = true;
        this.onionSkinPrev = 1;
        this.onionSkinNext = 1;
        this.onionSkinAlpha = 0.35;
        this.onionSkinPrevColor = '#00ff88';
        this.onionSkinNextColor = '#4a9eff';
        this.savedViewportState = {
            controls: null,
            sceneBackground: null,
            hiddenHelpers: [],
            rendererCanvasVisibility: ''
        };
        this.lastFrameIndex = -1;
        this.isNavigationOverride = false;
        this.isSpacePressed = false;
        this.view2D = {
            scale: 1,
            minScale: 0.2,
            maxScale: 12,
            offsetX: 0,
            offsetY: 0,
            rotation: 0,
            isPanning: false,
            panLastX: 0,
            panLastY: 0
        };

        // 2D camera & scene moves: keyframed pan/zoom/rotation across the scene
        this.camera2D = { x: 0, y: 0, zoom: 1, rotation: 0 };
        this.cameraKeyframes = new Map(); // frameIndex -> {x, y, zoom, rotation}
        this.cameraTrackVisible = true;
        this.isCameraPanning = false;

        this.setupListeners();
        this.initTimelineBrushPanel();
        this.syncBrushControls();
        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    /**
     * Hook: when true, the live 3D viewport stays visible behind the transparent
     * 2D canvas (anime production "3D underlay" workflow) instead of switching to
     * a clean white canvas + front camera.
     */
    _use3DUnderlay() {
        return false;
    }

    init() {
        // This will be called from outside to initialize the manager if needed
    }

    setupListeners() {
        // Tool buttons
        const tools = ['pencil', 'select', 'eraser', 'line', 'spray', 'rect', 'circle', 'fill', 'camera'];
        tools.forEach(tool => {
            const btn = document.getElementById(`tool-${tool}`);
            if (btn) {
                btn.classList.add('tool-btn', 'tool-btn-2d');
                btn.addEventListener('click', () => this.setTool(tool));
            }
        });

        // Color picker
        const colorPicker = document.getElementById('tool-color');
        if (colorPicker) {
            colorPicker.value = this.currentColor;
            colorPicker.addEventListener('input', (e) => {
                this.currentColor = e.target.value;
            });
        }

        // Size picker
        const sizePicker = document.getElementById('tool-size');
        if (sizePicker) {
            sizePicker.value = this.currentSize;
            sizePicker.addEventListener('input', (e) => {
                this.currentSize = parseInt(e.target.value);
                this.brushSettings.radius = this.currentSize;
                this.syncBrushControls();
            });
        }

        // Mouse events for drawing
        this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
        this.canvas.addEventListener('mouseup', (e) => this.onMouseUp(e));
        this.canvas.addEventListener('mouseleave', (e) => this.onMouseUp(e));
        this.canvas.addEventListener('wheel', (e) => this.onMouseWheel(e), { passive: false });
        this.canvas.addEventListener('contextmenu', (e) => {
            if (this.isActive) e.preventDefault();
        });
        this.canvas.addEventListener('dragover', (e) => {
            e.preventDefault();
        });
        this.canvas.addEventListener('drop', (e) => {
            e.preventDefault();
            const file = e.dataTransfer?.files?.[0];
            if (file && file.type.startsWith('image/')) this.loadReferenceImage(file);
        });

        // Listen for frame changes from the timeline
        window.addEventListener('timeUpdate', () => this.onTimeUpdate());

        // Blender-like quick tool switching
        document.addEventListener('keydown', (e) => {
            if (!this.isActive) return;
            const targetTag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
            const isTyping = targetTag === 'input' || targetTag === 'textarea' || e.target?.isContentEditable;
            if (isTyping) return;

            if (e.key === 'Alt') {
                this.setNavigationOverride(true);
                return;
            }
            if (e.code === 'Space') {
                this.isSpacePressed = true;
                e.preventDefault();
                this.canvas.style.cursor = 'grab';
                return;
            }

            const key = e.key.toLowerCase();
            const hotkeys = {
                p: 'pencil',
                e: 'eraser',
                l: 'line',
                y: 'spray',
                r: 'rect',
                c: 'circle',
                f: 'fill',
                v: 'camera'
            };
            const tool = hotkeys[key];
            if (tool) {
                e.preventDefault();
                this.setTool(tool);
            }
            if (key === 'escape') {
                e.preventDefault();
                this.exitMode();
            }
            if (key === '0') {
                e.preventDefault();
                this.resetCanvasView();
            }
        });

        document.addEventListener('keyup', (e) => {
            if (!this.isActive) return;
            if (e.key === 'Alt') this.setNavigationOverride(false);
            if (e.code === 'Space') {
                this.isSpacePressed = false;
                if (!this.view2D.isPanning) this.canvas.style.cursor = 'crosshair';
            }
        });

        const addKeyBtn = document.getElementById('add-keyframe');
        if (addKeyBtn) {
            addKeyBtn.addEventListener('click', () => {
                if (!this.isActive) return;
                this.saveKeyframe();
            });
        }

        const delKeyBtn = document.getElementById('delete-keyframe');
        if (delKeyBtn) {
            delKeyBtn.addEventListener('click', () => {
                if (!this.isActive) return;
                this.deleteCurrentFrameKeyframe();
            });
        }

        // ── NEW: Brush HUD panel toggle ──────────────────────────────
        const hudBtn = document.getElementById('tool-brush-hud');
        const brushHud = document.getElementById('d2-brush-hud');
        if (hudBtn && brushHud) {
            hudBtn.addEventListener('click', () => {
                const open = brushHud.classList.toggle('visible');
                hudBtn.classList.toggle('active', open);
            });
        }

        // ── NEW: Symmetry toolbar button ──────────────────────────────
        const symBtn = document.getElementById('tool-symmetry');
        const symLine = document.getElementById('d2-symmetry-line');
        if (symBtn) {
            symBtn.addEventListener('click', () => {
                this.symmetryXEnabled = !this.symmetryXEnabled;
                symBtn.classList.toggle('active', this.symmetryXEnabled);
                if (symLine) symLine.classList.toggle('active', this.symmetryXEnabled);
                const symChk = document.getElementById('brush-symmetry-x-toggle');
                if (symChk) symChk.checked = this.symmetryXEnabled;
            });
        }

        // ── NEW: Cursor ring follows mouse and scales with brush size ─
        const cursorRing = document.getElementById('d2-cursor-ring');
        if (cursorRing && this.canvas) {
            this.canvas.addEventListener('mousemove', (ev) => {
                if (!this.isActive) return;
                const sz = this.brushSettings.radius * this.view2D.scale * 2;
                cursorRing.style.width  = `${sz}px`;
                cursorRing.style.height = `${sz}px`;
                cursorRing.style.left   = `${ev.clientX}px`;
                cursorRing.style.top    = `${ev.clientY}px`;
            });
            this.canvas.addEventListener('mouseleave', () => {
                cursorRing.style.display = 'none';
            });
            this.canvas.addEventListener('mouseenter', () => {
                if (this.isActive) cursorRing.style.display = 'block';
            });
        }

        // ── NEW: Hardness HUD slider ──────────────────────────────────
        const hardnessSlider = document.getElementById('brush-hardness-slider-2d');
        if (hardnessSlider) {
            hardnessSlider.addEventListener('input', (e) => {
                this.brushSettings.hardness = parseFloat(e.target.value);
            });
        }

        // ── NEW: Streamline HUD slider ────────────────────────────────
        const streamSlider = document.getElementById('brush-stream-slider-2d');
        if (streamSlider) {
            streamSlider.addEventListener('input', (e) => {
                this.brushSettings.streamline = parseFloat(e.target.value);
            });
        }

        // ── NEW: Opacity HUD slider ───────────────────────────────────
        const opacitySlider = document.getElementById('brush-opacity-slider-2d');
        if (opacitySlider) {
            opacitySlider.addEventListener('input', (e) => {
                this.currentOpacity = parseFloat(e.target.value);
            });
        }

        // ── NEW: Blend Mode select (HUD) ──────────────────────────────
        const blendSelect = document.getElementById('brush-blend-mode');
        if (blendSelect) {
            blendSelect.addEventListener('change', (e) => {
                this.currentBlendMode = e.target.value;
            });
        }

        this.bindBrushPanelControls();
    }


    initTimelineBrushPanel() {
        const strip = document.getElementById('brush-shelf-strip');
        if (!strip) return;
        this.renderBrushShelf(this.activeBrushFilter);
    }

    bindBrushPanelControls() {
        const tabs = document.querySelectorAll('#timeline-2d-brush-panel .brush-shelf-tab');
        tabs.forEach((tab) => {
            tab.addEventListener('click', () => {
                tabs.forEach((t) => t.classList.remove('active'));
                tab.classList.add('active');
                this.activeBrushFilter = tab.dataset.brushFilter || 'all';
                this.renderBrushShelf(this.activeBrushFilter);
            });
        });

        const bindRange = (id, key, parse = parseFloat) => {
            const el = document.getElementById(id);
            if (!el) return;
            el.addEventListener('input', (e) => {
                const nextValue = parse(e.target.value);
                if (key === 'opacity') {
                    this.currentOpacity = nextValue;
                } else {
                    this.brushSettings[key] = nextValue;
                }
                if (key === 'radius') {
                    this.currentSize = this.brushSettings.radius;
                    const sizeInput = document.getElementById('tool-size');
                    if (sizeInput) sizeInput.value = Math.round(this.currentSize);
                }
                if (key === 'strength') {
                    this.currentStrength = this.brushSettings.strength;
                }
            });
        };

        bindRange('brush-radius-slider-2d', 'radius');
        bindRange('brush-strength-slider-2d', 'strength');
        bindRange('brush-spacing-slider-2d', 'spacing');
        bindRange('brush-jitter-slider-2d', 'jitter');
        bindRange('brush-hardness-slider-2d', 'hardness');
        bindRange('brush-opacity-slider-2d', 'opacity');

        const blendSelect = document.getElementById('brush-blend-select-2d');
        if (blendSelect) {
            blendSelect.addEventListener('change', (e) => {
                this.currentBlendMode = e.target.value || 'source-over';
            });
        }

        const refOpacity = document.getElementById('brush-ref-opacity-slider');
        if (refOpacity) {
            refOpacity.addEventListener('input', (e) => {
                this.referenceImageOpacity = parseFloat(e.target.value);
                this.render();
            });
        }

        const onionPrev = document.getElementById('brush-onion-prev-slider');
        if (onionPrev) {
            onionPrev.addEventListener('input', (e) => {
                this.onionSkinPrev = parseInt(e.target.value, 10);
                this.render();
            });
        }

        const onionNext = document.getElementById('brush-onion-next-slider');
        if (onionNext) {
            onionNext.addEventListener('input', (e) => {
                this.onionSkinNext = parseInt(e.target.value, 10);
                this.render();
            });
        }

        const importBtn = document.getElementById('brush-import-image-btn');
        const clearBtn = document.getElementById('brush-clear-image-btn');
        const fitBtn = document.getElementById('brush-toggle-fit-btn');
        const fileInput = document.getElementById('brush-ref-image-input');

        if (importBtn && fileInput) {
            importBtn.addEventListener('click', () => fileInput.click());
            fileInput.addEventListener('change', (e) => {
                const file = e.target.files?.[0];
                if (file && file.type.startsWith('image/')) this.loadReferenceImage(file);
            });
        }

        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                this.referenceImage = null;
                this.render();
            });
        }

        if (fitBtn) {
            fitBtn.addEventListener('click', () => {
                const modes = ['fit', 'fill', 'actual'];
                const nextIndex = (modes.indexOf(this.referenceFitMode) + 1) % modes.length;
                this.referenceFitMode = modes[nextIndex];
                fitBtn.title = `Image Fit: ${this.referenceFitMode}`;
                this.render();
            });
        }

        const layerSelect = document.getElementById('brush-layer-select');
        const addLayerBtn = document.getElementById('brush-layer-add-btn');
        const removeLayerBtn = document.getElementById('brush-layer-remove-btn');
        const layerVisible = document.getElementById('brush-layer-visible-toggle');
        const layerLock = document.getElementById('brush-layer-lock-toggle');

        if (layerSelect) {
            layerSelect.addEventListener('change', (e) => {
                this.currentLayerId = e.target.value;
                this.syncLayerControls();
            });
        }

        if (addLayerBtn) addLayerBtn.addEventListener('click', () => this.addLayer());
        if (removeLayerBtn) removeLayerBtn.addEventListener('click', () => this.removeCurrentLayer());

        if (layerVisible) {
            layerVisible.addEventListener('change', (e) => {
                const layer = this.getCurrentLayer();
                if (!layer) return;
                layer.visible = e.target.checked;
                this.render();
            });
        }

        if (layerLock) {
            layerLock.addEventListener('change', (e) => {
                const layer = this.getCurrentLayer();
                if (!layer) return;
                layer.locked = e.target.checked;
            });
        }

        const copyFrameBtn = document.getElementById('brush-frame-copy-btn');
        const pasteFrameBtn = document.getElementById('brush-frame-paste-btn');
        const dupFrameBtn = document.getElementById('brush-frame-dup-next-btn');
        const clearFrameBtn = document.getElementById('brush-frame-clear-btn');

        if (copyFrameBtn) copyFrameBtn.addEventListener('click', () => this.copyCurrentFrame());
        if (pasteFrameBtn) pasteFrameBtn.addEventListener('click', () => this.pasteCurrentFrame());
        if (dupFrameBtn) dupFrameBtn.addEventListener('click', () => this.duplicateFrameToNext());
        if (clearFrameBtn) clearFrameBtn.addEventListener('click', () => this.clearCurrentFrame());

        const symmetryToggle = document.getElementById('brush-symmetry-x-toggle');
        if (symmetryToggle) {
            symmetryToggle.addEventListener('change', (e) => {
                this.symmetryXEnabled = e.target.checked;
            });
        }

        const stabilizerToggle = document.getElementById('brush-stabilizer-toggle');
        if (stabilizerToggle) {
            stabilizerToggle.addEventListener('change', (e) => {
                this.stabilizerEnabled = e.target.checked;
            });
        }

        this.refreshLayerSelect();
        this.syncLayerControls();
    }

    getCurrentLayer() {
        return this.layers.find((l) => l.id === this.currentLayerId) || null;
    }

    addLayer() {
        const id = `layer_${Date.now()}`;
        const layer = {
            id,
            name: `Layer ${this.layers.length + 1}`,
            visible: true,
            locked: false,
            opacity: 1,
            blend: 'source-over'
        };
        this.layers.push(layer);
        this.currentLayerId = id;
        this.refreshLayerSelect();
        this.syncLayerControls();
    }

    removeCurrentLayer() {
        if (this.layers.length <= 1) return;
        const idx = this.layers.findIndex((l) => l.id === this.currentLayerId);
        if (idx === -1) return;
        const removedId = this.layers[idx].id;
        this.layers.splice(idx, 1);
        this.currentLayerId = this.layers[Math.max(0, idx - 1)].id;
        this.keyframes.forEach((strokes, frame) => {
            const filtered = (strokes || []).filter((s) => s.layerId !== removedId);
            this.keyframes.set(frame, filtered);
        });
        this.strokes = this.keyframes.get(this.getCurrentFrameIndex()) || [];
        this.refreshLayerSelect();
        this.syncLayerControls();
        this.render();
    }

    refreshLayerSelect() {
        const layerSelect = document.getElementById('brush-layer-select');
        if (!layerSelect) return;
        layerSelect.innerHTML = '';
        this.layers.forEach((layer) => {
            const opt = document.createElement('option');
            opt.value = layer.id;
            opt.textContent = layer.name;
            layerSelect.appendChild(opt);
        });
        layerSelect.value = this.currentLayerId;
    }

    syncLayerControls() {
        const layer = this.getCurrentLayer();
        if (!layer) return;
        const layerVisible = document.getElementById('brush-layer-visible-toggle');
        const layerLock = document.getElementById('brush-layer-lock-toggle');
        if (layerVisible) layerVisible.checked = !!layer.visible;
        if (layerLock) layerLock.checked = !!layer.locked;
    }

    copyCurrentFrame() {
        const frameIndex = this.getCurrentFrameIndex();
        this.frameClipboard = JSON.parse(JSON.stringify(this.keyframes.get(frameIndex) || []));
    }

    pasteCurrentFrame() {
        if (!this.frameClipboard) return;
        const frameIndex = this.getCurrentFrameIndex();
        const copy = JSON.parse(JSON.stringify(this.frameClipboard));
        this.keyframes.set(frameIndex, copy);
        this.strokes = copy;
        this.syncTimelineMarkers();
        this.render();
    }

    duplicateFrameToNext() {
        const frameIndex = this.getCurrentFrameIndex();
        const src = this.keyframes.get(frameIndex) || [];
        this.keyframes.set(frameIndex + 1, JSON.parse(JSON.stringify(src)));
        this.syncTimelineMarkers();
    }

    clearCurrentFrame() {
        const frameIndex = this.getCurrentFrameIndex();
        this.keyframes.delete(frameIndex);
        this.strokes = [];
        this.syncTimelineMarkers();
        this.render();
    }

    renderBrushShelf(filter = 'all') {
        const strip = document.getElementById('brush-shelf-strip');
        if (!strip) return;
        strip.innerHTML = '';

        this.brushPresets
            .filter((b) => filter === 'all' || b.category === filter)
            .forEach((brush) => {
                const item = document.createElement('button');
                item.className = 'brush-shelf-item';
                if (this.activeBrushPreset && this.activeBrushPreset.id === brush.id) item.classList.add('active');
                item.dataset.brushId = brush.id;
                const safeIcon = brush.icon || brush.name?.slice(0, 2) || 'B';
                const thumbMarkup = brush.thumb
                    ? `<img class="brush-thumb-img" src="${brush.thumb}" alt="${brush.name}" onerror="this.style.display='none'; this.parentElement.classList.remove('has-thumb'); this.parentElement.classList.add('thumb-missing');">`
                    : '';
                if (brush.thumb) item.classList.add('has-thumb');
                item.innerHTML = `${thumbMarkup}<span class="brush-fallback">${safeIcon}</span>`;
                item.title = `${brush.name} Brush`;
                item.addEventListener('click', () => this.setBrushPreset(brush.id));
                strip.appendChild(item);
            });
    }

    setBrushPreset(brushId) {
        const preset = this.brushPresets.find((b) => b.id === brushId);
        if (!preset) return;
        this.activeBrushPreset = preset;

        this.brushSettings.radius = preset.radius;
        this.brushSettings.strength = preset.strength;
        this.brushSettings.spacing = preset.spacing;
        this.brushSettings.jitter = preset.jitter;
        this.brushSettings.hardness = preset.hardness;
        this.brushSettings.streamline = preset.streamline;
        this.brushSettings.taperStart = preset.taperStart;
        this.brushSettings.taperEnd = preset.taperEnd;

        this.currentSize = preset.radius;
        this.currentStrength = preset.strength;

        if (preset.forceTool) {
            this.setTool(preset.forceTool);
        } else if (preset.category === 'erase') {
            this.setTool('eraser');
        } else {
            // Draw/utility presets (including soft brush) should remain paintable.
            this.setTool('pencil');
        }
        this.renderBrushShelf(this.activeBrushFilter);
        this.syncBrushControls();
    }

    syncBrushControls() {
        const setValue = (id, value) => {
            const el = document.getElementById(id);
            if (el) el.value = value;
        };
        const setText = (id, text) => {
            const el = document.getElementById(id);
            if (el) el.textContent = text;
        };
        setValue('brush-radius-slider-2d', this.brushSettings.radius);
        setValue('brush-strength-slider-2d', this.brushSettings.strength);
        setValue('brush-spacing-slider-2d', this.brushSettings.spacing);
        setValue('brush-jitter-slider-2d', this.brushSettings.jitter);
        setValue('brush-hardness-slider-2d', this.brushSettings.hardness);
        setValue('brush-stream-slider-2d', this.brushSettings.streamline);
        setValue('brush-opacity-slider-2d', this.currentOpacity);
        setValue('brush-ref-opacity-slider', this.referenceImageOpacity);
        setValue('brush-onion-prev-slider', this.onionSkinPrev);
        setValue('brush-onion-next-slider', this.onionSkinNext);
        const sizeInput = document.getElementById('tool-size');
        if (sizeInput) sizeInput.value = Math.round(this.currentSize);
        const blendSelect = document.getElementById('brush-blend-select-2d');
        if (blendSelect) blendSelect.value = this.currentBlendMode;
        const blendSelectHud = document.getElementById('brush-blend-mode');
        if (blendSelectHud) blendSelectHud.value = this.currentBlendMode;
        const sym = document.getElementById('brush-symmetry-x-toggle');
        if (sym) sym.checked = this.symmetryXEnabled;
        const stab = document.getElementById('brush-stabilizer-toggle');
        if (stab) stab.checked = this.stabilizerEnabled;
        // Sync HUD value labels
        setText('d2-hud-radius-val',   Math.round(this.brushSettings.radius));
        setText('d2-hud-strength-val', Math.round(this.brushSettings.strength * 100) + '%');
        setText('d2-hud-opacity-val',  Math.round(this.currentOpacity * 100) + '%');
        setText('d2-hud-spacing-val',  Math.round(this.brushSettings.spacing * 100) + '%');
        setText('d2-hud-hardness-val', Math.round(this.brushSettings.hardness * 100) + '%');
        setText('d2-hud-stream-val',   Math.round(this.brushSettings.streamline * 100) + '%');
        // Sync HUD brush name
        if (this.activeBrushPreset) {
            const nameEl = document.getElementById('d2-hud-brush-name');
            if (nameEl) nameEl.textContent = this.activeBrushPreset.name;
        }
    }


    getActiveBrushConfig() {
        return {
            radius: this.brushSettings.radius,
            strength: this.brushSettings.strength,
            spacing: this.brushSettings.spacing,
            jitter: this.brushSettings.jitter,
            hardness: this.brushSettings.hardness,
            streamline: this.brushSettings.streamline,
            taperStart: this.brushSettings.taperStart,
            taperEnd: this.brushSettings.taperEnd,
            opacity: this.currentOpacity,
            blend: this.currentBlendMode
        };
    }

    setTool(tool) {
        this.currentTool = tool;
        document.querySelectorAll('#animation-2d-toolbar .st-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        const toolBtn = document.getElementById(`tool-${tool}`);
        if (toolBtn) toolBtn.classList.add('active');
    }

    resize() {
        const rect = this.canvas.parentElement.getBoundingClientRect();
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;
        this.render();
    }

    getMousePos(e) {
        const rect = this.canvas.getBoundingClientRect();
        const xScreen = e.clientX - rect.left;
        const yScreen = e.clientY - rect.top;
        return this._inverseViewTransform(xScreen, yScreen);
    }

    /** Apply the 2D view transform (scale + rotation + pan) to the context */
    _applyViewTransform(ctx) {
        const { scale, rotation, offsetX, offsetY } = this.view2D;
        const cos = Math.cos(rotation);
        const sin = Math.sin(rotation);
        ctx.setTransform(scale * cos, scale * sin, -scale * sin, scale * cos, offsetX, offsetY);
    }

    /** Map a screen point to world coordinates (inverse of _applyViewTransform) */
    _inverseViewTransform(xScreen, yScreen) {
        const { scale, rotation, offsetX, offsetY } = this.view2D;
        const dx = xScreen - offsetX;
        const dy = yScreen - offsetY;
        const cos = Math.cos(rotation);
        const sin = Math.sin(rotation);
        return {
            x: (dx * cos + dy * sin) / scale,
            y: (-dx * sin + dy * cos) / scale
        };
    }

    onMouseDown(e) {
        if (!this.isActive) return;
        if (this.shouldPan(e)) {
            this.startPanning(e);
            return;
        }
        if (this.currentTool === 'camera') {
            this.startCameraPan(e);
            return;
        }
        this.startDrawing(e);
    }

    onMouseMove(e) {
        if (!this.isActive) return;
        if (this.view2D.isPanning) {
            this.panView(e);
            return;
        }
        if (this.isCameraPanning) {
            this.panCamera(e);
            return;
        }
        this.draw(e);
    }

    onMouseUp(e) {
        if (!this.isActive) return;
        if (this.view2D.isPanning) {
            this.stopPanning(e);
            return;
        }
        if (this.isCameraPanning) {
            this.stopCameraPan();
            return;
        }
        this.stopDrawing();
    }

    onMouseWheel(e) {
        if (!this.isActive) return;
        e.preventDefault();

        if (this.currentTool === 'camera') {
            this.zoomCamera(e);
            return;
        }

        const rect = this.canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;

        const prevScale = this.view2D.scale;
        const zoomFactor = e.deltaY < 0 ? 1.12 : 0.89;
        const nextScale = Math.max(this.view2D.minScale, Math.min(this.view2D.maxScale, prevScale * zoomFactor));
        if (Math.abs(nextScale - prevScale) < 1e-6) return;

        const worldX = (sx - this.view2D.offsetX) / prevScale;
        const worldY = (sy - this.view2D.offsetY) / prevScale;

        this.view2D.scale = nextScale;
        this.view2D.offsetX = sx - worldX * nextScale;
        this.view2D.offsetY = sy - worldY * nextScale;
        this.render();
    }

    shouldPan(e) {
        return this.isSpacePressed || e.button === 1 || e.button === 2 || e.shiftKey;
    }

    startPanning(e) {
        this.view2D.isPanning = true;
        this.view2D.panLastX = e.clientX;
        this.view2D.panLastY = e.clientY;
        this.stopDrawing();
        this.canvas.style.cursor = 'grabbing';
    }

    panView(e) {
        const dx = e.clientX - this.view2D.panLastX;
        const dy = e.clientY - this.view2D.panLastY;
        this.view2D.panLastX = e.clientX;
        this.view2D.panLastY = e.clientY;
        this.view2D.offsetX += dx;
        this.view2D.offsetY += dy;
        this.render();
    }

    stopPanning() {
        this.view2D.isPanning = false;
        this.canvas.style.cursor = this.isSpacePressed ? 'grab' : 'crosshair';
    }

    resetCanvasView() {
        if (this.currentTool === 'camera') {
            this.camera2D = { x: 0, y: 0, zoom: 1, rotation: 0 };
            this._syncViewFromCamera();
        } else {
            this.view2D.scale = 1;
            this.view2D.offsetX = 0;
            this.view2D.offsetY = 0;
            this.view2D.rotation = 0;
        }
        this.render();
    }

    // ==================== 2D CAMERA & SCENE MOVES ====================

    /** Derive the view transform from the 2D camera (center-based, rotation-aware) */
    _syncViewFromCamera(cam) {
        const c = cam || this.camera2D;
        const W = this.canvas.width;
        const H = this.canvas.height;
        this.view2D.scale = c.zoom;
        this.view2D.rotation = c.rotation;
        this.view2D.offsetX = W / 2 - c.x * c.zoom;
        this.view2D.offsetY = H / 2 - c.y * c.zoom;
    }

    /** Evaluate the interpolated camera at a given frame (easeInOut between keyframes) */
    _evaluateCameraAt(frame) {
        const kfs = [...this.cameraKeyframes.entries()].sort((a, b) => a[0] - b[0]);
        if (!kfs.length) return null;
        if (frame <= kfs[0][0]) return kfs[0][1];
        if (frame >= kfs[kfs.length - 1][0]) return kfs[kfs.length - 1][1];

        for (let i = 0; i < kfs.length - 1; i++) {
            const [f0, c0] = kfs[i];
            const [f1, c1] = kfs[i + 1];
            if (f0 <= frame && frame <= f1) {
                const t = (frame - f0) / (f1 - f0);
                const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
                return {
                    x: c0.x + (c1.x - c0.x) * ease,
                    y: c0.y + (c1.y - c0.y) * ease,
                    zoom: c0.zoom + (c1.zoom - c0.zoom) * ease,
                    rotation: c0.rotation + (c1.rotation - c0.rotation) * ease
                };
            }
        }
        return null;
    }

    /** Camera state that should drive the view right now (keyframed during playback) */
    _currentCameraState() {
        if (this.cameraKeyframes.size && !this.isCameraPanning) {
            return this._evaluateCameraAt(this.getCurrentFrameIndex()) || this.camera2D;
        }
        return this.camera2D;
    }

    _isPlaybackActive() {
        return !!(window.SMTimeline && window.SMTimeline.isPlaying) || !!(window.isPlaying);
    }

    startCameraPan(e) {
        this.isCameraPanning = true;
        this.cameraPanLastX = e.clientX;
        this.cameraPanLastY = e.clientY;
        this.canvas.style.cursor = 'grabbing';
    }

    panCamera(e) {
        const dx = e.clientX - this.cameraPanLastX;
        const dy = e.clientY - this.cameraPanLastY;
        this.cameraPanLastX = e.clientX;
        this.cameraPanLastY = e.clientY;
        this.camera2D.x -= dx / this.camera2D.zoom;
        this.camera2D.y -= dy / this.camera2D.zoom;
        this._syncViewFromCamera();
        this.render();
    }

    stopCameraPan() {
        this.isCameraPanning = false;
        this.canvas.style.cursor = this.isSpacePressed ? 'grab' : 'crosshair';
    }

    zoomCamera(e) {
        const rect = this.canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const W = this.canvas.width;
        const H = this.canvas.height;
        const prev = this.camera2D.zoom;
        const next = Math.max(0.1, Math.min(20, prev * (e.deltaY < 0 ? 1.1 : 0.9)));
        if (Math.abs(next - prev) < 1e-6) return;

        const wx = (sx - W / 2) / prev + this.camera2D.x;
        const wy = (sy - H / 2) / prev + this.camera2D.y;
        this.camera2D.zoom = next;
        this.camera2D.x = wx - (sx - W / 2) / next;
        this.camera2D.y = wy - (sy - H / 2) / next;
        this._syncViewFromCamera();
        this.render();
    }

    insertCameraKeyframe() {
        this.cameraKeyframes.set(this.getCurrentFrameIndex(), { ...this.camera2D });
        this.updateTimelineUI();
        this.syncTimelineMarkers();
        this.render();
    }

    deleteCameraKeyframeAtCurrent() {
        this.cameraKeyframes.delete(this.getCurrentFrameIndex());
        this.updateTimelineUI();
        this.syncTimelineMarkers();
        this.render();
    }

    clearCameraKeyframes() {
        this.cameraKeyframes.clear();
        this.render();
    }

    // ==================== EXPORT (VIDEO / PNG SEQUENCE) ====================

    /** Frame indices to render for export */
    _getExportFrameRange(durationMode = 'lastKey') {
        const maxKf = Math.max(0, ...[...this.keyframes.keys()], ...[...this.cameraKeyframes.keys()]);
        const state = this.getTimelineState();
        const durationFrames = Math.round(state.timelineDuration * state.fps);
        const end = durationMode === 'timeline'
            ? Math.max(maxKf, durationFrames)
            : Math.max(maxKf, 24);
        const out = [];
        for (let f = 0; f <= end; f++) out.push(f);
        return out;
    }

    /** Resolve hold-frame references to their source drawing */
    _resolveFrameData(frame) {
        let data = this.keyframes.get(frame);
        if (data && data._isHoldFrame && data._sourceFrame !== undefined) {
            data = this.keyframes.get(data._sourceFrame);
        }
        return data;
    }

    /** Render one animation frame (strokes + camera) onto a target canvas */
    _renderExportFrame(target, frame, background = 'white') {
        const ctx = target.getContext('2d');
        const W = target.width;
        const H = target.height;

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, W, H);
        if (background && background !== 'transparent') {
            ctx.fillStyle = background;
            ctx.fillRect(0, 0, W, H);
        }

        const cam = this._evaluateCameraAt(frame) || this.camera2D;
        const scale = cam.zoom;
        const cos = Math.cos(cam.rotation);
        const sin = Math.sin(cam.rotation);
        ctx.setTransform(
            scale * cos, scale * sin,
            -scale * sin, scale * cos,
            W / 2 - cam.x * scale, H / 2 - cam.y * scale
        );

        const strokes = this._resolveFrameData(frame);
        this.renderStrokeCollection(strokes || [], ctx);
    }

    _downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);
    }

    /** Render the animation to a WebM video (real-time MediaRecorder capture) */
    async exportVideo2D({ fps = 24, scale = 1, background = 'white', durationMode = 'lastKey', onProgress } = {}) {
        if (!this.keyframes.size && !this.cameraKeyframes.size) {
            alert('Nothing to export — draw some frames first.');
            return;
        }

        const W = Math.max(64, Math.round(this.canvas.width * scale));
        const H = Math.max(64, Math.round(this.canvas.height * scale));
        const exportCanvas = document.createElement('canvas');
        exportCanvas.width = W;
        exportCanvas.height = H;

        const frames = this._getExportFrameRange(durationMode);
        const stream = exportCanvas.captureStream(fps);
        const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
            ? 'video/webm;codecs=vp9'
            : MediaRecorder.isTypeSupported('video/webm')
                ? 'video/webm'
                : '';
        const rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 12_000_000 } : undefined);
        const chunks = [];
        rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
        const done = new Promise((resolve) => {
            rec.onstop = () => resolve(new Blob(chunks, { type: mime || 'video/webm' }));
        });

        rec.start();
        const track = stream.getVideoTracks()[0];
        const delay = 1000 / fps;

        for (let i = 0; i < frames.length; i++) {
            this._renderExportFrame(exportCanvas, frames[i], background);
            track.requestFrame();
            onProgress?.((i + 1) / frames.length);
            await new Promise((r) => setTimeout(r, delay));
        }

        rec.stop();
        const blob = await done;
        this._downloadBlob(blob, `2d-animation-${Date.now()}.webm`);
        onProgress?.(1);
    }

    /** Render the animation to a ZIP of PNG frames */
    async exportPNGSequence2D({ background = 'white', durationMode = 'lastKey', onProgress } = {}) {
        if (typeof JSZip === 'undefined') {
            alert('JSZip library not loaded — PNG sequence export unavailable.');
            return;
        }
        if (!this.keyframes.size && !this.cameraKeyframes.size) {
            alert('Nothing to export — draw some frames first.');
            return;
        }

        const frames = this._getExportFrameRange(durationMode);
        const zip = new JSZip();
        const folder = zip.folder('frames');

        for (let i = 0; i < frames.length; i++) {
            const c = document.createElement('canvas');
            c.width = this.canvas.width;
            c.height = this.canvas.height;
            this._renderExportFrame(c, frames[i], background);
            const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
            folder.file(`frame_${String(frames[i]).padStart(4, '0')}.png`, blob);
            onProgress?.((i + 1) / frames.length);
        }

        const zipBlob = await zip.generateAsync({ type: 'blob' });
        this._downloadBlob(zipBlob, `2d-animation-frames-${Date.now()}.zip`);
        onProgress?.(1);
    }

    /** Download the current frame as PNG */
    exportCurrentFramePNG() {
        const frame = this.getCurrentFrameIndex();
        const c = document.createElement('canvas');
        c.width = this.canvas.width;
        c.height = this.canvas.height;
        this._renderExportFrame(c, frame, 'white');
        c.toBlob((blob) => {
            if (blob) this._downloadBlob(blob, `frame_${String(frame).padStart(4, '0')}.png`);
        }, 'image/png');
    }

    /** Draw keyframed camera framing rects + path over the scene */
    drawCameraOverlay(ctx) {
        if (!this.cameraTrackVisible || !this.cameraKeyframes.size) return;        if (!this.cameraTrackVisible || !this.cameraKeyframes.size) return;
        const W = this.canvas.width;
        const H = this.canvas.height;
        const current = this.getCurrentFrameIndex();
        const kfs = [...this.cameraKeyframes.entries()].sort((a, b) => a[0] - b[0]);

        ctx.save();
        ctx.setLineDash([6, 4]);
        ctx.lineWidth = 1.5 / Math.max(0.001, this.view2D.scale);

        kfs.forEach(([frame, cam]) => {
            const isCurrent = frame === current;
            ctx.strokeStyle = isCurrent ? '#ff6b35' : 'rgba(120, 180, 255, 0.65)';
            const hw = (W / 2) / cam.zoom;
            const hh = (H / 2) / cam.zoom;
            ctx.beginPath();
            ctx.rect(cam.x - hw, cam.y - hh, hw * 2, hh * 2);
            ctx.stroke();
            if (isCurrent) {
                ctx.fillStyle = 'rgba(255,107,53,0.08)';
                ctx.fill();
            }
        });

        ctx.setLineDash([]);
        ctx.strokeStyle = 'rgba(120, 180, 255, 0.45)';
        kfs.forEach(([frame, cam], i) => {
            if (i === 0) ctx.moveTo(cam.x, cam.y);
            else ctx.lineTo(cam.x, cam.y);
        });
        ctx.stroke();
        ctx.restore();
    }

    startDrawing(e) {
        if (!this.isActive) return;
        if (this.isNavigationOverride) return;
        if (e.button !== 0) return;
        const layer = this.getCurrentLayer();
        if (layer && layer.locked) return;

        if (this.currentTool === 'fill') {
            const pos = this.getMousePos(e);
            this.handleFill(pos);
            this.isDrawing = false;
            this.currentStroke = null;
            return;
        }

        this.isDrawing = true;
        const pos = this.getMousePos(e);
        const brush = this.getActiveBrushConfig();

        this.currentStroke = {
            tool: this.currentTool,
            color: this.currentColor,
            size: this.currentSize,
            brush,
            layerId: this.currentLayerId,
            mirrorX: this.symmetryXEnabled,
            points: [{ x: pos.x, y: pos.y, p: 1 }]
        };

    }

    draw(e) {
        if (!this.isDrawing || !this.currentStroke) return;
        const pos = this.getMousePos(e);
        const brush = this.currentStroke.brush || this.getActiveBrushConfig();

        if (this.currentTool === 'pencil' || this.currentTool === 'eraser') {
            const points = this.currentStroke.points;
            const lastPoint = points[points.length - 1];
            const spacingPx = Math.max(1, this.currentStroke.size * Math.max(0.01, brush.spacing));
            const dx = pos.x - lastPoint.x;
            const dy = pos.y - lastPoint.y;
            const distance = Math.hypot(dx, dy);

            // CRITICAL FIX: Always add point if distance > 0, not just > spacing
            // This ensures continuous line even with fast mouse movement
            if (distance < 0.5) return; // Minimum micro-movement threshold

            const streamline = this.stabilizerEnabled ? Math.min(0.95, Math.max(0, brush.streamline || 0)) : 0;
            let x = (lastPoint.x * streamline) + (pos.x * (1 - streamline));
            let y = (lastPoint.y * streamline) + (pos.y * (1 - streamline));

            const jitterAmount = (brush.jitter || 0) * this.currentStroke.size;
            if (jitterAmount > 0) {
                x += (Math.random() * 2 - 1) * jitterAmount;
                y += (Math.random() * 2 - 1) * jitterAmount;
            }

            // Interpolate points between last and current for smooth lines
            const steps = Math.max(1, Math.floor(distance / spacingPx));
            for (let i = 1; i <= steps; i++) {
                const t = i / steps;
                points.push({
                    x: lastPoint.x + (x - lastPoint.x) * t,
                    y: lastPoint.y + (y - lastPoint.y) * t,
                    p: 0.75 + Math.random() * 0.25
                });
            }
        } else if (this.currentTool === 'spray') {
            const count = Math.max(6, Math.round(this.currentStroke.size * 0.8));
            for (let i = 0; i < count; i++) {
                const a = Math.random() * Math.PI * 2;
                const r = Math.sqrt(Math.random()) * this.currentStroke.size;
                const x = pos.x + Math.cos(a) * r;
                const y = pos.y + Math.sin(a) * r;
                this.currentStroke.points.push({ x, y, p: 0.2 + Math.random() * 0.8 });
            }
        } else {
            // For shapes, we only need start and end points
            if (this.currentStroke.points.length > 1) {
                this.currentStroke.points[1] = { x: pos.x, y: pos.y, p: 1 };
            } else {
                this.currentStroke.points.push({ x: pos.x, y: pos.y, p: 1 });
            }
        }

        // CRITICAL FIX: Render immediately after adding points
        this.render();
        this.renderCurrentStroke();
    }

    renderCurrentStroke() {
        if (!this.currentStroke) return;
        this.ctx.save();
        this._applyViewTransform(this.ctx);
        this.drawStroke(this.currentStroke, this.ctx);
        this.ctx.restore();
    }
    stopDrawing() {
        if (!this.isDrawing) return;
        this.isDrawing = false;

        if (this.currentStroke) {
            this.strokes.push(this.currentStroke);
            this.saveKeyframe();
            this.currentStroke = null;
        }

        this.render();
    }

    handleFill(pos) {
        const layer = this.getCurrentLayer();
        if (layer && layer.locked) return;

        // Frame-wide fill stroke (Grease Pencil style hold frame color block).
        const fillStroke = {
            tool: 'fill',
            color: this.currentColor,
            size: this.currentSize,
            brush: this.getActiveBrushConfig(),
            layerId: this.currentLayerId,
            mirrorX: false,
            points: [{ x: pos.x, y: pos.y, p: 1 }],
            fillRect: {
                x: 0,
                y: 0,
                w: this.canvas.width,
                h: this.canvas.height
            }
        };

        this.strokes.push(fillStroke);
        this.saveKeyframe();
        this.render();
    }

    saveKeyframe() {
        const frameIndex = this.getCurrentFrameIndex();
        this.keyframes.set(frameIndex, JSON.parse(JSON.stringify(this.strokes)));

        // Trigger timeline update to show 2D keyframes
        this.updateTimelineUI();
        this.syncTimelineMarkers();
    }

    deleteCurrentFrameKeyframe() {
        const frameIndex = this.getCurrentFrameIndex();
        this.keyframes.delete(frameIndex);
        this.strokes = this.keyframes.get(frameIndex) || [];
        this.updateTimelineUI();
        this.syncTimelineMarkers();
        this.render();
    }

    /**
 * Integrates 2D animation with the main timeline system
 * Creates proper keyframe entries that SMTimeline can read
 */
    syncWithTimeline() {
        if (!window.SMTimeline || !window.keyframes) return;

        const frameIndex = this.getCurrentFrameIndex();
        const strokes = this.keyframes.get(frameIndex);

        // Create a virtual object for timeline if not exists
        if (!this.timelineObject) {
            this.timelineObject = {
                uuid: 'animation2d_' + this.container.id,
                name: '2D Animation Layer',
                isObject3D: true,
                userData: {
                    is2DAnimation: true,
                    animation2DManager: this
                }
            };
            window.keyframes.set(this.timelineObject.uuid, {});
            window.SMTimeline.addObjectToTimeline(this.timelineObject);
        }

        // Sync 2D keyframes to timeline format
        const timelineMap = window.keyframes.get(this.timelineObject.uuid) || {};

        this.keyframes.forEach((strokeData, frame) => {
            if (!timelineMap[frame]) {
                timelineMap[frame] = {
                    time: frame / this.getTimelineState().fps,
                    position: new THREE.Vector3(0, 0, 0),
                    rotation: new THREE.Quaternion(),
                    scale: new THREE.Vector3(1, 1, 1),
                    interpolation: 'constant', // 2D uses hold frames by default
                    source: '2d_animation',
                    is2DKeyframe: true,
                    frameIndex: frame,
                    strokeCount: strokeData.length
                };
            }
        });

        window.keyframes.set(this.timelineObject.uuid, timelineMap);
        window.SMTimeline.updateKeyframesUI();
        window.SMTimeline.updateLayersUI();
    }

    /**
     * Advanced anime-style frame exposure system
     * Allows setting how many frames a drawing holds (1s, 2s, 3s)
     */
    setFrameExposure(frameIndex, exposureFrames = 1) {
        const kfData = this.keyframes.get(frameIndex);
        if (!kfData) return;

        // Mark this keyframe with exposure duration
        kfData._exposure = exposureFrames;
        kfData._holdType = exposureFrames === 1 ? '1s' :
            exposureFrames === 2 ? '2s' :
                exposureFrames === 3 ? '3s' : 'hold';

        // Auto-fill intermediate frames with hold references
        for (let i = 1; i < exposureFrames; i++) {
            const holdFrame = frameIndex + i;
            this.keyframes.set(holdFrame, {
                _isHoldFrame: true,
                _sourceFrame: frameIndex,
                _holdType: kfData._holdType
            });
        }

        this.syncTimelineMarkers();
    }
    /**
     * Japanese anime timing presets
     */
    applyAnimeTimingPreset(preset) {
        const presets = {
            'ones': { exposure: 1, description: 'Full animation (1 frame per drawing)' },
            'twos': { exposure: 2, description: 'Standard anime (2 frames per drawing)' },
            'threes': { exposure: 3, description: 'Limited animation (3 frames per drawing)' },
            'hold': { exposure: Infinity, description: 'Hold until next keyframe' }
        };

        const config = presets[preset];
        if (!config) return;

        this._globalExposure = config.exposure;
        this._timingPreset = preset;

        // Apply to all existing keyframes
        this.keyframes.forEach((data, frame) => {
            if (!data._isHoldFrame) {
                this.setFrameExposure(frame, config.exposure);
            }
        });
    }
    getTimelineState() {
        const fpsValue = (typeof fps !== 'undefined')
            ? fps
            : (typeof window.fps === 'number' ? window.fps : 60);
        const currentTimeValue = (typeof currentTime !== 'undefined')
            ? currentTime
            : (typeof window.currentTime === 'number' ? window.currentTime : 0);
        const durationValue = (typeof timelineDuration !== 'undefined')
            ? timelineDuration
            : (typeof window.timelineDuration === 'number' ? window.timelineDuration : 30);

        return {
            fps: Number.isFinite(fpsValue) && fpsValue > 0 ? fpsValue : 60,
            currentTime: Number.isFinite(currentTimeValue) ? currentTimeValue : 0,
            timelineDuration: Number.isFinite(durationValue) && durationValue > 0 ? durationValue : 30
        };
    }

    getCurrentFrameIndex() {
        const state = this.getTimelineState();
        return Math.round(state.currentTime * state.fps);
    }

    onTimeUpdate() {
        if (!this.isActive) return;
        const frameIndex = this.getCurrentFrameIndex();
        if (frameIndex === this.lastFrameIndex) return;
        this.lastFrameIndex = frameIndex;
        const frameData = this._resolveFrameData(frameIndex);
        this.strokes = (frameData || []).map((s) => {
            if (!s.layerId) s.layerId = 'layer_0';
            return s;
        });
        this.syncTimelineMarkers();
        this.render();
    }

    render() {
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        if (!this.isActive) return;

        // Drive the view from the 2D camera when in camera mode or keyframed
        if (this.currentTool === 'camera' || this.cameraKeyframes.size) {
            this._syncViewFromCamera(this._currentCameraState());
        }

        this.ctx.save();
        this._applyViewTransform(this.ctx);

        this.drawReferenceImage(this.ctx);

        // Onion Skinning (color-coded, alpha falloff)
        this.renderOnionSkinning(this.ctx);

        // Current strokes
        this.renderStrokeCollection(this.strokes, this.ctx);
        this.drawCameraOverlay(this.ctx);
        this.ctx.restore();
    }

    /**
     * Onion skinning: previous frames tinted in one color, next frames in another,
     * with distance-based alpha falloff (anime production standard).
     */
    renderOnionSkinning(ctx) {
        if (!this.onionSkinning) return;
        const currentFrame = this.getCurrentFrameIndex();
        const baseAlpha = Math.max(0.02, Math.min(0.8, this.onionSkinAlpha ?? 0.35));

        const tint = (s, color) => ({
            ...s,
            color,
            tool: s.tool === 'eraser' ? 'pencil' : s.tool
        });

        for (let i = 1; i <= this.onionSkinPrev; i++) {
            const strokes = this.keyframes.get(currentFrame - i);
            if (!strokes || !strokes.length) continue;
            ctx.save();
            ctx.globalAlpha = baseAlpha / i;
            strokes.forEach(s => this.drawStroke(tint(s, this.onionSkinPrevColor || '#00ff88'), ctx));
            ctx.restore();
        }

        for (let i = 1; i <= this.onionSkinNext; i++) {
            const strokes = this.keyframes.get(currentFrame + i);
            if (!strokes || !strokes.length) continue;
            ctx.save();
            ctx.globalAlpha = baseAlpha / i;
            strokes.forEach(s => this.drawStroke(tint(s, this.onionSkinNextColor || '#4a9eff'), ctx));
            ctx.restore();
        }
    }

    renderStrokeCollection(strokeCollection, ctx) {
        this.layers.forEach((layer) => {
            if (!layer.visible) return;
            const byLayer = (strokeCollection || []).filter((s) => (s.layerId || 'layer_0') === layer.id);
            if (!byLayer.length) return;
            ctx.save();
            ctx.globalAlpha *= layer.opacity;
            byLayer.forEach((stroke) => this.drawStroke(stroke, ctx));
            ctx.restore();
        });
    }

    drawStroke(stroke, ctx) {
        ctx.beginPath();
        ctx.strokeStyle = stroke.color;
        ctx.lineWidth = stroke.size;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';

        if (stroke.tool === 'pencil' || stroke.tool === 'eraser') {
            this.drawAdvancedBrushStroke(stroke, ctx);
        } else if (stroke.tool === 'spray') {
            this.drawSprayStroke(stroke, ctx);
        } else if (stroke.tool === 'line') {
            if (stroke.points.length >= 2) {
                ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
                ctx.lineTo(stroke.points[1].x, stroke.points[1].y);
                ctx.stroke();
            }
        } else if (stroke.tool === 'rect') {
            if (stroke.points.length >= 2) {
                const x = stroke.points[0].x;
                const y = stroke.points[0].y;
                const w = stroke.points[1].x - x;
                const h = stroke.points[1].y - y;
                ctx.strokeRect(x, y, w, h);
            }
        } else if (stroke.tool === 'circle') {
            if (stroke.points.length >= 2) {
                const x1 = stroke.points[0].x;
                const y1 = stroke.points[0].y;
                const x2 = stroke.points[1].x;
                const y2 = stroke.points[1].y;
                const r = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
                ctx.arc(x1, y1, r, 0, Math.PI * 2);
                ctx.stroke();
            }
        } else if (stroke.tool === 'fill') {
            const rect = stroke.fillRect || { x: 0, y: 0, w: this.canvas.width, h: this.canvas.height };
            ctx.save();
            ctx.globalCompositeOperation = (stroke.brush && stroke.brush.blend) || this.currentBlendMode || 'source-over';
            ctx.globalAlpha = Math.max(0.05, Math.min(1, (stroke.brush?.opacity ?? this.currentOpacity ?? 1)));
            ctx.fillStyle = stroke.color || this.currentColor;
            ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
            ctx.restore();
        }

        if (stroke.mirrorX) {
            const mirrored = this.createMirroredStroke(stroke);
            if (mirrored) {
                if (mirrored.tool === 'pencil' || mirrored.tool === 'eraser') {
                    this.drawAdvancedBrushStroke(mirrored, ctx);
                } else if (mirrored.tool === 'spray') {
                    this.drawSprayStroke(mirrored, ctx);
                } else if (mirrored.tool === 'line') {
                    if (mirrored.points.length >= 2) {
                        ctx.beginPath();
                        ctx.moveTo(mirrored.points[0].x, mirrored.points[0].y);
                        ctx.lineTo(mirrored.points[1].x, mirrored.points[1].y);
                        ctx.stroke();
                    }
                } else if (mirrored.tool === 'rect') {
                    if (mirrored.points.length >= 2) {
                        const x = mirrored.points[0].x;
                        const y = mirrored.points[0].y;
                        const w = mirrored.points[1].x - x;
                        const h = mirrored.points[1].y - y;
                        ctx.strokeRect(x, y, w, h);
                    }
                } else if (mirrored.tool === 'circle') {
                    if (mirrored.points.length >= 2) {
                        const x1 = mirrored.points[0].x;
                        const y1 = mirrored.points[0].y;
                        const x2 = mirrored.points[1].x;
                        const y2 = mirrored.points[1].y;
                        const r = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
                        ctx.beginPath();
                        ctx.arc(x1, y1, r, 0, Math.PI * 2);
                        ctx.stroke();
                    }
                }
            }
        }
    }

    /**
 * Vector-like stroke stabilization for anime clean lines
 * Uses moving average + pressure simulation
 */
    getStabilizedPosition(rawX, rawY) {
        if (!this.stabilizerEnabled) return { x: rawX, y: rawY };

        this._stabilizerBuffer = this._stabilizerBuffer || [];
        this._stabilizerBuffer.push({ x: rawX, y: rawY, t: performance.now() });

        // Keep last 8 positions for averaging
        if (this._stabilizerBuffer.length > 8) {
            this._stabilizerBuffer.shift();
        }

        const weights = [0.05, 0.08, 0.12, 0.15, 0.18, 0.15, 0.12, 0.15]; // Center-weighted
        let sx = 0, sy = 0, totalW = 0;

        this._stabilizerBuffer.forEach((p, i) => {
            const w = weights[i] || 0.1;
            sx += p.x * w;
            sy += p.y * w;
            totalW += w;
        });

        return {
            x: sx / totalW,
            y: sy / totalW,
            pressure: this._simulatePressure()
        };
    }

    /**
     * Simulates pen pressure based on velocity
     * Fast = thin, Slow = thick (anime inking style)
     */
    _simulatePressure() {
        if (this._stabilizerBuffer.length < 2) return 1;

        const last = this._stabilizerBuffer[this._stabilizerBuffer.length - 1];
        const prev = this._stabilizerBuffer[this._stabilizerBuffer.length - 2];
        const velocity = Math.hypot(last.x - prev.x, last.y - prev.y);

        // Inverse relationship: faster = thinner
        const pressure = Math.max(0.3, Math.min(1, 1 - (velocity / 50)));
        return pressure;
    }

    /**
     * Anime-style line tapering
     */
    calculateTaperWidth(baseSize, pointIndex, totalPoints, brush) {
        const t = pointIndex / Math.max(1, totalPoints - 1);
        let taper = 1;

        // Apply taper at start and end
        if (brush.taperStart > 0 && t < brush.taperStart) {
            taper *= (t / brush.taperStart);
        }
        if (brush.taperEnd > 0 && t > (1 - brush.taperEnd)) {
            taper *= ((1 - t) / brush.taperEnd);
        }

        return baseSize * Math.max(0.1, taper);
    }
    getSymmetryAxisX() {
        return (this.canvas.width * 0.5 - this.view2D.offsetX) / this.view2D.scale;
    }

    createMirroredStroke(stroke) {
        if (!stroke || !stroke.points || !stroke.points.length) return null;
        const axisX = this.getSymmetryAxisX();
        const mirrored = JSON.parse(JSON.stringify(stroke));
        mirrored.points = mirrored.points.map((p) => ({
            ...p,
            x: axisX - (p.x - axisX)
        }));
        mirrored.mirrorX = false;
        return mirrored;
    }

    enterMode() {
        if (this.isActive) return;
        this.isActive = true;

        // Show the canvas overlay (TRANSPARENT background so the white 3D scene shows through)
        this.container.style.display = 'block';
        this.container.style.pointerEvents = 'auto';
        // Make canvas transparent so 3D white scene background shows
        if (this.ctx) {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        }
        this.canvas.style.background = 'transparent';

        document.body.classList.add('animation-2d-mode-active');

        // Apply UI panels (toolbar + inspector) if not already done
        if (typeof window._apply2DUI === 'function') {
            window._apply2DUI(true);
        }

        // Save and configure orbit controls for 2D drawing workflow
        const controls = window.orbitControls || window.controls;
        if (controls) {
            this.savedViewportState.controls = {
                enableRotate: controls.enableRotate,
                enablePan: controls.enablePan,
                enableZoom: controls.enableZoom
            };
            // Keep orbit controls but disable rotation (pan/zoom only, like Blender 2D)
            controls.enableRotate = false;
            controls.enableZoom = true;
            controls.enablePan = true;
            controls.target.set(0, 0, 0);
            controls.update?.();
        }

        // Set 3D scene background to white (Blender-style 2D canvas) — skipped in 3D underlay mode
        if (!this._use3DUnderlay() && window.scene && window.THREE && window.THREE.Color) {
            if (window.scene._saved2dBackground === undefined) {
                this.savedViewportState.sceneBackground = window.scene.background;
                window.scene.background = new window.THREE.Color(0xffffff);
            }
        }

        // Align camera to front/Z view for 2D drawing — skipped in underlay mode (keep live 3D viewport)
        if (!this._use3DUnderlay() && window.camera) {
            const cam = window.camera;
            this.savedViewportState.camPos = cam.position.clone?.() || null;
            this.savedViewportState.camRot = cam.rotation.clone?.() || null;
            this.savedViewportState.camFov = cam.fov;
            cam.position.set(0, 0, 10);
            cam.rotation.set(0, 0, 0);
            cam.up.set(0, 1, 0);
            cam.fov = 30;
            cam.updateProjectionMatrix?.();
        }

        // 3D underlay mode: keep the live 3D viewport interactive (linked or frozen)
        if (this._use3DUnderlay()) {
            const ctl = window.orbitControls || window.controls;
            if (ctl) {
                this.savedViewportState.controlsEnabled = ctl.enabled;
                ctl.enabled = this.cameraLinkTo3D !== false;
                ctl.update?.();
            }
        }

        // Match current time
        this.onTimeUpdate();
        this.syncTimelineMarkers();
        this.renderBrushShelf(this.activeBrushFilter);
        // Bind OrbitControls change event so 2D and 3D viewports render in 100% real-time harmony
        if (controls) {
            this._onCameraChange = () => this.render();
            controls.addEventListener('change', this._onCameraChange);
        }

        this.resize();
        console.log('[2D] Entered 2D Animation Mode — white canvas, front view');
    }

    exitMode() {
        if (!this.isActive) return;
        this.isActive = false;
        this.stopDrawing();
        this.setNavigationOverride(false);
        this.view2D.isPanning = false;
        this.isSpacePressed = false;
        this.container.style.display = 'none';
        this.container.style.pointerEvents = 'none';
        document.body.classList.remove('animation-2d-mode-active');

        // Restore UI panels
        if (typeof window._apply2DUI === 'function') {
            window._apply2DUI(false);
        }

        // Restore orbit controls
        const controls = window.orbitControls || window.controls;
        if (controls) {
            if (this._onCameraChange) {
                controls.removeEventListener('change', this._onCameraChange);
                this._onCameraChange = null;
            }
            if (this.savedViewportState.controls) {
                controls.enableRotate = this.savedViewportState.controls.enableRotate;
                controls.enablePan = this.savedViewportState.controls.enablePan;
                controls.enableZoom = this.savedViewportState.controls.enableZoom;
                controls.update?.();
            }
            if (this.savedViewportState.controlsEnabled !== undefined) {
                controls.enabled = this.savedViewportState.controlsEnabled;
                delete this.savedViewportState.controlsEnabled;
                controls.update?.();
            }
        }

        // Restore scene background
        if (window.scene && this.savedViewportState.sceneBackground !== undefined) {
            window.scene.background = this.savedViewportState.sceneBackground;
            delete window.scene._saved2dBackground;
        }

        // Restore camera
        const cam = window.camera;
        if (cam && this.savedViewportState.camFov !== undefined) {
            if (this.savedViewportState.camPos) cam.position.copy(this.savedViewportState.camPos);
            if (this.savedViewportState.camRot) cam.rotation.copy(this.savedViewportState.camRot);
            cam.fov = this.savedViewportState.camFov;
            cam.updateProjectionMatrix?.();
        }

        // Restore transform controls
        if (window.transformControls) window.transformControls.visible = true;

        // Reset all 2D-specific UI (toolbar swap, panels, white background restore)
        if (typeof window._apply2DUI === 'function') {
            window._apply2DUI(false);
        }

        console.log('[2D] Exited 2D Animation Mode');
    }

    setNavigationOverride(enabled) {
        this.isNavigationOverride = enabled;
        if (enabled) {
            this.canvas.style.pointerEvents = 'none';
            this.canvas.style.cursor = 'grab';
        } else {
            this.canvas.style.pointerEvents = 'auto';
            this.canvas.style.cursor = this.isSpacePressed ? 'grab' : 'crosshair';
        }
    }

    drawAdvancedBrushStroke(stroke, ctx) {
        const points = stroke.points || [];
        if (points.length === 0) return;
        const brush = stroke.brush || this.getActiveBrushConfig();

        ctx.save();
        const blendMode = brush.blend || this.currentBlendMode || 'source-over';
        ctx.globalCompositeOperation = stroke.tool === 'eraser' ? 'destination-out' : blendMode;
        ctx.globalAlpha = Math.max(0.05, Math.min(1, (brush.strength || 1) * (brush.opacity || 1)));
        ctx.strokeStyle = stroke.tool === 'eraser' ? 'rgba(0,0,0,1)' : stroke.color;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // Anime-style shadow for depth
        if (brush.hardness < 0.9) {
            ctx.shadowColor = ctx.strokeStyle;
            ctx.shadowBlur = Math.max(0, (1 - Math.max(0.1, brush.hardness || 1)) * stroke.size * 0.8);
        }

        if (points.length === 1) {
            ctx.beginPath();
            const r = Math.max(0.6, stroke.size * 0.45 * (points[0].p || 1));
            ctx.arc(points[0].x, points[0].y, r, 0, Math.PI * 2);
            ctx.fillStyle = ctx.strokeStyle;
            ctx.fill();
            ctx.restore();
            return;
        }

        // Use quadratic curves for smoother real-time drawing
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);

        for (let i = 1; i < points.length; i++) {
            const prev = points[i - 1];
            const curr = points[i];

            // Use midpoint for quadratic curve control
            if (i === 1) {
                ctx.lineTo(curr.x, curr.y);
            } else {
                const midX = (prev.x + curr.x) / 2;
                const midY = (prev.y + curr.y) / 2;
                ctx.quadraticCurveTo(prev.x, prev.y, midX, midY);
            }

            const t = i / (points.length - 1);
            const pressure = curr.p || 1;
            const width = this.calculateTaperWidth(stroke.size * pressure, i, points.length, brush);

            ctx.lineWidth = width;
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(curr.x, curr.y);
        }

        // Connect last point
        if (points.length > 2) {
            const last = points[points.length - 1];
            ctx.lineTo(last.x, last.y);
            ctx.stroke();
        }

        ctx.restore();
    }

    drawSprayStroke(stroke, ctx) {
        const points = stroke.points || [];
        if (!points.length) return;
        const brush = stroke.brush || this.getActiveBrushConfig();
        const blendMode = brush.blend || this.currentBlendMode || 'source-over';

        ctx.save();
        ctx.globalCompositeOperation = stroke.tool === 'eraser' ? 'destination-out' : blendMode;
        ctx.fillStyle = stroke.tool === 'eraser' ? 'rgba(0,0,0,1)' : stroke.color;
        ctx.globalAlpha = Math.max(0.03, Math.min(1, (brush.strength || 1) * (brush.opacity || 1) * 0.75));
        points.forEach((p) => {
            const r = Math.max(0.4, (stroke.size * 0.1) * (p.p || 1));
            ctx.beginPath();
            ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
            ctx.fill();
        });
        ctx.restore();
    }

    loadReferenceImage(file) {
        const reader = new FileReader();
        reader.onload = () => {
            const img = new Image();
            img.onload = () => {
                this.referenceImage = img;
                this.render();
            };
            img.src = reader.result;
        };
        reader.readAsDataURL(file);
    }

    drawReferenceImage(ctx) {
        if (!this.referenceImage) return;
        const img = this.referenceImage;
        const cw = this.canvas.width;
        const ch = this.canvas.height;
        const iw = img.width;
        const ih = img.height;
        if (!iw || !ih) return;

        const canvasRatio = cw / ch;
        const imageRatio = iw / ih;

        let drawW = cw;
        let drawH = ch;
        let dx = 0;
        let dy = 0;

        if (this.referenceFitMode === 'fit') {
            if (imageRatio > canvasRatio) {
                drawW = cw;
                drawH = cw / imageRatio;
                dy = (ch - drawH) * 0.5;
            } else {
                drawH = ch;
                drawW = ch * imageRatio;
                dx = (cw - drawW) * 0.5;
            }
        } else if (this.referenceFitMode === 'fill') {
            if (imageRatio > canvasRatio) {
                drawH = ch;
                drawW = ch * imageRatio;
                dx = (cw - drawW) * 0.5;
            } else {
                drawW = cw;
                drawH = cw / imageRatio;
                dy = (ch - drawH) * 0.5;
            }
        } else {
            drawW = iw;
            drawH = ih;
            dx = (cw - drawW) * 0.5;
            dy = (ch - drawH) * 0.5;
        }

        ctx.save();
        ctx.globalAlpha = Math.max(0.05, Math.min(1, this.referenceImageOpacity));
        ctx.drawImage(img, dx, dy, drawW, drawH);
        ctx.restore();
    }

    syncTimelineMarkers() {
        const markersContainer = document.getElementById('timeline-markers-container');
        if (!markersContainer) return;

        markersContainer.querySelectorAll('.animation2d-keyframe-marker').forEach((el) => el.remove());

        const state = this.getTimelineState();
        const maxFrames = Math.max(1, Math.round(state.timelineDuration * state.fps));
        const currentFrame = this.getCurrentFrameIndex();

        Array.from(this.keyframes.keys())
            .sort((a, b) => a - b)
            .forEach((frame) => {
                const marker = document.createElement('div');
                marker.className = 'animation2d-keyframe-marker';
                if (frame === currentFrame) marker.classList.add('active');
                marker.style.left = `${Math.max(0, Math.min(100, (frame / maxFrames) * 100))}%`;
                marker.title = `2D Frame ${frame}`;
                markersContainer.appendChild(marker);
            });
    }

    updateTimelineUI() {
        // Placeholder for triggering timeline refresh
        if (typeof window.updateKeyframesUI === 'function') {
            // We might need to add a "2D Animation" object to the timeline
            window.updateKeyframesUI();
        }
    }
}

// Global instance
window.animation2DManager = new Animation2DManager();

window.enter2DAnimationMode = () => {
    if (window.animation2DManager && window.animation2DManager.isActive) {
        window.animation2DManager.exitMode();
        return;
    }
    // Exit other 2D modes if active
    if (window.v2dManager && window.v2dManager.is2D) window.exit2DMode();

    window.animation2DManager.enterMode();
};

window.exit2DAnimationMode = () => {
    window.animation2DManager.exitMode();
};
