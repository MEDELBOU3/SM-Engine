// SM Engine Panel: ToolbarPanel
window.ToolbarPanel = {
  init() {
    const tb = document.getElementById("toolBar");
    if (tb) {
      tb.innerHTML = `
            <!-- LEFT: Application Menus -->
            <div class="blender-app-menus">
                <div class="logo" style="margin-right: 15px; display: flex; align-items: center;">
                    <button onclick="showWelcomeModal()"
                        style="border: none; background: transparent; cursor: pointer; padding: 0 4px;">
                        <svg viewBox="0 0 70 70" xmlns="http://www.w3.org/2000/svg" style="width: 24px; height: 24px;">
                            <defs>
                                <linearGradient id="logoMainFill" x1="0%" y1="0%" x2="100%" y2="100%">
                                    <stop offset="0%" stop-color="#2c3e50" />
                                    <stop offset="100%" stop-color="#1c2833" />
                                </linearGradient>
                                <linearGradient id="logoOuterStroke" x1="0%" y1="100%" x2="100%" y2="0%">
                                    <stop offset="0%" stop-color="#4e5b6b" />
                                    <stop offset="100%" stop-color="#7e8c9d" />
                                </linearGradient>
                                <linearGradient id="logoInnerHighlight" x1="0%" y1="0%" x2="100%" y2="100%">
                                    <stop offset="0%" stop-color="#66b3ff" />
                                    <stop offset="100%" stop-color="#89cff0" />
                                </linearGradient>
                            </defs>
                            <path fill="url(#logoMainFill)" stroke="url(#logoOuterStroke)" stroke-width="2"
                                stroke-linejoin="round"
                                d="M10 60 L10 15 L20 10 L35 10 L45 10 L60 10 L60 55 L55 60 L30 55 L30 35 L40 30 L40 15 L35 10 M30 35 L40 30" />
                            <path fill="none" stroke="url(#logoInnerHighlight)" stroke-width="1.5"
                                stroke-linejoin="round" opacity="0.8"
                                d="M12 58 L12 16 L21 12 L35 12 L44 12 L58 12 L58 54 L54 58 L35 58 L32 54 L32 36 L39 32 L39 16" />
                        </svg>
                    </button>
                </div>

                <div class="menu-wrapper">
                    <button id="fileBtn" class="menu-trigger">File</button>
                    <div id="fileMenu" class="menu-dropdown">
                        <button id="newScene">New</button>
                        <button id="saveScene">Save</button>
                        <button id="loadScene">Load</button>
                        <button id="export-game-btn-file">Export</button>
                        <hr>
                        <button id="sidebar-toggle">Controls</button>
                        <button id="toggle-navigator">Navigator</button>
                    </div>
                </div>

                <div class="menu-wrapper">
                    <button id="addBtn" class="menu-trigger">Add</button>
                    <div id="addMenu" class="menu-dropdown">
                        <button class="submenu-trigger">Light <span class="arrow">▸</span></button>
                        <div class="submenu-dropdown">
                            <button id="addPointLightMenu"><i class="fas fa-lightbulb"></i> Point Light</button>
                            <button id="addSunLightMenu"><i class="fas fa-sun"></i> Sun</button>
                            <button id="addSpotLightMenu"><i class="fas fa-search"></i> Spot</button>
                            <button id="addDirectionalLightMenu"><i class="fas fa-arrow-right"></i> Directional</button>
                            <button id="addHemisphereLightMenu"><i class="fas fa-adjust"></i> Hemisphere</button>
                            <button id="addAreaLightMenu"><i class="far fa-square"></i> Area</button>
                        </div>

                        <button class="submenu-trigger">Camera <span class="arrow">▸</span></button>
                        <div class="submenu-dropdown">
                            <button id="addPerspectiveCameraMenu"><i class="fas fa-video"></i> Perspective Camera</button>
                            <button id="addOrthographicCameraMenu"><i class="far fa-clone"></i> Orthographic Camera</button>
                            <button id="addCubeCameraMenu">
                              <i class="fas fa-cube"></i> Cube Camera
                            </button>
                            <button id="addCinematicCameraMenu">
                                <i class="fas fa-film"></i> Cinematic Camera
                            </button>
                        </div>
                        <hr>

                        <button class="submenu-trigger">Mesh <span class="arrow">▸</span></button>
                        <div class="submenu-dropdown">
                            <button id="addPlane">Plane</button>
                            <button id="addCube">Cube</button>
                            <button id="addCapsule">Capsul</button>
                            <button id="addSphere">UV Sphere</button>
                            <button id="addIcosahedron">Ico Sphere</button>
                            <button id="addCylinder">Cylinder</button>
                            <button id="addCone">Cone</button>
                            <button id="addTorus">Torus</button>
                            <button id="createTerrain">Terrain</button>
                            <button id="addMonkey">Monkey</button>
                        </div>

                        <button class="submenu-trigger" id="gameDevShapesTrigger">
                            Game Shapes <span class="arrow">▸</span>
                        </button>
                        <div class="submenu-dropdown" id="gameDevShapesSubmenu">
                            <button id="gameShapeFloor" type="button"><i class="fas fa-square"></i> Floor</button>
                            <button id="gameShapeBox" type="button"><i class="fas fa-cube"></i> Blockout Box</button>
                            <button id="gameShapeWall" type="button"><i class="fas fa-border-all"></i> Wall</button>
                            <button id="gameShapeRamp" type="button"><i class="fas fa-ruler-combined"></i> Ramp</button>
                            <button id="gameShapeStairs" type="button"><i class="fas fa-stairs"></i> Stairs</button>
                            <button id="gameShapeCubeGrid" type="button"><i class="fas fa-th"></i> Cube Grid</button>
                            <hr>
                            <button id="gameShapeMeshEdit" type="button"><i class="fas fa-vector-square"></i> Mesh Edit Mode</button>
                        </div>

                        <button class="submenu-trigger">Curve <span class="arrow">▸</span></button>
                        <div class="submenu-dropdown">
                            <button id="addBezierCurve">Bezier</button>
                            <button id="addNurbsCurve">NURBS</button>
                            <button id="addCircleCurve">Circle</button>
                            <button id="addPathCurve">Path</button>
                        </div>

                        <button class="submenu-trigger">Surface <span class="arrow">▸</span></button>
                        <div class="submenu-dropdown">
                            <button id="addNurbsSurface">NURBS Surface</button>
                            <button id="addPlaneSurface">Plane</button>
                            <button id="addSphereSurface">Sphere</button>
                            <button id="addTorusSurface">Torus</button>
                            <button id="addCurtainStudio">Curtain Studio</button>
                        </div>

                        <button class="submenu-trigger">Metaball <span class="arrow">▸</span></button>
                        <div class="submenu-dropdown">
                            <button id="addMetaBall">Ball</button>
                            <button id="addMetaCapsule">Capsule</button>
                            <button id="addMetaPlane">Plane</button>
                            <button id="addMetaEllipsoid">Ellipsoid</button>
                            <button id="addMetaCube">Cube</button>
                        </div>

                    </div>
                </div>

                <div class="menu-wrapper">
                    <button id="viewBtn" class="menu-trigger">View</button>
                    <div id="viewMenu" class="menu-dropdown">
                        <button id="viewModeBtn">View Mode</button>
                        <button id="toggle-2d-view">Switch to 2D View</button>
                    </div>
                </div>

                <div class="menu-wrapper">
                    <button id="cameraBtn" class="menu-trigger">Camera</button>
                    <div id="cameraMenu" class="menu-dropdown">
                        <button id="addPointBtn">Add Point</button>
                        <button id="startCameraBtn">Start Camera</button>
                        <button id="toggleLookAtBtn">Look At</button>
                        <hr>
                        <button id="startRecordingBtn">
                            <span style="color: #ff4d4d; font-size: 12px; margin-right: 4px;">●</span> Start Rec
                        </button>
                        <button id="stopRecordingBtn">
                            <span style="color: #ffffff; font-size: 10px; margin-right: 4px;">■</span> Stop Rec
                        </button>
                    </div>
                </div>
            </div>

            <!-- MIDDLE: Workspaces -->
            <div class="blender-workspaces">
                <button class="workspace-tab active" id="workspaceBtn"
                    onclick="window.workspaceManager?.show()">Layout</button>
                <div class="menu-wrapper game-mode-toolbar-wrapper" id="gameModeToolbarWrapper">
                    <button class="workspace-tab utility-tab game-mode-toolbar-btn" id="gameModeToolbarBtn" type="button">
                        <span id="gameModeToolbarLabel">GAME 3D</span>
                        <i class="fas fa-caret-down"></i>
                    </button>
                    <div id="gameModeMenu" class="menu-dropdown game-mode-menu">
                        <button type="button" data-game-viewport-mode="2D"
                            onclick="window.workspaceManager?.setGameMode('2D')">
                            <span>2D</span>
                            <span>Orthographic</span>
                        </button>
                        <button type="button" data-game-viewport-mode="2.5D"
                            onclick="window.workspaceManager?.setGameMode('2.5D')">
                            <span>2.5D</span>
                            <span>Side Scroller</span>
                        </button>
                        <button type="button" data-game-viewport-mode="3D"
                            onclick="window.workspaceManager?.setGameMode('3D')">
                            <span>3D</span>
                            <span>Full World</span>
                        </button>
                    </div>
                </div>
                <button class="workspace-tab" id="modelingControls">Modeling</button>
                <button class="workspace-tab" id="sculpting-toolbar-btn">Sculpting</button>
                <button class="workspace-tab" id="toggle-2d-view-btn"
                    onclick="window.enter2DMode(); if(window.v2dManager) window.v2dManager.setSubMode('uv');">UV Editing</button>
                <button class="workspace-tab" id="toggle-2d-animation-btn" type="button"
                    onclick="window.ensureAnimation2DManager && window.ensureAnimation2DManager(); window.enter2DAnimationMode && window.enter2DAnimationMode();">2D Animation</button>
                <button class="workspace-tab" id="renderingBTN">Rendering</button>
                <button class="workspace-tab" id="open-editor-btn" onclick="window.openCodeEditor()">Scripting</button>
                <button class="workspace-tab" id="ai-assistant-btn" type="button" onclick="window.openAIAssistant?.()" title="Gemini AI Assistant">AI Assistant</button>
                <button class="workspace-tab" id="toggle-video-editor-btn">Video Editing</button>
                <button class="workspace-tab" id="toggle-assets-btn" onclick="toggleAssetsPanelSafe()">Assets</button>
                <button class="workspace-tab" id="toggle-inspector" type="button">Inspector</button>
                <button class="workspace-tab" id="historyBtn">History</button>
                <button class="workspace-tab" id="live-capture-btn" type="button" onclick="window.openLiveCapturePanel?.()" title="Open Live Capture panel">
                    Live Capture
                </button>
            </div>

            <!-- RIGHT -->
            <div class="blender-right-controls">
                <div style="display: flex; align-items: center; margin-right: 10px;">
                    <span id="recordingStatus" title="Recording Stopped"></span>
                    <span id="recordingTimer"
                        style="font-size: 13px; color: #ff4d4d; font-weight: bold; margin-right: 5px;">00:00</span>
                </div>

                <div class="menu-wrapper">
                    <button id="addMoreModesBtn" class="workspace-tab icon-only">
                        <i class="fas fa-plus"></i>
                    </button>
                    <div id="moreModesMenu" class="menu-dropdown">
                        <button>Texture Paint</button>
                        <button>Compositing</button>
                        <button>Animation</button>
                        <hr>
                        <button>Configure...</button>
                    </div>
                </div>

                <button id="toggleContainerButton" class="workspace-tab icon-only">
                    <svg id="toggle-path-status" xmlns="http://www.w3.org/2000/svg" width="16" height="16"
                        viewBox="0 0 23 23">
                        <path id="icon-path"
                            d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2z"
                            fill="#cccccc" />
                    </svg>
                </button>
            </div>
        </div>`;
    }

    const stb = document.getElementById("subToolBar");
    if (stb) {
      stb.innerHTML = `
            <div class="st-group st-joined">
                <button class="st-btn active" id="mask-all" title="Select All"><i class="fas fa-layer-group"></i></button>
                <button class="st-btn active" id="mask-mesh" title="Meshes"><i class="fas fa-cube"></i></button>
                <button class="st-btn active" id="mask-light" title="Lights"><i class="fas fa-lightbulb"></i></button>
                <button class="st-btn active" id="mask-bone" title="Bones"><i class="fas fa-bone"></i></button>
            </div>

            <div class="st-separator"></div>

            <div class="st-group">
                <div class="st-dropdown-wrapper">
                    <button class="st-btn st-dropdown-trigger" id="coord-space-btn"
                        onclick="toggleSubDropdown('space-dropdown')" title="Coordinate Space">
                        <i class="fas fa-globe"></i> <i class="fas fa-caret-down tiny-caret"></i>
                    </button>
                    <div id="space-dropdown" class="st-dropdown-content">
                        <div onclick="setSpace('Global')"><i class="fas fa-globe"></i> Global</div>
                        <div onclick="setSpace('Local')"><i class="fas fa-cube"></i> Local</div>
                    </div>
                </div>

                <div class="st-dropdown-wrapper">
                    <button class="st-btn st-dropdown-trigger" id="pivot-btn"
                        onclick="toggleSubDropdown('pivot-dropdown')" title="Pivot Center">
                        <i class="fas fa-bullseye"></i> <i class="fas fa-caret-down tiny-caret"></i>
                    </button>
                    <div id="pivot-dropdown" class="st-dropdown-content">
                        <div onclick="setPivot('Center')"><i class="fas fa-bullseye"></i> Center</div>
                        <div onclick="setPivot('Pivot')"><i class="fas fa-dot-circle"></i> Pivot</div>
                    </div>
                </div>
            </div>

            <div class="st-separator"></div>

            <div class="st-group st-joined">
                <button class="st-btn play-btn" id="sim-play" title="Play"><i class="fas fa-play"></i></button>
                <button class="st-btn" id="sim-pause" title="Pause"><i class="fas fa-pause"></i></button>
                <button class="st-btn" id="sim-step" title="Step Frame"><i class="fas fa-step-forward"></i></button>
            </div>

            <div class="st-separator" id="player-debug-toolbar-separator"></div>

            <div class="st-group" id="player-debug-toolbar-group">
                <button class="st-btn" id="player-debug-toolbar-btn" type="button" title="Player Debugger" onclick="window.SMPlayerDebugPanel?.open?.()"><i class="fas fa-person-running"></i></button>
            </div>

            <div class="st-separator"></div>

            <div class="st-group">
                <button class="st-btn" id="snap-toggle" title="Toggle Snapping"><i class="fas fa-magnet"></i></button>
                <div class="st-input-wrapper" title="Grid Snap Size">
                    <input type="number" id="snap-move-val" value="1.0" step="0.5">
                </div>
                <div class="st-input-wrapper" title="Rotation Snap Angle">
                    <input type="number" id="snap-rotate-val" value="15" step="15">
                </div>
            </div>

            <div class="st-separator"></div>

            <div class="st-group">
                <button id="show-object-info-btn" class="st-btn" title="Object INFO">
                    <i class="fas fa-info-circle" aria-hidden="true"></i>
                </button>
            </div>

            <div class="st-group" style="margin-left: auto;">
                <div class="st-slider-wrapper" title="Camera Speed">
                    <i class="fas fa-tachometer-alt"></i>
                    <input type="range" min="1" max="10" value="3" id="cam-speed">
                </div>

                <div class="st-separator"></div>

                <button class="st-btn" id="toggle-stats" title="Show Stats"><i class="fas fa-chart-bar"></i></button>
            </div>`;
    }

    // Bind Sculpting workspace tab
    const sculptingBtn = document.getElementById("sculpting-toolbar-btn");
    if (sculptingBtn && !sculptingBtn.dataset.sculptBound) {
      sculptingBtn.dataset.sculptBound = "true";
      sculptingBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        window.requestGlobalSculptingWorkspace?.();
      });
    }

    this.bindGameDevShapeButtons();
    this.bindWorkspaceButtons();
    console.log("ToolbarPanel initialized");
  },

  showModelingToolsPanel() {
    // Enforce hiding outer floating overlays
    document
      .querySelectorAll(
        "body > #modelingTools, #modelingTools:not(.inspector-modeling-inner)",
      )
      .forEach((el) => {
        el.style.setProperty("display", "none", "important");
        el.style.setProperty("visibility", "hidden", "important");
      });

    // Open Inspector panel
    const inspector = document.getElementById("inspector-panel");
    if (inspector) {
      inspector.classList.remove("closed", "hidden", "mode-hidden");
      inspector.style.display = "block";
      if (typeof window.setInspectorCollapsed === "function") {
        window.setInspectorCollapsed(false);
      }
    }

    // Highlight modeling workspace tab
    document
      .querySelectorAll(".workspace-tab")
      .forEach((tab) => tab.classList.remove("active"));
    document.getElementById("modelingControls")?.classList.add("active");

    // Show Modeling View inside Inspector
    if (
      window.InspectorPanel &&
      typeof window.InspectorPanel.showModelingView === "function"
    ) {
      window.InspectorPanel.showModelingView();
    }

    if (window.gameModeManager?.setMode) {
      try {
        window.gameModeManager.setMode("MODE_MODELING");
      } catch (e) {}
    }

    if (
      typeof window.toggleModelingMode === "function" &&
      !window.isModelingMode
    ) {
      window.toggleModelingMode();
    }

    window.ModelingToolkitController?.init?.();
    window.ModelingToolkitController?.refreshUI?.();
    window.dispatchEvent(new CustomEvent("sm-modeling-tools-opened"));
  },

  _getGameDevSelectedObject() {
    return (
      window.selectedObject ||
      window.selectionManager?.selectedObject ||
      window.SelectionManager?.selectedObject ||
      window.transformControls?.object ||
      null
    );
  },

  _spawnGameDevShape(type, options = {}) {
    const factory = window.SMGameDevShapeFactory;

    if (!factory?.spawn) {
      console.error("[ToolbarPanel] SMGameDevShapeFactory is not loaded.");
      return null;
    }

    const selected = this._getGameDevSelectedObject();

    const spawnOptions = {
      ...options,
    };

    if (selected?.position) {
      spawnOptions.x = options.x ?? selected.position.x + 1.5;

      spawnOptions.y =
        options.y ?? Math.max(0, Number(selected.position.y) || 0);

      spawnOptions.z = options.z ?? selected.position.z;
    }

    const object = factory.spawn(type, spawnOptions);

    if (!object) {
      return null;
    }

    window.selectedObject = object;

    if (window.transformControls?.attach && object.isObject3D) {
      try {
        window.transformControls.attach(object);
      } catch (error) {
        console.warn(
          "[ToolbarPanel] Could not attach TransformControls.",
          error,
        );
      }
    }

    window.updateHierarchy?.();

    window.dispatchEvent(
      new CustomEvent("sm-game-dev-shape-created", {
        detail: {
          type,
          object,
        },
      }),
    );

    return object;
  },

  _startGameDevCubeGrid() {
    if (!window.SMCubeGridTool) {
      console.error("[ToolbarPanel] SMCubeGridTool is not loaded.");
      return null;
    }

    if (
      !window.smCubeGridTool ||
      !(window.smCubeGridTool instanceof window.SMCubeGridTool)
    ) {
      window.smCubeGridTool = new window.SMCubeGridTool(window.scene);
    }

    const tool = window.smCubeGridTool;

    const selected = this._getGameDevSelectedObject();

    const origin = selected?.position?.clone?.() || new THREE.Vector3(0, 0, 0);

    tool.buildPreview({
      width: 5,
      depth: 3,
      height: 2,
      gridSize: 1,
      origin,
    });

    window.dispatchEvent(
      new CustomEvent("sm-game-dev-cube-grid-started", {
        detail: {
          tool,
        },
      }),
    );

    console.log(
      "[ToolbarPanel] Cube Grid started. " +
        "Use window.smCubeGridTool.accept() or cancel().",
    );

    return tool;
  },

  _toggleGameDevMeshEdit() {
    if (!window.SMMeshEditingMode) {
      console.error("[ToolbarPanel] SMMeshEditingMode is not loaded.");
      return false;
    }

    if (!window.smMeshEditingMode) {
      window.smMeshEditingMode = new window.SMMeshEditingMode({
        scene: window.scene,
        camera:
          window.SMViewportSystem?.getActivePanel?.()?.camera || window.camera,
        renderer: window.renderer,
        raycaster: window.raycaster || new THREE.Raycaster(),
      });
    }

    const editor = window.smMeshEditingMode;

    if (editor.enabled) {
      editor.disable();

      document.getElementById("gameShapeMeshEdit")?.classList.remove("active");

      return false;
    }

    const target = this._getGameDevSelectedObject();

    if (!target) {
      console.warn(
        "[ToolbarPanel] Select a mesh before enabling Mesh Edit Mode.",
      );
      return false;
    }

    const mesh = target.isMesh
      ? target
      : (() => {
          let found = null;

          target.traverse?.((child) => {
            if (!found && child.isMesh) {
              found = child;
            }
          });

          return found;
        })();

    if (!mesh) {
      console.warn("[ToolbarPanel] Selected object does not contain a mesh.");
      return false;
    }

    editor.enable(mesh);

    document.getElementById("gameShapeMeshEdit")?.classList.add("active");

    return true;
  },

  bindGameDevShapeButtons() {
    const bind = (id, handler) => {
      const button = document.getElementById(id);

      if (!button || button.dataset.gameDevBound === "1") {
        return;
      }

      button.dataset.gameDevBound = "1";

      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();

        handler();

        const submenu = document.getElementById("gameDevShapesSubmenu");

        if (submenu) {
          submenu.style.display = "";
        }
      });
    };

    bind("gameShapeFloor", () =>
      this._spawnGameDevShape("floor", {
        width: 8,
        depth: 8,
        height: 0.25,
        material: "floor",
      }),
    );

    bind("gameShapeBox", () =>
      this._spawnGameDevShape("box", {
        width: 4,
        height: 3,
        depth: 4,
        material: "default",
      }),
    );

    bind("gameShapeWall", () =>
      this._spawnGameDevShape("wall", {
        width: 6,
        height: 3,
        thickness: 0.3,
        material: "wall",
      }),
    );

    bind("gameShapeRamp", () =>
      this._spawnGameDevShape("ramp", {
        width: 4,
        height: 2,
        depth: 6,
        material: "ramp",
      }),
    );

    bind("gameShapeStairs", () =>
      this._spawnGameDevShape("stairs", {
        steps: 7,
        width: 4,
        stepHeight: 0.3,
        stepDepth: 0.45,
        material: "trim",
      }),
    );

    bind("gameShapeCubeGrid", () => this._startGameDevCubeGrid());

    bind("gameShapeMeshEdit", () => this._toggleGameDevMeshEdit());

    console.log("[ToolbarPanel] Game Shapes submenu bound directly.");
  },

  bindWorkspaceButtons() {
    const modelingBtn = document.getElementById("modelingControls");
    if (modelingBtn && !modelingBtn.dataset.toolbarModelingBound) {
      modelingBtn.dataset.toolbarModelingBound = "1";
      modelingBtn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.showModelingToolsPanel();
      });
    }
    window.showModelingToolsPanel = () => this.showModelingToolsPanel();
  },
};
