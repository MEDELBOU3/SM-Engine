// engine/settings/addons/builtins/SceneDoctorAddon.js
//
// SM Engine — Scene Doctor
//
// Deep scene diagnostics + conservative/manual repair.
// No destructive automatic repair is performed on enable.
//
(function () {
  "use strict";

  const registry = window.SMAddonRegistry;

  if (!registry) {
    console.error("[SceneDoctorAddon] SMAddonRegistry missing.");

    return;
  }

  registry.register(
    {
      id: "sm.scene-doctor",

      name: "Scene Doctor",

      version: "1.0.0",

      author: "SM Engine",

      category: "Diagnostics",

      icon: "fa-solid fa-stethoscope",

      builtIn: true,

      experimental: false,

      defaultEnabled: false,

      description:
        "Scans the active scene for invalid transforms, tiny scales, empty groups, suspicious hierarchy depth and scene-graph problems.",

      capabilities: ["scene:read", "scene:repair", "console:write"],

      preferences: [
        {
          id: "scanOnLoad",

          label: "Scan on Scene Load",

          description:
            "Automatically run diagnostics after a scene or project is loaded.",

          type: "boolean",

          default: true,
        },

        {
          id: "warnEmptyGroups",

          label: "Warn Empty Groups",

          description: "Report Groups that contain no children.",

          type: "boolean",

          default: true,
        },

        {
          id: "maxDepth",

          label: "Hierarchy Depth Warning",

          description: "Warn when an object is nested deeper than this value.",

          type: "number",

          default: 40,

          min: 5,

          max: 200,

          step: 1,
        },

        {
          id: "tinyScale",

          label: "Minimum Safe Scale",

          description:
            "Absolute scale below this threshold is considered dangerous.",

          type: "number",

          default: 0.0001,

          min: 0.000001,

          max: 0.1,

          step: 0.0001,
        },
      ],

      commands: [
        {
          id: "scan",

          label: "Scan Scene",

          description: "Run a full scene health scan.",
        },

        {
          id: "repair",

          label: "Safe Repair",

          description:
            "Repair invalid numeric transforms and dangerously tiny scales.",
        },
      ],
    },

    (ctx) => {
      const isFiniteNumber = (value) => Number.isFinite(Number(value));

      const getDepth = (object) => {
        let depth = 0;
        let parent = object?.parent;

        while (parent) {
          depth += 1;
          parent = parent.parent;
        }

        return depth;
      };

      const inspectObject = (object) => {
        const issues = [];

        if (!object?.isObject3D) {
          return issues;
        }

        const maxDepth = Number(ctx.pref("maxDepth", 40));

        const tinyScale = Math.max(1e-8, Number(ctx.pref("tinyScale", 0.0001)));

        for (const axis of ["x", "y", "z"]) {
          if (!isFiniteNumber(object.position?.[axis])) {
            issues.push({
              kind: "invalid-position",

              object,

              axis,
            });
          }

          if (!isFiniteNumber(object.scale?.[axis])) {
            issues.push({
              kind: "invalid-scale",

              object,

              axis,
            });
          }
        }

        for (const axis of ["x", "y", "z", "w"]) {
          if (!isFiniteNumber(object.quaternion?.[axis])) {
            issues.push({
              kind: "invalid-quaternion",

              object,

              axis,
            });
          }
        }

        if (
          Math.abs(object.scale?.x ?? 1) < tinyScale ||
          Math.abs(object.scale?.y ?? 1) < tinyScale ||
          Math.abs(object.scale?.z ?? 1) < tinyScale
        ) {
          issues.push({
            kind: "tiny-scale",

            object,
          });
        }

        const depth = getDepth(object);

        if (depth > maxDepth) {
          issues.push({
            kind: "deep-hierarchy",

            object,

            depth,
          });
        }

        if (
          ctx.pref("warnEmptyGroups", true) &&
          object.isGroup &&
          object.children.length === 0
        ) {
          issues.push({
            kind: "empty-group",

            object,
          });
        }

        if (object.parent === object) {
          issues.push({
            kind: "self-parent",

            object,
          });
        }

        return issues;
      };

      const summarize = (issues) => {
        const counts = {};

        for (const issue of issues) {
          counts[issue.kind] = (counts[issue.kind] || 0) + 1;
        }

        return counts;
      };

      const scan = () => {
        const scene = ctx.scene;

        if (!scene) {
          ctx.log("No active scene.", "warn");

          return {
            issues: [],
          };
        }

        const issues = [];

        let objectCount = 0;
        let meshCount = 0;
        let lightCount = 0;
        let cameraCount = 0;

        scene.traverse((object) => {
          objectCount += 1;

          if (object.isMesh) {
            meshCount += 1;
          }

          if (object.isLight) {
            lightCount += 1;
          }

          if (object.isCamera) {
            cameraCount += 1;
          }

          issues.push(...inspectObject(object));
        });

        const counts = summarize(issues);

        const report = {
          objects: objectCount,

          meshes: meshCount,

          lights: lightCount,

          cameras: cameraCount,

          issueCount: issues.length,

          counts,

          issues,
        };

        ctx.log(
          `Scene scan complete: ${objectCount} objects, ${meshCount} meshes, ${issues.length} issue(s).`,
          issues.length ? "warn" : "info",
          {
            counts,

            sample: issues.slice(0, 60).map((issue) => ({
              kind: issue.kind,

              name: issue.object?.name || issue.object?.type,

              uuid: issue.object?.uuid,

              axis: issue.axis,

              depth: issue.depth,
            })),
          },
        );

        ctx.dispatch("sm:addon-scene-doctor-report", {
          report,
        });

        return report;
      };

      const repair = () => {
        const report = scan();

        const tinyScale = Math.max(1e-8, Number(ctx.pref("tinyScale", 0.0001)));

        let fixed = 0;

        for (const issue of report.issues) {
          const object = issue.object;

          if (!object) {
            continue;
          }

          if (issue.kind === "invalid-position") {
            object.position[issue.axis] = 0;

            fixed += 1;
          }

          if (issue.kind === "invalid-scale") {
            object.scale[issue.axis] = 1;

            fixed += 1;
          }

          if (issue.kind === "invalid-quaternion") {
            object.quaternion.set(0, 0, 0, 1);

            fixed += 1;
          }

          if (issue.kind === "tiny-scale") {
            for (const axis of ["x", "y", "z"]) {
              if (Math.abs(object.scale[axis]) < tinyScale) {
                object.scale[axis] =
                  (object.scale[axis] < 0 ? -1 : 1) * tinyScale;
              }
            }

            fixed += 1;
          }

          object.updateMatrixWorld?.(true);
        }

        window.updateHierarchy?.();
        window.updateInspector?.();

        ctx.log(
          `Safe Repair fixed ${fixed} issue(s).`,
          fixed ? "info" : "debug",
        );

        ctx.dispatch("sm:addon-scene-doctor-repaired", {
          fixed,
        });

        return fixed;
      };

      return {
        onEnable() {
          if (ctx.pref("scanOnLoad", true)) {
            ctx.onWindow("sm:project-loaded", scan);

            ctx.onWindow("sm:scene-loaded", scan);
          }
        },

        commands: {
          scan,
          repair,
        },
      };
    },
  );
})();
