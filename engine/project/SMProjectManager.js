// engine/project/SMProjectManager.js
// Main SM Engine project orchestrator.
// MUST load LAST in engine/project/.

(() => {
  "use strict";

  const LAST_PROJECT_KEY =
    "sm_project_last_active_id";

  function storage() {
    if (!window.smProjectStorage) {
      throw new Error(
        "[SMProjectManager] smProjectStorage is unavailable.",
      );
    }

    return window.smProjectStorage;
  }

  function serializer() {
    if (!window.smProjectSerializer) {
      throw new Error(
        "[SMProjectManager] smProjectSerializer is unavailable.",
      );
    }

    return window.smProjectSerializer;
  }

  function loader() {
    if (!window.smProjectLoader) {
      throw new Error(
        "[SMProjectManager] smProjectLoader is unavailable.",
      );
    }

    return window.smProjectLoader;
  }

  class SMProjectManager {
    constructor() {
      this.activeProject = null;
      this.ready = false;
      this.initializing = false;
      this.events = new EventTarget();

      this._keyboardBound = false;
      this._beforeUnloadBound = false;

      this._initPromise = null;

      this.init();
    }

    async init() {
      if (this.ready) {
        return this;
      }

      if (
        this.initializing &&
        this._initPromise
      ) {
        return this._initPromise;
      }

      this.initializing = true;

      this._initPromise =
        this._initInternal();

      try {
        return await this._initPromise;
      } finally {
        this.initializing = false;
        this._initPromise = null;
      }
    }

    async _initInternal() {
      await storage().init();

      this._bindKeyboard();
      this._bindBeforeUnload();

      this.ready = true;

      window.dispatchEvent(
        new CustomEvent(
          "sm:project-manager-ready",
          {
            detail: {
              manager: this,
            },
          },
        ),
      );

      return this;
    }

    _emit(type, detail = {}) {
      this.events.dispatchEvent(
        new CustomEvent(type, {
          detail,
        }),
      );

      window.dispatchEvent(
        new CustomEvent(
          `sm:project-${type}`,
          {
            detail,
          },
        ),
      );
    }

    on(type, handler, options) {
      this.events.addEventListener(
        type,
        handler,
        options,
      );

      return () =>
        this.events.removeEventListener(
          type,
          handler,
          options,
        );
    }

    get hasActiveProject() {
      return !!this.activeProject;
    }

    get activeProjectId() {
      return (
        this.activeProject?.id ||
        null
      );
    }

    isDirty() {
      return (
        serializer()
          .isDirty?.() === true
      );
    }

    getDirtySystems() {
      return (
        serializer()
          .getDirtySystems?.() ||
        []
      );
    }

    async listProjects() {
      await this.init();

      return storage()
        .listProjects();
    }

    async createProject({
      name = "Untitled Project",
      workspace = null,
      startupScene =
        "Maps/Main.smscene",
      metadata = {},
      activate = true,
    } = {}) {
      await this.init();

      const mode =
        String(
          workspace ||
            window
              .workspaceManager
              ?.currentMode ||
            "FILM",
        ).toUpperCase();

      const project =
        await storage()
          .createProject({
            name,
            workspace:
              mode,
            startupScene,
            metadata,
          });

      /*
       * First project save captures the current live workspace. This lets users
       * create a project after they already started sculpting/modeling.
       */
      if (activate) {
        await this.activateProject(
          project,
          {
            load: false,
          },
        );

        serializer()
          .markDirty(
            "workspace",
            "project-created",
          );

        if (
          window.TerrainSculpting
            ?.getLandscape?.() ||
          window.terrain
        ) {
          serializer()
            .markDirty(
              "terrain",
              "project-created-with-terrain",
            );
        }

        serializer()
          .markDirty(
            "scene",
            "project-created",
          );

        if (
          window.playerSystem
            ?.ready
        ) {
          serializer()
            .markDirty(
              "player",
              "project-created",
            );
        }
      }

      this._emit(
        "created",
        {
          project,
        },
      );

      return project;
    }

    async activateProject(
      projectOrId,
      {
        load = false,
      } = {},
    ) {
      await this.init();

      const project =
        typeof projectOrId ===
          "string"
          ? await storage()
              .getProject(
                projectOrId,
              )
          : projectOrId;

      if (!project?.id) {
        throw new Error(
          "[SMProjectManager] Project not found.",
        );
      }

      this.activeProject =
        project;

      try {
        localStorage.setItem(
          LAST_PROJECT_KEY,
          project.id,
        );
      } catch (_) {}

      await storage()
        .markProjectOpened(
          project.id,
        );

      if (load) {
        await loader()
          .loadProject(
            project.id,
          );

        this.activeProject =
          (await storage()
            .getProject(
              project.id,
            )) || project;
      }

      window.smProjectAutosave
        ?.start?.(
          project.id,
        );

      this._emit(
        "activated",
        {
          project:
            this.activeProject,
          projectId:
            project.id,
        },
      );

      return this.activeProject;
    }

    async openProject(
      projectId,
      options = {},
    ) {
      await this.init();

      if (
        this.activeProject &&
        this.activeProject.id !==
          projectId &&
        this.isDirty() &&
        options.force !== true
      ) {
        const saveFirst =
          options.saveCurrent ===
          true;

        if (saveFirst) {
          await this.saveProject();
        } else if (
          options.discardCurrent !==
          true
        ) {
          throw new Error(
            "[SMProjectManager] Current project has unsaved changes. Save or pass { discardCurrent:true }.",
          );
        }
      }

      const project =
        await storage()
          .getProject(
            projectId,
          );

      if (!project) {
        throw new Error(
          `[SMProjectManager] Project not found: ${projectId}`,
        );
      }

      await this.activateProject(
        project,
        {
          load: false,
        },
      );

      const result =
        await loader()
          .loadProject(
            project.id,
          );

      this.activeProject =
        (await storage()
          .getProject(
            project.id,
          )) || project;

      serializer()
        .clearDirty?.();

      this._emit(
        "opened",
        {
          project:
            this.activeProject,
          result,
        },
      );

      return {
        project:
          this.activeProject,
        result,
      };
    }

    async saveProject({
      force = false,
    } = {}) {
      await this.init();

      if (!this.activeProject) {
        throw new Error(
          "[SMProjectManager] No active project. Create or open a project first.",
        );
      }

      const result =
        await serializer()
          .saveProject(
            this.activeProject.id,
            {
              force,
            },
          );

      this.activeProject =
        result.project ||
        (await storage()
          .getProject(
            this.activeProject.id,
          ));

      this._emit(
        "save-complete",
        {
          project:
            this.activeProject,
          result,
        },
      );

      return result;
    }

    async saveAll() {
      return this.saveProject({
        force: true,
      });
    }

    async saveAs(
      name,
      {
        workspace = null,
      } = {},
    ) {
      await this.init();

      const cleanName =
        String(name || "")
          .trim();

      if (!cleanName) {
        throw new Error(
          "[SMProjectManager] Save As requires a project name.",
        );
      }

      const project =
        await storage()
          .createProject({
            name: cleanName,
            workspace:
              workspace ||
              window
                .workspaceManager
                ?.currentMode ||
              this.activeProject
                ?.workspace ||
              "FILM",
            startupScene:
              this.activeProject
                ?.startupScene ||
              "Maps/Main.smscene",
            metadata: {
              duplicatedFrom:
                this.activeProject
                  ?.id ||
                null,
            },
          });

      await this.activateProject(
        project,
        {
          load: false,
        },
      );

      /*
       * Save current live engine state into the new project.
       */
      serializer()
        .markDirty(
          "scene",
          "save-as",
        );

      serializer()
        .markDirty(
          "terrain",
          "save-as",
        );

      serializer()
        .markDirty(
          "workspace",
          "save-as",
        );

      serializer()
        .markDirty(
          "player",
          "save-as",
        );

      const result =
        await this.saveAll();

      this._emit(
        "saved-as",
        {
          project:
            this.activeProject,
          result,
        },
      );

      return {
        project:
          this.activeProject,
        result,
      };
    }

    async closeProject({
      save = false,
      discard = false,
    } = {}) {
      if (!this.activeProject) {
        return true;
      }

      if (
        this.isDirty() &&
        !save &&
        !discard
      ) {
        throw new Error(
          "[SMProjectManager] Project has unsaved changes. Use { save:true } or { discard:true }.",
        );
      }

      if (save) {
        await this.saveProject();
      }

      const project =
        this.activeProject;

      window.smProjectAutosave
        ?.stop?.();

      this.activeProject =
        null;

      serializer()
        .clearDirty?.();

      try {
        localStorage.removeItem(
          LAST_PROJECT_KEY,
        );
      } catch (_) {}

      this._emit(
        "closed",
        {
          project,
          projectId:
            project.id,
        },
      );

      return true;
    }

    async deleteProject(
      projectId,
      {
        force = false,
      } = {},
    ) {
      if (
        this.activeProject
          ?.id === projectId
      ) {
        if (
          this.isDirty() &&
          !force
        ) {
          throw new Error(
            "[SMProjectManager] Active project has unsaved changes.",
          );
        }

        await this.closeProject({
          discard: true,
        });
      }

      const deleted =
        await storage()
          .deleteProject(
            projectId,
          );

      this._emit(
        "deleted",
        {
          projectId,
        },
      );

      return deleted;
    }

    markDirty(
      subsystem,
      reason = null,
    ) {
      return serializer()
        .markDirty(
          subsystem,
          reason,
        );
    }

    async openLastProject({
      load = true,
    } = {}) {
      let id = null;

      try {
        id =
          localStorage.getItem(
            LAST_PROJECT_KEY,
          );
      } catch (_) {}

      if (!id) {
        return null;
      }

      const project =
        await storage()
          .getProject(id);

      if (!project) {
        try {
          localStorage.removeItem(
            LAST_PROJECT_KEY,
          );
        } catch (_) {}

        return null;
      }

      if (load) {
        return this.openProject(
          id,
          {
            discardCurrent:
              true,
          },
        );
      }

      return this.activateProject(
        project,
        {
          load: false,
        },
      );
    }

    _bindKeyboard() {
      if (this._keyboardBound) {
        return;
      }

      this._keyboardBound = true;

      window.addEventListener(
        "keydown",
        (event) => {
          const modifier =
            event.ctrlKey ||
            event.metaKey;

          if (
            !modifier ||
            String(
              event.key,
            ).toLowerCase() !==
              "s"
          ) {
            return;
          }

          event.preventDefault();
          event.stopPropagation();

          if (
            event.shiftKey
          ) {
            /*
             * UI/AssetsPanel can listen and show a proper Save As window.
             * prompt() is only a fallback until that UI is connected.
             */
            window.dispatchEvent(
              new CustomEvent(
                "sm:project-save-as-requested",
              ),
            );

            if (
              !this.activeProject
            ) {
              return;
            }

            const name =
              window.prompt?.(
                "Save project as:",
                `${this.activeProject.name} Copy`,
              );

            if (name) {
              this.saveAs(name)
                .catch(
                  (error) =>
                    console.error(
                      "[SMProjectManager] Save As failed.",
                      error,
                    ),
                );
            }

            return;
          }

          if (
            !this.activeProject
          ) {
            window.dispatchEvent(
              new CustomEvent(
                "sm:project-save-requested-without-project",
              ),
            );

            console.warn(
              "[SMProjectManager] Ctrl+S ignored: no active project.",
            );

            return;
          }

          this.saveProject()
            .catch(
              (error) =>
                console.error(
                  "[SMProjectManager] Ctrl+S save failed.",
                  error,
                ),
            );
        },
        true,
      );
    }

    _bindBeforeUnload() {
      if (
        this._beforeUnloadBound
      ) {
        return;
      }

      this._beforeUnloadBound =
        true;

      window.addEventListener(
        "beforeunload",
        (event) => {
          if (
            !this.activeProject ||
            !this.isDirty()
          ) {
            return;
          }

          event.preventDefault();
          event.returnValue = "";
        },
      );
    }

    getState() {
      return {
        ready: this.ready,
        activeProject:
          this.activeProject,
        dirty:
          this.isDirty(),
        dirtySystems:
          this.getDirtySystems(),
        autosaveEnabled:
          window
            .smProjectAutosave
            ?.enabled ??
          false,
      };
    }
  }

  window.SMProjectManager =
    SMProjectManager;

  window.smProjectManager =
    window.smProjectManager ||
    new SMProjectManager();

  /*
   * Short aliases for console/testing and future File menu integration.
   */
  window.createSMProject =
    (options) =>
      window.smProjectManager
        .createProject(
          options,
        );

  window.openSMProject =
    (projectId, options) =>
      window.smProjectManager
        .openProject(
          projectId,
          options,
        );

  window.saveSMProject =
    (options) =>
      window.smProjectManager
        .saveProject(
          options,
        );
})();