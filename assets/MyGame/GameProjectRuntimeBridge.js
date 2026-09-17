/**
 * GameProjectRuntimeBridge.js
 * SM Engine game-package lifecycle.
 *
 * A loaded project owns the GAMEPLAY_SAMPLE workspace. The original editor
 * world is detached (not destroyed), the project's Startup Scene is loaded,
 * and Unload restores the previous scene objects safely.
 */
(function (root) {
  "use strict";

  function getAssetsPanel() {
    if (typeof AssetsPanel !== "undefined") return AssetsPanel;
    return root.AssetsPanel || null;
  }

  const SMGameProjectRuntime = {
    state: "stopped",
    activeProject: null,
    activeManifestAsset: null,
    activeManifest: null,
    activeSceneAsset: null,
    loadedAt: null,
    startedAt: null,
    replacesGameplaySampleWorld: false,
    editorWorldSnapshot: null,
    previousWorkspaceMode: null,

    _resolveProject(AP, reference = null) {
      if (root.GameProjectStartupBridge?._resolveProject) {
        const result = root.GameProjectStartupBridge._resolveProject(
          AP,
          reference,
        );
        if (result) return result;
      }

      if (
        reference &&
        typeof reference === "object" &&
        reference.isGameProject
      ) {
        return reference;
      }

      if (reference) {
        const value = String(reference).toLowerCase();
        return (
          Object.values(AP.folders || {}).find(
            (folder) =>
              folder?.isGameProject &&
              (String(folder.id || "").toLowerCase() === value ||
                String(folder.projectId || "").toLowerCase() === value ||
                String(folder.name || "").toLowerCase() === value),
          ) || null
        );
      }

      const active = AP.getActiveGameProject?.();
      if (active) return active;

      const projects = Object.values(AP.folders || {}).filter(
        (folder) => folder?.isGameProject,
      );
      return projects.length === 1 ? projects[0] : null;
    },

    _findManifestAsset(AP, project) {
      if (root.GameProjectStartupBridge?._findManifestAsset) {
        return root.GameProjectStartupBridge._findManifestAsset(AP, project);
      }
      return (
        AP.assets?.find(
          (asset) =>
            asset &&
            asset.folderId === project.id &&
            (asset.isGameProjectManifest ||
              asset.type === "game-project" ||
              asset.name === "game.smproject"),
        ) || null
      );
    },

    _readManifest(asset) {
      if (!asset) return null;
      if (asset.definition && typeof asset.definition === "object") {
        return asset.definition;
      }
      try {
        return JSON.parse(asset.data || "{}");
      } catch {
        return null;
      }
    },

    _setBodyState(project, state) {
      if (!document.body) return;
      document.body.dataset.smGameRuntimeState = state;
      if (project) {
        document.body.dataset.smGameProjectId =
          project.projectId || project.id || "";
        document.body.dataset.smGameProjectName = project.name || "";
      } else {
        delete document.body.dataset.smGameProjectId;
        delete document.body.dataset.smGameProjectName;
      }
    },

    _emit(name, detail = {}) {
      try {
        root.dispatchEvent(new CustomEvent(name, { detail }));
      } catch (error) {
        console.warn(`[SMGameProjectRuntime] Event ${name} failed.`, error);
      }
    },

    _captureEditorWorld(AP) {
      if (this.editorWorldSnapshot) return this.editorWorldSnapshot;
      const scene = AP.scene || root.scene;
      if (!scene?.isScene) return null;

      const objectStates = [];
      scene.traverse((object) => {
        objectStates.push({ object, visible: object.visible });
      });

      this.previousWorkspaceMode = String(
        root.workspaceManager?.currentMode ||
          localStorage.getItem("sm_workspace_mode") ||
          "GAMEPLAY_SAMPLE",
      ).toUpperCase();

      this.editorWorldSnapshot = {
        scene,
        children: [...scene.children],
        objectStates,
        name: scene.name,
        background: scene.background,
        environment: scene.environment,
        fog: scene.fog,
        overrideMaterial: scene.overrideMaterial,
        userData: { ...(scene.userData || {}) },
        ground: root.ground || null,
        obstaclesGroup: root.obstaclesGroup || null,
        collidableMeshes: Array.isArray(root.collidableMeshes)
          ? [...root.collidableMeshes]
          : [],
        exposure: root.renderer?.toneMappingExposure,
        rendererState: root.renderer
          ? {
              exposure: root.renderer.toneMappingExposure,
              pixelRatio: root.renderer.getPixelRatio?.() || 1,
              shadowMapEnabled: root.renderer.shadowMap?.enabled,
              shadowMapType: root.renderer.shadowMap?.type,
            }
          : null,
      };

      return this.editorWorldSnapshot;
    },

    _applyRendererQualityContract(rendererConfig = {}) {
      const renderer = root.renderer;
      if (!renderer) return;

      const exposure = Number(rendererConfig.exposure);

      /*
       * Exposure → central Exposure System
       */
      if (Number.isFinite(exposure)) {
        root.smExposureSystem?.setSettings?.(
          {
            manualExposure: exposure,
          },
          true,
        );

        if (!root.smExposureSystem) {
          renderer.toneMappingExposure = exposure;
        }
      }

      /*
       * Shadows → central shadow policy
       */
      if (renderer.shadowMap) {
        const shadowsEnabled = rendererConfig.shadows !== false;

        const quality = String(
          rendererConfig.quality || rendererConfig.qualityPreset || "HIGH",
        ).toUpperCase();

        root.smShadowManager?.setEnabled?.(shadowsEnabled);

        if (!root.smShadowManager) {
          renderer.shadowMap.enabled = shadowsEnabled;
        }

        if (
          shadowsEnabled &&
          quality !== "LOW" &&
          typeof THREE !== "undefined" &&
          THREE.PCFSoftShadowMap !== undefined
        ) {
          /*
           * Only use fallback when the central ShadowManager
           * does not own the renderer.
           */
          if (!root.smShadowManager) {
            renderer.shadowMap.type = THREE.PCFSoftShadowMap;
          }
        }

        renderer.shadowMap.needsUpdate = true;
      }
    },

    _restoreEditorWorld(AP) {
      const snapshot = this.editorWorldSnapshot;
      if (!snapshot?.scene) return false;

      const scene = snapshot.scene;
      const originalChildren = new Set(snapshot.children);

      for (const child of [...scene.children]) {
        if (originalChildren.has(child)) continue;
        if (
          child.userData?.smGameProjectObject === true ||
          child.userData?.smGameSceneObject === true
        ) {
          scene.remove(child);
        }
      }

      for (const child of snapshot.children) {
        if (child.parent !== scene) {
          child.parent?.remove?.(child);
          scene.add(child);
        }
      }

      snapshot.objectStates.forEach(({ object, visible }) => {
        if (object) object.visible = visible;
      });

      scene.name = snapshot.name;
      scene.background = snapshot.background;
      scene.environment = snapshot.environment;
      scene.fog = snapshot.fog;
      scene.overrideMaterial = snapshot.overrideMaterial;
      scene.userData = { ...snapshot.userData };

      root.ground = snapshot.ground;
      root.obstaclesGroup = snapshot.obstaclesGroup;
      root.collidableMeshes = [...snapshot.collidableMeshes];
      if (root.renderer) {
        const rendererState = snapshot.rendererState || null;
        const exposure = Number(rendererState?.exposure ?? snapshot.exposure);
        if (Number.isFinite(exposure)) {
          root.renderer.toneMappingExposure = exposure;
        }
        if (root.renderer.shadowMap && rendererState) {
          if (typeof rendererState.shadowMapEnabled === "boolean") {
            root.renderer.shadowMap.enabled = rendererState.shadowMapEnabled;
          }
          if (rendererState.shadowMapType !== undefined) {
            root.renderer.shadowMap.type = rendererState.shadowMapType;
          }
          root.renderer.shadowMap.needsUpdate = true;
        }
      }

      delete AP.activeGameSceneAssetId;
      if (root.GameSceneLoaderBridge) {
        root.GameSceneLoaderBridge.activeSceneAssetId = null;
      }

      scene.updateMatrixWorld?.(true);
      root.updateHierarchy?.();
      root.refreshOutliner?.();
      this.editorWorldSnapshot = null;
      return true;
    },

    _applyLoadedWorldContract(AP, sceneAsset) {
      const scene = AP.scene || root.scene;
      if (!scene?.isScene) return;

      const projectId =
        this.activeProject?.projectId || this.activeManifest?.id || null;
      const collidables = [];
      let gameGround = null;

      scene.traverse((object) => {
        if (
          object.userData?.smSourceSceneAssetId !== sceneAsset?.id &&
          object.userData?.smGameProjectObject !== true
        ) {
          return;
        }

        object.userData = {
          ...(object.userData || {}),
          smGameProjectObject: true,
          smGameProjectId: projectId,
          workspaceOnly: "GAMEPLAY_SAMPLE",
          ignoreInHierarchy: false,
        };

        if (
          object.userData.isGameGround === true ||
          object.name === "MyGameGround"
        ) {
          gameGround = object;
        }
        if (object.isMesh && object.userData.collidable === true) {
          collidables.push(object);
        }
        if (object.isMesh) {
          object.castShadow = object.userData.castShadow !== false;
          object.receiveShadow = object.userData.receiveShadow !== false;
        }
      });

      if (gameGround) root.ground = gameGround;
      root.obstaclesGroup = scene.getObjectByName("MyGameObstacles") || null;
      root.collidableMeshes = collidables;

      const rendererConfig = this.activeManifest?.renderer || {};

      this._applyRendererQualityContract(rendererConfig);

      const spawn = this.activeManifest?.player?.spawnPosition ||
        this.activeManifest?.player?.spawn || [0, 0, 20];
      const teleportPlayer = () => {
        const player = root.playerSystem;
        if (!player?.ready) return false;
        player.teleport?.(
          Number(spawn[0] || 0),
          Number(spawn[1] || 0),
          Number(spawn[2] || 0),
        );
        return true;
      };
      if (!teleportPlayer()) {
        setTimeout(teleportPlayer, 250);
        setTimeout(teleportPlayer, 1000);
      }

      root.gameplaySampleEnvironment?.deactivate?.();
      root.workspaceManager?._syncWorkspaceObjectVisibility?.(
        "GAMEPLAY_SAMPLE",
        scene,
      );
      root.workspaceManager?._syncWorkspaceLighting?.("GAMEPLAY_SAMPLE", scene);
      scene.updateMatrixWorld?.(true);
      root.updateHierarchy?.();
    },

    loadProject(AP, reference = null, options = {}) {
      const project = this._resolveProject(AP, reference);
      if (!project) {
        alert("Game Project not found.");
        return null;
      }

      AP.initializeGameProjectStructure?.(project.id);
      const manifestAsset = this._findManifestAsset(AP, project);
      if (!manifestAsset) {
        alert(`"${project.name}" has no game.smproject.`);
        return null;
      }

      const manifest = this._readManifest(manifestAsset);
      if (!manifest || manifest.format !== "SM_GAME_PROJECT") {
        alert(`"${project.name}" has an invalid game.smproject.`);
        return null;
      }

      const startupScene =
        options.openStartup === false
          ? null
          : AP.getStartupSceneAsset?.(project);
      if (!startupScene && options.requireStartup === true) {
        alert(`Game Project "${project.name}" has no Startup Scene.`);
        return null;
      }

      if (
        this.activeProject &&
        this.activeProject.id !== project.id &&
        this.editorWorldSnapshot
      ) {
        this._restoreEditorWorld(AP);
      }

      this._captureEditorWorld(AP);
      this.activeProject = project;
      this.activeManifestAsset = manifestAsset;
      this.activeManifest = manifest;
      this.activeSceneAsset = startupScene || null;
      this.loadedAt = Date.now();
      this.startedAt = null;
      this.state = "loading";
      this.replacesGameplaySampleWorld = manifest.replaceDefaultWorld !== false;

      root.SMActiveGameProject = {
        folderId: project.id,
        projectId: project.projectId || manifest.id || null,
        name: project.name,
        manifestAssetId: manifestAsset.id,
      };
      AP.activeGameProjectFolderId = project.id;
      AP.setActiveGameProject?.(project, { openProject: false });
      this._setBodyState(project, this.state);

      // Game packages intentionally run only in Gameplay Sample. Setting
      // the replacement flag first prevents WorkspaceManager's delayed
      // repair timers from recreating the built-in obstacle course.
      root.workspaceManager?.setMode?.("GAMEPLAY_SAMPLE");
      root.gameplaySampleEnvironment?.deactivate?.();

      if (startupScene) {
        const opened = AP.openGameScene?.(startupScene, {
          replace: options.replaceScene !== false,
        });
        if (!opened) {
          this.replacesGameplaySampleWorld = false;
          this._restoreEditorWorld(AP);
          this.activeProject = null;
          this.activeManifest = null;
          this.activeManifestAsset = null;
          this.activeSceneAsset = null;
          this.state = "stopped";
          return null;
        }
        this._applyLoadedWorldContract(AP, startupScene);
      }

      this.state = "loaded";
      this._setBodyState(project, this.state);
      this._emit("sm-game-project-loaded", {
        project,
        manifest,
        manifestAsset,
        startupScene,
        scene: AP.scene || root.scene,
        runtime: this,
      });

      console.log(
        `[SMGameProjectRuntime] Loaded in Gameplay Sample: ${project.name}`,
      );
      return { project, manifest, manifestAsset, startupScene };
    },

    _enterPlayingState(AP, source = "runtime") {
      if (!this.activeProject || this.state === "playing") return false;
      this.state = "playing";
      this.startedAt = Date.now();
      root.smGameRuntimePlaying = true;
      this._setBodyState(this.activeProject, this.state);
      this._emit("sm-game-project-play", {
        project: this.activeProject,
        manifest: this.activeManifest,
        sceneAsset: this.activeSceneAsset,
        scene: AP?.scene || root.scene,
        runtime: this,
        source,
      });
      return true;
    },

    _leavePlayingState(AP, source = "runtime") {
      if (!this.activeProject || this.state !== "playing") return false;
      this._emit("sm-game-project-stop", {
        project: this.activeProject,
        manifest: this.activeManifest,
        sceneAsset: this.activeSceneAsset,
        scene: AP?.scene || root.scene,
        runtime: this,
        source,
      });
      this.state = "loaded";
      root.smGameRuntimePlaying = false;
      this._setBodyState(this.activeProject, this.state);
      return true;
    },

    async play(AP, reference = null, options = {}) {
      const loaded = this.loadProject(AP, reference, {
        openStartup: true,
        replaceScene: options.replaceScene !== false,
        requireStartup: true,
      });
      if (!loaded) return null;

      const orchestrator =
        root.gamePlayOrchestrator || root.PlayOrchestrator || null;
      if (orchestrator?.mode === "edit") {
        const started = await orchestrator.startPlayMode?.();
        if (started === false) return null;
      }
      this._enterPlayingState(AP, "play-game-project");
      return loaded;
    },

    async stop(AP, options = {}) {
      const orchestrator =
        root.gamePlayOrchestrator || root.PlayOrchestrator || null;
      if (orchestrator && orchestrator.mode !== "edit") {
        await orchestrator.stopPlayMode?.();
      }
      this._leavePlayingState(AP, "stop-game-project");
      if (options.keepProjectLoaded === false || options.unload === true) {
        return this.unloadProject(AP, { skipStop: true });
      }
      return true;
    },

    async unloadProject(AP, options = {}) {
      if (!this.activeProject && !this.editorWorldSnapshot) return false;

      const orchestrator =
        root.gamePlayOrchestrator || root.PlayOrchestrator || null;
      if (
        options.skipStop !== true &&
        orchestrator &&
        orchestrator.mode !== "edit"
      ) {
        await orchestrator.stopPlayMode?.();
      }

      const previous = {
        project: this.activeProject,
        manifest: this.activeManifest,
        sceneAsset: this.activeSceneAsset,
      };
      this._leavePlayingState(AP, "unload-game-project");

      this.replacesGameplaySampleWorld = false;
      this._restoreEditorWorld(AP);
      root.gameplaySampleEnvironment?.activate?.();

      this.state = "stopped";
      root.smGameRuntimePlaying = false;
      delete root.SMActiveGameProject;
      this.activeProject = null;
      this.activeManifestAsset = null;
      this.activeManifest = null;
      this.activeSceneAsset = null;
      this.loadedAt = null;
      this.startedAt = null;
      this._setBodyState(null, this.state);

      root.workspaceManager?.setMode?.("GAMEPLAY_SAMPLE");
      this._emit("sm-game-project-unloaded", {
        ...previous,
        scene: AP.scene || root.scene,
        runtime: this,
      });
      AP.render?.();
      console.log(
        "[SMGameProjectRuntime] Project unloaded; Gameplay Sample restored.",
      );
      return true;
    },

    async restart(AP) {
      if (!this.activeProject) {
        console.warn("[SMGameProjectRuntime] No active project to restart.");
        return null;
      }
      const project = this.activeProject;
      await this.stop(AP, { keepProjectLoaded: true });
      return this.play(AP, project);
    },
  };

  function installAssetsPanelAPI() {
    const AP = getAssetsPanel();
    if (!AP) {
      setTimeout(installAssetsPanelAPI, 100);
      return;
    }
    if (typeof AP.openStartupScene !== "function") {
      setTimeout(installAssetsPanelAPI, 150);
      return;
    }
    if (AP.__smProjectRuntimeInstalledV8) return;
    AP.__smProjectRuntimeInstalledV8 = true;

    AP.loadGameProject = function (reference = null, options = {}) {
      return root.SMGameProjectRuntime.loadProject(this, reference, options);
    };
    AP.playGameProject = function (reference = null, options = {}) {
      return root.SMGameProjectRuntime.play(this, reference, options);
    };
    AP.stopGameProject = function (options = {}) {
      return root.SMGameProjectRuntime.stop(this, options);
    };
    AP.unloadGameProject = function (options = {}) {
      return root.SMGameProjectRuntime.unloadProject(this, options);
    };
    AP.restartGameProject = function () {
      return root.SMGameProjectRuntime.restart(this);
    };

    const originalFolderMenu = AP._showFolderContextMenu;
    AP._showFolderContextMenu = function (event, folderId) {
      const result = originalFolderMenu?.call(this, event, folderId);
      const folder = this.folders?.[folderId];
      if (!folder?.isGameProject || !this.dom?.contextMenu) return result;

      const add = (label, icon, callback) => {
        const item = document.createElement("div");
        item.className = "context-menu-item";
        item.innerHTML = `<i class="${icon}"></i>&nbsp; ${label}`;
        item.onclick = () => {
          callback();
          this.dom.contextMenu.style.display = "none";
        };
        this.dom.contextMenu.prepend(item);
      };

      if (root.SMGameProjectRuntime.activeProject?.id === folder.id) {
        add("Unload Game Project", "fas fa-eject", () =>
          this.unloadGameProject(),
        );
      }
      add("Play Game Project", "fas fa-play", () =>
        this.playGameProject(folder),
      );
      add("Load Game Project", "fas fa-folder-open", () =>
        this.loadGameProject(folder),
      );
      return result;
    };

    console.log("[GameProjectRuntimeBridge] Runtime lifecycle v8 installed.");
  }

  root.SMGameProjectRuntime = SMGameProjectRuntime;

  root.addEventListener("sm:pie-start", () => {
    const AP = getAssetsPanel();
    SMGameProjectRuntime._enterPlayingState(AP, "sim-play");
  });
  root.addEventListener("sm:pie-stop", () => {
    const AP = getAssetsPanel();
    SMGameProjectRuntime._leavePlayingState(AP, "sim-stop");
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", installAssetsPanelAPI, {
      once: true,
    });
  } else {
    installAssetsPanelAPI();
  }
})(window);
