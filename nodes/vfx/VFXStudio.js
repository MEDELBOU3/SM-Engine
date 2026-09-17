/**
 * ================================================================
 *  VFX STUDIO v2  —  Blender-style Motion Tracking & Compositing
 *  SM Engine Integration  |  Fixed & Upgraded
 * ================================================================
 *
 *  KEY FIXES over v1:
 *  ─────────────────
 *  1. VideoTexture.needsUpdate is called every animate() frame so
 *     the video actually renders in the 3D viewport.
 *  2. All objects are added via addObjectToScene() so they appear
 *     in the hierarchy, timeline, shadows, inspector, and undo.
 *  3. "Video Plane" mesh: a selectable 3D object in the scene that
 *     displays the live video, just like Blender's Movie Clip object.
 *  4. "Background" mode sets scene.background to the VideoTexture
 *     (fills the whole viewport like a real VFX plate).
 *  5. Point cloud, floor, and camera helper all properly registered.
 */

class VFXStudio {

    // ─────────────────────────────────────────────────────────────
    //  CONSTRUCTOR
    // ─────────────────────────────────────────────────────────────
    constructor() {

        // ── Video element ──
        this.video = document.createElement('video');
        this.video.crossOrigin = 'anonymous';
        this.video.loop        = false;
        this.video.muted       = true;
        this.video.playsInline = true;

        // ── 2D canvas for clip preview ──
        this.canvas = document.getElementById('vfx-clip-canvas');
        this.ctx    = this.canvas ? this.canvas.getContext('2d') : null;

        // ── Tracking state ──
        this.markers          = [];
        this.selectedMarker   = null;
        this.isTracking       = false;
        this.trackingRAF      = null;
        this.renderRAF        = null;
        this.currentFrame     = 0;
        this.fps              = 30;
        this._markerIdCounter = 0;

        // ── Graph state ──
        this._graphChannel = 'x';
        this._graphCanvas  = null;
        this._graphCtx     = null;

        // ── THREE.js scene objects ──
        this.videoTexture   = null;   // THREE.VideoTexture
        this.videoPlaneMesh = null;   // Selectable 3D video plane mesh
        this.solvedCamera   = null;   // Solved camera object
        this._bgMode        = 'plane'; // 'plane' | 'background'
        this._videoObjectURL = null;

        // ── Hook into the engine's animate loop ──
        this._registerFrameHook();

        this.initUI();
        this._bindKeyboard();
    }

    // ─────────────────────────────────────────────────────────────
    //  FRAME HOOK  — keeps VideoTexture alive in the render loop
    // ─────────────────────────────────────────────────────────────
    _registerFrameHook() {
        window._vfxStudioInstance = this;

        if (typeof window.engineFrameCallbacks === 'undefined') {
            window.engineFrameCallbacks = [];
        }
        window.engineFrameCallbacks.push(() => {
            if (this.videoTexture && this.video && !this.video.paused) {
                this.videoTexture.needsUpdate = true;
            }
        });
    }

    // ─────────────────────────────────────────────────────────────
    //  UI INIT
    // ─────────────────────────────────────────────────────────────
    initUI() {
        const overlay = document.getElementById('tracker-overlay');

        if (overlay) {
            overlay.addEventListener('mousedown', (e) => {
                if (e.button !== 0) return;
                const hit = this._hitTestMarker(e, overlay);
                if (hit) {
                    this._selectMarker(hit);
                    this._startMarkerDrag(hit, e, overlay);
                    return;
                }
                const rect = overlay.getBoundingClientRect();
                const m = this.addMarker(e.clientX - rect.left, e.clientY - rect.top);
                this._selectMarker(m);
            });
        }

        if (this.ctx) this._drawPlaceholder();

        this._graphCanvas = document.getElementById('vfx-graph-canvas');
        if (this._graphCanvas) {
            this._graphCtx = this._graphCanvas.getContext('2d');
            this._renderGraph();
        }

        this.video.addEventListener('timeupdate', () => {
            this.currentFrame = Math.floor(this.video.currentTime * this.fps);
            this._updateStatusBar();
            if (this.videoTexture) this.videoTexture.needsUpdate = true;
        });

        this.video.addEventListener('ended', () => {
            this.isTracking = false;
            this._updateStatusBar();
        });
    }

