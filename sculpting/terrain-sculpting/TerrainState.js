// sculpting/terrain-sculpting/TerrainState.js

(() => {
  const NS = (window.TerrainSculpting = window.TerrainSculpting || {});

  const TOOLS = Object.freeze({
    RAISE_LOWER: "raiseLower",
    SMOOTH: "smooth",
    FLATTEN: "flatten",
    PINCH: "pinch",
    CLAY: "clay",
    SCRAPE: "scrape",
    NOISE: "noise",
    PERLIN: "perlin",
    EROSION: "erosion",
    THERMAL_EROSION: "thermalErosion",
    TERRACE: "terrace",
    MATERIAL_PAINT: "materialPaint",

    // Advanced landscape brushes. Keep every tool in this authoritative
    // registry before freezing it; TerrainBrushes must never have to mutate a
    // frozen registry while it is loading.
    GRAB: "grab",
    INFLATE: "inflate",
    DEFLATE: "deflate",
    CREASE: "crease",
    FILL: "fill",
    RELAX: "relax",
    LEVEL: "level",
    RIDGE: "ridge",
    VALLEY: "valley",
    CLIFF: "cliff",
    PLATEAU: "plateau",
    CRATER: "crater",
    CANYON: "canyon",
    DUNE: "dune",
    HYDRAULIC: "hydraulic",
    HYDRAULIC_EROSION: "hydraulic",
    DEPOSITION: "deposition",
    SHARPEN: "sharpen",
    BLUR: "blur",
  });

  const MODES = Object.freeze({
    MANAGE: "manage",

    SCULPT: "sculpt",

    PAINT: "paint",

    NODES: "nodes",
  });

  const state = {
    scene: null,

    camera: null,

    renderer: null,

    historyHandler: null,

    mode: MODES.MANAGE,

    activeLandscape: null,

    creation: {
      sectionSize: 63,
      sectionsPerComponent: 1,
      // Keep the startup landscape at the proven 4 x 4 component budget so
      // opening Terrain never stalls the viewport. Bigger quads still make it
      // around 20% wider than the old default.
      componentsX: 4,
      componentsZ: 4,
      quadSize: 3.6,
      heightScale: 1,
      locationX: 0,
      locationY: 0,
      locationZ: 0,
      // This state belongs to the *New Terrain* generator. A new landscape
      // always starts as a clean plane; the workspace's initial sample terrain
      // has its own explicit edge-hill profile in WorkspaceManager.
      initialMode: "flat",
      flatCenterRatio: 0.42,
      // Used only when the artist explicitly selects Edge Hills.
      edgeMountainAmplitude: 14,
      edgeMountainFalloff: 1.8,
      noiseAmplitude: 3,
      noiseFrequency: 0.012,
      noiseOctaves: 4,
      noisePersistence: 0.5,
      noiseSeed: 1337,
      theme: "realistic",
    },

    selectedTool: null,

    lastSculptTool: "raiseLower",
    isBrushActive: false,

    isMaterialBrushActive: false,

    isPointerDown: false,

    isShiftPressed: false,

    lastHitPoint: null,

    brushSize: 5,

    brushStrength: 0.25,

    brushFalloff: 0.5,

    // Kept in world metres, so the brush behaves consistently regardless of
    // landscape component resolution.
    brushSpacing: 0.12,

    terraceStep: 1,

    flattenTargetHeight: null,

    strokeLastPoint: null,

    symmetryEnabled: false,

    symmetryAxis: "x",

    brushPreview: null,

    brushPreviewMesh: null,

    uploadedMaterial: null,

    eventsBound: false,

    eventCanvas: null,
  };

  NS.TOOLS = TOOLS;

  NS.MODES = MODES;

  NS.state = state;

  NS.setContext = function (scene, camera, renderer, historyHandler) {
    if (scene) {
      state.scene = scene;
    }

    if (camera) {
      state.camera = camera;
    }

    if (renderer) {
      state.renderer = renderer;
    }

    if (historyHandler !== undefined) {
      state.historyHandler = historyHandler;
    }

    return state;
  };

  NS.getScene = () => window.scene || state.scene || null;

  NS.getCamera = () =>
    window.SMViewportSystem?.getActivePanel?.()?.camera ||
    window.cameraSystem?.activeCamera ||
    window.camera ||
    state.camera ||
    null;

  NS.getRenderer = () => window.renderer || state.renderer || null;

  NS.resolveLandscape = function (candidate) {
    let object = candidate || null;

    while (object) {
      if (
        object.userData?.isTerrain &&
        object.userData?.terrainData?.heights
      ) {
        return object;
      }

      const manager =
        object.userData?.componentManager ||
        object.userData?.terrainComponentManager ||
        object.userData?.terrainComponent?.manager ||
        null;

      if (
        manager?.landscape?.userData?.terrainData?.heights
      ) {
        return manager.landscape;
      }

      object = object.parent || null;
    }

    return null;
  };

  NS.getLandscape = function () {
    return (
      NS.resolveLandscape(state.activeLandscape) ||
      NS.resolveLandscape(window.terrain) ||
      null
    );
  };

  NS.setLandscape = function (landscape) {
    const resolved = landscape ? NS.resolveLandscape(landscape) : null;

    state.activeLandscape = resolved;
    window.terrain = resolved;

    return state.activeLandscape;
  };

  NS.setUploadedMaterial = function (source) {
    state.uploadedMaterial = source || null;

    return state.uploadedMaterial;
  };

  window.TerrainTools = TOOLS;

  window.TerrainModes = MODES;

  const aliases = [
    "isBrushActive",

    "isMaterialBrushActive",

    "symmetryEnabled",

    "symmetryAxis",

    "isShiftPressed",

    "brushSize",

    "brushStrength",

    "brushFalloff",

    "selectedTool",

    "isPointerDown",

    "lastHitPoint",

    "brushPreview",

    "brushPreviewMesh",
  ];

  aliases.forEach((key) => {
    try {
      const descriptor = Object.getOwnPropertyDescriptor(window, key);

      if (!descriptor || descriptor.configurable) {
        Object.defineProperty(window, key, {
          configurable: true,

          enumerable: false,

          get() {
            return state[key];
          },

          set(value) {
            state[key] = value;
          },
        });
      }
    } catch (_) {}
  });
})();
