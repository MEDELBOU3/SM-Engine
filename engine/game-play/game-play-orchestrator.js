// ============================================================================
// engine/game-play/game-play-orchestrator.js
// SM Engine - Play In Editor Runtime Orchestrator (Complete 2D / 2.5D / 3D)
// ============================================================================
(function () {
  "use strict";

  class GamePlayOrchestrator {
    constructor({
      scene = window.scene,
      physicsSystem = window.physicsSystem,
      playerSystem = window.playerSystem,
    } = {}) {
      this.scene = scene;
      this.physicsSystem = physicsSystem;
      this.playerSystem = playerSystem;
      this.mode = "edit";
      this.fixedStep = 1 / 60;
      this.sceneBackup = null;
      this.editorState = null;
      this.transitioning = false;
      this._playResizeObserver = null;
      this._playResizeFrame = 0;
      this._boundPlayResize = null;
      this._gameModeLoopRAF = 0;
      this._lastGameLoopTime = 0;
      this._gameWindow = null;
      this._gameWindowMount = null;
      this._gameWindowHUDMount = null;
      this._gameWindowClosing = false;

      // Professional Game Window render governor.
      // Keeps image quality high when the GPU has headroom, but avoids
      // long GPU frames caused by excessive DPR on high-density displays.
      this._gamePerf = {
        enabled: true,
        lastSampleTime: 0,
        sampleFrames: 0,
        sampleTime: 0,
        slowFrames: 0,
        fastFrames: 0,
        lastAdjustTime: 0,
        currentPixelRatio: 0,
        minPixelRatio: 0.80,
        maxPixelRatio: 2.0,
        budgetMaxPixelRatio: 2.0,
        targetMs: 16.67,
        lowerThresholdMs: 18.5,
        upperThresholdMs: 12.5,
        adjustIntervalMs: 1200,
        pixelBudget: 0,
      };

      this.playBtn = document.getElementById("sim-play");
      this.pauseBtn = document.getElementById("sim-pause");
      this.stepBtn = document.getElementById("sim-step");

      this._onPlayClick = this._onPlayClick.bind(this);
      this._onPauseClick = this._onPauseClick.bind(this);
      this._onStepClick = this._onStepClick.bind(this);
      this._onTerrainPlayStateChange =
        this._onTerrainPlayStateChange.bind(this);
      this._updateGameModeLoop = this._updateGameModeLoop.bind(this);

      this._bindUI();
      this._updateToolbar();

      window.PlayOrchestrator = this;
      window.gamePlayOrchestrator = this;
      console.log("[PIE] GamePlayOrchestrator ready (Complete Full Pipeline).");
    }

    _bindUI() {
      this.playBtn?.addEventListener("click", this._onPlayClick);
      this.pauseBtn?.addEventListener("click", this._onPauseClick);
      this.stepBtn?.addEventListener("click", this._onStepClick);

      window.addEventListener(
        "sm:terrain-play-start",
        this._onTerrainPlayStateChange,
      );
      window.addEventListener(
        "sm:terrain-play-stop",
        this._onTerrainPlayStateChange,
      );
    }

    // ========================================================================
    // GAME WINDOW
    // The editor keeps the simulation/runtime in this renderer, but the
    // actual WebGL canvas is mounted into a dedicated native popup window.
    // This gives Play Mode a clean game surface without duplicating the
    // scene or renderer.
    // ========================================================================
    _openGameWindow() {
      if (this._gameWindow && !this._gameWindow.closed) return true;

      const gameWindow = window.open(
        "",
        "SMEngineGameWindow",
        "popup=yes,width=1280,height=720,resizable=yes,scrollbars=no,menubar=no,toolbar=no,location=no,status=no",
      );

      if (!gameWindow) {
        console.error("[PIE] Game Window could not be opened.");
        return false;
      }

      this._gameWindow = gameWindow;
      window.__smGameWindowOpen = true;
      window.__smGameWindowDocument = gameWindow.document;
      this._gameWindowMount = null;
      this._gameWindowHUDMount = null;
      this._gameWindowClosing = false;

      const doc = gameWindow.document;
      
      // Compute absolute URLs so the popup (which has a blank URL) can still
      // resolve engine asset paths against the editor origin.
      const _baseHref = location.href.split("?")[0].split("#")[0];
      const _baseDir = _baseHref.substring(0, _baseHref.lastIndexOf("/") + 1);
      const _logoUrl = `${_baseDir}assets/icons/logo.svg`;
      const _appIconUrl = `${_baseDir}assets/icons/app.png`;
      
      doc.open();
      doc.write(`<!doctype html>
      <html lang="en">
      <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width,initial-scale=1">
      <title>SM Engine — Game</title>
      <link rel="icon" type="image/svg+xml" href="${_logoUrl}">
      <link rel="alternate icon" type="image/png" href="${_appIconUrl}">
      <link rel="apple-touch-icon" href="${_appIconUrl}">
      <style>
      *{margin:0;padding:0;box-sizing:border-box}
      html,body{width:100%;height:100%;overflow:hidden;background:#000;color:#fff;font-family:Inter,system-ui,Segoe UI,Arial,sans-serif;user-select:none;position:relative}
      #sm-game-root{position:fixed;inset:0;background:#000;overflow:hidden;isolation:isolate}
      #sm-game-surface{position:absolute;inset:0;overflow:hidden;background:#000;z-index:1}
      #sm-game-surface > #renderer-container,#sm-game-surface > .renderer-container{position:absolute !important;top:0 !important;left:0 !important;width:100% !important;height:100% !important;inset:0 !important;margin:0 !important;padding:0 !important;overflow:hidden !important;z-index:1 !important;pointer-events:auto !important}
      #sm-game-surface canvas{position:absolute !important;top:0 !important;left:0 !important;width:100% !important;height:100% !important;display:block !important;margin:0 !important;padding:0 !important;outline:none !important}
      #sm-game-ui-layer{position:absolute;inset:0;width:100%;height:100%;z-index:20;pointer-events:none;overflow:hidden}
      #sm-game-ui-layer > *{position:absolute;box-sizing:border-box}
      #sm-game-ui-layer canvas{position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:auto;display:block}
      #sm-game-hud-mount{position:absolute;inset:0;pointer-events:none;z-index:30}
      #sm-game-hud-mount > *{pointer-events:auto}
      #sm-game-topbar{position:absolute;left:0;right:0;top:0;height:40px;display:flex;align-items:center;gap:10px;padding:0 14px;box-sizing:border-box;background:linear-gradient(180deg,rgba(0,0,0,.62),transparent);pointer-events:none;z-index:40}
      #sm-game-logo{width:22px;height:22px;object-fit:contain;filter:drop-shadow(0 2px 4px rgba(0,0,0,.55))}
      #sm-game-title{font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#dce7f2;text-shadow:0 1px 4px #000}
      #sm-game-status{margin-left:auto;font-size:10px;letter-spacing:.1em;font-weight:700;color:#7dd3fc;text-shadow:0 1px 4px #000;padding:3px 10px;background:rgba(125,211,252,.12);border:1px solid rgba(125,211,252,.3);border-radius:4px}
      #sm-game-crosshair{position:absolute;left:50%;top:50%;width:8px;height:8px;transform:translate(-50%,-50%);pointer-events:none;opacity:.45;z-index:50}
      #sm-game-crosshair:before,#sm-game-crosshair:after{content:"";position:absolute;background:#fff}
      #sm-game-crosshair:before{width:8px;height:1px;left:0;top:3px}
      #sm-game-crosshair:after{height:8px;width:1px;left:3px;top:0}
      </style>
      </head>
      <body>
      <div id="sm-game-root">
      <div id="sm-game-surface" tabindex="0"></div>
      <div id="sm-game-ui-layer"></div>
      <div id="sm-game-hud-mount"></div>
      <div id="sm-game-topbar">
      <img id="sm-game-logo" src="${_logoUrl}" alt="SM Engine" onerror="this.style.display='none'">
      <span id="sm-game-title">SM ENGINE — GAME</span>
      <span id="sm-game-status">PLAY</span>
      </div>
      <div id="sm-game-crosshair"></div>
      </div>
      </body>
      </html>`);
      doc.close();

      // The game canvas is physically moved into gameWindow.document, but
      // PlayerInputController / PlayerCameraController were initialized in
      // the editor document. Therefore we bridge BOTH targets:
      //   1) the moved canvas (for element-bound input listeners)
      //   2) the original editor window/document (for global listeners)
      //
      // Dispatching only on window/document was the reason the Game Window
      // rendered correctly but the player behaved like a static screenshot.

      const getGameCanvas = () =>
        window.__smGameWindowCanvas ||
        gameWindow.document?.querySelector("#sm-game-surface canvas") ||
        null;

      const dispatchToEditor = (event) => {
        try {
          const editorEvent =
            typeof event.cloneNode === "function"
              ? event.cloneNode(true)
              : event;
          window.dispatchEvent(editorEvent);
          document.dispatchEvent(
            typeof event.cloneNode === "function"
              ? event.cloneNode(true)
              : event,
          );
        } catch (error) {
          console.warn("[PIE] Editor input bridge failed:", error);
        }
      };

      const forward = (type, event) => {
        if (!window.__smGameRunning) return;

        try {
          let forwarded;

          if (type === "keydown" || type === "keyup") {
            forwarded = new KeyboardEvent(type, {
              key: event.key,
              code: event.code,
              location: event.location,
              ctrlKey: event.ctrlKey,
              shiftKey: event.shiftKey,
              altKey: event.altKey,
              metaKey: event.metaKey,
              repeat: event.repeat,
              isComposing: event.isComposing,
              bubbles: true,
              cancelable: true,
            });
          } else if (type === "wheel") {
            forwarded = new WheelEvent(type, {
              deltaX: event.deltaX,
              deltaY: event.deltaY,
              deltaZ: event.deltaZ,
              deltaMode: event.deltaMode,
              ctrlKey: event.ctrlKey,
              shiftKey: event.shiftKey,
              altKey: event.altKey,
              metaKey: event.metaKey,
              bubbles: true,
              cancelable: true,
            });
          } else {
            forwarded = new MouseEvent(type, {
              button: event.button,
              buttons: event.buttons,
              clientX: event.clientX,
              clientY: event.clientY,
              movementX: event.movementX || 0,
              movementY: event.movementY || 0,
              screenX: event.screenX,
              screenY: event.screenY,
              ctrlKey: event.ctrlKey,
              shiftKey: event.shiftKey,
              altKey: event.altKey,
              metaKey: event.metaKey,
              bubbles: true,
              cancelable: true,
            });
          }

          // First deliver the event to the actual moved renderer canvas.
          // This preserves listeners registered directly on renderer.domElement.
          const canvas = getGameCanvas();
          if (canvas) {
            canvas.dispatchEvent(forwarded);
          }

          // Also preserve the original global editor input listeners.
          dispatchToEditor(forwarded);
        } catch (error) {
          console.warn("[PIE] Game input forwarding failed:", error);
        }
      };

      const gameInputTypes = [
        "keydown",
        "keyup",
        "mousedown",
        "mouseup",
        "mousemove",
        "wheel",
        "contextmenu",
      ];

      gameInputTypes.forEach((type) => {
        gameWindow.addEventListener(
          type,
          (event) => {
            if (type === "contextmenu") {
              event.preventDefault();
            }

            // Keep the native Game Window focused while interacting
            // with the game surface.
            if (
              type === "mousedown" ||
              type === "mouseup" ||
              type === "mousemove"
            ) {
              getGameCanvas()?.focus?.();
            }

            forward(type, event);
          },
          { passive: type === "wheel" },
        );
      });

      // Pointer lock is commonly used by third-person/FPS camera controllers.
      // Mirror pointer-lock state into the editor document so existing camera
      // systems continue to believe the gameplay canvas is the active surface.
      gameWindow.document?.addEventListener?.("pointerlockchange", () => {
        try {
          const lockedElement = gameWindow.document.pointerLockElement;
          window.__smGamePointerLocked = !!lockedElement;

          if (
            lockedElement &&
            typeof window.document?.dispatchEvent === "function"
          ) {
            window.document.dispatchEvent(
              new Event("pointerlockchange", { bubbles: false }),
            );
          }
        } catch (_) {}
      });

      gameWindow.addEventListener("blur", () => {
        // Prevent stuck WASD / mouse buttons when the user Alt-Tabs or
        // clicks another native window while Play is active.
        if (!window.__smGameRunning) return;

        const keys = [
          "KeyW",
          "KeyA",
          "KeyS",
          "KeyD",
          "ArrowUp",
          "ArrowDown",
          "ArrowLeft",
          "ArrowRight",
          "Space",
          "ShiftLeft",
          "ShiftRight",
          "ControlLeft",
          "ControlRight",
        ];

        for (const code of keys) {
          try {
            const up = new KeyboardEvent("keyup", {
              code,
              key: code.startsWith("Key") ? code.slice(3).toLowerCase() : code,
              bubbles: true,
              cancelable: true,
            });
            getGameCanvas()?.dispatchEvent?.(up);
            dispatchToEditor(up);
          } catch (_) {}
        }
      });

      gameWindow.addEventListener("resize", () => {
        if (!gameWindow.closed) {
          this._syncPlayRenderSurface?.();
          this._renderGameFrame?.();
        }
      });

      // Click the actual game surface to focus the gameplay input.
      // Do not force pointer-lock automatically: the player's camera
      // controller decides whether/when pointer-lock is appropriate.
      gameWindow.document
        ?.getElementById("sm-game-surface")
        ?.addEventListener("click", () => {
          try {
            getGameCanvas()?.focus?.();
            gameWindow.focus();
          } catch (_) {}
        });

      gameWindow.addEventListener("beforeunload", () => {
        if (this._gameWindowClosing) return;
        this._gameWindowClosing = true;
        this._restoreGameWindowSurface();
        if (this.mode !== "edit" && !this.transitioning) {
          this.stopPlayMode?.();
        }
      });

      gameWindow.focus();
      return true;
    }

    _mountRendererIntoGameWindow() {
      const gameWindow = this._gameWindow;
      if (!gameWindow || gameWindow.closed) return false;

      const renderer = this._getPlayRenderer?.() || window.renderer;
      const canvas = renderer?.domElement;
      const surface = gameWindow.document?.getElementById("sm-game-surface");
      if (!canvas || !surface) return false;

      if (!this._gameWindowMount) {
        const placeholder = document.createComment("SM_ENGINE_GAME_CANVAS");
        canvas.parentNode?.insertBefore(placeholder, canvas);
        this._gameWindowMount = {
          canvas,
          placeholder,
          parent: canvas.parentNode,
        };
      }

      surface.appendChild(canvas);

      // Explicit marker consumed by animate-loop.js. The canvas now belongs
      // to the native Game Window and must be rendered as one full-screen
      // game surface, never as an editor viewport panel.
      canvas.dataset.smGameWindowCanvas = "1";
      window.__smGameWindowCanvas = canvas;

      canvas.tabIndex = 0;
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      canvas.style.display = "block";
      canvas.focus?.();

      this._moveGameHUDToWindow();
      this._syncPlayRenderSurface?.();
      gameWindow.focus();

      console.log("[PIE] Game renderer mounted in dedicated Game Window.");
      return true;
    }

    _moveGameHUDToWindow() {
      const gameWindow = this._gameWindow;
      if (!gameWindow || gameWindow.closed) return false;
      const hud = document.getElementById("mygame-hud");
      const mount = gameWindow.document?.getElementById("sm-game-hud-mount");
      if (!hud || !mount) return false;

      if (!this._gameWindowHUDMount) {
        this._gameWindowHUDMount = {
          hud,
          parent: hud.parentNode,
          nextSibling: hud.nextSibling,
        };
      }
      mount.appendChild(hud);
      hud.style.position = "absolute";
      hud.style.top = "16px";
      hud.style.right = "18px";
      hud.style.left = "auto";
      return true;
    }

    _restoreGameWindowSurface() {
      const mount = this._gameWindowMount;
      if (mount?.canvas) {
        try {
          const parent =
            mount.parent || document.getElementById("renderer-container");
          if (mount.placeholder?.parentNode) {
            mount.placeholder.parentNode.insertBefore(
              mount.canvas,
              mount.placeholder,
            );
          } else if (parent) {
            parent.appendChild(mount.canvas);
          }
          mount.canvas.style.width = "100%";
          mount.canvas.style.height = "100%";
          mount.canvas.style.display = "block";
          delete mount.canvas.dataset.smGameWindowCanvas;
          if (window.__smGameWindowCanvas === mount.canvas) {
            window.__smGameWindowCanvas = null;
          }
        } catch (error) {
          console.warn("[PIE] Failed to restore editor canvas:", error);
        }
      }

      const hudMount = this._gameWindowHUDMount;
      if (hudMount?.hud) {
        try {
          if (
            hudMount.nextSibling &&
            hudMount.nextSibling.parentNode === hudMount.parent
          ) {
            hudMount.parent.insertBefore(hudMount.hud, hudMount.nextSibling);
          } else if (hudMount.parent) {
            hudMount.parent.appendChild(hudMount.hud);
          }
        } catch (error) {
          console.warn("[PIE] Failed to restore game HUD:", error);
        }
      }

      this._gameWindowMount = null;
      this._gameWindowHUDMount = null;
    }

    _closeGameWindow() {
      const gameWindow = this._gameWindow;
      this._gameWindowClosing = true;
      this._restoreGameWindowSurface();
      if (gameWindow && !gameWindow.closed) {
        try {
          gameWindow.close();
        } catch (_) {}
      }
      this._gameWindow = null;
      window.__smGameWindowOpen = false;
      window.__smGameWindowDocument = null;
      this._gameWindowClosing = false;
    }

    _getWorkspaceMode() {
      return String(
        window.workspaceManager?.currentMode ||
          window.currentWorkspaceMode ||
          localStorage.getItem("sm_workspace_mode") ||
          "",
      ).toUpperCase();
    }

    _getGameDevSubMode() {
      return String(
        window.workspaceManager?.currentGameMode ||
          localStorage.getItem("sm_game_dev_mode") ||
          "3D",
      ).toUpperCase();
    }

    _isTerrainWorkspace() {
      return this._getWorkspaceMode() === "TERRAIN";
    }

    _getTerrainPlayerBridge() {
      return (
        window.TerrainPlayerPlayBridge ||
        window.TerrainSculpting?.playerPlay ||
        null
      );
    }

    _onTerrainPlayStateChange() {
      if (this._isTerrainWorkspace()) {
        this._updateToolbar();
      }
    }

    async _onPlayClick() {
      if (this.transitioning) return;

      // Terrain has its own lightweight player test bridge
      if (this._isTerrainWorkspace()) {
        const bridge = this._getTerrainPlayerBridge();
        if (!bridge) {
          console.warn("[PIE] Terrain player test bridge is unavailable.");
          return;
        }

        this.transitioning = true;
        try {
          if (bridge.state?.playing === true) {
            bridge.stop?.();
          } else {
            await bridge.play?.();
          }
        } catch (error) {
          console.error("[PIE] Terrain player test failed:", error);
        } finally {
          this.transitioning = false;
          this._updateToolbar();
        }
        return;
      }

      if (this.mode === "edit") {
        // Open synchronously from the actual Play click so Electron/Chromium
        // does not treat the game window as a popup after an await.
        if (!this._openGameWindow()) return;
        try {
          window.smAudioSystem?.unlock?.();
        } catch (error) {
          console.warn("[PIE Audio] Early AudioContext unlock failed:", error);
        }
        await this.startPlayMode();
      } else {
        await this.stopPlayMode();
      }
    }

    async _onPauseClick() {
      if (this.transitioning) return;
      if (this.mode === "play") {
        await this.pauseSimulation();
      } else if (this.mode === "pause") {
        await this.resumeSimulation();
      }
    }

    _onStepClick() {
      if (this.transitioning) return;
      if (this.mode === "pause") {
        this.stepFrame();
      }
    }

    async _prepareRuntimePlayer() {
      let workspaceMode = this._getWorkspaceMode();
      const gameSubMode = this._getGameDevSubMode();
      const configuredPlayerMode = String(
        (this.playerSystem || window.playerSystem)?.workspaceMode || "",
      ).toUpperCase();

      if (
        workspaceMode !== "GAME_DEV" &&
        workspaceMode !== "GAMEPLAY_SAMPLE" &&
        (configuredPlayerMode === "GAME_DEV" ||
          configuredPlayerMode === "GAMEPLAY_SAMPLE")
      ) {
        workspaceMode = configuredPlayerMode;
      }

      const playerWorkspace =
        workspaceMode === "GAME_DEV" || workspaceMode === "GAMEPLAY_SAMPLE";
      if (!playerWorkspace) return false;

      let player = this.playerSystem || window.playerSystem;
      if (!player) {
        const deadline = Date.now() + 6000;
        while (!player && Date.now() < deadline) {
          await new Promise((resolve) => setTimeout(resolve, 50));
          player = window.playerSystem || null;
        }
        this.playerSystem = player || this.playerSystem;
      }

      if (!player) {
        console.warn(
          "[PIE] Player system is not available for workspace:",
          workspaceMode,
        );
        return false;
      }

      if (!player.ready && typeof player.init === "function") {
        try {
          await player.init();
        } catch (error) {
          console.error("[PIE] Player initialization failed:", error);
          return false;
        }
      }

      if (!player.ready) {
        console.warn("[PIE] Player is not ready; keeping the editor camera.");
        return false;
      }

      const readyPlayerMode = String(player.workspaceMode || "").toUpperCase();
      if (
        workspaceMode !== "GAME_DEV" &&
        workspaceMode !== "GAMEPLAY_SAMPLE" &&
        (readyPlayerMode === "GAME_DEV" ||
          readyPlayerMode === "GAMEPLAY_SAMPLE")
      ) {
        workspaceMode = readyPlayerMode;
      }

      player.setWorkspaceMode?.(workspaceMode);
      player.setEnabled?.(true);
      player.character?.setVisible?.(true);
      player.animation?.setEnabled?.(true);
      player.forceIdle?.();
      player.model?.updateMatrixWorld?.(true);

      // Submode Input, Z-Lock, and Movement Configuration
      if (workspaceMode === "GAME_DEV") {
        if (gameSubMode === "2D") {
          player.inputEnabled = true;
          player.gravityEnabled = true;
          player.lockZPosition = true;
          player.zLockValue = 0;
          if (player.movement) {
            player.movement.is2D = true;
            player.movement.is25D = false;
          }
          if (player.character?.model) {
            player.character.model.position.z = 0;
          }
        } else if (gameSubMode === "2.5D") {
          player.inputEnabled = true;
          player.gravityEnabled = true;
          player.lockZPosition = true;
          player.zLockValue = 0;
          if (player.movement) {
            player.movement.is2D = false;
            player.movement.is25D = true;
          }
          if (player.character?.model) {
            player.character.model.position.z = 0;
          }
        } else {
          player.inputEnabled = true;
          player.gravityEnabled = true;
          player.lockZPosition = false;
          if (player.movement) {
            player.movement.is2D = false;
            player.movement.is25D = false;
          }
        }
      }

      this._restoreHiddenGameplayObjects?.(workspaceMode);

      window.workspaceManager?.enforceWorkspaceVisibility?.(
        workspaceMode,
        this.scene || window.scene,
      );

      window.workspaceManager?._syncWorkspaceLighting?.(
        workspaceMode,
        this.scene || window.scene,
      );

      window.workspaceManager?._syncSkyForWorkspace?.(
        workspaceMode,
        this.scene || window.scene,
      );

      if (workspaceMode === "GAME_DEV") {
        const isGame3DOr25D = gameSubMode !== "2D";
        window.ensureGameDevelopmentEnvironment?.(this.scene || window.scene);
        if (isGame3DOr25D) {
          window.SMUE5Environment?.show?.();
        }
        window.SMUE5Environment?.syncVisibility?.("GAME_DEV");

        const gameFloor =
          window.gameDevGround ||
          this.scene?.getObjectByName?.("UnrealEngineFloor");
        const gameObstacles =
          window.gameDevObstaclesGroup ||
          this.scene?.getObjectByName?.("ObstaclesGroup");
        if (gameFloor) gameFloor.visible = isGame3DOr25D;
        if (gameObstacles) {
          gameObstacles.visible = isGame3DOr25D;
          gameObstacles.traverse?.((child) => {
            child.visible = isGame3DOr25D;
          });
        }
      } else if (workspaceMode === "GAMEPLAY_SAMPLE") {
        const projectOwnsWorld =
          window.SMGameProjectRuntime?.replacesGameplaySampleWorld === true &&
          !!window.SMGameProjectRuntime?.activeProject;
        if (projectOwnsWorld) {
          window.gameplaySampleEnvironment?.deactivate?.();
          window.workspaceManager?._syncWorkspaceLighting?.(
            "GAMEPLAY_SAMPLE",
            this.scene || window.scene,
          );
        } else {
          window.gameplaySampleEnvironment?.activate?.();
        }
      }

      this.scene?.updateMatrixWorld?.(true);
      const enabled = player.enabled === true;
      if (!enabled) {
        console.warn(
          "[PIE] Player remained disabled for workspace:",
          workspaceMode,
        );
      }
      return enabled;
    }

    _restoreHiddenGameplayObjects(modeKey) {
      const scene = this.scene || window.scene;
      if (!scene?.traverse) return;
      const mode = String(modeKey || "").toUpperCase();
      if (mode !== "GAME_DEV" && mode !== "GAMEPLAY_SAMPLE") return;

      const isTerrain = (object) => {
        const data = object?.userData || {};
        const name = String(object?.name || "");
        return (
          data.isTerrain === true ||
          data.isTerrainMesh === true ||
          data.isTerrainComponent === true ||
          data.workspaceOnly === "TERRAIN" ||
          name === "Terrain" ||
          name === "Terrain_Mesh" ||
          name.startsWith("Terrain_")
        );
      };

      const isEditorOverlay = (object) => {
        const name = String(object?.name || "");
        return (
          object === window.grid ||
          object === window.infiniteGrid ||
          name === "advancedGrid" ||
          name === "blenderGrid" ||
          name === "gameModeGrid2D"
        );
      };

      scene.traverse((object) => {
        if (!object?._hiddenByTerrainMode) return;
        if (isTerrain(object) || isEditorOverlay(object)) {
          object.visible = false;
          return;
        }
        object.visible = true;
        delete object._hiddenByTerrainMode;
      });
    }

    async _startSMRuntime() {
      const runtime = window.SMRuntime || null;
      if (!runtime?.play) {
        console.warn(
          "[PIE Runtime] SMRuntime is unavailable; continuing with legacy PIE only.",
        );
        return null;
      }
      if (runtime.isPlaying?.()) {
        return runtime.getSession?.() || true;
      }
      const session = await runtime.play({
        scene: this.scene || window.scene || null,
        renderer: window.renderer || null,
        camera: window.camera || null,
      });
      if (!runtime.isPlaying?.()) {
        throw new Error("SMRuntime failed to enter Play Mode.");
      }
      console.log("[PIE Runtime] SMRuntime started.", {
        state: runtime.getState?.(),
        session: runtime.getSession?.()?.id || null,
      });
      return session;
    }

    async _stopSMRuntime() {
      const runtime = window.SMRuntime || null;
      if (!runtime?.stop) return false;
      if (!runtime.isPlaying?.() && runtime.getState?.() === "editor")
        return true;
      const stopped = await runtime.stop({ reason: "pie-stop" });
      console.log("[PIE Runtime] SMRuntime stopped.", {
        state: runtime.getState?.(),
      });
      return stopped;
    }

    async _pauseSMRuntime() {
      const runtime = window.SMRuntime || null;
      if (!runtime?.pause || !runtime.isPlaying?.() || runtime.isPaused?.())
        return false;
      const paused = await runtime.pause();
      console.log("[PIE Runtime] SMRuntime paused.", {
        state: runtime.getState?.(),
      });
      return paused;
    }

    async _resumeSMRuntime() {
      const runtime = window.SMRuntime || null;
      if (!runtime?.resume || !runtime.isPlaying?.() || !runtime.isPaused?.())
        return false;
      const resumed = await runtime.resume();
      console.log("[PIE Runtime] SMRuntime resumed.", {
        state: runtime.getState?.(),
      });
      return resumed;
    }

    async startPlayMode() {
      if (this.mode !== "edit" || this.transitioning) return false;
      this.transitioning = true;

      try {
        console.log("[PIE] Entering Play Mode...");
        this.scene = window.scene || this.scene;
        this.physicsSystem = window.physicsSystem || this.physicsSystem;
        this.playerSystem = window.playerSystem || this.playerSystem;

        if (!this.scene) {
          throw new Error("Scene is not available.");
        }

        this._cacheEditorState?.();
        this._cacheSceneTransforms?.();
        await this._startSMRuntime();

        this.mode = "play";
        window.__smPIEMode = "play";
        window.__smGameRunning = true;
        window.__smGamePaused = false;
        window.__smEmptyGameplayRepairLogged = false;

        if (window.transformControls) {
          window.transformControls.detach?.();
          window.transformControls.enabled = false;
          window.transformControls.visible = false;
        }
        if (window.outlinePass) {
          window.outlinePass.selectedObjects = [];
        }
        if (window.controls) {
          window.controls.enabled = false;
        }
        if (window.GameUI) {
          window.GameUI.setDesignerMode?.(false);
        }

        const gameSubMode = this._getGameDevSubMode();
        const useNative2D = gameSubMode === "2D" && !!window.SM2DGameRuntime;
        if (this.physicsSystem) {
          this.physicsSystem.toggleSimulation?.(gameSubMode !== "2D");
        }
        window.physicsEnabled = gameSubMode !== "2D";

        if (useNative2D) {
          // A 2D game owns sprite actors, orthographic framing and
          // input. Do not initialise or possess the 3D character.
          this.playerSystem?.setRuntimeControlActive?.(false);
          this.playerSystem?.setSimulationPaused?.(true);
          window.SM2DGameRuntime.enter({
            scene: this.scene || window.scene,
            camera:
              window.cameraSystem?.orthographicCamera ||
              window.cameraSystem?.activeCamera ||
              window.camera,
          });
        } else {
          await this._prepareRuntimePlayer();
          this.playerSystem = window.playerSystem || this.playerSystem;
          if (this.playerSystem) {
            this.playerSystem.setSimulationPaused?.(false);
            this.playerSystem.setRuntimeControlActive?.(true);
          }
        }

        const cameraActivated = this._activateGameCamera();
        if (!cameraActivated) {
          const fallbackCamera =
            window.cameraSystem?.camera || window.camera || null;
          if (fallbackCamera?.isCamera) {
            window._gameRenderCamera = fallbackCamera;
            window.gameCamera = fallbackCamera;
            window._activeRenderCamera = fallbackCamera;
            window._viewedCamera = fallbackCamera;
            window._gameCameraActive = true;
            if (window.SMEngineRenderer)
              window.SMEngineRenderer.activeRenderCamera = fallbackCamera;
            console.warn(
              "[PIE] Runtime camera unavailable; using editor camera for Game View.",
            );
          }
        }

        const runtimeAudioCamera =
          window._gameRenderCamera ||
          window.gameCamera ||
          window.camera ||
          null;
        if (window.smAudioSystem) {
          try {
            if (runtimeAudioCamera?.isCamera) {
              window.smAudioSystem.setRuntimeCamera?.(runtimeAudioCamera);
            }
            await window.smAudioSystem.unlock?.();
          } catch (error) {
            console.warn("[PIE Audio] Audio system activation failed:", error);
          }
        }

        if (window.smAudioSceneRuntime?.enterPlayMode) {
          try {
            await window.smAudioSceneRuntime.enterPlayMode();
          } catch (error) {
            console.error("[PIE Audio] Failed to start scene audio:", error);
          }
        }

        this.playBtn?.classList.add("active");
        if (this.playBtn) {
          this.playBtn.innerHTML = '<i class="fas fa-stop"></i>';
          this.playBtn.title = "Stop Game";
        }
        if (this.pauseBtn) this.pauseBtn.disabled = false;
        if (this.stepBtn) this.stepBtn.disabled = true;

        window.SMViewportSystem?.openGameView?.();

        if (!this._mountRendererIntoGameWindow()) {
          throw new Error(
            "SM Engine Game Window renderer surface could not be mounted.",
          );
        }

        this._applyPlayRenderQuality?.();
        this._syncPlayRenderSurface?.();
        this._renderGameFrame?.();
        this._startPlayRenderQualityObserver?.();
        this._startGameModeLoop();

        requestAnimationFrame(() => {
          if (this.mode === "play" || this.mode === "pause") {
            this._syncPlayRenderSurface?.();
          }
        });

        window.dispatchEvent(
          new CustomEvent("sm:pie-start", {
            detail: {
              player: this.playerSystem,
              camera: window._gameRenderCamera,
              gameMode: gameSubMode,
            },
          }),
        );

        // Runtime HUDs are created by Play listeners, so move them after
        // the event has fired.
        this._moveGameHUDToWindow();

        console.log("[PIE] Play active in mode:", gameSubMode);
        return true;
      } catch (error) {
        console.error("[PIE] Failed to start:", error);
        this._stopGameModeLoop();
        window.SM2DGameRuntime?.exit?.();
        this._stopPlayRenderQualityObserver?.();
        this._restorePlayRenderQuality?.();
        try {
          window.smAudioSceneRuntime?.exitPlayMode?.();
        } catch (_) {}
        try {
          await this._stopSMRuntime();
        } catch (runtimeStopError) {
          console.error(
            "[PIE Runtime] Runtime rollback failed.",
            runtimeStopError,
          );
        }
        this.mode = "edit";
        window.__smPIEMode = "edit";
        window.__smGameRunning = false;
        window.__smGamePaused = false;
        this._closeGameWindow();
        return false;
      } finally {
        this.transitioning = false;
      }
    }

    async stopPlayMode() {
      if (this.mode === "edit" || this.transitioning) return false;
      this.transitioning = true;

      try {
        console.log("[PIE] Exiting Play Mode...");
        this._stopGameModeLoop();
        window.SM2DGameRuntime?.exit?.();

        if (this.playerSystem) {
          this.playerSystem.setRuntimeControlActive?.(false);
          this.playerSystem.setSimulationPaused?.(false);
        }
        if (document.pointerLockElement) {
          document.exitPointerLock?.();
        }
        if (this.physicsSystem) {
          this.physicsSystem.toggleSimulation?.(false);
        }
        window.physicsEnabled = false;

        try {
          window.smAudioSceneRuntime?.exitPlayMode?.();
        } catch (error) {
          console.warn("[PIE Audio] Failed to stop scene audio:", error);
        }

        this._deactivateGameCamera();

        if (window.GameUI) {
          window.GameUI.setDesignerMode?.(true);
        }

        await this._stopSMRuntime();
        this._restoreSceneTransforms?.();

        this.mode = "edit";
        window.__smPIEMode = "edit";
        window.__smGameRunning = false;
        window.__smGamePaused = false;

        if (this.playBtn) {
          this.playBtn.classList.remove("active");
          this.playBtn.innerHTML = '<i class="fas fa-play"></i>';
          this.playBtn.title = "Play Game";
        }
        if (this.pauseBtn) {
          this.pauseBtn.classList.remove("active");
          this.pauseBtn.disabled = true;
        }
        if (this.stepBtn) {
          this.stepBtn.disabled = true;
        }

        this._stopPlayRenderQualityObserver?.();
        window.SMViewportSystem?.closeGameView?.();
        this._closeGameWindow();

        const editorCamera = window.cameraSystem?.camera || window.camera;
        if (window.controls) {
          window.controls.object = editorCamera;
          window.controls.enabled = true;
          window.controls.update?.();
        }
        if (window.transformControls) {
          window.transformControls.enabled = true;
        }

        window.dispatchEvent(new CustomEvent("sm:pie-stop"));
        this._restoreEditorState?.();

        // Re-apply viewport mode settings to ensure camera is clean
        window.workspaceManager?._applyGameViewportMode?.();

        console.log("[PIE] Edit Mode restored.");
        return true;
      } finally {
        this.transitioning = false;
      }
    }

    async pauseSimulation() {
      if (this.mode !== "play") return false;
      await this._pauseSMRuntime();
      this.mode = "pause";
      window.__smPIEMode = "pause";
      window.__smGamePaused = true;
      this.playerSystem?.setSimulationPaused?.(true);
      this.physicsSystem?.toggleSimulation?.(false);
      window.physicsEnabled = false;
      window.SM2DGameRuntime?.setPaused?.(true);
      this.pauseBtn?.classList.add("active");
      if (this.stepBtn) this.stepBtn.disabled = false;
      return true;
    }

    async resumeSimulation() {
      if (this.mode !== "pause") return false;
      await this._resumeSMRuntime();
      const gameSubMode = this._getGameDevSubMode();
      this.mode = "play";
      window.__smPIEMode = "play";
      window.__smGamePaused = false;
      if (gameSubMode === "2D") {
        this.playerSystem?.setSimulationPaused?.(true);
        this.playerSystem?.setRuntimeControlActive?.(false);
      } else {
        this.playerSystem?.setSimulationPaused?.(false);
        this.playerSystem?.setRuntimeControlActive?.(true);
      }
      this.physicsSystem?.toggleSimulation?.(gameSubMode !== "2D");
      window.physicsEnabled = gameSubMode !== "2D";
      window.SM2DGameRuntime?.setPaused?.(false);
      this.pauseBtn?.classList.remove("active");
      if (this.stepBtn) this.stepBtn.disabled = true;
      return true;
    }

    stepFrame() {
      if (this.mode !== "pause") return false;
      const delta = this.fixedStep;
      console.log(`[PIE] Step Frame ${delta.toFixed(4)}s`);

      this._dispatch("sm:pie-step-before", { orchestrator: this, delta });

      if (
        this._getGameDevSubMode() === "2D" &&
        window.SM2DGameRuntime?.active
      ) {
        window.SM2DGameRuntime.step(delta);
        this._dispatch("sm:pie-step", { orchestrator: this, delta });
        return true;
      }

      if (this.physicsSystem && typeof this.physicsSystem.step === "function") {
        this.physicsSystem.step(delta);
      }
      window.ragdollSystem?.update?.(delta);
      if (this.playerSystem?.animation) {
        const wasEnabled = this.playerSystem.animation.enabled;
        this.playerSystem.animation.enabled = true;
        this.playerSystem.animation.update?.(delta);
        this.playerSystem.animation.enabled = wasEnabled;
      }
      this.playerSystem?.cameraController?.update?.(delta);

      this._dispatch("sm:pie-step", { orchestrator: this, delta });
      return true;
    }

    _captureCameraState(camera) {
      if (!camera?.isCamera) return null;
      return {
        camera,
        position: camera.position?.clone?.() || null,
        quaternion: camera.quaternion?.clone?.() || null,
        scale: camera.scale?.clone?.() || null,
        up: camera.up?.clone?.() || null,
        fov: Number.isFinite(camera.fov) ? camera.fov : null,
        zoom: Number.isFinite(camera.zoom) ? camera.zoom : null,
        near: Number.isFinite(camera.near) ? camera.near : null,
        far: Number.isFinite(camera.far) ? camera.far : null,
        aspect: Number.isFinite(camera.aspect) ? camera.aspect : null,
        focus: Number.isFinite(camera.focus) ? camera.focus : null,
        filmGauge: Number.isFinite(camera.filmGauge) ? camera.filmGauge : null,
        filmOffset: Number.isFinite(camera.filmOffset)
          ? camera.filmOffset
          : null,
        left: Number.isFinite(camera.left) ? camera.left : null,
        right: Number.isFinite(camera.right) ? camera.right : null,
        top: Number.isFinite(camera.top) ? camera.top : null,
        bottom: Number.isFinite(camera.bottom) ? camera.bottom : null,
      };
    }

    _restoreCameraState(snapshot) {
      const camera = snapshot?.camera;
      if (!camera?.isCamera) return;
      snapshot.position && camera.position.copy(snapshot.position);
      snapshot.quaternion && camera.quaternion.copy(snapshot.quaternion);
      snapshot.scale && camera.scale.copy(snapshot.scale);
      snapshot.up && camera.up.copy(snapshot.up);
      [
        "fov",
        "zoom",
        "near",
        "far",
        "aspect",
        "focus",
        "filmGauge",
        "filmOffset",
        "left",
        "right",
        "top",
        "bottom",
      ].forEach((key) => {
        if (Number.isFinite(snapshot[key]) && key in camera) {
          camera[key] = snapshot[key];
        }
      });
      camera.updateProjectionMatrix?.();
      camera.updateMatrix?.();
      camera.updateMatrixWorld?.(true);
    }

    _captureSceneVisualState(scene) {
      if (!scene) return null;
      const visibility = [];
      const lights = [];
      scene.traverse?.((object) => {
        visibility.push({ object, visible: object.visible });
        if (!object?.isLight) return;
        lights.push({
          light: object,
          visible: object.visible,
          intensity: Number.isFinite(object.intensity)
            ? object.intensity
            : null,
          color: object.color?.clone?.() || null,
          groundColor: object.groundColor?.clone?.() || null,
          distance: Number.isFinite(object.distance) ? object.distance : null,
          decay: Number.isFinite(object.decay) ? object.decay : null,
          angle: Number.isFinite(object.angle) ? object.angle : null,
          penumbra: Number.isFinite(object.penumbra) ? object.penumbra : null,
          castShadow: object.castShadow,
        });
      });
      const fog = scene.fog || null;
      return {
        scene,
        background: scene.background,
        environment: scene.environment,
        fog,
        fogColor: fog?.color?.clone?.() || null,
        fogNear: Number.isFinite(fog?.near) ? fog.near : null,
        fogFar: Number.isFinite(fog?.far) ? fog.far : null,
        fogDensity: Number.isFinite(fog?.density) ? fog.density : null,
        overrideMaterial: scene.overrideMaterial,
        visibility,
        lights,
      };
    }

    _restoreSceneVisualState(snapshot) {
      const scene = snapshot?.scene;
      if (!scene) return;
      scene.background = snapshot.background ?? null;
      scene.environment = snapshot.environment ?? null;
      scene.fog = snapshot.fog || null;
      scene.overrideMaterial = snapshot.overrideMaterial || null;
      if (scene.fog) {
        snapshot.fogColor && scene.fog.color?.copy?.(snapshot.fogColor);
        if (Number.isFinite(snapshot.fogNear) && "near" in scene.fog)
          scene.fog.near = snapshot.fogNear;
        if (Number.isFinite(snapshot.fogFar) && "far" in scene.fog)
          scene.fog.far = snapshot.fogFar;
        if (Number.isFinite(snapshot.fogDensity) && "density" in scene.fog)
          scene.fog.density = snapshot.fogDensity;
      }
      snapshot.visibility?.forEach?.(({ object, visible }) => {
        if (object) object.visible = visible;
      });
      snapshot.lights?.forEach?.((state) => {
        const light = state.light;
        if (!light?.isLight) return;
        light.visible = state.visible;
        if (Number.isFinite(state.intensity)) light.intensity = state.intensity;
        state.color && light.color?.copy?.(state.color);
        state.groundColor && light.groundColor?.copy?.(state.groundColor);
        if (Number.isFinite(state.distance) && "distance" in light)
          light.distance = state.distance;
        if (Number.isFinite(state.decay) && "decay" in light)
          light.decay = state.decay;
        if (Number.isFinite(state.angle) && "angle" in light)
          light.angle = state.angle;
        if (Number.isFinite(state.penumbra) && "penumbra" in light)
          light.penumbra = state.penumbra;
        if (typeof state.castShadow === "boolean")
          light.castShadow = state.castShadow;
      });
      scene.updateMatrixWorld?.(true);
    }

    _cacheEditorState() {
      const transformControls =
        window.transformControls ||
        window.transformControl ||
        window.gizmoManager?.transformControls ||
        null;
      const renderer =
        window.renderer || window.SMEngineRenderer?.renderer || null;
      let rendererSize = null;
      let clearColor = null;
      let clearAlpha = null;

      if (renderer?.getSize && typeof THREE !== "undefined") {
        try {
          rendererSize = renderer.getSize(new THREE.Vector2());
        } catch (_) {}
      }
      try {
        if (renderer?.getClearColor && typeof THREE !== "undefined") {
          clearColor = renderer.getClearColor(new THREE.Color()).clone();
          clearAlpha = renderer.getClearAlpha?.();
        }
      } catch (_) {}

      const cameraCandidates = [
        window.camera,
        window.cameraSystem?.camera,
        window.cameraSystem?.activeCamera,
        window._activeRenderCamera,
        window._viewedCamera,
        window.controls?.object,
      ].filter((camera) => camera?.isCamera);

      const cameraSnapshots = [];
      const seenCameras = new Set();
      cameraCandidates.forEach((camera) => {
        if (seenCameras.has(camera)) return;
        seenCameras.add(camera);
        const snapshot = this._captureCameraState(camera);
        snapshot && cameraSnapshots.push(snapshot);
      });

      this.editorState = {
        selectedObject:
          window.selectedObject || window.currentSelectedObject || null,
        transformObject: transformControls?.object || null,
        controlsEnabled: window.controls?.enabled ?? true,
        controlsObject:
          window.controls?.object ||
          window.cameraSystem?.camera ||
          window.camera ||
          null,
        controlsTarget: window.controls?.target?.clone?.() || null,
        windowCamera: window.camera || null,
        cameraSystemCamera: window.cameraSystem?.camera || null,
        cameraSystemActiveCamera: window.cameraSystem?.activeCamera || null,
        activeRenderCamera: window._activeRenderCamera || null,
        viewedCamera: window._viewedCamera || null,
        cameraSnapshots,
        sceneVisualState: this._captureSceneVisualState(
          this.scene || window.scene,
        ),
        rendererState: renderer
          ? {
              pixelRatio: renderer.getPixelRatio?.() || 1,
              width: rendererSize?.x || renderer.domElement?.width || 1,
              height: rendererSize?.y || renderer.domElement?.height || 1,
              shadowMapEnabled: renderer.shadowMap?.enabled,
              shadowMapType: renderer.shadowMap?.type,
              toneMapping: renderer.toneMapping,
              toneMappingExposure: renderer.toneMappingExposure,
              outputColorSpace: renderer.outputColorSpace,
              outputEncoding: renderer.outputEncoding,
              autoClear: renderer.autoClear,
              clearColor,
              clearAlpha,
            }
          : null,
      };
    }

    _getPlayRenderer() {
      return window.renderer || window.SMEngineRenderer?.renderer || null;
    }

    _getPlayRenderHost() {
      // IMPORTANT: once the renderer canvas is moved into the native Game
      // Window, all sizing must come from that window, not the editor.
      const gameSurface = this._gameWindow?.closed
        ? null
        : this._gameWindow?.document?.getElementById("sm-game-surface");
      if (
        gameSurface &&
        gameSurface.clientWidth > 1 &&
        gameSurface.clientHeight > 1
      ) {
        return gameSurface;
      }

      const renderer = this._getPlayRenderer();
      const canvas = renderer?.domElement || null;
      const directParent = canvas?.parentElement || null;
      if (
        directParent &&
        directParent.clientWidth > 1 &&
        directParent.clientHeight > 1
      ) {
        return directParent;
      }
      const candidates = [
        document.getElementById("game-view"),
        document.getElementById("game-view-content"),
        document.getElementById("game-viewport"),
        document.getElementById("renderer-container"),
        document.getElementById("editor-scene"),
      ];
      return (
        candidates.find(
          (element) =>
            element && element.clientWidth > 1 && element.clientHeight > 1,
        ) || document.documentElement
      );
    }

    _getPlayQualityConfig() {
      const manifestRenderer =
        window.SMGameProjectRuntime?.activeManifest?.renderer || {};
      const requested = String(
        manifestRenderer.quality ||
          manifestRenderer.qualityPreset ||
          window.SMEngineRenderer?.qualityPreset ||
          "HIGH",
      ).toUpperCase();

      const preset = ["LOW", "MEDIUM", "HIGH", "ULTRA"].includes(requested)
        ? requested
        : "HIGH";

      const presetScale = {
        LOW: 0.85,
        MEDIUM: 1.0,
        HIGH: 1.0,
        ULTRA: 1.0,
      }[preset];

      const requestedScale = Number(
        manifestRenderer.renderScale ??
          manifestRenderer.resolutionScale ??
          presetScale,
      );
      const renderScale = Number.isFinite(requestedScale)
        ? Math.min(1.25, Math.max(0.5, requestedScale))
        : presetScale;

      // IMPORTANT: use the native Game Window DPR, not the editor DPR.
      const gameDpr =
        this._gameWindow && !this._gameWindow.closed
          ? Number(this._gameWindow.devicePixelRatio)
          : Number(window.devicePixelRatio);
      const deviceDpr = Math.max(1, Number.isFinite(gameDpr) ? gameDpr : 1);

      const dprCap = {
        LOW: 1.0,
        MEDIUM: 1.5,
        HIGH: 2.0,
        ULTRA: 2.5,
      }[preset];

      const requestedPixelRatio = Math.min(dprCap, deviceDpr) * renderScale;

      // Avoid enormous GPU backbuffers on 1440p/4K/HiDPI displays.
      const host = this._getPlayRenderHost?.();
      const width = Math.max(1, Number(host?.clientWidth) || 1);
      const height = Math.max(1, Number(host?.clientHeight) || 1);
      const nativePixels = width * height;
      const budgetByPreset = {
        LOW: 2.0e6,
        MEDIUM: 4.0e6,
        HIGH: 6.5e6,
        ULTRA: 9.0e6,
      }[preset];
      const budgetRatio = Math.sqrt(
        budgetByPreset / Math.max(1, nativePixels),
      );
      const budgetLimitedRatio = Math.min(requestedPixelRatio, budgetRatio);

      const perf = this._gamePerf;
      if (perf) {
        perf.minPixelRatio = preset === "LOW" ? 0.75 : 0.80;
        perf.budgetMaxPixelRatio = Math.max(
          perf.minPixelRatio,
          Math.min(requestedPixelRatio, budgetRatio),
        );
        perf.maxPixelRatio = perf.budgetMaxPixelRatio;
        perf.pixelBudget = budgetByPreset;
      }

      return {
        preset,
        renderScale,
        pixelRatio: Math.max(
          perf?.minPixelRatio || 0.75,
          Math.min(
            budgetLimitedRatio,
            perf?.maxPixelRatio || requestedPixelRatio,
          ),
        ),
        devicePixelRatio: deviceDpr,
        pixelBudget: budgetByPreset,
      };
    }

    _syncPlayRenderSurface() {
      const renderer = this._getPlayRenderer();
      const camera = window._gameRenderCamera || window.gameCamera || null;
      if (!renderer) return false;

      const host = this._getPlayRenderHost();
      const width = Math.max(
        1,
        Math.round(host?.clientWidth || window.innerWidth || 1),
      );
      const height = Math.max(
        1,
        Math.round(host?.clientHeight || window.innerHeight || 1),
      );
      const quality = this._getPlayQualityConfig();

      try {
        const currentPixelRatio = Number(renderer.getPixelRatio?.() || 1);
        if (Math.abs(currentPixelRatio - quality.pixelRatio) > 0.01) {
          renderer.setPixelRatio?.(quality.pixelRatio);
        }
        if (this._gamePerf) {
          this._gamePerf.currentPixelRatio = Number(
            renderer.getPixelRatio?.() || quality.pixelRatio,
          );
        }
        const currentSize =
          renderer.getSize && typeof THREE !== "undefined"
            ? renderer.getSize(new THREE.Vector2())
            : null;
        if (
          !currentSize ||
          Math.abs(currentSize.x - width) > 1 ||
          Math.abs(currentSize.y - height) > 1
        ) {
          renderer.setSize?.(width, height, false);
        }
      } catch (error) {
        console.warn("[PIE Quality] Renderer resize failed:", error);
      }

      if (camera?.isPerspectiveCamera) {
        const nextAspect = width / Math.max(1, height);
        if (Math.abs(camera.aspect - nextAspect) > 0.0001) {
          camera.aspect = nextAspect;
          camera.updateProjectionMatrix?.();
        }
      } else if (camera?.isOrthographicCamera) {
        camera.updateProjectionMatrix?.();
      }
      return true;
    }

    _renderGameFrame() {
      if (this.mode !== "play" && this.mode !== "pause") return false;

      const renderer = this._getPlayRenderer();
      const scene = this.scene || window.scene;
      const camera = window._gameRenderCamera || window.gameCamera || null;
      if (!renderer || !scene || !camera?.isCamera) return false;

      // Keep every renderer/camera selector used by the engine pointed at
      // the actual Play camera. This is important because the canvas is
      // now hosted by the separate Game Window.
      window._activeRenderCamera = camera;
      window._viewedCamera = camera;
      if (window.SMEngineRenderer) {
        window.SMEngineRenderer.activeRenderCamera = camera;
      }

      try {
        const canvas = renderer.domElement;
        const width = Math.max(1, canvas.clientWidth || canvas.width || 1);
        const height = Math.max(1, canvas.clientHeight || canvas.height || 1);

        renderer.setRenderTarget?.(null);
        renderer.setViewport?.(0, 0, width, height);
        renderer.setScissorTest?.(false);
        renderer.autoClear = true;

        // Do not overwrite a project-owned sky/environment every frame.
        if (!scene.background) {
          const mode = this._getWorkspaceMode();
          const clearColor =
            mode === "GAMEPLAY_SAMPLE"
              ? 0x9f92ad
              : mode === "GAME_DEV"
                ? 0x9fb6c8
                : 0x393939;
          renderer.setClearColor?.(clearColor, 1);
        }

        scene.updateMatrixWorld?.(true);
        camera.updateMatrixWorld?.(true);
        renderer.render(scene, camera);
        return true;
      } catch (error) {
        console.warn("[PIE] Game Window render failed:", error);
        return false;
      }
    }

    _upgradeTextureSamplingForPlay() {
      const renderer = this._getPlayRenderer();
      const scene = this.scene || window.scene;
      if (!renderer || !scene?.traverse) return;
      const quality = this._getPlayQualityConfig();
      if (quality.preset === "LOW") return;

      const maxAnisotropy = Math.max(
        1,
        Number(renderer.capabilities?.getMaxAnisotropy?.()) || 1,
      );
      const wanted = Math.min(
        maxAnisotropy,
        quality.preset === "ULTRA" ? 16 : 8,
      );
      const visited = new Set();

      scene.traverse((object) => {
        if (!object?.isMesh && !object?.isPoints && !object?.isLine) return;
        const materials = Array.isArray(object.material)
          ? object.material
          : [object.material];
        materials.forEach((material) => {
          if (!material || visited.has(material)) return;
          visited.add(material);
          Object.keys(material).forEach((key) => {
            const texture = material[key];
            if (!texture?.isTexture) return;
            if (texture.anisotropy < wanted) {
              texture.anisotropy = wanted;
              texture.needsUpdate = true;
            }
          });
        });
      });
    }

    _updateGamePerformance(frameMs) {
      const perf = this._gamePerf;
      if (!perf?.enabled || this.mode !== "play") return;
      if (!Number.isFinite(frameMs) || frameMs <= 0 || frameMs > 250) return;

      perf.sampleFrames++;
      perf.sampleTime += frameMs;

      if (frameMs > perf.lowerThresholdMs) {
        perf.slowFrames++;
        perf.fastFrames = 0;
      } else if (frameMs < perf.upperThresholdMs) {
        perf.fastFrames++;
        perf.slowFrames = 0;
      } else {
        perf.slowFrames = Math.max(0, perf.slowFrames - 1);
        perf.fastFrames = Math.max(0, perf.fastFrames - 1);
      }

      const now = performance.now();
      if (now - perf.lastAdjustTime < perf.adjustIntervalMs) return;
      if (perf.sampleFrames < 20) return;

      const averageMs = perf.sampleTime / perf.sampleFrames;
      perf.sampleFrames = 0;
      perf.sampleTime = 0;

      const renderer = this._getPlayRenderer();
      if (!renderer) return;

      const quality = this._getPlayQualityConfig();
      const current = Number(
        renderer.getPixelRatio?.() || quality.pixelRatio,
      );
      let next = current;

      if (perf.slowFrames >= 12 || averageMs > 18.5) {
        next = Math.max(perf.minPixelRatio, current - 0.08);
        perf.slowFrames = 0;
        perf.fastFrames = 0;
      } else if (perf.fastFrames >= 30 && averageMs < 12.5) {
        next = Math.min(perf.maxPixelRatio, current + 0.03);
        perf.slowFrames = 0;
        perf.fastFrames = 0;
      } else {
        return;
      }

      if (Math.abs(next - current) < 0.04) return;
      perf.lastAdjustTime = now;

      const finalRatio = Number(next.toFixed(2));
      renderer.setPixelRatio?.(finalRatio);
      perf.currentPixelRatio = Number(
        renderer.getPixelRatio?.() || finalRatio,
      );

      const host = this._getPlayRenderHost();
      const width = Math.max(1, Math.round(host?.clientWidth || 1));
      const height = Math.max(1, Math.round(host?.clientHeight || 1));
      renderer.setSize?.(width, height, false);
    }

    _applyPlayRenderQuality() {
      const renderer = this._getPlayRenderer();
      if (!renderer) return false;
      const quality = this._getPlayQualityConfig();

      if (renderer.shadowMap) {
        renderer.shadowMap.enabled = true;
        if (
          quality.preset !== "LOW" &&
          typeof THREE !== "undefined" &&
          THREE.PCFSoftShadowMap !== undefined
        ) {
          renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        }
        renderer.shadowMap.needsUpdate = true;

        // Interactive Play should not inherit unnecessarily large shadow
        // maps from the editor. Keep ULTRA at 4096; use 2048 otherwise.
        const playShadowMapSize = quality.preset === "ULTRA" ? 4096 : 2048;
        this.scene?.traverse?.((object) => {
          if (!object?.isLight || !object.castShadow || !object.shadow?.mapSize) return;
          if (Number(object.shadow.mapSize.x || 0) <= playShadowMapSize) return;
          object.shadow.mapSize.set(playShadowMapSize, playShadowMapSize);
          object.shadow.map?.dispose?.();
          object.shadow.needsUpdate = true;
        });
      }

      window.SMEngineRenderer?.setQualityPreset?.(quality.preset);
      window.SMEngineRenderer?.setQuality?.(quality.preset);
      window.SMEngineRenderer &&
        (window.SMEngineRenderer.renderScale = quality.renderScale);

      this._upgradeTextureSamplingForPlay();
      this._syncPlayRenderSurface();
      return true;
    }

    _startPlayRenderQualityObserver() {
      this._stopPlayRenderQualityObserver();
      const host = this._getPlayRenderHost();
      if (typeof ResizeObserver !== "undefined" && host) {
        this._playResizeObserver = new ResizeObserver(() => {
          cancelAnimationFrame(this._playResizeFrame);
          this._playResizeFrame = requestAnimationFrame(() => {
            if (this.mode === "play" || this.mode === "pause") {
              this._syncPlayRenderSurface();
            }
          });
        });
        this._playResizeObserver.observe(host);
      }
      window.addEventListener(
        "resize",
        this._boundPlayResize ||
          (this._boundPlayResize = () => {
            if (this.mode === "play" || this.mode === "pause") {
              this._syncPlayRenderSurface();
            }
          }),
      );
    }

    _stopPlayRenderQualityObserver() {
      this._playResizeObserver?.disconnect?.();
      this._playResizeObserver = null;
      cancelAnimationFrame(this._playResizeFrame);
      this._playResizeFrame = 0;
      if (this._boundPlayResize) {
        window.removeEventListener("resize", this._boundPlayResize);
      }
    }

    _restorePlayRenderQuality() {
      const state = this.editorState?.rendererState;
      const renderer = this._getPlayRenderer();
      if (!state || !renderer) return;

      try {
        renderer.setPixelRatio?.(state.pixelRatio || 1);
        renderer.setSize?.(
          Math.max(1, state.width || 1),
          Math.max(1, state.height || 1),
          false,
        );
        if (renderer.shadowMap) {
          if (typeof state.shadowMapEnabled === "boolean") {
            renderer.shadowMap.enabled = state.shadowMapEnabled;
          }
          if (state.shadowMapType !== undefined) {
            renderer.shadowMap.type = state.shadowMapType;
          }
          renderer.shadowMap.needsUpdate = true;
        }
        if (state.toneMapping !== undefined)
          renderer.toneMapping = state.toneMapping;
        if (Number.isFinite(state.toneMappingExposure))
          renderer.toneMappingExposure = state.toneMappingExposure;
        if (
          state.outputColorSpace !== undefined &&
          "outputColorSpace" in renderer
        )
          renderer.outputColorSpace = state.outputColorSpace;
        if (state.outputEncoding !== undefined && "outputEncoding" in renderer)
          renderer.outputEncoding = state.outputEncoding;
        if (typeof state.autoClear === "boolean")
          renderer.autoClear = state.autoClear;
        if (state.clearColor && renderer.setClearColor) {
          renderer.setClearColor(
            state.clearColor,
            Number.isFinite(state.clearAlpha) ? state.clearAlpha : 1,
          );
        }
      } catch (error) {
        console.warn(
          "[PIE Quality] Failed to restore editor renderer state:",
          error,
        );
      }
    }

    _cameraTargetsPlayer(camera) {
      if (!camera?.isCamera) return false;
      const player =
        this.playerSystem?.model ||
        this.playerSystem?.character?.model ||
        window.playerSystem?.model ||
        window.playerSystem?.character?.model ||
        null;
      if (!player) return false;

      const data = camera.userData || {};
      const targets = [
        camera.target,
        data.target,
        data.cameraTarget,
        data.followTarget,
        data.lookAtTarget,
        data.targetObject,
        data.targetObjectUuid,
        data.targetUuid,
        data.targetId,
        data.targetName,
      ];
      const playerTokens = new Set(
        [
          String(player.uuid || "").toLowerCase(),
          String(player.name || "").toLowerCase(),
          "player",
        ].filter(Boolean),
      );

      return targets.some((target) => {
        if (!target) return false;
        if (target === player) return true;
        if (target?.isObject3D) {
          let current = target;
          while (current) {
            if (current === player) return true;
            current = current.parent;
          }
          return false;
        }
        return playerTokens.has(String(target).trim().toLowerCase());
      });
    }

    _findAuthoredGameplayCamera() {
      const scene = this.scene || window.scene;
      if (!scene?.traverse) return null;
      const editorCameras = new Set(
        [
          window.camera,
          window.cameraSystem?.camera,
          window.cameraSystem?.orthographicCamera,
          window.orthographicCamera,
        ].filter(Boolean),
      );

      const runtimeCamera =
        this.playerSystem?.playerCamera ||
        window.playerSystem?.playerCamera ||
        null;
      const cameras = [];

      scene.traverse((object) => {
        if (!object?.isCamera || object === runtimeCamera) return;
        if (object.userData?.isRuntimeCamera) return;
        if (editorCameras.has(object)) return;
        cameras.push(object);
      });

      if (!cameras.length) return null;

      const selected =
        window.selectedObject ||
        window.currentSelectedObject ||
        window.selectionManager?.selectedObject ||
        null;

      if (selected?.isCamera && cameras.includes(selected)) {
        return selected;
      }

      const targeted = cameras.find((camera) =>
        this._cameraTargetsPlayer(camera),
      );
      if (targeted) return targeted;

      const marked = cameras.find((camera) => {
        const data = camera.userData || {};
        return (
          data.isGameplayCamera === true ||
          data.cameraRole === "gameplay" ||
          data.cameraRole === "player" ||
          data.useForPlay === true
        );
      });
      if (marked) return marked;

      const named = cameras.find((camera) =>
        /(^|[_\- ])(game|gameplay|player|main|play)([_\- ]|$)/i.test(
          String(camera.name || ""),
        ),
      );
      return named || cameras[0];
    }

    _findPlayerCamera() {
      const authoredCamera =
        window._smGameplayCamera || this._findAuthoredGameplayCamera();
      if (authoredCamera?.isCamera) {
        return authoredCamera;
      }

      const runtimePlayerCamera =
        this.playerSystem?.playerCamera ||
        window.playerSystem?.playerCamera ||
        null;
      if (runtimePlayerCamera?.isCamera) {
        return runtimePlayerCamera;
      }

      const player =
        window.playerSystem?.model ||
        window.playerSystem?.character?.model ||
        null;
      if (!player) return null;

      let gameplayCamera = null;
      let firstCamera = null;
      player.traverse((obj) => {
        if (!obj?.isCamera) return;
        if (!firstCamera) firstCamera = obj;
        if (
          obj.userData?.isGameplayCamera === true ||
          obj.userData?.cameraRole === "gameplay"
        ) {
          gameplayCamera = obj;
        }
      });
      return gameplayCamera || firstCamera;
    }

    _activateGameCamera() {
      const gameSubMode = this._getGameDevSubMode();
      const playerModel =
        this.playerSystem?.character?.model || this.playerSystem?.model;

      // 1. 2D owns an orthographic sprite-world camera. It must not use
      // the 3D player follow camera or a 3D character as its target.
      if (gameSubMode === "2D") {
        const orthoCam =
          window.SM2DGameRuntime?.camera ||
          window.cameraSystem?.orthographicCamera ||
          window.camera;
        if (orthoCam) {
          if (!window.SM2DGameRuntime?.active && playerModel) {
            orthoCam.position.set(
              playerModel.position.x,
              playerModel.position.y + 1.5,
              50,
            );
          }
          if (!window.SM2DGameRuntime?.active) {
            orthoCam.lookAt(orthoCam.position.x, orthoCam.position.y + 1.5, 0);
          }
          orthoCam.updateProjectionMatrix?.();

          window._gameRenderCamera = orthoCam;
          window.gameCamera = orthoCam;
          window._activeRenderCamera = orthoCam;
          window._viewedCamera = orthoCam;
          window._gameCameraActive = true;
          if (window.SMEngineRenderer)
            window.SMEngineRenderer.activeRenderCamera = orthoCam;
          return true;
        }
      }

      // 2. In 2.5D Mode: Use Locked Side-View Perspective Camera (Z=18)
      if (gameSubMode === "2.5D") {
        const cam = window.cameraSystem?.camera || window.camera;
        if (cam) {
          const py = playerModel ? playerModel.position.y + 2.5 : 2.5;
          const px = playerModel ? playerModel.position.x : 0;
          cam.position.set(px, py, 18);
          cam.rotation.set(0, 0, 0);
          cam.lookAt(px, py, 0);
          cam.updateProjectionMatrix?.();

          window._gameRenderCamera = cam;
          window.gameCamera = cam;
          window._activeRenderCamera = cam;
          window._viewedCamera = cam;
          window._gameCameraActive = true;
          if (window.SMEngineRenderer)
            window.SMEngineRenderer.activeRenderCamera = cam;
          return true;
        }
      }

      // 3. In 3D Mode: Standard Player Third-Person Follow Camera
      const cam = this._findPlayerCamera();
      if (!cam) {
        console.warn("[PIE] No Camera found inside Player.");
        window._gameRenderCamera = null;
        window.gameCamera = null;
        window._gameCameraActive = false;
        return false;
      }

      const runtimePlayerCamera =
        this.playerSystem?.playerCamera ||
        window.playerSystem?.playerCamera ||
        null;
      const usingRuntimePlayerCamera = runtimePlayerCamera === cam;

      if (usingRuntimePlayerCamera) {
        const possessed = this.playerSystem?.possessCamera?.() === true;
        if (!possessed) {
          console.warn(
            "[PIE] Player camera could not be possessed; using fallback.",
          );
        }
      } else {
        if (this.playerSystem?.movement) {
          this.playerSystem.movement.camera = cam;
        }
        window._smGameplayCamera = cam;
      }

      cam.userData = cam.userData || {};
      cam.userData.isGameplayCamera = true;
      cam.userData.cameraRole = "gameplay";
      cam.userData.useForPlay = true;
      cam.updateMatrixWorld(true);

      window._gameRenderCamera = cam;
      window.gameCamera = cam;
      window._activeRenderCamera = cam;
      window._viewedCamera = cam;
      window._gameCameraActive = true;
      if (window.SMEngineRenderer) {
        window.SMEngineRenderer.activeRenderCamera = cam;
      }

      console.log("[PIE] Gameplay Camera activated:", cam.name || "Camera");
      return true;
    }

    _deactivateGameCamera() {
      const gameSubMode = this._getGameDevSubMode();
      if (gameSubMode === "3D") {
        const runtimePlayerCamera =
          this.playerSystem?.playerCamera ||
          window.playerSystem?.playerCamera ||
          null;
        if (
          runtimePlayerCamera &&
          this._findPlayerCamera() === runtimePlayerCamera
        ) {
          this.playerSystem?.releaseCamera?.();
        }
      }

      window._smGameplayCamera = null;
      window._gameCameraActive = false;
      window._gameRenderCamera = null;
      window.gameCamera = null;
      if (window.SMEngineRenderer) {
        window.SMEngineRenderer.activeRenderCamera = null;
      }
    }

    _startGameModeLoop() {
      this._stopGameModeLoop();

      // Use one clock for both the RAF timestamp and delta calculation.
      // The opener and popup have different performance.timeOrigin values.
      const rafHost =
        this._gameWindow && !this._gameWindow.closed
          ? this._gameWindow
          : window;
      this._lastGameLoopTime = rafHost.performance?.now?.() ?? performance.now();

      window.__smExternalGameWindowOwnsFrameLoop = true;

      // Use the popup's own RAF — it's the window that stays focused/visible
      // while the user plays, so its rAF won't get background-throttled.
      this._gameModeLoopHost = rafHost;
      this._gameModeLoopRAF = rafHost.requestAnimationFrame(
        this._updateGameModeLoop,
      );
    }

    _stopGameModeLoop() {
      if (this._gamePerf) {
        this._gamePerf.lastSampleTime = 0;
        this._gamePerf.sampleFrames = 0;
        this._gamePerf.sampleTime = 0;
        this._gamePerf.slowFrames = 0;
        this._gamePerf.fastFrames = 0;
        this._gamePerf.lastAdjustTime = 0;
        this._gamePerf.currentPixelRatio = 0;
      }
      if (this._gameModeLoopRAF) {
        const rafHost = this._gameModeLoopHost || window;
        try {
          (rafHost.cancelAnimationFrame || window.cancelAnimationFrame).call(
            rafHost,
            this._gameModeLoopRAF,
          );
        } catch (_) {
          // Popup may already be closed/torn down.
          try {
            window.cancelAnimationFrame(this._gameModeLoopRAF);
          } catch (_) {}
        }
        this._gameModeLoopRAF = 0;
      }
      this._gameModeLoopHost = null;
      window.__smExternalGameWindowOwnsFrameLoop = false;
    }

    _updateGameModeLoop(now) {
      if (this.mode !== "play") {
        window.__smExternalGameWindowOwnsFrameLoop = false;
        return;
      }

      const frameStart = performance.now();
      const rafHost =
        this._gameWindow && !this._gameWindow.closed
          ? this._gameWindow
          : window;
      // Use the same performance clock as the RAF owner. This avoids mixing
      // the opener and popup time origins and removes first-frame delta jitter.
      const currentNow = Number.isFinite(rafHost.performance?.now?.())
        ? rafHost.performance.now()
        : (Number.isFinite(now) ? now : frameStart);
      const rawDelta = Math.max(
        0,
        Math.min(
          0.1,
          (currentNow - (this._lastGameLoopTime || currentNow)) / 1000,
        ),
      );
      this._lastGameLoopTime = currentNow;
      // Keep animation time close to real time when a frame takes longer than 33 ms.
      // The runtime systems already receive the measured rawDelta; the 50 ms cap
      // prevents a single hitch from producing an explosive simulation step.
      const delta = Math.min(rawDelta, 0.05);
      const time = currentNow * 0.001;

      try {
        // Keep the existing 2D/2.5D camera constraints before the central
        // frame update. The central frame then updates physics, player
        // movement, animation mixers, scripts, sky, FX, materials, etc.
        const gameSubMode = this._getGameDevSubMode();
        const player = this.playerSystem || window.playerSystem;
        const playerModel = player?.character?.model || player?.model;

        if (playerModel) {
          if (gameSubMode === "2D") {
            playerModel.position.z = 0;
            const cam = window._gameRenderCamera;
            if (cam) {
              cam.position.x = THREE.MathUtils.lerp(
                cam.position.x,
                playerModel.position.x,
                0.1,
              );
              cam.position.y = THREE.MathUtils.lerp(
                cam.position.y,
                playerModel.position.y + 1.5,
                0.1,
              );
              cam.position.z = 50;
              cam.lookAt(cam.position.x, cam.position.y, 0);
            }
          } else if (gameSubMode === "2.5D") {
            playerModel.position.z = 0;
            const cam = window._gameRenderCamera;
            if (cam) {
              cam.position.x = THREE.MathUtils.lerp(
                cam.position.x,
                playerModel.position.x,
                0.1,
              );
              cam.position.y = THREE.MathUtils.lerp(
                cam.position.y,
                playerModel.position.y + 2.5,
                0.1,
              );
              cam.position.z = 18;
              cam.lookAt(cam.position.x, cam.position.y, 0);
            }
          }
        }

        // IMPORTANT: use the central engine frame here instead of only
        // renderer.render(). smRenderFrame() is where SM Engine advances
        // physics, SMPlayerSystem, animation, camera controllers, scripts,
        // FX, sky/environment and other real-time systems.
        //
        // render=false is NOT used: when the external Game Window is
        // active, animate-loop's external render path sends this frame to
        // the moved canvas in the Game Window.
        if (typeof window.smRenderFrame === "function") {
          window.smRenderFrame({
            rawDelta,
            delta,
            time,
          });
        } else {
          // Minimal compatibility fallback for builds where the central
          // frame function is not exposed.
          player?.update?.(delta);
          player?.animation?.update?.(delta);
          window.physicsSystem?.update?.(delta);
          window.ragdollSystem?.update?.(delta);
          player?.cameraController?.update?.(delta);
          this._renderGameFrame?.();
        }
      } catch (error) {
        console.error("[PIE] External Game Window frame update failed:", error);
      } finally {
        this._updateGamePerformance(performance.now() - frameStart);
      }

      this._gameModeLoopHost = rafHost;
      this._gameModeLoopRAF = rafHost.requestAnimationFrame(
        this._updateGameModeLoop,
      );
    }

    _applyEditorStateSnapshot(state, { restoreRenderer = false } = {}) {
      if (!state) return;
      if (restoreRenderer) {
        const currentState = this.editorState;
        this.editorState = state;
        this._restorePlayRenderQuality?.();
        this.editorState = currentState;
      }

      this._restoreSceneVisualState?.(state.sceneVisualState);
      state.cameraSnapshots?.forEach?.((snapshot) => {
        this._restoreCameraState?.(snapshot);
      });

      if (state.windowCamera?.isCamera) {
        window.camera = state.windowCamera;
      }
      if (window.cameraSystem) {
        try {
          if (state.cameraSystemCamera?.isCamera) {
            window.cameraSystem.camera = state.cameraSystemCamera;
          }
        } catch (_) {}
        try {
          if (state.cameraSystemActiveCamera?.isCamera) {
            window.cameraSystem.activeCamera = state.cameraSystemActiveCamera;
          }
        } catch (_) {}
      }

      const restoredRenderCamera =
        state.activeRenderCamera ||
        state.viewedCamera ||
        state.controlsObject ||
        state.cameraSystemActiveCamera ||
        state.cameraSystemCamera ||
        state.windowCamera ||
        window.camera ||
        null;

      window._activeRenderCamera = restoredRenderCamera;
      window._viewedCamera = state.viewedCamera || restoredRenderCamera || null;
      window._gameRenderCamera = null;
      window.gameCamera = null;
      window._gameCameraActive = false;

      if (window.SMEngineRenderer) {
        window.SMEngineRenderer.activeRenderCamera = restoredRenderCamera;
      }

      const renderer = this._getPlayRenderer?.();
      const rendererState = state.rendererState;
      if (renderer && rendererState) {
        try {
          if (rendererState.toneMapping !== undefined)
            renderer.toneMapping = rendererState.toneMapping;
          if (Number.isFinite(rendererState.toneMappingExposure))
            renderer.toneMappingExposure = rendererState.toneMappingExposure;
          if (
            rendererState.outputColorSpace !== undefined &&
            "outputColorSpace" in renderer
          )
            renderer.outputColorSpace = rendererState.outputColorSpace;
          if (
            rendererState.outputEncoding !== undefined &&
            "outputEncoding" in renderer
          )
            renderer.outputEncoding = rendererState.outputEncoding;
          if (rendererState.clearColor && renderer.setClearColor) {
            renderer.setClearColor(
              rendererState.clearColor,
              Number.isFinite(rendererState.clearAlpha)
                ? rendererState.clearAlpha
                : 1,
            );
          }
        } catch (_) {}
      }

      window.render?.();
      window.SMViewportSystem?.render?.();
    }

    _scheduleEditorStateReassert(state) {
      if (!state) return;
      const reassert = () => {
        if (this.mode !== "edit" || window.__smGameRunning === true) return;
        this._applyEditorStateSnapshot?.(state, { restoreRenderer: false });
        if (window.controls) {
          if (
            state.controlsObject &&
            window.controls.object !== state.controlsObject
          ) {
            window.controls.object = state.controlsObject;
          }
          if (state.controlsTarget && window.controls.target) {
            window.controls.target.copy(state.controlsTarget);
          }
          window.controls.enabled = state.controlsEnabled;
          window.controls.update?.();
        }
      };
      requestAnimationFrame(() => {
        requestAnimationFrame(reassert);
      });
      setTimeout(reassert, 80);
    }

    _restoreEditorState() {
      if (!this.editorState) return;
      const state = this.editorState;
      this._restorePlayRenderQuality?.();

      const transformControls =
        window.transformControls ||
        window.transformControl ||
        window.gizmoManager?.transformControls ||
        null;

      if (state.transformObject && transformControls) {
        transformControls.attach?.(state.transformObject);
        transformControls.visible = true;
      }

      this._applyEditorStateSnapshot?.(state, { restoreRenderer: false });

      if (window.controls) {
        if (
          state.controlsObject &&
          window.controls.object !== state.controlsObject
        ) {
          window.controls.object = state.controlsObject;
        }
        if (state.controlsTarget && window.controls.target) {
          window.controls.target.copy(state.controlsTarget);
        }
        window.controls.enabled = state.controlsEnabled;
        window.controls.update?.();
      }

      this._scheduleEditorStateReassert?.(state);
      this.editorState = null;
    }

    _isInsidePlayer(object) {
      let current = object;
      while (current) {
        if (
          current.userData?.isPlayerRoot ||
          current === this.playerSystem?.model
        ) {
          return current !== object;
        }
        current = current.parent;
      }
      return false;
    }

    _shouldBackupObject(object) {
      if (!object || !object.parent) return false;
      if (object === this.scene) return false;
      if (object.isBone) return false;
      if (object.isSkeleton) return false;
      if (object.isCameraHelper || object.type === "CameraHelper") return false;
      if (object.userData?.isCameraHelper || object.userData?.isRuntimeCamera)
        return false;
      if (object.userData?.isPlayerVisual || this._isInsidePlayer(object))
        return false;
      if (object.userData?.isSystemObject && !object.userData?.isPlayerRoot)
        return false;
      return true;
    }

    _cacheSceneTransforms() {
      this.sceneBackup = [];
      this.scene?.traverse?.((object) => {
        if (!this._shouldBackupObject(object)) return;
        this.sceneBackup.push({
          uuid: object.uuid,
          position: object.position.clone(),
          quaternion: object.quaternion.clone(),
          scale: object.scale.clone(),
          visible: object.visible,
        });
      });
      console.log(`[PIE] Cached ${this.sceneBackup.length} scene transforms.`);
    }

    _restoreSceneTransforms() {
      if (!Array.isArray(this.sceneBackup)) return;
      for (const data of this.sceneBackup) {
        const object = this.scene?.getObjectByProperty?.("uuid", data.uuid);
        if (!object) continue;
        object.position.copy(data.position);
        object.quaternion.copy(data.quaternion);
        object.scale.copy(data.scale);
        object.visible = data.visible;
        object.updateMatrix?.();
        object.updateMatrixWorld?.(true);

        if (
          this.physicsSystem &&
          typeof this.physicsSystem.resetVelocity === "function"
        ) {
          this.physicsSystem.resetVelocity(object);
        }
      }

      this.playerSystem?.movement?.velocity?.set?.(0, 0, 0);
      this.playerSystem?.movement?.desiredVelocity?.set?.(0, 0, 0);
      this.playerSystem?.movement?.syncGroundHeight?.();

      this.sceneBackup = null;
      window.hierarchyManager?.renderAll?.();
      if (typeof window.updateHierarchy === "function") {
        window.updateHierarchy();
      }
    }

    _updateToolbar() {
      const terrainPlaying =
        this._isTerrainWorkspace() &&
        this._getTerrainPlayerBridge()?.state?.playing === true;
      const globalPlaying = this.mode === "play" || this.mode === "pause";
      const playing = globalPlaying || terrainPlaying;
      const paused = this.mode === "pause";

      if (this.playBtn) {
        this.playBtn.classList.toggle("active", playing);
        this.playBtn.innerHTML = playing
          ? '<i class="fas fa-stop"></i>'
          : '<i class="fas fa-play"></i>';
        this.playBtn.title = terrainPlaying
          ? "Stop Terrain Test"
          : playing
            ? "Stop Game"
            : this._isTerrainWorkspace()
              ? "Play Terrain Test"
              : "Play Game";
      }

      if (this.pauseBtn) {
        this.pauseBtn.disabled = terrainPlaying || !playing;
        this.pauseBtn.classList.toggle("active", paused);
        this.pauseBtn.innerHTML = paused
          ? '<i class="fas fa-play"></i>'
          : '<i class="fas fa-pause"></i>';
        this.pauseBtn.title = paused ? "Resume Simulation" : "Pause Simulation";
      }

      if (this.stepBtn) {
        this.stepBtn.disabled = !paused;
        this.stepBtn.classList.toggle("active", paused);
      }

      document.body.classList.toggle("sm-pie-running", globalPlaying);
      document.body.classList.toggle("sm-pie-paused", paused);
    }

    _dispatch(type, detail = {}) {
      window.dispatchEvent(new CustomEvent(type, { detail }));
    }

    get isPlaying() {
      return this.mode === "play";
    }
    get isPaused() {
      return this.mode === "pause";
    }
    get isEditing() {
      return this.mode === "edit";
    }

    dispose() {
      this._stopPlayRenderQualityObserver?.();
      this._stopGameModeLoop();
      this._closeGameWindow();

      this.playBtn?.removeEventListener("click", this._onPlayClick);
      this.pauseBtn?.removeEventListener("click", this._onPauseClick);
      this.stepBtn?.removeEventListener("click", this._onStepClick);

      window.removeEventListener(
        "sm:terrain-play-start",
        this._onTerrainPlayStateChange,
      );
      window.removeEventListener(
        "sm:terrain-play-stop",
        this._onTerrainPlayStateChange,
      );

      if (this.mode !== "edit") {
        this.stopPlayMode();
      }
      if (window.PlayOrchestrator === this) window.PlayOrchestrator = null;
      if (window.gamePlayOrchestrator === this)
        window.gamePlayOrchestrator = null;
    }
  }

  function bootstrapGamePlayOrchestrator() {
    if (window.PlayOrchestrator) return window.PlayOrchestrator;
    return new GamePlayOrchestrator({
      scene: window.scene,
      physicsSystem: window.physicsSystem,
      playerSystem: window.playerSystem,
    });
  }

  window.GamePlayOrchestrator = GamePlayOrchestrator;
  window.bootstrapGamePlayOrchestrator = bootstrapGamePlayOrchestrator;

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      bootstrapGamePlayOrchestrator,
      { once: true },
    );
  } else {
    bootstrapGamePlayOrchestrator();
  }
})();