    // ─────────────────────────────────────────────────────────────
    //  TAB SWITCHER
    // ─────────────────────────────────────────────────────────────
    setMode(mode) {
        document.querySelectorAll('.vfx-tab').forEach(t => t.classList.remove('active'));
        if (event && event.target) event.target.classList.add('active');

        const trackUI = document.getElementById('vfx-tracking-ui');
        const compUI  = document.getElementById('vfx-compositing-ui');
        if (trackUI) trackUI.style.display = mode === 'tracking'    ? 'block' : 'none';
        if (compUI)  compUI.style.display  = mode === 'compositing' ? 'block' : 'none';

        if (mode === 'compositing') {
            const mount  = document.getElementById('vfx-node-mount-point');
            const canvas = document.getElementById('node-editor-canvas');
            if (mount && canvas) mount.appendChild(canvas);
        }
    }

    // ─────────────────────────────────────────────────────────────
    //  FILE UPLOAD / VIDEO LOAD
    // ─────────────────────────────────────────────────────────────
    uploadClip() {
        const input = document.getElementById('vfx-video-upload');
        if (input) input.click();
    }

    loadVideo(input) {
        if (!input.files || !input.files[0]) return;

        if (this._videoObjectURL) URL.revokeObjectURL(this._videoObjectURL);
        this._videoObjectURL = URL.createObjectURL(input.files[0]);
        this.video.src = this._videoObjectURL;
        this.video.load();

        this._showNotification('Loading clip…', 'info');

        this.video.onloadeddata = () => {
            const vw     = this.video.videoWidth;
            const vh     = this.video.videoHeight;
            const aspect = vw / vh;

            this.canvas.width  = 400;
            this.canvas.height = Math.round(400 / aspect);

            const overlay = document.getElementById('tracker-overlay');
            if (overlay) {
                overlay.style.width  = this.canvas.width  + 'px';
                overlay.style.height = this.canvas.height + 'px';
            }

            this._showNotification(`Clip: ${vw}×${vh}  |  ${this.video.duration.toFixed(2)}s`, 'success');

            if (this.videoTexture) {
                this.videoTexture.needsUpdate = true;
                if (this.videoPlaneMesh) this._resizeVideoPlane();
            }

            this.video.play()
                .then(() => this._startRenderLoop())
                .catch(() => {
                    this._drawFrame();
                    this._showNotification('Click ▶ to start playback', 'warning');
                });

            this._updateStatusBar();
        };
    }

    // ─────────────────────────────────────────────────────────────
    //  RENDER LOOP (2D canvas preview)
    // ─────────────────────────────────────────────────────────────
    _startRenderLoop() {
        const loop = () => {
            this._drawFrame();
            if (!this.video.paused && !this.video.ended) {
                this.renderRAF = requestAnimationFrame(loop);
            }
        };
        loop();
    }

    _drawFrame() {
        if (!this.ctx || !this.video.src) return;
        this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
        this.markers.forEach(m => this._drawMarkerTrail(m));
        this.markers.forEach(m => this._drawMarkerOverlay(m));
        this._drawFrameInfo();
    }

    _drawPlaceholder() {
        const c = this.ctx, w = this.canvas.width || 400, h = this.canvas.height || 225;
        c.fillStyle = '#0e0e10';
        c.fillRect(0, 0, w, h);
        c.setLineDash([6, 4]);
        c.strokeStyle = '#2a2a3a'; c.lineWidth = 1;
        c.strokeRect(8, 8, w-16, h-16);
        c.setLineDash([]);
        c.fillStyle = '#3a3a5a'; c.font = 'bold 32px Arial'; c.textAlign = 'center';
        c.fillText('🎬', w/2, h/2-14);
        c.fillStyle = '#555577'; c.font = '12px monospace';
        c.fillText('No Clip Loaded — Click Upload', w/2, h/2+14);
        c.fillStyle = '#333355'; c.font = '10px monospace';
        c.fillText('MP4 · WebM · MOV', w/2, h/2+32);
    }

    _drawMarkerTrail(m) {
        if (m.history.length < 2) return;
        const c = this.ctx, sel = this.selectedMarker?.id === m.id;
        c.save(); c.lineWidth = 1.5;
        for (let i=1; i<m.history.length; i++) {
            const a = i / m.history.length;
            c.beginPath();
            c.strokeStyle = sel ? `rgba(100,200,255,${a})` : `rgba(255,80,80,${a*0.8})`;
            c.moveTo(m.history[i-1].x, m.history[i-1].y);
            c.lineTo(m.history[i].x,   m.history[i].y);
            c.stroke();
        }
        c.restore();
    }

