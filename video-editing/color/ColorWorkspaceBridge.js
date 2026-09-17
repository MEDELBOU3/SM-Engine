/**
 * ColorWorkspaceBridge.js
 * SM Engine — routes the TOP Color tab to the docked Color Studio.
 *
 * It keeps Video Editing active and opens:
 *   Color Dock + Color Inspector
 */
(function (global) {
  "use strict";

  class ColorWorkspaceBridge {
    constructor() {
      this.bound = false;
      this._click = this._click.bind(this);

      this.bind();
    }

    bind() {
      if (this.bound) return;

      this.bound = true;

      document.addEventListener("click", this._click, true);
    }

    _click(event) {
      const button = event.target.closest?.("#video-mode-tabs [data-mode]");

      if (!button) return;

      const mode = String(button.dataset.mode || "").toLowerCase();

      if (mode !== "color") {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      global.videoInspectorSidebar?.openPanel?.("color", {
        force: true,
      });

      global.ensureColorStudioDockManager?.()?.open?.({
        tab:
          global.videoProject?.workspace?.perWorkspace?.edit?.colorDockTab ||
          "primaries",
      });
    }
  }

  global.ColorWorkspaceBridge = ColorWorkspaceBridge;

  if (!global.colorWorkspaceBridge) {
    global.colorWorkspaceBridge = new ColorWorkspaceBridge();
  }

  global.openVideoColorStudio = function openVideoColorStudio(
    tab = "primaries",
  ) {
    global.videoInspectorSidebar?.openPanel?.("color", {
      force: true,
    });

    return global.ensureColorStudioDockManager?.()?.open?.({
      tab,
    });
  };

  global.closeVideoColorStudio = function closeVideoColorStudio() {
    return global.colorStudioDockManager?.close?.();
  };
})(window);
