// engine/project/integration/SMProjectFilesystemSync.js
// Renderer-side mirror:
// SMProjectStorage (IndexedDB) -> physical Launcher project folder.
//
// Load AFTER:
//   SMProjectStorage.js
//   SMProjectManager.js
//   SMLauncherProjectBridge.js
//
// This is intentionally one-way in v1:
// Engine canonical storage -> Windows project folder.
//
// We avoid importing physical files back into IndexedDB automatically until
// conflict resolution/versioning is defined.

(() => {
  "use strict";

  const SYNC_FLAG =
    "__smProjectFilesystemSyncV1";

  const SKIP_PATHS =
    new Set([
      "project.smproject",
    ]);

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

  function filesystemAPI() {
    return (
      window.electronAPI
        ?.projectFilesystem ||
      null
    );
  }

  function getLauncherRoot(
    project,
  ) {
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

  function normalizePath(value) {
    return String(value || "")
      .replace(/\\/g, "/")
      .replace(/\/+/g, "/")
      .replace(/^\/+|\/+$/g, "");
  }

  function projectManifestPatch(
    project,
  ) {
    return {
      id:
        project.id,

      projectId:
        project.id,

      name:
        project.name,

      format:
        project.format ||
        "SM_PROJECT",

      version:
        project.version ||
        1,

      startupScene:
        project.startupScene ||
        "Maps/Main.smscene",

      workspace:
        project.workspace ||
        "FILM",

      modifiedAt:
        project.modifiedAt ||
        new Date()
          .toISOString(),

      lastOpenedAt:
        project.lastOpenedAt ||
        null,

      metadata: {
        ...(project.metadata ||
          {}),
      },
    };
  }

  class SMProjectFilesystemSync {
    constructor() {
      this.syncing =
        false;

      this.pending =
        false;

      this.lastResult =
        null;

      this.lastError =
        null;

      this._eventsBound =
        false;
    }

    isAvailable() {
      const api =
        filesystemAPI();

      return !!(
        api?.writeText &&
        api?.writeBinary &&
        api?.ensureDirectory &&
        api?.mergeManifest
      );
    }

    async syncActiveProject(
      {
        reason =
          "manual",
      } = {},
    ) {
      const m = manager();
      const project =
        m?.activeProject;

      if (!project) {
        return {
          synced: false,
          reason:
            "no-active-project",
        };
      }

      return this
        .syncProject(
          project,
          {
            reason,
          },
        );
    }

    async syncProject(
      project,
      {
        reason =
          "manual",
      } = {},
    ) {
      if (this.syncing) {
        this.pending =
          true;

        return {
          synced: false,
          queued: true,
        };
      }

      if (!this.isAvailable()) {
        return {
          synced: false,
          reason:
            "filesystem-api-unavailable",
        };
      }

      const rootPath =
        getLauncherRoot(
          project,
        );

      if (!rootPath) {
        return {
          synced: false,
          reason:
            "not-launcher-linked",
        };
      }

      const s = storage();

      if (!s) {
        throw new Error(
          "[SMProjectFilesystemSync] SMProjectStorage is unavailable.",
        );
      }

      this.syncing =
        true;

      this.pending =
        false;

      const startedAt =
        Date.now();

      const result = {
        synced: false,
        projectId:
          project.id,
        projectName:
          project.name,
        rootPath,
        reason,
        filesWritten: 0,
        foldersEnsured: 0,
        binaryFiles: 0,
        textFiles: 0,
        skipped: [],
        errors: [],
        startedAt:
          new Date(
            startedAt,
          ).toISOString(),
        finishedAt: null,
        durationMs: 0,
      };

      try {
        const entries =
          await s.listEntries(
            project.id,
            {
              recursive: true,
              includeFolders: true,
              includeFiles: true,
            },
          );

        for (
          const entry
          of entries
        ) {
          const relativePath =
            normalizePath(
              entry.path,
            );

          if (!relativePath) {
            continue;
          }

          if (
            SKIP_PATHS.has(
              relativePath
                .toLowerCase(),
            )
          ) {
            result.skipped
              .push(
                relativePath,
              );

            continue;
          }

          try {
            if (
              entry.kind ===
              "folder"
            ) {
              await filesystemAPI()
                .ensureDirectory({
                  rootPath,
                  relativePath,
                });

              result
                .foldersEnsured +=
                1;

              continue;
            }

            if (
              entry.kind ===
              "binary"
            ) {
              const blobRecord =
                await s.readBlob(
                  project.id,
                  relativePath,
                );

              if (
                !blobRecord
                  ?.blob
              ) {
                throw new Error(
                  "Binary record has no Blob payload.",
                );
              }

              const buffer =
                await blobRecord
                  .blob
                  .arrayBuffer();

              await filesystemAPI()
                .writeBinary({
                  rootPath,
                  relativePath,
                  bytes:
                    buffer,
                });

              result
                .filesWritten +=
                1;

              result
                .binaryFiles +=
                1;

              continue;
            }

            const file =
              await s.readFile(
                project.id,
                relativePath,
              );

            if (!file) {
              throw new Error(
                "Text file record is unavailable.",
              );
            }

            await filesystemAPI()
              .writeText({
                rootPath,
                relativePath,
                content:
                  file.content ??
                  "",
              });

            result
              .filesWritten +=
              1;

            result
              .textFiles +=
              1;
          } catch (error) {
            result.errors
              .push({
                path:
                  relativePath,
                error:
                  error?.message ||
                  String(error),
              });

            console.error(
              `[SMProjectFilesystemSync] Could not sync ${relativePath}.`,
              error,
            );
          }
        }

        /*
         * project.smproject is merged, never blindly overwritten.
         * This preserves Launcher-only fields such as engineVersion/template/type.
         */
        await filesystemAPI()
          .mergeManifest({
            rootPath,
            patch:
              projectManifestPatch(
                project,
              ),
          });

        result.synced =
          result.errors
            .length === 0;

        result.finishedAt =
          new Date()
            .toISOString();

        result.durationMs =
          Date.now() -
          startedAt;

        this.lastResult =
          result;

        this.lastError =
          result.errors
            .length
            ? result.errors
            : null;

        window.dispatchEvent(
          new CustomEvent(
            "sm:project-filesystem-synced",
            {
              detail:
                result,
            },
          ),
        );

        console.info(
          "[SMProjectFilesystemSync] Sync complete:",
          result,
        );

        return result;
      } finally {
        this.syncing =
          false;

        if (this.pending) {
          this.pending =
            false;

          queueMicrotask(
            () =>
              this
                .syncActiveProject({
                  reason:
                    "queued-save",
                })
                .catch(
                  (error) => {
                    console.error(
                      "[SMProjectFilesystemSync] Queued sync failed.",
                      error,
                    );
                  },
                ),
          );
        }
      }
    }

    bindEvents() {
      if (
        this._eventsBound
      ) {
        return;
      }

      this._eventsBound =
        true;

      /*
       * SMProjectManager._emit("save-complete")
       * becomes the window event:
       *
       * sm:project-save-complete
       */
      window.addEventListener(
        "sm:project-save-complete",
        () => {
          this
            .syncActiveProject({
              reason:
                "project-save",
            })
            .catch(
              (error) => {
                console.error(
                  "[SMProjectFilesystemSync] Save sync failed.",
                  error,
                );
              },
            );
        },
      );

      /*
       * First Launcher project initialization performs a canonical save before
       * dispatching sm:launcher-project-opened. Sync once more here so the
       * physical project receives Maps/Main.smscene and Config files.
       */
      window.addEventListener(
        "sm:launcher-project-opened",
        () => {
          setTimeout(
            () => {
              this
                .syncActiveProject({
                  reason:
                    "launcher-open",
                })
                .catch(
                  (error) => {
                    console.error(
                      "[SMProjectFilesystemSync] Launcher-open sync failed.",
                      error,
                    );
                  },
                );
            },
            0,
          );
        },
      );
    }
  }

  if (
    window[SYNC_FLAG]
  ) {
    return;
  }

  window[SYNC_FLAG] =
    true;

  window.SMProjectFilesystemSync =
    SMProjectFilesystemSync;

  window.smProjectFilesystemSync =
    window.smProjectFilesystemSync ||
    new SMProjectFilesystemSync();

  window.smProjectFilesystemSync
    .bindEvents();
})();