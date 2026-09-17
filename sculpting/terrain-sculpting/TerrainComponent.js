// sculpting/terrain-sculpting/TerrainComponent.js

(() => {
  const NS = window.TerrainSculpting;

  if (!NS?.TerrainData) {
    throw new Error("TerrainData.js must load before TerrainComponent.js");
  }

  // Helper to check current workspace mode safely
  function getActiveWorkspaceMode() {
    if (typeof window !== "undefined") {
      if (window.workspaceManager?.currentMode) {
        return String(window.workspaceManager.currentMode).toUpperCase();
      }
      try {
        const saved = localStorage.getItem("sm_workspace_mode");
        if (saved) return String(saved).toUpperCase();
      } catch (e) {}
    }
    return "FILM";
  }

  function isTerrainWorkspace(modeOverride = null) {
    const mode = String(modeOverride || getActiveWorkspaceMode()).toUpperCase();
    // Terrain is isolated to the Terrain Sculpting workspace.
    return mode === "TERRAIN";
  }

  class TerrainComponent {
    constructor({ componentX, componentZ, terrainData, material }) {
      this.x = componentX;
      this.z = componentZ;
      this.data = terrainData;
      this.material = material;
      this.quads = terrainData.quadsPerComponent;
      this.startGX = this.x * this.quads;
      this.startGZ = this.z * this.quads;

      this.mesh = this._buildMesh();
    }

    _normalAt(gx, gz, target) {
      const d = this.data;

      const left = d.getHeight(d.clampGridX(gx - 1), gz) * d.heightScale;
      const right = d.getHeight(d.clampGridX(gx + 1), gz) * d.heightScale;
      const down = d.getHeight(gx, d.clampGridZ(gz - 1)) * d.heightScale;
      const up = d.getHeight(gx, d.clampGridZ(gz + 1)) * d.heightScale;

      target
        .set(
          -(right - left) / (2 * d.quadSize),
          1,
          -(up - down) / (2 * d.quadSize),
        )
        .normalize();

      return target;
    }

    _buildMesh() {
      const q = this.quads;
      const side = q + 1;
      const vertexCount = side * side;

      const positions = new Float32Array(vertexCount * 3);
      const normals = new Float32Array(vertexCount * 3);
      const uvs = new Float32Array(vertexCount * 2);
      const indices = new Uint32Array(q * q * 6);

      let vp = 0;
      let uvp = 0;
      let np = 0;
      const n = new THREE.Vector3();

      for (let lz = 0; lz <= q; lz++) {
        for (let lx = 0; lx <= q; lx++) {
          const gx = this.startGX + lx;
          const gz = this.startGZ + lz;

          positions[vp++] = lx * this.data.quadSize;
          positions[vp++] = this.data.getHeight(gx, gz) * this.data.heightScale;
          positions[vp++] = lz * this.data.quadSize;

          this._normalAt(gx, gz, n);
          normals[np++] = n.x;
          normals[np++] = n.y;
          normals[np++] = n.z;

          uvs[uvp++] = gx / this.data.quadsX;
          uvs[uvp++] = 1 - gz / this.data.quadsZ;
        }
      }

      let ip = 0;
      for (let z = 0; z < q; z++) {
        for (let x = 0; x < q; x++) {
          const a = z * side + x;
          const b = a + 1;
          const c = a + side;
          const d = c + 1;

          indices[ip++] = a;
          indices[ip++] = c;
          indices[ip++] = b;

          indices[ip++] = b;
          indices[ip++] = c;
          indices[ip++] = d;
        }
      }

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
      geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
      geometry.setIndex(new THREE.BufferAttribute(indices, 1));
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();

      const mesh = new THREE.Mesh(geometry, this.material);

      mesh.name = `TerrainComponent_${this.x}_${this.z}`;
      mesh.position.set(
        this.data.localX(this.startGX),
        0,
        this.data.localZ(this.startGZ),
      );

      mesh.castShadow = true;
      mesh.receiveShadow = true;
      // A landscape is split into components precisely so Three.js can skip
      // the parts outside the camera. Keeping every component unculled makes
      // an otherwise hidden/off-screen terrain consume GPU time every frame.
      mesh.frustumCulled = true;

      mesh.userData.isTerrainComponent = true;
      mesh.userData.isTerrainMesh = true;
      mesh.userData.workspaceOnly = "TERRAIN";
      mesh.userData.componentX = this.x;
      mesh.userData.componentZ = this.z;
      mesh.userData.terrainComponent = this;
      mesh.userData.selectable = false;
      mesh.userData.ignoreInHierarchy = true;
      mesh.userData.ignoreInTimeline = true;

      mesh.visible = isTerrainWorkspace();

      return mesh;
    }

    updateGeometry() {
      const position = this.mesh.geometry.attributes.position;
      const normal = this.mesh.geometry.attributes.normal;
      const n = new THREE.Vector3();

      const q = this.quads;
      const side = q + 1;

      for (let lz = 0; lz <= q; lz++) {
        for (let lx = 0; lx <= q; lx++) {
          const gx = this.startGX + lx;
          const gz = this.startGZ + lz;
          const index = lz * side + lx;

          position.setY(
            index,
            this.data.getHeight(gx, gz) * this.data.heightScale,
          );

          this._normalAt(gx, gz, n);

          normal.setXYZ(index, n.x, n.y, n.z);
        }
      }

      position.needsUpdate = true;
      normal.needsUpdate = true;

      this.mesh.geometry.computeBoundingBox();
      this.mesh.geometry.computeBoundingSphere();
    }

    /**
     * Refresh hook used by terrain-aware systems (water, roads, erosion).
     * Keeping this on the component makes external deformation go through the
     * same geometry path as the native sculpt brushes.
     */
    refreshAfterExternalDeformation() {
      this.updateGeometry();
      this.mesh.geometry.attributes.position.needsUpdate = true;
      this.mesh.geometry.attributes.normal.needsUpdate = true;
      return this.mesh;
    }

    /**
     * Call this during workspace mode switching
     */
    syncVisibility(modeOverride = null) {
      const visible = isTerrainWorkspace(modeOverride);
      if (this.mesh) {
        this.mesh.visible = visible;
      }
      return visible;
    }

    overlapsGridRegion(minGX, maxGX, minGZ, maxGZ) {
      return !(
        maxGX < this.startGX ||
        minGX > this.startGX + this.quads ||
        maxGZ < this.startGZ ||
        minGZ > this.startGZ + this.quads
      );
    }

    dispose() {
      this.mesh.parent?.remove(this.mesh);
      this.mesh.geometry?.dispose?.();
    }
  }

  NS.TerrainComponent = TerrainComponent;
  window.TerrainComponent = TerrainComponent;
})();
