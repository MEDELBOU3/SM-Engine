/**
 * CanvasItemAdapter.js
 * SM Engine Video Editing — Phase 3
 *
 * Converts persistent VideoProjectState timeline clips + Media Pool assets
 * into NON-SERIALIZED runtime canvas items used by VideoEditingManager.
 *
 * Persistent source of truth:
 *   videoProject.timeline.clips[]
 *   videoProject.media[]
 *
 * Runtime-only data:
 *   HTMLVideoElement / HTMLAudioElement / HTMLImageElement
 *   decode/seek/play promises
 *   compositor caches
 *
 * Public:
 *   window.VideoCanvasItemAdapter
 */
(function (global) {
  "use strict";

  class VideoCanvasItemAdapter {
    constructor(project = null, manager = null) {
      this.project =
        project ||
        global.videoProject ||
        global.ensureVideoProjectState?.() ||
        null;

      this.manager = manager || null;
    }

    setProject(project) {
      this.project = project || null;
    }

    setManager(manager) {
      this.manager = manager || null;
    }

    /* ============================================================
           IDENTIFIERS
           ============================================================ */

    ensureRuntimeId(clip) {
      if (!clip) return null;

      if (clip.mediaRef) {
        return String(clip.mediaRef);
      }

      const id = `runtime-${clip.id || this.project?.makeId?.("clip") || this._fallbackId()}`;

      /*
       * mediaRef is only a stable bridge id.
       * It does NOT contain render state or native media objects.
       */
      clip.mediaRef = id;

      this.project?.touch?.(
        "timeline.clip.runtime-ref",
        {
          clipId: clip.id,
          mediaRef: id,
        },
        {
          dirty: true,
        },
      );

      return id;
    }

    _fallbackId() {
      return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    }

    /* ============================================================
           MEDIA SOURCE RESOLUTION
           ============================================================ */

    sourceForClip(clip) {
      if (!clip) return null;

      if (clip.sourceMediaId && this.project?.getMedia) {
        const source = this.project.getMedia(clip.sourceMediaId);

        if (source) return source;
      }

      if (clip.sourceMediaId && Array.isArray(this.project?.media)) {
        const source = this.project.media.find(
          (item) => item.id === clip.sourceMediaId,
        );

        if (source) return source;
      }

      /*
       * Compatibility fallback for projects created before
       * sourceMediaId became canonical.
       */
      if (clip.src) {
        return {
          id: clip.sourceMediaId || null,
          name: clip.name || "Media",
          mediaType: clip.mediaType,
          mimeType: clip.mimeType || "",
          src: clip.src,
          duration: Number(clip.sourceDuration || clip.duration || 0),
          mediaWidth: Number(clip.mediaWidth || 0),
          mediaHeight: Number(clip.mediaHeight || 0),
          thumb: clip.thumb || null,
          thumbnails: Array.isArray(clip.thumbnails) ? clip.thumbnails : [],
          audioPeaks: clip.audioPeaks || null,
        };
      }

      return null;
    }

    /* ============================================================
           RUNTIME ITEM CREATION / REFRESH
           ============================================================ */

    createRuntimeItem(clip) {
      if (!clip) return null;

      const source = this.sourceForClip(clip);

      const id = this.ensureRuntimeId(clip);

      const mediaType = clip.mediaType || source?.mediaType || "solid";

      const item = {
        id,
        clipId: clip.id || null,

        sourceMediaId: clip.sourceMediaId || source?.id || null,

        /*
         * Existing VideoEditingManager expects:
         * media => type:'media'
         * text  => type:'text'
         * solid => type:'solid'
         */
        type:
          mediaType === "text" || mediaType === "solid" ? mediaType : "media",

        mediaType,

        name: clip.name || source?.name || "Clip",

        src: source?.src || clip.src || "",

        mimeType: source?.mimeType || clip.mimeType || "",

        duration: Number(
          source?.duration || clip.sourceDuration || clip.duration || 0,
        ),

        sourceDuration: Number(
          source?.duration || clip.sourceDuration || clip.duration || 0,
        ),

        mediaWidth: Number(source?.mediaWidth || clip.mediaWidth || 0),

        mediaHeight: Number(source?.mediaHeight || clip.mediaHeight || 0),

        thumb: source?.thumb || clip.thumb || null,

        thumbnails: Array.isArray(source?.thumbnails)
          ? source.thumbnails.slice()
          : Array.isArray(clip.thumbnails)
            ? clip.thumbnails.slice()
            : [],

        audioPeaks: source?.audioPeaks || clip.audioPeaks || null,

        visible: clip.visible !== false,

        text: mediaType === "text" ? clip.text || "SM Engine" : undefined,

        color:
          mediaType === "solid"
            ? clip.color || "#4778ff"
            : clip.color || "#ffffff",

        fontSize: Number(clip.fontSize || 42),

        fontWeight: clip.fontWeight || 700,

        fontFamily: clip.fontFamily || "Segoe UI",

        /*
         * These are runtime mirrors only.
         * Persistent transform data stays on the clip.
         */
        x: clip.x ?? null,
        y: clip.y ?? null,
        w: clip.w ?? null,
        h: clip.h ?? null,

        scaleX: Number.isFinite(Number(clip.scaleX)) ? Number(clip.scaleX) : 1,

        scaleY: Number.isFinite(Number(clip.scaleY)) ? Number(clip.scaleY) : 1,

        rotation: Number(clip.rotation || 0),

        anchorX: Number.isFinite(Number(clip.anchorX))
          ? Number(clip.anchorX)
          : 0.5,

        anchorY: Number.isFinite(Number(clip.anchorY))
          ? Number(clip.anchorY)
          : 0.5,

        opacity: Number.isFinite(Number(clip.opacity))
          ? Number(clip.opacity)
          : 1,

        volume: Number.isFinite(Number(clip.volume)) ? Number(clip.volume) : 1,

        blendMode: clip.blendMode || "source-over",

        /*
         * IMPORTANT:
         * Keep these as direct references to persistent clip domains.
         * Effect/grade editors modifying the runtime item therefore
         * modify the authoritative clip data, not a duplicate array.
         */
        effects: clip.effects || [],

        grade: clip.grade || {},

        /*
         * `curves:{}` is truthy and the old advanced renderer treated
         * it as a request to build an SVG canvas filter. Keep curves
         * null until real curve data exists.
         */
        curves: this._usableCurves(clip.curves),

        fx: clip.fx || {},

        _runtimeOnly: true,
      };

      return item;
    }

    refreshRuntimeItem(item, clip) {
      if (!item || !clip) {
        return item;
      }

      const source = this.sourceForClip(clip);

      item.clipId = clip.id || item.clipId || null;

      item.sourceMediaId =
        clip.sourceMediaId || source?.id || item.sourceMediaId || null;

      item.mediaType =
        clip.mediaType || source?.mediaType || item.mediaType || "solid";

      item.type =
        item.mediaType === "text" || item.mediaType === "solid"
          ? item.mediaType
          : "media";

      item.name = clip.name || source?.name || item.name || "Clip";

      item.visible = clip.visible !== false;

      if (item.type === "media") {
        const nextSrc = source?.src || clip.src || "";

        /*
         * If source changes, release current decode element so
         * VideoEditingManager recreates it from the new source.
         */
        if (item.src && nextSrc && item.src !== nextSrc) {
          this.releaseNativeMedia(item);
        }

        item.src = nextSrc;

        item.mimeType = source?.mimeType || clip.mimeType || "";

        item.duration = Number(
          source?.duration || clip.sourceDuration || clip.duration || 0,
        );

        item.sourceDuration = Number(
          source?.duration || clip.sourceDuration || clip.duration || 0,
        );

        item.mediaWidth = Number(source?.mediaWidth || clip.mediaWidth || 0);

        item.mediaHeight = Number(source?.mediaHeight || clip.mediaHeight || 0);

        item.thumb = source?.thumb || clip.thumb || null;

        item.thumbnails = Array.isArray(source?.thumbnails)
          ? source.thumbnails.slice()
          : Array.isArray(clip.thumbnails)
            ? clip.thumbnails.slice()
            : [];

        item.audioPeaks = source?.audioPeaks || clip.audioPeaks || null;
      }

      if (item.type === "text") {
        item.text = clip.text || "SM Engine";

        item.fontSize = Number(clip.fontSize || item.fontSize || 42);

        item.fontWeight = clip.fontWeight || item.fontWeight || 700;

        item.fontFamily = clip.fontFamily || item.fontFamily || "Segoe UI";
      }

      if (item.type === "solid") {
        item.color = clip.color || item.color || "#4778ff";
      }

      /*
       * Sync persistent baseline transform into runtime cache.
       * During drawing, animated evaluated values are applied temporarily.
       */
      item.x = clip.x ?? item.x ?? null;

      item.y = clip.y ?? item.y ?? null;

      item.w = clip.w ?? item.w ?? null;

      item.h = clip.h ?? item.h ?? null;

      item.scaleX = Number.isFinite(Number(clip.scaleX))
        ? Number(clip.scaleX)
        : 1;

      item.scaleY = Number.isFinite(Number(clip.scaleY))
        ? Number(clip.scaleY)
        : 1;

      item.rotation = Number(clip.rotation || 0);

      item.anchorX = Number.isFinite(Number(clip.anchorX))
        ? Number(clip.anchorX)
        : 0.5;

      item.anchorY = Number.isFinite(Number(clip.anchorY))
        ? Number(clip.anchorY)
        : 0.5;

      item.opacity = Number.isFinite(Number(clip.opacity))
        ? Number(clip.opacity)
        : 1;

      item.volume = Number.isFinite(Number(clip.volume))
        ? Number(clip.volume)
        : 1;

      item.blendMode = clip.blendMode || "source-over";

      item.effects = clip.effects || (clip.effects = []);

      item.grade = clip.grade || (clip.grade = {});

      item.curves = this._usableCurves(clip.curves);

      item.fx = clip.fx || (clip.fx = {});

      return item;
    }

    _usableCurves(curves) {
      if (!curves || typeof curves !== "object") {
        return null;
      }

      const channels = [curves.red, curves.green, curves.blue];

      const hasRealData = channels.some(
        (points) => Array.isArray(points) && points.length >= 2,
      );

      return hasRealData ? curves : null;
    }

    createMediaDraft(entry) {
      if (!entry) return null;

      return {
        id: `runtime-draft-${this._fallbackId()}`,

        clipId: null,

        sourceMediaId: entry.id || null,

        type: "media",

        mediaType: entry.mediaType || "image",

        name: entry.name || "Media",

        src: entry.src || "",

        mimeType: entry.mimeType || "",

        duration: Number(entry.duration || 0),

        sourceDuration: Number(entry.duration || entry.sourceDuration || 0),

        mediaWidth: Number(entry.mediaWidth || 0),

        mediaHeight: Number(entry.mediaHeight || 0),

        thumb: entry.thumb || null,

        thumbnails: Array.isArray(entry.thumbnails)
          ? entry.thumbnails.slice()
          : [],

        audioPeaks: entry.audioPeaks || null,

        visible: true,
        opacity: 1,
        volume: 1,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        anchorX: 0.5,
        anchorY: 0.5,
        blendMode: "source-over",

        effects: [],
        grade: {},
        curves: {},
        fx: {},

        _runtimeOnly: true,
        _draft: true,
      };
    }

    /* ============================================================
           TRANSIENT EVALUATED STATE
           ============================================================ */

    captureTransientState(item) {
      if (!item) return null;

      return {
        opacity: item.opacity,

        x: item.x,

        y: item.y,

        w: item.w,

        h: item.h,

        scaleX: item.scaleX,

        scaleY: item.scaleY,

        rotation: item.rotation,

        anchorX: item.anchorX,

        anchorY: item.anchorY,

        blendMode: item.blendMode,

        runtimeVolume: item._runtimeVolume,

        runtimeMuted: item._runtimeMuted,

        videoTargetTime: item._videoTargetTime,

        videoPlaybackRate: item._videoPlaybackRate,

        audioTargetTime: item._audioTargetTime,

        audioPlaybackRate: item._audioPlaybackRate,
      };
    }

    applyEvaluatedClip(item, clip, evaluated, time, sequencerState) {
      if (!item || !clip) return;

      const value = evaluated || clip;

      item.opacity = Number.isFinite(Number(value.opacity ?? clip.opacity))
        ? Number(value.opacity ?? clip.opacity)
        : 1;

      item.blendMode = clip.blendMode || "source-over";

      if (value.x != null) {
        item.x = Number(value.x);
      }

      if (value.y != null) {
        item.y = Number(value.y);
      }

      if (value.w != null) {
        item.w = Number(value.w);
      }

      if (value.h != null) {
        item.h = Number(value.h);
      }

      item.scaleX = Number.isFinite(Number(value.scaleX ?? clip.scaleX))
        ? Number(value.scaleX ?? clip.scaleX)
        : 1;

      item.scaleY = Number.isFinite(Number(value.scaleY ?? clip.scaleY))
        ? Number(value.scaleY ?? clip.scaleY)
        : 1;

      item.rotation = Number(value.rotation ?? clip.rotation ?? 0);

      item.anchorX = Number.isFinite(Number(value.anchorX ?? clip.anchorX))
        ? Number(value.anchorX ?? clip.anchorX)
        : 0.5;

      item.anchorY = Number.isFinite(Number(value.anchorY ?? clip.anchorY))
        ? Number(value.anchorY ?? clip.anchorY)
        : 0.5;

      item._runtimeVolume = Math.max(
        0,
        Number(value.volume ?? clip.volume ?? 1),
      );

      item._runtimeMuted = !this.isClipAudible(clip, sequencerState);

      if (item.mediaType !== "video" && item.mediaType !== "audio") {
        return;
      }

      const localTime = Math.max(
        0,
        Number(time || 0) - Number(clip.start || 0),
      );

      const clipPlaybackRate = Math.max(0.001, Number(clip.playbackRate || 1));

      const sourceTime = Math.max(
        0,
        Number(clip.sourceIn || 0) + localTime * clipPlaybackRate,
      );

      if (item.mediaType === "video") {
        item._videoTargetTime = sourceTime;

        item._videoPlaybackRate = clipPlaybackRate;
      } else {
        item._audioTargetTime = sourceTime;

        item._audioPlaybackRate = clipPlaybackRate;
      }
    }

    restoreTransientState(item, snapshot) {
      if (!item || !snapshot) return;

      item.opacity = snapshot.opacity;

      item.x = snapshot.x;

      item.y = snapshot.y;

      item.w = snapshot.w;

      item.h = snapshot.h;

      item.scaleX = snapshot.scaleX;

      item.scaleY = snapshot.scaleY;

      item.rotation = snapshot.rotation;

      item.anchorX = snapshot.anchorX;

      item.anchorY = snapshot.anchorY;

      item.blendMode = snapshot.blendMode;

      item._runtimeVolume = snapshot.runtimeVolume;

      item._runtimeMuted = snapshot.runtimeMuted;

      item._videoTargetTime = snapshot.videoTargetTime;

      item._videoPlaybackRate = snapshot.videoPlaybackRate;

      item._audioTargetTime = snapshot.audioTargetTime;

      item._audioPlaybackRate = snapshot.audioPlaybackRate;
    }

    isClipAudible(clip, state) {
      if (!clip || !state) {
        return true;
      }

      if (clip.muted === true) {
        return false;
      }

      const track =
        state.getTrack?.(clip.trackId) ||
        state.tracks?.find?.((item) => item.id === clip.trackId) ||
        null;

      if (track?.muted === true) {
        return false;
      }

      const anySolo = !!state.tracks?.some?.((item) => item.solo === true);

      if (anySolo && track?.solo !== true) {
        return false;
      }

      return true;
    }

    /* ============================================================
           NATIVE MEDIA LIFECYCLE
           ============================================================ */

    releaseNativeMedia(item) {
      if (!item) return;

      [item._video, item._audio].forEach((media) => {
        if (!media) return;

        try {
          media.pause();
        } catch (_) {}

        try {
          media.removeAttribute?.("src");

          media.load?.();
        } catch (_) {}
      });

      item._video = null;

      item._audio = null;

      item._image = null;

      item._videoMetadataReady = false;

      item._audioMetadataReady = false;

      item._videoPlayPending = false;

      item._audioPlayPending = false;

      item._videoPendingTime = null;

      item._audioPendingTime = null;
    }
  }

  global.VideoCanvasItemAdapter = VideoCanvasItemAdapter;
})(window);
