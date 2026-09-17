// engine/project/integration/SMProjectFilesystemImport.js
// Renderer-side physical project import + external change coordinator.
//
// V1 behavior:
// - Watches Launcher-linked Windows project folders.
// - Imports external file changes into canonical SMProjectStorage.
// - Compares disk vs IndexedDB first, so Engine's own save->sync writes do not
//   cause reload loops.
// - Never overwrites unsaved live editor work automatically.
// - If the editor is dirty, records a conflict instead.
// - Scene/config changes trigger a safe project reload only when editor is clean.
//
// Load AFTER:
//   SMProjectManager.js
//   SMLauncherProjectBridge.js
//   SMProjectFilesystemSync.js

(() => {
  "use strict";

  const INSTALL_FLAG =
    "__smProjectFilesystemImportV1";

  const IGNORED_PREFIXES =
    [
      "Saved/Logs/",
      "Saved/Autosaves/",
      "Intermediate/",
      "node_modules/",
    ];

  function manager() {
    return (
      window.smProjectManager ||
      null
    );
  }

  function storage() {
    return (
      window.smProjectStorage ||
      null
    );
  }

  function watcherAPI() {
    return (
      window.electronAPI
        ?.projectFilesystemWatcher ||
      null
    );
  }

  function normalizePath(value) {
    return String(value || "")
      .replace(/\\/g, "/")
      .replace(/\/+/g, "/")
      .replace(/^\/+|\/+$/g, "");
  }

  function getRoot(project) {
    return (
      project?.metadata
        ?.launcher
        ?.rootPath ||
      window.SMProject
        ?.launcher
        ?.rootPath ||
      null
    );
  }

  function isIgnored(path) {
    const value =
      normalizePath(path);

    if (
      !value ||
      value === ".smengine"
    ) {
      return true;
    }

    return IGNORED_PREFIXES
      .some(
        (prefix) =>
          value.startsWith(
            prefix,
          ),
      );
  }

  function mimeFromPath(path) {
    const value =
      normalizePath(path)
        .toLowerCase();

    if (
      value.endsWith(
        ".json",
      ) ||
      value.endsWith(
        ".smscene",
      ) ||
      value.endsWith(
        ".smproject",
      )
    ) {
      return "application/json";
    }

    if (
      value.endsWith(".js") ||
      value.endsWith(".mjs") ||
      value.endsWith(".cjs")
    ) {
      return "text/javascript";
    }

    if (
      value.endsWith(".css")
    ) {
      return "text/css";
    }

    if (
      value.endsWith(".html") ||
      value.endsWith(".htm")
    ) {
      return "text/html";
    }

    return "text/plain";
  }

  async function arrayBuffersEqual(
    left,
    right,
  ) {
    if (
      !left ||
      !right
    ) {
      return false;
    }

    if (
      left.byteLength !==
      right.byteLength
    ) {
      return false;
    }

    const a =
      new Uint8Array(left);

    const b =
      new Uint8Array(right);

    for (
      let i = 0;
      i < a.length;
      i += 1
    ) {
      if (
        a[i] !== b[i]
      ) {
        return false;
      }
    }

    return true;
  }

  class SMProjectFilesystemImport {
    constructor() {
      this.rootPath =
        null;

      this.watching =
        false;

      this.conflicts =
        new Map();

      this.lastImport =
        null;

      this.lastError =
        null;

      this._unsubscribeChange =
        null;

      this._unsubscribeError =
        null;

      this._reloadTimer =
        0;

      this._importQueue =
        Promise.resolve();
    }

    isAvailable() {
      const api =
        watcherAPI();

      return !!(
        api?.start &&
        api?.stop &&
        api?.readFile &&
        api?.stat &&
        api?.onExternalChange
      );
    }

    listConflicts() {
      return Array.from(
        this.conflicts
          .values(),
      );
    }

    clearConflicts() {
      this.conflicts
        .clear();

      window.dispatchEvent(
        new CustomEvent(
          "sm:project-external-conflicts-changed",
          {
            detail: {
              conflicts: [],
            },
          },
        ),
      );
    }

    ignoreConflict(path) {
      const normalized =
        normalizePath(path);

      const removed =
        this.conflicts
          .delete(
            normalized,
          );

      if (removed) {
        window.dispatchEvent(
          new CustomEvent(
            "sm:project-external-conflicts-changed",
            {
              detail: {
                conflicts:
                  this.listConflicts(),
              },
            },
          ),
        );
      }

      return removed;
    }

    _recordConflict(
      change,
      reason =
        "editor-dirty",
    ) {
      const path =
        normalizePath(
          change
            .relativePath,
        );

      const conflict = {
        ...change,
        relativePath:
          path,
        reason,
        detectedAt:
          new Date()
            .toISOString(),
      };

      this.conflicts
        .set(
          path,
          conflict,
        );

      window.dispatchEvent(
        new CustomEvent(
          "sm:project-external-conflict",
          {
            detail:
              conflict,
          },
        ),
      );

      window.dispatchEvent(
        new CustomEvent(
          "sm:project-external-conflicts-changed",
          {
            detail: {
              conflicts:
                this.listConflicts(),
            },
          },
        ),
      );

      console.warn(
        "[SMProjectFilesystemImport] External change held because editor has unsaved work:",
        conflict,
      );

      return conflict;
    }

    async startForActiveProject() {
      const project =
        manager()
          ?.activeProject;

      if (!project) {
        return {
          watching: false,
          reason:
            "no-active-project",
        };
      }

      return this
        .startForProject(
          project,
        );
    }

    async startForProject(
      project,
    ) {
      if (!this.isAvailable()) {
        return {
          watching: false,
          reason:
            "watcher-api-unavailable",
        };
      }

      const rootPath =
        getRoot(
          project,
        );

      if (!rootPath) {
        return {
          watching: false,
          reason:
            "not-launcher-linked",
        };
      }

      if (
        this.watching &&
        this.rootPath ===
          rootPath
      ) {
        return {
          watching: true,
          rootPath,
        };
      }

      await this.stop();

      this.rootPath =
        rootPath;

      this._unsubscribeChange =
        watcherAPI()
          .onExternalChange(
            (change) => {
              if (
                !change ||
                change.rootPath !==
                  this.rootPath
              ) {
                return;
              }

              this._enqueueChange(
                change,
              );
            },
          );

      this._unsubscribeError =
        watcherAPI()
          .onWatchError?.(
            (detail) => {
              if (
                detail?.rootPath !==
                this.rootPath
              ) {
                return;
              }

              this.lastError =
                detail;

              console.error(
                "[SMProjectFilesystemImport] Watcher error:",
                detail,
              );
            },
          ) ||
        null;

      const result =
        await watcherAPI()
          .start({
            rootPath,
          });

      this.watching =
        result?.watching ===
        true;

      console.info(
        "[SMProjectFilesystemImport] Watching physical project:",
        rootPath,
      );

      return result;
    }

    async stop() {
      if (
        this.rootPath &&
        watcherAPI()
          ?.stop
      ) {
        try {
          await watcherAPI()
            .stop({
              rootPath:
                this.rootPath,
            });
        } catch (_) {}
      }

      this._unsubscribeChange
        ?.();

      this._unsubscribeError
        ?.();

      this._unsubscribeChange =
        null;

      this._unsubscribeError =
        null;

      this.watching =
        false;

      this.rootPath =
        null;
    }

    _enqueueChange(
      change,
    ) {
      this._importQueue =
        this._importQueue
          .then(
            () =>
              this
                .handleExternalChange(
                  change,
                ),
          )
          .catch(
            (error) => {
              this.lastError =
                error;

              console.error(
                "[SMProjectFilesystemImport] External import failed.",
                error,
              );
            },
          );

      return this
        ._importQueue;
    }

    async handleExternalChange(
      change,
      {
        force = false,
      } = {},
    ) {
      const m = manager();
      const project =
        m?.activeProject;

      if (
        !project ||
        !change
      ) {
        return {
          imported: false,
          reason:
            "no-active-project",
        };
      }

      const rootPath =
        getRoot(
          project,
        );

      if (
        !rootPath ||
        rootPath !==
          change.rootPath
      ) {
        return {
          imported: false,
          reason:
            "project-root-mismatch",
        };
      }

      const relativePath =
        normalizePath(
          change.relativePath,
        );

      if (
        isIgnored(
          relativePath,
        )
      ) {
        return {
          imported: false,
          reason:
            "ignored",
          relativePath,
        };
      }

      /*
       * project.smproject is special metadata. Do not inject its complete disk
       * JSON into the virtual file entry automatically. The manifest merge
       * contract is owned by the sync layer.
       */
      if (
        relativePath
          .toLowerCase() ===
        "project.smproject"
      ) {
        window.dispatchEvent(
          new CustomEvent(
            "sm:project-external-manifest-changed",
            {
              detail:
                change,
            },
          ),
        );

        return {
          imported: false,
          reason:
            "manifest-change-not-auto-imported",
          relativePath,
        };
      }

      if (
        !force &&
        m.isDirty?.()
      ) {
        this._recordConflict(
          change,
        );

        return {
          imported: false,
          conflict: true,
          relativePath,
        };
      }

      const s = storage();

      if (!s) {
        throw new Error(
          "[SMProjectFilesystemImport] SMProjectStorage is unavailable.",
        );
      }

      /*
       * Deleted/renamed-away path.
       */
      if (
        change.exists ===
        false
      ) {
        const existing =
          await s.getEntry(
            project.id,
            relativePath,
          );

        if (!existing) {
          return {
            imported: false,
            reason:
              "already-missing",
            relativePath,
          };
        }

        await s.deleteEntry(
          project.id,
          relativePath,
          {
            recursive: true,
            touchProject:
              false,
          },
        );

        const result = {
          imported: true,
          action:
            "delete",
          relativePath,
        };

        this.lastImport =
          result;

        this
          ._afterImport(
            result,
          );

        return result;
      }

      /*
       * Directory created/renamed.
       */
      if (
        change.isDirectory
      ) {
        const existing =
          await s.getEntry(
            project.id,
            relativePath,
          );

        if (
          existing?.kind ===
          "folder"
        ) {
          return {
            imported: false,
            reason:
              "directory-already-exists",
            relativePath,
          };
        }

        await s.createFolder(
          project.id,
          relativePath,
          {
            touchProject:
              false,
          },
        );

        const result = {
          imported: true,
          action:
            "directory",
          relativePath,
        };

        this.lastImport =
          result;

        this
          ._afterImport(
            result,
          );

        return result;
      }

      const diskFile =
        await watcherAPI()
          .readFile({
            rootPath,
            relativePath,
          });

      if (
        !diskFile?.exists
      ) {
        return {
          imported: false,
          reason:
            "disk-file-missing",
          relativePath,
        };
      }

      if (
        diskFile.kind ===
        "text"
      ) {
        const current =
          await s.readText(
            project.id,
            relativePath,
          );

        /*
         * This equality check is what suppresses Engine save->sync->watcher
         * echo events.
         */
        if (
          current ===
          diskFile.content
        ) {
          return {
            imported: false,
            reason:
              "unchanged",
            relativePath,
          };
        }

        await s.writeFile(
          project.id,
          relativePath,
          diskFile.content,
          {
            mimeType:
              mimeFromPath(
                relativePath,
              ),

            touchProject:
              false,

            metadata: {
              externalImport: true,
              externalModifiedAt:
                diskFile.modifiedAt,
            },
          },
        );
      } else {
        const bytes =
          diskFile.bytes;

        const incoming =
          bytes?.buffer
            ? bytes.buffer.slice(
                bytes.byteOffset,
                bytes.byteOffset +
                  bytes.byteLength,
              )
            : new Uint8Array(
                bytes || [],
              ).buffer;

        const currentRecord =
          await s.readBlob(
            project.id,
            relativePath,
          );

        const current =
          currentRecord?.blob
            ? await currentRecord
                .blob
                .arrayBuffer()
            : null;

        if (
          await arrayBuffersEqual(
            current,
            incoming,
          )
        ) {
          return {
            imported: false,
            reason:
              "unchanged",
            relativePath,
          };
        }

        await s.writeBlob(
          project.id,
          relativePath,
          incoming,
          {
            mimeType:
              currentRecord
                ?.mimeType ||
              "application/octet-stream",

            touchProject:
              false,

            metadata: {
              externalImport: true,
              externalModifiedAt:
                diskFile.modifiedAt,
            },
          },
        );
      }

      this.conflicts
        .delete(
          relativePath,
        );

      const result = {
        imported: true,
        action:
          "update",
        kind:
          diskFile.kind,
        relativePath,
        modifiedAt:
          diskFile.modifiedAt,
      };

      this.lastImport =
        result;

      this
        ._afterImport(
          result,
        );

      return result;
    }

    async importConflict(
      path,
    ) {
      const relativePath =
        normalizePath(path);

      const conflict =
        this.conflicts
          .get(
            relativePath,
          );

      if (!conflict) {
        return {
          imported: false,
          reason:
            "conflict-not-found",
          relativePath,
        };
      }

      const result =
        await this
          .handleExternalChange(
            conflict,
            {
              force: true,
            },
          );

      if (
        result?.imported
      ) {
        this.conflicts
          .delete(
            relativePath,
          );
      }

      return result;
    }

    _afterImport(
      result,
    ) {
      window.dispatchEvent(
        new CustomEvent(
          "sm:project-file-imported",
          {
            detail:
              result,
          },
        ),
      );

      const path =
        normalizePath(
          result.relativePath,
        );

      /*
       * External scene/workspace/config changes can affect current live editor
       * state. Reload only when the editor is clean; dirty state was already
       * converted to a conflict earlier.
       */
      if (
        path.startsWith(
          "Maps/",
        ) ||
        path.startsWith(
          "Config/",
        )
      ) {
        this
          ._scheduleProjectReload();
      }

      window.AssetsPanel
        ?.refresh?.();

      window.AssetsPanel
        ?._refreshSMProjectBrowser?.();
    }

    _scheduleProjectReload() {
      clearTimeout(
        this._reloadTimer,
      );

      this._reloadTimer =
        setTimeout(
          async () => {
            const m =
              manager();

            const project =
              m?.activeProject;

            if (
              !project ||
              m.isDirty?.()
            ) {
              return;
            }

            try {
              await m.openProject(
                project.id,
                {
                  force: true,
                  discardCurrent:
                    true,
                  saveCurrent:
                    false,
                },
              );

              console.info(
                "[SMProjectFilesystemImport] Reloaded project after external scene/config change.",
              );
            } catch (error) {
              console.error(
                "[SMProjectFilesystemImport] Project reload failed.",
                error,
              );
            }
          },
          260,
        );
    }

    bindLifecycle() {
      window.addEventListener(
        "sm:launcher-project-opened",
        () => {
          this
            .startForActiveProject()
            .catch(
              (error) => {
                console.error(
                  "[SMProjectFilesystemImport] Could not start watcher.",
                  error,
                );
              },
            );
        },
      );

      window.addEventListener(
        "sm:launcher-project-ready",
        () => {
          this
            .startForActiveProject()
            .catch(
              (error) => {
                console.error(
                  "[SMProjectFilesystemImport] Could not start watcher.",
                  error,
                );
              },
            );
        },
      );

      window.addEventListener(
        "sm:project-closed",
        () => {
          this
            .stop()
            .catch(() => {});
        },
      );
    }
  }

  if (
    window[INSTALL_FLAG]
  ) {
    return;
  }

  window[INSTALL_FLAG] =
    true;

  window.SMProjectFilesystemImport =
    SMProjectFilesystemImport;

  window.smProjectFilesystemImport =
    window.smProjectFilesystemImport ||
    new SMProjectFilesystemImport();

  window.smProjectFilesystemImport
    .bindLifecycle();
})();