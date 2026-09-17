/*
 * ============================================================================
 * SM ENGINE — FX PARTICLES PANEL VIEW
 * Source file: panels/fx/FXParticlesPanelView.js
 * ============================================================================
 *
 * This file owns the FX panel markup only.
 * Runtime logic belongs to engine/fx/.
 * UI behavior belongs to FXParticlesPanel.js.
 *
 * index.html should contain only:
 *
 *     <div id="sm-fx-panel-mount"></div>
 *
 * The app JS loader should load:
 *     panels/fx/FXParticlesPanelView.js
 *     panels/fx/FXParticlesPanel.js
 *
 * This view automatically loads:
 *     panels/fx/FXParticlesPanel.css
 * ============================================================================
 */

(function (global) {
    'use strict';

    const VIEW_VERSION = '1.0.0';
    const MOUNT_ID = 'sm-fx-panel-mount';
    const PANEL_ID = 'snow-sittings';
    const CSS_ID = 'sm-fx-particles-panel-css';
    const CSS_PATH = 'panels/fx/FXParticlesPanel.css';

    const TEMPLATE = `
        <div id="${PANEL_ID}" class="secondary-sidebar-panel pro-style sm-fx-panel" hidden>
            <div class="sm-fx-header">
                <div class="sm-fx-header-title">
                    <i class="fas fa-snowflake sm-fx-header-icon" aria-hidden="true"></i>
                    <span>FX &amp; Particles</span>
                </div>

                <button
                    class="sm-fx-icon-button tool-button"
                    type="button"
                    title="Close Panel"
                    aria-label="Close FX & Particles panel"
                    data-fx-action="close"
                >
                    <i class="fas fa-times" aria-hidden="true"></i>
                </button>
            </div>

            <div class="sm-fx-content">

                <!-- =========================================================
                     SNOW
                ========================================================== -->
                <section class="sm-fx-card" data-fx-section="snow">
                    <div class="sm-fx-card-title">
                        <span>Snow System</span>
                        <span class="sm-fx-status-dot" id="snow-status-dot" aria-hidden="true"></span>
                    </div>

                    <button
                        class="sm-fx-button sm-fx-button-primary sm-fx-button-wide"
                        id="toggleSnow"
                        type="button"
                        aria-pressed="false"
                    >
                        <i class="fas fa-snowflake" aria-hidden="true"></i>
                        <span>Toggle Snow</span>
                    </button>

                    <div class="sm-fx-preset-row" aria-label="Snow presets">
                        <button class="sm-fx-icon-button" id="storm" type="button" title="Storm Preset">
                            <i class="fas fa-cloud-showers-heavy" aria-hidden="true"></i>
                        </button>

                        <button class="sm-fx-icon-button" id="blizzard" type="button" title="Blizzard Preset">
                            <i class="fas fa-snowflake" aria-hidden="true"></i>
                        </button>

                        <button class="sm-fx-icon-button" id="gentle" type="button" title="Gentle Snow Preset">
                            <i class="fas fa-wind" aria-hidden="true"></i>
                        </button>
                    </div>

                    <div class="sm-fx-property-row">
                        <label class="sm-fx-label" for="snowMode">Mode</label>
                        <div class="sm-fx-control">
                            <select id="snowMode" class="sm-fx-select">
                                <option value="normal">Normal Falling</option>
                                <option value="vortex">Vortex</option>
                            </select>
                        </div>
                    </div>

                    <div class="sm-fx-property-row">
                        <label class="sm-fx-label" for="snow-density">Density</label>
                        <div class="sm-fx-control sm-fx-slider-control">
                            <input
                                type="range"
                                id="snow-density"
                                min="100"
                                max="5000"
                                value="1000"
                                step="100"
                                class="sm-fx-range pro-slider"
                            >
                            <input
                                type="number"
                                id="snow-density-value"
                                value="1000"
                                min="100"
                                max="5000"
                                step="100"
                                class="sm-fx-number ph-num-input"
                            >
                        </div>
                    </div>

                    <div class="sm-fx-property-row">
                        <label class="sm-fx-label" for="snow-size">Size</label>
                        <div class="sm-fx-control sm-fx-slider-control">
                            <input
                                type="range"
                                id="snow-size"
                                min="0.01"
                                max="0.5"
                                value="0.1"
                                step="0.01"
                                class="sm-fx-range pro-slider"
                            >
                            <input
                                type="number"
                                id="snow-size-value"
                                value="0.1"
                                min="0.01"
                                max="0.5"
                                step="0.01"
                                class="sm-fx-number ph-num-input"
                            >
                        </div>
                    </div>

                    <div class="sm-fx-property-row">
                        <label class="sm-fx-label" for="snow-speed">Speed</label>
                        <div class="sm-fx-control sm-fx-slider-control">
                            <input
                                type="range"
                                id="snow-speed"
                                min="0.1"
                                max="5"
                                value="1"
                                step="0.1"
                                class="sm-fx-range pro-slider"
                            >
                            <input
                                type="number"
                                id="snow-speed-value"
                                value="1"
                                min="0.1"
                                max="5"
                                step="0.1"
                                class="sm-fx-number ph-num-input"
                            >
                        </div>
                    </div>

                    <div class="sm-fx-property-row">
                        <label class="sm-fx-label" for="snow-wind">Wind (X)</label>
                        <div class="sm-fx-control sm-fx-slider-control">
                            <input
                                type="range"
                                id="snow-wind"
                                min="-5"
                                max="5"
                                value="0"
                                step="0.1"
                                class="sm-fx-range pro-slider"
                            >
                            <input
                                type="number"
                                id="snow-wind-value"
                                value="0"
                                min="-5"
                                max="5"
                                step="0.1"
                                class="sm-fx-number ph-num-input"
                            >
                        </div>
                    </div>

                    <div class="sm-fx-property-row">
                        <label class="sm-fx-label" for="snow-turbulence">Turbulence</label>
                        <div class="sm-fx-control sm-fx-slider-control">
                            <input
                                type="range"
                                id="snow-turbulence"
                                min="0"
                                max="2"
                                value="0.5"
                                step="0.1"
                                class="sm-fx-range pro-slider"
                            >
                            <input
                                type="number"
                                id="snow-turbulence-value"
                                value="0.5"
                                min="0"
                                max="2"
                                step="0.1"
                                class="sm-fx-number ph-num-input"
                            >
                        </div>
                    </div>
                </section>

                <!-- =========================================================
                     EXPLOSIONS
                ========================================================== -->
                <section class="sm-fx-card" data-fx-section="explosions">
                    <button
                        class="sm-fx-card-title sm-fx-card-title-button"
                        id="explosion-effects-title"
                        type="button"
                        aria-expanded="true"
                    >
                        <span>Explosion Effects</span>
                        <i class="fas fa-chevron-down sm-fx-collapse-chevron" aria-hidden="true"></i>
                    </button>

                    <div id="explosion-effects-body" class="sm-fx-section-body">
                        <div class="sm-fx-action-row">
                            <button
                                class="sm-fx-button sm-fx-button-danger sm-fx-button-grow"
                                id="explosion-btn"
                                type="button"
                            >
                                <i class="fas fa-bomb" aria-hidden="true"></i>
                                <span>Detonate</span>
                            </button>

                            <button
                                class="sm-fx-button"
                                id="clear-explosion-btn"
                                type="button"
                            >
                                <i class="fas fa-times" aria-hidden="true"></i>
                                <span>Clear</span>
                            </button>
                        </div>

                        <div class="sm-fx-toolbar">
                            <div class="sm-fx-toolbar-group" aria-label="Explosion presets">
                                <button class="sm-fx-icon-button" id="preset-fireball" type="button" title="Classic Fireball">
                                    <i class="fas fa-fire sm-fx-fire-icon" aria-hidden="true"></i>
                                </button>

                                <button class="sm-fx-icon-button" id="preset-nuclear" type="button" title="Nuclear Blast">
                                    <i class="fas fa-radiation sm-fx-nuclear-icon" aria-hidden="true"></i>
                                </button>

                                <button class="sm-fx-icon-button" id="preset-dust" type="button" title="Dust Explosion">
                                    <i class="fas fa-cloud sm-fx-dust-icon" aria-hidden="true"></i>
                                </button>

                                <button class="sm-fx-icon-button" id="preset-default" type="button" title="Reset Defaults">
                                    <i class="fas fa-undo" aria-hidden="true"></i>
                                </button>
                            </div>

                            <div class="sm-fx-toolbar-divider" aria-hidden="true"></div>

                            <div class="sm-fx-toolbar-group" aria-label="Explosion features">
                                <button
                                    class="sm-fx-icon-button is-active"
                                    id="toggle-shockwave"
                                    type="button"
                                    title="Toggle Shockwave"
                                    aria-pressed="true"
                                >
                                    <i class="fas fa-bullseye sm-fx-shockwave-icon" aria-hidden="true"></i>
                                </button>

                                <button
                                    class="sm-fx-icon-button is-active"
                                    id="toggle-debris"
                                    type="button"
                                    title="Toggle Debris"
                                    aria-pressed="true"
                                >
                                    <i class="fas fa-cubes" aria-hidden="true"></i>
                                </button>

                                <button
                                    class="sm-fx-icon-button is-active"
                                    id="toggle-sparks"
                                    type="button"
                                    title="Toggle Sparks"
                                    aria-pressed="true"
                                >
                                    <i class="fas fa-bolt sm-fx-sparks-icon" aria-hidden="true"></i>
                                </button>
                            </div>
                        </div>

                        <div class="sm-fx-property-row">
                            <label class="sm-fx-label" for="explosion-particle-count">Max Particles</label>
                            <div class="sm-fx-control sm-fx-slider-control">
                                <input
                                    type="range"
                                    id="explosion-particle-count"
                                    min="1000"
                                    max="30000"
                                    value="5000"
                                    step="500"
                                    class="sm-fx-range pro-slider"
                                >
                                <input
                                    type="number"
                                    id="explosion-particle-count-value"
                                    value="5000"
                                    min="1000"
                                    max="30000"
                                    step="500"
                                    class="sm-fx-number ph-num-input"
                                >
                            </div>
                        </div>

                        <div class="sm-fx-property-row">
                            <label class="sm-fx-label" for="explosion-force">Force</label>
                            <div class="sm-fx-control sm-fx-slider-control">
                                <input
                                    type="range"
                                    id="explosion-force"
                                    min="1"
                                    max="50"
                                    value="10"
                                    step="1"
                                    class="sm-fx-range pro-slider"
                                >
                                <input
                                    type="number"
                                    id="explosion-force-value"
                                    value="10"
                                    min="1"
                                    max="50"
                                    step="1"
                                    class="sm-fx-number ph-num-input"
                                >
                            </div>
                        </div>

                        <div class="sm-fx-property-row">
                            <label class="sm-fx-label" for="explosion-duration">Duration (s)</label>
                            <div class="sm-fx-control sm-fx-slider-control">
                                <input
                                    type="range"
                                    id="explosion-duration"
                                    min="0.5"
                                    max="10"
                                    value="3"
                                    step="0.5"
                                    class="sm-fx-range pro-slider"
                                >
                                <input
                                    type="number"
                                    id="explosion-duration-value"
                                    value="3"
                                    min="0.5"
                                    max="10"
                                    step="0.5"
                                    class="sm-fx-number ph-num-input"
                                >
                            </div>
                        </div>

                        <div class="sm-fx-section-title">Fire &amp; Smoke</div>

                        <div class="sm-fx-property-row">
                            <label class="sm-fx-label" for="fire-intensity">Fire Intensity</label>
                            <div class="sm-fx-control sm-fx-slider-control">
                                <input
                                    type="range"
                                    id="fire-intensity"
                                    min="0"
                                    max="2"
                                    value="0.8"
                                    step="0.1"
                                    class="sm-fx-range pro-slider"
                                >
                                <input
                                    type="number"
                                    id="fire-intensity-value"
                                    value="0.8"
                                    min="0"
                                    max="2"
                                    step="0.1"
                                    class="sm-fx-number ph-num-input"
                                >
                            </div>
                        </div>

                        <div class="sm-fx-property-row">
                            <label class="sm-fx-label" for="fire-size">Fire Size</label>
                            <div class="sm-fx-control sm-fx-slider-control">
                                <input
                                    type="range"
                                    id="fire-size"
                                    min="1"
                                    max="20"
                                    value="5"
                                    step="1"
                                    class="sm-fx-range pro-slider"
                                >
                                <input
                                    type="number"
                                    id="fire-size-value"
                                    value="5"
                                    min="1"
                                    max="20"
                                    step="1"
                                    class="sm-fx-number ph-num-input"
                                >
                            </div>
                        </div>

                        <div class="sm-fx-property-row">
                            <label class="sm-fx-label" for="smoke-density">Smoke Density</label>
                            <div class="sm-fx-control sm-fx-slider-control">
                                <input
                                    type="range"
                                    id="smoke-density"
                                    min="0"
                                    max="2"
                                    value="0.6"
                                    step="0.1"
                                    class="sm-fx-range pro-slider"
                                >
                                <input
                                    type="number"
                                    id="smoke-density-value"
                                    value="0.6"
                                    min="0"
                                    max="2"
                                    step="0.1"
                                    class="sm-fx-number ph-num-input"
                                >
                            </div>
                        </div>

                        <div class="sm-fx-property-row">
                            <label class="sm-fx-label" for="smoke-speed">Smoke Speed</label>
                            <div class="sm-fx-control sm-fx-slider-control">
                                <input
                                    type="range"
                                    id="smoke-speed"
                                    min="0.1"
                                    max="10"
                                    value="2"
                                    step="0.1"
                                    class="sm-fx-range pro-slider"
                                >
                                <input
                                    type="number"
                                    id="smoke-speed-value"
                                    value="2"
                                    min="0.1"
                                    max="10"
                                    step="0.1"
                                    class="sm-fx-number ph-num-input"
                                >
                            </div>
                        </div>

                        <div class="sm-fx-stats">
                            <span>Active Particles</span>
                            <strong id="particle-count-display">0</strong>
                        </div>
                    </div>
                </section>

                <!-- =========================================================
                     GENERIC PARTICLE EMITTER
                ========================================================== -->
                <section class="sm-fx-card" id="controls" data-fx-section="particles">
                    <div class="sm-fx-card-title">
                        <span>Particle Emitter</span>
                        <span class="sm-fx-status-dot" id="particle-emitter-status-dot" aria-hidden="true"></span>
                    </div>

                    <div class="sm-fx-action-row">
                        <button
                            class="sm-fx-button sm-fx-button-primary sm-fx-button-grow"
                            id="toggleParticles"
                            type="button"
                            aria-pressed="false"
                        >
                            <i class="fas fa-sparkles" aria-hidden="true"></i>
                            <span>Toggle Particles</span>
                        </button>

                        <button
                            class="sm-fx-icon-button"
                            id="increaseParticles"
                            type="button"
                            title="Increase Particles"
                        >
                            <i class="fas fa-plus" aria-hidden="true"></i>
                        </button>

                        <button
                            class="sm-fx-icon-button"
                            id="decreaseParticles"
                            type="button"
                            title="Decrease Particles"
                        >
                            <i class="fas fa-minus" aria-hidden="true"></i>
                        </button>

                        <label class="sm-fx-color-wrap" title="Particle Color">
                            <span class="sm-fx-visually-hidden">Particle Color</span>
                            <input
                                type="color"
                                id="particle-emitter-color"
                                class="sm-fx-color"
                                value="#ffcc88"
                            >
                        </label>
                    </div>

                    <div id="particle-advanced">
                        <div class="sm-fx-property-row">
                            <label class="sm-fx-label" for="particle-emitter-blending">Blend Mode</label>
                            <div class="sm-fx-control">
                                <select id="particle-emitter-blending" class="sm-fx-select">
                                    <option value="AdditiveBlending" selected>Additive</option>
                                    <option value="NormalBlending">Normal</option>
                                    <option value="SubtractiveBlending">Subtractive</option>
                                </select>
                            </div>
                        </div>

                        <div class="sm-fx-property-row">
                            <label class="sm-fx-label" for="particle-emitter-count">Count</label>
                            <div class="sm-fx-control sm-fx-slider-control">
                                <input
                                    type="range"
                                    id="particle-emitter-count"
                                    min="1000"
                                    max="250000"
                                    step="1000"
                                    value="50000"
                                    class="sm-fx-range pro-slider"
                                >
                                <input
                                    type="number"
                                    id="particle-emitter-count-value"
                                    value="50000"
                                    min="1000"
                                    max="250000"
                                    step="1000"
                                    class="sm-fx-number ph-num-input"
                                >
                            </div>
                        </div>

                        <div class="sm-fx-property-row">
                            <label class="sm-fx-label" for="particle-emitter-size">Size</label>
                            <div class="sm-fx-control sm-fx-slider-control">
                                <input
                                    type="range"
                                    id="particle-emitter-size"
                                    min="0.1"
                                    max="2"
                                    step="0.1"
                                    value="0.3"
                                    class="sm-fx-range pro-slider"
                                >
                                <input
                                    type="number"
                                    id="particle-emitter-size-value"
                                    value="0.3"
                                    min="0.1"
                                    max="2"
                                    step="0.1"
                                    class="sm-fx-number ph-num-input"
                                >
                            </div>
                        </div>

                        <div class="sm-fx-property-row">
                            <label class="sm-fx-label" for="particle-emitter-opacity">Opacity</label>
                            <div class="sm-fx-control sm-fx-slider-control">
                                <input
                                    type="range"
                                    id="particle-emitter-opacity"
                                    min="0"
                                    max="1"
                                    step="0.05"
                                    value="0.8"
                                    class="sm-fx-range pro-slider"
                                >
                                <input
                                    type="number"
                                    id="particle-emitter-opacity-value"
                                    value="0.8"
                                    min="0"
                                    max="1"
                                    step="0.05"
                                    class="sm-fx-number ph-num-input"
                                >
                            </div>
                        </div>

                        <div class="sm-fx-property-row">
                            <label class="sm-fx-label" for="particle-emitter-speed">Speed</label>
                            <div class="sm-fx-control sm-fx-slider-control">
                                <input
                                    type="range"
                                    id="particle-emitter-speed"
                                    min="0.1"
                                    max="3"
                                    step="0.1"
                                    value="1"
                                    class="sm-fx-range pro-slider"
                                >
                                <input
                                    type="number"
                                    id="particle-emitter-speed-value"
                                    value="1"
                                    min="0.1"
                                    max="3"
                                    step="0.1"
                                    class="sm-fx-number ph-num-input"
                                >
                            </div>
                        </div>
                    </div>
                </section>
            </div>
        </div>
    `;

    function ensureStylesheet() {
        if (document.getElementById(CSS_ID)) {
            return;
        }

        const link = document.createElement('link');
        link.id = CSS_ID;
        link.rel = 'stylesheet';
        link.href = CSS_PATH;
        link.dataset.smFxPanelStyles = '1';

        document.head.appendChild(link);
    }

    function getMount() {
        return document.getElementById(MOUNT_ID);
    }

    function getPanel() {
        return document.getElementById(PANEL_ID);
    }

    function mount() {
        ensureStylesheet();

        const existing = getPanel();
        if (existing) {
            return existing;
        }

        const mountPoint = getMount();

        if (!mountPoint) {
            console.warn(
                `[SMFXPanelView] #${MOUNT_ID} was not found. ` +
                'Keep <div id="sm-fx-panel-mount"></div> in index.html.'
            );
            return null;
        }

        mountPoint.insertAdjacentHTML('beforeend', TEMPLATE);

        const panel = getPanel();

        if (!panel) {
            console.error('[SMFXPanelView] Panel markup could not be mounted.');
            return null;
        }

        /*
         * `hidden` prevents a flash before SecondarySidebar takes ownership.
         * Remove it after mounting while keeping display:none until the sidebar
         * opens the panel.
         */
        panel.hidden = false;
        panel.style.display = 'none';

        global.dispatchEvent?.(
            new CustomEvent('smfx:panel-view-mounted', {
                detail: {
                    version: VIEW_VERSION,
                    panel,
                    mountPoint
                }
            })
        );

        return panel;
    }

    function unmount() {
        const panel = getPanel();

        if (!panel) {
            return false;
        }

        panel.remove();

        global.dispatchEvent?.(
            new CustomEvent('smfx:panel-view-unmounted', {
                detail: {
                    version: VIEW_VERSION
                }
            })
        );

        return true;
    }

    const API = Object.freeze({
        version: VIEW_VERSION,
        mount,
        unmount,
        getPanel,
        ensureStylesheet
    });

    global.SMFXParticlesPanelView = API;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', mount, {
            once: true
        });
    } else {
        mount();
    }

})(window);