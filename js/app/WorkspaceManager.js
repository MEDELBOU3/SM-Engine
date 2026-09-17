/**
 * SM Engine Workspace Manager
 *
 * Workspaces:
 * - FILM            : Clean production/studio viewport with studio lighting & HDRI.
 * - GAME_DEV        : Full game-development viewport (2D, 2.5D, and 3D submodes).
 * - GAMEPLAY_SAMPLE : Isolated purple UE-style gameplay test course.
 * - TERRAIN         : Dedicated landscape/terrain creation and sculpting workspace.
 */
class SMWorkspaceManager {
  constructor() {
    this.currentMode = null;
    this.currentGameMode = this._normalizeGameMode(
      localStorage.getItem("sm_game_dev_mode") || "3D",
    );
    this.projects = this.loadProjects();
    this.activeProject = null;
    this._eventsBound = false;
    this._viewportApplyToken = 0;
    this._pendingViewportApplyTimer = null;
    this._viewportRepairTimers = [];
    this._terrainCreatePending = false;
    this._terrainCreateAttempts = 0;
    this._terrainModeActive = false;
    this._terrainCollisionWorkspaceActive = null;
    this._visibilityEnforceUntil = 0;
    this._lastVisibilityMode = null;

    // Performance & state guards
    this._lastRuntimePhysicsEnabled = null;
    this._lastVisibilityAuthorityScanAt = 0;
    this._visibilityAuthorityScanIntervalMs = 250;
    this._lastWorkspaceLightEnforceAt = 0;
    this._workspaceLightEnforceIntervalMs = 500;

    this._lastSkyStatusLog = 0;
    this._lock25DHandler = null;
    this._workspaceTransitionId = 0;
    this._terrainCreateEpoch = 0;
    this._terrainCreateRAF = 0;

    this.metaHumanFloor = null;

    this.modes = {
      FILM: {
        name: "Filming & Content",
        icon: "fa-video",
        tag: "FILM",
        tagColor: "#f87171",
        description:
          "Clean studio for modeling, sculpting, 2D, rendering & scripting.",
        settings: {
          sky: false,
          hdri: true,
          background: "#1c1c1c",
          fog: true,
          floor: false,
          obstacles: false,
          player: false,
          horse: false,
          grid: true,
          studioLights: true,
          lightingProfile: "FILM_STUDIO",
          defaultShading: "solid",
          exposure: 1.0,
        },
      },
      GAME_DEV: {
        name: "Game Development",
        icon: "fa-gamepad",
        tag: "GAME",
        tagColor: "#60a5fa",
        description:
          "Full game-development viewport with sky, player, physics and game environment.",
        settings: {
          sky: true,
          hdri: true,
          background: null,
          fog: true,
          floor: true,
          obstacles: true,
          player: true,
          horse: true,
          grid: false,
          studioLights: false,
          lightingProfile: "GAME_DEV_SKY",
          defaultShading: "rendered",
          exposure: 1.18,
        },
      },
      GAMEPLAY_SAMPLE: {
        name: "Gameplay Sample",
        icon: "fa-cubes",
        tag: "SAMPLE",
        tagColor: "#a78bfa",
        description:
          "UE-style purple playground for movement, jumping, physics and character testing.",
        settings: {
          sky: false,
          hdri: true,
          background: "#8177ad",
          fog: true,
          floor: true,
          obstacles: true,
          player: true,
          horse: false,
          grid: false,
          studioLights: false,
          gameplaySample: true,
          lightingProfile: "GAMEPLAY_SAMPLE",
          defaultShading: "rendered",
          exposure: 1.25,
        },
      },
      TERRAIN: {
        name: "Terrain Sculpting",
        icon: "fa-mountain",
        tag: "TERRAIN",
        tagColor: "#4ade80",
        description: "Landscape mode for terrain creation and sculpting.",
        settings: {
          sky: true,
          hdri: true,
          background: null,
          fog: true,
          floor: false,
          obstacles: false,
          player: false,
          horse: false,
          grid: false,
          studioLights: false,
          terrainMode: true,
          lightingProfile: "TERRAIN_LANDSCAPE",
          defaultShading: "lookdev",
          exposure: 1.1,
        },
      },
      METAHUMAN: {
        name: "MetaHuman Creator",
        icon: "fa-user",
        tag: "METAHUMAN",
        tagColor: "#f59e0b",
        description: "Create and customize digital humans.",
        settings: {
          sky: false,
          hdri: false,
          background: "#d2d9e3",
          fog: true,
          floor: true,
          obstacles: false,
          player: false,
          horse: false,
          grid: false,
          studioLights: true,
          lightingProfile: "FILM_STUDIO",
          defaultShading: "rendered",
          exposure: 1.0,
        },
      },
    };

    this.gameModes = {
      "2D": {
        label: "2D",
        description:
          "Orthographic XY viewport for sprites, tilemaps and flat gameplay.",
        camera: {
          type: "orthographic",
          position: [0, 0, 50],
          rotation: [0, 0, 0],
          lockAxes: ["z"],
        },
      },
      "2.5D": {
        label: "2.5D",
        description:
          "Locked perspective stage for side-scrollers with layered depth.",
        camera: {
          type: "perspective",
          position: [0, 2.5, 18],
          rotation: [0, 0, 0],
          lockAxes: ["z"],
          fov: 55,
        },
      },
      "3D": {
        label: "3D",
        description:
          "Free 3D gameplay viewport with full arena environment and orbit control.",
        camera: {
          type: "perspective",
          position: [8, 6, 12],
          rotation: [-0.45, 0.55, 0],
          lockAxes: [],
        },
      },
    };

    this._productionOnlyTools = [
      "sculptinCharacterMode",
      "drawingControls",
      "materialsEditor",
      "soundControls",
      "snow-controls",
      "tool-bone-system",
      "water-containre-html",
    ];
    this._gameOnlyTools = ["guiControls"];
    this._productionOnlyToolbarBtns = [
      "sculpting-toolbar-btn",
      "toggle-video-editor-btn",
      "mode2DGroup",
    ];
    this._terrainOnlyTools = [
      "sculpting-tools",
      "node-editor-panel-terrain",
      "terrain-toolbar-btn",
      "vegetationPainterBtn",
    ];
    this._gameOnlyToolbarBtns = ["export-game-btn"];
    this._modifiersUIElements = [
      "modifiersBtn",
      "modifiers-panel",
      "curve-modifier-panel",
    ];
    this._filmSolidOverrideMaterial = null;
    this._workspaceLightingGeneration = 0;

    this._initUI();
  }

  loadProjects() {
    try {
      const saved = localStorage.getItem("sm_projects");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  }

  saveProjects() {
    try {
      localStorage.setItem("sm_projects", JSON.stringify(this.projects));
    } catch {}
  }

  _normalizeGameMode(modeKey) {
    const raw = String(modeKey || "")
      .trim()
      .toUpperCase();
    if (raw === "2D") return "2D";
    if (raw === "2.5D" || raw === "2_5D" || raw === "2.5" || raw === "25D")
      return "2.5D";
    return "3D";
  }

  _getGameModeConfig(modeKey = this.currentGameMode) {
    return (
      this.gameModes[this._normalizeGameMode(modeKey)] || this.gameModes["3D"]
    );
  }

  _getGameModeLabel(modeKey = this.currentGameMode) {
    return this._getGameModeConfig(modeKey).label;
  }

  _syncProjectModeInputs() {
    if (!this.modal) return;
    const modeEl = this.modal.querySelector("#ws-new-mode");
    const gameModeEl = this.modal.querySelector("#ws-new-game-mode");
    if (!modeEl || !gameModeEl) return;
    const isGameProject = modeEl.value === "GAME_DEV";
    gameModeEl.disabled = !isGameProject;
    gameModeEl.classList.toggle("ws-select-disabled", !isGameProject);
  }

  _syncGameViewportUi() {
    if (this.currentMode === "GAME_DEV") {
      window.syncGameViewportHud?.(this.currentGameMode);
    } else {
      document.body.classList.remove(
        "ws-game-view-2d",
        "ws-game-view-25d",
        "ws-game-view-3d",
      );
      delete document.body.dataset.gameViewportMode;
    }
    this._syncMotionMatchingButtonVisibility();
    if (!this.modal) return;
    this.modal.querySelectorAll(".ws-game-submode-btn").forEach((button) => {
      const isActive =
        this._normalizeGameMode(button.dataset.gameMode) ===
        this.currentGameMode;
      button.classList.toggle("active", isActive);
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
    const footerSelect = this.modal.querySelector("#ws-new-game-mode");
    if (footerSelect) {
      footerSelect.value = this.currentGameMode;
    }
    this._syncProjectModeInputs();
  }

  _syncMotionMatchingButtonVisibility() {
    const isGame3D =
      this.currentMode === "GAME_DEV" &&
      this._normalizeGameMode(this.currentGameMode) === "3D";
    const isPlayerWorkspace =
      this.currentMode === "GAME_DEV" || this.currentMode === "GAMEPLAY_SAMPLE";
    const button = document.getElementById("motion-matching-toolbar-btn");
    const buttonGroup = button?.closest(".st-group.game-dev-only");
    const separator = buttonGroup?.nextElementSibling?.classList?.contains(
      "game-dev-only",
    )
      ? buttonGroup.nextElementSibling
      : null;
    if (buttonGroup) {
      buttonGroup.style.display = isGame3D ? "flex" : "none";
    }
    if (separator) {
      separator.style.display = isGame3D ? "block" : "none";
    }
    if (button) {
      button.style.display = isGame3D ? "" : "none";
      button.disabled = !isGame3D;
      if (!isGame3D) {
        button.classList.remove("active");
      }
    }
    const debugGroup = document.getElementById("player-debug-toolbar-group");
    const debugSeparator = document.getElementById(
      "player-debug-toolbar-separator",
    );
    const debugButton = document.getElementById("player-debug-toolbar-btn");
    if (debugGroup)
      debugGroup.style.display = isPlayerWorkspace ? "flex" : "none";
    if (debugSeparator)
      debugSeparator.style.display = isPlayerWorkspace ? "block" : "none";
    if (debugButton) debugButton.disabled = !isPlayerWorkspace;
    window.SMPlayerDebugOverlay?.update?.();
  }

  _applyGameViewportMode() {
    this._syncGameViewportUi();
    if (this.currentMode !== "GAME_DEV") {
      return;
    }
    this._activateGameViewportLayout(this.currentGameMode);
    window.setGameViewportMode?.(this.currentGameMode);
  }

  _activateGameViewportLayout(modeKey) {
    const mode = this._normalizeGameMode(modeKey);
    const scene = window.scene;
    const camera = window.cameraSystem?.activeCamera || window.camera;
    const controls = window.orbitControls || window.controls;

    document.body.dataset.gameViewportMode = mode
      .toLowerCase()
      .replace(".", "_");
    document.body.dataset.gameRuntime =
      mode === "2D"
        ? "sprite-2d"
        : mode === "2.5D"
          ? "side-scroller-25d"
          : "world-3d";
    document.body.classList.remove(
      "ws-game-view-2d",
      "ws-game-view-25d",
      "ws-game-view-3d",
    );

    if (mode === "2D") {
      document.body.classList.add("ws-game-view-2d");
      this._setup2DViewport(camera, controls, scene);
    } else if (mode === "2.5D") {
      document.body.classList.add("ws-game-view-25d");
      this._setup25DViewport(camera, controls, scene);
    } else {
      document.body.classList.add("ws-game-view-3d");
      this._setup3DViewport(camera, controls, scene);
    }
    this._updateGameModeGrid(mode, scene);
  }

  _createMetaHumanFloor(scene = window.scene) {
    if (!scene || typeof THREE === "undefined") return null;

    if (this.metaHumanFloor) {
      this.metaHumanFloor.visible = true;
      return this.metaHumanFloor;
    }

    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 1024;

    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const tile = 512;
    const gap = 10;
    const radius = 28;
    const lightTile = "#d6dbe2";
    const darkTile = "#bcc3cd";
    const seam = "#606060";

    ctx.fillStyle = seam;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const drawTile = (x, y, color) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      if (typeof ctx.roundRect === "function") {
        ctx.roundRect(x + gap, y + gap, tile - gap * 2, tile - gap * 2, radius);
      } else {
        ctx.rect(x + gap, y + gap, tile - gap * 2, tile - gap * 2);
      }
      ctx.fill();
    };

    drawTile(0, 0, lightTile);
    drawTile(tile, 0, darkTile);
    drawTile(0, tile, darkTile);
    drawTile(tile, tile, lightTile);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(300, 300);
    texture.anisotropy = Math.min(
      16,
      window.renderer?.capabilities?.getMaxAnisotropy?.() || 16,
    );
    if ("colorSpace" in texture && THREE.SRGBColorSpace) {
      texture.colorSpace = THREE.SRGBColorSpace;
    }
    texture.needsUpdate = true;

    const geometry = new THREE.PlaneGeometry(600, 600);
    const material = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.85,
      metalness: 0.02,
    });

    const floor = new THREE.Mesh(geometry, material);
    floor.name = "SM_MetaHumanFloor";
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0;
    floor.receiveShadow = true;
    floor.castShadow = false;
    floor.raycast = () => null;
    floor.userData = {
      isSystemObject: true,
      workspaceOnly: "METAHUMAN",
      smWorkspaceScope: "METAHUMAN",
      selectable: false,
      ignoreInHierarchy: true,
      ignoreInTimeline: true,
      excludeFromExport: true,
    };

    scene.add(floor);
    this.metaHumanFloor = floor;

    window.smWorkspaceVisibilityAuthority?.register?.(floor, "METAHUMAN");

    return floor;
  }

  _setMetaHumanFloorVisible(scene = window.scene, visible = false) {
    const floor =
      this.metaHumanFloor || scene?.getObjectByName?.("SM_MetaHumanFloor");
    if (!floor) return false;

    this.metaHumanFloor = floor;
    floor.visible = !!visible;
    return true;
  }

  _setupMetaHumanViewport(scene, settings = {}, repair = false) {
    if (!scene) return;

    try {
      window.switchToPerspectiveFromOrtho?.();
    } catch {}

    this._clearFilmSolidPresentation(scene);
    scene.overrideMaterial = null;
    window.setGameDevelopmentPhysicsEnabled?.(false);

    this._hideSky(scene);
    this._hideGameplaySampleEnvironment(scene);
    this._hideGameDevelopmentEnvironment(scene);
    this._setGameObjectsVisible(false, { keepPlayer: false });
    this._removeFilmGrid(scene);
    this._removeNamedGridHelper(scene, "gameModeGrid2D");
    this._setAuxiliaryViewportObjectsVisible(false);

    this._createMetaHumanFloor(scene);
    this._setMetaHumanFloorVisible(scene, true);

    const background = new THREE.Color(settings.background || "#d2d9e3");
    scene.background = background;
    scene.environment = null;
    scene.fog = settings.fog ? new THREE.Fog(0xd2d9e3, 40, 260) : null;

    this._removeRuntimeLights(scene, {
      preserveSky: true,
      preserveGameplaySample: true,
    });
    this._removeStudioLights(scene);
    this._addStudioLights(scene);

    if (window.renderer) {
      window.renderer.setClearColor(background, 1);
      window.renderer.toneMappingExposure = Number.isFinite(
        Number(settings.exposure),
      )
        ? Number(settings.exposure)
        : 1.0;
      window.renderer.shadowMap.enabled = true;
      window.renderer.shadowMap.needsUpdate = true;
    }

    const camera = window.cameraSystem?.activeCamera || window.camera;
    const controls = window.orbitControls || window.controls;

    if (camera) {
      camera.fov = 48;
      camera.near = 0.05;
      camera.far = Math.max(5000, camera.far || 5000);
      camera.position.set(3.8, 2.25, 6.8);
      camera.up.set(0, 1, 0);
      camera.lookAt(0, 1.0, 0);
      camera.updateProjectionMatrix?.();
    }

    if (controls && camera) {
      controls.object = camera;
      controls.enableRotate = true;
      controls.enableZoom = true;
      controls.enablePan = true;
      controls.minPolarAngle = 0.25;
      controls.maxPolarAngle = Math.PI / 2.05;
      controls.minDistance = 0.65;
      controls.maxDistance = 18;
      controls.target.set(0, 1.0, 0);
      controls.update?.();
    }

    this._applyWorkspaceDefaultShading("METAHUMAN", { repair });

    window.dispatchEvent(
      new CustomEvent("sm:metahuman-workspace-activated", {
        detail: {
          scene,
          camera,
          controls,
          repair,
        },
      }),
    );
  }

  // ------------------------------------------------------------------
  // Restore the full 3D/2.5D game-dev presentation (sky, HDRI env/fog,
  // lighting rig, physics, runtime player visibility) after leaving the
  // 2D submode. `_setup2DViewport` tears all of this down via
  // `_disable2DHDRIAndSky` / `_hide3DPlayer` so the sprite workspace gets
  // a clean flat background; a submode switch back to 2.5D/3D previously
  // only repositioned the camera/controls (`_setup25DViewport` /
  // `_setup3DViewport`) without ever calling the counterpart restore that
  // a full workspace-mode switch gets via `_setupGameViewport`. That gap
  // is what left the 3D/2.5D scene looking "broken" (no sky, no fog, no
  // environment reflections, runtime player still invisible) whenever you
  // came back from 2D within the same GAME_DEV session.
  // ------------------------------------------------------------------
  _restoreGameDev3DPresentation(scene = window.scene) {
    if (!scene) return;
    window.smSkyLayerVisible = true;
    this._showSky(scene, "ue5-editor");
    this._restoreActiveHDRI(scene, {
      asBackground: false,
      asEnvironment: true,
    });
    this._sanitizeSystemHemisphereLights(scene, { visible: true });
    window.dedupeHemisphereLights?.({ preserveCustomLights: false });
    this._addGameLights(scene);
    this._syncWorkspaceLighting("GAME_DEV", scene);
    window.setGameDevelopmentPhysicsEnabled?.(true);
    this._syncRuntimePhysics(true);
    window.setPlayerModelEnabled?.(true, { loadIfNeeded: true });
    window.playerSystem?.character?.setVisible?.(true);
    if (window.playerSystem?.model) window.playerSystem.model.visible = true;
    if (window.playerSystem?.character?.model)
      window.playerSystem.character.model.visible = true;
    window.playerSystem?.setEnabled?.(true);
  }

  _setup2DViewport(camera, controls, scene) {
    if (!camera) return;

    // 2D is a separate sprite world, not a flattened 3D arena.
    this._setGameDevEnvironmentVisible(scene, false);
    this._disable2DHDRIAndSky(scene);
    this._remove25DParallaxLayerHelpers(scene);
    if (this._lock25DHandler && controls) {
      controls.removeEventListener?.("change", this._lock25DHandler);
      this._lock25DHandler = null;
    }

    if (window.cameraSystem?.switchToOrthographic) {
      camera = window.cameraSystem.switchToOrthographic({ size: 24 });
    } else if (typeof window.switchToOrthographicCamera === "function") {
      window.switchToOrthographicCamera({ size: 24 });
      camera =
        window.cameraSystem?.orthographicCamera ||
        window.cameraSystem?.activeCamera ||
        window.camera ||
        camera;
    } else {
      camera.userData._prevFov = camera.fov || 60;
      camera.position.set(0, 0, 50);
      camera.rotation.set(0, 0, 0);
      camera.up.set(0, 1, 0);
      if ("fov" in camera) {
        camera.fov = 1;
      }
      camera.updateProjectionMatrix?.();
    }

    camera.userData = {
      ...(camera.userData || {}),
      is2DCamera: true,
      workspaceCamera: "2D",
    };
    window.camera2D = camera;

    if (controls) {
      controls.object = camera;
      controls.enableRotate = false;
      controls.enableZoom = true;
      controls.enablePan = true;
      controls.mouseButtons = {
        LEFT: THREE.MOUSE.PAN,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.PAN,
      };
      controls.minPolarAngle = Math.PI / 2;
      controls.maxPolarAngle = Math.PI / 2;
      controls.minAzimuthAngle = 0;
      controls.maxAzimuthAngle = 0;
      controls.target.set(0, 0, 0);
      controls.update?.();
    }

    this._hide3DPlayer(scene);
    this._configure2DTransformControls();
    this._show2DAxisOverlay();
    this._setup2DGameWorkspace(scene, camera, controls);
  }

  _disable2DHDRIAndSky(scene = window.scene) {
    if (!scene) return;
    window.smSkyLayerVisible = false;
    window.smWorkspaceEnvironmentAdapter?.setLightRigVisible?.(false);
    window.smSkyLayerVisible = false;
    scene.environment = null;
    scene.background = new THREE.Color(0x575d67);
    scene.fog = null;

    const hide = (object) => {
      if (!object) return;
      object.visible = false;
      object.traverse?.((child) => {
        child.visible = false;
      });
    };
    hide(window.sky);
    hide(window.AdvancedSky);
    hide(window.smHDRSkySystem?.sky);
    scene.traverse?.((object) => {
      if (this._isSkyObject(object)) hide(object);
    });
    window.renderer?.setClearColor?.(scene.background, 1);
  }

