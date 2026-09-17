/**
 * SM ENGINE RENDER MIGRATION — FIXED
 * Legacy smRender API now delegates to SMPostProcessStack.
 *
 * @file rendering/SMRenderPipeline.js
 * Master Rendering Controller, Viewport Shading Engine, & Custom Post-Processing Pipeline
 * Optimized for high performance across scalable hardware tiers.
 */
'use strict';
// ── 1. CINEMATIC COLOR CORRECTION SHADER ─────────────────────────────────────
const SMColorCorrectionShader = {
    uniforms: {
        'tDiffuse': { value: null },
        'uExposure': { value: 1.0 },
        'uSaturation': { value: 1.0 },
        'uContrast': { value: 1.0 },
        'uVignette': { value: 0.3 }
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float uExposure;
        uniform float uSaturation;
        uniform float uContrast;
        uniform float uVignette;
        varying vec2 vUv;
        // Tone mapping is owned by WebGLRenderer (ACESFilmicToneMapping).
        // This pass performs grading only; applying ACES here again caused
        // double tone mapping, crushed highlights and desaturated materials.
        void main() {
            vec4 texel = texture2D(tDiffuse, vUv);
            vec3 color = texel.rgb * uExposure;
            // Contrast adjustment
            color = (color - 0.5) * uContrast + 0.5;
            // Saturation adjustment
            float luma = dot(color, vec3(0.299, 0.587, 0.114));
            color = mix(vec3(luma), color, uSaturation);
            // Subtle Cinematic Vignette
            vec2 uv = vUv - 0.5;
            float dist = length(uv);
            float vignette = smoothstep(0.8, 0.8 - uVignette, dist);
            color *= vignette;
            // Preserve renderer-managed tone mapping; grade only.
            gl_FragColor = vec4(max(color, vec3(0.0)), texel.a);
        }
    `
};
// ── 2. UNIFIED RENDER COMPOSER PIPELINE ──────────────────────────────────────
class SMRenderPipelineManager {
    constructor() {
        this.composer = null;
        this.renderPass = null;
        this.ssaoPass = null;
        this.bloomPass = null;
        this.colorGradingPass = null;
        this.fxaaPass = null;

        this.renderer = null;
        this.scene = null;
        this.camera = null;
        this.container = null;

        this.active = false;
        this.qualityPreset = 'high';
        this.initialized = false;
    }

    _getStack() {
        return window.smPostProcessStack || null;
    }

    _syncLegacyPassRefs() {
        const stack = this._getStack();

        this.composer = stack?.composer || null;
        this.renderPass = stack?.renderPass || null;
        this.ssaoPass = stack?.ao?.pass || null;
        this.bloomPass = stack?.bloom?.pass || null;
        this.colorGradingPass = stack?.colorGrading?.pass || null;
        this.fxaaPass = stack?.aa?.pass || null;

        if (this.composer) {
            window.composer = this.composer;
        }
    }

    init(renderer, scene, camera, container) {
        this.renderer = renderer || window.renderer || this.renderer;
        this.scene = scene || window.scene || this.scene;
        this.camera = camera || window.camera || this.camera;
        this.container = container || document.getElementById('renderer-container') || null;

        if (!this.renderer || !this.scene || !this.camera) {
            console.warn('[SM Render Bridge] renderer, scene or camera is unavailable.');
            return false;
        }

        if (typeof window.initSMPostProcessStack !== 'function') {
            console.warn(
                '[SM Render Bridge] SMPostProcessStack is unavailable. ' +
                'Load rendering/postprocessing/* before SMRenderPipeline.js.'
            );
            return false;
        }

        const stack = window.initSMPostProcessStack({
            renderer: this.renderer,
            scene: this.scene,
            camera: this.camera
        });

        if (!stack) return false;

        const width =
            this.container?.clientWidth ||
            this.renderer.domElement?.clientWidth ||
            window.innerWidth ||
            1;

        const height =
            this.container?.clientHeight ||
            this.renderer.domElement?.clientHeight ||
            window.innerHeight ||
            1;

        if (!stack.initialized) {
            stack.initialize(width, height);
        } else {
            stack.setCamera(this.camera);
            stack.setSize(width, height);
        }

        this._syncLegacyPassRefs();
        this.applyQualityPreset(this.qualityPreset);

        this.initialized = true;

        console.log('[SM Render Bridge] Legacy smRender now delegates to SMPostProcessStack.');
        return true;
    }

    updateFXAAProperties(width, height) {
        const stack = this._getStack();
        stack?.aa?.setSize?.(
            width,
            height,
            this.renderer?.getPixelRatio?.() || 1
        );

        this._syncLegacyPassRefs();
    }

    setSize(width, height) {
        const stack = this._getStack();

        if (stack) {
            stack.setSize(
                Math.max(1, width | 0),
                Math.max(1, height | 0)
            );
        }

        this._syncLegacyPassRefs();
    }

    applySettings(settings = {}) {
        const stack = this._getStack();

        if (!stack) {
            return;
        }

        stack.applySettings({
            colorGrading: {
                enabled: settings.enableColorGrading !== false,
                exposure: settings.exposure ?? 1.0,
                saturation: settings.saturation ?? 1.0,
                contrast: settings.contrast ?? 1.0,
                brightness: settings.brightness ?? 0.0,
                temperature: settings.temperature ?? 0.0,
                tint: settings.tint ?? 0.0,
                vignette: settings.vignette ?? 0.0
            },

            bloom: {
                enabled: settings.enableBloom !== false,
                strength: settings.bloomStrength ?? 0.22,
                radius: settings.bloomRadius ?? 0.28,
                threshold: settings.bloomThreshold ?? 1.05
            },

            ao: {
                enabled:
                    this.qualityPreset !== 'low' &&
                    settings.enableSSAO !== false,

                kernelRadius: settings.aoRadius ?? 12,
                minDistance: settings.aoMinDistance ?? 0.004,
                maxDistance: settings.aoMaxDistance ?? 0.12
            },

            toneMapping: {
                mode: settings.toneMapping || 'aces',
                exposure: settings.rendererExposure ?? 1.0
            }
        });

        this._syncLegacyPassRefs();
    }

    applyQualityPreset(preset) {
        this.qualityPreset = preset || 'high';

        if (window.smGraphicsQuality?.applyPreset) {
            window.smGraphicsQuality.applyPreset(this.qualityPreset);
        } else {
            const renderer = this.renderer || window.renderer;
            const stack = this._getStack();

            if (renderer?.shadowMap) {
                renderer.shadowMap.enabled = this.qualityPreset !== 'low';

                if (
                    this.qualityPreset === 'medium' &&
                    THREE.PCFShadowMap !== undefined
                ) {
                    renderer.shadowMap.type = THREE.PCFShadowMap;
                } else if (
                    this.qualityPreset !== 'low' &&
                    THREE.PCFSoftShadowMap !== undefined
                ) {
                    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
                }
            }

            stack?.applySettings?.({
                ao: {
                    enabled:
                        this.qualityPreset === 'high' ||
                        this.qualityPreset === 'ultra',

                    kernelRadius:
                        this.qualityPreset === 'ultra'
                            ? 18
                            : 12
                },

                bloom: {
                    enabled:
                        this.qualityPreset !== 'low'
                }
            });
        }

        this._syncLegacyPassRefs();
    }

    render(camera, delta = 0) {
        const renderer = this.renderer || window.renderer;
        const scene = this.scene || window.scene;
        const activeCamera =
            camera ||
            this.camera ||
            window.SMViewportSystem?.getActivePanel?.()?.camera ||
            window.camera;

        if (!renderer || !scene || !activeCamera) {
            return false;
        }

        this.camera = activeCamera;

        const water = window.waterSystem;

        if (
            water?.isCameraUnderwater?.(activeCamera) &&
            typeof water.render === 'function'
        ) {
            return water.render(
                scene,
                activeCamera
            );
        }

        const stack = this._getStack();

        if (
            this.active &&
            stack
        ) {
            if (!stack.initialized) {
                const canvas = renderer.domElement;

                stack.initialize(
                    canvas?.clientWidth || canvas?.width || 1,
                    canvas?.clientHeight || canvas?.height || 1
                );
            }

            stack.setCamera(activeCamera);
            stack.render(delta);

            this._syncLegacyPassRefs();

            return true;
        }

        renderer.render(
            scene,
            activeCamera
        );

        return true;
    }

    dispose() {
        this.active = false;
        this.initialized = false;

        this.composer = null;
        this.renderPass = null;
        this.ssaoPass = null;
        this.bloomPass = null;
        this.colorGradingPass = null;
        this.fxaaPass = null;
    }
}

window.smRender = new SMRenderPipelineManager();
// ── 3. FRAME BUFFER WINDOW (Blender-Style UI Panel Sync) ─────────────────────
class SMFrameBufferWindow {
    constructor() {
        this.el = null;
        this.sidebarVisible = true;
        this._videoUrl = null;
        this._hasSetDefaultEndFrame = false;
    }
    show(rendererCanvas, stats_obj, cameraName) {
        let re = document.getElementById('rendering-editor');
        if (!re) {
            re = document.createElement('div');
            re.id = 'rendering-editor';
            re.style.cssText = `
                position: fixed; inset: 0; z-index: 999999;
                background: #0a0a0a; display: none; flex-direction: column;
                font-family: 'Outfit', 'Inter', sans-serif; color: #eee;
            `;
            const header = `
                <div style="background:#1a1a1a; padding:10px 20px; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #333; height:45px; box-sizing:border-box;">
                    <div style="display:flex; align-items:center; gap:15px;">
                        <span style="color:#f5a623; font-weight:700; font-size:12px; letter-spacing:1px; display:flex; align-items:center; gap:8px;">
                            <i class="fas fa-cube"></i> RENDER RESULT
                        </span>
                        <div id="re-stats" style="color:#666; font-size:11px; font-family:'JetBrains Mono', monospace;"></div>
                    </div>
                    <div style="display:flex; gap:10px; align-items:center;">
                        <button id="re-save-btn" class="re-btn-secondary"><i class="fas fa-file-export"></i> Image</button>
                        <button id="re-render-anim-btn" class="re-btn-primary" style="background:#ff4757;"><i class="fas fa-film"></i> Animation</button>
                        <button onclick="window.SMEngineRenderer.executeRender()" class="re-btn-primary"><i class="fas fa-sync-alt"></i> Re-Render</button>
                        <button id="re-toggle-sidebar" class="re-btn-secondary"><i class="fas fa-sliders-h"></i></button>
                        <button id="re-close-btn" style="background:transparent; color:#555; border:none; font-size:20px; cursor:pointer; margin-left:10px;"><i class="fas fa-times"></i></button>
                    </div>
                </div>
            `;
            const mainContent = `
                <div style="flex:1; display:flex; overflow:hidden;">
                    <!-- Visual Output Area -->
                    <div id="re-viewport" style="flex:1; display:flex; align-items:center; justify-content:center; background:#050505; position:relative; overflow:auto;">
                        <div id="re-image-container" style="position:relative; transition: transform 0.2s ease;">
                            <img id="re-output-img" style="max-width:100%; max-height:100%; box-shadow: 0 30px 100px rgba(0,0,0,0.9); border: 2px solid #222;">
                            <video id="re-output-video" style="display:none; max-width:100%; max-height:100%; box-shadow: 0 30px 100px rgba(0,0,0,0.9); border: 2px solid #222;" controls></video>
                            <div id="re-progress-overlay" style="position:absolute; inset:0; background:rgba(0,0,0,0.8); display:none; flex-direction:column; align-items:center; justify-content:center; z-index:10;">
                                <div style="width:200px; height:4px; background:#333; border-radius:2px; overflow:hidden;">
                                    <div id="re-progress-bar" style="width:0%; height:100%; background:#3a86ff; transition:width 0.1s;"></div>
                                </div>
                                <div id="re-progress-text" style="font-size:11px; color:#aaa; margin-top:10px;">Rendering Frame...</div>
                            </div>
                        </div>
                    </div>
                    <!-- BLENDER-STYLE RENDERING CONFIGURATION PANEL -->
                    <div id="re-sidebar" style="width:300px; background:#161616; border-left:1px solid #333; overflow-y:auto; padding:0; display:flex; flex-direction:column;">
                        <div class="sidebar-section">
                            <div class="sidebar-header"><i class="fas fa-tachometer-alt"></i> Performance Tier</div>
                            <div class="sidebar-item">
                                <label>Render Quality</label>
                                <select id="set-quality-preset" style="background:#2a2a2a; color:#eee; border:1px solid #444; padding:4px 6px;">
                                    <option value="low">Low (Fastest)</option>
                                    <option value="medium">Medium</option>
                                    <option value="high" selected>High (Balanced)</option>
                                    <option value="ultra">Ultra (High End)</option>
                                </select>
                            </div>
                        </div>
                        <div class="sidebar-section">
                            <div class="sidebar-header"><i class="fas fa-image"></i> Render Properties</div>
                            <div class="sidebar-item">
                                <label>Exposure (Brightness)</label>
                                <input type="range" id="set-exposure" min="0.1" max="3" step="0.05" value="1.0">
                            </div>
                            <div class="sidebar-item">
                                <label>Saturation</label>
                                <input type="range" id="set-saturation" min="0" max="2" step="0.05" value="1.0">
                            </div>
                            <div class="sidebar-item">
                                <label>Contrast</label>
                                <input type="range" id="set-contrast" min="0.5" max="1.5" step="0.05" value="1.0">
                            </div>
                        </div>
                        <div class="sidebar-section">
                            <div class="sidebar-header"><i class="fas fa-magic"></i> Atmospheric Effects</div>
                            <div class="sidebar-item">
                                <label>Bloom (Light Glow)</label>
                                <input type="range" id="set-bloom" min="0" max="3" step="0.1" value="0.5">
                            </div>
                            <div class="sidebar-item">
                                <label>Vignette (Border Shadow)</label>
                                <input type="range" id="set-vignette" min="0" max="0.8" step="0.05" value="0.30">
                            </div>
                        </div>
                        <div class="sidebar-section">
                            <div class="sidebar-header"><i class="fas fa-video"></i> Animation Export</div>
                            <div class="sidebar-item">
                                <label>Target FPS</label>
                                <select id="set-fps" style="background:#2a2a2a; color:#eee; border:1px solid #444; padding:4px 6px;">
                                    <option value="24">24 (Film)</option>
                                    <option value="30" selected>30 (Standard)</option>
                                    <option value="60">60 (Fluid)</option>
                                </select>
                            </div>
                            <div class="sidebar-item" style="display:flex; gap:5px;">
                                <div style="flex:1;">
                                    <label>Start Frame</label>
                                    <input type="number" id="set-frame-start" value="0" style="width:100%; background:#222; border:1px solid #444; color:white; padding:4px;">
                                </div>
                                <div style="flex:1;">
                                    <label>End Frame</label>
                                    <input type="number" id="set-frame-end" value="60" style="width:100%; background:#222; border:1px solid #444; color:white; padding:4px;">
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            re.innerHTML = header + mainContent;
            document.body.appendChild(re);
            const style = document.createElement('style');
            style.textContent = `
                .sidebar-section { border-bottom: 1px solid #222; }
                .sidebar-header { background: #222; padding: 10px 15px; font-size: 11px; font-weight: 700; color: #aaa; text-transform: uppercase; letter-spacing: 0.5px; }
                .sidebar-item { padding: 12px 15px; display: flex; flex-direction: column; gap: 5px; }
                .sidebar-item label { font-size: 11px; color: #888; user-select: none; }
                .sidebar-item input[type="range"] { -webkit-appearance: none; width: 100%; background: #333; height: 3px; border-radius: 2px; outline: none; }
                .sidebar-item input[type="range"]::-webkit-slider-thumb { -webkit-appearance: none; height: 12px; width: 12px; border-radius: 50%; background: #f5a623; cursor: pointer; }
                .re-btn-primary { background: #3a86ff; color: #fff; border: none; padding: 5px 15px; border-radius: 4px; font-size: 11px; font-weight: 600; cursor: pointer; display:flex; align-items:center; gap:6px; }
                .re-btn-secondary { background: #333; color: #bbb; border: none; padding: 5px 12px; border-radius: 4px; font-size: 11px; cursor: pointer; }
                .re-btn-primary:hover { background: #4a96ff; }
                .re-btn-secondary:hover { background: #444; color: #eee; }
            `;
            document.head.appendChild(style);
            re.querySelector('#re-close-btn').onclick = () => {
                if (this._videoUrl) {
                    URL.revokeObjectURL(this._videoUrl);
                    this._videoUrl = null;
                }
                re.style.display = 'none';
            };
            re.querySelector('#re-toggle-sidebar').onclick = () => {
                const sb = re.querySelector('#re-sidebar');
                this.sidebarVisible = !this.sidebarVisible;
                sb.style.display = this.sidebarVisible ? 'flex' : 'none';
            };
            this._bindInputs(re);
        }
        const img = re.querySelector('#re-output-img');
        const vid = re.querySelector('#re-output-video');
        const stats = re.querySelector('#re-stats');
        const saveBtn = re.querySelector('#re-save-btn');
        const animBtn = re.querySelector('#re-render-anim-btn');
        if (this._videoUrl) {
            URL.revokeObjectURL(this._videoUrl);
            this._videoUrl = null;
        }
        img.src = rendererCanvas.toDataURL('image/png');
        img.style.display = 'block';
        if (vid) {
            vid.pause();
            vid.removeAttribute('src');
            vid.style.display = 'none';
        }
        stats.innerText = `[${rendererCanvas.width}x${rendererCanvas.height}] [Cam: ${cameraName}] [Time: ${stats_obj.time.toFixed(3)}s]`;
        if (window.timelineDuration && window.fps) {
            const expectedEnd = Math.floor(window.timelineDuration * window.fps);
            const endInput = re.querySelector('#set-frame-end');
            if (endInput && !this._hasSetDefaultEndFrame) {
                endInput.value = expectedEnd;
                window.SMEngineRenderer.settings.frameEnd = expectedEnd;
                this._hasSetDefaultEndFrame = true;
            }
        }
        saveBtn.onclick = () => {
            const link = document.createElement('a');
            link.download = `Render_${cameraName}_${Date.now()}.png`;
            link.href = img.src;
            link.click();
        };
        saveBtn.innerHTML = '<i class="fas fa-file-export"></i> Image';
        animBtn.onclick = () => window.SMEngineRenderer.executeVideoRender();
        re.style.display = 'flex';
        this.el = re;
    }
    showVideo(videoUrl, stats_obj, cameraName, size) {
        let re = document.getElementById('rendering-editor');
        if (!re || !this.el) return;
        const img = re.querySelector('#re-output-img');
        const vid = re.querySelector('#re-output-video');
        const stats = re.querySelector('#re-stats');
        const saveBtn = re.querySelector('#re-save-btn');
        if (this._videoUrl) {
            URL.revokeObjectURL(this._videoUrl);
        }
        this._videoUrl = videoUrl;
        if (img) img.style.display = 'none';
        if (vid) {
            vid.src = videoUrl;
            vid.style.display = 'block';
            vid.currentTime = 0;
            vid.play().catch(() => { });
        }
        stats.innerText = `[${size?.w ?? 'auto'}x${size?.h ?? 'auto'}] [Cam: ${cameraName}] [Video Render Output]`;
        if (saveBtn) {
            saveBtn.innerHTML = '<i class="fas fa-file-export"></i> Video';
            saveBtn.onclick = () => {
                const link = document.createElement('a');
                link.download = `Render_Anim_${cameraName}_${Date.now()}.webm`;
                link.href = videoUrl;
                link.click();
            };
        }
    }
    _bindInputs(re) {
        const eng = window.SMEngineRenderer;
        const bind = (id, key) => {
            const el = re.querySelector(`#${id}`);
            if (el) el.oninput = (e) => {
                eng.settings[key] = parseFloat(e.target.value);
                eng.updatePipelineSettings();
            };
        };
        bind('set-exposure', 'exposure');
        bind('set-saturation', 'saturation');
        bind('set-contrast', 'contrast');
        bind('set-vignette', 'vignette');
        bind('set-bloom', 'bloomStrength');
        re.querySelector('#set-quality-preset').onchange = (e) => {
            const val = e.target.value;
            window.smRender.applyQualityPreset(val);
            if (window.SMViewportShading) window.SMViewportShading.preview();
        };
        re.querySelector('#set-fps').onchange = (e) => eng.settings.fps = parseInt(e.target.value);
        re.querySelector('#set-frame-start').oninput = (e) => eng.settings.frameStart = parseInt(e.target.value);
        re.querySelector('#set-frame-end').oninput = (e) => eng.settings.frameEnd = parseInt(e.target.value);
    }
    updateProgress(current, total) {
        const overlay = document.getElementById('re-progress-overlay');
        const bar = document.getElementById('re-progress-bar');
        const text = document.getElementById('re-progress-text');
        if (overlay) overlay.style.display = 'flex';
        if (bar) bar.style.width = `${(current / total) * 100}%`;
        if (text) text.innerText = `Rendering Animation: Frame ${current} / ${total}`;
        if (current >= total) {
            setTimeout(() => { if (overlay) overlay.style.display = 'none'; }, 1500);
        }
    }
}
// ── 4. OFFLINE RENDERING CONTROLLER ──────────────────────────────────────────
class SMRenderEngine {
    constructor() {
        this.fb = new SMFrameBufferWindow();
        this.activeCamera = null;
        this.backup = null;
        this.settings = {
            exposure: 1.0,
            saturation: 1.0,
            contrast: 1.0,
            vignette: 0.3,
            bloomStrength: 0.5,
            fps: 30,
            frameStart: 0,
            frameEnd: 60,
            width: 1920,
            height: 1080
        };
        this._isRenderingVideo = false;
    }
    setActiveCamera(cam) {
        if (!cam) return;
        this.activeCamera = cam.isCamera ? cam : (cam.userData?.primaryCamera || cam);
        _enterCameraView(this.activeCamera);
    }
    updatePipelineSettings() {
        if (window.smRender) {
            window.smRender.applySettings(this.settings);
        }
    }
    executeRender() {
        if (!window.renderer || !window.scene) return;
        const cam = this.activeCamera || window._viewedCamera || window.camera;
        if (!cam) return;
        const t0 = performance.now();
        this._prepareForRender(this.settings.width, this.settings.height);
        // Render scene through composer pipeline
        window.smRender.active = true;
        window.smRender.applySettings(this.settings);
        window.smRender.render(cam);
        const stats = { time: (performance.now() - t0) / 1000 };
        this.fb.show(window.renderer.domElement, stats, cam.name || "Viewport");
        this._restoreAfterRender();
    }
    async executeVideoRender() {
        if (this._isRenderingVideo) return;
        if (!window.renderer || !window.scene) return;
        const cam = this.activeCamera || window._viewedCamera || window.camera;
        if (!cam) return;
        window.isOfflineRendering = true;
        if (typeof window.pauseAnimation === 'function') window.pauseAnimation();
        window.isPlaying = false;
        this._isRenderingVideo = true;
        if (window.timelineDuration && window.fps) {
            this.settings.frameEnd = Math.floor(window.timelineDuration * window.fps);
        }
        const { frameStart, frameEnd, fps, width, height } = this.settings;
        const total = Math.max(1, frameEnd - frameStart + 1);
        const renderer = window.renderer;
        const scene = window.scene;
        const oldClearAlpha = renderer.getClearAlpha();
        const oldClearColor = renderer.getClearColor(new THREE.Color()).clone();
        const bgColor = scene.background && scene.background.isColor ? scene.background : new THREE.Color(0x0a0a0a);
        renderer.setClearColor(bgColor, 1.0);
        let recorder = null;
        let stream = null;
        let chunks = [];
        let mimeType = 'video/webm;codecs=vp9';
        const chooseMime = () => {
            if (window.MediaRecorder && window.MediaRecorder.isTypeSupported) {
                if (window.MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) return 'video/webm;codecs=vp9';
                if (window.MediaRecorder.isTypeSupported('video/webm;codecs=vp8')) return 'video/webm;codecs=vp8';
                return 'video/webm';
            }
            return '';
        };
        try {
            this._prepareForRender(width, height);
            window.smRender.active = true;
            window.smRender.applySettings(this.settings);
            mimeType = chooseMime();
            if (typeof renderer.domElement.captureStream === 'function' && window.MediaRecorder) {
                stream = renderer.domElement.captureStream(fps);
                recorder = new MediaRecorder(stream, mimeType ? { mimeType, videoBitsPerSecond: 12000000 } : undefined);
            }
            if (recorder) {
                recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
                let recordPromise = new Promise(resolve => { recorder.onstop = () => resolve(); });
                recorder.start();
                const track = stream?.getVideoTracks?.()[0];
                const requestFrame = track && typeof track.requestFrame === 'function' ? () => track.requestFrame() : null;
                for (let f = 0; f < total; f++) {
                    const frameNum = frameStart + f;
                    if (window.updateTimelineTime) window.updateTimelineTime(frameNum / fps);
                    scene.updateMatrixWorld(true);
                    cam.updateMatrixWorld(true);
                    cam.updateProjectionMatrix();
                    renderer.clear(true, true, true);
                    window.smRender.render(cam);
                    if (requestFrame) requestFrame();
                    this.fb.updateProgress(f + 1, total);
                    await new Promise(r => setTimeout(r, 1000 / fps));
                }
                this.fb.updateProgress(total, total);
                const progressText = document.getElementById('re-progress-text');
                if (progressText) progressText.innerText = "Encoding Final WebM Video Asset...";
                await new Promise(r => setTimeout(r, 1000));
                recorder.stop();
                await recordPromise;
                const blob = new Blob(chunks, { type: mimeType || 'video/webm' });
                const url = URL.createObjectURL(blob);
                this.fb.showVideo(url, { time: 0 }, cam.name || 'Camera', { w: width, h: height });
            } else {
                alert("MediaRecorder framework is missing or not supported in this environment.");
            }
        } finally {
            renderer.setClearColor(oldClearColor, oldClearAlpha);
            this._restoreAfterRender();
            this._isRenderingVideo = false;
            window.isOfflineRendering = false;
        }
    }
    _prepareForRender(w, h) {
        if (this.backup) return;
        const r = window.renderer;
        this.backup = { w: r.domElement.clientWidth, h: r.domElement.clientHeight, hidden: [] };
        r.setPixelRatio(1);
        r.setSize(w, h, false);
        window.smRender.setSize(w, h);
        window.scene.traverse(o => {
            if (o.isHelper || o.type.includes('Helper') || o.name === '__CameraBody__') {
                if (o.visible) { this.backup.hidden.push(o); o.visible = false; }
            }
        });
    }
    _restoreAfterRender() {
        if (!this.backup) return;
        const r = window.renderer;
        r.setPixelRatio(window.devicePixelRatio || 1);
        r.setSize(this.backup.w, this.backup.h, false);
        window.smRender.setSize(this.backup.w, this.backup.h);
        window.smRender.active = (window.SMViewportShading && window.SMViewportShading.getMode() === 'rendered');
        this.backup.hidden.forEach(o => o.visible = true);
        this.backup = null;
    }
}
window.SMEngineRenderer = new SMRenderEngine();
// ── 5. VIEWPORT SHADING SYSTEM ──────────────────────────────────────────────
// The controller lives in rendering/viewport-shading so the viewport modes,
// materials, studio lights and HDRI handling remain isolated from the render
// composer. It is loaded immediately before this file by both script loaders.
if (!window.SMViewportShading) {
    console.error('[SM Render Pipeline] Viewport shading controller is unavailable.');
}
// ── 6. CAMERA OVERLAY & VIEWPORT CRITERIA ────────────────────────────────────
const SMViewportCameraOverlay = (() => {
    let _overlay = null, _inner = null, _activeCam = null;
    let _viewZoom = 0.8;
    function _build() {
        const existing = document.getElementById('sm-passepartout');
        if (existing) existing.remove();
        const container = document.getElementById('renderer-container') || document.body;
        _overlay = document.createElement('div');
        _overlay.id = 'sm-passepartout';
        _overlay.style.cssText = `
            position: absolute;
            inset: 0;
            pointer-events: none;
            z-index: 8000;
            display: none;
            border-style: solid;
            border-color: rgba(15, 15, 15, 0.9);
            background-color: transparent;
            box-sizing: border-box;
        `;
        _inner = document.createElement('div');
        _inner.style.cssText = `
            width: 100%;
            height: 100%;
            outline: 1px dashed #f5a623;
            box-sizing: border-box;
        `;
        _overlay.appendChild(_inner);
        container.appendChild(_overlay);
        window.addEventListener('resize', () => {
            if (_activeCam && _overlay.style.display !== 'none') update(_activeCam);
        });
    }
    function update(cam) {
        const container = document.getElementById('renderer-container') || document.body;
        if (!container || !_overlay) return;
        const w = container.clientWidth;
        const h = container.clientHeight;
        let aspect = 16 / 9;
        if (window.SMEngineRenderer && window.SMEngineRenderer.settings) {
            aspect = window.SMEngineRenderer.settings.width / window.SMEngineRenderer.settings.height;
        } else if (cam.isOrthographicCamera) {
            aspect = Math.abs((cam.right - cam.left) / (cam.top - cam.bottom));
        } else if (cam.aspect) {
            aspect = cam.aspect;
        }
        const fw = Math.min(w, h * aspect) * _viewZoom;
        const fh = Math.min(h, w / aspect) * _viewZoom;
        const borderY = Math.max(0, (h - fh) / 2);
        const borderX = Math.max(0, (w - fw) / 2);
        _overlay.style.borderWidth = `${borderY}px ${borderX}px`;
    }
    return {
        show: (cam) => {
            _build();
            _activeCam = cam;
            _overlay.style.display = 'block';
            update(cam);
        },
        hide: () => {
            if (_overlay) _overlay.style.display = 'none';
            _activeCam = null;
        },
        getZoomFactor: () => _viewZoom
    };
})();
let _viewState = null, _lockRafId = null;
function _enterCameraView(targetCam) {
    if (!targetCam || !window.camera) return;
    if (window._isInsideCamera && window._viewedCamera === targetCam) {
        _exitCameraView();
        return;
    }
    if (!window._isInsideCamera) {
        _viewState = {
            pos: window.camera.position.clone(),
            rot: window.camera.quaternion.clone(),
            fov: window.camera.fov,
            zoom: window.camera.zoom
        };
    }
    window._isInsideCamera = true;
    window._viewedCamera = targetCam;
    window.scene.traverse(obj => {
        if (obj === targetCam || obj.userData?.primaryCamera === targetCam || obj.userData?.sceneOwner === targetCam.userData?.sceneOwner) {
            obj.traverse(child => {
                if (child.name === '__CameraBody__' || child.type.includes('Helper') || child.isCameraHelper) {
                    child.userData.smrWasVisible = child.visible;
                    child.visible = false;
                }
            });
        }
    });
    const loop = () => {
        if (!window._isInsideCamera) return;
        targetCam.updateMatrixWorld(true);
        targetCam.getWorldPosition(window.camera.position);
        targetCam.getWorldQuaternion(window.camera.quaternion);
        window.camera.fov = targetCam.fov || 50;
        window.camera.zoom = (targetCam.zoom || 1) * SMViewportCameraOverlay.getZoomFactor();
        window.camera.updateProjectionMatrix();
        if (window.controls) window.controls.enabled = false;
        _lockRafId = requestAnimationFrame(loop);
    };
    _lockRafId = requestAnimationFrame(loop);
    SMViewportCameraOverlay.show(targetCam);
}
function _exitCameraView() {
    if (!window._isInsideCamera) return;
    if (_lockRafId) cancelAnimationFrame(_lockRafId);
    if (window._viewedCamera) {
        const targetCam = window._viewedCamera;
        window.scene.traverse(obj => {
            if (obj === targetCam || obj.userData?.primaryCamera === targetCam || obj.userData?.sceneOwner === targetCam.userData?.sceneOwner) {
                obj.traverse(child => {
                    if (child.userData.smrWasVisible !== undefined) {
                        child.visible = child.userData.smrWasVisible;
                        delete child.userData.smrWasVisible;
                    }
                });
            }
        });
    }
    window._isInsideCamera = false;
    window._viewedCamera = null;
    SMViewportCameraOverlay.hide();
    if (_viewState) {
        window.camera.position.copy(_viewState.pos);
        window.camera.quaternion.copy(_viewState.rot);
        window.camera.fov = _viewState.fov;
        window.camera.zoom = _viewState.zoom || 1;
        window.camera.updateProjectionMatrix();
    }
    if (window.controls) {
        window.controls.enabled = true;
        window.controls.update();
    }
}
window._enterCameraView = _enterCameraView;
window._exitCameraView = _exitCameraView;
window.addEventListener('load', () => {
    window.SMViewportShading?.init?.();
    document.getElementById('renderingBTN')?.addEventListener('click', () => window.SMEngineRenderer.executeRender());
});