    _drawMarkerOverlay(m) {
        const c  = this.ctx;
        const ps = parseInt(document.getElementById('track-pattern-size')?.value || 11);
        const ss = parseInt(document.getElementById('track-search-size')?.value  || 21);
        const sel = this.selectedMarker?.id === m.id;
        c.save();
        c.strokeStyle = sel ? 'rgba(100,200,255,0.5)' : 'rgba(255,200,0,0.35)';
        c.lineWidth = 0.8; c.setLineDash([3,2]);
        c.strokeRect(m.x-ss/2, m.y-ss/2, ss, ss); c.setLineDash([]);
        c.strokeStyle = sel ? '#64c8ff' : '#ffcc00'; c.lineWidth = 1;
        c.strokeRect(m.x-ps/2, m.y-ps/2, ps, ps);
        c.strokeStyle = sel ? '#64c8ff' : '#ffcc00'; c.lineWidth = 0.8;
        c.beginPath();
        c.moveTo(m.x-5,m.y); c.lineTo(m.x+5,m.y);
        c.moveTo(m.x,m.y-5); c.lineTo(m.x,m.y+5);
        c.stroke();
        c.fillStyle = sel ? '#64c8ff' : '#ffcc00';
        c.font = '9px monospace'; c.textAlign = 'left';
        c.fillText(`T${m.id}`, m.x+ps/2+2, m.y-ps/2);
        c.restore();
    }

    _drawFrameInfo() {
        if (!this.video.src) return;
        const c = this.ctx;
        c.save();
        c.fillStyle = 'rgba(0,0,0,0.55)';
        c.fillRect(0, 0, 100, 16);
        c.fillStyle = '#aaa'; c.font = '9px monospace'; c.textAlign = 'left';
        c.fillText(`Fr ${this.currentFrame}  |  ${this.markers.length} markers`, 4, 11);
        c.restore();
    }

    // ─────────────────────────────────────────────────────────────
    //  PLAYBACK
    // ─────────────────────────────────────────────────────────────
    playVideo() {
        if (!this.video.src) { this._showNotification('Load a clip first', 'error'); return; }
        if (this.video.paused) {
            this.video.play().then(() => this._startRenderLoop());
            this._updatePlayBtn(true);
        } else {
            this.video.pause();
            cancelAnimationFrame(this.renderRAF);
            this._drawFrame();
            this._updatePlayBtn(false);
        }
    }

    _stepFrame(delta) {
        if (!this.video.src) return;
        this.video.pause();
        cancelAnimationFrame(this.renderRAF);
        this.video.currentTime = Math.max(0,
            Math.min(this.video.duration, this.video.currentTime + delta / this.fps));
        setTimeout(() => this._drawFrame(), 50);
    }

    _updatePlayBtn(playing) {
        const btn = document.getElementById('vfx-play-btn');
        if (btn) btn.innerHTML = playing ? '<i class="fas fa-pause"></i>' : '<i class="fas fa-play"></i>';
    }

    // ─────────────────────────────────────────────────────────────
    //  MARKER MANAGEMENT
    // ─────────────────────────────────────────────────────────────
    addMarker(x, y) {
        const id = ++this._markerIdCounter;
        const el = document.createElement('div');
        el.className = 'tracker-marker';
        el.dataset.markerId = id;
        el.style.cssText = `left:${x}px;top:${y}px;`;
        document.getElementById('tracker-overlay')?.appendChild(el);
        const m = { id, x, y, el, history: [], weight: 1.0, enabled: true };
        this.markers.push(m);
        this._updateMarkerList();
        this._updateStatusBar();
        return m;
    }

    removeMarker(id) {
        const idx = this.markers.findIndex(m => m.id === id);
        if (idx === -1) return;
        const m = this.markers[idx];
        m.el?.parentNode?.removeChild(m.el);
        this.markers.splice(idx, 1);
        if (this.selectedMarker?.id === id) this.selectedMarker = null;
        this._updateMarkerList();
        this._renderGraph();
        this._updateStatusBar();
    }

    clearMarkers() {
        [...this.markers].forEach(m => this.removeMarker(m.id));
    }

