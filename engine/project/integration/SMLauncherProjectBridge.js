// engine/project/integration/SMLauncherProjectBridge.js
// Renderer-side bridge between physical Launcher projects and the existing
// SMProjectManager + SMProjectStorage IndexedDB project system.
//
// IMPORTANT:
// - This does NOT replace SMProjectManager.
// - This does NOT replace SMProjectLoader.
// - Existing IndexedDB persistence remains the engine's authoritative editor state.
// - The physical Launcher project path is attached as metadata so filesystem
//   synchronization can be added later without creating a second project system.
//
// Load AFTER:
//   engine/project/SMProjectStorage.js
//   engine/project/SMProjectSerializer.js
//   engine/project/SMProjectLoader.js
//   engine/project/SMProjectAutosave.js
//   engine/project/SMProjectManager.js

(() => {
  "use strict";

  const BRIDGE_VERSION = 1;
  const PATCH_FLAG =
    "__smLauncherProjectBridgeV1";

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

  function serializer() {
    return (
      window.smProjectSerializer ||
      null
    );
  }

  function normalizePath(value) {
    return String(value || "")
      .replace(/\\/g, "/")
      .replace(/\/+/g, "/")
      .replace(/\/+$/, "")
      .toLowerCase();
  }

  function launcherMetadata(
    descriptor,
  ) {
    return {
      source:
        "sm-engine-launcher",

      bridgeVersion:
        BRIDGE_VERSION,

      rootPath:
        descriptor.rootPath,

      manifestPath:
        descriptor.manifestPath,

      projectId:
        descriptor.projectId ||
        null,

      engineVersion:
        descriptor.engineVersion ||
        null,

      type:
        descriptor.type ||
        null,

      template:
        descriptor.template ||
        null,

      startupRelative:
        descriptor.startupRelative ||
        null,

      startupPath:
        descriptor.startupPath ||
        null,

      startupExists:
        descriptor.startupExists ===
        true,

      lastLauncherOpenAt:
        new Date()
          .toISOString(),
    };
  }

  function workspaceFromDescriptor(
    descriptor,
  ) {
    const manifest =
      descriptor?.manifest ||
      {};

    const explicit =
      String(
        manifest.workspace ||
          "",
      )
        .trim()
        .toUpperCase();

    if (
      [
        "FILM",
        "GAME_DEV",
        "GAMEPLAY_SAMPLE",
        "TERRAIN",
      ].includes(explicit)
    ) {
      return explicit;
    }

    const template =
      String(
        descriptor?.template ||
          "",
      )
        .trim()
        .toLowerCase();

    const type =
      String(
        descriptor?.type ||
          "",
      )
        .trim()
        .toLowerCase();

    if (
      template === "film" ||
      template === "cinematic" ||
      type === "film"
    ) {
      return "FILM";
    }

    if (
      template === "terrain" ||
      type === "terrain"
    ) {
      return "TERRAIN";
    }

    if (
      template ===
        "gameplay-sample"
    ) {
      return "GAMEPLAY_SAMPLE";
    }

    /*
     * FPS / Third Person / generic Game templates are normal GAME_DEV projects.
     * The existing project system uses "3D" as the default gameMode.
     */
    if (
      [
        "fps",
        "first-person",
        "third-person",
        "game",
      ].includes(template) ||
      type === "game"
    ) {
      return "GAME_DEV";
    }

    /*
     * The current canonical workspace system does not expose a dedicated
     * "2D" project workspace in the project backend. Keep it under FILM
     * and let the 2D workspace own its own mode/context when opened.
     */
    if (
      type === "2d" ||
      template === "2d" ||
      template ===
        "animation-2d"
    ) {
      return "FILM";
    }

    return "FILM";
  }

  function externalId(
    descriptor,
  ) {
    const raw =
      String(
        descriptor?.projectId ||
          "",
      ).trim();

    if (raw) {
      return raw;
    }

    /*
     * Launcher currently writes projectId, so this is only a fallback.
     */
    const root =
      normalizePath(
        descriptor?.rootPath,
      );

    let hash = 2166136261;

    for (
      let i = 0;
      i < root.length;
      i += 1
    ) {
      hash ^=
        root.charCodeAt(i);

      hash =
        Math.imul(
          hash,
          16777619,
        ) >>> 0;
    }

    return `launcher_${hash.toString(
      16,
    )}`;
  }

  async function waitForProjectSystem(
    timeoutMs = 12000,
  ) {
    const started =
      performance.now();

    while (
      performance.now() -
        started <
      timeoutMs
    ) {
      const m = manager();
      const s = storage();

      if (
        m &&
        s &&
        serializer()
      ) {
        await m.init?.();

        return {
          manager: m,
          storage: s,
        };
      }

      await new Promise(
        (resolve) =>
          setTimeout(
            resolve,
            40,
          ),
      );
    }

    throw new Error(
      "[SMLauncherProjectBridge] SM Project System did not become ready.",
    );
  }

  async function findExisting(
    descriptor,
  ) {
    const {
      manager: m,
    } =
      await waitForProjectSystem();

    const projects =
      await m.listProjects();

    const descriptorId =
      String(
        descriptor?.projectId ||
          "",
      ).trim();

    const externalRoot =
      normalizePath(
        descriptor?.rootPath,
      );

    return (
      projects.find(
        (project) => {
          if (
            descriptorId &&
            project.id ===
              descriptorId
          ) {
            return true;
          }

          const savedRoot =
            normalizePath(
              project.metadata
                ?.launcher
                ?.rootPath,
            );

          return (
            !!externalRoot &&
            !!savedRoot &&
            externalRoot ===
              savedRoot
          );
        },
      ) || null
    );
  }

  async function prepareWorkspace(
    workspace,
    descriptor,
  ) {
    const workspaceManager =
      window.workspaceManager;

    if (!workspaceManager) {
      return;
    }

    const gameMode =
      descriptor?.manifest
        ?.gameMode ||
      descriptor?.manifest
        ?.metadata
        ?.gameMode ||
      "3D";

    if (
      workspace === "GAME_DEV"
    ) {
      workspaceManager
        .setGameMode?.(
          gameMode,
          {
            applyViewport:
              false,
            showToast:
              false,
          },
        );
    }

    workspaceManager
      .setMode?.(workspace);
  }

  async function registerExternalProject(
    descriptor,
  ) {
    if (
      !descriptor?.rootPath ||
      !descriptor?.manifest
    ) {
      throw new Error(
        "[SMLauncherProjectBridge] Invalid Launcher project descriptor.",
      );
    }

    const {
      manager: m,
      storage: s,
    } =
      await waitForProjectSystem();

    const existing =
      await findExisting(
        descriptor,
      );

    const workspace =
      workspaceFromDescriptor(
        descriptor,
      );

    const metadata = {
      gameMode:
        descriptor?.manifest
          ?.gameMode ||
        descriptor?.manifest
          ?.metadata
          ?.gameMode ||
        "3D",

      launcher:
        launcherMetadata(
          descriptor,
        ),
    };

    if (existing) {
      const updated =
        await s.updateProject(
          existing.id,
          {
            name:
              descriptor.name ||
              existing.name,

            workspace,

            metadata,
          },
        );

      return {
        project: updated,
        created: false,
      };
    }

    /*
     * Register the external project inside the CURRENT canonical storage.
     *
     * We deliberately use Maps/Main.smscene as the internal startupScene,
     * because SMProjectLoader + SceneSerializer already understand that
     * format. The Launcher physical startupLevel is preserved in metadata
     * for later filesystem synchronization/import.
     */
    const project =
      await s.createProject({
        id:
          externalId(
            descriptor,
          ),

        name:
          descriptor.name ||
          "Launcher Project",

        workspace,

        startupScene:
          "Maps/Main.smscene",

        metadata,
      });

    return {
      project,
      created: true,
    };
  }

  async function initializeNewExternalProject(
    project,
    descriptor,
  ) {
    const m = manager();

    if (!m) {
      throw new Error(
        "[SMLauncherProjectBridge] SMProjectManager is unavailable.",
      );
    }

    const workspace =
      workspaceFromDescriptor(
        descriptor,
      );

    await prepareWorkspace(
      workspace,
      descriptor,
    );

    await m.activateProject(
      project,
      {
        load: false,
      },
    );

    /*
     * The Launcher-created physical project is currently an empty shell.
     * Establish a valid first INTERNAL manual save using the existing
     * SM serializers. This produces Maps/Main.smscene, Config/workspace.json,
     * project state, etc. in SMProjectStorage, exactly like projects created
     * from the engine's own project window.
     */
    serializer()
      ?.markDirty?.(
        "scene",
        "launcher-project-initialization",
      );

    serializer()
      ?.markDirty?.(
        "workspace",
        "launcher-project-initialization",
      );

    if (
      window.playerSystem
        ?.ready
    ) {
      serializer()
        ?.markDirty?.(
          "player",
          "launcher-project-initialization",
        );
    }

    if (
      window.TerrainSculpting
        ?.getLandscape?.() ||
      window.terrain
    ) {
      serializer()
        ?.markDirty?.(
          "terrain",
          "launcher-project-initialization",
        );
    }

    const saveResult =
      await m.saveProject({
        force: true,
      });

    return {
      project:
        m.activeProject ||
        project,

      result:
        saveResult,

      initialized:
        true,
    };
  }

  async function openExternalProject(
    descriptor,
    {
      saveCurrent = true,
    } = {},
  ) {
    const {
      manager: m,
    } =
      await waitForProjectSystem();

    const registered =
      await registerExternalProject(
        descriptor,
      );

    if (registered.created) {
      const initialized =
        await initializeNewExternalProject(
          registered.project,
          descriptor,
        );

      window.dispatchEvent(
        new CustomEvent(
          "sm:launcher-project-opened",
          {
            detail: {
              descriptor,
              project:
                initialized.project,
              created: true,
              initialized: true,
            },
          },
        ),
      );

      return {
        ...initialized,
        descriptor,
        created: true,
      };
    }

    const opened =
      await m.openProject(
        registered.project.id,
        {
          saveCurrent,
          discardCurrent:
            !saveCurrent,
          force: false,
        },
      );

    window.dispatchEvent(
      new CustomEvent(
        "sm:launcher-project-opened",
        {
          detail: {
            descriptor,
            project:
              opened?.project ||
              m.activeProject,
            created: false,
            initialized: false,
          },
        },
      ),
    );

    return {
      ...opened,
      descriptor,
      created: false,
      initialized: false,
    };
  }

  function install() {
    const m = manager();

    if (
      !m ||
      m[PATCH_FLAG]
    ) {
      return false;
    }

    Object.defineProperty(
      m,
      PATCH_FLAG,
      {
        value: true,
        configurable: false,
        enumerable: false,
      },
    );

    /*
     * Additive API only. Existing SMProjectManager methods are untouched.
     */
    m.findLauncherProject =
      findExisting;

    m.registerLauncherProject =
      registerExternalProject;

    m.openLauncherProject =
      openExternalProject;

    return true;
  }

  async function ensureInstalled() {
    await waitForProjectSystem();

    install();

    return true;
  }

  window.SMLauncherProjectBridge = {
    version:
      BRIDGE_VERSION,

    install,
    ensureInstalled,
    findExisting,
    registerExternalProject,
    openExternalProject,
    workspaceFromDescriptor,
  };

  /*
   * Install as soon as the canonical project manager exists.
   */
  ensureInstalled()
    .catch(
      (error) => {
        console.error(
          "[SMLauncherProjectBridge] Installation failed.",
          error,
        );
      },
    );
})();