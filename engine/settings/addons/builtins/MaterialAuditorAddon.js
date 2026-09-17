// engine/settings/addons/builtins/MaterialAuditorAddon.js
//
// SM Engine — Material Auditor
//
(function () {
  "use strict";

  const registry = window.SMAddonRegistry;

  if (!registry) {
    console.error("[MaterialAuditorAddon] SMAddonRegistry missing.");

    return;
  }

  registry.register(
    {
      id: "sm.material-auditor",

      name: "Material Auditor",

      version: "1.0.0",

      author: "SM Engine",

      category: "Materials",

      icon: "fa-solid fa-circle-half-stroke",

      builtIn: true,

      experimental: false,

      defaultEnabled: false,

      description:
        "Analyzes material usage, texture pressure, single-use materials and exact duplicate material signatures.",

      capabilities: ["scene:read", "materials:read", "console:write"],

      preferences: [
        {
          id: "scanOnLoad",

          label: "Audit on Project Load",

          type: "boolean",

          default: false,
        },

        {
          id: "materialWarn",

          label: "Material Count Warning",

          type: "number",

          default: 250,

          min: 10,

          max: 5000,

          step: 10,
        },

        {
          id: "duplicateWarn",

          label: "Warn Exact Duplicates",

          type: "boolean",

          default: true,
        },
      ],

      commands: [
        {
          id: "audit",

          label: "Audit Materials",

          description: "Analyze materials and texture reuse.",
        },
      ],
    },

    (ctx) => {
      const valueSignature = (value) => {
        if (value?.isColor) {
          return `color:${value.getHexString()}`;
        }

        if (value?.isTexture) {
          return `texture:${value.uuid}`;
        }

        if (
          typeof value === "number" ||
          typeof value === "boolean" ||
          typeof value === "string"
        ) {
          return String(value);
        }

        return "";
      };

      const fingerprint = (material) => {
        const keys = [
          "type",
          "transparent",
          "opacity",
          "side",
          "roughness",
          "metalness",
          "emissiveIntensity",
          "wireframe",
          "color",
          "emissive",
          "map",
          "normalMap",
          "roughnessMap",
          "metalnessMap",
          "emissiveMap",
          "aoMap",
          "alphaMap",
        ];

        return keys
          .map((key) => `${key}:${valueSignature(material?.[key])}`)
          .join("|");
      };

      const audit = () => {
        const scene = ctx.scene;

        if (!scene) {
          ctx.log("No active scene.", "warn");

          return null;
        }

        const materials = new Map();

        const usage = new Map();

        const textures = new Set();

        scene.traverse((object) => {
          const list = Array.isArray(object.material)
            ? object.material
            : object.material
              ? [object.material]
              : [];

          for (const material of list) {
            if (!material) {
              continue;
            }

            materials.set(material.uuid, material);

            usage.set(material.uuid, (usage.get(material.uuid) || 0) + 1);

            for (const key of Object.keys(material)) {
              const value = material[key];

              if (value?.isTexture) {
                textures.add(value);
              }
            }
          }
        });

        const signatures = new Map();

        for (const material of materials.values()) {
          const key = fingerprint(material);

          if (!signatures.has(key)) {
            signatures.set(key, []);
          }

          signatures.get(key).push(material);
        }

        const duplicateGroups = Array.from(signatures.values()).filter(
          (group) => group.length > 1,
        );

        let singleUse = 0;

        for (const count of usage.values()) {
          if (count === 1) {
            singleUse += 1;
          }
        }

        const materialWarn =
          materials.size > Number(ctx.pref("materialWarn", 250));

        const duplicateWarn =
          ctx.pref("duplicateWarn", true) && duplicateGroups.length > 0;

        const report = {
          materials: materials.size,

          textures: textures.size,

          singleUse,

          duplicateGroups,
        };

        ctx.log(
          `Material audit: ${materials.size} materials, ${textures.size} textures, ${duplicateGroups.length} duplicate group(s).`,
          materialWarn || duplicateWarn ? "warn" : "info",
          {
            singleUse,

            duplicates: duplicateGroups.slice(0, 40).map((group) =>
              group.map((material) => ({
                name: material.name || material.type,

                uuid: material.uuid,
              })),
            ),
          },
        );

        ctx.dispatch("sm:addon-material-audit-report", {
          report,
        });

        return report;
      };

      return {
        onEnable() {
          if (ctx.pref("scanOnLoad", false)) {
            ctx.onWindow("sm:project-loaded", audit);

            ctx.onWindow("sm:scene-loaded", audit);
          }
        },

        commands: {
          audit,
        },
      };
    },
  );
})();