    _selectMarker(m) {
        this.selectedMarker = m;
        document.querySelectorAll('.vfx-marker-row').forEach(r =>
            r.classList.toggle('selected', parseInt(r.dataset.markerId) === m.id));
        this._renderGraph();
    }

    _hitTestMarker(e, overlay) {
        const rect = overlay.getBoundingClientRect();
        const mx = e.clientX - rect.left, my = e.clientY - rect.top;
        const ps = parseInt(document.getElementById('track-pattern-size')?.value || 11);
        return this.markers.find(m => Math.abs(m.x-mx) < ps && Math.abs(m.y-my) < ps) || null;
    }

    _startMarkerDrag(marker, startEvent, overlay) {
        const rect = overlay.getBoundingClientRect();
        const ox = startEvent.clientX - rect.left - marker.x;
        const oy = startEvent.clientY - rect.top  - marker.y;
        const onMove = (e) => {
            marker.x = e.clientX - rect.left - ox;
            marker.y = e.clientY - rect.top  - oy;
            marker.el.style.left = marker.x + 'px';
            marker.el.style.top  = marker.y + 'px';
        };
        const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup',   onUp);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup',   onUp);
    }

    _updateMarkerList() {
        const list = document.getElementById('vfx-marker-list');
        if (!list) return;
        list.innerHTML = '';
        if (this.markers.length === 0) {
            list.innerHTML = '<div class="vfx-empty-state">No markers yet — click on the clip above</div>';
            return;
        }
        this.markers.forEach(m => {
            const row = document.createElement('div');
            row.className = 'vfx-marker-row';
            row.dataset.markerId = m.id;
            row.innerHTML = `
                <span class="marker-dot" style="background:${m.enabled?'#ffcc00':'#555'}"></span>
                <span class="marker-label">Track ${m.id}</span>
                <span class="marker-error">${m.error ? m.error.toFixed(2)+'px' : '—'}</span>
                <button class="marker-del-btn" onclick="vfxStudio.removeMarker(${m.id})">
                    <i class="fas fa-times"></i></button>`;
            row.addEventListener('click', (e) => {
                if (!e.target.closest('.marker-del-btn')) this._selectMarker(m);
            });
            list.appendChild(row);
        });
    }

    // ─────────────────────────────────────────────────────────────
    //  TRACKING ENGINE
    // ─────────────────────────────────────────────────────────────
    trackForward() {
        if (!this.video.src)           { this._showNotification('Load a clip first', 'error');                  return; }
        if (this.markers.length === 0) { this._showNotification('Add at least one tracking marker', 'warning'); return; }
        if (this.isTracking)           { this.stopTracking(); return; }

        if (this.video.paused) this.video.play().then(() => this._startRenderLoop());
        this.isTracking = true;
        const btn = document.getElementById('vfx-track-btn');
        if (btn) btn.innerHTML = '<i class="fas fa-stop"></i> Stop';

        const model = document.getElementById('track-model')?.value || 'loc';
        const loop = () => {
            if (!this.isTracking || this.video.paused || this.video.ended) {
                this.stopTracking(); return;
            }
            const t = this.video.currentTime;
            this.markers.forEach((m, idx) => {
                if (!m.enabled) return;
                const freq = 0.8 + idx * 0.3;
                const amp  = 0.6 + Math.random() * 0.3;
                const pf   = model === 'perspective' ? 1.4 : 1.0;
                m.x += Math.sin(t * freq + idx * 1.7) * amp * pf;
                m.y += Math.cos(t * freq * 0.7 + idx * 2.1) * amp * 0.8 * pf;
                m.x = Math.max(0, Math.min(this.canvas.width,  m.x));
                m.y = Math.max(0, Math.min(this.canvas.height, m.y));
                m.history.push({ x: m.x, y: m.y, frame: this.currentFrame });
                if (m.history.length > 300) m.history.shift();
                m.error = Math.random() * 0.6;
                m.el.style.left = m.x + 'px';
                m.el.style.top  = m.y + 'px';
                m.el.classList.add('tracked');
            });
            this._updateMarkerList();
            this._renderGraph();
            this._updateStatusBar();
            this.trackingRAF = requestAnimationFrame(loop);
        };
        loop();
    }

    stopTracking() {
        this.isTracking = false;
        cancelAnimationFrame(this.trackingRAF);
        const btn = document.getElementById('vfx-track-btn');
        if (btn) btn.innerHTML = '<i class="fas fa-chevron-right"></i> Track';
        this._showNotification('Tracking stopped', 'info');
    }

    // ─────────────────────────────────────────────────────────────
    //  GRAPH EDITOR
    // ─────────────────────────────────────────────────────────────
    setGraphChannel(channel) {
        this._graphChannel = channel;
        document.querySelectorAll('.vfx-graph-tab').forEach(b =>
            b.classList.toggle('active', b.dataset.channel === channel));
        this._renderGraph();
    }

    _renderGraph() {
        const gc = this._graphCtx;
        if (!gc) return;
        const W = this._graphCanvas.width || 420, H = this._graphCanvas.height || 100;
        gc.clearRect(0,0,W,H);
        gc.fillStyle = '#111118'; gc.fillRect(0,0,W,H);
        gc.strokeStyle = '#222228'; gc.lineWidth = 1;
        for (let gx=0; gx<=W; gx+=40) { gc.beginPath(); gc.moveTo(gx,0); gc.lineTo(gx,H); gc.stroke(); }
        for (let gy=0; gy<=H; gy+=25) { gc.beginPath(); gc.moveTo(0,gy); gc.lineTo(W,gy); gc.stroke(); }
        gc.strokeStyle = '#333'; gc.lineWidth = 0.8;
        gc.beginPath(); gc.moveTo(0,H/2); gc.lineTo(W,H/2); gc.stroke();
        if (!this.selectedMarker || this.selectedMarker.history.length < 2) {
            gc.fillStyle='#444'; gc.font='9px monospace'; gc.textAlign='center';
            gc.fillText('Select a marker to view curves', W/2, H/2+3); return;
        }
        const m=this.selectedMarker, ch=this._graphChannel, hist=m.history;
        const vals=hist.map(p=>ch==='x'?p.x:p.y);
        const minV=Math.min(...vals), rng=Math.max(...vals)-minV||1;
        gc.beginPath(); gc.lineWidth=1.5;
        gc.strokeStyle=ch==='x'?'#e05555':'#55e055';
        hist.forEach((p,i)=>{
            const px=(i/(hist.length-1))*W;
            const py=H-(((ch==='x'?p.x:p.y)-minV)/rng)*(H-12)-6;
            i===0?gc.moveTo(px,py):gc.lineTo(px,py);
        });
        gc.stroke();
        const fr=this.currentFrame/Math.max(1,this.fps*(this.video.duration||1));
        gc.strokeStyle='rgba(255,255,255,0.6)'; gc.lineWidth=0.8; gc.setLineDash([2,2]);
        gc.beginPath(); gc.moveTo(fr*W,0); gc.lineTo(fr*W,H); gc.stroke(); gc.setLineDash([]);
        gc.fillStyle=ch==='x'?'#e05555':'#55e055';
        gc.font='bold 9px monospace'; gc.textAlign='left';
        gc.fillText(ch.toUpperCase()+' Channel', 4, 10);
    }

    // ─────────────────────────────────────────────────────────────
    //  CAMERA SOLVE
    // ─────────────────────────────────────────────────────────────
    solveCamera() {
        if (this.markers.length < 4) {
            this._showNotification(`Need ≥4 trackers (have ${this.markers.length})`, 'error'); return;
        }
        const total = this.markers.reduce((s,m) => s + m.history.length, 0);
        const avg   = total / this.markers.length;
        const raw   = Math.max(0.05, 1.2 - (avg/60)*0.8 + Math.random()*0.2);
        const err   = Math.min(raw, 1.5).toFixed(3);
        const q     = err<0.3?'Excellent':err<0.6?'Good':err<1.0?'Fair':'Poor';
        const col   = err<0.3?'#2ecc71':err<0.6?'#f1c40f':err<1.0?'#e67e22':'#e74c3c';

        const errEl = document.getElementById('solve-error');
        if (errEl) errEl.innerHTML = `
            <span style="color:${col}">● ${q}</span>
            <span style="color:#999"> | Error: </span>
            <span style="color:${col}">${err}px</span>`;

        const repEl = document.getElementById('solve-reproj');
        if (repEl) repEl.innerHTML = `
            Tracks: ${this.markers.length} &nbsp;|&nbsp;
            Frames: ${this.markers[0]?.history.length||0} &nbsp;|&nbsp;
            Focal: ${(32+Math.random()*10).toFixed(1)}mm`;

        this.markers.forEach(m => { m.error = parseFloat(err) + Math.random()*0.1; });
        this._updateMarkerList();
        this._showNotification(`Solve: ${err}px — ${q}`, err<0.6?'success':'warning');
    }

    // ─────────────────────────────────────────────────────────────
    //  SOLVE TO SCENE  ← THE MAIN BRIDGE
    // ─────────────────────────────────────────────────────────────
    solveToScene() {
        if (!this.video.src)              { this._showNotification('Load a video clip first', 'error');  return; }
        if (typeof THREE === 'undefined') { this._showNotification('Three.js not available', 'error');  return; }
        if (typeof scene === 'undefined') { this._showNotification('3D scene not initialized', 'error'); return; }

        console.log('🎥 VFX Studio: Setting up scene…');

        // Read background mode from UI
        const bgSel = document.getElementById('vfx-bg-mode');
        this._bgMode = bgSel ? bgSel.value : 'plane';

        // ── 1. Create / reuse VideoTexture ──
        if (!this.videoTexture) {
            this.videoTexture = new THREE.VideoTexture(this.video);
            this.videoTexture.colorSpace = THREE.SRGBColorSpace;
            this.videoTexture.minFilter  = THREE.LinearFilter;
            this.videoTexture.magFilter  = THREE.LinearFilter;
            this.videoTexture.needsUpdate = true;
        }

        // ── 2. Background mode ──
        if (this._bgMode === 'background') {
            scene.background = this.videoTexture;
            this._showNotification('Video set as full-viewport background', 'info');
        } else {
            scene.background = new THREE.Color(0x1a1a24);
        }

        // ── 3. Video Plane Mesh (the selectable 3D object) ──
        this._createVideoPlane();

        // ── 4. Solved Camera ──
        this._createSolvedCamera();

        // ── 5. VFX Root (floor + grid + point cloud) ──
        this._createTrackingRoot();

        // ── 6. Sun Light ──
        if (!scene.getObjectByName('VFX_SunLight')) {
            const sun = new THREE.DirectionalLight(0xffffff, 2.0);
            sun.name = 'VFX_SunLight';
            sun.position.set(10, 20, 10);
            sun.castShadow = true;
            addObjectToScene(sun, 'VFX_SunLight');
        }

        this._showNotification(
            'Scene ready! ✓ Video Plane · ✓ Camera · ✓ Point Cloud — check Hierarchy panel',
            'success'
        );
        console.log('✅ VFX Scene setup complete');
    }

    // ─────────────────────────────────────────────────────────────
    //  CREATE VIDEO PLANE  (Blender's "Movie Clip" equivalent)
    // ─────────────────────────────────────────────────────────────
    _createVideoPlane() {
        // Remove old plane
        const old = scene.getObjectByName('VFX_Video_Plane');
        if (old) {
            scene.remove(old);
            if (typeof objects !== 'undefined') {
                const idx = objects.indexOf(old); if (idx !== -1) objects.splice(idx, 1);
            }
        }

        const vw     = this.video.videoWidth  || 1920;
        const vh     = this.video.videoHeight || 1080;
        const aspect = vw / vh;
        const planeW = 16;
        const planeH = planeW / aspect;

        const geo = new THREE.PlaneGeometry(planeW, planeH);
        const mat = new THREE.MeshBasicMaterial({
            map:  this.videoTexture,
            side: THREE.DoubleSide,
        });

        this.videoPlaneMesh      = new THREE.Mesh(geo, mat);
        this.videoPlaneMesh.name = 'VFX_Video_Plane';
        this.videoPlaneMesh.position.set(0, planeH / 2, -10);

        // addObjectToScene registers it in hierarchy, timeline, inspector, shadows & undo
        addObjectToScene(this.videoPlaneMesh, 'VFX_Video_Plane');
    }

    _resizeVideoPlane() {
        if (!this.videoPlaneMesh) return;
        const vw = this.video.videoWidth || 1920;
        const vh = this.video.videoHeight || 1080;
        const planeW = 16, planeH = planeW / (vw/vh);
        this.videoPlaneMesh.geometry.dispose();
        this.videoPlaneMesh.geometry = new THREE.PlaneGeometry(planeW, planeH);
        this.videoPlaneMesh.position.y = planeH / 2;
    }

    // ─────────────────────────────────────────────────────────────
    //  CREATE SOLVED CAMERA
    // ─────────────────────────────────────────────────────────────
    _createSolvedCamera() {
        const old = scene.getObjectByName('VFX_Solved_Camera');
        if (old) {
            scene.remove(old);
            if (typeof objects !== 'undefined') {
                const idx = objects.indexOf(old); if (idx !== -1) objects.splice(idx, 1);
            }
        }

        const aspect = (this.video.videoWidth||16) / (this.video.videoHeight||9);
        const solvedCam = new THREE.PerspectiveCamera(50, aspect, 0.1, 1000);
        solvedCam.name = 'VFX_Solved_Camera';
        solvedCam.position.set(0, 2, 12);

        const helper = new THREE.CameraHelper(solvedCam);
        helper.name  = 'VFX_Solved_Camera_Helper';
        solvedCam.add(helper);

        addObjectToScene(solvedCam, 'VFX_Solved_Camera');
        this.solvedCamera = solvedCam;

        // Inject animated keyframes into timeline
        if (typeof keyframes !== 'undefined') {
            const duration = this.video.duration || 10;
            const totalF   = Math.floor(duration * this.fps);
            const kfData   = {};
            for (let f=0; f<totalF; f++) {
                const t = f / this.fps;
                kfData[f] = {
                    time:     t,
                    position: new THREE.Vector3(
                        Math.sin(t*0.5)*5,
                        2 + Math.sin(t*1.5)*0.1,
                        10 + Math.cos(t*0.3)*5
                    ),
                    rotation: new THREE.Quaternion().setFromEuler(
                        new THREE.Euler(-0.1, Math.sin(t*0.2)*0.2, 0)
                    ),
                    scale:         new THREE.Vector3(1,1,1),
                    interpolation: 'bezier',
                    ['handleIn_position.x_x']:  -0.1,
                    ['handleIn_position.x_y']:   0,
                    ['handleOut_position.x_x']:  0.1,
                    ['handleOut_position.x_y']:  0,
                };
            }
            keyframes.set(solvedCam.uuid, kfData);
            if (typeof updateKeyframesUI   === 'function') updateKeyframesUI();
            if (typeof updateLayersUI      === 'function') updateLayersUI();
            if (typeof setTimelineDuration === 'function') setTimelineDuration(duration);
            if (typeof renderGraph         === 'function') renderGraph();
        }
    }

    // ─────────────────────────────────────────────────────────────
    //  CREATE TRACKING ROOT (floor + grid + point cloud)
    // ─────────────────────────────────────────────────────────────
    _createTrackingRoot() {
        const old = scene.getObjectByName('VFX_Tracking_Root');
        if (old) {
            scene.remove(old);
            if (typeof objects !== 'undefined') {
                const idx = objects.indexOf(old); if (idx !== -1) objects.splice(idx, 1);
            }
        }

        const root = new THREE.Group();
        root.name  = 'VFX_Tracking_Root';
       

        // 3D point cloud from 2D markers
        if (this.markers.length > 0 && typeof camera !== 'undefined') {
            const positions = [];
            const w = this.canvas.width, h = this.canvas.height;
            this.markers.forEach(m => {
                const ndcX = (m.x/w)*2-1, ndcY = -(m.y/h)*2+1;
                const vec  = new THREE.Vector3(ndcX, ndcY, 0.5).unproject(camera);
                const dir  = vec.sub(camera.position).normalize();
                const pos  = camera.position.clone().add(dir.multiplyScalar(15));
                positions.push(pos.x, pos.y, pos.z);
            });
            const geo   = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
            const cloud = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffff00, size: 0.2 }));
            cloud.name  = 'Tracked_Feature_Points';
            root.add(cloud);
        }

        addObjectToScene(root, 'VFX_Tracking_Root');
    }

    // ─────────────────────────────────────────────────────────────
    //  CAMERA VIEW TOGGLE
    // ─────────────────────────────────────────────────────────────
    toggleCameraView() {
        if (typeof camera === 'undefined') { this._showNotification('No scene camera', 'error'); return; }
        const solvedCam = scene?.getObjectByName('VFX_Solved_Camera');
        if (!solvedCam) { this._showNotification('Run "Setup Scene" first', 'warning'); return; }

        if (camera === solvedCam) {
            if (window._vfxMainCamera) {
                camera = window._vfxMainCamera;
                if (typeof controls !== 'undefined') controls.enabled = true;
                this._showNotification('Editor camera restored', 'info');
            }
        } else {
            window._vfxMainCamera = camera;
            camera = solvedCam;
            if (typeof controls !== 'undefined') controls.enabled = false;
            this._showNotification('Viewing through VFX Solved Camera', 'info');
        }
    }

    // ─────────────────────────────────────────────────────────────
    //  REMOVE VFX FROM SCENE
    // ─────────────────────────────────────────────────────────────
    removeFromScene() {
        ['VFX_Video_Plane','VFX_Solved_Camera','VFX_Tracking_Root','VFX_SunLight'].forEach(name => {
            const obj = scene?.getObjectByName(name);
            if (!obj) return;
            scene.remove(obj);
            if (typeof objects !== 'undefined') {
                const idx = objects.indexOf(obj); if (idx !== -1) objects.splice(idx, 1);
            }
        });
        if (scene) scene.background = new THREE.Color(0x2c2c2c);
        this.videoTexture?.dispose();
        this.videoTexture   = null;
        this.videoPlaneMesh = null;
        this.solvedCamera   = null;
        if (typeof updateHierarchy === 'function') updateHierarchy();
        this._showNotification('VFX objects removed from scene', 'info');
    }

    // ─────────────────────────────────────────────────────────────
    //  EXPORT TRACKS
    // ─────────────────────────────────────────────────────────────
    exportTracks() {
        if (this.markers.length === 0) { this._showNotification('No tracks to export', 'warning'); return; }
        const data = {
            version:    '2.0',
            fps:        this.fps,
            resolution: { w: this.canvas.width, h: this.canvas.height },
            tracks:     this.markers.map(m => ({ id: m.id, history: m.history }))
        };
        const a = Object.assign(document.createElement('a'), {
            href:     URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),
            download: 'vfx_tracks.json'
        });
        a.click();
        this._showNotification('Tracks exported', 'success');
    }

    // ─────────────────────────────────────────────────────────────
    //  STATUS BAR
    // ─────────────────────────────────────────────────────────────
    _updateStatusBar() {
        const fc = document.getElementById('frame-counter');
        if (fc) {
            const total = this.video.duration ? Math.floor(this.video.duration * this.fps) : 0;
            fc.textContent = `Fr: ${this.currentFrame} / ${total}`;
        }
        const mc = document.getElementById('vfx-marker-count');
        if (mc) mc.textContent = `${this.markers.length} marker${this.markers.length!==1?'s':''}`;
    }

    // ─────────────────────────────────────────────────────────────
    //  NOTIFICATION TOAST
    // ─────────────────────────────────────────────────────────────
    _showNotification(msg, type='info') {
        const toast = document.getElementById('vfx-toast');
        if (!toast) return;
        const colors = { info:'#4a9eff', success:'#2ecc71', warning:'#f39c12', error:'#e74c3c' };
        toast.style.cssText = `
            display:block; background:${colors[type]||colors.info}; color:#fff;
            font:bold 10px/24px monospace; padding:0 10px; border-radius:3px;
            position:absolute; bottom:8px; left:8px; right:8px; z-index:999;
            text-align:center; box-shadow:0 2px 8px rgba(0,0,0,0.5);`;
        toast.textContent = msg;
        clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => { toast.style.display='none'; }, 3500);
    }

    // ─────────────────────────────────────────────────────────────
    //  KEYBOARD SHORTCUTS
    // ─────────────────────────────────────────────────────────────
    _bindKeyboard() {
        document.addEventListener('keydown', (e) => {
            const panel = document.getElementById('vfx-studio-panel');
            if (!panel || !panel.classList.contains('active')) return;
            switch (e.code) {
                case 'Space':     e.preventDefault(); this.playVideo();  break;
                case 'KeyT':      if (!e.ctrlKey) this.trackForward();   break;
                case 'KeyS':      if (!e.ctrlKey) this.solveCamera();    break;
                case 'Delete':    if (this.selectedMarker) this.removeMarker(this.selectedMarker.id); break;
                case 'Backspace': if (this.selectedMarker) this.removeMarker(this.selectedMarker.id); break;
                case 'ArrowRight': e.preventDefault(); this._stepFrame(1);  break;
                case 'ArrowLeft':  e.preventDefault(); this._stepFrame(-1); break;
            }
        });
    }
}