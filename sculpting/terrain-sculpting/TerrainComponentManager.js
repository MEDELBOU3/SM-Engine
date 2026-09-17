// sculpting/terrain-sculpting/TerrainComponentManager.js

(() => {
  const NS = window.TerrainSculpting;

  if (!NS?.TerrainComponent) {
    throw new Error(
      "TerrainComponent.js must load before TerrainComponentManager.js",
    );
  }

  class TerrainComponentManager {
    constructor({ terrainData, landscape, material }) {
      this.data = terrainData;
      this.landscape = landscape;
      this.material = material;
      this.components = new Map();

      if (this.landscape) {
        this.landscape.userData =
          this.landscape.userData || {};

        this.landscape.userData.terrainComponentManager =
          this;
      }

      NS.activeComponentManager = this;
    }

    key(x, z) {
      return `${x}:${z}`;
    }

    _markCollisionSurface(mesh) {
      if (!mesh?.isMesh) return;

      mesh.userData = mesh.userData || {};
      mesh.userData.isTerrain = true;
      mesh.userData.isTerrainComponent = true;
      mesh.userData.terrainSurface = true;
      mesh.userData.collisionEnabled = true;
      mesh.userData.collisionSurface = true;
      mesh.userData.horizontalBlocking = false;
      mesh.userData.collisionLayer =
        mesh.userData.collisionLayer || "world-static";
      mesh.userData.bodyType = "static";
      mesh.userData.physicsShape = "mesh";
    }

    _notifyCollisionChanged({
      components = [],
      region = null,
      reason = "component-update",
    } = {}) {
      const meshes = components.length
        ? components
            .map((component) => component?.mesh)
            .filter(Boolean)
        : this.getRaycastMeshes();

      meshes.forEach((mesh) => {
        this._markCollisionSurface(mesh);
        mesh.geometry?.computeBoundingBox?.();
        mesh.geometry?.computeBoundingSphere?.();
        mesh.updateWorldMatrix?.(true, false);
      });

      if (
        NS.surfaceQuery?.notifyTerrainDeformed &&
        this.landscape
      ) {
        NS.surfaceQuery.notifyTerrainDeformed({
          terrain: this.landscape,
          region,
          reason,
        });
      } else {
        window.dispatchEvent(
          new CustomEvent("sm:terrain-deformed", {
            detail: {
              terrain: this.landscape,
              meshes,
              region,
              reason,
            },
          }),
        );
      }
    }

    build() {
      this.disposeComponents();

      for (let z = 0; z < this.data.componentsZ; z++) {
        for (let x = 0; x < this.data.componentsX; x++) {
          const component = new NS.TerrainComponent({
            componentX: x,
            componentZ: z,
            terrainData: this.data,
            material: this.material,
          });

          this.components.set(
            this.key(x, z),
            component,
          );

          component.mesh.frustumCulled = true;
          component.mesh.visible = true;
          this._markCollisionSurface(component.mesh);
          this.landscape.add(component.mesh);
        }
      }

      this.landscape.userData =
        this.landscape.userData || {};
      this.landscape.userData.isTerrain = true;
      this.landscape.userData.terrainSurface = true;
      this.landscape.userData.terrainComponentManager =
        this;

      NS.activeComponentManager = this;
      NS.surfaceQuery?.registerTerrain?.(
        this.landscape,
      );

      return this;
    }

    get(x, z) {
      return this.components.get(this.key(x, z)) || null;
    }

    getComponentForGrid(gx, gz) {
      const q = this.data.quadsPerComponent;

      const x = Math.min(
        this.data.componentsX - 1,
        Math.max(0, Math.floor(gx / q)),
      );

      const z = Math.min(
        this.data.componentsZ - 1,
        Math.max(0, Math.floor(gz / q)),
      );

      return this.get(x, z);
    }

    getComponentsInGridRegion(minGX, maxGX, minGZ, maxGZ) {
      const result = [];

      for (const component of this.components.values()) {
        if (component.overlapsGridRegion(minGX, maxGX, minGZ, maxGZ)) {
          result.push(component);
        }
      }

      return result;
    }

    updateRegion(minGX, maxGX, minGZ, maxGZ) {
      minGX = Math.max(0, Math.floor(minGX) - 1);

      maxGX = Math.min(
        this.data.resolutionX - 1,
        Math.ceil(maxGX) + 1,
      );

      minGZ = Math.max(0, Math.floor(minGZ) - 1);

      maxGZ = Math.min(
        this.data.resolutionZ - 1,
        Math.ceil(maxGZ) + 1,
      );

      const affected = this.getComponentsInGridRegion(
        minGX,
        maxGX,
        minGZ,
        maxGZ,
      );

      affected.forEach((component) => {
        component.updateGeometry();
        this._markCollisionSurface(component.mesh);
      });

      this._notifyCollisionChanged({
        components: affected,
        region: {
          minGX,
          maxGX,
          minGZ,
          maxGZ,
        },
        reason: "component-region",
      });
    }

    syncAll() {
      for (const component of this.components.values()) {
        component.updateGeometry();
        this._markCollisionSurface(component.mesh);
      }

      this._notifyCollisionChanged({
        reason: "component-sync-all",
      });
    }

    refreshAfterExternalDeformation() {
      for (const component of this.components.values()) {
        component.refreshAfterExternalDeformation?.() ||
          component.updateGeometry();

        this._markCollisionSurface(component.mesh);
      }

      this.landscape.userData =
        this.landscape.userData || {};

      this.landscape.userData.waterDeformed = true;
      this.landscape.userData.waterDeformationVersion =
        (this.landscape.userData.waterDeformationVersion || 0) + 1;

      this._notifyCollisionChanged({
        reason: "external-deformation",
      });

      return this;
    }

    getRaycastMeshes() {
      return Array.from(
        this.components.values(),
        (component) => component.mesh,
      ).filter(Boolean);
    }

    disposeComponents() {
      for (const component of this.components.values()) {
        component.dispose();
      }

      this.components.clear();
    }

    dispose() {
      this.disposeComponents();

      if (
        NS.activeComponentManager === this
      ) {
        NS.activeComponentManager = null;
      }

      if (
        this.landscape?.userData
          ?.terrainComponentManager === this
      ) {
        delete this.landscape.userData
          .terrainComponentManager;
      }
    }
  }

  NS.TerrainComponentManager = TerrainComponentManager;
  window.TerrainComponentManager = TerrainComponentManager;
})();
