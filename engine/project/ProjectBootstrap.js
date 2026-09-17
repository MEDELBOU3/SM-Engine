// engine/project/ProjectBootstrap.js
// Renderer startup bootstrap for projects opened from SM Engine Launcher.
//
// IMPORTANT:
// This is a renderer script, matching the rest of engine/project/*.js.
// It must NOT use require(), fs, path, or other Node APIs.
//
// Load AFTER:
//   engine/project/integration/SMLauncherProjectBridge.js

(() => {
  "use strict";

  const BOOT_FLAG =
    "__smLauncherProjectBootstrapV1";

  if (window[BOOT_FLAG]) {
    return;
  }

  window[BOOT_FLAG] = true;

  async function waitForLauncherBridge(
    timeoutMs = 12000,
  ) {
    const started =
      performance.now();

    while (
      performance.now() -
        started <
      timeoutMs
    ) {
      const bridge =
        window
          .SMLauncherProjectBridge;

      if (
        bridge?.openExternalProject
      ) {
        await bridge
          .ensureInstalled?.();

        return bridge;
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
      "[ProjectBootstrap] SMLauncherProjectBridge did not become ready.",
    );
  }

  async function readStartupRequest() {
    const api =
      window.electronAPI;

    if (
      !api
        ?.getLauncherStartupProject
    ) {
      /*
       * Browser build / old preload / non-Electron editor.
       */
      return {
        requested: false,
        ready: false,
        descriptor: null,
        error: null,
      };
    }

    return api
      .getLauncherStartupProject();
  }

  async function bootstrap() {
    let startup;

    try {
      startup =
        await readStartupRequest();
    } catch (error) {
      console.error(
        "[ProjectBootstrap] Could not query Launcher startup project.",
        error,
      );

      return null;
    }

    if (
      !startup?.requested
    ) {
      console.info(
        "[ProjectBootstrap] Engine was started without --sm-project.",
      );

      return null;
    }

    if (
      !startup.ready ||
      !startup.descriptor
    ) {
      const message =
        startup?.error ||
        "Launcher project descriptor is unavailable.";

      console.error(
        "[ProjectBootstrap]",
        message,
      );

      window.dispatchEvent(
        new CustomEvent(
          "sm:launcher-project-error",
          {
            detail: {
              error:
                message,
            },
          },
        ),
      );

      window.showToast?.(
        `Could not open Launcher project: ${message}`,
      );

      return null;
    }

    try {
      const bridge =
        await waitForLauncherBridge();

      const opened =
        await bridge
          .openExternalProject(
            startup.descriptor,
            {
              saveCurrent: true,
            },
          );

      const project =
        opened?.project ||
        window
          .smProjectManager
          ?.activeProject ||
        null;

      window.SMProject = {
        current:
          project,

        launcher: {
          descriptor:
            startup.descriptor,

          rootPath:
            startup.descriptor
              .rootPath,

          manifestPath:
            startup.descriptor
              .manifestPath,

          physicalStartup:
            startup.descriptor
              .startupPath,

          physicalStartupExists:
            startup.descriptor
              .startupExists ===
            true,
        },
      };

      console.info(
        "[ProjectBootstrap] Launcher project ready:",
        {
          name:
            project?.name,

          projectId:
            project?.id,

          externalRoot:
            startup.descriptor
              .rootPath,

          created:
            opened?.created ===
            true,

          initialized:
            opened?.initialized ===
            true,
        },
      );

      window.dispatchEvent(
        new CustomEvent(
          "sm:launcher-project-ready",
          {
            detail: {
              project,
              descriptor:
                startup.descriptor,
              opened,
            },
          },
        ),
      );

      window.showToast?.(
        `Opened project "${project?.name || startup.descriptor.name}"`,
      );

      /*
       * If the old in-engine Workspace project window is currently visible,
       * close it because the Launcher already chose the project.
       */
      window.workspaceManager
        ?.close?.();

      window.AssetsPanel
        ?.openSMProjectBrowser?.(
          project?.id,
          "",
        );

      return opened;
    } catch (error) {
      console.error(
        "[ProjectBootstrap] Launcher project bootstrap failed.",
        error,
      );

      window.dispatchEvent(
        new CustomEvent(
          "sm:launcher-project-error",
          {
            detail: {
              error:
                error?.message ||
                String(error),
            },
          },
        ),
      );

      window.showToast?.(
        `Project open failed: ${error?.message || error}`,
      );

      return null;
    }
  }

  window.SMProjectBootstrap = {
    bootstrap,
    readStartupRequest,
  };

  /*
   * Project scripts are dynamically loaded. Run immediately; the bridge itself
   * waits for SMProjectManager/Storage/Serializer readiness.
   */
  bootstrap();
})();