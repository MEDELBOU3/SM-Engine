// engine/settings/addons/builtins/AssetValidatorAddon.js
//
// SM Engine — Asset Validator
//
(function () {
  "use strict";

  const registry = window.SMAddonRegistry;

  if (!registry) {
    console.error("[AssetValidatorAddon] SMAddonRegistry missing.");

    return;
  }

  registry.register(
    {
      id: "sm.asset-validator",

      name: "Asset Validator",

      version: "1.0.0",

      author: "SM Engine",

      category: "Assets",

      icon: "fa-solid fa-boxes-stacked",

      builtIn: true,

      experimental: false,

      defaultEnabled: false,

      description:
        "Checks geometry and texture resources used by the active scene for oversized or suspicious assets.",

      capabilities: ["scene:read", "assets:read", "console:write"],

      preferences: [
        {
          id: "scanOnLoad",

          label: "Scan on Project Load",

          type: "boolean",

          default: false,
        },

        {
          id: "maxTextureSize",

          label: "Maximum Texture Dimension",

          type: "select",

          default: "4096",

          options: ["2048", "4096", "8192"],
        },

        {
          id: "maxVertices",

          label: "Vertex Warning Threshold",

          type: "number",

          default: 500000,

          min: 10000,

          max: 5000000,

          step: 10000,
        },
      ],

      commands: [
        {
          id: "scan",

          label: "Validate Assets",

          description: "Scan scene geometry and texture resources.",
        },
      ],
    },

    (ctx) => {
      const textureSize = (texture) => {
        const image = texture?.image || texture?.source?.data;

        return {
          width: Number(
            image?.videoWidth || image?.naturalWidth || image?.width || 0,
          ),

          height: Number(
            image?.videoHeight || image?.naturalHeight || image?.height || 0,
          ),
        };
      };

      const collectTextures = (material, output) => {
        if (!material) {
          return;
        }

        const materials = Array.isArray(material) ? material : [material];

        for (const current of materials) {
          if (!current) {
            continue;
          }

          for (const key of Object.keys(current)) {
            const value = current[key];

            if (value?.isTexture) {
              output.add(value);
            }
          }
        }
      };

      const scan = () => {
        const scene = ctx.scene;

        if (!scene) {
          ctx.log("No active scene.", "warn");

          return null;
        }

        const maxTexture = Number(ctx.pref("maxTextureSize", "4096")) || 4096;

        const maxVertices = Number(ctx.pref("maxVertices", 500000));

        const textures = new Set();

        const issues = [];

        let meshes = 0;
        let vertices = 0;
        let indexedMeshes = 0;

        scene.traverse((object) => {
          if (!object.isMesh) {
            return;
          }

          meshes += 1;

          const geometry = object.geometry;

          if (!geometry) {
            issues.push({
              kind: "missing-geometry",

              name: object.name || object.type,

              uuid: object.uuid,
            });

            return;
          }

          const position = geometry?.attributes?.position;

          const count = Number(position?.count || 0);

          vertices += count;

          if (geometry.index) {
            indexedMeshes += 1;
          }

          if (count > maxVertices) {
            issues.push({
              kind: "dense-geometry",

              name: object.name || object.type,

              uuid: object.uuid,

              vertices: count,
            });
          }

          collectTextures(object.material, textures);
        });

        for (const texture of textures) {
          const size = textureSize(texture);

          if (!size.width || !size.height) {
            issues.push({
              kind: "texture-no-image",

              name: texture.name || texture.uuid,

              uuid: texture.uuid,
            });
          }

          if (Math.max(size.width, size.height) > maxTexture) {
            issues.push({
              kind: "oversized-texture",

              name: texture.name || texture.uuid,

              uuid: texture.uuid,

              width: size.width,

              height: size.height,

              maximum: maxTexture,
            });
          }
        }

        const counts = {};

        for (const issue of issues) {
          counts[issue.kind] = (counts[issue.kind] || 0) + 1;
        }

        const report = {
          meshes,
          vertices,
          indexedMeshes,

          textures: textures.size,

          issueCount: issues.length,

          counts,
          issues,
        };

        ctx.log(
          `Asset validation: ${meshes} meshes, ${textures.size} textures, ${issues.length} issue(s).`,
          issues.length ? "warn" : "info",
          {
            vertices,
            indexedMeshes,
            counts,

            sample: issues.slice(0, 80),
          },
        );

        ctx.dispatch("sm:addon-asset-validation-report", {
          report,
        });

        return report;
      };

      return {
        onEnable() {
          if (ctx.pref("scanOnLoad", false)) {
            ctx.onWindow("sm:project-loaded", scan);

            ctx.onWindow("sm:scene-loaded", scan);
          }
        },

        commands: {
          scan,
        },
      };
    },
  );
})();