  _setup25DViewport(camera, controls, scene) {
    if (!camera) return;
    try {
      window.switchToPerspectiveFromOrtho?.();
    } catch {}

    // Enable 3D ground & obstacles for 2.5D side scrolling
    this._setGameDevEnvironmentVisible(scene, true);
    this._restoreGameDev3DPresentation(scene);

    const CAM_Z = 18;
    const CAM_Y = 2.5;
    camera.fov = 55;
    camera.near = Math.max(0.05, camera.near || 0.1);
    camera.far = Math.max(1000, camera.far || 1000);
    camera.position.set(0, CAM_Y, CAM_Z);
    camera.rotation.set(0, 0, 0);
    camera.up.set(0, 1, 0);
    camera.lookAt(0, CAM_Y, 0);
    camera.updateProjectionMatrix?.();

    if (controls) {
      controls.enableRotate = false;
      controls.enableZoom = true;
      controls.enablePan = true;
      controls.mouseButtons = {
        LEFT: THREE.MOUSE.PAN,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.PAN,
      };
      controls.minPolarAngle = Math.PI / 2 - 0.05;
      controls.maxPolarAngle = Math.PI / 2 + 0.05;
      controls.minAzimuthAngle = -0.04;
      controls.maxAzimuthAngle = 0.04;
      controls.target.set(0, CAM_Y, 0);

      if (this._lock25DHandler) {
        controls.removeEventListener?.("change", this._lock25DHandler);
      }
      this._lock25DHandler = () => {
        if (
          this.currentMode === "GAME_DEV" &&
          this.currentGameMode === "2.5D" &&
          Math.abs(camera.position.z - CAM_Z) > 0.01
        ) {
          camera.position.z = CAM_Z;
        }
      };
      controls.addEventListener?.("change", this._lock25DHandler);
      controls.update?.();
    }

    this._setup25DParallaxLayers(scene);

    if (window.player) {
      window.player.inputEnabled = true;
      window.player.gravityEnabled = true;
      window.player.lockZPosition = true;
      window.player.zLockValue = 0;
    }

    this._remove2DAxisOverlay();
    this._remove2DGameWorkspace();
  }

  _setup3DViewport(camera, controls, scene) {
    if (!camera) return;

    // Ensure 3D Arena floor & obstacles are visible in full 3D Game Dev
    this._setGameDevEnvironmentVisible(scene, true);

    const preserveAxisView =
      this.currentMode === "GAME_DEV" &&
      window.__smPIEMode !== "play" &&
      window.cameraSystem?.axisViewLocked === true;

    if (preserveAxisView) {
      const axisCamera = window.cameraSystem?.activeCamera || camera;
      if (controls && axisCamera) {
        controls.object = axisCamera;
        controls.enabled = true;
        controls.enableRotate = false;
        controls.update?.();
      }
      axisCamera?.updateProjectionMatrix?.();
      axisCamera?.updateMatrixWorld?.(true);
      this._remove2DAxisOverlay();
      this._remove2DGameWorkspace();
      this._remove25DParallaxLayerHelpers(scene);
      return;
    }

    this._restoreGameDev3DPresentation(scene);

    try {
      window.switchToPerspectiveFromOrtho?.();
    } catch {}

    const editorCamera =
      window.cameraSystem?.activeCamera || window.camera || camera;

    editorCamera.fov = editorCamera.userData._prevFov || 60;
    editorCamera.near = 0.1;
    editorCamera.far = Math.max(2000, editorCamera.far || 2000);
    editorCamera.position.set(8, 6, 12);
    editorCamera.up.set(0, 1, 0);
    editorCamera.updateProjectionMatrix?.();

    if (controls) {
      if (this._lock25DHandler) {
        controls.removeEventListener?.("change", this._lock25DHandler);
        this._lock25DHandler = null;
      }
      controls.enableRotate = true;
      controls.enableZoom = true;
      controls.enablePan = true;
      controls.minPolarAngle = 0;
      controls.maxPolarAngle = Math.PI;
      controls.minAzimuthAngle = -Infinity;
      controls.maxAzimuthAngle = Infinity;
      controls.mouseButtons = {
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.PAN,
      };
      controls.target.set(0, 1, 0);
      controls.update?.();
    } else {
      editorCamera.lookAt(0, 1, 0);
    }

    if (window.player) {
      window.player.inputEnabled = true;
      window.player.gravityEnabled = true;
      window.player.lockZPosition = false;
    }

    this._remove2DAxisOverlay();
    this._remove2DGameWorkspace();
    this._remove25DParallaxLayerHelpers(scene);
  }

  _isTerrainObject(obj) {
    if (!obj) return false;
    const data = obj.userData || {};
    const name = String(obj.name || "");
    return (
      obj === window.terrain ||
      data.isTerrain === true ||
      data.isTerrainMesh === true ||
      data.isTerrainComponent === true ||
      data.workspaceOnly === "TERRAIN" ||
      name === "Terrain" ||
      name === "Terrain_Mesh" ||
      name.startsWith("Terrain_")
    );
  }

  _setTerrainCollisionActive(scene = window.scene, active = false) {
    const enabled = !!active;
    if (this._terrainCollisionWorkspaceActive === enabled) {
      return;
    }

    const terrain =
      window.terrain ||
      scene?.getObjectByName?.("Terrain_Mesh") ||
      scene?.getObjectByName?.("Terrain") ||
      null;

    if (!terrain) {
      this._terrainCollisionWorkspaceActive = undefined;
      return;
    }

    terrain.traverse?.((object) => {
      const data = object?.userData;
      if (!data?.isTerrainComponent) return;

      if (!enabled) {
        if (
          !Object.prototype.hasOwnProperty.call(
            data,
            "_terrainCollisionBeforeWorkspace",
          )
        ) {
          data._terrainCollisionBeforeWorkspace = data.collisionEnabled;
        }
        data.collisionEnabled = false;
        return;
      }

      if (
        Object.prototype.hasOwnProperty.call(
          data,
          "_terrainCollisionBeforeWorkspace",
        )
      ) {
        const previous = data._terrainCollisionBeforeWorkspace;
        if (previous === undefined) {
          delete data.collisionEnabled;
        } else {
          data.collisionEnabled = previous;
        }
        delete data._terrainCollisionBeforeWorkspace;
      } else {
        data.collisionEnabled = true;
      }
    });

    this._terrainCollisionWorkspaceActive = enabled;
    window.playerSystem?.playerPhysics?.refreshWorld?.(true);
  }

  _setTerrainVisible(scene = window.scene, visible = false) {
    if (!scene) return;
    const showTerrain = !!visible;
    this._setTerrainCollisionActive(scene, showTerrain);

    const authority = window.smWorkspaceVisibilityAuthority;
    if (authority) {
      if (this._consumeVisibilityAuthorityScanBudget()) {
        authority.scan?.(scene);
      }
      authority.setScopeVisible?.(
        window.smWorkspaceOwnership?.SCOPE?.TERRAIN || "TERRAIN",
        showTerrain,
        scene,
      );
      if (!showTerrain && this._isTerrainObject(window.selectedObject)) {
        window.selectedObject = null;
        window.selectedObjects = [];
        window.selectionManager?.clearSelection?.();
        window.transformControls?.detach?.();
        if (window.transformControls) window.transformControls.visible = false;
        if (window.outlinePass) window.outlinePass.selectedObjects = [];
        window.updateInspector?.();
      }
      return;
    }

    // Fallback traversal
    const terrainObjects = new Set();
    if (window.terrain) terrainObjects.add(window.terrain);
    ["Terrain", "Terrain_Mesh"].forEach((name) => {
      const object = scene.getObjectByName(name);
      if (object) terrainObjects.add(object);
    });
    scene.traverse((obj) => {
      if (this._isTerrainObject(obj)) terrainObjects.add(obj);
    });
    terrainObjects.forEach((obj) => {
      obj.visible = showTerrain;
      obj.traverse?.((child) => {
        child.visible = showTerrain;
      });
    });
  }

  _getGameplaySampleRoots(scene = window.scene) {
    if (!scene) return [];
    const environment = window.gameplaySampleEnvironment;
    const world = window.gameplaySampleWorld || environment?.world || null;
    return [
      scene.getObjectByName("SMGameplaySampleEnvironment"),
      scene.getObjectByName("SMGameplaySampleObstacles"),
      scene.getObjectByName("SMGameplaySampleFloor"),
      scene.getObjectByName("SMGameplaySampleLights"),
      scene.getObjectByName("SMGameplaySampleFallbackLights"),
      environment?.course?.root,
      environment?.lights,
      world?.root,
      world?.ground,
      world?.floor,
      world?.obstaclesGroup,
    ].filter(Boolean);
  }

  _setGameplaySampleSceneVisible(scene = window.scene, visible = false) {
    if (!scene) return;
    const projectRuntime = window.SMGameProjectRuntime;
    const projectOwnsWorld =
      projectRuntime?.replacesGameplaySampleWorld === true &&
      !!projectRuntime?.activeProject;
    const showSample = !!visible && !projectOwnsWorld;
    const showProject = !!visible && projectOwnsWorld;
    const roots = new Set(this._getGameplaySampleRoots(scene));
    roots.forEach((object) => {
      object.visible = showSample;
      object.traverse?.((child) => {
        child.visible = showSample;
        if (showSample) delete child._hiddenByTerrainMode;
      });
    });
    scene.traverse((obj) => {
      if (obj.userData?.smGameProjectObject === true) {
        obj.visible = showProject;
        if (showProject) delete obj._hiddenByTerrainMode;
        return;
      }
      if (
        obj.userData?.workspaceOnly === "GAMEPLAY_SAMPLE" ||
        obj.userData?.isGameplaySample === true
      ) {
        obj.visible = showSample;
        if (showSample) delete obj._hiddenByTerrainMode;
      }
    });
  }

  _setGameplaySampleVisible(scene = window.scene, visible = false) {
    if (!scene) return;
    const showSample = !!visible;
    const projectOwnsWorld =
      window.SMGameProjectRuntime?.replacesGameplaySampleWorld === true &&
      !!window.SMGameProjectRuntime?.activeProject;
    if (showSample && !projectOwnsWorld) {
      try {
        window.gameplaySampleEnvironment?.activate?.();
      } catch (error) {
        console.warn("[Workspace] Gameplay Sample activation warning:", error);
        window.gameplaySampleEnvironment?.course?.setVisible?.(true);
      }
    } else {
      try {
        window.gameplaySampleEnvironment?.deactivate?.();
      } catch (error) {
        console.warn(
          "[Workspace] Gameplay Sample deactivation warning:",
          error,
        );
      }
    }
    this._setGameplaySampleSceneVisible(scene, showSample);
  }

  _restoreActiveHDRI(scene = window.scene, options = {}) {
    const targetScene = window.scene || scene;
    if (!targetScene) return false;
    const asBackground = options.asBackground !== false;
    const asEnvironment = options.asEnvironment !== false;
    const active = window.smActiveHDRI;
    if (!active?.texture) {
      window.HDRIHierarchyBridge?.sync?.();
      return false;
    }
    const texture = active.texture;
    const backgroundTexture = active.backgroundTexture || texture;
    let environmentTexture = active.environmentTexture || active.texture;
    texture.mapping = THREE.EquirectangularReflectionMapping;
    texture.needsUpdate = true;
    backgroundTexture.mapping = THREE.EquirectangularReflectionMapping;
    backgroundTexture.needsUpdate = true;
    const configuredIntensity = Number(
      options.intensity ??
        active.intensity ??
        window.EngineSettings?.get?.("setting-hdri-intensity") ??
        0.65,
    );
    const safeIntensity = Number.isFinite(configuredIntensity)
      ? Math.max(0, configuredIntensity)
      : 0.65;
    active.intensity = safeIntensity;
    const environmentEnabled =
      asEnvironment && window.smHDRIEnvironmentEnabled !== false;
    const skySystem = window.smHDRSkySystem || window.skyLightingSystem || null;

    if (skySystem?.applyExternalEnvironmentTexture) {
      try {
        skySystem.applyExternalEnvironmentTexture(texture, {
          intensity: safeIntensity,
          asBackground,
          backgroundTexture,
          type: active.type || "hdr",
          source: active.source || null,
          assetId: active.assetId || null,
        });
      } catch (error) {
        console.warn("[Workspace] HDRI environment apply failed:", error);
      }
    }

    environmentTexture =
      skySystem?.environmentTexture ||
      window.smActiveHDRI?.environmentTexture ||
      environmentTexture;
    if (asBackground) {
      targetScene.background = backgroundTexture;
      if ("backgroundIntensity" in targetScene)
        targetScene.backgroundIntensity = 1.0;
    }
    if (environmentEnabled) {
      targetScene.environment = environmentTexture;
      if ("environmentIntensity" in targetScene)
        targetScene.environmentIntensity = safeIntensity;
    } else if (!asEnvironment) {
      targetScene.environment = null;
    }
    window.renderer?.setClearAlpha?.(1);
    window.HDRIHierarchyBridge?.sync?.();
    window.dispatchEvent(
      new CustomEvent("sm:hdri-environment-changed", {
        detail: {
          active,
          texture,
          scene: targetScene,
          environmentEnabled,
          asBackground,
          asEnvironment,
        },
      }),
    );
    return true;
  }

  _applyFilmFog(scene = window.scene) {
    if (!scene || typeof THREE === "undefined") return;
    const fogColor = 0x555a60;
    const fogDensity = 0.0022;
    if (scene.fog?.isFogExp2) {
      scene.fog.color.setHex(fogColor);
      scene.fog.density = fogDensity;
    } else {
      scene.fog = new THREE.FogExp2(fogColor, fogDensity);
    }
  }

  _getWorkspaceRenderProfile(modeKey = this.currentMode) {
    const mode = String(modeKey || "FILM").toUpperCase();
    const settings = this.modes?.[mode]?.settings || {};
    return {
      mode,
      shading:
        settings.defaultShading || (mode === "FILM" ? "solid" : "rendered"),
      exposure: Number.isFinite(Number(settings.exposure))
        ? Number(settings.exposure)
        : 1,
      useSkyRig: mode === "GAME_DEV" || mode === "TERRAIN",
      useStudioRig: mode === "FILM" || mode === "METAHUMAN",
      useGameRig: mode === "GAME_DEV",
      useSampleRig: mode === "GAMEPLAY_SAMPLE",
      useTerrainRig: mode === "TERRAIN",
      hdriBackground: mode === "FILM",
      hdriEnvironment: mode !== "METAHUMAN",
    };
  }

  _applyConfiguredLightingSettings() {
    const settings = window.EngineSettings;
    if (!settings?.apply) return false;
    [
      "setting-ambient-intensity",
      "setting-directional-intensity",
      "setting-exposure",
      "setting-hdri-intensity",
    ].forEach((id) => {
      try {
        settings.apply(id);
      } catch (error) {
        console.warn(`[Workspace] Could not apply ${id}:`, error);
      }
    });
    return true;
  }

  _setWorkspaceExposure(value) {
    const renderer = window.renderer;
    const amount = Number(value);
    if (!renderer || !Number.isFinite(amount)) return false;
    renderer.toneMappingExposure = amount;
    if (renderer.shadowMap) renderer.shadowMap.needsUpdate = true;
    return true;
  }

  _applyWorkspaceDefaultShading(
    modeKey = this.currentMode,
    { repair = false } = {},
  ) {
    if (repair) return false;
    const profile = this._getWorkspaceRenderProfile(modeKey);
    const shading = window.SMViewportShading;
    if (!shading?.setMode) return false;
    shading.setMode(profile.shading);
    const panel = window.SMViewportSystem?.getActivePanel?.();
    if (panel) panel.shadingMode = profile.shading;
    return true;
  }

  _ensureFilmSolidPresentation(scene = window.scene) {
    if (!scene || this.currentMode !== "FILM") return false;
    if (window.SMViewportShading?.getMode?.() !== "solid") return false;

    this._setSolidModeShadowsEnabled(false);

    scene.traverse((obj) => {
      if (obj.isDirectionalLight && obj.userData?.ws_studioLight) {
        obj.castShadow = false;
      }
    });

    window.SMViewportShading?.preview?.();
    return true;
  }

  _clearFilmSolidPresentation(scene = window.scene) {
    if (!scene) return false;
    const override = scene.overrideMaterial;
    if (override?.name === "SM_FilmSolidViewportMaterial") {
      scene.overrideMaterial = null;
    }
    return true;
  }

  _enforceWorkspaceLightOwnership(scene, mode) {
    scene.traverse((object) => {
      if (!object.isLight) return;

      const data = object.userData || {};

      if (data.ws_studioLight) {
        object.visible = mode === "FILM" || mode === "METAHUMAN";
        return;
      }

      if (data.ws_gameLight) {
        object.visible = mode === "GAME_DEV" || mode === "GAMEPLAY_SAMPLE";
        return;
      }

      if (data.ws_terrainLight) {
        object.visible = mode === "TERRAIN";
        return;
      }
    });
  }

  _boostGameDevelopmentLighting(scene = window.scene) {
    const sky = window.smHDRSkySystem || window.skyLightingSystem || null;
    const controller = window.smSunController || null;

    if (controller?.light && controller.light === sky?.sunLight) {
      controller.setIntensity?.(Math.max(Number(controller.intensity) || 0, 2.2));
    } else if (sky?.sunLight) {
      sky.sunLight.visible = true;
      sky.sunLight.intensity = Math.max(Number(sky.sunLight.intensity) || 0, 2.2);
    }

    if (sky?.hemiLight) {
      sky.hemiLight.visible = true;
      sky.hemiLight.intensity = Math.max(Number(sky.hemiLight.intensity) || 0, 0.38);
    }
  }

  _boostGameplaySampleLighting(scene = window.scene) {
    const roots = [
      window.gameplaySampleEnvironment?.lights,
      scene?.getObjectByName?.("SMGameplaySampleLights"),
      scene?.getObjectByName?.("SMGameplaySampleFallbackLights"),
    ].filter(Boolean);
    const visited = new Set();
    roots.forEach((root) => {
      root.traverse?.((light) => {
        if (!light?.isLight || visited.has(light)) return;
        visited.add(light);
        light.visible = true;
        if (light.isDirectionalLight) {
          light.intensity = Math.max(Number(light.intensity) || 0, 3.0);
        } else if (light.isHemisphereLight) {
          light.intensity = Math.max(Number(light.intensity) || 0, 0.9);
        } else if (light.isAmbientLight) {
          light.intensity = Math.max(Number(light.intensity) || 0, 0.12);
        }
      });
    });
  }

  _syncWorkspaceLighting(modeKey = this.currentMode, scene = window.scene) {
    if (!scene || typeof THREE === "undefined") return false;
    const profile = this._getWorkspaceRenderProfile(modeKey);
    const mode = profile.mode;
    const adapter = window.smWorkspaceEnvironmentAdapter;
    this._workspaceLightingGeneration += 1;
    this._removeRuntimeLights(scene, {
      preserveSky: true,
      preserveGameplaySample: true,
    });
    this._removeStudioLights(scene);
    adapter?.apply?.(mode, scene);

    if (mode === "FILM") {
      this._hideSky(scene);
      this._setGameplaySampleSceneVisible(scene, false);
      this._setGameDevEnvironmentVisible(scene, false);
      this._removeTaggedLights(scene, "ws_gameLight");
      this._removeTaggedLights(scene, "ws_terrainLight");
      this._addStudioLights(scene);
      this._restoreActiveHDRI(scene, {
        asBackground: true,
        asEnvironment: true,
      });
      this._applyConfiguredLightingSettings();
      this._setWorkspaceExposure(profile.exposure);
      this._enforceWorkspaceLightOwnership(scene, mode);
      window.SMViewportShading?.preview?.();
      return true;
    }

    this._clearFilmSolidPresentation(scene);

    if (mode === "GAME_DEV") {
      if (this._normalizeGameMode(this.currentGameMode) === "2D") {
        this._setGameplaySampleSceneVisible(scene, false);
        this._setGameDevEnvironmentVisible(scene, false);
        this._removeTaggedLights(scene, "ws_gameLight");
        this._removeTaggedLights(scene, "ws_terrainLight");
        this._disable2DHDRIAndSky(scene);
        this._setWorkspaceExposure(profile.exposure);
        this._enforceWorkspaceLightOwnership(scene, mode);
        return true;
      }
      this._setGameplaySampleSceneVisible(scene, false);
      this._removeGameplayFallbackLights(scene);
      this._removeTaggedLights(scene, "ws_terrainLight");
      this._showSky(scene, "ue5-editor");
      this._addGameLights(scene);
      this._restoreActiveHDRI(scene, {
        asBackground: false,
        asEnvironment: true,
      });
      this._applyConfiguredLightingSettings();
      this._boostGameDevelopmentLighting(scene);
      this._setWorkspaceExposure(profile.exposure);
      this._enforceWorkspaceLightOwnership(scene, mode);
      return true;
    }

    if (mode === "GAMEPLAY_SAMPLE") {
      const projectRuntime = window.SMGameProjectRuntime;
      const projectOwnsWorld =
        projectRuntime?.replacesGameplaySampleWorld === true &&
        !!projectRuntime?.activeProject;
      this._hideSky(scene);
      this._setGameDevEnvironmentVisible(scene, false);
      this._removeTaggedLights(scene, "ws_gameLight");
      this._removeTaggedLights(scene, "ws_terrainLight");
      adapter?.setLightRigVisible?.(false);
      this._setGameplaySampleSceneVisible(scene, true);
      if (!projectOwnsWorld) {
        this._ensureGameplaySampleLighting?.(scene);
      }
      this._restoreActiveHDRI(scene, {
        asBackground: false,
        asEnvironment: true,
      });
      scene.background = new THREE.Color(0x8177ad);
      this._applyConfiguredLightingSettings();
      this._boostGameplaySampleLighting(scene);
      this._setWorkspaceExposure(profile.exposure);
      this._enforceWorkspaceLightOwnership(scene, mode);
      return true;
    }

    if (mode === "TERRAIN") {
      this._setGameplaySampleSceneVisible(scene, false);
      this._setGameDevEnvironmentVisible(scene, false);
      this._removeTaggedLights(scene, "ws_gameLight");
      this._showSky(scene, "terrain");
      this._addTerrainLights?.(scene);
      this._restoreActiveHDRI(scene, {
        asBackground: false,
        asEnvironment: true,
      });
      this._applyConfiguredLightingSettings();
      this._setWorkspaceExposure(profile.exposure);
      this._enforceWorkspaceLightOwnership(scene, mode);
      return true;
    }

    if (mode === "METAHUMAN") {
      this._hideSky(scene);
      this._setGameplaySampleSceneVisible(scene, false);
      this._setGameDevEnvironmentVisible(scene, false);

      this._removeTaggedLights(scene, "ws_gameLight");
      this._removeTaggedLights(scene, "ws_terrainLight");

      this._addStudioLights(scene);

      const key = scene.getObjectByName("StudioKeyLight");
      const fill = scene.getObjectByName("StudioFillLight");
      const rim = scene.getObjectByName("StudioRimLight");
      const hemi = scene.getObjectByName("StudioHemiLight");
      const ambient = scene.getObjectByName("StudioAmbientLight");

      if (key) {
        key.visible = true;
        key.intensity = 3.0;
        key.castShadow = true;
      }

      if (fill) {
        fill.visible = true;
        fill.intensity = 0.7;
        fill.castShadow = false;
      }

      if (rim) {
        rim.visible = true;
        rim.intensity = 0.2;
        rim.castShadow = false;
      }

      if (hemi) {
        hemi.visible = true;
        hemi.intensity = 0.35;
      }

      if (ambient) {
        ambient.visible = true;
        ambient.intensity = 0.12;
      }

      this._setWorkspaceExposure(1.05);

      if (window.renderer?.shadowMap) {
        window.renderer.shadowMap.enabled = true;
        window.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        window.renderer.shadowMap.needsUpdate = true;
      }

      this._enforceWorkspaceLightOwnership(scene, mode);
      return true;
    }

    return false;
  }

