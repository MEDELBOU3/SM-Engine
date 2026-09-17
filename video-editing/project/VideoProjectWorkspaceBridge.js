/**
 * VideoProjectWorkspaceBridge.js
 * SM Engine — top Project mode -> Project Inspector + Project Studio dock.
 */
(function (global) {
  "use strict";

  class VideoProjectWorkspaceBridge {
    constructor() {
      this.bound = false;
      this._click = this._click.bind(this);

      this.bind();
    }

    bind() {
      if (this.bound) {
        return;
      }

      this.bound = true;

      document.addEventListener("click", this._click, true);
    }

    _click(event) {
      const button = event.target.closest?.("#video-mode-tabs [data-mode]");

      if (!button) {
        return;
      }

      const mode = String(button.dataset.mode || "").toLowerCase();

      if (mode !== "project") {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      global.videoInspectorSidebar?.openPanel?.("project", {
        force: true,
      });

      global.ensureVideoProjectDockManager?.()?.open?.({
        tab:
          global.videoProject?.workspace?.perWorkspace?.edit?.projectDockTab ||
          "contents",
      });
    }
  }

  global.VideoProjectWorkspaceBridge = VideoProjectWorkspaceBridge;

  if (!global.videoProjectWorkspaceBridge) {
    global.videoProjectWorkspaceBridge = new VideoProjectWorkspaceBridge();
  }

  global.openVideoProjectStudio = function openVideoProjectStudio(
    tab = "contents",
  ) {
    global.videoInspectorSidebar?.openPanel?.("project", {
      force: true,
    });

    return global.ensureVideoProjectDockManager?.()?.open?.({
      tab,
    });
  };

  global.closeVideoProjectStudio = function closeVideoProjectStudio() {
    return global.videoProjectDockManager?.close?.();
  };
})(window);
