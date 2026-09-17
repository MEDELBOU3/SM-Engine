/**
 * VideoFusionGPUEvaluator.js
 * SM Engine — WebGL2 evaluator for Fusion clip graphs.
 *
 * Supported live GPU nodes:
 * MediaIn, MediaOut, Transform, Crop, ColorCorrect,
 * BrightnessContrast, HueSaturation, Tint, Invert,
 * Blur, Sharpen, Glow, ChromaKey,
 * MaskRectangle, MaskEllipse, Merge, Background, AlphaMultiply.
 */
(function (global) {
  "use strict";

  class VideoFusionGPUEvaluator {
    constructor(project = null, library = null, gpu = null) {
      this.project = project || global.videoProject || null;

      this.library = library || global.videoNodeLibrary || null;

      this.gpu = gpu || global.ensureVideoFusionGPUContext?.() || null;

      this.supportedNodes = new Set([
        "MediaIn",
        "MediaOut",
        "Transform",
        "Crop",
        "ColorCorrect",
        "BrightnessContrast",
        "HueSaturation",
        "Tint",
        "Invert",
        "Blur",
        "Sharpen",
        "Glow",
        "ChromaKey",
        "MaskRectangle",
        "MaskEllipse",
        "Merge",
        "Background",
        "AlphaMultiply",
      ]);

      this.maxPreviewDimension = 2048;
      this.maxExportDimension = 4096;
      this.lastBackendError = null;
    }

    setProject(project) {
      this.project = project || this.project;

      return this;
    }

    setLibrary(library) {
      this.library = library || this.library;

      return this;
    }

    isAvailable() {
      return !!this.gpu?.isAvailable?.();
    }

    capabilities() {
      return (
        this.gpu?.capabilities?.() || {
          webgl2: false,
        }
      );
    }

    graphForClip(clipOrId) {
      const clipId = typeof clipOrId === "string" ? clipOrId : clipOrId?.id;

      if (!clipId) {
        return null;
      }

      const graphs =
        this.project?.fusion?.graphs ||
        this.project?.state?.fusion?.graphs ||
        {};

      return (
        Object.values(graphs).find((graph) => graph?.clipId === clipId) || null
      );
    }

    supportsGraph(graph) {
      if (!graph || !Array.isArray(graph.nodes)) {
        return false;
      }

      return graph.nodes.every(
        (node) => node.enabled === false || this.supportedNodes.has(node.type),
      );
    }

    evaluateClip({ clip, item, time = 0, manager = null, graph = null } = {}) {
      if (
        !this.isAvailable() ||
        !clip ||
        !item ||
        !["video", "image"].includes(item.mediaType)
      ) {
        return null;
      }

      graph = graph || this.graphForClip(clip);

      if (!graph || !graph.nodes?.length || !this.supportsGraph(graph)) {
        return null;
      }

      const source = this._sourceForItem(item, manager);

      if (!source) {
        return null;
      }

      const naturalWidth = Math.max(
        1,
        Number(
          source.videoWidth ||
            source.naturalWidth ||
            source.width ||
            item.mediaWidth ||
            manager?.resolution?.w ||
            1280,
        ),
      );

      const naturalHeight = Math.max(
        1,
        Number(
          source.videoHeight ||
            source.naturalHeight ||
            source.height ||
            item.mediaHeight ||
            manager?.resolution?.h ||
            720,
        ),
      );

      const exporting = !!manager?._renderTargetTransform;

      const maxDimension = exporting
        ? this.maxExportDimension
        : this.maxPreviewDimension;

      const size = this._limitDimensions(
        naturalWidth,
        naturalHeight,
        maxDimension,
      );

      const gpuCaps = this.capabilities();

      if (
        gpuCaps.maxTextureSize &&
        (size.width > gpuCaps.maxTextureSize ||
          size.height > gpuCaps.maxTextureSize)
      ) {
        return null;
      }

      this.gpu.beginFrame(size.width, size.height);

      const sourceResult = this.gpu.uploadSource(
        `clip:${clip.id}`,
        source,
        size.width,
        size.height,
      );

      if (!sourceResult) {
        return null;
      }

      const context = {
        graph,
        clip,
        item,
        manager,
        source: sourceResult,

        width: size.width,

        height: size.height,

        time: Number(time) || 0,

        memo: new Map(),

        stack: new Set(),

        linkMap: this._buildLinkMap(graph),
      };

      const outputNode = this._findOutputNode(graph);

      if (!outputNode) {
        return null;
      }

      let result = null;

      try {
        result = this._evaluateNode(outputNode, context);

        if (!result?.texture) {
          return null;
        }

        const canvas = this.gpu.present(
          result.texture,
          result.width || context.width,
          result.height || context.height,
        );

        this.gpu.endFrame();

        if (!canvas) {
          return null;
        }

        this.lastBackendError = null;

        return {
          canvas,

          width: canvas.width,

          height: canvas.height,

          graphId: graph.id,

          clipId: clip.id,

          time: context.time,

          nodeId: outputNode.id,

          backend: "gpu",
        };
      } catch (error) {
        this.lastBackendError = error;

        console.warn(
          "[VideoFusionGPU] Falling back from GPU graph evaluation:",
          error,
        );

        this.gpu.endFrame();

        return null;
      }
    }

    _evaluateNode(node, context) {
      if (!node) {
        return null;
      }

      if (context.memo.has(node.id)) {
        return context.memo.get(node.id);
      }

      if (context.stack.has(node.id)) {
        throw new Error(
          `Fusion graph cycle detected at ${node.title || node.id}`,
        );
      }

      context.stack.add(node.id);

      let result = null;

      if (node.enabled === false) {
        result = this._firstImageInput(node, context) || context.source;
      } else {
        const method = `_eval${node.type}`;

        if (typeof this[method] !== "function") {
          throw new Error(`Unsupported GPU Fusion node: ${node.type}`);
        }

        result = this[method](node, context);
      }

      context.stack.delete(node.id);

      if (result) {
        context.memo.set(node.id, result);
      }

      return result;
    }

    _evalMediaIn(node, context) {
      return context.source;
    }

    _evalMediaOut(node, context) {
      return this._input(node, "Image", context) || context.source;
    }

    _evalTransform(node, context) {
      const input = this._input(node, "Image", context);

      if (!input?.texture) {
        return null;
      }

      const p = node.params || {};

      const size = Math.max(0.00001, Number(p.size ?? 1));

      const aspect = Math.max(0.01, Number(p.aspect ?? 1));

      const sx = size * aspect * (p.flipX ? -1 : 1);

      const sy = (size / aspect) * (p.flipY ? -1 : 1);

      return this._pass(
        node,
        context,
        "transform",
        {
          uImage: input,
        },
        {
          uCenter: [
            this._clamp(Number(p.centerX ?? 0.5), 0, 1),

            this._clamp(Number(p.centerY ?? 0.5), 0, 1),
          ],

          uOffset: [Number(p.offsetX || 0), -Number(p.offsetY || 0)],

          uScale: [sx, sy],

          uAngle: (-Number(p.angle || 0) * Math.PI) / 180,
        },
      );
    }

    _evalCrop(node, context) {
      const input = this._input(node, "Image", context);

      if (!input?.texture) {
        return null;
      }

      const p = node.params || {};

      return this._pass(
        node,
        context,
        "crop",
        {
          uImage: input,
        },
        {
          uCrop: [
            this._clamp(Number(p.left || 0), 0, 1),

            this._clamp(Number(p.right || 0), 0, 1),

            this._clamp(Number(p.top || 0), 0, 1),

            this._clamp(Number(p.bottom || 0), 0, 1),
          ],

          uFeather: this._clamp(Number(p.feather || 0), 0, 0.5),
        },
      );
    }

    _evalColorCorrect(node, context) {
      const input = this._input(node, "Image", context);

      if (!input?.texture) {
        return null;
      }

      const p = node.params || {};

      return this._pass(
        node,
        context,
        "colorCorrect",
        {
          uImage: input,
        },
        {
          uLift: Number(p.lift || 0),

          uGamma: Math.max(0.01, Number(p.gamma ?? 1)),

          uGain: Math.max(0, Number(p.gain ?? 1)),

          uSaturation: Math.max(0, Number(p.saturation ?? 1)),

          uHue: Number(p.hue || 0),
        },
      );
    }

    _evalBrightnessContrast(node, context) {
      const input = this._input(node, "Image", context);

      if (!input?.texture) {
        return null;
      }

      return this._pass(
        node,
        context,
        "brightnessContrast",
        {
          uImage: input,
        },
        {
          uBrightness: Number(node.params?.brightness || 0),

          uContrast: Math.max(0, Number(node.params?.contrast ?? 1)),
        },
      );
    }

    _evalHueSaturation(node, context) {
      const input = this._input(node, "Image", context);

      if (!input?.texture) {
        return null;
      }

      return this._pass(
        node,
        context,
        "hueSaturation",
        {
          uImage: input,
        },
        {
          uHue: Number(node.params?.hue || 0),

          uSaturation: Math.max(0, Number(node.params?.saturation ?? 1)),
        },
      );
    }

    _evalTint(node, context) {
      const input = this._input(node, "Image", context);

      if (!input?.texture) {
        return null;
      }

      return this._pass(
        node,
        context,
        "tint",
        {
          uImage: input,
        },
        {
          uTint: this._hexToRgb01(node.params?.color || "#ff9a66"),

          uAmount: this._clamp(Number(node.params?.amount ?? 0.25), 0, 1),
        },
      );
    }

    _evalInvert(node, context) {
      const input = this._input(node, "Image", context);

      if (!input?.texture) {
        return null;
      }

      return this._pass(
        node,
        context,
        "invert",
        {
          uImage: input,
        },
        {
          uAmount: this._clamp(Number(node.params?.amount ?? 1), 0, 1),
        },
      );
    }

    _evalBlur(node, context) {
      const input = this._input(node, "Image", context);

      if (!input?.texture) {
        return null;
      }

      const radius = Math.max(0, Number(node.params?.size || 0));

      const mix = this._clamp(Number(node.params?.mix ?? 1), 0, 1);

      if (radius <= 0.001) {
        return input;
      }

      const horizontal = this._pass(
        node,
        context,
        "blur",
        {
          uImage: input,
        },
        {
          uTexel: [1 / context.width, 1 / context.height],

          uDirection: [1, 0],

          uRadius: Math.max(0.25, radius / 6),
        },
        `${node.id}:blur-h`,
      );

      const vertical = this._pass(
        node,
        context,
        "blur",
        {
          uImage: horizontal,
        },
        {
          uTexel: [1 / context.width, 1 / context.height],

          uDirection: [0, 1],

          uRadius: Math.max(0.25, radius / 6),
        },
        `${node.id}:blur-v`,
      );

      if (mix >= 0.999) {
        return vertical;
      }

      return this._pass(
        node,
        context,
        "mix",
        {
          uA: input,

          uB: vertical,
        },
        {
          uMix: mix,
        },
      );
    }

    _evalSharpen(node, context) {
      const input = this._input(node, "Image", context);

      if (!input?.texture) {
        return null;
      }

      return this._pass(
        node,
        context,
        "sharpen",
        {
          uImage: input,
        },
        {
          uTexel: [1 / context.width, 1 / context.height],

          uAmount: this._clamp(Number(node.params?.amount ?? 0.35), 0, 2),
        },
      );
    }

    _evalGlow(node, context) {
      const input = this._input(node, "Image", context);

      if (!input?.texture) {
        return null;
      }

      const radius = Math.max(0.1, Number(node.params?.radius || 18));

      const horizontal = this._pass(
        node,
        context,
        "blur",
        {
          uImage: input,
        },
        {
          uTexel: [1 / context.width, 1 / context.height],

          uDirection: [1, 0],

          uRadius: Math.max(0.25, radius / 7),
        },
        `${node.id}:glow-h`,
      );

      const vertical = this._pass(
        node,
        context,
        "blur",
        {
          uImage: horizontal,
        },
        {
          uTexel: [1 / context.width, 1 / context.height],

          uDirection: [0, 1],

          uRadius: Math.max(0.25, radius / 7),
        },
        `${node.id}:glow-v`,
      );

      return this._pass(
        node,
        context,
        "glow",
        {
          uOriginal: input,

          uBlur: vertical,
        },
        {
          uGain: Math.max(0, Number(node.params?.gain ?? 0.6)),

          uMix: this._clamp(Number(node.params?.mix ?? 0.5), 0, 1),
        },
      );
    }

    _evalChromaKey(node, context) {
      const input = this._input(node, "Image", context);

      if (!input?.texture) {
        return null;
      }

      return this._pass(
        node,
        context,
        "chromaKey",
        {
          uImage: input,
        },
        {
          uKeyColor: this._hexToRgb01(node.params?.keyColor || "#00ff00"),

          uThreshold: this._clamp(Number(node.params?.threshold ?? 0.24), 0, 1),

          uSoftness: Math.max(0.0001, Number(node.params?.softness ?? 0.12)),

          uSpill: this._clamp(Number(node.params?.spill ?? 0.35), 0, 1),
        },
      );
    }

    _evalMaskRectangle(node, context) {
      return this._pass(
        node,
        context,
        "maskRectangle",
        {},
        {
          uCenter: [
            this._clamp(Number(node.params?.centerX ?? 0.5), 0, 1),

            1 - this._clamp(Number(node.params?.centerY ?? 0.5), 0, 1),
          ],

          uSize: [
            this._clamp(Number(node.params?.width ?? 0.5), 0, 1),

            this._clamp(Number(node.params?.height ?? 0.5), 0, 1),
          ],

          uSoftness: this._clamp(Number(node.params?.softness || 0), 0, 0.5),

          uInvert: node.params?.invert ? 1 : 0,
        },
        null,
        "mask",
      );
    }

    _evalMaskEllipse(node, context) {
      return this._pass(
        node,
        context,
        "maskEllipse",
        {},
        {
          uCenter: [
            this._clamp(Number(node.params?.centerX ?? 0.5), 0, 1),

            1 - this._clamp(Number(node.params?.centerY ?? 0.5), 0, 1),
          ],

          uSize: [
            this._clamp(Number(node.params?.width ?? 0.5), 0, 1),

            this._clamp(Number(node.params?.height ?? 0.5), 0, 1),
          ],

          uSoftness: this._clamp(Number(node.params?.softness || 0), 0, 0.5),

          uInvert: node.params?.invert ? 1 : 0,
        },
        null,
        "mask",
      );
    }

    _evalMerge(node, context) {
      const background = this._input(node, "Background", context);

      const foreground = this._input(node, "Foreground", context);

      if (!background?.texture && !foreground?.texture) {
        return null;
      }

      if (!background?.texture) {
        return foreground;
      }

      if (!foreground?.texture) {
        return background;
      }

      const mask = this._input(node, "Mask", context);

      return this._pass(
        node,
        context,
        "merge",
        {
          uBackground: background,

          uForeground: foreground,

          /*
           * WebGL requires a valid texture bound to every sampler used by a shader.
           * When there is no mask, bind the foreground texture and set uHasMask=0.
           */
          uMask: mask || foreground,
        },
        {
          uHasMask: mask?.texture ? 1 : 0,

          uBlend: this._clamp(Number(node.params?.blend ?? 1), 0, 1),

          uMode: this._blendModeIndex(node.params?.mode || "Normal"),
        },
      );
    }

    _evalBackground(node, context) {
      return this._pass(
        node,
        context,
        "background",
        {},
        {
          uColor: this._hexToRgb01(node.params?.color || "#202020"),

          uAlpha: this._clamp(Number(node.params?.alpha ?? 1), 0, 1),
        },
      );
    }

    _evalAlphaMultiply(node, context) {
      const input = this._input(node, "Image", context);

      if (!input?.texture) {
        return null;
      }

      return this._pass(
        node,
        context,
        "alphaMultiply",
        {
          uImage: input,
        },
        {
          uAlpha: this._clamp(Number(node.params?.alpha ?? 1), 0, 1),
        },
      );
    }

    _pass(
      node,
      context,
      shader,
      textures = {},
      uniforms = {},
      targetKey = null,
      kind = "image",
    ) {
      const key = `graph:${context.graph.id}:${targetKey || node.id}`;

      const target = this.gpu.getTarget(key, context.width, context.height);

      this.gpu.render({
        shader,
        target,
        textures,
        uniforms,
      });

      return {
        texture: target.texture,

        target,

        width: target.width,

        height: target.height,

        kind,
      };
    }

    _input(node, socketName, context) {
      const link = context.linkMap.get(`${node.id}:${socketName}`);

      if (!link) {
        return null;
      }

      const upstream = context.graph.nodes.find(
        (candidate) => candidate.id === link.fromNode,
      );

      return this._evaluateNode(upstream, context);
    }

    _firstImageInput(node, context) {
      for (const input of node.inputs || []) {
        if (input.type !== "image") {
          continue;
        }

        const result = this._input(node, input.name, context);

        if (result?.texture) {
          return result;
        }
      }

      return null;
    }

    _buildLinkMap(graph) {
      const map = new Map();

      (graph.links || []).forEach((link) => {
        map.set(`${link.toNode}:${link.toSocket}`, link);
      });

      return map;
    }

    _findOutputNode(graph) {
      return (
        graph.nodes.find(
          (node) => node.type === "MediaOut" && node.enabled !== false,
        ) ||
        graph.nodes.find((node) => node.type === "MediaOut") ||
        graph.nodes[graph.nodes.length - 1] ||
        null
      );
    }

    _sourceForItem(item, manager) {
      if (item.mediaType === "image") {
        if (item._img?.complete && item._img.naturalWidth) {
          return item._img;
        }

        return null;
      }

      if (item.mediaType === "video") {
        const video = item._video || manager?._ensureVideoElement?.(item);

        if (
          video &&
          video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
          video.videoWidth > 0
        ) {
          return video;
        }
      }

      return null;
    }

    _limitDimensions(width, height, maxDimension) {
      width = Math.max(1, Number(width) || 1);

      height = Math.max(1, Number(height) || 1);

      const largest = Math.max(width, height);

      if (largest <= maxDimension) {
        return {
          width: Math.round(width),

          height: Math.round(height),
        };
      }

      const scale = maxDimension / largest;

      return {
        width: Math.max(1, Math.round(width * scale)),

        height: Math.max(1, Math.round(height * scale)),
      };
    }

    _blendModeIndex(mode) {
      return (
        {
          Normal: 0,
          Add: 1,
          Multiply: 2,
          Screen: 3,
          Overlay: 4,
          Darken: 5,
          Lighten: 6,
          Difference: 7,
        }[mode] ?? 0
      );
    }

    _hexToRgb01(hex) {
      let value = String(hex || "#ffffff").replace("#", "");

      if (value.length === 3) {
        value = value
          .split("")
          .map((char) => char + char)
          .join("");
      }

      const number = parseInt(value, 16);

      if (!Number.isFinite(number)) {
        return [1, 1, 1];
      }

      return [
        ((number >> 16) & 255) / 255,

        ((number >> 8) & 255) / 255,

        (number & 255) / 255,
      ];
    }

    _clamp(value, min, max) {
      return Math.max(min, Math.min(max, value));
    }
  }

  global.VideoFusionGPUEvaluator = VideoFusionGPUEvaluator;

  global.ensureVideoFusionGPUEvaluator =
    function ensureVideoFusionGPUEvaluator() {
      if (!global.videoFusionGPUEvaluator) {
        global.videoFusionGPUEvaluator = new VideoFusionGPUEvaluator(
          global.videoProject,
          global.videoNodeLibrary,
          global.ensureVideoFusionGPUContext?.(),
        );
      }

      global.videoFusionGPUEvaluator
        .setProject(global.videoProject)
        .setLibrary(global.videoNodeLibrary);

      return global.videoFusionGPUEvaluator;
    };

  global.ensureVideoFusionGPUEvaluator();
})(window);
