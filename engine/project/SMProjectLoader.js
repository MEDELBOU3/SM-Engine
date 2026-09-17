// engine/project/SMProjectLoader.js
// Restores an SM Engine project from IndexedDB virtual project files.
// Terrain + Workspace are implemented in this step.
// Scene/Player serializers will plug in later.

(() => {
  "use strict";

  function storage() {
    if (
      !window.smProjectStorage
    ) {
      throw new Error(
        "[SMProjectLoader] smProjectStorage is unavailable.",
      );
    }

    return window.smProjectStorage;
  }

  class SMProjectLoader {
    constructor() {
      this.loading = false;
      this.activeLoadPromise =
        null;
      this.lastLoadedProject =
        null;
    }

    async loadProject(
      projectId,
      {
        restoreWorkspace = true,
        restoreTerrain = true,
        restoreScene = true,
        restorePlayer = true,
      } = {},
    ) {
      if (this.loading) {
        return this.activeLoadPromise;
      }

      this.loading = true;

      this.activeLoadPromise =
        this._loadProjectInternal(
          projectId,
          {
            restoreWorkspace,
            restoreTerrain,
            restoreScene,
            restorePlayer,
          },
        );

      try {
        return await this.activeLoadPromise;
      } finally {
        this.loading = false;
        this.activeLoadPromise =
          null;
      }
    }

    async _loadProjectInternal(
      projectId,
      options,
    ) {
      const project =
        await storage()
          .getProject(
            projectId,
          );

      if (!project) {
        throw new Error(
          `[SMProjectLoader] Project not found: ${projectId}`,
        );
      }

      window.dispatchEvent(
        new CustomEvent(
          "sm:project-load-start",
          {
            detail: {
              project,
            },
          },
        ),
      );

      const results = {};
      const errors = {};

      /*
       * IMPORTANT LOAD ORDER
       * --------------------
       * 1. Read workspace state to know which mode project belongs to.
       * 2. Switch workspace before creating Terrain so visibility rules are
       *    correct while Terrain components are added.
       * 3. Load Terrain.
       * 4. Future: Scene + Player.
       * 5. Restore camera/tool/selection AFTER objects exist.
       */
      const workspaceSerializer =
        window.smWorkspaceSerializer;

      let workspaceState =
        null;

      if (
        options.restoreWorkspace &&
        workspaceSerializer
      ) {
        try {
          workspaceState =
            await workspaceSerializer
              .read(projectId);

          const mode =
            workspaceState
              ?.workspace
              ?.mode ||
            project.workspace ||
            "FILM";

          const manager =
            window.workspaceManager;

          if (
            manager &&
            mode
          ) {
            const gameMode =
              workspaceState
                ?.workspace
                ?.gameMode;

            if (
              mode ===
                "GAME_DEV" &&
              gameMode
            ) {
              manager.setGameMode?.(
                gameMode,
                {
                  applyViewport:
                    false,
                  showToast:
                    false,
                },
              );
            }

            manager.setMode?.(
              mode,
            );
          }

          results.workspaceMode = {
            loaded: true,
            mode,
          };
        } catch (error) {
          errors.workspaceMode =
            String(
              error?.message ||
                error,
            );

          console.error(
            "[SMProjectLoader] Workspace mode restore failed.",
            error,
          );
        }
      }

      if (
        options.restoreScene
      ) {
        const serializer =
          window.smSceneSerializer;

        if (
          serializer &&
          typeof serializer.load ===
            "function"
        ) {
          try {
            results.scene =
              await serializer.load(
                projectId,
              );
          } catch (error) {
            errors.scene =
              String(
                error?.message ||
                  error,
              );

            console.error(
              "[SMProjectLoader] Scene load failed.",
              error,
            );
          }
        } else {
          results.scene = {
            loaded: false,
            skipped: true,
            reason:
              "serializer-unavailable",
          };
        }
      }

      if (
        options.restoreTerrain
      ) {
        const serializer =
          window.smTerrainSerializer;

        if (
          serializer &&
          typeof serializer.load ===
            "function"
        ) {
          try {
            if (
              await serializer
                .exists(
                  projectId,
                )
            ) {
              results.terrain =
                await serializer.load(
                  projectId,
                  {
                    select:
                      false,
                  },
                );
            } else {
              results.terrain = {
                loaded: false,
                skipped: true,
                reason:
                  "terrain-file-not-found",
              };
            }
          } catch (error) {
            errors.terrain =
              String(
                error?.message ||
                  error,
              );

            console.error(
              "[SMProjectLoader] Terrain load failed.",
              error,
            );
          }
        }
      }

      if (
        options.restorePlayer
      ) {
        const serializer =
          window.smPlayerSerializer;

        if (
          serializer &&
          typeof serializer.load ===
            "function"
        ) {
          try {
            results.player =
              await serializer.load(
                projectId,
              );
          } catch (error) {
            errors.player =
              String(
                error?.message ||
                  error,
              );

            console.error(
              "[SMProjectLoader] Player load failed.",
              error,
            );
          }
        } else {
          results.player = {
            loaded: false,
            skipped: true,
            reason:
              "serializer-unavailable",
          };
        }
      }

      /*
       * Restore the remaining editor state only after Terrain/Scene objects have
       * been reconstructed, otherwise workspace camera repair can overwrite the
       * saved camera and selection cannot find its target.
       */
      if (
        options.restoreWorkspace &&
        workspaceSerializer &&
        workspaceState
      ) {
        try {
          results.workspace =
            await workspaceSerializer
              .load(
                projectId,
                {
                  restoreMode:
                    false,
                  restoreCamera:
                    true,
                  restoreTerrainEditor:
                    true,
                  restoreSelection:
                    true,
                  cameraDelayMs:
                    140,
                },
              );
        } catch (error) {
          errors.workspace =
            String(
              error?.message ||
                error,
            );

          console.error(
            "[SMProjectLoader] Workspace state restore failed.",
            error,
          );
        }
      }

      await storage()
        .markProjectOpened(
          projectId,
        );

      this.lastLoadedProject =
        projectId;

      /*
       * Loading a saved project establishes a clean baseline.
       */
      window.smProjectSerializer
        ?.clearDirty?.();

      const payload = {
        loaded:
          Object.keys(
            errors,
          ).length === 0,

        project,
        results,
        errors,
      };

      window.dispatchEvent(
        new CustomEvent(
          "sm:project-loaded",
          {
            detail:
              payload,
          },
        ),
      );

      return payload;
    }

    async reloadProject(
      projectId =
        this.lastLoadedProject,
    ) {
      if (!projectId) {
        throw new Error(
          "[SMProjectLoader] No project has been loaded yet.",
        );
      }

      return this.loadProject(
        projectId,
      );
    }
  }

  window.SMProjectLoader =
    SMProjectLoader;

  window.smProjectLoader =
    window.smProjectLoader ||
    new SMProjectLoader();
})();