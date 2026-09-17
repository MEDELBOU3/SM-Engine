// engine/project/integration/SMWorkspaceProjectBridge.js
// Bridges the existing SMWorkspaceManager launcher to the real
// SMProjectManager + IndexedDB project backend.
//
// Load AFTER:
//   SMWorkspaceManager.js
//   engine/project/SMProjectManager.js
//
// This intentionally disables the old "sm_projects" localStorage project list.

(() => {
  "use strict";

  const BRIDGE_FLAG = "__smProjectWorkspaceBridgeV1";

  function projectManager() {
    return window.smProjectManager || null;
  }

  function projectStorage() {
    return window.smProjectStorage || null;
  }

  function normalizeMode(value) {
    const mode = String(value || "FILM").toUpperCase();

    return [
      "FILM",
      "GAME_DEV",
      "GAMEPLAY_SAMPLE",
      "TERRAIN",
    ].includes(mode)
      ? mode
      : "FILM";
  }

  function asWorkspaceProject(project) {
    if (!project) return null;

    return {
      ...project,

      /*
       * Compatibility aliases used by the existing WorkspaceManager UI.
       * The canonical fields remain workspace / modifiedAt.
       */
      mode: normalizeMode(
        project.workspace ||
          project.mode,
      ),

      date:
        project.modifiedAt ||
        project.createdAt ||
        new Date().toISOString(),

      gameMode:
        project.metadata?.gameMode ||
        project.gameMode ||
        "3D",
    };
  }

  async function waitForProjectSystem(timeoutMs = 10000) {
    const startedAt = performance.now();

    while (performance.now() - startedAt < timeoutMs) {
      const manager = projectManager();
      const storage = projectStorage();

      if (
        manager &&
        storage &&
        manager.ready !== false
      ) {
        await manager.init?.();
        return manager;
      }

      await new Promise((resolve) =>
        setTimeout(resolve, 40),
      );
    }

    throw new Error(
      "[WorkspaceProjectBridge] SMProjectManager did not become ready.",
    );
  }

  function patchModalLabels(instance) {
    const modal = instance?.modal;

    if (!modal) return;

    const headers =
      modal.querySelectorAll(
        ".blender-col-header",
      );

    for (const header of headers) {
      const text =
        String(
          header.textContent || "",
        ).trim();

      if (text === "New File") {
        header.textContent =
          "New Project";
      }

      if (text === "Recent Files") {
        header.textContent =
          "Recent Projects";
      }
    }

    const empty =
      modal.querySelector(
        ".ws-empty",
      );

    if (
      empty &&
      /recently opened files/i.test(
        empty.textContent || "",
      )
    ) {
      empty.textContent =
        "No recent projects";
    }

    const activeId =
      projectManager()
        ?.activeProjectId ||
      projectManager()
        ?.activeProject?.id ||
      null;

    modal
      .querySelectorAll(
        ".ws-project-item",
      )
      .forEach((row) => {
        const isActive =
          row.dataset.id ===
          activeId;

        row.classList.toggle(
          "sm-active-project",
          isActive,
        );

        if (
          isActive &&
          !row.querySelector(
            ".sm-active-project-badge",
          )
        ) {
          const badge =
            document.createElement(
              "span",
            );

          badge.className =
            "sm-active-project-badge";

          badge.textContent =
            "Active";

          const actions =
            row.querySelector(
              ".ws-proj-actions",
            );

          if (actions) {
            row.insertBefore(
              badge,
              actions,
            );
          } else {
            row.appendChild(
              badge,
            );
          }
        }
      });
  }

  function ensureStyles() {
    if (
      document.getElementById(
        "sm-workspace-project-bridge-style",
      )
    ) {
      return;
    }

    const style =
      document.createElement(
        "style",
      );

    style.id =
      "sm-workspace-project-bridge-style";

    style.textContent = `
      .ws-project-item.sm-active-project{
        background:rgba(71,114,179,.16);
      }
      .ws-project-item.sm-active-project .ws-proj-name{
        color:#fff;
      }
      .sm-active-project-badge{
        flex:0 0 auto;
        padding:1px 5px;
        font-size:9px;
        line-height:16px;
        color:#b9cce8;
        background:rgba(71,114,179,.18);
        border:1px solid rgba(120,156,210,.22);
        margin-right:4px;
      }
      .ws-project-item{
        cursor:default;
      }
      .ws-project-item .ws-proj-name{
        cursor:pointer;
      }
    `;

    document.head.appendChild(
      style,
    );
  }

  function installOnClass() {
    const WorkspaceManager =
      window.SMWorkspaceManager;

    if (
      !WorkspaceManager ||
      WorkspaceManager.prototype[
        BRIDGE_FLAG
      ]
    ) {
      return false;
    }

    const proto =
      WorkspaceManager.prototype;

    Object.defineProperty(
      proto,
      BRIDGE_FLAG,
      {
        value: true,
        configurable: false,
        enumerable: false,
      },
    );

    /*
     * Stop the legacy project list from being authoritative.
     * The real source of truth is SMProjectStorage / IndexedDB.
     */
    proto.loadProjects =
      function loadProjectsFromBackendCompatibility() {
        return [];
      };

    proto.saveProjects =
      function saveProjectsCompatibilityNoop() {
        return true;
      };

    proto._refreshSMProjectIndex =
      async function _refreshSMProjectIndex({
        rerender = true,
      } = {}) {
        try {
          const manager =
            await waitForProjectSystem();

          const projects =
            await manager.listProjects();

          this.projects =
            projects.map(
              asWorkspaceProject,
            );

          this.activeProject =
            asWorkspaceProject(
              manager.activeProject,
            );

          if (
            rerender &&
            this.modal
          ) {
            this._renderModal();
          }

          return this.projects;
        } catch (error) {
          console.warn(
            "[WorkspaceProjectBridge] Failed to refresh project index.",
            error,
          );

          this.projects =
            this.projects || [];

          return this.projects;
        }
      };

    const originalRenderModal =
      proto._renderModal;

    if (
      typeof originalRenderModal ===
      "function"
    ) {
      proto._renderModal =
        function _renderModalWithProjects(
          ...args
        ) {
          const result =
            originalRenderModal.apply(
              this,
              args,
            );

          patchModalLabels(this);

          return result;
        };
    }

    const originalShow =
      proto.show;

    if (
      typeof originalShow ===
      "function"
    ) {
      proto.show =
        function showProjectLauncher(
          ...args
        ) {
          /*
           * Show immediately, then replace the compatibility list with the
           * IndexedDB-backed recent projects as soon as it is available.
           */
          const result =
            originalShow.apply(
              this,
              args,
            );

          this._refreshSMProjectIndex({
            rerender: true,
          })
            .then(() => {
              this.modal?.classList.add(
                "active",
              );
            })
            .catch(() => {});

          return result;
        };
    }

    proto._createProject =
      async function _createProjectFromLauncher() {
        const nameEl =
          this.modal?.querySelector(
            "#ws-new-name",
          );

        const modeEl =
          this.modal?.querySelector(
            "#ws-new-mode",
          );

        const name =
          String(
            nameEl?.value || "",
          ).trim();

        if (!name) {
          nameEl?.focus?.();
          return null;
        }

        const manager =
          await waitForProjectSystem();

        /*
         * Avoid silently abandoning a dirty active project.
         */
        if (
          manager.activeProject &&
          manager.isDirty?.()
        ) {
          this._toast?.(
            "Save or close the current project before creating a new project.",
          );

          return null;
        }

        const mode =
          normalizeMode(
            modeEl?.value ||
              this.currentMode ||
              "FILM",
          );

        const gameMode =
          this._normalizeGameMode?.(
            this.modal?.querySelector(
              "#ws-new-game-mode",
            )?.value ||
              this.currentGameMode ||
              "3D",
          ) || "3D";

        try {
          const project =
            await manager.createProject({
              name,
              workspace: mode,
              metadata: {
                gameMode,
              },
              activate: true,
            });

          if (
            mode === "GAME_DEV"
          ) {
            this.setGameMode?.(
              gameMode,
              {
                applyViewport:
                  false,
                showToast:
                  false,
              },
            );
          }

          this.setMode?.(mode);

          /*
           * Establish a real initial manual save immediately. This creates
           * Maps/Main.smscene, Config/workspace.json, project-state, etc.
           */
          await manager.saveAll();

          this.activeProject =
            asWorkspaceProject(
              manager.activeProject ||
                project,
            );

          await this._refreshSMProjectIndex({
            rerender: true,
          });

          this._syncGameViewportUi?.();

          this._toast?.(
            `Project "${project.name}" created`,
          );

          window.AssetsPanel
            ?.openSMProjectBrowser?.(
              project.id,
              "",
            );

          this.close?.();

          return project;
        } catch (error) {
          console.error(
            "[WorkspaceProjectBridge] Create project failed.",
            error,
          );

          this._toast?.(
            `Could not create project: ${
              error?.message ||
              error
            }`,
          );

          return null;
        }
      };

    proto._loadProject =
      async function _loadProjectFromBackend(
        id,
      ) {
        if (!id) return null;

        const manager =
          await waitForProjectSystem();

        try {
          if (
            manager.activeProject &&
            manager.activeProject.id !==
              id &&
            manager.isDirty?.()
          ) {
            const shouldSave =
              window.confirm(
                `Project "${manager.activeProject.name}" has unsaved changes.\n\nSave before opening another project?`,
              );

            if (shouldSave) {
              await manager.saveProject();
            } else {
              const discard =
                window.confirm(
                  "Discard the unsaved changes and open the selected project?",
                );

              if (!discard) {
                return null;
              }
            }
          }

          const opened =
            await manager.openProject(
              id,
              {
                discardCurrent:
                  true,
              },
            );

          const project =
            opened?.project ||
            manager.activeProject;

          this.activeProject =
            asWorkspaceProject(
              project,
            );

          await this._refreshSMProjectIndex({
            rerender: true,
          });

          this._syncGameViewportUi?.();

          this._toast?.(
            `Loaded: ${
              project?.name ||
              "Project"
            }`,
          );

          window.AssetsPanel
            ?.openSMProjectBrowser?.(
              id,
              "",
            );

          this.close?.();

          return opened;
        } catch (error) {
          console.error(
            "[WorkspaceProjectBridge] Open project failed.",
            error,
          );

          this._toast?.(
            `Could not open project: ${
              error?.message ||
              error
            }`,
          );

          return null;
        }
      };

    proto._deleteProject =
      async function _deleteProjectFromBackend(
        id,
      ) {
        if (!id) return false;

        const manager =
          await waitForProjectSystem();

        const project =
          await projectStorage()
            ?.getProject?.(id);

        const label =
          project?.name ||
          "this project";

        if (
          !window.confirm(
            `Delete "${label}" permanently from SM Engine project storage?`,
          )
        ) {
          return false;
        }

        try {
          await manager.deleteProject(
            id,
            {
              force: true,
            },
          );

          if (
            this.activeProject?.id ===
            id
          ) {
            this.activeProject =
              null;
          }

          await this._refreshSMProjectIndex({
            rerender: true,
          });

          this._syncGameViewportUi?.();

          this._toast?.(
            `Project "${label}" deleted`,
          );

          return true;
        } catch (error) {
          console.error(
            "[WorkspaceProjectBridge] Delete project failed.",
            error,
          );

          this._toast?.(
            `Could not delete project: ${
              error?.message ||
              error
            }`,
          );

          return false;
        }
      };

    ensureStyles();

    return true;
  }

  function installOnInstance() {
    const instance =
      window.workspaceManager;

    if (
      !instance ||
      instance.__smProjectWorkspaceInstanceBridgeV1
    ) {
      return;
    }

    instance.__smProjectWorkspaceInstanceBridgeV1 =
      true;

    /*
     * Constructor may have run before this bridge was loaded, so discard the
     * old localStorage compatibility list and hydrate from IndexedDB.
     */
    instance.projects = [];

    instance
      ._refreshSMProjectIndex?.({
        rerender:
          !!instance.modal,
      })
      .catch(() => {});

    /*
     * Double-click recent project row = Open Project.
     */
    instance.modal
      ?.addEventListener(
        "dblclick",
        (event) => {
          const row =
            event.target.closest(
              ".ws-project-item",
            );

          if (!row?.dataset?.id) {
            return;
          }

          event.preventDefault();

          instance._loadProject?.(
            row.dataset.id,
          );
        },
      );
  }

  function refreshEveryProjectSurface() {
    const instance =
      window.workspaceManager;

    instance
      ?._refreshSMProjectIndex?.({
        rerender:
          !!instance.modal,
      })
      .catch(() => {});
  }

  function install() {
    installOnClass();
    installOnInstance();
  }

  /*
   * Install immediately when script order is correct and retry on load for
   * projects where WorkspaceManager is constructed in window.load.
   */
  install();

  window.addEventListener(
    "load",
    () => {
      install();
      setTimeout(install, 50);
      setTimeout(install, 250);
    },
  );

  for (const eventName of [
    "sm:project-created",
    "sm:project-activated",
    "sm:project-opened",
    "sm:project-saved",
    "sm:project-save-complete",
    "sm:project-deleted",
    "sm:project-closed",
  ]) {
    window.addEventListener(
      eventName,
      refreshEveryProjectSurface,
    );
  }

  window.SMWorkspaceProjectBridge = {
    install,
    refresh:
      refreshEveryProjectSurface,
  };
})();