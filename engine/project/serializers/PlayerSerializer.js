// engine/project/serializers/PlayerSerializer.js
// Saves/restores SMPlayerSystem runtime/editor placement state.
// The character model/animations remain owned by SMPlayerSystem configuration.

(() => {
  "use strict";

  const FORMAT = "SM_PLAYER_STATE";
  const VERSION = 1;
  const DEFAULT_PATH = "Config/player.json";

  function storage() {
    if (!window.smProjectStorage) {
      throw new Error(
        "[SMPlayerSerializer] smProjectStorage is unavailable.",
      );
    }

    return window.smProjectStorage;
  }

  function getPlayer() {
    return window.playerSystem || null;
  }

  function array3(value, fallback = [0, 0, 0]) {
    if (!value) return [...fallback];

    return [
      Number(value.x) || 0,
      Number(value.y) || 0,
      Number(value.z) || 0,
    ];
  }

  function quaternion4(value) {
    if (!value) return [0, 0, 0, 1];

    return [
      Number(value.x) || 0,
      Number(value.y) || 0,
      Number(value.z) || 0,
      Number.isFinite(Number(value.w))
        ? Number(value.w)
        : 1,
    ];
  }

  function safeConfig(config) {
    const source = config || {};

    const keys = [
      "spawnPosition",
      "walkSpeed",
      "runSpeed",
      "sprintSpeed",
      "rotationSpeed",
      "gravity",
      "terminalVelocity",
      "maxStepHeight",
      "groundOffset",
      "groundSnapDistance",
      "minGroundNormalY",
      "playerColliderRadius",
      "playerColliderHeight",
      "playerColliderSkin",
      "cameraDistance",
      "cameraHeight",
      "cameraFov",
    ];

    const result = {};

    for (const key of keys) {
      const value = source[key];

      if (
        value == null ||
        typeof value === "number" ||
        typeof value === "string" ||
        typeof value === "boolean" ||
        Array.isArray(value)
      ) {
        result[key] = value;
      }
    }

    return result;
  }

  class SMPlayerSerializer {
    constructor({
      path = DEFAULT_PATH,
    } = {}) {
      this.path = path;
    }

    capture() {
      const player = getPlayer();

      if (!player?.ready) {
        return null;
      }

      const root =
        player.character?.model ||
        player.model ||
        null;

      if (!root) {
        return null;
      }

      const state = player.state || {};

      return {
        format: FORMAT,
        version: VERSION,

        enabled: player.enabled === true,
        desiredEnabled:
          player.desiredEnabled === true,

        terrainTestModeActive:
          player.terrainTestModeActive === true,

        runtimeControlActive: false,

        simulationPaused:
          player.simulationPaused === true,

        workspaceMode:
          player.workspaceMode ||
          window.workspaceManager?.currentMode ||
          null,

        transform: {
          position: array3(root.position),
          quaternion: quaternion4(root.quaternion),
          scale: array3(
            root.scale,
            [1, 1, 1],
          ),
        },

        movement: {
          grounded:
            state.grounded === true,

          speed:
            Number(state.speed) || 0,

          verticalVelocity:
            Number(
              player.playerPhysics?.verticalVelocity,
            ) || 0,
        },

        physics: player.playerPhysics
          ? {
              stepHeight:
                Number(
                  player.playerPhysics.stepHeight,
                ) || 0,

              groundOffset:
                Number(
                  player.playerPhysics.groundOffset,
                ) || 0,

              groundSnapDistance:
                Number(
                  player.playerPhysics.groundSnapDistance,
                ) || 0,

              minGroundNormalY:
                Number(
                  player.playerPhysics.minGroundNormalY,
                ) || 0,

              gravity:
                Number(
                  player.playerPhysics.gravity,
                ) || 0,

              terminalVelocity:
                Number(
                  player.playerPhysics.terminalVelocity,
                ) || 0,
            }
          : null,

        config: safeConfig(
          player.config,
        ),

        savedAt:
          new Date().toISOString(),
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
        /*
         * No player is a valid project state. Remove an old player file so a
         * project that no longer uses a player does not resurrect one on load.
         */
        if (
          await storage().exists(
            projectId,
            path,
          )
        ) {
          await storage().deleteEntry(
            projectId,
            path,
            {
              touchProject: false,
            },
          );
        }

        if (touchProject) {
          await storage().touchProject(
            projectId,
          );
        }

        return {
          saved: true,
          playerPresent: false,
        };
      }

      await storage().writeJSON(
        projectId,
        path,
        payload,
        {
          mimeType:
            "application/x-sm-player+json",
          touchProject: false,
        },
      );

      if (touchProject) {
        await storage().touchProject(
          projectId,
        );
      }

      window.dispatchEvent(
        new CustomEvent("sm:player-saved", {
          detail: {
            projectId,
            path,
            state: payload,
          },
        }),
      );

      return {
        saved: true,
        playerPresent: true,
        state: payload,
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

    async ensurePlayerSystem() {
      let player = getPlayer();

      if (!player) {
        if (
          typeof window.SMPlayerSystem !==
          "function"
        ) {
          throw new Error(
            "[SMPlayerSerializer] SMPlayerSystem is not loaded.",
          );
        }

        player =
          new window.SMPlayerSystem({
            scene: window.scene,
            camera: window.camera,
            renderer: window.renderer,
            physicsSystem:
              window.physicsSystem,
          });

        window.playerSystem = player;
      }

      if (!player.ready) {
        await player.init?.();
      }

      return player;
    }

    async restoreCapture(
      payload,
      {
        syncWorkspace = true,
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
          `[SMPlayerSerializer] Unsupported player format: ${payload.format}`,
        );
      }

      const player =
        await this.ensurePlayerSystem();

      if (
        payload.config &&
        player.config
      ) {
        Object.assign(
          player.config,
          payload.config,
        );
      }

      const terrainMode =
        payload.terrainTestModeActive ===
        true;

      player.setTerrainTestMode?.(
        terrainMode,
      );

      const shouldEnable =
        terrainMode ||
        payload.enabled === true ||
        payload.desiredEnabled === true;

      player.setEnabled?.(
        shouldEnable,
      );

      /*
       * Loading a project never starts gameplay input automatically. The player
       * is restored in editor/idle state; Play can possess it later.
       */
      player.setRuntimeControlActive?.(
        false,
      );

      player.setSimulationPaused?.(
        false,
      );

      const position =
        payload.transform?.position ||
        [0, 0, 0];

      player.teleport?.(
        Number(position[0]) || 0,
        Number(position[1]) || 0,
        Number(position[2]) || 0,
      );

      const root =
        player.character?.model ||
        player.model ||
        null;

      const q =
        payload.transform?.quaternion;

      if (
        root &&
        Array.isArray(q) &&
        q.length >= 4
      ) {
        root.quaternion.set(
          Number(q[0]) || 0,
          Number(q[1]) || 0,
          Number(q[2]) || 0,
          Number.isFinite(Number(q[3]))
            ? Number(q[3])
            : 1,
        );
      }

      const scale =
        payload.transform?.scale;

      if (
        root &&
        Array.isArray(scale) &&
        scale.length >= 3
      ) {
        root.scale.set(
          Number(scale[0]) || 1,
          Number(scale[1]) || 1,
          Number(scale[2]) || 1,
        );
      }

      if (
        player.playerPhysics &&
        payload.physics
      ) {
        const physics =
          payload.physics;

        const assignFinite = (
          key,
          value,
        ) => {
          const number =
            Number(value);

          if (
            Number.isFinite(number)
          ) {
            player.playerPhysics[key] =
              number;
          }
        };

        assignFinite(
          "stepHeight",
          physics.stepHeight,
        );

        assignFinite(
          "groundOffset",
          physics.groundOffset,
        );

        assignFinite(
          "groundSnapDistance",
          physics.groundSnapDistance,
        );

        assignFinite(
          "minGroundNormalY",
          physics.minGroundNormalY,
        );

        assignFinite(
          "gravity",
          physics.gravity,
        );

        assignFinite(
          "terminalVelocity",
          physics.terminalVelocity,
        );

        player.playerPhysics.verticalVelocity =
          0;

        player.playerPhysics.refreshWorld?.(
          true,
        );

        player.playerPhysics.syncAfterTeleport?.();
      }

      root?.updateMatrixWorld?.(
        true,
      );

      player.animation?.setEnabled?.(
        shouldEnable,
      );

      if (shouldEnable) {
        player.forceIdle?.();
      }

      if (
        terrainMode &&
        syncWorkspace
      ) {
        window.workspaceManager
          ?._syncTerrainPlayerTestState?.(
            true,
          );
      }

      window.dispatchEvent(
        new CustomEvent("sm:player-loaded", {
          detail: {
            player,
            state: payload,
          },
        }),
      );

      return {
        loaded: true,
        player,
        state: payload,
      };
    }

    async load(
      projectId,
      {
        path = this.path,
        syncWorkspace = true,
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
          reason: "player-file-not-found",
        };
      }

      return this.restoreCapture(
        payload,
        {
          syncWorkspace,
        },
      );
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

  SMPlayerSerializer.FORMAT = FORMAT;
  SMPlayerSerializer.VERSION = VERSION;
  SMPlayerSerializer.DEFAULT_PATH = DEFAULT_PATH;

  window.SMPlayerSerializer = SMPlayerSerializer;

  window.smPlayerSerializer =
    window.smPlayerSerializer ||
    new SMPlayerSerializer();
})();