  _isTerrainPlayerRuntimePlaying() {
    if (String(this.currentMode || "").toUpperCase() !== "TERRAIN")
      return false;
    const bridge =
      window.TerrainPlayerPlayBridge ||
      window.TerrainSculpting?.playerPlay ||
      null;
    return bridge?.state?.playing === true;
  }

  _shouldEnableRuntimePhysics(modeKey = this.currentMode) {
    const mode = String(modeKey || this.currentMode || "").toUpperCase();
    if (mode === "GAME_DEV") {
      // Only enable 3D physics in 3D and 2.5D game submodes
      return this._normalizeGameMode(this.currentGameMode) !== "2D";
    }
    if (mode === "TERRAIN") {
      return this._isTerrainPlayerRuntimePlaying();
    }
    return false;
  }

  _syncRuntimePhysics(force = false) {
    const enabled = this._shouldEnableRuntimePhysics();
    if (!force && this._lastRuntimePhysicsEnabled === enabled) {
      return enabled;
    }
    this._lastRuntimePhysicsEnabled = enabled;
    window.setGameDevelopmentPhysicsEnabled?.(enabled);
    return enabled;
  }

  _consumeVisibilityAuthorityScanBudget(
    force = false,
    intervalMs = this._visibilityAuthorityScanIntervalMs,
  ) {
    if (!force && this._isTerrainPlayerRuntimePlaying()) return false;
    const now =
      typeof performance !== "undefined" &&
      typeof performance.now === "function"
        ? performance.now()
        : Date.now();
    const interval = Math.max(16, Number(intervalMs) || 250);
    if (force || now - this._lastVisibilityAuthorityScanAt >= interval) {
      this._lastVisibilityAuthorityScanAt = now;
      return true;
    }
    return false;
  }

  _consumeWorkspaceLightEnforceBudget(force = false) {
    const now =
      typeof performance !== "undefined" &&
      typeof performance.now === "function"
        ? performance.now()
        : Date.now();
    const interval = Math.max(
      50,
      Number(this._workspaceLightEnforceIntervalMs) || 500,
    );
    if (force || now - this._lastWorkspaceLightEnforceAt >= interval) {
      this._lastWorkspaceLightEnforceAt = now;
      return true;
    }
    return false;
  }

  _hasTerrainPlayerAdded() {
    if (String(this.currentMode || "").toUpperCase() !== "TERRAIN")
      return false;
    const bridge =
      window.TerrainPlayerPlayBridge ||
      window.TerrainSculpting?.playerPlay ||
      null;
    return bridge?.state?.playerAdded === true;
  }

  _isTerrainPlayerObject(object) {
    if (!object) return false;
    const player = window.playerSystem || null;
    const roots = [
      player?.character?.model,
      player?.model,
      player?.character?.visual,
      player?.visual,
      window.player?.model,
      window.player?.visual,
    ].filter(Boolean);
    let current = object;
    while (current) {
      if (roots.includes(current)) return true;
      const data = current.userData || {};
      if (
        data.isPlayer === true ||
        data.isPlayerRoot === true ||
        data.isPlayerVisual === true ||
        data.isPlayerPart === true ||
        data.workspaceOnly === "PLAYER" ||
        data.collisionLayer === "player" ||
        data.collisionLayer === "player-hit"
      ) {
        return true;
      }
      current = current.parent;
    }
    return false;
  }

  _syncTerrainPlayerTestState(forceVisible = true) {
    if (!this._hasTerrainPlayerAdded()) return false;
    const player = window.playerSystem || null;
    if (!player?.ready) return false;
    const root = player.character?.model || player.model || null;

    if (forceVisible) {
      try {
        window.setPlayerModelEnabled?.(true, { loadIfNeeded: false });
      } catch (error) {
        console.warn(
          "[Workspace] Terrain player visibility bridge warning:",
          error,
        );
      }
      player.character?.setVisible?.(true);
      if (root) {
        root.visible = true;
        root.traverse?.((child) => {
          child.visible = true;
          child._hiddenByTerrainMode = false;
          if (child.userData) delete child.userData._terrainWorkspaceHidden;
        });
        root._hiddenByTerrainMode = false;
      }
    }

    if (!player.enabled) {
      player.setTerrainTestMode?.(true);
      player.setEnabled?.(true);
    }
    if (
      player.animation &&
      !player.simulationPaused &&
      !player.animation.enabled
    ) {
      player.animation.setEnabled?.(true);
    }
    if (player.animation?.enabled && !player.animation.currentAction) {
      player.forceIdle?.();
    }

    const bridge =
      window.TerrainPlayerPlayBridge ||
      window.TerrainSculpting?.playerPlay ||
      null;
    const terrainPlaying = bridge?.state?.playing === true;
    if (terrainPlaying && player.runtimeControlActive !== true) {
      player.setRuntimeControlActive?.(true);
    } else if (!terrainPlaying) {
      player.setRuntimeControlActive?.(false);
      player.releaseCamera?.();
    }

    this._syncRuntimePhysics(false);
    return true;
  }

  _syncWorkspaceObjectVisibility(
    modeKey = this.currentMode,
    scene = window.scene,
  ) {
    if (!scene) return;
    const mode = String(modeKey || "").toUpperCase();
    window.smWorkspaceVisibilityAuthority?.setMode?.(mode, {
      scene,
      transitionId: this._workspaceTransitionId,
    });

    const terrainMode = mode === "TERRAIN";
    const gameDevMode = mode === "GAME_DEV";
    const isGame3DOr25D =
      gameDevMode && this._normalizeGameMode(this.currentGameMode) !== "2D";
    const gameplaySampleMode = mode === "GAMEPLAY_SAMPLE";
    const gridMode = mode === "FILM";

    this._setTerrainVisible(scene, terrainMode);
    if (this.metaHumanFloor) {
      this._setMetaHumanFloorVisible(scene, mode === "METAHUMAN");
    }
    this._setGameDevEnvironmentVisible(scene, isGame3DOr25D);
    this._setGameplaySampleVisible(scene, gameplaySampleMode);
    this._syncWorkspaceLighting(mode, scene);
    this._ensureGridVisible(gridMode);

    const foliageRoot = scene.getObjectByName?.("SM_Vegetation");
    if (foliageRoot) {
      foliageRoot.visible = terrainMode;
      foliageRoot.traverse?.((child) => {
        child.visible = terrainMode;
      });
    }
    window.vegetationSystem?.setWorkspaceMode?.(mode);

    if (gameDevMode) {
      window.SMUE5Environment?.syncVisibility?.("GAME_DEV");
    } else if (!terrainMode) {
      window.SMUE5Environment?.syncVisibility?.("FILM");
    }
    this._setEditorGridVisible(scene, gridMode);

    scene.traverse((obj) => {
      if (obj?.userData?.isWater) {
        obj.visible = true;
        obj._hiddenByTerrainMode = false;
      }
    });

    if (terrainMode && this._hasTerrainPlayerAdded()) {
      this._syncTerrainPlayerTestState(true);
    }
    window.smWorkspaceVisibilityAuthority?.enforce?.(scene);
    this._ensure2DGridVisible(scene);
  }

  /**
   * Continuous render-time scene visibility enforcement.
   */
  enforceWorkspaceVisibility(modeKey = this.currentMode, scene = window.scene) {
    if (!scene) return;
    const mode = String(modeKey || this.currentMode || "FILM").toUpperCase();
    const workspaceAuthority = window.smWorkspaceVisibilityAuthority;
    workspaceAuthority?.setMode?.(mode, {
      scene,
      transitionId: this._workspaceTransitionId,
    });

    const terrainPlayerAdded =
      mode === "TERRAIN" && this._hasTerrainPlayerAdded();
    this._syncRuntimePhysics(false);

    const now = Date.now();
    const setTreeVisible = (root, visible) => {
      if (!root) return;
      root.visible = visible;
      root.traverse?.((child) => {
        child.visible = visible;
      });
    };
    const isGameplaySampleObject = (root) => {
      if (!root) return false;
      const data = root.userData || {};
      return (
        data.isGameplaySample === true ||
        data.workspaceOnly === "GAMEPLAY_SAMPLE"
      );
    };

    const isGame3DOr25D =
      mode === "GAME_DEV" &&
      this._normalizeGameMode(this.currentGameMode) !== "2D";

    if (
      now > this._visibilityEnforceUntil &&
      this._lastVisibilityMode === mode
    ) {
      this._setGameplaySampleSceneVisible(scene, mode === "GAMEPLAY_SAMPLE");
      const staleGameFloor =
        window.gameDevGround || scene.getObjectByName("UnrealEngineFloor");
      const staleGameObstacles =
        window.gameDevObstaclesGroup || scene.getObjectByName("ObstaclesGroup");
      if (!isGameplaySampleObject(staleGameFloor)) {
        setTreeVisible(staleGameFloor, isGame3DOr25D);
      }
      if (!isGameplaySampleObject(staleGameObstacles)) {
        setTreeVisible(staleGameObstacles, isGame3DOr25D);
      }
      this._ensureGridVisible(mode === "FILM");
      this._setEditorGridVisible(scene, mode === "FILM");
      this._setMetaHumanFloorVisible(scene, mode === "METAHUMAN");

      if (!terrainPlayerAdded) {
        scene.traverse((obj) => {
          if (obj?.userData?.isWater) obj.visible = true;
        });
      } else {
        const waterRoot = scene.getObjectByName?.("WaterBodies");
        if (waterRoot) waterRoot.visible = true;
      }

      if (terrainPlayerAdded) {
        this._syncTerrainPlayerTestState(true);
      }
      if (this._consumeWorkspaceLightEnforceBudget()) {
        this._enforceWorkspaceLightOwnership(scene, mode);
      }
      if (mode === "FILM") {
        this._ensureFilmSolidPresentation(scene);
      }
      if (mode === "GAME_DEV" && !isGame3DOr25D) {
        this._hide3DPlayer(scene);
        this._configure2DTransformControls();
      }
      workspaceAuthority?.enforce?.(scene, { scan: false });
      this._ensure2DGridVisible(scene);
      return;
    }

    const terrainVisible = mode === "TERRAIN";
    const sampleVisible = mode === "GAMEPLAY_SAMPLE";
    const projectOwnsGameplaySampleWorld =
      window.SMGameProjectRuntime?.replacesGameplaySampleWorld === true &&
      !!window.SMGameProjectRuntime?.activeProject;

    const foliageRoot = scene.getObjectByName?.("SM_Vegetation");
    if (foliageRoot) {
      foliageRoot.visible = terrainVisible;
      foliageRoot.traverse?.((child) => {
        child.visible = terrainVisible;
      });
    }
    window.vegetationSystem?.setWorkspaceMode?.(mode);

    this._setTerrainVisible(scene, terrainVisible);
    this._setMetaHumanFloorVisible(scene, mode === "METAHUMAN");

    scene.traverse((obj) => {
      if (!obj) return;
      if (obj === this.metaHumanFloor) return;
      if (terrainPlayerAdded && this._isTerrainPlayerObject(obj)) {
        obj.visible = true;
        obj._hiddenByTerrainMode = false;
        return;
      }
      if (obj.userData?.isWater) {
        obj.visible = true;
        obj._hiddenByTerrainMode = false;
        return;
      }
      if (this._isTerrainObject(obj)) {
        obj.visible = terrainVisible;
        return;
      }
      const data = obj.userData || {};
      const name = String(obj.name || "");

      // The 2D grid is an editor helper, not a 3D Game Dev environment
      // object. Never let the generic GAME_DEV visibility rule hide it.
      if (data.is2DGridHelper === true || name === "gameModeGrid2D") {
        return;
      }

      const isSample =
        data.workspaceOnly === "GAMEPLAY_SAMPLE" ||
        data.isGameplaySample === true ||
        name === "SMGameplaySampleEnvironment" ||
        name === "SMGameplaySampleObstacles" ||
        name === "SMGameplaySampleLights" ||
        name === "SMGameplaySampleFallbackLights";

      if (isSample) {
        obj.visible =
          data.smGameProjectObject === true
            ? sampleVisible && projectOwnsGameplaySampleWorld
            : sampleVisible && !projectOwnsGameplaySampleWorld;
        return;
      }

      const isGameDev =
        window.smWorkspaceOwnership?.isGameDevObject?.(obj) ??
        (data.workspaceOnly === "GAME_DEV" ||
          data.isGameDevelopmentEnvironment === true ||
          name === "UnrealEngineFloor" ||
          name === "ObstaclesGroup" ||
          name === "DistanceMarkers" ||
          name === "MotionMatchingSampleCourse" ||
          name === "WaterBodies");

      if (isGameDev) {
        obj.visible = isGame3DOr25D;
      }
    });

    this._setGameplaySampleSceneVisible(scene, sampleVisible);
    setTreeVisible(
      window.terrain || scene.getObjectByName("Terrain_Mesh"),
      terrainVisible,
    );
    setTreeVisible(
      scene.getObjectByName("SMGameplaySampleEnvironment"),
      sampleVisible && !projectOwnsGameplaySampleWorld,
    );
    setTreeVisible(
      scene.getObjectByName("SMGameplaySampleLights"),
      sampleVisible && !projectOwnsGameplaySampleWorld,
    );
    setTreeVisible(
      scene.getObjectByName("SMGameplaySampleFallbackLights"),
      sampleVisible && !projectOwnsGameplaySampleWorld,
    );

    const gameFloorRoot =
      window.gameDevGround || scene.getObjectByName("UnrealEngineFloor");
    const gameObstaclesRoot =
      window.gameDevObstaclesGroup || scene.getObjectByName("ObstaclesGroup");
    if (!isGameplaySampleObject(gameFloorRoot))
      setTreeVisible(gameFloorRoot, isGame3DOr25D);
    if (!isGameplaySampleObject(gameObstaclesRoot))
      setTreeVisible(gameObstaclesRoot, isGame3DOr25D);

    const showEditorGrid = mode === "FILM";
    this._setEditorGridVisible(scene, showEditorGrid);

    const gameModeGrid = scene.getObjectByName("gameModeGrid2D");
    const isPlayingInEditor =
      window.__smPIEMode === "play" ||
      window.__smPIEMode === "pause" ||
      window.__smGameRunning === true;
    setTreeVisible(
      gameModeGrid,
      mode === "GAME_DEV" &&
        this._normalizeGameMode(this.currentGameMode) === "2D" &&
        !isPlayingInEditor,
    );

    if (terrainPlayerAdded) this._syncTerrainPlayerTestState(true);
    if (mode === "GAME_DEV" && !isGame3DOr25D) {
      this._hide3DPlayer(scene);
      this._configure2DTransformControls();
    }

    this._setMetaHumanFloorVisible(scene, mode === "METAHUMAN");
    workspaceAuthority?.enforce?.(scene, { scan: false });
    this._ensure2DGridVisible(scene);

    if (
      this._consumeWorkspaceLightEnforceBudget(
        mode !== this._lastVisibilityMode,
      )
    ) {
      this._enforceWorkspaceLightOwnership(scene, mode);
    }
    if (mode === "FILM") {
      this._ensureFilmSolidPresentation(scene);
    }
    if (mode !== this._lastVisibilityMode) {
      window.hierarchyManager?.renderAll?.();
    }
    this._lastVisibilityMode = mode;
  }

  _setupTerrainViewport(scene, settings = {}, repair = false) {
    if (!scene) return;
    this._clearFilmSolidPresentation(scene);
    scene.overrideMaterial = null;
    this._applyWorkspaceDefaultShading("TERRAIN", { repair });
    this._terrainModeActive = true;
    const terrainPlayerAdded = this._hasTerrainPlayerAdded();
    this._syncRuntimePhysics(true);
    window.smWorkspaceEnvironmentAdapter?.apply?.("TERRAIN", scene);
    this._removeTerrainSceneGuard?.(scene);
    this._hideGameplaySampleEnvironment(scene);
    this._hideGameDevelopmentEnvironment(scene);
    this._removeStudioLights(scene);
    this._removeRuntimeLights(scene, {
      preserveSky: true,
      preserveGameplaySample: true,
    });
    this._removeNamedGridHelper(scene, "gameModeGrid2D");
    this._setAuxiliaryViewportObjectsVisible(false);

    this._ensureTerrainExists?.(scene);
    if (terrainPlayerAdded) {
      this._syncTerrainPlayerTestState(true);
    } else {
      window.TerrainPlayerPlayBridge?.enterEditMode?.({
        hideUnaddedPlayer: true,
      });
      window.TerrainSculpting?.playerPlay?.enterEditMode?.({
        hideUnaddedPlayer: true,
      });
      const player = window.playerSystem || null;
      if (player) {
        player.setRuntimeControlActive?.(false);
        player.releaseCamera?.();
        if (!window.TerrainPlayerPlayBridge?.state?.playerAdded) {
          player.setEnabled?.(false);
        }
      }
      if (!this._hasTerrainPlayerAdded()) {
        window.setPlayerModelEnabled?.(false, { loadIfNeeded: false });
      }
    }

    scene.traverse((obj) => {
      if (obj.userData?.isWater) {
        obj.visible = true;
        obj._hiddenByTerrainMode = false;
      }
    });

    const visibilityAuthority = window.smWorkspaceVisibilityAuthority;
    if (visibilityAuthority) {
      visibilityAuthority.setMode?.("TERRAIN", {
        scene,
        transitionId: this._workspaceTransitionId,
      });
      visibilityAuthority.enterTerrainIsolation?.(scene);
      visibilityAuthority.scan?.(scene);
      visibilityAuthority.enforce?.(scene);
    } else {
      scene.traverse((obj) => {
        if (!obj?.isMesh) return;
        const isTerrainPlayer =
          terrainPlayerAdded && this._isTerrainPlayerObject(obj);
        const keep =
          this._isTerrainObject(obj) ||
          obj.userData?.isWater ||
          this._isSkyObject?.(obj) ||
          obj.userData?.keepForSky ||
          obj.userData?.isSkyLightingObject ||
          isTerrainPlayer;
        if (!keep) {
          obj.visible = false;
          obj._hiddenByTerrainMode = true;
        } else if (isTerrainPlayer) {
          obj.visible = true;
          obj._hiddenByTerrainMode = false;
        }
      });
    }

    if (window.smWorkspaceEnvironmentAdapter) {
      window.smWorkspaceEnvironmentAdapter.apply?.("TERRAIN", scene);
    } else if (window.skyLightingSystem) {
      window.skyLightingSystem.ensureRigAttached?.();
      window.skyLightingSystem.setWorkspaceMode?.("TERRAIN");
      window.skyLightingSystem.refreshShadows?.();
    } else {
      this._restoreGameSky?.(scene, { profile: "terrain" });
    }

    this._addTerrainLights?.(scene);
    this._syncWorkspaceLighting("TERRAIN", scene);
    if (!scene.fog) {
      scene.fog = new THREE.FogExp2(0xb4c0d1, 0.00115);
    }
    if (window.terrain) {
      this._markTerrainObject(window.terrain);
    }

    const camera = window.camera;
    const controls = window.orbitControls || window.controls;
    if (camera) {
      camera.fov = 55;
      camera.near = 0.1;
      camera.far = Math.max(4000, camera.far || 4000);
      camera.position.set(0, 30, 135);
      camera.lookAt(0, 8, 0);
      camera.updateProjectionMatrix?.();
    }
    if (controls) {
      controls.enableRotate = true;
      controls.enableZoom = true;
      controls.enablePan = true;
      controls.target.set(0, 8, 0);
      controls.minPolarAngle = 0;
      controls.maxPolarAngle = Math.PI / 2.1;
      controls.update?.();
    }

    const repairTerrain = () => {
      if (this.currentMode !== "TERRAIN") return;
      this._syncRuntimePhysics(false);
      window.smWorkspaceEnvironmentAdapter?.apply?.("TERRAIN", scene);
      this._hideGameplaySampleEnvironment(scene);
      this._hideGameDevelopmentEnvironment(scene);
      if (window.terrain) this._markTerrainObject(window.terrain);
      this._syncWorkspaceObjectVisibility("TERRAIN", scene);
      window.smWorkspaceVisibilityAuthority?.enforce?.(scene, { scan: false });
      if (this._hasTerrainPlayerAdded()) this._syncTerrainPlayerTestState(true);
    };
    requestAnimationFrame(repairTerrain);
    setTimeout(repairTerrain, 250);
    console.log("[Workspace] TERRAIN viewport applied");
  }

