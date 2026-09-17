// engine/settings/addons/templates/RuntimeAddonTemplate.js
//
// Template for light-weight runtime/frame observers.
//
// IMPORTANT:
// Do not perform heavy scene traversal every frame.
// Use throttling/sampling.
//
(function () {
  "use strict";

  const registry = window.SMAddonRegistry;

  if (!registry) {
    console.error("[RuntimeAddonTemplate] SMAddonRegistry missing.");

    return;
  }

  registry.register(
    {
      id: "my-company.runtime-addon",

      name: "Runtime Add-on",

      version: "1.0.0",

      author: "Your Name",

      category: "Runtime",

      icon: "fa-solid fa-wave-square",

      builtIn: false,

      experimental: false,

      defaultEnabled: false,

      description: "Template for frame-based or runtime monitoring add-ons.",

      capabilities: ["frame:observe", "renderer:read", "console:write"],

      preferences: [
        {
          id: "sampleMs",

          label: "Sample Interval (ms)",

          type: "number",

          default: 1000,

          min: 100,

          max: 10000,

          step: 100,
        },
      ],

      commands: [
        {
          id: "snapshot",

          label: "Snapshot",

          description: "Print a runtime snapshot.",
        },
      ],
    },

    (ctx) => {
      let lastSample = performance.now();

      let frameCount = 0;

      const snapshot = () => {
        const renderer = ctx.renderer;

        const render = renderer?.info?.render || {};

        const memory = renderer?.info?.memory || {};

        const report = {
          calls: Number(render.calls || 0),

          triangles: Number(render.triangles || 0),

          geometries: Number(memory.geometries || 0),

          textures: Number(memory.textures || 0),
        };

        ctx.log("Runtime snapshot.", "info", report);

        return report;
      };

      const update = () => {
        frameCount += 1;

        const now = performance.now();

        const sampleMs = Math.max(100, Number(ctx.pref("sampleMs", 1000)));

        if (now - lastSample < sampleMs) {
          return;
        }

        const elapsed = now - lastSample;

        const fps = Math.round((frameCount * 1000) / Math.max(1, elapsed));

        frameCount = 0;

        lastSample = now;

        /*
         * Do only cheap sampled work here.
         */
        ctx.dispatch("sm:addon-runtime-sample", {
          fps,
        });
      };

      return {
        onEnable() {
          /*
           * ctx.frame() is removed automatically when disabled.
           */
          ctx.frame(update);
        },

        commands: {
          snapshot,
        },
      };
    },
  );
})();
