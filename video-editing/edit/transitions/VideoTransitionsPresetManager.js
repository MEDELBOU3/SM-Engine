/**
 * VideoTransitionsPresetManager.js
 * SM Engine — project-local transition presets.
 */
(function (global) {
  "use strict";

  class VideoTransitionsPresetManager {
    constructor(manager = null, project = null) {
      this.manager = manager || global.videoTransitionsManager;

      this.project = project || global.videoProject || null;

      this._ensure();
    }

    _ensure() {
      if (!this.project?.state) {
        return;
      }

      this.project.state.transitions = this.project.state.transitions || {};

      this.project.state.transitions.presets =
        this.project.state.transitions.presets || {};
    }

    list() {
      this._ensure();

      return Object.values(
        this.project?.state?.transitions?.presets || {},
      ).sort((a, b) => String(a.name).localeCompare(String(b.name)));
    }

    save(name, selected = this.manager?.selectedTransition?.()) {
      if (!name?.trim() || !selected) {
        return null;
      }

      this._ensure();

      const id = `transition-preset-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

      const preset = {
        id,
        name: name.trim(),
        transition: this._clone(selected.transition),
        createdAt: new Date().toISOString(),
      };

      delete preset.transition.uid;
      delete preset.transition.pairId;
      delete preset.transition.toClipId;
      delete preset.transition.fromClipId;

      this.project.state.transitions.presets[id] = preset;

      this.project.touch?.("transitions.preset.save", {
        id,
        name: preset.name,
      });

      return preset;
    }

    apply(
      id,
      target = global.videoTransitionsDockManager?.targetMode || "between",
    ) {
      const preset = this.project?.state?.transitions?.presets?.[id];

      if (!preset) {
        return null;
      }

      const transition = preset.transition;

      return this.manager.applyToSelection(transition.id, target, {
        duration: transition.duration,
        alignment: transition.alignment,
        easing: transition.easing,
        reverse: transition.reverse,
        params: transition.params,
      });
    }

    remove(id) {
      this._ensure();

      if (!this.project.state.transitions.presets[id]) {
        return false;
      }

      delete this.project.state.transitions.presets[id];

      this.project.touch?.("transitions.preset.remove", {
        id,
      });

      return true;
    }

    exportPreset(id) {
      const preset = this.project?.state?.transitions?.presets?.[id];

      return preset ? JSON.stringify(preset, null, 2) : null;
    }

    importPreset(json) {
      let data;

      try {
        data = typeof json === "string" ? JSON.parse(json) : json;
      } catch (_) {
        return null;
      }

      if (!data?.name || !data?.transition?.id) {
        return null;
      }

      this._ensure();

      const id = `transition-preset-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

      data = this._clone(data);

      data.id = id;

      this.project.state.transitions.presets[id] = data;

      this.project.touch?.("transitions.preset.import", {
        id,
        name: data.name,
      });

      return data;
    }

    _clone(value) {
      if (global.structuredClone) {
        try {
          return global.structuredClone(value);
        } catch (_) {}
      }

      return JSON.parse(JSON.stringify(value));
    }
  }

  global.VideoTransitionsPresetManager = VideoTransitionsPresetManager;

  global.ensureVideoTransitionsPresetManager =
    function ensureVideoTransitionsPresetManager() {
      if (!global.videoTransitionsPresetManager) {
        global.videoTransitionsPresetManager =
          new VideoTransitionsPresetManager(
            global.videoTransitionsManager,
            global.videoProject,
          );
      }

      return global.videoTransitionsPresetManager;
    };
})(window);