  _markTerrainObject(terrain) {
    if (!terrain) return null;
    const terrainMode =
      String(this.currentMode || "").toUpperCase() === "TERRAIN";
    terrain.userData = terrain.userData || {};
    Object.assign(terrain.userData, {
      isTerrain: true,
      isTerrainMesh:
        terrain.userData.isTerrainMesh || terrain.name === "Terrain_Mesh",
      workspaceOnly: "TERRAIN",
      smWorkspaceScope: "TERRAIN",
      isSystemObject: false,
      ignoreInHierarchy: false,
      ignoreInTimeline: false,
      selectable: terrainMode,
    });
    terrain.traverse?.((child) => {
      child.userData = child.userData || {};
      Object.assign(child.userData, {
        isTerrain: true,
        workspaceOnly: "TERRAIN",
        smWorkspaceScope: "TERRAIN",
        isSystemObject: false,
        ignoreInHierarchy: false,
        selectable: terrainMode,
      });
    });

    if (window.smWorkspaceVisibilityAuthority) {
      window.smWorkspaceVisibilityAuthority.register?.(terrain, "TERRAIN");
      window.smWorkspaceVisibilityAuthority.setMode?.(
        this.currentMode || "FILM",
        {
          scene: window.scene,
          transitionId: this._workspaceTransitionId,
        },
      );
      window.smWorkspaceVisibilityAuthority.enforce?.(window.scene);
    } else {
      terrain.visible = terrainMode;
    }
    return terrain;
  }

  _ensureTerrainExists(scene) {
    if (!scene || typeof THREE === "undefined") return null;
    let terrain =
      scene.getObjectByName("Terrain") ||
      scene.getObjectByName("Terrain_Mesh") ||
      window.terrain;

    const isEmptyTerrainPlaceholder =
      terrain &&
      (terrain.name === "Terrain_Mesh" || terrain.userData?.isTerrain) &&
      !terrain.userData?.terrainData &&
      !terrain.userData?.componentManager &&
      !(terrain.children?.length > 0);

    if (isEmptyTerrainPlaceholder) {
      terrain.removeFromParent?.();
      if (window.terrain === terrain) window.terrain = null;
      if (window.TerrainSculpting?.getLandscape?.() === terrain)
        window.TerrainSculpting.setLandscape?.(null);
      terrain = null;
    }

    if (terrain) {
      window.terrain = terrain;
      this._markTerrainObject(terrain);
      if (!terrain.parent) scene.add(terrain);
      window.smWorkspaceVisibilityAuthority?.scan?.(scene);
      window.smWorkspaceVisibilityAuthority?.enforce?.(scene);
      return terrain;
    }

    if (this.currentMode !== "TERRAIN" || this._terrainCreatePending)
      return null;

    const createFn =
      window.createTerrain ||
      (typeof createTerrain === "function" ? createTerrain : null);
    if (typeof createFn !== "function") {
      if (this.currentMode === "TERRAIN" && this._terrainCreateAttempts < 40) {
        const workspaceToken = this._viewportApplyToken;
        this._terrainCreateAttempts += 1;
        setTimeout(() => {
          if (
            this.currentMode !== "TERRAIN" ||
            this._viewportApplyToken !== workspaceToken
          )
            return;
          this._ensureTerrainExists(scene);
        }, 150);
      }
      return null;
    }

    this._terrainCreatePending = true;
    this._terrainCreateAttempts = 0;
    const createEpoch = ++this._terrainCreateEpoch;
    const workspaceToken = this._viewportApplyToken;
    const isCreationStillValid = () =>
      this.currentMode === "TERRAIN" &&
      this._viewportApplyToken === workspaceToken &&
      this._terrainCreateEpoch === createEpoch;

    const finalizeTerrain = (created) => {
      const terrainObject =
        (created?.isObject3D ? created : null) ||
        window.terrain ||
        scene.getObjectByName("Terrain") ||
        scene.getObjectByName("Terrain_Mesh") ||
        null;
      if (!terrainObject) return null;
      window.terrain = terrainObject;
      this._markTerrainObject(terrainObject);
      if (!terrainObject.parent) scene.add(terrainObject);

      if (!isCreationStillValid()) {
        terrainObject.visible = false;
        terrainObject.userData.selectable = false;
        window.smWorkspaceVisibilityAuthority?.scan?.(scene);
        window.smWorkspaceVisibilityAuthority?.enforce?.(scene, { scan: true });
        return terrainObject;
      }

      terrainObject.visible = true;
      terrainObject.userData.selectable = true;
      window.selectedObject = terrainObject;
      window.transformControls?.attach?.(terrainObject);
      window.updateHierarchy?.();
      window.smWorkspaceVisibilityAuthority?.scan?.(scene);
      window.smWorkspaceVisibilityAuthority?.enforce?.(scene);
      return terrainObject;
    };

    this._terrainCreateRAF = requestAnimationFrame(async () => {
      this._terrainCreateRAF = 0;
      if (!isCreationStillValid()) {
        this._terrainCreatePending = false;
        return;
      }
      try {
        const result = createFn({
          sectionSize: 63,
          sectionsPerComponent: 1,
          componentsX: 4,
          componentsZ: 4,
          quadSize: 3.6,
          isDefault: true,
          initialMode: "edgeMountains",
          flatCenterRatio: 0.5,
          edgeMountainAmplitude: 32,
          edgeMountainFalloff: 2.25,
          noiseAmplitude: 5.5,
          noiseFrequency: 0.016,
          noiseOctaves: 5,
          noisePersistence: 0.48,
          noiseSeed: 1337,
          textureResolution: 1024,
          theme: "realistic",
        });
        const resolved = await Promise.resolve(result);
        finalizeTerrain(resolved);
        setTimeout(() => finalizeTerrain(null), 100);
      } catch (error) {
        console.error("[Workspace] Terrain creation failed:", error);
      } finally {
        this._terrainCreatePending = false;
      }
    });
    return null;
  }

  _addTerrainLights(scene) {
    if (!scene) return;
    const old = [];
    scene.traverse((obj) => {
      if (obj.userData?.ws_terrainLight) old.push(obj);
    });
    old.forEach((obj) => obj.parent?.remove(obj));

    const tuneSunShadow = (sun) => {
      if (!sun) return;
      sun.castShadow = true;
      sun.intensity = Math.max(2.25, Number(sun.intensity) || 0);
      sun.position.set(110, 170, 110);
      sun.shadow.mapSize.set(2048, 2048);
      sun.shadow.camera.left = -70;
      sun.shadow.camera.right = 70;
      sun.shadow.camera.top = 70;
      sun.shadow.camera.bottom = -70;
      sun.shadow.camera.near = 0.5;
      sun.shadow.camera.far = 420;
      sun.shadow.bias = -0.00005;
      sun.shadow.normalBias = 0.0015;
      sun.shadow.radius = 1.0;
      sun.shadow.needsUpdate = true;
      sun.shadow.camera.updateProjectionMatrix?.();
    };

    if (window.renderer?.shadowMap) {
      window.renderer.shadowMap.enabled = true;
      if (THREE.PCFSoftShadowMap)
        window.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      window.renderer.shadowMap.needsUpdate = true;
    }

    if (window.smHDRSkySystem?.sunLight || window.skyLightingSystem?.sunLight) {
      const sky = window.smHDRSkySystem || window.skyLightingSystem;
      old.forEach((obj) => {
        if (obj !== sky.sunLight) obj.parent?.remove(obj);
      });
      tuneSunShadow(sky.sunLight);
      window.smSunController?.configureShadows?.({
        mapSize: 2048,
        area: 70,
        near: 0.5,
        far: 420,
        bias: -0.00005,
        normalBias: 0.0015,
        radius: 1.0,
      });
      if (sky.hemiLight)
        sky.hemiLight.intensity = Math.max(
          0.72,
          Number(sky.hemiLight.intensity) || 0,
        );
      sky._purgeForeignLights?.();
      sky.update?.(0);
      return;
    }

    const tag = (light) => {
      light.userData = {
        ...(light.userData || {}),
        isSystemObject: true,
        ignoreInTimeline: true,
        ws_terrainLight: true,
      };
    };

    const sun = new THREE.DirectionalLight(0xfff4d6, 4.1);
    sun.name = "TerrainSunLight";
    tuneSunShadow(sun);
    tag(sun);
    scene.add(sun);

    const hemi = new THREE.HemisphereLight(0xbfd8ff, 0x8f7a62, 0.82);
    hemi.name = "TerrainHemiLight";
    tag(hemi);
    scene.add(hemi);

    const fill = new THREE.DirectionalLight(0xdceaff, 0.22);
    fill.name = "TerrainFillLight";
    fill.position.set(-90, 80, -40);
    fill.castShadow = false;
    tag(fill);
    scene.add(fill);
  }

  _removeTerrainSceneGuard(scene) {
    if (scene?._originalAdd) {
      scene.add = scene._originalAdd;
      delete scene._originalAdd;
    }
  }

  _restoreFromTerrainMode(scene, targetMode = this.currentMode) {
    if (!scene) return;
    const target = String(
      targetMode || localStorage.getItem("sm_workspace_mode") || "FILM",
    ).toUpperCase();
    const authority = window.smWorkspaceVisibilityAuthority;
    if (authority) {
      authority.leaveTerrainIsolation?.(scene);
      authority.setMode?.(target, {
        scene,
        transitionId: this._workspaceTransitionId,
      });
      authority.scan?.(scene);
      authority.enforce?.(scene);
    }

    scene.traverse((obj) => {
      if (!obj._hiddenByTerrainMode) return;
      delete obj._hiddenByTerrainMode;
      const isSky = this._isSkyObject(obj);
      const isTerrain = this._isTerrainObject(obj);
      const isGameDev =
        window.smWorkspaceOwnership?.isGameDevObject?.(obj) ??
        (obj.userData?.workspaceOnly === "GAME_DEV" ||
          obj.userData?.isGameDevelopmentEnvironment === true);
      const isSample =
        obj.userData?.workspaceOnly === "GAMEPLAY_SAMPLE" ||
        obj.userData?.isGameplaySample === true;

      if (isTerrain) {
        obj.visible = target === "TERRAIN";
        return;
      }
      if (isSky) {
        obj.visible = target === "GAME_DEV" || target === "TERRAIN";
        return;
      }
      if (isGameDev) {
        obj.visible =
          target === "GAME_DEV" &&
          this._normalizeGameMode(this.currentGameMode) !== "2D";
        return;
      }
      if (isSample) {
        obj.visible = target === "GAMEPLAY_SAMPLE";
        return;
      }
      obj.visible = true;
    });

    this._removeTerrainSceneGuard(scene);
    const old = [];
    scene.traverse((obj) => {
      if (obj.userData?.ws_terrainLight) old.push(obj);
    });
    old.forEach((obj) => obj.parent?.remove(obj));

    if (window.player) window.player.isActive = true;
    this._terrainModeActive = false;

    authority?.setMode?.(target, {
      scene,
      transitionId: this._workspaceTransitionId,
    });
    authority?.enforce?.(scene, { scan: true });
    this._syncSkyForWorkspace(target, scene);
  }

  _removeNamedGridHelper(scene, gridName) {
    if (!scene || !gridName) return;
    const grid = scene.getObjectByName(gridName);
    if (!grid) return;
    grid.traverse((child) => {
      child.geometry?.dispose?.();
      if (Array.isArray(child.material)) {
        child.material.forEach((mat) => mat?.dispose?.());
      } else {
        child.material?.dispose?.();
      }
    });
    grid.parent?.remove?.(grid);
    if (window.gameModeGrid2D === grid) window.gameModeGrid2D = null;
  }

  _createFallback2DGrid() {
    // Three.js GridHelper is XZ-oriented, while the 2D workspace camera
    // looks along Z at the XY plane. Build an explicit XY grid so the
    // helper still works when SM2DGraphGrid.js is not loaded yet.
    const group = new THREE.Group();
    const extent = 200;
    const minorStep = 1;
    const majorStep = 10;

    const makeLines = (step, material) => {
      const positions = [];
      for (let v = -extent; v <= extent + 0.0001; v += step) {
        positions.push(-extent, v, 0, extent, v, 0);
        positions.push(v, -extent, 0, v, extent, 0);
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(positions, 3),
      );
      const lines = new THREE.LineSegments(geometry, material);
      lines.frustumCulled = false;
      return lines;
    };

    const minorMaterial = new THREE.LineBasicMaterial({
      color: 0x4b5563,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
    });
    const majorMaterial = new THREE.LineBasicMaterial({
      color: 0x94a3b8,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });

    group.add(makeLines(minorStep, minorMaterial));
    group.add(makeLines(majorStep, majorMaterial));
    group.renderOrder = 1000;
    return group;
  }

  _ensure2DGridVisible(scene = window.scene) {
    if (!scene) return null;
    const grid = scene.getObjectByName("gameModeGrid2D");
    if (!grid) return null;

    const is2D =
      this.currentMode === "GAME_DEV" &&
      this._normalizeGameMode(this.currentGameMode) === "2D";
    const playing =
      window.__smPIEMode === "play" ||
      window.__smPIEMode === "pause" ||
      window.__smGameRunning === true;
    const visible = is2D && !playing;

    grid.visible = visible;
    grid.traverse?.((child) => {
      child.visible = visible;
    });
    return grid;
  }

  _updateGameModeGrid(mode, scene) {
    if (!scene) return;
    this._removeNamedGridHelper(scene, "gameModeGrid2D");
    if (mode !== "2D") return;

    const group =
      window.SM2DGraphGrid?.create?.({
        extent: 200,
        minorStep: 1,
        majorStep: 10,
      }) || this._createFallback2DGrid();

    group.name = "gameModeGrid2D";
    group.userData = {
      ...(group.userData || {}),
      isSystemObject: true,
      ignoreInTimeline: true,
      ignoreInHierarchy: true,
      selectable: false,
      is2DGridHelper: true,
      workspaceOnly: "2D_GRID",
      editorOnly: true,
      hideInPlay: true,
    };
    group.renderOrder = 1000;

    this._markWorkspaceHelper(group);
    scene.add(group);
    this._ensure2DGridVisible(scene);

    // Keep a stable global reference for systems that do not have the
    // workspace manager instance available.
    window.gameModeGrid2D = group;
    window.SM2DGraphGrid?.update?.(
      group,
      window.camera2D ||
        window.cameraSystem?.orthographicCamera ||
        window.camera,
      window.renderer?.domElement?.clientWidth || window.innerWidth || 1,
      window.renderer?.domElement?.clientHeight || window.innerHeight || 1,
    );
  }

