/**
 * VideoExportManager.js
 * SM Engine — reliable Deliver / export engine hotfix.
 *
 * Fixes:
 * 1. Uses the populated timeline source instead of trusting an empty
 *    videoProject.timeline.clips array.
 * 2. Rejects near-zero render ranges instead of downloading broken files.
 * 3. Browser-only exports prefer WebM VP9/VP8 for reliable playback.
 * 4. MediaRecorder creation has codec fallback and uses the ACTUAL MIME type
 *    for the output file extension.
 * 5. Render stopping/progress uses wall-clock duration, avoiding the
 *    Sequencer auto-seek-at-end race.
 * 6. Empty/tiny recorder output is rejected instead of downloaded.
 * 7. Smooth export uses one deterministic timeline render clock.
 * 8. Timeline export never calls renderCanvas() because it draws inactive items.
 * 9. Media is primed before recording starts.
 * 10. Export playback visibly drives the Sequencer playhead/transport UI.
 * 11. True output-resolution composition rendering.
 * 12. Adaptive high-resolution bitrate floor.
 * 13. AudioContext is the master A/V synchronization clock.
 * 14. Manual canvas requestFrame() submission when supported.
 * 15. Editor preview/playhead UI is throttled during render to protect encoder bandwidth.
 */
(function (global) {
  "use strict";

  class VideoExportManager {
    constructor(capabilities = null, presetLibrary = null) {
      this.capabilities =
        capabilities ||
        global.videoExportCapabilities ||
        new global.VideoExportCapabilities();

      this.presets =
        presetLibrary ||
        global.videoDeliverPresetLibrary ||
        new global.VideoDeliverPresetLibrary(this.capabilities);

      this.activeSession = null;
      this.listeners = new Set();
    }

    subscribe(callback) {
      if (typeof callback !== "function") return () => {};
      this.listeners.add(callback);
      return () => this.listeners.delete(callback);
    }

    _emit(type, detail = {}) {
      const event = { type, detail, exporter: this };
      this.listeners.forEach((callback) => {
        try {
          callback(event);
        } catch (error) {
          console.error("[VideoExportManager]", error);
        }
      });

      try {
        global.dispatchEvent(
          new CustomEvent("videoExportChanged", { detail: event }),
        );
      } catch (_) {}
    }

    defaultSettings() {
      return this.presets.resolve("youtube-1080", global.videoProject);
    }

    resolveSettings(settings = {}) {
      const base = this.presets.resolve(
        settings.presetId || "custom",
        global.videoProject,
      );

      const result = { ...base, ...settings };

      result.width = Math.max(1, Math.round(Number(result.width) || 1920));
      result.height = Math.max(1, Math.round(Number(result.height) || 1080));
      result.fps = Math.max(1, Math.min(240, Number(result.fps) || 30));
      result.videoBitrateMbps = Math.max(
        0.25,
        Number(result.videoBitrateMbps) || 8,
      );

      const qualityBpp = {
        draft: 0.035,
        balanced: 0.065,
        high: 0.1,
        master: 0.145,
      };

      const bpp =
        qualityBpp[result.quality || "balanced"] || qualityBpp.balanced;

      const adaptiveBitrateMbps =
        (result.width * result.height * result.fps * bpp) / 1_000_000;

      result.videoBitrateMbps = Math.min(
        300,
        Math.max(result.videoBitrateMbps, adaptiveBitrateMbps),
      );

      result.audioBitrateKbps = Math.max(
        32,
        Number(result.audioBitrateKbps) || 160,
      );
      result.includeVideo = result.includeVideo !== false;
      result.includeAudio = result.includeAudio !== false;
      result.filename = String(
        result.filename || "{project}_{date}_{resolution}",
      );
      result.range = result.range || "entire";
      result.scaleMode = ["fit", "fill", "stretch"].includes(result.scaleMode)
        ? result.scaleMode
        : "fit";

      /*
       * IMPORTANT:
       * In browser-only mode, do not trust Chromium MP4 MediaRecorder merely
       * because isTypeSupported() says true. Use a browser-safe codec unless the
       * user explicitly opts into experimental MP4 or a native exporter exists.
       */
      if (result.includeVideo) {
        const safeFormat = this.capabilities.bestVideoFormat(
          result.formatId || "mp4-h264",
          {
            allowExperimental: result.allowExperimentalMp4 === true,
          },
        );

        if (safeFormat) {
          result.requestedFormatId =
            result.requestedFormatId || result.formatId;

          result.formatId = safeFormat.id;

          result.formatFallbackUsed =
            result.requestedFormatId !== result.formatId;
        }
      }

      return result;
    }

    _timelineClips() {
      const projectClips = Array.isArray(global.videoProject?.timeline?.clips)
        ? global.videoProject.timeline.clips
        : [];

      const sequencerClips = Array.isArray(
        global.sequencerManager?.state?.clips,
      )
        ? global.sequencerManager.state.clips
        : [];

      if (projectClips === sequencerClips) {
        return projectClips;
      }

      if (projectClips.length && !sequencerClips.length) {
        return projectClips;
      }

      if (sequencerClips.length && !projectClips.length) {
        console.warn(
          "[VideoExport] videoProject.timeline.clips is empty; using Sequencer clips.",
        );
        return sequencerClips;
      }

      if (projectClips.length !== sequencerClips.length) {
        console.warn(
          "[VideoExport] Project/Sequencer clip arrays are out of sync.",
          {
            project: projectClips.length,
            sequencer: sequencerClips.length,
          },
        );

        return sequencerClips.length > projectClips.length
          ? sequencerClips
          : projectClips;
      }

      return projectClips.length ? projectClips : sequencerClips;
    }

    _timelineEnd(clips = this._timelineClips()) {
      let end = clips.reduce((max, clip) => {
        const start = Math.max(0, Number(clip.start) || 0);
        const duration = Math.max(0, Number(clip.duration) || 0);
        const sourceOut = Number(clip.sourceOut);
        const sourceIn = Number(clip.sourceIn) || 0;

        const fallbackDuration =
          Number.isFinite(sourceOut) && sourceOut > sourceIn
            ? sourceOut - sourceIn
            : 0;

        return Math.max(max, start + Math.max(duration, fallbackDuration));
      }, 0);

      if (end <= 0) {
        const runtimeItems = Array.isArray(global.videoEditingManager?.items)
          ? global.videoEditingManager.items
          : [];

        end = runtimeItems.reduce(
          (max, item) =>
            Math.max(
              max,
              Number(item.duration) || Number(item.sourceDuration) || 0,
            ),
          0,
        );
      }

      return end;
    }

    getRange(settings = {}) {
      const resolved = this.resolveSettings(settings);
      const project = global.videoProject;
      const seq = global.sequencerManager;
      const clips = this._timelineClips();
      const timelineEnd = this._timelineEnd(clips);

      if (resolved.range === "work") {
        const start = Math.max(
          0,
          Number(
            seq?.state?.workAreaStart ??
              seq?.state?.workStart ??
              project?.timeline?.workAreaStart ??
              project?.timeline?.workStart ??
              0,
          ) || 0,
        );

        const candidateEnd = Number(
          seq?.state?.workAreaEnd ??
            seq?.state?.workEnd ??
            project?.timeline?.workAreaEnd ??
            project?.timeline?.workEnd ??
            timelineEnd,
        );

        const end = candidateEnd > start ? candidateEnd : timelineEnd;

        return { start, end: Math.max(start, end) };
      }

      if (resolved.range === "selected") {
        const id =
          project?.selection?.primaryClipId ||
          seq?.state?.selectedIds?.at?.(-1) ||
          null;

        const clip = clips.find((candidate) => candidate.id === id);

        if (clip) {
          const start = Math.max(0, Number(clip.start) || 0);
          const duration = Math.max(
            0,
            Number(clip.duration) ||
              (Number(clip.sourceOut) > Number(clip.sourceIn || 0)
                ? Number(clip.sourceOut) - Number(clip.sourceIn || 0)
                : 0),
          );

          return { start, end: start + duration, clip };
        }
      }

      if (resolved.range === "custom") {
        const start = Math.max(0, Number(resolved.rangeStart) || 0);
        const requestedEnd = Number(resolved.rangeEnd);
        const end = Number.isFinite(requestedEnd) ? requestedEnd : timelineEnd;

        return { start, end: Math.max(start, end) };
      }

      return { start: 0, end: Math.max(0, timelineEnd) };
    }

    estimate(settings = {}) {
      const resolved = this.resolveSettings(settings);
      const range = this.getRange(resolved);
      const duration = Math.max(0, range.end - range.start);
      const videoBits = resolved.includeVideo
        ? resolved.videoBitrateMbps * 1_000_000
        : 0;
      const audioBits = resolved.includeAudio
        ? resolved.audioBitrateKbps * 1000
        : 0;
      const bytes = (duration * (videoBits + audioBits)) / 8;

      return {
        duration,
        bytes,
        megabytes: bytes / 1024 / 1024,
        seconds: duration,
      };
    }

    validate(settings = {}) {
      const resolved = this.resolveSettings(settings);
      const issues = [];
      const range = this.getRange(resolved);
      const clips = this._timelineClips();
      const minDuration = Math.max(1 / resolved.fps, 0.05);

      if (!clips.length) {
        issues.push({
          severity: "error",
          code: "empty-timeline",
          message: "The timeline has no clips available to export.",
        });
      }

      if (range.end - range.start < minDuration) {
        issues.push({
          severity: "error",
          code: "empty-range",
          message:
            `Render range is too short (${Math.max(0, range.end - range.start).toFixed(3)} s). ` +
            "Check clip durations and timeline synchronization.",
        });
      }

      if (resolved.includeVideo && !this.capabilities.captureStream) {
        issues.push({
          severity: "error",
          code: "capture-stream",
          message:
            "Canvas captureStream() is not available in this Chromium build.",
        });
      }

      const format = this.capabilities.get(resolved.formatId);

      if (resolved.includeVideo && (!format || !format.supported)) {
        issues.push({
          severity: "error",
          code: "unsupported-format",
          message: `${resolved.formatId} is not supported by MediaRecorder on this system.`,
        });
      }

      if (resolved.formatFallbackUsed) {
        issues.push({
          severity: "warning",
          code: "safe-format-fallback",
          message:
            `Browser-safe export changed ${resolved.requestedFormatId} to ${resolved.formatId}. ` +
            "Use the native FFmpeg exporter later for guaranteed MP4/H.264 output.",
        });
      }

      if (resolved.includeAudio && !this.capabilities.audioContext) {
        issues.push({
          severity: "warning",
          code: "no-audio-context",
          message: "WebAudio is unavailable; the export may be video-only.",
        });
      }

      if (resolved.width * resolved.height > 3840 * 2160) {
        issues.push({
          severity: "warning",
          code: "very-high-resolution",
          message:
            "Resolution is above UHD 4K and may be slow or memory intensive.",
        });
      }

      return {
        valid: !issues.some((issue) => issue.severity === "error"),
        settings: resolved,
        range,
        issues,
      };
    }

    async exportFrame(options = {}) {
      const manager = global.videoEditingManager;
      const source = manager?.canvas;

      if (!source) {
        throw new Error("Video Editing canvas is not available.");
      }

      manager.renderCanvas?.();

      const width = Math.max(
        1,
        Math.round(
          Number(
            options.width || manager.resolution?.w || source.width || 1280,
          ),
        ),
      );
      const height = Math.max(
        1,
        Math.round(
          Number(
            options.height || manager.resolution?.h || source.height || 720,
          ),
        ),
      );
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { alpha: true });

      this._drawScaled(
        context,
        source,
        width,
        height,
        options.scaleMode || "fit",
      );

      const frameFormat = options.frameFormat || "png";
      const mime =
        frameFormat === "jpeg"
          ? "image/jpeg"
          : frameFormat === "webp"
            ? "image/webp"
            : "image/png";

      const quality = Math.max(
        0,
        Math.min(1, Number(options.frameQuality ?? 0.95)),
      );
      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob(
          (output) => {
            if (output) resolve(output);
            else reject(new Error("Could not encode frame."));
          },
          mime,
          quality,
        );
      });

      const extension = frameFormat === "jpeg" ? "jpg" : frameFormat;
      const name = this.makeFilename(
        {
          ...this.defaultSettings(),
          ...options,
          formatId: `frame-${frameFormat}`,
        },
        extension,
      );

      this._download(blob, name);
      this._emit("frame-complete", { name, size: blob.size });
      return { blob, name };
    }

    async renderJob(job, callbacks = {}) {
      const settings = this.resolveSettings(job?.settings || job || {});
      const validation = this.validate(settings);

      if (!validation.valid) {
        const message = validation.issues
          .filter((issue) => issue.severity === "error")
          .map((issue) => issue.message)
          .join(" ");
        throw new Error(message || "Export preflight failed.");
      }

      if (global.smNativeVideoExporter?.render) {
        return global.smNativeVideoExporter.render(job, {
          project: global.videoProject,
          settings,
          validation,
          callbacks,
        });
      }

      return this._renderMediaRecorder({ ...job, settings }, callbacks);
    }

    cancel() {
      const session = this.activeSession;
      if (!session) return false;
      session.cancelled = true;
      try {
        session.recorder?.requestData?.();
      } catch (_) {}
      try {
        if (session.recorder?.state !== "inactive") session.recorder.stop();
      } catch (_) {}
      try {
        global.sequencerManager?.pause?.();
      } catch (_) {}
      return true;
    }

    _recorderCandidates(preferredId) {
      const ordered = [];
      const add = (format) => {
        if (!format?.supported) return;
        if (ordered.some((item) => item.id === format.id)) return;
        ordered.push(format);
      };

      add(this.capabilities.bestVideoFormat(preferredId));
      add(this.capabilities.get("webm-vp9"));
      add(this.capabilities.get("webm-vp8"));
      add(this.capabilities.get("webm-av1"));

      return ordered;
    }

    _createRecorder(stream, settings) {
      const errors = [];

      for (const format of this._recorderCandidates(settings.formatId)) {
        const options = {
          mimeType: format.mime,
          videoBitsPerSecond: Math.round(settings.videoBitrateMbps * 1_000_000),
        };

        if (settings.includeAudio && stream.getAudioTracks().length) {
          options.audioBitsPerSecond = Math.round(
            settings.audioBitrateKbps * 1000,
          );
        }

        try {
          const recorder = new MediaRecorder(stream, options);
          return { recorder, format };
        } catch (error) {
          errors.push(`${format.id}: ${error?.message || error}`);
        }
      }

      throw new Error(
        "Could not create a compatible MediaRecorder. " + errors.join(" | "),
      );
    }

    async _renderMediaRecorder(job, callbacks = {}) {
      if (this.activeSession) {
        throw new Error("Another render is already active.");
      }

      const settings = this.resolveSettings(job.settings || {});

      const validation = this.validate(settings);

      if (!validation.valid) {
        throw new Error(
          validation.issues
            .filter((issue) => issue.severity === "error")
            .map((issue) => issue.message)
            .join(" ") || "Export preflight failed.",
        );
      }

      const manager = global.videoEditingManager;

      const sourceCanvas = manager?.canvas;

      const sequencer = global.sequencerManager;

      if (!manager || !sourceCanvas) {
        throw new Error("Composition canvas is not available.");
      }

      if (!sequencer?.state) {
        throw new Error("Sequencer state is not available.");
      }

      const range = validation.range;

      const duration = Math.max(
        1 / Math.max(1, settings.fps),
        range.end - range.start,
      );

      const exportCanvas = document.createElement("canvas");

      exportCanvas.width = settings.width;

      exportCanvas.height = settings.height;

      const exportContext = exportCanvas.getContext("2d", {
        alpha: !!settings.alpha,

        desynchronized: true,
      });

      if (!exportContext) {
        throw new Error("Could not create export 2D context.");
      }

      if (!exportCanvas.captureStream) {
        throw new Error("Canvas captureStream() is not supported.");
      }

      /*
       * IMPORTANT:
       * Do NOT run SequencerManager.play() while exporting.
       *
       * The old exporter had two competing clocks:
       * - SequencerManager.play() RAF
       * - exporter RAF
       *
       * It also called renderCanvas(), which draws every runtime item instead of
       * only clips active at the current timeline time.
       *
       * This exporter owns one clock and renders only with renderCompositeAt().
       */
      /*
       * Prefer manual frame capture.
       *
       * captureStream(settings.fps) asks Chromium to sample the canvas on its own
       * timer. Under heavy 1080p/4K rendering that timer can sample stale frames.
       *
       * captureStream(0) + requestFrame() lets the exporter submit a frame only
       * AFTER the exact timeline frame has finished rendering.
       */
      let stream = exportCanvas.captureStream(0);

      let videoTrack = stream.getVideoTracks?.()[0] || null;

      let manualVideoFrames =
        !!videoTrack && typeof videoTrack.requestFrame === "function";

      if (!manualVideoFrames) {
        try {
          stream.getTracks().forEach((track) => track.stop());
        } catch (_) {}

        stream = exportCanvas.captureStream(settings.fps);

        videoTrack = stream.getVideoTracks?.()[0] || null;
      }

      const audioBridge = settings.includeAudio
        ? await this._attachAudioTrack(stream)
        : null;

      const created = this._createRecorder(stream, settings);

      const recorder = created.recorder;

      const requestedFormat = created.format;

      const chunks = [];

      const oldState = {
        playing: !!sequencer.state.playing,

        internalPlaying: !!sequencer._playing,

        playhead: Number(sequencer.state.playhead || 0),

        loop: sequencer.state.loop,

        playbackRate: sequencer.state.playbackRate,

        workAreaStart: sequencer.state.workAreaStart,

        workAreaEnd: sequencer.state.workAreaEnd,
      };

      const session = {
        job,
        settings,
        recorder,
        stream,
        audioBridge,
        cancelled: false,
        done: false,
        renderRaf: 0,
        startedAt: 0,
        lastFrameIndex: -1,
        duration,
        range,

        /*
         * A/V synchronization state.
         */
        manualVideoFrames,
        videoTrack,
        audioClockStart: null,
        perfClockStart: null,
        lastUIUpdate: -Infinity,
        uiInterval: 1 / 12,
        playbackState: null,
        droppedFrames: 0,
      };

      this.activeSession = session;

      const setTimelineState = (time, playing, options = {}) => {
        const safeTime = Math.max(
          range.start,
          Math.min(range.end, Number(time) || range.start),
        );

        const forceUI = options.forceUI === true;

        const submitFrame = options.submitFrame !== false;

        sequencer.state.playing = !!playing;

        sequencer.state.playhead = safeTime;

        sequencer.state.loop = false;

        sequencer.state.playbackRate = 1;

        sequencer.state.workAreaStart = range.start;

        sequencer.state.workAreaEnd = range.end;

        /*
         * setPlaybackState() can iterate/synchronize many media elements.
         * Calling it for every output frame is expensive and can itself create
         * pause/play churn. Only call it when the playback state actually changes.
         */
        if (session.playbackState !== !!playing) {
          session.playbackState = !!playing;

          manager.setPlaybackState?.(!!playing);
        }

        /*
         * Render the actual encoded frame.
         */
        if (typeof manager.renderCompositeToCanvas === "function") {
          manager.renderCompositeToCanvas(exportCanvas, safeTime, {
            width: settings.width,

            height: settings.height,

            scaleMode: settings.scaleMode,

            alpha: !!settings.alpha,
          });
        } else {
          manager.renderCompositeAt?.(safeTime);

          this._drawScaled(
            exportContext,
            sourceCanvas,
            settings.width,
            settings.height,
            settings.scaleMode,
          );
        }

        /*
         * With manual canvas capture, submit ONLY after the final image for this
         * timeline time has reached the export canvas.
         */
        if (submitFrame && session.manualVideoFrames) {
          try {
            session.videoTrack?.requestFrame?.();
          } catch (_) {}
        }

        /*
         * The visible timeline/playhead should still move during rendering, but
         * rendering the entire editor UI at 30/60 fps wastes CPU/GPU that the media
         * decoder and encoder need.
         *
         * Update the monitor/playhead at 12 fps while encoded frames keep their
         * requested output FPS.
         */
        const localTime = safeTime - range.start;

        const shouldUpdateUI =
          forceUI || localTime - session.lastUIUpdate >= session.uiInterval;

        if (shouldUpdateUI) {
          session.lastUIUpdate = localTime;

          sequencer.renderer?.setPlaying?.(!!playing);

          sequencer.renderer?.updatePlayhead?.();

          this._presentExportFrameToPreview(manager, exportCanvas);

          try {
            global.dispatchEvent(
              new CustomEvent("video:export-playhead", {
                detail: {
                  time: safeTime,

                  playing: !!playing,

                  rendering: true,

                  rangeStart: range.start,

                  rangeEnd: range.end,
                },
              }),
            );
          } catch (_) {}
        }

        return safeTime;
      };

      const restoreTimeline = () => {
        try {
          manager.setPlaybackState?.(false);

          sequencer.state.playing = false;

          sequencer._playing = false;

          sequencer.renderer?.setPlaying?.(false);

          sequencer.state.loop = oldState.loop;

          sequencer.state.playbackRate = oldState.playbackRate;

          if (oldState.workAreaStart != null) {
            sequencer.state.workAreaStart = oldState.workAreaStart;
          }

          if (oldState.workAreaEnd != null) {
            sequencer.state.workAreaEnd = oldState.workAreaEnd;
          }

          sequencer.state.playhead = oldState.playhead;

          if (typeof sequencer._playheadChanged === "function") {
            sequencer._playheadChanged(false);
          } else {
            sequencer.renderer?.updatePlayhead?.();

            manager.renderCompositeAt?.(oldState.playhead);
          }

          if (oldState.internalPlaying) {
            setTimeout(() => {
              try {
                sequencer.play?.();
              } catch (_) {}
            }, 0);
          }
        } catch (error) {
          console.warn(
            "[VideoExport] Could not fully restore timeline state:",
            error,
          );
        }
      };

      const cleanup = () => {
        cancelAnimationFrame(session.renderRaf);

        try {
          stream.getTracks().forEach((track) => track.stop());
        } catch (_) {}

        try {
          audioBridge?.disconnect?.();
        } catch (_) {}

        restoreTimeline();

        this.activeSession = null;
      };

      /*
       * Prime the exact first frame while playback is paused.
       * This gives active videos/images time to seek/decode before recording.
       */
      try {
        sequencer.pause?.();

        setTimelineState(range.start, false, {
          forceUI: true,
          submitFrame: false,
        });

        await this._waitForCompositionMedia(manager, range.start, 2600);

        setTimelineState(range.start, false, {
          forceUI: true,
          submitFrame: false,
        });
      } catch (error) {
        cleanup();
        throw error;
      }

      return new Promise((resolve, reject) => {
        let settled = false;

        const fail = (error) => {
          if (settled) {
            return;
          }

          settled = true;
          cleanup();
          reject(error);
        };

        recorder.ondataavailable = (event) => {
          if (event.data?.size) {
            chunks.push(event.data);
          }
        };

        recorder.onerror = (event) => {
          fail(event.error || new Error("MediaRecorder export failed."));
        };

        recorder.onstop = () => {
          if (settled) {
            return;
          }

          const cancelled = session.cancelled;

          const actualMime =
            recorder.mimeType || chunks[0]?.type || requestedFormat.mime;

          const actualFormat =
            this.capabilities.fromMime(actualMime) || requestedFormat;

          const blob = new Blob(chunks, {
            type: actualMime || actualFormat.mime,
          });

          if (cancelled) {
            settled = true;
            cleanup();

            callbacks.onCancelled?.();

            this._emit("cancelled", {
              jobId: job.id,
            });

            resolve({
              cancelled: true,
              blob: null,
              name: null,
            });

            return;
          }

          if (!blob.size || blob.size < 1024) {
            fail(
              new Error(
                `Encoder produced an invalid/tiny file (${blob.size} bytes).`,
              ),
            );

            return;
          }

          const name = this.makeFilename(
            {
              ...settings,
              formatId: actualFormat.id,
              clip: range.clip?.name,
            },
            actualFormat.extension || "webm",
          );

          settled = true;
          cleanup();

          if (settings.autoDownload !== false) {
            this._download(blob, name);
          }

          callbacks.onProgress?.(1);

          callbacks.onComplete?.({
            blob,
            name,
          });

          this._emit("complete", {
            jobId: job.id,
            name,
            size: blob.size,
            mime: actualMime,
            actualFormatId: actualFormat.id,
          });

          resolve({
            cancelled: false,
            blob,
            name,
            format: actualFormat,
            mime: actualMime,
            range,
            settings,
          });
        };

        const stopRecorder = () => {
          if (session.done) {
            return;
          }

          session.done = true;

          setTimelineState(
            Math.max(range.start, range.end - 1 / Math.max(1, settings.fps)),
            false,
            {
              forceUI: true,
              submitFrame: true,
            },
          );

          try {
            recorder.requestData?.();
          } catch (_) {}

          setTimeout(() => {
            try {
              if (recorder.state !== "inactive") {
                recorder.stop();
              }
            } catch (error) {
              fail(error);
            }
          }, 90);
        };

        const renderLoop = (now) => {
          if (session.done || session.cancelled) {
            return;
          }

          /*
           * AUDIO IS THE MASTER CLOCK
           * -------------------------
           * If WebAudio is present, use AudioContext.currentTime. That clock runs
           * independently of main-thread rendering pressure and is the same clock
           * feeding the MediaStream audio track.
           *
           * The video/playhead therefore catches up to audio instead of slowly
           * drifting behind it.
           */
          let elapsed;

          if (
            audioBridge?.context &&
            Number.isFinite(session.audioClockStart)
          ) {
            elapsed = audioBridge.context.currentTime - session.audioClockStart;
          } else {
            elapsed = (now - session.perfClockStart) / 1000;
          }

          elapsed = Math.max(0, elapsed);

          const progress = Math.max(0, Math.min(1, elapsed / duration));

          const maxFrameIndex = Math.max(
            0,
            Math.ceil(duration * settings.fps) - 1,
          );

          const frameIndex = Math.min(
            Math.max(0, Math.floor(elapsed * settings.fps)),
            maxFrameIndex,
          );

          if (frameIndex !== session.lastFrameIndex) {
            /*
             * If rendering temporarily stalls, DO NOT render every missed frame in
             * a burst. That would make video fall behind audio even further.
             *
             * Skip directly to the frame belonging to the current audio time.
             * The visible result may hold/drop a frame under overload, but A/V sync
             * remains locked instead of producing cumulative delay.
             */
            if (
              session.lastFrameIndex >= 0 &&
              frameIndex > session.lastFrameIndex + 1
            ) {
              session.droppedFrames += frameIndex - session.lastFrameIndex - 1;
            }

            session.lastFrameIndex = frameIndex;

            const exportTime = Math.min(
              range.end,
              range.start + frameIndex / settings.fps,
            );

            setTimelineState(exportTime, true, {
              submitFrame: true,
            });
          }

          /*
           * Progress callbacks are cheap, but avoid broadcasting an expensive
           * CustomEvent on every display RAF.
           */
          callbacks.onProgress?.(progress);

          if (
            frameIndex === session.lastFrameIndex &&
            (!session._lastProgressEmit ||
              now - session._lastProgressEmit >= 100)
          ) {
            session._lastProgressEmit = now;

            this._emit("progress", {
              jobId: job.id,

              progress,
              elapsed,
              duration,
              frameIndex,
              droppedFrames: session.droppedFrames,

              clock: audioBridge?.context ? "audio" : "performance",
            });
          }

          if (elapsed >= duration) {
            stopRecorder();
            return;
          }

          session.renderRaf = requestAnimationFrame(renderLoop);
        };

        try {
          /*
           * The first frame is already decoded and copied into exportCanvas.
           * Start MediaRecorder first, then start media playback immediately so
           * recorder and A/V playback share the same wall-clock origin.
           */
          /*
           * Larger chunks reduce main-thread pressure from dataavailable events.
           */
          recorder.start(1000);

          session.perfClockStart = performance.now();

          session.audioClockStart = audioBridge?.context
            ? audioBridge.context.currentTime
            : null;

          session.lastFrameIndex = 0;

          session.lastUIUpdate = -Infinity;

          setTimelineState(range.start, true, {
            forceUI: true,
            submitFrame: true,
          });

          callbacks.onStart?.({
            range,
            settings,
            format: requestedFormat,
          });

          this._emit("start", {
            jobId: job.id,
            range,
            settings,
            format: requestedFormat,
          });

          session.renderRaf = requestAnimationFrame(renderLoop);
        } catch (error) {
          try {
            if (recorder.state !== "inactive") {
              recorder.stop();
            }
          } catch (_) {}

          fail(error);
        }
      });
    }

    async _waitForCompositionMedia(manager, time, timeoutMs = 2000) {
      const started = performance.now();

      const ready = () => {
        const items = Array.isArray(manager?.items) ? manager.items : [];

        let pending = 0;

        items.forEach((item) => {
          if (item?.visible === false) {
            return;
          }

          if (item.mediaType === "video") {
            const video = item._video;

            if (
              video &&
              (video.seeking ||
                video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA)
            ) {
              pending++;
            }
          }

          if (item.mediaType === "image") {
            const image = item._img;

            if (image && (!image.complete || !image.naturalWidth)) {
              pending++;
            }
          }
        });

        return pending === 0;
      };

      while (!ready() && performance.now() - started < timeoutMs) {
        manager.renderCompositeAt?.(time);

        await new Promise((resolve) => setTimeout(resolve, 24));
      }

      manager.renderCompositeAt?.(time);
    }

    async _attachAudioTrack(stream) {
      const audio =
        global.ensureAudioStudioManager?.(global.videoProject) ||
        global.audioStudioManager;

      if (!audio) return null;

      try {
        await audio.ensureContext?.();
        if (audio.context?.state === "suspended") await audio.context.resume();
        audio.syncTracks?.();
        audio.syncRuntimeMedia?.();

        if (!audio.context || !audio.masterAnalyser) return null;

        const destination = audio.context.createMediaStreamDestination();
        audio.masterAnalyser.connect(destination);
        destination.stream
          .getAudioTracks()
          .forEach((track) => stream.addTrack(track));

        return {
          destination,

          /*
           * The exporter uses this exact AudioContext as the master A/V clock.
           */
          context: audio.context,

          now() {
            return audio.context?.currentTime || 0;
          },

          disconnect() {
            try {
              audio.masterAnalyser.disconnect(destination);
            } catch (_) {}
            try {
              destination.stream.getTracks().forEach((track) => track.stop());
            } catch (_) {}
          },
        };
      } catch (error) {
        console.warn("[VideoExport] Audio capture bridge unavailable:", error);
        return null;
      }
    }

    _presentExportFrameToPreview(manager, exportCanvas) {
      const previewCanvas = manager?.canvas;

      const previewContext = manager?.ctx;

      if (!previewCanvas || !previewContext || !exportCanvas) {
        return;
      }

      previewContext.save();

      try {
        previewContext.setTransform(1, 0, 0, 1, 0, 0);
        previewContext.clearRect(
          0,
          0,
          previewCanvas.width,
          previewCanvas.height,
        );

        previewContext.imageSmoothingEnabled = true;

        if ("imageSmoothingQuality" in previewContext) {
          previewContext.imageSmoothingQuality = "high";
        }

        previewContext.drawImage(
          exportCanvas,
          0,
          0,
          exportCanvas.width,
          exportCanvas.height,
          0,
          0,
          previewCanvas.width,
          previewCanvas.height,
        );
      } finally {
        previewContext.restore();
      }

      manager.canvasController?.refreshOverlay?.();
      manager.canvasController?.updateStatus?.();
    }

    _drawScaled(context, source, width, height, mode = "fit") {
      if (!context || !source) return;

      context.save();
      context.setTransform(1, 0, 0, 1, 0, 0);

      context.imageSmoothingEnabled = true;

      if ("imageSmoothingQuality" in context) {
        context.imageSmoothingQuality = "high";
      }

      context.clearRect(0, 0, width, height);

      const sourceWidth = Math.max(
        1,
        Number(source.width || source.videoWidth || width),
      );
      const sourceHeight = Math.max(
        1,
        Number(source.height || source.videoHeight || height),
      );

      if (mode === "stretch") {
        context.drawImage(source, 0, 0, width, height);
        context.restore();
        return;
      }

      const scale =
        mode === "fill"
          ? Math.max(width / sourceWidth, height / sourceHeight)
          : Math.min(width / sourceWidth, height / sourceHeight);

      const drawWidth = sourceWidth * scale;
      const drawHeight = sourceHeight * scale;
      const x = (width - drawWidth) / 2;
      const y = (height - drawHeight) / 2;

      context.drawImage(source, x, y, drawWidth, drawHeight);
      context.restore();
    }

    makeFilename(settings, extension) {
      const project = global.videoProject?.project?.name || "SM-Engine-Project";
      const now = new Date();
      const tokens = {
        project,
        date: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`,
        time: `${String(now.getHours()).padStart(2, "0")}-${String(now.getMinutes()).padStart(2, "0")}-${String(now.getSeconds()).padStart(2, "0")}`,
        resolution: `${settings.width}x${settings.height}`,
        fps: String(settings.fps),
        codec: String(
          this.capabilities.get(settings.formatId)?.codec ||
            settings.formatId ||
            "export",
        ),
        clip: settings.clip || "clip",
        index: String(settings.index || 1),
      };

      let filename = String(
        settings.filename || "{project}_{date}_{resolution}",
      );
      Object.entries(tokens).forEach(([key, value]) => {
        filename = filename.replaceAll(`{${key}}`, String(value));
      });

      filename = filename
        .replace(/[<>:"/\\|?*\x00-\x1F]+/g, "-")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/\.+$/g, "");

      if (!filename) filename = "SM-Engine-Export";
      return `${filename}.${extension}`;
    }

    _download(blob, name) {
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = name;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    }

    open() {
      global.videoInspectorSidebar?.openPanel?.("render", { force: true });
      global.ensureVideoDeliverDockManager?.()?.open?.({ tab: "settings" });
    }

    renderPanel(host) {
      if (!host) return;
      host.innerHTML = `
   <div style="padding:8px;color:var(--text-secondary,#b0b0b0);font-size:8px;">
    Deliver is handled by Deliver Studio.
    <button type="button" data-open-deliver-studio style="display:block;margin-top:7px;height:23px;border:1px solid var(--border-color,#4d4d4d81);border-radius:0;background:var(--bg-button,#363636);color:var(--text-primary,#fff);font-size:7px;">
     OPEN DELIVER STUDIO
    </button>
   </div>`;
      host
        .querySelector("[data-open-deliver-studio]")
        ?.addEventListener("click", () => this.open());
    }
  }

  global.VideoExportManager = VideoExportManager;
  global.videoExportManager = new VideoExportManager();
  global.veaExportEngine = global.videoExportManager;
})(window);
