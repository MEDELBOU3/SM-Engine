// engine/settings/addons/templates/EditorToolAddonTemplate.js
//
// Template for editor commands/tools that operate on selection.
//
(function () {
  "use strict";

  const registry = window.SMAddonRegistry;

  if (!registry) {
    console.error("[EditorToolAddonTemplate] SMAddonRegistry missing.");

    return;
  }

  registry.register(
    {
      id: "my-company.editor-tool",

      name: "Editor Tool",

      version: "1.0.0",

      author: "Your Name",

      category: "Editing",

      icon: "fa-solid fa-screwdriver-wrench",

      builtIn: false,

      experimental: false,

      defaultEnabled: false,

      description: "Template for editor tools and selection-based commands.",

      capabilities: ["selection:read", "scene:write", "console:write"],

      preferences: [
        {
          id: "strength",

          label: "Tool Strength",

          type: "number",

          default: 1,

          min: 0,

          max: 10,

          step: 0.1,
        },
      ],

      commands: [
        {
          id: "apply",

          label: "Apply to Selection",

          description: "Apply the tool to the selected object.",
        },
      ],
    },

    (ctx) => {
      const getSelection = () =>
        window.selectedObject ||
        window.selectionManager?.selectedObject ||
        null;

      const apply = () => {
        const object = getSelection();

        if (!object) {
          ctx.log("Nothing selected.", "warn");

          return false;
        }

        const strength = Number(ctx.pref("strength", 1));

        /*
         * Put your tool logic here.
         *
         * Example:
         *
         * object.position.y +=
         *     strength;
         *
         * object.updateMatrixWorld(
         *     true
         * );
         */

        ctx.log(`Applied tool to ${object.name || object.type}.`, "info", {
          uuid: object.uuid,
          strength,
        });

        window.updateHierarchy?.();
        window.updateInspector?.();

        ctx.dispatch("sm:addon-editor-tool-applied", {
          object,
          strength,
        });

        return true;
      };

      return {
        onEnable() {
          ctx.log("Editor tool ready.", "debug");
        },

        commands: {
          apply,
        },
      };
    },
  );
})();
