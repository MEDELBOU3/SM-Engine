// engine/camera/SMCameraBootstrap.js
// Runs after index.js creates window.cameraSystem.
(function () {
  "use strict";

  let attempts = 0;

  const boot = () => {
    const system = window.cameraSystem;

    if (!system) {
      attempts += 1;

      if (attempts < 100) {
        setTimeout(boot, 80);
      }

      return;
    }

    window.smCameraViewportBridge?.init?.(system);

    const mode =
      window.workspaceManager?.currentMode ||
      localStorage.getItem("sm_workspace_mode") ||
      "FILM";

    window.smCameraViewportBridge?.applyWorkspaceProfile?.(mode);

    console.log("✅ SM Camera System PRO v2 bridges ready");
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => setTimeout(boot, 0), {
      once: true,
    });
  } else {
    setTimeout(boot, 0);
  }
})();
