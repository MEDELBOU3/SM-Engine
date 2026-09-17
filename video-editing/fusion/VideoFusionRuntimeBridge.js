/**
 * VideoFusionRuntimeBridge.js
 * SM Engine — Fusion runtime bridge with GPU-first evaluation.
 *
 * Backend priority:
 *   WebGL2 GPU evaluator
 *       ↓ fallback
 *   Canvas2D CPU evaluator
 */
(function (global) {
  "use strict";

  class VideoFusionRuntimeBridge {
    constructor() {
      this.cpuEvaluator =
        global.ensureVideoFusionEvaluator?.() ||
        global.videoFusionEvaluator ||
        null;

      this.gpuEvaluator =
        global.ensureVideoFusionGPUEvaluator?.() ||
        global.videoFusionGPUEvaluator ||
        null;

      this.enabled = true;
      this.preferGPU = true;
      this.bound = false;
      this.lastBackend = "none";
      this.lastGraphId = null;

      this._beforeDraw = this._beforeDraw.bind(this);

      this._afterDraw = this._afterDraw.bind(this);

      this._graphChanged = this._graphChanged.bind(this);

      this.bind();
    }

    bind() {
      if (this.bound) {
        return;
      }

      this.bound = true;

      global.addEventListener("videoCompositionBeforeDraw", this._beforeDraw);

      global.addEventListener("videoCompositionAfterDraw", this._afterDraw);

      global.addEventListener("videoFusionGraphChanged", this._graphChanged);

      global.addEventListener(
        "videoFusionNodeParamChanged",
        this._graphChanged,
      );
    }

    unbind() {
      if (!this.bound) {
        return;
      }

      this.bound = false;

      global.removeEventListener(
        "videoCompositionBeforeDraw",
        this._beforeDraw,
      );

      global.removeEventListener("videoCompositionAfterDraw", this._afterDraw);

      global.removeEventListener("videoFusionGraphChanged", this._graphChanged);

      global.removeEventListener(
        "videoFusionNodeParamChanged",
        this._graphChanged,
      );
    }

    setEnabled(value) {
      this.enabled = !!value;

      this.requestRender();

      return this.enabled;
    }

    setPreferGPU(value) {
      this.preferGPU = !!value;

      this.requestRender();

      return this.preferGPU;
    }

    backendInfo() {
      const gpu = this.gpuEvaluator?.capabilities?.() || {
        webgl2: false,
      };

      return {
        enabled: this.enabled,

        preferGPU: this.preferGPU,

        active: this.lastBackend,

        graphId: this.lastGraphId,

        gpu,
      };
    }

    _beforeDraw(event) {
      if (!this.enabled) {
        return;
      }

      const detail = event?.detail || {};

      const { manager, item, clip, time } = detail;

      if (
        !manager ||
        !item ||
        !clip ||
        !["video", "image"].includes(item.mediaType)
      ) {
        return;
      }

      this.cpuEvaluator =
        global.ensureVideoFusionEvaluator?.() || this.cpuEvaluator;

      this.gpuEvaluator =
        global.ensureVideoFusionGPUEvaluator?.() || this.gpuEvaluator;

      const graph = this._graphForClip(clip);

      if (!graph) {
        return;
      }

      this._syncVisualSource(manager, item);

      let result = null;
      let backend = "cpu";

      if (
        this.preferGPU &&
        this.gpuEvaluator?.isAvailable?.() &&
        this.gpuEvaluator?.supportsGraph?.(graph)
      ) {
        result = this.gpuEvaluator.evaluateClip({
          clip,
          item,
          time,
          manager,
          graph,
        });

        if (result?.canvas) {
          backend = "gpu";
        }
      }

      if (!result?.canvas) {
        result = this.cpuEvaluator?.evaluateClip?.({
          clip,
          item,
          time,
          manager,
          graph,
        });

        backend = "cpu";
      }

      if (!result?.canvas) {
        return;
      }

      item._fusionVisualSource = result.canvas;

      item._fusionVisualWidth = result.width;

      item._fusionVisualHeight = result.height;

      item._fusionGraphId = result.graphId || graph.id;

      item._fusionBackend = backend;

      this._setBackend(backend, graph.id);
    }

    _afterDraw(event) {
      const item = event?.detail?.item;

      if (!item) {
        return;
      }

      item._fusionVisualSource = null;
      item._fusionVisualWidth = null;
      item._fusionVisualHeight = null;
      item._fusionGraphId = null;
      item._fusionBackend = null;
    }

    _graphForClip(clip) {
      return (
        this.gpuEvaluator?.graphForClip?.(clip) ||
        this.cpuEvaluator?.graphForClip?.(clip) ||
        null
      );
    }

    _syncVisualSource(manager, item) {
      if (item.mediaType === "video") {
        const video = item._video || manager._ensureVideoElement?.(item);

        if (!video) {
          return;
        }

        const targetTime = Number.isFinite(item._videoTargetTime)
          ? item._videoTargetTime
          : 0;

        const playbackRate = Number.isFinite(item._videoPlaybackRate)
          ? item._videoPlaybackRate
          : 1;

        const playing = !!global.sequencerManager?.state?.playing;

        if (playing) {
          manager._syncVideoPlayback?.(item, targetTime, playbackRate);
        } else {
          manager._syncVideoFrame?.(item, targetTime);
        }

        return;
      }

      if (item.mediaType === "image" && !item._img && item.src) {
        const image = new Image();

        if (!/^(blob:|data:)/i.test(item.src || "")) {
          image.crossOrigin = "anonymous";
        }

        image.onload = () => {
          item.mediaWidth = image.naturalWidth;

          item.mediaHeight = image.naturalHeight;

          this.requestRender();
        };

        image.onerror = () => {
          item._mediaError = "Image decode failed";
        };

        image.src = item.src;

        item._img = image;
      }
    }

    _graphChanged(event) {
      const graphId =
        event?.detail?.graph?.id ||
        event?.detail?.graph?.data?.id ||
        event?.detail?.detail?.graph?.id ||
        null;

      this.cpuEvaluator =
        global.ensureVideoFusionEvaluator?.() || this.cpuEvaluator;

      this.cpuEvaluator?.invalidate?.(graphId);

      /*
       * GPU targets are intentionally reusable; graph changes only change the
       * shader uniforms/links and will overwrite those targets next frame.
       */
      this.requestRender();
    }

    _setBackend(backend, graphId) {
      if (this.lastBackend === backend && this.lastGraphId === graphId) {
        return;
      }

      this.lastBackend = backend;

      this.lastGraphId = graphId;

      try {
        global.dispatchEvent(
          new CustomEvent("videoFusionBackendChanged", {
            detail: {
              backend,
              graphId,
              gpu: this.gpuEvaluator?.capabilities?.() || null,
            },
          }),
        );
      } catch (_) {}
    }

    requestRender() {
      const manager = global.videoEditingManager;

      if (!manager?.active) {
        return;
      }

      const time =
        global.sequencerManager?.state?.playhead ?? manager.currentTime ?? 0;

      requestAnimationFrame(() => {
        manager.renderCompositeAt?.(time);
      });
    }
  }

  global.VideoFusionRuntimeBridge = VideoFusionRuntimeBridge;

  global.ensureVideoFusionRuntimeBridge =
    function ensureVideoFusionRuntimeBridge() {
      if (!global.videoFusionRuntimeBridge) {
        global.videoFusionRuntimeBridge = new VideoFusionRuntimeBridge();
      }

      return global.videoFusionRuntimeBridge;
    };

  global.ensureVideoFusionRuntimeBridge();
})(window);
