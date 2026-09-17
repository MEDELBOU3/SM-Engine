/**
 * VideoProjectContentManager.js
 * SM Engine Video Editing — Project Studio backend.
 *
 * Owns project metadata/settings/content browsing operations.
 * Persistent data remains inside window.videoProject.
 */
(function (global) {
  "use strict";

  class VideoProjectContentManager {
    constructor(project = null) {
      this.project = project || global.videoProject || null;

      this.activeContentType = "media";
      this.search = "";
      this.listeners = new Set();

      this._projectUnsub = this.project?.subscribe?.("*", (event) => {
        this._emit("project-change", {
          source: event,
        });
      });
    }

    subscribe(callback) {
      if (typeof callback !== "function") {
        return () => {};
      }

      this.listeners.add(callback);

      return () => {
        this.listeners.delete(callback);
      };
    }

    _emit(type, detail = {}) {
      const event = {
        type,
        detail,
        manager: this,
      };

      this.listeners.forEach((callback) => {
        try {
          callback(event);
        } catch (error) {
          console.error("[VideoProjectContentManager]", error);
        }
      });

      try {
        global.dispatchEvent(
          new CustomEvent("videoProjectStudioChanged", {
            detail: event,
          }),
        );
      } catch (_) {}
    }

    refreshProject() {
      this.project = global.videoProject || this.project;

      return this.project;
    }

    summary() {
      const project = this.refreshProject();

      const media = project?.media || [];

      const clips = project?.timeline?.clips || [];

      const tracks = project?.timeline?.tracks || [];

      const markers = project?.timeline?.markers || [];

      const duration = clips.reduce(
        (max, clip) =>
          Math.max(max, Number(clip.start || 0) + Number(clip.duration || 0)),
        0,
      );

      const mediaCounts = {
        video: 0,
        audio: 0,
        image: 0,
        other: 0,
      };

      media.forEach((item) => {
        const type = String(item.mediaType || item.type || "").toLowerCase();

        if (type.includes("video")) {
          mediaCounts.video++;
        } else if (type.includes("audio")) {
          mediaCounts.audio++;
        } else if (type.includes("image") || type.includes("photo")) {
          mediaCounts.image++;
        } else {
          mediaCounts.other++;
        }
      });

      const usedMedia = new Set(
        clips
          .map((clip) => clip.sourceMediaId || clip.mediaRef || null)
          .filter(Boolean),
      );

      return {
        media: media.length,

        clips: clips.length,

        tracks: tracks.length,

        markers: markers.length,

        duration,

        mediaCounts,

        usedMedia: usedMedia.size,

        unusedMedia: Math.max(0, media.length - usedMedia.size),

        videoTracks: tracks.filter((track) => track.type === "video").length,

        audioTracks: tracks.filter((track) => track.type === "audio").length,
      };
    }

    contents(type = this.activeContentType, search = this.search) {
      const project = this.refreshProject();

      const query = String(search || "")
        .trim()
        .toLowerCase();

      let items = [];

      if (type === "media") {
        items = project?.media || [];
      } else if (type === "clips") {
        items = project?.timeline?.clips || [];
      } else if (type === "tracks") {
        items = project?.timeline?.tracks || [];
      } else if (type === "markers") {
        items = project?.timeline?.markers || [];
      }

      if (!query) {
        return items;
      }

      return items.filter((item) => {
        const haystack = [
          item.name,
          item.id,
          item.mediaType,
          item.type,
          item.mimeType,
          item.label,
          item.comment,
          item.trackId,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return haystack.includes(query);
      });
    }

    selectContent(type, id) {
      const project = this.refreshProject();

      if (!project || !id) {
        return false;
      }

      if (type === "media") {
        project.set("selection.mediaId", id, {
          dirty: false,
        });

        global.mediaPoolManager?.selectMedia?.(id);
      } else if (type === "clips") {
        project.set("selection.primaryClipId", id, {
          dirty: false,
        });

        project.set("selection.clipIds", [id], {
          dirty: false,
        });

        global.sequencerManager?.selectClip?.(id);
      } else if (type === "tracks") {
        project.set("selection.audioTrackId", id, {
          dirty: false,
        });
      } else if (type === "markers") {
        const marker = project.timeline?.markers?.find(
          (candidate) => candidate.id === id,
        );

        if (marker) {
          const time = Number(marker.time ?? marker.start ?? 0);

          if (global.sequencerManager?.setPlayhead) {
            global.sequencerManager.setPlayhead(time);
          } else {
            project.set("timeline.playhead", time, {
              dirty: false,
            });
          }
        }
      }

      this._emit("selection", {
        type,
        id,
      });

      return true;
    }

    updateMetadata(patch = {}) {
      const project = this.refreshProject();

      if (!project) {
        return false;
      }

      project.patch("project", patch);

      this._emit("metadata", {
        patch,
      });

      return true;
    }

    updateSettings(patch = {}) {
      const project = this.refreshProject();

      if (!project) {
        return false;
      }

      const current = project.settings || {};

      const merged = {
        ...current,
        ...patch,
      };

      if (patch.resolution) {
        merged.resolution = {
          ...(current.resolution || {}),
          ...patch.resolution,
        };
      }

      project.set("settings", merged);

      global.videoEditingManager?.syncProjectSettings?.();

      global.videoEditingManager?.resizeCanvas?.();

      global.videoEditingManager?.renderCanvas?.();

      global.sequencerManager?.renderer?.render?.();

      global.dispatchEvent(
        new CustomEvent("videoProjectSettingsChanged", {
          detail: {
            settings: project.settings,
          },
        }),
      );

      this._emit("settings", {
        patch,
      });

      return true;
    }

    setResolution(width, height) {
      const w = Math.max(1, Math.round(Number(width) || 1280));

      const h = Math.max(1, Math.round(Number(height) || 720));

      return this.updateSettings({
        resolution: {
          w,
          h,
        },
      });
    }

    setFPS(value) {
      return this.updateSettings({
        fps: Math.max(1, Number(value) || 30),
      });
    }

    setColorSpace(colorSpace, workingColorSpace = colorSpace) {
      return this.updateSettings({
        colorSpace,
        workingColorSpace,
      });
    }

    setAudioSettings(sampleRate, audioChannels) {
      return this.updateSettings({
        sampleRate: Math.max(8000, Number(sampleRate) || 48000),

        audioChannels: Math.max(1, Math.min(8, Number(audioChannels) || 2)),
      });
    }

    setTags(tags) {
      const normalized = Array.isArray(tags)
        ? tags
        : String(tags || "")
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean);

      return this.updateMetadata({
        tags: [...new Set(normalized)],
      });
    }

    rename(name) {
      const clean = String(name || "").trim();

      if (!clean) {
        return false;
      }

      return this.project?.renameProject?.(clean);
    }

    setNotes(notes) {
      return this.updateMetadata({
        notes: String(notes ?? ""),
      });
    }

    toggleAutosave(enabled) {
      const project = this.refreshProject();

      if (!project) {
        return false;
      }

      if (enabled) {
        project.enableAutosave?.({
          delay: project._autosaveDelay || 1200,
        });
      } else {
        project.disableAutosave?.();
      }

      this._emit("autosave", {
        enabled: !!enabled,
      });

      return true;
    }

    saveAutosave() {
      const result = this.project?.saveAutosave?.();

      this._emit("autosave-manual", {
        result,
      });

      return result;
    }

    restoreAutosave() {
      const result = this.project?.restoreAutosave?.();

      if (result) {
        global.videoEditingManager?.syncProjectSettings?.();

        global.videoEditingManager?.compositionRuntime?.syncFromProject?.({
          force: true,
          hierarchy: true,
        });

        global.sequencerManager?.renderer?.render?.();

        global.videoEditingManager?.resizeCanvas?.();

        global.videoEditingManager?.renderCanvas?.();
      }

      this._emit("restore-autosave", {
        result,
      });

      return result;
    }

    clearAutosave() {
      this.project?.clearAutosave?.();

      this._emit("clear-autosave");

      return true;
    }

    exportProjectFile() {
      const project = this.refreshProject();

      if (!project) {
        return false;
      }

      const json =
        project.serialize?.({
          pretty: true,
        }) || JSON.stringify(project.state, null, 2);

      const blob = new Blob([json], {
        type: "application/json",
      });

      const url = URL.createObjectURL(blob);

      const anchor = document.createElement("a");

      const safeName = String(
        project.project?.name || "SM-Engine-Project",
      ).replace(/[^\w.-]+/g, "-");

      anchor.href = url;
      anchor.download = `${safeName}.smvideo.json`;

      document.body.appendChild(anchor);

      anchor.click();
      anchor.remove();

      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 1000);

      project.markClean?.();

      this._emit("export-project");

      return true;
    }

    async importProjectFile(file) {
      if (!file) {
        return false;
      }

      const text = await file.text();

      this.project?.deserialize?.(text, {
        markClean: true,
      });

      global.videoEditingManager?.syncProjectSettings?.();

      global.videoEditingManager?.compositionRuntime?.syncFromProject?.({
        force: true,
        hierarchy: true,
      });

      global.sequencerManager?.renderer?.render?.();

      global.videoEditingManager?.resizeCanvas?.();

      global.videoEditingManager?.renderCanvas?.();

      this._emit("import-project", {
        name: file.name,
      });

      return true;
    }

    createNewProject() {
      const current = this.refreshProject();

      current?.createProject?.({
        name: "Untitled Video Project",
        width: 1280,
        height: 720,
        fps: 30,
      });

      global.videoEditingManager?.syncProjectSettings?.();

      global.videoEditingManager?.compositionRuntime?.syncFromProject?.({
        force: true,
        hierarchy: true,
      });

      global.sequencerManager?.renderer?.render?.();

      global.videoEditingManager?.resizeCanvas?.();

      global.videoEditingManager?.renderCanvas?.();

      this._emit("new-project");

      return true;
    }

    formatTime(seconds) {
      const total = Math.max(0, Number(seconds) || 0);

      const hours = Math.floor(total / 3600);

      const minutes = Math.floor((total % 3600) / 60);

      const secs = total % 60;

      return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${secs.toFixed(2).padStart(5, "0")}`;
    }
  }

  global.VideoProjectContentManager = VideoProjectContentManager;

  global.ensureVideoProjectContentManager =
    function ensureVideoProjectContentManager() {
      if (!global.videoProjectContentManager) {
        global.videoProjectContentManager = new VideoProjectContentManager(
          global.videoProject,
        );
      }

      return global.videoProjectContentManager;
    };

  global.ensureVideoProjectContentManager();
})(window);
