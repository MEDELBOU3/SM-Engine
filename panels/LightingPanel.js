// ============================================================================
// panels/LightingPanel.js — Software Style (Flat #333 Theme, 0 Radius)
// ============================================================================

window.LightingPanel = {
    init() {
        const container = window.PanelDockManager?.mountPanel?.({
            id: 'lighting', title: 'Lighting', icon: 'fas fa-lightbulb',
            elementId: 'lighting-editor-container', className: 'inspector-card dcc-software-card', display: 'block',
        });
        if (!container) return;

        this._injectSoftwareStyles();
        this.renderPanel(container);

        if (!this._bound) {
            this._bound = true;
            window.addEventListener('objectSelected', (e) => {
                const obj = e.detail?.object || window.selectedObject;
                if (obj && obj.isLight) {
                    this.open(obj);
                } else if (container && container.style.display !== 'none') {
                    this.close();
                }
            });
            window.updateLightUI = (light) => {
                if (light && light.isLight) this.open(light);
            };
        }
    },

    kelvinToRGB(kelvin) {
        let temp = kelvin / 100;
        let r, g, b;

        if (temp <= 66) {
            r = 255;
            g = temp;
            g = 99.4708025861 * Math.log(g) - 161.1195681661;
            if (temp <= 19) {
                b = 0;
            } else {
                b = temp - 10;
                b = 138.5177312231 * Math.log(b) - 305.0447927307;
            }
        } else {
            r = temp - 60;
            r = 329.698727446 * Math.pow(r, -0.1332047592);
            g = temp - 60;
            g = 288.1221695283 * Math.pow(g, -0.0755148492);
            b = 255;
        }

        return new THREE.Color(
            Math.max(0, Math.min(255, r)) / 255,
            Math.max(0, Math.min(255, g)) / 255,
            Math.max(0, Math.min(255, b)) / 255
        );
    },

    renderPanel(container) {
        container.innerHTML = `
            <div class="dcc-panel-header">
                <div class="dcc-header-title">
                    <i class="fas fa-sun text-gold"></i>
                    <span>LIGHT COMPONENT (PHYSICAL)</span>
                </div>
                <button id="close-lighting-x-btn" class="dcc-close-btn" title="Close Panel">✕</button>
            </div>

            <div class="dcc-panel-body">
                
                <!-- SECTION 1: INTENSITY & COLOR -->
                <div class="dcc-section">
                    <div class="dcc-section-title">INTENSITY & COLOR</div>
                    
                    <div class="dcc-row">
                        <span class="dcc-label">Base Color</span>
                        <div class="dcc-color-wrap">
                            <input type="color" id="lit-color" value="#ffffff" class="dcc-color-input">
                            <input type="text" id="lit-color-hex" value="#FFFFFF" class="dcc-input dcc-hex-input" readonly>
                        </div>
                    </div>

                    <div class="dcc-row">
                        <span class="dcc-label">Kelvin Temp</span>
                        <div class="dcc-ctrl-cell">
                            <input type="checkbox" id="lit-use-temp" class="dcc-checkbox">
                        </div>
                    </div>

                    <div id="lit-temp-row" class="dcc-row" style="display: none;">
                        <span class="dcc-label">Temperature</span>
                        <div class="dcc-slider-group">
                            <input type="range" id="lit-temp" min="1000" max="12000" step="100" value="6500" class="dcc-range">
                            <span id="lit-temp-lbl" class="dcc-val-tag">6500K</span>
                        </div>
                    </div>

                    <div class="dcc-row">
                        <span class="dcc-label">Intensity</span>
                        <div class="dcc-slider-group">
                            <input type="range" id="lit-intensity" min="0" max="50" step="0.1" value="1.5" class="dcc-range">
                            <input type="number" id="lit-intensity-num" min="0" max="50" step="0.1" value="1.5" class="dcc-input dcc-num-small">
                        </div>
                    </div>

                    <div id="lit-distance-row" class="dcc-row" style="display: none;">
                        <span class="dcc-label">Distance (m)</span>
                        <div class="dcc-slider-group">
                            <input type="range" id="lit-distance" min="0" max="1000" step="1" value="100" class="dcc-range">
                            <input type="number" id="lit-distance-num" min="0" max="1000" step="1" value="100" class="dcc-input dcc-num-small">
                        </div>
                    </div>

                    <div id="lit-angle-row" class="dcc-row" style="display: none;">
                        <span class="dcc-label">Cone Angle</span>
                        <div class="dcc-slider-group">
                            <input type="range" id="lit-angle" min="0.1" max="1.57" step="0.01" value="0.78" class="dcc-range">
                            <span id="lit-angle-lbl" class="dcc-val-tag">0.78 rad</span>
                        </div>
                    </div>
                </div>

                <!-- SECTION 2: SHADOWS -->
                <div class="dcc-section">
                    <div class="dcc-section-title">SHADOW CONFIGURATION</div>

                    <div class="dcc-row">
                        <span class="dcc-label">Shadow Softness</span>
                        <div class="dcc-slider-group">
                            <input type="range" id="lit-shadow-radius" min="0" max="8" step="0.1" value="1.5" class="dcc-range">
                            <input type="number" id="lit-shadow-radius-num" min="0" max="8" step="0.1" value="1.5" class="dcc-input dcc-num-small">
                        </div>
                    </div>

                    <div class="dcc-row">
                        <span class="dcc-label">Contact Shadow</span>
                        <div class="dcc-ctrl-cell">
                            <input type="checkbox" id="lit-contact-shadow" class="dcc-checkbox">
                        </div>
                    </div>
                    
                    <div class="dcc-row">
                        <span class="dcc-label">Cast Shadows</span>
                        <div class="dcc-ctrl-cell">
                            <input type="checkbox" id="lit-cast-shadows" class="dcc-checkbox">
                        </div>
                    </div>

                    <div class="dcc-row">
                        <span class="dcc-label">Resolution</span>
                        <select id="lit-shadow-res" class="dcc-select">
                            <option value="512">512 px (Low)</option>
                            <option value="1024">1024 px (Medium)</option>
                            <option value="2048" selected>2048 px (High)</option>
                            <option value="4096">4096 px (Cinematic)</option>
                        </select>
                    </div>

                    <div class="dcc-row">
                        <span class="dcc-label">Shadow Bias</span>
                        <input type="number" id="lit-shadow-bias" step="0.00001" value="-0.0001" class="dcc-input dcc-num-wide">
                    </div>

                    <div class="dcc-row">
                        <span class="dcc-label">Normal Bias</span>
                        <input type="number" id="lit-shadow-normal-bias" step="0.01" value="0.02" class="dcc-input dcc-num-wide">
                    </div>
                </div>

                <!-- SECTION 3: LIGHT VISUAL QUALITY -->
                <div class="dcc-section">
                    <div class="dcc-section-title">LIGHT VISUAL QUALITY</div>

                    <div class="dcc-row">
                        <span class="dcc-label">Light Glow</span>
                        <div class="dcc-ctrl-cell">
                            <input type="checkbox" id="lit-glow" class="dcc-checkbox" checked>
                        </div>
                    </div>

                    <div class="dcc-row">
                        <span class="dcc-label">Glow Strength</span>
                        <div class="dcc-slider-group">
                            <input type="range" id="lit-glow-strength" min="0" max="2" step="0.01" value="0.42" class="dcc-range">
                            <input type="number" id="lit-glow-strength-num" min="0" max="2" step="0.01" value="0.42" class="dcc-input dcc-num-small">
                        </div>
                    </div>

                    <div class="dcc-row">
                        <span class="dcc-label">Glow Size</span>
                        <div class="dcc-slider-group">
                            <input type="range" id="lit-glow-size" min="0.1" max="8" step="0.1" value="2.8" class="dcc-range">
                            <input type="number" id="lit-glow-size-num" min="0.1" max="8" step="0.1" value="2.8" class="dcc-input dcc-num-small">
                        </div>
                    </div>

                    <div class="dcc-row">
                        <span class="dcc-label">Volumetric Beam</span>
                        <div class="dcc-ctrl-cell">
                            <input type="checkbox" id="lit-volumetric" class="dcc-checkbox" checked>
                        </div>
                    </div>

                    <div class="dcc-row">
                        <span class="dcc-label">Beam Strength</span>
                        <div class="dcc-slider-group">
                            <input type="range" id="lit-beam-strength" min="0" max="0.3" step="0.005" value="0.045" class="dcc-range">
                            <input type="number" id="lit-beam-strength-num" min="0" max="0.3" step="0.005" value="0.045" class="dcc-input dcc-num-small">
                        </div>
                    </div>
                </div>

                <!-- SECTION 4: ACTIONS -->
                <div class="dcc-action-block">
                    <button class="dcc-btn dcc-btn-danger" id="lit-delete-btn">
                        <i class="fas fa-trash-alt"></i> DELETE LIGHT COMPONENT
                    </button>
                </div>
            </div>
        `;

        this.bindEvents();
    },

    bindEvents() {
        const colorInput = document.getElementById('lit-color');
        const colorHex = document.getElementById('lit-color-hex');
        const useTempCheckbox = document.getElementById('lit-use-temp');
        const tempInput = document.getElementById('lit-temp');
        const intensityInput = document.getElementById('lit-intensity');
        const intensityNum = document.getElementById('lit-intensity-num');
        const distanceInput = document.getElementById('lit-distance');
        const distanceNum = document.getElementById('lit-distance-num');
        const angleInput = document.getElementById('lit-angle');
        const shadowsToggle = document.getElementById('lit-cast-shadows');
        const shadowResSelect = document.getElementById('lit-shadow-res');
        const biasInput = document.getElementById('lit-shadow-bias');
        const normalBiasInput = document.getElementById('lit-shadow-normal-bias');
        const shadowRadiusInput = document.getElementById('lit-shadow-radius');
        const shadowRadiusNum = document.getElementById('lit-shadow-radius-num');
        const contactShadowToggle = document.getElementById('lit-contact-shadow');
        const glowToggle = document.getElementById('lit-glow');
        const glowStrengthInput = document.getElementById('lit-glow-strength');
        const glowStrengthNum = document.getElementById('lit-glow-strength-num');
        const glowSizeInput = document.getElementById('lit-glow-size');
        const glowSizeNum = document.getElementById('lit-glow-size-num');
        const volumetricToggle = document.getElementById('lit-volumetric');
        const beamStrengthInput = document.getElementById('lit-beam-strength');
        const beamStrengthNum = document.getElementById('lit-beam-strength-num');

        const getActiveLight = () => window.selectedObject;

        const updateLightProperties = () => {
            const light = getActiveLight();
            if (!light || !light.isLight) return;

            if (useTempCheckbox?.checked) {
                const tempColor = this.kelvinToRGB(parseFloat(tempInput.value));
                light.color.copy(tempColor);
                if (colorHex) colorHex.value = '#' + tempColor.getHexString().toUpperCase();
            } else if (colorInput) {
                light.color.set(colorInput.value);
                if (colorHex) colorHex.value = colorInput.value.toUpperCase();
            }

            if (intensityInput) light.intensity = parseFloat(intensityInput.value);

            if (light.distance !== undefined && distanceInput) {
                light.distance = parseFloat(distanceInput.value);
            }

            if (light.angle !== undefined && angleInput) {
                light.angle = parseFloat(angleInput.value);
            }

            light.castShadow = !!shadowsToggle?.checked;
            light.userData = light.userData || {};
            light.userData.allowSecondaryGlobalSun = true;
            light.userData.smContactShadow = !!contactShadowToggle?.checked;

            if (light.shadow) {
                if (biasInput) light.shadow.bias = parseFloat(biasInput.value);
                if (normalBiasInput) light.shadow.normalBias = parseFloat(normalBiasInput.value);
                if (shadowRadiusInput) light.shadow.radius = parseFloat(shadowRadiusInput.value);

                if (shadowResSelect) {
                    const res = parseInt(shadowResSelect.value, 10);

                    if (light.shadow.mapSize.width !== res) {
                        light.shadow.mapSize.set(res, res);
                        light.shadow.map?.dispose?.();
                        light.shadow.map = null;
                    }
                }

                light.shadow.needsUpdate = true;
            }

            const visual = light.userData.lightVisual;

            if (visual) {
                const glow = light.userData.lightVisualGlow;
                const innerGlow = light.userData.lightVisualInnerGlow;
                const cone = light.userData.lightVisualCone;

                if (glow) {
                    glow.visible = !!glowToggle?.checked;
                    glow.material.opacity = parseFloat(glowStrengthInput?.value || 0);
                    const size = parseFloat(glowSizeInput?.value || 2.8);
                    glow.scale.set(size, size, 1);
                }

                if (innerGlow) {
                    innerGlow.visible = !!glowToggle?.checked;
                }

                if (cone) {
                    cone.visible = !!volumetricToggle?.checked;
                    cone.material.opacity = parseFloat(beamStrengthInput?.value || 0);
                }
            }

            window.updateLightUI?.(light);
        };

        colorInput?.addEventListener('input', (e) => {
            if (colorHex) colorHex.value = e.target.value.toUpperCase();
            updateLightProperties();
        });

        biasInput?.addEventListener('change', updateLightProperties);
        normalBiasInput?.addEventListener('change', updateLightProperties);
        shadowsToggle?.addEventListener('change', updateLightProperties);
        shadowResSelect?.addEventListener('change', updateLightProperties);

        const bindPair = (range, number) => {
            range?.addEventListener('input', (e) => {
                if (number) number.value = e.target.value;
                updateLightProperties();
            });

            number?.addEventListener('input', (e) => {
                if (range) range.value = e.target.value;
                updateLightProperties();
            });
        };

        bindPair(shadowRadiusInput, shadowRadiusNum);
        bindPair(glowStrengthInput, glowStrengthNum);
        bindPair(glowSizeInput, glowSizeNum);
        bindPair(beamStrengthInput, beamStrengthNum);

        contactShadowToggle?.addEventListener('change', updateLightProperties);
        glowToggle?.addEventListener('change', updateLightProperties);
        volumetricToggle?.addEventListener('change', updateLightProperties);

        useTempCheckbox?.addEventListener('change', (e) => {
            const row = document.getElementById('lit-temp-row');
            if (row) row.style.display = e.target.checked ? 'flex' : 'none';
            updateLightProperties();
        });

        tempInput?.addEventListener('input', (e) => {
            const lbl = document.getElementById('lit-temp-lbl');
            if (lbl) lbl.textContent = e.target.value + "K";
            updateLightProperties();
        });

        intensityInput?.addEventListener('input', (e) => {
            if (intensityNum) intensityNum.value = e.target.value;
            updateLightProperties();
        });

        intensityNum?.addEventListener('input', (e) => {
            if (intensityInput) intensityInput.value = e.target.value;
            updateLightProperties();
        });

        distanceInput?.addEventListener('input', (e) => {
            if (distanceNum) distanceNum.value = e.target.value;
            updateLightProperties();
        });

        distanceNum?.addEventListener('input', (e) => {
            if (distanceInput) distanceInput.value = e.target.value;
            updateLightProperties();
        });

        angleInput?.addEventListener('input', (e) => {
            const lbl = document.getElementById('lit-angle-lbl');
            if (lbl) lbl.textContent = parseFloat(e.target.value).toFixed(2) + " rad";
            updateLightProperties();
        });

        document.getElementById('lit-delete-btn')?.addEventListener('click', () => {
            const light = getActiveLight();

            if (light && confirm(`Delete light component: ${light.name}?`)) {
                if (window.transformControls) window.transformControls.detach();

                light.parent?.remove(light);

                if (typeof updateHierarchy === 'function') {
                    updateHierarchy();
                }

                this.close();
            }
        });

        document.getElementById('close-lighting-x-btn')?.addEventListener(
            'click',
            () => this.close()
        );
    },

    syncSelection(light) {
        if (!light || !light.isLight) return;

        const colorInput = document.getElementById('lit-color');
        const colorHex = document.getElementById('lit-color-hex');
        const intensityInput = document.getElementById('lit-intensity');
        const intensityNum = document.getElementById('lit-intensity-num');
        const distanceInput = document.getElementById('lit-distance');
        const distanceNum = document.getElementById('lit-distance-num');
        const angleInput = document.getElementById('lit-angle');
        const shadowsToggle = document.getElementById('lit-cast-shadows');
        const shadowResSelect = document.getElementById('lit-shadow-res');
        const biasInput = document.getElementById('lit-shadow-bias');
        const normalBiasInput = document.getElementById('lit-shadow-normal-bias');
        const shadowRadiusInput = document.getElementById('lit-shadow-radius');
        const shadowRadiusNum = document.getElementById('lit-shadow-radius-num');
        const contactShadowToggle = document.getElementById('lit-contact-shadow');
        const glowToggle = document.getElementById('lit-glow');
        const glowStrengthInput = document.getElementById('lit-glow-strength');
        const glowStrengthNum = document.getElementById('lit-glow-strength-num');
        const glowSizeInput = document.getElementById('lit-glow-size');
        const glowSizeNum = document.getElementById('lit-glow-size-num');
        const volumetricToggle = document.getElementById('lit-volumetric');
        const beamStrengthInput = document.getElementById('lit-beam-strength');
        const beamStrengthNum = document.getElementById('lit-beam-strength-num');

        const hexStr = '#' + light.color.getHexString().toUpperCase();

        if (colorInput) colorInput.value = hexStr;
        if (colorHex) colorHex.value = hexStr;

        if (intensityInput) intensityInput.value = light.intensity;
        if (intensityNum) intensityNum.value = light.intensity;

        const distRow = document.getElementById('lit-distance-row');

        if (distRow && light.distance !== undefined) {
            distRow.style.display = 'flex';

            if (distanceInput) distanceInput.value = light.distance;
            if (distanceNum) distanceNum.value = light.distance;
        } else if (distRow) {
            distRow.style.display = 'none';
        }

        const angleRow = document.getElementById('lit-angle-row');

        if (angleRow && light.angle !== undefined) {
            angleRow.style.display = 'flex';

            if (angleInput) {
                angleInput.value = light.angle;

                const lbl = document.getElementById('lit-angle-lbl');

                if (lbl) {
                    lbl.textContent =
                        parseFloat(light.angle).toFixed(2) + " rad";
                }
            }
        } else if (angleRow) {
            angleRow.style.display = 'none';
        }

        if (shadowsToggle) {
            shadowsToggle.checked = !!light.castShadow;
        }

        if (biasInput && light.shadow) {
            biasInput.value = light.shadow.bias;
        }

        if (normalBiasInput && light.shadow) {
            normalBiasInput.value = light.shadow.normalBias || 0;
        }

        if (shadowRadiusInput && light.shadow) {
            shadowRadiusInput.value = light.shadow.radius ?? 1.5;

            if (shadowRadiusNum) {
                shadowRadiusNum.value = shadowRadiusInput.value;
            }
        }

        if (shadowResSelect && light.shadow) {
            const width = light.shadow.mapSize.width;
            const value = String(width);

            if ([...shadowResSelect.options].some(o => o.value === value)) {
                shadowResSelect.value = value;
            }
        }

        if (contactShadowToggle) {
            contactShadowToggle.checked =
                !!light.userData?.smContactShadow;
        }

        const visual = light.userData?.lightVisual;

        if (visual) {
            const glow = light.userData.lightVisualGlow;
            const cone = light.userData.lightVisualCone;

            if (glow) {
                const opacity = glow.material?.opacity ?? 0.42;
                const size = glow.scale?.x ?? 2.8;

                if (glowStrengthInput) glowStrengthInput.value = opacity;
                if (glowStrengthNum) glowStrengthNum.value = opacity;
                if (glowSizeInput) glowSizeInput.value = size;
                if (glowSizeNum) glowSizeNum.value = size;
                if (glowToggle) glowToggle.checked = glow.visible;
            }

            if (cone) {
                const opacity = cone.material?.opacity ?? 0.045;

                if (beamStrengthInput) beamStrengthInput.value = opacity;
                if (beamStrengthNum) beamStrengthNum.value = opacity;
                if (volumetricToggle) volumetricToggle.checked = cone.visible;
            }
        } else {
            if (glowToggle) glowToggle.checked = false;
            if (volumetricToggle) volumetricToggle.checked = false;
        }
    },

    open(light) {
        this.init();
        this.syncSelection(light);
        const container = document.getElementById('lighting-editor-container');
        if (container) {
            window.PanelDockManager?.openPanel?.('lighting');
        }
    },

    close() {
        const container = document.getElementById('lighting-editor-container');
        if (container) {
            window.PanelDockManager?.closePanel?.('lighting');
        }
    },

    _injectSoftwareStyles() {
        if (document.getElementById('dcc-software-inspector-styles')) return;

        const style = document.createElement('style');
        style.id = 'dcc-software-inspector-styles';
        style.textContent = `
            /* =========================================================
               DCC SOFTWARE THEME (#333, 0 BORDER RADIUS, FLAT UI)
               ========================================================= */
            .dcc-software-card,
            #lighting-editor-container,
            #camera-editor-container {
                background: #333333 !important;
                border: 1px solid #444444 !important;
                border-radius: 0px !important;
                margin-bottom: 6px !important;
                padding: 0 !important;
                box-sizing: border-box !important;
                user-select: none !important;
            }

            .dcc-panel-header {
                display: flex !important;
                align-items: center !important;
                justify-content: space-between !important;
                height: 28px !important;
                padding: 0 8px !important;
                background: #3c3c3c !important;
                border-bottom: 1px solid #444444 !important;
                border-radius: 0px !important;
            }

            .dcc-header-title {
                display: flex !important;
                align-items: center !important;
                gap: 6px !important;
                font-size: 10px !important;
                font-weight: 700 !important;
                color: #ffffff !important;
                text-transform: uppercase !important;
                letter-spacing: 0.5px !important;
            }

            .dcc-header-title i.text-gold { color: #f5b041 !important; }
            .dcc-header-title i.text-blue { color: #3498db !important; }

            .dcc-close-btn {
                background: transparent !important;
                border: none !important;
                border-radius: 0px !important;
                color: #aaaaaa !important;
                font-size: 11px !important;
                cursor: pointer !important;
                padding: 2px 5px !important;
                transition: background 0.1s ease !important;
            }

            .dcc-close-btn:hover {
                background: #4a4a4a !important;
                color: #ffffff !important;
            }

            .dcc-panel-body {
                padding: 8px !important;
                display: flex !important;
                flex-direction: column !important;
                gap: 8px !important;
                background: #333333 !important;
            }

            .dcc-section {
                display: flex !important;
                flex-direction: column !important;
                gap: 5px !important;
                background: #2f2f2f !important;
                border: 1px solid #3d3d3d !important;
                border-radius: 0px !important;
                padding: 6px 8px !important;
            }

            .dcc-section-title {
                font-size: 9px !important;
                font-weight: 700 !important;
                color: #999999 !important;
                text-transform: uppercase !important;
                letter-spacing: 0.5px !important;
                border-bottom: 1px solid #3a3a3a !important;
                padding-bottom: 3px !important;
                margin-bottom: 3px !important;
            }

            .dcc-row {
                display: flex !important;
                align-items: center !important;
                justify-content: space-between !important;
                min-height: 22px !important;
                gap: 6px !important;
            }

            .dcc-label {
                font-size: 9.5px !important;
                font-weight: 600 !important;
                color: #bbbbbb !important;
                text-transform: uppercase !important;
                white-space: nowrap !important;
                min-width: 75px !important;
            }

            /* Flat Square Inputs */
            .dcc-input,
            .dcc-select {
                height: 20px !important;
                background: #242424 !important;
                border: 1px solid #444444 !important;
                border-radius: 0px !important;
                color: #ffffff !important;
                font-size: 10px !important;
                padding: 0 5px !important;
                box-sizing: border-box !important;
                outline: none !important;
            }

            .dcc-input:focus,
            .dcc-select:focus {
                border-color: #00bcd4 !important;
                background: #1e1e1e !important;
            }

            .dcc-select {
                flex: 1 !important;
                cursor: pointer !important;
            }

            .dcc-num-small {
                width: 50px !important;
                text-align: right !important;
                font-family: 'Consolas', 'Courier New', monospace !important;
            }

            .dcc-num-wide {
                width: 90px !important;
                text-align: right !important;
                font-family: 'Consolas', 'Courier New', monospace !important;
            }

            .dcc-slider-group {
                display: flex !important;
                align-items: center !important;
                gap: 6px !important;
                flex: 1 !important;
            }

            .dcc-range {
                flex: 1 !important;
                height: 14px !important;
                accent-color: #00bcd4 !important;
                cursor: pointer !important;
            }

            .dcc-val-tag {
                font-size: 9px !important;
                font-family: 'Consolas', monospace !important;
                color: #00bcd4 !important;
                background: #222222 !important;
                border: 1px solid #3a3a3a !important;
                border-radius: 0px !important;
                padding: 1px 4px !important;
                min-width: 42px !important;
                text-align: center !important;
            }

            .dcc-color-wrap {
                display: flex !important;
                align-items: center !important;
                gap: 4px !important;
                flex: 1 !important;
            }

            .dcc-color-input {
                width: 32px !important;
                height: 20px !important;
                padding: 0 !important;
                border: 1px solid #444444 !important;
                border-radius: 0px !important;
                background: #111111 !important;
                cursor: pointer !important;
            }

            .dcc-hex-input {
                width: 60px !important;
                font-family: 'Consolas', monospace !important;
                text-align: center !important;
            }

            .dcc-checkbox {
                accent-color: #00bcd4 !important;
                cursor: pointer !important;
                width: 14px !important;
                height: 14px !important;
            }

            .dcc-ctrl-cell {
                display: flex !important;
                align-items: center !important;
            }

            .dcc-action-block {
                display: flex !important;
                flex-direction: column !important;
                gap: 4px !important;
                margin-top: 2px !important;
            }

            .dcc-btn {
                height: 24px !important;
                display: inline-flex !important;
                align-items: center !important;
                justify-content: center !important;
                gap: 5px !important;
                background: #444444 !important;
                border: 1px solid #555555 !important;
                border-radius: 0px !important;
                color: #ffffff !important;
                font-size: 10px !important;
                font-weight: 600 !important;
                cursor: pointer !important;
                transition: background 0.1s ease !important;
            }

            .dcc-btn:hover {
                background: #505050 !important;
                border-color: #666666 !important;
            }

            .dcc-btn-primary {
                background: #2980b9 !important;
                border-color: #3498db !important;
            }

            .dcc-btn-primary:hover {
                background: #3498db !important;
            }

            .dcc-btn-danger {
                background: #3d2424 !important;
                border-color: #613333 !important;
                color: #ff7878 !important;
            }

            .dcc-btn-danger:hover {
                background: #522b2b !important;
                color: #ffffff !important;
            }
        `;
        document.head.appendChild(style);
    }
};