  _setup25DParallaxLayers(scene) {
    if (!scene) return;
    this._remove25DParallaxLayerHelpers(scene);
    const depths = [-20, -10, 0, 10, 20];
    const colors = [0x1a2a50, 0x1e3060, 0x3a6aaa, 0x244024, 0x151520];
    depths.forEach((z, index) => {
      const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(400, 80),
        new THREE.MeshBasicMaterial({
          color: colors[index],
          transparent: true,
          opacity: index === 2 ? 0.06 : 0.03,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      plane.position.set(0, 0, z);
      plane.name = `_25dLayerHelper_${index}`;
      plane.userData = {
        isSystemObject: true,
        ignoreInTimeline: true,
        workspaceOnly: "GAME_DEV",
      };
      scene.add(plane);
    });
  }

  _remove25DParallaxLayerHelpers(scene) {
    if (!scene) return;
    const toRemove = [];
    scene.traverse((obj) => {
      if (obj.name?.startsWith("_25dLayer")) toRemove.push(obj);
    });
    toRemove.forEach((obj) => {
      obj.traverse((child) => {
        child.geometry?.dispose?.();
        if (Array.isArray(child.material)) {
          child.material.forEach((mat) => mat?.dispose?.());
        } else {
          child.material?.dispose?.();
        }
      });
      obj.parent?.remove(obj);
    });
  }

  _show2DAxisOverlay() {
    this._remove2DAxisOverlay();
    const overlay = document.createElement("div");
    overlay.id = "sm-2d-axis-overlay";
    overlay.style.cssText =
      "position:absolute;pointer-events:none;z-index:1000;bottom:12px;left:12px;display:flex;gap:10px;align-items:center;font-size:11px;font-family:monospace;font-weight:700;";
    overlay.innerHTML =
      '<span style="display:flex;align-items:center;gap:5px"><span style="width:20px;height:3px;background:#e05050;display:inline-block"></span><span style="color:#e07070">X</span></span><span style="display:flex;align-items:center;gap:5px"><span style="width:3px;height:20px;background:#50c050;display:inline-block"></span><span style="color:#70c870">Y</span></span><span style="color:rgba(120,160,220,.6);font-size:10px;margin-left:6px">ORTHOGRAPHIC · XY</span>';
    (
      document.getElementById("renderer-container") || document.body
    ).appendChild(overlay);
  }

  _remove2DAxisOverlay() {
    document.getElementById("sm-2d-axis-overlay")?.remove();
  }

  _is3DPlayerObject(object) {
    if (!object) return false;
    const player = window.playerSystem || null;
    const roots = [
      player?.character?.model,
      player?.model,
      player?.character?.visual,
      player?.visual,
      window.player?.model,
      window.player?.visual,
      window.player?.mesh,
    ].filter(Boolean);

    let current = object;
    const playerNames = [
      "Player",
      "player",
      "PlayerModel",
      "MotionMatchingPlayer",
      "character",
      "SMPlayer",
      "PlayerVisual",
    ];
    while (current) {
      if (roots.includes(current)) return true;
      const data = current.userData || {};
      const name = String(current.name || "");
      if (
        playerNames.includes(name) ||
        data.isPlayer === true ||
        data.isPlayerRoot === true ||
        data.isPlayerVisual === true ||
        data.isPlayerPart === true ||
        data.workspaceOnly === "PLAYER" ||
        data.collisionLayer === "player" ||
        data.collisionLayer === "player-hit"
      ) {
        return true;
      }
      current = current.parent;
    }
    return false;
  }

  _hide3DPlayer(scene = window.scene) {
    try {
      window.setPlayerModelEnabled?.(false, { loadIfNeeded: false });
    } catch {}

    if (window.playerSystem) {
      window.playerSystem.setEnabled?.(false);
      window.playerSystem.setRuntimeControlActive?.(false);
      window.playerSystem.character?.setVisible?.(false);
      if (window.playerSystem.model) window.playerSystem.model.visible = false;
      if (window.playerSystem.character?.model)
        window.playerSystem.character.model.visible = false;
    }
    if (window.player) {
      window.player.inputEnabled = false;
      window.player.gravityEnabled = false;
      window.player.lockZPosition = false;
      if (window.player.model) window.player.model.visible = false;
      if (window.player.mesh) window.player.mesh.visible = false;
      if (window.player.visual) window.player.visual.visible = false;
    }

    const playerNames = [
      "Player",
      "player",
      "PlayerModel",
      "MotionMatchingPlayer",
      "character",
      "SMPlayer",
      "PlayerVisual",
    ];
    playerNames.forEach((name) => {
      const obj = scene?.getObjectByName?.(name);
      if (obj) {
        obj.visible = false;
        obj.traverse?.((child) => {
          child.visible = false;
        });
      }
    });

    scene?.traverse?.((obj) => {
      if (this._is3DPlayerObject(obj)) {
        obj.visible = false;
        obj.traverse?.((child) => {
          child.visible = false;
        });
      }
    });

    if (
      window.selectedObject &&
      this._is3DPlayerObject(window.selectedObject)
    ) {
      window.selectedObject = null;
      if (window.selectedObjects) window.selectedObjects.length = 0;
      window.transformControls?.detach?.();
      if (window.transformControls) window.transformControls.visible = false;
      if (window.outlinePass) window.outlinePass.selectedObjects = [];
      window.updateHierarchy?.();
    }
  }

  _configure2DTransformControls() {
    const tc = window.transformControls;
    if (!tc) return;

    // 1. If attached to 3D player or terrain, detach immediately
    if (
      window.selectedObject &&
      (this._is3DPlayerObject?.(window.selectedObject) ||
        this._isTerrainObject?.(window.selectedObject))
    ) {
      window.selectedObject = null;
      if (window.selectedObjects) window.selectedObjects.length = 0;
      tc.detach();
      tc.visible = false;
      return;
    }

    // 2. Ensure camera is up-to-date with 2D Orthographic camera
    const activeCam = window.cameraSystem?.orthographicCamera || window.camera;
    if (activeCam && tc.camera !== activeCam) {
      tc.camera = activeCam;
    }

    // 3. Helper to correctly configure axes for 2D Mode
    const apply2DAxes = () => {
      if (tc.mode === "rotate") {
        // In 2D rotation: Disable X and Y tilt, ONLY allow Z planar roll!
        tc.showX = false;
        tc.showY = false;
        tc.showZ = true; // <-- Shows the Blue Ring for flat 2D rotation
      } else {
        // In translate or scale: Allow X and Y, block Z depth
        tc.showX = true;
        tc.showY = true;
        tc.showZ = false;
      }
    };

    // Apply immediately
    apply2DAxes();

    // 4. Hook tc.setMode so whenever 'rotate', 'translate', or 'scale' is selected, axes adapt
    if (!this._2dTransformModeHooked) {
      this._2dTransformModeHooked = true;

      const origSetMode = tc.setMode.bind(tc);
      tc.setMode = (mode) => {
        origSetMode(mode);
        if (
          this.currentMode === "GAME_DEV" &&
          this._normalizeGameMode(this.currentGameMode) === "2D"
        ) {
          apply2DAxes();
        }
      };

      // Ensure rotated sprite stays flat on Z = 0 (no 3D tilt)
      tc.addEventListener("objectChange", () => {
        if (
          this.currentMode === "GAME_DEV" &&
          this._normalizeGameMode(this.currentGameMode) === "2D"
        ) {
          if (tc.object) {
            tc.object.position.z = 0;
            tc.object.rotation.x = 0;
            tc.object.rotation.y = 0;
          }
        }
      });
    }
  }

  _setup2DGameWorkspace(scene = window.scene, camera = null, controls = null) {
    this._remove2DGameWorkspace();
    this._hide3DPlayer(scene);
    this._configure2DTransformControls();

    window.sm2DGridSnap = window.sm2DGridSnap || { enabled: true, size: 1.0 };
    window.sm2DActiveLayer = window.sm2DActiveLayer || "midground";

    // 1. Inject Styles for 2D Header Toolbar, HUD & Layer Manager
    if (!document.getElementById("sm-2d-workspace-styles")) {
      const style = document.createElement("style");
      style.id = "sm-2d-workspace-styles";
      style.textContent = `
                .sm-2d-header-toolbar {
                    height: 22px;
                    display: inline-flex;
                    align-items: center;
                    gap: 3px;
                    background: rgba(15, 23, 42, 0.85);
                    border: 1px solid rgba(255, 255, 255, 0.12);
                    border-radius: 4px;
                    padding: 1px 5px;
                    margin: 0 4px;
                    user-select: none;
                    flex-shrink: 0;
                    box-sizing: border-box;
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                }
                .sm-2d-toolbar-brand {
                    font-size: 10px;
                    font-weight: 800;
                    color: #38bdf8;
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    padding: 0 3px;
                    letter-spacing: 0.04em;
                    white-space: nowrap;
                }
                .sm-2d-toolbar-sep {
                    width: 1px;
                    height: 14px;
                    background: rgba(255, 255, 255, 0.12);
                    margin: 0 2px;
                }
                .sm-2d-btn {
                    height: 20px;
                    padding: 0 7px;
                    background: rgba(255, 255, 255, 0.05);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 3px;
                    color: #cbd5e1;
                    font-size: 10.5px;
                    font-weight: 600;
                    cursor: pointer;
                    display: inline-flex;
                    align-items: center;
                    gap: 4px;
                    transition: all 0.12s ease;
                    white-space: nowrap;
                    line-height: 1;
                }
                .sm-2d-btn:hover {
                    background: rgba(255, 255, 255, 0.14);
                    color: #fff;
                    border-color: rgba(255, 255, 255, 0.25);
                }
                .sm-2d-btn.active {
                    background: rgba(56, 189, 248, 0.18);
                    border-color: rgba(56, 189, 248, 0.5);
                    color: #38bdf8;
                }
                .sm-2d-btn-play {
                    background: #059669;
                    border-color: #10b981;
                    color: #fff;
                    font-weight: 700;
                }
                .sm-2d-btn-play:hover {
                    background: #10b981;
                    color: #fff;
                }
                .sm-2d-btn-stop {
                    background: #dc2626 !important;
                    border-color: #ef4444 !important;
                    color: #fff !important;
                }
                .sm-2d-hud {
                    position: absolute;
                    bottom: 10px;
                    right: 12px;
                    z-index: 1000;
                    background: rgba(11, 14, 20, 0.88);
                    backdrop-filter: blur(8px);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 5px;
                    padding: 4px 10px;
                    display: flex;
                    gap: 12px;
                    font-size: 10.5px;
                    color: #94a3b8;
                    font-family: monospace;
                    pointer-events: none;
                    user-select: none;
                }
                .sm-2d-layers-panel {
                    position: absolute;
                    top: 36px;
                    right: 12px;
                    width: 210px;
                    background: rgba(15, 19, 26, 0.95);
                    backdrop-filter: blur(16px);
                    border: 1px solid rgba(255, 255, 255, 0.14);
                    border-radius: 6px;
                    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.8);
                    z-index: 9999;
                    display: flex;
                    flex-direction: column;
                    overflow: hidden;
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                }
                .sm-2d-layers-header {
                    height: 28px;
                    padding: 0 8px;
                    background: #151c2c;
                    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    font-size: 10px;
                    font-weight: 750;
                    color: #94a3b8;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                }
                .sm-2d-layer-row {
                    padding: 6px 8px;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    font-size: 10.5px;
                    color: #cbd5e1;
                    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
                    cursor: pointer;
                }
                .sm-2d-layer-row:hover { background: rgba(255, 255, 255, 0.05); }
                .sm-2d-layer-row.active {
                    background: rgba(56, 189, 248, 0.12);
                    color: #38bdf8;
                    font-weight: 700;
                }
                .sm-2d-layer-actions { display: flex; gap: 4px; }
                .sm-2d-layer-btn {
                    background: transparent; border: none; color: #64748b; cursor: pointer; font-size: 10.5px; padding: 2px;
                }
                .sm-2d-layer-btn:hover { color: #fff; }
                .sm-2d-layer-btn.hidden-layer { color: #ef4444; }
            `;
      document.head.appendChild(style);
    }

    // 2. Build 2D Header Toolbar
    const tb = document.createElement("div");
    tb.id = "sm-2d-game-toolbar";
    tb.className = "sm-2d-header-toolbar";
    tb.innerHTML = `
            <div class="sm-2d-toolbar-brand"><i class="fas fa-gamepad"></i> 2D</div>
            <div class="sm-2d-toolbar-sep"></div>
            <button type="button" class="sm-2d-btn" id="sm-2d-btn-sprite-studio" title="Open Sprite Sheet Studio">
                <i class="fas fa-scissors"></i> Studio
            </button>
            <button type="button" class="sm-2d-btn" id="sm-2d-btn-add-sprite" title="Add 2D Sprite to Scene">
                <i class="fas fa-plus"></i> Sprite
            </button>
            <button type="button" class="sm-2d-btn" id="sm-2d-btn-add-platform" title="Add Solid 2D Platform">
                <i class="fas fa-cube"></i> Platform
            </button>
            <div class="sm-2d-toolbar-sep"></div>
            <button type="button" class="sm-2d-btn" id="sm-2d-btn-layers" title="Toggle 2D Layer Manager">
                <i class="fas fa-layer-group"></i> Layers
            </button>
            <button type="button" class="sm-2d-btn active" id="sm-2d-btn-snap" title="Snap to 2D Grid">
                <i class="fas fa-magnet"></i> Snap
            </button>
            <button type="button" class="sm-2d-btn" id="sm-2d-btn-colliders" title="Toggle 2D Collider Wireframes">
                <i class="fas fa-shield-halved"></i> Colliders
            </button>
            <div class="sm-2d-toolbar-sep"></div>
            <button type="button" class="sm-2d-btn sm-2d-btn-play" id="sm-2d-btn-play" title="Play/Stop 2D Game Runtime [WASD / Space]">
                <i class="fas fa-play"></i> Play 2D
            </button>
        `;

    // Mount inside sm-panel-header with clean design and correct size
    const panelHeader =
      document.querySelector(".sm-viewport-panel.active .sm-panel-header") ||
      document.querySelector(".sm-viewport-panel .sm-panel-header") ||
      document.querySelector(".sm-panel-header");

    if (panelHeader) {
      const right = panelHeader.querySelector(".sm-panel-header-right");
      panelHeader.insertBefore(tb, right || null);
    } else {
      const container =
        document.getElementById("renderer-container") || document.body;
      container.appendChild(tb);
    }

    // 3. Inject 2D World HUD
    const container =
      document.getElementById("renderer-container") || document.body;
    const hud = document.createElement("div");
    hud.id = "sm-2d-world-hud";
    hud.className = "sm-2d-hud";
    hud.innerHTML = `
            <span id="sm-2d-hud-pos"><i class="fas fa-crosshairs"></i> X: 0.00, Y: 0.00</span>
            <span id="sm-2d-hud-cam"><i class="fas fa-video"></i> Cam: 0, 0</span>
            <span id="sm-2d-hud-layer"><i class="fas fa-layer-group"></i> Layer: Midground</span>
            <span id="sm-2d-hud-actors"><i class="fas fa-cubes"></i> 0 Actors</span>
        `;
    container.appendChild(hud);

    // 4. Inject Layers Panel (hidden by default)
    const lp = document.createElement("div");
    lp.id = "sm-2d-layers-panel";
    lp.className = "sm-2d-layers-panel";
    lp.style.display = "none";
    lp.innerHTML = `
            <div class="sm-2d-layers-header">
                <span><i class="fas fa-layer-group"></i> 2D Depth Layers</span>
                <button type="button" class="sm-2d-layer-btn" id="sm-2d-close-layers"><i class="fas fa-xmark"></i></button>
            </div>
            <div class="sm-2d-layer-row" data-layer="foreground" data-z="1">
                <span>Foreground (Z: 1)</span>
                <div class="sm-2d-layer-actions">
                    <button type="button" class="sm-2d-layer-btn toggle-vis" title="Toggle Visibility"><i class="fas fa-eye"></i></button>
                    <button type="button" class="sm-2d-layer-btn set-active" title="Set Active"><i class="fas fa-check"></i></button>
                </div>
            </div>
            <div class="sm-2d-layer-row active" data-layer="midground" data-z="0">
                <span>Midground / Play (Z: 0)</span>
                <div class="sm-2d-layer-actions">
                    <button type="button" class="sm-2d-layer-btn toggle-vis" title="Toggle Visibility"><i class="fas fa-eye"></i></button>
                    <button type="button" class="sm-2d-layer-btn set-active" title="Set Active"><i class="fas fa-check"></i></button>
                </div>
            </div>
            <div class="sm-2d-layer-row" data-layer="background" data-z="-2">
                <span>Background (Z: -2)</span>
                <div class="sm-2d-layer-actions">
                    <button type="button" class="sm-2d-layer-btn toggle-vis" title="Toggle Visibility"><i class="fas fa-eye"></i></button>
                    <button type="button" class="sm-2d-layer-btn set-active" title="Set Active"><i class="fas fa-check"></i></button>
                </div>
            </div>
            <div class="sm-2d-layer-row" data-layer="ui" data-z="10">
                <span>UI Overlay (Z: 10)</span>
                <div class="sm-2d-layer-actions">
                    <button type="button" class="sm-2d-layer-btn toggle-vis" title="Toggle Visibility"><i class="fas fa-eye"></i></button>
                    <button type="button" class="sm-2d-layer-btn set-active" title="Set Active"><i class="fas fa-check"></i></button>
                </div>
            </div>
            <div style="padding:6px 8px;background:#0b0e14;border-top:1px solid rgba(255,255,255,0.06);display:flex;gap:6px">
                <button type="button" class="sm-2d-btn" id="sm-2d-assign-layer-btn" style="flex:1;font-size:9.5px;justify-content:center;">
                    Move Selected to Layer
                </button>
            </div>
        `;
    container.appendChild(lp);

    // 5. Button Actions
    tb.querySelector("#sm-2d-btn-sprite-studio").addEventListener(
      "click",
      () => {
        if (window.openSpriteSheetEditor) {
          const src = window.getSelectedImageSource?.(window.selectedObject);
          window.openSpriteSheetEditor(
            src,
            window.selectedObject?.name || "spritesheet",
          );
        } else {
          console.warn("[Workspace] openSpriteSheetEditor not ready");
        }
      },
    );

    tb.querySelector("#sm-2d-btn-add-sprite").addEventListener("click", () => {
      this._spawnDefault2DSprite(scene);
    });

    tb.querySelector("#sm-2d-btn-add-platform").addEventListener(
      "click",
      () => {
        this._spawnDefault2DPlatform(scene);
      },
    );

    tb.querySelector("#sm-2d-btn-layers").addEventListener("click", () => {
      lp.style.display = lp.style.display === "none" ? "flex" : "none";
      tb.querySelector("#sm-2d-btn-layers").classList.toggle(
        "active",
        lp.style.display !== "none",
      );
    });

    lp.querySelector("#sm-2d-close-layers").addEventListener("click", () => {
      lp.style.display = "none";
      tb.querySelector("#sm-2d-btn-layers").classList.remove("active");
    });

    const snapBtn = tb.querySelector("#sm-2d-btn-snap");
    snapBtn.addEventListener("click", () => {
      window.sm2DGridSnap.enabled = !window.sm2DGridSnap.enabled;
      snapBtn.classList.toggle("active", window.sm2DGridSnap.enabled);
      snapBtn.innerHTML = window.sm2DGridSnap.enabled
        ? '<i class="fas fa-magnet"></i> Snap'
        : '<i class="fas fa-magnet"></i> Snap: Off';
    });

    const colBtn = tb.querySelector("#sm-2d-btn-colliders");
    colBtn.addEventListener("click", () => {
      if (window.SM2DCollisionSystem) {
        const active = window.SM2DCollisionSystem.toggleDebugDraw(scene);
        colBtn.classList.toggle("active", active);
      }
    });

    const playBtn = tb.querySelector("#sm-2d-btn-play");
    playBtn.addEventListener("click", () => {
      const rt = window.SM2DGameRuntime;
      if (!rt) return;
      if (rt.active) {
        rt.exit();
        playBtn.innerHTML = '<i class="fas fa-play"></i> Play 2D';
        playBtn.classList.remove("sm-2d-btn-stop");
        playBtn.classList.add("sm-2d-btn-play");
      } else {
        rt.enter({ scene, camera });
        playBtn.innerHTML = '<i class="fas fa-stop"></i> Stop 2D';
        playBtn.classList.remove("sm-2d-btn-play");
        playBtn.classList.add("sm-2d-btn-stop");
      }
    });

    // Layer rows interaction
    lp.querySelectorAll(".sm-2d-layer-row").forEach((row) => {
      row.addEventListener("click", (e) => {
        if (e.target.closest(".toggle-vis")) {
          const layer = row.dataset.layer;
          const isVis = !row.classList.contains("layer-hidden");
          row.classList.toggle("layer-hidden", isVis);
          row.querySelector(".toggle-vis i").className = isVis
            ? "fas fa-eye-slash"
            : "fas fa-eye";
          this._set2DLayerVisibility(scene, layer, !isVis);
          return;
        }
        lp.querySelectorAll(".sm-2d-layer-row").forEach((r) =>
          r.classList.remove("active"),
        );
        row.classList.add("active");
        window.sm2DActiveLayer = row.dataset.layer;
        const hudLayer = document.getElementById("sm-2d-hud-layer");
        if (hudLayer)
          hudLayer.innerHTML = `<i class="fas fa-layer-group"></i> Layer: ${row.dataset.layer.toUpperCase()}`;
      });
    });

    lp.querySelector("#sm-2d-assign-layer-btn").addEventListener(
      "click",
      () => {
        const sel = window.selectedObject;
        if (sel) {
          sel.userData = sel.userData || {};
          sel.userData.layer2D = window.sm2DActiveLayer || "midground";
          const activeRow = lp.querySelector(
            `.sm-2d-layer-row[data-layer="${window.sm2DActiveLayer}"]`,
          );
          const z = parseFloat(activeRow?.dataset?.z) || 0;
          sel.position.z = z;
          console.log(
            `[Workspace 2D] Assigned ${sel.name} to layer ${window.sm2DActiveLayer} (z: ${z})`,
          );
        }
      },
    );

    // 6. Camera Safe Zone Frame Helper
    this._add2DCameraSafeZoneGizmo(scene);

    // Adaptive 2D graph grid
    const graphGrid = scene.getObjectByName("gameModeGrid2D");

    if (graphGrid) {
      graphGrid.userData.adaptive = true;

      const update2DGraphGrid = () => {
        const activeCamera =
          camera || window.camera || window.orthographicCamera;

        if (!activeCamera) return;

        const renderer = window.renderer;

        const width =
          renderer?.domElement?.clientWidth || window.innerWidth || 1000;

        const height =
          renderer?.domElement?.clientHeight || window.innerHeight || 700;

        window.SM2DGraphGrid?.update?.(graphGrid, activeCamera, width, height);
      };

      this._2DGraphGridUpdate = update2DGraphGrid;

      // Initial build
      update2DGraphGrid();
    }
    // 7. Mouse Tracker on Canvas
    this._2dMouseMoveHandler = (e) => {
      const renderer = window.renderer;
      const cam = camera || window.camera;
      if (!renderer || !cam) return;
      const rect = renderer.domElement.getBoundingClientRect();
      const mouseX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const mouseY = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      const worldX = cam.position.x + (mouseX * (cam.right - cam.left)) / 2;
      const worldY = cam.position.y + (mouseY * (cam.top - cam.bottom)) / 2;

      const posEl = document.getElementById("sm-2d-hud-pos");
      if (posEl)
        posEl.innerHTML = `<i class="fas fa-crosshairs"></i> X: ${worldX.toFixed(2)}, Y: ${worldY.toFixed(2)}`;

      const camEl = document.getElementById("sm-2d-hud-cam");
      if (camEl)
        camEl.innerHTML = `<i class="fas fa-video"></i> Cam: ${cam.position.x.toFixed(1)}, ${cam.position.y.toFixed(1)}`;
    };
    window.addEventListener("mousemove", this._2dMouseMoveHandler);

    // 8. Snap TransformControls to 2D Grid
    if (window.transformControls) {
      this._2dTransformChangeHandler = () => {
        const sel = window.selectedObject;
        if (
          sel &&
          window.sm2DGridSnap?.enabled &&
          this.currentMode === "GAME_DEV" &&
          this._normalizeGameMode(this.currentGameMode) === "2D"
        ) {
          const step = window.sm2DGridSnap.size || 1.0;
          sel.position.x = Math.round(sel.position.x / step) * step;
          sel.position.y = Math.round(sel.position.y / step) * step;
        }
      };
      window.transformControls.addEventListener(
        "change",
        this._2dTransformChangeHandler,
      );
    }

    // 9. Dispatch Ready Event
    window.dispatchEvent(
      new CustomEvent("sm:2d-workspace-ready", {
        detail: { scene, camera, controls, workspaceManager: this },
      }),
    );
    console.log("✅ [WorkspaceManager] 2D Game Development Workspace Active.");
  }

  _remove2DGameWorkspace() {
    document.getElementById("sm-2d-game-toolbar")?.remove();
    document.getElementById("sm-2d-world-hud")?.remove();
    document.getElementById("sm-2d-layers-panel")?.remove();

    if (this._2dMouseMoveHandler) {
      window.removeEventListener("mousemove", this._2dMouseMoveHandler);
      this._2dMouseMoveHandler = null;
    }

    if (this._2dTransformChangeHandler && window.transformControls) {
      window.transformControls.removeEventListener(
        "change",
        this._2dTransformChangeHandler,
      );
      this._2dTransformChangeHandler = null;
    }

    if (window.transformControls) {
      window.transformControls.showX = true;
      window.transformControls.showY = true;
      window.transformControls.showZ = true;
    }

    if (window.SM2DGameRuntime?.active) {
      window.SM2DGameRuntime.exit();
    }

    this._remove2DCameraSafeZoneGizmo(window.scene);
    window.dispatchEvent(new CustomEvent("sm:2d-workspace-exit"));
  }

  _set2DLayerVisibility(scene = window.scene, layerName, visible) {
    if (!scene) return;
    scene.traverse((obj) => {
      if (obj.userData?.layer2D === layerName) {
        obj.visible = visible;
      }
    });
  }

  _add2DCameraSafeZoneGizmo(scene = window.scene) {
    if (!scene || !window.THREE) return;
    this._remove2DCameraSafeZoneGizmo(scene);

    // Standard 16:9 safe frame (width: 32, height: 18)
    const w = 32,
      h = 18;
    const pts = [
      -w / 2,
      -h / 2,
      0.01,
      w / 2,
      -h / 2,
      0.01,
      w / 2,
      -h / 2,
      0.01,
      w / 2,
      h / 2,
      0.01,
      w / 2,
      h / 2,
      0.01,
      -w / 2,
      h / 2,
      0.01,
      -w / 2,
      h / 2,
      0.01,
      -w / 2,
      -h / 2,
      0.01,
    ];

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    const mat = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.35,
      depthTest: false,
    });

    const gizmo = new THREE.LineSegments(geo, mat);
    gizmo.name = "SM2DCameraSafeZone";
    gizmo.userData = {
      isSystemObject: true,
      ignoreInTimeline: true,
      editorOnly: true,
    };
    scene.add(gizmo);
    if (window.SM2DGameRuntime?.active) gizmo.visible = false;

    // Editor-only safe frame:
    // visible while editing 2D, hidden during Play 2D runtime.
    const hideForPlay = () => {
      const frame = scene.getObjectByName?.("SM2DCameraSafeZone");
      if (frame) frame.visible = false;
    };
    const showAfterPlay = () => {
      const frame = scene.getObjectByName?.("SM2DCameraSafeZone");
      if (frame) frame.visible = true;
    };

    window.removeEventListener?.("sm:2d-runtime-start", hideForPlay);
    window.removeEventListener?.("sm:2d-runtime-stop", showAfterPlay);
    window.addEventListener?.("sm:2d-runtime-start", hideForPlay);
    window.addEventListener?.("sm:2d-runtime-stop", showAfterPlay);
  }

  _remove2DCameraSafeZoneGizmo(scene = window.scene) {
    const existing = scene?.getObjectByName?.("SM2DCameraSafeZone");
    if (existing) {
      existing.geometry?.dispose?.();
      existing.material?.dispose?.();
      existing.parent?.remove(existing);
    }
  }

