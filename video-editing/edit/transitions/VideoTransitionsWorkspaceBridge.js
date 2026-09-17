/**
 * VideoTransitionsWorkspaceBridge.js
 * SM Engine — top Transitions mode -> Inspector + Transitions Studio dock.
 */
(function (global) {
  "use strict";

  class VideoTransitionsWorkspaceBridge {
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

      if (mode !== "transitions" && mode !== "transition") {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      global.videoInspectorSidebar?.openPanel?.("transitions", {
        force: true,
      });

      global.ensureVideoTransitionsDockManager?.()?.open?.({
        tab:
          global.videoProject?.workspace?.perWorkspace?.edit
            ?.transitionsDockTab || "transitions",
      });
    }
  }

  global.VideoTransitionsWorkspaceBridge = VideoTransitionsWorkspaceBridge;

  if (!global.videoTransitionsWorkspaceBridge) {
    global.videoTransitionsWorkspaceBridge =
      new VideoTransitionsWorkspaceBridge();
  }

  global.openVideoTransitionsStudio = function openVideoTransitionsStudio(
    tab = "transitions",
  ) {
    global.videoInspectorSidebar?.openPanel?.("transitions", {
      force: true,
    });

    return global.ensureVideoTransitionsDockManager?.()?.open?.({
      tab,
    });
  };

  global.closeVideoTransitionsStudio = function closeVideoTransitionsStudio() {
    return global.videoTransitionsDockManager?.close?.();
  };
})(window);
