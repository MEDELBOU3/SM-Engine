/*
 * ================================================================
 * SM ENGINE — FX BOOTSTRAP
 * File: engine/fx/FXBootstrap.js
 * ================================================================
 *
 * Purpose
 * -------
 * Central bootstrap/integration entry point for the SM Engine FX
 * subsystem.
 *
 * It connects:
 *
 *   engine/fx/core/
 *      FXUtils.js
 *      FXSystem.js
 *      ParticlePool.js
 *      ParticleEmitter.js
 *      FXManager.js
 *
 *   engine/fx/snow/
 *      SnowPresets.js
 *      SnowMaterial.js
 *      SnowEmitter.js
 *      SnowSystem.js
 *
 *   engine/fx/explosions/
 *      ExplosionPresets.js
 *      SparkEmitter.js
 *      DebrisEmitter.js
 *      ShockwaveEffect.js
 *      FireEmitter.js
 *      SmokeEmitter.js
 *      ExplosionEmitter.js
 *      ExplosionSystem.js
 *
 *   engine/fx/particles/
 *      ParticlePresets.js
 *      ParticleMaterial.js
 *      CustomEmitter.js
 *      ParticleSystem.js
 *
 * The bootstrap DOES NOT create a second render loop.
 * The engine's existing animation loop should call:
 *
 *      window.SMFX?.update(deltaTime);
 *
 * or:
 *
 *      window.fxManager?.update(deltaTime);
 *
 * once per frame.
 *
 * ================================================================
 */

