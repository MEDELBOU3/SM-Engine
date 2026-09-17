/**
 * VideoNodeLibrary.js
 * SM Engine — Fusion-style node definitions.
 *
 * Phase 11:
 * - richer video/image compositing node library
 * - nodes are evaluated live by VideoFusionEvaluator
 * - keeps the old create/get/list/categories API
 */
(function (global) {
  "use strict";

  class VideoNodeLibrary {
    constructor() {
      this.definitions = new Map();
      this._registerBuiltins();
    }

    register(definition) {
      if (!definition?.type || !definition?.title) {
        return false;
      }

      this.definitions.set(definition.type, definition);

      return true;
    }

    get(type) {
      return this.definitions.get(type) || null;
    }

    list(category = null) {
      const items = [...this.definitions.values()];

      return category
        ? items.filter((item) => item.category === category)
        : items;
    }

    categories() {
      const preferred = [
        "Input",
        "Output",
        "Transform",
        "Color",
        "Filter",
        "Key",
        "Mask",
        "Composite",
        "Generator",
        "Utility",
      ];

      const found = [...new Set(this.list().map((item) => item.category))];

      return found.sort((a, b) => {
        const ai = preferred.indexOf(a);

        const bi = preferred.indexOf(b);

        return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi);
      });
    }

    create(type, options = {}) {
      const definition = this.get(type);

      if (!definition) {
        return null;
      }

      const params = {};

      Object.entries(definition.params || {}).forEach(([key, descriptor]) => {
        params[key] = this._clone(descriptor.default);
      });

      return {
        type: definition.type,

        title: definition.title,

        category: definition.category,

        width: definition.width || 180,

        x: Number(options.x || 0),

        y: Number(options.y || 0),

        inputs: this._clone(definition.inputs || []),

        outputs: this._clone(definition.outputs || []),

        params: {
          ...params,
          ...(options.params || {}),
        },

        color: definition.color || null,

        metadata: {
          icon: definition.icon || null,

          description: definition.description || "",

          evaluator: definition.evaluator || definition.type,

          live: definition.live !== false,
        },
      };
    }

    createDefaultGraph(graph) {
      if (!graph || graph.nodes.length) {
        return;
      }

      const mediaIn = graph.addNode(
        this.create("MediaIn", {
          x: 40,
          y: 130,
        }),
      );

      const transform = graph.addNode(
        this.create("Transform", {
          x: 260,
          y: 130,
        }),
      );

      const color = graph.addNode(
        this.create("ColorCorrect", {
          x: 490,
          y: 130,
        }),
      );

      const mediaOut = graph.addNode(
        this.create("MediaOut", {
          x: 730,
          y: 130,
        }),
      );

      graph.connect(mediaIn.id, "Image", transform.id, "Image");

      graph.connect(transform.id, "Image", color.id, "Image");

      graph.connect(color.id, "Image", mediaOut.id, "Image");
    }

    _registerBuiltins() {
      const image = (name) => ({
        name,
        type: "image",
      });

      const mask = (name) => ({
        name,
        type: "mask",
      });

      /* ==========================================================
     INPUT / OUTPUT
     ========================================================== */

      this.register({
        type: "MediaIn",
        title: "MediaIn",
        category: "Input",
        color: "#4d5664",
        width: 164,
        evaluator: "MediaIn",
        inputs: [],
        outputs: [image("Image")],
        params: {},
        description: "The selected timeline video/image clip.",
      });

      this.register({
        type: "MediaOut",
        title: "MediaOut",
        category: "Output",
        color: "#554d62",
        width: 164,
        evaluator: "MediaOut",
        inputs: [image("Image")],
        outputs: [],
        params: {},
        description: "Final Fusion result returned to the clip.",
      });

      /* ==========================================================
     TRANSFORM
     ========================================================== */

      this.register({
        type: "Transform",
        title: "Transform",
        category: "Transform",
        color: "#4f5b51",
        evaluator: "Transform",
        inputs: [image("Image")],
        outputs: [image("Image")],
        params: {
          centerX: {
            type: "number",
            label: "Pivot X",
            default: 0.5,
            min: 0,
            max: 1,
            step: 0.001,
          },

          centerY: {
            type: "number",
            label: "Pivot Y",
            default: 0.5,
            min: 0,
            max: 1,
            step: 0.001,
          },

          offsetX: {
            type: "number",
            label: "Position X",
            default: 0,
            min: -2,
            max: 2,
            step: 0.001,
          },

          offsetY: {
            type: "number",
            label: "Position Y",
            default: 0,
            min: -2,
            max: 2,
            step: 0.001,
          },

          size: {
            type: "number",
            label: "Size",
            default: 1,
            min: 0,
            max: 10,
            step: 0.01,
          },

          aspect: {
            type: "number",
            label: "Aspect",
            default: 1,
            min: 0.05,
            max: 20,
            step: 0.01,
          },

          angle: {
            type: "number",
            label: "Angle",
            default: 0,
            min: -360,
            max: 360,
            step: 0.1,
          },

          flipX: {
            type: "bool",
            label: "Flip X",
            default: false,
          },

          flipY: {
            type: "bool",
            label: "Flip Y",
            default: false,
          },
        },
        description:
          "Move, scale, rotate and flip the image inside the Fusion frame.",
      });

      this.register({
        type: "Crop",
        title: "Crop",
        category: "Transform",
        color: "#4f5b51",
        evaluator: "Crop",
        inputs: [image("Image")],
        outputs: [image("Image")],
        params: {
          left: {
            type: "number",
            label: "Left",
            default: 0,
            min: 0,
            max: 1,
            step: 0.001,
          },

          right: {
            type: "number",
            label: "Right",
            default: 0,
            min: 0,
            max: 1,
            step: 0.001,
          },

          top: {
            type: "number",
            label: "Top",
            default: 0,
            min: 0,
            max: 1,
            step: 0.001,
          },

          bottom: {
            type: "number",
            label: "Bottom",
            default: 0,
            min: 0,
            max: 1,
            step: 0.001,
          },

          feather: {
            type: "number",
            label: "Feather",
            default: 0,
            min: 0,
            max: 0.25,
            step: 0.001,
          },
        },
        description: "Crop the clip non-destructively.",
      });

      /* ==========================================================
     COLOR
     ========================================================== */

      this.register({
        type: "ColorCorrect",
        title: "Color Corrector",
        category: "Color",
        color: "#5a5248",
        evaluator: "ColorCorrect",
        inputs: [image("Image")],
        outputs: [image("Image")],
        params: {
          lift: {
            type: "number",
            label: "Lift",
            default: 0,
            min: -1,
            max: 1,
            step: 0.01,
          },

          gamma: {
            type: "number",
            label: "Gamma",
            default: 1,
            min: 0.1,
            max: 4,
            step: 0.01,
          },

          gain: {
            type: "number",
            label: "Gain",
            default: 1,
            min: 0,
            max: 4,
            step: 0.01,
          },

          saturation: {
            type: "number",
            label: "Saturation",
            default: 1,
            min: 0,
            max: 3,
            step: 0.01,
          },

          hue: {
            type: "number",
            label: "Hue",
            default: 0,
            min: -180,
            max: 180,
            step: 0.1,
          },
        },
        description: "Primary lift, gamma, gain, saturation and hue controls.",
      });

      this.register({
        type: "BrightnessContrast",
        title: "Brightness / Contrast",
        category: "Color",
        color: "#5a5248",
        evaluator: "BrightnessContrast",
        inputs: [image("Image")],
        outputs: [image("Image")],
        params: {
          brightness: {
            type: "number",
            label: "Brightness",
            default: 0,
            min: -1,
            max: 1,
            step: 0.01,
          },

          contrast: {
            type: "number",
            label: "Contrast",
            default: 1,
            min: 0,
            max: 3,
            step: 0.01,
          },
        },
      });

      this.register({
        type: "HueSaturation",
        title: "Hue / Saturation",
        category: "Color",
        color: "#5a5248",
        evaluator: "HueSaturation",
        inputs: [image("Image")],
        outputs: [image("Image")],
        params: {
          hue: {
            type: "number",
            label: "Hue",
            default: 0,
            min: -180,
            max: 180,
            step: 0.1,
          },

          saturation: {
            type: "number",
            label: "Saturation",
            default: 1,
            min: 0,
            max: 4,
            step: 0.01,
          },
        },
      });

      this.register({
        type: "Tint",
        title: "Tint",
        category: "Color",
        color: "#5a5248",
        evaluator: "Tint",
        inputs: [image("Image")],
        outputs: [image("Image")],
        params: {
          color: {
            type: "color",
            label: "Color",
            default: "#ff9a66",
          },

          amount: {
            type: "number",
            label: "Amount",
            default: 0.25,
            min: 0,
            max: 1,
            step: 0.01,
          },
        },
      });

      this.register({
        type: "Invert",
        title: "Invert",
        category: "Color",
        color: "#5a5248",
        evaluator: "Invert",
        inputs: [image("Image")],
        outputs: [image("Image")],
        params: {
          amount: {
            type: "number",
            label: "Amount",
            default: 1,
            min: 0,
            max: 1,
            step: 0.01,
          },
        },
      });

      /* ==========================================================
     FILTER
     ========================================================== */

      this.register({
        type: "Blur",
        title: "Gaussian Blur",
        category: "Filter",
        color: "#4c5962",
        evaluator: "Blur",
        inputs: [image("Image")],
        outputs: [image("Image")],
        params: {
          size: {
            type: "number",
            label: "Size",
            default: 8,
            min: 0,
            max: 150,
            step: 0.1,
          },

          mix: {
            type: "number",
            label: "Mix",
            default: 1,
            min: 0,
            max: 1,
            step: 0.01,
          },
        },
      });

      this.register({
        type: "Sharpen",
        title: "Sharpen",
        category: "Filter",
        color: "#4c5962",
        evaluator: "Sharpen",
        inputs: [image("Image")],
        outputs: [image("Image")],
        params: {
          amount: {
            type: "number",
            label: "Amount",
            default: 0.35,
            min: 0,
            max: 2,
            step: 0.01,
          },
        },
      });

      this.register({
        type: "Glow",
        title: "Soft Glow",
        category: "Filter",
        color: "#4c5962",
        evaluator: "Glow",
        inputs: [image("Image")],
        outputs: [image("Image")],
        params: {
          radius: {
            type: "number",
            label: "Radius",
            default: 18,
            min: 0,
            max: 150,
            step: 0.5,
          },

          gain: {
            type: "number",
            label: "Gain",
            default: 0.6,
            min: 0,
            max: 3,
            step: 0.01,
          },

          mix: {
            type: "number",
            label: "Mix",
            default: 0.5,
            min: 0,
            max: 1,
            step: 0.01,
          },
        },
      });

      /* ==========================================================
     KEY
     ========================================================== */

      this.register({
        type: "ChromaKey",
        title: "Chroma Key",
        category: "Key",
        color: "#4d5c59",
        evaluator: "ChromaKey",
        inputs: [image("Image")],
        outputs: [image("Image")],
        params: {
          keyColor: {
            type: "color",
            label: "Key Color",
            default: "#00ff00",
          },

          threshold: {
            type: "number",
            label: "Threshold",
            default: 0.24,
            min: 0,
            max: 1,
            step: 0.005,
          },

          softness: {
            type: "number",
            label: "Softness",
            default: 0.12,
            min: 0.001,
            max: 1,
            step: 0.005,
          },

          spill: {
            type: "number",
            label: "Despill",
            default: 0.35,
            min: 0,
            max: 1,
            step: 0.01,
          },
        },
        description:
          "Remove a selected key color with adjustable tolerance and despill.",
      });

      /* ==========================================================
     MASK
     ========================================================== */

      this.register({
        type: "MaskRectangle",
        title: "Rectangle Mask",
        category: "Mask",
        color: "#4d5c59",
        evaluator: "MaskRectangle",
        inputs: [],
        outputs: [mask("Mask")],
        params: {
          centerX: {
            type: "number",
            label: "Center X",
            default: 0.5,
            min: 0,
            max: 1,
            step: 0.001,
          },

          centerY: {
            type: "number",
            label: "Center Y",
            default: 0.5,
            min: 0,
            max: 1,
            step: 0.001,
          },

          width: {
            type: "number",
            label: "Width",
            default: 0.5,
            min: 0,
            max: 1,
            step: 0.001,
          },

          height: {
            type: "number",
            label: "Height",
            default: 0.5,
            min: 0,
            max: 1,
            step: 0.001,
          },

          softness: {
            type: "number",
            label: "Soft Edge",
            default: 0,
            min: 0,
            max: 0.5,
            step: 0.001,
          },

          invert: {
            type: "bool",
            label: "Invert",
            default: false,
          },
        },
      });

      this.register({
        type: "MaskEllipse",
        title: "Ellipse Mask",
        category: "Mask",
        color: "#4d5c59",
        evaluator: "MaskEllipse",
        inputs: [],
        outputs: [mask("Mask")],
        params: {
          centerX: {
            type: "number",
            label: "Center X",
            default: 0.5,
            min: 0,
            max: 1,
            step: 0.001,
          },

          centerY: {
            type: "number",
            label: "Center Y",
            default: 0.5,
            min: 0,
            max: 1,
            step: 0.001,
          },

          width: {
            type: "number",
            label: "Width",
            default: 0.5,
            min: 0,
            max: 1,
            step: 0.001,
          },

          height: {
            type: "number",
            label: "Height",
            default: 0.5,
            min: 0,
            max: 1,
            step: 0.001,
          },

          softness: {
            type: "number",
            label: "Soft Edge",
            default: 0,
            min: 0,
            max: 0.5,
            step: 0.001,
          },

          invert: {
            type: "bool",
            label: "Invert",
            default: false,
          },
        },
      });

      /* ==========================================================
     COMPOSITE
     ========================================================== */

      this.register({
        type: "Merge",
        title: "Merge",
        category: "Composite",
        color: "#5c4f4f",
        evaluator: "Merge",
        inputs: [
          image("Background"),
          image("Foreground"),
          {
            ...mask("Mask"),
            optional: true,
          },
        ],
        outputs: [image("Image")],
        params: {
          blend: {
            type: "number",
            label: "Blend",
            default: 1,
            min: 0,
            max: 1,
            step: 0.01,
          },

          mode: {
            type: "select",
            label: "Apply Mode",
            default: "Normal",
            options: [
              "Normal",
              "Add",
              "Multiply",
              "Screen",
              "Overlay",
              "Darken",
              "Lighten",
              "Difference",
            ],
          },
        },
      });

      /* ==========================================================
     GENERATOR
     ========================================================== */

      this.register({
        type: "Background",
        title: "Background",
        category: "Generator",
        color: "#5a505c",
        evaluator: "Background",
        inputs: [],
        outputs: [image("Image")],
        params: {
          color: {
            type: "color",
            label: "Color",
            default: "#202020",
          },

          alpha: {
            type: "number",
            label: "Alpha",
            default: 1,
            min: 0,
            max: 1,
            step: 0.01,
          },
        },
      });

      /* ==========================================================
     UTILITY
     ========================================================== */

      this.register({
        type: "AlphaMultiply",
        title: "Alpha Multiply",
        category: "Utility",
        color: "#50545d",
        evaluator: "AlphaMultiply",
        inputs: [image("Image")],
        outputs: [image("Image")],
        params: {
          alpha: {
            type: "number",
            label: "Alpha",
            default: 1,
            min: 0,
            max: 1,
            step: 0.01,
          },
        },
      });
    }

    _clone(value) {
      if (value === undefined) {
        return undefined;
      }

      if (global.structuredClone) {
        try {
          return global.structuredClone(value);
        } catch (_) {}
      }

      return JSON.parse(JSON.stringify(value));
    }
  }

  global.VideoNodeLibrary = VideoNodeLibrary;

  global.videoNodeLibrary = global.videoNodeLibrary || new VideoNodeLibrary();
})(window);
