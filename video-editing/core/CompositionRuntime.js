/**
 * CompositionRuntime.js
 * SM Engine Video Editing — Phase 3
 *
 * Runtime compositor cache derived from VideoProjectState.
 *
 * One persistent clip -> one runtime canvas item.
 *
 * This class owns runtime identity and native media lifetime, but it never
 * serializes HTMLVideoElement / HTMLAudioElement / Image / Canvas objects.
 *
 * Public:
 *   window.VideoCompositionRuntime
 */
(function (global) {
  "use strict";

  class VideoCompositionRuntime {
    constructor(project = null, manager = null, adapter = null) {
      this.project =
        project ||
        global.videoProject ||
        global.ensureVideoProjectState?.() ||
        null;

      this.manager = manager || null;

      this.adapter =
        adapter ||
        new global.VideoCanvasItemAdapter(this.project, this.manager);

      /*
       * IMPORTANT:
       * Mutate this array in place.
       * VideoEditingManager keeps a stable reference to it.
       */
      this.items = [];

      this.byClipId = new Map();

      this.byRuntimeId = new Map();

      this.sequencer = null;

      this._subscriptions = [];

      this._syncRaf = 0;

      this._syncing = false;

      this._destroyed = false;

      this._bindProject();
    }

    setManager(manager) {
      this.manager = manager || null;

      this.adapter?.setManager?.(this.manager);
    }

    setProject(project) {
      if (!project) return false;

      this._unbindProject();

      this.project = project;

      this.adapter?.setProject?.(project);

      this._bindProject();

      this.syncFromProject({
        force: true,
      });

      return true;
    }

    bindSequencer(sequencer) {
      this.sequencer = sequencer || null;

      return this;
    }

    /* ============================================================
           PROJECT EVENTS
           ============================================================ */

    _bindProject() {
      if (!this.project?.subscribe) {
        return;
      }

      const timelineUnsub = this.project.subscribe("timeline.*", (event) => {
        const path = event?.path || "";

        /*
         * Playhead/view/playback do not change runtime
         * object structure, so don't rebuild on every frame.
         */
        if (
          path === "timeline.playhead" ||
          path === "timeline.view" ||
          path === "timeline.playback" ||
          path === "timeline.activeTool" ||
          path === "timeline.display" ||
          path === "timeline.interaction"
        ) {
          return;
        }

        this.scheduleSync();
      });

      const mediaUnsub = this.project.subscribe("media.*", () => {
        this.scheduleSync();
      });

      if (timelineUnsub) {
        this._subscriptions.push(timelineUnsub);
      }

      if (mediaUnsub) {
        this._subscriptions.push(mediaUnsub);
      }
    }

    _unbindProject() {
      this._subscriptions.forEach((unsubscribe) => {
        try {
          unsubscribe?.();
        } catch (_) {}
      });

      this._subscriptions.length = 0;
    }

    scheduleSync() {
      if (this._destroyed || this._syncRaf) {
        return;
      }

      this._syncRaf = requestAnimationFrame(() => {
        this._syncRaf = 0;

        this.syncFromProject();
      });
    }

    /* ============================================================
           PROJECT -> RUNTIME
           ============================================================ */

    syncFromProject(options = {}) {
      if (this._destroyed || this._syncing) {
        return this.items;
      }

      const clips =
        this.project?.timeline?.clips || this.sequencer?.state?.clips || [];

      this._syncing = true;

      try {
        const keepClipIds = new Set();

        const orderedItems = [];

        clips.forEach((clip) => {
          if (!clip?.id) return;

          keepClipIds.add(clip.id);

          let item = this.byClipId.get(clip.id);

          if (!item) {
            item = this.adapter.createRuntimeItem(clip);

            if (!item) return;

            this.byClipId.set(clip.id, item);

            this.byRuntimeId.set(item.id, item);

            this._emit("videoRuntimeItemCreated", {
              clip,
              item,
            });
          } else {
            const oldId = item.id;

            this.adapter.refreshRuntimeItem(item, clip);

            if (oldId !== item.id) {
              this.byRuntimeId.delete(oldId);

              this.byRuntimeId.set(item.id, item);
            }
          }

          orderedItems.push(item);
        });

        /*
         * Release items whose persistent clips were deleted.
         */
        Array.from(this.byClipId.entries()).forEach(([clipId, item]) => {
          if (keepClipIds.has(clipId)) {
            return;
          }

          this._releaseItem(item);

          this.byClipId.delete(clipId);

          this.byRuntimeId.delete(item.id);
        });

        /*
         * Preserve the array object itself for old code that holds
         * manager.items by reference.
         */
        this.items.splice(0, this.items.length, ...orderedItems);

        this._repairSelection();

        if (options.hierarchy !== false) {
          this.manager?._syncHierarchy?.();
        }

        if (options.render === true && this.manager?.active) {
          const time =
            this.sequencer?.state?.playhead ??
            this.project?.timeline?.playhead ??
            this.manager?.currentTime ??
            0;

          this.manager?.renderCompositeAt?.(time);
        }

        return this.items;
      } finally {
        this._syncing = false;
      }
    }

    resolveClip(clip) {
      if (!clip) return null;

      let item = this.byClipId.get(clip.id);

      if (!item) {
        item = this.adapter.createRuntimeItem(clip);

        if (!item) return null;

        this.byClipId.set(clip.id, item);

        this.byRuntimeId.set(item.id, item);

        this.items.push(item);
      } else {
        this.adapter.refreshRuntimeItem(item, clip);
      }

      return item;
    }

    resolveRuntimeId(id) {
      return this.byRuntimeId.get(id) || null;
    }

    resolveClipId(clipId) {
      return this.byClipId.get(clipId) || null;
    }

    clipForItem(item) {
      if (!item) return null;

      const clips =
        this.project?.timeline?.clips || this.sequencer?.state?.clips || [];

      if (item.clipId) {
        const byId = clips.find((clip) => clip.id === item.clipId);

        if (byId) return byId;
      }

      return clips.find((clip) => clip.mediaRef === item.id) || null;
    }

    /* ============================================================
           SELECTION
           ============================================================ */

    selectionFromProject() {
      const primaryClipId =
        this.project?.selection?.primaryClipId ||
        this.sequencer?.state?.primarySelection?.id ||
        null;

      if (!primaryClipId) {
        return null;
      }

      return this.byClipId.get(primaryClipId) || null;
    }

    _repairSelection() {
      if (!this.manager) return;

      const current = this.manager.selectedItem;

      if (current && this.byRuntimeId.has(current.id)) {
        return;
      }

      this.manager.selectedItem = this.selectionFromProject();
    }

    /* ============================================================
           RENDER HELPERS
           ============================================================ */

    activeClipsAt(time, state = null) {
      const s = state || this.sequencer?.state || null;

      const clips = s?.clips || this.project?.timeline?.clips || [];

      return clips
        .filter(
          (clip) =>
            clip.visible !== false &&
            time >= Number(clip.start || 0) &&
            time < Number(clip.start || 0) + Number(clip.duration || 0),
        )
        .sort(
          (a, b) =>
            (s?.getTrack?.(a.trackId)?.order ?? this._trackOrder(a.trackId)) -
            (s?.getTrack?.(b.trackId)?.order ?? this._trackOrder(b.trackId)),
        );
    }

    _trackOrder(trackId) {
      const tracks = this.project?.timeline?.tracks || [];

      return tracks.find((track) => track.id === trackId)?.order ?? 99;
    }

    stopInactiveMedia(activeRuntimeIds, playing) {
      const active = activeRuntimeIds || new Set();

      this.items.forEach((item) => {
        const media = item?._video || item?._audio;

        if (!media) return;

        if (!playing || !active.has(item.id)) {
          if (!media.paused) {
            try {
              media.pause();
            } catch (_) {}
          }

          item._videoPlayPending = false;

          item._audioPlayPending = false;
        }
      });
    }

    pauseAllMedia() {
      this.stopInactiveMedia(new Set(), false);
    }

    /* ============================================================
           RELEASE / DESTROY
           ============================================================ */

    releaseClip(clipId) {
      const item = this.byClipId.get(clipId);

      if (!item) return false;

      this._releaseItem(item);

      this.byClipId.delete(clipId);

      this.byRuntimeId.delete(item.id);

      const index = this.items.indexOf(item);

      if (index >= 0) {
        this.items.splice(index, 1);
      }

      return true;
    }

    _releaseItem(item) {
      if (!item) return;

      this.adapter?.releaseNativeMedia?.(item);

      this._emit("videoRuntimeItemReleased", {
        item,
      });
    }

    destroy() {
      if (this._destroyed) return;

      this._destroyed = true;

      if (this._syncRaf) {
        cancelAnimationFrame(this._syncRaf);
      }

      this._syncRaf = 0;

      this._unbindProject();

      this.items.slice().forEach((item) => this._releaseItem(item));

      this.items.length = 0;

      this.byClipId.clear();
      this.byRuntimeId.clear();

      this.sequencer = null;
    }

    _emit(name, detail) {
      try {
        global.dispatchEvent(
          new CustomEvent(name, {
            detail,
          }),
        );
      } catch (_) {}
    }
  }

  global.VideoCompositionRuntime = VideoCompositionRuntime;
})(window);
