// engine/camera/SMCameraBookmarkStore.js
(function () {
  "use strict";

  class SMCameraBookmarkStore {
    constructor() {
      this.storageKey = "sm_camera_bookmarks_v2";

      this.data = this._load();
    }

    _load() {
      try {
        const raw = localStorage.getItem(this.storageKey);

        return raw ? JSON.parse(raw) || {} : {};
      } catch (_) {
        return {};
      }
    }

    _save() {
      try {
        localStorage.setItem(this.storageKey, JSON.stringify(this.data));
      } catch (error) {
        console.warn("[CameraBookmarkStore] save failed:", error);
      }
    }

    save(name, state) {
      const key = String(name || "").trim();

      if (!key || !state) {
        return false;
      }

      this.data[key] = {
        ...state,
        savedAt: Date.now(),
      };

      this._save();

      window.dispatchEvent(new CustomEvent("sm:camera-bookmarks-changed"));

      return true;
    }

    get(name) {
      const state = this.data[String(name)];

      return state ? JSON.parse(JSON.stringify(state)) : null;
    }

    list() {
      return Object.keys(this.data);
    }

    remove(name) {
      const key = String(name);

      if (!(key in this.data)) {
        return false;
      }

      delete this.data[key];

      this._save();

      window.dispatchEvent(new CustomEvent("sm:camera-bookmarks-changed"));

      return true;
    }

    clear() {
      this.data = {};
      this._save();

      window.dispatchEvent(new CustomEvent("sm:camera-bookmarks-changed"));
    }
  }

  window.SMCameraBookmarkStore = SMCameraBookmarkStore;

  window.smCameraBookmarkStore =
    window.smCameraBookmarkStore || new SMCameraBookmarkStore();
})();