(function (global) {
  "use strict";

  const BOOTSTRAP_VERSION = "1.0.0";
  const GLOBAL_KEY = "__SM_FX_BOOTSTRAP_STATE__";

  /* ============================================================
       INTERNAL STATE
    ============================================================ */

  const state = global[GLOBAL_KEY] || {
    version: BOOTSTRAP_VERSION,

    initialized: false,
    initializing: false,
    disposed: false,

    manager: null,

    scene: null,
    camera: null,
    renderer: null,

    lastTimestamp: 0,
    elapsed: 0,

    updateCount: 0,

    missingDependencies: [],
    registeredSystems: [],

    options: {
      autoCreateSnow: true,
      autoCreateExplosions: true,
      autoCreateParticles: true,

      snowEnabledOnStart: false,

      exposeGlobals: true,
      verbose: true,
    },
  };

  global[GLOBAL_KEY] = state;

  /* ============================================================
       LOGGING
    ============================================================ */

  function log(...args) {
    if (state.options.verbose !== false) {
      console.log("[SMFX]", ...args);
    }
  }

  function warn(...args) {
    console.warn("[SMFX]", ...args);
  }

  function error(...args) {
    console.error("[SMFX]", ...args);
  }

  /* ============================================================
       DEPENDENCY HELPERS
    ============================================================ */

  function has(name) {
    return typeof global[name] !== "undefined" && global[name] !== null;
  }

  function checkDependencies() {
    const required = [
      "THREE",
      "SMFXUtils",
      "SMFXSystem",
      "SMParticleEmitter",
      "SMFXManager",
    ];

    const optionalSystems = [
      "SMSnowSystem",
      "SMExplosionSystem",
      "SMParticleSystem",
    ];

    const missingRequired = required.filter((name) => !has(name));
    const missingOptional = optionalSystems.filter((name) => !has(name));

    state.missingDependencies = [...missingRequired, ...missingOptional];

    return {
      ok: missingRequired.length === 0,

      missingRequired,
      missingOptional,

      available: {
        THREE: has("THREE"),

        core: {
          utils: has("SMFXUtils"),
          system: has("SMFXSystem"),
          pool: has("SMParticlePool"),
          emitter: has("SMParticleEmitter"),
          manager: has("SMFXManager"),
        },

        snow: {
          presets: has("SMSnowPresets"),
          material: has("SMSnowMaterial"),
          emitter: has("SMSnowEmitter"),
          system: has("SMSnowSystem"),
        },

        explosions: {
          presets: has("SMExplosionPresets"),
          sparks: has("SMSparkEmitter"),
          debris: has("SMDebrisEmitter"),
          shockwave: has("SMShockwaveEffect"),
          fire: has("SMFireEmitter"),
          smoke: has("SMSmokeEmitter"),
          emitter: has("SMExplosionEmitter"),
          system: has("SMExplosionSystem"),
        },

        particles: {
          presets: has("SMParticlePresets"),
          material: has("SMParticleMaterial"),
          emitter: has("SMCustomEmitter"),
          system: has("SMParticleSystem"),
        },
      },
    };
  }

  /* ============================================================
       ENGINE RESOURCE RESOLUTION
    ============================================================ */

  function resolveScene(explicitScene) {
    if (explicitScene) return explicitScene;

    return (
      global.scene || global.editor?.scene || global.SMEditor?.scene || null
    );
  }

  function resolveCamera(explicitCamera) {
    if (explicitCamera) return explicitCamera;

    try {
      const activePanel = global.SMViewportSystem?.getActivePanel?.();

      if (activePanel?.camera) {
        return activePanel.camera;
      }
    } catch (_) {}

    return (
      global.camera || global.editor?.camera || global.SMEditor?.camera || null
    );
  }

  function resolveRenderer(explicitRenderer) {
    if (explicitRenderer) return explicitRenderer;

    return (
      global.renderer ||
      global.editor?.renderer ||
      global.SMEditor?.renderer ||
      null
    );
  }

  /* ============================================================
       GLOBAL EXPOSURE
    ============================================================ */

  function exposeManager(manager) {
    if (!state.options.exposeGlobals) return;

    /*
     * Canonical globals.
     *
     * Keep both because older SM Engine systems often access
     * window.<systemName> directly while newer systems can use
     * window.SMFX.
     */
    global.fxManager = manager;
    global.smFXManager = manager;
    global.SMFXManagerInstance = manager;
  }

  function exposeSystems(manager) {
    if (!manager || !state.options.exposeGlobals) return;

    global.snowSystem = manager.get?.("snow") || manager.snow || null;

    global.explosionSystem =
      manager.get?.("explosions") || manager.explosions || null;

    global.particleSystem =
      manager.get?.("particles") || manager.particles || null;
  }

  /* ============================================================
       SYSTEM REGISTRATION
    ============================================================ */

  function registerSnow(manager, options = {}) {
    if (!manager) return null;

    let system = manager.get?.("snow");

    if (system) {
      manager.snow = system;
      return system;
    }

    if (!state.options.autoCreateSnow) {
      return null;
    }

    if (!has("SMSnowSystem")) {
      warn(
        "Snow system was not registered because " +
          "window.SMSnowSystem is unavailable.",
      );
      return null;
    }

    system = new global.SMSnowSystem({
      scene: state.scene,
      camera: state.camera,
      renderer: state.renderer,

      enabled: options.snowEnabled ?? state.options.snowEnabledOnStart,
    });

    manager.register("snow", system);
    manager.snow = system;

    /*
     * FXManager from the previous package may auto-register Snow
     * in its constructor. Ensure startup visibility still follows
     * bootstrap configuration.
     */
    system.setEnabled?.(
      options.snowEnabled ?? state.options.snowEnabledOnStart,
    );

    return system;
  }

  function registerExplosions(manager) {
    if (!manager) return null;

    let system = manager.get?.("explosions");

    if (system) {
      manager.explosions = system;
      return system;
    }

    if (!state.options.autoCreateExplosions) {
      return null;
    }

    if (!has("SMExplosionSystem")) {
      warn(
        "Explosion system was not registered because " +
          "window.SMExplosionSystem is unavailable.",
      );
      return null;
    }

    system = new global.SMExplosionSystem({
      scene: state.scene,
      camera: state.camera,
      renderer: state.renderer,
    });

    manager.register("explosions", system);
    manager.explosions = system;

    return system;
  }

  function registerParticles(manager) {
    if (!manager) return null;

    let system = manager.get?.("particles");

    if (system) {
      manager.particles = system;
      return system;
    }

    if (!state.options.autoCreateParticles) {
      return null;
    }

    if (!has("SMParticleSystem")) {
      warn(
        "Custom particle system was not registered because " +
          "window.SMParticleSystem is unavailable.",
      );
      return null;
    }

    system = new global.SMParticleSystem({
      scene: state.scene,
      camera: state.camera,
      renderer: state.renderer,
    });

    manager.register("particles", system);
    manager.particles = system;

    return system;
  }

  /* ============================================================
       INITIALIZATION
    ============================================================ */

  function initialize(options = {}) {
    if (state.initializing) {
      warn("Initialization is already in progress.");
      return state.manager;
    }

    /*
     * If already initialized, refresh references and return the
     * same manager instead of creating duplicate systems.
     */
    if (state.initialized && state.manager && !state.disposed) {
      refreshContext(options);

      if (options.forceReRegister === true) {
        registerAvailableSystems(options);
      }

      exposeManager(state.manager);
      exposeSystems(state.manager);

      return state.manager;
    }

    state.initializing = true;
    state.disposed = false;

    try {
      state.options = {
        ...state.options,
        ...options,
      };

      const dependencyReport = checkDependencies();

      if (!dependencyReport.ok) {
        const message =
          "FX bootstrap cannot initialize. Missing required " +
          "dependencies: " +
          dependencyReport.missingRequired.join(", ");

        error(message);

        state.initializing = false;
        return null;
      }

      state.scene = resolveScene(options.scene);
      state.camera = resolveCamera(options.camera);
      state.renderer = resolveRenderer(options.renderer);

      if (!state.scene) {
        warn(
          "No scene was resolved. Pass { scene } explicitly " +
            "to initSMFX() or initialize after the engine scene exists.",
        );

        state.initializing = false;
        return null;
      }

      const manager = new global.SMFXManager({
        scene: state.scene,
        camera: state.camera,
        renderer: state.renderer,
      });

      state.manager = manager;

      exposeManager(manager);

      registerAvailableSystems(options);

      exposeSystems(manager);

      state.initialized = true;
      state.initializing = false;

      state.lastTimestamp = 0;
      state.elapsed = 0;
      state.updateCount = 0;

      log(`Initialized v${BOOTSTRAP_VERSION}`, {
        scene: !!state.scene,
        camera: !!state.camera,
        renderer: !!state.renderer,
        systems: [...state.registeredSystems],
      });

      return manager;
    } catch (err) {
      state.initializing = false;
      state.initialized = false;

      error("Initialization failed:", err);

      return null;
    }
  }

  /* ============================================================
       REGISTER AVAILABLE SYSTEMS
    ============================================================ */

  function registerAvailableSystems(options = {}) {
    const manager = state.manager;

    if (!manager) return [];

    const registered = [];

    try {
      if (registerSnow(manager, options)) {
        registered.push("snow");
      }
    } catch (err) {
      error("Failed to register Snow system:", err);
    }

    try {
      if (registerExplosions(manager)) {
        registered.push("explosions");
      }
    } catch (err) {
      error("Failed to register Explosion system:", err);
    }

    try {
      if (registerParticles(manager)) {
        registered.push("particles");
      }
    } catch (err) {
      error("Failed to register Particle system:", err);
    }

    state.registeredSystems = [...new Set(registered)];

    exposeSystems(manager);

    return state.registeredSystems;
  }

  /* ============================================================
       CONTEXT REFRESH
    ============================================================ */

  function refreshContext(options = {}) {
    const nextScene = resolveScene(options.scene) || state.scene;

    const nextCamera = resolveCamera(options.camera) || state.camera;

    const nextRenderer = resolveRenderer(options.renderer) || state.renderer;

    state.scene = nextScene;
    state.camera = nextCamera;
    state.renderer = nextRenderer;

    const manager = state.manager;

    if (!manager) return;

    manager.scene = state.scene;
    manager.camera = state.camera;
    manager.renderer = state.renderer;

    for (const system of manager.systems?.values?.() || []) {
      if (state.scene) system.scene = state.scene;
      if (state.camera) system.camera = state.camera;
      if (state.renderer) system.renderer = state.renderer;
    }
  }

  /* ============================================================
       UPDATE
    ============================================================ */

  function update(deltaTime) {
    if (!state.initialized || !state.manager) {
      return;
    }

    /*
     * Optional automatic dt calculation.
     *
     * Passing the engine's own delta time is still recommended:
     *
     *     SMFX.update(clock.getDelta());
     */
    let dt = Number(deltaTime);

    if (!Number.isFinite(dt)) {
      const now = performance.now() * 0.001;

      if (!state.lastTimestamp) {
        state.lastTimestamp = now;
        return;
      }

      dt = now - state.lastTimestamp;
      state.lastTimestamp = now;
    }

    /*
     * Avoid huge jumps after debugger pauses, tab suspension,
     * loading screens, etc.
     */
    dt = Math.min(Math.max(dt, 0), 0.1);

    if (dt <= 0) return;

    state.elapsed += dt;
    state.updateCount++;

    /*
     * Camera can change when the user switches viewport panels.
     * Refresh only the active camera reference cheaply.
     */
    const activeCamera = resolveCamera();

    if (activeCamera && activeCamera !== state.camera) {
      state.camera = activeCamera;
      state.manager.camera = activeCamera;

      for (const system of state.manager.systems?.values?.() || []) {
        system.camera = activeCamera;
      }
    }

    state.manager.update(dt);
  }

  /* ============================================================
       HIGH-LEVEL FX API
    ============================================================ */

  function getSnow() {
    return state.manager?.get?.("snow") || state.manager?.snow || null;
  }

  function getExplosions() {
    return (
      state.manager?.get?.("explosions") || state.manager?.explosions || null
    );
  }

  function getParticles() {
    return (
      state.manager?.get?.("particles") || state.manager?.particles || null
    );
  }

  /*
   * Spawn-location helper.
   *
   * Priority:
   * 1. Explicit THREE.Vector3
   * 2. Explicit [x, y, z]
   * 3. Explicit {x,y,z}
   * 4. Selected object world position
   * 5. World origin
   */
  function resolveSpawnPosition(value) {
    if (!global.THREE) {
      return null;
    }

    if (value?.isVector3) {
      return value.clone();
    }

    if (Array.isArray(value)) {
      return new THREE.Vector3(
        Number(value[0]) || 0,
        Number(value[1]) || 0,
        Number(value[2]) || 0,
      );
    }

    if (
      value &&
      typeof value === "object" &&
      ("x" in value || "y" in value || "z" in value)
    ) {
      return new THREE.Vector3(
        Number(value.x) || 0,
        Number(value.y) || 0,
        Number(value.z) || 0,
      );
    }

    const selected =
      global.selectedObject ||
      global.editor?.selected ||
      global.SMEditor?.selectedObject ||
      null;

    if (selected?.getWorldPosition) {
      return selected.getWorldPosition(new THREE.Vector3());
    }

    return new THREE.Vector3(0, 0, 0);
  }

  /* ============================================================
       SNOW SHORTCUTS
    ============================================================ */

  function setSnowEnabled(enabled) {
    const snow = getSnow();

    if (!snow) {
      warn("Snow system is unavailable.");
      return false;
    }

    snow.setEnabled?.(!!enabled);

    return snow.enabled;
  }

  function toggleSnow() {
    const snow = getSnow();

    if (!snow) {
      warn("Snow system is unavailable.");
      return false;
    }

    snow.toggle?.();

    return snow.enabled;
  }

  function setSnowPreset(name) {
    const snow = getSnow();

    if (!snow) {
      warn("Snow system is unavailable.");
      return null;
    }

    snow.applyPreset?.(name);

    return snow.getParameters?.() || null;
  }

  /* ============================================================
       EXPLOSION SHORTCUTS
    ============================================================ */

  function explode(position, options = {}) {
    const explosions = getExplosions();

    if (!explosions) {
      warn("Explosion system is unavailable.");
      return null;
    }

    const spawnPosition = resolveSpawnPosition(position);

    return explosions.explode(spawnPosition, options);
  }

  function setExplosionPreset(name) {
    const explosions = getExplosions();

    if (!explosions) {
      warn("Explosion system is unavailable.");
      return null;
    }

    explosions.applyPreset?.(name);

    return explosions.getParameters?.() || null;
  }

  function clearExplosions() {
    getExplosions()?.clear?.();
  }

  /* ============================================================
       PARTICLE SHORTCUTS
    ============================================================ */

  function createParticleEmitter(options = {}) {
    const particles = getParticles();

    if (!particles) {
      warn("Particle system is unavailable.");
      return null;
    }

    return particles.createEmitter({
      ...options,

      position: resolveSpawnPosition(options.position),
    });
  }

  function removeParticleEmitter(emitter) {
    return getParticles()?.removeEmitter?.(emitter) || false;
  }

  function clearParticleEmitters() {
    getParticles()?.clear?.();
  }

  /* ============================================================
       DISPOSE / RESET
    ============================================================ */

  function dispose() {
    if (state.manager) {
      try {
        state.manager.dispose?.();
      } catch (err) {
        error("Error while disposing FX manager:", err);
      }
    }

    state.manager = null;

    state.initialized = false;
    state.initializing = false;
    state.disposed = true;

    state.scene = null;
    state.camera = null;
    state.renderer = null;

    state.elapsed = 0;
    state.lastTimestamp = 0;
    state.updateCount = 0;

    state.registeredSystems = [];

    if (global.fxManager) {
      global.fxManager = null;
    }

    if (global.smFXManager) {
      global.smFXManager = null;
    }

    global.SMFXManagerInstance = null;

    global.snowSystem = null;
    global.explosionSystem = null;
    global.particleSystem = null;

    log("Disposed.");
  }

  function reset(options = {}) {
    dispose();

    state.disposed = false;

    return initialize(options);
  }

  /* ============================================================
       DIAGNOSTICS
    ============================================================ */

  function diagnostics() {
    const dependencies = checkDependencies();

    const report = {
      bootstrapVersion: BOOTSTRAP_VERSION,

      initialized: state.initialized,
      initializing: state.initializing,
      disposed: state.disposed,

      scene: !!state.scene,
      camera: !!state.camera,
      renderer: !!state.renderer,

      manager: !!state.manager,

      registeredSystems: [...state.registeredSystems],

      snow: {
        available: !!getSnow(),
        enabled: getSnow()?.enabled ?? false,

        parameters: getSnow()?.getParameters?.() || null,
      },

      explosions: {
        available: !!getExplosions(),

        active: getExplosions()?.activeExplosions?.length ?? 0,

        parameters: getExplosions()?.getParameters?.() || null,
      },

      particles: {
        available: !!getParticles(),

        emitters: getParticles()?.emitters?.size ?? 0,
      },

      timing: {
        elapsed: state.elapsed,
        updateCount: state.updateCount,
      },

      dependencies,
    };

    console.log("[SMFX][Diagnostics]", report);

    return report;
  }

  /* ============================================================
       PANEL BINDING HELPERS
    ============================================================ */

  function bindSliderPair(sliderId, numberId, callback) {
    const slider = document.getElementById(sliderId);

    const number = document.getElementById(numberId);

    if (!slider && !number) {
      return;
    }

    const apply = (value, source) => {
      if (slider && source !== slider) {
        slider.value = value;
      }

      if (number && source !== number) {
        number.value = value;
      }

      callback?.(Number(value));

      try {
        if (slider && typeof global.updateSliderFill === "function") {
          global.updateSliderFill(slider);
        }
      } catch (_) {}
    };

    slider?.addEventListener("input", (event) => {
      apply(event.target.value, slider);
    });

    number?.addEventListener("input", (event) => {
      apply(event.target.value, number);
    });
  }

  /*
   * Optional convenience binding for the current FX panel.
   *
   * It supports both the original generic IDs and the safer
   * prefixed IDs suggested for the panel.
   *
   * Calling this function is optional.
   */
  function bindDefaultPanel() {
    if (!state.initialized) {
      warn("bindDefaultPanel() called before initialization.");
    }

    const snow = getSnow();
    const explosions = getExplosions();

    /* ---------------- Snow ---------------- */

    const toggleSnowButton = document.getElementById("toggleSnow");

    toggleSnowButton?.addEventListener("click", () => toggleSnow());

    document
      .getElementById("storm")
      ?.addEventListener("click", () => setSnowPreset("storm"));

    document
      .getElementById("blizzard")
      ?.addEventListener("click", () => setSnowPreset("blizzard"));

    document
      .getElementById("gentle")
      ?.addEventListener("click", () => setSnowPreset("gentle"));

    const snowMode =
      document.getElementById("snowMode") ||
      document.getElementById("snow-mode");

    snowMode?.addEventListener("change", (event) => {
      snow?.setMode?.(event.target.value);
    });

    bindSliderPair(
      document.getElementById("snow-density") ? "snow-density" : "density",

      document.getElementById("snow-density-value")
        ? "snow-density-value"
        : "densityValue",

      (value) => snow?.setDensity?.(value),
    );

    bindSliderPair(
      document.getElementById("snow-size") ? "snow-size" : "size",

      document.getElementById("snow-size-value")
        ? "snow-size-value"
        : "sizeValue",

      (value) => snow?.setSize?.(value),
    );

    bindSliderPair(
      document.getElementById("snow-speed") ? "snow-speed" : "speed",

      document.getElementById("snow-speed-value")
        ? "snow-speed-value"
        : "speedValue",

      (value) => snow?.setSpeed?.(value),
    );

    bindSliderPair(
      document.getElementById("snow-wind") ? "snow-wind" : "wind",

      document.getElementById("snow-wind-value")
        ? "snow-wind-value"
        : "windValue",

      (value) => snow?.setWind?.(value),
    );

    bindSliderPair(
      document.getElementById("snow-turbulence")
        ? "snow-turbulence"
        : "turbulence",

      document.getElementById("snow-turbulence-value")
        ? "snow-turbulence-value"
        : "turbulenceValue",

      (value) => snow?.setTurbulence?.(value),
    );

    /* ---------------- Explosions ---------------- */

    document
      .getElementById("explosion-btn")
      ?.addEventListener("click", () => explode());

    document
      .getElementById("clear-explosion-btn")
      ?.addEventListener("click", clearExplosions);

    document
      .getElementById("preset-fireball")
      ?.addEventListener("click", () => setExplosionPreset("fireball"));

    document
      .getElementById("preset-nuclear")
      ?.addEventListener("click", () => setExplosionPreset("nuclear"));

    document
      .getElementById("preset-dust")
      ?.addEventListener("click", () => setExplosionPreset("dust"));

    document
      .getElementById("preset-default")
      ?.addEventListener("click", () => setExplosionPreset("default"));

    bindSliderPair(
      "particle-count",
      "particle-count-value",

      (value) => {
        explosions?.setParameters?.({
          maxParticles: value,
        });
      },
    );

    bindSliderPair(
      "explosion-force",
      "explosion-force-value",

      (value) => {
        explosions?.setParameters?.({
          force: value,
        });
      },
    );

    bindSliderPair(
      "explosion-duration",
      "explosion-duration-value",

      (value) => {
        explosions?.setParameters?.({
          duration: value,
        });
      },
    );

    bindSliderPair(
      "fire-intensity",
      "fire-intensity-value",

      (value) => {
        explosions?.setParameters?.({
          fireIntensity: value,
        });
      },
    );

    bindSliderPair(
      "fire-size",
      "fire-size-value",

      (value) => {
        explosions?.setParameters?.({
          fireSize: value,
        });
      },
    );

    bindSliderPair(
      "smoke-density",
      "smoke-density-value",

      (value) => {
        explosions?.setParameters?.({
          smokeDensity: value,
        });
      },
    );

    bindSliderPair(
      "smoke-speed",
      "smoke-speed-value",

      (value) => {
        explosions?.setParameters?.({
          smokeSpeed: value,
        });
      },
    );

    /* ---------------- Custom particles ---------------- */

    let panelEmitter = null;

    const toggleParticlesButton = document.getElementById("toggleParticles");

    toggleParticlesButton?.addEventListener("click", () => {
      if (!panelEmitter) {
        panelEmitter = createParticleEmitter({
          position: resolveSpawnPosition(),
        });

        toggleParticlesButton.classList.add("active");
      } else {
        removeParticleEmitter(panelEmitter);

        panelEmitter = null;

        toggleParticlesButton.classList.remove("active");
      }
    });

    const countSlider =
      document.getElementById("particle-emitter-count") ||
      document.getElementById("waterParticleCount");

    const countValue =
      document.getElementById("particle-emitter-count-value") ||
      document.getElementById("particleCountValue");

    if (countSlider) {
      countSlider.addEventListener("input", (event) => {
        const value = Number(event.target.value);

        if (countValue) {
          countValue.value = value;
        }

        panelEmitter?.setCount?.(value);
      });
    }

    countValue?.addEventListener("input", (event) => {
      const value = Number(event.target.value);

      if (countSlider) {
        countSlider.value = value;
      }

      panelEmitter?.setCount?.(value);
    });

    const particleSize =
      document.getElementById("particle-emitter-size") ||
      document.getElementById("particleSize");

    particleSize?.addEventListener("input", (event) => {
      panelEmitter?.setSize?.(Number(event.target.value));
    });

    const particleOpacity =
      document.getElementById("particle-emitter-opacity") ||
      document.getElementById("particleOpacity");

    particleOpacity?.addEventListener("input", (event) => {
      panelEmitter?.setOpacity?.(Number(event.target.value));
    });

    const particleSpeed =
      document.getElementById("particle-emitter-speed") ||
      document.getElementById("particleSpeed");

    particleSpeed?.addEventListener("input", (event) => {
      panelEmitter?.setSpeed?.(Number(event.target.value));
    });

    const particleColor =
      document.getElementById("particle-emitter-color") ||
      document.getElementById("particleColor");

    particleColor?.addEventListener("input", (event) => {
      panelEmitter?.setColor?.(event.target.value);
    });

    const particleBlending =
      document.getElementById("particle-emitter-blending") ||
      document.getElementById("particleBlending");

    particleBlending?.addEventListener("change", (event) => {
      panelEmitter?.setBlending?.(event.target.value);
    });

    log("Default FX panel bindings installed.");

    return {
      get panelEmitter() {
        return panelEmitter;
      },
    };
  }

  /* ============================================================
       PUBLIC API
    ============================================================ */

  const API = {
    version: BOOTSTRAP_VERSION,

    initialize,
    init: initialize,

    update,

    refreshContext,

    registerAvailableSystems,

    bindDefaultPanel,

    dispose,
    reset,

    diagnostics,

    get manager() {
      return state.manager;
    },

    get state() {
      return state;
    },

    get snow() {
      return getSnow();
    },

    get explosions() {
      return getExplosions();
    },

    get particles() {
      return getParticles();
    },

    setSnowEnabled,
    toggleSnow,
    setSnowPreset,

    explode,
    setExplosionPreset,
    clearExplosions,

    createParticleEmitter,
    removeParticleEmitter,
    clearParticleEmitters,

    resolveSpawnPosition,
  };

  /* ============================================================
       GLOBAL EXPORTS
    ============================================================ */

  global.SMFX = API;

  /*
   * Compatibility-style initialization functions.
   *
   * These match the style used by other SM Engine systems such as
   * initWaterSystem().
   */
  global.initSMFX = initialize;
  global.initSMFXSystem = initialize;
  global.initFXSystem = initialize;

  global.updateSMFX = update;

  global.disposeSMFX = dispose;

  global.getSMFXDiagnostics = diagnostics;

  /* ============================================================
       OPTIONAL DOM READY EVENT
    ============================================================ */

  /*
   * We intentionally do NOT initialize automatically here because
   * the scene/renderer may be created after this script loads.
   *
   * The engine should call:
   *
   *     initSMFX({
   *         scene,
   *         camera,
   *         renderer
   *     });
   *
   * after its renderer/scene exist.
   */

  global.dispatchEvent?.(
    new CustomEvent("smfx:bootstrap-ready", {
      detail: {
        version: BOOTSTRAP_VERSION,
        api: API,
      },
    }),
  );

  log(
    `Bootstrap loaded v${BOOTSTRAP_VERSION}. ` +
      "Call initSMFX() after scene/renderer initialization.",
  );
})(window);
