// engine/settings/addons/templates/AddonTemplate.js
//
// SM Engine — Generic Add-on Template
//
// Copy this file, rename it, and change:
//   id
//   name
//   version
//   category
//   preferences
//   commands
//   implementation
//
(function () {
  "use strict";

  const registry = window.SMAddonRegistry;

  if (!registry) {
    console.error("[AddonTemplate] SMAddonRegistry missing.");

    return;
  }

  registry.register(
    {
      /*
       * Keep IDs globally unique.
       *
       * Recommended:
       * vendor.addon-name
       */
      id: "my-company.my-addon",

      name: "My Add-on",

      version: "1.0.0",

      author: "Your Name",

      category: "General",

      icon: "fa-solid fa-puzzle-piece",

      /*
       * Custom/third-party add-ons should normally use false.
       *
       * Safe Mode can block non-built-in add-ons.
       */
      builtIn: false,

      experimental: false,

      defaultEnabled: false,

      description: "Describe what this add-on does.",

      capabilities: ["scene:read", "console:write"],

      preferences: [
        {
          id: "enabledFeature",

          label: "Enable Feature",

          description: "Example boolean preference.",

          type: "boolean",

          default: true,
        },

        {
          id: "strength",

          label: "Strength",

          description: "Example numeric preference.",

          type: "number",

          default: 1,

          min: 0,

          max: 10,

          step: 0.1,
        },

        {
          id: "mode",

          label: "Mode",

          description: "Example select preference.",

          type: "select",

          default: "standard",

          options: ["standard", "advanced", "cinematic"],
        },
      ],

      commands: [
        {
          id: "run",

          label: "Run",

          description: "Execute the add-on action.",
        },
      ],
    },

    (ctx) => {
      /*
       * ctx gives access to:
       *
       * ctx.scene
       * ctx.renderer
       * ctx.camera
       * ctx.controls
       * ctx.settings
       *
       * ctx.pref(key, fallback)
       * ctx.setPref(key, value)
       *
       * ctx.log(message, level, extra)
       *
       * ctx.on(...)
       * ctx.onWindow(...)
       * ctx.interval(...)
       * ctx.timeout(...)
       * ctx.frame(...)
       *
       * Every managed listener/timer/frame callback is cleaned up
       * automatically when the add-on is disabled.
       */

      const run = () => {
        const strength = Number(ctx.pref("strength", 1));

        const mode = ctx.pref("mode", "standard");

        ctx.log(`Run · mode=${mode} · strength=${strength}`, "info");
      };

      return {
        onEnable() {
          ctx.log("Add-on enabled.");

          /*
           * Example:
           *
           * ctx.onWindow(
           *     'sm:project-loaded',
           *     run
           * );
           */
        },

        onDisable() {
          /*
           * Managed ctx listeners/timers/frame callbacks are
           * disposed automatically after this hook.
           */
          ctx.log("Add-on disabled.", "debug");
        },

        onPreferenceChanged(key, value, allPreferences) {
          ctx.log(
            `Preference changed: ${key} = ${value}`,
            "debug",
            allPreferences,
          );
        },

        commands: {
          run,
        },
      };
    },
  );
})();
