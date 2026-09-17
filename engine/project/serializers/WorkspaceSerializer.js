// engine/project/serializers/WorkspaceSerializer.js
// Saves/restores editor workspace, camera and Terrain Sculpting editor state.

(() => {
  "use strict";

  const FORMAT =
    "SM_WORKSPACE_STATE";

  const VERSION = 1;

  const DEFAULT_PATH =
    "Config/workspace.json";

  function getStorage() {
    if (
      !window.smProjectStorage
    ) {
      throw new Error(
        "[SMWorkspaceSerializer] smProjectStorage is unavailable.",
      );
    }

    return window.smProjectStorage;
  }

  function vector3(value) {
    if (!value) {
      return [0, 0, 0];
    }

    return [
      Number(value.x) || 0,
      Number(value.y) || 0,
      Number(value.z) || 0,
    ];
  }

  function quaternion(value) {
    if (!value) {
      return [0, 0, 0, 1];
    }

    return [
      Number(value.x) || 0,
      Number(value.y) || 0,
      Number(value.z) || 0,
      Number.isFinite(
        Number(value.w),
      )
        ? Number(value.w)
        : 1,
    ];
  }

  function finiteOrNull(value) {
    const number =
      Number(value);

    return Number.isFinite(
      number,
    )
      ? number
      : null;
  }

  function captureTerrainEditor() {
    const NS =
      window.TerrainSculpting;

    const state =
      NS?.state;

    if (!state) {
      return null;
    }

    return {
      mode:
        state.mode ??
        null,

      activeTool:
        state.activeTool ??
        state.tool ??
        null,

      brushSize:
        finiteOrNull(
          state.brushSize,
        ),

      brushStrength:
        finiteOrNull(
          state.brushStrength,
        ),

      brushFalloff:
        finiteOrNull(
          state.brushFalloff ??
            state.falloff,
        ),

      symmetryEnabled:
        state.symmetryEnabled ===
        true,

      symmetryAxis:
        state.symmetryAxis ??
        null,

      flattenHeight:
        finiteOrNull(
          state.flattenHeight,
        ),

      erosionIterations:
        finiteOrNull(
          state.erosionIterations,
        ),

      selectedTerrainName:
        NS.getLandscape?.()
          ?.name ||
        state.activeLandscape
          ?.name ||
        window.terrain?.name ||
        null,
    };
  }

  class SMWorkspaceSerializer {
    constructor({
      path =
        DEFAULT_PATH,
    } = {}) {
      this.path = path;
    }

    capture() {
      const manager =
        window.workspaceManager;

      const camera =
        window.camera;

      const controls =
        window.orbitControls ||
        window.controls ||
        null;

      const selected =
        window.selectedObject ||
        null;

      return {
        format: FORMAT,
        version: VERSION,

        workspace: {
          mode:
            String(
              manager
                ?.currentMode ||
                localStorage
                  .getItem(
                    "sm_workspace_mode",
                  ) ||
                "FILM",
            ).toUpperCase(),

          gameMode:
            manager
              ?.currentGameMode ||
            localStorage
              .getItem(
                "sm_game_dev_mode",
              ) ||
            "3D",
        },

        camera: camera
          ? {
              position:
                vector3(
                  camera.position,
                ),

              quaternion:
                quaternion(
                  camera.quaternion,
                ),

              up:
                vector3(
                  camera.up,
                ),

              fov:
                finiteOrNull(
                  camera.fov,
                ),

              near:
                finiteOrNull(
                  camera.near,
                ),

              far:
                finiteOrNull(
                  camera.far,
                ),

              zoom:
                finiteOrNull(
                  camera.zoom,
                ),

              target:
                controls?.target
                  ? vector3(
                      controls.target,
                    )
                  : null,
            }
          : null,

        selection: {
          name:
            selected?.name ||
            null,

          uuid:
            selected?.uuid ||
            null,
        },

        terrainEditor:
          captureTerrainEditor(),

        savedAt:
          new Date()
            .toISOString(),
      };
    }

    async save(
      projectId,
      {
        path =
          this.path,
        touchProject = true,
      } = {},
    ) {
      const state =
        this.capture();

      await getStorage()
        .writeJSON(
          projectId,
          path,
          state,
          {
            mimeType:
              "application/x-sm-workspace+json",

            touchProject:
              false,
          },
        );

      if (touchProject) {
        await getStorage()
          .touchProject(
            projectId,
          );
      }

      window.dispatchEvent(
        new CustomEvent(
          "sm:workspace-state-saved",
          {
            detail: {
              projectId,
              path,
              state,
            },
          },
        ),
      );

      return state;
    }

    async read(
      projectId,
      path = this.path,
    ) {
      return getStorage()
        .readJSON(
          projectId,
          path,
          null,
        );
    }

    _restoreTerrainEditor(
      terrainState,
    ) {
      if (!terrainState) {
        return;
      }

      const NS =
        window.TerrainSculpting;

      const state =
        NS?.state;

      if (!state) {
        return;
      }

      const setNumber = (
        key,
        value,
      ) => {
        const number =
          Number(value);

        if (
          Number.isFinite(number)
        ) {
          state[key] =
            number;
        }
      };

      setNumber(
        "brushSize",
        terrainState
          .brushSize,
      );

      setNumber(
        "brushStrength",
        terrainState
          .brushStrength,
      );

      if (
        terrainState
          .brushFalloff != null
      ) {
        const number =
          Number(
            terrainState
              .brushFalloff,
          );

        if (
          Number.isFinite(number)
        ) {
          if (
            "brushFalloff" in
            state
          ) {
            state.brushFalloff =
              number;
          }

          if (
            "falloff" in state
          ) {
            state.falloff =
              number;
          }
        }
      }

      if (
        terrainState.mode !=
        null
      ) {
        state.mode =
          terrainState.mode;
      }

      state.symmetryEnabled =
        terrainState
          .symmetryEnabled ===
        true;

      if (
        terrainState
          .symmetryAxis
      ) {
        state.symmetryAxis =
          terrainState
            .symmetryAxis;
      }

      setNumber(
        "flattenHeight",
        terrainState
          .flattenHeight,
      );

      setNumber(
        "erosionIterations",
        terrainState
          .erosionIterations,
      );

      const activeTool =
        terrainState
          .activeTool;

      if (activeTool) {
        NS.interaction
          ?.setActiveTool?.(
            activeTool,
          );

        if (
          "activeTool" in
          state
        ) {
          state.activeTool =
            activeTool;
        }
      }

      NS.preview
        ?.createOrUpdate3DBrushPreview?.();

      NS.ui
        ?.setupBrushControls?.();
    }

    _restoreCamera(
      state,
    ) {
      const cameraState =
        state?.camera;

      const camera =
        window.camera;

      if (
        !cameraState ||
        !camera
      ) {
        return false;
      }

      const position =
        cameraState.position;

      if (
        Array.isArray(position) &&
        position.length >= 3
      ) {
        camera.position.set(
          Number(
            position[0],
          ) || 0,
          Number(
            position[1],
          ) || 0,
          Number(
            position[2],
          ) || 0,
        );
      }

      const rotation =
        cameraState.quaternion;

      if (
        Array.isArray(rotation) &&
        rotation.length >= 4
      ) {
        camera.quaternion.set(
          Number(
            rotation[0],
          ) || 0,
          Number(
            rotation[1],
          ) || 0,
          Number(
            rotation[2],
          ) || 0,
          Number.isFinite(
            Number(
              rotation[3],
            ),
          )
            ? Number(
                rotation[3],
              )
            : 1,
        );
      }

      if (
        Array.isArray(
          cameraState.up,
        ) &&
        cameraState.up.length >=
          3
      ) {
        camera.up.set(
          Number(
            cameraState.up[0],
          ) || 0,
          Number(
            cameraState.up[1],
          ) || 1,
          Number(
            cameraState.up[2],
          ) || 0,
        );
      }

      for (
        const key of [
          "fov",
          "near",
          "far",
          "zoom",
        ]
      ) {
        if (
          key in camera &&
          Number.isFinite(
            Number(
              cameraState[key],
            ),
          )
        ) {
          camera[key] =
            Number(
              cameraState[key],
            );
        }
      }

      camera
        .updateProjectionMatrix?.();

      camera
        .updateMatrixWorld?.(
          true,
        );

      const controls =
        window.orbitControls ||
        window.controls;

      if (
        controls?.target &&
        Array.isArray(
          cameraState.target,
        )
      ) {
        controls.target.set(
          Number(
            cameraState
              .target[0],
          ) || 0,
          Number(
            cameraState
              .target[1],
          ) || 0,
          Number(
            cameraState
              .target[2],
          ) || 0,
        );

        controls.update?.();
      }

      return true;
    }

    _restoreSelection(
      state,
    ) {
      const scene =
        window.scene;

      if (!scene) {
        return null;
      }

      const selection =
        state?.selection;

      if (!selection) {
        return null;
      }

      let object = null;

      if (selection.uuid) {
        object =
          scene.getObjectByProperty?.(
            "uuid",
            selection.uuid,
          ) || null;
      }

      if (
        !object &&
        selection.name
      ) {
        object =
          scene.getObjectByName?.(
            selection.name,
          ) || null;
      }

      if (!object) {
        return null;
      }

      window.selectedObject =
        object;

      window.selectedObjects =
        [object];

      window.transformControls
        ?.attach?.(
          object,
        );

      window.updateInspector?.();

      return object;
    }

    async load(
      projectId,
      {
        path =
          this.path,
        restoreMode = true,
        restoreCamera = true,
        restoreTerrainEditor = true,
        restoreSelection = true,
        cameraDelayMs = 80,
      } = {},
    ) {
      const state =
        await this.read(
          projectId,
          path,
        );

      if (!state) {
        return {
          loaded: false,
          reason:
            "workspace-file-not-found",
        };
      }

      const workspace =
        state.workspace ||
        {};

      if (restoreMode) {
        const manager =
          window.workspaceManager;

        if (
          manager &&
          workspace.mode
        ) {
          if (
            workspace.gameMode &&
            workspace.mode ===
              "GAME_DEV"
          ) {
            manager.setGameMode?.(
              workspace.gameMode,
              {
                applyViewport:
                  false,

                showToast:
                  false,
              },
            );
          }

          manager.setMode?.(
            workspace.mode,
          );
        }
      }

      if (
        restoreTerrainEditor
      ) {
        this._restoreTerrainEditor(
          state.terrainEditor,
        );
      }

      const applyLateState =
        () => {
          if (restoreCamera) {
            this._restoreCamera(
              state,
            );
          }

          if (
            restoreSelection
          ) {
            this._restoreSelection(
              state,
            );
          }

          window.dispatchEvent(
            new CustomEvent(
              "sm:workspace-state-loaded",
              {
                detail: {
                  projectId,
                  path,
                  state,
                },
              },
            ),
          );
        };

      if (
        cameraDelayMs > 0
      ) {
        setTimeout(
          applyLateState,
          cameraDelayMs,
        );
      } else {
        applyLateState();
      }

      return {
        loaded: true,
        state,
      };
    }

    async exists(
      projectId,
      path = this.path,
    ) {
      return getStorage()
        .exists(
          projectId,
          path,
        );
    }
  }

  SMWorkspaceSerializer.FORMAT =
    FORMAT;

  SMWorkspaceSerializer.VERSION =
    VERSION;

  SMWorkspaceSerializer.DEFAULT_PATH =
    DEFAULT_PATH;

  window.SMWorkspaceSerializer =
    SMWorkspaceSerializer;

  window.smWorkspaceSerializer =
    window.smWorkspaceSerializer ||
    new SMWorkspaceSerializer();
})();