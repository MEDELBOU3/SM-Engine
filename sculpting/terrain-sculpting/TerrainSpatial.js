// sculpting/terrain-sculpting/TerrainSpatial.js

(() => {
  const NS = window.TerrainSculpting;

  const state = NS.state;

  function getContext() {
    const landscape = NS.getLandscape?.();

    const data = landscape?.userData?.terrainData;

    const manager = landscape?.userData?.componentManager;

    if (!landscape || !data || !manager) {
      return null;
    }

    return {
      landscape,
      data,
      manager,
    };
  }

  function getSymmetricIndex(index) {
    const ctx = getContext();

    if (!ctx) {
      return -1;
    }

    const { data } = ctx;

    const { x, z } = data.coords(index);

    const sx = state.symmetryAxis === "x" ? data.resolutionX - 1 - x : x;

    const sz = state.symmetryAxis === "z" ? data.resolutionZ - 1 - z : z;

    return data.index(sx, sz);
  }

  function getNeighbors(index) {
    const ctx = getContext();

    if (!ctx) {
      return [];
    }

    const { data } = ctx;

    const { x, z } = data.coords(index);

    const neighbors = [];

    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dz === 0) {
          continue;
        }

        const nx = x + dx;

        const nz = z + dz;

        if (data.isValid(nx, nz)) {
          neighbors.push(data.index(nx, nz));
        }
      }
    }

    return neighbors;
  }

  function getNeighborAverageHeight(index, source = null) {
    const ctx = getContext();

    if (!ctx) {
      return 0;
    }

    const heights = source || ctx.data.heights;

    const neighbors = getNeighbors(index);

    if (!neighbors.length) {
      return heights[index] || 0;
    }

    let total = 0;

    neighbors.forEach((neighbor) => {
      total += heights[neighbor];
    });

    return total / neighbors.length;
  }

  function getLowestNeighbor(index, source = null) {
    const ctx = getContext();

    if (!ctx) {
      return null;
    }

    const heights = source || ctx.data.heights;

    let lowest = null;

    getNeighbors(index).forEach((neighbor) => {
      const y = heights[neighbor];

      if (!lowest || y < lowest.y) {
        lowest = {
          index: neighbor,

          y,
        };
      }
    });

    return lowest;
  }

  function getBrushGridBounds(hitPoint, radius) {
    const ctx = getContext();

    if (!ctx || !hitPoint || radius <= 0) {
      return null;
    }

    const local = ctx.landscape.worldToLocal(hitPoint.clone());

    const center = ctx.data.localToGrid(local.x, local.z);

    const gridRadius = radius / ctx.data.quadSize;

    return {
      local,

      minGX: Math.max(
        0,

        Math.floor(center.x - gridRadius),
      ),

      maxGX: Math.min(
        ctx.data.resolutionX - 1,

        Math.ceil(center.x + gridRadius),
      ),

      minGZ: Math.max(
        0,

        Math.floor(center.z - gridRadius),
      ),

      maxGZ: Math.min(
        ctx.data.resolutionZ - 1,

        Math.ceil(center.z + gridRadius),
      ),
    };
  }

  function getVerticesInBrushRadius(hitPoint, radius) {
    const ctx = getContext();

    const bounds = getBrushGridBounds(hitPoint, radius);

    if (!ctx || !bounds) {
      return [];
    }

    const { data } = ctx;

    const vertices = [];

    const radiusSq = radius * radius;

    for (let gz = bounds.minGZ; gz <= bounds.maxGZ; gz++) {
      const z = data.localZ(gz);

      for (let gx = bounds.minGX; gx <= bounds.maxGX; gx++) {
        const x = data.localX(gx);

        const dx = x - bounds.local.x;

        const dz = z - bounds.local.z;

        const distanceSq = dx * dx + dz * dz;

        if (distanceSq > radiusSq) {
          continue;
        }

        const index = data.index(gx, gz);

        vertices.push({
          index,

          gx,

          gz,

          x,

          z,

          y: data.heights[index],

          distance: Math.sqrt(distanceSq),
        });
      }
    }

    return vertices;
  }

  NS.spatial = {
    getContext,

    getSymmetricIndex,

    getNeighbors,

    getNeighborAverageHeight,

    getLowestNeighbor,

    getBrushGridBounds,

    getVerticesInBrushRadius,
  };
})();
