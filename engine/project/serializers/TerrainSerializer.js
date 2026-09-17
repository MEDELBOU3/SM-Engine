// engine/project/serializers/TerrainSerializer.js
// Saves/restores SM Engine component-based Terrain landscapes.
// Requires SMProjectStorage.js at runtime.
// Load AFTER TerrainGenerator.js and BEFORE SMProjectSerializer.js.

(() => {
  "use strict";

  const FORMAT = "SM_TERRAIN";
  const VERSION = 1;

  const DEFAULT_META_PATH =
    "Terrain/Landscape.smterrain";

  const DEFAULT_HEIGHT_PATH =
    "Terrain/Landscape.height.bin";

  function getStorage() {
    const storage =
      window.smProjectStorage;

    if (!storage) {
      throw new Error(
        "[SMTerrainSerializer] smProjectStorage is unavailable.",
      );
    }

    return storage;
  }

  function getTerrainNamespace() {
    return (
      window.TerrainSculpting ||
      null
    );
  }

  function getLandscape(
    explicit = null,
  ) {
    if (explicit) {
      return explicit;
    }

    const NS =
      getTerrainNamespace();

    return (
      NS?.getLandscape?.() ||
      NS?.state
        ?.activeLandscape ||
      window.terrain ||
      null
    );
  }

  function serializeVector3(
    value,
    fallback = [0, 0, 0],
  ) {
    if (!value) {
      return [...fallback];
    }

    return [
      Number(value.x) || 0,
      Number(value.y) || 0,
      Number(value.z) || 0,
    ];
  }

  function serializeQuaternion(
    value,
  ) {
    if (!value) {
      return [0, 0, 0, 1];
    }

    return [
      Number(value.x) || 0,
      Number(value.y) || 0,
      Number(value.z) || 0,
      Number.isFinite(
        Number(value.w),
      )
        ? Number(value.w)
        : 1,
    ];
  }

  function copySettings(
    landscape,
    data,
  ) {
    const settings = {
      ...(
        landscape.userData
          ?.settings || {}
      ),
    };

    const assignNumber = (
      key,
      value,
    ) => {
      const number =
        Number(value);

      if (
        Number.isFinite(number)
      ) {
        settings[key] =
          number;
      }
    };

    assignNumber(
      "sectionSize",
      data?.sectionSize,
    );

    assignNumber(
      "sectionsPerComponent",
      data
        ?.sectionsPerComponent,
    );

    assignNumber(
      "componentsX",
      data?.componentsX,
    );

    assignNumber(
      "componentsZ",
      data?.componentsZ,
    );

    assignNumber(
      "quadSize",
      data?.quadSize,
    );

    assignNumber(
      "heightScale",
      data?.heightScale,
    );

    if (
      landscape.userData
        ?.limitPlayerToTerrain !==
      undefined
    ) {
      settings.limitPlayerToTerrain =
        !!landscape.userData
          .limitPlayerToTerrain;
    }

    return settings;
  }

  class SMTerrainSerializer {
    constructor({
      metadataPath =
        DEFAULT_META_PATH,
      heightPath =
        DEFAULT_HEIGHT_PATH,
    } = {}) {
      this.metadataPath =
        metadataPath;

      this.heightPath =
        heightPath;
    }

    hasTerrain(
      landscape = null,
    ) {
      const terrain =
        getLandscape(
          landscape,
        );

      return !!(
        terrain &&
        terrain.userData
          ?.terrainData?.heights
      );
    }

    capture(
      landscape = null,
    ) {
      const terrain =
        getLandscape(
          landscape,
        );

      if (!terrain) {
        return null;
      }

      const data =
        terrain.userData
          ?.terrainData;

      if (
        !data?.heights
      ) {
        throw new Error(
          "[SMTerrainSerializer] Landscape has no TerrainData.heights.",
        );
      }

      const settings =
        copySettings(
          terrain,
          data,
        );

      const heights =
        data.heights instanceof
        Float32Array
          ? new Float32Array(
              data.heights,
            )
          : new Float32Array(
              data.heights || [],
            );

      const metadata = {
        format: FORMAT,
        version: VERSION,

        name:
          terrain.name ||
          "Terrain_Mesh",

        settings,

        transform: {
          position:
            serializeVector3(
              terrain.position,
            ),

          quaternion:
            serializeQuaternion(
              terrain.quaternion,
            ),

          scale:
            serializeVector3(
              terrain.scale,
              [1, 1, 1],
            ),
        },

        data: {
          resolutionX:
            Number(
              data.resolutionX,
            ) || 0,

          resolutionZ:
            Number(
              data.resolutionZ,
            ) || 0,

          componentsX:
            Number(
              data.componentsX,
            ) || 0,

          componentsZ:
            Number(
              data.componentsZ,
            ) || 0,

          quadsPerComponent:
            Number(
              data
                .quadsPerComponent,
            ) || 0,

          quadsX:
            Number(
              data.quadsX,
            ) || 0,

          quadsZ:
            Number(
              data.quadsZ,
            ) || 0,

          quadSize:
            Number(
              data.quadSize,
            ) || 1,

          heightScale:
            Number(
              data.heightScale,
            ) || 1,

          version:
            Number(
              data.version,
            ) || 0,

          heightCount:
            heights.length,
        },

        material: {
          theme:
            settings.theme ||
            "realistic",

          roughness:
            Number(
              terrain.userData
                ?.sharedMaterial
                ?.roughness,
            ),

          metalness:
            Number(
              terrain.userData
                ?.sharedMaterial
                ?.metalness,
            ),
        },

        playerLimits: {
          enabled:
            terrain.userData
              ?.limitPlayerToTerrain !==
            false,

          margin:
            Number(
              terrain.userData
                ?.terrainLimitMargin ??
                settings
                  .terrainLimitMargin ??
                0.45,
            ),

          thickness:
            Number(
              settings
                .terrainLimitThickness ??
                1,
            ),

          verticalPadding:
            Number(
              settings
                .terrainLimitVerticalPadding ??
                2048,
            ),
        },

        binary: {
          type:
            "Float32Array",
          path:
            this.heightPath,
          byteLength:
            heights.byteLength,
          length:
            heights.length,
        },

        savedAt:
          new Date()
            .toISOString(),
      };

      return {
        metadata,
        heights,
        landscape:
          terrain,
      };
    }

    async save(
      projectId,
      {
        landscape = null,
        metadataPath =
          this.metadataPath,
        heightPath =
          this.heightPath,
        touchProject = true,
      } = {},
    ) {
      const captured =
        this.capture(
          landscape,
        );

      if (!captured) {
        return {
          saved: false,
          reason:
            "no-terrain",
        };
      }

      const storage =
        getStorage();

      captured.metadata
        .binary.path =
        heightPath;

      await storage.writeFloat32Array(
        projectId,
        heightPath,
        captured.heights,
        {
          touchProject:
            false,

          metadata: {
            format:
              "SM_TERRAIN_HEIGHT",
            terrainMetadataPath:
              metadataPath,
          },
        },
      );

      await storage.writeJSON(
        projectId,
        metadataPath,
        captured.metadata,
        {
          mimeType:
            "application/x-sm-terrain+json",

          touchProject:
            false,
        },
      );

      if (touchProject) {
        await storage.touchProject(
          projectId,
        );
      }

      window.dispatchEvent(
        new CustomEvent(
          "sm:terrain-saved",
          {
            detail: {
              projectId,
              metadataPath,
              heightPath,
              terrain:
                captured.landscape,
            },
          },
        ),
      );

      return {
        saved: true,
        projectId,
        metadataPath,
        heightPath,
        metadata:
          captured.metadata,
      };
    }

    async read(
      projectId,
      metadataPath =
        this.metadataPath,
    ) {
      const storage =
        getStorage();

      const metadata =
        await storage.readJSON(
          projectId,
          metadataPath,
          null,
        );

      if (!metadata) {
        return null;
      }

      if (
        metadata.format !==
        FORMAT
      ) {
        throw new Error(
          `[SMTerrainSerializer] Unsupported terrain format: ${metadata.format}`,
        );
      }

      const heightPath =
        metadata.binary
          ?.path ||
        this.heightPath;

      const heights =
        await storage.readFloat32Array(
          projectId,
          heightPath,
        );

      if (!heights) {
        throw new Error(
          `[SMTerrainSerializer] Height data missing: ${heightPath}`,
        );
      }

      if (
        Number.isFinite(
          Number(
            metadata.binary
              ?.length,
          ),
        ) &&
        Number(
          metadata.binary
            .length,
        ) !== heights.length
      ) {
        console.warn(
          "[SMTerrainSerializer] Stored height count differs from metadata.",
          {
            expected:
              metadata.binary
                .length,
            actual:
              heights.length,
          },
        );
      }

      return {
        metadata,
        heights,
        metadataPath,
        heightPath,
      };
    }

    async load(
      projectId,
      {
        metadataPath =
          this.metadataPath,
        select = true,
        rebuildLimits = true,
      } = {},
    ) {
      const payload =
        await this.read(
          projectId,
          metadataPath,
        );

      if (!payload) {
        return {
          loaded: false,
          reason:
            "terrain-file-not-found",
        };
      }

      const NS =
        getTerrainNamespace();

      if (
        !NS?.generator
          ?.createLandscape
      ) {
        throw new Error(
          "[SMTerrainSerializer] Terrain generator is unavailable.",
        );
      }

      const metadata =
        payload.metadata;

      const transform =
        metadata.transform ||
        {};

      const position =
        Array.isArray(
          transform.position,
        )
          ? transform.position
          : [0, 0, 0];

      const settings = {
        ...(
          metadata.settings ||
          {}
        ),

        /*
         * Create a flat terrain first. Stored height data is the source of truth;
         * regenerating procedural noise here would be wasted work.
         */
        initialMode:
          "flat",

        locationX:
          Number(
            position[0],
          ) || 0,

        locationY:
          Number(
            position[1],
          ) || 0,

        locationZ:
          Number(
            position[2],
          ) || 0,

        limitPlayerToTerrain:
          false,
      };

      const landscape =
        NS.generator
          .createLandscape(
            settings,
          );

      if (!landscape) {
        throw new Error(
          "[SMTerrainSerializer] createLandscape() failed.",
        );
      }

      const data =
        landscape.userData
          ?.terrainData;

      if (
        !data?.heights
      ) {
        throw new Error(
          "[SMTerrainSerializer] Loaded landscape has no TerrainData.",
        );
      }

      if (
        data.heights.length !==
        payload.heights.length
      ) {
        NS.generator
          .disposeLandscape?.(
            landscape,
          );

        throw new Error(
          `[SMTerrainSerializer] Terrain resolution mismatch. Created ${data.heights.length} heights, saved terrain contains ${payload.heights.length}.`,
        );
      }

      data.heights.set(
        payload.heights,
      );

      data.version =
        Math.max(
          Number(
            data.version,
          ) || 0,
          Number(
            metadata.data
              ?.version,
          ) || 0,
        ) + 1;

      landscape.userData
        .heightData =
        data.heights;

      landscape.userData
        .settings = {
        ...settings,
        ...(
          metadata.settings ||
          {}
        ),
      };

      const quaternion =
        transform.quaternion;

      if (
        Array.isArray(
          quaternion,
        ) &&
        quaternion.length >= 4
      ) {
        landscape.quaternion.set(
          Number(
            quaternion[0],
          ) || 0,
          Number(
            quaternion[1],
          ) || 0,
          Number(
            quaternion[2],
          ) || 0,
          Number.isFinite(
            Number(
              quaternion[3],
            ),
          )
            ? Number(
                quaternion[3],
              )
            : 1,
        );
      }

      const scale =
        transform.scale;

      if (
        Array.isArray(scale) &&
        scale.length >= 3
      ) {
        landscape.scale.set(
          Number(
            scale[0],
          ) || 1,
          Number(
            scale[1],
          ) || 1,
          Number(
            scale[2],
          ) || 1,
        );
      }

      landscape
        .userData
        .componentManager
        ?.syncAll?.();

      landscape
        .updateMatrixWorld?.(
          true,
        );

      const limits =
        metadata.playerLimits ||
        {};

      const limitsEnabled =
        limits.enabled !==
        false &&
        metadata.settings
          ?.limitPlayerToTerrain !==
        false;

      landscape.userData
        .limitPlayerToTerrain =
        limitsEnabled;

      if (
        rebuildLimits &&
        limitsEnabled
      ) {
        NS.generator
          .createTerrainLimits?.(
            landscape,
            {
              margin:
                Number(
                  limits.margin,
                ) || 0.45,

              thickness:
                Number(
                  limits.thickness,
                ) || 1,

              verticalPadding:
                Number(
                  limits
                    .verticalPadding,
                ) || 2048,
            },
          );
      }

      NS.surfaceQuery
        ?.registerTerrain?.(
          landscape,
        );

      NS.surfaceQuery
        ?.notifyTerrainDeformed?.({
          terrain:
            landscape,
          reason:
            "project-load",
        });

      if (select) {
        window.selectedObject =
          landscape;

        window.transformControls
          ?.attach?.(
            landscape,
          );
      }

      try {
        window.hierarchyManager
          ?.renderAll?.();

        window.updateHierarchy?.();
      } catch (_) {}

      window.dispatchEvent(
        new CustomEvent(
          "sm:terrain-loaded",
          {
            detail: {
              projectId,
              terrain:
                landscape,
              metadata,
            },
          },
        ),
      );

      return {
        loaded: true,
        terrain:
          landscape,
        metadata,
      };
    }

    async exists(
      projectId,
      metadataPath =
        this.metadataPath,
    ) {
      return getStorage()
        .exists(
          projectId,
          metadataPath,
        );
    }
  }

  SMTerrainSerializer.FORMAT =
    FORMAT;

  SMTerrainSerializer.VERSION =
    VERSION;

  SMTerrainSerializer.DEFAULT_META_PATH =
    DEFAULT_META_PATH;

  SMTerrainSerializer.DEFAULT_HEIGHT_PATH =
    DEFAULT_HEIGHT_PATH;

  window.SMTerrainSerializer =
    SMTerrainSerializer;

  window.smTerrainSerializer =
    window.smTerrainSerializer ||
    new SMTerrainSerializer();
})();