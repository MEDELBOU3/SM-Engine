/**
 * VideoFusionEvaluator.js
 * SM Engine — live Canvas2D Fusion compositor.
 *
 * Evaluates the graph attached to a timeline clip and returns a visual source
 * canvas consumed by VideoEditingManager.
 *
 * Phase 11 is a real working CPU/Canvas2D compositor. It is intentionally
 * structured so the same graph can later be evaluated by WebGL/WebGPU.
 */
(function (global) {
  "use strict";

  class VideoFusionEvaluator {
    constructor(project = null, library = null) {
      this.project = project || global.videoProject || null;

      this.library = library || global.videoNodeLibrary || null;

      this.canvasPool = new Map();

      this.graphRevision = new Map();

      this.frameCache = new Map();

      this.maxDimension = 4096;
    }

    setProject(project) {
      this.project = project || this.project;

      return this;
    }

    setLibrary(library) {
      this.library = library || this.library;

      return this;
    }

    invalidate(graphId = null) {
      if (graphId) {
        this.graphRevision.set(
          graphId,
          (this.graphRevision.get(graphId) || 0) + 1,
        );

        this.frameCache.delete(graphId);

        return;
      }

      this.frameCache.clear();
      this.graphRevision.clear();
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

    hasGraphForClip(clipOrId) {
      return !!this.graphForClip(clipOrId);
    }

    evaluateClip({ clip, item, time = 0, manager = null, graph = null } = {}) {
      if (!clip || !item || !["video", "image"].includes(item.mediaType)) {
        return null;
      }

      graph = graph || this.graphForClip(clip);

      if (!graph || !Array.isArray(graph.nodes) || !graph.nodes.length) {
        return null;
      }

      const source = this._sourceForItem(item, manager);

      if (!source) {
        return null;
      }

      const sourceWidth = Math.max(
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

      const sourceHeight = Math.max(
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

      const size = this._limitDimensions(sourceWidth, sourceHeight);

      const context = {
        graph,
        clip,
        item,
        time: Number(time) || 0,

        manager,

        source,

        width: size.width,

        height: size.height,

        memo: new Map(),

        stack: new Set(),

        linkMap: this._buildInputLinkMap(graph),
      };

      const outputNode = this._findOutputNode(graph);

      if (!outputNode) {
        return null;
      }

      const result = this._evaluateNode(outputNode, context);

      if (!result?.canvas) {
        return null;
      }

      return {
        canvas: result.canvas,

        width: result.canvas.width,

        height: result.canvas.height,

        graphId: graph.id,

        clipId: clip.id,

        time: context.time,

        nodeId: outputNode.id,
      };
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

    _buildInputLinkMap(graph) {
      const map = new Map();

      (graph.links || []).forEach((link) => {
        map.set(`${link.toNode}:${link.toSocket}`, link);
      });

      return map;
    }

    _findOutputNode(graph) {
      const enabled = (graph.nodes || []).filter(
        (node) => node.enabled !== false,
      );

      return (
        enabled.find((node) => node.type === "MediaOut") ||
        enabled[enabled.length - 1] ||
        null
      );
    }

    _evaluateNode(node, context) {
      if (!node) {
        return null;
      }

      if (context.memo.has(node.id)) {
        return context.memo.get(node.id);
      }

      if (context.stack.has(node.id)) {
        console.warn(
          "[VideoFusionEvaluator] Cycle detected at node:",
          node.title || node.id,
        );

        return null;
      }

      context.stack.add(node.id);

      let result = null;

      try {
        if (node.enabled === false) {
          result =
            this._firstImageInput(node, context) ||
            this._mediaIn(node, context);
        } else {
          const method = `_eval${node.type}`;

          if (typeof this[method] === "function") {
            result = this[method](node, context);
          } else {
            result = this._firstImageInput(node, context);
          }
        }
      } catch (error) {
        console.error(`[VideoFusionEvaluator] ${node.type} failed:`, error);

        result = this._firstImageInput(node, context);
      }

      context.stack.delete(node.id);

      if (result) {
        context.memo.set(node.id, result);
      }

      return result;
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

        if (result?.canvas) {
          return result;
        }
      }

      return null;
    }

    _mediaIn(node, context) {
      const canvas = this._canvas(
        context.graph.id,
        node.id,
        context.width,
        context.height,
      );

      const ctx = canvas.getContext("2d", {
        alpha: true,
        desynchronized: true,
      });

      this._resetContext(ctx, canvas);

      ctx.imageSmoothingEnabled = true;

      if ("imageSmoothingQuality" in ctx) {
        ctx.imageSmoothingQuality = "high";
      }

      ctx.drawImage(context.source, 0, 0, canvas.width, canvas.height);

      return {
        canvas,
        kind: "image",
      };
    }

    _evalMediaIn(node, context) {
      return this._mediaIn(node, context);
    }

    _evalMediaOut(node, context) {
      return (
        this._input(node, "Image", context) || this._mediaIn(node, context)
      );
    }

    _evalTransform(node, context) {
      const input = this._input(node, "Image", context);

      if (!input?.canvas) {
        return null;
      }

      const source = input.canvas;

      const canvas = this._canvas(
        context.graph.id,
        node.id,
        source.width,
        source.height,
      );

      const ctx = canvas.getContext("2d");

      this._resetContext(ctx, canvas);

      const p = node.params || {};

      const centerX = this._clamp(Number(p.centerX ?? 0.5), 0, 1);

      const centerY = this._clamp(Number(p.centerY ?? 0.5), 0, 1);

      const pivotX = centerX * canvas.width;

      const pivotY = centerY * canvas.height;

      const offsetX = Number(p.offsetX || 0) * canvas.width;

      const offsetY = Number(p.offsetY || 0) * canvas.height;

      const size = Math.max(0, Number(p.size ?? 1));

      const aspect = Math.max(0.01, Number(p.aspect ?? 1));

      const sx = size * aspect * (p.flipX ? -1 : 1);

      const sy = (size / aspect) * (p.flipY ? -1 : 1);

      const angle = (Number(p.angle || 0) * Math.PI) / 180;

      ctx.save();

      ctx.translate(pivotX + offsetX, pivotY + offsetY);

      ctx.rotate(angle);

      ctx.scale(sx, sy);

      ctx.translate(-pivotX, -pivotY);

      ctx.drawImage(source, 0, 0);

      ctx.restore();

      return {
        canvas,
        kind: "image",
      };
    }

    _evalCrop(node, context) {
      const input = this._input(node, "Image", context);

      if (!input?.canvas) {
        return null;
      }

      const source = input.canvas;

      const canvas = this._canvas(
        context.graph.id,
        node.id,
        source.width,
        source.height,
      );

      const ctx = canvas.getContext("2d");

      this._resetContext(ctx, canvas);

      const p = node.params || {};

      const left = this._clamp(Number(p.left || 0), 0, 1);

      const right = this._clamp(Number(p.right || 0), 0, 1);

      const top = this._clamp(Number(p.top || 0), 0, 1);

      const bottom = this._clamp(Number(p.bottom || 0), 0, 1);

      const x = left * source.width;

      const y = top * source.height;

      const w = Math.max(0, source.width * (1 - left - right));

      const h = Math.max(0, source.height * (1 - top - bottom));

      if (w > 0 && h > 0) {
        ctx.drawImage(source, x, y, w, h, x, y, w, h);
      }

      return {
        canvas,
        kind: "image",
      };
    }

    _evalColorCorrect(node, context) {
      const input = this._input(node, "Image", context);

      if (!input?.canvas) {
        return null;
      }

      const p = node.params || {};

      const lift = Number(p.lift || 0);

      const gamma = Math.max(0.1, Number(p.gamma ?? 1));

      const gain = Math.max(0, Number(p.gain ?? 1));

      const saturation = Math.max(0, Number(p.saturation ?? 1));

      const hue = Number(p.hue || 0);

      const canvas = this._filterCopy(
        context,
        node,
        input.canvas,
        [
          `brightness(${Math.max(0, gain) * 100}%)`,
          `contrast(${Math.max(0.05, 1 / gamma) * 100}%)`,
          `saturate(${saturation * 100}%)`,
          `hue-rotate(${hue}deg)`,
        ].join(" "),
      );

      if (Math.abs(lift) > 0.0001) {
        const ctx = canvas.getContext("2d");

        ctx.save();

        ctx.globalCompositeOperation = lift >= 0 ? "screen" : "multiply";

        ctx.globalAlpha = Math.min(1, Math.abs(lift));

        ctx.fillStyle = lift >= 0 ? "#ffffff" : "#000000";

        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.restore();
      }

      return {
        canvas,
        kind: "image",
      };
    }

    _evalBrightnessContrast(node, context) {
      const input = this._input(node, "Image", context);

      if (!input?.canvas) {
        return null;
      }

      const p = node.params || {};

      const brightness = 1 + Number(p.brightness || 0);

      const contrast = Math.max(0, Number(p.contrast ?? 1));

      return {
        canvas: this._filterCopy(
          context,
          node,
          input.canvas,
          `brightness(${Math.max(0, brightness) * 100}%) contrast(${contrast * 100}%)`,
        ),

        kind: "image",
      };
    }

    _evalHueSaturation(node, context) {
      const input = this._input(node, "Image", context);

      if (!input?.canvas) {
        return null;
      }

      const p = node.params || {};

      return {
        canvas: this._filterCopy(
          context,
          node,
          input.canvas,
          `hue-rotate(${Number(p.hue || 0)}deg) saturate(${Math.max(0, Number(p.saturation ?? 1)) * 100}%)`,
        ),

        kind: "image",
      };
    }

    _evalTint(node, context) {
      const input = this._input(node, "Image", context);

      if (!input?.canvas) {
        return null;
      }

      const source = input.canvas;

      const canvas = this._copyCanvas(context, node, source);

      const ctx = canvas.getContext("2d");

      const amount = this._clamp(Number(node.params?.amount ?? 0.25), 0, 1);

      ctx.save();
      ctx.globalCompositeOperation = "color";
      ctx.globalAlpha = amount;
      ctx.fillStyle = node.params?.color || "#ff9a66";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.restore();

      return {
        canvas,
        kind: "image",
      };
    }

    _evalInvert(node, context) {
      const input = this._input(node, "Image", context);

      if (!input?.canvas) {
        return null;
      }

      const amount = this._clamp(Number(node.params?.amount ?? 1), 0, 1);

      return {
        canvas: this._filterCopy(
          context,
          node,
          input.canvas,
          `invert(${amount * 100}%)`,
        ),

        kind: "image",
      };
    }

    _evalBlur(node, context) {
      const input = this._input(node, "Image", context);

      if (!input?.canvas) {
        return null;
      }

      const source = input.canvas;

      const canvas = this._canvas(
        context.graph.id,
        node.id,
        source.width,
        source.height,
      );

      const ctx = canvas.getContext("2d");

      this._resetContext(ctx, canvas);

      const size = Math.max(0, Number(node.params?.size || 0));

      const mix = this._clamp(Number(node.params?.mix ?? 1), 0, 1);

      if (mix < 1) {
        ctx.globalAlpha = 1 - mix;

        ctx.drawImage(source, 0, 0);
      }

      ctx.save();
      ctx.globalAlpha = mix;
      ctx.filter = `blur(${size}px)`;

      /*
       * Draw slightly expanded to avoid visible transparent blur edges.
       */
      const pad = Math.ceil(size * 1.5);

      ctx.drawImage(
        source,
        -pad,
        -pad,
        source.width + pad * 2,
        source.height + pad * 2,
      );

      ctx.restore();

      return {
        canvas,
        kind: "image",
      };
    }

    _evalSharpen(node, context) {
      const input = this._input(node, "Image", context);

      if (!input?.canvas) {
        return null;
      }

      const amount = this._clamp(Number(node.params?.amount ?? 0.35), 0, 2);

      if (amount <= 0) {
        return input;
      }

      const source = input.canvas;

      const canvas = this._copyCanvas(context, node, source);

      /*
       * Lightweight unsharp-mask approximation:
       * original + (original - blurred) using blend modes.
       */
      const blur = document.createElement("canvas");

      blur.width = source.width;

      blur.height = source.height;

      const bctx = blur.getContext("2d");

      bctx.filter = "blur(1.2px)";

      bctx.drawImage(source, 0, 0);

      const ctx = canvas.getContext("2d");

      ctx.save();
      ctx.globalCompositeOperation = "difference";
      ctx.globalAlpha = Math.min(1, amount * 0.45);
      ctx.drawImage(blur, 0, 0);
      ctx.restore();

      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha = Math.min(0.75, amount * 0.3);
      ctx.drawImage(source, 0, 0);
      ctx.restore();

      return {
        canvas,
        kind: "image",
      };
    }

    _evalGlow(node, context) {
      const input = this._input(node, "Image", context);

      if (!input?.canvas) {
        return null;
      }

      const source = input.canvas;

      const canvas = this._copyCanvas(context, node, source);

      const ctx = canvas.getContext("2d");

      const radius = Math.max(0, Number(node.params?.radius || 18));

      const gain = Math.max(0, Number(node.params?.gain ?? 0.6));

      const mix = this._clamp(Number(node.params?.mix ?? 0.5), 0, 1);

      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha = Math.min(1, gain * mix);
      ctx.filter = `blur(${radius}px) brightness(${100 + gain * 80}%)`;
      ctx.drawImage(source, 0, 0);
      ctx.restore();

      return {
        canvas,
        kind: "image",
      };
    }

    _evalChromaKey(node, context) {
      const input = this._input(node, "Image", context);

      if (!input?.canvas) {
        return null;
      }

      const source = input.canvas;

      const canvas = this._copyCanvas(context, node, source);

      const ctx = canvas.getContext("2d", {
        willReadFrequently: true,
      });

      let imageData;

      try {
        imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      } catch (error) {
        console.warn(
          "[VideoFusionEvaluator] ChromaKey pixel access unavailable:",
          error,
        );

        return {
          canvas,
          kind: "image",
        };
      }

      const key = this._hexToRgb(node.params?.keyColor || "#00ff00");

      const threshold = this._clamp(
        Number(node.params?.threshold ?? 0.24),
        0,
        1,
      );

      const softness = Math.max(0.001, Number(node.params?.softness ?? 0.12));

      const spill = this._clamp(Number(node.params?.spill ?? 0.35), 0, 1);

      const data = imageData.data;

      const maxDistance = Math.sqrt(255 * 255 * 3);

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];

        const g = data[i + 1];

        const b = data[i + 2];

        const distance =
          Math.sqrt((r - key.r) ** 2 + (g - key.g) ** 2 + (b - key.b) ** 2) /
          maxDistance;

        const alpha = this._smoothstep(
          threshold,
          threshold + softness,
          distance,
        );

        data[i + 3] = Math.round(data[i + 3] * alpha);

        if (spill > 0 && key.g > key.r && key.g > key.b) {
          const excess = Math.max(0, g - Math.max(r, b));

          data[i + 1] = Math.max(
            0,
            Math.round(g - excess * spill * (1 - alpha)),
          );
        }
      }

      ctx.putImageData(imageData, 0, 0);

      return {
        canvas,
        kind: "image",
      };
    }

    _evalMaskRectangle(node, context) {
      return {
        canvas: this._makeMask(node, context, "rectangle"),

        kind: "mask",
      };
    }

    _evalMaskEllipse(node, context) {
      return {
        canvas: this._makeMask(node, context, "ellipse"),

        kind: "mask",
      };
    }

    _evalMerge(node, context) {
      const background = this._input(node, "Background", context);

      const foreground = this._input(node, "Foreground", context);

      if (!background?.canvas && !foreground?.canvas) {
        return null;
      }

      if (!background?.canvas) {
        return foreground;
      }

      if (!foreground?.canvas) {
        return background;
      }

      const width = Math.max(background.canvas.width, foreground.canvas.width);

      const height = Math.max(
        background.canvas.height,
        foreground.canvas.height,
      );

      const canvas = this._canvas(context.graph.id, node.id, width, height);

      const ctx = canvas.getContext("2d");

      this._resetContext(ctx, canvas);

      ctx.drawImage(background.canvas, 0, 0, width, height);

      let fg = foreground.canvas;

      const mask = this._input(node, "Mask", context);

      if (mask?.canvas) {
        const masked = document.createElement("canvas");

        masked.width = width;

        masked.height = height;

        const mctx = masked.getContext("2d");

        mctx.drawImage(fg, 0, 0, width, height);

        mctx.globalCompositeOperation = "destination-in";

        mctx.drawImage(mask.canvas, 0, 0, width, height);

        fg = masked;
      }

      ctx.save();

      ctx.globalAlpha = this._clamp(Number(node.params?.blend ?? 1), 0, 1);

      ctx.globalCompositeOperation = this._blendMode(
        node.params?.mode || "Normal",
      );

      ctx.drawImage(fg, 0, 0, width, height);

      ctx.restore();

      return {
        canvas,
        kind: "image",
      };
    }

    _evalBackground(node, context) {
      const canvas = this._canvas(
        context.graph.id,
        node.id,
        context.width,
        context.height,
      );

      const ctx = canvas.getContext("2d");

      this._resetContext(ctx, canvas);

      ctx.globalAlpha = this._clamp(Number(node.params?.alpha ?? 1), 0, 1);

      ctx.fillStyle = node.params?.color || "#202020";

      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.globalAlpha = 1;

      return {
        canvas,
        kind: "image",
      };
    }

    _evalAlphaMultiply(node, context) {
      const input = this._input(node, "Image", context);

      if (!input?.canvas) {
        return null;
      }

      const canvas = this._canvas(
        context.graph.id,
        node.id,
        input.canvas.width,
        input.canvas.height,
      );

      const ctx = canvas.getContext("2d");

      this._resetContext(ctx, canvas);

      ctx.globalAlpha = this._clamp(Number(node.params?.alpha ?? 1), 0, 1);

      ctx.drawImage(input.canvas, 0, 0);

      ctx.globalAlpha = 1;

      return {
        canvas,
        kind: "image",
      };
    }

    _filterCopy(context, node, source, filter) {
      const canvas = this._canvas(
        context.graph.id,
        node.id,
        source.width,
        source.height,
      );

      const ctx = canvas.getContext("2d");

      this._resetContext(ctx, canvas);

      ctx.filter = filter || "none";

      ctx.drawImage(source, 0, 0);

      ctx.filter = "none";

      return canvas;
    }

    _copyCanvas(context, node, source) {
      const canvas = this._canvas(
        context.graph.id,
        node.id,
        source.width,
        source.height,
      );

      const ctx = canvas.getContext("2d");

      this._resetContext(ctx, canvas);

      ctx.drawImage(source, 0, 0);

      return canvas;
    }

    _makeMask(node, context, type) {
      const canvas = this._canvas(
        context.graph.id,
        node.id,
        context.width,
        context.height,
      );

      const ctx = canvas.getContext("2d");

      this._resetContext(ctx, canvas);

      const p = node.params || {};

      const centerX =
        this._clamp(Number(p.centerX ?? 0.5), 0, 1) * canvas.width;

      const centerY =
        this._clamp(Number(p.centerY ?? 0.5), 0, 1) * canvas.height;

      const width = this._clamp(Number(p.width ?? 0.5), 0, 1) * canvas.width;

      const height = this._clamp(Number(p.height ?? 0.5), 0, 1) * canvas.height;

      const softness = this._clamp(Number(p.softness || 0), 0, 0.5);

      ctx.save();

      if (p.invert) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.globalCompositeOperation = "destination-out";
      }

      if (softness > 0) {
        ctx.shadowColor = "#ffffff";

        ctx.shadowBlur = Math.max(width, height) * softness;

        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
      }

      ctx.fillStyle = "#ffffff";

      ctx.beginPath();

      if (type === "ellipse") {
        ctx.ellipse(
          centerX,
          centerY,
          Math.max(0.5, width / 2),
          Math.max(0.5, height / 2),
          0,
          0,
          Math.PI * 2,
        );
      } else {
        ctx.rect(centerX - width / 2, centerY - height / 2, width, height);
      }

      ctx.fill();

      ctx.restore();

      return canvas;
    }

    _canvas(graphId, nodeId, width, height) {
      const key = `${graphId}:${nodeId}`;

      let canvas = this.canvasPool.get(key);

      if (!canvas) {
        canvas = document.createElement("canvas");

        this.canvasPool.set(key, canvas);
      }

      width = Math.max(1, Math.round(width));

      height = Math.max(1, Math.round(height));

      if (canvas.width !== width) {
        canvas.width = width;
      }

      if (canvas.height !== height) {
        canvas.height = height;
      }

      return canvas;
    }

    _resetContext(ctx, canvas) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);

      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      ctx.filter = "none";
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      ctx.imageSmoothingEnabled = true;

      if ("imageSmoothingQuality" in ctx) {
        ctx.imageSmoothingQuality = "high";
      }
    }

    _limitDimensions(width, height) {
      width = Math.max(1, Number(width) || 1);

      height = Math.max(1, Number(height) || 1);

      const max = Math.max(width, height);

      if (max <= this.maxDimension) {
        return {
          width: Math.round(width),

          height: Math.round(height),
        };
      }

      const scale = this.maxDimension / max;

      return {
        width: Math.max(1, Math.round(width * scale)),

        height: Math.max(1, Math.round(height * scale)),
      };
    }

    _blendMode(mode) {
      const map = {
        Normal: "source-over",
        Add: "lighter",
        Multiply: "multiply",
        Screen: "screen",
        Overlay: "overlay",
        Darken: "darken",
        Lighten: "lighten",
        Difference: "difference",
      };

      return map[mode] || "source-over";
    }

    _hexToRgb(hex) {
      let value = String(hex || "#00ff00").replace("#", "");

      if (value.length === 3) {
        value = value
          .split("")
          .map((char) => char + char)
          .join("");
      }

      const number = parseInt(value, 16);

      return {
        r: Number.isFinite(number) ? (number >> 16) & 255 : 0,

        g: Number.isFinite(number) ? (number >> 8) & 255 : 255,

        b: Number.isFinite(number) ? number & 255 : 0,
      };
    }

    _smoothstep(edge0, edge1, x) {
      if (edge0 === edge1) {
        return x < edge0 ? 0 : 1;
      }

      const t = this._clamp((x - edge0) / (edge1 - edge0), 0, 1);

      return t * t * (3 - 2 * t);
    }

    _clamp(value, min, max) {
      return Math.max(min, Math.min(max, value));
    }
  }

  global.VideoFusionEvaluator = VideoFusionEvaluator;

  global.ensureVideoFusionEvaluator = function ensureVideoFusionEvaluator() {
    if (!global.videoFusionEvaluator) {
      global.videoFusionEvaluator = new VideoFusionEvaluator(
        global.videoProject,
        global.videoNodeLibrary,
      );
    }

    global.videoFusionEvaluator
      .setProject(global.videoProject)
      .setLibrary(global.videoNodeLibrary);

    return global.videoFusionEvaluator;
  };

  global.ensureVideoFusionEvaluator();
})(window);
