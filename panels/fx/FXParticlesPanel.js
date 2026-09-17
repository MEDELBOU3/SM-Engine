/*
 * ============================================================================
 * SM ENGINE — FX PARTICLES PANEL CONTROLLER
 * Source file: panels/fx/FXParticlesPanel.js
 * ============================================================================
 *
 * View:
 *     panels/fx/FXParticlesPanelView.js
 *
 * Runtime:
 *     engine/fx/FXBootstrap.js
 *
 * Rules:
 * - This file does not create its own requestAnimationFrame loop.
 * - The engine animation loop owns SMFX.update(deltaTime).
 * - This controller only binds UI state to the FX runtime.
 * ============================================================================
 */

(function (global) {
    'use strict';

    const VERSION = '2.0.0';
    const PANEL_ID = 'snow-sittings';

    const state = {
        initialized: false,
        bound: false,
        panel: null,
        handlers: [],
        particleEmitter: null,
        explosionFeatures: {
            shockwave: true,
            debris: true,
            sparks: true
        }
    };

    /* ------------------------------------------------------------------------
       Utilities
    ------------------------------------------------------------------------- */

    function log(...args) {
        console.log('[SMFXPanel]', ...args);
    }

    function warn(...args) {
        console.warn('[SMFXPanel]', ...args);
    }

    function byId(id) {
        return document.getElementById(id);
    }

    function listen(element, eventName, handler, options) {
        if (!element) return;

        element.addEventListener(eventName, handler, options);

        state.handlers.push(() => {
            element.removeEventListener(eventName, handler, options);
        });
    }

    function clamp(value, min, max) {
        let result = Number(value);

        if (!Number.isFinite(result)) {
            result = 0;
        }

        if (Number.isFinite(min)) {
            result = Math.max(min, result);
        }

        if (Number.isFinite(max)) {
            result = Math.min(max, result);
        }

        return result;
    }

    function setPressed(element, active) {
        if (!element) return;

        const enabled = !!active;

        element.classList.toggle('is-active', enabled);
        element.classList.toggle('active', enabled);
        element.setAttribute('aria-pressed', String(enabled));
    }

    function updateSliderFill(slider) {
        if (!slider) return;

        const min = Number(slider.min || 0);
        const max = Number(slider.max || 100);
        const value = Number(slider.value || min);
        const span = Math.max(0.000001, max - min);
        const fill = ((value - min) / span) * 100;

        slider.style.setProperty(
            '--sm-fx-slider-fill',
            `${Math.max(0, Math.min(100, fill))}%`
        );

        /*
         * Preserve compatibility with the engine's global slider helper.
         */
        try {
            if (
                typeof global.updateSliderFill === 'function' &&
                global.updateSliderFill !== updateSliderFill
            ) {
                global.updateSliderFill(slider);
            }
        } catch (_) {}
    }

    function setRangePair(rangeId, numberId, value) {
        if (value == null) return;

        const range = byId(rangeId);
        const number = byId(numberId);

        if (range) {
            range.value = String(value);
            updateSliderFill(range);
        }

        if (number) {
            number.value = String(value);
        }
    }

    function bindRangePair(rangeId, numberId, callback) {
        const range = byId(rangeId);
        const number = byId(numberId);

        if (!range && !number) {
            return;
        }

        const normalize = (rawValue) => {
            const min = Number(range?.min ?? number?.min);
            const max = Number(range?.max ?? number?.max);

            return clamp(
                rawValue,
                Number.isFinite(min) ? min : undefined,
                Number.isFinite(max) ? max : undefined
            );
        };

        const apply = (rawValue, source) => {
            const value = normalize(rawValue);

            if (range && source !== range) {
                range.value = String(value);
            }

            if (number && source !== number) {
                number.value = String(value);
            }

            updateSliderFill(range);
            callback?.(value);
        };

        listen(range, 'input', (event) => {
            apply(event.target.value, range);
        });

        listen(number, 'input', (event) => {
            apply(event.target.value, number);
        });

        listen(number, 'change', (event) => {
            apply(event.target.value, number);
        });

        updateSliderFill(range);
    }

    /* ------------------------------------------------------------------------
       Runtime resolution
    ------------------------------------------------------------------------- */

    function getFX() {
        return global.SMFX || null;
    }

    function getManager() {
        return (
            getFX()?.manager ||
            global.fxManager ||
            global.smFXManager ||
            null
        );
    }

    function getSnow() {
        return (
            getFX()?.snow ||
            getManager()?.get?.('snow') ||
            getManager()?.snow ||
            global.snowSystem ||
            null
        );
    }

    function getExplosions() {
        return (
            getFX()?.explosions ||
            getManager()?.get?.('explosions') ||
            getManager()?.explosions ||
            global.explosionSystem ||
            null
        );
    }

    function getParticles() {
        return (
            getFX()?.particles ||
            getManager()?.get?.('particles') ||
            getManager()?.particles ||
            global.particleSystem ||
            null
        );
    }

    function ensureRuntime() {
        const fx = getFX();

        if (!fx) {
            warn(
                'SMFX is unavailable. Make sure engine/fx/FXBootstrap.js ' +
                'loads before FXParticlesPanel.js.'
            );
            return false;
        }

        if (fx.manager) {
            return true;
        }

        const scene =
            global.scene ||
            global.editor?.scene ||
            null;

        if (!scene) {
            warn('FX runtime cannot initialize yet because the scene is unavailable.');
            return false;
        }

        fx.initialize?.({
            scene,
            camera:
                global.SMViewportSystem?.getActivePanel?.()?.camera ||
                global.camera ||
                global.editor?.camera ||
                null,
            renderer:
                global.renderer ||
                global.editor?.renderer ||
                null
        });

        return !!fx.manager;
    }

    function getSpawnPosition(position) {
        const fx = getFX();

        if (position && fx?.resolveSpawnPosition) {
            return fx.resolveSpawnPosition(position);
        }

        if (!position && fx?.resolveSpawnPosition) {
            return fx.resolveSpawnPosition();
        }

        if (!global.THREE) {
            return null;
        }

        if (position?.isVector3) {
            return position.clone();
        }

        const selected =
            global.selectedObject ||
            global.editor?.selected ||
            null;

        if (selected?.getWorldPosition) {
            return selected.getWorldPosition(new THREE.Vector3());
        }

        return new THREE.Vector3(0, 0, 0);
    }

    /* ------------------------------------------------------------------------
       Panel shell
    ------------------------------------------------------------------------- */

    function closePanel() {
        if (global.SecondarySidebar?.close) {
            global.SecondarySidebar.close('snow');
            return;
        }

        const panel = state.panel || byId(PANEL_ID);

        if (panel) {
            panel.style.display = 'none';
        }
    }

    function toggleExplosionSection() {
        const title = byId('explosion-effects-title');
        const body = byId('explosion-effects-body');

        if (!title || !body) return;

        const collapsed = body.classList.toggle('is-collapsed');

        title.classList.toggle('is-collapsed', collapsed);
        title.setAttribute('aria-expanded', String(!collapsed));
    }

    /* ------------------------------------------------------------------------
       Snow
    ------------------------------------------------------------------------- */

    function applySnowPreset(name) {
        if (!ensureRuntime()) return;

        if (getFX()?.setSnowPreset) {
            getFX().setSnowPreset(name);
        } else {
            getSnow()?.applyPreset?.(name);
        }

        syncSnow();
    }

    function syncSnow() {
        const snow = getSnow();

        if (!snow) {
            setPressed(byId('toggleSnow'), false);
            byId('snow-status-dot')?.classList.remove('is-online');
            return;
        }

        const params =
            snow.getParameters?.() ||
            snow.settings ||
            {};

        setPressed(byId('toggleSnow'), !!snow.enabled);

        byId('snow-status-dot')
            ?.classList.toggle('is-online', !!snow.enabled);

        if (params.mode != null && byId('snowMode')) {
            byId('snowMode').value = params.mode;
        }

        setRangePair('snow-density', 'snow-density-value', params.density);
        setRangePair('snow-size', 'snow-size-value', params.size);
        setRangePair('snow-speed', 'snow-speed-value', params.speed);
        setRangePair('snow-wind', 'snow-wind-value', params.wind);
        setRangePair('snow-turbulence', 'snow-turbulence-value', params.turbulence);
    }

    function bindSnow() {
        listen(byId('toggleSnow'), 'click', () => {
            if (!ensureRuntime()) return;

            if (getFX()?.toggleSnow) {
                getFX().toggleSnow();
            } else {
                getSnow()?.toggle?.();
            }

            syncSnow();
        });

        listen(byId('storm'), 'click', () => applySnowPreset('storm'));
        listen(byId('blizzard'), 'click', () => applySnowPreset('blizzard'));
        listen(byId('gentle'), 'click', () => applySnowPreset('gentle'));

        listen(byId('snowMode'), 'change', (event) => {
            getSnow()?.setMode?.(event.target.value);
        });

        bindRangePair(
            'snow-density',
            'snow-density-value',
            (value) => getSnow()?.setDensity?.(value)
        );

        bindRangePair(
            'snow-size',
            'snow-size-value',
            (value) => getSnow()?.setSize?.(value)
        );

        bindRangePair(
            'snow-speed',
            'snow-speed-value',
            (value) => getSnow()?.setSpeed?.(value)
        );

        bindRangePair(
            'snow-wind',
            'snow-wind-value',
            (value) => getSnow()?.setWind?.(value)
        );

        bindRangePair(
            'snow-turbulence',
            'snow-turbulence-value',
            (value) => getSnow()?.setTurbulence?.(value)
        );
    }

    /* ------------------------------------------------------------------------
       Explosions
    ------------------------------------------------------------------------- */

    function applyExplosionPreset(name) {
        if (!ensureRuntime()) return;

        if (getFX()?.setExplosionPreset) {
            getFX().setExplosionPreset(name);
        } else {
            getExplosions()?.applyPreset?.(name);
        }

        syncExplosions();
    }

    function detonate(position = null, options = {}) {
        if (!ensureRuntime()) {
            return null;
        }

        const spawnPosition = getSpawnPosition(position);

        const mergedOptions = {
            ...options,
            settings: {
                shockwave: state.explosionFeatures.shockwave,
                debris: state.explosionFeatures.debris,
                sparks: state.explosionFeatures.sparks,
                ...(options.settings || {})
            }
        };

        const result = getFX()?.explode
            ? getFX().explode(spawnPosition, mergedOptions)
            : getExplosions()?.explode?.(spawnPosition, mergedOptions);

        global.cameraSystem?.shake?.(0.35, 0.4);

        updateParticleCounter();

        return result || null;
    }

    function clearExplosions() {
        if (getFX()?.clearExplosions) {
            getFX().clearExplosions();
        } else {
            getExplosions()?.clear?.();
        }

        updateParticleCounter();
    }

    function setExplosionFeature(name, enabled) {
        state.explosionFeatures[name] = !!enabled;

        getExplosions()?.setParameters?.({
            [name]: !!enabled
        });

        setPressed(
            byId(`toggle-${name}`),
            !!enabled
        );
    }

    function toggleExplosionFeature(name) {
        setExplosionFeature(
            name,
            !state.explosionFeatures[name]
        );
    }

    function syncExplosions() {
        const explosions = getExplosions();

        if (!explosions) {
            return;
        }

        const params =
            explosions.getParameters?.() ||
            explosions.settings ||
            {};

        state.explosionFeatures.shockwave = params.shockwave !== false;
        state.explosionFeatures.debris = params.debris !== false;
        state.explosionFeatures.sparks = params.sparks !== false;

        setPressed(
            byId('toggle-shockwave'),
            state.explosionFeatures.shockwave
        );

        setPressed(
            byId('toggle-debris'),
            state.explosionFeatures.debris
        );

        setPressed(
            byId('toggle-sparks'),
            state.explosionFeatures.sparks
        );

        setRangePair(
            'explosion-particle-count',
            'explosion-particle-count-value',
            params.maxParticles
        );

        setRangePair(
            'explosion-force',
            'explosion-force-value',
            params.force
        );

        setRangePair(
            'explosion-duration',
            'explosion-duration-value',
            params.duration
        );

        setRangePair(
            'fire-intensity',
            'fire-intensity-value',
            params.fireIntensity
        );

        setRangePair(
            'fire-size',
            'fire-size-value',
            params.fireSize
        );

        setRangePair(
            'smoke-density',
            'smoke-density-value',
            params.smokeDensity
        );

        setRangePair(
            'smoke-speed',
            'smoke-speed-value',
            params.smokeSpeed
        );
    }

    function bindExplosions() {
        listen(byId('explosion-effects-title'), 'click', toggleExplosionSection);
        listen(byId('explosion-btn'), 'click', () => detonate());
        listen(byId('clear-explosion-btn'), 'click', clearExplosions);

        listen(byId('preset-fireball'), 'click', () => applyExplosionPreset('fireball'));
        listen(byId('preset-nuclear'), 'click', () => applyExplosionPreset('nuclear'));
        listen(byId('preset-dust'), 'click', () => applyExplosionPreset('dust'));
        listen(byId('preset-default'), 'click', () => applyExplosionPreset('default'));

        listen(
            byId('toggle-shockwave'),
            'click',
            () => toggleExplosionFeature('shockwave')
        );

        listen(
            byId('toggle-debris'),
            'click',
            () => toggleExplosionFeature('debris')
        );

        listen(
            byId('toggle-sparks'),
            'click',
            () => toggleExplosionFeature('sparks')
        );

        bindRangePair(
            'explosion-particle-count',
            'explosion-particle-count-value',
            (value) => {
                getExplosions()?.setParameters?.({
                    maxParticles: Math.round(value)
                });
            }
        );

        bindRangePair(
            'explosion-force',
            'explosion-force-value',
            (value) => {
                getExplosions()?.setParameters?.({
                    force: value
                });
            }
        );

        bindRangePair(
            'explosion-duration',
            'explosion-duration-value',
            (value) => {
                getExplosions()?.setParameters?.({
                    duration: value
                });
            }
        );

        bindRangePair(
            'fire-intensity',
            'fire-intensity-value',
            (value) => {
                getExplosions()?.setParameters?.({
                    fireIntensity: value
                });
            }
        );

        bindRangePair(
            'fire-size',
            'fire-size-value',
            (value) => {
                getExplosions()?.setParameters?.({
                    fireSize: value
                });
            }
        );

        bindRangePair(
            'smoke-density',
            'smoke-density-value',
            (value) => {
                getExplosions()?.setParameters?.({
                    smokeDensity: value
                });
            }
        );

        bindRangePair(
            'smoke-speed',
            'smoke-speed-value',
            (value) => {
                getExplosions()?.setParameters?.({
                    smokeSpeed: value
                });
            }
        );
    }

    /* ------------------------------------------------------------------------
       Generic particle emitter
    ------------------------------------------------------------------------- */

    function readParticleEmitterUI() {
        return {
            count: Number(byId('particle-emitter-count')?.value || 50000),
            size: Number(byId('particle-emitter-size')?.value || 0.3),
            opacity: Number(byId('particle-emitter-opacity')?.value || 0.8),
            speed: Number(byId('particle-emitter-speed')?.value || 1),
            color: byId('particle-emitter-color')?.value || '#ffcc88',
            blending:
                byId('particle-emitter-blending')?.value ||
                'AdditiveBlending'
        };
    }

    function createPanelEmitter(options = {}) {
        if (!ensureRuntime()) {
            return null;
        }

        if (state.particleEmitter) {
            return state.particleEmitter;
        }

        const config = {
            ...readParticleEmitterUI(),
            position: getSpawnPosition(options.position),
            ...options
        };

        state.particleEmitter = getFX()?.createParticleEmitter
            ? getFX().createParticleEmitter(config)
            : getParticles()?.createEmitter?.(config) || null;

        syncParticles();
        updateParticleCounter();

        return state.particleEmitter;
    }

    function removePanelEmitter() {
        const emitter = state.particleEmitter;

        if (!emitter) {
            return false;
        }

        const removed = getFX()?.removeParticleEmitter
            ? getFX().removeParticleEmitter(emitter)
            : getParticles()?.removeEmitter?.(emitter);

        state.particleEmitter = null;

        syncParticles();
        updateParticleCounter();

        return removed !== false;
    }

    function changeParticleCount(delta) {
        const range = byId('particle-emitter-count');
        const number = byId('particle-emitter-count-value');

        const current = Number(
            range?.value ||
            number?.value ||
            state.particleEmitter?.settings?.count ||
            50000
        );

        const min = Number(range?.min || 1000);
        const max = Number(range?.max || 250000);
        const next = clamp(current + delta, min, max);

        setRangePair(
            'particle-emitter-count',
            'particle-emitter-count-value',
            next
        );

        state.particleEmitter?.setCount?.(next);

        updateParticleCounter();
    }

    function syncParticles() {
        const emitter = state.particleEmitter;
        const active = !!emitter;

        setPressed(byId('toggleParticles'), active);

        byId('particle-emitter-status-dot')
            ?.classList.toggle('is-online', active);

        if (!emitter) {
            return;
        }

        const settings =
            emitter.getParameters?.() ||
            emitter.settings ||
            {};

        setRangePair(
            'particle-emitter-count',
            'particle-emitter-count-value',
            settings.count
        );

        setRangePair(
            'particle-emitter-size',
            'particle-emitter-size-value',
            settings.size
        );

        setRangePair(
            'particle-emitter-opacity',
            'particle-emitter-opacity-value',
            settings.opacity
        );

        setRangePair(
            'particle-emitter-speed',
            'particle-emitter-speed-value',
            settings.speed
        );

        if (
            settings.color != null &&
            byId('particle-emitter-color')
        ) {
            byId('particle-emitter-color').value = String(settings.color);
        }

        if (
            settings.blending != null &&
            byId('particle-emitter-blending')
        ) {
            byId('particle-emitter-blending').value = settings.blending;
        }
    }

    function bindParticles() {
        listen(byId('toggleParticles'), 'click', () => {
            if (state.particleEmitter) {
                removePanelEmitter();
            } else {
                createPanelEmitter();
            }
        });

        listen(byId('increaseParticles'), 'click', () => {
            changeParticleCount(1000);
        });

        listen(byId('decreaseParticles'), 'click', () => {
            changeParticleCount(-1000);
        });

        listen(byId('particle-emitter-color'), 'input', (event) => {
            state.particleEmitter?.setColor?.(event.target.value);
        });

        listen(byId('particle-emitter-blending'), 'change', (event) => {
            state.particleEmitter?.setBlending?.(event.target.value);
        });

        bindRangePair(
            'particle-emitter-count',
            'particle-emitter-count-value',
            (value) => {
                state.particleEmitter?.setCount?.(Math.round(value));
                updateParticleCounter();
            }
        );

        bindRangePair(
            'particle-emitter-size',
            'particle-emitter-size-value',
            (value) => state.particleEmitter?.setSize?.(value)
        );

        bindRangePair(
            'particle-emitter-opacity',
            'particle-emitter-opacity-value',
            (value) => state.particleEmitter?.setOpacity?.(value)
        );

        bindRangePair(
            'particle-emitter-speed',
            'particle-emitter-speed-value',
            (value) => state.particleEmitter?.setSpeed?.(value)
        );
    }

    /* ------------------------------------------------------------------------
       Counter / synchronization
    ------------------------------------------------------------------------- */

    function updateParticleCounter() {
        const display = byId('particle-count-display');

        if (!display) {
            return;
        }

        let total = 0;

        if (state.particleEmitter) {
            total += Number(
                state.particleEmitter.settings?.count ||
                state.particleEmitter.count ||
                0
            );
        }

        const explosions = getExplosions();

        for (const explosion of explosions?.activeExplosions || []) {
            if (!explosion?.finished) {
                total += Number(
                    explosion?.settings?.maxParticles ||
                    0
                );
            }
        }

        display.textContent =
            Math.max(0, Math.round(total))
                .toLocaleString();
    }

    function sync() {
        syncSnow();
        syncExplosions();
        syncParticles();
        updateParticleCounter();
    }

    /*
     * Optional frame hook.
     *
     * The actual FX simulation is still updated by SMFX.update(dt).
     * This only refreshes lightweight panel stats when the panel is visible.
     */
    function update() {
        if (!state.bound || !state.panel) return;
        if (state.panel.style.display === 'none') return;

        updateParticleCounter();
    }

    /* ------------------------------------------------------------------------
       Bind lifecycle
    ------------------------------------------------------------------------- */

    function bind() {
        if (state.bound) {
            return true;
        }

        state.panel = byId(PANEL_ID);

        if (!state.panel) {
            return false;
        }

        listen(
            state.panel.querySelector('[data-fx-action="close"]'),
            'click',
            closePanel
        );

        bindSnow();
        bindExplosions();
        bindParticles();

        state.bound = true;

        sync();

        log(`Bound v${VERSION}.`);

        return true;
    }

    function unbind() {
        for (const remove of state.handlers.splice(0)) {
            try {
                remove();
            } catch (_) {}
        }

        state.bound = false;
        state.panel = null;
    }

    function init() {
        if (state.initialized) {
            if (!state.bound) {
                bind();
            }

            sync();
            return API;
        }

        state.initialized = true;

        /*
         * Mount the view if it is available and not already mounted.
         */
        global.SMFXParticlesPanelView?.mount?.();

        if (!bind()) {
            warn(
                'FX panel view is not mounted yet. Waiting for ' +
                'smfx:panel-view-mounted.'
            );
        }

        return API;
    }

    function dispose(options = {}) {
        unbind();

        if (
            options.removeEmitter !== false &&
            state.particleEmitter
        ) {
            removePanelEmitter();
        }

        state.initialized = false;
    }

    /* ------------------------------------------------------------------------
       Public API
    ------------------------------------------------------------------------- */

    const API = {
        version: VERSION,

        init,
        bind,
        unbind,
        dispose,
        sync,
        update,

        close: closePanel,

        get panel() {
            return state.panel;
        },

        get particleEmitter() {
            return state.particleEmitter;
        },

        get state() {
            return state;
        },

        snow: {
            sync: syncSnow,
            preset: applySnowPreset,

            toggle() {
                if (!ensureRuntime()) return false;

                if (getFX()?.toggleSnow) {
                    getFX().toggleSnow();
                } else {
                    getSnow()?.toggle?.();
                }

                syncSnow();

                return !!getSnow()?.enabled;
            }
        },

        explosions: {
            detonate,
            clear: clearExplosions,
            preset: applyExplosionPreset,
            sync: syncExplosions
        },

        particles: {
            create: createPanelEmitter,
            remove: removePanelEmitter,
            sync: syncParticles,

            clear() {
                getFX()?.clearParticleEmitters?.();
                state.particleEmitter = null;
                syncParticles();
                updateParticleCounter();
            }
        }
    };

    global.SMFXParticlesPanel = API;
    global.initFXParticlesPanel = init;

    /*
     * View may be inserted dynamically.
     */
    global.addEventListener?.(
        'smfx:panel-view-mounted',
        () => {
            if (state.initialized && !state.bound) {
                bind();
            }
        }
    );

    /*
     * Initialize the controller after DOM bootstrap.
     */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, {
            once: true
        });
    } else {
        init();
    }

})(window);
