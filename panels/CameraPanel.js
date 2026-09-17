// ============================================================================
// panels/CameraPanel.js — Cinematic Camera Inspector
// SM Engine — Flat DCC Style
//
// Supports:
//   - Regular PerspectiveCamera / OrthographicCamera
//   - Cube Camera proxies (smCubeCameraProxy)
//   - Preview mode (PILOT) with yellow highlighting
//   - Active render camera switching with 4 fallbacks
// ============================================================================

window.CameraPanel = {
    _bound: false,
    _selectedCamera: null,

    init() {
        const container = window.PanelDockManager?.mountPanel?.({
            id: 'camera',
            title: 'Camera',
            icon: 'fas fa-video',
            elementId: 'camera-editor-container',
            className: 'inspector-card dcc-software-card',
            display: 'block'
        });

        if (!container) return;

        if (
            window.LightingPanel &&
            typeof window.LightingPanel._injectSoftwareStyles === 'function'
        ) {
            window.LightingPanel._injectSoftwareStyles();
        }

        this.renderPanel(container);

        if (!this._bound) {
            this._bound = true;

            // ---- LISTEN for BOTH camera AND cube-camera-proxy selection ----
            const handleSelection = (obj) => {
                if (!obj) {
                    this.close();
                    return;
                }

                const isDirectCamera = obj.isCamera === true;
                const isCubeProxy = obj.userData?.smCubeCameraProxy === true;

                if (isDirectCamera || isCubeProxy) {
                    this._selectedCamera = obj;
                    this.open(obj);
                } else if (
                    container &&
                    container.style.display !== 'none'
                ) {
                    this.close();
                }
            };

            window.addEventListener('objectSelected', (e) => {
                handleSelection(e.detail?.object || window.selectedObject);
            });

            window.addEventListener('sm:object-selected', (e) => {
                handleSelection(e.detail?.object || window.selectedObject);
            });

            window.addEventListener('sm:selection-changed', (e) => {
                handleSelection(e.detail?.current || window.selectedObject);
            });

            window.updateCameraUI = (cam) => {
                if (cam?.isCamera || cam?.userData?.smCubeCameraProxy) {
                    this.open(cam);
                }
            };
        }
    },

    // ========================================================================
    // UI
    // ========================================================================

    renderPanel(container) {
        container.innerHTML = `
            <div class="dcc-panel-header">
                <div class="dcc-header-title">
                    <i class="fas fa-video text-blue"></i>
                    <span>CINEMATIC CAMERA</span>
                </div>
                <button
                    id="close-camera-x-btn"
                    class="dcc-close-btn"
                    title="Close Panel"
                    type="button"
                >✕</button>
            </div>

            <div class="dcc-panel-body">

                <!-- =========================================================
                     LENS
                     ========================================================= -->
                <div class="dcc-section">
                    <div class="dcc-section-title">LENS & SENSOR</div>

                    <div class="dcc-row">
                        <span class="dcc-label">Film Gate</span>
                        <select id="cam-film-back" class="dcc-select">
                            <option value="35">35mm Full Frame</option>
                            <option value="s35">Super 35mm</option>
                            <option value="imax">IMAX 70mm</option>
                            <option value="custom">Custom</option>
                        </select>
                    </div>

                    <div class="dcc-row">
                        <span class="dcc-label">Focal (mm)</span>
                        <div class="dcc-slider-group">
                            <input
                                type="range"
                                id="cam-focal-range"
                                min="12"
                                max="300"
                                step="1"
                                value="35"
                                class="dcc-range"
                            >
                            <input
                                type="number"
                                id="cam-focal"
                                min="1"
                                max="500"
                                step="1"
                                value="35"
                                class="dcc-input dcc-num-small"
                            >
                        </div>
                    </div>

                    <div class="dcc-row">
                        <span class="dcc-label">Field of View</span>
                        <div class="dcc-slider-group">
                            <input
                                type="range"
                                id="cam-fov"
                                min="5"
                                max="140"
                                step="0.1"
                                value="54.4"
                                class="dcc-range"
                            >
                            <span id="cam-fov-lbl" class="dcc-val-tag">54.4°</span>
                        </div>
                    </div>

                    <div class="dcc-row">
                        <span class="dcc-label">Lens Preset</span>
                        <select id="cam-lens-preset" class="dcc-select">
                            <option value="custom">Custom</option>
                            <option value="18">18mm — Ultra Wide</option>
                            <option value="24">24mm — Wide</option>
                            <option value="35">35mm — Natural</option>
                            <option value="50">50mm — Standard</option>
                            <option value="85">85mm — Portrait</option>
                            <option value="135">135mm — Telephoto</option>
                            <option value="200">200mm — Long Lens</option>
                        </select>
                    </div>

                    <div class="dcc-row">
                        <span class="dcc-label">Sensor Width</span>
                        <div class="dcc-slider-group">
                            <input
                                type="number"
                                id="cam-sensor-width"
                                min="5"
                                max="100"
                                step="0.1"
                                value="36"
                                class="dcc-input dcc-num-wide"
                            >
                            <span class="dcc-val-tag">mm</span>
                        </div>
                    </div>

                    <div class="dcc-row">
                        <span class="dcc-label">Sensor Shift X</span>
                        <div class="dcc-slider-group">
                            <input
                                type="range"
                                id="cam-shift-x"
                                min="-1"
                                max="1"
                                step="0.001"
                                value="0"
                                class="dcc-range"
                            >
                            <span id="cam-shift-x-lbl" class="dcc-val-tag">0.000</span>
                        </div>
                    </div>

                    <div class="dcc-row">
                        <span class="dcc-label">Sensor Shift Y</span>
                        <div class="dcc-slider-group">
                            <input
                                type="range"
                                id="cam-shift-y"
                                min="-1"
                                max="1"
                                step="0.001"
                                value="0"
                                class="dcc-range"
                            >
                            <span id="cam-shift-y-lbl" class="dcc-val-tag">0.000</span>
                        </div>
                    </div>
                </div>

                <!-- =========================================================
                     CLIPPING
                     ========================================================= -->
                <div class="dcc-section">
                    <div class="dcc-section-title">CLIPPING & PROJECTION</div>

                    <div class="dcc-row">
                        <span class="dcc-label">Near / Far</span>
                        <div style="display:flex; gap:4px; flex:1;">
                            <input
                                type="number"
                                id="cam-near-clip"
                                min="0.001"
                                step="0.01"
                                value="0.1"
                                class="dcc-input"
                                style="flex:1; text-align:right;"
                            >
                            <input
                                type="number"
                                id="cam-far-clip"
                                min="1"
                                step="10"
                                value="1000"
                                class="dcc-input"
                                style="flex:1; text-align:right;"
                            >
                        </div>
                    </div>

                    <div class="dcc-row">
                        <span class="dcc-label">Aspect Ratio</span>
                        <select id="cam-aspect" class="dcc-select">
                            <option value="auto">Viewport</option>
                            <option value="1.7777778">16:9</option>
                            <option value="1.85">1.85:1</option>
                            <option value="2.39">2.39:1 Anamorphic</option>
                            <option value="1">1:1</option>
                            <option value="0.8">4:5</option>
                        </select>
                    </div>

                    <div class="dcc-row">
                        <span class="dcc-label">Projection</span>
                        <select id="cam-projection" class="dcc-select">
                            <option value="perspective">Perspective</option>
                            <option value="orthographic">Orthographic</option>
                        </select>
                    </div>
                </div>

                <!-- =========================================================
                     DOF
                     ========================================================= -->
                <div class="dcc-section">
                    <div class="dcc-section-title">DEPTH OF FIELD</div>

                    <div class="dcc-row">
                        <span class="dcc-label">Enable DOF</span>
                        <div class="dcc-ctrl-cell">
                            <input
                                type="checkbox"
                                id="cam-dof-toggle"
                                class="dcc-checkbox"
                            >
                        </div>
                    </div>

                    <div class="dcc-row">
                        <span class="dcc-label">Aperture</span>
                        <select id="cam-aperture" class="dcc-select">
                            <option value="1.2">f/1.2</option>
                            <option value="1.4">f/1.4</option>
                            <option value="2">f/2.0</option>
                            <option value="2.8" selected>f/2.8</option>
                            <option value="4">f/4.0</option>
                            <option value="5.6">f/5.6</option>
                            <option value="8">f/8.0</option>
                            <option value="11">f/11</option>
                            <option value="16">f/16</option>
                        </select>
                    </div>

                    <div class="dcc-row">
                        <span class="dcc-label">Focus Distance</span>
                        <div class="dcc-slider-group">
                            <input
                                type="range"
                                id="cam-focus-dist"
                                min="0.05"
                                max="1000"
                                step="0.05"
                                value="10"
                                class="dcc-range"
                            >
                            <input
                                type="number"
                                id="cam-focus-dist-num"
                                min="0.01"
                                max="10000"
                                step="0.05"
                                value="10"
                                class="dcc-input dcc-num-small"
                            >
                        </div>
                    </div>

                    <div class="dcc-row">
                        <span class="dcc-label">Bokeh</span>
                        <div class="dcc-slider-group">
                            <input
                                type="range"
                                id="cam-bokeh"
                                min="0"
                                max="1"
                                step="0.01"
                                value="0.5"
                                class="dcc-range"
                            >
                            <span id="cam-bokeh-lbl" class="dcc-val-tag">0.50</span>
                        </div>
                    </div>
                </div>

                <!-- =========================================================
                     TRACKING / COMPOSITION
                     ========================================================= -->
                <div class="dcc-section">
                    <div class="dcc-section-title">TRACKING & COMPOSITION</div>

                    <div class="dcc-row">
                        <span class="dcc-label">Target</span>
                        <select id="cam-target" class="dcc-select">
                            <option value="none">None (Manual)</option>
                        </select>
                    </div>

                    <div class="dcc-row">
                        <span class="dcc-label">Tracking</span>
                        <div class="dcc-ctrl-cell">
                            <input
                                type="checkbox"
                                id="cam-tracking-toggle"
                                class="dcc-checkbox"
                            >
                        </div>
                    </div>

                    <div class="dcc-row">
                        <span class="dcc-label">Horizon Lock</span>
                        <div class="dcc-ctrl-cell">
                            <input
                                type="checkbox"
                                id="cam-horizon-lock"
                                class="dcc-checkbox"
                            >
                        </div>
                    </div>

                    <div class="dcc-row">
                        <span class="dcc-label">Grid Overlay</span>
                        <div class="dcc-ctrl-cell">
                            <input
                                type="checkbox"
                                id="cam-grid-toggle"
                                class="dcc-checkbox"
                            >
                        </div>
                    </div>
                </div>

                <!-- =========================================================
                     CINEMATIC UTILS
                     ========================================================= -->
                <div class="dcc-section">
                    <div class="dcc-section-title">CINEMATIC TOOLS</div>

                    <div class="dcc-row">
                        <span class="dcc-label">Camera Shake</span>
                        <div class="dcc-slider-group">
                            <input
                                type="range"
                                id="cam-shake"
                                min="0"
                                max="1"
                                step="0.01"
                                value="0"
                                class="dcc-range"
                            >
                            <span id="cam-shake-lbl" class="dcc-val-tag">0.00</span>
                        </div>
                    </div>

                    <div class="dcc-row">
                        <span class="dcc-label">Focal Length</span>
                        <span id="cam-readout" class="dcc-val-tag">35mm</span>
                    </div>

                    <button class="dcc-btn" id="cam-btn-frame" type="button">
                        <i class="fas fa-crosshairs"></i> FRAME SELECTED
                    </button>

                    <button class="dcc-btn" id="cam-btn-reset-lens" type="button">
                        <i class="fas fa-undo"></i> RESET LENS
                    </button>
                </div>

                <!-- =========================================================
                     ACTIONS
                     ========================================================= -->
                <div class="dcc-action-block">
                    <button class="dcc-btn" id="cam-btn-view" type="button">
                        <i class="fas fa-eye"></i> PILOT / VIEW THROUGH LENS
                    </button>

                    <button class="dcc-btn dcc-btn-primary" id="cam-btn-active" type="button">
                        <i class="fas fa-camera"></i> SET ACTIVE RENDER CAMERA
                    </button>

                    <button class="dcc-btn dcc-btn-danger" id="cam-delete-btn" type="button">
                        <i class="fas fa-trash-alt"></i> DELETE CAMERA
                    </button>
                </div>
            </div>
        `;

        this.bindEvents();
    },

    // ========================================================================
    // HELPERS
    // ========================================================================

    _getCamera() {
        const selected = window.selectedObject;

        // Direct camera
        if (selected?.isCamera) return selected;

        // Cube camera proxy
        if (selected?.userData?.smCubeCameraProxy === true) {
            return selected;
        }

        // Fall back to internal selected
        if (this._selectedCamera?.isCamera) return this._selectedCamera;
        if (this._selectedCamera?.userData?.smCubeCameraProxy) {
            return this._selectedCamera;
        }

        const active =
            window.getActiveEditorCamera?.() ||
            window.camera ||
            window.cameraSystem?.activeCamera;

        return active?.isCamera ? active : null;
    },

    /**
     * For actual rendering/piloting, we need the REAL camera object.
     * For cube camera proxy, that's the internal cubeCamera.
     * For regular camera, that's the camera itself.
     */
    _resolveForRender(obj) {
        if (!obj) return null;

        if (obj.isCamera === true) return obj;

        if (obj.userData?.smCubeCameraProxy === true) {
            return obj.userData.cubeCamera || null;
        }

        if (typeof window.resolveManagedCamera === 'function') {
            return window.resolveManagedCamera(obj);
        }

        return null;
    },

    /**
     * Get the "real" camera for reading/writing properties.
     * For cube camera proxy → the internal cubeCamera
     * For regular camera → the camera itself
     */
    _getRealCamera(target) {
        if (!target) return null;
        if (target.isCamera) return target;
        if (target.userData?.smCubeCameraProxy) {
            return target.userData.cubeCamera || null;
        }
        return null;
    },

    _getSensorWidth(cam) {
        const real = this._getRealCamera(cam) || cam;
        return Number(real?.userData?.sensorWidth) || 36;
    },

    _focalToFov(focal, sensorWidth) {
        const f = Math.max(0.1, Number(focal) || 35);
        const sensor = Math.max(1, Number(sensorWidth) || 36);

        return 2 * THREE.MathUtils.radToDeg(
            Math.atan(sensor / (2 * f))
        );
    },

    _fovToFocal(fov, sensorWidth) {
        const f = Math.max(1, Number(fov) || 50);
        const sensor = Math.max(1, Number(sensorWidth) || 36);

        return sensor / (
            2 * Math.tan(
                THREE.MathUtils.degToRad(f / 2)
            )
        );
    },

    _setFocal(cam, focal) {
        const real = this._getRealCamera(cam) || cam;
        if (!real?.isPerspectiveCamera) return;

        const value = Math.max(1, Math.min(500, Number(focal) || 35));
        const sensor = this._getSensorWidth(cam);
        const fov = this._focalToFov(value, sensor);

        real.userData.focalLength = value;
        real.userData.sensorWidth = sensor;
        real.fov = fov;

        real.updateProjectionMatrix();

        this._syncLensUI(cam);
    },

    _syncLensUI(cam) {
        const real = this._getRealCamera(cam) || cam;
        if (!real) return;

        const focal = Number(
            real.userData?.focalLength ||
            this._fovToFocal(
                real.fov,
                this._getSensorWidth(cam)
            )
        );

        const focalRange = document.getElementById('cam-focal-range');
        const focalInput = document.getElementById('cam-focal');
        const fovInput = document.getElementById('cam-fov');
        const fovLabel = document.getElementById('cam-fov-lbl');
        const readout = document.getElementById('cam-readout');

        if (focalRange) {
            focalRange.value = Math.max(12, Math.min(300, focal));
        }

        if (focalInput) focalInput.value = focal.toFixed(1);

        if (fovInput && real.fov !== undefined) {
            fovInput.value = real.fov;
        }

        if (fovLabel && real.fov !== undefined) {
            fovLabel.textContent = Number(real.fov).toFixed(1) + "°";
        }

        if (readout) {
            readout.textContent = Number(focal).toFixed(1) + "mm";
        }
    },

    _updateProjection(cam) {
        const real = this._getRealCamera(cam) || cam;
        if (!real?.isCamera) return;

        real.updateProjectionMatrix?.();

        const renderer = window.SMEngineRenderer;
        const dom =
            renderer?.domElement ||
            renderer?.renderer?.domElement;

        const width = dom?.clientWidth || window.innerWidth || 1;
        const height = dom?.clientHeight || window.innerHeight || 1;

        if (real.isPerspectiveCamera) {
            const aspect = real.userData?.aspectRatio;

            real.aspect =
                Number.isFinite(Number(aspect)) && Number(aspect) > 0
                    ? Number(aspect)
                    : width / Math.max(1, height);

            real.updateProjectionMatrix();
        }
    },

    _setShift(cam, x, y) {
        const real = this._getRealCamera(cam) || cam;
        if (!real?.isPerspectiveCamera) return;

        real.userData.shiftX = Number(x) || 0;
        real.userData.shiftY = Number(y) || 0;

        const sensorWidth = this._getSensorWidth(cam);
        real.filmGauge = sensorWidth;
        real.filmOffset = real.userData.shiftX * sensorWidth;

        real.userData.lensShiftY = real.userData.shiftY;

        real.updateProjectionMatrix();
    },

    _refreshTargetList(selectedCam) {
        const select = document.getElementById('cam-target');
        if (!select || !window.scene) return;

        const real = this._getRealCamera(selectedCam) || selectedCam;
        const current = real?.userData?.lookAtTargetUuid || "none";

        select.innerHTML = '<option value="none">None (Manual)</option>';

        window.scene.traverse((object) => {
            if (
                !object ||
                object === selectedCam ||
                object === real ||
                object.userData?.isSystemObject ||
                object.userData?.ignoreInHierarchy
            ) {
                return;
            }

            if (!object.isMesh && !object.isGroup && !object.isObject3D) {
                return;
            }

            const option = document.createElement('option');
            option.value = object.uuid;
            option.textContent =
                object.name || object.type || object.uuid.substring(0, 8);

            if (object.uuid === current) {
                option.selected = true;
            }

            select.appendChild(option);
        });
    },

    // ========================================================================
    // EVENTS
    // ========================================================================

    bindEvents() {
        const filmBackSelect = document.getElementById('cam-film-back');
        const focalRange = document.getElementById('cam-focal-range');
        const focalInput = document.getElementById('cam-focal');
        const fovInput = document.getElementById('cam-fov');
        const nearInput = document.getElementById('cam-near-clip');
        const farInput = document.getElementById('cam-far-clip');
        const sensorWidthInput = document.getElementById('cam-sensor-width');
        const shiftX = document.getElementById('cam-shift-x');
        const shiftY = document.getElementById('cam-shift-y');
        const aspectSelect = document.getElementById('cam-aspect');
        const projectionSelect = document.getElementById('cam-projection');

        const dofToggle = document.getElementById('cam-dof-toggle');
        const apertureSelect = document.getElementById('cam-aperture');
        const focusDist = document.getElementById('cam-focus-dist');
        const focusDistNum = document.getElementById('cam-focus-dist-num');
        const bokehInput = document.getElementById('cam-bokeh');

        const targetSelect = document.getElementById('cam-target');
        const trackingToggle = document.getElementById('cam-tracking-toggle');
        const horizonLock = document.getElementById('cam-horizon-lock');
        const gridToggle = document.getElementById('cam-grid-toggle');
        const shakeInput = document.getElementById('cam-shake');

        const getCamera = () => this._getCamera();
        const getReal = (cam) => this._getRealCamera(cam) || cam;

        const updateCamera = () => {
            const cam = getCamera();
            if (!cam) return;

            const real = getReal(cam);

            real.userData = real.userData || {};
            cam.userData = cam.userData || {};

            const filmBack = filmBackSelect?.value || '35';
            const sensorWidth = Math.max(
                5,
                Math.min(100, Number(sensorWidthInput?.value) || 36)
            );
            const useDOF = !!dofToggle?.checked;
            const aperture = Number(apertureSelect?.value) || 2.8;
            const focusDistance = Math.max(
                0.01,
                Number(focusDist?.value) ||
                Number(focusDistNum?.value) ||
                10
            );
            const bokeh = Math.max(
                0,
                Math.min(1, Number(bokehInput?.value) || 0)
            );
            const trackingEnabled = !!trackingToggle?.checked;
            const horizonLockState = !!horizonLock?.checked;
            const cameraShake = Math.max(
                0,
                Math.min(1, Number(shakeInput?.value) || 0)
            );

            // Apply to BOTH the proxy and the real camera
            [cam, real].forEach((target) => {
                if (!target || target === cam && target === real && cam === real) {
                    // single assignment case
                }
                target.userData = target.userData || {};
                target.userData.filmBack = filmBack;
                target.userData.sensorWidth = sensorWidth;
                target.userData.useDOF = useDOF;
                target.userData.aperture = aperture;
                target.userData.focusDistance = focusDistance;
                target.userData.bokeh = bokeh;
                target.userData.trackingEnabled = trackingEnabled;
                target.userData.horizonLock = horizonLockState;
                target.userData.cameraShake = cameraShake;

                if (aspectSelect?.value === 'auto') {
                    delete target.userData.aspectRatio;
                } else {
                    target.userData.aspectRatio = Number(aspectSelect.value);
                }
            });

            this._updateProjection(cam);
        };

        // Film gate presets.
        filmBackSelect?.addEventListener('change', () => {
            const value = filmBackSelect.value;

            const widths = {
                '35': 36,
                's35': 24.89,
                'imax': 70,
                'custom': this._getSensorWidth(getCamera())
            };

            const cam = getCamera();
            if (!cam) return;

            const real = getReal(cam);

            if (value !== 'custom') {
                const width = widths[value];

                if (sensorWidthInput) {
                    sensorWidthInput.value = width;
                }

                real.userData.sensorWidth = width;

                if (real.isPerspectiveCamera) {
                    const focal =
                        Number(real.userData.focalLength) ||
                        this._fovToFocal(real.fov, width);

                    this._setFocal(cam, focal);
                }
            }

            updateCamera();
        });

        // Focal length.
        const setFocalFromInput = (value) => {
            const cam = getCamera();
            if (!cam) return;
            const real = getReal(cam);
            if (!real?.isPerspectiveCamera) return;
            this._setFocal(cam, value);
        };

        focalRange?.addEventListener('input', (e) => {
            if (focalInput) focalInput.value = e.target.value;
            setFocalFromInput(e.target.value);
        });

        focalInput?.addEventListener('input', (e) => {
            const value = Number(e.target.value);
            if (!Number.isFinite(value) || value <= 0) return;

            if (focalRange) {
                focalRange.value = Math.max(
                    Number(focalRange.min),
                    Math.min(Number(focalRange.max), value)
                );
            }

            setFocalFromInput(value);
        });

        // Lens presets.
        document.getElementById('cam-lens-preset')?.addEventListener(
            'change',
            (e) => {
                if (e.target.value === 'custom') return;
                const focal = Number(e.target.value);
                if (focalInput) focalInput.value = focal;
                if (focalRange) focalRange.value = focal;
                setFocalFromInput(focal);
            }
        );

        // Direct FOV.
        fovInput?.addEventListener('input', (e) => {
            const cam = getCamera();
            if (!cam) return;
            const real = getReal(cam);
            if (!real?.isPerspectiveCamera) return;

            const fov = Math.max(5, Math.min(140, Number(e.target.value) || 60));

            real.fov = fov;
            real.userData.focalLength = this._fovToFocal(
                fov,
                this._getSensorWidth(cam)
            );

            real.updateProjectionMatrix();

            const label = document.getElementById('cam-fov-lbl');
            if (label) label.textContent = fov.toFixed(1) + "°";

            this._syncLensUI(cam);
        });

        sensorWidthInput?.addEventListener('input', () => {
            const cam = getCamera();
            if (!cam) return;
            const real = getReal(cam);

            const width = Math.max(
                5,
                Math.min(100, Number(sensorWidthInput.value) || 36)
            );

            real.userData.sensorWidth = width;

            if (real.isPerspectiveCamera) {
                const focal =
                    Number(real.userData.focalLength) ||
                    this._fovToFocal(real.fov, width);
                this._setFocal(cam, focal);
            }

            updateCamera();
        });

        const updateShift = () => {
            const cam = getCamera();
            if (!cam) return;
            const real = getReal(cam);
            if (!real?.isPerspectiveCamera) return;

            const x = Number(shiftX?.value) || 0;
            const y = Number(shiftY?.value) || 0;

            this._setShift(cam, x, y);

            const xLabel = document.getElementById('cam-shift-x-lbl');
            const yLabel = document.getElementById('cam-shift-y-lbl');

            if (xLabel) xLabel.textContent = x.toFixed(3);
            if (yLabel) yLabel.textContent = y.toFixed(3);
        };

        shiftX?.addEventListener('input', updateShift);
        shiftY?.addEventListener('input', updateShift);

        nearInput?.addEventListener('change', (e) => {
            const cam = getCamera();
            if (!cam) return;
            const real = getReal(cam);

            const near = Math.max(0.001, Number(e.target.value) || 0.1);
            const far = Math.max(near + 0.01, Number(real.far) || 1000);

            real.near = Math.min(near, far - 0.01);
            real.updateProjectionMatrix();
        });

        farInput?.addEventListener('change', (e) => {
            const cam = getCamera();
            if (!cam) return;
            const real = getReal(cam);

            const far = Math.max(
                (Number(real.near) || 0.1) + 0.01,
                Number(e.target.value) || 1000
            );

            real.far = far;
            real.updateProjectionMatrix();
        });

        aspectSelect?.addEventListener('change', updateCamera);

        projectionSelect?.addEventListener('change', (e) => {
            const cam = getCamera();
            if (!cam) return;
            const real = getReal(cam);

            real.userData.projection = e.target.value;

            if (e.target.value === 'orthographic' &&
                typeof window.switchToOrthographic === 'function') {
                window.switchToOrthographic();
            } else if (e.target.value === 'perspective' &&
                typeof window.switchToPerspective === 'function') {
                window.switchToPerspective();
            }
        });

        // DOF.
        dofToggle?.addEventListener('change', updateCamera);
        apertureSelect?.addEventListener('change', updateCamera);

        focusDist?.addEventListener('input', (e) => {
            if (focusDistNum) focusDistNum.value = e.target.value;
            updateCamera();
        });

        focusDistNum?.addEventListener('input', (e) => {
            if (focusDist) focusDist.value = e.target.value;
            updateCamera();
        });

        bokehInput?.addEventListener('input', (e) => {
            const label = document.getElementById('cam-bokeh-lbl');
            if (label) label.textContent = Number(e.target.value).toFixed(2);
            updateCamera();
        });

        // Target tracking.
        targetSelect?.addEventListener('change', (e) => {
            const cam = getCamera();
            if (!cam) return;
            const real = getReal(cam);

            [cam, real].forEach((t) => {
                t.userData = t.userData || {};
                if (e.target.value === 'none') {
                    t.userData.lookAtTarget = null;
                    t.userData.lookAtTargetUuid = null;
                    t.userData.trackingEnabled = false;
                    return;
                }
                const target = window.scene?.getObjectByProperty(
                    'uuid',
                    e.target.value
                );
                t.userData.lookAtTarget = target || null;
                t.userData.lookAtTargetUuid = target?.uuid || e.target.value;
                t.userData.trackingEnabled = true;
            });

            if (trackingToggle) {
                trackingToggle.checked = e.target.value !== 'none';
            }
        });

        trackingToggle?.addEventListener('change', updateCamera);
        horizonLock?.addEventListener('change', updateCamera);

        gridToggle?.addEventListener('change', () => {
            const visible = !!gridToggle.checked;
            camGridState(visible);
        });

        shakeInput?.addEventListener('input', (e) => {
            const label = document.getElementById('cam-shake-lbl');
            if (label) label.textContent = Number(e.target.value).toFixed(2);
            updateCamera();
        });

        // Frame selected object through existing camera bridge.
        document.getElementById('cam-btn-frame')?.addEventListener('click', () => {
            if (typeof window.frameSelectedObject === 'function') {
                window.frameSelectedObject();
            } else if (typeof window.focusSelectedObject === 'function') {
                window.focusSelectedObject();
            }
        });

        // Reset lens only — does not move the camera.
        document.getElementById('cam-btn-reset-lens')?.addEventListener('click', () => {
            const cam = getCamera();
            if (!cam) return;
            const real = getReal(cam);

            [cam, real].forEach((t) => {
                t.userData = t.userData || {};
                t.userData.sensorWidth = 36;
                t.userData.focalLength = 35;
                t.userData.filmBack = '35';
                t.userData.shiftX = 0;
                t.userData.shiftY = 0;
            });

            if (real.isPerspectiveCamera) {
                real.filmGauge = 36;
                real.filmOffset = 0;
                real.fov = this._focalToFov(35, 36);
                real.updateProjectionMatrix();
            }

            this.syncSelection(cam);
        });

        // ============================================================
        // PILOT / VIEW THROUGH LENS — supports cube camera
        // ============================================================
        document.getElementById('cam-btn-view')?.addEventListener('click', () => {
            const cam = getCamera();
            if (!cam) {
                console.warn('[CameraPanel] No camera selected for PILOT');
                return;
            }

            // Preferred: use global possessCamera (handles cube camera preview)
            if (typeof window.possessCamera === 'function') {
                window.possessCamera(cam);
                console.log('[CameraPanel] PILOT via possessCamera');
                return;
            }

            // Fallback: manual possession
            const real = this._resolveForRender(cam);
            if (!real?.isCamera) {
                console.warn('[CameraPanel] Cannot resolve real camera for PILOT');
                return;
            }

            window._isInsideCamera = true;
            window._viewedCamera = cam;
            window._activeSceneCamera = real;

            if (window.controls) {
                window.controls.object = real;
                window.controls.enabled = true;
                window.controls.update?.();
            }

            console.log('[CameraPanel] PILOT via manual possession');
        });

        // ============================================================
        // SET ACTIVE RENDER CAMERA — 4 fallbacks
        // ============================================================
        document.getElementById('cam-btn-active')?.addEventListener('click', () => {
            const cam = getCamera();
            if (!cam) {
                console.warn('[CameraPanel] No camera selected');
                return;
            }

            const isCubeProxy = cam.userData?.smCubeCameraProxy === true;
            const realCamera = this._resolveForRender(cam);

            if (!realCamera?.isCamera) {
                console.warn('[CameraPanel] Cannot resolve real camera');
                return;
            }

            let success = false;
            let usedMethod = '';

            // ---- Try 1: SMEngineRenderer.setActiveCamera ----
            if (
                window.SMEngineRenderer &&
                typeof window.SMEngineRenderer.setActiveCamera === 'function'
            ) {
                try {
                    window.SMEngineRenderer.setActiveCamera(realCamera);
                    success = true;
                    usedMethod = 'SMEngineRenderer';
                } catch (e) {
                    console.warn('[CameraPanel] SMEngineRenderer.setActiveCamera failed:', e);
                }
            }

            // ---- Try 2: cameraSystem.setActiveCamera ----
            if (
                !success &&
                window.cameraSystem &&
                typeof window.cameraSystem.setActiveCamera === 'function'
            ) {
                try {
                    window.cameraSystem.setActiveCamera(realCamera);
                    success = true;
                    usedMethod = 'cameraSystem';
                } catch (e) {
                    console.warn('[CameraPanel] cameraSystem.setActiveCamera failed:', e);
                }
            }

            // ---- Try 3: Global assignments ----
            if (!success) {
                window.activeCamera = realCamera;
                window.activeRenderCamera = realCamera;
                window.renderCamera = realCamera;

                if (typeof window.setActiveCamera === 'function') {
                    try {
                        window.setActiveCamera(realCamera);
                        success = true;
                        usedMethod = 'setActiveCamera global';
                    } catch (e) {
                        // silent
                    }
                } else {
                    // Even without setActiveCamera, we set the globals
                    success = true;
                    usedMethod = 'global camera reference';
                }
            }

            // ---- Cube Camera: refresh + enter preview ----
            if (isCubeProxy) {
                try {
                    cam.update?.();
                } catch (e) {
                    console.warn('[CameraPanel] Cube camera update failed:', e);
                }

                if (typeof window.possessCamera === 'function') {
                    window.possessCamera(cam);
                    success = true;
                    usedMethod = 'possessCamera (cube)';
                }
            }

            // ---- Fallback: enter preview mode ----
            if (!success && typeof window.possessCamera === 'function') {
                window.possessCamera(cam);
                success = true;
                usedMethod = 'possessCamera (fallback)';
            }

            // ---- Feedback ----
            const btn = document.getElementById('cam-btn-active');

            if (success) {
                window.dispatchEvent(new CustomEvent('sm:active-render-camera-changed', {
                    detail: {
                        camera: realCamera,
                        proxy: isCubeProxy ? cam : null,
                        method: usedMethod
                    }
                }));

                if (btn) {
                    const original = btn.innerHTML;
                    btn.innerHTML = '<i class="fas fa-check"></i> ACTIVE';
                    btn.classList.add('dcc-btn-success');
                    btn.style.background = '#2d7a3e';
                    btn.style.color = '#ffffff';

                    setTimeout(() => {
                        btn.innerHTML = original;
                        btn.classList.remove('dcc-btn-success');
                        btn.style.background = '';
                        btn.style.color = '';
                    }, 1500);
                }

                console.log(
                    `[CameraPanel] Active render camera set: ${realCamera.name} (via ${usedMethod})`
                );
            } else {
                console.error('[CameraPanel] Failed to set active render camera');
            }
        });

        // ============================================================
        // DELETE CAMERA
        // ============================================================
        document.getElementById('cam-delete-btn')?.addEventListener('click', () => {
            const cam = getCamera();
            if (!cam) return;

            if (confirm(`Delete camera: ${cam.name || 'Camera'}?`)) {
                window.transformControls?.detach?.();

                // Cleanup internal resources if it's a cube camera
                if (cam.userData?.smCubeCameraProxy) {
                    try {
                        cam.dispose?.();
                    } catch (e) {
                        console.warn('[CameraPanel] Cube camera dispose failed:', e);
                    }
                }

                cam.parent?.remove(cam);

                if (typeof updateHierarchy === 'function') {
                    updateHierarchy();
                }

                this._selectedCamera = null;
                this.close();
            }
        });

        document.getElementById('close-camera-x-btn')?.addEventListener(
            'click',
            () => this.close()
        );
    },

    // ========================================================================
    // GRID
    // ========================================================================

    _setGridVisible(visible) {
        const candidates = [
            window.SMGridHelper,
            window.gridHelper,
            window.smGridHelper
        ];

        const helper = candidates.find(
            item => item && typeof item.setVisible === 'function'
        );

        if (helper) {
            helper.setVisible(!!visible);
            return;
        }

        const existing = window.scene?.getObjectByName?.('GridHelper');
        if (existing) {
            existing.visible = !!visible;
        }
    },

    // ========================================================================
    // SYNC
    // ========================================================================

    syncSelection(cam) {
        // Accept: direct camera OR cube camera proxy
        let targetCam = cam;
        if (!targetCam) targetCam = this._getCamera();

        const isCubeProxy = targetCam?.userData?.smCubeCameraProxy === true;
        const isDirectCam = targetCam?.isCamera === true;

        if (!isCubeProxy && !isDirectCam) return;

        const real = isCubeProxy
            ? (targetCam.userData.cubeCamera || targetCam)
            : targetCam;

        // Make sure userData exists on both
        real.userData = real.userData || {};
        targetCam.userData = targetCam.userData || {};

        // -------- Get DOM elements --------
        const filmBack = document.getElementById('cam-film-back');
        const focalInput = document.getElementById('cam-focal');
        const fovInput = document.getElementById('cam-fov');
        const nearInput = document.getElementById('cam-near-clip');
        const farInput = document.getElementById('cam-far-clip');
        const sensorInput = document.getElementById('cam-sensor-width');
        const shiftX = document.getElementById('cam-shift-x');
        const shiftY = document.getElementById('cam-shift-y');
        const aspectSelect = document.getElementById('cam-aspect');
        const projectionSelect = document.getElementById('cam-projection');
        const dofToggle = document.getElementById('cam-dof-toggle');
        const apertureSelect = document.getElementById('cam-aperture');
        const focusDist = document.getElementById('cam-focus-dist');
        const focusDistNum = document.getElementById('cam-focus-dist-num');
        const bokehInput = document.getElementById('cam-bokeh');
        const targetSelect = document.getElementById('cam-target');
        const trackingToggle = document.getElementById('cam-tracking-toggle');
        const horizonLock = document.getElementById('cam-horizon-lock');
        const shakeInput = document.getElementById('cam-shake');
        const bokehLabel = document.getElementById('cam-bokeh-lbl');
        const shakeLabel = document.getElementById('cam-shake-lbl');

        // -------- Film gate --------
        const filmBackValue = real.userData.filmBack || '35';
        if (filmBack) {
            filmBack.value = [...filmBack.options].some(
                option => option.value === filmBackValue
            ) ? filmBackValue : '35';
        }

        // -------- Sensor --------
        const sensor = this._getSensorWidth(targetCam);
        if (sensorInput) sensorInput.value = sensor;

        // -------- Focal --------
        const focal = Number(real.userData.focalLength) || (
            real.isPerspectiveCamera
                ? this._fovToFocal(real.fov, sensor)
                : 35
        );

        if (real.isPerspectiveCamera) {
            real.userData.focalLength = focal;
            real.filmGauge = sensor;
        }

        this._syncLensUI(targetCam);

        // -------- Near / Far --------
        if (nearInput) nearInput.value = real.near ?? 0.1;
        if (farInput) farInput.value = real.far ?? 1000;

        // -------- DOF --------
        if (dofToggle) dofToggle.checked = !!real.userData.useDOF;

        if (apertureSelect) {
            const aperture = Number(real.userData.aperture) || 2.8;
            apertureSelect.value = String(aperture);
            if (apertureSelect.value !== String(aperture)) {
                apertureSelect.value = '2.8';
            }
        }

        const focus = Number(real.userData.focusDistance) || 10;
        if (focusDist) {
            focusDist.value = Math.max(
                Number(focusDist.min),
                Math.min(Number(focusDist.max), focus)
            );
        }
        if (focusDistNum) focusDistNum.value = focus;

        const bokeh = Number(real.userData.bokeh);
        if (bokehInput) {
            bokehInput.value = Number.isFinite(bokeh)
                ? Math.max(0, Math.min(1, bokeh))
                : 0.5;
        }
        if (bokehLabel) {
            bokehLabel.textContent = Number(bokehInput?.value || 0.5).toFixed(2);
        }

        // -------- Shift --------
        if (shiftX) shiftX.value = real.userData.shiftX || 0;
        if (shiftY) shiftY.value = real.userData.shiftY || 0;

        const shiftXLabel = document.getElementById('cam-shift-x-lbl');
        const shiftYLabel = document.getElementById('cam-shift-y-lbl');
        if (shiftXLabel) shiftXLabel.textContent = Number(shiftX?.value || 0).toFixed(3);
        if (shiftYLabel) shiftYLabel.textContent = Number(shiftY?.value || 0).toFixed(3);

        // -------- Aspect --------
        if (aspectSelect) {
            const aspect = real.userData.aspectRatio;
            aspectSelect.value = Number.isFinite(Number(aspect))
                ? String(aspect)
                : 'auto';

            if (![...aspectSelect.options].some(
                option => option.value === aspectSelect.value
            )) {
                aspectSelect.value = 'auto';
            }
        }

        // -------- Projection --------
        if (projectionSelect) {
            projectionSelect.value = real.isOrthographicCamera
                ? 'orthographic'
                : 'perspective';
        }

        // -------- Tracking --------
        if (trackingToggle) {
            trackingToggle.checked = !!real.userData.trackingEnabled;
        }
        if (horizonLock) {
            horizonLock.checked = !!real.userData.horizonLock;
        }

        const shake = Number(real.userData.cameraShake);
        if (shakeInput) {
            shakeInput.value = Number.isFinite(shake)
                ? Math.max(0, Math.min(1, shake))
                : 0;
        }
        if (shakeLabel) {
            shakeLabel.textContent = Number(shakeInput?.value || 0).toFixed(2);
        }

        // -------- Target list --------
        this._refreshTargetList(real);

        const targetUuid = real.userData.lookAtTargetUuid;
        if (targetSelect) {
            targetSelect.value = targetUuid || 'none';
        }
    },

    // ========================================================================
    // OPEN / CLOSE
    // ========================================================================

    open(cam) {
        this.init();

        // If cam not provided, use current selection
        if (!cam) {
            cam = this._getCamera();
        }

        this._selectedCamera = cam;
        this.syncSelection(cam);

        const container = document.getElementById('camera-editor-container');
        if (container) {
            window.PanelDockManager?.openPanel?.('camera');
        }
    },

    close() {
        const container = document.getElementById('camera-editor-container');
        if (container) {
            window.PanelDockManager?.closePanel?.('camera');
        }
    }
};

// ============================================================================
// Small global helper kept outside CameraPanel
// ============================================================================

function camGridState(visible) {
    if (window.CameraPanel?._setGridVisible) {
        window.CameraPanel._setGridVisible(!!visible);
    }
}