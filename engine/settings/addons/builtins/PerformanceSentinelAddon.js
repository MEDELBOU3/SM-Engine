// engine/settings/addons/builtins/PerformanceSentinelAddon.js
//
// SM Engine — Performance Sentinel
//
// Low-overhead performance monitor.
// Does not automatically change quality settings.
//
(function () {
  "use strict";

  const registry = window.SMAddonRegistry;

  if (!registry) {
    console.error("[PerformanceSentinelAddon] SMAddonRegistry missing.");

    return;
  }

  registry.register(
    {
      id: "sm.performance-sentinel",

      name: "Performance Sentinel",

      version: "1.0.0",

      author: "SM Engine",

      category: "Performance",

      icon: "fa-solid fa-gauge-high",

      builtIn: true,

      experimental: false,

      defaultEnabled: true,

      description:
        "Monitors FPS, draw calls, triangles and renderer memory pressure with throttled warnings.",

      capabilities: ["renderer:read", "frame:observe", "console:write"],

      preferences: [
        {
          id: "targetFPS",

          label: "Low FPS Threshold",

          type: "number",

          default: 42,

          min: 10,

          max: 240,

          step: 1,
        },

        {
          id: "drawCallWarn",

          label: "Draw-call Warning",

          type: "number",

          default: 1400,

          min: 100,

          max: 10000,

          step: 100,
        },

        {
          id: "triangleWarn",

          label: "Triangle Warning",

          type: "number",

          default: 3000000,

          min: 100000,

          max: 30000000,

          step: 100000,
        },

        {
          id: "sampleMs",

          label: "Sample Interval (ms)",

          type: "number",

          default: 1000,

          min: 250,

          max: 5000,

          step: 250,
        },

        {
          id: "cooldownMs",

          label: "Warning Cooldown (ms)",

          type: "number",

          default: 6000,

          min: 1000,

          max: 60000,

          step: 1000,
        },
      ],

      commands: [
        {
          id: "snapshot",

          label: "Performance Snapshot",

          description:
            "Write the current renderer performance snapshot to Global Console.",
        },
      ],
    },

    (ctx) => {
      let frames = 0;

      let lastSampleTime = performance.now();

      let lastWarningTime = 0;

      let lastSample = {
        fps: 0,
        calls: 0,
        triangles: 0,
      };

      const buildSnapshot = (now = performance.now()) => {
        const renderer = ctx.renderer;

        const renderInfo = renderer?.info?.render || {};

        const memoryInfo = renderer?.info?.memory || {};

        return {
          fps: lastSample.fps,

          calls: Number(renderInfo.calls || 0),

          triangles: Number(renderInfo.triangles || 0),

          points: Number(renderInfo.points || 0),

          lines: Number(renderInfo.lines || 0),

          geometries: Number(memoryInfo.geometries || 0),

          textures: Number(memoryInfo.textures || 0),

          timestamp: now,
        };
      };

      const snapshot = () => {
        const current = buildSnapshot();

        ctx.log(
          `FPS ${current.fps} · Calls ${current.calls} · Tris ${current.triangles.toLocaleString()}`,
          "info",
          current,
        );

        return current;
      };

      const update = () => {
        frames += 1;

        const now = performance.now();

        const sampleMs = Math.max(250, Number(ctx.pref("sampleMs", 1000)));

        const elapsed = now - lastSampleTime;

        if (elapsed < sampleMs) {
          return;
        }

        const renderer = ctx.renderer;

        const renderInfo = renderer?.info?.render || {};

        lastSample = {
          fps: Math.round((frames * 1000) / Math.max(1, elapsed)),

          calls: Number(renderInfo.calls || 0),

          triangles: Number(renderInfo.triangles || 0),
        };

        frames = 0;

        lastSampleTime = now;

        const reasons = [];

        if (lastSample.fps < Number(ctx.pref("targetFPS", 42))) {
          reasons.push(`FPS ${lastSample.fps}`);
        }

        if (lastSample.calls > Number(ctx.pref("drawCallWarn", 1400))) {
          reasons.push(`${lastSample.calls} draw calls`);
        }

        if (lastSample.triangles > Number(ctx.pref("triangleWarn", 3000000))) {
          reasons.push(`${lastSample.triangles.toLocaleString()} triangles`);
        }

        const cooldownMs = Math.max(1000, Number(ctx.pref("cooldownMs", 6000)));

        if (reasons.length && now - lastWarningTime > cooldownMs) {
          lastWarningTime = now;

          ctx.log(`Render budget pressure: ${reasons.join(" · ")}`, "warn", {
            ...lastSample,
          });

          ctx.dispatch("sm:addon-performance-pressure", {
            sample: {
              ...lastSample,
            },

            reasons,
          });
        }
      };

      return {
        onEnable() {
          ctx.frame(update);
        },

        commands: {
          snapshot,
        },
      };
    },
  );
})();
