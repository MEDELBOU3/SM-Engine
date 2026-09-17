// SM Engine Panel: VFXPanel
window.VFXPanel = {
    init() {
        const el = document.getElementById('vfx-studio-panel');
        if (el) {
            el.innerHTML = `
            <!-- â”€â”€ HEADER â”€â”€ -->
            <div class="pro-panel-header vfx-header">
                <div class="vfx-header-left">
                    <i class="fas fa-film vfx-logo-icon"></i>
                    <span class="vfx-title">VFX Studio</span>
                    <span class="vfx-badge">v2</span>
                </div>
                <div class="header-actions">
                    <button class="pro-btn-mini vfx-icon-btn" onclick="vfxStudio.uploadClip()" title="Upload Clip">
                        <i class="fas fa-upload"></i>
                    </button>
                    <button class="pro-btn-mini vfx-icon-btn" onclick="vfxStudio.exportTracks()"
                        title="Export Track Data">
                        <i class="fas fa-file-export"></i>
                    </button>
                    <button class="pro-btn-mini vfx-icon-btn" onclick="vfxStudio.removeFromScene()"
                        title="Remove VFX from Scene">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                    <button class="pro-close-btn" onclick="SecondarySidebar.close()">Ã—</button>
                </div>
            </div>

            <!-- â”€â”€ TABS â”€â”€ -->
            <div class="vfx-mode-bar">
                <button class="vfx-tab active" onclick="vfxStudio.setMode('tracking')">
                    <i class="fas fa-crosshairs"></i> Motion Tracking
                </button>
                <button class="vfx-tab" onclick="vfxStudio.setMode('compositing')">
                    <i class="fas fa-project-diagram"></i> Compositing
                </button>
            </div>

            <!-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• -->
            <!--  MODE 1: MOTION TRACKING                              -->
            <!-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• -->
            <div id="vfx-tracking-ui">

                <!-- â”€â”€ CLIP VIEWPORT â”€â”€ -->
                <div class="clip-editor-container" style="position:relative;">
                    <canvas id="vfx-clip-canvas" width="400" height="225"
                        style="display:block; background:#0e0e10; width:100%;"></canvas>

                    <div class="clip-overlay" id="tracker-overlay"
                        style="position:absolute;top:0;left:0;width:400px;height:225px;cursor:crosshair;"></div>

                    <div id="vfx-toast" style="display:none;"></div>

                    <div class="clip-controls vfx-transport">
                        <button id="vfx-play-btn" class="vfx-transport-btn" onclick="vfxStudio.playVideo()"
                            title="Play/Pause (Space)">
                            <i class="fas fa-play"></i>
                        </button>
                        <button class="vfx-transport-btn"
                            onclick="vfxStudio.video.currentTime=0;vfxStudio._drawFrame();" title="Rewind">
                            <i class="fas fa-fast-backward"></i>
                        </button>
                        <span id="frame-counter" class="vfx-frame-counter">Fr: 0 / 0</span>
                        <span id="vfx-marker-count" class="vfx-marker-count">0 markers</span>
                    </div>
                </div>

                <!-- â”€â”€ TRACKING TOOLBAR â”€â”€ -->
                <div class="vfx-toolbar">
                    <button id="vfx-track-btn" class="vfx-tool-btn primary" onclick="vfxStudio.trackForward()"
                        title="Track Forward (T)">
                        <i class="fas fa-chevron-right"></i> Track
                    </button>
                    <button class="vfx-tool-btn" onclick="vfxStudio.stopTracking()">
                        <i class="fas fa-stop"></i>
                    </button>
                    <button class="vfx-tool-btn" onclick="vfxStudio.clearMarkers()" title="Clear All Markers">
                        <i class="fas fa-times-circle"></i>
                    </button>
                    <div class="vfx-toolbar-spacer"></div>
                    <span class="vfx-hint">Click clip to add markers</span>
                </div>

                <!-- â”€â”€ MARKER LIST â”€â”€ -->
                <div class="pro-group">
                    <div class="pro-group-label-row">
                        <span class="pro-group-label">Tracking Markers</span>
                        <span class="pro-group-hint">Click=select Â· Drag=reposition Â· Del=remove</span>
                    </div>
                    <div id="vfx-marker-list" class="vfx-marker-list">
                        <div class="vfx-empty-state">No markers yet â€” click on the clip above</div>
                    </div>
                </div>

                <!-- â”€â”€ GRAPH EDITOR â”€â”€ -->
                <div class="pro-group">
                    <div class="pro-group-label-row">
                        <span class="pro-group-label">Track Graph</span>
                        <div class="vfx-graph-tabs">
                            <button class="vfx-graph-tab active" data-channel="x"
                                onclick="vfxStudio.setGraphChannel('x')">X</button>
                            <button class="vfx-graph-tab" data-channel="y"
                                onclick="vfxStudio.setGraphChannel('y')">Y</button>
                        </div>
                    </div>
                    <canvas id="vfx-graph-canvas" width="420" height="100"
                        style="display:block;width:100%;border-radius:4px;background:#111118;"></canvas>
                </div>

                <!-- â”€â”€ TRACKING SETTINGS â”€â”€ -->
                <div class="pro-group">
                    <span class="pro-group-label">Track Settings</span>
                    <div class="pro-row">
                        <label class="pro-input-label">Pattern Size</label>
                        <input type="number" class="pro-input" value="11" id="track-pattern-size" min="5" max="51"
                            step="2">
                    </div>
                    <div class="pro-row">
                        <label class="pro-input-label">Search Size</label>
                        <input type="number" class="pro-input" value="21" id="track-search-size" min="11" max="101"
                            step="2">
                    </div>
                    <div class="pro-row">
                        <label class="pro-input-label">Motion Model</label>
                        <select class="pro-select" id="track-model">
                            <option value="loc">Location Only</option>
                            <option value="loc_rot">Location + Rotation</option>
                            <option value="perspective">Perspective</option>
                            <option value="affine">Affine</option>
                        </select>
                    </div>
                </div>

                <!-- â”€â”€ CAMERA SOLVE â”€â”€ -->
                <div class="pro-group">
                    <span class="pro-group-label">Camera Solve</span>
                    <div class="pro-row">
                        <label class="pro-input-label">Keyframe A</label>
                        <input type="number" class="pro-input" placeholder="Auto" id="key-a">
                    </div>
                    <div class="pro-row">
                        <label class="pro-input-label">Keyframe B</label>
                        <input type="number" class="pro-input" placeholder="Auto" id="key-b">
                    </div>
                    <div style="display:flex;gap:6px;margin-bottom:6px;">
                        <button class="vfx-tool-btn" style="flex:1" onclick="vfxStudio.solveCamera()">
                            <i class="fas fa-magic"></i> Solve Camera
                        </button>
                        <button class="vfx-tool-btn" onclick="vfxStudio.toggleCameraView()" title="Toggle Camera View">
                            <i class="fas fa-video"></i>
                        </button>
                    </div>
                    <div id="solve-error" class="vfx-solve-error">
                        <span style="color:#555">â— Run solve to see error</span>
                    </div>
                    <div id="solve-reproj" class="vfx-reproj-info"></div>
                </div>

                <!-- â”€â”€ SETUP SCENE â”€â”€ -->
                <div class="pro-group">
                    <span class="pro-group-label">3D Scene Setup</span>

                    <!-- Background mode chooser â€” THE KEY NEW FEATURE -->
                    <div class="pro-row" style="margin-bottom:8px;">
                        <label class="pro-input-label">Video Mode</label>
                        <select class="pro-select" id="vfx-bg-mode">
                            <option value="plane">3D Plane Object</option>
                            <option value="background">Scene Background</option>
                        </select>
                    </div>

                    <!-- Mode description -->
                    <div id="vfx-mode-desc" class="vfx-mode-desc-box">
                        <div class="vfx-mode-desc-row" data-mode="plane" style="display:flex;">
                            <i class="fas fa-border-all" style="color:#4a9eff;margin-right:6px;"></i>
                            <span><b>3D Plane:</b> Creates a selectable mesh in the scene. Move/scale/parent it like any
                                object. Best for compositing CGI onto footage.</span>
                        </div>
                        <div class="vfx-mode-desc-row" data-mode="background" style="display:none;">
                            <i class="fas fa-expand" style="color:#f39c12;margin-right:6px;"></i>
                            <span><b>Background:</b> Video fills the entire 3D viewport, locked behind all geometry.
                                Same as
                                Blender's Movie Clip "Background" mode.</span>
                        </div>
                    </div>

                    <button class="panel-button primary-button"
                        style="width:100%;font-size:11px;height:34px;margin-top:8px;"
                        onclick="vfxStudio.solveToScene()">
                        <i class="fas fa-check-circle"></i>&nbsp; Setup Tracking Scene
                    </button>
                    <p class="vfx-desc-text">
                        Adds: Video object Â· Solved Camera (with animation) Â· Point Cloud Â· Shadow Floor â†’ all
                        visible
                        in
                        Hierarchy.
                    </p>
                </div>

                <!-- â”€â”€ SHORTCUTS â”€â”€ -->
                <div class="pro-group vfx-shortcuts">
                    <span class="pro-group-label">Keyboard Shortcuts</span>
                    <div class="vfx-shortcut-grid">
                        <kbd>Space</kbd><span>Play / Pause</span>
                        <kbd>T</kbd><span>Track Forward</span>
                        <kbd>S</kbd><span>Solve Camera</span>
                        <kbd>â†/â†’</kbd><span>Step Frame</span>
                        <kbd>Del</kbd><span>Remove selected marker</span>
                        <kbd>Click</kbd><span>Add / select marker</span>
                        <kbd>Drag</kbd><span>Move marker</span>
                    </div>
                </div>
            </div>

            <!-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• -->
            <!--  MODE 2: COMPOSITING                                  -->
            <!-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• -->
            <div id="vfx-compositing-ui" style="display:none;height:100%;flex:1;">
                <div id="vfx-node-mount-point" style="height:100%;position:relative;min-height:400px;"></div>
            </div>

            <!-- Hidden file input -->
            <input type="file" id="vfx-video-upload" accept="video/*" style="display:none"
                onchange="vfxStudio.loadVideo(this)">`;
            console.log('VFXPanel initialized');
        } else {
            console.warn('VFXPanel element not found: vfx-studio-panel');
        }
    }
};
