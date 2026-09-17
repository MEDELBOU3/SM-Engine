// engine/project/SMProjectSerializer.js
// Orchestrates all subsystem serializers for a project save operation.

(() => {
  "use strict";

  const STATE_PATH =
    "Config/project-state.json";

  const SAVE_FORMAT =
    "SM_PROJECT_STATE";

  const SAVE_VERSION = 1;

  function storage() {
    if (
      !window.smProjectStorage
    ) {
      throw new Error(
        "[SMProjectSerializer] smProjectStorage is unavailable.",
      );
    }

    return window.smProjectStorage;
  }

  class SMProjectSerializer {
    constructor() {
      this.dirty =
        new Set();

      this.lastSaveAt =
        null;

      this.saving =
        false;

      this.savePromise =
        null;

      this.events =
        new EventTarget();

      /*
       * Terrain and workspace are implemented now.
       * Scene/Player serializers can plug in later without changing this class.
       */
      this.serializers =
        new Map();

      this.registerBuiltIns();

      this._bindDirtyEvents();
    }

    registerBuiltIns() {
      this.register(
        "terrain",
        () =>
          window
            .smTerrainSerializer,
      );

      this.register(
        "workspace",
        () =>
          window
            .smWorkspaceSerializer,
      );

      this.register(
        "scene",
        () =>
          window
            .smSceneSerializer,
      );

      this.register(
        "player",
        () =>
          window
            .smPlayerSerializer,
      );
    }

    register(
      name,
      resolver,
    ) {
      if (!name) {
        throw new Error(
          "[SMProjectSerializer] Serializer name is required.",
        );
      }

      this.serializers.set(
        String(name),
        resolver,
      );

      return this;
    }

    unregister(name) {
      return this.serializers.delete(
        String(name),
      );
    }

    resolve(name) {
      const resolver =
        this.serializers.get(
          String(name),
        );

      if (!resolver) {
        return null;
      }

      try {
        return typeof resolver ===
          "function"
          ? resolver()
          : resolver;
      } catch (error) {
        console.warn(
          `[SMProjectSerializer] Failed to resolve ${name} serializer.`,
          error,
        );

        return null;
      }
    }

    markDirty(
      subsystem = "scene",
      reason = null,
    ) {
      const name =
        String(
          subsystem ||
            "scene",
        );

      this.dirty.add(name);

      this.events.dispatchEvent(
        new CustomEvent(
          "dirty",
          {
            detail: {
              subsystem:
                name,
              reason,
            },
          },
        ),
      );

      window.dispatchEvent(
        new CustomEvent(
          "sm:project-dirty",
          {
            detail: {
              subsystem:
                name,
              reason,
            },
          },
        ),
      );

      return true;
    }

    markClean(
      subsystem,
    ) {
      this.dirty.delete(
        String(subsystem),
      );
    }

    clearDirty() {
      this.dirty.clear();
    }

    isDirty(
      subsystem = null,
    ) {
      if (subsystem == null) {
        return (
          this.dirty.size >
          0
        );
      }

      return this.dirty.has(
        String(subsystem),
      );
    }

    getDirtySystems() {
      return Array.from(
        this.dirty,
      );
    }

    _bindDirtyEvents() {
      /*
       * Terrain deformation is the critical first integration.
       */
      window.addEventListener(
        "sm:terrain-deformed",
        () => {
          this.markDirty(
            "terrain",
            "terrain-deformed",
          );
        },
      );

      window.addEventListener(
        "sm:terrain-created",
        () => {
          this.markDirty(
            "terrain",
            "terrain-created",
          );

          this.markDirty(
            "workspace",
            "terrain-created",
          );
        },
      );

      /*
       * Generic hooks other systems can dispatch later.
       */
      window.addEventListener(
        "sm:scene-dirty",
        () =>
          this.markDirty(
            "scene",
            "scene-event",
          ),
      );

      window.addEventListener(
        "sm:player-dirty",
        () =>
          this.markDirty(
            "player",
            "player-event",
          ),
      );

      window.addEventListener(
        "sm:workspace-dirty",
        () =>
          this.markDirty(
            "workspace",
            "workspace-event",
          ),
      );
    }

    _systemsToSave({
      force = false,
      systems = null,
    } = {}) {
      if (
        Array.isArray(systems)
      ) {
        return Array.from(
          new Set(
            systems.map(String),
          ),
        );
      }

      if (force) {
        return Array.from(
          this.serializers.keys(),
        );
      }

      const dirty =
        this.getDirtySystems();

      /*
       * First manual save must capture terrain + workspace even if no dirty
       * event has fired yet.
       */
      if (
        !this.lastSaveAt &&
        dirty.length === 0
      ) {
        return [
          "terrain",
          "workspace",
        ];
      }

      /*
       * Workspace is cheap and important (camera/tool state), so always include
       * it whenever another subsystem is being saved.
       */
      if (
        dirty.length > 0 &&
        !dirty.includes(
          "workspace",
        )
      ) {
        dirty.push(
          "workspace",
        );
      }

      return dirty;
    }

    async saveProject(
      projectId,
      options = {},
    ) {
      if (this.saving) {
        return this.savePromise;
      }

      this.saving = true;

      this.savePromise =
        this._saveProjectInternal(
          projectId,
          options,
        );

      try {
        return await this.savePromise;
      } finally {
        this.saving = false;
        this.savePromise =
          null;
      }
    }

    async _saveProjectInternal(
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
          `[SMProjectSerializer] Project not found: ${projectId}`,
        );
      }

      const systems =
        this._systemsToSave(
          options,
        );

      const results = {};
      const errors = {};

      window.dispatchEvent(
        new CustomEvent(
          "sm:project-save-start",
          {
            detail: {
              projectId,
              systems: [
                ...systems,
              ],
            },
          },
        ),
      );

      for (
        const name of systems
      ) {
        const serializer =
          this.resolve(name);

        if (
          !serializer ||
          typeof serializer.save !==
            "function"
        ) {
          /*
           * SceneSerializer / PlayerSerializer are intentionally optional at
           * this stage.
           */
          results[name] = {
            saved: false,
            skipped: true,
            reason:
              "serializer-unavailable",
          };

          continue;
        }

        try {
          const result =
            await serializer.save(
              projectId,
              {
                touchProject:
                  false,
              },
            );

          results[name] =
            result ?? {
              saved: true,
            };

          this.markClean(
            name,
          );
        } catch (error) {
          errors[name] =
            String(
              error?.message ||
                error,
            );

          console.error(
            `[SMProjectSerializer] Failed to save ${name}.`,
            error,
          );

          if (
            options
              .continueOnError ===
            false
          ) {
            throw error;
          }
        }
      }

      const savedAt =
        new Date()
          .toISOString();

      const state = {
        format:
          SAVE_FORMAT,

        version:
          SAVE_VERSION,

        projectId,

        savedAt,

        systems:
          results,

        errors,

        dirtyRemaining:
          this.getDirtySystems(),
      };

      await storage()
        .writeJSON(
          projectId,
          STATE_PATH,
          state,
          {
            mimeType:
              "application/x-sm-project-state+json",

            touchProject:
              false,
          },
        );

      const workspaceMode =
        window.workspaceManager
          ?.currentMode ||
        project.workspace ||
        "FILM";

      const updatedProject =
        await storage()
          .updateProject(
            projectId,
            {
              workspace:
                String(
                  workspaceMode,
                ).toUpperCase(),

              metadata: {
                lastSaveAt:
                  savedAt,
              },
            },
          );

      this.lastSaveAt =
        savedAt;

      window.dispatchEvent(
        new CustomEvent(
          "sm:project-saved",
          {
            detail: {
              project:
                updatedProject,
              results,
              errors,
            },
          },
        ),
      );

      return {
        saved:
          Object.keys(
            errors,
          ).length === 0,

        project:
          updatedProject,

        systems:
          results,

        errors,

        savedAt,
      };
    }

    async saveAll(
      projectId,
      options = {},
    ) {
      return this.saveProject(
        projectId,
        {
          ...options,
          force: true,
        },
      );
    }

    async readLastSaveState(
      projectId,
    ) {
      return storage()
        .readJSON(
          projectId,
          STATE_PATH,
          null,
        );
    }
  }

  SMProjectSerializer.STATE_PATH =
    STATE_PATH;

  window.SMProjectSerializer =
    SMProjectSerializer;

  window.smProjectSerializer =
    window.smProjectSerializer ||
    new SMProjectSerializer();

  /*
   * Global helper for systems that do not want a direct project dependency.
   */
  window.markSMProjectDirty =
    (
      subsystem,
      reason = null,
    ) =>
      window
        .smProjectSerializer
        ?.markDirty(
          subsystem,
          reason,
        );
})();