// engine/settings/addons/templates/DiagnosticAddonTemplate.js
//
// Template for validators, auditors, scene inspectors and health checks.
//
(function () {
  "use strict";

  const registry = window.SMAddonRegistry;

  if (!registry) {
    console.error("[DiagnosticAddonTemplate] SMAddonRegistry missing.");

    return;
  }

  registry.register(
    {
      id: "my-company.scene-diagnostic",

      name: "Scene Diagnostic",

      version: "1.0.0",

      author: "Your Name",

      category: "Diagnostics",

      icon: "fa-solid fa-magnifying-glass",

      builtIn: false,

      experimental: false,

      defaultEnabled: false,

      description: "Template for non-destructive scene diagnostics.",

      capabilities: ["scene:read", "console:write"],

      preferences: [
        {
          id: "scanOnLoad",

          label: "Scan on Scene Load",

          type: "boolean",

          default: false,
        },

        {
          id: "threshold",

          label: "Warning Threshold",

          type: "number",

          default: 100,

          min: 1,

          max: 100000,

          step: 1,
        },
      ],

      commands: [
        {
          id: "scan",

          label: "Run Scan",

          description: "Run the diagnostic scan.",
        },
      ],
    },

    (ctx) => {
      const scan = () => {
        const scene = ctx.scene;

        if (!scene) {
          ctx.log("No active scene.", "warn");

          return null;
        }

        const threshold = Number(ctx.pref("threshold", 100));

        const issues = [];

        let objectCount = 0;

        scene.traverse((object) => {
          objectCount += 1;

          /*
           * Add your validation rules here.
           *
           * Example:
           *
           * if (
           *     object.isMesh &&
           *     object.geometry
           *         ?.attributes
           *         ?.position
           *         ?.count >
           *     threshold
           * ) {
           *     issues.push({
           *         kind:
           *             'dense-mesh',
           *
           *         object
           *     });
           * }
           */
        });

        const report = {
          objectCount,
          threshold,
          issues,
        };

        ctx.log(
          `Scan complete: ${objectCount} objects, ${issues.length} issue(s).`,
          issues.length ? "warn" : "info",
          report,
        );

        ctx.dispatch("sm:addon-diagnostic-report", {
          report,
        });

        return report;
      };

      return {
        onEnable() {
          if (ctx.pref("scanOnLoad", false)) {
            ctx.onWindow("sm:scene-loaded", scan);

            ctx.onWindow("sm:project-loaded", scan);
          }
        },

        commands: {
          scan,
        },
      };
    },
  );
})();
