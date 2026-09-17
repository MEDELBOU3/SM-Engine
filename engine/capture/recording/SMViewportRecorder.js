(function () {
  "use strict";

  class SMViewportRecorder {
    constructor(options = {}) {
      this.options = {
        fps: 60,
        mimeType: "",
        videoBitsPerSecond: 12000000,
        includeAudio: false,
        ...options,
      };

      this.canvas = options.canvas || window.renderer?.domElement || null;

      this.stream = null;
      this.borrowedTracks = new Set();
      this.mediaRecorder = null;
      this.chunks = [];

      this.state = "idle";
      this.startedAt = 0;
      this.stoppedAt = 0;

      this.listeners = new Map();
    }

    on(event, callback) {
      if (typeof callback !== "function") return () => {};

      if (!this.listeners.has(event)) {
        this.listeners.set(event, new Set());
      }

      this.listeners.get(event).add(callback);

      return () => {
        this.listeners.get(event)?.delete(callback);
      };
    }

    emit(event, detail = {}) {
      const callbacks = this.listeners.get(event);

      if (callbacks) {
        for (const callback of callbacks) {
          try {
            callback(detail);
          } catch (error) {
            console.error("[SMViewportRecorder]", error);
          }
        }
      }

      window.dispatchEvent?.(
        new CustomEvent(`sm:viewport-recorder-${event}`, {
          detail,
        }),
      );
    }

    isSupported() {
      return !!(this.canvas?.captureStream && window.MediaRecorder);
    }

    _pickMimeType(preferred = "") {
      const candidates = [
        preferred,
        "video/webm;codecs=vp9,opus",
        "video/webm;codecs=vp8,opus",
        "video/webm;codecs=vp9",
        "video/webm;codecs=vp8",
        "video/webm",
      ].filter(Boolean);

      for (const type of candidates) {
        if (
          !window.MediaRecorder?.isTypeSupported ||
          MediaRecorder.isTypeSupported(type)
        ) {
          return type;
        }
      }

      return "";
    }

    _mergeAudioTracks(targetStream, audioStream) {
      if (!targetStream || !audioStream) return;

      for (const track of audioStream.getAudioTracks?.() || []) {
        const mergedTrack = track.clone?.() || track;
        if (mergedTrack === track) this.borrowedTracks.add(track);
        targetStream.addTrack(mergedTrack);
      }
    }

    async start(options = {}) {
      if (this.state === "recording") {
        return this;
      }

      const merged = {
        ...this.options,
        ...options,
      };

      if (!this.canvas) {
        this.canvas = merged.canvas || window.renderer?.domElement || null;
      }

      if (!this.isSupported()) {
        throw new Error(
          "Viewport recording requires canvas.captureStream() and MediaRecorder.",
        );
      }

      const fps = Math.max(1, Number(merged.fps) || 60);

      this.stream = this.canvas.captureStream(fps);
      this.borrowedTracks.clear();

      if (merged.includeAudio && merged.audioStream) {
        this._mergeAudioTracks(this.stream, merged.audioStream);
      }

      const mimeType = this._pickMimeType(merged.mimeType);

      const recorderOptions = {};

      if (mimeType) {
        recorderOptions.mimeType = mimeType;
      }

      if (merged.videoBitsPerSecond) {
        recorderOptions.videoBitsPerSecond = Number(merged.videoBitsPerSecond);
      }

      this.chunks = [];

      this.mediaRecorder = new MediaRecorder(this.stream, recorderOptions);

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          this.chunks.push(event.data);
        }
      };

      this.mediaRecorder.onerror = (event) => {
        this.state = "error";

        this.emit("error", {
          error: event.error || event,
        });
      };

      this.mediaRecorder.onstart = () => {
        this.state = "recording";
        this.startedAt = performance.now();

        this.emit("start", {
          mimeType: this.mediaRecorder.mimeType,
          startedAt: this.startedAt,
        });
      };

      this.mediaRecorder.start(Math.max(100, Number(merged.timeslice) || 1000));

      return this;
    }

    async stop() {
      if (!this.mediaRecorder || this.mediaRecorder.state === "inactive") {
        return null;
      }

      return new Promise((resolve, reject) => {
        const recorder = this.mediaRecorder;

        recorder.onstop = () => {
          this.stoppedAt = performance.now();

          this.state = "stopped";

          const type =
            recorder.mimeType || this._pickMimeType() || "video/webm";

          const blob = new Blob(this.chunks, { type });

          const result = {
            blob,
            mimeType: type,
            duration: Math.max(0, this.stoppedAt - this.startedAt) / 1000,
            size: blob.size,
          };

          this.emit("stop", result);

          this._cleanupStream();

          resolve(result);
        };

        recorder.onerror = (event) => {
          reject(event.error || event);
        };

        recorder.stop();
      });
    }

    pause() {
      if (this.mediaRecorder?.state === "recording") {
        this.mediaRecorder.pause();
        this.state = "paused";

        this.emit("pause", {});
        return true;
      }

      return false;
    }

    resume() {
      if (this.mediaRecorder?.state === "paused") {
        this.mediaRecorder.resume();
        this.state = "recording";

        this.emit("resume", {});
        return true;
      }

      return false;
    }

    getElapsedTime() {
      if (!this.startedAt) return 0;

      const end =
        this.state === "recording" || this.state === "paused"
          ? performance.now()
          : this.stoppedAt;

      return Math.max(0, end - this.startedAt) / 1000;
    }

    _cleanupStream() {
      if (this.stream) {
        for (const track of this.stream.getTracks()) {
          if (this.borrowedTracks.has(track)) {
            this.stream.removeTrack?.(track);
            continue;
          }
          try {
            track.stop();
          } catch (_) {}
        }
      }

      this.stream = null;
      this.mediaRecorder = null;
      this.borrowedTracks.clear();
    }

    destroy() {
      if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
        try {
          this.mediaRecorder.stop();
        } catch (_) {}
      }

      this._cleanupStream();

      this.chunks.length = 0;
      this.listeners.clear();

      this.state = "destroyed";
    }
  }

  window.SMViewportRecorder = SMViewportRecorder;
})();
