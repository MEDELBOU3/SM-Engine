/**
 * VideoDeliverWorkspaceBridge.js
 * SM Engine — top Deliver / Render mode -> Deliver Inspector + Deliver Studio.
 */
(function (global) {
  "use strict";

  class VideoDeliverWorkspaceBridge {
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

      if (!["deliver", "render", "export"].includes(mode)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      global.videoInspectorSidebar?.openPanel?.("render", {
        force: true,
      });

      global.ensureVideoDeliverDockManager?.()?.open?.({
        tab:
          global.videoProject?.workspace?.perWorkspace?.edit?.deliverDockTab ||
          "settings",
      });
    }
  }

  global.VideoDeliverWorkspaceBridge = VideoDeliverWorkspaceBridge;

  if (!global.videoDeliverWorkspaceBridge) {
    global.videoDeliverWorkspaceBridge = new VideoDeliverWorkspaceBridge();
  }

  global.openVideoDeliverStudio = function openVideoDeliverStudio(
    tab = "settings",
  ) {
    global.videoInspectorSidebar?.openPanel?.("render", {
      force: true,
    });

    return global.ensureVideoDeliverDockManager?.()?.open?.({
      tab,
    });
  };

  global.closeVideoDeliverStudio = function closeVideoDeliverStudio() {
    return global.videoDeliverDockManager?.close?.();
  };
})(window);
