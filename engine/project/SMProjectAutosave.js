// engine/project/SMProjectAutosave.js
// Non-destructive project recovery snapshots.
// Autosave does NOT overwrite manual project files.

(() => {
  "use strict";

  const DEFAULT_INTERVAL_MS =
    5 * 60 * 1000;

  const DEFAULT_KEEP = 10;

  function storage() {
    if (!window.smProjectStorage) {
      throw new Error(
        "[SMProjectAutosave] smProjectStorage is unavailable.",
      );
    }

    return window.smProjectStorage;
  }

  class SMProjectAutosave {
    constructor({
      intervalMs =
        DEFAULT_INTERVAL_MS,
      keep = DEFAULT_KEEP,
    } = {}) {
      this.intervalMs =
        Math.max(
          60_000,
          Number(intervalMs) ||
            DEFAULT_INTERVAL_MS,
        );

      this.keep =
        Math.max(
          1,
          Math.floor(
            Number(keep) ||
              DEFAULT_KEEP,
          ),
        );

      this.enabled = true;
      this.timer = null;
      this.projectId = null;
      this.running = false;
      this.lastAutosaveAt = null;

      this._bindProjectEvents();
    }

    _bindProjectEvents() {
      window.addEventListener(
        "sm:project-activated",
        (event) => {
          const id =
            event.detail?.project?.id ||
            event.detail?.projectId;

          if (id) {
            this.start(id);
          }
        },
      );

      window.addEventListener(
        "sm:project-closed",
        () => {
          this.stop();
        },
      );
    }

    setEnabled(enabled) {
      this.enabled = !!enabled;

      if (!this.enabled) {
        this.stopTimer();
      } else if (this.projectId) {
        this.startTimer();
      }

      return this.enabled;
    }

    setIntervalMs(value) {
      this.intervalMs =
        Math.max(
          60_000,
          Number(value) ||
            DEFAULT_INTERVAL_MS,
        );

      if (
        this.projectId &&
        this.enabled
      ) {
        this.startTimer();
      }

      return this.intervalMs;
    }

    start(projectId) {
      this.projectId =
        String(projectId);

      if (this.enabled) {
        this.startTimer();
      }

      return this;
    }

    stop() {
      this.stopTimer();
      this.projectId = null;
    }

    startTimer() {
      this.stopTimer();

      if (
        !this.enabled ||
        !this.projectId
      ) {
        return;
      }

      this.timer =
        setInterval(() => {
          this.tick().catch(
            (error) => {
              console.error(
                "[SMProjectAutosave] Autosave failed.",
                error,
              );
            },
          );
        }, this.intervalMs);
    }

    stopTimer() {
      if (this.timer) {
        clearInterval(
          this.timer,
        );

        this.timer = null;
      }
    }

    captureSnapshot() {
      const terrain =
        window.smTerrainSerializer
          ?.capture?.();

      const workspace =
        window.smWorkspaceSerializer
          ?.capture?.() ||
        null;

      const scene =
        window.smSceneSerializer
          ?.capture?.() ||
        null;

      const player =
        window.smPlayerSerializer
          ?.capture?.() ||
        null;

      return {
        format:
          "SM_AUTOSAVE_SNAPSHOT",
        version: 1,
        createdAt:
          new Date().toISOString(),

        workspace,
        scene,
        player,

        terrain: terrain
          ? {
              metadata:
                terrain.metadata,

              /*
               * IndexedDB supports Float32Array through structured cloning.
               * Keep binary heights out of JSON/manual project manifests.
               */
              heights:
                new Float32Array(
                  terrain.heights,
                ),
            }
          : null,
      };
    }

    async tick({
      force = false,
    } = {}) {
      if (
        !this.enabled ||
        !this.projectId ||
        this.running
      ) {
        return {
          saved: false,
          reason: "inactive",
        };
      }

      const serializer =
        window.smProjectSerializer;

      if (
        !force &&
        serializer &&
        !serializer.isDirty?.()
      ) {
        return {
          saved: false,
          reason: "clean",
        };
      }

      this.running = true;

      try {
        const snapshot =
          this.captureSnapshot();

        const record =
          await storage()
            .saveAutosave(
              this.projectId,
              snapshot,
              {
                label:
                  "Project Autosave",

                metadata: {
                  dirtySystems:
                    serializer
                      ?.getDirtySystems?.() ||
                    [],
                },
              },
            );

        await storage()
          .pruneAutosaves(
            this.projectId,
            this.keep,
          );

        this.lastAutosaveAt =
          record.createdAt;

        window.dispatchEvent(
          new CustomEvent(
            "sm:project-autosaved",
            {
              detail: {
                projectId:
                  this.projectId,
                autosave:
                  record,
              },
            },
          ),
        );

        return {
          saved: true,
          autosave: record,
        };
      } finally {
        this.running = false;
      }
    }

    async list(
      projectId =
        this.projectId,
    ) {
      if (!projectId) {
        return [];
      }

      return storage()
        .listAutosaves(
          projectId,
          {
            limit: this.keep,
            newestFirst: true,
          },
        );
    }

    async getLatest(
      projectId =
        this.projectId,
    ) {
      const rows =
        await this.list(
          projectId,
        );

      return rows[0] || null;
    }

    async recoverLatest(
      projectId =
        this.projectId,
    ) {
      const autosave =
        await this.getLatest(
          projectId,
        );

      if (!autosave) {
        return {
          recovered: false,
          reason:
            "no-autosave",
        };
      }

      return this.recover(
        autosave,
      );
    }

    async _restoreTerrainSnapshot(
      terrainSnapshot,
    ) {
      if (!terrainSnapshot) {
        return {
          loaded: false,
          skipped: true,
        };
      }

      const NS =
        window.TerrainSculpting;

      const metadata =
        terrainSnapshot.metadata;

      const heights =
        terrainSnapshot.heights;

      if (
        !NS?.generator
          ?.createLandscape ||
        !metadata ||
        !heights
      ) {
        return {
          loaded: false,
          reason:
            "terrain-system-unavailable",
        };
      }

      const position =
        metadata.transform
          ?.position ||
        [0, 0, 0];

      const settings = {
        ...(metadata.settings || {}),
        initialMode: "flat",
        locationX:
          Number(position[0]) || 0,
        locationY:
          Number(position[1]) || 0,
        locationZ:
          Number(position[2]) || 0,
        limitPlayerToTerrain:
          false,
      };

      const landscape =
        NS.generator
          .createLandscape(
            settings,
          );

      const data =
        landscape?.userData
          ?.terrainData;

      const source =
        heights instanceof
        Float32Array
          ? heights
          : new Float32Array(
              heights,
            );

      if (
        !data?.heights ||
        data.heights.length !==
          source.length
      ) {
        throw new Error(
          "[SMProjectAutosave] Autosave terrain resolution mismatch.",
        );
      }

      data.heights.set(source);
      data.version =
        (Number(data.version) ||
          0) + 1;

      landscape.userData.heightData =
        data.heights;

      landscape.userData.componentManager
        ?.syncAll?.();

      const q =
        metadata.transform
          ?.quaternion;

      if (
        Array.isArray(q) &&
        q.length >= 4
      ) {
        landscape.quaternion.set(
          Number(q[0]) || 0,
          Number(q[1]) || 0,
          Number(q[2]) || 0,
          Number.isFinite(
            Number(q[3]),
          )
            ? Number(q[3])
            : 1,
        );
      }

      const scale =
        metadata.transform?.scale;

      if (
        Array.isArray(scale) &&
        scale.length >= 3
      ) {
        landscape.scale.set(
          Number(scale[0]) || 1,
          Number(scale[1]) || 1,
          Number(scale[2]) || 1,
        );
      }

      const limits =
        metadata.playerLimits;

      if (
        limits?.enabled !==
        false
      ) {
        NS.generator
          .createTerrainLimits?.(
            landscape,
            {
              margin:
                Number(
                  limits?.margin,
                ) || 0.45,
              thickness:
                Number(
                  limits?.thickness,
                ) || 1,
              verticalPadding:
                Number(
                  limits
                    ?.verticalPadding,
                ) || 2048,
            },
          );
      }

      NS.surfaceQuery
        ?.registerTerrain?.(
          landscape,
        );

      NS.surfaceQuery
        ?.notifyTerrainDeformed?.({
          terrain:
            landscape,
          reason:
            "autosave-recovery",
        });

      return {
        loaded: true,
        terrain: landscape,
      };
    }

    _restoreWorkspaceSnapshot(
      state,
    ) {
      if (!state) {
        return;
      }

      const serializer =
        window.smWorkspaceSerializer;

      const manager =
        window.workspaceManager;

      const mode =
        state.workspace?.mode;

      if (
        mode &&
        manager
      ) {
        if (
          mode ===
            "GAME_DEV" &&
          state.workspace
            ?.gameMode
        ) {
          manager.setGameMode?.(
            state.workspace
              .gameMode,
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

      serializer
        ?._restoreTerrainEditor?.(
          state.terrainEditor,
        );

      setTimeout(() => {
        serializer
          ?._restoreCamera?.(
            state,
          );

        serializer
          ?._restoreSelection?.(
            state,
          );
      }, 160);
    }

    async recover(
      autosave,
    ) {
      const snapshot =
        autosave?.snapshot;

      if (
        !snapshot ||
        snapshot.format !==
          "SM_AUTOSAVE_SNAPSHOT"
      ) {
        throw new Error(
          "[SMProjectAutosave] Invalid autosave snapshot.",
        );
      }

      window.dispatchEvent(
        new CustomEvent(
          "sm:project-recovery-start",
          {
            detail: {
              autosave,
            },
          },
        ),
      );

      const results = {};

      /*
       * Switch workspace first so restored scene objects get the correct
       * workspace visibility contract.
       */
      this._restoreWorkspaceSnapshot(
        snapshot.workspace,
      );

      if (
        snapshot.scene &&
        window.smSceneSerializer
      ) {
        results.scene =
          await window.smSceneSerializer
            .restoreCapture(
              snapshot.scene,
              {
                projectId:
                  autosave.projectId,
                clearExisting:
                  true,
              },
            );
      }

      if (snapshot.terrain) {
        results.terrain =
          await this
            ._restoreTerrainSnapshot(
              snapshot.terrain,
            );
      }

      if (
        snapshot.player &&
        window.smPlayerSerializer
      ) {
        results.player =
          await window
            .smPlayerSerializer
            .restoreCapture(
              snapshot.player,
            );
      }

      /*
       * Recovery produces unsaved live changes. Mark the project dirty so Ctrl+S
       * commits the recovered state to the manual save.
       */
      window.smProjectSerializer
        ?.markDirty?.(
          "scene",
          "autosave-recovery",
        );

      if (
        snapshot.terrain
      ) {
        window.smProjectSerializer
          ?.markDirty?.(
            "terrain",
            "autosave-recovery",
          );
      }

      if (
        snapshot.player
      ) {
        window.smProjectSerializer
          ?.markDirty?.(
            "player",
            "autosave-recovery",
          );
      }

      window.smProjectSerializer
        ?.markDirty?.(
          "workspace",
          "autosave-recovery",
        );

      window.dispatchEvent(
        new CustomEvent(
          "sm:project-recovered",
          {
            detail: {
              autosave,
              results,
            },
          },
        ),
      );

      return {
        recovered: true,
        autosave,
        results,
      };
    }
  }

  SMProjectAutosave.DEFAULT_INTERVAL_MS =
    DEFAULT_INTERVAL_MS;

  SMProjectAutosave.DEFAULT_KEEP =
    DEFAULT_KEEP;

  window.SMProjectAutosave =
    SMProjectAutosave;

  window.smProjectAutosave =
    window.smProjectAutosave ||
    new SMProjectAutosave();
})();
