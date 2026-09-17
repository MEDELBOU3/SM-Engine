// engine/project/integration/SMAssetsProjectBridge.js
// Adds a real Projects browser to the existing AssetsPanel without replacing
// its existing Project Assets / Google Drive / imported-asset systems.
//
// Load AFTER:
//   panels/assetsPanel.js
//   engine/project/SMProjectManager.js
//
// UX:
// - "SM Projects" section appears in the AssetsPanel sidebar.
// - Single click a project: browse its virtual IndexedDB filesystem.
// - Double click / Open button: open and restore the whole project.
// - Active project can be saved directly from AssetsPanel.
// - Folders/files come from smProjectStorage.listFolder().

(() => {
  "use strict";

  const CATEGORY =
    "sm-projects";

  const BRIDGE_FLAG =
    "__smAssetsProjectBridgeV1";

  function projectManager() {
    return window.smProjectManager || null;
  }

  function storage() {
    return window.smProjectStorage || null;
  }

  function escapeHTML(value) {
    return String(value ?? "")
      .replace(
        /&/g,
        "&amp;",
      )
      .replace(
        /</g,
        "&lt;",
      )
      .replace(
        />/g,
        "&gt;",
      )
      .replace(
        /"/g,
        "&quot;",
      )
      .replace(
        /'/g,
        "&#039;",
      );
  }

  function formatDate(value) {
    if (!value) return "";

    const date = new Date(
      value,
    );

    if (
      Number.isNaN(
        date.getTime(),
      )
    ) {
      return "";
    }

    return date.toLocaleString(
      undefined,
      {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      },
    );
  }

  function iconForEntry(entry) {
    if (
      entry.kind === "folder"
    ) {
      return "fa-folder";
    }

    const name =
      String(
        entry.name || "",
      ).toLowerCase();

    if (
      name.endsWith(
        ".smscene",
      )
    ) {
      return "fa-cubes";
    }

    if (
      name.endsWith(
        ".smterrain",
      )
    ) {
      return "fa-mountain";
    }

    if (
      name.endsWith(
        ".smproject",
      )
    ) {
      return "fa-diagram-project";
    }

    if (
      name.endsWith(".js")
    ) {
      return "fa-code";
    }

    if (
      entry.kind ===
      "binary"
    ) {
      return "fa-database";
    }

    if (
      name.endsWith(".json")
    ) {
      return "fa-file-code";
    }

    return "fa-file";
  }

  function ensureStyles() {
    if (
      document.getElementById(
        "sm-assets-project-browser-style",
      )
    ) {
      return;
    }

    const style =
      document.createElement(
        "style",
      );

    style.id =
      "sm-assets-project-browser-style";

    style.textContent = `
      .sm-project-section{
        margin-bottom:6px;
      }
      .sm-project-section-header{
        height:25px;
        display:flex;
        align-items:center;
        gap:7px;
        padding:0 8px;
        color:#a9a9a9;
        font-size:10px;
        font-weight:600;
        letter-spacing:.35px;
        text-transform:uppercase;
        cursor:pointer;
        user-select:none;
      }
      .sm-project-section-header:hover{
        background:rgba(255,255,255,.035);
      }
      .sm-project-sidebar-row{
        min-height:25px;
        display:flex;
        align-items:center;
        gap:7px;
        padding:0 8px 0 19px;
        color:#bdbdbd;
        cursor:pointer;
        user-select:none;
      }
      .sm-project-sidebar-row:hover{
        background:rgba(255,255,255,.045);
      }
      .sm-project-sidebar-row.active{
        background:rgba(95,95,95,.38);
        color:#fff;
      }
      .sm-project-sidebar-row .sm-project-sidebar-icon{
        width:14px;
        text-align:center;
        color:#858585;
      }
      .sm-project-sidebar-row.active .sm-project-sidebar-icon{
        color:#c8c8c8;
      }
      .sm-project-sidebar-name{
        min-width:0;
        overflow:hidden;
        white-space:nowrap;
        text-overflow:ellipsis;
        flex:1;
      }
      .sm-project-sidebar-active{
        width:6px;
        height:6px;
        border-radius:50%;
        background:#9d9d9d;
        flex:0 0 auto;
      }
      .sm-project-browser-toolbar{
        grid-column:1/-1;
        min-height:34px;
        display:flex;
        align-items:center;
        gap:7px;
        padding:5px 7px;
        margin-bottom:4px;
        background:rgba(0,0,0,.12);
        border-bottom:1px solid rgba(255,255,255,.05);
      }
      .sm-project-browser-title{
        min-width:0;
        flex:1;
        display:flex;
        align-items:center;
        gap:8px;
        color:#ddd;
        font-size:12px;
      }
      .sm-project-browser-title strong{
        overflow:hidden;
        white-space:nowrap;
        text-overflow:ellipsis;
      }
      .sm-project-state{
        color:#999;
        font-size:10px;
      }
      .sm-project-state.modified{
        color:#c5ad73;
      }
      .sm-project-browser-btn{
        height:24px;
        border:0;
        background:#3b3b3b;
        color:#c9c9c9;
        padding:0 9px;
        font-size:10px;
        cursor:pointer;
      }
      .sm-project-browser-btn:hover{
        background:#484848;
        color:#fff;
      }
      .sm-project-browser-btn.primary{
        background:#4b4b4b;
        color:#fff;
      }
      .sm-project-card{
        position:relative;
      }
      .sm-project-card .asset-thumbnail{
        display:flex;
        align-items:center;
        justify-content:center;
      }
      .sm-project-card .asset-thumbnail > i{
        font-size:34px;
        color:#8d8d8d;
      }
      .sm-project-card.active-project{
        outline:1px solid rgba(180,180,180,.35);
        outline-offset:-1px;
      }
      .sm-project-card-badge{
        position:absolute;
        top:5px;
        right:5px;
        padding:2px 5px;
        background:rgba(40,40,40,.9);
        color:#cfcfcf;
        font-size:9px;
        pointer-events:none;
      }
      .sm-project-file-meta{
        font-size:9px;
        color:#7f7f7f;
        margin-top:2px;
        white-space:nowrap;
        overflow:hidden;
        text-overflow:ellipsis;
      }
      .sm-project-empty{
        grid-column:1/-1;
        padding:24px;
        color:#888;
        text-align:center;
      }
      .sm-project-empty button{
        margin-top:10px;
      }
      .sm-project-breadcrumb-root{
        font-weight:600;
      }
    `;

    document.head.appendChild(
      style,
    );
  }

  function install() {
    const AssetsPanel =
      window.AssetsPanel;

    if (
      !AssetsPanel ||
      AssetsPanel[
        BRIDGE_FLAG
      ]
    ) {
      return false;
    }

    AssetsPanel[
      BRIDGE_FLAG
    ] = true;

    AssetsPanel.smProjectList =
      [];

    AssetsPanel.smProjectBrowser = {
      projectId: null,
      path: "",
      renderToken: 0,
      loading: false,
    };

    AssetsPanel._refreshSMProjectList =
      async function _refreshSMProjectList({
        rerender = false,
      } = {}) {
        try {
          await projectManager()?.init?.();

          this.smProjectList =
            await projectManager()
              ?.listProjects?.() ||
            [];

          if (rerender) {
            this.render();
          }

          return this.smProjectList;
        } catch (error) {
          console.warn(
            "[SMAssetsProjectBridge] Could not load projects.",
            error,
          );

          this.smProjectList =
            [];

          return [];
        }
      };

    AssetsPanel.openSMProjectsRoot =
      function openSMProjectsRoot() {
        this.currentCategory =
          CATEGORY;

        this.smProjectBrowser.projectId =
          null;

        this.smProjectBrowser.path =
          "";

        this.selectedAssetId =
          null;

        this.selectedIds?.clear?.();

        this.render();
      };

    AssetsPanel.openSMProjectBrowser =
      function openSMProjectBrowser(
        projectId,
        path = "",
      ) {
        this.currentCategory =
          CATEGORY;

        this.smProjectBrowser.projectId =
          projectId || null;

        this.smProjectBrowser.path =
          String(path || "")
            .replace(/\\/g, "/")
            .replace(/^\/+|\/+$/g, "");

        this.selectedAssetId =
          null;

        this.selectedIds?.clear?.();

        this.render();

        return true;
      };

    AssetsPanel._smProjectParentPath =
      function _smProjectParentPath(
        path,
      ) {
        const normalized =
          String(path || "")
            .replace(/\\/g, "/")
            .replace(/^\/+|\/+$/g, "");

        if (!normalized) {
          return "";
        }

        const parts =
          normalized.split("/");

        parts.pop();

        return parts.join("/");
      };

    AssetsPanel._smProjectShowEntryProperties =
      async function _smProjectShowEntryProperties(
        project,
        entry,
      ) {
        const panel =
          this.dom.properties ||
          document.getElementById(
            "propertiesContent",
          );

        if (!panel) return;

        const kind =
          entry.kind === "folder"
            ? "Folder"
            : entry.kind ===
                "binary"
              ? "Binary"
              : "File";

        panel.innerHTML = `
          <div class="property-row">
            <div class="property-label">Project</div>
            <div class="property-value">${escapeHTML(project?.name || "")}</div>
          </div>
          <div class="property-row">
            <div class="property-label">Name</div>
            <div class="property-value">${escapeHTML(entry.name || "")}</div>
          </div>
          <div class="property-row">
            <div class="property-label">Type</div>
            <div class="property-value">${escapeHTML(kind)}</div>
          </div>
          <div class="property-row">
            <div class="property-label">Path</div>
            <div class="property-value">${escapeHTML(entry.path || "")}</div>
          </div>
          <div class="property-row">
            <div class="property-label">Size</div>
            <div class="property-value">${Number(entry.size || 0).toLocaleString()} bytes</div>
          </div>
          <div class="property-row">
            <div class="property-label">Modified</div>
            <div class="property-value">${escapeHTML(formatDate(entry.modifiedAt))}</div>
          </div>
        `;
      };

    AssetsPanel._smProjectShowProjectProperties =
      function _smProjectShowProjectProperties(
        project,
      ) {
        const panel =
          this.dom.properties ||
          document.getElementById(
            "propertiesContent",
          );

        if (!panel) return;

        const active =
          projectManager()
            ?.activeProjectId ===
          project.id;

        panel.innerHTML = `
          <div class="property-row">
            <div class="property-label">Project</div>
            <div class="property-value">${escapeHTML(project.name || "")}</div>
          </div>
          <div class="property-row">
            <div class="property-label">Workspace</div>
            <div class="property-value">${escapeHTML(project.workspace || "FILM")}</div>
          </div>
          <div class="property-row">
            <div class="property-label">Status</div>
            <div class="property-value">${active ? "Active" : "Closed"}</div>
          </div>
          <div class="property-row">
            <div class="property-label">Startup Scene</div>
            <div class="property-value">${escapeHTML(project.startupScene || "Maps/Main.smscene")}</div>
          </div>
          <div class="property-row">
            <div class="property-label">Modified</div>
            <div class="property-value">${escapeHTML(formatDate(project.modifiedAt))}</div>
          </div>
        `;
      };

    AssetsPanel.openSMProject =
      async function openSMProject(
        projectId,
      ) {
        const manager =
          projectManager();

        if (!manager) {
          throw new Error(
            "SMProjectManager is unavailable.",
          );
        }

        try {
          if (
            manager.activeProject &&
            manager.activeProject.id !==
              projectId &&
            manager.isDirty?.()
          ) {
            const save =
              window.confirm(
                `Project "${manager.activeProject.name}" has unsaved changes.\n\nSave before opening another project?`,
              );

            if (save) {
              await manager.saveProject();
            } else {
              const discard =
                window.confirm(
                  "Discard unsaved changes and continue?",
                );

              if (!discard) {
                return null;
              }
            }
          }

          const result =
            await manager.openProject(
              projectId,
              {
                discardCurrent:
                  true,
              },
            );

          await this._refreshSMProjectList();

          this.openSMProjectBrowser(
            projectId,
            "",
          );

          window.showToast?.(
            `Opened project "${
              result?.project
                ?.name ||
              manager.activeProject
                ?.name ||
              ""
            }"`,
          );

          return result;
        } catch (error) {
          console.error(
            "[SMAssetsProjectBridge] Open project failed.",
            error,
          );

          window.showToast?.(
            `Could not open project: ${
              error?.message ||
              error
            }`,
          );

          return null;
        }
      };

    AssetsPanel.saveActiveSMProject =
      async function saveActiveSMProject() {
        const manager =
          projectManager();

        if (
          !manager?.activeProject
        ) {
          window.showToast?.(
            "No active project",
          );

          return null;
        }

        try {
          const result =
            await manager.saveProject();

          await this._refreshSMProjectList();

          this.render();

          window.showToast?.(
            `Saved "${
              manager.activeProject
                .name
            }"`,
          );

          return result;
        } catch (error) {
          console.error(
            "[SMAssetsProjectBridge] Save project failed.",
            error,
          );

          window.showToast?.(
            `Save failed: ${
              error?.message ||
              error
            }`,
          );

          return null;
        }
      };

    AssetsPanel._smProjectDelete =
      async function _smProjectDelete(
        project,
      ) {
        if (!project) return false;

        if (
          !window.confirm(
            `Delete "${project.name}" permanently?`,
          )
        ) {
          return false;
        }

        try {
          await projectManager()
            ?.deleteProject?.(
              project.id,
              {
                force: true,
              },
            );

          if (
            this.smProjectBrowser
              .projectId ===
            project.id
          ) {
            this.smProjectBrowser.projectId =
              null;

            this.smProjectBrowser.path =
              "";
          }

          await this._refreshSMProjectList();

          this.render();

          return true;
        } catch (error) {
          console.error(
            "[SMAssetsProjectBridge] Delete project failed.",
            error,
          );

          return false;
        }
      };

    AssetsPanel._smProjectRenderToolbar =
      function _smProjectRenderToolbar(
        project,
      ) {
        const toolbar =
          document.createElement(
            "div",
          );

        toolbar.className =
          "sm-project-browser-toolbar";

        const activeProject =
          projectManager()
            ?.activeProject;

        const isActive =
          !!project &&
          activeProject?.id ===
            project.id;

        const isDirty =
          isActive &&
          projectManager()
            ?.isDirty?.();

        toolbar.innerHTML = `
          <div class="sm-project-browser-title">
            <i class="fas ${project ? "fa-diagram-project" : "fa-folder-tree"}"></i>
            <strong>${escapeHTML(project?.name || "SM Projects")}</strong>
            ${
              project
                ? `<span class="sm-project-state ${isDirty ? "modified" : ""}">
                    ${isDirty ? "● Modified" : isActive ? "✓ Active / Saved" : "Closed"}
                   </span>`
                : ""
            }
          </div>
          ${
            project
              ? `
                <button class="sm-project-browser-btn sm-project-open-btn">
                  <i class="fas fa-folder-open"></i> Open
                </button>
                ${
                  isActive
                    ? `
                      <button class="sm-project-browser-btn primary sm-project-save-btn">
                        <i class="fas fa-save"></i> Save
                      </button>
                    `
                    : ""
                }
              `
              : `
                <button class="sm-project-browser-btn primary sm-project-new-btn">
                  <i class="fas fa-plus"></i> New Project
                </button>
              `
          }
        `;

        toolbar
          .querySelector(
            ".sm-project-open-btn",
          )
          ?.addEventListener(
            "click",
            () =>
              this.openSMProject(
                project.id,
              ),
          );

        toolbar
          .querySelector(
            ".sm-project-save-btn",
          )
          ?.addEventListener(
            "click",
            () =>
              this.saveActiveSMProject(),
          );

        toolbar
          .querySelector(
            ".sm-project-new-btn",
          )
          ?.addEventListener(
            "click",
            () =>
              window.workspaceManager
                ?.show?.(),
          );

        this.dom.grid.appendChild(
          toolbar,
        );
      };

    AssetsPanel._renderSMProjectRoot =
      function _renderSMProjectRoot(
        searchQuery = "",
      ) {
        const query =
          String(
            searchQuery || "",
          ).trim().toLowerCase();

        this._smProjectRenderToolbar(
          null,
        );

        const projects =
          this.smProjectList.filter(
            (project) =>
              !query ||
              String(
                project.name || "",
              )
                .toLowerCase()
                .includes(query),
          );

        if (
          projects.length === 0
        ) {
          const empty =
            document.createElement(
              "div",
            );

          empty.className =
            "sm-project-empty";

          empty.innerHTML = `
            <div>No projects yet.</div>
            <button class="sm-project-browser-btn primary">
              <i class="fas fa-plus"></i> Create Project
            </button>
          `;

          empty
            .querySelector("button")
            .onclick = () =>
              window.workspaceManager
                ?.show?.();

          this.dom.grid.appendChild(
            empty,
          );

          return;
        }

        for (
          const project of projects
        ) {
          const item =
            document.createElement(
              "div",
            );

          const active =
            projectManager()
              ?.activeProjectId ===
            project.id;

          item.className =
            `asset-item sm-project-card ${
              active
                ? "active-project"
                : ""
            }`;

          item.dataset.projectId =
            project.id;

          item.innerHTML = `
            ${
              active
                ? `<div class="sm-project-card-badge">ACTIVE</div>`
                : ""
            }
            <div class="asset-thumbnail">
              <i class="fas fa-diagram-project"></i>
            </div>
            <div class="asset-info">
              <div class="asset-name">${escapeHTML(project.name)}</div>
              <div class="asset-type">${escapeHTML(project.workspace || "FILM")}</div>
              <div class="sm-project-file-meta">${escapeHTML(formatDate(project.modifiedAt))}</div>
            </div>
          `;

          item.onclick = () => {
            this.smProjectBrowser.projectId =
              project.id;

            this.smProjectBrowser.path =
              "";

            this._smProjectShowProjectProperties(
              project,
            );

            this.render();
          };

          item.ondblclick = (
            event,
          ) => {
            event.preventDefault();

            this.openSMProject(
              project.id,
            );
          };

          item.oncontextmenu = (
            event,
          ) => {
            event.preventDefault();

            const shouldDelete =
              window.confirm(
                `Open "${project.name}"?\n\nOK = Open\nCancel = keep browsing`,
              );

            if (shouldDelete) {
              this.openSMProject(
                project.id,
              );
            }
          };

          this.dom.grid.appendChild(
            item,
          );
        }
      };

    AssetsPanel._renderSMProjectEntries =
      async function _renderSMProjectEntries(
        project,
        searchQuery = "",
        token,
      ) {
        const projectId =
          project.id;

        const path =
          this.smProjectBrowser
            .path || "";

        this._smProjectRenderToolbar(
          project,
        );

        const loading =
          document.createElement(
            "div",
          );

        loading.className =
          "sm-project-empty";

        loading.textContent =
          "Loading project content…";

        this.dom.grid.appendChild(
          loading,
        );

        let entries = [];

        try {
          entries =
            await storage()
              .listFolder(
                projectId,
                path,
              );
        } catch (error) {
          if (
            token !==
            this.smProjectBrowser
              .renderToken
          ) {
            return;
          }

          loading.textContent =
            `Could not read project: ${
              error?.message ||
              error
            }`;

          return;
        }

        if (
          token !==
          this.smProjectBrowser
            .renderToken
        ) {
          return;
        }

        loading.remove();

        const query =
          String(
            searchQuery || "",
          ).trim().toLowerCase();

        entries =
          entries.filter(
            (entry) =>
              !query ||
              String(
                entry.name || "",
              )
                .toLowerCase()
                .includes(query),
          );

        if (
          path &&
          !query
        ) {
          const up =
            document.createElement(
              "div",
            );

          up.className =
            "asset-item folder-item";

          up.innerHTML = `
            <div class="asset-thumbnail">
              <i class="fas fa-level-up-alt folder-icon-large"></i>
            </div>
            <div class="asset-info">
              <div class="asset-name">..</div>
              <div class="asset-type">Parent Folder</div>
            </div>
          `;

          up.ondblclick =
            () => {
              this.openSMProjectBrowser(
                projectId,
                this._smProjectParentPath(
                  path,
                ),
              );
            };

          this.dom.grid.appendChild(
            up,
          );
        }

        if (
          entries.length === 0
        ) {
          const empty =
            document.createElement(
              "div",
            );

          empty.className =
            "sm-project-empty";

          empty.textContent =
            query
              ? "No project files match the search."
              : "This project folder is empty.";

          this.dom.grid.appendChild(
            empty,
          );

          return;
        }

        for (
          const entry of entries
        ) {
          const item =
            document.createElement(
              "div",
            );

          item.className =
            `asset-item ${
              entry.kind ===
              "folder"
                ? "folder-item"
                : "sm-project-file-item"
            }`;

          item.dataset.path =
            entry.path;

          item.dataset.type =
            entry.kind;

          item.innerHTML = `
            <div class="asset-thumbnail">
              <i class="fas ${iconForEntry(entry)} ${entry.kind === "folder" ? "folder-icon-large" : ""}"></i>
            </div>
            <div class="asset-info">
              <div class="asset-name">${escapeHTML(entry.name)}</div>
              <div class="asset-type">${escapeHTML(entry.kind === "binary" ? "Binary Data" : entry.kind)}</div>
              ${
                entry.kind !==
                "folder"
                  ? `<div class="sm-project-file-meta">${Number(entry.size || 0).toLocaleString()} bytes</div>`
                  : ""
              }
            </div>
          `;

          item.onclick = () => {
            this._smProjectShowEntryProperties(
              project,
              entry,
            );
          };

          if (
            entry.kind ===
            "folder"
          ) {
            item.ondblclick =
              () => {
                this.openSMProjectBrowser(
                  projectId,
                  entry.path,
                );
              };
          } else {
            item.ondblclick =
              async () => {
                /*
                 * Project files belong to a coherent save. Opening a saved
                 * .smscene/.smterrain from a closed project should open the
                 * whole project rather than partially mixing two projects.
                 */
                if (
                  projectManager()
                    ?.activeProjectId !==
                  projectId
                ) {
                  await this.openSMProject(
                    projectId,
                  );

                  return;
                }

                const lower =
                  String(
                    entry.name || "",
                  ).toLowerCase();

                if (
                  lower.endsWith(
                    ".smscene",
                  )
                ) {
                  await window
                    .smSceneSerializer
                    ?.load?.(
                      projectId,
                      {
                        path:
                          entry.path,
                      },
                    );

                  return;
                }

                if (
                  lower.endsWith(
                    ".smterrain",
                  )
                ) {
                  await window
                    .smTerrainSerializer
                    ?.load?.(
                      projectId,
                      {
                        metadataPath:
                          entry.path,
                      },
                    );

                  return;
                }

                this._smProjectShowEntryProperties(
                  project,
                  entry,
                );
              };
          }

          this.dom.grid.appendChild(
            item,
          );
        }
      };

    AssetsPanel._renderSMProjectBreadcrumbs =
      function _renderSMProjectBreadcrumbs() {
        const container =
          this.dom.assetsBreadcrumbs ||
          document.getElementById(
            "assetsBreadcrumbs",
          );

        if (!container) {
          return;
        }

        container.innerHTML =
          "";

        const addSegment = (
          label,
          action,
          active = false,
        ) => {
          const item =
            document.createElement(
              "span",
            );

          item.className =
            `breadcrumb-item ${
              active
                ? "active"
                : ""
            }`;

          item.textContent =
            label;

          item.onclick =
            action;

          container.appendChild(
            item,
          );
        };

        const addSeparator =
          () => {
            const separator =
              document.createElement(
                "span",
              );

            separator.className =
              "breadcrumb-separator";

            separator.innerHTML =
              this._svgIcon?.(
                "breadcrumbs",
              ) ||
              "›";

            container.appendChild(
              separator,
            );
          };

        addSegment(
          "Projects",
          () =>
            this.openSMProjectsRoot(),
          !this.smProjectBrowser
            .projectId,
        );

        const project =
          this.smProjectList.find(
            (item) =>
              item.id ===
              this.smProjectBrowser
                .projectId,
          );

        if (!project) {
          return;
        }

        addSeparator();

        addSegment(
          project.name,
          () =>
            this.openSMProjectBrowser(
              project.id,
              "",
            ),
          !this.smProjectBrowser.path,
        );

        const parts =
          String(
            this.smProjectBrowser
              .path || "",
          )
            .split("/")
            .filter(Boolean);

        let accumulated = "";

        parts.forEach(
          (part, index) => {
            accumulated =
              accumulated
                ? `${accumulated}/${part}`
                : part;

            const targetPath =
              accumulated;

            addSeparator();

            addSegment(
              part,
              () =>
                this.openSMProjectBrowser(
                  project.id,
                  targetPath,
                ),
              index ===
                parts.length - 1,
            );
          },
        );
      };

    AssetsPanel._renderSMProjects =
      function _renderSMProjects(
        searchQuery = "",
      ) {
        if (!this.dom.grid) {
          return;
        }

        const token =
          ++this.smProjectBrowser
            .renderToken;

        this._renderSMProjectBreadcrumbs();

        this._renderFolderSidebar();

        this.dom.grid.innerHTML =
          "";

        const project =
          this.smProjectList.find(
            (item) =>
              item.id ===
              this.smProjectBrowser
                .projectId,
          );

        if (!project) {
          this._renderSMProjectRoot(
            searchQuery,
          );

          return;
        }

        this._renderSMProjectEntries(
          project,
          searchQuery,
          token,
        );
      };

    AssetsPanel._renderSMProjectSidebar =
      function _renderSMProjectSidebar(
        container,
      ) {
        if (!container) return;

        const section =
          document.createElement(
            "div",
          );

        section.className =
          "sm-project-section";

        const header =
          document.createElement(
            "div",
          );

        header.className =
          "sm-project-section-header";

        header.innerHTML = `
          <i class="fas fa-caret-down"></i>
          <i class="fas fa-diagram-project"></i>
          <span>SM Projects</span>
        `;

        header.onclick = () =>
          this.openSMProjectsRoot();

        section.appendChild(
          header,
        );

        const projects =
          this.smProjectList || [];

        if (
          projects.length === 0
        ) {
          const empty =
            document.createElement(
              "div",
            );

          empty.className =
            "sm-project-sidebar-row";

          empty.innerHTML = `
            <span class="sm-project-sidebar-icon"><i class="fas fa-plus"></i></span>
            <span class="sm-project-sidebar-name">Create Project…</span>
          `;

          empty.onclick = () =>
            window.workspaceManager
              ?.show?.();

          section.appendChild(
            empty,
          );
        } else {
          for (
            const project of projects
          ) {
            const active =
              projectManager()
                ?.activeProjectId ===
              project.id;

            const selected =
              this.currentCategory ===
                CATEGORY &&
              this.smProjectBrowser
                .projectId ===
                project.id;

            const row =
              document.createElement(
                "div",
              );

            row.className =
              `sm-project-sidebar-row ${
                selected
                  ? "active"
                  : ""
              }`;

            row.title =
              `${project.name}\n${project.workspace || "FILM"}\n${formatDate(project.modifiedAt)}`;

            row.innerHTML = `
              <span class="sm-project-sidebar-icon">
                <i class="fas fa-folder"></i>
              </span>
              <span class="sm-project-sidebar-name">${escapeHTML(project.name)}</span>
              ${
                active
                  ? `<span class="sm-project-sidebar-active" title="Active Project"></span>`
                  : ""
              }
            `;

            row.onclick = () => {
              this.openSMProjectBrowser(
                project.id,
                "",
              );
            };

            row.ondblclick = (
              event,
            ) => {
              event.preventDefault();
              event.stopPropagation();

              this.openSMProject(
                project.id,
              );
            };

            row.oncontextmenu = (
              event,
            ) => {
              event.preventDefault();
              event.stopPropagation();

              this._smProjectShowProjectProperties(
                project,
              );
            };

            section.appendChild(
              row,
            );
          }
        }

        container.prepend(
          section,
        );
      };

    const originalFolderSidebar =
      AssetsPanel._renderFolderSidebar;

    if (
      typeof originalFolderSidebar ===
      "function"
    ) {
      AssetsPanel._renderFolderSidebar =
        function _renderFolderSidebarWithProjects(
          ...args
        ) {
          const result =
            originalFolderSidebar.apply(
              this,
              args,
            );

          const container =
            document.getElementById(
              "assetsCategoriesPanel",
            ) ||
            this.dom
              .categoriesContainer;

          this._renderSMProjectSidebar(
            container,
          );

          return result;
        };
    }

    const originalRender =
      AssetsPanel.render;

    AssetsPanel.render =
      function renderWithSMProjects(
        searchQuery = "",
      ) {
        if (
          this.currentCategory ===
          CATEGORY
        ) {
          this._renderSMProjects(
            searchQuery,
          );

          return;
        }

        return originalRender.call(
          this,
          searchQuery,
        );
      };

    const originalSelectCategory =
      AssetsPanel.selectCategory;

    if (
      typeof originalSelectCategory ===
      "function"
    ) {
      AssetsPanel.selectCategory =
        function selectCategoryWithSMProjects(
          category,
          element,
        ) {
          if (
            category === CATEGORY
          ) {
            this.openSMProjectsRoot();
            return;
          }

          return originalSelectCategory.call(
            this,
            category,
            element,
          );
        };
    }

    ensureStyles();

    AssetsPanel
      ._refreshSMProjectList({
        rerender: false,
      })
      .then(() => {
        AssetsPanel.render();
      })
      .catch(() => {});

    return true;
  }

  function refresh({
    focusActive = false,
  } = {}) {
    const AssetsPanel =
      window.AssetsPanel;

    if (
      !AssetsPanel?.[
        BRIDGE_FLAG
      ]
    ) {
      install();
    }

    if (
      !window.AssetsPanel?.[
        BRIDGE_FLAG
      ]
    ) {
      return;
    }

    window.AssetsPanel
      ._refreshSMProjectList({
        rerender: false,
      })
      .then(() => {
        const panel =
          window.AssetsPanel;

        if (focusActive) {
          const id =
            projectManager()
              ?.activeProjectId;

          if (id) {
            panel.currentCategory =
              CATEGORY;

            panel.smProjectBrowser.projectId =
              id;

            panel.smProjectBrowser.path =
              "";
          }
        }

        panel.render();
      })
      .catch(() => {});
  }

  install();

  window.addEventListener(
    "load",
    () => {
      install();
      setTimeout(install, 50);
      setTimeout(install, 300);
    },
  );

  window.addEventListener(
    "sm-assets-panel-ui-ready",
    () => {
      install();
      refresh();
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
      () =>
        refresh({
          focusActive:
            eventName ===
              "sm:project-created" ||
            eventName ===
              "sm:project-opened",
        }),
    );
  }

  window.addEventListener(
    "sm:project-dirty",
    () => {
      if (
        window.AssetsPanel
          ?.currentCategory ===
        CATEGORY
      ) {
        window.AssetsPanel
          .render();
      }
    },
  );

  window.SMAssetsProjectBridge = {
    CATEGORY,
    install,
    refresh,
  };
})();