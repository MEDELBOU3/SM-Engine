// engine/project/serializers/SceneSerializer.js
// Saves/restores user-authored Three.js scene roots.
// Terrain and Player are intentionally handled by dedicated serializers.

(() => {
  "use strict";

  const FORMAT = "SM_SCENE";
  const VERSION = 2;
  const DEFAULT_PATH = "Maps/Main.smscene";

  const SYSTEM_NAMES = new Set([
    "advancedGrid",
    "gameModeGrid2D",
    "modelingGround",
    "gridFloorPlane",
    "DebugGroundPlane",
    "SMGameplaySampleEnvironment",
    "SMGameplaySampleObstacles",
    "SMGameplaySampleFloor",
    "SMGameplaySampleLights",
    "SMGameplaySampleFallbackLights",
    "UnrealEngineFloor",
    "ObstaclesGroup",
    "DistanceMarkers",
    "MotionMatchingSampleCourse",
    "SM_TerrainLimits",
    "SkyMesh",
    "SkySphere",
    "SkyAtmosphere",
    "SkyStars",
    "SkyClouds",
  ]);

  function storage() {
    if (!window.smProjectStorage) {
      throw new Error(
        "[SMSceneSerializer] smProjectStorage is unavailable.",
      );
    }

    return window.smProjectStorage;
  }

  function scene() {
    return window.scene || null;
  }

  function isTerrainObject(object) {
    if (!object) return false;

    let current = object;

    while (current) {
      const data = current.userData || {};
      const name = String(current.name || "");

      if (
        current === window.terrain ||
        data.isTerrain === true ||
        data.isTerrainMesh === true ||
        data.isTerrainComponent === true ||
        data.isLandscape === true ||
        data.isTerrainBoundary === true ||
        data.isTerrainBoundaryGroup === true ||
        data.terrainSurface === true ||
        name === "Terrain" ||
        name === "Terrain_Mesh" ||
        name.startsWith("TerrainComponent_") ||
        name.startsWith("TerrainLimit_")
      ) {
        return true;
      }

      current = current.parent;
    }

    return false;
  }

  function isPlayerObject(object) {
    if (!object) return false;

    const player = window.playerSystem;

    const roots = [
      player?.character?.model,
      player?.character?.visual,
      player?.model,
      player?.visual,
      window.player?.model,
      window.player?.visual,
    ].filter(Boolean);

    let current = object;

    while (current) {
      if (roots.includes(current)) {
        return true;
      }

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

  function isSystemObject(object) {
    if (!object) return true;

    const data = object.userData || {};
    const name = String(object.name || "");

    if (
      data.isSystemObject === true ||
      data.ignoreInProjectSave === true ||
      data.ignoreInSerialization === true ||
      data.isEditorHelper === true ||
      data.keepForSky === true ||
      data.isSkyLightingObject === true ||
      data.ws_studioLight === true ||
      data.ws_gameLight === true ||
      data.ws_terrainLight === true ||
      data.isGameplaySample === true ||
      data.isGameDevelopmentEnvironment === true ||
      data.smGameProjectObject === true ||
      data.workspaceOnly === "GAMEPLAY_SAMPLE"
    ) {
      return true;
    }

    if (SYSTEM_NAMES.has(name)) {
      return true;
    }

    if (
      name.startsWith("_25dLayer") ||
      name.startsWith("Sky") ||
      name.startsWith("TerrainLimit_")
    ) {
      return true;
    }

    return false;
  }

  function isEditorCamera(object) {
    return (
      object === window.camera ||
      object === window.playerSystem?.playerCamera ||
      object?.userData?.isEditorCamera === true
    );
  }

  function isSerializableRoot(object) {
    if (!object || object.parent !== scene()) {
      return false;
    }

    if (
      isTerrainObject(object) ||
      isPlayerObject(object) ||
      isSystemObject(object) ||
      isEditorCamera(object)
    ) {
      return false;
    }

    /*
     * Save authored content unless it explicitly opts out. Lights, Groups,
     * Meshes, imported GLTF/FBX roots, water/foliage roots, etc. can all use
     * Object3D.toJSON().
     */
    return (
      object.userData?.projectSerializable !== false &&
      typeof object.toJSON === "function"
    );
  }

  function markLoadedTree(root, projectId) {
    if (!root) return;

    root.traverse?.((object) => {
      object.userData = object.userData || {};
      object.userData.smProjectLoaded = true;
      object.userData.smProjectId = projectId;
    });

    root.userData = root.userData || {};
    root.userData.smProjectLoaded = true;
    root.userData.smProjectId = projectId;
  }

  class SMSceneSerializer {
    constructor({
      path = DEFAULT_PATH,
    } = {}) {
      this.path = path;
    }

    getSerializableRoots() {
      const currentScene = scene();

      if (!currentScene) {
        return [];
      }

      return currentScene.children.filter(
        isSerializableRoot,
      );
    }

    capture() {
      const currentScene = scene();

      if (!currentScene) {
        return null;
      }

      const roots =
        this.getSerializableRoots();

      if (
        window.smSceneManager &&
        window.SMWorldSceneSerializer
      ) {
        const world =
          window.SMWorldSceneSerializer.capture(
            window.smSceneManager,
            {
              roots,
              includeSystem: false,
              includeEditorOnly: false,
              resourceMode: "descriptor",
            },
          );

        return {
          format: FORMAT,
          version: VERSION,
          architecture:
            world.format,
          scene: world.scene,
          entities:
            world.entities,
          dependencies:
            world.dependencies,
          statistics:
            world.statistics,
          objectCount:
            roots.length,
          entityCount:
            world.entities.length,
          savedAt:
            world.savedAt,
        };
      }

      const objects = [];

      for (const root of roots) {
        try {
          objects.push({
            name: root.name || "",
            uuid: root.uuid,
            json: root.toJSON(),
          });
        } catch (error) {
          console.warn(
            "[SMSceneSerializer] Failed to serialize object:",
            root?.name || root?.uuid,
            error,
          );
        }
      }

      return {
        format: FORMAT,
        version: VERSION,
        objectCount: objects.length,
        objects,
        savedAt: new Date().toISOString(),
      };
    }

    async save(
      projectId,
      {
        path = this.path,
        touchProject = true,
      } = {},
    ) {
      const payload = this.capture();

      if (!payload) {
        return {
          saved: false,
          reason: "scene-unavailable",
        };
      }

      await storage().writeJSON(
        projectId,
        path,
        payload,
        {
          mimeType: "application/x-sm-scene+json",
          touchProject: false,
        },
      );

      if (touchProject) {
        await storage().touchProject(projectId);
      }

      window.dispatchEvent(
        new CustomEvent("sm:scene-saved", {
          detail: {
            projectId,
            path,
            objectCount: payload.objectCount,
          },
        }),
      );

      return {
        saved: true,
        projectId,
        path,
        objectCount: payload.objectCount,
      };
    }

    async read(
      projectId,
      path = this.path,
    ) {
      return storage().readJSON(
        projectId,
        path,
        null,
      );
    }

    clearProjectScene({
      projectId = null,
      allAuthored = true,
    } = {}) {
      const currentScene = scene();

      if (!currentScene) {
        return 0;
      }

      const remove = [];

      for (const child of currentScene.children) {
        if (
          isTerrainObject(child) ||
          isPlayerObject(child) ||
          isSystemObject(child) ||
          isEditorCamera(child)
        ) {
          continue;
        }

        const data = child.userData || {};

        const belongsToProject =
          projectId &&
          data.smProjectId === projectId;

        if (
          belongsToProject ||
          data.smProjectLoaded === true ||
          (allAuthored && isSerializableRoot(child))
        ) {
          remove.push(child);
        }
      }

      for (const root of remove) {
        /*
         * Do not dispose geometry/materials here. Some imported resources may be
         * shared with the Asset Browser or another scene object.
         */
        root.parent?.remove?.(root);
      }

      return remove.length;
    }

    parseObjectJSON(json) {
      if (!json) return null;

      if (typeof THREE === "undefined") {
        throw new Error(
          "[SMSceneSerializer] THREE is unavailable.",
        );
      }

      const loader = new THREE.ObjectLoader();

      return loader.parse(json);
    }

    async restoreCapture(
      payload,
      {
        projectId = null,
        clearExisting = true,
      } = {},
    ) {
      if (!payload) {
        return {
          loaded: false,
          reason: "empty-payload",
        };
      }

      if (payload.format !== FORMAT) {
        throw new Error(
          `[SMSceneSerializer] Unsupported scene format: ${payload.format}`,
        );
      }

      const currentScene = scene();

      if (!currentScene) {
        throw new Error(
          "[SMSceneSerializer] Scene is unavailable.",
        );
      }

      if (
        Number(payload.version) >= 2 &&
        Array.isArray(payload.entities)
      ) {
        if (!window.smSceneManager) {
          if (!window.SMSceneManager) {
            throw new Error(
              "[SMSceneSerializer] SMSceneManager is unavailable.",
            );
          }
          window.smSceneManager =
            new window.SMSceneManager(
              currentScene,
            ).initialize();
          window.sceneManager =
            window.smSceneManager;
        }

        const result =
          await window.smSceneManager.load(
            {
              format:
                window.SMWorldSceneSerializer.FORMAT,
              version:
                window.SMWorldSceneSerializer.VERSION,
              scene:
                payload.scene || {},
              entities:
                payload.entities,
              dependencies:
                payload.dependencies || [],
              statistics:
                payload.statistics || {},
              savedAt:
                payload.savedAt,
            },
            {
              clearExisting,
              clearFilter: (entity) =>
                isSerializableRoot(
                  entity.object,
                ),
            },
          );

        (result.roots || []).forEach(
          (root) =>
            markLoadedTree(
              root,
              projectId,
            ),
        );

        return {
          ...result,
          objectCount:
            result.roots?.length || 0,
        };
      }

      if (clearExisting) {
        this.clearProjectScene({
          projectId,
          allAuthored: true,
        });
      }

      const restored = [];
      const errors = [];

      for (const record of payload.objects || []) {
        try {
          const root = this.parseObjectJSON(
            record.json,
          );

          if (!root) {
            continue;
          }

          markLoadedTree(root, projectId);

          currentScene.add(root);
          root.updateMatrixWorld?.(true);

          restored.push(root);
        } catch (error) {
          errors.push({
            name: record?.name || "",
            message: String(
              error?.message || error,
            ),
          });

          console.error(
            "[SMSceneSerializer] Failed to restore scene object:",
            record?.name,
            error,
          );
        }
      }

      try {
        window.hierarchyManager?.renderAll?.();
        window.updateHierarchy?.();
      } catch (_) {}

      window.playerSystem?.playerPhysics?.refreshWorld?.(
        true,
      );

      return {
        loaded: errors.length === 0,
        roots: restored,
        objectCount: restored.length,
        errors,
      };
    }

    async load(
      projectId,
      {
        path = this.path,
        clearExisting = true,
      } = {},
    ) {
      const payload = await this.read(
        projectId,
        path,
      );

      if (!payload) {
        return {
          loaded: false,
          skipped: true,
          reason: "scene-file-not-found",
        };
      }

      const result = await this.restoreCapture(
        payload,
        {
          projectId,
          clearExisting,
        },
      );

      window.dispatchEvent(
        new CustomEvent("sm:scene-loaded", {
          detail: {
            projectId,
            path,
            ...result,
          },
        }),
      );

      return result;
    }

    async exists(
      projectId,
      path = this.path,
    ) {
      return storage().exists(
        projectId,
        path,
      );
    }
  }

  SMSceneSerializer.FORMAT = FORMAT;
  SMSceneSerializer.VERSION = VERSION;
  SMSceneSerializer.DEFAULT_PATH = DEFAULT_PATH;

  window.SMSceneSerializer = SMSceneSerializer;

  window.smSceneSerializer =
    window.smSceneSerializer ||
    new SMSceneSerializer();
})();
