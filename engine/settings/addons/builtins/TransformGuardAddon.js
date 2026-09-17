// engine/settings/addons/builtins/TransformGuardAddon.js
//
// SM Engine — Transform Guard
//
// Watches transform edits and protects Object3D transforms from
// invalid numeric state.
//
(function () {
  "use strict";

  const registry = window.SMAddonRegistry;

  if (!registry) {
    console.error("[TransformGuardAddon] SMAddonRegistry missing.");

    return;
  }

  registry.register(
    {
      id: "sm.transform-guard",

      name: "Transform Guard",

      version: "1.0.0",

      author: "SM Engine",

      category: "Editing",

      icon: "fa-solid fa-shield-halved",

      builtIn: true,

      experimental: false,

      defaultEnabled: true,

      description:
        "Protects edited objects from NaN/Infinity transforms, invalid quaternions and dangerously tiny scale values.",

      capabilities: [
        "selection:read",
        "transform:observe",
        "scene:repair",
        "console:write",
      ],

      preferences: [
        {
          id: "autoRepair",

          label: "Auto Repair Invalid Transform",

          type: "boolean",

          default: true,
        },

        {
          id: "minimumScale",

          label: "Minimum Absolute Scale",

          type: "number",

          default: 0.0001,

          min: 0.000001,

          max: 0.1,

          step: 0.0001,
        },

        {
          id: "maxPosition",

          label: "Position Warning Distance",

          type: "number",

          default: 1000000,

          min: 1000,

          max: 1000000000,

          step: 1000,
        },
      ],

      commands: [
        {
          id: "checkSelection",

          label: "Check Selection",

          description: "Validate the currently selected scene object.",
        },
      ],
    },

    (ctx) => {
      let hookedTransformControls = null;

      const finite3 = (vector) =>
        !!vector &&
        Number.isFinite(vector.x) &&
        Number.isFinite(vector.y) &&
        Number.isFinite(vector.z);

      const finiteQuaternion = (quaternion) =>
        !!quaternion &&
        [quaternion.x, quaternion.y, quaternion.z, quaternion.w].every(
          Number.isFinite,
        );

      const validate = (object, repair = ctx.pref("autoRepair", true)) => {
        if (!object?.isObject3D) {
          return {
            ok: true,
            issues: [],
          };
        }

        const issues = [];

        const minimumScale = Math.max(
          1e-8,
          Number(ctx.pref("minimumScale", 0.0001)),
        );

        const maxPosition = Math.max(
          1,
          Number(ctx.pref("maxPosition", 1000000)),
        );

        if (!finite3(object.position)) {
          issues.push("invalid-position");
        }

        if (!finite3(object.scale)) {
          issues.push("invalid-scale");
        }

        if (!finiteQuaternion(object.quaternion)) {
          issues.push("invalid-quaternion");
        }

        if (
          finite3(object.scale) &&
          (Math.abs(object.scale.x) < minimumScale ||
            Math.abs(object.scale.y) < minimumScale ||
            Math.abs(object.scale.z) < minimumScale)
        ) {
          issues.push("tiny-scale");
        }

        if (
          finite3(object.position) &&
          Math.max(
            Math.abs(object.position.x),
            Math.abs(object.position.y),
            Math.abs(object.position.z),
          ) > maxPosition
        ) {
          issues.push("far-position");
        }

        if (repair) {
          if (issues.includes("invalid-position")) {
            object.position.set(0, 0, 0);
          }

          if (issues.includes("invalid-scale")) {
            object.scale.set(1, 1, 1);
          }

          if (issues.includes("invalid-quaternion")) {
            object.quaternion.set(0, 0, 0, 1);
          }

          if (issues.includes("tiny-scale")) {
            for (const axis of ["x", "y", "z"]) {
              if (Math.abs(object.scale[axis]) < minimumScale) {
                object.scale[axis] =
                  (object.scale[axis] < 0 ? -1 : 1) * minimumScale;
              }
            }
          }

          object.updateMatrixWorld?.(true);
        }

        if (issues.length) {
          ctx.log(
            `${object.name || object.type}: ${issues.join(", ")}${repair ? " · safe repair applied where possible" : ""}.`,
            issues.some((issue) => issue.startsWith("invalid-"))
              ? "warn"
              : "debug",
          );
        }

        return {
          ok: issues.length === 0,

          issues,

          object,
        };
      };

      const tryAttach = () => {
        const transformControls = window.transformControls;

        if (
          !transformControls ||
          transformControls === hookedTransformControls
        ) {
          return;
        }

        hookedTransformControls = transformControls;

        ctx.on(transformControls, "objectChange", () => {
          validate(transformControls.object);
        });

        ctx.log("TransformControls guard attached.", "debug");
      };

      return {
        onEnable() {
          tryAttach();

          /*
           * TransformControls can be recreated by viewport/workspace
           * systems, so check infrequently for a replacement.
           */
          ctx.interval(tryAttach, 1200);
        },

        commands: {
          checkSelection() {
            return validate(window.selectedObject, false);
          },
        },
      };
    },
  );
})();