  _spawnDefault2DSprite(scene = window.scene) {
    if (!scene || !window.THREE) return;

    // Default 2D sprite plane (2x2) with placeholder checkered/tinted material
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#0284c7";
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = "#38bdf8";
    ctx.fillRect(4, 4, 56, 56);
    ctx.fillStyle = "#fff";
    ctx.font = "24px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("2D", 32, 32);

    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;

    const geo = new THREE.PlaneGeometry(2, 2);
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);

    mesh.name = `Sprite2D_${Date.now().toString().slice(-4)}`;
    const z =
      window.sm2DActiveLayer === "foreground"
        ? 1
        : window.sm2DActiveLayer === "background"
          ? -2
          : 0;
    mesh.position.set(0, 0, z);

    mesh.userData = {
      is2DSprite: true,
      is2DActor: true,
      layer2D: window.sm2DActiveLayer || "midground",
      sprite2D: {
        pixelsPerUnit: 32,
        movementMode: "platformer",
        moveSpeed: 6,
        isPlayer: true,
      },
    };

    scene.add(mesh);
    window.selectedObject = mesh;
    window.transformControls?.attach?.(mesh);
    window.updateHierarchy?.();

    const actorsEl = document.getElementById("sm-2d-hud-actors");
    if (actorsEl) {
      let count = 0;
      scene.traverse((o) => {
        if (o.userData?.is2DSprite) count++;
      });
      actorsEl.innerHTML = `<i class="fas fa-cubes"></i> ${count} Actors`;
    }
    console.log(`[Workspace 2D] Created Sprite: ${mesh.name}`);
  }

  _spawnDefault2DPlatform(scene = window.scene) {
    if (!scene || !window.THREE) return;

    const geo = new THREE.PlaneGeometry(6, 1);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x475569,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);

    mesh.name = `Platform2D_${Date.now().toString().slice(-4)}`;
    mesh.position.set(0, -2, 0);

    mesh.userData = {
      is2DCollider: true,
      collisionType: "solid",
      layer2D: "midground",
    };

    scene.add(mesh);
    window.selectedObject = mesh;
    window.transformControls?.attach?.(mesh);
    window.updateHierarchy?.();
    console.log(`[Workspace 2D] Created Solid Platform: ${mesh.name}`);
  }

  _initUI() {
    this.modal = document.createElement("div");
    this.modal.id = "workspace-selector-modal";
    this.modal.className = "workspace-overlay";
    this._renderModal();
    document.body.appendChild(this.modal);
    this._bindEvents();
  }

  _renderModal() {
    const activeGameMode = this._getGameModeConfig();
    const modeBannerImages = {
      FILM: "js/app/modes-images/film_content.png",
      GAME_DEV: "js/app/modes-images/game_dev.png",
      GAMEPLAY_SAMPLE: "js/app/modes-images/gameplay_sample.png",
      TERRAIN: "js/app/modes-images/terrain_sculpting.png",
      METAHUMAN: "js/app/modes-images/film_content.png",
    };
    const activeModeKey = this.modes[this.currentMode]
      ? this.currentMode
      : "FILM";
    const modeBannerImage = modeBannerImages[activeModeKey];
    const modeBannerClass =
      activeModeKey === "FILM"
        ? "film-banner"
        : activeModeKey === "TERRAIN"
          ? "terrain-banner"
          : activeModeKey === "GAMEPLAY_SAMPLE"
            ? "gameplay-sample-banner"
            : activeModeKey === "METAHUMAN"
              ? "metahuman-banner"
              : "game-banner";
    const projectRows =
      this.projects.length === 0
        ? `<div class="ws-empty">No recently opened files</div>`
        : this.projects
            .map(
              (project) => `
<div class="ws-project-item" data-id="${project.id}">
<i class="fas ${this.modes[project.mode]?.icon || "fa-file"} ws-proj-icon"></i>
<span class="ws-proj-name">${project.name}</span>
<span class="ws-proj-date">${new Date(project.date).toLocaleDateString()}</span>
<div class="ws-proj-actions">
<button class="ws-proj-btn load" title="Open"><i class="fas fa-folder-open"></i></button>
<button class="ws-proj-btn delete" title="Delete"><i class="fas fa-trash"></i></button>
</div>
</div>`,
            )
            .join("");
    let info = "";
    if (this.currentMode === "FILM") {
      info = `
<div class="info-desc">Clean studio viewport for creation and rendering.</div>
<ul class="ws-feature-list">
<li><i class="fas fa-check"></i> Studio lighting</li>
<li><i class="fas fa-check"></i> Grid only — no game environment</li>
<li><i class="fas fa-check"></i> Production tools enabled</li>
</ul>`;
    } else if (this.currentMode === "GAMEPLAY_SAMPLE") {
      info = `
<div class="info-desc">Purple UE-style gameplay test playground.</div>
<ul class="ws-feature-list">
<li><i class="fas fa-check"></i> Purple background and fog</li>
<li><i class="fas fa-check"></i> Gameplay sample obstacles</li>
<li><i class="fas fa-check"></i> Player and physics testing</li>
</ul>`;
    } else if (this.currentMode === "TERRAIN") {
      info = `
<div class="info-desc">Landscape workspace for terrain creation and sculpting.</div>
<ul class="ws-feature-list">
<li><i class="fas fa-check"></i> Terrain tools</li>
<li><i class="fas fa-check"></i> Sky and landscape lighting</li>
<li><i class="fas fa-check"></i> Game objects hidden</li>
</ul>`;
    } else if (this.currentMode === "METAHUMAN") {
      info = `
<div class="info-desc">
    Create and customize digital humans for your projects.
</div>
<ul class="ws-feature-list">
    <li><i class="fas fa-check"></i> Body customization</li>
    <li><i class="fas fa-check"></i> Face & facial features</li>
    <li><i class="fas fa-check"></i> Hair, clothing & materials</li>
    <li><i class="fas fa-check"></i> Posing & animation</li>
</ul>`;
    } else {
      info = `
<div class="info-desc">SM Engine game-development viewport.<br><span style="color:#8ea1b7;font-size:11px">${activeGameMode.description}</span></div>
<ul class="ws-feature-list">
<li><i class="fas fa-check"></i> Sky atmosphere</li>
<li><i class="fas fa-check"></i> Player & horse controllers</li>
<li><i class="fas fa-check"></i> Physics and game lighting</li>
</ul>`;
    }
    this.modal.innerHTML = `
<div class="workspace-window ws-layout blender-splash">
<div class="blender-banner ${modeBannerClass}" style="background-image:linear-gradient(180deg,rgba(0,0,0,.48) 0%,rgba(0,0,0,.12) 46%,rgba(0,0,0,.72) 100%),url('${modeBannerImage}')">
<div class="blender-top-bar">
<div class="blender-logo">SM <strong>ENGINE</strong></div>
<button class="blender-close" id="ws-close-x"><i class="fas fa-times"></i></button>
</div>
<div class="blender-version">v1.0</div>
</div>
<div class="blender-content">
<div class="blender-col">
<div class="blender-col-header">New File</div>
<div class="blender-list">
<div class="ws-mode-card blender-list-item ${this.currentMode === "FILM" ? "ws-active" : ""}" data-mode="FILM">
<i class="fas fa-video"></i><span>Filming & Content</span>
</div>
<div class="ws-mode-card blender-list-item ${this.currentMode === "GAME_DEV" ? "ws-active" : ""}" data-mode="GAME_DEV">
<i class="fas fa-gamepad"></i><span>Game Development</span>
</div>
<div class="ws-mode-card blender-list-item ${this.currentMode === "GAMEPLAY_SAMPLE" ? "ws-active" : ""}" data-mode="GAMEPLAY_SAMPLE">
<i class="fas fa-cubes"></i><span>Gameplay Sample</span>
</div>
<div class="ws-mode-card blender-list-item ${this.currentMode === "TERRAIN" ? "ws-active" : ""}" data-mode="TERRAIN">
<i class="fas fa-mountain"></i><span>Terrain Sculpting</span>
</div>
<div class="ws-mode-card blender-list-item ${this.currentMode === "METAHUMAN" ? "ws-active" : ""}" data-mode="METAHUMAN">
    <i class="fas fa-user"></i>
    <span>MetaHuman Creator</span>
</div>
</div>
<div class="blender-submodes ${this.currentMode === "GAME_DEV" ? "show" : ""}">
<div class="blender-col-header" style="margin-top:16px;font-size:11px">Viewport Type</div>
<div class="ws-game-submode-buttons">
<button type="button" class="ws-game-submode-btn ${activeGameMode.label === "2D" ? "active" : ""}" data-game-mode="2D">2D</button>
<button type="button" class="ws-game-submode-btn ${activeGameMode.label === "2.5D" ? "active" : ""}" data-game-mode="2.5D">2.5D</button>
<button type="button" class="ws-game-submode-btn ${activeGameMode.label === "3D" ? "active" : ""}" data-game-mode="3D">3D</button>
</div>
</div>
<div class="blender-create-box">
<input type="text" id="ws-new-name" placeholder="Untitled Project..." class="blender-input">
<select id="ws-new-mode" style="display:none">
<option value="FILM" ${this.currentMode === "FILM" ? "selected" : ""}></option>
<option value="GAME_DEV" ${this.currentMode === "GAME_DEV" ? "selected" : ""}></option>
<option value="GAMEPLAY_SAMPLE" ${this.currentMode === "GAMEPLAY_SAMPLE" ? "selected" : ""}></option>
<option value="TERRAIN" ${this.currentMode === "TERRAIN" ? "selected" : ""}></option>
<option value="METAHUMAN" ${this.currentMode === "METAHUMAN" ? "selected" : ""}></option>
</select>
<select id="ws-new-game-mode" style="display:none">
<option value="${activeGameMode.label}" selected></option>
</select>
<button id="ws-create-btn" class="blender-btn primary">Create</button>
</div>
</div>
<div class="blender-col blender-recent-col">
<div class="blender-col-header">Recent Files</div>
<div class="ws-project-list">${projectRows}</div>
</div>
<div class="blender-col info-col">
<div class="blender-col-header">Workspace Info</div>
<div class="blender-info-content">${info}</div>
<div class="blender-actions">
<button id="ws-cancel-btn" class="blender-btn">Close Setup</button>
</div>
</div>
</div>
</div>
<style>
.workspace-overlay{position:fixed;inset:0;z-index:99999;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.5);backdrop-filter:blur(4px)}
.workspace-overlay.active{display:flex}
.workspace-window.blender-splash{width:760px;background:#2b2b2b;color:#ccc;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:13px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 30px 90px rgba(0,0,0,.6),0 0 0 1px rgba(255,255,255,.05)}
.blender-banner{height:220px;position:relative;background-color:#18202c;background-size:cover;background-position:center;border-bottom:1px solid #1a1a1a}
.blender-top-bar{position:absolute;top:0;left:0;right:0;padding:16px 20px;display:flex;justify-content:space-between;align-items:center}
.blender-logo{font-size:18px;color:#fff}
.blender-close{background:transparent;border:0;color:#ddd;cursor:pointer}
.blender-version{position:absolute;bottom:12px;right:20px;color:#bbb;font-size:12px}
.blender-content{display:flex;height:300px}
.blender-col{flex:1;padding:20px;display:flex;flex-direction:column;border-right:1px solid #1a1a1a}
.blender-col:last-child{border-right:0}
.blender-col-header{font-size:14px;color:#fff;margin-bottom:12px}
.blender-list-item{padding:6px 10px;cursor:pointer;display:flex;align-items:center;gap:10px;color:#ccc}
.blender-list-item:hover{background:rgba(255,255,255,.06)}
.blender-list-item.ws-active{background:#4772b3;color:#fff}
.blender-submodes{display:none;margin-top:8px}
.blender-submodes.show{display:block}
.ws-game-submode-buttons{display:flex;background:#1d1d1d;overflow:hidden}
.ws-game-submode-btn{flex:1;background:transparent;border:0;border-right:1px solid #111;color:#999;padding:6px 0;cursor:pointer}
.ws-game-submode-btn.active{background:#4772b3;color:#fff}
.blender-create-box{margin-top:auto;display:flex;flex-direction:column;gap:8px}
.blender-input{background:#1d1d1d;border:1px solid #141414;color:#fff;padding:8px 10px;width:100%;box-sizing:border-box}
.blender-btn{background:#414141;border:0;color:#ccc;padding:7px 14px;cursor:pointer;width:100%}
.blender-btn.primary{background:#4772b3;color:#fff}
.ws-project-list{overflow-y:auto;flex:1;display:flex;flex-direction:column;gap:2px}
.ws-project-item{padding:6px 10px;display:flex;align-items:center;gap:8px;position:relative}
.ws-project-item:hover{background:rgba(255,255,255,.06)}
.ws-proj-icon{color:#888;width:14px;text-align:center}
.ws-proj-name{color:#ddd;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ws-proj-date{color:#777;font-size:11px}
.ws-proj-actions{display:none;position:absolute;right:6px;gap:4px;background:#333;padding:2px}
.ws-project-item:hover .ws-proj-actions{display:flex}
.ws-proj-btn{background:none;border:0;color:#aaa;cursor:pointer;padding:4px 6px}
.ws-empty{padding:12px 0;color:#777;font-style:italic}
.info-desc{color:#aaa;margin-bottom:12px;line-height:1.5}
.ws-feature-list{list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:6px}
.ws-feature-list li{color:#ccc;display:flex;align-items:center;gap:8px}
.ws-feature-list li i.fa-check{color:#6db347}
.blender-actions{margin-top:auto}
</style>`;
  }

  _bindEvents() {
    if (this._eventsBound) return;
    this._eventsBound = true;
    this.modal.addEventListener("click", (event) => {
      const gameModeBtn = event.target.closest(".ws-game-submode-btn");
      if (gameModeBtn) {
        this.setGameMode(gameModeBtn.dataset.gameMode, {
          applyViewport: this.currentMode === "GAME_DEV",
          showToast: false,
        });
        this._renderModal();
        this._syncGameViewportUi();
        return;
      }
      const card = event.target.closest(".ws-mode-card");
      if (card) {
        this.setMode(card.dataset.mode);
        this.close();
        return;
      }
      if (event.target.closest(".ws-proj-btn.load")) {
        this._loadProject(event.target.closest(".ws-project-item").dataset.id);
        this.close();
        return;
      }
      if (event.target.closest(".ws-proj-btn.delete")) {
        this._deleteProject(
          event.target.closest(".ws-project-item").dataset.id,
        );
        return;
      }
      if (event.target.closest("#ws-create-btn")) {
        this._createProject();
        return;
      }
      if (
        event.target.closest("#ws-cancel-btn") ||
        event.target.closest("#ws-close-x")
      ) {
        this.close();
        return;
      }
      if (event.target === this.modal) {
        this.close();
      }
    });

    this.modal.addEventListener("change", (event) => {
      if (event.target.id === "ws-new-mode") {
        this._syncProjectModeInputs();
        return;
      }
      if (event.target.id === "ws-new-game-mode") {
        this.setGameMode(event.target.value, {
          applyViewport: this.currentMode === "GAME_DEV",
          showToast: false,
        });
        this._syncGameViewportUi();
      }
    });
  }

  show() {
    this._renderModal();
    this._syncGameViewportUi();
    this.modal.classList.add("active");
  }

  close() {
    this.modal?.classList.remove("active");
  }

  setGameMode(modeKey, options = {}) {
    const { applyViewport = true, persist = true, showToast = true } = options;
    const normalizedMode = this._normalizeGameMode(modeKey);
    if (normalizedMode !== "2D") {
      window.SM2DGameRuntime?.exit?.();
    }
    this.currentGameMode = normalizedMode;
    window.SMViewportSystem?.rememberWorkspaceForActiveViewport?.(
      this.currentMode || "GAME_DEV",
      normalizedMode,
    );
    if (persist) {
      localStorage.setItem("sm_game_dev_mode", normalizedMode);
    }
    if (this.activeProject?.mode === "GAME_DEV") {
      this.activeProject.gameMode = normalizedMode;
      this.saveProjects();
    }
    this._syncGameViewportUi();
    this._updateHeaderIndicator(this.currentMode || "GAME_DEV");
    if (applyViewport && this.currentMode === "GAME_DEV") {
      this._applyGameViewportMode();
      window.SMViewportSystem?.rememberWorkspaceForActiveViewport?.(
        "GAME_DEV",
        normalizedMode,
        { captureCamera: true },
      );
      if (showToast) {
        this._toast(
          `Game viewport set to ${this._getGameModeLabel(normalizedMode)}`,
        );
      }
    }
    return normalizedMode;
  }

  setMode(modeKey) {
    if (!this.modes[modeKey]) return;
    const first = this.currentMode === null;
    const changed = this.currentMode !== modeKey;
    const previousMode = this.currentMode;

    if (changed) {
      try {
        window.exit2DAnimationMode?.();
      } catch {}
      document.body.classList.remove(
        "animation-2d-mode-active",
        "animation-2d-compact",
        "animation-2d-panel-collapsed",
      );
    }

    this.currentMode = modeKey;
    if (changed) {
      this._lastRuntimePhysicsEnabled = null;
    }

    this._viewportApplyToken += 1;
    const token = this._viewportApplyToken;

    if (modeKey !== "TERRAIN") {
      this._terrainCreateEpoch += 1;
      if (this._terrainCreateRAF) {
        cancelAnimationFrame(this._terrainCreateRAF);
        this._terrainCreateRAF = 0;
      }
      this._terrainCreatePending = false;
    }

    const transitionCoordinator = window.smWorkspaceTransitionCoordinator;
    this._workspaceTransitionId =
      transitionCoordinator?.begin?.({
        from: previousMode,
        to: modeKey,
        scene: window.scene,
        managerToken: token,
      }) || this._workspaceTransitionId + 1;

    window.smWorkspaceVisibilityAuthority?.setMode?.(modeKey, {
      scene: window.scene,
      transitionId: this._workspaceTransitionId,
    });

    localStorage.setItem("sm_workspace_mode", modeKey);

    const isGameDev = modeKey === "GAME_DEV";
    const isGameplaySample = modeKey === "GAMEPLAY_SAMPLE";
    const isTerrain = modeKey === "TERRAIN";
    const isFilm = modeKey === "FILM";

    this._visibilityEnforceUntil = Date.now() + 3500;
    this._lastVisibilityMode = null;

    if (!isTerrain && previousMode === "TERRAIN") {
      window.SculptingPanel?.close?.();
      window.setActiveTerrainTool?.(null);
    }

    if (!(isTerrain && this._hasTerrainPlayerAdded())) {
      window.playerSystem?.setWorkspaceMode?.(modeKey);
    }

    window.setGameDevelopmentEnvironmentMode?.(modeKey);
    window.SMUE5Environment?.syncVisibility?.(modeKey);
    this._syncRuntimePhysics(true);
    this._syncSkyForWorkspace(modeKey, window.scene);

    if (!isGameDev) {
      window.SM2DGameRuntime?.exit?.();
      window.stopGamePreview?.();
    }

    this._applyViewport(this.modes[modeKey].settings, modeKey, token);

    window.SMViewportSystem?.rememberWorkspaceForActiveViewport?.(
      modeKey,
      this.currentGameMode,
      { captureCamera: true },
    );

    this._adjustUI(modeKey);
    this._updateHeaderIndicator(modeKey);
    this._syncGameViewportUi();
    this._scheduleViewportRepair(modeKey, token);

    const repairWorkspaceState = () => {
      if (this.currentMode !== modeKey || this._viewportApplyToken !== token)
        return;
      if (!(isTerrain && this._hasTerrainPlayerAdded())) {
        window.playerSystem?.setWorkspaceMode?.(modeKey);
      } else {
        this._syncTerrainPlayerTestState(true);
      }

      window.setGameDevelopmentEnvironmentMode?.(modeKey);
      window.SMUE5Environment?.syncVisibility?.(modeKey);
      this._syncRuntimePhysics(false);
      this._syncSkyForWorkspace(modeKey, window.scene);

      if (isFilm || isGameDev) {
        window.gameplaySampleEnvironment?.deactivate?.();
      }
      if (isGameplaySample) {
        window.SMUE5Environment?.hide?.();
      }
      if (isTerrain) {
        window.SMUE5Environment?.hide?.();
        window.gameplaySampleEnvironment?.deactivate?.();
      }

      this._syncWorkspaceObjectVisibility(modeKey, window.scene);
      this.enforceWorkspaceVisibility(modeKey, window.scene);
      window.smWorkspaceVisibilityAuthority?.enforce?.(window.scene, {
        scan: false,
      });
    };

    requestAnimationFrame(repairWorkspaceState);
    setTimeout(repairWorkspaceState, 100);
    setTimeout(repairWorkspaceState, 500);

    transitionCoordinator?.schedule?.(
      this._workspaceTransitionId,
      repairWorkspaceState,
      { mode: modeKey },
    );
    transitionCoordinator?.commit?.(this._workspaceTransitionId, {
      managerToken: token,
    });

    window.dispatchEvent(
      new CustomEvent("sm:workspace-manager-mode-applied", {
        detail: {
          mode: modeKey,
          previousMode,
          token,
          transitionId: this._workspaceTransitionId,
        },
      }),
    );

    if (!first && changed) {
      this._toast(`Switched to ${this.modes[modeKey].name}`);
    }
    console.log(`[SM Engine] Workspace → ${modeKey}`);
  }

  _scheduleViewportRepair(modeKey, token) {
    this._viewportRepairTimers.forEach((id) => clearTimeout(id));
    this._viewportRepairTimers = [];
    [250, 800, 1800].forEach((delay) => {
      this._viewportRepairTimers.push(
        setTimeout(() => {
          if (
            this.currentMode !== modeKey ||
            this._viewportApplyToken !== token
          )
            return;
          this._applyViewport(
            this.modes[modeKey].settings,
            modeKey,
            token,
            true,
          );
          window.smWorkspaceVisibilityAuthority?.enforce?.(window.scene, {
            scan: true,
          });
        }, delay),
      );
    });
  }

  _applyViewport(
    settings,
    modeKey = this.currentMode,
    applyToken = this._viewportApplyToken,
    repair = false,
  ) {
    const scene = window.scene;
    if (!scene || typeof THREE === "undefined") return;

    if (modeKey !== this.currentMode || applyToken !== this._viewportApplyToken)
      return;

    if (this._terrainModeActive && modeKey !== "TERRAIN") {
      this._restoreFromTerrainMode(scene, modeKey);
    }

    if (modeKey === "FILM") {
      this._setupFilmViewport(scene, settings, repair);
    } else if (modeKey === "GAME_DEV") {
      this._setupGameViewport(scene, settings, repair);
    } else if (modeKey === "GAMEPLAY_SAMPLE") {
      this._setupGameplaySampleViewport(scene, settings, repair);
    } else if (modeKey === "TERRAIN") {
      this._setupTerrainViewport(scene, settings, repair);
      if (!window.SculptingPanel?.isOpen) {
        window.requestTerrainSculptingWorkspace?.();
      }
    } else if (modeKey === "METAHUMAN") {
      this._setupMetaHumanViewport(scene, settings, repair);
    }
    this._syncWorkspaceObjectVisibility(modeKey, scene);
  }

  _isSkyObject(obj) {
    if (!obj) return false;
    if (window.smWorkspaceEnvironmentAdapter?.isEnvironmentObject?.(obj))
      return true;
    const name = String(obj.name || "");
    const hdr = window.smHDRSkySystem;
    const sun = window.smSunController;
    return !!(
      obj === hdr?.root ||
      obj === hdr?.hdriProxy ||
      obj === hdr?.sunLight ||
      obj === hdr?.sunTarget ||
      obj === hdr?.hemiLight ||
      obj === sun?.light ||
      obj === sun?.targetObject ||
      obj === sun?.rigProxy ||
      obj.userData?.isHDRSkyRoot === true ||
      obj.userData?.isHDRSkyProxy === true ||
      obj.userData?.isHDRSkyLight === true ||
      obj.userData?.isHDRSkyTarget === true ||
      obj.userData?.isSMSunLight === true ||
      obj.userData?.isSMSunTarget === true ||
      obj.userData?.isSMSunRigProxy === true ||
      obj.userData?.keepForSky === true ||
      obj.userData?.isSkyLightingObject === true ||
      name === "Environment" ||
      name === "Sun Light" ||
      name === "Sun Target" ||
      name === "Sun Rig" ||
      name === "HDRI Fill Light" ||
      name.startsWith("HDRI Sky")
    );
  }

  _hideSky(scene = window.scene) {
    if (!scene) return;
    window.smSkyLayerVisible = false;
    const environmentAdapter = window.smWorkspaceEnvironmentAdapter;
    if (environmentAdapter) {
      environmentAdapter.setLightRigVisible?.(false);
      const is2DGame =
        String(this.currentMode || "").toUpperCase() === "GAME_DEV" &&
        this._normalizeGameMode(this.currentGameMode) === "2D";
      if (!is2DGame) {
        environmentAdapter.restoreHDR?.(scene);
        return;
      }
      // In a sprite game the HDR map is neither a background nor a
      // reflection environment. Do not let the adapter restore it.
      scene.environment = null;
      scene.background = null;
    }
    const system = window.skyLightingSystem;
    try {
      system?.setVisible?.(false);
    } catch {}

    const hideObject = (obj) => {
      if (!obj) return;
      obj.visible = false;
      obj.traverse?.((child) => {
        child.visible = false;
      });
    };
    hideObject(system?.sunLight);
    hideObject(system?.hemiLight);
    hideObject(system?.ambientLight);
    hideObject(system?.fillLight);
    hideObject(system?.sky);
    hideObject(system?.skyMesh);
    hideObject(system?.skySphere);
    hideObject(system?.atmosphere);
    hideObject(system?.clouds);
    hideObject(system?.stars);
    hideObject(window.sky);
    hideObject(window.AdvancedSky);
    scene.traverse((obj) => {
      if (this._isSkyObject(obj)) {
        obj.visible = false;
        obj.traverse?.((child) => {
          child.visible = false;
        });
      }
    });
  }

  _showSky(scene = window.scene, profile = "ue5-editor") {
    if (!scene) return false;
    window.smSkyLayerVisible = true;
    const environmentAdapter = window.smWorkspaceEnvironmentAdapter;
    if (environmentAdapter) {
      environmentAdapter.apply?.(
        this.currentMode || (profile === "terrain" ? "TERRAIN" : "GAME_DEV"),
        scene,
      );
      return true;
    }
    const system = window.skyLightingSystem;
    const hasExternalEnvironment = !!(
      window.smActiveHDRI?.texture || system?._externalEnvTexture
    );
    if (!system) {
      this._restoreGameSky?.(scene, { profile });
      return true;
    }
    try {
      system.ensureRigAttached?.();
      system.applyWorkspaceProfile?.(profile);
      system.setVisible?.(true);
      system.refreshShadows?.();
      system.update?.(0);
    } catch (error) {
      console.warn("[Workspace] Could not show sky:", error);
    }

    const showObject = (obj) => {
      if (!obj) return;
      obj.visible = true;
      obj.frustumCulled = false;
      obj.traverse?.((child) => {
        child.visible = true;
        child.frustumCulled = false;
      });
    };
    showObject(system.sunLight);
    showObject(system.hemiLight);
    showObject(system.ambientLight);
    showObject(system.fillLight);

    if (!hasExternalEnvironment) {
      showObject(system.sky);
      showObject(system.skyMesh);
      showObject(system.skySphere);
      showObject(system.atmosphere);
      showObject(system.clouds);
      showObject(system.stars);
      showObject(window.sky);
      showObject(window.AdvancedSky);
    } else {
      system._applyExternalEnvironmentVisualState?.();
    }

    const skyMesh =
      scene.getObjectByName("SkyMesh") ||
      scene.getObjectByName("SkySphere") ||
      system.skyMesh ||
      system.sky ||
      window.sky ||
      window.AdvancedSky;
    if (skyMesh && !hasExternalEnvironment) {
      scene.background = null;
    }
    if (hasExternalEnvironment) this._restoreActiveHDRI(scene);
    return true;
  }

  _syncSkyForWorkspace(modeKey = this.currentMode, scene = window.scene) {
    if (!scene) return false;
    const mode = String(modeKey || this.currentMode || "FILM").toUpperCase();
    if (
      mode === "GAME_DEV" &&
      this._normalizeGameMode(this.currentGameMode) === "2D"
    ) {
      this._disable2DHDRIAndSky(scene);
      return false;
    }
    if (mode === "METAHUMAN") {
      this._hideSky(scene);
      this._hideGameDevelopmentEnvironment(scene);
      scene.background = new THREE.Color(
        this.modes?.METAHUMAN?.settings?.background || "#d2d9e3",
      );
      scene.environment = null;
      return false;
    }

    const adapter = window.smWorkspaceEnvironmentAdapter;
    if (adapter) {
      adapter.apply?.(mode, scene);
      if (mode !== "GAME_DEV") {
        this._hideGameDevelopmentEnvironment(scene);
      }
      if (mode === "GAME_DEV") {
        window.ensureGameDevelopmentEnvironment?.(scene);
        window.SMUE5Environment?.syncVisibility?.("GAME_DEV");
      }
      if (mode === "FILM") {
        this._applyFilmFog(scene);
      }
      return true;
    }

    const skyAllowed = mode === "GAME_DEV" || mode === "TERRAIN";
    if (!skyAllowed) {
      this._hideSky(scene);
      this._hideGameDevelopmentEnvironment(scene);
      if (mode === "FILM") {
        const filmBackground =
          this.modes?.FILM?.settings?.background || "#1c1c1c";
        const restoredHDRI = this._restoreActiveHDRI(scene);
        if (!restoredHDRI) scene.background = new THREE.Color(filmBackground);
        this._applyFilmFog(scene);
      }
      if (mode === "GAMEPLAY_SAMPLE") {
        scene.background = new THREE.Color(0x8177ad);
      }
      return false;
    }

    if (mode === "TERRAIN") {
      this._hideGameDevelopmentEnvironment(scene);
      this._showSky(scene, "terrain");
      return true;
    }

    window.ensureGameDevelopmentEnvironment?.(scene);
    window.SMUE5Environment?.syncVisibility?.("GAME_DEV");
    this._showSky(scene, "ue5-editor");
    return true;
  }

  _setupFilmViewport(scene, settings = {}, repair = false) {
    if (!scene) return;
    try {
      window.switchToPerspectiveFromOrtho?.();
    } catch {}
    this._clearFilmSolidPresentation(scene);
    scene.overrideMaterial = null;
    window.setGameDevelopmentPhysicsEnabled?.(false);
    this._hideSky(scene);
    this._hideGameplaySampleEnvironment(scene);
    this._hideGameDevelopmentEnvironment(scene);
    this._setGameObjectsVisible(false, { keepPlayer: true });
    window.setPlayerModelEnabled?.(true, { loadIfNeeded: true });
    this._removeRuntimeLights(scene, {
      preserveSky: true,
      preserveGameplaySample: true,
    });
    this._removeStudioLights(scene);
    this._sanitizeSystemHemisphereLights(scene, { visible: false });
    this._addStudioLights(scene);
    this._ensureGridVisible(true);
    this._setEditorGridVisible(scene, true);
    this._removeNamedGridHelper(scene, "gameModeGrid2D");
    this._setAuxiliaryViewportObjectsVisible(false);
    this._removeSceneAddBlocker();

    const filmBackground =
      settings.background ||
      this.modes?.FILM?.settings?.background ||
      "#1c1c1c";
    const restoreFilmBackground = () => {
      const restoredHDRI = this._restoreActiveHDRI(scene, {
        asBackground: true,
        asEnvironment: true,
      });
      if (!restoredHDRI) {
        if (!scene.background || scene.background?.isTexture) {
          scene.background = new THREE.Color(filmBackground);
        }
        window.renderer?.setClearColor?.(filmBackground, 1);
      }
      return restoredHDRI;
    };
    restoreFilmBackground();
    this._applyFilmFog(scene);
    this._applyWorkspaceDefaultShading("FILM", { repair });
    this._setWorkspaceExposure(
      this._getWorkspaceRenderProfile("FILM").exposure,
    );

    // === Solid mode بحال Blender: بدون shadows ===
    if (
      window.SMViewportShading?.getMode?.() === "solid" ||
      this.modes.FILM.settings.defaultShading === "solid"
    ) {
      this._setSolidModeShadowsEnabled(false);
    }
    window.HDRIHierarchyBridge?.sync?.();
    window.SMViewportShading?.preview?.();
  }

  _setupGameViewport(scene, settings = {}, repair = false) {
    if (!scene) return;

    const renderer = window.renderer;
    const isGame3DOr25D =
      this._normalizeGameMode(this.currentGameMode) !== "2D";

    // ------------------------------------------------------------------
    // 1. Clean previous film / sample state
    // ------------------------------------------------------------------
    this._clearFilmSolidPresentation(scene);
    scene.overrideMaterial = null;

    // ------------------------------------------------------------------
    // 2. AAA / UE5-Calibrated Color, Tone Mapping & Shadow Pipeline
    // ------------------------------------------------------------------
    this._applyWorkspaceDefaultShading("GAME_DEV", { repair });

    // Renderer state is owned by the render core / settings pipeline.
    // Do not mutate tone mapping, exposure, pixel ratio or shadow-map type here.

    this._setWorkspaceExposure(settings.exposure ?? 1.15);

    // ------------------------------------------------------------------
    // 3. Clear conflicting workspace fixtures
    // ------------------------------------------------------------------
    this._hideGameplaySampleEnvironment(scene);
    this._removeStudioLights(scene);
    this._removeRuntimeLights(scene, {
      preserveSky: true,
      preserveGameplaySample: true,
    });
    this._removeFilmGrid(scene);
    this._setAuxiliaryViewportObjectsVisible(false);

    // ------------------------------------------------------------------
    // 4. Ensure Game Development Environment exists
    // ------------------------------------------------------------------
    const environment =
      window.ensureGameDevelopmentEnvironment?.(scene) ||
      window.SMUE5Environment ||
      null;

    if (environment) {
      if (isGame3DOr25D) {
        environment.show?.();
      }
      environment.syncVisibility?.("GAME_DEV");
    }

    // ------------------------------------------------------------------
    // 5. 2D Mode branch (Flat sprite world, no PBR sky)
    // ------------------------------------------------------------------
    if (!isGame3DOr25D) {
      environment?.hide?.();
      this._setGameDevEnvironmentVisible(scene, false);
      this._hideSky(scene);
      this._disable2DHDRIAndSky(scene);

      scene.environment = null; // Detach PBR specular probes for pure 2D

      window.setGameDevelopmentPhysicsEnabled?.(false);
      window.setPlayerModelEnabled?.(false, { loadIfNeeded: false });
      window.playerSystem?.setRuntimeControlActive?.(false);

      this._applyGameViewportMode();
      return;
    }

    // ------------------------------------------------------------------
    // 6. 3D / 2.5D: Physical Sky, HDRI Environment Map & Reflection Probe
    // ------------------------------------------------------------------
    window.setGameDevelopmentPhysicsEnabled?.(true);

    // Mount atmospheric physical sky and capture PMREM reflection probe
    this._showSky(scene, "ue5-editor");
    this._setupPBROnDemandEnvironment(scene);

    // Player activation & physics binding
    window.setPlayerModelEnabled?.(settings.player !== false, {
      loadIfNeeded: settings.player !== false,
    });

    if (window.player && settings.player !== false) {
      window.player.inputEnabled = true;
      window.player.gravityEnabled = true;
      window.player.lockZPosition =
        this._normalizeGameMode(this.currentGameMode) === "2.5D";
      window.player.activate?.();
      window.player.mixer?.update?.(0.016);
    }

    // ------------------------------------------------------------------
    // 7. Cinematic Directional Sun & Ambient Bounce Lighting
    // ------------------------------------------------------------------
    this._sanitizeSystemHemisphereLights(scene, { visible: true });
    window.dedupeHemisphereLights?.({ preserveCustomLights: false });

    // Instantiates Sun, Ambient Bounce, and fills
    this._addGameLights(scene);
    this._boostGameDevelopmentLighting(scene);

    // Fine-tune shadow parameters on the primary directional light (Removes shadow acne)
    this._optimizeSunShadowParameters(scene);

    // Sync all lighting ownership
    this._syncWorkspaceLighting("GAME_DEV", scene);

    // ------------------------------------------------------------------
    // 8. Camera, Viewport Layout & Ground Contact
    // ------------------------------------------------------------------
    this._applyGameViewportMode();

    window.smSunController?.light?.shadow && (window.smSunController.light.shadow.needsUpdate = true);
    window.smHDRSkySystem?.refreshShadows?.();

    // ------------------------------------------------------------------
    // 9. AAA Post-Processing Stack (SSAO + Unreal Bloom + Vignette)
    // ------------------------------------------------------------------
    this._configurePostProcessStack();
  }

  /**
   * Ensures PBR metals, glass, and rough surfaces have high-fidelity reflections.
   */
  _setupPBROnDemandEnvironment(scene) {
    if (!scene) return;

    // If an HDRI manager exists, route PMREM probe to scene.environment
    const hdriManager = window.SMHDRIManager || window.hdriManager;
    if (hdriManager && typeof hdriManager.getActiveTexture === "function") {
      const envTexture = hdriManager.getActiveTexture();
      if (envTexture) {
        scene.environment = envTexture;
        scene.environmentIntensity = 1.0; // Modern Three.js supports environment intensity
        return;
      }
    }

    // Fallback: If sky creates a texture or PMREM cube generator is available
    if (
      window.renderer &&
      scene.background &&
      scene.background.isTexture &&
      !scene.environment
    ) {
      const pmremGenerator = new THREE.PMREMGenerator(window.renderer);
      pmremGenerator.compileEquirectangularShader();
      try {
        scene.environment = pmremGenerator.fromEquirectangular(
          scene.background,
        ).texture;
      } catch (e) {
        // Background is not equirectangular, skip fallback
      } finally {
        pmremGenerator.dispose();
      }
    }
  }

  /**
   * Eliminates shadow-acne, contact light bleeding, and sharp edge artifacts on the Sun light.
   */
  _optimizeSunShadowParameters(scene) {
    const controller = window.smSunController;
    const sky = window.smHDRSkySystem || window.skyLightingSystem;

    if (controller?.light) {
      controller.configureShadows?.({
        enabled: true,
        mapSize: 2048,
        area: 48,
        near: 0.5,
        far: 260,
        bias: -0.00005,
        normalBias: 0.0015,
        radius: 1.0,
      });
      return true;
    }

    sky?.refreshShadows?.();
    return !!sky;
  }

  /**
   * Injects depth and emissive glow using the Post-Processing Stack.
   */
  _configurePostProcessStack() {
    const post = window.smPostProcessStack || window.postProcessStack;
    if (!post) return;

    post.setEnabled?.(true);

    // 1. Ambient Occlusion (SSAO/GTAO) - Creates deep crevice shadows where geometry meets
    if (typeof post.setSSAO === "function") {
      post.setSSAO(true, {
        intensity: 0.45,
        radius: 0.35,
        lumInfluence: 0.7,
        bias: 0.025,
      });
    }

    // 2. Physically-based Bloom (Only glows hot emissives, leaves diffuse clean)
    if (typeof post.setBloom === "function") {
      post.setBloom(true, {
        strength: 0.28,
        radius: 0.4,
        threshold: 0.92, // High threshold prevents whole screen from glowing
      });
    }

    // 3. Subsurface scattering / Anti-Aliasing (SMAA/FXAA)
    if (typeof post.setAntialiasing === "function") {
      post.setAntialiasing("SMAA");
    }
  }

  _setupGameplaySampleViewport(scene, settings = {}, repair = false) {
    if (!scene) return;
    try {
      window.switchToPerspectiveFromOrtho?.();
    } catch {}
    this._clearFilmSolidPresentation(scene);
    scene.overrideMaterial = null;
    this._applyWorkspaceDefaultShading("GAMEPLAY_SAMPLE", { repair });
    window.setGameDevelopmentPhysicsEnabled?.(false);
    this._hideSky(scene);
    this._hideGameDevelopmentEnvironment(scene);
    this._removeStudioLights(scene);
    this._removeRuntimeLights(scene, {
      preserveSky: true,
      preserveGameplaySample: true,
    });
    this._removeFilmGrid(scene);
    this._removeNamedGridHelper(scene, "gameModeGrid2D");
    this._setAuxiliaryViewportObjectsVisible(false);

    const purpleBackground = new THREE.Color(0x8177ad);
    scene.background = purpleBackground;
    scene.fog = new THREE.Fog(0x857bb0, 38, 285);
    if (window.renderer) {
      window.renderer.setClearColor(purpleBackground, 1);
      window.renderer.toneMappingExposure = 1.2;
      window.renderer.shadowMap.enabled = true;
      window.renderer.shadowMap.needsUpdate = true;
    }

    const projectOwnsWorld =
      window.SMGameProjectRuntime?.replacesGameplaySampleWorld === true &&
      !!window.SMGameProjectRuntime?.activeProject;
    const environment = projectOwnsWorld
      ? window.gameplaySampleEnvironment || null
      : window.createSMGameplaySampleEnvironment?.(
          scene,
          window.renderer,
          window.camera,
        ) ||
        window.gameplaySampleEnvironment ||
        null;

    if (environment) {
      try {
        if (projectOwnsWorld) {
          environment.deactivate?.();
        } else {
          environment.activate?.();
        }
      } catch (error) {
        console.warn("[Workspace] Gameplay Sample setup warning:", error);
        environment.course?.setVisible?.(true);
      }
      const world = environment.getWorld?.() || environment.world || null;
      if (world && !projectOwnsWorld) {
        window.gameplaySampleWorld = world;
        window.ground = world.ground || world.floor || null;
        window.obstaclesGroup = world.obstaclesGroup || null;
        window.collidableMeshes = world.collidableMeshes || [];
      }
      if (!projectOwnsWorld) {
        environment.registerPhysics?.(window.physicsSystem);
      }
      if (environment.lights) {
        environment.lights.visible = !projectOwnsWorld;
        environment.lights.traverse?.((child) => {
          child.visible = !projectOwnsWorld;
        });
      }
    }

    this._setGameplaySampleSceneVisible(scene, true);
    if (!projectOwnsWorld) {
      this._ensureGameplaySampleLighting?.(scene);
    }
    this._syncWorkspaceLighting("GAMEPLAY_SAMPLE", scene);
    window.setPlayerModelEnabled?.(true, { loadIfNeeded: true });
    if (window.player) {
      window.player.inputEnabled = true;
      window.player.gravityEnabled = true;
      window.player.lockZPosition = false;
      window.player.activate?.();
    }

    const camera = window.camera;
    const controls = window.orbitControls || window.controls;
    if (camera) {
      camera.near = 0.1;
      camera.far = Math.max(1500, camera.far || 1500);
      camera.fov = 60;
      camera.position.set(0, 32, 68);
      camera.lookAt(0, 2, 0);
      camera.updateProjectionMatrix?.();
    }
    if (controls) {
      controls.enableRotate = true;
      controls.enableZoom = true;
      controls.enablePan = true;
      controls.target?.set?.(0, 2, 0);
      controls.update?.();
    }
  }

  _ensureGameplaySampleLighting(scene) {
    const env = window.gameplaySampleEnvironment;
    const envLights = env?.lights;
    const hasEnvLight = !!envLights?.children?.some?.((child) => child.isLight);
    if (hasEnvLight) {
      if (!envLights.parent) scene.add(envLights);
      envLights.visible = true;
      envLights.traverse?.((child) => {
        child.visible = true;
      });
      this._removeGameplayFallbackLights(scene);
      return;
    }

    let group = scene.getObjectByName("SMGameplaySampleFallbackLights");
    if (!group) {
      group = new THREE.Group();
      group.name = "SMGameplaySampleFallbackLights";
      group.userData = {
        isSystemObject: true,
        isGameplaySample: true,
        workspaceOnly: "GAMEPLAY_SAMPLE",
        ignoreInTimeline: true,
        ignoreInHierarchy: true,
      };
      const sun = new THREE.DirectionalLight(0xffd2a6, 3.2);
      sun.name = "SMGameplaySampleFallbackSun";
      sun.position.set(-45, 55, 30);
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      group.add(sun);

      const hemi = new THREE.HemisphereLight(0xd9d4ff, 0x4f485f, 1.15);
      hemi.name = "SMGameplaySampleFallbackSkyLight";
      group.add(hemi);

      const ambient = new THREE.AmbientLight(0xffffff, 0.12);
      ambient.name = "SMGameplaySampleFallbackAmbient";
      group.add(ambient);

      scene.add(group);
    }
    group.visible = true;
    group.traverse((child) => {
      child.visible = true;
    });
  }

  _removeGameplayFallbackLights(scene) {
    const group = scene?.getObjectByName("SMGameplaySampleFallbackLights");
    if (group) group.parent?.remove(group);
  }

  _hideGameDevelopmentEnvironment(scene = window.scene) {
    if (!scene) return;
    window.SMUE5Environment?.hide?.();
    window.SMUE5Environment?.syncVisibility?.("FILM");
    this._setGameDevEnvironmentVisible(scene, false);
    if (window.gameDevGround) window.gameDevGround.visible = false;
    if (window.gameDevObstaclesGroup) {
      window.gameDevObstaclesGroup.visible = false;
      window.gameDevObstaclesGroup.traverse?.((child) => {
        child.visible = false;
      });
    }
  }

  _setGameDevEnvironmentVisible(scene, visible) {
    if (!scene) return;
    const names = new Set([
      "UnrealEngineFloor",
      "ObstaclesGroup",
      "DistanceMarkers",
      "MotionMatchingSampleCourse",
      "WaterBodies",
    ]);
    const state = !!visible;

    scene.traverse((obj) => {
      if (!obj || obj.userData?.isGameplaySample) return;
      const isGameDev =
        names.has(obj.name) ||
        (window.smWorkspaceOwnership?.isGameDevObject?.(obj) ??
          (obj.userData?.workspaceOnly === "GAME_DEV" ||
            obj.userData?.isGameDevelopmentEnvironment === true));
      if (isGameDev) {
        obj.visible = state;
      }
    });

    const floor = scene.getObjectByName("UnrealEngineFloor");
    const group = scene.getObjectByName("ObstaclesGroup");
    if (floor) floor.visible = state;
    if (group) {
      group.visible = state;
      group.traverse((child) => {
        child.visible = state;
      });
    }
  }

  _hideGameplaySampleEnvironment(scene = window.scene) {
    if (!scene) return;
    window.gameplaySampleEnvironment?.deactivate?.();
    const root = scene.getObjectByName("SMGameplaySampleEnvironment");
    if (root) {
      root.visible = false;
      root.traverse?.((child) => {
        child.visible = false;
      });
    }
    const lights = scene.getObjectByName("SMGameplaySampleLights");
    if (lights) {
      lights.visible = false;
      lights.traverse?.((child) => {
        child.visible = false;
      });
    }
    const fallback = scene.getObjectByName("SMGameplaySampleFallbackLights");
    if (fallback) {
      fallback.visible = false;
      fallback.traverse?.((child) => {
        child.visible = false;
      });
    }
  }

  _removeFilmGrid(scene) {
    this._setEditorGridVisible(scene, false);
  }

  _restoreGameSky(scene, { profile = "ue5-editor" } = {}) {
    if (!scene) return false;
    const adapter = window.smWorkspaceEnvironmentAdapter;
    if (adapter) {
      adapter.apply?.(
        profile === "terrain" ? "TERRAIN" : this.currentMode || "GAME_DEV",
        scene,
      );
      return true;
    }
    let system = window.skyLightingSystem || null;
    if (
      !system &&
      typeof SkyLightingSystem === "function" &&
      window.renderer &&
      window.camera
    ) {
      try {
        system = new SkyLightingSystem(scene, window.renderer, window.camera);
        window.skyLightingSystem = system;
      } catch (error) {
        console.warn("[Workspace] SkyLightingSystem creation failed:", error);
      }
    }
    if (system) {
      try {
        system.ensureRigAttached?.();
        system.setVisible?.(true);
        if (typeof system.applyWorkspaceProfile === "function") {
          system.applyWorkspaceProfile(profile);
        } else {
          system._applyUE5Preset?.();
        }
        if (system.sunLight) {
          if (!system.sunLight.parent) scene.add(system.sunLight);
          system.sunLight.visible = true;
        }
        if (system.hemiLight) {
          if (!system.hemiLight.parent) scene.add(system.hemiLight);
          system.hemiLight.visible = true;
        }
        system.refreshShadows?.();
        system.update?.(0);
      } catch (error) {
        console.warn("[Workspace] Sky restore failed:", error);
      }
    }
    return !!system;
  }

  _addGameLights(scene) {
    if (!scene) return null;

    /*
     * ============================================================
     * SINGLE GLOBAL LIGHTING AUTHORITY
     * ============================================================
     *
     * WorkspaceManager decides WHICH profile is active.
     * SMSunController / SMHDRSkySystem own the actual Sun.
     * GameModeManager must never create a second global Sun.
     */

    const sun =
        window.smSunController?.light ||
        window.smHDRSkySystem?.sunLight ||
        window.skyLightingSystem?.sunLight ||
        null;

    /*
     * Remove legacy GameModeManager lights.
     */
    [
        'GameSunLight',
        'GameHemiLight',
        'GameFillLight',
        'GameAmbientLight',
        'GameRimLight',
        'WorkspaceMainLight',
        'WorkspaceAmbient'
    ].forEach(name => {
        const light = scene.getObjectByName(name);

        if (!light) return;

        /*
         * Never remove the authoritative Sun if another
         * system has adopted this object.
         */
        if (
            light === sun ||
            light === window.smSunController?.light ||
            light === window.smHDRSkySystem?.sunLight
        ) {
            return;
        }

        light.parent?.remove(light);
    });

    /*
     * No global Sun available yet.
     * Do not create a fallback rig here.
     */
    if (!sun) {
        console.warn(
            '[GameModeManager] Global Sun Rig not ready.'
        );

        return null;
    }

    /*
     * Tag the authoritative Sun for workspace policy.
     */
    sun.userData = {
        ...(sun.userData || {}),
        isGlobalWorkspaceSun: true,
        ws_globalSun: true,
        allowShadowBudgetDisable: false
    };

    sun.castShadow = true;

    /*
     * Let the actual Sun controller own shadow configuration.
     */
    window.smSunController?.configureShadows?.({
        mapSize: 4096,
        area: 58,
        near: 0.5,
        far: 300,
        bias: -0.00004,
        normalBias: 0.00125,
        radius: 1.0
    });

    sun.shadow && (sun.shadow.needsUpdate = true);

    if (scene.getObjectByName('GameSunLight') !== sun) {
        const legacy = scene.getObjectByName('GameSunLight');

        if (legacy && legacy !== sun) {
            legacy.parent?.remove(legacy);
        }
    }

    return sun;
}

  _setGameObjectsVisible(visible, { keepPlayer = false } = {}) {
    const scene = window.scene;
    if (!scene) return;
    const isGame3DOr25D =
      visible &&
      this.currentMode === "GAME_DEV" &&
      this._normalizeGameMode(this.currentGameMode) !== "2D";
    this._setGameDevEnvironmentVisible(scene, isGame3DOr25D);

    if (!keepPlayer) {
      const playerModel =
        window.playerSystem?.character?.model || window.player?.model;
      if (playerModel) {
        playerModel.visible = !!visible;
        playerModel.traverse?.((child) => {
          child.visible = !!visible;
        });
      }
    }
    if (window.horseController?.horse) {
      window.horseController.horse.visible = !!visible;
    }
  }

  _setAuxiliaryViewportObjectsVisible(visible) {
    const scene = window.scene;
    if (!scene) return;
    ["modelingGround", "gridFloorPlane", "DebugGroundPlane"].forEach((name) => {
      const obj = scene.getObjectByName(name);
      if (!obj) return;
      obj.visible = !!visible;
      obj.traverse?.((child) => {
        child.visible = !!visible;
      });
    });
  }

  _sanitizeSystemHemisphereLights(scene, { visible = true } = {}) {
    const s = scene || window.scene;
    if (!s) return;
    const protectedLights = new Set(
      [
        window.smHDRSkySystem?.hemiLight,
        window.skyLightingSystem?.hemiLight,
      ].filter(Boolean),
    );
    const hemis = [];
    s.traverse((obj) => {
      if (obj?.isHemisphereLight) hemis.push(obj);
    });
    hemis.forEach((light) => {
      if (light.userData?.isGameplaySample) return;
      if (light.userData?.ws_terrainLight && this.currentMode === "TERRAIN")
        return;
      if (protectedLights.has(light)) {
        light.visible = !!visible;
        return;
      }
      if (light.userData?.ws_gameLight && this.currentMode !== "GAME_DEV") {
        light.visible = false;
      }
    });
  }

  _removeTaggedLights(scene, key) {
    if (!scene) return;
    const remove = [];
    scene.traverse((obj) => {
      if (obj.isLight && obj.userData?.[key]) remove.push(obj);
    });
    remove.forEach((light) => light.parent?.remove(light));
  }

  _removeRuntimeLights(
    scene,
    { preserveSky = true, preserveGameplaySample = true } = {},
  ) {
    if (!scene) return;
    const remove = [];
    scene.traverse((obj) => {
      if (!obj?.isLight) return;
      if (
        preserveGameplaySample &&
        (obj.userData?.isGameplaySample ||
          obj.userData?.workspaceOnly === "GAMEPLAY_SAMPLE")
      )
        return;
      if (preserveSky && this._isSkyObject(obj)) return;
      const name = String(obj.name || "");
      const explicitlyManaged =
        obj.userData?.ws_gameLight ||
        obj.userData?.ws_terrainLight ||
        obj.userData?.ws_runtimeLight ||
        name.startsWith("Runtime") ||
        name === "GameSunLight" ||
        name === "GameHemiLight" ||
        name === "GameFillLight" ||
        name === "GameAmbientLight" ||
        name === "WorkspaceMainLight" ||
        name === "WorkspaceAmbient" ||
        name === "WorkspaceFill" ||
        name === "WorkspaceRim";
      if (explicitlyManaged) remove.push(obj);
    });
    remove.forEach((light) => light.parent?.remove(light));
  }

  _removeStudioLights(scene) {
    if (!scene) return;
    const remove = [];
    scene.traverse((obj) => {
      if (!obj?.isLight) return;
      if (
        obj.userData?.ws_studioLight ||
        String(obj.name || "").startsWith("Studio")
      ) {
        remove.push(obj);
      }
    });
    remove.forEach((light) => light.parent?.remove(light));
  }

  _addStudioLights(scene) {
    const existing = [
      "StudioKeyLight",
      "StudioFillLight",
      "StudioRimLight",
      "StudioHemiLight",
      "StudioAmbientLight",
    ];
    existing.forEach((name) => {
      const old = scene.getObjectByName(name);
      if (old) scene.remove(old);
    });

    // KEY — l-light l-ra2issiya, katdir shadow
    const key = new THREE.DirectionalLight(0xffffff, 10.2);
    key.name = "StudioKeyLight";
    key.position.set(8, 12, 10);
    key.castShadow = true;
    key.shadow.mapSize.set(4096, 4096); // shadow o3la resolution
    key.shadow.bias = -0.00004;
    key.shadow.normalBias = 0.012;
    key.shadow.radius = 3; // soft edges b7al studio softbox
    key.shadow.blurSamples = 16;
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 40;
    key.shadow.camera.left = -10;
    key.shadow.camera.right = 10;
    key.shadow.camera.top = 10;
    key.shadow.camera.bottom = -10;
    key.userData.ws_studioLight = true;
    scene.add(key);
    scene.add(key.target);

    // FILL — kayla9a shadows dyal key, ma3andouch shadow bnafsso
    const fill = new THREE.DirectionalLight(0xd7e6ff, 3.1);
    fill.name = "StudioFillLight";
    fill.position.set(-10, 6, 8);
    fill.castShadow = false;
    fill.userData.ws_studioLight = true;
    scene.add(fill);

    // RIM — kayfaseл subject 3la l-background, khasso ykoun qwi bach yban
    const rim = new THREE.DirectionalLight(0xffffff, 3.8);
    rim.name = "StudioRimLight";
    rim.position.set(-2, 9, -12);
    rim.castShadow = false;
    rim.userData.ws_studioLight = true;
    scene.add(rim);
  }

  _setSolidModeShadowsEnabled(enabled) {
    const renderer = window.renderer;
    if (!renderer?.shadowMap) return;

    renderer.shadowMap.enabled = !!enabled;
    if (enabled) {
      renderer.shadowMap.needsUpdate = true;
    }
  }

  _markWorkspaceHelper(object) {
    if (!object) return object;
    const stamp = (child) => {
      child.userData = child.userData || {};
      Object.assign(child.userData, {
        isSystemObject: true,
        ignoreInTimeline: true,
        ignoreInHierarchy: true,
        selectable: false,
      });
      if (child.isGridHelper || child.isLine || child.isLineSegments) {
        child.raycast = () => null;
      }
    };
    stamp(object);
    object.traverse?.(stamp);
    return object;
  }

  _setEditorGridVisible(scene = window.scene, visible = false) {
    if (!scene) return;
    visible = !!visible && !window.__smGlobalSculptMode;
    const gridRoots = new Set([
      scene.getObjectByName("advancedGrid"),
      scene.getObjectByName("blenderGrid"),
      scene.getObjectByName("infiniteGrid"),
      window.grid,
      window.infiniteGrid,
    ]);
    gridRoots.forEach((grid) => {
      if (!grid) return;
      grid.visible = !!visible;
      grid.traverse?.((child) => {
        child.visible = !!visible;
      });
    });
  }

  _ensureGridVisible(visible) {
    const scene = window.scene;
    if (!scene) return;
    visible = !!visible && !window.__smGlobalSculptMode;
    let grid =
      scene.getObjectByName("advancedGrid") ||
      scene.getObjectByName("blenderGrid");
    if (!grid && visible) {
      if (typeof window.createAdvancedGridHelper === "function") {
        grid = window.createAdvancedGridHelper(1000, 1000);
      }
      if (!grid) {
        grid = new THREE.Group();
        const minor = new THREE.GridHelper(1000, 1000, 0x333333, 0x282828);
        minor.material.opacity = 0.4;
        minor.material.transparent = true;
        minor.material.depthWrite = false;
        grid.add(minor);
        const major = new THREE.GridHelper(1000, 100, 0x444444, 0x3a3a3a);
        major.material.opacity = 0.7;
        major.material.transparent = true;
        major.material.depthWrite = false;
        grid.add(major);
      }
      grid.name = "advancedGrid";
      grid.userData = {
        ...(grid.userData || {}),
        ws_workspaceGrid: true,
        workspaceOnly: "WORKSPACE_GRID",
        editorOnly: true,
        hideInPlay: true,
      };
      this._markWorkspaceHelper(grid);
      scene.add(grid);
    }
    this._setEditorGridVisible(scene, visible);
  }

  _removeSceneAddBlocker() {
    if (THREE.Scene.prototype._originalAdd) {
      THREE.Scene.prototype.add = THREE.Scene.prototype._originalAdd;
      delete THREE.Scene.prototype._originalAdd;
    }
  }

  _adjustUI(modeKey) {
    const isFilm = modeKey === "FILM";
    const isGame = modeKey === "GAME_DEV";
    const isSample = modeKey === "GAMEPLAY_SAMPLE";
    const isGameLike = isGame || isSample;
    const isTerrain = modeKey === "TERRAIN";
    const isMetaHuman = modeKey === "METAHUMAN";
    const isGame3D =
      isGame && this._normalizeGameMode(this.currentGameMode) === "3D";

    if (window.SMModifiers?.commandHandler) {
      window.SMModifiers.commandHandler.enable(isFilm);
      if (!isFilm) window.SMModifiers.commandHandler.hideContextMenu?.();
    }

    this._modifiersUIElements.forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        el.style.display = isFilm ? "" : "none";
        if (!isFilm) el.classList.remove("active");
      }
    });
    this._productionOnlyTools.forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.style.display = isFilm ? "" : "none";
    });
    this._gameOnlyTools.forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.style.display = isGameLike ? "" : "none";
    });
    this._productionOnlyToolbarBtns.forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.style.display = isFilm ? "" : "none";
    });
    this._gameOnlyToolbarBtns.forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.style.display = isGameLike ? "" : "none";
    });
    this._terrainOnlyTools.forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.style.display = isTerrain ? "" : "none";
    });

    const motion = document.getElementById("motion-matching-toolbar-btn");
    if (!isGame3D) motion?.classList.remove("active");
    this._syncMotionMatchingButtonVisibility();

    if (!isTerrain && !isFilm) {
      ["sculpting-tools", "node-editor-panel-terrain"].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.style.display = "none";
      });
    }

    document.body.classList.toggle("ws-terrain-mode", isTerrain);
    document.body.classList.toggle("ws-film-mode", isFilm);
    document.body.classList.toggle("ws-game-mode", isGame);
    document.body.classList.toggle("ws-gameplay-sample-mode", isSample);
    document.body.classList.toggle("ws-metahuman-mode", isMetaHuman);
    document.body.classList.toggle("game-dev-mode-active", isGame);
    document.body.classList.toggle("production-mode-active", isFilm);

    if (!isGame) {
      document.body.classList.remove(
        "ws-game-view-2d",
        "ws-game-view-25d",
        "ws-game-view-3d",
      );
    }
    if (isGame) {
      window.forceExitGameViewportEditingTools?.({ exitAnimation2D: true });
    }
  }

  _updateHeaderIndicator(modeKey) {
    const workspaceBtn = document.getElementById("workspaceBtn");
    const button = document.getElementById("gameModeToolbarBtn");
    const label = document.getElementById("gameModeToolbarLabel");
    if (!workspaceBtn) return;

    document.getElementById("ws-mode-indicator")?.remove();
    if (!button || !label) return;

    if (modeKey === "GAME_DEV") {
      label.textContent = `GAME ${this._getGameModeLabel()}`;
      button.title = `${this.modes.GAME_DEV.name} ${this._getGameModeLabel()}`;
    } else if (modeKey === "GAMEPLAY_SAMPLE") {
      label.textContent = "GAMEPLAY SAMPLE";
      button.title = "Gameplay Sample";
    } else if (modeKey === "TERRAIN") {
      label.textContent = "TERRAIN";
      button.title = this.modes.TERRAIN.name;
    } else if (modeKey === "METAHUMAN") {
      label.textContent = "METAHUMAN";
      button.title = this.modes.METAHUMAN.name;
    } else {
      label.textContent = "FILM";
      button.title = this.modes.FILM.name;
    }
  }

  _createProject() {
    const nameEl = this.modal.querySelector("#ws-new-name");
    const modeEl = this.modal.querySelector("#ws-new-mode");
    const name = (nameEl?.value || "").trim();
    if (!name) {
      nameEl?.focus();
      return;
    }
    const mode = modeEl?.value || this.currentMode || "FILM";
    const proj = {
      id: "proj_" + Date.now(),
      name,
      mode,
      gameMode: this._normalizeGameMode(
        this.modal.querySelector("#ws-new-game-mode")?.value ||
          this.currentGameMode,
      ),
      date: new Date().toISOString(),
      sceneData: null,
    };
    this.projects.push(proj);
    this.saveProjects();
    this._renderModal();
    this._syncGameViewportUi();
    this._toast(`Project "${name}" created`);
  }

  _loadProject(id) {
    const proj = this.projects.find((project) => project.id === id);
    if (!proj) return;
    this.activeProject = proj;
    if (proj.mode === "GAME_DEV") {
      this.setGameMode(proj.gameMode || "3D", {
        applyViewport: false,
        showToast: false,
      });
    }
    this.setMode(proj.mode);
    this._toast(`Loaded: ${proj.name}`);
  }

  _deleteProject(id) {
    if (!confirm("Delete this project?")) return;
    this.projects = this.projects.filter((project) => project.id !== id);
    this.saveProjects();
    this._renderModal();
    this._syncGameViewportUi();
  }

  _toast(message) {
    if (window.showToast) {
      window.showToast(message);
      return;
    }
    let toast = document.getElementById("ws-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "ws-toast";
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
  }
}

// Global initialization & attachment
window.SMWorkspaceManager = SMWorkspaceManager;
window.addEventListener(
  "load",
  () => {
    if (window.workspaceManager instanceof SMWorkspaceManager) return;
    window.workspaceManager = new SMWorkspaceManager();
    window.smWorkspaceVisibilityAuthority?.init?.(window.scene);

    const savedMode = localStorage.getItem("sm_workspace_mode");
    const validModes = new Set([
      "FILM",
      "GAME_DEV",
      "GAMEPLAY_SAMPLE",
      "TERRAIN",
      "METAHUMAN",
    ]);
    if (validModes.has(savedMode)) {
      setTimeout(() => window.workspaceManager.setMode(savedMode), 100);
    } else {
      setTimeout(() => window.workspaceManager.show(), 200);
    }
  },
  { once: true },
);
